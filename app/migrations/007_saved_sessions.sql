CREATE TABLE saved_sessions (
    user_id    BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    saved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, session_id)
);
CREATE INDEX saved_sessions_session_idx ON saved_sessions (session_id);
