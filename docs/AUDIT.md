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
| A-1r `adjacencyMult` / `buildingYieldMult` unread on the GPU | 2 | eleven policy cards double a district's adjacency or its buildings' yields; TS applies both, the GPU has no reader |
| **A. Engine vs engine** | **2** | |
| B-20r tourism tails | 2 | theming ships; open-borders digs and work TRADES need a treaty system, and the Naturalist's progressive cost is unsourced |
| B-21r suzerain rows | 1 | the residual descoped rows all need whole absent systems |
| B-22r World Congress | 2 | 13 of the 21 regular resolutions ship and emergencies run as special sessions; eight resolutions and the scored competitions have no carrier; peace terms wait on C-2 and two favor penalties on C-19/C-24; the favor tie-break unmodeled |
| B-24r Ages/governors | 1 | three system-less dedication entries, dark-age policies, governor promotions, per-civ era drift |
| B-30r specialists | 1 | the mechanic and both citizen overrides ship; the Theater tier's second building and the plant split wait upstream |
| B-31r trade-route tails | 1 | sea legs and the whole-destination-set candidate ship; no trading posts, plunder gold is a stylization, the summed-yield key is a heuristic and the free-choice head is P8's |
| B-53r the great-person queue | 1 | 205 sourced people, the era gate and the scaled price ship; the offer is re-derived each turn rather than frozen, and the payout is one era-sized lump instead of the person's own ability |
| B-D unsourced data values | 2 | the Monument, the Lighthouse and the Engineer's Armory shipped and one bullet was false; the governments are half-shipped, and the rest are shape differences or model tuning that no source can close |
| B-36r appeal adjacency terms | 1 | the four reachable terms ship; Dam/Canal/Water Park/Preserve and the Great People wait on C-22, C-4, C-21 |
| B-39r wonder effects still dropped | 1 | the sourced sweep shipped fourteen channels; five residuals, each blocked on B-20r, C-21, B-34r or C-23 |
| B-45r sourced-sweep finds in the other rows | 1 | three of the eight now have a channel; the five that do not need free units (C-21), faith-bought Great People (C-9), a rival-recruit event, or B-31r's route yields |
| B-46r the siege class's tails | 1 | the Bombard stat, both support chassis, all four walls tiers and the move-and-shoot rule ship; the middle siege rungs and Akkad's suzerain bonus do not |
| B-54r flanking and support vs their own page | 1 | six rules the two engines agree on and the page does not: the Military Tradition gate, the flanking owner and river rules, support against ranged, embarked providers, and defensible districts |
| B-55r a ship cannot carry a passenger | 1 | one MILITARY unit per tile, where Civ 6 stacks an embarked land unit with a naval one — which is where Support's 7th through 10th stacks live |
| B-50r theological combat's other terms | 1 | flanking/support, the territory bonuses, the winner's advance and Holy Site healing ship; the Inquisitor is C-14's, the promotions C-3's, and who PROVIDES flanking is this engine's own reading |
| B-51r the Encampment's second pool | 1 | the district meets the city's perimeter and heals only while its tile is clear; Civ 6 tracks the two pools SEPARATELY, and a defeat pillages it |
| B-44r city-state war tails | 1 | the head, its policy and a SEAT's march on a minor ship; the barbarian walker still raids only majors because it beelines to one nearest city, and the diplomatic consequences wait on C-19 |
| B-34r flood tails | 1 | the severity ladder and the river's whole reach ship; the Great Bath's mitigation is still seat-scoped rather than river-scoped, and the Dam is not in the district roster |
| **B. Fidelity vs real Civ 6** | **21** | |
| C-1 POWER | 5 | no plants, no grid, no powered-yield term — 4 gaps wait on it |
| C-2 diplomatic agreements | 6 | war and peace and nothing between: open borders, work trades, alliances, denouncements |
| C-3 unit promotions | 5 | only MARTYR reaches a rule; choosing one is also a wire head, and Amphibious waives two penalties that now ship |
| C-4 unique improvements | 3 | Batey / Colossal Head / Monastery, each a flat channel today |
| C-5 strategic-resource stockpiles | 4 | resources gate, they never accumulate or get spent |
| C-6 policy-card modifiers | 5 | ~38 adoptable cards are inert one-liners |
| C-7 trading posts | 2 | a route lays roads and plants nothing |
| C-8 draws made deterministic | 2 | inspirations, the religion pick, Oxford's and the Bolshoi's free research |
| C-9 faith-purchase classes | 1 | faith buys named units, never a class of building |
| C-10 non-GS city-state rows | 1 | Antioch/Amsterdam were replaced in GS; no line can be quoted |
| C-11 terrain the wonder rules need | 2 | the NARROWED placements are deliberately narrower than Civ 6's |
| C-12 the Film Studio is absent | 1 | the Theater tier's other top building, so its specialist upgrade has one path |
| C-13 ranged vs districts/cities | 2 | a scope-out on both, with the rest of the Encampment complete |
| C-14 no Inquisitor | 1 | "only Apostles initiate" is a roster gap, not a rule; there is no CONDEMN verb either, and a resolution waits on it |
| C-15 garrison does not block capture | 2 | the move-onto-centre capture model is what is missing |
| C-16 spies / air units / GDRs | 4 | whole unit classes, and four dedications wait on them |
| C-17 embarked movement never upgrades | 1 | the flat EMBARK_MOVES stands in for every era |
| C-18 artifact civilization is the acting seat | 1 | real Civ 6 attributes the find to the event's own civ |
| C-19 grievances and warmongering | 2 | war has no reputational consequence with anyone |
| C-20 the Military Engineer's build list | 2 | five buildables and the finish-a-district charge |
| C-21 Great Person ACTIVATED abilities | 2 | every GP fires instantly; none is placed and used |
| C-22 the district roster is a subset | 3 | no Dam, Canal, Water Park, Preserve, Aerodrome, Government Plaza or Diplomatic Quarter |
| C-23 nothing diminishes tourism | 1 | no rival's Enlightenment ever costs a tourist, so Cristo Redentor's cancelling clause has nothing to cancel |
| C-24 no CO2, no climate | 3 | GS's whole climate arc — emissions, warming bands, sea level, escalating disasters — and 2 gaps wait on it |
| C-26 no civilization uniques | 5 | seats are a name, a colour and a city list: no civ ability, no leader ability or agenda, no unique unit, no unique infrastructure |
| C-25 no stealth (invisible) units | 2 | the whole naval-raider class is absent and nothing on either engine can be invisible |
| **C. Absent systems** | **68** | |
| **OPEN, TOTAL** | **91** | |

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
gate does not reach — "Reachability" below is where that boundary runs, and
the one entry here was found by READING the exporter against its readers,
not by any red.

