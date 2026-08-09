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
row views. The serve gate (`gpu/serve_gate.py --batched`) is the parity
instrument: obs equality, shared decisions, per-turn state digests over
`shared/statecompare.manifest.json`.

Current phase: **AUDIT burn-down.** The next `npm run seed && npm run
export` + serve run is the behavioural test for everything landed behind
the freeze (wire verbs #104/#107, protagonist #75, the storage
renumbering, the city-block unification #109, the vocabulary purge) and
opens the hunt. After that, the open engine work in rough order:

- A-26 — evict the seat-0 mask-policy exclusions (naval/snipe/spread);
  adopt the capability gate both engines already agree on in TS.
- #73 seat-0 pantheon founding (GPU twin; storage rows are ready),
  #74 seat-0 pool embark.
- #97 district-placement fidelity + the tile choice onto the wire.
- #108 driven unit-policy residuals; #83 projects/wonders action columns.
- #72 switchable research (ships alone, re-baselines).
- #76 AUDIT long tails (B-24 Ages/governors, B-22 Congress).

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
- The old scripted policy survives as the parity anchor and the
  league's baseline opponent.
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

#81: cut GPU op COUNT — at B=12, ~83% of a step is fixed dispatch
overhead, so fewer/larger ops beat faster ops. The measured half is
blocked on the freeze. Standing discipline: every perf change is a
bit-identical refactor (same values, same draw order, same float
association); BLAS association is batch-shape-dependent so
gate-equivalence is the bar; never read numbers off a contended box;
one battery per stage. Drivers: `tools/cpu/perf-turns.ts` and the gpu
profiling driver.

## Training log convention

When P8 opens, each rung's record (what changed, WHY — mechanism, not
numbers — and the next rung) is appended under a `## Training log`
heading in this file. Prior nets are disposable history.
