// LANCEFALL — PARALLEL-TABS balance harness (browser, N tabs at once).
//
//   node tools/balance-tabs.mjs                          → full grid across N tabs
//   node tools/balance-tabs.mjs --tabs=6 --runs=12       → cap tabs + sample size
//   node tools/balance-tabs.mjs --modes=arena,bossrush   → subset
//   node tools/balance-tabs.mjs --url=http://localhost:5197  → reuse a running dev server
//
// WHY (vs the Node harness): it runs the REAL browser engine, so it's the truest measure of
// the shipped runtime (same V8 build the players get) — and it's self-contained: it spins its
// OWN Vite dev server with HMR OFF (so a teammate editing the tree can't reload the tabs mid
// run), launches headless Chromium, and fans the modes across N pages. Each page is its own
// renderer process, so the tabs genuinely run on different cores.
//
// It drives the SAME autopilot as everything else by loading tools/balance-bot.js (which uses
// the shared tools/bot-core.mjs brain) and calling its in-page __bigSweep().

import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MODES = ['endless', 'arena', 'daily', 'weekly', 'nightmare', 'bossrush', 'longestday', 'casual'];
const DEFAULT_HEATS = [0, 1, 2, 3, 4, 5, 6, 7];

function parseArgs(argv) {
  const a = { tabs: 0, runs: 10, modes: null, heats: null, url: null, json: false };
  for (const tok of argv) {
    if (tok === '--json') a.json = true;
    else if (tok.startsWith('--tabs=')) a.tabs = +tok.slice(7);
    else if (tok.startsWith('--runs=')) a.runs = +tok.slice(7);
    else if (tok.startsWith('--modes=')) a.modes = tok.slice(8).split(',').filter(Boolean);
    else if (tok.startsWith('--heats=')) a.heats = tok.slice(8).split(',').map(Number).filter((n) => !Number.isNaN(n));
    else if (tok.startsWith('--url=')) a.url = tok.slice(6);
  }
  return a;
}
const ARGS = parseArgs(process.argv.slice(2));

function printGrid(cells) {
  const byMode = new Map();
  for (const c of cells) { if (!byMode.has(c.mode)) byMode.set(c.mode, []); byMode.get(c.mode).push(c); }
  const heats = [...new Set(cells.map((c) => c.heat))].sort((a, b) => a - b);
  const winnable = new Set(['arena', 'bossrush']);
  console.log('\n  win% / sov%  (NG+0)   ·  Heat →');
  const head = 'mode'.padEnd(11) + heats.map((h) => `H${h}`.padStart(9)).join('');
  console.log(head); console.log('─'.repeat(head.length));
  for (const [mode, arr] of byMode) {
    arr.sort((a, b) => a.heat - b.heat);
    const metric = (c) => (winnable.has(mode) ? `${c.winPct}` : `${c.sovPct}`);
    const row = mode.padEnd(11) + heats.map((h) => {
      const c = arr.find((x) => x.heat === h);
      return (c ? `${metric(c)}%(b${c.maxBoss})` : '—').padStart(9);
    }).join('');
    console.log(row);
  }
  console.log('\n(winnable modes show win%; survival modes show Sovereign-down%. bN = best bosses reached.)');
}

// run one tab: load the bot, wait for threatFns, sweep this tab's modes via __bigSweep
async function sweepInTab(page, url, modes, heats, runs) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page.evaluate(async ({ modes, heats, runs }) => {
    for (let i = 0; i < 200 && !window.__lf; i++) await new Promise((r) => setTimeout(r, 25));
    if (!window.__lf) throw new Error('window.__lf never appeared');
    await import('/tools/balance-bot.js?v=' + Date.now());
    for (let i = 0; i < 120 && !(window.__botState && window.__botState.threatFns); i++) await new Promise((r) => setTimeout(r, 25));
    return await window.__bigSweep({ modes, heats, runs });
  }, { modes, heats, runs });
}

async function main() {
  const t0 = Date.now();
  const modeIds = (ARGS.modes && ARGS.modes.length ? ARGS.modes : DEFAULT_MODES);
  const heats = ARGS.heats && ARGS.heats.length ? ARGS.heats : DEFAULT_HEATS;
  const tabs = ARGS.tabs || Math.max(1, Math.min(modeIds.length, os.cpus().length - 1, 8));

  // self-contained dev server with HMR OFF (churn-immune for the run)
  let server = null, url = ARGS.url;
  if (!url) {
    server = await createServer({ root: ROOT, logLevel: 'silent', server: { hmr: false, host: '127.0.0.1' }, optimizeDeps: { noDiscovery: true } });
    await server.listen();
    url = (server.resolvedUrls?.local?.[0]) || `http://127.0.0.1:${server.config.server.port}`;
  }
  console.error(`LANCEFALL tabs sweep — ${modeIds.length} modes × ${heats.length} Heats × ${ARGS.runs} runs across ${tabs} tabs @ ${url}…`);

  const browser = await chromium.launch({ headless: true });
  try {
    // split modes round-robin across tabs (each tab sweeps whole modes → clean __bigSweep calls)
    const groups = Array.from({ length: tabs }, () => []);
    modeIds.forEach((m, i) => groups[i % tabs].push(m));
    const live = groups.filter((g) => g.length);

    const results = await Promise.all(live.map(async (modes) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try { return await sweepInTab(page, url, modes, heats, ARGS.runs); }
      finally { await ctx.close(); }
    }));

    const all = results.flat().sort((a, b) => a.mode.localeCompare(b.mode) || a.heat - b.heat);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (ARGS.json) process.stdout.write(JSON.stringify(all, null, 2) + '\n');
    else { printGrid(all); console.error(`\n${all.length * ARGS.runs} runs in ${secs}s (${live.length} tabs).`); }
  } finally {
    await browser.close();
    if (server) await server.close();
  }
}

main().catch((e) => { console.error(e?.stack || e); process.exit(1); });