- **A-1r. The GPU never reads `adjacencyMult` or `buildingYieldMult`.**
  Eleven policy cards double a district's adjacency or its buildings' yields
  — `NATURAL_PHILOSOPHY` and `RATIONALISM` on the Campus, `SCRIPTURE` and
  `SIMULTANEUM` on the Holy Site, `TOWN_CHARTERS` / `FREE_MARKETS` on the
  Commercial Hub, `NAVAL_INFRASTRUCTURE` on the Harbor, `CRAFTSMEN` and
  `FIVE_YEAR_PLAN` on the Industrial Zone, `AESTHETICS` and `GRAND_OPERA` on
  the Theater Square. `buildRules` exports both arrays per government and per
  policy row; TS reads them in `effectiveAdjacency` and `cityBuildingYields`
  through `getModifiers`. The GPU has NO reader at all — `_gov_policy_mods`
  returns ten channels and neither of these is among them, so a seat that
  slots one of those cards banks a different yield on the two engines.
  REACHABILITY: the 250-turn gate is green, so no driven seat reaches a
  slotted card of these eleven in it; the class is real and unreached, which
  is exactly the shape a digest cannot find for you.

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
    promotion, B-24r), Military Advisory (a promotion-class axis, C-3),
    Global Energy Treaty (POWER-consuming buildings, C-1, and the
    climate arc, C-24), Public Relations (grievances, C-19), Luxury
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
      published; B's VERB is not — neither engine has a condemn action,
      which belongs to the Inquisitor/Apostle interaction (C-14).
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
    same deal — and no source publishes the valuation, so the blocker is
    the deal system itself (C-2), not a missing number.
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
  Residuals: the three entries needing spies / air units / GDRs (Bodyguard of
  Lies, Sky and Stars, Automaton Warfare — both faces), To Arms!'s special
  Casus Belli (no denouncements),
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
  OPEN:
  - **The Great Bath's mitigation is seat-scoped, not river-scoped.** The
    source says a Dam or Great Bath "along a River will mitigate floods
    THERE"; here any complete Great Bath protects every floodplain its seat
    holds. `river_comp` is now the table that would key it, so what is left is
    deciding which river a wonder stands on and gating the mitigation on it.
  - **The Great Bath's "+1 Faith for every time a tile belonging to this city
    has been Flooded"** needs a per-tile flood COUNT that nothing stores.
  - **The DAM is not in the district roster** (C-22), so the other half of the
    published mitigation has nowhere to live.
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
  OPEN, each blocked: the DAM, CANAL, WATER PARK and PRESERVE terms (C-22 —
  no such district here), the unique-improvement terms (C-4), and the
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
  - **THE EXPERT CREW PROMOTION** is the rule's other half — a siege unit that
    has earned it "may move and shoot in the same turn" at any Movement.
    Blocked on C-3.
  - **THE MIDDLE AND LATE SIEGE RUNGS.** Trebuchet, Artillery and Rocket
    Artillery are absent, so the class has a Classical rung and a Renaissance
    one and nothing after Metal Casting. The Observation Balloon that lets a
    siege unit outrange a city's defenses is absent too.
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
    raise a stack above +2 for their owner only. The unique units are C-26's,
    the promotions are C-3's, and the two Great Person identities are B-53r's.
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
- **B-50r. Theological combat's other terms.** Four of the six ship.
  `theologicalCombatPhase` / `_theological_combat_phase` now add FLANKING to
  the attacker and SUPPORT to the defender off the same `flankCount` /
  `supportCount` the physical roll uses; `theoDefenseStrength` /
  `_theo_def_strength` add the page's DEFENDING-ONLY location bonuses (+5 in
  the territory of a city following the defender's religion, +15 on top in
  that religion's Holy City, plus a defensive improvement — a FORT — and
  nothing at all from physical terrain); the winner ADVANCES into the fallen
  unit's tile when it survived and the tile is free; and `religiousHeal` /
  `_religious_heal` heal a religious unit only on or beside a Holy Site in its
  OWN territory, at `RELIGIOUS_HEAL_PER_FAITH` times that site's own faith
  (its adjacency plus its buildings), a pillaged one paying nothing. Two
  embarked units cannot fight each other. REACHABILITY: neither driven nor
  scripted — `tests/cpu/religion/theological-combat.test.ts` and
  `tests/gpu/religion2_test.py` pokes 11 and 12 are the only proof.
  OPEN:
  - **THE INQUISITOR** as a second attacker and a defensive specialist is a
    roster gap (C-14), and the promotions that modify the roll are C-3's.
  - **WHO PROVIDES FLANKING AND SUPPORT is this engine's own answer.** The
    page says only that flanking and support apply; it does not say whether a
    RELIGIOUS unit counts as a flanker for a physical battle, or whether a
    military unit flanks a theological one. Both engines take the physical
    predicate unchanged — any adjacent unit of a hostile/friendly seat — which
    is a reading, not a quotation, and the two engines agree on it only
    because they share the body.
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
  with a live effect. What is LEFT is each labelled at its definition, and
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
    Democracy's GS row wants ALLIANCES (C-2); Autocracy's other half wants
    a Government Plaza (C-22). Every legacy bonus is out of scope by
    construction — R&F phased them out.
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
  Arms!'s casus belli needs (`seats` dedication header); and the terms a
  PEACE DEAL carries, which real Civ 6 brokers on the trade screen (B-22r).
