# LANCEFALL — Jam Submission Kit

> **Status: DRAFT for review.** Everything here is copy/scripts for *you* to publish, upload, or
> record. Nothing in this file is posted anywhere. Edit the voice to taste, then ship.
> Every feature claim below is drawn from the shipped build (README + code) — judges will *play*
> it, so it's deliberately not over-promised. If you cut a feature before submit, cut it here too.

- **Title:** LANCEFALL — *The Last Key* edition
- **Jam:** June Solstice Game Jam (an ode to Alan Turing)
- **Play (no download, ~60 fps, one browser tab):** https://lancefall.pages.dev
- **Genre:** neon dash-combat bullet-hell roguelite
- **Engine:** Vite + vanilla TypeScript · Canvas 2D · Web Audio · ~125 KB gzipped client · 800+ unit tests
- **Theme fit:** *solstice = the longest day*; the fall of the city was an **encryption** into grey
  noise, and you are the last **key** — break each boss's cipher-lock to decrypt the world back
  into light. The final choice is the one cipher no machine can solve, only choose.
- **Controls:** keyboard+mouse / gamepad / touch (twin sticks). Rebindable. Casual mode for run 1.
- **Price:** pay-what-you-want.
- **Assets (in `../press/`):** `og-card.png` (1200×630 social/OG card) · `firstlight-winframe.png` (the
  hero / itch cover) · `gameplay-cipher.png` (READ THE KEY mid-decode) · `the-choice.png` ·
  `title-cockpit.png` · `skins-gallery.png` · `how-to.png`. All captured from the live build; the
  three gameplay shots came from the pre-submit QA sweep.

---

## 1 · itch.io page copy

### Tagline (one line, for the page header + jam card)
> You don't shoot. You **dash** — and the city you're saving is a code you have to break.

### Short description (≤ 200 chars, for the jam listing / social embeds)
> A neon dash-combat bullet-hell where your only weapon is a momentum spear. Read each boss's
> cipher-lock and dash its glyph-cores in the decoded order to decrypt the city back to light.
> Browser, 60 fps, no download.

### The pitch (page body — lead)

**Lancefall fell because someone scrambled its light into grey noise.** You are the last key.

You don't have a gun. You have a **dash**: hold to charge a thrust, release to rocket through the
swarm leaving a glowing **spear-trail** that shreds everything it touches. Phase through a wall of
bullets, skewer four enemies in one line, land, drift, recharge, repeat — chaining kills before
the combo decays. Greed versus survival, sixty frames a second, in a single tab.

And every boss is **locked**. It stays armored until you **READ THE KEY** — the legend maps each
ciphered symbol to a letter — then dash the boss's glyph-cores in the order that spells the
message. Crack the code and the world saturates back from grey to neon. Crack the last one and
the screen breaks into **FIRST LIGHT** — the longest day. The very final lock is **THE CHOICE**:
the one cipher no machine can decide, only you can (yes, that's the halting problem; yes, the
mirror-boss is the imitation game).

*memory = light-code · forgetting = encryption · remembering = decryption.*

### What you actually do (page body — features)

- ⚔️ **One verb, deep skill** — charge-dash with i-frames, momentum carry, and a swept spear that
  never tunnels. The whole game is *when* and *where* you commit the dash.
- 🗝️ **READ THE KEY** — boss cipher-locks turn code-breaking into a played act: read the
  substitution legend, decode under fire, dash the cores in order. A wrong dash is forgiving
  (you keep your progress). Zero RNG — the Daily's cipher is identical for everyone.
- 🪢 **COHERENCE** — one dial binds sight + sound + meaning. Chain kills and dash *on the beat* and
  the grey City of Lancefall lights up neon and the score swells to a choir. Drop the chain and a
  street goes dark again. (All a11y-safe: the felt full-screen version dies under reduce-flashing,
  reduce-motion, and Clarity.)
- 🎮 **7 modes + a weekly board** — **Casual** (suggested for run 1, off-board) · Endless · **Arena**
  (a 15-wave / 6-boss gauntlet you can *win*) · **SOLSTICE PROTOCOL** (every boss is a cipher-lock —
  the code-breaking showcase) · **ECHO OF THE FALL** (the seeded daily + a rotating mutator) ·
  **Nightmare** (sudden-death, the walls close in) · **Boss Rush** — plus a **WEEKLY SIEGE** board.
