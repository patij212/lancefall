// THE WARDEN — the mini-boss crescendo / boss #1. Two alternating phases: a
// readable rotating bullet spiral you dash the gaps of, and aimed fan bursts with
// a rest window (your damage opening). Has a REAR weak-point (flank its bounded
// turn). Extracted out of boss.ts; pure pattern-math helpers up top, stateful
// update below (see sibling bosses/*.ts).

import { WARDEN, ZONE, FINALE, ORB } from '../tune';
import { norm } from '../vec';
import { bossEnraged, zoneTarget, bossFinaleStart, finaleBurst, tickReflectableOrb } from './util';
import type { World } from '../world';
import type { Enemy } from '../types';

/** Rotate `cur` toward `target` by at most `maxStep` radians (shortest direction). */
function turnToward(cur: number, target: number, maxStep: number): number {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest signed delta
  if (d > maxStep) d = maxStep;
  else if (d < -maxStep) d = -maxStep;
  return cur + d;
}

/** WARDEN spiral arm angle-offsets (rad) added to the base angle each tick. ENRAGED
 *  doubles the two-spoke star into a four-spoke one (two rotating origins) — pure,
 *  fixed offsets, no rng. */
export function wardenSpiralOffsets(enraged: boolean): number[] {
  return enraged ? [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] : [0, Math.PI];
}

export function updateWarden(e: Enemy, world: World, dt: number): void {
  e.spawnTime += dt;
  if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 2);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
  if (bossFinaleStart(e, FINALE.frac)) finaleBurst(e, world); // one-shot last-stand volley
  tickReflectableOrb(e, world, ORB.warden, dt); // lob a parryable orb on a fixed cadence

  // lazy lissajous drift near arena center
  const cx = world.width / 2;
  const cy = world.height / 2;
  const tx = cx + Math.cos(e.spawnTime * 0.5) * world.width * 0.22;
  const ty = cy + Math.sin(e.spawnTime * 0.7) * world.height * 0.18;
  const z = ZONE.enabled ? zoneTarget(world.player.x, world.player.y, world.width, world.height, tx, ty, ZONE.bias) : { tx, ty };
  const [nx, ny] = norm(z.tx - e.x, z.ty - e.y);
  e.vx = nx * WARDEN.moveSpeed;
  e.vy = ny * WARDEN.moveSpeed;
  e.x += e.vx * dt;
  e.y += e.vy * dt;

  // FACING — the keeper watches you, but turns at a bounded rate, so a quick flank
  // dash can catch its exposed REAR (the weak-point; see resolveDashHits + render).
  const wantFace = Math.atan2(world.player.y - e.y, world.player.x - e.x);
  e.facing = turnToward(e.facing ?? wantFace, wantFace, WARDEN.turnRate * dt);

  // phase swap
  e.timer -= dt;
  if (e.timer <= 0) {
    e.phase = (e.phase + 1) % 2;
    e.timer = WARDEN.phaseDuration;
    e.fireTimer = 0;
    e.subPhase = 0;
  }

  // health-driven intensity: low HP fires a touch faster…
  const hpFrac = e.hp / e.maxHp;
  const rate = hpFrac < 0.34 ? 0.8 : 1;
  // …and ENRAGED (low HP) changes the PATTERN: a four-spoke spiral + a rear back-spray.
  const enraged = bossEnraged(e, WARDEN.enrageFrac);

  e.fireTimer -= dt;
  if (e.phase === 0) {
    // rotating spiral — two spokes, or four when enraged (re-earn the flank)
    while (e.fireTimer <= 0) {
      const sp = WARDEN.spiralBulletSpeed;
      for (const off of wardenSpiralOffsets(enraged)) {
        const a = e.angle + off;
        world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, '#ff6b95', true);
      }
      e.angle += WARDEN.spiralSpin;
      e.fireTimer += WARDEN.spiralBulletEvery * rate * world.fireCadenceMul;
    }
  } else {
    // aimed fans then a rest window
    if (e.fireTimer <= 0) {
      if (e.subPhase < WARDEN.fanShots) {
        const p = world.player;
        const base = Math.atan2(p.y - e.y, p.x - e.x);
        const sp = WARDEN.fanBulletSpeed;
        const half = (WARDEN.fanBullets - 1) / 2;
        for (let i = 0; i < WARDEN.fanBullets; i++) {
          const a = base + (i - half) * WARDEN.fanSpread;
          world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, '#ffd23b', true);
        }
        // ENRAGED: a 3-bullet back-spray covers the rear arc for this volley — you
        // can no longer just camp the flank while it fans the front.
        if (enraged) {
          const backBase = base + Math.PI;
          for (let i = -1; i <= 1; i++) {
            const a = backBase + i * WARDEN.fanSpread;
            world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, '#ff8fb0', true);
          }
        }
        e.subPhase++;
        e.fireTimer = WARDEN.fanGap * world.fireCadenceMul;
      } else {
        e.subPhase = 0;
        e.fireTimer = WARDEN.fanRest * world.fireCadenceMul;
      }
    }
  }

  // color shifts toward white as HP drops
  e.telegraph = 1 - hpFrac;
}
