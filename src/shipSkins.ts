// Ship SKINS — cosmetic reskins of the PLAYER hull. Three themed sets (the jam logline
// "break the code, bring back the longest day"), each tailored per ship, drawn on the REAL
// shipModels.ts geometry (single source of truth — no duplicated hulls). Purely cosmetic:
// render.ts swaps the ship BODY for the equipped skin ONLY in the calm state (no hit-flash /
// i-frame), so every gameplay read — flash, invuln blink, dash spear, ghosts — is untouched.
//
// Design lineage: mockups/ship-skins-gallery.html (the interactive design gallery). The draw
// treatments here mirror that gallery; keep the two in sync if you tweak a look.
//
// Orientation: the draws are authored NOSE-UP (nose toward -y). render.ts rotates the context
// by (player.angle + π/2) before calling, so "up" aligns with the aim. (drawShipSilhouette, by
// contrast, draws nose at +x and the caller rotates by angle.)
//
// Unlocks derive from save.shards + save.achievements (no separate "can unlock" persisted state
// beyond the owned set) — the same model as canUnlockTrail.

import { shipModel } from './shipModels';
import type { ShipModel, Pt } from './shipModels';

type C = CanvasRenderingContext2D;

export interface ShipSkinDef {
  id: string; // 'encryption' | 'key' | 'firstlight'
  name: string; // the SET name (shown as context); each ship's copy has its own `names` entry
  tag: string;
  /** shard threshold to unlock; 0 = free (or achievement-gated) */
  unlockShards: number;
  /** achievement id required (overrides shards when present) */
  unlockAch?: string;
  /** per-ship individual skin name — each ship's copy of the set is its own named artifact.
   *  Across a ship the three sets read as a locked → broken → dawn arc. */
  names: Record<string, string>;
}

// THE ENCRYPTION → THE KEY → FIRST LIGHT: grey cipher → the break → the longest day.
// FIRST LIGHT is the victory cosmetic (down the Sovereign), echoing the CROWN/DAYBREAK trails.
// Each ship's copy is individually named off its motif (the rotor lock, the punch-card scan,
// the sealed vault, the intercepted waveform, the ghost column, the redacted tape …).
export const SHIP_SKINS: ShipSkinDef[] = [
  {
    id: 'encryption', name: 'THE ENCRYPTION', tag: 'the city, locked in code', unlockShards: 1500,
    names: { lance: 'CIPHERHEART', glaive: 'GLASS LEDGER', bastion: 'THE VAULT', tempest: 'WAVELOCK', phantom: 'WRAITHCODE', reaver: 'REDACTED' },
  },
  {
    id: 'key', name: 'THE KEY', tag: 'break the code', unlockShards: 3500,
    names: { lance: 'KEYSTONE', glaive: 'SHATTERKEY', bastion: 'SEALBREAKER', tempest: 'TIDEKEY', phantom: 'HAIRLINE', reaver: 'EMBERKEY' },
  },
  {
    id: 'firstlight', name: 'FIRST LIGHT', tag: 'bring back the longest day', unlockShards: 0, unlockAch: 'regicide',
    names: { lance: 'DAYSPRING', glaive: 'PRISM DAWN', bastion: 'SUNWALL', tempest: 'STORMLIGHT', phantom: 'PALE SUN', reaver: 'BLOOD DAWN' },
  },
];

/** The skin def for an id, or null. 'none' (the plain hull) is intentionally NOT in the list. */
export function shipSkinById(id: string): ShipSkinDef | null {
  return SHIP_SKINS.find((s) => s.id === id) ?? null;
}

/** The individual name for a ship's copy of a skin set (e.g. lance + key → 'KEYSTONE').
 *  Falls back to the set name for an unknown ship; '' for an unknown / 'none' set. */
export function shipSkinName(shipId: string, setId: string): string {
  const def = shipSkinById(setId);
  if (!def) return '';
  return def.names[shipId] ?? def.name;
}

/** Is the gating met to unlock this skin? Shard skins need enough shards; achievement-gated
 *  skins need the achievement (and are otherwise free). Mirrors canUnlockTrail. (The SHIP must
 *  also be owned — that gate lives in the caller, which has the unlockedShips set.) */
export function canUnlockShipSkin(def: ShipSkinDef, shards: number, achievements: string[]): boolean {
  if (def.unlockAch) return achievements.includes(def.unlockAch);
  return shards >= def.unlockShards;
}

/** The per-(ship, set) ownership key. Each ship's copy of a skin is bought / unlocked
 *  individually (NOT as a set-wide bundle), so ownership + equip are keyed `${shipId}:${setId}`. */
export function shipSkinKey(shipId: string, setId: string): string {
  return `${shipId}:${setId}`;
}

export interface ShipSkinOpts {
  reduceMotion: boolean;
}

// ── per-ship focal point (the core glint) — shipModels' core where present, else a tuned
//    fallback so every ship has a centre for the skin's core treatment.
const FOCUS: Record<string, readonly [number, number]> = {
  lance: [0.42, 0],
  glaive: [0.4, 0],
  bastion: [0.42, 0],
  tempest: [0.48, 0],
  phantom: [0.3, 0],
  reaver: [0.28, 0],
};

