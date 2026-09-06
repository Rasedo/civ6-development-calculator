# Engine audit — open items

THIS FILE IS A LIST OF OPEN ITEMS. Nothing else belongs in it. A resolved
entry is DELETED, not annotated — what was fixed, when and why is the git
log's job. Everything below is open work, stated against the current
engine by symbol.

**RULES (owner):**
- Every note anchors code BY SYMBOL — function/method/class/exported
  constant — never by line number. Line numbers rot; symbols grep.
- VERIFY-BEFORE-IMPLEMENT: every fidelity claim is checked against a real
  Civ 6 source before implementation — never off residual text, briefs or
  comments. Unverifiable magnitudes are recorded, not invented.
- SOURCE OF TRUTH is real Civ 6. Reachability is never a licence to
  deviate; gates prove the two engines agree, never that they agree with
  Civ 6.
- Every landed mechanic records WHICH lane can reach it. A green gate over
  an unreached mechanic proves nothing.
- NOTHING IS CLOSED BY RECORDING ALONE (owner, 2026-08-19). A fidelity gap
  deferred because a mechanic is unimplemented becomes TWO open items: one
  for the missing mechanic, one for the deferred gap (naming the mechanic
  item as its blocker). "Recorded, not fixed" / "descoped" / "unmodeled"
  are deferrals, never permanent closures.

**Every entry uses one template.** Weight; SHIPPED (what the engines do
today, by symbol); SOURCE (the civilopedia line or the install's XML row
and parameter); BAR (the test lanes that hold it); REACH (what the parity
gate actually enters); OPEN (one bullet per residual, each naming its
blocker or its ask). A field is omitted when the item has nothing under
it.

**State:** P8 training PARKED until this file is clean. The battery is
GREEN end to end (serve: 12 seeds x 250 turns, digest per turn per group).
Restore the seed set to 24 before the final hunt — 12 is a temporary
dev-speed cut. All surviving `_LIVE` master switches are ON
(GOVERNMENTS_ADOPTION, B18_FOLLOWER_COUPLING, CITY_RELIGION_ADDER,
ADMIRAL_MARCH, DEDICATION_PAYOUTS, ENGINEER, BARB_SCOUT_OPENER); no
mechanic is inert behind a flag.

## What is left (owner-requested; guesstimates)

No "% complete" — it needs the weight of everything already CLOSED as a
denominator, and closed entries are deleted here by design, so it could
only ever be a delta chain, and delta chains drift. What replaces it is
the OPEN weight, hand-weighted 1–8 by implementation size, recomputable
from the list below. ONE ROW PER OPEN ENTRY, and no row without an entry.

Seven entries that had no table row (C-64, C-65, C-67, C-68, C-69, C-71,
C-72) carry one at weight 1 each since 2026-09-05; every one is cited by an
open docs/roster_ledger.json row.

| Open item | Weight | What is open |
|---|---|---|
| A-11r the extra policy slots are not compared | 1 | `wonderExtraSlots` / `_wonder_extra_slots` are in neither engine's digest, so a seat holding slots beyond its government's own is uncompared |
| **A. Engine vs engine** | **1** | |
| B-20r tourism tails | 1 | the park rhombus has no canonical vertical |
| B-21r suzerain rows | 1 | the descoped rows each need a whole absent system; Geneva's magnitude is flat where the source scales |
| B-22r World Congress | 1 | the scored-competition catalog holds one row |
| B-24r Ages/governors | 1 | Affluence copies the GROUND, Foreign Investor waits on a minor that accumulates anything, nine promotion clauses on named absent systems |
| B-31r trade-route tails | 1 | plunder gold is a stylization; the course depth is a capacity six; the summed-yield key and one-candidate head are P8-surface |
| B-34r flood tails | 1 | the climate/coastal tails wait on systems that do not exist here |
| B-39r wonder effects still dropped | 1 | two residuals, blocked on B-20r's per-work TYPE names |
| B-51r Encampment residuals | 1 | a capture leaves the district's own pool standing (unsourced either way) |
| B-54r flanking and support vs their own page | 1 | the two stacks a UNIQUE UNIT raises wait on C-26 |
| B-56r the inert promotions | 1 | three of 107 rows name a mechanic neither engine has — sight-blocking, a PATROL order (C-34), and one magnitude the source never published |
| B-61r the Great Person clauses with no carrier | 2 | 10 rows name a mechanic nothing here has |
| B-62r a suzerain improvement's adjacency stops at the wonder tile | 1 | the adjacency half is unsourced either way |
| B-63r the grievance ledger's magnitudes | 1 | the gang-up bar is a heuristic — no source publishes the AI threshold |
| B-66 formations | 1 | the direct-trained formation's strategic-resource charge; an escort formation is a PAIR here; a dragged rider lifts no fog |
| B-67 the district price MODEL | 1 | one progression curve for all where the install splits two, both DLL-side |
| B-D unsourced data values | 2 | channel-blocked government tails, and the shape differences / model tuning no source can close |
| **B. Fidelity vs real Civ 6** | **18** | |
| C-1 POWER | 1 | the accident roll and the decommission projects' score are unpublished |
| C-2 diplomatic agreements | 2 | the mission's mark on the relationship, demand and discuss, Religious 3's pressure clause (buildable now), the queue-front purchase, ALLIANCE_POINTS_FOR_DEAL |
| C-5 strategic-resource stockpiles | 1 | Zanzibar's two exists-nowhere-else luxuries (B-21r) |
| C-16 the spy's second half | 1 | the district a spy should stand on, the buildings Sabotage should pillage, and the model values a published number would replace |
| C-20 the Military Engineer's build list | 1 | the Mountain Tunnel's trade-route gold multiplier has no published magnitude (DLL-side) |
| C-22 the district roster | 1 | the Preserve housing table is a stylization |
| C-26 civilization uniques | 8 | 30 of 34 civilizations seat as plain civilizations; 38 of the ledger's 343 modifiers are open against a named blocker |
| C-31 the nuclear strike's last clauses | 1 | interception has no published roll; the citizens a blast kills; whether a wonder in the blast is pillaged |
| C-33 the Giant Death Robot's remaining abilities | 1 | the five-hex Range is a verb the action space lacks (the Jump's cost is STYLIZED, ruled) |
| C-34 air combat's second half | 2 | Interception, Patrol and Priority Target have no published roll or magnitude; two sources disagree on the Aerodrome's slot count |
| C-35 the drowned ground keeps its record | 1 | what a submerged tile's terrain and feature still lend their neighbours is unsourced either way |
| C-38 a city-state's city develops HALFWAY | 1 | the yields of any of it, and power |
| C-41 nothing places Volcanic Soil | 1 | WHERE the soil lands (and what it does to an improvement) is an open owner question |
| C-45 the queue's depth is a fixed five | 1 | real Civ 6 publishes no queue ceiling; the GPU's is a tensor dimension |
| C-49 named random events | 1 | no event carries a NAME a modifier can key on; the storm's footprint, duration and walk are unmodelled |
| C-59 a generic themed carrier | 1 | only a MUSEUM themes; great works are not held PER HOLDER |
| C-60 no Free City step | 1 | a flipped city goes straight to the highest-pressure seat on both engines |
| C-61 the capital never moves | 1 | `relocatePalace` moves `isCapital` only when the seat holds none; a civ-UNIQUE project has no field |
| C-62 a war TYPE | 2 | two kinds where the install has more, no per-kind civic gate and no post-declaration clock |
| C-64 a seat has no majority religion | 1 | three roster rows wait on the fact; the tie rule needs sourcing |
| C-65 a Great Work of Art carries no object kind | 1 | four SCULPTURE rows have no field to read; decide with C-59 |
| C-67 a diplomatic action has no preference weight | 1 | waits on the self-play decider, not on a carrier |
| C-68 two unique chassis are not in the unit roster | 1 | the Janissary and the Saka Horse Archer |
| C-69 three unique districts, buildings and improvements are absent | 1 | M'banza, Royal Navy Dockyard, Tsikhe, Mission |
| C-71 a building's great-work slots are one table for every seat | 1 | `TRAIT_EXTRA_PALACE_SLOTS` cannot add one; widening is a layout change |
| C-72 a Trader claims no tile it walks over | 1 | the radius is sourced, the geometry it is measured from is not — an ASK |
| C-74 the eruption rate is still stylized | 1 | the install counts eruptions per GAME where this engine rolls per VOLCANO |
| **C. Absent systems** | **37** | |
| **OPEN, TOTAL** | **56** | |

RULE FOR THE NEXT ROUND: when an entry closes, delete its row here in the
SAME commit. When one opens, add a row with its weight and its reason. Do
not add a "done" column back.

Recounted 2026-09-05 against 068ecf39: the seven rowless entries, C-74 and
the new A-11r each took a row; C-47, C-50, C-57 and C-63 lost theirs as
closed; five rows that had no entry (B-61r, B-67, C-31, C-33, C-34) have
one now.

## THE QUESTION LEDGER — genuine open asks, one line each

An entry here is a question the SOURCE under-determines: no civilopedia
line and no install row settles it, and neither engine may ship a branch
until the owner rules. The detail lives in the item's own row — this list
carries none. An entry LEAVES when the owner rules or a primary source is
reached; a ruling is written into the row, not kept here as a question.

1. **C-1 — the reactor's accident roll.** Severities open at ages 10/20/30;
   no source publishes the per-turn probability.
2. **C-1 — the decommission projects' competition score.** A secondary
   source says 100 points; no first-party page states any figure.
3. **C-31 — the nuke's last three cells.** The interception roll, the
   citizens a blast kills, and whether a wonder in the blast is pillaged.
4. **C-35 — what drowned ground still lends.** Does a submerged tile's
   FEATURE keep working for its neighbours, or is the ground stripped?
5. **B-63r — the gang-up bar.** No source publishes the AI's gang-up
   threshold; `GRIEVANCE_GANG` is a tuning knob wearing a sourced unit.
6. **B-66 — a direct-trained formation's strategic-resource charge.** The
   cost multipliers are sourced; the resource charge of the direct order is
   not.
7. **C-41 — where Volcanic Soil lands.** WHERE an eruption's soil lands,
   and whether it may land on an improved tile.
8. **C-45 — the queue's depth.** Five is a capacity choice (the GPU's
   tensor dimension). Is five acceptable, or name a depth?
9. **B-31r — the course's depth.** `ROUTE_CHAIN_MAX` 6 is the same shape of
   capacity choice. Is six acceptable, or name a depth?
10. **C-2 — the queue-front gold purchase.** Refused on both engines; real
    Civ 6 likely allows it with the progress banked, and no source settles
    it.
11. **C-2 — ALLIANCE_POINTS_FOR_DEAL (2).** A row of the install's alliance
    table with no published text behind it.
12. **B-51r — a capture and the district pool.** `city_outer_hp` zeroes on a
    city capture; the Encampment's own pool rides through. No source says
    which is right.
13. **C-72 — what the Cree trade claim's radius is measured FROM.** The
    install gives `GainTileRadius: 3` and nothing says whether it is measured
    from the path tiles, the origin or the destination; on a long walk the
    three differ by most of a continent.
14. **C-64 — the majority-religion tie rule.** A seat can hold two religions
    in equal numbers of cities and no source names the winner.
15. **C-74 — the per-volcano eruption rate.** The install counts eruptions
    per GAME; this engine rolls per VOLCANO, and the conversion needs the
    map's volcano count. Not covered by the 2026-09-04 disaster ruling.
16. **C-20 / C-34 — the Aerodrome's slot count.** Two first-party pages
    disagree (2-then-4 on the Air Combat page, +2 apiece on each building's
    own entry, which reaches 6). Nothing here decides between them.
17. **B-22r — the WORLD'S FAIR competition's Gold tier and scored
    quantity.** Silver and Bronze came back from the source; those two did
    not, and will not be invented.
18. **B-D — Valletta's Walls discount.** The faith-only half ships; the
    reduction has no published magnitude.

RULED AND REMOVED FROM THIS LEDGER (each ruling now lives in its row): C-33
the Jump's cost, C-16 the released spy's level, C-38 the minor's build
pace, C-58 the capture curve and B-66 the merged unit's hit points and
spent turn — the five magnitudes ruled STYLIZED on 2026-09-04; C-74's
three disaster rates (MODERATE / 500 turns, 2026-09-04); C-75's slotting
(a DRIVER decision, 2026-09-04); C-46's pressure scale (the table read
literally, 2026-09-05); and B-20r's park vertical, which is not an ask —
the entry states the implementation that is closer to Civ 6 and ships the
other, so it is a recorded model choice awaiting nothing.

## A. Engine vs engine — where the two implementations can answer differently

THE DIGEST IS THE ONLY INSTRUMENT FOR THIS CLASS — both engines can be
equally faithful to Civ 6 and still disagree with each other. Its green
bounds nothing the gate does not reach, and a round that widens coverage is
worth more here than a round that re-reads the exporter.

- **A-11r. THE EXTRA POLICY SLOTS ARE NOT COMPARED.** Weight 1.
  SHIPPED: since C-75's cutover the digest carries the slotted CARD SET
  (`policiesSlotted`), and `governmentsHeld` and the civics that derive the
  adopted government were already in it.
  OPEN: the extra policy SLOTS a seat holds BEYOND its government's own —
  `wonderExtraSlots` / `_wonder_extra_slots`, the delta a wonder or a
  slot-type conversion (Founding Fathers, Plato's Republic, the Holy Roman
  Emperor) adds — are in neither engine's digest. Two engines can therefore
  disagree about how many slots a seat has while agreeing about every card in
  them, which is the half of A-6r its closure did not cover. The carrier is a
  `policySlotsExtra` manifest row on both engines.
  WHY IT MATTERS: A-5r's divergence lived in exactly this neighbourhood — a
  military slot and the Survey card in it — and surfaced only as one unit's
  banked XP 28 turns later.

WHAT IS NOT A SOURCE OF NEW MEMBERS: a seat asymmetry. Seat 0 rides the same
machinery as every other row, and `tools/gpu/seat_symmetry_check.py` holds
that with both allowlists empty.

## B. Fidelity vs real Civ 6 — shipped mechanics with open tails

