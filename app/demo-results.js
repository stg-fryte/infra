const { createHash } = require('node:crypto');
const { buildCard, FREE_INDEX } = require('./bingo');

const CONTENT_FORMATS = new Set(['Talk','Lightning Talk','Workshop','Tutorial',
  'Keynote','End User Talk','Maintainer Track','10-Minute Tip Talk','Cloud Native Theater',
  'ContribFest','Experience','Sponsored','Tour',
  'Co-located (separate registration)','Sponsor-hosted Co-located','CNCF-hosted Co-located']);
function isActualEvent(event) {
  if (/registration|badge pick|coat.*check|coffee break|lunch|opening\s*\/\s*intro|lightning talk closing|project overview|opening remarks|^closing remarks$/i.test(event.title)) return false;
  // This named technical talk was misclassified as Break in the imported schedule.
  if (event.title === 'Rego Without Borders: Breaking Down Language Barriers for Security Policy') return true;
  return CONTENT_FORMATS.has(event.format);
}

function demoResults(result) {
  if (!result.final || result.participants !== 0 || !isActualEvent(result)) return null;
  let seed = createHash('sha256').update(`bingo-demo-v1:${result.id}:${result.title}`).digest().readUInt32LE(0) || 1;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const participants = 24 + Math.floor(random()*73);
  const choices = buildCard(result,random);
  const words = new Map(choices.filter((_,index)=>index!==FREE_INDEX)
    .map(word=>[word.trim().toLowerCase(),{key:word.trim().toLowerCase(),word,expected:true,shown:participants,reported:0,rate:null}]));
  // The demo represents one fixed card, so every reported word is an actual
  // choice on that card. FREE and unused vocabulary candidates never contribute.
  const popularity = new Map([...words.keys()].map(key=>[key,0.1+random()*0.8]));
  for(let account=0;account<participants;account++) {
    for(const [key,word] of words) {
      if(random()<popularity.get(key)) word.reported++;
    }
  }
  const sortedWords=[...words.values()].map(w=>({...w,rate:w.shown?w.reported/w.shown:null}))
    .sort((a,b)=>b.reported-a.reported || a.word.localeCompare(b.word));
  return {...result,source:'synthetic',participants,choices,words:sortedWords,
    timeline:demoTimeline(result,sortedWords)};
}

function demoTimeline(event, words) {
  const durationMinutes=(Date.parse(event.ends_at)-Date.parse(event.starts_at))/60000;
  if (!Number.isFinite(durationMinutes) || durationMinutes<=0) return null;
  // A separate seed preserves the existing cards and totals as timing is added.
  let seed=createHash('sha256').update(`bingo-timing-v1:${event.id}:${event.title}`).digest().readUInt32LE(0)||1;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  return {durationMinutes,bucketMinutes:1,words:words.map(({key,word,reported})=>{
    const peak=0.1+random()*0.8, spread=0.04+random()*0.09;
    const counts=new Map();
    for(let mark=0;mark<reported;mark++){
      // Most reports cluster around an invented mention; a few occur elsewhere.
      const fraction=random()<0.85 ? peak+(random()+random()-1)*spread : random();
      const minute=Math.min(Math.ceil(durationMinutes)-1,Math.max(0,Math.floor(fraction*durationMinutes)));
      counts.set(minute,(counts.get(minute)||0)+1);
    }
    return {key,word,buckets:[...counts].sort((a,b)=>a[0]-b[0]).map(([minute,count])=>({minute,count}))};
  })};
}
module.exports={demoResults,isActualEvent};
