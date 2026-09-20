# The GPU engine and its gate

A vectorized PyTorch twin of the TypeScript engine: B games step in
lockstep as tensor operations. The TS engine (`cpu/`) is the oracle;
the torch engine (`gpu/`) is what self-play will eventually run on.
Nothing the twin computes is trusted without proof — the decision-server
gate compares the two engines turn by turn on every seat's state.

## The seat model

Every actor is a seat in one absolute id space (`cpu/core/seats.ts`,
mirrored in `gpu/core/simbase.py`): seat 0 and the civ seats (civ index
r = seat r+1) are the same kind of actor ("major"), city-states are
seats 100+ (`seatOfCityState`), barbarians seat 200 (`BARB_SEAT`),
`NO_SEAT = -1`. Seat capabilities come from `SEAT_CAPS` keyed by class.
The unit POOL ranges and the attack paths' `atk_kind` tags share one
vocabulary: "major" (every major seat) and "barb" — the range views are
`major_unit_*` / `barb_unit_*`.

## Storage geometry

ONE base tensor per fact, seat-indexed, and ONE NAME for it. There are no
family views (`civ_only_*`, `civ_city_*`, bare row-0 names): every reader
addresses the base BY ROW, because a second name for a row is a second way
to write a body that serves one seat.

`sim.n_majors` is the major roster width — seat ids 0..n_majors-1, one row
each, no padding. An OPPONENT count, where one is meant (the war head's
columns, the observation's per-opponent block), is `n_majors - 1` written
at the site that means it. There is no `R`.

- `civ_*  [B, n_majors]` — per-seat scalars (treasury, techs, faith, gpp,
  cap_tile, …), addressed `civ_x[:, row]`.
- `city_*  [B, n_majors+S, RC]` — the city block. Majors occupy rows
  0..n_majors-1 at full RC width; a city-state's one city is slot 0 of its
  own row in the minor section (`_CITY_MINOR0 + s`).
- `unit_*` — one merged unit pool; `major_unit_*` / `barb_unit_*` are
  range views over `POOL_LO`/`POOL_HI` and `unit_seat` holds the owner. A
  seat's units are found by SEAT, never by a window of its own;
  `_seat_slot_map(row)` maps a seat's head rows (what every mask, obs and
  applier indexes) onto the merged slots behind them.