- **B-20r. TOURISM TAILS.** Weight 1.
  SHIPPED: works, relics, artifacts, parks, shipwrecks, both museums'
  theming, provenance across capture.
  BAR: `tests/gpu/parks_test.py`, `tests/cpu/culture/parks-theming.test.ts`
  — the gate is thin here.
  OPEN — **a park's ORIENTATION.** Civ 6 fixes the park rhombus's vertical;
  this hex frame has no canonical vertical, so every rhombus is offered.
  A recorded model choice, not an ask.
- **B-21r. CITY-STATE SUZERAIN ROWS.** Weight 1.
  SHIPPED: eleven perks are RULES (`SUZ_EFFECTS`, both engines). Geneva's
  CONDITION ships (`cityStateSuzerainCapitalBonus` / `_suz_capital_mask`,
  peace with every MAJOR).
  OPEN: the remaining catalog rows carry their reason in their
  `CITY_STATE_SUZERAIN_BONUS` entry's `note` — each needs a whole absent
  system (unique improvements/luxuries, a gold-purchase discount, a
  per-district Great Person channel) or is a flat channel standing in for a
  %-scaling. What survives of Geneva's row is the MAGNITUDE alone: +15% of
  the city's Science against a flat +3.
- **B-22r. WORLD CONGRESS RESIDUALS.** Weight 1.
  SHIPPED: nineteen regular resolutions, the DV resolution, emergencies as
  special sessions, the favor tie-break, refund tiers and the ballot wire
  (`congressSession` / `_world_congress`; emergencies in
  `cpu/core/emergency.ts` / `_raise_emergency` and siblings). The
  observation renders the ANNOUNCED slate beside the standing one, the turns
  until it, and whether the DV resolution runs in it.
  - THE CULTURE BOMB WIPES UNFINISHED CONSTRUCTION. SOURCED: "if a Wonder or
    a District is still under construction and it suffers the effect of a
    Culture Bomb, construction will immediately stop and it'll disappear",
    while "a Culture Bomb will not steal completed wonders or districts". The
    claim skips only a COMPLETE build; `wipeConstruction` /
    `_wipe_construction` undo an unfinished one — tile mark, registry entry
    and production item, whose hammers BANK rather than burn.
  - SCORED COMPETITIONS ship as one resolution row whose TARGET names the
    competition, so a second competition is a data row. SOURCED: "players who
    vote in favor of the Scored Competition will compete to contribute to the
    cause" (outcome A opens the window, its own A voters are the field); a
    competition runs 30 turns; "the civilization with the highest score wins
    the Gold Tier rewards ... all civs whose scores fall within the top 25%
    ... win the Silver Tier rewards, and all civs ... within the next highest
    quarter ... Bronze" (`resolveCompetition` / `_resolve_competition`). Era
    floor Modern. CLIMATE ACCORDS is the first row, scored "1 point per turn
    for each CO2 emission less than the highest polluter" (the WORLD's
    highest), paying Gold 2 DV points, Silver 100 and Bronze 50 Favor.
    FOUR DECISIONS, not transcriptions: one competition runs at a time (real
    Civ 6 bounds nothing, and one slot makes the score a comparable plane);
    "CO2 emission" is read as the per-turn RATE, not the lifetime total; the
    podium's tie breaks on the LOWER seat; and the free vote's line (the
    highest polluter refuses what it cannot score) is this model's
    self-interest heuristic, like every AI line in the catalog.
  - LUXURY POLICY, the nineteenth regular row, appended LAST with its own
    'luxury' target kind (the target space is `LUXURY_IDS`' order, the tile
    plane's own). SOURCED: "A: +1 Amenity on duplicates of a Resource. / B:
    This Luxury resource grants no Amenities." B silences the named luxury
    outright, Affluence copies included; A pays one extra full-reach amenity
    round per OWN improved copy beyond the first (`luxuryAmenities` /
    `_luxury_amenities`). TWO DECISIONS: A's REACH rides the machinery's own
    LUXURY_AMENITY_CITIES spread (the published line names no cities), and the
    DUPLICATE count reads the seat's own improved tiles. The game's own
    congress table gives the row NO era window and both engines carry that.
    Free vote: A on the luxury the voter holds the most improved copies of.
  - ARMS CONTROL acts. SOURCED: "A: All players have their weapons of Mass
    Destruction set equal to the target player. / B: The target player loses
    all of their Weapons of Mass Destruction." An inventory is state rather
    than a standing modifier, so `armsControl` / `_arms_control` enforce the
    winning outcome at the session, per device row. Its free vote is a
    self-interest line of this model's own.
  - THE ESPIONAGE PACT ships — "A: All Spies function +2 levels higher for
    the Target Operation. / B: Target Operation is unavailable"
    (`congressPactLevels` / `congressPactBanned` and their `_congress_pact_*`
    twins, on the `SPY_OP_LEVEL` channel nine Espionage promotions use). ONE
    DECISION: the target space is `SPY_OFFENSIVE_MISSIONS`, since no source
    lists what the game offers. Era window Industrial through Atomic, the
    game's own congress table.
  - PEACE DEALS carry terms: "the peaceful resolution of a war involves
    diplomatic negotiations ... You or your opponent may initiate a Peace
    Deal", so a table between two seats at war IS the peace deal and
    confirming it ends the war (`acceptDeal` / `_accept_deal`, both calling
    the one `makePeace` body). The unilateral sue at the war head stays as
    the no-terms case.
  REACH: a ballot on 12/12 seeds, ~5 sessions per seed; rows past rotation
  rank 9 are poke-only (`world-congress.test.ts`, `congress_vote_test`); the
  CITY_STATE emergency trigger is poke-only
  (`tests/cpu/minors/emergencies.test.ts`, `tests/gpu/emergency_test.py`).
  Climate Accords' own reach is unmeasured; `congress_vote_test` and
  `tests/cpu/seats/competition.test.ts` exercise it.
  OPEN:
  - **THE COMPETITION CATALOG HOLDS ONE ROW.** The machinery takes a data row
    per competition; what is missing is the rows. WORLD'S FAIR is blocked on
    its own SOURCE — Silver is 50 Diplomatic Favor and Bronze a free Civic,
    but the GOLD tier and the SCORED QUANTITY did not come back from any
    reachable source and will not be invented (ask). AID REQUEST scores
    members who "send Gold to the target player", which needs a
    gold-to-a-rival scorer no competition reads yet; BORDER DISPUTE,
    CATASTROPHE and MILITARY COMPETITION each want a scored quantity of their
    own. THE NOBEL PRIZE competitions are Sweden-only — blocked on C-26.
  - **CLIMATE ACCORDS SCORES ONLY HALF ITS INPUTS.** The source scores the
    Decommission Coal/Oil/Nuclear Power Plant projects alongside the emission
    gap; those projects have no carrier — blocked on C-1.
- **B-24r. AGES / GOVERNORS TAILS.** Weight 1.
  SHIPPED: twelve dedications, both faces, over the published era windows
  (`DEDICATION_ERAS` / `_ded_eras`). Thirteen DARK AGE cards with their era
  windows, wildcard-only, adoptable only by a seat actually in a Dark Age
  (`computeAdoption(.., dark)` / `_slotted_policies(.., dark, era)`).
  THE GOVERNOR IS A PERSON: seven named agents per seat (`Seat.governors` /
  the `civ_gov_*` planes), each appointed with a Governor Title, seated in
  one city, promoted with further titles. Titles are earned one per each of
  thirteen NAMED civics plus the Government Plaza and every building in it,
  and spent one per appointment and one per promotion
  (`governorTitlesEarned` / `_governor_titles_earned`). Forty-two promotion
  rows carry their governor, tier and prerequisite mask; the DEFAULT ability
  rides the appointment and costs nothing. SOURCED: an establishment clock
  (3 turns for Victor, 5 for the rest) gates every ABILITY while the +8
  Loyalty transfers on ASSIGNMENT; a neutralize clock follows the PERSON, so
  a neutralized governor leaves his city and can be seated nowhere for six
  turns.
  AMANI IS POSTED TO A CITY-STATE. SOURCED (Amani): "Can be assigned to a
  City-state, where she acts as 2 Envoys", and the catalog's `cityStates`
  flag says she is the only one. Posted at the governor phase BEFORE the
  cities are handed out, taking none while abroad; the establishment clock
  runs there as in a city; a neutralize or a conquest sends her home.
  `Governor.minorId` / `civ_gov_minor` are the posting, compared as
  `governorAtMinor` — addressed by the CITY-STATE, so neither engine has to
  name a minor the way the other does. WHICH minor is this model's own line:
  the met, live one where the seat already holds the most envoys, ties to
  the first in the roster. `envoysHere` / `_envoys_here` is the store plus
  Messenger's two, doubled by Puppeteer (she is part of the number she
  doubles). The EFFECTIVE count is what asks who LEADS and what a seat has
  EARNED — both halves of the suzerain contest (`resolveSuzerain`,
  `isSuzerain`, and the levy gate with them), the 1/3/6 bonus tiers, and the
  driver's next-envoy preview; the STORE is what asks about the act of
  SENDING one — the emergency's "must have met and sent an Envoy", the
  first-envoy double, and the Congress's envoy context. The stored answer
  (`CityState.suzerain` / `citystate_suzerain`) is refreshed for the WHOLE
  roster at every position on both engines, because a posting moves the
  contest without touching any one minor's ledger.
  SIX PROMOTION CLAUSES landed off their own sourced sentences — Surplus
  Logistics (`routeStartFood`), Vertical Integration (`industryAllSources`,
  INDUSTRIAL_ZONE rows only), Reinforced Materials (`envDamageImmune`,
  gating `scorch`, the flood's improvement destruction and `floodDistrict`;
  the GPU's `_env_immune` is the OR over the majors and no draw moves),
  Forestry Management (`goldPerFeature` in BONUSES over the tiles the city
  OWNS, and `appealNearFeature` through `cityAppealResolver`), Patron Saint
  (`firstPromoBonus` banked at the FAITH BUY and spent by `takePromotion` /
  the PROMOTE applier, carried per unit as `Unit.promoBonus` /
  `unit_promo_bonus`), and Land Acquisition (`passRouteGold` over the stored
  course, the seat's own routes never counted, plus `borderExpansionPct` 20
  from the game's own governor-promotion table). Grants' "+100% Great People
  points" rides `gppMult` over everything its city GENERATES
  (`governorMult` / `_governor_mult`), the seat-level government and
  Congress factors staying outside it.
  BAR: `tests/gpu/gov_clauses_test.py`,
  `tests/cpu/city/governor-clauses.test.ts`, `tests/gpu/amani_test.py`,
  `tests/cpu/minors/amani.test.ts`, `governor_roster_test.py` poke f, the TS
  `dark-policies` lane, `legacy-cards.test.ts` / `legacy_cards_test.py`.
  REACH: Amani IS reached — seed 9131 posts her and she decides a
  suzerainty inside 250 turns. No seed reaches a governed city holding any of
  the six clauses above, and Grants is a tier-2 Pingala row no scripted lane
  promotes to — poke-only.
  OPEN:
  - **AFFLUENCE COPIES THE GROUND, NOT THE WORKED TILE.** A minor improves
    nothing on this engine (C-38), so requiring the improvement the seat's
    own luxuries require would make the promotion a permanent no-op. Both
    engines copy every distinct luxury RESOURCE in the minor's territory —
    a reading, not a transcription.
  - **FOREIGN INVESTOR HAS NO CARRIER.** "While established in a city-state,
    accumulate its Strategic resources. When suzerain, receive double the
    amount" needs a minor that ACCUMULATES strategic resources, and a minor
    here has no production, no improvement and no stockpile — blocked on
    C-38. No source publishes a rate to stand in for one.
  - **NINE PROMOTION CLAUSES WAIT ON A NAMED ABSENT SYSTEM**: Contractor and
    Divine Architect (no district PURCHASE verb, gold or faith); Renewable
    Subsidizer and Industrialist (C-1's plants and renewables); Air Defense
    Initiative (anti-air units, C-34, and the ICBM, C-31); Arms Race
    Proponent (nuclear armament projects, C-31); Aquaculture and Parks and
    Recreation (the Fishery and City Park improvements, which the
    improvement catalog does not carry); Foreign Investor (above).
  - **NO CARD STYLE ASKS FOR A DARK AGE CARD.** The dark rows are wildcard-
    only and appended last by the wire-index discipline, and the driver's
    three styles are GREEDY (table order), LEGACY-FIRST (the wildcard bench
    goes to the legacy cards) and MILITARY-FIRST (to the military overflow) —
    none of them reaches one. A FOURTH STYLE IS THE CARRIER. MEASURED on a
    forced Dark Age with every civic researched: 8 cards slotted, 0 dark;
    widening the wildcard bench to 40 slots, the same seat takes all 13. Both
    engines agree exactly, so this is REACHABILITY, not a divergence, and the
    pool is proven only by `governor_roster_test.py` poke f and the TS
    `dark-policies` lane.
  - **WHO TO HIRE AND WHERE TO SEAT HIM IS A HEURISTIC, NOT A RULE.** Appoint
    in catalog order, promote the first legal row, seat every idle governor in
    the lowest-loyalty ungoverned city (quantized-milli key, ties by array
    position). Real Civ 6 leaves all three to the player; both engines mirror
    the heuristic exactly, and making them decisions is P8-surface work.
  - Ibrahim is Ottoman-exclusive and therefore C-26's, not an omission here.
- **B-31r. TRADE-ROUTE TAILS.** Weight 1.
  SHIPPED: the Trader unit, sea legs, trading posts, chained reach and the
  whole-destination-set candidate; a city-state's complete Harbor is a
  second water anchor (`centreMaritime`'s minor arm / the maritime plane's
  minor scatter). A route stores its COURSE at commit (`TradeRoute.chain` /
  `seat_route_chain`, statecompare-compared, `routeChain`'s FIFO walk over
  the seat's own posts, first discovery wins). SOURCED (Trading Post):
  "Every Trading Post for your civilization through which a route passes
  along its course adds +1 Gold", and "Each foreign Trading Post also adds
  +1 Gold to the yields of every Trade Route which passes through this city"
  — `routeChainGold` / the `_seat_route_income` chain term pays each live
  course city 1 plus the other civs' posts standing there, and the reach walk
  carries the same depth cap.
  OPEN:
  - `ROUTE_CHAIN_MAX` (6) is a CAPACITY choice, the GPU plane's width — real
    Civ 6 chains posts "and so on" with no published limit. C-45's pattern;
    ask.
  - `PLUNDER_ROUTE_GOLD` (50) is a stylization; no public source names the
    real base magnitude.
  - **The destination is ONE candidate row plus a take/skip.** The single
    summed-yield ranking key is this engine's heuristic and the policy sees
    one candidate — the free-choice head is P8-surface work, alongside the
    route verb joining `env.step`.
- **B-34r. FLOOD TAILS.** Weight 1.
  SHIPPED: the GS flood whole — severity ladder, river reach, river-scoped
  shield, the Dam, the Great Bath's per-flood faith over `Tile.floodCount` /
  `tile_flood_ct`.
  BAR: `flood_severity_test` poke f pins the reach.
  OPEN: climate change ending fertilization at Phase IV, the Egyptian
  ability, the Soothsayer and COASTAL floods all wait on systems that do not
  exist here.
- **B-39r. WONDER EFFECTS STILL DROPPED.** Weight 1.
  SHIPPED: the sourced sweep landed fourteen channels, the Mausoleum's
  engineer charge and Cristo Redentor's shield.
  OPEN, both blocked on the per-work TYPE names B-20r would need: Apadana's
  "+2 Great Work slots (any type)" and the Hermitage's LANDSCAPE-only art
  slots.
- **B-51r. ENCAMPMENT RESIDUALS.** Weight 1.
  SHIPPED: the district holds its OWN outer-defense pool
  (`Tile.encampOuterHp` / `encamp_outer_hp`). SOURCED: one set of Walls
  "supplies both", yet "destroying the one does not destroy the other" — the
  assault and the -17 shot split against it, its own pool gates the `estk`
  strike, the repair project prices and refills BOTH pools (centre first), a
  melee walker ENTERING a shot-emptied district conquers it "as you would a
  City Center" (`stepUnit` / `_step_verb`'s entry hook; a ranged walker only
  OCCUPIES it, and the 20 HP/turn heal re-blocks), and the `estk` target scan
  measures distance 1..2 from the DISTRICT's own tile.
  OPEN — **A CAPTURE LEAVES THE POOL STANDING.** `city_outer_hp` zeroes on a
  city capture; the district's own pool rides through unchanged on both
  engines. No source says which is right; ask.
- **B-54r. FLANKING AND SUPPORT AGAINST THEIR OWN PAGE.** Weight 1.
  SHIPPED: every rule on the page, plus the four higher stacks a promotion or
  Great Person raises.
  OPEN: **the two stacks a UNIQUE UNIT raises** — Zulu's Impi and Macedon's
  Hypaspist raise flanking or support for themselves alone. Blocked on C-26.
- **B-56r. THE INERT PROMOTIONS.** Weight 1.
  SHIPPED: 104 of the 107 catalog rows in `cpu/data/promotions.ts` reach a
  rule.
  BAR: `tests/gpu/promotions_test.py`, `tests/gpu/promo_effects_test.py`,
  `tests/gpu/air_promo_test.py`.
  OPEN — three rows carry `none`, each with its blocker:
  - **SENTRY** ("can see through Woods and Rainforest") — `revealAround` /
    `_reveal_around` reveal a flat radius; nothing blocks sight.
  - **GROUND_CREWS** ("heal while patrolling or deployed") — PATROL is
    C-34's gap, and without it there is no state to heal in.
  - **BOARDING** ("obtain Gold from naval victories") — the Civilopedia
    publishes no magnitude and no other row prices a kill in gold. Waits on a
    source, not on a mechanic.
- **B-61r. THE GREAT PERSON CLAUSES WITH NO CARRIER.** Weight 2.
  SHIPPED: Goddard's visibility grant and Shah Jahan's gold-buyout.
  OPEN: ten rows name a mechanic nothing here has — tourism x4, regional
  range x2, city-state absorption, barbarian conversion, ocean passage, and
  Tupac Amaru's per-district undefended grant walk. Mary Leakey's tourism
  clause has a per-rival bank to read now and still no carrier.
  The ten rows and each one's blocker are the `open: B-61r` rows of
  docs/roster_ledger.json.
- **B-62r. A SUZERAIN IMPROVEMENT'S ADJACENCY STOPS AT THE WONDER TILE.**
  Weight 1.
  SHIPPED: the PRESERVE's bands pay a natural-wonder tile (`tileYields`'
  wonder arm / `_preserve_live`). SOURCED (Grove): the band pays "adjacent
  unimproved tiles" by APPEAL, and a natural wonder is unimproved and
  Breathtaking by construction — `tileAppeal` answers 5. A pantheon's
  `featureYields` clause is VACUOUS there: the wonder stands where the
  feature would, so no feature row exists to pay.
  OPEN — **THE ADJACENCY HALF IS UNSOURCED EITHER WAY.** `tileYields` leaves
  on `tile.wonder` before a suzerain improvement's adjacency add and
  `_tile_add_live` masks the same tiles; no source says whether real Civ 6
  pays it there, so both engines refuse.
- **B-63r. THE GRIEVANCE LEDGER'S UNPUBLISHED MAGNITUDES.** Weight 1.
  SHIPPED: the mechanic is whole — every published row pays, the spread, the
  decay, the favor ladder, PUBLIC RELATIONS.
  OPEN — **THE GANG-UP BAR IS A HEURISTIC.** `GRIEVANCE_GANG` is a tuning
  knob wearing a sourced unit; no source publishes an AI threshold. Ask.
  Enkidu's allied-war discount (EFFECT_ADJUST_PLAYER_ALLIED_WAR_DISCOUNT
  150) waits here.
- **B-66. FORMATIONS.** Weight 1.
  SHIPPED: Corps, Armies, Fleets and Armadas on both engines — one
  `formation` tier per unit (`formationCS` / `_form_cs`, `_form_cs_pool`),
  the FORM_UP head merging a unit into a same-type neighbour (`formUp` /
  `_form_up`), and the strength term on every duel read (melee, ranged,
  bombard, the city and city-state assaults, the stack-defender choice, the
  embarked defence).
  SOURCED (Formations): two of a type make a Corps after Nationalism and
  three an Army after Mobilization (`FORMATION_CIVIC`); the magnitudes are
  the game's own COMBAT_CORPS_STRENGTH_MODIFIER 10 and
  COMBAT_ARMY_STRENGTH_MODIFIER 17; "the experience and promotions of the
  highest experience unit is preserved"; "once a Corps or Army has been
  formed, the units may not be broken apart into individual units again", so
  there is no inverse verb. A direct-trained formation costs
  UNIT_CORPS_COST_MODIFIER 1.5 / UNIT_ARMY_COST_MODIFIER 2.0 of the unit
  (GlobalParameters.xml) — the install's table, which outranks the Military
  Academy's civilopedia prose that `FORMATION_COST_MULT` had taken 2.25
  from. The four Great People who make a formation out of ONE unit ship
  (`GP_ABILITY`'s `formation` clause, `_gp_form_up`): El Cid a Corps,
  Napoleon an Army "out of a military land unit", Gaius Duilius a Fleet and
  Santa Cruz an Armada out of a naval one, asking no civic; the target "must
  be a military unit that is not a Corps or an Army".
  THE QUEUE TIER SHIPS: a city holding the Military Academy (Seaport at sea)
  trains a Corps or Army (Fleet or Armada) outright once the formation's own
  civic is in, at 150% / 225% of the unit's cost and 25% off for the enabling
  building (`FORMATION_COST_MULT`, the `formLo` block, `_q_unit_of`).
  THE ESCORT FORMATION SHIPS (`escortUnit` / `breakEscort` / `inEscort`,
  `_escort_rider` / `_escort_carry_with`, the ESCORT and BREAK_ESCORT
  columns). SOURCED (Formations): "A military unit can create a formation
  with a support or civilian unit at any time"; the formation's Movement "is
  equal to that of the slowest unit that belongs to it"; "all attacks against
  this tile will be absorbed by the military unit of the formation" — already
  the engine's stacking rule (`stackDefender` takes a military unit whenever
  the tile holds one), formation or not. Only the CIVILIAN carries the flag
  and the tile names its escort, so a flag with no military unit beside it is
  not a formation and the rider is free the moment its escort dies. A naval
  hull forms with its PASSENGER, the other half of "Naval military units may
  also create a formation with embarked land units". Two promotions ride it:
  ESCORT_MOBILITY ("Formation units all inherit escort's Movement speed") and
  CONVOY ("+10 Combat Strength when in a formation", Naval Melee behind
  Reinforced Hull and Rutter). Which formation CONVOY's "a formation" names
  is settled by no source — a Fleet is one and so is an escort — and it ships
  as the ESCORT reading BY OWNER DECISION, on the hull carrying a rider
  (`convoyCS` / `_convoy_cs`).
  STYLIZED (owner ruling 2026-09-04): the merged unit keeps the VETERAN's own
  hit points — the same unit whose promotions and experience the sourced rule
  already keeps — and ends its turn. No source publishes either.
  BAR: `tests/gpu/formation_test.py`, `tests/cpu/units/formation.test.ts`
  (the Great Person clause also in `tests/cpu/units/greatPerson.test.ts`),
  `tests/gpu/formation_train_test.py`, `tests/gpu/escort_test.py`,
  `tests/cpu/units/escort.test.ts`.
  REACH, measured: the Corps IS reached — the driver takes FORM_UP, the
  column is offered on 4 of 12 seeds from t211 and a Corps stands on 3 of 12
  from t212, so the gate compares the tier-1 strength term over the last ~40
  turns of those games. The ARMY is not (its civic is Modern). The ESCORT
  column is offered on 12 of 12 seeds from t14 and NO driver ever takes it,
  so the pair, the drag and Escort Mobility are poke-only.
  OPEN:
  - **A DIRECT-TRAINED FORMATION'S RESOURCE CHARGE IS THE UNIT'S OWN.** No
    reached source publishes the STRATEGIC-RESOURCE charge of the direct
    order; it ships at the single unit's charge, the modelled minimum. Ask.
  - **AN ESCORT FORMATION IS A PAIR.** Real Civ 6 links up to THREE units of
    different classes — military, civilian and support. Support units are
    modelled here as civilians and the drag takes ONE rider, so `escortUnit`
    refuses a second flag on a tile rather than leave a member behind.
    Widening it needs a support stacking class of its own and a two-rider drag
    on both engines.
  - **A DRAGGED RIDER LIFTS NO FOG.** `_step_verb` / `stepUnit` reveal around
    the MOVER; the escorted unit arrives without a reveal of its own, which
    matters only where the rider's sight is the wider of the two. It follows
    the carried-aircraft precedent (`_air_carry_with` / `carryAirWith`) rather
    than a source.
- **B-67. THE DISTRICT PRICE MODEL IS ONE CURVE FOR ALL.** Weight 1.
  SHIPPED: the per-row BASE and the per-row under-represented DISCOUNT come
  from the install (`Districts.Cost` and `CostProgressionParam1`), so an
  Aqueduct no longer costs a Campus and the two plaza rows take 25% where
  every other row takes 40.
  OPEN: the PROGRESSION MODEL. The install splits
  COST_PROGRESSION_NUM_UNDER_AVG_PLUS_TECH (the specialty rows, the
  Government Plaza, the Diplomatic Quarter, the Aerodrome) from
  COST_PROGRESSION_GAME_PROGRESS (the Aqueduct, Canal, Dam, Neighborhood and
  the Mbanza); both formulas are DLL-side, and this engine runs the
  tech-driven one for both.
- **B-D. UNSOURCED DATA VALUES.** Weight 2. Swept once; the named
  stylizations are OPEN, not closed. The cpu/data walk fetched every
  magnitude from the GS Civilopedia row by row (wonders, units, both trees,
  buildings, all 49 policy cards, the city-state roster). What remains:
  - **THE GOVERNMENTS' CHANNEL-BLOCKED TAILS.** Every row ships its INHERENT
    bonus and nothing else, re-sourced page by page. One term stays open:
    Democracy's, whose Trade Route to an Ally or Suzerain's city and whose
    alliance points both want ALLIANCES (C-2). The LEGACY bonuses are a
    second catalog and ship as their own Wildcard cards, on the accrual C-63
    records.
    ADOPTION REACHABILITY: `computeAdoption` / `_adopted_gov` take the newest
    unlocked tier on table order, so Oligarchy and Classical Republic are
    adopted in NO game — the two government test lanes' borrowed-row drills
    hold their rows.
  - **THE PER-CITY WAR-WEARINESS SPLIT IS NOT PUBLISHED, and the empire-wide
    rule we implement IS** (sourced: -1 Amenity per 400 WWP,
    `warWearinessPenalty`'s shape). The three
    `WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_*` GlobalParameters are real data
    no source explains; closing this needs the C++ behaviour.
  - `GAME_SPEED` 0.6 (`constants`) — a SHAPE difference: real Civ 6 scales
    cost, yield and turn tables independently per speed.
  - **THE RELIGIOUS FAITH PRICES ARE FLAT.** Every religious infobox ends
    "Faith cost is progressive"; no source publishes the progression (the
    same channel `naturalistCost` names).
  - the BELIEF magnitudes (`religion` header) and the deliberate tuning
    constants in `seats` (its header names them) — stylizations that will
    never close by sourcing; recorded once.
  - the FLOOD SEVERITY split now comes from the install (C-74); what stays
    the model's own in `disasters` is ERUPTION_CHANCE_PER_VOLCANO, held under
    C-74's open half.
  - **VALLETTA'S WALLS DISCOUNT HAS NO PUBLISHED MAGNITUDE** — the
    faith-ONLY half ships (`wallsGoldBlocked`); the reduction has no figure.
    Ask.
  - **THE FAITH RATE FOR A LAND COMBAT UNIT IS INFERRED** — Valletta's page
    publishes the BUILDING rate ("2 Faith for 1 Production",
    `FAITH_PURCHASE_MULT`) and `unitFaithCost` /
    `_seat_faith_unit_candidate` reuse it because no page states the unit
    one.

## C. ABSENT SYSTEMS — the blockers, and the gaps waiting on them

Every entry here was once written down as a decision; each is a DEFERRAL
waiting on a system this engine does not have. The missing system is one
open item, and each gap that names it is another — the gaps are listed
under their blocker so the dependency is readable, and both halves count.

- **C-1. POWER — the emissions and the renewable roster.** Weight 1.
  SHIPPED: the grid, the three plants, the fuel burn, the powered-yield
  splits and Cardiff (`cityPower` / `_city_power_need`). The RENEWABLE half
  and the reactor: the SOLAR FARM and WIND FARM are improvements paying the
  Civilopedia's +2 Power each to the city owning their plot, the
  HYDROELECTRIC DAM's `powerSupply` 6 rides the same channel, and the
  BIOSPHERE multiplies every one by `BIOSPHERE_POWER_MULT` /
  `biosphere_power_mult` (Cardiff's Harbor power is not on the wonder's list
  and is added after). The NUCLEAR reactor carries an AGE (`City.reactorAge`
  / `city_reactor_age`) — SOURCED: "the number of turns that have passed
  since the Power Plant was first constructed, converted to, or last
  recommissioned" — ticking in `resolveSeatPower` / `_resolve_seat_power`,
  cleared with the building, and reset by RECOMMISSION_REACTOR (400
  Production, Nuclear Fission, repeatable, gated on the plant standing).
  THE OFFSHORE WIND FARM SHIPS — "+2 Production", "Provides 2 Power per
  turn", "Must be constructed on Coast and Lake", by Builders, the catalog's
  one `waterOnly` row (`validImprovementsIn`'s water arm / `_imp_water`).
  PREDICTIVE SYSTEMS joins the tree with it: Future era, 2200 Science, "+1
  Production to Quarry, Oil Well, and Oil Rig" (the Oil Rig's share waits on
  an improvement the catalog does not hold), under the Future block's
  recorded convention — the game randomizes Future prerequisites per match,
  so the deepest Information-era nodes stand in.
  BAR: `tests/gpu/power_test.py`, `tests/cpu/city/power.test.ts`.
  REACH: ZERO — no gate lane builds a plant, no scripted lane reaches an
  Atomic-era plant, and the driver's job ladder never walks a Builder onto
  water. Poke-proven throughout.
  OPEN:
  - **THE ACCIDENT ROLL.** The ages that open each severity are published —
    Radioactive Steam Venting, Major Radiation Leaks and Nuclear Meltdown
    become possible at 10, 20 and 30 — but NO SOURCE REACHED PUBLISHES THE
    PER-TURN PROBABILITY. The clock ships; the roll does not. Ask.
  - **THE DECOMMISSION PROJECTS.** "Removes the Nuclear Power Plant and all
    its effects from this city", offered while a Climate Accords competition
    runs, and the Coal and Oil rows beside it. The removal is sourced; the
    COMPETITION SCORE each grants is not — a secondary source says 100 and no
    first-party page reached states any figure, so B-22r's window counts the
    emission gap alone. Ask.
  - **A CITY-STATE'S CITIES ARE NEVER POWERED** — `resolveSeatPower` /
    `_resolve_seat_power` run inside the MAJOR seat loop only. Vacuous while
    it stands (a minor holds no building that asks for Power and no plant
    that supplies one) — blocked on C-38.
- **C-2. DIPLOMATIC AGREEMENTS.** Weight 2.
  SHIPPED: the 30-turn agreement clock, friendship, the alliance with its
  defensive pact, the denouncement, open and CLOSED borders, the Great Work
  gift, the DELEGATION and Resident Embassy, and DIPLOMATIC VISIBILITY, all
  on the wire; the opponent block renders visibility BOTH ways, because the
  GAP is what the combat term reads. SOURCED: visibility is five levels —
  "None, Limited, Open, Secret, and Top Secret" — one per source, DERIVED
  rather than stored (`diploVisibility` / `_diplo_vis`) because every input
  is state both engines already compare: a trade route to that civ, a
  mission, the Printing tech's level with everyone, and the Listening Post or
  the alliance, which "do not add separate Diplomatic Visibility levels".
  What it buys is "Intel on enemy movements", +3 Combat Strength per level of
  the gap to the side that is ahead (`visibilityCS` / `_vis_cs`), at every
  site the barbarian pair-term rides plus theological combat.
  THE NEGOTIATED DEAL: "an 'Accept Deal' button will appear, which will
  confirm the trade that is on the table" — an `offer` parks two bundles and
  the other seat's `accept` moves them both, whole or not at all, every item
  re-validated at that moment (`acceptDeal` / `_accept_deal`). Eight item
  kinds — gold as a lump or per turn, Diplomatic Favor, a lump of a
  consumable resource, a Great Work, a city, a captured spy, Open Borders —
  split as the page splits them: "Sums of Gold, Great Works, Relics,
  Artifacts, and captured Spies are all permanent trades ... Resources and
  gold per turn, however, are temporary, and once the deal has run its course
  you will get them back", on the same 30 turns.
  ALLIANCE TYPES AND LEVELS SHIP, off Expansion1_Alliances.xml's effect
  table. Five types ride the wire (`allyType` beside `ally`), one alliance per
  pair, its TYPE chosen at formation and cleared when the clock runs out.
  POINTS accrue on the pair tick — 1 per turn, "+0.25 for sending at least
  one Trade Route to the ally" and +0.25 for receiving one, QUARTER-points so
  both engines bank integers — and LEVELS land at "80 to reach Level 2 and
  160 more to reach Level 3" on Standard; each alliance pays Favor "per turn
  per level". FOURTEEN of the fifteen effects ship with sourced text: the
  four route halves (+2/+1 Science, Culture, Faith; +4/+2 Gold, sender and
  receiver sides), Cultural 1/2/3, Research 2 ("Every 30 turns", a Eureka for
  a tech the ally "has researched or boosted, but you have not" —
  ALLIANCE_RESEARCH_AGREEMENT 30) and 3, Military 1 (+5 vs common enemies,
  unit-vs-unit) / 2 (shared visibility, and "+15% Production toward military
  units when you or your ally are at war",
  ALLIANCE_INCREASE_PRODUCTION_WHEN_WAR 15) / 3 (a free promotion on trained
  units), Religious 1/2, Economic 2/3.
  THE MODEL'S OWN CHOICES, recorded: points are ONE per-pair pool that
  persists when an alliance lapses; each side's Research 2 Eureka is the
  FIRST qualifying tech in catalog order; the level-3 percentage terms read
  the ally's most recently STORED per-turn output (`sciRate` / `culRate` /
  `tourRate`, compared state) so the two reads never compound.
  BAR: `alliance_levels_test.py`, the dividends block of `agreements.test.ts`,
  `geopolitics_test.py` poke m (every deal item kind).
  REACH, over the driven 12x250 probe: a mission in 12/12 seeds from t4, and
  every visibility level entered — Limited 12/12 from t4, Open 12/12 from
  t105, Secret 9/12 from t115, Top Secret 2/12 from t187. The deal
  protocol's own reach is unmeasured; the round's smoke serve is what proves
  the two engines walk it together.
  OPEN:
  - **RELIGIOUS 3'S SECOND CLAUSE** (bonus Religious Pressure to the ally's
    religion) is SOURCED and UNBUILT: ALLIANCE_RELIGIOUS_PRESSURE ->
    EFFECT_ALLIANCE_PRESSURE_FROM_NO_ALLY_RELIGION, Amount 20, on the owner's
    cities. The table gives the unit nowhere in text; the sibling pressure
    effect (the Bishop's EFFECT_ADJUST_CITY_RELIGION_PRESSURE, Amount 100 =
    "100% stronger") says pressure Amounts are PERCENTS. Since C-46 the
    accumulator is on the install's scale, so the 20% has something to
    multiply — BUILDABLE, still unbuilt.
  - **ALLIANCE_POINTS_FOR_DEAL (2)** is a row of the same table with no
    published text behind it. Ask.
  - **THE GOLD PURCHASE OF THE QUEUE-FRONT ITEM** is refused on both engines
    (`goldPurchasableBuildings` holds the shared reading). Real Civ 6 likely
    allows it with the progress banked; no source in reach settles it. Ask.
  - **A MISSION LEAVES NO MARK ON THE RELATIONSHIP.** The delegation ships —
    "Delegations cost 10 Gold and Embassies cost 25 Gold, which is paid to
    the other leader", one directed mission per pair, indefinite, the Embassy's
    price once Diplomatic Service is in, war kicking both halves out — but the
    page also gives it "a small positive bonus in your relationship with that
    leader", and no source puts a number on it. Two clauses around it are the
    model's own and say so in the code: the refusal reads "a rival worse than
    Neutral will not accept" as the two states the engines can name (a war, or
    a denouncement either way), because there is no opinion scale; and the
    AI's own send is the driver's scan, not a published rule.
  - **DEMAND AND DISCUSS ARE THE OTHER TWO BUTTONS.** A demand is the table
    run one-way under hostility — "select items from their side of the table
    to demand as tribute" — and Discuss asks a leader to "promise to stop
    doing" something: settling nearby, spreading religion, spying, attacking
    your allied city-states. Both run on the same 30 turns. Neither ships: a
    demand needs the relationship scale above, and a promise needs a
    per-subject breach test.
  - **JOINT WAR, JOIN ONGOING WAR, RESEARCH AGREEMENT and ASK-FOR-PROMISE** —
    four agreements the deal protocol can carry, each still needing its own
    effect: a war declared by two seats at once, a seat joining one already
    running, the Research Agreement's unpublished science, and the promise
    above.
  - **A LUXURY HAS NO LUMP TO TRADE.** The screen lists "Strategic and Luxury
    Resources"; C-5's stockpile gives a consumable a quantity, but a luxury
    here is a pure boolean access gate with no amount to hand over. The
    RESOURCE item therefore names a strategic only.
  - THREE READINGS RECORDED, all agreeing by construction and none sourced:
    whether the intel bonus applies to a CITY attack (both engines apply it
    unit-against-unit only); what a table may HOLD (one running deal per
    ORDERED pair, `DEAL_ITEMS` items a side, an offer standing for the turn it
    was made and the one after — real Civ 6 bounds none of the three, and the
    AI's VALUATION is unpublished so it lives in the driver where the engine
    never reads it); and whether a WAR ends a standing deal (both engines let
    a gold-per-turn or resource term run).
