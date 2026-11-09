const test = require('node:test');
const assert = require('node:assert/strict');

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
