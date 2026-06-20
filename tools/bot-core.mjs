// LANCEFALL — the PRO autopilot's pure decision logic, framework-agnostic.
//
// This is the brain shared by every harness:
//   • tools/balance-bot.js   — the browser tool (devtools console / live watch)
//   • tools/balance-node.mjs — the headless Node + worker-pool harness
//   • the in-page __bigSweep  — the single-call browser sweep
//
// It has NO DOM and NO `/src` imports. The host injects the two things it needs:
//   1. the engine instance `lf` (the Game) — passed to `bot.decide(lf)` each frame.
//   2. `bot.threatFns` — the boss-beam / parry predicates (loaded from the sim by the
//      host: the browser via `import('/src/...')`, Node via vite `ssrLoadModule`).
// Until `bot.threatFns` is set the bot degrades gracefully (no beam/parry reads).
//
// Keeping the brain in one module means a tuning change lands in every harness at once
// and the headless Node numbers are guaranteed to be the SAME bot as the live watch.

export const DASH_COST = 100;

// Draft smart, not card #0 — and draft for the MODE. The boss gauntlet (Boss Rush) is
// about damage + stamina to out-DPS and out-dodge tanky bosses. The chaff modes (Arena,
// Endless, …) are about CLEAR SPEED: a wave only advances once it's empty, so AoE (Nova
// shockwave-on-dash, Chain detonations) thins a crowd far faster than poking one spear at
// a time — which is exactly what lets the bot push past the wave-11 clearing wall.
export const BOSS_PRIORITY = ['secondwind', 'pierce', 'afterimage', 'longreach', 'siphon', 'grazeburn', 'timethief', 'nova', 'chain', 'slipstream', 'reflect', 'shardcache'];
export const CHAFF_PRIORITY = ['nova', 'chain', 'pierce', 'secondwind', 'longreach', 'siphon', 'grazeburn', 'reflect', 'timethief', 'afterimage', 'slipstream', 'shardcache'];

const segDist = (px, py, ax, ay, bx, by) => {
  const abx = bx - ax, aby = by - ay, apx = px - ax, apy = py - ay;
  const L = abx * abx + aby * aby;
  let t = L > 1e-9 ? (apx * abx + apy * aby) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
};
const angWrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// inverse of chargeToLen: len = lerp(180,560, easeOutQuad(c))
const chargeForLen = (len) => {
  const y = Math.max(0, Math.min(1, (len - 180) / 380));
  return Math.max(0, Math.min(1, 1 - Math.sqrt(1 - y)));
};

/** Create a fresh autopilot. Set `bot.threatFns` once the sim predicates are loaded, then
 *  call `bot.decide(lf)` every frame (it returns the same `lf.input.state` it mutates). */
