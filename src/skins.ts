// Cosmetic enemy SKINS — per-kind, per-rarity reskins of the biomech enemy art.
// Purely cosmetic: a skin restyles the INTERIOR detailing of an enemy while
// PRESERVING two hard guardrails so gameplay reads are never lost —
//   1. the shape-coded SILHOUETTE (Clarity / colourblind shape-coding), and
//   2. a constant neon THREAT-RIM (the bright body outline that survives the
//      COHERENCE desaturation wash; see render.ts §7b).
// Skins NEVER touch sim / hitbox / rng / scoring. They are looked up at draw
// time from the equipped-skin map and drawn through a single uniform signature
// so Phase 2 can bulk-port the remaining kinds by copy.
//
// ── THE CONTRACT (Phase 2 copies this) ─────────────────────────────────────
//   type SkinDraw = (ctx, e, r, c: SkinCtx) => void
//   SkinCtx = { rimColor; flash; opts; lod; t }   (everything the biomech draws
//             use, PLUS the LOD tier and a wall-clock time `t` in seconds).
//   The caller (render.ts drawEnemy) has ALREADY: drawn the glow + (elite) aura,
//   translated the ctx to the enemy centre, set lineWidth, strokeStyle=rimColor
//   and fillStyle=dark carapace. A SkinDraw therefore draws centred at (0,0).
//
// ── LOD MODEL (the perf lever) ──────────────────────────────────────────────
//   'full' — gallery detail: all bloom (shadowBlur), sub-pixel strokes, motes.
//            Used for bosses / big / low-count enemies.
//   'mid'  — the in-game default (~24px among many): shadowBlur capped (≤4),
//            sub-pixel flourishes dropped, but silhouette + core + threat-rim
//            kept. This is where 90% of frames live.
//   'far'  — tiny / very-many: GLYPH ONLY (silhouette + core), shadowBlur 0,
//            NO additive glow. The cheapest possible read.
// `lodBlur(c, want)` is the one place blur is gated; `c.lod==='far'` skips glow
// gradients entirely.

import type { EnemyKind, Enemy } from './types';
import type { RenderOpts } from './render';

export type SkinRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Lod = 'full' | 'mid' | 'far';

/** Everything a skin draw needs beyond (ctx, e, r): the constant threat-rim
 *  colour, the white hit-flash flag, the render options (a11y), the LOD tier,
 *  and a wall-clock time in seconds (drives the gallery's sin() breathing). */
export interface SkinCtx {
  rimColor: string;
  flash: boolean;
  opts: RenderOpts;
  lod: Lod;
  t: number;
}

export type SkinDraw = (ctx: CanvasRenderingContext2D, e: Enemy, r: number, c: SkinCtx) => void;

export interface SkinDef {
  id: string;
  kind: EnemyKind;
  rarity: SkinRarity;
  /** human label for the picker */
  name: string;
  /** achievement id required to unlock; null = free (the kind's baseline) */
  unlockAch: string | null;
  draw: SkinDraw;
}

// ── tier → achievement gate (mirrors trails.ts + BIOMECH_HANDOFF.md) ────────
// Common = free; Rare = survivor (wave 10); Epic = gauntlet (win Arena);
// Legendary = regicide (kill the Sovereign). Unlocks derive from
// save.achievements (no separate unlockedSkins field — like canUnlockTrail).
const TIER_ACH: Record<SkinRarity, string | null> = {
  common: null,
  rare: 'survivor',
  epic: 'gauntlet',
  legendary: 'regicide',
};

// ── pure ctx helpers (extracted verbatim-in-spirit from the gallery) ────────
/** rgba() from a #rrggbb hex + alpha. */
function rgba(hex: string, a: number): string {
  const rv = parseInt(hex.slice(1, 3), 16);
  const gv = parseInt(hex.slice(3, 5), 16);
  const bv = parseInt(hex.slice(5, 7), 16);
  return `rgba(${rv},${gv},${bv},${a})`;
}

/** Trace a regular n-gon of radius r at the origin (caller fills/strokes). */
function ngon(ctx: CanvasRenderingContext2D, n: number, r: number, rot = 0): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Additive radial bloom at the origin. Skipped entirely at 'far' LOD (the
 *  single biggest fill-rate cost when many enemies are on screen). */
function glow(ctx: CanvasRenderingContext2D, c: SkinCtx, r: number, hex: string, a = 0.5): void {
  // 'far' is the perf cut: no additive bloom when many enemies are on screen.
  // (reduceMotion never disables glow — it's brightness, not motion.)
  if (c.lod === 'far') return;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, rgba(hex, a));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Gated shadowBlur: returns the blur to use given the LOD. 'full' = as asked,
 *  'mid' = capped at 4, 'far' = 0. The ONE place per-skin bloom is shed. */
function lodBlur(c: SkinCtx, want: number): number {
  if (c.lod === 'far') return 0;
  if (c.lod === 'mid') return Math.min(want, 4);
  return want;
}

/** The breathing time for sin() pulses. Frozen under reduceMotion (a11y) so a
 *  skin never strobes; otherwise the live wall-clock seconds. */
function bt(c: SkinCtx): number {
  return c.opts.reduceMotion ? 1.2 : c.t;
}

/** Set up the per-kind transform: scale the native-radius gallery design to the
 *  live enemy radius. Each hero design was authored at a fixed native `r`
 *  (`nativeR`); scaling by `r / nativeR` fits it to the in-game body while
 *  keeping every internal proportion. Returns the design-space radius to use. */
function fit(ctx: CanvasRenderingContext2D, r: number, nativeR: number): number {
  const s = r / nativeR;
  ctx.scale(s, s);
  return nativeR;
}

