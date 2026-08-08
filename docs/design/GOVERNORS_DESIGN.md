# B-24 design — era score / Ages + governors (loyalty modulation), task #68

2026-07-20. Brief-first. SERIAL main-session S1-S3 + one Opus S4
coverage agent (the B6/B9 shape — S2 and S3 both reshuffle loyalty
trajectories, the class of change that must not run in parallel
worktrees). ONE battery at the round end.

## Current state (verified against live code)

No era concept exists anywhere (core/ or data/). Loyalty runs
un-modulated at three sites: player cities `loyaltyDelta`/
`applyLoyalty` (phase.ts; pop-pressure within `LOYALTY_RANGE` 9,
`LOYALTY_PRESSURE_SCALE` 20, amenity term; capitals pinned
`LOYALTY_MAX`), rival cities at the seatPhase loop top (phase.ts
~2513, the applyLoyalty position), and the GPU twins (player loyalty
block + `rc_loyalty` at the `_rival_phase` loop top, engine.py
~10306). `rc_loyalty` is `_MUTABLE`; the statelog PC/RC lines carry
`loy`.

## Design (deliberate simplifications, real-Civ-6-shaped)

**Eras**: global, fixed-turn — `era = floor(turn / ERA_LENGTH)`,
`ERA_LENGTH` 50 (eras 0-4 in a 250t game). No per-civ tech-era
drift (recorded residual). Era transitions happen at the endTurn
loyalty position, both engines mirrored, AFTER `_apply_unit_actions`
(the B9 endTurn-top rule).

**Era score** (per-civ accumulator, unified ids 0 = player, r+1 =
rival; resets at each era boundary): integer, ZERO-DRAW, single-site
hooks in BOTH engines —
- found a city:            +2  (player settle + rival found sites)
- gain a city by transfer: +3  (every capture/flip family: player
  captures rc, rival captures player city, rc→rc, CS conquest —
  the winner's accumulator, at the transfer functions themselves)
- wonder completed:        +3  (player + rival completion sites)
- pantheon founded:        +1;  religion founded: +2
- Great Person earned:     +1  (both seats' claim sites)
Every hook is a plain `+= const` — no RNG, no ordering surface
beyond the site itself.

**Ages**: at each boundary (t = 50k), each civ's age for the new era
comes from the score accrued during the JUST-ENDED era:
Dark < `DARK_T` ≤ Normal < `GOLDEN_T` ≤ Golden. Era 0 is Normal for
everyone. THRESHOLDS ARE PINNED FROM S1 EVIDENCE (measure the
in-gate per-era score distribution; aim for all three ages occurring
in-gate) — the B-15 evidence-gated pattern.

**Loyalty modulation** (the B-24 headline): every pop-pressure
CONTRIBUTION scales by the SOURCE civ's age factor —
`AGE_PRESSURE` Dark 0.5 / Normal 1.0 / Golden 1.5. Applies at all
three loyalty sites (player own+foreign terms, rival own+foreign
terms, GPU twins). The amenity term and capital immunity are
untouched.

**Governors** (the +8 anchor, stateless): titles =
`min(GOV_MAX 5, floor(civicsCount / GOV_CIVICS_PER_TITLE 10))`.
Each turn, at the loyalty phase, a civ's titles are greedily
assigned to its LOWEST-loyalty alive cities (loyalty asc, then
acquisition order — city_seq / city id), one per city; an assigned
city adds `GOVERNOR_LOYALTY` +8 to its loyalty delta. Recomputed
every turn from civics + loyalty (NO persistent assignment state —
no new _MUTABLE surface beyond score/age, no churn bookkeeping).
Player and rivals symmetric. RESIDUALS (owner-confirmed list,
2026-07-20): governor establishment turns, promotions, non-loyalty
governor abilities; the DEDICATION system entirely — Golden Age
bonuses (Monumentality etc.), the Normal/Dark-age dedication that
converts to extra era-score accrual instead of a bonus, and the
HEROIC Age (a Dark→Golden transition grants THREE dedications —
needs the PREVIOUS age, so its substrate is a second civ_age
column/prevAge field when it lands); dark-age policies (special
cards). Ages currently modulate LOYALTY only.

## Stages

- S1 INERT substrate: eraScore accumulators (+ hooks) both engines,
  `age` tensors pinned Normal, nothing reads them; rules keys
  exported; statelog PT/RT lines gain `esc`/`age` fields (statelog
  is hunt-only — fixture traces untouched). Bar: zero behavior
  change, scripted parity 0.0. Then MEASURE: dump the in-gate
  per-era score distribution (24 seeds × 5 eras × 3 civs) → pin
  DARK_T/GOLDEN_T for S2.
- S2 AGES LIVE: boundary evaluation + the three-site pressure
  modulation + a COMPARED per-civ `age` trace column (both trace
  harnesses, same stage — the D-10 rule). Loyalty trajectories
  reshuffle: budget a hunt; seeds may die (reroll + document).
- S3 GOVERNORS: titles + greedy anchor at all three loyalty sites.
  Budget a hunt.
- S4 coverage agent: poke lane `governors` (event accrual per hook,
  boundary age math, pressure-factor arithmetic, greedy pick +
  the +8, capital immunity) + tests/governors.test.ts + the
  standalone poke sweep + ONE battery. AUDIT close-out: B-24 →
  ~85% (residuals above), completion table re-added.

## Standing rules

Gates ladder per stage; ZERO-DRAW everywhere (nothing here rolls);
every yield-bearing write bumps _eff_version (loyalty writes are NOT
yield-bearing — but a governor/age change that flips a city is the
existing transfer machinery, already disciplined); _MUTABLE for
eraScore/age; AUDIT anchors by SYMBOL; commit -F with trailers;
sweep ALL poke lanes standalone before the battery (catch-7);
re-verify experiments re-export after ANY TS-constant change.
