// The live game-state container: pools, player, score economy, and spawn
// helpers. Pure data + allocation-free spawn/despawn — no rendering or audio.

import { Pool } from './pool';
import { SpatialHash } from './collision';
import { Particles } from './particles';
import { TUNE, ENEMY_DEFS, DARTER, DRIFTER_TUNE, SHADE_TUNE, ELITE, POWERUP_DROP, BROODER, HERALD, SEEKER_TUNE } from './tune';
import { deriveStats } from './perks';
import { evoApplier } from './evolutions';
import { makeOverdrive, resetOverdrive } from './overdrive';
import { makeClutch, resetClutch } from './clutch';
import { makePowerup, resetPowerup, applyPowerup } from './powerups';
import type { PowerupKind, PowerupPickup } from './types';
import type { RunStats, PerkStacks } from './perks';
import type { EvolutionId } from './evolutions';
import type { RelicId } from './relics';
import { createRng } from './rng';
import type { Rng } from './rng';
import type { Player, Enemy, Bullet, Gem, EnemyKind } from './types';
import type { CipherState } from './cipher';

function makeEnemy(): Enemy {
  return {
    active: false,
    kind: 'darter',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 1,
    maxHp: 1,
    radius: 12,
    color: '#fff',
    baseScore: 100,
    timer: 0,
    phase: 0,
    telegraph: 0,
    angle: 0,
    spawnTime: 0,
    hitFlash: 0,
    lastDashId: -1,
    shielded: false,
    shieldAngle: 0,
    elite: false,
    speedMul: 1,
    bulletMul: 1,
    isBoss: false,
    bossWave: 0,
    scale: 1,
    fireTimer: 0,
    subPhase: 0,
    cipherExposed: 0,
    facing: 0,
  };
}

function makeBullet(): Bullet {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 6,
    color: '#ff5b8a',
    life: 0,
    fromBoss: false,
    grazeCd: 0,
    homing: 0,
  };
}

function makeGem(): Gem {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, value: 0, life: 0 };
}

function makePowerupPickup(): PowerupPickup {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, kind: 'overreach', life: 0, spin: 0 };
}

function makePlayer(): Player {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: TUNE.player.radius,
    phase: 'idle',
    charge: 0,
    dashTime: 0,
    dashDuration: 0,
    dashFromX: 0,
    dashFromY: 0,
    dashToX: 0,
    dashToY: 0,
    dashDirX: 1,
    dashDirY: 0,
    dashId: 0,
    killsThisDash: 0,
    grazesThisDash: 0,
    perfectThreadFired: false,
    refundThisDash: 0,
    iframe: 0,
    stamina: TUNE.stamina.segments * TUNE.stamina.perSegment,
    regenDelay: 0,
    alive: true,
    hitFlash: 0,
    shields: 0,
    maxShields: 0,
  };
}

export class World {
  player = makePlayer();
  enemies = new Pool<Enemy>(makeEnemy, 360);
  bullets = new Pool<Bullet>(makeBullet, 1600);
  gems = new Pool<Gem>(makeGem, 400);
  pickups = new Pool<PowerupPickup>(makePowerupPickup, 24);
  particles: Particles;
  hash = new SpatialHash<Enemy>(72);

  width = 1280;
  height = 720;

  score = 0;
  combo = 0;
  comboTimer = 0;
  comboGrazeCharge = 0; // B1: fractional combo charge from grazes (+1 combo at 1.0); pure state, no rng
  bestComboRun = 0;
  lastTierAnnounced = 0; // highest combo-tier milestone shown this chain
  shards = 0;
  grazeCount = 0;
  killCount = 0;
  hitsTaken = 0; // §4 M3 — every would-be-fatal hit (armor / last-breath / revive / death) for no-hit scoring
  clearTime = 0; // §4 M3 — sim time at victory (cleartime scoring)
  maxDashChain = 0; // most kills in a single dash this run
  bossKills = 0; // bosses downed this run
  sovereignDown = false; // the Sovereign (final boss) fell this run
  ascension = 0; // THE LONGEST DAY — ASCEND loops taken past the first Sovereign kill (0 = none yet)
  overdriveUses = 0; // OVERDRIVE bursts fired this run (achievements)
  powerupsCollected = 0; // power-ups grabbed this run (achievements)
  collectStreak = 0;
  collectStreakTimer = 0;
  time = 0;
  sdInset = 0; // §4 M2 sudden-death safe-zone inset (fraction per side); render reads it