interface SkinModel {
  hull: ReadonlyArray<Pt>;
  detail?: ReadonlyArray<Pt>;
  focus: readonly [number, number];
}

function modelFor(id: string): SkinModel {
  const m: ShipModel = shipModel(id);
  return { hull: m.hull, detail: m.detail, focus: m.core ?? FOCUS[id] ?? ([0.32, 0] as const) };
}

// ── pure draw helpers (nose-up; mirror the gallery) ──────────────────────────
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function hullPath(ctx: C, pts: ReadonlyArray<Pt>, s: number): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][1] * s, y = -pts[i][0] * s;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}
function polyline(ctx: C, pts: ReadonlyArray<Pt>, s: number): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][1] * s, y = -pts[i][0] * s;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
}
const HEX: ReadonlyArray<readonly [number, number]> = [[0, -1], [0.866, -0.5], [0.866, 0.5], [0, 1], [-0.866, 0.5], [-0.866, -0.5]];
function glyph(ctx: C, cx: number, cy: number, r: number, seed: number, col: string, a: number): void {
  ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  const n = 3 + (seed % 3); ctx.beginPath();
  for (let i = 0; i < n; i++) { const p = HEX[(seed * (i + 1)) % 6]; if (i) ctx.lineTo(cx + p[0] * r, cy + p[1] * r); else ctx.moveTo(cx + p[0] * r, cy + p[1] * r); }
  ctx.stroke();
}
function glyphRing(ctx: C, s: number, T: number, rm: boolean, baseCol: string, litCol: string, litFrac: number, spin: number, N: number): void {
  const rad = s * 1.12; ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < N; i++) { const a = (rm ? 0.3 : spin * T) + i / N * 6.283; const gx = Math.cos(a) * rad, gy = Math.sin(a) * rad; const lit = (i / N) < litFrac; glyph(ctx, gx, gy, 4.6, i * 13 + 3, lit ? litCol : baseCol, lit ? 0.95 : 0.45); }
  ctx.restore();
}
function outline(ctx: C, m: SkinModel, s: number, rimCol: string, accCol: string): void {
  hullPath(ctx, m.hull, s); ctx.fillStyle = '#0a0b0f'; ctx.fill(); ctx.strokeStyle = rimCol; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.stroke();
  if (m.detail) { polyline(ctx, m.detail, s); ctx.strokeStyle = accCol; ctx.lineWidth = 1.2; ctx.stroke(); }
}

