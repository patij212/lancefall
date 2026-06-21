// Render the trailer's lower-third captions + end/title cards as transparent 1920x1080 PNGs,
// in LANCEFALL's brand fonts (Orbitron / Rajdhani / Space Grotesk). Cinematic lower-third:
// a soft bottom scrim for legibility, a branded ◈ kicker with an accent rule, refined type.
//   node tools/trailer/captions.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const ASSETS = path.join(__dirname, 'assets');
fs.mkdirSync(ASSETS, { recursive: true });

const W = 1920, H = 1080;
const fontDir = (f) => path.join(ROOT, 'node_modules', '@fontsource', f, 'files');
const uri = (p) => 'data:font/woff2;base64,' + fs.readFileSync(p).toString('base64');
const FONTS = `
@font-face{font-family:'Orbitron';font-weight:800;src:url('${uri(path.join(fontDir('orbitron'), 'orbitron-latin-800-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Orbitron';font-weight:900;src:url('${uri(path.join(fontDir('orbitron'), 'orbitron-latin-900-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Rajdhani';font-weight:600;src:url('${uri(path.join(fontDir('rajdhani'), 'rajdhani-latin-600-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Rajdhani';font-weight:700;src:url('${uri(path.join(fontDir('rajdhani'), 'rajdhani-latin-700-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Space Grotesk';font-weight:400;src:url('${uri(path.join(fontDir('space-grotesk'), 'space-grotesk-latin-400-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Space Grotesk';font-weight:500;src:url('${uri(path.join(fontDir('space-grotesk'), 'space-grotesk-latin-500-normal.woff2'))}') format('woff2');}
`;

const CYAN = '#34d8f0', AMBER = '#f5b942', GOLD = '#ffd54a', VIOLET = '#b08cff', ROSE = '#ff5d7e';

// PARED to the core story (6 lines, spread far apart so each has room to read; everything else is
// uncaptioned, pure-visual showcase). The three beats: the city is in darkness + you bring the light →
// decrypt the ciphers to defeat the bosses → unlock the mystery of the Fall to bring back the solstice.
const CAPTIONS = [
  { id: 'darkness', label: 'THE CITY IN DARKNESS', line: 'Lancefall — a kingdom of living light, now lost to the dark.', accent: CYAN },
  { id: 'light', label: 'YOU ARE THE LIGHT', line: 'You alone can bring it back — a <b>spear of light</b> you dash through the dark.', accent: CYAN },
  { id: 'decrypt', label: 'DECRYPT TO DEFEAT', line: 'Every boss is a <b>cipher</b>. Break its code to break the boss.', accent: AMBER },
  { id: 'returns', label: 'THE LIGHT RETURNS', line: 'Each code you break <b>decrypts</b> the city — grey, back to gold.', accent: GOLD },
  { id: 'unlock', label: 'UNLOCK THE FALL', line: 'Decrypt the lost transmissions — and uncover who let the light die.', accent: AMBER },
  { id: 'solstice', label: 'BRING BACK THE SOLSTICE', line: 'Break the last cipher, and the <b>longest day</b> returns.', accent: GOLD },
];

function lowerThird(c) {
  return `<!doctype html><meta charset=utf-8><style>${FONTS}
  *{margin:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden}
  /* cinematic legibility scrim — gentle, confined to the lower band */
  .scrim{position:absolute;left:0;right:0;bottom:0;height:42%;
    background:linear-gradient(to top, rgba(3,5,12,.82) 0%, rgba(3,5,12,.55) 34%, rgba(3,5,12,.18) 66%, transparent 100%);}
  .lt{position:absolute;left:104px;bottom:104px;max-width:1260px}
  .kicker{display:flex;align-items:center;gap:14px;margin-bottom:16px}
  .rule{width:46px;height:2px;background:${c.accent};box-shadow:0 0 12px ${c.accent};}
  .dia{width:9px;height:9px;background:${c.accent};transform:rotate(45deg);box-shadow:0 0 12px ${c.accent};}
  .label{font-family:'Rajdhani';font-weight:700;font-size:25px;letter-spacing:.46em;color:${c.accent};
    text-shadow:0 0 20px ${c.accent}cc;}
  .line{font-family:'Space Grotesk';font-weight:400;font-size:52px;line-height:1.18;color:#f2f6ff;
    text-shadow:0 2px 26px rgba(0,0,0,.7);letter-spacing:.004em;}
  .line b{font-weight:500;color:#fff;text-shadow:0 0 26px ${c.accent}, 0 2px 26px rgba(0,0,0,.7);}
  </style>
  <div class="scrim"></div>
  <div class="lt">
    <div class="kicker"><span class="rule"></span><span class="dia"></span><span class="label">${c.label}</span></div>
    <div class="line">${c.line}</div>
  </div>`;
}

