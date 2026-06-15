// Wave director. A single intensity scalar I(t) drives spawn cadence, density,
// enemy mix, and enemy/bullet speed; mini-bosses and perk drafts are scheduled
// on fixed timers. The pure math lives in exported functions (tested); the
// Director class just holds timers and emits decisions.

import { TUNE, ELITE } from './tune';
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

/** D2 stretch swell: as a wave nears its boss, ramp spawn cadence + density to a
 *  crescendo. Keyed off REMAINING time (seconds to the next boss) so the peak lands
 *  at the boss for ANY wave length (70..120s). Pure; applied to cadence/density only,
 *  NEVER to speed (avoids a difficulty cliff). 1.0 far out → 1+stretchSwell at the boss. */
export function stretchSwell(remaining: number): number {
  const d = TUNE.director;
  const p = clamp(1 - remaining / d.stretchWindow, 0, 1);
  const s = p * p * (3 - 2 * p); // smoothstep
  return 1 + d.stretchSwell * s;
}

/** D3 pre-boss calm: true when the boss is so close that chaff spawns should pause,
 *  so the boss roars into a clean arena. Pure function of the remaining time. */
export function preBossSilent(remaining: number): boolean {
  return remaining < TUNE.director.preBossCalm;
}

export function enemySpeedMul(I: number): number {
  return 0.9 + 0.45 * clamp(I, 0, 2);
}

export function bulletSpeedMul(I: number): number {
  return 0.9 + 0.4 * clamp(I, 0, 2);
}

/** Per-spawn shielded-variant chance: 0 until `start`, then a 90s ramp to `max`.
 *  Parameterized so the per-mode ramp (game.ts) and the default director ramp share
 *  ONE formula instead of an inline duplicate. */
export function shieldChance(
  t: number,
  start: number = TUNE.director.shieldStartTime,
  max: number = TUNE.director.shieldMaxChance,
): number {
  if (t < start) return 0;
  return Math.min(max, ((t - start) / 90) * max);
}

/** Per-spawn chance an eligible enemy arrives as an elite Champion. */
export function eliteChance(t: number): number {
  if (t < ELITE.startTime) return 0;
  const ramp = clamp((t - ELITE.startTime) / ELITE.rampSeconds, 0, 1);
  return ELITE.baseChance + (ELITE.maxChance - ELITE.baseChance) * ramp;
}

/** Archetypes that can be promoted to a Champion. Mobile/fair singles only —
 *  NOT packs, split-fodder, or the bloomer (a tanky stationary turret would be
 *  an un-fun bullet-spitting sponge to grind down). */
export const ELITE_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>([
  'darter',
  'orbiter',
  'lancer',
  'bomber',
  'drifter',
  'shade',
]);

/** Which archetypes are unlocked by elapsed time (stealth tutorial pacing). */
export function unlockedKinds(t: number): EnemyKind[] {
  const out: EnemyKind[] = ['darter'];
  if (t >= 15) out.push('orbiter');
  if (t >= 35) out.push('splitter');
  if (t >= 50) out.push('lancer');
  if (t >= 75) out.push('drifter');
  if (t >= 85) out.push('bloomer');
  if (t >= 95) out.push('herald');
  if (t >= 105) out.push('bomber');
  if (t >= 115) out.push('seeker');
  if (t >= 120) out.push('brooder');
  if (t >= 130) out.push('wisp');
  if (t >= 150) out.push('shade');
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
    drifter: 0.4 + 0.2 * clamp(I, 0, 1),
    shade: 0.25 + 0.2 * clamp(I, 0, 1),
    brooder: 0.22 + 0.16 * clamp(I, 0, 1), // a few carriers; kept modest (each births up to 4)
    herald: 0.3 + 0.18 * clamp(I, 0, 1), // mid-game wall zoner
    seeker: 0.26 + 0.16 * clamp(I, 0, 1), // late-game tracker
    mini: 0,
    warden: 0,
    weaver: 0,
    beacon: 0,
    mirrorblade: 0,
    hollow: 0,
    hollow_echo: 0,
    sovereign: 0,
    sovereign_core: 0,
  };
  return unlocked.map((k) => ({ v: k, w: base[k] }));
}

export interface DirectorDecision {
  spawn: EnemyKind[];
  boss: boolean;
  bossKind?: EnemyKind; // explicit boss for scripted modes (arena/bossrush)
  perk: boolean;
  win: boolean; // run beaten (scripted modes only)
  event: boolean; // a mid-run event is due — the game rolls the id off world.eventRng
  // (NOT world.rng) so event timing/choices never fork the seeded wave stream
}

type ArenaPhase = 'entering' | 'spawning' | 'clearing' | 'bossfight' | 'done';

