"""Acquisition/model tests with exact published-style rounding and no network."""
import copy
import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
import refresh_income_paths as refresh


def fixture_rows():
    rows=[]
    for effect in refresh.EFFECTS:
        for scope in refresh.SCOPES:
            for metric,label in refresh.METRICS.items():
                values={'direct':0.670,'indirect':0.237,'simple':0.906,'induced':0.1,'total':1.006}
                rows.append({'REF_DATE':'2022','GEO':'Alberta','Industry':'Oil and gas extraction (except oil sands) [BS211110]',
                    'Multiplier type':refresh.EFFECTS[effect],'Geographical coverage':refresh.SCOPES[scope],
                    'Variable':label,'VALUE':str(values[effect]),'STATUS':'','VECTOR':f'v{100+len(rows)}',
                    'UOM':'Per million dollars of output' if metric=='jobs' else 'Per dollar of output',
                    'SCALAR_FACTOR':'units','DECIMALS':'3'})
    return rows


def archive(rows):
    stream=io.StringIO();writer=csv.DictWriter(stream,fieldnames=rows[0].keys());writer.writeheader();writer.writerows(rows)
    raw=io.BytesIO()
    with zipfile.ZipFile(raw,'w') as z:
        z.writestr('36100595.csv',stream.getvalue())
        z.writestr('36100595_MetaData.csv','Publisher metadata')
    return raw.getvalue()


class IncomePathRefreshTests(unittest.TestCase):
    def test_missing_combinations_are_unavailable_and_rounded_totals_are_preserved(self):
        years,rows=refresh.parse_rows(fixture_rows())
        self.assertEqual(years,[2022]);self.assertEqual(len(rows),130)
        ab=next(row for row in rows if row['region']=='AB' and row['industry']=='oil-gas')
        self.assertEqual(ab['effects']['simple']['canada']['gdp']['value'],0.906)
        on=next(row for row in rows if row['region']=='ON' and row['industry']=='oil-sands')
        self.assertEqual(on['effects']['simple']['canada']['gdp']['status'],'not-published')
        self.assertIsNone(on['effects']['simple']['canada']['gdp']['value'])

    def test_suppression_cannot_become_a_numeric_value(self):
        rows=fixture_rows();rows[0]['STATUS']='x';rows[0]['VALUE']='999'
        _,parsed=refresh.parse_rows(rows)
        ab=next(row for row in parsed if row['region']=='AB' and row['industry']=='oil-gas')
        self.assertEqual(ab['effects']['direct']['withinProvince']['gdp']['status'],'suppressed')
        self.assertIsNone(ab['effects']['direct']['withinProvince']['gdp']['value'])

    def test_fail_closed_on_changed_basis_duplicates_nonfinite_or_bad_reconciliation(self):
        changes=[('UOM','Percent'),('SCALAR_FACTOR','millions'),('DECIMALS','2'),('STATUS','unexpected'),
                 ('VALUE','nan'),('VALUE','-1'),('VALUE','99'),('VECTOR',''),('Industry','Changed definition [BS211110]')]
        for key,value in changes:
            with self.subTest(key=key,value=value):
                rows=fixture_rows();rows[0][key]=value
                with self.assertRaises(ValueError):refresh.parse_rows(rows)
        rows=fixture_rows();rows.append(copy.deepcopy(rows[0]))
        with self.assertRaisesRegex(ValueError,'Duplicate'):refresh.parse_rows(rows)

    def test_source_content_version_does_not_change_with_retrieval_clock(self):
        raw=archive(fixture_rows())
        first=refresh.build_snapshot(raw,'2026-10-20T00:00:00Z','2025-11-19T08:30')
        later=refresh.build_snapshot(raw,'2026-10-21T00:00:00Z','2025-11-19T08:30')
        self.assertEqual(first['dataVersion'],later['dataVersion'])
        self.assertNotEqual(first['retrievedAt'],later['retrievedAt'])
        self.assertFalse(first['coverage']['bilateralRecipients'])

    def test_offline_requires_matching_prior_verification(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder);raw=archive(fixture_rows());(path/'36100595-eng.zip').write_bytes(raw)
            (path/'network-verification.json').write_text(json.dumps({'sha256':'wrong'}))
            with self.assertRaisesRegex(ValueError,'mismatch'):refresh.acquire(path,offline=True)


if __name__=='__main__':
    unittest.main()
