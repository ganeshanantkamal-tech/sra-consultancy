-- Database for the SRA website's /admin content manager (Neon Postgres).
-- Safe to run more than once. Apply with: node --env-file=.env.local db/migrate.mjs

-- The website content saved from /admin: a single row
CREATE TABLE IF NOT EXISTS site_content (
  id         integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  content    jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Every save, so an earlier version can be put back (the app keeps the latest 30)
CREATE TABLE IF NOT EXISTS content_versions (
  id       bigserial PRIMARY KEY,
  content  jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);

-- Contact-form enquiries
CREATE TABLE IF NOT EXISTS enquiries (
  id            bigserial PRIMARY KEY,
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'visit', 'closed')),
  name          text NOT NULL,
  phone         text NOT NULL DEFAULT '',
  place         text NOT NULL DEFAULT '',
  building_type text NOT NULL DEFAULT '',
  message       text NOT NULL,
  notes         text NOT NULL DEFAULT '',
  received_at   timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz
);

CREATE INDEX IF NOT EXISTS enquiries_received_at_idx ON enquiries (received_at DESC);
