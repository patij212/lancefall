// LANCEFALL — BALANCE TELEMETRY RIG. A deep, per-run instrument that scrapes
// everything the sim will give up — every kill (by kind + method), every boss
// (reached / killed / time-to-kill / HP), every hit the player takes (by source,
// wave, and how it was absorbed), damage dealt, and the full run economy — then
// aggregates across many bot runs into hotspot tables you can read at a glance.
//
// Paste into the devtools console of a running DEV build (`npm run dev`), THEN:
//   await __metrics('arena', 40)          → full report for one mode (console.tables + returns the data)
//   await __metricsAll(30)                → arena + bossrush + endless side-by-side
//   __metrics('arena', 40, {ngPlus:0})    → pin a difficulty (default: base/NG+0)
//
// HOW IT WORKS: it loads the PRO bot (balance-bot.js) to drive play, waits for the
// bot's async threat predicates to resolve (else the bot plays blind), stubs
// rAF/render/HUD/network, then wraps the Game's kill/boss/hit/damage seams to record
// structured events while it runs the bot headless. Nothing in the shipped game is
// modified — every wrap + stub is restored in a finally. Console-only tool.
//
// SEAMS (chosen to avoid double-counting — killEnemy is the universal kill router):
//   killEnemy(e,fromDash)   → chaff + boss kills (cores routed out; counted in shatterCore)
//   shatterCore(e,fromDash) → Sovereign core shatters (also fire via solveCipher, off killEnemy)
//   spawnWarden(force)      → a boss arrived (reached-rate, HP, time-to-kill clock)
//   playerDie(cause)        → a would-be-fatal hit: its source, wave, and how it was absorbed
//   damageEnemy(e,dmg,d)    → damage DEALT, split boss / chaff / core

