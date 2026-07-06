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
  controls every city's production; `--loyalty-aware` shapes the leaf against loyalty flips. One
  fixed `--dtype` per run (float32/float64 diverge over 100 turns). Run:
  `python3 gpu/search_eval.py --policy search --loyalty-aware --episodes 5 --turns 100`.

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

### M2b-2 — net-guided search over the full 5-head action tuple

With a trained net in hand (a 135.6-mean net trained locally on an RTX 4070 SUPER in ~15 min —
see below), the search can improve the WHOLE action tuple, not just production. `netgreedy`
plays the net's greedy policy across all five heads (production/tech/civic/units/envoy);
`tuplesearch` draws the greedy tuple plus k−1 tuples sampled from the net's factored policy (the
net is the prior) and plays the one with the best leaf value. On 6 matched worlds (100 turns):

| policy | mean | gain vs scripted | vs netgreedy | s/game |
|--------|------|------------------|--------------|--------|
| scripted | 126.7 | — | — | ~1 |
| netgreedy (all 5 heads) | 165.0 | +38.2 (4/6) | — | ~4 |
| tuplesearch (net-value leaf, k=8) | 163.2 | +36.5 (4/6) | tied (2W/4L) | ~35 |

The full net policy strongly beats scripted (+38) — RL trains well on the district/unit engine.
But **net-value-leaf tuple search only ties the net's own greedy** (163 vs 165; 2 wins / 4 losses
head-to-head — e.g. +19 on seed9001 and +23 on seed9027, but −26 on seed9040): searching against
a mid-strength net's value head amplifies its ranking errors about as often as it helps. Search
is only as good as the value function it optimizes. (A `--tuple-leaf rollout` variant evaluates
each tuple by an actual rollout — reliable but ~25×+ slower, and its *scripted* continuation is a
policy mismatch.) Both net and net-search also inherit the loyalty over-expansion weakness
(seed9053 fails for both). The takeaway is the standard AlphaZero one: net-guided search needs an
ACCURATE net (sharp policy + calibrated value) to beat greedy — a stronger net is the next step,
now a ~2-hour job locally (see the GPU note below). The machinery is `search_eval.py --policy
netgreedy|tuplesearch --k --tuple-leaf`; sampling is seeded per game (reproducible).

### The strong-net answer (tune1) — greedy still wins

The strong net arrived: **tune1** (30 updates, B=4096, horizon 100, ent-coef 0.02,
anneal-lr, ~80 min on the RTX 4070 SUPER) evaluates at **216.9 ± 13.5** on the
50-episode protocol vs scripted 162.2 ± 13.0 and random 115.1 ± 11.8 (re-baselined on
the district engine) — and its all-heads greedy hits **195.4 on the 6 matched worlds
(+68.7, 6/6)**, up from quicknet's 165.0 (4/6), *including* seed9053 (108.5 vs
scripted 93.5): the stronger net learned the expansion restraint the loyalty-aware
leaf had to hand-shape. But the M2b-2 hypothesis is **refuted**: tuplesearch under
tune1 scores 182.3 — it still loses to the net's own greedy head-to-head (1W/5L;
−40.8 on seed9001, +8.7 on seed9027). A 1-ply value-head read remains too noisy to
rank sampled candidate tuples, and tune1's healthier entropy (2.15 vs quicknet's
0.67 — the very thing the doubled ent-coef bought) makes its k−1 sampled candidates
MORE diffuse, handing the value head harder discriminations. So more net strength
alone does not make naive 1-ply tuple search pay. The levers that remain are the M3
ones: candidate-sampling temperature (sharpen the prior at search time), deeper /
rollout leaves with a net continuation, and above all TRAINING the value head on
search-improved play instead of only its own on-policy returns (AlphaZero's actual
trick). Reproduce: `search_eval.py --policy netgreedy|tuplesearch --checkpoint
gpu/runs/tune1/best.pt --episodes 6 --turns 100 [--k 8 --tuple-leaf net]`.

