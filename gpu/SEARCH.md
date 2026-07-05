# Single-agent search over the GPU forward model

The GPU engine (`gpu/civ6gpu/engine.py`) is a deterministic, vectorized reimplementation
of the TypeScript simulator, held to it by two parity gates (`gpu/parity_test.py`,
`gpu/rollout.py` → `scripts/replay-gpu.ts`). Because a step is deterministic given the
state — the only randomness is `rng_state`, which round-trips through snapshot/restore —
the forward model doubles as a **planning oracle**: at a decision point you can try an
action, roll the world forward, read the score, and rewind. `gpu/civ6gpu/mcts.py` is that
search; it is **eval-only** (every rollout restores its snapshot, so it never perturbs the
parity-checked model).

## Primitives (`gpu/civ6gpu/mcts.py`)

| function | what it does |
|----------|--------------|
| `snapshot()` / `restore()` (engine) | clone / copy-back every `_MUTABLE` tensor + the turn counter; bit-exact save/restore for search |
| `_rollout_value(sim, city, a, horizon, snap)` | commit action `a` in `city` (others idle, then scripted), roll `horizon` scripted turns, return `empire_score`, restore |
| `search_production(sim, city, horizon)` | **exhaustive 1-ply**: score every legal production action by its rollout, return the argmax + all values |
| `greedy_production(sim, city)` | myopic baseline (horizon 0 — best immediate score) |
| `plan_production(sim, city, horizon, depth)` | **closed-loop depth-`d`**: the leaf assumes `city` keeps *planning* at its future decisions, not reverting to scripted (depth 1 == `search_production`) |
| `mpc_play(sim, city, horizon, depth, turns)` | play a real game with `city`'s production chosen by `plan_production` every decision (model-predictive control), everything else scripted |
| `mpc_play_empire(sim, horizon, depth, turns)` | `mpc_play` over **every** city's production (each pending city searched independently from the shared pre-decision state, then all committed together) |

### Why exhaustive, not PUCT
A PUCT bandit is the usual MCTS action selector, but it is pointless here and, naively,
wrong: the rollout is deterministic, so **one rollout per action is that action's exact
value** — there is nothing to sample. And with the raw empire score (~60–250) as Q, the
exploration bonus (~1–2) is negligible, so an unnormalized flat PUCT sticks on the
first-scored action and never visits the rest. Exhaustive 1-ply is optimal for
deterministic leaves and small action sets. PUCT with a net's prior/value + Q-normalization
belongs later (M2b-2), where leaves get expensive and stochastic.

## Tools

- **`gpu/mcts_test.py`** — self-test: snapshot/restore bit-exactness (104 tensors, incl.
  the RNG stream) + step-after-restore determinism; `search_production` determinism,
  eval-only, and ≥ greedy; closed-loop `mpc_play` ≥ scripted; empire-search determinism.
  Run: `python3 gpu/mcts_test.py`.
- **`gpu/search_eval.py`** — benchmark a challenger vs the scripted base policy on
  **matched** B=1 worlds (same fixture + scramble, played twice from the identical start).
  Policies: `search` (net-free rollout MPC), `net` (a trained policy head drives
  production), `netsearch` (the search with the net's value head as the leaf). `--all-cities`
  controls every city's production. One fixed `--dtype` per run (float32/float64 diverge over
  100 turns). Run: `python3 gpu/search_eval.py --policy search --episodes 5 --turns 100`.

## Results (5 games × 100 turns, matched float32 worlds, capital production unless noted)

Both a modestly-trained CPU net and net-free rollout search dramatically beat the scripted
base policy; they are per-world complementary and statistically tied at n=5.

| policy | mean | gain vs scripted | s / game |
|--------|------|------------------|----------|
| scripted | 104 | — | ~1 |
| net (policy head) | 172 | +68 | ~2 |
| search (rollout MPC) | 152 | +48 | 28–58 |
| netsearch (net value-leaf) | 162 | +58 | 3–7 |
| search, `--all-cities` | — | +32.5 vs +24.7 capital-only (60-turn set) | scales with #cities |

Key reads: **netsearch (the net's value head as a 1-ply leaf) beats rollout search on the
mean at ~8× the speed** — the value head is a good, cheap rollout replacement (the lever for
deeper search under a budget). **Empire-wide search beats capital-only** where non-capital
cities have real production choices. The net is used *out of distribution* here (trained to
drive all five heads; benchmarked driving only production), and n=5 is a small, high-variance
sample — treat the gains as directional.

### Known limitation — production-only search over-expands (seed9053)

On seed9053 *every* learned/search method (net, search, netsearch ≈ 61–63) falls **below**
scripted (94.5). The cause is not a bug: the search led the whole game (+44 at turn 70, 95.9
at turn 90 with **4 cities**) by aggressively queuing SETTLERs, then **lost two cities in the
final 30 turns** (nCities 4→3→2), crashing to 63.4. Because the search controls only
*production* — units and military are scripted — it builds cities it cannot defend, and in a
hostile world (barbarians / war / disasters) the undefended expansion is razed or flipped
after the rollout horizon. Scripted stays conservative (2 cities) and wins. This is the
signature of a limited control surface + a finite horizon, and it also explains why the
trained net (which learned the same expansion instinct) fails on the same world. A longer
horizon can help the rollout *see* the coming loss and expand less, but the structural fix
is to widen the control surface (also search the unit/military head so the search can defend
what it builds) or to price expansion risk into the objective — both future work.

## Roadmap (see `gpu/BUILD_PLAN.md`)

- **Done:** M1 (snapshot/restore + 1-ply), M2a (closed-loop depth + MPC), M2b-1 (trained net
  wired into the search + benchmark), empire-wide production search. RL training verified to
  learn on the district engine (`gpu/train_ppo.py`).
- **Next:** M2b-2 (net-guided 5-head Gumbel/PUCT search — wants a stronger/GPU net); C1–C3
  (symmetric rivals → multi-civ self-play).
