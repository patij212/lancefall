import { describe, it, expect } from 'vitest';
import { migrateSave, SAVE_VERSION } from './migrate';
import { defaultSave } from './save';
import { vocabulary, masterProgress } from './intercepts';
import { TUNE } from './tune';
import { skinById } from './skins';

describe('save migration', () => {
  it('returns a fresh default for null/garbage input', () => {
    expect(migrateSave(null, defaultSave())).toEqual(defaultSave());
    expect(migrateSave('nonsense', defaultSave())).toEqual(defaultSave());
    expect(migrateSave(42, defaultSave())).toEqual(defaultSave());
  });

  it('preserves a legacy (unversioned) save and stamps the current version', () => {
    const legacy = { highScore: 46472, bestCombo: 31, shards: 120, selectedShip: 'phantom' };
    const out = migrateSave(legacy, defaultSave());
    expect(out.highScore).toBe(46472);
    expect(out.bestCombo).toBe(31);
    expect(out.shards).toBe(120);
    expect(out.selectedShip).toBe('phantom');
    expect(out.version).toBe(SAVE_VERSION);
  });

  it('default-fills fields absent from an old save', () => {
    const old = { highScore: 100 };
    const out = migrateSave(old, defaultSave());
    expect(out.unlockedShips).toEqual(['lance']);
    expect(out.meta).toEqual({});
    expect(out.achievements).toEqual([]);
    expect(out.bestWave).toBe(0);
    // v4 cosmetic dash-trail fields default-fill for pre-v4 saves
    expect(out.unlockedTrails).toEqual(['pulse']);
    expect(out.selectedTrail).toBe('pulse');
  });

  it('always reports the current version even if an older one was stored', () => {
    const out = migrateSave({ version: 1, highScore: 5 }, defaultSave());
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.highScore).toBe(5);
  });

  it('default-fills the v5 Stillpoint fields for a v4 save (single additive bump)', () => {
    const v4 = { version: 4, highScore: 46472, bestCombo: 31, handle: '' };
    const out = migrateSave(v4, defaultSave());
    expect(out.version).toBe(SAVE_VERSION); // 6
    expect(out.highScore).toBe(46472); // pre-existing data preserved
    expect(out.stillpointFragments).toEqual([]);
    expect(out.fragmentsSpent).toBe(0);
    expect(out.stillpointLore).toEqual([]);
    expect(out.stillpointChoice).toBe('none');
    expect(out.ngPlusLevel).toBe(0);
    expect(out.ngPlusActive).toBe(false);
    expect(out.nemesis).toEqual({});
    expect(out.deepestWave).toBe(0);
  });

  it('default-fills the v6 pass fields for a v5 save (single additive bump)', () => {
    const v5 = { version: 5, highScore: 46472, stillpointChoice: 'none' };
    const out = migrateSave(v5, defaultSave());
    expect(out.version).toBe(SAVE_VERSION); // 6
    expect(out.highScore).toBe(46472); // pre-existing data preserved
    expect(out.selectedMode).toBe('casual'); // fresh-save default = the suggested first-run mode
    expect(out.dailyAttempts).toBe(0);
    expect(out.dailyAttemptDate).toBe('');
    expect(out.baseShields).toBe(TUNE.player.baseShields);
    expect(out.cityMemoryMeter).toBe(true);
    expect(out.firstRunsBeatHint).toBe(0);
    // §1.2 — a v5 save predates the sandbox flag → defaults false so the player sees it once
    expect(out.seenSandbox).toBe(false);
  });

  it('preserves a real seenSandbox and coerces a corrupted one to false', () => {
    expect(migrateSave({ version: 6, seenSandbox: true }, defaultSave()).seenSandbox).toBe(true);
    expect(migrateSave({ version: 6, seenSandbox: 'yes' }, defaultSave()).seenSandbox).toBe(false);
  });

  // ── act-two onboarding — taught set sanitize (additive, no version bump) ──
  it('default-fills taught to [] for a save that predates it', () => {
    expect(migrateSave({ version: 6, highScore: 1 }, defaultSave()).taught).toEqual([]);
  });

  it('preserves taught keys, dedupes, and drops non-strings', () => {
    const out = migrateSave(
      { version: 8, taught: ['verb:heavy', 'verb:heavy', 'enemy:darter', 7, null, 'boss:warden'] },
      defaultSave(),
    );
    expect(out.taught).toEqual(['verb:heavy', 'enemy:darter', 'boss:warden']);
  });

  it('coerces a non-array taught to []', () => {
    expect(migrateSave({ version: 8, taught: 'verb:heavy' }, defaultSave()).taught).toEqual([]);
    expect(migrateSave({ version: 8, taught: 42 }, defaultSave()).taught).toEqual([]);
  });

  // ── §1.7 jargon glosses — glossSeen sanitize ──
  it('default-fills glossSeen to [] for an old save', () => {
    expect(migrateSave({ version: 5, highScore: 1 }, defaultSave()).glossSeen).toEqual([]);
  });

  it('preserves known glossSeen ids and drops garbage / dupes / non-ids', () => {
    const out = migrateSave(
      { version: 6, glossSeen: ['graze', 'graze', 'armor', 'not-a-gloss', 7, null, 'fusion'] },
      defaultSave(),
    );
    expect(out.glossSeen).toEqual(['graze', 'armor', 'fusion']);
  });

  it('coerces a non-array glossSeen to []', () => {
    expect(migrateSave({ version: 6, glossSeen: 'graze' }, defaultSave()).glossSeen).toEqual([]);
    expect(migrateSave({ version: 6, glossSeen: 42 }, defaultSave()).glossSeen).toEqual([]);
  });

  // ── §3.4 per-mode best SCORE — bestByMode is a {string:number} record (like meta/nemesis),
  //    so the generic coerceNumberRecord pass keeps only finite-number values. ──
  it('default-fills bestByMode to {} for an old save', () => {
    expect(migrateSave({ version: 5, highScore: 1 }, defaultSave()).bestByMode).toEqual({});
  });

  it('keeps finite-number bestByMode entries and drops string/NaN/null values', () => {
    const out = migrateSave(
      { version: 6, bestByMode: { endless: 46472, arena: 'lots', nightmare: NaN, bossrush: 9001, broken: null } },
      defaultSave(),
    );
    expect(out.bestByMode).toEqual({ endless: 46472, bossrush: 9001 });
  });

  it('coerces a non-object bestByMode (string or array) to {}', () => {
    expect(migrateSave({ version: 6, bestByMode: 'corrupt' }, defaultSave()).bestByMode).toEqual({});
    expect(migrateSave({ version: 6, bestByMode: [1, 2] }, defaultSave()).bestByMode).toEqual({});
  });

  // ── v7 cockpit stats — lifeWins (number) + killsByKind ({string:number}) ride the
  //    generic per-field coerce loop (number-default-fill + coerceNumberRecord). ──
  it('default-fills lifeWins to 0 and killsByKind to {} for an old save', () => {
    const out = migrateSave({ version: 6, highScore: 1 }, defaultSave());
    expect(out.lifeWins).toBe(0);
    expect(out.killsByKind).toEqual({});
  });

  it('coerces a non-number lifeWins back to 0', () => {
    expect(migrateSave({ version: 6, lifeWins: 'lots' }, defaultSave()).lifeWins).toBe(0);
    expect(migrateSave({ version: 6, lifeWins: NaN }, defaultSave()).lifeWins).toBe(0);
    expect(migrateSave({ version: 6, lifeWins: 12 }, defaultSave()).lifeWins).toBe(12);
  });

  it('keeps finite-number killsByKind entries and drops string/NaN/null values', () => {
    const out = migrateSave(
      { version: 6, killsByKind: { darter: 412, orbiter: 'many', warden: NaN, sovereign: 3, broken: null } },
      defaultSave(),
    );
    expect(out.killsByKind).toEqual({ darter: 412, sovereign: 3 });
  });

  // ── v7 RECORDS — longestRunSec / fastestArenaSec / mostBossesOneRun (numbers,
  //    non-negative integers; clamped after the generic finite-number coerce). ──
  it('default-fills the v7 records to 0 for a v6 save', () => {
    const out = migrateSave({ version: 6, highScore: 1 }, defaultSave());
    expect(out.version).toBe(SAVE_VERSION); // 7
    expect(out.longestRunSec).toBe(0);
    expect(out.fastestArenaSec).toBe(0);
    expect(out.mostBossesOneRun).toBe(0);
  });

  it('preserves real v7 record values', () => {
    const out = migrateSave({ version: 7, longestRunSec: 1334, fastestArenaSec: 408, mostBossesOneRun: 6 }, defaultSave());
    expect(out.longestRunSec).toBe(1334);
    expect(out.fastestArenaSec).toBe(408);
    expect(out.mostBossesOneRun).toBe(6);
  });

  it('coerces a non-number v7 record to 0 and clamps a negative/fractional one to a non-negative int', () => {
    expect(migrateSave({ version: 7, longestRunSec: 'lots' }, defaultSave()).longestRunSec).toBe(0);
    expect(migrateSave({ version: 7, fastestArenaSec: NaN }, defaultSave()).fastestArenaSec).toBe(0);
    expect(migrateSave({ version: 7, mostBossesOneRun: -3 }, defaultSave()).mostBossesOneRun).toBe(0);
    expect(migrateSave({ version: 7, longestRunSec: 22.9 }, defaultSave()).longestRunSec).toBe(22);
  });

  // ── v8 SHIP SKINS (cosmetic) — per-(ship,set) ownership + per-ship equip record ──
  it('default-fills the ship-skin cosmetics to empty (no owned skins, plain hull) for a v7 save', () => {
    const out = migrateSave({ version: 7, highScore: 1 }, defaultSave());
    expect(out.version).toBe(SAVE_VERSION); // 8
    expect(out.unlockedShipSkins).toEqual([]);
    expect(out.selectedShipSkins).toEqual({});
  });

  it('keeps valid `${ship}:${set}` ownership keys + the equipped record, dropping unknowns', () => {
    const out = migrateSave(
      { version: 7, unlockedShipSkins: ['lance:encryption', 'glaive:key', 'bogus:encryption', 'lance:nope', 42], selectedShipSkins: { lance: 'encryption', glaive: 'key' } },
      defaultSave(),
    );
    expect([...out.unlockedShipSkins].sort()).toEqual(['glaive:key', 'lance:encryption']); // bad ship/set + non-string dropped
    expect(out.selectedShipSkins).toEqual({ lance: 'encryption', glaive: 'key' });
  });

  it('drops an equipped skin the ship does not own, plus unknown ships / none / junk blobs', () => {
    // equipped firstlight on lance, but lance:firstlight is NOT owned → dropped
    expect(migrateSave({ version: 7, unlockedShipSkins: ['lance:encryption'], selectedShipSkins: { lance: 'firstlight' } }, defaultSave()).selectedShipSkins).toEqual({});
    // 'none' is the default (never stored); an unknown ship is dropped
    expect(migrateSave({ version: 7, unlockedShipSkins: [], selectedShipSkins: { lance: 'none', nope: 'encryption' } }, defaultSave()).selectedShipSkins).toEqual({});
    // non-array / non-object blobs degrade cleanly
    expect(migrateSave({ version: 7, unlockedShipSkins: 'corrupt' }, defaultSave()).unlockedShipSkins).toEqual([]);
    expect(migrateSave({ version: 7, selectedShipSkins: [1, 2] }, defaultSave()).selectedShipSkins).toEqual({});
  });

  // ── v7 COMBAT lifetime counters — lifeGrazes / lifeDaybreaks / lifeLastBreath ride the
  //    generic number coerce loop (like lifeKills/lifeWins). ──
  it('default-fills the v7 combat counters to 0 and preserves / coerces real values', () => {
    const fresh = migrateSave({ version: 6, highScore: 1 }, defaultSave());
    expect(fresh.lifeGrazes).toBe(0);
    expect(fresh.lifeDaybreaks).toBe(0);
    expect(fresh.lifeLastBreath).toBe(0);
    const real = migrateSave({ version: 7, lifeGrazes: 9884, lifeDaybreaks: 206, lifeLastBreath: 38 }, defaultSave());
    expect(real.lifeGrazes).toBe(9884);
    expect(real.lifeDaybreaks).toBe(206);
    expect(real.lifeLastBreath).toBe(38);
    expect(migrateSave({ version: 7, lifeGrazes: 'lots' }, defaultSave()).lifeGrazes).toBe(0);
  });

  it('round-trips a full default save unchanged', () => {
    const s = defaultSave();
    expect(migrateSave(JSON.parse(JSON.stringify(s)), defaultSave())).toEqual(s);
  });

  it('domain-guards a corrupted selectedMode back to the default, preserves a real one', () => {
    expect(migrateSave({ version: 6, selectedMode: 'garbage-not-a-mode' }, defaultSave()).selectedMode).toBe('casual');
    expect(migrateSave({ version: 6, selectedMode: 'nightmare' }, defaultSave()).selectedMode).toBe('nightmare');
  });

  // ── enemy SKINS (cosmetic) — selectedSkins sanitize / migrate round-trip ──
  it('default-fills selectedSkins for an old save (every ported kind → its default)', () => {
    const out = migrateSave({ version: 5, highScore: 1 }, defaultSave());
    expect(out.selectedSkins).toEqual({
      darter: 'darter-default',
      orbiter: 'orbiter-default',
      lancer: 'lancer-default',
      seeker: 'seeker-default',
      warden: 'warden-default',
      // Phase 2a — the 5 remaining bosses are now ported kinds too
      weaver: 'weaver-default',
      beacon: 'beacon-default',
      mirrorblade: 'mirrorblade-default',
      hollow: 'hollow-default',
      sovereign: 'sovereign-default',
      // Phase 2b — the 9 remaining mini-enemies complete the roster
      splitter: 'splitter-default',
      mini: 'mini-default',
      bloomer: 'bloomer-default',
      bomber: 'bomber-default',
      wisp: 'wisp-default',
      drifter: 'drifter-default',
      shade: 'shade-default',
      brooder: 'brooder-default',
      herald: 'herald-default',
    });
  });

  it('preserves an UNLOCKED equipped skin (achievement held)', () => {
    // each non-common skin now has its OWN gate — hold that one to keep the equipped skin
    const gate = skinById('darter-legendary')!.unlockAch!;
    const out = migrateSave(
      { version: 6, achievements: [gate], selectedSkins: { darter: 'darter-legendary' } },
      defaultSave(),
    );
    expect(out.selectedSkins.darter).toBe('darter-legendary');
  });

  it('coerces a LOCKED equipped skin back to the kind default (achievement missing)', () => {
    const out = migrateSave(
      { version: 6, achievements: [], selectedSkins: { darter: 'darter-legendary' } },
      defaultSave(),
    );
    expect(out.selectedSkins.darter).toBe('darter-default');
  });

  it('coerces an unknown id and a wrong-kind id back to the kind default', () => {
    const out = migrateSave(
      {
        version: 6,
        achievements: ['regicide'],
        selectedSkins: { orbiter: 'not-a-skin', lancer: 'darter-legendary' /* wrong kind */ },
      },
      defaultSave(),
    );
    expect(out.selectedSkins.orbiter).toBe('orbiter-default');
    expect(out.selectedSkins.lancer).toBe('lancer-default');
  });

  it('drops unknown kinds and a non-object selectedSkins blob', () => {
    const out = migrateSave(
      // hollow_echo is a summon sub-kind — never a ported/picker kind, so it is dropped
      { version: 6, selectedSkins: { darter: 'darter-default', hollow_echo: 'whatever', junk: 123 } },
      defaultSave(),
    );
    // only the ported kinds survive; hollow_echo/junk are never added
    expect(Object.keys(out.selectedSkins).sort()).toEqual(
      [
        'beacon', 'bloomer', 'bomber', 'brooder', 'darter', 'drifter', 'herald', 'hollow',
        'lancer', 'mini', 'mirrorblade', 'orbiter', 'seeker', 'shade', 'sovereign', 'splitter',
        'warden', 'weaver', 'wisp',
      ],
    );
    expect((out.selectedSkins as Record<string, unknown>).hollow_echo).toBeUndefined();
    // a non-record blob → every kind defaults
    const out2 = migrateSave({ version: 6, selectedSkins: 'corrupt' }, defaultSave());
    expect(out2.selectedSkins.warden).toBe('warden-default');
  });

  it('round-trips a save with an unlocked equipped skin set unchanged', () => {
    const s = defaultSave();
    // hold each equipped non-default skin's OWN gate (per-skin unlocks, not the old shared tiers)
    s.achievements = ['darter-legendary', 'orbiter-epic', 'lancer-rare', 'warden-legendary', 'splitter-epic']
      .map((id) => skinById(id)!.unlockAch!);
    s.selectedSkins = {
      darter: 'darter-legendary',
      orbiter: 'orbiter-epic',
      lancer: 'lancer-rare',
      seeker: 'seeker-default',
      warden: 'warden-legendary',
      // Phase 2a boss kinds are ported too — keep their defaults so the round-trip
      // is over the full ported set (migrate default-fills any missing kind).
      weaver: 'weaver-default',
      beacon: 'beacon-default',
      mirrorblade: 'mirrorblade-default',
      hollow: 'hollow-default',
      sovereign: 'sovereign-default',
      // Phase 2b mini-enemy kinds — defaults (plus one equipped to exercise minis)
      splitter: 'splitter-epic',
      mini: 'mini-default',
      bloomer: 'bloomer-default',
      bomber: 'bomber-default',
      wisp: 'wisp-default',
      drifter: 'drifter-default',
      shade: 'shade-default',
      brooder: 'brooder-default',
      herald: 'herald-default',
    };
    expect(migrateSave(JSON.parse(JSON.stringify(s)), defaultSave())).toEqual(s);
  });
});

