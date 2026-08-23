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
| A-1r the district registry holds ONE tile per TYPE | 1 | a repeatable district's per-type columns are counted once on the GPU and per instance on TS; every such column is zero today, so nothing diverges yet |
| **A. Engine vs engine** | **1** | |
| B-20r tourism tails | 1 | theming, the open-borders dig and the work GIFT all ship; the Naturalist's progressive cost is unsourced |
| B-21r suzerain rows | 1 | nine perks are rules; the residual descoped rows all need whole absent systems |
| B-22r World Congress | 2 | 13 of the 21 regular resolutions ship and emergencies run as special sessions; eight resolutions and the scored competitions have no carrier; peace TERMS wait on the negotiated deal (C-2) and two favor penalties on C-19/C-24; the favor tie-break unmodeled |
| B-24r Ages/governors | 1 | all twelve dedications ship, both faces; dark-age policies, governor promotions and per-civ era drift do not |
| B-30r specialists | 1 | the mechanic, both citizen overrides and the three-plant Industrial tier ship; a LOCK still outlives the city that set it |
| B-31r trade-route tails | 1 | sea legs and the whole-destination-set candidate ship; no trading posts, plunder gold is a stylization, the summed-yield key is a heuristic and the free-choice head is P8's |
| B-53r the great-person queue | 1 | 205 sourced people, the era gate and the scaled price ship; the offer is re-derived each turn rather than frozen, and the payout is one era-sized lump instead of the person's own ability |
| B-D unsourced data values | 2 | the Monument, the Lighthouse and the Engineer's Armory shipped and one bullet was false; the governments are half-shipped, and the rest are shape differences or model tuning that no source can close |
| B-36r appeal adjacency terms | 1 | every district term ships off one catalog column; the unique-improvement terms and the appeal-granting Great People wait on C-4 and C-21 |
| B-39r wonder effects still dropped | 1 | the sourced sweep shipped fourteen channels; five residuals, each blocked on B-20r, C-21, B-34r or C-23 |
| B-45r sourced-sweep finds in the other rows | 1 | three of the eight now have a channel; the five that do not need free units (C-21), faith-bought Great People (C-9), a rival-recruit event, or B-31r's route yields |
| B-46r the siege class's tails | 1 | the Bombard stat, both support chassis, all four walls tiers, the move-and-shoot rule and every siege rung through Rocket Artillery ship; Akkad's suzerain bonus does not |
| B-54r flanking and support vs their own page | 1 | six rules the two engines agree on and the page does not: the Military Tradition gate, the flanking owner and river rules, support against ranged, embarked providers, and defensible districts |
| B-55r a ship cannot carry a passenger | 1 | one MILITARY unit per tile, where Civ 6 stacks an embarked land unit with a naval one — which is where Support's 7th through 10th stacks live |
| B-56r the ten inert promotions | 2 | 62 of the 72 catalog rows fire a rule; ten name a mechanic neither engine has — a second attack per turn, sight-blocking, escort formations, class-aware zone of control, a promotion term in the air-strike roll — or wait on C-25 |
| B-57r the SNIPE head stops at the distance-2 ring | 1 | a +1 Range promotion widens what the rule legalises and no seat can ORDER the shot, because the ring-3 columns do not exist |
| B-58r the religious purchase asks for a Shrine | 1 | Civ 6 asks for a MAJORITY RELIGION and a Holy Site with a Temple; both engines ask for a Shrine and never read what the city follows |
| B-59r the religious spread is a flat lump | 2 | Civ 6 scales the pressure by the Apostle's HP and strips a quarter of every other religion; both engines add a constant and strip nothing without Proselytizer |
| B-51r the Encampment's second pool | 1 | the district meets the city's perimeter and heals only while its tile is clear; Civ 6 tracks the two pools SEPARATELY, and a defeat pillages it |
| B-44r city-state war tails | 1 | the head, its policy and a SEAT's march on a minor ship; the barbarian walker still raids only majors because it beelines to one nearest city, and the diplomatic consequences wait on C-19 |
| B-60r the dig's DATE, and the hull nobody dates | 1 | the artifact's civilization is the event's own now; its ERA is still the ACTING seat's research, and a barbarian or minor sinking a hull leaves no wreck at all |
| B-34r flood tails | 1 | the severity ladder, the river's whole reach, the river-scoped shield and the Dam all ship; the per-tile flood count and the climate/coastal tails do not |
| **B. Fidelity vs real Civ 6** | **26** | |
| C-1 POWER | 2 | the grid, the three plants, Cardiff, the Hydroelectric Dam, the powered-yield split and the FUEL all ship; the CO2 and the Accords wait on C-24, four renewable improvements and the Biosphere have no carrier, nothing can retire a plant, and a minor's cities are never powered |
| C-2 diplomatic agreements | 3 | friendship, alliances, open borders, the closed border and the work gift ship on one 30-turn clock; alliance TYPES and LEVELS, the negotiated two-sided deal, and the four agreements that need one are open |
| C-4 unique improvements | 3 | Batey / Colossal Head / Monastery, each a flat channel today |
| C-5 strategic-resource stockpiles | 2 | the bank, its ceiling, the unit and project charges, the plants' fuel, unit FUEL upkeep and the heal a lost source denies all ship; the shortage penalty's magnitude is unpublished and trading resources waits on C-2 |
| C-6 policy-card modifiers | 1 | two of the 49 cards are inert, each blocked on a system below |
| C-7 trading posts | 2 | a route lays roads and plants nothing |
| C-8 draws made deterministic | 2 | the Great Person replacement walks a queue and the Congress slate rotates, where Civ 6 draws both |
| C-9 faith-purchase classes | 1 | faith buys named units, never a class of building |
| C-11 terrain the wonder rules need | 2 | the NARROWED placements are deliberately narrower than Civ 6's |
| C-13 ranged vs districts/cities | 2 | a scope-out on both, with the rest of the Encampment complete |
| C-15 garrison does not block capture | 2 | the move-onto-centre capture model is what is missing |
| C-16 the spy's second half | 2 | the Spy, its capacity, the jump and all twelve missions ship; the escape-and-capture sequence, the spy promotion pool and two missions with no carrier do not |
| C-17 embarked movement never upgrades | 1 | the flat EMBARK_MOVES stands in for every era |
| C-19 grievances and warmongering | 2 | war has no reputational consequence with anyone |
| C-20 the Military Engineer's build list | 2 | five buildables and the finish-a-district charge, which now has three of its four districts; only the Flood Barrier is still absent |
| C-21 Great Person ACTIVATED abilities | 2 | every GP fires instantly; none is placed and used |
| C-22 the district roster is a subset | 2 | all eighteen districts ship; the Canal carries no naval passage, six Government Plaza buildings have no effect body, and the Preserve's housing table is unpublished |
| C-23 nothing diminishes tourism | 1 | no rival's Enlightenment ever costs a tourist, so Cristo Redentor's cancelling clause has nothing to cancel |
| C-24 no CO2, no climate | 3 | GS's whole climate arc — emissions, warming bands, sea level, escalating disasters — and 3 gaps wait on it |
| C-26 no civilization uniques | 5 | seats are a name, a colour and a city list: no civ ability, no leader ability or agenda, no unique unit, no unique infrastructure (America's Film Studio among them) |
| C-25 no stealth (invisible) units | 2 | the whole naval-raider class is absent and nothing on either engine can be invisible |
| C-27 pillaging pays no yields | 2 | the verb marks the tile and heals; nothing banks, and there is no coastal raid to bank from |
| C-28 tourism is one lifetime scalar | 2 | it is banked per seat and divided by the civ count on read, so no rule can address one rival's tourism |
| C-29 no RESOLVED suzerain | 1 | `isSuzerain` recomputes from the raw envoy store on every read, so a rule that changes envoy WEIGHT by who the suzerain is has no fixed point |
| C-30 city-states carry no research | 1 | no techs, no civics, so nothing can say when a minor took Early Empire — its borders never close and the suzerain's passage lifts nothing |
| C-31 the two chassis with a system behind them | 1 | the ladder runs to the Information era now; the nuclear devices and the Rock Band are each a whole absent system rather than a roster row |
| C-32 the new classes have no promotion tree | 2 | air, GDR, support and spy chassis are offered no promotion, so Sky and Stars' XP half has nothing to multiply |
| C-33 the Giant Death Robot is only its stats | 2 | seven sourced abilities and the four Future-era upgrades have no carrier |
| C-34 air combat's second half | 2 | bases, both heads, the sortie and the scatter ship; Interception, Patrol and Priority Target — the whole reason a fighter exists — do not |
| **C. Absent systems** | **57** | |
| **OPEN, TOTAL** | **84** | |

THE TOTAL IS FIVE TIMES WHAT IT WAS while the code only got better. The old number
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

THE DIGEST IS THE ONLY INSTRUMENT FOR THIS CLASS — both engines can be
equally faithful to Civ 6 and still disagree with each other, and a gate red
is the only thing that would say so. Its current answer is green: 12 seeds x
250 turns, compared per turn on every group. That green bounds nothing the
gate does not reach — "Reachability" below is where that boundary runs.

THIS CHAPTER HAS ONE MEMBER, and how it got one is the chapter's own point.
The gate was green over 250 turns for rounds on end; then the district lane
started ROTATING its pick, the driven games went somewhere new, and FOUR
divergences fell out of the same green instrument in a single round — a yield
context built by hand without its optional fields, an Encampment defending
without its city's walls, a settle refused on the seat's OWN ground, and the
registry undercount below. None was new code. All four had been sitting in
paths no seed had walked. The digest only
ever speaks about what the gate REACHES, and a read of the exporter against
its readers only ever speaks about the channels somebody thought to compare;
neither can say the class is closed, and a round that widens coverage is
worth more to this chapter than a round that re-reads it.

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

- **A-1r. THE DISTRICT REGISTRY HOLDS ONE TILE PER TYPE.** `city_dist_tile`
  is [B, row, slot, nD] — one tile per (city, district type) — while TS keeps
  `city.districts` as a LIST that may hold the same type twice. Three
  districts are repeatable (`allowMultiple`): the NEIGHBORHOOD, the DAM and
  the CANAL. Any consumer that COUNTS instances therefore reads one where TS
  reads two, and the two consumers that would have are already off the tile
  plane: `_seat_housing`'s repeatable loop (which is what pays a second Dam
  its +3) and `_detect_seat_boosts`' repeatable branch (which is what fires
  "Build 2 Neighborhoods" for two in ONE city — it read the registry until the
  gate reached a second Neighborhood at seed 9092, t238).
  What is still registry-counted, and so still one-per-type: district
  MAINTENANCE, amenities, loyalty, governor titles and the spy penalty. Every
  one of those columns is ZERO for all three repeatable districts, so nothing
  diverges today — this is a trap for the next repeatable row, not a live
  bug. Appeal is safe by construction: it reads the tile plane, never the
  registry. Closing it means either a per-city COUNT plane beside the registry
  or moving each column onto the tile walk; both cost a [B, T, RC] scan on a
  per-turn path for no present gain, which is why it is recorded rather than
  paid for now.

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
  ART MUSEUM THEMING SHIPS, and so does the per-work provenance it waited
  on. Every Great Work of Art now records WHAT it is and WHO made it, for the
  museum's own slots (`City.gwArtType`/`gwArtArtist`, `city_gwart_type`/
  `city_gwart_artist`), and `artMuseumThemed` / `_art_museum_themed` reads the
  sourced rule: "its slots must be filled with Great Works of Art of the same
  type ... made by different Great Artists. This means that a minimum of three
  Great Artists are needed to activate each Art Museum's theming bonus." A
  themed museum doubles its OWN three works; a wonder's art slots sit outside
  the bonus, because the theming rule names only the two Museums.
  The types come from the Great Artist (Civ6) roster's own "Great Works of
  Art" column (`ARTIST_WORKS`), which forced a correction: three of the four
  entries in the ARTIST class were not Great Artists in real Civ 6 at all
  (Homer and Shakespeare are Great Writers, Beethoven a Great Musician). The
  class now holds the page's four RENAISSANCE artists, whose work triples the
  table transcribes.
  Also fixed while wiring it: a captured city's museum PROVENANCE was dropped
  on both engines — the TS flip literal never listed `artifactEras`/
  `artifactSeats` and the GPU left the destination slot's planes stale — so a
  conquered themed museum kept its works and silently lost the bonus. Both
  engines now carry all four provenance arrays across a capture, and a REUSED
  city slot clears them.
  Open:
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
- **B-21r. City-state suzerain rows:** nine perks are RULES (`SUZ_EFFECTS`,
  both engines): Kabul double attack XP, Preslav cavalry-on-hills CS, Mexico
  City regional reach, Anshan works science, Kumasi per-specialty route
  yields, Jerusalem Holy-Site pressure, Yerevan's free Apostle promotion
  choice, Vilnius's era Inspiration and Cardiff's +2 Power per Harbor
  building. The remaining catalog rows carry their reason in their
  `CITY_STATE_SUZERAIN_BONUS` entry's `note`, and the roster is now
  current-ruleset throughout (see B-D), so the stand-ins are whole absent
  systems (trading posts, unique improvements/luxuries, a faith-purchase
  class, a gold-purchase discount, a per-district Great Person channel) or a
  flat channel standing in for a %-scaling.
