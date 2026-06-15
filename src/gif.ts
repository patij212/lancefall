// src/gif.ts — a compact, DEPENDENCY-FREE animated GIF89a encoder. Quantizes RGBA
// frames to the 216-colour web-safe palette (direct O(1) mapping, no nearest-
// neighbour search) with 4×4 ordered dithering to soften banding, LZW-compresses
// each frame, and assembles an infinitely-looping animation. Pure + synchronous —
// runs on the main thread in tests and inside a Web Worker in the app (off the
// 60fps loop). No npm dependency.

const LEVELS = [0, 51, 102, 153, 204, 255] as const;
// Bayer 4×4 ordered-dither matrix (0..15)
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

// ── pixel-font watermark ────────────────────────────────────────────────────
// A compact 5×7 bitmap font (one 35-bit glyph per char, row-major MSB-first) so
// the watermark can be burned into RGBA frames inside the GIF *worker* — no DOM,
// no canvas text API, fully deterministic. Covers the chars the share line needs
// (digits, A–Z, and a handful of punctuation); unknown chars render as a space.
// Each string is 7 rows of 5 chars ('#' = on, ' ' = off) for legibility here.
const FONT5x7: Record<string, string> = {
  '0': '01110100111011110011101100111000111001110',
  ' ': '0000000000000000000000000000000000',
};
// Build the real font from readable row strings (kept separate so the table above
// stays a tiny fallback marker — actual glyphs come from FONT_ROWS below).
const FONT_ROWS: Record<string, string[]> = {
  '0': [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  '2': [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
  '3': [' ### ', '#   #', '    #', '  ## ', '    #', '#   #', ' ### '],
  '4': ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  '6': [' ### ', '#   #', '#    ', '#### ', '#   #', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '#   #', ' ### '],
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
  C: [' ### ', '#   #', '#    ', '#    ', '#    ', '#   #', ' ### '],
  D: ['###  ', '#  # ', '#   #', '#   #', '#   #', '#  # ', '###  '],
  E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
  F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
  G: [' ### ', '#   #', '#    ', '# ###', '#   #', '#   #', ' ####'],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  I: [' ### ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  J: ['  ###', '   # ', '   # ', '   # ', '#  # ', '#  # ', ' ##  '],
  K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '# # #', '#   #', '#   #', '#   #'],
  N: ['#   #', '##  #', '# # #', '# # #', '#  ##', '#   #', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
  Q: [' ### ', '#   #', '#   #', '#   #', '# # #', '#  # ', ' ## #'],
  R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
  U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
  W: ['#   #', '#   #', '#   #', '# # #', '# # #', '## ##', '#   #'],
  X: ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
  Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
  Z: ['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#####'],
  '.': ['     ', '     ', '     ', '     ', '     ', '  ## ', '  ## '],
  ':': ['     ', ' ##  ', ' ##  ', '     ', ' ##  ', ' ##  ', '     '],
  '-': ['     ', '     ', '     ', '#####', '     ', '     ', '     '],
  '/': ['    #', '    #', '   # ', '  #  ', ' #   ', '#    ', '#    '],
  '#': [' # # ', ' # # ', '#####', ' # # ', '#####', ' # # ', ' # # '],
  '·': ['     ', '     ', '     ', '  #  ', '     ', '     ', '     '],
};
void FONT5x7; // (kept as a documented fallback marker; FONT_ROWS is authoritative)

const GLYPH_W = 5;
const GLYPH_H = 7;

/** Measured pixel width of `text` at integer `scale` (5px glyph + 1px tracking). */
function measureText(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * (GLYPH_W + 1) * scale - scale;
}

/** Blend one ARGB-ish pixel onto the RGBA frame at (x,y) with alpha 0..1. */
function blendPixel(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return;
  const p = (y * w + x) * 4;
  const inv = 1 - a;
  rgba[p] = clampByte(rgba[p] * inv + r * a);
  rgba[p + 1] = clampByte(rgba[p + 1] * inv + g * a);
  rgba[p + 2] = clampByte(rgba[p + 2] * inv + b * a);
}

/** Draw `text` into the RGBA frame at (x,y) with a 1px dark backdrop for legibility. */
function drawText(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  text: string,
  x: number,
  y: number,
  scale: number,
  rgb: [number, number, number],
): void {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const rows = FONT_ROWS[ch] ?? FONT_ROWS[ch.toUpperCase()];
    if (!rows) {
      cx += (GLYPH_W + 1) * scale;
      continue;
    }
    for (let gy = 0; gy < GLYPH_H; gy++) {
      const row = rows[gy];
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (row[gx] !== '#') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = cx + gx * scale + sx;
            const py = y + gy * scale + sy;
            // soft 1px shadow underneath so the mark survives on bright frames
            blendPixel(rgba, w, h, px + 1, py + 1, 0, 0, 0, 0.55);
            blendPixel(rgba, w, h, px, py, rgb[0], rgb[1], rgb[2], 1);
          }
        }
      }
    }
    cx += (GLYPH_W + 1) * scale;
  }
}

