// Single source of truth for the flattened schedule query.
// Used by server.js (renders the explore page, /api/sessions) and by
// ingest-schedule.js (mirrors the same rows into Elasticsearch).
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

module.exports = { SCHEDULE_QUERY };
