import { describe, it, expect } from 'vitest';
import { signSession, verifySession, SESSION_TTL_MS } from '../worker/src/session';

const SECRET = 'test-secret-please-rotate';

describe('worker session — stateless HMAC', () => {
  it('round-trips a valid token', async () => {
    const exp = 1_000_000 + SESSION_TTL_MS;
    const t = await signSession({ aid: 'acc_1', kind: 'anon', exp }, SECRET);
    const p = await verifySession(t, SECRET, 1_000_000);
    expect(p).toEqual({ aid: 'acc_1', kind: 'anon', exp });
  });
  it('rejects a tampered payload', async () => {
    const t = await signSession({ aid: 'acc_1', kind: 'anon', exp: 9e15 }, SECRET);
    const [body, sig] = t.split('.');
    const forged = `${btoa('{"aid":"admin","kind":"linked","exp":9000000000000}')}.${sig}`;
    expect(await verifySession(forged, SECRET, 0)).toBeNull();
    expect(body.length).toBeGreaterThan(0);
  });
  it('rejects a wrong secret', async () => {
    const t = await signSession({ aid: 'a', kind: 'anon', exp: 9e15 }, SECRET);
    expect(await verifySession(t, 'other-secret', 0)).toBeNull();
  });
  it('rejects an expired token', async () => {
    const t = await signSession({ aid: 'a', kind: 'anon', exp: 500 }, SECRET);
    expect(await verifySession(t, SECRET, 1000)).toBeNull();
  });
  it('rejects malformed / null input without throwing', async () => {
    expect(await verifySession(null, SECRET, 0)).toBeNull();
    expect(await verifySession('garbage', SECRET, 0)).toBeNull();
    expect(await verifySession('a.b.c', SECRET, 0)).toBeNull();
  });
});
