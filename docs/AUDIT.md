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

## What is left (owner-requested; guesstimates)

THE PERCENTAGE IS GONE, and it is not coming back. A "% complete" needs a
denominator — the weight of everything ALREADY closed — and nobody could
recompute that number from this file, because closed entries are deleted
here by design. So it was only ever maintained by a running delta chain,
and a delta chain that is never re-derived drifts: it did, five times, the
last one arithmetically impossible (41.55 + 1 done against a weight of 42).

What replaces it is a number every future round can recompute from the list
it is already reading: the OPEN weight, hand-weighted 1–8 by implementation
size, itemised so the arithmetic is visible. It cannot drift, because
nothing carries forward.

| Open item | Weight | What the weight is for |
|---|---|---|
| A-9r Neighborhood | 4 | one district, both engines, plus the registry's `allowMultiple` |
| A-11r trade-route tails | 8 | a Trader UNIT, a route wire verb, and a route-store schema change |
| A-27r seat-0 district scans | 3 | two scan sites folded into the row-generic walk |
| A-28r specialists | 6 | a mechanic neither engine has: wire column, assignment, yields |
| A-29r cityYieldMult order | 2 | registry ordering; no colliding pair exists in the catalog today |
| A-30r farm-adjacency order | 1 | construct note, unreachable as written |
| **A. Seat symmetry** | **24** | |
| B-17r Encampment strikes | 1 | scoped out with ranged-vs-city; the rest of the district is done |
| B-18r religion tails | 2 | complete on every seat; one latent lifecycle drift to hunt |
| B-20r tourism tails | 7 | national parks, civ Archaeologists, theming, shipwrecks, digs |
| B-21r suzerain rows | 3 | 10 descoped channels, each needing its own mechanic |
| B-22r World Congress | 6 | one resolution type of many; emergencies and competitions absent |
| B-24r Ages/governors | 4 | Monumentality purchases, the governor tails |
| B-25r victory tails | 3 | every victory exists; the tails are rate and term work |
| B-26r barb escalation | 2 | camp-spawn ladder beyond melee |
| B-27r theological combat | 2 | resolver simplifications, incl. the ~7x martyr-relic overstatement |
| B-28r naval production | 3 | one heuristic column where `trainableUnits` belongs |
| B-29r peace-treaty cooldown | 1 | a per-pair clock and its gate, both engines |
| B-D unsourced data values | 5 | a residual CLASS: every invented magnitude, re-sourced |
| **B. Fidelity vs real Civ 6** | **39** | |
| **OPEN, TOTAL** | **63** | |

RULE FOR THE NEXT ROUND: when an entry closes, delete its row here in the
SAME commit. When one opens, add a row with its weight and its reason. Do
not add a "done" column back.

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

**#115 — the wire's last seat-0 shape, and the rivals arithmetic.** Every
item here CHANGES BEHAVIOUR on both engines together; none of it has run.

1. SEAT 0'S UNIT ORDERS MOVED IN THE TURN. They rode a `[tile, col, civ]`
   TRIPLES record applied before the step (GPU) / before `endTurn` (TS);
   they now ride the same per-unit RANK rows every other seat sends and
   replay at the walkers' position inside the phase. Seat 0's combat draws
   therefore consume the shared RNG stream at a different POSITION than
   before. Expect every seed's trajectory to differ from any pre-#115
   checkpoint — that is the change, not a bug. What must still hold is that
   the two engines move together.
2. SEAT 0 GAINED MULTI-RANK MOVEMENT. Its old block emitted rank 0 only, so
   it walked one tile a turn while every civ walked up to four. It now goes
   through `_decide_turn`'s virtual planner like the rest. This widens what
   seat 0 does far more than the position change does.
3. SEAT 0'S RECORD GAINED `denounce` / `ally`. `geo_decide_and_apply` has
   always computed and APPLIED row 0's intents GPU-side; the hand-rolled
   `recs["0"]` never carried them, so the TS child was never told. A LIVE
   divergence, latent only while row 0's terms happened not to fire.
4. SEAT 0'S SPREAD ROWS ARE REAL. `driver.ts` hardcoded `sr0.push(-1)`
   under "seat-0 religion founding has no GPU twin yet", which stopped
   being true in #111. The GPU has been emitting real targets against a
   column of -1s.
5. SEAT 0'S MOVE REFUSALS TIGHTENED. It used `walkPath` (allowEmbark false,
   no stacking or encampment gate); it now uses `tileFreeForUnit` +
   `stepUnit`, the same body the civ rows and the GPU's `_blocked_for`
   share. Seat 0 can now embark at war with SHIPBUILDING, which the GPU's
   row-generic `any_war` arm already allowed it.
6. THE ANTIQUITY-SITE ERA GATE TAKES THE ACTING SEAT on TS. #112 fixed the
   GPU (`_dig_at(..., row)`) and left `applySeatUnitOrders` and the two city
   STRIKE bodies passing the phase's ambient 0, so a civ's death left (or
   did not leave) a dig by SEAT 0's era. Needs a dig by a seat whose era
   differs from seat 0's — no early-game lane reaches it.
7. THE DECIDE ORDER PUT SEAT 0 FIRST. It used to decide last, so its war
   column applied after every civ row had taken its mask. Row order now
   matches `_seat_phase`'s and TS's `seatPhase`'s.
8. CHOP PAYS ITS LUMP ON THE REPLAY PATH. `applySeatUnitOrders`' inline arm
   cleared the feature and paid nothing where the GPU grants
   `20 + 2.5*(techs+civics)`. LATENT: `_seat_unit_orders`' builder ladder
   offers columns 13-15/18-24 and REPAIR, never 16 — so nothing reaches it
   until the ladder does. `builderRemoveFeature`'s lump and
   `builderImprove`'s legality also stopped reading a literal seat 0.
9. THE `R = 0` PHANTOM ROW IS GONE. Major-axis widths were `1 + max(R, 1)`,
   which reserved a second row for a solo game and marked it wire-driven.
   No configuration in `seeder/` produces R = 0 (`civMax` defaults to 2), so
   this is unreachable today and cannot be validated by the gate — it is
   named here so nobody hunts for it.
10. `PILLAGE` ON SEAT 0'S PATH now gates on `combat > 0` rather than "carries
   no charges". The GPU has always used the former; the deleted
   `seatPillage` let a Great General pillage where the GPU refused.

WATCH FIRST when the run goes red: (1) and (2) together mean seat 0's whole
trajectory changed. Bracket from a checkpoint and read the SEAT the
divergence names before reading the mechanic.

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
