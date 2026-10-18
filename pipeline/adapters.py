from datetime import datetime, timezone
import urllib.parse
import hashlib
import json


def date_value(value):
    if value is None: return None
    if isinstance(value,(float,int)):
        return datetime.fromtimestamp(value/1000,timezone.utc).date().isoformat()
    value=str(value).strip()
    if value.endswith('.0'): value=value[:-2]
    if value in ['', '0', '00000000']: return None
    for fmt in ['%Y-%m-%d','%Y%m%d','%m/%d/%Y']:
        try: return datetime.strptime(value[:10] if fmt=='%Y-%m-%d' else value,fmt).date().isoformat()
        except ValueError: pass
    raise ValueError('Unrecognized event date: '+value)


def normalize(source,feature):
    a=feature['attributes'];g=feature['geometry'];fields=source.get('fields',{})
    if source.get('stableIdFields'):
        values=[a[field] for field in source['stableIdFields']]
        if any(value is None or str(value).strip()=='' for value in values): raise ValueError('Missing composite source ID')
        stable=hashlib.sha256(json.dumps(values,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
    else:
        stable=str(a[source['stableIdField']]).strip()
        if not stable or stable=='None': raise ValueError('Missing stable source ID')
    if source['province']=='BC': stable=str(int(stable))
    rid=str(a.get(source.get('objectIdField'),stable))
    w={'id':source['id']+':'+stable,'province':source['province'],'lon':round(g['x'],6),'lat':round(g['y'],6),'sourceId':source['id'],'sourceRecordId':rid,'license':stable,'name':'Well '+stable,'operator':None,'closureStatus':'unknown','orphanStatus':'unknown','reclamationStatus':'Unknown','dates':{},'events':[],'sourceUrl':source['url'],'raw':{k:a.get(k) for k in source.get('rawFields',[])}}
    for target,field in fields.items():
        if target!='status': w[target]=a.get(field)
    w['name']=w.get('name') or 'Well '+stable
    w['closureStatus']=source.get('closureMapping',{}).get(a.get(fields.get('status')),'unknown')
    if source['format']=='arcgis':
        w['sourceUrl']=source['url']+'/query?'+urllib.parse.urlencode({'where':source['objectIdField']+'='+rid,'outFields':'*','returnGeometry':'false','f':'pjson'})
    for target,field in source.get('dates',{}).items():
        if a.get(field) is not None: w['dates'][target]=date_value(a[field])
    for rule in source.get('conditionalDates',[]):
        if (w['closureStatus']==rule['whenStatus'] if 'whenStatus' in rule else all(a.get(k)==v for k,v in rule['when'].items())) and a.get(rule['field']) is not None:
            w['dates'][rule['target']]=date_value(a[rule['field']])
    if source.get('reclamationMapping'):
        mapping=source['reclamationMapping'];w['reclamationStatus']=mapping['values'].get(a.get(mapping['field']),'Unknown')
    if source['province']=='AB':
        w['name']='Well '+stable
        w['reclamationStatus']={'RecCertified':'Certified','RecExempt':'Exempt'}.get(a['Status'],'Unknown')
    if source['id']=='sk-orphan-wells':
        if a.get('INFRASTRUCTURE_TYPE')!='Well': raise ValueError('Unexpected non-well SK feature')
        w.update(name='Well '+stable,license=stable,operator=a['LICENSEE_NAME'],wellType=a['LICENCE_TYPE_DESCRIPTION'],orphanStatus='designated',closureStatus='abandoned' if a.get('CURRENT_ORPHAN_ABANDONMENT_STA')=='Completed' or a.get('ABANDONMENT_DATE') is not None else 'unknown',locationLabel=a['SURFACE_LAND_LOCATION'],reclamationStatus=a['CURRENT_ORPHAN_RECLAMATION_STA'])
        for target,field in {'orphanDesignated':'DEEMED_ORPHAN_DATE','abandoned':'ABANDONMENT_DATE','reclaimed':'RECLAMATION_DATE','transferred':'TRANSFERRED_DATE'}.items():
            if a.get(field) is not None:w['dates'][target]=date_value(a[field])
        w['raw']={k:a.get(k) for k in ['CURRENT_ORPHAN_ABANDONMENT_STA','CURRENT_ORPHAN_RECLAMATION_STA','EXTRACT_DATE','SITE_CONSENT_GRANTED','VIABLE_WIP']}
    kinds={'orphanDesignated':('orphan-designated','Orphan designation recorded'),'abandoned':('abandoned','Abandonment recorded'),'reclaimed':('reclaimed','Reclamation recorded'),'transferred':('transferred','Transfer recorded')}
    w['dates']={k:v for k,v in w['dates'].items() if v}
    w['events']=sorted([{'type':kinds[k][0],'label':kinds[k][1],'date':v,'sourceId':source['id']} for k,v in w['dates'].items()],key=lambda e:e['date'])
    return w
