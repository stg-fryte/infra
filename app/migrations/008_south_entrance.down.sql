DELETE FROM rooms WHERE venue = 'Salt Palace' AND floor = 1 AND name = 'South Entrance';
ALTER TABLE rooms DROP CONSTRAINT rooms_boundary_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_boundary_check
    CHECK ((boundary->>'type' = 'Polygon') IS TRUE);
ALTER TABLE sessions DROP COLUMN hidden;
