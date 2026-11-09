// Mirrors the schedule in Postgres into Elasticsearch (the `sessions` alias).
//
// Usage:
//   DATABASE_URL='...' ES_URL='https://<project>.search.us-east-1.es.amazonaws.com' \
//   ES_API_KEY='...' node ingest-schedule.js
//
// What it does:
//   1. Creates index `sessions_v1` with the confirmed mapping and the
//      `sessions` alias if the alias does not exist yet.
//   2. Deletes documents whose session id no longer exists in the database.
//   3. Bulk-indexes every session (documents are keyed by session id, so
//      re-running the script after a schedule migration is idempotent).
//
// Note: the indexed `track` field carries what the UI shows as the track
// (sessions.track, falling back to format or 'General'), because the UI's
// track filter works on that value.
const { Pool } = require('pg');
const { SCHEDULE_QUERY } = require('./scheduleQuery');
const { esClient } = require('./esClient');
const { ALIAS } = require('./sessionsSearch');

const INDEX = 'sessions_v1';

const MAPPINGS = {
  properties: {
    id: { type: 'long' },
    day: { type: 'date' },
    day_label: { type: 'keyword' },
    start_time: { type: 'keyword' },
    end_time: { type: 'keyword' },
    title: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 512 } } },
    speakers: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
    track: { type: 'keyword' },
    level: { type: 'keyword' },
    format: { type: 'keyword' },
    venue: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
    floor: { type: 'keyword' },
    room: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
    notes: { type: 'text' },
    title_suggest: {
      type: 'completion',
      analyzer: 'simple',
      preserve_separators: true,
      preserve_position_increments: true,
      max_input_length: 60,
    },
  },
};

const bodyOf = (res) => (res && res.body ? res.body : res);

async function main() {
  const client = esClient();
  if (!client) {
    console.error('ES_URL and ES_API_KEY must be set');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL must be set');
    process.exit(1);
  }

  const aliasExists = await client.indices.existsAlias({ name: ALIAS });
  if (!aliasExists) {
    await client.indices.create({ index: INDEX, aliases: { [ALIAS]: {} }, mappings: MAPPINGS });
    console.log(`created index ${INDEX} with alias ${ALIAS}`);
  } else {
    console.log(`alias ${ALIAS} already exists — using it`);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  try {
    const { rows } = await pool.query(SCHEDULE_QUERY);
    const docs = rows.map(toDoc);

    const removed = bodyOf(
      await client.deleteByQuery({
        index: ALIAS,
        query: { bool: { must_not: { terms: { id: rows.map((row) => row.id) } } } },
      }),
    );
    console.log(`removed ${removed.deleted || 0} stale documents`);

    const operations = docs.flatMap((doc) => [
      { index: { _index: ALIAS, _id: String(doc.id) } },
      doc,
    ]);
    const result = bodyOf(await client.bulk({ operations, refresh: true }));
    const failed = (result.items || []).filter((item) => item.index && item.index.error).length;
    if (failed) {
      (result.items || [])
        .filter((item) => item.index && item.index.error)
        .slice(0, 5)
        .forEach((item) => console.error('bulk error:', JSON.stringify(item.index.error)));
      console.error(`indexed ${docs.length - failed}/${docs.length} sessions, ${failed} failed`);
      process.exitCode = 1;
    } else {
      console.log(`indexed ${docs.length} sessions`);
    }
    const count = bodyOf(await client.count({ index: ALIAS }));
    console.log(`total documents in ${ALIAS}: ${count.count}`);
  } finally {
    await pool.end();
  }
}

function toDoc(row) {
  const title = row.title || '';
  const speakers = row.speakers ? row.speakers.split(', ').filter(Boolean) : [];
  const suggestInput = [
    ...title.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean),
    ...speakers.map((name) => name.toLowerCase()),
  ];
  return {
    id: row.id,
    day: row.date,
    day_label: row.day,
    start_time: row.start_time,
    end_time: row.end_time,
    title,
    speakers,
    track: row.track || row.format || 'General',
    level: row.level || '',
    format: row.format || '',
    venue: row.venue || '',
    floor: row.floor || '',
    room: row.room || '',
    notes: row.notes || '',
    title_suggest: { input: suggestInput },
  };
}

main().catch((error) => {
  console.error(`ingest failed: ${error.message}`);
  process.exit(1);
});