- **C-3. UNIT PROMOTIONS — no promotion tree.** Weight 5. The only promotion
  that reaches a rule is MARTYR, drawn at the death. Gaps: Yerevan's suzerain
  row (choose an Apostle promotion instead of drawing it — and choosing is a
  DECISION with no wire record, so it needs a head too); every promotion-
  shaped policy card in `policies`; veterancy beyond the flat XP levels; and
  AMPHIBIOUS, which "negates the defender's river defense bonus and doesn't
  suffer the amphibious attack penalty when it attacks" — both of those
  penalties now ship, so the waiver has something real to waive.
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
  classes with no roster entry. Gaps: three dedication catalog entries (Sky
  and Stars, Bodyguard of Lies, Automaton Warfare) and the Great Work Heist
  that C-2 also names. Wish You Were Here left this list: it needs neither
  spies nor air units, and both its faces ship.
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
  Camouflage and a Soothsayer with Inquisitor, three units that are absent AND
  promotion-gated (C-3). Gaps waiting on it: the siege rule "stealth units
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
  (B-22r), and the Global Energy Treaty resolution, which is jointly
  blocked on POWER (C-1).
- **C-23. NOTHING DIMINISHES TOURISM.** Weight 1. Real Civ 6 reduces the
  tourism a civ earns from Relics and Holy Cities once other civs research
  The Enlightenment, and reduces Great Work tourism the same way through the
  era ladder. `seatTourism` / `_tourism_of` pay a flat value from every
  source, so no rival's research ever costs a tourist. Cristo Redentor's
  second clause exists to CANCEL that reduction, so the wonder cannot pay it
  until the reduction exists.
