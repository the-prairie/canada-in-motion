import unittest
from refresh import exclude_reviewed_placeholders

class ExclusionTests(unittest.TestCase):
    def test_only_reviewed_structurally_empty_placeholders_are_quarantined(self):
        source={'objectIdField':'oid','reviewedExclusion':{'allNullFields':['id','name'],'zeroFields':['east','north'],'geometryLatitudeEquals':0,'sourceRecordIds':['126'],'maximumCount':1,'reason':'Empty placeholder'}}
        empty={'attributes':{'oid':126.0,'id':'','name':'','east':'0','north':'0'},'geometry':{'x':-67,'y':0}}
        record={'attributes':{'oid':1,'id':0,'name':'A valid zero identifier','east':0,'north':0},'geometry':{'x':-64,'y':45}}
        kept,excluded=exclude_reviewed_placeholders([empty,record],source)
        self.assertEqual(kept,[record]);self.assertEqual(excluded,[{'sourceRecordId':'126','reason':'Empty placeholder'}])
        with self.assertRaises(ValueError):exclude_reviewed_placeholders([{**empty,'attributes':{**empty['attributes'],'oid':127}}],source)
        changed={**empty,'attributes':{**empty['attributes'],'name':'New real record'}}
        self.assertEqual(exclude_reviewed_placeholders([changed],source),([changed],[]))

if __name__=='__main__':unittest.main()
