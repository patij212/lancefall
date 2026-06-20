// THE LANCE — strike. The approved gold-standard scene (reference doc §full
// worked scene): a lance lunging toward a target reticle across a field of
// momentum streaks, combo chevrons, a rotating rune ring and drifting motes,
// with a full-field impact flash keyed to the 0.12 lunge. Lance group scaled
// 0.9 to sit inside the hex envelope.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { when, spin, twinkle, drift, tween, tweenT } from '../motion';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const u = (n: string) => `url(#${n}-${uid})`;
  const id = (n: string) => `${n}-${uid}`;

  // scene-local gradients (shaft + spearhead), keyed to the accent hue
  const defs =
    `<defs>` +
    `<linearGradient id="${id('shaft')}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${tone(accent, 0.55, 0.26)}"/><stop offset="45%" stop-color="${p.core[0]}"/><stop offset="100%" stop-color="${tone(accent, 0.6, 0.2)}"/></linearGradient>` +
    `<linearGradient id="${id('head')}" x1="0" y1="1" x2="0.5" y2="0">` +
    `<stop offset="0%" stop-color="${tone(accent, 0.7, 0.32)}"/><stop offset="55%" stop-color="${p.light}"/><stop offset="100%" stop-color="#ffffff"/></linearGradient>` +
    `</defs>`;

  // twinkling starfield
  const star = (cx: number, cy: number, r: number, dur: number, lo: number) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" opacity="${a ? lo : 0.7}">${twinkle(a, dur, lo, 1)}</circle>`;
  const stars =
    `<g fill="${tone(accent, 0.6, 0.75)}">` +
    star(-48, -20, 0.9, 2.6, 0.2) + star(-20, -48, 0.8, 3.1, 0.6) + star(52, 14, 1, 2.2, 0.3) +
    star(20, 50, 0.8, 3.6, 0.6) + star(-40, 40, 0.7, 2.9, 0.4) + star(44, -30, 0.7, 3.3, 0.6) +
    `</g>`;

  // rune ring (rotating) with 6 tick marks
  const tickDirs = [[0, -58, 0, -50], [50.2, -29, 43.3, -25], [50.2, 29, 43.3, 25], [0, 58, 0, 50], [-50.2, 29, -43.3, 25], [-50.2, -29, -43.3, -25]];
  const runeRing =
    `<g>${spin(a, 60)}` +
    `<circle r="58" fill="none" stroke="${tone(accent, 0.7, 0.35)}" stroke-width="0.7" stroke-dasharray="2 8" opacity="0.5"/>` +
    `<g stroke="${p.mid}" stroke-width="1" opacity="0.4" stroke-linecap="round">` +
    tickDirs.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join('') +
    `</g></g>` +
    `<circle r="40" fill="none" stroke="${p.deep}" stroke-width="0.6" stroke-dasharray="1 7" opacity="0.4">${spin(a, 34, 360, 0)}</circle>`;

  // momentum streaks (rotated to the lunge axis): faint drifting set + a bright
  // set that flares with the strike
  const streakLines = [
    [-64, -44, 60, -44, 0.8, '4 12', 3], [-64, 44, 60, 44, 0.8, '4 12', 3.4],
    [-64, -28, 60, -28, 0.7, '3 14', 2.6], [-64, 28, 60, 28, 0.7, '3 14', 3.8],
  ];
  const momentum =
    `<g transform="rotate(-48)" stroke="${accent}" stroke-linecap="round">` +
    `<g opacity="0.13">` +
    streakLines.map(([x1, y1, x2, y2, sw, dash, dur]) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${sw}" stroke-dasharray="${dash}">${drift(a, -72, dur as number)}</line>`).join('') +
    `</g>` +
    `<g opacity="${a ? 0 : 0.12}">${tween(a, 'opacity', '0;0.55;0;0', 2.8, { keyTimes: '0;0.13;0.45;1' })}` +
    `<line x1="-50" y1="-9" x2="56" y2="-9" stroke-width="1.4"/><line x1="-50" y1="9" x2="56" y2="9" stroke-width="1.4"/>` +
    `<line x1="-58" y1="0" x2="40" y2="0" stroke-width="2.4" opacity="0.6"/></g></g>`;

  // fall-motes drifting down the field
  const mote = (cx: number, sr: number, dur: number, begin: string) =>
    a
      ? `<circle cx="${cx}" cy="-58" r="${sr}" opacity="0"><animate attributeName="cy" values="-62;64" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;0.8;0.8;0" keyTimes="0;0.1;0.85;1" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/></circle>`
      : `<circle cx="${cx}" cy="2" r="${sr}" opacity="0.6"/>`;
  const motes = `<g fill="${tone(accent, 0.6, 0.7)}">${mote(-26, 1.1, 7, '0s')}${mote(30, 0.9, 9, '0s')}${mote(-4, 0.8, 8, '2s')}</g>`;

  // target reticle
  const bracket = `<g stroke="${p.hilite}" stroke-width="1.1" stroke-linecap="round" opacity="0.8"><path d="M -15 -15 L -15 -8 M -15 -15 L -8 -15"/><path d="M 15 -15 L 15 -8 M 15 -15 L 8 -15"/><path d="M -15 15 L -15 8 M -15 15 L -8 15"/><path d="M 15 15 L 15 8 M 15 15 L 8 15"/></g>`;
  const reticle =
    `<g transform="translate(43,-48)">` +
    `<g>${spin(a, 18)}<circle r="15" fill="none" stroke="${accent}" stroke-width="0.8" stroke-dasharray="3 4" opacity="0.55"/>${bracket}</g>` +
    `<circle r="9" fill="none" stroke="${p.deep}" stroke-width="0.7" opacity="0.6"/>` +
    `<g stroke="${p.light}" stroke-width="0.7" opacity="0.7"><line x1="-6" y1="0" x2="6" y2="0"/><line x1="0" y1="-6" x2="0" y2="6"/></g>` +
    (a
      ? `<circle r="13" fill="none" stroke="${p.core[0]}" stroke-width="1.6" opacity="0"><animate attributeName="r" values="6;6;22;22" keyTimes="0;0.12;0.34;1" dur="2.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0;0.9;0;0" keyTimes="0;0.12;0.18;0.34;1" dur="2.8s" repeatCount="indefinite"/></circle>`
      : `<circle r="13" fill="none" stroke="${p.core[0]}" stroke-width="1.6" opacity="0.3"/>`) +
    `</g>`;

  // full-field impact flash
  const flash =
    a
      ? `<circle cx="43" cy="-48" r="40" fill="${u('flash')}" opacity="0"><animate attributeName="opacity" values="0;0;0.7;0;0" keyTimes="0;0.12;0.16;0.36;1" dur="2.8s" repeatCount="indefinite"/></circle>`
      : `<circle cx="43" cy="-48" r="40" fill="${u('flash')}" opacity="0.16"/>`;

  // the lance body (identical static/animated; gets the lunge translate when animated)
  const pennon =
    `<g fill="${accent}" opacity="0.85"><path d="M 8 -2 L -18 -14 Q -10 -3 -22 -4 L 8 2 Z">` +
    when(a, `<animate attributeName="d" values="M 8 -2 L -18 -14 Q -10 -3 -22 -4 L 8 2 Z;M 8 -2 L -18 -9 Q -8 -1 -22 -1 L 8 2 Z;M 8 -2 L -18 -14 Q -10 -3 -22 -4 L 8 2 Z" dur="1.6s" repeatCount="indefinite"/>`) +
    `</path></g>`;
  const lanceBody =
    `<g fill="${accent}" opacity="0.9"><path d="M -64 -7 L -57 0 L -64 7 L -62 0 Z"/><path d="M -71 -6 L -65 0 L -71 6 L -69 0 Z" opacity="0.6"/><path d="M -77 -5 L -72 0 L -77 5 L -75 0 Z" opacity="0.35"/></g>` +
    `<polygon points="-60,0 -53,-4.5 -49,0 -53,4.5" fill="${p.hilite}" filter="${u('blS')}"/>` +
    `<circle cx="-54" cy="0" r="1.6" fill="${p.core[0]}"/>` +
    `<rect x="-50" y="-2" width="80" height="4" rx="1.8" fill="${u('shaft')}"/>` +
    `<line x1="-50" y1="-1.4" x2="30" y2="-1.4" stroke="${p.core[0]}" stroke-width="0.6" opacity="0.85"/>` +
    `<g stroke="${tone(accent, 0.8, 0.1)}" stroke-width="2.4" opacity="0.8"><line x1="-30" y1="-2.8" x2="-30" y2="2.8"/><line x1="-8" y1="-2.8" x2="-8" y2="2.8"/><line x1="14" y1="-2.8" x2="14" y2="2.8"/></g>` +
    `<g fill="${accent}"><circle cx="-30" cy="0" r="1"/><circle cx="-8" cy="0" r="1"/><circle cx="14" cy="0" r="1"/></g>` +
    `<rect x="28" y="-3" width="6" height="6" rx="1" fill="${p.deep}" stroke="${p.hilite}" stroke-width="0.5"/>` +
    `<path d="M 34 0 Q 46 -7 58 -4 L 76 0 L 58 4 Q 46 7 34 0 Z" fill="${u('head')}" filter="${u('blS')}"/>` +
    `<line x1="37" y1="0" x2="72" y2="0" stroke="${p.bg}" stroke-width="0.8" opacity="0.6"/>` +
    `<line x1="37" y1="-1" x2="66" y2="-0.5" stroke="#ffffff" stroke-width="0.7" opacity="0.9"/>` +
    `<polygon points="69,-1.4 76,0 69,1.4" fill="#ffffff" filter="${u('bl')}"/>` +
    pennon;
  const strikeStreak =
    `<g stroke="${accent}" stroke-linecap="round" opacity="${a ? 0 : 0.14}">${tween(a, 'opacity', '0;0.5;0;0', 2.8, { keyTimes: '0;0.1;0.4;1' })}` +
    `<line x1="-44" y1="0" x2="48" y2="0" stroke-width="4"/><line x1="-34" y1="0" x2="42" y2="0" stroke-width="1.8" opacity="0.7"/></g>`;
  const lance =
    `<g transform="rotate(-48)">` +
    strikeStreak +
    `<g>${tweenT(a, 'translate', '0 0;32 0;0 0;0 0', 2.8, { keyTimes: '0;0.12;0.52;1' })}${lanceBody}</g>` +
    `</g>`;

  return (
    defs +
    `<circle r="62" fill="${u('core')}" opacity="0.14"/>` +
    stars + runeRing + momentum + motes + reticle + flash + lance
  );
}
