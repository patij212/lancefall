// THE MIRRORBLADE — mirror. A mercury mirror split down a vertical seam: a
// faceted blade-fan emblem in the boss's red on the left, its reflection on the
// right in the player's own cyan — but the reflection glitch-desyncs, betraying
// it. A split watching-eye holds the seam; shards of mirror-glass hang glinting.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { breathe, drift, twinkle, spin } from '../motion';
import { coreGlow, u } from './_common';

const CYAN = '#7df9ff';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);

  // a faceted blade (kite) from an inner base to an outer tip
  const blade = (ix: number, iy: number, tx: number, ty: number, w: number, fill: string, hi: string) => {
    const dx = tx - ix, dy = ty - iy, len = Math.hypot(dx, dy);
    const nx = (-dy / len) * w, ny = (dx / len) * w;
    const mx = (ix + tx) / 2, my = (iy + ty) / 2;
    return (
      `<polygon points="${ix},${iy} ${(mx + nx).toFixed(1)},${(my + ny).toFixed(1)} ${tx},${ty} ${(mx - nx).toFixed(1)},${(my - ny).toFixed(1)}" fill="${fill}"/>` +
      `<line x1="${ix}" y1="${iy}" x2="${tx}" y2="${ty}" stroke="${hi}" stroke-width="0.7" opacity="0.8"/>` +
      `<polygon points="${ix},${iy} ${(mx + nx * 0.5).toFixed(1)},${(my + ny * 0.5).toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}" fill="${hi}" opacity="0.5"/>`
    );
  };

  // a wing (three fanned blades) pointing left, coloured
  const wing = (fill: string, hi: string) =>
    `<g>` +
    blade(-5, -5, -44, -28, 4.5, fill, hi) +
    blade(-6, 0, -52, -1, 5.5, fill, hi) +
    blade(-5, 5, -44, 26, 4.5, fill, hi) +
    `<polygon points="-4,-9 -12,0 -4,9 -1,0" fill="${fill}"/>` +
    `</g>`;

  const real = `<g>${wing(accent, tone(accent, 0.6, 0.85))}</g>`;
  // reflection: mirrored, player-cyan, glitch-desyncing
  const glitch = a
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;3 -1;-2 1;0 0;0 0" keyTimes="0;0.52;0.57;0.63;0.7;1" dur="4s" repeatCount="indefinite" additive="sum"/>`
    : '';
  const glitchOp = a
    ? `<animate attributeName="opacity" values="0.78;0.78;0.4;0.85;0.6;0.78" keyTimes="0;0.52;0.57;0.63;0.7;1" dur="4s" repeatCount="indefinite"/>`
    : '';
  const reflection = `<g transform="scale(-1,1)" opacity="0.78"><g>${glitch}${glitchOp}${wing(CYAN, '#dffaff')}</g></g>`;

  // the split watching-eye on the seam
  const eye =
    `<g>${breathe(a, 0.88, 1, 3.2)}` +
    `<path d="M 0 -17 Q 15 0 0 17 Q -15 0 0 -17 Z" fill="${tone(accent, 0.6, 0.06)}" stroke="${p.hilite}" stroke-width="1"/>` +
    `<clipPath id="eye-${uid}"><path d="M 0 -17 Q 15 0 0 17 Q -15 0 0 -17 Z"/></clipPath>` +
    `<g clip-path="url(#eye-${uid})"><rect x="-15" y="-17" width="15" height="34" fill="${accent}" opacity="0.5"/><rect x="0" y="-17" width="15" height="34" fill="${CYAN}" opacity="0.5"/></g>` +
    `<circle r="7" fill="none" stroke="${p.hilite}" stroke-width="0.7" opacity="0.6"/>` +
    `<ellipse rx="2.4" ry="8" fill="#0a0306"/>` +
    `<circle cx="-1.5" cy="-4" r="1.6" fill="#fff" opacity="0.9"/></g>`;

  // the mirror seam — mercury sheen + a shimmer travelling down
  const seam =
    `<rect x="-2.5" y="-60" width="5" height="120" fill="${u('core', uid)}" opacity="0.16"/>` +
    `<line x1="0" y1="-58" x2="0" y2="58" stroke="${p.hilite}" stroke-width="0.8" opacity="0.5"/>` +
    `<line x1="0" y1="-58" x2="0" y2="58" stroke="#ffffff" stroke-width="1.4" stroke-dasharray="10 30" opacity="0.7">${drift(a, -80, 3)}</line>`;

  // suspended mirror-glass shards catching glints
  const shard = (cx: number, cy: number, rot: number, s: number, fill: string, dur: number) =>
    `<g transform="translate(${cx},${cy}) rotate(${rot})"><polygon points="0,${-s} ${(s * 0.5).toFixed(1)},${(s * 0.7).toFixed(1)} ${(-s * 0.4).toFixed(1)},${(s * 0.6).toFixed(1)}" fill="${fill}" opacity="0.3" stroke="${fill}" stroke-width="0.5"/>` +
    `<line x1="0" y1="${-s}" x2="${(s * 0.3).toFixed(1)}" y2="${(s * 0.4).toFixed(1)}" stroke="#fff" stroke-width="0.6" opacity="${a ? 0.4 : 0.7}">${twinkle(a, dur, 0.2, 1)}</line></g>`;
  const shards =
    `<g>${shard(-44, -40, 18, 7, accent, 2.6)}${shard(46, -36, -24, 6, CYAN, 3.2)}` +
    `${shard(-50, 36, -14, 6, accent, 2.9)}${shard(48, 42, 20, 7, CYAN, 2.3)}${shard(0, -52, 8, 5, p.hilite, 3.4)}</g>`;

  // slow guide ring
  const guide = `<circle r="56" fill="none" stroke="${tone(accent, 0.6, 0.34)}" stroke-width="0.6" stroke-dasharray="2 9" opacity="0.4">${spin(a, 70)}</circle>`;

  return (
    coreGlow(ctx, { op: 0.14, lo: 0.09, hi: 0.22, dur: 4 }) +
    guide + shards + reflection + real + seam + eye
  );
}