interface Ident { a: string; b: string; b2: string; cold: string; }
const ID: Record<string, Ident> = {
  lance: { a: '#22d3ee', b: '#a5f3fc', b2: '#7dd3fc', cold: '#0e3a44' },
  glaive: { a: '#ec4899', b: '#f9a8d4', b2: '#fb7185', cold: '#3a1230' },
  bastion: { a: '#34d399', b: '#a7f3d0', b2: '#5eead4', cold: '#0e3a2c' },
  tempest: { a: '#818cf8', b: '#c7d2fe', b2: '#38bdf8', cold: '#1e2350' },
  phantom: { a: '#c084fc', b: '#e9d5ff', b2: '#e879f9', cold: '#2a1840' },
  reaver: { a: '#ef4444', b: '#fca5a5', b2: '#fb923c', cold: '#3a1414' },
};
function rimStroke(ctx: C, m: SkinModel, s: number, col: string, glow: string | null, w: number): void {
  hullPath(ctx, m.hull, s); ctx.strokeStyle = col; ctx.lineWidth = w || 2.2; ctx.lineJoin = 'round';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 8; } ctx.stroke(); ctx.shadowBlur = 0;
}
function spineStroke(ctx: C, m: SkinModel, s: number, col: string, w: number): void {
  if (!m.detail) return; polyline(ctx, m.detail, s); ctx.strokeStyle = col; ctx.lineWidth = w || 1.3; ctx.stroke();
}
function clipHull(ctx: C, m: SkinModel, s: number): void { hullPath(ctx, m.hull, s); ctx.clip(); }
function facets(ctx: C, m: SkinModel, s: number, cx: number, cy: number, col: string, lw: number, a: number): void {
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = lw;
  for (let i = 0; i < m.hull.length; i++) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(m.hull[i][1] * s, -m.hull[i][0] * s); ctx.stroke(); }
  ctx.restore();
}
function sheen(ctx: C, m: SkinModel, s: number, col: string, a: number): void {
  ctx.save(); clipHull(ctx, m, s); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = col || '#ffffff';
  ctx.beginPath(); ctx.ellipse(-s * 0.12, -s * 0.62, s * 0.5, s * 1.0, 0, 0, 6.283); ctx.fill(); ctx.restore();
}
function dist(ax: number, ay: number, bx: number, by: number): number { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
function edgePts(m: SkinModel, i: number, s: number): [number, number, number, number] {
  const a = m.hull[i], b = m.hull[(i + 1) % m.hull.length]; return [a[1] * s, -a[0] * s, b[1] * s, -b[0] * s];
}
function edgeBeads(ctx: C, m: SkinModel, s: number, col: string, r: number, a: number, sp: number): void {
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = col;
  for (let i = 0; i < m.hull.length; i++) { const e = edgePts(m, i, s); const ex = e[2] - e[0], ey = e[3] - e[1]; const len = Math.sqrt(ex * ex + ey * ey); const n = Math.max(1, Math.round(len / sp)); for (let k = 1; k < n; k++) { const t = k / n; ctx.beginPath(); ctx.arc(e[0] + ex * t, e[1] + ey * t, r, 0, 6.283); ctx.fill(); } }
  ctx.restore();
}
function edgeTicks(ctx: C, m: SkinModel, s: number, col: string, a: number, sp: number, lenT: number): void {
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 0.9; clipHull(ctx, m, s);
  for (let i = 0; i < m.hull.length; i++) { const e = edgePts(m, i, s); const ex = e[2] - e[0], ey = e[3] - e[1]; const len = Math.sqrt(ex * ex + ey * ey); if (len < 1) continue; const nx = -ey / len, ny = ex / len; const n = Math.max(2, Math.round(len / sp)); for (let k = 1; k < n; k++) { const t = k / n, px = e[0] + ex * t, py = e[1] + ey * t; ctx.beginPath(); ctx.moveTo(px - nx * lenT, py - ny * lenT); ctx.lineTo(px + nx * lenT, py + ny * lenT); ctx.stroke(); } }
  ctx.restore();
}
function keyOn(id: string, vx: number, vy: number, w: number, cx: number, cy: number, s: number): boolean {
  if (id === 'bastion') return dist(vx, vy, 0, 0) < w * s * 0.95;
  if (id === 'reaver') return dist(vx, vy, cx, cy) < w * s * 1.05;
  if (id === 'glaive') return dist(vx, vy, 0, 0) < w * s * 1.15;
  if (id === 'phantom') return Math.abs(vy - (0.4 - 1.0 * w) * s) < s * 0.45;
  return vy > (0.9 - 1.85 * w) * s;
}
function lightPass(ctx: C, m: SkinModel, s: number): void {
  ctx.save(); clipHull(ctx, m, s); ctx.globalCompositeOperation = 'lighter';
  const kg = ctx.createLinearGradient(-s * 0.7, -1.2 * s, s * 0.5, 0.7 * s); kg.addColorStop(0, 'rgba(255,255,255,0.16)'); kg.addColorStop(0.45, 'rgba(255,255,255,0.04)'); kg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = kg; ctx.fillRect(-2 * s, -2 * s, 4 * s, 4 * s);
  ctx.globalCompositeOperation = 'source-over';
  const sg = ctx.createLinearGradient(s * 0.2, 0.1 * s, s * 0.8, 1.0 * s); sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.26)'); ctx.fillStyle = sg; ctx.fillRect(-2 * s, -2 * s, 4 * s, 4 * s);
  ctx.restore();
}

