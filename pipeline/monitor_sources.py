"""Detect publication changes without treating changed pages as verified tariff amounts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
from datetime import datetime,timezone
from concurrent.futures import ThreadPoolExecutor
from refresh import request
ROOT=Path(__file__).resolve().parents[1]

def monitor(root=ROOT):
    registry=json.loads((root/'config/transport-sources.json').read_text())['sources']
    target=root/'data/source-monitor.json'
    previous={s['id']:s for s in json.loads(target.read_text()).get('sources',[])} if target.exists() else {}
    def check(source):
        result={'id':source['id'],'url':source.get('monitorUrl',source['url']),'checkedAt':datetime.now(timezone.utc).isoformat(),'promotesRates':False}
        try:
            body,headers=request(source.get('monitorUrl',source['url']))
            digest=hashlib.sha256(body).hexdigest();old=previous.get(source['id'],{})
            result.update(status='changed-review-required' if old.get('sha256') and old['sha256']!=digest else 'unchanged' if old.get('sha256')==digest else 'baseline-needs-review',sha256=digest,lastSuccessfulCheckAt=result['checkedAt'],bytes=len(body),upstreamModifiedAt=headers.get('Last-Modified'))
        except Exception as error:result.update(status='failed',error=str(error),sha256=previous.get(source['id'],{}).get('sha256'),lastSuccessfulCheckAt=previous.get(source['id'],{}).get('lastSuccessfulCheckAt'))
        return result
    with ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(check,registry))
    payload={'checkedAt':datetime.now(timezone.utc).isoformat(),'sources':results,'note':'Page checks are not rate validation. A successful fetch never changes verified shipment dates or prices.'}
    tmp=target.with_suffix('.tmp');tmp.write_text(json.dumps(payload,indent=2));tmp.replace(target)
    return payload
if __name__=='__main__':
    result=monitor();print(json.dumps(result,indent=2))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        lines=['## Transport publication checks','', 'Successful downloads do not validate prices.','', '| Source | Result |', '| --- | --- |']
        for source in result['sources']:
            lines.append('| '+source['id']+' | '+source['status']+' |')
            if source['status']=='failed': print('::warning::Transport publication check failed: '+source['id'])
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as summary: summary.write('\n'.join(lines)+'\n')
    sys.exit(1 if any(s['status']=='failed' for s in result['sources']) else 0)
