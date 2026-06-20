// Avatar visual layer — shared SVG primitives.
//
// Pure helpers: an accent → metallic-palette deriver, the uid-namespacing `ref`
// helper, the shared `<defs>` block (core/flash/bezel/glass gradients + blur
// filters + hex clip), and the reusable symbol groups (ray-burst, stud rings,
// guilloché) that the tiered frame `<use>`s. No DOM, no rng, no game state —
// every output is deterministic for the same inputs.
//
// ‼ id namespacing (see design §3.6): 24 medallions render on one grid. Every
// `id` and every `url(#…)` ref MUST be suffixed with the instance `uid`, or the
// gradients/filters/clips collide and corrupt each other's fills. Build ids via
// `ref(name, uid)` and never hardcode a bare `id="x"`.

/** `id`/`url(#…)` suffix helper — `ref('bz', uid)` → `"bz-uid"`. */
export const ref = (name: string, uid: string): string => `${name}-${uid}`;

/** XML-escape text for `<title>`/`<desc>` (names carry apostrophes etc.). */
export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── geometry (medallion-local, centred at 0,0) ────────────────────────────
/** Pointy-top hexagon, radius R=72 — the hex window. */
export const HEX = '0,-72 62.4,-36 62.4,36 0,72 -62.4,36 -62.4,-36';
/** Inner hairline hexagon (r≈63). */
export const HEX_INNER = '0,-63 54.6,-31.5 54.6,31.5 0,63 -54.6,31.5 -54.6,-31.5';
/** Top-cap glass highlight sweeping the upper three hex edges. */
export const GLASS_PATH = 'M -62 -36 L 0 -72 L 62.4 -36 L 40 -20 Q 0 -44 -40 -20 Z';
/** The six hex-vertex directions (deg), clockwise from top. */
export const HEX_DIRS = [-90, -30, 30, 90, 150, 210];

// ── colour maths ───────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** A medallion's full derived colour set — metallic bezel ramp + core glow +
 *  scene-friendly tones, all keyed off the accent's hue/saturation so any of
 *  the 24 accents yields a coherent neon-on-dark-metal medallion. */
export interface Palette {
  accent: string;
  /** near-black hex-window backdrop, hue-tinted */
  bg: string;
  /** rgb triplet of the accent, e.g. "125,249,255" — for rgba() in scenes */
  rgb: string;
  /** bezel brushed light-sweep stops (dark → bright → near-white → bright → dark) */
  bz: [string, string, string, string, string];
  /** core radial-gradient stops: white → light → deep → dark(transparent) */
  core: [string, string, string, string];
  light: string;   // accent tint, bright
  hilite: string;  // near-white accent tint (studs, edge highlights)
  mid: string;     // saturated mid
  deep: string;    // saturated darker
  dark: string;    // deep shadow tint
  bevel: string;   // inner groove stroke
}

/** Derive an arbitrary tone from an accent's hue: saturation multiplier + target
 *  lightness (0–1). Lets scenes build bespoke gradients keyed to their accent. */
export function tone(accent: string, sMul: number, l: number): string {
  const [r, g, b] = hexToRgb(accent);
  const [h, s0] = rgbToHsl(r, g, b);
  return hslToHex(h, Math.max(0.45, s0) * sMul, l);
}

/** Derive the full palette from a single accent hex. Pure. */
export function paletteFor(accent: string): Palette {
  const [r, g, b] = hexToRgb(accent);
  const [h, s0] = rgbToHsl(r, g, b);
  const s = Math.max(0.45, s0); // keep enough chroma for the metal to read
  return {
    accent,
    rgb: `${r},${g},${b}`,
    bg: hslToHex(h, Math.min(0.7, s * 0.7), 0.055),
    bz: [
      hslToHex(h, s * 0.55, 0.12),
      hslToHex(h, Math.min(1, s * 0.92), 0.6),
      hslToHex(h, s * 0.4, 0.95),
      hslToHex(h, Math.min(1, s * 0.92), 0.5),
      hslToHex(h, s * 0.6, 0.085),
    ],
    core: [
      '#ffffff',
      hslToHex(h, Math.min(1, s + 0.08), 0.8),
      hslToHex(h, s, 0.42),
      hslToHex(h, s, 0.16),
    ],
    light: hslToHex(h, Math.min(1, s + 0.05), 0.8),
    hilite: hslToHex(h, s * 0.5, 0.9),
    mid: hslToHex(h, s, 0.62),
    deep: hslToHex(h, s, 0.46),
    dark: hslToHex(h, s * 0.7, 0.13),
    bevel: hslToHex(h, s * 0.7, 0.06),
  };
}

// ── shared defs ──────────────────────────────────────────────────────────
/** Whether to include the wide gaussian-blur halo filter (skipped on tiles). */
export interface DefsOpts { tier: 1 | 2 | 3; halo: boolean; }

/** The shared `<defs>` for one medallion instance: gradients, blur filters,
 *  the hex clip, and the tier-appropriate symbol groups. All ids uid-suffixed. */
