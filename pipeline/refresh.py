"""Acquire complete permitted source layers and atomically publish verified snapshots."""
import argparse
import base64
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
_faithful_spec = importlib.util.spec_from_file_location('faithful_source', Path(__file__).with_name('faithful_source.py'))
_faithful = importlib.util.module_from_spec(_faithful_spec)
_faithful_spec.loader.exec_module(_faithful)
acquire_faithful = _faithful.acquire
INDEX_FIELDS = ['id','province','lon','lat','license','name','operator','closureStatus','orphanStatus','reclamationStatus','sourceId','sourceRecordId','dates','detailFile']


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')


def request(url):
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'CanadaInMotion/2.0 (noncommercial public data atlas)','Accept':'application/json, application/zip, */*'})
            with urllib.request.urlopen(req,timeout=90) as response:
                return response.read(), dict(response.headers)
        except Exception:
            if attempt==2: raise
            time.sleep(2**attempt)


def query(url,params):
    content,_=request(url+'/query?'+urllib.parse.urlencode({'f':'json',**params}))
    result=json.loads(content)
    if 'error' in result: raise ValueError(str(result['error']))
    return result


def arcgis(source):
    url=source['url']
    originals={}
    def get(name,params=None):
        endpoint=url+'?f=json' if params is None else url+'/query?'+urllib.parse.urlencode({'f':'json',**params})
        content,_=request(endpoint);result=json.loads(content)
        if result.get('error'):raise ValueError(str(result['error']))
        if source.get('preservePublisherResponses'): originals[name]={'url':endpoint,'base64':base64.b64encode(content).decode(),'sha256':hashlib.sha256(content).hexdigest()}
        return result
    meta=get('publisher-layer.json')
    names={field['name'] for field in meta.get('fields',[])}
    if not set(source['requiredFields']) <= names: raise ValueError('Source schema changed: '+source['id'])
    oid=source['objectIdField']
    where=source.get('where','1=1')
    ids=sorted(get('publisher-ids.json',{'where':where,'returnIdsOnly':'true'})['objectIds'])
    if not ids or len(ids)!=len(set(ids)): raise ValueError('Empty or duplicate source ID enumeration')
    if source.get('where') and get('publisher-count.json',{'where':where,'returnCountOnly':'true'})['count']!=len(ids): raise ValueError('Filtered source count disagrees with IDs')
    batchsize=min(100,meta.get('maxRecordCount',100))
    def batch(offset):
        selected=ids[offset:offset+batchsize]
        result=get(f'publisher-batch-{offset//batchsize:04}.json',{'objectIds':','.join(map(str,selected)),'outFields':'*','returnGeometry':'true','outSR':'4326'})
        if result.get('exceededTransferLimit'):raise ValueError('Truncated publisher batch')
        if result.get('spatialReference',{}).get('wkid')!=4326: raise ValueError('Expected WGS84 geometry')
        rows=result.get('features',[])
        if sorted(row['attributes'][oid] for row in rows)!=selected: raise ValueError('Truncated or inconsistent response')
        return rows
    with ThreadPoolExecutor(max_workers=3) as pool:
        features=[row for batchrows in pool.map(batch,range(0,len(ids),batchsize)) for row in batchrows]
    final_ids=sorted(get('publisher-final-ids.json',{'where':where,'returnIdsOnly':'true'})['objectIds'])
    if ids!=final_ids: raise ValueError('Source changed during enumeration; retry whole source')
    if source.get('attributeFilter'):
        rule=source['attributeFilter']
        if any(f['attributes'].get(rule['field']) not in rule['values'] for f in features): raise ValueError('Source returned records outside the declared filter')
    return features,{'sourceCount':len(ids),'upstreamModifiedAt':meta.get('editingInfo',{}).get('lastEditDate'),'enumerationVerified':True,**({'originalPayloads':originals} if originals else {})}


