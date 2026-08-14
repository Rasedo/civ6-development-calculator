---
name: port-mechanic
description: Promote a Civ6 mechanic from the TypeScript engine into the GPU engine (or add a new mechanic to both) with turn-exact parity — the B-arc craft. Use with /gate-stage for any new game mechanic.
---

# Porting a Civ6 mechanic — the promotion craft

/gate-stage says HOW stages land; this skill says WHAT a mechanic port
consists of. TS (`src/core`) is the spec — port what it DOES, not what
Civ6's manual says; where TS is wrong vs its own rules, fix TS first in
its own gate-stage.

## Read the spec in this order

1. **The rule function** (`rules.ts`, `city.ts`, `combat.ts`…): inputs,
   gates, tie-breaks, EXACT iteration order (JS `sort` is stable; object
   iteration follows insertion; `Array.prototype.some` short-circuits —
   all of these are behavior).
2. **Every consumer** (`grep -rn` the function and the fields it writes):
   a mechanic is its rule PLUS everything that reads its state. Miss a
   consumer and the gates find it later at 3× the cost.
3. **The RNG footprint**: which draws, under which conditions, in which
   phase order. Draws are the parity contract's sharpest edge.
4. **Phase position**: where inside `endTurn` it runs; same-turn
   visibility (does a thing built this turn count this turn?) has caused
   real divergences (the unlock-snapshot and mid-phase-adjacency cases).

## The promotion checklist (per mechanic)

- **State**: TS fields on the right object (City/Seat/Tile) + GPU
  tensors sized [B, …] with pad conventions (−1 empty, slot pools
  append-only) + registration in `_MUTABLE` (snapshot/restore).
- **Save migration**: `deserialize` fills new fields IN-PLACE with `??=`
  only — rebuilding objects reorders JSON keys and breaks replay
  determinism (it happened).
- **Exporter**: new static planes/catalogs only if no existing plane
  covers it (check first: farm/mine/lumber masks, wh, riv, du, fadj, fy
  all exist). Planes are TERRAIN-STATIC; unlock gating stays live per
  owner. Compute planes by CALLING the TS rule (`validImprovementsIn`
  with null unlocks), never by re-deriving it.
- **Trace column(s)**: every new accumulator/counter that can drift gets
  a column in `gpu-trace.ts` + `trace_row` + `parity_test.py`'s
  names/tolerances (ints 0.0, floats 2.0 milli) — the mechanic is
  gate-checked from its FIRST turn or it isn't checked at all. Remember
  the trace prices queue items by kind (a new kind needs its cost read).
- **Owner scoping**: decide per consumer whether the mechanic is
  seat-0-scoped or global. The leak list from B4: CS quests, eurekas,
  luxury amenities are seat-0-only (`owner >= 0` / `cityId !== -1`);
  district adjacency and paving are global. When civ seats gain a mechanic,
  parameterize the rule over `{unlocks, ownsTile}` (the `*In`
  extraction pattern) instead of duplicating it.
- **Float discipline**: mirror the TS ASSOCIATION token-for-token
  (`a += b + c` groups right), keep non-dyadic products identical
  single ops, and use `js_round` for `Math.round` (half-up ≠ torch's
  half-even). Sequential per-entity loops in TS = sequential or
  provably-dyadic reductions in torch.
- **Ordering**: slot/spawn order IS the spec (units act in array order;
  cities process in slot order; ties break lowest-index). Every argmin/
  argmax needs an explicit index tie-break term.

## Prove it

- Behavior-preserving prep (extractions) → byte-identical fixture hash.
- New inert state → unchanged hash + a poke test if no organic path
  exercises it (`buy_wire_test`/`occupancy_test` pattern), wired into
  the battery.
- Behavior change → regenerate fixtures, both gates, fresh baselines in
  docs/ROADMAP.md §Training log, and a **canary**: name the observable that MUST diverge
  if the mechanic breaks (e.g. "builder charges 3→4 diverges the global
  improvements count at the 4th build") — if you can't name one, the
  gates can't see the mechanic.
- Reuse before writing: the flip/transfer, placement scans, blocking
  probes, auto-pick, damage rolls are all shared machinery — a port
  that duplicates one of them will drift from it later.