describe('migrate — solvedDailyCiphers (additive, no version bump)', () => {
  it('default-fills solvedDailyCiphers to [] for a save that predates it', () => {
    expect(migrateSave({ version: 8, highScore: 1 }, defaultSave()).solvedDailyCiphers).toEqual([]);
  });
  it('coerces a malformed value to []', () => {
    expect(migrateSave({ version: 8, solvedDailyCiphers: 'corrupt' }, defaultSave()).solvedDailyCiphers).toEqual([]);
    expect(migrateSave({ version: 8, solvedDailyCiphers: 42 }, defaultSave()).solvedDailyCiphers).toEqual([]);
  });
  it('preserves valid date strings and dedupes', () => {
    const out = migrateSave(
      { version: 8, solvedDailyCiphers: ['2026-06-20', '2026-06-20', '2026-06-19'] },
      defaultSave(),
    );
    expect(out.solvedDailyCiphers.sort()).toEqual(['2026-06-19', '2026-06-20']);
  });
});

describe('migrate — bombeBranches (D1, additive, no version bump)', () => {
  it('seeds branches from legacy bombeLevel when bombeBranches is absent', () => {
    const out = migrateSave({ bombeLevel: 3 }, defaultSave());
    expect(out.bombeBranches).toEqual({ thrift: 2, speed: 1, insight: 0 });
    expect(out.bombeLevel).toBe(3);
  });
  it('preserves explicit branches and recomputes bombeLevel as their sum', () => {
    const out = migrateSave({ bombeLevel: 0, bombeBranches: { thrift: 1, speed: 2, insight: 3 } }, defaultSave());
    expect(out.bombeBranches).toEqual({ thrift: 1, speed: 2, insight: 3 });
    expect(out.bombeLevel).toBe(6);
  });
  it('default-fills bombeBranches to all zeros for a fresh save', () => {
    const out = migrateSave({}, defaultSave());
    expect(out.bombeBranches).toEqual({ thrift: 0, speed: 0, insight: 0 });
    expect(out.bombeLevel).toBe(0);
  });
  it('clamps negative / fractional branch values to non-negative ints', () => {
    const out = migrateSave({ bombeBranches: { thrift: -2, speed: 1.9, insight: 0 } }, defaultSave());
    expect(out.bombeBranches).toEqual({ thrift: 0, speed: 1, insight: 0 });
    expect(out.bombeLevel).toBe(1);
  });
  it('handles a corrupt bombeBranches blob (non-object)', () => {
    const out = migrateSave({ bombeLevel: 0, bombeBranches: 'corrupt' }, defaultSave());
    expect(out.bombeBranches).toEqual({ thrift: 0, speed: 0, insight: 0 });
  });
});

