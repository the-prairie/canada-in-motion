import copy
import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from refresh_economy import atomic_write, observation_map, parse_gdp, parse_gdp_activity, validate_economy, validate_finance_table, FINANCE_ROWS, REGIONS

DATA = json.loads((Path(__file__).resolve().parents[1]/'data/economy.json').read_text())


def activity_rows(years=(2023, 2024, 2025)):
    return [{'REF_DATE': str(year), 'GEO': name, 'Prices': 'Chained (2017) dollars',
             'North American Industry Classification System (NAICS)': label,
             'UOM': 'Dollars', 'SCALAR_FACTOR': 'millions', 'VALUE': str(value + year - 2023),
             'STATUS': '', 'VECTOR': 'v123'}
            for name in REGIONS.values() for year in years
            for label, value in [('All industries [T001]', 100), ('Energy sector [T016]', 20)]]


def gdp_archive(rows):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w') as zipped:
        zipped.writestr('36100711.csv', stream.getvalue())
    return archive.getvalue()


class EconomyTests(unittest.TestCase):
    def test_finance_table_accepts_footnote_but_rejects_changed_calibration(self):
        rows = ''.join('<tr><th>Metric</th>'+''.join(f'<td>{n}</td>' for n in values)+'</tr>' for values in FINANCE_ROWS.values())
        html = ('Estimated Impact of a 10 per cent Increase in WTI<table>'+rows+'<tr><td colspan="5">Note: Estimates are rounded.</td></tr></table>').encode()
        validate_finance_table(html)
        with self.assertRaisesRegex(ValueError, 'calibration'):
            validate_finance_table(html.replace(b'<td>0.5</td>', b'<td>0.9</td>'))

    def test_published_snapshot_reconciles(self):
        validate_economy(DATA)
        self.assertEqual(len(DATA['gdp']['regions']),13)
        self.assertEqual(DATA['gdp']['year'],2022)
        self.assertEqual(DATA['gdpActivity']['year'], 2025)
        self.assertEqual(DATA['gdpActivity']['previousYear'], 2024)
        self.assertEqual(len(DATA['gdpActivity']['regions']), 13)
        alberta = next(row for row in DATA['gdpActivity']['regions'] if row['code'] == 'AB')
        self.assertEqual(alberta['energy'], 81627.5)
        self.assertEqual(alberta['previousEnergy'], 78855.7)
        self.assertAlmostEqual(alberta['energyGrowthPct'], 3.51502808294137)
        self.assertNotIn('sharePct', alberta)

    def test_duplicate_and_nonfinite_observations_fail(self):
        row = {'Region':'Alberta','Scenario':'Current Measures','Year':'2030','Variable':'Total','Value':'1'}
        with self.assertRaisesRegex(ValueError,'Duplicate'):
            observation_map([row,row],lambda r:True)
        with self.assertRaisesRegex(ValueError,'Invalid'):
            observation_map([row|{'Value':'nan'}],lambda r:True)

    def test_total_predicate_excludes_subsets_and_other_units(self):
        base = {'Region':'Alberta','Scenario':'Current Measures','Year':'2030','Unit':'Thousand Barrels per day'}
        rows = [base|{'Variable':'Total','Value':'100'},base|{'Variable':'(Upgraded Bitumen)','Value':'40'},base|{'Variable':'Total','Value':'15.9','Unit':'Thousand Cubic Metres per day'}]
        values = observation_map(rows,lambda r:r['Variable']=='Total' and r['Unit']=='Thousand Barrels per day')
        self.assertEqual(values[('AB','Current Measures',2030)],100)

    def test_gdp_chooses_common_available_year_not_latest_cube_endpoint(self):
        from refresh_economy import REGIONS
        import csv
        stream = io.StringIO()
        fields = ['REF_DATE','GEO','Prices','North American Industry Classification System (NAICS)','UOM','SCALAR_FACTOR','VALUE','STATUS','VECTOR']
        writer = csv.DictWriter(stream,fieldnames=fields); writer.writeheader()
        for name in REGIONS.values():
            for year in [2022,2025]:
                for label,value in [('All industries [T001]','100'),('Energy sector [T016]','20')]:
                    writer.writerow(dict(zip(fields,[year,name,'Current dollars',label,'Dollars','millions',value if year==2022 else '', '..' if year==2025 else '', 'v123'])))
        archive = io.BytesIO()
        with zipfile.ZipFile(archive,'w') as z:z.writestr('36100711.csv',stream.getvalue())
        result = parse_gdp(archive.getvalue())
        self.assertEqual(result['year'],2022)
        self.assertTrue(all(r['sharePct']==20 for r in result['regions']))

    def test_activity_uses_latest_complete_consecutive_years_and_keeps_revision_status(self):
        rows = activity_rows()
        for row in rows:
            if row['GEO'] == 'Alberta' and row['REF_DATE'] == '2024':
                row['STATUS'] = 'r'
            if row['GEO'] == 'Alberta' and row['REF_DATE'] == '2025':
                row['STATUS'] = 'p'
        result = parse_gdp_activity(gdp_archive(rows))
        alberta = next(row for row in result['regions'] if row['code'] == 'AB')
        self.assertEqual((result['year'], result['previousYear']), (2025, 2024))
        self.assertAlmostEqual(alberta['energyGrowthPct'], (22 / 21 - 1) * 100)
        self.assertAlmostEqual(alberta['totalGrowthPct'], (102 / 101 - 1) * 100)
        self.assertEqual(alberta['energyStatus'], 'p')
        self.assertEqual(alberta['previousEnergyStatus'], 'r')

    def test_activity_falls_back_for_one_missing_jurisdiction_and_skips_suppressed_numbers(self):
        for missing in [{'VALUE': '', 'STATUS': '..'}, {'VALUE': '22', 'STATUS': 'x'}]:
            with self.subTest(missing=missing):
                rows = activity_rows()
                rows[-1].update(missing)
                result = parse_gdp_activity(gdp_archive(rows))
                self.assertEqual((result['year'], result['previousYear']), (2024, 2023))
        with self.assertRaisesRegex(ValueError, 'consecutive common'):
            parse_gdp_activity(gdp_archive(activity_rows((2023, 2025))))

    def test_activity_zero_denominator_is_unavailable_and_decline_is_negative(self):
        rows = activity_rows((2024, 2025))
        for row in rows:
            if row['North American Industry Classification System (NAICS)'] != 'Energy sector [T016]':
                continue
            if row['GEO'] == 'Alberta' and row['REF_DATE'] == '2024':
                row['VALUE'] = '0'
            if row['GEO'] == 'Ontario' and row['REF_DATE'] == '2025':
                row['VALUE'] = '0'
        result = parse_gdp_activity(gdp_archive(rows))
        self.assertIsNone(next(row for row in result['regions'] if row['code'] == 'AB')['energyGrowthPct'])
        self.assertEqual(next(row for row in result['regions'] if row['code'] == 'ON')['energyGrowthPct'], -100)

    def test_activity_rejects_bad_units_scale_status_values_and_duplicate_observations(self):
        for mutation in [{'UOM': 'Percent'}, {'SCALAR_FACTOR': 'units'}, {'VALUE': 'nan'}, {'VALUE': 'inf'},
                         {'VALUE': '-1'}, {'STATUS': 'unexpected'}, {'VECTOR': ''}]:
            with self.subTest(mutation=mutation):
                rows = activity_rows()
                rows[-1].update(mutation)
                with self.assertRaises(ValueError):
                    parse_gdp_activity(gdp_archive(rows))
        rows = activity_rows()
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            parse_gdp_activity(gdp_archive(rows + [rows[-1]]))

    def test_activity_growth_and_provenance_are_validated_before_publishing(self):
        for mutation in [{'energyGrowthPct': 123}, {'previousEnergy': -1}, {'total': float('nan')},
                         {'previousEnergyStatus': 'x'}, {'totalVector': ''}]:
            with self.subTest(mutation=mutation):
                data = copy.deepcopy(DATA)
                data['gdpActivity']['regions'][0].update(mutation)
                with self.assertRaises(ValueError):
                    validate_economy(data)
        old_snapshot = copy.deepcopy(DATA)
        old_snapshot.pop('gdpActivity')
        validate_economy(old_snapshot)

    def test_atomic_write_preserves_previous_snapshot_on_invalid_data(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'economy.json'; target.write_text('previous valid snapshot')
            data=copy.deepcopy(DATA);data['gdp']['regions'][0]['energy']=-1
            with self.assertRaises(ValueError):atomic_write(data,target)
            self.assertEqual(target.read_text(),'previous valid snapshot')
            atomic_write(DATA,target)
            self.assertEqual(json.loads(target.read_text())['gdp']['year'],2022)

    def test_missing_source_and_broken_national_totals_fail(self):
        data=copy.deepcopy(DATA);data['sources'].pop()
        with self.assertRaises(ValueError):validate_economy(data)
        data=copy.deepcopy(DATA)
        series=next(m for m in data['metrics'] if m['id']=='electricity-generation')['series']
        next(s for s in series if s['region']=='CA')['values'][0]+=1000
        with self.assertRaisesRegex(ValueError,'reconcile'):validate_economy(data)


if __name__=='__main__':
    unittest.main()
