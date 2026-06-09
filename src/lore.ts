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
    text: 'Before it was a battlefield it was a kingdom, and before a kingdom, a single light someone refused to let go out. They built Lancefall around it — tower by tower, bell by bell — so the dark would always have somewhere to fail.',
  },
  {
    id: 'long-evening',
    title: 'The Long Evening',
    cost: 1,
    text: 'No kingdom falls in a night. Lancefall fell over a hundred quiet evenings — a door left unguarded, a record unkept, a call for aid unanswered — each so small no one thought to call it the end.',
  },
  {
    id: 'the-fall',
    title: 'The Night It Fell',
    cost: 2,
    text: 'When it finally came, it came as silence. The bells did not ring. The beacon did not turn. And the people, who had always believed someone else was holding the line, looked up to find the line had been theirs all along.',
  },
  {
    id: 'warden-lore',
    title: 'The Warden, Before',
    cost: 1,
    text: 'He loved the gates more than the people behind them. For forty years he held them against every enemy — and on the last night, against the only people who could have saved the city. Duty is a wall. He forgot which side he was on.',
  },
  {
    id: 'weaver-lore',
    title: 'The Weaver, Before',
    cost: 1,
    text: 'She kept the kingdom’s memory — every name, every debt, every promise. When the fear came she unspun the parts that hurt, until no one could remember why the city was worth dying for. A kindness, she called it.',
  },
  {
    id: 'beacon-lore',
    title: 'The Beacon, Before',
    cost: 1,
    text: 'The signal-keeper’s one duty was to turn the light when help was needed. On the last night the light stayed dark, and the ships that might have come never knew to. He told himself the danger would pass. It did not.',
  },
  {
    id: 'mirror-lore',
    title: 'The Mirror',
    cost: 2,
    text: 'The Mirrorblade is not one of the Six. It is the doubt you carry into every descent — that you will falter, that the city is already gone, that remembering is a child’s game. It fights in your colour because it is you. You beat it by meaning it more.',
  },
  {
    id: 'hollow-lore',
    title: 'The Hollow, Before',
    cost: 1,
    text: 'The last to leave was the one who could not. Grief hollowed them until there was nothing left to hold a shape — only a shape that mourns, untouchable, until for one clean moment it remembers it was ever real. Strike then. It is a mercy.',
  },
  {
    id: 'sovereign-lore',
    title: 'The Crown’s Choice',
    cost: 2,
    text: 'The Sovereign could have saved everything. There was a moment — there is always a moment — when one word would have turned it. The Sovereign chose the crown instead, and now warps the ground itself to stop you undoing that choice. To win is to prove the moment was real.',
  },
  {
    id: 'last-lance',
    title: 'The Last Lance',
    cost: 1,
    text: 'You are not a soldier. You are the kingdom’s last memory of itself, given a single weapon — a spear of light that remembers — and sent back down through its own fall to see how much can be held. Every dash is the city refusing to forget.',
  },
  {
    id: 'echo',
    title: 'An Echo, Daily',
    cost: 1,
    text: 'Each day a different citizen wakes inside the memory and lives one ordinary moment again — the bells, the markets, the gardens. The same echo for everyone, everywhere, on the same day. It is not much. It is everything that is left.',
  },
  {
    id: 'what-remains',
    title: 'What Remains',
    cost: 2,
    text: 'You cannot stop the fall. You were never meant to. You are here to decide what the fall was worth — to catch the light or to let it go — and to prove, one impossible descent at a time, that a dead thing remembered is not entirely dead. Hold it here. As long as you can.',
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
