import { describe, it, expect } from 'vitest';
import { webSafePalette, quantizeFrame, encodeGif, encodeRgbaFrames } from './gif';

// A reference GIF-LZW decoder (canonical rule) — used only to prove the encoder
// round-trips. If this passes AND a browser renders the output, the encoder is
// byte-compatible with the GIF89a spec.
function lzwDecode(data: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let dict: number[][] = [];
  const init = (): void => {
    dict = [];
    for (let i = 0; i < clearCode; i++) dict.push([i]);
    dict.push([]); // clear slot
    dict.push([]); // eoi slot
    codeSize = minCodeSize + 1;
  };
  init();
  const out: number[] = [];
  let acc = 0;
  let accBits = 0;
  let pos = 0;
  const read = (): number => {
    while (accBits < codeSize) {
      acc |= (data[pos++] | 0) << accBits;
      accBits += 8;
    }
    const c = acc & ((1 << codeSize) - 1);
    acc >>= codeSize;
    accBits -= codeSize;
    return c;
  };
  let prev: number[] | null = null;
  for (;;) {
    const code = read();
    if (code === eoiCode) break;
    if (code === clearCode) {
      init();
      prev = null;
      continue;
    }
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (prev) entry = prev.concat(prev[0]);
    else throw new Error('bad lzw stream');
    for (const s of entry) out.push(s);
    if (prev) {
      dict.push(prev.concat(entry[0]));
      if (dict.length === 1 << codeSize && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return out;
}

/** Pull each frame's LZW image data out of a finished GIF + decode it. */
function decodeGifFrames(gif: Uint8Array, w: number, h: number): number[][] {
  const frames: number[][] = [];
  let i = 13 + 256 * 3; // header(6) + LSD(7) + GCT(768)
  while (i < gif.length) {
    const b = gif[i];
    if (b === 0x3b) break; // trailer
    if (b === 0x21) {
      // extension: skip label + sub-blocks
      i += 2;
      while (gif[i] !== 0) i += gif[i] + 1;
      i += 1;
      continue;
    }
    if (b === 0x2c) {
      i += 10; // image descriptor
      const minCodeSize = gif[i++];
      const data: number[] = [];
      while (gif[i] !== 0) {
        const len = gif[i++];
        for (let j = 0; j < len; j++) data.push(gif[i++]);
      }
      i += 1; // terminator
      frames.push(lzwDecode(Uint8Array.from(data), minCodeSize).slice(0, w * h));
      continue;
    }
    break;
  }
  return frames;
}

describe('gif — dependency-free GIF89a encoder', () => {
  it('webSafePalette: 256 colours, black at 0, white at 215', () => {
    const pal = webSafePalette();
    expect(pal.length).toBe(256 * 3);
    expect([pal[0], pal[1], pal[2]]).toEqual([0, 0, 0]);
    expect([pal[215 * 3], pal[215 * 3 + 1], pal[215 * 3 + 2]]).toEqual([255, 255, 255]);
  });

  it('quantizeFrame maps known colours to the right indices (no dither)', () => {
    // 2x2: black, white, pure red, pure blue
    const rgba = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 0, 255, 255]);
    const idx = quantizeFrame(rgba, 2, 2, false);
    expect(idx[0]).toBe(0); // black → 0
    expect(idx[1]).toBe(215); // white → 5*36+5*6+5 = 215
    expect(idx[2]).toBe(5 * 36); // red (255,0,0) → 180
    expect(idx[3]).toBe(5); // blue (0,0,255) → 5
  });

  it('encodeGif produces a structurally valid GIF89a (header, loop, trailer, size)', () => {
    const w = 4;
    const h = 3;
    const indices = new Uint8Array(w * h).fill(7);
    const gif = encodeGif([{ indices }], w, h, 10);
    expect(String.fromCharCode(gif[0], gif[1], gif[2], gif[3], gif[4], gif[5])).toBe('GIF89a');
    expect(gif[6] | (gif[7] << 8)).toBe(w); // logical screen width
    expect(gif[8] | (gif[9] << 8)).toBe(h); // logical screen height
    expect(gif[gif.length - 1]).toBe(0x3b); // trailer
    // NETSCAPE2.0 loop extension present
    expect(Array.from(gif).join(',')).toContain(Array.from('NETSCAPE2.0').map((c) => c.charCodeAt(0)).join(','));
  });

  it('LZW round-trips a varied frame (exercises code-width growth)', () => {
    const w = 96;
    const h = 96;
    const indices = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) indices[y * w + x] = (x * 131 + y * 57 + (x ^ y)) % 216;
    const gif = encodeGif([{ indices }], w, h, 8);
    const decoded = decodeGifFrames(gif, w, h);
    expect(decoded.length).toBe(1);
    expect(decoded[0]).toEqual(Array.from(indices));
  });

  it('round-trips a flat frame and a multi-frame animation', () => {
    const w = 20;
    const h = 16;
    const flat = new Uint8Array(w * h).fill(42);
    expect(decodeGifFrames(encodeGif([{ indices: flat }], w, h, 8), w, h)[0]).toEqual(Array.from(flat));

    const f1 = new Uint8Array(w * h).fill(3);
    const f2 = new Uint8Array(w * h).fill(99);
    const anim = decodeGifFrames(encodeGif([{ indices: f1 }, { indices: f2 }], w, h, 8), w, h);
    expect(anim.length).toBe(2);
    expect(anim[0]).toEqual(Array.from(f1));
    expect(anim[1]).toEqual(Array.from(f2));
  });

  it('encodeRgbaFrames yields a valid GIF that decodes back to the quantized indices', () => {
    const w = 8;
    const h = 8;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = (i * 37) % 256;
      rgba[i * 4 + 1] = (i * 19) % 256;
      rgba[i * 4 + 2] = (i * 53) % 256;
      rgba[i * 4 + 3] = 255;
    }
    const expected = Array.from(quantizeFrame(rgba, w, h, false));
    const gif = encodeRgbaFrames([rgba], w, h, 8, false);
    expect(decodeGifFrames(gif, w, h)[0]).toEqual(expected);
  });
});
