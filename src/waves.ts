// Wave director. A single intensity scalar I(t) drives spawn cadence, density,
// enemy mix, and enemy/bullet speed; mini-bosses and perk drafts are scheduled
// on fixed timers. The pure math lives in exported functions (tested); the
// Director class just holds timers and emits decisions.

import { TUNE } from './tune';
import { clamp, lerp } from './vec';
import type { Rng } from './rng';
import type { EnemyKind } from './types';
import type { RunConfig } from './modes';
import { MODES, ARENA_SCRIPT, BOSSRUSH_SEQUENCE } from './modes';

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
  if (t >= 18) out.push('orbiter');
  if (t >= 45) out.push('splitter');
  if (t >= 60) out.push('lancer');
  if (t >= 85) out.push('bloomer');
  if (t >= 105) out.push('bomber');
  if (t >= 130) out.push('wisp');
  return out;
}

export function enemyWeights(t: number, I: number): { v: EnemyKind; w: number }[] {
  const unlocked = unlockedKinds(t);
  const base: Record<EnemyKind, number> = {
    darter: 1.0,
    orbiter: 0.55,
    splitter: 0.45 + 0.2 * clamp(I, 0, 1),
    bloomer: 0.35 + 0.5 * clamp(I, 0, 1),
    lancer: 0.4 + 0.2 * clamp(I, 0, 1),
    bomber: 0.35 + 0.2 * clamp(I, 0, 1),
    wisp: 0.5,
    mini: 0,
    warden: 0,
    weaver: 0,
    beacon: 0,
  };
  return unlocked.map((k) => ({ v: k, w: base[k] }));
}

export interface DirectorDecision {
  spawn: EnemyKind[];
  boss: boolean;
  bossKind?: EnemyKind; // explicit boss for scripted modes (arena/bossrush)
  perk: boolean;
  win: boolean; // run beaten (scripted modes only)
}

type ArenaPhase = 'entering' | 'spawning' | 'clearing' | 'bossfight' | 'done';

export class Director {
  t = 0;
  cfg: RunConfig = MODES[0];
  private spawnTimer = 0;
  private nextBossAt: number = TUNE.director.bossInterval;
  private nextPerkAt: number = TUNE.director.perkFirst;
  bossCount = 0;
  /** displayed wave number (1-based) */
  wave = 1;
  // scripted state
  private waveIndex = 0;
  private spawnedThisWave = 0;
  private phase: ArenaPhase = 'entering';
  private bossSpawned = false;
  private seqIndex = 0;
  private pendingBoss = false;

  configure(cfg: RunConfig): void {
    this.cfg = cfg;
    this.reset();
  }

  reset(): void {
    this.t = 0;
    this.spawnTimer = 0;
    this.bossCount = 0;
    this.wave = 1;
    this.nextBossAt = this.cfg.bossInterval;
    this.nextPerkAt = TUNE.director.perkFirst;
    this.waveIndex = 0;
    this.spawnedThisWave = 0;
    this.phase = 'entering';
    this.bossSpawned = false;
    this.seqIndex = 0;
    this.pendingBoss = true; // bossrush spawns its first boss on the first update
  }

  update(dt: number, concurrent: number, bossAlive: boolean, rng: Rng): DirectorDecision {
    this.t += dt;
    const decision: DirectorDecision = { spawn: [], boss: false, perk: false, win: false };
    if (this.cfg.arena) return this.updateArena(dt, concurrent, bossAlive, rng, decision);
    if (this.cfg.bossrush) return this.updateBossRush(concurrent, bossAlive, decision);
    return this.updateEndless(dt, concurrent, bossAlive, rng, decision);
  }

