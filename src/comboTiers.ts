// Pure combo-tier milestone table + selector. The arcade announcements
// ("RAMPAGE", "FRENZY", …) that fire when the combo crosses a new threshold.
//
// Cut points single-sourced from COHERENCE.tierCombo (tune.ts) so the on-screen
// milestones and the audio root-transpose tiers can never drift apart.
//
// This is the PURE half of the milestone logic — picking WHICH tier was newly
// crossed. The side-effecting glue (announce / narrate / shake / flash / audio,
// and latching lastTierAnnounced) stays with the caller in game.ts.

import { COHERENCE } from './tune';

export interface ComboTier {
  /** combo threshold at which this tier announces */
  at: number;
  /** arcade name shown on the callout */
  name: string;
  /** announcement color */
  color: string;
}

/** Combo milestones → arcade announcements, ordered low → high. */
export const COMBO_TIERS: ComboTier[] = [
  { at: COHERENCE.tierCombo[0], name: 'RAMPAGE', color: '#34d399' },
  { at: COHERENCE.tierCombo[1], name: 'FRENZY', color: '#fbbf24' },
  { at: COHERENCE.tierCombo[2], name: 'CARNAGE', color: '#fb923c' },
  { at: COHERENCE.tierCombo[3], name: 'UNSTOPPABLE', color: '#ec4899' },
  { at: COHERENCE.tierCombo[4], name: 'GODLIKE', color: '#a855f7' },
  { at: COHERENCE.tierCombo[5], name: 'LEGENDARY', color: '#ef4444' },
];

/**
 * Return the combo tier that is newly crossed for the given combo, or null if
 * none. Scans high → low and returns the FIRST (highest) tier whose threshold
 * is reached AND is strictly above the last-announced threshold — so a single
 * step that vaults past several tiers announces only the top one, and a tier is
 * never re-announced within the same chain.
 *
 * Pure: the caller is responsible for latching lastTierAnnounced to `tier.at`.
 */
export function crossedComboTier(combo: number, lastTierAnnounced: number): ComboTier | null {
  for (let i = COMBO_TIERS.length - 1; i >= 0; i--) {
    const t = COMBO_TIERS[i];
    if (combo >= t.at && t.at > lastTierAnnounced) return t;
  }
  return null;
}
