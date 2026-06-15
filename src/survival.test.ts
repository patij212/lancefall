import { describe, it, expect } from 'vitest';
import { consumeShield, regenShield } from './survival';

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
