const { buildCard, isMarkableIndex, winningLines, expectedWords, bingoWindow, FREE_INDEX } = require('./bingo');

const SESSION_SQL = `SELECT s.id, s.title, s.notes, t.name AS track,
  l.venue,l.level AS floor,l.room,
  (SELECT string_agg(sp.name, ', ' ORDER BY sp.name) FROM session_speakers ss
   JOIN speakers sp ON sp.id=ss.speaker_id WHERE ss.session_id=s.id) AS speakers,
  (d.event_date + s.end_time) AT TIME ZONE 'America/Denver' AS ends_at,
  p.prize, p.winner_user_id, w.username AS winner
  FROM sessions s JOIN days d ON d.id=s.day_id JOIN locations l ON l.id=s.location_id
  LEFT JOIN tracks t ON t.id=s.track_id
  LEFT JOIN session_prizes p ON p.session_id=s.id
  LEFT JOIN users w ON w.id=p.winner_user_id`;

async function loadSession(db, id) {
  return (await db.query(`${SESSION_SQL} WHERE s.id=$1 AND NOT s.hidden`, [id])).rows[0] || null;
}

async function loadCard(db, userId, sessionId) {
  return (await db.query(`SELECT cells, marked, bingo_at, created_at FROM bingo_cards
    WHERE user_id=$1 AND session_id=$2`, [userId, sessionId])).rows[0] || null;
}

async function startCard(pool, userId, sessionId) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT id FROM sessions WHERE id=$1 FOR UPDATE',[sessionId]);
    // Serialize starts for one account/session, including attempts held across end time.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`bingo:${userId}:${sessionId}`]);
    const session = await loadSession(db, sessionId);
    if (!session) return { status: 'missing' };
    const existing = await loadCard(db, userId, sessionId);
    if (existing) return { status: 'ok' };
    const { rowCount } = await db.query(`INSERT INTO bingo_cards(user_id,session_id,cells,created_at)
      SELECT $1,$2,$3,clock_timestamp() WHERE clock_timestamp() < $4::timestamptz
      ON CONFLICT(user_id,session_id) DO NOTHING`,
    [userId, sessionId, JSON.stringify(buildCard(session)), session.ends_at]);
    await db.query('COMMIT');
    return { status: rowCount ? 'ok' : 'closed' };
  } finally {
    // Also ends early-return and failed transactions without leaking a checked-out connection.
    await db.query('ROLLBACK').finally(() => db.release());
  }
}

async function markCard(pool, userId, sessionId, index, checked) {
  if (!isMarkableIndex(index) || typeof checked !== 'boolean') return { status: 'invalid' };
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Readers share this session lock, so a final snapshot waits for every
    // in-flight mutation to commit. Acquire prize locks before checking time.
    await db.query('SELECT id FROM sessions WHERE id=$1 FOR UPDATE',[sessionId]);
    await db.query('SELECT session_id FROM session_prizes WHERE session_id=$1 FOR UPDATE',[sessionId]);
    const { rows: [card] } = await db.query(`SELECT id FROM bingo_cards
      WHERE user_id=$1 AND session_id=$2 FOR UPDATE`, [userId, sessionId]);
    if (!card) return { status: 'missing' };
    // clock_timestamp(), not transaction-stable now(): row-lock waits cannot extend the window.
    const { rows: [updated] } = await db.query(`UPDATE bingo_cards c SET marked =
      CASE WHEN $3 THEN ARRAY(SELECT DISTINCT unnest(c.marked || ARRAY[$2::int]) ORDER BY 1)
           ELSE array_remove(c.marked,$2) END
      FROM sessions s JOIN days d ON d.id=s.day_id
      WHERE c.id=$1 AND s.id=c.session_id
        AND c.created_at < (d.event_date+s.end_time) AT TIME ZONE 'America/Denver'
        AND clock_timestamp() < ((d.event_date+s.end_time) AT TIME ZONE 'America/Denver') + interval '10 minutes'
      RETURNING c.marked`, [card.id, index, checked]);
    if (!updated) return { status: 'closed' };
    if (winningLines(updated.marked).length) {
      await db.query('UPDATE bingo_cards SET bingo_at=COALESCE(bingo_at,clock_timestamp()) WHERE id=$1', [card.id]);
      await db.query(`UPDATE session_prizes SET winner_user_id=$1,won_at=clock_timestamp()
        WHERE session_id=$2 AND winner_user_id IS NULL`, [userId, sessionId]);
    }
    await db.query('COMMIT');
    return { status: 'ok' };
  } finally {
    await db.query('ROLLBACK').finally(() => db.release());
  }
}

