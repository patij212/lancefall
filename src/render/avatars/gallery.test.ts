// Gallery emitter (design §8). Writes mockups/avatars-gallery.html for browser
// review — all 24 at full (animated), the 24-up tile grid, and the static
// (reduceMotion) composition. Runs on the TS/Vitest toolchain so it shares the
// game's build. Also a smoke test: asserts the file is written with 24 svgs.

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AVATAR_VISUALS, renderAvatar, type AvatarVisual, type AvatarGroup } from './registry';

const GROUP_LABEL: Record<AvatarGroup, string> = {
  free: 'FREE · THE SIGIL SET',
  boss: 'THE SIX WHO LET IT FALL',
  cipher: 'THE CITY REMEMBERS',
  pilot: 'THE PILOT',
  special: 'FROM THE DEEP',
};

function card(v: AvatarVisual, opts: { variant: 'full' | 'tile'; animated: boolean; size: number; uid: string }): string {
  const svg = renderAvatar(v.id, { variant: opts.variant, animated: opts.animated, size: opts.size, uid: opts.uid });
  return (
    `<figure class="card" style="--accent:${v.accent}">` +
    `<div class="medallion">${svg}</div>` +
    `<figcaption>` +
    `<span class="name">${v.name}</span>` +
    `<span class="meta">TIER ${'I'.repeat(v.tier)} · ${v.motion}</span>` +
    `<span class="hint">${v.unlockHint}</span>` +
    `</figcaption></figure>`
  );
}

function section(title: string, sub: string, body: string): string {
  return `<section><h2>${title}</h2><p class="sub">${sub}</p>${body}</section>`;
}

function groupedCards(opts: { variant: 'full' | 'tile'; animated: boolean; size: number; uidPrefix: string }): string {
  let html = '';
  let lastGroup: AvatarGroup | null = null;
  for (const v of AVATAR_VISUALS) {
    if (v.group !== lastGroup) {
      if (lastGroup !== null) html += '</div>';
      html += `<h3>${GROUP_LABEL[v.group]}</h3><div class="grid">`;
      lastGroup = v.group;
    }
    html += card(v, { variant: opts.variant, animated: opts.animated, size: opts.size, uid: `${opts.uidPrefix}-${v.id}` });
  }
  return html + '</div>';
}

function tileGrid(): string {
  const tiles = AVATAR_VISUALS.map((v) =>
    `<div class="tile" title="${v.name} — ${v.unlockHint}" style="--accent:${v.accent}">` +
    renderAvatar(v.id, { variant: 'tile', size: 76, uid: `tile-${v.id}` }) +
    `</div>`,
  ).join('');
  return `<div class="picker">${tiles}</div>`;
}

function buildHtml(): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>LANCEFALL · Profile Avatars</title>` +
    `<style>` +
    `:root{color-scheme:dark}` +
    `*{box-sizing:border-box}` +
    `body{margin:0;background:radial-gradient(120% 90% at 50% 0%,#0e1730,#03050c 70%);color:#cfe6ee;` +
    `font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:40px 28px 80px}` +
    `header{text-align:center;margin-bottom:36px}` +
    `h1{font-size:22px;letter-spacing:6px;margin:0 0 6px;color:#eafdff}` +
    `header p{margin:0;color:#5d7f8c;letter-spacing:2px;font-size:11px}` +
    `section{max-width:1180px;margin:0 auto 56px}` +
    `h2{font-size:14px;letter-spacing:4px;color:#9bdfe8;border-bottom:1px solid #18303c;padding-bottom:8px}` +
    `.sub{color:#5d7f8c;font-size:11px;letter-spacing:1px;margin:6px 0 22px}` +
    `h3{font-size:11px;letter-spacing:3px;color:#46707f;margin:26px 0 12px}` +
    `.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:18px}` +
    `.card{margin:0;background:#070d18;border:1px solid #14202e;border-radius:14px;padding:16px 12px 14px;` +
    `display:flex;flex-direction:column;align-items:center;text-align:center;transition:border-color .2s}` +
    `.card:hover{border-color:var(--accent)}` +
    `.medallion{width:148px;height:148px;display:flex;align-items:center;justify-content:center}` +
    `.medallion svg{width:148px;height:148px}` +
    `figcaption{margin-top:10px;display:flex;flex-direction:column;gap:3px}` +
    `.name{font-size:12px;letter-spacing:2px;color:var(--accent)}` +
    `.meta{font-size:9.5px;letter-spacing:2px;color:#6c8a96;text-transform:uppercase}` +
    `.hint{font-size:9.5px;color:#46707f;letter-spacing:.5px}` +
    `.picker{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:12px;` +
    `background:#070d18;border:1px solid #14202e;border-radius:14px;padding:18px}` +
    `.tile{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:10px;` +
    `border:1px solid #11202c;background:#05090f}` +
    `.tile:hover{border-color:var(--accent)}` +
    `.tile svg{width:76px;height:76px}` +
    `</style></head><body>` +
    `<header><h1>THE LAST LANCE · PROFILE AVATARS</h1>` +
    `<p>${AVATAR_VISUALS.length} procedural medallions · full + tile · animated + static</p></header>` +
    section('FULL · ANIMATED', 'The focused-preview form — signature motion playing. This is the fidelity bar.',
      groupedCards({ variant: 'full', animated: true, size: 148, uidPrefix: 'full' })) +
    section('PICKER GRID · TILE @ 76px', 'The 24-up lightweight form for the picker grid (static).',
      tileGrid()) +
    section('STATIC · reduceMotion', 'Fully-composed still frame — no <animate> tags, no missing elements, no layout shift.',
      groupedCards({ variant: 'full', animated: false, size: 148, uidPrefix: 'static' })) +
    `</body></html>`
  );
}

describe('avatar gallery', () => {
  it('emits mockups/avatars-gallery.html with every roster medallion', () => {
    const html = buildHtml();
    const outDir = fileURLToPath(new URL('../../../mockups', import.meta.url));
    mkdirSync(outDir, { recursive: true });
    const outFile = fileURLToPath(new URL('../../../mockups/avatars-gallery.html', import.meta.url));
    writeFileSync(outFile, html, 'utf-8');
    // smoke: full + tile + static = 3 svgs per avatar
    expect((html.match(/<svg/g) || []).length).toBe(AVATAR_VISUALS.length * 3);
    expect(html).toContain('THE LANCE');
    expect(html).toContain('THE DROWNED BELL');
  });
});