// ── SET I — THE ENCRYPTION ───────────────────────────────────────────────────
function drawEncryption(ctx: C, m: SkinModel, id: string, s: number, T: number, rm: boolean, silh: boolean): void {
  const c = ID[id];
  if (silh) { outline(ctx, m, s, '#cbd5e1', c.a); return; }
  const fk = rm ? 1 : (Math.sin(T * 2.3) * 0.5 + 0.5);
  const f = m.focus, cx = f[1] * s, cy = -f[0] * s;
  hullPath(ctx, m.hull, s); const bg = ctx.createLinearGradient(-s * 0.4, -1.4 * s, s * 0.4, 0.9 * s); bg.addColorStop(0, c.cold); bg.addColorStop(0.5, '#232b36'); bg.addColorStop(1, '#0f131a'); ctx.fillStyle = bg; ctx.fill();
  lightPass(ctx, m, s);
  ctx.save(); clipHull(ctx, m, s);
  facets(ctx, m, s, cx, cy, rgba('#8aa0b8', 0.20), 1, 1);
  sheen(ctx, m, s, '#aebccd', 0.10);
  if (id === 'lance') {
    for (let rr = 0; rr < 3; rr++) { const rad = s * (0.2 + rr * 0.16); ctx.strokeStyle = rgba(rr === 1 ? c.b2 : '#aebccd', 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 6.283); ctx.stroke(); const spin = (rm ? 0 : T * (0.18 + rr * 0.12)) * (rr % 2 ? -1 : 1); for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283 + spin; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); ctx.lineTo(cx + Math.cos(a) * (rad + 2.4), cy + Math.sin(a) * (rad + 2.4)); ctx.stroke(); } }
    glyph(ctx, cx, cy - s * 0.55, 4, 7, c.a, 0.7);
  } else if (id === 'glaive') {
    ctx.strokeStyle = rgba('#7a8596', 0.35); ctx.lineWidth = 0.8; for (let hr = 0; hr < 6; hr++) { const hy = (-0.62 + hr * 0.24) * s; ctx.beginPath(); ctx.moveTo(-s * 0.42, hy); ctx.lineTo(s * 0.42, hy); ctx.stroke(); }
    const head = rm ? 2 : (Math.floor(((T * 0.6) % 1) * 6));
    for (let r = 0; r < 6; r++) for (let cc = 0; cc < 4; cc++) { const gx = (-0.34 + cc * 0.22) * s, gy = (-0.62 + r * 0.24) * s; const on = ((r * 4 + cc) * 7) % 3 === 0; ctx.fillStyle = on ? rgba(r === head ? c.b2 : c.a, r === head ? 1 : 0.55) : rgba('#6b7686', 0.4); ctx.beginPath(); ctx.arc(gx, gy, (r === head && on) ? 2.1 : 1.7, 0, 6.283); ctx.fill(); }
    const hy2 = (-0.62 + head * 0.24) * s; ctx.strokeStyle = rgba(c.b2, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s * 0.42, hy2); ctx.lineTo(s * 0.42, hy2); ctx.stroke();
  } else if (id === 'bastion') {
    for (let p = 0; p < 3; p++) { const py = (-0.42 + p * 0.42) * s; ctx.fillStyle = rgba('#1a222c', 0.6); ctx.fillRect(-s * 0.5, py - s * 0.13, s * 1.0, s * 0.26); ctx.strokeStyle = rgba('#aebccd', 0.5); ctx.lineWidth = 1.1; ctx.strokeRect(-s * 0.5, py - s * 0.13, s * 1.0, s * 0.26); ctx.strokeStyle = rgba(c.b2, 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s * 0.5, py - s * 0.07); ctx.lineTo(s * 0.5, py - s * 0.07); ctx.stroke(); }
    ctx.fillStyle = rgba(c.a, 0.7); for (let b = 0; b < 4; b++) { const bx = (-0.36 + b * 0.24) * s; ctx.beginPath(); ctx.arc(bx, -s * 0.42, 1.6, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(bx, s * 0.42, 1.6, 0, 6.283); ctx.fill(); }
  } else if (id === 'tempest') {
    ctx.strokeStyle = rgba(c.a, 0.75); ctx.lineWidth = 1.3; ctx.beginPath(); for (let x = -0.62; x <= 0.62; x += 0.04) { const yy = Math.sin(x * 9 + (rm ? 0 : T * 4)) * 0.12 + Math.sin(x * 22 + (rm ? 0 : T * 7)) * 0.04; if (x <= -0.62) ctx.moveTo(x * s, yy * s); else ctx.lineTo(x * s, yy * s); } ctx.stroke();
    ctx.strokeStyle = rgba(c.b2, 0.45); ctx.lineWidth = 0.9; ctx.beginPath(); for (let x2 = -0.62; x2 <= 0.62; x2 += 0.04) { const yy2 = Math.sin(x2 * 14 - (rm ? 0 : T * 5)) * 0.06; if (x2 <= -0.62) ctx.moveTo(x2 * s, yy2 * s + s * 0.02); else ctx.lineTo(x2 * s, yy2 * s + s * 0.02); } ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let sw = 0; sw < 3; sw++) { ctx.save(); ctx.rotate(rm ? 0 : (T * 1.1 - sw * 0.18)); const rgw = ctx.createLinearGradient(0, 0, s * 0.9, 0); rgw.addColorStop(0, rgba(c.a, 0.4 - sw * 0.13)); rgw.addColorStop(1, rgba(c.a, 0)); ctx.strokeStyle = rgw; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.9, 0); ctx.stroke(); ctx.restore(); } ctx.restore();
  } else if (id === 'phantom') {
    glyph(ctx, 0, -s * 0.1, s * 0.5, 4, c.a, rm ? 0.12 : 0.07 + 0.08 * fk);
    for (let gi = 0; gi < 6; gi++) { const litg = (gi === ((Math.floor((rm ? 1 : T) * 1.5)) % 6)); glyph(ctx, 0, -s * 0.75 + gi * s * 0.3, 3.2, gi * 7 + 2, litg ? c.b2 : c.a, litg ? 0.95 : 0.4); }
  } else if (id === 'reaver') {
    const flash = rm ? 0 : (Math.sin(T * 9) > 0.85 ? 1 : 0);
    ctx.globalCompositeOperation = 'lighter'; for (let gt = 0; gt < 4; gt++) { const gy3 = (-0.5 + gt * 0.32 + (rm ? 0 : Math.sin(T * 4 + gt * 1.7) * 0.06)) * s; const off = (rm ? 0 : Math.sin(T * 13 + gt) * 3); ctx.fillStyle = rgba(c.a, 0.12 + 0.12 * flash); ctx.fillRect(-s * 0.6 + off, gy3, s * 1.2, 2); ctx.fillStyle = rgba('#22d3ee', 0.06 + 0.14 * flash); ctx.fillRect(-s * 0.6 - off, gy3 + 1, s * 1.2, 1); }
    ctx.globalCompositeOperation = 'source-over';
    const cg: ReadonlyArray<readonly [number, number]> = [[-0.3, 0.8], [-0.3, -0.8], [-0.18, 0]]; for (let ci = 0; ci < cg.length; ci++) { const px = cg[ci][1] * s, pyy = -cg[ci][0] * s; glyph(ctx, px, pyy, 4.2, ci * 9 + 5, c.a, rm ? 0.9 : 0.35 + 0.6 * fk); glyph(ctx, px + 1.6 + flash * 2, pyy - 1, 4.2, ci * 9 + 5, c.b2, 0.25); }
  }
  edgeTicks(ctx, m, s, rgba('#9fb3c8', 0.3), 0.6, 9, 2.2);
  ctx.restore();
  if (id === 'lance' || id === 'tempest') glyphRing(ctx, s, T, rm, '#94a3b8', c.a, 0.2, 0.3, 6);
  edgeBeads(ctx, m, s, rgba(c.a, 0.5), 1.1, 0.7, 16);
  for (let vi = 0; vi < m.hull.length; vi++) { const vx = m.hull[vi][1] * s, vy = -m.hull[vi][0] * s; ctx.fillStyle = rgba('#0c1018', 0.9); ctx.fillRect(vx - 2, vy - 2, 4, 4); ctx.strokeStyle = rgba(c.a, vi === 0 ? (0.5 + 0.5 * fk) : 0.55); ctx.lineWidth = 0.9; ctx.strokeRect(vx - 2, vy - 2, 4, 4); }
  rimStroke(ctx, m, s, '#aebccd', null, 2.4);
  hullPath(ctx, m.hull, s); ctx.strokeStyle = rgba(c.a, 0.6); ctx.lineWidth = 1; ctx.shadowColor = c.a; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0;
  spineStroke(ctx, m, s, rgba(c.a, 0.85), 1.2);
  if (id === 'bastion') {
    ctx.fillStyle = '#10161d'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.18, 0, 6.283); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rm ? 0 : T * 0.5);
    ctx.strokeStyle = rgba(c.a, 0.9); ctx.lineWidth = 1.4; ctx.shadowColor = c.a; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(0, 0, s * 0.18, 0, 6.283); ctx.stroke(); ctx.shadowBlur = 0;
    for (let sbo = 0; sbo < 8; sbo++) { const sa = sbo / 8 * 6.283; const bp = rm ? 0.85 : (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(T * 4 - sbo * 0.8))); ctx.fillStyle = rgba(sbo % 2 ? c.b2 : c.a, bp); ctx.beginPath(); ctx.arc(Math.cos(sa) * s * 0.18, Math.sin(sa) * s * 0.18, 1.5, 0, 6.283); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = rgba(c.a, 0.7); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - s * 0.1, cy); ctx.lineTo(cx + s * 0.1, cy); ctx.moveTo(cx, cy - s * 0.1); ctx.lineTo(cx, cy + s * 0.1); ctx.stroke();
  } else {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rm ? 0 : T * 0.4); ctx.strokeStyle = rgba(c.b2, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, s * 0.26, 0.3, 2.4); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.26, 3.4, 5.5); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = rgba(c.a, 0.9); ctx.lineWidth = 1.2; ctx.shadowColor = c.a; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.2, -0.6, 0.6); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, s * 0.2, Math.PI - 0.6, Math.PI + 0.6); ctx.stroke();
    ctx.strokeRect(cx - s * 0.1, cy - s * 0.1, s * 0.2, s * 0.2); ctx.shadowBlur = 0;
    ctx.fillStyle = rgba(c.a, id === 'reaver' ? (0.4 + 0.6 * fk) : 1); ctx.beginPath(); ctx.arc(cx, cy, s * 0.045, 0, 6.283); ctx.fill();
  }
}

