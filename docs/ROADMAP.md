# Roadmap

The goal (owner's words): **the best champion — duel or FFA — on an engine
close enough to real Civ 6.** This file holds direction and the decisions
already paid for, so they are not re-litigated. Open work is
`docs/AUDIT.md` and nowhere else; how to work is `CLAUDE.md`.

## Now: the AUDIT burn-down

Both engines (`cpu/`, `gpu/`) are seat-symmetric and driven by one scripted
decision server (`policy/`). They are checked against each other by
`gpu/battery.py` and against the game by the owner's install and the live
game (`tools/civ6lab/`). The phase ends when `docs/AUDIT.md` has no open
entry. What remains there is mostly ASK, LAB and DLL lines: the install
under-determines them, so the owner or a live-game scene decides.

## Next: an engine-neutral decision server

Today the TS engine carries its own twin of the driver's compared tables
(`cpu/driver/driver.ts` beside `policy/drive.py`), and the two must match
clause by clause. The direction is one decision server that receives each
engine's observation in a neutral format, does not know which engine asked,
and answers each independently. The TS twin then goes away, and so does the
class of fork it exists to catch.

## Then: RL (parked until AUDIT is empty)

The RL code was deleted in the restructure (only the engines, the policy and
their tests survived); these decisions carry over to the rebuild:

- **Road A**: full-fidelity symmetric seats, already structural. Self-play
  starts at an O=2 duel and scales to FFA on the same code.
- **Reward**: a dense per-turn score delta to bootstrap, then a SYMMETRIZED
  relative score for self-play (own delta minus the opponents'). Without it,
  independent score-maximizers co-farm peacefully.
- **League telemetry**: α-Rank (CCE), not Nash.
- **Training**: masked multi-head PPO with every head mask-gated, world
  re-seeded per episode. Evaluation compares only within one table. Exactly
  ONE baseline pass before training starts. Checkpoints are disposable.
- **Search**: a 1-ply value-leaf search did not beat a strong net's own
  greedy policy. The open lever is training the value head on
  search-improved targets (Gumbel-style), with batched candidate evaluation.
- **The scripted policy** stays as the league's baseline opponent. It is
  our own AI, not Civ 6's (the program models the engine, not the game's
  AI).
- **The late game** is not structurally broken: a competent policy sustains
  by playing tall. Victory conditions and late content raise the plateau.