export interface Watermark {
  /** primary line, e.g. "127,400 PTS" */
  score: string;
  /** secondary line, e.g. "SEED 20260615" */
  seed: string;
  /** site line, e.g. "LANCEFALL.PAGES.DEV" */
  site: string;
}

/** Burn the score/seed/site watermark into one RGBA frame, bottom-left, in place.
 *  Cosmetic only — never reads world.rng. Auto-scales to the frame width. */
export function drawWatermark(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  mark: Watermark,
): void {
  // scale the type to the frame; clamp so tiny test frames don't overflow.
  const scale = Math.max(1, Math.min(3, Math.round(w / 180)));
  const lineH = (GLYPH_H + 2) * scale;
  const pad = 4 * scale;
  // translucent letterbox strip behind the text so it reads on any background
  const blockH = lineH * 3 + pad;
  const top = h - blockH;
  for (let y = Math.max(0, top); y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      rgba[p] = clampByte(rgba[p] * 0.42);
      rgba[p + 1] = clampByte(rgba[p + 1] * 0.42);
      rgba[p + 2] = clampByte(rgba[p + 2] * 0.42);
    }
  }
  const x0 = pad;
  let y = top + Math.round(pad / 2);
  drawText(rgba, w, h, mark.score, x0, y, scale, [255, 224, 130]); // amber — the score pops
  y += lineH;
  drawText(rgba, w, h, mark.seed, x0, y, scale, [150, 235, 255]); // cyan — the seed
  y += lineH;
  drawText(rgba, w, h, mark.site, x0, y, scale, [235, 235, 235]); // white — the site
}

/** Convenience for tests/callers: width a watermark line would occupy. */
export function watermarkTextWidth(text: string, frameW: number): number {
  const scale = Math.max(1, Math.min(3, Math.round(frameW / 180)));
  return measureText(text, scale);
}

/** The 256-colour global table: 216 web-safe colours, rest black padding. */
export function webSafePalette(): Uint8Array {
  const pal = new Uint8Array(256 * 3);
  let i = 0;
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        pal[i * 3] = LEVELS[r];
        pal[i * 3 + 1] = LEVELS[g];
        pal[i * 3 + 2] = LEVELS[b];
        i++;
      }
    }
  }
  return pal;
}

/** Map an RGBA frame to web-safe palette indices (0..215), 4×4 ordered dither. */
export function quantizeFrame(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, dither = true): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      let r = rgba[p];
      let g = rgba[p + 1];
      let b = rgba[p + 2];
      // Dither only where there's real colour/gradient (the wash). Very dark
      // pixels (the background) map straight to black so they stay clean instead
      // of a visible cross-hatch.
      if (dither && (r >= 20 || g >= 20 || b >= 20)) {
        const t = (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.46875) * 51; // ±~24 spread, centred
        r = clampByte(r + t);
        g = clampByte(g + t);
        b = clampByte(b + t);
      }
      out[y * w + x] = Math.round(r / 51) * 36 + Math.round(g / 51) * 6 + Math.round(b / 51);
    }
  }
  return out;
}