// ── SET II — THE KEY ─────────────────────────────────────────────────────────
function drawKey(ctx: C, m: SkinModel, id: string, s: number, T: number, rm: boolean, silh: boolean): void {
  const c = ID[id];
  if (silh) { outline(ctx, m, s, '#fcd34d', c.a); return; }
  const spd = id === 'tempest' ? 1.3 : 0.7;
  const w = rm ? 0.62 : (Math.sin(T * spd) * 0.5 + 0.5);
  const f = m.focus, cx = f[1] * s, cy = -f[0] * s;
  const wy = (0.9 - 1.85 * w) * s, ur = Math.max(1, w * s * 0.95), er = Math.max(1, w * s * 1.05), cutY = (0.4 - 1.0 * w) * s;
  const shim = rm ? 1 : (0.7 + 0.3 * Math.sin(T * 6));
  hullPath(ctx, m.hull, s); const bg = ctx.createLinearGradient(0, -1.4 * s, 0, 0.9 * s); bg.addColorStop(0, c.cold); bg.addColorStop(0.5, '#222631'); bg.addColorStop(1, '#13161d'); ctx.fillStyle = bg; ctx.fill();
  lightPass(ctx, m, s);
  ctx.save(); clipHull(ctx, m, s);
  sheen(ctx, m, s, '#c7d2fe', 0.08);
  facets(ctx, m, s, cx, cy, rgba('#7e8aa0', 0.18), 1, 1);
  glyph(ctx, cx, cy, s * 0.34, 5, c.b2, rm ? 0.18 : 0.1 + 0.12 * (1 - w));
  if (id === 'lance') {
    const g = ctx.createLinearGradient(0, 0.9 * s, 0, wy); g.addColorStop(0, '#fb923c'); g.addColorStop(0.6, '#fde68a'); g.addColorStop(1, '#fff7cd'); ctx.fillStyle = g; ctx.fillRect(-s, wy, 2 * s, 0.9 * s - wy + 2);
  } else if (id === 'glaive') {
    ctx.globalCompositeOperation = 'lighter'; const sh: ReadonlyArray<readonly [number, number]> = [[-0.5, 0.6], [-0.1, 0.85], [0.3, 0.55], [0.6, 0.1], [0.25, -0.45], [-0.2, -0.8], [-0.55, -0.5]]; for (let i = 0; i < sh.length; i++) { if ((i / sh.length) >= w) continue; const nx = sh[(i + 1) % sh.length]; const gg = ctx.createLinearGradient(0, 0, sh[i][1] * s, -sh[i][0] * s); gg.addColorStop(0, '#fff7cd'); gg.addColorStop(1, i % 2 ? '#fde68a' : '#fb923c'); ctx.fillStyle = gg; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sh[i][1] * s, -sh[i][0] * s); ctx.lineTo(nx[1] * s, -nx[0] * s); ctx.closePath(); ctx.fill(); } ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  } else if (id === 'bastion') {
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, ur); rg.addColorStop(0, '#fff7cd'); rg.addColorStop(0.5, '#fde68a'); rg.addColorStop(1, '#fb923c'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, ur, 0, 6.283); ctx.fill();
  } else if (id === 'tempest') {
    const g2 = ctx.createLinearGradient(0, 0.9 * s, 0, wy); g2.addColorStop(0, '#fb923c'); g2.addColorStop(1, '#fde68a'); ctx.fillStyle = g2; ctx.fillRect(-s, wy, 2 * s, 0.9 * s - wy + 2);
  } else if (id === 'phantom') {
    ctx.globalCompositeOperation = 'lighter'; const grd = ctx.createLinearGradient(0, cutY + s * 0.4, 0, cutY - s * 0.4); grd.addColorStop(0, rgba('#fb923c', 0)); grd.addColorStop(0.5, rgba('#fde68a', 0.9)); grd.addColorStop(1, rgba('#fb923c', 0)); ctx.fillStyle = grd; ctx.fillRect(-s, cutY - s * 0.4, 2 * s, s * 0.8); ctx.globalCompositeOperation = 'source-over';
  } else if (id === 'reaver') {
    const rg2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, er); rg2.addColorStop(0, '#fff7cd'); rg2.addColorStop(0.5, '#fb923c'); rg2.addColorStop(1, rgba('#fb7185', 0)); ctx.fillStyle = rg2; ctx.beginPath(); ctx.arc(cx, cy, er, 0, 6.283); ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let vi = 0; vi < m.hull.length; vi++) { const vx = m.hull[vi][1] * s, vy = -m.hull[vi][0] * s; if (keyOn(id, vx, vy, w, cx, cy, s)) { ctx.strokeStyle = rgba('#fde68a', 0.3 + 0.4 * shim); ctx.lineWidth = 1.2; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(vx, vy); ctx.stroke(); } }
  ctx.shadowBlur = 0; ctx.restore();
  for (let ei = 0; ei < m.hull.length; ei++) { const e = edgePts(m, ei, s); const ex = e[2] - e[0], ey = e[3] - e[1]; const elen = Math.sqrt(ex * ex + ey * ey); const en = Math.max(1, Math.round(elen / 14)); for (let kk = 1; kk < en; kk++) { const tt = kk / en, bxp = e[0] + ex * tt, byp = e[1] + ey * tt; const onb = keyOn(id, bxp, byp, w, cx, cy, s); ctx.fillStyle = onb ? rgba('#fde68a', 0.9) : rgba('#6b7280', 0.5); ctx.beginPath(); ctx.arc(bxp, byp, onb ? 1.5 : 1, 0, 6.283); ctx.fill(); } }
  for (let vj = 0; vj < m.hull.length; vj++) { const wx = m.hull[vj][1] * s, wyy = -m.hull[vj][0] * s; if (keyOn(id, wx, wyy, w, cx, cy, s)) { ctx.fillStyle = '#fff7cd'; ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 7; ctx.beginPath(); ctx.arc(wx, wyy, 1.8 + 0.8 * shim, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; } else { ctx.fillStyle = rgba('#6b7280', 0.6); ctx.beginPath(); ctx.arc(wx, wyy, 1.4, 0, 6.283); ctx.fill(); } }
  if (id === 'lance' || id === 'tempest') { ctx.save(); clipHull(ctx, m, s); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba('#ffffff', 0.9); ctx.lineWidth = 2; ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(-s, wy); ctx.lineTo(s, wy); ctx.stroke(); if (id === 'tempest') { for (let st = 1; st < 3; st++) { ctx.strokeStyle = rgba('#fff7cd', 0.4 - st * 0.12); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-s, wy + st * 5); ctx.lineTo(s, wy + st * 5); ctx.stroke(); } } ctx.shadowBlur = 0; ctx.restore(); }
  rimStroke(ctx, m, s, '#fcd34d', '#fbbf24', 2.3);
  hullPath(ctx, m.hull, s); ctx.strokeStyle = rgba('#fff7cd', 0.5); ctx.lineWidth = 1; ctx.stroke();
  spineStroke(ctx, m, s, rgba(c.b, 0.85), 1.2);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rm ? 0 : T * 0.6); ctx.strokeStyle = rgba('#fbbf24', 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 0.2, 2.6); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 3.3, 5.7); ctx.stroke(); ctx.restore();
  ctx.strokeStyle = rgba('#fde68a', 0.5); ctx.lineWidth = 1; for (let cr = 0; cr < 2; cr++) { ctx.beginPath(); ctx.arc(cx, cy, s * (0.12 + cr * 0.07) * (0.8 + 0.4 * w), 0, 6.283); ctx.stroke(); }
  ctx.strokeStyle = rgba('#fff7cd', 0.9); ctx.lineWidth = 1.2; const rays = id === 'phantom' ? 2 : 8; for (let k = 0; k < rays; k++) { const a = k / rays * 6.283 + (rm ? 0 : T * 0.6); const rr2 = s * (0.1 + 0.18 * (0.5 + 0.5 * Math.sin((rm ? 1 : T * 3) + k))); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); ctx.stroke(); }
  ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(cx, cy, s * 0.075, 0, 6.283); ctx.fill(); ctx.restore();
}

