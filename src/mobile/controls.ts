// Touch control overlay for mobile. PURE helpers live at the top (unit-tested); the
// MobileControls class (DOM + listeners) follows. The overlay owns ALL touch on mobile and
// writes a normal InputState — the sim never sees mobile.

import type { InputState } from '../types';
import { applyAssist, type AssistEnemies, type AssistMode } from './assist';
import { el } from '../panels/dom';

/** Resolve a floating stick to a -1..1 vector: neutral within `dead` px of origin, clamped
 *  to magnitude 1 at/after `full` px, linear in between. */
export function resolveStick(
  startX: number,
  startY: number,
  curX: number,
  curY: number,
  dead: number,
  full: number,
): { x: number; y: number } {
  const dx = curX - startX;
  const dy = curY - startY;
  const l = Math.hypot(dx, dy);
  if (l <= dead) return { x: 0, y: 0 };
  const m = Math.min(1, l / full);
  return { x: (dx / l) * m, y: (dy / l) * m };
}

export type DashGesture = 'charging' | 'tap' | 'released';

/** Classify an ENDED lance touch: a quick, near-stationary touch is a tap-dash; anything
 *  longer or that travelled (i.e. the player was aiming) is a charged release. */
export function classifyDash(heldMs: number, movedPx: number, tapMaxMs: number, tapMaxPx: number): DashGesture {
  return heldMs <= tapMaxMs && movedPx <= tapMaxPx ? 'tap' : 'released';
}

export interface MobileOptions {
  mirror: boolean;
  scale: 's' | 'm' | 'l';
  assist: AssistMode;
}

export interface MobileControls {
  setActive(playing: boolean): void;
  setOptions(o: MobileOptions): void;
  /** Fold the live touch state onto the shared InputState. Returns usedStrong for this frame. */
  applyTo(state: InputState, px: number, py: number, enemies: AssistEnemies): boolean;
  /** Show the one-time touch-controls legend (host gates once-ever via save.taught). */
  showTutorial(): void;
  destroy(): void;
}

const DEAD = 9;
const FULL = 64;
const TAP_MS = 160;
const TAP_PX = 12;
const SCALE_PX = { s: 86, m: 104, l: 124 } as const;

