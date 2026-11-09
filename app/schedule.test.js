const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Client} = require('pg');
const ui = require('./ui');
const migrationDir = path.join(__dirname, 'migrations');
const migration = name => fs.readFileSync(path.join(migrationDir, name), 'utf8');

test('schedule renders the full conference range and accessible day scroll controls', () => {
 const schedule = ['10','11','12'].map((day,i) => ({id:i+1, date:`2026-11-${day}`, day:`Day Nov ${day}`, title:'A talk', start_time:'09:00', end_time:'10:00', venue:'Salt Palace'}));
 const html = ui.dashboard(schedule, {team:'test',version:'test',user:{username:'test'},savedIds:[]});
 assert.ok(html.includes('November 8–12'));
 assert.ok(html.includes('id="day-tabs"'));
 assert.ok(html.includes('aria-label="Scroll days left"'));
 assert.ok(html.includes('aria-label="Scroll days right"'));
 assert.ok(!/Tuesday midday|November 8–10/.test(html));
 assert.ok(ui.authForm('login', '', {team:'test'}).includes('November 8–12'));
});

// Opt in with a disposable PostgreSQL connection. Each run owns a new schema;
// it never modifies the application's public tables or user data.
test('schedule migration imports actual events, maps them, and safely rolls back/reapplies', {skip: !process.env.SCHEDULE_TEST_DATABASE_URL}, async () => {
 const db = new Client({connectionString:process.env.SCHEDULE_TEST_DATABASE_URL});
 await db.connect();
 const schema = `schedule_test_${process.pid}_${Date.now()}`;
 const rows = async (sql, params) => (await db.query(sql, params)).rows;
 const apply = async file => {
  await db.query('BEGIN');
  try {await db.query(migration(file)); await db.query('COMMIT');}
  catch (e) {await db.query('ROLLBACK'); throw e;}
 };
 try {
  await db.query(`CREATE SCHEMA ${schema}`);
  await db.query(`SET search_path TO ${schema}`);
  for (const file of fs.readdirSync(migrationDir).filter(f=>/^00[1-8]_.*(?<!\.down)\.sql$/.test(f)).sort()) await apply(file);
  const baseline = await rows('SELECT id, title, hidden FROM sessions ORDER BY id');
  const [{id:userId}] = await rows("INSERT INTO users(username,password_salt,password_hash) VALUES ('test', '\\x01', '\\x02') RETURNING id");
  await db.query('INSERT INTO saved_sessions(user_id,session_id) VALUES ($1,83)',[userId]);
  await db.query('DELETE FROM session_rooms WHERE session_id=110'); // explicit empty override
  await apply('009_complete_schedule.sql');
  const counts = await rows("SELECT event_date::text, count(*)::int AS n FROM sessions JOIN days ON days.id=day_id WHERE NOT hidden AND event_date >= '2026-11-11' GROUP BY event_date ORDER BY event_date");
  assert.deepEqual(counts, [{event_date:'2026-11-11',n:195},{event_date:'2026-11-12',n:114}]);
  assert.equal((await rows('SELECT id FROM sessions WHERE id <= 140')).length,baseline.length);
  assert.equal((await rows('SELECT * FROM session_rooms WHERE session_id=110')).length,0);
  assert.equal((await rows('SELECT * FROM saved_sessions WHERE session_id=83')).length,1);
  assert.equal((await rows('SELECT hidden FROM sessions WHERE id=83'))[0].hidden,true);
  assert.equal((await rows("SELECT id FROM sessions WHERE NOT hidden AND (title IN ('Registration + Badge Pick-Up','Coat + Bag Check','☕ Coffee Break','Solutions Showcase') OR title LIKE '🍲 Lunch%' OR title LIKE 'Project Pavilion Kiosks%' OR title LIKE 'Poster Showcase (self-guided%')")).length,0);
  assert.equal((await rows('SELECT hidden FROM sessions WHERE id=62'))[0].hidden,false); // real talk mislabeled Break in seed
  assert.equal((await rows("SELECT day_id,start_time,title FROM sessions WHERE NOT hidden GROUP BY day_id,start_time,title HAVING count(*)>1")).length,0);
  const [{ends_at}] = await rows("SELECT (d.event_date+s.end_time) AT TIME ZONE 'America/Denver' AS ends_at FROM sessions s JOIN days d ON d.id=s.day_id WHERE s.title LIKE '%Save Phippy%'");
  assert.equal(ends_at.toISOString(),'2026-11-12T07:00:00.000Z');
  const imported = await rows('SELECT s.id, l.id AS location_id, l.venue, l.room, ARRAY(SELECT room_id FROM session_rooms WHERE session_id=s.id) AS room_ids FROM sessions s JOIN locations l ON l.id=s.location_id WHERE s.id>140');
  assert.ok(imported.length>400);
  const locations = await rows('SELECT *, ARRAY(SELECT room_id FROM location_rooms WHERE location_id=locations.id) AS room_ids FROM locations');
  const rooms = await rows('SELECT * FROM rooms');
  const maps = require('./venue-map');
  const plans = require('./floor-plans');
  for (const s of imported) {
   const dest = maps.resolveDestination(s.location_id,{locations,rooms},s.room_ids);
   assert.notEqual(dest.kind,'unavailable', `unmapped event ${s.id}: ${s.venue} ${s.room}`);
   for (const room of dest.rooms) assert.ok(plans.get(room.venue,room.floor)?.points(room)?.length,`missing drawing for ${room.name}`);
  }
  const posters = await rows("SELECT s.id, array_agg(r.name ORDER BY r.name) AS rooms FROM sessions s JOIN session_rooms sr ON sr.session_id=s.id JOIN rooms r ON r.id=sr.room_id WHERE s.notes LIKE '%Location precision: hall-level%' GROUP BY s.id");
  assert.ok(posters.length >= 13);
  for (const p of posters) assert.deepEqual(p.rooms,['Hall 1','Hall 2','Hall 3','Hall 4','Hall 5','Hall A','Hall B','Hall C']);
  const total = (await rows('SELECT count(*)::int AS n FROM sessions'))[0].n;
  await apply('009_complete_schedule.down.sql');
  assert.deepEqual(await rows('SELECT id,title,hidden FROM sessions ORDER BY id'),baseline);
  await apply('009_complete_schedule.sql');
  assert.equal((await rows('SELECT count(*)::int AS n FROM sessions'))[0].n,total);
  const [{id:savedId}] = await rows("SELECT id FROM sessions WHERE title LIKE '%Save Phippy%'");
  const [{id:bingoId}] = await rows("SELECT id FROM sessions WHERE title='Puppy Yoga'");
  await db.query('INSERT INTO saved_sessions(user_id,session_id) VALUES ($1,$2)',[userId,savedId]);
  await db.query("INSERT INTO bingo_cards(user_id,session_id,cells) VALUES ($1,$2,'[]')",[userId,bingoId]);
  await apply('009_complete_schedule.down.sql');
  assert.equal((await rows('SELECT * FROM saved_sessions WHERE session_id=$1',[savedId])).length,1);
  assert.equal((await rows('SELECT * FROM bingo_cards WHERE session_id=$1',[bingoId])).length,1);
  await apply('009_complete_schedule.sql');
  assert.equal((await rows('SELECT count(*)::int AS n FROM sessions'))[0].n,total);
  assert.equal((await rows("SELECT id FROM sessions WHERE title='Puppy Yoga'"))[0].id,bingoId);
  assert.equal((await rows("SELECT id FROM sessions WHERE title LIKE '%Save Phippy%'"))[0].id,savedId);
 } finally {
  await db.query(`DROP SCHEMA ${schema} CASCADE`);
  await db.end();
 }
});
