# Operating brief — Civ6 development calculator, RL program

> Paste this (or point the agent at it) when continuing development with
> Claude Opus 4.8 or any capable coding agent. It encodes the mission, the
> non-negotiable discipline, the current state, and the ranked frontiers.
> The living state docs are `gpu/BUILD_PLAN.md` (roadmap + per-stage log),
> `gpu/TRAINING.md` (results ledger), `gpu/ARCHIVE.md` (shipped designs +
> research synthesis). Trust those over your priors; trust the gates over
> everything.

## Mission

Two mirrored engines simulate a Civ6-like development game to the 250-turn
score victory (TURN_LIMIT, the single horizon knob): the
TypeScript engine (`src/core`, the spec) and a vectorized PyTorch port
(`gpu/civ6gpu/engine.py`, the training substrate). On top of them: a
masked 6-head policy (production / tech / civic / units / envoys / war),
PPO self-play at O=2 and O=4, a league (PFSP + α-Rank), decision-time
search (MPC + Gumbel/Sequential-Halving), and search-target distillation
(M3d). The long-term goal: the strongest possible learned player, then
richer mechanics, repeated forever. Depth of AGENCY (new verbs with real
payoffs) has empirically beaten breadth of content every time.

## The one law: the two-gate parity contract

Every engine change must keep both engines TURN-EXACT:

1. `python gpu/battery.py --no-eval` (~3 min) — build, tests, fixture
   export, the 24-seed scripted gate, the 72-game random-action gate
   (rollout→replay), and all poke self-tests. `--full` adds slow MPC
   benchmarks (only when search code changed). A stage is DONE only when
   the battery is green; commit and push per stage with a message that
   records what the gates caught.
2. Integer state must match exactly; float accumulators within
   milli-units. The RNG is an in-state mulberry32 mirrored draw-for-draw:
   ANY change to draw counts must land in lockstep on both engines, and
   conditional draws must gate on identical conditions.
3. Fixtures are gitignored and regenerated per engine version.
   Behavior-preserving refactors prove themselves with a byte-identical
   fixture hash; behavior-changing stages legitimately regenerate and
   re-baseline (`eval.py --policy random|scripted`, record in
   TRAINING.md — every prior net goes stale by construction).

## Hard-won working rules (each one paid for)

- **Design doc first** for any multi-stage engine round (see ARCHIVE.md
  for the pattern); implement in gate-serialized slices, inert plumbing
  before behavior (the `district_complete` / `controlled`-mask pattern).
- **Patch FILES, not shell heredocs** — Git Bash mangles complex quoting
  silently. Write a python patch script via the Write tool, run it, and
  `git diff --stat` BEFORE running the battery (a failed patch + a green
  battery = you verified nothing; this happened).
- Anchors for text patches must be verified against the file (`grep -n`)
  — write-at-end patch scripts that assert mid-way leave NOTHING applied.
