# WS-6 — Story / Rename pass (LANCEFALL v6)

**Date:** 2026-06-14 · **Branch base:** `lastlance` · **Status:** spec, awaiting review

## Goal

A "less-cheesy story that keeps the light/dark theme" (v6 mission #6). Concretely:

1. Rename the OVERDRIVE ultimate **"REMEMBER EVERYTHING" → "DAYBREAK"** so it stops colliding with
   the game's pervasive *remember* motif (Memory Fragments, "remember the fall", the whole lore).
2. Give the combo tiers **6 rising narrator lines** that show the city relighting instead of reciting
   the number.
3. Shift the fallen-boss quotes from **taunt → regret** (keep the noir dossier prose).
4. Fix THE CHOICE's player-flattering line ("…remembers your name").
5. A **heavier restraint pass** over `lore.ts` — terser noir prose, same beats.

## Non-negotiable invariant

**Text-only. Zero `world.rng` / sim / save-schema changes — the Daily stays bit-identical.**
`narrator.comboTier` is a keyed lookup (no rng draw), so adding the two missing tiers changes no
draw count. The tagline `"remember the fall"` (ui.ts:266) is kept as the one deliberate echo, and
`"Lancefall remembers itself"` is kept as the earned victory motif — only *cheesy/redundant* uses go.

## Blast radius (verified line refs — the v6 prompt's were stale)

| File | Sites |
|------|-------|
| `src/game.ts` | 517 (floatText), 529 (announce), 530 (comment) |
| `src/ui.ts` | 240 (odLabel init), 771 (HOW-TO-PLAY rule), 1225 (HUD ready/idle label) |
| `src/achievements.ts` | 53, 54 (descs) |
| `src/narrator.ts` | 51-56 (comboTier), 66-73 (bossKill.warden quote) |
| `src/bestiary.ts` | 31-36 (boss blurb quotes) |
| `src/stillpoint.ts` | 16 (THE CHOICE `catch` line) |
| `src/lore.ts` | 14-87 (heavier restraint edit) |
| `src/narrator.test.ts` | 98 (strengthen comboTier coverage 4 → 6) |

### Test safety (checked)
- `achievements.test.ts` keys off ids (`unleashed`/`overcharged`), not descs → rename safe.
- `coherence.test.ts` tests the numeric `comboTier()` fn, not narrator strings → safe.
- `narrator.test.ts:91` asserts every `bossKill[k]` truthy → keep all keys non-empty.
- `narrator.test.ts:98` asserts `comboTier[10|20|50|100]` truthy → **update** to `[10,20,35,50,75,100]`.
- `stillpoint.test.ts` asserts head distinctness + `none.line.length>0` → heads unchanged, line non-empty → safe.

---

## 1. The ultimate → DAYBREAK

- `game.ts:517` `` `REMEMBER EVERYTHING +${bonus...}` `` → `` `DAYBREAK +${bonus...}` ``
- `game.ts:529` `announce('REMEMBER EVERYTHING', …)` → `announce('DAYBREAK', …)`
- `game.ts:530` comment → `// THE DROP — DAYBREAK floods the world back to neon`
- `ui.ts:240` odLabel init `'REMEMBER'` → `'DAYBREAK'`
- `ui.ts:771` HOW-TO-PLAY rule title `'REMEMBER EVERYTHING'` → `'DAYBREAK'`
- `ui.ts:1225` ready `'REMEMBER EVERYTHING READY [F]'` → `'DAYBREAK READY [F]'`; idle `'REMEMBER'` → `'DAYBREAK'` (cooldown `FADING Ns` unchanged)
- `achievements.ts:53` desc → `'Fire DAYBREAK.'`
- `achievements.ts:54` desc → `'Fire DAYBREAK 4 times in a single run.'`

Achievement *names* (`Unleashed`, `Overcharged`) and ids unchanged.

## 2. Combo-tier narrator lines (6, no countdown)

`narrator.ts` `comboTier` keyed by the 6 cut points (`COHERENCE.tierCombo = [10,20,35,50,75,100]`):

| Combo | Tier | New line |
|---|---|---|
| 10 | RAMPAGE | `A window lights. Then another.` |
| 20 | FRENZY | `The street comes back, lamp by lamp.` |
| 35 | CARNAGE | `A whole quarter burns awake.` |
| 50 | UNSTOPPABLE | `The skyline catches. The dark gives ground.` |
| 75 | GODLIKE | `Lancefall blazes. Nothing here forgets now.` |
| 100 | LEGENDARY | `The city stands whole, and the night is yours.` |

Update `narrator.test.ts:98` loop to `[10, 20, 35, 50, 75, 100]`.

## 3. Boss quotes — taunt → regret (dossier prose kept verbatim)

`bestiary.ts` blurbs — change only the quoted sentence:
- **warden**: `"I only locked the doors you forgot to guard."` → `"I bolted the gates from the inside. I called it duty."`
- **weaver**: `"I unspun every thread that held you."` → `"I unspun the reasons to fight. I thought forgetting was mercy."`
- **beacon**: `"I shone for everyone but you."` → `"I let the call go dark. I still hear it."`
- **mirrorblade**: `"You were always going to falter. I'm the proof."` → `"You were always going to falter. I'm only the first to say it."` *(stays a doubt-voice — it is not one of the Six, so regret doesn't fit; just less of a cheap gloat)*
- **hollow**: `"There was nothing left in me to hold."` → kept (already regret)
- **sovereign**: `"I was the kingdom. I chose to let it end."` → kept (already regret)

`narrator.ts` `bossKill.warden`: `'"I only locked the doors you forgot."'` → `'"I bolted them from the inside. Forgive me."'`
(Other `bossKill` / `bossApproach` entries are descriptive, not taunts — left as-is.)

## 4. THE CHOICE (`stillpoint.ts`) — heads unchanged

- `catch` (line 16): `'You caught it. The light holds. The city remembers your name.'`
  → `'You caught it. The light holds. The city wakes, and goes on.'`
- `fall` (line 18): unchanged.
- `none` (line 19) `'Lancefall remembers itself.'`: kept (deliberate victory echo).

## 5. lore.ts — heavier restraint edit (same beats, terser noir)

- **first-light** → `Before the battlefield, a kingdom. Before the kingdom, one light someone refused to let go out. They built Lancefall around it, tower by tower, so the dark would always have somewhere to fail.`
- **long-evening** → `No kingdom falls in a night. Lancefall fell over a hundred quiet evenings — a door unguarded, a record unkept, a call unanswered. Each too small to call the end.`
- **the-fall** → `When it came, it came as silence. The bells did not ring. The beacon did not turn. Everyone had believed someone else was holding the line. The line had been theirs.`
- **warden-lore** → `He loved the gates more than the people behind them. Forty years he held them against every enemy — then, on the last night, against the only ones who could have saved the city. He forgot which side of the wall he was on.`
- **weaver-lore** → `She kept the kingdom's memory — every name, every debt, every promise. When the fear came, she unspun the parts that hurt, until no one could say why the city was worth dying for. A kindness, she called it.`
- **beacon-lore** → `His one duty was to turn the light when help was needed. On the last night it stayed dark, and the ships that might have come never knew to set out. He told himself the danger would pass.`
- **mirror-lore** → `The Mirrorblade is not one of the Six. It is the doubt you carry down — that you will falter, that the city is already gone. It fights in your colour because it is you. You beat it by meaning it more.`
- **hollow-lore** → `The last to leave was the one who could not. Grief hollowed them until nothing held its shape — only the mourning, untouchable, until for one clean moment it remembers it was real. Strike then. It is a mercy.`
- **sovereign-lore** → `The Sovereign could have saved everything. There is always a moment when one word would turn it; the Sovereign chose the crown instead. Now it warps the ground itself to stop you undoing that choice. To win is to prove the moment was real.`
- **last-lance** → `You are not a soldier. You are the kingdom's last memory of itself, given one spear of light and sent back down through its own fall. Every dash is the city refusing to forget.`
- **echo** → `Each day a different citizen wakes inside the memory and lives one ordinary moment again — the bells, the markets, the gardens. The same echo for everyone, on the same day. It is not much. It is everything left.`
- **what-remains** → `You cannot stop the fall. You were never meant to. You are here to decide what it was worth — to catch the light, or to let it go — and to prove that a dead thing remembered is not entirely dead. Hold it here. As long as you can.`

(Entry `id`/`title`/`cost` unchanged — only `text`. Curly apostrophes match the existing file style.)

## Definition of done

- All sites above changed; `grep -ri "remember everything"` returns nothing.
- `npx tsc --noEmit` clean · `npm test` green (incl. updated `narrator.test.ts`) · `npm run build` clean.
- In-browser: fire DAYBREAK (HUD + announce read DAYBREAK); cross combo tiers and see the new lines;
  CODEX boss blurbs show the regret quotes; no console errors.
- Daily golden-replay byte-identical (no sim file touched — trivially true, but spot-check).
- One commit (text-only logical change), Co-Authored-By trailer.
