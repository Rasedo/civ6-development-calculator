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
| B-21r suzerain rows | 1 | eleven perks are rules and Geneva's channel is a PEACE channel; the residual descoped rows all need whole absent systems |
| B-22r World Congress | 2 | 17 of the 21 regular resolutions ship, emergencies run as special sessions and a tie falls to the committed favor; four resolutions and the scored competitions have no carrier, and peace TERMS wait on the negotiated deal (C-2) |
| B-24r Ages/governors | 1 | all twelve dedications ship, both faces; dark-age policies, governor promotions and per-civ era drift do not |
| B-30r specialists | 1 | the mechanic, both citizen overrides and the three-plant Industrial tier ship; a LOCK still outlives the city that set it |
| B-31r trade-route tails | 1 | sea legs, trading posts and the whole-destination-set candidate ship; the pass-through half of the post gold has no carrier, plunder gold is a stylization, the summed-yield key is a heuristic and the free-choice head is P8's |
| B-53r the great-person queue | 1 | 205 sourced people, the era gate, the scaled price and each person's own ability ship; the offer is re-derived each turn rather than frozen, and faith never patronizes one |
| B-D unsourced data values | 2 | the sourced government terms ship and the invented ones are deleted; what remains is channel-blocked government tails, shape differences and model tuning that no source can close |
| B-36r appeal adjacency terms | 1 | every district AND improvement term ships off one catalog column, and a Great Person can now grant a city's tiles appeal; the CIVILIZATION-unique improvements' terms (C-26) do not |
| B-39r wonder effects still dropped | 1 | the sourced sweep shipped fourteen channels, the Mausoleum's engineer charge and Cristo Redentor's shield; two residuals, blocked on B-20r or B-34r |
| B-45r sourced-sweep finds in the other rows | 1 | three of the eight now have a channel; the five that do not need a wonder that grants a UNIT, faith patronage (B-53r), a rival-recruit event, or B-31r's route yields |
| B-54r flanking and support vs their own page | 1 | every rule on the page ships, and so do the four higher stacks a promotion or a Great Person raises; the two that a UNIQUE UNIT raises wait on C-26 |
| B-64r embarking and disembarking cost the whole turn | 1 | Civ 6 charges the transition 3 MP and carries the remainder into the new movement mode; both engines spend everything and end the move |
| B-56r the six inert promotions | 1 | 73 of the 79 catalog rows fire a rule; six name a mechanic neither engine has — sight-blocking, class-aware zone of control, escort formations, a promotion term in the air-strike roll, or a NAVAL RAIDER class to strike at |
| B-57r the SNIPE head stops at the distance-2 ring | 1 | a +1 Range promotion widens what the rule legalises and no seat can ORDER the shot, because the ring-3 columns do not exist |
| B-58r the religious purchase asks for a Shrine | 1 | Civ 6 asks for a MAJORITY RELIGION and a Holy Site with a Temple; both engines ask for a Shrine and never read what the city follows |
| B-59r the religious spread is a flat lump | 2 | Civ 6 scales the pressure by the Apostle's HP and strips a quarter of every other religion; both engines add a constant and strip nothing without Proselytizer |
| B-51r the Encampment's second pool | 2 | the assault conquers the district and its shelterers now; the SEPARATE perimeter pool is an unsourced claim, and a district a SHOT has emptied is walk-over ground where Civ 6 has a melee unit conquer it on entry |
| B-44r city-state war tails | 1 | the head, its policy, a SEAT's march on a minor and the declaration's grievances all ship; the barbarian walker still raids only majors because it beelines to one nearest city |
| B-61r the Great Person clauses with no carrier | 2 | the roster is placed and used; 20 of the 205 rows name a mechanic nothing here has, and eight effect channels the sweep found were dropped with their blockers |
| B-60r the dig's DATE, and the hull nobody dates | 1 | the artifact's civilization is the event's own now; its ERA is still the ACTING seat's research, and a barbarian or minor sinking a hull leaves no wreck at all |
| B-34r flood tails | 1 | the severity ladder, the river's whole reach, the river-scoped shield and the Dam all ship; the per-tile flood count and the climate/coastal tails do not |
| B-63r the grievance ledger's magnitudes | 1 | every sourced act pays the pair, the favor penalty and the era decay run, and PUBLIC RELATIONS scales what an act generates; the occupied and razed rows ship at their published CEILING because no pop or war-type scale is published, and the AI's gang-up bar is a heuristic |
| B-62r a natural wonder takes no tile adds | 1 | the wonder's roster yields are the whole tile: no pantheon feature yield, no suzerain improvement adjacency and no Preserve band, though the Grove's own text pays any adjacent unimproved Breathtaking tile |
| **B. Fidelity vs real Civ 6** | **29** | |
| C-1 POWER | 2 | the grid, the three plants, Cardiff, the Hydroelectric Dam, the powered-yield split, the FUEL and its CO2 all ship; four renewable improvements and the Biosphere have no carrier, nothing can retire a plant, and a minor's cities are never powered |
| C-2 diplomatic agreements | 3 | friendship, alliances, open borders, the closed border and the work gift ship on one 30-turn clock; alliance TYPES and LEVELS, the negotiated two-sided deal, and the four agreements that need one are open |
| C-5 strategic-resource stockpiles | 2 | the bank, its ceiling, the unit and project charges, the plants' fuel, unit FUEL upkeep and the heal a lost source denies all ship; the shortage penalty's magnitude is unpublished and trading resources waits on C-2 |
| C-6 policy-card modifiers | 1 | two of the 49 cards are inert, each blocked on a system below |
| C-8 draws made deterministic | 2 | the Great Person replacement walks a queue and the Congress slate rotates, where Civ 6 draws both |
| C-16 the spy's second half | 2 | the Spy, its capacity, the jump and all twelve missions ship; the escape-and-capture sequence, the spy promotion pool and two missions with no carrier do not |
| C-20 the Military Engineer's build list | 1 | the Fort, the Airstrip, the road and the 20% charge all ship; the Missile Silo waits on C-31, the Mountain Tunnel on C-35 and the railroad on C-36 |
| C-22 the district roster is a subset | 2 | all eighteen districts ship; the Canal carries no naval passage, six Government Plaza buildings have no effect body, and the Preserve's housing table is unpublished |
| C-24 the climate arc | 1 | emissions, the seven phases, ice melt, flooding, the Flood Barrier and a warmed world's weather all ship; nothing is ever submerged (C-35), the barrier's maintenance is unpublished, and railroads and the Mitigation civic's award have no carrier |
| C-26 no civilization uniques | 5 | seats are a name, a colour and a city list: no civ ability, no leader ability or agenda, no unique unit, no unique infrastructure (America's Film Studio among them) |
| C-27 pillaging pays no yields | 2 | the verb marks the tile and heals; nothing banks, and the raider chassis that ship now carry no Coastal Raid to bank from |
| C-28 tourism accrues to no one in particular | 2 | two lifetime banks (general + religious) divide by the civ count on read — the religious halvings apply per rival, but nothing can ACCRUE tourism toward one rival, which the international +25%s and the Rock Band key on |
| C-29 no RESOLVED suzerain | 1 | `isSuzerain` recomputes from the raw envoy store on every read, so a rule that changes envoy WEIGHT by who the suzerain is has no fixed point |
| C-30 city-states carry no research | 1 | no techs, no civics, so nothing can say when a minor took Early Empire — its borders never close and the suzerain's passage lifts nothing |
| C-31 the two chassis with a system behind them | 1 | the ladder runs to the Information era now; the nuclear devices and the Rock Band are each a whole absent system rather than a roster row |
| C-32 the new classes have no promotion tree | 2 | air, GDR, support and spy chassis are offered no promotion, so Sky and Stars' XP half has nothing to multiply |
| C-33 the Giant Death Robot is only its stats | 2 | seven sourced abilities and the four Future-era upgrades have no carrier |
| C-34 air combat's second half | 2 | bases, both heads, the sortie and the scatter ship; Interception, Patrol and Priority Target — the whole reason a fighter exists — do not |
| C-35 the land/water fact never moves | 2 | one static bit answers "is this sea", "can a hull stand here" and "is this coastal"; no tile can become water, which is what submersion and the Canal's passage each need |
| C-36 no railroad | 2 | roads are one boolean tier; the railroad's own movement rate, its per-hex Iron and Coal charge and its CO2 have no carrier, which C-20's fifth verb and C-24's third emitter both wait on |
| **C. Absent systems** | **38** | |
| **OPEN, TOTAL** | **68** | |

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
- **B-21r. City-state suzerain rows:** eleven perks are RULES (`SUZ_EFFECTS`,
  both engines): Kabul double attack XP, Preslav cavalry-on-hills CS, Mexico
  City regional reach, Anshan works science, Kumasi per-specialty route
  yields, Jerusalem Holy-Site pressure, Yerevan's free Apostle promotion
  choice, Vilnius's era Inspiration, Cardiff's +2 Power per Harbor building,
  Akkad's "melee and anti-cavalry units' attacks do full damage to the
  city's walls" — the Battering Ram's own bit, at every walls tier and with
  no support unit present (`siegeAssist` / `_siege_assist`) — and Bandar
  Brunei's +1 gold at a posted destination, riding the Trading Posts of
  B-31r (`routePostGold` / `_route_post_gold`). The remaining catalog rows carry their reason in their
  `CITY_STATE_SUZERAIN_BONUS` entry's `note`, and the roster is now
  current-ruleset throughout (see B-D), so the stand-ins are whole absent
  systems (unique improvements/luxuries, a faith-purchase class, a
  gold-purchase discount, a per-district Great Person channel) or a
  flat channel standing in for a %-scaling. ONE of those flat channels is
  CONDITIONAL and now says so: Geneva's reads "when you are not at war with
  any civilization", so `cityStateSuzerainCapitalBonus` /
  `_suz_capital_mask` pay it only while its suzerain is at peace with every
  MAJOR — a war with a minor is not a war with a civilization, and no other
  row in the table carries a condition. What survives of Geneva's row is the
  magnitude alone: +15% of the city's Science against a flat +3.
- **B-22r. World Congress residuals.** The session is real now: a
  rotating two-slot slate off `CONGRESS_RESOLUTIONS` — SEVENTEEN of the
  twenty-one regular-session resolutions, era windows and A/B texts
  verbatim from the GS wiki table: Urban Development Treaty, Patronage,
  Migration Treaty, Heritage Organization, Mercenary Companies, Trade
  Policy, Policy Treaty, World Ideology, Border Control Treaty, Treaty
  Organization, Sovereignty, Public Works Program, Deforestation Treaty,
  Global Energy Treaty, Public Relations, Military Advisory, World
  Religion — the always-3rd
  Diplomatic Victory resolution from Modern (+/-2 DVP on the winning
  TARGET),
  the 10k vote-cost curve, outcome-then-target plurality broken by the
  FAVOR each side committed (`tally` / `_congress_settle`, sourced: "Ties
  are broken by the proportion of Diplomatic Favor a player commits" — only
  a tie there falls back to A / the lower target index), +1 DVP to
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
  exactly, so the gate exercises the wire, not the choice. The three
  late-added rows are POKE-ONLY by the rotation's own arithmetic: the slate
  takes eligible ranks `2(s-1)` and `2(s-1)+1` of the session index, and a
  250-turn seed holds five sessions, so nothing past rank 9 ever stands
  (`world-congress.test.ts` and `congress_vote_test` are their bar).
  OPEN:
  - **THE OBSERVATION RENDERS THE STANDING SLATE, not the UPCOMING one.**
    A ballot addresses the session about to run, and the resolutions it
    will carry are computable (`_congress_upcoming`) but not rendered, so
    a net votes on the previous session's slate.
  - **FOUR resolutions still have no carrier**, each blocked on a named
    absence: Arms Control (weapons of mass destruction, C-31), Espionage
    Pact (spies), Governance Doctrine (a governor roster with appointment
    and promotion, B-24r), and Luxury Policy. The last is HALF-sourced, and
    a resolution whose two outcomes cannot both act is worse than an absent
    one — it eats a rotation slot and passes a no-op — so it waits with the
    rest:
    - **Luxury Policy.** SOURCED: "A: Duplicates of this Luxury resource
      grant additional Amenities. / B: This Luxury resource grants no
      Amenities." B is fully specified; A publishes no number, and
      nothing in either engine counts DUPLICATE copies of a luxury —
      amenities come from distinct types.
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
    through the same transfer. The GRIEVANCE half ships too:
    `grievanceFavorPenalty` / `_grievance_favor_penalty` take -1/turn at
    200 Grievances held against a seat, -1 more per 50 beyond, capping at
    -10. The POLLUTION half ships:
    `pollutionFavorPenalty` / `_pollution_favor_penalty` takes -1/turn per
    3 displayed pollution points above the world average, capping at 20.
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
  - TRADING POSTS ship. A route that runs its FULL term stamps the owner's
    post at both endpoints ("in the origin and destination cities" —
    `stampTradingPost` / `trading_post`, a per-(major, centre-tile) plane in
    the digest); a route may CHAIN one extra leg-range through each OWN post
    standing at a living city ("cannot make use of Trading Posts established
    by other civilizations" — `routeInRange` / `_route_reach_from`, each leg
    at that leg's own land/sea range, a post at the origin's own centre
    excluded); and a posted DESTINATION pays the route +1 gold, +1 more
    under Bandar Brunei's suzerain (`routePostGold` / `_route_post_gold`),
    a term the candidate key also carries. Reachability: the STAMP fires in
    every rollout (routes complete throughout — the Coinage dark face
    scores them), while a CHAINED pick needs a far pair bridged by a posted
    mid city, which the fixed seeds need not contain; the poke tests pin
    the chain, the exclusions and both gold magnitudes directly. OPEN: the
    PASS-THROUGH half of the post gold ("+1 Gold to the yields of every
    Trade Route which passes through this city") has no carrier — a route
    stores its endpoints and a walking Trader, never the cities it passes,
    so only the destination's post pays; blocked on a stored route PATH.
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
  EVERY DISTRICT AND IMPROVEMENT TERM IS NOW ONE CATALOG COLUMN.
  `DistrictDef.appealAdjacent` / `_appeal_adj` and
  `ImprovementDef.appealAdjacent` / `_imp_appeal_adj` are what both walks read,
  so the appeal walk names no district and no improvement type at all and a new
  row carries its own term: the Dam, Canal, Water Park and Preserve are +1 like
  the three that shipped first, the Aerodrome is -1 like the other
  heavy-industry rows, the Government Plaza and Diplomatic Quarter are 0, and
  the Airstrip joins the Mine, the Quarry and the Oil Well at -1.
  A GREAT PERSON CAN NOW GRANT IT TOO. The `appeal` per-city channel
  (`gpCityPermOf` / `_gp_tile_appeal`) adds to every tile the granting city
  owns, threaded through all nine `tileAppeal` call sites as an optional
  resolver (`gpAppealResolver` / `_gp_appeal_plane`) so no call site can
  silently default, and read BEFORE the wonder/mountain override on both
  engines.
  OPEN: the CIVILIZATION-unique improvements' terms (C-26).
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
  THE MAUSOLEUM'S CHARGE SHIPS. "All Engineers have an additional charge
  (applies to both existing Great Engineers and Military Engineers)" is
  `engineerCharges` / `_wond_eng_ch`: paid once to every live engineer at
  completion and again at every later spawn, over both chassis
  (`isEngineer` / `_engineer_types`).
  CRISTO REDENTOR'S SHIELD SHIPS beside the resort multiplier: "Tourism
  output from Relics and Holy Cities is not diminished by other
  civilizations who have researched The Enlightenment civic" is
  `holyTourismShield` / `_wond_holy_shield`, read where the halving lives —
  the culture-victory read over the RELIGIOUS tourism bank (see C-28).
  OPEN, each blocked: Apadana's "+2 Great Work slots (any type)" and the
  Hermitage's LANDSCAPE-only art slots, both waiting on the per-work TYPE
  B-20r names; and the Great Bath's per-flood faith (B-34r).
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
    and the Pyramids' free Builder: no wonder effect channel GRANTS A UNIT,
    and the completion body has nowhere to spawn one from.
  - The Oracle's 25%-cheaper Great Person patronage: faith never buys a Great
    Person here (B-53r's own residual), so there is nothing to discount.
  - The Great Library's boost when a RIVAL recruits a Great Scientist: no
    engine raises an event on another seat's recruit.
  - The Colossus' and Great Zimbabwe's +1 trade-route capacity and free
    Trader, Great Zimbabwe's per-bonus-resource route gold and Sankoré's three
    route-yield terms: all wait on B-31r's route-yield work.
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
  The four HIGHER STACKS a promotion or a Great Person raises ship as well:
  Double Envelopment, Square and Shadow Strike are `FLANK_MULT` / `SUPPORT_MULT`
  rows the owner's unit must hold, and Georgy Zhukov and Horatio Nelson raise
  the percentage itself — which is why `GP_PERM` splits it in two, since
  Zhukov's "+50% flanking bonus" is for LAND units and Nelson's is for NAVAL.
  OPEN:
  - **THE TWO STACKS A UNIQUE UNIT RAISES.** Zulu's Impi and Macedon's
    Hypaspist each raise flanking or support for themselves alone, and no
    civilization unique exists in either engine — C-26.
- **B-64r. Embarking and disembarking cost the whole turn.** Weight 1. CIV6
  (Movement, "Embarking"): the transition requires "either 3 Movement or all
  the unit's Movement for the round (if it has less than 3 Movement)", and "if
  a unit has more than 3 Movement available for either embarking or
  disembarking, the remaining points are transferred to the new movement mode,
  and that unit may manage to continue moving in this same turn" — the page's
  own worked example is a 4-MP cavalry unit that embarks and still walks one
  water tile, and its own rider is that "normal movement limits still apply
  after the switch of movement mode". Both engines charge the whole pool
  instead: `stepUnit`'s `transition` arm and `_step_verb`'s twin price the
  step at everything the mover has left, so nothing ever enters the water and
  keeps going. The page's own discount rides on the same rule and has no
  carrier either: "embarking to and from a tile with a Harbor district or a
  City Center tile (for a coastal city) ... costs only 1 Movement".
- **B-56r. The six inert promotions.** 73 of the 79 catalog rows in
  `cpu/data/promotions.ts` reach a rule through `promoCS` / `_promo_cs` or one
  of the flag and value kinds beside them. SIX carry `none` because the
  mechanic they name is not in either engine, and each is recorded here with
  its own blocker rather than as a data comment:
  - **SENTRY** ("can see through Woods and Rainforest") — `revealAround` /
    `_reveal_around` reveal a flat radius, so nothing blocks sight and the
    promotion has nothing to lift.
  - **SUPPRESSION** grants zone of control to a ranged unit. `unitExertsZoc` /
    `_in_enemy_zoc` read one chassis flag (the submarines' "does not exert
    zone of control") and otherwise count EVERY hostile military unit, ranged
    included, so the promotion has nothing to grant. The real gap is the other
    way round: a ranged unit should not exert ZOC without it, and making the
    exert test CLASS-aware is the fix this row is waiting on.
  - **CONVOY and ESCORT_MOBILITY** move an escorted unit with its escort. A
    tile holds a stack now, but nothing binds one occupant's move to the
    other's: `unitStackSlot` / `_occ_set` file each unit on its own plane and
    every walker steps one slot at a time, so there is no formation to move.
  - **CREEPING_ATTACK** is not a stealth row at all, which this entry used to
    claim: it is "+14 Combat Strength vs. naval raider units", and no such
    class exists to name in a `CS_VS_CLASS_*` mask — C-32, where the three
    raider chassis carry no promotion class of their own either.
  - **PROXIMITY_FUSES** is "+7 Combat Strength when defending against air
    attacks". Air attacks exist now, so C-16 is no longer what stops it; the
    blocker moved. `airStrike` / `_air_strike` roll the defender at
    `airDefenseOf` / `_type_anti_air` alone and never call `promoCS` /
    `_promo_cs`, so NO promotion reaches that roll — threading the promotion
    term into the sortie is the work, and it changes every defensive
    promotion's reach at once, which belongs with B-54r's combat-page pass.
  REACHABILITY: the six rows ARE offered — `_promo_offer_mask` opens them and
  the driver takes them — so a unit can hold an inert promotion and nothing
  will change. That is the visible symptom. The other 73 are proved by two
  poke lanes rather than by the gate, which reaches a tier-4 row only by
  accident: tests/gpu/promotions_test.py for the ladder, the head and the
  Combat Strength evaluator, tests/gpu/promo_effects_test.py for the twenty
  kinds that are not Combat Strength.
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
  Site, and a TEMPLE on top for the Apostle and the Inquisitor — but at those
  three counters neither engine reads `city.followedReligion` / `city_followed`,
  so a city pressed into a rival's religion still sells its owner's Apostles.
  The Shrine is this engine's own stand-in and the majority test is the missing
  half. The WARRIOR MONK's counter is the one that reads it: `purchaseWarriorMonk`
  / `_seat_monk_city_ok` ask what the city follows, whether THAT religion's
  follower belief is Warrior Monks, and for a Temple — so the shape the other
  three want is already written next door.

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

- **B-61r. The Great Person clauses with no carrier.** Weight 2. The roster is
  PLACED AND USED: each of the 205 people is a unit on the map carrying its
  queue position (`Unit.gpAt` / `unit_gp_at`), walks to the site its own row
  names, and spends a charge there through one action column
  (`ACTIVATE_GP` / `_A_GP`). `GP_ABILITY` is the sourced per-person table and
  `gpEffectOf` is the one resolver both engines read; `GP_FX` names the dense
  wire columns so neither engine writes a position down. Twenty-six effect
  kinds fire, from the eureka draws through the instant buildings, the
  invented luxuries, the per-adjacency yields and the two permanent runs
  (`GP_PERM` per seat, `GP_CITY_PERM` per city).
  WHAT DOES NOT. Twenty rows carry `unmodelled: true` — their clause names a
  mechanic nothing here has, and the class lump stands in: Mary Leakey, Shah
  Jahān, Nikola Tesla, Joseph Paxton, Kenzo Tange, Stamford Raffles, Sarah
  Breedlove, Mary Katherine Goddard, Jamsetji Tata, Masaru Ibuka, Boudica,
  El Cid, Dandara, Napoleon Bonaparte, Túpac Amaru, Marina Raskova, Gaius
  Duilius, Leif Erikson, Santa Cruz, Matthew Perry. The flag is the honest
  half of the table: a row that carries it is NOT claiming its Civilopedia
  text is modelled.
  The channels those clauses need, each with its own blocker:
  - a pillage yield percentage (C-27 — pillaging pays nothing to scale);
  - diplomatic visibility of a rival (no visibility system on either engine);
  - a district built OVER the population limit (no district pop limit here);
  - a tourism percentage on a trade route, and district tourism (C-28 — the
    international modifiers want per-rival ACCRUAL);
  - a seat-wide building yield add, and per-tile air slots;
  - science from an ARTIFACT beyond what the museum already pays;
  - CORPS/ARMY/FLEET/ARMADA — no formation system exists, so every clause
    that forms or strengthens one is inert;
  - a REGIONAL building's reach (Tesla, Paxton) — `regionalRange` is a
    per-building constant with no per-seat modifier;
  - absorbing a city-state (Raffles), converting a barbarian outpost
    (Boudica), and annexing an adjacent tile (Crassus) — three verbs with no
    entry point.
  `luxuryFromTile` was mapped onto the generic `luxuryCopies` pass rather than
  reading the person's named resource, which is a stylization, not a channel.
  REACHABILITY: the driven 250-turn probe reaches a Great Person unit on all
  12 seeds at t53, the ACTIVATE_GP column at t54 and a spent charge at t55;
  the per-seat permanent run on 8/12 seeds and the per-city one on 6/12.
  `tests/gpu/great_person_test.py` and `tests/cpu/units/greatPerson.test.ts`
  hold the arms the gate does not.

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
  The district is also a TARGET in its own right, and the tile's occupant is
  not: CIV6 (Combat) says "A unit may take shelter (that is, avoid being
  attacked) if it enters a City Center or Encampment tile. There it is
  invulnerable as long as the city/Encampment stands; however, when an enemy
  destroys/takes the city/Encampment, the unit inside will be destroyed
  instantly, regardless of its remaining HP." Both engines fought whoever
  stood on the district first; they now answer with the district, melee and
  shot alike, and the melee assault that empties the pool CONQUERS it — the
  page's "cannot be pillaged normally - they have to be 'conquered' by a melee
  unit, as you would a City Center. At this point the entire district and all
  buildings in it are automatically pillaged, but you don't gain any spoils
  from it", with the shelterers razed by the same body a captured centre uses.
  A shot prices the district instead of refusing it, at the sourced "-17
  penalty when attacking city and district defenses", and never conquers. The
  PILLAGE verb no longer offers an Encampment on either engine.
  REACHABILITY: the walls half of that strength was true of the GPU and NOT of
  TS until the driven gate reached an assault on a walled Encampment (seed
  9014, t170) — the entry asserted it for both engines while one of them read
  `Math.max(15, bestMeleeCS)` alone. `siege.test.ts`'s "defends at its city's
  WALLS tier" lane, `encampment_test.py`'s district pokes and
  `city-combat.test.ts`'s "an Encampment under attack" are the bar now.
  OPEN:
  - **THE TWO POOLS ARE ONE HERE.** This model folds the district's perimeter
    into the city's, so damage to either is damage to both, and the claim that
    Civ 6 keeps them SEPARATE is UNSOURCED: the Encampment page says only
    "Acquires Outer Defenses and Ranged Strike along with the City Center once
    Walls have been built", and neither it nor Ancient Walls says whether the
    two pools are one or two, nor whether a repair restores them together.
    Settle the claim before splitting them — the split is new per-tile wire
    state and a second `outerHp` on every defensible district.
  - **A DEFENSELESS DISTRICT IS WALK-OVER GROUND.** Only a melee ASSAULT
    conquers here. A ranged strike can take `encampHp` to 0 without pillaging,
    and the movement block lifts on that alone, so a foreign unit then walks
    onto an intact enemy district and nothing happens. Real Civ 6 conquers it
    on ENTRY by a melee unit ("as you would a City Center"), and the district
    page's block reads "unless the district is pillaged" rather than "unless
    its defenses are down". What a NON-melee unit may do with such a tile is
    unsourced on both pages. The conquest body exists on both engines
    (`conquerEncampment` / `_conquer_encampment`); what is missing is the
    entry hook, and on TS `stepUnit` lives in `units.ts`, which `combat.ts`
    already imports.
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
  - **FAITH NEVER PATRONIZES ONE.** CIV6 (Faith): "Faith can be used at all
    times to purchase Great People via Patronage." Here the only currency on
    the offer is the class's own Great Person points, so a seat with a large
    faith income cannot outbid a rival for a person, and the Oracle's
    25%-cheaper patronage (B-45r) has nothing to discount. The queue and the
    price both exist; what is missing is the second purse on the same offer.
- **B-D. UNSOURCED DATA VALUES — swept once; the named stylizations are
  OPEN, not closed.** The cpu/data walk fetched every magnitude from the GS
  Civilopedia row by row: all 28 wonders (12 corrected, every unlock now the
  real tech/civic), every unit, every technology and every civic (era, cost,
  prereqs — both trees were systematically off and now match the real tree),
  every building (costs; worship faith price 380), and every policy card
  (all 49, each against its own Civilopedia page — see C-6). What is LEFT is each labelled at its definition, and
  each is an open residual rather than a decision:
  FOUR ROWS CLOSED by reading their real text, and one bullet was FALSE:
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
  - **The MISSIONARY was priced at 150 FAITH.** SOURCED (its infobox): 100,
    which is what the row carries now. The Shrine gate and the three spread
    charges beside it were already right.
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
  from `cpu/`. AKKAD joined the militaristic list afterwards, for the ram bit
  its suzerain confers; the seeder places three minors of each type and so
  reaches neither it nor Valletta — C-8.

  What remains open, each with what a source would have to publish:
  - **The GOVERNMENTS' inherent bonuses.** The GS rows ARE published, and
    the expressible terms now ship: Classical Republic's "+1 Housing and
    +1 Amenity" pays every city with ANY completed district
    (`cityWithDistrict` — the specialty-gated channels stay the cards')
    and its "+15% Great Person points" multiplies beside the Patronage
    factor (`gppMult`); Oligarchy's "+4 Combat Strength" rides the
    PROMOTION-class axis MELEE/ANTICAV/NAVAL_MELEE and Fascism's "+5" the
    all-combat arm (`governmentUnitCS` / `_gov_unit_cs`), with "+20% Unit
    Experience" as percentage points in every award (`governmentXpPct`),
    "War Weariness reduced by 15%" joining the permanent cut in `addWw` /
    `_ww_battle`, and "+50% Production toward Units" as the class-free
    prodBoost arm; Autocracy adds "+10% Production toward Wonders";
    Communism's "+10% Science" was already sourced. THE UNSOURCED
    MAGNITUDES ARE DELETED: Monarchy's flat +1 housing and the ungated
    x1.1 gold/faith/culture on Merchant Republic, Theocracy and Democracy
    each stood in for a term the model cannot express, and a row now
    carries only what its page states. OPEN, each with what it waits on:
    Monarchy's "+1 Housing per level of Walls" (a per-city WALLS-LEVEL
    count), its "+2 Diplomatic Favor for every Renaissance Walls" (a
    favor-per-building term) and "+50% Influence Points" (an influence
    MULTIPLIER — `influencePerTurn` is flat); Merchant Republic's "+10%
    Gold in all cities with an established Governor", Theocracy's "+0.5
    Faith per Citizen in cities with Governors" and Communism's "+0.6
    Production per Citizen in cities with Governors" (a per-city GOVERNOR
    gate on a yield term); Merchant Republic's "+15% Production toward
    Districts" (a DISTRICT prodBoost target); Theocracy's "+5 Religious
    Strength in Theological Combat" (a government channel into the
    theological roll) and its "15% Discount on Purchases with Faith" with
    Democracy's gold twin (a purchase-price multiplier); Democracy's GS
    route and alliance-point terms (C-2's alliances); Autocracy's "+1 to
    all yields for each government building" (a per-city count the
    Government Plaza rows make countable — `BuildingDef.govTier` /
    `_b_gov_tier` — that no channel yet reads). Every legacy bonus is out
    of scope by construction — R&F phased them out. ADOPTION REACHABILITY:
    `computeAdoption` / `_adopted_gov` take the newest unlocked tier on
    table order, so Oligarchy and Classical Republic are adopted in NO
    game on either engine — their rows are held by the two government
    test lanes' borrowed-row drills, not by the serve gate.
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
  - **THE RELIGIOUS FAITH PRICES ARE FLAT.** Every religious infobox ends
    "Faith cost is progressive", and `purchaseReligiousUnit` / the faith-buy
    arm charge `UNITS[t].cost` unchanged however many the seat has already
    bought. It is the same missing channel `naturalistCost` names, and the
    same reason: no source publishes the progression's own magnitude.
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
  - **VALLETTA'S WALLS DISCOUNT HAS NO PUBLISHED MAGNITUDE.** SOURCED (its
    suzerain row): "Cost of purchasing Ancient, Medieval, and Renaissance
    Walls is reduced, but they can only be bought with Faith." The
    faith-ONLY half ships (`wallsGoldBlocked` / the walls arm of
    `_seat_buy_candidates`); the REDUCTION does not, because neither the
    city-state page nor any of the three walls pages states a number, so the
    walls price at the ordinary faith rate. One published figure closes it.
  - **THE FAITH RATE FOR A LAND COMBAT UNIT IS INFERRED.** Valletta's page
    publishes one faith rate and it is for BUILDINGS — "2 Faith for 1
    Production", which is `FAITH_PURCHASE_MULT`. Theocracy's and the Grand
    Master's Chapel's unit purchase (`unitFaithCost` /
    `_seat_faith_unit_candidate`) reuses that same rate because no page
    states the unit one; the Faith page only says the price rises "as with
    Gold purchases".
  - **THEOCRACY'S INHERENT ROW IS STILL THE MODEL'S.** SOURCED (GS): "+0.5
    Faith per Citizen in cities with Governors. 15% Discount on Purchases
    with Faith", beside the land-unit grant that now ships. The row pays
    +10% faith in all cities instead — the governor-gated yield is the same
    channel Merchant Republic and Communism wait on above, and the faith
    discount is the purchase-price channel named there.

