// Enemy AI + bullet emission for the 4 archetypes. Each behavior sets the
// enemy's velocity and may emit bullets; a common integrate step applies motion.

import { ORBITER, SPLITTER, BLOOMER, LANCER, WISP, DRIFTER_TUNE, SHADE_TUNE, HOLLOW, SOVEREIGN, BROODER, HERALD, SEEKER_TUNE, ZONER, BOMBER, SHIELD } from './tune';
import { norm, clamp, rotateToward } from './vec';
import { updateDarter } from './enemies/darter';
import type { World } from './world';
import type { Enemy, EnemyKind } from './types';

// Standoff zoners hold a preferred range from the player. Playtest (Nick): with no arena-
// bounds term in their steering they pin to the perimeter when the player holds center.
const STANDOFF_KINDS = new Set<EnemyKind>(['lancer', 'drifter', 'herald', 'seeker']);

/** Blend a soft nudge toward arena center into a zoner's velocity once it strays within an
 *  edge margin (strength ramps with margin depth), so standoff enemies drift back into
 *  playable space instead of hugging the wall. PURE — positions + arena size only, no rng —
 *  so the seeded spawn stream is untouched and the Daily stays bit-identical. Exported for
 *  the unit test (mirrors heraldWall/homingSteer). */
export function applyEdgePull(e: Enemy, world: World): void {
  const m = ZONER.edgeMargin;
  const depthX = Math.max(0, (m - e.x) / m, (e.x - (world.width - m)) / m);
  const depthY = Math.max(0, (m - e.y) / m, (e.y - (world.height - m)) / m);
  const depth = Math.min(1, Math.max(depthX, depthY));
  if (depth <= 0) return;
  const toCx = world.width / 2 - e.x;
  const toCy = world.height / 2 - e.y;
  const len = Math.hypot(toCx, toCy) || 1;
  const k = ZONER.edgePull * depth * e.speedMul;
  e.vx += (toCx / len) * k;
  e.vy += (toCy / len) * k;
}

export function updateEnemy(e: Enemy, world: World, dt: number): void {
  e.spawnTime += dt;
  if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 5);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

  const p = world.player;
  switch (e.kind) {
    case 'darter':
      updateDarter(e, world, dt);
      break;
    case 'orbiter':
      orbiter(e, world, dt);
      break;
    case 'splitter':
      chaser(e, p.x, p.y, dt);
      break;
    case 'mini':
      // A Splitter SHOWER mini (phase 1) is short-lived combo fodder: it decays and
      // harmlessly fizzles if you don't mop it up. Deterministic (timer/dt, no rng);
      // silent release (no sim-side particle — particles share world.rng). Brooder
      // drones keep phase 0 and never decay.
      if (e.phase === 1) {
        e.timer -= dt;
        if (e.timer <= 0) {
          world.enemies.release(e);
          break;
        }
      }
      chaser(e, p.x, p.y, dt);
      break;
    case 'bloomer':
      bloomer(e, world, dt);
      break;
    case 'lancer':
      lancer(e, world, dt);
      break;
    case 'bomber':
      bomber(e, world, dt);
      break;
    case 'wisp':
      wisp(e, world, dt);
      break;
    case 'drifter':
      drifter(e, world, dt);
      break;
    case 'shade':
      shade(e, world, dt);
      break;
    case 'brooder':
      brooder(e, world, dt);
      break;
    case 'herald':
      herald(e, world, dt);
      break;
    case 'seeker':
      seeker(e, world, dt);
      break;
    case 'hollow_echo':
      hollowEcho(e, world, dt);
      break;
    case 'sovereign_core':
      sovereignCore(e, world, dt);
      break;
    default:
      break;
  }

  // shield TRACKS the player but with rotational inertia — it can't snap, so footwork
  // (strafe/circle faster than it can re-aim) opens a flank to dash through. The laggy arc
  // is the tell. Pure (dt + angle math, no rng) so the seeded Daily stays bit-identical.
  if (e.shielded) {
    const target = Math.atan2(p.y - e.y, p.x - e.x);
    e.shieldAngle = rotateToward(e.shieldAngle, target, SHIELD.trackRate * dt);
  }

  // keep standoff zoners off the walls (playtest: edge-hugging sniper); phase 0 = mobile state
  if (e.phase === 0 && STANDOFF_KINDS.has(e.kind)) applyEdgePull(e, world);

  // integrate
  e.x += e.vx * dt;
  e.y += e.vy * dt;
}

