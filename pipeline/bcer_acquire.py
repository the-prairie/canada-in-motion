"""Acquire licensed BCER layers with independent ID enumeration and no silent drops."""
import json, urllib.request, urllib.parse, pathlib, hashlib, datetime, collections, math, concurrent.futures, time
ROOT=pathlib.Path(__file__).resolve().parent
BASE='https://geoweb-ags.bc-er.ca/arcgis/rest/services/'
SOURCES={
'pipelines':('PASR/PASR_PL_SEGMENT_LN/MapServer/0','359b7e14fafa4abc84ff873bc55015fb'),
'facilities':('PASR/PASR_FACILITY_PT/MapServer/0','5ace26f614b9435492d679d766430143'),
'orphan-pipelines':('OPERATIONAL/ORPHAN_SITE_PT/MapServer/1','dadf68fc98054d758900b61742964d2c')}
LICENCE='https://www.bc-er.ca/files/gis/BCER-Open-Data-Licence.pdf'
def fetch(url):
 for attempt in range(3):
  try:
   with urllib.request.urlopen(url,timeout=90) as response: raw=response.read(50_000_001)
   if len(raw)>50_000_000:raise ValueError('Response too large')
   data=json.loads(raw)
   if 'error' in data:raise ValueError(data['error'])
   return data
  except Exception:
   if attempt==2:raise
   time.sleep(attempt+1)
def query(url,**params):return fetch(url+'/query?'+urllib.parse.urlencode(dict(f='json',**params)))
def acquire(name,source):
 path,item=source;url=BASE+path
 meta=fetch(f'https://www.arcgis.com/sharing/rest/content/items/{item}?f=json')
 assert meta['owner']=='BC_Energy_Regulator' and LICENCE in meta['licenseInfo'] and meta['url']==url
 (ROOT/f'item-{name}.json').write_text(json.dumps(meta,indent=2))
 ids=query(url,where='1=1',returnIdsOnly='true')['objectIds']; assert ids and len(ids)==len(set(ids));ids.sort()
 count=query(url,where='1=1',returnCountOnly='true')['count'];assert count==len(ids)
 records=[]
 for start in range(0,len(ids),200):
  batch=ids[start:start+200]
  result=query(url,objectIds=','.join(map(str,batch)),outFields='*',outSR=4326,returnGeometry='true')
  assert not result.get('exceededTransferLimit')
  rows=result['features'];assert sorted(row['attributes']['OBJECTID'] for row in rows)==batch
  records.extend(rows)
 assert sorted(row['attributes']['OBJECTID'] for row in records)==ids
 raw=json.dumps({'sourceUrl':url,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'features':records},separators=(',',':')).encode()
 (ROOT/f'bc-{name}-raw.json').write_bytes(raw)
 return name, {'sourceUrl':url,'itemUrl':f'https://www.arcgis.com/home/item.html?id={item}','license':LICENCE,'recordCount':len(records),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: results=dict(pool.map(lambda kv:acquire(*kv),SOURCES.items()))
 (ROOT/'BCER-ACQUISITION.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