- **B-62r. A natural wonder's tile pays its own roster row and nothing
  else.** `tileYields` LEAVES on `tile.wonder`, so such a tile takes the
  wonder's published yields and none of the runtime adds every other tile
  gets: a pantheon's `featureYields`, a suzerain improvement's adjacency,
  and the PRESERVE's own bands. The GPU used to pay those adds on top and
  now masks them in `_tile_add_live`, so the engines agree — on the wrong
  answer. SOURCED (Grove): "+1 Food and Faith to adjacent unimproved tiles
  with Charming Appeal. Yields increased to +2 Food, Faith and Culture for
  adjacent unimproved tiles with Breathtaking Appeal." A natural wonder is
  unimproved and Breathtaking by construction (`tileAppeal` answers 5), so
  the real building pays it and both engines refuse. The same early return
  covers the mountain and the impassable feature, where no citizen can be
  placed and only the border scan reads the tile at all.

- **B-63r. The grievance ledger's two unpublished magnitudes.** The
  mechanic itself is whole. GS keeps ONE signed balance per unordered pair
  (sourced: the score is "organized as a coordinate system, with the
  'neutral' point, 0, and Civilizations A and B standing on the two sides of
  the neutral point"), so `state.grievances` keys it like every other pair
  clock and `civ_grievance` is its antisymmetric matrix; the digest field
  `grievances` compares them. Every published row pays: surprise war 150,
  formal war 100, war on a friend or ally 75, war on a city-state's suzerain
  100 and on an envoy holder 50, city occupied 50, razed 3x that, the final
  city of a civ 150 to every survivor, a city-state conquered 50 and razed
  100, a denouncement 25, and 3 per turn while holding a civ's original
  capital at peace. Allies of the victim take 50% of the same act and
  declared friends 25% (`spreadGrievance` / `_spread_grievance`). The ledger
  decays at "10 - x per turn, where x is each era after the Ancient Era",
  floored, only while THAT pair is at peace, slower for the party whose
  founded cities are held and faster for the holder (`City.founderSeat` /
  `city_founder` is what that asks about). It costs diplomatic favor at the
  sourced ladder (B-20r), gates friendship, feeds the AI's gang-up read, and
  PUBLIC RELATIONS scales what an act generates. OPEN, and neither can be
  closed from a source:
  - **THE OCCUPIED AND RAZED ROWS SHIP AT THEIR CEILING.** The table
    publishes "City Occupied ... up to 50" and "City Razed ... up to 150"
    without the pop or war-type scale that walks up to it, so both engines
    charge the ceiling flat. A source that publishes the scale closes it.
  - **THE GANG-UP BAR IS A HEURISTIC.** `GRIEVANCE_GANG` is twice a formal
    declaration and is what the AI reads to decide a seat is a common enemy.
    No source publishes an AI threshold; this is a tuning knob wearing a
    sourced unit.

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
  - **THE CLIMATE ACCORDS COMPETITION HAS NO CARRIER.** The three plants
    now emit on the published curve, so trading a Coal plant for a Nuclear
    one is a real decision; what the emissions still cannot feed is the
    scored competition that ranks the seats by them, which is B-22r's
    absent competition machinery rather than anything climate-specific.
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
  - **WHICH CITY-STATES A GAME GETS.** Real Civ 6 draws them from the whole
    roster. `seeder/place.ts` keeps its own copy of `CITY_STATE_NAMES` holding
    THREE names of each type and places them in order, so every world gets the
    same eighteen minors and the catalog's later rows — Caguana, Hunza,
    Cardiff, Valletta, Akkad, Armagh — are placed by no seed at all. Their
    suzerain rules are written and gate-unreachable. The roster test asserts
    the seeder's copy stays INSIDE the catalog, which is why the six extra rows
    are invisible to it; drawing here would move `genStamp` and re-seed every
    fixture.
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
- **C-20. THE MILITARY ENGINEER'S LAST THREE VERBS.** Weight 1. Its page reads
  "Can construct Roads, Forts, Airstrips, and Missile Silos (uses 1 charge)",
  "[GS] Can construct Railroads (costs no charge) and Mountain Tunnels (uses 1
  charge)" and "[GS] Can spend a charge to complete 20% of an engineering type
  of district (Aqueduct, Bath, Canal, Dam) and Flood Barrier building". Four of
  those ship: the FORT on "any featureless land tile", the AIRSTRIP "on flat
  terrain" with its "+3 aircraft slots" and "-1 Appeal", the ROAD, and the 20%
  charge into an Aqueduct/Canal/Dam site or a Flood Barrier at the centre. All
  of them go "in your own or NEUTRAL territory" (`engineerTileOk`), which is
  the one build that reaches outside a seat's own borders.

  Three residuals, each blocked on a system rather than on this row:
  - **THE MISSILE SILO** bases nuclear devices, which is C-31.
  - **THE MOUNTAIN TUNNEL** makes an impassable tile passable, and
    passability is a static fixture plane on the GPU and `isImpassable` on TS
    — C-35.
  - **THE RAILROAD** is a second movement tier with a per-hex resource charge,
    which is C-36.

  Two more of the page's lines have no verb here either, and each names its
  own absent system: "Can clean Nuclear Fallout" waits on C-31, and "Can Remove
  Tile Improvements" is a verb neither engine has for any unit.

  The Bath in the charge's district list is Rome's unique Aqueduct (C-26), and
  the Reinforced Barricade and the Modernized Trap that an earlier draft of
  this row named are exclusive to the ZOMBIE DEFENSE game mode, not the base
  game — they were never in scope.

  MEASURED GATE REACHABILITY IS ZERO: `engineer` reads 0/12 seeds over 250
  turns, so no fort, airstrip, road or charge is ever built in the gate and
  scripted parity says nothing about any of it. The chassis needs "a city that
  has an Encampment with an Armory", which no seed reaches. `engineer_test.py`
  pokes every rule directly instead.