async function loadAllResults(pool, sessionId = null) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT id FROM sessions WHERE ($1::int IS NULL OR id=$1) ORDER BY id FOR SHARE',[sessionId]);
    // A separate statement takes its snapshot after pending writers finish.
    return await aggregateResults(db,sessionId);
  } finally {
    await db.query('ROLLBACK').finally(() => db.release());
  }
}

async function aggregateResults(db, sessionId) {
  // Aggregate inside Postgres: account identifiers and individual cards never leave this query.
  const { rows } = await db.query(`WITH events AS (
    SELECT s.id,s.title,s.format,t.name AS track,
      (d.event_date+s.start_time) AT TIME ZONE 'America/Denver' AS starts_at,
      (d.event_date+s.end_time) AT TIME ZONE 'America/Denver' AS ends_at
    FROM sessions s JOIN days d ON d.id=s.day_id LEFT JOIN tracks t ON t.id=s.track_id
    WHERE NOT s.hidden AND ($1::int IS NULL OR s.id=$1)
  ), valid_cards AS (
    SELECT c.* FROM bingo_cards c JOIN events e ON e.id=c.session_id WHERE c.created_at < e.ends_at
  ), words AS (
    SELECT c.session_id,lower(btrim(word)) AS key,min(btrim(word)) AS word,
      count(DISTINCT c.id)::int AS shown,
      count(DISTINCT c.id) FILTER (WHERE (position-1)::int=ANY(c.marked))::int AS reported
    FROM valid_cards c CROSS JOIN LATERAL jsonb_array_elements_text(c.cells) WITH ORDINALITY AS cell(word,position)
    WHERE position <> $2+1 AND lower(btrim(word)) <> 'free'
    GROUP BY c.session_id,lower(btrim(word))
  ) SELECT e.*,
    (SELECT count(*)::int FROM valid_cards c WHERE c.session_id=e.id) AS participants,
    COALESCE((SELECT json_agg(w) FROM words w WHERE w.session_id=e.id),'[]') AS words,
    statement_timestamp() AS observed_at
  FROM events e ORDER BY e.ends_at DESC,e.id`, [sessionId, FREE_INDEX]);
  return rows.map(row => {
    const vocabulary = new Map(expectedWords(row).map(w => [w.key, { ...w, expected: true, shown: 0, reported: 0, rate: null }]));
    for (const w of row.words) {
      const expected = vocabulary.get(w.key);
      vocabulary.set(w.key, { key: w.key, word: expected?.word || w.word, expected: !!expected,
        shown: w.shown, reported: w.reported, rate: w.shown ? w.reported / w.shown : null });
    }
    const window = bingoWindow(row.ends_at, new Date(row.observed_at).getTime());
    return { id: row.id, title: row.title, format: row.format, track: row.track, source: 'attendee', starts_at: row.starts_at.toISOString(), ends_at: row.ends_at.toISOString(),
      closesAt: window.closesAt, final: window.final, participants: row.participants,
      observedAt: row.observed_at.toISOString(),
      words: [...vocabulary.values()].sort((a,b) => b.reported-a.reported || a.word.localeCompare(b.word)) };
  });
}

async function loadResults(db, id) { return (await loadAllResults(db, id))[0] || null; }

module.exports = { loadSession, loadCard, startCard, markCard, loadResults, loadAllResults };
