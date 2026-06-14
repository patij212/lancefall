#!/usr/bin/env node
// tools/audio/conform-flagship.mjs — LOOP-PREP, not tempo-lock (Deep Dive C).
// For each curated source in audio-src/flagship/loops.json it: trims [loopStartBar, loopEndBar)
// to an integer-bar region at the source's OWN bpm, bakes an equal-power (qsin) crossfade SEAM by
// overlap-adding the X-second tail onto the head so the loop wraps click-free, loudness-normalises
// toward the manifest LUFS, optionally rubberband-stretches a rare outlier, and writes a 48 kHz WAV.
// The bar/seam math is the unit-tested pure core in ./lib.mjs; this file is the ffmpeg I/O shell.
//
// Usage: node tools/audio/conform-flagship.mjs   (reads loops.json; skips sources with no sourceWav)

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { barSeconds, loopSeconds } from './lib.mjs';

const ROOT = resolve(process.cwd());
const LOOPS = resolve(ROOT, 'audio-src/flagship/loops.json');
const OUT_MUSIC = resolve(ROOT, 'audio-src/flagship/conformed/music');
const OUT_SFX = resolve(ROOT, 'audio-src/flagship/conformed/sfx');
const TARGET_LUFS = -20;
const TARGET_TP = -1;

function die(msg) {
  console.error(`conform: ${msg}`);
  process.exit(1);
}

function run(bin, args) {
  const r = spawnSync(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.error) die(`${bin} not found (${r.error.message})`);
  if (r.status !== 0) die(`${bin} exited ${r.status}`);
}

function hasFilter(name) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' });
  return r.status === 0 && new RegExp(`\\b${name}\\b`).test(r.stdout);
}

/** Master duration in seconds (0 if unreadable). */
function probeDuration(input) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', input], { encoding: 'utf8' });
  return r.status === 0 ? Number(r.stdout.trim()) || 0 : 0;
}

/** The overlap-add seam-bake filtergraph for one source (see Deep Dive C). Loudness is applied
 *  AFTER, as a precise 2-pass step (masterLoudness), so this just builds the seamless loop. */
function loopFilter(startSec, loopSec, xfSec, stretchTempo) {
  const end = startSec + loopSec;
  const pre = stretchTempo ? `${stretchTempo},` : '';
  return [
    `[0:a]${pre}atrim=start=${startSec}:end=${end},asetpts=N/SR/TB,asplit=2[body][bodyhead]`,
    // head = first X seconds of the loop, faded IN (equal-power qsin)
    `[bodyhead]atrim=0:${xfSec},afade=t=in:curve=qsin:st=0:d=${xfSec}[headfade]`,
    // tail = the X seconds that FOLLOW the loop point, faded OUT — overlap-add makes the wrap seamless
    `[0:a]${pre}atrim=start=${end}:end=${end + xfSec},asetpts=N/SR/TB,afade=t=out:curve=qsin:st=0:d=${xfSec}[tailfade]`,
    `[headfade][tailfade]amix=inputs=2:normalize=0:duration=shortest[seam]`,
    `[body]atrim=start=${xfSec}:end=${loopSec},asetpts=N/SR/TB[rest]`,
    `[seam][rest]concat=n=2:v=0:a=1,aresample=48000[outa]`,
  ].join(';');
}

/** Professional EBU R128 2-pass loudness normalisation: pass 1 MEASURES the loop, pass 2 applies a
 *  LINEAR gain to hit the integrated-LUFS + true-peak targets EXACTLY (preserves dynamics — no
 *  pumping, unlike single-pass). Matches all tracks to the same loudness so the rotation is seamless.
 *  Falls back to single-pass if the measurement JSON can't be parsed. */