function steerToward(e: Enemy, tx: number, ty: number, speed: number): void {
  const [nx, ny] = norm(tx - e.x, ty - e.y);
  e.vx = nx * speed;
  e.vy = ny * speed;
}

function chaser(e: Enemy, px: number, py: number, dt: number): void {
  // a Splitter SHOWER mini (phase 1) drifts SLOW — easy graze/dash fodder, no threat
  const base = e.kind === 'mini' ? (e.phase === 1 ? SPLITTER.showerSpeed : 150) : 70;
  steerToward(e, px, py, base * e.speedMul);
  void dt;
}

function orbiter(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  e.angle += ORBITER.angularSpeed * dt;
  const tx = p.x + Math.cos(e.angle) * ORBITER.orbitRadius;
  const ty = p.y + Math.sin(e.angle) * ORBITER.orbitRadius;
  steerToward(e, tx, ty, 200 * e.speedMul);

  e.timer -= dt;
  if (e.timer <= 0) {
    e.timer = ORBITER.fireCadence;
    // VERB: every Nth shot is a dropped MINE — a stationary hazard parked where the
    // orbiter stands, denying that patch of arena. It expires on its OWN short life
    // (ORBITER.mineLife) — a parked mine that lingered the full 8s bullet life denied
    // far too much space and was, by telemetry, the single biggest source of player
    // hits. subPhase counts shots → fully deterministic (no world.rng draw).
    e.subPhase++;
    if (e.subPhase % ORBITER.mineEvery === 0) {
      const mine = world.spawnBullet(e.x, e.y, 0, 0, 8, ORBITER.mineColor, false, 'mine'); // vx=vy=0 → a parked mine (diamond + warning ring)
      if (mine) mine.life = ORBITER.mineLife;
    } else {
      const [nx, ny] = norm(p.x - e.x, p.y - e.y);
      const sp = ORBITER.bulletSpeed * e.bulletMul;
      world.spawnBullet(e.x, e.y, nx * sp, ny * sp, 6, '#5beaff', false);
    }
  }
}

function bloomer(e: Enemy, world: World, dt: number): void {
  // drift slowly toward arena center
  const cx = world.width / 2;
  const cy = world.height / 2;
  steerToward(e, cx, cy, BLOOMER.driftSpeed * e.speedMul);

  e.timer -= dt;
  e.telegraph = e.timer < BLOOMER.windup ? clamp(1 - e.timer / BLOOMER.windup, 0, 1) : 0;
  if (e.telegraph > 0) {
    e.vx *= 0.2;
    e.vy *= 0.2;
  }
  if (e.timer <= 0) {
    e.timer = BLOOMER.ringCadence;
    e.telegraph = 0;
    const n = BLOOMER.ringCount;
    // ring offset = the bloomer's FIXED phase (e.angle, seeded at spawn) → bullets sit at
    // stable angles, so only the GAP appears to move. Zero world.rng in the verb (the old
    // per-bloom random rotation is gone) → the seeded Daily stays bit-identical.
    const off = e.angle;
    const sp = BLOOMER.bulletSpeed * e.bulletMul;
    // EVERY bloom leaves a safe WEDGE, and the wedge ROTATES by wedgeStep slots each bloom
    // (subPhase counts blooms) → a smooth, trackable gap: "read the gap, move into it."
    e.subPhase++;
    const wedge = ((e.subPhase * BLOOMER.wedgeStep) % n + n) % n; // first omitted slot, rotating
    for (let i = 0; i < n; i++) {
      if ((i - wedge + n) % n < BLOOMER.brokenArc) continue; // the safe wedge (always present)
      const a = off + (i / n) * Math.PI * 2;
      world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 6, '#ffd23b', false);
    }
  }
}

