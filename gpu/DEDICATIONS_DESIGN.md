# B-24 — the NAMED DEDICATION catalog (round #72)

Status: design. Supersedes the generic dedication payout landed in #71
(`DEDICATION_FAITH` / `DEDICATION_ERA_SCORE`, a flat per-turn faith-or-era-score
scaled by the dedication COUNT). The substrate — `state.dedications` (count per
civ), `state.prevAges` (the Heroic-Age test), `applyDedications` called once per
turn from `endTurn` beside `eraBoundary` — stays exactly where it is; only the
PAYOUT becomes per-dedication.

## Source (verified 2026-07-27, per the verify-before-implement rule)

Civilopedia (Gathering Storm), "Dedications":
<https://www.civilopedia.net/en-US/gathering-storm/concepts/dedications/>

Each civ commits to one Dedication at every era boundary (three on a HEROIC
age). A dedication has TWO faces: the Dark/Normal face pays ERA SCORE off
specific events (the climb-out), the Golden face pays a standing BONUS and no
era score. Our #71 model collapsed all of that into one flat number per turn.

| # | Dedication | Eras | Dark/Normal (era score) | Golden (bonus) |
|---|---|---|---|---|
| 0 | Monumentality | Classical+ | +1 per specialty district built | +2 Builder movement; civilians purchasable with Faith; Builders/Settlers 30% cheaper with Faith/Gold |
| 1 | Free Inquiry | Classical+ | +1 per Eureka triggered | Eurekas give an extra 10% of the tech's cost |
| 2 | Pen, Brush, and Voice | Classical+ | +1 per Inspiration triggered | Inspirations give an extra 10% of the civic's cost; +1 Culture per specialty district per city |
| 3 | Reform the Coinage | Classical+ | +1 per trade route completed | Traders cannot be plundered; intl routes +3 Gold per specialty district in the foreign city |
| 4 | Exodus of the Evangelists | Classical+ | +2 per city converted to your religion | +4 Great Prophet points/turn; +2 movement and +2 charges for religious units |
| 5 | To Arms! | Classical+ | +1 per Corps kill, +2 per Army kill | +15% Production toward military units; a casus belli at 75%-reduced warmonger cost |
| 6 | Hic Sunt Dracones | Classical+ | +3 per new continent/natural wonder, +1 per non-barb naval kill | +2 Movement for naval units; +2 loyalty/turn off-capital-continent; +3 starting pop there |
| 7 | Heartbeat of Steam | Industrial+ | +2 per Industrial-or-later building built | +10% Production toward Industrial wonders; Campus science adjacency also pays Production |

Not modelable in either engine (recorded as residual, NOT implemented): Sky and
Stars (aerodromes/air units), Bodyguard of Lies (spies), Wish You Were Here
(artifacts/National Parks), Automaton Warfare (GDR/uranium).

## What this round implements

Deliberately partial and honest about it — the goal is to replace ONE flat
number with the real two-faced, event-keyed structure, not to ship 8×2 effects.

**PICK.** Deterministic and stateless, the `governorPicks` pattern: score every
AVAILABLE dedication (era window satisfied) with a fixed integer heuristic read
off the civ's own state, take the highest, ties by catalog index. Heroic ages
take the top `HEROIC_DEDICATIONS`. Stored as `state.dedicationPicks[civ]` — a
sorted index list — so the GPU can carry the identical `ded_pick` [B, C, 3] and
parity can compare a checksum.

**DARK/NORMAL face.** Event-keyed era score at hooks BOTH engines already have:
district completion (0), tech boost fired (1), civic boost fired (2), trade
route completed (3), city converted (4), Industrial+ building (7). Kills (5, 6)
ride the existing kill sites. Every one is a `+= const` at an existing call
site, so it is zero-draw and position-checkable.

**GOLDEN face.** Only the terms whose machinery exists: (1) the eureka overflow,
(2) the inspiration overflow and the per-district culture, (5) the military
production multiplier, (6) naval movement, (7) the Industrial-wonder multiplier.
(0)'s faith purchase and (3)'s plunder immunity ride existing residuals and are
recorded, not built.

**RETIREMENT.** `DEDICATION_FAITH` / `DEDICATION_ERA_SCORE` and the flat
`dedicationFaith`/`dedicationEraScore` pair go away with this round; the flat
faith they paid was a stand-in for Monumentality's faith purchases, which is
now on the residual list instead. That is a BEHAVIOUR change on both engines —
expect a fresh export and a full ladder, and expect the era-score distribution
to move (the Age thresholds `ERA_DARK_T`/`ERA_GOLDEN_T` were evidence-pinned to
the OLD distribution and must be re-measured, not re-tuned by hand).

## Trace

`dedicationPicks` needs a compared column or the pick can silently drift: a
per-civ checksum (sum of `(pick+1) * 10^slot`) on the HEAD row for the player
and on PER_RIVAL for each rival, tolerance 0.
