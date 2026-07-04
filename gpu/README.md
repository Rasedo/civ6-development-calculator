# GPU engine (alternative, not a replacement)

A vectorized PyTorch port of the simulation core: thousands of games step
in lockstep as `[B, C, …]` tensor operations (B games × C cities). The
TypeScript engine remains the source of truth; this port exists for
self-play-scale RL training — and since phase 3 it is *trainable against*:
a masked macro-action surface drives production, research, civics, unit
orders and envoys, while the world fights back: barbarians raid (4a),
the policy commands its own army (4b), city-states and scripted
rival civilizations live alongside — growing, settling, racing beliefs,
declaring war and flipping disloyal cities (4c) — and the climate takes
its cut: floods, droughts, storms and volcanoes reshape tile food (4d).

## The parity contract

This is a *re-derivation*, and re-derivations silently drift — so nothing
here is trusted without proof. Two gates, one oracle:

1. **Scripted parity.** `npm run gpu:export` runs the **real TS engine**
   over reference seeds and records rule tables plus turn-by-turn traces
   into `gpu/fixtures/`; `python gpu/parity_test.py` replays the same
   games in the vectorized engine and compares every turn — empire state
   (techs, civics, settlers, city count, treasury, science, culture,
   empireScore) and per-city state (population, owned tiles, buildings,
   tiles acquired, food box, culture box).
2. **Off-script parity** (the phase-3 gate). `python gpu/rollout.py` has
   the vectorized engine play *random masked actions* and log every
   choice; `npx vite-node scripts/replay-gpu.ts` feeds that exact action
   log through the TS engine and demands the same trace, turn by turn.
   Scripted traces can't catch bugs that only off-script trajectories
   reach — eureka-detection timing, same-turn settler-cost sequencing,
   research banking, idle production — this does. Every logged action is
   also asserted *legal* in the TS engine, so a mask that's looser than
   the real rules fails loudly.

**Integer state must match exactly**; float accumulators may differ by
≤2 milli-units (IEEE addition isn't associative across summation orders —
real logic bugs *drift* turn over turn and still fail).

Randomness is parity-checked too: the engine mirrors the TS `rngState`
mulberry32 **draw for draw** (vectorized on u32-in-int64, advancing only
the games whose control flow reaches each draw), and the trace carries
the raw RNG state every turn — a single extra or missing draw anywhere
fails the very next row. Integer-rounded formulas avoid two portability
traps: JS `Math.round` is half-up (`floor(x+0.5)`, not torch's
half-to-even), and the damage curve's `30·e^(0.04·Δ)` table is computed
in JS and shipped in the fixtures, since libm `exp()` may differ by an
ulp between runtimes.

Current status: scripted **10 seeds × 100 turns × 6 city slots + 3
city-states + 2 rival civs + disasters** and off-script **30 random
games × 100 turns** — across rival war declarations, loyalty flips,
~95 rival settlements, envoy assignments, quests, hundreds of fights
and a steady drip of floods, droughts, storms and eruptions — all
integer-exact with floats within 1 milli-unit, the in-state RNG pinned
every turn. The harness catches planted bugs (settler cost nudges,
dropped ring-1 claims, disabled eureka detection, swapped damage-roll
order, a removed victor-survives rule, a nudged war-declaration chance),
and caught real ones during development, all of the same species:
**floating-point associativity and indexing**. Site quality pre-summed
per tile flipped a strict `>` between two sites that differ by one ulp
(36.5 vs 36.49999999999999 — the exporter now ships per-SOURCE terms and
the engine replays the exact four-add sequence); the rival tech level
accumulated in two adds where the TS engine uses one (the ulp flipped a
`floor(tech·1.5)` defense); a `gather(1, tiles[g])` read rows
0..|g|−1 instead of rows g, corrupting a phantom unit slot; and 4d's
catch — disasters modify a city center's *raw* food **before** the
min-2 clamp, so the exported post-clamp center yields hid a drought
(the exporter now ships the pre-clamp food and the engine redoes the
clamp live). One honest caveat remains: a boost firing *earlier* than
the TS engine is invisible until it crosses its target's completion
boundary. Fixtures are regenerated, not committed — they must always
match the engine version you're comparing against.

## The action surface (phase 3)

Mirrors `CivEnv`'s decision set, restricted to the covered scope. Each
turn, `BatchSim.step(production, tech, civic)` accepts:

- **production** `[B, C]` — per idle city: a City Center building
  (`0..NB-1`), a settler (`NB`; always trainable, price rising per city
  exactly like `settlerCost`, including several cities queueing in the
  same turn), idle (`NB+1`), or train a roster unit (`NB+2..`,
  tech-gated like `trainableUnits`). Founding consumes the fixture's
  advisor-ranked site list in order, like the TS autopilot.
