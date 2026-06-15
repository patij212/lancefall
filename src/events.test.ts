import { describe, it, expect } from 'vitest';
import { RUN_EVENTS, rollEventChoices, rollEventId } from './events';
import type { RunEventId } from './events';
import { World } from './world';
import { createRng } from './rng';

function freshWorld(): World {
  const w = new World(createRng(42));
  w.reset(1280, 720);
  return w;
}

function choice(w: World, id: RunEventId, choiceId: string) {
  const choices = rollEventChoices(id, w.rng, w);
  const c = choices.find((x) => x.id === choiceId)!;
  c.resolve(w);
}

describe('run events', () => {
  it('every event offers 2-3 choices', () => {
    const w = freshWorld();
    for (const id of Object.keys(RUN_EVENTS) as RunEventId[]) {
      const cs = rollEventChoices(id, w.rng, w);
      expect(cs.length).toBeGreaterThanOrEqual(2);
      expect(cs.length).toBeLessThanOrEqual(3);
      for (const c of cs) expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it('rollEventId returns a valid id', () => {
    const w = freshWorld();
    for (let i = 0; i < 20; i++) expect(RUN_EVENTS[rollEventId(w.rng)]).toBeDefined();
  });

  it('shrine "keen" grants +1 dash damage as a run boon', () => {
    const w = freshWorld();
    const before = w.stats.dashDamage;
    choice(w, 'shrine', 'keen');
    expect(w.stats.dashDamage).toBe(before + 1);
  });

  it('gamble "safe" adds score; treasure "shards" adds shards', () => {
    const w = freshWorld();
    choice(w, 'gamble', 'safe');
    expect(w.score).toBe(3000);
    choice(w, 'treasure', 'shards');
    expect(w.shards).toBe(250);
  });

  it('eliteWave "hunt" spawns 3 champions', () => {
    const w = freshWorld();
    const before = w.enemies.activeCount;
    choice(w, 'eliteWave', 'hunt');
    expect(w.enemies.activeCount).toBe(before + 3);
    let elites = 0;
    w.enemies.forEachActive((e) => { if (e.elite) elites++; });
    expect(elites).toBe(3);
  });

  it('cursedBargain "blood" zeroes shards and adds +2 dash damage', () => {
    const w = freshWorld();
    w.shards = 500;
    const before = w.stats.dashDamage;
    choice(w, 'cursedBargain', 'blood');
    expect(w.shards).toBe(0);
    expect(w.stats.dashDamage).toBe(before + 2);
  });
});

// Mid-run events fire AND resolve at player-driven timing/choice. They MUST draw
// from world.eventRng — never world.rng — so two players on the same Daily seed
// (who kill bosses at different times, or pick different options) keep a bit-
// identical seeded WAVE stream. This guards that contract (see spawnReset.test.ts).
describe('event determinism (world.rng is never forked by events)', () => {
  function rngTail(w: World, n: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(w.rng.next());
    return out;
  }

  it('resolving the rng-consuming choices never advances world.rng', () => {
    const a = freshWorld();
    const b = freshWorld(); // same seed → identical world.rng start
    a.shards = 1000;
    choice(a, 'gamble', 'risk'); // gamble roll → eventRng
    choice(a, 'treasure', 'power'); // free perk (rollDraft) → eventRng
    choice(a, 'eliteWave', 'hunt'); // 3 champions (edge/kind/angle) → eventRng
    // b did nothing; world.rng must be byte-identical despite a's event activity
    expect(rngTail(a, 8)).toEqual(rngTail(b, 8));
  });

  it('divergent event CHOICES still leave world.rng identical (Daily fairness)', () => {
    const a = freshWorld();
    const b = freshWorld();
    a.shards = b.shards = 1000;
    choice(a, 'gamble', 'risk'); // a gambles (draws eventRng)
    choice(b, 'gamble', 'safe'); // b pockets it (no draw)
    choice(a, 'eliteWave', 'rest'); // a skips the hunt
    choice(b, 'eliteWave', 'hunt'); // b springs 3 champions (draws eventRng)
    expect(rngTail(a, 8)).toEqual(rngTail(b, 8));
  });
});
