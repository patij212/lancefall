import { describe, it, expect } from 'vitest';
import { consumeShield, regenShield, runShields } from './survival';

describe('ARMOR shield buffer', () => {
  it('consumeShield spends a shield and survives while any remain', () => {
    expect(consumeShield(2)).toEqual({ survived: true, shields: 1 });
    expect(consumeShield(1)).toEqual({ survived: true, shields: 0 });
  });

  it('consumeShield at 0 does not survive and never goes negative', () => {
    expect(consumeShield(0)).toEqual({ survived: false, shields: 0 });
  });

  it('regenShield restores one shield, capped at max', () => {
    expect(regenShield(0, 2)).toBe(1);
    expect(regenShield(1, 2)).toBe(2);
    expect(regenShield(2, 2)).toBe(2); // capped — never overfills
    expect(regenShield(0, 0)).toBe(0); // a shields-off run can't regen into existence
  });
});

describe('runShields — mode-adjusted run ARMOR count', () => {
  it('passes the (Heat-stripped) base through for a standard mode', () => {
    expect(runShields(2)).toBe(2);
    expect(runShields(2, {})).toBe(2);
    expect(runShields(0, {})).toBe(0);
  });

  it('NIGHTMARE sudden death strips the cushion to 0', () => {
    expect(runShields(2, { suddenDeath: { afterBoss: 1 } })).toBe(0);
    expect(runShields(5, { suddenDeath: {} })).toBe(0);
  });

  it('CASUAL grants its cushion on top of the base', () => {
    expect(runShields(2, { casualShields: 6 })).toBe(8);
    expect(runShields(0, { casualShields: 6 })).toBe(6); // base stripped by Heat, cushion still lands
  });

  it('never returns a negative count', () => {
    expect(runShields(-3)).toBe(0);
    expect(runShields(-3, { casualShields: 2 })).toBe(2); // base floored to 0 before the cushion adds
  });
});
