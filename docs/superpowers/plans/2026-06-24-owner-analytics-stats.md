# Owner Analytics (`npm run stats`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local `npm run stats` command (run from `worker/`) that prints a readable analytics report of the live leaderboard D1 DB — totals, per-mode, last-14-days, recent runs, most-active players.

**Architecture:** A pure formatter module (`statsFormat.mjs`, fully unit-tested with `node:test`) plus a thin runner (`stats.mjs`) that queries the remote D1 via the owner's existing wrangler login (same mechanism as the `schema` script), parses the JSON, and prints the formatted report.

**Tech Stack:** Node ESM (`.mjs`), `node:test` (built-in), wrangler (already a `worker/` devDependency), Cloudflare D1.

## Global Constraints

- **No new npm dependencies.** `node:test` is built-in; wrangler is already in `worker/` devDependencies.
- **Tool only** — no worker runtime change, no game change, read-only against D1, no PII handling.
- **Run from `worker/`** (where `wrangler.toml` defines the D1 binding). DB name is `lancefall`.
- **Windows is the owner's platform** — spawn wrangler with `shell: true` so `npx` resolves to `npx.cmd`.
- **No impact analysis needed** (all-new files + additive `package.json` scripts; no existing symbol edited).
- **Commands** (from `worker/`): tests `node --test tools/` (also wired as `npm test`); the tool `npm run stats`.

---

### Task 1: Pure formatter + tests

**Files:**
- Create: `worker/tools/statsFormat.mjs`
- Test: `worker/tools/statsFormat.test.mjs`
- Modify: `worker/package.json` (add `"test": "node --test tools/"`)

**Interfaces:**
- Produces (all pure, no I/O):
  - `num(n: number): string` — thousands-separated integer.
  - `fmtAgo(ts: number, now: number): string` — `"just now" | "<N>m ago" | "<N>h ago" | "<N>d ago"`.
  - `fmtWhen(ts: number): string` — UTC `"YYYY-MM-DD HH:MM"`.
  - `bar(value: number, max: number, width=16): string` — `█`/`░` bar; `max<=0` ⇒ all empty.
  - `formatReport(data, now: number): string` where `data = { overview, perMode, perDay, recent, active }` (each an array of row objects).

- [ ] **Step 1: Write the failing test + add the `test` script**

Create `worker/tools/statsFormat.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtAgo, bar, num, formatReport } from './statsFormat.mjs';

test('fmtAgo buckets', () => {
  const now = 1_000_000_000_000;
  assert.equal(fmtAgo(now - 30_000, now), 'just now');       // 30s
  assert.equal(fmtAgo(now - 5 * 60_000, now), '5m ago');
  assert.equal(fmtAgo(now - 3 * 3_600_000, now), '3h ago');
  assert.equal(fmtAgo(now - 2 * 86_400_000, now), '2d ago');
  assert.equal(fmtAgo(now + 5000, now), 'just now');         // future clamps to 0
});

test('bar scales and is safe at the edges', () => {
  assert.equal(bar(10, 10, 8), '████████');
  assert.equal(bar(0, 10, 8), '░░░░░░░░');
  assert.equal(bar(5, 10, 8), '████░░░░');
  assert.equal(bar(3, 0, 8), '░░░░░░░░');                     // max 0 => empty, no crash
});

test('num is thousands-separated', () => {
  assert.equal(num(3003170), '3,003,170');
  assert.equal(num(0), '0');
});

test('formatReport renders all sections, a ✓ and a thousands number', () => {
  const now = 1_700_000_000_000;
  const data = {
    overview: [{ total_runs: 259, players: 9, linked: 1, first_ts: now - 10 * 86400000, last_ts: now - 86400000, runs_24h: 2, runs_7d: 25 }],
    perMode: [{ mode: 'endless', runs: 78, players: 7, top: 3003170 }],
    perDay: [{ day: '2026-06-23', runs: 2, players: 2 }, { day: '2026-06-22', runs: 5, players: 2 }],
    recent: [{ name: 'patij212', mode: 'longestday', score: 3063, wave: 1, ts: now - 3600000, account_id: 'acc_x' }],
    active: [{ name: 'patij212', runs: 140, best: 701911, last_ts: now - 3600000 }],
  };
  const out = formatReport(data, now);
  for (const h of ['OVERVIEW', 'BY MODE', 'LAST 14 DAYS', 'RECENT RUNS', 'MOST ACTIVE']) assert.match(out, new RegExp(h));
  assert.match(out, /3,003,170/);          // thousands separator
  assert.match(out, /patij212 ✓/);         // verified marker on a linked recent row
  assert.match(out, /1 linked account\b/); // singular form
});

test('formatReport handles an empty DB without crashing', () => {
  const out = formatReport({ overview: [], perMode: [], perDay: [], recent: [], active: [] }, 1_700_000_000_000);
  assert.match(out, /no runs recorded yet/);
});
```

