// THE BEAT — pulse. A rhythm engine: a radial spectrum analyzer dancing in a
// travelling wave, a morphing circular oscilloscope, harmonic rings, a 16-pip
// ring with a sweeping on-beat tick, staggered sonar beat-rings and a faceted
// pulse-core. The dash-on-the-beat reward, made audible.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, twinkle, tween, tweenT, drift, when } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const dur = 1.8; // one beat

  // harmonic rings
  const rings =
    `<g fill="none">` +
    `<circle r="58" stroke="${tone(accent, 0.7, 0.3)}" stroke-width="0.6" stroke-dasharray="2 8" opacity="0.45">${spin(a, 60)}</circle>` +
    `<circle r="46" stroke="${tone(accent, 0.7, 0.4)}" stroke-width="0.5" opacity="0.4"/>` +
    `<circle r="20" stroke="${p.deep}" stroke-width="0.5" opacity="0.5"/></g>`;

  // radial spectrum analyzer — 20 bars anchored at r0, dancing in a wave
  const N = 20, r0 = 24;
  let bars = '';
  for (let i = 0; i < N; i++) {
    const ang = i * (360 / N);
    const len = 5 + 7 * Math.abs(Math.sin(i * 0.9)) + 3.5 * Math.abs(Math.sin(i * 0.42 + 1));
    const grow = when(a, `<animateTransform attributeName="transform" type="scale" values="1 0.55;1 1.3;1 0.55" dur="${dur}s" begin="${((i / N) * dur).toFixed(2)}s" repeatCount="indefinite"/>`);
    bars +=
      `<g transform="rotate(${ang})"><g transform="translate(0,${-r0})">${grow}` +
      `<rect x="-1.2" y="${(-len).toFixed(1)}" width="2.4" height="${len.toFixed(1)}" rx="1.1" fill="${i % 3 === 0 ? p.core[0] : accent}" opacity="0.8"/></g></g>`;
  }
  const spectrum = `<g>${bars}</g>`;

  // morphing circular oscilloscope (a rounded waveform star)
  const waveAt = (amp: number) => {
    const pts: string[] = [];
    const M = 24;
    for (let i = 0; i <= M; i++) {
      const ang = (i / M) * Math.PI * 2;
      const r = 40 + Math.sin(ang * 6) * amp;
      pts.push(`${i === 0 ? 'M' : 'L'} ${(Math.cos(ang) * r).toFixed(1)} ${(Math.sin(ang) * r).toFixed(1)}`);
    }
    return pts.join(' ') + ' Z';
  };
  const wave =
    `<path d="${waveAt(4)}" fill="none" stroke="${tone(accent, 0.6, 0.82)}" stroke-width="1" opacity="0.55">` +
    drift(a, -60, 5) +
    when(a, `<animate attributeName="d" values="${waveAt(3)};${waveAt(8)};${waveAt(3)}" dur="${dur}s" repeatCount="indefinite"/>`) +
    `</path>`;

  // 16-pip ring + radial ticks + a sweeping on-beat tick
  let pipRing = '';
  for (let i = 0; i < 16; i++) {
    const ang = (i * 22.5 - 90) * (Math.PI / 180);
    pipRing += `<circle cx="${(Math.cos(ang) * 53).toFixed(1)}" cy="${(Math.sin(ang) * 53).toFixed(1)}" r="${i % 4 === 0 ? 1.8 : 1.1}" fill="${accent}" opacity="0.45"/>`;
  }
  const sweep = `<g><g>${spin(a, dur * 4, -90, 270)}<circle cx="53" cy="0" r="2.6" fill="${p.core[0]}"/><circle cx="53" cy="0" r="5" fill="${accent}" opacity="0.3" filter="${u('blS', uid)}"/></g></g>`;
  const pips = `<g>${pipRing}<circle r="53" fill="none" stroke="${p.deep}" stroke-width="0.4" stroke-dasharray="1 7" opacity="0.4"/></g>${sweep}`;

  // staggered sonar beat-rings
  const beatRing = (begin: number) =>
    a
      ? `<circle fill="none" stroke="${accent}" stroke-width="1.6" opacity="0"><animate attributeName="r" values="8;56" dur="${dur * 1.5}s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0" dur="${dur * 1.5}s" begin="${begin}s" repeatCount="indefinite"/></circle>`
      : `<circle r="${20 + begin * 16}" fill="none" stroke="${accent}" stroke-width="1.3" opacity="${0.4 - begin * 0.3}"/>`;
  const sonar = beatRing(0) + beatRing(dur * 0.5) + beatRing(dur);

  // faceted pulse-core + ping
  const ping = a ? `<circle r="7" fill="none" stroke="${p.hilite}" stroke-width="1" opacity="0">${tween(a, 'opacity', '0;0.85;0;0', dur, { keyTimes: '0;0.1;0.45;1' })}<animate attributeName="r" values="6;16;16" keyTimes="0;0.45;1" dur="${dur}s" repeatCount="indefinite"/></circle>` : '';
  const core =
    `<g>${tweenT(a, 'scale', '0.8;1.18;0.8', dur)}` +
    `<circle r="12" fill="${u('core', uid)}" opacity="0.95"/>` +
    `<polygon points="0,-9 7.5,0 0,9 -7.5,0" fill="${accent}"/>` +
    `<polygon points="0,-5 4,0 0,5 -4,0" fill="${p.core[0]}"/></g>` +
    `<circle r="2" fill="#fff">${twinkle(a, dur, 0.7, 1)}</circle>` + ping;

  return (
    coreGlow(ctx, { op: 0.16, lo: 0.1, hi: 0.26, dur: 3.2 }) +
    starfield(ctx, [[-50, -24, 0.8, 2.6, 0.3], [48, -32, 0.8, 3.1, 0.5], [52, 20, 0.8, 2.2, 0.3], [-38, 42, 0.8, 3.6, 0.5]]) +
    rings + sonar + spectrum + wave + pips + core
  );
}
