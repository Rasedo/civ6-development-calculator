# SEEDER — formalizing the world producer

Owner requirement (2026-08-08): the seeder must not depend on the engines. It
independently produces seeded worlds that both engines consume. City-placement
PLANNING comes out; cities are placed randomly for now; placement RULES return
later; pre-placed cities become SETTLERS later still.

A survey agent read the code and produced this. Findings first, because three
of them change the plan.

## Findings

**F1 — the seeder is broken right now, and the worlds on disk cannot be
regenerated.** `scoreSettleSites` became `(state, seat, limit)`; three
non-test call sites still passed the old `(state, limit)` shape, so `limit=0`
returned `[]` and `site.tileIndex` threw. **Fixed 2026-08-08** in
`seeder/seeder.ts` (both sites), `cpu/core/empirePlanner.ts` and
`tools/cpu/perf-turns.ts`. The world files on disk predate the current source
either way — there is no verified baseline until `npm run seed` is run once.

**F2 — `tools/parse-check.mjs` still hardcodes `const dir = 'scripts'`,** a
directory that no longer exists. Battery stage 0 runs it and it throws ENOENT.

**F3 — `seeder/stamp.ts` under-covers by an order of magnitude.** It hashes
`seeder/**/*.ts` only, but `rules.json`'s content is determined overwhelmingly
by `cpu/data/**`. Editing `cpu/data/units.ts` changes `rules.json` and leaves
the stamp identical.

**F4 — generator PARAMETERS are not stamped.** `N_SEEDS`/`N_TURNS`/`R_MAX`/`OUT`
are argv, so a materially different world set carries an identical `srcStamp`.

**F5 — `rules.trace` is dead payload.** Nothing reads it since `parity_test.py`
was deleted. See `STATE_COMPARE_DESIGN.md`, which owns this thread.

**F6 — the TS engine never reads a world file.** In serve mode the seeder calls
`createGame(...)` and hands a live `GameState` to `runDriver`; only the GPU
reads `seed*.json`. The world exists twice — as TS code re-executed per run and
as a JSON plane dump. **This is the real reason the seeder imports the engine,**
and no dependency cut is complete until the TS side loads the file.

**F7 — the current file cannot reconstruct a TS world.** It ships derived planes
but not `terrain`/`elevation`; it ships `cityStates[].suzKey` but not the
city-state NAME, which `CS_SUZERAIN_LIVE` keys on.

**F8 — `seeder/worlds/` was untracked but not gitignored** — 8.2 MB one
`git add -A` away from being committed. **Fixed 2026-08-08**: added to
`.gitignore`.

## The module boundary

> **`seeder/` may import only `world/` and node builtins. If a symbol needs to
> know what a tile is WORTH, what a building COSTS, or what a rule DOES, it
> does not belong in `seeder/`.**

Mechanically checkable in one pass by extending `tools/parse-check.mjs`: fail
if any file under `seeder/` imports outside `seeder/`, `world/`, or node.

Four modules, not two:

| module | contents | may import |
|---|---|---|
| `world/` | `types` (the map half: `YIELD_KEYS`…`GameMap`), `hex`, `rng`, `noise`, `query`, `mapgen`, the four world catalogs (terrains/features/resources/natural wonders), `CITY_MIN_DIST` | nothing |
| `seeder/` | `worldset` (seed list + params), `place` (random draws), `world` (assemble + serialize), `stamp` | `world/` |
| `cpu/` | the TS engine, plus `cpu/export/` (rules.json + compiled planes) and `cpu/driver/` (the serve client) | `world/` |
| `gpu/` | consumes rules.json + world files | nothing TS |

`mapgen` goes to `world/`, **not** `seeder/` — 60+ vitest files call
`createGame`, which calls `generateMap`; putting it in the seeder would make
the engine's tests import the seeder.

The rule tables (`BUILDINGS`, `UNITS`, `DISTRICTS`, `TECHS`, …) stay in
`cpu/data/` and leave with the rules exporter. They are 20 of the 37 import
sites in `seeder.ts` and exist solely to build `rules.json`.

`CIV6_SERVE` mode moves to `cpu/driver/serve.ts` — it builds a game, loops
turns and speaks a wire protocol; that is a client, and a client depending on
the engine is the correct direction. `seeder/gpu-trace.ts` moves with it to
`cpu/driver/trace.ts`.

## The world file: two layers

**Layer A — the world.** Canonical, seeder-owned, sufficient to reconstruct in
any engine. `gen` (seed, generator hash, `placement` policy version, params,
`genStamp`), `catalogs` (the id strings in index order, so every index space the
file uses is declared IN the file), `map` (terrain, elevation, feature,
resource, wonder, river/cliff masks, volcano, goodyHut), `civs[]` (one array —
civ 0 is not special), `cityStates[]` (with the NAME), `tileOwner` (one
`{seat, city}` pair, not four views), `plannedSettles` (temporary), `rngInit`,
`worldHash`.

Specific choices, each answering a defect: unit and CS types are **strings**,
not roster indices; `tileOwner` is one pair; `units` order is part of the
contract (the serve gate compares per-unit rows in array order); `rngInit` is
**declared**, not captured mid-stream after placement draws; `citySlots` is a
param, not `cities.length`.

**Layer B — compiled planes.** A pure function of Layer A plus the rule
catalogs, produced by `cpu/export/planes.ts`, consumed by the GPU because it has
no catalogs. Never authoritative. Computing it engine-side keeps one
implementation of ~60 predicates in the language that is the oracle.

## Stages — SHIPPED 2026-08-09 (stages collapsed; owner batched E+F forward)