(() => {
  const NG_DEFAULT = 0; // measure base difficulty unless told otherwise (a new player's experience)
  const CAP_STEPS = 50000; // ~833s sim — enough for the full 21-wave Arena / 6-boss gauntlet
  const STEP_MS = 16.667;

  // bullet colour → firing enemy (the colours are hard-coded per fire pattern in enemies.ts;
  // this is how we attribute a chaff-bullet hit to the enemy that actually shot it). Boss
  // bullets vary by boss and are reported separately as 'boss bullet'.
  const BULLET_SRC = {
    '#5beaff': 'orbiter', '#67e8f9': 'orbiter(mine)', '#ffd23b': 'bloomer(ring)', '#bef264': 'herald',
    '#f5d0fe': 'seeker', '#ffb066': 'lancer', '#34d399': 'drifter', '#a7f3d0': 'hollow-echo',
  };

  const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : 0);
  const pct = (n, d) => (d ? +((100 * n) / d).toFixed(1) : 0);
  const r1 = (x) => Math.round(x * 10) / 10;

  // Pretty fixed-width text table (so the return value is readable, not just console.table).
  function textTable(title, headers, rows) {
    const cols = headers.length;
    const w = headers.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length)));
    const line = (cells) => cells.map((c, i) => String(c ?? '').padEnd(w[i])).join('  ');
    const out = [`\n${title}`, line(headers), w.map((x) => '─'.repeat(x)).join('  ')];
    for (const r of rows) out.push(line(r));
    return out.join('\n');
  }

  async function runMetrics(modeId, runs, opts = {}) {
    if (!window.__lf) { console.error('window.__lf not found — run a DEV build.'); return null; }
    // ensure the PRO bot is installed AND its async threat predicates have resolved
    if (!window.__botState || !window.__botState.threatFns) {
      await import('/tools/balance-bot.js');
      for (let i = 0; i < 40 && !(window.__botState && window.__botState.threatFns); i++) await new Promise((r) => setTimeout(r, 25));
    }
    const lf = window.__lf, bot = window.__botState;
    if (!bot || !bot.threatFns) { console.error('bot threat predicates failed to load'); return null; }
    const { MODES } = await import('/src/modes.ts');
    const mode = MODES.find((m) => m.id === modeId) || MODES[0];
    const ng = opts.ngPlus ?? NG_DEFAULT;

    // ── accumulators ──
    const T = {
      mode: mode.id, runs, ngPlus: ng,
      outcome: { won: 0, died: 0, stall: 0 },
      endWave: [], endTime: [], score: [], kills: [], bestCombo: [], hitsTaken: [],
      graze: [], bossKills: [], maxChain: [], dashes: [], staminaAtDeath: [],
      kindKills: {},          // kind -> { dash, other, elite, total }
      coreShatters: 0,
      boss: {},               // kind -> { reached, killed, ttk:[], hp:[], deathsHere }
      bossSpawnT: {},         // kind -> sim time it last arrived (for ttk)
      hits: {},               // cause -> { total, fatal, shield, clutch, waves:{} }
      hitByCollKind: {},      // enemy kind that body-checked us -> count
      hitByBullet: { chaff: 0, boss: 0, homing: 0 },
      hitByBulletSrc: {},     // firing enemy (by bullet colour) -> count (ALL hits incl. absorbed)
      fatalBulletSrc: {},     // firing enemy -> count of FATAL hits only (what actually kills)
      deaths: {},             // "cause @wN" -> count
      dmgDealt: { boss: 0, chaff: 0, core: 0 },
    };
    const K = (k) => (T.kindKills[k] ??= { dash: 0, other: 0, elite: 0, total: 0 });
    const B = (k) => (T.boss[k] ??= { reached: 0, killed: 0, ttk: [], hp: [], deathsHere: 0 });
    const H = (c) => (T.hits[c] ??= { total: 0, fatal: 0, shield: 0, clutch: 0, waves: {} });

    // ── wrap the seams ──
    const o = {
      killEnemy: lf.killEnemy.bind(lf),
      shatterCore: lf.shatterCore.bind(lf),
      spawnWarden: lf.spawnWarden.bind(lf),
      playerDie: lf.playerDie.bind(lf),
      damageEnemy: lf.damageEnemy.bind(lf),
    };
    lf.killEnemy = function (e, fromDash) {
      if (e.kind === 'sovereign_core') return o.killEnemy(e, fromDash); // counted in shatterCore
      if (e.isBoss) {
        const b = B(e.kind); b.killed++; b.hp.push(e.maxHp);
        const st = T.bossSpawnT[e.kind]; if (st != null) b.ttk.push(+(lf.world.time - st).toFixed(1));
      } else {
        const k = K(e.kind); k.total++; if (fromDash) k.dash++; else k.other++; if (e.elite) k.elite++;
      }
      return o.killEnemy(e, fromDash);
    };
    lf.shatterCore = function (e, fromDash) { T.coreShatters++; return o.shatterCore(e, fromDash); };
    lf.spawnWarden = function (force) {
      const ret = o.spawnWarden(force);
      const b = lf.world.boss; if (b) { B(b.kind).reached++; T.bossSpawnT[b.kind] = lf.world.time; }
      return ret;
    };
    lf.damageEnemy = function (e, dmg, fromDash) {
      if (e && dmg > 0) T.dmgDealt[e.isBoss ? 'boss' : e.kind === 'sovereign_core' ? 'core' : 'chaff'] += dmg;
      return o.damageEnemy(e, dmg, fromDash);
    };
    lf.playerDie = function (cause) {
      const w = lf.world, p = w.player;
      if (!p.alive) return o.playerDie(cause); // a no-op in the real method too
      const wave = lf.director.wave, preShields = p.shields;
      // attribute the source while the offender still overlaps us (pre-resolution)
      if (cause === 'a collision') {
        let best = null, bd = 1e9;
        for (const e of w.enemies.items) { if (!e.active || e.isBoss) continue; const d = Math.hypot(e.x - p.x, e.y - p.y) - e.radius; if (d < bd) { bd = d; best = e; } }
        if (best) T.hitByCollKind[best.kind] = (T.hitByCollKind[best.kind] || 0) + 1;
      } else if (cause === 'a bullet') { T.hitByBullet.chaff++; }
      else if (cause === 'a boss bullet') { T.hitByBullet.boss++; }
      let bulletSrc = null;
      if (cause.includes('bullet')) {
        // find the overlapping bullet and attribute it to its firing enemy via colour
        let hit = null, hd = 1e9;
        for (const b of w.bullets.items) { if (!b.active) continue; const d = Math.hypot(b.x - p.x, b.y - p.y) - b.radius; if (d < hd) { hd = d; hit = b; } }
        if (hit) {
          if (hit.homing > 0) T.hitByBullet.homing++;
          bulletSrc = hit.fromBoss ? 'boss' : (BULLET_SRC[hit.color] || `chaff(${hit.color})`);
          T.hitByBulletSrc[bulletSrc] = (T.hitByBulletSrc[bulletSrc] || 0) + 1;
        }
      }
      o.playerDie(cause);
      const h = H(cause); h.total++; h.waves[wave] = (h.waves[wave] || 0) + 1;
      if (!p.alive) {
        h.fatal++; T.deaths[`${cause} @w${wave}`] = (T.deaths[`${cause} @w${wave}`] || 0) + 1;
        if (bulletSrc) T.fatalBulletSrc[bulletSrc] = (T.fatalBulletSrc[bulletSrc] || 0) + 1;
      }
      else if (p.shields < preShields) h.shield++;
      else h.clutch++;
    };

    // ── headless stubs ──
    const sRAF = window.requestAnimationFrame, sR = lf.renderer.render.bind(lf.renderer), sH = lf.ui.updateHud.bind(lf.ui), sF = window.fetch;
    window.requestAnimationFrame = () => 0; lf.renderer.render = () => {}; lf.ui.updateHud = () => {};
    window.fetch = () => Promise.resolve(new Response('{"entries":[]}', { status: 200 }));

    const saveNg = { lvl: lf.save.ngPlusLevel, active: lf.save.ngPlusActive }; // restore the player's real save after
    try {
      for (let r = 0; r < runs; r++) {
        lf.save.ngPlusLevel = ng; lf.save.ngPlusActive = ng > 0;
        bot.prevHeld = false; bot.committed = false; window.__lastWon = false;
        lf.start(mode);
        let t = performance.now(); lf.lastTime = t; let steps = 0;
        while (lf.state !== 'gameover' && steps < CAP_STEPS) { t += STEP_MS; lf.frame(t); steps++; }
        const w = lf.world;
        const won = !!window.__lastWon, died = lf.state === 'gameover' && !won;
        T.outcome[won ? 'won' : died ? 'died' : 'stall']++;
        T.endWave.push(lf.director.wave); T.endTime.push(+w.time.toFixed(1)); T.score.push(w.score);
        T.kills.push(w.killCount); T.bestCombo.push(w.bestComboRun); T.hitsTaken.push(w.hitsTaken);
        T.graze.push(w.grazeCount); T.bossKills.push(w.bossKills); T.maxChain.push(w.maxDashChain);
        T.dashes.push(w.player.dashId); if (died) T.staminaAtDeath.push(+w.player.stamina.toFixed(0));
        if (died && w.boss && w.boss.active) B(w.boss.kind).deathsHere++;
      }
    } finally {
      lf.killEnemy = o.killEnemy; lf.shatterCore = o.shatterCore; lf.spawnWarden = o.spawnWarden;
      lf.playerDie = o.playerDie; lf.damageEnemy = o.damageEnemy;
      window.requestAnimationFrame = sRAF; lf.renderer.render = sR; lf.ui.updateHud = sH; window.fetch = sF;
      lf.save.ngPlusLevel = saveNg.lvl; lf.save.ngPlusActive = saveNg.active; // leave the player's save untouched
    }

    return buildReport(T);
  }

  function buildReport(T) {
    const N = T.runs, oc = T.outcome;
    const summary = {
      mode: T.mode, runs: N, ngPlus: T.ngPlus,
      winRate: pct(oc.won, N), deathRate: pct(oc.died, N), stallRate: pct(oc.stall, N),
      medEndWave: median(T.endWave), medTime: r1(median(T.endTime)), medScore: median(T.score),
      medKills: median(T.kills), medBestCombo: median(T.bestCombo), medBossKills: median(T.bossKills),
      avgHitsTaken: r1(mean(T.hitsTaken)), avgStaminaAtDeath: r1(mean(T.staminaAtDeath)),
      avgDashes: r1(mean(T.dashes)), avgGraze: r1(mean(T.graze)), maxChainSeen: Math.max(0, ...T.maxChain),
    };

    // ENEMIES — kills by kind + method
    const totKills = sum(Object.values(T.kindKills).map((k) => k.total)) || 1;
    const enemies = Object.entries(T.kindKills).sort((a, b) => b[1].total - a[1].total).map(([kind, k]) => ({
      kind, killed: k.total, perRun: r1(k.total / N), pctDash: pct(k.dash, k.total), pctElite: pct(k.elite, k.total), shareOfKills: pct(k.total, totKills),
    }));

    // BOSSES — reached / killed / ttk / hp / deaths-here
    const bossOrder = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'];
    const bosses = Object.entries(T.boss).sort((a, b) => bossOrder.indexOf(a[0]) - bossOrder.indexOf(b[0])).map(([kind, b]) => ({
      kind, reached: b.reached, killed: b.killed, killRate: pct(b.killed, b.reached), avgTTKs: r1(mean(b.ttk)), avgHP: r1(mean(b.hp)), deathsHere: b.deathsHere,
    }));

    // DAMAGE TAKEN — by source, with how it was absorbed
    const totHits = sum(Object.values(T.hits).map((h) => h.total)) || 1;
    const dmgTaken = Object.entries(T.hits).sort((a, b) => b[1].total - a[1].total).map(([cause, h]) => {
      const topWave = Object.entries(h.waves).sort((a, b) => b[1] - a[1])[0];
      return { cause, total: h.total, pctOfHits: pct(h.total, totHits), fatal: h.fatal, shieldAbsorbed: h.shield, clutchAbsorbed: h.clutch, worstWave: topWave ? `w${topWave[0]}(${topWave[1]})` : '—' };
    });

    // who body-checks us
    const collisions = Object.entries(T.hitByCollKind).sort((a, b) => b[1] - a[1]).map(([kind, n]) => ({ kind, bodyHits: n }));
    // who SHOOTS us (chaff bullets attributed to the firing enemy by colour)
    const bulletSrcTot = sum(Object.values(T.hitByBulletSrc)) || 1;
    const bulletSources = Object.entries(T.hitByBulletSrc).sort((a, b) => b[1] - a[1]).map(([src, n]) => ({ source: src, bulletHits: n, pct: pct(n, bulletSrcTot) }));
    // what bullet source actually KILLS (fatal only — separates real lethality from absorbed chip)
    const fatalSrcTot = sum(Object.values(T.fatalBulletSrc)) || 1;
    const fatalBulletSources = Object.entries(T.fatalBulletSrc).sort((a, b) => b[1] - a[1]).map(([src, n]) => ({ source: src, fatalHits: n, pct: pct(n, fatalSrcTot) }));

    // DEATH HOTSPOTS — cause @ wave
    const deaths = Object.entries(T.deaths).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ deathSpot: k, count: n }));

    const dd = T.dmgDealt, ddTot = (dd.boss + dd.chaff + dd.core) || 1;
    const economy = {
      dmgDealtBoss: dd.boss, dmgDealtChaff: dd.chaff, dmgDealtCore: dd.core,
      pctDmgIntoBosses: pct(dd.boss, ddTot), coreShatters: T.coreShatters,
      bulletHits: T.hitByBullet, // {chaff, boss, homing}
    };

    // text report (so it's legible in the raw return value too)
    const text = [
      `═══ LANCEFALL BALANCE REPORT — ${T.mode.toUpperCase()} · ${N} runs · NG+${T.ngPlus} ═══`,
      `OUTCOME   win ${summary.winRate}%  ·  died ${summary.deathRate}%  ·  stall ${summary.stallRate}%   |   med wave ${summary.medEndWave}  ·  med time ${summary.medTime}s  ·  med score ${summary.medScore}`,
      `ECONOMY   med kills ${summary.medKills}  ·  best combo(med) ${summary.medBestCombo}  ·  avg dashes ${summary.avgDashes}  ·  avg graze ${summary.avgGraze}  ·  avg hits-taken ${summary.avgHitsTaken}  ·  avg stamina@death ${summary.avgStaminaAtDeath}  ·  ${economy.pctDmgIntoBosses}% of dmg into bosses`,
      textTable('ENEMIES (kills by kind)', ['kind', 'killed', '/run', '%dash', '%elite', '%ofKills'], enemies.map((e) => [e.kind, e.killed, e.perRun, e.pctDash, e.pctElite, e.shareOfKills])),
      textTable('BOSSES (the gauntlet)', ['boss', 'reached', 'killed', 'kill%', 'avgTTKs', 'avgHP', 'deathsHere'], bosses.map((b) => [b.kind, b.reached, b.killed, b.killRate, b.avgTTKs, b.avgHP, b.deathsHere])),
      textTable('DAMAGE TAKEN (by source)', ['cause', 'total', '%hits', 'fatal', 'shield', 'clutch', 'worstWave'], dmgTaken.map((d) => [d.cause, d.total, d.pctOfHits, d.fatal, d.shieldAbsorbed, d.clutchAbsorbed, d.worstWave])),
      textTable('WHO SHOOTS YOU (all bullet hits by firing enemy)', ['source', 'hits', '%'], bulletSources.map((b) => [b.source, b.bulletHits, b.pct])),
      textTable('WHAT ACTUALLY KILLS YOU (FATAL bullet hits only)', ['source', 'fatal', '%'], fatalBulletSources.map((b) => [b.source, b.fatalHits, b.pct])),
      textTable('WHO BODY-CHECKS YOU (collisions)', ['kind', 'bodyHits'], collisions.map((c) => [c.kind, c.bodyHits])),
      textTable('DEATH HOTSPOTS', ['cause @ wave', 'deaths'], deaths.map((d) => [d.deathSpot, d.count])),
    ].join('\n');

    // also drop it to the live console as real tables for the human running it
    console.log(text);
    console.log('%cENEMIES', 'font-weight:bold'); console.table(enemies);
    console.log('%cBOSSES', 'font-weight:bold'); console.table(bosses);
    console.log('%cDAMAGE TAKEN', 'font-weight:bold'); console.table(dmgTaken);
    console.log('%cDEATH HOTSPOTS', 'font-weight:bold'); console.table(deaths);

    return { summary, enemies, bosses, dmgTaken, bulletSources, fatalBulletSources, collisions, deaths, economy, text };
  }

  window.__metrics = (modeId = 'arena', runs = 40, opts = {}) => runMetrics(modeId, runs, opts);
  window.__metricsAll = async (runs = 30, opts = {}) => {
    const out = {};
    for (const id of ['arena', 'bossrush', 'endless']) out[id] = await runMetrics(id, runs, opts);
    return out;
  };
  console.log('LANCEFALL balance telemetry ready.  ▶ await __metrics("arena", 40)   ·   await __metricsAll(30)');
})();
