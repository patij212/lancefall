// DASH — dash. The player dart blinks across the field leaving a chain of fading
// after-images — the i-frame echo of a committed dash — over speed-lines, with a
// burst at launch and a flash on arrival. The core movement verb made a sigil.

import type { SceneCtx } from '../registry';
import { paletteFor } from '../primitives';
import { drift, tween } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const dur = 2.4;

  // a dart (triangle) pointing +x
  const dart = (fill: string, op: number) =>
    `<g opacity="${op}"><polygon points="9,0 -7,6 -3,0 -7,-6" fill="${fill}"/><circle cx="2" cy="0" r="1.4" fill="${p.core[0]}"/></g>`;

  // the dash formation: a bright lead dart + 4 fading after-images trailing it,
  // joined by a dash-line. Translates across when animated; centred when static.
  const afterImages =
    dart(p.core[0], 1) +
    `<g transform="translate(-12,0)">${dart(accent, 0.6)}</g>` +
    `<g transform="translate(-23,0)">${dart(accent, 0.4)}</g>` +
    `<g transform="translate(-34,0)">${dart(accent, 0.25)}</g>` +
    `<g transform="translate(-45,0)">${dart(accent, 0.13)}</g>` +
    `<line x1="-46" y1="0" x2="8" y2="0" stroke="${accent}" stroke-width="2.4" stroke-linecap="round" opacity="0.3" filter="${u('blS', uid)}"/>`;
  // charge at the left, dash across, hold at the right — visible ~85% of the loop
  const formation = a
    ? `<g transform="translate(-40,0)"><animateTransform attributeName="transform" type="translate" values="-40 0;-40 0;40 0;40 0" keyTimes="0;0.32;0.48;1" dur="${dur}s" repeatCount="indefinite"/>` +
      `<g opacity="0"><animate attributeName="opacity" values="0;1;1;1;0" keyTimes="0;0.05;0.48;0.9;1" dur="${dur}s" repeatCount="indefinite"/>${afterImages}</g></g>`
    : `<g transform="translate(6,0)">${afterImages}</g>`;

  // launch burst (left, as the dash fires) + arrival flash (right)
  const launch = a
    ? `<g transform="translate(-40,0)" opacity="0">${tween(a, 'opacity', '0;0;0.9;0;0', dur, { keyTimes: '0;0.3;0.36;0.5;1' })}` +
      Array.from({ length: 5 }, (_, i) => { const ang = (-130 + i * 25) * Math.PI / 180; return `<line x1="0" y1="0" x2="${(Math.cos(ang) * 12).toFixed(1)}" y2="${(Math.sin(ang) * 12).toFixed(1)}" stroke="${p.hilite}" stroke-width="1" stroke-linecap="round"/>`; }).join('') + `</g>`
    : '';
  const arrival = a
    ? `<circle cx="40" cy="0" r="12" fill="${u('flash', uid)}" opacity="0">${tween(a, 'opacity', '0;0;0.8;0;0', dur, { keyTimes: '0;0.46;0.54;0.7;1' })}</circle>`
    : `<circle cx="44" cy="0" r="10" fill="${u('flash', uid)}" opacity="0.25"/>`;

  // background speed-lines
  const speed = (off: number, sw: number, dash: string, d: number) =>
    `<line x1="-64" y1="${off}" x2="62" y2="${off}" stroke="${accent}" stroke-width="${sw}" stroke-dasharray="${dash}" opacity="0.13" stroke-linecap="round">${drift(a, -90, d)}</line>`;
  const field = `<g>${speed(-26, 0.8, '5 16', 2.6)}${speed(0, 0.7, '4 20', 3.2)}${speed(26, 0.8, '5 14', 2.9)}</g>`;

  return (
    coreGlow(ctx, { op: 0.13, lo: 0.09, hi: 0.2, dur: 4.2 }) +
    starfield(ctx, [[-44, -34, 0.9, 2.6, 0.3], [42, -40, 0.8, 3.1, 0.5], [48, 30, 0.9, 2.2, 0.3], [-40, 40, 0.8, 3.6, 0.5]]) +
    field + arrival + launch + formation
  );
}