- 💀 **12 enemies + gold-aura Champions + 6 bosses**, all shape-coded for colorblind play —
  darters, orbiters, splitters, snipers, bombers, wisp swarms, the gap-wall HERALD, the homing
  SEEKER… up to **THE SOVEREIGN**, the master cipher.
- 🧬 **Roguelite depth** — an 11-card perk draft (they stack) with 7 **fusion evolutions**, build
  archetypes, cursed relics, shareable **Build DNA** codes, evolving biomes that twist the rules,
  an 8-level **Heat** prestige ladder, a 12-node meta tree, and 6 ships that each play differently.
- 🛡️ **ARMOR + LAST BREATH** — a shield cushion soaks a lethal hit and opens an escape lane; the
  next fatal hit triggers a bullet-time second wind. A death isn't always the end.
- 🏅 **Optional online leaderboards** (per-mode + a shared Daily) — fully offline-first; the game is
  identical without them.
- 🎨 **Cosmetics** — palette themes, dash-trail unlocks, and a 76-skin biomech enemy gallery you
  unlock through achievements.
- ♿ **Built for everyone** — reduce-flashing, reduce-motion, colorblind shapes, Clarity high-contrast
  mode, shake slider, HUD scale, full volume mixer, rebindable keys, a no-fail dash tutorial, and
  first-appearance jargon glosses so nothing is fired at you unexplained.

### Controls (page body — verbatim table)

| Action | Keyboard / Mouse | Gamepad | Touch |
|--------|------------------|---------|-------|
| Move | `WASD` / arrows | left stick | left thumb-zone |
| Aim | mouse | right stick | drag right thumb |
| Dash | **tap** for a short dash, **hold → release** to charge the long spear (`Space`/`J`/LMB) | `A` / `RT` | hold + release right thumb |
| DAYBREAK (ultimate) | `F` | `LB` | — |
| Pause | `Esc` / `P` | Start | on-screen ⏸ |

> New here? **Casual** is the suggested mode for your first run — more ARMOR, a softer one-hit rule,
> assist highlights on. It's off the leaderboards so the boards stay honest.

### Made with (page body — footer)
Vite + vanilla TypeScript, Canvas 2D, Web Audio — no engine, no framework, ~125 KB gzipped, 800+
unit tests over the deterministic core. Built in a focused multi-agent session for the June
Solstice Jam. CC0/CC-BY/Pixabay audio with a machine-checked license ledger. MIT-licensed source.

---

## 2 · ~90-second trailer — shot list + captions

> Capture at 1080p/60 from `lancefall.pages.dev`. The build already auto-records the FIRST LIGHT
> beat as a 6 s GIF (the share artifact) — use that clip for beat 8 if a clean live take is hard.
> Music: let the in-game COHERENCE swell carry it; the choir bloom lands on FIRST LIGHT. No VO
> required — on-screen captions (below) are enough — but a calm single-line VO over the open works.

| # | ~time | On screen | Caption (lower third) |
|---|------|-----------|------------------------|
| 1 | 0–6s | Grey, desaturated city; lone-drone hum; the title glyph resolves from noise | *Lancefall fell. Its light was scrambled into grey.* |
| 2 | 6–14s | One clean **charge-dash** through a small group — spear trail, i-frame phase through a bullet line | *You don't shoot. You dash.* |
| 3 | 14–24s | Combo climbs; kills chain; `RAMPAGE → FRENZY` callouts; world starts tinting neon | *Chain the kills. Light the city.* |
| 4 | 24–34s | COHERENCE high: full neon wash, city skyline glowing, choir layer in, dash-on-beat ring pops | *COHERENCE — sight, sound, and meaning, bound.* |
| 5 | 34–48s | A **boss cipher-lock**: HUD shows READ THE KEY legend + message; player decodes and dashes glyph-cores in order; cores flip green | *Every boss is a code. READ THE KEY.* |
| 6 | 48–56s | **DAYBREAK** ultimate fires — time slows, screen-clearing burst of light | *Charge DAYBREAK. Break the dark.* |
| 7 | 56–66s | A near-death: **LAST BREATH** bullet-time second wind, clutch dash to safety | *A death isn't always the end.* |
| 8 | 66–80s | The **Sovereign** cracks → hard cross-fade to **FIRST LIGHT**: warm gold day, vignette inverts to a bloom halo, ~2 s slow-mo, choir+lead full, frozen tableau | *THE LONGEST DAY.* |
| 9 | 80–88s | **THE CHOICE** cards (hold the light / let it go) — hold a beat on the decision | *The one cipher no machine can solve.* |
| 10 | 88–90s | End card: LANCEFALL logo · `lancefall.pages.dev` · "June Solstice Jam · an ode to Alan Turing" | — |

