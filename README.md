# Civ 6 Development Calculator

A faithful reproduction of Civilization VI — Gathering Storm (base +
Rise and Fall + Gathering Storm) — and its development game: map
generation, cities, districts, research, religion, diplomacy, war.
Built twice: a TypeScript engine that is the readable oracle, and a
vectorized PyTorch twin that steps many games in lockstep. Every seat in
a game is the same kind of actor driven through one decision wire, and
the two engines are compared turn by turn, seat by seat, by a
decision-server gate with fatal state digests.

Current phase: **engine fidelity** — the open gaps in `docs/AUDIT.md`,
burnt down against the owner's install and the live game. The end goal
past that is the best champion — duel or FFA — trained by self-play on
an engine close enough to real Civ 6 (`docs/ROADMAP.md`).

## Running

```bash
npm install
npm test                 # TS engine unit tests (vitest)
npm run seed             # generate engine-free seeded worlds (seeder/worlds/)
npm run export           # compile worlds + rules through the TS engine (the fixtures)
npm run lint             # oxlint over cpu/seeder/tools/tests (the battery also lints world/)

python gpu/battery.py    # the verification bar: static gates, seed+export, the
                         # parity gate over every fixture seed, the poke lanes
```

`gpu/serve_gate.py` is the parity gate, and it is never run on its own:
the battery is the only entry, so a green can never be read off a run
that skipped the export. To ask about ONE seed, use the battery's hunt
mode (`docs/GPU_ENGINE.md` §Hunting).

Python needs only `torch` (parity runs float64 on CPU). On Windows,
pipe python output with `PYTHONUTF8=1`.

## What's modeled

The Gathering Storm development loop at parity across both engines: hex
maps with rivers/cliffs/natural wonders; cities with citizens, housing,
amenities, loyalty and per-city queues; districts with real adjacency,
buildings, wonders and projects; tile improvements, trade routes and
gold/faith purchases; tech and civic trees with eureka/inspiration
detection; governments, policies, governors, dedications and Ages;
religion (pantheons, beliefs, spread, theological combat); Great
People and Great Works; city-states with envoys, quests, suzerainty and
levies; barbarians; spies; full inter-seat war — melee, ranged, air,
sieges, capture — with war weariness, grievances, the World Congress and
nuclear weapons; climate, disasters and power; civilization uniques; and
victory conditions (science, culture, domination, diplomatic, religious).
Deliberate simplifications and open gaps are tracked in `docs/AUDIT.md`,
not in code comments.

## Code layout

```
world/    the map layer: hex math, mapgen, terrain/features/resources (engine-free)
seeder/   seeded world generation, the presets, and the fixture staleness stamp
cpu/      the TypeScript engine: core rules, data tables, the serve/driver
          harness, and the exporter that compiles worlds+rules for the twin
gpu/      the torch engine (core/ mixins over one batched sim), the
          decision-server gate (serve_gate.py) and the battery (battery.py)
policy/   the one scripted decision policy driving every seat (drive.py, ladder.py)
shared/   statecompare.manifest.json — the declarative digest-field manifest
tests/    vitest suites (tests/cpu) and gpu poke self-tests (tests/gpu)
tools/    civ6lab/ (the live game as an oracle, over FireTuner), the XML and
          provenance checkers, the reader census, the codemod harness, the
          perf and inspection drivers
stats/    battery.jsonl — every recorded run, which the battery sizes itself from
```

## Docs

- `docs/AUDIT.md` — the live fidelity ledger (the only gap list), with
  the owner's question ledger.
- `docs/GPU_ENGINE.md` — the twin engine: seat model, storage geometry,
  the gate, the battery, hunting.
- `docs/ROADMAP.md` — direction: the current phase, the engine-neutral
  decision server next, the RL program's banked decisions.
- `docs/PROVENANCE.md` — the constant-provenance baseline: every tagged
  constant against the install, re-checked in the battery's stage 0.
- `docs/ROSTER.md` — the roster census: which trait modifiers ship,
  against `docs/roster_ledger.json`.
- `tools/civ6lab/README.md` — the live-game lab (FireTuner) and what it
  has measured; `tools/civ6lab/SESSION2.md` is the next scene list.

Historical plans, round logs and design notes are deleted; recover them
from git history if ever needed.
