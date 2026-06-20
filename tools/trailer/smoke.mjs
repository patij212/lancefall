// Boot-smoke a LANCEFALL build: load the URL, fail on real console errors, confirm the
// game canvas mounts. Filters the known-harmless Cloudflare beacon CSP error.
//   node tools/trailer/smoke.mjs http://localhost:4423/
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:4423/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2500);
const hasCanvas = await page.evaluate(() => !!document.querySelector('#game'));
const lf = await page.evaluate(() => !!(window.__lf));
const bodyTxt = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220));
console.log('CANVAS:', hasCanvas, '| __lf present:', lf);
console.log('BODY SAMPLE:', JSON.stringify(bodyTxt));
const real = errs.filter((e) => !/beacon|cloudflareinsights|cdn-cgi/i.test(e));
console.log('CONSOLE ERRORS (real):', real.length);
real.slice(0, 10).forEach((e) => console.log('  !', e.slice(0, 180)));
await b.close();
process.exit(real.length === 0 && hasCanvas ? 0 : 1);
