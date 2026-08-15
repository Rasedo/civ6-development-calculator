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

**State:** P8 training PARKED until this file is clean. The freeze is
over: the battery has run, the serve gate reaches turn 1 and is RED
there, and "The battery's open reds" at the bottom is where the hunt
starts. Restore the seed set to 24 before the final hunt — the 12-seed
set is a temporary dev-speed cut.

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
| A-34r serve gate red at turn 1 | 3 | two digest groups, every seed; size unknown until the first site is named |
| **A. Engine vs engine** | **3** | |
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
| B-30r specialists | 6 | a mechanic neither engine has: wire column, assignment, yields |
| B-31r trade-route tails | 6 | a Trader UNIT and a route wire verb |
| B-D unsourced data values | 5 | a residual CLASS: every invented magnitude, re-sourced |
| **B. Fidelity vs real Civ 6** | **51** | |
| **OPEN, TOTAL** | **54** | |

RULE FOR THE NEXT ROUND: when an entry closes, delete its row here in the
SAME commit. When one opens, add a row with its weight and its reason. Do
not add a "done" column back.

## A. Engine vs engine — where the two implementations can answer differently

THE CHAPTER HAS ONE MEMBER AGAIN, and it arrived the moment an instrument
could speak. The digest is the only instrument for this class — both engines
can be equally faithful to Civ 6 and still disagree with each other, and a
gate red is the only thing that would say so.

- **A-34r. The serve gate splits at TURN 1**, on `seat.milli` and
  `tile.exact`, on every seed. Detail, and the one anomaly to explain
  first, are under "The battery's open reds" at the bottom; the freeze
  backlog above it is the list of places to look after that.

Chapter A being SHORT still means only that this is what an instrument has
found, never that the rest agrees.

What is NOT a source of new members: a seat asymmetry. Seat 0 rides the same
machinery as every other row, and `tools/gpu/seat_symmetry_check.py` holds
that with both allowlists empty.

REMOVED FROM THIS CHAPTER'S REACH, and worth stating because it silently
covered everything: until this round a seat with no city never took its turn
on either engine, so under format 4's settler starts the gate compared two
games in which nobody ever founded, built or researched anything. A green
digest over that world would have meant nothing at all.

## B. Fidelity vs real Civ 6 — where both engines agree on the wrong answer

NO GATE CAN CATCH THIS CLASS. Parity proves the two engines match, never
that either matches the real game, so every entry here closes against a
Civ 6 source or is recorded as unverifiable.

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
  compared. Open: NATIONAL PARKS (no concept); recorded-not-modeled:
  theming bonuses, shipwreck excavation, trading works between civs,
  open-borders digs. The martyr-relic overstatement (~7x) is B-27r(3).
  NOT a gap: the Archaeologist trains on every row — `trainableUnits` /
  `_trainable_units` gate it on the museum's free artifact slot through
  `_type_civic_slot_ok`, one body per engine. What no seat does is PICK
  the column, which is a ladder question, not a wiring one.
  MEASURED BEFORE THE FREEZE, and stale by construction: visiting
  tourists peaked ~7 against ~97 domestic at t250, putting the culture
  victory ~14x out of reach. Re-measure at the first serve run before
  quoting it — every round since has moved the economy.
