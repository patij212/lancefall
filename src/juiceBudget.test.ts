import { describe, it, expect } from 'vitest';
import { JuiceBudget } from './juiceBudget';

describe('JuiceBudget — per-frame screen-wide effect coordination', () => {
  it('grants each channel exactly once per frame', () => {
    const b = new JuiceBudget();
    b.beginFrame();
    expect(b.claimShakeSpike()).toBe(true);
    expect(b.claimShakeSpike()).toBe(false); // redundant jolt suppressed
    expect(b.claimSlowmoSnap()).toBe(true);
    expect(b.claimSlowmoSnap()).toBe(false); // stutter suppressed
    expect(b.claimBigFlash()).toBe(true);
    expect(b.claimBigFlash()).toBe(false); // wash-out suppressed
  });

  it('channels are independent — claiming one does not consume another', () => {
    const b = new JuiceBudget();
    b.beginFrame();
    expect(b.claimShakeSpike()).toBe(true);
    expect(b.claimSlowmoSnap()).toBe(true); // not consumed by the shake claim
    expect(b.claimBigFlash()).toBe(true);
  });

  it('beginFrame re-arms every channel for the next frame', () => {
    const b = new JuiceBudget();
    b.beginFrame();
    b.claimShakeSpike();
    b.claimSlowmoSnap();
    b.claimBigFlash();
    b.beginFrame();
    expect(b.claimShakeSpike()).toBe(true);
    expect(b.claimSlowmoSnap()).toBe(true);
    expect(b.claimBigFlash()).toBe(true);
  });

  it('a fresh budget (no beginFrame yet) still starts un-claimed', () => {
    const b = new JuiceBudget();
    expect(b.claimShakeSpike()).toBe(true);
    expect(b.claimSlowmoSnap()).toBe(true);
    expect(b.claimBigFlash()).toBe(true);
  });
});
