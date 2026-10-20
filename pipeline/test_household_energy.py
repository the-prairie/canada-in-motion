import json
import math
from pathlib import Path
import statistics
import unittest

from refresh_household_energy import baselines,elasticities,rows,annual


class HouseholdEnergyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot=json.loads((Path(__file__).resolve().parents[1]/'data/household-energy-costs.json').read_text())

    def test_published_model_gate_and_observation_boundaries(self):
        supported=[r for r in self.snapshot['calibrations'] if r['status']=='supported']
        self.assertEqual(len(supported),10)
        self.assertEqual({r['commodity'] for r in supported},{'oil'})
        for model in self.snapshot['calibrations']:
            if model['status']=='unavailable':
                continue
            for row in model['validation']['monthlyPredictions']:
                self.assertLess(row['trainingEnd'],row['month'])
                self.assertTrue(all(math.isfinite(row[k]) for k in ['actual','model','baseline']))
            for row in model['validation']['annualPredictions']:
                self.assertEqual(row['trainingEnd'],str(row['year']-1)+'-12')
            if model['status']=='supported':
                for period in ['development','audit']:
                    self.assertGreaterEqual(model['validation']['monthly'][period]['improvementPct'],10)
                self.assertGreaterEqual(len(model['responseDraws']['persistent']),100)

    def test_positive_negative_and_zero_scenarios_have_expected_direction(self):
        for model in self.snapshot['calibrations']:
            if model['status']!='supported':
                continue
            for shock in [-20,-10,0,10,20]:
                changes=[math.expm1(v*math.log1p(shock/100)) for v in model['responseElasticities']['persistent'][:12]]
                average=statistics.mean(changes)
                if shock==0:
                    self.assertEqual(average,0)
                else:
                    self.assertGreater(average*shock,0)
                self.assertTrue(math.isfinite(average))

    def test_retail_spending_baselines_are_independent_of_model_acceptance(self):
        ab={r['commodity']:r for r in self.snapshot['spendingBaselines'] if r['region']=='AB'}
        self.assertEqual(ab['electricity']['annualCad'],1951)
        self.assertEqual(ab['gas']['annualCad'],1332)
        self.assertEqual(ab['oil']['annualCad'],3229)
        for item in ab.values():
            self.assertEqual(item['status'],'available')
            self.assertAlmostEqual(item['currentAnnualCad'],item['annualCad']*item['cpiCurrentAverage']/item['cpiBaseYearAverage'])
        self.assertEqual(next(r for r in self.snapshot['calibrations'] if r['region']=='AB' and r['commodity']=='gas')['status'],'exploratory')

    def test_suppressed_spending_does_not_become_zero(self):
        data={'spending':[{'region':'AB','commodity':'gas','year':2023,'value':None,'status':'F','vector':'v1'}],
              'cpi':[{'region':'AB','commodity':'gas','month':f'2023-{m:02d}','value':100} for m in range(1,13)]}
        item=next(r for r in baselines(data) if r['region']=='AB' and r['commodity']=='gas')
        self.assertEqual(item['status'],'unavailable')
        self.assertIsNone(item['currentAnnualCad'])

    def test_temporary_price_reversal_and_persistent_price_identity(self):
        beta=[0]*17
        beta[13]=0.5
        persistent=elasticities(beta,3)
        temporary=elasticities(beta,3,True)
        self.assertEqual(persistent,[0.5]*24)
        self.assertEqual(temporary,[0.5]*6+[0.0]*18)

    def test_annual_check_does_not_bridge_missing_months(self):
        data=self.snapshot['observations']
        observed=rows(data,'AB','oil',3)
        altered=[r for r in observed if r['month']!='2020-07']
        self.assertNotIn(2020,[r['year'] for r in annual(altered)])

    def test_monthly_history_matches_published_province_identity(self):
        cpi=self.snapshot['observations']['cpi']
        keys=[(r['region'],r['month'],r['commodity']) for r in cpi]
        self.assertEqual(len(keys),len(set(keys)))
        self.assertEqual(len(self.snapshot['spendingBaselines']),30)
        self.assertNotIn('YT',{r['region'] for r in self.snapshot['spendingBaselines']})
        self.assertEqual(len(self.snapshot['dataVersion']),20)


if __name__=='__main__':
    unittest.main()
