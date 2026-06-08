// Wave director. A single intensity scalar I(t) drives spawn cadence, density,
// enemy mix, and enemy/bullet speed; mini-bosses and perk drafts are scheduled
// on fixed timers. The pure math lives in exported functions (tested); the
// Director class just holds timers and emits decisions.

import { TUNE } from './tune';
import { clamp, lerp } from './vec';
import type { Rng } from './rng';
import type { EnemyKind } from './types';

/** Intensity I(t): ramps 0→1 over rampSeconds, then keeps climbing, unbounded. */
export function intensity(t: number): number {
  const d = TUNE.director;
  if (t <= d.rampSeconds) return t / d.rampSeconds;
  return 1 + (t - d.rampSeconds) / 180;
}

export function spawnInterval(I: number): number {
  const d = TUNE.director;
  const base = lerp(d.spawnIntervalStart, d.spawnIntervalEnd, clamp(I, 0, 1));
  return Math.max(d.spawnIntervalFloor, base - Math.max(0, I - 1) * 0.1);
}

export function enemiesPerSpawn(I: number): number {
  return 1 + Math.floor(clamp(I, 0, 1.4) * TUNE.director.enemiesPerSpawnMax);
}

export function maxConcurrent(I: number): number {
  const d = TUNE.director;
  return Math.min(
    d.maxConcurrentCap,
    Math.round(lerp(d.maxConcurrentStart, d.maxConcurrentEnd, clamp(I, 0, 1)) + Math.max(0, I - 1) * 8),
  );
}

export function enemySpeedMul(I: number): number {
  return 0.9 + 0.45 * clamp(I, 0, 2);
}

export function bulletSpeedMul(I: number): number {
  return 0.9 + 0.4 * clamp(I, 0, 2);
}

export function shieldChance(t: number): number {
  const d = TUNE.director;
  if (t < d.shieldStartTime) return 0;
  return Math.min(d.shieldMaxChance, ((t - d.shieldStartTime) / 90) * d.shieldMaxChance);
}

/** Which archetypes are unlocked by elapsed time (stealth tutorial pacing). */
export function unlockedKinds(t: number): EnemyKind[] {
  const out: EnemyKind[] = ['darter'];
  if (t >= 12) out.push('orbiter');
  if (t >= 35) out.push('splitter');
  if (t >= 70) out.push('bloomer');
  return out;
}

export function enemyWeights(t: number, I: number): { v: EnemyKind; w: number }[] {
  const unlocked = unlockedKinds(t);
  const base: Record<EnemyKind, number> = {
    darter: 1.0,
    orbiter: 0.55,
    splitter: 0.45 + 0.2 * clamp(I, 0, 1),
    bloomer: 0.35 + 0.5 * clamp(I, 0, 1),
    mini: 0,
    warden: 0,
  };
  return unlocked.map((k) => ({ v: k, w: base[k] }));
}

export interface DirectorDecision {
  spawn: EnemyKind[];
  boss: boolean;
  perk: boolean;
}

export class Director {
  t = 0;
  private spawnTimer = 0;
  private nextBossAt: number;
  private nextPerkAt: number;
  bossCount = 0;

  constructor() {
    this.nextBossAt = TUNE.director.bossInterval;
    this.nextPerkAt = TUNE.director.perkFirst;
  }

  reset(): void {
    this.t = 0;
    this.spawnTimer = 0;
    this.bossCount = 0;
    this.nextBossAt = TUNE.director.bossInterval;
    this.nextPerkAt = TUNE.director.perkFirst;
  }

  /** Advance the director. `concurrent` is the current live enemy count and
   *  `bossAlive` suppresses normal spawns while a boss is on screen. */
  update(dt: number, concurrent: number, bossAlive: boolean, rng: Rng): DirectorDecision {
    this.t += dt;
    const I = intensity(this.t);
    const decision: DirectorDecision = { spawn: [], boss: false, perk: false };

    // Mini-boss schedule — always leave a full interval AFTER the fight ends,
    // even if the previous boss overran the schedule.
    if (this.t >= this.nextBossAt && !bossAlive) {
      decision.boss = true;
      this.bossCount++;
      this.nextBossAt = this.t + TUNE.director.bossInterval;
    }

    // Perk draft schedule
    if (this.t >= this.nextPerkAt) {
      decision.perk = true;
      this.nextPerkAt += TUNE.director.perkInterval;
    }

    // Normal spawns (paused during boss)
    if (!bossAlive && !decision.boss) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = spawnInterval(I);
        const cap = maxConcurrent(I);
        const room = cap - concurrent;
        if (room > 0) {
          const n = Math.min(room, enemiesPerSpawn(I));
          const weights = enemyWeights(this.t, I);
          for (let i = 0; i < n; i++) decision.spawn.push(rng.weighted(weights));
        }
      }
    }

    return decision;
  }
}