- **tech / civic** `[B]` — applied when the research slot is empty;
  progress banks while the policy deliberates, exactly like manual
  research in the TS engine.
- **units** `[B, P]` (phase 4b) — one order per player unit per turn:
  step to a neighbor (0–5), melee-attack the barbarian there (6–11), or
  hold (12). Orders execute in spawn order and are RE-validated at
  execution on both engines identically (an earlier unit's move can
  invalidate a later order — rejected orders are no-ops, not errors).
  Combat mirrors `meleeAttack`: terrain defense, the victor-survives
  rule on mutual kills, advancing into the emptied tile, and clearing a
  barbarian camp on entry (+50 gold, camp list splice). This goes BEYOND
  the TS `CivEnv`, which delegates units to an autopilot — here the
  policy commands the army directly.
- **envoy** `[B]` (phase 4c) — back that met city-state with one banked
  envoy (influence accrues 3/turn; quests award more). Envoy tiers feed
  the capital's yields exactly like `csEnvoyBonuses` → `capitalYields`.

Validity masks (`production_mask()`, `tech_mask()`, `civic_mask()`)
mirror the TS availability rules; invalid or `-1` actions are no-ops.
Passing `None` for any head falls back to the phase-2 scripted policy —
that's what the scripted parity gate runs. Eurekas are **detected from
state** (buildings, population, city count, coastal capital, owned tiles
near natural wonders, tech prerequisites) rather than replayed from a
schedule, because off-script trajectories trigger them at different
turns.

`civ6gpu.BatchEnv` wraps this as a fixed-horizon batched RL env: masks →
actions → reward = Δ`empireScore(state, 'balanced')` (an exact mirror,
parity-checked in every trace row — rewards telescope to the same
fitness the TS benchmarks report). `civ6gpu.rng` provides the
counter-based RNG (splitmix64): every draw is a pure function of
`(seed, turn, head, slot)`, so streams survive batch reordering and
resumes. It drives the *policy* side (the random rollout actor); the
*world's* randomness — barbarians, quests, rival wars, disasters — runs
on the mirrored in-state mulberry32, because those draws must match the
TS engine draw for draw.

## Training natively (phase 5)

`gpu/train_ppo.py` closes the loop: policy inference, env stepping and
the PPO update all run on one device — no numpy, no subprocess bridge,
no host round-trips (the only sync points are logging scalars).

```bash
python gpu/train_ppo.py                            # CPU smoke settings
python gpu/train_ppo.py --batch 1024 --updates 2000 --anneal-lr   # GPU box
python gpu/eval.py --policy gpu/runs/ppo/best.pt   # 50-episode protocol
```

The policy is a shared MLP trunk with five masked-categorical heads
mirroring the action surface — per-city production, tech, civic, envoy,
and a per-unit-slot head that runs a small MLP on (trunk embedding ⊕
that unit's features: position, hp, type, and the bearing/range to the
nearest barbarian camp). Heads whose mask row is all-False (queue busy,
research running, empty unit slot) contribute nothing to the log-prob,
entropy or gradient; the composite action's log-prob is the sum over
heads that actually decided something. Each update collects one full
fixed-horizon episode per game with GAE (no bootstrap past the horizon
— the telescoped score IS the objective), then runs minibatched
clipped-surrogate epochs. Checkpoints, a CSV log and TensorBoard events
land under `--out`.

Worlds are re-seeded per episode: `BatchEnv.reset(scramble=seed)`
re-hashes each game's in-state mulberry32 from (seed, game index,
episode counter), so consecutive episodes see fresh barbarian spawns,
quests, wars and disasters on the same fixture maps. Plain `reset()`
keeps the fixture's recorded stream — the parity setting; the gates are
untouched by training features. More map variety = export more
fixtures (`npm run gpu:export -- 32`).

`gpu/eval.py` is the benchmark protocol for this env (N independent
episodes, fresh worlds, `empireScore` at the horizon). Numbers are
comparable only WITHIN this table — the GPU env has direct unit control
and the full hostile world, unlike the TS benchmark scenario:

| policy (GPU env, 100 turns, 50 episodes) | score |
|---|---|
| random masked actions | 111.0 ± 12.2 |
| engine scripted autopilot | 172.5 ± 17.3 |
| PPO (native loop, CPU smoke run) | passes the autopilot inside ~70k steps (~10 updates at batch 64); train longer on a CUDA box |

## What phases 1–4d cover (and what they don't)

