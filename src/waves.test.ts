import { describe, it, expect } from 'vitest';
import {
  intensity,
  spawnInterval,
  enemiesPerSpawn,
  maxConcurrent,
  enemySpeedMul,
  bulletSpeedMul,
  shieldChance,
  unlockedKinds,
  enemyWeights,
  eliteChance,
  ELITE_KINDS,
  Director,
} from './waves';
import { createRng } from './rng';
import { modeById } from './modes';
import { TUNE, ELITE } from './tune';

describe('elites', () => {
  it('no champions before the elite window opens', () => {
    expect(eliteChance(0)).toBe(0);
    expect(eliteChance(ELITE.startTime - 1)).toBe(0);
  });

  it('chance ramps from base to max and clamps', () => {
    expect(eliteChance(ELITE.startTime)).toBeCloseTo(ELITE.baseChance, 5);
    expect(eliteChance(ELITE.startTime + ELITE.rampSeconds)).toBeCloseTo(ELITE.maxChance, 5);
    // well past the ramp it stays clamped at max
    expect(eliteChance(ELITE.startTime + ELITE.rampSeconds * 3)).toBeCloseTo(ELITE.maxChance, 5);
  });

  it('only solid single archetypes are elite-eligible', () => {
    expect(ELITE_KINDS.has('darter')).toBe(true);
    expect(ELITE_KINDS.has('lancer')).toBe(true);
    // packs and split-fodder are never champions
    expect(ELITE_KINDS.has('wisp')).toBe(false);
    expect(ELITE_KINDS.has('mini')).toBe(false);
    expect(ELITE_KINDS.has('splitter')).toBe(false);
    // a tanky stationary turret would be an un-fun sponge
    expect(ELITE_KINDS.has('bloomer')).toBe(false);
    // bosses are never elite
    expect(ELITE_KINDS.has('warden')).toBe(false);
  });
});

