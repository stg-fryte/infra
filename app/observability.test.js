const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');

test('invalid optional telemetry configuration does not prevent startup', async () => {
  const { createObservability } = require('./observability');
  for (const env of [
    { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://example.invalid', OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer%bad' },
    { OTEL_EXPORTER_OTLP_ENDPOINT: 'not a URL' },
  ]) {
    const telemetry = createObservability({ env });
    assert.doesNotThrow(() => telemetry.recordRequest('GET','/',200,0.01));
    await telemetry.provider.shutdown();
  }
});

test('metrics use aggregate gauges, safe route labels and current snapshots', async t => {
  const { createObservability } = require('./observability');
  const telemetry=createObservability({env:{},instanceId:'test-instance'});
  const server=http.createServer((req,res)=>telemetry.prometheus.getMetricsRequestHandler(req,res));
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async()=>{await telemetry.provider.shutdown(); server.close();});
  const fixture=[{id:3,participants:2,final:false,words:[{key:'kubernetes',reported:1,shown:2}]}];
  telemetry.updateResults(fixture);
  telemetry.recordRequest('POST','/bingo/123/mark?token=secret',303,0.04);
  telemetry.recordRequest('GET','/unknown/private-user',404,0.01);
  telemetry.recordDatabase('SELECT',0.02,false);
  const scrape=()=>fetch(`http://127.0.0.1:${server.address().port}/metrics`).then(r=>r.text());
  const output=await scrape();
  assert.match(output,/bingo_word_reported\{[^\n]*session_id="3"[^\n]*\} 1/);
  assert.match(output,/bingo_word_shown\{[^\n]*\} 2/);
  assert.match(output,/bingo_participants\{[^\n]*\} 2/);
  assert.match(output,/route="\/bingo\/:id\/mark"/);
  assert.doesNotMatch(output,/secret|123|private-user|user_id|cookie/);
  assert.match(output,/db_query_duration/);
  telemetry.updateDemoResults([{id:45,participants:30,final:true,source:'synthetic',words:[{key:'ebpf',reported:15,shown:20}]}]);
  const demoOutput=await scrape();
  assert.match(demoOutput,/bingo_demo_word_reported\{[^\n]*session_id="45"[^\n]*\} 15/);
  assert.doesNotMatch(demoOutput,/bingo_word_reported\{[^\n]*session_id="45"/);
  telemetry.updateDemoResults([]);
  assert.match(await scrape(),/bingo_demo_word_reported\{[^\n]*session_id="45"[^\n]*\} NaN/);
  telemetry.updateResults([{...fixture[0],words:[{key:'kubernetes',reported:0,shown:2}]}]);
  assert.match(await scrape(),/bingo_word_reported\{[^\n]*\} 0/);
  telemetry.updateResults(fixture,0);
  const stale=await scrape();
  assert.match(stale,/bingo_word_reported\{[^\n]*\} NaN/);
  assert.match(stale,/bingo_aggregate_fresh[^\n]* 0/);
});

test('OTLP export sends only permitted metrics and handles an unavailable backend',async t=>{
  const { createObservability }=require('./observability');
  const payloads=[];
  let reject=false;
  const receiver=http.createServer(async(req,res)=>{
    const chunks=[]; for await(const chunk of req)chunks.push(chunk);
    payloads.push({url:req.url,body:JSON.parse(Buffer.concat(chunks).toString())});
    res.writeHead(reject?401:200,{'content-type':'application/json'});res.end('{}');
  });
  receiver.listen(0,'127.0.0.1'); await once(receiver,'listening');
  const telemetry=createObservability({env:{OTEL_EXPORTER_OTLP_ENDPOINT:`http://127.0.0.1:${receiver.address().port}`},instanceId:'test'});
  t.after(async()=>{reject=false;await telemetry.provider.shutdown();receiver.close();});
  telemetry.updateResults([{id:5,participants:1,final:true,words:[{key:'gitops',shown:1,reported:1}]}]);
  await telemetry.provider.forceFlush();
  assert.equal(payloads[0].url,'/v1/metrics');
  const metrics=payloads[0].body.resourceMetrics.flatMap(r=>r.scopeMetrics.flatMap(s=>s.metrics));
  assert.ok(metrics.some(m=>m.name==='bingo_word_reported' && m.gauge.dataPoints[0].asDouble===1));
  assert.doesNotMatch(JSON.stringify(payloads),/user_id|cookie|username|password/);
  reject=true;
  // A failed export may report an error, but must not prevent application recording.
  await telemetry.provider.forceFlush().catch(()=>{});
  assert.doesNotThrow(()=>telemetry.recordRequest('GET','/history',200,0.1));
});