- **B-22r. World Congress residuals.** The session is real now: a
  rotating two-slot slate off `CONGRESS_RESOLUTIONS` — THIRTEEN of the
  twenty-one regular-session resolutions, era windows and A/B texts
  verbatim from the GS wiki table: Urban Development Treaty, Patronage,
  Migration Treaty, Heritage Organization, Mercenary Companies, Trade
  Policy, Policy Treaty, World Ideology, Border Control Treaty, Treaty
  Organization, Sovereignty, Public Works Program, Deforestation
  Treaty — the always-3rd
  Diplomatic Victory resolution from Modern (+/-2 DVP on the winning
  TARGET),
  the 10k vote-cost curve, outcome-then-target plurality, +1 DVP to
  every winning-combo voter, refund tiers 0/50/100, and the standing
  effects consumed on both engines (`congressSession` /
  `_world_congress`, readers `congressGppFactor` /
  `_congress_gpp_factor` and siblings); Statue of Liberty and Potala
  pay their sourced DVP at completion and Potala's diplomatic slot (and
  Forbidden City's wildcard) enter the live adoption
  (`wonderExtraSlots`). The BALLOT is a wire head: `SeatActionRecord.vote`
  carries [outcome, target, extra votes] per slate slot, favor buys extra
  votes on ANY resolution up the sourced curve, the refund tiers pay both
  engines' losers alike, and a seat that submits none votes the AI line
  (`preference` / `_congress_pref`). The observation carries the standing
  slate (`ladder.CONGRESS_FIELDS`). REACHABILITY (driven, 12 seeds x 250
  turns): a ballot rides the wire on 12 of 12 seeds from t119; (4 seeds)
  5 sessions per seed, a standing slate on 132 of 250 turns,
  UDT/Patronage/Migration all reached, DVP spread 4-11 (the 20-point
  win stays poke-only); the DV resolution fired on ONE seed (its curve
  and refunds ran in-game); HERITAGE ORGANIZATION never stands in-gate
  (Modern arrives too late for its rotation slot) — the geopolitics
  pokes are its bar. A ballot that DIFFERS from the AI line is
  `congress_vote_test` only: the ladder's own vote reproduces the AI line
  exactly, so the gate exercises the wire, not the choice. OPEN:
  - **THE FAVOR TIE-BREAK is unmodeled.** SOURCED: "Ties are broken by
    the proportion of Diplomatic Favor a player commits." Both engines
    break an outcome tie to A and a target tie to the lower index, which
    is a stylization the source contradicts — closing it needs the
    committed-favor totals carried into `tally` / `_congress_settle` on
    both sides.
  - **THE OBSERVATION RENDERS THE STANDING SLATE, not the UPCOMING one.**
    A ballot addresses the session about to run, and the resolutions it
    will carry are computable (`_congress_upcoming`) but not rendered, so
    a net votes on the previous session's slate.
  - **EIGHT resolutions still have no carrier**, each blocked on a named
    absence: Arms Control (weapons of mass destruction), Espionage Pact
    (spies), Governance Doctrine (a governor roster with appointment and
    promotion, B-24r), Military Advisory (unblocked since the promotion
      classes shipped — unwritten, not absent),
    Global Energy Treaty (its POWER-consuming buildings exist now; what
    is left is the climate arc, C-24), Public Relations (grievances,
    C-19), Luxury
    Policy and World Religion. The last two are HALF-sourced, and a
    resolution whose two outcomes cannot both act is worse than an
    absent one — it eats a rotation slot and passes a no-op — so they
    wait with the rest:
    - **Luxury Policy.** SOURCED: "A: Duplicates of this Luxury resource
      grant additional Amenities. / B: This Luxury resource grants no
      Amenities." B is fully specified; A publishes no number, and
      nothing in either engine counts DUPLICATE copies of a luxury —
      amenities come from distinct types.
    - **World Religion.** SOURCED: "A: +10 Religious Combat Strength for
      all units of this Religion. / B: Condemning a unit of this
      Religion yields 25 Diplomatic Favor." Both magnitudes are
      published, and B's VERB now exists on both engines
      (`condemnHeretic` / `_condemn_heretic`), so this one is unwritten
      rather than blocked.
  - **THE CULTURE BOMB DOES NOT WIPE UNFINISHED CONSTRUCTION.** SOURCED
    (Culture Bomb): a bombed tile carrying a district or wonder still
    UNDER CONSTRUCTION is flipped anyway, "wiping out any unfinished
    construction in the process". `cultureBomb` / `_culture_bomb` leave
    such a tile alone instead. Closing it needs a cross-engine
    cancel-the-queued-item primitive: TS holds a `City.queue` ARRAY plus
    a district/wonder registry entry, the GPU holds one `city_current` +
    `city_qtile`, and dropping an item from the middle of the TS array
    has no GPU twin.
  - **EMERGENCIES AND SPECIAL SESSIONS SHIP** (`cpu/core/emergency.ts` +
    the `phase` driver, `_raise_emergency` / `_special_sessions` /
    `_hold_special_session` / `_resolve_emergencies` / `_pay_emergency`).
    Both sourced rows are in the catalog with their verbatim texts:
    conquering another major's city raises a MILITARY Emergency,
    conquering a city-state a CITY_STATE one. A sponsor among the
    affected pays 30 favor "as long as the previous session - Regular or
    Special - took place 15 turns or prior", "the Special Session occurs
    after the next turn", every living major votes and a tie carries the
    way outcome A does, the losing side is refunded whole, and the
    members go to war with the target with NO grievances — "an effort of
    the international community". Liberating the contested city pays
    every member 100 favor plus the permanent reward (+5 healing in the
    target's territory, or +1 gold per envoy for the minor row);
    surviving the 30-turn deadline pays the target 200 plus its own (+2
    CS on City Strikes against members, or +2 gold on minor legs). While
    it runs: +2 CS for a member, +1 MP on the target's ground, +20
    loyalty in the contested city. The ballot's fourth slot carries the
    special session (`CONGRESS_SPECIAL_SLOT` / `_special_slot`) and the
    observation renders the lowest live record keyed on
    (kind, target, city), because slot POSITION is engine-local.
    REACHABILITY: the gate reaches the MILITARY trigger through
    `transferCity` / `_transfer_city`; the CITY_STATE row needs a major
    to take a minor's city, which no gate lane has done — the pokes
    (`tests/cpu/minors/emergencies.test.ts`, `tests/gpu/emergency_test.py`)
    are the bar for the whole ladder above the trigger.
  - **SCORED COMPETITIONS are still absent.** The other real DVP faucet:
    Aid Request, Border Dispute, Catastrophe, Military Competition and
    the rest score participants over a window and pay the podium.
    Floods already fire, so an Aid-Request-shaped competition has a
    trigger to hang off; what it lacks is a per-seat scoring window and
    the podium payout, neither of which the Congress code carries.
  - **Peace deals carry no terms.** Real Civ 6 brokers peace through the
    TRADE screen — cities, gold, resources and favor change hands on the
    same deal. The treaty SYSTEM is no longer the blocker; what is missing
    is the NEGOTIATED two-sided deal inside it (C-2): no source publishes
    the valuation, and the wire has no offer/accept protocol.
  - **THE OCCUPIED-CAPITAL PENALTY SHIPS; the other two favor penalties
    do not.** All three rates ARE published (Diplomatic Favor, "Losing
    Favor"). **-5 favor/turn for each ORIGINAL CAPITAL a seat holds that
    is not its own** is live on both engines: `City.origCapitalSeat` /
    `city_orig_cap` remembers whose capital a city was FOUNDED as,
    survives every transfer, and `occupiedCapitals` /
    `_occupied_capitals` feeds `diplomaticFavorPerTurn`, whose sum is
    floored at zero. A loyalty flip counts as occupation because it goes
    through the same transfer. Still open, each on a named absence: 200
    Grievance = -1/turn with -1 more per 50 beyond, capping at -10
    (grievances, C-19); and -1/turn per 3 pollution points above the
    world average, capping at 20 (C-24).
- **B-24r. Ages/governors tails:** the DEDICATION catalog now holds NINE,
  both faces sourced and hooked (To Arms!, Hic Sunt Dracones, Reform the
  Coinage, Heartbeat of Steam, Wish You Were Here). Two of this entry's own
  residuals were premises that the source contradicts, and both are closed:
  - **The per-era availability windows ARE published** — the Age page carries
    the complete table, not just Automaton Warfare's row. `DEDICATION_ERAS` /
    `_ded_eras` now hold it: Ancient offers none, every era through Modern
    offers exactly the four the source lists, and Atomic onward offers what is
    left after the three system-less entries drop out. The pick is still the
    stateless round-robin, but over the WINDOW rather than over the catalog.
  - **Wish You Were Here was not blocked on seaside-resort tourism.** Its
    normal face is "+1 Era Score for each Artifact extracted" (excavation
    exists) and its golden face is "Cities with Governors receive 50% Tourism
    from World Wonders. +100% Tourism to all National Parks" — both faces ship,
    the wonder half attributed per city through the loop-top governor seating
    the loyalty payout already takes.
  - **The three system-less entries are systems now.** The catalog holds
    TWELVE: Bodyguard of Lies, Sky and Stars and Automaton Warfare ship with
    both faces, on the classes this round built. Bodyguard pays era score per
    successful offensive spy operation and cuts every offensive clock by a
    quarter; Sky and Stars pays for the flight eurekas and grants Aluminium
    per turn; Automaton Warfare pays for a GDR kill, grants Uranium per turn
    and per mine, and hands a free GDR at the era boundary. Sky and Stars'
    OTHER golden half — "+100% XP for all Air Units" — has nothing to
    multiply and is C-32.
  Residuals: To Arms!'s special Casus Belli (no denouncements),
  and the corps/army kill event (no formations — a faithful zero, like Civ 6
  before Nationalism). Also open: dark-age policies; governor PROMOTIONS, blocked on
  governor IDENTITY — a promotion attaches to a NAMED governor persisted in
  one city, needing assignment state and the establishment clock, where
  titles here are anonymous per-turn seats (the 5-turn clock gates only
  promotions — the +8 loyalty is by-assignment in real R&F, sourced, so the
  stateless greedy ranking is faithful for the one channel modeled); per-civ
  tech-era drift
  (eras are global 50-turn blocks).
- **B-30r. SPECIALIST residuals.** Specialists are a mechanic now, on both
  engines: slots = the district's standing buildings (max 3, dark under
  pillage), the sourced GS yields with the TOP-building tiers
  (`SPECIALIST_YIELDS`/`SPECIALIST_TIERS` — Commanders exist, the old "no
  Encampment specialist" note was wrong; wiki "Specialists (Civ6)"), and
  the assignment: PINNED citizens first (`City.specialistPref` /
  `city_spec_pin`, a wire head), then the OVERFLOW — population beyond the
  workable pool — fills whatever slots are still free in PLACEABLE_DISTRICTS
  order (`effectiveSpecialists` / `_city_specialists`, a compared digest
  column). The TILE half of the same choice is `Tile.locked` /
  `tile_locked`, flipped by `SeatActionRecord.lockTiles`: a locked plot the
  city can work is taken before anything is ranked by score
  (`assignWorkedTiles`, and the GPU work key's locked base). The manual
  `setSpecialists` verb and its dead `city.specialists` map are deleted.
  REACHABILITY (driven, 12 seeds x 250 turns): the LOCK lands on 12 of 12
  seeds from t2 (138 plots standing at t250) and the PIN on 11 of 12 from
  t114 (36 slots standing), so both overrides ride the gate for most of a
  game; (4 seeds) 3 of 4 grow OVERFLOW specialists in-game — first at
  t154/t183/t196, standing on 72 and 69 of 250 turns on two seeds, one
  seed never overflowing — so the digest column is exercised late-game;
  the TIERS, the catalog-order fill and the pillage gate are poke-only
  (`district_breadth_test` section i), and the pin and the lock have their
  own lane (`citizens_test`). OPEN:
  - **A LOCK OUTLIVES THE CITY THAT SET IT.** The lock lives on the PLOT on
    both engines, so a plot that changes hands carries it to the new owner,
    where real Civ 6 loses citizen management with the city. One rule,
    identical on both sides, and wrong in the same way — closing it needs
    the lock cleared wherever tile ownership moves. The SPECIALIST pin does
    not have the bug: it lives on the city and both engines drop it at a
    capture, because TS's flipped literal carries no `specialistPref`.
  - Specialists provide yields ONLY in Civ 6 (sourced — no GPP, unlike
    Civ 5). The Industrial tier now names all three plants and the Theater
    tier names the Broadcast Center alone, which is correct: the Film
    Studio is an AMERICAN unique that REPLACES it, so it belongs to C-26,
    not to this row.
- **B-31r. Trade-route tails.** The Trader is a UNIT now (Ancient
  civilian, FOREIGN_TRADE, progressive cost) that a route SPENDS; it walks
  the land path laying roads, holds the route open until the round trip
  completes, comes back on completion or a war cancel, and DIES to an
  at-war unit standing on its tile. The decision is a wire verb
  (`SeatActionRecord.route`), re-validated by both appliers, with the
  candidate row tripwire-compared in the serve gate. Open:
  SEA LEGS ship, and this entry's own summary of them was wrong: real Civ 6
  has no "harbor refuel". The sourced rule is two BASE RANGES — "the base
  range for land trade routes is 15 tiles ... the base range for sea trade
  routes is 30 tiles" — with maritime access at both ends the gate
  ("both the origin city and the destination city require maritime access ...
  in order to establish sea Trade Routes"), Celestial Navigation to move on
  Coast and Cartography to move on Ocean. All of that is live on both engines:
  `tradeRouteRange` / `_trade_pair_range` pick the range per pair,
  `cityMaritime` / `_city_maritime` answer the access question (a coastal
  centre or a complete Harbor), and `tradeWaterLevel` / `_trade_water_level`
  decide how far out the descent may go. The Trader now EMBARKS: one descent
  walks land and sea, "the route may start in an inland city, then go to a
  coastal city ... move over sea to another city with a Harbor, then continue
  on land", and roads are laid on land tiles only. `walkLeg` -1 has shrunk to
  the pairs NO descent reaches at all.
  Open:
  - TRADING POSTS are still not founded — the only thing that extends range in
    real Civ 6 ("{{TradeRoute6}} range cannot be enhanced via technology"), and
    no per-post gold at repeat destinations (Bandar Brunei's row waits on them).
  - A city-state's maritime access is its CENTRE's alone: a city-state cannot
    build a Harbor in this model, so the district half of the test has nothing
    to read on that side.
  - `PLUNDER_ROUTE_GOLD` (50) is a stylization; no public source names
    the real base magnitude.
  - **The destination is ONE candidate row plus a take/skip.** Every legal
    destination now COMPETES for that row: `routeCandidateRow` /
    `_seat_route_candidate` scan a seat's own cities, its met city-states and
    every other major's explored cities in one pass, ranked on one key — the
    route's total yields, `routeYieldsInternational`'s `intlGold + districts`
    for a foreign city beside the domestic `2 + 2*floor(districts/2)` and a
    city-state's flat gold+specialty. A foreign destination is no longer a
    fallback reachable only when nothing domestic is. Two things stay open:
    that single summed-yield key is this engine's heuristic and not a game
    rule (real Civ 6 hands the player every legal pair and lets need decide,
    and summing gold against food is what makes an international route win
    almost every comparison here), and the POLICY still sees one candidate
    and a take/skip — the observation renders no alternatives, so the
    free-choice head is P8-surface work, alongside the route verb joining
    `env.step` (which today carries no buy/levy either).
- **B-34r. Flood tails.** The RIVER FLOOD now runs the Gathering Storm Flood
  page's two tables rather than a pillage-and-silt stub. A flood rolls a
  severity (Moderate / Major / 1000 Year) and then, at that severity's
  published rates: always pillages the improvement and sometimes destroys it
  (50% / 80%), damages the district and takes its buildings dark with it
  (50% / 80%), deals 30-50 or 50-70 HP to every unit on the tile, kills a
  civilian outright and costs the owning city a citizen (15% / 25%), takes the
  same HP off a CITY CENTER standing on the floodplain along with its
  perimeter, and silts FOOD and PRODUCTION on two independent rolls off the
  terrain's own column — which is what `Tile.fertilityProd` / `fertility_prod`
  is, a second fertility plane the yield walk reads. The GREAT BATH mitigates:
  no destruction at all, fertilization at half rate, from the sourced
  "Fertilization rates will drop about 50%, but there will be no destruction
  anymore". The draw count is EIGHT, unconditionally — a count that depended
  on what stood on the tile would have to be mirrored condition-for-condition
  on the other engine.
  THE REACH IS THE RIVER. CIV6: "The level of the water rises, flooding all
  Floodplains tiles found along the River, and then recedes on the next turn."
  `riverReach` / `river_comp` walk it: two tiles are on the same river when a
  river EDGE separates them, which is exact here because a river's edges are a
  vertex-connected chain and any two edges meeting at a vertex are consecutive
  edges of one common tile. `floodRiver` / `_flood_river` roll ONE severity
  for the whole flood and then take every Floodplains tile of that river at
  it, in ascending tile order — so the draw count is one severity roll plus
  SEVEN per tile, still independent of what stands on any of them. A
  Floodplains tile carrying no river floods alone. REACHABILITY: the fixtures
  hold rivers of 12, 8, 6, 5, 3 and 2 floodplains, so the multi-tile reach is
  live in the driven gate; `flood_severity_test` poke f pins it.
  THE SHIELD BELONGS TO THE RIVER. CIV6: a Dam or Great Bath "along a River
  will mitigate floods THERE", so `riverShielded` / `_river_shielded` ask the
  REACH, not the seat: one complete, unpillaged DAM or GREAT BATH standing
  anywhere along the river cancels the destruction on every tile it floods and
  halves the silt, whoever owns them. A shield off the river protects nothing,
  and a pillaged one protects nothing — which is what BREACH DAM (C-16) trades
  on.
  OPEN:
  - **The Great Bath's "+1 Faith for every time a tile belonging to this city
    has been Flooded"** needs a per-tile flood COUNT that nothing stores.
  - Climate change ending fertilization at Phase IV, the Egyptian ability, the
    Soothsayer and COASTAL floods all wait on systems that do not exist here.
- **B-36r. Appeal adjacency terms.** The four terms whose sources exist here
  now pay: an adjacent HOLY SITE, THEATER SQUARE or ENTERTAINMENT COMPLEX is
  +1 and an adjacent BARBARIAN OUTPOST is -1, on both engines
  (`tileAppeal` / `_tile_appeal`). An outpost lives on the barbarian seat
  rather than on its tile, so TS threads the camp set through the six appeal
  call sites (`campTiles`) and the GPU builds the tile view from `camp_tile`,
  bumping `_eff_version` at both camp writes so the appeal cache sees them.
  Appeal feeds Neighborhood housing, Seaside Resort gold and tourism and
  National Park legality, so the change is live on every seed.
  EVERY DISTRICT TERM IS NOW ONE CATALOG COLUMN. `DistrictDef.appealAdjacent`
  / `_appeal_adj` is what both walks read, so the appeal walk names no district
  type at all and a new row carries its own term: the Dam, Canal, Water Park
  and Preserve are +1 like the three that shipped first, the Aerodrome is -1
  like the other heavy-industry rows, and the Government Plaza and Diplomatic
  Quarter are 0.
  OPEN, each blocked: the unique-improvement terms (C-4) and the
  appeal-granting Great People (C-21).
- **B-39r. Wonder effects still dropped.** All THIRTY rows were re-fetched
  from the GS Civilopedia one by one and the effect lists rewritten against
  them, so `BUILT_WONDERS` is now a sourced table rather than a costs-and-
  unlocks table with eyeballed effects. Fourteen new channels carry what that
  found: per-turn Great Person points, city housing, city amenities,
  terrain/feature tile yields (which `petraDesert` folded into), amenities per
  nearby improvement, policy slots by KIND, envoys per wonder built, spread and
  build charges, a certain Martyr, the duplicate naval train, the relic- and
  resort-tourism multipliers, the loyalty aura, occupation defence, free
  civics/techs, the treasury multiplier and era score per moment.
  Twelve invented yield entries went with it — Etemenanki's and the Great
  Bath's faith, Apadana's culture, the Mausoleum's three, St. Basil's faith and
  culture, the Taj Mahal's faith and culture, the Statue of Liberty's culture, the
  Hermitage's and the Bolshoi's culture, the Venetian Arsenal's production,
  Big Ben's +10% gold and Oxford's flat science — none of which the real
  wonder pays; and four wrong magnitudes were corrected (Colosseum 1 -> 3
  amenities, Oxford +10% -> +20% science, Potala science/faith -> culture 2 /
  faith 3, Sankoré 2 -> 3 science).
  OPEN, each blocked: Apadana's "+2 Great Work slots (any type)" and the
  Hermitage's LANDSCAPE-only art slots, both waiting on the per-work TYPE
  B-20r names; the Mausoleum's "all Engineers have an additional charge"
  (C-21 — a Great Person fires instantly here and is never a unit); the Great
  Bath's per-flood faith (B-34r); and Cristo Redentor's clause that relic and
  holy-city tourism is not diminished by a rival's Enlightenment (C-23).
- **B-45r. The effects the SOURCED sweep found in the other rows.** Three of
  the eight now have a channel, each re-sourced at its own page before it was
  written: `cityYieldPerImprovement` pays the Ruhr Valley's "+1 Production for
  each Mine and Quarry in this city" off the tiles that city OWNS, a pillaged
  improvement paying nothing (`_wonder_improvement_yields` is the twin);
  `boostTechsThroughEra` gives the Great Library "boosts to all Ancient and
  Classical era technologies" once at completion, one eureka per technology
  not already boosted or researched and each a Free Inquiry event like any
  other; `districtGpPoints` gives the Oracle's "+2 Great Person points of
  their type" to every district in its own city. REACHABILITY: the gate
  finishes no wonder, so `tests/gpu/wonder_effects_test.py` sections 13-15 and
  `tests/cpu/city/wonder-effects.test.ts` are the only proof.
  OPEN — the five that still have nowhere to live:
  - Stonehenge's free Prophet and its found-a-religion-on-the-wonder clause,
    and the Pyramids' free Builder: a wonder that GRANTS A UNIT has no path
    (C-21).
  - The Oracle's 25%-cheaper Great Person patronage: faith never buys a Great
    Person here (C-9), so there is nothing to discount.
  - The Great Library's boost when a RIVAL recruits a Great Scientist: no
    engine raises an event on another seat's recruit.
  - The Colossus' and Great Zimbabwe's +1 trade-route capacity and free
    Trader, Great Zimbabwe's per-bonus-resource route gold and Sankoré's three
    route-yield terms: all wait on B-31r's route-yield work.
- **B-46r. The siege class's tails.** All three things this row named now
  ship. `UnitDef.bombard` / `_type_bombard` is the stat "only units with
  attacks that use Bombard Strength" bring, and it hits a perimeter at FULL
  damage with no city penalty, because the -17 a siege unit carries is the one
  "against land units" that its ranged strength already holds — the CATAPULT
  (35, Engineering) and the BOMBARD (55, Metal Casting, Niter) field it. The
  BATTERING_RAM and the SIEGE_TOWER ride the civilian plane beside the army
  they follow, and `siegeAssist` / `_siege_assist` lends their ASSIST_ bits to
  an adjacent MELEE or ANTI-CAVALRY attacker only: a ram makes the perimeter
  share full, a tower makes the centre share bypass the walls entirely. The
  four walls TIERS are what turn each of those off — Ancient 100 / Medieval
  200 / Renaissance 300, each +3 Combat Strength, and Urban Defenses 400 with
  no Combat Strength at all, granted by Steel with no building and no
  production. The ram stops at tier 1 and the tower at tier 2, so "whenever a
  city builds Renaissance Walls, only units with Bombard Strength will be able
  to inflict full damage to its defenses" holds by construction.
  The MOVE-AND-SHOOT rule ships with them. The unit infoboxes' "3 or more
  Movement" is the Catapult's instance of the general rule the Movement page
  states: a unit whose attack uses Bombard Strength may move and shoot in one
  turn only if "its maximum Movement is at least 1 greater than normal when it
  attempts to shoot", and "if a unit has not moved, it can always shoot
  regardless of its maximum Movement". `siegeMayShoot` / `_siege_may_shoot`
  ask exactly that pair: whether the unit MOVED is `refreshUnits`' own gate
  (movesLeft against the pool this unit was GRANTED last refresh, not against
  its type's base moves, because a general's aura makes the granted pool vary
  per turn), and its maximum Movement is read fresh at the shot, which is what
  "when it attempts to shoot" asks for. The gate sits on `rangedAttackInner`,
  `hostileRangedStrike` and `attackTargets`, and on the ATTACK and SNIPE mask
  columns beside `_ranged_attack` and `_hostile_ranged_strike`.
  REACHABILITY: nothing in the scripted gate builds a Catapult or a support
  chassis, so the battery proves the two engines agree about these bodies and
  the poke lanes are what prove they agree with the pages.
  OPEN:
  - **AKKAD's SUZERAIN BONUS** confers the Battering Ram's ability "against
    all levels of city defenses and against all cities (regardless of presence
    or absence of support units)". Akkad is not in the city-state roster —
    B-21r.
- **B-54r. Flanking and support against their own page.** Both bonuses ship,
  and both were written from the Combat page's one-line summary rather than
  from Flanking and Support (Civ6), which sourcing the class modifiers
  finally opened. Six
  rules moved. Neither exists before MILITARY TRADITION, and barbarians get
  them "once at least half of the major civilizations have researched" it, so
  `flankSupportLive` / `_flank_support_live` gate both counts — every seat that
  is not a major reads that same count, because a barbarian holds a Seat record
  and never researches. A flanker must be a unit "currently owned by the same
  player" as the ATTACKER, where `flankCount` had counted anyone merely hostile
  to the defender, which handed a third major's army to my attack. "Units
  across a River from the targeted enemy do not provide Flanking", read off the
  target tile's own `riverMask`. Support is a MELEE-only term — "ranged attacks
  ignore any Support received by the defender" — so it left `rangedAttackInner`,
  `hostileRangedStrike` and BOTH city-strike sites (`cstk` and `estk` are
  bombardments), and `defenderCS` now takes the attack it is defending against
  rather than assuming one. Embarked land units "provide Support like normal"
  and only fail to flank, where both counts had excluded them. And "units will
  not gain Support when inside defensible Districts", though units inside one
  still provide it. And an embarked defender keeps its escort: the page
  withholds Support from one only "against attacks of enemy naval units",
  where both engines had denied it to every attacker — `defenderCS`'s embarked
  branch and `_hostile_vs_unit` now gate that on the ATTACKER being naval.
  REACHABILITY: the scripted gate reaches melee and city strikes on every seed,
  so the support removal is live everywhere; MILITARY_TRADITION is an Ancient
  civic the driver takes early, so the gate opens mid-game rather than never.
  OPEN:
  - **THE HIGHER-STACK UNITS AND PROMOTIONS.** Impi, Hypaspist, Double
    Envelopment, Square, Shadow Strike, Georgy Zhukov and Horatio Nelson each
    raise a stack above +2 for their owner only. Double Envelopment and Square
    now ship as `FLANK_MULT` / `SUPPORT_MULT` rows their owner's unit must
    hold; the unique units are C-26's, the two Great Person identities are
    B-53r's, and Shadow Strike is not in the 72-row catalog.
  - **THE STACKS STOP SHORT OF THEIR CIV 6 MAXIMA.** Flanking tops out at 5
    here and 6 there; Support at 6 here and 10 there. Both ceilings are the
    same blocker, B-55r: Civ 6 counts a water tile holding an embarked unit
    AND a ship as two providers, and no tile on either engine can hold both.
- **B-55r. A ship cannot carry a passenger.** `tileFreeForUnit` and
  `_blocked_for` allow one unit per DOMAIN per tile and `unitDomain` has two,
  so a naval unit and an embarked land unit — both military — can never share
  a water tile. Civ 6 stacks them, and publishes rules that only make sense on
  the stack: the Combat page settles who defends ("when a naval unit and an
  embarked unit occupy the same hex, the unit with the higher Combat Strength
  will defend against ranged attacks"), and Flanking and Support builds its
  maxima on it ("a water tile containing an embarked unit and a naval unit
  provides +4 Combat Strength to any friendly unit defending in an adjacent
  tile"), which is how Support reaches 10 stacks across the 6 tiles a hex has.
  So no escort can shield a transport by standing on it, and both bonuses stop
  short of their real ceilings (B-54r). The third Civ 6 slot, the SUPPORT unit
  class, is not the same gap: BATTERING_RAM and SIEGE_TOWER carry `charges`,
  so `unitDomain` already files them as civilians and they stack with an army.
- **B-56r. The ten inert promotions.** 62 of the 72 catalog rows in
  `cpu/data/promotions.ts` reach a rule through `promoCS` / `_promo_cs` or one
  of the flag and value kinds beside them. TEN carry `none` because the
  mechanic they name is not in either engine, and each is recorded here with
  its own blocker rather than as a data comment:
  - **A SECOND ATTACK PER TURN** — Elite Guard's other half, Expert Marksman
    and Breakthrough each grant "1 additional attack per turn". Neither engine
    counts attacks: `spendAttack` expresses "the attack is spent" by ending the
    unit's movement, so there is no counter to raise.
  - **SENTRY** ("can see through Woods and Rainforest") — `revealAround` /
    `_reveal_around` reveal a flat radius, so nothing blocks sight and the
    promotion has nothing to lift.
  - **SUPPRESSION** grants zone of control to a ranged unit. `inEnemyZoc` /
    `_in_enemy_zoc` count EVERY hostile military unit, ranged included, so the
    promotion has nothing to grant. The real gap is the other way round: a
    ranged unit should not exert ZOC without it, and making it class-aware is
    the fix this row is waiting on.
  - **CONVOY and ESCORT_MOBILITY** move an escorted unit with its escort. No
    formation model exists: `unitsAt` / the occupancy planes hold units, never
    pairs, so there is no escort to speak of. Related to B-55r but not the
    same gap — that one is about a tile holding two units, this one about two
    units moving as one.
  - **CAMOUFLAGE and CREEPING_ATTACK** need stealth: C-25.
  - **PROXIMITY_FUSES** is "+7 Combat Strength when defending against air
    attacks". Air attacks exist now, so C-16 is no longer what stops it; the
    blocker moved. `airStrike` / `_air_strike` roll the defender at
    `airDefenseOf` / `_type_anti_air` alone and never call `promoCS` /
    `_promo_cs`, so NO promotion reaches that roll — threading the promotion
    term into the sortie is the work, and it changes every defensive
    promotion's reach at once, which belongs with B-54r's combat-page pass.
  REACHABILITY: the ten rows ARE offered — `_promo_offer_mask` opens them and
  the driver takes them — so a unit can hold an inert promotion and nothing
  will change. That is the visible symptom. The other 62 are proved by two
  poke lanes rather than by the gate, which reaches a tier-4 row only by
  accident: tests/gpu/promotions_test.py for the ladder, the head and the
  Combat Strength evaluator, tests/gpu/promo_effects_test.py for the
  seventeen kinds that are not Combat Strength.
- **B-57r. The SNIPE head stops at the distance-2 ring.** `unitAttackRange` /
  the barbarian scan both add the RANGE promotion's +1, so the RULE legalises a
  distance-3 shot on both engines and `rangedAttackInner`'s own gate accepts
  one. The driven wire cannot ask for it: the SNIPE block is twelve columns
  over `snipeRing` / `ring2`, the distance-2 ring alone, so Forward Observers
  and Coincidence Rangefinding widen a legality no seat can exercise. The fix
  is 18 more columns (the distance-3 ring) appended after the last verb, plus
  the ring itself on both engines — an append-only head change, not a blocked
  one.

- **B-58r. The religious purchase asks for a Shrine, not a majority religion.**
  CIV6 (Apostle, and the Inquisitor page verbatim): the unit "can only be
  purchased with Faith in a city that has a majority religion and a Holy Site
  with a Temple (or one of its replacements)". `purchaseReligiousUnit` /
  `_seat_religious_city_ok` ask for a SHRINE plus a complete unpillaged Holy
  Site, and a TEMPLE on top for the Apostle and the Inquisitor — but neither
  engine reads `city.followedReligion` / `city_followed` at the counter, so a
  city pressed into a rival's religion still sells its owner's Apostles. The
  Shrine is this engine's own stand-in and the majority test is the missing
  half.

- **B-59r. The religious spread is a flat lump.** CIV6 (Apostle): Spread
  Religion "converts Citizens in adjacent city to Apostle's religion (Pressure
  = 2.2 * Apostle's current HP) and reduces total Religious Pressure of all
  foreign religions in the city by 25%". `spreadFromUnit` / the `_A_SPREAD`
  arm add a constant `SPREAD_PRESSURE` times the enhancer multiplier and strip
  nothing. Three halves are open:
  - **THE PRESSURE DOES NOT SCALE WITH HP.** A wounded Apostle converts as
    hard as a fresh one, so theological combat costs a spreader nothing but
    the risk of dying.
  - **THE BASE 25% STRIP IS ABSENT.** Only the Proselytizer promotion strips
    anything (75%, sourced); the unpromoted spread leaves every rival's
    pressure untouched. The two are meant to stack as base-and-upgrade.
  - **A CITY-STATE CANNOT BE CONVERTED.** `allCities` is
    `state.seats.flatMap` — majors only — and the GPU's spread scans
    `city_alive[:, :n_majors]` to match, so the minors carry no religion on
    either engine. That is why Translator's "this also applies to city-states"
    clause has nothing to triple; it belongs with C-30's family of things a
    minor does not track.

- **B-60r. The dig's DATE, and the hull nobody dates.** The artifact's
  CIVILIZATION is the event's own on both engines now — `markAntiquitySite` /
  `markShipwreck` and `_dig_at` take the actor and the buried civilization
  separately, every death path hands over the seat of the unit that fell, and
  a razed outpost hands over the barbarians. Two halves stay open:
  - **THE ERA IS STILL THE ACTOR'S RESEARCH.** Real Civ 6 dates a find by the
    era the EVENT happened in; both engines read `civEraIndex` of the acting
    seat, so the same battle buries a different era depending on who struck
    the blow. A world era exists (`worldEraIndex` / `_world_era`) and would be
    the faithful reading, but changing it moves the pre-Modern gate that
    decides whether a dig is created at all.
  - **A BARBARIAN OR MINOR ACTOR SINKS A HULL THAT LEAVES NO WRECK.** The era
    gate needs a research row and neither carries one, so `markShipwreck`
    refuses outright — every hull a raider sinks vanishes without a dig. The
    same world-era reading above would close it.

- **B-51r. The Encampment's second pool.** An assault on the district now
  meets the perimeter: `attackEncampment` / `_attack_encampment` find the city
  behind the tile (`cityAtTile` / `_owner_city_col`) and divide the roll
  through the same `cityDamageSplit` a hit on the centre uses, so the -85% and
  the walls tiers apply and only what gets through reaches the garrison. The
  district also fights at the city's Combat Strength INCLUDING the walls tier's
  bonus and excluding the garrison's +5, which is Civ 6's "similar to the
  parent City Center, excluding any bonus obtained for a Garrisoned unit". Its
  heal now carries the sourced gate too: it regains 20 HP "if its tile is not
  occupied", and the moment it does its tile blocks again.
  REACHABILITY: the walls half of that strength was true of the GPU and NOT of
  TS until the driven gate reached an assault on a walled Encampment (seed
  9014, t170) — the entry asserted it for both engines while one of them read
  `Math.max(15, bestMeleeCS)` alone. `siege.test.ts`'s "defends at its city's
  WALLS tier" lane and `encampment_test.py`'s `test_district_defence_terms`
  are the bar now.
  OPEN:
  - **THE TWO POOLS ARE ONE HERE.** Real Civ 6 gives the district its own
    perimeter pool of the same size as the city's — you can beat down the
    Encampment's walls while the centre's still stand, and the repair project
    restores both. This model folds them into the city's pool, so damage to
    either is damage to both. Splitting them is new per-tile wire state and a
    second `outerHp` on every defensible district.
  - **A DEFEAT DOES NOT PILLAGE THE DISTRICT.** Civ 6: "when defeated (the
    Encampment's HP is brought down to 0), it and all its buildings are
    pillaged automatically". Writing that here would silence the clause above
    it, because `encampmentIntact` / `_encamp_block` read PILLAGED and HP
    through one predicate — a pillaged district never blocks again, so the
    "heals and re-blocks" rule would become dead. The two facts need to be
    separate before either can be right.
- **B-44r. City-state war tails.** The decider exists now: `warTargets` /
  `war_targets` run the whole minor roster after the majors, so the war head
  is `[declare per target, sue per target]` over both, and the minor columns
  carry the sourced gates — the meeting, the treaty term, the ten-turn
  cooldown, the suzerain who will not talk while still fighting you, and a
  peace that costs nothing. `ladder.pick_war` raids a minor the seat has no
  envoys in. REACHABILITY (driven, 12 seeds x 250 turns): a minor war stands
  on 4 of 12 seeds, first at t127, and the SUE column closes one on the same
  4, first at t145 — 6.5 turns at war per seed on average, 30 on the loudest.
  So the gate reaches the declare, the peace and the two clocks; the meeting
  gate, the treaty term and the suzerain refusal are `cs_war_test` section d.
  A WALKER NOW MARCHES ON ONE. `isTerritorial` replaced `isCiv` at every
  hostile-tile test, so `_war_march_target` scans a city-state's improvements,
  districts and CITY exactly like a major's; a minor keeps no `cities` array,
  so its ONE city is its centre. The march key is unchanged in meaning —
  distance, then the owner's seat id, then the centre tile — but its distance
  term now scales by `2048 * 256`, wide enough for a 100+ seat id. The same
  widening fixed a live engine-vs-engine divergence: `_seat_unit_mask` offered
  PILLAGE on ANY city-state tile with no war term at all, while `phase.ts`'s
  replay arm refused every one of them, so the column was a silent no-op; both
  now require a war with the tile's owner. REACHABILITY: `cs_war_test` section
  e is the only proof — the 250-turn gate declares on a minor on 4 of 12 seeds
  but the driver's plan is what would have to reach the walk.
  OPEN:
  - **THE BARBARIAN WALKER STILL RAIDS ONLY MAJORS, AND THE REASON IS THE
    WALKER.** `hostileUnitAct` / the `sim_orders` barbarian arm pillage a
    city-state's ground (`tOwned` is `isTerritorial` now) but scan only the
    MAJORS' cities for a march target. Widening that scan to minors was tried
    and reverted: this walker beelines to the single nearest city and stops
    adjacent to it, so counting minors parked every camp's units on the
    neighbouring city-state and no barbarian reached a major again — measured
    over three fixtures at 90 turns, the nearest barbarian sat 1 tile from a
    minor centre and 6, 19 and 4 tiles from the nearest major city, and the
    `ranged` and `combat_mod` poke lanes lost their situation entirely. Real
    Civ 6 barbarians raid whoever is near the camp; the target SET is the
    small half of this, and the beeline is the part that has to go first.
  - The diplomatic consequences of declaring — grievances, the warmonger
    penalty with other majors, the suzerain's reaction — wait on C-19.
- **B-53r. The Great Person QUEUE.** The roster is the game's now: all 205
  people from the nine Great Person pages, each carrying the ERA its page's
  own roster column names, ordered by era (`GREAT_PEOPLE`, `GP_FIRST_OF_ERA`).
  `gpOffer` / `_gp_first_of_era` offer the next unclaimed person no earlier
  than the WORLD era (`worldEraIndex` / `_world_era`), so anyone the world has
  passed is gone for the rest of the game and a class whose roster ends before
  the world era offers nobody at all — the Prophets run out after the
  Renaissance, which is the page's own "Industrial: No more Great Prophets".
  `gpCost` prices a recruit at its era base scaled by
  "base cost * (1 + 0.3 * difference in era) ^ difference in era" against the
  world era, except for the art classes and the Prophet, which the page
  exempts; the exporter ships the floored table so both engines read the same
  doubles. `state.gpNext` / `gp_next` carry the queue position beside the
  claimed-count `gp_earned`, and the census compares both.
  OPEN:
  - **THE OFFER IS RE-DERIVED, NOT FROZEN.** Real Civ 6 fixes WHICH person is
    on offer and WHAT it costs the moment they enter the queue; here both are
    computed fresh each turn from the world era, so a person on offer can get
    cheaper (or be skipped entirely) between one turn and the next without
    anyone claiming them. An exact model needs two per-class state fields —
    the frozen index and the frozen price — on both engines and on the wire.
  - **THE PAYOUT IS ONE ERA-SIZED LUMP, not the person's own ability.** Every
    recruit pays `GP_ERA_GPP[era]` in `GP_CURRENCY`'s currency for its class.
    Real Civ 6 gives each Great Person a UNIQUE activated ability; that is
    C-21's, and this row records that the roster now carries the names and
    eras those abilities would hang off.
- **B-D. UNSOURCED DATA VALUES — swept once; the named stylizations are
  OPEN, not closed.** The cpu/data walk fetched every magnitude from the GS
  Civilopedia row by row: all 28 wonders (12 corrected, every unlock now the
  real tech/civic), every unit, every technology and every civic (era, cost,
  prereqs — both trees were systematically off and now match the real tree),
  every building (costs; worship faith price 380), and every policy card
  (all 49, each against its own Civilopedia page — see C-6). What is LEFT is each labelled at its definition, and
  each is an open residual rather than a decision:
  THREE ROWS CLOSED by reading their real text, and one bullet was FALSE:
  - **The MONUMENT was carrying its VANILLA row.** SOURCED (R&F/GS): "+1
    Loyalty. +1 Culture. +1 additional Culture if city is at maximum
    Loyalty." It paid a flat +2 Culture and no loyalty at all. All three
    clauses now ship: `BuildingDef.loyalty` feeds `buildingLoyalty` /
    `_building_loyalty` into the loyalty delta, and the conditional point
    rides `special: 'MONUMENT'` / `b_maxloy_culture`.
  - **The LIGHTHOUSE was missing its tile clause.** SOURCED: "+1 Food. +1
    Food in Coast and Lake tiles controlled by the city." Only the flat
    point existed; the per-tile term now rides `special: 'LIGHTHOUSE'` /
    `b_coastfood` over the terrains `coastFoodTerrains` names.
  - **The MILITARY ENGINEER had no Armory gate.** SOURCED: "It can only be
    built in a city that has an Encampment with an Armory." Its own data
    (cost 170, GS maintenance 2, 2 moves, 2 charges, Military Engineering)
    was already right; the per-CITY gate was absent on both engines and now
    rides `UnitDef.requiresBuilding` / `_type_req_bldg`. What stays
    AUTHORED is only the seat's PRODUCTION RULE (`ENGINEER_LIVE`) — real
    Civ 6's AI forts chokepoints and publishes no rule that quantifies it.
  - **THE SPACEPORT UPKEEP BULLET WAS FALSE.** There is no district upkeep
    anywhere in either engine — `maintenance` is a BUILDING field, which
    matches real Civ 6, where districts cost no gold. Nothing stood in for
    anything; the bullet described code that does not exist.

  THE CITY-STATE ROSTER was swept the same way, against the wiki's own
  city-state list plus each row's page. SIX rows named a city-state that no
  current ruleset places, each with a published successor, and every one is
  replaced: Stockholm by Bologna, Seoul by Anshan, Amsterdam and Antioch by
  Venice, Toronto by Mexico City, Carthage by Ngazargamu. Nine more rows
  carried an invented paraphrase where the real line is published, and all
  nine now quote it. The seeder held a SECOND copy of the placement pool
  naming three city-states the catalog had no row for at all, so a placed
  minor could carry no suzerain bonus of any kind. The pools agree now and
  `tests/cpu/data/cityStateRoster.test.ts` asserts both directions, since the
  copy exists because `seeder/` is hashed into `genStamp` and may not import
  from `cpu/`.

  What remains open, each with what a source would have to publish:
  - **The GOVERNMENTS' inherent bonuses.** The GS rows ARE published, and
    three of them now ship verbatim: Classical Republic's "+1 Housing and
    +1 Amenity in cities with a district" (it paid +1 amenity everywhere),
    Communism's "+10% Science" (it paid +10% production), and Autocracy's
    Palace half, which its capital term already was. The rest need channels
    this model does not have, and each names what: Oligarchy and Fascism
    want a combat-CLASS axis, which the roster now carries (`UnitDef.melee` /
    `antiCavalry` / `cavalry`, read by `classMatchupCS`), so those two are
    unblocked and waiting on nothing but their own round; Monarchy wants
    housing per WALL LEVEL
    and a Renaissance-Walls favor term; Merchant Republic, Theocracy and
    Communism's other half want a per-city GOVERNOR gate on a yield;
    Theocracy and Democracy want a PURCHASE-price discount channel;
    Democracy's GS row wants ALLIANCES (C-2); Autocracy's "+1 to all yields
    for each government building" wants a per-city count of GOVERNMENT
    BUILDINGS folded into the yield bucket, which the Government Plaza's rows
    now make countable (`BuildingDef.govTier` / `_b_gov_tier`) and no channel
    yet reads. Every legacy bonus is out of scope by construction — R&F phased
    them out.
  - **The per-CITY war-weariness split is NOT published, and the empire-wide
    rule we implement IS.** SOURCED (War weariness): "At the end of each
    turn, you receive -1 Amenity for every 400 WWP you currently have, which
    is then applied to your cities" — exactly `warWearinessPenalty`'s shape.
    The three GlobalParameters (`WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_`
    `{AT_WAR_CITY 3, NONFOUNDED_CITY 1, FOUNDED_CITY 0}`) are real data, but
    no source states what they DO; the per-city reading is an inference off
    their names. Closing it needs the C++ behaviour, not a wiki page.
  - `GAME_SPEED` 0.6 (`constants`) — the one global speed stylization; real
    Civ 6 scales cost, yield and turn tables independently per speed, so
    this is a SHAPE difference, not a magnitude gap: closing it means
    modelling three tables, and no single number can be right.
  - the BELIEF magnitudes (`religion` header) — model numbers, not Civ 6's.
  - the deliberate tuning constants in `seats` (its header names them):
    model tuning, not Civ 6 values, and every one is a place the two engines
    agree on a number real Civ 6 never states. These will NEVER close by
    sourcing — they are open because they are stylizations, and the honest
    entry says so once rather than being re-checked every round.
  - the FLOOD SEVERITY split (`disasters`) — Moderate / Major / 1000 Year
    come up 60 / 30 / 10 here. The Flood page publishes every per-severity
    effect rate and no distribution at all, tying the frequencies to a
    Disaster Intensity setting that has no counterpart here; the SHAPE is
    sourced, the three numbers are not.

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

- **C-1. POWER — the emissions and the renewable roster.**
  Weight 2. THE GRID SHIPS, on both engines: a city's base LOAD is what its
  standing buildings ask (a pillaged district's ask nothing, like their
  yields) plus 5 per Terrestrial Laser Station it has completed, and the
  load is met in FULL or not at all — "a city cannot supply Power to some
  buildings and not to others". Two supplies answer it. A POWER PLANT
  "will attempt to provide required Power to all cities within range",
  measured from its own Industrial Zone tile to the receiving CITY CENTER
  over the reach a regional building has, so a Mexico City suzerain widens
  the grid with it (`cityPower` / `_city_power_need`). The RENEWABLE half
  "provide[s] Power only for [its] respective city"; the one that exists
  here is Cardiff's, "+2 Power for every Harbor building", now a
  `SUZ_EFFECTS` rule rather than a flat channel.

  The three plants are the real roster — Coal (Industrialization, 300),
  Oil (Electricity, 360) and Nuclear (Nuclear Fission, 480), mutually
  exclusive in one Industrial Zone, each maintenance 3. Oil and Nuclear pay
  their production (and the Nuclear plant's science) REGIONALLY; the Coal
  plant instead "Grants bonus Production equal to the district's current
  adjacency bonus", and that half is LOCAL. All three lift the Industrial
  Zone's specialists, so `SPECIALIST_TIERS` names a LIST of top buildings
  rather than one.

  Every powered-yield SPLIT is sourced from its own GS effect block and
  ships as `power` + `poweredYields` / `poweredAmenities`: Factory 2 ->
  +3 Production, Research Lab 3 -> +5 Science, Broadcast Center 3 ->
  +4 Culture, Stock Exchange 3 -> +7 Gold, Stadium 2 -> +2 Amenities. A
  REGIONAL building pays its powered half from any lit source that reaches,
  independently of which source paid the base — "multiple Factories within
  the 6-tile range will all draw Power without providing extra Production
  bonus". The Terrestrial Laser Station is counted on the CITY that built
  it and speeds the craft only while that city is powered; the Lagrange
  station is the seat's and is unconditional (`laserSpeed` /
  `_laser_speed`). Poke lanes: `tests/gpu/power_test.py`,
  `tests/cpu/city/power.test.ts`, and the two space lanes for the stations.
  REACHABILITY: the plants unlock in the Industrial era and the gate's
  seats reach it, but nothing in the driven gate has yet BUILT one — the
  grid is poke-proven, not gate-proven.

  OPEN:
  - **THE DECOMMISSION AND RECOMMISSION PROJECTS.** A plant burns its fuel
    now, but nothing can retire one: no project row takes a Coal or Oil
    plant off the grid, and the Nuclear plant's reactor has no age to reset.
  - **A CITY-STATE'S CITIES ARE NEVER POWERED.** `resolveSeatPower` /
    `_resolve_seat_power` run inside the MAJOR seat loop, so a minor's
    buildings ask for a load nothing ever answers and its `powered` flag
    stays false for the whole game. Both engines agree; neither is Civ 6.
  - **NO CO2, so no Accords and no reason to switch plants.** The whole
    point of the three-plant ladder is that Coal emits most and Nuclear
    least; blocked on C-24.
  - **THE FOUR RENEWABLE GENERATORS** — Geothermal Plant, Solar Farm, Wind
    Farm and Offshore Wind Farm — are improvements with their own terrain
    gates, and none is in the improvement roster.
  - **THE HYDROELECTRIC DAM**, "the first available and most potent source
    of renewable Power", needs the Dam district (C-22, B-34r).
  - **THE BIOSPHERE** raises every renewable source (Cardiff's included) by
    200%; the wonder is not in the roster.
  - **THE NUCLEAR PLANT'S REACTOR AGE** — the rising accident chance and
    the Recommission Nuclear Reactor project that resets it — has no clock.
- **C-2. DIPLOMATIC AGREEMENTS.** Weight 3. THIS ENTRY USED TO SAY "no treaty
  of any kind ... war and peace and nothing between them", and two of the five
  gaps it listed had shipped before it was written: alliances and
  denouncements have been wire verbs with engine arms since the seat
  unification. What was true is that both were STYLIZED — an alliance opened on
  a bare turn-30 gate and never expired, a denouncement was a permanent grudge.

  SHIPS NOW, every term read off the Civilopedia and the wiki's Diplomacy page:
  **one 30-turn clock for every agreement** ("All of them have limited duration
  of 30 turns, after which they have to be renewed"), carried per pair on both
  engines (`friendTurns`/`seat_friend_turns`, `allyTurns`/`seat_ally_turns`,
  the DIRECTED `borderTurns`/`seat_borders_turns`) and compared in the digest.
  The **DECLARATION OF FRIENDSHIP** is a verb of its own, and Declared Friends
  "cannot undertake hostile actions (such as Denouncing or going to war)
  against each other". The **ALLIANCE** now asks what the source asks — the
  Civil Service civic and a Declared Friend — expires with its clock, pays
  GS's "+1 Diplomatic Favor per turn per level" at the level-1 rate, carries
  Open Borders, and signs the **DEFENSIVE PACT** R&F folded into it, so a
  third party's declaration drags the victim's allies in (and never the
  aggressor's). The **DENOUNCEMENT** lasts its 30 turns and no longer forever,
  which also closes the Formal-War casus belli window at [5, 30) — and since
  "You cannot denounce Declared Friends or Allies", nothing breaks an
  agreement any more; the guard replaced the break. **OPEN BORDERS** is a
  directed grant off Early Empire, blocked by a denouncement in either
  direction and cancelled by war, and it means something because the BORDER
  now closes: after its owner takes Early Empire a major's ground refuses
  foreign units unless they are at war, allied, or hold the grant, with the
  page's two exemptions ("Traders ignore borders", "Religious units also
  ignore borders"). An Archaeologist may dig behind a lifted border, which is
  the whole of B-20r's open-borders half. The **GREAT WORK GIFT** is the
  sourced one-sided half of the trade screen ("Click it and you gift your
  items to your rival"), and the work carries its provenance to the receiving
  museum. All five verbs ride the wire and enter the observation's opponent
  block, so a policy can see what its head decides.

  OPEN:
  - **ALLIANCE TYPES AND LEVELS.** R&F broke the alliance into Research,
    Military, Economic, Cultural and Religious, each levelling 1->3 on
    Alliance Points (80, then 160 more). The POINT sources are fully
    published and computable here — 1/turn for the alliance, 0.25 each way
    for a trade route to or from the ally, 0.25 per side for Democracy — but
    the fifteen level effects are fifteen separate channels, several of them
    (shared visibility, suzerain-bonus sharing, a free promotion) needing
    systems this engine does not have.
  - **THE NEGOTIATED TWO-SIDED DEAL.** Gold, resources, cities, favor and
    agreements traded FOR each other. Two things are missing and only one is
    a number: no source publishes the AI's valuation, and the wire has no
    offer/accept protocol — a record is one seat's unilateral intent, so
    every agreement here is offered and accepted in the same act. Peace
    terms (B-22r) wait on this, not on the treaty system.
  - **JOINT WAR, JOIN ONGOING WAR, RESEARCH AGREEMENT and ASK-FOR-PROMISE**,
    each a two-sided deal by construction, so each waits on the row above.
  - **CITY-STATE BORDERS** never close (C-30), so a suzerain's passage lifts
    nothing.
  - The **+25% Open-Borders tourism** is an INTERNATIONAL modifier, applied
    per foreign civilization; blocked on C-28.
  - **25 Grievances per denouncement** (GS); blocked on C-19.
- **C-4. UNIQUE IMPROVEMENTS — the roster holds only the generic set.**
  Weight 3. Gaps: Caguana's Batey, La Venta's Colossal Head and Armagh's
  Monastery (each a whole improvement with its own adjacency, standing in as
  a flat channel today), and the Chemamull-shaped appeal improvements.
- **C-5. STRATEGIC-RESOURCE STOCKPILES — the bank ships; unit FUEL does
  not.** Weight 2. Gathering Storm puts a strategic resource to three uses —
  "unit production, as fuel for unit upkeep, and for Power production for
  your cities" — and the first and third ship here.

  THE BANK. Every tile a seat owns whose strategic resource stands under its
  own unpillaged improvement pays that resource's published number into a
  per-seat bank each turn: Horses, Iron, Niter and Aluminum 2, Coal, Oil and
  Uranium 3, each sourced from its own resource page. The ceiling "is
  initially 50 for each resource", and every Encampment building standing in
  the empire raises it "by 10 per building for all resources"
  (`accrueStockpiles` / `_seat_accrue_stockpile`, `stockpileCap` /
  `_stockpile_cap`).

  WHAT DRAWS ON IT. "Everything using the resource (units, buildings,
  projects, etc.) will draw from this stockpile." A gated unit costs 20 of
  its resource, charged "at the moment you start production (or the moment
  you purchase it)" — so the charge lands where production STARTS and again
  at the gold buy, not at the spawn. The Lagrange Laser Station charges 30
  Aluminum once. A Power Plant converts its own fuel every turn at the
  published rate (Coal 1:4, Oil 1:4, Uranium 1:16), a city asks a plant only
  for what its renewables did not cover, and where two plants reach one city
  the engine takes "the Power Plant which draws the resource of which you
  have a larger stockpile". ACCESS still opens the production column and the
  BANK is what pays for it — on the mask and again in the applier, because a
  mask that offers what the applier refuses is a silent no-op. A unit whose
  seat has LOST access to its resource "won't be able to Heal"
  (`refreshUnits` / `_res_starved`). MUSKETMAN was missing its Niter
  requirement entirely and now carries it.

  Both new facts ride the digest — `stockpile` per seat, `powered` per city.
  Poke lanes: `tests/gpu/power_test.py`,
  `tests/cpu/city/strategic-resources.test.ts`.
  REACHABILITY: the accrual, the ceiling and the unit charge are all in the
  gate's reach — Horseman and Swordsman are Ancient/Classical and the
  scripted seats train both. The plant's fuel burn is not: no lane has yet
  built a Power Plant, so that half is poke-proven only.
  OPEN:
  - **THE SHORTAGE PENALTY.** A seat short of a fuel resource takes a Combat
    Strength penalty "proportional to the amount you're short". The
    consumption it reads is live now — `chargeUnitUpkeep` /
    `_seat_charge_upkeep` bill every fuel chassis in the Industrial-and-later
    roster — so what is missing is only the magnitude, which no source
    publishes.
  - **RESOURCE TRADING.** "You can only trade lump quantities of Consumable
    resources", which is a two-sided deal and has no offer/accept protocol;
    blocked on C-2's negotiated deal.
  - **ZANZIBAR'S TWO EXISTS-NOWHERE-ELSE LUXURIES** — a suzerain bonus whose
    resources are on no tile in the catalog; B-21r.
- **C-6. POLICY-CARD MODIFIERS — two of the 49 cards are inert.** Weight 1.
  Every row in `POLICIES` was read against its own Civilopedia page: the
  description quotes the card, the slot kind is the page's `type`, the
  enabling civic is its `enabled_with` and `obsoleteCivic` its
  `obsolete_with`. Seven rows named something that is not a Gathering Storm
  policy card at all and are gone — a pantheon that `religion.ts` already
  carries, a Dark Age card and a governor title (B-24r), a Golden Age
  dedication this model already runs as `DED_MONUMENTALITY`, a Government
  Plaza building (C-22), an Apostle promotion (C-3), and one card that does
  not exist. What is left inert:
  - `ONLINE_COMMUNITIES` — "+50% Tourism output to civilizations to which you
    have a Trade Route". Blocked on C-28: tourism is one lifetime scalar per
    seat, so there is no per-rival figure to raise.
  - `CONTAINMENT` — "Each Envoy you send to a city-state counts as two, if its
    Suzerain has a different government than you". Blocked on C-29: the
    suzerain is recomputed from the raw envoy store at every read, so a rule
    that reweights envoys BY the current suzerain has no fixed point.
  - `TOTAL_WAR` ships its plunder half and not its pillage half — blocked on
    C-27, where pillaging banks nothing to raise.
- **C-7. TRADING POSTS — a route lays roads and plants nothing.** Weight 2.
  Gaps: Bandar Brunei's suzerain row; the water-route RANGE refuel and the
  per-post gold at repeat destinations (B-31r).
- **C-8. RANDOM DRAWS THE MODEL MAKES DETERMINISTIC.** Weight 2. The class
  was re-censused against the code rather than against this entry, and three
  of the four things it used to name were already drawing: the belief race
  (`_seat_belief_claims` and its TS twin both spend `_next_random` on the
  pantheon, the follower, the founder and the enhancer), theological damage
  (`damageRoll`, the same body melee uses), and the Apostle's three-column
  promotion offer. Vilnius's Inspiration and the Oxford/Bolshoi free research
  ship as draws now. TWO remain, each with what it would cost:
  - **THE GREAT PERSON REPLACEMENT WALKS A QUEUE.** SOURCED: "When a Great
    Person is claimed, the replacement is chosen randomly from those
    available in the current era, or the next if all those from the current
    era have been claimed." `gpOffer` / `GP_FIRST_OF_ERA` answer with the
    first roster position the world era has not passed, which honours the
    "never backwards" half and none of the draw. The blocker is storage:
    `gpNext` is a per-class COUNTER, so WHICH people are still unclaimed is
    not a fact either engine holds — a random pick needs a per-person claimed
    set on both engines and in `shared/statecompare.manifest.json`.
  - **THE CONGRESS SLATE ROTATES BY SESSION.** SOURCED: the real slate is a
    random draw among era-eligible resolutions; `congressSession` /
    `_world_congress` rotate deterministically on the session index instead
    (`seats`' own header says so). It draws from the same era window either
    way, so this is the ORDER of the slate, not its contents. B-22r carries
    the rest of the Congress residuals.
- **C-9. FAITH-PURCHASE CLASSES — faith buys the units the rules name, not
  classes of BUILDING.** Weight 1. Gap: Valletta's suzerain row (City Center
  and Encampment buildings buyable with Faith).
- **C-11. TERRAIN THE WONDER RULES NEED IS UNMODELED.** Weight 2. The
  NARROWED marker in `builtWonders` names each wonder whose real placement
  rule asks for terrain this map generator does not produce, so the modelled
  rule is deliberately narrower than Civ 6's.
- **C-13. RANGED STRIKES DO NOT ENGAGE DISTRICTS OR CITIES.** Weight 2.
  Recorded as a scope-out for both. The rest of the Encampment (`encamp_hp`
  pool, movement block, garrison pool, district strike, training XP) is
  complete, which is what makes the missing arm visible.
- **C-15. A GARRISON DOES NOT BLOCK A CAPTURE.** Weight 2. Real Civ 6 takes a
  city by moving a melee unit ONTO the centre, so a defender there must die
  first. Here the centre falls at 0 HP and CITY-FIRST targeting never makes
  the garrison attackable on its own, so blocking would deadlock — the
  deadlock is the symptom; the missing piece is the move-onto-centre capture
  model, and both halves are open.
- **C-16. THE SPY'S SECOND HALF.** Weight 2. The Spy itself is a system on
  both engines: the capacity ladder, the jump between revealed foreign
  centres, the eleven-row mission catalog with its two heads, the level
  bonus, Gain Sources' per-seat clock, the counterspy post and the capture
  roll. What the source describes and neither engine carries:
  - **THE ESCAPE SEQUENCE.** "If a Spy is discovered, they will need to
    escape from the target city", by Airplane, Boat, Vehicle or Foot — each
    gated on a district, each with its own danger and return time, and a
    survivor reappearing in the CAPITAL. Here a discovered spy simply dies on
    one roll, so the four escape routes, the Aerodrome/Harbor/Commercial Hub
    gates on them, and the Ace Driver promotion that improves them are all
    absent.
  - **CAPTURED SPIES.** "Captured Spies are imprisoned, but not killed", still
    count against the owner's capacity, and can be traded back. That is a
    prisoner store plus a two-sided deal (C-2), and nothing here holds a
    captured unit.
  - **THE SPY PROMOTION POOL.** Fourteen sourced promotions, three offered at
    random per level. The chassis has no promotion class at all — C-32.
  - **LEVELS FROM COUNTER-ESPIONAGE.** A spy also levels by "capturing enemy
    Spies while counterspying"; the counterspy here raises the intruder's
    catch chance and earns nothing for it.
  - **"NO TWO SPIES MAY PERFORM THE SAME MISSION IN THE SAME CITY."** The
    mission mask asks nothing about the other spies standing on the tile.
  - **LISTENING POST** has no effect body: the source's payload is the
    diplomatic VISIBILITY level, which neither engine models. The column is
    offered and resolves to nothing.
  - **FABRICATE SCANDAL** targets a city-state. "Under the vanilla ruleset,
    Spies cannot act in city-states", so the majors-only destination scan is
    faithful for vanilla and this mission is the R&F ruleset's; the minor
    city block carries no district registry to hang it on either.
  - **THE INTELLIGENCE AGENCY'S own success bonus.** Its spy-capacity half
    ships (`seatBuildingSum` / `_seat_building_sum` over `spyCapacity`); the
    source publishes no figure for what it adds to a mission's odds, so
    nothing here adds one.
  - **SABOTAGE PRODUCTION pillages the BUILDINGS**, per the source, not the
    district. `districtPillaged` / `district_pillaged` is the only flag that
    darkens a district's yields here, so that is what the mission sets; a
    per-building pillage flag is the difference.
  - **THE CLOCK AND THE ODDS ARE THIS MODEL'S OWN.** The source says "all
    missions have a uniform, fixed duration of turns" without naming it, and
    the briefing screen's success, capture and travel numbers are on no page.
    `SPY_MISSION_TURNS`, the three travel constants, `SPY_SUCCESS_BASE_PCT`,
    `SPY_SUCCESS_PER_LEVEL_PCT`, `SPY_CAPTURE_PCT` and
    `SPY_COUNTERSPY_CATCH_PCT` are stated model values, chosen so the
    published modifiers (-25% duration, +1 level per success, +2 levels from
    Gain Sources) express something. Everything they feed is sourced.
  REACHABILITY: the scripted driver flies a spy — it jumps whenever the city
  it stands in offers nothing but the counterspy post, and rotates the mission
  pick by (seat + turn) so the catalog is walked rather than one row hammered.
  Whether a 250-turn lane researches Diplomatic Service at all is UNMEASURED,
  so treat the class as poke-proven until the reachability probe says
  otherwise; each mission body has its own section in `tests/gpu/spy_test.py`
  and `tests/cpu/units/spy.test.ts`.
- **C-17. EMBARKED MOVEMENT DOES NOT UPGRADE.** Weight 1. `constants` records
  that the tech upgrades to embarked movement are unmodeled; the flat
  EMBARK_MOVES stands in for every era.
- **C-19. GRIEVANCES AND WARMONGERING — war costs nothing but the war.**
  Weight 2. No seat's standing with anyone moves when it declares, razes or
  conquers. Gaps: the diplomatic consequences of declaring on a city-state
  (`declareWarOnCityState`), the suzerain's reaction, and the 25 Grievances
  GS charges for a denouncement. (The To Arms! casus belli no longer waits
  here: the denouncement it needed ships with its own 30-turn window.)
- **C-20. THE MILITARY ENGINEER BUILDS ONE THING.** Weight 2. Real Civ 6 gives
  it Fort, Airstrip, Missile Silo, Mountain Tunnel, Reinforced Barricade and
  Modernized Trap, plus spending a charge to finish 20% of a Canal, Dam,
  Aqueduct or Flood Barrier. Only the FORT exists here. Three of the four
  districts the charge names now exist, so the charge itself is what is
  missing rather than its targets; the Flood Barrier is a coastal defence that
  waits on C-24, and the Airstrip waits on nothing but this row now that
  aircraft and their bases exist.
- **C-21. GREAT PEOPLE FIRE INSTANTLY; NONE IS PLACED.** Weight 2. A claimed
  Great Person pays its effect at the claim (`recruit`). Real Civ 6 gives many
  of them an ACTIVATED ability used later on a chosen tile. Gaps: the
  appeal-granting Great People (Alvar Aalto, Charles Correa) that B-36r names,
  and every "activate in a city" ability in the roster.
- **C-27. PILLAGING PAYS NO YIELDS.** Weight 2. The PILLAGE verb sets
  `pillaged` on the tile, heals a food-improvement pillager and spends the
  move; nothing is banked by anyone on either engine, and there is no coastal
  raid to bank from either. Real Civ 6 pays the pillager a yield lump keyed to
  what was wrecked. A gap waits on it: `TOTAL_WAR`'s pillage half (C-6).
- **C-28. TOURISM IS ONE LIFETIME SCALAR PER SEAT.** Weight 2. `seat.tourism`
  banks a single figure and the visitor split divides it by the civ count on
  read, so no rule can address the tourism flowing to ONE rival. Real Civ 6
  accrues tourism per foreign civ, which is what its per-civ modifiers key on.
  C-23 is a different thinness in the same plane — nothing REDUCES what is
  banked — and the two are independent. Two gaps wait on this one:
  `ONLINE_COMMUNITIES` (C-6), and the "+25% for Open Borders" international
  modifier (C-2).
- **C-31. THE TWO CHASSIS WITH A SYSTEM BEHIND THEM.** Weight 1. `UNITS`
  holds 73 rows and the ladder runs to the Information era: every land,
  naval, siege, support, air and GDR rung through Modern Armor, the Nuclear
  Submarine, Rocket Artillery, the Jet Bomber and the Giant Death Robot, each
  row's stats taken from its own page. What the standard rulesets still have
  and this roster does not is two chassis that are each a whole system rather
  than a row:
  - **THE NUCLEAR AND THERMONUCLEAR DEVICE.** A one-shot weapon delivered by
    a bomber, a silo or a submarine, with a blast radius, fallout that
    persists on tiles, and a diplomatic reaction. Neither engine has an
    area-effect attack, a fallout tile state, or the Missile Silo the delivery
    needs (C-20).
  - **THE ROCK BAND.** A GS civilian that performs in a foreign city for a
    tourism lump against a level-scaled failure roll. It reads per-rival
    tourism, which is C-28.
  Unit FUEL upkeep and the middle siege rungs left this row: both shipped with
  the roster, and C-5 and B-46r are corrected accordingly.

- **C-32. THE NEW CLASSES HAVE NO PROMOTION TREE.** Weight 2. `PROMO_CLASSES`
  covers the land, naval and religious chassis; the AIR, GIANT DEATH ROBOT and
  SUPPORT classes have no entry, and neither does the SPY. `UNIT_PROMO_CLASS`
  therefore maps every one of those chassis to nothing, `promoOffer` /
  `_promo_offer_mask` open no column for them, and a fighter that wins ten
  sorties stays at level 1 forever. Two rules wait on this one:
  - **SKY AND STARS' golden half** is "+100% Experience for all Air Units"
    beside the Aluminium grant. The grant ships; the XP half has no tree to
    accelerate, and adding one widens `PROMO_COLS`, which is a wire change.
  - **THE SPY PROMOTION POOL** — fourteen sourced rows, three offered at
    random per level (C-16). The random OFFER is also C-8's territory: the
    draw here would have to be a queue.
  The GDR is a special case in the source's own words — it "cannot earn
  experience or Promotions" — so its absence from the tree is FAITHFUL and
  only the air, support and spy classes are the gap.

- **C-34. AIR COMBAT'S SECOND HALF.** Weight 2. The class is a system on both
  engines: bases and their slot counts (a City Center 1, an Aerodrome 2 rising
  to 4 with the Hangar and the Airport, a carrier its hull's own), the training
  gate that reads them, an aircraft that holds no plot, the AIR_STRIKE and
  REBASE heads, the sortie that spends the turn, a carrier that carries what it
  bases, and the scatter-or-die a lost base forces. What the Air combat page
  describes and neither engine carries:
  - **INTERCEPTION.** Fighters "have the special ability to Intercept, which
    allows them to automatically attack incoming aircraft within their
    operational range", and an intercepted strike lands "with a penalty to
    their Combat Strength". That is the whole reason a fighter class exists,
    and there is no reactive attack anywhere in either engine — every roll here
    is initiated by an acting seat.
  - **PATROL.** "All fighter-type airplanes may perform Patrol", deploying to a
    tile inside their Moves range over own or neutral ground and taking a full
    action. A patrolling plane is a standing interceptor, so this waits on the
    row above.
  - **PRIORITY TARGET.** A bomber's ability to reach the SUPPORT unit under a
    stack; "a support unit targeted by either a direct air strike or the
    Priority Target ability sustains 65 damage". Support chassis ride the
    civilian plane here and a strike answers the tile's military occupant
    first, so nothing can single one out.
  - **THE RETALIATION MODEL IS THE SOURCE'S, AND IT LEAVES LAND AA INERT.**
    "The attacking plane doesn't suffer damage in return unless it gets
    Intercepted ... the only exceptions to this rule are ships with the
    Anti-Air Strength stat." Both engines now answer a direct strike only from
    an anti-air HULL. That is faithful — but it means the ANTI_AIR_GUN and the
    MOBILE_SAM defend their tile with their Anti-Air Strength and never damage
    an attacker, because the channel they would damage it through is
    Interception. Their whole offensive value is parked on the first row of
    this entry.
  - **THE NUCLEAR DELIVERY.** Bombers, Jet Bombers, Nuclear Submarines and the
    Missile Silo each deliver a device, and fighters intercept the bomber-borne
    ones. The devices are C-31 and the silo is C-20; the interception half is
    this row.

- **C-33. THE GIANT DEATH ROBOT IS ONLY ITS STATS.** Weight 2. The chassis
  ships with its published cost, maintenance, strengths, range, anti-air value
  and its 1-Uranium charge plus 3-per-turn fuel bill, and it drives Automaton
  Warfare's kill event and free-unit grant. Every ABILITY on its page is
  absent: it moves and fights on Coast and Ocean "as it would on land" (the
  hull/embark rules give it neither); it "cannot earn experience or
  Promotions" (faithful today only because C-32 gives it no tree); it cannot
  form Corps or Armies (no formations exist to refuse); it heals only in
  friendly territory; and it takes -17 Ranged Strength against district
  defenses and naval units. Its four Future-era upgrades — Drone Air Defense,
  Particle Beam Siege Cannon, Enhanced Mobility and Reinforced Armor Plating —
  need a per-unit upgrade state keyed on a FUTURE-era tech, and the era ladder
  stops at Information.
- **C-30. A CITY-STATE CARRIES NO RESEARCH RECORD.** Weight 1. A minor has no
  techs and no civics on either engine, and real Civ 6 minors research like
  anyone else. One gap waits on it today: CIV6 (Movement) closes a territory
  when "a civ (or city-state) develops the Early Empire civic", so a minor's
  ground stays open to everyone and the suzerain's exemption ("in the case of
  a city-state, if they become its Suzerain") lifts a border that was never
  down. For the same reason only a MAJOR's units are bound by the rule.
- **C-29. THERE IS NO RESOLVED SUZERAIN.** Weight 1. `isSuzerain` answers
  from the raw envoy store every time it is asked, and nothing stores the
  answer. Any rule that changes an envoy's WEIGHT depending on who the
  suzerain currently is therefore has no fixed point — the doubling moves the
  suzerain, which moves the doubling. A gap waits on it: `CONTAINMENT` (C-6).
- **C-26. NO CIVILIZATION UNIQUES.** Weight 5. A major seat is a name, a
  colour and a list of city names — `CIV_LEADERS` holds nothing else, and the
  section it lives in says so: "Nothing here is keyed to which seat asks."
  Real Civ 6 gives every civilization an ability of its own, its leader an
  ability and an agenda, a unique unit, and a unique piece of infrastructure
  (a building, a district or an improvement); none of the five exists on
  either engine, and `aggression` / `warmonger` are this model's own tuning
  rather than any published agenda. Gaps waiting on it: the Impi and the
  Hypaspist, which raise a Flanking or Support stack above +2 for their owner
  (B-54r); the Gauls' OPPIDUM, which is a third defensible district and so a
  third place those bonuses are withheld; Ambiorix's leader ability, which
  pays +2 Combat Strength per adjacent military unit and unlike Flanking and
  Support applies to ranged attacks too, and Saladin's, which doubles both
  bonuses outright; and the Nihang, the one unit that keeps a Combat Strength
  bonus of its own while embarked, where every other unit normalizes.
- **C-25. NO STEALTH (INVISIBLE) UNITS.** Weight 2. Nothing on either engine
  can be invisible: `unitsAt` / `military_at` answer the same question for
  every observer, and no unit carries a stealth flag because none of the units
  that would is in the roster. Civ 6's complete list is the NAVAL RAIDER class
  (Privateer, Sea Dog, Barbary Corsair, Submarine, U-Boat, Nuclear Submarine)
  — of which this roster has none, its whole navy being the GALLEY and the
  QUADRIREME — plus a Warrior Monk with Twilight Veil, a Recon unit with
  Camouflage and a Soothsayer with Inquisitor, three units that are absent —
  and Camouflage is one of B-56r's inert rows for the same reason. Gaps waiting on it: the siege rule "stealth units
  cannot besiege a city", which `encircled` / `_seat_city_fire_and_heal` count
  every hostile military unit toward; the hidden-while-adjacent-to-a-district
  clause and the reveal-for-one-turn-after-attacking clause, which need a
  visibility axis `isExplored` does not have; and the Reveal Stealth ability
  that Scouts and Destroyers carry.
- **C-24. NO CO2, NO CLIMATE.** Weight 3. Gathering Storm's whole climate
  arc is absent: neither engine tracks CO2 emitted per seat, the world
  temperature bands, ice melt, rising sea level or the flooding of coastal
  tiles it causes. Floods and storms fire from `disaster` / `_disasters` on
  a fixed per-turn draw, so severity never escalates with a warming world.
  Gaps waiting on it: the pollution half of the diplomatic-favor penalty
  (B-22r), the Global Energy Treaty resolution, and the three Power Plants'
  emissions (C-1) — which is the whole reason a seat would ever trade a
  Coal plant for a Nuclear one.
- **C-23. NOTHING DIMINISHES TOURISM.** Weight 1. Real Civ 6 reduces the
  tourism a civ earns from Relics and Holy Cities once other civs research
  The Enlightenment, and reduces Great Work tourism the same way through the
  era ladder. `seatTourism` / `_tourism_of` pay a flat value from every
  source, so no rival's research ever costs a tourist. Cristo Redentor's
  second clause exists to CANCEL that reduction, so the wonder cannot pay it
  until the reduction exists.
- **C-22. THE DISTRICT ROSTER.** Weight 2. All eighteen of Civ 6's districts
  now exist. The six that arrived last — DAM, CANAL, WATER PARK, PRESERVE,
  GOVERNMENT PLAZA, DIPLOMATIC QUARTER — brought their placement geometry and
  their effects with them, and every one of those effects is a CATALOG COLUMN
  both engines read by index rather than a type name in a rule body:
  `appealAdjacent`, `maintenance`, `amenities`, `housing`, `loyalty`,
  `governorTitle`, `envoysNextToCenter`, `oneCivWide`, `exclusiveDistricts`,
  `appealHousing`, `floodShield`, `cultureBombUnowned` and `spyLevelPenalty`,
  with `govTier`, `spyCapacity`, `influencePerTurn`, `favorPerTurn`,
  `govTitle`, `loyaltyWithoutGovernor`, `powerSupply`, `regionalRange` and
  `appealYields` on the sixteen buildings they carry.
  The placement clauses are `riverSideCount` + `riverReach` for the Dam's
  floodplain, two river sides and one-per-river; `canalPassageOk` /
  `_canal_plot` for the Canal's entry-and-exit no sharper than a 60-degree
  bend; `exclusiveDistricts` for the Water Park against the Entertainment
  Complex, either way round; `notAdjacentToCityCenter` for the Preserve; and
  `oneCivWide` for the Plaza and the Quarter, which scans every city the SEAT
  holds rather than this one.
  REACHABILITY, measured not assumed: the PRESERVE is placed on all 12 seeds
  from t27 and the GOVERNMENT PLAZA on all 12 from t43, so their housing,
  appeal, loyalty, governor-title and culture-bomb bodies ride the digest for
  most of a driven game; the DIPLOMATIC QUARTER reaches 8 seeds, the DAM 4 and
  the WATER PARK 3. The CANAL is reached by NONE — it unlocks at STEAM_POWER
  and then wants a specific two-sided water geometry — so `canalPassageOk` /
  `_canal_plot` are poke-proven only, and the same holds for the Hydroelectric
  Dam and every Water Park building past the Ferris Wheel.
  What is still open:
  - **THE CANAL CARRIES NO NAVAL PASSAGE.** It is placed, it pays its appeal
    and it costs nothing to keep, but no hull moves through it: `wpass` doubles
    as "is this tile water" across the embark, coastal-city and coastal-water
    tests, so making a canal tile passable to ships would make it water for a
    dozen predicates that mean something else. The passage wants its own
    plane, not a bit borrowed from the water one.
  - **SIX GOVERNMENT PLAZA BUILDINGS PAY ONLY THEIR GOVERNOR TITLE.** The
    Ancestral Hall's Builder in every new city, the Warlord's Throne's
    post-conquest production, the Grand Master's Chapel's faith purchase of
    land units, the National History Museum's Great Work slots, the Royal
    Society's charge-into-production and the War Department's combat bonus
    each need a channel this model does not have. The Audience Chamber's
    "-2 Loyalty in Cities without Governors" ships; its governor-CONDITIONAL
    amenities and housing do not, because the governor pick is decided from
    loyalty, which reads the amenity tier — a circle that needs the pick
    hoisted before the city walk to break.
  - **THE PRESERVE'S HOUSING TABLE IS THIS MODEL'S OWN.** CIV6 publishes only
    "Grants up to 3 Housing based on tile's Appeal" and, on the strategy half,
    that a low-appeal region "will rarely gain more than 1 Housing from it".
    `PRESERVE_APPEAL_HOUSING` / `preserveHousing` states the published ceiling
    at Breathtaking, about one at Average and nothing below Uninviting, and
    both engines read it off the wire. No source can close it.
  - **THE DAM'S AND CANAL'S "+1 Amenity with Water Works"** is a Liang
    governor TITLE, not a building, and governor promotions do not exist
    (B-24r). Neither district pays an amenity here.
  - **THE CONSULATE'S "or cities with Encampments" half.** Its flat
    influence-per-turn ships; the clause that widens it reads a district count
    the influence body never asks for.
  - **THE INTELLIGENCE AGENCY'S "+1 Spy"** is a free UNIT at completion, the
    same shape as every other free-unit grant (C-21); only its capacity half
    ships.

## Reachability — what the green gate does NOT prove

A green serve run proves the two engines agree over the regime the scripted
seeds actually enter. MEASURED, 12 seeds x 250 turns driven
(`tools/gpu/reachability_probe.py`) — these are counts, not estimates. Every
row is re-measured whenever the DRIVEN policy changes, because a new decision
steers the games into a different regime and carries the older rows with it:

| mechanic | seeds reaching | first |
|---|---|---|
| a PLOT LOCK held by a citizen | 12/12 | t2 |
| a PRESERVE placed | 12/12 | t27 |
| a GOVERNMENT PLAZA placed | 12/12 | t43 |
| faith-buy kind 6 (APOSTLE purchase) | 12/12 | t75 |
| a WORLD CONGRESS ballot on the wire | 12/12 | t89 |
| a SPECIALIST pinned into a slot | 12/12 | t110 |
| an OPEN BORDERS grant standing | 11/12 | t34 |
| a second HULL on any seat | 10/12 | t103 |
| NATURAL_HISTORY (the Archaeologist's civic) | 10/12 | t170 |
| a DECLARATION OF FRIENDSHIP | 8/12 | t19 |
| an ALLIANCE | 8/12 | t105 |
| a DIPLOMATIC QUARTER placed | 8/12 | t98 |
| an INTERNATIONAL trade leg | 7/12 | t94 |
| CONSERVATION (the Naturalist's civic) | 6/12 | t183 |
| two enemy religious units ADJACENT (theological combat's precondition) | 5/12 | t86 |
| a DAM placed | 4/12 | t162 |
| URBANIZATION civic | 3/12 | t226 |
| a WATER PARK placed | 3/12 | t238 |
| WAR with a city-state | 2/12 | t143 |
| a NEIGHBORHOOD placed | 2/12 | t228 |
| PEACE with a city-state, through the sue column | 1/12 | t159 |
| an antiquity dig (artifact in a slot) | 0/12 | NEVER |
| a CANAL placed | 0/12 | NEVER |
| a unit standing against a CLOSED BORDER | 0/12 | NEVER |
| a GREAT WORK given away | 0/12 | NEVER |
| an ally dragged in by the DEFENSIVE PACT | 0/12 | NEVER |

- THE TABLE MOVED WHOLESALE when the district lane started ROTATING its pick.
  The scripted driver took the first legal district column, so a column
  appended to the scaffold was only ever reached once everything before it was
  built or barred; it now rotates by (seat + turn), which is a DECISION the
  applier re-validates and TS only replays, so it changes coverage without
  changing what is legal. Every row moved with it — a second hull went from
  six seeds to ten, NATURAL_HISTORY from five to ten, CONSERVATION from three
  to six — and one moved the wrong way: the ANTIQUITY DIG was reached on one
  seed at t229 and is now reached on none, because the seed that dug spends
  those turns elsewhere. That is a coverage LOSS, not a regression in a rule:
  the dig's bodies are poked in `parks_test` and `tests/cpu/units/`, and
  nothing in the gate covered them before t229 either.
- THEOLOGICAL COMBAT IS REACHED, in 5 of 12 seeds from t86, so the
  resolver's deterministic damage and its apostle-only initiation ARE
  gate-covered.
- The APOSTLE BUY fires in every seed from t75 and the 250-turn gate is
  green, which is what closed B-18r's predicted lifecycle drift.
- THE CITIZEN OVERRIDES are the widest-reaching heads in the gate: a plot
  lock stands on every seed from t2 (144 plots at t250) and a pinned
  specialist on every seed from t110 (52 slots), so both ride the digest for
  most of a game rather than leaning on `citizens_test`.
- WAR WITH A CITY-STATE stands on 2 of 12 seeds from t143 and closes through
  the SUE column on 1 of them from t159 — 9.8 minor-war turns per seed,
  108 on the loudest. The declare, the peace and both clocks are gate-covered;
  the meeting gate, the treaty term and the suzerain refusal are not, and
  `cs_war_test` section d is their bar.
- THE DIPLOMATIC AXIS ENTERED THE GATE, and the probe had never measured it:
  `geo_decide_and_apply` is the serve gate's own call and the probe did not
  make it, so every table above this round was read off a driven game with no
  denouncement in it. Adding the call costs nothing by itself — with the
  diplomatic style off, every row reproduces the old table exactly, which is
  also the proof that the treaty system, the reworked alliance and the closed
  border change no reachability of their own.
- THREE MECHANICS THE ENGINE OFFERS AND THESE GAMES NEVER PRESENT, each
  poke-covered and none of them evidence of a bug:
  - A CLOSED BORDER is never STOOD AGAINST. No major's unit is ever adjacent
    to a foreign major's closed ground in 12 seeds x 250 turns, so the rule
    never refuses a step in-gate; `geopolitics_test` poke i3 is its whole
    bar. The three seats simply never crowd each other's territory.
  - A GREAT WORK is never GIVEN, because there is almost nothing to give:
    4 works exist across all 12 seeds at t250 against 21 slot buildings. The
    gift is blocked by the great-person queue's output, not by its own gate
    (poke i2). At an all-diplomat table it does fire, on 2 of 12 seeds.
  - THE DEFENSIVE PACT never drags anyone in. Alliances stand on 8 of 12
    seeds, but a third party has to declare on an ally while the alliance
    runs, and the same style that forms alliances is the one that does not
    fight. Poke i is the bar.
- THE DRIVER RUNS TWO RESEARCH STYLES, and that is why the bottom of this
  table exists at all. Cheapest-first is BREADTH first: it finishes the most
  items and so parks every seat in the shallow end of both trees. A share of
  seats (`ladder.DEEP_SHARE`, drawn once per game seed and seat) instead take
  the most advanced legal item every time, and beeline. One gate run now holds
  both regimes, and the seats inside a game are ASYMMETRIC, which the digest
  compares for free. MEASURED alternative, rejected: per-decision epsilon
  noise on the same pick reached nothing new and cost two seeds their
  city-state war — the late catalog is gated on research DEPTH within 250
  turns, and random detours only add drag.
- WONDERS FINISH, and the belief that they do not was load-bearing: 52
  completed across 11 of 12 seeds. The `wonder_effects` lane was labelled as
  the only proof of the fourteen effect channels "because the gate never
  finishes a wonder" — false, and the probe could not have said so until it
  counted them. What is actually unreached is the subset of channels no
  FINISHED wonder in these games happens to carry.
- MEASURED AND REJECTED, a wonder-first production style: it moved wonders
  52 -> 62 (already covered) and cost the antiquity DIG its only seed plus a
  seed each of NATURAL_HISTORY and theological adjacency. The share sweep
  says the same thing from the other end — all-deep reaches NATURAL_HISTORY
  12/12 but drops `specPin` to 9/12, the international leg to 8/12 and the
  slotted cards to 14/49. COVERAGE COMES FROM THE MIXTURE OF STYLES, not from
  any one of them turned up; `DEEP_SHARE` 0.34 is that reading.
- THE SECOND STYLE IS DIPLOMATIC (`ladder.DIPLO_SHARE`), and its whole shape
  was decided by measurement:
  - IT MUST BE EXCLUSIVE WITH THE GRUDGE. A diplomat that also denounces
    reaches friendship on 1 seed and an alliance on none — a denouncement
    blocks friendship in BOTH directions for its full term, renews the moment
    it lapses, and the grievance it earns blocks friendship with every other
    seat as well. Giving the two verbs DISJOINT targets (denounce the weaker,
    court the stronger) reproduced that result exactly, because the stronger
    seat denounces back down the same pair. Two refutations, one conclusion:
    the styles are held apart per SEAT or not at all.
  - THE SHARE IS 0.5. At 0.34 the alliance and open-borders rows each come in
    a seed lower for identical cost everywhere else, and at 1.0 the war
    regime is gone outright — no city-state war in any seed, a minor-war mean
    of 0.0 — which is the collapse the knob exists to avoid.
  - WHAT IT COSTS, stated plainly: the international leg 11 -> 7, theological
    adjacency 10 -> 6, a second hull 8 -> 6, city-state war 4 -> 2 and its
    peace 3 -> 1. Nothing reaches NEVER and war survives at 9.5 turns a seed.
    The trade is three mechanics that were NEVER for five rows that thinned,
    and it is a TRAJECTORY effect, not a mechanism: the costs are identical
    at 0.34, 0.5 and 1.0 while the gains keep climbing, so what moves the
    table is that the games diverge at all.
- **OPEN — THE DRIVER NEEDS A REAL STYLE MECHANISM.** Not weighted here on
  purpose: this section's table prices FIDELITY gaps, and this is harness.
  Today a style is one boolean, `DEEP_SHARE`, drawn per (game seed, seat) off
  the policy stream and read at a single `if` inside `pick_research`. That
  does not extend. Adding a second style meant a rank refactor of
  `pick_production`'s class loop — a body whose docstring warns that the
  settler latch and the army composition carry state ACROSS cities — and the
  style it served was then rejected on measurement, so the refactor was
  reverted with it. The next style will pay that cost again. What it should
  be instead:
  - NAMED KNOBS with documented ranges and defaults, each one thing a
    scripted player can lean on: research depth vs breadth, production tier
    order, war appetite, expansion appetite, faith/culture lean, naval lean.
    A knob at its default must reproduce today's picks exactly.
  - PRESETS built from those knobs — broad, deep, militarist, expansionist —
    named, versioned, and assignable per actor, so a preset is a data row
    rather than an edit to a picker body.
  - AN ASSIGNMENT POLICY that is either a share-based draw off the existing
    per-(seed, seat) stream or an explicit table, so a hunt can pin exactly
    which actor played which preset and reproduce it.
  - CLI SELECTION on the probe and the gate, so a sweep needs no source edit
    (`--deep-share` is the one-off stand-in for this).
  - The bar is the probe diff, and the rule the sweep already established:
    a preset earns its place by ADDING rows without losing any, and the
    mixture is what covers, not any single preset turned up.
- URBANIZATION, a NEIGHBORHOOD and an antiquity DIG are each reached by ONE
  seed, in the last twenty turns. They are gate-covered in the narrowest
  sense; the poke lanes still carry them.
- A SECOND HULL reaches 8 of 12 seeds from t103.
- THE POLICY CARDS THEMSELVES ARE MOSTLY UNREACHED. The greedy fill puts 16
  of the 49 cards in a slot across the whole run — URBAN_PLANNING, GOD_KING,
  LAND_SURVEYORS, NATURAL_PHILOSOPHY, SCRIPTURE, DISCIPLINE, CHIVALRY,
  VETERANCY, DIPLOMATIC_LEAGUE, plus BASTIONS, CONSCRIPTION, FEUDAL_CONTRACT,
  INSULAE, LEVEE_EN_MASSE, SURVEY and TOWN_CHARTERS on the deep seats — at
  most six at once. The fill takes TABLE order within a slot kind, so a late
  card is reachable only once the earlier ones RETIRE. THIRTEEN effect channels
  ride the digest (`cityYields`, `capitalYields`, `adjacencyMult`,
  `tilePurchaseMult`, `encampHarborProdMult`, `prodBoost`,
  `combatVsBarbarians`, `firstEnvoyDouble`, and — only on the deep seats —
  `cityDefense`, `cityRanged`, `reconXpMult`, `unitMaintenanceCut`,
  `housingIfDistricts`); the other nine — `buildingYieldBoost`,
  `builderCharges`, `routePlunderMult`, `routeGold`, `influencePerTurn`,
  `culturePerSuzerain`, `gpp`, `amenitiesIfSpecialty` and `newDeal` — are
  proved by `policy_cards_test` and the TS `policy-cards` suite alone.
- THE DIG AND THE NATIONAL PARK CAME INTO REACH with the deep style:
  NATURAL_HISTORY on 5 seeds from t153 and CONSERVATION on 3 from t169,
  where both were NEVER. One seed carries a dig through to an artifact in a
  slot. The horizon that hid them was the research ladder's, not the
  engine's — see B-20r.
  (The finer question this section used to ask — a dig by a seat whose ERA
  differs from row 0's — is doubly moot: eras are global 50-turn blocks
  per B-24r, so no two seats can be in different eras by construction.)
- The CULTURE VICTORY's distance, re-measured: at t250 visiting peaks at 5
  (mean ~0.7 per seat) against a domestic peak of 78 (mean ~39) — a ~55x gap
  on means. B-20r's scope should be read off this, not any older number.
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
