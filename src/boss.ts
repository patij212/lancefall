// The Warden — the mini-boss crescendo. Two alternating attack phases: a
// readable rotating bullet spiral you dash through the gaps of, and aimed fan
// bursts with a rest window that is your damage opening. HP scales each
// appearance. Takes 1 "dash-hit" per dash (one-hit-per-dashId enforced upstream).

import { WARDEN } from './tune';
import { norm } from './vec';
import type { World } from './world';
import type { Enemy } from './types';

export function spawnBoss(world: World, count: number): Enemy | null {
  const e = world.enemies.obtain();
  if (!e) return null;
  const edge = world.edgeSpawn();
  e.kind = 'warden';
  e.x = edge.x;
  e.y = edge.y;
  e.vx = 0;
  e.vy = 0;
  e.hp = e.maxHp = WARDEN.baseHp + count * WARDEN.hpPerInterval;
  e.radius = WARDEN.radius;
  e.color = '#ff3b6b';
  e.baseScore = 0;
  e.timer = WARDEN.phaseDuration;
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
