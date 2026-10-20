import csv
import io
import unittest
import zipfile
from refresh_energy_flows import observation, parse_trade, parse_electricity, parse_fuel_balances


def archive(table, records):
    content = io.StringIO()
    writer = csv.DictWriter(content, fieldnames=list(records[0]))
    writer.writeheader()
    writer.writerows(records)
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as zipped:
        zipped.writestr(f'{table}.csv',content.getvalue())
    return output.getvalue()


def trade_row(product='ENE211102', **changes):
    return {'REF_DATE':'2024','GEO':'Alberta, exporting','Geography, importing':'Ontario, importing',
        'Prices':'Current prices','Product':f'Fixture [{product}]','UOM':'Canadian dollars','SCALAR_FACTOR':'thousands',
        'VALUE':'1000000','STATUS':'','VECTOR':'v123',**changes}


class EnergyFlowIngestionTests(unittest.TestCase):
    def test_zero_is_not_missing_and_suppressed_numeric_is_never_released(self):
        zero = observation(trade_row(VALUE='0'), 'Canadian dollars','thousands')
        self.assertEqual(zero['value'],0)
        self.assertEqual(zero['status'],'available')
        self.assertIsNone(observation(None,'','')['value'])
        hidden = observation(trade_row(VALUE='123',STATUS='x'),'Canadian dollars','thousands')
        self.assertIsNone(hidden['value'])
        self.assertEqual(hidden['status'],'suppressed')

    def test_trade_units_and_unknown_status_fail_closed(self):
        for changes in [{'UOM':'US dollars'},{'SCALAR_FACTOR':'millions'},{'STATUS':'new-status'},{'VALUE':'nan'}]:
            with self.assertRaises(ValueError):
                observation(trade_row(**changes),'Canadian dollars','thousands')

    def test_all_pairs_explicit_current_prices_only_and_international_separate(self):
        raw = archive('36100709',[trade_row(),trade_row(Prices='2017 constant prices',VALUE='20'),
            trade_row(**{'Geography, importing':'International, importing','VALUE':'2000000'})])
        data = parse_trade(raw)
        self.assertEqual(len(data['observations']),14*13*3)
        match = lambda origin,destination:next(row for row in data['observations'] if row['origin']==origin and row['destination']==destination and row['commodity']=='gas')
        self.assertEqual(match('AB','ON')['value'],1000)
        self.assertEqual(match('AB','ROW')['value'],2000)
        self.assertIsNone(match('ON','AB')['value'])

    def test_oil_requires_every_component(self):
        raw = archive('36100709',[trade_row('ENE211104'),trade_row('ENE211106',VALUE='0'),trade_row('ENE211107',STATUS='x',VALUE='')])
        result = next(row for row in parse_trade(raw)['observations'] if row['origin']=='AB' and row['destination']=='ON' and row['commodity']=='oil')
        self.assertIsNone(result['value'])
        self.assertEqual(result['status'],'suppressed')
        self.assertEqual(result['components'][1]['value'],0)

    def test_duplicate_trade_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'Duplicate'):
            parse_trade(archive('36100709',[trade_row(),trade_row()]))

    def test_electricity_preserves_missing_territories_and_signed_net(self):
        base = {'REF_DATE':'2026-07','GEO':'Alberta','UOM':'Megawatt hours','SCALAR_FACTOR':'units','STATUS':'','VECTOR':'v100'}
        raw = archive('25100016',[{**base,'Electric power, components':'Receipts from other provinces','VALUE':'10'},
            {**base,'Electric power, components':'Deliveries to other provinces','VALUE':'40'}])
        data = parse_electricity(raw)
        self.assertEqual(data['period'],'2026-07')
        self.assertEqual(next(row for row in data['observations'] if row['region']=='AB')['netReceipts'],-30)
        self.assertIsNone(next(row for row in data['observations'] if row['region']=='NU')['netReceipts'])

    def test_annual_electricity_never_mixes_dollar_value_with_quantity(self):
        base = {'REF_DATE':'2025','GEO':'Alberta','UOM':'Megawatt hours','SCALAR_FACTOR':'units','STATUS':'','VECTOR':'v100','Estimates':'Electricity quantity'}
        row = {**base,'Electric power, components':'Total interprovincial receipts of electricity','VALUE':'10'}
        raw = archive('25100021',[row,{**row,'Estimates':'Electricity value','UOM':'Dollars','VALUE':'9000'}])
        data = parse_electricity(raw,True)
        ab = next(row for row in data['observations'] if row['region']=='AB')
        self.assertEqual(ab['receipts'],10)
        self.assertIsNone(ab['netReceipts'])
        self.assertEqual(data['publicationStatus'],'preliminary')

    def test_fuel_net_cannot_create_gross_or_bilateral_flow(self):
        row = {'REF_DATE':'2024','GEO':'Alberta','UOM':'Terajoules','SCALAR_FACTOR':'units','STATUS':'','VECTOR':'v100',
            'Fuel type':'Crude oil','Supply and demand characteristics':'Inter-regional transfers','VALUE':'-100'}
        data = parse_fuel_balances(archive('25100029',[row]))
        ab = next(row for row in data[0]['observations'] if row['region']=='AB')
        self.assertEqual(ab['netReceipts'],-100)
        self.assertIsNone(ab['receipts'])
        self.assertIsNone(ab['deliveries'])


if __name__ == '__main__':
    unittest.main()
