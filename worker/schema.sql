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
