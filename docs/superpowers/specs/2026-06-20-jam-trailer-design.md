# Jam Submission + Trailer — design spec

**Date:** 2026-06-20
**Goal:** Finish the **dev.to June Game Jam** entry (`dev.to/challenges/june-game-jam-2026-06-03`,
prize **Best Ode to Alan Turing**): produce a ~2:10 gameplay trailer auto-captured from the live
game and edited with ffmpeg, finalize the submission post, and refresh the live deploy.

## Deliverables

1. `press/lancefall-trailer.mp4` — ~2:10, 1080p60, captions (no VO), real game music bed.
2. `press/lancefall-trailer-poster.png` — a poster/thumbnail frame (the FIRST LIGHT tableau).
3. Finalized `docs/SOLSTICE_JAM_SUBMISSION.md` — 3 embed slots filled (video, repo, screenshots),
   every feature claim fact-checked against the shipped build.
4. Fresh deploy of `lancefall.pages.dev` (working tree as-is, per owner).
5. An upload/publish checklist for the owner-only steps (YouTube upload, dev.to publish).

## Trailer beats

| # | Time | On screen | Caption |
|---|------|-----------|---------|
| 1 | 0:00–0:12 | Title from noise; grey city; THE FALL story card | Lancefall was a kingdom of living light. The Six who let it fall enciphered it into grey. |
| 2 | 0:12–0:26 | Cockpit; first charge-dash through a cluster; i-frame phase | You are the last key. You don't shoot — you dash a spear of light. |
| 3 | 0:26–0:42 | Combo climbs; grey→neon COHERENCE wash; choir layer | Chain the kills. The grey burns off. The city remembers. |
| 4 | 0:42–1:08 | HERO: boss cipher-lock HUD (word + KEY + glyph cores); read key, dash cores in order, a wrong dash fizzles, cores flip green, armor cracks | Every boss is a cipher. READ THE KEY — decode it under fire. |
| 5 | 1:08–1:34 | Breadth: SOLSTICE PROTOCOL named, Mirrorblade (imitation game), modes rail, perk draft, ships, Heat, biomes, bestiary | SOLSTICE PROTOCOL: every boss, a code. 6 ships · drafts · a daily everyone shares. |
| 6 | 1:34–1:48 | DAYBREAK ultimate; LAST BREATH bullet-time second wind | Charge DAYBREAK. A death isn't always the end. |
| 7 | 1:48–2:05 | Sovereign cracks → THE CHOICE (halting problem) → FIRST LIGHT daybreak floods gold | The one cipher no machine can solve — only choose. Bring back the longest day. |
| 8 | 2:05–2:12 | End card: LANCEFALL · THE LAST KEY · lancefall.pages.dev · "June Game Jam — an ode to Alan Turing" | — |

## Architecture

**Capture must run against `npm run dev`** — the bot + cipher-solver rely on `window.__lf` (dev-only)
and dynamic `/src/*.ts` imports that only the Vite dev server serves. The deploy is a separate concern
(the public site).

- `tools/trailer/capture.mjs` (new) — Playwright (headed/GPU chromium) loads the dev server, seeds the
  save (unlock ships/heat/biomes for showcase), and per beat: drives the game state (start a mode, open
  panels via `__lf.ui.*` like `tools/ui-capture`, run the bot), records the `#game` canvas at 60fps via
  `MediaRecorder(canvas.captureStream(60))`, and writes each clip to `tools/trailer/clips/<beat>.webm`.
  Pulls the blob to disk as base64 over `page.evaluate`.
- Bot: inject `tools/balance-bot.js` (the skilled autopilot) to play live. Extend with a **cipher-solver**
  (`tools/trailer/cipher-pilot.mjs` injected snippet): read the live cipher state (`cipher.order` = the
  correct dash sequence, `cipher.progress`) and steer the bot to dash the core at `order[progress]` — a
  genuine on-camera decode incl. a real fizzle. **Fallback:** if a clean live solve is flaky in the time
  available, beat 4 uses `press/gameplay-cipher.png` + the auto-recorded FIRST LIGHT GIF; the report says
  honestly which was used.
- `tools/trailer/edit.sh` (new, ffmpeg 8.1) — concat clips with cross-fades, burn lower-third captions
  + title/end cards, lay the music bed (`audio-src/flagship/masters/*.mp3` CC-BY + AURORA stems building
  to chorus on FIRST LIGHT) + a few SFX accents, letterbox/grade, export the .mp4 + poster.

## Audio

Real game music, already license-cleared in `docs/audio/CREDITS.md` (Punch Deck / FSM Team, CC-BY —
attribution carried in the post + end card). AURORA stems `verse→build→chorus/drop` timed so the swell
lands on FIRST LIGHT. SFX accents from `audio-src/flagship/.../sfx/` on dash/last-breath/overdrive beats.

## Sequence

1. Deploy `lancefall.pages.dev` (working tree as-is). Verify `npm run build` is green + prod boot clean first.
2. Build capture harness + cipher-solver; capture all beats from a local dev server.
3. Build edit pipeline; assemble; review frame-by-frame; iterate.
4. Finalize the dev.to post + screenshots + repo link + fact-check (parallel subagent).
5. Hand off the .mp4 + the owner-only upload/publish steps.

## Risks

- **Live cipher solve flakiness** → still+GIF fallback for beat 4 (above).
- **Headless canvas/WebGL perf** → use headed chromium with GPU; cap capture to the beat length; the game
  is Canvas 2D (not WebGL) so `captureStream` is reliable.
- **Concurrent-agent working tree** → commit ONLY new trailer files (never a wholesale `git add`).
