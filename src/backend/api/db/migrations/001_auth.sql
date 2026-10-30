CREATE TABLE auth_users (
  user_id uuid PRIMARY KEY,
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email) AND email = btrim(email)),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_rate_limits (
  key char(64) PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits(expires_at);