- Tile planes: `tile_seat` + `tile_city` (owner seat + city id — TS's
  `ownerSeat`/`ownerCity` pair), `centre_slot_at` (owning seat's city
  slot at a centre), `city_slot_at(row)` (that row's owning city slot).
  `citystate_at` is a cached DERIVED property keyed on `_tile_owner_ver` —
  never write it; write `tile_seat` and bump the version. Ownership is
  `tile_seat == row`, always.
- Relations: `war/ww/ww_turns` and `seat_warkind`/`seat_denounced` over the
  compact seat-row space, `seat_citystate_*` (seat, city-state) pairs. Every
  diplomatic AGREEMENT is a per-pair COUNTDOWN in the same space:
  `seat_friend_turns` and `seat_ally_turns` are symmetric,
  `seat_borders_turns` is DIRECTED (row grants column), and a denouncement
  needs no plane of its own — its turn stamp IS its clock.

`register_alias` covers the two geometries a row index cannot reach: the
city-state's city at `[:, _CITY_MINOR0+s, 0]`, and the `major_unit_*` /
`barb_unit_*` range views, registered once per unit plane. An alias is a
VIEW, so every write to it must be in place; `_check_state_discipline`
re-checks each one's `data_ptr`, shape and dtype every step under
`CIV6_ALIAS_CHECK=1` (off by default for wall-clock; the battery runs one
lane with it on).

`_MUTABLE` in `simbase.py` registers BASES only; `snapshot()`/`restore()`
round-trip them and `restore()` copies in place so views never dangle.
The static AST lane `tests/gpu/inplace_discipline_test.py` enforces the
whole contract (no self-referential rebinds, no setattr rebinds,
allocators in `__init__` only).

## The gate — the wire IS the parity instrument

`gpu/serve_gate.py --batched` runs ONE B-game torch sim against that many
parallel TS children (`cpu/driver/serve.ts` under `CIV6_SERVE`), with a
per-turn barrier. It is never launched by hand: `gpu/battery.py` is the
only entry, so a green can never be read off a run that skipped the
export. Per (turn, seat):

1. **Obs equality** — both engines render the seat's observation; the
   raw context block must be EXACT (mismatches are field-named via the
   ladder layout).
2. **Decisions once** — `policy/drive.py::_decide_turn` computes every
   seat's decisions from the GPU masks; the resulting record
   (`SeatActionRecord` in `cpu/core/types.ts`) IS the wire format,
   fanned to both engines, each of which re-validates and executes at
   its own rule positions.
3. **State digests** — both engines hash the field groups declared in
   `shared/statecompare.manifest.json` (`game`, `seat`, `cityState`,
   `city`, `unit`, `tile`; one extractor per name per engine in
   `cpu/core/statecompare.ts` and `gpu/core/statecompare.py`, and a name
   without an extractor is a hard error). Any digest mismatch is fatal
   that turn. Integers fold into the group's `exact` digest, float
   accumulators into a separate `milli` digest quantised to
   thousandths, so a float disagreement is reported apart from an
   integer one. A field marked `gap` is a known storage asymmetry: both
   extractors exist, the census counts it, the default digest skips it.

A TS child that DIES rather than disagreeing is a different failure:
`read_msg` sees only a closed stdout, so the gate keeps each child's
stderr in a temp file (`CIV6_SERVE_ERRDIR=<dir>` to keep them) and
`_crash_text` reports the exit code and that tail. A crash with an empty
tail and no exit code of its own is the box refusing to spawn, not the
engines disagreeing.

Integer state must match exactly; float accumulators may differ by
≤2 milli-units (IEEE addition is not associative; real bugs drift and
still fail). The world's RNG is the TS `mulberry32` mirrored draw for
draw; JS rounding is half-up (`floor(x+0.5)`), and JS-computed tables
(damage exp curve) ship in the rules export rather than being
recomputed in libm.

## The battery

`python gpu/battery.py` is the bar. Stage 0 is serial because everything
below depends on it: five static checks at once (`tsc`, `parse`, `lint`,
ruff `f821`, `pyright`), then the ordered chain — the seeder-drift check
against the committed `seeder/worlds.lock`, `seed`, `export`, the
constant-provenance ratchet (`tools/civ6lab/xml_check.py` against
`docs/PROVENANCE.md`, SKIPPED on a box without the install) and the
reader census (`tools/gpu/rules_reader_census.py` against its committed
baseline). Then the lanes run concurrently: up to twelve serve shards
that split the fixture seeds (vitest rides the first shard's lane) and
the gpu poke self-tests through a bounded pool. Wall-clock is stage 0
plus the slowest lane.

- **Green is the record, not the exit code.** Every run appends to
  `stats/battery.jsonl` (head sha, per-step wall and status, memory,
  the commits under test). A run is green when that row says `pass`
  with the full step count at the head sha you meant to test.
- **The cadence rule.** The battery refuses to run with fewer than five
  commits since the last green; the per-commit bar is the compile bar
  plus a single-seed smoke serve. A RED run never resets the clock.
  `CIV6_BATTERY_OWNER=1` is the owner's own override for a measurement
  run.
- **The slow tier.** Poke lanes that have never caught anything and cost
  real pool time are DEMOTED, not deleted: `--full` runs them, and the
  lane-drift check still sees every one, so a trimmed run cannot be
  mistaken for a complete one. Run `--full` at a round boundary and
  whenever a round changed one of those surfaces.
- **Memory.** The box is the owner's: the battery never refuses for
  memory, it narrows (fewer lanes, longer run), and it sizes the next
  run from what the last ones measured. `--low-memory` or
  `CIV6_BATTERY_MEM_MB=<free MB>` forces the narrow plan.
- One battery at a time (they share checkpoint dirs and the box), never
  edit sources while one is in flight, and a run meant to MEASURE is
  asked for and labelled clean or contended.
- `--no-bail` keeps every lane running past a failure.

## Hunting

- **Hunt mode.** A hunt is a probe of ONE seed, never a re-run of the
  fleet. `python gpu/battery.py --seeds <seed> --ckpt-every 20` lays
  checkpoints; `python gpu/battery.py --seeds <seed> --resume <turn>
  --ckpt-every 20` then costs O(1) turns per probe. The hunt takes one
  serve shard and no poke pool, records nothing, claims no green and
  does not spend the cadence clock. Checkpoints land in
  `.claude/scratchpad/hunt/<seeds>` unless `--ckpt-dir` says otherwise;
  one directory holds ONE seed's state, because the GPU snapshot does
  not name its seed.
- **What a checkpoint is.** The gate's `--ckpt-every K` dumps paired
  state (a torch snapshot plus each child's serialized TS state) and
  `--resume T` restarts both engines from it; the resume asserts the
  checkpoint's seeds against the fixtures, so a stale directory fails
  loudly. Diagnosis starts from checkpoints, never from a full logged
  rerun: the gate names the failing turn → resume from the nearest
  earlier checkpoint with probes (seconds).
- **Resume-check limits** — a resume can VERIFY only fixes that leave
  the decision stream unchanged (pure-read/state-init bugs). A
  behaviour-changing fix makes recorded decisions stale and the resumed
  pair explodes into phantom divergences: a full fresh run only. BLAS
  association is batch-shape-dependent, so resume checks run at the
  original batch shape, and the bar stays the full battery.
- **Probes** are pure reads and replay the exact trajectory — no
  false-green caveat. Tag probe output by game id, gate tensor prints on
  the acting mask, never trust a truncated window, and remember that
  empty probe output is not absence.
- **The decomposition log** — `CIV6_DIFFLOG=1` arms the keyed per-city
  decomposition on both sides (the GPU's `sim._log_diff`; the TS child
  inherits the variable), printed paired and trimmed to the
  disagreements on a red. Every KIND reports, agreeing or not: a kind
  silent because it never fired and one silent because it agreed are
  different facts. `CIV6_DIFFLOG_ALL=1` prints every key from both sides
  — what a row DID on the turns around the divergent one is the next
  question, and the filter throws exactly those lines away.
  `CIV6_DIFFLOG_B=<row>` arms it for one game of the batch;
  `CIV6_DIFF_CAP` (default 12) caps a group's by-name dump.
- **The combat-roll log** — `CIV6_CBLOG_B=<batch row>` arms the GPU's
  keyed roll log (`_damage_roll`), `CIV6_CBLOG=1` arms the TS twin
  (`damageRoll` via `__cbLog`); on a digest red the gate prints both
  tails side by side (`CB-GPU` / `CB-TS`). Rolls pair by the rng counter
  `c` (absolute stream position), so one mismatched `diff` names the
  divergent strength term directly and an inserted or missing roll shows
  as a counter slip — no bisect.
- **Forced compaction** — `CIV6_RECLAIM_AT` (absolute unit-slot trigger,
  both ranges) forces unit-slot reclaim low; run under it to stress
  slot-layout invariants. Without the override each unit range fires at
  its OWN cap minus `CIV6_RECLAIM_HEADROOM` (default 24), so one knob
  serves the major and barbarian ranges whatever their sizes. CITY slots
  need no knob: they compact whenever any major row holds a hole.
  `CIV6_RC_REGISTRY_CHECK` machine-checks the city registry per step.
- **Reachability** — a green gate proves the two engines agree, never
  that a mechanic fired, and a run proves only the REGIME it reached
  (30 turns and 250 turns are different worlds). When landing a
  mechanic, measure which lane can REACH it and record that in its
  AUDIT entry.

- **Reading a red — a POKE lane.** The recurring shapes, each of
  which reads exactly like an engine red until checked:
  - **The auto-decision premise.** The engines are decision-free: a buy, a
    strike, a queue pick or a spread is an ORDER the applier re-validates, never
    something `_seat_phase` chooses. A lane that steps and waits is waiting for
    nothing — stash the intent (`apply_seat_actions`, the order helpers in
    `tests/gpu/warmup.py`) and assert the validation.
  - **The registry confound.** Districts are read off the city REGISTRY
    (`city_dist_tile`), never the tile plane; a scene must write both, as a real
    completion does.
  - **The stale index space.** Appliers take the ROW and RANKED orders over
    `_seat_slot_map`; a test speaking a raw pool-slot convention lands its
    orders on the wrong seat or unit and no-ops.
  - **The wrong resolver.** `_hostile_ranged_strike` scopes out major-vs-major
    by design; that pairing is `_ranged_attack`'s.
  - **A stale cache under a poke.** Writes that the engine always pairs with
    `_eff_version += 1` must be paired in a poke too, or the mask serves the
    pre-poke world.
  - **A seated scene.** The fixture's civilizations are a DRAW: a scene that
    assumes a trait must SEAT that civilization itself.

- **A TS-suite red, same triage.** The battery tail only ever shows the last
  failing file; run vitest directly for the full list. The TS-specific shapes:
  - **Founding under `unitsMode` needs a settler on the tile** — `settleAt`
    (tests/cpu/helpers.ts) is the scene helper.
  - **The actor loop skips a CITYLESS seat** (`seatPhase`) — influence, favor,
    upkeep/bankruptcy and quest issuance all live inside it.
  - **Rules that live IN the seat phase**: city strikes (`cstk`/`estk`), city
    healing, influence-to-envoy conversion.
  - **The scripted adoption** (`computeAdoption`): modifiers read the adoption,
    a pure function of civics — `setPolicy`/`setGovernment` write a store
    nothing reads in a driven game.
  - **One seat model**: `isCiv(0)` is true; a fake seat `{ id, atWar }` builds a
    scene the war axis cannot see; a CityState without
    `emptySeat(seatOfCityState(id))` has no seat id.
  - **Meeting is by EXPLORATION** — in a fogless world every seat meets every
    city-state at the phase top; "unmet" scenes need fog live.

## World presets and driver styles

Both are coverage levers over the SAME engines and the same gate.

- **World presets** (`seeder/presets.ts`): named knob sets over the
  seeder — map size, layout (`continents` / `pangaea` / `islands`),
  civ and city-state counts, land fraction, resource quota and
  category weights. `npm run seed -- --preset <name>` and
  `npm run export -- --preset <name>` write a preset's fixtures to
  `seeder/worlds/presets/<name>/` with its OWN `worlds.lock`; the
  baseline keeps today's paths, and the battery's globs never see a
  preset. `CIV6_WORLDS_DIR=<dir>` points the whole python side (fixture
  loads, the gate, the TS children it spawns, the probes) at a family.
  One batch is ONE preset — `sim_init` asserts shape uniformity — and
  the observation width moves with civCount/cityStateMax. Preset seed
  families are disjoint (firstSeed + 13k). Re-baseline protocol: any
  `.ts` change under `world/` or `seeder/` moves every genStamp —
  re-seed and re-export the baseline AND every preset family you intend
  to keep, in the same commit.
- **Driver styles** (`policy/ladder.py::STYLE_PRESETS`): named per-seat
  decision profiles (deep/diplo pins, war and peace appetite, city cap,
  district preference, production tier order). `--styles a,b,c` on
  `gpu/serve_gate.py` and `tools/gpu/reachability_probe.py` assigns them
  per seat (cycled); omitted, every knob multiplies by 1.0 and the drive
  is byte-identical to the unstyled driver (only the CARD style is drawn
  per seed and seat). The battery runs unstyled. Styles change DECISIONS
  only — the applier validates and TS replays, so the gate stays the
  judge, which makes them a hunting tool rather than a second bar.

## Running

```bash
npm run seed && npm run export          # engine-free worlds, then compiled planes
python gpu/battery.py                   # the bar (add --full / --no-bail / --low-memory)
python gpu/battery.py --seeds 9014 --ckpt-every 20   # hunt mode: one seed, no verdict
python tests/gpu/<name>_test.py         # a poke lane standalone
```

Parity runs float64 on CPU; training will use float32 (f32-vs-f64
end-to-end equality is NEVER asserted — accumulators differ from turn
1; assert constructs, e.g. tie-break key dtypes). `PYTHONUTF8=1` /
`PYTHONIOENCODING=utf-8` on piped Windows runs.

## Pointers

`docs/AUDIT.md` — the live fidelity ledger (symbol-anchored; the only
gap list) and the owner's question ledger. `docs/ROADMAP.md` —
direction, the RL/self-play program and its banked decisions, perf.
`docs/PROVENANCE.md` — every tagged constant against the install.
`docs/ROSTER.md` — the roster census. `tools/civ6lab/README.md` — the
live game as an oracle, when neither XML nor code answers. Deleted plan
and round documents are in git history.