def shapefile_source(source,cache):
    import shapefile
    from pyproj import CRS,Transformer
    content,headers=request(source['url'])
    digest=hashlib.sha256(content).hexdigest()
    if cache:
        cache.mkdir(parents=True,exist_ok=True)
        (cache/(source['id']+'-'+digest+'.zip')).write_bytes(content)
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        names=archive.namelist()
        shp=next(name for name in names if name.endswith(source['shapeSuffix']))
        base=shp[:-4]
        parts={'shp':io.BytesIO(archive.read(base+'.shp')),'dbf':io.BytesIO(archive.read(base+'.dbf')),'encoding':source.get('encoding','utf-8')}
        if base+'.shx' in names: parts['shx']=io.BytesIO(archive.read(base+'.shx'))
        reader=shapefile.Reader(**parts)
        crs=CRS.from_wkt(archive.read(base+'.prj').decode())
        transform=Transformer.from_crs(crs,4326,always_xy=True)
        names={field[0] for field in reader.fields[1:]}
        if not set(source['requiredFields'])<=names: raise ValueError('Shapefile schema changed')
        features=[]
        for record in reader.iterShapeRecords():
            if record.shape.shapeType!=1 or len(record.shape.points)!=1: raise ValueError('Expected one point per record')
            lon,lat=transform.transform(*record.shape.points[0])
            features.append({'attributes':record.record.as_dict(),'geometry':{'x':lon,'y':lat}})
    if not features: raise ValueError('Empty shapefile')
    return features,{'sourceCount':len(features),'upstreamModifiedAt':headers.get('Last-Modified'),'upstreamSha256':digest,'enumerationVerified':True}


def exclude_reviewed_placeholders(features,source):
    rule=source.get('reviewedExclusion')
    if not rule: return features,[]
    kept=[];excluded=[]
    for feature in features:
        attrs=feature['attributes'];value=attrs.get(source['objectIdField'])
        record_id=str(int(value)) if isinstance(value,(int,float)) and value==int(value) else str(value)
        matches=(all(attrs.get(field) is None or attrs.get(field)=='' for field in rule['allNullFields'])
                 and all(attrs.get(field) in [0,'0'] for field in rule['zeroFields'])
                 and feature['geometry']['y']==rule['geometryLatitudeEquals'])
        if matches:
            if record_id not in rule['sourceRecordIds']: raise ValueError('Unreviewed empty source record: '+record_id)
            excluded.append({'sourceRecordId':record_id,'reason':rule['reason']})
        else: kept.append(feature)
    if len(excluded)>rule['maximumCount']: raise ValueError('Source exclusions exceed reviewed bound')
    return kept,excluded


def validate(wells,source,previous_count=None,max_drop=.05):
    if not wells: raise ValueError('Empty normalized source')
    ids=set()
    for w in wells:
        if w['id'] in ids: raise ValueError('Duplicate stable ID: '+w['id'])
        ids.add(w['id'])
        if w['sourceId']!=source['id'] or w['province']!=source['province']: raise ValueError('Source identity mismatch')
        if not all(isinstance(w[k],(int,float)) and math.isfinite(w[k]) for k in ['lon','lat']): raise ValueError('Invalid coordinates')
        west,south,east,north=source.get('coordinateBounds',[-142,40,-50,84])
        if not west<=w['lon']<=east or not south<=w['lat']<=north: raise ValueError('Coordinates outside declared source envelope')
        if w['closureStatus'] not in ['abandoned','active','suspended','unknown']: raise ValueError('Invalid closure status')
        if w['orphanStatus'] not in ['designated','not-designated','unknown']: raise ValueError('Invalid orphan status')
        for e in w.get('events',[]): datetime.strptime(e['date'],'%Y-%m-%d')
    if previous_count and len(wells)<previous_count*(1-max_drop): raise ValueError('Count drop exceeds review threshold')


def write_json(path,payload):
    content=json.dumps(payload,ensure_ascii=False,separators=(',',':'),allow_nan=False,default=lambda value:value.isoformat()).encode()
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(content)
    return hashlib.sha256(content).hexdigest()


