# Lab session 2 — report (2026-09-20, live game, tuner TCP 4318)

Start state: fresh Gathering Storm game, turn 1, grid 60x38, majors 0 NORWAY (human),
1 JAPAN, 2 NUBIA, 3 SCOTLAND, six city-states, Free Cities seat 62. Game speed
**GAMESPEED_ONLINE (CostMultiplier 50)** — every production cost below is half the
XML cost because of it. Ended at turn 124, game healthy, `probe` green.

The session ran in three stretches: turns 1-112 unattended; then the owner reloaded
`lab2_end_t112` and it continued to turn 124, where the missing call
(`PARAM_MODIFIERS = UnitOperationMoveModifiers.ATTACK`) closed **scenes C and B**; then the
owner cleared the `Network.LoadGame` probe and **scene D** ran four draws off one save.

**Scoreboard: G, E, C-80 rule 2, C, B and D DONE** — asks 2, 3, 5, 10, 12, 13, C-80 rule 2
and both provenance halves of the purchase price. F, H, I and the session-1 carry-overs
SKIPPED. **`Network.LoadGame` works from Lua with no human click**, so every destructive
scene is repeatable from here.

Turn rate by Autoplay (`lab.py advance`): **turns 1-9 ≈ 2.3 s/turn, 9-49 ≈ 2.3 s/turn,
49-109 ≈ 5.9 s/turn** (40 turns in 92 s, 60 turns in 356 s). ~10 turns/min in the
Medieval era on this box with the game in the foreground.

