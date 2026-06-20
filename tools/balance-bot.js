// LANCEFALL — headless autoplay probe + a PRO autopilot you can watch (BROWSER host).
//
// Paste this whole file into the devtools console on a running DEV build (`npm run dev`),
// or it auto-loads under the Node/tabs harnesses. Then:
//   __watch('endless')                  → watch the bot play LIVE (auto-restarts on death)
//   await __sweep()                     → full multi-mode survival report (headless, fast)
//   await __heatSweep('arena',[0,3,7])  → win/sovereign-rate per HEAT for one mode
//   await __bigSweep()                  → the WHOLE mode×Heat grid in ONE call (Option 3:
//                                          yields between runs + adaptive caps + early-exit;
//                                          poll window.__bigSweepState.done for progress)
//   __runProbe(__MODES[0], 8, 20000)    → one mode, raw rows
//   clearInterval(__watchTimer)         → stop the live auto-restart loop
//
// The autopilot's BRAIN lives in ./bot-core.mjs (shared with the Node + tabs harnesses, so
// the headless numbers are the SAME bot as the live watch). This file is just the browser
// host: it wires the brain to window.__lf, loads the sim's threat predicates, and provides
// the probe/sweep entry points. Nothing in the shipped game is modified — console-only.

import { createBot } from './bot-core.mjs';