- **C-5. STRATEGIC-RESOURCE STOCKPILES.** Weight 1.
  SHIPPED: the bank, the ceiling, the charges, the plant fuel, the heal
  denial and the shortage penalty. SOURCED: the penalty is the game's own
  FLAT 20 — Expansion2_GlobalParameters
  COMBAT_STRENGTH_REDUCTION_INSUFFICIENT_FUEL, shown in the combat preview as
  "-20 Insufficient <resource>" (the wiki's "proportional to the amount
  you're short" was a paraphrase). The upkeep pass marks a slot SHORT when
  the seat's whole bill exceeds the bank (`chargeUnitUpkeep` /
  `_seat_charge_upkeep`), and every strength read of a unit drawing that slot
  takes the 20 (`fuelShortCS` / `_fuel_short_cs`) until the next pass meets
  the bill.
  BAR: `fuel_short_test.py`, `strategic-resources.test.ts`.
  REACH: the driven gate reaches Oil units only in the late hundreds of
  turns — poke-proven, gate reach unmeasured.
  OPEN: **ZANZIBAR'S TWO EXISTS-NOWHERE-ELSE LUXURIES** — blocked on B-21r.
- **C-16. THE SPY'S SECOND HALF.** Weight 1.
  SHIPPED: the Spy, its capacity, the jump, the twelve-mission catalog, the
  counterspy post, the capture roll, the ESPIONAGE promotion class, the
  Espionage Pact's two outcomes (B-22r) and the Listening Post's payload
  (C-2's visibility). The chassis is a CIVILIAN — its own page types it
  "Civilian/Espionage" — so `unitIsMilitary` / `_type_military` is what To
  Arms! pays, and the Spy is outside it. The promotion class is a flat pool
  of seventeen rows with no prerequisites, three drawn without replacement at
  each level (`levelUpSpy` / `_level_up_spy` over the `promoOffer` channel the
  Apostle already had). Nine are one shape — "<mission> as if 2 levels more
  experienced", read by `promoValueFor` / `_spy_op_levels` off the mission's
  own bit — and the other four live rows are Linguist's 25% clock cut,
  Disguise's instant arrival, Quartermaster's +1 level to every own spy from
  home and Polygraph's 1 level off every intruder. Bodyguard of Lies rides
  Disguise's channel.
  THE ESCAPE SEQUENCE SHIPS. SOURCED: a discovered spy "will need to escape
  from the target city" — by Airplane (an Aerodrome, 1 turn home), Boat (a
  Harbor, 2), Vehicle (a Commercial Hub, 3) or on Foot (always, 4), a
  survivor reappearing in the CAPITAL on the existing travel machinery, a lost
  escape splitting captured-vs-killed on the catch odds; ACE_DRIVER carries
  its own sourced figure, "If caught on a mission, have a much higher chance
  of escape (+4 levels)". MODEL VALUES under that sourced ordering: each
  route's base rate (`SPY_ESCAPE_ROUTES`), and the ROUTE CHOICE — the real
  game asks the player, this model takes the fastest route whose district
  stands.
  A RELEASED SPY IS THE SPY THAT WAS CAUGHT — STYLIZED, owner ruling
  2026-09-04. SOURCED: a caught spy is "imprisoned, but not killed", held by
  the seat whose city made the catch, still counted against its owner's
  capacity ("if you've trained the maximum number of Spies possible, you
  cannot train a new Spy to replace one that gets captured"), and traded back
  through C-2's table to arrive "immediately returned to the original owner's
  Capital". No source publishes the level it returns at, so the cell holds
  LEVELS rather than a count (`spyHeld` per owner -> captor; `seat_spy_held
  [B, pw, pw, level]`) and the released spy is spawned at the level it was
  caught at; when one captor holds several the HIGHEST goes home first
  (`releaseSpy` / `_spy_cell_release`). The promotions themselves are not
  carried: a level-3 spy comes back level 3 with no picks made.
  THE SAME-MISSION GATE SHIPS, sourced — "a single city may contain more than
  one Spy, but no two Spies may perform the same Mission in the same city",
  read per OWNER (the one scope a player's own mission list can see), a
  recorded model choice.
  FABRICATE SCANDAL SHIPS — mission thirteen, appended LAST (the mission head
  is the wire and every later verb column derives its base from the list's
  length on both engines): "16 (Standard Speed)" turns at 56% per the
  chassis' own table, performed "in a City-State that you are not Suzerain
  over". On success "all other players lose a number of Envoys determined by
  the Spy's level" — the SHAPE is sourced, the map is not:
  `SPY_SCANDAL_ENVOYS_BASE` + 1 per effective level are MODEL values. A minor
  keeps no cell, so a spy whose escape fails there is killed, never
  imprisoned — a recorded model choice.
  BAR: `spy_test.py`, `spy.test.ts`, `spy_release_level` (both engines).
  REACH: the gate REACHES the spy — Catherine's free Spy at Castles puts one
  on the map.
  OPEN:
  - **A SPY STANDS ON THE CITY CENTRE AND NOWHERE ELSE.** The jump targets
    `city_center` and the mission reads the district registry rather than the
    plot the spy holds, so a counterspy already defends every district of its
    city. SURVEILLANCE ("when Counterspying all city districts are defended,
    and +1 level at districts within 1 hex") ships INERT on that: its first
    half is already true here and its second has no geometry to measure. The
    missing mechanic is a spy that occupies the district it works out of.
  - **SABOTAGE PRODUCTION pillages the BUILDINGS**, per the source, not the
    district; a per-building pillage flag is the difference.
  - **WHAT A LEVEL IS WORTH IS THIS MODEL'S OWN.** The chassis' own mission
    table publishes each operation's DURATION (8 turns, 16 for the Counterspy
    post) and base success RATE (10% Recruit Partisans; 20% Great Work Heist,
    Disrupt Rocketry, Breach Dam; 35% Sabotage Production, Steal Tech Boost,
    Neutralize Governor; 56% Siphon Funds, Foment Unrest, Fabricate Scandal),
    and both engines carry that table per mission. It does NOT publish how a
    LEVEL moves that rate — only that it does, since nine promotions read "as
    if 2 levels more experienced" — nor what a failure costs.
    `SPY_SUCCESS_PER_LEVEL_PCT` and `SPY_CAPTURE_PCT` are those two, beside
    the escape routes' base rates. The Intelligence Agency's success bonus has
    no published figure either.
- **C-20. THE MILITARY ENGINEER'S LAST VERBS.** Weight 1.
  SHIPPED: the Fort, the Airstrip, both routes, the 20% charge, the MISSILE
  SILO (Rocketry, flat land, no plunder) and **"Can clean Nuclear Fallout"**
  (`CLEAN_FALLOUT` / `_rk_clean`, offered to any chassis holding a build
  charge, because the charge is the whole gate the page states). What the
  silo is FOR is C-31's.
  THE MOUNTAIN TUNNEL SHIPS. SOURCED: `IMPROVEMENT_MOUNTAIN_TUNNEL`,
  PrereqTech TECH_CHEMISTRY, built by UNIT_MILITARY_ENGINEER alone, on the
  five mountain terrains, `CanBuildOutsideTerritory`, PlunderType
  PLUNDER_NONE; the behaviour comes from the description — "Acts as a
  movement portal on a mountain range, allowing units to move into it and
  exit from another portal at the cost of 2 Movement. ... Can only be built on
  an adjacent Mountain tile. Cannot be pillaged or removed." ENTERABLE, and
  only that: it rides `gdrJump`'s two sites per engine (`tileFreeForUnit` +
  the pathing arm on TS, the two `_jmp` terms on the GPU) rather than
  `isImpassable`, because FOURTEEN exported flags derive from that predicate
  and a tunnelled mountain must not become workable, campable or farmable.
  THREE MODEL CHOICES, all forced by an action space carrying six DIRECTIONS
  and no target (`EFFECT_MOUNTAIN_PORTAL` carries no ModifierArguments at
  all, so the install settles none of them): the BUILD target is the
  LOWEST-index bare adjacent mountain (`tunnelTarget` / its GPU block) — the
  only improvement whose target is not the builder's own tile; the PORTAL
  exit is the NEXT tunnel on the same range by ascending tile index, WRAPPING
  (`portalExit` / `_portal_exit`), which reaches every portal under repeated
  use where a fixed "lowest" would make one tunnel a hub; and a RANGE is a
  connected component of MOUNTAIN tiles (`deriveMountainRanges`, the flood
  fill `deriveContinents` already runs), baked at export because mountains
  never move.
  BAR: `mountain_tunnel` (7 lanes), `mountain-tunnel.test.ts` (8),
  `engineer_test.py` (every other rule, including lane 9's engineer job mask).
  REACH: ZERO — no seed trains the chassis.
  OPEN: **THE TUNNEL'S TRADE-ROUTE GOLD MULTIPLIER.** "Trade Routes traveling
  through it can multiply the Gold they get from districts at their
  destination" has no published magnitude and is DLL-side.
- **C-22. THE DISTRICT ROSTER.** Weight 1.
  SHIPPED: all eighteen districts with catalog-column effects and sourced
  placement clauses. The Government Plaza's five effect rows all ship, the
  Royal Society's BOOST_PROJECT verb last (`projectBoostCity` /
  `_project_boost_slot`). THE ANY-WORK POOL REACHES ARTIFACTS: artifact room
  is a per-city capacity like the other four kinds (`artifactFree` /
  `_artifact_free` — the museum's own slots plus what is left of the pool),
  the Archaeologist's training gate and the excavation's landing city both
  read it, and the pool's free count debits artifact overflow. The theming
  rule stays the museum's own — it asks that the building STAND, and the
  DOUBLE reaches only the three it holds (`_artifact_theming_counts`), never
  a pool-standing find; the provenance arrays widened to every slot a find can
  stand in (`ARTIFACT_PROV_W`) and statecompare compares the full width.
  BAR: `tests/cpu/city/plaza-buildings.test.ts`, `tests/gpu/plaza_test.py`.
  REACH: the Preserve and Government Plaza ride the gate on 12/12 seeds; the
  CANAL on none (its placement and its naval passage, `canalPassage` /
  `_canal_pass`, are poke-proven only); the Royal Society's building is built
  by no seed of the twelve, so no Builder is ever offered the column.
  OPEN: **THE PRESERVE'S HOUSING TABLE IS THIS MODEL'S OWN** —
  `PRESERVE_APPEAL_HOUSING` / `preserveHousing` state the published ceiling
  at Breathtaking; no source can close the middle.
- **C-26. CIVILIZATION UNIQUES.** Weight 8.
  THE ROSTER IS THE INSTALL'S: 34 civilizations and 38 leaders
  (`CIV_LEADERS`, one row per civilization-leader pair; `Seat.civ` indexes
  the row), the seeder drawing each world's trio so a battery reaches the
  whole list. A seat plays one of the roster's civilizations (`CIV_IDS`,
  `row_civ`) and its leader (`CIV_LEADERS[].leader`, `leaderOf` /
  `_row_leads`); its unique unit, unique infrastructure, civilization ability
  and leader ability ship from the install's own XML (Units, Districts,
  Buildings, Improvements, Traits and their Modifiers).
  THE CENSUS IS docs/ROSTER.md — every trait's modifiers by effect type off
  the XML, 149 effect types over 344 modifiers — and docs/roster_ledger.json
  is the machine-checked ledger behind it, one row per modifier reading
  `shipped` or `open: <blocker>`; `tests/cpu/data/ledger-audit.test.ts` holds
  every open row to a live AUDIT item. 305 of the ledger's 343 modifiers
  ship; the other 38 are each open against a named blocker and the triage is
  complete, with no modifier left untriaged. THIS ENTRY DOES NOT RE-LIST WHAT
  SHIPS — the ledger and ROSTER.md are the record, and a second hand-kept
  copy here rots.
  FOUR CIVILIZATIONS SHIP IN FULL (Rome, Egypt, Norway, Sumeria) with their
  unique units (Legion, Maryannu Chariot Archer, Berserker, Longship,
  War-Cart), unique infrastructure (the Bath, the Stave Church, the Sphinx,
  the Ziggurat), civilization abilities (All Roads Lead to Rome, Iteru, the
  Knarr, Epic Quest) and leader abilities (Trajan's Column, Mediterranean's
  Bride, Thunderbolt of the North, Adventures of Enkidu). The other thirty
  seat as plain civilizations until their batch lands, drawing on the
  cross-roster machinery already built (continents, ban rows, formation
  tiers, per-seat appeal, the Terrace Farm's adjacent-improvement channel,
  `SEAT_BAN_ROWS`, `notFoundedSum` / `_not_founded_sum`, `_district_cap`,
  `_faith_buyable_class`, `progressAhead`, `civ_gp_earned`).
  BAR / REACH: the fixtures seat the drawn trio, so a civilization outside a
  world's draw is unreached by construction; the site census in
  `tests/cpu/seats/combat-rows.test.ts` and `tests/gpu/combat_rows_test.py`
  allowlists the one known unpaid site (a CITY's own ranged strike composes
  its defender without the roster's rows on both engines, in
  `cityStrikeStrength`'s block in `seatPhase`) and fails on any other. The
  driver never orders a Legion's Fort; the engine has no resource
  VISIBILITY, so the Stave Church counts every coastal resource where the
  install counts the visible ones.
  OPEN, each against a named blocker:
  - **THE AGENDAS** — DLL-scored, and neither engine holds an opinion scale.
    (C-67 is the same shape for diplomatic preference weights.)
  - Kristina's auto-theming — C-59. Nkisi's four SCULPTURE rows — C-65; its
    Palace slots — C-71. Philip II's and Mvemba's majority-religion clauses —
    C-64. The Janissary and the Saka Horse Archer — C-68. Mvemba's M'banza
    Apostle arm, England's Royal Navy Dockyard, Georgia's Tsikhe, Spain's
    Mission — C-69. The Cree Trader's tile claim — C-72. Divine Wind's
    hurricanes and Mother Russia's blizzards — C-49. Chandragupta's and
    Robert the Bruce's war-kind terms — C-62. Enkidu's allied-war discount —
    B-63r. The Impi and Hypaspist stacks — B-54r. Zanzibar's luxuries and the
    suzerain rows — B-21r. Poundmaker's shared visibility SHIPPED (C-70).
  - **UNREAD DLL LOGIC, recorded rather than guessed:** whether Trajan's
    grant also fires on a CONQUERED city (the modifier's collection is
    PLAYER_CITIES; founding only ships); whether Iteru's flood AVOID also
    skips the fertility half (the fertility ships); whether the Knarr's Ocean
    clause reaches a TRADER's course (`tradeWaterLevel` stays
    Cartography-gated); the Great Turkish Bombard's ranged strike on a city.
  - **THE ROCK BAND's four unique-district venue clauses**
    (Expansion2_UnitPromotions.xml: Arena Rock reads the Street Carnival,
    Reggae Rock the Copacabana, Glam Rock the Acropolis, Surf Band the Royal
    Navy Dockyard) — each a `BAND_VENUE_BIT` the district does not exist to
    raise; the Dockyard half is C-69's, and a district's granted unit is NAMED
    by its row on both engines where nothing picks the strongest naval unit of
    a class the way `bestTrainableOfClass` picks a land one.
  - **THE GAULS' OPPIDUM, Ambiorix's and Saladin's leader terms, the Nihang's
    embarked CS, America's Film Studio** — rows whose civilization has not had
    its batch.
