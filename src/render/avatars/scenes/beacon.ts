// THE DARK BEACON — sweep. A Fresnel lighthouse eye with a dim, failing beam
// sweeping the dark; the lens flickers as if trying to relight and never quite
// catching. "I let the signal go dark. I still hear it asking."

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, breathe, tween } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const id = (n: string) => `${n}-${uid}`;

  // beam gradient — bright at the lens, fading out
  const defs =
    `<defs><linearGradient id="${id('beam')}" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0%" stop-color="${p.light}" stop-opacity="0.55"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs>`;

  // faint horizon/sea band
  const sea = `<rect x="-66" y="40" width="132" height="20" fill="${tone(accent, 0.7, 0.12)}" opacity="0.6"/><line x1="-60" y1="42" x2="60" y2="42" stroke="${p.deep}" stroke-width="0.6" opacity="0.4"/>`;

  // the sweeping beam wedge — dim, flickering (the light that fails)
  const beamWedge = `<path d="M 0 0 L 70 -16 L 70 16 Z" fill="url(#${id('beam')})"/>`;
  const beam = a
    ? `<g opacity="0.9"><animate attributeName="opacity" values="0.25;0.9;0.4;0.7;0.2" dur="2.2s" repeatCount="indefinite"/>` +
      `<g>${spin(a, 6)}${beamWedge}</g></g>`
    : `<g opacity="0.6"><g transform="rotate(-28)">${beamWedge}</g></g>`;

  // the lens — Fresnel rings + an eye that flickers
  const lens =
    `<g>` +
    `<circle r="22" fill="${tone(accent, 0.8, 0.08)}" stroke="${p.deep}" stroke-width="1.4"/>` +
    `<g fill="none" stroke="${accent}" stroke-width="0.8" opacity="0.5"><ellipse rx="22" ry="7"/><ellipse rx="22" ry="14"/><line x1="-22" y1="0" x2="22" y2="0"/></g>` +
    `<ellipse rx="11" ry="16" fill="${u('core', uid)}" opacity="0.8"/>` +
    `<circle r="6" fill="${p.bg}" stroke="${accent}" stroke-width="1"/>` +
    `<circle r="3" fill="${p.core[0]}" opacity="${a ? 0.8 : 0.7}">${a ? `<animate attributeName="opacity" values="0.2;1;0.3;0.9;0.2" dur="2.2s" repeatCount="indefinite"/>` : ''}</circle>` +
    `</g>`;

  // a dim distress glow that tries to bloom and fails
  const distress = a
    ? `<circle r="30" fill="${u('core', uid)}" opacity="0">${tween(a, 'opacity', '0;0.4;0;0', 4.4, { keyTimes: '0;0.1;0.4;1' })}</circle>`
    : `<circle r="30" fill="${u('core', uid)}" opacity="0.12"/>`;

  // tower hint below the lens
  const tower = `<path d="M -14 22 L -10 56 L 10 56 L 14 22 Z" fill="${tone(accent, 0.7, 0.1)}" stroke="${p.deep}" stroke-width="1"/><g stroke="${p.deep}" stroke-width="0.7" opacity="0.6"><line x1="-12" y1="34" x2="12" y2="34"/><line x1="-13" y1="46" x2="13" y2="46"/></g>`;

  return (
    defs +
    coreGlow(ctx, { r: 58, op: 0.1, lo: 0.05, hi: 0.16, dur: 3.6 }) +
    starfield(ctx, [[-46, -42, 0.9, 2.6, 0.3], [42, -44, 0.8, 3.1, 0.5], [50, -22, 0.8, 2.2, 0.3], [-50, -20, 0.7, 3.6, 0.4]]) +
    sea + distress + beam + tower + lens + breatheHaze(ctx, a)
  );
}

// a faint pulsing haze ring around the lens
function breatheHaze(ctx: SceneCtx, a: boolean): string {
  const p = paletteFor(ctx.accent);
  return `<circle r="26" fill="none" stroke="${p.light}" stroke-width="0.6" opacity="0.4">${breathe(a, 0.15, 0.45, 2.2)}</circle>`;
}
