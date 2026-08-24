# Engine audit — open items

THIS FILE IS A LIST OF OPEN ITEMS. Nothing else belongs in it. A
resolved entry is DELETED, not annotated — what was fixed, when and why
is the git log's job. Everything below is open work, stated against the
current engine by symbol.

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
GREEN end to end (serve: 12 seeds x 250 turns, digest per turn per
group). Restore the seed set to 24 before the final hunt — 12 is a
temporary dev-speed cut. All surviving `_LIVE` master switches are ON
(GOVERNMENTS_ADOPTION, B18_FOLLOWER_COUPLING, CITY_RELIGION_ADDER,
ADMIRAL_MARCH, DEDICATION_PAYOUTS, ENGINEER, BARB_SCOUT_OPENER); no
mechanic is inert behind a flag.

## What is left (owner-requested; guesstimates)

No "% complete" — it needs the weight of everything already CLOSED as a
denominator, and closed entries are deleted here by design, so it could
only ever be a delta chain, and delta chains drift. What replaces it is
the OPEN weight, hand-weighted 1–8 by implementation size, recomputable
from the list below.

| Open item | Weight | What is open |
|---|---|---|
| A-1r the district registry holds ONE tile per TYPE | 1 | registry-counted columns undercount a repeatable district; every such column is zero today, so it is a trap, not a live bug |
| A-2 the road apply arm skips the wonder clause | 1 | TS `canBuildRoad` accepts a natural-wonder tile the GPU mask refuses; unreachable until the driver fuzzes a road order |
| **A. Engine vs engine** | **2** | |
| B-20r tourism tails | 1 | the Naturalist's progressive cost is unsourced; the park rhombus has no canonical vertical |
| B-21r suzerain rows | 1 | the descoped rows each need a whole absent system; Geneva's magnitude is flat where the source scales |
| B-22r World Congress | 2 | the observation renders the standing slate, four resolutions have no carrier, the culture bomb spares unfinished construction, scored competitions and peace TERMS are absent |
| B-24r Ages/governors | 1 | governor identity/promotions, dark-age policies, To Arms!'s casus belli, the corps/army kill event, per-civ era drift |
| B-30r specialists | 1 | a plot LOCK outlives the city that set it |
| B-31r trade-route tails | 1 | the pass-through post gold has no stored path; plunder gold is a stylization; the summed-yield key and one-candidate head are P8-surface |
| B-53r the great-person queue | 1 | the offer is re-derived rather than frozen, and faith never patronizes anyone |
| B-D unsourced data values | 2 | channel-blocked government tails, and the shape differences / model tuning no source can close |
| B-36r appeal adjacency terms | 1 | the CIVILIZATION-unique improvements' terms (C-26) |
| B-39r wonder effects still dropped | 1 | two residuals, blocked on B-20r or B-34r |
| B-45r sourced-sweep finds in the other rows | 1 | five effects need a unit-granting wonder channel, faith patronage (B-53r), a rival-recruit event, or B-31r's route yields |
| B-54r flanking and support vs their own page | 1 | the two stacks a UNIQUE UNIT raises wait on C-26 |
| B-64r embarking and disembarking cost the whole turn | 1 | Civ 6 charges the transition 3 MP and carries the remainder; both engines spend everything |
| B-56r the six inert promotions | 1 | six rows name a mechanic neither engine has — sight-blocking, class-aware ZOC, escort formations, an air-roll promotion term, a NAVAL RAIDER class |
| B-57r the SNIPE head stops at the distance-2 ring | 1 | the ring-3 columns do not exist, so a +1 Range promotion widens a legality no seat can order |
| B-58r the religious purchase asks for a Shrine | 1 | Civ 6 asks for a MAJORITY RELIGION and a Temple; neither engine reads what the city follows |
| B-59r the religious spread is a flat lump | 2 | no HP scaling, no base 25% strip, and a city-state cannot be converted |
| B-51r the Encampment's second pool | 2 | the separate-pools claim is unsourced; a shot-emptied district is walk-over ground where Civ 6 conquers on entry |
| B-44r city-state war tails | 1 | the barbarian walker raids only majors because it beelines to one nearest city |
| B-61r the Great Person clauses with no carrier | 2 | 20 rows name a mechanic nothing here has; eight sweep-found channels dropped with their blockers |
| B-60r the dig's DATE, and the hull nobody dates | 1 | the era is the ACTOR's research, and a barbarian or minor kill leaves no wreck |
| B-34r flood tails | 1 | no per-tile flood count (the Great Bath's faith), and the climate/coastal tails wait on their systems |
| B-63r the grievance ledger's magnitudes | 1 | the occupied/razed rows ship at their published CEILING; the gang-up bar is a heuristic |
| B-62r a natural wonder takes no tile adds | 1 | no pantheon feature yield, suzerain adjacency or Preserve band on a natural-wonder tile, against the Grove's own text |
| **B. Fidelity vs real Civ 6** | **29** | |
| C-1 POWER | 2 | four renewables, the Biosphere, the Hydroelectric Dam building, decommission/recommission, the reactor age, minors never powered |
| C-2 diplomatic agreements | 3 | alliance TYPES and LEVELS, diplomatic visibility, the negotiated two-sided deal, and the agreements that need one |
| C-5 strategic-resource stockpiles | 2 | the shortage penalty's magnitude is unpublished; resource trading waits on C-2 |
| C-6 policy-card modifiers | 1 | two of the 49 cards are inert, each blocked on a system below |
| C-8 draws made deterministic | 2 | the Great Person replacement walks a queue and the Congress slate rotates, where Civ 6 draws both; the seeder places a fixed minor roster |
| C-16 the spy's second half | 2 | the escape sequence, captured spies, the promotion pool, counterspy levels, the same-mission gate, two carrier-less missions |
| C-20 the Military Engineer's build list | 1 | the Missile Silo (C-31), Mountain Tunnel (C-35), railroad (C-36), clean-fallout and remove-improvement verbs |
| C-22 the district roster | 2 | the Canal carries no naval passage (C-35), five Government Plaza buildings have no effect body, the Preserve table is a stylization |
| C-24 the climate arc | 1 | nothing is ever submerged (C-35), railroads emit nothing (C-36), Mitigation's award has no one-off grant channel |
| C-26 no civilization uniques | 5 | no civ ability, leader ability/agenda, unique unit or unique infrastructure — PARKED by owner decision |
| C-27 pillaging pays no yields | 2 | nothing banks a pillage, and no hull is offered the verb (the Coastal Raid) |
| C-28 tourism accrues to no one in particular | 2 | nothing ACCRUES tourism toward one rival, which the international modifiers and the Rock Band key on |
| C-29 no RESOLVED suzerain | 1 | a rule that reweights envoys BY the current suzerain has no fixed point |
| C-30 city-states carry no research | 1 | a minor's borders never close and the suzerain's passage lifts nothing |
| C-31 the two chassis with a system behind them | 1 | nuclear devices (an area attack + fallout + delivery) and the Rock Band (C-28) |
| C-32 the new classes have no promotion tree | 2 | air, GDR, support, naval-raider and spy chassis are offered no promotion |
| C-33 the Giant Death Robot is only its stats | 2 | its water walk, heal gate, district penalty and Future-era upgrades have no carrier |
| C-34 air combat's second half | 2 | Interception, Patrol and Priority Target — the reason a fighter exists — do not exist |
| C-35 the land/water fact never moves | 2 | one overloaded static bit blocks submersion and the Canal's passage |
| C-36 no railroad | 2 | no second movement tier, no per-hex Iron/Coal charge, no CO2 |
| **C. Absent systems** | **38** | |
| **OPEN, TOTAL** | **68** | |

RULE FOR THE NEXT ROUND: when an entry closes, delete its row here in the
SAME commit. When one opens, add a row with its weight and its reason. Do
not add a "done" column back.

## A. Engine vs engine — where the two implementations can answer differently

THE DIGEST IS THE ONLY INSTRUMENT FOR THIS CLASS — both engines can be
equally faithful to Civ 6 and still disagree with each other. Its green
bounds nothing the gate does not reach ("Reachability" below), and a round
that widens coverage is worth more here than a round that re-reads the
exporter.

- **A-1r. THE DISTRICT REGISTRY HOLDS ONE TILE PER TYPE.** `city_dist_tile`
  is [B, row, slot, nD] — one tile per (city, district type) — while TS keeps
  `city.districts` as a LIST that may hold the same type twice (the
  NEIGHBORHOOD, DAM and CANAL are `allowMultiple`). The consumers that COUNT
  instances are off the tile plane already (`_seat_housing`'s repeatable
  loop, `_detect_seat_boosts`' repeatable branch); what is still
  registry-counted is district MAINTENANCE, amenities, loyalty, governor
  titles and the spy penalty. Every one of those columns is ZERO for all
  three repeatable districts, so nothing diverges today — this is a trap for
  the next repeatable row. Closing it means a per-city COUNT plane beside
  the registry, or moving each column onto the tile walk.

- **A-2. THE ROAD APPLY ARM SKIPS THE WONDER CLAUSE.** The GPU's
  `_seat_engineer_job_mask` refuses a road on a natural-wonder tile
  (`~self.nwonder`); the TS apply arm validates with `canBuildRoad`, which
  asks `engineerTileOk` and never the wonder. No driven trajectory reaches
  it (the mask never offers the tile), but the driver may fuzz decisions,
  and then TS lays a road the GPU refused. One clause in `canBuildRoad`.

What is NOT a source of new members: a seat asymmetry. Seat 0 rides the same
machinery as every other row, and `tools/gpu/seat_symmetry_check.py` holds
that with both allowlists empty.

## B. Fidelity vs real Civ 6 — where both engines agree on the wrong answer

NO GATE CAN CATCH THIS CLASS. Parity proves the two engines match, never
that either matches the real game, so every entry here closes against a
Civ 6 source or is recorded as unverifiable.

- **B-20r. Tourism tails.** The mechanics ship (works, relics, artifacts,
  parks, shipwrecks, both museums' theming, provenance across capture);
  `tests/gpu/parks_test.py` and `tests/cpu/culture/parks-theming.test.ts`
  are the bar where the gate is thin. Open:
  - The NATURALIST's faith cost is PROGRESSIVE in real Civ 6; the
    progression's magnitude is unsourced, so the flat GS price stands
    (`naturalistCost`) and the progression is open.
  - A park's ORIENTATION. Civ 6 fixes the rhombus vertical; our hex frame
    has no canonical vertical, so every rhombus is offered.
- **B-21r. City-state suzerain rows.** Eleven perks are RULES
  (`SUZ_EFFECTS`, both engines). The remaining catalog rows carry their
  reason in their `CITY_STATE_SUZERAIN_BONUS` entry's `note`: each needs a
  whole absent system (unique improvements/luxuries, a gold-purchase
  discount, a per-district Great Person channel) or is a flat channel
  standing in for a %-scaling. Geneva's condition ships
  (`cityStateSuzerainCapitalBonus` / `_suz_capital_mask`, peace with every
  MAJOR); what survives of its row is the magnitude alone — +15% of the
  city's Science against a flat +3.
- **B-22r. World Congress residuals.** Seventeen regular resolutions, the
  DV resolution, emergencies as special sessions, the favor tie-break,
  refund tiers and the ballot wire all ship (`congressSession` /
  `_world_congress`; emergencies in `cpu/core/emergency.ts` /
  `_raise_emergency` and siblings). Gate reach: a ballot on 12/12 seeds,
  ~5 sessions per seed; rows past rotation rank 9 are poke-only
  (`world-congress.test.ts`, `congress_vote_test`); the CITY_STATE
  emergency trigger is poke-only (`tests/cpu/minors/emergencies.test.ts`,
  `tests/gpu/emergency_test.py`). OPEN:
  - **THE OBSERVATION RENDERS THE STANDING SLATE, not the UPCOMING one.**
    A ballot addresses the session about to run; `_congress_upcoming` can
    compute its slate but nothing renders it, so a net votes on the
    previous session's resolutions.
  - **FOUR resolutions have no carrier**: Arms Control (weapons of mass
    destruction, C-31); Espionage Pact — the old blocker ("no spies") is
    gone since the Spy shipped, so the row needs its own sourcing pass,
    and its payload may read diplomatic VISIBILITY (C-2); Governance
    Doctrine (a governor roster with appointment and promotion, B-24r);
    Luxury Policy — SOURCED: "A: Duplicates of this Luxury resource grant
    additional Amenities. / B: This Luxury resource grants no Amenities."
    B is fully specified, A publishes no number, and nothing here counts
    DUPLICATE copies of a luxury. A resolution whose two outcomes cannot
    both act eats a rotation slot and passes a no-op, so it waits whole.
  - **THE CULTURE BOMB DOES NOT WIPE UNFINISHED CONSTRUCTION.** SOURCED
    (Culture Bomb): a bombed tile carrying a district or wonder under
    construction is flipped anyway, "wiping out any unfinished
    construction in the process". `cultureBomb` / `_culture_bomb` leave
    such a tile alone. Closing it needs a cross-engine
    cancel-the-queued-item primitive: dropping an item from the middle of
    the TS `City.queue` array has no GPU twin (`city_current` +
    `city_qtile`).
  - **SCORED COMPETITIONS are absent.** Aid Request, Border Dispute,
    Catastrophe, Military Competition and the rest score participants
    over a window and pay the podium — the other real DVP faucet. Floods
    already fire, so an Aid-Request-shaped competition has a trigger;
    what is missing is the per-seat scoring window and the podium payout.
  - **Peace deals carry no terms.** Real Civ 6 brokers peace through the
    trade screen — cities, gold, resources and favor on one deal. Blocked
    on C-2's negotiated deal, not on the treaty system.
- **B-24r. Ages/governors tails.** Twelve dedications ship, both faces,
  over the published era windows (`DEDICATION_ERAS` / `_ded_eras`). OPEN:
  - **GOVERNOR PROMOTIONS, blocked on governor IDENTITY.** A promotion
    attaches to a NAMED governor persisted in one city — assignment state
    plus the establishment clock — where titles here are anonymous
    per-turn seats (the stateless greedy ranking is faithful for the one
    +8 loyalty channel modeled, sourced by-assignment in R&F).
  - **DARK-AGE POLICIES** — the dark-age card pool does not exist.
  - **To Arms!'s special Casus Belli.** The denouncement it rides on
    ships now (C-2); what is missing is the casus-belli KIND itself — a
    war declaration variant the war table does not carry.
  - **The corps/army kill event** — no formations exist (a faithful zero
    only before Nationalism).
  - **Per-civ tech-era drift** — eras are global 50-turn blocks.
- **B-30r. SPECIALIST residuals.** The mechanic ships (slots, sourced
  yields/tiers, pins, locks, overflow; `citizens_test` and
  `district_breadth_test` section i are the poke bar). OPEN:
  - **A LOCK OUTLIVES THE CITY THAT SET IT.** The lock lives on the PLOT
    on both engines, so a plot that changes hands carries it to the new
    owner, where real Civ 6 loses citizen management with the city.
    Closing it: clear the lock wherever tile ownership moves. (The
    specialist PIN is city-borne and already drops at capture.)
- **B-31r. Trade-route tails.** The Trader unit, sea legs, trading posts,
  chained reach and the whole-destination-set candidate all ship. OPEN:
  - **The PASS-THROUGH half of the post gold** ("+1 Gold to the yields of
    every Trade Route which passes through this city") has no carrier — a
    route stores endpoints and a walking Trader, never the cities it
    passes; blocked on a stored route PATH.
  - A city-state's maritime access is its CENTRE's alone (no minor
    Harbor exists to widen it).
  - `PLUNDER_ROUTE_GOLD` (50) is a stylization; no public source names
    the real base magnitude.
  - **The destination is ONE candidate row plus a take/skip.** The single
    summed-yield ranking key is this engine's heuristic, and the policy
    sees one candidate — the free-choice head is P8-surface work,
    alongside the route verb joining `env.step`.
- **B-34r. Flood tails.** The GS flood ships whole (severity ladder, river
  reach, river-scoped shield, the Dam; `flood_severity_test` poke f pins
  the reach). OPEN:
  - **The Great Bath's "+1 Faith for every time a tile belonging to this
    city has been Flooded"** needs a per-tile flood COUNT nothing stores.
  - Climate change ending fertilization at Phase IV, the Egyptian
    ability, the Soothsayer and COASTAL floods all wait on systems that
    do not exist here.
- **B-36r. Appeal adjacency terms.** Every district AND improvement term
  ships off one catalog column (`DistrictDef.appealAdjacent` /
  `_appeal_adj`, `ImprovementDef.appealAdjacent` / `_imp_appeal_adj`), and
  a Great Person can grant city-tile appeal (`gpAppealResolver` /
  `_gp_appeal_plane`). OPEN: the CIVILIZATION-unique improvements' terms
  (C-26).
- **B-39r. Wonder effects still dropped.** The sourced sweep shipped
  fourteen channels, the Mausoleum's engineer charge and Cristo Redentor's
  shield. OPEN, each blocked: Apadana's "+2 Great Work slots (any type)"
  and the Hermitage's LANDSCAPE-only art slots, both waiting on the
  per-work TYPE B-20r names; the Great Bath's per-flood faith (B-34r).
- **B-45r. The effects the SOURCED sweep found in the other rows.** Three
  of eight have channels (`cityYieldPerImprovement`,
  `boostTechsThroughEra`, `districtGpPoints`; the gate finishes wonders
  but `wonder_effects_test` sections 13-15 are the proof for these).
  OPEN — the five with nowhere to live:
  - Stonehenge's free Prophet and its found-a-religion-on-the-wonder
    clause, and the Pyramids' free Builder: no wonder effect channel
    GRANTS A UNIT, and the completion body has nowhere to spawn one from.
  - The Oracle's 25%-cheaper Great Person patronage: faith never buys a
    Great Person (B-53r), so there is nothing to discount.
  - The Great Library's boost when a RIVAL recruits a Great Scientist: no
    engine raises an event on another seat's recruit.
  - The Colossus' and Great Zimbabwe's +1 route capacity and free Trader,
    Great Zimbabwe's per-bonus-resource route gold and Sankoré's three
    route-yield terms: all wait on B-31r's route-yield work.
- **B-54r. Flanking and support against their own page.** Every rule on
  the page ships, plus the four higher stacks a promotion or Great Person
  raises. OPEN: **the two stacks a UNIQUE UNIT raises** — Zulu's Impi and
  Macedon's Hypaspist raise flanking or support for themselves alone, and
  no civilization unique exists (C-26).
- **B-64r. Embarking and disembarking cost the whole turn.** Weight 1.
  CIV6 (Movement, "Embarking"): the transition requires "either 3 Movement
  or all the unit's Movement for the round (if it has less than 3
  Movement)", and "if a unit has more than 3 Movement available for either
  embarking or disembarking, the remaining points are transferred to the
  new movement mode, and that unit may manage to continue moving in this
  same turn" — the page's own example is a 4-MP cavalry unit that embarks
  and still walks one water tile. Both engines charge the whole pool
  instead: `stepUnit`'s `transition` arm and `_step_verb`'s twin price the
  step at everything the mover has left. The page's discount has no
  carrier either: "embarking to and from a tile with a Harbor district or
  a City Center tile (for a coastal city) ... costs only 1 Movement".
- **B-56r. The six inert promotions.** 73 of the 79 catalog rows in
  `cpu/data/promotions.ts` reach a rule; the poke bar is
  `tests/gpu/promotions_test.py` + `tests/gpu/promo_effects_test.py`. SIX
  carry `none`, each with its blocker:
  - **SENTRY** ("can see through Woods and Rainforest") — `revealAround`
    / `_reveal_around` reveal a flat radius; nothing blocks sight.
  - **SUPPRESSION** grants zone of control to a ranged unit.
    `unitExertsZoc` / `_in_enemy_zoc` count EVERY hostile military unit,
    ranged included — the real gap is the exert test not being
    CLASS-aware, which is the fix this row waits on.
  - **CONVOY and ESCORT_MOBILITY** move an escorted unit with its escort;
    nothing binds one occupant's move to another's, so there is no
    formation to move.
  - **CREEPING_ATTACK** is "+14 Combat Strength vs. naval raider units",
    and no NAVAL RAIDER class exists to name in a `CS_VS_CLASS_*` mask —
    C-32.
  - **PROXIMITY_FUSES** is "+7 Combat Strength when defending against air
    attacks". `airStrike` / `_air_strike` roll the defender at
    `airDefenseOf` / `_type_anti_air` alone and never call `promoCS` /
    `_promo_cs` — threading the promotion term into the sortie changes
    every defensive promotion's reach at once (C-34's pass).
- **B-57r. The SNIPE head stops at the distance-2 ring.** `unitAttackRange`
  and the barbarian scan add the RANGE promotion's +1, so the RULE
  legalises a distance-3 shot — but the SNIPE block is twelve columns over
  `snipeRing` / `ring2`, so no seat can ORDER one. The fix is 18 more
  columns (the distance-3 ring) appended after the last verb, plus the
  ring itself on both engines — an append-only head change.
- **B-58r. The religious purchase asks for a Shrine, not a majority
  religion.** CIV6 (Apostle; the Inquisitor page verbatim): the unit "can
  only be purchased with Faith in a city that has a majority religion and
  a Holy Site with a Temple (or one of its replacements)".
  `purchaseReligiousUnit` / `_seat_religious_city_ok` ask for a SHRINE
  plus the Holy Site (Temple for Apostle/Inquisitor) and never read
  `city.followedReligion` / `city_followed`. The WARRIOR MONK's counter
  (`purchaseWarriorMonk` / `_seat_monk_city_ok`) already reads what the
  city follows — the shape the other three want is written next door.
- **B-59r. The religious spread is a flat lump.** CIV6 (Apostle): Spread
  Religion "converts Citizens in adjacent city to Apostle's religion
  (Pressure = 2.2 * Apostle's current HP) and reduces total Religious
  Pressure of all foreign religions in the city by 25%". `spreadFromUnit`
  / the `_A_SPREAD` arm add a constant `SPREAD_PRESSURE` and strip
  nothing. Open:
  - **THE PRESSURE DOES NOT SCALE WITH HP** — a wounded Apostle converts
    as hard as a fresh one.
  - **THE BASE 25% STRIP IS ABSENT** — only Proselytizer strips (75%,
    sourced); the two are meant to stack as base-and-upgrade.
  - **A CITY-STATE CANNOT BE CONVERTED.** `allCities` is majors-only and
    the GPU spread scans `city_alive[:, :n_majors]` to match — minors
    carry no religion (C-30's family), which is also why Translator's
    "this also applies to city-states" has nothing to triple.
- **B-51r. The Encampment's second pool.** The assault, the shelter rule,
  the conquest and the -17 shot pricing all ship (`attackEncampment` /
  `_attack_encampment`, `conquerEncampment` / `_conquer_encampment`;
  `siege.test.ts`, `encampment_test.py`, `city-combat.test.ts`). OPEN:
  - **THE TWO POOLS ARE ONE HERE**, and the claim that Civ 6 keeps the
    district's perimeter SEPARATE from the city's is UNSOURCED — neither
    the Encampment page nor Ancient Walls says whether the pools are one
    or two, nor whether a repair restores them together. Settle the claim
    before splitting them; the split is new per-tile wire state.
  - **A DEFENSELESS DISTRICT IS WALK-OVER GROUND.** A ranged strike can
    take `encampHp` to 0 without pillaging, the movement block lifts, and
    a foreign unit walks onto an intact enemy district. Real Civ 6
    conquers it on ENTRY by a melee unit ("as you would a City Center").
    The conquest body exists on both engines; what is missing is the
    entry hook (TS `stepUnit` lives in `units.ts`, which `combat.ts`
    already imports).
  - **A DEFEAT DOES NOT PILLAGE THE DISTRICT.** Civ 6: "when defeated ...
    it and all its buildings are pillaged automatically". Writing that
    would silence the heal-and-re-block rule, because `encampmentIntact`
    / `_encamp_block` read PILLAGED and HP through one predicate — the
    two facts need separating before either can be right.
- **B-44r. City-state war tails.** The minor war head, its clocks, the
  suzerain refusal and a seat's march on a minor all ship (`warTargets` /
  `war_targets`; `cs_war_test` holds what the gate does not). OPEN:
  - **THE BARBARIAN WALKER STILL RAIDS ONLY MAJORS, AND THE REASON IS THE
    WALKER.** `hostileUnitAct` / the `sim_orders` barbarian arm pillage a
    minor's ground but scan only the MAJORS' cities for a march target.
    Widening the scan was tried and reverted: this walker beelines to the
    single nearest city and stops adjacent, so counting minors parked
    every camp on the neighbouring city-state. Real Civ 6 barbarians raid
    whoever is near the camp; the beeline has to go first.
- **B-53r. The Great Person QUEUE.** All 205 people ship with the era
  gate and the scaled price (`gpOffer` / `_gp_first_of_era`, `gpCost`).
  OPEN:
  - **THE OFFER IS RE-DERIVED, NOT FROZEN.** Real Civ 6 fixes WHICH
    person is on offer and WHAT it costs when they enter the queue; here
    both are computed fresh each turn from the world era. An exact model
    needs two per-class state fields — frozen index, frozen price — on
    both engines and on the wire.
  - **FAITH NEVER PATRONIZES ONE.** CIV6 (Faith): "Faith can be used at
    all times to purchase Great People via Patronage." The only currency
    here is the class's own points, so the Oracle's discount (B-45r) has
    nothing to discount. The queue and price exist; missing is the second
    purse on the same offer.
- **B-D. UNSOURCED DATA VALUES — swept once; the named stylizations are
  OPEN, not closed.** The cpu/data walk fetched every magnitude from the
  GS Civilopedia row by row (wonders, units, both trees, buildings, all 49
  policy cards, the city-state roster). What remains open:
  - **The GOVERNMENTS' channel-blocked tails.** The expressible terms
    ship and the invented magnitudes are deleted; each remaining term
    waits on a channel: Monarchy's "+1 Housing per level of Walls" (a
    per-city WALLS-LEVEL count), its "+2 Diplomatic Favor for every
    Renaissance Walls" (a favor-per-building term) and "+50% Influence
    Points" (an influence MULTIPLIER — `influencePerTurn` is flat);
    Merchant Republic's "+10% Gold in all cities with an established
    Governor", Theocracy's "+0.5 Faith per Citizen in cities with
    Governors" and Communism's "+0.6 Production per Citizen in cities
    with Governors" (a per-city GOVERNOR gate on a yield term — B-24r's
    governor identity); Merchant Republic's "+15% Production toward
    Districts" (a DISTRICT prodBoost target); Theocracy's "+5 Religious
    Strength in Theological Combat" (a government channel into the
    theological roll) and its "15% Discount on Purchases with Faith" with
    Democracy's gold twin (a purchase-price multiplier); Democracy's GS
    route and alliance-point terms (C-2); Autocracy's "+1 to all yields
    for each government building" (a per-city count the Government Plaza
    rows make countable — `BuildingDef.govTier` / `_b_gov_tier` — that no
    channel reads). Legacy bonuses are out of scope by construction — R&F
    phased them out. ADOPTION REACHABILITY: `computeAdoption` /
    `_adopted_gov` take the newest unlocked tier on table order, so
    Oligarchy and Classical Republic are adopted in NO game — the two
    government test lanes' borrowed-row drills hold their rows.
  - **The per-CITY war-weariness split is NOT published, and the
    empire-wide rule we implement IS** (sourced: -1 Amenity per 400 WWP,
    `warWearinessPenalty`'s shape). The three
    `WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_*` GlobalParameters are real
    data no source explains; closing this needs the C++ behaviour.
  - `GAME_SPEED` 0.6 (`constants`) — a SHAPE difference: real Civ 6
    scales cost, yield and turn tables independently per speed.
  - **THE RELIGIOUS FAITH PRICES ARE FLAT.** Every religious infobox ends
    "Faith cost is progressive"; no source publishes the progression
    (same channel `naturalistCost` names).
  - the BELIEF magnitudes (`religion` header) and the deliberate tuning
    constants in `seats` (its header names them) — stylizations that will
    never close by sourcing; recorded once.
  - the FLOOD SEVERITY split (`disasters`) — 60/30/10 is the model's; the
    Flood page publishes per-severity effects and no distribution.
  - **VALLETTA'S WALLS DISCOUNT HAS NO PUBLISHED MAGNITUDE** — the
    faith-ONLY half ships (`wallsGoldBlocked`); the reduction has no
    published figure.
  - **THE FAITH RATE FOR A LAND COMBAT UNIT IS INFERRED** — Valletta's
    page publishes the BUILDING rate ("2 Faith for 1 Production",
    `FAITH_PURCHASE_MULT`) and `unitFaithCost` /
    `_seat_faith_unit_candidate` reuse it because no page states the unit
    one.
- **B-62r. A natural wonder's tile pays its own roster row and nothing
  else.** `tileYields` LEAVES on `tile.wonder`, so such a tile takes the
  wonder's published yields and none of the runtime adds every other tile
  gets — a pantheon's `featureYields`, a suzerain improvement's adjacency,
  the PRESERVE's bands (the GPU masks them in `_tile_add_live` to match).
  SOURCED (Grove): "+1 Food and Faith to adjacent unimproved tiles with
  Charming Appeal. Yields increased ... for adjacent unimproved tiles with
  Breathtaking Appeal." A natural wonder is unimproved and Breathtaking by
  construction (`tileAppeal` answers 5), so the real building pays it and
  both engines refuse.
- **B-63r. The grievance ledger's two unpublished magnitudes.** The
  mechanic is whole (every published row pays, the spread, the decay, the
  favor ladder, PUBLIC RELATIONS). OPEN, neither closable from a source:
  - **THE OCCUPIED AND RAZED ROWS SHIP AT THEIR CEILING** — the table
    publishes "up to 50" / "up to 150" without the scale that walks up to
    it.
  - **THE GANG-UP BAR IS A HEURISTIC** — `GRIEVANCE_GANG` is a tuning
    knob wearing a sourced unit; no source publishes an AI threshold.

## C. ABSENT SYSTEMS — the blockers, and the gaps waiting on them

Every entry here was once written down as a decision; each is a DEFERRAL
waiting on a system this engine does not have. The missing system is one
open item, and each gap that names it is another — the gaps are listed
under their blocker so the dependency is readable, and both halves count.

- **C-1. POWER — the emissions and the renewable roster.** Weight 2. The
  grid, the three plants, the fuel burn, the powered-yield splits and
  Cardiff all ship (`cityPower` / `_city_power_need`;
  `tests/gpu/power_test.py`, `tests/cpu/city/power.test.ts`; the grid is
  poke-proven — no gate lane builds a plant). OPEN:
  - **THE DECOMMISSION AND RECOMMISSION PROJECTS** — nothing can retire a
    plant, and the Nuclear plant's reactor has no age to reset.
  - **A CITY-STATE'S CITIES ARE NEVER POWERED** — `resolveSeatPower` /
    `_resolve_seat_power` run inside the MAJOR seat loop only.
  - **THE CLIMATE ACCORDS COMPETITION HAS NO CARRIER** — B-22r's absent
    scored-competition machinery.
  - **THE FOUR RENEWABLE GENERATORS** — Geothermal Plant, Solar Farm,
    Wind Farm, Offshore Wind Farm — are improvements with terrain gates,
    and none is in the improvement roster.
  - **THE HYDROELECTRIC DAM** — the Dam district ships now (C-22), so
    this is unblocked: the building's row plus its per-city renewable
    supply.
  - **THE BIOSPHERE** raises every renewable source by 200%; the wonder
    is not in the roster.
  - **THE NUCLEAR PLANT'S REACTOR AGE** — the rising accident chance and
    the Recommission project that resets it — has no clock.
- **C-2. DIPLOMATIC AGREEMENTS.** Weight 3. The 30-turn agreement clock,
  friendship, the alliance with its defensive pact, the denouncement, open
  and CLOSED borders and the Great Work gift all ship on the wire and in
  the observation. OPEN:
  - **ALLIANCE TYPES AND LEVELS.** R&F's five alliance types, levelling
    1->3 on Alliance Points (80, then 160 more). The point sources are
    published and computable here (1/turn, 0.25 per route direction,
    Democracy's 0.25); the fifteen level effects are fifteen channels,
    several needing systems this engine lacks (shared visibility,
    suzerain-bonus sharing, a free promotion).
  - **DIPLOMATIC VISIBILITY** — no visibility levels exist; Listening
    Post (C-16) and a Great Person clause (B-61r) read them.
  - **THE NEGOTIATED TWO-SIDED DEAL.** Gold, resources, cities, favor and
    agreements traded FOR each other. The wire has no offer/accept
    protocol — a record is one seat's unilateral intent — and no source
    publishes the AI's valuation (the valuation can be a driver
    heuristic; the transfer bodies and protocol are engine work). Peace
    terms (B-22r), resource trading (C-5) and the captured-spy trade
    (C-16) wait on this.
  - **JOINT WAR, JOIN ONGOING WAR, RESEARCH AGREEMENT and
    ASK-FOR-PROMISE** — each a two-sided deal by construction.
  - **CITY-STATE BORDERS** never close (C-30), so a suzerain's passage
    lifts nothing.
  - The **+25% Open-Borders tourism** is an INTERNATIONAL modifier,
    applied per foreign civilization; blocked on C-28.
- **C-5. STRATEGIC-RESOURCE STOCKPILES — the bank ships; two tails.**
  Weight 2. The bank, the ceiling, the charges, the plant fuel and the
  heal denial all ship. OPEN:
  - **THE SHORTAGE PENALTY** — a seat short of fuel takes a CS penalty
    "proportional to the amount you're short"; the consumption is live
    (`chargeUnitUpkeep` / `_seat_charge_upkeep`), the magnitude is
    unpublished.
  - **RESOURCE TRADING** — "lump quantities of Consumable resources", a
    two-sided deal; blocked on C-2.
  - **ZANZIBAR'S TWO EXISTS-NOWHERE-ELSE LUXURIES** — B-21r.
- **C-6. POLICY-CARD MODIFIERS — two of the 49 cards are inert.** Weight
  1. Each blocked on a system:
  - `ONLINE_COMMUNITIES` — "+50% Tourism output to civilizations to which
    you have a Trade Route"; blocked on C-28.
  - `CONTAINMENT` — envoys count double "if its Suzerain has a different
    government than you"; blocked on C-29.
  - `TOTAL_WAR` ships its plunder half and not its pillage half — C-27.
- **C-8. RANDOM DRAWS THE MODEL MAKES DETERMINISTIC.** Weight 2.
  - **THE GREAT PERSON REPLACEMENT WALKS A QUEUE.** SOURCED: "the
    replacement is chosen randomly from those available in the current
    era, or the next if all those from the current era have been
    claimed." `gpOffer` / `GP_FIRST_OF_ERA` answer with the first roster
    position the world era has not passed. The blocker is storage:
    `gpNext` is a per-class COUNTER, so WHICH people are unclaimed is not
    a fact either engine holds — a draw needs a per-person claimed set on
    both engines and in `shared/statecompare.manifest.json`.
  - **THE CONGRESS SLATE ROTATES BY SESSION** where the real slate is a
    random draw among era-eligible resolutions — the ORDER of the slate,
    not its contents.
  - **WHICH CITY-STATES A GAME GETS.** `seeder/place.ts` carries its own
    eighteen-name pool (a copy of the cpu catalog's twenty-four, six rows
    absent from it entirely: Caguana, Hunza, Cardiff, Valletta, Akkad,
    Armagh) and places three per world by a type draw plus first-unused
    name. Across the twelve gate seeds eleven names appear, so THIRTEEN
    of the twenty-four catalog rows — their suzerain rules with them —
    are placed by no seed; the `islands` world preset raises
    `cityStateMax` but draws from the same pool. Drawing here would move
    `genStamp` and re-seed every fixture.
- **C-16. THE SPY'S SECOND HALF.** Weight 2. The Spy, its capacity, the
  jump, the eleven-mission catalog, the counterspy post and the capture
  roll ship (`spy_test.py`, `spy.test.ts`; gate reach unmeasured — treat
  as poke-proven). OPEN:
  - **THE ESCAPE SEQUENCE.** A discovered spy "will need to escape from
    the target city" — by Airplane, Boat, Vehicle or Foot, each gated on
    a district, each with its own danger and return time, a survivor
    reappearing in the CAPITAL; the Ace Driver promotion improves them.
    Here a discovered spy dies on one roll.
  - **CAPTURED SPIES** — "imprisoned, but not killed", counting against
    capacity, tradeable back. A prisoner store plus a two-sided deal
    (C-2).
  - **THE SPY PROMOTION POOL** — fourteen sourced promotions, three
    offered at random per level; the chassis has no promotion class
    (C-32) and the random offer is C-8's territory.
  - **LEVELS FROM COUNTER-ESPIONAGE** — a counterspy that catches earns
    nothing here.
  - **"NO TWO SPIES MAY PERFORM THE SAME MISSION IN THE SAME CITY"** —
    the mission mask asks nothing about other spies on the tile.
  - **LISTENING POST** — its payload is diplomatic VISIBILITY (C-2).
  - **FABRICATE SCANDAL** targets a city-state — R&F's ruleset; the
    majors-only scan is vanilla-faithful and the minor city block carries
    no district registry to hang it on.
  - **SABOTAGE PRODUCTION pillages the BUILDINGS**, per the source, not
    the district; a per-building pillage flag is the difference.
  - **THE CLOCK AND THE ODDS ARE THIS MODEL'S OWN** — `SPY_MISSION_TURNS`
    and the five odds constants are stated model values; the published
    modifiers they feed are sourced. The Intelligence Agency's success
    bonus has no published figure either.
- **C-20. THE MILITARY ENGINEER'S LAST THREE VERBS.** Weight 1. The Fort,
  the Airstrip, the road and the 20% charge ship; gate reachability is
  ZERO (no seed trains the chassis) and `engineer_test.py` pokes every
  rule. OPEN, each blocked on a system:
  - **THE MISSILE SILO** bases nuclear devices — C-31.
  - **THE MOUNTAIN TUNNEL** makes an impassable tile passable — C-35.
  - **THE RAILROAD** — C-36.
  - **"Can clean Nuclear Fallout"** waits on C-31; **"Can Remove Tile
    Improvements"** is a verb neither engine has for any unit.
  - (The Bath in the charge's district list is Rome's unique Aqueduct —
    C-26.)
- **C-27. PILLAGING PAYS NO YIELDS.** Weight 2. The PILLAGE verb sets
  `pillaged`, heals a food-improvement pillager and spends the move;
  nothing is banked. Real Civ 6 pays the pillager a yield lump keyed to
  what was wrecked. Waiting on it: `TOTAL_WAR`'s pillage half (C-6), the
  Great Person pillage-percentage clause (B-61r), and **THE COASTAL
  RAID** — all three naval raiders list it ("the Privateer must be next
  to the land improvement or district, and must have at least 3 Movement
  points remaining"), and neither engine offers a PILLAGE column to a
  hull at all (`_seat_unit_mask` builds the verb over land movers), so
  the raid needs the column before it can need a payout.
- **C-28. TOURISM ACCRUES TO NO ONE IN PARTICULAR.** Weight 2. The bank
  is two lifetime scalars (`Seat.tourism` / `civ_tourism`,
  `Seat.tourismReligious` / `civ_tourism_rel`) divided by the civ count on
  read; the two sourced religious halvings apply per rival at the
  culture-victory read (`cultureVictor` / `_culture_victor`). What is
  missing is ACCRUAL per foreign civ: real Civ 6 banks tourism toward
  each rival separately, which is what the international +25% modifiers
  (Open Borders — C-2 — and the trade-route pair), the up-to--40%
  different-governments penalty, `ONLINE_COMMUNITIES` (C-6) and the Rock
  Band (C-31) all key on.
- **C-29. THERE IS NO RESOLVED SUZERAIN.** Weight 1. `isSuzerain` answers
  from the raw envoy store on every read, and nothing stores the answer —
  a rule that changes envoy WEIGHT by who the suzerain is has no fixed
  point. Waiting on it: `CONTAINMENT` (C-6).
- **C-30. A CITY-STATE CARRIES NO RESEARCH RECORD.** Weight 1. A minor
  has no techs and no civics, and real Civ 6 minors research like anyone
  else. Waiting on it: the border close at Early Empire ("a civ (or
  city-state) develops the Early Empire civic") and the suzerain's
  passage exemption — a minor's ground stays open to everyone. The
  minors-carry-no-religion family (B-59r's conversion bullet) sits here
  too.
- **C-31. THE TWO CHASSIS WITH A SYSTEM BEHIND THEM.** Weight 1.
  - **THE NUCLEAR AND THERMONUCLEAR DEVICE** — a one-shot weapon
    delivered by a bomber, a silo or a submarine, with a blast radius,
    persistent fallout tiles, and a diplomatic reaction. Neither engine
    has an area-effect attack, a fallout tile state, or the Missile Silo
    (C-20).
  - **THE ROCK BAND** — a GS civilian performing in a foreign city for a
    tourism lump against a level-scaled failure roll; reads per-rival
    tourism (C-28).
- **C-32. THE NEW CLASSES HAVE NO PROMOTION TREE.** Weight 2. The AIR,
  GIANT DEATH ROBOT, SUPPORT and NAVAL RAIDER classes have no
  `PROMO_CLASSES` entry, and neither does the SPY — `promoOffer` /
  `_promo_offer_mask` open no column for them. Adding trees widens
  `PROMO_COLS`, a wire change. Waiting on it:
  - **SKY AND STARS' golden half** — "+100% Experience for all Air
    Units" has no tree to accelerate.
  - **THE SPY PROMOTION POOL** (C-16), whose random offer is also C-8's.
  - **CREEPING ATTACK** needs a raider `CLASS_BIT` as a TARGET (B-56r).
  - The GDR is faithful by exception — it "cannot earn experience or
    Promotions" — so only air, support, raider and spy are the gap.
- **C-33. THE GIANT DEATH ROBOT IS ONLY ITS STATS.** Weight 2. The
  chassis, its fuel bill and Automaton Warfare's hooks ship. Every
  ABILITY on its page is absent: it moves and fights on Coast and Ocean
  "as it would on land" (C-35's family — the hull/embark rules give it
  neither); it heals only in friendly territory; it takes -17 Ranged
  Strength against district defenses and naval units; and its four
  Future-era upgrades need per-unit upgrade state keyed on a FUTURE-era
  tech, where the era ladder stops at Information.
- **C-34. AIR COMBAT'S SECOND HALF.** Weight 2. Bases, both heads, the
  sortie, the carrier and the scatter ship. OPEN:
  - **INTERCEPTION** — fighters "automatically attack incoming aircraft
    within their operational range"; there is no reactive attack anywhere
    in either engine.
  - **PATROL** — a deployed standing interceptor; waits on the row above.
  - **PRIORITY TARGET** — a bomber reaching the SUPPORT unit under a
    stack ("sustains 65 damage"); a strike here answers the tile's
    military occupant first.
  - **LAND AA IS INERT BY THE SOURCE'S OWN MODEL** — the ANTI_AIR_GUN and
    MOBILE_SAM never damage an attacker, because the channel they would
    damage it through is Interception.
  - **THE NUCLEAR DELIVERY**'s interception half (devices are C-31, the
    silo C-20).
  - The promotion term in the air roll (B-56r's PROXIMITY_FUSES) belongs
    to this pass.
- **C-35. THE LAND/WATER FACT NEVER MOVES.** Weight 2. Sea-ness is decided
  at map generation: TS `isWater`, GPU static `water` / `wpass` and their
  derivations, none in `_MUTABLE`. The bit is OVERLOADED — "is this sea",
  "can a hull stand here", "is this city coastal", "does this tile carry
  water housing" — so moving it for one meaning moves all four. Waiting on
  it: submersion (C-24), the Canal's naval passage (C-22), the Mountain
  Tunnel (C-20), and the GDR's water walk (C-33).
- **C-36. NO RAILROAD.** Weight 2. `Tile.road` / `sim.road` is ONE boolean
  tier. The railroad is a second tier — its own movement rate, "1 Iron and
  1 Coal per hex" against the existing stockpiles, and CO2 "quite a bit at
  that". Waiting on it: C-20's fifth engineer verb and C-24's third
  emitter.
- **C-24. THE CLIMATE ARC.** Weight 1. Emissions, the phase ladder, ice
  melt, flooding, the Flood Barrier, warmed weather, Carbon Recapture and
  the Global Energy Treaty all ship; NONE of it is gate-reached (no seat's
  CO2 leaves zero in 12x250) — `climate_test.py` / `climate.test.ts` are
  the whole bar. OPEN:
  - **NOTHING IS EVER SUBMERGED.** Phases IV/VI/VII submerge bands 1-3,
    "lost forever". The sea level is on the wire (`floodLevel` /
    `_flood_level` price the barrier); the tile turning to water is C-35.
  - **THE FLOOD BARRIER KEEPS FOR NOTHING** — its maintenance is
    published only as "Variable"; the row carries 0.
  - **RAILROAD CONSTRUCTION EMITS NOTHING** — C-36.
  - **GLOBAL WARMING MITIGATION PAYS NOTHING OF ITS OWN** — its award
    ("3 Envoys and 1 Diplomatic Victory point") has nowhere to land:
    `ResearchEffect` carries unlock kinds only, so no tech or civic can
    make a one-off grant.
- **C-22. THE DISTRICT ROSTER.** Weight 2. All eighteen districts exist
  with catalog-column effects and sourced placement clauses; the Preserve
  and Government Plaza ride the gate on 12/12 seeds, the Canal on none
  (`canalPassageOk` / `_canal_plot` poke-proven). OPEN:
  - **THE CANAL CARRIES NO NAVAL PASSAGE** — the passage wants its own
    plane, not a bit borrowed from the water one (C-35).
  - **FIVE GOVERNMENT PLAZA BUILDINGS PAY ONLY THEIR GOVERNOR TITLE.**
    The Ancestral Hall's Builder in every new city, the Warlord's
    Throne's post-conquest production, the National History Museum's
    Great Work slots, the Royal Society's charge-into-production and the
    War Department's combat bonus each need a channel this model does not
    have. (The Grand Master's Chapel's faith purchase ships —
    `unitFaithCost` / `_seat_faith_unit_candidate`.) The Audience
    Chamber's "-2 Loyalty in Cities without Governors" ships; its
    governor-CONDITIONAL amenities and housing do not, because the
    governor pick is decided from loyalty, which reads the amenity tier —
    a circle that needs the pick hoisted before the city walk.
  - **THE PRESERVE'S HOUSING TABLE IS THIS MODEL'S OWN** —
    `PRESERVE_APPEAL_HOUSING` / `preserveHousing` state the published
    ceiling at Breathtaking; no source can close the middle.
  - **THE DAM'S AND CANAL'S "+1 Amenity with Water Works"** is a Liang
    governor TITLE — B-24r's governor promotions.
  - **THE CONSULATE'S "or cities with Encampments" half** — the widening
    clause reads a district count the influence body never asks for.
  - **THE INTELLIGENCE AGENCY'S "+1 Spy"** is a free UNIT at completion —
    the same absent shape as B-45r's wonder unit grants.
- **C-26. NO CIVILIZATION UNIQUES.** Weight 5. A major seat is a name, a
  colour and a city list (`CIV_LEADERS`). Real Civ 6 gives every
  civilization an ability, its leader an ability and an agenda, a unique
  unit and a unique piece of infrastructure; none of the five exists.
  Waiting on it: the Impi and Hypaspist stacks (B-54r), the Gauls'
  OPPIDUM, Ambiorix's and Saladin's leader terms, the Nihang's embarked
  CS, America's Film Studio, the unique-improvement appeal terms (B-36r)
  and suzerain rows (B-21r). PARKED BY OWNER DECISION — no round starts
  it; the row stays open on purpose.

## Reachability — what the green gate does NOT prove

A green serve run proves the two engines agree over the regime the scripted
seeds actually enter. MEASURED, 12 seeds x 250 turns driven
(`tools/gpu/reachability_probe.py`) — counts, not estimates. Re-measure
every row whenever the DRIVEN policy changes.

Two levers widen the regime without touching the fixed seed set, and both
are gates in their own right (each preset family holds a 250-turn serve
green): DRIVER STYLES (`--styles` on the probe and the serve gate, presets
in `policy/ladder.py::STYLE_PRESETS`) and WORLD PRESETS
(`seeder/presets.ts`; per-family fixtures under `seeder/worlds/presets/`,
selected with `CIV6_WORLDS_DIR`). Their first outing reached and killed
three latent divergences the baseline regime never entered: the embarked
civilian counted as Support (islands), the un-validated TS building-queue
replay arm plus `availableBuildings` refusing every government-tier row
(islands), and the jobs twin's missing MILITARY ENGINEER arm (abundant).
The table below stays measured on the BASELINE family; a preset run's
coverage is measured the same way with `CIV6_WORLDS_DIR` set.

| mechanic | seeds reaching | first |
|---|---|---|
| a PLOT LOCK held by a citizen | 12/12 | t2 |
| a PRESERVE placed | 12/12 | t27 |
| a GOVERNMENT PLAZA placed | 12/12 | t43 |
| a GREAT PERSON standing on the map as a unit | 12/12 | t53 |
| the ACTIVATE_GP column offered to one | 12/12 | t54 |
| a Great Person CHARGE SPENT | 12/12 | t55 |
| faith-buy kind 6 (APOSTLE purchase) | 12/12 | t70 |
| a WORLD CONGRESS ballot on the wire | 12/12 | t89 |
| a SPECIALIST pinned into a slot | 12/12 | t116 |
| an OPEN BORDERS grant standing | 11/12 | t34 |
| a second HULL on any seat | 11/12 | t122 |
| NATURAL_HISTORY (the Archaeologist's civic) | 10/12 | t172 |
| a DECLARATION OF FRIENDSHIP | 9/12 | t19 |
| an ALLIANCE | 9/12 | t105 |
| a DIPLOMATIC QUARTER placed | 8/12 | t101 |
| a permanent PER-SEAT channel left by a spent Great Person | 8/12 | t110 |
| an INTERNATIONAL trade leg | 7/12 | t95 |
| a permanent PER-CITY channel left by a spent Great Person | 6/12 | t155 |
| two enemy religious units ADJACENT (theological combat) | 4/12 | t94 |
| a DAM placed | 4/12 | t163 |
| CONSERVATION (the Naturalist's civic) | 3/12 | t188 |
| WAR with a city-state | 2/12 | t142 |
| a WATER PARK placed | 2/12 | t205 |
| a unit standing against a CLOSED BORDER | 1/12 | t154 |
| PEACE with a city-state, through the sue column | 1/12 | t155 |
| a CANAL placed | 1/12 | t230 |
| URBANIZATION civic | 0/12 | NEVER |
| a NEIGHBORHOOD placed | 0/12 | NEVER |
| an antiquity dig (artifact in a slot) | 0/12 | NEVER |
| a GREAT WORK given away | 0/12 | NEVER |
| an ally dragged in by the DEFENSIVE PACT | 0/12 | NEVER |
| any seat's lifetime CO2 above zero | 0/12 | NEVER |
| the world crossing into climate PHASE I | 0/12 | NEVER |
| a MILITARY ENGINEER alive at all (and so its three verbs) | 0/12 | NEVER |
| a Valletta-shaped SUZERAIN, and the class purchase it sells | 0/12 | NEVER |
| a seat that may buy LAND COMBAT UNITS with faith | 0/12 | NEVER |

- THE DISTRICT LANE ROTATES ITS PICK by (seat + turn) — a DECISION the
  applier re-validates, widening coverage without changing legality.
- THE TAIL OF THIS TABLE IS TRAJECTORY, NOT RULE. Every row below 8/12
  moves by a seed or two whenever anything steers the late game. A row
  that thins is a coverage loss, never a regression; each names the poke
  lane that is its actual bar.
- THE DRIVER RUNS TWO STYLES beside the default: DEEP (`ladder.DEEP_SHARE`
  0.34 — research depth; what unlocked the dig and the park rows) and
  DIPLOMATIC (`ladder.DIPLO_SHARE` 0.5 — exclusive with the grudge per
  SEAT, measured twice: a diplomat that also denounces reaches friendship
  on 1 seed and an alliance on none). COVERAGE COMES FROM THE MIXTURE, not
  from any one style turned up — measured: all-deep reaches
  NATURAL_HISTORY 12/12 but drops specPin, the international leg and the
  slotted cards; wonder-first moved wonders 52->62 (already covered) and
  cost three thin rows.
- POKE-ONLY CLASSES, each named at its entry: the faith-purchase classes
  (no Valletta suzerain, no Theocracy/Grand Master's Chapel in-gate), the
  Warrior Monk and its tree (AKKAD is placed by no seed — C-8), the
  climate arc (CO2 never leaves zero), the Military Engineer (0/12), the
  space race (Information-era techs), the emergencies' CITY_STATE trigger.
- THE POLICY CARDS ARE MOSTLY UNREACHED: 16 of 49 ever slot (greedy fill,
  table order within a kind); THIRTEEN effect channels ride the digest,
  the other nine are `policy_cards_test` + the TS `policy-cards` suite
  alone.
- The CULTURE VICTORY's distance at t250: visiting peaks at 5 (mean ~0.7)
  against a domestic peak of 78 (mean ~39) — read B-20r's scope off this.
- A barbarian march choosing a CIV row's city while a row-0 city stands in
  reach — the tie key was verified by reading, never by the gate.
- The `R = 0` phantom row: no seeder configuration produces a one-major
  world, so the solo-game arm cannot be validated by the gate.
- **OPEN — THE DRIVER NEEDS A REAL STYLE MECHANISM.** Not weighted (this
  file prices fidelity; this is harness). Today a style is one boolean
  read at a single `if` inside `pick_research`; adding one style meant a
  rank refactor of `pick_production` that was reverted with the style it
  served. What it should be: NAMED KNOBS with defaults that reproduce
  today's picks exactly (research depth, production tier order, war
  appetite, expansion appetite, faith/culture lean, naval lean); PRESETS
  built from the knobs, assignable per actor as data; an ASSIGNMENT
  POLICY off the existing per-(seed, seat) stream or an explicit table;
  CLI selection on the probe and the gate. The bar is the probe diff: a
  preset earns its place by ADDING rows without losing any.

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
    real completion does.
  - **The stale index space.** Appliers take the ROW and RANKED orders over
    `_seat_slot_map`; a test speaking the dead civ-index or raw pool-slot
    convention lands its orders on the wrong seat or unit and no-ops.
  - **The wrong resolver.** `_hostile_ranged_strike` scopes out
    major-vs-major by design; that pairing is `_ranged_attack`'s.
  - **A stale cache under a poke.** Writes that the engine always pairs
    with `_eff_version += 1` must be paired in a poke too, or the mask
    serves the pre-poke world.

**A TS-SUITE RED, same triage.** The battery tail only ever shows the
last failing file; run vitest directly for the full list. The TS-specific
shapes:

  - **Founding under `unitsMode` needs a settler on the tile** —
    `settleAt` (tests/cpu/helpers.ts) is the scene helper.
  - **The actor loop skips a CITYLESS seat** (`seatPhase`) — influence,
    favor, upkeep/bankruptcy and quest issuance all live inside it.
  - **Rules that live IN the seat phase**: city strikes (`cstk`/`estk`),
    city healing, influence-to-envoy conversion.
  - **The scripted adoption** (`computeAdoption`): modifiers read the
    adoption, a pure function of civics — `setPolicy`/`setGovernment`
    write a store nothing reads in a driven game.
  - **One seat model**: `isCiv(0)` is true; a fake seat `{ id, atWar }`
    builds a scene the war axis cannot see; a CityState without
    `emptySeat(seatOfCityState(id))` has no seat id.
  - **Meeting is by EXPLORATION** — in a fogless world every seat meets
    every city-state at the phase top; "unmet" scenes need fog live.
