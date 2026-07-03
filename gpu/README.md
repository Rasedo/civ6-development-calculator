# GPU engine (alternative, not a replacement)

A vectorized PyTorch port of the simulation core: thousands of games step
in lockstep as `[B, C, …]` tensor operations (B games × C cities). The
TypeScript engine remains the source of truth; this port exists for
self-play-scale RL training — and since phase 3 it is *trainable against*:
a masked macro-action surface drives production, research and civics.

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

Current status: scripted **10 seeds × 100 turns × 6 city slots** and
off-script **30 random games × 100 turns**, both integer-exact with
floats within 1 milli-unit. The harness catches planted bugs (settler
cost nudges, dropped ring-1 claims, disabled eureka detection, missing
same-turn settler-cost sequencing). One honest caveat: a boost firing
*earlier* than the TS engine is invisible until it crosses its target's
completion boundary, so detection-timing coverage is only as strong as
the random trajectories are varied. Fixtures are regenerated, not
committed — they must always match the engine version you're comparing
against.

## The action surface (phase 3)

Mirrors `CivEnv`'s decision set, restricted to the covered scope. Each
turn, `BatchSim.step(production, tech, civic)` accepts:

- **production** `[B, C]` — per idle city: a City Center building
  (`0..NB-1`), a settler (`NB`; always trainable, price rising per city
  exactly like `settlerCost`, including several cities queueing in the
  same turn), or idle (`NB+1`). Founding consumes the fixture's
  advisor-ranked site list in order, like the TS autopilot.
- **tech / civic** `[B]` — applied when the research slot is empty;
  progress banks while the policy deliberates, exactly like manual
  research in the TS engine.

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
resumes — the random rollout actor uses it today, phase 4's stochastic
systems (barbarians, disasters) will use it next.

## What phases 1–3 cover (and what they don't)

| Ported & parity-checked | Not yet (runs in TS only) |
|---|---|
| Tile yields (via exported per-tile tables) | Improvements/builders (yields are static) |
| Citizen assignment (focus weights, exact tie-breaks) | Districts beyond the City Center |
| Growth/starvation, housing (water+buildings), amenity tiers | Luxury amenity sharing (inert until improvements) |
| City Center buildings (unlocks, river gate, maintenance) | Units on the map, combat, barbarians |
| Settlers: rising cost, training, auto-founding | City-states, rivals, loyalty |
| Multi-city: per-city queues, ring-1 claims at founding | Policies/governments/religion modifiers |
| Shared-map border competition (exact per-city ordering) | Fog of war, disasters, trade |
| Tech/civic research: manual picks, banking, auto-pick | Eureka conditions outside covered state (improvement/district/GP checks) |
| Eureka **detection** + discounts (covered-scope conditions) | |
| RL action masks, empireScore reward, batched env | |

Each later phase moves a row from the right column to the left, extending
the same fixtures/traces mechanism.

## Running

```bash
npm run gpu:export            # 1. record fixtures from the TS engine
python gpu/parity_test.py     # 2. scripted parity
python gpu/rollout.py         # 3. random-action games on this engine
npm run gpu:replay            # 4. the TS oracle must reproduce them
python gpu/bench.py           # 5. throughput (CUDA if available)
```

Needs only `torch` (already in `python/requirements.txt`). Parity runs in
float64 on CPU; training uses float32.

Reference numbers on the same 4-core container, **identical 6-city-slot
scenario** in both engines: the TS engine does ~1,130 game-turns/sec per
core (~4,500/sec across 4 cores); the vectorized engine does ~11,000
game-turns/sec in float64 (the parity dtype) and ~19,400 in float32 (the
training dtype) at batch 1024 — each game-turn simulating up to six
cities. Run `python gpu/bench.py` on an RTX-class card for the CUDA
numbers.

## Phase roadmap

1. ✅ Economic core + parity harness + benchmark.
2. ✅ Multi-city: settlers, city founding, per-city queues, shared-tile
   ownership — state gained the city dimension `[B, C, …]`.
3. ✅ Action interface: masked macro-actions (production/research/civics)
   mirroring `CivEnv`, eureka detection, empireScore rewards, batched
   counter-based RNG, and the off-script rollout→replay parity gate.
4. The hostile world: barbarians (flood-fill movement instead of A*),
   rivals, city-states, disasters — each behind the same parity gate,
   randomness via the counter-based RNG.
5. Native GPU training loop: policy inference and env stepping never
   leave the device.
