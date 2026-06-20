// src/cityCoherence.ts — THE CITY COHERENCE meter, made REAL. A pure, save-derived measure of how
// much of Lancefall the player has brought back. DECRYPTION-LED (the literal "the city remembering"
// metaphor) so the title bar, the cockpit backdrop (cockpitCipher.ts, which already reads the
// master-cipher decrypt fraction), and THE BOMBE master meter finally all tell the SAME truth.
//
// PURE: no rng, no DOM, no sim, no Date.now/Math.random — a deterministic read of persistent state.
import type { SaveData } from './save';
import { masterProgress } from './intercepts';
import { LORE } from './lore';
import { ACHIEVEMENTS } from './achievements';

export interface CityCoherence {
  /** restoration fraction, clamped to 0..1 */
  frac: number;
  /** Math.round(frac * 100) — the headline number */
  pct: number;
  /** the band tagline (carries the level in words, never by hue alone) */
  tagline: string;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

// Tunable weights — decryption leads (the city literally remembering), lore + achievements give it
// breadth, the arc rewards the once-only milestones. They sum to 1 so a fully-restored save = 100%.
const W_DECRYPT = 0.55;
const W_LORE = 0.2;
const W_ACH = 0.15;
const W_ARC = 0.1;

/** The tagline for a coherence fraction, by band. 0 = grey sleep, 1 = THE LONGEST DAY. The level is
 *  carried by the words (+ the %), not by colour — colourblind-safe. Pure. */
export function cityCoherenceTagline(frac: number): string {
  if (frac >= 1) return 'THE LONGEST DAY · THE CITY IS WHOLE';
  if (frac <= 0) return 'THE CITY SLEEPS IN GREY';
  if (frac < 0.34) return 'A FEW LIGHTS REMEMBER';
  if (frac < 0.67) return 'NEON BLOOMS AS THE CITY REMEMBERS';
  return 'THE CITY IS ALMOST WHOLE';
}

/** How whole the city is, derived purely from persistent save state. Monotonic in every input
 *  (more decrypted words / lore / achievements / arc milestones → higher) and bounded to [0,1]. */
export function cityCoherence(save: SaveData): CityCoherence {
  const decrypt = masterProgress(save).frac; // the city remembering itself — the leading metaphor
  const lore = LORE.length ? save.stillpointLore.length / LORE.length : 0;
  const ach = ACHIEVEMENTS.length ? save.achievements.length / ACHIEVEMENTS.length : 0;
  const arc =
    ((save.lifeBoss > 0 ? 1 : 0) +
      (save.stillpointChoice !== 'none' ? 1 : 0) +
      (save.lifeWins > 0 ? 1 : 0)) /
    3;
  const frac = clamp01(
    W_DECRYPT * clamp01(decrypt) +
      W_LORE * clamp01(lore) +
      W_ACH * clamp01(ach) +
      W_ARC * clamp01(arc),
  );
  return { frac, pct: Math.round(frac * 100), tagline: cityCoherenceTagline(frac) };
}
