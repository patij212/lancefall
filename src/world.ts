// The live game-state container: pools, player, score economy, and spawn
// helpers. Pure data + allocation-free spawn/despawn — no rendering or audio.

import { Pool } from './pool';
import { SpatialHash } from './collision';
import { Particles } from './particles';
import { TUNE, ENEMY_DEFS, DARTER } from './tune';
import { deriveStats } from './perks';
import type { RunStats, PerkStacks } from './perks';
import type { Rng } from './rng';
import type { Player, Enemy, Bullet, Gem, EnemyKind } from './types';

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
    speedMul: 1,
    bulletMul: 1,
    isBoss: false,
    bossWave: 0,
    scale: 1,
    fireTimer: 0,
    subPhase: 0,
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
  };
}

function makeGem(): Gem {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, value: 0, life: 0 };
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
    iframe: 0,
    stamina: TUNE.stamina.segments * TUNE.stamina.perSegment,
    regenDelay: 0,
    alive: true,
    hitFlash: 0,
  };
}

export class World {
  player = makePlayer();
  enemies = new Pool<Enemy>(makeEnemy, 360);
  bullets = new Pool<Bullet>(makeBullet, 1600);
  gems = new Pool<Gem>(makeGem, 400);
  particles: Particles;
  hash = new SpatialHash<Enemy>(72);

  width = 1280;
  height = 720;

  score = 0;
  combo = 0;
  comboTimer = 0;
  bestComboRun = 0;
  shards = 0;
  grazeCount = 0;
  killCount = 0;
  collectStreak = 0;
  collectStreakTimer = 0;
  time = 0;

  stacks: PerkStacks = {};
  /** ship stat profile applied before perks (set by the game from the roster) */
  shipApply: (s: RunStats) => void = () => {};
  stats: RunStats = deriveStats({});

  bossAlive = false;
  boss: Enemy | null = null;

  // afterimage perk: a lingering damaging ghost of the last dash
  ghostX0 = 0;
  ghostY0 = 0;
  ghostX1 = 0;
  ghostY1 = 0;
  ghostTimer = 0;
  ghostDashId = -1;

  rng: Rng;

  constructor(rng: Rng) {
    this.rng = rng;
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
    this.bestComboRun = 0;
    this.shards = 0;
    this.grazeCount = 0;
    this.killCount = 0;
    this.collectStreak = 0;
    this.time = 0;
    this.stacks = {};
    this.recomputeStats();
    this.bossAlive = false;
    this.boss = null;
    this.ghostTimer = 0;
  }

  recomputeStats(): void {
    this.stats = deriveStats(this.stacks, this.shipApply);
  }

  /** A random point just outside the arena edge, plus an inward velocity. */
  edgeSpawn(): { x: number; y: number } {
    const m = 40;
    const side = this.rng.int(0, 3);
    switch (side) {
      case 0:
        return { x: this.rng.range(0, this.width), y: -m };
      case 1:
        return { x: this.width + m, y: this.rng.range(0, this.height) };
      case 2:
        return { x: this.rng.range(0, this.width), y: this.height + m };
      default:
        return { x: -m, y: this.rng.range(0, this.height) };
    }
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number, speedMul: number, bulletMul: number, shielded: boolean): Enemy | null {
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
    e.timer = kind === 'darter' ? DARTER.cadence : 0;
    e.phase = 0;
    e.telegraph = 0;
    e.angle = this.rng.range(0, Math.PI * 2);
    e.spawnTime = 0;
    e.hitFlash = 0;
    e.lastDashId = -1;
    e.shielded = shielded && (kind === 'darter' || kind === 'orbiter');
    e.shieldAngle = 0;
    e.speedMul = speedMul;
    e.bulletMul = bulletMul;
    e.isBoss = false;
    e.scale = 0.2; // pops in
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
    return b;
  }

  spawnGem(x: number, y: number, value: number): void {
    const g = this.gems.obtain();
    if (!g) return;
    g.x = x;
    g.y = y;
    const a = this.rng.range(0, Math.PI * 2);
    const sp = this.rng.range(30, 90);
    g.vx = Math.cos(a) * sp;
    g.vy = Math.sin(a) * sp;
    g.value = value;
    g.life = TUNE.gems.life;
  }
}
