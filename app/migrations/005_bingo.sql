CREATE TABLE session_prizes (
    session_id     INTEGER PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    prize          TEXT NOT NULL,
    winner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    won_at         TIMESTAMPTZ
);

INSERT INTO session_prizes (session_id, prize)
SELECT id, 'Limited-edition KubeCon sticker pack' FROM sessions;

CREATE TABLE bingo_cards (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    cells      JSONB NOT NULL,
    marked     INTEGER[] NOT NULL DEFAULT '{12}',
    bingo_at   TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, session_id)
);
