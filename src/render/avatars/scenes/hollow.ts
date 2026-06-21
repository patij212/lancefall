// THE HOLLOW — implode. A void that takes everything: an event-horizon core
// ringed by a photon glow, three accretion spiral-arms streaming inward,
// staggered collapsing rings, gravitational-lens warp arcs, a shattered halo
// shedding fragments, and the lost key flickering once per cycle. "Nothing left."

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, breathe, when } from '../motion';
import { coreGlow } from './_common';

export function scene(ctx: SceneCtx): string {
  const { accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const deep = tone(accent, 0.8, 0.4);
  const light = tone(accent, 0.5, 0.82);
  const voidDark = tone(accent, 0.8, 0.04);

  // gravitational-lens warp arcs bending around the void (counter-rotating)
  let warp = '';
  for (let i = 0; i < 6; i++) {
    const a0 = i * 60;
    warp += `<path d="M ${(Math.cos((a0 * Math.PI) / 180) * 52).toFixed(1)} ${(Math.sin((a0 * Math.PI) / 180) * 52).toFixed(1)} A 52 52 0 0 1 ${(Math.cos(((a0 + 38) * Math.PI) / 180) * 52).toFixed(1)} ${(Math.sin(((a0 + 38) * Math.PI) / 180) * 52).toFixed(1)}" fill="none" stroke="${deep}" stroke-width="${i % 2 ? 1.2 : 0.6}" opacity="0.4"/>`;
  }
  const warpRing = `<g>${spin(a, 30)}${warp}</g>`;

  // many staggered collapsing rings
  const ring = (begin: number, staticR: number, sw: number) =>
    a
      ? `<circle fill="none" stroke="${accent}" opacity="0"><animate attributeName="r" values="60;2" dur="3s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="stroke-width" values="2.4;0.3" dur="3s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.7;0" dur="3s" begin="${begin}s" repeatCount="indefinite"/></circle>`
      : `<circle r="${staticR}" fill="none" stroke="${accent}" stroke-width="${sw}" opacity="0.4"/>`;
  const rings = ring(0, 48, 1.6) + ring(0.6, 38, 1.4) + ring(1.2, 28, 1.2) + ring(1.8, 18, 1) + ring(2.4, 10, 0.8);

  // three accretion spiral-arms of particles streaming inward
  const arm = (phase: number) => {
    let pts = '';
    const M = 10;
    for (let k = 0; k < M; k++) {
      const t = k / M;
      const rad = 56 - t * 50;
      const ang = phase + t * 150; // spiral
      const x = Math.cos((ang * Math.PI) / 180) * rad;
      const y = Math.sin((ang * Math.PI) / 180) * rad;
      const r = 1.6 - t * 1.1;
      const begin = (t * 3).toFixed(2);
      pts += a
        ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" opacity="0"><animate attributeName="opacity" values="0;0.9;0" keyTimes="0;0.5;1" dur="3s" begin="${begin}s" repeatCount="indefinite"/></circle>`
        : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" opacity="${(0.7 - t * 0.4).toFixed(2)}"/>`;
    }
    return pts;
  };
  const spiral = `<g fill="${light}"><g>${spin(a, 12, 0, -360)}${arm(0)}${arm(120)}${arm(240)}</g></g>`;

  // shattered halo — an arc shedding drifting fragments
  const arcPath = 'M 0 -50 A 50 50 0 1 1 -35.4 -35.4';
  const frag = (cx: number, cy: number, dx: number, dy: number, begin: number) =>
    a
      ? `<polygon points="0,-2 2,0 0,2 -2,0" fill="${deep}" opacity="0"><animate attributeName="opacity" values="0;0.8;0" keyTimes="0;0.3;1" dur="4s" begin="${begin}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="${cx} ${cy};${cx + dx} ${cy + dy}" dur="4s" begin="${begin}s" repeatCount="indefinite"/></polygon>`
      : `<polygon points="0,-2 2,0 0,2 -2,0" fill="${deep}" opacity="0.5" transform="translate(${cx + dx * 0.5},${cy + dy * 0.5})"/>`;
  const halo =
    `<path d="${arcPath}" fill="none" stroke="${deep}" stroke-width="3" opacity="0.8"/>` +
    `<path d="${arcPath}" fill="none" stroke="${accent}" stroke-width="1.2" stroke-dasharray="2 7" opacity="0.7">${when(a, '<animate attributeName="stroke-dashoffset" from="0" to="60" dur="6s" repeatCount="indefinite"/>')}</path>` +
    `<g fill="${light}"><circle cx="0" cy="-50" r="2.4"/><circle cx="-35.4" cy="-35.4" r="2.2"/></g>` +
    `<g>${frag(36, -34, 10, -8, 0)}${frag(48, -8, 12, 2, 1.3)}${frag(20, -46, 6, -10, 2.4)}</g>`;

  // event-horizon void + photon ring
  const voidCore =
    `<circle r="17" fill="${voidDark}"/>` +
    `<circle r="17" fill="none" stroke="${deep}" stroke-width="1.4">${a ? '<animate attributeName="r" values="15;19;15" dur="3.6s" repeatCount="indefinite"/>' : ''}</circle>` +
    `<circle r="13" fill="none" stroke="${light}" stroke-width="0.6" opacity="0.5"/>` + // photon ring
    `<circle r="11" fill="${p.bg}"/>` +
    `<circle r="3" fill="${accent}" opacity="0.8">${breathe(a, 0.3, 0.9, 2)}${a ? '<animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite"/>' : ''}</circle>`;

  // the lost key-glyph flickering in the void
  const keyGlyph =
    `<g stroke="${light}" stroke-width="1.2" fill="none" opacity="${a ? 0 : 0.45}">` +
    when(a, '<animate attributeName="opacity" values="0;0;0.9;0.9;0;0" keyTimes="0;0.42;0.47;0.55;0.62;1" dur="5s" repeatCount="indefinite"/>') +
    `<circle cx="0" cy="-3.5" r="4.5"/><line x1="0" y1="1" x2="0" y2="11"/><line x1="0" y1="6" x2="4.5" y2="6"/><line x1="0" y1="11" x2="3.5" y2="11"/></g>`;

  return (
    coreGlow(ctx, { r: 60, op: 0.16, lo: 0.05, hi: 0.2, dur: 3.6 }) +
    warpRing + rings + halo + spiral + voidCore + keyGlyph
  );
}
