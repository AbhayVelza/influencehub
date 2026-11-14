-- InfluenceHub tables. Run by the API server at start-up; safe to run again.
-- Each record is one row: `id` is the app's own id (inf_…, acc_…, usr_… for team members), `data` is the
-- record exactly as the API returns it, and `seq` keeps the order records were created in (the activity log relies on it).

CREATE TABLE IF NOT EXISTS team                 (id text PRIMARY KEY, seq bigint GENERATED ALWAYS AS IDENTITY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS categories           (id text PRIMARY KEY, seq bigint GENERATED ALWAYS AS IDENTITY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS influencers          (id text PRIMARY KEY, seq bigint GENERATED ALWAYS AS IDENTITY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS documents            (id text PRIMARY KEY, seq bigint GENERATED ALWAYS AS IDENTITY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS calls                (id text PRIMARY KEY, seq bigint GENERATED ALWAYS AS IDENTITY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS packages             (id text PRIMARY KEY, seq bigint GENERATED ALWAYS AS IDENTITY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS activities           (id text PRIMARY KEY, seq bigint GENERATED ALWAYS AS IDENTITY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS saved_views          (id text PRIMARY KEY, seq bigint GENERATED ALWAYS AS IDENTITY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS settings             (id text PRIMARY KEY, seq bigint GENERATED ALWAYS AS IDENTITY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS dismissed_duplicates (id text PRIMARY KEY, seq bigint GENERATED ALWAYS AS IDENTITY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

-- Document files (agreements, insights summaries); `key` is the document's storage_key.
CREATE TABLE IF NOT EXISTS files (key text PRIMARY KEY, content_type text NOT NULL, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- Sign-in: password hashes (scrypt) and sessions, kept apart from the team records the API returns.
CREATE TABLE IF NOT EXISTS credentials (user_id text PRIMARY KEY, password_hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions (user_id);
