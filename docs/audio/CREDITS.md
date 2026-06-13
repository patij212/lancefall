# Flagship Audio Credits

Every shipped asset under `public/audio/flagship/` is free-licensed and recorded in
`public/audio/flagship/provenance.json`. The **CC-BY** music below **requires attribution** — these
lines must appear on the in-game credits screen before the flagship audio ships (Task 12/13).

## Music — CC BY (attribution required)

The **AURORA arena** rotates through four distinct energetic tracks; the **WARDEN boss** is one dark
track. Each was trimmed to a bar-aligned loop + loudness-normalised by `tools/audio/conform-flagship.mjs`
(CC BY permits derivatives).

- **"Magenta Metropolis"** by **FSM Team & \<e s c p\>** (107 BPM) — arena.
  <https://www.free-stock-music.com/fsm-team-escp-magenta-metropolis.html> · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **"Cyberpunk Renaissance"** by **Punch Deck** (110 BPM) — arena.
  <https://www.free-stock-music.com/punch-deck-cyberpunk-renaissance.html> · [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
- **"Afterglow Love"** by **FSM Team & \<e s c p\>** (120 BPM) — arena.
  <https://www.free-stock-music.com/fsm-team-escp-afterglow-love.html> · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **"Neon Drive"** by **Punch Deck** (96 BPM) — arena.
  <https://www.free-stock-music.com/punch-deck-neon-drive.html> · [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
- **"Cyber Thriller"** by **FSM Team & \<e s c p\>** (112 BPM) — WARDEN boss.
  <https://www.free-stock-music.com/fsm-team-escp-cyber-thriller.html> · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

The procedural **LANCE THEME** motif and beat layer remain original to LANCEFALL.

## SFX — CC0 (no attribution required)

All combat/boss SFX are from **Kenney** (<https://kenney.nl>), licensed
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — public domain, crediting optional.
We credit them gratefully anyway:

| SFX ids | Kenney pack |
|---|---|
| `lance_hit` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| `perfect_dash` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `dash_fire`, `overdrive`, `last_breath`, `warden_arrival`, `warden_phase`, `warden_fan`, `warden_defeat` | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) |

> These are auto-selected first-pass picks (scaled to each cue's role). Swapping any one is a single
> file under `audio-src/flagship/sfx/` + a re-run of `npm run audio:conform && audio:encode`.
