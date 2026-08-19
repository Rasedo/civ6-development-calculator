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
| B-21r suzerain rows | 1 | the residual descoped rows all need whole absent systems |
| B-22r World Congress | 6 | one resolution type of many; emergencies and competitions absent |
| B-24r Ages/governors | 2 | four system-less dedication entries, dark-age policies, governor promotions, per-civ era drift |
| B-30r specialists | 6 | a mechanic neither engine has: wire column, assignment, yields |
| B-31r trade-route tails | 6 | a Trader UNIT and a route wire verb |
| B-D unsourced data values | 1 | swept; residuals are NAMED stylizations, each labelled at its definition |
| B-35r theological damage | 1 | deterministic and LINEAR where real Civ 6 rolls; the martyr draw shows a mirrored conditional draw is available |
| B-34r flood tails | 1 | GS floods also damage UNITS and kill citizens, and a centre on a floodplain loses HP; and the Dam/Great Bath that mitigates a river is not in the district roster |
| **B. Fidelity vs real Civ 6** | **31** | |
| **OPEN, TOTAL** | **31** | |

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
  open-borders digs. The relic rate no longer overstates: only a MARTYR
  apostle leaves one, and the promotion is drawn at the death.
  NOT a gap: the Archaeologist trains on every row — `trainableUnits` /
  `_trainable_units` gate it on the museum's free artifact slot through
  `_type_civic_slot_ok`, one body per engine. What no seat does is PICK
  the column, which is a ladder question, not a wiring one.
  MEASURED, 12 seeds x 250 turns driven: visiting tourists peak at 6
  (mean 1.3) against a domestic peak of 67, putting the culture
  victory ~11x out of reach. Re-measure before
  quoting it — every round since has moved the economy.
- **B-21r. City-state suzerain rows:** six perks are RULES (`SuzEffect`,
  both engines): Kabul double attack XP, Preslav cavalry-on-hills CS, Mexico
  City/Toronto regional reach, Anshan works science, Kumasi per-specialty
  route yields, Jerusalem Holy-Site pressure. The remaining catalog rows carry
  their reason in their `CITY_STATE_SUZERAIN_BONUS` entry's `note`: whole
  absent systems (POWER, trading posts, route PATHS, unit promotions, unique
  improvements/luxuries, a faith-purchase class, random-Inspiration draws) or
  a flat channel standing in for a %-scaling.
- **B-22r. World Congress tails:** one resolution type only (real GS
  rotates many); Emergencies and Scored Competitions — the main real
  DVP sources — are unmodeled (awarding via the resolution winner is
  faithful in shape, overstated in rate); every civ commits ALL favor
  (no vote-size chooser on any seat); peace deals carry no terms; the
  favor PENALTIES (CO2, global grievances, occupied capitals) are
  named by sources without rates — recorded, not invented.
- **B-24r. Ages/governors tails:** the DEDICATION catalog now holds eight,
  both faces sourced and hooked for the four addable ones (To Arms!, Hic Sunt
  Dracones, Reform the Coinage, Heartbeat of Steam); residuals: the four
  entries needing spies / air units / GDRs / seaside-resort tourism (both
  faces), the per-era availability windows (the Civilopedia publishes only
  Automaton Warfare's), To Arms!'s special Casus Belli (no denouncements),
  and the corps/army kill event (no formations — a faithful zero, like Civ 6
  before Nationalism). Also open: dark-age policies; governor PROMOTIONS, blocked on
  governor IDENTITY — a promotion attaches to a NAMED governor persisted in
  one city, needing assignment state and the establishment clock, where
  titles here are anonymous per-turn seats (the 5-turn clock gates only
  promotions — the +8 loyalty is by-assignment in real R&F, sourced, so the
  stateless greedy ranking is faithful for the one channel modeled); per-civ
  tech-era drift
  (eras are global 50-turn blocks).
- **B-35r. Theological damage is deterministic and LINEAR.** Real Civ 6
  rolls; `theologicalCombatPhase` / `_theological_combat_phase` take
  theoBaseDamage plus theoDamage x the religious-strength difference with no
  random multiplier, and the linear curve is this repo's own, not the game's
  exponential one. The reason this stood — "a conditional draw would have to
  be mirrored draw-for-draw" — no longer holds: the MARTYR draw in the same
  routine is mirrored and the 250-turn gate is green over it. Closing this
  needs the real religious-combat formula sourced, not just a multiplier.
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
- **B-D. UNSOURCED DATA VALUES — swept; named stylizations remain.**
  The full cpu/data walk fetched every magnitude from the GS Civilopedia
  row by row: all 28 wonders (12 corrected, every unlock now the real
  tech/civic), every unit, every technology and every civic (era, cost,
  prereqs — both trees were systematically off and now match the real
  tree, with BUTTRESS, SCIENTIFIC_THEORY, ADVANCED_BALLISTICS, COMPOSITES
  and the SCORCHED_EARTH civic entering, and ELECTRONICS deleted as not a
  GS node), every building (costs; worship faith price 380), and every
  policy card with a live effect. What remains is RECORDED, not unsourced,
  each labelled at its definition: GAME_SPEED 0.6 (the one global speed
  stylization), the POWERED-yield splits (GS puts part of late building
  yields behind POWER, unmodeled — the vanilla flat yields stand in,
  sourced from the standard-rules Civilopedia, incl. the generic
  POWER_PLANT for the coal/oil/nuclear family), the GOVERNMENTS' inherent
  bonuses and inert policy one-liners (`policies` header), the BELIEF
  magnitudes (`religion` header), Monument's loyalty term and Lighthouse's
  per-coast-tile food (flat stand-ins), and the deliberate tuning
  constants in `seats` (its header names them).

## Recorded deviations — decided, sourced, and NOT open work

These are not gaps waiting on a round; they are choices with a reason, kept
here so nobody re-opens them as findings. They carry no weight in the table
above.

- **Ranged strikes against a DISTRICT** are out of scope, matching the
  ranged-vs-city scope-out. The rest of the Encampment (`encamp_hp` pool,
  movement block, garrison pool, district strike, training XP) is complete.
- **Only APOSTLES initiate theological combat.** Real Civ 6 also allows
  Inquisitors; this roster has no INQUISITOR unit at all, so the pair we model
  is the whole class.
- **A garrison does not BLOCK a capture; it dies with the city.** Real Civ 6
  takes a city by moving a melee unit onto the centre, so a defender standing
  there has to be destroyed first. Here the centre is taken the moment its HP
  reaches 0 and CITY-FIRST targeting means the garrison was never attackable in
  its own right, so blocking would deadlock: the units on the centre die with
  it instead ("when a city is captured, all units within it are destroyed").
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
| two enemy religious units ADJACENT (theological combat's precondition) | 7/12 | t98 |
| a second HULL on any seat | 7/12 | t129 |
| an INTERNATIONAL trade leg | 1/12 | t213 |
| URBANIZATION civic | 0/12 | never |
| a NEIGHBORHOOD placed | 0/12 | never |
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
- A SECOND HULL now reaches 7 of 12 seeds from t129, where the one-galley
  heuristic held it at zero: dropping it put every naval rule past the first
  ship inside the gate. The same wider trajectory finally fires an
  INTERNATIONAL trade leg, in one seed at t213 — so the `routes` digest
  field's international arm is exercised, barely, and its domestic and
  city-state arms every game.
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

The feature-removal techs are VERIFIED against the GS Civilopedia tech
pages: Mining "Allows chopping of Woods", Irrigation "Allows clearing of
Marsh", Bronze Working "Allows chopping of Rainforest" — all three as
implemented.

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
