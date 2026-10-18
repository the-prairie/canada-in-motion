import unittest
from adapters import normalize

class IdentityTests(unittest.TestCase):
    def test_reentries_remain_distinct_when_source_numbers_repeat(self):
        source={'id':'offshore','province':'NS','format':'arcgis','url':'https://example.org/0','objectIdField':'OBJECTID','stableIdFields':['name','number','spud'],'fields':{'name':'name','license':'number'}}
        a={'name':'Same well','number':0,'spud':'1970-01-01','OBJECTID':1}
        feature=lambda attrs:{'attributes':attrs,'geometry':{'x':-60,'y':44}}
        first=normalize(source,feature(a))
        reentry=normalize(source,feature({**a,'spud':'1971-01-01','OBJECTID':2}))
        renumbered=normalize(source,feature({**a,'OBJECTID':999}))
        self.assertNotEqual(first['id'],reentry['id'])
        self.assertEqual(first['id'],renumbered['id'])
        self.assertEqual(first['closureStatus'],'unknown')
        self.assertEqual(first['orphanStatus'],'unknown')
        with self.assertRaises(ValueError):normalize(source,feature({**a,'spud':None}))

if __name__=='__main__':unittest.main()
