// Player movement + the charge→dash state machine. This is where the whole
// game's feel lives. Pure-ish: it mutates the Player and fills a reusable
// PlayerEvents object; the game turns those events into juice (audio, particles,
// shake). No DOM/audio here.

import { TUNE } from './tune';
import { chargeToLen, dashDuration, iframeFor, canDash, regenStamina, maxStamina } from './dash';
import { clamp, angleDiff, norm } from './vec';
import type { Player, InputState } from './types';
import type { RunStats } from './perks';

export interface PlayerEvents {
  beganCharge: boolean;
  dashFired: boolean;
  dashLen: number;
  landed: boolean;
  denied: boolean;
}

export function resetEvents(ev: PlayerEvents): void {
  ev.beganCharge = false;
  ev.dashFired = false;
  ev.dashLen = 0;
  ev.landed = false;
  ev.denied = false;
}

export function updatePlayer(
  p: Player,
  input: InputState,
  dt: number,
  stats: RunStats,
  width: number,
  height: number,
  ev: PlayerEvents,
): void {
  const max = maxStamina(stats.staminaSegments);

  // Aim toward the input point.
  const aimAngle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  // rotate ship toward aim
  const da = angleDiff(p.angle, aimAngle);
  p.angle += clamp(da, -TUNE.player.turnLerp * dt, TUNE.player.turnLerp * dt);

  if (p.iframe > 0) p.iframe = Math.max(0, p.iframe - dt);
  if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);

  if (p.phase === 'dashing') {
    advanceDash(p, dt, stats, ev);
  } else {
    // ── movement (drift) ──
    const moveMul = p.phase === 'charging' ? TUNE.player.chargeMoveMul : 1;
    const [nx, ny] = norm(input.moveX, input.moveY);
    if (nx !== 0 || ny !== 0) {
      p.vx += nx * stats.accel * moveMul * dt;
      p.vy += ny * stats.accel * moveMul * dt;
    }
    // friction
    const fr = Math.pow(TUNE.player.friction, dt * 60);
    p.vx *= fr;
    p.vy *= fr;
    // clamp speed
    const sp = Math.hypot(p.vx, p.vy);
    const cap = stats.maxSpeed * (p.phase === 'charging' ? TUNE.player.chargeMoveMul : 1.6);
    if (sp > cap) {
      p.vx = (p.vx / sp) * cap;
      p.vy = (p.vy / sp) * cap;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // ── charge / dash input ──
    if (input.dashHeld && canDash(p.stamina, stats.dashCostMul)) {
      if (p.phase !== 'charging') {
        p.phase = 'charging';
        p.charge = 0;
        ev.beganCharge = true;
      }
      p.charge = clamp(p.charge + dt / TUNE.dash.chargeTimeMax, 0, 1);
    } else if (p.phase === 'charging' && !input.dashHeld) {
      // released → fire
      if (canDash(p.stamina, stats.dashCostMul)) {
        fireDash(p, aimAngle, input, stats, width, height, ev);
      } else {
        p.phase = 'idle';
        ev.denied = true;
      }
    } else if (!input.dashHeld) {
      p.phase = 'idle';
    }

    // stamina regen (not while dashing)
    const r = regenStamina(p.stamina, p.regenDelay, dt, max, stats.regenPerSec);
    p.stamina = r.stamina;
    p.regenDelay = r.regenDelay;
  }

  // hard walls
  const rad = p.radius + 4;
  if (p.x < rad) {
    p.x = rad;
    if (p.vx < 0) p.vx = 0;
  } else if (p.x > width - rad) {
    p.x = width - rad;
    if (p.vx > 0) p.vx = 0;
  }
  if (p.y < rad) {
    p.y = rad;
    if (p.vy < 0) p.vy = 0;
  } else if (p.y > height - rad) {
    p.y = height - rad;
    if (p.vy > 0) p.vy = 0;
  }
}

function fireDash(
  p: Player,
  aimAngle: number,
  _input: InputState,
  stats: RunStats,
  width: number,
  height: number,
  ev: PlayerEvents,
): void {
  const len = chargeToLen(p.charge) * stats.dashLenMul;
  const dx = Math.cos(aimAngle);
  const dy = Math.sin(aimAngle);
  p.dashFromX = p.x;
  p.dashFromY = p.y;
  let toX = p.x + dx * len;
  let toY = p.y + dy * len;
  const rad = p.radius + 4;
  toX = clamp(toX, rad, width - rad);
  toY = clamp(toY, rad, height - rad);
  p.dashToX = toX;
  p.dashToY = toY;
  p.dashDirX = dx;
  p.dashDirY = dy;
  p.angle = aimAngle;
  p.phase = 'dashing';
  p.dashTime = 0;
  p.dashDuration = dashDuration(len);
  p.dashId++;
  p.killsThisDash = 0;
  p.iframe = iframeFor(len);
  p.stamina -= TUNE.stamina.dashCost * stats.dashCostMul;
  p.regenDelay = stats.regenDelay; // ship/perks can shorten the post-dash lockout
  p.charge = 0;
  ev.dashFired = true;
  ev.dashLen = len;
}

function advanceDash(p: Player, dt: number, stats: RunStats, ev: PlayerEvents): void {
  p.dashTime += dt;
  const t = clamp(p.dashTime / p.dashDuration, 0, 1);
  p.x = p.dashFromX + (p.dashToX - p.dashFromX) * t;
  p.y = p.dashFromY + (p.dashToY - p.dashFromY) * t;
  if (t >= 1) {
    p.phase = 'idle';
    p.vx = p.dashDirX * TUNE.dash.carrySpeed;
    p.vy = p.dashDirY * TUNE.dash.carrySpeed;
    p.regenDelay = stats.regenDelay;
    ev.landed = true;
  }
}

/** Current dash sub-segment for this step (from previous to current position),
 *  used for swept collision so fast dashes never tunnel. */
export function dashSubSegment(p: Player): { ax: number; ay: number; bx: number; by: number } {
  return { ax: p.dashFromX, ay: p.dashFromY, bx: p.x, by: p.y };
}