function brooder(e: Enemy, world: World, dt: number): void {
  // HANG at the arena edge: hold a fixed PERCH near the perimeter (direction from e.angle,
  // seeded at spawn) with only a small breathing wobble, so the player must break off the
  // swarm to kill the source. The verb draws NO new world.rng (the Daily stays identical).
  const cx = world.width / 2;
  const cy = world.height / 2;
  const a = e.angle + Math.sin(e.spawnTime * BROODER.orbitSpeed) * 0.18; // perch + gentle wobble
  const tx = cx + Math.cos(a) * world.width * BROODER.edgeFrac;
  const ty = cy + Math.sin(a) * world.height * BROODER.edgeFrac;
  steerToward(e, tx, ty, BROODER.driftSpeed * e.speedMul);

  e.timer -= dt;
  // pulse the core in the windup before a hatch (the tell)
  e.telegraph = e.subPhase < BROODER.maxSpawns && e.timer < BROODER.windup ? clamp(1 - e.timer / BROODER.windup, 0, 1) : 0;
  if (e.timer <= 0) {
    e.timer = BROODER.spawnEvery;
    e.telegraph = 0;
    if (e.subPhase < BROODER.maxSpawns) {
      // deterministic hatch angle (golden-angle spread) — NEVER draw world.rng here:
      // hatch COUNT is player-kill-timed, so an rng draw would desync the Daily
      const a = e.subPhase * 2.39996; // golden angle, in radians
      const child = world.spawnEnemy('mini', e.x, e.y, e.speedMul, e.bulletMul, false, false, a);
      if (child) {
        child.vx = Math.cos(a) * BROODER.childSpeed;
        child.vy = Math.sin(a) * BROODER.childSpeed;
      }
      e.subPhase++;
    }
  }
}

/** One bullet of a herald wall. */
export interface WallShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Build a perpendicular WALL of bullets across `angle`, centred on (ex,ey), with
 *  one clear safe lane (gap) centred at perpendicular offset `gapOffset`. Pure
 *  geometry — every shot flies along `angle` at `speed`; the gap is simply the
 *  band of omitted positions. Shared by the sim (spawn) and the test. */
export function heraldWall(ex: number, ey: number, angle: number, gapOffset: number, speed: number, gapHalf: number = HERALD.gapHalf): WallShot[] {
  const px = Math.cos(angle + Math.PI / 2);
  const py = Math.sin(angle + Math.PI / 2);
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  const out: WallShot[] = [];
  for (let off = -HERALD.wallHalf; off <= HERALD.wallHalf + 1e-6; off += HERALD.spacing) {
    if (Math.abs(off - gapOffset) < gapHalf) continue; // the safe lane (wider on a wide-gate cycle)
    out.push({ x: ex + px * off, y: ey + py * off, vx, vy });
  }
  return out;
}

function herald(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const sp = HERALD.strafeSpeed * e.speedMul;
  if (e.phase === 0) {
    // hold a standoff, strafing
    if (dist < HERALD.range * 0.85) steerToward(e, e.x - dx, e.y - dy, sp);
    else if (dist > HERALD.range * 1.25) steerToward(e, p.x, p.y, sp);
    else {
      e.vx = (-dy / dist) * sp * 0.7;
      e.vy = (dx / dist) * sp * 0.7;
    }
    e.timer -= dt;
    e.telegraph = 0;
    if (e.timer <= 0) {
      e.phase = 1;
      e.timer = HERALD.lockTime;
      e.angle = Math.atan2(dy, dx); // LOCK the aim now — frozen during the telegraph
      // VERB (§3.3): every wideGateEvery-th wall opens a DOUBLED safe lane — a telegraphed
      // reprieve. fireCount drives the cadence (subPhase holds the gap OFFSET, set below).
      e.fireCount++;
      const gapHalf = e.fireCount % HERALD.wideGateEvery === 0 ? HERALD.gapHalf * HERALD.wideGateMul : HERALD.gapHalf;
      // seeded gap offset, kept fully inside the (possibly wider) gap. Cadence-timed (the
      // timer is director-seeded + ticks on sim dt), like the bloomer ring offset, so a
      // seeded Daily stays valid — the rng.range draw COUNT is unchanged, only its range
      // narrows on a wide cycle. NEVER draw rng on a player-kill-timed path (would desync).
      const maxOff = Math.max(0, HERALD.wallHalf - gapHalf);
      e.subPhase = world.rng.range(-maxOff, maxOff);
    }
  } else {
    // telegraphing — brace in place; the gap is previewed by the renderer
    e.vx *= 0.16;
    e.vy *= 0.16;
    e.timer -= dt;
    e.telegraph = clamp(1 - e.timer / HERALD.lockTime, 0, 1);
    if (e.timer <= 0) {
      const base = HERALD.bulletSpeed * e.bulletMul;
      // the same wide-gate cadence as the lock above (fireCount is stable within a cycle)
      const gapHalf = e.fireCount % HERALD.wideGateEvery === 0 ? HERALD.gapHalf * HERALD.wideGateMul : HERALD.gapHalf;
      const shots = heraldWall(e.x, e.y, e.angle, e.subPhase, base, gapHalf);
      for (const s of shots) world.spawnBullet(s.x, s.y, s.vx, s.vy, 6, '#bef264', false, 'dart');
      e.phase = 0;
      e.timer = HERALD.repositionTime;
      e.telegraph = 0;
    }
  }
}

