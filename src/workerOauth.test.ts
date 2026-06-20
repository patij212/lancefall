import { describe, it, expect } from 'vitest';
import { pkceVerifier, pkceChallenge, signState, verifyState, PROVIDERS, isProvider, extractIdentity } from '../worker/src/oauth';

const SECRET = 'oauth-test-secret';

describe('oauth — PKCE (S256)', () => {
  it('challenge is the base64url SHA-256 of the verifier (RFC 7636 test vector)', async () => {
    // RFC 7636 Appendix B verifier → challenge
    const v = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(await pkceChallenge(v)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('verifier is 43 url-safe chars', async () => {
    const v = await pkceVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('oauth — signed state', () => {
  const base = { aid: 'acc_1', provider: 'discord' as const, ret: 'https://lancefall.pages.dev', verifier: 'v', nonce: 'n' };
  it('round-trips when valid + provider matches', async () => {
    const t = await signState({ ...base, exp: 5000 }, SECRET);
    expect(await verifyState(t, SECRET, 1000, 'discord')).toMatchObject({ aid: 'acc_1', provider: 'discord' });
  });
  it('rejects a tampered/expired/wrong-secret/wrong-provider state', async () => {
    const t = await signState({ ...base, exp: 5000 }, SECRET);
    expect(await verifyState(t, 'other', 1000, 'discord')).toBeNull();
    expect(await verifyState(t, SECRET, 9999, 'discord')).toBeNull();       // expired
    expect(await verifyState(t, SECRET, 1000, 'google')).toBeNull();        // provider mismatch
    expect(await verifyState('garbage', SECRET, 1000, 'discord')).toBeNull();
    expect(await verifyState(null, SECRET, 1000, 'discord')).toBeNull();
  });
});

describe('oauth — providers + identity', () => {
  it('has discord + google config with the required URLs', () => {
    for (const p of ['discord', 'google'] as const) {
      expect(PROVIDERS[p].authorize).toMatch(/^https:\/\//);
      expect(PROVIDERS[p].token).toMatch(/^https:\/\//);
      expect(PROVIDERS[p].userinfo).toMatch(/^https:\/\//);
      expect(PROVIDERS[p].scope.length).toBeGreaterThan(0);
    }
    expect(isProvider('discord')).toBe(true);
    expect(isProvider('nope')).toBe(false);
  });
  it('extracts a stable id + name per provider', () => {
    expect(extractIdentity('discord', { id: '123', global_name: 'Ace', username: 'ace#0' })).toEqual({ providerId: '123', name: 'Ace' });
    expect(extractIdentity('discord', { id: '123', username: 'ace' })).toEqual({ providerId: '123', name: 'ace' });
    expect(extractIdentity('google', { sub: 'g-9', name: 'Bea' })).toEqual({ providerId: 'g-9', name: 'Bea' });
    expect(extractIdentity('discord', { username: 'noid' })).toBeNull();
    expect(extractIdentity('google', {})).toBeNull();
  });
});
