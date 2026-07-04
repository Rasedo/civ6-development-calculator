# Phase 6 (improvements & builders) — WIP notes

Commit A (`19f51ce`, pushed) landed the **inert plumbing**: per-tile
`improvement`/`pillaged`/`p_charges` state, FARM food via `_eff_food`,
FARM housing in `_city_totals`, the `improvements` rules block, `fa_f`/
`fa_h` tile statics, all in `_MUTABLE`. Verified a no-op by the gate + a
self-test of the yield path. **FARM only** for this phase (ungated; MINE/
LUMBER_MILL/resource improvements/chops come later).

The builder-behaviour slice (train + move + build farms) was prototyped
and **reverted** to keep the tree green — it hit a deep barb divergence
(below). This note records what was built, the two real bugs fixed along
the way, and the exact remaining blocker so the next session resumes fast.

## What the builder slice needs (all mirrored exporter ↔ GPU)

1. **Scripted production, builder-first.** The capital trains settlers for
   the whole game, so a capital-only builder must be queued *before*
   settlers (else it never trains). Branch: `capital & pop>=2 &
   ~builder_trained` → BUILDER, before the settler branch. Needs a
   `builder_trained` [B] bool in `_MUTABLE`. Exporter: same reorder.
2. **`_spawn_player`** sets `p_charges[slot] = _p_charges[type]` (builder=3).
3. **`_scripted_builder()`** (runs on the `units is None` path, mirrors the
   exporter loop; draws no RNG):
   - If on a buildable unimproved FARM tile inside borders → set
     `improvement=FARM`, `p_charges-=1`, bump `_eff_version`, disband at 0.
   - Else single-step toward the nearest farm **job** (owned & `center_at<0`
     & `improvement<0` & farmable) — nearest by distance, ties to lowest
     tile index; then the passable, `_blocked_for(nb,"pciv")`-free neighbour
     closest to it, ties to direction order, move only if strictly closer.
     This is the barb-march primitive with target = nearest job.
   - Farmable = `farm_flat | (farm_hill & civics[:,hillFarmsCivic])`.
4. **Exporter** mirrors 1 and 3 (single-step via `walkPath(path=[n])`,
   `builderImprove(FARM)`), plus a trace column = count of improved tiles
   (`gpu-trace.ts` head + `rowTolerance` +0; `parity_test.py` HEAD "imp" +
   atol +0; engine `trace_row` `(improvement>=0).sum`).

## Two real bugs found & fixed (re-apply these)

1. **Resource tiles CAN be farmed.** `validImprovements` returns the
   *resource's* improvement for a resource tile, and rice/wheat use FARM
   (`RESOURCES[r].improvement === 'FARM'`). Commit A's `fa_f` wrongly
   excludes all resource tiles. Correct export:
   ```ts
   fa_f: !t.district && !t.wonder && !isImpassable(t) &&
     (t.resource
        ? RESOURCES[t.resource]?.improvement === 'FARM'   // ungated, NO terrain/water check
        : !isWater(t) && ((t.feature===null && (GRASS||PLAINS) && FLAT) || t.feature==='FLOODPLAINS'))
   fa_h: !t.resource && ... hill grass/plains no-feature      // civic-gated, non-resource only
   ```
   (The resource branch of `validImprovements` runs before the water/
   terrain checks and is ungated for FARM — so resource-FARM tiles are
   always `fa_f`, even on hills.)
2. **Housing hunk was omitted on re-apply.** `_city_totals` must add
   `imp_owned.sum(dim=2) * _farm_housing` (0.5/farm) over the work window
   (owned tiles with `improvement>=0`, NOT pillage-gated — `computeHousing`
   ignores pillaged, unlike yields). Without it the capital's housing is
   0.5 low per farm and `foodBox` drifts.

## Pillaging (correct, add it)

A barbarian that does not attack and stands on an owned, improved,
unpillaged tile pillages it (mirrors `hostileUnitAct`): set `pillaged`,
`_eff_version+=1`, `u_hp = min(unitHp, u_hp+25)`, and **exclude it from the
march that turn** (`march = act & ~attack & ~pillage`). Disasters also
`scorch` (→ pillaged) improvements in flood/volcano/storm areas — not yet
added; only needed once farms sit in disaster areas.

## The blocker (seed 9001, first mismatch `hp0` ~t32)

With the builder building farms, movement matches on seed 9170 (farms
[687,733] build turn-exact after the resource-farm fix). But seed 9001
diverges on capital HP. Traced to a **barbarian that marches differently**:
at true turn 27 a barb at tile 871 steps to **828 in the GPU** (dist 5 to
the capital 610 — correct, the unique nearest neighbour) but to **872 in
TS** (dist 6 — *away* from the only city). The GPU barb then reaches the
capital ~2 turns early, besieges it (no heal) and attacks → `hp0` drifts.