export class Director {
  t = 0;
  cfg: RunConfig = MODES[0];
  private spawnTimer = 0;
  private bossTimer: number = TUNE.director.bossInterval; // counts DOWN, but only during non-boss play
  private prevBossAlive = false; // D3: detect the boss true→false death edge (pure, no rng)
  private lullUntil = 0; // D3: absolute this.t until which post-boss chaff spawns are paused
  private nextPerkAt: number = TUNE.director.perkFirst;
  private nextEventAt: number = TUNE.director.eventFirst;
  bossCount = 0;
  /** displayed wave number (1-based) */
  wave = 1;
  /** active biome enemy-mix bias (multiplicative weights) */
  biomeBias: Partial<Record<EnemyKind, number>> = {};
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
    this.bossTimer = this.cfg.bossInterval;
    this.prevBossAlive = false;
    this.lullUntil = 0;
    this.nextPerkAt = TUNE.director.perkFirst;
    this.nextEventAt = TUNE.director.eventFirst;
    this.waveIndex = 0;
    this.spawnedThisWave = 0;
    this.phase = 'entering';
    this.bossSpawned = false;
    this.seqIndex = 0;
    this.pendingBoss = true; // bossrush spawns its first boss on the first update
  }

  update(dt: number, concurrent: number, bossAlive: boolean, rng: Rng): DirectorDecision {
    this.t += dt;
    const decision: DirectorDecision = { spawn: [], boss: false, perk: false, win: false, event: false };
    if (this.cfg.arena) return this.updateArena(dt, concurrent, bossAlive, rng, decision);
    if (this.cfg.bossrush) return this.updateBossRush(concurrent, bossAlive, decision);
    return this.updateEndless(dt, concurrent, bossAlive, rng, decision);
  }

  private updateEndless(dt: number, concurrent: number, bossAlive: boolean, rng: Rng, d: DirectorDecision): DirectorDecision {
    const I = intensity(this.t) * this.cfg.intensityMul;
    this.wave = Math.floor(this.t / 30) + 1;

    // D3: detect the boss death edge → open a short payoff breath so the gem/power-up/
    // perk reward after a kill isn't stepped on by chaff. Pure (this.t + bossAlive), no rng.
    if (this.prevBossAlive && !bossAlive) this.lullUntil = this.t + TUNE.director.bossLull;
    this.prevBossAlive = bossAlive;

    // The inter-boss "wave" is a fixed budget of NON-BOSS play: bossTimer only
    // ticks while no boss is alive, so a long fight never shortens (or pads) the
    // next wave — every wave runs its full length regardless of how the fight
    // went. Each consecutive wave is waveExtend seconds longer than the last,
    // capped at waveLenMax so a marathon run keeps a steady boss drumbeat. Pure
    // dt countdown — no rng, so the Daily stream stays deterministic.
    if (!bossAlive) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        d.boss = true;
        this.bossCount++;
        const len = this.cfg.bossInterval + this.bossCount * TUNE.director.waveExtend;
        this.bossTimer = Math.min(len, TUNE.director.waveLenMax);
      }
    }
    if (this.cfg.perks && this.t >= this.nextPerkAt) {
      d.perk = true;
      this.nextPerkAt += TUNE.director.perkInterval;
    }
    // mid-run event (wall-clock cadence). Keep it off the very frame a boss dies
    // (so it can't pop the instant the boss falls) and off any boss/perk tick.
    if (bossAlive && this.nextEventAt < this.t + TUNE.director.bossBreather) {
      this.nextEventAt = this.t + TUNE.director.bossBreather;
    }
    if (this.t >= this.nextEventAt && !bossAlive && !d.boss && !d.perk) {
      d.event = true; // the game rolls the id off world.eventRng (off the seeded stream)
      this.nextEventAt = this.t + TUNE.director.eventInterval;
    }
    // D2/D3: the spawn branch is gated by the post-boss lull + the pre-boss calm, and
    // its cadence/density SWELL to a crescendo as the boss nears (never speed). Both the
    // gates and the swell are pure functions of this.t + bossTimer, so the swell only
    // changes the `n` BOUND on the existing single rng.weighted draw — the seeded stream
    // is byte-identical for any two players on the same seed + sim inputs.
    if (!bossAlive && !d.boss && this.t >= this.lullUntil && !preBossSilent(this.bossTimer)) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const sw = stretchSwell(this.bossTimer);
        this.spawnTimer = (spawnInterval(I) / sw) * this.cfg.spawnMul;
        // the swell densifies toward the boss but never breaches the hard concurrency
        // ceiling — keeps the cap honest + consistent with the wisp-pack clamp.
        const room = Math.min(TUNE.director.maxConcurrentCap, Math.round(maxConcurrent(I) * sw)) - concurrent;
        if (room > 0) {
          const n = Math.min(room, Math.round(enemiesPerSpawn(I) * sw));
          const weights = enemyWeights(this.t, I).map((w) => ({ v: w.v, w: w.w * (this.biomeBias[w.v] ?? 1) }));
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
          this.spawnTimer = TUNE.director.arenaSpawnCadence;
          const cap = TUNE.director.arenaConcurrentCap;
          const room = Math.min(cap - concurrent, wave.budget - this.spawnedThisWave, TUNE.director.arenaPerTick);
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
      this.bossCount++; // boss-appearance ordinal (drives HP scaling), not the script index
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
    // perk draft after each boss and at a steady cadence through the gauntlet
    const perkWaves = [3, 6, 9, 13, 16];
    if (this.cfg.perks && (finished.kind === 'boss' || perkWaves.includes(this.waveIndex))) {
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
      this.bossCount++; // boss-appearance ordinal (HP scaling)
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
