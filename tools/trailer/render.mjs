// LANCEFALL trailer — DETERMINISTIC frame renderer (buttery-smooth capture).
//
// Instead of real-time screen-recording (which samples frames irregularly under load → judder),
// we drive the game's fixed-timestep loop ourselves: stub requestAnimationFrame, then call
// lf.frame(t) with synthetic timestamps (t += 1000/60) and screenshot each rendered frame. Every
// frame is therefore EXACTLY 1/60 s of sim apart — no dropped/duplicated frames, no jitter.
//
//   npm run dev                                   # bot + __lf need the dev build
//   node tools/trailer/render.mjs cipher          # one beat
//   node tools/trailer/render.mjs                 # all gameplay beats
//
// Output: tools/trailer/mp4/<beat>.mp4  (true CFR 60fps), fed to edit.mjs.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FRAMES = path.join(__dirname, 'frames2');
const MP4 = path.join(__dirname, 'mp4');
fs.mkdirSync(MP4, { recursive: true });

// URL is resolved at runtime: a self-contained Vite server with HMR OFF (so editing the tree mid
// render can't reload the page → "execution context destroyed by navigation"). LIVE_URL overrides.
let URL = process.env.LIVE_URL || null;
const FPS = 60;
const SW = 1280, SH = 720;
const ONLY = new Set(process.argv.slice(2));
const want = (k) => ONLY.size === 0 || ONLY.has(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[render]', ...a);

// ── in-page helpers (stringified) ─────────────────────────────────────────────
const SEED_SAVE = async () => {
  const g = window.__lf;
  try { const m = await import('/src/ships.ts'); const S = m.SHIPS || m.default; if (S) g.save.unlockedShips = Object.keys(S); } catch {}
  Object.assign(g.save, {
    seenSandbox: true, seenTutorial: true, seenIntro: true,
    highScore: 184260, bestCombo: 52, bestWave: 15, deepestWave: 60,
    shards: 6400, maxHeat: 7, playStreak: 6, selectedHeat: 0, ngPlusLevel: 0, ngPlusActive: false,
  });
  try { g.ui.refreshTitle(g.save); } catch {}
};
const QUIET_ALL = () => {
  const g = window.__lf; const noop = () => {};
  for (const k of ['teach', 'teachOnce', 'narrate', 'narrateOne']) if (typeof g[k] === 'function') g[k] = noop;
  if (g.ui) for (const k of ['toast', 'announce', 'gloss']) if (typeof g.ui[k] === 'function') g.ui[k] = noop;
};
const COH_FORCE = () => {
  const r = window.__lf.renderer;
  if (r && r.setCoherence && !r.__cf) { const o = r.setCoherence.bind(r); r.setCoherence = (c, ...a) => o(Math.max(c, 0.97), ...a); r.__cf = true; }
};
// fire DAYBREAK once, after `delay` polls (so there's a lead-in)
const FORCE_DAYBREAK = (delay) => {
  const g = window.__lf; const bp = g.input.poll; let n = 0, fired = 0;
  g.input.poll = () => { const s = bp(); const w = g.world; n++; if (n > delay && fired < 1 && w.overdrive && w.overdrive.meter >= 1) { s.overdrivePressed = true; fired++; } return s; };
};
// PIN time-scale to 1 — kill hitstop / slow-mo so every captured frame advances exactly one
// fixed sim step. Without this the scheduler's juice (freeze-on-kill, overdrive/victory slow-mo)
// modulates simDt and the constant-rate capture reads as the speed lurching / accelerating.
const STEADY = () => {
  const s = window.__lf.scheduler;
  if (s) { s.requestHitstop = () => {}; s.requestSlowmo = () => {}; s.timeScale = 1; s.update = (dt) => { s.timeScale = 1; return dt; }; }
};
// paced cipher solver: dash the core whose .phase === order[progress]; one deliberate wrong dash first
const CIPHER_PILOT = () => {
  const g = window.__lf;
  const st = { prevHeld: false, didWrong: false, wrongHeld: false, cd: 24, lastProgress: 0 };
  const cf = (len) => { const y = Math.max(0, Math.min(1, (len - 180) / 380)); return Math.max(0, Math.min(1, 1 - Math.sqrt(1 - y))); };
  g.input.poll = function () {
    const s = g.input.state;
    s.pausePressed = s.overdrivePressed = s.parryPressed = false; s.selectIndex = -1; s.dashTapped = false;
    const idle = () => { s.moveX = 0; s.moveY = 0; s.dashHeld = false; s.dashReleased = st.prevHeld; st.prevHeld = false; return s; };
    if (g.state !== 'playing') return idle();
    const w = g.world, p = w.player, c = w.cipher;
    if (!c || c.solved) return idle();
    if (c.wrongFlash > 0.5 && !st.wrongHeld) { st.didWrong = true; st.wrongHeld = true; st.cd = Math.max(st.cd, 52); }
    if (c.wrongFlash <= 0.5) st.wrongHeld = false;
    if (c.progress !== st.lastProgress) { st.lastProgress = c.progress; st.cd = Math.max(st.cd, 46); }
    if (p.phase === 'dashing') return idle();
    const cores = w.enemies.items.filter((e) => e.active && e.kind === 'sovereign_core');
    if (!cores.length) return idle();
    const slot = (!st.didWrong && c.progress === 0 && c.order.length > 1) ? c.order[1] : c.order[c.progress];
    const target = cores.find((e) => e.phase === slot) || cores[0];
    s.aimX = target.x; s.aimY = target.y;
    if (st.cd > 0) { st.cd--; s.moveX = 0; s.moveY = 0; s.dashHeld = false; s.dashReleased = st.prevHeld; st.prevHeld = false; return s; }
    const dist = Math.hypot(target.x - p.x, target.y - p.y);
    const held = p.phase === 'charging' ? p.charge < cf(Math.min(560, dist + 90)) * 0.98 : true;
    s.moveX = 0; s.moveY = 0; s.dashHeld = held; s.dashReleased = st.prevHeld && !held; st.prevHeld = held;
    return s;
  };
};

async function boot(ctx) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('PAGEERR', e.message.slice(0, 100)));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => !!window.__lf, null, { timeout: 120000 }); // cold HMR-off server compiles on first load
  await page.addStyleTag({ content: '.hud-gloss{display:none!important}' });
  await page.evaluate(SEED_SAVE);
  await sleep(2400);
  return page;
}

