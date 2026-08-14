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
| A symmetry | 41 | 40.0 | **98%** |
| B fidelity | 88 | 87.11 | **99%** |
| Closed chapters (C/D/E/G) | 62 | 62 | 100% |
| **Overall** | **191** | **189.11** | **99%** |

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
- **A-26. Seat-0 mask-policy exclusions have NO TS twin — the last
  per-seat action-surface asymmetries, all GPU-mask-side.** TS mechanics
  are seat-generic everywhere surveyed: `trainableUnits` / `purchaseUnit`
  offer naval hulls to EVERY seat gated only on `cityNavalCapable`; the
  unit-sequence walker's SPREAD and SNIPE arms execute for whichever seat's
  record carries them. The GPU withholds the columns from seat 0 instead:
  `city_mask` bans all naval training AND gold purchase (`~unit_naval`,
  sim_masks.py), the civ production mask hand-rolls a single one-hull
  galley column (`_galley_idx`, sim_seats.py) that matches neither
  `trainableUnits` nor real Civ 6, seat 0's SNIPE ring columns are
  all-False (no dispatch arm), and its SPREAD columns are all-False.
  None of it is gate-visible: the exclusions live in the decider's masks,
  so identical records reach both engines. Burn-down: adopt the capability
  gate on BOTH mask families (kills the galley column), give seat 0 the
  snipe dispatch, unlock spread. Each is a behaviour round with rollout
  churn and needs the serve gate live. DEBT markers sit at the four
  sim_masks.py sites. Seat-0 columns for tile buy and faith purchases (the
  #104 wire kinds) belong to the same family.
  REACHABILITY: seat 0 fields no ships in driven games (naval
  training/purchase masked, this family), so the naval arm is poke-covered
  only until the galley column dies.
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
- **A-31r. THE REMAINING SEAT-0 DISTINCTIONS, in full.** Four, and every
  one is WIRE or POLICY — none is a rule:
  1. `step()`'s action interface and the unit-order REPLAY position: row
     0's triples apply pre-turn, a civ's per-unit rows in-phase. Task
     #108, and TS carries the same fork as `actor.seat !== 0`.
  2. WAR_COLUMN_SEAT: the wire carries ONE war axis, so a civ row's war
     head declares on / sues to that seat while that seat's head names
     WHICH civ. `seat_masks` forks there and nowhere else. Unifying means
     pairwise clocks + a symmetric war-column layout + an obs dims change.
  3. CTX_PAIR_SEAT: the same one-axis limit in the observation, and the
     reason the DoW sextet renders zero on that seat's own row. Both
     engines say so in the same words.
  4. `policy/drive.py`'s `_prod_ctx` city CAP: seat 0 expands to the
     world's physical slot count, a civ stops at the ladder's `maxCities`
     heuristic. POLICY, not a rule — both engines replay the same recorded
     decisions, so it moves trajectories and never parity.

## B. Fidelity vs real Civ 6 — open residuals

- **B-17r. Encampment:** ranged-vs-district strikes are out of scope,
  matching the ranged-vs-city scope-out. The rest of the district
  (`encamp_hp` pool, movement block, garrison pool, district strike,
  training XP) is complete.
- **B-18r. Religion tails.** The mechanic is complete on every seat
  (pantheon/founder/enhancer races, pressure, missionaries, apostles,
  theological combat, worship buildings, faith buys on the wire). Open:
  seat 0 fields no religious units until religious-unit PRODUCTION wires
  up (A-26). KNOWN LATENT: a religious-unit lifecycle drift becomes
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

**Reachability, before believing any green run:**
- Theological combat needs two ADJACENT religious units of different
  religions. A gate that never puts two apostles side by side proves
  nothing about it.
- Row 0's wonder/project completions need the driver to pick those columns.
- Seat 0 fields no ships and lays no international trade leg under the
  current masks (A-26, A-11r) — re-measure both.

Hunt discipline: scripted-reachability first (the digest gate names the
turn), checkpoint-bracket from the nearest earlier checkpoint, full fresh
gate for any behaviour-changing fix. One battery at the round's end, never
per fix.
