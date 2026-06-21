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
// Trigger the WIN cinematic after `delay` polls → FIRST LIGHT daybreak ramps grey→gold (flT over
// 0.8s) and HOLDS (we noop finishGameOver so it never cuts to the debrief). Captures the real wash.
const TRIGGER_FIRSTLIGHT = (delay) => {
  const g = window.__lf; const bp = g.input.poll; let n = 0;
  if (!g.__heldFGO) { g.__heldFGO = g.finishGameOver; g.finishGameOver = () => {}; } // hold the daybreak
  g.input.poll = () => { const s = bp(); n++; if (n === delay) { g.winning = true; g.winTimer = 2.4; } return s; };
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

// AGGRO pilot (FLOW): continuously dash THROUGH the nearest enemy, overshooting to spear clusters.
// Replaces the survival bot for the flow capture — god-mode makes the survival bot passive (no
// perceived threat), so we drive the offense ourselves; with a dense swarm it racks combo fast.
const AGGRO_PILOT = () => {
  const g = window.__lf; let prevHeld = false;
  const cf = (len) => { const y = Math.max(0, Math.min(1, (len - 180) / 380)); return Math.max(0, Math.min(1, 1 - Math.sqrt(1 - y))); };
  g.input.poll = function () {
    const s = g.input.state; s.pausePressed = s.overdrivePressed = s.parryPressed = false; s.selectIndex = -1; s.dashTapped = false;
    const p = g.world.player;
    const idle = () => { s.moveX = 0; s.moveY = 0; s.dashHeld = false; s.dashReleased = prevHeld; prevHeld = false; return s; };
    if (g.state !== 'playing' || !p || p.phase === 'dashing') return idle();
    let best = null, bd = 1e9;
    for (const e of g.world.enemies.items) { if (!e.active || e.isBoss) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
    if (!best) return idle();
    s.aimX = best.x; s.aimY = best.y; s.moveX = 0; s.moveY = 0;
    const held = p.phase === 'charging' ? p.charge < cf(Math.min(560, bd + 130)) * 0.9 : true;
    s.dashHeld = held; s.dashReleased = prevHeld && !held; prevHeld = held; return s;
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
  if (opts.afterWarmup) await opts.afterWarmup(page); // e.g. swap the survival bot for the aggro pilot
  const t0 = Date.now();
  for (let i = 0; i < frameCount; i++) {
    await page.evaluate((o) => {
      const g = window.__lf, w = g.world, p = w && w.player;
      if (o.god && p) { p.iframe = Math.max(p.iframe || 0, 60); p.alive = true; if (p.shields != null) p.shields = p.maxShields; g.dying = false; g.winning = false; }
      if (o.stamina && p) p.stamina = 300; // infinite dashes → the aggro pilot chains without recharge gaps
      // CALM the screen-shake so dense scenes stay readable (trauma model: cap intensity + trauma).
      if (o.calm && g.shake) { g.shake.intensity = 0.2; if (g.shake.trauma > 0.26) g.shake.trauma = 0.26; }
      // THIN bullet WALLS so the (god-mode) player isn't seen tanking a curtain of fire — keep just
      // enough for an "under fire" read. Deactivates the surplus past the cap each frame.
      if (o.thin && w && w.bullets) { let c = 0; for (const b of w.bullets.items) if (b.active) { if (++c > o.thin) b.active = false; } }
      if (o.comboHold && w && w.combo > 0) w.comboTimer = 10;
      if (o.noOverdrive && w && w.overdrive) w.overdrive.meter = 0;
      // FLOW: a clean DENSE swarm of VARIED melee kinds — clear all bullets + non-flow (bullet)
      // enemies each frame, maintain N marked melee chasers; the aggro pilot spears clusters non-stop.
      if (o.spawn && w && w.enemies && w.spawnEnemy) {
        if (w.bullets) for (const b of w.bullets.items) if (b.active) b.active = false;
        let n = 0; for (const e of w.enemies.items) { if (!e.active || e.isBoss) continue; if (!e.__flow) e.active = false; else n++; }
        const kinds = ['wisp', 'darter', 'splitter', 'shade', 'brooder', 'drifter', 'mini', 'wisp', 'darter'];
        while (n < 9) { const a = Math.random() * Math.PI * 2; const en = w.spawnEnemy(kinds[Math.floor(Math.random() * kinds.length)], w.width / 2 + Math.cos(a) * 380, w.height / 2 + Math.sin(a) * 250, 1, 1, false, false); if (en) { en.__flow = true; n++; } else break; }
      }
      // VARIETY: alongside the natural waves, keep a rotating mix of the WHOLE bestiary on screen so
      // the trailer shows more than darters — snipers, splitters, bombers, the gap-wall herald, the
      // homing seeker, bloomers… (the survival bot dodges + kills them; bullets are thinned above).
      if (o.variety && w && w.spawnEnemy) {
        let n = 0; for (const e of w.enemies.items) if (e.active && !e.isBoss) n++;
        if (n < 6) { const all = ['orbiter', 'splitter', 'bomber', 'lancer', 'shade', 'brooder', 'drifter', 'seeker', 'herald', 'bloomer', 'wisp', 'darter']; const a = Math.random() * Math.PI * 2; try { w.spawnEnemy(all[Math.floor(Math.random() * all.length)], w.width / 2 + Math.cos(a) * 430, w.height / 2 + Math.sin(a) * 290, 1, 1, false, false); } catch {} }
      }
      if (o.pin && w) for (const e of w.enemies.items) if (e.active && e.isBoss) { e.x = o.pin.x; e.y = o.pin.y; e.vx = 0; e.vy = 0; }
      g.__t += 1000 / 60;
      g.frame(g.__t);
    }, { god: !!opts.god, pin: opts.pin || null, stamina: !!opts.stamina, comboHold: !!opts.comboHold, spawn: !!opts.spawn, noOverdrive: !!opts.noOverdrive, calm: !!opts.calm, thin: opts.thin || 0, variety: !!opts.variety });
    await page.screenshot({ path: path.join(dir, `f_${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
  }
  await ctx.close();
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  // assemble CFR 60fps (jpeg frames encode far faster to write than png; the x264 pass dominates quality)
  const out = path.join(MP4, name + '.mp4');
  execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i "${path.join(dir, 'f_%05d.jpg')}" -c:v libx264 -crf 17 -pix_fmt yuv420p -r ${FPS} "${out}"`, { stdio: ['ignore', 'pipe', 'pipe'] });
  log(`✓ ${name}: ${frameCount} frames in ${secs}s → ${out}`);
}

// ── beat directors (gameplay only; panels/title/cards are stills/art handled in edit) ──
const PIN = { x: Math.round(SW * 0.5), y: Math.round(SH * 0.42) };
const BEATS = {
  // NOTE: NO god-mode anywhere in capture — real bullets, real damage, the bot dodges for real.
  // The only capture aids are honest ones: calm shake (readability), enemy variety, a framing pin,
  // and the COHERENCE/DAYBREAK render dials. The warmup fast-forwards to mid-game off-screen (kept
  // alive there only so the run REACHES mid-game); the captured frames are genuine play.

  // combat — REAL play: mid-game arena with a rotating VARIETY of the bestiary; the survival bot
  // dodges real fire + kills. Capture long; the edit curates an alive, high-action stretch.
  combat: () => renderBeat('combat', Math.round(16 * FPS), async (page) => {
    await startRun(page, 'arena', true);
  }, { warmup: 16, calm: true, variety: true }),

  // FLOW — real synergy of movement: the survival bot weaving a dense varied wave, dashing/grazing/
  // chaining a REAL combo. Endless, for a different look than the arena combat beat.
  flow: () => renderBeat('flow', Math.round(24 * FPS), async (page) => {
    await startRun(page, 'endless', true);
  }, { warmup: 16, calm: true, variety: true }),

  // grey→neon coherence wash — real play; the neon is a render dial (COH_FORCE), not a difficulty cheat.
  coherence: () => renderBeat('coherence', Math.round(12 * FPS), async (page) => {
    await startRun(page, 'arena', true);
    await page.evaluate(`(${COH_FORCE.toString()})()`);
  }, { warmup: 16, calm: true, variety: true }),

  // HERO — Weaver substitution cipher: READ THE KEY decode under REAL fire → CIPHER BROKEN. The
  // REAL bot now solves cipher-locks itself (dashes the next-in-order core when safe) WHILE dodging
  // the spiral — no pilot, no god. Authentic decode-under-fire.
  cipher: () => renderBeat('cipher', Math.round(26 * FPS), async (page) => {
    await startRun(page, 'longestday', true);
    await page.evaluate(() => window.__lf.spawnWarden('weaver'));
    await page.evaluate(`(${QUIET_ALL.toString()})()`);
  }, { pin: PIN, calm: true }),

  // SOLSTICE PROTOCOL — THE SOVEREIGN, the master (rotor) cipher; the real bot decodes the big ring.
  sovereign: () => renderBeat('sovereign', Math.round(13 * FPS), async (page) => {
    await startRun(page, 'longestday', true);
    await page.evaluate(() => window.__lf.spawnWarden('sovereign'));
    await page.evaluate(`(${QUIET_ALL.toString()})()`);
  }, { pin: PIN, calm: true }),

  // BULLET-HELL boss — THE BEACON's rotating cross-beams, the survival bot threading them for real.
  bossfight: () => renderBeat('bossfight', Math.round(12 * FPS), async (page) => {
    await startRun(page, 'arena', true);
    await page.evaluate(() => window.__lf.spawnWarden('beacon'));
    await page.evaluate(`(${QUIET_ALL.toString()})()`);
  }, { pin: PIN, calm: true }),

  // the Mirrorblade — the imitation game (real duel)
  mirror: () => renderBeat('mirror', Math.round(10 * FPS), async (page) => {
    await startRun(page, 'endless', true);
    await page.evaluate(() => window.__lf.spawnWarden('mirrorblade'));
    await page.evaluate(`(${QUIET_ALL.toString()})()`);
  }, { calm: true, warmup: 6 }),

  // DAYBREAK ultimate — the real screen-clearing burst (the bot earns the meter + fires it)
  daybreak: () => renderBeat('daybreak', Math.round(9 * FPS), async (page) => {
    await startRun(page, 'arena', true);
    await page.evaluate(() => { const w = window.__lf.world; if (w.overdrive) { w.overdrive.meter = 1; w.overdrive.cooldown = 0; } });
    await page.evaluate(`(${FORCE_DAYBREAK.toString()})(90)`);
  }, { calm: true, warmup: 8 }),

  // THE WARDEN — the first boss: rotating fans + spiral volleys (a different lock than the beams/cipher)
  warden: () => renderBeat('warden', Math.round(11 * FPS), async (page) => {
    await startRun(page, 'arena', true);
    await page.evaluate(() => window.__lf.spawnWarden('warden'));
    await page.evaluate(`(${QUIET_ALL.toString()})()`);
  }, { pin: PIN, calm: true }),

  // THE HOLLOW — echo-hunt boss (spawns mirror echoes you must read); rounds out all 6 bosses shown
  hollow: () => renderBeat('hollow', Math.round(11 * FPS), async (page) => {
    await startRun(page, 'arena', true);
    await page.evaluate(() => window.__lf.spawnWarden('hollow'));
    await page.evaluate(`(${QUIET_ALL.toString()})()`);
  }, { pin: PIN, calm: true }),

  // FIRST LIGHT — the real win daybreak: live play, then the WIN floods the frame grey→gold and holds.
  // NO warmup: the warmup loop resets winning=false each frame, which would wipe the trigger. Wave-1
  // play is trivial so the bot survives the ~2.5s lead-in to the win on its own.
  firstlight: () => renderBeat('firstlight', Math.round(8 * FPS), async (page) => {
    await startRun(page, 'arena', true);
    await page.evaluate(`(${QUIET_ALL.toString()})()`);
    await page.evaluate(`(${TRIGGER_FIRSTLIGHT.toString()})(150)`); // ~2.5s of play, then the daybreak ramps + holds
  }, { calm: true }),
};

let browser, server;
(async () => {
  if (!URL) {
    server = await createServer({ root: ROOT, logLevel: 'silent', server: { hmr: false, host: '127.0.0.1' } });
    await server.listen();
    URL = server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${server.config.server.port}/`;
    log('vite (hmr off) @', URL);
  }
  const launchArgs = ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--enable-gpu'];
  try {
    for (const [k, fn] of Object.entries(BEATS)) {
      if (!want(k)) continue;
      log('▶', k);
      // FRESH browser per beat — chromium memory/contention accumulates across beats and the later
      // ones crawl (combat 2.7min → coherence 30min in one run); relaunching keeps every beat fast.
      browser = await chromium.launch({ args: launchArgs });
      try { await fn(); } finally { await browser.close(); browser = null; }
    }
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
  }
  log('done.');
})();
