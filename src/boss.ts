// The Warden — the mini-boss crescendo. Two alternating attack phases: a
// readable rotating bullet spiral you dash through the gaps of, and aimed fan
// bursts with a rest window that is your damage opening. HP scales each
// appearance. Takes 1 "dash-hit" per dash (one-hit-per-dashId enforced upstream).

import { WARDEN, WEAVER, BEACON } from './tune';
import { norm } from './vec';
import type { World } from './world';
import type { Enemy } from './types';

/** Human-readable boss name for the incoming-warning toast. */
export function bossName(kind: Enemy['kind']): string {
  if (kind === 'weaver') return 'THE WEAVER';
  if (kind === 'beacon') return 'THE BEACON';
  return 'THE WARDEN';
}

/** Is the Beacon's sweep beam currently lethal? (active sub-phase of sweep). */
export function beaconBeamActive(e: Enemy): boolean {
  return e.kind === 'beacon' && e.phase === 0 && e.subPhase === 1;
}

export function spawnBoss(world: World, count: number): Enemy | null {
  const e = world.enemies.obtain();
  if (!e) return null;
  const edge = world.edgeSpawn();
  // cycle bosses: 1st Warden, 2nd Weaver, 3rd Beacon, then repeat
  const variant = (count - 1) % 3;
  const kind = variant === 1 ? 'weaver' : variant === 2 ? 'beacon' : 'warden';
  const def = kind === 'weaver' ? WEAVER : kind === 'beacon' ? BEACON : WARDEN;
  e.kind = kind;
  e.x = edge.x;
  e.y = edge.y;
  e.vx = 0;
  e.vy = 0;
  e.hp = e.maxHp = def.baseHp + count * def.hpPerInterval;
  e.radius = def.radius;
  e.color = kind === 'weaver' ? WEAVER.color : kind === 'beacon' ? BEACON.color : '#ff3b6b';
  e.baseScore = 0;
  e.timer = def.phaseDuration;
  e.phase = 0;
  e.telegraph = 0;
  e.angle = 0;
  e.spawnTime = 0;
  e.hitFlash = 0;
  e.lastDashId = -1;
  e.shielded = false;
  e.shieldAngle = 0;
  e.speedMul = 1;
  e.bulletMul = 1;
  e.isBoss = true;
  e.bossWave = count;
  e.scale = 0.1;
  e.fireTimer = 0;
  e.subPhase = 0;
  world.bossAlive = true;
  world.boss = e;
  return e;
}

export function updateBoss(e: Enemy, world: World, dt: number): void {
  if (e.kind === 'weaver') updateWeaver(e, world, dt);
  else if (e.kind === 'beacon') updateBeacon(e, world, dt);
  else updateWarden(e, world, dt);
}

function updateWarden(e: Enemy, world: World, dt: number): void {
  e.spawnTime += dt;
  if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 2);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

  // lazy lissajous drift near arena center
  const cx = world.width / 2;
  const cy = world.height / 2;
  const tx = cx + Math.cos(e.spawnTime * 0.5) * world.width * 0.22;
  const ty = cy + Math.sin(e.spawnTime * 0.7) * world.height * 0.18;
  const [nx, ny] = norm(tx - e.x, ty - e.y);
  e.vx = nx * WARDEN.moveSpeed;
  e.vy = ny * WARDEN.moveSpeed;
  e.x += e.vx * dt;
  e.y += e.vy * dt;

  // phase swap
  e.timer -= dt;
  if (e.timer <= 0) {
    e.phase = (e.phase + 1) % 2;
    e.timer = WARDEN.phaseDuration;
    e.fireTimer = 0;
    e.subPhase = 0;
  }

  // health-driven intensity: low HP fires a touch faster
  const hpFrac = e.hp / e.maxHp;
  const rate = hpFrac < 0.34 ? 0.8 : 1;

  e.fireTimer -= dt;
  if (e.phase === 0) {
    // rotating spiral
    while (e.fireTimer <= 0) {
      const sp = WARDEN.spiralBulletSpeed;
      const a = e.angle;
      world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, '#ff6b95', true);
      world.spawnBullet(e.x, e.y, Math.cos(a + Math.PI) * sp, Math.sin(a + Math.PI) * sp, 7, '#ff6b95', true);
      e.angle += WARDEN.spiralSpin;
      e.fireTimer += WARDEN.spiralBulletEvery * rate;
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
        e.subPhase++;
        e.fireTimer = WARDEN.fanGap;
      } else {
        e.subPhase = 0;
        e.fireTimer = WARDEN.fanRest;
      }
    }
  }

  // color shifts toward white as HP drops
  e.telegraph = 1 - hpFrac;
}

function updateWeaver(e: Enemy, world: World, dt: number): void {
  e.spawnTime += dt;
  if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 2);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

  // slow drift near arena center
  const cx = world.width / 2;
  const cy = world.height / 2;
  const tx = cx + Math.cos(e.spawnTime * 0.4) * world.width * 0.16;
  const ty = cy + Math.sin(e.spawnTime * 0.55) * world.height * 0.16;
  const [nx, ny] = norm(tx - e.x, ty - e.y);
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
  }

  const hpFrac = e.hp / e.maxHp;
  e.telegraph = 1 - hpFrac;
  const rate = hpFrac < 0.34 ? 0.8 : 1;

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
      e.fireTimer += WEAVER.pinwheelEvery * rate;
    }
  } else {
    // PULSE RINGS with a randomly-placed safe lane to dash through
    if (e.fireTimer <= 0) {
      const n = WEAVER.ringBullets;
      const gapStart = Math.floor(world.rng.next() * n);
      const sp = WEAVER.ringBulletSpeed;
      for (let i = 0; i < n; i++) {
        if ((i - gapStart + n) % n < WEAVER.ringGap) continue; // safe lane
        const a = (i / n) * Math.PI * 2;
        world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, '#d8b4fe', true);
      }
      e.fireTimer = WEAVER.ringEvery * rate;
    }
  }
}

function updateBeacon(e: Enemy, world: World, dt: number): void {
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
        e.fireTimer = BEACON.offDur;
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
