export const tradeLinkKey=row=>`${row.origin}-${row.destination}`;
export function networkConnections(links,{focus=null,active=null,maximum=12}={}) {
  const scoped=links.filter(row=>!focus||row.origin===focus||row.destination===focus);
  const positive=scoped.filter(row=>Number.isFinite(row.value)&&row.value>0).sort((a,b)=>b.value-a.value||tradeLinkKey(a).localeCompare(tradeLinkKey(b)));
  const top=positive.slice(0,maximum),picked=positive.find(row=>tradeLinkKey(row)===active);
  const shown=picked&&!top.includes(picked)?[...top,picked]:top;
  const total=positive.reduce((sum,row)=>sum+row.value,0),visible=shown.reduce((sum,row)=>sum+row.value,0);
  return {shown,positive,total,visible,share:total?visible/total*100:null,omitted:positive.length-shown.length,unpublished:scoped.filter(row=>row.value===null).length,zeros:scoped.filter(row=>row.value===0).length};
}

export function normalizeNetworkSelection(links,selection) {
  const focus=links.some(row=>row.origin===selection.tradeFocus||row.destination===selection.tradeFocus)?selection.tradeFocus:null;
  const connection=links.some(row=>tradeLinkKey(row)===selection.tradeConnection&&(!focus||row.origin===focus||row.destination===focus))?selection.tradeConnection:null;
  return {...selection,tradeFocus:focus,tradeConnection:connection};
}
