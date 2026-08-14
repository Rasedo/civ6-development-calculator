# Engine audit v4 — 2026-08-09

Fourth audit generation, replacing v3 (2026-07-12, last complete at
`ebdab84`). Per this ledger's own rule, resolved entries are dropped
WHOLESALE — v3 carried ~3,600 lines of resolution history, hunt logs
and round briefs; all of it lives in git history. What remains below is
every OPEN item, restated against the current engine (seat vocabulary,
current symbols), plus the freeze backlog the first serve run must
validate.

**RULES (owner):**
- Every note anchors code BY SYMBOL — function/method/class/exported
  constant — never by line number. Line numbers rot; symbols grep.
- VERIFY-BEFORE-IMPLEMENT: every fidelity claim is checked against a
  real Civ 6 source before implementation — never off residual text,
  briefs or comments. Unverifiable magnitudes are recorded, not
  invented.
- SOURCE OF TRUTH is real Civ 6. Reachability is never a licence to
  deviate; gates prove the two engines agree, never that they agree
  with Civ 6.
- Every landed mechanic records WHICH lane can reach it. A green gate
  over an unreached mechanic proves nothing.

**State:** P8 training PARKED until this file is clean. A TEST FREEZE
is in force — everything since the restructure sits behind the compile
bar only, and the first `npm run seed && npm run export` +
`python gpu/serve_gate.py --batched` run opens the hunt (see the freeze
backlog at the bottom). Restore the seed set to 24 before the final
hunt — the 12-seed set is a temporary dev-speed cut.

All surviving `_LIVE` master switches are ON (GOVERNMENTS_ADOPTION,
B18_FOLLOWER_COUPLING, CITY_RELIGION_ADDER, ADMIRAL_MARCH,
DEDICATION_PAYOUTS, ENGINEER, BARB_SCOUT_OPENER); no mechanic is inert
behind a flag. RIVAL_TILE_BUY_LIVE and APOSTLE_BUY_LIVE were DELETED by
#103/#104 — those spends are wire decisions now.

## Completion estimate (owner-requested; guesstimates)

Hand-weighted 1–8 by implementation size; partial items carry
fractional credit. Chapters C/D/E/G closed in full and dropped.

| Chapter | Weight | Done | % |
|---|---|---|---|
| A symmetry | 41 | 40.0 | **98%** |
| B fidelity | 88 | 87.11 | **99%** |
| Closed chapters (C/D/E/G) | 62 | 62 | 100% |
| **Overall** | **191** | **189.11** | **99%** |

## A. Seat symmetry — open

- **A-9r. NEIGHBORHOOD district.** The one district the 9-wide scaffold
  still lacks (URBANIZATION civic unlock, appeal-tier housing). Its old
  blocker is gone — the appeal plane exists (the Seaside Resort pays
  gold = appeal) — so this is now ordinary district plumbing on both
  engines. (The other old A-9 residual, palace relocation on capital
  loss, has since landed: `_relocate_palace` (one body, every seat row).)
- **A-11r. Trade-route tails.** (1) ~~seat-0 machinery~~ LIVE: seat 0
  picks (`_seat0_trade_phase`, array-order scan), earns
  (`_seat0_route_income` at the cityTradeYields position in
  `_city_totals`) and expires row 0 — measure REACH at the freeze-lift
  hunt. (2) ~~civ↔civ descope~~ DEAD: the intl arm routes to ANY other
  major's EXPLORED city on both engines (fog is the meeting rule).
  (3) The international leg was gate-unreachable under old decisions —
  re-measure at the hunt (exploration gating changed the candidate
  set). (4) No seat's wire carries a trade-route DECISION — route
  creation is an eager rule; a route verb is P8-surface work. (5) No
  physical Trader unit — routes lay roads (`layTradeRoad` /
  `_lay_trade_road`) but nothing walks, so a route cannot be plundered
  en route. (6) GPU intl dests are stored as TILES, so a dest captured
  by another major keeps paying until expiry where TS's
  (toSeat, toSeatCity) filter drops it — route-store schema change,
  with the body merges.
