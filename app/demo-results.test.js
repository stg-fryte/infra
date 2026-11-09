const test = require('node:test');
const assert = require('node:assert/strict');
const { demoResults, isActualEvent } = require('./demo-results');
const event={id:45,title:'From Kernel to Kubectl in 30 Seconds: eBPF Observability with Inspektor Gadget',format:'Lightning Talk',track:'Project Lightning Talks',final:true,participants:0,words:[]};

test('demo results are deterministic aggregate-only fixtures with valid exposure counts',()=>{
  const demo=demoResults(event);
  assert.deepEqual(demo,demoResults(event));
  assert.equal(demo.source,'synthetic');
  assert.ok(demo.participants>=24 && demo.participants<=96);
  assert.equal(demo.words.reduce((n,w)=>n+w.shown,0),demo.participants*24);
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
  assert.equal(isActualEvent({...event,title:'CNCF Maintainer Summit',format:'Co-located (separate registration)'}),true);
  // The imported schedule incorrectly labels this named technical talk Break.
  assert.equal(isActualEvent({...event,title:'Rego Without Borders: Breaking Down Language Barriers for Security Policy',format:'Break'}),true);
});