- **C-27. PILLAGING PAYS NO YIELDS.** Weight 2. The PILLAGE verb sets
  `pillaged` on the tile, heals a food-improvement pillager and spends the
  move; nothing is banked by anyone on either engine. Real Civ 6 pays the
  pillager a yield lump keyed to what was wrecked. Two gaps wait on it:
  - **`TOTAL_WAR`'s pillage half** (C-6).
  - **THE COASTAL RAID.** All three naval raiders ship now, and each one's
    page lists "Can perform Coastal Raids" beside the abilities that do ship:
    "To perform a Coastal Raid, the Privateer must be next to the land
    improvement or district, and must have at least 3 Movement points
    remaining." Neither engine offers a PILLAGE column to a hull at all
    (`_seat_unit_mask` builds the verb over land movers), so the raid needs
    the column before it can need a payout.
- **C-28. TOURISM ACCRUES TO NO ONE IN PARTICULAR.** Weight 2. The bank is
  TWO lifetime scalars now — `Seat.tourism` / `civ_tourism` and the
  RELIGIOUS half `Seat.tourismReligious` / `civ_tourism_rel` ("Relics
  generate Religious Tourism", "Holy Cities generate +8 Religious Tourism
  per turn", each holy city paying its CURRENT owner) — and the visitor
  split divides each by the civ count on read. The split is what lets the
  two sourced RELIGIOUS-tourism halvings apply PER RIVAL at the
  culture-victory read (`cultureVictor` / `_culture_victor`): "-50%
  (Religious Tourism only) if the foreign civilization has The
  Enlightenment", cancelled by Cristo Redentor's `holyTourismShield`, and
  "-50% (Religious Tourism only) for Different Religions" against the
  rival's majority religion (`dominantReligion` / `_dominant_religion`),
  never applied before this seat FOUNDED one. What is still missing is
  ACCRUAL per foreign civ: real Civ 6 banks tourism toward each rival
  separately, which is what the international +25% modifiers (Open Borders
  — C-2 — and the trade-route pair), the up-to--40% different-governments
  penalty, `ONLINE_COMMUNITIES` (C-6) and the Rock Band (C-31) all key on.
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

- **C-32. THE NEW CLASSES HAVE NO PROMOTION TREE.** Weight 2. `PROMO_CLASSES`
  covers the land, melee/ranged naval and religious chassis; the AIR, GIANT
  DEATH ROBOT, SUPPORT and NAVAL RAIDER classes have no entry, and neither
  does the SPY — so the three raiders that now carry stealth are offered no
  promotion at all. `UNIT_PROMO_CLASS`
  therefore maps every one of those chassis to nothing, `promoOffer` /
  `_promo_offer_mask` open no column for them, and a fighter that wins ten
  sorties stays at level 1 forever. Two rules wait on this one:
  - **SKY AND STARS' golden half** is "+100% Experience for all Air Units"
    beside the Aluminium grant. The grant ships; the XP half has no tree to
    accelerate, and adding one widens `PROMO_COLS`, which is a wire change.
  - **THE SPY PROMOTION POOL** — fourteen sourced rows, three offered at
    random per level (C-16). The random OFFER is also C-8's territory: the
    draw here would have to be a queue.
  - **CREEPING ATTACK HAS NOTHING TO STRIKE AT.** "+14 Combat Strength vs.
    naval raider units" names the missing class as a TARGET, so the row needs
    a `CLASS_BIT` for it before a `CS_VS_CLASS_ANY` mask can address one —
    B-56r carries the row itself.
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
- **C-36. NO RAILROAD.** Weight 2. `Tile.road` / `sim.road` is ONE boolean
  tier: a road-to-road step ignores the terrain penalty and, from the
  Classical era, the river charge. Gathering Storm's railroad is a second tier
  on top of it, and none of its three halves has a carrier — its own movement
  rate, "1 Iron and 1 Coal per hex" charged against the stockpiles that
  already exist, and the CO2 that "adds pollution, and quite a bit at that".
  Two rows wait on it: C-20's fifth engineer verb and C-24's third emitter.
- **C-35. THE LAND/WATER FACT NEVER MOVES.** Weight 2. Whether a tile is sea
  is decided at map generation and never again. On TS it is `isWater` reading
  `terrain`; on the GPU it is the static planes `water` and `wpass` plus
  everything derived from them once at load — `coastal_land`, `coastal_water`,
  `tile_wh` and the `_land_list` candidate list — none of which is in
  `_MUTABLE`, so no rule can write any of them. The bit is also OVERLOADED: the same fact answers "is this
  sea", "can a hull stand here", "is this city coastal" and "does this tile
  carry water housing", so a rule that moved it for one of those meanings would
  move it for all four. Two gaps wait on this: submersion, which needs a
  flooded lowland to BECOME sea (C-24), and the Canal's naval passage, which
  needs a land tile a hull can enter without becoming sea for the other three
  readers (C-22).
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
  either engine, and `aggression` is this model's own tuning rather than any
  published agenda. Gaps waiting on it: the Impi and the
  Hypaspist, which raise a Flanking or Support stack above +2 for their owner
  (B-54r); the Gauls' OPPIDUM, which is a third defensible district and so a
  third place those bonuses are withheld; Ambiorix's leader ability, which
  pays +2 Combat Strength per adjacent military unit and unlike Flanking and
  Support applies to ranged attacks too, and Saladin's, which doubles both
  bonuses outright; and the Nihang, the one unit that keeps a Combat Strength
  bonus of its own while embarked, where every other unit normalizes.
- **C-24. THE CLIMATE ARC.** Weight 1. Gathering Storm's climate arc ships on
  both engines. Every seat banks lifetime CO2 in RAW units, the world's total
  is scaled by the deforestation band it has cleared, and `climatePoints` /
  `_climate_points` turn that into the seven-row phase ladder read off the
  Phases of Climate Change table — monotone, by the page's own rule that a
  phase cannot be reverted. Two of the three emitters the page names exist and
  both pay: a power plant discharges `fuelRate` x `CARBON_PER_POWER`, which
  reproduces the page's own ~3.28 / ~1.96 / ~0.77 display figures with no fudge
  factor, and a unit drawing Coal, Oil or Uranium discharges a quarter of that,
  halved again by Advanced Power Cells. `CO2_PER_POINT` is the DUEL row,
  because this world is 44x26, which IS Civ 6's Duel.
  What the warming then does: `meltIce` / `_melt_ice` takes the phase's
  published fraction off the map's original Ice; the phase's flood band goes
  under and every tile in it is pillaged, which is exactly "still workable, no
  improvement bonus" through the `pillaged` gate `yields` already had;
  `disasterRateMult` and `severitySplit` scale the four disaster draws and move
  mass onto the worst severity band; and past Phase IV `fertilityLive` stops
  the silt while `desertificationLive` makes storms and droughts take it back
  off the same tiles.
  The FLOOD BARRIER is a City Center building on COMPUTERS at the page's own
  price, `(80 x lowland tiles) x (1 + flood level)`, refused to a city with no
  lowland, unpurchasable, and repairing in full what already went under. Its
  price is LIVE rather than locked at queue — `buildingCostIn` /
  `_building_cost_in` re-read it every turn through `_reprice_barrier` —
  because the page's own strategy note is that "the price will practically
  double in the course of the construction".
  Two more carriers arrived with it: CARBON RECAPTURE, an Industrial Zone
  project gated on the Global Warming Mitigation civic, paying -50,000 units
  and +30 favor and free to take a seat's lifetime total below zero; and the
  GLOBAL ENERGY TREATY, the fourteenth Congress resolution, whose two outcomes
  are a 50% discount on one plant type and a world ban on building it.
  A COASTAL LOWLAND's band is this model's own and cannot be otherwise: real
  Civ 6 stamps metres above sea level at map generation and publishes neither
  the generator's rule nor the elevations, while the runtime map carries
  elevation only as FLAT / HILLS / MOUNTAIN. `deriveLowlands` is a multi-source
  BFS out from the water over FLAT land, so the shoreline drowns first and a
  hill never does. It runs ONCE, on TS, and ships to the GPU as the tile key
  `lw` — one derivation, two engines, which is why they cannot disagree about
  which tiles the sea reaches.
  REACHABILITY, measured not assumed: NONE OF IT is reached. In 12 seeds x
  250 turns no seat's lifetime CO2 ever leaves zero, so no game reaches Phase
  I — a plant waits on INDUSTRIALIZATION and its fuel, and 250,000 raw units
  buys one point at this map size. Every body here is proven by
  `tests/gpu/climate_test.py` and `tests/cpu/map/climate.test.ts` alone.
  What is still open:
  - **NOTHING IS EVER SUBMERGED.** Phases IV, VI and VII submerge bands 1, 2
    and 3, and the tiles are "lost forever and cannot be recovered". Neither
    engine applies it. The published sea level IS on the wire — `floodLevel` /
    `_flood_level` takes the submerge band into the Flood Barrier's price, so
    the barrier gets dearer on the published schedule — and what is missing is
    only the tile turning to water, which is C-35.
  - **THE FLOOD BARRIER KEEPS FOR NOTHING.** The page says "Initial Production
    cost and per turn maintenance are variable based on the number of Coastal
    Lowland tiles in this city and the current sea level", then publishes ONE
    formula, which is the production cost: its infobox `cost` of 80 matches it
    while its `maintenance` reads only "Variable". No source anywhere gives a
    maintenance figure, so the row carries 0 and a barrier is free to keep.
  - **RAILROAD CONSTRUCTION EMITS NOTHING.** The third source the page names —
    "every tile of constructed/upgraded Railroad will consume 1 Coal, which
    adds pollution, and quite a bit at that" — has no carrier, because neither
    engine has a railroad at all (C-36).
  - **GLOBAL WARMING MITIGATION PAYS NOTHING OF ITS OWN.** The Future-era civic
    exists and gates Carbon Recapture, but its award — "3 Envoys and 1
    Diplomatic Victory point" — has nowhere to land: `ResearchEffect` carries
    unlock kinds only, so no tech or civic on either engine can make a one-off
    grant of anything.
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
    plane, not a bit borrowed from the water one — which is C-35.
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
    same shape as the wonder free-unit grants B-45r names; no completion body
    on either engine spawns one, and only its capacity half ships.

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
| two enemy religious units ADJACENT (theological combat's precondition) | 4/12 | t94 |
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

- THE DISTRICT LANE ROTATES ITS PICK by (seat + turn) rather than taking the
  first legal column. That is a DECISION the applier re-validates and TS only
  replays, so it widens coverage without changing what is legal, and it is why
  the late-unlock districts appear in this table at all.
- THE TAIL OF THIS TABLE IS TRAJECTORY, NOT RULE. Every row below 8/12 moves
  by a seed or two whenever anything steers the late game — a fourteenth
  Congress resolution in the rotation and two new production rows were enough
  to move five of them at once, in both directions. A row that thins is a
  coverage loss and never a regression: each names the poke lane that is its
  actual bar.
- THEOLOGICAL COMBAT IS REACHED, in 4 of 12 seeds from t94, so the
  resolver's deterministic damage and its apostle-only initiation ARE
  gate-covered.
- The APOSTLE BUY fires in every seed from t70 and the 250-turn gate is
  green, which is what closed B-18r's predicted lifecycle drift.
- THE GREAT PERSON IS THE WIDEST NEW HEAD IN THE GATE. A person stands as a
  unit on every seed from t53, the mask offers it the spend a turn later, and
  a charge is actually spent on every seed from t55 — so the roster, the
  walk, the site predicate, the spend and `civ_gp_used` all ride the digest.
  What the gate does NOT reach is the tail of the effect table: the two
  permanent runs land on 8 and 6 of 12 seeds, and no seed spends a person
  whose site is a city-state's ground or an owned luxury.
- NEITHER FAITH-PURCHASE CLASS IS REACHED. No seed carries a minor to
  suzerainty of a Valletta-shaped city-state, and none reaches Theocracy or
  builds a Grand Master's Chapel, so both grants read 0/12. The class
  purchase, the walls' gold refusal, the land-unit rung and their prices are
  proven by `cs_bonus_test`, `buy_wire_test` and
  `tests/cpu/city/faith-purchase.test.ts` and by nothing else.
- THE WARRIOR MONK AND ITS TREE ARE POKE-PROVEN ONLY. The buy needs the
  Warrior Monks follower belief, a Holy Site and a Temple in one city, and its
  seven promotions sit on a class no other chassis enters; AKKAD is reachable
  by no seed at all, because the seeder's pool never names it (C-8). So the
  ram bit its suzerain confers, the monk's attack budget, Twilight Veil and
  Disciples are proved by `tests/cpu/units/warrior-monk.test.ts`,
  `tests/gpu/suzerain_rules_test.py` and `tests/gpu/promo_effects_test.py`,
  and by no gate lane.
- THE CITIZEN OVERRIDES ride the digest for most of a game rather than
  leaning on `citizens_test`: a plot lock stands on every seed from t2 (148
  plots at t250) and a pinned specialist on every seed from t116 (45 slots).
- WAR WITH A CITY-STATE stands on 2 of 12 seeds from t142 — 10.1 minor-war
  turns per seed, 108 on the loudest — and one seed closes one through the
  SUE column at t155. The declare, both clocks and the peace are gate-covered;
  the meeting gate, the treaty term and the suzerain refusal are not, and
  `cs_war_test` section d is their bar.
- THE DIPLOMATIC AXIS ENTERED THE GATE, and the probe had never measured it:
  `geo_decide_and_apply` is the serve gate's own call and the probe did not
  make it, so every table above this round was read off a driven game with no
  denouncement in it. Adding the call costs nothing by itself — with the
  diplomatic style off, every row reproduces the old table exactly, which is
  also the proof that the treaty system, the reworked alliance and the closed
  border change no reachability of their own.
- THE DIPLOMATIC AXIS'S THIN ROWS, each poke-covered and none of them
  evidence of a bug:
  - A CLOSED BORDER is STOOD AGAINST on one seed, at t154. The three seats
    barely crowd each other's territory, so the refusal almost never fires
    in-gate and `geopolitics_test` poke i3 stays its real bar.
  - A GREAT WORK is GIVEN on no seed at all. There is something to give —
    12 works across the 12 seeds at t250 against 32 slot buildings — but the
    gift is throttled by the great-person queue's output rather than by its
    own gate (poke i2), and a Great Person now WALKS to a free slot instead of
    filling one at the claim, which is why the count fell.
  - THE DEFENSIVE PACT never drags anyone in. Alliances stand on 9 of 12
    seeds, but a third party has to declare on an ally while the alliance
    runs, and the same style that forms alliances is the one that does not
    fight. Poke i is the bar.
- THE CLIMATE ARC IS REACHED BY NOTHING. No seat's lifetime CO2 ever leaves
  zero in 12 seeds x 250 turns, so no game comes near Phase I: a power plant
  waits on INDUSTRIALIZATION and a supply of its fuel, a unit has to draw one
  of the three strategics every turn, and 250,000 raw units buys a single
  point at this map size. Everything C-24 ships above the per-turn arithmetic
  — the phase ladder, ice melt, flooding, the Flood Barrier, the warmed
  disaster rate, the pollution favor penalty, Carbon Recapture and the Global
  Energy Treaty's two outcomes — is proven by `tests/gpu/climate_test.py` and
  `tests/cpu/map/climate.test.ts` and by nothing else. What the gate does
  cover is that the climate turn runs on every turn of every seed and finds
  nothing to do.
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
- WONDERS FINISH, and the belief that they do not was load-bearing: 55
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
