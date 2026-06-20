-- LANCEFALL leaderboard schema (Cloudflare D1 / SQLite).
-- Apply with:  wrangler d1 execute lancefall --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS scores (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  mode   TEXT    NOT NULL,
  daily  TEXT,                 -- 'YYYY-MM-DD' for daily runs, else NULL
  name   TEXT    NOT NULL,
  score  INTEGER NOT NULL,
  wave   INTEGER NOT NULL,
  combo  INTEGER NOT NULL,
  heat   INTEGER NOT NULL,
  ts     INTEGER NOT NULL
);

-- the read path: top scores per mode (and per daily date), + the weekly board
CREATE INDEX IF NOT EXISTS idx_scores_mode    ON scores (mode, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_daily   ON scores (mode, daily, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_mode_ts ON scores (mode, ts);

-- §v7 achievement-rarity aggregate. One row per (device, achievement); `device` is a
-- client-generated random token (NOT PII) used only to dedupe reporters, so rarity =
-- holders / distinct-devices. Append-only: achievements never un-unlock, so reports use
-- INSERT OR IGNORE. holders[id] = COUNT(*) GROUP BY id (the composite PK makes that the
-- distinct-device count); players = COUNT(DISTINCT device).
CREATE TABLE IF NOT EXISTS ach_unlocks (
  device TEXT    NOT NULL,
  id     TEXT    NOT NULL,
  ts     INTEGER NOT NULL,
  PRIMARY KEY (device, id)
);
CREATE INDEX IF NOT EXISTS idx_ach_id ON ach_unlocks (id);

-- ── Player accounts + cloud saves (Player Accounts P1) ──────────────────────────
-- Anonymous-first: a row is created on first /hello keyed by the anon device token.
-- provider/provider_id/name are populated by the P2 OAuth link flow (NULL for anon).
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,         -- random 'acc_...' id
  anon_token    TEXT UNIQUE,              -- the deviceId that created it (nullable after a link-merge)
  provider      TEXT,                     -- 'discord' | 'google' | NULL (anonymous)
  provider_id   TEXT,                     -- stable provider user id
  name          TEXT,                     -- claimed verified name (linked only)
  name_verified INTEGER DEFAULT 0,
  created_at    INTEGER,
  updated_at    INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_provider ON accounts (provider, provider_id);

CREATE TABLE IF NOT EXISTS saves (
  account_id  TEXT PRIMARY KEY REFERENCES accounts(id),
  blob        TEXT,        -- the merged SaveData JSON (sanitized server-side)
  rev         INTEGER,     -- monotonic revision (optimistic concurrency)
  updated_at  INTEGER
);

-- Player Accounts P3 — bind a score to a linked account (nullable; anon scores leave it NULL).
-- SQLite has no "ADD COLUMN IF NOT EXISTS"; guard the re-apply by ignoring the duplicate-column
-- error (the owner applies the whole file; a fresh DB adds it, a re-apply is a harmless no-op).
ALTER TABLE scores ADD COLUMN account_id TEXT;
