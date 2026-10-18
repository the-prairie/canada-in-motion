"""Acquire complete permitted source layers and atomically publish verified snapshots."""
import argparse
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
    meta=json.loads(request(url+'?f=json')[0])
    names={field['name'] for field in meta.get('fields',[])}
    if not set(source['requiredFields']) <= names: raise ValueError('Source schema changed: '+source['id'])
    oid=source['objectIdField']
    ids=sorted(query(url,{'where':'1=1','returnIdsOnly':'true'})['objectIds'])
    if not ids or len(ids)!=len(set(ids)): raise ValueError('Empty or duplicate source ID enumeration')
    batchsize=min(100,meta.get('maxRecordCount',100))
    def batch(offset):
        selected=ids[offset:offset+batchsize]
        result=query(url,{'objectIds':','.join(map(str,selected)),'outFields':'*','returnGeometry':'true','outSR':'4326'})
        if result.get('spatialReference',{}).get('wkid')!=4326: raise ValueError('Expected WGS84 geometry')
        rows=result.get('features',[])
        if sorted(row['attributes'][oid] for row in rows)!=selected: raise ValueError('Truncated or inconsistent response')
        return rows
    with ThreadPoolExecutor(max_workers=3) as pool:
        features=[row for batchrows in pool.map(batch,range(0,len(ids),batchsize)) for row in batchrows]
    final_ids=sorted(query(url,{'where':'1=1','returnIdsOnly':'true'})['objectIds'])
    if ids!=final_ids: raise ValueError('Source changed during enumeration; retry whole source')
    return features,{'sourceCount':len(ids),'upstreamModifiedAt':meta.get('editingInfo',{}).get('lastEditDate'),'enumerationVerified':True}


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


def validate(wells,source,previous_count=None,max_drop=.05):
    if not wells: raise ValueError('Empty normalized source')
    ids=set()
    for w in wells:
        if w['id'] in ids: raise ValueError('Duplicate stable ID: '+w['id'])
        ids.add(w['id'])
        if w['sourceId']!=source['id'] or w['province']!=source['province']: raise ValueError('Source identity mismatch')
        if not all(isinstance(w[k],(int,float)) and math.isfinite(w[k]) for k in ['lon','lat']): raise ValueError('Invalid coordinates')
        if not -142<=w['lon']<=-50 or not 40<=w['lat']<=84: raise ValueError('Coordinates outside Canada envelope')
        if w['closureStatus'] not in ['abandoned','active','suspended','unknown']: raise ValueError('Invalid closure status')
        if w['orphanStatus'] not in ['designated','not-designated','unknown']: raise ValueError('Invalid orphan status')
        for e in w.get('events',[]): datetime.strptime(e['date'],'%Y-%m-%d')
    if previous_count and len(wells)<previous_count*(1-max_drop): raise ValueError('Count drop exceeds review threshold')


def write_json(path,payload):
    content=json.dumps(payload,ensure_ascii=False,separators=(',',':'),allow_nan=False,default=lambda value:value.isoformat()).encode()
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(content)
    return hashlib.sha256(content).hexdigest()


def _refresh(root=ROOT,source_ids=None):
    config=json.loads((root/'config/publication.json').read_text())
    registry=json.loads((root/'config/sources.json').read_text())
    permitted=[s for s in registry if s.get('enabled') and s['publication'] in ['open','noncommercial'] and (not source_ids or s['id'] in source_ids)]
    if not permitted: raise ValueError('No permitted enabled sources')
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
        for source in permitted:
            print('Fetching '+source['id'],flush=True)
            try:
                cachefile=root/'.data-cache'/(source['id']+'-acquisition.json')
                if os.environ.get('CIM_RESUME')=='1' and cachefile.exists():
                    acquisition=json.loads(cachefile.read_text())
                    if time.time()-cachefile.stat().st_mtime > 4*3600: raise ValueError('Resume cache is older than four hours')
                    features,evidence=acquisition['features'],acquisition['evidence']
                else:
                    features,evidence=arcgis(source) if source['format']=='arcgis' else shapefile_source(source,root/'.data-cache')
                    evidence['retrievedAt']=now()
                    write_json(cachefile,{'features':features,'evidence':evidence})
                wells=[adapters.normalize(source,feature) for feature in features]
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
                assert len(wells)==evidence['sourceCount']
                wells.sort(key=lambda w:w['id'])
                source_dates=sorted({str(w.get('raw',{}).get('EXTRACT_DATE')) for w in wells if w.get('raw',{}).get('EXTRACT_DATE')})
                snapshot={**source,**evidence,'sourceDateText':'; '.join(source_dates) if source_dates else None,'count':len(wells),'retrievedAt':evidence['retrievedAt'],'scope':'full published source layer','droppedRecords':0}
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
