// Unified input: keyboard + mouse + gamepad + basic touch → one snapshot per
// frame. Aim is resolved to a world point using the player's position so mouse,
// stick, and touch all feel consistent.

import type { InputState } from './types';

interface GamepadVibration {
  vibrationActuator?: { playEffect(type: string, opts: Record<string, number>): Promise<unknown> };
}

/** Rebindable core actions. Keys are stored lowercased (e.KeyboardEvent.key). Each
 *  action can have more than one bound key; the defaults preserve the historical
 *  bindings so an un-rebound install behaves exactly as before. */
export interface KeyBindings {
  dash: string[];
  overdrive: string[];
  parry: string[];
  pause: string[];
}

export function defaultKeyBindings(): KeyBindings {
  return {
    dash: [' ', 'j'],
    overdrive: ['f', 'shift'],
    parry: ['k'],
    pause: ['escape', 'p'],
  };
}

export class InputManager {
  private keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = false;
  private hasMouse = false;
  private prevDash = false;
  private dashTapEdge = false; // latched on any dash press; survives until the next poll so a sub-frame tap is never dropped
  private pauseEdge = false;
  private overdriveEdge = false;
  private parryEdge = false;
  private selectEdge = -1;
  private menuEdge = 0; // §5 U2 — relative title mode-card nav (-1 left / +1 right); consumed on the title
  private variantEdge = 0; // mode-consolidation — title variant pill flip (-1 up / +1 down)
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

  /** rebindable core-action key map (defaults match the legacy hard-coded keys). */
  keymap: KeyBindings = defaultKeyBindings();

  readonly state: InputState = {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    dashHeld: false,
    dashReleased: false,
    dashTapped: false,
    pausePressed: false,
    overdrivePressed: false,
    parryPressed: false,
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
      // While typing in an editable field (the cipher inputs, name entry, handle box), register NO
      // game input — Space/Enter would otherwise launch the run + eat the keystroke. Let the field
      // handle the key itself (no preventDefault here).
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.anyEdge = true;
      if (this.keymap.pause.includes(k)) this.pauseEdge = true;
      if (this.keymap.overdrive.includes(k)) this.overdriveEdge = true; // OVERDRIVE ultimate
      if (this.keymap.parry.includes(k)) this.parryEdge = true; // PARRY second verb
      if (this.keymap.dash.includes(k)) this.dashTapEdge = true; // latch the tap so a sub-frame press isn't dropped
      if (k === '1') this.selectEdge = 0;
      if (k === '2') this.selectEdge = 1;
      if (k === '3') this.selectEdge = 2;
      if (k === '4') this.selectEdge = 3;
      if (k === '5') this.selectEdge = 4;
      if (k === '6') this.selectEdge = 5;
      if (k === 'arrowleft') this.menuEdge = -1; // §5 U2 — title mode-card nav (ignored mid-run)
      if (k === 'arrowright') this.menuEdge = 1;
      if (k === 'arrowup') this.variantEdge = -1; // title variant pill flip (ignored mid-run)
      if (k === 'arrowdown') this.variantEdge = 1;
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
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // free RMB for PARRY
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.hasMouse = true;
        this.anyEdge = true;
        this.dashTapEdge = true; // a quick click+release between polls still fires a tap-dash
        rectPoint(e.clientX, e.clientY);
      } else if (e.button === 2) {
        this.parryEdge = true; // right-mouse → PARRY
        this.anyEdge = true;
        this.hasMouse = true;
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

    let dashHeld = this.keymap.dash.some((k) => this.keys.has(k)) || this.mouseDown;
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
      if (gp.overdriveEdge) this.overdriveEdge = true;
      if (gp.parryEdge) this.parryEdge = true;
      if (gp.anyEdge) this.anyEdge = true;
    }

    s.aimX = aimX;
    s.aimY = aimY;
    s.dashHeld = dashHeld;
    s.dashReleased = this.prevDash && !dashHeld;
    // TAP-DASH: a press landed since the last poll but the key is no longer held — a
    // quick tap that never reached the held/charging path. The sim fires an instant
    // minimum dash. Only when NOT held (a still-held press becomes a normal charge).
    s.dashTapped = this.dashTapEdge && !dashHeld;
    this.dashTapEdge = false;
    this.prevDash = dashHeld;

    s.pausePressed = this.pauseEdge;
    s.overdrivePressed = this.overdriveEdge;
    s.parryPressed = this.parryEdge;
    s.selectIndex = this.selectEdge;
    s.anyPressed = this.anyEdge;
    this.pauseEdge = false;
    this.overdriveEdge = false;
    this.parryEdge = false;
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
    this.dashTapEdge = false;
    this.moveTouchId = -1;
    this.aimTouchId = -1;
    this.startEdge = false;
    this.confirmEdge = false;
    this.selectEdge = -1;
    this.menuEdge = 0;
    this.variantEdge = 0;
    this.overdriveEdge = false;
    this.parryEdge = false;
  }

  /** Apply a (possibly partial / user-rebound) key map. Each action falls back to its
   *  default when the caller supplies an empty list, so an action can never become
   *  permanently unbound by a bad save. */
  setKeymap(km: Partial<KeyBindings> | undefined | null): void {
    const d = defaultKeyBindings();
    const pick = (v: unknown, def: string[]) =>
      Array.isArray(v) && v.length > 0 && v.every((k) => typeof k === 'string') ? (v as string[]) : def;
    this.keymap = {
      dash: pick(km?.dash, d.dash),
      overdrive: pick(km?.overdrive, d.overdrive),
      parry: pick(km?.parry, d.parry),
      pause: pick(km?.pause, d.pause),
    };
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

  /** Consume the title mode-nav edge (arrows / d-pad left-right): -1, 0, or +1. */
  consumeMenu(): number {
    const v = this.menuEdge;
    this.menuEdge = 0;
    return v;
  }

  /** Consume the title variant-flip edge (arrows up/down): -1, 0, or +1. */
  consumeVariant(): number {
    const v = this.variantEdge;
    this.variantEdge = 0;
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
    | { moveX: number; moveY: number; aimX: number; aimY: number; dash: boolean; pauseEdge: boolean; overdriveEdge: boolean; parryEdge: boolean; anyEdge: boolean }
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
    let overdriveEdge = false;
    let parryEdge = false;
    let anyEdge = false;
    for (let i = 0; i < pad.buttons.length; i++) {
      const pressed = pad.buttons[i]?.pressed ?? false;
      if (pressed && !this.prevGpButtons[i]) {
        anyEdge = true;
        if (i === 9) pauseEdge = true;
        if (i === 1) parryEdge = true; // gamepad B → PARRY
        if (i === 4) overdriveEdge = true; // LB/L1 → OVERDRIVE
        if (i === 0) {
          this.startEdge = true;
          this.confirmEdge = true;
        }
        // d-pad left/right pick the outer perk cards (A picks the middle) AND step the
        // title mode-cards (§5 U2 — consumed in different screens, so no conflict)
        if (i === 14) { this.selectEdge = 0; this.menuEdge = -1; }
        if (i === 15) { this.selectEdge = 2; this.menuEdge = 1; }
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
      overdriveEdge,
      parryEdge,
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
