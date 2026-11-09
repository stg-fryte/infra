const test = require('node:test');
const assert = require('node:assert/strict');

test('open winner screen preserves claim text when the correction window freezes', () => {
  const { bingoPage } = require('./ui');
  const { bingoWindow } = require('./bingo');
  const { runInNewContext } = require('node:vm');
  const end=Date.parse('2026-11-09T23:00:00Z');
  let now=end-1;
  const window=bingoWindow(new Date(end),now);
  const html=bingoPage({id:1,username:'winner'},{id:2,title:'Talk',ends_at:new Date(end),winner_user_id:1,prize:'Test prize'},
    {cells:Array.from({length:25},(_,i)=>i===12?'FREE':`Word ${i}`),marked:[0,1,2,3,4,12],bingo_at:new Date(end-1000)},
    {team:'test',version:'test',freeIndex:12,winningLines:[[0,1,2,3,4]],editable:true,window});
  const claim=html.match(/<section class="bingo-status[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.match(claim,/You won Test prize\. Show this screen at the session to claim it\./);
  const status={textContent:claim};
  const deadline={textContent:'Corrections close'};
  const buttons=Array.from({length:25},(_,i)=>({disabled:i===12}));
  const board={dataset:{closesAt:window.closesAt},querySelectorAll:()=>buttons,querySelector:()=>status,addEventListener:()=>{}};
  const timers=[];
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes("getElementById('bingo')"));
  class Clock extends Date { static now() { return now; } }
  runInNewContext(script,{document:{getElementById:id=>id==='bingo'?board:deadline},Date:Clock,setInterval:fn=>timers.push(fn)});
  for (const instant of [end,end+599999,end+600000,end+600001]) {
    now=instant; timers.forEach(fn=>fn());
    assert.equal(status.textContent,claim);
    assert.equal(buttons.every(b=>b.disabled),instant>=end+600000);
  }
  assert.equal(deadline.textContent,'Results are final. Your card is read-only.');
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
});