def verify_originals(source,features,payloads):
    """Reconcile unmodified source responses with the separate application input."""
    parsed={}
    for name,payload in payloads.items():
        if not name.startswith('publisher-') or '/' in name or not name.endswith('.json'):
            raise ValueError('Unexpected publisher response filename')
        content=base64.b64decode(payload['base64'],validate=True)
        if hashlib.sha256(content).hexdigest()!=payload.get('sha256'):
            raise ValueError('Original publisher response checksum mismatch')
        parsed[name]=json.loads(content)
    if source.get('faithfulReproduction'):
        required={'publisher-native.json','publisher-wgs84.json','publisher-layer.json','publisher-item.json','publisher-service.json','publisher-ids.json','publisher-count.json','publisher-final-ids.json'}
        if not required<=parsed.keys():raise ValueError('Original publisher responses missing')
        ids=parsed['publisher-ids.json']['objectIds']
        rows=_faithful.validate_responses(source,parsed['publisher-native.json'],parsed['publisher-wgs84.json'],ids)
        source['url']=payloads['publisher-layer.json']['url'].split('?')[0]
    elif source.get('preservePublisherResponses'):
        required={'publisher-layer.json','publisher-ids.json','publisher-count.json','publisher-final-ids.json'}
        if not required<=parsed.keys():raise ValueError('Original publisher responses missing')
        ids=parsed['publisher-ids.json']['objectIds']
        batches=[parsed[name] for name in sorted(parsed) if name.startswith('publisher-batch-')]
        if not batches or any(p.get('exceededTransferLimit') or p.get('spatialReference',{}).get('wkid')!=4326 for p in batches):raise ValueError('Invalid original publisher batches')
        rows=[f for p in batches for f in p['features']]
    else:return
    oid=source['objectIdField']
    if len(ids)!=len(set(ids)) or len(rows)!=len(ids) or sorted(f['attributes'][oid] for f in rows)!=sorted(ids) or sorted(parsed['publisher-final-ids.json']['objectIds'])!=sorted(ids) or parsed['publisher-count.json']['count']!=len(ids):
        raise ValueError('Original publisher enumeration mismatch')
    if sorted(rows,key=lambda f:f['attributes'][oid])!=sorted(features,key=lambda f:f['attributes'][oid]):
        raise ValueError('Application input differs from original publisher records')


