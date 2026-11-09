const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

// This suite creates and removes its own database; never reuses application data.
test('Postgres enforces bingo deadlines and aggregates distinct current reports', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a local Postgres admin connection',
}, async (t) => {
  const store = require('./bingo-store');
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const name = `fryte_bingo_test_${process.pid}`;
  await admin.query(`CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8'`);
  const url = new URL(process.env.TEST_DATABASE_URL); url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString() });
  t.after(async () => { await pool.end(); await admin.query(`DROP DATABASE ${name}`); await admin.end(); });
  await pool.query('CREATE TABLE schema_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  for (const file of fs.readdirSync(path.join(__dirname, 'migrations')).filter(f => /^\d+_[a-z0-9_]+\.sql$/.test(f)).sort()) {
    await pool.query(fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8'));
    await pool.query('INSERT INTO schema_migrations(name) VALUES($1)',[file]);
  }
  const { rows: users } = await pool.query(`INSERT INTO users (username,password_salt,password_hash)
    VALUES ('tester1','x','x'),('tester2','x','x'),('tester3','x','x') RETURNING id`);
  const user = users[0].id;
  const { rows: [day] } = await pool.query(`INSERT INTO days(event_date,label)
    VALUES ((clock_timestamp() AT TIME ZONE 'America/Denver')::date,'Test')
    ON CONFLICT(event_date) DO UPDATE SET label=EXCLUDED.label RETURNING id`);
  const { rows: [session] } = await pool.query(`INSERT INTO sessions(day_id,start_time,end_time,title,format,location_id)
    VALUES ($1,'00:00','23:59','Kubernetes testing','Talk',1) RETURNING id`, [day.id]);
  const setEnd = async (interval) => {
    await pool.query(`UPDATE sessions SET end_time=((clock_timestamp()+$2::interval) AT TIME ZONE 'America/Denver')::time WHERE id=$1`, [session.id,interval]);
  };
  await t.test('explicit start is idempotent and reads never create cards', async () => {
    assert.equal(await store.loadCard(pool,user,session.id), null);
    await setEnd('1 hour');
    const results = await Promise.all([store.startCard(pool,user,session.id),store.startCard(pool,user,session.id)]);
    assert.ok(results.every(r => r.status === 'ok'));
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM bingo_cards')).rows[0].count,1);
  });
  await t.test('repeated desired-state writes count once and unmark retracts the report', async () => {
    for (let i=0;i<2;i++) assert.equal((await store.markCard(pool,user,session.id,0,true)).status,'ok');
    assert.equal((await store.loadCard(pool,user,session.id)).marked.filter(i=>i===0).length,1);
    await store.markCard(pool,user,session.id,0,false);
    assert.ok(!(await store.loadCard(pool,user,session.id)).marked.includes(0));
    assert.equal((await store.markCard(pool,user,session.id,12,true)).status,'invalid');
    assert.equal((await store.markCard(pool,user,session.id,0,'true')).status,'invalid');
  });
  await t.test('correction window permits existing cards only, including concurrent attempts', async () => {
    await pool.query(`UPDATE bingo_cards SET created_at=clock_timestamp()-interval '2 hours'`);
    await setEnd('-5 minutes');
    assert.equal((await store.startCard(pool,users[1].id,session.id)).status,'closed');
    assert.equal((await store.markCard(pool,users[1].id,session.id,0,true)).status,'missing');
    assert.equal((await store.markCard(pool,user,session.id,0,true)).status,'ok');
    await setEnd('-10 minutes');
    assert.equal((await store.markCard(pool,user,session.id,0,false)).status,'closed');
    assert.ok((await store.loadCard(pool,user,session.id)).marked.includes(0));
  });
  await t.test('lock waits cannot admit a write past the cutoff', async () => {
    await setEnd('-599 seconds');
    const locker = await pool.connect();
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM bingo_cards WHERE user_id=$1 FOR UPDATE',[user]);
    const pending = store.markCard(pool,user,session.id,0,false);
    await locker.query('SELECT pg_sleep(1.1)');
    await locker.query('COMMIT'); locker.release();
    assert.equal((await pending).status,'closed');
  });
  await t.test('counts use actual card exposure, exclude FREE and late cards, and expose no identity', async () => {
    const cells = Array.from({length:25},(_,i)=>i===12?'FREE':`word ${i}`);
    cells[0]='Kubernetes';
    await pool.query('UPDATE bingo_cards SET cells=$1, marked=ARRAY[0,12] WHERE user_id=$2',[JSON.stringify(cells),user]);
    const other = [...cells]; other[0]=' kubernetes '; other[1]='Different';
    await pool.query(`INSERT INTO bingo_cards(user_id,session_id,cells,marked,created_at)
      VALUES ($1,$2,$3,ARRAY[12],clock_timestamp()-interval '2 hours'),
             ($4,$2,$3,ARRAY[0,12],clock_timestamp())`,[users[1].id,session.id,JSON.stringify(other),users[2].id]);
    const result = await store.loadResults(pool,session.id);
    assert.equal(result.participants,2);
    assert.equal(result.final,true);
    assert.deepEqual(result.words.find(w=>w.key==='kubernetes'),{key:'kubernetes',word:'Kubernetes',expected:true,shown:2,reported:1,rate:0.5});
    assert.equal(result.words.find(w=>w.key==='different').shown,1);
    assert.ok(result.words.every(w=>w.key!=='free'));
    assert.equal(result.words.find(w=>w.key==='gitops').rate,null);
    assert.doesNotMatch(JSON.stringify(result),/user_id|tester|password|token/);
    assert.equal((await store.markCard(pool,users[2].id,session.id,1,true)).status,'closed');
  });
  await t.test('prize lock waits cannot change results already labelled final', async () => {
    await pool.query('INSERT INTO session_prizes(session_id,prize) VALUES($1,$2) ON CONFLICT DO NOTHING',[session.id,'Test prize']);
    await pool.query('UPDATE bingo_cards SET marked=ARRAY[0,1,2,3,12] WHERE user_id=$1',[user]);
    await setEnd('-599 seconds');
    const locker=await pool.connect();
    await locker.query('BEGIN');
    await locker.query('SELECT session_id FROM session_prizes WHERE session_id=$1 FOR UPDATE',[session.id]);
    const pending=store.markCard(pool,user,session.id,4,true);
    await locker.query('SELECT pg_sleep(1.1)');
    const finalRead=store.loadResults(pool,session.id);
    await locker.query('COMMIT');locker.release();
    assert.equal((await pending).status,'closed');
    const result=await finalRead;
    assert.equal(result.final,true);
    assert.equal(result.words.find(w=>w.key==='word 4').reported,0);
  });
  await t.test('HTTP history and results are authenticated, read-only and respect the correction window', async (t) => {
    await pool.query('UPDATE sessions SET hidden=true WHERE id=$1',[session.id]);
    assert.equal(await store.loadSession(pool,session.id),null);
    assert.equal(await store.loadResults(pool,session.id),null);
    await pool.query('UPDATE sessions SET hidden=false WHERE id=$1',[session.id]);
    const { spawn } = require('node:child_process');
    const { once } = require('node:events');
    const { createHash } = require('node:crypto');
    const { setTimeout: delay } = require('node:timers/promises');
    const token = 'local-integration-session';
    const {rows:[pastDay]}=await pool.query(`INSERT INTO days(event_date,label) VALUES(current_date-1,'Past test') ON CONFLICT(event_date) DO UPDATE SET label=EXCLUDED.label RETURNING id`);
    const {rows:[demoSession]}=await pool.query(`INSERT INTO sessions(day_id,start_time,end_time,title,format,location_id) VALUES($1,'10:00','11:00','Demo database isolation','Talk',1) RETURNING id`,[pastDay.id]);
    await pool.query(`INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')`,
      [createHash('sha256').update(token).digest(),user]);
    const child = spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,DATABASE_URL:url.toString(),PORT:'55440',METRICS_PORT:'55441',OTEL_EXPORTER_OTLP_ENDPOINT:'',BINGO_DEMO_RESULTS:'true'},stdio:['ignore','pipe','pipe']});
    t.after(async()=>{if(child.exitCode === null){child.kill(); await once(child,'exit');}});
    let logs=''; child.stdout.on('data',data=>{logs+=data;}); child.stderr.on('data',data=>{logs+=data;});
    const base = 'http://127.0.0.1:55440';
    let ready=false;
    for(let attempt=0;attempt<50;attempt++) {
      try {if((await fetch(base+'/readyz')).ok){ready=true;break;}} catch {}
      await delay(100);
    }
    assert.ok(ready,logs);
    const request=(route,options={})=>fetch(base+route,{redirect:'manual',...options,headers:{cookie:`sid=${token}`,...options.headers}});
    assert.equal((await fetch(base+`/api/sessions/${session.id}/buzzwords`)).status,401);
    const history = await request('/history'); assert.equal(history.status,200);
    const historyHtml=await history.text();
    assert.match(historyHtml,/Kubernetes testing/);
    assert.doesNotMatch(historyHtml,/Registration \+ Badge Pick-Up|Coffee Break|Coat \+ Bag Check/);
    const before = (await pool.query('SELECT count(*) AS count FROM bingo_cards')).rows[0].count;
    assert.equal((await request(`/sessions/${session.id}/results`)).status,200);
    const result = await (await request(`/api/sessions/${session.id}/buzzwords`)).json();
    assert.equal(result.final,true); assert.equal(result.participants,2);
    assert.equal(result.source,'attendee');
    const demo=await (await request(`/api/sessions/${demoSession.id}/buzzwords`)).json();
    assert.equal(demo.source,'synthetic');assert.ok(demo.participants>0);
    assert.match(await (await request(`/sessions/${demoSession.id}/results`)).text(),/Synthetic demo data/);
    assert.match(await (await request(`/bingo/${demoSession.id}`)).text(),/New cards are closed/);
    assert.equal(await store.loadCard(pool,user,demoSession.id),null);
    assert.equal((await pool.query('SELECT count(*) AS count FROM bingo_cards')).rows[0].count,before);
    const card = await request(`/bingo/${session.id}`); assert.match(await card.text(),/Results are final/);
    assert.equal((await request(`/bingo/${session.id}/mark`,{method:'POST',body:new URLSearchParams({cell:'0',checked:'false'})})).status,409);
    assert.equal((await request(`/bingo/${session.id}/mark`,{method:'POST',body:new URLSearchParams({cell:''})})).status,400);
    assert.equal((await request(`/api/sessions/${session.id}/buzzwords`,{method:'POST'})).status,405);
    const publicPrivacy=await fetch(base+'/privacy'); assert.equal(publicPrivacy.status,200);
    // A different authenticated account without a card cannot start after the end.
    await pool.query('DELETE FROM bingo_cards WHERE user_id=$1',[users[2].id]);
    await pool.query('UPDATE user_sessions SET user_id=$1 WHERE token_hash=$2',[users[2].id,createHash('sha256').update(token).digest()]);
    await setEnd('-5 minutes');
    assert.equal((await request(`/bingo/${session.id}/start`,{method:'POST',body:new URLSearchParams({notice:'acknowledged'})})).status,409);
    await request(`/bingo/${session.id}`);
    assert.equal(await store.loadCard(pool,users[2].id,session.id),null);
    await setEnd('1 hour');
    assert.equal((await request(`/bingo/${session.id}/start`,{method:'POST'})).status,400);
    assert.equal((await request(`/bingo/${session.id}/start`,{method:'POST',body:new URLSearchParams({notice:'acknowledged'})})).status,303);
    assert.equal((await request(`/bingo/${session.id}/mark`,{method:'POST',body:new URLSearchParams({cell:'0',checked:'true'})})).status,303);
    assert.ok((await store.loadCard(pool,users[2].id,session.id)).marked.includes(0));
    // Keep a real request active while rollout termination begins. Database work
    // after the remaining body arrives must still complete before the pool ends.
    const http = require('node:http');
    const slow = http.request(base+`/bingo/${session.id}/mark`, { method:'POST', headers:{cookie:`sid=${token}`, 'content-type':'application/x-www-form-urlencoded'} });
    const response = new Promise((resolve,reject) => { slow.on('response',res=>{res.resume();resolve(res.statusCode);});slow.on('error',reject); });
    slow.write('cell=0&');
    await delay(100);
    child.kill('SIGTERM');
    await delay(100);
    slow.end('checked=false');
    assert.equal(await response,303);
    assert.ok(!(await store.loadCard(pool,users[2].id,session.id)).marked.includes(0));
  });
});
