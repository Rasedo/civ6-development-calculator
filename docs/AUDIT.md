# Engine audit — open items

THIS FILE IS A LIST OF OPEN ITEMS. Nothing else belongs in it. A
resolved entry is DELETED, not annotated — what was fixed, when and why
is the git log's job, and duplicating it here is how three audit
generations grew thousands of lines nobody could read. Everything below
is open work, stated against the current engine by symbol, plus the
freeze backlog the first serve run must validate.

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
behind a flag.

## Completion estimate (owner-requested; guesstimates)

Hand-weighted 1–8 by implementation size; partial items carry
fractional credit. Chapters C/D/E/G closed in full and dropped.

| Chapter | Weight | Done | % |
|---|---|---|---|
| A symmetry | 42 | 41.55 | **99%** |
| B fidelity | 91 | 88.44 | **97%** |
| Closed chapters (C/D/E/G) | 62 | 62 | 100% |
| **Overall** | **195** | **191.99** | **98%** |

DELTA LEDGER — apply every change to the table in the same commit that
makes it, or the table drifts from the entries it counts (it has, four
times). #111: A-26 (weight 2, 1.33 done) LEFT chapter A for chapter B as
B-28r, since what survives of it is shared rather than seat-shaped;
A-31r closed 3 of its 4 sub-items (+0.75 A); A-32r and A-33r are new and
open (+2 A weight, +0 done); B-29r is new and open (+1 B weight). The
percentages FELL: this round closed less than it found, which is the
number doing its job. #112: A-33r's SEAT half closed — the two arms are
one — leaving only its fidelity question (+0.5 A done). Nothing else moved
weight: the four live divergences #112 found had never been entries,
because nothing had ever looked for them. #113: A-32r CLOSED (+1 A done);
A-33r CLOSED — its fidelity question was verified against a real Civ 6
source and fixed on both engines (+0.5 A done); A-31r lost its ACTION
INTERFACE half (+0.13 A done), leaving the wire's record SCHEMA; A-34r is
new and open (+1 A weight, +0 done). #114: A-34r CLOSED in the round after
it opened — `placeSeats` takes the append position, `seatOfIndex` and
`indexOfSeat` are deleted, and no `cpu/` body converts between numberings
any more; `makeYieldCtx` takes the asking seat (+1 A done).

THE TABLE ABOVE IS NOW WRONG, and by construction: 41.55 + 1 = 42.55
against a chapter weight of 42. The delta chain overshot its own ceiling —
the fifth drift, and this time the arithmetic says so out loud rather than
hiding behind a fresh entry's weight. DO NOT patch it with another delta.
The next round to touch chapter A must RECOMPUTE the row from the open list
(A-9r, A-11r, A-27r, A-28r, A-29r, A-30r, A-31r — seven items), re-weight
those seven 1-8 by implementation size, and set done = weight - open. A
running ledger that can exceed 100% is not measuring anything.

## A. Seat symmetry — open

- **A-9r. NEIGHBORHOOD district.** The one district the 9-wide scaffold
  still lacks (URBANIZATION civic unlock, appeal-tier housing). Ordinary
  district plumbing on both engines — the appeal plane exists.
  Related, and blocked on the same work: the district registry holds ONE
  tile per type, so `completedDistrictCount(false)` undercounts a second
  Neighborhood (`allowMultiple: true`). Unreachable while no
  `SCAFFOLD_DISTRICTS` entry exists to queue one.
- **A-11r. Trade-route tails.** (1) The international leg was
  gate-unreachable under the old decisions — re-measure at the hunt, the
  exploration gating changed the candidate set. (2) No seat's wire carries
  a trade-route DECISION: route creation is an eager rule, and a route verb
  is P8-surface work. (3) No physical Trader unit — routes lay roads
  (`layTradeRoad` / `_lay_trade_road`) but nothing walks, so a route cannot
  be plundered en route. (4) GPU intl dests are stored as TILES, so a dest
  captured by another major keeps paying until expiry where TS's
  (toSeat, toSeatCity) filter drops it. Route-store schema change.
