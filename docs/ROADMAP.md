# Roadmap — the live program

The goal (owner's words): **the best champion — duel or FFA — on an engine
close enough to real Civ 6.** Everything else in the repo serves that.
Work items live in the task list; fidelity gaps live in `docs/AUDIT.md`.
This file holds only direction and the decisions already bought with runs,
so they are not re-litigated.

## Where the engine stands

Both engines are seat-symmetric: every actor is a seat (0 and the civ
seats are the same kind of actor; city-states 100+; barbarians 200), all
decisions ride one wire record schema computed once per (turn, seat) by
`policy/drive.py`, and every fact has one seat-indexed storage base with
row views.

The parity instrument is the battery, `python gpu/battery.py`: the static
gates, then seed and export, then the decision-server gate sharded over
every fixture seed to turn 250 — obs equality, shared decisions, per-turn
state digests over `shared/statecompare.manifest.json` — beside the TS
suite and the gpu poke lanes. The gate is never run on its own; a green is
the step count and head sha recorded in `stats/battery.jsonl`, never an
exit code.

Current phase: **AUDIT burn-down**, and what is left there is owner-shaped
rather than a build queue:

- **The question ledger** (`docs/AUDIT.md`) — the asks the source
  under-determines. Neither engine ships a branch until the owner rules or
  the live game answers.
- **The live-game lab** — `tools/civ6lab/SESSION2.md` is the scene list
  for the ledger lines the running game will state when asked; the lab
  itself is `tools/civ6lab/README.md`.
- **Two decisions only the owner can make** — whether this engine mirrors
  the install's PER-GAME event counts or keeps rolling per object (ask 4),
  and whether the diplomatic promises are worth a driver arm (C-2). Both
  are written out in `docs/AUDIT.md`.

P8 training stays parked until that file is empty.

## RL program (parked until the owner is satisfied with the engine)

Owner rulings in force: checkpoints and baselines are DISPOSABLE; net
lanes die whenever dims change; exactly ONE baseline pass before P8
training starts — no per-stage re-baselining.

Decisions bought with runs (do not re-litigate without new evidence):

- **Road A** (decided 2026-07-06): full-fidelity symmetric seats — now
  structural in both engines. Self-play starts at **O=2 duel** (the
  theoretically safe regime), scales to FFA on the same code.
- **Reward phases**: dense per-turn score delta for single-agent
  bootstrap (proven) → SYMMETRIZED relative score for self-play (own
  delta minus opponents' — restores the zero-sum property; four
  independent score-maximizers otherwise co-farm peacefully) →
  optionally sparse win/objective later.
- **League telemetry**: CCE via α-Rank, not Nash (PPAD-complete,
  ill-posed selection).
- The scripted policy (`policy/drive.py`, `policy/ladder.py`) survives as
  the parity anchor and the league's baseline opponent. It is our own AI,
  not Civ 6's: the engine is what this program models, so the game's
  opinion scale, agendas and preference weights are out of scope
  (owner ruling 2026-09-20).
- **Search verdict**: a 1-ply value-leaf search cannot beat a strong
  net's own greedy at any sampling temperature. The open lever is
  **M3** — train the value head on search-improved targets and batch
  the candidate evaluation (Gumbel-M3).
- **Training method** (banked): masked multi-head PPO, all heads
  mask-gated so silent heads contribute nothing; per-episode world
  re-seeding; eval = N independent fixed-horizon episodes, comparable
  only within one table. Measure the device before committing a run.
- **Late-game verdict** (horizon-300 audit): a competent policy
  SUSTAINS by playing tall — the late game is not structurally broken.
  What raises the plateau is victory conditions and late content, plus
  the loyalty soft-cap on wide play.

## Perf

The battery's wall is the bar, and the campaign that cut it (clean 650 s →
344 s over six parity-verified rounds, closed 2026-09-15) bought it from
WORK, not from lanes: fingerprint memos over recomputed planes, per-seat
preludes, demoting poke lanes that never catch anything, and the TS
composer memo. Narrower shards and fewer workers bought nothing — the box
is 12 physical cores under 24 logical ones, so the wall is total CPU work
divided by 12 and every lane's second is contention on the serve shards.

Standing discipline: every perf change is a bit-identical refactor (same
values, same draw order, same float association); BLAS association is
batch-shape-dependent, so gate-equivalence is the bar; never read numbers
off a contended box — a measurement run is asked for, and labelled clean
or contended; an optimisation never earns a run of its own, it lands on
the next run that was wanted anyway. Instruments: the gate's own
`--profile` / `--cprofile` split in the battery's hunt mode,
`tools/gpu/profile_step.py`, `tools/gpu/bench.py` and
`tools/cpu/perf-turns.ts`.
