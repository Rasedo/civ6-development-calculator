---
name: training-rung
description: Launch, assess and record one self-play/FFA training run (a ladder rung) — the assess-record-launch loop with the full evaluation protocol. Use for every training run.
---

# Training rung — launch, assess, record, decide

One rung = one run + its READ. The read (what it means, not just the
numbers) goes to docs/ROADMAP.md §Training log and decides the next rung. Never crown
a net on raw eval alone.

## Launch

- O=2 workhorse: `python gpu/eval/train_ppo.py --seats 2 --reward relative
  --opponent self --batch 64 --horizon 100 --device cuda --resume
  <prev>/best.pt --updates <CUMULATIVE> --out gpu/runs/<name>` in the
  background.
- `--updates` is CUMULATIVE across resumes (resumed counter + new work).
  `best.pt` only writes when the mean beats the RESUMED watermark — use
  `latest.pt` for assessment otherwise. KL pinned at 0.000 = the anneal
  killed learning; resume with a fresh non-zero LR schedule.
- Modes, settled by experiment: `self` = both seats learn (the default);
  `ema`/`pfsp` starve the opponent seat of gradient — its skill silently
  decays (α-Rank caught it twice). The league (`pfsp`, persistent pool in
  `out/pool/`) returns at a genuine plateau, ideally as mixed self+pool
  batches, never seat-alternation (halves per-seat experience).
- FFA: `--seats 4 --fixtures gpu/fixtures_o4` (+ `--anchor <same-world
  o4 ckpt> --anchor-kl 0.1` — obs width follows the civ-seat count, an O=2 net
  cannot anchor O=4). Distillation: `--distill gpu/targets/<f>.pt`
  (generate with `gpu/eval/gen_targets.py`, `--policy <ckpt>` for net-driven
  states).

## Assess (all four, on landing)

1. `python gpu/eval/eval.py --policy <ckpt> --episodes 50` — the standard
   scripted-world number (family context in docs/ROADMAP.md §Training log).
2. `python gpu/eval/duel_eval.py --a <new> --b <champion>` AND the reverse
   ordering — the seat asymmetry is part of the game; report both.
3. `python gpu/eval/alpharank.py <family checkpoints> --episodes 12` — the
   stationary mass is the ranking; raw win rate misleads under
   intransitivity or seat-trading.
4. `python gpu/tools/behavior_probe.py <prev> <new> --episodes 24 --device cpu`
   — strategy deltas (units, districts, treasury spent, wars seen,
   cities). Success criteria live here: e.g. conquest working = cities
   above the 4.6 site-plan ceiling.

## Record and decide

- Write the READ into docs/ROADMAP.md §Training log: what changed, WHY (mechanism,
  not vibes), and the decision it implies. Commit + push.
- Champion changes only via α-Rank. New engine world (any gate-stage
  landed since) = every prior net is stale; re-baseline and say so.
- The GPU is single-tenant: one training run at a time; batteries and
  CPU probes may overlap it, evals may not (they contend).
