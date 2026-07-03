# GPU engine (alternative, not a replacement)

A vectorized PyTorch port of the simulation core: thousands of games step
in lockstep as `[B, …]` tensor operations — on CPU already ~20× the
TypeScript engine's throughput per core, and built to run on CUDA. The
TypeScript engine remains the source of truth; this port exists for
self-play-scale RL training.

## The parity contract

This is a *re-derivation*, and re-derivations silently drift — so nothing
here is trusted without proof:

1. `npm run gpu:export` runs the **real TS engine** over reference seeds
   and records rule tables plus turn-by-turn traces into `gpu/fixtures/`.
2. `python gpu/parity_test.py` replays the same games in the vectorized
   engine and compares every turn: **integer state (population, techs,
   civics, owned tiles, buildings) must match exactly**; float
   accumulators may differ by ≤2 milli-units (IEEE addition isn't
   associative across summation orders — real logic bugs *drift* turn over
   turn and still fail).

Current status: **10 seeds × 100 turns, integer-exact, floats within
1 milli-unit.** Fixtures are regenerated, not committed — they must always
match the engine version you're comparing against.

## What phase 1 covers (and what it doesn't)

| Ported & parity-checked | Not yet (runs in TS only) |
|---|---|
| Tile yields (via exported per-tile tables) | Improvements/builders (yields are static) |
| Citizen assignment (focus weights, exact tie-breaks) | Districts beyond the City Center |
| Growth/starvation, housing (water+buildings), amenity tiers | Multi-city empires & settlers |
| City Center buildings (unlocks, river gate, maintenance) | Units, combat, barbarians |
| Cultural border expansion (exact pick ordering) | City-states, rivals, loyalty |
| Tech/civic research, cheapest-first auto-pick | Policies/governments/religion modifiers |
| Eureka discounts (schedule-driven from fixtures) | Eureka *detection* (fixture-fed for now) |
| | Fog of war, disasters, trade |

The scenario both engines run for parity: one auto-settled city, peaceful
world, scripted cheapest-building production — the economic heart. Each
later phase moves a row from the right column to the left, extending the
same fixtures/traces mechanism.

## Running

```bash
npm run gpu:export            # 1. record fixtures from the TS engine
python gpu/parity_test.py     # 2. prove the port agrees
python gpu/bench.py           # 3. measure throughput (CUDA if available)
```

Needs only `torch` (already in `python/requirements.txt`). Parity runs in
float64 on CPU; the benchmark uses float32 on CUDA.

Reference numbers (4-core container, float64 CPU): ~28,000 game-turns/sec
at batch 1024 vs ~1,200/sec for the TS engine on the same 4 cores. Run
`python gpu/bench.py` on an RTX-class card for the float32 CUDA numbers.

## Phase roadmap

1. ✅ Economic core + parity harness + benchmark (this).
2. Multi-city: settlers, per-city queues, shared-tile ownership — the
   state gains a city dimension `[B, C, …]`.
3. Action interface: replace the scripted policy with an RL macro-action
   surface mirroring `CivEnv`, plus batched counter-based RNG for the
   stochastic systems.
4. The hostile world: barbarians (flood-fill movement instead of A*),
   rivals, city-states, disasters — each behind the same parity gate.
5. Native GPU training loop: policy inference and env stepping never
   leave the device.
