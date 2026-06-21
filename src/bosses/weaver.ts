// THE WEAVER — boss #2. A pinwheel/ring boss: rotating arms (phase 0) and pulse
// rings with a moving safe-lane (phase 1). ENRAGED it opens TWO closing lanes.
// Extracted from boss.ts; pure gap-index math up top, stateful update below.

import { WEAVER, ZONE, FINALE } from '../tune';
import { norm } from '../vec';
import { bossEnraged, zoneTarget, bossFinaleStart, finaleBurst } from './util';
import type { World } from '../world';
import type { Enemy } from '../types';

/** Omitted (safe-lane) bullet indices for a WEAVER pulse ring. Normally ONE gap of
 *  `gapWidth` starting at `gapStart`. ENRAGED opens a SECOND gap of the same width
 *  starting at `secondStart` (a fixed half-ring offset that drifts inward via a
 *  per-ring counter — NEVER a fresh rng draw). Returns sorted unique indices in [0,n). */
export function weaverGapIndices(
  gapStart: number, n: number, gapWidth: number, enraged: boolean, secondStart: number,
): number[] {
  const out = new Set<number>();
  const wrap = (i: number) => ((i % n) + n) % n;
  for (let k = 0; k < gapWidth; k++) out.add(wrap(gapStart + k));
  if (enraged) for (let k = 0; k < gapWidth; k++) out.add(wrap(secondStart + k));
  return [...out].sort((a, b) => a - b);
}

/** The enraged second gap's start index for ring `ringCount`: half a ring away from
 *  the first, drifting toward it by `driftStep` per ring (clamped so the two lanes
 *  never merge below a one-bullet wall between them). Pure — no rng, no state. */
export function weaverSecondGapStart(gapStart: number, n: number, gapWidth: number, ringCount: number, driftStep: number): number {
  const half = Math.floor(n / 2);
  const maxDrift = Math.max(0, half - gapWidth - 1); // keep ≥1 bullet between the lanes
  const drift = Math.min(maxDrift, ringCount * driftStep);
  return (((gapStart + half - drift) % n) + n) % n;
}

/** Safe-lane WIDTH for the enraged pulse ring at `ringCount`: shrinks linearly from
 *  WEAVER.ringGap toward gapShrinkMin over gapShrinkRings rings, so the lanes narrow
 *  into a timed THREAD as the phase escalates. Off-enrage stays the full ringGap.
 *  Pure (counter-driven, no rng); clamped to [gapShrinkMin, ringGap]. */
export function weaverGapWidth(ringCount: number, enraged: boolean): number {
  if (!enraged) return WEAVER.ringGap;
  const progress = ringCount / WEAVER.gapShrinkRings;
  const w = Math.floor(WEAVER.ringGap - (WEAVER.ringGap - WEAVER.gapShrinkMin) * progress);
  return Math.max(WEAVER.gapShrinkMin, Math.min(WEAVER.ringGap, w));
}

export function updateWeaver(e: Enemy, world: World, dt: number): void {
  e.spawnTime += dt;
  if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 2);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
  if (bossFinaleStart(e, FINALE.frac)) finaleBurst(e, world); // one-shot last-stand volley

  // slow drift near arena center
  const cx = world.width / 2;
  const cy = world.height / 2;
  const tx = cx + Math.cos(e.spawnTime * 0.4) * world.width * 0.16;
  const ty = cy + Math.sin(e.spawnTime * 0.55) * world.height * 0.16;
  const z = ZONE.enabled ? zoneTarget(world.player.x, world.player.y, world.width, world.height, tx, ty, ZONE.bias) : { tx, ty };
  const [nx, ny] = norm(z.tx - e.x, z.ty - e.y);
  e.vx = nx * WEAVER.moveSpeed;
  e.vy = ny * WEAVER.moveSpeed;
  e.x += e.vx * dt;
  e.y += e.vy * dt;

  e.timer -= dt;
  if (e.timer <= 0) {
    e.phase = (e.phase + 1) % 2;
    e.timer = WEAVER.phaseDuration;
    e.fireTimer = 0;
    e.subPhase = 0;
    e.fireCount = 0; // reset the pulse-ring counter so each phase-1 visit re-opens both lanes wide
  }

  const hpFrac = e.hp / e.maxHp;
  e.telegraph = 1 - hpFrac;
  const rate = hpFrac < 0.34 ? 0.8 : 1;
  const enraged = bossEnraged(e, WEAVER.enrageFrac);

  e.fireTimer -= dt;
  if (e.phase === 0) {
    // PINWHEEL: rotating arms
    while (e.fireTimer <= 0) {
      e.angle += WEAVER.pinwheelSpin * WEAVER.pinwheelEvery;
      const sp = WEAVER.pinwheelBulletSpeed;
      for (let i = 0; i < WEAVER.armCount; i++) {
        const a = e.angle + (i / WEAVER.armCount) * Math.PI * 2;
        world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, '#c084fc', true);
      }
      e.fireTimer += WEAVER.pinwheelEvery * rate * world.fireCadenceMul;
    }
  } else {
    // PULSE RINGS with a randomly-placed safe lane to dash through. ENRAGED adds a
    // SECOND lane half a ring away, drifting toward the first (read two lanes).
    if (e.fireTimer <= 0) {
      const n = WEAVER.ringBullets;
      const gapStart = Math.floor(world.rng.next() * n); // the one seeded draw (unchanged)
      const gapWidth = weaverGapWidth(e.fireCount, enraged); // enraged: lanes narrow over rings (thread test)
      const secondStart = weaverSecondGapStart(gapStart, n, gapWidth, e.fireCount, WEAVER.gapDriftStep);
      const omit = new Set(weaverGapIndices(gapStart, n, gapWidth, enraged, secondStart));
      const sp = WEAVER.ringBulletSpeed;
      for (let i = 0; i < n; i++) {
        if (omit.has(i)) continue; // safe lane(s)
        const a = (i / n) * Math.PI * 2;
        world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, '#d8b4fe', true);
      }
      e.fireCount++;
      e.fireTimer = WEAVER.ringEvery * rate * world.fireCadenceMul;
    }
  }
}