- **C-31. THE NUCLEAR STRIKE'S LAST CLAUSES.** Weight 1.
  SHIPPED: the strike itself, and C-20's MISSILE SILO under it.
  OPEN, three cells, none closable from a reached source (ask):
  - INTERCEPTION has no published roll (shared with C-34, which owns the
    fighter's side of it).
  - THE CITIZENS A BLAST KILLS wait on a worked-tile selection neither engine
    exposes.
  - WHETHER A WONDER IN THE BLAST IS PILLAGED is unsourced.
- **C-33. THE GIANT DEATH ROBOT'S REMAINING ABILITIES.** Weight 1.
  SHIPPED: every published clause. STYLIZED (owner ruling 2026-09-04): the
  Jump enters the mountain at the HEX'S OWN movement cost — the shipped
  reading stands, and no source publishes the action's cost.
  OPEN: the five-hex RANGE is a verb the action space lacks — the same shape
  as C-20's tunnel target, but no direction encoding reaches five hexes.
- **C-34. AIR COMBAT'S SECOND HALF.** Weight 2.
  SHIPPED: the promotion term in the sortie and the parked weapon's cover.
  BAR: `tests/gpu/air_promo_test.py` (the promotion rows).
  OPEN:
  - **INTERCEPTION BY A FIGHTER** has no published roll. The wiki says only
    that "every Interception does damage to the unit being intercepted", that
    a shot-down plane never lands its attack and a surviving one still does,
    and that a fighter "takes damage for each attempt" — no strength, no
    formula, no cap on attempts. Three invented numbers is what building it
    would cost, so it waits on a source, not on a mechanic. C-31's nuclear
    delivery has the same half.
  - **PATROL** waits on interception in turn: a deployed fighter's whole point
    is the interception it then makes. B-56r's GROUND_CREWS waits on the
    PATROL state.
  - **PRIORITY TARGET** — the Jet Bomber's reach past a stack's military
    occupant to the SUPPORT unit under it. The Civilopedia's Jet Bomber page
    does not carry the ability at all, and the flat "sustains 65 damage" is
    wiki text no session could fetch to quote. Unsourced magnitude, unbuilt.
  - **THE AERODROME'S SLOT COUNT HAS TWO SOURCES THAT DISAGREE.** The Air
    Combat page says an Aerodrome "has 2 slots initially, and can reach 4
    slots after constructing the Hangar and the Airport"; each building's own
    Civilopedia entry says "+2 air unit slots in Aerodrome district", which
    would reach 6. Both engines carry the page's reading (`airSlots` 1
    apiece, `_aerodrome_air_slots` + `_b_air_slots`). Neither number is
    invented, and nothing here decides between them. Ask.
  (Moved out of C-20, whose title never covered these; C-20 keeps the tunnel.)
