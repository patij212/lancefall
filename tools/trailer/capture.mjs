// LANCEFALL trailer capture harness — drives the LIVE dev build (npm run dev) into each
// trailer beat and records a page-level video clip (canvas + DOM HUD + overlays) per beat.
//
//   npm run dev            # serve on :5197 (the bot + __lf need the dev build)
//   node tools/trailer/capture.mjs                 # all beats
//   node tools/trailer/capture.mjs cipher combat    # only those
//   SIZE=1920x1080 node tools/trailer/capture.mjs   # bigger capture
//
// Output: tools/trailer/clips/<beat>.webm  (fed to edit.sh)
//
// Why page-level recordVideo (not canvas.captureStream): the HUD, mode rail, perk draft,
// THE CHOICE and every panel are DOM OVERLAYS on top of the canvas — a canvas-only grab
// would miss them. recordVideo captures exactly what a screen-recording would.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CLIPS = path.join(__dirname, 'clips');
fs.mkdirSync(CLIPS, { recursive: true });

const URL = process.env.LIVE_URL || 'http://localhost:5197/';
const [SW, SH] = (process.env.SIZE || '1280x720').split('x').map(Number);
const ONLY = new Set(process.argv.slice(2));
const want = (k) => ONLY.size === 0 || ONLY.has(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[trailer]', ...a);

// The autopilot is loaded as a same-origin Vite module (it imports the shared ./bot-core.mjs
// brain), not injected as text — see injectBot().

// ── in-page helpers (stringified, injected) ─────────────────────────────────
// Seed a rich save so panels/showcase look unlocked + lived-in.
const SEED_SAVE = async () => {
  const g = window.__lf;
  if (!g) return 'no __lf';
  try {
    const m = await import('/src/ships.ts');
    const SHIPS = m.SHIPS || m.default;
    if (SHIPS) g.save.unlockedShips = Object.keys(SHIPS);
  } catch {}
  Object.assign(g.save, {
    seenSandbox: true, seenTutorial: true, seenIntro: true,
    highScore: 184260, bestCombo: 52, bestWave: 15, deepestWave: 60,
    shards: 6400, maxHeat: 7, playStreak: 6,
    // keep RUNS at base difficulty so the autopilot SURVIVES for the clip (HEAT 2 + NG+1 killed it at wave 1)
    selectedHeat: 0, ngPlusLevel: 0, ngPlusActive: false,
  });
  try { g.ui.refreshTitle(g.save); } catch {}
  return 'ok';
};

// Keep the player safe + the boss framed during a scripted capture (capture-only; never shipped).
const GOD_ON = (bossX, bossY) => {
  const g = window.__lf;
  window.__godT = setInterval(() => {
    const w = g.world, p = w && w.player;
    if (!p) return;
    p.iframe = Math.max(p.iframe || 0, 30);
    p.alive = true;
    if (p.shields != null) p.shields = p.maxShields || p.shields;
    if (bossX != null) {
      for (const e of w.enemies.items) {
        if (e.active && e.isBoss) { e.x = bossX; e.y = bossY; e.vx = 0; e.vy = 0; }
      }
    }
  }, 16);
};
const GOD_OFF = () => { clearInterval(window.__godT); };

// Force the COHERENCE wash to full neon (the survival bot ignores on-beat dashing, so the dial
// stays low). Clamps renderer.setCoherence's level high every frame. Capture-only.
const COH_FORCE = () => {
  const g = window.__lf;
  const r = g.renderer;
  if (r && r.setCoherence && !r.__cohForced) {
    const orig = r.setCoherence.bind(r);
    r.setCoherence = (c, ...rest) => orig(Math.max(c, 0.97), ...rest);
    r.__cohForced = true;
  }
};

// Wrap the bot's poll to FIRE DAYBREAK once the meter is ready (so the ultimate is on-camera).
const FORCE_DAYBREAK = () => {
  const g = window.__lf;
  const botPoll = g.input.poll;
  let fired = 0;
  g.input.poll = () => {
    const s = botPoll();
    const w = g.world;
    if (fired < 1 && w.overdrive && w.overdrive.meter >= 1 && (w.overdrive.cooldown || 0) <= 0) { s.overdrivePressed = true; fired++; }
    return s;
  };
};

// Silence the just-in-time TEACH boxes (the dark bottom toasts) — clutter for footage.
const QUIET_TEACH = () => {
  const g = window.__lf; const noop = () => {};
  for (const k of ['teach', 'teachOnce']) if (typeof g[k] === 'function') g[k] = noop;
};
// Stronger: also silence narrator + toast + announce (max clarity for the hero cipher shot).
const QUIET_ALL = () => {
  const g = window.__lf; const noop = () => {};
  for (const k of ['teach', 'teachOnce', 'narrate', 'narrateOne']) if (typeof g[k] === 'function') g[k] = noop;
  if (g.ui) for (const k of ['toast', 'announce', 'gloss']) if (typeof g.ui[k] === 'function') g.ui[k] = noop;
};

// The cipher pilot: read w.cipher.order/progress, dash the core whose .phase === order[progress].
// PACED — idles between dashes so each step (the READ THE KEY legend, the green core flip) reads.
// Does ONE deliberate wrong dash first (to show the forgiving fizzle), then solves in order.
const CIPHER_PILOT = () => {
  const g = window.__lf;
  const st = { prevHeld: false, didWrong: false, wrongHeld: false, cd: 50, lastProgress: 0 };
  window.__cipherPilot = st;
  const chargeForLen = (len) => {
    const y = Math.max(0, Math.min(1, (len - 180) / 380));
    return Math.max(0, Math.min(1, 1 - Math.sqrt(1 - y)));
  };
  g.input.poll = function () {
    const s = g.input.state;
    s.pausePressed = false; s.overdrivePressed = false; s.anyPressed = false;
    s.selectIndex = -1; s.parryPressed = false; s.dashTapped = false;
    const idle = () => { s.moveX = 0; s.moveY = 0; s.dashHeld = false; s.dashReleased = st.prevHeld; st.prevHeld = false; return s; };
    if (g.state !== 'playing') return idle();
    const w = g.world, p = w.player, c = w.cipher;
    if (!c || c.solved) return idle();
    // hold on a freshly-registered WRONG dash so the fizzle is visible
    if (c.wrongFlash > 0.5 && !st.wrongHeld) { st.didWrong = true; st.wrongHeld = true; st.cd = Math.max(st.cd, 80); }
    if (c.wrongFlash <= 0.5) st.wrongHeld = false;
    // pause after each CORRECT key so the green flip + the next legend letter land
    if (c.progress !== st.lastProgress) { st.lastProgress = c.progress; st.cd = Math.max(st.cd, 75); }
    if (p.phase === 'dashing') return idle();
    const cores = w.enemies.items.filter((e) => e.active && e.kind === 'sovereign_core');
    if (!cores.length) return idle();
    // pick the slot: one deliberate wrong (order[1] while we still owe order[0]), then correct
    const slot = (!st.didWrong && c.progress === 0 && c.order.length > 1) ? c.order[1] : c.order[c.progress];
    const target = cores.find((e) => e.phase === slot) || cores[0];
    s.aimX = target.x; s.aimY = target.y; // keep facing the target even while idling, so it reads as deliberate
    if (st.cd > 0) { st.cd--; s.moveX = 0; s.moveY = 0; s.dashHeld = false; s.dashReleased = st.prevHeld; st.prevHeld = false; return s; }
    const dist = Math.hypot(target.x - p.x, target.y - p.y);
    const charge = chargeForLen(Math.min(560, dist + 90));
    const held = p.phase === 'charging' ? p.charge < charge * 0.98 : true;
    s.moveX = 0; s.moveY = 0;
    s.dashHeld = held; s.dashReleased = st.prevHeld && !held; st.prevHeld = held;
    return s;
  };
};

// ── boot a fresh page into the cockpit ───────────────────────────────────────
async function boot(ctx) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('PAGEERR', e.message.slice(0, 120)));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__lf, null, { timeout: 30000 });
  // hide the first-appearance jargon "gloss" field-notes — intended in the real game,
  // but clutter for footage (capture-only; never shipped).
  await page.addStyleTag({ content: '.hud-gloss{display:none!important}' });
  await page.evaluate(SEED_SAVE);
  await sleep(2600); // cohRise + coherence-fill + boot-in settle
  return page;
}

