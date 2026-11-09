-- Preserve imported events with subsequent saves, Bingo cards, or configured prizes.
-- Dependent speaker/room links for deleted events cascade; retained events keep theirs.
DELETE FROM sessions s USING schedule_009_changes c
WHERE c.kind='session' AND c.id=s.id
  AND NOT EXISTS (SELECT 1 FROM saved_sessions WHERE session_id=s.id)
  AND NOT EXISTS (SELECT 1 FROM bingo_cards WHERE session_id=s.id)
  AND NOT EXISTS (SELECT 1 FROM session_prizes WHERE session_id=s.id);

UPDATE sessions s SET hidden=c.old_hidden FROM schedule_009_changes c
WHERE c.kind='hidden' AND c.id=s.id;

-- Keep shared mapping/lookup rows if any remaining event or assignment needs them.
DELETE FROM location_rooms lr USING schedule_009_changes c
WHERE c.kind='location_room' AND c.id=lr.location_id AND c.related_id=lr.room_id
  AND NOT EXISTS (SELECT 1 FROM sessions WHERE location_id=lr.location_id);

DELETE FROM locations l USING schedule_009_changes c
WHERE c.kind='location' AND c.id=l.id
  AND NOT EXISTS (SELECT 1 FROM sessions WHERE location_id=l.id);

DELETE FROM rooms r USING schedule_009_changes c
WHERE c.kind='room' AND c.id=r.id
  AND NOT EXISTS (SELECT 1 FROM location_rooms WHERE room_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM session_rooms WHERE room_id=r.id);

DELETE FROM speakers sp USING schedule_009_changes c
WHERE c.kind='speaker' AND c.id=sp.id
  AND NOT EXISTS (SELECT 1 FROM session_speakers WHERE speaker_id=sp.id);

DELETE FROM tracks t USING schedule_009_changes c
WHERE c.kind='track' AND c.id=t.id
  AND NOT EXISTS (SELECT 1 FROM sessions WHERE track_id=t.id);

DELETE FROM days d USING schedule_009_changes c
WHERE c.kind='day' AND c.id=d.id
  AND NOT EXISTS (SELECT 1 FROM sessions WHERE day_id=d.id);

DROP TABLE schedule_009_changes;
