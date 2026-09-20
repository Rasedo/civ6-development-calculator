# Lab session 2 — the scene list

Written 2026-09-14. The ledger's eight "ruling" lines were classified against
the INSTALL on 2026-09-09; the live-game oracle came up on 2026-09-13, after
that pass, and seven of the eight are facts the game will state when asked.
This is the order to ask them in, one scene each, highest yield per minute
first. The carry-overs from session 1 close the list.

Every Lua call named below is the panel's spelling as far as the first
session used it; anything not exercised on 2026-09-13 is marked VERIFY and
the `Debug\*.ltp` panel for the object is the reference — open it before
typing the call, never guess a method name into a running game.

## Before anything

1. Launch, load a Gathering Storm game with at least four majors met and
   one Encampment standing somewhere (a save past turn 100 is ideal).
   `python tools/civ6lab/lab.py probe` green.
2. Write a named save. Every destructive scene below (capture, nuke,
   loyalty flip) reloads from it — do not run them in sequence on one
   timeline.
3. No battery while the game has the box.

Standing traps (all paid for on 2026-09-13):

* Two military units spawned on ONE tile before Autoplay hang the AI turn
  forever — one spawn per tile, always.
* `SetReturnAsPlayer` must never see -1 — `lab.py advance` refuses it; do
  not hand-roll an Autoplay call.
* Refusal texts arrive in cp1251 on this box.
* Socket-spawned spies crash the game on a capture/kill escape route — a
  spy used in any scene is TRAINED in a city and travelled in.

## Scene B — asks 10, 12, 13, the Free City trio (GameCore + InGame)

One setup answers three lines.

* Pick a city of a major far from its capital. Drive its loyalty down from
  the socket (VERIFY in the City panel: `city:GetCulturalIdentity()` and
  its loyalty setter/changer) and pass turns until it flips; note the
  turn. The Free Cities player is `PlayerManager.GetFreeCitiesPlayerID()`
  (VERIFY).
* Ask 12 — amenities: on the flip turn and five turns later read the
  city's `GetGrowth():GetAmenities()`, `GetAmenitiesNeeded()` and the
  happiness/tier the UI shows (VERIFY the tier getter). Compare with what
  the same city read the turn before the flip.
