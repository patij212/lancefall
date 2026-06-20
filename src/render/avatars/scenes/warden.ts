// THE WARDEN'S SEAL — gate. Ported from the locked prototype: a barred
// portcullis with the bar drawn across from the *inside*, a lock-shield with a
// glowing keyhole, and embers rising. "I bolted the gate from the inside."

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { tween } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const id = (n: string) => `${n}-${uid}`;
  const seal = tone(accent, 1, 0.62);
  const sealLight = tone(accent, 0.6, 0.85);
  const sealDark = tone(accent, 0.9, 0.22);

  const defs =
    `<defs><linearGradient id="${id('seal')}" x1="0" y1="0" x2="0.4" y2="1">` +
    `<stop offset="0%" stop-color="${sealDark}"/><stop offset="45%" stop-color="${seal}"/><stop offset="100%" stop-color="${sealLight}"/></linearGradient></defs>`;
  const sealU = `url(#${id('seal')})`;

  // alarm pulse ring
  const pulse = a
    ? `<circle r="20" fill="none" stroke="${accent}" stroke-width="2" opacity="0"><animate attributeName="r" values="14;58" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0" dur="3s" repeatCount="indefinite"/></circle>`
    : `<circle r="38" fill="none" stroke="${accent}" stroke-width="2" opacity="0.2"/>`;

  // portcullis arch + bars
  const portcullis =
    `<path d="M -44 56 L -44 -18 Q -44 -54 0 -58 Q 44 -54 44 -18 L 44 56 Z" fill="${p.bg}" stroke="${sealU}" stroke-width="2.2"/>` +
    `<g stroke="${sealU}" stroke-width="3.4" stroke-linecap="round"><line x1="-30" y1="-44" x2="-30" y2="56"/><line x1="-15" y1="-52" x2="-15" y2="56"/><line x1="0" y1="-56" x2="0" y2="56"/><line x1="15" y1="-52" x2="15" y2="56"/><line x1="30" y1="-44" x2="30" y2="56"/></g>` +
    `<g stroke="${sealDark}" stroke-width="0.8" opacity="0.7"><line x1="-30" y1="-44" x2="-30" y2="56"/><line x1="0" y1="-56" x2="0" y2="56"/><line x1="30" y1="-44" x2="30" y2="56"/></g>` +
    `<g stroke="${sealU}" stroke-width="2.4" opacity="0.85"><line x1="-42" y1="-22" x2="42" y2="-22"/><line x1="-44" y1="6" x2="44" y2="6"/></g>`;

  // the bar drawn across from the inside (the betrayal)
  const bar =
    `<rect x="-46" y="-8" width="92" height="9" rx="2" fill="${sealU}" filter="${u('blS', uid)}" transform="rotate(-9)"/>` +
    `<g fill="${sealLight}" filter="${u('bl', uid)}"><circle cx="-44" cy="-1" r="3.6"/><circle cx="44" cy="-15" r="3.6"/></g>`;

  // lock-shield + glowing keyhole
  const keyholeGlow = a
    ? `<circle cx="0" cy="16" r="8" fill="${accent}" opacity="0.35" filter="${u('bl', uid)}"><animate attributeName="opacity" values="0.15;0.55;0.15" dur="2s" repeatCount="indefinite"/></circle>`
    : `<circle cx="0" cy="16" r="8" fill="${accent}" opacity="0.35" filter="${u('bl', uid)}"/>`;
  const lock =
    `<path d="M -22 30 L 22 30 L 16 8 Q 0 -2 -16 8 Z" fill="${p.bg}" stroke="${sealU}" stroke-width="1.6"/>` +
    keyholeGlow +
    `<circle cx="0" cy="16" r="6" fill="${tone(accent, 0.9, 0.16)}" stroke="${seal}" stroke-width="1.4"/>` +
    `<circle cx="0" cy="14" r="2.2" fill="${sealLight}"/><polygon points="-1.6,15 1.6,15 3,26 -3,26" fill="${sealLight}"/>`;

  // the broken bolt-mark + rising embers
  const boltMark = `<g stroke="${seal}" stroke-width="0.9" opacity="${a ? 0.4 : 0.7}"><path d="M -38 -30 L -22 -12 L -34 2">${tween(a, 'opacity', '0.4;1;0.4', 2.4)}</path></g>`;
  const ember = (cx: number, cy: number, r: number, dur: number) =>
    a
      ? `<circle cx="${cx}" cy="${cy}" r="${r}"><animate attributeName="cy" values="${cy + 4};-10" dur="${dur}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="${dur}s" repeatCount="indefinite"/></circle>`
      : `<circle cx="${cx}" cy="${cy - 18}" r="${r}" opacity="0.6"/>`;
  const embers = `<g fill="${sealLight}" filter="${u('bl', uid)}">${ember(-26, 40, 1.4, 3.6)}${ember(6, 48, 1.1, 4.4)}${ember(28, 44, 1.2, 3.1)}</g>`;

  return (
    defs +
    pulse +
    coreGlow(ctx, { r: 64, op: 0.28 }) +
    portcullis + bar + lock + boltMark + embers
  );
}