// ── DARTER (#0ba4a9 teal — arrowhead, concave back) ─────────────────────────
// NativeR 28–30. Silhouette: forward arrowhead. Threat-rim: the body outline.
const darterCommon: SkinDraw = (ctx, e, r, c) => {
  ctx.rotate(Math.atan2(e.vy, e.vx) || 0);
  const R = fit(ctx, r, 30);
  const col = e.color;
  const acc = '#a0ffff';
  const t = bt(c);
  const fl = c.opts.reduceMotion ? 0 : Math.sin(t * 3) * 0.13;
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 4);
  glow(ctx, c, R * 3, col, 0.35);
  // twin swept fins (legacy arrowhead halves, hinged)
  ctx.fillStyle = '#06201f';
  ctx.strokeStyle = rgba(acc, 0.85);
  ctx.lineWidth = 1.6;
  ctx.save();
  ctx.rotate(fl);
  ctx.beginPath();
  ctx.moveTo(R * 1.5, 0);
  ctx.lineTo(-R * 0.5, -R * 0.9);
  ctx.quadraticCurveTo(-R * 1.05, -R * 0.4, -R * 0.2, -R * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.rotate(-fl);
  ctx.beginPath();
  ctx.moveTo(R * 1.5, 0);
  ctx.lineTo(-R * 0.5, R * 0.9);
  ctx.quadraticCurveTo(-R * 1.05, R * 0.4, -R * 0.2, R * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // central arrowhead body — THREAT-RIM outline (rimColor) preserves the read
  ctx.fillStyle = c.flash ? '#ffffff' : '#081e24';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(R * 1.6, 0);
  ctx.lineTo(-R * 0.4, R * 0.34);
  ctx.lineTo(-R * 0.7, 0);
  ctx.lineTo(-R * 0.4, -R * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.save();
    ctx.strokeStyle = rgba(col, 0.85);
    ctx.lineWidth = 1.5;
    ctx.shadowColor = col;
    ctx.shadowBlur = lodBlur(c, 6);
    ctx.beginPath();
    ctx.moveTo(-R * 0.5, 0);
    ctx.lineTo(R * 1.4, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  // core
  ctx.fillStyle = rgba(col, 0.7);
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 12 * pp;
  }
  ctx.beginPath();
  ctx.arc(-R * 0.7, 0, R * 0.13 * pp + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

const darterRare: SkinDraw = (ctx, e, r, c) => {
  ctx.rotate(Math.atan2(e.vy, e.vx) || 0);
  const R = fit(ctx, r, 28);
  const col = e.color;
  const acc = '#a0ffff';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 4);
  glow(ctx, c, R * 3, col, 0.35);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(col, 0.28);
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(-R * 0.8 - k * R * 0.45, 0);
      ctx.lineTo(-R * 1.5 - k * R * 0.55, 0);
      ctx.stroke();
    }
  }
  // double-wing arrowhead — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#06201f';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(R * 1.5, 0);
  ctx.lineTo(-R * 0.6, -R * 0.8);
  ctx.lineTo(-R * 0.1, -R * 0.16);
  ctx.lineTo(R * 0.2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(R * 1.5, 0);
  ctx.lineTo(-R * 0.6, R * 0.8);
  ctx.lineTo(-R * 0.1, R * 0.16);
  ctx.lineTo(R * 0.2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#071820';
  ctx.strokeStyle = acc;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(R * 0.5, 0, R * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 10 * pp;
  }
  ctx.beginPath();
  ctx.arc(R * 0.5, 0, R * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

const darterEpic: SkinDraw = (ctx, e, r, c) => {
  ctx.rotate(Math.atan2(e.vy, e.vx) || 0);
  const R = fit(ctx, r, 28);
  const col = e.color;
  const acc = '#a0ffff';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 4);
  const th = c.opts.reduceMotion ? 0 : Math.sin(t * 6) * 0.06;
  glow(ctx, c, R * 3, col, 0.35);
  // stacked echo-arrowheads — the lead one carries the threat-rim
  for (let k = 0; k < 3; k++) {
    const sc = 1 - k * 0.22;
    const ox = -k * R * 0.35;
    ctx.fillStyle = c.flash ? '#ffffff' : '#081e24';
    ctx.strokeStyle = k === 0 ? c.rimColor : rgba(acc, 0.85 - k * 0.2);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ox + R * 1.5 * sc, 0);
    ctx.lineTo(ox - R * 0.2 * sc, -R * 0.7 * sc);
    ctx.lineTo(ox + R * 0.2 * sc, 0);
    ctx.lineTo(ox - R * 0.2 * sc, R * 0.7 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (c.lod === 'far') break; // glyph only — lead arrowhead is enough to read
  }
  if (c.lod !== 'far') {
    ctx.save();
    ctx.rotate(th);
    ctx.strokeStyle = rgba(col, 0.6);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-R * 0.9, -R * 0.5);
    ctx.moveTo(0, 0);
    ctx.lineTo(-R * 0.9, R * 0.5);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 12 * pp;
  }
  ctx.beginPath();
  ctx.arc(R * 1.5, 0, R * 0.12 * pp + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(R * 0.2, 0, R * 0.07, 0, Math.PI * 2);
  ctx.fill();
};

// LEGENDARY = the recovered Proposal-B drawB_Darter (manta-skate)
const darterLegendary: SkinDraw = (ctx, e, r, c) => {
  ctx.rotate(Math.atan2(e.vy, e.vx) || 0);
  const R = fit(ctx, r, 28);
  const col = e.color;
  const acc = '#a0ffff';
  glow(ctx, c, R * 3, col, 0.35);
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(R * 0.85, 0);
  ctx.lineTo(-R * 0.62, R * 0.72);
  ctx.lineTo(-R * 0.12, R * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(R * 0.85, 0);
  ctx.lineTo(-R * 0.62, -R * 0.72);
  ctx.lineTo(-R * 0.12, -R * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.strokeStyle = acc;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(R * 0.9, 0);
  ctx.lineTo(-R * 0.7, R * 0.75);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(R * 0.9, 0);
  ctx.lineTo(-R * 0.7, -R * 0.75);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(R * 0.9, 0);
  ctx.lineTo(-R * 0.45, 0);
  ctx.stroke();
  // forward dart head — THREAT-RIM outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#081e24';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(R * 1.52, 0);
  ctx.lineTo(R * 0.52, R * 0.28);
  ctx.lineTo(R * 0.18, 0);
  ctx.lineTo(R * 0.52, -R * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.save();
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = acc;
    ctx.shadowBlur = lodBlur(c, 8);
    ctx.beginPath();
    ctx.moveTo(-R * 0.1, 0);
    ctx.lineTo(R * 0.9, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.65, 0);
    ctx.lineTo(R * 1.2, R * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.65, 0);
    ctx.lineTo(R * 1.2, -R * 0.12);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  ctx.fillStyle = '#071820';
  ctx.strokeStyle = acc;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(R * 1.12, 0, R * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (c.lod === 'full') {
    for (let k = 0; k < 3; k++) {
      const sa = (k / 3) * Math.PI * 2 - Math.PI / 2;
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.arc(R * 1.12 + Math.cos(sa) * R * 0.17, Math.sin(sa) * R * 0.17, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = rgba(col, 0.7);
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
  }
  ctx.beginPath();
  ctx.arc(-R * 0.48, 0, R * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

// ── ORBITER (#34d399 green — hexagon ring) ──────────────────────────────────
const orbiterCommon: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 30);
  const col = e.color;
  const acc = '#a0ffe8';
  const t = bt(c);
  const op = c.opts.reduceMotion ? 0.25 : 0.15 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2));
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 4);
  glow(ctx, c, R * 3, col, 0.35);
  // hex armour wedges — first wedge stroke = rimColor to anchor the read
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2 + 0.12;
    const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2 - 0.12;
    const ir = R * 0.62;
    ctx.fillStyle = c.flash ? '#ffffff' : '#071e14';
    ctx.strokeStyle = i === 0 ? c.rimColor : rgba(acc, 0.8);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * ir, Math.sin(a0) * ir);
    ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
    ctx.arc(0, 0, R, a0, a1);
    ctx.lineTo(Math.cos(a1) * ir, Math.sin(a1) * ir);
    ctx.arc(0, 0, ir, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (c.lod !== 'far') {
      const ma = (a0 + a1) / 2;
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.arc(Math.cos(ma) * R * 0.95, Math.sin(ma) * R * 0.95, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (c.lod !== 'far') {
    ctx.save();
    ctx.rotate(c.opts.reduceMotion ? 0 : t * 0.4);
    for (let k = 0; k < 6; k++) {
      ctx.rotate((Math.PI * 2) / 6);
      ctx.fillStyle = '#0a2a1e';
      ctx.strokeStyle = rgba(acc, 0.7);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(R * 0.5, 0);
      ctx.lineTo(R * 0.18 + R * 0.3 * op, -R * 0.22);
      ctx.lineTo(R * 0.18 + R * 0.3 * op, R * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 12 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.16 * (1.4 - op), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.06, 0, Math.PI * 2);
  ctx.fill();
};

const orbiterRare: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 30);
  const col = e.color;
  const acc = '#a0ffe8';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 3.5);
  glow(ctx, c, R * 3, col, 0.35);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(col, 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2);
    ctx.stroke();
  }
  // hex core body — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#071e14';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ngon(ctx, 6, R * 0.5, c.opts.reduceMotion ? 0 : t * 0.2);
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(col, 0.6);
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) {
      const va = (k / 6) * Math.PI * 2 + (c.opts.reduceMotion ? 0 : t * 0.2);
      ctx.beginPath();
      ctx.moveTo(Math.cos(va) * R * 0.22, Math.sin(va) * R * 0.22);
      ctx.lineTo(Math.cos(va) * R * 0.48, Math.sin(va) * R * 0.48);
      ctx.stroke();
    }
    ctx.save();
    ctx.rotate(c.opts.reduceMotion ? 0 : t * 0.8);
    for (let k = 0; k < 3; k++) {
      const da = (k / 3) * Math.PI * 2;
      const dx = Math.cos(da) * R * 0.92;
      const dy = Math.sin(da) * R * 0.92;
      ctx.fillStyle = '#0a2a1e';
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(dx, dy, R * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(dx, dy, R * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 12 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.08, 0, Math.PI * 2);
  ctx.fill();
};

const orbiterEpic: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 30);
  const col = e.color;
  const acc = '#a0ffe8';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 3.5);
  glow(ctx, c, R * 3, col, 0.35);
  // hex silhouette outline — rimColor
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.4;
  ngon(ctx, 6, R, 0);
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.save();
    ctx.rotate(c.opts.reduceMotion ? 0 : t * 0.6);
    ctx.strokeStyle = rgba(col, 0.8);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.85, R * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.rotate((c.opts.reduceMotion ? 0 : -t * 0.45) + Math.PI / 2);
    ctx.strokeStyle = rgba(acc, 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.78, R * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    for (let k = 0; k < 6; k++) {
      const va = (k / 6) * Math.PI * 2 - Math.PI / 2;
      ctx.fillStyle = rgba(col, 0.7);
      ctx.beginPath();
      ctx.arc(Math.cos(va) * R, Math.sin(va) * R, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#071e14';
  ctx.strokeStyle = acc;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 12 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.06, 0, Math.PI * 2);
  ctx.fill();
};

// LEGENDARY = Proposal-B drawB_Orbiter (lit hex carapace, spoked sensors)
const orbiterLegendary: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 30);
  const col = e.color;
  const acc = '#a0ffe8';
  const t = bt(c);
  const p = c.opts.reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 3.5);
  glow(ctx, c, R * 3, col, 0.35);
  if (c.lod !== 'far') {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#092218';
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.shadowColor = col;
    ctx.shadowBlur = lodBlur(c, 14);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.42 * p, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2 + 0.1;
    const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2 - 0.1;
    const ir = R * 0.44;
    ctx.fillStyle = c.flash ? '#ffffff' : '#071e14';
    ctx.strokeStyle = i === 0 ? c.rimColor : acc;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * ir, Math.sin(a0) * ir);
    ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
    ctx.arc(0, 0, R, a0, a1);
    ctx.lineTo(Math.cos(a1) * ir, Math.sin(a1) * ir);
    ctx.arc(0, 0, ir, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (c.lod === 'far') continue;
    const ma = (a0 + a1) / 2;
    if (c.lod === 'full') {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = col;
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ma) * R * 0.5, Math.sin(ma) * R * 0.5);
      ctx.lineTo(Math.cos(ma) * R * 0.82, Math.sin(ma) * R * 0.82);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.arc(Math.cos(ma) * R * 0.92, Math.sin(ma) * R * 0.92, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
};

// ── LANCER (#ff8a3b orange — railgun barrel) ────────────────────────────────
// Silhouette: an elongated forward barrel. Keeps the legacy LOCK aim-line tell.
function lancerAimLine(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
  const tele = e.telegraph || 0;
  if (tele <= 0) return;
  ctx.save();
  ctx.rotate(e.angle);
  ctx.strokeStyle = `rgba(255,160,80,${0.18 + 0.55 * tele})`;
  ctx.lineWidth = 1.5 + 2.5 * tele;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(1600, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

const lancerCommon: SkinDraw = (ctx, e, r, c) => {
  lancerAimLine(ctx, e, r);
  ctx.rotate((e.telegraph || 0) > 0 ? e.angle : Math.atan2(e.vy, e.vx) || 0);
  const R = fit(ctx, r, 24);
  const col = e.color;
  const acc = '#ffd5a0';
  const t = bt(c);
  const gl = c.opts.reduceMotion ? 1 : 0.5 + 0.5 * Math.sin(t * 5);
  glow(ctx, c, R * 3, col, 0.35);
  ctx.fillStyle = '#180800';
  ctx.strokeStyle = rgba(acc, 0.7);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-R * 0.7, -R * 0.5);
  ctx.lineTo(-R * 1.2, -R * 0.9);
  ctx.lineTo(-R * 1.0, 0);
  ctx.lineTo(-R * 1.2, R * 0.9);
  ctx.lineTo(-R * 0.7, R * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // barrel body — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#1a0a00';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.rect(-R * 0.7, -R * 0.34, R * 2.6, R * 0.68);
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    for (let k = 0; k < 4; k++) {
      const cx2 = -R * 0.4 + k * R * 0.6;
      ctx.strokeStyle = rgba(col, 0.4 + 0.5 * Math.abs(Math.sin((c.opts.reduceMotion ? 0 : t * 5) - k * 0.6)));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx2, -R * 0.42);
      ctx.lineTo(cx2, R * 0.42);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#050200';
  ctx.strokeStyle = acc;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(-R * 0.4, 0, R * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(-R * 0.4, 0, R * 0.09, 0, Math.PI * 2);
  ctx.fill();
  // muzzle charge node
  ctx.fillStyle = rgba(col, 0.85);
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 14 * gl;
  }
  ctx.beginPath();
  ctx.arc(R * 1.9, 0, R * 0.13 * gl + R * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

const lancerRare: SkinDraw = (ctx, e, r, c) => {
  lancerAimLine(ctx, e, r);
  ctx.rotate((e.telegraph || 0) > 0 ? e.angle : Math.atan2(e.vy, e.vx) || 0);
  const R = fit(ctx, r, 24);
  const col = e.color;
  const acc = '#ffd5a0';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 4);
  glow(ctx, c, R * 3, col, 0.35);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.7);
    ctx.lineWidth = 2;
    const legs: [number, number][] = [[-R * 0.3, R * 0.95], [-R * 0.95, R * 0.7], [R * 0.35, R * 1.0]];
    for (const [lx, ly] of legs) {
      ctx.beginPath();
      ctx.moveTo(-R * 0.1, R * 0.15);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.arc(lx, ly, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // ovoid body + barrel — rimColor on the barrel (the threat read is the muzzle)
  ctx.fillStyle = c.flash ? '#ffffff' : '#1a0a00';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(-R * 0.1, 0, R * 0.55, R * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = c.flash ? '#ffffff' : '#180800';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.rect(R * 0.4, -R * 0.12, R * 2.0, R * 0.24);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#050200';
  ctx.strokeStyle = acc;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(-R * 0.1, -R * 0.05, R * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 10 * pp;
  }
  ctx.beginPath();
  ctx.arc(-R * 0.1, -R * 0.05, R * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = rgba(col, 0.85);
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 8 * pp;
  }
  ctx.beginPath();
  ctx.arc(R * 2.4, 0, R * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

const lancerEpic: SkinDraw = (ctx, e, r, c) => {
  lancerAimLine(ctx, e, r);
  ctx.rotate((e.telegraph || 0) > 0 ? e.angle : Math.atan2(e.vy, e.vx) || 0);
  const R = fit(ctx, r, 24);
  const col = e.color;
  const acc = '#ffd5a0';
  const t = bt(c);
  const fl = c.opts.reduceMotion ? 1 : 0.5 + 0.5 * Math.sin(t * 6);
  glow(ctx, c, R * 3, col, 0.35);
  // turret body — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#1a0a00';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.rect(-R * 0.9, -R * 0.55, R * 1.4, R * 1.1);
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.fillStyle = '#180800';
    ctx.strokeStyle = rgba(acc, 0.7);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-R * 0.4, -R * 0.55);
    ctx.lineTo(-R * 0.1, -R * 1.0);
    ctx.lineTo(R * 0.2, -R * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  for (let s = -1; s <= 1; s += 2) {
    ctx.fillStyle = c.flash ? '#ffffff' : '#180800';
    ctx.strokeStyle = c.rimColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.rect(R * 0.45, s * R * 0.28 - R * 0.13, R * 1.5, R * 0.26);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba(col, 0.7 + 0.25 * (c.opts.reduceMotion ? 0 : Math.sin(t * 5)));
    if (c.lod === 'full') {
      ctx.shadowColor = col;
      ctx.shadowBlur = 10 * fl;
    }
    ctx.beginPath();
    ctx.arc(R * 1.95, s * R * 0.28, R * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 10;
  }
  ctx.beginPath();
  ctx.arc(-R * 0.3, 0, R * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-R * 0.3, 0, R * 0.06, 0, Math.PI * 2);
  ctx.fill();
};

// LEGENDARY = Proposal-B drawB_Lancer (segmented railgun)
const lancerLegendary: SkinDraw = (ctx, e, r, c) => {
  lancerAimLine(ctx, e, r);
  ctx.rotate((e.telegraph || 0) > 0 ? e.angle : Math.atan2(e.vy, e.vx) || 0);
  const R = fit(ctx, r, 26);
  const col = e.color;
  const acc = '#ffd5a0';
  const t = bt(c);
  glow(ctx, c, R * 3, col, 0.35);
  // breech block — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#180800';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(-R * 0.7, -R * 0.42, R * 1.85, R * 0.84);
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.45);
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const bx = -R * 0.55 + k * R * 0.56;
      ctx.beginPath();
      ctx.moveTo(bx, -R * 0.42);
      ctx.lineTo(bx, R * 0.42);
      ctx.stroke();
    }
  }
  // barrel — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#0d0400';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(R * 0.65, -R * 0.19, R * 1.55, R * 0.38);
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(col, 0.7 + 0.25 * (c.opts.reduceMotion ? 0 : Math.sin(t * 5)));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(R * 2.2, 0, R * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(R * 2.2, 0, R * 0.1, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = -1; k <= 1; k++) {
      ctx.fillStyle = '#050200';
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(R * 0.38, k * R * 0.2, R * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(R * 0.38, k * R * 0.2, R * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    if (c.lod === 'full') {
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = 0.42 - k * 0.12;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(-R * 0.7, 0, R * (0.3 + k * 0.14), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = col;
    ctx.shadowBlur = lodBlur(c, 6);
    ctx.beginPath();
    ctx.moveTo(-R * 0.55, 0);
    ctx.lineTo(R * 0.78, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }
};

// ── SEEKER (#e879f9 magenta — ringed eye) ───────────────────────────────────
// Silhouette must stay circular (Seeker = eye). Keeps the legacy lock-on line.
function seekerAimLine(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
  const tele = e.telegraph || 0;
  if (tele <= 0) return;
  ctx.save();
  ctx.rotate(e.angle);
  ctx.strokeStyle = `rgba(232,121,249,${0.18 + 0.5 * tele})`;
  ctx.lineWidth = 1.5 + 2 * tele;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(900, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

const seekerCommon: SkinDraw = (ctx, e, r, c) => {
  seekerAimLine(ctx, e, r);
  const R = fit(ctx, r, 28);
  const col = e.color;
  const acc = '#f5b0ff';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 4);
  glow(ctx, c, R * 3, col, 0.38);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.75);
    ctx.lineWidth = 1.3;
    const ant: [number, number][] = [[-R * 0.4, -R * 1.9], [R * 0.1, -R * 2.1], [R * 0.5, -R * 1.8]];
    for (let k = 0; k < 3; k++) {
      const ax = ant[k][0] + (c.opts.reduceMotion ? 0 : Math.sin(t * 1.5 + k) * 3);
      const ay = ant[k][1];
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.6);
      ctx.quadraticCurveTo(ax * 0.5, -R * 1.2, ax, ay);
      ctx.stroke();
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.arc(ax, ay, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // circular eye body — rimColor outline (keeps the eye silhouette read)
  ctx.fillStyle = c.flash ? '#ffffff' : '#160018';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.save();
    ctx.translate(0, R * 0.15);
    ctx.rotate(c.opts.reduceMotion ? 0 : t * 1.2);
    ctx.strokeStyle = rgba(acc, 0.5);
    ctx.lineWidth = 1.4;
    for (let k = 0; k < 4; k++) {
      const ra = (k / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.62, ra, ra + 0.7);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(0, R * 0.15);
    ctx.rotate(c.opts.reduceMotion ? 0 : -t * 0.6);
    ctx.fillStyle = '#08000a';
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let k = 0; k < 8; k++) {
      const ia = (k / 8) * Math.PI * 2;
      const ie = ((k + 0.8) / 8) * Math.PI * 2;
      ctx.strokeStyle = rgba(acc, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.3, ia, ie);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 12 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, R * 0.15, R * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, R * 0.15, R * 0.06, 0, Math.PI * 2);
  ctx.fill();
};

const seekerRare: SkinDraw = (ctx, e, r, c) => {
  seekerAimLine(ctx, e, r);
  const R = fit(ctx, r, 26);
  const col = e.color;
  const acc = '#f5b0ff';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 4);
  const sweep = c.opts.reduceMotion ? 0 : Math.sin(t * 1.2) * 0.8;
  glow(ctx, c, R * 3, col, 0.38);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.7);
    ctx.lineWidth = 1.6;
    const segs = [-2.5, -1.95, -1.4, 1.4, 1.95, 2.5];
    for (const la of segs) {
      const kx = Math.cos(la) * R;
      const ky = Math.sin(la) * R + R * 0.15;
      const fx = Math.cos(la) * R * 1.7;
      const fy = Math.sin(la) * R * 1.7 + R * 0.25;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(kx, ky);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.fillStyle = rgba(acc, 0.7);
      ctx.beginPath();
      ctx.arc(kx, ky, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.rotate(sweep);
    const bg = ctx.createLinearGradient(0, 0, R * 1.8, 0);
    bg.addColorStop(0, rgba(col, 0.4));
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(R * 1.8, -R * 0.18);
    ctx.lineTo(R * 1.8, R * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // circular eye — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#160018';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    for (let k = 0; k < 4; k++) {
      const ea = (k / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.fillStyle = rgba(acc, 0.7);
      ctx.beginPath();
      ctx.arc(Math.cos(ea) * R * 0.4, Math.sin(ea) * R * 0.4, R * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 12 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(Math.cos(sweep) * R * 0.08, Math.sin(sweep) * R * 0.08, R * 0.09, 0, Math.PI * 2);
  ctx.fill();
};

const seekerEpic: SkinDraw = (ctx, e, r, c) => {
  seekerAimLine(ctx, e, r);
  const R = fit(ctx, r, 28);
  const col = e.color;
  const acc = '#f5b0ff';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 4);
  glow(ctx, c, R * 3, col, 0.38);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.7);
    ctx.lineWidth = 1.3;
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(s * R * 0.3, -R * 0.7);
      ctx.quadraticCurveTo(s * R * 0.6, -R * 1.5, s * R * 0.4 + (c.opts.reduceMotion ? 0 : Math.sin(t * 1.5) * 3), -R * 1.9);
      ctx.stroke();
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.arc(s * R * 0.4, -R * 1.9, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // circular compound eye — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#160018';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const cells: [number, number][] = [
    [0, 0], [-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25],
    [0, -0.5], [0, 0.5], [-0.6, 0], [0.6, 0],
  ];
  for (let k = 0; k < cells.length; k++) {
    const ccx = cells[k][0] * R;
    const ccy = cells[k][1] * R;
    const bright = k === 2;
    if (c.lod === 'far' && !bright && k > 0) continue;
    ctx.fillStyle = bright ? col : rgba(col, 0.35);
    ctx.strokeStyle = rgba(acc, 0.5);
    ctx.lineWidth = 1;
    ctx.save();
    ctx.translate(ccx, ccy);
    ngon(ctx, 6, R * 0.16, 0.3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (bright) {
      ctx.fillStyle = '#fff';
      if (c.lod === 'full') {
        ctx.shadowColor = col;
        ctx.shadowBlur = 8 * pp;
      }
      ctx.beginPath();
      ctx.arc(ccx, ccy, R * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
};

// LEGENDARY = Proposal-B drawB_Seeker (legged tracker w/ side-eyes)
const seekerLegendary: SkinDraw = (ctx, e, r, c) => {
  seekerAimLine(ctx, e, r);
  const R = fit(ctx, r, 28);
  const col = e.color;
  const acc = '#f5b0ff';
  const t = bt(c);
  glow(ctx, c, R * 3, col, 0.38);
  // hex carapace — rimColor outline (the body silhouette)
  ctx.fillStyle = c.flash ? '#ffffff' : '#0d000c';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-R * 1.1, -R * 0.85);
  ctx.lineTo(R * 0.85, -R * 1.0);
  ctx.lineTo(R * 1.2, 0);
  ctx.lineTo(R * 0.85, R * 1.0);
  ctx.lineTo(-R * 1.1, R * 0.85);
  ctx.lineTo(-R * 1.4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.5;
    const legs = [Math.PI * 0.75, Math.PI * 1.0, Math.PI * 1.25, Math.PI * 1.5];
    for (const la of legs) {
      const l1x = Math.cos(la) * R;
      const l1y = Math.sin(la) * R;
      const l2x = Math.cos(la + 0.3) * R * 1.9;
      const l2y = Math.sin(la + 0.3) * R * 1.9;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(l1x, l1y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(l1x, l1y);
      ctx.lineTo(l2x, l2y);
      ctx.stroke();
      ctx.fillStyle = rgba(acc, 0.8);
      ctx.beginPath();
      ctx.arc(l1x, l1y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(acc, 0.7);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-R * 0.2, -R * 0.8);
    ctx.quadraticCurveTo(-R * 0.4, -R * 1.7, R * 0.1, -R * 2.4 + (c.opts.reduceMotion ? 0 : Math.sin(t * 1.5) * 8));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.2, -R * 0.8);
    ctx.quadraticCurveTo(R * 0.6, -R * 1.6, R * 1.1, -R * 2.1 + (c.opts.reduceMotion ? 0 : Math.sin(t * 1.8) * 6));
    ctx.stroke();
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.arc(R * 0.1, -R * 2.4 + (c.opts.reduceMotion ? 0 : Math.sin(t * 1.5) * 8), 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(R * 1.1, -R * 2.1 + (c.opts.reduceMotion ? 0 : Math.sin(t * 1.8) * 6), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // main eye — rimColor outline (the core read)
  ctx.fillStyle = c.flash ? '#ffffff' : '#04000a';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (c.lod === 'full') {
    ctx.save();
    ctx.rotate(t * 0.8);
    for (let k = 0; k < 8; k++) {
      const ia = (k / 8) * Math.PI * 2 + 0.1;
      const ie = ((k + 0.82) / 8) * Math.PI * 2 + 0.1;
      ctx.strokeStyle = rgba(acc, 0.6);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.48, ia, ie);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (c.lod !== 'far') {
    for (let s = -1; s <= 1; s += 2) {
      const ex = s * R * 0.92;
      const ey = R * 0.2;
      ctx.fillStyle = '#04000a';
      ctx.strokeStyle = rgba(acc, 0.75);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ex, ey, R * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (c.lod === 'full') {
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(-t * 1.1 * s);
        for (let k = 0; k < 6; k++) {
          const ja = (k / 6) * Math.PI * 2;
          const je = ((k + 0.78) / 6) * Math.PI * 2;
          ctx.strokeStyle = rgba(acc, 0.45);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, R * 0.22, ja, je);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(ex, ey, R * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

// ── WARDEN (#ff3b6b crimson — segmented ring boss; REAR arc weak-point) ─────
// NativeR 46–52. The big one — usually drawn at 'full' LOD (low count, large r).
const wardenCommon: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 46);
  const col = e.color;
  const acc = '#ffb0c0';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 5);
  glow(ctx, c, R * 3, col, 0.45);
  if (c.lod !== 'far') {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.5, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    for (let k = -1; k <= 1; k++) {
      const ga = k * Math.PI * 0.32;
      ctx.fillStyle = '#1c0002';
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(Math.cos(ga) * R * 1.5, Math.sin(ga) * R * 1.5, R * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  // segmented hull — rimColor on the first wedge
  ctx.save();
  ctx.rotate(c.opts.reduceMotion ? 0 : t * 0.25);
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2 + 0.06;
    const a1 = ((i + 1) / 8) * Math.PI * 2 - 0.06;
    const ir = R * 0.34;
    ctx.fillStyle = c.flash ? '#ffffff' : '#130002';
    ctx.strokeStyle = i === 0 ? c.rimColor : rgba(acc, 0.85);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * ir, Math.sin(a0) * ir);
    ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
    ctx.arc(0, 0, R, a0, a1);
    ctx.lineTo(Math.cos(a1) * ir, Math.sin(a1) * ir);
    ctx.arc(0, 0, ir, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  if (c.lod !== 'far') {
    for (let s = -1; s <= 1; s += 2) {
      const aa = s * Math.PI * 0.28;
      const a2x = Math.cos(aa) * R * 1.7;
      const a2y = Math.sin(aa) * R * 1.7;
      ctx.strokeStyle = rgba(acc, 0.7);
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(aa) * R, Math.sin(aa) * R);
      ctx.lineTo(a2x, a2y);
      ctx.stroke();
      ctx.fillStyle = '#1c0002';
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(a2x, a2y, R * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(a2x, a2y, R * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#1a0008';
  ctx.strokeStyle = acc;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 18 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.06, 0, Math.PI * 2);
  ctx.fill();
};

const wardenRare: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 46);
  const col = e.color;
  const acc = '#ffb0c0';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 4);
  glow(ctx, c, R * 3, col, 0.45);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(col, 0.85);
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.45, -Math.PI * 0.45, Math.PI * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.45, Math.PI * 0.45, Math.PI * 0.85);
    ctx.stroke();
    ctx.save();
    ctx.rotate(c.opts.reduceMotion ? 0 : t * 0.3);
    for (let k = 0; k < 6; k++) {
      ctx.rotate((Math.PI * 2) / 6);
      ctx.fillStyle = '#130002';
      ctx.strokeStyle = rgba(acc, 0.8);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(R * 0.55, -R * 0.22);
      ctx.lineTo(R * 1.05, -R * 0.13);
      ctx.lineTo(R * 1.05, R * 0.13);
      ctx.lineTo(R * 0.55, R * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    for (let s = -1; s <= 1; s += 2) {
      ctx.strokeStyle = rgba(acc, 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, s * R * 0.4);
      ctx.lineTo(s * R * 0.1, s * R * 1.2);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(s * R * 0.1, s * R * 1.2, R * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // central drum — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#1a0008';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (c.lod === 'full') {
    ctx.save();
    ctx.rotate(-t * 0.5);
    for (let k = 0; k < 10; k++) {
      const ia = (k / 10) * Math.PI * 2;
      ctx.strokeStyle = rgba(acc, 0.4);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ia) * R * 0.2, Math.sin(ia) * R * 0.2);
      ctx.lineTo(Math.cos(ia) * R * 0.46, Math.sin(ia) * R * 0.46);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 20 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc((c.opts.reduceMotion ? 0 : Math.sin(t)) * R * 0.05, 0, R * 0.09, 0, Math.PI * 2);
  ctx.fill();
};

const wardenEpic: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 46);
  const col = e.color;
  const acc = '#ffb0c0';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 4);
  const rot = c.opts.reduceMotion ? 0 : t * 0.05;
  glow(ctx, c, R * 3, col, 0.45);
  // hex hull — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#160003';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 2.2;
  ngon(ctx, 6, R, rot);
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    for (let k = 0; k < 6; k++) {
      const va = (k / 6) * Math.PI * 2 - Math.PI / 2 + rot;
      const vx = Math.cos(va) * R;
      const vy = Math.sin(va) * R;
      ctx.fillStyle = '#2a0008';
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1.4;
      ctx.save();
      ctx.translate(vx, vy);
      ctx.rotate(va);
      ctx.beginPath();
      ctx.rect(-R * 0.1, -R * 0.1, R * 0.2, R * 0.2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = rgba(col, 0.6);
      ctx.beginPath();
      ctx.arc(vx, vy, R * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.rotate(rot);
    ctx.strokeStyle = rgba(acc, 0.7);
    ctx.lineWidth = 1.6;
    ctx.fillStyle = '#0a0002';
    ctx.fillRect(R * 0.35, -R * 0.4, R * 0.5, R * 0.8);
    for (let k = 0; k < 4; k++) {
      const bx = R * 0.42 + k * R * 0.13;
      ctx.beginPath();
      ctx.moveTo(bx, -R * 0.4);
      ctx.lineTo(bx, R * 0.4);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(R * 0.35, -R * 0.4);
    ctx.lineTo(R * 0.85, -R * 0.4);
    ctx.moveTo(R * 0.35, R * 0.4);
    ctx.lineTo(R * 0.85, R * 0.4);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#1a0008';
  ctx.strokeStyle = acc;
  ctx.lineWidth = 1.8;
  ngon(ctx, 6, R * 0.42, 0);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 20 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.08, 0, Math.PI * 2);
  ctx.fill();
};

// LEGENDARY = Proposal-B drawB_Warden (rotating ring w/ dim REAR weak-point + arms)
const wardenLegendary: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 52);
  const col = e.color;
  const acc = '#ffb0c0';
  const t = bt(c);
  const rot = c.opts.reduceMotion ? 0 : t * 0.18;
  glow(ctx, c, R * 3.2, col, 0.45);
  // 6 ring wedges; the REAR (i===3) is the dim weak-point read
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2 + 0.09 + rot;
    const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2 - 0.09 + rot;
    const ir = R * 0.38;
    const isRear = i === 3;
    ctx.fillStyle = c.flash ? '#ffffff' : '#130002';
    ctx.strokeStyle = isRear ? rgba(col, 0.35) : c.rimColor;
    ctx.lineWidth = isRear ? 1.2 : 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * ir, Math.sin(a0) * ir);
    ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
    ctx.arc(0, 0, R, a0, a1);
    ctx.lineTo(Math.cos(a1) * ir, Math.sin(a1) * ir);
    ctx.arc(0, 0, ir, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // rear core (the weak-point glow)
  const rearA = ((3 + 0.5) / 6) * Math.PI * 2 - Math.PI / 2 + rot;
  const cp = c.opts.reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 5);
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = rgba('#ff3b6b', 0.7);
  if (c.lod !== 'far') {
    ctx.shadowColor = col;
    ctx.shadowBlur = lodBlur(c, 20 * cp);
  }
  ctx.beginPath();
  ctx.arc(Math.cos(rearA) * R * 0.65, Math.sin(rearA) * R * 0.65, R * 0.28 * cp, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
  if (c.lod !== 'far') {
    for (let k = 0; k < 3; k++) {
      const aa = rot + (k / 3) * Math.PI * 2 + Math.PI / 6;
      const a1x = Math.cos(aa) * R;
      const a1y = Math.sin(aa) * R;
      const a2x = Math.cos(aa + 0.45) * R * 1.55;
      const a2y = Math.sin(aa + 0.45) * R * 1.55;
      const a3x = Math.cos(aa + 0.2) * R * 2.2;
      const a3y = Math.sin(aa + 0.2) * R * 2.2;
      ctx.strokeStyle = rgba(acc, 0.6);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a1x, a1y);
      ctx.lineTo(a2x, a2y);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a2x, a2y);
      ctx.lineTo(a3x, a3y);
      ctx.stroke();
      ctx.fillStyle = '#1c0002';
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(a2x, a2y, R * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(a3x, a3y, R * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (c.lod === 'full') {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = col;
      ctx.shadowBlur = 6;
      for (let k = 0; k < 6; k++) {
        const va = (k / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(va) * R * 0.38, Math.sin(va) * R * 0.38);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.48, -Math.PI / 2, -Math.PI / 2 + 0.72 * Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
};

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2a — the 5 remaining BOSSES. Same contract as the heroes above. Each
// kind's 4 gallery takes A/B/C/D → common/rare/epic/legendary (the gallery ROSTER
// order). Bosses render large (low count) → usually 'full' LOD, but every branch
// still honours 'mid'/'far' so a downgraded GPU never strobes or stalls.
// COSMETIC ONLY: no sim/rng/hitbox/scoring reads; reduceMotion freezes pulses via
// bt(c); every shadowBlur passes through lodBlur(); additive bloom uses glow().
// (The Champion/elite is the `elite` overlay flag, NOT an EnemyKind — it can't be
// dispatched/saved per-kind through this system, so it is not ported here.)
// ════════════════════════════════════════════════════════════════════════════

// ── WEAVER (#a855f7 purple — web spinner boss; diamond core) ────────────────
// NativeR 40–42. Silhouette: rotated diamond core. Threat-rim: the diamond body.
const weaverCommon: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const acc = '#e0b3ff';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 3);
  glow(ctx, c, R * 2.6, col, 0.35);
  if (c.lod !== 'far') {
    ctx.save();
    ctx.rotate(c.opts.reduceMotion ? 0 : t * 0.1);
    ctx.strokeStyle = rgba(acc, 0.4);
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const wa = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(wa) * R * 1.4, Math.sin(wa) * R * 1.4);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(col, 0.5);
    ctx.lineWidth = 1.2;
    ngon(ctx, 6, R * 0.9, 0);
    ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.35);
    ngon(ctx, 6, R * 1.3, 0);
    ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const wa = (k / 6) * Math.PI * 2;
      ctx.fillStyle = rgba(col, 0.6);
      ctx.fillRect(Math.cos(wa) * R * 0.9 - 3, Math.sin(wa) * R * 0.9 - 3, 6, 6);
    }
    ctx.restore();
  }
  // diamond spinner core — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#1a0a26';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, -R * 0.45);
  ctx.lineTo(R * 0.4, 0);
  ctx.lineTo(0, R * 0.45);
  ctx.lineTo(-R * 0.4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 14 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.07, 0, Math.PI * 2);
  ctx.fill();
};

const weaverRare: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 40);
  const col = e.color;
  const acc = '#e0b3ff';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 3);
  glow(ctx, c, R * 2.6, col, 0.35);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.6);
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 8; k++) {
      const la = (k / 8) * Math.PI * 2 + (c.opts.reduceMotion ? 0 : Math.sin(t * 1.5 + k) * 0.05);
      const kx = Math.cos(la) * R * 0.7;
      const ky = Math.sin(la) * R * 0.7;
      const mx = Math.cos(la + 0.2) * R * 1.1;
      const my = Math.sin(la + 0.2) * R * 1.1;
      const fx = Math.cos(la - 0.1) * R * 1.5;
      const fy = Math.sin(la - 0.1) * R * 1.5;
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(mx, my);
      ctx.lineTo(fx, fy);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(col, 0.25);
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 4; k++) {
      const ta = (c.opts.reduceMotion ? 0 : t * 0.5) + (k / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ta) * R * 1.4, Math.sin(ta) * R * 1.4);
      ctx.stroke();
    }
  }
  // diamond body — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#1a0a26';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, -R * 0.55);
  ctx.lineTo(R * 0.5, 0);
  ctx.lineTo(0, R * 0.55);
  ctx.lineTo(-R * 0.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.fillStyle = rgba(col, 0.6);
    for (let k = 0; k < 3; k++) ctx.fillRect(-3, -R * 0.3 + k * R * 0.3 - 3, 6, 6);
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 14 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

const weaverEpic: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 3);
  const sh = c.opts.reduceMotion ? 0 : Math.sin(t * 1.5);
  glow(ctx, c, R * 2.6, col, 0.35);
  // big diamond web frame — rimColor outline (the silhouette)
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, -R * 1.2);
  ctx.lineTo(R * 1.0, 0);
  ctx.lineTo(0, R * 1.2);
  ctx.lineTo(-R * 1.0, 0);
  ctx.closePath();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(col, 0.4);
    ctx.lineWidth = 0.9;
    for (let k = -3; k <= 3; k++) {
      const f = k / 3.5;
      ctx.beginPath();
      ctx.moveTo(f * R * 1.0, -(1 - Math.abs(f)) * R * 1.2);
      ctx.lineTo(f * R * 1.0, (1 - Math.abs(f)) * R * 1.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-(1 - Math.abs(f)) * R * 1.0, f * R * 1.2);
      ctx.lineTo((1 - Math.abs(f)) * R * 1.0, f * R * 1.2);
      ctx.stroke();
    }
  }
  // spinner core — rimColor outline (the read)
  ctx.save();
  ctx.translate(sh * R * 0.5, 0);
  ctx.fillStyle = c.flash ? '#ffffff' : '#1a0a26';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-R * 0.2, 0);
  ctx.lineTo(0, -R * 0.18);
  ctx.lineTo(R * 0.2, 0);
  ctx.lineTo(0, R * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 14 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

const weaverLegendary: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const acc = '#e0b3ff';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 3);
  glow(ctx, c, R * 2.6, col, 0.35);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.5);
    ctx.lineWidth = 1;
    for (let k = 0; k < 10; k++) {
      const wa = (k / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(wa) * R * 1.35, Math.sin(wa) * R * 1.35);
      ctx.stroke();
    }
    // the woven spiral
    ctx.strokeStyle = rgba(col, 0.55);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2 * 4; a += 0.2) {
      const rr = R * 0.12 + (a / (Math.PI * 2 * 4)) * R * 1.3;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // diamond core — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#1a0a26';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -R * 0.3);
  ctx.lineTo(R * 0.26, 0);
  ctx.lineTo(0, R * 0.3);
  ctx.lineTo(-R * 0.26, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 14 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

// ── BEACON (#38bdf8 blue — lamp-tower boss) ─────────────────────────────────
// NativeR 42. Silhouette: a tapered tower (wide base → narrow top) + lamp head.
const beaconCommon: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const acc = '#bce8ff';
  const t = bt(c);
  const fl = c.opts.reduceMotion ? 0.6 : 0.6 + 0.4 * Math.sin(t * 7);
  glow(ctx, c, R * 2.6, col, 0.35);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(col, 0.4);
    ctx.setLineDash([5, 6]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(R * 0.2, -R * 0.4, R * 0.9, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(R * 0.2, -R * 0.4, R * 1.3, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // tower body — rimColor outline (the silhouette)
  ctx.fillStyle = c.flash ? '#ffffff' : '#04141f';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-R * 0.5, R * 1.2);
  ctx.lineTo(-R * 0.22, -R * 0.5);
  ctx.lineTo(R * 0.22, -R * 0.5);
  ctx.lineTo(R * 0.5, R * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.4);
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const y = -R * 0.2 + k * R * 0.45;
      const w = R * 0.3 + k * R * 0.08;
      ctx.beginPath();
      ctx.moveTo(-w, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }
  // lamp head — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#06202e';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-R * 0.28, -R * 0.5);
  ctx.lineTo(R * 0.28, -R * 0.5);
  ctx.lineTo(R * 0.2, -R * 0.85);
  ctx.lineTo(-R * 0.2, -R * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // lamp core (the lit beacon)
  ctx.save();
  ctx.globalAlpha = fl;
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 18 * fl;
  }
  ctx.beginPath();
  ctx.arc(0, -R * 0.68, R * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
};

const beaconRare: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 4);
  glow(ctx, c, R * 2.6, col, 0.35);
  if (c.lod !== 'far') {
    // the rotating lighthouse beam
    ctx.save();
    ctx.translate(0, -R * 0.6);
    ctx.rotate(c.opts.reduceMotion ? 0 : t * 0.8);
    const bg = ctx.createLinearGradient(0, 0, R * 1.6, 0);
    bg.addColorStop(0, rgba(col, 0.5));
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(R * 1.6, -R * 0.32);
    ctx.lineTo(R * 1.6, R * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(Math.PI);
    const bg2 = ctx.createLinearGradient(0, 0, R * 1.2, 0);
    bg2.addColorStop(0, rgba(col, 0.3));
    bg2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(R * 1.2, -R * 0.22);
    ctx.lineTo(R * 1.2, R * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // tapered tower — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#04141f';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-R * 0.45, R * 1.2);
  ctx.lineTo(-R * 0.2, -R * 0.35);
  ctx.lineTo(R * 0.2, -R * 0.35);
  ctx.lineTo(R * 0.45, R * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // lamp drum — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#06202e';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, -R * 0.6, R * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 18 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, -R * 0.6, R * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, -R * 0.6, R * 0.06, 0, Math.PI * 2);
  ctx.fill();
};

const beaconEpic: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const acc = '#bce8ff';
  const t = bt(c);
  const fl = c.opts.reduceMotion ? 0.6 : 0.6 + 0.4 * Math.sin(t * 5);
  glow(ctx, c, R * 2.6, col, 0.35);
  // tower body — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#04141f';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-R * 0.45, R * 1.2);
  ctx.lineTo(-R * 0.22, -R * 0.2);
  ctx.lineTo(R * 0.22, -R * 0.2);
  ctx.lineTo(R * 0.45, R * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.4);
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const y = R * 0.1 + k * R * 0.4;
      ctx.beginPath();
      ctx.moveTo(-R * 0.28 - k * 0.04, y);
      ctx.lineTo(R * 0.28 + k * 0.04, y);
      ctx.stroke();
    }
  }
  // lamp dome — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#06202e';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, -R * 0.45, R * 0.5, Math.PI, Math.PI * 2);
  ctx.lineTo(-R * 0.5, -R * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.5);
    ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.arc(0, -R * 0.45, (R * 0.5 * k) / 4, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    // upward light cone
    ctx.save();
    const lg = ctx.createLinearGradient(0, -R * 0.45, 0, -R * 1.5);
    lg.addColorStop(0, rgba(col, 0.45 * fl));
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(-R * 0.35, -R * 0.5);
    ctx.lineTo(-R * 0.7, -R * 1.5);
    ctx.lineTo(R * 0.7, -R * 1.5);
    ctx.lineTo(R * 0.35, -R * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 18 * fl;
  }
  ctx.beginPath();
  ctx.arc(0, -R * 0.45, R * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

const beaconLegendary: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const acc = '#bce8ff';
  const t = bt(c);
  const fl = c.opts.reduceMotion ? 1 : Math.sin(t * 9) > 0 ? 1 : 0.25;
  glow(ctx, c, R * 2.6, col, 0.3);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(col, 0.2);
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(R * 0.2, -R * 0.7);
    ctx.lineTo(R * 1.4, -R * 1.1);
    ctx.moveTo(R * 0.2, -R * 0.4);
    ctx.lineTo(R * 1.4, -R * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.save();
  ctx.rotate(0.12);
  // leaning tower — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#04141f';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-R * 0.45, R * 1.2);
  ctx.lineTo(-R * 0.2, -R * 0.55);
  ctx.lineTo(R * 0.2, -R * 0.55);
  ctx.lineTo(R * 0.45, R * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.5);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-R * 0.1, R * 0.5);
    ctx.lineTo(R * 0.08, 0);
    ctx.lineTo(-R * 0.05, -R * 0.4);
    ctx.stroke();
  }
  ctx.globalAlpha = fl;
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 16 * fl;
  }
  ctx.beginPath();
  ctx.arc(0, -R * 0.7, R * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
};

// ── MIRRORBLADE (#ef4444 red — mirrored-blade boss) ─────────────────────────
// NativeR 42. Silhouette: a vertical blade (point up). Threat-rim: the blade body.
const mirrorbladeCommon: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const acc = '#ffb3b3';
  const t = bt(c);
  const sh = c.opts.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3);
  glow(ctx, c, R * 2.6, col, 0.35);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.4 + 0.3 * sh);
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -R * 1.3);
    ctx.lineTo(0, R * 1.3);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // blade body — rimColor outline (the silhouette)
  ctx.fillStyle = c.flash ? '#ffffff' : '#260606';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, -R * 1.2);
  ctx.lineTo(-R * 0.55, R * 0.1);
  ctx.lineTo(-R * 0.28, R * 0.75);
  ctx.lineTo(0, R * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    // the mirror echo of the blade
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.2 * sh;
    ctx.translate(R * 0.08 * sh, 0);
    ctx.fillStyle = '#260606';
    ctx.strokeStyle = rgba(acc, 0.7);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -R * 1.2);
    ctx.lineTo(R * 0.55, R * 0.1);
    ctx.lineTo(R * 0.28, R * 0.75);
    ctx.lineTo(0, R * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#fff';
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.arc(0, k * R * 0.55, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 10;
  }
  ctx.beginPath();
  ctx.arc(-R * 0.22, R * 0.1, R * 0.1, 0, Math.PI * 2);
  ctx.fill();
  if (c.lod !== 'far') {
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(R * 0.22, R * 0.1, R * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
};

const mirrorbladeRare: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const acc = '#ffb3b3';
  const t = bt(c);
  const sh = c.opts.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.5);
  glow(ctx, c, R * 2.6, col, 0.35);
  if (c.lod !== 'far') {
    const sg = ctx.createLinearGradient(-R * 0.4, 0, R * 0.4, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0)');
    sg.addColorStop(0.5, rgba(acc, 0.18 + 0.15 * sh));
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(-R * 0.4, -R * 1.2, R * 0.8, R * 2.4);
  }
  // twin crossing blades — the lead (s<0) carries the rimColor (the read)
  for (let s = -1; s <= 1; s += 2) {
    if (c.lod === 'far' && s > 0) continue; // glyph-only: the lead blade is enough
    ctx.save();
    ctx.globalAlpha = s < 0 ? 1 : 0.55;
    ctx.fillStyle = c.flash ? '#ffffff' : '#260606';
    ctx.strokeStyle = s < 0 ? c.rimColor : rgba(acc, 0.7);
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(s * R * 0.05, -R * 1.2);
    ctx.lineTo(s * R * 0.55, R * 0.2);
    ctx.lineTo(s * R * 0.28, R * 0.78);
    ctx.lineTo(s * R * 0.05, R * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(col, 0.5 + 0.4 * sh);
    ctx.lineWidth = 1.6;
    ctx.shadowColor = col;
    ctx.shadowBlur = lodBlur(c, 8 * sh);
    ctx.beginPath();
    ctx.moveTo(0, -R * 1.1);
    ctx.lineTo(0, R * 0.7);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, -R * 0.2, R * 0.08, 0, Math.PI * 2);
  ctx.fill();
};

const mirrorbladeEpic: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const acc = '#ffb3b3';
  const t = bt(c);
  const sh = c.opts.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3);
  glow(ctx, c, R * 2.6, col, 0.35);
  // blade body — rimColor outline (the silhouette)
  ctx.fillStyle = c.flash ? '#ffffff' : '#260606';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, -R * 1.2);
  ctx.lineTo(-R * 0.4, R * 0.3);
  ctx.lineTo(0, R * 0.7);
  ctx.lineTo(R * 0.4, R * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    const shards: [number, number, number][] = [
      [-0.9, -0.3, 0.4], [0.9, -0.5, -0.5], [-0.7, 0.6, 0.8], [0.8, 0.5, -1.0], [-0.3, -1.0, 0.3],
    ];
    for (let k = 0; k < shards.length; k++) {
      ctx.save();
      ctx.translate(shards[k][0] * R, shards[k][1] * R);
      ctx.rotate(shards[k][2] + sh * 0.2);
      ctx.globalAlpha = 0.5 + 0.3 * sh;
      ctx.fillStyle = '#1c0404';
      ctx.strokeStyle = rgba(acc, 0.7);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.25);
      ctx.lineTo(R * 0.14, R * 0.1);
      ctx.lineTo(-R * 0.1, R * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 10;
  }
  ctx.beginPath();
  ctx.arc(0, R * 0.1, R * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

const mirrorbladeLegendary: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const acc = '#ffb3b3';
  const t = bt(c);
  const sh = c.opts.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.5);
  glow(ctx, c, R * 2.6, col, 0.35);
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.4 + 0.3 * sh);
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -R * 1.3);
    ctx.lineTo(0, R * 1.3);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // twin mirrored blades — both carry the rimColor (the lead at full alpha)
  for (let s = -1; s <= 1; s += 2) {
    if (c.lod === 'far' && s > 0) continue; // glyph-only: one blade is enough to read
    ctx.save();
    ctx.translate(s * R * 0.35, 0);
    ctx.rotate(s * 0.18);
    ctx.fillStyle = c.flash ? '#ffffff' : '#260606';
    ctx.strokeStyle = s < 0 ? c.rimColor : rgba(acc, 0.85);
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(0, -R * 1.15);
    ctx.lineTo(-R * 0.3, R * 0.2);
    ctx.lineTo(0, R * 0.6);
    ctx.lineTo(R * 0.3, R * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col;
    if (c.lod === 'full') {
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(0, R * 0.05, R * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  if (c.lod !== 'far') {
    ctx.fillStyle = '#fff';
    for (let k = -1; k <= 1; k++) {
      ctx.globalAlpha = 0.5 + 0.5 * sh;
      ctx.beginPath();
      ctx.arc(0, k * R * 0.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
};

// ── HOLLOW (#6ee7b7 mint — broken-shell boss) ───────────────────────────────
// NativeR 42. Silhouette: a broken/incomplete ring shell. Threat-rim: the arc shell.
const hollowCommon: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const t = bt(c);
  const flick = c.opts.reduceMotion ? 1 : Math.sin(t * 2.2) > 0.4 ? 1 : 0.2;
  const pp = c.opts.reduceMotion ? 1 : 0.5 + 0.5 * Math.sin(t * 3);
  glow(ctx, c, R * 2.7, col, 0.42);
  // broken outer shell — rimColor outline (the silhouette read)
  ctx.save();
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 2.8;
  ctx.lineCap = 'round';
  if (c.lod !== 'far') {
    ctx.shadowColor = col;
    ctx.shadowBlur = lodBlur(c, 8);
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.05, -Math.PI * 0.35, Math.PI * 1.25);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(col, 0.55);
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.5 + k * R * 0.2, Math.PI * 0.4, Math.PI * 1.1);
      ctx.stroke();
    }
    // the key-glyph (grief's relic), flickering
    ctx.save();
    ctx.globalAlpha = flick;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = col;
    ctx.shadowBlur = lodBlur(c, 10 * flick);
    ctx.beginPath();
    ctx.arc(-R * 0.1, 0, R * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.06, 0);
    ctx.lineTo(R * 0.5, 0);
    ctx.moveTo(R * 0.36, 0);
    ctx.lineTo(R * 0.36, R * 0.15);
    ctx.moveTo(R * 0.5, 0);
    ctx.lineTo(R * 0.5, R * 0.2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  // dim hollow core
  ctx.fillStyle = rgba(col, 0.4 + 0.4 * pp);
  ctx.beginPath();
  ctx.arc(-R * 0.1, 0, R * 0.07, 0, Math.PI * 2);
  ctx.fill();
};

const hollowRare: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const acc = '#c2f5e0';
  const t = bt(c);
  const flick = c.opts.reduceMotion ? 1 : Math.sin(t * 2) > 0.3 ? 1 : 0.2;
  glow(ctx, c, R * 2.6, col, 0.32);
  if (c.lod !== 'far') {
    ctx.save();
    ctx.rotate(c.opts.reduceMotion ? 0 : t * 0.15);
    for (let k = 0; k < 5; k++) {
      const fa = (k / 5) * Math.PI * 2;
      ctx.strokeStyle = rgba(acc, 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.0, fa, fa + 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }
  // orbiting-fragment shell — rimColor outline (the read) on the inner ring
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(col, 0.35);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.77, 0, Math.PI * 2);
    ctx.stroke();
    // key-glyph flicker
    ctx.save();
    ctx.globalAlpha = flick;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = col;
    ctx.shadowBlur = lodBlur(c, 10 * flick);
    ctx.beginPath();
    ctx.arc(-R * 0.12, 0, R * 0.15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.03, 0);
    ctx.lineTo(R * 0.45, 0);
    ctx.moveTo(R * 0.3, 0);
    ctx.lineTo(R * 0.3, R * 0.14);
    ctx.moveTo(R * 0.45, 0);
    ctx.lineTo(R * 0.45, R * 0.18);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  ctx.fillStyle = rgba(col, 0.5);
  ctx.beginPath();
  ctx.arc(-R * 0.12, 0, R * 0.06, 0, Math.PI * 2);
  ctx.fill();
};

const hollowEpic: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const acc = '#c2f5e0';
  const t = bt(c);
  const flick = c.opts.reduceMotion ? 1 : Math.sin(t * 2.2) > 0.4 ? 1 : 0.2;
  const pp = c.opts.reduceMotion ? 1 : 0.5 + 0.5 * Math.sin(t * 3);
  glow(ctx, c, R * 2.7, col, 0.42);
  // broken shell cap — rimColor outline (the silhouette)
  ctx.save();
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  if (c.lod !== 'far') {
    ctx.shadowColor = col;
    ctx.shadowBlur = lodBlur(c, 8);
  }
  ctx.beginPath();
  ctx.arc(0, -R * 0.1, R * 0.95, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
  if (c.lod !== 'far') {
    // hanging ribcage veins
    ctx.strokeStyle = rgba(col, 0.55);
    ctx.lineWidth = 1.4;
    for (let k = -3; k <= 3; k++) {
      const vx = k * R * 0.22;
      const wob = c.opts.reduceMotion ? 0 : Math.sin(t * 1.5 + k);
      ctx.beginPath();
      ctx.moveTo(vx, 0);
      ctx.quadraticCurveTo(vx + wob * 5, R * 0.7, vx + wob * 8, R * 1.3);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(acc, 0.75);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, -R * 0.05, R * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    // key-glyph flicker
    ctx.save();
    ctx.globalAlpha = flick;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = col;
    ctx.shadowBlur = lodBlur(c, 10 * flick);
    ctx.beginPath();
    ctx.arc(-R * 0.1, -R * 0.05, R * 0.14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.04, -R * 0.05);
    ctx.lineTo(R * 0.4, -R * 0.05);
    ctx.moveTo(R * 0.28, -R * 0.05);
    ctx.lineTo(R * 0.28, R * 0.08);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  ctx.fillStyle = rgba(col, 0.4 + 0.4 * pp);
  ctx.beginPath();
  ctx.arc(-R * 0.1, -R * 0.05, R * 0.06, 0, Math.PI * 2);
  ctx.fill();
};

const hollowLegendary: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 42);
  const col = e.color;
  const acc = '#c2f5e0';
  const t = bt(c);
  const flick = c.opts.reduceMotion ? 1 : Math.sin(t * 2) > 0.3 ? 1 : 0.2;
  const gap = R * 0.12 * (c.opts.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.4));
  glow(ctx, c, R * 2.6, col, 0.32);
  // split shell halves (top + bottom) — rimColor outline (the silhouette)
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, -gap, R * 0.85, Math.PI, Math.PI * 2);
  ctx.lineTo(R * 0.4, -gap);
  ctx.lineTo(-R * 0.4, -gap);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, gap, R * 0.85, 0, Math.PI);
  ctx.lineTo(-R * 0.4, gap);
  ctx.lineTo(R * 0.4, gap);
  ctx.closePath();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.5);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-R * 0.8, -gap);
    ctx.lineTo(-R * 0.5, -gap + 3);
    ctx.lineTo(-R * 0.2, -gap);
    ctx.lineTo(R * 0.1, -gap + 3);
    ctx.lineTo(R * 0.4, -gap);
    ctx.stroke();
    for (let k = 0; k < 4; k++) {
      const mx = (c.opts.reduceMotion ? 0.3 : Math.cos(t * 0.5 + k)) * R * 0.3;
      const my = (c.opts.reduceMotion ? 0.1 : Math.sin(t * 0.7 + k)) * R * 0.2;
      ctx.fillStyle = rgba(col, 0.5);
      ctx.beginPath();
      ctx.arc(mx, my, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // key-glyph flicker
    ctx.save();
    ctx.globalAlpha = flick;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = col;
    ctx.shadowBlur = lodBlur(c, 10 * flick);
    ctx.beginPath();
    ctx.arc(-R * 0.1, 0, R * 0.13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.03, 0);
    ctx.lineTo(R * 0.36, 0);
    ctx.moveTo(R * 0.24, 0);
    ctx.lineTo(R * 0.24, R * 0.1);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
};

// ── SOVEREIGN (#fde047 gold — gravity-well + crown; the FINAL boss) ─────────
// NativeR 44. Silhouette: a central well disc crowned above. Threat-rim: the disc.
const sovereignCommon: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 44);
  const col = e.color;
  const acc = '#fff6c0';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 4);
  glow(ctx, c, R * 2.8, col, 0.42);
  if (c.lod !== 'far') {
    // accretion ellipses
    ctx.save();
    ctx.rotate(-0.35);
    ctx.strokeStyle = rgba(col, 0.5);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.5, R * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.rotate(0.5);
    ctx.strokeStyle = rgba(col, 0.35);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.35, R * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    for (let k = 0; k < 4; k++) {
      const da = (c.opts.reduceMotion ? 0 : t * 0.4) + (k / 4) * Math.PI * 2;
      ctx.fillStyle = rgba(col, 0.6);
      ctx.beginPath();
      ctx.arc(Math.cos(da) * R * 1.4, Math.sin(da) * R * 0.55, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // well disc — rimColor outline (the silhouette read)
  ctx.fillStyle = c.flash ? '#ffffff' : '#1c1800';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.save();
    ctx.rotate(0.2);
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-R * 0.45, R * 0.1);
    ctx.lineTo(-R * 0.45, -R * 0.3);
    ctx.lineTo(-R * 0.18, -R * 0.05);
    ctx.lineTo(0, -R * 0.4);
    ctx.lineTo(R * 0.18, -R * 0.05);
    ctx.lineTo(R * 0.45, -R * 0.3);
    ctx.lineTo(R * 0.45, R * 0.1);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 22 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, R * 0.05, R * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, R * 0.05, R * 0.09, 0, Math.PI * 2);
  ctx.fill();
};

const sovereignRare: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 44);
  const col = e.color;
  const acc = '#fff6c0';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 4);
  glow(ctx, c, R * 2.8, col, 0.42);
  if (c.lod !== 'far') {
    ctx.save();
    ctx.rotate(c.opts.reduceMotion ? 0 : t * 0.3);
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = rgba(col, 0.5 - k * 0.1);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const rad = R * (1.4 - k * 0.28);
      ctx.ellipse(0, 0, rad, rad * 0.85, k * 0.4, 0, Math.PI * 1.7);
      ctx.stroke();
    }
    ctx.restore();
    for (let k = 0; k < 5; k++) {
      const da = (c.opts.reduceMotion ? 0 : -t * 0.6) + (k / 5) * Math.PI * 2;
      const rr = R * (1.3 - ((c.opts.reduceMotion ? 0.2 : t * 0.2 + k * 0.2) % 1) * 0.8);
      ctx.fillStyle = rgba(acc, 0.6);
      ctx.beginPath();
      ctx.arc(Math.cos(da) * rr, Math.sin(da) * rr, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // well disc — rimColor outline
  ctx.fillStyle = c.flash ? '#ffffff' : '#1c1800';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = rgba(acc, 0.8);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-R * 0.32, -R * 0.05);
    ctx.lineTo(-R * 0.2, -R * 0.28);
    ctx.lineTo(0, -R * 0.08);
    ctx.lineTo(R * 0.2, -R * 0.28);
    ctx.lineTo(R * 0.32, -R * 0.05);
    ctx.stroke();
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 22 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, R * 0.05, R * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, R * 0.05, R * 0.07, 0, Math.PI * 2);
  ctx.fill();
};

const sovereignEpic: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 44);
  const col = e.color;
  const acc = '#fff6c0';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 4);
  glow(ctx, c, R * 2.8, col, 0.42);
  if (c.lod !== 'far') {
    ctx.save();
    ctx.rotate(c.opts.reduceMotion ? 0 : t * 0.1);
    ctx.strokeStyle = rgba(col, 0.3);
    ctx.lineWidth = 1;
    for (let k = 0; k < 16; k++) {
      const ga = (k / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ga) * R * 0.6, Math.sin(ga) * R * 0.6);
      ctx.lineTo(Math.cos(ga) * R * 1.5, Math.sin(ga) * R * 1.5);
      ctx.stroke();
    }
    ctx.restore();
    for (let k = 0; k < 5; k++) {
      const da = (c.opts.reduceMotion ? 0 : -t * 0.5) + (k / 5) * Math.PI * 2;
      ctx.fillStyle = rgba(acc, 0.6);
      ctx.beginPath();
      ctx.arc(Math.cos(da) * R * 1.3, Math.sin(da) * R * 1.3, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // crowned well disc — rimColor outline (the silhouette)
  ctx.fillStyle = c.flash ? '#ffffff' : '#1c1800';
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, R * 0.1, R * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = acc;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-R * 0.5, R * 0.1);
    ctx.lineTo(-R * 0.5, -R * 0.4);
    ctx.lineTo(-R * 0.25, -R * 0.1);
    ctx.lineTo(0, -R * 0.55);
    ctx.lineTo(R * 0.25, -R * 0.1);
    ctx.lineTo(R * 0.5, -R * 0.4);
    ctx.lineTo(R * 0.5, R * 0.1);
    ctx.stroke();
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 22 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, R * 0.1, R * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, R * 0.1, R * 0.08, 0, Math.PI * 2);
  ctx.fill();
};

const sovereignLegendary: SkinDraw = (ctx, e, r, c) => {
  const R = fit(ctx, r, 44);
  const col = e.color;
  const acc = '#fff6c0';
  const t = bt(c);
  const pp = c.opts.reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 4);
  glow(ctx, c, R * 2.8, col, 0.42);
  if (c.lod !== 'far') {
    ctx.save();
    ctx.rotate(c.opts.reduceMotion ? 0 : t * 0.2);
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = rgba(acc, 0.4 - k * 0.1);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, 0, R * (1.0 + k * 0.25), k * 0.5, k * 0.5 + Math.PI * 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }
  // event-horizon ring — rimColor stroke (the silhouette read)
  ctx.save();
  ctx.strokeStyle = c.rimColor;
  ctx.lineWidth = 3;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 14 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
  // well interior
  ctx.fillStyle = c.flash ? '#ffffff' : '#0a0900';
  ctx.strokeStyle = rgba(acc, 0.5);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (c.lod !== 'far') {
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-R * 0.32, -R * 0.05);
    ctx.lineTo(-R * 0.2, -R * 0.32);
    ctx.lineTo(0, -R * 0.1);
    ctx.lineTo(R * 0.2, -R * 0.32);
    ctx.lineTo(R * 0.32, -R * 0.05);
    ctx.stroke();
  }
  ctx.fillStyle = col;
  if (c.lod === 'full') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 10 * pp;
  }
  ctx.beginPath();
  ctx.arc(0, R * 0.15, R * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

// ── REGISTRY ────────────────────────────────────────────────────────────────
/** Build the 4 takes for a hero kind. The Common is the kind's baseline (its id
 *  is `<kind>-default` so a fresh save / fallback maps cleanly). */
function hero(
  kind: EnemyKind,
  draws: { common: [string, SkinDraw]; rare: [string, SkinDraw]; epic: [string, SkinDraw]; legendary: [string, SkinDraw] },
): SkinDef[] {
  return [
    { id: `${kind}-default`, kind, rarity: 'common', name: draws.common[0], unlockAch: TIER_ACH.common, draw: draws.common[1] },
    { id: `${kind}-rare`, kind, rarity: 'rare', name: draws.rare[0], unlockAch: TIER_ACH.rare, draw: draws.rare[1] },
    { id: `${kind}-epic`, kind, rarity: 'epic', name: draws.epic[0], unlockAch: TIER_ACH.epic, draw: draws.epic[1] },
    { id: `${kind}-legendary`, kind, rarity: 'legendary', name: draws.legendary[0], unlockAch: TIER_ACH.legendary, draw: draws.legendary[1] },
  ];
}

/** Flat list of every ported skin (Phase 1 = the 5 heroes × 4 rarities). */
export const ALL_SKINS: SkinDef[] = [
  ...hero('darter', {
    common: ['MANTA', darterCommon],
    rare: ['SHOAL', darterRare],
    epic: ['ECHELON', darterEpic],
    legendary: ['SKATE', darterLegendary],
  }),
  ...hero('orbiter', {
    common: ['SENTRY', orbiterCommon],
    rare: ['CORE', orbiterRare],
    epic: ['RING', orbiterEpic],
    legendary: ['HIVE', orbiterLegendary],
  }),
  ...hero('lancer', {
    common: ['SPIDER', lancerCommon],
    rare: ['WALKER', lancerRare],
    epic: ['TURRET', lancerEpic],
    legendary: ['RAILGUN', lancerLegendary],
  }),
  ...hero('seeker', {
    common: ['DRONE', seekerCommon],
    rare: ['SWEEP', seekerRare],
    epic: ['COMPOUND', seekerEpic],
    legendary: ['STALKER', seekerLegendary],
  }),
  ...hero('warden', {
    common: ['BULWARK', wardenCommon],
    rare: ['ROTOR', wardenRare],
    epic: ['CITADEL', wardenEpic],
    legendary: ['SOVEREIGN-GUARD', wardenLegendary],
  }),
  // ── Phase 2a: the 5 remaining bosses (gallery A/B/C/D → C/R/E/L order) ──
  ...hero('weaver', {
    common: ['LOOM', weaverCommon],
    rare: ['ARACHNE', weaverRare],
    epic: ['LATTICE', weaverEpic],
    legendary: ['SPIRAL', weaverLegendary],
  }),
  ...hero('beacon', {
    common: ['PHAROS', beaconCommon],
    rare: ['SWEEP', beaconRare],
    epic: ['SIGNAL', beaconEpic],
    legendary: ['FALSE-DAWN', beaconLegendary],
  }),
  ...hero('mirrorblade', {
    common: ['ECHO', mirrorbladeCommon],
    rare: ['TWIN-EDGE', mirrorbladeRare],
    epic: ['SHATTER', mirrorbladeEpic],
    legendary: ['DOPPEL', mirrorbladeLegendary],
  }),
  ...hero('hollow', {
    common: ['RELIQUARY', hollowCommon],
    rare: ['ORBIT', hollowRare],
    epic: ['RIBCAGE', hollowEpic],
    legendary: ['CLEAVE', hollowLegendary],
  }),
  ...hero('sovereign', {
    common: ['ACCRETION', sovereignCommon],
    rare: ['MAELSTROM', sovereignRare],
    epic: ['REGALIA', sovereignEpic],
    legendary: ['EVENT-HORIZON', sovereignLegendary],
  }),
];

/** Kinds that have ported skins this phase. Un-listed kinds fall back to the
 *  committed biomech draw in render.ts (so the game is whole at every step). */
export const PORTED_KINDS: EnemyKind[] = [
  'darter', 'orbiter', 'lancer', 'seeker', 'warden',
  // Phase 2a — the 5 remaining bosses (the Champion/elite is the `elite` overlay
  // flag, NOT an EnemyKind, so it cannot be dispatched/saved per-kind without a
  // system change; left to the dedicated elite-aura pass in render.ts).
  'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign',
];

const BY_KIND = new Map<EnemyKind, SkinDef[]>();
const BY_ID = new Map<string, SkinDef>();
for (const s of ALL_SKINS) {
  if (!BY_KIND.has(s.kind)) BY_KIND.set(s.kind, []);
  BY_KIND.get(s.kind)!.push(s);
  BY_ID.set(s.id, s);
}

/** All skins for a kind (in rarity order). Empty for un-ported kinds. */
export function skinsForKind(kind: EnemyKind): SkinDef[] {
  return BY_KIND.get(kind) ?? [];
}

/** The kind's baseline skin id (its Common/'default'). For un-ported kinds this
 *  is the conventional `<kind>-default` so the save shape is uniform; render.ts
 *  treats any id with no matching SkinDef as "use the biomech fallback". */
export function defaultSkinId(kind: EnemyKind): string {
  return `${kind}-default`;
}

/** Look up a ported skin by id (null if unknown / un-ported → caller falls back). */
export function skinById(id: string): SkinDef | null {
  return BY_ID.get(id) ?? null;
}

/** Is the gating requirement met to equip this skin? Achievement-gated skins
 *  need the achievement; a null gate (Common) is always unlocked. Mirrors
 *  canUnlockTrail — unlocks derive from save.achievements. */
export function canUnlockSkin(skin: SkinDef, achievements: string[]): boolean {
  return skin.unlockAch === null || achievements.includes(skin.unlockAch);
}

/** Short toast shown when a player taps a still-locked skin (explains the gate). */
export function skinLockToast(rarity: SkinRarity): string {
  switch (rarity) {
    case 'rare':
      return 'Reach wave 10 to unlock this skin';
    case 'epic':
      return 'Win the Arena to unlock this skin';
    case 'legendary':
      return 'Defeat the Sovereign to unlock this skin';
    default:
      return 'Skin locked';
  }
}

/** Human label for a rarity's unlock requirement (for the picker tooltip). */
export function skinUnlockHint(skin: SkinDef): string {
  switch (skin.rarity) {
    case 'common':
      return 'Free';
    case 'rare':
      return 'Reach wave 10 (Last One Standing)';
    case 'epic':
      return 'Win the Arena (Gauntlet Cleared)';
    case 'legendary':
      return 'Bring down the Sovereign (Regicide)';
  }
}
