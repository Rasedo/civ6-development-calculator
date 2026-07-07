# C3c — O=4 free-for-all (design)

> Written while c3a-5 (PFSP) trains. Spec: BUILD_PLAN §3 C3c. Everything
> here is CPU-side prep; activation waits for the c3a-5 ladder read.

## What O=4 needs that O=2 already has

The C2 surface is O-parametric by construction: `_seat_rival(k)` covers any
rival, `rival_masks/apply_rival_actions/rival_score/rival_unit_mask/
_apply_rival_unit_actions` all take `r`, and `observe(seat=k)` renders any
rival's egocentric view (its rival block holds the player + the OTHER
rivals). The gaps are:

1. **Fixtures with 3 rivals.** The gate fixtures (2 rivals) are a parity
   CONTRACT — they must not change. O=4 gets its OWN pool
   (`gpu/fixtures_o4/`), exported with `rivals: 3`, used ONLY by training/
   duel tooling. Exporter: a `--rivals` argv (default 2, writing to the
   default dir; `--rivals 3 --out gpu/fixtures_o4` for the FFA pool).
   Loader: `FIXTURES` stays the gate pool; `load_fixture` takes explicit
   paths already — BatchEnv/DuelEnv/MeleeEnv accept a fixtures list, so
   only the pool GLOB moves behind a parameter in the training entrypoints.
   The parity gates NEVER read the O=4 pool.
2. **MeleeEnv** — the DuelEnv generalization: seats = [0..O-1] over one
   BatchSim (seat 0 the player civ, seats 1..O-1 = rivals 0..O-2, all
   controlled). step(actions: list[dict]) applies every rival seat's
   choices then advances with seat 0's; rewards [B, O]:
   - dense: own score delta per seat
   - relative: own delta minus the MEAN of the others' (zero-sum across
     seats by construction, the FFA analog of the duel's flip)
3. **Trainer**: `--seats O` generalizes the seat-axis batching (obs
   [B, O, F] → [OB, F]); self mode trains every seat's rows; PFSP drives
   any subset of non-focal seats from the pool.
4. **α-Rank**: the eval protocol over ≥3 checkpoints — round-robin
   duel_eval margins → a payoff matrix → the α-Rank stationary
   distribution (a ~50-line power-method script, `gpu/alpharank.py`),
   ranking the pool instead of raw win rates once intransitivity appears.
5. **piKL anchoring** (mixed-motive collapse guard): an auxiliary KL term
   toward an ANCHOR policy (the scripted-equivalent or the last stable
   checkpoint) added to the PPO loss for FFA runs: `--anchor <ckpt>
   --anchor-kl <coef>`. Cheap to plumb (one extra forward + KL on learner
   rows); OFF by default; activated for O=4 runs per Diplodocus.
6. **Kingmaking telemetry**: per-seat win vs score distributions logged
   per update (already derivable from the [B, O] scores at episode end).

## Order

C3c-i fixtures pool + exporter arg; C3c-ii MeleeEnv + smoke (random 4-seat
FFA runs the horizon, relative rewards zero-sum); C3c-iii trainer seats=4 +
piKL flag; C3c-iv alpharank.py over the c3a pool; activation = the first
O=4 run, gated on the c3a-5 read.

## Non-goals here

V-W1/V-W2 (the symmetric war head + capture) stay their own §4 stage — an
FFA without war verbs is still a meaningful economics race with barb/
defense pressure, and the war stage lands independently.
