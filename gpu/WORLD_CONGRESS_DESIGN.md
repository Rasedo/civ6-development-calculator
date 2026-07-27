# B-22 — the WORLD CONGRESS programme (rounds #75+)

Status: design. Written during #74's gates.

The World Congress is the largest single item left in the AUDIT, and it is the
blocker on B-25's DIPLOMATIC victory — the last unmodeled victory condition.
It is too big for one round, so it is staged like the tourism substrate was.

## Source (verified 2026-07-27, per verify-before-implement)

Civilopedia (Gathering Storm) "World Congress" + Civilization wiki "Diplomatic
Favor (Civ6)" / "Victory (Civ6)":

- The Congress begins meeting once the game reaches the **MEDIEVAL era**, and
  convenes every **30 turns** on Standard speed.
- **Diplomatic Favor** is the currency. Per turn a civ earns favor equal to its
  **GOVERNMENT TIER** (1–4), plus **+1 per city-state it is Suzerain of**, plus
  favor from active alliances. It is *lost* for CO2, global grievances and
  occupying original capitals.
- Resolutions are voted on with favor; ties go to whoever spent the greater
  PERCENTAGE of their favor.
- **Diplomatic Victory requires 20 Diplomatic Victory Points**, awarded for
  performance in Emergencies and Scored Competitions.

## Why this is tractable here

Both prerequisites already exist in the engines:
- `GovernmentDef.tier` is already in the policy data (1–4), and government
  adoption is LIVE on both seats.
- Suzerainty is modeled for BOTH seats — `isSuzerain` (player) and
  `rivalIsSuzerain` (rival), on the same strictly-most-envoys/min-3 rule.
- Alliances exist on the rival↔rival axis (#72's `rr_allied`).
- Eras exist (`civEraIndex` / `_civ_era`), so the Medieval gate is available.
- Grievances now exist on BOTH seats as of #74 — which is exactly the favor
  PENALTY term, so the two halves meet.

## Slices

**S1 — DIPLOMATIC FAVOR accumulator.** Per-civ, zero-draw, integer:
`+governmentTier + suzerainCount` each turn, floored at 0 after the grievance
penalty. Traced as a compared column on both seats the day it lands (the
rule that has now caught three bugs). This is the same shape as the tourism
and lifetime-culture accumulators and should gate cleanly.

**S2 — SESSIONS + a resolution.** The Congress convenes at the first turn
multiple of 30 once ANY civ has reached the Medieval era. One deterministic
resolution to start (favor spent = votes, highest total wins, ties by
percentage-of-favor-spent then civ id). Zero-draw: the vote must be a
deterministic function of state, not a roll.

**S3 — DIPLOMATIC VICTORY POINTS + the win at 20.** victoryType 9 (player) /
10 (rival defeat), precedence after culture. Expect gate-unreachable at 250
turns — measure it and poke-pin, exactly as #72's culture victory was.

## Do not

Do not model CO2 (no climate system exists) or Emergencies/Scored Competitions
as such — award DVP from the resolution outcomes instead, and RECORD that
substitution as an explicit sourced deviation rather than letting it look like
the real rule.
