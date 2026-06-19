import { describe, it, expect } from 'vitest';
import { updatePlayer, resetEvents, type PlayerEvents } from './player';
import { deriveStats } from './perks';
import { TUNE } from './tune';
import type { Player, InputState } from './types';

// TAP-DASH FLOOR (#17-controls). A quick TAP — a press+release that lands between two
// polls and therefore never reaches the held/charging branch — must fire an INSTANT
// minimum dash, not a no-op. The input layer latches that as InputState.dashTapped;
// updatePlayer turns it into a minLen dash on the same frame.

function freshPlayer(): Player {
  return {
    x: 500, y: 500, vx: 0, vy: 0, angle: 0, radius: TUNE.player.radius,
    phase: 'idle', charge: 0, dashTime: 0, dashDuration: 0,
    dashFromX: 0, dashFromY: 0, dashToX: 0, dashToY: 0, dashDirX: 1, dashDirY: 0,
    dashId: 0, killsThisDash: 0, grazesThisDash: 0, perfectThreadFired: false,
    refundThisDash: 0, dashHeavy: false, overcharge: 0, iframe: 0,
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
  const ev: PlayerEvents = { beganCharge: false, dashFired: false, dashLen: 0, landed: false, denied: false };
  resetEvents(ev);
  return ev;
}

const DT = 1 / 60;

describe('tap-dash floor', () => {
  it('a TAP (dashTapped, not held) fires an instant dash in one frame', () => {
    const p = freshPlayer();
    const stats = deriveStats({});
    const ev = freshEvents();
    updatePlayer(p, freshInput({ dashTapped: true }), DT, stats, 1000, 1000, ev);
    expect(p.phase).toBe('dashing'); // fired immediately — no charging frame first
    expect(ev.dashFired).toBe(true);
    expect(p.stamina).toBeLessThan(TUNE.stamina.segments * TUNE.stamina.perSegment); // it cost stamina
  });

  it('the tap dash is the MINIMUM length (a snappy short dash, never a full one)', () => {
    const p = freshPlayer();
    const stats = deriveStats({});
    const ev = freshEvents();
    updatePlayer(p, freshInput({ dashTapped: true }), DT, stats, 1000, 1000, ev);
    // aim is to the right of the player; the dash travels ~minLen (clamped by walls, but
    // there's plenty of room here), so the landing point is near minLen away.
    const travel = Math.hypot(p.dashToX - p.dashFromX, p.dashToY - p.dashFromY);
    expect(travel).toBeCloseTo(TUNE.dash.minLen, 0);
  });

  it('a tap while ALREADY charging (held) is ignored — the charge wins', () => {
    const p = freshPlayer();
    const stats = deriveStats({});
    const ev = freshEvents();
    // first frame: held → enters charging
    updatePlayer(p, freshInput({ dashHeld: true }), DT, stats, 1000, 1000, ev);
    expect(p.phase).toBe('charging');
    const chargeAfterOne = p.charge;
    // second frame: still held, AND a stray tap edge — must keep charging (not snap-fire)
    const ev2 = freshEvents();
    updatePlayer(p, freshInput({ dashHeld: true, dashTapped: true }), DT, stats, 1000, 1000, ev2);
    expect(p.phase).toBe('charging');
    expect(p.charge).toBeGreaterThan(chargeAfterOne); // charge kept ramping
  });

  it('a tap with no stamina does not fire (and does not crash)', () => {
    const p = freshPlayer();
    p.stamina = 0;
    const stats = deriveStats({});
    const ev = freshEvents();
    updatePlayer(p, freshInput({ dashTapped: true }), DT, stats, 1000, 1000, ev);
    expect(p.phase).toBe('idle');
    expect(ev.dashFired).toBe(false);
  });
});

describe('HEAVY LANCE overcharge (hold past full to arm)', () => {
  const stats = deriveStats({});
  function chargeHeld(seconds: number): Player {
    const p = freshPlayer();
    for (let t = 0; t < seconds; t += 1 / 120) {
      updatePlayer(p, freshInput({ dashHeld: true }), 1 / 120, stats, 2000, 2000, freshEvents());
    }
    return p;
  }

  it('holding PAST full charge arms the heavy (+flag and extra i-frames)', () => {
    const p = chargeHeld(TUNE.dash.chargeTimeMax + TUNE.dash.heavyOverchargeTime + 0.05);
    expect(p.charge).toBeCloseTo(1);
    expect(p.overcharge).toBeCloseTo(TUNE.dash.heavyOverchargeTime); // accrued, capped at the window
    updatePlayer(p, freshInput({ dashHeld: false }), 1 / 120, stats, 2000, 2000, freshEvents());
    expect(p.dashHeavy).toBe(true);
    expect(p.iframe).toBeGreaterThan(TUNE.dash.iframeGrace + TUNE.dash.heavyIframeBonus * 0.5); // got the bonus
  });

  it('releasing at full charge withOUT a sustained overcharge is NOT heavy', () => {
    const p = chargeHeld(TUNE.dash.chargeTimeMax + 0.02); // reached full, but no real hold past it
    expect(p.overcharge).toBeLessThan(TUNE.dash.heavyOverchargeTime);
    updatePlayer(p, freshInput({ dashHeld: false }), 1 / 120, stats, 2000, 2000, freshEvents());
    expect(p.dashHeavy).toBe(false);
  });

  it('a quick TAP is never heavy (stale overcharge is cleared before firing)', () => {
    const p = freshPlayer();
    p.overcharge = TUNE.dash.heavyOverchargeTime; // pretend a prior aborted charge left it armed
    updatePlayer(p, freshInput({ dashTapped: true }), 1 / 120, stats, 2000, 2000, freshEvents());
    expect(p.dashHeavy).toBe(false);
  });
});
