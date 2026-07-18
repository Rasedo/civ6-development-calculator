# Round B2 — economy/policies + religion/GP + trees/victories/meta (#46/#47/#48)

> _Archived 2026-07-18 — completed round brief (shipped 33199dc). Degradation ledger lives in the still-live `gpu/ROUND_B2_LOG.md`; superseded by later rounds tracked in `gpu/AUDIT.md`._

Owner-ordered 2026-07-17. Three parallel worktree agents (Opus), disjoint
slices, merged into one gate-serialized stage (the e7ba22a pattern).
Owner rulings baked in:
- **B-14**: `CITIZEN_SCIENCE` 0.7 → **0.5** (real Civ 6; CITIZEN_CULTURE 0.3 already matches).
- **B-16**: adjacency → **GS values**: INDUSTRIAL_ZONE +0.5/mine, +1/quarry, +2/Aqueduct-adjacency; HARBOR +1 per CITY_CENTER (was +2). Fractional sums floor in the existing `districtAdjacency` spot.
- **Breadth**: **FULL real-game catalog parity** — techs → ~68 (Atomic/Information/Future eras), civics → ~50, policies → 50+ incl. diplomatic, wonders/beliefs/GP rosters to real counts. Real Civ 6 (GS) values anchor every row.
- **#45 naval is OUT** (dedicated later round). Do not touch `unitPassable`/embarkation.

## Common rules (all agents)

1. TS (`src/core` + `src/data`) is the spec; the GPU engine mirrors
   turn-exactly. Never widen tolerances. Zero new RNG draws unless
   mirrored draw-for-draw on identical conditions.
2. Catalog rows use real Civ 6 GS values. Where a row's real effect
   needs an absent system (tourism, naval, appeal, spies), degrade to
   existing effect channels or omit the effect (keep the row inert) —
   and RECORD every degradation in your section of `gpu/ROUND_B2_LOG.md`.
3. Minimize new effect KINDS. Prefer existing channels
   (`applyPolicyEffects` kinds, `BeliefEffects`, `GreatPersonDef.effect`,
   yield mults). A genuinely new channel lands in BOTH engines with a
   poke self-test. Effect-channel placement is the hunt magnet (A-4
   lesson) — put the application at the SAME point in both yield
   pipelines.
4. Deterministic scripted behavior only: auto-picks are cheapest-first /
   table-order-stable-tie exactly like existing research auto-pick.
5. Stay inside your slice. No opportunistic edits to other slices'
   files/items (merge cleanliness). Shared files (types.ts, effects.ts,
   export-gpu.ts, engine.py rules loading, battery.py) WILL overlap —
   keep your edits additive and localized.
6. New pooled state (units, per-city registries) needs KILL hygiene +
   `_MUTABLE` registration + forced-compaction gate.
7. Self-tests: every path the random rollout can't reach organically
   gets a poke test (`gpu/*_test.py`, the occupancy_test pattern) wired
   into `gpu/battery.py`'s cputests lane.

## Slice P — #46 economy/districts/policies (+ A-5r/A-7r)

- **B-13 policy breadth**: `POLICIES` (data/policies.ts) 19 → full ~50+
  incl. diplomatic cards; all 10 `GOVERNMENTS` already exist — verify
  slot layouts vs real GS.
- **A-7r rival government/policies**: scripted rivals adopt governments
  and slot policies. Design: on civic-unlock, adopt the newest unlocked
  government (tie → table order); slots filled greedily in card-table
  order among unlocked cards matching slot type (wildcard takes the
  first unfilled-eligible card). Zero RNG. Extend `getRivalModifiers`
  (effects.ts) to layer government+policy effects like `getModifiers`;
  GPU: per-rival modifier tables + exporter rows (the A-7 belief-table
  shape). SYMMETRY: the scripted PLAYER seat adopts by the same rule
  (the A-7 note says the machinery is inert while the scripted player
  never adopts — make both seats live).