(() => {
  const lf = window.__lf;
  if (!lf) { console.error('window.__lf not found — run a DEV build of LANCEFALL.'); return; }

  const bot = createBot();
  window.__botState = bot;

  // Boss-beam + parry predicates (loaded once; the bot degrades gracefully until ready).
  Promise.all([import('/src/boss.ts'), import('/src/sovereign.ts'), import('/src/tune.ts')])
    .then(([b, sv, t]) => {
      bot.threatFns = {
        beaconBeamActive: b.beaconBeamActive,
        beaconEnraged: b.beaconEnraged, // <50% HP → a 2-arm CROSS beam (arms=2)
        sovereignBeamActive: sv.sovereignBeamActive,
        beamHitsPoint: sv.beamHitsPoint,
        sovereignBodyArmored: sv.sovereignBodyArmored,
        mirrorbladeStaggerable: b.mirrorbladeStaggerable, // PARRY: stagger the lunge
        BEACON: t.BEACON, SOVEREIGN: t.SOVEREIGN, PARRY: t.PARRY,
      };
    })
    .catch(() => {});

  lf.input.poll = () => bot.decide(lf);

  if (!lf.__origFGO) lf.__origFGO = lf.finishGameOver.bind(lf);
  lf.finishGameOver = function (won) { window.__lastWon = !!won; return lf.__origFGO(won); };

  // ── one headless run (shared by every probe). Drives the genuine sim with synthetic
  //    timestamps after the caller has installed the render/HUD/fetch stubs. ──
  function runOne(mode, capSteps, heat, earlyOnSov) {
    if (heat != null) lf.save.selectedHeat = heat;
    bot.reset(); window.__lastWon = false;
    lf.start(mode);
    let t = performance.now(); lf.lastTime = t; lf.accumulator = 0; let steps = 0;
    while (lf.state !== 'gameover' && steps < capSteps) {
      t += 16.667; lf.frame(t); steps++;
      if (earlyOnSov && lf.world.sovereignDown) break; // survival modes: the goal is measured
    }
    const w = lf.world;
    return { time: +w.time.toFixed(1), score: w.score, kills: w.killCount, combo: w.bestComboRun, won: window.__lastWon, sov: !!w.sovereignDown, bossKills: w.bossKills ?? 0, stall: steps >= capSteps && lf.state !== 'gameover' };
  }

  // install/restore the headless stubs (rAF off, render/HUD no-op, leaderboard fetch swallowed)
  function withStubs(fn) {
    const origRAF = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
    const oR = lf.renderer.render.bind(lf.renderer), oH = lf.ui.updateHud.bind(lf.ui), oF = window.fetch;
    lf.renderer.render = () => {}; lf.ui.updateHud = () => {};
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/\/(score|leaderboard)(\?|$)/.test(url)) return Promise.resolve(new Response('{"entries":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
      return oF.call(this, input, init);
    };
    const saveHeat = lf.save.selectedHeat, saveNg = { lvl: lf.save.ngPlusLevel, active: lf.save.ngPlusActive };
    try { return fn(); }
    finally {
      window.requestAnimationFrame = origRAF; lf.renderer.render = oR; lf.ui.updateHud = oH; window.fetch = oF;
      lf.save.selectedHeat = saveHeat; lf.save.ngPlusLevel = saveNg.lvl; lf.save.ngPlusActive = saveNg.active;
    }
  }

  // ── headless probe (stats). Optional `heat` pins save.selectedHeat for the batch. ──
  window.__runProbe = function (mode, runs, capSteps, heat) {
    return withStubs(() => {
      const rows = [];
      for (let r = 0; r < runs; r++) rows.push(runOne(mode, capSteps, heat, false));
      return rows;
    });
  };

  // ── live watch (rendered, real time, auto-restart on death) ──
  window.__watch = async function (modeId, loop) {
    const { MODES } = await import('/src/modes.ts');
    window.__MODES = MODES;
    const mode = MODES.find((m) => m.id === (modeId || 'endless')) || MODES[0];
    bot.mode = mode;
    lf.start(mode);
    if (window.__watchTimer) clearInterval(window.__watchTimer);
    if (loop !== false) window.__watchTimer = setInterval(() => { if (lf.state === 'gameover') lf.start(mode); }, 1500);
    console.log(`▶ watching the PRO bot play ${mode.id}. clearInterval(__watchTimer) to stop the auto-restart.`);
    return 'watching ' + mode.id;
  };

  window.__sweep = async function () {
    const { MODES } = await import('/src/modes.ts');
    window.__MODES = MODES;
    const out = {};
    for (const m of MODES) {
      const rows = window.__runProbe(m, m.seedKind === 'date' ? 3 : 10, m.id === 'arena' || m.id === 'bossrush' ? 40000 : 30000);
      const times = rows.map((x) => x.time).sort((a, b) => a - b);
      out[m.id] = {
        mode: m.id,
        medianSec: times[Math.floor(times.length / 2)],
        maxSec: times[times.length - 1],
        medBosses: rows.map((x) => x.bossKills).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
        maxBosses: Math.max(...rows.map((x) => x.bossKills)),
        winRate: +(rows.filter((x) => x.won).length / rows.length).toFixed(2),
        sovRate: +(rows.filter((x) => x.sov).length / rows.length).toFixed(2),
      };
    }
    console.table(Object.values(out));
    return out;
  };

  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  function summarizeCell(modeId, heat, rows) {
    const n = rows.length || 1;
    return {
      mode: modeId, heat,
      winPct: Math.round(100 * rows.filter((r) => r.won).length / n),
      sovPct: Math.round(100 * rows.filter((r) => r.sov).length / n),
      medBoss: med(rows.map((r) => r.bossKills)), maxBoss: Math.max(0, ...rows.map((r) => r.bossKills)),
      medTime: med(rows.map((r) => r.time)),
      stallPct: Math.round(100 * rows.filter((r) => r.stall).length / n),
    };
  }

  // ── HEAT sweep — win/sovereign-down rate per HEAT level for one mode. Pins NG+0. ──
  window.__heatSweep = async function (modeId, heats, runs, cap) {
    const { MODES } = await import('/src/modes.ts');
    const mode = MODES.find((m) => m.id === modeId) || MODES[0];
    heats = heats || [0, 1, 2, 3, 4, 5, 6, 7];
    runs = runs || 12;
    cap = cap || (mode.arena || mode.bossrush ? 40000 : 28000);
    const cells = withStubs(() => {
      const out = [];
      for (const heat of heats) {
        lf.save.ngPlusLevel = 0; lf.save.ngPlusActive = false;
        const rows = [];
        for (let r = 0; r < runs; r++) rows.push(runOne(mode, cap, heat, false));
        out.push(summarizeCell(modeId, heat, rows));
      }
      return out;
    });
    console.table(cells);
    return cells;
  };

  // ── OPTION 3 — the in-page WHOLE-GRID sweep. One call runs every (mode × Heat) cell,
  //    YIELDING to the event loop between runs so a single page.evaluate never blocks past
  //    its timeout and the tab stays responsive. Adaptive caps (winnable modes get the long
  //    cap; survival modes a shorter one that shrinks with Heat since high Heat dies fast) +
  //    early-exit the instant the Sovereign is down (the survival "beat-it" signal). Progress
  //    is published to window.__bigSweepState; await the return value for the final grid. ──
  window.__bigSweep = async function (opts) {
    opts = opts || {};
    const { MODES } = await import('/src/modes.ts');
    const modeIds = opts.modes || MODES.map((m) => m.id);
    const heats = opts.heats || [0, 1, 2, 3, 4, 5, 6, 7];
    const runs = opts.runs || 10;
    // adaptive cap: winnable modes need the full gauntlet; survival modes get less, and less
    // again at high Heat (the bot dies in ~100–200 s there, so a big cap is wasted).
    const capFor = (mode, heat) => {
      if (opts.cap) return opts.cap;
      if (mode.arena || mode.bossrush) return 42000;
      return Math.round((heat >= 5 ? 16000 : heat >= 3 ? 26000 : 34000));
    };
    const total = modeIds.length * heats.length * runs;
    const state = { done: 0, total, cells: [], startedAt: Date.now(), running: true };
    window.__bigSweepState = state;
    const cells = await withStubsAsync(async () => {
      const out = [];
      for (const id of modeIds) {
        const mode = MODES.find((m) => m.id === id) || MODES[0];
        const winnable = mode.arena || mode.bossrush;
        for (const heat of heats) {
          lf.save.ngPlusLevel = 0; lf.save.ngPlusActive = false;
          const rows = [];
          for (let r = 0; r < runs; r++) {
            rows.push(runOne(mode, capFor(mode, heat), heat, !winnable)); // survival → stop at Sovereign-down
            state.done++;
            await new Promise((res) => setTimeout(res, 0)); // YIELD — keep the tab alive, dodge eval timeout
          }
          const cell = summarizeCell(id, heat, rows);
          out.push(cell); state.cells.push(cell);
        }
      }
      return out;
    });
    state.running = false; state.finishedAt = Date.now();
    console.table(cells);
    return cells;
  };

  // async variant of withStubs (the stubs must hold across the awaited yields)
  async function withStubsAsync(fn) {
    const origRAF = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
    const oR = lf.renderer.render.bind(lf.renderer), oH = lf.ui.updateHud.bind(lf.ui), oF = window.fetch;
    lf.renderer.render = () => {}; lf.ui.updateHud = () => {};
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/\/(score|leaderboard)(\?|$)/.test(url)) return Promise.resolve(new Response('{"entries":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
      return oF.call(this, input, init);
    };
    const saveHeat = lf.save.selectedHeat, saveNg = { lvl: lf.save.ngPlusLevel, active: lf.save.ngPlusActive };
    try { return await fn(); }
    finally {
      window.requestAnimationFrame = origRAF; lf.renderer.render = oR; lf.ui.updateHud = oH; window.fetch = oF;
      lf.save.selectedHeat = saveHeat; lf.save.ngPlusLevel = saveNg.lvl; lf.save.ngPlusActive = saveNg.active;
    }
  }

  console.log('LANCEFALL PRO bot installed (v3 — shared brain).  ▶ __watch("endless")   📊 __sweep()   🔥 __heatSweep("arena")   🗺️ __bigSweep()');
})();