export function mountMobileControls(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  opts: MobileOptions,
): MobileControls {
  let options = opts;

  // ── DOM overlay ────────────────────────────────────────────────────────────
  const moveRing = el('div', { class: 'lf-stick lf-move' });
  const lanceRing = el('div', { class: 'lf-stick lf-lance' });
  const moveKnob = el('div', { class: 'lf-knob' });
  const lanceKnob = el('div', { class: 'lf-knob' });
  moveRing.append(moveKnob);
  lanceRing.append(lanceKnob);
  const parryBtn = el('button', { class: 'lf-tbtn lf-parry', type: 'button', 'aria-label': 'Parry' }, 'PARRY');
  const overBtn = el('button', { class: 'lf-tbtn lf-over', type: 'button', 'aria-label': 'Overdrive' }, 'OVER');
  const pauseBtn = el('button', { class: 'lf-tbtn lf-pause', type: 'button', 'aria-label': 'Pause' }, 'II');
  const overlay = el('div', { class: 'lf-touch' }, moveRing, lanceRing, parryBtn, overBtn, pauseBtn);
  applyOptionClasses();
  overlay.style.display = 'none';
  root.appendChild(overlay);

  // Portrait rotate-hint — always present on mobile, shown by CSS ONLY in portrait (kept
  // separate from the play-gated overlay so it covers the title/menus too). Landscape-primary.
  const rotate = el(
    'div',
    { class: 'lf-rotate' },
    el('div', { class: 'lf-rotate-icon' }, '⟳'),
    el('div', { class: 'lf-rotate-title' }, 'ROTATE YOUR DEVICE'),
    el('div', { class: 'lf-rotate-sub' }, 'THE LAST LANCE plays in landscape'),
  );
  root.appendChild(rotate);

  // One-time touch-controls legend (shown on the first mobile run via showTutorial(); the host
  // owns the once-ever gate via save.taught). pointer-events:none so it never blocks play — the
  // first canvas touch (or a timeout) dismisses it.
  const tut = el(
    'div',
    { class: 'lf-tut' },
    el(
      'div',
      { class: 'lf-tut-card' },
      el('div', { class: 'lf-tut-title' }, 'TOUCH CONTROLS'),
      el('div', { class: 'lf-tut-row' }, 'LEFT THUMB — move'),
      el('div', { class: 'lf-tut-row' }, 'RIGHT THUMB — hold to charge · release to lance · tap to dash'),
      el('div', { class: 'lf-tut-row' }, 'PARRY · OVERDRIVE · PAUSE — right-edge buttons'),
      el('div', { class: 'lf-tut-hint' }, 'touch anywhere to begin'),
    ),
  );
  tut.style.display = 'none';
  root.appendChild(tut);
  function dismissTutorial(): void {
    tut.style.display = 'none';
  }

  // ── live touch state ───────────────────────────────────────────────────────
  let moveId = -1,
    moveSX = 0,
    moveSY = 0,
    moveCX = 0,
    moveCY = 0;
  let lanceId = -1,
    lanceSX = 0,
    lanceSY = 0,
    lanceCX = 0,
    lanceCY = 0;
  let lanceDownAt = 0,
    lanceMoved = 0;
  // one-shot edges (consumed in applyTo)
  let tapEdge = false,
    releaseEdge = false;
  let parryEdge = false,
    overEdge = false,
    pauseEdge = false;
  let active = false;

  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

  function rectXY(t: Touch): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  // mirror swaps which half is "move": default move=left, mirror move=right
  function isMoveZone(x: number, w: number): boolean {
    const left = x < w / 2;
    return options.mirror ? !left : left;
  }

  function onStart(e: TouchEvent): void {
    if (!active) return;
    e.preventDefault();
    dismissTutorial(); // the player's first touch clears the legend
    const w = canvas.getBoundingClientRect().width;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const p = rectXY(t);
      if (isMoveZone(p.x, w)) {
        if (moveId === -1) {
          moveId = t.identifier;
          moveSX = moveCX = p.x;
          moveSY = moveCY = p.y;
        }
      } else if (lanceId === -1) {
        lanceId = t.identifier;
        lanceSX = lanceCX = p.x;
        lanceSY = lanceCY = p.y;
        lanceDownAt = now();
        lanceMoved = 0;
      }
    }
    paint();
  }
  function onMove(e: TouchEvent): void {
    if (!active) return;
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const p = rectXY(t);
      if (t.identifier === moveId) {
        moveCX = p.x;
        moveCY = p.y;
      } else if (t.identifier === lanceId) {
        lanceMoved = Math.max(lanceMoved, Math.hypot(p.x - lanceSX, p.y - lanceSY));
        lanceCX = p.x;
        lanceCY = p.y;
      }
    }
    paint();
  }
  function onEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === moveId) moveId = -1;
      else if (t.identifier === lanceId) {
        const g = classifyDash(now() - lanceDownAt, lanceMoved, TAP_MS, TAP_PX);
        if (g === 'tap') tapEdge = true;
        else releaseEdge = true;
        lanceId = -1;
      }
    }
    paint();
  }

  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onEnd, { passive: false });
  canvas.addEventListener('touchcancel', onEnd, { passive: false });

  parryBtn.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      parryEdge = true;
    },
    { passive: false },
  );
  overBtn.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      overEdge = true;
    },
    { passive: false },
  );
  pauseBtn.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      pauseEdge = true;
    },
    { passive: false },
  );

  function paint(): void {
    const s = SCALE_PX[options.scale];
    place(moveRing, moveKnob, moveId !== -1, moveSX, moveSY, moveCX, moveCY, s);
    place(lanceRing, lanceKnob, lanceId !== -1, lanceSX, lanceSY, lanceCX, lanceCY, s);
  }
  function place(
    ring: HTMLElement,
    knob: HTMLElement,
    on: boolean,
    sx: number,
    sy: number,
    cx: number,
    cy: number,
    size: number,
  ): void {
    ring.style.display = on ? 'block' : 'none';
    if (!on) return;
    ring.style.width = ring.style.height = `${size}px`;
    ring.style.left = `${sx - size / 2}px`;
    ring.style.top = `${sy - size / 2}px`;
    const k = resolveStick(sx, sy, cx, cy, DEAD, FULL);
    knob.style.left = `${size / 2 + k.x * (size / 2 - 16) - 16}px`;
    knob.style.top = `${size / 2 + k.y * (size / 2 - 16) - 16}px`;
  }

  function applyOptionClasses(): void {
    overlay.classList.toggle('mirror', options.mirror);
    overlay.dataset.scale = options.scale;
  }

  return {
    setActive(playing: boolean): void {
      active = playing;
      overlay.style.display = playing ? 'block' : 'none';
      if (!playing) {
        moveId = lanceId = -1;
        paint();
      }
    },
    setOptions(o: MobileOptions): void {
      options = o;
      applyOptionClasses();
      paint();
    },
    applyTo(state: InputState, px: number, py: number, enemies: AssistEnemies): boolean {
      // MOVE override (only while a move touch is down)
      if (moveId !== -1) {
        const m = resolveStick(moveSX, moveSY, moveCX, moveCY, DEAD, FULL);
        state.moveX = m.x;
        state.moveY = m.y;
      }
      // LANCE aim + dash
      let usedStrong = false;
      if (lanceId !== -1) {
        // aim toward the stick direction at a fixed reach; charging while held
        const k = resolveStick(lanceSX, lanceSY, lanceCX, lanceCY, DEAD, FULL);
        const len = Math.hypot(k.x, k.y);
        const dirX = len > 0.001 ? k.x / len : 1;
        const dirY = len > 0.001 ? k.y / len : 0;
        let ax = px + dirX * 300,
          ay = py + dirY * 300;
        const a = applyAssist(ax, ay, px, py, enemies, options.assist);
        ax = a.x;
        ay = a.y;
        usedStrong = a.usedStrong;
        state.aimX = ax;
        state.aimY = ay;
        state.dashHeld = true;
      }
      if (tapEdge) {
        state.dashTapped = true;
        tapEdge = false;
      }
      if (releaseEdge) {
        state.dashReleased = true;
        releaseEdge = false;
      }
      // BUTTON edges (OR with whatever poll() set — usually false on mobile)
      if (parryEdge) {
        state.parryPressed = true;
        parryEdge = false;
      }
      if (overEdge) {
        state.overdrivePressed = true;
        overEdge = false;
      }
      if (pauseEdge) {
        state.pausePressed = true;
        pauseEdge = false;
      }
      return usedStrong;
    },
    showTutorial(): void {
      tut.style.display = 'flex';
      try {
        setTimeout(dismissTutorial, 6500); // auto-clear if they read but don't touch
      } catch {
        /* no timers (tests) */
      }
    },
    destroy(): void {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('touchcancel', onEnd);
      overlay.remove();
      rotate.remove();
      tut.remove();
    },
  };
}