Add the `test` script to `worker/package.json` (in `"scripts"`, alongside `dev`/`deploy`/`schema`):

```json
    "test": "node --test tools/",
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `worker/`): `node --test tools/statsFormat.test.mjs`
Expected: FAIL — `Cannot find module './statsFormat.mjs'` (or import error); the module does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `worker/tools/statsFormat.mjs`:

```js
// Pure formatting/aggregation for `npm run stats` (no I/O). Unit-tested with node:test.

/** Thousands-separated integer (rounded; non-numbers => 0). */
export function num(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}

/** "just now" | "<N>m ago" | "<N>h ago" | "<N>d ago" from two epoch-ms values (clamps future to 0). */
export function fmtAgo(ts, now) {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** UTC 'YYYY-MM-DD HH:MM' for an epoch-ms value. */
export function fmtWhen(ts) {
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
}

/** Text bar (█ filled / ░ empty) of `width`, scaled so value/max fills it. max<=0 => all empty. */
export function bar(value, max, width = 16) {
  if (!(max > 0)) return '░'.repeat(width);
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

const RULE = '─'.repeat(60);
const padR = (s, w) => { s = String(s); return s.length >= w ? s : s + ' '.repeat(w - s.length); };
const padL = (s, w) => { s = String(s); return s.length >= w ? s : ' '.repeat(w - s.length) + s; };

/** Build the full report string from the 5 parsed result sets + a `now` epoch-ms. */
export function formatReport(data, now) {
  const { overview = [], perMode = [], perDay = [], recent = [], active = [] } = data || {};
  const o = overview[0] || {};
  const L = [];
  L.push(`LANCEFALL — leaderboard stats           (generated ${fmtWhen(now)} UTC)`);
  L.push(RULE);

  L.push('OVERVIEW');
  if (o.total_runs != null) {
    L.push(`  ${num(o.total_runs)} runs · ${num(o.players)} players · ${num(o.linked)} linked account${Number(o.linked) === 1 ? '' : 's'}`);
    const span = (o.first_ts && o.last_ts) ? `${fmtWhen(o.first_ts).slice(0, 10)} → ${fmtWhen(o.last_ts).slice(0, 10)}` : '—';
    L.push(`  span ${span} · last 24h: ${num(o.runs_24h)} · last 7d: ${num(o.runs_7d)}`);
  } else {
    L.push('  (no runs recorded yet)');
  }
  L.push('');

  L.push('BY MODE');
  for (const r of perMode) L.push(`  ${padR(r.mode, 11)}${padL(num(r.runs), 5)} runs  ${padL(num(r.players), 4)} players   top ${num(r.top)}`);
  if (!perMode.length) L.push('  —');
  L.push('');

  L.push('LAST 14 DAYS');
  const maxDay = perDay.reduce((m, r) => Math.max(m, Number(r.runs) || 0), 0);
  for (const r of perDay) L.push(`  ${padR(r.day, 12)}${padL(num(r.runs), 4)}  ${bar(Number(r.runs) || 0, maxDay, 10)}  ${num(r.players)}p`);
  if (!perDay.length) L.push('  —');
  L.push('');

  L.push('RECENT RUNS');
  for (const r of recent) {
    const vt = r.account_id ? ' ✓' : '';
    L.push(`  ${padR((r.name || '') + vt, 14)}${padR(r.mode, 11)}${padL(num(r.score), 9)}  w${r.wave}  ${fmtAgo(r.ts, now)}`);
  }
  if (!recent.length) L.push('  —');
  L.push('');

  L.push('MOST ACTIVE');
  for (const r of active) L.push(`  ${padR(r.name, 14)}${padL(num(r.runs), 4)} runs   best ${padL(num(r.best), 9)}   last ${fmtAgo(r.last_ts, now)}`);
  if (!active.length) L.push('  —');

  return L.join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `worker/`): `node --test tools/statsFormat.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/tools/statsFormat.mjs worker/tools/statsFormat.test.mjs worker/package.json
git commit -m "feat(lancefall-worker): pure stats formatter for npm run stats"
```

---

### Task 2: The runner + `npm run stats`

**Files:**
- Create: `worker/tools/stats.mjs`
- Modify: `worker/package.json` (add `"stats": "node tools/stats.mjs"`)
- Modify: `worker/README.md` (one line under leaderboard ops — optional but do it)

**Interfaces:**
- Consumes: `formatReport(data, now)` from Task 1.
- Produces: the `npm run stats` command (prints the report; no exported API).

- [ ] **Step 1: Write the runner**

Create `worker/tools/stats.mjs`:

```js
// `npm run stats` — print a report of the live leaderboard DB. Reuses the owner's wrangler login
// (same path as the `schema` npm script). Read-only. No new deps. Run from worker/.
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReport } from './statsFormat.mjs';

const DB = 'lancefall';
const workerDir = dirname(dirname(fileURLToPath(import.meta.url))); // worker/tools/ -> worker/

function buildSql(now) {
  const d1 = now - 86_400_000;
  const d7 = now - 604_800_000;
  return [
    `SELECT COUNT(*) AS total_runs, COUNT(DISTINCT name) AS players, COUNT(DISTINCT account_id) AS linked, MIN(ts) AS first_ts, MAX(ts) AS last_ts, SUM(CASE WHEN ts > ${d1} THEN 1 ELSE 0 END) AS runs_24h, SUM(CASE WHEN ts > ${d7} THEN 1 ELSE 0 END) AS runs_7d FROM scores;`,
    `SELECT mode, COUNT(*) AS runs, COUNT(DISTINCT name) AS players, MAX(score) AS top FROM scores GROUP BY mode ORDER BY runs DESC;`,
    `SELECT date(ts/1000,'unixepoch') AS day, COUNT(*) AS runs, COUNT(DISTINCT name) AS players FROM scores GROUP BY day ORDER BY day DESC LIMIT 14;`,
    `SELECT name, mode, score, wave, ts, account_id FROM scores ORDER BY ts DESC LIMIT 15;`,
    `SELECT name, COUNT(*) AS runs, MAX(score) AS best, MAX(ts) AS last_ts FROM scores GROUP BY name ORDER BY runs DESC LIMIT 10;`,
  ].join('\n');
}

function fail(msg) { console.error(`\n  ${msg}\n`); process.exit(1); }

const now = Date.now();
const tmp = join(tmpdir(), `lancefall-stats-${process.pid}.sql`);
writeFileSync(tmp, buildSql(now), 'utf8');

let out = '';
try {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', DB, '--remote', '--json', `--file=${tmp}`], {
    cwd: workerDir, shell: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (res.status !== 0) {
    fail(`Could not query the leaderboard DB (wrangler exit ${res.status}). Logged in? Try: npx wrangler login\n${(res.stderr || '').trim()}`);
  }
  out = res.stdout || '';
} finally {
  try { unlinkSync(tmp); } catch { /* ignore */ }
}

// --json prints a JSON array (one result object per statement). Slice defensively in case a
// wrangler banner contaminates stdout.
const start = out.indexOf('[');
const end = out.lastIndexOf(']');
if (start < 0 || end < 0) fail(`Unexpected wrangler output (no JSON found).\n${out.slice(0, 400)}`);
let parsed;
try { parsed = JSON.parse(out.slice(start, end + 1)); } catch (e) { fail(`Could not parse wrangler JSON: ${e.message}`); }

const rs = (i) => (parsed[i] && Array.isArray(parsed[i].results)) ? parsed[i].results : [];
const data = { overview: rs(0), perMode: rs(1), perDay: rs(2), recent: rs(3), active: rs(4) };
console.log('\n' + formatReport(data, now) + '\n');
```

- [ ] **Step 2: Add the `stats` script**

Add to `worker/package.json` `"scripts"`:

```json
    "stats": "node tools/stats.mjs",
```

- [ ] **Step 3: Run it live + verify the JSON shape**

Run (from `worker/`): `npm run stats`
Expected: the report prints with real numbers matching the spec's validation (≈259 runs, 9 players, 1 linked, the per-mode table, recent runs incl. `DAWN-2007 … 500`).

**If it errors with "no JSON found" or sections are empty:** the multi-statement `--json` shape differs from the assumed `[{results}, …]`. Inspect once with `npx wrangler d1 execute lancefall --remote --json --command "SELECT 1 AS a; SELECT 2 AS b;"` and adjust the `rs(i)` accessor (e.g., if wrangler nests under a different key or flattens). Re-run until the report matches the live data. Do NOT mark this step done until the printed report is correct.

- [ ] **Step 4: Re-run the formatter tests (guard against regressions)**

Run (from `worker/`): `npm test`
Expected: PASS (5 tests) — confirms the `test` script resolves `tools/` and `stats.mjs` is not picked up as a test file.

- [ ] **Step 5: Document it**

Add one line to `worker/README.md` near the other ops commands (e.g. after the `schema`/deploy notes):

```markdown
- `npm run stats` — print a local analytics report of the live leaderboard DB (totals, per-mode, recent runs). Read-only; uses your wrangler login.
```

- [ ] **Step 6: Commit**

```bash
git add worker/tools/stats.mjs worker/package.json worker/README.md
git commit -m "feat(lancefall-worker): npm run stats — owner analytics report"
```

---

## Self-Review

**Spec coverage:**
- Local `npm run stats` from `worker/` → Task 2. ✓
- 5 sections (overview / per-mode / last-14-days / recent / active) → `formatReport` (Task 1) + queries (Task 2). ✓
- wrangler via temp `.sql` `--file`, `now` injected as literals, cross-platform `shell:true` spawn → Task 2 Step 1. ✓
- Multi-statement `--json` positional mapping + live-verify + fallback → Task 2 Step 3. ✓
- Failure handling (clear message, non-zero exit) → `fail()` in Task 2. ✓
- Pure formatter unit-tested with `node:test`, no new deps → Task 1. ✓
- README pointer → Task 2 Step 5. ✓

**Placeholder scan:** No TBD/TODO; every code/command step is concrete. The Task 2 Step 3 "adjust if shape differs" is a real conditional verification instruction with an exact diagnostic command, not a placeholder. ✓

**Type consistency:** `num`/`fmtAgo`/`bar`/`fmtWhen`/`formatReport` signatures match between Task 1's definition, its tests, and Task 2's consumption (`formatReport(data, now)` with `data = {overview, perMode, perDay, recent, active}`). The `rs(i)` accessor feeds exactly those five keys. ✓