- **C-22. THE DISTRICT ROSTER IS A SUBSET.** Weight 3. Twelve of Civ 6's
  districts exist; the DAM, CANAL, WATER PARK, PRESERVE, AERODROME, GOVERNMENT
  PLAZA and DIPLOMATIC QUARTER do not. Gaps: their appeal terms (B-36r), the
  Military Engineer's finish-a-district charge (C-20), the Dam's half of the
  flood mitigation that B-34r names, and the Preserve's housing table.

## Reachability — what the green gate does NOT prove

A green serve run proves the two engines agree over the regime the scripted
seeds actually enter. MEASURED, 12 seeds x 250 turns driven
(`tools/gpu/reachability_probe.py`) — these are counts, not estimates. Every
row is re-measured whenever the DRIVEN policy changes, because a new decision
steers the games into a different regime and carries the older rows with it:

| mechanic | seeds reaching | first |
|---|---|---|
| faith-buy kind 6 (APOSTLE purchase) | 12/12 | t78 |
| a PLOT LOCK held by a citizen | 12/12 | t2 |
| a WORLD CONGRESS ballot on the wire | 12/12 | t119 |
| a SPECIALIST pinned into a slot | 11/12 | t114 |
| a second HULL on any seat | 9/12 | t123 |
| two enemy religious units ADJACENT (theological combat's precondition) | 4/12 | t107 |
| WAR with a city-state | 4/12 | t127 |
| PEACE with a city-state, through the sue column | 4/12 | t145 |
| an INTERNATIONAL trade leg | 1/12 | t241 |
| URBANIZATION civic | 0/12 | never |
| a NEIGHBORHOOD placed | 0/12 | never |
| an antiquity dig (artifact in a slot) | 0/12 | never |
| NATURAL_HISTORY (the Archaeologist's civic) | 0/12 | never |
| CONSERVATION (the Naturalist's civic) | 0/12 | never |

- THEOLOGICAL COMBAT IS REACHED, in 4 of 12 seeds from t107. The old
  claim here — "a gate that never puts two apostles side by side proves
  nothing about it" — was wrong: the gate does, so the resolver's
  deterministic damage and its apostle-only initiation ARE gate-covered.
- The APOSTLE BUY fires in every seed from t78 and the 250-turn gate is
  green, which is what closed B-18r's predicted lifecycle drift.
- THE CITIZEN OVERRIDES are the widest-reaching heads in the gate: a plot
  lock stands on every seed from t2 (138 plots at t250) and a pinned
  specialist on 11 of 12 from t114 (36 slots), so both ride the digest for
  most of a game rather than leaning on `citizens_test`.
- WAR WITH A CITY-STATE stands on 4 of 12 seeds from t127 and closes through
  the SUE column on the same 4 from t145 — 6.5 minor-war turns per seed,
  30 on the loudest. The declare, the peace and both clocks are gate-covered;
  the meeting gate, the treaty term and the suzerain refusal are not, and
  `cs_war_test` section d is their bar.
- URBANIZATION and a NEIGHBORHOOD dropped back OUT of the gate — they stood
  in one seed at t242/t243 before the citizen and Congress heads changed the
  late-game trajectory, and now no seed reaches either. The poke lane is
  their only proof again. An INTERNATIONAL leg moved the other way, from
  NEVER to one seed at t241.
- A SECOND HULL reaches 9 of 12 seeds from t123. The route KINDS moved
  the other way under the Trader economy: routes wait for FOREIGN_TRADE
  plus a trained Trader (~t60+), by which point specialty districts lift
  the domestic pair past the flat city-state yields in the candidate
  scan, and a completion hands the Trader straight to the next domestic
  pair. Measured over 12 driven seeds: 319 domestic routes (~27/seed,
  239 natural round-trip completions, 13 early ends), 11 city-state
  routes over 5 seeds, and the INTERNATIONAL arm now fires in ONE, at t241.
  The intl arm still lives mainly in `trade2_test` pokes and
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
- The CULTURE VICTORY's distance, re-measured: at t250 visiting peaks at 4
  (mean ~0.5) against a domestic peak of 59 (mean ~36) — a ~70x gap on
  means. B-20r's scope should be read off this, not any older number.
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
