# Engine audit — open items

THIS FILE IS A LIST OF OPEN ITEMS. Nothing else belongs in it. A
resolved entry is DELETED, not annotated — what was fixed, when and why
is the git log's job, and duplicating it here is how three audit
generations grew thousands of lines nobody could read. Everything below
is open work, stated against the current engine by symbol.

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

**State:** P8 training PARKED until this file is clean. The battery is
GREEN end to end: the serve gate runs 12 seeds x 250 turns with the
digest agreeing on every (turn, group), and the TS suite and every poke
lane pass beside it — so the freeze-era changes are validated as far as
the gate can reach, and "Reachability" below bounds that claim. Restore
the seed set to 24 before the final hunt — the 12-seed set is a
temporary dev-speed cut.

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
| **A. Engine vs engine** | **0** | |
| B-17r Encampment strikes | 1 | scoped out with ranged-vs-city; the rest of the district is done |
| B-18r religion tails | 2 | complete on every seat; one latent lifecycle drift to hunt |
| B-20r tourism tails | 7 | national parks, civ Archaeologists, theming, shipwrecks, digs |
| B-21r suzerain rows | 3 | 10 descoped channels, each needing its own mechanic |
| B-22r World Congress | 6 | one resolution type of many; emergencies and competitions absent |
| B-24r Ages/governors | 2 | eight dedication catalog entries, dark-age policies, governor promotions, per-civ era drift |
| B-25r victory tails | 1 | science victory fully sourced; residual = B-20r cross-ref + three recorded deviations |
| B-26r barb escalation | 2 | camp-spawn ladder beyond melee |
| B-27r theological combat | 2 | resolver simplifications, incl. the ~7x martyr-relic overstatement |
| B-28r naval production | 3 | one heuristic column where `trainableUnits` belongs |
| B-29r peace-treaty cooldown | 1 | a per-pair clock and its gate, both engines |
| B-30r specialists | 6 | a mechanic neither engine has: wire column, assignment, yields |
| B-32r captured-city garrison | 1 | units on a captured centre must die with the city; both engines leave them standing |
| B-33r floods vs districts | 1 | GS floods damage districts/buildings on floodplains (the Dam's reason to exist); both engines only pillage improvements and fertilize |
| B-31r trade-route tails | 6 | a Trader UNIT and a route wire verb |
| B-D unsourced data values | 5 | a residual CLASS: every invented magnitude, re-sourced |
| **B. Fidelity vs real Civ 6** | **49** | |
| **OPEN, TOTAL** | **49** | |

RULE FOR THE NEXT ROUND: when an entry closes, delete its row here in the
SAME commit. When one opens, add a row with its weight and its reason. Do
not add a "done" column back.

## A. Engine vs engine — where the two implementations can answer differently

THE CHAPTER IS EMPTY. The digest is the only instrument for this class —
both engines can be equally faithful to Civ 6 and still disagree with each
other, and a gate red is the only thing that would say so. Its current
answer is green: 12 seeds x 250 turns, compared per turn on every group.
An empty chapter means only that this is what the instrument found, never
that the rest agrees — "Reachability" below is the boundary of what the
green gate reaches.

What is NOT a source of new members: a seat asymmetry. Seat 0 rides the same
machinery as every other row, and `tools/gpu/seat_symmetry_check.py` holds
that with both allowlists empty.

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
- **B-24r. Ages/governors tails:** the eight unmodeled dedication
  catalog entries (To Arms!, Hic Sunt Dracones, Reform the Coinage,
  Heartbeat of Steam, plus four needing spies / air units / artifact
  systems / GDRs — each needs BOTH faces sourced and hooked, and any
  catalog growth reshuffles every round-robin pick); dark-age
  policies; governor PROMOTIONS (the 5-turn establishment clock gates
  only promotions — the +8 loyalty is by-assignment in real R&F,
  sourced, so the stateless greedy ranking is faithful for the one
  governor channel modeled); per-civ tech-era drift (eras are global
  50-turn blocks).
- **B-25r. Victory tails:** every named Civ 6 victory exists on both engines
  and every one is REACHABLE. The science victory is now the sourced GS
  shape end to end: the SPACEPORT district (Rocketry, flat 1080, flat land,
  outside the specialty cap, -1 adjacent appeal), real per-step prices
  (540/900/1080/1260 speed-scaled; the Mars Colony's 1800 is the one figure
  without a direct quote — wiki GS data module confirms 900/1500/2100 and
  1800 completes that ladder), the three side effects (full-map reveal /
  10x-science Culture lump / nothing), and the light-year FLIGHT — the
  Exoplanet craft flies 30 LY at 1 LY/turn plus one per completed laser
  station (`TERRESTRIAL_LASER_STATION` / `LAGRANGE_LASER_STATION`,
  repeatable, Offworld Mission, 360 each) and the win fires on ARRIVAL.
  Only the two poke lanes reach any of it (`space_race_test` /
  `space-victory.test`): Smart Materials sits far past TURN_LIMIT, which is
  also the RECORDED reason the flight state is not rendered into the
  observation and the win pays no terminal reward — nothing reachable this
  phase could learn from it. Open: the culture win's tourism gap (B-20r),
  and three small sourced deviations — the Terrestrial station's
  powered-city condition (no power system), the Lagrange station's
  30 Aluminum (no strategic-resource stockpiles), and the Spaceport's
  upkeep left at the generic 1 gold (unsourced, the B-D class).
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

## Reachability — what the green gate does NOT prove

A green serve run proves the two engines agree over the regime the scripted
seeds actually enter. These mechanics are NOT in that regime, so the gate
says nothing about them; each needs its own measurement before a green run
is read as evidence about it:

- Theological combat needs two ADJACENT religious units of different
  religions. A gate that never puts two apostles side by side proves
  nothing about it.
- The NEIGHBORHOOD column: URBANIZATION is an Industrial civic (cost 1060,
  after CIVIL_ENGINEERING and NATIONALISM), so MEASURE whether any seed
  reaches it inside 250 turns before reading a green run as evidence about
  the multi-Neighborhood rules. If none does, the column is poke-covered
  only.
- No seat fields a second ship under the current masks (B-28r), and the
  international trade-route leg only fires when a seat exhausts domestic +
  city-state destinations — re-measure both before reading a green run as
  evidence about either.
- The space race needs Information-era techs no gate lane reaches; its poke
  lanes are the proof.
- An antiquity dig by a seat whose era differs from seat 0's — no
  early-game lane reaches one.
- A barbarian march choosing a CIV row's city while a row-0 city stands
  in reach — the tie key was verified by reading, never by the gate.
- The `R = 0` phantom row: no seeder configuration produces a one-major
  world, so the solo-game arm cannot be validated by the gate — named here
  so nobody hunts for it.

STILL UNVERIFIED data, and NOT changed on a guess: our feature-removal
techs are Woods -> Mining and Marsh -> Irrigation (Rainforest -> Bronze
Working checks out against a real source); both are load-bearing for
district placement, so the B-D sweep should source them first.

Hunt discipline: scripted-reachability first (the digest gate names the
turn), checkpoint-bracket from the nearest earlier checkpoint (validate a
resume against a fresh run the first time it is trusted for a diagnosis),
full fresh gate for any behaviour-changing fix. One battery at the round's
end, never per fix.

## How to read a battery red

**A POKE RED.** The recurring shapes, each of which reads exactly like an
engine red until checked:

  - **The auto-decision premise.** The engines are decision-free: a buy, a
    strike, a queue pick or a spread is an ORDER the applier re-validates,
    never something `_seat_phase` chooses. A lane that steps and waits is
    waiting for nothing — stash the intent (`apply_seat_actions`, the
    order helpers in `tests/gpu/warmup.py`) and assert the validation.
  - **The registry confound.** Districts are read off the city REGISTRY
    (`city_dist_tile`), never the tile plane; a scene must write both, as a
    real completion does. Third and fourth instances: `trade2`'s specialty
    count, `encampment`'s strike.
  - **The stale index space.** Appliers take the ROW and RANKED orders over
    `_seat_slot_map`; a test speaking the dead civ-index or raw pool-slot
    convention lands its orders on the wrong seat or the wrong unit and
    no-ops (`seat_verbs`, `religion2`'s spread, `war`'s CS siege).
  - **The wrong resolver.** `_hostile_ranged_strike` scopes out
    major-vs-major by design; that pairing is `_ranged_attack`'s.
  - **A stale cache under a poke.** Writes that the engine always pairs
    with `_eff_version += 1` must be paired in a poke too, or the mask
    serves the pre-poke world (`districts`' exclusiveWith).

**A TS-SUITE RED, same triage.** The battery tail only ever shows the
last failing file; run vitest directly for the full list. The TS-specific
shapes, beyond the GPU list above:

  - **Founding under `unitsMode` needs a settler on the tile** — the FOUND
    rule re-validates for every seat now. Nine files called `foundCity`
    bare and dereferenced `.city!`; `settleAt` (tests/cpu/helpers.ts) is
    the scene helper.
  - **The actor loop skips a CITYLESS seat** (`seatPhase`) — influence,
    diplomatic favor, unit upkeep/bankruptcy and quest issuance all
    live inside it; a scene that never founds measures none of them.
  - **Rules that moved INTO the seat phase**: city strikes (`cstk`/`estk`),
    city healing, influence-to-envoy conversion — lanes still calling
    `barbarianPhase`/`cityStatePhase` waited on the old home.
  - **The scripted adoption** (`computeAdoption`): modifiers read the
    adoption, a pure function of civics — `setPolicy`/`setGovernment`
    write a store nothing reads in a driven game.
  - **One seat model**: `isCiv(0)` is true; a fake seat `{ id, atWar }` or
    a duplicated hardcoded seat id builds a scene the war axis cannot see;
    a CityState without `emptySeat(seatOfCityState(id))` has no seat id.
  - **Meeting is by EXPLORATION** — in a fogless world every seat meets
    every city-state at the phase top; "unmet" scenes need fog live.
