import {project} from './atlas-model.mjs';

export const TRADE_ANCHORS={BC:[-125,54],AB:[-115,54],SK:[-106,54],MB:[-98,54],ON:[-85,50],QC:[-71,51],NB:[-66,46.5],NS:[-63,45],PE:[-63.2,46.5],NL:[-57,53],YT:[-136,64],NT:[-120,65],NU:[-95,67]};

export function tradeMapGeometry(shapes,{regions=[],width=620,height=464,padding=26}={}){
  const selected=shapes.filter(shape=>regions.includes(shape.code));
  const points=(selected.length?selected:shapes).flatMap(shape=>shape.rings.flat());
  if(!points.length)return null;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const west=Math.min(...xs),east=Math.max(...xs),south=Math.min(...ys),north=Math.max(...ys);
  const scale=Math.min((width-2*padding)/Math.max(1,east-west),(height-2*padding)/Math.max(1,north-south));
  const convert=([x,y])=>[width/2+(x-(west+east)/2)*scale,height/2-(y-(south+north)/2)*scale];
  const anchors=Object.fromEntries(Object.entries(TRADE_ANCHORS).map(([code,point])=>[code,convert(project(...point))]));
  const labels=Object.fromEntries(regions.map(code=>[code,[anchors[code][0],Math.max(16,anchors[code][1]-16)]]));
  if(regions.length===2){
    const [a,b]=regions.map(code=>anchors[code]);
    if(Math.abs(a[0]-b[0])<36&&Math.abs(a[1]-b[1])<42){
      const lower=regions[a[1]>b[1]?0:1];
      labels[lower][1]=Math.min(height-5,anchors[lower][1]+26);
    }
  }
  const paths=shapes.map(shape=>({code:shape.code,d:shape.rings.map(ring=>ring.map((point,i)=>`${i?'L':'M'}${convert(point).join(',')}`).join(' ')+'Z').join(' ')}));
  return {paths,anchors,labels,path:(origin,destination)=>{const [x,y]=anchors[origin],[u,v]=anchors[destination];return `M${x},${y} Q${(x+u)/2-(v-y)*.2},${(y+v)/2+(u-x)*.2} ${u},${v}`;}};
}

export function guidedMapScene(result){
  const step=result.selection.guideStep;
  return {
    step,
    hasFlow:result.exchange.available&&result.exchange.value>0,
    motionMeaning:'Direction only; not shipment routes or speed.',
    rows:result.provinces.map(province=>{
      const common={region:province.region,name:province.name,role:province.role};
      if(step==='exchange')return {...common,value:result.exchange.change,unit:'million-cad',label:province.role==='seller'?'Receipts change':'Costs change'};
      if(step==='provinces')return {...common,value:province.gdp?.status==='supported'?province.gdp.estimatePct:null,unit:'percent',label:'Real GDP change'};
      const household=province.household;
      return {...common,value:['supported','retail-scenario'].includes(household?.status)?household.annualChangeCad:null,unit:'cad-year',label:`${household?.categoryLabel||'Spending'} change`};
    })
  };
}
