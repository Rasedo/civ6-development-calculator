# Civ 6 Development Calculator

A faithful reproduction of (base) Civilization VI's development game —
map generation, cities, districts, research, religion, diplomacy, war —
built twice: a TypeScript engine that is the readable oracle, and a
vectorized PyTorch twin that steps thousands of games in lockstep for
reinforcement learning. Every seat in a game is the same kind of actor
driven through one decision wire, and the two engines are compared turn
by turn, seat by seat, by a decision-server gate with fatal state
digests.

The end goal: the best champion — duel or FFA — trained by self-play on
an engine close enough to real Civ 6 (`docs/ROADMAP.md`).

## Running

```bash
npm install
npm test                 # TS engine unit tests (vitest)
npm run seed             # generate engine-free seeded worlds (seeder/worlds/)
npm run export           # compile worlds + rules through the TS engine (gpu fixtures)
npm run lint             # oxlint over cpu/seeder/tools/tests

python gpu/serve_gate.py --batched   # the two-engine parity gate
python gpu/battery.py                # the full pre-commit bar
```

Python needs only `torch` (parity runs float64 on CPU). On Windows,
pipe python output with `PYTHONUTF8=1`.

## What's modeled

The base-game development loop at parity across both engines: hex maps
with rivers/cliffs/natural wonders; cities with citizens, housing,
amenities, loyalty and per-city queues; districts with real adjacency,
buildings, wonders and projects; tile improvements, trade routes and
gold/faith purchases; tech and civic trees with eureka/inspiration
detection; governments, policies, governors, dedications and Ages;
religion (pantheons, beliefs, spread, theological combat); Great
People and Great Works; city-states with envoys, quests, suzerainty and
levies; barbarians; full inter-seat war — melee, ranged, sieges,
capture — with war weariness, grievances and the World Congress;
disasters; and victory conditions (science, culture, domination,
diplomatic). Deliberate simplifications and open gaps are tracked in
`docs/AUDIT.md`, not in code comments.

## Code layout

```
world/    the map layer: hex math, mapgen, terrain/features/resources (engine-free)
seeder/   seeded world generation + the fixture staleness stamp
cpu/      the TypeScript engine: core rules, data tables, the serve/driver
          harness, and the exporter that compiles worlds+rules for the twin
gpu/      the torch engine (core/ mixins over one batched sim), the
          decision-server gate (serve_gate.py) and the battery
policy/   the one decision policy driving every seat (drive.py, ladder.py)
shared/   statecompare.manifest.json — the declarative digest-field manifest
tests/    vitest suites (tests/cpu) and gpu poke self-tests (tests/gpu)
tools/    codemod harness, perf drivers, gpu inspection tools
```

## Docs

- `docs/AUDIT.md` — the live fidelity ledger (the only gap list).
- `docs/GPU_ENGINE.md` — the twin engine: seat model, storage geometry,
  the gate, the battery, hunting.
- `docs/ROADMAP.md` — direction: engine completion order, the RL
  self-play program and its banked decisions, perf.

Historical plans, round logs and design notes are deleted; recover them
from git history if ever needed.
