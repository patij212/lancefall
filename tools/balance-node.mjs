// LANCEFALL — HEADLESS BALANCE HARNESS for Node (no browser, all cores).
//
//   node tools/balance-node.mjs                         → full mode×Heat grid, NG+0
//   node tools/balance-node.mjs --modes=arena,bossrush  → just these modes
//   node tools/balance-node.mjs --heats=0,3,7 --runs=20 → pick Heats + sample size
//   node tools/balance-node.mjs --workers=4 --json       → cap parallelism, emit JSON
//
// WHY: the browser/Playwright harness uses one core, pays a round-trip per batch, and gets
// its page reloaded out from under it whenever a teammate edits the tree. This runs the SAME
// autopilot brain (tools/bot-core.mjs) against the SAME sim, but headless in Node and fanned
// across child processes — ~15–40× faster and immune to dev-server churn.
//
// HOW: Vite's `ssrLoadModule` loads the real `.ts` sim into Node (full vite resolution); a
// thin DOM/canvas/audio stub layer satisfies the Game constructor (render/HUD are no-op'd, so
// the drawing APIs are never actually called). An orchestrator process enumerates every
// (mode, Heat) cell and splits them round-robin across N worker processes.

import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ───────────────────────────── arg parsing ─────────────────────────────
function parseArgs(argv) {
  const a = { worker: false, index: 0, workers: 0, runs: 10, json: false, modes: null, heats: null };
  for (const tok of argv) {
    if (tok === '--worker') a.worker = true;
    else if (tok === '--json') a.json = true;
    else if (tok.startsWith('--index=')) a.index = +tok.slice(8);
    else if (tok.startsWith('--workers=')) a.workers = +tok.slice(10);
    else if (tok.startsWith('--runs=')) a.runs = +tok.slice(7);
    else if (tok.startsWith('--modes=')) a.modes = tok.slice(8).split(',').filter(Boolean);
    else if (tok.startsWith('--heats=')) a.heats = tok.slice(8).split(',').map(Number).filter((n) => !Number.isNaN(n));
    else if (tok.startsWith('--cap=')) a.cap = +tok.slice(6);
    else if (tok.startsWith('--bot=')) a.bot = tok.slice(6);     // A/B a variant brain (default: ./bot-core.mjs)
    else if (tok.startsWith('--root=')) a.root = tok.slice(7);   // run against a FROZEN src snapshot (immune to churn)
  }
  // normalize numerics so a fractional/negative flag can't silently corrupt the round-robin
  // split (i % 1.5 drops cells; i % 0 is NaN). 0 workers stays "auto" (the orchestrator picks).
  a.workers = a.workers > 0 ? Math.max(1, Math.floor(a.workers)) : 0;
  a.index = Math.max(0, Math.floor(a.index) || 0);
  a.runs = Math.max(1, Math.floor(a.runs) || 1);
  return a;
}
const ARGS = parseArgs(process.argv.slice(2));
const ROOT = ARGS.root ? path.resolve(ARGS.root) : path.resolve(__dirname, '..'); // vite project root
const BOT_URL = ARGS.bot ? pathToFileURL(path.resolve(ARGS.bot)).href : new URL('./bot-core.mjs', import.meta.url).href;

// adaptive cap: winnable modes need the full gauntlet; survival modes get less, and less
// again at high Heat (the bot dies in ~100–200 s there, so a big cap is wasted).
function capFor(mode, heat) {
  if (ARGS.cap) return ARGS.cap;
  if (mode.arena || mode.bossrush) return 42000;
  // CASUAL is the eased mode — the bot survives but clears slowly, so downing the Sovereign
  // takes ~840 s (≈50k frames). Give it a fat cap (less at high Heat, where it dies faster)
  // so its Sovereign-down rate is real instead of an artifact of too-short a cap.
  if (mode.id === 'casual') return heat >= 5 ? 32000 : 58000;
  // SOLSTICE — the bot survives the full 6-boss cipher gauntlet and reaches the Sovereign LATE
  // (~560–800 s, after decoding 5 locks), then kills it in ~15–25 s. A 34k (~567 s) survival cap
  // sliced those real kills off (Sov-down read 0–8 % when it's actually ~40–60 %). Give it room.
  if (mode.id === 'longestday') return heat >= 5 ? 34000 : 52000;
  return heat >= 5 ? 16000 : heat >= 3 ? 26000 : 34000;
}

