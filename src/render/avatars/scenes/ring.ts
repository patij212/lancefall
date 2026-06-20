// COHERENCE — resonance. Concentric rings + radial spokes + a morphing
// interference waveform + a breathing faceted core + orbiting comet-bodies.
// The dial that binds sight + sound + meaning, drawn as a living engine.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { breathe, spin, twinkle, drift, tweenT, when } from '../motion';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const u = (n: string) => `url(#${n}-${uid})`;

  // radial spokes (8 directions)
  const spokes =
    `<g stroke="${tone(accent, 0.7, 0.3)}" stroke-width="0.7" opacity="0.6">` +
    `<line x1="0" y1="-60" x2="0" y2="60"/><line x1="-60" y1="0" x2="60" y2="0"/>` +
    `<line x1="-42" y1="-42" x2="42" y2="42"/><line x1="42" y1="-42" x2="-42" y2="42"/>` +
    `<line x1="-23" y1="-56" x2="23" y2="56"/><line x1="-56" y1="-23" x2="56" y2="23"/>` +
    `<line x1="23" y1="-56" x2="-23" y2="56"/><line x1="56" y1="-23" x2="-56" y2="23"/></g>`;

  const star = (cx: number, cy: number, r: number, dur: number, lo: number) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" opacity="${a ? lo : 0.7}">${twinkle(a, dur, lo, 1)}</circle>`;
  const stars =
    `<g fill="${tone(accent, 0.6, 0.78)}">` +
    star(-44, -26, 1, 2.6, 0.2) + star(40, -40, 0.9, 3.1, 0.6) + star(48, 22, 1, 2.2, 0.3) +
    star(-30, 44, 0.8, 3.6, 0.6) + star(14, 52, 0.7, 2.9, 0.4) + `</g>`;

  const rings =
    `<g fill="none">` +
    `<circle r="56" stroke="${tone(accent, 0.7, 0.35)}" stroke-width="0.7" stroke-dasharray="3 6" opacity="0.5"/>` +
    `<circle r="45" stroke="${p.mid}" stroke-width="1" opacity="0.55"/>` +
    `<circle r="34" stroke="${p.light}" stroke-width="1.2" opacity="0.7"/></g>` +
    `<circle r="58" fill="none" stroke="${accent}" stroke-width="1.2" stroke-dasharray="2 12" opacity="0.7">${spin(a, 20)}</circle>` +
    `<circle r="50" fill="none" stroke="${accent}" stroke-width="1.4" stroke-dasharray="5 11" opacity="0.85">${drift(a, -160, 7)}</circle>` +
    `<circle r="38" fill="none" stroke="${p.light}" stroke-width="1" stroke-dasharray="3 9" opacity="0.7">${drift(a, 120, 5)}</circle>`;

  // morphing interference waveform
  const waveA = 'M -52 0 Q -39 -14 -26 0 Q -13 14 0 0 Q 13 -14 26 0 Q 39 14 52 0';
  const waveB = 'M -52 0 Q -39 14 -26 0 Q -13 -14 0 0 Q 13 14 26 0 Q 39 -14 52 0';
  const wave =
    `<path d="${waveA}" fill="none" stroke="${tone(accent, 0.5, 0.85)}" stroke-width="1" opacity="0.5">` +
    drift(a, -52, 4) +
    when(a, `<animate attributeName="d" values="${waveA};${waveB};${waveA}" dur="6s" repeatCount="indefinite"/>`) +
    `</path>`;

  // breathing faceted core gem
  const gem =
    `<g>${tweenT(a, 'scale', '0.9;1.08;0.9', 3.4)}` +
    `<polygon points="0,-24 9,-9 24,0 9,9 0,24 -9,9 -24,0 -9,-9" fill="${u('core')}" opacity="0.9"/>` +
    `<polygon points="0,-15 13,0 0,15 -13,0" fill="${u('core')}"/>` +
    `<polygon points="0,-9 7,0 0,9 -7,0" fill="${p.core[0]}"/>` +
    `<g stroke="${p.deep}" stroke-width="0.5" opacity="0.85"><line x1="0" y1="-15" x2="0" y2="15"/><line x1="-13" y1="0" x2="13" y2="0"/><line x1="0" y1="-9" x2="7" y2="0"/><line x1="0" y1="9" x2="-7" y2="0"/></g></g>` +
    `<circle r="2.6" fill="#ffffff"/>`;

  // orbiting comet-bodies
  const orbit = (deg: number, dur: number, cx: number, cy: number, r: number, fill: string, arc?: string) =>
    `<g transform="rotate(${deg})">${spin(a, dur, deg, deg + 360)}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>${arc ?? ''}</g>`;
  const orbiters =
    `<g filter="${u('bl')}">` +
    orbit(0, 9, 40, 0, 3, p.light, `<path d="M 40 0 A 40 40 0 0 0 30 -26" fill="none" stroke="${p.light}" stroke-width="1.4" opacity="0.5"/>`) +
    orbit(200, 14, -50, 0, 2.4, tone(accent, 0.5, 0.82), `<path d="M -50 0 A 50 50 0 0 1 -38 32" fill="none" stroke="${tone(accent, 0.5, 0.82)}" stroke-width="1.2" opacity="0.45"/>`) +
    orbit(90, 24, 0, 58, 2, p.hilite) +
    `</g>`;

  return (
    `<circle r="62" fill="${u('core')}" opacity="0.2">${breathe(a, 0.12, 0.28, 4)}</circle>` +
    spokes + stars + rings + wave + gem + orbiters
  );
}