const END = `<!doctype html><meta charset=utf-8><style>${FONTS}
  *{margin:0}html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden;display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center}
  .logo{font-family:'Orbitron';font-weight:900;font-size:132px;letter-spacing:.05em;
    background:linear-gradient(90deg,${CYAN},#9fd8ff 55%,${VIOLET});-webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 0 36px ${CYAN}77);}
  .sub{font-family:'Rajdhani';font-weight:700;font-size:38px;letter-spacing:.54em;color:${AMBER};text-shadow:0 0 22px ${AMBER}88;margin-top:8px}
  .url{font-family:'Space Grotesk';font-weight:500;font-size:40px;color:#fff;margin-top:42px;letter-spacing:.03em}
  .jam{font-family:'Rajdhani';font-weight:600;font-size:25px;letter-spacing:.34em;color:#9fb2c8;margin-top:14px}
  .cred{position:absolute;bottom:40px;left:0;right:0;text-align:center;font-family:'Space Grotesk';font-weight:400;font-size:16px;color:#5d6e86;letter-spacing:.02em}
  </style><div class="wrap"><div class="logo">LANCEFALL</div><div class="sub">THE LAST KEY</div>
  <div class="url">lancefall.pages.dev</div><div class="jam">JUNE GAME JAM · AN ODE TO ALAN TURING</div></div>
  <div class="cred">Music: Punch Deck &amp; FSM Team / &lt;e s c p&gt; (CC BY) · SFX: Kenney (CC0) · Built in TypeScript, no engine</div>`;

// Transparent overlay for the END-ART card: the owner's art already has the title + tagline, so
// we only add the play URL + jam credit + audio attribution along the bottom.
const ENDINFO = `<!doctype html><meta charset=utf-8><style>${FONTS}
  *{margin:0}html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden}
  .blk{position:absolute;left:0;right:0;bottom:72px;text-align:center}
  .url{font-family:'Space Grotesk';font-weight:500;font-size:40px;color:#fff;letter-spacing:.04em;
    text-shadow:0 2px 18px rgba(0,0,0,.85),0 0 26px ${CYAN}66}
  .jam{font-family:'Rajdhani';font-weight:600;font-size:25px;letter-spacing:.34em;color:#dfe8f5;margin-top:12px;
    text-shadow:0 2px 14px rgba(0,0,0,.9)}
  .cred{position:absolute;left:0;right:0;bottom:30px;text-align:center;font-family:'Space Grotesk';
    font-weight:400;font-size:15px;color:#cdd6e6;letter-spacing:.02em;text-shadow:0 1px 10px rgba(0,0,0,.9)}
  </style>
  <div class="blk"><div class="url">lancefall.pages.dev</div>
  <div class="jam">JUNE GAME JAM · AN ODE TO ALAN TURING</div></div>
  <div class="cred">Music: Punch Deck &amp; FSM Team / &lt;e s c p&gt; (CC BY) · SFX: Kenney (CC0) · Built in TypeScript, no engine</div>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const render = async (html, out) => {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(ASSETS, out), omitBackground: true });
    console.log('[captions] ✓', out);
  };
  for (const c of CAPTIONS) await render(lowerThird(c), `cap_${c.id}.png`);
  await render(END, 'card_end.png');
  await render(ENDINFO, 'card_endinfo.png');
  await browser.close();
})();
