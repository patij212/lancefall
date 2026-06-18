import { describe, it, expect } from 'vitest';
import { evaluate, ACHIEVEMENTS, skinAchId, achievementById, skinKillProgress } from './achievements';
import type { AchCtx } from './achievements';

const base: AchCtx = {
  score: 0,
  combo: 0,
  wave: 0,
  kills: 0,
  grazes: 0,
  maxDashChain: 0,
  bossKills: 0,
  daily: false,
  won: false,
  modeId: 'endless',
  heat: 0,
  sovereignDown: false,
  overdriveUses: 0,
  lastBreathUses: 0,
  powerupsCollected: 0,
  hitsTaken: 1, // default = took a hit, so the flawless (no-hit) challenges don't fire unless a test sets it to 0
  lifeRuns: 0,
  lifeKills: 0,
  lifeBoss: 0,
  lifeShards: 0,
  lifeKillsByKind: {},
};

describe('achievements', () => {
  it('all ids are unique', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('first blood unlocks on a single kill', () => {
    const got = evaluate([], { ...base, kills: 1 }).map((a) => a.id);
    expect(got).toContain('firstblood');
  });

  it('does not re-award already-unlocked achievements', () => {
    const got = evaluate(['firstblood'], { ...base, kills: 5 }).map((a) => a.id);
    expect(got).not.toContain('firstblood');
  });

  it('skewer requires a 6-kill dash', () => {
    expect(evaluate([], { ...base, maxDashChain: 5 }).map((a) => a.id)).not.toContain('skewer');
    expect(evaluate([], { ...base, maxDashChain: 6 }).map((a) => a.id)).toContain('skewer');
  });

  it('combo tiers gate correctly', () => {
    const ids = evaluate([], { ...base, combo: 50 }).map((a) => a.id);
    expect(ids).toContain('comboist'); // 25
    expect(ids).toContain('annihilator'); // 50
  });

  it('lifetime achievements read lifetime fields', () => {
    expect(evaluate([], { ...base, lifeRuns: 20 }).map((a) => a.id)).toContain('veteran');
    expect(evaluate([], { ...base, lifeShards: 5000 }).map((a) => a.id)).toContain('hoarder');
  });

  it('daily achievement needs a daily run', () => {
    expect(evaluate([], { ...base, daily: true }).map((a) => a.id)).toContain('daily');
    expect(evaluate([], { ...base, daily: false }).map((a) => a.id)).not.toContain('daily');
  });

  it('heat achievements need both the heat level and a meaningful run', () => {
    expect(evaluate([], { ...base, heat: 3, wave: 6 }).map((a) => a.id)).toContain('ignis');
    expect(evaluate([], { ...base, heat: 3, wave: 2 }).map((a) => a.id)).not.toContain('ignis'); // bailed early
    expect(evaluate([], { ...base, heat: 7, won: true }).map((a) => a.id)).toContain('crucible');
    expect(evaluate([], { ...base, heat: 5, wave: 9 }).map((a) => a.id)).not.toContain('crucible');
  });

  it('mode achievements need a win in the right mode', () => {
    expect(evaluate([], { ...base, won: true, modeId: 'arena' }).map((a) => a.id)).toContain('gauntlet');
    expect(evaluate([], { ...base, won: false, modeId: 'arena' }).map((a) => a.id)).not.toContain('gauntlet');
    expect(evaluate([], { ...base, won: true, modeId: 'bossrush' }).map((a) => a.id)).toContain('bossbane');
    expect(evaluate([], { ...base, modeId: 'nightmare', wave: 8 }).map((a) => a.id)).toContain('nightmarewalker');
  });

  it('Sovereign achievements need the final boss down', () => {
    expect(evaluate([], { ...base, sovereignDown: true }).map((a) => a.id)).toContain('regicide');
    expect(evaluate([], { ...base, sovereignDown: false }).map((a) => a.id)).not.toContain('regicide');
    expect(evaluate([], { ...base, sovereignDown: true, heat: 3 }).map((a) => a.id)).toContain('coronation');
    expect(evaluate([], { ...base, sovereignDown: true, heat: 2 }).map((a) => a.id)).not.toContain('coronation');
  });

  it('THE LONGEST DAY per-mode Sovereign flexes need the kill in the right mode', () => {
    expect(evaluate([], { ...base, sovereignDown: true, modeId: 'nightmare' }).map((a) => a.id)).toContain('daybreakdark');
    expect(evaluate([], { ...base, sovereignDown: true, modeId: 'casual' }).map((a) => a.id)).not.toContain('daybreakdark');
    expect(evaluate([], { ...base, sovereignDown: true, modeId: 'longestday' }).map((a) => a.id)).toContain('codebroken');
    expect(evaluate([], { ...base, sovereignDown: false, modeId: 'nightmare' }).map((a) => a.id)).not.toContain('daybreakdark');
  });

  it('v4 mechanic achievements track OVERDRIVE / Last Breath / power-ups', () => {
    expect(evaluate([], { ...base, overdriveUses: 1 }).map((a) => a.id)).toContain('unleashed');
    expect(evaluate([], { ...base, overdriveUses: 3 }).map((a) => a.id)).not.toContain('overcharged');
    expect(evaluate([], { ...base, overdriveUses: 4 }).map((a) => a.id)).toContain('overcharged');
    expect(evaluate([], { ...base, lastBreathUses: 1, wave: 2 }).map((a) => a.id)).toContain('lastbreath'); // used it AND survived
    expect(evaluate([], { ...base, lastBreathUses: 1, wave: 1 }).map((a) => a.id)).not.toContain('lastbreath'); // used it then died same wave → no misfire
    expect(evaluate([], { ...base, powerupsCollected: 5 }).map((a) => a.id)).toContain('powerplayer');
    expect(evaluate([], { ...base, powerupsCollected: 4 }).map((a) => a.id)).not.toContain('powerplayer');
  });

  it('§3.4 no-hit CHALLENGE unlocks need a clean (hitsTaken 0) clear in the right mode', () => {
    // a normal win that took a hit does NOT grant the flawless variant
    expect(evaluate([], { ...base, won: true, modeId: 'arena', hitsTaken: 2 }).map((a) => a.id)).not.toContain('flawlessgauntlet');
    // a no-hit Arena win does — and still earns the base clear too
    const arena = evaluate([], { ...base, won: true, modeId: 'arena', hitsTaken: 0 }).map((a) => a.id);
    expect(arena).toContain('flawlessgauntlet');
    expect(arena).toContain('gauntlet');
    // a no-hit Boss Rush clear
    expect(evaluate([], { ...base, won: true, modeId: 'bossrush', hitsTaken: 0 }).map((a) => a.id)).toContain('pristine');
    // a flawless Sovereign kill — the ultimate, any mode
    expect(evaluate([], { ...base, sovereignDown: true, hitsTaken: 0 }).map((a) => a.id)).toContain('flawlesskey');
    expect(evaluate([], { ...base, sovereignDown: true, hitsTaken: 1 }).map((a) => a.id)).not.toContain('flawlesskey');
  });
});

describe('SKIN unlock achievements', () => {
  it('per-enemy kill ladders fire off the lifetime CODEX tally', () => {
    // Lancer Hunter (Rare) at 25 lifetime Lancer kills; not before
    expect(evaluate([], { ...base, lifeKillsByKind: { lancer: 24 } }).map((a) => a.id)).not.toContain('skin-lancer-rare');
    expect(evaluate([], { ...base, lifeKillsByKind: { lancer: 25 } }).map((a) => a.id)).toContain('skin-lancer-rare');
    // a rarer enemy has a lower legendary bar (Herald = 220)
    expect(evaluate([], { ...base, lifeKillsByKind: { herald: 220 } }).map((a) => a.id)).toContain('skin-herald-legendary');
  });

  it('boss skin ladders fire off lifetime boss fellings (Rare = the first kill)', () => {
    expect(evaluate([], { ...base, lifeKillsByKind: { warden: 1 } }).map((a) => a.id)).toContain('skin-warden-rare');
    expect(evaluate([], { ...base, lifeKillsByKind: { warden: 3 } }).map((a) => a.id)).not.toContain('skin-warden-epic'); // needs 4
    expect(evaluate([], { ...base, lifeKillsByKind: { weaver: 12 } }).map((a) => a.id)).toContain('skin-weaver-legendary');
  });

  it('showcase ladders reuse the fitting general achievement as one rung', () => {
    // Darter = dash chain: skewer (6) is the Rare rung; 8 and 10 are new
    expect(skinAchId('darter', 'rare')).toBe('skewer');
    expect(evaluate([], { ...base, maxDashChain: 8 }).map((a) => a.id)).toContain('skin-darter-epic');
    // Orbiter = graze: grazer (50) is the Epic rung
    expect(skinAchId('orbiter', 'epic')).toBe('grazer');
    // Sovereign reuses its three marquee feats
    expect(skinAchId('sovereign', 'rare')).toBe('regicide');
    expect(skinAchId('sovereign', 'epic')).toBe('coronation');
    expect(skinAchId('sovereign', 'legendary')).toBe('flawlesskey');
  });

  it('skinAchId: Common is free (null); every other gate resolves to a real achievement', () => {
    expect(skinAchId('darter', 'common')).toBeNull();
    for (const kind of ['darter', 'orbiter', 'lancer', 'seeker', 'warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign', 'splitter', 'mini', 'bloomer', 'bomber', 'wisp', 'drifter', 'shade', 'brooder', 'herald']) {
      for (const rarity of ['rare', 'epic', 'legendary']) {
        const id = skinAchId(kind, rarity);
        expect(id).not.toBeNull();
        expect(achievementById(id!)).toBeDefined();
      }
    }
  });

  it('all achievement ids stay unique after folding in the skin gates', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('skinKillProgress reports have/need for lifetime kill gates, null for the rest', () => {
    // per-enemy kill ladder — reads the live tally against the tier threshold
    expect(skinKillProgress('skin-lancer-rare', { lancer: 10 })).toEqual({ have: 10, need: 25 });
    expect(skinKillProgress('skin-lancer-legendary', { lancer: 10 })).toEqual({ have: 10, need: 450 });
    // boss ladder
    expect(skinKillProgress('skin-warden-epic', { warden: 2 })).toEqual({ have: 2, need: 4 });
    // missing kind → 0 progress (not a crash)
    expect(skinKillProgress('skin-herald-legendary', {})).toEqual({ have: 0, need: 220 });
    // per-run feats and reused event achievements have no accumulating progress → null
    expect(skinKillProgress('skin-darter-epic', { darter: 999 })).toBeNull(); // dash feat
    expect(skinKillProgress('skewer', { darter: 999 })).toBeNull(); // reused
    expect(skinKillProgress('regicide', { sovereign: 5 })).toBeNull(); // reused Sovereign feat
    expect(skinKillProgress('not-a-gate', {})).toBeNull();
  });
});