// Load the autopilot as a same-origin Vite module (resolves its ./bot-core.mjs brain; CSP
// `script-src 'self'` allows a same-origin dynamic import). It installs lf.input.poll =
// () => bot.decide(lf) and sets window.__botState (with .threatFns once predicates load).
async function injectBot(page) {
  await page.evaluate(() => import('/tools/balance-bot.js?v=' + Date.now()));
  await page
    .waitForFunction(() => !!(window.__botState && window.__botState.threatFns), null, { timeout: 8000 })
    .catch(() => {});
}

// start a run in `modeId`, optionally inject the balance bot
async function startRun(page, modeId, withBot = true) {
  await page.evaluate(async (id) => {
    const g = window.__lf;
    const { MODES } = await import('/src/modes.ts');
    const m = MODES.find((x) => x.id === id) || MODES[0];
    g.start(m);
  }, modeId);
  await page.evaluate(`(${QUIET_TEACH.toString()})()`); // kill the bottom teach boxes everywhere
  await sleep(400);
  // inject the autopilot as a blob-URL ES MODULE. The dev CSP is `script-src 'self' blob:` —
  // so inline <script> is blocked, but a blob: module is allowed; and a MODULE supports the bot's
  // dynamic import('/src/boss.ts') (a plain string-eval throws "import outside a module").
  if (withBot) {
    await injectBot(page);
    await sleep(900); // let the bot's threatFns import resolve before play starts
  } else {
    await sleep(200);
  }
}

