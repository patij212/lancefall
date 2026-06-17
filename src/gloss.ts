// PERFECT_10_SPEC §1.7 — first-appearance JARGON GLOSSES. The struggling/new player
// meets COHERENCE / ARMOR / DAYBREAK(OVERDRIVE) / graze / fusion with no manual; §0's
// thesis is "jargon fired at you with no sandbox." The static HUD `title=` hovers are a
// desktop-only reference; this is the teaching layer: the FIRST time a concept actually
// happens in play, a one-line gloss surfaces (and works on touch, where there is no hover).
//
// This module is the PURE core — the gloss copy + the per-frame trigger conditions, with
// ZERO DOM and ZERO persistence. ui.ts owns the callout + the once-ever queue; save.ts
// owns the persisted `glossSeen` set. Keeping the logic here makes it unit-testable.

/** The five glossed terms (matches the spec list). Stable ids — they key `glossSeen`. */
export type GlossId = 'graze' | 'overdrive' | 'armor' | 'coherence' | 'fusion';

/** All glossable ids — the persisted-set whitelist (save sanitizer) + test coverage.
 *  Kept as a plain literal (no GLOSSES import) so migrate.ts stays copy-free. */
export const GLOSS_IDS: GlossId[] = ['graze', 'overdrive', 'armor', 'coherence', 'fusion'];

export interface GlossDef {
  /** the short uppercase term shown as the callout's label */
  term: string;
  /** one line, plain language — what it is + why the player should care */
  text: string;
  /** the term's accent colour (rim + label tint), echoing its HUD element */
  accent: string;
}

export const GLOSSES: Record<GlossId, GlossDef> = {
  graze: {
    term: 'GRAZE',
    text: 'Near miss! Skimming a bullet without being hit refills stamina — flirt with danger to dash more often.',
    accent: '#3df0ff',
  },
  overdrive: {
    term: 'DAYBREAK',
    text: 'Your ultimate is charged. Press F (or gamepad LB) to slow time and clear the screen with light.',
    accent: '#ffcf6b',
  },
  armor: {
    term: 'ARMOR',
    text: 'Each shield pip soaks one lethal hit before LAST BREATH — and one pip regenerates every boss clear.',
    accent: '#6bb8ff',
  },
  coherence: {
    term: 'COHERENCE',
    text: 'Chain kills and dash on the beat to light the City of Lancefall — brighter world, fuller sound.',
    accent: '#7dffa8',
  },
  fusion: {
    term: 'FUSION',
    text: 'Stacking the right perks unlocks a FUSION — a build-defining evolution. Watch the recipe tags.',
    accent: '#c89bff',
  },
};

/** COHERENCE has to actually CLIMB before its gloss reads — fire once it has built past
 *  this fraction (it sits near 0 at run start, so a low value would teach with nothing on
 *  screen). Exported so the test pins the threshold. */
export const GLOSS_COH_THRESHOLD = 0.4;

/** The minimal slice of World the in-combat triggers read (World is structurally assignable,
 *  so ui.ts passes `world` straight through; the test builds a tiny literal). */
export interface GlossWorldView {
  grazeCount: number;
  overdrive: { meter: number; cooldown: number };
  player: { maxShields: number };
}

/** Which in-combat first-appearance glosses' trigger CONDITION holds this frame, in display
 *  priority order. PURE: it does not consult what's already been seen — the caller filters
 *  against the persisted `glossSeen` set and shows each at most once, ever. ('fusion' is not
 *  here: it fires from the draft when an EVOLUTION card is first offered, not per-frame.) */
export function glossTriggers(w: GlossWorldView, coherence: number): GlossId[] {
  const out: GlossId[] = [];
  if (w.grazeCount > 0) out.push('graze');
  if (w.overdrive.meter >= 1 && w.overdrive.cooldown <= 0) out.push('overdrive');
  if (w.player.maxShields > 0) out.push('armor');
  if (coherence >= GLOSS_COH_THRESHOLD) out.push('coherence');
  return out;
}
