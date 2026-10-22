#!/usr/bin/env python3
"""Reproduce Alberta RN stock-flow extract and retrospective holdout, stdlib only.
Source workbook is the official CIHI 2016–2025 table, cached alongside the app.
No model parameter uses the held-out years. AHS supplementary observations are
manually transcribed, with exact page/row provenance and separated units/scopes.
"""
from pathlib import Path
import argparse, datetime, hashlib, json, math, re, statistics, urllib.request, zipfile
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
URL='https://www.cihi.ca/sites/default/files/document/nursing-in-canada-2016-2025-data-tables-en.xlsx'
CACHE=ROOT/'.data-cache/capacity-workforce/nursing-in-canada-2016-2025-data-tables-en.xlsx'
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def workbook(path):
    with zipfile.ZipFile(path) as z:
        ss=[''.join(t.text or '' for t in e.iter() if t.tag.endswith('}t')) for e in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        rel={e.attrib['Id']:e.attrib['Target'] for e in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        out={}
        for e in ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets',NS):
            p=rel[e.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            p=p.lstrip('/') if p.startswith('/') else 'xl/'+p
            rows=[]
            for r in ET.fromstring(z.read(p)).findall('.//m:row',NS):
                cells={}
                for c in r:
                    v=c.find('m:v',NS)
                    if v is not None: cells[c.attrib['r']]=ss[int(v.text)] if c.attrib.get('t')=='s' else v.text
                if cells: rows.append(cells)
            out[e.attrib['name']]=rows
        return out

def metrics(pairs):
    errors=[p['predicted']-p['actual'] for p in pairs]
    return {'n':len(pairs),'mae':statistics.mean(map(abs,errors)), 'rmse':math.sqrt(statistics.mean(e*e for e in errors)), 'mapePercent':statistics.mean(abs(e)/p['actual']*100 for e,p in zip(errors,pairs)), 'bias':statistics.mean(errors)}

def build(path):
    sheets=workbook(path); rows={}; provenance={}
    header=sheets['Table 3a'][1]
    assert [header.get(f'{c}2') for c in 'EFGHIJKLMN']==[str(y) for y in range(2016,2026)], 'CIHI year columns changed'
    fields={'Supply':'supply','Inflow':'inflow','Outflow':'outflow','Renewal':'renewal'}
    for row in sheets['Table 3a']:
        d={re.sub('[0-9]','',k):v for k,v in row.items()}
        if d.get('A')=='Registered nurses' and d.get('B')=='Alberta' and d.get('D')=='Total' and d.get('C') in fields:
            field=fields[d['C']]; rows[field]={}; provenance[field]=list(row)[0][1:]
            for year,col in zip(range(2016,2026),'EFGHIJKLMN'):
                raw=d[col]; rows[field][year]=int(raw) if raw.isdigit() else None
    assert set(rows)==set(fields.values()), 'CIHI schema changed'
    history=[{'year':y,**{k:v[y] for k,v in rows.items()},'sourceId':'cihi-nursing-2025','cells':{k:f'{chr(69+y-2016)}{r}' for k,r in provenance.items()}} for y in range(2016,2026)]
    byyear={r['year']:r for r in history}
    replay=[]
    for y in range(2017,2026):
        predicted=byyear[y-1]['supply']-byyear[y-1]['outflow']+byyear[y]['inflow']
        replay.append({'year':y,'actual':byyear[y]['supply'],'predicted':predicted,'residual':byyear[y]['supply']-predicted})
    assert all(r['residual']==0 for r in replay), 'Stock/flow reconciliation failed'
    # O2020 depends on 2021 registration, so exclude it at the 2020 origin.
    training_inflow=[byyear[y]['inflow'] for y in range(2016,2021)]
    inflow=statistics.mean(training_inflow)
    exit_rate=sum(byyear[y]['outflow'] for y in range(2016,2020))/sum(byyear[y]['supply'] for y in range(2016,2020))
    prediction=byyear[2020]['supply']; holdout=[]
    drift=(byyear[2020]['supply']-byyear[2016]['supply'])/4
    for y in range(2021,2026):
        prediction=prediction*(1-exit_rate)+inflow
        holdout.append({'year':y,'actual':byyear[y]['supply'],'predicted':prediction})
    flat=[{'year':y,'actual':byyear[y]['supply'],'predicted':byyear[2020]['supply']} for y in range(2021,2026)]
    linear=[{'year':y,'actual':byyear[y]['supply'],'predicted':byyear[2020]['supply']+(y-2020)*drift} for y in range(2021,2026)]
    source={'id':'cihi-nursing-2025','publisher':'Canadian Institute for Health Information','title':'Nursing in Canada, 2016 to 2025 — Data Tables','url':URL,'landingUrl':'https://www.cihi.ca/en/registered-nurses','publishedAt':'2026-07-23','retrievedAt':'2026-10-21','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'cachedPath':str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),'locator':'Table 3a, Alberta / Registered nurses / Total; rows 870, 882, 887, 892; E:N = 2016:2025'}
    sources=[source,{'id':'cihi-methods-2025','publisher':'CIHI','title':'Nursing in Canada, 2025 — Methodology Notes','url':'https://www.cihi.ca/sites/default/files/document/nursing-in-canada-2025-meth-notes-en.pdf','publishedAt':'2026','retrievedAt':'2026-10-21','locator':'Printed pages 9–16 population definitions; page 22 flow timing; pages 36 and 40 Alberta limitations'}, {'id':'ahs-2025','publisher':'Alberta Health Services','title':'2024–25 AHS Annual Report','url':'https://www.albertahealthservices.ca/assets/about/publications/ahs-pub-pr-2024-25-q4.pdf','publishedAt':None,'dataAsOf':'2025-06-09','retrievedAt':'2026-10-21','locator':'PDF/printed p10 staff; p11 Recovery Alberta footnote; p15 vacancy; p22 recruitment; p24 vacancy definition; p31 surgical retention; p51 FTE'}, {'id':'ahs-2022','publisher':'Alberta Health Services','title':'2021–22 Report to the Community: AHS By The Numbers','url':'https://www.albertahealthservices.ca/assets/About/publications/ahs-ar-2022/ahs-numbers.html','publishedAt':None,'dataAsOf':'2022-05-11','retrievedAt':'2026-10-21','locator':'Provincial Quick Facts, Workforce, AHS Staff row'}]
    baseline_i=statistics.mean(byyear[y]['inflow'] for y in [2023,2024,2025])
    baseline_q=sum(byyear[y]['outflow'] for y in [2022,2023,2024])/sum(byyear[y]['supply'] for y in [2022,2023,2024])
    return {'schemaVersion':1,'retrievedAt':'2026-10-21','title':'Alberta workforce: registration flows and employer context','sources':sources,
      'registeredNurses':{'geography':'Alberta','unit':'people with eligible RN registration; not FTE, jobs or employer hires','frequency':'annual registration snapshot','history':history,'definitions':{'supply':'Eligible-to-practise registrants, including employed and not employed; secondary registrations excluded. First six months of registration year.','inflow':'Registered in year t but not registered in the same jurisdiction in t−1; includes new graduates, migrants and returners.','outflow':'Registered in year t but did not renew in same jurisdiction in t+1. Requires next-year data, so latest year is unavailable.','renewal':'Registered in t and t−1.','retention':'1−outflow[t]/supply[t] is next-snapshot registration persistence, not employer retention.'},
      'model':{'status':'conditional scenario; causal effects not estimated','equation':'S[t+1] = max(0, S[t]*(1−max(0,q−retentionImprovementPP/100)) + I + extraEntrants[t+1−delayYears])','originYear':2025,'originSupply':44799,'baselineAnnualEntrants':baseline_i,'baselineOutflowRate':baseline_q,'calibration':'Entrants average 2023–2025; outflow divided by supply, pooled 2022–2024. Includes registration-policy regime change; no evidence that this rate persists.','controls':{'extraEntrantsPerYear':{'min':0,'max':3000,'default':0,'unit':'additional RN registrants/year','rationale':'Scenario range chosen for usability; not estimated recruitment capacity. Historical total entrants ranged 2390–7783.'},'retentionImprovementPP':{'min':0,'max':2,'default':0,'unit':'percentage points less annual registration outflow','rationale':'Illustrative sensitivity; cannot exceed baseline exit rate. No estimated program effect.'},'delayYears':{'min':0,'max':3,'default':1,'unit':'years to realize extra registrations','rationale':'Explicit assumption, not an estimated lag; 0 allows immediate registrations, 1–3 explores delay.'}},'constraints':['Never label registration entrants as hires or registration supply as hospital staffing.','Do not convert to staffed beds, surgeries, school capacity, wait times or dollars.','Separate new registrations from starting work; eligibility is necessary but insufficient.','Do not assume migration, pay, funding or recruitment policy causes a chosen scenario gain.']},
      'validation':{'accountingReplay':{'label':'Accounting identity with observed flows; not forecast validation','formula':'S[t+1]=S[t]−outflow[t]+inflow[t+1]','rows':replay,'metrics':metrics(replay)},'retrospectiveHoldout':{'label':'Retrospective chronological holdout using July 2026 revised data; not a real-time vintage backtest','originYear':2020,'trainingInflowYears':[2016,2017,2018,2019,2020],'trainingOutflowYears':[2016,2017,2018,2019],'holdoutYears':[2021,2022,2023,2024,2025],'annualEntrants':inflow,'outflowRate':exit_rate,'method':'Freeze training mean inflow and pooled outflow/supply; recursively forecast 2021–2025 from observed 2020 stock. No observed holdout flows or stocks enter predictions. Outflow2020 excluded because it uses 2021 registrations.','rows':holdout,'metrics':metrics(holdout),'noChangeBaseline':{'rows':flat,'metrics':metrics(flat)},'linearDriftBaseline':{'annualDrift':drift,'rows':linear,'metrics':metrics(linear)},'interpretation':'Failure to anticipate the 2024 registration-process increase limits trend extrapolation. Five annual outcomes, including COVID and a process change, cannot validate future policy effects.'}},
      'limitations':['RN employed/direct-care data suppressed from 2024 because voluntary employment reporting creates significant under-coverage.','CIHI attributes 2024 supply increase to additional registration pathways; it is not proof of equivalent new jobs or hours.','2021 supply includes partial pandemic return-to-practice registrations only.','Historical series is revised in the 2026 publication; original release-vintage information sets were not reconstructed.']},
      'employerContext':{'scope':'AHS reported staff headcount, all occupations; not nurse-only FTE','staffHistory':[{'fiscalYear':y,'staff':v,'sourceId':s} for y,v,s in [('2018-19',102717,'ahs-2022'),('2019-20',103340,'ahs-2022'),('2020-21',108689,'ahs-2022'),('2021-22',112373,'ahs-2025'),('2022-23',111159,'ahs-2025'),('2023-24',113897,'ahs-2025'),('2024-25',115464,'ahs-2025')]],'scopeWarning':'2024–25 headcount includes 10,580 Recovery Alberta employees to retain reporting context. It is not the current AHS-only organization. Do not mix it with AHS-only vacancy rate/FTE.',
      'vacancyRates':[{'fiscalYear':y,'percent':v,'sourceId':'ahs-2025'} for y,v in [('2021-22',14.2),('2022-23',14.8),('2023-24',11.8),('2024-25',11.3)]], 'vacancyDefinition':'Vacant positions as percentage of all filled and vacant AHS positions; not employee exits or turnover; changing position counts can change rate.',
      'paidHoursFTE':[{'fiscalYear':'2023-24','fte':89324,'clinical':56685,'other':29312,'management':3327,'annualHoursDenominator':2030.5,'sourceId':'ahs-2025'},{'fiscalYear':'2024-25','fte':87062,'clinical':55326,'other':28728,'management':3008,'annualHoursDenominator':2022.75,'sourceId':'ahs-2025'}], 'fteDefinition':'Total paid hours including overtime, relief and paid time off divided by full-time annual hours. Includes workforce workload, not unique people. 2024–25 drop mainly transfers to Recovery Alberta and reduced overtime; cannot be interpreted as departures.',
      'recruitmentEvidence':{'fiscalYear':'2024-25','ienHired':208,'ienOffersAccepted':'over 600','ienArrivedAndStarted':'over 200','sourceId':'ahs-2025','locator':'p22 initiative offers/arrivals; p51 hiring count','note':'Subset of workforce. Offers, arrivals and hires are different measures and possibly cohorts; their ratio is not a measured completion rate or lag.'}, 'retentionEvidence':{'fiscalYear':'2024-25','surgicalRNOneYearRetentionPercent':67,'sourceId':'ahs-2025','locator':'p31','note':'Specialty-specific measure, stable relative to prior years. Do not apply to AHS organization or all nurses.'},
      'modelOption':{'status':'Only conditional incremental staffing sensitivity supported; no published organization-wide gross hires/exits time series identified in reviewed reports','equation':'IncrementalStaff[t+1] = assumedPersistence*IncrementalStaff[t] + extraHiresWhoStart[t−delay] + additionalExistingStaffRetained[t]','units':'additional people relative to a separately labelled baseline','requirements':['Default extra hires/retention gains to zero.','Persistence and delays must be visibly user assumptions; do not estimate them from RN registration outflow.','Do not add headcount to FTE or derive vacancies from headcount.','Baseline net headcount trend can be backtested, but cannot identify hiring vs attrition or policy effectiveness.']}}}

def main():
    p=argparse.ArgumentParser();p.add_argument('--refresh',action='store_true');p.add_argument('--source-file',type=Path,default=CACHE);p.add_argument('--output',type=Path,default=ROOT/'capacity-workforce-research.json');a=p.parse_args()
    if a.refresh or not a.source_file.exists():
        a.source_file.parent.mkdir(parents=True,exist_ok=True);urllib.request.urlretrieve(URL,a.source_file)
    d=build(a.source_file);a.output.write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'output':str(a.output),'rows':len(d['registeredNurses']['history']),'holdoutMetrics':d['registeredNurses']['validation']['retrospectiveHoldout']['metrics']}))
if __name__=='__main__':main()