- **A-27r. Seat-0 district window scans OUTSIDE the yield walk.**
  `sim_masks`' one-per-type and specialty-count legality and `sim_step`'s
  twin still scan seat-0 district windows in their own shapes. Their own
  slice.
- **A-28r. SPECIALISTS are not a mechanic on either engine.** TS only ever
  writes `city.specialists` from `setSpecialists`, a UI verb, so it is
  `{}` in every simulated game; the GPU's greedy assignment was deleted
  rather than mirrored, because assigning a citizen is a CHOICE and neither
  engine takes a choice without a wire record. TO REOPEN THE MECHANIC: a
  wire column, beside #83's wonders and #97's district placement — not an
  engine rule.
- **A-29r. `cityYieldMult` cannot express BUILD order.** TS applies it in
  `city.wonders` build order; the GPU registry is keyed by wonder id and
  cannot, so two multipliers on the SAME channel in one city could
  associate differently. No such pair exists in the catalog today (Ruhr is
  production, Big Ben gold) — a third would make it live.
- **A-30r. Farm-adjacency food is added post-selection** (every row —
  `_rcy_food_plane` takes the row's own civics/techs), where
  `tileYields` adds it BEFORE the drought floor. Unreachable as written
  (the floor only bites at 0 base food and a FARM's own food is >= 1), so
  it is a construct note, not a live bug.
- **A-31r. THE SEAT-0 RECORD SCHEMA.** What is left is the WIRE's own
  shape, in `serve_gate`'s hand-rolled `recs["0"]` and TS's matching
  `actor.seat !== 0` in `seatPhase`: seat 0's production rides
  `[centreTile, code]` pairs and its units `[tile, verb, isCivilian]`
  triples, where every civ row sends per-unit ranks. The schema decides
  WHERE the orders execute — row 0's pre-turn, a civ's at the walkers'
  position in the phase — so the two cannot be merged without moving the
  combat DRAW positions. Task #108, and after #114 the checker's allowlists
  hold NOTHING ELSE: four sites, two per engine, all four this same fact —
  `serve_gate`'s two `recs["0"]` blocks, `seatPhase`'s `actor.seat !== 0`,
  and the serve client's seat-0 candidate rows in `driver.ts`.
  The ACTION INTERFACE half closed in #113: `step()` takes no seat
  arguments at all now, every row's choices arrive through
  `apply_seat_actions` + `_apply_seat_unit_actions`, and `seat_ext` is set
  for every major row rather than row 0 alone.
  A CAUTION THAT HAS EARNED ITS PLACE. This entry has twice claimed the
  distinction was down to one thing, and twice been wrong — because the
  instrument only matched what it was taught. #111's checker matched
  ADJACENT TOKENS (`row == 0`) and missed every fork written as an
  EXPRESSION (`civ_techs[:, 0]`, `city_center[:, 0]`); #112 taught it those
  and closed four live rule divergences, then claimed the class closed on
  the strength of a GPU-only census; #113 taught it TypeScript and found
  three more in `cpu/`, plus a `[0] + [r + 1 for r in seats]` in the gate's
  own single-seed path that skipped seat 1 and asked for a seat that does
  not exist. Claim only what the instrument measures, and measure both
  engines.

## B. Fidelity vs real Civ 6 — open residuals

- **B-17r. Encampment:** ranged-vs-district strikes are out of scope,
  matching the ranged-vs-city scope-out. The rest of the district
  (`encamp_hp` pool, movement block, garrison pool, district strike,
  training XP) is complete.
- **B-18r. Religion tails.** The mechanic is complete on every seat
  (pantheon/founder/enhancer races, pressure, missionaries, apostles,
  theological combat, worship buildings, faith buys on the wire — and
  faith is the only way to a religious unit in real Civ 6 too, so the
  absence of a production column is faithful, not a gap).
  KNOWN LATENT: a religious-unit lifecycle drift becomes
  reachable the moment the driver emits faith-buy kind 6 — expect it at
  its causal turn in the first post-freeze serve hunt.
- **B-20r. Tourism tails.** Tourism, Great Works of writing/music/ART,
  relics, artifacts + archaeology (Archaeologist, antiquity sites,
  museum slots) and the wonder-era term all exist and are digest-
  compared. Open: NATIONAL PARKS (no concept); civ seats never PRODUCE
  an Archaeologist (seat-0-only so far — the production-wiring tail);
  recorded-not-modeled: theming bonuses, shipwreck excavation, trading
  works between civs, open-borders digs. The martyr-relic overstatement
  (~7x) is B-27r(3). MEASURED consequence: visiting tourists peak ~7 vs
  ~97 domestic at t250, so the culture victory is live-but-unreachable by
  ~14x until these close.
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
- **B-27r. Theological-combat simplifications.** The resolver runs on both
  engines (`theologicalCombatPhase` / `_theological_combat_phase`). What
  deviates from real Civ 6: (1) it is DETERMINISTIC — real Civ 6 rolls, ours
  takes theoBaseDamage plus the strength difference with no RNG multiplier,
  because a conditional draw would have to be mirrored draw-for-draw across
  engines; (2) only APOSTLES initiate — real Civ 6 also allows Inquisitors,
  which we do not model; (3) promotions are unmodeled, so EVERY fallen
  apostle martyrs into a relic where real Civ 6 needs the MARTYR promotion,
  an OVERSTATEMENT of relic frequency (see the RELIC_* comment in
  data/greatPeople).
- **B-28r. THE NAVAL PRODUCTION SURFACE is one heuristic column.** Not a
  seat asymmetry any more — `_seat_production_mask` runs for every row, and
  the naval BAN it used to carry on row 0 is gone. What is left is shared
  and unfaithful: `ok_u` masks out every hull (`~unit_naval`) and a single
  hand-rolled GALLEY column (`_galley_idx`, sim_seats.py) is added back,
  legal only while the seat owns zero naval units live or queued. Real Civ
  6 offers whatever `trainableUnits` allows in a naval-capable city, with
  no one-ship cap. The fix is to drop `~unit_naval` and let the capability
  gate that already rides in `tr_j` answer, deleting the galley column —
  a behaviour round that needs the serve gate live. Same family as #83
  (projects/wonders): a SHARED action-surface gap, not a seat one.
  REACHABILITY: no seat fields a second ship in driven games, so every
  naval rule past the first hull is poke-covered only.
- **B-29r. No peace-treaty cooldown.** Real Civ 6 binds a peace treaty for
  a fixed term — a seat that just made peace cannot re-declare on that
  opponent for ~10 turns. Neither engine models it: `_apply_war_column` /
  `makePeace` reset the pair clock and the declare column reopens the very
  next turn, so a rich seat can thrash war→peace→war on one opponent. The
  clock to gate on already exists per-pair (#111 s5's `war_turns`); what is
  missing is a per-pair PEACE stamp beside it.
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

Nothing below this line has run against the gate. **Regenerate first:
`npm run seed && npm run export` — the fixture format is 3 and the loader
refuses a 2.** In dependency order of suspicion; git log carries what each
change was, this is only what to CHECK.

**Behaviour-preserving by intent, proven only by digests:**
1. The #104 wire verbs (tile buy kind 3, faith kinds 4/5/6, levy) and their
   candidate tripwires, including the B-18r apostle-lifecycle latent.
2. The #107 geo verbs (denounce / ally / rr-war / rr-peace on the wire, the
   decide-once-per-turn coupling).
3. serve_gate checkpoint/resume (#101) — exercise a resume against a fresh
   run before trusting it for diagnosis.
4. The storage renumbering + #109 city-block unification (`tile_city`,
   `centre_slot_at`, `city_dist_tile`, `city_wonder`, `city_prod_bank`,
   `civ_cap_tile`), the #75 relabel and the vocabulary purge.

**Behaviour-CHANGING — expect the digest to move, and read it before
calling it a bug:**
5. Seat-0 beliefs (#73, B-18r): seat 0 joins the RNG draw stream at row 0's
   loop position the first turn its faith reaches the pantheon cost. Also
   the walk-entry border ySum fix (the first border pick of every walk gains
   farm-adjacency food).
6. The GP-race merge: row 0 SWITCHED accrual mechanism (tile-plane scan ->
   the seat-axis registry) and claim shape (all-classes batch -> per-class
   loops). Both argued value-identical; the serve run is the proof.
7. #110 THE ID FLIP: `tile_city` row-0 values are persistent ids. Expect the
   FIRST divergence here if any creation path misses an allocation —
   `tile.ownerCity` and `nextCityId` are byte-exact digest fields now.
8. #110 THE SLOT REGIME, three unproven changes: (a) seat 0 no longer reuses
   a hole on founding; (b) compaction covers every major row in ONE body —
   and as of #112 fires on ONE trigger too, so civ slot indices move
   earlier than before; stable, so relative order is untouched, but latent
   slot-keyed staleness surfaces here;
   (c) `centre_slot_at` re-maps on every compaction, so `center_at`'s two
   value-readers change answers wherever they read stale slots. A red
   dense-layout assert on the founding path names the schedule position that
   broke it.
9. THE SEAT LOOP: the city-stats SNAPSHOT freezes every seat's economy at
   its loop top (moves numbers on every row); seat 0's cities stopped firing
   and healing TWICE, so its heal HALVES and its two strike draws move a
   phase later (RNG-stream affecting); row 0 grows before it builds; the
   loyalty pin/flip fixes change who receives a defection.
10. THE OBSERVATION: six divergences moved what the ladder decides — a civ
   seat can now court city-states, sees its quests and its real settler
   price, and stops over-counting its unit cap; seat 0 and TS agree on
   oppStr / gang / oppHasCities. And `seatProximity` was returning 0 for
   every seat holding a city, so the DoW proximity gate was a no-op on the
   TS side: **expect DIFFERENT wars, not just different numbers.**
11. City-state territory at t0: the wire's tile-ownership pair is the only
   thing that carries it now. If CS tiles read empty at t0 on the GPU, the
   pair is not reaching `tile_seat`.
12. THEOLOGICAL COMBAT went inert -> LIVE, on every seat, at a new schedule
   position between the seat loop and the pressure spread. Zero-draw, so the
   stream cannot move; deaths, relics and the pressure swing can.
13. #111 s5, THE WAR AXIS. Four changes at once: (a) war clocks are PER-PAIR,
   so `warTurns` changed shape in the digest and the peace price is now that
   war's own length; (b) the war head is symmetric, so a civ row's
   previously-dead columns are LIVE — a civ can declare on another civ
   through its own head, which never happened before; (c) row 0's war column
   applies at the RECORD position instead of the phase top/tail, so a
   same-turn declaration legalizes row 0's own unit orders this turn as it
   already did for a civ; (d) TS's levy gate read the war axis from one end
   and now reads "at war with any major", so a civ fighting only another civ
   can levy. Expect DIFFERENT WARS.
14. #111 s6, THE OBSERVATION AGAIN. Dims change (PER_CIV 3→7, ctx 13→9): the
   DoW terms are per-opponent, so the pick names WHICH opponent, and seat 0's
   aggression / peaceTurns stop rendering zero. Every checkpoint is
   invalidated (#77 rules them disposable).
15. #111 s1–s4, five decisions inside one refactor: row 0's `city_wonder`
   registry is the wonder source for `_place_works` (the tile-ownership
   branch is gone) and the overflow addend is f64 for every row; the victory
   code names the WINNING ROW (`victory_type` + `victory_row`) instead of
   encoding "seat 0 won" vs "seat 0 lost"; seat 0's SPREAD verb went live;
   the t0 fixture load writes charges/MP for EVERY seat (the civ arm wrote
   none); and the job mask's ownership term is `tile_seat == row` on every
   row.

16. #112, THE RULE-BODY CENSUS. Six behaviour changes, all GPU-side, all
   toward what TS already does: (a) a barbarian marches on EVERY major's
   cities, not row 0's — a civ city can now be besieged however close it
   stands; (b) both march scans use TS's one key (distance, then seat id,
   then centre TILE), so a target that used to be picked by SLOT can
   change; (c) a barbarian melee on ANY centre now goes through the
   lone-civilian test — and as of #113 that test is gone from both
   engines, because real Civ 6 has no capture-inside-a-city move: a
   centre is attacked as the CITY whoever stands on it; (d) an antiquity
   dig reads the ACTING
   seat's era, so a modern row 0 no longer suppresses everyone's digs and
   an ancient one no longer keeps stamping past the deadline; (e) the
   Itinerant Preachers range bonus reaches row 0's religion (#73 gave it
   an enhancer; the code still said no founding path could); (f)
   `civ_cap_tile` starts -1 on EVERY row, where the civ rows used to start
   0 — that was a DIGEST divergence against `capitalTile ?? -1` for any
   seat before its first founding, and `_domination` now refuses a winner
   while any capital is missing, as `dominationWinner` does.
   Storage-only, but read it if the layout looks odd: city-slot compaction
   now fires whenever ANY major row holds a hole (one trigger, TS's dense
   spliced array), so `CIV6_RC_RECLAIM_AT` is gone and civ slot indices
   move earlier than before. This SUPERSEDES 8(b), which described the
   compaction BODY covering every row while the TRIGGER stayed forked.

17. #113, THE WAR AXIS AND THE ACTION INTERFACE. (a) SEAT 0 CAN NOW
   DECLARE WAR AND SUE FOR PEACE. The gate's hand-rolled seat-0 block never
   picked a war column, so seat 0 was the one seat that could do neither;
   it now runs the same `pick_war` off the same policy stream, which means
   new wars in the rollout and a policy RNG stream drawn at a row it was
   never drawn at before. (b) DECLARING AND SUING MOVED. The `geoWar` and
   `geoPeace` loops are deleted on both engines; every declaration and
   every treaty rides the seat's own war head at its RECORD position, so a
   civ↔civ war now starts at the declaring seat's phase position instead
   of the phase top. (c) PEACE IS PRICED FOR EVERYONE. The civ↔civ arm
   ended wars on a weariness threshold alone; the head charges
   `peaceGold0 + slope*clock` and refuses under `warMinTurns`, so civ↔civ
   wars run longer and cost gold to end. (d) THE HEAD GAINED THE ALLIANCE
   GATE, the warmonger grievance and the war's KIND — a war declared
   through the head used to have none of the three. (e) THE PACING TERMS
   ARE GONE: `_geo_turn`'s `dowWwMax` / `peaceWw` gates left with its
   declare half and `ladder.pick_war` cannot express them, because
   war-weariness is not in the observation. Expect more thrash between war
   and peace until a ww field lands — #108-adjacent policy work, not an
   engine rule. (f) The geo RECORD's targets are ABSOLUTE SEATS and its
   `geoWar`/`geoPeace` keys are gone. (g) Three TS point fixes ride along:
   `goldenCulturePerDistrict`, `goldenBoostBonus` and `addEraScore` were
   each passing a literal seat 0 where the acting seat belongs, so
   golden-age culture, boost bonuses and conquest era score were credited
   to seat 0 no matter who earned them (the GPU was right in all three).
   WATCH FIRST: the GPU applies every row's war column pre-step while TS
   applies each at its own seat's record position. For seat 0 those
   coincide; for a civ row TS's declaration lands after earlier seats have
   already walked. Both engines document the position as matched — read the
   first divergence here before assuming it is elsewhere.

**Reachability, before believing any green run:**
- Theological combat needs two ADJACENT religious units of different
  religions. A gate that never puts two apostles side by side proves
  nothing about it.
- Row 0's wonder/project completions need the driver to pick those columns.
- No seat fields a second ship, and seat 0 lays no international trade leg,
  under the current masks (B-28r, A-11r) — re-measure both.
- The war head's newly-live columns need a game with THREE majors in reach
  of each other; a two-major seed exercises nothing the old single axis did
  not already reach.
- #112's march changes need a barbarian within reach of a CIV city while a
  row-0 city stands closer, and the antiquity fix needs a dig by a seat
  whose era differs from row 0's — early-game lanes reach neither.
- The `civ_cap_tile` default only shows before a seat's first FOUND. A gate
  that starts every seat with a capital reads identically either way.

Hunt discipline: scripted-reachability first (the digest gate names the
turn), checkpoint-bracket from the nearest earlier checkpoint, full fresh
gate for any behaviour-changing fix. One battery at the round's end, never
per fix.