  stacks: PerkStacks = {};
  /** evolutions taken this run — fusion capstones built on top of perks */
  evolutions: EvolutionId[] = [];
  /** cursed relics taken this run */
  relics: RelicId[] = [];
  /** ship stat profile applied before perks (set by the game from the roster) */
  shipApply: (s: RunStats) => void = () => {};
  /** active ship id — cosmetic only (the renderer picks the hull silhouette + accent) */
  shipId = 'lance';
  /** permanent meta-upgrade application (set by the game from the save) */
  metaApply: (s: RunStats) => void = () => {};
  /** run mutator application — applied AFTER meta, BEFORE ship (so perks layer on top) */
  mutatorApply: (s: RunStats) => void = () => {};
  /** capstone application (relics + heat) — applied LAST, after evolutions */
  postApply: (s: RunStats) => void = () => {};
  /** accumulating run boons (mid-run event rewards) — applied in the capstone slot */
  boons: ((s: RunStats) => void)[] = [];
  stats: RunStats = deriveStats({});
  reviveLeft = 0;

  bossAlive = false;
  boss: Enemy | null = null;

  /** OVERDRIVE ultimate meter/cooldown state */
  overdrive = makeOverdrive();

  /** CLUTCH state — LAST BREATH cooldown/window + COMBO ERUPTION milestone */
  clutch = makeClutch();

  /** active temporary POWER-UP (one at a time; rides the stat pipeline) */
  powerup = makePowerup();

  // afterimage perk: a lingering damaging ghost of the last dash
  ghostX0 = 0;
  ghostY0 = 0;
  ghostX1 = 0;
  ghostY1 = 0;
  ghostTimer = 0;
  ghostDashId = -1;

  rng: Rng;
  /** A SEPARATE stream for power-up drops so death-event draws (which happen at
   *  player-driven timing) never perturb the seeded director/spawn stream — keeps
   *  the Daily's wave composition identical for everyone. Re-seeded per run. */
  dropRng: Rng;
  /** A SEPARATE stream for mid-run EVENTS (the event id roll + every resolve draw:
   *  gamble, free-perk, champion hunt). Events fire AND resolve at player-driven
   *  timing/choice, so drawing them off world.rng forked the seeded wave stream
   *  (two players on one Daily seed desynced their waves). This stream isolates all
   *  that variability so world.rng — the wave stream — stays bit-identical for all.
   *  Re-seeded per run. */
  eventRng: Rng;

  /** the run seed (the same value seeding world.rng). The cipher-lock derives its
   *  per-(seed,boss) code from this, so a Daily seed yields the same cipher for
   *  everyone — and it is read, never drawn, so world.rng stays bit-identical. */
  seed = 0;
  /** the active boss cipher-lock (the code-breaking layer), or null. Set when a
   *  cipher-locked boss's cores spawn; cleared on its death. Never touches world.rng. */
  cipher: CipherState | null = null;
  /** the dashId that last registered a cipher key — enforces one key per dash. */
  cipherKeyDashId = -1;
  /** counts cipher (re-)arms this run → mixed into the cipher seed so each re-lock
   *  is a FRESH code, not a repeat. Deterministic; never draws world.rng. */
  cipherCycle = 0;

  constructor(rng: Rng) {
    this.rng = rng;
    this.dropRng = createRng(0xc0ffee);
    this.eventRng = createRng(0xe7e7e7);
    this.particles = new Particles(rng);
  }

  reset(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.enemies.clear();
    this.bullets.clear();
    this.gems.clear();
    this.particles.reset();
    this.player = makePlayer();
    this.player.x = width / 2;
    this.player.y = height / 2;
    this.player.iframe = 1.6; // brief spawn protection so you're not insta-swarmed
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboGrazeCharge = 0;
    this.bestComboRun = 0;
    this.lastTierAnnounced = 0;
    this.shards = 0;
    this.grazeCount = 0;
    this.killCount = 0;
    this.hitsTaken = 0;
    this.clearTime = 0;
    this.cipher = null;
    this.cipherKeyDashId = -1;
    this.cipherCycle = 0;
    this.maxDashChain = 0;
    this.bossKills = 0;
    this.sovereignDown = false;
    this.ascension = 0;
    this.overdriveUses = 0;
    this.powerupsCollected = 0;
    this.collectStreak = 0;
    this.collectStreakTimer = 0;
    this.time = 0;
    this.sdInset = 0;
    this.stacks = {};
    this.evolutions = [];
    this.relics = [];
    this.boons = [];
    this.pickups.clear();
    resetPowerup(this.powerup); // clear BEFORE recompute so no stale buff leaks into stats
    this.recomputeStats();
    this.bossAlive = false;
    this.boss = null;
    this.ghostTimer = 0;
    resetOverdrive(this.overdrive);
    resetClutch(this.clutch);
  }

  recomputeStats(): void {
    // meta then mutator share the "metaApply" slot so both land before ship/perks
    const metaThenMutator = (s: RunStats): void => {
      this.metaApply(s);
      this.mutatorApply(s);
    };
    // capstone slot: relic/heat postApply, then accumulated run boons, then the
    // active temporary power-up (recomputed whenever a power-up starts/expires)
    const post = (s: RunStats): void => {
      this.postApply(s);
      for (const b of this.boons) b(s);
      applyPowerup(this.powerup, s);
    };
    this.stats = deriveStats(this.stacks, this.shipApply, metaThenMutator, evoApplier(this.evolutions), post);
  }

