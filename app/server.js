const fs = require('node:fs');
const ui = require('./ui');
const { isUpcoming, isLive } = require('./venue-map');
const http = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, scryptSync, createHash, timingSafeEqual } = require('node:crypto');
const { Pool } = require('pg');
const { MIGRATIONS_DIR, MIGRATION_FILE, MIGRATION_LOCK_KEY } = require('./migrationConfig');
const { GRID_SIZE, FREE_INDEX, buildCard, isMarkableIndex, winningLines } = require('./bingo');

const port = Number(process.env.PORT || 8080);
const team = process.env.TEAM_NAME || 'your-team';
const version = process.env.APP_VERSION || 'dev';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

const SESSION_COOKIE = 'sid';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_BODY_BYTES = 4096;
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const BOOTSTRAP_CSS_URL = '/static/bootstrap.min.css';
const bootstrapCss = fs.readFileSync(require.resolve('bootstrap/dist/css/bootstrap.min.css'));

const SCHEDULE_QUERY = `
  SELECT s.id,
         d.label AS day,
         to_char(d.event_date, 'YYYY-MM-DD') AS date,
         to_char(s.start_time, 'HH24:MI') AS start_time,
         to_char(s.end_time, 'HH24:MI') AS end_time,
         (d.event_date + s.start_time) AT TIME ZONE 'America/Denver' AS starts_at,
         (d.event_date + s.end_time) AT TIME ZONE 'America/Denver' AS ends_at,
         s.title,
         t.name AS track,
         s.level,
         s.format,
         l.venue,
         l.level AS floor,
         l.room,
         l.id AS location_id,
         ARRAY(SELECT room_id FROM session_rooms WHERE session_id = s.id ORDER BY room_id) AS room_ids,
         s.notes,
         COALESCE(string_agg(sp.name, ', ' ORDER BY sp.name), '') AS speakers
  FROM sessions s
  JOIN days d ON d.id = s.day_id
  JOIN locations l ON l.id = s.location_id
  LEFT JOIN tracks t ON t.id = s.track_id
  LEFT JOIN session_speakers ss ON ss.session_id = s.id
  LEFT JOIN speakers sp ON sp.id = ss.speaker_id
  WHERE NOT s.hidden
  GROUP BY s.id, d.id, t.id, l.id
  ORDER BY d.event_date, s.start_time, s.end_time, s.id`;

async function loadSchedule() {
  const { rows } = await pool.query(SCHEDULE_QUERY);
  const now = Date.now();
  return rows.filter(event => isUpcoming(event, now));
}

const locationLabel = (s) => [s.venue, s.floor, s.room].filter(Boolean).join(' · ');

function scheduleHtml(schedule) {
  if (schedule.length === 0) return '<p class="text-body-secondary">No sessions loaded.</p>';
  const days = new Map();
  for (const s of schedule) {
    if (!days.has(s.date)) days.set(s.date, { label: s.day, sessions: [] });
    days.get(s.date).sessions.push(s);
  }
  return [...days.values()]
    .map((day) => {
      const rows = day.sessions
        .map((s) => {
          const meta = [s.track, s.format].filter(Boolean).map(escapeHtml).join(' · ');
          const speakers = s.speakers ? `<div class="small text-body-secondary">${escapeHtml(s.speakers)}</div>` : '';
          const notes = s.notes ? `<span class="badge text-bg-warning ms-1">${escapeHtml(s.notes)}</span>` : '';
          return `<tr><td class="text-nowrap">${escapeHtml(s.start_time)}&ndash;${escapeHtml(s.end_time)}</td>
<td><div><a href="/map?location=${s.location_id}">${escapeHtml(s.title)}</a>${notes} <a class="small ms-1" href="/bingo/${s.id}" target="_blank" rel="noopener">Buzzword Bingo</a></div><div class="small text-body-secondary">${meta}</div>${speakers}</td>
<td class="small">${escapeHtml(locationLabel(s))}</td></tr>`;
        })
        .join('');
      return `<h2 class="h5 mt-4 mb-2">${escapeHtml(day.label)}</h2>
<div class="card shadow-sm"><div class="table-responsive"><table class="table table-hover mb-0">
<thead><tr><th>Time</th><th>Session</th><th>Location</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    })
    .join('');
}

let schemaReady = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectWithRetry() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await pool.connect();
    } catch (error) {
      if (attempt >= 30) throw error;
      console.error(`database not ready (attempt ${attempt}): ${error.message}`);
      await sleep(2000);
    }
  }
}

async function migrate() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => MIGRATION_FILE.test(name)).sort();
  const client = await connectWithRetry();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));
    for (const name of files) {
      if (applied.has(name)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${name} failed: ${error.message}`);
      }
      console.log(`applied migration ${name}`);
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}

