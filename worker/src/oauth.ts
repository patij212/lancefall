// OAuth (Discord + Google) helpers — PKCE (S256) + a stateless HMAC-signed `state`, the provider
// config, and identity extraction. Pure (Web Crypto only); the routes in index.ts do the network.
// The PKCE verifier + originating account id ride inside the SIGNED state (tamper-proof, no KV).
import { signCompact, verifyCompact } from './session';

export type Provider = 'discord' | 'google';
export function isProvider(s: string): s is Provider { return s === 'discord' || s === 'google'; }

const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function pkceVerifier(): Promise<string> {
  const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return b64url(bytes);
}
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  return b64url(new Uint8Array(digest));
}

export interface StatePayload { aid: string; provider: Provider; ret: string; verifier: string; nonce: string; exp: number }
export async function signState(p: StatePayload, secret: string): Promise<string> { return signCompact(p, secret); }
export async function verifyState(token: string | null, secret: string, now: number, provider: Provider): Promise<StatePayload | null> {
  const p = (await verifyCompact(token, secret)) as StatePayload | null;
  if (!p || typeof p.aid !== 'string' || p.provider !== provider || typeof p.exp !== 'number' || typeof p.verifier !== 'string' || typeof p.ret !== 'string') return null;
  if (now >= p.exp) return null;
  return p;
}

export const PROVIDERS: Record<Provider, { authorize: string; token: string; userinfo: string; scope: string }> = {
  discord: { authorize: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/oauth2/token', userinfo: 'https://discord.com/api/users/@me', scope: 'identify' },
  google:  { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', userinfo: 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid profile' },
};

export function extractIdentity(provider: Provider, json: unknown): { providerId: string; name: string } | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (provider === 'discord') {
    const id = typeof j.id === 'string' ? j.id : '';
    const name = (typeof j.global_name === 'string' && j.global_name) || (typeof j.username === 'string' && j.username) || '';
    return id ? { providerId: id, name: String(name) } : null;
  }
  const sub = typeof j.sub === 'string' ? j.sub : '';
  const name = typeof j.name === 'string' ? j.name : '';
  return sub ? { providerId: sub, name } : null;
}