- **C-35. THE DROWNED GROUND KEEPS ITS RECORD.** Weight 1.
  SHIPPED: sea-ness MOVES — `Tile.submerged` / `tile_submerged` turn a tile
  to open water, and every GPU plane the exporter derives from `isWater` is
  state (`_submerge`). What the sea takes with the ground is the improvement,
  the district, the resource and the ground's own use; what it leaves is the
  MAP's record — terrain, feature and river edges stay underneath. That
  reading is what keeps both engines identical: every ring fact the exporter
  derives reads TERRAIN (`isCoastalLand`, the Seaside Resort's coast, fresh
  water, the Aqueduct's source, district adjacency's WOODS/RAINFOREST/REEF
  sources), so a drowned Woods still lends its neighbours what it always did.
  The ONE neighbour answer that asks `isLand` is `isCoastalWater`, and
  `_submerge` moves it with the wonders that need it.
  OPEN: whether real Civ 6 keeps a submerged tile's feature working for its
  neighbours or strips the ground bare. Unsourced either way; ask.
- **C-38. A CITY-STATE'S CITY DEVELOPS HALFWAY.** Weight 1.
  SHIPPED: the minor BUILDS (`minorBuildPhase` / `_minor_build`) — a
  production pot takes POPULATION points a turn and a fixed ladder spends it:
  Ancient Walls, the district its type names, a Harbor when it sits on the
  coast, then the higher walls. SOURCED: a city-state "will build a district
  within their territory that corresponds to their type". Each item pays the
  rules a major pays — the minor's OWN researched unlock, `canPlaceDistrictIn`
  on its own ground (the lowest legal plot), the district price scaled by its
  own research, and no higher wall over a damaged perimeter. The walls FIGHT:
  both engines' city-state damage sites route through the shared
  `cityDamageSplit`, the tier joins the defense strength, and the conquest
  CARRIES buildings, registry and perimeter into the captured city. The minor
  raises its type district's tier-1 building too, the rung after the district
  in `minorLadder` / `_minor_build`, gated on the COMPLETE district and the
  minor's own unlock. SOURCED (R&F) for the majors' envoy bonuses, which are
  BUILDING-keyed (`cityStateEnvoyBonuses` / the `_citystate_t1idx` scatter):
  the pair Barracks OR Stable at 3 envoys and the ARMORY at 6; cultural tier
  2 is either museum (`CITY_STATE_TYPE_TIER1` / `CITY_STATE_TYPE_TIER2`).
  STYLIZED (owner ruling 2026-09-04): the `minorResearch` pacing — no source
  publishes a rate and no alternative reading exists to prefer. MODEL
  CHOICES, recorded: the LADDER's order, the one-item-a-turn pace, and the
  first pair member of a building pair.
  BAR: `tests/gpu/minor_builds_test.py`.
  OPEN:
  - **THE YIELDS OF ANY OF IT** — a minor's districts produce nothing for the
    minor (its research runs on population, not on the Campus), and a levied
    garrison earns no barracks experience from the building now standing.
  - **POWER** — a minor's cities still draw and supply nothing (C-1).
  - Foreign Investor's accumulating minor (B-24r) and Affluence's improved
    tile (B-24r) both wait on this item.