function masterLoudness(inputWav, outputWav, lufs, tp) {
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-i', inputWav,
    '-af', `loudnorm=I=${lufs}:TP=${tp}:LRA=11:print_format=json`, '-f', 'null', '-',
  ], { encoding: 'utf8' });
  let m = null;
  try { m = JSON.parse((r.stderr || '').match(/\{[\s\S]*?\}/g)?.pop() ?? ''); } catch { m = null; }
  const measured = m && Number.isFinite(+m.input_i)
    ? `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
    : '';
  run('ffmpeg', [
    '-hide_banner', '-y', '-i', inputWav,
    '-af', `loudnorm=I=${lufs}:TP=${tp}:LRA=11${measured}`,
    '-ar', '48000', '-c:a', 'pcm_s16le', outputWav,
  ]);
}

function conformMusic(src, stretchFilter) {
  if (!src.sourceWav) {
    console.log(`  · ${src.id}: no sourceWav yet (Task 3) — skipped`);
    return false;
  }
  const input = resolve(ROOT, src.sourceWav);
  if (!existsSync(input)) die(`${src.id}: sourceWav not found: ${src.sourceWav}`);

  const bars = src.loopEndBar - src.loopStartBar;
  if (!(bars >= 1)) die(`${src.id}: loopEndBar must exceed loopStartBar`);
  const startSec = src.loopStartBar * barSeconds(src.bpm);
  const loopSec = loopSeconds(src.bpm, bars);
  const xfSec = Math.max(0.005, (src.crossfadeMs ?? 40) / 1000);

  // the overlap-add seam reads X seconds PAST the loop end; if the region runs to the master's tail
  // the crossfade silently truncates into a clicky/gapped seam. Fail loudly instead.
  const dur = probeDuration(input);
  if (dur && startSec + loopSec + xfSec > dur + 1e-3) {
    die(`${src.id}: loop region + crossfade (${(startSec + loopSec + xfSec).toFixed(2)}s) exceeds master length ${dur.toFixed(2)}s — lower loopEndBar`);
  }

  let stretchTempo = '';
  if (src.stretchTo && src.stretchTo !== src.bpm) {
    const ratio = src.stretchTo / src.bpm;
    stretchTempo = stretchFilter === 'rubberband' ? `rubberband=tempo=${ratio}` : `atempo=${ratio}`;
    console.log(`  · ${src.id}: stretch ${src.bpm}→${src.stretchTo} BPM via ${stretchFilter}`);
  }

  const outDir = resolve(OUT_MUSIC, src.id);
  mkdirSync(outDir, { recursive: true });
  const output = resolve(outDir, 'main.wav');
  const raw = resolve(outDir, 'main.raw.wav');
  // Step 1: build the seamless bar-aligned loop (no loudness yet).
  run('ffmpeg', [
    '-hide_banner', '-y', '-i', input,
    '-filter_complex', loopFilter(startSec, loopSec, xfSec, stretchTempo),
    '-map', '[outa]', '-ar', '48000', '-c:a', 'pcm_s16le', raw,
  ]);
  // Step 2: 2-pass EBU R128 mastering → final.
  masterLoudness(raw, output, TARGET_LUFS, TARGET_TP);
  rmSync(raw, { force: true });
  console.log(`  ✓ ${src.id}: ${bars}-bar loop @ ${src.bpm} BPM (${loopSec.toFixed(3)} s, 2-pass mastered) → ${output}`);
  return true;
}

function conformSfx(sfx) {
  let made = 0;
  for (let n = 1; n <= sfx.variants; n++) {
    const input = resolve(ROOT, `audio-src/flagship/sfx/${sfx.id}_${n}.wav`);
    if (!existsSync(input)) continue;
    const output = resolve(OUT_SFX, `${sfx.id}_${n}.wav`);
    mkdirSync(dirname(output), { recursive: true });
    run('ffmpeg', [
      '-hide_banner', '-y', '-i', input,
      '-af', `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11,aresample=48000`,
      '-ar', '48000', '-c:a', 'pcm_s16le', output,
    ]);
    made++;
  }
  if (made) console.log(`  ✓ ${sfx.id}: normalised ${made} variant(s)`);
  return made;
}

function main() {
  if (!existsSync(LOOPS)) die(`missing curator record: ${LOOPS}`);
  const { sources = [], sfx = [] } = JSON.parse(readFileSync(LOOPS, 'utf8'));
  const stretchFilter = hasFilter('rubberband') ? 'rubberband' : 'atempo';

  console.log('Conforming flagship music (loop-prep):');
  let music = 0;
  for (const src of sources) if (conformMusic(src, stretchFilter)) music++;
  console.log('Normalising flagship SFX:');
  let voices = 0;
  for (const s of sfx) voices += conformSfx(s);

  console.log(`\nConform done: ${music}/${sources.length} music sources, ${voices} SFX variants.`);
  if (music === 0 && voices === 0) {
    console.log('Nothing curated yet — fill audio-src/flagship/loops.json sourceWav paths (Task 3).');
  }
}

main();
