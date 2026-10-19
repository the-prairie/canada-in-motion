// Check explicit English oil-price magnitudes before asking a model to select
// a bounded scenario. A schema alone can tempt a model to scale an invalid
// request into range (for example, ninety percent into nine percent).
const values={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const numberWords=Object.keys(values).concat(['hundred','thousand','and','point','minus','negative','plus']).join('|');
const amount=`[+-]?(?:\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)|(?:\\b(?:${numberWords})\\b[ -]*)+`;
function parseAmount(value){
  const numeric=Number(value.replaceAll(',','').trim());if(Number.isFinite(numeric))return numeric;
  const words=value.trim().split(/[ -]+/);let total=0,group=0,sign=1;
  for(let i=0;i<words.length;i++){
    const word=words[i];
    if(word==='minus'||word==='negative'){sign=-1;continue;}
    if(word==='and'||word==='plus')continue;
    if(word==='point'){
      const decimals=words.slice(i+1).map(w=>values[w]);
      if(!decimals.length||decimals.some(n=>n===undefined||n>9))return null;
      return sign*(total+group+Number('0.'+decimals.join('')));
    }
    if(word==='hundred')group=(group||1)*100;
    else if(word==='thousand'){total+=(group||1)*1000;group=0;}
    else if(Object.hasOwn(values,word))group+=values[word];
    else return null;
  }
  return sign*(total+group);
}
const oil='(?:oil(?:[- ]prices?)?|crude(?: oil)?(?:[- ]prices?)?|(?:wti|wcs|brent)(?:[- ]prices?)?)';
const movement='(?:falls?|fell|drops?|rises?|rose|increases?|decreases?|declines?|changes?|cuts?|reduces?|up|down|shock)';
const unit='(?:%|percent\\b|per cent\\b|as a fraction\\b|of (?:the |its )?(?:original |current )?price\\b)';
export function hasUnsupportedOilChange(question,maximum=20){
  const text=question.toLowerCase();
  const oilVerb=`\\b${oil}\\s+(?:(?:will|would|could|is|are|was|were|to)\\s+)?${movement}`;
  const verbOil=`\\b(?:cut|reduce|raise|increase|decrease|drop|change)\\s+(?:the\\s+)?${oil}`;
  const matches=[];
  for(const prefix of [oilVerb,verbOil]){
    const expression=new RegExp(`${prefix}\\s*:?\\s*(by|to|of)?\\s*(${amount})\\s*(${unit})`,'g');
    for(const match of text.matchAll(expression))matches.push({relation:match[1],amount:match[2],unit:match[3]});
  }
  const preceding=new RegExp(`(${amount})\\s*(${unit})\\s+(?:fall|drop|rise|increase|decrease|decline|reduction|change|shock)\\s+(?:in|to|of|for)\\s+(?:the\\s+)?${oil}\\b`,'g');
  for(const match of text.matchAll(preceding))matches.push({relation:'by',amount:match[1],unit:match[2]});
  for(const match of matches){
    let value=parseAmount(match.amount);if(value===null)continue;
    if(!/%|percent|per cent/.test(match.unit))value*=100;
    if(match.relation==='to')value-=100;
    if(Math.abs(value)>maximum)return true;
  }
  // Bind half/double to the price action, never to a duration or another topic.
  const priceObject='(?:(?:oil|crude(?: oil)?|wti|wcs|brent)[- ]prices?)';
  const largeAction=new RegExp(`\\b(?:double|halve)\\s+(?:the\\s+)?${priceObject}\\b|\\b${priceObject}\\s+(?:(?:will|would|could|is|are)\\s+)?(?:doubles?|halves?|halved|doubled)\\b|${oilVerb}\\s+by\\s+(?:a\\s+)?half\\b(?!\\s+(?:a\\s+(?:percent|per cent|%)|of\\s+one\\s+(?:percent|per cent|%)))`);
  return largeAction.test(text);
}