- **C-41. NOTHING PLACES VOLCANIC SOIL.** Weight 1.
  SHIPPED: the row with the name its page gives ("This land adjacent to a
  volcano has suffered from a previous eruption ... Can receive additional
  yields from environmental effects" — the `fertility` channel the eruption
  already lays down) and no yields of its own. THE CARRIER SHIPS: `addFeature`
  / `_add_feature` plant a feature after t0 on both engines (`feat_id` live
  beside a static `feat_id0`, the yield walk pricing the arrival from
  `featCatalogY`, `statecompare` comparing feature IDENTITY), and
  FIRE_GODDESS's "+2 Faith from ... Volcanic Soil" half pays the turn the soil
  exists.
  BAR: `feature_add_test` / `feature-add.test.ts` — the carrier's whole
  reach, since no rollout path calls it.
  OPEN — **WHERE THE SOIL LANDS.** The eruption laying it on volcano-adjacent
  land is the obvious runtime writer, but every improvement clause in this
  engine reads a featured tile as occupied — a Farm, a Mine and a Seaside
  Resort each ask for `tile.feature === null` — so the paint would refuse
  those three on every tile beside a volcano, and the carrier's own envelope
  refuses a tile already improved. No source reached says Volcanic Soil
  refuses an improvement. ASK THE OWNER.
- **C-45. THE QUEUE'S DEPTH IS A FIXED FIVE.** Weight 1.
  SHIPPED: a city holds `PRODUCTION_QUEUE_MAX` items and refuses the sixth.
  The per-item hammer ledger a CANCELLED entry banks into (`city_item_bank`,
  eight columns per city) is the same class of capacity choice.
  REACH: the driven gate fills queues to the cap by the early hundreds of
  turns, so the refusal itself is exercised.
  OPEN: real Civ 6 publishes no ceiling on its queue, and the number here is
  a CAPACITY choice — the GPU's queue is a tensor dimension (`sim.QD`, the
  last axis of `city_current` / `city_progress` / `city_cost` / `city_qtile`)
  and must be finite, so TS carries the same cap to keep the two engines
  answering alike. Raising it costs one constant and one re-export; removing
  the ceiling would cost the GPU its dense storage. Ask.
- **C-49. NAMED RANDOM EVENTS.** Weight 1.
  SHIPPED: `disasterPhase` floods a river, storms a tile, droughts a region
  and erupts a volcano; units take disaster damage by a single rule.
  SOURCED 2026-09-03/04, the whole event table, and none of it is built:
  - The install decides the storm's FAMILY by the terrain it starts on
    (`RandomEvent_Terrains`): HURRICANE on TERRAIN_OCEAN, BLIZZARD on snow and
    tundra (flat and hills), DUST_STORM on desert, TORNADO on grassland and
    plains. Each family has two severities — CAT_4/CAT_5,
    SIGNIFICANT/CRIPPLING, GRADIENT/HABOOB, FAMILY/OUTBREAK.
  - `RandomEvent_Damages`, every column per severity as a percentage (a
    column absent from a row is zero, not inherited):

    | family | impPill | impDest | distPill | bldgPill | pop | civKill | unitLand | unitNaval |
    |---|---|---|---|---|---|---|---|---|
    | HURRICANE  | 50/100 | 25/50 | 15/50 | 40/100 | 0/15 | 0/20 | 0/100 | 60/100 |
    | BLIZZARD   | 50/100 | 25/50 | 15/50 | 40/100 | 0/15 | 0/20 | 0/100 | 0/60 |
    | DUST_STORM | 75/100 | 35/75 | 20/75 | 60/100 | 0/20 | 0/20 | 0/100 | 0/60 |
    | TORNADO    | 75/100 | 35/75 | 20/75 | 60/100 | 0/20 | 0/20 | 0/100 | 0/100 |

  - `MinHP`/`MaxHP` beside `Percentage` are the damage BAND: 30/50 at
    FLOOD_MAJOR and 50/70 at FLOOD_1000_YEAR, which is this engine's flood
    band exactly. The storms' bands:

    | event | land | naval |
    |---|---|---|
    | HURRICANE_CAT_4        | (none)      | 40-60 @ 60%  |
    | HURRICANE_CAT_5        | 40-60 @100% | 60-80 @100%  |
    | BLIZZARD_SIGNIFICANT   | (none)      | (none)       |
    | BLIZZARD_CRIPPLING     | 40-60 @100% | 40-60 @ 60%  |
    | DUST_STORM_GRADIENT    | (none)      | (none)       |
    | DUST_STORM_HABOOB      | 40-60 @100% | 40-60 @ 60%  |
    | TORNADO_FAMILY         | (none)      | (none)       |
    | TORNADO_OUTBREAK       | 40-60 @100% | 40-60 @100%  |

    The band is 40-60 for every storm row but CAT_5's naval, which is 60-80.
    The milder severity of each family damages no unit at all — the absence of
    a row, not a zero band.
  - `RandomEvents` carries seven more columns per row, all exact:

    | event | sev | hexes | duration | movement | spacing | +/degree | fertilizes |
    |---|---|---|---|---|---|---|---|
    | TORNADO_FAMILY       | 1 |  1 | 3 | 8 | 15 |  0 | no  |
    | TORNADO_OUTBREAK     | 2 |  3 | 3 | 8 | 15 | 50 | no  |
    | DUST_STORM_GRADIENT  | 1 |  3 | 3 | 8 | 15 |  0 | yes |
    | DUST_STORM_HABOOB    | 2 |  7 | 3 | 8 | 15 | 50 | yes |
    | BLIZZARD_SIGNIFICANT | 1 |  7 | 3 | 8 | 15 |  0 | no  |
    | BLIZZARD_CRIPPLING   | 2 | 19 | 3 | 8 | 15 | 50 | no  |
    | HURRICANE_CAT_4      | 1 |  7 | 3 | 8 | 15 |  0 | yes |
    | HURRICANE_CAT_5      | 2 | 19 | 3 | 8 | 15 | 50 | yes |

    `Hexes` is the footprint (1 tile, 3, a radius-1 ring of 7, a radius-2 ring
    of 19), `Duration` 3 means a storm PERSISTS three turns and `Movement` 8
    that it walks while it lasts — this engine's storm is a one-turn stamp on
    a radius-1 disc, which is neither. `ChanceIncreasePerDegree` 50 on every
    severity-2 row is the climate scaling. The FERTILITY column is
    half-modelled: `disasters.ts` says "sandstorms deposit silt", and the
    install agrees for dust storms and hurricanes and disagrees for blizzards
    and tornadoes, which fertilize nothing.
  OPEN:
  - **NO EVENT CARRIES A NAME.** Nothing on either engine keys a modifier on
    an event's family or severity, so Divine Wind's hurricane waiver and its
    double damage to Japan's enemies, and Mother Russia's blizzard pair, have
    nothing to attach to. SOURCED (Divine Wind): "Units do not receive damage
    from Hurricanes. Civilizations that are at war with Japan receive +100%
    unit damage from Hurricanes in Japanese territory", over categories 4 and
    5; Mother Russia's pair is the same shape over significant and crippling
    Blizzards. The carrier is a per-event kind on the disaster roll plus a
    damage multiplier keyed on the tile's owner. Eight modifiers are marked
    open against this item in docs/roster_ledger.json.
  - **THE STORM'S FOOTPRINT, DURATION AND WALK** are none of them modelled
    (one-turn stamp, radius-1 disc, no movement).
  - **THE ENGINE'S STORM PICKS FROM LAND ONLY**, so a HURRICANE cannot start
    where the install puts it until the roll can reach open water.
- **C-59. A GENERIC THEMED CARRIER.** Weight 1.
  SOURCED (Kristina): "Buildings with at least three Great Work slots and
  wonders with at least two Great Work slots are automatically themed when
  they have all their slots filled", and a themed set then pays +100% yields
  and +100% Tourism. The install's two auto-theme rows are exact:
  `AUTO_THEME_AT_LEAST_2_SLOTS` is Amount 2 with `IsWonder: true`,
  `AUTO_THEME_AT_LEAST_3_SLOTS` is Amount 3 with `IsWonder: false`.
  THE TRAP, recorded so nobody ships it twice: her other two modifiers,
  `THEMED_YIELD_MODIFIER` and `THEMED_TOURISM_MODIFIER`, are Amount 100 each
  — and her description promises NO extra yields, only the auto-theming. They
  are the STANDARD theming bonus expressed as player modifiers so her
  auto-themed sets pay it, not a bonus of her own. This engine already
  doubles a themed museum's yields (`THEMING_MULT = 2`), so shipping them as
  a further +100% would pay twice. What the engine genuinely lacks is the
  TOURISM half.
  ENGINES: theming is the MUSEUM's alone — `museumThemed` / `artMuseumThemed`
  and `_museum_themed` / `_art_museum_themed`; the GPU comment says outright
  that "a wonder's art slots sit outside the bonus".
  OPEN — the blocker is a DATA MODEL, not a number. Great works are counted
  per CITY and per KIND (`GW_SLOTS = [2, 3, 1]` is writing/art/music, and
  `gwArtType[]` / `artifactSeats[]` are city-wide parallel arrays); no
  building or wonder declares a slot count, and nothing records WHICH holder a
  work sits in. A rule reading "a wonder with at least two slots, all filled"
  cannot be written until great works are held PER HOLDER — the same gap
  Nkisi's Palace slots wait on (C-71) and the same shape as C-65's object
  kind; decide the three together. Kristina's four modifiers are marked open
  against this item in docs/roster_ledger.json.
- **C-60. NO FREE CITY STEP.** Weight 1.
  SOURCED: a city that revolts for loyalty becomes a Free City, and only later
  joins whoever pulls hardest; Eleanor's leaders skip that step.
  ENGINES: both go straight from the flip to the new owner — `flipCity` calls
  `transferCity(..., 'loyalty collapsed')`, `_seat_loyalty_flips` calls
  `_transfer_city(..., conquest=False)` — handing the city to the non-allied
  living seat with the highest raw pressure, ties to the lowest seat id. So
  every seat already behaves as Eleanor alone should. A FIDELITY gap both
  engines share, not a divergence: the parity gate cannot see it.
  OPEN: the carrier is an ownerless city class plus the turns it sits in one;
  `SKIP_FREE_CITY_ROWS` is sourced and deliberately off the wire.
- **C-61. THE CAPITAL NEVER MOVES.** Weight 1.
  SOURCED (Founder of Carthage): "Can move their original Capital to any city
  with a Cothon they founded by completing a unique project in that city."
  ENGINES: `relocatePalace` / `_relocate_palace` move `isCapital` only when
  the seat holds NO capital (the old one having fallen), and
  `origCapitalSeat` / `civ_cap_tile` are written once at founding and never
  again — which is what the occupied-capital favor penalty and the domination
  check both read.
  OPEN: the clause also needs a civ-UNIQUE project, and `ProjectDef` carries
  no civ or leader field.
- **C-62. A WAR TYPE.** Weight 2.
  SOURCED: the install's DIPLOACTION_DECLARE_TERRITORIAL_WAR and
  DIPLOACTION_DECLARE_LIBERATION_WAR are war KINDS with their own civic
  prerequisite, each granting the declarer a 10-turn buff (Chandragupta +2
  Movement and +5 Combat Strength, Robert the Bruce +100% Production and +2
  Movement).
  ENGINES: exactly two kinds on `seat_warkind` — formal and surprise — decided
  by a casus belli, with no prerequisite of their own and no clock after the
  declaration.
  OPEN: the carrier is a war-kind enum wide enough for the install's list, a
  per-kind civic gate on `declareWar` / `_declare_war_major`, and a per-pair
  countdown the buff reads. Six modifiers are marked open against this item.
