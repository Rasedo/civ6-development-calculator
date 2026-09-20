---
name: port-mechanic
description: Promote a Civ6 mechanic from the TypeScript engine into the GPU engine (or add a new mechanic to both) with turn-exact parity. Use with /gate-stage for any new game mechanic.
---

# Porting a Civ6 mechanic — the promotion craft

/gate-stage says HOW stages land; this skill says WHAT a mechanic port
consists of. TS (`cpu/core`) is the spec — port what it DOES, not what
Civ6's manual says; where TS is wrong against a REAL Civ 6 source (the
owner's install first, the live game second), fix TS first in its own
gate-stage.

## Read the spec in this order

1. **The rule function** (`rules.ts`, `city.ts`, `combat.ts`…): inputs,
   gates, tie-breaks, EXACT iteration order (JS `sort` is stable; object
   iteration follows insertion; `Array.prototype.some` short-circuits —
   all of these are behavior).
2. **Every consumer** (`grep -rn` the function and the fields it writes):
   a mechanic is its rule PLUS everything that reads its state. Miss a
   consumer and the gate finds it later at 3× the cost — and when two
   readers ask the same plane different questions, diff the READERS
   against each other.
3. **The RNG footprint**: which draws, under which conditions, in which
   phase order. Draws are the parity contract's sharpest edge.
4. **Phase position**: where inside `endTurn` it runs; same-turn
   visibility (does a thing built this turn count this turn?) has caused
   real divergences. A GPU phase that ticks every record's clock ONCE at
   the end forks from a TS loop that ticks each record after its own step.

## The promotion checklist (per mechanic)

- **State**: TS fields on the right object (City/Seat/Tile) + GPU
  tensors sized [B, …] with pad conventions (−1 empty, slot pools
  append-only) + registration in `_MUTABLE` (snapshot/restore).
- **Save migration**: `deserialize` (`cpu/core/game.ts`) fills new fields
  IN-PLACE with `??=` only — rebuilding objects reorders JSON keys and
  breaks replay determinism (it happened).
- **Exporter**: new static planes/catalogs only if no existing plane
  covers it (check first). Planes are TERRAIN-STATIC; unlock gating stays
  live per owner. Compute planes by CALLING the TS rule
  (`validImprovementsIn` with null unlocks), never by re-deriving it. Read
  wire fields hard (`r["k"]`) at the level the exporter actually writes
  them: a `.get(key, default)` at the wrong level defaults silently for
  every game.
- **The digest is the gate's eye on it**: every new accumulator or counter
  that can drift gets a field in its group of
  `shared/statecompare.manifest.json` plus an extractor on BOTH sides
  (`cpu/core/statecompare.ts`, `gpu/core/statecompare.py`) — integers
  `exact`, floats `milli`. A mechanic the digest cannot see is not
  gate-checked at all.
- **Seat symmetry**: no rule is seat-0-scoped — seat 0 and the civ seats
  are the same kind of actor, city-states are seats 100+, barbarians 200.
  Parameterize a rule over `{unlocks, ownsTile}` (the `*In` extraction
  pattern) and address state BY SEAT ROW instead of duplicating it. A walk
  over `state.seats` and a walk over every city row are different row sets
  — the FREE CITIES row is the one that separates them.
- **Float discipline**: mirror the TS ASSOCIATION token-for-token
  (`a += b + c` groups right), keep non-dyadic products identical
  single ops, and use `js_round` for `Math.round` (half-up ≠ torch's
  half-even). Sequential per-entity loops in TS = sequential or
  provably-dyadic reductions in torch.
- **Ordering**: slot/spawn order IS the spec (units act in array order;
  cities process in slot order; ties break lowest-index). Every argmin/
  argmax needs an explicit index tie-break term. A TS `Object.entries`
  walk and the GPU's nested index loop agree until two records touch one
  CAPPED quantity in the same pass.

## Prove it

- Behavior-preserving prep (extractions) → byte-identical fixtures.
- New inert state → unchanged fixtures and digests, plus a poke test if no
  organic path exercises it (`buy_wire_test` / `occupancy_test` pattern),
  wired into `gpu/battery.py`.
- Behavior change → re-seed, re-export, the full battery, and a
  **canary**: name the observable that MUST diverge if the mechanic
  breaks (e.g. "builder charges 3→4 diverges the global improvements
  count at the 4th build") — if you can't name one, the gate can't see
  the mechanic. Then record which lane REACHES it: a green gate over an
  unreached mechanic proves nothing.
- Reuse before writing: the flip/transfer, placement scans, blocking
  probes, auto-pick, damage rolls are all shared machinery — a port
  that duplicates one of them will drift from it later. A reader of
  another rule's OUTPUT must call that rule's composer, one per engine.
