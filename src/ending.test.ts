// src/ending.test.ts — THE LAST WORD. Tests for the single-source ending module.
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { choiceEnding, CHOICE_TAIL, choiceTail } from './ending';

describe('choiceEnding (single source)', () => {
  it('keeps the test-asserted heads verbatim', () => {
    expect(choiceEnding('catch').head).toBe('THE LIGHT HOLDS');
    expect(choiceEnding('fall').head).toBe('THE LIGHT RELEASED');
    expect(choiceEnding('catch').line.length).toBeGreaterThan(20);
    expect(choiceEnding('fall').line.length).toBeGreaterThan(20);
    expect(choiceEnding('none').head).toBe('THE LIGHT HOLDS');
  });
});

describe('choiceTail (moved from intercepts)', () => {
  it('is null until a choice is made, then the chosen tail', () => {
    const s = defaultSave();
    expect(choiceTail(s)).toBeNull();
    s.stillpointChoice = 'catch';
    expect(choiceTail(s)).toBe(CHOICE_TAIL.catch);
    s.stillpointChoice = 'fall';
    expect(choiceTail(s)).toBe(CHOICE_TAIL.fall);
  });
});

import { lastWordResolved, LAST_WORD_PLACEHOLDER } from './ending';
import { vocabulary, isLongestDay, masterProgress } from './intercepts';

describe('THE LAST WORD (display-only, outside the cipher)', () => {
  it('resolves only after a choice; placeholder is a non-empty glyph', () => {
    const s = defaultSave();
    expect(LAST_WORD_PLACEHOLDER.length).toBeGreaterThan(0);
    expect(lastWordResolved(s)).toBeNull();
    s.stillpointChoice = 'catch';
    expect(lastWordResolved(s)).toBe('HELD');
    s.stillpointChoice = 'fall';
    expect(lastWordResolved(s)).toBe('RELEASED');
  });
  it('does NOT enter the cipher vocabulary — 100% stays reachable without choosing', () => {
    const before = vocabulary().length;
    const s = defaultSave();
    s.decryptedWords = vocabulary();
    expect(isLongestDay(s)).toBe(true);          // remembered everything, never chose
    expect(masterProgress(s).frac).toBe(1);
    s.stillpointChoice = 'catch';                 // choosing never grows the cipher
    expect(vocabulary().length).toBe(before);
  });
});

import { sixthReveal, SIXTH_THESIS } from './ending';
import { CITIZENS } from './citizens';

describe('THE SIXTH — never gated, scales with woken citizens', () => {
  it('fires for everyone (thesis always present), with no faces on a fresh save', () => {
    const s = defaultSave();
    const r = sixthReveal(s);
    expect(r.thesis).toBe(SIXTH_THESIS);
    expect(r.faces).toHaveLength(0);
    expect(r.unwokenPull).not.toBeNull();   // 16 still grey → the gentle pull
    expect(r.deepest).toBeNull();           // not 100%
  });
  it('names the citizens you woke, and shows the deepest line only at 100%', () => {
    const s = defaultSave();
    s.decryptedWords = vocabulary();         // remembered everything → all 16 woken
    const r = sixthReveal(s);
    expect(r.faces.length).toBe(CITIZENS.length);
    expect(r.faces[0]).toHaveProperty('name');
    expect(r.faces[0]).toHaveProperty('line');
    expect(r.unwokenPull).toBeNull();        // none left grey
    expect(r.deepest).not.toBeNull();        // the bottom of the well
  });
});

import { daysHeld, vigilStage, vigilBeat, canRelease, VIGIL_PERMISSION_THRESHOLD } from './ending';

function holding(totalRuns: number, vigilSince: number) {
  const s = defaultSave();
  s.stillpointChoice = 'catch';
  s.totalRuns = totalRuns;
  s.vigilSince = vigilSince;
  return s;
}

describe('THE VIGIL — defiance → wistful → permission', () => {
  it('daysHeld is 0 unless actively holding', () => {
    const s = defaultSave();               // 'none'
    expect(daysHeld(s)).toBe(0);
    expect(daysHeld(holding(5, 2))).toBe(3);
  });
  it('stages by days held', () => {
    expect(vigilStage(1)).toBe('defiance');
    expect(vigilStage(3)).toBe('defiance');
    expect(vigilStage(4)).toBe('wistful');
    expect(vigilStage(10)).toBe('wistful');
    expect(vigilStage(VIGIL_PERMISSION_THRESHOLD)).toBe('permission');
    expect(vigilStage(99)).toBe('permission');
  });
  it('vigilBeat is null unless holding (and after release)', () => {
    expect(vigilBeat(defaultSave())).toBeNull();
    const b = vigilBeat(holding(13, 2));
    expect(b?.stage).toBe('permission');
    expect(b?.line.length).toBeGreaterThan(10);
  });
  it('canRelease only at/after the permission threshold, and not once released', () => {
    expect(canRelease(holding(2 + VIGIL_PERMISSION_THRESHOLD - 1, 2))).toBe(false); // held 10
    const ready = holding(2 + VIGIL_PERMISSION_THRESHOLD, 2);                       // held 11
    expect(canRelease(ready)).toBe(true);
    ready.released = true;
    expect(canRelease(ready)).toBe(false);
  });
});

import { completionEpilogue } from './ending';

describe('THE COMPLETION — citizen fates per choice', () => {
  it('names every woken citizen with the choice-appropriate fate', () => {
    const s = defaultSave();
    s.decryptedWords = vocabulary();          // all 16 woken
    const rel = completionEpilogue(s, 'fall');
    const hold = completionEpilogue(s, 'catch');
    expect(rel).toHaveLength(16);
    expect(hold).toHaveLength(16);
    // the Vintner payoff: release opens the wine; hold leaves it uncorked-forever
    const vRel = rel.find((f) => f.name === 'The Vintner')!;
    const vHold = hold.find((f) => f.name === 'The Vintner')!;
    expect(vRel.line).toMatch(/opened/i);
    expect(vHold.line).not.toBe(vRel.line);
  });
  it('only names the citizens actually woken', () => {
    const s = defaultSave();                   // none woken
    expect(completionEpilogue(s, 'fall')).toHaveLength(0);
  });
});

describe('determinism invariants (THE LAST WORD never perturbs the seeded sim)', () => {
  it('ending.ts source does not import the rng module', async () => {
    // ending.ts is pure-over-save; importing ./rng would risk a sim-perturbing draw.
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('./ending.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from ['"]\.\/rng['"]/);
  });
  it('a vigil run does not change the cipher (vocabulary stable) or master progress', () => {
    const before = vocabulary().length;
    const s = defaultSave();
    s.decryptedWords = vocabulary();
    s.stillpointChoice = 'catch';
    s.vigilSince = 0;
    s.totalRuns = 50;                         // 50 vigil runs later
    expect(vocabulary().length).toBe(before); // the cipher never grows
    expect(masterProgress(s).frac).toBe(1);   // decryption is choice-independent
    expect(lastWordResolved(s)).toBe('HELD');
  });
});
