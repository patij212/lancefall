// THE CHOICE — balance. The Stillpoint's two readings held in a balance that
// tips slowly between them: gold (release) on one pan, green (the Vigil) on the
// other, over a field split down the seam. The decision the game ends on.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { tweenT, twinkle } from '../motion';
import { coreGlow, u } from './_common';

const GREEN = '#6ee7b7';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx; // accent = gold #fde047
  const p = paletteFor(accent);
  const goldGlow = tone(accent, 1, 0.5);

  // the split field — gold half | green half, with a luminous seam
  const split =
    `<g clip-path="none">` +
    `<path d="M 0 -62 L -62 -30 L -62 30 L 0 62 Z" fill="${tone(accent, 0.9, 0.12)}" opacity="0.5"/>` +
    `<path d="M 0 -62 L 62 -30 L 62 30 L 0 62 Z" fill="${tone(GREEN, 0.9, 0.12)}" opacity="0.5"/>` +
    `<line x1="0" y1="-60" x2="0" y2="60" stroke="${p.core[0]}" stroke-width="1.4" opacity="0.7"/>` +
    `<line x1="0" y1="-60" x2="0" y2="60" stroke="${p.core[0]}" stroke-width="4" opacity="0.18"/></g>`;

  // a reading glyph on each side, twinkling
  const reading = (cx: number, color: string, dur: number) =>
    `<circle cx="${cx}" cy="-34" r="6" fill="none" stroke="${color}" stroke-width="1" opacity="${a ? 0.5 : 0.7}">${twinkle(a, dur, 0.3, 0.9)}</circle>` +
    `<circle cx="${cx}" cy="-34" r="2" fill="${color}"/>`;

  // the balance — fulcrum at centre, beam tipping, a pan on each side
  const pan = (side: 1 | -1, color: string) =>
    `<g><line x1="${side * 30}" y1="0" x2="${side * 30}" y2="14" stroke="${p.light}" stroke-width="1"/>` +
    `<path d="M ${side * 30 - 9} 14 Q ${side * 30} 22 ${side * 30 + 9} 14" fill="none" stroke="${color}" stroke-width="1.6"/>` +
    `<circle cx="${side * 30}" cy="10" r="3.4" fill="${color}" opacity="0.9"/></g>`;
  const balance =
    `<g transform="translate(0,6)">` +
    // fulcrum
    `<polygon points="0,-22 -7,-6 7,-6" fill="${p.deep}" stroke="${p.light}" stroke-width="1"/>` +
    `<circle r="3" cy="-22" fill="${p.core[0]}"/>` +
    // tipping beam
    `<g transform="translate(0,-22)"><g>${tweenT(a, 'rotate', '-9;9;-9', 5)}` +
    `<rect x="-34" y="-2" width="68" height="3.4" rx="1.5" fill="${u('bz', uid) /* metallic beam */}"/>` +
    pan(-1, accent) + pan(1, GREEN) +
    `</g></g></g>`;

  return (
    coreGlow(ctx, { op: 0.14, lo: 0.1, hi: 0.22, dur: 4 }) +
    split +
    reading(-30, accent, 2.8) + reading(30, GREEN, 3.4) +
    `<circle r="10" fill="${goldGlow}" opacity="0.25"/>` +
    balance
  );
}
