import base64
import copy
import json
import unittest
import urllib.parse
from unittest.mock import patch
import refresh


class FilteredSourcesTests(unittest.TestCase):
    def setUp(self):
        self.source={'id':'basin-test','url':'https://example.org/MapServer/0','publication':'noncommercial','preservePublisherResponses':True,'objectIdField':'ESRI_OID','stableIdField':'LOC_NO','requiredFields':['ESRI_OID','LOC_NO','AREA'],'where':"AREA IN ('Quebec')",'attributeFilter':{'field':'AREA','values':['Quebec']}}
        self.feature={'attributes':{'ESRI_OID':1,'LOC_NO':101,'AREA':'Quebec'},'geometry':{'x':-65.4,'y':48.8}}
        self.truncated=False
        self.calls=[]

    def request(self,url):
        self.calls.append(url)
        if '/query?' not in url:payload={'fields':[{'name':n} for n in self.source['requiredFields']],'maxRecordCount':1000}
        else:
            q=urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
            if 'returnIdsOnly' in q:
                self.assertEqual(q['where'],[self.source['where']]);payload={'objectIds':[1]}
            elif 'returnCountOnly' in q:payload={'count':1}
            else:payload={'geometryType':'esriGeometryPoint','spatialReference':{'wkid':4326},'features':[self.feature],'exceededTransferLimit':self.truncated}
        return (json.dumps(payload,indent=2)+'\n').encode(),{}

    def test_filtered_records_keep_exact_responses(self):
        with patch.object(refresh,'request',side_effect=self.request):rows,evidence=refresh.arcgis(self.source)
        self.assertEqual(evidence['sourceCount'],1)
        originals=evidence['originalPayloads'];self.assertEqual(len(originals),5)
        refresh.verify_originals(self.source,rows,originals)
        raw=base64.b64decode(originals['publisher-batch-0000.json']['base64'])
        self.assertTrue(raw.endswith(b'\n'));self.assertEqual(json.loads(raw)['features'],rows)

    def test_unexpected_geographic_group_cannot_escape_filter(self):
        self.feature['attributes']['AREA']='Grand Banks'
        with patch.object(refresh,'request',side_effect=self.request):
            with self.assertRaisesRegex(ValueError,'outside the declared filter'):refresh.arcgis(self.source)

    def test_explicit_truncation_fails_even_when_returned_ids_match(self):
        self.truncated=True
        with patch.object(refresh,'request',side_effect=self.request):
            with self.assertRaisesRegex(ValueError,'Truncated'):refresh.arcgis(self.source)


if __name__=='__main__':unittest.main()