// ───────────────────────────── DOM / canvas / audio stubs ─────────────────────────────
// A no-op 2D context: every method returns the stub (chaining-safe), every property read a
// callable, every set ignored. render() is no-op'd so these are never really exercised — the
// stub only has to keep the Renderer *constructor* (which just grabs + stores contexts) happy.
function makeCtx2D() {
  const stub = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'canvas') return { width: 1280, height: 720 };
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => stub;
      return () => stub;
    },
    set() { return true; },
    apply() { return stub; },
  });
  return stub;
}
function makeAudioStub() {
  const node = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'connect' || prop === 'disconnect' || prop === 'start' || prop === 'stop') return () => node;
      if (prop === 'gain' || prop === 'frequency' || prop === 'detune' || prop === 'Q' || prop === 'pan') return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} };
      return () => node;
    },
    set() { return true; },
    apply() { return node; },
  });
  class StubAudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 48000; this.destination = node; }
    createGain() { return node; } createOscillator() { return node; } createBiquadFilter() { return node; }
    createDelay() { return node; } createWaveShaper() { return node; } createDynamicsCompressor() { return node; }
    createBuffer() { return node; } createBufferSource() { return node; } createStereoPanner() { return node; }
    createConvolver() { return node; } createAnalyser() { return node; } createConstantSource() { return node; }
    decodeAudioData() { return Promise.resolve(node); } resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); }
  }
  return StubAudioContext;
}