// ── SET III — FIRST LIGHT ────────────────────────────────────────────────────
function drawFirstLight(ctx: C, m: SkinModel, id: string, s: number, T: number, rm: boolean, silh: boolean): void {
  const c = ID[id];
  if (silh) { outline(ctx, m, s, '#fff1c2', '#fb923c'); return; }
  const pulse = rm ? 0.7 : (0.5 + 0.5 * Math.sin(T * 1.4));
  const flare = rm ? 0 : Math.pow(0.5 + 0.5 * Math.sin(T * 0.8), 3);
  const f = m.focus, cx = f[1] * s, cy = -f[0] * s;
  const bloomR = id === 'glaive' ? 2.3 : (id === 'bastion' ? 2.2 : 2.05);
  const g = ctx.createRadialGradient(0, -s * 0.2, 0, 0, -s * 0.2, s * bloomR); g.addColorStop(0, rgba('#fff7cd', 0.55)); g.addColorStop(0.35, rgba('#fbbf24', 0.3)); g.addColorStop(0.7, rgba(c.a, 0.16)); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -s * 0.2, s * bloomR, 0, 6.283); ctx.fill();
  ctx.strokeStyle = rgba('#fde68a', 0.2 + 0.12 * pulse); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s * 1.5 + 4 * pulse, 0, 6.283); ctx.stroke();
  ctx.strokeStyle = rgba(c.a, 0.12 + 0.08 * pulse); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, s * 1.72 + 5 * pulse, 0, 6.283); ctx.stroke(); ctx.restore();
  hullPath(ctx, m.hull, s); const lg = ctx.createLinearGradient(0, -1.4 * s, 0, 0.9 * s);
  if (id === 'reaver') { lg.addColorStop(0, '#fff1c2'); lg.addColorStop(0.4, '#fb923c'); lg.addColorStop(1, '#ef4444'); }
  else if (id === 'glaive') { lg.addColorStop(0, '#fff7cd'); lg.addColorStop(0.45, '#fbbf24'); lg.addColorStop(1, '#ec4899'); }
  else if (id === 'tempest') { lg.addColorStop(0, '#c7d2fe'); lg.addColorStop(0.45, '#fde68a'); lg.addColorStop(1, '#fb923c'); }
  else if (id === 'phantom') { lg.addColorStop(0, '#fff7cd'); lg.addColorStop(0.5, '#fde68a'); lg.addColorStop(1, '#c084fc'); }
  else if (id === 'bastion') { lg.addColorStop(0, '#fff7cd'); lg.addColorStop(0.5, '#fcd34d'); lg.addColorStop(1, '#34d399'); }
  else { lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.5, '#fde047'); lg.addColorStop(1, '#fb923c'); }
  ctx.fillStyle = lg; ctx.fill();
  lightPass(ctx, m, s);
  ctx.save(); clipHull(ctx, m, s);
  ctx.globalCompositeOperation = 'lighter';
  for (let vi = 0; vi < m.hull.length; vi++) { const vx = m.hull[vi][1] * s, vy = -m.hull[vi][0] * s; const ry = ctx.createLinearGradient(cx, cy, vx, vy); ry.addColorStop(0, rgba('#ffffff', 0.5)); ry.addColorStop(0.7, rgba(c.b2, 0.18)); ry.addColorStop(1, rgba(id === 'glaive' ? '#f472b6' : '#fff7cd', 0)); ctx.strokeStyle = ry; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(vx, vy); ctx.stroke(); }
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(-s * 0.1, -s * 0.55, s * 0.5, s * 0.95, 0, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
  if (id === 'tempest') { ctx.strokeStyle = rgba('#fff7cd', 0.55); ctx.lineWidth = 2; for (let sgn = -1; sgn <= 1; sgn += 2) { ctx.beginPath(); ctx.moveTo(sgn * s * 0.1, -s * 0.2); ctx.lineTo(sgn * s * 0.6, s * 0.6); ctx.stroke(); } }
  else if (id === 'glaive') { const cols = ['#f472b6', '#fde68a', '#67e8f9']; for (let pc = 0; pc < 3; pc++) { ctx.strokeStyle = rgba(cols[pc], 0.55); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-s * 0.2 + pc * 3, -s * 0.6); ctx.lineTo(s * 0.5 + pc * 3, s * 0.4); ctx.stroke(); } }
  ctx.restore();
  edgeBeads(ctx, m, s, rgba('#fff1c2', 0.85), 1.3, 1, 13);
  for (let vj = 0; vj < m.hull.length; vj++) { const gx = m.hull[vj][1] * s, gy = -m.hull[vj][0] * s; const tw = rm ? 0.9 : (0.5 + 0.5 * Math.sin(T * 3 + vj * 1.3)); ctx.fillStyle = rgba('#ffffff', 0.6 + 0.4 * tw); ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 4 + 4 * tw; ctx.beginPath(); ctx.arc(gx, gy, 1.5 + 0.8 * tw, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; }
  rimStroke(ctx, m, s, '#fff1c2', '#fde68a', 2.3);
  spineStroke(ctx, m, s, rgba('#ffffff', 0.9), 1.3);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const cb = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.4); cb.addColorStop(0, rgba('#fff7cd', 0.8)); cb.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = cb; ctx.beginPath(); ctx.arc(cx, cy, s * 0.4, 0, 6.283); ctx.fill();
  ctx.strokeStyle = rgba(c.a, 0.5); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, s * 0.2, 0, 6.283); ctx.stroke();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rm ? 0 : T * 0.25); ctx.strokeStyle = rgba('#fff7cd', 0.85); ctx.lineWidth = 1.2;
  if (id === 'phantom') { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.65 * (0.8 + 0.4 * pulse)); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 0.3); ctx.stroke(); }
  else { const rays = id === 'bastion' ? 12 : 8; for (let k = 0; k < rays; k++) { const a = k / rays * 6.283; const r0 = s * 0.12, r1 = s * (0.22 + 0.07 * pulse); ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke(); } }
  ctx.restore();
  ctx.strokeStyle = rgba('#ffffff', 0.5 + 0.5 * flare); ctx.lineWidth = 1; const flr = s * (0.32 + 0.5 * flare); ctx.beginPath(); ctx.moveTo(cx - flr, cy); ctx.lineTo(cx + flr, cy); ctx.moveTo(cx, cy - flr); ctx.lineTo(cx, cy + flr); ctx.stroke();
  const coreR = id === 'bastion' ? s * 0.14 : s * 0.1; ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 14 + 10 * flare; ctx.beginPath(); ctx.arc(cx, cy, coreR * (1 + 0.2 * flare), 0, 6.283); ctx.fill(); ctx.restore();
  if (id === 'reaver') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba('#fb7185', 0.9); ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 6; const tips: ReadonlyArray<readonly [number, number]> = [[-0.35, 0.95], [-0.35, -0.95]]; for (let ti = 0; ti < tips.length; ti++) { ctx.beginPath(); ctx.arc(tips[ti][1] * s, -tips[ti][0] * s, 3, 0, 6.283); ctx.fill(); } ctx.restore(); }
}

const DRAW: Record<string, (ctx: C, m: SkinModel, id: string, s: number, T: number, rm: boolean, silh: boolean) => void> = {
  encryption: drawEncryption,
  key: drawKey,
  firstlight: drawFirstLight,
};

/** Draw the equipped skin's body for `shipId`, centred at the CURRENT transform origin. The
 *  caller owns translate + the nose-up→aim rotation (angle + π/2) and the surrounding glow /
 *  flash layers. No-op for an unknown/`'none'` set. Pure cosmetic — never touches sim. */
export function drawShipSkin(setId: string, shipId: string, ctx: C, scale: number, t: number, opts: ShipSkinOpts): void {
  const fn = DRAW[setId];
  if (!fn) return;
  fn(ctx, modelFor(shipId), shipId, scale, t, opts.reduceMotion, false);
}
