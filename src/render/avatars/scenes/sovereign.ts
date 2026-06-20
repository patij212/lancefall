// THE FALLEN CROWN — shatter (tier III). Ported from the locked prototype: a
// broken crown whose top-right spike splinters into flying shards + dust over a
// gravity-warp swirl, with a crack-web across the band. "I chose to lose it."

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, drift, twinkle, flyOut } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const id = (n: string) => `${n}-${uid}`;
  const gold = tone(accent, 1, 0.62);
  const goldDeep = tone(accent, 0.8, 0.28);
  const goldDark = tone(accent, 0.7, 0.13);

  const defs =
    `<defs><linearGradient id="${id('gold')}" x1="0" y1="0" x2="0.4" y2="1">` +
    `<stop offset="0%" stop-color="${goldDeep}"/><stop offset="45%" stop-color="${gold}"/><stop offset="100%" stop-color="${p.hilite}"/></linearGradient></defs>`;
  const goldU = `url(#${id('gold')})`;

  // gravity warp — rotating arc field
  const warp =
    `<g fill="none" stroke="${accent}" opacity="0.32" stroke-width="0.9">${spin(a, 40)}` +
    `<path d="M -58 -10 A 58 58 0 0 1 -10 -58"/><path d="M 58 14 A 58 58 0 0 1 14 58"/>` +
    `<path d="M -52 30 A 56 56 0 0 0 30 52" stroke-dasharray="3 5"/><path d="M 20 -50 A 56 56 0 0 1 50 -20" stroke-dasharray="2 6"/></g>` +
    `<circle r="50" fill="none" stroke="${gold}" stroke-width="1" stroke-dasharray="2 10" opacity="0.6">${drift(a, -120, 9)}</circle>`;

  const sparks =
    `<g fill="${gold}"><circle cx="-44" cy="-30" r="0.9" opacity="${a ? 0.3 : 0.7}">${twinkle(a, 2.5, 0.3, 1)}</circle>` +
    `<circle cx="-30" cy="48" r="0.8" opacity="${a ? 0.6 : 0.7}">${twinkle(a, 3.2, 0.3, 1)}</circle></g>`;

  // the crown (group lowered to sit in the window)
  const crownBody =
    `<path d="M -46 2 L -40 -14 L -30 2 L -20 -30 L -10 2 L 0 -42 L 10 2 L 20 -30 L 24 -8 L 28 2 L 46 2 L 46 22 L -46 22 Z" fill="${goldU}" filter="${u('blS', uid)}"/>` +
    `<g stroke="${tone(accent, 0.7, 0.25)}" stroke-width="0.6" opacity="0.55" fill="none"><path d="M -38 22 L -38 6"/><path d="M -22 22 L -22 8"/><path d="M -4 22 L -4 6"/><path d="M 14 22 L 14 8"/><path d="M 32 22 L 32 6"/><path d="M -40 12 Q -30 6 -20 12 Q -10 18 0 12 Q 10 6 20 12 Q 30 18 40 12"/></g>` +
    `<g fill="${goldDark}"><circle cx="-34" cy="20" r="1.2"/><circle cx="-22" cy="20" r="1.2"/><circle cx="-10" cy="20" r="1.2"/><circle cx="2" cy="20" r="1.2"/><circle cx="14" cy="20" r="1.2"/><circle cx="26" cy="20" r="1.2"/></g>` +
    `<line x1="-46" y1="5" x2="46" y2="5" stroke="${p.hilite}" stroke-width="0.7" opacity="0.6"/>`;
  const jewelSpark = (cx: number, cy: number, dur: number) =>
    `<polygon points="${cx - 4},${cy} ${cx},${cy - 5} ${cx + 4},${cy} ${cx},${cy + 5}" fill="${p.core[0]}" opacity="${a ? 0.6 : 0.85}">${twinkle(a, dur, 0.4, 1)}</polygon>`;
  const jewels = `<g filter="${u('bl', uid)}">${jewelSpark(-40, -9, 2.3)}${jewelSpark(-20, -30, 2.7)}${jewelSpark(0, -42, 2)}${jewelSpark(20, -30, 3)}</g>`;
  const centerGem =
    `<g><polygon points="0,2 11,12 0,22 -11,12" fill="${p.core[0]}"/><polygon points="0,5 7,12 0,19 -7,12" fill="${goldU}"/>` +
    `<line x1="0" y1="5" x2="0" y2="19" stroke="${p.hilite}" stroke-width="0.5"/><line x1="-7" y1="12" x2="7" y2="12" stroke="${p.hilite}" stroke-width="0.5"/></g>`;
  const crackWeb = `<g stroke="${goldDark}" stroke-width="0.9" fill="none" opacity="0.85"><path d="M 30 -6 L 24 6 L 30 12 L 22 18"/><path d="M 34 -2 L 40 8"/><path d="M 26 0 L 16 -6"/></g>`;
  const stump = `<polygon points="40,-14 30,2 24,-8 32,-22" fill="${p.bg}" opacity="0.9"/>`;

  // the flying shards + dust (the spike shattering)
  const shard = (poly: string, dx: number, dy: number, begin: number) =>
    flyOut({ shape: `<polygon points="${poly}" fill="${goldU}"/>`, dx, dy, dur: 3.4, begin, animated: a });
  const dust = (cx: number, cy: number, r: number, dx: number, dy: number, begin: number) =>
    a
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.hilite}" opacity="0"><animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;1" dur="3.4s" begin="${begin}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${dx} ${dy}" dur="3.4s" begin="${begin}s" repeatCount="indefinite"/></circle>`
      : `<circle cx="${(cx + dx * 0.6).toFixed(1)}" cy="${(cy + dy * 0.6).toFixed(1)}" r="${r}" fill="${p.hilite}" opacity="0.7"/>`;
  const shards =
    shard('32,-20 39,-16 33,-9 28,-15', 18, -26, 0) +
    shard('40,-14 47,-12 43,-4 37,-8', 36, -14, 0.25) +
    shard('36,-8 42,-5 38,2 33,-3', 44, 0, 0.5) +
    shard('34,-2 40,2 34,8 30,3', 40, 16, 0.75) +
    shard('30,4 36,7 31,13 27,8', 28, 30, 1) +
    shard('38,-18 44,-15 40,-9 35,-13', 52, -28, 1.3) +
    shard('33,-12 38,-9 34,-3 30,-8', 24, -40, 1.6) +
    shard('37,-4 43,-1 39,5 34,0', 56, 6, 1.9) +
    dust(36, -12, 1.2, 30, -34, 0.4) + dust(38, -6, 1, 48, -8, 0.9) + dust(34, 2, 1.1, 34, 26, 1.45);

  const crown = `<g transform="translate(0,14)">${crownBody}${jewels}${centerGem}${crackWeb}${stump}<g>${shards}</g></g>`;

  return (
    defs +
    coreGlow(ctx, { r: 64, op: 0.26, lo: 0.16, hi: 0.34, dur: 4.6 }) +
    warp + sparks + crown
  );
}
