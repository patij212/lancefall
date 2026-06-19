// THE SOVEREIGN — stateful per-frame update for the 6th & final boss. Pure
// pattern-math + the phase predicates live in ../sovereign.ts (unit-tested);
// this file owns the side-effecting loop + the core/cipher spawn helpers. Split
// out of boss.ts so the dispatch file stays thin (see ../bosses/* siblings).

import { SOVEREIGN, ZONE, ORB } from '../tune';
import { cipherSeed, makeCipher, cipherClassFor } from '../cipher';
import { norm } from '../vec';
import { sovereignFinale, novaSpiralTelegraphFrac } from '../sovereign';
import { zoneTarget, tickReflectableOrb } from './util';
import type { World } from '../world';
import type { Enemy } from '../types';

/** Fire an aimed fan of `n` bullets at the player. */
function fireAimedFan(e: Enemy, world: World, n: number, spread: number, sp: number, color: string): void {
  const p = world.player;
  const base = Math.atan2(p.y - e.y, p.x - e.x);
  const half = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const a = base + (i - half) * spread;
    world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, color, true);
  }
}

/** One full set of NOVA SPIRAL arms at the current angle, advancing the spin. */
function fireSpiralArms(e: Enemy, world: World): void {
  const sp = SOVEREIGN.spiralSpeed;
  for (let i = 0; i < SOVEREIGN.spiralArms; i++) {
    const a = e.angle + (i / SOVEREIGN.spiralArms) * Math.PI * 2;
    world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, SOVEREIGN.color, true);
  }
  e.angle += SOVEREIGN.spiralSpin;
}

/** Seed the Sovereign's orbiting Cores, evenly spaced around the body. */
export function spawnSovereignCores(world: World, boss: Enemy): void {
  for (let i = 0; i < SOVEREIGN.coreCount; i++) {
    const a = (i / SOVEREIGN.coreCount) * Math.PI * 2;
    const c = world.spawnEnemy(
      'sovereign_core',
      boss.x + Math.cos(a) * SOVEREIGN.coreOrbitRadius,
      boss.y + Math.sin(a) * SOVEREIGN.coreOrbitRadius,
      1, 1, false,
    );
    if (c) {
      c.angle = a; // current orbit angle (advances each frame)
      c.phase = i; // orbit index (render variety AND cipher slot)
    }
  }
  // CIPHER-LOCK: the cores become a keypad. The decoded order comes from a stable
  // hash of (seed, bossWave) via a LOCAL generator — shared on a Daily seed and
  // NEVER drawing world.rng, so the scoring stream stays bit-identical.
  world.cipher = makeCipher(SOVEREIGN.coreCount, cipherSeed(world.seed, boss.bossWave * 97 + world.cipherCycle), cipherClassFor(boss.kind));
  world.cipherCycle++; // each re-lock is a fresh code
}

/** Arm a generic cipher RING around a boss: cores at fixed angles (passed
 *  explicitly, so NO world.rng draw) + a fresh cipher from (seed, bossWave). Used
 *  by THE LONGEST DAY; re-armed via the expose window in updateBoss + solveCipher. */
export function spawnCipherRing(world: World, boss: Enemy, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = world.spawnEnemy(
      'sovereign_core',
      boss.x + Math.cos(a) * SOVEREIGN.coreOrbitRadius,
      boss.y + Math.sin(a) * SOVEREIGN.coreOrbitRadius,
      1, 1, false, false, a,
    );
    if (c) {
      c.angle = a;
      c.phase = i;
    }
  }
  boss.cipherExposed = 0;
  world.cipher = makeCipher(n, cipherSeed(world.seed, boss.bossWave * 97 + world.cipherCycle), cipherClassFor(boss.kind));
  world.cipherCycle++; // each re-lock is a fresh code
}

/** Release any Cores still alive when the Sovereign falls (so they don't linger). */
export function cleanupSovereignCores(world: World): void {
  world.enemies.forEachActive((e) => {
    if (e.kind === 'sovereign_core') world.enemies.release(e);
  });
  world.cipher = null; // the master cipher falls with the crown
}

/** How many Cores are still orbiting (0 → crack the crown open). */
export function countSovereignCores(world: World): number {
  let n = 0;
  world.enemies.forEachActive((e) => {
    if (e.kind === 'sovereign_core') n++;
  });
  return n;
}

