// Enemy AI + bullet emission for the 4 archetypes. Each behavior sets the
// enemy's velocity and may emit bullets; a common integrate step applies motion.

import { DARTER, ORBITER, BLOOMER } from './tune';
import { norm, clamp } from './vec';
import type { World } from './world';
import type { Enemy } from './types';

export function updateEnemy(e: Enemy, world: World, dt: number): void {
  e.spawnTime += dt;
  if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 5);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

  const p = world.player;
  switch (e.kind) {
    case 'darter':
      darter(e, world, dt);
      break;
    case 'orbiter':
      orbiter(e, world, dt);
      break;
    case 'splitter':
    case 'mini':
      chaser(e, p.x, p.y, dt);
      break;
    case 'bloomer':
      bloomer(e, world, dt);
      break;
    default:
      break;
  }

  // shield faces the player
  if (e.shielded) {
    e.shieldAngle = Math.atan2(p.y - e.y, p.x - e.x);
  }

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
  const base = e.kind === 'mini' ? 150 : 70;
  steerToward(e, px, py, base * e.speedMul);
  void dt;
}

function darter(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  if (e.phase === 0) {
    // approach
    steerToward(e, p.x, p.y, 120 * e.speedMul);
    e.timer -= dt;
    e.telegraph = e.timer < DARTER.windup ? clamp(1 - e.timer / DARTER.windup, 0, 1) : 0;
    if (e.telegraph > 0) {
      // brace before the lunge
      e.vx *= 0.3;
      e.vy *= 0.3;
    }
    if (e.timer <= 0) {
      const [nx, ny] = norm(p.x - e.x, p.y - e.y);
      e.vx = nx * DARTER.lungeSpeed * e.speedMul;
      e.vy = ny * DARTER.lungeSpeed * e.speedMul;
      e.phase = 1;
      e.timer = DARTER.lungeTime;
      e.telegraph = 0;
    }
  } else {
    // lunging
    e.timer -= dt;
    if (e.timer <= 0) {
      e.phase = 0;
      e.timer = DARTER.cadence;
      e.vx *= 0.2;
      e.vy *= 0.2;
    }
  }
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
    const [nx, ny] = norm(p.x - e.x, p.y - e.y);
    const sp = ORBITER.bulletSpeed * e.bulletMul;
    world.spawnBullet(e.x, e.y, nx * sp, ny * sp, 6, '#5beaff', false);
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
    const off = world.rng.range(0, Math.PI * 2);
    const sp = BLOOMER.bulletSpeed * e.bulletMul;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 6, '#ffd23b', false);
    }
  }
}

/** Splitter death → spawn 2 fast mini-splitters. */
export function splitInto(e: Enemy, world: World): void {
  for (let i = 0; i < 2; i++) {
    const child = world.spawnEnemy('mini', e.x, e.y, e.speedMul, e.bulletMul, false);
    if (child) {
      const a = world.rng.range(0, Math.PI * 2);
      child.vx = Math.cos(a) * 120;
      child.vy = Math.sin(a) * 120;
      child.scale = 0.4;
    }
  }
}
