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
