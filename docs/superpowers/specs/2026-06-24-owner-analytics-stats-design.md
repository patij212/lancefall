# Owner analytics — `npm run stats` — design

**Date:** 2026-06-24
**Status:** approved (ready for implementation plan)

## Problem

The leaderboard worker records every board-eligible run as a timestamped row in the D1 `scores`
table, but the only read surface is the public best-per-player top-100 board. The owner has **no
way to see plays/players/activity** — "is anyone playing, when, how much, which modes." Today that
data is only reachable by ad-hoc D1 queries.

## Goal

A local **`npm run stats`** command (run from `worker/`) that prints a readable analytics report of
the live leaderboard DB: totals, per-mode, recent activity, recent runs, most-active players.

## Decision (locked with the owner)

- **Access = a local CLI command**, not a public endpoint. Private by construction (runs under the
  owner's existing Cloudflare/wrangler auth), no new secret, no new attack surface, no redeploy.
- **Scope = 5 sections** (owner approved): overview, per-mode, last-14-days, recent runs,
  most-active players.

## Non-goals

- No public/owner HTTP endpoint, no hosted dashboard, no auth/secret to manage.
- No worker runtime change, no game change. This is a dev/ops tool only.
- No new npm dependencies (wrangler is already a `worker/` devDependency; tests use built-in
  `node:test`).
- No PII handling: rows are self-chosen handles/callsigns + scores + timestamps.

## Architecture

Three new files under `worker/tools/`, plus two `worker/package.json` scripts. Clean split:

- **`worker/tools/statsFormat.mjs` — pure, no I/O.** Takes the parsed query results and returns the
  printable report string. All testable logic lives here. Exports:
  - `fmtAgo(ts: number, now: number): string` — `"just now" | "<N>m ago" | "<N>h ago" | "<N>d ago"`.
  - `bar(value: number, max: number, width = 16): string` — a text bar (`█`/`░`) scaled to `max`.
  - `fmtWhen(ts: number): string` — `YYYY-MM-DD HH:MM` (UTC) for the date span.
  - `formatReport(data, now): string` — the full multi-section report. `data` shape:
    `{ overview, perMode, perDay, recent, active }` (each an array of row objects, see SQL below).
- **`worker/tools/stats.mjs` — the runner (I/O glue).** Builds the SQL (injecting `now =
  Date.now()` as numeric literals so no reliance on SQLite `unixepoch()`), writes it to a temp
  `.sql` file, runs wrangler against the remote DB, parses the JSON, calls `formatReport`, prints.
- **`worker/tools/statsFormat.test.mjs` — `node:test` unit tests** for the pure helpers.

`worker/package.json` scripts:
- `"stats": "node tools/stats.mjs"`
- `"test": "node --test tools/"`

## Data access

The runner shells out to wrangler — the SAME mechanism as the existing `schema` script
(`wrangler d1 execute lancefall --remote ...`), so it reuses the owner's wrangler login:

```
npx wrangler d1 execute lancefall --remote --json --file=<tempfile>
```

- SQL is written to a temp file (`os.tmpdir()`) rather than `--command "..."` to avoid
  cross-platform shell-quoting issues with SQL text.
- Spawn cross-platform: `spawnSync('npx', [...args], { cwd: <worker dir>, shell: true, encoding:
  'utf8' })` — `shell: true` makes `npx` resolve to `npx.cmd` on Windows (the owner's platform).
- The runner runs all 5 statements in ONE multi-statement file; `--json` returns a JSON array with
  one result object per statement (positional mapping `results[0..4]`). **Plan must verify this
  multi-statement `--json` shape on the first live run**; fallback is one wrangler call per section.
- stdout parsing: `JSON.parse` the stdout; if a wrangler banner contaminates stdout, slice from the
  first `[` to the last `]` before parsing (verify live).
- Failure handling: non-zero exit, empty output, or parse failure → print a clear one-line message
  (e.g. "Could not reach the leaderboard DB — are you logged into wrangler?") and exit non-zero.
  Never throw a raw stack at the owner.

## Queries (validated against the live DB)

`now` is injected by the runner as `Date.now()`.

1. **Overview** →
   ```sql
   SELECT COUNT(*) AS total_runs, COUNT(DISTINCT name) AS players,
          COUNT(DISTINCT account_id) AS linked, MIN(ts) AS first_ts, MAX(ts) AS last_ts,
          SUM(CASE WHEN ts > {now-86400000} THEN 1 ELSE 0 END) AS runs_24h,
          SUM(CASE WHEN ts > {now-604800000} THEN 1 ELSE 0 END) AS runs_7d
   FROM scores;
   ```
2. **Per mode** →
   ```sql
   SELECT mode, COUNT(*) AS runs, COUNT(DISTINCT name) AS players, MAX(score) AS top
   FROM scores GROUP BY mode ORDER BY runs DESC;
   ```
3. **Last 14 days** →
   ```sql
   SELECT date(ts/1000,'unixepoch') AS day, COUNT(*) AS runs, COUNT(DISTINCT name) AS players
   FROM scores GROUP BY day ORDER BY day DESC LIMIT 14;
   ```
4. **Recent runs** →
   ```sql
   SELECT name, mode, score, wave, ts, account_id
   FROM scores ORDER BY ts DESC LIMIT 15;
   ```
5. **Most-active players** →
   ```sql
   SELECT name, COUNT(*) AS runs, MAX(score) AS best, MAX(ts) AS last_ts
   FROM scores GROUP BY name ORDER BY runs DESC LIMIT 10;
   ```

## Report layout (what the owner sees)

```
LANCEFALL — leaderboard stats           (generated 2026-06-24 00:57 UTC)
────────────────────────────────────────────────────────────
OVERVIEW
  259 runs · 9 players · 1 linked account
  span 2026-06-09 → 2026-06-23 · last 24h: 2 · last 7d: 25

BY MODE
  endless    78 runs   7 players   top 3,003,170
  arena      55 runs   2 players   top   167,180
  ...

LAST 14 DAYS
  2026-06-23   2  █░░░░░░░
  2026-06-22   5  ███░░░░░
  ...

RECENT RUNS
  DAWN-2007    endless    500   w1   3m ago
  patij212 ✓   longestday 3,063 w1   1d ago
  ...

MOST ACTIVE
  patij212   140 runs   best 701,911   last 1d ago
  ...
```

Numbers are thousands-separated; `✓` marks a verified (linked-account) row; counts and bars are
rendered by the pure helpers.

## Testing

`worker/tools/statsFormat.test.mjs` (run via `npm test` → `node --test tools/`):
- `fmtAgo`: `<1min → "just now"`, minutes, hours, days boundaries (with an injected `now`).
- `bar`: `value=max` → full width; `value=0` → empty; mid value → proportional; `max=0` → no crash.
- `formatReport`: given small fixture arrays for all five sections, the output contains each section
  header, a known formatted row (thousands separator), the `✓` for a linked row, and the generated
  timestamp.

The runner (`stats.mjs`) is wrangler/network glue — verified by running `npm run stats` live once
and confirming the report matches the data this spec was validated against.

## Files

- Create: `worker/tools/statsFormat.mjs`, `worker/tools/stats.mjs`, `worker/tools/statsFormat.test.mjs`
- Modify: `worker/package.json` (add `stats` + `test` scripts)
- (Optional) a one-line pointer in `worker/README.md` under leaderboard ops.
