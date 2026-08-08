# STATE COMPARE — the replacement for `gpu-trace.ts`

Two survey agents (2026-08-08) audited how the two engines are compared today
and what should replace it. This is their finding and the staged plan. It is
the implementation brief; read it before touching `serve_gate.py`.

## What the comparison is today

`cpu/driver/trace.ts` builds a 506-wide float row out of ~80 hand-written
column definitions (`HEAD_COLS`, per-city-state, per-rival, per-city blocks).
`gpu/core/engine.py` carries a hand-maintained Python twin (`_TRACE_*`). Each
turn `gpu/serve_gate.py` compares the two rows.

### The four defects

1. **THE TOLERANCE IS FLAT AND WRONG.** `serve_gate.py` compares every column
   with `abs(g - t) > 1.0`. Every integer off-by-one therefore PASSES:
   `nCities` ±1, `nTechs` ±1, `gameOver` 0-vs-1, `victoryType` 1-vs-2, and —
   worst — `rng` ±1, the column whose entire purpose is to catch a diverged
   draw count. A per-column `tol` field EXISTS on every column definition in
   `gpu-trace.ts`, is computed, and is shipped into `rules.json`. Nothing has
   read it since `parity_test.py` was deleted.

2. **WIDTH MISMATCH IS SILENT.** If the two rows differ in length the compare
   truncates to the shorter one. Adding a column on one engine and forgetting
   the other removes coverage without failing anything.

3. **THE TWIN IS HAND-MAINTAINED.** Every new mechanic needs the same column
   written twice, in two languages, in the same order. The order is positional
   and implicit; nothing asserts the two orders agree.

4. **IT IS A SAMPLE, NOT A STATEMENT.** 506 floats over a state with tens of
   thousands of fields. Coverage is whatever somebody remembered to add, and
   the AUDIT has repeatedly found divergences in fields no column named.

## The replacement

### Principle

The observation renderer is already a **shared, per-seat, position-exact,
cross-engine-compared** projection of state, and the serve gate already
asserts it EXACTLY (`observeSeat` ↔ `BatchEnv.observe`/`_observe_rival`, sliced
by `policy/ladder.py:split()`). That machinery is the thing to extend. The
trace is a second, weaker, redundant projection with its own layout.

So: **one manifest, two consumers.**

### The manifest

A single declarative field manifest — field name, kind (scalar / per-seat /
per-city / per-unit), extractor on each engine, and an exact/tolerance rule.
Both engines read the SAME manifest file. The TS and Python sides each
implement extractors by name; a missing or extra name is a hard error, not a
truncation. This kills defects 2 and 3 outright.

### The two consumers

- **PER-TURN DIGEST** — the manifest folded into a small number of
  order-independent digests (one per group). Cheap enough to run every turn
  for every seat. A digest mismatch says WHICH GROUP diverged and on WHICH
  TURN, which is all the per-turn lane needs.
- **KEYED DUMP (on demand)** — when a digest mismatches, both engines dump the
  full keyed field set for that group at that turn and diff them BY NAME. This
  is what replaces reading a 506-float row: the error names the field.

### Anti-rot

A **census**: a test that walks the engine's real state surface (`_MUTABLE` on
the GPU side, the `GameState` type on the TS side) and asserts every field is
either covered by the manifest or on an explicit, justified exclusion list.
Adding a tensor without covering it fails the census. This is the answer to
defect 4 — coverage becomes a property that is checked, not remembered.

### The deletion bar

`gpu-trace.ts` is deleted only when **fault injection** proves the replacement
strictly dominates it: perturb one field at a time on one engine, confirm the
new comparison catches every perturbation the trace caught, plus the classes
it never could (the integer off-by-ones above).

## Stages

| Stage | Content | Status |
|---|---|---|
| **S0** | Fix the gate that exists: read the per-column `tol` from `rules.json` instead of the flat `1.0`; assert the two rows are the SAME WIDTH; put the column NAME in every mismatch message. | **SHIPPED** — `serve_gate.py:trace_table`/`trace_diff` |
| **S1** | The manifest format + the census test. No comparison change yet. | **SHIPPED** — `shared/statecompare.manifest.json`; censuses in `tests/cpu/statecompare-census.test.ts` + `tests/gpu/statecompare_census_test.py` |
| **S2** | TS + Python extractors for the manifest; digest computation on both engines. | **SHIPPED** — `cpu/core/statecompare.ts` + `gpu/core/statecompare.py` |
| **S3** | Wire the digest into `serve_gate.py` alongside the trace (both run; disagreements are reported, not fatal). | **SHIPPED** — both gate paths; `CIV6_SERVE_DIGEST=0` stands the lane down |
| **S4** | The keyed dump + by-name diff on digest mismatch. | **SHIPPED** — the post-trace `{dump}/{go}` handshake; first mismatch dumps and diffs BY NAME, later ones are one-liners capped at five |
| **S5** | Fault injection; then delete `gpu-trace.ts`, its Python twin, and the trace compare. | **DONE** — owner override 2026-08-09: the trace is DELETED on both engines without the fault-injection run ("we will fix state compare as we go"); the digest is FATAL in the serve gate now, and the driver was deleted with the bar it enforced |

The per-turn digest is pure-Python folding on the GPU side; if it shows up in
gate wall-clock, vectorise the extractors before reaching for
`CIV6_SERVE_DIGEST=0` — the lane exists to run every turn.

Cross-language BIT-equality of the fold is deliberately not fixture-pinned:
the serve gate's digest lane proves it live over real state on every run. The
census tests pin each side's algebra (row-order independence, key and column
sensitivity, exact/milli separation) on shared vectors instead.
