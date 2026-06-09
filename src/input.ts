// Unified input: keyboard + mouse + gamepad + basic touch → one snapshot per
// frame. Aim is resolved to a world point using the player's position so mouse,
// stick, and touch all feel consistent.

import type { InputState } from './types';

interface GamepadVibration {
  vibrationActuator?: { playEffect(type: string, opts: Record<string, number>): Promise<unknown> };
}

export class InputManager {
  private keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = false;
  private hasMouse = false;
  private prevDash = false;
  private pauseEdge = false;
  private selectEdge = -1;
  private anyEdge = false;
  private restartEdge = false;
  private startEdge = false;
  private confirmEdge = false;

  // touch virtual sticks
  private moveTouchId = -1;
  private moveTX = 0;
  private moveTY = 0;
  private moveTStartX = 0;
  private moveTStartY = 0;
  private aimTouchId = -1;
  private aimTX = 0;
  private aimTY = 0;
  isCoarse = false;

  readonly state: InputState = {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    dashHeld: false,
    dashReleased: false,
    pausePressed: false,
    selectIndex: -1,
    anyPressed: false,
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.isCoarse = matchMediaSafe('(pointer: coarse)');
    this.attach();
  }

  private attach(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.anyEdge = true;
      if (k === 'escape' || k === 'p') this.pauseEdge = true;
      if (k === '1') this.selectEdge = 0;
      if (k === '2') this.selectEdge = 1;
      if (k === '3') this.selectEdge = 2;
      if (k === '4') this.selectEdge = 3;
      if (k === 'r') this.restartEdge = true;
      if (k === ' ' || k === 'enter' || k === 'j') {
        this.startEdge = true;
        this.confirmEdge = true;
      }
      // prevent page scroll on space / arrows
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    const rectPoint = (clientX: number, clientY: number) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouseX = clientX - r.left;
      this.mouseY = clientY - r.top;
    };
    this.canvas.addEventListener('mousemove', (e) => {
      this.hasMouse = true;
      rectPoint(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.hasMouse = true;
        this.anyEdge = true;
        rectPoint(e.clientX, e.clientY);
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });

    // touch
    this.canvas.addEventListener('touchstart', (e) => this.onTouch(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.onTouch(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    this.canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
  }

  private onTouch(e: TouchEvent): void {
    e.preventDefault();
    this.anyEdge = true;
    const r = this.canvas.getBoundingClientRect();
    const mid = r.width / 2;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const x = t.clientX - r.left;
      const y = t.clientY - r.top;
      if (x < mid) {
        if (this.moveTouchId === -1) {
          this.moveTouchId = t.identifier;
          this.moveTStartX = x;
          this.moveTStartY = y;
        }
        if (t.identifier === this.moveTouchId) {
          this.moveTX = x;
          this.moveTY = y;
        }
      } else {
        if (this.aimTouchId === -1) this.aimTouchId = t.identifier;
        if (t.identifier === this.aimTouchId) {
          this.aimTX = x;
          this.aimTY = y;
        }
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.moveTouchId) this.moveTouchId = -1;
      if (t.identifier === this.aimTouchId) {
        this.aimTouchId = -1; // releasing the aim stick drops dashHeld → fires a dash
      }
    }
  }

  /** Sample all sources into the shared snapshot. Call once per frame. */
  poll(playerX: number, playerY: number): InputState {
    const s = this.state;
    s.moveX = 0;
    s.moveY = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) s.moveX -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) s.moveX += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) s.moveY -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) s.moveY += 1;

    let dashHeld = this.keys.has(' ') || this.keys.has('j') || this.mouseDown;
    let aimX = this.hasMouse ? this.mouseX : playerX + 1;
    let aimY = this.hasMouse ? this.mouseY : playerY;

    // touch overrides
    if (this.moveTouchId !== -1) {
      const dx = this.moveTX - this.moveTStartX;
      const dy = this.moveTY - this.moveTStartY;
      const l = Math.hypot(dx, dy);
      if (l > 8) {
        const m = Math.min(1, l / 60);
        s.moveX = (dx / l) * m;
        s.moveY = (dy / l) * m;
      }
    }
    if (this.aimTouchId !== -1) {
      aimX = this.aimTX;
      aimY = this.aimTY;
      dashHeld = true;
    }

    // gamepad
    const gp = this.pollGamepad();
    if (gp) {
      if (Math.hypot(gp.moveX, gp.moveY) > 0.18) {
        s.moveX = gp.moveX;
        s.moveY = gp.moveY;
      }
      if (Math.hypot(gp.aimX, gp.aimY) > 0.25) {
        aimX = playerX + gp.aimX * 300;
        aimY = playerY + gp.aimY * 300;
      }
      if (gp.dash) dashHeld = true;
      if (gp.pauseEdge) this.pauseEdge = true;
      if (gp.anyEdge) this.anyEdge = true;
    }

    s.aimX = aimX;
    s.aimY = aimY;
    s.dashHeld = dashHeld;
    s.dashReleased = this.prevDash && !dashHeld;
    this.prevDash = dashHeld;

    s.pausePressed = this.pauseEdge;
    s.selectIndex = this.selectEdge;
    s.anyPressed = this.anyEdge;
    this.pauseEdge = false;
    this.selectEdge = -1;
    this.anyEdge = false;
    return s;
  }

  /** Drop all currently-held inputs so a fresh run never auto-charges from a
   *  key/button still held down through a restart. */
  clearHeld(): void {
    this.keys.clear();
    this.mouseDown = false;
    this.prevDash = false;
    this.moveTouchId = -1;
    this.aimTouchId = -1;
    this.startEdge = false;
    this.confirmEdge = false;
    this.selectEdge = -1;
  }

  /** Consume the one-shot restart edge (R key). */
  consumeRestart(): boolean {
    const v = this.restartEdge;
    this.restartEdge = false;
    return v;
  }

  /** Consume the start edge (Space/Enter/J or gamepad A) — leaves the title. */
  consumeStart(): boolean {
    const v = this.startEdge;
    this.startEdge = false;
    return v;
  }

  /** Consume a confirm edge (Space/Enter/J or gamepad A). */
  consumeConfirm(): boolean {
    const v = this.confirmEdge;
    this.confirmEdge = false;
    return v;
  }

  private prevGpButtons: boolean[] = [];
  private pollGamepad():
    | { moveX: number; moveY: number; aimX: number; aimY: number; dash: boolean; pauseEdge: boolean; anyEdge: boolean }
    | null {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    let pad: Gamepad | null = null;
    for (const p of pads) if (p) { pad = p; break; }
    if (!pad) return null;
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    const ax = pad.axes;
    const btn = (i: number) => (pad!.buttons[i]?.pressed ?? false);
    const dash = btn(0) || btn(7) || btn(5);
    const start = btn(9);
    let pauseEdge = false;
    let anyEdge = false;
    for (let i = 0; i < pad.buttons.length; i++) {
      const pressed = pad.buttons[i]?.pressed ?? false;
      if (pressed && !this.prevGpButtons[i]) {
        anyEdge = true;
        if (i === 9) pauseEdge = true;
        if (i === 0) {
          this.startEdge = true;
          this.confirmEdge = true;
        }
        // d-pad left/right pick the outer perk cards (A picks the middle)
        if (i === 14) this.selectEdge = 0;
        if (i === 15) this.selectEdge = 2;
      }
      this.prevGpButtons[i] = pressed;
    }
    return {
      moveX: dz(ax[0] ?? 0),
      moveY: dz(ax[1] ?? 0),
      aimX: dz(ax[2] ?? 0),
      aimY: dz(ax[3] ?? 0),
      dash,
      pauseEdge: pauseEdge && start,
      anyEdge,
    };
  }

  /** gamepad rumble toggle (settings) */
  rumbleEnabled = true;

  rumble(strong: number, weak: number, ms: number): void {
    if (!this.rumbleEnabled || !navigator.getGamepads) return;
    for (const p of navigator.getGamepads()) {
      if (!p) continue;
      const act = (p as unknown as GamepadVibration).vibrationActuator;
      if (act?.playEffect) {
        act.playEffect('dual-rumble', {
          duration: ms,
          strongMagnitude: strong,
          weakMagnitude: weak,
        }).catch(() => {});
      }
      break;
    }
  }
}

function matchMediaSafe(q: string): boolean {
  try {
    return window.matchMedia(q).matches;
  } catch {
    return false;
  }
}
