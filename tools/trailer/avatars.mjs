// Capture ALL profile-avatar sigils, FULLY ANIMATED, as a video clip (SMIL animations run on the
// document timeline, so this is a real-time screencast — fine for the slow medallion pulses).
//   node tools/trailer/avatars.mjs   →   tools/trailer/mp4/avatars.mp4
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TMP = path.join(__dirname, 'vidtmp');
const OUT = path.join(__dirname, 'mp4', 'avatars.mp4');
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const W = 1920, H = 1080;

const server = await createServer({ root: ROOT, logLevel: 'silent', server: { hmr: false, host: '127.0.0.1' } });
await server.listen();
const URL = server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${server.config.server.port}/`;
console.log('[avatars] vite @', URL);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--force-color-profile=srgb'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: TMP, size: { width: W, height: H } } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[avatars] PAGEERR', e.message.slice(0, 100)));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.__lf, null, { timeout: 30000 });
const n = await page.evaluate(async () => {
  const av = await import('/src/render/avatars');
  const ids = (av.AVATAR_IDS || []).slice(0, 24); // 24 → an even 6×4 grid
  const grid = document.createElement('div');
  grid.style.cssText = 'position:fixed;inset:0;z-index:99999;background:radial-gradient(circle at 50% 42%,#101a30,#04060c 72%);display:grid;grid-template-columns:repeat(6,1fr);grid-template-rows:repeat(4,1fr);gap:18px 30px;place-items:center;padding:80px 110px';
  for (const id of ids) { const c = document.createElement('div'); c.innerHTML = av.renderAvatar(id, { size: 132, animated: true }); grid.appendChild(c); }
  document.body.appendChild(grid);
  return ids.length;
});
console.log('[avatars] rendered', n, 'animated sigils');
await page.waitForTimeout(8000); // record the animation
const video = page.video();
await ctx.close();
const webm = await video.path();
await browser.close();
await server.close();
// convert to an mp4 clip the editor can use
execSync(`ffmpeg -y -loglevel error -i "${webm}" -c:v libx264 -crf 18 -pix_fmt yuv420p -an "${OUT}"`, { stdio: ['ignore', 'pipe', 'pipe'] });
fs.rmSync(TMP, { recursive: true, force: true });
console.log('[avatars] ✓', OUT, `(${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB, ${execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${OUT}"`).toString().trim()}s)`);