- **C-64. A SEAT HAS NO MAJORITY RELIGION.** Weight 1.
  ENGINES: both hold religious PRESSURE per city and a followed religion per
  city, and neither ever asks which religion a SEAT is majority-held by.
  OPEN: three roster rows wait on that one fact and are marked open against
  this item — `TRAIT_CITY_STATE_TOKEN_SAME_RELIGION`,
  `TRAIT_COMBAT_BONUS_OTHER_RELIGION` and
  `TRAIT_GAINS_FOUNDER_BELIEF_MAJORITY_RELIGION`. The carrier is a per-seat
  majority read over its own cities' followed religions, on both engines; the
  TIE RULE is the thing to source before it ships, since a seat can hold two
  religions in equal numbers of cities. Ask.
- **C-65. A GREAT WORK OF ART CARRIES NO OBJECT KIND.** Weight 1.
  SOURCED: CIV6 splits Art into SCULPTURE, PAINTING and RELIGIOUS.
  ENGINES: both model a work's SLOT kind (writing / art / music) and nothing
  finer, so no site can tell one Art work from another.
  OPEN: four roster rows pay only the sculpture half —
  `TRAIT_GREAT_WORK_FAITH_SCULPTURE`, `..._FOOD_SCULPTURE`,
  `..._GOLD_SCULPTURE`, `..._PRODUCTION_SCULPTURE`, all marked open against
  this item. The carrier is an object-kind field on the work itself, written
  where a work is created and read by the four rows — the same shape as C-59's
  theming and C-71's per-seat slots, and it should be decided with them.
- **C-67. A DIPLOMATIC ACTION HAS NO PREFERENCE WEIGHT.** Weight 1.
  SOURCED: CIV6's agenda-style clauses that make an AI PREFER or REFUSE an
  action are DLL-side weightings.
  ENGINES: neither has an AI that weighs diplomatic actions at all — the
  driver decides them.
  OPEN: `TRAIT_BEFRIEND_MINOR_CIV_HOME_CONTINENT` and
  `TRAIT_NO_WAR_MINOR_CIV_HOME_CONTINENT` are marked open against this item.
  A MODEL question rather than a missing field: a preference is only
  meaningful against a decider that has alternatives to weigh, so it waits on
  the self-play direction rather than on a carrier.
- **C-68. TWO UNIQUE CHASSIS ARE NOT IN THE UNIT ROSTER.** Weight 1.
  ENGINES: the Janissary (Ottoman) and the Saka Horse Archer (Scythia) have no
  row in the unit table, so the clauses naming them have nothing to charge:
  `JANISSARY_LOSE_POPULATION_IN_FOUNDED_CITIES` and
  `TRAIT_EXTRASAKAHORSEARCHER`, both marked open against this item.
  SOURCING CORRECTION worth keeping: the Saka Horse Archer is
  PROMOTION_CLASS_RANGED, NOT light cavalry, so a roster row keyed on the
  engine's coarser cavalry class would pay the wrong chassis
  (`engine-class-coarser-than-install`).
- **C-69. THREE UNIQUE DISTRICTS, BUILDINGS AND IMPROVEMENTS ARE ABSENT.**
  Weight 1.
  ENGINES: Kongo's M'banza (district), England's Royal Navy Dockyard
  (district), Georgia's Tsikhe (building) and Spain's Mission (improvement)
  have no row on either engine, so four clauses have nothing to attach to:
  `TRAIT_FREE_APOSTLE_FINISH_MBANZA`, `TRAIT_ROYAL_NAVY_DOCKYARD_NAVAL_UNIT`,
  `TRAIT_TSIKHE_PRODUCTION` and `TRAIT_MISSION_IDENTITY_PER_TURN_MODIFIER`,
  all marked open against this item.
  OPEN, a second gap of the Dockyard row's own: a district's granted unit is
  NAMED by its row on both engines, and nothing picks the strongest naval unit
  of a class the way `bestTrainableOfClass` picks a land one.
- **C-71. A BUILDING'S GREAT-WORK SLOTS ARE ONE TABLE FOR EVERY SEAT.**
  Weight 1.
  ENGINES: `GW_SLOTS` gives each building its slot count globally, and no site
  asks the SEAT how many slots its own copy has.
  OPEN: `TRAIT_EXTRA_PALACE_SLOTS` (marked open against this item) cannot add
  one to a Palace. The carrier is a per-seat override read wherever the slot
  count is read; the trap is that the count is baked into the wire and into
  the GPU's slot geometry, so widening it is a LAYOUT change, not a lookup
  change (`append-shifts-derived-layouts`). Decide with C-59 and C-65.
- **C-72. A TRADER CLAIMS NO TILE IT WALKS OVER.** Weight 1.
  ENGINES: trade routes move gold and yields between two cities and never
  touch tile ownership, so `TRAIT_TRADE_GAIN_TILES_EN_ROUTE` (marked open
  against this item) has no hook. The route's WALK exists on both engines
  already — the road-laying leg computes it — so the path is there and only
  the claim is not.
  SOURCED, except one field: `EFFECT_ADJUST_PLAYER_TRADE_GAIN_TILES_EN_ROUTE`
  carries `GainTileRadius: 3`, on `TRAIT_CIVILIZATION_CREE_TRADE_GAIN_TILES`
  (the CREE, so it is the civilization's clause and not Poundmaker's). The
  page text — "Trade Routes claim unclaimed tiles they pass through" — says
  WHAT is claimed and the install says the radius is 3, but nothing says what
  that radius is measured FROM: the path tiles, the origin, or the
  destination. On a walk of any length those three differ enormously (3 from
  every path tile is most of a continent).
  OPEN: the amount is sourced and the GEOMETRY is not, which makes this an
  ASK rather than a build. It must not ship on a guess.
