# The GPU engine and its gate

A vectorized PyTorch twin of the TypeScript engine: B games step in
lockstep as tensor operations. The TS engine (`cpu/`) is the oracle;
the torch engine (`gpu/`) exists for self-play-scale RL. Nothing the
twin computes is trusted without proof — the decision-server gate
compares the two engines turn by turn on every seat's state.

## The seat model

Every actor is a seat in one absolute id space (`cpu/core/seats.ts`,
mirrored in `gpu/core/simbase.py`): seat 0 and the civ seats (civ index
r = seat r+1) are the same kind of actor ("major"), city-states are
seats 100+, barbarians seat 200, `NO_SEAT = -1`. Seat capabilities come
from `SEAT_CAPS` keyed by class; the unit pools carry the same letters
("p" seat 0, "v" civ seats, "u" barbarian) and those letters are also
the attack paths' `atk_kind` tags.

## Storage geometry

One base tensor per fact, seat-indexed; every legacy name is a view:

- `civ_*  [B, 1+R]` — per-seat scalars (treasury, techs, faith, gpp,
  cap_tile, …). Bare names are row 0, `civ_only_*` names are rows 1+.
- `city_*  [B, 1+R+S, RC]` — the city block. Row 0 with the `:C` view
  is seat 0, `civ_city_*` views are the civ rows, city-states sit in
  the minor section (`citystate_*` views).
- `unit_*` — one merged unit pool; `p_/v_/u_` are range views,
  `unit_seat` holds the owner.
- Tile planes: `tile_seat` + `tile_city` (owner seat + city id — TS's
  `ownerSeat`/`ownerCity` pair), `centre_slot_at` (owning seat's city
  slot at a centre). `owner`, `civ_at`, `citystate_at`, `center_at`,
  `civ_city_at` are cached DERIVED properties keyed on
  `_tile_owner_ver` — never write them; write the stored planes and
  bump the version.
- Relations: `war/ww/ww_turns` over the compact seat-row space,
  `civ_pair_*` civ↔civ matrices, `seat_citystate_*` (seat, city-state)
  pairs.

`_MUTABLE` in `simbase.py` registers BASES only; `snapshot()`/`restore()`
round-trip them and `restore()` copies in place so views never dangle.
The static AST lane `tests/gpu/inplace_discipline_test.py` enforces the
whole contract (no self-referential rebinds, no setattr rebinds,
allocators in `__init__` only).

## The gate — the wire IS the parity instrument

`python gpu/serve_gate.py --batched` runs ONE B-game torch sim against
that many parallel TS children (`cpu/driver/serve.ts` under
`CIV6_SERVE`), with a per-turn barrier. Per (turn, seat):

1. **Obs equality** — both engines render the seat's observation; the
   raw context block must be EXACT (mismatches are field-named via the
   ladder layout).
2. **Decisions once** — `policy/drive.py::_decide_turn` computes every
   seat's decisions from the GPU masks; the resulting record
   (`SeatActionRecord` in `cpu/core/types.ts`) IS the wire format,
   fanned to both engines, each of which re-validates and executes at
   its own rule positions.
3. **State digests** — both engines hash the field groups declared in
   `shared/statecompare.manifest.json` (one extractor per name per
   engine; a name without an extractor is a hard error). Any digest
   mismatch is fatal that turn.

Integer state must match exactly; float accumulators may differ by
≤2 milli-units (IEEE addition is not associative; real bugs drift and
still fail). The world's RNG is the TS `mulberry32` mirrored draw for
draw; JS rounding is half-up (`floor(x+0.5)`), and JS-computed tables
(damage exp curve) ship in the rules export rather than being
recomputed in libm.

## The battery

`python gpu/battery.py` is the pre-commit bar: the serial
seed → export → build stage, then two concurrent lanes — vitest + the
serve gate, and the gpu poke self-tests (`tests/gpu/*_test.py`). Never
run two batteries at once (they share checkpoint dirs), never chain a
green standalone gate then the battery on the same state, and never
edit sources while one is in flight.

## Hunting

- **Checkpoints** — `serve_gate.py --ckpt-every K --ckpt-dir D` dumps
  paired state (torch snapshot + TS serialized state) as it runs;
  `--resume T` restarts both engines from a checkpoint. A checkpoint at
  turn T holds post-endTurn state (`state.turn == sim.turn == T+1`).
  Diagnosis starts from checkpoints, never from full logged reruns:
  the gate names the failing turn → resume from the nearest earlier
  checkpoint with probes (seconds), binary-search only when no turn is
  known.
- **Resume-check limits** — a resume can VERIFY only fixes that leave
  the decision stream unchanged (pure-read/state-init bugs). A
  behaviour-changing fix makes recorded decisions stale and the resumed
  pair explodes into phantom divergences: full fresh gate only. BLAS
  association is batch-shape-dependent, so resume checks run at the
  original batch shape, and the pre-commit bar stays the full battery.
- **Probes** are pure reads and replay the exact trajectory — no
  false-green caveat. Tag probe output by game id (`state.map.seed`),
  gate tensor prints on the acting mask, never trust a truncated
  window.
- **Forced compaction** — `CIV6_RECLAIM_AT` (unit pool) and
  `CIV6_RC_RECLAIM_AT` (civ city slots) force slot reclaim low; run the
  gate under them to stress slot-layout invariants.
- **Reachability** — a green gate proves the two engines agree, never
  that a mechanic fired. When landing a mechanic, measure which lane
  can REACH it and record that in its AUDIT entry.

## Running

```bash
npm run seed && npm run export          # engine-free worlds, then compiled planes
python gpu/serve_gate.py --batched      # the gate (add --turns / --ckpt-every / --resume)
python gpu/battery.py                   # the full pre-commit bar
python tests/gpu/<name>_test.py         # a poke lane standalone
```

Parity runs float64 on CPU; training will use float32 (f32-vs-f64
end-to-end equality is NEVER asserted — accumulators differ from turn
1; assert constructs, e.g. tie-break key dtypes). `PYTHONUTF8=1` /
`PYTHONIOENCODING=utf-8` on piped Windows runs.

## Pointers

`docs/AUDIT.md` — the live fidelity ledger (symbol-anchored; the only
gap list). `docs/ROADMAP.md` — direction, the RL/self-play program and
its banked decisions, perf. Deleted plan/round documents are in git
history.
