# #45 NAVAL DESIGN BRIEF — AUDIT B-6 (embarkation + naval units)

Status: DRAFT for owner review. No implementation until approved.
Source-of-truth rule applied throughout: the behaviour closer to REAL
Civ 6, sized to the modeled scope. 8 pts — the biggest open B item.

## Goals / non-goals

GOALS: water stops being a wall. Land units embark (tech-gated); two
classical naval units exist; coastal cities build them (coast-adjacent
center OR completed Harbor); naval combat runs through the EXISTING
roll machinery; rival naval usage is in-gate; player naval is
poke-covered (the B-25 precedent) until #50 gives the RL verbs.

NON-GOALS (recorded residuals, not scope creep): mapgen untouched
(same maps — islands already occur; only MOBILITY changes); no naval
barbarians (stays in B-26); no settler/builder embark on SCRIPTED
seats (founding reach unchanged — the highest-blast-radius lever,
deliberately deferred); no Trader/route changes (B-23); no
Frigate+ era ships, no unit upgrades (B-10); controlled-head water
move columns deferred to A-18/#50 (documented asymmetry: scripted
rivals can embark at war, controlled rivals cannot yet).

## Settled rules

TECH GATES (all four techs already in data/techs.ts):
- SAILING: civilian land units may embark; unlocks GALLEY.
- SHIPBUILDING: ALL land units may embark; unlocks QUADRIREME.
- CARTOGRAPHY: OCEAN becomes enterable (embarked + naval). COAST and
  LAKE are enterable from the respective embark/naval unlock on.

NEW UNITS (data/units.ts, costs pre-GAME_SPEED like the rest):
- GALLEY: melee, combat 30, cost 65, maintenance 1, moves 3,
  requiresTech SAILING, `naval: true`.
- QUADRIREME: combat 20, ranged {25, 1}, cost 120, maintenance 2,
  moves 3, requiresTech SHIPBUILDING, `naval: true`.
- `UnitDef.naval?: boolean` (default false). `unitDomain` untouched
  (no charges → military — correct for both ships).

MOVEMENT / EMBARKATION:
- `unitPassable` becomes unit-aware: naval → water && !impassable;
  land → the current rule, OR water when the unit is EMBARKED-capable
  (owner has the gate tech) — stepping onto water SETS
  `Unit.embarked = true`, stepping onto land CLEARS it; each of those
  transitions costs ALL remaining MP (real Civ 6 embark/disembark).
- Embarked movement: EMBARK_MOVES = 2 (flat; tech upgrades unmodeled).
  Water tiles enter at cost 1 (no hills/features), rivers irrelevant
  on water steps.
- OCEAN needs CARTOGRAPHY for every mover; COAST/LAKE do not.
- SCRIPTED embark surface v1 = the rival WAR-MARCH ONLY (the
  `hostileUnitAct` fall-through + `_rival_unit_war_act` walker): an
  at-war rival military with SHIPBUILDING may take a water step when
  strictly closer to target. Patrol/builder/settler walkers and the
  scripted player stay land-only (recorded). This makes embark
  in-gate wherever water shortcuts exist.
