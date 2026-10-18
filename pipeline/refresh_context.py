"""Publish one complete group of openly licensed infrastructure references."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
from datetime import datetime, timezone
from open_transport import run

ROOT = Path(__file__).resolve().parents[1]
CONTEXT_FILES = {'historical-infrastructure.geojson', 'benchmark-tolls.json', 'pipeline-attributes.json'}

def refresh_context(root=ROOT, reuse=False, force=False):
    target=root/'data/context'
    previous=json.loads((target/'manifest.json').read_text()) if (target/'manifest.json').exists() else None
    if previous and not force:
        age=(datetime.now(timezone.utc)-datetime.fromisoformat(previous['retrievedAt'])).total_seconds()/86400
        if 0<=age<7:
            if len(previous['files']) != 3 or {entry['file'] for entry in previous['files']} != CONTEXT_FILES: raise ValueError('Unexpected stored context files')
            if not all(hashlib.sha256((target/entry['file']).read_bytes()).hexdigest()==entry['sha256'] for entry in previous['files']): raise ValueError('Stored context checksum mismatch')
            return {**previous['counts'],'reusedVerifiedSnapshot':True,'retrievedAt':previous['retrievedAt']}
    stage=Path(tempfile.mkdtemp(prefix='.context-',dir=root/'data'))
    try:
        report=run(stage,root/'.data-cache/transport',reuse)
        geometry=json.loads((stage/'historical-infrastructure.geojson').read_text())
        geometry['metadata']['observationRanges']={kind:{'earliest':min(f['properties']['sourceDateMin'] for f in geometry['features'] if f['properties']['kind']==kind),'latest':max(f['properties']['sourceDateMax'] for f in geometry['features'] if f['properties']['kind']==kind)} for kind in ['pipeline','refinery']}
        (stage/'historical-infrastructure.geojson').write_text(json.dumps(geometry,ensure_ascii=False,separators=(',',':')))
        previous=json.loads((target/'manifest.json').read_text()) if (target/'manifest.json').exists() else None
        if previous:
            for key in ['benchmarkSystems','benchmarkRows','pipelineAttributes']:
                if report[key] < previous['counts'][key] * .95: raise ValueError('Context count drop requires review: '+key)
            for key,count in report['geometry'].items():
                if count < previous['counts']['geometry'][key] * .95: raise ValueError('Geometry count drop requires review: '+key)
        files=[{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(stage.iterdir()) if p.is_file()]
        tolls=json.loads((stage/'benchmark-tolls.json').read_text())
        attributes=json.loads((stage/'pipeline-attributes.json').read_text())
        evidence=[geometry['metadata']['source'],geometry['metadata']['catalogue'],tolls['catalogue'],attributes['source'],attributes['catalogue']]+[system['source'] for system in tolls['systems']]
        oldest=min(datetime.fromisoformat(item['retrievedAt']) for item in evidence)
        manifest={'schemaVersion':1,'retrievedAt':oldest.isoformat(),'builtAt':datetime.now(timezone.utc).isoformat(),'counts':report,'files':files}
        (stage/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
        backup=root/'data/.context-previous'
        if backup.exists():shutil.rmtree(backup)
        if target.exists():target.rename(backup)
        try:stage.rename(target)
        except Exception:
            if backup.exists():backup.rename(target)
            raise
        if backup.exists():shutil.rmtree(backup)
        return report
    finally:
        if stage.exists():shutil.rmtree(stage)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=ROOT)
    parser.add_argument('--force',action='store_true')
    args=parser.parse_args()
    print(json.dumps(refresh_context(args.root,reuse=os.environ.get('CIM_CONTEXT_RESUME')=='1',force=args.force)))
