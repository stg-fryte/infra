const { createHash } = require('node:crypto');
const { buildCard, expectedWords, FREE_INDEX } = require('./bingo');

const CONTENT_FORMATS = new Set(['Talk','Lightning Talk','Workshop','Tutorial',
  'Co-located (separate registration)','Sponsor-hosted Co-located','CNCF-hosted Co-located']);
function isActualEvent(event) {
  if (/registration|badge pick|coat.*check|coffee break|lunch|opening\s*\/\s*intro|lightning talk closing|project overview/i.test(event.title)) return false;
  // This named technical talk was misclassified as Break in the imported schedule.
  if (event.title === 'Rego Without Borders: Breaking Down Language Barriers for Security Policy') return true;
  return CONTENT_FORMATS.has(event.format);
}

function demoResults(result) {
  if (!result.final || result.participants !== 0 || !isActualEvent(result)) return null;
  let seed = createHash('sha256').update(`bingo-demo-v1:${result.id}:${result.title}`).digest().readUInt32LE(0) || 1;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const participants = 24 + Math.floor(random()*73);
  const words = new Map(expectedWords(result).map(w=>[w.key,{...w,expected:true,shown:0,reported:0,rate:null}]));
  // Assign a stable popularity to each word, then simulate exposure using the
  // actual card generator. Only aggregate counters survive this function.
  const popularity = new Map([...words.keys()].map(key=>[key,0.1+random()*0.8]));
  for(let account=0;account<participants;account++) {
    buildCard(result,random).forEach((label,index)=>{
      if(index===FREE_INDEX) return;
      const key=label.trim().toLowerCase(), word=words.get(key);
      word.shown++;
      if(random()<popularity.get(key)) word.reported++;
    });
  }
  return {...result,source:'synthetic',participants,
    words:[...words.values()].map(w=>({...w,rate:w.shown?w.reported/w.shown:null}))
      .sort((a,b)=>b.reported-a.reported || a.word.localeCompare(b.word))};
}
module.exports={demoResults,isActualEvent};
