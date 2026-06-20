// Avatar visual layer — the tiered medallion frame.
//
// `frame()` emits the shared defs + the rank-escalating ornament and sandwiches
// the per-avatar `sceneInner` inside the clipped hex window. Tiers (design §3.2):
//   I   — slim single bezel, no ray-burst/guilloché, 6 studs, 1 glint.
//   II  — ray-burst, guilloché, gear-tooth ring, heavier double frame, 12 studs, 2 glints.
//   III — adds sunburst crown ticks, crenellation, laurels, rune ring, regalia, 3 glints.
//
// All ids are uid-namespaced via primitives. Animation is additive: with
// `animated:false` (reduceMotion) the medallion is a fully-composed still.

import { paletteFor, defsFor, ref, HEX, HEX_INNER, GLASS_PATH } from './primitives';
import { breathe, spin, glint, twinkle } from './motion';

export type AvatarTier = 1 | 2 | 3;

export interface FrameOpts {
  animated: boolean;
  variant: 'full' | 'tile';
}

/** Build the complete medallion-local markup: defs + ornament + clipped scene. */
export function frame(tier: AvatarTier, accent: string, uid: string, opts: FrameOpts, sceneInner: string): string {
  const halo = opts.variant !== 'tile';
  const defs = defsFor(accent, uid, { tier, halo });
  const body =
    tier === 1
      ? tierI(accent, uid, opts, sceneInner, halo)
      : tier === 2
        ? tierII(accent, uid, opts, sceneInner, halo)
        : tierIII(accent, uid, opts, sceneInner, halo);
  return defs + body;
}

const url = (n: string, uid: string) => `url(#${ref(n, uid)})`;

/** Outer glow halo — blurred on full, plain soft circle on tiles. */
function haloCircle(accent: string, uid: string, r: number, base: number, lo: number, hi: number, dur: number, animated: boolean, halo: boolean): string {
  const filter = halo ? ` filter="${url('big', uid)}"` : '';
  return `<circle r="${r}" fill="${accent}" opacity="${base}"${filter}>${breathe(animated, lo, hi, dur)}</circle>`;
}

/** Wrap a scene in the clipped hex window with the universal backdrop fill
 *  (first) and glass-cap highlight (last) — every prototype shares these. */
function sceneWrap(accent: string, uid: string, scene: string): string {
  const p = paletteFor(accent);
  return (
    `<g clip-path="${url('hx', uid)}">` +
    `<polygon points="${HEX}" fill="${p.bg}"/>` +
    scene +
    `<path d="${GLASS_PATH}" fill="${url('glass', uid)}"/>` +
    `</g>`
  );
}

function tierI(accent: string, uid: string, opts: FrameOpts, scene: string, halo: boolean): string {
  const p = paletteFor(accent);
  const a = opts.animated;
  return (
    haloCircle(accent, uid, 84, 0.11, 0.06, 0.16, 2.8, a, halo) +
    `<circle r="90" fill="none" stroke="${url('bz', uid)}" stroke-width="5"/>` +
    `<circle r="86" fill="none" stroke="${p.bevel}" stroke-width="1.6"/>` +
    `<circle r="82" fill="none" stroke="${accent}" stroke-width="0.6" stroke-dasharray="6 6" opacity="0.4">${spin(a, 50)}</circle>` +
    glint({ uid, r: 90, sw: 5, lead: 14, stroke: p.hilite, opacity: 0.8, dur: 6, animated: a }) +
    sceneWrap(accent, uid, scene) +
    `<polygon points="${HEX}" fill="none" stroke="${url('bz', uid)}" stroke-width="2.2"/>` +
    `<polygon points="${HEX_INNER}" fill="none" stroke="${accent}" stroke-width="0.5" opacity="0.35"/>` +
    `<use href="#${ref('r6', uid)}" style="color:${p.hilite}"/>`
  );
}

function tierII(accent: string, uid: string, opts: FrameOpts, scene: string, halo: boolean): string {
  const p = paletteFor(accent);
  const a = opts.animated;
  return (
    haloCircle(accent, uid, 100, 0.15, 0.1, 0.22, 3.4, a, halo) +
    `<use href="#${ref('rays', uid)}" style="color:${accent}" opacity="0.2">${spin(a, 90)}</use>` +
    `<g clip-path="${url('hx', uid)}"><use href="#${ref('guil', uid)}" style="color:${accent}" opacity="0.14"/></g>` +
    `<use href="#${ref('guil', uid)}" style="color:${p.dark}" opacity="0.5"/>` +
    `<circle r="106" fill="none" stroke="${accent}" stroke-width="6" stroke-dasharray="3 5" opacity="0.5">${spin(a, 24)}</circle>` +
    `<circle r="103" fill="none" stroke="${p.light}" stroke-width="0.7" stroke-dasharray="1.3 3" opacity="0.6"/>` +
    `<circle r="98" fill="none" stroke="${url('bz', uid)}" stroke-width="7.5"/>` +
    `<circle r="92" fill="none" stroke="${p.bevel}" stroke-width="2.2"/>` +
    glint({ uid, r: 98, sw: 7.5, lead: 16, stroke: p.hilite, opacity: 0.8, dur: 5, animated: a }) +
    glint({ uid, r: 98, sw: 7.5, lead: 16, stroke: p.hilite, opacity: 0.55, dur: 5, phase: -308, animated: a }) +
    sceneWrap(accent, uid, scene) +
    `<polygon points="${HEX}" fill="none" stroke="${url('bz', uid)}" stroke-width="2.8"/>` +
    `<polygon points="${HEX_INNER}" fill="none" stroke="${accent}" stroke-width="0.6" opacity="0.45"/>` +
    `<use href="#${ref('r12', uid)}" style="color:${p.hilite}"/>`
  );
}