const hashPassword = (password, salt) => scryptSync(password, salt, 64);
const hashToken = (token) => createHash('sha256').update(token).digest();

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function readForm(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

function parseCookies(header) {
  const cookies = {};
  for (const part of (header || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

function sessionCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

async function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.username, p.data AS profile FROM user_sessions s JOIN users u ON u.id = s.user_id
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] || null;
}

async function startSession(userId) {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO user_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [hashToken(token), userId, SESSION_TTL_SECONDS],
  );
  return token;
}

function send(res, status, contentType, body, headers = {}) {
  res.writeHead(status, { 'content-type': contentType, ...(contentType.startsWith('text/html') ? { 'cache-control': 'private, no-store' } : {}), ...headers });
  res.end(body);
}

const page = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="${BOOTSTRAP_CSS_URL}"></head><body class="bg-body-tertiary">${body}</body></html>`;

function authForm(kind, error) {
  return ui.authForm(kind, error, { team, passwordMin: PASSWORD_MIN });
}

async function handleRegister(req, res) {
  const form = await readForm(req);
  const username = (form.get('username') || '').trim().toLowerCase();
  const password = form.get('password') || '';
  if (!USERNAME_PATTERN.test(username)) {
    return send(res, 400, 'text/html; charset=utf-8', authForm('register', 'Username must be 3-32 chars of a-z, 0-9, _ . -'));
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return send(res, 400, 'text/html; charset=utf-8', authForm('register', `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`));
  }
  if (password !== (form.get('confirm') || '')) {
    return send(res, 400, 'text/html; charset=utf-8', authForm('register', 'Passwords do not match'));
  }
  const salt = randomBytes(16);
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_salt, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (username) DO NOTHING RETURNING id`,
    [username, salt, hashPassword(password, salt)],
  );
  if (rows.length === 0) {
    return send(res, 409, 'text/html; charset=utf-8', authForm('register', 'Username already taken'));
  }
  const token = await startSession(rows[0].id);
  send(res, 303, 'text/plain', '', { location: '/', 'set-cookie': sessionCookie(token, SESSION_TTL_SECONDS) });
}

async function handleLogin(req, res) {
  const form = await readForm(req);
  const username = (form.get('username') || '').trim().toLowerCase();
  const password = form.get('password') || '';
  const { rows } = await pool.query('SELECT id, password_salt, password_hash FROM users WHERE username = $1', [username]);
  const user = rows[0];
  const salt = user ? user.password_salt : Buffer.alloc(16);
  const candidate = hashPassword(password.slice(0, PASSWORD_MAX), salt);
  const valid = user !== undefined && timingSafeEqual(candidate, user.password_hash);
  if (!valid) {
    return send(res, 401, 'text/html; charset=utf-8', authForm('login', 'Wrong username or password'));
  }
  const token = await startSession(user.id);
  send(res, 303, 'text/plain', '', { location: '/', 'set-cookie': sessionCookie(token, SESSION_TTL_SECONDS) });
}

async function handleLogout(req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) await pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [hashToken(token)]);
  send(res, 303, 'text/plain', '', { location: '/login', 'set-cookie': sessionCookie('', 0) });
}

const BINGO_PATH = /^\/bingo\/(\d{1,9})(\/mark)?$/;

