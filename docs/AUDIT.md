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
- NOTHING IS CLOSED BY RECORDING ALONE (owner, 2026-08-19). A fidelity
  gap deferred because a mechanic is unimplemented becomes TWO open
  items: one for the missing mechanic, one for the deferred gap (naming
  the mechanic item as its blocker). "Recorded, not fixed" /
  "descoped" / "unmodeled" are deferrals, never permanent closures.

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
| B-20r tourism tails | 3 | art-museum theming needs work TYPE and artist identity; open-borders digs and work TRADES need a treaty system |
| B-21r suzerain rows | 1 | the residual descoped rows all need whole absent systems |
| B-22r World Congress | 4 | the vote is scripted (wire head pending); emergencies/competitions absent; 4 of ~18 resolutions |
| B-24r Ages/governors | 2 | four system-less dedication entries, dark-age policies, governor promotions, per-civ era drift |
| B-30r specialists | 2 | the mechanic is live; the free-assignment wire head and its observation stay open |
| B-31r trade-route tails | 2 | sea legs park at origin, no trading posts, plunder gold is a stylization, one candidate not a free pick |
| B-D unsourced data values | 3 | the sweep is done; nine NAMED stylizations stay open, each labelled at its definition |
| B-36r appeal adjacency terms | 2 | four terms real Civ 6 pays that this one does not, all four sources present |
| B-38r no wonder pays per-turn GP points | 1 | Hermitage's Artist points and Bolshoi's Writer/Musician points; flat culture stands in |
| B-39r wonder effects still dropped | 3 | fourteen rows name one each in their `description` |
| B-40r production-cost tails | 2 | the builder's 4*(x+1)+46 curve and the district's 40% under-represented discount |
| B-41r the wall pool is all-or-nothing | 1 | Civ 6 reduces centre damage instead, and scales wall damage by attacker class |
| B-42r the damage random range is contested | 1 | 0.8-1.2 vs 0.75-1.25; the same source states both |
| B-43r a homeless relic is LOST | 1 | Civ 6 holds it in reserve until a slot opens |
| B-44r city-state war has no decider | 1 | both engines carry the machinery; no policy ever reaches it |
| B-35r theological damage | 1 | deterministic and LINEAR where real Civ 6 rolls; the martyr draw shows a mirrored conditional draw is available |
| B-34r flood tails | 1 | GS floods also damage UNITS and kill citizens, and a centre on a floodplain loses HP; and the Dam/Great Bath that mitigates a river is not in the district roster |
| **B. Fidelity vs real Civ 6** | **31** | |
| C-1 POWER | 5 | no plants, no grid, no powered-yield term — 4 gaps wait on it |
| C-2 diplomatic agreements | 6 | war and peace and nothing between: open borders, work trades, alliances, denouncements |
| C-3 unit promotions | 4 | only MARTYR reaches a rule; choosing one is also a wire head |
| C-4 unique improvements | 3 | Batey / Colossal Head / Monastery, each a flat channel today |
| C-5 strategic-resource stockpiles | 4 | resources gate, they never accumulate or get spent |
| C-6 policy-card modifiers | 5 | ~38 adoptable cards are inert one-liners |
| C-7 trading posts | 2 | a route lays roads and plants nothing |
| C-8 draws made deterministic | 2 | inspirations, the religion pick, theological damage |
| C-9 faith-purchase classes | 1 | faith buys named units, never a class of building |
| C-10 non-GS city-state rows | 1 | Antioch/Amsterdam were replaced in GS; no line can be quoted |
| C-11 terrain the wonder rules need | 2 | the NARROWED placements are deliberately narrower than Civ 6's |
| C-12 the Film Studio is absent | 1 | the Theater tier's other top building, so its specialist upgrade has one path |
| C-13 ranged vs districts/cities | 2 | a scope-out on both, with the rest of the Encampment complete |
| C-14 no Inquisitor | 1 | "only Apostles initiate" is a roster gap, not a rule |
| C-15 garrison does not block capture | 2 | the move-onto-centre capture model is what is missing |
| C-16 spies / air units / GDRs | 4 | whole unit classes, and four dedications wait on them |
| C-17 embarked movement never upgrades | 1 | the flat EMBARK_MOVES stands in for every era |
| C-18 artifact civilization is the acting seat | 1 | real Civ 6 attributes the find to the event's own civ |
| C-19 grievances and warmongering | 2 | war has no reputational consequence with anyone |
| C-20 the Military Engineer's build list | 2 | five buildables and the finish-a-district charge |
| C-21 Great Person ACTIVATED abilities | 2 | every GP fires instantly; none is placed and used |
| C-22 the district roster is a subset | 3 | no Dam, Canal, Water Park, Preserve, Aerodrome, Government Plaza or Diplomatic Quarter |
| **C. Absent systems** | **56** | |
| **OPEN, TOTAL** | **87** | |

