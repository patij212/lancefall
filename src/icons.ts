// src/icons.ts — the cockpit inline-SVG glyph set (playtest: "all perks and events need icons").
// Stroke-only, currentColor-tinted 24×24 glyphs so each card's --accent colours its icon (the
// same pattern as THE CHOICE's inline-SVG glyphs). PURE strings, no DOM/ctx — decoupled from
// ui.ts so it lands independently of the live skins work; ui.ts later renders icon(perk.glyph)
// on draft/evolution cards and icon(eventDef.id) on event headers.
//
// Record<PerkGlyph | RunEventId, ...> makes coverage a COMPILE-TIME guarantee: add a perk/evo
// glyph or an event id and tsc fails here until it has an icon.

import type { PerkGlyph } from './perks';
import type { RunEventId } from './events';

export type IconKey = PerkGlyph | RunEventId;

// Inner SVG markup per glyph (paths only — the wrapper supplies stroke/fill). Coordinates live
// in a 24×24 box centred on (12,12). Kept geometric + distinct so silhouettes read at card size.
const GLYPHS: Record<IconKey, string> = {
  // ── base perks (12) ──
  lance: '<path d="M4 20 L18 6"/><path d="M18 6 H12.5 M18 6 V11.5"/>', // a thrown spear
  cell: '<rect x="4" y="8" width="12" height="8" rx="1.5"/><path d="M18 10.5 V13.5"/><path d="M8.5 9.8 L11 12 L8.5 14.2"/>', // battery + charge
  graze: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/>', // near-miss aura rings
  burst: '<path d="M12 3 V8 M12 16 V21 M3 12 H8 M16 12 H21 M5.6 5.6 L9 9 M18.4 5.6 L15 9 M5.6 18.4 L9 15 M18.4 18.4 L15 15"/>', // spark
  ghost: '<path d="M6 19.5 V11 a6 6 0 0 1 12 0 V19.5 l-2.4 -1.6 -2.4 1.6 -2.4 -1.6 -2.4 1.6 z"/><circle cx="9.7" cy="11" r="0.7"/><circle cx="14.3" cy="11" r="0.7"/>', // phasing ghost
  clock: '<circle cx="12" cy="12" r="7.5"/><path d="M12 7 V12 L15.5 14"/>', // time
  pierce: '<path d="M3 12 H21"/><path d="M16 7 L21 12 L16 17"/>', // penetrating arrow
  siphon: '<path d="M12 4 C12 4 6.5 11 6.5 15 a5.5 5.5 0 0 0 11 0 C17.5 11 12 4 12 4 Z"/>', // life droplet (drain)
  window: '<path d="M9 5 H5 V19 H9"/><path d="M15 5 H19 V19 H15"/><circle cx="12" cy="12" r="1.4"/>', // timing bracket
  nova: '<circle cx="12" cy="12" r="2.8"/><path d="M12 3 V6 M12 18 V21 M3 12 H6 M18 12 H21 M5.6 5.6 L7.8 7.8 M18.4 5.6 L16.2 7.8 M5.6 18.4 L7.8 16.2 M18.4 18.4 L16.2 16.2"/>', // radial burst
  reflect: '<path d="M12 4 L19 7 V11.5 c0 4.5 -3 7.5 -7 9.5 c-4 -2 -7 -5 -7 -9.5 V7 Z"/><path d="M9 12.5 L12 9.5 L15 12.5"/>', // shield + deflect chevron
  gem: '<path d="M12 4 L19 10 L12 20 L5 10 Z"/><path d="M5 10 H19 M12 4 L9 10 M12 4 L15 10"/>', // faceted shard (matches XP)

  // ── evolutions (7) — "amped" silhouettes of their base perk ──
  impaler: '<path d="M3 21 L18 6"/><path d="M18 6 H11.5 M18 6 V12.5"/><path d="M8.5 15.5 L11.5 12.5 M12.5 11.5 L15.5 8.5"/>', // barbed greatspear
  supernova: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5"/><path d="M12 1.5 V5 M12 19 V22.5 M1.5 12 H5 M19 12 H22.5"/>', // ringed star
  perpetual: '<path d="M6.5 12 a5.5 5.5 0 1 1 1.7 4"/><path d="M8 12.5 L8.2 16.3 L4.4 15.6"/>', // endless cycle arrow
  wraith: '<path d="M6 20 V10 a6 6 0 0 1 12 0 V20 l-2.4 -2.2 -2.4 2.2 -2.4 -2.2 -2.4 2.2 z"/><path d="M8.8 10.8 L11 11.8 M15.2 10.8 L13 11.8"/>', // fierce phantom
  inferno: '<path d="M12 3 c2.8 3.6 1.2 5.6 2.6 7.6 c0.9 -0.9 1.3 -2.2 1.3 -2.2 c1.6 2.4 1 5.2 -1 7.2 a5 5 0 0 1 -6 0 c-2.4 -2.4 -1.6 -5.6 0 -7.6 c0.9 0.9 1.4 1.8 1.4 1.8 C12 8.5 9.2 6 12 3 Z"/>', // flame
  juggernaut: '<path d="M12 3 L20 6 V12 c0 5 -3.6 8 -8 10 c-4.4 -2 -8 -5 -8 -10 V6 Z"/><path d="M12 4.5 V19.5 M5 9.5 H19"/>', // reinforced fortress
  aegis: '<path d="M12 3 L19 6 V11 c0 5 -3 8 -7 10 c-4 -2 -7 -5 -7 -10 V6 Z"/><path d="M8.5 12 L11 14.5 L15.5 9.5"/>', // warded shield

  // ── mid-run events (5) — the RunEventId IS the icon key (header glyphs) ──
  shrine: '<path d="M6 20 H18 M8 20 V11 a4 4 0 0 1 8 0 V20"/><path d="M12 7 V3 M10 4.5 H14"/>', // altar arch + totem
  gamble: '<rect x="5" y="5" width="14" height="14" rx="2.5"/><circle cx="9" cy="9" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="15" cy="15" r="1"/>', // die
  treasure: '<path d="M4.5 9 L7 5.5 H17 L19.5 9"/><rect x="4.5" y="9" width="15" height="9" rx="1"/><path d="M4.5 13 H19.5"/><path d="M12 11.5 V14.5"/>', // chest
  eliteWave: '<path d="M5 17 H19 L18 8 L14.5 12 L12 6 L9.5 12 L6 8 Z"/>', // champion crown
  cursedBargain: '<path d="M12 4 a7 7 0 0 1 7 7 c0 2.6 -1.6 4.2 -2 6 H7 c-0.4 -1.8 -2 -3.4 -2 -6 a7 7 0 0 1 7 -7 Z"/><circle cx="9.6" cy="11" r="1.5"/><circle cx="14.4" cy="11" r="1.5"/><path d="M10 17.5 V20 M12 17.5 V20 M14 17.5 V20"/>', // cursed skull
};

const WRAP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

/** Full inline-SVG markup for a glyph key. Unknown keys fall back to the spear so a card never
 *  renders blank/crashes. Tint via CSS `color` / the --accent var (the svg uses currentColor). */
export function icon(key: IconKey): string {
  return `${WRAP}${GLYPHS[key] ?? GLYPHS.lance}</svg>`;
}

/** Runtime list of every icon key (for tooling/tests; coverage is also enforced by the Record). */
export const ICON_KEYS = Object.keys(GLYPHS) as IconKey[];
