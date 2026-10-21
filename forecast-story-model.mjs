export function forecastStory(data,row){
  const observed=row.actuals.filter(point=>Number.isFinite(point.growthPct)).map(point=>({year:point.year,value:point.growthPct,kind:'observed'}));
  const outlook=data.forecasts.filter(point=>point.region===row.region).sort((a,b)=>a.year-b.year).map(point=>({year:point.year,value:point.predictionPct,lower:point.lowerPct,upper:point.upperPct,kind:point.horizon===0?'estimate':'forecast'}));
  const points=[...observed,...outlook];
  const values=points.flatMap(point=>[point.value,point.lower,point.upper]).filter(Number.isFinite);
  const low=Math.floor(Math.min(-1,...values)/2)*2,high=Math.ceil(Math.max(1,...values)/2)*2;
  return {observed,outlook,points,domain:[low,high],latest:observed.at(-1)||null};
}