def _refresh(root=ROOT,source_ids=None):
    config=json.loads((root/'config/publication.json').read_text())
    registry=json.loads((root/'config/sources.json').read_text())
    permitted=[s for s in registry if s.get('enabled') and s['publication'] in ['open','noncommercial'] and (not source_ids or s['id'] in source_ids)]
    if not permitted: raise ValueError('No permitted enabled sources')
    if config.get('purpose')!='noncommercial' and any(s['publication']=='noncommercial' for s in permitted):raise ValueError('Noncommercial source in commercial publication')
    target=root/'data'
    target.mkdir(exist_ok=True)
    previous=json.loads((target/'catalog.json').read_text()) if (target/'catalog.json').exists() else None
    if source_ids: raise ValueError('Partial refresh cannot replace a release. Use all enabled sources.')
    spec=importlib.util.spec_from_file_location('adapters',root/'pipeline/adapters.py')
    adapters=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapters)
    report={'startedAt':now(),'status':'running','sources':[]}
    staging=Path(tempfile.mkdtemp(prefix='.release-',dir=target))
    try:
        snapshots=[]
        for definition in permitted:
            source=dict(definition)
            print('Fetching '+source['id'],flush=True)
            try:
                cachefile=root/'.data-cache'/(source['id']+'-acquisition.json')
                definition_hash=hashlib.sha256(json.dumps(definition,sort_keys=True).encode()).hexdigest()
                if os.environ.get('CIM_RESUME')=='1' and cachefile.exists():
                    acquisition=json.loads(cachefile.read_text())
                    if time.time()-cachefile.stat().st_mtime > 4*3600: raise ValueError('Resume cache is older than four hours')
                    if acquisition.get('definitionSha256')!=definition_hash:raise ValueError('Resume cache source definition changed')
                    features,evidence=acquisition['features'],acquisition['evidence']
                    retrieved=datetime.fromisoformat(evidence['retrievedAt'].replace('Z','+00:00')).timestamp()
                    if not 0<=time.time()-retrieved<=4*3600:raise ValueError('Resume acquisition timestamp is stale or in the future')
                    original_payloads=acquisition.get('originalPayloads',{})
                    if source.get('faithfulReproduction') and not original_payloads:raise ValueError('Original publisher bytes missing from cache')
                else:
                    original_payloads={}
                    if source.get('faithfulReproduction'):
                        features,evidence,originals=acquire_faithful(source,request)
                        original_payloads={name:{'url':url,'base64':base64.b64encode(b).decode(),'sha256':hashlib.sha256(b).hexdigest()} for name,(url,b) in originals.items()}
                    else:
                        features,evidence=arcgis(source) if source['format']=='arcgis' else shapefile_source(source,root/'.data-cache')
                        original_payloads=evidence.pop('originalPayloads',{})
                    evidence['retrievedAt']=now()
                    write_json(cachefile,{'features':features,'evidence':evidence,'originalPayloads':original_payloads,'definitionSha256':definition_hash})
                verify_originals(source,features,original_payloads)
                valid_features,excluded=exclude_reviewed_placeholders(features,source)
                wells=[adapters.normalize(source,feature) for feature in valid_features]
                if source.get('orphanJoin'):
                    join=source['orphanJoin']
                    join_source={'id':source['id']+'-orphan-join','url':join['url'],'requiredFields':['OBJECTID',join['foreignField']],'objectIdField':'OBJECTID'}
                    orphan_features,orphan_evidence=arcgis(join_source)
                    orphan_ids={str(int(f['attributes'][join['foreignField']])) for f in orphan_features}
                    for well in wells:
                        if str(int(well['license'])) in orphan_ids: well['orphanStatus']='designated'
                    evidence['orphanJoinEvidence']={**orphan_evidence,'url':join['url'],'retrievedAt':now()}
                old=next((s for s in (previous or {}).get('sources',[]) if s['id']==source['id']),{})
                validate(wells,source,old.get('count'),config['maxCountDecreaseFraction'])
                assert len(wells)+len(excluded)==evidence['sourceCount']
                wells.sort(key=lambda w:w['id'])
                source_dates=sorted({str(w.get('raw',{}).get('EXTRACT_DATE')) for w in wells if w.get('raw',{}).get('EXTRACT_DATE')})
                snapshot={**source,**evidence,'sourceDateText':'; '.join(source_dates) if source_dates else evidence.get('sourceDateText'),'count':len(wells),'retrievedAt':evidence['retrievedAt'],'scope':source.get('scope','full published source layer'),'droppedRecords':len(excluded),'excludedRecords':excluded}
                snapshot['reproductions']=[]
                for name,payload in original_payloads.items():
                    b=base64.b64decode(payload['base64'],validate=True);filename=source['id']+'/'+name
                    (staging/source['id']).mkdir(parents=True,exist_ok=True);(staging/filename).write_bytes(b)
                    snapshot['reproductions'].append({'file':filename,'url':payload['url'],'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)})
                index=[]
                snapshot['detailFiles']=[]
                for offset in range(0,len(wells),1000):
                    chunk=wells[offset:offset+1000]
                    filename=f"{source['id']}/details-{offset//1000:04}.json"
                    checksum=write_json(staging/filename,chunk)
                    snapshot['detailFiles'].append({'file':filename,'sha256':checksum,'count':len(chunk)})
                    for w in chunk:
                        w['detailFile']=filename
                        index.append([w.get(k) for k in INDEX_FIELDS])
                filename=source['id']+'/index.json'
                snapshot['indexSha256']=write_json(staging/filename,{'fields':INDEX_FIELDS,'rows':index})
                snapshot['indexFile']=filename
                snapshots.append(snapshot)
                report['sources'].append({'id':source['id'],'status':'passed','count':len(wells)})
                print(source['id']+': '+str(len(wells))+' verified',flush=True)
            except Exception as error:
                report['sources'].append({'id':source['id'],'status':'failed','error':str(error)})
                raise
        generated=now()
        release=hashlib.sha256(json.dumps(snapshots,sort_keys=True).encode()).hexdigest()[:20]
        manifest={'schemaVersion':2,'releaseId':release,'retrievedAt':generated,'purpose':config['purpose'],'sources':snapshots,'totalRecords':sum(s['count'] for s in snapshots),'basePath':'data/releases/'+release+'/','nationalComplete':False}
        write_json(staging/'manifest.json',manifest)
        releases=target/'releases';releases.mkdir(exist_ok=True)
        staging.rename(releases/release)
        tmp=target/'catalog.json.tmp';write_json(tmp,manifest);tmp.replace(target/'catalog.json')
        report.update(status='passed',releaseId=release,finishedAt=now())
    except Exception:
        report.update(status='failed',finishedAt=now(),previousReleaseRetained=bool(previous))
        raise
    finally:
        if staging.exists(): shutil.rmtree(staging)
        tmp=target/'refresh-report.json.tmp';write_json(tmp,report);tmp.replace(target/'refresh-report.json')
    return report


def refresh(root=ROOT,source_ids=None):
    import fcntl
    lockdir=root/'.data-cache';lockdir.mkdir(parents=True,exist_ok=True)
    with (lockdir/'refresh.lock').open('w') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: raise ValueError('Another refresh is already running')
        return _refresh(root,source_ids)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=ROOT)
    args=parser.parse_args()
    try: print(json.dumps(refresh(args.root),indent=2))
    except Exception as error: print('Refresh failed; no new catalog published: '+str(error),file=sys.stderr);sys.exit(1)