  private updateEndless(dt: number, concurrent: number, bossAlive: boolean, rng: Rng, d: DirectorDecision): DirectorDecision {
    const I = intensity(this.t) * this.cfg.intensityMul;
    this.wave = Math.floor(this.t / 30) + 1;

    if (this.t >= this.nextBossAt && !bossAlive) {
      d.boss = true;
      this.bossCount++;
      this.nextBossAt = this.t + this.cfg.bossInterval;
    }
    if (this.cfg.perks && this.t >= this.nextPerkAt) {
      d.perk = true;
      this.nextPerkAt += TUNE.director.perkInterval;
    }
    if (!bossAlive && !d.boss) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = spawnInterval(I) * this.cfg.spawnMul;
        const room = maxConcurrent(I) - concurrent;
        if (room > 0) {
          const n = Math.min(room, enemiesPerSpawn(I));
          const weights = enemyWeights(this.t, I);
          for (let i = 0; i < n; i++) d.spawn.push(rng.weighted(weights));
        }
      }
    }
    return d;
  }

  private updateArena(dt: number, concurrent: number, bossAlive: boolean, rng: Rng, d: DirectorDecision): DirectorDecision {
    if (this.phase === 'done') return d;
    if (this.phase === 'entering') this.enterArenaWave(d);

    if (this.phase === 'spawning') {
      const wave = ARENA_SCRIPT[this.waveIndex];
      if (wave.kind === 'wave') {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.spawnedThisWave < wave.budget) {
          this.spawnTimer = 0.7;
          const cap = 14;
          const room = Math.min(cap - concurrent, wave.budget - this.spawnedThisWave, 2);
          for (let i = 0; i < room; i++) {
            d.spawn.push(rng.pick(wave.enemies));
            this.spawnedThisWave++;
          }
        }
        if (this.spawnedThisWave >= wave.budget) this.phase = 'clearing';
      }
    } else if (this.phase === 'clearing') {
      if (concurrent === 0) this.advanceArena(d);
    } else if (this.phase === 'bossfight') {
      if (this.bossSpawned && !bossAlive && concurrent === 0) this.advanceArena(d);
    }
    return d;
  }

  private enterArenaWave(d: DirectorDecision): void {
    if (this.waveIndex >= ARENA_SCRIPT.length) {
      this.phase = 'done';
      d.win = true;
      return;
    }
    this.wave = this.waveIndex + 1;
    const wave = ARENA_SCRIPT[this.waveIndex];
    if (wave.kind === 'boss') {
      d.boss = true;
      d.bossKind = wave.boss;
      this.bossSpawned = true;
      this.phase = 'bossfight';
    } else {
      this.spawnedThisWave = 0;
      this.spawnTimer = 0;
      this.bossSpawned = false;
      this.phase = 'spawning';
    }
  }

  private advanceArena(d: DirectorDecision): void {
    const finished = ARENA_SCRIPT[this.waveIndex];
    this.waveIndex++;
    // perk draft after each boss and after waves 3/6/9 (0-based 2/5/8)
    if (this.cfg.perks && (finished.kind === 'boss' || this.waveIndex === 3 || this.waveIndex === 6 || this.waveIndex === 9)) {
      d.perk = true;
    }
    this.enterArenaWave(d);
  }

  private updateBossRush(concurrent: number, bossAlive: boolean, d: DirectorDecision): DirectorDecision {
    if (this.phase === 'done') return d;
    if (this.pendingBoss && !bossAlive) {
      // (the perk draft, if any, already fired the previous update)
      d.boss = true;
      d.bossKind = BOSSRUSH_SEQUENCE[this.seqIndex];
      this.pendingBoss = false;
      this.bossSpawned = true;
      this.wave = this.seqIndex + 1;
      return d;
    }
    if (this.bossSpawned && !bossAlive && concurrent === 0) {
      this.bossSpawned = false;
      this.seqIndex++;
      if (this.seqIndex >= BOSSRUSH_SEQUENCE.length) {
        this.phase = 'done';
        d.win = true;
      } else {
        if (this.cfg.perks) d.perk = true; // draft between bosses; boss spawns next update
        this.pendingBoss = true;
      }
    }
    return d;
  }
}
