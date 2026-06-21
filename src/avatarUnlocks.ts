// Avatar unlock derivation — the integration track the avatar registry references. PURE: maps
// each avatar's earn-condition to live SaveData (no sim/rng). The 8 free sigils are always yours;
// the rest are earned through play. Best-effort + slightly generous where a hint is fuzzy — a
// cosmetic should under-lock rather than wrongly hide a sigil the player has plausibly earned.
import type { SaveData } from './save';
import { AVATAR_IDS } from './render/avatars';
import { vocabulary } from './intercepts';

/** The 8 tier-1 "sigil set" avatars — granted from the first run. */
const FREE: readonly string[] = ['lance', 'ring', 'beat', 'fall', 'graze', 'comet', 'skyline', 'chevron'];

function felled(save: SaveData, kind: string): boolean {
  return (save.killsByKind?.[kind] ?? 0) > 0;
}

/** The set of avatar ids the player has unlocked, derived from their save. Always includes the
 *  free sigils. Pure + total — only ever returns ids that exist in the registry. */
export function unlockedAvatarIds(save: SaveData): Set<string> {
  const out = new Set<string>(FREE);

  // ── boss crests — fell that boss (the Sovereign's crest also yields to THE CHOICE) ──
  for (const k of ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow']) if (felled(save, k)) out.add(k);
  const choiceMade = save.stillpointChoice === 'catch' || save.stillpointChoice === 'fall';
  if (felled(save, 'sovereign') || felled(save, 'sovereign_core') || choiceMade) out.add('sovereign');

  // ── cipher — the city remembering itself (decryption) + the Stillpoint + the Vigil ──
  const total = vocabulary().length || 1;
  const decrypted = save.decryptedWords?.length ?? 0;
  if (decrypted / total >= 0.25) out.add('codebreaker'); // "Decrypt a quarter of the city"
  if (decrypted >= total) out.add('remember'); // "Decrypt every word"
  if (choiceMade) out.add('choice'); // "Reach the Stillpoint"
  if ((save.vigilSince ?? -1) >= 0) out.add('vigil'); // "Keep the Vigil" (holding the light)

  // ── pilot — feats of play ──
  if ((save.maxHeat ?? 0) >= 5) out.add('heat'); // "Survive Heat 5"
  const flawless =
    (save.achievements?.includes('flawlessgauntlet') ?? false) ||
    (save.achievements?.includes('flawlesskey') ?? false) ||
    (save.lastRuns?.some((r) => r.won && r.hitsTaken === 0) ?? false);
  if (flawless) out.add('untouched'); // "Clear a run flawless"
  if (save.lifeDaybreaks >= 50) out.add('daybreak'); // "Trigger 50 Overdrives"
  if (save.lifeLastBreath >= 25) out.add('lastbreath'); // "Survive 25 Last Breaths"
  if ((save.winsByMode?.longestday ?? 0) > 0) out.add('solstice'); // "Win THE LONGEST DAY"
  const allSix = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'].every((k) => out.has(k));
  if (save.ngPlusLevel > 0 || allSix) out.add('eternal'); // "Begin again — or fell all six"

  // safety: never surface an id the registry doesn't know
  const valid = new Set(AVATAR_IDS);
  for (const id of [...out]) if (!valid.has(id)) out.delete(id);
  return out;
}

/** Whether a single avatar id is unlocked for this save. */
export function isAvatarUnlocked(id: string, save: SaveData): boolean {
  return unlockedAvatarIds(save).has(id);
}