  /** A random point just outside the arena edge, plus an inward velocity. Defaults
   *  to the seeded world.rng; pass a separate stream (e.g. eventRng) for draws that
   *  happen at player-driven timing so the seeded director stream stays clean. */
  edgeSpawn(rng: Rng = this.rng): { x: number; y: number } {
    const m = 40;
    const side = rng.int(0, 3);
    switch (side) {
      case 0:
        return { x: rng.range(0, this.width), y: -m };
      case 1:
        return { x: this.width + m, y: rng.range(0, this.height) };
      case 2:
        return { x: rng.range(0, this.width), y: this.height + m };
      default:
        return { x: -m, y: rng.range(0, this.height) };
    }
  }

  /** `angle` (optional) sets the spawn facing deterministically; omit it and a
   *  world.rng draw picks one. Death-spawned children (splits, brooder hatches)
   *  pass an explicit angle so they never perturb the seeded director stream. */
  spawnEnemy(kind: EnemyKind, x: number, y: number, speedMul: number, bulletMul: number, shielded: boolean, elite = false, angle?: number): Enemy | null {
    const def = ENEMY_DEFS[kind];
    if (!def) return null;
    const e = this.enemies.obtain();
    if (!e) return null;
    e.kind = kind;
    e.x = x;
    e.y = y;
    e.vx = 0;
    e.vy = 0;
    e.hp = def.hp;
    e.maxHp = def.hp;
    e.radius = def.radius;
    e.color = def.color;
    e.baseScore = def.baseScore;
    e.timer =
      kind === 'darter' ? DARTER.cadence
      : kind === 'drifter' ? DRIFTER_TUNE.repositionTime
      : kind === 'shade' ? SHADE_TUNE.blinkCadence
      : kind === 'brooder' ? BROODER.spawnEvery // wait before the first hatch
      : kind === 'herald' ? HERALD.repositionTime // strafe before the first wall
      : kind === 'seeker' ? SEEKER_TUNE.repositionTime // strafe before the first bolt
      : 0;
    e.phase = 0;
    e.telegraph = 0;
    e.subPhase = 0; // CRITICAL: the pool recycles slots — a stale subPhase (from a
    // prior brooder/boss) would otherwise make a fresh brooder hatch nothing
    e.angle = angle ?? this.rng.range(0, Math.PI * 2);
    e.spawnTime = 0;
    e.hitFlash = 0;
    e.lastDashId = -1;
    e.shielded = shielded && (kind === 'darter' || kind === 'orbiter');
    e.shieldAngle = 0;
    e.elite = elite;
    e.speedMul = elite ? speedMul * ELITE.speedMul : speedMul;
    e.bulletMul = bulletMul;
    e.isBoss = false;
    e.scale = 0.2; // pops in
    if (elite) {
      e.hp = Math.round(def.hp * ELITE.hpMul);
      e.maxHp = e.hp;
      e.radius = def.radius * ELITE.sizeMul;
      e.baseScore = Math.round(def.baseScore * ELITE.scoreMul);
      e.shielded = false; // champion status replaces the shield gimmick
    }
    return e;
  }

  spawnBullet(x: number, y: number, vx: number, vy: number, radius: number, color: string, fromBoss: boolean): Bullet | null {
    const b = this.bullets.obtain();
    if (!b) return null;
    b.x = x;
    b.y = y;
    b.vx = vx;
    b.vy = vy;
    b.radius = radius;
    b.color = color;
    b.life = 8;
    b.fromBoss = fromBoss;
    b.grazeCd = 0;
    b.homing = 0; // CRITICAL: reset on pool reuse, or a recycled SEEKER bolt keeps homing
    return b;
  }

  spawnGem(x: number, y: number, value: number): void {
    // Gems drop on KILLS (player-driven timing). Scatter from dropRng, not the
    // seeded director rng, so the Daily's wave stream stays identical for everyone.
    // Draw before the pool guard so a full gem pool can't skip draws and desync.
    const a = this.dropRng.range(0, Math.PI * 2);
    const sp = this.dropRng.range(30, 90);
    const g = this.gems.obtain();
    if (!g) return;
    g.x = x;
    g.y = y;
    g.vx = Math.cos(a) * sp;
    g.vy = Math.sin(a) * sp;
    g.value = value;
    g.life = TUNE.gems.life;
  }

  spawnPowerup(x: number, y: number, kind: PowerupKind): void {
    // draw from dropRng FIRST (unconditionally) so a full pickup pool can't skip
    // draws and desync the drop stream; uses dropRng so the director stays clean
    const a = this.dropRng.range(0, Math.PI * 2);
    const sp = this.dropRng.range(20, 60);
    const u = this.pickups.obtain();
    if (!u) return;
    u.x = x;
    u.y = y;
    u.vx = Math.cos(a) * sp;
    u.vy = Math.sin(a) * sp;
    u.kind = kind;
    u.life = POWERUP_DROP.pickupLife;
    u.spin = 0;
  }
}