export function updateSovereign(e: Enemy, world: World, dt: number): void {
  e.spawnTime += dt;
  if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 1.5);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

  // regal drift near arena centre
  const cx = world.width / 2;
  const cy = world.height / 2;
  const tx = cx + Math.cos(e.spawnTime * 0.3) * world.width * 0.12;
  const ty = cy + Math.sin(e.spawnTime * 0.42) * world.height * 0.1;
  // zone the player only while ARMORED — keep the EXPOSE/finale punish windows fair
  const z = ZONE.enabled && e.phase !== 2 && !sovereignFinale(e)
    ? zoneTarget(world.player.x, world.player.y, world.width, world.height, tx, ty, ZONE.bias)
    : { tx, ty };
  const [nx, ny] = norm(z.tx - e.x, z.ty - e.y);
  e.vx = nx * SOVEREIGN.moveSpeed;
  e.vy = ny * SOVEREIGN.moveSpeed;
  e.x += e.vx * dt;
  e.y += e.vy * dt;

  const hpFrac = e.hp / e.maxHp;
  const rate = hpFrac < 0.4 ? 0.82 : 1;
  const finale = sovereignFinale(e);

  if (e.phase === 2) {
    // EXPOSED — the crown is open: body vulnerable. No longer a free DPS check: a
    // slow desperation RING fires alongside the aimed fans, so you dodge WHILE you
    // punish. In the FINALE the armored volleys (spiral) join in — the crescendo.
    e.telegraph = 1;
    e.timer -= dt;

    // aimed fans (the legacy punish-window pressure)
    e.fireTimer -= dt;
    if (e.fireTimer <= 0) {
      if (e.subPhase < SOVEREIGN.fanShots) {
        fireAimedFan(e, world, SOVEREIGN.fanBullets, SOVEREIGN.fanSpread, SOVEREIGN.fanBulletSpeed, SOVEREIGN.coreColor);
        e.subPhase++;
        e.fireTimer = SOVEREIGN.fanGap;
      } else {
        e.subPhase = 0;
        e.fireTimer = SOVEREIGN.fanRest;
      }
    }

    // desperation ring (+ in the finale, a NOVA SPIRAL stream on the same tick)
    if (e.ringTimer === undefined) e.ringTimer = SOVEREIGN.exposeRingEvery;
    e.ringTimer -= dt;
    if (e.ringTimer <= 0) {
      e.ringTimer = SOVEREIGN.exposeRingEvery * (finale ? 1 / SOVEREIGN.finaleFireMul : 1);
      const n = SOVEREIGN.exposeRingBullets, sp = SOVEREIGN.exposeRingSpeed;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + e.angle;
        world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, SOVEREIGN.coreColor, true);
      }
      if (finale) fireSpiralArms(e, world); // "everything at once" — beams stand-in + spiral
      else e.angle += SOVEREIGN.spiralSpin; // keep the ring slowly rotating
    }

    if (e.timer <= 0) {
      if (finale) {
        // FINALE: the crown stops reforming — refresh the window, body stays open.
        e.timer = SOVEREIGN.exposeDuration;
        e.subPhase = 0;
        e.ringTimer = SOVEREIGN.exposeRingEvery;
      } else {
        // crown re-armors: reform the cores and resume the assault
        spawnSovereignCores(world, e);
        e.phase = 0;
        e.timer = SOVEREIGN.phaseDuration;
        e.fireTimer = SOVEREIGN.beamTelegraph;
        e.subPhase = 0;
        e.telegraph = 0;
      }
    }
    return;
  }

  // armored — alternate CROWN BEAMS (phase 0) and NOVA SPIRAL (phase 1)
  tickReflectableOrb(e, world, ORB.sovereign, dt); // lob a parryable orb (curves under the well); EXPOSE stays orb-free
  e.timer -= dt;
  if (e.timer <= 0) {
    e.phase = e.phase === 0 ? 1 : 0;
    e.timer = SOVEREIGN.phaseDuration;
    // phase 1 (spiral) now leads with a fixed tracer wind-up (subPhase 0 = wind-up)
    e.fireTimer = e.phase === 0 ? SOVEREIGN.beamTelegraph : SOVEREIGN.spiralTelegraph;
    e.subPhase = 0;
    e.angle = 0;
  }

  if (e.phase === 0) {
    // CROWN BEAMS — rotating star: telegraph → active → off
    e.angle += SOVEREIGN.beamSpin * dt;
    e.fireTimer -= dt;
    if (e.fireTimer <= 0) {
      if (e.subPhase === 0) { e.subPhase = 1; e.fireTimer = SOVEREIGN.beamActive; }
      else if (e.subPhase === 1) { e.subPhase = 2; e.fireTimer = SOVEREIGN.beamOff; }
      else { e.subPhase = 0; e.fireTimer = SOVEREIGN.beamTelegraph; }
    }
    e.telegraph = e.subPhase === 0 ? 1 - e.fireTimer / SOVEREIGN.beamTelegraph : e.subPhase === 1 ? 1 : 0;
  } else {
    // NOVA SPIRAL — now telegraphs before it fires (subPhase 0 = tracer wind-up,
    // 1 = live). Golden-angle arms, bent by the gravity well in updateBullets.
    e.fireTimer -= dt;
    if (e.subPhase === 0) {
      e.telegraph = novaSpiralTelegraphFrac(e.fireTimer); // tracer ramp 0..1
      if (e.fireTimer <= 0) { e.subPhase = 1; e.fireTimer = 0; }
    } else {
      e.telegraph = 0;
      while (e.fireTimer <= 0) {
        fireSpiralArms(e, world);
        e.fireTimer += SOVEREIGN.spiralEvery * rate;
      }
    }
  }
}