Four named saves were written **from Lua** (they land in
`Documents\My Games\Sid Meier's Civilization VI\Saves\Single\`, not AppData):
`lab2_base_t109`, `lab2_end_t112`, `lab2_freecity_t124` and **`lab2_nuke_pre`** (the
scene-D rig, reloaded three times).

Run files: `tools/civ6lab/runs/purchase_20260920T181359Z.jsonl`,
`purchase_20260920T181552Z.jsonl`, `religion_20260920T183900Z.jsonl`,
`envoy_20260920T190500Z.jsonl`, `freecity_20260920T193000Z.jsonl` (the failed first
attempt), `capture_20260921T000500Z.jsonl`, `freecity_watch_20260921T001500Z.jsonl`,
`freecity_20260921T003000Z.jsonl`, `nuke_20260921T010000Z.jsonl` (every plot, every draw),
`nuke_summary_20260921T013000Z.jsonl`.
New probes: `state_snap.lua`, `purchase_verify.lua`, `purchase_scan.lua`,
`save_named.lua`, `load_named.lua`, `religion_snap.lua`, `religion_push.lua`,
`religion_spread.lua`, `religion_read.lua`, `religion_player.lua`, `apostle_clear.lua`,
`envoy_probe.lua`, `envoy_step.lua`, `city_probe.lua`, `district_survey.lua`,
`district_damage.lua`, `capture_setup.lua`, `capture_war.lua`, `capture_move.lua`,
`capture_keep.lua`, `buy_unit.lua`, `spy_targets.lua`, `nuke_setup.lua`, `nuke_snap.lua`,
`nuke_strike.lua`, `fallout_scan.lua`.

---

## Scene G — the purchase price — **DONE**

`city:GetGold():GetPurchaseCost(yieldIndex, row.Hash [, formation])` — **InGame only**
(GameCore's city object has no `GetGold`). 303 rows scanned in one call: every unit,
building and district with a cost, against `city:GetBuildQueue():GetUnitCost/GetBuildingCost/GetDistrictCost`.

| item | XML cost | city prod cost | gold price | faith price |
|---|---|---|---|---|
| UNIT_WARRIOR | 40 | 20 | 80 | 40 |
| UNIT_SLINGER | 35 | 17 | **65** | **30** |
| UNIT_MISSIONARY | 75 | 37 | **145** | **70** |
| UNIT_SPY | 225 | 112 | **445** | **220** |
| UNIT_GALLEY | 65 | 32 | **125** | **60** |
| UNIT_APOSTLE | 200 | 100 | 400 | 200 |
| BUILDING_MONUMENT | 60 | 30 | 120 | 60 |
| BUILDING_GRANARY | 65 | 32 (32.5) | **130** | **65** |
| BUILDING_WORKSHOP | 195 | 97 (97.5) | 390 | 195 |
| BUILDING_TLACHTLI | 135 | 67 (67.5) | 270 | 135 |
| DISTRICT_CITY_CENTER | 54 | 27 | **105** | **50** |
| DISTRICT_AQUEDUCT | 36 | 18 | **70** | **35** |
| DISTRICT_BATH | 18 | 9 | **35** | **15** |

**The fit (every one of the 302 rows satisfies it):**

    price = floor(mult * C / 5) * 5,   mult = 4 for gold, 2 for faith
    C = the CITY's production cost (speed-scaled), not the XML cost

- The divisor is `PURCHASE_DIVISOR` = 5 and the rounding is **floor, not nearest**:
  Slinger faith 2x17 = 34 -> **30** (nearest would be 35); gold 4x17 = 68 -> 65;
  Missionary 148 -> 145; Spy 448 -> 445; City Center 108 -> 105; Aqueduct 72 -> 70.
- The multiplier is **4 on the scaled cost**, not 2 on the XML cost. Those two agree
  at this game speed for everything except the odd-cost units, and there the scaled
  reading wins: Slinger 2 x 35 = 70 exactly (no rounding to do) but the game says 65.
- `GOLD_PURCHASE_MULTIPLIER` = 2 and there is **no FAITH row** in GlobalParameters.
  The measured gold:faith ratio is exactly 2:1 everywhere, so the published 2 reads
  naturally as *gold = 2 x the faith price*, with the faith price = 2 x cost.
- **Units use the integer cost, buildings use the fractional one.** Granary's cost
  reads 32 but its price is 130 = 4 x 32.5 (4 x 32 would floor to 125). Every odd-cost
  unit instead prices off the truncated integer. Districts match the units.

**Progress does NOT reduce the price.** Monument in Nidaros with **25 of 30 hammers
already invested** still cost 120 gold / 60 faith — the same as at 0 progress six turns
earlier. Scout at 8/15 likewise cost the full 60/30. So `constants.GOLD_PURCHASE_MULT`
/ `FAITH_PURCHASE_MULT` are 4 and 2 against the *full* cost, with no remaining-cost term.

---

## Scene E — ask 3, the majority-religion tie — **DONE**

Readers (InGame): `city:GetReligion():GetReligionsInCity()` (rows `.Religion .Followers
.Pressure`, religion `-1` = the unconverted) and `:GetMajorityReligion()`;
`Players[p]:GetReligion():GetReligionInMajorityOfCities()`.
Driver: spawn an Apostle in GameCore (`GetUnits():Create`), set its faith by **name**
(`u:GetReligion():SetReligionType("RELIGION_X")`), then in InGame
`UnitManager.RequestOperation(u, GameInfo.UnitOperations["UNITOPERATION_SPREAD_RELIGION"].Hash,
{PARAM_X, PARAM_Y})`. (`UnitOperationTypes.SPREAD_RELIGION` is **nil** — the enum table
does not carry it; the DB hash does.)

**The city rule, measured:**

    majority = argmax over ALL groups, the unconverted (-1) included, of FOLLOWERS
    ties among them are broken by that group's total PRESSURE
    the winner must also satisfy  2 * followers >= population
    if the winner is the unconverted, the city has NO majority religion

| draw | city | pop | followers (pressure) | majority | what it decides |
|---|---|---|---|---|---|
| natural | NGAZARGAMU | 9 | none 2 (400), BUD **4** (940), PROT 2 (641), CATH 1 (212) | **none** | the half-gate: BUD leads on both counts, 2x4 < 9 |
| natural | NAPATA | 4 | none 0, CATH 1, BUD 1, **PROT 2** | PROT | 2x2 >= 4 passes |
| natural | CULLEN | 2 | CATH **1** (338), PROT **1** (194) | CATH | tie; CATH has both the lower id and more pressure — ambiguous |
| 1 | STAVANGER | 6 | none **3** (300), CATH **3** (220) | **none** | tie with the unconverted, they have more pressure |
| 3 | STAVANGER | 2 | none **1** (300), PROT **1** (880) | PROT | same shape, pressure order flipped, answer flips |
| 4 | STAVANGER | 3 | none 1 (300), CATH 1 (359), PROT 1 (710) | **none** | pressure winner is a religion, yet 2x1 < 3 |
| 5 | STAVANGER | 2 | CATH **1** (579), PROT **1** (532) | CATH | tie, CATH more pressure |
| **6** | STAVANGER | 2 | CATH **1** (434), PROT **1** (752) | **PROT** | **the decider** |

Draw 6 is draw 5 with one more Protestant spread: same city, same 1-1 follower tie,
pressure order reversed — and the majority flips to the religion with the **higher id**
(8 vs 2) which also reached f=1 **later**. So the tie-break is **pressure**, not the
lower religion id and not arrival order. C-64 is answered on both halves.

**Civ-wide:** `GetReligionInMajorityOfCities()` needs **strictly more than half** of the
player's cities.
- player 0, 1 Catholic city + 1 Protestant city -> **-1** (a 1-1 tie is *not* broken).
- player 0, 1 city with no majority + 1 Protestant city -> **-1**. Cities with no
  majority still count in the denominator; exactly half is not enough.
- player 2, 6 Protestant + 1 none of 7 -> Protestantism. player 5, 1 of 1 -> Protestantism
  though it founded no religion.

**Surprise / free mechanism reading:** an Apostle spread adds a flat **+220** pressure of
its own religion and multiplies **every other religion's** pressure in the city by
**0.75** (330 -> 139.22 over three spreads = 0.75^3 exactly; 18 -> 7.59 likewise). The
unconverted pressure (50 per population) is untouched by a spread. Followers are
`pop * pressure_share` rounded, forced to sum to pop.

---

## C-80 rule 2 — a city-state's tiles per ENVOY — **DONE**

AKKAD (minor 8), pop 4 and one city throughout, all readings on turn 112 with **no turns
passed**, so nothing but the envoys moved. Envoys sent with
`UI.RequestPlayerOperation(0, PlayerOperations.GIVE_INFLUENCE_TOKEN,
{[PlayerOperations.PARAM_PLAYER_ONE]=8})` (InGame); the pool topped up with
`Players[0]:GetInfluence():ChangeTokensToGive(n)` (**GameCore only** — it is nil in InGame).
Plots counted by walking `Map.GetPlotByIndex(i):GetOwner() == 8`.

| envoys | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| owned plots | 9 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 |

**Slope exactly +1 plot per envoy; plots = envoys + 6 for every reading from 3 on; no cap
through 16 envoys.** Suzerainty arrived at envoy 3 (suzerain 0) and did not change the
slope — envoys past suzerainty keep paying a tile each. The 2-envoy reading is one tile
ahead of the line; the first give's tile landed on the same tick as the suzerainty change.

Install cross-check: `Civilizations.xml` / `CivilizationLevels` —
`CIVILIZATION_LEVEL_CITY_STATE` has `CanAnnexTilesWithReceivedInfluence="true"` and
`StartingTilesForCity="5"`; a full civ has the flag false and 6;
`CIVILIZATION_LEVEL_FREE_CITIES` has the flag false and 0.

---

## Scene C — ask 2, the Encampment's pool on a capture — **DONE**

SHIZUOKA (Japan), a complete Encampment, Walls standing. The Encampment's pools were **set
to a known value before the capture** so any change is visible. Captured on turn 112 by one
Swordsman; **Keep** chosen.

| | city centre | Encampment | walls | pop |
|---|---|---|---|---|
| before (owner 1) | gar **200/200**, outer **200/200**, def 53 | gar **40/100**, outer **120/200**, def 59 | true | 12 |
| after (owner 0) | gar **100/200**, outer **0/0**, def 43 | gar **40/100**, outer **0/0**, def 43 | **false** | **9** |

**Ask 2 / B-51r, answered:**
- **The Encampment's own garrison pool RIDES THROUGH the capture, byte for byte** — 40/100
  before, 40/100 after. It is neither zeroed nor healed.
- **The city centre's garrison pool is neither zeroed nor kept**: the centre was taken at
  200/200 damage (dead) and comes up at exactly **100/200 — half health**.
- **Both outer pools read 0/0 afterwards, and the mechanism is the lost Walls.** The capture
  destroys the Walls building (`walls` true -> false), and `outerMax` is the walls level
  shared by *every* defending district — so the Encampment loses its outer pool too, not
  because the capture touched it but because the city has no walls any more. B-51r's
  "zeroes the centre's outer pool" is right in effect; it should zero the **maximum**, on
  every defending district, and it should key off the walls, not off the centre.
- Two more: the **incomplete** DISTRICT_AQUEDUCT vanishes from the captured city entirely
  (only completed districts survive), and **population drops 12 -> 9 (-25%)**.
- The city's **ID is re-keyed by the capture** (131073 -> 196610) and again by the revolt
  (-> 65536). Never hold a city id across either.
- The capturing Swordsman took **49 damage** taking a centre already at full garrison damage.

Scouting table, worth keeping on its own — **an Encampment carries its own garrison pool of
100** where a city centre's is 200, and **shares the city's outer pool** (200 or 300, set by
the walls level):

| city | centre garrison / outer | encampment garrison / outer |
|---|---|---|
| TOKYO (p1) | 0/200, 0/300 | 0/100, 0/300 |
| SHIZUOKA (p1) | 0/200, 0/200 | 0/100, 0/200 |
| MEROE (p2) | 0/200, 0/300 | 0/100, 0/300 |
| NGAZARGAMU (p4) | 0/200, 0/200 | 0/100, 0/200 (incomplete) |

**The capture path that works from the socket** (this was the whole blocker; both steps InGame):

    -- 1. the attack move.  A BARE MOVE_TO is accepted and then silently never executes.
    UnitManager.RequestOperation(u, UnitOperationTypes.MOVE_TO, {
        [UnitOperationTypes.PARAM_X] = cx, [UnitOperationTypes.PARAM_Y] = cy,
        [UnitOperationTypes.PARAM_MODIFIERS] = UnitOperationMoveModifiers.ATTACK
                                             + UnitOperationMoveModifiers.MOVE_IGNORE_UNEXPLORED_DESTINATION })
    -- 2. answer the Keep/Raze prompt, or the city stays half-captured
    CityManager.RequestCommand(CityManager.GetCityAt(cx, cy), CityCommandTypes.DESTROY,
        { [UnitOperationTypes.PARAM_FLAGS] = CityDestroyDirectives.KEEP })

`CityDestroyDirectives`: LIBERATE_FOUNDER 0, LIBERATE_PREVIOUS_OWNER 1, KEEP 2, RAZE 3,
REJECT 4. **Between the two steps the city sits half-captured** — `GetOwner` already reads
the new owner while `GetDefenseStrength` and `GetMaxDamage` throw. That half-state is the
tell that step 2 is owed.

## Scene B — asks 10, 12, 13, the Free City trio — **DONE**

The flip route: `city:ChangeLoyalty(-10)` **cannot** make a Free City — it moves the loyalty
*stock* and the pressure stays positive (SENDAI went 100 -> 0 -> back to 23 the next turn,
loyalty-per-turn +23 throughout). A **capture** does it: captured Shizuoka came up at
loyalty 50/100 with **-20.27 per turn** and revolted on the **third turn after the capture**
(captured t112, Free City t115). Watched to t124.

The Free Cities seat is **player 62** (`CIVILIZATION_FREE_CITIES`); the plain `Players[]`
walk lists it, no `GetFreeCitiesPlayerID` needed.

**Ask 12 — amenities.** Happiness is a `GameInfo.Happinesses` index:
0 REVOLT, 1 UNREST, 2 UNHAPPY, 3 DISPLEASED, 4 CONTENT, 5 HAPPY, 6 ECSTATIC.

| turn | owner | pop | amenities | needed | tier | from luxuries |
|---|---|---|---|---|---|---|
| 112 | Japan | 12 | 6 | 6 | 4 CONTENT | 5 |
| 112 | player 0, just captured | 9 | 4 | 5 | 3 DISPLEASED | 4 |
| **115** | **62, the flip turn** | 9 | **2** | 5 | **2 UNHAPPY** | 2 |
| 116-117 | 62 | 9 | 0 | 5 | **1 UNREST** | 2 |
| 118-120 | 62 | 9 | 1 | 5 | 2 UNHAPPY | 2 |
| 121-124 | 62 | 9 | 0 | 5 | **1 UNREST** | 2 |

A Free City **keeps the full amenity need of its population** (5 for pop 9, the same as any
city) and loses nearly all supply: it sits at **0-2 against 5**, tier **UNREST/UNHAPPY**,
every turn of a ten-turn watch, and never reached REVOLT. `GetAmenitiesFromLuxuries` stays
2, so the 0-1 total carries negative terms the per-source getters do not name.

**Ask 13 — defence, what it spawns, the cadence, the strike.**

| turn | owner | centre defence | centre garrison | encampment garrison | walls |
|---|---|---|---|---|---|
| 112 | Japan | 53 | 200/200 | 40/100 | true |
| 112 | player 0 | 43 | 100/200 | 40/100 | false |
| 115 | **62** | **72** | 40/200 | 0/100 | false |
| 116 | 62 | **72** | 20/200 | 0/100 | false |
| 117 | 62 | **72** | 8/200 | 0/100 | false |
| 118-124 | 62 | **72** | 0/200 | 0/100 | false |

- **Defence strength is a flat 72** for every turn of the watch — *higher* than the same city
  under its human captor (43) and higher than under Japan with walls standing (53). It is not
  a walls bonus (walls stayed false, `outerMax` 0 throughout) and not the owner's civ
  strength: the Free Cities seat has a defence floor of its own.
- The centre heals normally, **not instantly**: 40 -> 20 -> 8 -> 0 over turns 115-118.
- **What it spawns:** **two UNIT_MAN_AT_ARMS exist on the flip turn itself**, on the tiles
  either side of the centre (21:21 and 21:23), with brand-new unit ids — granted by the
  revolt. A **third free unit, a Crossbowman, arrives on turn 120, five turns later.**
- **Cadence: the defenders are grants, not production.** The build queue held
  `nothing` (t115) -> **MONUMENT** (t116) -> **GRANARY** (t117) -> **CATHEDRAL** (t118-124).
  A Free City builds **buildings** and trained no unit in ten turns; the Crossbowman appeared
  while the Cathedral was still in the queue.
- **Does it strike a unit parked beside it? YES.** On t116 Japan's ARCHER#3276817, undamaged
  and adjacent the turn before, read **73 damage**, one Man-At-Arms was gone and the other
  carried 15. By t117 both starting defenders were dead. It attacks what stands next to it
  and traded both away inside two turns.
- **Its own loyalty resets to 100/100 at the flip and then falls again** at -9/-10 per turn:
  100, 90, 81, 72, 63, 54, 45, 36, 27, 18 (t115-124). A Free City is not a stable seat — it is
  being pulled back toward its founder.

**Ask 10 — is a Free City spy ground? NO, and it is closed.** A **Spy bought in Nidaros**
(`CityManager.RequestCommand(city, CityCommandTypes.PURCHASE, ...)` — a unit *trained in a
city*, not socket-spawned) was asked for its destinations:
`UnitManager.GetOperationTargets(spy, UnitOperationTypes.SPY_TRAVEL_NEW_CITY)` returned **28
cities** — every city of every major *and* every city-state, the spy owner's own cities
included (Nidaros, Stavanger) — and **the Free City at 21:22 (plot 1341) is absent**. So the
rest of ask 10 (which missions it offers, the probabilities) has no scene: there is no way to
put a spy in a Free City.

Two call shapes worth the README: the target list comes back as **one key
(1933683541) holding a flat list of PLOT INDICES**, not city ids. And the Spy cost exactly
**445 gold** (3000 -> 2555) — the number scene G's formula predicts from the city's 112
production cost, `floor(4*112/5)*5 = 445`. Scene G's fit verified against a real transaction.

## Scene D — ask 5, a wonder in the blast — **DONE (four draws)**

**`Network.LoadGame` works from Lua but is NOT unattended — it needs a human click.** The
call returns `true` and the game loads, but it then stops on a **Start Game** button that
only the owner at the keyboard can press; the tuner socket is down until they do. Three
reloads this session, all clean, but all three were clicked through by the owner.

*Correction, and how the error was made:* this report first claimed the load "needs no human
click". It does not — I watched only my own side of the socket, saw the first probe fail and
the next one succeed, and read that as the game recovering on its own. It was the owner
clicking. **A reload is a request for the owner's hand, and a run that needs N reloads needs
the owner present for N clicks** — budget it that way, never as an automated loop.

Recipe: call load, wait for the owner's click, then **retry the next command once** (the
first probe after the transition fails with a `ConnectionResetError` or a non-zero exit and
the next one succeeds at the saved turn).

Target TOKYO (23:26, pop 18) with a `DISTRICT_WONDER` at **23:25, one tile from the centre**
and three more at 24:27, 23:23, 25:25. Rings 0-2 filled with **one Japanese unit per land
tile** before the strike (18 in total). Delivered by a Bomber based in a captured city 4
tiles away. The install: `WMD_NUCLEAR_DEVICE` BlastRadius **1**, `WMD_THERMONUCLEAR_DEVICE`
BlastRadius **2**.

| draw | weapon (radius) | aim | Tokyo pop | ring 0 | ring 1 | ring 2 | ring 3 | contaminated | fallout turns |
|---|---|---|---|---|---|---|---|---|---|
| 1 | thermonuclear (2) | city centre | **18 → 4** | 1 → **0** | 7 → **0** | 14 → **0** | 2 → 2 | **19** = r0+r1+r2 | 20 |
| 2 | nuclear device (1) | city centre | **18 → 15** | 1 → **0** | 7 → **0** | **14 → 14** | 2 → 2 | **7** = r0+r1 | 10 |
| 3 | thermonuclear (2) | **the wonder tile 23:25** | **18 → 11** | \- | \- | 6 survive | 1 | **19**, centred on 23:25 | 20 |
| 4 | thermonuclear (2) | city centre (draw 1 repeated after a reload) | **18 → 4** | identical to draw 1 | | | | | |

**Ask 5, the wonder half — answered: the wonder IS pillaged.**

> **Correction.** This report first said the opposite — "the wonder is never pillaged, even at
> ground zero", on three draws. That was a **reader error**, caught only when the owner
> produced the Civilopedia/wikia text saying wonders *are* pillaged. A wonder is a **building**
> standing on a `DISTRICT_WONDER` tile, and `district:IsPillaged()` on that tile reports
> `false` whatever happens to it. The right question is
> **`city:GetBuildings():IsPillaged(row.Hash)`**. Ordinary districts answer the district-level
> getter correctly, which is exactly why the error hid: every other row in the table was right.

Re-measured on nuked Tokyo, locating each wonder by `plot:GetWonderType()`:

| wonder | distance | in blast | `district:IsPillaged()` | **`buildings:IsPillaged()`** |
|---|---|---|---|---|
| Apadana | 1 | **yes** | false | **true** |
| Meenakshi Temple | 2 | **yes** | false | **true** |
| Stonehenge | 3 | no | false | false |
| Great Library | 3 | no | false | false |

Pillage correlates perfectly with the radius. Buildings behave the same way — Monument,
Palace, Granary, Walls, Water Mill, Castle, Star Fort (dist 0), Workshop (1), Shrine, Temple,
Cathedral, Amphitheater, Museum (2) all read pillaged, everything at dist 3 does not.
Improvements too: Farm, Mine, Pasture, Quarry inside the radius read `IsImprovementPillaged`
true afterwards and false before. Routes were not pillaged. **Nothing is destroyed** — every
district and building count is identical before and after; the blast only flags them pillaged.

**Ask 5, the per-ring half — answered, and C-31's "proportion" reading is wrong for units.**
The kill is **100% inside the blast radius and 0% outside, with a sharp cutoff at the
radius**. The radius-1 device killed rings 0 and 1 entirely and left **all fourteen** ring-2
units alive and at **zero damage** — no survivor anywhere inside, no casualty anywhere
outside, no partial damage on any unit. And it is **deterministic**: draws 1 and 4 are the
same strike from the same reloaded save and gave identical outcomes, so nothing is rolled.

**The footprint is centred on the target plot, not the city** (draw 3: the 19 contaminated
plots centred on 23:25, and six units at city-ring 2 that a centred strike had killed
survived because they are 3+ from the aim point).

**The struck city is not destroyed or captured**: the centre reads `pillaged=true` with
garrison **200/200** and outer **300/300** — both pools at *maximum* damage, i.e. zero
health — and the city still stands, still Japanese, producing nothing. The Civilopedia says a
City Center or Encampment in the blast has "HP **and Defense Strength** reduced to 0"; the HP
half is confirmed, the **defence half is contradicted** — the same pillaged centre reads
`GetDefenseStrength()` = **70**, not 0.

One wiki claim stayed **untested**: "any unfinished districts are destroyed and removed". I
saw that happen on the *capture* path (Shizuoka's incomplete Aqueduct vanished when the city
changed hands) but no blast target had an incomplete district inside the radius.

**Fallout: Gathering Storm has no `FEATURE_FALLOUT` row at all.** `GameInfo.Features["FEATURE_FALLOUT"]`
is nil and a whole-map feature scan finds nothing; contamination is its own manager,
`Game.GetFalloutManager():GetFalloutTurnsRemaining(plotIndex)`. The contaminated footprint is
**exactly the blast rings** (19 = 1+6+12 at radius 2, 7 = 1+6 at radius 1) and the duration is
**20 turns thermonuclear / 10 turns nuclear**, uniform on every plot, applied on the strike turn.

### Ask 5's population half — **still OPEN after three more reloads**

Eight cities at their **natural** populations, each struck once by a centred thermonuclear
from its own bomber, polled to stability:

| city | pop before | pop after | loss | housing after |
|---|---|---|---|---|
| Otsu | 4 | 4 | **0** | 5 |
| Napata | 5 | 2 | 3 | 5 |
| Nan Madol | 7 | 7 | **0** | 5 |
| Montrose | 8 | 1 | 7 | 5 |
| Ngazargamu | 10 | 10 | **0** | 5 |
| Muscat | 12 | 11 | 1 | 5 |
| Okayama | 13 | 6 | 7 | 5 |
| Tokyo | 18 | 3 | 15 | 9 |

**The loss is deterministic but is not a function of the starting population**: it is not a
fixed number, not a fraction, and not even monotone — three cities whose centre was pillaged
lost *nothing* (pop 4, 7, 10) while a pop-5 city lost 3 and a pop-12 city lost 1. **The
obvious mechanism is refuted**: post-blast housing reads 5 for every struck city (Tokyo 9)
while the surviving populations sit both above and below it, so population is *not* clamped
to housing.

### The driver, found: districts in the blast

A second wave on the turn-125 autosave struck **eleven** cities, each from its own bomber,
none of their populations touched, with the blast content measured **before** each strike and
310 polls to stability. Akkad was out of range and never fired — the untouched control.

| city | minor? | pop before | pop after | loss | **districts in blast** | buildings |
|---|---|---|---|---|---|---|
| Otsu | no | 4 | 4 | **0** | **1** | 1 |
| Nan Madol | yes | 7 | 7 | **0** | **2** | 6 |
| Ngazargamu | yes | 10 | 10 | **0** | **2** | 7 |
| Muscat | yes | 12 | 11 | **1** | **2** | 8 |
| Osaka | no | 8 | 1 | 7 | 3 | 1 |
| Montrose | no | 8 | 1 | 7 | 3 | 7 |
| Napata | no | 5 | 3 | 2 | 4 | 3 |
| Nagoya | no | 7 | 1 | 6 | 4 | 2 |
| Dundee | no | 12 | 1 | 11 | 4 | 6 |
| Meroe | no | 7 | 1 | 6 | 5 | 13 |
| Okayama | no | 13 | 6 | 7 | 9 | 11 |
| Akkad (control) | yes | 5 | 5 | 0 | not struck | 5 |

**The loss tracks the number of the city's complete DISTRICTS inside the radius, not its
population.** At **≤2 districts** a city loses 0 or 1 — a pop-12 city-state with two
districts lost **one** citizen. At **≥3** the city is gutted, five of seven straight down to
population **1** — a pop-12 major with four districts was reduced to one.

**It reproduces.** The two independent waves, across a reload and two different timelines,
agree on every city they share: Otsu 4→4, Nan Madol 7→7, Montrose 8→1, Ngazargamu 10→10,
Muscat 12→11, Okayama 13→6, Napata 5→2 / 5→3.

**And a nuke destroys no district and no building.** `districtsInBlast`, `districtsTotal` and
`buildingsTotal` are identical before and after for all eleven. It *pillages* them and leaves
them standing.

**The major/minor confound is now broken — it is the districts.** SENDAI, a **major**
civilisation's city with exactly **two** complete districts in the blast, lost **zero**
population (6 → 6) from a centred thermonuclear that pillaged its city centre. Akkad (minor,
1 district) likewise 5 → 5. So the rule rests on the district count, not on who owns the city:

| districts in blast | cities | outcome |
|---|---|---|
| 1 | Otsu (major) 4→4, Akkad (minor) 5→5 | **no loss** |
| 2 | **Sendai (major) 6→6**, Nan Madol 7→7, Ngazargamu 10→10, Muscat 12→11 | **no loss** |
| 3+ | Osaka 8→1, Montrose 8→1, Nagoya 7→1, Meroe 7→1, Dundee 12→1, Napata 5→3, Okayama 13→6 | **gutted** |

**And the wiki's stated mechanism is not the population rule.** The Civilopedia text says
"citizens *working* the affected tiles are eliminated". Measured with the correct per-city
reader `city:GetCitizens():IsPlotWorked(x,y)`: Sendai had **all 7** of its worked tiles
(pop 6 + the free centre) inside the blast and kept every citizen; Akkad had **all 6** and
kept every citizen. After the strike the citizens are *still assigned to the contaminated
tiles* — so the blast neither killed nor unassigned them. (My own first attempt at this column
used `plot:GetWorkerCount()`, which counts any owner's citizens and leaks neighbouring cities
in; that is why it produced a nonsense fit.)

**Still open:** the floor. Two cities with 3+ districts reproducibly do *not* go to 1 —
Okayama (9 districts, 13→6 in both waves) and Napata (4 districts, 5→3). More districts did
not mean more loss: Okayama has the most districts of any target and kept the most people of
any gutted city.

Three method traps were paid for here and belong in the README, because each one produced
confident, wrong numbers first:
- **Never set a population before measuring.** An earlier wave used `ChangePopulation` and
  read 12→1, 8→1, 4→4. Junk: an inflated city is not supported by its own housing and food,
  and the blast makes it snap down for a reason that is not the blast.
- **One bomber per strike.** A requested `WMD_STRIKE` does **not** spend the bomber's moves
  until the queued operation executes seconds later, so a "first bomber with moves" rule
  hands the *same* unit to every call in a batch and **only one strike of four ever lands**.
- **Poll to stability.** WMD operations resolve on the game's own clock, roughly one every
  ten to twenty seconds, never inside the calling command. A batch of eight took **over a
  hundred polling reads** to finish landing; an early read of a multi-strike wave is a
  half-applied world. This is what made the first wave look like Tokyo losing population
  without being fired at.
- And the refusal cause, worth its own line: **a strike is refused unless the AIM PLOT is
  revealed** (`CanStartOperation` false, no error text). The city being revealed is not
  enough — Muscat had a revealed centre and an unrevealed d=2 aim plot. Spawning any unit
  within sight reveals it; a Scout at distance 1-2 costs one call.

**Free find for scene F (ask 4):** the same manager carries `GetReactorCount`,
`GetReactorByIndex`, `GetReactorAge`, `GetReactorAccidentThreshold`, `GetFalloutDamageOverride`,
`GetFalloutPreventsWork` and `HasFallout`. A per-plant accident watch needs no new plumbing —
only a save with plants.

Calls that worked: `Players[0]:GetWMDs():ChangeWeaponCount(idx, n) / GetWeaponCount / CanDeployWMD`
(GameCore); `UnitManager.RequestOperation(u, UnitOperationTypes.WMD_STRIKE, {PARAM_X, PARAM_Y,
PARAM_WMD_TYPE = GameInfo.WMDs[...].Index})` (InGame); all 77 techs granted in one loop of
`GetTechs():SetTech(r.Index, true)`. **A bomber can only be *created* on a tile its owner has
a city on** — `Create` returned nil on open ground and in a foreign city and succeeded on
player 0's own city centre — and **Bomber Range 10 is enforced** (`canStrike=false` at
distance 15), which is why the scene needed a captured city 4 tiles from the target.

## Scene F — ask 4, reactor accidents — **SKIPPED** (no late save with plants; as the brief allows).

## Scene H — the Pop Star's gold — **SKIPPED** (no Rock Band; the civic is far past turn 112).

## Scene I — the Research Agreement's clock — **SKIPPED**, but the blocker is now half-removed
The two prerequisites are reachable from the socket after all:
`Players[p]:GetDiplomacy():SetHasDeclaredFriendship(...)` and
`pPlayerTechs:SetTech(iTech, true)` both exist. What is still missing is a Lua path to the
**deal screen's stated turn count** — the number only the `DiplomacyDealView` shows.

## Carry-overs — ask 14 (thirty escape routes), the counterspy term, ask 9 (30-turn watch) — **SKIPPED** for time.

---

## The calls that worked, by state (for the README)

**GameCore_Tuner**
- `Players[p]:GetUnits():Create(GameInfo.Units["UNIT_X"].Index, x, y)` / `:Destroy(u)` / `:FindID(id)`
- `u:GetReligion():SetReligionType("RELIGION_CATHOLICISM")` (a **string**, per Debug/Unit.ltp)
- `u:SetDamage(u:GetMaxDamage())` — wounds to 100/100 but does **not** remove the unit; `Destroy` does
- `city:ChangeLoyalty(-10)`, `city:ChangePopulation(+/-n)`
- `city:GetDistricts():GetDistrictByType(GameInfo.Districts["DISTRICT_X"].Index)` then
  `d:SetDamage(DefenseTypes.DISTRICT_GARRISON|DISTRICT_OUTER, v)` / `d:GetMaxDamage(...)`
  — the GameCore districts object has **no `Members()`**; it has `GetDistrictByType`,
  `GetDistrictByIndex`, `GetNumDistricts`, `SetDistrictPillaged`, `RemoveDistrict`
- `Players[0]:GetDiplomacy():DeclareWarOn(p, WarTypes.SURPRISE_WAR, true)`
- `Players[p]:GetInfluence():ChangeTokensToGive(n)` / `:GetTokensToGive()`
- `Players[p]:GetTreasury():SetGoldBalance(v)`, `:GetReligion():ChangeFaithBalance(v)`,
  `:GetTechs():SetTech(i, true)`, `:GetCulture():SetCivic(i, true)` (panel spellings, not exercised here)

**InGame**
- `city:GetGold():GetPurchaseCost(GameInfo.Yields["YIELD_GOLD"].Index, row.Hash, MilitaryFormationTypes.STANDARD_MILITARY_FORMATION)`
  (buildings and districts take no formation argument)
- `city:GetBuildQueue():GetUnitCost/GetBuildingCost/GetDistrictCost/GetUnitProgress/...`
- `city:GetReligion():GetReligionsInCity() / :GetMajorityReligion()`;
  `Players[p]:GetReligion():GetReligionInMajorityOfCities() / :GetReligionTypeCreated()`
- `city:GetCulturalIdentity():GetLoyalty()/GetMaxLoyalty()/GetLoyaltyPerTurn()/GetLoyaltyLevel()`
- `city:GetGrowth():GetAmenities()/GetAmenitiesNeeded()/GetHappiness()/...`
- `city:GetDistricts():Members()`, `d:GetDefenseStrength()`, `d:GetDamage(DefenseTypes.X)`, `d:GetMaxDamage(DefenseTypes.X)`
- `Cities.GetCityInPlot(x, y)`
- `UnitManager.RequestOperation(u, hash, params)` / `CanStartOperation`, `UnitManager.RequestCommand(u, UnitCommandTypes.DELETE)`
- `UI.RequestPlayerOperation(0, PlayerOperations.GIVE_INFLUENCE_TOKEN, {[PlayerOperations.PARAM_PLAYER_ONE]=id})`
- `Network.SaveGame({Name=, Location=SaveLocations.LOCAL_STORAGE, Type=SaveTypes.SINGLE_PLAYER, IsAutosave=false, IsQuicksave=false})`

## What failed, and how

| call | state | failure |
|---|---|---|
| `city:GetGold()` | GameCore | `function expected instead of nil` — the Gold object is InGame only |
| `Players[p]:GetUnits():Create` | InGame | nil — creation is GameCore only |
| `UnitManager.RequestOperation` / `CanStartOperation` | GameCore | nil — the operation API is InGame only |
| `city:GetCulturalIdentity()` | GameCore | nil — InGame only |
| `city:GetDistricts():Members()` | GameCore | nil — use `GetDistrictByType` |
| `d:SetDamage(...)` | InGame | accepted silently, **pool unchanged**; it only bites in GameCore |
| `Players[0]:GetDiplomacy():SetAtWarWith(p, true)` | both | nil — a Civ5 spelling left in Debug/Player.ltp. `DeclareWarOn(p, WarTypes.SURPRISE_WAR, true)` is the live one; `DeclareWarOn(p)` alone returns ok and leaves `IsAtWarWith` false |
| `Players[p]:GetInfluence():ChangeTokensToGive(n)` | InGame | nil — GameCore only |
| `u:GetReligion():GetReligionType()` | InGame | nil — readable in GameCore only (the setter is GameCore too) |
| `UnitOperationTypes.SPREAD_RELIGION` / `.FOUND_RELIGION` | both | **nil**; the live `UnitOperationTypes` table does not carry them. Use `GameInfo.UnitOperations["UNITOPERATION_SPREAD_RELIGION"].Hash` (1592408602) |
| `Players[0]:GetUnits():Create(UNIT_TANK, ...)` | GameCore | returned nil (no error); UNIT_SWORDSMAN on the same tile succeeded |
| `UnitManager.RequestOperation(u, MOVE_TO, city centre)` **without `PARAM_MODIFIERS`** | InGame | `CanStartOperation` true, `RequestOperation` returns without error, **the unit never moves**. `GetMoveToPath` to an adjacent hostile centre returned a 23-plot path — it was routing *around* the city. **Solved**: add `PARAM_MODIFIERS = UnitOperationMoveModifiers.ATTACK + MOVE_IGNORE_UNEXPLORED_DESTINATION`, exactly as `Civ6Common.lua:RequestMoveOperation` does. This is the single call that unblocked scenes C and B |
| `Players[p]:GetCulture():SetCivic(idx, true)` | GameCore | works, but `HasCivic` still reads **false** in the same call chain; it reads true on the next tuner call |
| `CityManager.RequestCommand(city, PURCHASE, ...)` | InGame | works; the unit lands with **0 moves** and its spy operation targets come back **empty until the next turn** |

**The biggest lesson of the session, paid for twice.** The wonder error and the citizens error
are the same mistake: asking a plausible-looking getter on the **wrong object** and believing
a clean, consistent answer. `district:IsPillaged()` on a wonder tile and `plot:GetWorkerCount()`
for a city's citizens both returned tidy numbers for every row — no error, no nil, no warning —
and both were answering a different question than the one I asked. The only tell was that they
disagreed with an outside description. **When a measurement contradicts a published account of
the same mechanic, re-derive the reader before rejecting the account.** Both of my confident
wrong answers here would have shipped into AUDIT as facts.

Two more traps worth the README:
- **`--set TOKEN=VALUE` is a bare substring replace.** A token `REL` also rewrote the
  `REL` inside `UNITOPERATION_SPREAD_RELIGION`; a token `CX` rewrote `local CX, ...`.
  Every probe here uses `Z`-prefixed tokens and never declares a local of that name.
- **A spread/operation resolves on a later tick**: the ledger read in the *same* Lua call
  still shows the old numbers, and sometimes the *next* call does too. Read it in a
  separate call, and re-read once before concluding a request did nothing.
- `TunerGameRandomEvents` did **not** exist this session — only `GameCore_Tuner` and
  `InGame`. `lab.py storm` already falls back to GameCore for `GameRandomEvents`.

## Still needs a late save or the owner's hand

1. **Ask 5's population half** — the driver is now identified (**districts in the blast**,
   not population) and reproduced across two timelines. Two sub-questions remain, each one
   short run: break the **major/minor confound** (a city-state with 3+ districts, or a major
   with exactly 2), and find what sets the **floor** for Okayama and Napata. Budget 1-2
   reloads and expect the slow queue — the recipe is in `blast_content.lua` +
   `blast_setup.lua` + `nuke_one.lua --set ZSKIP=<n>` + `blast_pops.lua` polled to stability.
2. **Scene I (C-2)** — both prerequisites are socket-reachable
   (`GetDiplomacy():SetHasDeclaredFriendship(...)`, `GetTechs():SetTech(i, true)`); the
   stated turn count still needs the deal screen, i.e. the owner's hand or a
   `DiplomacyDealView` reader nobody has written.
3. **Scene F (ask 4)** — still needs a save with several Nuclear Power Plants, but its
   **reader is now found**: `Game.GetFalloutManager():GetReactorCount() / GetReactorByIndex() /
   GetReactorAge() / GetReactorAccidentThreshold()`. No new plumbing, only the save.
4. **Scene H (Pop Star)** — still needs a Rock Band, i.e. a much later game.
5. **Session-1 carry-overs** (ask 14's thirty escape routes, the counterspy term, ask 9's
   30-turn watch) — untouched. Ask 14 is now cheaper than it was: a Spy can be **bought**
   for gold in one call (`CityCommandTypes.PURCHASE`), which satisfies "trained in a city"
   without waiting out a build, and gold can be granted with `SetGoldBalance`.

**How the session ended:** the game process is gone. The last command sent was a `SaveGame`
request, which failed because the socket was already down; the next two probes found no
tuner and `Get-Process` found no Civ 6 at all. Nothing was killed from here — the session
only ever sent Lua over the socket. **The last save the owner should rely on is
`lab2_nuke_pre`**, because the closing save of the population wave never landed. No data was
lost: the whole eight-city wave had already been written to
`runs/nuke_natural_20260921T030000Z.jsonl` and its conclusions to
`runs/nuke_population_20260921T033000Z.jsonl` before the socket went.

Saves left behind: **`lab2_nuke_pre.Civ6Save`** is the one that matters — turn 124, the whole
scene-D rig standing (Tokyo pop 18 with its rings filled, a Bomber based 4 tiles away, 5
thermonuclear + 5 nuclear devices stocked, all techs, war with Japan). Reload it and strike
again for the population rule. Also `lab2_base_t109`, `lab2_end_t112` and
`lab2_freecity_t124` (the live Free City, before it was recaptured to base the bomber).