/** Turn a velocity vector toward a target by at most `turnRate*dt` radians,
 *  preserving speed. PURE — the SEEKER's homing. The hot bullet loop in game.ts
 *  inlines this exact math (allocation-free); this copy is what the tests cover. */
export function homingSteer(
  vx: number,
  vy: number,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  turnRate: number,
  dt: number,
): { vx: number; vy: number } {
  const speed = Math.hypot(vx, vy) || 1;
  const cur = Math.atan2(vy, vx);
  const des = Math.atan2(ty - sy, tx - sx);
  const dA = Math.atan2(Math.sin(des - cur), Math.cos(des - cur)); // shortest signed turn
  const maxTurn = turnRate * dt;
  const turn = dA < -maxTurn ? -maxTurn : dA > maxTurn ? maxTurn : dA;
  const a = cur + turn;
  return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
}

function seeker(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const sp = SEEKER_TUNE.strafeSpeed * e.speedMul;
  if (e.phase === 0) {
    // hold a standoff, strafing
    if (dist < SEEKER_TUNE.range * 0.85) steerToward(e, e.x - dx, e.y - dy, sp);
    else if (dist > SEEKER_TUNE.range * 1.25) steerToward(e, p.x, p.y, sp);
    else {
      e.vx = (-dy / dist) * sp * 0.7;
      e.vy = (dx / dist) * sp * 0.7;
    }
    e.timer -= dt;
    e.telegraph = 0;
    if (e.timer <= 0) {
      e.phase = 1;
      e.timer = SEEKER_TUNE.lockTime;
      e.angle = Math.atan2(dy, dx); // initial heading of the bolt (it homes from here)
    }
  } else {
    e.vx *= 0.2;
    e.vy *= 0.2;
    e.timer -= dt;
    e.telegraph = clamp(1 - e.timer / SEEKER_TUNE.lockTime, 0, 1);
    if (e.timer <= 0) {
      // VERB (§3.3): every feintEvery-th shot is a FEINT — a fast STRAIGHT bolt, no homing.
      // A fake-out that hands back a breather (no chaser this cycle). subPhase counts shots →
      // deterministic, zero world.rng (Daily-safe).
      e.subPhase++;
      const feint = e.subPhase % SEEKER_TUNE.feintEvery === 0;
      const bs = SEEKER_TUNE.bulletSpeed * e.bulletMul * (feint ? SEEKER_TUNE.feintSpeedMul : 1);
      const b = world.spawnBullet(e.x, e.y, Math.cos(e.angle) * bs, Math.sin(e.angle) * bs, 7, feint ? '#fbcfe8' : '#f5d0fe', false);
      if (b && !feint) b.homing = SEEKER_TUNE.homeTime; // the HOMER curves toward you; the feint flies straight
      e.phase = 0;
      e.timer = SEEKER_TUNE.fireCadence;
      e.telegraph = 0;
    }
  }
}

