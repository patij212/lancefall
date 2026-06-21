// THE WARDEN'S SEAL — gate. A fortified gate sealed from within: a carved stone
// archway with a keystone, a heavy spiked portcullis riveted shut, draped chains,
// the first wheel bolted behind a heraldic padlock-seal whose keyhole still glows,
// embers rising from the forge below. "I bolted the gate from the inside."

import type { SceneCtx } from '../registry';
import { tone } from '../primitives';
import { tween, spin } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const id = (n: string) => `${n}-${uid}`;
  const seal = tone(accent, 1, 0.62);
  const sealLight = tone(accent, 0.6, 0.85);
  const sealDark = tone(accent, 0.9, 0.22);
  const stone = tone(accent, 0.45, 0.16);
  const stoneHi = tone(accent, 0.4, 0.34);

  const defs =
    `<defs><linearGradient id="${id('seal')}" x1="0" y1="0" x2="0.4" y2="1">` +
    `<stop offset="0%" stop-color="${sealDark}"/><stop offset="45%" stop-color="${seal}"/><stop offset="100%" stop-color="${sealLight}"/></linearGradient></defs>`;
  const sealU = `url(#${id('seal')})`;

  const pulse = a
    ? `<circle r="20" fill="none" stroke="${accent}" stroke-width="2" opacity="0"><animate attributeName="r" values="14;58" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0" dur="3s" repeatCount="indefinite"/></circle>`
    : `<circle r="40" fill="none" stroke="${accent}" stroke-width="2" opacity="0.2"/>`;

  // carved stone archway with voussoir blocks + keystone
  let voussoir = '';
  for (let i = -5; i <= 5; i++) {
    const ang = (i * 16 - 90) * (Math.PI / 180);
    voussoir += `<line x1="${(Math.cos(ang) * 42).toFixed(1)}" y1="${(Math.sin(ang) * 42 - 8).toFixed(1)}" x2="${(Math.cos(ang) * 54).toFixed(1)}" y2="${(Math.sin(ang) * 54 - 8).toFixed(1)}" stroke="${stone}" stroke-width="0.8" opacity="0.7"/>`;
  }
  const arch =
    `<path d="M -54 58 L -54 -8 Q -54 -58 0 -62 Q 54 -58 54 -8 L 54 58 L 42 58 L 42 -8 Q 42 -50 0 -54 Q -42 -50 -42 -8 L -42 58 Z" fill="${stone}" stroke="${stoneHi}" stroke-width="1"/>` +
    `<g transform="translate(0,-8)">${voussoir}</g>` +
    `<path d="M -8 -54 L 8 -54 L 6 -42 L -6 -42 Z" fill="${stoneHi}" stroke="${sealDark}" stroke-width="0.8"/>` + // keystone
    `<g fill="${sealLight}" opacity="0.7"><circle cx="-48" cy="50" r="1.4"/><circle cx="48" cy="50" r="1.4"/><circle cx="-48" cy="20" r="1.4"/><circle cx="48" cy="20" r="1.4"/></g>`;

  // draped chains on each side
  const chain = (sx: number) =>
    `<g fill="none" stroke="${sealDark}" stroke-width="2" opacity="0.8" stroke-dasharray="2 3">` +
    `<path d="M ${sx} -40 Q ${sx + sx / 4} -18 ${sx} 6 Q ${sx - sx / 4} 30 ${sx} 54"/></g>`;
  const chains = chain(-38) + chain(38);

  // heavier spiked portcullis (lattice + spikes) inside the arch
  let lattice = '';
  for (const x of [-30, -15, 0, 15, 30]) lattice += `<line x1="${x}" y1="-44" x2="${x}" y2="54" stroke="${sealU}" stroke-width="3.2" stroke-linecap="round"/>`;
  for (const yy of [-22, 6, 30]) lattice += `<line x1="-40" y1="${yy}" x2="40" y2="${yy}" stroke="${sealU}" stroke-width="2.4" opacity="0.9"/>`;
  let spikes = '';
  for (const x of [-30, -15, 0, 15, 30]) spikes += `<polygon points="${x - 3},54 ${x + 3},54 ${x},62" fill="${sealU}"/>`;
  let rivets = '';
  for (const x of [-30, -15, 0, 15, 30]) for (const yy of [-22, 6, 30]) rivets += `<circle cx="${x}" cy="${yy}" r="1.5" fill="${sealLight}"/>`;
  const portcullis = `<g>${lattice}${spikes}<g>${rivets}</g></g>`;

  // the first wheel — a spoked gear bolted behind the lock
  let teeth = '';
  for (let i = 0; i < 12; i++) teeth += `<g transform="rotate(${i * 30})"><rect x="-1.4" y="-15" width="2.8" height="3.5" fill="${seal}"/></g>`;
  let spokes = '';
  for (let i = 0; i < 6; i++) spokes += `<g transform="rotate(${i * 60})"><line x1="0" y1="0" x2="0" y2="-11" stroke="${seal}" stroke-width="1.4"/></g>`;
  const wheel =
    `<g transform="translate(0,16)" opacity="0.9"><g>${spin(a, 40)}<circle r="12" fill="none" stroke="${seal}" stroke-width="1.6"/>${teeth}${spokes}</g>` +
    `<circle r="3.5" fill="${tone(accent, 0.9, 0.14)}" stroke="${seal}" stroke-width="1"/></g>`;

  // the bar drawn from the inside (the betrayal)
  const bar =
    `<rect x="-46" y="-8" width="92" height="9" rx="2" fill="${sealU}" filter="${u('blS', uid)}" transform="rotate(-9)"/>` +
    `<g fill="${sealLight}" filter="${u('bl', uid)}"><circle cx="-44" cy="-1" r="3.6"/><circle cx="44" cy="-15" r="3.6"/></g>`;

  // heraldic padlock-seal at centre with a glowing keyhole + crest
  const keyholeGlow = a
    ? `<circle cx="0" cy="16" r="9" fill="${accent}" opacity="0.35" filter="${u('bl', uid)}"><animate attributeName="opacity" values="0.15;0.55;0.15" dur="2s" repeatCount="indefinite"/></circle>`
    : `<circle cx="0" cy="16" r="9" fill="${accent}" opacity="0.35" filter="${u('bl', uid)}"/>`;
  const lock =
    `<path d="M -24 32 L 24 32 L 18 6 Q 0 -4 -18 6 Z" fill="${tone(accent, 0.8, 0.1)}" stroke="${sealU}" stroke-width="1.8"/>` +
    `<path d="M -14 6 Q -14 -8 0 -8 Q 14 -8 14 6" fill="none" stroke="${seal}" stroke-width="2"/>` + // shackle
    keyholeGlow +
    `<circle cx="0" cy="16" r="6.5" fill="${tone(accent, 0.9, 0.16)}" stroke="${seal}" stroke-width="1.4"/>` +
    `<circle cx="0" cy="14" r="2.4" fill="${sealLight}"/><polygon points="-1.8,15 1.8,15 3.2,27 -3.2,27" fill="${sealLight}"/>` +
    `<g stroke="${sealLight}" stroke-width="0.6" opacity="0.6" fill="none"><path d="M -18 24 L -10 24 M 10 24 L 18 24"/></g>`;

  // broken bolt-mark + forge-ember glow + rising embers
  const boltMark = `<g stroke="${seal}" stroke-width="0.9" opacity="${a ? 0.4 : 0.7}"><path d="M -38 -30 L -22 -12 L -34 2">${tween(a, 'opacity', '0.4;1;0.4', 2.4)}</path></g>`;
  const forge = `<ellipse cx="0" cy="56" rx="20" ry="6" fill="${u('core', uid)}" opacity="0.4"/>`;
  const ember = (cx: number, cy: number, r: number, dur: number) =>
    a
      ? `<circle cx="${cx}" cy="${cy}" r="${r}"><animate attributeName="cy" values="${cy + 4};-12" dur="${dur}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="${dur}s" repeatCount="indefinite"/><animate attributeName="cx" values="${cx};${cx + (cx < 0 ? -5 : 5)}" dur="${dur}s" repeatCount="indefinite"/></circle>`
      : `<circle cx="${cx}" cy="${cy - 20}" r="${r}" opacity="0.6"/>`;
  const embers = `<g fill="${sealLight}" filter="${u('blS', uid)}">${ember(-30, 46, 1.3, 3.6)}${ember(-10, 50, 1, 4.4)}${ember(12, 48, 1.2, 3.1)}${ember(30, 46, 1, 3.8)}</g>`;

  return (
    defs +
    pulse +
    coreGlow(ctx, { r: 64, op: 0.24 }) +
    arch + chains + portcullis + wheel + bar + lock + boltMark + forge + embers
  );
}
