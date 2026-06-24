// `npm run stats` — print a report of the live leaderboard DB. Runs the local wrangler CLI via
// `node` directly (no npx, no shell — cross-platform + clean argv), reusing the owner's wrangler
// login. Read-only. No new deps. Run from worker/.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { formatReport } from './statsFormat.mjs';

const require = createRequire(import.meta.url);
const DB = 'lancefall';
const workerDir = dirname(dirname(fileURLToPath(import.meta.url))); // worker/tools/ -> worker/
// Resolve the local wrangler CLI entry (./bin/wrangler.js) so we can run it with node directly.
const wranglerPkgPath = require.resolve('wrangler/package.json');
const wranglerBin = join(dirname(wranglerPkgPath), require(wranglerPkgPath).bin.wrangler);

function buildSql(now) {
  const d1 = now - 86_400_000;
  const d7 = now - 604_800_000;
  // NOTE: read with --command (not --file): against --remote, --file returns only an upload
  // summary, while --command returns the actual rows (one result object per statement).
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
const res = spawnSync(
  process.execPath,
  [wranglerBin, 'd1', 'execute', DB, '--remote', '--json', '--command', buildSql(now)],
  { cwd: workerDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);
if (res.error) fail(`Could not run wrangler: ${res.error.message}`);
if (res.status !== 0) {
  fail(`Could not query the leaderboard DB (wrangler exit ${res.status}). Logged in? Try: npx wrangler login\n${(res.stderr || '').trim()}`);
}

// --json prints a JSON array (one result object per statement). Slice defensively in case a
// wrangler banner contaminates stdout.
const out = res.stdout || '';
const start = out.indexOf('[');
const end = out.lastIndexOf(']');
if (start < 0 || end < 0) fail(`Unexpected wrangler output (no JSON found).\n${out.slice(0, 400)}`);
let parsed;
try { parsed = JSON.parse(out.slice(start, end + 1)); } catch (e) { fail(`Could not parse wrangler JSON: ${e.message}`); }

const rs = (i) => (parsed[i] && Array.isArray(parsed[i].results)) ? parsed[i].results : [];
const data = { overview: rs(0), perMode: rs(1), perDay: rs(2), recent: rs(3), active: rs(4) };
console.log('\n' + formatReport(data, now) + '\n');
