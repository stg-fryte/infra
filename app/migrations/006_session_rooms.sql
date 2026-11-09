CREATE TABLE session_rooms (
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, room_id)
);
CREATE INDEX session_rooms_room_idx ON session_rooms (room_id);

INSERT INTO session_rooms (session_id, room_id)
SELECT sessions.id, location_rooms.room_id
FROM sessions
JOIN location_rooms ON location_rooms.location_id = sessions.location_id;
