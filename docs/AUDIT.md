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
  **SLICE 4 SHIPPED 2026-08-14 — THE WONDER FAMILY, EVERY SEAT.**
  Walking `computeCityStats` term by term against `_city_totals`
  turned up SIX terms the seat-0 walk never had and one neither walk
  had. Row 0 now pays, at the TS positions: PETRA over the worked set
  (the centre can never qualify — founding sets its district to
  CITY_CENTER, so TS's `!t.district` arm is dead there); the completed
  wonders' flat `cityYields` and the belief `faithPerWonder`, in the
  buildings bucket; the `cityYieldMult` product, LAST of the three
  scalings (tier → government yieldMult → wonders) and before
  maintenance; and `empireGrowthMult` (Hanging Gardens) in the growth
  chain. Every one of these is REACHABLE on row 0: seat 0 cannot queue
  a wonder (#83) but INHERITS the whole registry on capture
  (`sim_orders`' `wonder_reg[b, c_new, ...] = _t` rebuild), so a
  captured Petra/Ruhr/Big Ben paid on civ rows and nothing on row 0.
  The seventh, `wonderRegionalAmenities`, was missing from BOTH GPU
  walks: the rules export shipped `regionalAmenities` and nothing read
  it, on the stale premise that the Colosseum's Entertainment Complex
  is unplaceable — true, but the Great Bath (river, cost 90) and the
  Alhambra (hills + Encampment) reach, and both are buildable. It now
  joins the tier balance on every row AFTER the luxury grant, because
  `luxuryAmenities`' baseHave is buildings + regional BUILDINGS only.
  Three row-generic bodies carry it — `_completed_wonders(row)`,
  `_wonder_growth_mult`, `_wonder_regional_amenities(row, compw)` —
  and the civ walk, the civ amenity path and the civ growth loop were
  repointed at them, so the two rows cannot drift again.
  ASSOCIATION FIX found by the same walk: the civ growth loop folded
  Hanging Gardens into `gmul` (`X × (hg × mgrowth)`) where
  computeCityStats multiplies left to right
  (`(X × hg) × mgrowth`) — both engines now use the TS order.
  RESIDUAL: TS applies `cityYieldMult` in `city.wonders` BUILD order,
  the registry is keyed by wonder id and cannot express that, so two
  multipliers on the SAME channel in one city can associate
  differently (no such pair exists in the catalog today — Ruhr is
  production, Big Ben gold; a third would make it live).

- **A-28. Specialists were a GPU-ONLY decision — DELETED 2026-08-14.**
  Found in the same term-by-term read as A-27 slice 4, and the sharpest
  reminder yet that a comment is not a source: `_civ_city_specialists`
  opened with *"TS merges open specialist slots into the SAME ranking
  as the tiles and takes the top population"*, and the rules exporter
  shipped `specialistYields` under *"the GPU merges these into its
  worked-tile ranking so opponents assign specialists exactly as TS
  does"*. TS does no such thing. `assignWorkedTiles` ranks
  `workableTiles` only; `effectiveSpecialists` reads
  `city.specialists`, which ONLY `setSpecialists` — a UI verb — ever
  writes, so it is `{}` in every simulated game for every seat. The
  GPU was displacing worked tiles with slots whenever a slot's
  focus-weighted score beat the marginal tile: reachable at any
  Industrial Zone / Commercial Hub / Harbor (score 4) in a city
  working desert or tundra, and CERTAIN once a city's pop exceeds its
  owned workable tiles (the displaced key is then -1e18). Deleted
  rather than mirrored into TS: assigning a citizen is a CHOICE, and
  after #102 neither engine takes a choice without a wire record —
  the same ruling #98/#103 applied to envoys and to gold/faith. The
  greedy, `_spec_yields`, the `specialist_yields` rules field and the
  export key are all gone; TS keeps the manual verb and its tests.
  TO REOPEN THE MECHANIC: a wire column, beside #83's wonders and
  #97's district placement — not an engine rule.

- **A-29. ARTIFACTS paid seat 0 only — FIXED 2026-08-14.** The same
  term-by-term read, in the other direction: `artifactCulture` (+3
  culture per artifact, the buildings bucket) and `artifactTourism`
  were in seat 0's walk and its `_tourism_of` call, and in NEITHER civ
  walk nor the civ tourism call — the civ `_tourism_of` simply omitted
  the ninth argument. Reachable without an archaeologist: a seat-0
  city holding artifacts becomes a civ city on capture and on a
  loyalty defection (`sim_phase`'s `civ_city_artifacts[b, w_, slot] =
  artifacts[b, c]`), and from that turn on its artifacts paid nothing.
  Both civ walks and the civ tourism call now carry the term at the
  seat-0 positions. Checked clean in the same pass: housing (the civ
  batch has every `computeHousing` term; TS's district-housing loop is
  all-zero in the catalog, and the regional buildings seat 0 masks out
  of `bf_live` all carry housing 0), maintenance, trade, citizens,
  city-state envoy/suzerain, government yields and the golden
  dedication.

- **A-30. The feature STRIP sat on the wrong side of the drought floor
  — FIXED 2026-08-14.** `tileYields` reads `tile.feature` live at the
  terrain step and applies `max(0, food - 1)` LAST, so a chopped
  feature is gone BEFORE the floor. `_eff_food` floored first and every
  caller (`_eff_yields`, `_rcy_globals`) subtracted the stripped
  feature after, and the two do not commute: a stripped RAINFOREST or
  MARSH (both +1 food, both removable) on a 0-food terrain under
  drought floors to 0 and then goes to −1 where TS pays 0. The strip
  now happens at the top of `_eff_food`, `_eff_yields` strips columns
  1: only, and `_rcy_globals` takes `_eff_food()` unadjusted. Both
  walks were affected, so this was never a seat asymmetry — it was a
  shared construct error. Production and the static columns carry no
  floor, so subtracting after their overwrites stays exact.
  RESIDUAL, same family, NOT fixed: seat 0 adds farm-adjacency food
  post-selection, where `tileYields` adds it before the drought floor.
  Unreachable as written — the floor only bites at 0 base food and a
  FARM's own food is ≥ 1 — so it is a construct note, not a bug.
  **SLICE 7 (the same commit): `center_yields` and `center_raw_food`
  are DELETED.** With `_eff_food` TS-ordered, the seat-0 centre derives
  from `eff_y` at the site with the two floors last — the exact shape
  the civ walk uses, and the exact shape seat 0 already used on its
  belief branch. The stored pair could not express a belief add (the
  clamp was baked in at founding), needed a bespoke disaster patch for
  food, and went stale on anything else the centre tile did. Gone with
  them: the founding write, the capture-time `_init_center_live`
  rebuild, two `_MUTABLE` entries, two slot-permutation entries and two
  manifest exclusions. `_found_seat0_caches` is down to five statics
  plus the `workable` clear.

- **A-31. THE DISTRICT REGISTRY IS THE ONE READ (slice 8, 2026-08-14).**
  Every TS district consumer walks `city.districts`, a per-city LIST:
  `pillagedDistrictTypes(map, city.districts)`, `cityDistrictYields`,
  `cityMaintenance`, `completedDistrictCount`, `computeHousing`'s
  Aqueduct test, and `regionalEffects`' `citiesOf(state, seat)` →
  `other.districts`. The civ rows already read the registry
  (`city_dist_tile[:, row]`); seat 0 alone WINDOW-SCANNED the map —
  radius-3 tiles whose `district >= 0`, gated on `owner == slot`,
  `district_complete`, `~district_dead`. That gate is not in TS: a
  district belongs to the city that built it however the TILE's
  ownership churns. Seat 0 now reads `dist_tile` for adjacency yields,
  Holy Site adjacency, the Shipyard's Harbor, districtMaintenance,
  `completedDistrictCount` (both arms) and the Aqueduct, and
  `_pillaged_bf_live` is DELETED for `_bldg_dark(dist_tile)` — the
  shape-generic body the civ rows use, renamed out of civ vocabulary.
  The `~district_dead` arm is redundant, not wrong: capture rebuilds
  `dist_tile[b, c_new]` from `live_ring` (COMPLETE tiles only) and
  clears `district_dead` on exactly that set, so the registry already
  excludes the paved-but-dead ones. Merged with it, four more bodies
  collapse to one apiece: `_seat_regional(row)` (seat 0's inline
  regional-building loop DELETED), `_luxury_amenities(row, have, need)`
  (the civ's inline grant loop DELETED, ownership now `tile_seat ==
  row`), `_district_counts(row)` (`_civ_city_spec_count` DELETED), and
  `_seat_amenity(row, lux)` — THE amenity body, which absorbs the whole
  seat-0 inline half of `computeCityStats`' amenity walk and takes the
  frozen-luxMap contract as a parameter. `_city_totals` now calls it
  and casts the f64 factors back to `self.dtype`; the balance it sums
  is integer-valued, so the tier an f64 sum picks is the tier an f32
  sum picked. KNOWN LIMITATION, shared by every row and pre-existing:
  NEIGHBORHOOD is `allowMultiple: true` but the registry holds one tile
  per type, so `completedDistrictCount(false)` — the `housingIfDistricts`
  input — undercounts a second Neighborhood. Unreachable today (no
  `SCAFFOLD_DISTRICTS` entry, so no picker queues one), and Neighborhood
  HOUSING itself still rides the multiplicity-safe tile scan on both
  rows. The remaining seat-0 district window scans are OUTSIDE the yield
  walk (`sim_masks`' one-per-type and specialty-count legality,
  `sim_step`'s twin) — their own slice.

- **A-32. FOLLOWER beliefs were gated on the OWNER's claim on civ rows
  — FIXED 2026-08-14.** `B18_FOLLOWER_COUPLING_LIVE` is `true`, so
  `followerReligionForCity` returns the city's `followedReligion` and
  `withFollowerBelief` applies that religion's follower belief with NO
  test on who owns the city. The GPU's civ bodies gated every follower
  term on `_seat_has_beliefs(r + 1)` — the OWNER seat's own pantheon or
  follower claim — so a civ city converted to a religion its owner
  never founded drew none of it: `bldgY` (Feed the World / Choral
  Music), Work Ethic's Holy Site production, `faithPerWonder` (Divine
  Inspiration), `bldgH` (Religious Community) and Zen Meditation's
  amenities all read zero. Seat 0 had the right gate (`_bel_any`) all
  along, which is why the split only ever showed up as a CIV shortfall.
  One predicate now answers it for every row — `_follower_live(row)` =
  `_bel_any and (coupling or the seat's own claim)` — applied at all
  five sites in `_seat_city_yields_all`, `_seat_city_yields` and
  `_g5_hm`, with the PANTHEON/FOUNDER halves (the tile plane, `perF`/
  `perC`, `bldgY`'s Stewardship term, River Goddess) left on
  `_seat_has_beliefs`, which is what they key on. Uncoupled the two
  tests coincide, so this is inert until the flag — but the flag is
  already on.

- **A-33. ONE `_seat_housing(row)` — computeHousing + cityMaintenance
  (slice 9, 2026-08-14).** The third duplicate pair after the yield
  walk and the amenity half: seat 0 computed housing and maintenance
  inline in `_city_totals` while the civ rows used `_g5_hm`, a closure
  in the economy loop. Every term is dyadic (water 2/3/5, building
  housing integral, improvement housing 0.5), so the f64 sum the merged
  body takes IS the number the f32 seat-0 walk used to take — only the
  cast back to `self.dtype` matters. Bucket order now follows TS: water
  (+Aqueduct) → buildings (+beliefHousing) → river → improvements →
  housingAll → housingIfDistricts/newDeal. TWO PLANES DIED with it.
  `water_housing` [B, C] was written at founding from
  `fresh_water`/`coastal_land` at the site; `tile_wh` — the exported
  per-tile `hasFreshWater ? FRESH : isCoastalLand ? COASTAL : NONE`,
  which is the SAME derivation — is now read at the centre on every
  call, the civ rows' shape, so a captured centre needs no rebuild.
  `base_maintenance` [B, C] held `palace_maintenance` on the capital
  and 0 elsewhere; `BUILDINGS.PALACE` is cost-0 and `buildingMaintenance`
  returns 0 for cost-0 buildings, so the plane carried a CONSTANT ZERO
  in every game. The rule it stood for is now an `is_cap` term inside
  the shared maintenance sum — where TS keeps it, as the autoCapital
  PALACE entry in `city.buildings` — so it stays correct if the catalog
  ever gives the Palace a cost. Gone with them: two `_MUTABLE` entries,
  two `_SEAT0_SLOT_FIELDS` entries, two manifest exclusions (148 → 146
  planes, 25 → 23 excluded), four founding/capture writes, and the
  `fresh_water` [B, T] plane, whose only reader was the deleted water
  cache. `_init_center_live` is now `_seat0_coastal_at` and does one
  thing. `_found_seat0_caches` is down to `coastal` / `river_center` /
  `dist` plus the centre `workable` clear.

- **A-34. `workable` was a THIRD name for `!isImpassable` — DELETED
  2026-08-14.** `workableTiles` filters on `tileBelongsTo && index !==
  centerIndex && !district && !builtWonder && !isImpassable`. The civ
  walk spells that out; row 0 spelled it out too AND gated on a mutable
  `workable` plane exported as `!isImpassable(t) && !t.district` — a t0
  snapshot of a live fact, whose `!t.district` half never updated
  (the walk re-tests `district < 0` live) and whose one mutation was
  the founding `workable[site] = False`. That clear is redundant twice
  over: the own city's centre is already excluded by `tiles != site`,
  and a NEIGHBOUR's centre by `owner == slot` (a centre tile registers
  to its own city). Seat 0 now reads `work_ok` — the same
  `!isImpassable` the civ rows read — and the plane, its `_MUTABLE`
  entry, its manifest exclusion and its exporter field are gone
  (146 → 145 planes, 23 → 22 excluded).

- **A-35. ONE `_seat_route_income(row)` — seat 0 gains MESSENGER OF THE
  GODS, and specialtyDistricts becomes a registry read — 2026-08-14.**
  `cityTradeYields` is one body in TS for every seat; the GPU had two,
  and the seat-0 copy was missing the enhancer belief's
  `tradeReligionYields` on domestic routes. `civ_enhancer[:, 0]` is a
  live plane (seat 0 claims beliefs through the row-generic body since
  #73), so seat 0 could hold the Messenger and be paid nothing for it —
  REACHABLE, and a freeze-lift hunt target. Two more fixes ride along:
  `specialtyDistricts` walks `city.districts`, so the dest bonus is a
  DISTRICT REGISTRY read on both the origin row (row 0 scanned tiles)
  and a foreign international destination (BOTH bodies scanned tiles,
  O(B·K·T)); and `routeRaidedAt` is ONE predicate — `isBarbSeat(u.seat)
  || (u.seat !== seat && civsAtWar(u.seat, seat))` — which
  `_route_raided_near(row, tiles)` asks of the war matrix, whose false
  diagonal drops the row's own units without a special case. The
  seat-0/civ hostile-arm split and the `seat0_arm=False` optimisation
  are gone; the `unitsMode` early-return (row 0's, absent on civ rows)
  is kept because TS has it. The intl DEST resolves by tileBelongsTo's
  own pair — the centre tile's `(tile_seat, tile_city)` against the
  block registry — so one expression serves every dest seat, and the
  known captured-dest corner (the dest is a TILE, not `(toSeat,
  toSeatCity)`) now reads identically on every row. `_expire_seat_routes`
  merged the same way.

- **A-36. THE WALK IS ONE BODY — `_seat_city_walk(row, j)` — 2026-08-14.**
  `_city_totals` (row 0, `[B, C, 6]`, engine dtype), `_seat_city_yields_all`
  (civ, six `[B, RC]`, f64) and `_seat_city_yields` (civ, per-j, `[B]`)
  were three transcriptions of `computeCityStats`. They are now three
  thin wrappers over one f64 body that takes a seat ROW and an optional
  single COLUMN. What the merge settled:

  - **BUCKET ORDER.** TS sums `tiles + districts + buildings + citizens
    + bonuses + trade`, then scales tier → `m.yieldMult` → wonder
    `cityYieldMult`, then `total.gold -= maintenance`. NEITHER old body
    had it: row 0 added great works / artifacts / golden-pen / relics
    (buildings-bucket terms) AFTER citizens, and the civ walk added
    citizens LAST of everything. `CITIZEN_CULTURE` is 0.3 — the only
    non-dyadic term in the walk — so those positions are worth a ulp of
    culture each, and a ulp of culture flips a border-growth `ceil`.
    Every bucket now accumulates on its own and joins the total once,
    which is also why `bonuses` is pre-summed rather than added in five
    pieces.
  - **MAINTENANCE.** `computeCityStats` returns gold NET of
    `cityMaintenance`; row 0 subtracted it, the civ walk did not and the
    economy loop subtracted it afterwards. That left `civ_empire_score`
    reading PRE-maintenance gold where `empire_score` read post — a real
    scoring divergence on every civ seat. The walk subtracts it for
    every row and the loop's `- maint_j` is gone.
  - **workableTiles.** `tileBelongsTo(t, city)` is `tileSeat(t) ===
    city.seat && tileCity(t) === city.id` — ONE pair on every row now
    that `tile_city` holds persistent ids (#110 slice 2). Row 0's
    `owner == slot` + `dist <= 3` and the civ's `civ_at == r` +
    `center_at`/`civ_city_at` decomposition both collapse into it; the
    remaining tests are TS's own four.
  - **TILE CONTEXT.** Row 0 scored candidates off `_eff_yields()` with
    farm adjacency added AFTER the weighted sum; TS applies farmAdjTier
    inside `tileYields`, so it belongs in the food plane before the
    weight — the civ composition. Row 0 now takes it, along with the
    f64 focus weights and the `s * 1e6 - index` tie-break.
  - **NON-DYADIC FALLBACK.** The `not _dyadic_fp` branch summed only
    food/production/science/culture in BOTH bodies — worked-tile gold
    and faith were silently dropped. It loops all six now. Dead code in
    every shipped world (all yields are dyadic), live if one ever is not.
  - **`districts_on`.** Row 0 summed building yields whatever the
    district catalog held; the civ walk gated them behind
    `districts_on`. Building yields are building-keyed, so the gate is
    gone.
  - Deleted with the two bodies: `_ct_cache` (row 0's walk-scoped
    sub-term store, and with it a follower-freshness argument),
    `_score_cache`, and `_b_local_f`. The walk runs f64 on every row and
    casts on return, so there is no walk-dtype building mask left.

  KNOWN AND NOT FIXED HERE: the walk calls `_seat_housing(row)` for
  maintenance while `_city_totals` / `_g5_hm` call it again for housing
  — two cheap passes, left for #81 rather than a new memo with a new
  staleness surface.

- **A-37. ONE `_seat_border_growth(row, col)` — and row 0's 4-claim cap
  goes — 2026-08-14.** Cultural border growth was a `_seat_border_growth`
  for civ rows and an inline block in `step()` for row 0. Merged onto one
  body that takes a seat ROW and a per-batch COLUMN tensor (row 0 walks
  its columns in TS array order, a per-batch permutation, so a fixed slot
  index could not serve it). Three fixes ride along:

  - **`BORDER_LOOPS = 4` DELETED.** TS's claim loop is an unbounded
    `while`; the civ body loops 64 and row 0 stopped at 4. A city that
    could afford a 5th claim in one turn got it on a civ row and not on
    row 0. Every row now runs the civ bound.
  - **`tileClaimed(t)` is `tileSeat(t) !== NO_SEAT`** — ONE plane, not the
    three-way `owner < 0 && citystate_at < 0 && civ_at < 0` both bodies
    spelled out. `_seat_tile_unclaimed` is that one test now, and it also
    serves the gold tile purchase.
  - **The adjacency test is `tileBelongsTo(n, city)`** — the same
    (tileSeat, tileCity) pair the work window uses. Row 0 matched
    `owner == slot` (its slot plane), the civ matched `civ_at == r &&
    tile_city == id`; both collapse into `_seat_tile_adj_city(row, ...)`.

  INVALIDATION, unified: a claim bumps `_claim_version` (row 0 used to
  bump `_eff_version`, the civ bumped `_claim_version` only when the spot
  landed in a LATER same-row window). `step()`'s row-0 recompute guard now
  keys on `(_eff_version, _claim_version)`, which is what makes the
  `_eff_version` bump unnecessary — a claim moves ownership, never a tile
  yield. The civ's conditional refinement is gone with it: a claim now
  always invalidates the batched walk for the columns after it, which is
  correct and slower. Recorded for #81, not re-derived here.

  `_seat_border_key` is row-generic (its dead `_bmul` local went too), so
  the culture claim, the gold tile purchase and the wire's tile-buy
  candidate all build ONE pick key from ONE plane composition.

- **A-38. THE SEAT LOOP IS ONE BODY — `_seat_row(row)` — 2026-08-14.**
  `_seat0_row` is deleted; `_seat_phase` calls `_seat_row(0)` and then
  `_seat_row(r + 1)` per civ. Every rule in a seat's turn now has one
  transcription: `_ww_decay`, `_detect_seat_boosts`,
  `_seat_influence_phase`, `_seat_quest_phase`, `_seat_record_apply`,
  `_seat_buy_ladder`, `_seat_trade_phase`, `_seat_city_stats`,
  `_seat_governor_seats`, `_seat_city_loyalty`, `_seat_city_growth`,
  `_seat_city_produce`, `_seat_border_growth`,
  `_seat_city_fire_and_heal`, `_seat_loyalty_flips`,
  `_seat_research_tail`, `_seat_war_peace_tail`.

  What is still seat-0-shaped is WIRE-level, not rule-level: `step()`'s
  action interface, and the unit-order REPLAY position (row 0's triples
  apply pre-turn, a civ's per-unit rows apply in-phase). TS carries the
  same fork — `if (recU && actor.seat !== 0)` — and it is #108.

- **A-39. THE CITY-STATS SNAPSHOT is the rule, on every row —
  2026-08-14. BEHAVIOUR CHANGE, hunt-watch.** `seatPhase` fills a
  `cityStats` map for every one of the seat's cities BEFORE its loop and
  reads it inside (`cityStats.get(city.id)`), so a completion, a border
  claim or a growth landing at column j does NOT reach column j+1's
  yields, housing, amenity tier or growth factor that turn. Real Civ 6
  agrees: a turn's yields bank off the state the turn opened with, and a
  building finished this turn pays from the next one.

  Both GPU rows instead recomputed mid-walk behind an
  `(_eff_version, _claim_version)` key — row 0 through `_city_totals`
  plus a `_pop_dirty` flag and a frozen `lux` parameter, the civ rows
  through `_rcy_all_cached` plus a per-j escape hatch for capital columns
  under beliefs. That modelled game.ts's endTurn city loop, which no
  longer exists (endTurn holds only the global schedule). One
  `_seat_city_stats(row)` returns computeCityStats' own fields — total,
  effectiveFoodSurplus, growthNeeded, amenity tier — once per seat block.
  `_rcy_all_cached`, `_last_lux`, `_seat_amenity`'s `lux` parameter and
  `_city_totals`' recompute role are all gone; `_city_totals` survives as
  the post-phase readers' view.

  The empireGrowthMult and Fertility-Rites factors fold into
  `effectiveFoodSurplus` at their place in computeCityStats' left-to-right
  chain, which is what retires the `gw_cache` invalidation and the two
  per-row belief hoists.

- **A-40. Seat 0 could not COMPLETE a wonder or a project.**
  `_apply_seat_production` has queued wonders and projects on every row
  since the mask gained those columns, but row 0's per-city block knew
  only settlers, units, buildings and districts: a completed seat-0
  wonder cleared the head, banked the overflow, and was never registered
  in `built_wonder_complete` nor paid its era score; a completed seat-0
  project paid no yield, no great-person points and no space-race step.
  `_seat_city_produce(row, col, act, prod)` is the one completeQueueItem.
  It also zeroes `city_cost` on completion, which row 0 did not — a
  compared digest field, since TS reads 0 off an empty queue.

  Smaller things the same merge settled: the civ encampmentProdMult had
  no `_encamp_didx >= 0` guard (with no Encampment in the catalog every
  building whose requirement is -1 would have taken the multiplier); the
  Builder/Military-Engineer civilian spawn split was unnecessary
  (`_spawn_unit` reads the roster's civilian bit itself); `prod_sum` in
  the economy loop accumulated and was never read.

- **A-41. Loyalty, three disagreements.** `_seat_governor_seats`,
  `_seat_city_loyalty` and `_seat_loyalty_flips` replace row 0's batched
  `_apply_loyalty_and_flips` and the civ arm's inline block.
  (1) A civ CAPITAL pinned to loyaltyMax unconditionally, where
  `applyLoyalty` puts the pin AFTER the "somebody ELSE holds a city"
  guard — with no other seat holding a city nothing moves, pin included.
  (2) A flip could go to a roster slot with no SEAT: `flipCity` scans
  `state.seats`, so a non-existent civ is not a candidate; the civ arm
  gave it a real 0 pressure, which beats the `best = -1` sentinel and
  wins an uncontested defection. A seat that EXISTS and holds no city
  still exerts 0 and still wins — that is TS's own scan.
  (3) Row 0 computed pressures in the engine dtype, the civ rows in f64.

  Row 0's batched pass had to reconstruct "cities earlier in the loop
  already grew" with an `earlier` matrix mixing live and pre-loop pops.
  At the per-city position the live read IS the rule and the matrix is
  gone.

- **A-42. The war/peace counters were never seat-specific.** seatPhase's
  tail is `if (atWarWithAny(actor)) { if (civsAtWar(actor, seat))
  warTurns += 1 } else { peaceTurns += 1 }`.
  `_seat_war_peace_tail(row, active)` reads both off the war MATRIX:
  `war[:, row, 0]` is war with WAR_COLUMN_SEAT and
  `war[:, row, :1 + R].any()` is atWarWithAny over the majors. Row 0
  needs no rule of its own — its column against itself is structurally
  False, which is exactly why `civsAtWar(state, 0, 0)` never fires. Also
  closed here: an eliminated seat drained its RECORD stash but not its
  BUY stash, so a spending intent named on the turn a seat lost its last
  city would have fired on a later turn.

- **A-43. THE OBSERVATION IS ONE RENDERER — `observe(seat)` — 2026-08-14.**
  `_observe_civ` is DELETED; `observe` and `_ctx_block` take the seat's ROW
  and read nothing that names a particular seat, the twin of
  `cpu/core/observe.ts`'s one `observeSeat`. `masks()` lost both arms too:
  every seat goes through `seat_masks(row)` + `_seat_unit_mask(row)`.

  **SIX DIVERGENCES the merge forced a decision on. Each was settled against
  the TS source, and each moves numbers — hunt-watch at freeze lift:**
  1. **A civ seat's `envoy` mask was hardcoded all-False**, under the comment
     "civ seats have no envoys". False: `_seat_influence_phase` banks
     influence on every row and `_seat_record_apply` spends it on any row.
     `seat_masks` now returns `_seat_envoy_mask(row)`.
  2. **The quest column rendered 0 for civ seats**, under the comment "quests
     are a seat-0 mechanic, and TS renders 0 for civ seats too". Also false:
     `questFor(cityState, seat)` reads a SEAT-KEYED store and
     `seatPhase` issues on every row (phase.ts, "#96: one issuer, every
     seat"), exactly as `seat_citystate_quest[:, row]` does.
  3. **`esc[1]` (settlerCost) was zeros for a civ seat** where
     `observeSeat` calls `settlerCost(state, seat)` live. The escalator now
     rides `_seat_settler_cost(row)` — the same body the BUY LADDER pays
     from, so price-paid and price-seen cannot drift.
  4. **A civ seat's `unitCap` counted only its war with WAR_COLUMN_SEAT**
     where TS's term is `atWarWithAny(state, seat)`. One `at_war` term now
     feeds both ctx[4] (unitCap) and ctx[11] (atWarAny), read off this row's
     line of the war matrix over the majors.
  5. **ctx[5] `oppStr` was ZERO for seat 0 and TS rendered max-over-others
     for everybody.** `pick_war` compares own strength against the seat it
     DECLARES on, so the field is the PAIR seat's strength: TS now renders
     `seatStrength(state, CTX_PAIR_SEAT)` (0 on that seat's own row, as the
     GPU always did), and ctx[8] `gang` reads the OPPONENT's warmonger
     rather than the asker's own.
  6. **ctx[12] `oppHasCities` read the ASKER's cities** —
     `seatOf(state, seat)!.cities.length`, a self-comparison against a field
     `ladder.CTX_FIELDS` documents as "the opponent holds any city". It is
     CTX_PAIR_SEAT's city count now, which is what the GPU rendered.

  Smaller things settled by the same merge: seat 0's queued-settler and
  queued-unit counts now gate on a LIVING city (TS reduces over
  `seat.cities`); the opponent block renders R columns for every asker,
  where both old arms mis-sized it at R = 0; owned-tiles is ONE derivation
  off the (`tile_seat`, `tile_city`) pair; and the DEAD `obs_size` property
  is gone (it claimed 14 empire and 9 per-city fields where the layout has
  15 and 10, and carried no escalator, research-cost or ctx block at all
  — `policy/ladder.py`'s widths are the one layout definition).

- **A-44. `seatProximity` measured a seat against ITSELF.** It took one
  `Seat` and used `seatOf(state, actor.seat)` for the far side too, so it
  returned 0 for anybody holding a city and Infinity otherwise — the DoW
  policy's `prox <= 9` gate was therefore satisfied by every seat with a
  city, whatever the map. It takes two seats now
  (`seatProximity(state, CTX_PAIR_SEAT, seat)`), which is what the GPU's
  pair-distance twin always computed. **BEHAVIOUR CHANGE on the TS side of
  the DoW verb, hunt-watch.**

- **A-45. THE ENCAMPMENT ROLL KEY, and two phantom keys.**
  `encampmentDefense` returned `owner.seat === 0 ? 'penc' : 'renc'` and the
  GPU mirrored it with FOUR `_damage_roll` calls under two disjoint owner
  masks. An Encampment is fought the same way on every seat's territory —
  the defense floor is already one row-generic read — so it is one
  `'enc'`/`'encc'` pair on both engines, two rolls, and
  `encampmentDefense` no longer returns a key at all. `WW_BATTLE_KEYS` also
  drops `pcty`: `_assault_city` has been one body since the city-assault
  merge and NEITHER engine issues that key.

- **A-46. `_theological_combat` was a mirror of a rule TS does not have.**
  The GPU body walked every APOSTLE slot resolving religious combat; it had
  no caller, and `theologicalCombat` does not exist in `cpu/` at all (only
  the data — `religiousStrength`, the martyr-relic prose — survives).
  Deleted. Theological combat is now recorded as a B-side gap on BOTH
  engines rather than as GPU machinery pretending to mirror something.

- **A-47. THE t0 TILE-OWNERSHIP PAIR (`ownerSeatInit` / `ownerInit`),
  fixture FORMAT 3.** `planes.ts` exported `tileSeat(t) === 0 ? tileCity(t)
  : -1` — seat 0's half of the pair — and the GPU inferred `tile_seat = 0`
  wherever it was set, so a civ's or a city-state's t0 ring had no way
  through the wire. Both halves ship now, one plane each, and `tile_seat`
  loads straight off `ownerSeatInit` with no per-class arm.

  **THIS ALSO CLOSES A LIVE BREAK.** The per-tile city-state key was
  renamed `cs` -> `cityState` by the vocabulary purge (6894513) while the
  GPU still read `t.get("cs", -1)` — so on any re-exported fixture the GPU
  would have started with NO city-state territory at all, and every
  CS-territory rule would have diverged from turn 1. Nothing caught it
  because the freeze has run compile-only since. The key is gone entirely:
  `ownerSeatInit` carries the city-state rings.

- **A-48. THE REMAINING SEAT-0 DISTINCTIONS, in full.** After A-38..A-47 the
  list is short and every entry is WIRE or POLICY, never a rule:
  (1) `step()`'s action interface and the unit-order REPLAY position (row
  0's triples apply pre-turn, a civ's per-unit rows in-phase) — #108, and
  TS carries the same fork as `actor.seat !== 0`;
  (2) WAR_COLUMN_SEAT: the wire carries ONE war axis, so a civ row's war
  head declares on / sues to that seat while that seat's head names WHICH
  civ. `seat_masks` forks there and nowhere else;
  (3) CTX_PAIR_SEAT: the same one-axis limit in the observation, and the
  reason the DoW sextet is zero on that seat's own row (both engines say so
  in the same words);
  (4) `policy/drive.py`'s `_prod_ctx` city CAP — seat 0 expands to the
  world's physical slot count, a civ stops at the ladder's `maxCities`
  heuristic. POLICY, not a rule: both engines replay the same recorded
  decisions, so it moves trajectories and never parity.

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
  compare row-0 in the FATAL digest (gap keys removed). The
  completed-wonder family that was missing here (`_wond_cy`,
  `_wond_grow`, `fpw`) SHIPPED 2026-08-14 — see A-27 slice 4.
  Until religious-unit production wires up, seat 0
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
- **B-27r. THEOLOGICAL COMBAT is absent from BOTH engines.** Real Civ 6
  resolves religious combat between apostles/missionaries on religious
  strength, and the loser dies; ours never fights — a religious unit is
  only ever killed by ordinary combat or by expiry. The data is all
  present and inert (`religiousStrength` on the roster, the martyr-relic
  rule in greatPeople.ts, the relic/tourism constants), so this is a
  missing RESOLVER, not a missing model. Recorded on A-46's deletion of the
  GPU's caller-less mirror: until TS grows the rule there is nothing for
  the GPU to mirror.

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

10. THE SEAT LOOP (#51 slices 5g-5j, A-38..A-42) — the biggest
   behaviour-changing block in this backlog, four items:
   (a) **The city-stats SNAPSHOT (A-39).** No row recomputes its
       economy mid-walk any more. Every seat's yields, housing,
       amenity tier, effective food surplus and growth need freeze at
       its loop top. Expect this to move numbers on BOTH engines' civ
       rows and seat 0 alike; the TS oracle already had it.
   (b) **Seat 0's cities stopped firing and healing TWICE (5g).** TS's
       `barbarianPhase` ran a second walls strike, Encampment strike
       and +40 heal over seat 0's cities on top of the seatPhase
       block. Both copies are deleted; the seat-0 heal per turn HALVES
       and its two strike draws MOVE a phase later. RNG-stream
       affecting.
   (c) **Row 0 grows before it builds (5g)**, and its wonder/project
       completions now actually land (A-40) — the second is only
       reachable if the driver picks those columns, so measure REACH.
   (d) **The loyalty pin/flip fixes (A-41)** change who receives a
       defection in a roster with a non-existent civ slot, and stop a
       civ capital pinning in a one-seat world.

11. THE OBSERVATION AND THE WIRE (A-43..A-47) — **FIXTURES MUST
   REGENERATE FIRST: the format is 3 and the loader refuses a 2.**
   (a) **The six observation divergences (A-43)** all move what the
       ladder decides, on whichever seat they touched: a civ seat can
       now court city-states through the mask, sees its quests and its
       real settler price, and stops over-counting its unit cap; seat 0
       and TS agree on oppStr / gang / oppHasCities for the first time.
   (b) **`seatProximity` (A-44)** was returning 0 for every seat with a
       city, so the DoW proximity gate was a no-op on the TS side.
       Expect DIFFERENT wars, not just different numbers.
   (c) **The Encampment roll key (A-45)** is a LOG tag, so the stream is
       unmoved — but the GPU dropped from four masked rolls to two, and
       `_ww_audit` now proves the one-key form against WW_BATTLE_KEYS.
   (d) **City-state territory at t0 (A-47)** was about to vanish from
       every GPU world. The first serve run is the first thing that can
       see it; if CS tiles read empty at t0 on the GPU, the pair is not
       reaching `tile_seat`.

Hunt discipline: scripted-reachability first (the digest gate names the
turn), checkpoint-bracket from the nearest earlier checkpoint, full
fresh gate for any behaviour-changing fix. One battery at the round's
end, never per fix.