function lancer(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const sp = 90 * e.speedMul;
  if (e.phase === 0) {
    // hold a standoff, strafing
    if (dist < LANCER.range * 0.85) steerToward(e, e.x - dx, e.y - dy, sp);
    else if (dist > LANCER.range * 1.3) steerToward(e, p.x, p.y, sp);
    else {
      e.vx = (-dy / dist) * sp * 0.8;
      e.vy = (dx / dist) * sp * 0.8;
    }
    e.timer -= dt;
    e.telegraph = 0;
    if (e.timer <= 0) {
      e.phase = 1;
      e.timer = LANCER.lockTime;
      e.angle = Math.atan2(dy, dx); // LOCK the aim now — frozen during telegraph
    }
  } else if (e.phase === 1) {
    e.vx *= 0.15;
    e.vy *= 0.15;
    e.timer -= dt;
    e.telegraph = clamp(1 - e.timer / LANCER.lockTime, 0, 1);
    if (e.timer <= 0) {
      const bs = LANCER.bulletSpeed * e.bulletMul;
      world.spawnBullet(e.x, e.y, Math.cos(e.angle) * bs, Math.sin(e.angle) * bs, 7, '#ffb066', false, 'dart');
      // VERB: DOUBLE-TAP — schedule a quick second bolt on the SAME frozen aim line.
      // phase 2 counts down fireTimer, then fires once and resets. All cadence-timed
      // off sim dt → fully deterministic, no world.rng draw.
      e.phase = 2;
      e.fireTimer = LANCER.doubleTapDelay;
      e.telegraph = 0;
    }
  } else if (e.phase === 2) {
    // the brief beat between the two bolts of the double-tap
    e.vx *= 0.15;
    e.vy *= 0.15;
    e.fireTimer -= dt;
    if (e.fireTimer <= 0) {
      const bs = LANCER.bulletSpeed * e.bulletMul;
      world.spawnBullet(e.x, e.y, Math.cos(e.angle) * bs, Math.sin(e.angle) * bs, 7, '#ffb066', false, 'dart');
      e.phase = 0;
      e.timer = LANCER.repositionTime;
    }
  }
}

function bomber(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  if (e.phase === 0) {
    // RUSH — close the distance fast; ARM once inside armRange
    steerToward(e, p.x, p.y, 135 * e.speedMul);
    const d2 = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
    e.telegraph = 0;
    if (d2 < BOMBER.armRange * BOMBER.armRange) {
      e.phase = 1;
      e.timer = BOMBER.armTime;
    }
  } else {
    // ARMED — a telegraphed charge, then SELF-DETONATE the blast ring (the don't-greed
    // punish). Creep toward the player so the blast still pressures a camper. Killing it
    // first (from range / a dash-through) pops the same ring via killEnemy — fair either way.
    steerToward(e, p.x, p.y, 45 * e.speedMul);
    e.timer -= dt;
    e.telegraph = clamp(1 - e.timer / BOMBER.armTime, 0, 1);
    if (e.timer <= 0) {
      // ring offset is DETERMINISTIC (e.spawnTime) — zero world.rng on this player-timed
      // path keeps the seeded Daily bit-identical. firingKind is 'bomber' (set by the loop).
      const off = e.spawnTime * 5.3;
      const sp = BOMBER.bulletSpeed * e.bulletMul;
      for (let i = 0; i < BOMBER.detonateCount; i++) {
        const a = off + (i / BOMBER.detonateCount) * Math.PI * 2;
        world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 6, '#fb7185', false);
      }
      world.enemies.release(e); // it consumed itself in the blast (no kill credit — kill it for points)
    }
  }
}

function wisp(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  e.angle += WISP.weaveSpeed * dt;
  // erratic DUAL-frequency weave around the player so the pack never beelines — a graze
  // TREAT, not a beam at your face. Slow approach → dash-through-able / graze fodder.
  // Deterministic (e.angle + e.spawnTime phase), zero world.rng.
  const w = WISP.wobble;
  const tx = p.x + Math.cos(e.angle) * w + Math.cos(e.angle * 2.3 + e.spawnTime) * w * 0.5;
  const ty = p.y + Math.sin(e.angle) * w + Math.sin(e.angle * 1.7 + e.spawnTime) * w * 0.5;
  steerToward(e, tx, ty, WISP.approachSpeed * e.speedMul);
}

