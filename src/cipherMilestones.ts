// src/cipherMilestones.ts — 25/50/75% decryption milestone beats. PURE + save-side; idempotent via
// dedup'd synthetic Fragment ids (no new save field). 100% is handled by grantLongestDayRewards.
import type { SaveData } from './save';
import { masterProgress } from './intercepts';

export const CIPHER_MILESTONES = [0.25, 0.5, 0.75] as const;
export const MILESTONE_FRAGMENTS = 3;

export function grantCipherMilestones(save: SaveData): { tier: number; fragments: number }[] {
  const frac = masterProgress(save).frac;
  const out: { tier: number; fragments: number }[] = [];
  for (const tier of CIPHER_MILESTONES) {
    if (frac < tier) continue;
    const tag = `cipher-milestone:${Math.round(tier * 100)}`;
    if (save.stillpointFragments.some((f) => f.startsWith(tag))) continue; // already granted
    for (let i = 0; i < MILESTONE_FRAGMENTS; i++) save.stillpointFragments.push(`${tag}#${i}`);
    out.push({ tier, fragments: MILESTONE_FRAGMENTS });
  }
  return out;
}