async function installDom() {
  const { Window } = await import('happy-dom');
  const win = new Window({ url: 'http://localhost/', width: 1280, height: 720 });
  const g = globalThis;
  // some globals (navigator, location) are getter-only in modern Node — defineProperty over them
  const set = (name, value) => {
    try { g[name] = value; if (g[name] === value) return; } catch { /* read-only — fall through */ }
    try { Object.defineProperty(g, name, { value, configurable: true, writable: true }); } catch { /* leave as-is */ }
  };
  set('window', win);
  set('document', win.document);
  set('navigator', win.navigator);
  set('location', win.location);
  set('localStorage', win.localStorage);
  set('sessionStorage', win.sessionStorage);
  set('HTMLElement', win.HTMLElement);
  set('HTMLCanvasElement', win.HTMLCanvasElement);
  set('Element', win.Element);
  set('Node', win.Node);
  set('CustomEvent', win.CustomEvent);
  set('getComputedStyle', win.getComputedStyle?.bind(win) || (() => ({ getPropertyValue: () => '' })));
  const mm = (q) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
  set('matchMedia', mm);
  try { win.matchMedia = mm; } catch { /* ignore */ }
  set('requestAnimationFrame', () => 0);
  set('cancelAnimationFrame', () => {});
  set('devicePixelRatio', 1);
  set('AudioContext', makeAudioStub());
  set('webkitAudioContext', g.AudioContext);
  set('fetch', async () => new Response('{"entries":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
  // canvas 2D context — happy-dom returns null; force our no-op stub
  win.HTMLCanvasElement.prototype.getContext = () => makeCtx2D();
  return win;
}

// ───────────────────────────── worker: run assigned cells ─────────────────────────────
async function runWorker() {
  const win = await installDom();
  const server = await createServer({
    root: ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
  });
  try {
    const [gameMod, modesMod, bossMod, svMod, tuneMod] = await Promise.all([
      server.ssrLoadModule('/src/game.ts'),
      server.ssrLoadModule('/src/modes.ts'),
      server.ssrLoadModule('/src/boss.ts'),
      server.ssrLoadModule('/src/sovereign.ts'),
      server.ssrLoadModule('/src/tune.ts'),
    ]);
    const Game = gameMod.Game;
    const MODES = modesMod.MODES;

    // boot a headless Game
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const uiRoot = document.createElement('div');
    document.body.appendChild(canvas); document.body.appendChild(uiRoot);
    const game = new Game(canvas, uiRoot);
    game.boot();
    game.renderer.render = () => {};
    game.ui.updateHud = () => {};
    if (game.save) game.save.seenSandbox = true; // skip the first-run onboarding handoff
    let lastWon = false;
    const origFGO = game.finishGameOver.bind(game);
    game.finishGameOver = (won) => { lastWon = !!won; return origFGO(won); };

    const { createBot } = await import(BOT_URL); // the brain — default ./bot-core.mjs, or a --bot variant
    const bot = createBot();
    bot.threatFns = {
      beaconBeamActive: bossMod.beaconBeamActive,
      beaconEnraged: bossMod.beaconEnraged,
      sovereignBeamActive: svMod.sovereignBeamActive,
      beamHitsPoint: svMod.beamHitsPoint,
      sovereignBodyArmored: svMod.sovereignBodyArmored,
      mirrorbladeStaggerable: bossMod.mirrorbladeStaggerable,
      BEACON: tuneMod.BEACON, SOVEREIGN: tuneMod.SOVEREIGN, PARRY: tuneMod.PARRY,
    };
    game.input.poll = () => bot.decide(game);

    const runOne = (mode, cap, heat, earlyOnSov) => {
      game.save.ngPlusLevel = 0; game.save.ngPlusActive = false; game.save.selectedHeat = heat;
      bot.reset(); lastWon = false;
      game.start(mode);
      let t = performance.now(); game.lastTime = t; game.accumulator = 0; let steps = 0;
      while (game.state !== 'gameover' && steps < cap) {
        t += 16.667; game.frame(t); steps++;
        if (earlyOnSov && game.world.sovereignDown) break;
      }
      const w = game.world;
      return { won: lastWon, sov: !!w.sovereignDown, bossKills: w.bossKills ?? 0, time: +w.time.toFixed(1), stall: steps >= cap && game.state !== 'gameover' };
    };

    const cells = enumerateCells(MODES, ARGS);
    // guard the round-robin split — a bad workers/index (e.g. running --worker directly without
    // --workers) would silently drop or duplicate cells via a NaN/fractional modulo.
    if (!Number.isInteger(ARGS.workers) || ARGS.workers < 1 || ARGS.index < 0 || ARGS.index >= ARGS.workers) {
      throw new Error(`invalid worker split: --workers=${ARGS.workers} --index=${ARGS.index} (need integer workers≥1 and 0≤index<workers)`);
    }
    const mine = cells.filter((_, i) => i % ARGS.workers === ARGS.index);
    const out = [];
    for (const { id, heat } of mine) {
      const mode = MODES.find((m) => m.id === id) || MODES[0];
      const winnable = mode.arena || mode.bossrush;
      const rows = [];
      for (let r = 0; r < ARGS.runs; r++) rows.push(runOne(mode, capFor(mode, heat), heat, !winnable));
      out.push(summarize(id, heat, rows));
    }
    // Deliver the result, then HARD-EXIT. The vite SSR server + the Game's happy-dom timers
    // leave handles open that keep the process alive — `await server.close()` can itself HANG
    // (it did: stranded the orchestrator's Promise.all for hours). The parent only needs the
    // LFRESULT line, so flush it and exit; the OS reclaims everything. Fire close best-effort,
    // never await it.
    server.close().catch(() => {});
    process.stdout.write('LFRESULT:' + JSON.stringify(out) + '\n', () => process.exit(0));
  } catch (e) {
    console.error(e && e.stack ? e.stack : String(e));
    server.close().catch(() => {});
    process.exit(1);
  }
}

// ───────────────────────────── shared helpers ─────────────────────────────
const DEFAULT_MODES = ['endless', 'arena', 'daily', 'weekly', 'nightmare', 'bossrush', 'longestday', 'casual'];
const DEFAULT_HEATS = [0, 1, 2, 3, 4, 5, 6, 7];
function enumerateCells(MODES, args) {
  const modeIds = (args.modes && args.modes.length ? args.modes : DEFAULT_MODES).filter((id) => MODES.some((m) => m.id === id));
  const heats = args.heats && args.heats.length ? args.heats : DEFAULT_HEATS;
  const cells = [];
  for (const id of modeIds) for (const heat of heats) cells.push({ id, heat });
  return cells;
}
const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
function summarize(id, heat, rows) {
  const n = rows.length || 1;
  return {
    mode: id, heat,
    winPct: Math.round(100 * rows.filter((r) => r.won).length / n),
    sovPct: Math.round(100 * rows.filter((r) => r.sov).length / n),
    medBoss: med(rows.map((r) => r.bossKills)), maxBoss: Math.max(0, ...rows.map((r) => r.bossKills)),
    medTime: med(rows.map((r) => r.time)),
    stallPct: Math.round(100 * rows.filter((r) => r.stall).length / n),
  };
}

// ───────────────────────────── orchestrator: fan out + aggregate ─────────────────────────────
// Track every spawned child so one worker's crash (→ Promise.all rejection → process.exit)
// can't strand its siblings as orphans pegging a core each. process.exit does NOT cascade-kill
// children on Windows, so we tear them down explicitly on failure and on SIGINT/exit.
const children = new Set();
function killAllChildren() { for (const c of children) { try { c.kill('SIGKILL'); } catch { /* already gone */ } } }
process.once('SIGINT', () => { killAllChildren(); process.exit(130); });
process.once('exit', killAllChildren);

function spawnWorker(index, workers) {
  return new Promise((resolve, reject) => {
    const argv = [fileURLToPath(import.meta.url), '--worker', `--index=${index}`, `--workers=${workers}`, `--runs=${ARGS.runs}`];
    if (ARGS.modes) argv.push(`--modes=${ARGS.modes.join(',')}`);
    if (ARGS.heats) argv.push(`--heats=${ARGS.heats.join(',')}`);
    if (ARGS.cap) argv.push(`--cap=${ARGS.cap}`);
    if (ARGS.bot) argv.push(`--bot=${ARGS.bot}`);
    if (ARGS.root) argv.push(`--root=${ARGS.root}`);
    const child = spawn(process.execPath, argv, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    children.add(child);
    // backstop: a worker that never delivers (a future close/exit hang) must not strand the
    // grid forever. 30 min is far beyond any legitimate cell batch.
    const killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } reject(new Error(`worker ${index} timed out (>30 min)`)); }, 30 * 60 * 1000);
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; });
    child.on('error', (e) => { clearTimeout(killTimer); children.delete(child); reject(e); });
    child.on('close', (code) => {
      clearTimeout(killTimer); children.delete(child);
      if (code !== 0) return reject(new Error(`worker ${index} exited ${code}`));
      const line = buf.split('\n').find((l) => l.startsWith('LFRESULT:'));
      if (!line) return reject(new Error(`worker ${index} produced no result`));
      try { resolve(JSON.parse(line.slice('LFRESULT:'.length))); }
      catch (e) { reject(e); }
    });
  });
}

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