**Temperature closes the question.** `--temperature` sharpens the prior for the k−1
sampled candidates (logits/τ; the greedy tuple is invariant). Same 6 worlds, tune1:
τ=1.0 → 182.3, τ=0.5 → 189.6, τ=0.25 → 192.2 — monotone toward netgreedy's 195.4
and never crossing it. At τ=0.25 two seeds tie greedy exactly (the candidate set has
collapsed onto it) and every remaining deviation loses a little. So the value head's
ranking among plausible alternatives is, at best, neutral — 1-ply value-leaf tuple
search cannot beat the policy it searches, at any sharpness, until the VALUE improves.
That is M3's actual job: distill search/rollout-verified targets into the value head
(AlphaZero), or pay for rollout leaves with a net-driven continuation.

### GPU / local compute

The engine fires many small kernels per step, so it is launch-bound at small batch (a GPU ≈ CPU
at B≤128) but scales well once the batch amortizes launch overhead: on an RTX 4070 SUPER,
`train_ppo.py --device cuda` hits ~2,000 steps/s at B=1024 and **~5,760 at B=4096 (~15× a 4-core
cloud CPU)**, using a small fraction of 12 GB VRAM. So a 40M-step run is ~2 hours. The single-
agent B=1 searches here don't benefit from the GPU (launch-bound) but do fan out across CPU cores.

### Known limitation — production-only search over-expands (seed9053)

On seed9053 *every* learned/search method (net, search, netsearch ≈ 61–63) falls **below**
scripted (94.5). The cause is not a bug: the search led the whole game (+44 at turn 70, 95.9
at turn 90 with **4 cities**) by aggressively queuing SETTLERs, then **lost two cities in the
final 30 turns** (nCities 4→3→2), crashing to 63.4. Because the search controls only
*production* — and the extra cities are lost. **Verified mechanism (not a raze): loyalty
flips.** Both lost cities were at FULL HP (200) when they fell; their loyalty decayed to 0
under rival pressure (city 1: 100→87→57→18→0 over ~40 turns) and they flipped to a rival. So
it is *not* a military/defense failure — controlling units would not save them. The search
founds cities near rivals whose loyalty it cannot sustain (amenity buildings raise loyalty,
but the flip lands ~40–60 turns after founding, well past the 20-turn rollout, so neither the
found-time rollout nor a myopic re-plan sees it coming). Scripted stays conservative (2 cities)
and wins. The same expansion instinct sinks the trained net on the same world.

**Fix — loyalty-shaped leaf value (`--loyalty-aware`).** Rather than lengthen the (expensive)
horizon, shape the leaf: `loyalty_shaped_value(penalty, thresh)` discounts the empire score by
each own-city's loyalty erosion visible at the horizon (`penalty` per point below `thresh`). Even
though the full flip lands past the rollout, the *erosion* is already visible at horizon-20 (~13
points on a doomed city), so a large-enough penalty tips the search off over-expansion. Result on
seed9053 (capital search, 100 turns): **63.4 → 89.0 (+25.6)** at `penalty=2`, nearly matching
scripted's 94.5 — and it is close to free where expansion is safe (seed9001 −1.5 on 256, seed9014
±0), because healthy cities keep loyalty ~100 and incur ~no penalty. Any `value_fn` can be threaded
through `plan_production`/`mpc_play`/`mpc_play_empire`; this same hook is what `netsearch` uses for
the net's value head.

## Roadmap (see `gpu/BUILD_PLAN.md`)

- **Done:** M1 (snapshot/restore + 1-ply), M2a (closed-loop depth + MPC), M2b-1 (trained net
  wired into the search + benchmark), empire-wide production search, loyalty-aware leaf, and
  M2b-2 (net-guided search over the full 5-head tuple — `netgreedy`/`tuplesearch`). RL trains
  on the district engine on GPU at ~15× a cloud CPU.
- **Next:** a STRONG net (a ~2-hour GPU run) so `tuplesearch` can actually beat greedy — the
  value-head accuracy is the current bottleneck; then C1–C3 (symmetric rivals → self-play).
