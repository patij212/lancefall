// src/ending.ts — THE LAST WORD. The single source of truth for THE CHOICE, the ending, the Vigil,
// and the Sixth. PURE: no DOM, no ctx, and (determinism invariant) NO './rng' import. Reads save
// state and citizen/intercept data only. Absorbs the choice copy that was split across
// stillpoint.choiceEnding + intercepts.CHOICE_TAIL so the most important words in the game live in
// ONE place (story-bible "single source of truth" mandate).
import type { SaveData } from './save';

export type Choice = 'catch' | 'fall' | 'none';

// ── THE CHOICE — the Sovereign-kill ending. Heads are test-asserted; keep them verbatim. ──
export interface ChoiceEnding { head: string; line: string; }
export function choiceEnding(choice: Choice): ChoiceEnding {
  if (choice === 'fall')
    return { head: 'THE LIGHT RELEASED', line: 'You let it go. The day completes, the dark comes gently, and it is finally, mercifully over.' };
  if (choice === 'catch')
    return { head: 'THE LIGHT HOLDS', line: 'You held it. The longest day stands, and the city wakes — and stays awake, in your keeping.' };
  return { head: 'THE LIGHT HOLDS', line: 'Lancefall remembers itself.' };
}

// ── THE LAST CIPHER tail — the console epilogue under "What Remains" (moved here from intercepts). ──
export const CHOICE_TAIL: Record<'catch' | 'fall', string> = {
  catch: 'And the last word, you did not decode — you held it. The light stays. The longest day does not end.',
  fall: 'And the last word, you did not decode — you let it go. The light is released, and the dark comes gently, and it is over.',
};
export function choiceTail(save: SaveData): string | null {
  return save.stillpointChoice === 'catch' || save.stillpointChoice === 'fall' ? CHOICE_TAIL[save.stillpointChoice] : null;
}

// ── THE LAST WORD — the single token at the foot of "What Remains" that is never bought, only
// chosen. Display-only: deliberately NOT part of intercepts.vocabulary(), so masterProgress()/the
// 265-word pin and all seeded determinism are untouched (same discipline as CHOICE_TAIL). The Bombe
// (the machine) breaks every cipher and then HALTS here — the halting problem, made literal. ──
export const LAST_WORD_PLACEHOLDER = 'CHOSEN'; // the grey, un-buyable glyph shown while 'none'
export const LAST_WORD_CAPTION = 'This word is not bought. It is chosen — on the longest day.';
export const LONGEST_DAY_REFRAME =
  'The machine is finished. Every cipher is broken. One word remains — and it was never the machine\'s to read. No machine decides it. It waits for the longest day.';
export function lastWordResolved(save: SaveData): string | null {
  if (save.stillpointChoice === 'catch') return 'HELD';
  if (save.stillpointChoice === 'fall') return 'RELEASED';
  return null;
}

// ── THE SIXTH — "everyone is the sixth." Never gated: the thesis fires for everyone at the choice;
// it names the citizens you woke (the faces); the unwoken are a gentle pull, not a punishment; 100%
// decryption unlocks the deepest line. The accretion (one confession per woken citizen) is read in
// THE FALL tab as it assembles across play. ──
import { wokenCitizens, type Citizen } from './citizens';
import { isLongestDay } from './intercepts';

export const SIXTH_THESIS =
  'There were never six. There were a hundred thousand — every citizen who believed someone else was holding the line. The Six is a number we gave the guilt so it had somewhere to sit.';
export const SIXTH_UNWOKEN_PULL = 'And the rest are still grey. Their faces are here too, waiting to be remembered.';
export const SIXTH_DEEPEST = 'And the last face — the one that woke them all, that came back down to own the fall — is yours.';

export interface SixthReveal {
  thesis: string;
  faces: { name: string; line: string }[]; // one per woken citizen — their confession
  unwokenPull: string | null;              // present iff some citizens are still asleep
  deepest: string | null;                  // present iff 100% decryption (remembered everything)
}
export function sixthReveal(save: SaveData): SixthReveal {
  const woken = wokenCitizens(save);
  const faces = woken.map((c: Citizen) => ({ name: c.name, line: c.confession }));
  return {
    thesis: SIXTH_THESIS,
    faces,
    unwokenPull: faces.length < 16 ? SIXTH_UNWOKEN_PULL : null,
    deepest: isLongestDay(save) ? SIXTH_DEEPEST : null,
  };
}

// ── THE VIGIL — holding the light (catch) is the existing ASCEND/NG+ loop; this is its narrative
// arc over runs held. daysHeld derives from a one-time stamp (vigilSince = totalRuns at catch) so
// nothing mutable can desync. defiance (1–3) → wistful (4–10) → permission (11+, the release is
// offered as permission, never failure). ──
export type VigilStage = 'defiance' | 'wistful' | 'permission';
export const VIGIL_PERMISSION_THRESHOLD = 11;

const VIGIL_LINES: Record<VigilStage, string[]> = {
  defiance: ['You are holding the longest day. Hold.', 'The light has not dimmed. You will not let it.'],
  wistful: ['The day still has not turned.', 'You have held the light a long while now.', 'The city is awake, and does not tire. You might.'],
  permission: [
    'You have held the light a long time. You may let it turn now. No one will call it failure.',
    'The longest day can end whenever you choose. Letting go is not losing.',
  ],
};

export function daysHeld(save: SaveData): number {
  if (save.stillpointChoice !== 'catch' || save.vigilSince < 0) return 0;
  return Math.max(0, save.totalRuns - save.vigilSince);
}
export function vigilStage(days: number): VigilStage {
  if (days >= VIGIL_PERMISSION_THRESHOLD) return 'permission';
  if (days >= 4) return 'wistful';
  return 'defiance';
}
/** A vigil beat for the title / run-start / debrief. Null when not holding (or after release).
 *  Deterministic line pick by daysHeld (no rng — invariant). */
export function vigilBeat(save: SaveData): { stage: VigilStage; line: string } | null {
  if (save.stillpointChoice !== 'catch' || save.released) return null;
  const d = daysHeld(save);
  const stage = vigilStage(d);
  const pool = VIGIL_LINES[stage];
  return { stage, line: pool[d % pool.length] };
}
export function canRelease(save: SaveData): boolean {
  return save.stillpointChoice === 'catch' && !save.released && daysHeld(save) >= VIGIL_PERMISSION_THRESHOLD;
}

// Spoken by the dying Sovereign as THE CHOICE opens — the rhyme with its own crime ("I kept the
// crown"). Surfaced in the choice prompt (ui.ts).
export const SOVEREIGN_HANDOFF = 'There is always a moment. I kept the crown. Here is yours.';

// ── THE COMPLETION — the ending sequence names every woken citizen's fate. Release lets each one
// finish (the Vintner's wine is opened, the Courier's cipher delivered); Hold keeps each awake in
// the held moment, luminous and unfinished. Pure over wokenCitizens × choice. ──
export interface CitizenFate { name: string; line: string; }
export function completionEpilogue(save: SaveData, choice: 'catch' | 'fall'): CitizenFate[] {
  return wokenCitizens(save).map((c: Citizen) => ({
    name: c.name,
    line: choice === 'fall' ? c.fateRelease : c.fateHold,
  }));
}