describe('migrate — BOMBE meta fields (additive)', () => {
  it('defaults the three new fields and survives a missing/garbage blob', () => {
    const d = migrateSave({}, defaultSave());
    expect(d.decryptedWords).toEqual([]);
    expect(d.bombeLevel).toBe(0);
    expect(d.solvedPuzzles).toEqual([]);
    const g = migrateSave({ decryptedWords: 'x', bombeLevel: -3.5, solvedPuzzles: 7 }, defaultSave());
    expect(g.decryptedWords).toEqual([]); // non-array → reset
    expect(g.bombeLevel).toBe(0); // negative/fractional → clamped to 0
    expect(g.solvedPuzzles).toEqual([]);
  });
  it('keeps valid string-array contents (deduped) and a sane bombeLevel', () => {
    const m = migrateSave({ decryptedWords: ['light', 'light', 'dawn'], bombeLevel: 2, solvedPuzzles: ['p1'] }, defaultSave());
    expect(m.decryptedWords.sort()).toEqual(['dawn', 'light']);
    expect(m.bombeLevel).toBe(2);
    expect(m.solvedPuzzles).toEqual(['p1']);
  });
  it('does NOT cap decryptedWords below the full intercept vocabulary (THE LONGEST DAY must be reachable)', () => {
    const vocab = vocabulary();
    expect(vocab.length).toBeGreaterThan(200); // the bug: a 200-cap made 100% impossible
    const m = migrateSave({ decryptedWords: vocab.slice() }, defaultSave());
    expect(m.decryptedWords.length).toBe(vocab.length); // every word survives the load
    expect(masterProgress(m).frac).toBe(1); // 100% master cipher achievable
  });
});

