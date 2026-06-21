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
  stretchSwell,
  preBossSilent,
  suddenDeathInset,
  eventCalm,
} from './waves';
import { createRng } from './rng';
import { modeById, ARENA_SCRIPT, BOSSRUSH_SEQUENCE } from './modes';
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

  it('opens with a small burst that decays, then returns to base cadence (no rng)', () => {
    expect(enemiesPerSpawn(0, 0)).toBe(2); // opening: base 1 + burst 1
    expect(enemiesPerSpawn(0, TUNE.director.openingBurstSec)).toBe(1); // burst gone exactly at the cutoff
    expect(enemiesPerSpawn(0)).toBe(1); // no-t call unchanged (back-compat)
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

// v6 §2 — the stretch swell (D2) and the payoff-breath / pre-boss-calm (D3) shape the
// inter-boss stretch into build-up → crescendo → boss → breath. All pure functions of
// sim state (this.t + the boss timer), so the seeded spawn stream is never forked.
describe('D2 stretch swell', () => {
  const W = TUNE.director.stretchWindow;
  const PEAK = 1 + TUNE.director.stretchSwell;
  it('is neutral (1.0) far from the boss and peaks at the boss', () => {
    expect(stretchSwell(W)).toBeCloseTo(1, 5);
    expect(stretchSwell(0)).toBeCloseTo(PEAK, 5);
  });
  it('rises monotonically as the boss nears (remaining → 0)', () => {
    let prev = stretchSwell(W);
    for (let r = W; r >= 0; r -= 1) {
      const v = stretchSwell(r);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });
  it('clamps past both ends', () => {
    expect(stretchSwell(W * 5)).toBeCloseTo(1, 5);
    expect(stretchSwell(-1)).toBeCloseTo(PEAK, 5);
  });
  it('the midpoint sits strictly between neutral and peak', () => {
    const mid = stretchSwell(W / 2);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(PEAK);
  });
});

describe('§4 M2 sudden-death inset', () => {
  const SD = { suddenDeath: { afterBoss: 1 } };
  it('is 0 without a rules block or without suddenDeath (every non-NIGHTMARE mode)', () => {
    expect(suddenDeathInset(5)).toBe(0);
    expect(suddenDeathInset(5, { events: 'normal' })).toBe(0);
  });
  it('is 0 until the afterBoss threshold', () => {
    expect(suddenDeathInset(0, SD)).toBe(0);
  });
  it('closes by insetPerBoss each boss, capped at insetMax', () => {
    const d = TUNE.director;
    expect(suddenDeathInset(1, SD)).toBeCloseTo(d.suddenDeathInsetPerBoss);
    expect(suddenDeathInset(2, SD)).toBeCloseTo(2 * d.suddenDeathInsetPerBoss);
    expect(suddenDeathInset(1000, SD)).toBe(d.suddenDeathInsetMax);
  });
  it('is a pure function of bossCount (reads no pixels/DPR)', () => {
    expect(suddenDeathInset(3, SD)).toBe(suddenDeathInset(3, SD));
  });
});

describe('D3 pre-boss calm', () => {
  it('goes silent only inside the preBossCalm window', () => {
    expect(preBossSilent(TUNE.director.preBossCalm - 0.01)).toBe(true);
    expect(preBossSilent(TUNE.director.preBossCalm)).toBe(false);
    expect(preBossSilent(99)).toBe(false);
  });
});

describe('D3 spawn gating in the director', () => {
  const DT = 1 / 60;
  it('no chaff spawns in the ~preBossCalm window before a boss (clean arena)', () => {
    const d = new Director();
    d.configure(modeById('endless'));
    const rng = createRng(3);
    let t = 0;
    let lastSpawnT = -1;
    for (let i = 0; i < 6000; i++) {
      const dec = d.update(DT, 0, false, rng);
      t += DT;
      if (dec.spawn.length) lastSpawnT = t;
      if (dec.boss) {
        // the last chaff spawned at least preBossCalm before the boss arrived
        expect(t - lastSpawnT).toBeGreaterThanOrEqual(TUNE.director.preBossCalm - DT);
        return;
      }
    }
    throw new Error('no boss fired within the window');
  });
  it('payoff breath: no chaff for ~bossLull seconds after a boss dies, then resumes', () => {
    const d = new Director();
    d.configure(modeById('endless'));
    const rng = createRng(5);
    let firedBoss = false;
    for (let i = 0; i < 6000; i++) {
      if (d.update(DT, 0, false, rng).boss) { firedBoss = true; break; }
    }
    expect(firedBoss).toBe(true);
    for (let k = 0; k < 60; k++) d.update(DT, 0, true, rng); // ~1s of fight
    let spawnsDuringLull = 0;
    const ticks = Math.round((TUNE.director.bossLull - DT) / DT);
    for (let k = 0; k < ticks; k++) spawnsDuringLull += d.update(DT, 0, false, rng).spawn.length;
    expect(spawnsDuringLull).toBe(0);
    let resumed = 0;
    for (let k = 0; k < 600; k++) resumed += d.update(DT, 0, false, rng).spawn.length;
    expect(resumed).toBeGreaterThan(0);
  });
});

describe('D2/D3 determinism — swell/lull are pure, never fork the seeded stream', () => {
  const DT = 1 / 60;
  function spawnStream(seed: number): string[] {
    const d = new Director();
    d.configure(modeById('daily'));
    const rng = createRng(seed);
    const out: string[] = [];
    let bossAlive = false;
    let fight = 0;
    for (let i = 0; i < 18000; i++) {
      // ~300s — crosses several bosses + lulls
      const dec = d.update(DT, 0, bossAlive, rng);
      for (const s of dec.spawn) out.push(s);
      if (dec.boss) { bossAlive = true; fight = 0; }
      else if (bossAlive) { fight += DT; if (fight >= 6) bossAlive = false; }
    }
    return out;
  }
  it('two fresh directors on the same daily seed + script produce an identical spawn stream', () => {
    const a = spawnStream(20260615);
    expect(a.length).toBeGreaterThan(0);
    expect(spawnStream(20260615)).toEqual(a);
  });
  it('different seeds produce different streams (the rng actually drives variety)', () => {
    expect(spawnStream(1)).not.toEqual(spawnStream(2));
  });
});

// Playtest (Nick): "Events must not pop up during high-intensity moments." A due mid-run
// event now waits for a CALM window — few enemies, few bullets, and clear of the pre-boss
// swell — before it fires, bounded by eventDeferMax so it can never starve. The gate reads
// only deterministic sim state, so the single eventRng draw still happens exactly once
// (only later) and the Daily stays bit-identical for everyone.
describe('mid-run event calm-gating', () => {
  const D = TUNE.director;

  describe('eventCalm predicate', () => {
    it('is calm with few enemies, few bullets, and clear of the pre-boss swell', () => {
      expect(eventCalm(0, 0, D.bossInterval)).toBe(true);
      expect(eventCalm(D.eventCalmEnemyMax, D.eventCalmBulletMax, D.stretchWindow + 1)).toBe(true);
    });
    it('is NOT calm when too many enemies are alive', () => {
      expect(eventCalm(D.eventCalmEnemyMax + 1, 0, D.bossInterval)).toBe(false);
    });
    it('is NOT calm when the screen is dense with bullets', () => {
      expect(eventCalm(0, D.eventCalmBulletMax + 1, D.bossInterval)).toBe(false);
    });
    it('is NOT calm inside the pre-boss swell (a boss is imminent)', () => {
      expect(eventCalm(0, 0, D.stretchWindow)).toBe(false);
      expect(eventCalm(0, 0, 0.5)).toBe(false);
    });
  });

  describe('the Director defers events out of high-intensity windows', () => {
    const DT = 1 / 60;
    // Hold endless mode at a fixed arena load (no boss) and report the first event time.
    function firstEventTime(concurrent: number, bulletCount: number, maxT: number): number | null {
      const d = new Director();
      d.configure(modeById('endless'));
      const rng = createRng(1);
      let t = 0;
      for (let i = 0; t < maxT; i++) {
        const dec = d.update(DT, concurrent, false, rng, bulletCount);
        t += DT;
        if (dec.event) return t;
      }
      return null;
    }

    it('fires the first event promptly when the arena is calm', () => {
      const t = firstEventTime(0, 0, 60);
      expect(t).not.toBeNull();
      expect(t!).toBeGreaterThanOrEqual(D.eventFirst - 0.1);
      expect(t!).toBeLessThan(D.eventFirst + 2); // before the pre-boss swell closes the window
    });

    it('does NOT fire while the arena is packed (defers within the deferMax window)', () => {
      const t = firstEventTime(99, 999, D.eventFirst + D.eventDeferMax - 1);
      expect(t).toBeNull();
    });

    it('force-fires after eventDeferMax even if it never calms (never starves)', () => {
      const t = firstEventTime(99, 999, D.eventFirst + D.eventDeferMax + 5);
      expect(t).not.toBeNull();
      expect(t!).toBeGreaterThanOrEqual(D.eventFirst + D.eventDeferMax - 0.3);
    });
  });
});

// The headline "winnable" feature: ARENA (15 waves + 6 bosses) and BOSS RUSH (6
// bosses) must actually reach a WIN. Drive a "perfect clear" — nothing ever lingers
// (concurrent=0) and no boss survives (bossAlive=false) — so the director advances
// through every scripted phase. Guards against a future phase-strand regression
// silently breaking the victory path.
// Playtest (Nick): "boss pre-warning" — telegraph an incoming boss a few seconds early. The
// Director emits a deterministic bossWarn signal: a precise ~bossWarnLead lead in the
// time-driven modes (off the boss timer) and an "imminent" flag during the pre-boss clear in
// the scripted modes. Pure (no rng) → Daily-safe; the game fires an anticipatory cue on its edge.
describe('boss pre-warning signal', () => {
  const DT = 1 / 60;
  it('endless: bossWarn rises ~bossWarnLead before the boss spawns', () => {
    const d = new Director();
    d.configure(modeById('endless'));
    const rng = createRng(1);
    let warnAt: number | null = null;
    let bossAt: number | null = null;
    let t = 0;
    for (let i = 0; i < 6000 && bossAt === null; i++) {
      const dec = d.update(DT, 0, false, rng);
      t += DT;
      if (dec.bossWarn && warnAt === null) warnAt = t;
      if (dec.boss) bossAt = t;
    }
    expect(warnAt).not.toBeNull();
    expect(bossAt).not.toBeNull();
    expect(bossAt! - warnAt!).toBeGreaterThanOrEqual(TUNE.director.bossWarnLead - 0.1);
    expect(bossAt! - warnAt!).toBeLessThanOrEqual(TUNE.director.bossWarnLead + 0.1);
  });
  it('endless: no premature warning far from the boss', () => {
    const d = new Director();
    d.configure(modeById('endless'));
    const dec = d.update(10, 0, false, createRng(1)); // t=10, far from the ~70s boss
    expect(dec.bossWarn).toBe(false);
  });
  it('scripted (arena): bossWarn fires on/before the first scripted boss', () => {
    const d = new Director();
    d.configure(modeById('arena'));
    const rng = createRng(1);
    let warned = false;
    let firstBoss = false;
    for (let i = 0; i < 100000 && !firstBoss; i++) {
      const dec = d.update(0.7, 0, false, rng);
      if (dec.bossWarn) warned = true;
      if (dec.boss) firstBoss = true;
    }
    expect(firstBoss).toBe(true);
    expect(warned).toBe(true);
  });
});

describe('scripted modes reach the WIN state', () => {
  function driveToWin(modeId: string) {
    const d = new Director();
    d.configure(modeById(modeId));
    const rng = createRng(1);
    const bosses: string[] = [];
    let win = false;
    let guard = 0;
    while (!win && guard++ < 100_000) {
      const dec = d.update(0.7, 0, false, rng);
      if (dec.bossKind) bosses.push(dec.bossKind);
      if (dec.win) win = true;
    }
    const after = d.update(0.7, 0, false, rng); // post-win: must be inert
    return { bosses, win, bossCount: d.bossCount, after, guard };
  }

  it('ARENA spawns every scripted boss in order, wins exactly once, then goes inert', () => {
    const expected = ARENA_SCRIPT.flatMap((w) => (w.kind === 'boss' ? [w.boss] : []));
    const r = driveToWin('arena');
    expect(r.win).toBe(true);
    expect(r.bosses).toEqual(expected); // every boss requested, in script order
    expect(r.bossCount).toBe(expected.length); // HP-scaling ordinal advanced per boss
    expect(r.after.win).toBe(false); // win fires exactly once
    expect(r.after.spawn.length).toBe(0); // no spawns after the gauntlet is beaten
    expect(r.after.boss).toBe(false);
  });

  it('BOSS RUSH sequences all six bosses in order then wins', () => {
    const r = driveToWin('bossrush');
    expect(r.win).toBe(true);
    expect(r.bosses).toEqual([...BOSSRUSH_SEQUENCE]);
    expect(r.bossCount).toBe(BOSSRUSH_SEQUENCE.length);
    expect(r.after.win).toBe(false);
  });
});
