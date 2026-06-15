// src/gifWorker.ts — encodes captured RGBA frames into an animated GIF off the
// main thread (so the 60fps loop never stalls during a big LZW pass). Receives
// transferred ArrayBuffers, returns the finished GIF bytes (also transferred).
import { encodeRgbaFrames, type Watermark } from './gif';

interface EncodeMsg {
  frames: ArrayBuffer[];
  w: number;
  h: number;
  delayCs: number;
  mark?: Watermark;
}

self.onmessage = (e: MessageEvent<EncodeMsg>) => {
  const { frames, w, h, delayCs, mark } = e.data;
  const rgba = frames.map((buf) => new Uint8Array(buf));
  const gif = encodeRgbaFrames(rgba, w, h, delayCs, true, mark);
  (self as unknown as Worker).postMessage({ gif: gif.buffer }, [gif.buffer]);
};
