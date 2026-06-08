// Enemy AI + bullet emission for the 4 archetypes. Each behavior sets the
// enemy's velocity and may emit bullets; a common integrate step applies motion.

import { DARTER, ORBITER, BLOOMER, LANCER, WISP, DRIFTER_TUNE, SHADE_TUNE } from './tune';
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
    case 'lancer':
      lancer(e, world, dt);
      break;
    case 'bomber':
      bomber(e, world, dt);
      break;
    case 'wisp':
      wisp(e, world, dt);
      break;
    case 'drifter':
      drifter(e, world, dt);
      break;
    case 'shade':
      shade(e, world, dt);
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

function lancer(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const sp = 90 * e.speedMul;
  if (e.phase === 0) {
    // hold a standoff, strafing
    if (dist < LANCER.range * 0.85) steerToward(e, e.x - dx, e.y - dy, sp);
    else if (dist > LANCER.range * 1.3) steerToward(e, p.x, p.y, sp);
    else {
      e.vx = (-dy / dist) * sp * 0.8;
      e.vy = (dx / dist) * sp * 0.8;
    }
    e.timer -= dt;
    e.telegraph = 0;
    if (e.timer <= 0) {
      e.phase = 1;
      e.timer = LANCER.lockTime;
      e.angle = Math.atan2(dy, dx); // LOCK the aim now — frozen during telegraph
    }
  } else if (e.phase === 1) {
    e.vx *= 0.15;
    e.vy *= 0.15;
    e.timer -= dt;
    e.telegraph = clamp(1 - e.timer / LANCER.lockTime, 0, 1);
    if (e.timer <= 0) {
      const bs = LANCER.bulletSpeed * e.bulletMul;
      world.spawnBullet(e.x, e.y, Math.cos(e.angle) * bs, Math.sin(e.angle) * bs, 7, '#ffb066', false);
      e.phase = 0;
      e.timer = LANCER.repositionTime;
      e.telegraph = 0;
    }
  }
}

function bomber(e: Enemy, world: World, _dt: number): void {
  const p = world.player;
  steerToward(e, p.x, p.y, 135 * e.speedMul);
  // arm pulse for render when close to the player
  const d2 = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
  e.telegraph = d2 < 150 * 150 ? 1 : 0;
}

function wisp(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  e.angle += 4 * dt;
  const tx = p.x + Math.cos(e.angle) * WISP.wobble;
  const ty = p.y + Math.sin(e.angle) * WISP.wobble;
  steerToward(e, tx, ty, 210 * e.speedMul);
}

function drifter(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const sp = DRIFTER_TUNE.strafeSpeed * e.speedMul;
  if (e.phase === 0) {
    // hold a comfortable standoff, strafing
    if (dist < DRIFTER_TUNE.range * 0.85) steerToward(e, e.x - dx, e.y - dy, sp);
    else if (dist > DRIFTER_TUNE.range * 1.25) steerToward(e, p.x, p.y, sp);
    else {
      e.vx = (-dy / dist) * sp * 0.7;
      e.vy = (dx / dist) * sp * 0.7;
    }
    e.timer -= dt;
    e.telegraph = 0;
    if (e.timer <= 0) {
      e.phase = 1;
      e.timer = DRIFTER_TUNE.lockTime;
      e.angle = Math.atan2(dy, dx); // lock aim now
    }
  } else {
    e.vx *= 0.2;
    e.vy *= 0.2;
    e.timer -= dt;
    e.telegraph = clamp(1 - e.timer / DRIFTER_TUNE.lockTime, 0, 1);
    if (e.timer <= 0) {
      // a 3-bullet arc fan: centre fast, outer slower → curved wavefront
      const base = DRIFTER_TUNE.bulletSpeed * e.bulletMul;
      const a = e.angle;
      const s = DRIFTER_TUNE.arcSpread;
      const o = DRIFTER_TUNE.outerSpeedMul;
      world.spawnBullet(e.x, e.y, Math.cos(a) * base, Math.sin(a) * base, 6, '#34d399', false);
      world.spawnBullet(e.x, e.y, Math.cos(a - s) * base * o, Math.sin(a - s) * base * o, 6, '#34d399', false);
      world.spawnBullet(e.x, e.y, Math.cos(a + s) * base * o, Math.sin(a + s) * base * o, 6, '#34d399', false);
      e.phase = 0;
      e.timer = DRIFTER_TUNE.repositionTime;
      e.telegraph = 0;
    }
  }
}

function shade(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  e.timer -= dt;
  e.telegraph = e.timer < SHADE_TUNE.telegraphTime ? clamp(1 - e.timer / SHADE_TUNE.telegraphTime, 0, 1) : 0;
  if (e.timer <= 0) {
    // blink to a fresh edge angle — threatens from an unexpected direction
    const pt = world.edgeSpawn();
    e.x = pt.x;
    e.y = pt.y;
    e.timer = SHADE_TUNE.blinkCadence;
    e.telegraph = 0;
    e.scale = 0.5; // brief re-materialise pop
  }
  steerToward(e, p.x, p.y, SHADE_TUNE.chaseSpeed * e.speedMul);
  if (e.telegraph > 0) {
    // brace (slow) just before blinking out
    e.vx *= 0.3;
    e.vy *= 0.3;
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