async function loadBingoSession(sessionId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.title, t.name AS track, p.prize, p.winner_user_id, w.username AS winner,
            (d.event_date + s.start_time) AT TIME ZONE 'America/Denver' AS starts_at,
            (d.event_date + s.end_time) AT TIME ZONE 'America/Denver' AS ends_at
     FROM sessions s
     JOIN days d ON d.id = s.day_id
     LEFT JOIN tracks t ON t.id = s.track_id
     LEFT JOIN session_prizes p ON p.session_id = s.id
     LEFT JOIN users w ON w.id = p.winner_user_id
     WHERE s.id = $1 AND NOT s.hidden`,
    [sessionId],
  );
  return rows[0] || null;
}

async function loadOrCreateCard(userId, session) {
  await pool.query(
    `INSERT INTO bingo_cards (user_id, session_id, cells) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, session_id) DO NOTHING`,
    [userId, session.id, JSON.stringify(buildCard(session))],
  );
  const { rows } = await pool.query(
    'SELECT cells, marked, bingo_at FROM bingo_cards WHERE user_id = $1 AND session_id = $2',
    [userId, session.id],
  );
  return rows[0];
}

function bingoHtml(user, session, card) {
  return ui.bingoPage(user, session, card, {
    team, version, freeIndex: FREE_INDEX, winningLines: winningLines(card.marked),
  });
}

async function handleBingoMark(req, res, user, session, form) {
  const index = Number(form.get('cell'));
  if (isMarkableIndex(index)) {
    await loadOrCreateCard(user.id, session);
    const { rows } = await pool.query(
      `UPDATE bingo_cards
       SET marked = CASE WHEN $3 = ANY(marked) THEN array_remove(marked, $3) ELSE array_append(marked, $3) END
       WHERE user_id = $1 AND session_id = $2
       RETURNING marked`,
      [user.id, session.id, index],
    );
    if (winningLines(rows[0].marked).length > 0) {
      await pool.query(
        'UPDATE bingo_cards SET bingo_at = now() WHERE user_id = $1 AND session_id = $2 AND bingo_at IS NULL',
        [user.id, session.id],
      );
      await pool.query(
        `UPDATE session_prizes SET winner_user_id = $1, won_at = now()
         WHERE session_id = $2 AND winner_user_id IS NULL`,
        [user.id, session.id],
      );
    }
  }
  send(res, 303, 'text/plain', '', { location: `/bingo/${session.id}` });
}

async function handleBingo(req, res, user, match) {
  const allowedMethod = match[2] ? 'POST' : 'GET';
  if (req.method !== allowedMethod) return send(res, 405, 'text/plain', 'method not allowed\n', { allow: allowedMethod });
  // Read a marking request before checking the clock, including slow uploads.
  const form = match[2] ? await readForm(req) : null;
  const session = await loadBingoSession(Number(match[1]));
  if (!session) return send(res, 404, 'text/plain', 'not found\n');
  if (!isLive(session)) return send(res, 403, 'text/html; charset=utf-8', ui.page('Bingo unavailable',
    '<main class="dashboard"><h1>Bingo is available only during a live event.</h1><p>Come back at the scheduled start time. Play closes when the event ends.</p><a href="/">Back to schedule</a></main>'));
  if (match[2]) {
    return handleBingoMark(req, res, user, session, form);
  }
  const card = await loadOrCreateCard(user.id, session);
  return send(res, 200, 'text/html; charset=utf-8', bingoHtml(user, session, card));
}

const SAVED_PATH = /^\/api\/saved(?:\/(\d{1,9}))?$/;

async function loadSavedIds(userId) {
  const { rows } = await pool.query(
    'SELECT session_id FROM saved_sessions WHERE user_id = $1 ORDER BY session_id',
    [userId],
  );
  return rows.map((row) => row.session_id);
}

async function handleSaved(req, res, user, match) {
  const json = (status, body) => send(res, status, 'application/json', JSON.stringify(body));
  const sessionId = match[1] ? Number(match[1]) : null;
  if (sessionId === null) {
    if (req.method === 'GET') return json(200, { ids: await loadSavedIds(user.id) });
    if (req.method !== 'POST') return send(res, 405, 'text/plain', 'method not allowed\n', { allow: 'GET, POST' });
    const ids = (await readForm(req)).get('ids')?.split(',').map(Number).filter(Number.isInteger) ?? [];
    await pool.query(
      `INSERT INTO saved_sessions (user_id, session_id)
       SELECT $1, id FROM sessions WHERE id = ANY($2::int[])
       ON CONFLICT DO NOTHING`,
      [user.id, ids],
    );
    return json(200, { ids: await loadSavedIds(user.id) });
  }
  if (req.method === 'PUT') {
    const { rows } = await pool.query(
      `WITH existing AS (SELECT id FROM sessions WHERE id = $2),
            inserted AS (
              INSERT INTO saved_sessions (user_id, session_id)
              SELECT $1, id FROM existing
              ON CONFLICT DO NOTHING
            )
       SELECT id FROM existing`,
      [user.id, sessionId],
    );
    if (rows.length === 0) return json(404, { error: 'not found' });
    return json(200, { id: sessionId, saved: true });
  }
  if (req.method === 'DELETE') {
    await pool.query('DELETE FROM saved_sessions WHERE user_id = $1 AND session_id = $2', [user.id, sessionId]);
    return json(200, { id: sessionId, saved: false });
  }
  return send(res, 405, 'text/plain', 'method not allowed\n', { allow: 'PUT, DELETE' });
}

async function route(req, res, url) {
  if (url.pathname === '/healthz') return send(res, 200, 'text/plain', 'ok\n');
  if (url.pathname === BOOTSTRAP_CSS_URL && req.method === 'GET') {
    return send(res, 200, 'text/css; charset=utf-8', bootstrapCss, { 'cache-control': 'public, max-age=86400' });
  }
  if (url.pathname === '/readyz') {
    if (!schemaReady) return send(res, 503, 'text/plain', 'schema not ready\n');
    await pool.query('SELECT 1');
    return send(res, 200, 'text/plain', 'ok\n');
  }

  if (url.pathname === '/register' || url.pathname === '/login') {
    const kind = url.pathname.slice(1);
    if (req.method === 'GET') return send(res, 200, 'text/html; charset=utf-8', authForm(kind));
    if (req.method === 'POST') return kind === 'register' ? handleRegister(req, res) : handleLogin(req, res);
    return send(res, 405, 'text/plain', 'method not allowed\n', { allow: 'GET, POST' });
  }
  if (url.pathname === '/logout') {
    if (req.method !== 'POST') return send(res, 405, 'text/plain', 'method not allowed\n', { allow: 'POST' });
    return handleLogout(req, res);
  }

  const user = await currentUser(req);
  if (!user) {
    if (url.pathname.startsWith('/api/')) {
      return send(res, 401, 'application/json', JSON.stringify({ error: 'unauthorized' }));
    }
    return send(res, 303, 'text/plain', '', { location: '/login' });
  }

  if (url.pathname === '/profile') {
    if (req.method === 'GET') return send(res, 200, 'text/html; charset=utf-8', ui.profilePage({ team, version, user, saved: url.searchParams.get('saved') === '1' }));
    if (req.method !== 'POST') return send(res, 405, 'text/plain', 'method not allowed\n', { allow: 'GET, POST' });
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(res, 403, 'text/plain', 'Invalid request origin');
    const form = await readForm(req, 1024 * 1024);
    let profile;
    try { profile = validateProfile(form); } catch (error) {
      return send(res, 400, 'text/html; charset=utf-8', ui.profilePage({ team, version, user, error: error.message, draft: { ...Object.fromEntries(form), photo: user.profile?.photo || '', reduceMotion: form.get('reduceMotion') === 'on' } }));
    }
    await pool.query('INSERT INTO user_profiles (user_id, data) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [user.id, JSON.stringify(profile)]);
    return send(res, 303, 'text/plain', '', { location: '/profile?saved=1' });
  }

  const bingoMatch = BINGO_PATH.exec(url.pathname);
  if (bingoMatch) return handleBingo(req, res, user, bingoMatch);

  if (['/static/venue-map.js', '/static/floor-plans.js'].includes(url.pathname)) {
    if (req.method !== 'GET') return send(res, 405, 'text/plain', 'method not allowed\n', { allow: 'GET' });
    const source = await readFile(path.join(__dirname, path.basename(url.pathname)), 'utf8');
    return send(res, 200, 'text/javascript; charset=utf-8', source, { 'cache-control': 'private, max-age=300' });
  }

  const savedMatch = SAVED_PATH.exec(url.pathname);
  if (savedMatch) return handleSaved(req, res, user, savedMatch);

  if (url.pathname === '/api/sessions') {
    const sessions = await loadSchedule();
    return send(res, 200, 'application/json', JSON.stringify({ version, user: user.username, sessions }));
  }
  if (url.pathname === '/map') {
    if (req.method !== 'GET') return send(res, 405, 'text/plain', 'method not allowed\n', { allow: 'GET' });
    const { rows: [mapData] } = await pool.query(`
      SELECT
        (SELECT coalesce(json_agg(rooms ORDER BY id), '[]') FROM rooms) AS rooms,
        (SELECT coalesce(json_agg(location ORDER BY label), '[]') FROM (
          SELECT id, venue, level, room, concat_ws(' | ', venue, level, room) AS label,
                 ARRAY(SELECT room_id FROM location_rooms WHERE location_id = locations.id ORDER BY room_id) AS room_ids
          FROM locations
        ) location) AS locations
    `);
    mapData.events = await loadSchedule();
    mapData.username = user.username;
    const map = await readFile(path.join(__dirname, 'map.html'), 'utf8');
    const data = JSON.stringify(mapData).replace(/</g, '\\u003c');
    return send(res, 200, 'text/html; charset=utf-8', ui.mapPage(map.replace('<!-- MAP_DATA -->', () => data), { team, version, user }));
  }
  if (url.pathname === '/event-rooms') {
    if (req.method !== 'GET') return send(res, 405, 'text/plain', 'method not allowed\n', { allow: 'GET' });
    const { rows } = await pool.query(`
      SELECT days.label AS day, to_char(sessions.start_time, 'HH12:MI AM') AS time,
             sessions.id, sessions.title, locations.id AS location_id, concat_ws(' | ', locations.venue, locations.level, locations.room) AS location,
             string_agg(rooms.name, ', ' ORDER BY rooms.name) AS resolved_rooms
      FROM sessions
      JOIN days ON days.id = sessions.day_id
      JOIN locations ON locations.id = sessions.location_id
      LEFT JOIN session_rooms ON session_rooms.session_id = sessions.id
      LEFT JOIN rooms ON rooms.id = session_rooms.room_id
      WHERE (days.event_date + sessions.end_time) AT TIME ZONE 'America/Denver' > CURRENT_TIMESTAMP
        AND NOT sessions.hidden
      GROUP BY sessions.id, days.id, locations.id
      ORDER BY days.event_date, sessions.start_time, sessions.id
    `);
    return send(res, 200, 'text/html; charset=utf-8', ui.roomMappings(rows, { team, version, user }));
  }
  if (url.pathname === '/') {
    const schedule = await loadSchedule();
    const savedIds = await loadSavedIds(user.id);
    return send(res, 200, 'text/html; charset=utf-8', ui.dashboard(schedule, { team, version, user, savedIds }));
  }
  send(res, 404, 'text/plain', 'not found\n');
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return send(res, 400, 'text/plain', 'bad request\n');
  }
  route(req, res, url).catch((error) => {
    console.error(`${req.method} ${url.pathname} failed: ${error.message}`);
    if (!res.headersSent) send(res, 500, 'text/plain', 'internal error\n');
  });
});

server.listen(port, () => console.log(`listening on :${port}, version ${version}`));
migrate()
  .then(() => {
    schemaReady = true;
  })
  .catch((error) => {
    console.error(`migration failed: ${error.message}`);
    process.exit(1);
  });

// Exit cleanly when Kubernetes stops the pod, so rollouts don't drop requests.
process.on('SIGTERM', () => server.close(() => pool.end().then(() => process.exit(0))));