- **A-5r scripted-rival purchases**: rivals gold-buy units and settlers
  (the CONTROLLED heads already carry the verbs — reuse their
  semantics for the scripted policy: buy when treasury covers price ×
  a threshold, one purchase/civ/turn extending the existing A-5
  building-buy block's order). Tile purchase (`buyTile`) gets a rival
  twin only if it fits cleanly; otherwise record as deferred.
- **B-14**: the one-constant change + fixture regen.
- **B-16**: GS adjacency values (DISTRICTS constants; new AQUEDUCT
  adjacency source kind for IZ; GPU adjacency tables + exporter).
- B-17 remainder (specialist slots/district combat/unit XP) is OUT —
  ties to parked B-4/A-22.

## Slice Q — #47 religion + great people

- **B-18 religion depth**: Enhancer belief slot + full belief catalogs
  to real counts (~25 pantheons, ~11 follower, ~8 founder, +enhancers —
  degrade rows needing absent systems per common rule 2). Spread:
  implement real-anchored pressure — cities within 10 tiles of a holy
  city receive pressure per turn; majority pressure flips city
  religion; founded religions spread to BOTH player and rival cities
  symmetrically. Missionary units (faith-purchased, 3 spread charges)
  for player scripted + rivals IF it lands cleanly with zero RNG;
  otherwise pressure-only and record. NO theological combat, NO
  religious victory this round (record both).
- **B-19 GP cost ladder**: replace flat 60·2^n with the real era-based
  cost ladder per class; keep the global first-come race
  (`claimGreatPeople`). Add Writer/Musician classes + per-era rosters
  (B-27 GP counts) — `GP_CLASS_DISTRICT` keys Writers/Musicians to
  THEATER_SQUARE (rival-unreachable until A-9; fine — player-reachable).
- **B-20 GP activation**: multi-charge people; Great Works as
  building-slotted yield stores (Amphitheater/Museum-line slots,
  culture+gold per work — the real per-work yields). Tile-activation
  abilities degrade to instant lumps where the tile system can't
  express them (record each).
- Religion/GP catalog rows of **B-27**.

## Slice R — #48 trees/victories/meta

- **B-11 techs 32 → ~68**: full GS tree topology (Atomic/Information/
  Future eras in `ERAS`), real costs/prereqs; eureka boosts for new
  techs where the boost condition is expressible (else unboostable —
  record). Pure-military techs land as tree nodes; absent units
  (B-10 roster) stay absent — the techs unlock nothing yet (record).
- **B-12 civics 31 → ~50**: same treatment; inspiration boosts likewise.
- **B-27 catalogs**: world wonders 13 → ~30, natural wonders 7 → ~12,
  buildings 34 → ~45+, projects incl. the space race chain. Effects
  degrade per common rule 2.
- **B-25 Science victory**: space-race projects (satellite / moon /
  Mars components) gated on late techs; completing the chain sets
  `victoryType` in `endTurn`. Rivals already run projects — a rival
  completing the chain ends the game as a loss (domination-mirror
  semantics). Culture/Religious/Diplomatic victories stay out (their
  systems don't exist — record).
- **B-15 war weariness**: real-anchored amenity penalty — accumulates
  per turn at war (faster when combat happens in your territory if
  cheaply detectable, else flat per-war-turn), decays at peace ×4
  rate; applies via the existing amenity aggregation for the player
  AND the rival amenity/loyalty channel symmetrically.
- **B-21 CS data rows**: per-CS unique suzerain bonus table + 3/6-envoy
  bonuses keyed to real building tiers where buildings exist.
- B-22 casus belli (→#55), B-23 trade (→#41), B-24 governors/eras are
  OUT (record).

## Validation bar (each agent, in its worktree)

1. `npx tsc --noEmit` clean; `npm test` (vitest) green.
2. Regenerate fixtures: `PYTHONUTF8=1 npx vite-node scripts/export-gpu.ts`.
3. Scripted gate green: `PYTHONUTF8=1 python gpu/parity_test.py` (0.0 milli).
4. Forced-compaction gate green: `CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3 PYTHONUTF8=1 python gpu/parity_test.py`.
5. Your poke tests green.
6. Off-script gate + full battery run ONCE on the merged tree (the
   orchestrator's job), followed by the budgeted parity hunt.

## Status log

- 2026-07-17: round opened, briefs issued (this doc). Agents: P/Q/R.
- 2026-07-17: LANDED as commit 33199dc (design note 8fc5966). Merged
  gate-serialized stage: policies 19→56, techs 32→68, civics 31→52,
  world wonders 13→30, natural wonders 7→12, belief catalogs 25/9/8/7,
  GP era cost ladder + Writer/Musician classes, war weariness (B-15),
  science victory TS-side (B-25), GS district adjacency (B-16),
  CITIZEN_SCIENCE 0.7→0.5 (B-14). Government/policy adoption machinery
  shipped INERT behind `GOVERNMENTS_ADOPTION_LIVE`; religion enhancer/
  spread effects inert (no pressure/missionary system this round).
  Degradations recorded in gpu/ROUND_B2_LOG.md. Both gates + battery green.
