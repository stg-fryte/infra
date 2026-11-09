CREATE TABLE session_games (
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    game       TEXT    NOT NULL CHECK (game ~ '^[a-z][a-z0-9_]*$'),
    PRIMARY KEY (session_id, game)
);

INSERT INTO session_games (session_id, game)
SELECT id, 'bingo' FROM sessions
WHERE format NOT IN (
    'Registration', 'Experience', 'Break', 'Expo', 'Tour',
    'Sponsor-hosted Co-located', 'CNCF-hosted Co-located', 'Co-located (separate registration)'
);
