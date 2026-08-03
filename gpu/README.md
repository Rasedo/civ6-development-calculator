# GPU engine (alternative, not a replacement)

A vectorized PyTorch port of the simulation core: thousands of games step
in lockstep as `[B, C, …]` tensor operations (B games × C cities). The
TypeScript engine remains the source of truth; this port exists for
self-play-scale RL training — and since phase 3 it is *trainable against*:
a masked macro-action surface drives production, research, civics, unit
orders and envoys, while the world fights back: barbarians raid (4a),
the policy commands its own army (4b), city-states and scripted
rival civilizations live alongside — growing, settling, racing beliefs,
declaring war and flipping disloyal cities (4c) — the climate takes
its cut: floods, droughts, storms and volcanoes reshape tile food (4d) —
and builders develop the land: farms, mines and lumber mills lift tile
yields, while barbarians, at-war rivals and disasters raid, sack and
scorch them (6). The district economy is live (D1–D6: Campus, Holy
Site, Commercial Hub, Aqueduct and Harbor place off-script in any city,
with real adjacency, their building chains and great people), and the
policy owns real agency verbs: gold purchases of buildings/settlers/
units (V-P), ranged strikes (V-R), and player war/peace with city
capture — rival cities and city-states — live (V-W1/V-W2). Phase 5
trains on all of it with a native on-device PPO loop, and
`gpu/SEARCH.md` is the search arm on the same forward model.

## The battery

`python gpu/battery.py` runs everything an engine stage must pass —
build, vitest, fixture export, BOTH parity gates, the five self-tests,
and the two 50-episode baselines — in ~4 min wall (~253s; three parallel
lanes after the serial build/export stage, the scripted lane now ~221s at
the 250-turn horizon). `--full` adds mcts_test's
closed-loop MPC quality benchmarks (~9 extra min; only needed when
search code changes). `--no-eval` skips the baselines for mid-stage
iteration.

## The parity contract

This is a *re-derivation*, and re-derivations silently drift — so nothing
here is trusted without proof. Two gates, one oracle:

1. **Scripted parity.** `npm run gpu:export` runs the **real TS engine**
   over reference seeds and records rule tables plus turn-by-turn traces
   into `gpu/fixtures/`; `python gpu/serve_gate.py --batched` plays the same
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

