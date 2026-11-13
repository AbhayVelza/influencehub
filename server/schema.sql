-- InfluenceHub tables. Run by the API server at start-up and by `npm run seed:admin`; safe to run again.
-- Each record is one row: `id` is the app's own id (inf_…, acc_…, the Firebase uid for team members), `data` is the
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
