import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';

// Regression guards for two BROODER bugs found in the v4 cumulative review:
//  1. spawnEnemy must reset e.subPhase — the shared pool recycles slots, so a
//     stale subPhase (from a prior brooder/boss) would make a fresh brooder
//     hatch nothing.
//  2. Death-spawned children pass an explicit angle so they NEVER draw world.rng
//     (a player-kill-timed draw would desync the seeded Daily director stream).

describe('spawnEnemy pool-recycle hygiene', () => {
  it('resets subPhase on a recycled (dirty) slot', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    w.spawnEnemy('darter', 0, 0, 1, 1, false); // takes slot 0, cursor → 1
    // dirty the next slot the round-robin pool will hand out, as a spent
    // brooder/boss would leave it
    const nextSlot = w.enemies.items[1];
    nextSlot.subPhase = 9;
    const b = w.spawnEnemy('brooder', 200, 200, 1, 1, false)!;
    expect(b).toBe(nextSlot); // confirm we recycled the dirtied slot
    expect(b.subPhase).toBe(0); // spawnEnemy cleared the stale value
  });
});

describe('spawnEnemy determinism (explicit angle ⇒ no world.rng draw)', () => {
  it('an explicit-angle spawn consumes zero world.rng draws', () => {
    const wA = new World(createRng(7));
    wA.reset(1280, 720);
    const wB = new World(createRng(7)); // identical twin, does no spawns
    wB.reset(1280, 720);
    for (let i = 0; i < 3; i++) wA.spawnEnemy('mini', 0, 0, 1, 1, false, false, i * 0.5);
    // if the spawns drew nothing from world.rng, both streams are still aligned
    expect(wA.rng.next()).toBe(wB.rng.next());
  });

  it('an angle-less spawn DOES draw world.rng (proves the param matters)', () => {
    const wB = new World(createRng(7));
    wB.reset(1280, 720);
    const wC = new World(createRng(7));
    wC.reset(1280, 720);
    wC.spawnEnemy('mini', 0, 0, 1, 1, false); // no angle → one world.rng draw
    expect(wC.rng.next()).not.toBe(wB.rng.next());
  });
});

describe('Daily determinism — kill-timed scatter stays off the director stream', () => {
  it('spawnGem draws from dropRng, not world.rng (so kills never desync the Daily waves)', () => {
    const wA = new World(createRng(7));
    wA.reset(1280, 720);
    const wB = new World(createRng(7)); // identical twin, drops no gems
    wB.reset(1280, 720);
    for (let i = 0; i < 8; i++) wA.spawnGem(100, 100, 1); // many kill-drops
    // the director stream (world.rng) must be untouched → still aligned with the twin
    expect(wA.rng.next()).toBe(wB.rng.next());
  });
});