* Ask 13 — defence: read the city's defence strength and outer/garrison
  hit points before and after (VERIFY: the City panel's combat getters),
  whether Walls stand (`GetBuildings():HasBuilding(...)`), then watch 15
  turns with a `cs_probe.lua`-shaped loop over the Free Cities player:
  what it trains, when, and whether it strikes a unit parked beside it
  (one unit, one tile).
* Ask 10 — spy ground: a spy TRAINED in one of the human's cities; from
  InGame list `UnitManager.GetOperationTargets(spy, UnitOperationTypes.SPY_TRAVEL_NEW_CITY)`
  (VERIFY the operation row name) and see whether the Free City is
  offered; if it is, travel there and list which missions the city offers
  and `GetResultProbability` for each.
* Record to `runs/freecity_<stamp>.jsonl`.

Closes: ask 10 (open or closed), ask 12 (the tier), ask 13 (what it
spawns, the cadence, the walls, the strike target).

## Scene C — ask 2, the Encampment's pool on a capture (GameCore)

* Find a city with an Encampment. Read, per district, garrison and outer
  damage (VERIFY: `district:GetDamage(DefenseTypes.DISTRICT_GARRISON)` /
  `DISTRICT_OUTER` and `GetMaxDamage`) and the city centre's.
* Spawn ONE strong melee unit per adjacent tile for the human (never two
  on a tile), knock the centre down and take it with `UnitManager.RequestOperation`
  (VERIFY the city-attack operation row) — or, cheaper, set the centre's
  damage from the socket and take it with one attack.
* Read every district's damage again on the capture turn and the turn
  after. The question is whether the Encampment's garrison/outer pools
  zero, ride through, or heal; B-51r today zeroes the centre's outer pool
  and lets the district's own ride.

Closes: ask 2 (B-51r).

## Scene D — ask 5, a wonder in the blast (GameCore)

* Grant a nuclear device to the human (VERIFY in the Player/WMD panel:
  `Players[p]:GetWMDs()` and its count changer) and a delivery unit with
  range on the target (a Bomber based in range, or a Missile Silo).
* Build the scene at a rival city with a WONDER on a tile 1 from the
  centre: one unit per tile at ring 0, 1 and 2 (theirs; spawn for that
  player), an improvement in each ring.
* Strike the centre (VERIFY `UnitOperationTypes.WMD_STRIKE` and its
  parameter table). Read: is the wonder tile pillaged; which units died
  per ring; the city's population and damage; fallout plots and their
  duration.
* Reload and repeat at least three times: the per-ring kill is a
  PROPORTION (C-31 already knows the blast shape; what is unsourced is how
  many die per ring), and three draws are the minimum that says anything.
* Record to `runs/nuke_<stamp>.jsonl`.

Closes: ask 5 (C-31), both halves.

## Scene E — ask 3, the majority-religion tie (GameCore)

* One city, two religions: push pressure from the socket until the
  follower counts are EQUAL (VERIFY: `city:GetReligion()` and its pressure
  adder; read `GetMajorityReligion()` and the per-religion followers).
  Note which wins — then swap which religion reached the count first, and
  which has the lower id, to separate the two candidate rules.
* Civ-wide: two cities, each majority of a different religion; read the
  player's majority (VERIFY: `Players[p]:GetReligion():GetReligionInMajorityOfCities()`).
  Same two swaps.
* Record the four readings.

Closes: ask 3 (C-64).

## Scene F — ask 4, per-plant reactor accidents (GameCore, HALF)

Only if a late save with several Nuclear Power Plants exists; otherwise
skip — building one from the socket is not worth the session. Watch n
plants over m turns and count accidents per plant: independence per plant
is the measurable half. The other half — whether THIS engine rolls per
object or scales one per-game rate — stays a modelling ruling and the
owner's.

## Scene G — the purchase price (GameCore or InGame), from the provenance round

The engine buys at production cost × 4 (gold) and × 2 (faith); the install
publishes GOLD_PURCHASE_MULTIPLIER 2 and PURCHASE_DIVISOR 5 and no faith
row — the price is a DLL formula, and the owner ruled "prefer Civ 6", so it
is measured, not argued.

* In one city read the gold and faith purchase price of three units and
  three buildings of different production costs (VERIFY in the City panel:
  `city:GetGold():GetPurchaseCost(YieldTypes.YIELD_GOLD, hash, MilitaryFormationTypes.STANDARD_FORMATION)`
  and the faith twin; the production cost from `GameInfo.Units[...].Cost`).
* Repeat with the city's production already partly invested in the item
  (the price should fall with progress — read it before and after a turn).
* Record (item, cost, gold price, faith price, progress) to
  `runs/purchase_<stamp>.jsonl`; a fit against `cost × m / d` with the two
  GlobalParameters closes constants.GOLD_PURCHASE_MULT / FAITH_PURCHASE_MULT.

## Scene H — the Pop Star's gold (InGame), from the provenance round

The catalog says 25, the install's ROCKBAND_POP writes −75 on a tourism-bomb
gold yield, and the relation is unverified. One Rock Band with the Pop Star
promotion, one concert at a foreign wonder: read the gold the concert pays
against the same concert without the promotion. Two draws is enough for a
percentage.

## Scene I — the Research Agreement's clock (InGame), from AUDIT C-2

Both engines bank `DIPLOMACY_RESEARCH_AGREEMENT_BEAKER_PERCENTAGE` (10) of the
two parties' combined science per turn against the target technology's
cost — a READING of "The more expensive the technology, the longer the
agreement will take"; the install publishes no duration.

* Two civilizations past Scientific Theory, Declared Friends. Open the deal
  screen, add a Research Agreement, pick a target technology: the screen
  states the number of TURNS. Record (target tech, its cost at this speed,
  player science/turn, partner science/turn, turns shown).
* Repeat with a dearer target and with a partner of very different science
  (the two readings the formula must separate: combined science, or the
  initiator's alone; a percentage of the cost per turn, or of the science).
* Accept one and count the turns to the "scientific breakthrough" notice;
  confirm both parties received the Eureka (VERIFY: `pPlayer:GetTechs():HasBoostBeenTriggered(techIndex)`).
* Record to `runs/research_agreement_<stamp>.jsonl`; a fit closes or
  corrects `RESEARCH_AGREEMENT_PCT`'s reading on both engines.

## Carry-overs from session 1

* Ask 14 — the escape roll's scale: spies TRAINED in a city, travelled in,
  missions run until a capture/kill route resolves; the crash was the
  socket-spawned spy's missing origin. Thirty routes is the sample the
  entry asks for; `escape_fit.py` fits them.
* The counterspy term: one route with a counterspy in the target district,
  one without, same level — the difference is the term.
* C-80 rule 2 — a city-state's tiles per ENVOY (`CanAnnexTilesWithReceivedInfluence`):
  count a minor's owned plots, send one envoy from the socket, count again;
  repeat to six envoys and past suzerainty. The slope is the channel's
  magnitude; whether it caps, its cap.
* Ask 9 — the city-state's buy rule: kill a minor's army from the socket
  and run `cs_probe.lua` every turn for 30 turns; the trigger count and
  the chassis bought are the magnitude C-38 lacks.

## What each answer changes

Every line here, once measured, is written into its AUDIT entry the way
asks 1, 7, 11, 15 and 16 were on 2026-09-13, and the ledger row leaves.
Scenes B and C each unblock a build on both engines (C-60/C-16, B-51r);
D and E close an open item without new code beyond a table. (Scene A, the
opinion deltas, left on 2026-09-20: the opinion scale is the game's AI, not
its engine.)
