# AUDIO OVERHAUL — "real music, addictive, not bleak" (design spec)

From a 9-agent deep-research workflow (`lancefall-soundtrack-science`) + an adversarial critique. This is the implementation spec. Owner brief: the soundtrack is "still too bleak", lacks "proper structure and complexity", "not like real music" — make it truly, addictively great. Big overhaul, iterate, don't stop at "done".

## Diagnosis (why it's bleak) — 3 faces of one defect
1. **No thirds / no leading tone.** `padChord` = `[0,7,12]` (hollow power chord, no 3rd); choir's 3rd is at +16 (2 octaves up, inaudible as quality); pentatonic has no leading tone → modeless, gray by construction.
2. **No cadence.** `BASS_PROG` Am-F-C-G (i-VI-III-VII) has no dominant (no E/V) → circles, never resolves → no reward-prediction-error (no dopamine arc).
3. **No real form.** Macro-form only re-pitches one hook; same chords/density throughout → rotates, never builds.
Root: parked at the far-left of the Wundt/Berlyne inverted-U (too simple, zero prediction error).

## The transpose-safe two-layer scheme (the central trick)
- **Melodic layer** (lead/riff/arp): UNCHANGED — stays on PENTA × `rootMul` × sectionLift; `tierSemis=[0,2,3,5,7,9,12]` untouched (dash-grade depends on it).
- **NEW diatonic harmony layer** (pad/choir/bass): a degree-aware chord table. Each voice = `220 * rootMul * 2^(rootSemi/12) * 2^(colorSemi/12)`. Because `rootMul` multiplies the whole block uniformly, every interval (3rd, maj7, add9, the G# leading tone) is invariant under EVERY tier → as consonant as pentatonic, but with mode + color. **Verified by the critic against the code: melody and chord block both use the same `this.rootMul`, so it's sound.**

## Chord shapes (semitones rel. to each chord's own root)
min `[0,3,7]` · maj `[0,4,7]` · sus2 `[0,2,7]` · sus4 `[0,5,7]` · m9 `[0,3,7,10,14]` · maj9 `[0,4,7,11,14]` · add9 `[0,4,7,14]` · dom7 `[0,4,7,10]` · dom7b9 `[0,4,7,10,13]`

## Progressions (root offsets from A; named, per-section)
- **AURORA NEON RISE** (verse/pre): Am9 – Gadd9 – Fmaj9 – Cadd9 → **E7** (i9-bVII-bVI-bIII→**V**). roots `0,-2,-4,3,7`. E7 = `[0,4,7,10]` (G# leading tone → A).
- **AURORA TRIUMPH** (chorus, relative-major bright): C – G – Am – F (bIII-bVII-i-bVI). roots `+3,-2,0,-4`.
- **AURORA PICARDY** (Sovereign-kill/THE CHOICE only): … → A **major** `[0,4,7,14]` (C→C#). Brightest moment in the game.
- **SURGE FALL ENGINE** (verse): Am – Bbmaj – Gm – E7b9 (i-bII-bVII-V7b9). roots `0,+1,-2,+7`. Phrygian b2 dread + dom7b9 pull.
- **SURGE DRIVING DARK** (chorus/drop): Am – C – F – G (i-bIII-bVI-bVII). roots `0,+3,-4,-2`. bIII/bVI majors = brightness inside aggression.
- **BRIDGE** (both, the build): Dm – C – E half-cadence (iv-III-V), ends OPEN on the dominant. roots `+5,+3,+7`.

## Coherence mode-brightness — DISCRETE steps (critic: snap to 3-4 steps, on bar boundaries, slew-limited — NOT a continuous morph)
- `<0.30` DARK: bare triads, drop color (but keep a WARM floor — soft add9 pad + drift + warm sub; never hollow/dead).
- `0.30-0.60` DORIAN GLOW: + 9th/add9 shimmer; arp may reach F#4 (+9).
- `0.60-0.85` OPEN COLOR: maj7/add9 on F & C; unlock the E7 leading-tone cadence; high sparkle.
- `>0.85` / Sovereign-kill: PICARDY major lift.

## Song structure (5-tier vertical ladder + macro-form)
Sections: INTRO → VERSE(A,8) → PRE-CHORUS(A',8, rising filter) → CHORUS/DROP(8) → VERSE2(8) → CHORUS(8) → BRIDGE(4, build) → DROP → OUTRO(2). Vertical tiers by `max(heat,coherence)` w/ hysteresis (+0.08/-0.05): S0 drone+pad → S1 +kick+bass+hats (hook OFF) → S2 +arp+riff+clap (filter ramp) → S3 hook+choir+counter (the drop) → S4 boss/peak.

## Motifs (PENTA idx; hero cell = [5,6,8,9] = A3 C4 E4 G4)
- HERO CELL rising arch (head of LANCE_THEME — keep). THE LEAP (D5 idx7 oct2, syncopated, the snag). UNRESOLVED HANG on D (idx7) — resolve D→A ONLY on macro-completion / Picardy. Make the hook a 4-bar PERIOD: antecedent (current, ends on D) + NEW consequent resolving to A3.
- Boss leitmotifs from the cell: WARDEN=inverted, HOLLOW=gapped, SOVEREIGN=augmented+inverted LANCE_THEME (Picardy on kill).
- COUNTER-MELODY: a 6th below, contrary/oblique, in the lead's rest gaps, coherence≥0.7.

## CRITIQUE — MUST FIX (reordered priorities; "does not yet clear the bar" as paper-only)
1. **RENDER-AND-LISTEN GATE FIRST.** OfflineAudioContext bounce of each section (fixed coherence/heat/boss) → WAV; A/B before/after; measure peak/RMS/spectral-centroid; determinism null-test. Everything else is unverifiable without it.
2. **TIMBRE is the real bleakness (P0, not P2):** per-note FILTER ENVELOPES (not static cutoff); 2-osc detune + SUB-osc per lead/bass voice; delayed (~300ms) ±6c vibrato + cutoff LFO on pad/choir; noise-transient attacks; tempo-synced ping-pong DELAY on the lead (the #1 "produced" lever, currently absent); chorus/width on pad+choir.
3. **Voice-leading IN REGISTER:** register-cap (fold voices above ~G5 down an octave); drop-2/drop-3 spacing (no 9th/maj7 tone-clusters); hard FREQUENCY SLOTS (sub<90, pad 200–1.2k +450Hz notch, lead 1.2–4k, sparkle>4k, hats>6k, mono-sum <120Hz). Define the actual nearest-pitch fn.
4. **TIME-BASED FORM SPINE** that advances regardless of play (a mid-skill player who sits at coherence 0.5 must still hear the song progress); coherence/heat modulate LAYERS+brightness ON TOP. ONE deterministic form clock; drama events (drop/silence-gap) QUANTIZE to it (no 3 uncoordinated triggers).
5. **SLEW/QUANTIZE all coherence params** (not just the tier ladder); mode-brightness in discrete steps on bar boundaries — else seasick, not composed.
6. **DRUM SOUND-DESIGN** (not just patterns): kick (click freq/decay + body pitch-env + sat + sidechain ms), snare (180Hz tonal + noise blend + bandpass), hats (HP + 20–40ms decay + metallic partials), clap (3–4 bursts 8–12ms + tail).

## CRITIQUE — addictiveness gaps
- **Cadence delivered every loop habituates** → default deceptive/circular, DENY V→i most cycles, LAND only on earned boundaries (section change, combo milestone, kill).
- **Hours-long novelty needs a SONG-BOOK**: 3–4 distinct verse hooks + 2–3 choruses + a B-section with NEW material + per-biome/act palettes — not one hook developed 4 ways.
- **Dash-on-beat reward fully specified**: a Perfect on-beat dash closing a combo milestone resolves the hanging D→A + sparkle stab + brief master-filter open, with cooldown (deterministic, no RNG).
- **Note-level combat interaction**: hit-streak adds an arp note / kill stinger on the beat / dash-trail pitched to the current chord tone.

## CRITIQUE — missing for real music
Stereo image plan (pan per layer, Haas widening, mono low end); tempo-synced ping-pong delay; bar-to-bar dynamic velocity/breathing; explicit mix targets (per-bus headroom, what ducks what, HP discipline, peak/LUFS); resolve the **always-on riff vs chord-changes clash** (riff must be chord-aware or chords keep riff tones consonant).

## CRITIQUE — still-bleak risks
- Low-coherence floor is most of real play → make the floor WARM not gray.
- Phrygian-dom = generic-darksynth-pastiche risk → distinctiveness from THIS game's leitmotif/harmony.
- Picardy-only brightness = single firework → emotional range must be reachable repeatedly in normal runs (the relative-major CHORUS is the vehicle; don't gate it too high).

## Determinism (hard invariant)
Never consume `world.rng`. Everything = pure fn of (barIndex, beat, heat, coherence, totalBarsPlayed, bossId, trackId). Micro-variation via a SEPARATE `cmusRng = mulberry32(barIndex ^ trackSalt)`. 112 BPM + dash-grid + tierSemis untouched. Swing on hats/arp/riff ONLY.

## My implementation order (committed phases, render-verified each)
1. **Render/verify harness** (OfflineAudioContext → WAV + peak/RMS/spectral-centroid; refactor bus setup to `buildGraph(ctx)`).
2. **Harmony engine**: chord table + `bassChordAt`; `padChord` rewrite (real chords, register-cap, freq-slot, voice-leading); discrete bar-quantized coherence mode steps; choir mid-third; cadence scarcity. Verify centroid rises with coherence.
3. **Timbre/motion**: filter envelopes, sub-osc, vibrato+LFO, transients, ping-pong delay, chorus/width, warm floor, designed drums.
4. **Form spine + arrangement**: deterministic bar-clock form; layers/brightness modulate on top; quantized builds/drops; song-book (multiple hooks); dash-on-beat reward + note-level interaction.
5. **Mix**: freq slots, stereo, gain-staging, ease limiter after slotting; verify S4 peak is huge not crushed.
6. **Iterate**: render → critique → refine; redeploy.
