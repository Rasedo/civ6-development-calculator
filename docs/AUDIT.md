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
| B-20r tourism tails | 7 | national parks, civ Archaeologists, theming, shipwrecks, digs |
| B-21r suzerain rows | 3 | 10 descoped channels, each needing its own mechanic |
| B-22r World Congress | 6 | one resolution type of many; emergencies and competitions absent |
| B-24r Ages/governors | 2 | eight dedication catalog entries, dark-age policies, governor promotions, per-civ era drift |
| B-26r barb escalation | 2 | camp-spawn ladder beyond melee |
| B-27r martyr relics | 1 | the ~7x relic overstatement; the resolver's other two simplifications are recorded deviations |
| B-28r naval production | 3 | one heuristic column where `trainableUnits` belongs |
| B-29r peace-treaty cooldown | 1 | a per-pair clock and its gate, both engines |
| B-30r specialists | 6 | a mechanic neither engine has: wire column, assignment, yields |
| B-32r captured-city garrison | 1 | units on a captured centre must die with the city; both engines leave them standing |
| B-33r floods vs districts | 1 | GS floods damage districts/buildings on floodplains (the Dam's reason to exist); both engines only pillage improvements and fertilize |
| B-31r trade-route tails | 6 | a Trader UNIT and a route wire verb |
| B-D unsourced data values | 5 | a residual CLASS: every invented magnitude, re-sourced |
| **B. Fidelity vs real Civ 6** | **44** | |
| **OPEN, TOTAL** | **44** | |

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

WHAT THE INSTRUMENT CAN SEE IS ITSELF AUDITABLE, and it was shallower than
it read. Coverage proved every `_MUTABLE` plane was NAMED by some field; it
could not prove the field's extractor READ what it named. Two fields were
counting rather than comparing: `routeCount` named four route planes and
compared only how many routes existed (destination, expiry and pair
identity went unverified on both engines), and `religionFounded` compared
`holy_tile >= 0` — a proxy — where every founded-gate in the GPU reads
`civ_religion_done`. Both now compare the fact itself: `routes` emits each
route as [fromTile, destTile, kind, expiresTurn] in CENTRE-TILE space, and
the belief DONE bits (`pantheonDone`, `enhancerDone`, `religionFounded`)
are compared against their TS predicates. The census enforces the rule that
found them — a field naming more than one plane must state what it
compares. The 250-turn gate is green WITH those comparisons live, which is
a stronger green than the one before it.

What is NOT a source of new members: a seat asymmetry. Seat 0 rides the same
machinery as every other row, and `tools/gpu/seat_symmetry_check.py` holds
that with both allowlists empty.

## B. Fidelity vs real Civ 6 — where both engines agree on the wrong answer

NO GATE CAN CATCH THIS CLASS. Parity proves the two engines match, never
that either matches the real game, so every entry here closes against a
Civ 6 source or is recorded as unverifiable.

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
- **B-26r. Barbarian camp-spawn escalation** beyond the melee ladder
  (cliffs, ranged barbs and naval barbs all landed).
- **B-27r. Every fallen apostle martyrs into a relic.** Real Civ 6 needs the
  MARTYR promotion; promotions are unmodeled and `theologicalCombatPhase` /
  `_theological_combat_phase` are zero-draw, so relic frequency is an
  OVERSTATEMENT of roughly 7x (recorded at the RELIC_* site in
  data/greatPeople). It feeds faith, tourism and the culture victory, so
  B-20r's rate cannot be read until this is fixed or bounded.
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
  chosen pair. A route verb is P8-surface work.
- **B-D. UNSOURCED DATA VALUES — a residual class, not one item.**
  Mechanics are sourced item by item; the DATA layer largely is not, and a
  wrong CONSTANT passes every gate because both engines agree on the wrong
  number. THE LIVE CENSUS, re-counted by grepping `eyeballed` /
  `approximate` / `stand-in` / `unsourced` over cpu/data: 7 markers over 3
  files — `builtWonders` (costs, plus three stand-in unlock techs:
  CELESTIAL_NAVIGATION for Shipbuilding, EDUCATION for Printing, ASTRONOMY
  for Scientific Theory, each of which moves WHEN a wonder unlocks, not
  just its price), `policies` (numbers, plus stand-in inherent bonuses
  "where the real one needs systems we don't model"), and `units` (costs).
  `improvements` matches the grep only because its header states the
  opposite — every yield sourced to the GS Civilopedia, no markers left.
  THE MARKERS ARE A FLOOR, NOT THE CLASS: the comment purge deleted most of
  the old ones along with the prose around them, so the sweep has to walk
  cpu/data file by file, check each magnitude against a real Civ 6 source,
  and either correct it or record it as a deliberate stylization —
  re-marking as it goes, which is what makes the class shrinkable again.

## Recorded deviations — decided, sourced, and NOT open work

These are not gaps waiting on a round; they are choices with a reason, kept
here so nobody re-opens them as findings. They carry no weight in the table
above.

- **Ranged strikes against a DISTRICT** are out of scope, matching the
  ranged-vs-city scope-out. The rest of the Encampment (`encamp_hp` pool,
  movement block, garrison pool, district strike, training XP) is complete.
- **The theological resolver is DETERMINISTIC.** Real Civ 6 rolls; ours takes
  theoBaseDamage plus the strength difference with no RNG multiplier, because
  a conditional draw would have to be mirrored draw-for-draw across engines.
- **Only APOSTLES initiate theological combat.** Real Civ 6 also allows
  Inquisitors; this roster has no INQUISITOR unit at all, so the pair we model
  is the whole class.
- **The science victory's three small deviations.** The Terrestrial Laser
  Station's powered-city condition (there is no power system), the Lagrange
  Laser Station's 30 Aluminum (there are no strategic-resource stockpiles),
  and the Spaceport's upkeep left at the generic 1 gold (unsourced — it is a
  B-D magnitude, not a mechanic).

