import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from refresh_economy import atomic_write, observation_map, parse_gdp, validate_economy, validate_finance_table, FINANCE_ROWS

DATA = json.loads((Path(__file__).resolve().parents[1]/'data/economy.json').read_text())


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
