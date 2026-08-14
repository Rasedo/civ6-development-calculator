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
| A symmetry | 41 | 39.42 | **96%** |
| B fidelity | 91 | 88.44 | **97%** |
| Closed chapters (C/D/E/G) | 62 | 62 | 100% |
| **Overall** | **194** | **189.86** | **98%** |

DELTA LEDGER — apply every change to the table in the same commit that
makes it, or the table drifts from the entries it counts (it has, four
times). #111: A-26 (weight 2, 1.33 done) LEFT chapter A for chapter B as
B-28r, since what survives of it is shared rather than seat-shaped;
A-31r closed 3 of its 4 sub-items (+0.75 A); A-32r and A-33r are new and
open (+2 A weight, +0 done); B-29r is new and open (+1 B weight). The
percentages FELL: this round closed less than it found, which is the
number doing its job.

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
- **A-30r. Farm-adjacency food is added post-selection on row 0**, where
  `tileYields` adds it BEFORE the drought floor. Unreachable as written
  (the floor only bites at 0 base food and a FARM's own food is >= 1), so
  it is a construct note, not a live bug.
- **A-31r. THE REMAINING SEAT-0 DISTINCTION.** ONE, and it is WIRE, not a
  rule: `step()`'s action interface and the unit-order REPLAY position —
  row 0's triples apply pre-turn, a civ's per-unit rows in-phase. Task
  #108, and TS carries the same fork as `actor.seat !== 0`.
  (#111 closed the other three: the war axis is symmetric and its clocks
  are per-pair, the observation's DoW terms are per-opponent, and the
  `_prod_ctx` city cap was a branch on a dangling name that never carried
  a difference.)
- **A-32r. TWO WAYS TO DECLARE WAR.** A major's war head (`war_targets`,
  #111 s5) and the geo wire's `geoWar` column (`_geo_declare_wars` /
  `apply_geo`) both start a civ↔civ war, at different phase positions and
  under different re-validation. The geo path also carries the casus belli
  (`civ_pair_warkind`) and the alliance/denouncement gates, which the head
  does not, so the two are not interchangeable: a war declared through the
  head has no KIND. Merge target: one applier over seat-PAIR planes, with
  the head as the only entry. The civ-pair planes still have no seat-0 row,
  which is what keeps `apply_geo`'s row→civ-pair conversion alive (the last
  entries in the seat-symmetry checker's allowlist).
- **A-33r. Barbarian melee priority splits on the centre's owner.** A
  seat-0 centre is attacked as the CITY whatever stands on it (`tgt_city`
  → `_melee_city`); a civ centre is attacked through its occupant unless
  that occupant is military (`_city_wins = _rvc_here & ~_civ_only`), so a
  lone civilian on a civ centre draws the blow instead of the city. Both
  engines agree (it mirrors TS `meleeAttack`), so no gate can see it. Real
  Civ 6 resolves an attack on a city tile against the CITY, so the CIV arm
  is the divergent one and the fix is to delete `_civ_only` from
  `_city_wins`. Behaviour-changing on both engines — a hunt of its own.

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
   a hole on founding; (b) compaction fires whenever ANY major row holds a
   hole, so civ slot indices move earlier than before — stable, so relative
   order is untouched, but latent slot-keyed staleness surfaces here;
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

Hunt discipline: scripted-reachability first (the digest gate names the
turn), checkpoint-bracket from the nearest earlier checkpoint, full fresh
gate for any behaviour-changing fix. One battery at the round's end, never
per fix.