- **B-21r. City-state suzerain rows:** 14 shipped (`CITY_STATE_SUZERAIN_LIVE`)
  / 10 descoped, each carrying its reason in its `CITY_STATES` catalog entry's
  `note` — unit-XP, cavalry, apostle-promotion, trade-route, power and
  amenities channels. Shipped rows degrade %-scaling and conditionals to a
  flat channel yield.
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
- **B-25r. Victory tails:** every named Civ 6 victory exists on both engines
  and every one is REACHABLE — a seat can queue every space step and the
  wire applier takes it on both sides. Open: the culture win's tourism gap
  (B-20r), and the science victory's own fidelity tail, which is large
  enough to be its own work item rather than a line here — the Spaceport
  district, the real per-project costs, the light-year FLIGHT (we award the
  win the instant `EXOPLANET_EXPEDITION` completes; real GS launches a craft
  that must arrive, and the laser-station boosters that shorten the trip are
  unmodelled because there is no trip), and the three projects' side effects.
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
- **B-28r. THE NAVAL PRODUCTION SURFACE is one heuristic column.** `ok_u`
  masks out every hull (`~unit_naval`) and a single hand-rolled GALLEY
  column (`_galley_idx`, sim_seats.py) is added back, legal only while the
  seat owns zero naval units live or queued. Real Civ 6 offers whatever
  `trainableUnits` allows in a naval-capable city, with no one-ship cap.
  The fix is to drop `~unit_naval` and let the capability gate that already
  rides in `tr_j` answer, deleting the galley column — a behaviour round
  that needs the serve gate live.
  REACHABILITY: no seat fields a second ship in driven games, so every
  naval rule past the first hull is poke-covered only.
