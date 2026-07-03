# GPU engine (alternative, not a replacement)

A vectorized PyTorch port of the simulation core: thousands of games step
in lockstep as `[B, C, …]` tensor operations (B games × C cities). The
TypeScript engine remains the source of truth; this port exists for
self-play-scale RL training.

## The parity contract

This is a *re-derivation*, and re-derivations silently drift — so nothing
here is trusted without proof:

1. `npm run gpu:export` runs the **real TS engine** over reference seeds
   and records rule tables plus turn-by-turn traces into `gpu/fixtures/`.
2. `python gpu/parity_test.py` replays the same games in the vectorized
   engine and compares every turn — empire state (techs, civics, settlers,
   city count, treasury, science, culture) and per-city state (population,
   owned tiles, buildings, tiles acquired, food box, culture box).
   **Integer state must match exactly**; float accumulators may differ by
   ≤2 milli-units (IEEE addition isn't associative across summation
   orders — real logic bugs *drift* turn over turn and still fail).

Current status: **10 seeds × 100 turns × 3 cities, integer-exact, floats
within 1 milli-unit** — including the *founding turns* of cities 2 and 3,
which the engine derives itself from simulated settler production.
Fixtures are regenerated, not committed — they must always match the
engine version you're comparing against.

## What phases 1–2 cover (and what they don't)

| Ported & parity-checked | Not yet (runs in TS only) |
|---|---|
| Tile yields (via exported per-tile tables) | Improvements/builders (yields are static) |
| Citizen assignment (focus weights, exact tie-breaks) | Districts beyond the City Center |
| Growth/starvation, housing (water+buildings), amenity tiers | Luxury amenity sharing (inert until improvements) |
| City Center buildings (unlocks, river gate, maintenance) | Units on the map, combat, barbarians |
| Settlers: rising cost, pop-gated training, auto-founding | City-states, rivals, loyalty |
| Multi-city: per-city queues, ring-1 claims at founding | Policies/governments/religion modifiers |
| Shared-map border competition (exact per-city ordering) | Eureka *detection* (fixture-fed for now) |
| Tech/civic research, cheapest-first auto-pick | Fog of war, disasters, trade |
| Eureka discounts (schedule-driven from fixtures) | |

The scenario both engines run for parity: a peaceful world where the
capital trains settlers (cost rising per city, as in the real engine) and
founds cities at pre-scored sites as each settler completes — site
*choice* is fixture data, the founding *turn* is simulated — then every
city runs scripted cheapest-building production and competes for tiles
through cultural border growth on the shared ownership map. Cities within
a turn interact exactly like the TS engine: batched across games and
cities everywhere except border expansion, which resolves city-by-city in
founding order.

Each later phase moves a row from the right column to the left, extending
the same fixtures/traces mechanism.

## Running

```bash
npm run gpu:export            # 1. record fixtures from the TS engine
python gpu/parity_test.py     # 2. prove the port agrees
python gpu/bench.py           # 3. measure throughput (CUDA if available)
```

Needs only `torch` (already in `python/requirements.txt`). Parity runs in
float64 on CPU; the benchmark uses float32 on CUDA.

Reference numbers on the same 4-core container, **identical 3-city
scenario** in both engines: the TS engine does ~1,240 game-turns/sec per
core (~5,000/sec across 4 cores); the vectorized engine does ~16,700
game-turns/sec in float64 (the parity dtype) and ~37,700 in float32 (the
training dtype) at batch 1024 — i.e. ~113,000 city-turns/sec, roughly
7× the TS engine on equal hardware before a GPU is even involved. Run
`python gpu/bench.py` on an RTX-class card for the CUDA numbers.

## Phase roadmap

1. ✅ Economic core + parity harness + benchmark.
2. ✅ Multi-city: settlers, city founding, per-city queues, shared-tile
   ownership — state gained the city dimension `[B, C, …]`.
3. Action interface: replace the scripted policy with an RL macro-action
   surface mirroring `CivEnv`, plus batched counter-based RNG for the
   stochastic systems.
4. The hostile world: barbarians (flood-fill movement instead of A*),
   rivals, city-states, disasters — each behind the same parity gate.
5. Native GPU training loop: policy inference and env stepping never
   leave the device.
