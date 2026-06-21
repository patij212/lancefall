// src/cipherSigils.ts — PURE. The designed cipher mark set: 10 maximally-distinct sigils
// that replace the confusable Greek alphabet (Σ Δ Λ Φ Ψ Ω Θ Ξ Π Γ) on the boss cipher
// cores + the READ THE KEY legend. ONE source of truth — an SVG path per sigil — consumed
// by BOTH the canvas cores (via Path2D in render.ts) and the DOM legend (via inline <svg>
// in ui.ts), so a mark looks identical in both places. No DOM, no ctx; fully unit-tested.

export interface SigilDef {
  /** SVG path 'd' for the stroked mark, normalised to a 0..100 box (centre 50,50). */
  d: string;
  /** optional filled centre dot [cx, cy, r] (the orb / crescent accent). */
  dot?: readonly [number, number, number];
}

// Deliberately distinct silhouettes — orb, spire, rift, cascade, beam, ward, burst,
// crescent, trident, coil — so a mark reads at a glance, under motion, colourblind.
export const SIGILS: readonly SigilDef[] = [
  { d: 'M74 50 A24 24 0 1 0 26 50 A24 24 0 1 0 74 50', dot: [50, 50, 5] }, // 0 orb
  { d: 'M50 20 L79 73 L21 73 Z M35 56 L65 56' },                          // 1 spire
  { d: 'M50 18 L80 50 L50 82 L20 50 Z M50 31 L50 69' },                   // 2 rift
  { d: 'M26 45 L50 28 L74 45 M26 67 L50 50 L74 67' },                     // 3 cascade
  { d: 'M50 20 L50 80 M34 20 L66 20 M34 80 L66 80' },                     // 4 beam
  { d: 'M50 18 L78 34 L78 66 L50 82 L22 66 L22 34 Z' },                   // 5 ward
  { d: 'M50 20 L50 80 M27 33 L73 67 M73 33 L27 67' },                     // 6 burst
  { d: 'M68 27 A30 30 0 1 0 68 73', dot: [72, 50, 4.5] },                 // 7 crescent
  { d: 'M50 80 L50 20 M50 37 L34 22 M50 37 L66 22 M41 80 L59 80' },       // 8 trident
  { d: 'M40 60 L40 40 L60 40 L60 60 L34 60 L34 32 L72 32' },              // 9 coil
];

export const SIGIL_COUNT = SIGILS.length;

/** The sigil for a glyph index, wrapping defensively into range. */
export function sigilFor(index: number): SigilDef {
  const n = SIGILS.length;
  return SIGILS[((index % n) + n) % n];
}

/** Inline <svg> markup for the DOM legend — a pure string (no DOM dependency). The path
 *  inherits stroke from CSS (`fill:none;stroke:currentColor`-style rules on the host). */
export function sigilSvgMarkup(index: number, className = 'ck-sig'): string {
  const s = sigilFor(index);
  const dot = s.dot ? `<circle cx="${s.dot[0]}" cy="${s.dot[1]}" r="${s.dot[2]}"/>` : '';
  return `<svg class="${className}" viewBox="0 0 100 100" aria-hidden="true"><path d="${s.d}"/>${dot}</svg>`;
}