export function defsFor(accent: string, uid: string, opts: DefsOpts): string {
  const p = paletteFor(accent);
  const id = (n: string) => ref(n, uid);
  const parts: string[] = [];

  // core glow — white → accent light → deep → transparent
  parts.push(
    `<radialGradient id="${id('core')}" cx="50%" cy="45%" r="55%">` +
      `<stop offset="0%" stop-color="${p.core[0]}"/>` +
      `<stop offset="35%" stop-color="${p.core[1]}"/>` +
      `<stop offset="70%" stop-color="${p.core[2]}"/>` +
      `<stop offset="100%" stop-color="${p.core[3]}" stop-opacity="0"/>` +
      `</radialGradient>`,
  );
  // full-field impact / bloom flash
  parts.push(
    `<radialGradient id="${id('flash')}" cx="50%" cy="50%" r="50%">` +
      `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>` +
      `<stop offset="45%" stop-color="${p.accent}" stop-opacity="0.35"/>` +
      `<stop offset="100%" stop-color="${p.accent}" stop-opacity="0"/>` +
      `</radialGradient>`,
  );
  // bezel brushed metal
  parts.push(
    `<linearGradient id="${id('bz')}" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="${p.bz[0]}"/>` +
      `<stop offset="35%" stop-color="${p.bz[1]}"/>` +
      `<stop offset="50%" stop-color="${p.bz[2]}"/>` +
      `<stop offset="66%" stop-color="${p.bz[3]}"/>` +
      `<stop offset="100%" stop-color="${p.bz[4]}"/>` +
      `</linearGradient>`,
  );
  // glass cap highlight (accent-independent)
  parts.push(
    `<linearGradient id="${id('glass')}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.5"/>` +
      `<stop offset="40%" stop-color="#ffffff" stop-opacity="0.06"/>` +
      `<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>` +
      `</linearGradient>`,
  );
  // blur filters
  parts.push(
    `<filter id="${id('bl')}" x="-60%" y="-60%" width="220%" height="220%">` +
      `<feGaussianBlur stdDeviation="2.2"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    `<filter id="${id('blS')}" x="-80%" y="-80%" width="260%" height="260%">` +
      `<feGaussianBlur stdDeviation="1.1"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
  );
  if (opts.halo) {
    parts.push(
      `<filter id="${id('big')}" x="-130%" y="-130%" width="360%" height="360%"><feGaussianBlur stdDeviation="10"/></filter>`,
    );
  }
  // hex clip
  parts.push(`<clipPath id="${id('hx')}"><polygon points="${HEX}"/></clipPath>`);
  // stud rings
  parts.push(studs6Def(uid));
  if (opts.tier >= 2) {
    parts.push(studs12Def(uid), raysDef(uid), guilDef(uid));
  }
  return `<defs>${parts.join('')}</defs>`;
}

/** 6 small studs at the hex vertices (tier I). */
function studs6Def(uid: string): string {
  return (
    `<g id="${ref('r6', uid)}" fill="currentColor">` +
    `<circle cx="0" cy="-72" r="1.9"/><circle cx="62.4" cy="-36" r="1.9"/><circle cx="62.4" cy="36" r="1.9"/>` +
    `<circle cx="0" cy="72" r="1.9"/><circle cx="-62.4" cy="36" r="1.9"/><circle cx="-62.4" cy="-36" r="1.9"/></g>`
  );
}

/** 12 studs — vertices + edge midpoints (tier II/III). */
function studs12Def(uid: string): string {
  return (
    `<g id="${ref('r12', uid)}" fill="currentColor">` +
    `<circle cx="0" cy="-72" r="2.6"/><circle cx="62.4" cy="-36" r="2.6"/><circle cx="62.4" cy="36" r="2.6"/>` +
    `<circle cx="0" cy="72" r="2.6"/><circle cx="-62.4" cy="36" r="2.6"/><circle cx="-62.4" cy="-36" r="2.6"/>` +
    `<circle cx="31.2" cy="-54" r="1.7"/><circle cx="62.4" cy="0" r="1.7"/><circle cx="31.2" cy="54" r="1.7"/>` +
    `<circle cx="-31.2" cy="54" r="1.7"/><circle cx="-62.4" cy="0" r="1.7"/><circle cx="-31.2" cy="-54" r="1.7"/></g>`
  );
}

/** 12 radial rays r42→92 (tier II/III ray-burst). */
function raysDef(uid: string): string {
  const lines: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    const c = Math.cos(a), s = Math.sin(a);
    const r1 = 42, r2 = 92;
    lines.push(
      `<line x1="${(c * r1).toFixed(1)}" y1="${(s * r1).toFixed(1)}" x2="${(c * r2).toFixed(1)}" y2="${(s * r2).toFixed(1)}"/>`,
    );
  }
  return `<g id="${ref('rays', uid)}" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">${lines.join('')}</g>`;
}

/** 9 overlapping ellipses → engine-turned guilloché texture (tier II/III). */
function guilDef(uid: string): string {
  const e: string[] = [];
  for (let i = 0; i < 9; i++) {
    const rot = i === 0 ? '' : ` transform="rotate(${i * 20})"`;
    e.push(`<ellipse rx="96" ry="80"${rot}/>`);
  }
  return `<g id="${ref('guil', uid)}" fill="none" stroke="currentColor" stroke-width="0.5">${e.join('')}</g>`;
}
