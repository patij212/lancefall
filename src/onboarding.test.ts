import { describe, it, expect } from 'vitest';
import {
  ONBOARDING,
  ONBOARDING_STEPS,
  hintFor,
  beatTeachState,
  BEAT_HINT_TEXT,
  FIRST_DASH_PROMPT,
  VERB_TEACHES,
  ENEMY_READS,
  BOSS_READS,
  shouldTeach,
  verbTeachFor,
  enemyReadFor,
  bossReadFor,
  enemyReadKey,
  bossReadKey,
} from './onboarding';
import type { OnboardTrigger, TeachTrigger } from './onboarding';
import { ONBOARD } from './tune';

describe('onboarding sequence', () => {
  it('steps are 0..N-1 in order with distinct triggers in sequence', () => {
    ONBOARDING.forEach((h, i) => expect(h.step).toBe(i));
    expect(ONBOARDING_STEPS).toBe(ONBOARDING.length);
  });

  it('only the current step’s trigger advances; others are ignored', () => {
    // at step 0 only "start" matches
    expect(hintFor(0, 'start')?.step).toBe(0);
    expect(hintFor(0, 'kill')).toBeNull();
    expect(hintFor(0, 'dash')).toBeNull();
    // at step 1 only "dash" matches
    expect(hintFor(1, 'dash')?.step).toBe(1);
    expect(hintFor(1, 'comboBreak')).toBeNull();
  });

  it('walking the triggers in order completes the sequence exactly once', () => {
    const order: OnboardTrigger[] = ['start', 'dash', 'kill', 'comboBreak'];
    let step = 0;
    const shown: string[] = [];
    for (const t of order) {
      const h = hintFor(step, t);
      if (h) {
        shown.push(h.text);
        step++;
      }
    }
    expect(step).toBe(ONBOARDING_STEPS);
    expect(shown.length).toBe(ONBOARDING_STEPS);
    // past the end, nothing more fires
    expect(hintFor(step, 'kill')).toBeNull();
  });
});

describe('C5 beatTeachState (teach dash-on-the-beat)', () => {
  it('shows the ring + hint for the first runs, then retires at the cap', () => {
    expect(beatTeachState(0, 3, 3)).toEqual({ ring: true, hint: true });
    expect(beatTeachState(2, 3, 3)).toEqual({ ring: true, hint: true });
    expect(beatTeachState(3, 3, 3)).toEqual({ ring: false, hint: false }); // retired at the cap
    expect(beatTeachState(10, 3, 3)).toEqual({ ring: false, hint: false });
  });
  it('the hint text is non-empty and mentions the beat', () => {
    expect(BEAT_HINT_TEXT.length).toBeGreaterThan(0);
    expect(BEAT_HINT_TEXT.toLowerCase()).toContain('beat');
  });
});

describe('Grid B — first-run dash teaching', () => {
  it('the prominent first prompt teaches the core verb (hold + release = dash)', () => {
    const lower = FIRST_DASH_PROMPT.toLowerCase();
    expect(FIRST_DASH_PROMPT.length).toBeGreaterThan(0);
    expect(lower).toContain('hold');
    expect(lower).toContain('release');
    expect(lower).toContain('dash');
  });

  it('the no-fail opening grace is a positive, bounded wall-clock window', () => {
    // a pure time gate — long enough to learn the dash, short enough not to trivialise the run
    expect(ONBOARD.firstRunGrace).toBeGreaterThan(0);
    expect(ONBOARD.firstRunGrace).toBeLessThanOrEqual(8);
  });
});

// ── ACT TWO — persisted, just-in-time teaching of the deeper game ──────────────
describe('act-two persisted teach gate (shouldTeach)', () => {
  it('a key not in the taught set should teach; one already in it should not', () => {
    expect(shouldTeach('verb:heavy', [])).toBe(true);
    expect(shouldTeach('verb:heavy', ['verb:heavy'])).toBe(false);
    expect(shouldTeach('enemy:darter', ['verb:heavy', 'enemy:darter'])).toBe(false);
  });
});

describe('act-two verb teaches (contextual, once-ever)', () => {
  it('has exactly the three depth verbs with the expected triggers', () => {
    const byTrigger = new Map<TeachTrigger, string>(VERB_TEACHES.map((t) => [t.trigger, t.key]));
    expect(byTrigger.get('fullCharge')).toBe('verb:heavy');
    expect(byTrigger.get('parryable')).toBe('verb:parry');
    expect(byTrigger.get('onBeatAction')).toBe('verb:coherence');
  });

  it('every verb teach has a unique key and a non-empty line', () => {
    const keys = VERB_TEACHES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of VERB_TEACHES) expect(t.text.trim().length).toBeGreaterThan(0);
  });

  it('the HEAVY line teaches holding past full; the COHERENCE line names the beat', () => {
    expect(verbTeachFor('fullCharge', [])?.text.toLowerCase()).toContain('heavy');
    expect(verbTeachFor('onBeatAction', [])?.text.toLowerCase()).toContain('beat');
  });

  it('verbTeachFor returns the line for an untaught trigger, then null once taught', () => {
    const first = verbTeachFor('fullCharge', []);
    expect(first?.key).toBe('verb:heavy');
    expect(verbTeachFor('fullCharge', ['verb:heavy'])).toBeNull();
  });
});

describe('act-two enemy reads (first-sighting, once-ever)', () => {
  it('covers the six reworked enemies with non-empty reads', () => {
    for (const k of ['darter', 'splitter', 'bomber', 'shade', 'brooder', 'wisp']) {
      expect(ENEMY_READS[k]?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('keys an enemy read as enemy:<kind> and gates it on the taught set', () => {
    expect(enemyReadKey('splitter')).toBe('enemy:splitter');
    const hit = enemyReadFor('splitter', []);
    expect(hit?.key).toBe('enemy:splitter');
    expect(hit?.text).toBe(ENEMY_READS.splitter);
    expect(enemyReadFor('splitter', ['enemy:splitter'])).toBeNull();
  });

  it('returns null for an enemy kind with no authored read (e.g. plain drifter)', () => {
    expect(enemyReadFor('drifter', [])).toBeNull();
  });
});

describe('act-two boss reads (on-arrival, once-ever)', () => {
  it('covers every boss with a non-empty read', () => {
    for (const k of ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign']) {
      expect(BOSS_READS[k]?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('keys a boss read as boss:<kind> and gates it on the taught set', () => {
    expect(bossReadKey('warden')).toBe('boss:warden');
    const hit = bossReadFor('warden', []);
    expect(hit?.key).toBe('boss:warden');
    expect(hit?.text).toBe(BOSS_READS.warden);
    expect(bossReadFor('warden', ['boss:warden'])).toBeNull();
  });

  it('the Sovereign read names the cores; the Mirrorblade read names the parry', () => {
    expect(BOSS_READS.sovereign.toLowerCase()).toContain('core');
    expect(BOSS_READS.mirrorblade.toLowerCase()).toContain('parry');
  });

  it('returns null for an unknown boss kind', () => {
    expect(bossReadFor('not_a_boss', [])).toBeNull();
  });
});