function drifter(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const sp = DRIFTER_TUNE.strafeSpeed * e.speedMul;
  if (e.phase === 0) {
    // hold a comfortable standoff, strafing
    if (dist < DRIFTER_TUNE.range * 0.85) steerToward(e, e.x - dx, e.y - dy, sp);
    else if (dist > DRIFTER_TUNE.range * 1.25) steerToward(e, p.x, p.y, sp);
    else {
      e.vx = (-dy / dist) * sp * 0.7;
      e.vy = (dx / dist) * sp * 0.7;
    }
    e.timer -= dt;
    e.telegraph = 0;
    if (e.timer <= 0) {
      e.phase = 1;
      e.timer = DRIFTER_TUNE.lockTime;
      e.angle = Math.atan2(dy, dx); // lock aim now
    }
  } else {
    e.vx *= 0.2;
    e.vy *= 0.2;
    e.timer -= dt;
    e.telegraph = clamp(1 - e.timer / DRIFTER_TUNE.lockTime, 0, 1);
    if (e.timer <= 0) {
      const base = DRIFTER_TUNE.bulletSpeed * e.bulletMul;
      const a = e.angle;
      // VERB (§3.3): alternate the precise arc fan with a WIDE SCATTER SPRAY every
      // sprayEvery-th lock. subPhase counts locks (incremented before the check, like
      // the ORBITER mine) → fully deterministic, zero world.rng, so the Daily stays
      // bit-identical even though the bullet COUNT varies between locks.
      e.subPhase++;
      if (e.subPhase % DRIFTER_TUNE.sprayEvery === 0) {
        // a wide cone of bullets to THREAD — slower + short-lived so it clears fast
        const n = DRIFTER_TUNE.sprayCount;
        const span = DRIFTER_TUNE.spraySpan;
        const ss = base * DRIFTER_TUNE.spraySpeedMul;
        for (let i = 0; i < n; i++) {
          const off = -span / 2 + (span * i) / (n - 1);
          const b = world.spawnBullet(e.x, e.y, Math.cos(a + off) * ss, Math.sin(a + off) * ss, 6, '#34d399', false);
          if (b) b.life = DRIFTER_TUNE.sprayLife;
        }
      } else {
        // a 3-bullet arc fan: centre fast, outer slower → curved wavefront to weave
        const s = DRIFTER_TUNE.arcSpread;
        const o = DRIFTER_TUNE.outerSpeedMul;
        world.spawnBullet(e.x, e.y, Math.cos(a) * base, Math.sin(a) * base, 6, '#34d399', false);
        world.spawnBullet(e.x, e.y, Math.cos(a - s) * base * o, Math.sin(a - s) * base * o, 6, '#34d399', false);
        world.spawnBullet(e.x, e.y, Math.cos(a + s) * base * o, Math.sin(a + s) * base * o, 6, '#34d399', false);
      }
      e.phase = 0;
      e.timer = DRIFTER_TUNE.repositionTime;
      e.telegraph = 0;
    }
  }
}

/** SHADE is LETHAL only mid-STRIKE (phase 1). It is faded + harmless while drifting
 *  (phase 0) — the timing-duel safety that funds the overhaul's flat budget. The body
 *  collision check (game.ts) consults this so a drifting shade can be stood on / walked
 *  through with no penalty; only the brief telegraphed lunge kills. PURE, no rng. */
export function shadeLethal(e: Enemy): boolean {
  return e.kind === 'shade' && e.phase === 1;
}