## Reachability — what the green gate does NOT prove

A green serve run proves the two engines agree over the regime the scripted
seeds actually enter. MEASURED, 12 seeds x 250 turns driven
(`tools/gpu/reachability_probe.py`) — these are counts, not estimates, and
three of them overturned what this section used to assert:

| mechanic | seeds reaching | first |
|---|---|---|
| faith-buy kind 6 (APOSTLE purchase) | 12/12 | t58 |
| two enemy religious units ADJACENT (theological combat's precondition) | 8/12 | t98 |
| URBANIZATION civic | 0/12 | never |
| a NEIGHBORHOOD placed | 0/12 | never |
| a second HULL on any seat | 0/12 | never |
| an INTERNATIONAL trade leg | 0/12 | never |
| an antiquity dig (artifact in a slot) | 0/12 | never |

- THEOLOGICAL COMBAT IS REACHED, in two-thirds of seeds from t98. The old
  claim here — "a gate that never puts two apostles side by side proves
  nothing about it" — was wrong: the gate does, so the resolver's
  deterministic damage and its apostle-only initiation ARE gate-covered.
- The APOSTLE BUY fires in every seed from t58 and the 250-turn gate is
  green, which is what closed B-18r's predicted lifecycle drift.
- The NEIGHBORHOOD column is poke-covered only: no seed reaches
  URBANIZATION (an Industrial civic, cost 1060, behind CIVIL_ENGINEERING and
  NATIONALISM) inside 250 turns, so nothing places one.
- No seat fields a second ship (B-28r), and no INTERNATIONAL trade leg ever
  fires — which also bounds the new `routes` digest field: its domestic and
  city-state arms are exercised every game, its international arm by nothing.
- No antiquity dig happens at all, so the finer question this section used to
  ask — a dig by a seat whose ERA differs from row 0's — is doubly moot:
  eras are global 50-turn blocks (B-24r), so no two seats can be in different
  eras by construction.
- The CULTURE VICTORY's distance, re-measured (the pre-freeze figure was ~7
  visiting vs ~97 domestic): at t250 visiting peaks at 6 (mean 1.3) against a
  domestic peak of 68 (mean 41) — still an order of magnitude out of reach,
  now ~11x rather than ~14x. B-20r's scope should be read off this, not the
  old number.
- The space race needs Information-era techs no gate lane reaches; its poke
  lanes are the proof.
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
