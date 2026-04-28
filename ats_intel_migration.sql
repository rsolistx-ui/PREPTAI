-- PREPT AI: ATS Intelligence module
-- Run this in Supabase SQL editor or via migrations

CREATE TABLE IF NOT EXISTS ats_intel (
  id           serial PRIMARY KEY,
  version      text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   text,
  content      text NOT NULL,
  token_count  integer,
  is_active    boolean DEFAULT true,
  notes        text
);

-- Index for the hot path: fetch the current active record
CREATE INDEX IF NOT EXISTS ats_intel_active_idx ON ats_intel (is_active, updated_at DESC);

-- Row-level security: service role can read/write; anon can only read active records
ALTER TABLE ats_intel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active intel"
  ON ats_intel FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "Service role full access"
  ON ats_intel FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed with a note (actual content is in ATS_INTEL_BASELINE in api/chat.js)
-- To activate Supabase-managed updates, POST to /api/chat with mode:"ats_update"
-- and ATS_ADMIN_SECRET env var set. The API will upsert new rows here.
COMMENT ON TABLE ats_intel IS 'ATS system intelligence documents — fetched at runtime and injected into the PREPT Match analysis prompt. Update via POST /api/chat { mode: ats_update, adminSecret: <ATS_ADMIN_SECRET> }.';
