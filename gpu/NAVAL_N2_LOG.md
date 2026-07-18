# NAVAL N2 — naval units + production gating + embarked/naval combat + galley policy + LIVE flip

Stage base: e702c4e (N1 merged). Scope = catalog rows, naval movement proper,
embark LIVE flip, embarked/naval combat overrides, production/purchase gating
(3 surfaces), scripted rival galley policy. N3 (poke suite + battery + AUDIT)
is NOT mine.

## Plan (from brief + N1 handoff)

A. Catalog: GALLEY, QUADRIREME in data/units.ts (exporter data-driven).
B. Naval movement proper: ships water-only, spawn nearest free WATER,
   ships never fortify (GPU accrual gate), ships exert/obey ZOC normally.
C. Embark LIVE: flip embarkState.live=true; requires (both engines):
   (1) embark-aware peace-act/patrol; (2) GPU _in_enemy_zoc embarked-exert
   exclusion; (3) embarked-defender combat override + civilian capture keeps
   embarked (pool-end); (4) GPU !naval fortify gate; (5) war-march water steps
   un-flagged-off.
D. Production/purchase gating (player queue+purchase, rival queue+A-5r
   purchase, GPU masks): naval iff center adjacent water OR completed HARBOR.
E. Scripted rival galley policy: SAILING + naval-capable city + zero naval
   units => build ONE GALLEY, priority just below military floor; mirror GPU.
F. Combat integration: ships flow through existing rolls; B-7 counts naval
   allies; embarked contribute nothing. Coastal city attack via existing paths.
G. No new RNG draws. Re-export + gate. Reroll degenerate seeds + log.

## Decisions / deviations

- GALLEY counts toward bestMeleeCS / r_best_melee (city-defense ratchet): NO
  special-case — it IS the strongest melee unit a civ has fielded; zero extra
  parity surface (TS spawnUnit `combat>0 && !ranged`; GPU `_p_rng_str==0`).
- `cityNavalCapable` (TS) uses ENTERABLE water (`isWater && !isImpassable`) to
  match the GPU `wpass` plane exactly (a center facing only ice can't field
  ships). Center-adjacent-water OR completed-Harbor; works for City/RivalCity.
- `trainableUnits(state, city?)`: naval offered ONLY when a naval-capable city
  is passed. No-city callers (rlenv candidate scan) never see naval → player
  naval stays poke-only until #50 (no new RL verbs this stage). queueUnit +
  purchaseUnit (game.ts) + panels pass the city; gate is exact.
