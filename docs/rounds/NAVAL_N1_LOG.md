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
- `unitPassable(tile, unit?)` kept as the pure TERRAIN plane (naval→water,
  land→land, impassable→false). Tech gating (embark-capability + OCEAN/
  CARTOGRAPHY) is composed by the CALLER via `tileFreeForUnit(..., allowEmbark)`
  — it needs the owner's research, which unitPassable does not carry. This
  mirrors the GPU exactly (passable/wpass are terrain planes; the gate is
  applied at the war-march gather site). findPath stays land-only for N1 (naval
  routing is N2; no naval units exist).
- `moveCostInto` now short-circuits water→1 (was already 1 for water; explicit
  for embarked/naval moves). Never called on water in the inert path.
- No `u_emb` (barbarian) plane: barbarians own no research → canEmbark false →
  the shared war-march walker is land-only for them by construction.
- Exporter t0 audit: the galley/naval policy does NOT fire in N1 (no naval
  units), so no mid-run roster changes; unit dumps stay {type,tile} and the new
  p_emb/v_emb planes init to zeros (= embarked:false at t0), the exact
  p_fortify/v_fortify precedent — so no `embarked` dump field is needed (would be
  a redundant always-0 read). Documented rather than adding a dead field.

## DECISION: war-march water steps land behind a mirrored INERT flag
- `embarkState.live` (TS, src/data/constants.ts) / `sim._embark_live` (GPU;
  exported as rules.combat.embarkLive) — DEFAULT FALSE. With it off every walker
  is land-only and the engines are byte-identical to base 8c15424 (confirmed:
  parity 0.0 milli, forced-compaction 0.0, rollout REPLAY PARITY OK).
- WHY not LIVE: an embarked rival unit that survives into a PEACE turn is an
  incoherent intermediate state — TS `patrol` and GPU `_rival_unit_peace_act`
  are land-only and would move it without the embark transition (all-MP,
  clear-embarked) and with a divergent MP pool (TS refresh gives EMBARK_MOVES,
  GPU peace-act uses full moves). Making the water-steps LIVE parity-safe needs
  embark-aware peace-act + patrol AND the embarked/naval COMBAT overrides — that
  is exactly N2's package. The task explicitly sanctions the inert-flag fallback
  for an incoherent intermediate. LIVE would also give ZERO in-gate benefit if
  rivals never reach SHIPBUILDING in-horizon, and RISK divergence if they do.
- The LIVE path is nonetheless fully implemented and PROVEN both engines:
  - TS: tests/naval-embark.test.ts (9 tests) — pokes setEmbarkLive(true) and
    checks embark transition costs all MP + lands on water, the SHIPBUILDING/
    SAILING/CARTOGRAPHY gates, ZOC exert-exclusion (embarked)/obey, spawn-ashore,
    tileFreeForUnit allowEmbark gating; and switch-OFF stays land-only.
  - GPU poke: forcing sim._embark_live=True + granting rivals SHIPBUILDING/
    CARTOGRAPHY and keeping them at war produced peak 12 embarked rival
    unit-slots over 120 turns (4 on water at end) with no crash — the war-march
    water composition, embark transitions and EMBARK_MOVES pool all execute.

## SCOPING: GPU passability composition confined to the war-march
- The brief listed composing passability at EVERY `self.passable` gather site
  (player move, builder walk, barb walk, rival civ walk, patrol, spawn/target
  probes) "inert for land movers". Given the whole feature is behind the inert
  flag AND no naval units exist, that composition would be a strict no-op there:
  `passable | (wpass & unit_naval & …)` with unit_naval all-false ≡ passable. It
  is dead code for N1 and pure parity risk (broadcast-shape slips), and N2 must
  rewrite each of those sites substantially anyway to make naval movers actually
  MOVE (embark transitions, EMBARK_MOVES, combat) — a bare legality term buys it
  little. So N1 composes ONLY at the rmil war-march (the one site the brief says
  changes behaviour) and defers the other-site composition to N2 with the naval
  mechanics. `wpass`, `ocean_tile`, `unit_naval` and the tech-index helpers are
  all in place for N2 to wire those sites. (TS mirrors this: unitPassable is the
  terrain plane; only tileFreeForUnit+war-march compose the gate.)

## GATE RESULTS (all foreground)
- npx tsc --noEmit: clean
- npx vitest run (naval-embark + units + combat + rivals): 54 passed (9 new)
- npx vite-node scripts/export-gpu.ts: OK, 24 seeds
- python gpu/parity_test.py: PARITY OK — 0.0 milli
- CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3 parity: PARITY OK — 0.0 milli
- python gpu/rollout.py --shards 4 --pipeline-replay: REPLAY PARITY OK (72 games)

## N2 handoff
- FLIP: set embarkState.live=true (TS) — exporter then ships embarkLive=1 →
  GPU _embark_live reads true. That alone turns on the rival war-march water
  steps; do it TOGETHER with the items below or gates will diverge on the
  embarked-at-peace state.
- Planes ready: TS Unit.embarked, UnitDef.naval; GPU p_emb/v_emb [B,slots] bool
  (_MUTABLE, snapshot/restore, _reclaim_pool for p&v), wpass/ocean_tile [B,T],
  unit_naval [NU]; rules.combat.{embarkMoves,sailingTech,shipbuildingTech,
  cartographyTech}; engine self._embark_moves/_sailing_tech/_shipbuilding_tech/
  _cartography_tech.
- Helpers ready (TS units.ts): unitPassable(tile,unit?), ownerHasTech,
  canEmbark, waterEnterable, tileFreeForUnit(...,allowEmbark). walkPath +
  refreshUnits already apply EMBARK_MOVES + embark transitions; inEnemyZoc,
  flankCount, supportCount already exclude embarked (TS). fortify accrual gated
  on !naval (TS refreshUnits, GPU N2 must add).
- N2 MUST ADD for LIVE parity: (1) embark-aware peace-act (GPU
  _rival_unit_peace_act) + patrol (TS) — EMBARK_MOVES pool + disembark
  transition, mirrored; (2) GPU inEnemyZoc embarked-exert exclusion (TS has it,
  GPU N1 does not — inert now); (3) embarked-defender CS override + naval combat
  (both engines); (4) capture-keeps-embarked (the two GPU capture sites set
  p_emb/v_emb=False with a "N2: inherit" note; TS meleeAttack capture must carry
  unit.embarked); (5) GPU fortify accrual !naval gate; (6) naval spawn probes
  already unit-aware (tileFreeForUnit naval→water) — verify at N2.
