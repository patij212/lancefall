// Stateless, signed session tokens for the LANCEFALL account layer. NO KV / no DB read to
// validate — the Worker verifies an HMAC-SHA256 signature locally (cheap, well under the
// 10ms free CPU budget). Token shape: base64url(JSON(payload)) + '.' + base64url(HMAC).
// Uses Web Crypto (crypto.subtle), available in both the Worker runtime and Node 18+ (tests).

export interface SessionPayload {
  aid: string;            // account id
  kind: 'anon' | 'linked';
  exp: number;            // epoch ms; token invalid once now >= exp
}

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days, refreshed each /hello

const enc = new TextEncoder();

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromString(str: string): string {
  return b64urlFromBytes(enc.encode(str));
}
function bytesFromB64url(s: string): Uint8Array | null {
  try {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(pad + '==='.slice((pad.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmac(body: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return new Uint8Array(sig);
}

/** Constant-time compare of two byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signSession(p: SessionPayload, secret: string): Promise<string> {
  const body = b64urlFromString(JSON.stringify(p));
  const sig = b64urlFromBytes(await hmac(body, secret));
  return `${body}.${sig}`;
}

export async function verifySession(token: string | null, secret: string, now: number): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || token.indexOf('.', dot + 1) !== -1) return null; // exactly one dot
  const body = token.slice(0, dot);
  const sigBytes = bytesFromB64url(token.slice(dot + 1));
  if (!sigBytes) return null;
  const expected = await hmac(body, secret);
  if (!timingSafeEqual(sigBytes, expected)) return null;
  const json = bytesFromB64url(body);
  if (!json) return null;
  let p: SessionPayload;
  try {
    p = JSON.parse(new TextDecoder().decode(json));
  } catch {
    return null;
  }
  if (!p || typeof p.aid !== 'string' || (p.kind !== 'anon' && p.kind !== 'linked') || typeof p.exp !== 'number') return null;
  if (now >= p.exp) return null;
  return p;
}