- **Hunt with the Phase-1 statelog FIRST** (supersedes ad-hoc paired
  probes): `rollout.py --shards 4 --log <rng>` + `CIV6_LOG=<rng> npm run
  gpu:replay` + `python gpu/logdiff.py` → the first divergent line. When
  a hunt needs a field the log lacks, ADD IT PERMANENTLY on both sides
  (this cycle grew: PC loy, RC cb/til/hp, RU hp+a, RT fai+tsum, and the
  CB combat log — every damage roll's diff/rand/dmg from the single
  damageRoll/_damage_roll chokepoint, catching reordered/extra rolls the
  rng column can't see). Escalate to targeted temp probes only when the
  log localizes but can't explain; strip temp probes same-session.
  Probe at the EXACT batch shape of the failing run (BLAS float
  association is batch-shape-dependent — B=1 probes follow different
  trajectories).
- **The city_seq class** (three shipped instances: loyalty pop-mix,
  luxury-grant ties, trace cityIds): TS iterates/ties by ARRAY order =
  acquisition order; GPU columns stop matching it once a hole-reuse
  founding lands a new city in a low column. EVERY order-coupled mirror
  or id-ascending tie-break must compare `city_seq`, never the column
  index. Assume any new rank/tie site has this bug until checked.
- **Slot hygiene**: a dead slot's QUEUE and registries die with the city
  (two shipped catches: rc_current builder code leaking into has_q;
  progress/cost leaking into reused player slots). When killing any
  pooled entity, clear every field a later reader could see — or
  alive-mask the reader.
- **Post-walk freshness**: TS trace/score-time stats recompute LIVE
  (fresh luxuryAmenities ranking with post-walk pops); the GPU walk's
  frozen-map totals must not leak past the walk (_eff_version bump after
  the city block).
- **Never edit engine/TS sources while a gate/battery/eval pipeline is
  in flight** — children import mid-pipeline and run half-edited code
  (two incidents). Docs/scratchpad writes are safe; source reads are safe.
- Positions/hp of units are NOT traced — silent divergence there is
  possible; RU/BU/PU statelog lines now carry hp+acted, and tsum catches
  same-count territory-shape splits. TS `tileFreeForUnit` is the
  stacking spec.
- Two id spaces coexist: tiles use the unified civ space
  (`civOfRival(r) = r+1`), rival UNITS carry the RAW rival id. Never mix.
- The eval lane covers CUDA device placement that CPU-only parity cannot;
  never skip it before a training-facing commit.
- Windows: `PYTHONUTF8=1` always; `cd` persists between shell calls (a
  stray `cd gpu/fixtures` broke two chains); training `--resume` keeps
  the update counter (extend `--updates`) and `best.pt` only writes when
  the mean beats the RESUMED watermark (use `latest.pt`).

## Training methodology (settled by experiment — don't re-litigate)

- **Self mode** (both seats learn every update) is the O=2 workhorse.
  Any mode that starves a seat of gradient silently trades that seat's
  skill away — α-Rank caught this twice (c3a-5, c3a-6) after raw eval
  crowned the regressed nets.
- **Rank with α-Rank** (`gpu/alpharank.py`, seat-averaged round-robin
  via `duel_eval.py`), never with raw eval or single-seat win rate.
- The league (persistent pool + PFSP, built and validated as protocol)
  returns as TRAINING structure only at a genuine plateau, with a fresh
  non-zero LR schedule (anneals flatline; KL→0.000 means dead learning).
- piKL anchors must be same-world (obs width follows rival count).
- Verbs without payoffs are noise: the net wars eagerly but gains
  nothing until capture exists (measured). Land verb + payoff together.
- `behavior_probe.py` after every training milestone — strategy deltas
  (units/districts/treasury/wars) tell you more than the score.

## Current state (2026-07-11, branch claude/eloquent-mayer-si4ggq)

**THE PROGRAM HAS PIVOTED** (owner's call): the real goal is the best
champion on an engine CLOSE ENOUGH TO CIV 6, and every engine change
orphans every net — so interim champions are disposable. Durable = the
parity contract, the gate battery, the seat surface, the methodology
bank (TRAINING.md + /rl-research; the war chapter closed by measurement:
economist-with-minimum-deterrence). The RL track is PARKED until the
engine is done.

**The engine runs on the P-ladder** (tasks #23-#31; audit findings in
`gpu/AUDIT.md` v2, 2026-07-11 — the SINGLE current gap list):
- **P1-P4 DONE**: rival water/Harbor line, player district costs,
  battery 316s→~200s, the full Civ-6 fidelity batch (old audit §D
  closed: healing/movement/border curve/amenity bands/loyalty values/
  cost escalators/verified costs/speed uniformity/city defense/ranged
  bombardment/tile purchase/GS district discount).
- **P5 (rival symmetry) nearly done**: S1 economy, S7 camps/raze,
  S2 peace+settler purchase, S3 founding cluster, S4 culture borders,
  S5 GP effects + faith pantheons + prophet religion; S6 (rival
  loyalty+amenities) + S8 (controlled purchase revalidation) land as
  one combined stage. ~20 hunted latent parity bugs so far — every
  stage's reshuffle exposes the next one; budget hunt time into EVERY
  stage.
- **Then**: P6 rival yield interleaving (#23), P7 dead-slot/order
  reclamation (#24 — the city_seq/capital-pin/column-order family),
  P8 net-driven scripted export (#26), then ONE re-baseline pass and
  the champion campaign. NO per-stage eval baselines (owner directive
  2026-07-10) — one pass before P8.

AUDIT.md v2 chapters: A asymmetry (eurekas, wonders, purchases, roster,
religion effects — the post-P5 symmetry queue), B fidelity vs real Civ 6
(walls/ZoC/XP/naval/victories...), C order/slot latents, D perf
candidates (leader() gate first), E docs staleness.

## Skills (invoke them — they ARE the procedures above, operationalized)

Three project skills live in `.claude/skills/` and encode this program's
proven procedures. Prefer invoking them over improvising:

- **`/gate-stage`** — land any engine change (src/core or
  gpu/civ6gpu/engine.py) as a gate-serialized stage: design → inert
  plumbing → patch-file edits → lockstep RNG/float discipline → battery →
  baselines → commit. Includes the paid-for trap list.
- **`/parity-hunt`** — diagnose a parity-gate failure to the exact
  divergent decision: reading the failure shape, paired TS/GPU probes
  with end-of-turn alignment, the escalation ladder (bit-level sums →
  position diffs → batch-collapse checks → stale-harness false
  positives).
- **`/training-rung`** — the launch/assess/record loop for every
  training run: the four-part assessment (eval, both duel orderings,
  α-Rank, behavior probe), the resume/best.pt/anneal gotchas, and the
  settled mode choices.
- **`/rl-research`** — how avenues are chosen and judged: start from a
  named failure, cheapest falsifying rung, one variable per rung,
  success criteria as behavioral/ranking facts defined BEFORE launch,
  the diagnosis catalog (eval-up-mass-down, seat dominance, verb-
  without-payoff, rational-behavior-flat-objective, dead KL), and the
  mechanism-not-numbers reporting rule.
- **`/session-continuity`** — operating long autonomous sessions that
  survive context compaction: the memory contract (entry points not
  narrative, applied-uncommitted flags, recon-the-moment-it's-proven),
  background-job bookkeeping, safe chain design (verification inside
  chains; the vacuous-battery trap), and goal-loop discipline.
- **`/port-mechanic`** — the Civ6 mechanic promotion craft (use with
  /gate-stage): spec-reading order (rule → consumers → RNG footprint →
  phase position), the promotion checklist (state/_MUTABLE, ??=-only
  save migration, planes-by-calling-the-TS-rule, trace columns so the
  mechanic is gate-checked from turn one, the owner-scoping leak list,
  float association and js_round, index tie-breaks), and the canary
  rule — name the observable that MUST diverge if the mechanic breaks.

## Session mechanics

- Long trainings run in the background; assess on landing with
  eval + duel_eval both orderings + alpharank + behavior_probe, record
  the READ (not just numbers) in TRAINING.md, commit, launch the next.
- Persist decisions and gotchas to the project memory continuously; the
  session may compact at any time.
- When a gate fails: it is telling you about a real semantic difference.
  Probe until you can name the exact divergent decision, fix the engine
  that is WRONG relative to TS-as-spec (or fix TS if it violates its own
  rules), and record the catch in the stage log. Never widen tolerances.