/** GIF LZW (variable-width codes, clear/EOI, dictionary reset at 4096). */
function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const out: number[] = [];
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let next = eoiCode + 1;
  let dict = new Map<number, number>();
  let acc = 0;
  let accBits = 0;
  const emit = (code: number): void => {
    acc |= code << accBits;
    accBits += codeSize;
    while (accBits >= 8) {
      out.push(acc & 0xff);
      acc >>= 8;
      accBits -= 8;
    }
  };
  const reset = (): void => {
    dict = new Map();
    codeSize = minCodeSize + 1;
    next = eoiCode + 1;
  };

  reset();
  emit(clearCode);
  if (indices.length === 0) {
    emit(eoiCode);
    if (accBits > 0) out.push(acc & 0xff);
    return Uint8Array.from(out);
  }
  // Canonical GIF rule (matches browsers / omggif): grow the code width BEFORE
  // assigning a code that needs it, and emit a clear + reset exactly at 4096.
  let ib = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (ib << 8) | k; // prefix code (≤4095) × 256 + literal (≤255)
    const found = dict.get(key);
    if (found !== undefined) {
      ib = found;
    } else {
      emit(ib);
      if (next === 4096) {
        emit(clearCode);
        reset();
      } else {
        if (next >= 1 << codeSize) codeSize++;
        dict.set(key, next++);
      }
      ib = k;
    }
  }
  emit(ib);
  emit(eoiCode);
  if (accBits > 0) out.push(acc & 0xff);
  return Uint8Array.from(out);
}

/** Split LZW bytes into ≤255-byte sub-blocks (GIF image-data format). */
function subBlocks(data: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.subarray(i, Math.min(i + 255, data.length));
    out.push(chunk.length);
    for (const b of chunk) out.push(b);
  }
  out.push(0); // block terminator
  return out;
}

export interface GifFrame {
  /** palette indices (0..255), length w*h */
  indices: Uint8Array;
}

/** Assemble an animated, infinitely-looping GIF89a from quantized frames. */
export function encodeGif(frames: GifFrame[], w: number, h: number, delayCs: number): Uint8Array {
  const bytes: number[] = [];
  const push = (...b: number[]): void => {
    for (const x of b) bytes.push(x & 0xff);
  };
  const pushStr = (s: string): void => {
    for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
  };
  const word = (v: number): void => push(v & 0xff, (v >> 8) & 0xff);

  pushStr('GIF89a');
  // Logical Screen Descriptor: W, H, packed (GCT=1, colorRes=7, sort=0, size=7→256), bg, aspect
  word(w);
  word(h);
  push(0xf7, 0, 0);
  // Global Color Table (256×3)
  const pal = webSafePalette();
  for (let i = 0; i < pal.length; i++) bytes.push(pal[i]);
  // NETSCAPE2.0 application extension — loop forever
  push(0x21, 0xff, 0x0b);
  pushStr('NETSCAPE2.0');
  push(0x03, 0x01, 0x00, 0x00, 0x00);

  const delay = Math.max(2, Math.round(delayCs)); // centiseconds, min 2 (~50fps cap)
  const minCodeSize = 8; // 256-colour table
  for (const f of frames) {
    // Graphic Control Extension (delay, no transparency)
    push(0x21, 0xf9, 0x04, 0x00);
    word(delay);
    push(0x00, 0x00);
    // Image Descriptor (0,0,w,h, no local table)
    push(0x2c);
    word(0);
    word(0);
    word(w);
    word(h);
    push(0x00);
    // LZW image data
    push(minCodeSize);
    const lzw = lzwEncode(f.indices, minCodeSize);
    for (const b of subBlocks(lzw)) bytes.push(b);
  }
  push(0x3b); // trailer
  return Uint8Array.from(bytes);
}

/** One-shot: quantize + encode RGBA frames into a looping GIF Blob-ready Uint8Array.
 *  When `mark` is supplied, the score/seed/site watermark is burned into every
 *  frame BEFORE quantization (cosmetic/io only — touches no world.rng). */
export function encodeRgbaFrames(
  rgbaFrames: (Uint8Array | Uint8ClampedArray)[],
  w: number,
  h: number,
  delayCs: number,
  dither = true,
  mark?: Watermark,
): Uint8Array {
  const frames: GifFrame[] = rgbaFrames.map((rgba) => {
    if (mark) drawWatermark(rgba, w, h, mark);
    return { indices: quantizeFrame(rgba, w, h, dither) };
  });
  return encodeGif(frames, w, h, delayCs);
}
