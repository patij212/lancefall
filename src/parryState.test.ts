import { describe, it, expect } from 'vitest';
import { updatePlayer, resetEvents, type PlayerEvents } from './player';
import { deriveStats } from './perks';
import { TUNE } from './tune';
import type { Player, InputState } from './types';

// PARRY player FSM (the second verb). A press opens a short ACTIVE window, then a
// RECOVERY window during which neither dash nor parry may fire (the whiff risk), and
// a COOLDOWN from the press before another parry. Mirrors the dash gate seams.

function freshPlayer(): Player {
  return {
    x: 500, y: 500, vx: 0, vy: 0, angle: 0, radius: TUNE.player.radius,
    phase: 'idle', charge: 0, dashTime: 0, dashDuration: 0,
    dashFromX: 0, dashFromY: 0, dashToX: 0, dashToY: 0, dashDirX: 1, dashDirY: 0,
    dashId: 0, killsThisDash: 0, grazesThisDash: 0, perfectThreadFired: false,
    refundThisDash: 0, dashHeavy: false, overcharge: 0, iframe: 0,
    parryTime: 0, parryCooldown: 0, parryActive: false, parryRewarded: false,
    stamina: TUNE.stamina.segments * TUNE.stamina.perSegment, regenDelay: 0,
    alive: true, hitFlash: 0, shields: 0, maxShields: 0,
  };
}

function freshInput(over: Partial<InputState> = {}): InputState {
  return {
    moveX: 0, moveY: 0, aimX: 600, aimY: 500,
    dashHeld: false, dashReleased: false, dashTapped: false,
    pausePressed: false, overdrivePressed: false, parryPressed: false, selectIndex: -1, anyPressed: false,
    ...over,
  };
}

function freshEvents(): PlayerEvents {
  const ev = {} as PlayerEvents;
  resetEvents(ev);
  return ev;
}

const DT = 1 / 60;

describe('parry FSM', () => {
  it('a parry press opens the active window then enters recovery', () => {
    const p = freshPlayer();
    const stats = deriveStats({});
    const ev = freshEvents();
    updatePlayer(p, freshInput({ parryPressed: true }), DT, stats, 800, 600, ev);
    expect(ev.parryFired).toBe(true);
    expect(p.parryActive).toBe(true);
    expect(p.parryCooldown).toBeGreaterThan(0);
    // advance past the active window — now in recovery, no longer active
    let e2 = freshEvents();
    updatePlayer(p, freshInput(), TUNE.parry.active, stats, 800, 600, e2);
    expect(p.parryActive).toBe(false);
    expect(p.parryTime).toBeGreaterThan(0); // still locked (recovery)
  });

  it('clears parryRewarded at the start of a fresh parry', () => {
    const p = freshPlayer();
    p.parryRewarded = true; // pretend a prior parry already paid out
    const ev = freshEvents();
    updatePlayer(p, freshInput({ parryPressed: true }), DT, deriveStats({}), 800, 600, ev);
    expect(p.parryRewarded).toBe(false);
  });

  it('cannot dash while in the parry lock (active + recovery)', () => {
    const p = freshPlayer();
    const stats = deriveStats({});
    updatePlayer(p, freshInput({ parryPressed: true }), DT, stats, 800, 600, freshEvents());
    // mid-lock: a dash tap must be suppressed
    const ev = freshEvents();
    updatePlayer(p, freshInput({ dashTapped: true }), DT, stats, 800, 600, ev);
    expect(ev.dashFired).toBe(false);
    expect(p.phase).not.toBe('dashing');
  });

  it('cannot re-parry until the cooldown expires', () => {
    const p = freshPlayer();
    const stats = deriveStats({});
    updatePlayer(p, freshInput({ parryPressed: true }), DT, stats, 800, 600, freshEvents());
    // run out the active+recovery lock but stay within the cooldown
    updatePlayer(p, freshInput(), TUNE.parry.active + TUNE.parry.recover, stats, 800, 600, freshEvents());
    expect(p.parryTime).toBe(0); // lock over
    expect(p.parryCooldown).toBeGreaterThan(0); // but still cooling down
    const ev = freshEvents();
    updatePlayer(p, freshInput({ parryPressed: true }), DT, stats, 800, 600, ev);
    expect(ev.parryFired).toBe(false);
  });

  it('does not parry mid-charge', () => {
    const p = freshPlayer();
    p.phase = 'charging';
    const ev = freshEvents();
    updatePlayer(p, freshInput({ parryPressed: true }), DT, deriveStats({}), 800, 600, ev);
    expect(ev.parryFired).toBe(false);
  });
});
