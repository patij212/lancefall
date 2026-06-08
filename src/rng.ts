// Deterministic seeded PRNG (mulberry32). Powers daily-seed runs so every
// player worldwide gets the identical wave/perk sequence on a given date.

export type Rng = {
  next: () => number; // [0,1)
  range: (min: number, max: number) => number;
  int: (min: number, maxInclusive: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  weighted: <T>(items: readonly { v: T; w: number }[]) => T;
};

/** Raw mulberry32 generator: returns a function producing floats in [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const r: Rng = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, maxInclusive) => min + Math.floor(next() * (maxInclusive - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted: (items) => {
      let total = 0;
      for (const it of items) total += it.w;
      let roll = next() * total;
      for (const it of items) {
        roll -= it.w;
        if (roll <= 0) return it.v;
      }
      return items[items.length - 1].v;
    },
  };
  return r;
}

/** Integer seed derived from a date as YYYYMMDD (e.g. 20260608). */
export function seedFromDate(d: Date = new Date()): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Human-readable YYYY-MM-DD for the given date (local time). */
export function dateString(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
