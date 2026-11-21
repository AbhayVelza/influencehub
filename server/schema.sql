-- InfluenceHub tables (relational layout). Run by the API server at start-up; safe to run again.
-- Ids are the app's own ids (inf_…, acc_…, usr_…). `seq` keeps the order records were created in; the app reads
-- every list in that order (the activity log relies on it). Columns marked "kept" are derived values the server
-- writes in the same transaction as the change behind them; the app never reads them back (they exist for SQL
-- queries and reports). A database still on the old layout (one jsonb `data` column per table) must be migrated
-- first: `npm run db:migrate` (docs/server.md).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS team_members (
  id          text PRIMARY KEY,
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin', 'manager', 'executive', 'brand_specialist')),
  location    text CHECK (length(location) <= 80),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL,
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS team_members_email_uq ON team_members (lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS categories (
  id         text PRIMARY KEY,
  seq        bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
  is_active  boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_uq ON categories (lower(name));

CREATE TABLE IF NOT EXISTS influencers (
  id                    text PRIMARY KEY,
  seq                   bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  name                  text NOT NULL,
  category_id           text NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  phone                 text,
  email                 text,
  address_line1         text,
  address_line2         text,
  address_city          text,
  address_state         text,
  address_postal_code   text,
  address_country       text,
  city                  text,
  state                 text,
  country               text,
  profile_pic_url       text,
  is_verified           boolean NOT NULL DEFAULT false,
  total_reach           bigint,
  stage                 text NOT NULL CHECK (stage IN
                        ('data_gathered', 'contacted', 'onboarded', 'package_sent', 'delivered', 'on_hold', 'rejected')),
  assigned_to           text REFERENCES team_members (id) ON DELETE RESTRICT,
  tags                  text[] NOT NULL DEFAULT '{}',
  notes                 text,
  chk_called            boolean NOT NULL DEFAULT false,
  chk_agreement_signed  boolean NOT NULL DEFAULT false,
  chk_insights_received boolean NOT NULL DEFAULT false,
  chk_address_collected boolean NOT NULL DEFAULT false,
  chk_ig_connected      boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL,
  updated_at            timestamptz NOT NULL,
  -- kept (derived)
  platforms             text[] NOT NULL DEFAULT '{}',
  has_agreement         boolean NOT NULL DEFAULT false,
  insights_count        integer NOT NULL DEFAULT 0,
  ever_onboarded        boolean NOT NULL DEFAULT false,
  claimed_at            timestamptz,
  stage_before_hold     text,
  stage_changed_at      timestamptz NOT NULL,
  search_text           text NOT NULL DEFAULT '',
  CHECK (stage = 'on_hold' OR stage_before_hold IS NULL),
  CHECK (address_line1 IS NULL OR (address_city IS NOT NULL AND address_state IS NOT NULL
         AND address_postal_code IS NOT NULL AND address_country IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS influencers_stage_ix      ON influencers (stage);
CREATE INDEX IF NOT EXISTS influencers_owner_ix      ON influencers (assigned_to, stage);
CREATE INDEX IF NOT EXISTS influencers_pool_ix       ON influencers (created_at DESC) WHERE assigned_to IS NULL;
CREATE INDEX IF NOT EXISTS influencers_category_ix   ON influencers (category_id);
CREATE INDEX IF NOT EXISTS influencers_location_ix   ON influencers (country, state, city);
CREATE INDEX IF NOT EXISTS influencers_reach_ix      ON influencers (total_reach DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS influencers_updated_ix    ON influencers (updated_at DESC);
CREATE INDEX IF NOT EXISTS influencers_tags_gin      ON influencers USING gin (tags);
CREATE INDEX IF NOT EXISTS influencers_platforms_gin ON influencers USING gin (platforms);
CREATE INDEX IF NOT EXISTS influencers_search_trgm   ON influencers USING gin (search_text gin_trgm_ops);

CREATE TABLE IF NOT EXISTS social_accounts (
  id                      text PRIMARY KEY,
  influencer_id           text NOT NULL REFERENCES influencers (id) ON DELETE CASCADE,
  position                smallint NOT NULL,
  platform                text NOT NULL CHECK (platform IN
                          ('instagram', 'youtube', 'tiktok', 'facebook', 'threads', 'pinterest', 'linkedin', 'snapchat')),
  handle                  text NOT NULL,
  profile_url             text NOT NULL,
  is_primary              boolean NOT NULL DEFAULT false,
  sync_method             text NOT NULL CHECK (sync_method IN ('lookup', 'connect', 'manual')),
  sync_status             text NOT NULL CHECK (sync_status IN ('synced', 'pending', 'not_synced', 'error')),
  last_synced_at          timestamptz,
  connect_status          text CHECK (connect_status IN ('not_connected', 'link_sent', 'connected', 'expired')),
  connect_link_expires_at timestamptz,
  display_name            text,
  profile_pic_url         text,
  bio                     text,
  links                   text[] NOT NULL DEFAULT '{}',
  is_verified             boolean NOT NULL DEFAULT false,
  metrics                 jsonb NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL,
  -- kept (derived): the platform's audience metric
  audience                bigint,
  UNIQUE (platform, handle)
);
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_primary_uq   ON social_accounts (influencer_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS social_accounts_influencer_ix       ON social_accounts (influencer_id, position);
CREATE INDEX IF NOT EXISTS social_accounts_link_expiry_ix      ON social_accounts (connect_link_expires_at) WHERE connect_status = 'link_sent';

-- Audience history, written by each sync (server/pg-store.ts, never loaded into memory): one row per account per
-- IST day, the last 365 days. Accounts are saved by upsert, so the cascade only fires when an account is removed.
CREATE TABLE IF NOT EXISTS account_snapshots (
  account_id  text NOT NULL REFERENCES social_accounts (id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL,
  audience    bigint NOT NULL CHECK (audience >= 0),
  PRIMARY KEY (account_id, captured_at)
);

-- The recent posts the last sync returned (Instagram: 12), replaced wholesale per sync; position 0 = newest.
CREATE TABLE IF NOT EXISTS account_media (
  account_id text NOT NULL REFERENCES social_accounts (id) ON DELETE CASCADE,
  position   integer NOT NULL CHECK (position >= 0),
  thumbnail  text,
  permalink  text NOT NULL,
  likes      bigint CHECK (likes >= 0),
  comments   bigint CHECK (comments >= 0),
  posted_at  timestamptz NOT NULL,
  PRIMARY KEY (account_id, position)
);

CREATE TABLE IF NOT EXISTS calls (
  id             text PRIMARY KEY,
  seq            bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  influencer_id  text NOT NULL REFERENCES influencers (id) ON DELETE CASCADE,
  called_by      text NOT NULL REFERENCES team_members (id) ON DELETE RESTRICT,
  outcome        text NOT NULL CHECK (outcome IN ('interested', 'not_interested', 'call_back', 'no_answer', 'wrong_number')),
  notes          text,
  follow_up_date timestamptz,
  follow_up_done boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS calls_influencer_ix     ON calls (influencer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_open_followups_ix ON calls (called_by, follow_up_date) WHERE follow_up_date IS NOT NULL AND NOT follow_up_done;
CREATE INDEX IF NOT EXISTS calls_created_ix        ON calls (created_at);

CREATE TABLE IF NOT EXISTS packages (
  id                  text PRIMARY KEY,
  seq                 bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  influencer_id       text NOT NULL REFERENCES influencers (id) ON DELETE CASCADE,
  address_line1       text NOT NULL,
  address_line2       text,
  address_city        text NOT NULL,
  address_state       text NOT NULL,
  address_postal_code text NOT NULL,
  address_country     text NOT NULL,
  courier             text,
  tracking_number     text,
  status              text NOT NULL CHECK (status IN ('preparing', 'sent', 'in_transit', 'delivered', 'returned')),
  sent_at             timestamptz,
  delivered_at        timestamptz
);
CREATE INDEX IF NOT EXISTS packages_influencer_ix ON packages (influencer_id);
CREATE INDEX IF NOT EXISTS packages_status_ix     ON packages (status, sent_at DESC);

CREATE TABLE IF NOT EXISTS package_items (
  package_id text NOT NULL REFERENCES packages (id) ON DELETE CASCADE,
  position   smallint NOT NULL,
  name       text NOT NULL,
  qty        integer NOT NULL CHECK (qty >= 1),
  PRIMARY KEY (package_id, position)
);

-- Document files (agreements, insights summaries); `key` is the document's storage_key.
CREATE TABLE IF NOT EXISTS files (
  key          text PRIMARY KEY,
  content_type text NOT NULL,
  size         integer NOT NULL,
  data         bytea NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id            text PRIMARY KEY,
  seq           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  influencer_id text NOT NULL REFERENCES influencers (id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('insights_summary', 'agreement')),
  title         text NOT NULL,
  file_name     text NOT NULL,
  content_type  text NOT NULL,
  size          integer NOT NULL,
  storage_key   text NOT NULL UNIQUE REFERENCES files (key) ON DELETE RESTRICT,
  uploaded_by   text NOT NULL REFERENCES team_members (id) ON DELETE RESTRICT,
  uploaded_at   timestamptz NOT NULL,
  notes         text,
  deleted_at    timestamptz,
  period_start  date,
  period_end    date,
  platform      text,
  signed_on     date,
  valid_until   date,
  is_current    boolean,
  CHECK (type <> 'insights_summary' OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_start <= period_end)),
  CHECK (type <> 'agreement' OR (signed_on IS NOT NULL AND is_current IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS documents_current_agreement_uq ON documents (influencer_id)
  WHERE type = 'agreement' AND is_current AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_influencer_ix ON documents (influencer_id, uploaded_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_uploaded_ix   ON documents (uploaded_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS activities (
  id            text PRIMARY KEY,
  seq           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  influencer_id text NOT NULL REFERENCES influencers (id) ON DELETE CASCADE,
  actor         text REFERENCES team_members (id) ON DELETE RESTRICT,
  type          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS activities_influencer_ix ON activities (influencer_id, seq DESC);
CREATE INDEX IF NOT EXISTS activities_type_ix       ON activities (type, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_views (
  id         text PRIMARY KEY,
  seq        bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  name       text NOT NULL,
  filters    jsonb NOT NULL,
  sort       text,
  created_by text NOT NULL REFERENCES team_members (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL
);

-- Pairs a manager marked "not the same creator"; never suggested again.
CREATE TABLE IF NOT EXISTS dismissed_duplicates (
  influencer_a text NOT NULL REFERENCES influencers (id) ON DELETE CASCADE,
  influencer_b text NOT NULL REFERENCES influencers (id) ON DELETE CASCADE,
  PRIMARY KEY (influencer_a, influencer_b)
);

CREATE TABLE IF NOT EXISTS pool_settings (
  id                smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  claim_limit       integer CHECK (claim_limit BETWEEN 1 AND 500),
  auto_release_days integer CHECK (auto_release_days BETWEEN 1 AND 90)
);

CREATE TABLE IF NOT EXISTS instagram_settings (
  id                  smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  connected           boolean NOT NULL DEFAULT false,
  business_username   text,
  business_ig_user_id text,
  token_status        text NOT NULL CHECK (token_status IN ('valid', 'expiring', 'expired')),
  token_expires_at    timestamptz,
  sync_interval_hours smallint NOT NULL CHECK (sync_interval_hours IN (3, 6, 12, 24)),
  api_usage_pct       double precision NOT NULL DEFAULT 0 CHECK (api_usage_pct BETWEEN 0 AND 100)
);

-- The Instagram integration's recent sync runs (the settings page shows the latest 20).
CREATE TABLE IF NOT EXISTS sync_runs (
  started_at  timestamptz PRIMARY KEY,
  finished_at timestamptz,
  status      text NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  synced      integer NOT NULL DEFAULT 0,
  failed      integer NOT NULL DEFAULT 0
);

-- One-time data upgrades this workspace has finished (e.g. categories_upgraded), so they never run twice.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Finished jobs (CSV import, export, lookup, sync) of the last hour, so a poll still finds them after a restart.
CREATE TABLE IF NOT EXISTS jobs (
  id          text PRIMARY KEY,
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  status      text NOT NULL CHECK (status IN ('succeeded', 'failed')),
  result      jsonb,
  error       jsonb,
  created_at  timestamptz NOT NULL
);

-- CSV files uploaded and waiting to be imported (the latest 5), so a restart between upload and import keeps them.
CREATE TABLE IF NOT EXISTS csv_uploads (
  key   text PRIMARY KEY,
  seq   bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  text  text NOT NULL
);

-- Sign-in: password hashes (scrypt) and sessions, kept apart from the team records the API returns.
CREATE TABLE IF NOT EXISTS credentials (user_id text PRIMARY KEY, password_hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions (user_id);
