// src/lore.ts — THE FALL. Memory Fragments (one carried out of every descent,
// plus milestones) unlock these deeper memories of the dead star-kingdom inside
// the CODEX. Pure data + helpers. Spending is a plain save mutation
// (fragmentsSpent + stillpointLore push) — never rng, so it can't perturb a run.
import type { SaveData } from './save';

export interface LoreEntry {
  id: string;
  title: string;
  cost: number; // Memory Fragments to remember it
  text: string;
}

export const LORE: LoreEntry[] = [
  {
    id: 'first-light',
    title: 'The First Light',
    cost: 1,
    text: 'Before the battlefield, a kingdom. Before the kingdom, one light someone refused to let go out. They wrote the city around it in living code — tower by tower, bell by bell — so the dark would always have somewhere to fail.',
  },
  {
    id: 'long-evening',
    title: 'The Long Evening',
    cost: 1,
    text: 'No kingdom falls in a night. Lancefall fell over a hundred quiet evenings — a door unguarded, a record unkept, a key never turned. Each too small to call the end.',
  },
  {
    id: 'the-fall',
    title: 'The Night It Fell',
    cost: 2,
    text: 'When it came, it came as silence — and then as noise. The bells did not ring. The light scrambled to grey. Everyone had believed someone else was holding the line. The line had been theirs.',
  },
  {
    id: 'warden-lore',
    title: 'The Warden, Before',
    cost: 1,
    text: 'He loved the gates more than the people behind them. Forty years he held them against every enemy — then, on the last night, against the only ones who could have saved the city. He forgot which side of the wall he was on, and turned the first wheel of the lock himself.',
  },
  {
    id: 'weaver-lore',
    title: 'The Weaver, Before',
    cost: 1,
    text: 'She kept the kingdom’s memory — every name, every debt, every promise — written in light. When the fear came, she enciphered the parts that hurt, scrambling them to grey until no one could read why the city was worth dying for. A kindness, she called it.',
  },
  {
    id: 'beacon-lore',
    title: 'The Beacon, Before',
    cost: 1,
    text: 'His one duty was to turn the light when help was needed — the signal that carried the key. On the last night it stayed dark, and the ships that might have come never knew to set out. He told himself the danger would pass.',
  },
  {
    id: 'mirror-lore',
    title: 'The Mirror',
    cost: 2,
    text: 'The Mirrorblade is not one of the Six. It is the doubt you carry down — that you will falter, that the city is already lost. It moves as you move, in your own colour, because it learned you. You beat it by being the one that means it.',
  },
  {
    id: 'hollow-lore',
    title: 'The Hollow, Before',
    cost: 1,
    text: 'The last to leave was the one who could not. Grief hollowed them until nothing held its shape — and the key to what they were shows for only an instant, when the mourning forgets itself and it is briefly real. Strike then. It is a mercy.',
  },
  {
    id: 'sovereign-lore',
    title: 'The Crown’s Choice',
    cost: 2,
    text: 'The Sovereign could have unlocked everything. There is always a moment when one turn of the key would hold the line; the Sovereign kept the crown instead, and enciphered the kingdom rather than fight for it. Now it warps the ground itself to stop you reading the last cipher. To win is to prove the moment was real.',
  },
  {
    id: 'last-lance',
    title: 'The Last Key',
    cost: 1,
    text: 'You are not a soldier. You are the kingdom’s last memory of itself, sharpened to a single edge — the last key, a spear that reads the pattern and breaks it — sent back down through the fall. Every dash is the city refusing to stay scrambled.',
  },
  {
    id: 'echo',
    title: 'An Echo, Daily',
    cost: 1,
    text: 'Each day a different citizen wakes inside the memory and lives one ordinary moment again — the bells, the markets, the gardens. The same echo for everyone, on the same day: one seed, one ciphertext, shared. It is not much. It is everything left.',
  },
  {
    id: 'what-remains',
    title: 'What Remains',
    cost: 2,
    text: 'You cannot stop the fall. You were never meant to. Every cipher here can be broken but one — and that one cannot be solved, only chosen: catch the light, or let it go. No machine decides it. Prove that a dead thing remembered is not entirely dead. Hold it here, as long as you can.',
  },
];

export function loreById(id: string): LoreEntry | undefined {
  return LORE.find((l) => l.id === id);
}

/** Memory Fragments available to spend = collected − spent. */
export function fragmentBalance(save: SaveData): number {
  return Math.max(0, save.stillpointFragments.length - save.fragmentsSpent);
}

export function loreUnlocked(save: SaveData, id: string): boolean {
  return save.stillpointLore.includes(id);
}

/** Can the player remember (unlock) this entry right now? */
export function canUnlockLore(save: SaveData, id: string): boolean {
  const e = loreById(id);
  if (!e || loreUnlocked(save, id)) return false;
  return fragmentBalance(save) >= e.cost;
}