- Scripted galley policy placed JUST BELOW the military floor (army-at-cap),
  above projects — both engines. Rival A-5r purchase + controlled rival
  `rival_masks` ladder never list naval (deferred to #50); the naval gate there
  is vacuous by roster. Controlled PLAYER `production_mask`/purchase DO offer
  naval gated by `_naval_cap_player()` (center-water | completed-Harbor).
- findPath made naval-aware (player-ordered ship moves / auto-explore); scripted
  walkers never use it. No player-embark routing in findPath (rides #50).
- Embarked-defender override applied at EVERY defender-CS site in BOTH engines
  (player melee/ranged, _hostile_vs_unit, _hostile_ranged_strike, pcstk/rcstk
  walls): flat EMBARKED_DEFENSE_CS − wound, no terrain/fortify/support. New
  rules.combat.embarkedDefenseCs (=10) → self._embarked_defense_cs.
- Embarked units can't attack: TS attackTargets/meleeAttack/rangedAttack guard;
  GPU war-act + peace-act mask `attack` by `~v_emb`.
- Capture-keeps-embarked: TS meleeAttack preserves embarked in place (already);
  GPU both B-31 sites now inherit v_emb/p_emb (was 'N2: inherit' markers).
- fortify !naval gate (GPU v_/p_fortify) mirrors TS refreshUnits; barbs untouched.
- Peace-act (GPU _rival_unit_peace_act) + TS patrol made embark/naval-aware:
  naval water steps + embarked-come-home (disembark all-MP), LIVE-gated; the
  "ANY unit blocks" occupancy rule is UNCHANGED (the pre-N2 mirror).

### THE BUG (hunt) — embarked rival MP
- Root of the only parity failure (seed 9300 t224 rng/score, first POSITION
  desync t221): rivalPhase (rivals.ts:1446) reset EVERY rival unit's movesLeft
  to its LAND moves, IGNORING embarked — so an embarked horseman moved 4 tiles/
  turn in TS vs EMBARK_MOVES=2 in the GPU (correct, real Civ 6). Dormant in N1
  (live=false → nothing embarks). Fixed TS to use EMBARK_MOVES when embarked.
- Hunt path: parity named t224 → CIV6_EXPORT_DEBUG=9300 showed "Rome met
  Zanzibar" (a rival unit reached a CS by proximity) → per-slot GPU dump +
  temp exporter unit dump traced s91 (embarked horseman) diverging at t221
  (GPU@770 hexd2, TS@683 hexd4) → the MP reset. LESSON: N1's inert LIVE path
  hid an asymmetry the full battery only exercised once embark went live.
- Fixture hygiene: an earlier `CIV6_EXPORT_DEBUG=9300 ... 9300 250` set
  N_SEEDS=9300 and wrote ~141 stale seed files (export never cleans); parity
  flagged them until `rm gpu/fixtures/seed*.json` + clean re-export.

## Gate results
- npx tsc --noEmit: clean
- npx vitest run: 285 passed (32 files; 15 in naval-embark.test.ts, 6 new N2)
- npx vite-node scripts/export-gpu.ts: OK, 24 seeds
- python gpu/parity_test.py: PARITY OK — 0.0 milli
- CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3 parity: PARITY OK — 0.0 milli
- python gpu/rollout.py --shards 4 --pipeline-replay: REPLAY PARITY OK (72 games × 250t)
  (run with --ckpt 0: --ckpt 25 writes hundreds of 6MB .pt files → disk-I/O stall,
  not a hang; ckpts are hunt tooling, not part of the gate contract.)

### THE SECOND + THIRD failures (rollout only — both engine-pool/controlled-head)
- r_routes columns exhausted (GPU assert, rollout generation): the tensor
  K=10 omitted the A-12b trade-CS-suzerain route term — true max =
  1(FOREIGN_TRADE) + maxCities + 2(COLOSSUS/GREAT_ZIMBABWE) + S(trade CS) = 12.
  The naval reshuffle let a sampled rival actually reach it. Fixed: size
  k_routes = 1 + maxCities + 2 + S + 2 slack (=14 here). Parity-neutral (unused
  cols stay -1). Latent since A-12b; scripted seeds never hit it.
- controlled-PLAYER naval build (replay "no player unit at tile"): enabling
  naval in production_mask/purchase let the RL/controlled player build+act on
  galleys the TS replay couldn't mirror (no naval move/attack verbs yet). Per
  the residual (controlled water columns → #50), the controlled + RL heads now
  build NO naval (mirrors rival_masks + scripted bestMilitary). The scripted
  RIVAL galley is the ONLY in-gate naval production. Removed _naval_cap_player.

## In-gate reachability (24 scripted parity seeds × 250t)
- rival GALLEY built: 7/24 (seeds 9079 9131 9157 9170 9183 9209 9287)
- rival EMBARK fired: 7/24 (seeds 9118 9131 9183 9209 9261 9274 9300)
- player embark:      0/24 (scripted player never embarks — by design)
- embarked-defender COMBAT (override fired): 1/24 — REACHED in-gate
- naval-unit COMBAT (galley attacked/was hit): 0/24 — gate-UNREACHABLE

## N3 handoff — what the poke suite MUST cover (gate-unreachable)
- GALLEY naval melee: attack + CAPTURE a coastal city / CS (0/24 in-gate;
  tests/naval-embark.test.ts pokes a galley battering a rival city — extend).
- QUADRIREME ranged bombard from water (never built in-gate; purchase-only).
- PLAYER naval end-to-end: spawn on water, move (findPath naval), attack
  (0/24 — scripted+controlled player build none).
- OCEAN gate pre/post CARTOGRAPHY for a mover (coast vs ocean enterability).
- City-walls strike vs a naval / embarked target (pcstk/rcstk override paths).
- Embarked civilian capture pool-end + keeps-embarked (covered by a unit test;
  add a GPU poke — the two capture sites now inherit p_emb/v_emb).
- Naval unit as B-7 flank/support ally (naval military counts; embarked don't).
Residuals unchanged from the brief: controlled/RL player naval (build+move+
attack) → #50; no scripted Quadrireme build policy; naval barbs → B-26.

## N3 handoff