Current status: scripted **24 seeds × 250 turns × 6 city slots + 3
city-states + 2 rival civs + disasters + builders** and off-script **72
random games × 250 turns (the fixtures' turnLimit — proven exact to 300)**
— across rival war declarations, loyalty
flips, ~95 rival settlements, envoy assignments, quests, hundreds of
fights, a steady drip of floods, droughts, storms and eruptions, and
builders farming ~3 tiles each (22 of 24 seeds) while barbarians and
at-war rivals raid those farms and disasters scorch them — all
integer-exact with floats within 1 milli-unit, the in-state RNG pinned
every turn. The harness catches planted bugs (settler cost nudges,
dropped ring-1 claims, disabled eureka detection, swapped damage-roll
order, a removed victor-survives rule, a nudged war-declaration chance),
and caught real ones during development. One family is **floating-point
associativity and indexing**: site quality pre-summed per tile flipped a
strict `>` between two sites that differ by one ulp (36.5 vs
36.49999999999999 — the exporter now ships per-SOURCE terms and the
engine replays the exact four-add sequence); the rival tech level
accumulated in two adds where the TS engine uses one (the ulp flipped a
`floor(tech·1.5)` defense); a `gather(1, tiles[g])` read rows
0..|g|−1 instead of rows g, corrupting a phantom unit slot; and disasters
modify a city center's *raw* food **before** the min-2 clamp, so the
exported post-clamp center yields hid a drought (the exporter now ships
the pre-clamp food and the engine redoes the clamp live). A second
family — surfaced when the seed set widened from 10 to 24 — is **the
vectorized engine trusting a `t=0` static where the TS engine recomputes
live**, each needing rare geometry to bite: a rival working tile that
*later* became a city center still carried its founding-day yield (paved
center tiles produce nothing — now masked by live `center_at`/`rvcity_at`
occupancy); a city founded on woods/rainforest/marsh kept the feature's
+3 terrain-defense in the static table after `foundCity` strips the
feature (defense now drops to the hills component at founding); and a
natural-wonder tile inside a rival's radius let fertility/drought move
its food, when `tileYields` early-returns the wonder's fixed yield before
the disaster tail (wonder food now pinned). A third family arrived with
**builders and farms** (phase 6): raiders march for the nearest *player
improvement* before the nearest city (`hostileUnitAct` step 3 — the GPU's
barb **and** at-war-rival marches now target farms, which fixed a
cascade where a rival unit spawned a tile off and a barb then found it);
resource tiles are farmable (rice/wheat use FARM, so `fa_f` includes
them, ungated); the IRRIGATION eureka ("farm a resource") had to be
exported and detected once farms existed; and pillaging comes from three
sources the GPU had to mirror — a raider standing on a farm, a city
**sack** pillaging its center's six neighbours, and disaster **scorching**
(floods/volcanoes/storms). The newest family-2 catch came from the
purchase verbs (V-P2): a rival working a player-built MINE got zero
production on the GPU (a stale "production is static" plane) where the
TS engine pays the mine's BASE yield under defaultModifiers — invisible
until purchases put builder improvements inside rival borders. One
honest caveat remains: a boost firing *earlier* than the TS engine is
invisible until it crosses its target's completion boundary. Fixtures
are regenerated, not committed — they must always match the engine
version you're comparing against.

## The action surface (phase 3)

Mirrors `CivEnv`'s decision set, restricted to the covered scope. Each
turn, `BatchSim.step(production, tech, civic)` accepts:

- **production** `[B, C]` — per idle city: a City Center or district
  building (`0..NB-1`), a settler (`NB`; always trainable, price rising
  per city exactly like `settlerCost`, including several cities queueing
  in the same turn), idle (`NB+1`), train a roster unit
  (`NB+2..NB+1+NU`, tech-gated like `trainableUnits`), place a scaffold
  district (`NB+2+NU..` — Campus/Holy Site/Commercial Hub/Aqueduct/
  Harbor, instantly on its best adjacency tile, any city), or **buy
  outright with gold** (`NB+2+NU+nScaffold..`: that building / a settler
  / that unit at `GOLD_PURCHASE_MULT`× cost, mirroring purchaseBuilding/
  purchaseSettler/purchaseUnit — the shared treasury re-validates in
  slot order at execution). Founding consumes the fixture's
  advisor-ranked site list in order, like the TS autopilot.
- **tech / civic** `[B]` — applied when the research slot is empty;
  progress banks while the policy deliberates, exactly like manual
  research in the TS engine.
- **units** `[B, P, 16]` (phase 4b, +build in phase 6, +ranged in V-R) —
  one order per player unit per turn: step to a neighbor (0–5), attack
  the barbarian or at-war-rival unit there (6–11), hold (12), or build a
  FARM / MINE / LUMBER_MILL (13/14/15 — builders on a tile where that
  improvement is valid). Orders execute in spawn order and are
  RE-validated at execution on both engines identically (an earlier
  unit's move can invalidate a later order — rejected orders are no-ops,
  not errors). Melee mirrors `meleeAttack`: terrain defense, the
  victor-survives rule on mutual kills, advancing into the emptied tile,
  and clearing a barbarian camp on entry (+50 gold, camp list splice);
  **ranged units (Slinger/Archer) execute the same codes as
  `rangedAttack`** — one roll, no retaliation, no advance (range-1
  targets; Archer's ring-2 target set is a deferred widening). This goes
  BEYOND the TS `CivEnv`, which delegates units to an autopilot — here
  the policy commands the army *and its builders* directly. The
  off-script replay identifies each ordered unit by its tile + domain
  (not an append-only slot), so a unit that spawns and dies in the same
  turn can't desync the mapping.
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

`gpu/eval/train_ppo.py` closes the loop: policy inference, env stepping and
the PPO update all run on one device — no numpy, no subprocess bridge,
no host round-trips (the only sync points are logging scalars).

```bash
python gpu/eval/train_ppo.py                            # CPU smoke settings
python gpu/eval/train_ppo.py --batch 1024 --updates 2000 --anneal-lr   # GPU box
python gpu/eval/eval.py --policy gpu/runs/ppo/best.pt   # 50-episode protocol
```

`gpu/TRAINING.md` is the step-by-step guide (fixture export, device
choice, overnight sizing, what the TensorBoard curves should look
like, resume, eval).

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

`gpu/eval/eval.py` is the benchmark protocol for this env (N independent
episodes, fresh worlds, `empireScore` at the horizon). Numbers are
comparable only WITHIN this table — the GPU env has direct unit control
and the full hostile world, unlike the TS benchmark scenario.
Historical (horizon-100 era; the horizon has since settled at 250 —
current baselines live in `gpu/TRAINING.md`):

| policy (GPU env, 100 turns, 50 episodes, district engine) | score |
|---|---|
| random masked actions | 115.1 ± 11.8 |
| engine scripted autopilot | 162.2 ± 13.0 |
| PPO **tune1** — 12M steps, ~80 min on an RTX 4070 SUPER | **216.9 ± 13.5** |

tune1 beats the scripted autopilot with non-overlapping 95% CIs on the
26-action district engine (recipe in `gpu/TRAINING.md`; what a strong
net does — and doesn't do — for search is in `gpu/SEARCH.md`). The
46-action purchase head and ranged strikes are newer than tune1;
`fit_env_to_checkpoint` auto-narrows the env so older checkpoints stay
benchmarkable. Historical baselines from earlier, simpler engines:
random 111.0 / scripted 172.5 / 256k-step CPU PPO 186.4 (v5b), and the
40M-step overnight 213.6 (14-action, farms-only) — the CPU demo passed
the autopilot inside ~70k steps; a CUDA box at batch 4096 collects that
much experience per handful of updates. Long runs are the point.

## What phases 1–5 cover (and what they don't)

| Ported & parity-checked | Not yet (runs in TS only) |
|---|---|
| Tile yields (via exported per-tile tables) | Chops/harvests (one-time yields); player build heads stop at FARM/MINE/LUMBER_MILL (the rival economy builds/yields QUARRY/PASTURE/CAMP/PLANTATION/OIL_WELL since A-13) |
| Citizen assignment (focus weights, exact tie-breaks) | Districts beyond the covered five (Theater, IZ, Encampment*, Entertainment, Neighborhood) |
| Growth/starvation, housing (water+buildings+farms+Aqueduct), amenity tiers | Archer range-2 targets; multi-tile A* moves |
| City Center + district buildings (12; tech/civic unlocks, river gate, prereqs, maintenance) | |
| Districts: Campus/Holy Site/Commercial Hub/Aqueduct/Harbor — RL placement any-city, dynamic adjacency, specialty cap | Militaristic levies, CS trade-route quests |
| Great people: Scientist/Merchant/Prophet accrual + effects, shared race pool | Religion modifiers beyond belief tables; policy channels beyond cityYields/capitalYields/housingAll |
| **Governments + policies (#46r)**: both scripted seats adopt (`computeAdoption` twin), greedy slot fill incl. wildcard overflow, cityYields/capitalYields/housingAll live at 24×250 | |
| **Gold purchases** (buy building/settler/unit at 4×, slot-order treasury) | Fog of war, trade routes |
| Settlers: rising cost, training, purchase, auto-founding (with drops) | Luxury amenity sharing (inert in covered scope) |
| Builders: training, single-step moves, FARM/MINE/LUMBER building, charges | Goody huts (reference maps exported without them) |
| Tile improvements: dynamic food/production, resource farms, tech-boosted mines | Eureka conditions outside covered state |
| **Ranged strikes** (Slinger/Archer: one roll, no retaliation, range-1) | Specialists |
| Player war/peace: live (declare/peace-for-gold), with capture of rival cities and city-states | |
| Multi-city: per-city queues, ring-1 claims at founding | |
| Shared-map border competition (exact per-city ordering) | |
| Tech/civic research: manual picks, banking, auto-pick | |
| Eureka **detection** + discounts (incl. IRRIGATION farm-a-resource) | |
| RL action masks, empireScore reward, batched env | |
| Barbarians: camps, garrisons, raiders, sieges, sacks, healing | |
| Player military: training, single-step moves, melee, camp clearing | |
| Pillaging: barbs & at-war rivals raid your farms; sack pillages | |
| Disaster scorching: floods/volcanoes/storms pillage improvements | |
| Per-side stacking (1 military + 1 civilian; foreign blocks) | |
| City-states: influence, envoys, quests, capital + district yield tiers | |
| Rivals: tile economies (improvement base yields, no player boosts), border growth, settling, unit production | |
| Rival wars: declarations, farm-raiding marches, sieges, auto-peace | |
| Loyalty pressure and city flips (capitals immune) | |
| Disasters: floods, volcanoes, droughts, storms; fertility & drought | |
| In-state mulberry32 RNG, mirrored draw for draw | |

\* Encampment is wired end-to-end but held out of the scaffold (see BUILD_PLAN D6).

Each later phase moves a row from the right column to the left, extending
the same fixtures/traces mechanism.

## Running

```bash
npm run gpu:export            # 1. record fixtures from the TS engine
python gpu/serve_gate.py --batched --turns 250   # 2. the decision-server gate
python gpu/rollout.py         # 3. random-action games on this engine
npm run gpu:replay            # 4. the TS oracle must reproduce them
python gpu/tools/bench.py           # 5. throughput (CUDA if available)
python gpu/eval/train_ppo.py       # 6. train natively (phase 5)
python gpu/eval/eval.py --policy gpu/runs/ppo/best.pt   # 7. evaluate

python gpu/tests/purchase_test.py   # deterministic self-tests: verbs…
python gpu/tests/war_test.py        #   (war/peace is gated off; test flips it)
python gpu/tests/ranged_test.py
python gpu/tests/mcts_test.py       # …and the search primitives
```

Needs only `torch` (already in `python/requirements.txt`). Parity runs in
float64 on CPU; training uses float32.

Reference numbers on the same 4-core container, **identical full-world
scenario** (6 city slots + barbarians + 3 city-states + 2 rivals +
disasters + builders) in both engines: the TS engine does ~520
game-turns/sec per core (~2,100/sec across 4 cores); the vectorized
engine does ~8,200 game-turns/sec in float64 (the parity dtype) and
~16,000 in float32 (the training dtype) at batch 1024 — the phase-6
improvement/pillage/scorch logic is nearly free on top of the 5b
kernelization, itself 3× the pre-5b numbers from four families of
parity-exact rewrites:
pairwise distance indexing instead of `[B, …, T]` row materializations,
per-turn caching of the disaster-adjusted yield planes, the citizen
topk narrowed from the full map to the radius-3 window (same candidates,
same keys, same order), and batched disaster area effects. The
remaining per-slot python loops (raider/unit acts, rival city walks)
carry real sequential draw/occupancy semantics; batch scaling and CUDA
hide their launch overhead. Run `python gpu/tools/bench.py` on an RTX-class
card for the CUDA numbers.

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
     CSV/TensorBoard, and the `gpu/eval/eval.py` benchmark protocol with
     random/scripted baselines.
   - ✅ 5b. Kernelize the hot loops — 3× step throughput (f64 3.1k →
     9.6k, f32 → 13k game-turns/sec at batch 1024 on the 4-core box),
     all parity-exact and re-verified through both gates after every
     round: pairwise `pair_dist[a, b]` indexing (13 sites — the war
     -declaration check alone materialized 28 MB/rival/turn), cached
     disaster yield planes (the rival economies re-cloned [B, T, 6]
     up to 20×/turn), the citizen topk over the 37-tile work window
     instead of the full map, camp-distance hoists, batched disaster
     areas, static candidate lists for disaster picks, and a
     dyadic-exactness fast path that collapses the rival yield reduce
     (guarded: it falls back to sequential adds if any tile yield is
     not an integer/half). Loops that survive carry genuine
     sequential-draw semantics (raider and rival unit acts).
6. ✅ Improvements & builders (FARM). Builders train, move single-step and
   build farms (dynamic tile food + housing, resource farms, the
   IRRIGATION eureka); barbarians and at-war rivals march for your farms
   and pillage them, city sacks pillage the center's neighbours, and
   disasters scorch improvements. The RL units head gained a **build
   action (13)** so the policy commands builders directly (50 build orders
   across the 72-game off-script gate, 31 games building farms) — all
   behind the same two gates.
7. ✅ MINE & LUMBER_MILL (phase 6b). Tile PRODUCTION goes dynamic: builders
   build mines (hills or a mined resource, gated by MINING; tech-boosted
   +1⚙ each by Apprenticeship and Industrialization) and lumber mills
   (woods, gated by CONSTRUCTION) via RL build actions 14/15. Mines are
   raided/pillaged like any improvement and fire the WHEEL/APPRENTICESHIP
   eurekas; housing stays FARM-only. The off-script gate builds ~15 mines
   across 11 games; lumber mills (CONSTRUCTION lands after 3-charge builders
   act) are covered by a deterministic build-action self-test. Still open
   here: chop/harvest one-time yields, then player build heads for the
   resource improvements (pasture/camp/plantation) — which the rival
   economy already builds/yields since A-13.
8. ✅ Districts D1–D6 + agency verbs (V arm). Campus/Holy Site/Commercial
   Hub/Aqueduct/Harbor place off-script in any city (dynamic adjacency,
   building chains, great people); gold purchases live in the production
   head (V-P — whose gate caught a latent rival-economy bug: rivals now
   get improvement BASE yields, never the player's tech boosts); ranged
   strikes live (V-R); player war/peace live (V-W1), and city capture
   is live in both engines — rival cities and city-states transfer to
   the player (V-W2/V-CS).
9. Single-agent search (M arm) — `gpu/SEARCH.md`: snapshot/restore,
   exhaustive 1-ply, closed-loop MPC, empire-wide search, net-guided
   tuple search. Strong-net verdict: a 1-ply value leaf cannot beat the
   net's own greedy at any sampling temperature — M3 (search-distilled
   value training, batched candidate evaluation) is the open lever.
10. **DECIDED 2026-07-06: Road A** — promote rivals to full symmetric
   civs in BOTH engines under the parity contract, then per-seat RL and
   a self-play league. Ordered stages in `BUILD_PLAN.md` §3
   (C1-A groundwork → C1-B subsystem promotion → C2 seats → C3 league).

## Docs

Living: `BUILD_PLAN.md` (roadmap + per-stage status log), `TRAINING.md`
(training guide + all baselines/results), `SEARCH.md` (search results).
Historical: `ARCHIVE.md` (the C1 decision, the B3-B5/C2/C3c designs and
the RL research synthesis, consolidated verbatim).