const CROWN_TICKS =
  '<line x1="0" y1="-99" x2="0" y2="-110"/><line x1="70" y1="-70" x2="77.8" y2="-77.8"/>' +
  '<line x1="99" y1="0" x2="110" y2="0"/><line x1="-70" y1="-70" x2="-77.8" y2="-77.8"/><line x1="-99" y1="0" x2="-110" y2="0"/>';
const LAUREL_L = 'M -96 40 Q -118 36 -110 58 Q -98 52 -96 40';
const LAUREL_R = 'M 96 40 Q 118 36 110 58 Q 98 52 96 40';

function tierIII(accent: string, uid: string, opts: FrameOpts, scene: string, halo: boolean): string {
  const p = paletteFor(accent);
  const a = opts.animated;
  const regalia =
    `<g fill="${p.hilite}" filter="${url('bl', uid)}">` +
    `<circle cx="0" cy="-72" r="3.4">${twinkle(a, 2.5, 0.4, 1)}</circle>` +
    `<circle cx="62.4" cy="-36" r="3">${twinkle(a, 3, 0.4, 1)}</circle>` +
    `<circle cx="-62.4" cy="-36" r="3">${twinkle(a, 2.7, 0.5, 1)}</circle></g>`;
  return (
    haloCircle(accent, uid, 106, 0.16, 0.1, 0.24, 4.4, a, halo) +
    `<use href="#${ref('rays', uid)}" style="color:${accent}" opacity="0.22"/>` +
    `<use href="#${ref('rays', uid)}" style="color:${p.light}" opacity="0.14" transform="rotate(15)"/>` +
    `<g clip-path="${url('hx', uid)}"><use href="#${ref('guil', uid)}" style="color:${accent}" opacity="0.16"/></g>` +
    `<use href="#${ref('guil', uid)}" style="color:${p.dark}" opacity="0.5"/>` +
    `<circle r="111" fill="none" stroke="${accent}" stroke-width="0.6" stroke-dasharray="1 6" opacity="0.5"/>` +
    `<circle r="107" fill="none" stroke="${p.deep}" stroke-width="4" stroke-dasharray="3 4" opacity="0.6">${spin(a, 80)}</circle>` +
    `<circle r="103" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="1.2 2.6" opacity="0.6"/>` +
    `<circle r="98" fill="none" stroke="${url('bz', uid)}" stroke-width="8"/>` +
    `<circle r="92" fill="none" stroke="${p.bevel}" stroke-width="2.4"/>` +
    `<circle r="86" fill="none" stroke="${p.light}" stroke-width="0.8" stroke-dasharray="11 6" opacity="0.5">${spin(a, 50, 360, 0)}</circle>` +
    glint({ uid, r: 98, sw: 8, lead: 18, stroke: p.core[0], opacity: 0.9, dur: 4.5, animated: a }) +
    glint({ uid, r: 98, sw: 8, lead: 18, stroke: p.core[0], opacity: 0.7, dur: 4.5, phase: -205, animated: a }) +
    glint({ uid, r: 98, sw: 8, lead: 18, stroke: p.core[0], opacity: 0.5, dur: 4.5, phase: -410, animated: a }) +
    `<g stroke="${p.light}" stroke-width="1.6" stroke-linecap="round" opacity="0.85">${CROWN_TICKS}</g>` +
    `<g fill="none" stroke="${p.deep}" stroke-width="2" opacity="0.6"><path d="${LAUREL_L}"/><path d="${LAUREL_R}"/></g>` +
    sceneWrap(accent, uid, scene) +
    `<polygon points="${HEX}" fill="none" stroke="${url('bz', uid)}" stroke-width="3"/>` +
    `<polygon points="${HEX_INNER}" fill="none" stroke="${accent}" stroke-width="0.7" opacity="0.45"/>` +
    `<use href="#${ref('r12', uid)}" style="color:${p.core[0]}"/>` +
    regalia
  );
}
