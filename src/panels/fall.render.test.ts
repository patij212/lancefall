// @vitest-environment happy-dom
// Render smoke for THE FALL tab's new sections — "THE SIXTH" accretion + "YOUR LANCEFALL" record.
// Both are pure save -> DOM; this catches null-derefs / empty-state regressions the type-checker can't.
import { describe, it, expect } from 'vitest';
import { defaultSave } from '../save';
import { vocabulary } from '../intercepts';
import { SIXTH_THESIS, SIXTH_UNWOKEN_PULL, SIXTH_DEEPEST } from '../ending';
import { renderTheSixth, renderYourLancefall } from './fall';

describe('renderTheSixth — accreting confession list (the Sixth)', () => {
  it('fresh save: the thesis + the unwoken pull, no faces, no deepest line', () => {
    const box = renderTheSixth(defaultSave());
    expect(box.textContent).toContain(SIXTH_THESIS);
    expect(box.querySelectorAll('.sixth-row').length).toBe(0);
    expect(box.textContent).toContain(SIXTH_UNWOKEN_PULL);
    expect(box.querySelector('.sixth-deepest')).toBeNull();
  });
  it('100% remembered: all 16 faces named, no pull, the deepest line', () => {
    const s = defaultSave();
    s.decryptedWords = vocabulary();
    const box = renderTheSixth(s);
    expect(box.querySelectorAll('.sixth-row').length).toBe(16);
    expect(box.querySelector('.sixth-pull')).toBeNull();
    expect(box.textContent).toContain(SIXTH_DEEPEST);
  });
});

describe('renderYourLancefall — the permanent choice record', () => {
  it('no choice yet: the pending prompt', () => {
    const box = renderYourLancefall(defaultSave());
    expect(box.querySelector('.yl-pending')).toBeTruthy();
    expect(box.textContent).toContain('The last word is unread');
  });
  it('holding the light: the verb, days held, date, and woken count', () => {
    const s = defaultSave();
    s.stillpointChoice = 'catch';
    s.vigilSince = 5;
    s.totalRuns = 12; // days held = 12 - 5 = 7
    s.choiceDate = '2026-06-20';
    const box = renderYourLancefall(s);
    expect(box.textContent).toContain('YOU HOLD THE LIGHT');
    expect(box.textContent).toContain('Day held: 7');
    expect(box.textContent).toContain('2026-06-20');
    expect(box.textContent).toContain('/16 remembered');
  });
  it('let it go (released after a Vigil): the finished record', () => {
    const s = defaultSave();
    s.stillpointChoice = 'fall';
    s.released = true;
    s.choiceDate = '2026-06-20';
    const box = renderYourLancefall(s);
    expect(box.textContent).toContain('YOU LET IT GO');
    expect(box.textContent).toContain('It is finished');
  });
  it('let it go DIRECTLY at the kill (fall, never held): finished, with no "holding" contradiction', () => {
    const s = defaultSave();
    s.stillpointChoice = 'fall';
    s.released = false; // chose FALL at the Sovereign kill — never entered the Vigil
    s.choiceDate = '2026-06-20';
    const box = renderYourLancefall(s);
    expect(box.textContent).toContain('YOU LET IT GO');
    expect(box.textContent).toContain('It is finished');
    expect(box.textContent).not.toContain('You hold the longest day');
    expect(box.textContent).not.toContain('Day held');
  });
});