// record one beat into clips/<name>.webm
async function recordBeat(browser, name, durMs, drive) {
  const ctx = await browser.newContext({
    viewport: { width: SW, height: SH },
    deviceScaleFactor: 1,
    recordVideo: { dir: CLIPS, size: { width: SW, height: SH } },
  });
  const page = await boot(ctx);
  const video = page.video();
  const t0 = Date.now();
  try {
    await drive(page);
  } catch (e) {
    log('beat', name, 'drive error:', e.message.slice(0, 160));
  }
  const remain = durMs - (Date.now() - t0);
  if (remain > 0) await sleep(remain);
  await ctx.close();
  const raw = await video.path();
  const dest = path.join(CLIPS, name + '.webm');
  fs.rmSync(dest, { force: true });
  fs.renameSync(raw, dest);
  const kb = Math.round(fs.statSync(dest).size / 1024);
  log('✓', name, `${kb}KB`, `(${durMs}ms @ ${SW}x${SH})`);
}

// ── beats ────────────────────────────────────────────────────────────────────
const BEATS = {
  // 1 — title cockpit + THE FALL story card
  title: (b) => recordBeat(b, 'title', 11000, async (page) => {
    await sleep(2500); // hold on the live cockpit (animated cipher backdrop + SELECT MODE rail)
    await page.evaluate(() => window.__lf.ui.showFall && window.__lf.ui.showFall());
    await sleep(5000); // the story card
    await page.keyboard.press('Escape').catch(() => {});
  }),

  // 2 — first charge-dash through a cluster (combat verb)
  combat: (b) => recordBeat(b, 'combat', 20000, async (page) => {
    await startRun(page, 'arena', true);
    await sleep(18000); // let the bot dash + spear; we trim the cleanest stretch in edit
  }),

  // 3 — grey→neon COHERENCE wash. The survival bot won't dash on-beat, so force the dial to full
  //     neon a few seconds in (the edit cross-fades a grey combat shot INTO this lit one).
  coherence: (b) => recordBeat(b, 'coherence', 30000, async (page) => {
    await startRun(page, 'arena', true);
    await sleep(7000); // a beat of grey first
    await page.evaluate(`(${COH_FORCE.toString()})()`);
    await sleep(21000);
  }),

  // 4 — HERO: SOLSTICE PROTOCOL cipher-lock, read the key + decode under fire (with a fizzle)
  cipher: (b) => recordBeat(b, 'cipher', 22000, async (page) => {
    await startRun(page, 'longestday', false);
    await sleep(600);
    // arm the cipher boss (Weaver = full substitution — the clean READ THE KEY showcase)
    await page.evaluate(() => window.__lf.spawnWarden('weaver'));
    await page.evaluate(`(${QUIET_ALL.toString()})()`); // max clarity: no toasts/narrator on the hero shot
    // pin boss centre-stage + keep player safe, then run the paced cipher pilot
    await page.evaluate(`(${GOD_ON.toString()})(${Math.round(SW * 0.5)}, ${Math.round(SH * 0.42)})`);
    await page.evaluate(`(${CIPHER_PILOT.toString()})()`);
    await sleep(18500); // paced decode (~6s) + a hold on the cracked-open boss
    await page.evaluate(`(${GOD_OFF.toString()})()`);
  }),

  // 5a — modes rail (showcase, SOLSTICE PROTOCOL selected)
  modes: (b) => recordBeat(b, 'modes', 8000, async (page) => {
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.ck-mi, .mode-card')];
      const t = cards.find((c) => /SOLSTICE/i.test(c.textContent || ''));
      if (t) t.click();
    });
    await sleep(6000);
  }),

  // 5b — perk draft (real cards)
  draft: (b) => recordBeat(b, 'draft', 7000, async (page) => {
    await page.evaluate(async () => {
      const g = window.__lf;
      const [perks, evos] = await Promise.all([import('/src/perks.ts'), import('/src/evolutions.ts')]);
      const P = Object.values(perks.PERKS), E = Object.values(evos.EVOLUTIONS);
      g.ui.showDraft([P[0], P[3], E[0]].filter(Boolean));
    });
    await sleep(5500);
  }),

  // 5c — HEAT ladder
  heat: (b) => recordBeat(b, 'heat', 6500, async (page) => {
    await page.evaluate(() => window.__lf.ui.openHeat && window.__lf.ui.openHeat());
    await sleep(5000);
  }),

  // 5d — CODEX / bestiary
  codex: (b) => recordBeat(b, 'codex', 7000, async (page) => {
    await page.evaluate(() => window.__lf.ui.showCodex && window.__lf.ui.showCodex());
    await sleep(5500);
  }),

  // 5e — the Mirrorblade (imitation game) — force-spawn + bot
  mirror: (b) => recordBeat(b, 'mirror', 14000, async (page) => {
    await startRun(page, 'endless', true);
    await sleep(800);
    await page.evaluate(() => window.__lf.spawnWarden('mirrorblade'));
    await sleep(12000);
  }),

  // 6 — DAYBREAK ultimate (the screen-clearing burst of light)
  daybreak: (b) => recordBeat(b, 'daybreak', 16000, async (page) => {
    await startRun(page, 'arena', true);
    await sleep(5000);
    await page.evaluate(`(${FORCE_DAYBREAK.toString()})()`); // make the bot fire it when ready
    // top up the overdrive meter so DAYBREAK is guaranteed on-camera
    await page.evaluate(() => { const w = window.__lf.world; if (w.overdrive) { w.overdrive.meter = 1; w.overdrive.cooldown = 0; } });
    await sleep(9000);
  }),

  // 7 — THE CHOICE (halting problem) → resolved
  choice: (b) => recordBeat(b, 'choice', 13000, async (page) => {
    await page.evaluate(() => {
      const g = window.__lf;
      // full payload (mirrors tools/ui-capture goBase) so showGameOver doesn't throw on a missing field
      g.ui.showGameOver({
        score: 184260, combo: 52, wave: 15, time: 720, newBest: true, daily: false,
        highScore: 162000, shardsEarned: 420, dailyBest: 0, ship: 'THE LAST LANCE',
        perks: 'Long Lance · Chain Reaction · Overdrive Core', mode: 'SOLSTICE PROTOCOL',
        pbDelta: 22260, newAchievements: [], mutators: [],
        won: true, choicePending: true, canReplay: true, deathCause: '', nemesis: '',
        clearTime: 720, hitsTaken: 0,
      });
    });
    await sleep(7000);
    await page.evaluate(async () => {
      const g = window.__lf;
      let head = 'FIRST LIGHT HELD', line = 'The dawn goes on.';
      try { const sp = await import('/src/stillpoint.ts'); const e = sp.choiceEnding('catch'); head = e.head; line = e.line; } catch {}
      g.ui.resolveChoice && g.ui.resolveChoice(head, line);
    });
    await sleep(5000);
  }),
};

(async () => {
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--enable-gpu'],
  });
  try {
    for (const [k, fn] of Object.entries(BEATS)) {
      if (!want(k)) continue;
      log('▶ beat', k);
      await fn(browser);
    }
  } finally {
    await browser.close();
  }
  log('done. clips in', CLIPS);
})();