async function runOrchestrator() {
  const t0 = Date.now();
  // enumerate cells from args/defaults WITHOUT booting vite here — the workers validate
  // against the real MODES list, so we don't pay a redundant ~14 s SSR load up front.
  const modeIds = (ARGS.modes && ARGS.modes.length ? ARGS.modes : DEFAULT_MODES);
  const heats = ARGS.heats && ARGS.heats.length ? ARGS.heats : DEFAULT_HEATS;
  const cellCount = modeIds.length * heats.length;
  // never spawn more workers than there are cells — an extra worker just pays a ~14 s vite
  // boot to filter to zero cells and exit.
  const auto = Math.max(1, Math.min(os.cpus().length - 1, 12));
  const workers = Math.max(1, Math.min(ARGS.workers || auto, cellCount || 1));
  console.error(`LANCEFALL headless sweep — ${cellCount} cells × ${ARGS.runs} runs across ${workers} workers…`);
  const results = await Promise.all(Array.from({ length: workers }, (_, i) => spawnWorker(i, workers)));
  const all = results.flat().sort((a, b) => a.mode.localeCompare(b.mode) || a.heat - b.heat);
  if (!all.length) {
    console.error(`⚠ no valid (mode, Heat) cells matched — requested modes: ${modeIds.join(', ')}\n  (check for typos; valid modes: ${DEFAULT_MODES.join(', ')})`);
    process.exit(2);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (ARGS.json) { process.stdout.write(JSON.stringify(all, null, 2) + '\n'); }
  else { printGrid(all); console.error(`\n${all.length * ARGS.runs} runs in ${secs}s (${workers} workers).`); }
}

// ───────────────────────────── entry ─────────────────────────────
(ARGS.worker ? runWorker() : runOrchestrator()).catch((e) => {
  console.error(ARGS.worker ? `[worker ${ARGS.index}] ${e?.stack || e}` : e?.stack || e);
  process.exit(1);
});