**Thumbnail / hero image:** the FIRST LIGHT frame (beat 8) — gold skyline, bloom halo, the lone
spear silhouette. It's the one image the whole game points at.

---

## 3 · Announcement post

### Micro (X / Mastodon / Bluesky, ≤ 280)
> ⚔️🗝️ LANCEFALL — *The Last Key*. A neon dash-combat bullet-hell for the June Solstice Jam. You
> don't shoot — you dash a momentum spear through the swarm. And every boss is a cipher you have to
> *read* and break to decrypt the city back to light. Browser, 60fps, no download:
> lancefall.pages.dev

### Forum / itch devlog (longer)

**LANCEFALL — break the code, bring back the longest day.**

For the June Solstice Jam (an ode to Alan Turing) I built a neon dash-combat bullet-hell with one
idea at its center: *the fall of the city was an encryption, and you are the key.*

You have no gun. Your only weapon is a **momentum dash** — charge it, release, and spear through a
wall of bullets, killing everything your glowing trail touches, then land and recharge. Chain kills
before the combo decays and one dial called **COHERENCE** lights the grey city back to neon and
swells the music to a choir. Let the chain die and a street goes dark.

The twist is the bosses. Each one is **cipher-locked** — armored until you READ THE KEY: a
substitution legend maps ciphered symbols to letters, and you have to decode the message and dash
the boss's glyph-cores *in the decoded order*, under fire. It's code-breaking as a played act —
Turing's "rule out what contradicts," at 60 fps. The cipher draws zero RNG, so the Daily's lock is
identical for everyone. The final boss is the master cipher; the very last lock is **THE CHOICE** —
the one cipher no machine can decide, only you (the halting problem), and the mirror-boss is the
imitation game.

It's a full roguelite under the hood: 7 modes (one you can actually *win*), 6 bosses, 12 enemies, a
stacking perk draft with fusion evolutions, build archetypes, cursed relics, shareable build codes,
an 8-level Heat ladder, 6 ships, evolving biomes, optional leaderboards, and a 76-skin enemy
gallery. Plus a no-fail tutorial, a Casual mode for run 1, and a deep accessibility menu
(reduce-flashing/-motion, colorblind shapes, Clarity high-contrast, rebindable keys).

No engine, no framework — Vite + vanilla TypeScript, Canvas 2D, Web Audio, ~125 KB gzipped, 800+
unit tests over the deterministic core. Plays in a browser tab, no download.

▶️ **Play:** https://lancefall.pages.dev
Feedback very welcome — especially on the cipher-locks and difficulty.

---

## 4 · Pre-submit checklist

- [ ] Final deploy is live and matches the submitted build (`npm run build` → `npm run deploy`).
- [ ] Hard-refresh `lancefall.pages.dev` in a clean profile: title loads, a full run plays, a boss
      cipher solves, FIRST LIGHT fires, THE CHOICE resolves, no console errors.
- [x] Screenshots captured to `../press/` (title cockpit · cipher-lock · FIRST LIGHT · THE CHOICE ·
      skins · how-to) + a branded `og-card.png`. FIRST LIGHT = the hero image. (Optionally grab a
      fresh mid-combat action shot live — the rest are done.)
- [ ] Record / assemble the ~90 s trailer (or use the auto-captured FIRST LIGHT GIF as the lead).
- [ ] Confirm the in-game **credits** screen lists the CC-BY audio (see `docs/audio/CREDITS.md`).
- [ ] Leaderboard: either the Worker is deployed (boards live) or the page text reads "unverified /
      offline-first" honestly — don't imply server-verified scores.
- [ ] itch.io page: embed the build *or* link `lancefall.pages.dev`; set PWYW; paste §1 copy;
      controls table; accessibility note; "made with" footer; jam tag.
- [ ] Submit to the jam with the trailer/GIF as the cover, before the deadline.
- [ ] Post §3 (micro + devlog) once the page is live.