| Ported & parity-checked | Not yet (runs in TS only) |
|---|---|
| Tile yields (via exported per-tile tables) | Improvements/builders (yields are static) |
| Citizen assignment (focus weights, exact tie-breaks) | Districts beyond the City Center |
| Growth/starvation, housing (water+buildings), amenity tiers | Luxury amenity sharing (inert until improvements) |
| City Center buildings (unlocks, river gate, maintenance) | Ranged attacks, multi-tile moves (A* pathing) |
| Settlers: rising cost, training, auto-founding (with drops) | Conquest: capturing rival cities / city-states |
| Multi-city: per-city queues, ring-1 claims at founding | Player-declared war and peace deals |
| Shared-map border competition (exact per-city ordering) | Militaristic levies, CS trade-route quests |
| Tech/civic research: manual picks, banking, auto-pick | Policies/governments/religion modifiers |
| Eureka **detection** + discounts (covered-scope conditions) | Fog of war, trade routes |
| RL action masks, empireScore reward, batched env | Pillaging (needs improvements on the map) |
| Barbarians: camps, garrisons, raiders, sieges, sacks, healing | Goody huts (reference maps exported without them) |
| Player military: training, single-step moves, melee, camp clearing | Eureka conditions outside covered state |
| Per-side stacking (1 military + 1 civilian; foreign blocks) | |
| City-states: influence, envoys, quests, capital yield tiers | |
| Rivals: tile economies, border growth, settling, unit production | |
| Rival wars: declarations, raids, sieges, auto-peace; barb↔rival | |
| Loyalty pressure and city flips (capitals immune) | |
| Disasters: floods, volcanoes, droughts, storms; fertility & drought food shifts | |
| In-state mulberry32 RNG, mirrored draw for draw | |

Each later phase moves a row from the right column to the left, extending
the same fixtures/traces mechanism.

## Running

```bash
npm run gpu:export            # 1. record fixtures from the TS engine
python gpu/parity_test.py     # 2. scripted parity
python gpu/rollout.py         # 3. random-action games on this engine
npm run gpu:replay            # 4. the TS oracle must reproduce them
python gpu/bench.py           # 5. throughput (CUDA if available)
python gpu/train_ppo.py       # 6. train natively (phase 5)
python gpu/eval.py --policy gpu/runs/ppo/best.pt   # 7. evaluate
```

Needs only `torch` (already in `python/requirements.txt`). Parity runs in
float64 on CPU; training uses float32.

Reference numbers on the same 4-core container, **identical full-world
scenario** (6 city slots + barbarians + 3 city-states + 2 rivals +
disasters) in both engines: the TS engine does ~520 game-turns/sec per
core (~2,100/sec across 4 cores); the vectorized engine does ~3,000
game-turns/sec in float64 (the parity dtype) and ~5,000–7,000 in
float32 (the training dtype; the shared container is noisy) at batch
1024. The rival machinery walks small python loops per civ/city/unit
slot, which narrows the CPU margin — batch scaling and CUDA are the
point, and those loops are the first optimization target for phase 5.
Run `python gpu/bench.py` on an RTX-class card for the CUDA numbers.

## Phase roadmap

1. ✅ Economic core + parity harness + benchmark.
2. ✅ Multi-city: settlers, city founding, per-city queues, shared-tile
   ownership — state gained the city dimension `[B, C, …]`.
3. ✅ Action interface: masked macro-actions (production/research/civics)
   mirroring `CivEnv`, eureka detection, empireScore rewards, batched
   counter-based RNG, and the off-script rollout→replay parity gate.
4. The hostile world, incrementally:
   - ✅ 4a. Barbarians — camps, garrisons, raiders, greedy marches, city
     sieges/sacks, healing — with the in-state mulberry32 mirrored draw
     for draw (the trace pins the RNG state itself every turn).
   - ✅ 4b. Player military — the trainable roster in the production
     head, per-unit move/attack/hold orders with execution-time
     revalidation, melee combat both directions, camp clearing.
   - ✅ 4c. City-states and rival civs — envoys/quests/capital tiers;
     rival tile economies, staggered border growth, site-quality
     settling, unit production, GP/pantheon/belief races (draws
     mirrored), war and auto-peace, at-war raids and peacetime patrols,
     loyalty pressure and city flips.
   - ✅ 4d. Disasters — the last stochastic system, behind the same
     gate: river floods, volcanic eruptions, area droughts and storms,
     each fertilizing (+1 food, cap 3) or drought-striking (−1 food,
     floored at 0) tiles; tile and city-center food become dynamic
     (`_eff_yields`, pre-clamp raw center food shipped in fixtures).
5. Native GPU training, in two steps:
   - ✅ 5a. The training loop — masked multi-head PPO over `BatchEnv`
     (per-city production, tech, civic, envoy, and a per-unit head fed
     by unit features), per-episode world re-seeding, checkpoints +
     CSV/TensorBoard, and the `gpu/eval.py` benchmark protocol with
     random/scripted baselines.
   - 5b. Kernelize the per-slot python loops. Per-phase profile at
     B=512 (share of a step): rival phase ~26%, barbarian phase ~24%,
     city totals ~12%, disasters ~11%, loyalty ~4% — the rival and
     barbarian slot-walks are half the step and go first.
