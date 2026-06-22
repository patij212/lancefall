// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { resolveStick, classifyDash, mountMobileControls, type MobileControls } from './controls';
import type { InputState } from '../types';

const noEnemies = { forEachActive() {} };

function mount(): { canvas: HTMLCanvasElement; m: MobileControls } {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON() {} }),
    configurable: true,
  });
  document.body.appendChild(canvas);
  const root = document.createElement('div');
  document.body.appendChild(root);
  const m = mountMobileControls(canvas, root, { mirror: false, scale: 'm', assist: 'off' });
  m.setActive(true);
  return { canvas, m };
}

// Dispatch a touch without relying on the TouchEvent/Touch constructors (happy-dom may lack them).
function fireTouch(canvas: HTMLCanvasElement, type: string, id: number, x: number, y: number, touches?: unknown[]): void {
  const t = { identifier: id, clientX: x, clientY: y, target: canvas };
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'changedTouches', { value: [t] });
  Object.defineProperty(e, 'touches', { value: touches ?? [t] });
  canvas.dispatchEvent(e);
}

// Mirror the per-frame state poll() hands applyTo on mobile: aim defaults to "right of player".
function polledState(px: number, py: number): InputState {
  return { moveX: 0, moveY: 0, aimX: px + 1, aimY: py, dashHeld: false, dashReleased: false, dashTapped: false, pausePressed: false, overdrivePressed: false, parryPressed: false, selectIndex: -1, anyPressed: false };
}

describe('resolveStick', () => {
  it('is neutral inside the deadzone', () => {
    expect(resolveStick(0, 0, 3, 0, 8, 60)).toEqual({ x: 0, y: 0 });
  });
  it('is a unit-ish vector past full', () => {
    const v = resolveStick(0, 0, 120, 0, 8, 60); // way past full → clamped magnitude 1
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
  });
  it('scales linearly between dead and full', () => {
    const v = resolveStick(0, 0, 30, 0, 8, 60); // 30/60 = 0.5 magnitude
    expect(v.x).toBeCloseTo(0.5, 2);
  });
});

describe('classifyDash', () => {
  it('a short, still touch is a tap', () => {
    expect(classifyDash(80, 4, 160, 12)).toBe('tap');
  });
  it('a long hold that ended is a charged release', () => {
    expect(classifyDash(420, 30, 160, 12)).toBe('released');
  });
  it('a short but far-travelled touch is a release (it aimed), not a tap', () => {
    expect(classifyDash(90, 40, 160, 12)).toBe('released');
  });
});

describe('lance dash aims in the stick direction (regression: always dashed right)', () => {
  const px = 400, py = 200;

  it('a held-then-released DOWN drag dashes DOWN, not toward the default-right aim', () => {
    const { canvas, m } = mount();
    fireTouch(canvas, 'touchstart', 1, 650, 140); // right zone = lance
    fireTouch(canvas, 'touchmove', 1, 650, 300); // drag straight down (+y)
    fireTouch(canvas, 'touchend', 1, 650, 300, []);
    const s = polledState(px, py);
    m.applyTo(s, px, py, noEnemies); // the frame the dash fires
    expect(s.dashReleased).toBe(true);
    expect(s.aimY - py).toBeGreaterThan(50); // aims DOWN
    expect(Math.abs(s.aimX - px)).toBeLessThan(40); // NOT right
  });

  it('a held-then-released UP-LEFT drag dashes up-left', () => {
    const { canvas, m } = mount();
    fireTouch(canvas, 'touchstart', 1, 650, 240);
    fireTouch(canvas, 'touchmove', 1, 560, 150); // up (-y) and left (-x)
    fireTouch(canvas, 'touchend', 1, 560, 150, []);
    const s = polledState(px, py);
    m.applyTo(s, px, py, noEnemies);
    expect(s.dashReleased).toBe(true);
    expect(s.aimX - px).toBeLessThan(0); // left
    expect(s.aimY - py).toBeLessThan(0); // up
  });

  it('a quick tap with no lance drag dashes toward the move direction', () => {
    const { canvas, m } = mount();
    // move stick: left zone, drag UP so the player is heading up
    fireTouch(canvas, 'touchstart', 9, 150, 250);
    fireTouch(canvas, 'touchmove', 9, 150, 150, [{ identifier: 9, clientX: 150, clientY: 150, target: canvas }]);
    // lance: a quick tap with no drag (right zone)
    fireTouch(canvas, 'touchstart', 1, 650, 200, [{ identifier: 9, clientX: 150, clientY: 150, target: canvas }, { identifier: 1, clientX: 650, clientY: 200, target: canvas }]);
    fireTouch(canvas, 'touchend', 1, 650, 200, [{ identifier: 9, clientX: 150, clientY: 150, target: canvas }]);
    const s = polledState(px, py);
    m.applyTo(s, px, py, noEnemies);
    expect(s.dashTapped).toBe(true);
    expect(s.aimY - py).toBeLessThan(0); // dashes UP, where the move stick points
  });
});
