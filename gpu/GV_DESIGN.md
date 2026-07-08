# G-V design — victory conditions & the 300-turn horizon

Status: IN PROGRESS (2026-07-08). GV-1 (winner indicator) SHIPPED 753a451;
GV-2 (game-end gameOver+winner) SHIPPED f1d2072+3ccb9fd; TURN_LIMIT=250 set.
Also shipped en route: the horizon-300 pool-cap fix (765ab4f) and the GS-1
game-speed infra + 3 latent-bug fixes incl. farm-adjacency (9feacaa). REMAINING:
GV-3 domination, GV-4 score victory, GV-5 bankruptcy — plus the deferred 0.6x
Online-speed ACTIVATION (its off-script latent tail: see [[engine-pivot]]).
Diagnosis (BUILD_PLAN §5 G-V): a competent player sustains a 300-turn game
(~285 plateau); the real gaps are (a) no late-game OBJECTIVE (score flat past
t200) and (b) no bankruptcy (treasury → −1491). Every slice = /gate-stage +
/port-mechanic; TS is spec.

## The objective problem
Today "champion" = empireScore at t100. That is not a Civ 6 victory. G-V makes
the objective a real victory race so a longer horizon MEANS something. We do
NOT need every victory at once — SCORE + DOMINATION cover the strategic core;
science/culture/religious arrive with their systems (G-R etc.).

## Slice order (each independently gated)

### GV-1  Winner indicator (INERT) — the foundation
Compute, each turn, the current score-leader across all civs; expose as state
+ trace. NOTHING acts on it (games still run full horizon). Behavior-preserving
→ fixtures byte-identical, one new trace column.
- **Blocker resolved first + RECON (2026-07-08)**: TS has no rival empire
  score. The GPU's `rival_score(r)` EXISTS but is a quirky reward-only
  approximation — DO NOT mirror it: it counts building-only gold/faith and,
  after VP-G1, INCONSISTENTLY discards worked-tile gold (`_g`); faith is not
  even returned by `_rival_city_yields` (which yields f,pr,sc,cu,gold). So
  GV-1 defines a CLEAN rival score matching the PLAYER's
  `empireScore('balanced')` = Σcity pop*3 + Σ_k yields[k]·BALANCED_WEIGHTS[k]
  over ALL SIX yields. Work: (a) GPU `_rival_city_yields` must also return
  FAITH (add the col like VP-G1 added gold); (b) TS `rivalEmpireScore` = Σrc
  pop*3 + Σ_k rivalCityYields(state,rival,rc)[k]·BALANCED_WEIGHTS[k] (the TS
  yields fn already returns full Yields, seat-trace-proven); (c) a NEW clean
  GPU `rival_empire_score` (not the reward helper) using the 6-yield return.
  Gate: trace each rival's clean score, prove TS==GPU turn-exact (float
  association: mirror empireScore's per-city accumulation order) BEFORE any
  winner uses it. The reward-helper `rival_score` stays as-is (training-only).
- Then `state.leader: number` = argmax(playerScore, rivalScores...) as unified
  civ id (player=0, rival r = r+1 per civOfRival). Trace column `leader`.
- GPU: `self.leader` mirror. Canary: a game where the lead changes hands must
  flip `leader` identically in both engines.

### GV-2  Game-end semantics (ACTIVE) — behavior change
`state.gameOver` true at turn >= TURN_LIMIT (config, default keep 100 for the
gate; 300 for the long game). On gameOver the sim FREEZES (no further yields/
growth/combat) and `winner = leader`. Env/trainer already stop at horizon, so
at TURN_LIMIT==horizon this is inert for training; it matters when we run
PAST a victory turn. Baselines unaffected at horizon-100. Trace `gameOver`.

### GV-3  Domination victory
A civ wins immediately when it holds ALL capitals (its own + every rival's
captured). Capture machinery exists (V-W2 both ways). Needs: a `capital` flag
per city/rc (the FIRST-founded), `capitalsHeld(civ)`, and the all-capitals
check each turn → sets gameOver+winner early. Parity: capital flag is static
per city (set at founding), traced. The check is a reduction over ownership.

### GV-4  Score victory
At TURN_LIMIT with no earlier victory, winner = leader (GV-1). Mostly falls
out of GV-1+GV-2; formalize + trace.

### GV-5  Bankruptcy (the diagnostic bug) — DELETES UNITS, parity-delicate
Civ 6: at negative treasury, disband units until solvent. This is the riskiest
slice — deleting a player unit shifts the append-only unit set both engines
mirror. Design:
- Trigger: after the gold-settle each turn, while `treasury < 0`, disband the
  unit with the HIGHEST maintenance (ties → lowest unit id / spawn index — a
  DETERMINISTIC order both engines must share exactly), refund nothing, repeat
  until solvent or no units left.
- Parity: TS `state.units` is an array (compacts on death); GPU is append-only
  slots keyed by id/tile. Disband must pick the SAME unit in both. The tie-key
  MUST be the spawn/id order, not array position. Prove with a forced-bankrupt
  poke test (manufacture negative gold, assert identical unit sets after).
- Behavior-preserving at the gate? Scripted play stays gold-POSITIVE at t100
  (audit: 238g), so the trigger never fires in gate games → fixtures identical,
  like the pool bump. Only bites the long/over-spending game. Verify: assert no
  gate game goes negative by t100 before claiming inert.

## Sequencing note
GV-1 (winner indicator, needs the TS rival-score) is the keystone — do it
first and gate it hard; GV-2/3/4 build on it cheaply. GV-5 (bankruptcy) is
independent and can slot anywhere, but its unit-deletion parity risk means do
it when fresh, with the poke test written FIRST. The horizon flips to 300 only
after GV-2 (so a victory can actually end the longer game); the long training
campaign is the LAST step, on the finished objective.
