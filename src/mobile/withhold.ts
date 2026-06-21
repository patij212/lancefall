// The single source of truth for "may this run post to the online board?". Extracted so the
// strong-assist withhold (and the existing challenge / cipher-off rules) are unit-tested.
export function boardEligible(
  modeRanked: boolean,
  inChallenge: boolean,
  cipherOffBossRush: boolean,
  usedStrongAssist: boolean,
): boolean {
  if (inChallenge) return false;
  if (!modeRanked) return false;
  if (cipherOffBossRush) return false;
  if (usedStrongAssist) return false; // strong aim-assist runs are off-board (fairness)
  return true;
}
