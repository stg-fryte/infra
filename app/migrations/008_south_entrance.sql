-- Keep retired schedule entries for existing references and saved data.
ALTER TABLE sessions ADD COLUMN hidden boolean NOT NULL DEFAULT false;
UPDATE sessions SET hidden = true WHERE trim(title) = 'Coat + Bag Check';

-- Named points share the existing event/location mapping tables with rooms.
ALTER TABLE rooms DROP CONSTRAINT rooms_boundary_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_boundary_check
    CHECK ((boundary->>'type' IN ('Polygon', 'Point')) IS TRUE);

INSERT INTO rooms (venue, floor, name, boundary) VALUES
    ('Salt Palace', 1, 'South Entrance',
     '{"type":"Point","coordinates":[-111.89597777568913,40.76749822983771]}');

INSERT INTO location_rooms (location_id, room_id)
SELECT locations.id, rooms.id FROM locations CROSS JOIN rooms
WHERE locations.venue = 'Salt Palace' AND locations.room = '200 South Entrance (South)'
  AND rooms.venue = 'Salt Palace' AND rooms.name = 'South Entrance' AND rooms.floor = 1;

INSERT INTO session_rooms (session_id, room_id)
SELECT sessions.id, location_rooms.room_id
FROM sessions JOIN location_rooms ON location_rooms.location_id = sessions.location_id
JOIN rooms ON rooms.id = location_rooms.room_id
WHERE rooms.venue = 'Salt Palace' AND rooms.name = 'South Entrance' AND rooms.floor = 1;
