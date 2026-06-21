// Capture the recent-changes states for the trailer's last act: the profile-avatar cockpit, the
// account/sign-in + avatar picker, THE CHOICE, and the resolved ending. Native 1080p stills.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'panels');
fs.mkdirSync(OUT, { recursive: true });
const W = 1920, H = 1080;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[ending]', ...a);

const server = await createServer({ root: ROOT, logLevel: 'silent', server: { hmr: false, host: '127.0.0.1' } });
await server.listen();
const URL = server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${server.config.server.port}/`;
log('vite @', URL);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--force-color-profile=srgb'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => log('PAGEERR', e.message.slice(0, 100)));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.__lf, null, { timeout: 30000 });
await page.evaluate(async () => {
  const g = window.__lf;
  try { const m = await import('/src/ships.ts'); const S = m.SHIPS || m.default; if (S) g.save.unlockedShips = Object.keys(S); } catch {}
  try { const m = await import('/src/intercepts.ts'); if (m.vocabulary) g.save.decryptedWords = m.vocabulary(); } catch {}
  Object.assign(g.save, { seenSandbox: true, seenTutorial: true, seenIntro: true, shards: 18400, maxHeat: 7, selectedHeat: 4, highScore: 248600, ngPlusLevel: 2 });
  try { g.ui.refreshTitle(g.save); } catch {}
});
await sleep(2400);

// 0) AVATAR GALLERY — render the recent profile-avatar medallions large (the picker is gated behind
//    sign-in, so showcase the art directly: a grid of big animated sigils on a dark field).
try {
  await page.evaluate(async () => {
    const av = await import('/src/render/avatars');
    const ids = (av.AVATAR_IDS || []).slice(0, 12);
    const grid = document.createElement('div');
    grid.id = '__avgrid';
    grid.style.cssText = 'position:fixed;inset:0;z-index:99999;background:radial-gradient(circle at 50% 38%,#10182c,#05060c 70%);display:grid;grid-template-columns:repeat(4,1fr);gap:36px 56px;place-items:center;padding:90px 140px';
    for (const id of ids) { const c = document.createElement('div'); c.innerHTML = av.renderAvatar(id, { size: 150, animated: true }); grid.appendChild(c); }
    document.body.appendChild(grid);
  });
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'avatar_gallery.png') });
  log('✓ avatar_gallery');
  await page.evaluate(() => { const g = document.getElementById('__avgrid'); if (g) g.remove(); });
  await sleep(200);
} catch (e) { log('✗ avatar_gallery', e.message.slice(0, 80)); }

// 1) COCKPIT with the profile AVATAR as the animated logo medallion (force the signed-in look)
try {
  const cool = await page.evaluate(async () => {
    const g = window.__lf;
    const av = await import('/src/render/avatars');
    const ids = av.AVATAR_IDS || [];
    const id = ['sovereign', 'lancefall', 'codebreaker', 'choice'].find((x) => ids.includes(x)) || ids[ids.length - 1] || 'lance';
    g.save.selectedAvatar = id;
    const logo = document.querySelector('.ck-logo');
    if (logo) { logo.innerHTML = av.renderAvatar(id, { size: 100, animated: true }); logo.classList.add('is-avatar'); }
    return id;
  });
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'cockpit_avatar.png') });
  log('✓ cockpit_avatar (' + cool + ')');
} catch (e) { log('✗ cockpit_avatar', e.message.slice(0, 80)); }

// 2) ACCOUNT panel — sign-in options + the avatar picker (the 25 medallions)
try {
  await page.evaluate(() => window.__lf.ui.openAccount && window.__lf.ui.openAccount());
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'account.png') });
  log('✓ account');
  await page.keyboard.press('Escape').catch(() => {}); await sleep(300);
} catch (e) { log('✗ account', e.message.slice(0, 80)); }

const goBase = {
  score: 248600, combo: 91, wave: 15, time: 742, won: true, daily: false, newBest: true,
  highScore: 226340, shardsEarned: 640, dailyBest: 0, pbDelta: 22260, ship: 'THE LAST LANCE',
  perks: 'Long Lance · Chain Reaction · Overdrive Core', mode: 'SOLSTICE PROTOCOL', clearTime: 742,
  hitsTaken: 1, newAchievements: ['SOVEREIGN FELL', 'NO-HIT BOSS'], mutators: [],
};

// 3) THE CHOICE (the halting problem) — the Sovereign-win pending choice
try {
  await page.evaluate((info) => window.__lf.ui.showGameOver(info), { ...goBase, choicePending: true, canReplay: true });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, 'choice2.png') });
  log('✓ choice2');
} catch (e) { log('✗ choice2', e.message.slice(0, 80)); }

// 4) THE CHOICE resolved — the ending + citizen fates
try {
  await page.evaluate(async () => {
    const g = window.__lf;
    let head = 'FIRST LIGHT HELD', line = 'The dawn goes on.';
    try { const sp = await import('/src/stillpoint.ts'); const e = sp.choiceEnding('catch'); head = e.head; line = e.line; } catch {}
    g.ui.resolveChoice && g.ui.resolveChoice(head, line);
  });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, 'resolved.png') });
  log('✓ resolved');
} catch (e) { log('✗ resolved', e.message.slice(0, 80)); }

// 5) SIGNAL RESTORED overlay — a citizen returns (the narrative payoff)
try {
  await page.evaluate(() => window.__lf.ui.signalRestored && window.__lf.ui.signalRestored('THE SIGNAL RETURNS', 'Memory is light-code. As the last cipher breaks, the city remembers its own name — and the people who kept it.', 'A CITIZEN OF LANCEFALL'));
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'signalrestored.png') });
  log('✓ signalrestored');
} catch (e) { log('✗ signalrestored', e.message.slice(0, 80)); }

await browser.close();
await server.close();
log('done →', OUT);
