# B-20 — the TOURISM residuals (round #73)

Status: design. Written while #72's gates ran; supersedes nothing.

## Why this round, and why now

#72 put a NUMBER on these residuals. With only Great Works of Writing and
Music, Seaside Resorts and wonders feeding it, lifetime tourism reaches at most
**7 visiting tourists** over 250 turns while lifetime culture yields up to **97
domestic** ones — so B-25's culture victory, which landed correct and
poke-proven in #72, is unreachable by roughly **14x**. Closing the tourism
residuals is the thing that makes that condition live rather than merely
correct. That is a measurement, not a guess (`gpu/AUDIT.md`, B-20 entry).

## Source (verified 2026-07-27, per the verify-before-implement rule)

Civilization wiki, "Great Work (Civ6)" and "Relics" — Gathering Storm values:

| Item | Culture | Faith | Tourism | Held in |
|---|---|---|---|---|
| Great Work of Writing | 2 | — | 2 | Amphitheater (2 slots) — ALREADY MODELED |
| Great Work of Music | 4 | — | 4 | Broadcast Center / Museum — ALREADY MODELED |
| Great Work of **Art** | 2 | — | 2 | Art Museum (3 slots) — **MISSING** |
| **Relic** | — | 4 | 8 | Temple / Reliquary slots — **MISSING** |
| **Artifact** | — | — | — | Archaeological Museum (6 slots) — **MISSING** |

Note the GS nerf: Art is 2/2 in Gathering Storm (it was 4/4 in vanilla and
Rise & Fall). Relics are the single densest tourism source in the game at 8
apiece, which is precisely why their absence dominates the 14x gap.

## Slices

**S1 — Great Works of ART.** The smallest and most mechanical: a third
per-city counter beside `greatWorksWriting` / `greatWorksMusic`, produced by
the existing Great ARTIST class (which already exists as a GP class), capped by
Art Museum slots, paying 2 culture + 2 tourism. Follows #70/S1's per-kind split
exactly, so both the yield path and the tourism accumulator already have the
shape.

**S2 — RELICS.** Produced when an Apostle dies defending its religion (real
Civ 6's Martyr promotion) — the engines already model apostle lifecycle and
theological combat, so the death site exists. Each relic pays 4 faith + 8
tourism. Held in Temple slots.

**S3 (stretch) — ARTIFACTS + archaeology.** Needs an Archaeologist unit and dig
sites; this is a genuinely new subsystem, not an extension. Recorded as a
residual unless S1/S2 land cheaply.

**Explicitly NOT in this round:** National Parks (needs the naturalist unit +
a multi-tile park shape) and the Printing doubling (a modifier on an
already-modeled term, cheap but only meaningful once the base sources exist).

## Re-measure at the end

After S1+S2 land, RE-RUN the #72 reachability probe (visiting vs domestic
tourists across the 24 seeds at 250t) and record the new gap in the AUDIT. If
the culture victory becomes gate-REACHABLE, that is a behaviour change to the
gate itself and must be called out — a game that now ends early changes every
downstream column.