| stage | content | status |
|---|---|---|
| **0** | Make the tree runnable: F1, F2, F8. | **DONE** — F1/F8 were fixed 2026-08-08; F2 died with the `tools/parse-check.mjs` rewrite (walks cpu/seeder/world/tools/tests AND enforces the module boundary). The run baseline still waits on the testing freeze lifting. |
| **A** | Split `seeder.ts` (`cpu/export/rules.ts` + `cpu/export/planes.ts` + `cpu/export/catalog.ts`, `seeder/world.ts`); trace to `cpu/driver/trace.ts`; serve mode to `cpu/driver/serve.ts`. | **DONE** — but NOT byte-identical: it landed in the same batch as C/E/F, so there is no format-1 byte baseline. `seeder/seeder.ts` is deleted. |
| **B** | Honest stamps + tracked `seeder/worlds.lock` + `npm run seed -- --check`. | **DONE** — `seeder/stamp.ts` hashes world/+seeder/ sources + params (`genStamp`); `cpu/export/stamp.ts` hashes cpu/+world/ (`srcStamp`); the lock is written by `seeder/world.ts` and checked by `--check`, the export CLI, and `gpu load_fixture` (#78: fixture↔rules srcStamp pairing enforced at the one chokepoint every lane shares). |
| **C** | Extract `world/`; `seeder/place.ts`; the seeder stops importing the engine. | **DONE** — world/ = types (map half) + hex/rng/noise/query/mapgen + terrains/features/resources/wonders, shimmed at the old cpu paths; parse-check makes the boundary a red X. |
| **D** | `cpu/world/load.ts` — the TS engine loads the file. | **DONE** — loads Layer A (`world/file.ts` is the format), validates every catalog string, spawns units exactly on their file tiles. The stage-D deep-compare vs a generator-built state is MOOT (the generator path is gone); R6 is covered by the exact-spawn asserts + the serve gate. |
| **E** | Placement RULES, versioned. | **DONE, folded into C** — `spaced-balanced@1`: majors >= 10 apart (owner rule), city-states >= 6, every start >= 2 resources within 3 and all starts within a spread of 3 of the first; labelled streams (`place/civ/{i}`, `place/cs/{s}`), `rngInit` DECLARED. |
| **F** | Settlers at t0. | **DONE on the TS side, folded into C** — every civ starts as SETTLER + WARRIOR on its start tile (#71: the settler is a real unit; `plannedSettles` and the settler bank are deleted). Fixtures are **format 2**; `gpu load_fixture` REFUSES them loudly until the GPU catch-up (#71 GPU half + #102) deletes `site_tile`/`next_site_ptr`/`civ_settlers` and founds from unit positions. |

## Determinism

One stream per decision, domain-separated by label, never the in-state RNG —
the idiom `mapgen.ts` already uses. Labels: `place/civ/{i}`, `place/cs/{s}`,
`place/sites`, `place/play`. Candidates are tile indices in **ascending order**
(the determinism anchor); draw `floor(r * n)`; redraw on rejection from the same
stream.

Candidacy is **legality only** — land, passable, no natural wonder, no OASIS,
not already a centre, `≥ CITY_MIN_DIST` from a placed centre. That is the
boundary: *legality defines a site; scoring and extra spacing are planning.*

This buys two properties: adding a rule inside one decision perturbs only that
decision, and the play stream no longer moves when placement changes (because
`rngInit` is declared, not captured).

## Risks

**R1 — random placement can silently WEAKEN the gate.** This is the biggest
risk and it is not a correctness risk. `SEED_OVERRIDES` exists because seeds
where the scripted player died early "poison the fixture" — the seeds were
hand-picked for survivability. Uniform-random capitals will produce boxed-in
starts with fewer cities, wars, districts and wonders, i.e. fewer chances for
the engines to disagree. The gate stays green and proves less. Mitigation:
measure coverage per world set (cities, wars, districts, wonders, units by
t250) and record it beside `worlds.lock`; if it drops, filter at the level of
the **seed set** with an explicit acceptance predicate, never by putting
scoring back into placement. Note `SEED_OVERRIDES`' own criterion is already
void — the seeder plays nothing since the #93 deletions.

**R2 — nothing detects that a world CHANGED.** `checkStamp` proves worlds match
the source on disk, not that they match yesterday's. `worlds.lock` is the fix
and must land at stage B, before any content moves.

**R3 — stage C changes all 12 worlds at once.** Run the serve gate on the OLD
worlds with the new code path first, so the dependency cut and the content
change are never in the same red.

**R4 — silent index renumbering.** `IMPROVEMENT_IDS`, `Object.keys(FEATURES)`,
`PLACEABLE_DISTRICTS`, `GP_CLASSES`, `CITY_STATE_TYPES`, `WORSHIP_BUILDINGS`
are all positional wire contracts guarded only by comments. The `catalogs`
block plus a load-time assertion converts the family into a startup failure.

**R6 — the loader must reproduce incidental ordering** (unit array order, ids,
first-ring ownership). A "semantically correct" loader that reorders units
fails the gate for a non-engine reason. The stage-D deep-compare is what makes
this safe; do not skip it.

**R7 — `world/` becomes the engine.** Expected pressure points:
`terrainDefense`, `moveCostInto`, `tileYields` — all pure functions of a tile,
all *numbers the engine assigns*. They belong in `cpu/export/planes.ts`.

**R8 — 53 Python files reach the worlds through `FIXTURES`,** which
`gpu/core/engine.py` defines relative to itself. Expect a handful of poke lanes
to need re-anchoring after stage C; make `FIXTURES` a parameter in the same
stage.
