"""Normalize complete downloaded BCER permit layers without interpreting permit status as operations."""
import json,pathlib,hashlib,math,datetime,collections
ROOT=pathlib.Path(__file__).resolve().parent

def coord(point):
 assert len(point)>=2 and all(isinstance(x,(int,float)) and math.isfinite(x) for x in point[:2]), 'Invalid coordinate'
 assert -180<=point[0]<=180 and -90<=point[1]<=90, 'Not WGS84'
 return [round(point[0],6),round(point[1],6)]
def date(value):
 if value is None:return None
 return datetime.datetime.fromtimestamp(value/1000,datetime.timezone.utc).date().isoformat()
def run():
 proof=json.loads((ROOT/'BCER-ACQUISITION.json').read_text());sources={};features=[];seen=set();counts={};statusCounts={}
 for name,kind in [('pipelines','pipeline-permit'),('facilities','facility-permit')]:
  original=(ROOT/f'bc-{name}-raw.json').read_bytes();assert hashlib.sha256(original).hexdigest()==proof[name]['sha256']
  dataset=json.loads(original);rows=dataset['features'];assert len(rows)==proof[name]['recordCount']
  sourceId='bcer-'+name+'-permitted';sources[sourceId]={**proof[name],'title':'BCER '+name+' permitted inventory','scope':'Approved locations collected on or after 2016-07-11. Not a complete inventory of current operating infrastructure.','publisherUpdateFrequency':'nightly','attribution':'Contains information licensed under the BC Energy Regulator Open Data Licence.','statusMeaning':'Source activity status during the approval process, preserved verbatim. Not independently verified operational status.'}
  statusCounts[kind]=dict(collections.Counter(x['attributes']['STATUS'] for x in rows))
  for row in rows:
   p=row['attributes'];g=row.get('geometry');assert g
   if kind=='pipeline-permit':
    key=[p['PROJECT_NUMBER'],p['SEGMENT_NUMBER']];assert all(x is not None and x!='' for x in key)
    ident='bcer-pipeline-'+str(key[0])+'-'+str(key[1]); paths=g['paths'];assert paths and all(len(x)>=2 for x in paths)
    geom={'type':'MultiLineString','coordinates':[[coord(x) for x in path] for path in paths]}
    extra={'projectNumber':key[0],'segmentNumber':key[1],'type':p['LINE_TYPE_DESC'],'physicalLengthM':p['PHYSICAL_PIPE_LENGTH']}
    title='Pipeline '+str(key[0])+' / '+str(key[1])
   else:
    key=p['FACILITY_ID'];assert key is not None and key!='';ident='bcer-facility-'+key;geom={'type':'Point','coordinates':coord([g['x'],g['y']])}
    extra={'facilityId':key,'type':p['FACILITY_TYPE_DESC']};title=p['FACILITY_NAME'] or (p['FACILITY_TYPE_DESC']+' '+key)
   assert ident not in seen;seen.add(ident)
   features.append({'type':'Feature','id':ident,'geometry':geom,'properties':{'id':ident,'kind':kind,'name':title,'province':'BC','sourceId':sourceId,'sourceRecordId':str(p['OBJECTID']),'sourceStatus':p['STATUS'],'operatingStatus':None,'recordedProponent':p['PROPONENT'],'authorityType':p['AUTHORITY_TYPE'],'approvalDate':date(p['ACTIVITY_APPROVAL_DATE']),'cancelDate':date(p['ACTIVITY_CANCEL_DATE']),**extra}})
  counts[kind]=len(rows)
 data={'type':'FeatureCollection','metadata':{'schemaVersion':1,'title':'British Columbia permitted infrastructure','retrievedAt':min(v['retrievedAt'] for v in sources.values()),'sources':sources,'scope':'Approved pipeline and facility locations collected on or after July 11, 2016. Includes active, new, abandoned, inactive, removed and other permit records. Does not establish complete provincial or national operating coverage.','coordinates':'WGS84, rounded to six decimals for display. Source precision and positional accuracy vary. Not for engineering or navigation.','counts':counts,'statusCounts':statusCounts,'excludedRecords':0},'features':features}
 out=ROOT/'bc-permitted-infrastructure.geojson';out.write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False));raw=out.read_bytes()
 orphan=json.loads((ROOT/'bc-orphan-pipelines-raw.json').read_text());orphanRows=[f['attributes'] for f in orphan['features']]
 orphanAsset={'metadata':{**proof['orphan-pipelines'],'title':'BCER orphan pipeline site rows','scope':'Tabular site/segment records. No geometry provided; not joined to permitted geometry. Reclaimed remains a separate restoration status.','statusDefinitions':{'Inactive':'Decommissioning work remains at the site','Reclaimed':'Source includes both surface reclamation and completed restoration; does not by itself establish a certificate for each row.'}},'rows':orphanRows}
 (ROOT/'bc-orphan-pipeline-sites.json').write_text(json.dumps(orphanAsset,separators=(',',':')))
 verification={'counts':counts,'features':len(features),'uniqueIds':len(seen),'nullGeometries':0,'excludedRecords':0,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'statusCounts':statusCounts,'orphanTableRows':len(orphanRows),'lngFacilityRows':sum(x['properties'].get('type')=='LNG Facility' for x in features),'sourceProof':proof}
 (ROOT/'BCER-VERIFIED.json').write_text(json.dumps(verification,indent=2));print(json.dumps({k:v for k,v in verification.items() if k!='sourceProof'},indent=2))
if __name__=='__main__':run()