describe('v8 -> v9 (THE LAST WORD vigil fields)', () => {
  it('default-fills vigilSince/released/choiceDate for a v8 save', () => {
    const v8 = { version: 8, highScore: 1234, stillpointChoice: 'catch' };
    const out = migrateSave(v8, defaultSave());
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.version).toBe(10);
    expect(out.highScore).toBe(1234);
    expect(out.vigilSince).toBe(-1);
    expect(out.released).toBe(false);
    expect(out.choiceDate).toBe('');
  });
  it('clamps a hand-edited vigilSince to an integer >= -1', () => {
    const out = migrateSave({ version: 9, vigilSince: 4.7 }, defaultSave());
    expect(out.vigilSince).toBe(4);
    const out2 = migrateSave({ version: 9, vigilSince: -50 }, defaultSave());
    expect(out2.vigilSince).toBe(-1);
    const out3 = migrateSave({ version: 9, vigilSince: 'x' }, defaultSave());
    expect(out3.vigilSince).toBe(-1);
  });
});

describe('v9 -> v10 (THE CITY SPEAKS)', () => {
  it('default-fills citizenDeeds + seenPremiseCard for a v9 save', () => {
    const out = migrateSave({ version: 9, highScore: 5 }, defaultSave());
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.version).toBe(10);
    expect(out.citizenDeeds).toEqual([]);
    expect(out.seenPremiseCard).toBe(false);
  });
  it('sanitizes a hand-edited citizenDeeds to a deduped string[]', () => {
    const out = migrateSave({ version: 10, citizenDeeds: ['a', 'a', 1, 'b'] }, defaultSave());
    expect(out.citizenDeeds.sort()).toEqual(['a', 'b']);
  });
});