function shade(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  if (e.phase === 0) {
    // DRIFT — faded + harmless; close the duel distance slowly. The phase-in tell ramps
    // over the last telegraphTime seconds (drawn in enemyTells), and it braces to a near-
    // stop just before striking so the strike origin is readable.
    steerToward(e, p.x, p.y, SHADE_TUNE.driftSpeed * e.speedMul);
    e.timer -= dt;
    e.telegraph = e.timer < SHADE_TUNE.telegraphTime ? clamp(1 - e.timer / SHADE_TUNE.telegraphTime, 0, 1) : 0;
    if (e.telegraph > 0) {
      e.vx *= 0.35;
      e.vy *= 0.35;
    }
    if (e.timer <= 0) {
      // PHASE IN → STRIKE: lock a committed lunge at the player and become lethal. The
      // lunge COASTS (no re-steer below), so a clean sidestep or a dash-through beats it.
      const [nx, ny] = norm(p.x - e.x, p.y - e.y);
      e.vx = nx * SHADE_TUNE.strikeSpeed * e.speedMul;
      e.vy = ny * SHADE_TUNE.strikeSpeed * e.speedMul;
      e.phase = 1;
      e.timer = SHADE_TUNE.strikeTime;
      e.telegraph = 1; // hold the flash bright through the lethal window
      e.scale = 0.7; // a small phase-in pop
    }
  } else {
    // STRIKE — the lethal lunge coasts; collision lethality is gated by shadeLethal.
    e.timer -= dt;
    if (e.timer <= 0) {
      e.phase = 0;
      e.timer = SHADE_TUNE.strikeCadence;
      e.telegraph = 0;
      e.vx *= 0.2;
      e.vy *= 0.2;
    }
  }
}

// A Hollow echo clone — orbits the player at mid-range and fires aimed shots.
// Solid (contact-lethal) and killable, so the player can thin them for relief.
function hollowEcho(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  e.angle += 0.6 * dt;
  const tx = p.x + Math.cos(e.angle) * 220;
  const ty = p.y + Math.sin(e.angle) * 220;
  steerToward(e, tx, ty, 90 * e.speedMul);
  e.timer -= dt;
  if (e.timer <= 0) {
    e.timer = HOLLOW.echoFireEvery;
    const [nx, ny] = norm(p.x - e.x, p.y - e.y);
    const sp = HOLLOW.echoBulletSpeed * e.bulletMul;
    world.spawnBullet(e.x, e.y, nx * sp, ny * sp, 6, HOLLOW.echoColor, true);
  }
}

/** A cipher core: rigidly orbits its boss (the Sovereign's crown, or a generic
 *  ring boss in THE LONGEST DAY). Dash it to key the cipher. Stops if no boss. */
function sovereignCore(e: Enemy, world: World, dt: number): void {
  const b = world.boss;
  if (!b) {
    e.vx = 0;
    e.vy = 0;
    return;
  }
  e.angle += SOVEREIGN.coreOrbitSpin * dt;
  e.x = b.x + Math.cos(e.angle) * SOVEREIGN.coreOrbitRadius;
  e.y = b.y + Math.sin(e.angle) * SOVEREIGN.coreOrbitRadius;
  e.vx = 0; // position is set rigidly; the common integrate step adds nothing
  e.vy = 0;
}

/** Splitter death → the kill METHOD decides the outcome (enemy overhaul §SPLITTER):
 *  a SWEEP kill (dash/heavy, `fromSweep`) is CLEAN — the swept area covered the spawn
 *  point, so NO minis survive. A NON-sweep kill (parry-riposte / graze-burn / from-range
 *  AoE) is the REAL split: the parent SHATTERS into a combo-SHOWER of weak, slow,
 *  SHORT-LIVED minis (the parry payoff). Directions are DETERMINISTIC (derived from the
 *  parent, not world.rng): splitter death is player-kill-timed, so an rng draw here would
 *  desync the seeded Daily director stream. */
export function splitInto(e: Enemy, world: World, fromSweep: boolean): void {
  if (fromSweep) return; // CLEAN — the dash/heavy sweep took parent + spawn in one pass
  const base = e.spawnTime * 2.7; // varies per splitter, but deterministic given the seed
  for (let i = 0; i < SPLITTER.showerCount; i++) {
    const a = base + (i * 2 * Math.PI) / SPLITTER.showerCount; // shower fans out evenly
    const child = world.spawnEnemy('mini', e.x, e.y, e.speedMul, e.bulletMul, false, false, a);
    if (child) {
      child.vx = Math.cos(a) * SPLITTER.showerSpeed;
      child.vy = Math.sin(a) * SPLITTER.showerSpeed;
      child.scale = 0.4;
      child.phase = 1; // EPHEMERAL marker → chaser() slows it + updateEnemy fizzles it on timer
      child.timer = SPLITTER.showerLife;
    }
  }
}
