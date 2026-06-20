// REMEMBER EVERYTHING — rise. The 100%-decryption reward: the skyline relit,
// every window igniting in a wave that rises up the towers, a signal-restored
// bloom and light rising. The city remembered, all at once.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const wave = 3.4;

  // restored-signal bloom rising behind the city
  const bloom = `<circle cx="0" cy="30" r="46" fill="${u('core', uid)}" opacity="${a ? 0.2 : 0.3}">${a ? `<animate attributeName="opacity" values="0.12;0.34;0.12" dur="${wave}s" repeatCount="indefinite"/>` : ''}</circle>`;
  const horizon = `<rect x="-66" y="38" width="132" height="6" fill="${p.core[0]}" opacity="0.55"/><line x1="-62" y1="40" x2="62" y2="40" stroke="${p.hilite}" stroke-width="0.9" opacity="0.7"/>`;

  // the restored towers (bright, fully present)
  const towers =
    `<g fill="${tone(accent, 0.7, 0.16)}">` +
    `<rect x="-56" y="14" width="16" height="28"/><rect x="-38" y="0" width="14" height="42"/><rect x="-22" y="18" width="12" height="24"/>` +
    `<polygon points="-2,42 -2,-8 7,-18 16,-8 16,42"/><rect x="22" y="8" width="15" height="34"/><rect x="40" y="-4" width="13" height="46"/></g>`;

  // a window that ignites at a time keyed to its height (lower → earlier), looping
  const win = (x: number, y: number) => {
    // begin earlier for lower windows (y larger) → the wave rises
    const begin = a ? (((42 - y) / 60) * wave).toFixed(2) : '0';
    return a
      ? `<rect x="${x}" y="${y}" width="2" height="2.6" opacity="0.15"><animate attributeName="opacity" values="0.15;1;0.85" keyTimes="0;0.12;1" dur="${wave}s" begin="${begin}s" repeatCount="indefinite"/></rect>`
      : `<rect x="${x}" y="${y}" width="2" height="2.6" opacity="0.95"/>`;
  };
  const cols: [number, number[]][] = [
    [-53, [18, 24, 30, 36]], [-49, [18, 30, 36]],
    [-34, [4, 10, 16, 22, 28, 34]], [-29, [4, 16, 28]],
    [-18, [22, 28, 34]],
    [1, [-12, -4, 4, 12, 20, 28, 36]], [9, [-4, 12, 28, 36]],
    [26, [12, 18, 24, 30, 36]], [32, [12, 24, 36]],
    [44, [0, 8, 16, 24, 32, 40]], [49, [0, 16, 32]],
  ];
  const windows = `<g fill="${p.core[0]}">${cols.map(([x, ys]) => ys.map((y) => win(x, y)).join('')).join('')}</g>`;

  // rising motes of light
  const mote = (cx: number, r: number, dur: number, begin: string) =>
    a
      ? `<circle cx="${cx}" cy="40" r="${r}" opacity="0"><animate attributeName="cy" values="42;-54" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.8;0.8;0" keyTimes="0;0.15;0.8;1" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/></circle>`
      : `<circle cx="${cx}" cy="-6" r="${r}" opacity="0.6"/>`;
  const motes = `<g fill="${p.light}">${mote(-30, 1, 6, '0s')}${mote(8, 0.9, 7.5, '1s')}${mote(34, 1, 6.8, '2.5s')}</g>`;

  return (
    coreGlow(ctx, { r: 58, op: 0.16, lo: 0.12, hi: 0.26, dur: wave }) +
    starfield(ctx, [[-44, -44, 1, 2.6, 0.4], [30, -50, 0.9, 3.1, 0.6], [50, -32, 0.8, 2.2, 0.3], [-50, -22, 0.7, 3.6, 0.5]]) +
    bloom + horizon + towers + windows + motes
  );
}