async function injectBot(page) {
  await page.evaluate(() => import('/tools/balance-bot.js?v=' + Date.now()));
  await page.waitForFunction(() => !!(window.__botState && window.__botState.threatFns), null, { timeout: 8000 }).catch(() => {});
}

async function startRun(page, modeId, withBot) {
  await page.evaluate(async (id) => { const g = window.__lf; const { MODES } = await import('/src/modes.ts'); g.start(MODES.find((m) => m.id === id) || MODES[0]); }, modeId);
  await page.evaluate(`(${(() => { const g = window.__lf; const n = () => {}; for (const k of ['teach', 'teachOnce']) if (typeof g[k] === 'function') g[k] = n; }).toString()})()`);
  if (withBot) { await injectBot(page); await sleep(700); }
}

// the deterministic render loop
async function renderBeat(name, frameCount, setup, opts = {}) {
  const dir = path.join(FRAMES, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: SW, height: SH }, deviceScaleFactor: 1 });
  const page = await boot(ctx);
  await setup(page);
  await page.evaluate(`(${STEADY.toString()})()`); // uniform speed: pin timeScale=1 (no hitstop/slow-mo)
  // bulletproof god: the run must NEVER end mid-capture. Per-frame iframe/alive isn't enough when a
  // boss beam + game-over resolve inside one step, so also neuter finishGameOver (blocks both death
  // AND the Sovereign-kill win screen → continuous gameplay only).
  if (opts.god) await page.evaluate(() => { const g = window.__lf; g.finishGameOver = () => {}; });
  // take over the loop (stub rAF) before any manual driving
  await page.evaluate(() => { const g = window.__lf; g.__t = performance.now(); g.lastTime = g.__t; g.accumulator = 0; window.requestAnimationFrame = () => 0; });
  // optional warmup: fast-forward to MID/LATE game (render stubbed → fast; kept alive; resolves
  // drafts so the bot picks up perks + the waves get dense before we start capturing).
  if (opts.warmup) {
    await page.evaluate((sec) => {
      const g = window.__lf;
      const oR = g.renderer.render.bind(g.renderer), oH = g.ui.updateHud.bind(g.ui);
      g.renderer.render = () => {}; g.ui.updateHud = () => {};
      const steps = Math.round(sec * 60);
      for (let i = 0; i < steps; i++) {
        const w = g.world, p = w && w.player;
        if (p) { p.iframe = Math.max(p.iframe || 0, 60); p.alive = true; if (p.shields != null) p.shields = p.maxShields; }
        g.dying = false; g.winning = false;
        g.__t += 1000 / 60; g.frame(g.__t);
      }
      let guard = 0; // settle onto a clean PLAYING frame so capture opens on gameplay, not a modal
      while (g.state !== 'playing' && guard++ < 600) { g.__t += 1000 / 60; g.frame(g.__t); }
      g.renderer.render = oR; g.ui.updateHud = oH;
    }, opts.warmup);
  }
  const t0 = Date.now();
  for (let i = 0; i < frameCount; i++) {
    await page.evaluate((o) => {
      const g = window.__lf, w = g.world, p = w && w.player;
      if (o.god && p) { p.iframe = Math.max(p.iframe || 0, 60); p.alive = true; if (p.shields != null) p.shields = p.maxShields; g.dying = false; g.winning = false; }
      if (o.pin && w) for (const e of w.enemies.items) if (e.active && e.isBoss) { e.x = o.pin.x; e.y = o.pin.y; e.vx = 0; e.vy = 0; }
      g.__t += 1000 / 60;
      g.frame(g.__t);
    }, { god: !!opts.god, pin: opts.pin || null });
    await page.screenshot({ path: path.join(dir, `f_${String(i).padStart(5, '0')}.png`) });
  }
  await ctx.close();
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  // assemble CFR 60fps
  const out = path.join(MP4, name + '.mp4');
  execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i "${path.join(dir, 'f_%05d.png')}" -c:v libx264 -crf 17 -pix_fmt yuv420p -r ${FPS} "${out}"`, { stdio: ['ignore', 'pipe', 'pipe'] });
  log(`✓ ${name}: ${frameCount} frames in ${secs}s → ${out}`);
}

// ── beat directors (gameplay only; panels/title/cards are stills/art handled in edit) ──
const PIN = { x: Math.round(SW * 0.5), y: Math.round(SH * 0.42) };
const BEATS = {
  // combat verb — fast-forwarded to MID-GAME (dense waves, drafted perks) for the juiciest dashes
  combat: () => renderBeat('combat', Math.round(14 * FPS), async (page) => {
    await startRun(page, 'arena', true);
  }, { god: true, warmup: 22 }),

  // grey→neon coherence wash, mid-game (forced full neon; edit cuts from a grey shot)
  coherence: () => renderBeat('coherence', Math.round(12 * FPS), async (page) => {
    await startRun(page, 'arena', true);
    await page.evaluate(`(${COH_FORCE.toString()})()`);
  }, { god: true, warmup: 18 }),

  // HERO — Weaver substitution cipher: READ THE KEY decode under fire → CIPHER BROKEN
  cipher: () => renderBeat('cipher', Math.round(16 * FPS), async (page) => {
    await startRun(page, 'longestday', false);
    await page.evaluate(() => window.__lf.spawnWarden('weaver'));
    await page.evaluate(`(${QUIET_ALL.toString()})()`);
    await page.evaluate(`(${CIPHER_PILOT.toString()})()`);
  }, { god: true, pin: PIN }),

  // SOLSTICE PROTOCOL at its best — THE SOVEREIGN, the master (rotor) cipher (a glimpse of the big ring)
  sovereign: () => renderBeat('sovereign', Math.round(9 * FPS), async (page) => {
    await startRun(page, 'longestday', false);
    await page.evaluate(() => window.__lf.spawnWarden('sovereign'));
    await page.evaluate(`(${QUIET_ALL.toString()})()`);
    await page.evaluate(`(${CIPHER_PILOT.toString()})()`);
  }, { god: true, pin: PIN }),

  // BULLET-HELL boss — THE BEACON's rotating cross-beams, the bot threading them (a boss IS late-game;
  // no warmup — a boss present during the fast-forward navigates the page on the win/over path).
  bossfight: () => renderBeat('bossfight', Math.round(13 * FPS), async (page) => {
    await startRun(page, 'arena', true);
    await page.evaluate(() => window.__lf.spawnWarden('beacon'));
    await page.evaluate(`(${QUIET_ALL.toString()})()`);
  }, { god: true, pin: PIN }),

  // the Mirrorblade — the imitation game
  mirror: () => renderBeat('mirror', Math.round(9 * FPS), async (page) => {
    await startRun(page, 'endless', true);
    await page.evaluate(() => window.__lf.spawnWarden('mirrorblade'));
    await page.evaluate(`(${QUIET_ALL.toString()})()`);
  }, { god: true }),

  // DAYBREAK ultimate — the screen-clearing burst of light
  daybreak: () => renderBeat('daybreak', Math.round(8 * FPS), async (page) => {
    await startRun(page, 'arena', true);
    await page.evaluate(() => { const w = window.__lf.world; if (w.overdrive) { w.overdrive.meter = 1; w.overdrive.cooldown = 0; } });
    await page.evaluate(`(${FORCE_DAYBREAK.toString()})(90)`);
  }, { god: true }),
};

let browser, server;
(async () => {
  if (!URL) {
    server = await createServer({ root: ROOT, logLevel: 'silent', server: { hmr: false, host: '127.0.0.1' } });
    await server.listen();
    URL = server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${server.config.server.port}/`;
    log('vite (hmr off) @', URL);
  }
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--enable-gpu'] });
  try {
    for (const [k, fn] of Object.entries(BEATS)) { if (!want(k)) continue; log('▶', k); await fn(); }
  } finally {
    await browser.close();
    if (server) await server.close();
  }
  log('done.');
})();