Ruled out: builder spawn placement (both spawn on the center then move —
matches), resource-farm validity (fixed), housing (fixed), rival-unit
position (rival is at 852 in **both**; nothing at 872), city count (both
have only the capital). TS moving a barb *away* from the sole city
contradicts the march "only if strictly closer" rule, so the barb is not
plain-marching — it points at **barb spawn / garrison / guard-selection or
attack-advance mechanics** whose ordering shifts under the builder-first
economy. This divergence also appeared with a *non-moving* builder (0
farms), so it is the economy-timing shift, not farms per se.

### Next steps
- Instrument the barb phase for seed 9001 t26–27: is 871 a camp/guard? did
  it attack-advance? was it a fresh garrison spawn? Compare the per-barb
  spawn/guard/march decision GPU vs TS (add `globalThis.__barbLog` in
  `combat.ts` barbarianPhase, mirror the GPU loop print).
- Consider training the builder from a **non-capital** city (less
  disruption to the capital's barb neighbourhood) if the economy-shift
  interaction proves intractable — but prefer fixing the underlying barb
  determinism, since it is a real latent divergence the shifted timing
  merely exposes (same species as the tdef / paved-center / resource-farm
  bugs the widened seed set has been surfacing).

## Session 2 progress (patch: `gpu/phase6-wip.patch`)

Re-applied the full builder slice and fixed **five** bugs; the divergence
moved t38 → t44 → t57 (steady progress, same species each time). All the
working code is in `gpu/phase6-wip.patch` (apply with `git apply
gpu/phase6-wip.patch` onto this commit). It is NOT committed live because
the gate is still red at seed 9053 t57. Fixes, in order found:

1. **Resource-farm validity** (export) — as above; re-applied.
2. **Housing hunk** in `_city_totals` — as above; re-applied.
3. **Barb march targets the nearest IMPROVEMENT first**, then the nearest
   city (`hostileUnitAct` step 3: raiders head for your farms to pillage).
   The GPU march only targeted cities. Fix: nearest unpillaged owned
   improvement within `dist < 13` (ties → lowest tile index), else nearest
   city. Backward-compatible (no farms → nearest city). **This fixed the
   seed-9001 `hp0` blocker from session 1.**
4. **IRRIGATION eureka** ("farm a resource") is now reachable. Export
   `improvement` boost rows for `id==='FARM'` (`{kind:'improvement', imp:0,
   count, onResource}`) and detect in `_detect_boosts`:
   `(improvement==FARM) & (onResource ? res_priority>0 : True)`, count ≥ n,
   NOT pillage-gated. (Only FARM is buildable, so only IRRIGATION.)
5. **City sack pillages the center's 6 neighbours** (`sackCity`). The GPU
   sack reduced pop/treasury/hp but didn't pillage. Fix: in
   `_hostile_city_attack`'s sack branch, for the 6 `neigh[center]` tiles set
   `pillaged` where `improvement>=0 & ~pillaged`, bump `_eff_version`.

Plus the barb **pillage branch** (session 1) is re-applied.

### Current blocker (seed 9053 t57, first mismatch = `rng`)
GPU makes **2 more draws than TS** in turn 57 = one extra barb combat.
Logged GPU combats at t57: `_hostile_vs_unit u9→tile523`,
`_hostile_city_attack u10→city1`, `_hostile_vs_unit u6→tile522`. One of
the two `_hostile_vs_unit` is extra vs TS — a barb attacks a unit the TS
barb does not (a barb-vs-unit adjacency/decision divergence under the
shifted positions; no barb is on a farm at t57, so it is not pillage-vs-
attack). NEXT: identify the unit at 522/523 (rival? the player builder/
warrior?) and why the GPU barb attacks where TS pillages/marches — likely
another position ripple, or a barb-vs-civilian (builder) attack the GPU
handles differently. Instrument `combat.ts` `hostileUnitAct`/`meleeAttack`
with a `globalThis.__barbLog` at t57 and diff against the GPU combat log.

The tail is all this species (barb behaviour under the farm economy). Each
fix so far pushed the wall ~6–13 turns later; a handful more likely
finishes it.

**Finding (t57):** tile 523 holds a RIVAL unit (slot 6), 522 a barb (slot 9); the extra GPU combat is a barb attacking the rival unit at 523. So it is a RIVAL-UNIT position ripple (rivals patrol/snipe/war-move under the shifted economy) → a barb finds a rival adjacent in the GPU that TS does not. Diff the rival-unit positions GPU vs TS at t56–57 next.
