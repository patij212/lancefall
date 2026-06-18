// src/icons.ts — the cockpit inline-SVG glyph set (playtest: "all perks and events need icons").
// Authored in the SAME layered language as the shipped cockpit art (MODE_ICONS / GO glyphs in
// ui.ts): a semi-transparent currentColor FILL body + a crisp currentColor stroke + secondary
// detail at reduced opacity + small filled accent dots/rays — NOT flat single-weight strokes.
// Everything is currentColor so each card's --accent (and its drop-shadow glow) tints the icon
// for free. PURE strings, no DOM/ctx — decoupled from ui.ts.
//
// Record<PerkGlyph | RunEventId, ...> makes coverage a COMPILE-TIME guarantee: add a perk/evo
// glyph or an event id and tsc fails here until it has an icon.

import type { PerkGlyph } from './perks';
import type { RunEventId } from './events';

export type IconKey = PerkGlyph | RunEventId;

// Inner SVG markup per glyph. The wrapper supplies only viewBox + round caps; each element sets
// its own fill/stroke/opacity (the MODE_ICONS convention) so icons read layered + neon, not flat.
const GLYPHS: Record<IconKey, string> = {
  // ── base perks (12) ──
  lance:
    '<defs><linearGradient id="__ID__-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity="0.95"/><stop offset="1" stop-color="currentColor" stop-opacity="0.3"/></linearGradient><radialGradient id="__ID__-a" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="currentColor" stop-opacity="0.4"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs><circle cx="17" cy="7" r="8.5" fill="url(#__ID__-a)"/><path d="M6.5 17 L8.6 14.9 M3.8 20.2 L5.6 18.4" stroke="currentColor" stroke-width="1" opacity="0.35"/><path d="M11 9 L5.6 18.4" stroke="currentColor" stroke-width="2"/><path d="M9 9.2 L13.4 13.6" stroke="currentColor" stroke-width="1.7"/><path d="M20 4 L21.6 6.6 L13 11 L11 9 Z" fill="url(#__ID__-b)" stroke="currentColor" stroke-width="0.9"/><path d="M19.3 5.5 L12.6 10.2" stroke="currentColor" stroke-width="0.7" opacity="0.55"/><path d="M5.6 18.4 L7.1 18.1 L6.3 20.1 L4.8 19.4 Z" fill="currentColor" fill-opacity="0.85"/><path d="M20.5 3.1 L20.9 4.7 L22.5 5.1 L20.9 5.5 L20.5 7.1 L20.1 5.5 L18.5 5.1 L20.1 4.7 Z" fill="currentColor" opacity="0.8"/>',
  cell:
    '<rect x="3.5" y="7.5" width="12" height="9" rx="1.6" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-width="1.3"/><rect x="15.6" y="10" width="2.6" height="4" rx="0.6" fill="currentColor" fill-opacity="0.85"/><path d="M9.6 9 L7.2 12.3 H9.3 L8.3 15 L11.6 11.1 H9.4 Z" fill="currentColor" fill-opacity="0.9"/>',
  graze:
    '<circle cx="12" cy="12" r="2.4" fill="currentColor"/><circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="1.4" opacity="0.85"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1" opacity="0.4"/><path d="M17 5.5 L19.2 7.3" stroke="currentColor" stroke-width="1.1" opacity="0.55"/><circle cx="20" cy="8" r="1" fill="currentColor" opacity="0.7"/>',
  burst:
    '<circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.4"/><path d="M12 2 L13.4 8 H10.6 Z" fill="currentColor"/><path d="M12 22 L10.6 16 H13.4 Z" fill="currentColor"/><path d="M2 12 L8 10.6 V13.4 Z" fill="currentColor"/><path d="M22 12 L16 13.4 V10.6 Z" fill="currentColor"/><path d="M5 5 L9.6 8 L8 9.6 Z" fill="currentColor" opacity="0.7"/><path d="M19 5 L14.4 8 L16 9.6 Z" fill="currentColor" opacity="0.7"/><path d="M5 19 L9.6 16 L8 14.4 Z" fill="currentColor" opacity="0.7"/><path d="M19 19 L14.4 16 L16 14.4 Z" fill="currentColor" opacity="0.7"/>',
  ghost:
    '<path d="M6 19.6 V11 a6 6 0 0 1 12 0 V19.6 l-2.4 -1.7 -2.4 1.7 -2.4 -1.7 -2.4 1.7 z" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.3"/><circle cx="9.9" cy="11" r="1.1" fill="currentColor"/><circle cx="14.1" cy="11" r="1.1" fill="currentColor"/>',
  clock:
    '<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity="0.1" stroke="currentColor" stroke-width="1.3"/><path d="M12 7 V12 L15.5 14" stroke="currentColor" stroke-width="1.5"/><g stroke="currentColor" stroke-width="1" opacity="0.5"><path d="M12 4.6 V5.9"/><path d="M19.4 12 H18.1"/><path d="M12 19.4 V18.1"/><path d="M4.6 12 H5.9"/></g><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  pierce:
    '<rect x="10.4" y="4" width="3.2" height="16" rx="1" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.2" opacity="0.6"/><path d="M3 12 H19" stroke="currentColor" stroke-width="2"/><path d="M21 12 L15.4 8.4 L15.4 15.6 Z" fill="currentColor" fill-opacity="0.9" stroke="currentColor" stroke-width="1.1"/>',
  siphon:
    '<path d="M12 3.5 C12 3.5 6.5 11 6.5 15.2 a5.5 5.5 0 0 0 11 0 C17.5 11 12 3.5 12 3.5 Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.3"/><path d="M12 9 V15" stroke="currentColor" stroke-width="1.3" opacity="0.7"/><path d="M9.6 12.6 L12 15 L14.4 12.6" stroke="currentColor" stroke-width="1.3" opacity="0.7"/>',
  window:
    '<path d="M9 5 H5.5 V19 H9" stroke="currentColor" stroke-width="1.6"/><path d="M15 5 H18.5 V19 H15" stroke="currentColor" stroke-width="1.6"/><path d="M12 8 V16" stroke="currentColor" stroke-width="1.6" opacity="0.7"/><circle cx="5.5" cy="5" r="1.1" fill="currentColor"/><circle cx="18.5" cy="5" r="1.1" fill="currentColor"/><circle cx="5.5" cy="19" r="1.1" fill="currentColor"/><circle cx="18.5" cy="19" r="1.1" fill="currentColor"/>',
  nova:
    '<defs><radialGradient id="__ID__-c" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="currentColor" stop-opacity="1"/><stop offset="1" stop-color="currentColor" stop-opacity="0.25"/></radialGradient><radialGradient id="__ID__-a" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="currentColor" stop-opacity="0.42"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs><circle cx="12" cy="12" r="11" fill="url(#__ID__-a)"/><g fill="currentColor"><path d="M12 0.5 L13.3 9 H10.7 Z"/><path d="M12 23.5 L10.7 15 H13.3 Z"/><path d="M0.5 12 L9 10.7 V13.3 Z"/><path d="M23.5 12 L15 13.3 V10.7 Z"/></g><g fill="currentColor" opacity="0.65"><path d="M4 4 L9.6 9 L8 10.6 Z"/><path d="M20 4 L14.4 9 L16 10.6 Z"/><path d="M4 20 L9.6 15 L8 13.4 Z"/><path d="M20 20 L14.4 15 L16 13.4 Z"/></g><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="0.7" opacity="0.3"/><circle cx="12" cy="12" r="4.6" fill="url(#__ID__-c)" stroke="currentColor" stroke-width="1" stroke-opacity="0.85"/><circle cx="10.5" cy="10.5" r="1.2" fill="currentColor" opacity="0.7"/>',
  reflect:
    '<path d="M12 3.5 L19 6.5 V11.5 c0 4.6 -3 7.6 -7 9.5 c-4 -1.9 -7 -4.9 -7 -9.5 V6.5 Z" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.3"/><path d="M8.5 12.6 L12 9 L15.5 12.6" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 16 L12 12.4 L15.5 16" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>',
  gem:
    '<defs><radialGradient id="__ID__-a" cx="0.5" cy="0.4" r="0.6"><stop offset="0" stop-color="currentColor" stop-opacity="0.4"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs><circle cx="12" cy="11" r="10" fill="url(#__ID__-a)"/><path d="M8.2 9.5 L12 3.5 L15.8 9.5 Z" fill="currentColor" fill-opacity="0.3"/><path d="M4.5 9.5 L8.2 9.5 L12 3.5 Z" fill="currentColor" fill-opacity="0.12"/><path d="M15.8 9.5 L19.5 9.5 L12 3.5 Z" fill="currentColor" fill-opacity="0.12"/><path d="M4.5 9.5 L8.2 9.5 L12 20.5 Z" fill="currentColor" fill-opacity="0.18"/><path d="M8.2 9.5 L15.8 9.5 L12 20.5 Z" fill="currentColor" fill-opacity="0.32"/><path d="M15.8 9.5 L19.5 9.5 L12 20.5 Z" fill="currentColor" fill-opacity="0.1"/><path d="M12 3.5 L19.5 9.5 L12 20.5 L4.5 9.5 Z" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 9.5 H19.5" stroke="currentColor" stroke-width="0.8" opacity="0.55"/><path d="M9.6 5.6 L11 5.1 L10.4 7 Z" fill="currentColor" opacity="0.55"/><path d="M12 1.4 L12.5 3 L14.1 3.5 L12.5 4 L12 5.6 L11.5 4 L9.9 3.5 L11.5 3 Z" fill="currentColor" opacity="0.75"/>',

  // ── evolutions (7) — heavier / "amped" reads of their base perk ──
  impaler:
    '<path d="M4 20 L16.5 7.5" stroke="currentColor" stroke-width="2.2"/><path d="M20 4 L12.4 5 L19 11.6 Z" fill="currentColor" fill-opacity="0.9" stroke="currentColor" stroke-width="1.2"/><path d="M8 16 L10.6 13.4 M11.6 12.4 L14.2 9.8" stroke="currentColor" stroke-width="1.6" opacity="0.7"/><circle cx="4" cy="20" r="1.5" fill="currentColor" opacity="0.7"/>',
  supernova:
    '<circle cx="12" cy="12" r="3.2" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.1" opacity="0.4"/><g stroke="currentColor" stroke-width="1.5"><path d="M12 1.5 V5"/><path d="M12 19 V22.5"/><path d="M1.5 12 H5"/><path d="M19 12 H22.5"/></g><g stroke="currentColor" stroke-width="1.2" opacity="0.6"><path d="M4.8 4.8 L7.1 7.1"/><path d="M19.2 4.8 L16.9 7.1"/><path d="M4.8 19.2 L7.1 16.9"/><path d="M19.2 19.2 L16.9 16.9"/></g><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  perpetual:
    '<path d="M6.4 12 a5.6 5.6 0 1 1 1.7 4" stroke="currentColor" stroke-width="1.6"/><path d="M8.7 11.3 L8 15.8 L4 14.3 Z" fill="currentColor" fill-opacity="0.9" stroke="currentColor" stroke-width="1"/><circle cx="12" cy="12" r="2.1" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.2"/>',
  wraith:
    '<path d="M6 20 V10 a6 6 0 0 1 12 0 V20 l-2.4 -2.3 -2.4 2.3 -2.4 -2.3 -2.4 2.3 z" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.3"/><path d="M9.1 9.4 a3 3 0 0 1 5.8 0" stroke="currentColor" stroke-width="1" opacity="0.4"/><path d="M8.6 11 L11 12 M15.4 11 L13 12" stroke="currentColor" stroke-width="1.3" opacity="0.85"/><circle cx="9.9" cy="11.4" r="0.8" fill="currentColor"/><circle cx="14.1" cy="11.4" r="0.8" fill="currentColor"/>',
  inferno:
    '<path d="M12 3 c3 4 1 6.2 2.6 8.2 c0.9 -0.9 1.3 -2.4 1.3 -2.4 c1.7 2.5 1.1 5.4 -1 7.4 a5.2 5.2 0 0 1 -6.2 0 c-2.5 -2.5 -1.7 -5.8 0 -7.8 c0.9 0.9 1.4 1.9 1.4 1.9 C12 8.6 9 6 12 3 Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.3"/><path d="M12 10 c1.6 1.8 0.5 3.4 1.3 4.8 a3 3 0 0 1 -2.6 0 c-0.9 -1.5 -0.1 -3.2 1.3 -4.8 Z" fill="currentColor" fill-opacity="0.55"/>',
  juggernaut:
    '<path d="M12 3 L20 6 V12 c0 5 -3.6 8 -8 10 c-4.4 -2 -8 -5 -8 -10 V6 Z" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.4"/><path d="M12 4.5 V19.5 M5 9.5 H19" stroke="currentColor" stroke-width="1.2" opacity="0.6"/><circle cx="8" cy="8" r="0.9" fill="currentColor" opacity="0.7"/><circle cx="16" cy="8" r="0.9" fill="currentColor" opacity="0.7"/>',
  aegis:
    '<path d="M12 3 L19 6 V11 c0 5 -3 8 -7 10 c-4 -2 -7 -5 -7 -10 V6 Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.4"/><path d="M8.5 12 L11 14.6 L15.5 9.3" stroke="currentColor" stroke-width="1.7"/>',

  // ── mid-run events (5) — the RunEventId IS the icon key (header glyphs) ──
  shrine:
    '<path d="M6 20 H18" stroke="currentColor" stroke-width="1.4"/><path d="M8 20 V11 a4 4 0 0 1 8 0 V20" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-width="1.3"/><circle cx="12" cy="6" r="2" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="1.2"/><g stroke="currentColor" stroke-width="1" opacity="0.6"><path d="M12 2 V3.4"/><path d="M8.2 6 H9.4"/><path d="M15.8 6 H14.6"/></g>',
  gamble:
    '<rect x="4.5" y="4.5" width="15" height="15" rx="3" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-width="1.3"/><circle cx="8.6" cy="8.6" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="15.4" cy="15.4" r="1.3" fill="currentColor"/><circle cx="15.4" cy="8.6" r="1.3" fill="currentColor" opacity="0.55"/><circle cx="8.6" cy="15.4" r="1.3" fill="currentColor" opacity="0.55"/>',
  treasure:
    '<path d="M4 9.5 L6.5 6 H17.5 L20 9.5 Z" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.3"/><rect x="4.5" y="9.5" width="15" height="8.5" rx="1" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 13 H19.5" stroke="currentColor" stroke-width="1.2" opacity="0.6"/><rect x="10.8" y="11.6" width="2.4" height="3.4" rx="0.6" fill="currentColor" fill-opacity="0.9"/><circle cx="9" cy="4.4" r="0.9" fill="currentColor" opacity="0.7"/><circle cx="15" cy="3.9" r="0.8" fill="currentColor" opacity="0.55"/>',
  eliteWave:
    '<path d="M5 17 L4 7.5 L8.5 11 L12 5.5 L15.5 11 L20 7.5 L19 17 Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.3"/><path d="M5 17.6 H19" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="9.6" r="1.1" fill="currentColor"/><circle cx="7" cy="13" r="0.9" fill="currentColor" opacity="0.7"/><circle cx="17" cy="13" r="0.9" fill="currentColor" opacity="0.7"/>',
  cursedBargain:
    '<path d="M12 3.5 a7.5 7.5 0 0 1 7.5 7.5 c0 2.8 -1.7 4.4 -2.1 6.2 H6.6 c-0.4 -1.8 -2.1 -3.4 -2.1 -6.2 a7.5 7.5 0 0 1 7.5 -7.5 Z" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.3"/><circle cx="9.3" cy="11" r="1.7" fill="currentColor" fill-opacity="0.85"/><circle cx="14.7" cy="11" r="1.7" fill="currentColor" fill-opacity="0.85"/><path d="M12 13.4 L11 16 M12 13.4 L13 16" stroke="currentColor" stroke-width="1" opacity="0.6"/><g stroke="currentColor" stroke-width="1.1"><path d="M9.6 17.6 V20"/><path d="M12 17.9 V20.3"/><path d="M14.4 17.6 V20"/></g>',
};

const WRAP =
  '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

/** Full inline-SVG markup for a glyph key. Unknown keys fall back to the spear so a card never
 *  renders blank/crashes. Tint via CSS `color` / the --accent var (every element uses currentColor
 *  — including gradient stops — so the body shades from bright to faint in the card's accent).
 *  The `__ID__` token is replaced with the key so each icon's <defs> gradient/filter ids are
 *  unique on the page (a 3-card draft renders 3 icons at once → ids must not collide). */
export function icon(key: IconKey): string {
  const g = (GLYPHS[key] ?? GLYPHS.lance).split('__ID__').join(key);
  return `${WRAP}${g}</svg>`;
}

/** Runtime list of every icon key (for tooling/tests; coverage is also enforced by the Record). */
export const ICON_KEYS = Object.keys(GLYPHS) as IconKey[];