- **B-29r. No peace-treaty cooldown.** Real Civ 6 binds a peace treaty for
  a fixed term — a seat that just made peace cannot re-declare on that
  opponent for ~10 turns. Neither engine models it: `_apply_war_column` /
  `makePeace` reset the pair clock and the declare column reopens the very
  next turn, so a rich seat can thrash war→peace→war on one opponent. The
  clock to gate on already exists per-pair (#111 s5's `war_turns`); what is
  missing is a per-pair PEACE stamp beside it.
- **B-30r. SPECIALISTS are not a mechanic on either engine.** Real Civ 6
  lets a city work a district slot instead of a tile; here TS only ever
  writes `city.specialists` from `setSpecialists`, a UI verb, so it is `{}`
  in every simulated game, and the GPU's greedy assignment was deleted
  rather than mirrored — assigning a citizen is a CHOICE, and neither
  engine takes a choice without a wire record. REOPENING IT is a wire
  column, the way district placement records its TILE, plus the assignment
  rule and the yields; it is not an engine-rule fix.
- **B-31r. Trade-route tails.** (1) No physical Trader UNIT — routes lay
  roads (`layTradeRoad` / `_lay_trade_road`) but nothing walks the path, so
  a route cannot be plundered en route and its range is not a journey.
  (2) No seat's wire carries a trade-route DECISION: route creation is an
  eager rule on both engines, where a real player spends a Trader on a
  chosen pair. A route verb is P8-surface work. The destination-STORAGE
  divergence between the engines is A-31r, not this entry.
- **B-D. UNSOURCED DATA VALUES — a residual class, not one item.**
  Mechanics are sourced item by item; the DATA layer largely is not, and a
  wrong CONSTANT passes every gate because both engines agree on the wrong
  number. **The marker grep no longer finds this class.** It used to: a
  sweep for `eyeballed` / `approximate` / `stand-in` named a dozen files.
  The comment purge deleted most of those markers along with the prose
  around them, so what survives is 11 occurrences over 7 files
  (`builtWonders` costs plus three stand-in unlock techs, `units` costs,
  `policies` numbers and its stand-in card effects, `economy`'s harvest
  gating, and two RECORDED-not-approximated notes in `cityStates` /
  `units` that are deliberate omissions, not unsourced magnitudes).
  `improvements` now states the opposite — every yield sourced to the GS
  Civilopedia, no markers left — and `projects` was sourced with #83.
  So the sweep cannot be scoped by grepping; it has to walk cpu/data file
  by file, checking each magnitude against a real Civ 6 source and either
  correcting it or recording it as a deliberate stylization. Re-marking as
  it goes is what makes the class shrinkable again.

## The freeze backlog — what the first serve run must validate

The first battery since the freeze has now RUN, and the serve gate reaches
turn 1 and goes red there — see "The battery's open reds" below, which is
where diagnosis starts. This list is still the read-this-before-calling-it-a-
bug list for whatever the gate names, in dependency order of suspicion; git
log carries what each change was, this is only what to CHECK.

One correction it already forced: every item below was written expecting a
world with capitals on the map. Format 4 starts each major with a SETTLER,
and until the fix in this round a city-less seat never took its turn at all —
so anything phrased as "the seat's first N turns" describes a regime the
engines have not actually been in since the format changed.

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
   a hole on founding; (b) compaction is ONE body on ONE trigger for every
   major row — it fires whenever ANY row holds a hole, TS's dense spliced
   array, so `CIV6_RC_RECLAIM_AT` is gone and civ slot indices move earlier
   than before; stable, so relative order is untouched, but latent
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
   The compaction trigger changed with it — see 8(b), which carries the
   whole of that story.

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
   ARE GONE: the war-weariness ceilings that used to gate a declaration and
   a peace went with the old declare path, and `ladder.pick_war` cannot
   express them, because war-weariness is not in the observation. Expect
   more thrash between war and peace until a ww field lands — policy work,
   not an engine rule. (`_geo_turn` itself survives, deciding denounce and
   ally only off `dowProximity`. The ceilings, and the equally unread
   `dowStrengthRatio` / research `prodDiv` / `defPerTech`, are no longer
   exported at all — an export key no rule reads is a false affordance.)
   (f) The geo RECORD's targets are ABSOLUTE SEATS and its
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

**THE SECOND LIST — behaviour changes since the wire's last seat-0 shape.**
Every item here CHANGES BEHAVIOUR on both engines together; none of it has
run. Items 1-10 are the seat-0 wire shape and the rivals arithmetic; 11-16
the action-space holes (the space race, research switching); 17-20 district
placement. Numbering restarts here — "watch first" below means THIS list.

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
   No configuration in `seeder/` produces a one-major world (`civCount`
   defaults to 3), so this is unreachable today and cannot be validated by
   the gate — it is named here so nobody hunts for it.
9b. THE ROSTER WIDTH IS READ OFF THE ROSTER. The `civMax` wire key is
   DELETED from the world params and the fixture; `n_majors` is
   `len(f0["civs"])` and the driver's is `state.seats.length`. The seeder's
   third CLI argument changed MEANING (rivals → majors) and its default
   with it (2 → 3), so `npm run seed -- 12 3 2` now asks for two majors
   where it used to ask for three. The generated worlds are otherwise
   byte-identical: `placeCivs` receives the same number and draws from the
   same per-civ streams. **The genStamp moves** (it hashes `params`), which
   is the loud failure that forces the regeneration.
10. `PILLAGE` ON SEAT 0'S PATH now gates on `combat > 0` rather than "carries
   no charges". The GPU has always used the former; the deleted
   `seatPillage` let a Great General pillage where the GPU refused.
11. THE SPACE RACE IS A DIFFERENT SHAPE (#83). The project roster lost two
   rows — the base game's three separate Mars components collapse to
   Gathering Storm's single `LAUNCH_MARS_COLONY`, which is what this repo
   models — so **every project column index after the Mars rows SHIFTS**, and
   with it the production mask's width. Nothing derived from that layout may
   be read from an old fixture. Sourced against the GS Civilopedia: the old
   rows also had their techs rotated by one (Reactor was gated on
   Nanotechnology where the real Reactor wants Nuclear Fusion) and were
   chained to each other where the real three hung in PARALLEL off the Moon
   Landing; `EXOPLANET_EXPEDITION` was gated on `OFFWORLD_MISSION` where the
   Civilopedia says Smart Materials.
12. THE SPACE MASK GATE IS LIVE (#83). Space rows were skipped by
   `_seat_production_mask` and by the apply, so the columns read False for
   every seat and the chain was unreachable on the GPU while TS could walk
   it. Both skips are gone, replaced by `_space_step_ok`. Behaviour change on
   the GPU only, and only in games that reach Information-era techs — which
   no gate lane does, so a green run says NOTHING about this. The poke lane
   is the proof.
13. THE RESEARCH HEAD NO LONGER CLOSES (#72). `_seat_tech_mask` and
   `_seat_civic_mask` dropped their `cur_tech == -1` term, and so did the
   apply. **Expect a different research order on the GPU from the first turn
   a policy prefers a switch** — the whole head is legal every turn now,
   where it used to be entirely illegal whenever anything was underway
   (0 of 68 at t60 of seed 9002). This is the biggest trajectory change in
   the backlog after the seat loop.
14. RESEARCH PROGRESS IS PARTITIONED (#72). `civ_tech_retain` /
   `civ_civic_retain` (TS: `techRetained` / `civicRetained`) hold the science
   parked on items not currently being researched; the pool holds the current
   item's. Both are in the FATAL digest, and the pool's arithmetic is
   unchanged, so a no-switch game must digest exactly as before — **if
   `techProgress` moves without a switch having happened, the swap is
   leaking.** The observation grew two blocks of tech/civic width, so its
   dims changed again (#77 licenses it).
15. THE TS WIRE APPLIER ACCEPTS SPACE COLUMNS. `queueSeatProject` opened with
   `proj.space || proj.victory` -> refuse, and it is the only path the record
   replay uses — so the GPU queued a space step and TS silently dropped the
   same record. #83 opened the GPU mask and missed this half. Both sides now
   gate on `availableProjects` alone. Unreachable in-gate like the rest of
   the chain, so nothing green proves it; the new wire poke is the tripwire.
16. `winner` NAMES THE VICTOR, not the score leader. It was
   `dom >= 0 ? dom : leader()`, so a science, religious, cultural or
   diplomatic victory credited whoever had the highest score. It now reads
   `victory_row` whenever the outcome has one, falling back to the leader for
   the turn-limit score result. GPU-only plane, absent from the digest, and
   its one reader is `protagonist()` — no trajectory rides on it.
17. THE DISTRICT TILE RIDES THE WIRE. Both engines scanned every owned tile
   for the best adjacency; the choice is the policy's now
   (`ladder.pick_district_tile`), the record's production entry carries it as
   a third element, and the engines only re-validate. The KEY is unchanged
   (highest adjacency floor, ties to the lowest tile index), so a scripted
   game should place identically — with one deliberate difference: the pick
   is made at DECIDE time and validated a phase later, so a tile that stops
   being eligible in between is REFUSED rather than slid to the next best.
   The visible case is two cities of one seat wanting the same plot: the
   second now idles (or falls to its next ranked column) where the old scan
   quietly moved it. **A district column with no recorded tile builds
   nothing** — that is the contract, not a bug.
18. DISTRICT PLACEMENT LEGALITY MOVED, twice, both sourced to GS. (a)
   FLOODPLAINS are district-usable now (GS builds on all of them), which
   widens `du` — hence fixture format 4, and expect districts on tiles the
   old set refused. (b) A tile whose REMOVABLE feature is still standing
   needs the seat to hold that feature's removal tech, which NARROWS early
   placement sharply: Woods and Rainforest plots are shut until Mining /
   Bronze Working. Net direction per seat is not predictable — read the
   first serve run, do not assume.
19. THREE ADJACENCY AMOUNTS WERE WRONG against the GS Civilopedia, all of
   them too low: Campus/REEF 1 -> 2, Harbor/CITY_CENTER 1 -> 2,
   Theater Square/BUILT_WONDER 1 -> 2. Every coastal capital's Harbor gains
   gold from turn one, so this moves the economy from very early, and it
   also changes which tile the placement key picks.
20. `placeSeatDistrict` NEVER CLEARED THE FEATURE. `queueDistrict` and the
   GPU's `_place_district` both null the feature the district paves; the
   WIRE applier — the only one the gate uses — did not. A district built on
   Woods left the Woods standing on TS, lending adjacency to neighbours the
   GPU had already withdrawn. Fixed with the placement rewrite.

21. THE NEIGHBORHOOD COLUMN IS BACK, and it is the 10th `SCAFFOLD_DISTRICTS`
   entry — APPENDED, so the nine existing district columns keep their
   indices and only `wonderLo` / `projectLo` shift by one. Both engines
   derive those bases from the scaffold LENGTH (`prodLayout`,
   `WONDER_BASE = DISTRICT_BASE + len(_scaffold)`), so nothing is hardcoded,
   but every checkpoint and net head is invalidated and the fixtures must be
   re-exported before anything runs. The column was pulled because the two
   engines queued different districts with it in; the cause found by reading
   was the `allowMultiple` gate — TS offered a SECOND Neighborhood where the
   GPU's registry could not hold one. Both ALLOW it now (item 22). What was
   checked and already agrees: the cost curve (`district_cost.base` 32 =
   `round(54 × GAME_SPEED)`), the discount (all-False for a non-specialty
   type on both), the specialty CAP (`floor((pop-1)/3)+1` both), the appeal
   housing bands (`appealTier` vs `_appeal_cuts`, identical including the
   floor of 2), zero maintenance, no buildings in the district, and empty
   adjacency so every eligible tile ties and the lowest index wins on both.
   READ THIS FIRST if districts diverge late: URBANIZATION is an Industrial
   civic, so nothing reaches the column before then and an early-turn
   district red is NOT this.

22. A CITY MAY HOLD SEVERAL NEIGHBORHOODS, on both engines. `allowMultiple`
   is a live rule now rather than an exported flag nobody read: TS gates
   `canPlaceDistrictIn` on it and the GPU reads it into `_is_repeatable`,
   which feeds `_district_slot_free` at both the mask and the applier. THE
   REGISTRY DID NOT GROW. `city_dist_tile[..., di]` still holds ONE tile per
   type and now means "the FIRST of them" — nothing reads a Neighborhood's
   entry for its own sake (it has no buildings, no projects, no adjacency and
   zero maintenance), and the registry is a digest EXCLUSION on both sides, so
   the two engines need not agree on which tile it names. What had to move is
   `_district_counts`: the ALL count adds the tile-plane total for repeatable
   types and subtracts the one registry entry back out, so it matches TS
   walking `city.districts`. The specialty twin stays a registry read, held by
   a load-time refusal of any repeatable type that counts toward the cap.
   WATCH: housing and the amenity/housing "if N districts" thresholds are the
   consumers of that count, so a second Neighborhood shows up there first.
   The queue-time write and `_transfer_city`'s rebuild both keep the FIRST
   tile; last-wins would have been equivalent for every non-repeating type.

23. `WAR_MIN_TURNS` 14 -> 10, the sourced Civ 6 value. Both engines read it
   from rules.json, so they move together, but every war in every seed now
   ends up to 4 turns earlier and `PEACE_GOLD_COST(warTurns)` is charged off
   a smaller clock. Expect the whole war chapter of every trajectory to
   shift; a divergence here is far more likely to be a second-order effect
   of the new cadence than a rule break. The `/14.0` in `observe` and
   `env.observe` is an observation SCALE, not this floor, and stays.

24. AN INTERNATIONAL ROUTE IS KEYED BY (SEAT, CITY ID) ON BOTH ENGINES.
   The GPU stored the destination CENTRE TILE, so a destination CAPTURED by
   another major still read as a live centre and kept paying to the end of
   its term; TS's `toSeatCity` lookup dropped it. The store is now
   `seat_route_dseat` + `seat_route_dcity`, and every consumer —
   the pick's already-connected test, `_seat_route_income`, and
   `_expire_seat_routes` via the new `_route_dest_alive` — resolves the pair
   among that seat's LIVING cities the way `cityTradeYields` does. The dest
   CENTRE for the raid check now follows the lookup instead of a tile frozen
   at creation. THIS ONE CHANGES BEHAVIOUR and the digest can see it:
   `routeCount` moves the turn a destination flips, and the origin's gold
   with it. Reachability is UNMEASURED — the international leg only fires
   when a seat exhausts domestic + city-state destinations — so read the
   route count before concluding the lane is dead.

25. TWO ASSOCIATION FIXES WITH NO REACHABLE DELTA TODAY, listed so a future
   catalog edit does not resurrect them silently.
   (a) `completedWonders` now returns CATALOG order, not build order, so the
   float products over it (`cityYieldMult`, `growthAllMult`) fold the way the
   GPU's ascending wonder-index product does. Inert while each channel has at
   most one multiplier — today Ruhr is production, Big Ben gold, the Campus
   wonder science, and exactly one wonder carries `growthAllMult`. A SECOND
   multiplier on any one channel makes the order load-bearing.
   (b) The farm-adjacency tier is added BEFORE the fertility/drought tail
   (`_food_base` + `_food_tail`, the tileYields order) instead of after
   `_eff_food`. Inert because the drought floor only bites at 0 food and a
   FARM's own food is 1, and because `validImprovementsIn` refuses every
   improvement on a natural-wonder tile — the other side the old order got
   wrong.

26. THE GPU ENGINE COULD NOT CONSTRUCT, AND NOTHING SAID SO. `Rules` declared
   the city-state bag as `cs` while all 33 readers ask for `rules.citystate`,
   and `load_rules` filled it from a `"cs"` key the exporter has never
   written — so `BatchSim.__init__` raised `AttributeError` on its FIRST
   city-state read. Every GPU lane, the serve gate and the whole poke set have
   been dead since that rename; the freeze is the only reason it went
   unnoticed. Fixed by naming the field for what its readers call it and
   loading `r["cityState"]` — a KeyError if the exporter ever drops it, never
   a silent `{}`. CONSEQUENCE TO READ: seven city-state constants now reach
   the engine for the first time — `envoyCost` 100, `influencePerTurn` 3,
   `meetRange` 3, `questCooldown` 12, `questEnvoys` 1, `militaristicIdx` 4,
   `tradeIdx` 2, and the two envoy-building tables `typeB1Idx`/`typeB2Idx`
   (which the fallbacks left at all -1, i.e. NO envoy building at all).
   A second runtime-only break sat behind it: `_apply_seat_unit_actions`
   called `_ranged_attack` without the acting `row`, so an ORDERED ranged
   attack raised on the first turn a seat fired one.
   Both are now held statically — `seat_symmetry_check` gained a CALL ARITY
   census over the mixin methods and a `Rules`-field census, and each was
   verified to fail on the bug it was written for.

27. THE ENGINE IS 2.4x FASTER AND ITS STATE IS BYTE-IDENTICAL. A 250-turn
   driven rollout at B=9 went 126.2s -> 53.1s and an undriven parity loop at
   B=6 went 3.6s -> 1.2s, with the profiled call count down from 9.6M to
   5.0M. Every change was A/B'd against a SHA-256 of all 141 `_MUTABLE`
   planes after 120 driven turns over 9 games; the digest never moved.
   What changed: `canPlaceDistrictIn`'s city-only part is computed once per
   city instead of once per district type (`_district_elig_site`); the
   production mask skips columns no game can queue in and hoists the
   seat-level unit/wonder/district-unlock tests out of its column sweep;
   `_encamp_block` and the new `_nonbarb_unit_at` evaluate at the probed
   TILES instead of building a map-wide plane to sample six of them;
   `_seats_hostile` has an int fast path; the barbarian march and
   `_war_march_target` replaced a 72-trip Python scan of the city block with
   one argmin; and `_theological_combat_phase` walks only the pool slots that
   hold an apostle instead of all 512. THIS IS NOT A PARITY CLAIM — the
   digest proves the GPU agrees with ITSELF, and only over the one driver and
   the one regime it ran.

STILL UNVERIFIED, and NOT changed on a guess: our feature-removal techs are
Woods -> Mining and Marsh -> Irrigation. Rainforest -> Bronze Working checks
out against a real source; the other two could not be confirmed either way,
and item 18(b) now makes them load-bearing for district placement.

WATCH FIRST when the run goes red: this list's (1) and (2) together mean
seat 0's whole trajectory changed. Bracket from a checkpoint and read the
SEAT the divergence names before reading the mechanic.

**Reachability, before believing any green run:**
- Theological combat needs two ADJACENT religious units of different
  religions. A gate that never puts two apostles side by side proves
  nothing about it.
- Wonder and project completions need the driver to pick those columns on
  some row; no rule reaches them otherwise.
- District placement IS reachable in-gate, unlike most of this list — every
  seed queues districts from the early game, so items 17-20 should show up
  in the very first serve run rather than hiding.
- The NEIGHBORHOOD column is the exception: URBANIZATION is an Industrial
  civic (cost 1060, after CIVIL_ENGINEERING and NATIONALISM), so MEASURE
  whether any seed reaches it inside 250 turns before reading a green run as
  evidence about item 21. If none does, the column is poke-covered only.
- No seat fields a second ship under the current masks (B-28r), and the
  international trade leg went unreached under the old decisions (A-31r) —
  re-measure both.
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

## The battery's open reds

The first full battery since the freeze left 22 lanes red out of 56. They
are three families, and only the first is a parity question.

**1. THE SERVE GATE, turn 1, every seed.** Two digest groups split:
`seat.milli` and `tile.exact`. The GPU's `seat.milli` hash is IDENTICAL
across all twelve seeds, which is itself a fact to explain before reading
the divergence — twelve different worlds should not agree. `tile.exact`
differs per seed, so that one carries real per-world data. Turn 1 means the
divergence is in the OPENING, which is exactly the regime the settler-start
fix just made reachable for the first time; read it before assuming any
older backlog item.

**2. THE WORLD NO LONGER DEVELOPS ON ITS OWN, and ~12 pokes assume it does.**
Both engines are decision-free without a record, so `sim.step()` founds
nothing, queues nothing and researches nothing; `settle_all` gives each seat
its capital and no more. Every lane below builds a world by stepping and then
looks for something only a DECIDING seat produces:

  - `relics` — "no fixture reaches a civ with two cities"
  - `occupancy` — "no civ builder ever existed in 70 turns"
  - `controlled` — "the scripted civ must keep queueing"
  - `culture_victory`, `encampment` (the strike), `district_wire`,
    `geopolitics`, `religion2`, `war`, `research_switch`, `peace_target`,
    `districts`, `ladder`, `drive`

`drive_test` is the clearest statement of the problem: it compares a driven
seat against a "scripted transcription, for reference" that is now a seat
which does nothing at all, so its competitiveness assertions compare against
zero. Each of these lanes needs a DRIVEN warm-up (the ladder, as `drive_test`
already does) rather than a bare step loop — or an explicit poke that puts
the state it needs on the planes. That is a per-lane decision about what the
lane is actually for, not a codemod.

**3. MECHANIC REDS the empty world was hiding.** These only became visible
once the pokes had a city to poke:

  - `trade2` — a route to a destination with one specialty district pays 3
    gold where the rule is 3+1.
  - `seat_verbs` — resource improvement column 18 dispatches to nothing
    (`improvement` stays -1). A whole build verb is dead.

**A NOTE ON FAMILY 2 AND 3, learned while triaging them.** Three of the reds
above were NOT the engine. `cs_bonus` reported the 3-envoy building bonus
firing without the building, and the pillaged Campus still paying — both were
its own controls, which stepped 1 -> 3 envoys and so crossed the SUZERAIN
threshold at the same time, whose flat capital yield pays into the same
channel and answers to no building. Its pillage lane also wrote the district
onto the TILE plane only, where the yield walk reads the city REGISTRY, so it
built a Campus no city owned and nothing could go dark. A control that moves
two things at once measures neither; read every remaining lane above for the
same shape before believing it names a mechanic.