export function createBot() {
  const bot = { prevHeld: false, committed: false, aimX: 0, aimY: 0, charge: 0, threatFns: null, stuckFrames: 0, lastChaff: 0, mode: null };

  const pickPerk = (lf) => {
    const cards = lf.draftCards || [];
    if (!cards.length) return 0;
    // Boss Rush AND the cipher-lock SOLSTICE are BOSS gauntlets — the cipher-armored bosses are
    // the wall (the bot dies at Weaver with low DPS), so draft DAMAGE/sustain, not chaff AoE.
    // DAMAGE-FIRST for the boss gauntlets AND the open survival modes: now that the dodge upgrade
    // handles chaff survival, killing bosses FASTER (to push through to the Sovereign before the
    // chaff escalates out of hand) beats AoE clear. A/B win: Daily 0→100%, Endless medBoss 3→5.
    // ARENA + CASUAL stay AoE — they're clear-to-advance (a wave/the director gates on EMPTY), so
    // crowd-thinning shockwaves matter more than boss DPS there.
    const aoe = lf.mode && (lf.mode.arena || lf.mode.id === 'casual');
    const pri = aoe ? CHAFF_PRIORITY : BOSS_PRIORITY;
    let bestIdx = 0, bestRank = 1e9;
    for (let i = 0; i < cards.length; i++) {
      const r = pri.indexOf(cards[i].id);
      const rank = r < 0 ? 999 : r;
      if (rank < bestRank) { bestRank = rank; bestIdx = i; }
    }
    return bestIdx;
  };

  const beamHits = (b, x, y, R) => {
    const tf = bot.threatFns; if (!tf || !b) return false;
    if (b.kind === 'beacon' && tf.beaconBeamActive(b)) {
      // enraged Beacon (<50% HP) fires a 2-arm CROSS — model it with the engine's own
      // beamHitsPoint so the bot dodges BOTH arms, not just the primary diameter.
      const arms = tf.beaconEnraged && tf.beaconEnraged(b) ? 2 : 1;
      if (tf.beamHitsPoint(b.x, b.y, b.angle, arms, tf.BEACON.beamWidth / 2 + R, x, y)) return true;
    }
    if (b.kind === 'sovereign' && tf.sovereignBeamActive(b)) {
      if (tf.beamHitsPoint(b.x, b.y, b.angle, tf.SOVEREIGN.beamArms, tf.SOVEREIGN.beamWidth / 2 + R, x, y)) return true;
    }
    return false;
  };

  // Score sampled dash landing spots; return {aimX, aimY, charge} for the best.
  // mode 0 ESCAPE: land OPEN — far from EVERY threat incl. the boss — clear of where
  //   bullets will be after the i-frames lapse, off the walls. Pure survival.
  // mode 1 JOUST: a long dash that spears THROUGH the boss and lands in open space
  //   BEYOND it. Only in safe windows; this is how bosses die.
  // mode 2 HUNT: spear the nearest CHAFF (Arena waves only advance once cleared, and
  //   escape-scoring flees enemies → a wave you can't drift-dodge forever stalls).
  // mode 3 CIPHER: an escape-safe landing (open, off bullets/beams) that ALSO spears through
  //   `cipherTarget` (the next-in-order core) — solve the lock without standing in the fire.
  function bestDash(p, w, bullets, enemies, boss, R, lens, mode, bossHittable, cipherTarget) {
    const DIRS = 20;
    let best = { aimX: p.x + 100, aimY: p.y, charge: 0 }, bestS = -1e18;
    for (let li = 0; li < lens.length; li++) {
      const len = lens[li];
      for (let k = 0; k < DIRS; k++) {
        const a = (k / DIRS) * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
        let lx = Math.max(R + 6, Math.min(w.width - R - 6, p.x + ux * len));
        let ly = Math.max(R + 6, Math.min(w.height - R - 6, p.y + uy * len));
        let sc = 0;
        const m = 80;
        if (lx < m) sc -= (m - lx) * 1.6; if (lx > w.width - m) sc -= (lx - (w.width - m)) * 1.6;
        if (ly < m) sc -= (m - ly) * 1.6; if (ly > w.height - m) sc -= (ly - (w.height - m)) * 1.6;
        sc -= Math.hypot(lx - w.width / 2, ly - w.height / 2) * 0.03;
        for (let bi = 0; bi < bullets.length; bi++) {
          const b = bullets[bi];
          let d = Math.hypot(lx - (b.x + b.vx * 0.22), ly - (b.y + b.vy * 0.22)); if (d < 36) sc -= (36 - d) * 2.4;
          d = Math.hypot(lx - (b.x + b.vx * 0.42), ly - (b.y + b.vy * 0.42)); if (d < 36) sc -= (36 - d) * 1.5;
        }
        let kills = 0, nearestE = 1e9;
        const segLen2 = (lx - p.x) * (lx - p.x) + (ly - p.y) * (ly - p.y) || 1;
        for (let ei = 0; ei < enemies.length; ei++) {
          const e = enemies[ei]; if (!e.active) continue;
          const dl = Math.hypot(lx - e.x, ly - e.y);
          if (!e.isBoss) {
            if ((mode === 0 || mode === 3) && e.kind !== 'sovereign_core' && dl < nearestE) nearestE = dl; // ESCAPE + CIPHER want an open landing
            if (segDist(e.x, e.y, p.x, p.y, lx, ly) < 24 + e.radius) {
              // ARMORED chaff (shielded darter/orbiter) clangs a head-on spear: the shield tracks
              // you, so you only land by SKEWERING THROUGH to the far side. Approximate that: count
              // the kill only when the enemy sits in the dash's INTERIOR (t<0.85) so we pass it and
              // land beyond — a poke that stops short (t≈1) would just bounce off the armor.
              if (e.shielded) {
                const t = ((e.x - p.x) * (lx - p.x) + (e.y - p.y) * (ly - p.y)) / segLen2;
                if (t < 0.85) kills++; // a true through-skewer flanks it
              } else kills++; // spear chaff / cores
            }
          } else if (dl < e.radius + R + 16) {
            sc -= 60; // never LAND on the boss body
          }
        }
        if ((mode === 0 || mode === 3) && boss) { const bd = Math.hypot(lx - boss.x, ly - boss.y); if (bd < nearestE) nearestE = bd; } // escape/cipher keep off the boss body
        sc += Math.min(nearestE, 220) * 0.45; // OPENNESS (escape/cipher; a flat constant otherwise)
        sc += kills * (mode === 2 ? 42 : 15); // HUNT hard-prioritises spearing chaff to clear the wave
        // CIPHER — spear THROUGH the next-in-order core (keys it). A TIE-BREAKER bonus (~one
        // openness unit), NOT an override: among similarly-safe landings prefer the one that
        // also keys, but never dash into a bullet cluster to key (that got the bot killed). The
        // dash i-frames cover the travel; the landing must still be safe.
        if (mode === 3 && cipherTarget && segDist(cipherTarget.x, cipherTarget.y, p.x, p.y, lx, ly) < (cipherTarget.radius || 12) + 24) sc += 120;
        // SPEAR through the boss body — but ONLY when it can take damage (the
        // Sovereign's body is armored until its cores are shattered + it's cracked open).
        if (mode === 1 && boss && bossHittable && segDist(boss.x, boss.y, p.x, p.y, lx, ly) < boss.radius + 26) sc += 55;
        if (boss && beamHits(boss, lx, ly, R)) sc -= 1000;
        if (sc > bestS) { bestS = sc; best = { aimX: p.x + ux * 1000, aimY: p.y + uy * 1000, charge: chargeForLen(len) }; }
      }
    }
    return best;
  }

  bot.reset = function () { bot.prevHeld = false; bot.committed = false; bot.stuckFrames = 0; bot.lastChaff = 0; };

  bot.decide = function (lf) {
    const s = lf.input.state;
    s.pausePressed = false; s.overdrivePressed = false; s.anyPressed = false; s.selectIndex = -1; s.parryPressed = false;
    const st = lf.state;
    if (st === 'draft') { s.selectIndex = pickPerk(lf); s.moveX = s.moveY = 0; s.dashHeld = false; s.dashReleased = false; bot.prevHeld = false; bot.committed = false; return s; }
    if (st === 'event') { s.selectIndex = 0; s.moveX = s.moveY = 0; s.dashHeld = false; s.dashReleased = false; bot.prevHeld = false; bot.committed = false; return s; }
    if (st !== 'playing') { s.moveX = s.moveY = 0; s.dashHeld = false; s.dashReleased = false; bot.prevHeld = false; bot.committed = false; return s; }

    const w = lf.world, p = w.player, R = p.radius;
    if (p.phase === 'dashing') { s.moveX = 0; s.moveY = 0; s.dashHeld = false; s.dashReleased = false; bot.prevHeld = false; bot.committed = false; return s; }

    // ── bullets: CANDIDATE-DIRECTION movement dodge + hard-threat flag ──
    // Two workflow-validated survival wins, merged (endless median survival ~+20–80% in A/B):
    //  (1) WIDER/EARLIER awareness — scan bullets out to 460px with a 1.1s closest-approach
    //      horizon and a +26 reaction band, so the bot leans out of a forming wall before it's
    //      lethal (vs the old 360px / 0.7s / +18).
    //  (2) CANDIDATE-DIRECTION dodge — instead of SUMMING a perpendicular nudge per bullet (which
    //      can vector-cancel or point the player straight INTO a second shot), sample 16 move
    //      directions and steer toward the one whose closest approach to any bullet over a ~0.45s
    //      drift is SAFEST. hard/threatN keep their ORIGINAL tight bands (hitR+8/+12) so the
    //      dash-escape + parry below don't over-fire on a merely-widened detection.
    let mvx = 0, mvy = 0, hard = false, threatN = 0, dangerSev = 0;
    const B = w.bullets.items, near = [];
    for (let i = 0; i < B.length; i++) {
      const b = B[i]; if (!b.active) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) > 460) continue;
      near.push(b);
      const vv = b.vx * b.vx + b.vy * b.vy;
      let ts = vv > 1e-3 ? -((b.x - p.x) * b.vx + (b.y - p.y) * b.vy) / vv : 0;
      if (ts < 0) ts = 0; if (ts > 1.1) continue;
      const cx = b.x + b.vx * ts, cy = b.y + b.vy * ts, minD = Math.hypot(cx - p.x, cy - p.y), hitR = R + b.radius;
      if (minD < hitR + 26) {
        const sev = (1 - Math.min(1, ts / 1.1)) * (1 - Math.min(1, minD / (hitR + 26)));
        if (sev > dangerSev) dangerSev = sev; // peak severity scales how hard we lean on the chosen dir
        if (minD < hitR + 8 && ts < 0.26) hard = true;
        if (minD < hitR + 12 && ts < 0.4) threatN++; // count converging shots → a wall you can't drift out of
      }
    }
    // CANDIDATE-DIRECTION dodge — engage only when a bullet actually threatens (dangerSev>0).
    // Sample 16 unit move dirs; predict the player drifting each way (first-order velocity ramp
    // toward maxSpeed) and pick the dir whose MINIMUM clearance to any near bullet over the
    // horizon is safest, plus a wall penalty + a faint centre tie-breaker.
    if (dangerSev > 0 && near.length) {
      const DIRS = 16, DRIFT = 300, TAU = 0.12; // DRIFT ≈ maxSpeed discounted for ramp/friction
      const TS = [0.10, 0.22, 0.35, 0.45];       // horizon sample times (~0.45s)
      const DISP = TS.map((t) => DRIFT * (t - TAU * (1 - Math.exp(-t / TAU)))); // drift displacement at each t
      const wallM = 70;
      let bestDx = 0, bestDy = 0, bestScore = -1e18;
      for (let k = 0; k < DIRS; k++) {
        const a = (k / DIRS) * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
        let minClear = 1e9;
        for (let ti = 0; ti < TS.length; ti++) {
          const t = TS[ti], px = p.x + ux * DISP[ti], py = p.y + uy * DISP[ti];
          for (let bi = 0; bi < near.length; bi++) {
            const b = near[bi];
            const clr = Math.hypot(px - (b.x + b.vx * t), py - (b.y + b.vy * t)) - (R + b.radius);
            if (clr < minClear) minClear = clr;
          }
        }
        let sc = Math.min(minClear, 90); // safety dominates; cap so we don't over-flee past safe
        const fx = p.x + ux * DISP[DISP.length - 1], fy = p.y + uy * DISP[DISP.length - 1];
        if (fx < wallM) sc -= (wallM - fx) * 0.5; if (fx > w.width - wallM) sc -= (fx - (w.width - wallM)) * 0.5;
        if (fy < wallM) sc -= (wallM - fy) * 0.5; if (fy > w.height - wallM) sc -= (fy - (w.height - wallM)) * 0.5;
        sc -= (Math.hypot(fx - w.width / 2, fy - w.height / 2) - Math.hypot(p.x - w.width / 2, p.y - w.height / 2)) * 0.02;
        if (sc > bestScore) { bestScore = sc; bestDx = ux; bestDy = uy; }
      }
      const gain = dangerSev * 2.1 * 1.6; // matches the old per-bullet nudge weight, scaled for one vector
      mvx += bestDx * gain; mvy += bestDy * gain;
    }
    // Stamina is the boss-fight bottleneck: dash-spamming patterns strands you. A
    // DENSE wall (a full ring) you must dash through; MODERATE pressure you drift
    // out of for free — only burn a dash on it when there's stamina to spare.
    if (threatN >= 5 || (threatN >= 3 && p.stamina >= DASH_COST * 2)) hard = true;

    // ── enemies: body avoidance, crowd pressure, nearest target, boss ──
    const E = w.enemies.items; let nE = null, nED = 1e9, nEscore = 1e9, boss = null, bossDist = 1e9, crowd = 0, cgx = 0, cgy = 0, coresLeft = 0, chaffCount = 0;
    // TARGET PRIORITY — telemetry: the orbiter (bullets + parked mines + body-checks) and the
    // herald/seeker (gap-walls / homing bolts) are the top KILLERS, so hunt them ahead of a
    // nearer-but-harmless drifter. A kind weight <1 shrinks effective distance → preferred.
    const threatWeight = (k) => (k === 'orbiter' || k === 'herald' ? 0.5 : k === 'seeker' || k === 'bomber' ? 0.6 : k === 'lancer' || k === 'shade' ? 0.8 : 1);
    for (let i = 0; i < E.length; i++) {
      const e = E[i]; if (!e.active) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (e.isBoss) { boss = e; bossDist = d; }
      if (e.kind === 'sovereign_core') coresLeft++;
      if (!e.isBoss && e.kind !== 'sovereign_core') chaffCount++;
      if (d < 130) { crowd++; cgx += dx; cgy += dy; }
      const al = d || 1;
      if (d < e.radius + R + 26) {
        mvx += (-dx / al) * 1.7; mvy += (-dy / al) * 1.7;
        const closing = (e.vx * dx + e.vy * dy) < 0; // enemy heading toward us
        if (d < e.radius + R + 6 || (closing && d < e.radius + R + 18)) hard = true;
      }
      if (!e.isBoss && e.kind !== 'sovereign_core') { const sc = d * threatWeight(e.kind); if (sc < nEscore) { nEscore = sc; nED = d; nE = e; } }
    }
    // STUCK detector — a wave only advances once it's EMPTY. If the chaff count won't fall
    // (distant zoners — bloomer/herald/seeker the escape-scoring keeps fleeing), the run
    // STALLS at the cap. Track frames where the count hasn't dropped; once "stuck", spend a
    // ready OVERDRIVE (360px obliterate) and force an aggressive HUNT to break the deadlock.
    if (!boss && chaffCount > 0 && chaffCount >= bot.lastChaff) bot.stuckFrames++; else bot.stuckFrames = 0;
    bot.lastChaff = chaffCount;
    const stuck = !boss && bot.stuckFrames > 150; // ~2.5s without thinning the wave
    if (crowd >= 3) hard = true; // surrounded → punch out now
    if (crowd > 0) { mvx -= (cgx / crowd) * 0.004; mvy -= (cgy / crowd) * 0.004; } // steer off the crowd centroid
    if (boss && beamHits(boss, p.x, p.y, R)) hard = true;
    // BEAMS — the #1 boss killer. They telegraph (subPhase 0) before going lethal
    // (subPhase 1), and the line(s) ROTATE the whole time. So dodge the path DURING
    // the telegraph: predict where each beam will be at fire-time (angle + spin·remaining)
    // and slide perpendicular into a safe wedge before it's lethal.
    const tf0 = bot.threatFns;
    if (boss && tf0 && boss.phase === 0 && (boss.subPhase === 0 || boss.subPhase === 1)) {
      const bdx = p.x - boss.x, bdy = p.y - boss.y;
      const lead = boss.subPhase === 0 ? boss.fireTimer : 0; // telegraph → look ahead to fire-time
      if (boss.kind === 'beacon') {
        // dodge EVERY arm of the (possibly enraged 2-arm cross) beam — arm k at +k·π/arms
        const arms = tf0.beaconEnraged && tf0.beaconEnraged(boss) ? 2 : 1;
        for (let k = 0; k < arms; k++) {
          const a = boss.angle + tf0.BEACON.sweepSpin * lead + (k * Math.PI) / arms;
          const perp = bdx * -Math.sin(a) + bdy * Math.cos(a);
          if (Math.abs(perp) < tf0.BEACON.beamWidth / 2 + R + 65) {
            const sg = perp >= 0 ? 1 : -1;
            mvx += -Math.sin(a) * sg * 2.8; mvy += Math.cos(a) * sg * 2.8;
            if (boss.subPhase === 1) hard = true; // already live and we're in it → dash out NOW
          }
        }
      } else if (boss.kind === 'sovereign') {
        const arms = tf0.SOVEREIGN.beamArms, half = tf0.SOVEREIGN.beamWidth / 2 + R + 60;
        for (let k = 0; k < arms; k++) {
          const a = boss.angle + tf0.SOVEREIGN.beamSpin * lead + (k * Math.PI) / arms;
          const perp = bdx * -Math.sin(a) + bdy * Math.cos(a);
          if (Math.abs(perp) < half) {
            const sg = perp >= 0 ? 1 : -1;
            mvx += -Math.sin(a) * sg * 2.0; mvy += Math.cos(a) * sg * 2.0;
            if (boss.subPhase === 1) hard = true;
          }
        }
        const bd = Math.hypot(bdx, bdy) || 1;
        if (bd < 210) { mvx += (bdx / bd) * 1.4; mvy += (bdy / bd) * 1.4; } // leave the convergent centre where every arm is close
      }
    }

    // ── CIPHER (SOLSTICE PROTOCOL + the Sovereign): a cipher-locked boss is ARMORED until its
    //    orbiting cores are dashed in the DECODED order. We can READ that order straight off
    //    w.cipher (order[progress] = the next slot) and a core carries its slot in `.phase`, so
    //    the bot solves it DELIBERATELY: dash through the exact next core. A wrong dash is a
    //    forgiving no-op, so this can only help. This is the ONLY way to crack a Solstice
    //    Warden/Weaver/Beacon (and turns the Sovereign's brute-forced solve into an instant one). ──
    let cipherCore = null;
    const cipher = w.cipher;
    if (cipher && !cipher.solved && cipher.order && boss) {
      const nextSlot = cipher.order[cipher.progress];
      for (let i = 0; i < E.length; i++) {
        const e = E[i];
        if (e.active && e.kind === 'sovereign_core' && e.phase === nextSlot) { cipherCore = e; break; }
      }
    }

    // ── PARRY decision (the SECOND verb) — pick at most one parry target this frame, by
    //    priority. Parry casts toward the ship's FACING (p.angle, which lerps to aim), so we
    //    aim at the target and fire only once roughly aligned. Parry locks out the dash for
    //    ~0.34s, so a NON-urgent parry yields to a dash-escape when a lethal shot is closing. ──
    const PARRY = tf0 && tf0.PARRY;
    const PREACH = 70;     // base wedge reach (px) — conservative; coherence widens it in-engine
    const PHALF = 0.62;    // base half-angle (rad ~71°)
    const canParry = !!PARRY && p.parryCooldown <= 0 && p.parryTime <= 0 && p.phase !== 'charging';
    let pTgt = null; // { x, y, why, urgent }
    if (PARRY) {
      // A) reflectable boss ORB incoming → fling it back at the boss (parry-as-offense)
      if (boss) {
        let od = 1e9, orb = null;
        for (let i = 0; i < near.length; i++) { const b = near[i]; if (!b.reflectable || !b.fromBoss) continue; const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < od) { od = d; orb = b; } }
        if (orb && od < PREACH + 36) pTgt = { x: orb.x, y: orb.y, why: 'orb', urgent: true };
      }
      // B) MIRRORBLADE mid-lunge → parry to STAGGER (cancels the lethal lunge body + chips it)
      if (!pTgt && boss && boss.kind === 'mirrorblade' && tf0.mirrorbladeStaggerable && tf0.mirrorbladeStaggerable(boss)) {
        if (Math.hypot(boss.x - p.x, boss.y - p.y) < (PARRY.mirrorbladeReach || 100) - 6) pTgt = { x: boss.x, y: boss.y, why: 'mirror', urgent: true };
      }
      // (NB: there is no bare-enemy "riposte parry" — game.ts only runs the enemy counter-burst
      //  when the parry ALSO catches a bullet / staggers / reflects. A melee shielded darter
      //  with no bullets in the arc can't be parry-killed; it dies to a through-skewer or AoE.)
      // C) genuinely out of dashes with a wall converging in front → deflect it + refund stamina
      if (!pTgt && p.stamina < DASH_COST * 0.6 && threatN >= 3) {
        let bd = 1e9, bb = null;
        for (let i = 0; i < near.length; i++) { const b = near[i]; const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < PREACH + 16 && d < bd) { bd = d; bb = b; } }
        if (bb) pTgt = { x: bb.x, y: bb.y, why: 'deflect', urgent: false };
      }
    }
    // resolve the parry into FIRE / LINE-UP (rotate toward it, hold the dash) / none
    let parryAimX = 0, parryAimY = 0, parryFire = false, parryCommit = false;
    if (pTgt) {
      const desired = Math.atan2(pTgt.y - p.y, pTgt.x - p.x);
      const dd = Math.abs(angWrap(desired - p.angle));
      const dashEscapes = hard && !pTgt.urgent && p.stamina >= DASH_COST - 1; // a closing lethal shot a dash dodges wins over a non-urgent parry
      if (!dashEscapes) {
        parryAimX = pTgt.x; parryAimY = pTgt.y;
        if (canParry && dd <= PHALF) { parryFire = true; parryCommit = true; }
        else if (dd < 1.0) { parryCommit = true; } // rotating into alignment — hold the dash this frame
      }
    }

    // ── dash decision (survive first: an escape dash also spears & thins the crowd) ──
    const canDash = p.stamina >= DASH_COST - 1;
    let wantDash = false, aimX = 0, aimY = 0, charge = 0;
    // The Sovereign's body only takes damage when EXPOSED, or — to crack it open —
    // once every orbiting core is shattered. Every other boss is always hittable.
    const bossHittable = !boss ? false
      : boss.kind !== 'sovereign' ? true
      : ((tf0 && !tf0.sovereignBodyArmored(boss)) || coresLeft === 0);
    if (parryCommit) {
      // committing to a parry this frame — no dash; aim is forced to the parry target below
      bot.committed = false;
    } else if (stuck && canDash && nE && (!hard || bot.stuckFrames > 600)) {
      // STALL-BREAKER — the wave won't thin on its own (distant zoners the escape-scoring
      // flees). Spear the nearest one (reach past it) to force progress. Normally only when
      // NOT under a hard threat (eating a wall to chase a straggler is how the bot died at
      // w6–7); but a LONG genuine stall (>10s) is a guaranteed loss at the cap, so then it
      // outranks the escape — the HUNT bestDash still scores bullet-avoidance at the landing.
      const hl = Math.min(560, nED + 90);
      const bd = bestDash(p, w, near, E, boss, R, [hl], 2, bossHittable);
      aimX = bd.aimX; aimY = bd.aimY; charge = bd.charge; wantDash = true;
      bot.committed = true; bot.aimX = aimX; bot.aimY = aimY; bot.charge = bd.charge;
    } else if (canDash && hard) {
      const bd = bestDash(p, w, near, E, boss, R, [190], 0, bossHittable); // escape NOW — flee to the openest spot
      aimX = bd.aimX; aimY = bd.aimY; charge = 0; wantDash = true;
      bot.committed = true; bot.aimX = aimX; bot.aimY = aimY; bot.charge = 0;
    } else if (bot.committed && p.phase === 'charging' && threatN < 2) {
      // keep charging the joust — but if a wall starts to form, drop out (this frame
      // releases the dash early: a shorter spear now beats eating shots while slow)
      aimX = bot.aimX; aimY = bot.aimY; charge = bot.charge; wantDash = true;
    } else if (cipherCore && canDash && !hard && threatN <= 1 && p.stamina >= DASH_COST * 1.6) {
      // SOLVE THE CIPHER in a clear-ish window — a mode-3 dash that lands SAFE (open, off
      // bullets/beams) AND spears the exact next-in-order core. Survival (the hard-escape above)
      // wins under real fire; this cracks the ARMORED Solstice Warden/Weaver/Beacon (+ Sovereign)
      // when it's calm. Keying near the boss is dangerous, so it stays gated to safe windows.
      const dcore = Math.hypot(cipherCore.x - p.x, cipherCore.y - p.y);
      const bd = bestDash(p, w, near, E, boss, R, [190, Math.max(220, Math.min(540, dcore + 64))], 3, bossHittable, cipherCore);
      aimX = bd.aimX; aimY = bd.aimY; charge = bd.charge; wantDash = true;
      bot.committed = true; bot.aimX = aimX; bot.aimY = aimY; bot.charge = bd.charge;
    } else if (canDash && boss && p.stamina >= DASH_COST * 2.9 && threatN === 0 && !hard && bossDist < 360) {
      // JOUST — only in a genuinely clear window (no shots closing, ≥1 charge held
      // back): a LONG dash that spears through the boss and lands in open space
      // beyond it. A real charge, but a hard threat appearing mid-charge aborts to
      // an escape (the hard branch above overrides the commit).
      const bd = bestDash(p, w, near, E, boss, R, [300, 400], 1, bossHittable);
      aimX = bd.aimX; aimY = bd.aimY; charge = bd.charge; wantDash = true;
      bot.committed = true; bot.aimX = aimX; bot.aimY = aimY; bot.charge = bd.charge;
    } else if (canDash && !boss && p.stamina >= DASH_COST * 2.6 && threatN <= 1 && nE && nED < 470) {
      // HUNT the last chaff — Arena waves only advance once cleared, so spear the
      // nearest one. Floor raised to ~2.6 charges (was 2): telemetry showed the bot dying
      // STAMINA-STARVED (avg 62 at death, <1 dash) — it spent its reserve hunting and then
      // couldn't dash through the chaff wall that killed it. Keep more in the tank.
      // A shielded darter/orbiter is killed by a dash that passes THROUGH + past it (the
      // shield block test uses the dash-START angle, which falls outside the cone once you've
      // shot past — bestDash already scores those through-skewers, t<0.85).
      const hl = Math.min(540, nED + 70);
      const bd = bestDash(p, w, near, E, boss, R, [hl], 2, bossHittable);
      aimX = bd.aimX; aimY = bd.aimY; charge = bd.charge; wantDash = true;
      bot.committed = true; bot.aimX = aimX; bot.aimY = aimY; bot.charge = bd.charge;
    } else {
      bot.committed = false;
    }

    // a lingering SHIELDED straggler the spear clangs off (≤3 chaff left) is a STALL — its
    // 360px nova obliterate is a clean shield-proof finisher worth spending the meter on.
    const stragglerStuck = !boss && nE && nE.shielded && chaffCount <= 3;
    // ── overdrive: clear a crush, finish a stuck straggler, break a STALLED zoner wave, or
    //    save us when we can't dash. The 360px obliterate clears a spread-out wave the spear
    //    can't chase down — the cure for the late-arena bloomer/herald/seeker stall. ──
    if (w.overdrive.meter >= 1 && w.overdrive.cooldown <= 0 && (crowd >= 4 || stragglerStuck || stuck || (hard && !canDash && !parryCommit))) s.overdrivePressed = true;

    // ── movement: centre pull + opportunistic pickups when truly calm ──
    mvx += (w.width / 2 - p.x) / w.width * 0.35; mvy += (w.height / 2 - p.y) / w.height * 0.35;
    if (!hard && crowd === 0 && Math.hypot(mvx, mvy) < 0.45) {
      let tgt = null, td = 1e9;
      const PU = w.powerups && w.powerups.items;
      if (PU) for (let i = 0; i < PU.length; i++) { const g = PU[i]; if (!g.active) continue; const d = Math.hypot(g.x - p.x, g.y - p.y); if (d < td) { td = d; tgt = g; } }
      if (!tgt) { const G = w.gems.items; for (let i = 0; i < G.length; i++) { const g = G[i]; if (!g.active) continue; const d = Math.hypot(g.x - p.x, g.y - p.y); if (d < td) { td = d; tgt = g; } } }
      if (tgt) { mvx += (tgt.x - p.x) / Math.max(1, td) * 0.6; mvy += (tgt.y - p.y) / Math.max(1, td) * 0.6; }
    }
    // STRAGGLER CLEAR — a lingering SHIELDED darter/orbiter clangs the head-on spear, so when
    // it (and ≤2 others) is all that's left, the wave never empties → STALL. The shield-proof
    // kills are: (1) a dash THROUGH+past it (handled by HUNT/bestDash above), (2) the Nova-Dash
    // launch shockwave (chainExplode ignores the shield) — so CLOSE to within nova radius and
    // the next dash detonates on it, (3) OVERDRIVE's 360px nova obliterate.
    if (stragglerStuck && !hard) {
      const d = nED || 1;
      const want = Math.max(40, (w.stats.dashNovaRadius || 0) - 10); // sit inside the launch-nova ring
      if (d > want) { mvx += (nE.x - p.x) / d * 1.3; mvy += (nE.y - p.y) / d * 1.3; }
    }
    // stamina-aware CHAFF spacing — the cure for the stamina-starved chaff deaths. When low
    // on dashes and NOT stuck (the stall-breaker owns that case), back off the nearest threat
    // to open space and let stamina regen (grazing refunds it too) so a full escape charge is
    // always in reserve for the next wall. Skipped under a hard threat (escape owns that).
    if (!boss && !hard && !stuck && nE && p.stamina < DASH_COST * 1.6 && nED < 200) {
      mvx -= (nE.x - p.x) / (nED || 1) * 0.9; mvy -= (nE.y - p.y) / (nED || 1) * 0.9;
    }
    // CIPHER positioning — keep the next-in-order core in dash range (its orbit moves it). This
    // OVERRIDES the boss-kite below so a low-stamina kite never strands the bot away from the ring.
    if (cipherCore && !hard && !parryCommit) {
      // Only crowd the ring (in the boss's bullet field) when actually READY to key — then the
      // dash's i-frames cover the strike. Otherwise KITE OUT to regen, so the bot isn't loitering
      // near the boss between dashes (that's what got it killed at Weaver).
      if (p.stamina >= DASH_COST * 1.5) {
        const d = Math.hypot(cipherCore.x - p.x, cipherCore.y - p.y) || 1;
        if (d > 150) { mvx += (cipherCore.x - p.x) / d * 0.8; mvy += (cipherCore.y - p.y) / d * 0.8; }
      } else if (bossDist < 360) {
        mvx -= (boss.x - p.x) / bossDist * 1.0; mvy -= (boss.y - p.y) / bossDist * 1.0; // out of dashes → kite to sparse range & regen
      }
    } else if (boss && !hard && !parryCommit) {
    // stamina-aware boss spacing: with charges to spare, close in to joust range;
    // when low, KITE OUT to where the boss's radial patterns are sparse (a full ring
    // is a thin arc out there → movement alone dodges it) and let stamina regen.
      if (p.stamina < DASH_COST && bossDist < 380) { mvx -= (boss.x - p.x) / bossDist * 1.0; mvy -= (boss.y - p.y) / bossDist * 1.0; } // out of dashes → kite to sparse range & regen
      else if (p.stamina >= DASH_COST * 2 && bossDist > 270) { mvx += (boss.x - p.x) / bossDist * 0.55; mvy += (boss.y - p.y) / bossDist * 0.55; } // charges to spare → close to joust range
    }
    let ml = Math.hypot(mvx, mvy); if (ml > 1) { mvx /= ml; mvy /= ml; }
    s.moveX = mvx; s.moveY = mvy;

    // ── charge/release + parry state machine ──
    let held = false;
    if (parryCommit) {
      // aim at the parry target so p.angle rotates into the wedge; never hold/charge a dash
      s.aimX = parryAimX; s.aimY = parryAimY;
      s.parryPressed = parryFire;
      held = false;
    } else if (wantDash) {
      s.aimX = aimX; s.aimY = aimY;
      held = p.phase === 'charging' ? p.charge < charge : true;
      if (p.phase === 'charging' && !held) bot.committed = false; // releasing this frame → fire
    } else {
      s.aimX = nE ? nE.x : boss ? boss.x : p.x + Math.cos(p.angle) * 100;
      s.aimY = nE ? nE.y : boss ? boss.y : p.y + Math.sin(p.angle) * 100;
    }
    s.dashHeld = held; s.dashReleased = bot.prevHeld && !held; s.dashTapped = false; bot.prevHeld = held;
    return s;
  };

  return bot;
}