THE TOTAL JUMPED from 17 to 87 while the code only got better. The old number
counted the gaps somebody had written as gaps; chapter C counts the ones that
had been written down as DECISIONS, and the new B rows are what the same sweep
found at the definition sites — markers in the source that claimed a system was
absent when it had since been built, or claimed a gap was closed by being
written down. This is the honest figure, and it is the one the rule at the top
of this file asks for.

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
route as [fromTile, destTile, kind, expiresTurn, createdTurn, walkTile,
walkLeg] in CENTRE-TILE space, and
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
  relics, artifacts, the wonder-era term, NATIONAL PARKS, SHIPWRECKS and
  Archaeological-Museum THEMING all exist on both engines and are
  digest-compared. The Naturalist is a faith-only Modern civilian that a
  park CONSUMES; a park is the four-tile rhombus (Charming or better, one
  city, nothing built), pays Tourism equal to its tiles' total Appeal and
  2 amenities to its owner plus 1 to the four closest cities; a hull going
  down leaves a wreck an Archaeologist works once CULTURAL_HERITAGE is in;
  every dig carries an ERA and a CIVILIZATION into its museum slot, and a
  full museum of one era and three civilizations DOUBLES what it holds.

  TWO CORRECTIONS to what this entry used to claim.
  (1) "NOT a gap: the Archaeologist trains on every row ... what no seat
  does is PICK the column" was FALSE. There was no column:
  `archaeologistExcavate` lived in TS only, no dispatcher called it, the
  action enum had no EXCAVATE entry and the GPU had no twin, so
  `city_artifacts` could never leave 0 in either engine. The reachability
  probe's "antiquityDig 0/12 seeds" was reading an unimplemented verb, not
  an unreached one. (2) The ARCHAEOLOGIST is a civilian, and the
  production ladder's unit lane selects military chassis only — the same
  bug the Trader hit, so nothing could train one either. Both are fixed:
  EXCAVATE and PARK are appended verbs on both engines, and the
  Archaeologist has a civilian override beside builder/engineer/trader.

  REACHABILITY (measured, driven, 12 seeds x 250 turns): NEITHER chain is
  gate-reachable. The Archaeologist waits on NATURAL_HISTORY (Industrial,
  1050) and the Naturalist on CONSERVATION (Modern, 1540); no seed
  researches either, and no seed builds an Archaeological Museum. The
  proof is the poke pair `tests/gpu/parks_test.py` and
  `tests/cpu/culture/parks-theming.test.ts`, and the gate's silence on
  these mechanics is a coverage FACT, not evidence they agree.

  Open:
  - ART MUSEUM theming. Real Civ 6 themes it with Great Works of Art of
    the SAME TYPE by DIFFERENT Great Artists. Our Great Works of Art are
    per-city COUNTS with no work type and no artist identity, so the rule
    has nothing to read. TWO items: the missing per-work provenance, and
    the theming that waits on it.
  - OPEN-BORDERS digs. An Archaeologist may work foreign ground under an
    Open Borders treaty (or with the Terracotta Army). Neither engine has
    any diplomatic AGREEMENT at all. TWO items: the treaty system, and the
    dig gate that waits on it.
  - TRADING Great Works between civs, and the Great Work Heist that also
    moves one. Same missing system, so TWO items again.
  - The NATURALIST's faith cost is PROGRESSIVE in real Civ 6; the
    progression's magnitude is unsourced, so the flat GS price stands
    (`naturalistCost`) and the progression is open.
  - A park's ORIENTATION. Civ 6 fixes the rhombus vertical; our hex frame
    has no canonical vertical, so every rhombus is offered.
  - An ARTIFACT's civilization is the ACTING seat on both engines (the
    only seat every death site on both engines holds). Real Civ 6
    attributes the find to the event's own civilization.

  MEASURED, 12 seeds x 250 turns driven, under the Trader economy: visiting
  tourists peak at 5 (mean ~0.6) against a domestic peak of 79 (mean ~39).
  The culture victory is further out of reach than the pre-freeze note
  said, not closer — parks cannot move it while the civic that unlocks
  them sits past the horizon.
