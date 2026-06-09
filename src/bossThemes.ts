// Per-boss musical identity. Each boss layers a distinct "tension chord" of drone
// voices over the procedural soundtrack and shifts the arpeggio's colour, so every
// boss fight sounds different. Pure data + a total selector (audio.ts consumes it);
// intervals are semitones above the 55 Hz (A1) music root.

import type { EnemyKind } from './types';

export interface BossTheme {
  name: string;
  drone: number[]; // semitone intervals above the root → the tension chord's voices
  wave: OscillatorType;
  detune: number; // cents of detune per voice (thickness)
  arpMul: number; // multiplier on the soundtrack arp pitch (darker < 1 < brighter)
}

const DEFAULT: BossTheme = { name: 'WARDEN', drone: [6], wave: 'sawtooth', detune: 5, arpMul: 0.75 };

export const BOSS_THEMES: Partial<Record<EnemyKind, BossTheme>> = {
  // WARDEN — the classic tritone tension (the original boss voice)
  warden: { name: 'WARDEN', drone: [6], wave: 'sawtooth', detune: 5, arpMul: 0.75 },
  // WEAVER — a minor-third + minor-seventh stack on a soft triangle: hypnotic, pinwheeling
  weaver: { name: 'WEAVER', drone: [3, 10], wave: 'triangle', detune: 8, arpMul: 1.0 },
  // BEACON — a bright fifth + octave: piercing, like its sweeping laser
  beacon: { name: 'BEACON', drone: [7, 12], wave: 'sawtooth', detune: 4, arpMul: 1.5 },
  // MIRRORBLADE — root + octave on a hard square: aggressive duelist menace
  mirrorblade: { name: 'MIRRORBLADE', drone: [0, 12], wave: 'square', detune: 6, arpMul: 0.5 },
  // HOLLOW — a detuned minor-second + tritone cluster: eerie, intangible dread
  hollow: { name: 'HOLLOW', drone: [1, 6], wave: 'sawtooth', detune: 14, arpMul: 0.66 },
  // THE SOVEREIGN — a grand four-voice chord (root/fifth/octave/major-third-up): the finale
  sovereign: { name: 'SOVEREIGN', drone: [0, 7, 12, 16], wave: 'sawtooth', detune: 7, arpMul: 0.75 },
};

/** Total: returns the boss theme for a kind, falling back to the Warden tritone. */
export function bossTheme(kind: EnemyKind): BossTheme {
  return BOSS_THEMES[kind] ?? DEFAULT;
}
