# NAVAL N1 — movement + embarkation model (both engines + exporter)

Stage base: 8c15424 (NAVAL_DESIGN brief). Scope = MOVEMENT + EMBARK only.
N2 (naval units/production/combat) drops in on top. No catalog rows, no
combat overrides here.

## Plan / decisions (fill as I go)

### TS (src/core, src/data)
- `UnitDef.naval?: boolean` (data/units.ts) — default false, no naval rows yet.
- `Unit.embarked?: boolean` (types.ts).
- `EMBARK_MOVES = 2` (data/constants.ts).
- `unitPassable(tile, unit?)` — unit-aware TERRAIN plane: naval→water, land→land
  (impassable always false). Tech gating (embark-capability + ocean/CARTOGRAPHY)
  is composed by the CALLER (it needs state/owner-tech), mirroring the GPU where
  `self.passable`/`wpass` are terrain planes and the gate is composed at the
  gather site.
- Helpers (units.ts): `ownerHasTech(state, unit, tech)`, `canEmbark(state, unit)`
  (civilian→SAILING, military→SHIPBUILDING, tech of the OWNER), `waterEnterable(
  state, tile, unit)` (OCEAN needs CARTOGRAPHY; COAST/LAKE ungated), and the
  embark/disembark transition helper.
- `tileFreeForUnit(state, i, unit?, allowEmbark=false)` — gains the embark/ocean
  composition; only the war-march passes allowEmbark=true, so every other caller
  stays land-only (inert).
- `moveCostInto` — explicit water short-circuit → 1 (water was already 1; explicit
  for clarity/embarked moves).
- war-march (`hostileUnitAct`, combat.ts): step filter allows water steps for an
  embark-capable mover (canEmbark ⇒ military needs SHIPBUILDING); embark/disembark
  transitions cost ALL remaining MP; embarked movement uses EMBARK_MOVES; water
  enter = 1, no river charge. Barbarians never embark (no research/tech ⇒ canEmbark
  false), so the shared walker stays land-only for them.
- `inEnemyZoc` — embarked military do NOT EXERT (excluded from the scan); they
  still OBEY (mover halt rule unchanged).
- `refreshUnits` — MP pool = EMBARK_MOVES while embarked; fortify accrual gated on
  `!naval` (inert, no naval units yet); embarked units move every march turn so
  their fortifyTurns are 0 in practice.
- B-7 `flankCount`/`supportCount` — exclude embarked units.
- exporter unit dumps: `embarked: false`; unit table `naval` field.

### GPU (gpu/civ6gpu/engine.py)
- `wpass` [B,T] bool (exporter ships per-tile; water & !impassable).
- `p_emb`/`v_emb` [B,slots] bool — _MUTABLE, snapshot/restore, _reclaim_pool
  (mirror p_fortify/v_fortify EXACTLY).
- `unit_naval` rules table (per unit type; all-false current roster).
- passability composition at every `self.passable` gather site — inert for land
  movers (OR with an all-false naval mask); BEHAVIOUR changes only in the rmil
  war-march (`_rival_unit_war_act`): land_ok | (wpass & can_embark & ocean_gate),
  embark transitions all-MP, EMBARK_MOVES pool, water cost 1.

### Exporter (scripts/export-gpu.ts)
- per-tile `wpass`; unit table `naval`; unit dumps `embarked:false`. t0 re-check.

## Deviations / findings
- (log here)

## War-march water steps: LIVE vs inert flag
- decision pending gate results.
