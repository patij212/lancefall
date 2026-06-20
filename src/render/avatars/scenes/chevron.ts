// VANGUARD — climb. A column of combo chevrons rising and fading upward — the
// combo-multiplier climbing — flanked by rally streaks. The blazing-combo
// momentum of a clean run, as a sigil.

import type { SceneCtx } from '../registry';
import { paletteFor } from '../primitives';
import { drift } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const dur = 2.4;

  // a chevron (^) of half-width w centred at (0,y)
  const chevron = (y: number, w: number, sw: number, color: string, op: number) =>
    `<path d="M ${-w} ${y + w * 0.7} L 0 ${y} L ${w} ${y + w * 0.7}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;

  // rising column: 5 chevrons each fade-in low, rise + fade out (staggered)
  const rising = a
    ? Array.from({ length: 5 }, (_, i) => {
        const begin = (i * dur) / 5;
        return (
          `<g opacity="0"><animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.15;0.7;1" dur="${dur}s" begin="${begin.toFixed(2)}s" repeatCount="indefinite"/>` +
          `<animateTransform attributeName="transform" type="translate" values="0 40;0 -44" dur="${dur}s" begin="${begin.toFixed(2)}s" repeatCount="indefinite"/>` +
          chevron(0, 17, 3, accent, 1) +
          `</g>`
        );
      }).join('')
    : // static: a clean fixed stack
      [
        [34, 0.5], [17, 0.7], [0, 0.9], [-17, 0.7], [-34, 0.5],
      ].map(([y, op]) => chevron(y, 17, 3, accent, op)).join('');

  // brightest hero chevron at centre + a glow
  const hero =
    `<circle r="10" cx="0" cy="0" fill="${u('core', uid)}" opacity="0.5"/>` +
    chevron(2, 22, 4.4, p.hilite, 0.95) +
    chevron(2, 14, 2, p.core[0], 0.9);

  // flanking rally streaks rising on each side
  const railStreak = (x: number, dash: string, d: number) =>
    `<line x1="${x}" y1="44" x2="${x}" y2="-46" stroke="${accent}" stroke-width="1" stroke-dasharray="${dash}" opacity="0.2" stroke-linecap="round">${drift(a, -90, d)}</line>`;
  const rails = `${railStreak(-40, '4 12', 3.2)}${railStreak(-30, '3 16', 4)}${railStreak(30, '3 16', 3.6)}${railStreak(40, '4 12', 2.9)}`;

  return (
    coreGlow(ctx, { op: 0.14, lo: 0.09, hi: 0.22, dur: 3.6 }) +
    starfield(ctx, [[-46, -30, 0.9, 2.6, 0.3], [44, -36, 0.8, 3.1, 0.5], [48, 24, 0.9, 2.2, 0.3], [-42, 38, 0.8, 3.6, 0.5]]) +
    rails + rising + hero
  );
}
