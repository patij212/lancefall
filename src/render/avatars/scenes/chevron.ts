// VANGUARD — climb. A rank-crest for a blazing combo: a faceted heraldic shield
// bearing stacked chevron insignia, flanked by laurel wings, a combo-chevron
// column climbing behind it, ascending rank-pip ladders and an apex burst at the
// peak. The momentum of a clean run, decorated.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { drift, spin, tween } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const dur = 2.2;

  const chevron = (y: number, w: number, sw: number, color: string, op: number) =>
    `<path d="M ${-w} ${y + w * 0.7} L 0 ${y} L ${w} ${y + w * 0.7}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;

  // flanking rally rails
  const railStreak = (x: number, dash: string, d: number) =>
    `<line x1="${x}" y1="46" x2="${x}" y2="-48" stroke="${accent}" stroke-width="1" stroke-dasharray="${dash}" opacity="0.18" stroke-linecap="round">${drift(a, -90, d)}</line>`;
  const rails = `${railStreak(-44, '4 12', 3.2)}${railStreak(-34, '3 16', 4)}${railStreak(34, '3 16', 3.6)}${railStreak(44, '4 12', 2.9)}`;

  // climbing combo-chevron column (behind the crest)
  const rising = a
    ? Array.from({ length: 6 }, (_, i) => {
        const begin = (i * dur) / 6;
        return `<g opacity="0"><animate attributeName="opacity" values="0;0.8;0.8;0" keyTimes="0;0.15;0.7;1" dur="${dur}s" begin="${begin.toFixed(2)}s" repeatCount="indefinite"/>` +
          `<animateTransform attributeName="transform" type="translate" values="0 44;0 -50" dur="${dur}s" begin="${begin.toFixed(2)}s" repeatCount="indefinite"/>${chevron(0, 20, 2.6, accent, 1)}</g>`;
      }).join('')
    : [[40, 0.4], [22, 0.6], [4, 0.8], [-14, 0.6], [-32, 0.4]].map(([y, op]) => chevron(y, 20, 2.6, accent, op)).join('');

  // apex burst at the peak
  const apex =
    `<g transform="translate(0,-44)">` +
    `<circle r="9" fill="${u('core', uid)}" opacity="0.5">${a ? `<animate attributeName="opacity" values="0.3;0.7;0.3" dur="1.8s" repeatCount="indefinite"/>` : ''}</circle>` +
    `<g stroke="${p.core[0]}" stroke-width="0.8" stroke-linecap="round" opacity="0.7">${spin(a, 10)}<line x1="0" y1="-11" x2="0" y2="-6"/><line x1="9.5" y1="-5.5" x2="5.2" y2="-3"/><line x1="-9.5" y1="-5.5" x2="-5.2" y2="-3"/></g>` +
    `<circle r="2.4" fill="#fff"/></g>`;

  // laurel wings flanking the shield
  const wing = (sgn: number) =>
    `<g stroke="${tone(accent, 0.7, 0.5)}" stroke-width="1.4" fill="none" opacity="0.75" stroke-linecap="round">` +
    `<path d="M ${sgn * 18} 8 Q ${sgn * 34} 4 ${sgn * 40} -10"/>` +
    `<g stroke-width="1">${[0, 1, 2, 3].map((k) => `<path d="M ${sgn * (22 + k * 5)} ${6 - k * 4} q ${sgn * 5} -1 ${sgn * 7} -5"/>`).join('')}</g></g>`;
  const wings = wing(1) + wing(-1);

  // the heraldic shield crest with stacked chevron insignia
  const shield =
    `<path d="M 0 -26 L 17 -18 L 17 6 Q 17 22 0 30 Q -17 22 -17 6 L -17 -18 Z" fill="${tone(accent, 0.8, 0.12)}" stroke="${accent}" stroke-width="1.6"/>` +
    `<path d="M 0 -26 L 17 -18 L 17 6 Q 17 22 0 30 Q -17 22 -17 6 L -17 -18 Z" fill="${u('core', uid)}" opacity="0.18"/>` +
    `<g stroke="${tone(accent, 0.6, 0.5)}" stroke-width="0.4" opacity="0.5"><line x1="0" y1="-24" x2="0" y2="28"/></g>` +
    chevron(-8, 12, 3, p.hilite, 0.9) + chevron(2, 12, 3, p.core[0], 1) + chevron(12, 12, 3, p.hilite, 0.9) +
    `<g fill="${accent}"><circle cx="0" cy="-22" r="1.6"/><circle cx="-13" cy="-15" r="1.2"/><circle cx="13" cy="-15" r="1.2"/></g>`;

  // ascending rank-pip ladders on each side
  const ladder = (x: number) =>
    `<g fill="${accent}">${[0, 1, 2, 3, 4].map((k) => `<rect x="${x - 3}" y="${22 - k * 11}" width="6" height="2.4" rx="1" opacity="${a ? 0.35 : 0.6}">${a ? `<animate attributeName="opacity" values="0.2;0.9;0.2" dur="${1.4 + k * 0.25}s" begin="${k * 0.18}s" repeatCount="indefinite"/>` : ''}</rect>`).join('')}</g>`;
  const ladders = ladder(-50) + ladder(50);

  // combo rays radiating up
  const rays = `<g stroke="${accent}" stroke-width="0.6" stroke-linecap="round" opacity="0.25">${[-30, -16, 16, 30].map((dx) => `<line x1="${dx * 0.4}" y1="-20" x2="${dx}" y2="-46">${a ? tween(a, 'opacity', '0.1;0.5;0.1', 2.4, { keyTimes: '0;0.5;1' }) : ''}</line>`).join('')}</g>`;

  return (
    coreGlow(ctx, { op: 0.14, lo: 0.09, hi: 0.22, dur: 3.6 }) +
    starfield(ctx, [[-48, -28, 0.9, 2.6, 0.3], [46, -34, 0.8, 3.1, 0.5], [50, 26, 0.9, 2.2, 0.3], [-44, 38, 0.8, 3.6, 0.5]]) +
    rails + rays + rising + ladders + wings + shield + apex
  );
}
