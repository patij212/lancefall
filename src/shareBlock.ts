// Pure view-model for the game-over "LAST TRANSMISSION" share block. Maps a run's
// outcome + stats to the themed strings the panel renders — no DOM, no world.rng — so
// the copy/voice logic is unit-tested even though ui.ts itself isn't. The cold→warm
// gradient theming is CSS (driven by the .go-won/.go-lost class), not this module.

export interface ShareBlockInput {
  won: boolean;
  seed: number;
  daily: boolean;
  time: number; // seconds survived (HELD on a loss)
  wave: number;
  score: number;
  clearTime?: number; // seconds to clear (CLEARED on a win)
  grade: string; // computed upstream in ui.ts ('S' | 'A' | 'B' | '—')
}

export interface ShareStatCell {
  k: string;
  v: string;
}

export interface ShareBlockView {
  label: string; // header label (after the pip)
  pip: 'cold' | 'warm';
  badge: string; // signal badge text
  cta: string; // primary button label
  rally: string; // rally subline
  stats: [ShareStatCell, ShareStatCell, ShareStatCell];
}

/** mm:ss — mirrors ui.ts formatTime (kept local so this module stays DOM-free and pure). */
function mmss(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Seed line shared verbatim with replay.buildWatermark so the badge + GIF agree. */
function seedText(seed: number, daily: boolean): string {
  return daily ? `DAILY ${seed}` : `SEED ${seed}`;
}

export function shareBlockView(input: ShareBlockInput): ShareBlockView {
  const score = input.score.toLocaleString('en-US');
  const seed = seedText(input.seed, input.daily);
  if (input.won) {
    return {
      label: 'SIGNAL RESTORED',
      pip: 'warm',
      badge: `● FIRST LIGHT · ${seed}`,
      cta: 'SEND THE DAWN',
      rally: 'this is what holding looks like →',
      stats: [
        { k: 'CLEARED', v: mmss(input.clearTime ?? input.time) },
        { k: 'GRADE', v: input.grade },
        { k: 'SCORE', v: score },
      ],
    };
  }
  return {
    label: 'LAST TRANSMISSION',
    pip: 'cold',
    badge: `● SIGNAL LOST · ${seed}`,
    cta: 'SEND THE ECHO',
    rally: 'show them it can be held →',
    stats: [
      { k: 'HELD', v: mmss(input.time) },
      { k: 'WAVE', v: String(input.wave) },
      { k: 'SCORE', v: score },
    ],
  };
}