- **B-21r. City-state suzerain rows:** six perks are RULES (`SuzEffect`,
  both engines): Kabul double attack XP, Preslav cavalry-on-hills CS, Mexico
  City/Toronto regional reach, Anshan works science, Kumasi per-specialty
  route yields, Jerusalem Holy-Site pressure. The remaining catalog rows carry
  their reason in their `CITY_STATE_SUZERAIN_BONUS` entry's `note`: whole
  absent systems (POWER, trading posts, unit promotions, unique
  improvements/luxuries, a faith-purchase class, random-Inspiration draws) or
  a flat channel standing in for a %-scaling.
- **B-22r. World Congress residuals.** The session is real now: a
  rotating two-slot slate off `CONGRESS_RESOLUTIONS` (Urban Development
  Treaty, Patronage, Migration Treaty, Heritage Organization — era
  windows and A/B texts verbatim from the GS wiki table), the always-3rd
  Diplomatic Victory resolution from Modern (+/-2 DVP on the leader),
  the 10k vote-cost curve, outcome-then-target plurality, +1 DVP to
  every winning-combo voter, refund tiers 0/50/100, and the standing
  effects consumed on both engines (`congressSession` /
  `_world_congress`, readers `congressGppFactor` /
  `_congress_gpp_factor` and siblings); Statue of Liberty and Potala
  pay their sourced DVP at completion and Potala's diplomatic slot (and
  Forbidden City's wildcard) enter the live adoption
  (`wonderExtraSlots`). REACHABILITY (driven 250-turn rollouts, 4
  seeds): 5 sessions per seed, a standing slate on 132 of 250 turns,
  UDT/Patronage/Migration all reached, DVP spread 4-11 (the 20-point
  win stays poke-only); the DV resolution fired on ONE seed (its curve
  and refunds ran in-game); HERITAGE ORGANIZATION never stands in-gate
  (Modern arrives too late for its rotation slot) — the geopolitics
  pokes are its bar. OPEN:
  - **THE VOTE IS SCRIPTED.** Outcome, target and spend are one
    deterministic self-interest rule (`preference`/`_congress_pref`:
    free vote everywhere, ALL favor on the DV resolution). Real GS
    gives each player the choice, so the vote belongs on the WIRE as
    its own head (per-slot outcome bit + target + favor count) with the
    standing slate rendered into the observation — an action-space
    change, kept open by the no-permanent-closure rule.
  - **4 of ~18 resolutions.** Trade Policy rides the trader work
    (B-31r); Treaty Organization and Sovereignty need per-CS-type favor
    accounting; World Religion, Mercenary Companies, Arms Control,
    Public Works, Global Energy Treaty and the rest each name a system
    to carry them. Luxury Policy's outcome-A magnitude has no sourced
    number yet.
  - **Emergencies, Special Sessions, Scored Competitions.** The main
    real DVP faucet beside the DV vote. Floods already fire, so an
    Aid-Request-shaped competition has a trigger to hang off.
  - **Peace deals carry no terms;** the favor PENALTIES (CO2, global
    grievances, occupied capitals) are named by sources without rates —
    open, not invented.
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
- **B-30r. SPECIALIST residuals.** Specialists are a mechanic now, on both
  engines: slots = the district's standing buildings (max 3, dark under
  pillage), the sourced GS yields with the TOP-building tiers
  (`SPECIALIST_YIELDS`/`SPECIALIST_TIERS` — Commanders exist, the old "no
  Encampment specialist" note was wrong; wiki "Specialists (Civ6)"), and
  the AUTOMATIC assignment: OVERFLOW citizens — population beyond the
  workable pool — fill slots in PLACEABLE_DISTRICTS order
  (`effectiveSpecialists` / `_city_specialists`, a compared digest column).
  Citizen assignment was already an in-engine automatic rule for TILES
  (`assignWorkedTiles`), so specialists ride the same channel; the manual
  `setSpecialists` verb and its dead `city.specialists` map are deleted.
  REACHABILITY (driven 250-turn rollouts, 4 seeds): 3 of 4 seeds grow
  specialists in-game (first at t154/t183/t196; a standing specialist on
  72 and 69 of 250 turns on two seeds; one seed never overflows), so the
  serve gate exercises the base rule and its digest column late-game;
  the TIERS, the catalog-order fill and the pillage gate are poke-only
  (`district_breadth_test` section i). OPEN:
  - **THE ASSIGNMENT IS NOT A CHOICE.** Real Civ 6 lets the player place
    citizens freely (tiles AND slots); both engines run the one overflow
    rule. The override is a wire head — per-city slot counts, the same
    surface as a worked-tile override — and the observation renders
    neither. One item with the tile-assignment choice itself.
  - Specialists provide yields ONLY in Civ 6 (sourced — no GPP, unlike
    Civ 5); the Film Studio alternative for the Theater tier and the
    coal/oil/nuclear plant split remain unmodeled upstream (B-D records
    the generic POWER_PLANT).
- **B-31r. Trade-route tails.** The Trader is a UNIT now (Ancient
  civilian, FOREIGN_TRADE, progressive cost) that a route SPENDS; it walks
  the land path laying roads, holds the route open until the round trip
  completes, comes back on completion or a war cancel, and DIES to an
  at-war unit standing on its tile. The decision is a wire verb
  (`SeatActionRecord.route`), re-validated by both appliers, with the
  candidate row tripwire-compared in the serve gate. Open:
  - SEA legs: real GS water routes have range 30 with harbor refuel and
    the Trader embarks the journey; ours parks the Trader at the origin
    (`walkLeg` -1) and the route ends on the term alone.
  - TRADING POSTS are still not founded — no range refuel, no per-post
    gold at repeat destinations (Bandar Brunei's row waits on them).
  - `PLUNDER_ROUTE_GOLD` (50) is a stylization; no public source names
    the real base magnitude.
  - The destination is ONE candidate row plus a take/skip, not a free
    pick over every legal pair, and the observation renders no
    alternatives — the free-choice head is P8-surface work, alongside the
    route verb joining `env.step` (which today carries no buy/levy
    either).
- **B-36r. Appeal adjacency terms.** `tileAppeal` / `_tile_appeal` carry the
  real Civ 6 list except for four terms whose sources all EXIST here: an
  adjacent HOLY SITE, THEATER SQUARE or ENTERTAINMENT COMPLEX is +1 in real
  Civ 6 (this model pays only the negative districts), and an adjacent
  BARBARIAN OUTPOST is -1. Appeal feeds Neighborhood housing, the Seaside
  Resort's gold and tourism and now National Park legality, so this moves the
  economy on both engines. The rest of the real list (Dam, Canal, Water Park,
  Preserve, the unique improvements, the appeal-granting Great People) waits
  on C-22, C-4 and C-21.
- **B-38r. No wonder pays PER-TURN Great Person points.** `BuiltWonderDef`
  has no GP-point channel, so the Hermitage's "+3 Artist points per turn" and
  the Bolshoi Theatre's "+2 Writer / +2 Musician points per turn" are stood in
  for by flat `cityYields.culture`. The channel is the item; the two wonders
  are its first users.
- **B-39r. Wonder effects still dropped.** Fourteen `BUILT_WONDERS` rows name
  one in their own `description` — Mont St. Michel's Martyr guarantee on every
  Apostle, the Bolshoi's two free civics, St. Basil's +100% religious tourism
  and tundra yields, the Taj Mahal's era score, Alhambra's military slot,
  Venetian Arsenal's duplicate naval unit, Cristo Redentor's tourism ability,
  and the rest. Each is one effect, so the weight is for the sweep. NOT open
  any more: per-wonder Great Work and RELIC slots, which `GW_WONDER_SLOTS` and
  `RELIC_WONDER_SLOTS` now pay (Great Library, Hermitage, Bolshoi Theatre, St.
  Basil's, Mont St. Michel). The Hermitage's real slots take LANDSCAPE art
  only; that restriction is the same missing per-work TYPE B-20r names.
- **B-40r. Production-cost tails.** Two sourced curves, both live on every
  turn of every game.
  - The BUILDER costs `4 * (x + 1) + 46` in real Civ 6, where x is the number
    you have trained or purchased (captured Builders do not count; free ones
    do). `UNITS.BUILDER.cost` is the flat x=0 value, 50, forever.
  - A specialty DISTRICT is discounted 40% when you have built fewer of its
    type than the empire average (25% for the Government Plaza and Diplomatic
    Quarter, neither in this roster). `districtCostIn` / `rules.district_cost`
    charge the undiscounted curve.
- **B-41r. The wall pool is all-or-nothing, and class-blind.** `cityAssault`
  / `_assault_city` send the whole roll to `outerHp` until the pool is empty
  and only the spillover to city HP. Two sourced differences: real Civ 6 has
  the perimeter REDUCE damage to the centre rather than absorb it entirely
  while it stands, and it scales damage to the perimeter by attacker class
  (-85% for melee, -50% for ranged, full only for Bombard strength). So a
  walled city here is cracked in the wrong ORDER and by the wrong units.
- **B-42r. The combat damage RANDOM RANGE is contested.** The reverse-
  engineered formula quotes 0.75-1.25 while the same source says equal-
  strength hits land "reliably between 24 and 36", which is 30 x [0.8, 1.2]
  exactly. Both engines use 0.8-1.2. Open until a source settles it — the
  choice is currently made on internal consistency, not evidence.
- **B-43r. A relic with no open slot is LOST.** `placeRelic` / `_grant_relic`
  walk the seat's cities and discard the relic when every slot is full. Real
  Civ 6 holds it in reserve until a slot opens.
- **B-44r. War with a city-state has NO DECIDER on either engine.** Both
  halves of the machinery exist and agree: `declareWarOnCityState` /
  `sueForPeaceWithCityState` on TS, the war plane and the CS-attack mask column
  on the GPU. Neither engine has a production caller — TS's two entry points
  are reached only from tests, and the GPU lane's own header says the scripted
  gate cannot reach the mask column. So no seat is ever at war with a
  city-state in a driven game, and the whole subsystem is poke-covered only.
  It needs a wire head and a policy the way the trade route did. The
  diplomatic consequences of declaring wait on C-19.
- **B-D. UNSOURCED DATA VALUES — swept once; the named stylizations are
  OPEN, not closed.** The cpu/data walk fetched every magnitude from the GS
  Civilopedia row by row: all 28 wonders (12 corrected, every unlock now the
  real tech/civic), every unit, every technology and every civic (era, cost,
  prereqs — both trees were systematically off and now match the real tree),
  every building (costs; worship faith price 380), and every policy card
  with a live effect. What is LEFT is each labelled at its definition, and
  each is an open residual rather than a decision:
  - `GAME_SPEED` 0.6 (`constants`) — the one global speed stylization; real
    Civ 6 scales cost, yield and turn tables independently per speed.
  - the GOVERNMENTS' inherent bonuses (`policies` header) — flat stand-ins
    for the real per-government terms.
  - the BELIEF magnitudes (`religion` header) — model numbers, not Civ 6's.
  - Monument's loyalty term and Lighthouse's per-coast-tile food — flat
    stand-ins for sourced-but-differently-shaped rules.
  - the SPACEPORT's 1 gold upkeep — unsourced, left at the generic value.
  - the deliberate tuning constants in `seats` (its header names them):
    model tuning, not Civ 6 values, and every one is a place the two engines
    agree on a number real Civ 6 never states.
  - the per-CITY war-weariness split (`seats`, WAR_WEARINESS_LOSS_OVER_REQ_
    AMENITIES_*): one empire-wide penalty stands in for a per-city term.
  - the MILITARY ENGINEER production rule (`ENGINEER_LIVE` header) — authored,
    not sourced, and flipping it is a behaviour change on both engines.
  - the DEDICATION per-era availability windows (`seats`) — the Civilopedia
    publishes only Automaton Warfare's, so the round-robin offers every entry
    in every era.

## C. ABSENT SYSTEMS — the blockers, and the gaps waiting on them

THIS CHAPTER EXISTS BECAUSE "recorded" IS NOT "closed" (owner, 2026-08-19).
Every entry below was previously written down as a decision — "recorded, not
fixed", "descoped", "unmodeled", "out of scope", "the flat channel stands
in" — and each is really a DEFERRAL waiting on a system this engine does not
have. The rule now: the missing system is one open item, and each gap that
names it is another. The gaps are listed under their blocker so the
dependency is readable, and both halves count.

The OPEN weight jumped when this chapter landed. That is the point: the old
number was under-counting by treating deferrals as closures.

- **C-1. POWER — no plants, no grid, no powered-yield term.** Weight 5.
  Gaps waiting on it: the POWERED-yield SPLITS (GS puts part of late building
  yields behind Power; the vanilla flat yields stand in, `buildings`); the
  coal/oil/nuclear PLANT family, which the generic POWER_PLANT stands in for;
  Cardiff's suzerain row (+2 Power per Harbor building, a flat production
  channel today); and the Terrestrial Laser Station's powered-city condition
  in the space race.
- **C-2. DIPLOMATIC AGREEMENTS — no treaty of any kind.** Weight 6. There is
  war and peace and nothing between them. Gaps: OPEN BORDERS, and with it an
  Archaeologist working foreign ground (B-20r); TRADING Great Works between
  civs and the Great Work Heist (B-20r); ALLIANCES; DENOUNCEMENTS, which To
  Arms!'s casus belli needs (`seats` dedication header); and the World
  Congress's Treaty Organization resolution (B-22r).
- **C-3. UNIT PROMOTIONS — no promotion tree.** Weight 4. The only promotion
  that reaches a rule is MARTYR, drawn at the death. Gaps: Yerevan's suzerain
  row (choose an Apostle promotion instead of drawing it — and choosing is a
  DECISION with no wire record, so it needs a head too); every promotion-
  shaped policy card in `policies`; and veterancy beyond the flat XP levels.
- **C-4. UNIQUE IMPROVEMENTS — the roster holds only the generic set.**
  Weight 3. Gaps: Caguana's Batey, La Venta's Colossal Head and Armagh's
  Monastery (each a whole improvement with its own adjacency, standing in as
  a flat channel today), and the Chemamull-shaped appeal improvements.
- **C-5. STRATEGIC-RESOURCE STOCKPILES — resources gate, they do not
  accumulate.** Weight 4. `civHasStrategic` answers a boolean; real GS
  accumulates and SPENDS. Gaps: the Lagrange Laser Station's 30 Aluminum;
  unit resource COSTS and per-turn consumption; Zanzibar's two
  exists-nowhere-else luxuries.
- **C-6. POLICY-CARD MODIFIERS — ~38 cards are inert one-liners.** Weight 5.
  `policies` carries them with "(not modeled)" in the description: combat
  strength vs a class, production toward a unit class, per-unit maintenance
  discounts, goody-hut speed. Each needs a modifier channel the yield/combat
  bodies read. The cards EXIST and are adoptable, which makes this worse than
  an absence: a seat can spend a slot on nothing.
- **C-7. TRADING POSTS — a route lays roads and plants nothing.** Weight 2.
  Gaps: Bandar Brunei's suzerain row; the water-route RANGE refuel and the
  per-post gold at repeat destinations (B-31r).
- **C-8. RANDOM DRAWS THE MODEL MAKES DETERMINISTIC.** Weight 2. Gaps:
  Vilnius's random Inspiration at an era edge; the religion body's
  deterministic pick (`religion`); theological damage, which is linear where
  real Civ 6 rolls (B-35r names the same thing from the combat side).
- **C-9. FAITH-PURCHASE CLASSES — faith buys the units the rules name, not
  classes of BUILDING.** Weight 1. Gap: Valletta's suzerain row (City Center
  and Encampment buildings buyable with Faith).
- **C-10. THE CITY-STATE CATALOG HOLDS NON-GS ROWS.** Weight 1. Antioch and
  Amsterdam were REPLACED in Gathering Storm, so no GS line can be quoted for
  them and their flat channels stand in for text that no longer exists. Either
  they leave the roster or the roster stops claiming to be GS.
- **C-11. TERRAIN THE WONDER RULES NEED IS UNMODELED.** Weight 2. The
  NARROWED marker in `builtWonders` names each wonder whose real placement
  rule asks for terrain this map generator does not produce, so the modelled
  rule is deliberately narrower than Civ 6's.
- **C-12. THE FILM STUDIO IS NOT IN THE BUILDING ROSTER.** Weight 1. It is
  the Theater Square's alternative top building, so `SPECIALIST_TIERS` names
  the Broadcast Center alone where real Civ 6 accepts either.
- **C-13. RANGED STRIKES DO NOT ENGAGE DISTRICTS OR CITIES.** Weight 2.
  Recorded as a scope-out for both. The rest of the Encampment (`encamp_hp`
  pool, movement block, garrison pool, district strike, training XP) is
  complete, which is what makes the missing arm visible.
- **C-14. NO INQUISITOR.** Weight 1. Real Civ 6 lets Inquisitors initiate
  theological combat and defend against it; this roster has no such unit, so
  "only Apostles initiate" is a roster gap, not a rule.
- **C-15. A GARRISON DOES NOT BLOCK A CAPTURE.** Weight 2. Real Civ 6 takes a
  city by moving a melee unit ONTO the centre, so a defender there must die
  first. Here the centre falls at 0 HP and CITY-FIRST targeting never makes
  the garrison attackable on its own, so blocking would deadlock — the
  deadlock is the symptom; the missing piece is the move-onto-centre capture
  model, and both halves are open.
- **C-16. SPIES, AIR UNITS AND GIANT DEATH ROBOTS.** Weight 4. Whole unit
  classes with no roster entry. Gaps: four dedication catalog entries (Sky
  and Stars, Bodyguard of Lies, Automaton Warfare, Wish You Were Here) and
  the Great Work Heist that C-2 also names.
- **C-17. EMBARKED MOVEMENT DOES NOT UPGRADE.** Weight 1. `constants` records
  that the tech upgrades to embarked movement are unmodeled; the flat
  EMBARK_MOVES stands in for every era.
- **C-18. AN ARTIFACT'S CIVILIZATION IS THE ACTING SEAT.** Weight 1. Both
  engines stamp the seat whose ORDER buried the find, because that is the
  only seat every death site on both engines holds. Real Civ 6 attributes it
  to the event's own civilization. Named here rather than in B-20r because
  the fix is a provenance plumbed through every death path.
- **C-19. GRIEVANCES AND WARMONGERING — war costs nothing but the war.**
  Weight 2. No seat's standing with anyone moves when it declares, razes or
  conquers. Gaps: the diplomatic consequences of declaring on a city-state
  (`declareWarOnCityState`), the suzerain's reaction, and the To Arms!
  dedication's casus belli, which C-2 also names from the treaty side.
- **C-20. THE MILITARY ENGINEER BUILDS ONE THING.** Weight 2. Real Civ 6 gives
  it Fort, Airstrip, Missile Silo, Mountain Tunnel, Reinforced Barricade and
  Modernized Trap, plus spending a charge to finish 20% of a Canal, Dam,
  Aqueduct or Flood Barrier. Only the FORT exists here. The Airstrip waits on
  C-16 and three of the four district charges wait on C-22.
- **C-21. GREAT PEOPLE FIRE INSTANTLY; NONE IS PLACED.** Weight 2. A claimed
  Great Person pays its effect at the claim (`recruit`). Real Civ 6 gives many
  of them an ACTIVATED ability used later on a chosen tile. Gaps: the
  appeal-granting Great People (Alvar Aalto, Charles Correa) that B-36r names,
  and every "activate in a city" ability in the roster.
- **C-22. THE DISTRICT ROSTER IS A SUBSET.** Weight 3. Twelve of Civ 6's
  districts exist; the DAM, CANAL, WATER PARK, PRESERVE, AERODROME, GOVERNMENT
  PLAZA and DIPLOMATIC QUARTER do not. Gaps: their appeal terms (B-36r), the
  Military Engineer's finish-a-district charge (C-20), the Dam's flood
  protection that B-34r names, and the Preserve's housing table.

## Reachability — what the green gate does NOT prove

A green serve run proves the two engines agree over the regime the scripted
seeds actually enter. MEASURED, 12 seeds x 250 turns driven
(`tools/gpu/reachability_probe.py`) — these are counts, not estimates, and
three of them overturned what this section used to assert:

| mechanic | seeds reaching | first |
|---|---|---|
| faith-buy kind 6 (APOSTLE purchase) | 12/12 | t73 |
| two enemy religious units ADJACENT (theological combat's precondition) | 5/12 | t125 |
| a second HULL on any seat | 6/12 | t143 |
| an INTERNATIONAL trade leg | 0/12 | never |
| URBANIZATION civic | 1/12 | t242 |
| a NEIGHBORHOOD placed | 1/12 | t243 |
| an antiquity dig (artifact in a slot) | 0/12 | never |
| NATURAL_HISTORY (the Archaeologist's civic) | 0/12 | never |
| CONSERVATION (the Naturalist's civic) | 0/12 | never |

- THEOLOGICAL COMBAT IS REACHED, in 5 of 12 seeds from t125. The old
  claim here — "a gate that never puts two apostles side by side proves
  nothing about it" — was wrong: the gate does, so the resolver's
  deterministic damage and its apostle-only initiation ARE gate-covered.
- The APOSTLE BUY fires in every seed from t73 and the 250-turn gate is
  green, which is what closed B-18r's predicted lifecycle drift.
- URBANIZATION and a NEIGHBORHOOD arrive in ONE seed at t242/t243 — the
  Trader-economy trajectory is the first to put the column inside the
  gate at all; every other seed still leans on the poke lane.
- A SECOND HULL reaches 6 of 12 seeds from t143. The route KINDS moved
  the other way under the Trader economy: routes wait for FOREIGN_TRADE
  plus a trained Trader (~t60+), by which point specialty districts lift
  the domestic pair past the flat city-state yields in the candidate
  scan, and a completion hands the Trader straight to the next domestic
  pair. Measured over 12 driven seeds: 319 domestic routes (~27/seed,
  239 natural round-trip completions, 13 early ends), 11 city-state
  routes over 5 seeds, and the INTERNATIONAL arm fires in NONE — it was
  1/12 before the rework. The intl arm lives in `trade2_test` pokes and
  the TS trade-fidelity suite, and the serve gate's ROUTE tripwire still
  compares the candidate pair on every turn a Trader is free — but the
  digest's intl rows ride pokes alone.
- No antiquity dig happens at all, and the reason is now MEASURED rather
  than assumed: no seed researches NATURAL_HISTORY, so no seat can train an
  Archaeologist, and none builds the museum a dig lands in. The same
  horizon hides the National Park, whose CONSERVATION civic sits a whole
  era further out. Both mechanics are poke-covered only — see B-20r.
  (The finer question this section used to ask — a dig by a seat whose ERA
  differs from row 0's — is doubly moot: eras are global 50-turn blocks
  per B-24r, so no two seats can be in different eras by construction.)
- The CULTURE VICTORY's distance, re-measured under the Trader economy:
  at t250 visiting peaks at 5 (mean ~0.6) against a domestic peak of 79
  (mean ~39) — the gap WIDENED to ~60x on means. B-20r's scope should be
  read off this, not any older number.
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
