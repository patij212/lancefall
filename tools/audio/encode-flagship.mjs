#!/usr/bin/env node
// tools/audio/encode-flagship.mjs — conformed 48 kHz WAV → runtime Opus(.ogg) + MP3(.mp3),
// mirrored under public/audio/flagship/ to match src/audioManifest.ts URLs. Exits non-zero on the
// first encode failure. Codec args come from the unit-tested ./lib.mjs.
//
// Usage: node tools/audio/encode-flagship.mjs   (encodes whatever conform produced; skips absent inputs)

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { opusArgs, mp3Args } from './lib.mjs';

const ROOT = resolve(process.cwd());
const LOOPS = resolve(ROOT, 'audio-src/flagship/loops.json');
const IN_MUSIC = resolve(ROOT, 'audio-src/flagship/conformed/music');
const IN_SFX = resolve(ROOT, 'audio-src/flagship/conformed/sfx');
const OUT_MUSIC = resolve(ROOT, 'public/audio/flagship/music');
const OUT_SFX = resolve(ROOT, 'public/audio/flagship/sfx');

function die(msg) {
  console.error(`encode: ${msg}`);
  process.exit(1);
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.error) die(`ffmpeg not found (${r.error.message})`);
  if (r.status !== 0) die(`ffmpeg exited ${r.status} for: ${args.at(-1)}`);
}

function encodePair(input, outBase) {
  mkdirSync(dirname(outBase), { recursive: true });
  ffmpeg(opusArgs(input, `${outBase}.ogg`));
  ffmpeg(mp3Args(input, `${outBase}.mp3`));
}

function main() {
  if (!existsSync(LOOPS)) die(`missing curator record: ${LOOPS}`);
  const { sources = [], sfx = [] } = JSON.parse(readFileSync(LOOPS, 'utf8'));

  let music = 0;
  for (const src of sources) {
    const input = resolve(IN_MUSIC, src.id, 'main.wav');
    if (!existsSync(input)) continue;
    encodePair(input, resolve(OUT_MUSIC, src.id, 'main'));
    console.log(`  ✓ ${src.id} → music/${src.id}/main.{ogg,mp3}`);
    music++;
  }

  let voices = 0;
  for (const s of sfx) {
    for (let n = 1; n <= s.variants; n++) {
      const input = resolve(IN_SFX, `${s.id}_${n}.wav`);
      if (!existsSync(input)) continue;
      encodePair(input, resolve(OUT_SFX, `${s.id}_${n}`));
      voices++;
    }
  }

  console.log(`\nEncode done: ${music} music sources, ${voices} SFX variants.`);
  if (music === 0 && voices === 0) console.log('No conformed inputs — run audio:conform after curating assets (Task 3).');
}

main();