- **A-26. Seat-0 mask-policy exclusions have NO TS twin — the last
  per-seat action-surface asymmetries, all GPU-mask-side.** TS
  mechanics are seat-generic everywhere surveyed: `trainableUnits` /
  `purchaseUnit` offer naval hulls to EVERY seat gated only on
  `cityNavalCapable`; the unit-sequence walker's SPREAD and SNIPE arms
  execute for whichever seat's record carries them. The GPU withholds
  the columns from seat 0 instead: `city_mask` bans all naval training
  AND gold purchase (`~unit_naval`, sim_masks.py), the civ production
  mask hand-rolls a single one-hull galley column (`_galley_idx`,
  sim_seats.py) that matches neither `trainableUnits` nor real Civ 6,
  seat 0's SNIPE ring columns are all-False (no dispatch arm), and its
  SPREAD columns are all-False (blocked on seat-0 religion, #73). None
  of it is gate-visible: the exclusions live in the decider's masks, so
  identical records reach both engines. Burn-down: adopt the capability
  gate on BOTH mask families (kills the galley column), give seat 0 the
  snipe dispatch, let #73 unlock spread. Each is a behaviour
  round with rollout churn — needs the serve gate live. DEBT markers
  sit at the four sim_masks.py sites. Seat-0 columns for tile buy and
  faith purchases (the #104 wire kinds) belong to the same family.
  #74 RESOLVED 2026-08-10: seat-0 EMBARK-on-order is refused on BOTH
  engines by design — the seat-0 chassis is walkPath, whose final-step
  tileFreeForUnit call passes allowEmbark FALSE, where the civ
  record-apply passes at-war && SHIPBUILDING; the asymmetry dies with
  the #108 wire unification, which routes seat 0 through the same
  applier. The REAL divergences were in the GPU's seat-0 move arm and
  are fixed: a NAVAL hull now takes the water plane (OCEAN behind
  CARTOGRAPHY) where `passable` froze every seat-0 ship, stepUnit's
  cliff refusal now fires on the disembark transition, and walkPath's
  movesLeft > 0 loop gate now refuses the free 0-MP disembark
  (_step_verb's all-remaining-MP cost reads 0 >= 0 without it).
  Gate-reachability note: seat 0 fields no ships in driven games
  (naval training/purchase masked, this family), so the naval arm is
  poke-covered only until the galley column dies.

- **A-27. The seat0-merge round's live tail.** Fog is ACTIVE
  (`fogOfWar = unitsMode` at creation) and FULLY twinned at the reveal
  level: CS meets exploration-gated on both engines, camps rise only in
  all-dark tiles, `Seat.explored` is a compared digest field
  (`seat_explored [B,1+R,T]`), and every TS reveal site has a GPU twin
  (walk hops via `_step_verb`'s one tile write, acquisitions,
  captures, spawns, foundings, t0 load — see `_reveal_around`'s
  docstring). Residuals: (1) the goody-hut maps reward has no twin
  because the GPU has NO goody-hut mechanic (check hut placement in
  gate worlds at the hunt — TS's goody path draws RNG); (2) ~~the GPU
  schedule~~ MOVED (slice 6): `step()` runs the endTurn global schedule
  and `_seat_phase` owns rows 0..R (`_seat0_row` is row 0's block, in
  the civ arm's proven internal order, `active0`-gated like the TS
  eliminated-actor continue; seat-0 declare/peace ride the geo-pass
  positions; scienceTotal + peaceTurns row 0 unified; trade unified in
  slices 7a-c; the quest/influence/upkeep BODY MERGES landed in slice 8
  — one row-generic body each, citystate_quest_district deleted) —
  that family is CLOSED except the tile-keyed route-dest corner
  (A-11r(6)); (3) the
  WAR_COLUMN_SEAT family (warTurns/peaceTurns/cityStateWarTurns + the
  war-column wire layout) is the last structural seat-0 bilateralism.
- **A-27. The SLOT-REGIME split (#110)** — the deepest remaining seat-0
  structural deviation: seat 0 keyed `tile_city` by COLUMN index where
  civ rows store PERSISTENT ids; TS is id-based for EVERY seat
  (`setTileOwner`/`tileBelongsTo` on `c.id`). The full id-space
  consumer audit lives at `.claude/scratchpad/slot-regime-audit.md`.
  **SLICES 1-2 SHIPPED 2026-08-10**: `city_id [B, 1+R, RC]` (row 0 =
  seat 0, `civ_city_id` a view), every seat-0 creation site allocates
  `next_city_id++` (the exact TS `nextCityId++` mirror) and writes THE
  ID into `tile_city` (found / border claim / both captures);
  `sim_seats.owner` derives slot-of-tile by matching row 0's id
  registry (alive columns only, cached on `_tile_owner_ver`), so its
  ~30 column-space consumers are untouched; `seat_routes[:, 0]`
  from/to hold ids like the civ arm (`_seat0_route_income` resolves
  ids back to columns for its per-column scatters);
  `_transfer_city_to_civ` computes `owned` by the direct
  `tileBelongsTo(t, 0, id)` match. The `tile.ownerCity` digest is now
  a REAL byte-exact id proof (was append-counter coincidence), and
  `nextCityId` lost its manifest gap — the whole pair row joins the
  fatal digest.
  **SLICE 3 SHIPPED 2026-08-10 — THE REGIME IS ONE.** Every seat row
  now APPENDS at last-alive+1 (the TS `push` mirror; the seat-0
  hole-reuse pick is deleted) and compacts stably at step end (the TS
  `splice` mirror) through ONE `_reclaim_cities(last_row=None)` over
  rows 0..R — so SLOT ORDER *IS* TS ARRAY ORDER for every seat, and
  `city_seq`/`city_seq_next`/`founded_n` are DELETED along with every
  `walk_ord` argsort that existed to translate between the two. The
  eight order-coupled mirrors that keyed on `city_seq` (the city walk,
  empire_score, luxury-grant ties, loyalty pop-mix, governor picks,
  defection order, `_place_works` row 0, the trade-pick rank, the two
  barb walks, both march ckeys, `_relocate_palace`'s row-0 branch) now
  read the column index or a living-first argsort — `_place_works` and
  `_relocate_palace` LOST their row-0 branches entirely. Row 0's
  [B, C] auxiliaries (center_yields / center_raw_food /
  base_maintenance / water_housing / coastal / river_center / dist)
  ride row 0's permutation. Audit latent (1) (no
  seat-0 route prune on city death) FIXED in slice 1; latent (2)
  (`centre_slot_at` civ slots stale after a compaction) FIXED here —
  the reclaim re-maps every major centre through its row's inverse
  permutation, so `center_at`'s value-readers are always fresh.
  REMAINING: the founding bodies and the two yield walks now merge
  with nothing structural in the way. BONUS CATCH (freeze-backlog break): the
  format-2 exporter ships no `cities` key, but `sim_init` still
  derived `C` from it and PRE-FOUNDED a ghost capital at column 0
  (`alive[:, 0] = True`) — the first regenerated fixture would have
  crashed at load, and the ghost (holding the zeros-init id 0) would
  have stolen the first real city's tiles under the id match. `C` now
  comes from `rules.seats.maxCities` (same value, 6) and nothing is
  pre-founded (settler starts, the tests' own t0 contract).

## B. Fidelity vs real Civ 6 — open residuals

- **B-17r. Encampment:** ranged-vs-district strikes are out of scope
  (matching the ranged-vs-city scope-out). Everything else landed —
  100-HP pool (`encamp_hp`), movement block, garrison pool, district
  strike, training XP.
- **B-18r. Seat-0 religion (#73).** Civ-seat religion is complete
  (pantheon/founder/enhancer races, pressure, missionaries, apostles,
  theological combat, worship buildings, faith buys on the wire).
  CAUGHT 2026-08-10: the #96 mega-batch deleted the TS side of the
  belief RACES (nothing pushed claimedPantheons/claimedBeliefs, the
  claim rule had no caller) while the GPU twin stayed live — every
  digest and the RNG stream would have diverged at the first civ claim.
  RESTORED at the advanceGreatPeople position in the seatPhase loop,
  gates and draw order mirroring the GPU's popen/ropen/eopen shapes.
  SEAT 0 ACTIVATED 2026-08-10 (#73 slices 13a-13c): ONE row-generic
  claim body (`_seat_belief_claims(row)` / the TS block with its
  seat-0 gate deleted) runs for every seat at the advanceGreatPeople
  position; seat 0 banks prophets at recruit, accrues Divine Spark
  GPP, and its effect hooks sit in the seat-0 yield walk at the civ
  walk's positions (feat plane, bldgY pf, perF/perC, River Goddess
  amenity+housing, Fertility Rites growth, Religious Settlements
  border cost). The TS UI verbs now PUSH what they take
  (choosePantheon/foundReligion → the claimed pools), so the pool IS
  the exclusion on both engines. The five belief facts + prophets
  compare row-0 in the FATAL digest (gap keys removed). NOT yet in
  the seat-0 walk: the completed-wonder family (`_wond_cy` flat
  yields, `_wond_grow` growth product, `fpw` Divine Inspiration) —
  wonders reach seat 0 only by CAPTURE (#83: neither seat can build
  them), so a captured wonder pays yields on civ rows and NOTHING on
  row 0; the city-block base unification collapses this with the
  walks themselves. Until religious-unit production wires up, seat 0
  fields no religious units (see A-26). KNOWN LATENT: a
  religious-unit lifecycle drift (recorded when APOSTLE_BUY was still
  a flag) becomes reachable the moment the driver emits faith-buy
  kind 6 — expect it at its causal turn in the first post-freeze
  serve hunt. HUNT-WATCH: seat-0 claims join the RNG stream at row
  0's loop position the first turn faith >= 25 — any stream
  misalignment surfaces as an rng-digest divergence AT that turn, and
  the walk-entry border ySum fix closes a latent red: the GPU's FIRST
  border pick of every walk ranked without farm-adjacency food where
  TS includes it (the two refresh sites had it, the entry site did
  not — now one `_border_ysum` construct), so border claims move
  wherever seat 0 had Feudalism-tier farms.
- **B-20r. Tourism tails.** Tourism, Great Works of writing/music/ART,
  relics, artifacts + archaeology (Archaeologist, antiquity sites,
  museum slots) and the wonder-era term all exist and are digest-
  compared. Open: NATIONAL PARKS (no concept); civ seats never PRODUCE
  an Archaeologist (seat-0-only so far — the production-wiring tail);
  recorded-not-modeled: theming bonuses, shipwreck excavation, trading
  works between civs, open-borders digs. Recorded deviation: every
  apostle killed in theological combat martyrs into a relic
  (promotions are unmodeled; overstates relic rate ~7×). MEASURED
  consequence: visiting tourists peak ~7 vs ~97 domestic at t250, so
  the culture victory is live-but-unreachable by ~14× until these
  close.
- **B-21r. City-state suzerain rows:** 14 shipped / 10 descoped
  (unit-XP, cavalry, apostle-promotion, trade-route, power and
  amenities channels — each documented at `CITY_STATE_SUZERAIN_LIVE`); shipped
  rows degrade %-scaling and conditionals to a flat channel yield.
- **B-22r. World Congress tails:** one resolution type only (real GS
  rotates many); Emergencies and Scored Competitions — the main real
  DVP sources — are unmodeled (awarding via the resolution winner is
  faithful in shape, overstated in rate); every civ commits ALL favor
  (no vote-size chooser on any seat); peace deals carry no terms; the
  favor PENALTIES (CO2, global grievances, occupied capitals) are
  named by sources without rates — recorded, not invented.
- **B-24r. Ages/governors tails:** Monumentality's faith-purchase of
  civilians + 30% discount, Exodus's +2 charges on new religious
  units, Free Inquiry's commercial-adjacency-gives-Science clause; the
  eight unmodeled dedication catalog entries (four need spies / air
  units / artifact systems / GDRs); dark-age policies; governor
  ESTABLISHMENT and promotions (governors are a stateless greedy
  ranking today); per-civ tech-era drift (eras are global 50-turn
  blocks).
- **B-25r. Victory tails:** every named Civ 6 victory exists on both
  engines; open is the seat-0 PROJECT-PRODUCTION path on the GPU
  (victoryType 3 can be preserved but not produced — the wire has no
  project/wonder columns for any seat, task #83), and the culture win's
  ~14× tourism gap (B-20r).
- **B-26r. Barbarian camp-spawn escalation** beyond the melee ladder
  (cliffs, ranged barbs and naval barbs all landed).
- **B-D. UNSOURCED DATA VALUES — a residual class, not one item.**
  Mechanics are sourced item by item; the DATA layer largely is not:
  files under cpu/data + cpu/core carry explicit `eyeballed` /
  `approximate` / `stand-in` markers on magnitudes (builtWonders,
  policies, improvements, wonders, units, resources, religion,
  projects, constants, cityStates, buildings, boosts, appeal, combat).
  A wrong CONSTANT passes every gate — both engines agree on the wrong
  number. Closing this is a sourcing sweep round: verify each marked
  magnitude against Civ 6 data, or record it as a deliberate
  stylization where the model genuinely diverges.

## The freeze backlog — what the first serve run must validate

Landed behind the compile bar only, in dependency order of suspicion:

1. The #104 wire verbs (tile buy kind 3, faith kinds 4/5/6, levy) and
   their candidate tripwires — including the B-18r apostle-lifecycle
   latent.
2. The #107 geo verbs (denounce/ally/rr-war/rr-peace on the wire, the
   decide-once-per-turn coupling).
3. serve_gate checkpoint/resume (#101) — exercise a resume against a
   fresh run before trusting it for diagnosis.
4. The storage renumbering + #109 city-block unification (one base per
   fact; `tile_city`, `centre_slot_at`, `city_dist_tile`, `city_wonder`,
   `city_prod_bank`, `civ_cap_tile`) — behaviour-preserving by intent,
   proven only by digests.
5. The protagonist relabel (#75) and the vocabulary purge (identifier
   renames, spelled storage families and kind tags) — behaviour-preserving by
   intent.
6. The seat-0 belief ACTIVATION (#73, B-18r) — seat 0 joins the RNG
   draw stream at row 0's loop position the first turn its faith
   reaches the pantheon cost, and every belief effect hook in the
   seat-0 walk goes live with it; the five belief facts + prophets
   now compare row-0 in the fatal digest. Plus the walk-entry border
   ySum fix (behaviour-CHANGING: the first border pick of every walk
   gains farm-adjacency food).
7. The GP-race body merge (slice 14) — ONE _advance_great_people(row,
   active) for every seat. Civ rows are transcription-identical; row
   0 SWITCHED accrual mechanism (tile-plane scan → the seat-axis
   registry) and claim shape (all-classes batch → per-class loops),
   both argued value-identical (slice 9's registry write-through
   invariant; integer effects). The serve run is the proof.
8. THE ID FLIP (#110 slices 1-2) — `tile_city` row-0 values are now
   persistent ids (found / border claim / both captures allocate
   `next_city_id++`), `owner` derives slot-of-tile from the id match,
   seat-0 routes store ids, and seat-0 routes die with their city.
   `tile.ownerCity` becomes a REAL byte-exact proof and `nextCityId`
   joins the fatal digest (gap dropped) — expect the FIRST divergence
   here if any creation path misses an allocation. Also
   behaviour-fixing: `C` now reads `rules.seats.maxCities` and the
   sim_init ghost capital (`alive[:, 0] = True` with no id, no site,
   no tiles — a format-1 remnant that would have crashed the format-2
   load at `C = len(f["cities"]) = 0`) is DELETED; t0 starts cityless
   on both engines.
9. THE SLOT REGIME (#110 slice 3) — append+stable-compact for every
   seat row, `city_seq`/`founded_n` deleted, ten order-coupled
   mirrors re-keyed to the column index. BEHAVIOUR-CHANGING in three
   places, each argued but unproven: (a) seat 0 no longer REUSES a
   hole on founding — a post-death founding lands at the append head,
   which is the TS push; (b) compaction now fires whenever ANY major
   row holds a hole (was: civ high-water threshold only), so civ slot
   indices move earlier than before — stable, so relative order is
   untouched, but any latent slot-keyed staleness surfaces here; (c)
   `centre_slot_at` re-maps on every compaction (the A-27(2) fix), so
   `center_at`'s two value-readers (`_seat_route_income`'s dest_slot
   gather, `_hostile_city_attack`'s slot arg) change answers wherever
   they were reading stale slots. The two capture sites carry a
   splice-now backstop and the founding path asserts its dense-layout
   precondition — a red assert there names the schedule position that
   broke it.

Hunt discipline: scripted-reachability first (the digest gate names the
turn), checkpoint-bracket from the nearest earlier checkpoint, full
fresh gate for any behaviour-changing fix. One battery at the round's
end, never per fix.