- **C-74. THE ERUPTION RATE IS STILL STYLIZED.** Weight 1.
  SOURCED: `RandomEvent_Frequencies` publishes an `OccurrencesPerGame` for
  every event at each of five `RealismSettingType` levels (MINIMAL, LIGHT,
  MODERATE, HEAVY, HYPERREAL).
  OWNER RULED 2026-09-04: model REALISM_SETTING_MODERATE and divide
  OccurrencesPerGame by the STANDARD game length — 500 turns, the span the
  install's count is written over (this engine plays 250 of them and sees half
  a game's worth). SHIPPED on that ruling 2026-09-05, the wire carrying all
  four so both engines moved together: FLOOD_CHANCE 0.05 -> 0.009 (4.5 per
  game), FLOOD_SEVERITY_P [0.6, 0.3, 0.1] -> [0.44, 0.33, 0.22],
  DROUGHT_CHANCE 0.02 -> 0.056 (MAJOR 23 + EXTREME 5, summed because this
  engine has one drought kind), STORM_CHANCE 0.04 -> 0.112 (every family and
  severity summed, because this engine's storm has neither — C-49 takes each
  family's own row from the same table when it lands).
  OPEN — **ERUPTION_CHANCE_PER_VOLCANO IS NOT COVERED BY THE RULING.** The
  install counts eruptions per GAME where this engine rolls per VOLCANO, and
  the conversion needs the map's volcano count. Ask.
## Harness — not weighted (this file prices fidelity)

- **THE DRIVER NEEDS A REAL STYLE MECHANISM.** Today a style is one boolean
  read at a single `if` inside `pick_research`; adding one style meant a rank
  refactor of `pick_production` that was reverted with the style it served.
  What it should be: NAMED KNOBS with defaults that reproduce today's picks
  exactly (research depth, production tier order, war appetite, expansion
  appetite, faith/culture lean, naval lean); PRESETS built from the knobs,
  assignable per actor as data; an ASSIGNMENT POLICY off the existing
  per-(seed, seat) stream or an explicit table; CLI selection on the probe and
  the gate. The bar is the probe diff: a preset earns its place by ADDING rows
  without losing any.

## Appendix — closed this round (the lesson only)

These entries are CLOSED. They are kept for one round as a divergence-class
index; the full narrative is in the git log, and the durable lessons are in
the memory files this appendix names. Delete a bullet once its class is
mirrored in memory.

- **A-12r. The Amazon counted a CHOPPED rainforest. CLOSED 2026-09-06.** The
  GPU's feature-appeal term read `feat_id == fi` bare, and `feat_id` keeps a
  chopped tile's old id; the strip flag is the live `n.feature` read TS does.
  Latent from C-50 until a Preserve stood on a stripped rainforest beside a
  Brazilian tile and its Grove band paid the wrong tile (seed 9014 t198, the
  worked-tile pick). Lesson: every bare `feat_id ==` read needs the strip flag
  or `_feature_live`; the census of the others was clean. Lane: `feature_appeal`
  step 6.
- **A-10r. A gold-bought strategic unit paid its resource on the GPU and not
  on TS. CLOSED 2026-09-05.** TS's seat-phase `buy` kind-2 arm spawned the
  unit and never called `chargeUnitResource`, though `purchaseUnit` beside it
  does — CIV6 (GS): a strategic unit pays "the moment you purchase it". Bar:
  `gold-buy-resource` (TS) and the GPU side under the serve gate. Class:
  two-composers-of-one-fact.
- **A-9r. A ranged hit on a stacked hex went to the first-listed fighter on TS
  and to the hull on the GPU. CLOSED 2026-09-05.** SOURCED (Flanking and
  Support): the higher-Combat-Strength unit of a hull-plus-passenger stack
  defends a ranged attack. The engines parted on the TIE — TS scanned from
  `fighters[0]` (tile-array order, a TS-only fact) where `_stack_fold` takes
  the passenger only on a strict `>`. `stackDefender` now starts from the hull.
  Bar: `stack-defender-tie` (TS), `stack_defender_tie` (GPU). Class: no rule
  may break a tie on an order only one engine owns.
- **A-8r. A cityless seat's governor phase ran on the GPU — but only in a
  batch. CLOSED 2026-09-05.** `_governor_phase` gated on `civ_alive`, which a
  cityless seat still satisfies, where TS's `seatPhase` `continue`s such a seat
  before `governorPhase`. At B=1 the batch-wide early return hid it. Bar:
  `governor_cityless` (two games). Class:
  start-state-invalidates-liveness — `civ_alive` is not "has a city", and only
  a batch can tell them apart.
- **A-7r. A bankruptcy tie went to the lowest unit id on one engine and the
  lowest slot on the other. CLOSED 2026-09-05.** A converted barbarian keeps
  its old id on TS and takes a fresh slot on the GPU, so "lowest id" and
  "lowest slot" part for a RE-SEATED unit. TS now ties on the earliest in
  `state.units` — spawn order, the one order both engines own. Bar:
  `bankruptcy-tie` (TS, 2), `bankruptcy_tie` (GPU, 3). Class: any TS rule that
  orders units by `id` is suspect the moment a re-seat path exists.
- **C-63. A legacy bonus accrues time. CLOSED 2026-09-05 — C-73 spends the
  accrual on every one of the nine channels.**
  SOURCED — the install spells "legacy" as ACCUMULATING. Nine
  `MODIFIER_PLAYER_GOVERNMENT_ACCUMULATING_BONUS` modifiers in
  `Governments.xml` each take three arguments — `BonusType`, `Increment` and
  `Interval` (`ScaleByGameSpeed`):

  | government | bonus | increment | interval |
  |---|---|---|---|
  | OLIGARCHY          | COMBAT_EXPERIENCE   | 1 |  5 |
  | MONARCHY           | ENVOYS              | 1 | 10 |
  | DEMOCRACY          | DISTRICT_PROJECTS   | 1 | 10 |
  | FASCISM            | UNIT_PRODUCTION     | 1 | 10 |
  | CLASSICAL_REPUBLIC | GREAT_PEOPLE        | 1 | 15 |
  | MERCHANT_REPUBLIC  | GOLD_PURCHASES      | 1 | 15 |
  | THEOCRACY          | FAITH_PURCHASES     | 1 | 15 |
  | AUTOCRACY          | WONDER_CONSTRUCTION | 1 | 20 |
  | COMMUNISM          | OVERALL_PRODUCTION  | 1 | 20 |

  The accrual is +1% per Interval turns held, permanent once earned, with no
  cap in the XML — those three argument names are the whole modifier. The
  community's independently-reported "+1% every 20 turns on Standard" for
  Autocracy matches the row exactly. SOURCED (Founding Fathers): "Earn all
  government legacy bonuses in half the usual time" — the interval halved.
  SHIPPED: `GovernmentState.govTurns` / `civ_gov_turns` count turns held per
  government per seat, written on the SAME line as `governmentsHeld` under the
  same condition (deliberately: `|=` is idempotent and hides a gating
  difference where a counter shows one at once), gated on `active` so a
  cityless seat banks nothing. `legacyBonusPct` / `_legacy_pct` is the one
  composer on each side, and the rate divides the interval rather than
  multiplying the result so the two readings agree at every increment.
  BAR: `legacy-accrual` (5 lanes), `legacy_accrual` (6, including the
  per-game batch guard), plus a 250-turn-shaped single-seed serve.
  REACH: 64 government-turns banked over 30 driven turns across three seats.

- **C-73. A legacy card pays the whole government. CLOSED 2026-09-05 — nine of
  nine channels ship, and the driver's legacy-first style reaches them.**
  `cpu/data/policies.ts` synthesised one wildcard card per government with
  `effects: g.effects`, the government's WHOLE inherent bonus. SOURCED: each
  government names exactly ONE `BonusType` in its
  `MODIFIER_PLAYER_GOVERNMENT_ACCUMULATING_BONUS` (C-63's table), and the
  legacy a seat keeps after switching is the accumulated percentage against
  that one thing — Fascism's card paid +5 Combat Strength and -15% war
  weariness where the install pays +N% unit production for N = turns held /
  10. `legacyEffects` / the GPU's payout switch map each BonusType to its
  channel: wonderConstruction and unitProduction to a synthesized `prodBoost`,
  overallProduction to the production `yieldMult`, districtProjects to
  `projectProdMult`, greatPeople to `gppMult`, combatExperience to `xpPct`,
  envoys to an `influenceMult` over the ONE envoy accrual sum, and — last —
  goldPurchases and faithPurchases through `goldPrice` / `faithPrice` and
  `_gold_price` / `_faith_price`, ONE composer per purse per engine, applied
  where every purchase is priced AND paid (a building, a unit, a settler, a
  worship building, a religious unit, the Monumentality civilians, a
  Naturalist, a Rock Band, a class building, and the driver's affordability
  twins on both sides). READING recorded: an upgrade, a tile and a patronage
  are not "purchases" in the card's sense and pay full price. Every mapping is
  corroborated twice — the install's own Increment/Interval, and the
  community's reported percentages. The nine `TRAIT_*_BONUS_RATE` ledger rows
  ship with it. Bar: `legacy-discount` (TS) and `legacy_accrual`'s discount
  case (GPU) — a stored Merchant Republic legacy at 30 turns prices a
  100-gold purchase at 98, Theocracy's the faith one.
  REACH: REAL — the driver's legacy-first style slots a legacy card in play,
  so the channels are paid on a driven seat rather than in a poke alone.
  TWO LESSONS. The GPU memo had to take the CLOCK into its key: `_gov_mods`
  compared five inputs and a legacy payout is an ACCRUAL, so the answer moves
  on a turn when none of the five do and the bonus would have frozen at its
  first value — the memo-key class, caught before it shipped. And the
  reachability flip (C-75) exposed the GPU paying a legacy card's TABLE ROW,
  this item's own error, beside its accrual: the ordinary channels read the
  cards minus the legacy ones now, as `legacyEffects` always did on TS.
- **C-75. No legacy card is ever slotted. CLOSED 2026-09-05 — the slotting is
  the driver's decision, and its legacy-first style slots them.** The greedy
  fill walked the catalog in order with the legacy and Dark Age cards appended
  last, so an earlier card took every slot: zero legacy cards with every civic
  researched and every government held, on both engines. SOURCE: real Civ 6
  does not fill slots greedily — the PLAYER chooses. OWNER RULED 2026-09-04:
  the slotting becomes a DRIVER DECISION on the wire. Shipped in three steps —
  the stored set (`Seat.government.policies` / `civ_policies`), the cutover
  (the store is what both engines pay from; every reader goes through
  `slottedPolicyIndices` / `_seat_slotted`; the record key is validated whole
  by `fitPolicies` / `_policy_set_ok`), and the STYLES: `ladder.pick_policies`
  takes a per-seat card style — GREEDY, LEGACY-FIRST (the wildcard slots go to
  the unlocked legacy cards first) and MILITARY-FIRST — from the seat's preset
  (`warlord` = military) or one persistent per-game draw (salt 10, 34/33/33).
  These are DRIVER styles, harness rather than fidelity: real Civ 6 leaves the
  choice to the player, and these are three players. Bar: `policy-store` /
  `policy_store`, and the reachability lanes flipped — `legacy_accrual` shows
  the legacy-first style slotting a card the store accepts and the effects
  read, the greedy style none; `legacy-accrual` stores AUTOCRACY's legacy under
  another government and reads the accrued 2% back.
  THE LESSON, and the reason a reachability flip is worth a serve: the FIRST
  serve down the newly reached path paid for two GPU forks the gap had hidden.
  `_seat_city_produce` broadcast a legacy card's per-game percent against its
  flat city rows — a shape error invisible at B=1 and wrong at B=2 — and
  `_gov_policy_mods` paid a legacy card's TABLE ROW, the government's whole
  package (C-73's own fault), beside its accrual: seed 9209 t131, +1.05 on
  every yield of a legacy-first seat. The ordinary channels read the cards
  minus the legacy ones now, as `legacyEffects` always did on TS. An
  unreachable mechanic is an untested one, and the two classes are the
  familiar pair — a per-game scalar broadcast into a per-row shape, and two
  composers of one fact where only one engine excluded the special row.
- **A-6r. The slotted policy cards are not compared. CLOSED 2026-09-05.**
  `governmentsHeld` and the civics under it were in the digest and the CARDS
  a seat slots were not, which is where A-5r's divergence lived unseen for 28
  turns. Closed by C-75's cutover: the stored SET is what both engines pay
  from and `policiesSlotted` compares it — the SET, not the slot POSITION,
  which is a fact neither engine owns. The closure covered the CARD set only;
  the extra policy SLOTS half went to **A-11r**. Class: a divergence with no
  manifest field surfaces many turns later as something else entirely.
- **A-5r. A narrowed XP award read another game's roster. CLOSED 2026-09-04.**
  `_battle_gain` multiplied by `_recon_xp_mult` / `_suz_xp_mult`, both ending
  in `tab.gather(1, seat.unsqueeze(1))` — a gather along dim 1 with a NARROWED
  index reads batch rows 0..n-1. Fixed by threading `rows`; the four per-seat
  gathers now assert a batch-wide index when no `rows` is given. Bar:
  `narrow_batch_xp` (5). Class: narrow-batch-gather. It also opened A-6r.
- **A-4r. A route coming IN was paid only while a route was going OUT. CLOSED
  2026-09-05.** `_seat_route_income` returned None for a seat with no outgoing
  route and held that exit open for one destination-side row; Radio Oranje's
  incoming-route Culture sat behind it. Fixed by deriving the exemption from
  the rows. Bar: `incoming-route` (4), `incoming_route` (6). Class:
  rows-behind-an-early-return.
- **A-3r. An engineer walked to a rail site. CLOSED 2026-09-04.**
  `_seat_engineer_job_mask` read `~road | ~railroad` where TS's twin carries no
  rail arm; the GPU now reads `~road`, which is exactly `canBuildRoad`. Bar:
  `engineer_test` lane 9. Class: driver-twin-mirrors-mask.
- **A-2r. A naval unit was born a Movement short. CLOSED 2026-09-04.**
  `spawnUnit` rebuilt a fresh unit's pool by hand and missed three terms
  `unitFullMoves` carries; it calls the composer now. Bar:
  `spawn-pool.test.ts` (3). Class: two-composers-of-one-fact.
- **C-46. Religious pressure is on the install's scale. CLOSED 2026-09-05.**
  Every term off GlobalParameters.xml — the adjacent-city distance 10 and per
  turn 1, HOLY_CITY_PRESSURE_MULTIPLIER 4, HOLY_SITE_PRESSURE_MULTIPLIER 2,
  ATHEISM_PRESSURE_PER_POP 50, HOLY_CITY_PRESSURE_PER_POP 200 at founding,
  STRENGTH_MULTIPLIER 200 on a full-health Spread (x1.5 Scripture),
  COMBAT_VICTORY 250, UNIT_CAPTURE 125 — and a city FOLLOWS the religion
  holding MORE THAN HALF of its total pressure with the baseline
  (`followedReligionOf` / `_followed_religion`, ONE composer per engine). TWO
  READINGS recorded, not sourced: the x4 and x2 do not stack (the larger
  applies), and a city presses ITSELF. Bar: `religion-trade`,
  `suzerain-rules`, `religion2`, `religion_gp`, `rock-band` / `rock_band`,
  `missionary`.
- **C-47. Tribal villages. CLOSED 2026-09-04.** The install's own reward table
  runs on both engines, sourced entire from `GoodyHuts` + `GoodyHutSubTypes`;
  the draw is a kind uniformly among those with an eligible subtype, then a
  subtype by weight (`drawGoodyReward` / `_draw_goody_reward`). Villages are
  ON in the seeder (240 over the 24 fixtures) and REACHED — 18 claims spanning
  11 of 24 subtypes over four seeds x 250 turns. Epic Quest's clause ships
  with it (`TRAIT_BARBARIAN_CAMP_GOODY`: the install says the camp IS a
  village for Sumeria), both call sites sharing one payout body
  (`drawAndPayGoody` / `_draw_and_pay_goody`). Class: rows-behind-an-early-
  return, three times over — the exporter refused a hut-carrying world, `camp`
  baked `!t.goodyHut` at export, and `Tile.goodyHut` was excluded from
  statecompare.
- **C-50. Appeal is map-global. CLOSED 2026-09-04.** SOURCED (Amazon,
  TRAIT_AMAZON_RAINFOREST_EXTRA_APPEAL): "Rainforest tiles provide +1 Appeal
  to adjacent tiles, instead of the usual -1" — EFFECT_ADJUST_FEATURE_APPEAL_
  MODIFIER on FEATURE_JUNGLE with Amount 2 (the engine spells the install's
  JUNGLE as RAINFOREST). It needed no per-seat plane: `cityAppealResolver` /
  `_gp_appeal_plane` is keyed by the tile's OWNER and already reads
  neighbours. An UNOWNED tile takes none of it, which is right for all four
  consumers. Bar: `feature_appeal` (5), `feature-appeal.test.ts` (4).
- **C-56. A trade route's religious pressure. CLOSED 2026-09-05.** SOURCED
  (GlobalParameters): RELIGION_SPREAD_TRADE_ROUTE_PRESSURE_FOR_DESTINATION 1.0
  and _FOR_ORIGIN 0.5; Dharma doubles both ends (Amount 100). Keyed by the
  RECEIVER so the Citadel of God and Religious-alliance masks apply as to city
  pressure; the accumulator is an integer, so the half-point lands on EVEN
  turns (`routePressureShare` / `_route_pressure_share`). Bar: `route_pressure`
  (GPU), the route case in `religion-trade` (TS).
- **C-57. One follower belief per city. CLOSED 2026-09-03.** SOURCED (Dharma):
  "Receives Follower Belief bonuses in a city from each Religion that has at
  least 1 Follower." `followerReligionsForCity` feeds `withFollowerBelief` a
  LIST and `_fol_tab_for` sums the belief table over each present religion.
  Both engines model PRESSURE rather than followers, so "at least 1 Follower"
  stays "a religion with pressure here". Bar: `all_follower_beliefs` (6 each).
  Class: rows-behind-an-early-return — the whole carrier had shipped and the
  missing half was the QUANTIFIER.
- **C-58. A defeated cavalry unit may be captured. CLOSED 2026-09-05, the
  curve STYLIZED by owner ruling 2026-09-04.** SOURCED: the permission
  (`TRAIT_CAVALRY_CAPTURE_CAVALRY_MODIFIER`, CanCapture true), the strength,
  and COMBAT_BASE_CAPTURE_STRENGTH_DIFFERENCE 20. The DLL's curve through that
  number is unreadable, so it is this model's, anchored on the sourced base:
  `pct = round(50 + 5q / 20)`, certain at +20 and nothing at -20. STYLIZED
  beside it: `CAPTURED_UNIT_HP` 25, promotions/experience/formation kept, a
  passenger at sea never captured. Bar: `capture_cavalry` (both engines).
  REACH: no fixture seats Genghis Khan, so the lanes are the whole bar.
- **C-66. No unit carries a levied mark. CLOSED 2026-09-04.** `Unit.levied` /
  `unit_levied`, set at the levy, PERMANENT, in the statecompare digest. Both
  modifiers pay: `LEVY_UNITUPGRADEDISCOUNT` (75% off upgrading a levied unit —
  the row had shipped and nothing read it) and `LEVY_UNITS_GRANT_ABILITY`
  (ABILITY_THE_RAVEN_KING: EFFECT_ADJUST_UNIT_MOVEMENT 2 and
  EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER 5). The levy RE-POOLS the unit after
  marking it, or it is born two Movement short (A-2r exactly). Bar:
  `levied_upgrade` (6), `levied-upgrade.test.ts` (8).
- **C-70. An alliance carries no shared visibility. CLOSED 2026-09-04.**
  SOURCED (Poundmaker): EFFECT_ADJUST_PLAYER_ALL_ALLIANCES_PROVIDE_SHARED_VIS
  with `ShareVis: true` — a boolean, read as MUTUAL. It lands inside
  `revealAround` / `_reveal_around` rather than a new phase step, which makes
  it turn-exact and seat-order independent; the discovery EVENT is
  deliberately left behind (an ally merely SHOWN a natural wonder earns no era
  score). Bar: `shared_vision` (6), `shared-vision.test.ts` (6); `explored` is
  in the digest. Class: verify the carrier before building — this is
  `Seat.explored`, NOT the Listening Post's diplomatic-visibility levels.

## Appendix — working notes

Process, not gaps — kept out of the weighted chapters.

**Hunt discipline.** Scripted-reachability first (the digest gate names the
turn), checkpoint-bracket from the nearest earlier checkpoint (validate a
resume against a fresh run the first time it is trusted for a diagnosis),
full fresh gate for any behaviour-changing fix. One battery at the round's
end, never per fix.

**How to read a battery red — A POKE RED.** The recurring shapes, each of
which reads exactly like an engine red until checked:
- **The auto-decision premise.** The engines are decision-free: a buy, a
  strike, a queue pick or a spread is an ORDER the applier re-validates, never
  something `_seat_phase` chooses. A lane that steps and waits is waiting for
  nothing — stash the intent (`apply_seat_actions`, the order helpers in
  `tests/gpu/warmup.py`) and assert the validation.
- **The registry confound.** Districts are read off the city REGISTRY
  (`city_dist_tile`), never the tile plane; a scene must write both, as a real
  completion does.
- **The stale index space.** Appliers take the ROW and RANKED orders over
  `_seat_slot_map`; a test speaking the dead civ-index or raw pool-slot
  convention lands its orders on the wrong seat or unit and no-ops.
- **The wrong resolver.** `_hostile_ranged_strike` scopes out major-vs-major
  by design; that pairing is `_ranged_attack`'s.
- **A stale cache under a poke.** Writes that the engine always pairs with
  `_eff_version += 1` must be paired in a poke too, or the mask serves the
  pre-poke world.

**A TS-SUITE RED, same triage.** The battery tail only ever shows the last
failing file; run vitest directly for the full list. The TS-specific shapes:
- **Founding under `unitsMode` needs a settler on the tile** — `settleAt`
  (tests/cpu/helpers.ts) is the scene helper.
- **The actor loop skips a CITYLESS seat** (`seatPhase`) — influence, favor,
  upkeep/bankruptcy and quest issuance all live inside it.
- **Rules that live IN the seat phase**: city strikes (`cstk`/`estk`), city
  healing, influence-to-envoy conversion.
- **The scripted adoption** (`computeAdoption`): modifiers read the adoption,
  a pure function of civics — `setPolicy`/`setGovernment` write a store
  nothing reads in a driven game.
- **One seat model**: `isCiv(0)` is true; a fake seat `{ id, atWar }` builds a
  scene the war axis cannot see; a CityState without
  `emptySeat(seatOfCityState(id))` has no seat id.
- **Meeting is by EXPLORATION** — in a fogless world every seat meets every
  city-state at the phase top; "unmet" scenes need fog live.
