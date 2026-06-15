import './fonts'; // self-hosted webfonts (no Google Fonts CDN — see fonts.ts)
import './style.css';
import { Game } from './game';

/** Last-resort overlay shown if boot throws or an uncaught error/rejection escapes the
 *  game loop, so a player (or a jam judge) never meets a blank/frozen black page. Inline-
 *  styled so it works even if the stylesheet failed to load; idempotent (first error wins). */
function showFatalOverlay(detail: string): void {
  if (document.getElementById('lf-fatal')) return;
  const el = document.createElement('div');
  el.id = 'lf-fatal';
  el.setAttribute('role', 'alert');
  el.style.cssText =
    'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:16px;background:#0a0b0f;color:#e8eefc;text-align:center;padding:24px;' +
    "font-family:'Space Grotesk',system-ui,sans-serif;";
  const h = document.createElement('div');
  h.textContent = 'THE SIGNAL DROPPED';
  h.style.cssText = 'font-size:28px;font-weight:700;letter-spacing:0.08em;color:#22d3ee;';
  const p = document.createElement('div');
  p.textContent = 'Something broke while running the game. A reload usually brings the light back.';
  p.style.cssText = 'font-size:15px;color:#9fb0cc;max-width:34ch;line-height:1.5;';
  const btn = document.createElement('button');
  btn.textContent = 'RELOAD';
  btn.style.cssText =
    'margin-top:4px;padding:10px 26px;font:inherit;font-weight:700;letter-spacing:0.06em;cursor:pointer;' +
    'color:#0a0b0f;background:#22d3ee;border:0;border-radius:8px;';
  btn.addEventListener('click', () => location.reload());
  const small = document.createElement('div');
  small.textContent = detail.slice(0, 200);
  small.style.cssText =
    'font-size:11px;color:#5b6b80;font-family:ui-monospace,monospace;max-width:60ch;word-break:break-word;opacity:0.7;';
  el.append(h, p, btn, small);
  (document.body || document.documentElement).appendChild(el);
}

// Net under the whole app: an uncaught error in the rAF loop otherwise freezes the game silently.
window.addEventListener('error', (e) => {
  // Ignore opaque cross-origin "Script error." noise (e.g. the web-font CDN) — not our crash.
  if (!e.error && (!e.message || e.message === 'Script error.')) return;
  showFatalOverlay(String(e.message || e.error));
});
window.addEventListener('unhandledrejection', (e) =>
  showFatalOverlay(String((e as PromiseRejectionEvent).reason ?? 'promise rejection')),
);

try {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root') as HTMLElement | null;
  if (!canvas || !uiRoot) throw new Error('missing #game canvas or #ui-root in the DOM');

  const game = new Game(canvas, uiRoot);
  game.boot();

  // Dev-only debug hook for automated playtesting.
  if (import.meta.env.DEV) {
    (window as unknown as { __lf: Game }).__lf = game;
  }
} catch (err) {
  showFatalOverlay(err instanceof Error ? err.message : String(err));
  console.error('[LANCEFALL] fatal boot error:', err);
}
