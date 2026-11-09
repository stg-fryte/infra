const test = require('node:test');
const assert = require('node:assert/strict');

test('demo dot plot labels invented timing, escapes words and has an accessible bucket table',()=>{
  const { resultsPage }=require('./results-ui');
  const result={id:45,title:'Demo',source:'synthetic',participants:5,final:true,
    starts_at:'2026-11-09T18:00:00Z',ends_at:'2026-11-09T18:20:00Z',observedAt:'2026-11-09T19:00:00Z',
    words:[{key:'test',word:'<img src=x>',reported:3,shown:5,rate:0.6,expected:true},{key:'zero',word:'Zero',reported:0,shown:5,rate:0,expected:true}],
    timeline:{durationMinutes:20,bucketMinutes:1,words:[{key:'test',word:'<img src=x>',buckets:[{minute:2,count:3}]},{key:'zero',word:'Zero',buckets:[]}]}};
  const html=resultsPage(result,{team:'test',version:'dev'});
  assert.match(html,/Demo mark timeline/);
  assert.match(html,/Invented timing/);
  assert.match(html,/Correction window/);
  assert.match(html,/Timeline counts by word and minute/);
  assert.match(html,/No simulated marks/);
  assert.doesNotMatch(html,/<img src=x>/);
  assert.match(html,/2–3 min/);
  assert.doesNotMatch(resultsPage({...result,source:'attendee'},{team:'test',version:'dev'}),/Demo mark timeline|Invented timing/);
  const unavailable=resultsPage({...result,timeline:null},{team:'test',version:'dev'});
  assert.match(unavailable,/Timing unavailable/);
  assert.doesNotMatch(unavailable.match(/<main>[\s\S]*?<\/main>/)[0],/NaN|Infinity/);
  const long=resultsPage({...result,timeline:{...result.timeline,durationMinutes:600,words:[{key:'test',word:'Test',buckets:[{minute:1,count:2},{minute:15,count:3},{minute:599,count:1}]}]}},{team:'test',version:'dev'});
  assert.match(long,/in 20 minutes/);
  assert.match(long,/0–20 min: 5 simulated marks/);
  assert.match(long,/580–600 min: 1 simulated marks/);
});

test('results escape labels, represent zero exposure and show provisional/final states', () => {
  const { resultsPage } = require('./results-ui');
  const result={id:1,title:'<script>bad()</script>',track:'Security',ends_at:'2026-11-09T23:00:00Z',closesAt:'2026-11-09T23:10:00Z',observedAt:'2026-11-09T23:05:00Z',final:false,participants:2,
    words:[{key:'k8s',word:'<img src=x>',reported:1,shown:2,rate:0.5,expected:true},{key:'gitops',word:'GitOps',reported:0,shown:0,rate:null,expected:true}]};
  const html=resultsPage(result,{team:'test',version:'dev'});
  assert.doesNotMatch(html,/<script>bad|<img src=x>/);
  assert.match(html,/50%/); assert.match(html,/Not shown/); assert.match(html,/Provisional/);
  const final=resultsPage({...result,final:true},{team:'test',version:'dev'});
  assert.match(final,/Final/); assert.doesNotMatch(final,/<meta http-equiv="refresh"/);
  const empty=resultsPage({...result,participants:0,words:[]},{team:'test',version:'dev'});
  assert.match(empty,/No reports yet/);
  const demo=resultsPage({...result,source:'synthetic',final:true},{team:'test',version:'dev'});
  assert.match(demo,/Synthetic demo data/);
  assert.match(demo,/simulated participants/);
  assert.doesNotMatch(demo,/participating accounts|One report per account/);
});
