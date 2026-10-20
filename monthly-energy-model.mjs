const REGIONS=['CA','NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU'];
const DEFINITIONS={oil:{unit:'m³',sourceId:'statcan-25100063',sourceUnit:'Cubic metres',sourceScale:'units'},gas:{unit:'GJ',sourceId:'statcan-25100086',sourceUnit:'Gigajoules',sourceScale:'thousands'},electricity:{unit:'MWh',sourceId:'statcan-25100015',sourceUnit:'Megawatt hours',sourceScale:'units'}};
const FLAGS={'x':'suppressed','..':'missing','...':'not-applicable','F':'unreliable'};
const AVAILABLE_FLAGS=['','p','r','A','B','C','D','E','0s'];
const STATUSES=['available','suppressed','missing','not-applicable','unreliable','not-reported'];
const assert=(value,message)=>{if(!value)throw Error(`Monthly energy: ${message}`);};
export const monthBefore=(month,count=12)=>{const [year,m]=month.split('-').map(Number);const d=new Date(Date.UTC(year,m-1-count,1));return d.toISOString().slice(0,7);};
export function validateMonthlyEnergy(data){
  assert(data?.schemaVersion===1&&typeof data.dataVersion==='string'&&data.dataVersion.length>=16,'invalid snapshot');
  assert(Number.isFinite(Date.parse(data.generatedAt)),'invalid retrieval date');
  assert(data.regions?.length===14&&new Set(data.regions.map(r=>r.code)).size===14&&data.regions.every(r=>REGIONS.includes(r.code)&&r.name),'invalid regions');
  assert(data.metrics?.length===3&&new Set(data.metrics.map(m=>m.id)).size===3,'invalid metrics');
  assert(data.sources?.length===3&&new Set(data.sources.map(s=>s.id)).size===3,'invalid sources');
  for(const metric of data.metrics){
    const expected=DEFINITIONS[metric.id];
    assert(expected&&Object.entries(expected).every(([key,value])=>metric[key]===value),'unit or source mismatch');
    const source=data.sources.find(s=>s.id===metric.sourceId);
    assert(source&&/^https:\/\/www150.statcan.gc.ca\//.test(source.url)&&/^https:\/\/www150.statcan.gc.ca\//.test(source.downloadUrl)&&/^https:\/\//.test(source.licenceUrl),'source provenance missing');
    assert(/^[a-f0-9]{64}$/.test(source.sha256)&&/^[a-f0-9]{64}$/.test(source.metadataSha256),'source hash missing');
    assert(/^\d{4}-\d{2}-\d{2}$/.test(source.releasedAt)&&Number.isFinite(Date.parse(source.retrievedAt)),'source dates missing');
    assert(/^\d{4}-(0[1-9]|1[0-2])$/.test(metric.latestMonth)&&metric.months?.length===36,'invalid period');
    assert(metric.months.every((m,i)=>m===monthBefore(metric.latestMonth,35-i)),'nonconsecutive months');
    assert(metric.observations?.length===36*14,'incomplete observation grid');
    const keys=new Set();
    for(const row of metric.observations){
      const key=`${row.region}/${row.month}`;
      assert(REGIONS.includes(row.region)&&metric.months.includes(row.month)&&!keys.has(key),'invalid or duplicate observation');keys.add(key);
      assert(STATUSES.includes(row.status),'invalid status');
      assert(row.status==='available'?Number.isFinite(row.value)&&row.value>=0:row.value===null,'value/status mismatch');
      assert(row.status==='not-reported'?row.vector===null:typeof row.vector==='string'&&/^v\d+$/.test(row.vector),'invalid series vector');
      if(row.status==='not-reported')assert(row.sourceStatus===null&&row.sourceSymbol===null,'unreported row carries source flags');
      else {
        const flags=[row.sourceStatus,row.sourceSymbol];
        assert(flags.every(flag=>AVAILABLE_FLAGS.includes(flag)||Object.hasOwn(FLAGS,flag)),'unknown source flag');
        const unavailable=flags.filter(flag=>Object.hasOwn(FLAGS,flag)).map(flag=>FLAGS[flag]);
        assert(unavailable.length?unavailable.every(status=>status===row.status):['available','missing'].includes(row.status),'source flag/status mismatch');
      }
    }
    assert(metric.observations.some(r=>r.region==='CA'&&r.month===metric.latestMonth&&r.status==='available'),'missing national observation');
  }
  return data;
}
export function monthlyObservation(metric,region,month=metric.latestMonth){
  const row=metric.observations.find(r=>r.region===region&&r.month===month);
  if(!row)throw Error('Monthly energy: unknown selection');
  const previous=metric.observations.find(r=>r.region===region&&r.month===monthBefore(month));
  const comparable=row.status==='available'&&previous?.status==='available'&&previous.value>0;
  return {...row,previousValue:previous?.value??null,previousStatus:previous?.status??'outside-window',yoyPct:comparable?(row.value/previous.value-1)*100:null};
}
export function summarizeMonthlyEnergy(data,{region='CA',commodity=null,compare=null}={}){
  validateMonthlyEnergy(data);
  assert(REGIONS.includes(region)&&(!compare||REGIONS.includes(compare)),'unknown region');
  assert(commodity===null||Object.hasOwn(DEFINITIONS,commodity),'unknown commodity');
  return {dataVersion:data.dataVersion,generatedAt:data.generatedAt,region,compare:compare===region?null:compare,
    metrics:data.metrics.filter(m=>!commodity||m.id===commodity).map(metric=>({...metric,
      observations:undefined,latest:monthlyObservation(metric,region),
      comparison:compare&&compare!==region?monthlyObservation(metric,compare):null,
      history:metric.months.slice(-24).map(month=>monthlyObservation(metric,region,month)),
      source:data.sources.find(s=>s.id===metric.sourceId)}))};
}
