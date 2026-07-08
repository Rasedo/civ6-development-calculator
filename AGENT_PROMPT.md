# Operating brief — Civ6 development calculator, RL program

> Paste this (or point the agent at it) when continuing development with
> Claude Opus 4.8 or any capable coding agent. It encodes the mission, the
> non-negotiable discipline, the current state, and the ranked frontiers.
> The living state docs are `gpu/BUILD_PLAN.md` (roadmap + per-stage log),
> `gpu/TRAINING.md` (results ledger), `gpu/ARCHIVE.md` (shipped designs +
> research synthesis). Trust those over your priors; trust the gates over
> everything.

## Mission

Two mirrored engines simulate a Civ6-like 100-turn development game: the
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
- **Debug with paired probes, end-of-turn aligned**: a `RIVAL_DEBUG`
  guarded print run through the exporter/replay on the TS side, a B=1
  replay-fed sim on the GPU side; diff per-turn state; beware phase-point
  and turn-label misalignment (three false positives came from that) and
  multi-game interleaving (guard by game rng, not just seed).
- Positions/hp of units are NOT traced — silent divergence there is
  possible; the fix is a position-diff probe, and the cause is usually a
  blocking/stacking asymmetry. TS `tileFreeForUnit` is the stacking spec.
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

## Current state (2026-07-08, branch claude/eloquent-mayer-si4ggq)

**THE PROGRAM HAS PIVOTED.** §1-4 (the RL + parity infrastructure) is
SHIPPED and gate-proven: the full B-arc, C2 per-seat surface, C3a/b/c
self-play + league + O=4 FFA, V-W1/V-W2 war+capture both ways, M3d
search-distillation, V-H1 chop, rival-seat verb parity (VP-G1 gold +
VP-G2 purchases). The RL METHODOLOGY is settled and banked (TRAINING.md
+ /rl-research): self-mode workhorse, α-Rank truth, teacher>student,
verbs-need-adoption. The war chapter CLOSED by measurement:
economist-with-minimum-deterrence is this world's optimum (7 rungs);
c3a-4 (~225 eval, pre-war economist) was the last interim champion.

**Why the pivot** (owner's call): the real goal is the best champion on
an engine CLOSE ENOUGH TO CIV 6, and every engine change orphans every
net — so interim champions are disposable. Durable = the parity
contract, the gate battery, the seat surface, the methodology bank.
The RL track is PARKED (adoption-smoke rungs only) until the engine is
done. The roadmap now runs on **BUILD_PLAN §5 — the Civ 6 gap list.**

## Ranked frontiers (BUILD_PLAN §5, work top-down)

The gap to Civ 6, ordered by how much each changes what "champion" MEANS:

1. **G-V Victory & horizon** — IN PROGRESS. The t100 sprint must become
   a ~300-turn victory race. Slice (i) audit DONE (gpu/horizon_audit.py):
   found the engine has NO PLAYER SECOND HALF — score peaks ~t200 then
   declines, player cities contract 3.7→2.2 while rivals scale 8.5→13.5;
   trees have depth (research starves, not depletes); and a HARD CRASH at
   ~t150 from the append-only unit pools (U_MAX/P_MAX=96). NEXT: the pool
   cap (behavior-preserving at horizon-100 → identical fixtures), then a
   horizon-300 DIAGNOSTIC net (does a competent player sustain, or does
   the engine structurally cap the late game?), then game-end semantics +
   domination/score victories.
2. **G-C Combat depth** — city walls + ranged strikes, siege classes,
   promotions, ZoC. Re-opens the war-chapter verdict (measured on
   wall-less 40-defense cities). Makes domination a real axis.
3. **G-R Religion** — faith is a dead pool today; pantheons/beliefs,
   religious units/pressure, the religious victory.
4. **G-T Trade routes**, **G-D full trees**, **G-S scale (300t/8-10
   cities/bigger maps/pools)**. Cut-lines: STRATEGIC CORE = G-V+G-C+G-R;
   FULL FIDELITY adds the rest.

Every slice lands via /gate-stage + /port-mechanic; RL shrinks to one
cheap adoption-smoke per shipped system. The final champion campaign
runs ONCE, on the finished engine, with the full methodology bank.

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
