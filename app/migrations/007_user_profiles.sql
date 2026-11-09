CREATE TABLE user_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
