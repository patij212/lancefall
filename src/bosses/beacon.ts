// THE BEACON — boss #3. A rotating laser-sweep boss: a telegraphed diameter beam
// (phase 0) and aimed fan bursts (phase 1, the damage window). The beam is a
// rendered line with hit-detection in game.ts. ENRAGED the sweep becomes a rotating
// CROSS — a second beam perpendicular to the first (the praised beam, doubled).
// Extracted from boss.ts; pure predicates up top, stateful update below.

import { BEACON } from '../tune';
import { norm } from '../vec';
import { bossEnraged } from './util';
import type { World } from '../world';
import type { Enemy } from '../types';

/** Is the Beacon's sweep beam currently lethal? (active sub-phase of sweep). */
export function beaconBeamActive(e: Enemy): boolean {
  return e.kind === 'beacon' && e.phase === 0 && e.subPhase === 1;
}

/** ENRAGED (low HP) → the sweep gains a perpendicular second beam (a rotating cross).
 *  game.ts passes arms=2 to beamHitsPoint and render draws the +π/2 diameter. */
export function beaconEnraged(e: Enemy): boolean {
  return e.kind === 'beacon' && bossEnraged(e, BEACON.enrageFrac);
}

/** Multiplier on the sweep's OFF (rest) window. Enraged it shrinks to offDurEnragedMul
 *  so the comfy "walk around the wedge" pause stops working — you must dash THROUGH the
 *  beam (i-frames phase you through). Pure HP read, no rng. */
export function beaconSweepTightnessFrac(e: Enemy): number {
  return beaconEnraged(e) ? BEACON.offDurEnragedMul : 1;
}

export function updateBeacon(e: Enemy, world: World, dt: number): void {
  e.spawnTime += dt;
  if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 2);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

  // slow drift near arena center
  const cx = world.width / 2;
  const cy = world.height / 2;
  const tx = cx + Math.cos(e.spawnTime * 0.35) * world.width * 0.14;
  const ty = cy + Math.sin(e.spawnTime * 0.5) * world.height * 0.14;
  const [nx, ny] = norm(tx - e.x, ty - e.y);
  e.vx = nx * BEACON.moveSpeed;
  e.vy = ny * BEACON.moveSpeed;
  e.x += e.vx * dt;
  e.y += e.vy * dt;

  // phase swap, initialising the new phase's sub-state
  e.timer -= dt;
  if (e.timer <= 0) {
    e.phase = (e.phase + 1) % 2;
    e.timer = BEACON.phaseDuration;
    e.subPhase = 0;
    e.fireTimer = e.phase === 0 ? BEACON.telegraphDur : 0;
  }

  const hpFrac = e.hp / e.maxHp;
  const rate = hpFrac < 0.34 ? 0.85 : 1;

  if (e.phase === 0) {
    // SWEEP: a rotating diameter beam that telegraphs → fires → rests
    e.angle += BEACON.sweepSpin * dt;
    e.fireTimer -= dt;
    if (e.fireTimer <= 0) {
      if (e.subPhase === 0) {
        e.subPhase = 1; // begin firing
        e.fireTimer = BEACON.activeDur;
      } else if (e.subPhase === 1) {
        e.subPhase = 2; // beam off
        e.fireTimer = BEACON.offDur * beaconSweepTightnessFrac(e); // enraged: shorter rest → forces dash-through
      } else {
        e.subPhase = 0; // telegraph the next sweep
        e.fireTimer = BEACON.telegraphDur;
      }
    }
    // render hint: 0..1 telegraph charge, 1 while active, 0 off
    e.telegraph = e.subPhase === 0 ? 1 - e.fireTimer / BEACON.telegraphDur : e.subPhase === 1 ? 1 : 0;
  } else {
    // BURST: aimed fans (the damage window)
    e.telegraph = 0;
    e.fireTimer -= dt;
    if (e.fireTimer <= 0) {
      if (e.subPhase < BEACON.fanShots) {
        const p = world.player;
        const base = Math.atan2(p.y - e.y, p.x - e.x);
        const sp = BEACON.fanBulletSpeed;
        const half = (BEACON.fanBullets - 1) / 2;
        for (let i = 0; i < BEACON.fanBullets; i++) {
          const a = base + (i - half) * BEACON.fanSpread;
          world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, '#7dd3fc', true);
        }
        e.subPhase++;
        e.fireTimer = BEACON.fanGap * rate;
      } else {
        e.subPhase = 0;
        e.fireTimer = BEACON.fanRest;
      }
    }
  }
}
