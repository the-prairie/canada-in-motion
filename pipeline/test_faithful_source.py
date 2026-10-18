import base64
import copy
import hashlib
import json
import unittest
import urllib.parse
from unittest.mock import patch
import faithful_source
import refresh


class FaithfulSourceTests(unittest.TestCase):
    def setUp(self):
        self.source = {'id':'ns-test','province':'NS','publication':'noncommercial','format':'arcgis','faithfulReproduction':True,'serviceUrl':'https://publisher.test/FeatureServer','itemId':'item','itemOwner':'owner','itemLicenceSha256':hashlib.sha256(b'Public; as-is.').hexdigest(),'licenceUrl':'https://publisher.test/copyright','layerNamePrefix':'Wells_','objectIdField':'OBJECTID','stableIdField':'Well_ID','requiredFields':['OBJECTID','Well_ID','Status'],'rawFields':['OBJECTID','Well_ID','Status','Spud_Month'],'coordinateBounds':[-67,43,-59,48]}
        attrs={'OBJECTID':1,'Well_ID':'A1','Status':'Plugged and Abandoned','Spud_Month':'Febuary'}
        self.native={'geometryType':'esriGeometryPoint','spatialReference':{'wkid':26920},'features':[{'attributes':attrs,'geometry':{'x':400000,'y':5000000}}]}
        self.display=copy.deepcopy(self.native);self.display['spatialReference']={'wkid':4326};self.display['features'][0]['geometry']={'x':-63.123456789,'y':45.3456789}
        self.policy=b'non-commercial purposes without further permission; materials must not be modified'
        self.meta={'fields':[{'name':n} for n in self.source['rawFields']],'description':'last updated October 13th, 2026'}

    def request(self,url):
        if url==self.source['licenceUrl']:return self.policy,{}
        if '/sharing/rest/' in url:value={'owner':'owner','url':self.source['serviceUrl'],'licenseInfo':'Public; as-is.'}
        elif url==self.source['serviceUrl']+'?f=json':value={'serviceItemId':'item','layers':[{'id':9,'name':'Wells_261013','geometryType':'esriGeometryPoint'}]}
        elif '/query?' not in url:value=self.meta
        else:
            query=urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
            if 'returnIdsOnly' in query:value={'objectIds':[1]}
            elif 'returnCountOnly' in query:value={'count':1}
            elif 'outSR' in query:value=self.display
            else:value=self.native
        return (json.dumps(value,indent=3)+'\n').encode(),{}

    def test_exact_bytes_and_source_values_survive_dynamic_layer_discovery(self):
        rows,evidence,originals=faithful_source.acquire(self.source,self.request)
        self.assertTrue(self.source['url'].endswith('/9'))
        self.assertEqual(evidence['sourceObservationDate'],'2026-10-13')
        self.assertEqual(originals['publisher-wgs84.json'][1],(json.dumps(self.display,indent=3)+'\n').encode())
        self.assertEqual(rows[0]['attributes']['Spud_Month'],'Febuary')
        payloads={n:{'url':u,'base64':base64.b64encode(b).decode(),'sha256':hashlib.sha256(b).hexdigest()} for n,(u,b) in originals.items()}
        refresh.verify_originals(self.source,rows,payloads)
        altered=copy.deepcopy(rows);altered[0]['attributes']['Spud_Month']='February'
        with self.assertRaisesRegex(ValueError,'differs'):refresh.verify_originals(self.source,altered,payloads)
        payloads['publisher-wgs84.json']['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'checksum'):refresh.verify_originals(self.source,rows,payloads)

    def test_terms_and_schema_changes_fail_closed(self):
        self.policy=b'Commercial and modified copies require permission'
        with self.assertRaisesRegex(ValueError,'policy changed'):faithful_source.acquire(self.source,self.request)
        self.setUp();self.meta['fields'].append({'name':'New_Field'})
        with self.assertRaisesRegex(ValueError,'schema changed'):faithful_source.acquire(self.source,self.request)

    def test_attribute_geometry_identity_and_truncation_errors_are_rejected(self):
        for mutate in [lambda d:d.update(exceededTransferLimit=True),lambda d:d['features'][0]['attributes'].update(Well_ID=None),lambda d:d['features'][0]['attributes'].update(Status='Active'),lambda d:d['features'][0]['geometry'].update(x=0),lambda d:d['features'][0]['geometry'].update(x=float('nan')),lambda d:d['features'].append(copy.deepcopy(d['features'][0]))]:
            display=copy.deepcopy(self.display);mutate(display)
            with self.assertRaises(ValueError):faithful_source.validate_responses(self.source,self.native,display,[1])

    def test_source_specific_offshore_bounds(self):
        row={'id':'x','sourceId':'source','province':'NL','lon':-45.3,'lat':47,'closureStatus':'unknown','orphanStatus':'unknown','events':[]}
        refresh.validate([row],{'id':'source','province':'NL','coordinateBounds':[-64,42,-43,61]})
        with self.assertRaisesRegex(ValueError,'envelope'):refresh.validate([row],{'id':'source','province':'NL'})


if __name__=='__main__':unittest.main()
