// src/dossiers.ts — THE DOSSIER WEB. Each of the Six has a dossier that synthesises from how many
// of that figure's key-word mentions are decrypted across all transmissions. PURE + derived.
// Voice: elegiac, second person where it fits — matching narrator.ts and lore.ts. Each dossier
// is three escalating intelligence-file lines: rumour → record → full damning truth.
import type { SaveData } from './save';
import type { EnemyKind } from './types';
import { INTERCEPTS, wordKey, isWordDecrypted, masterProgress } from './intercepts';

export const DOSSIER_FIGURES: EnemyKind[] = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'];

// The decryptable word(s) that name each figure (lowercased keys). The dossier reveals as these
// occurrences are decrypted across the transmissions.
const FIGURE_WORDS: Partial<Record<EnemyKind, string[]>> = {
  warden:      ['warden'],
  weaver:      ['weaver'],
  beacon:      ['beacon'],
  mirrorblade: ['mirrorblade'],
  hollow:      ['hollow', 'hollowed'],
  sovereign:   ['sovereign', 'crown'],
};

// 3 authored dossier lines per figure, unlocked at >0, ≥2/3, and =1 of their decrypted mentions.
// Voice: a deepening intelligence file — each line a sentence or two. Elegiac, sparse, exact.
const DOSSIER_LINES: Partial<Record<EnemyKind, [string, string, string]>> = {
  warden: [
    // Line 1 — rumour / first trace (unlocks on any warden mention decrypted)
    `A soldier who never missed a watch. Early transmissions record him as the gate's steadiest keeper — forty years without a breach, a lock always turned from the outside.`,
    // Line 2 — record / pattern (unlocks at >= 2/3 of warden mentions decrypted)
    `In the final week, his log entries grow irregular. The cipher that seals the first gate is not an enemy's work. The hand that set it matches his precisely — the same grip, the same sequence, turned from the inside.`,
    // Line 3 — full damning truth (unlocks when all warden mentions decrypted)
    `He did not betray from malice. He believed the city was already lost and sealed the gate to spare those inside a longer suffering. The road that should have carried the last evacuation was his lock. He was the first cause, and he never knew it ended everything.`,
  ],
  weaver: [
    // Line 1 — rumour
    `The Weaver held the kingdom's memory — every name, every promise, every debt. In the early transmissions she is praised for this: the city's perfect recall, the one who wrote the light into code.`,
    // Line 2 — record / pattern
    `When fear arrived, she enciphered the records that hurt most — the ones that named what the city was worth dying for. She called it a kindness. The transmissions she scrambled were the ones that would have rallied the survivors.`,
    // Line 3 — full damning truth
    `She believed that if the people could not read why the city mattered, they would not mourn its loss so sharply. She was wrong. They could not fight for what they could not remember, and the grey she wrote over the light is the same grey that erased Lancefall. Every glyph you unscramble undoes a kindness that was cruelty.`,
  ],
  beacon: [
    // Line 1 — rumour
    `One duty: turn the light when the ships beyond the dark needed the signal. The Beacon is mentioned only in passing in early records — a post so routine that no one thought to monitor it.`,
    // Line 2 — record / pattern
    `On the last night, the signal stayed cold. Intercepts from three different transmissions note the silence, each writer assuming the light would turn in time. None of them knew it already had not.`,
    // Line 3 — full damning truth
    `He told himself the danger would pass. It was not cowardice; it was the ordinary failure of a person who always had another moment to act. The rescue fleet waited at the dark water for a signal that never came. The key he carried to the ships died with him unturned, and the fall is partly a list of every arrival that never happened.`,
  ],
  mirrorblade: [
    // Line 1 — rumour
    `First accounts treat it as an enemy weapon — a blade that mimics its target. Some transmissions refuse to name it directly, as if naming it completes the imitation.`,
    // Line 2 — record / pattern
    `Deeper analysis shows it is not a weapon from outside the city. It is a shape the city's own fear learned to take — the doubt that you are fighting for something already gone, made solid, given your own colour and your own speed.`,
    // Line 3 — full damning truth
    `The Mirrorblade is not one of the Six. It has no history, no gate it left unlocked, no record entry. It is what remains when a person almost stops meaning what they are doing. You beat it by being the one that means it — every stroke a proof the city is worth the cost. The moment you hesitate in earnest is the moment it is faster.`,
  ],
  hollow: [
    // Line 1 — rumour
    `The last transmission from the inner district mentions someone who refused the final evacuation. No name given. Only a note that a figure remained behind when the gates closed, and that no one went back.`,
    // Line 2 — record / pattern
    `Grief is the record here. Every mention of the Hollow in the transmissions is a mention of what it once was before grief took everything that held a shape. The key to what it was flickers still, at the moment the mourning briefly forgets itself.`,
    // Line 3 — full damning truth
    `It could not leave because leaving would have meant the city was gone. It is still inside, holding the line for a fall that already happened. Its true self surfaces for only an instant — the pause in the grief where the person before shows through. Strike then. It is the last mercy this city has left to offer.`,
  ],
  sovereign: [
    // Line 1 — rumour
    `The crown that held the master key. Early transmissions speak of the Sovereign with the formal distance of someone everyone assumed would act when it mattered, and so no one else did.`,
    // Line 2 — record / pattern
    `There was always one moment — the transmissions agree on this — when a single turn of the key would have held the line. The Sovereign is named in every such account, and in every account the key remains unturned. The crown was kept. The cipher was not broken.`,
    // Line 3 — full damning truth
    `It enciphered the kingdom rather than fight for it, and now it warps the ground itself to stop you reading the last record. The master cipher is its final act of authority — control over the history that proves it failed. To read the last transmission is to prove the moment was real: that there was always a way through, and the choice not to take it was a choice. The crown it kept weighs nothing now. The key was everything.`,
  ],
};

/** Every token occurrence (across all transmissions) whose word key is one of the figure's words. */
function figureOccurrences(kind: EnemyKind): string[] {
  const words = new Set(FIGURE_WORDS[kind] ?? []);
  const out: string[] = [];
  for (const ic of INTERCEPTS) {
    for (const t of ic.tokens) {
      const w = wordKey(t);
      if (words.has(w)) out.push(w);
    }
  }
  return out;
}

export function figureDossier(
  save: SaveData,
  kind: EnemyKind,
): { revealed: number; total: number; frac: number; lines: string[] } {
  const occ = figureOccurrences(kind);
  const total = occ.length;
  const revealed = occ.filter((w) => isWordDecrypted(save, w)).length;
  const frac = total ? revealed / total : 0;
  const lines = DOSSIER_LINES[kind] ?? ['', '', ''];
  const shown: string[] = [];
  if (frac > 0) shown.push(lines[0]);
  if (frac >= 2 / 3) shown.push(lines[1]);
  if (frac >= 1) shown.push(lines[2]);
  return { revealed, total, frac, lines: shown };
}

/** A figure-citizen's `deeper` unlocks when its figure's dossier is complete; figure-less citizens
 *  unlock `deeper` at 100% master cipher. */
export function citizenDeeperUnlocked(save: SaveData, c: { figure?: EnemyKind }): boolean {
  if (c.figure) return figureDossier(save, c.figure).frac >= 1;
  return INTERCEPTS.length > 0 && masterProgress(save).frac >= 1;
}
