const test = require('node:test');
const assert = require('node:assert/strict');
const { demoResults, isActualEvent } = require('./demo-results');
const event={id:45,title:'From Kernel to Kubectl in 30 Seconds: eBPF Observability with Inspektor Gadget',format:'Lightning Talk',track:'Project Lightning Talks',final:true,participants:0,words:[]};

test('demo timeline uses exact card choices and reconciles every report within the event',()=>{
  const timed={...event,starts_at:'2026-11-09T18:00:00Z',ends_at:'2026-11-09T18:22:30Z'};
  const demo=demoResults(timed);
  assert.deepEqual(demo,demoResults(timed));
  assert.equal(demo.timeline.durationMinutes,22.5);
  assert.equal(demo.timeline.bucketMinutes,1);
  assert.deepEqual(demo.timeline.words.map(w=>w.key),demo.words.map(w=>w.key));
  for(const row of demo.timeline.words){
    assert.equal(row.buckets.reduce((sum,b)=>sum+b.count,0),demo.words.find(w=>w.key===row.key).reported);
    assert.ok(row.buckets.every(b=>Number.isInteger(b.minute)&&b.minute>=0&&b.minute<22.5&&Number.isInteger(b.count)&&b.count>0));
    assert.equal(new Set(row.buckets.map(b=>b.minute)).size,row.buckets.length);
  }
  assert.deepEqual(demo.words,demoResults(event).words);
  assert.deepEqual(demo.choices,demoResults(event).choices);
  for(const ends_at of [timed.starts_at,'invalid','2026-11-09T17:00:00Z']){
    assert.equal(demoResults({...timed,ends_at}).timeline,null);
  }
  assert.equal(demoResults(event).timeline,null);
  const short=demoResults({...timed,ends_at:'2026-11-09T18:00:30Z'});
  assert.ok(short.timeline.words.every(w=>w.buckets.every(b=>b.minute===0)));
});

test('demo results are deterministic aggregate-only fixtures with valid exposure counts',()=>{
  const demo=demoResults(event);
  assert.deepEqual(demo,demoResults(event));
  assert.equal(demo.source,'synthetic');
  assert.ok(demo.participants>=24 && demo.participants<=96);
  assert.equal(demo.words.reduce((n,w)=>n+w.shown,0),demo.participants*24);
  assert.equal(demo.choices.length,25);
  assert.equal(demo.choices[12],'FREE');
  assert.equal(demo.words.length,24);
  assert.deepEqual(demo.words.map(w=>w.word).sort(),demo.choices.filter((_,i)=>i!==12).sort());
  assert.ok(demo.words.every(w=>w.shown===demo.participants));
  assert.ok(demo.words.some(w=>w.reported>0));
  for(const word of demo.words){
    assert.ok(word.reported>=0 && word.reported<=word.shown && word.shown<=demo.participants);
    assert.equal(word.rate,word.shown?word.reported/word.shown:null);
    assert.notEqual(word.key,'free');
  }
  assert.equal(event.participants,0);
  assert.doesNotMatch(JSON.stringify(demo),/user_id|username|winner|password/);
});
test('synthetic data never replaces real reports or appears before the correction cutoff',()=>{
  assert.equal(demoResults({...event,participants:1}),null);
  assert.equal(demoResults({...event,final:false}),null);
});
test('demo events exclude logistics, breaks and placeholder program entries',()=>{
  for(const title of ['Registration + Badge Pick-Up','Coat + Bag Check','☕ Coffee Break','🍲 Lunch | On Own','Project Lightning Talk Opening / Intro','Project Lightning Talk – Project Overview','Project Lightning Talk Closing']){
    assert.equal(isActualEvent({...event,title}),false,title);
    assert.equal(demoResults({...event,title}),null,title);
  }
  assert.equal(isActualEvent({...event,format:'Registration'}),false);
  assert.equal(isActualEvent({...event,format:'Unknown'}),false);
  for(const format of ['Keynote','End User Talk','Maintainer Track','10-Minute Tip Talk','Cloud Native Theater','ContribFest','Experience','Sponsored','Tour']) {
    assert.equal(isActualEvent({...event,title:'A substantive scheduled session',format}),true,format);
    assert.ok(demoResults({...event,title:'A substantive scheduled session',format}));
  }
  assert.equal(isActualEvent({...event,title:'Welcome + Opening Remarks',format:'Keynote'}),false);
  assert.equal(isActualEvent({...event,title:'Closing Remarks',format:'Keynote'}),false);
  assert.equal(isActualEvent({...event,title:'Solutions Showcase',format:'Expo'}),false);
  assert.equal(isActualEvent({...event,title:'CNCF Maintainer Summit',format:'Co-located (separate registration)'}),true);
  // The imported schedule incorrectly labels this named technical talk Break.
  assert.equal(isActualEvent({...event,title:'Rego Without Borders: Breaking Down Language Barriers for Security Policy',format:'Break'}),true);
});