describe('intensity curve', () => {
  it('ramps 0→1 over the ramp window then keeps climbing', () => {
    expect(intensity(0)).toBeCloseTo(0);
    expect(intensity(TUNE.director.rampSeconds)).toBeCloseTo(1);
    expect(intensity(TUNE.director.rampSeconds * 2)).toBeGreaterThan(1);
  });

  it('is monotonically increasing', () => {
    let prev = -1;
    for (let t = 0; t < 600; t += 10) {
      const v = intensity(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('spawn cadence', () => {
  it('spawn interval shrinks with intensity but respects the floor', () => {
    expect(spawnInterval(0)).toBeCloseTo(TUNE.director.spawnIntervalStart);
    expect(spawnInterval(5)).toBeGreaterThanOrEqual(TUNE.director.spawnIntervalFloor);
    expect(spawnInterval(1)).toBeLessThan(spawnInterval(0));
  });

  it('enemies per spawn and concurrency grow with intensity', () => {
    expect(enemiesPerSpawn(1)).toBeGreaterThan(enemiesPerSpawn(0));
    expect(maxConcurrent(1)).toBeGreaterThan(maxConcurrent(0));
    expect(maxConcurrent(99)).toBeLessThanOrEqual(TUNE.director.maxConcurrentCap);
  });

  it('speed multipliers increase with intensity', () => {
    expect(enemySpeedMul(1)).toBeGreaterThan(enemySpeedMul(0));
    expect(bulletSpeedMul(1)).toBeGreaterThan(bulletSpeedMul(0));
  });
});

describe('unlock pacing', () => {
  it('starts with only darters and adds archetypes over time', () => {
    expect(unlockedKinds(0)).toEqual(['darter']);
    expect(unlockedKinds(20)).toContain('orbiter');
    expect(unlockedKinds(50)).toContain('splitter');
    expect(unlockedKinds(90)).toContain('bloomer');
    // v6 D5: opening unlocks pulled earlier (orbiter 18→15, splitter 45→35, lancer 60→50)
    expect(unlockedKinds(15)).toContain('orbiter');
    expect(unlockedKinds(14)).not.toContain('orbiter');
    expect(unlockedKinds(35)).toContain('splitter');
    expect(unlockedKinds(34)).not.toContain('splitter');
    expect(unlockedKinds(50)).toContain('lancer');
    expect(unlockedKinds(49)).not.toContain('lancer');
    expect(unlockedKinds(110)).not.toContain('brooder'); // not yet at t=110
    expect(unlockedKinds(125)).toContain('brooder'); // unlocks at t=120
  });

  it('weights only include unlocked kinds', () => {
    const w = enemyWeights(0, 0);
    expect(w.map((x) => x.v)).toEqual(['darter']);
    // by t=200 every spawnable archetype is unlocked
    const all = enemyWeights(200, 1).map((x) => x.v).sort();
    expect(all).toEqual(['bloomer', 'bomber', 'brooder', 'darter', 'drifter', 'herald', 'lancer', 'orbiter', 'seeker', 'shade', 'splitter', 'wisp']);
    // mid-run excludes not-yet-unlocked kinds (no bomber/wisp at t=90)
    const mid = enemyWeights(90, 1).map((x) => x.v);
    expect(mid).toContain('lancer');
    expect(mid).not.toContain('bomber');
    expect(mid).not.toContain('wisp');
  });
});

describe('shields', () => {
  it('are absent early and ramp later, capped', () => {
    expect(shieldChance(0)).toBe(0);
    expect(shieldChance(TUNE.director.shieldStartTime + 90)).toBeCloseTo(TUNE.director.shieldMaxChance);
  });
});

describe('Director', () => {
  it('schedules the first boss at the boss interval', () => {
    const d = new Director();
    const rng = createRng(1);
    let bossSeen = false;
    for (let t = 0; t < TUNE.director.bossInterval + 1; t += TUNE.director.bossInterval) {
      // step in one big chunk past the interval
    }
    // step with dt covering just past bossInterval
    const dec = d.update(TUNE.director.bossInterval + 0.1, 0, false, rng);
    bossSeen = dec.boss;
    expect(bossSeen).toBe(true);
    expect(d.bossCount).toBe(1);
  });

  it('offers a perk at the first perk time', () => {
    const d = new Director();
    const rng = createRng(1);
    const dec = d.update(TUNE.director.perkFirst + 0.1, 0, false, rng);
    expect(dec.perk).toBe(true);
  });

  it('does not exceed max concurrency when spawning', () => {
    const d = new Director();
    const rng = createRng(3);
    // saturate: claim arena is already full
    const dec = d.update(5, 999, false, rng);
    expect(dec.spawn.length).toBe(0);
  });

  it('suppresses normal spawns while a boss is alive', () => {
    const d = new Director();
    const rng = createRng(3);
    const dec = d.update(5, 0, true, rng);
    expect(dec.spawn.length).toBe(0);
  });
});

// The inter-boss "wave" in the time-driven modes (endless/daily/nightmare) is a
// fixed budget of NON-BOSS play: the boss timer only ticks while no boss is alive,
// so the wave runs the same length no matter how long the boss fight lasted (this
// is also what makes an instant boss-after-boss impossible). Each consecutive wave
// is waveExtend seconds longer than the last, capped at waveLenMax.
describe('endless wave pacing', () => {
  const DT = 1 / 60;

  // Mirrors the game loop: drive the director with bossAlive=false until it asks
  // for a boss, then bossAlive=true for `fightLen` seconds (the fight), then false
  // again (the boss died). Returns the non-boss seconds elapsed before each boss.
  function waveDurations(seed: number, fightLen: number, count: number): number[] {
    const d = new Director();
    d.configure(modeById('endless'));
    const rng = createRng(seed);
    const out: number[] = [];
    let bossAlive = false;
    let wave = 0;
    let fight = 0;
    let guard = 0;
    while (out.length < count && guard++ < 2_000_000) {
      const dec = d.update(DT, 0, bossAlive, rng);
      if (!bossAlive) {
        wave += DT;
        if (dec.boss) { out.push(wave); wave = 0; bossAlive = true; fight = 0; }
      } else {
        fight += DT;
        if (fight >= fightLen) bossAlive = false; // the boss dies
      }
    }
    return out;
  }

  it('runs a wave the same length no matter how long the boss fight lasted', () => {
    const quick = waveDurations(42, 2, 4); // 2s boss fights
    const slow = waveDurations(42, 120, 4); // 2-minute boss fights
    // identical wave budgets — the fight never eats into (or pads) the next wave
    for (let i = 0; i < 4; i++) expect(quick[i]).toBeCloseTo(slow[i], 5);
  });

  it('never spawns the next boss on the frame the previous one dies', () => {
    // after a boss dies a fresh (long) wave begins, so there is always a real
    // stretch of play before the next boss — never an instant back-to-back.
    const w = waveDurations(99, 150, 2);
    expect(w[1]).toBeGreaterThan(10);
  });

  it('grows each consecutive wave by waveExtend, capped at waveLenMax', () => {
    const w = waveDurations(7, 1, 7);
    const base = modeById('endless').bossInterval;
    const ext = TUNE.director.waveExtend;
    const cap = TUNE.director.waveLenMax;
    const expected = (n: number) => Math.min(base + n * ext, cap);
    for (let n = 0; n < 7; n++) expect(w[n]).toBeCloseTo(expected(n), 1);
    // and it actually reaches the cap and holds there (no runaway 4-min waves)
    expect(w[6]).toBeCloseTo(cap, 1);
    expect(w[6] - w[5]).toBeLessThanOrEqual(ext + 1e-6);
  });
});