- ZOC: embarked units neither exert nor obey... they OBEY (halt rule
  unchanged — cheap, symmetric) but do NOT EXERT (excluded from
  `inEnemyZoc`'s military scan). Naval military exert/obey normally.

EMBARKED COMBAT (the vulnerability, real Civ 6 sized):
- An embarked unit cannot attack, cannot fortify, and defends at flat
  `EMBARKED_DEFENSE_CS = 10` − woundPenalty; NO terrain/fortify/
  support terms. It contributes to nobody's flanking/support counts.
- A defeated embarked MILITARY dies; an embarked CIVILIAN is CAPTURED
  by player/rival melee per B-31 — POOL-END INVARIANT applies (the
  captured unit moves to the END of state.units / GPU pool-end
  append); it stays embarked under its new owner. Barbarians kill.

NAVAL COMBAT:
- Ships are ordinary military units in the existing machinery: same
  damageRoll sites, wound penalty, B-7 flanking/support (naval allies
  count; embarked never do), same melee advance rule. Ships never
  accrue fortify (`fortifyTurns` gated on !naval — real Civ 6 has no
  naval fortify).
- Coastal cities become attackable from water with ZERO new combat
  code: meleeAttack/rangedAttack/attackTargets reach the center at
  d==1 across water once passability lets ships adjacent; naval melee
  captures cities (real Civ 6). City walls strikes (pcstk/rcstk)
  already scan range 2 tile-agnostically — ships get struck.

PRODUCTION / PURCHASE:
- A city can build/buy naval iff its CENTER is adjacent to water OR
  it has a completed HARBOR. Applies to all three surfaces
  symmetrically: player queue/purchase (game.ts), scripted rival
  queue + A-5r gold purchase (phase.ts), controlled-head masks
  (production_mask / rival_masks — mask rows extend data-driven).
- Naval spawn: nearest free WATER tile (spawnUnit's probe already
  goes unit-aware with tileFreeForUnit; ships never spawn ashore).
- SCRIPTED RIVAL NAVAL POLICY (the in-gate lever, deliberately
  minimal): a rival with SAILING and a naval-capable city builds ONE
  GALLEY when it owns zero naval units (priority just below its
  existing military floor); the galley joins the existing patrol
  walker (water steps allowed for naval) and the war-act targeting
  when at war. No quadrireme policy v1 (purchase can still buy it —
  data-driven; likely poke-only).
- SCRIPTED PLAYER: builds no naval, never embarks (unchanged
  exporter walker). Player naval = poke tests now, RL verbs at #50.

## Engine change map (symbol-anchored)

TS: `UnitDef.naval` + 2 catalog rows (data/units.ts); `Unit.embarked`
(types.ts); `unitPassable(tile, unit?)` + call-site sweep,
`moveCostInto` water case, embark/disembark transitions + all-MP
charge in `walkPath` + the war-march step loop (`hostileUnitAct`),
`tileFreeForUnit` (passability arg), `spawnUnit` water probe,
`inEnemyZoc` embarked exclusion, `fortifyTurns` accrual gate
(refreshUnits), B-7 `flankCount`/`supportCount` embarked exclusion,
`meleeAttack`/`rangedAttack` embarked-defender CS override + civilian
capture reuse; naval-capable gate helper (game.ts) wired into
`purchaseUnit`/queue validation + the rival queue/purchase blocks
(phase.ts) + the galley policy; exporter unit tables.

GPU (engine.py): `wpass` [B,T] plane (exporter ships per-tile wpass;
water tmove = 1); `p_emb`/`v_emb` [B,slots] bool (_MUTABLE, snapshot/
restore, `_reclaim_pool` permutation); `unit_naval` rules table;
passability composition per mover class at every gather site of
`self.passable` (player move/attack legality, builder walk, barb walk,
rival civ walk, war-march, patrol, spawn probes — the war-march is the
only one whose BEHAVIOUR changes v1, the rest gain the naval/embark
composition for naval movers); embark state transitions + all-MP
charge in the war-march step loop; `_flank_support` embarked masks;
embarked-defender CS override in `_apply_unit_actions` melee/ranged,
`_hostile_vs_unit`, `_hostile_ranged_strike`, walls strikes; naval
build gate plane (static center-water-adjacency | completed-Harbor
dynamic) into `production_mask`/`rival_masks`/scripted queue; galley
policy mirror; B-31 transfer sites already pool-end (no new code).

EXPORTER (scripts/export-gpu.ts): per-tile `wpass`, water `tmove`,
unit table naval/embark fields, `embarked` init false in unit dumps.
T0 AUDIT (standing lesson): no removal mechanics here, but re-check
unit-roster dumps once the galley policy fires mid-reference-run.

## Draw-count / parity notes

No new RNG draws anywhere. Trajectory reshuffles are expected and
LARGE (war marches take water shortcuts; rivals divert production to
a galley; new attack targets exist) — re-export + full gates. The
embark/disembark all-MP charge keeps walker step-loops terminating.
New tables are bool/int (no f32 dtype risk, still checked at merge).

## Stage plan (serial — this is core-movement surgery, not disjoint
slices; ONE battery at the end per the round rule)

- N1 (agent, Opus): movement + embark model, both engines + exporter.
  Lands LIVE only via the rival war-march (small in-gate reshuffle);
  everything else inert (no naval units exist yet). Gates green.
- N2 (agent, Opus, after N1 merges): naval units + production gating
  + embarked/naval combat overrides + the rival galley policy. The
  big reshuffle. Gates green.
- N3 (main session): `gpu/tests/naval_test.py` poke suite (player galley
  spawn/attack/city-capture, embarked civilian capture pool-end,
  quadrireme bombard, ocean gate pre/post CARTOGRAPHY), AUDIT/docs,
  residuals recorded, ONE battery, close.

## Residuals to record at close (AUDIT B-6 note)

Scripted player naval + embark (rides #50 with A-18/A-21/A-22);
scripted settler/builder embark (founding reach — own gated stage if
ever); controlled-head water move columns (A-18); naval barbs +
coastal camps (B-26); Frigate+ hulls, upgrades (B-10); Great Admiral
naval half (B-8); harbor/naval trade effects (B-23); no Quadrireme
scripted build policy.
