# DLL readings (GameCore_XP2_Release.dll)

The install's `DLC/Expansion2/Binaries/Win64/GameCore_XP2_Release.dll`, read
as code with `dll_q.py` (annotated disassembly: `xref`, `ann`, `callers`,
`gref`, `fld`, `vt`, `s`), `dll_gp.py` (the GlobalParameters struct, from the
GlobalParameters loader), `dll_vtab.py` and `dll_rng.py` (every draw on the
synchronous generator by its label). Addresses are Release RVAs unless marked
FinalRelease; the FinalRelease DLL the game runs is the same code without
asserts.

Each section is the rule as ported (what the DLL computes, its addresses, the
engine symbols that port it in both twins), the recorded cases that confirm it,
and what is open in it (the AUDIT entry that holds the work). A function's own
detail — its arguments, fields, branches — is its record in the DLL atlas
(`atlas.py <addr>`); `atlas_check.py` holds the two in step: every address
cited here has a record, and every section a record or a code comment names is
a heading here.

## B-D: the policy-unlock price — CLOSED

`PlayerCulture::GetCostToUnlockPolicies` 0x398e70 (Lua 0x9a2280), the
escalation 0x5267a0 (type 1), the progress 0x399810 (civics) / 0x4c9cf0
(techs). Check: `dll_policy.py` (853 / 853 reads exact).

- 0 when the government has an empty slot or the culture's flag +0xc00 is set.
- p = max(100·C // NC, 100·T // NT), C / T the civics / techs held of NC 61 /
  NT 77; E(x) = x + 9x·p // 100 (GAME_COST_ESCALATION 1000).
- price = max(E(CivicUnlockMaxCost 50) − s·E(CivicUnlockPerTurnDrop 5),
  E(CivicUnlockMinCost 10)), s = turn − the last civic's turn − 1; halved
  under GOVERNMENT_UNLOCK_WITH_FAITH (false); price −= price % 5. A granted
  civic stamps the grant turn (s = −1).

## B-D-S1: the war-weariness split — CLOSED (structure)

`Player_Diplomacy` allocation 0x3cda00 (from 0x3d7020); requirement 0x5275a0;
city sorts 0x3bdd20 / 0x3bdbc0 / 0x3bdc70 / 0x3bdb10 (population descending,
EASTL insertion under 29: ties keep the list order); opponent sorts 0x3bde80 /
0x3bddd0. Check: `dll_ww.py` (`runs/ww_xsec_*`: need 135 / 135, caps 20 / 20).

- need = max(0, ceil(pop / 2) − CITY_AMENITIES_FOR_FREE 0).
- Per opponent o with W[o] > 0: L(o) = W[o] // 400, floored per opponent;
  at-war opponents first (A), then at-peace (B).
- A: L(o) to the cities whose ORIGINAL owner is o, most populous first, each
  min(rest, need + 3); B: the same at need + 1. The rest is pooled.
- C: the pool to cities founded by a third party, need + 1; D: the rest to
  the seat's founded cities, need + 0.
- Open: the per-opponent W has no reader (C-109).

## B-31r-S1: the plunder payout — CLOSED

Trade_Manager plunder 0x5545e0 (yield loop 0x554860..0x554a4e, route yields
0x559b30 origin / 0x559bc0 destination, speed 0x5254d0). Check:
`dll_plunder.py` (16 / 16 `runs/plunder_*`, the two 50s Quebec→Halifax V 6,
Quebec→Ngaruawahia V 8).

- V = Σ yields (origin + destination) × (1 Gold, else 2).
- base = max(50, V × speed(TRADE_ROUTE_TURN_DURATION_BASE 20) // 2) (online 5V).
- payout = base + base × pct // 100, pct the plundering unit's +0x1858 (Total
  War, Letter of Marque and the admirals' abilities all add into it via
  EFFECT_ADJUST_UNIT_PLUNDER_YIELDS); Gold; no draw.

## C-16: the counterspy and the escape

Rules_Espionage: `ComputeNeededDieRoll` 0x529b60, outcome table 0x52b8f0,
mission roll 0x52b2a0; counterspy finder 0x52ac80; escape ResolveEscape
0x52ce40 → 0x52aea0 → table 0x52b090 → target 0x529ab0; police 0x528560;
3d6 counts at 0xf02c70. Check: `dll_escape.py`.

- Counterspy term: needed roll += EnemyProbChange 3 + EnemyLevelProbChange 1
  × (level − 1) + its promotion terms; level + ADJACENT_LEVEL_BOOST within 1.
- The counterspy is the FIRST unit of the target owner's list that is a spy
  on a counterspy operation, in a city, within 1 of the target plot (any
  district), or anywhere in its city with ENTIRE_CITY.
- Escape: v = 10 − LEVEL_BOOST·(level − 1) − the spy's boost + 4 on a right
  police guess; one weighted draw over the 3d6 counts: escaped P(≥ v),
  captured P(v−2..v−1), killed P(≤ v−3). ResolveEscape passes no counterspy
  (0x52cf77 `xor r8d, r8d`): COUNTERSPY_LEVEL_MODIFIER is dead.
- Police: one route drawn weighted 5 − TravelTime (City Centre 1, Commercial
  Hub 2, Harbor 3, Aerodrome 4; "Police Exit Covered"). 214 paired escapes:
  the capture band logL −196.9 against the flat 29%'s −200.0.
- Open: the escape rate per route count and the level field's base (C-16).

## B-89 tail: an air strike's XP — READ, one term open

Rules_Combat 0x5197e0 (every resolver; the air strike 0x203cb0 picks BOMBARD
at 0x204451 when Bombard > Ranged). Check: `dll_xp.py`.

- base = 1 (ranged / bombard) else 2; strengths are the RAW Ranged / Bombard
  and Combat columns (corps / army added); k = KILL_BONUS 2 on a kill.
- attacker ceil(1 + base + k·D/A), defender ceil(base + k·A/D); × the side's
  XP percent, rounded up; capped at 8 (Expansion2); barbarians 1.
- Confirmed: the Bomber's +3 on Infantry 4 / 4. Open: the Georgian Infantry's
  XP percent (its +4; B-89).

## C-74: the event draw, the volcanoes, the drought

Game_RandomEvents: the step 0x338710 (gate: turn ≥ start +
RANDOM_EVENT_START_TURN − 1), the volcano roll 0x335040, the weights
0x335260, "Random Event Roll" at 0x338814; N 0x339020; storms 0x28f490
(map size 0x28d0f0), floods 0xa2cfc0, eruptions 0xa1e470, warming 0x28da10.

- N = last turn − start turn (else GameSpeed_Turns: online 250); the total is
  10N, the remainder the empty slot.
- Once-per-map rows: trunc(10·Occ) × (W·H) // (84·54), plus warming.
- Per-site rows (floods per river, eruptions per active volcano):
  trunc(10·Occ) × (100 + 30 while the site has had no event of that
  severity) // 100.
- Warming: + trunc(ChanceIncreasePerDegree × weight × T) // 100, T = CO2 /
  (CO2For1DegreeTempRise / 1000); a flood (0xa2cfc0) warms the boosted
  weight w', w' + trunc(T × C × w') // 100 in float32.
- The volcano roll (`dll_volcano.py`, `volcanoRoll` / `_volcano_roll`): one
  a turn; pct = active share over volcanoes and volcanic wonders; D = N //
  (2V), N the event draw's (`TURN_LIMIT`); below 70 D //= ((70 − pct)·V' //
  100) when ≥ 2 (V' the named volcanoes) and rand(D) = 0 wakes a dormant
  named volcano drawn uniformly ("Choose Active Volcano Roll"); at 70+ the
  roll sleeps an active one ("Choose Inactive Volcano Roll"). Confirmed:
  runs/h1_duelw1117 (243 rolls) and 1118 (277) draw over 62 (250 // 4); 1118
  t152's Inactive roll over 2. The gate: "C-74: the volcano roll's gate".
- The drought start ("Pick Drought Start Plot" 0x287e80; the uniform pick:
  "C-74: the drought's start pick"): a candidate is a plot that with its six
  neighbours passes 0x28eb60 — no feature, no river (+0x37), not water nor
  beside an ocean-sized body (0x82a10), Plains / Grassland (hills too), not
  under an event — and keeps a positive spacing score 0x28ff20 = 1 + min(hex
  distance to a live drought's last footprint plot, Spacing 15) (m_aDroughts
  +0x948 in 0x28ce90). Check `dll_drought.py`: 13 / 13 placed on a
  candidate, 34 / 34 unplaced had none.
- The fire: "C-74: the fire" (0x2867f0).

## C-93: the great person draw

`Game_GreatPeople` 0x2f94d0 draws ONE uniform pick ("Generating a random new
Great Person") among the class's candidates of the earliest era holding any.
Callers: the timeline's setup 0x2f7c10; the replacement 0x2f8f70 after a
grant 0x2f74b0 (recruit 0x2f8890, patronize 0x2f83e0, reject 0x2f8c00); the
deferred grant queue 0x2f2a60 (virtual 0x2f46a0). Open: the turn-opening
draws' split and the victory / turn-limit order (C-93).

## H-1: the great person's spawn — READ

The grant 0x2f74b0 asks 0x2f6500: class row +0x70 district, +0x98 unit;
domain 0xadd590 on unit info +0x1c. Land: the first city in list order
(+0x12f0 → +0xd8) holding the completed district (0x1aec20 on +0x1a48) with
strictly greater population (+0x588) takes it on its centre (+0x158); else
the capital's centre (0x36f460), else the start plot (+0x1398). Sea: the most
populous city's water district. Confirmed runs/h1_duelw1109..1116: 152 / 154
on the predicted centre. The importer's `spentAtSpawn` places a person spent
unseen (1116 Ibn Khaldun t112 on Xian's Campus).

## H-1: the draws per event (`dll_rng.py`)

One generator (0x8b6c10, 16-bit max), 224 labelled sites.
- Combat: one "Unit Combat Damage" rand(12) per damage figure (0x519090; the
  preview takes 6, no draw); "Unit Capture Chance"; an interception draws two.
- Goody hut: "Choosing a Goody Hut Type", "Choosing a Sub Type", then the
  reward's own.
- Random events: "Active Volcano Roll" (+ the choice), "Random Event Roll",
  "Pick Storm / Drought / One Off Start Plot"; per struck plot "Pillage
  Improvement Chance", "Random Event Unit Damage Roll", "Remove Fertility
  Chance", "Fertility Gain Chance", "Boosted Yield Chance", "Extra Range
  Chance".
- Espionage: "Rolling Espionage Result", "Police Exit Covered", "Spy
  EscapeRoute".

## H-1: the random events' draws — READ, replayed on 1115 / 1116

The generator 0x8b6c10: state' = 0x41c64e6d · state + 0x3039 (mod 2^32),
value = ((state' >> 16) · (max & 0xffff)) >> 16, stored every call; max 0
steps and returns 0 (`tests/cpu/harness/civ6Random.test.ts`, 120 / 120 tuner
observations). The weighted picker 0x287c00: one draw over the 16-bit total,
the first entry whose running sum passes it.

The random-event step 0x338710 is the last draw between the barbarians'
start of turn T−1 and player 0's start of T (`Game.GetRandomSeed()` at
PlayerTurnStarted, h1_starts.lua). Its order: the storms' walks (0x288f40 →
0x28ecd0), the volcano roll 0x335040, the weights 0x335260 (RandomEvents
order, the empty slot last), "Random Event Roll", the event 0x334d30.
Confirmed: 1116 39 / 39 and 1115 25 / 25 floods reproduce the recorded silt.

- Flood 0xa2f200: unless mitigated (a complete unpillaged Dam on one of its
  Floodplains, 0xa2c280; the Great Bath, 0xa2b280), each RandomEvent_Damages
  row over the plots, one "Pillage Improvement Chance" rand(100) a plot whose
  owner is not immune (0xa28eb0, TRAIT_AVOID_*); UNIT_DAMAGE_LAND once per
  land unit, CITY_GARRISON once on a complete district with garrison hit
  points (0x336000), CITY_WALLS while the walls stand (0x336170); then each
  yield row, one "Boosted Yield Chance" a plot, +1 under the Percentage
  (halved when mitigated) on the row's Floodplains. The plots: the river's
  Floodplains list (0xa2aa30 → 0xa2aca0; "H-1: the Floodplains list",
  `floodplainList`).
- Storm birth 0x291a20: "Pick Storm Start Plot", "Storm Direction Preview"
  (0x28d1f0, over the wind rows at its latitude), the name (0x28d400, one draw
  over the naming player's citizen names), the first strike 0x286f80 at 100%
  on a copy (the stored struck list starts empty).
- Storm walk 0x28ecd0 on the two turns after birth: percent 50 once turn −
  start + 1 ≥ Duration; steps of 0x28c500 — one "Storm Direction" weighted
  draw over the PrevailingWinds rows whose band holds the plot and whose
  neighbour exists (DirectionTypes 0xeff670 / 0xeff688: NE (0,+1), E (+1,0),
  SE (+1,−1), SW (0,−1), W (−1,0), NW (−1,+1)), cost 1 on the storm's terrain
  else 2 of Movement 8, a step past what is left ends the walk with its draw
  spent; each step strikes; then a Preview draw. The footprint 0x28d6b0
  (Hexes 3 adds NE, NW; 7 the six in order; 19 every axial (dq, dr) in −2..2
  within 2, dq outer) minus the struck list; per plot each damage row one
  rand(100) against Percentage × pct // 100 (CoastalLowlandPercentage on a
  lowland), then off water and impassable plots each yield row one rand(100).
  Confirmed: 38 / 38 births and first walks (1115 28, 1116 10).
- Eruption 0xa22000: damage 0xa1c1a0 (each row, each neighbour in direction
  order not impassable and bare / Removable / Volcanic Soil, a bonus resource
  removed, one rand(100)), then soil 0xa219e0 (each yield row, each such
  neighbour off water, one "Fertility Gain Chance"). 13 / 14 eruptions.
- The replay allows 0–2 draws for a unit that came and went on a struck plot,
  and draws after the event (1116 t91: two).

## Tools added for these readings

`dll_hash.py` names a 32-bit type hash (CRC32 without its final inversion:
TERRAIN_GRASS 0x83e7c630). `dll_rowmap.py` maps a row struct's fields to its
columns. `dll_emu.py` runs a leaf routine under unicorn (`pv`).
`dll_luabind.py` lists a Lua registrar's bindings and their virtual slots.
The plot's virtual slots: +0x18 the movement cost, +0x30 the district /
ownership info (+0x1c owner, +0x10 district id), byte +0x3a bit 3
IsImpassable, word +0x2c the terrain (mountains 2, 5, 8, 11, 14; 15 / 16
Coast / Ocean), byte +0x47 the route.

## C-20: the Trader's path and range

XP2 Trade_Movement.cpp: the callbacks installed at 0x557fd0 — step cost
0x558970, node valid 0x558db0, node init 0x558900, context 0x558ba0, range
0x5579b0; A* with heuristic 0x271490. Check: `dll_tradepath.py` (31 / 31
startable paths of `runs/trade_path_*`).

- Range, a budget along the path (1/256): the origin starts at
  TRADE_ROUTE_BASE_RANGE 15 (+ player trade +0x1b0). Per edge (the tail
  below): a land<->water switch (0x558300) caps it at 1; a from-plot with a
  TradeEmbark district (Districts +0xe1 bit 7: City Centre, Harbor, Royal Navy
  Dockyard, Cothon) of the origin or of a city holding the player's trading
  post (City_Trade 0x1f99d0, false at war) refuels to LAND_RANGE_REFUEL 15 /
  WATER_RANGE 30 (+ Portugal's); the destination's own district to 3; a step
  costs 1; an edge leaving < 0 is refused (0x5590a9).
- Step cost (1/100): 100; +10000 for a switch not at a refuelling district;
  onto a city centre or tunnelled mountain +0; a route +10 when it is the top
  PlacementValue (Railroad) else +50; water without route +50; land without
  route +100 × movement cost.
- Closed: impassable, an untunnelled mountain, a plot a major has not
  revealed, water when the Trader cannot embark, a foreign centre at war, a
  feature with DangerValue > 0 unless the destination; a switch needs a
  TradeEmbark district at one end.
- The path cache 0x9af6c0 (GetTradeRoutePath) answers pairs CanStart refuses.
  Open: the route's transportation efficiency (C-20).

## C-34: the interception's damage, XP, weariness and the answers

- Damage (0x519090; struct 0x519370): trunc((24 + r) × expf(x) + 0.5) in
  [1, 100], x = (10 × D) >> 8, D the strength difference in 1/256 (k =
  trunc(0.04 × 256)). Check `dll_damage.py`: 12 / 12 interceptions and
  previews.
- The air resolver 0x203cb0 ([+0] plane, [+8] target, [+0x10] interceptor,
  [+0x18] anti-air) runs interception, anti-air, strike, with no health test
  between: a downed bomber is still answered and still strikes.
- XP: the interceptor's is 0x5197e0 as a MELEE DEFENDER with no kill:
  min(8, ceil(ceil(2 + S_plane / S_int) × its XP percent)), S via 0x56dc90;
  the plane earns nothing; the anti-air gun the ranged defender formula on
  the plane's Ranged (0 against a Bomber). Open: Georgia's XP percent (B-89).
- War weariness 0x1fb680 (combat log 0x20d280) reads only [+0], [+8] and the
  location: per side (1 in allied lands else 2) + 3 when its unit died (+10
  WMD) × (16 + era / casus-belli term) × (100 + percents) / 100.

## C-41: the eruption's soil, the ring and the gates

The eruption 0xa22000: damage 0xa1c1a0, then soil 0xa219e0; a natural
wonder's 0xa22150: 0xa1c760 then 0xa21680 over each wonder plot's six
neighbours (shared plots twice). Check: `dll_eruption.py` (`runs/volcano_own_*`
201 plots, logL −121.6 against −127.4 food-gated).

- Soil: each yield row, each neighbour (NE..NW): skip impassable, water, a
  feature neither Removable nor the row's own; one rand(100) < Percentage
  paints Volcanic Soil (raw setter 0x896c40, no district / centre / wonder
  gate) and +1 the row's yield (0xa190d0).
- Damage: each damage row, each neighbour not impassable whose feature is
  Removable or Eruptable; a BONUS resource is removed before the draw (land
  or water); one rand(100) applies through 0x336a50.
- The owned-plot gate is the damage TYPE's: IMPROVEMENT_PILLAGED 0x33aba0,
  IMPROVEMENT_DESTROYED 0x337210, DISTRICT_PILLAGED 0x33a910,
  BUILDING_PILLAGED 0x33a780, POPULATION_LOSS 0x33a6e0 refuse unowned;
  UNIT_DAMAGE_LAND / NAVAL 0x3366a0 and UNIT_KILLED_CIVILIAN 0x33a070 do not.
  Floods (0xa2a4d0), storms (0x286530, 0x2867f0, 0x286f80), eruptions and the
  accident (0x2d0e00, 0x2d33a0) share the appliers.
- Unit damage: one "Random Event Unit Damage Roll" per live non-civilian unit
  of the row's domain, MinHP + rand(MaxHP − MinHP).

## C-49: the storm's walk

Game_Climate: the walk 0x28ecd0, a step 0x28c500 ("Storm Direction"), the
strike 0x286f80.

- Latitude 0x69d80: lat = Bottom + (Top − Bottom) × (100y // H) // 100;
  every PrevailingWinds row with Min ≤ lat ≤ Max joins (bands pool at the
  shared ends).
- A step: one weighted draw over the directions whose neighbour exists; the
  storm moves whatever the terrain; cost 1 on its RandomEvent_Terrains (empty:
  all) else 2, of Movement 8; a step costing more than is left ends the turn.
- Each step strikes the footprint, each plot once per storm (struck list
  +0x38), Percentage × pct // 100 against rand(100), pct 100, 50 on the last
  turn, damage and yield rows alike.

## B-24r: the governor operations

- APPOINT_GOVERNOR (0x48c219 → CanAppoint 0x430fa0 → Appoint 0x430590): the
  governor value goes through 0x28a940 (an INDEX below the table's size, else
  a HASH) and is stored raw ([+4]); the install's screens pass the row Index
  (GovernorPanel.lua 551, GovernorAssignmentChooser.lua 402-404).
- Carbon: the climate observer 0x288740 takes the amount of a resource
  consumed (× CLIMATE_CO2_PERCENT_FROM_UNITS 50 for upkeep) and its
  CO2perkWh; the Industrialist's +1 Power adds none.

## C-26: the struck unit's terms (install audit)

`c26_strike_terms.py` (`runs/c26_strike_terms.txt`); the district-defender
strength 0x520270 (from the district attack 0x207080) carries the
visibility bonus.

- Apply to a unit a city or Encampment strikes: `chassisAbilityCS`'s
  position terms (Khevsureti, Highlander, Hoplite, Varu, Carolean, Huszar,
  Cossack, Malon Raider, Garde, Redcoat, Black Army, Conquistador, U-Boat,
  Mountie), Ngao Mbeba's +10 (COMBAT_RANGED, not attacking), `visibilityCS`.
- Do not apply: `allianceWarCS` (COMBAT_UNIT_VS_UNIT), the vs-fighter rows,
  De Zeven Provincien; `barbarianCombatCS` is 0.
- Open: Cyber Warfare against a district (C-26).

## C-1: the nuclear accident's plant and the spared unit's draw — CLOSED

The accident 0x2d33a0, for each damage row before its draw, pillages every
NuclearReactor building (Buildings_XP2 +0x48 bit 8: the Power Plant) of the
plot's city through 0x193190 (not 0x336a50) on an owned unpillaged district
— no draw, past Reinforced Materials (lab 5e 9 / 9); then one "Pillage
Improvement Chance" through 0x336a50; Hexes (RandomEvents +0x30) 0. The unit
applier 0x3366a0 draws for every live unit of the domain BEFORE immunity
(0x468060, 0x468100, +0x1110, abilities zero it after).

## C-74: BUILDING_PILLAGED's building — CLOSED

The applier 0x33a780 asks 0x24af90: nothing on a pillaged or InternalOnly
district (+0xe1 bit 4); else of the city's unpillaged buildings there the
first of strictly greater Cost (+0x24), refused when Buildings_XP2 Pillage is
false (+0x48 bit 16: Dar-e Mehr, Flood Barrier). No draw. DISTRICT_PILLAGED
0x33a910 takes every building but those, then the district; every event
reaches both through 0x336a50.

## C-93: the climate step after the events — CLOSED

The world step 0xa55190 runs the random-event step 0x338710 (droughts' tick
and storms' walk 0x288f40: 0x2876c0, 0x28ecd0; the volcano roll 0x335040;
the roll), then the climate component's turn (0x2d1f20's). `endTurn`:
`disasterPhase` then `climateTurn`.

## C-20 tail: the trade path's land and water tests and the switch — READ

IsLand 0x5583a0 / IsWater 0x558460: where a district stands (virtual +0x40)
they read the plot info's word +0x14 via 0x81240 — land = bit 4 and not bit
1, water = bit 1 and not bit 4, both or neither: neither; without one, land =
not water (0x834d0). The range 0x5579b0: a switch caps at 1; a refuelling
district refuels to the land / water refuel by the next plot, the larger onto
a plot that is neither; else the destination's TradeEmbark district to 3;
a refuel sets the context's +0x1cc; left = r − 1. The step cost swaps 100 for
10100 (0x558a08) on a switch with the flag clear. The context's +0x1a2
(player trade +0x4b0 / +0x510 ≤ 0) is set in every game.

Confirmed, runs/h1_duelw1108: Rome's Trader to Shenyang t182 via Rome's Harbor
617 (a Harbor's plot is water: a switch); t212 via Antium's centre 796
(neither). The engines (`walk` / `_trade_reach`): a City Centre's plot
neither. Open: who writes word +0x14 (C-20).

## C-49 tail: the storm's start plot — READ (REVERSED)

"Pick Storm Start Plot" 0x288250 passes 0x2900c0 a COUNT: 2 for Hexes ≥ 19,
1 for ≥ 3, else 0. 0x28aa00: 0 fails every plot (the tornado family never
starts: runs/h1_duelw1115 / 1116 8 / 8 at −1); 1 tests the plot alone (its
terrain in RandomEvent_Terrains); 2 the plot, all six ring-1 plots on the
map, and one of them passing. 0x2900c0's weight (valid × (Spacing + 1), less
Spacing − d near a live storm) only filters weight > 0; the draw is ONE
UNIFORM draw over the qualifying plots in ascending order (0x2883a4 passes
the size). Confirmed: 22 / 22 births of 1115 / 1116
(`cpu/harness/eventReplay.ts`).

## C-74 tail: "under an event" for a drought start — READ

0x28de40: true when the plot is in any storm record's struck list, live or
ended (m_aStorms +0x8b0, stride 0x68, vector +0x38..+0x40; "C-74: the
drought's storm bar"). Droughts' and fires' plots are not read.

## Border plot: GetNextBuyablePlot — READ

0x1aa7f0 scores every unowned plot within 5 touching the city: d ×
DISTANCE_MULTIPLIER × 2; a seen resource (0x4ab4b0) + RESOURCE_COST at d ≤ 3,
else + WATER_COST on water (0x834d0) and + RING_COST at d > 3; an
improvement + RING_COST for a barbarian camp (0x362130) else
IMPROVEMENT_COST; a natural wonder (0x82e90) NW_COST; YIELD_POINT_COST per
yield point to the owner (0x82280); −1 per unowned neighbour with a seen
resource, −1 per one with a natural wonder, −1 more if such a wonder is
within 3 of the centre. The lowest cost's tie list draws one (0x1ab1c0
"GetNextBuyablePlot picker"). The turn 0x1a9bc0 banks culture × (100 + pct)
/ 100, annexes the STORED plot (+0x1c) when the box covers it (else a fresh
pick), one a turn, then re-picks and stores. Confirmed: 2,489 / 2,780 H-1
city-turns.

## C-94: the game era, the ages and the founding moments — READ

Game_Eras.cpp, the update 0x2c2dc0 (option hash 0xf10572be): era +0x108, its
turn +0x168, countdown +0x170 (value +0x1c8, −1 idle). Check:
`.claude/scratchpad/era_player_check.py`.

- Short of the last era (0x93e8a0): idle and 0x2c4c80 → countdown
  NEXT_ERA_TURN_COUNTDOWN 10 (gp +0x524); decremented each call; below 0 the
  next era (0x93eaa0; ages 0x2c0e80; 0x2c6d70 sets it).
- 0x2c4c80: false before MinTurn − 10, true from MaxTurn − 10, else true when
  ahead ≥ total − ahead over the game's players (+0xb50, eliminated counted;
  0x2c3940 / 0x2c3900). MinTurn 0x2c3870 / MaxTurn 0x2c37c0 = start +
  scale(Eras_XP1 +0x24 / +0x2c), scale 0x5254d0 (online 20 / 30).
- A player's era 0x467eb0 (techs +0xf8): its highest tech / civic era as of
  its turn's end (1104 t162 → t163).
- Confirmed: 1103 / 1104 era starts 16 / 16.

The ages 0x2c0e80, per player: s = Σ the era-score vector +0x5b8 (22 types,
the whole game's); Golden at s ≥ 0x2c3b60's bar, Dark below 0x2c3a70's (each
max(0, base + Σ shifts)), Heroic = Golden out of Dark. Next bars: 0x2c6be0
bases s + scale_SLIGHT(28) / s + scale_SLIGHT(14) (0x525500, SCALING_SLIGHT
0x50b150fa, online 80 → 22 / 11); 0x2c55d0's shifts: PER_CITY × max(0,
cities − 1), [10] the entered era's EraScoreThresholdShift, +5 to [7] per
Golden / Heroic, −5 to [8] per Dark (cumulative). The start 0x2c69c0: 8 / 19.
Confirmed: every age and bar of the H-1 duels, 16 / 16 (`era.age`, `era.bars`).

Moments (Game_History_*): 0x3004e0 pays EraScore unless outside the row's
Min / MaxGameEra, the START era is past ObsoleteEra, or within
RepeatTurnCooldown (scaled); 0x315af0 ever-recorded. The founding handler
0x306b40 (no plain founding moment): BECAME_LARGEST_CIV_BY_MARGIN (cities − 3
≥ every other major's, once); NEAR_NATURAL_WONDER within 2 (per wonder);
NEAR_OTHER_CIV_CITY within 5 (each time; 0x312b00: another full civ's
(0x469db0) met (0x3daaf0) revealed city); NEAR_FLOODABLE_RIVER, NEAR_VOLCANO
within 2 (once); NEW_CONTINENT (each time, not the first city); ON_DESERT /
SNOW / TUNDRA. Pantheon 0x314840 / religion 0x3057a0 FIRST_IN_WORLD; a wonder
0x3110a0 GAME_ERA (4) / PAST_ERA (3); a transfer 0x3088a0: TO_ORIGINAL_OWNER
(+0x218, not by identity, once per city, 0x315b50), then PLAYER_DEFEATED (≤ 1
city) else FOREIGN_CAPITAL (+0x648), none for a minor; Great People 0x3142a0
1. Confirmed: `step.eraScore` 394 / 482 (1103). Open: moments the engines do
not record (C-115).

## H-1: the plot's event yields and the city yield's percent — READ

- An event's yield gain 0xa190d0 (flood 0xa2ed80, storms 0x2867f0 / 0x286f80,
  soil 0xa219e0 / 0xa21680) adds into the plot's sparse slot (0xa192ea /
  0xa19337), no cap: runs/h1_duelw1108 plot 609 5 Food t217.
- A city's yield (City:GetYield 0x981dd0 → 0xaa060 → 0xaa740): one modifier
  per attribute, clamped (−1000, 1000), base + base × m / 100; every percent
  sums into it: 1108 Handan t105 12.5 Science → 13.125 (−10 + 15). Production
  holds the envoys' flat toward the queue's head under the same percent
  (Xi'an t95 (15 + 1) × 0.9 = 14.4).

## C-94: the slot rebuild — READ

Player_Culture.cpp: slots {type, policy} (+0x3d8, read +0x430, count +0x440;
`GetSlotPolicy` 0x399ab0); a slotted byte per policy (+0x7c8, read +0x820;
`IsPolicyActive` 0x39dff0). Modifiers attach on "policy added" (GameSignals
+0x11a0, 0xc97410) and detach on "policy removed" (+0x11b8, 0xc97780).

- SetSlotPolicy 0x3a3990: CanSlot 0x393400 (refuses a flagged card), flag,
  REMOVED for the old card, store, ADDED. ClearPolicySlot 0x394730. The
  civics command 0x44bb0 (0 set, 1 government, 2 clear, 3 clear list + add).
- The rebuild (SetGovernment 0x3a25f0; slot counts 0x39fc00, 0x3a2bf0,
  0x3a2e30): save (0x3a3b00 into +0x448, sorted 0x386350 / 0x385b50 by the
  PrereqCivic's Cost (row +0x88 → +0x1c, 0xabc150) highest first, insertion
  sort), clear all (0x3942d0: REMOVED each), build (0x391650), then while more
  than one slot is empty (0x3996b0) 0x398cf0 lays the first saved card of the
  slot's type, flagged, valid (0x3930a0) — NO ADDED signal: it stays lapsed.
- The AI (0x625d70): the government, then per slot the best card CanSlot
  admits above the slot's card, by command 0. The engines carry the LAYOUT on
  the seat action (`policies`, `policyLayoutOf` / `_policy_slots_of`,
  `civ_policy_slot`): a moved card pays, a lapsed one left stays lapsed.
- Confirmed: runs/h1_duelw1121 China t31 (Survey, Urban Planning laid back
  lapsed; Urban Planning slotted in the Wildcard pays +1); 1108 China t249
  (Liberalism lapses, Civil Prestige pays). `importLapsed`.

## C-94: the religious spread — READ

City_Religion.cpp: entries {religion, followers, pressure, remainder}
(+0xa0, count +0xb0), majority +8; pressure 24.8.

- The spread (0x4967f0 → 0x498570): a player with a founded religion (+0xa0
  by +0x128) spreads it: every city in the game (+0x7f8) whose majority
  ([+0x1910]) is it presses every other city (0x498660) by 0x496980 when
  positive (0x1f20e0), then recomputes (0x1f6480). A minor spreads nothing.
- 0x496980: nothing to an ally (0xd71225de) or another founder's Citadel city
  (+0x19e8); the step 0x1f33e0 within range when the source follows it; the
  routes source → target (0x54ae60, gp +0x5f8) and back (0x54bae0, +0x5fc).
- 0x1f33e0: ADJACENT_PER_TURN_PRESSURE (+0x5d4) × HOLY_CITY (+0x5e0) on the
  Holy City or under TREAT_HOLY_SITE_AS_HOLY_CITY (+0xce0) with a Holy Site
  (TREAT_CAPITAL +0xc80 is removed in GS), else × HOLY_SITE (+0x5e8); × (100 +
  0x4975a0 + the city's +0xd4 (the Bishop) + the queue's Projects_XP2
  ReligiousPressureModifier (+0x2170 head 0x179650 → 0xad5f10 / 0xad5fb0 /
  0x28a940: Prayers 100)) / 100, then speed (0x525590). Confirmed:
  runs/h1_duelw1118 Armagh 8 under Prayers, 4 otherwise (`pressureFromCity`,
  `CityState.buildProject` / `citystate_build_proj`).
- Growth 0x1f3050 (from 0x1c79b0): +ATHEISM_PRESSURE_PER_POP (+0x5d8) × n
  `<< 8` to the majority's entry; the reset 0x1f6360 {religion, pop × 50}.
- The recompute 0x1f43c0: largest remainder, ties to the LATER entry (`jl`
  0x1f48aa).
- Order: inside PlayerReligion's turn, before the cities (1117 t148
  Guangzhou). Open: 0x4975a0 (+0x6d0, +0x790) unread (C-101).

## C-94: trade posts and cultural dominance — READ

- 0x5500b0 counts the path's posts (index 1 to the destination), foreign
  TRADING_POST_GOLD_IN_FOREIGN_CITY, own the player's bonus.
- PlayerCulture's turn 0x396860: lifetime culture +0x1050 (24.8, every civic
  progress gain, 0x3a1fb0; held at +0xb40 with no civic); per met player
  (0x3daaf0) the tourism bank (0x394830 / 0x3939b0, +0xc68), the tourists
  (0x39f610), dominance 0x393af0, visiting stored (+0x1118).
- Citizens: (lifetime >> 8) / 100. Raw tourists from o: ((bank >> 8) / 200)
  / the majors (+0x10d0); drawn 0x394fa0 (scaled when o's citizens fall
  below demand, 0x399b90); domestic +0x10b0 (0x3a2250, 0x399c80); visiting
  0x39bee0.
- Dominance per met pair: visiting > the other's domestic sets, < clears.
  0x54c6c0 adds TRADE_ROUTE_GOLD_CULTURAL_DOMINANCE 4 (gp +0x6ec)
  (`updateCulturalDominance` / `_update_cultural_dominance`): 1108 Jiaodong →
  Rome +4 t200. `foldCultureTourism`. Open: 1129 Rome t146-239 (C-118).
- CITIZEN_IDENTITY_PRESSURE_MOD_CULTURAL_DOMINANCE 25 (gp +0xec): 0x1a1640 a
  city's pressure at a plot = (citizens +0x588 + Great Works × +0x1aec) ×
  0x1a1370's term, × 1.25 where the owner dominates the plot's owner
  (0x106660), then the falloff (+0xf0): runs/h1_duelw1130 Rome t95 18.671875
  (`citizenPressure`).

## H-1: a route's yield per path plot (Hunza) — READ

0x54bdb0: the cached path (0x541ae0, else 0x5526a0), n plots both ends; the
posts (0x5500b0) × own / foreign bonus (0x4d9750, 0x4d9670); the per-tile
bonus (0x4d9620, +0xeb8 via 0x4d8220) floor(n × a + a / 2) in 24.8, a = 0.2
as 51. Confirmed runs/h1_duelw1108 Aquileia → Rome (5) +1, → Hunza (10) +2,
Rome → Shenyang (21) +4 (`routeLengthGold`). The path is laid once
(`History.routeCourse`).

## H-1: the citizen pressure term — PARTLY READ

0x1a1ae0: own and foreign pressure (walk 0x6aef0 within gp +0xf0 = 10,
functor 0x19b090) → both 0: 0; own 0: −MAX; foreign 0: +MAX; else r = hi /
lo (0x16e940) clamped [NEUTRAL_RATIO, MAX_RATIO] (+0x480 / +0x478), t =
(r − N) / (M − N), NEUTRAL_LOYALTY + (MAX − NEUTRAL)·t >> 8 (+0x474 /
+0x47c), negated when foreign is larger (`pressureTerm`). Confirmed:
runs/h1_duelw1112 Yiyang t192 0.546875. Open: the walk's distance falloff,
floor(256·(10 − d)/10) a fit (C-102).

## H-1: the annex, the purchase and the stored next plot — READ

0x1a8b70 annexes a plot, clears the stored next plot (+0x1c = −1), counts
+0xc. Callers: the culture turn 0x1a9bc0 (then re-picks), AnnexPlots
0x1a8a30, the swap 0x1ac910, culture bombs 0x524e30, the Trader 0x558510,
the Gold purchase 0x977aa0 (price via 0x4e02e0). A purchase after the culture
step leaves no stored plot (1108 Chengdu t159–162); `buyTile` clears it.

## H-1: a religious unit's spread — PARTLY READ

0x968e20: max(0, ReligiousStrength (+0x1ce0) × 200 (gp +0x5f4) / 100 −
+0xcf0), × (100 + +0x1d00) / 100 when flagged. Confirmed: a Missionary 200,
an Apostle 220 (1108 Rome t108–110); ReligionEvictPercent off every other
religion (1103 Lugdunum 1,000 → 900 → 810). `spreadFromUnit`. Open: +0xcf0
and +0x1d00's writers (1103 t144 250 unexplained; C-101).

## C-94: the wounded law and the garrison — READ

- 0x522630, 24.8: m = 10 << 8 (gp +0x238) less m × +0x1868 (NoReduction);
  × (damage × 100 / max) >> 8, each percent a float32 × 0.01f cut to 1/256
  (82 damage → 2090/256). Callers: the district preview, unit-vs-unit, the
  air strikes (`woundedLoss256`, `_wounded_loss`).
- The garrison term 0x24a180: FP(Combat, 0x56dc90) − loss − base, where
  positive (1108 Jiaodong 30.8359375).
- The walls: each wall's OuterDefenseStrength (+0x44) + +0x1888 while
  0x24b960 (outer damage +0x8d8 below max) holds (1108 Xi'an t97-111).

## H-1: the district adjacency — READ

Improvement_Yields.cpp: Plot:GetAdjacencyYield (0x25600 → 0x81b90 →
0x5389b0) and District::GetYield 0x249850 reach 0x365720 (via 0x366df0); the
city walk 0x7aaf80 calls 0x365ae0 itself.

- 0x365720: the district's Adjacency_YieldChanges rows (+0x100) via 0x365ae0,
  SUMMED AS INTEGERS; then the player's modifier adjacencies (0x1cb470,
  0x30-byte entries), each count × amount // TilesRequired.
- 0x365ae0 one row (loader 0xa57930; flags +0xc0 NaturalWonder 1, Resource 2,
  River 4, SeaResource 8, Wonder 0x10, OtherDistrict 0x20, Self 0x40): admitted
  by 0x367010 (prereqs, obsoletes, ExcludedAdjacencies); YieldChange for
  Self, for a river on the plot (+0x37), then per neighbour per clause: a
  natural wonder (0x82e90); the resource as the player sees it (0x50a690);
  a wonder (0x81330); OtherDistrictAdjacent: the player's own complete
  (+0xb08, 0x9c83d0), unpillaged (+0xc88, 0x24c3a0), non-InternalOnly
  (0x810d0) district; terrain (+0x2c), feature (+0x3c), improvement (+0x44,
  not pillaged +0x4d); AdjacentDistrict complete (0x811b0) unpillaged
  (0x811f0), WHOEVER owns it. Then floor(n × YieldChange / TilesRequired)
  (0x3640e0).
- 0x7aaf80 applies the adjacency percent per row (0x7a6690).
- 0x249850: 0 while pillaged; else adjacency + flat (+0x2f0) + appeal rows
  (+0x458).
- High-adjacency moments 0x312c00 at completion: ≥ 3 / 4 / 4 / 3 / 4 / 3
  (Campus 0x675dbc7a, Commercial Hub, Harbor, Holy Site, Industrial Zone,
  Theater).
- Confirmed: 1104 Xian's Campus 1 + floor(3/2) + floor(1/2) = 2.
- An improvement's adjacency 0x3664d0 runs the same rows
  (Improvement_Adjacencies +0x110) for the plot's owner
  (`improvementAdjacency` / `_imp_adjacency`): runs/h1_duelw1118 plot 781's
  Monastery 2 Faith (not 3).

## H-1: a district project's yield conversion — READ

The queue turn 0x177d10 reads Production (0x1c5350), clears the conversion
vector (+0x1108) and project id (+0x1360), applies (0x16f050); ORDER_ADVANCE
0x184ae0 walks Project_YieldConversions (+0x168, loader 0xa98af0): min(the
Production, the cost 0x179510) × (pct << 8) / 100 (15% → 38/256), + attribute
0xbcfe99b8's percent (0). Read under the city's percent until the next clear;
no lump. Confirmed: runs/h1_duelw1108 Aquileia t112-125 7.625 Science
(`City.projectYield` / `city_proj_conv`, `projectConversionRate`).

## C-94: the growth modifier — READ (the accumulator's writer unread)

GetOverallGrowthModifier (0x9876b0) reads the growth cache +0x28 (copy
0xa7b10) from 0x1b62d0, beside housing 0x1b5f70, happiness 0x1b5800, other
0x1b6180, occupation 0x1b6120:

- r = 256 + (the amenity tier's GrowthModifier << 8) / 100 (0x16e940: −15%
  −38);
- + other 0x1b6180: a configuration percent (0) + CityGrowth +0x84 (the
  EFFECT_ADJUST_CITY_GROWTH accumulator; Amount via 0xbc1300);
- r < 0 → 0; × housing (0x1b5f70) × 0x1b6040 (1).
- Fit: +15% reads +38, +20% +51, a detach floor(−p·256/100) (1108 Jiaodong
  89 → 37 t142). `growth256`, `growthPct256`, `City.growthDrift` /
  `city_growth_drift`. Open: +0x84's writer (C-112).

## H-1: the luxury allocation — READ

Player_Resources 0x4a6110 (callers 0x4a7560, 0x4a8ed0) rebuilds
m_aLuxuryAllocations (+0x460, serialized 0x4a3d46):
- a city entry per city in list order (+0x12f0 → +0xd8): {id +0xf8, pop
  +0x588, amenities 0x1b4af0 − luxury 0x1b5210, granted 0};
- a resource entry per held resource (0x510960): reach 0x527a50; a no-cap one
  × copies (0x4a93c0) with a wrap flag; + +0x160 per owned luxury, +0x1c0 per
  bonus; reach 0 dropped;
- resources stable-sorted (0x4a1eb0 → 0x4a0e90) by reach descending; cities
  (0x4a1fd0 → 0x4a0f60) by non-luxury + granted − need (0x5275a0) ascending,
  before the first resource and after each;
- each grants one amenity to the first `reach` cities, a wrapping one running
  on from the start (0x4a6b74).
- Confirmed: runs/h1_duelw1112 t83 China's Amber (2 copies) 3, 5, 4, 5, 3
  (`luxuryAmenities` / `_luxury_amenities`).

## H-1: the best melee, the drought's turns, the Trader's sea, the harvest's lump, the district discount — READ

- The best melee (PlayerStats +0xf0, m_iMaxMeleeStrengthTrained): 0x4c1a30
  as a unit is made (0x1e6570, 0xb02c60, 0xb67b30, 0xbd8be0, a hero
  0x8ffac0) and at the start (0x4580b0 → 0x4c1c10, raised to the start era's
  StartingMeleeStrengthMajor 20 / Minor 25, ranged +0x50 / +0x54); raised to
  0x56dc90(unit, 0) where 0x4bffa0 passes the row (domain not 1, no tag
  0x36c125c9, +0x24's flag +0x48 bit 4); an embarked unit raises nothing (1112
  China's Mechanized Infantry t213 → t216). The operations' desired strength
  0x723ab0 reads it (the recruit lines' 25 / 12.5 via 0x16e7d0).
- A drought ends at turn + 0x5254d0(Duration) (0x2922ff; online 2 MAJOR, 5
  EXTREME), cleared at 0x28789a (1110 plot 887 t64–68; `DROUGHT_TURNS`).
- The Trader's sea: the context 0x558ba0 sets +0x1a1 from 0x553680 → CanEmbark
  0x4ee3f0 of its type (0x552dd0): a flag, the embark list, or a tech with
  EmbarkAll (+0x70 bit 4: Shipbuilding) or naming it; water is closed while
  clear (1112 China t68–72). Open: Guangzhou → Preslav t54–55 (C-108).
- A harvest / feature removal's lump (0x95fbf0 → 0x5256d0 per row): A = base +
  9·base·P/100, P = max(tech %, civic %) (0x4c9cf0 / 0x399810); × (100 − 50 −
  30 pillaged) / 100 on an improved plot (+0x44, +0x4d); speed (0x525400:
  half online); the city's +0x1e08 percent. Confirmed: runs/h1_duelw1112
  Xi'an's Rainforest t49 +11 Food at P 15 (`lumpValue` / `_lump_value`).
- The district discount (0x409870): the type's count 0x4bdd70 (placed ones
  included) against 0x4bca20's average (completed specialty districts over
  unlocked types), live (`refreshDistrictDiscount`). Open: what the quoted
  price caches (C-105).

## C-74: the random-event step's order — READ

0x338710 (turn ≥ [0x5b8] − 1 + start, option 0x72ce2afb): 0x288f40 — the
droughts' tick 0x2876c0, every storm's walk 0x28ecd0, every one-off's turn
0x289430 — the volcano roll 0x335040, the weights 0x335260, 0x33a280, "Random
Event Roll" (0x287c00 over +0x128), the event 0x334d30, the history 0x2910d0.
The engines (`disasterPhase` / `_disaster_phase`): `stormsTurn`, `fireTurn`,
`volcanoRoll`, `randomEvent`. The step of T+1 follows every player's actions,
the barbarians and the congress of T (runs/h1_duelw1117 t40 → t41), so it
opens `endTurn` / `step` (runs/h1_duelw1118 t8's Warrior). Open: 0x33a280's
draws (C-74).

## C-74: the fire — READ

The birth (0x291a20's one-off arm): "Pick One Off Start Plot" 0x288020
(skipped when a handed plot passes 0x28ec10), naming 0x28c0d0, the record
(+0x988, stride 0x40) on the live list (+0xa00) when Duration > 1, the strike
0x2867f0 at age 0. Per plot not water (0x834d0) nor impassable: each yield row
whose Turn (+0x30, gate +0x2c) is the age draws one "Boosted Yield Chance" ≤
Percentage (ReplaceFeature +0x50 paints, 0xa190d0 adds); each damage row
whose MinTurn / MaxTurn (+0x48 / +0x40) hold draws one "Pillage Improvement
Chance" (CoastalLowland +0x38) through 0x336a50. A forest fire draws six at
age 0, five at 1 and 2 (+ the Turn 2 row), none 3-5, the Turn 6 row at 6
(runs/h1_duelw1116 5 / 5). The tick 0x289430 walks a COPY of the live list;
past start + 9 the record leaves (0x291870).

SPREAD (0x336a50 → 0x33b580): each neighbour within 1 (0x6b1b0; its order
"C-74: the fire's spread") passing 0x339960 — the start test 0x28ec10 (its
RandomEvent_Features: Forest Fire Woods, Jungle Fire Rainforest) and the
spacing 0x290030 — starts the same event there (0x334d30) with its own birth
strike (runs/c74s3_fire*).

## C-74: the one-off start — READ

0x288020 keeps every plot (index order) that 0x28aa00 passes with +0x30 = 1
under 0x28ec10 (functor 0xd267d0, 0x292e10): AvoidTerritory (+0xc8 bit 1)
unowned; +0xc8 bit 4 a test 0x81120 (unread); the terrain list (0x28eab0);
the feature list (0x28e740; none listed passes any); not impassable. One
uniform draw. A meteor's two damage rows draw once each. Confirmed:
runs/h1_duelw1115 t135 (of 159), runs/h1_duelw1116 t243 (of 109, a
Floodplains plot) (`meteorCandidate` / `_meteor_cands`).

## C-74: the drought's strike — READ

0x286530: per footprint plot each damage row holding the age draws one
"Pillage Improvement Chance" (MAJOR one, EXTREME two). Then with the
climate's +0x750 > 0, 0xa1c0c0 per yield: "Remove Fertility Chance" (0xa19bd0)
on c > 0, x = min(value, 100) × c, rand(100) < x mod 100 removes x // 100 + 1,
else x // 100. +0x750: "C-74: the sea's rise halts and removes fertility".

## C-74: the volcano roll's gate — READ

0x335040 over the volcano component (vtable 0xdb11b8): +0x68 0xa1d2b0 the
entries (+0x1a0, stride 0xa0), named ones only with b (+8); +0x50 0xa1d310
the active percent (with the volcanic wonders +0x218; 100 with none); +0x58
0xa1d130 active; +0x60 0xa1d450 total. No draw with N' (named) 0 or N 0; D =
N // (2 × all); below the target no draw unless N' − active > 0, D //=
(target − pct) × N' // 100 when ≥ 200; above, none without an active one.
"Choose Active Volcano Roll" 0xa20f20 draws rand(N' − active) over the
dormant named. Confirmed: runs/h1_duelw1116 t6, t8 no roll. Open: what names
a volcano (`volcanoNamed` / `_volcano_named` a major's first sight; C-74).

## C-16: the espionage roll's bands — READ

"Rolling Espionage Result": one weighted pick (0x287c00) over six weights. A
mission (0x52b2a0, table 0x52b8f0), T from 0x529b60: a5 = clamp(T, 8, 18), a4
= clamp(T − 2, 7, 17), a3 = clamp(T − 3, 6, 16), a2 = clamp(T − 5, 5, 15), a1
= clamp(T − 7, 4, 14); the 3d6 counts (0xf02c70, summed 0x52b5c0) over 3..a1−1
killed, a1..a2−1 captured, a2..a3−1 fail-escape, a3..a4−1 fail-undetected,
a4..a5−1 success-escape, a5..18 success (`missionWeights` /
`_mission_weights`). An escape (0x52aea0, table 0x52b090): killed 3..v−3,
caught v−2..v−1, away v..18. "Police Exit Covered" one weighted pick; "Spy
EscapeRoute" 0x81d360 the AI's route choice.

## H-1: the start of a player's turn — the border pick (witnesses)

Each start draws once per city with a non-empty tie list ("GetNextBuyablePlot
picker" 0x1ab1c0 from 0x1a9bc0), the ties in the scorer's walk within 5 (dq
outer, dr inner; 0x1aa7f0), not index order. Confirmed: runs/h1_duelw1116 449 /
452 multi-plot ties (207 in index order). `randRange(ties)` / `_rand_range`
(`borderBestPlots`, `drawBorderPlot`, `_seat_border_draw`;
`city.nextPlotDraw`).

## H-1: a plot's resource for its owner (strategic access) — READ

0x4aa8e0 (callers 0x4aafd0, 0x4ae4e0, IsResourceExtractableAt 0x4ac120): the
improvement (+0x44, none while pillaged) and a complete (+0xb08, 0x9c83d0)
unpillaged (0x24c3a0) district (0x810d0); 0x4aaa70 answers the resource
(+0x40, count +0x42) when the owner is the player, its condition holds
(0x4ac140), and a district of ANY type stands there or the improvement's
valid list holds it. 0x4aafd0 pays BaseExtractionRate (+0x1c) +
ImprovedExtractionRate (+0x24) under an unpillaged improvement or district.
A Great Wall on Coal extracts nothing. Confirmed: runs/h1_duelw1116 China's
Coal under a Campus powering Beijing t193 on (`extractsResource` /
`_res_extracting`).

## H-1: the plot's Appeal — READ

Rules_Appeal 0x513d70 (cached; vtable +0x28): the city's term (+0x1800,
EFFECT_ADJUST_CITY_APPEAL) first; a natural wonder (0x82e90) +5 and returns,
water (0x834d0) 0, a mountain +4; else +1 for its river (+0x37) or 0x82e80,
−1 for its own pillaged district, −1 for its pillaged improvement, the ring 1
(0x6b1b0 → 0x691f0) through 0x513780, and +1 when the owner holds its
feature's AddCivic (+0xc8; Woods with Conservation; tree +0x1310). 0x513780
per neighbour: a wonder's Districts.Appeal once built, another district's
once complete (+0xb08), 1 less pillaged, nothing building; Features.Appeal +
the city's feature term (0x1b55d0 on +0x1788: Amazon); Terrains.Appeal; −1
pillaged improvement; Improvements.Appeal; the governor's +0xc4 on a bare
feature. Confirmed: runs/h1_duelw1116 4,700 → 156 mismatches (`tileAppeal` /
`_tile_appeal`). Open: the cache's refresh (1110 plots 760 / 761; C-106).

## H-1: the build queue's overflow, the yields' fixed point, the dispersal Gold, the pantheon's price — READ

- The queue's step (0x177d10 → 0x16f050) reads Production via 0x1c5350 as A
  (toward the head) and B (plain). With a head it adds A + the overflow
  (+0x1f4, 0x16f1db) and clears it (0x16f31b); a completion stores min(A, B)
  − the remainder (0x16f3bf); nothing queued adds B to the overflow (0x16f62d
  → 0x0ac650). Confirmed: 1117 Xi'an's Scout 16 / 15, the Builder 0 then 6
  (`City.productionBank` / `city_prod_bank`); B holds no envoy flat (1117
  Rome t15; `CityStats.plainProduction`).
- Research / civic overflows (serializers 0x4c6dc2 / 0x38a93a): the same
  shape on the records (1116 China Pottery 13 / 12; `techOverflow`,
  `civ_tech_ovf`).
- A citizen's share 0x1cbd10: floor(pop · pct · 256 / 100) / 256 (0x16e940;
  Culture 0.3 → 76/256); the city modifier (0xaa740) truncates toward zero
  (1108 Xi'an t95 14.40234375; `citizenYield256`, `withPercent256`).
- An outpost's dispersal 0x52e970: DispersalGold (+0x38) +
  m_axGoldDispersalChange >> 8, through 0x5254d0: 25 online (1116 China t6;
  `CAMP_DISPERSAL_GOLD`).
- The pantheon's price 0x340c90: 0x5254d0(gp +0x5cc), stored +0x128: 12
  online (`PANTHEON_FAITH_COST`).
- A unit's heal 0x538040: gated on +0x1590 and the plot's relation 0x530880
  (1 own / allied, 2 unowned, 3 another's; flags +0x2f0 / +0x290 of +0x12e8).
  Open: the barbarians' no-rest gate (a fit; C-110).

## H-1: every draw of a player's start (witnesses, RandCalls.csv)

`Logs/RandCalls.csv` (`runs/h1_randcalls_duelw1117_1118.csv`: turn, range,
value, the state before, label) holds runs/h1_duelw1117 and 1118 whole (46,082
/ 46,082 values). A start draws, in order:
- before the cities: a city-state's next tech / civic ("BT Research Choice"
  0x763020: the plan's or one uniform draw; "Random Civic Choice" 0x626600),
  a great person's replacement, rarer boosts, "Choose random agenda", a quest;
- each city in order (0x4e4560 → 0x1fa1d0: production, growth, the border
  turn 0x1a9bc0, loyalty): a completed WONDER annexes 2 plots (0x17f870, info
  +0x158 bit 0x40 → 0x1a8a30), one picker draw each, before its grants; the
  border turn draws afresh when the stored plot is −1 or owned (0x1a9e74),
  then the closing pick; a trained Spy's "Choosing a Citizen Name" and offer;
- the picker 0x1ab1c0 draws only over a non-empty list; its callers the
  border turn's two and 0x1a8a30 (the wonder, the founding 0x1a9f10, the
  envoy annex 0x1abf40, a unit signal 0x1abe90).
- Replayed (`startDraws`, `resolveStart`, `start.draws`): 99.4–99.7% with the
  choices resolved, 630 / 631 choices the logged ones. Open: 6-10 a duel
  (C-122).

## H-1: the random promotion offer (0x4f23a0) — READ

From the XP gain 0x55d990 when NumRandomChoices (+0x60) > 0 (and 0x4f2d50
refuses): the class's rows (0x524010) of the list (+0x940), weight 1, drawn
OUT ("Random Promotion", a full shuffle), stably sorted by Level (0x4e6d70),
the first NumRandomChoices offered. Confirmed: runs/h1_duelw1118 t218 a Spy's
17 draws (`drawPromoOffer` / `_promo_offer_draw`).

## C-96: the AI's promotion choice (0x77ac30, 0x774970, 0x7b5d70) — READ, ported for the city-states (the modifiers' term unread)

The tactical move Promotion 0x77ac30: each live pool unit (+0x240, +0x770)
with a promotion due (0x116f80 on +0x1bc0) ("Promote"); 0x774970 takes the
first UnitPromotions row (database order, earnable 0x55d750) strictly above
the best by 0x7b5d70 (horizon [GlobalAI+0x2f0][0], discount 0x6fec30): −9999
past the horizon; a = the unit value ([player+0x1290]+0x268, 0x79ca90) ×
min(+0xcf0, global +0x328) / max HP, PV(horizon) − PV(start), + max(the
modifiers 0x7a4b20, 5 × Level +0x24). Operation Protect Units 0x80d790 and
0x70fae0 take it too. Confirmed: every city-state pick of
runs/h1_duelw1117-1128 is the first row of the highest Level
(`aiPromotionPick`, `_tac_promotion`). Open: the modifiers' analyzers (C-96).

## H-1: the World Congress slate (0x598270) — READ

At the session: the resolutions in their era (+0x68 / +0x98) that
`CanUseResolutions` allows, split by InjectionOnly (+0xb8, `dll_rowmap.py 0xa6a7b0`): of the rest min(3,
n) "World Congress Resolutions" draws without replacement (0x59a680), the
first two voted, the third dropped; then one draw over the InjectionOnly rows.
Then 0x596b40 (from 0x599275) over the +0xb40 table (0xad5430): rows with
+0x48 and +0x50 set and not in play (0x27a680 → 0x25bef0 −1 at +0x0 / +0xc),
one pick (0x59a540) appended at +0x310 — the EMERGENCY_TRIGGER_WORLD_CONGRESS
competitions in their era. Confirmed: runs/h1_duelv1127 t61 10, 9, 8 → Trade
Treaty, World Religion; 1117 t161's World's Fair (`drawCongressSlate` /
`_congress_draw_slate`, `CONGRESS_COMPETITIONS`). Open: the +0xb40 row order
(C-121); the targets (0x611140..) are the AI's.

## H-1: the random boost and free research pickers — READ

0x4ca470 (civics 0x39c330), "Choosing random tech / civic boost to grant based
on era": the earliest era with a row neither held nor boosted carrying a
Boosts row; its rows (+0x168) weight 1, n draws without replacement
(runs/h1_duelw1117 t6 8 techs). 0x4caa50 (civics 0x39c930) over eras lo..hi
("..., Player: n"). 0x4caeb0 (civics 0x39cd90), "... to grant based on era":
one pool of the researchable (0x4c8c40) (1117 t226). `BOOSTLESS`,
`boostPool`, `drawBoosts` / `_draw_boosts`, `grantFreeResearch`.

## H-1: a boost lands as progress — READ

0x4cd900 (civics 0x3a3c00), past 0x39d190 / 0x39d1f0, marks the boost, finds
the row (0x3990d0); 24.8: B = 0x161d60 = floor(Boost × cost / 100) (cost
0x29a010 / 0x353a70); q = (B<<16) / (cost<<8) (0x16e940) × 100 (0x16e7d0) +
m_iModifiedBoost (+0xf8 << 8); amount (cost<<8) × q / 25600, fraction dropped;
min(cost − progress, amount) to THAT item (0x393670 → 0x3a1fb0), completing
at the cost (0x3a22c5 → 0x3a1ac0). The cost is never cut. Check:
`dll_boost.py` 29 / 32 (Rome Astrology 25 → 9). `boostAmount`, `markBoost`,
`_land_boosts`.

## H-1: the upgrade's gold — READ

0x5376d0 (via 0x590520), 24.8: UPGRADE_BASE_COST 10 (gp +0x740) at the speed
(0x525400); net = (new − old cost, 0x4f2b20) × 100% (+0x74c), ≥ 0; base + net
× 2 (+0x380); × 2 Corps, × 3 Army; less +0x398 (Force Modernization); at
least UPGRADE_MINIMUM_COST 15 (+0x744) at speed (0x5254d0); a levied unit
less +0x458 and +0x748; down to PURCHASE_DIVISOR (+0x5b0). Confirmed:
runs/h1_duelw1117 China t25 Slinger → Archer 30 (`upgradeGoldCost` /
`_upgrade_gold_cost`). Open: whether 0x4f2b20 carries the player's unit-cost
percents (C-105).

## H-1: the barbarians' turn (0x1514a0) — READ (the max camps and the sight LAB)

The manager's turn (`barbarianRules`, cpu/core/barbarians.ts;
`_barbarian_rules`, gpu/core/sim_barb.py), first in the turn's close: techs,
camps, each living tribe's turn in order, the clans' 0x8e1bf0 (none here).

- Techs 0x14f530: the BarbarianFree techs (Sailing, Bronze Working,
  Shipbuilding) and any tech / civic held by max(1, (50 × living majors + 50)
  / 100) living majors.
- Camp step 0x14fcc0: target = max camps (+0x110) × the land no major sees
  (0x50b2d0 on 0x253718b0) / all land, less the standing camps (+0x170); the
  first adding step adds 33% of it, later ones 1. The regions are Map_Region
  (+0x620, filled at 0x153290 via vfunc +0x108), taken when the region's (+4)
  or its area's (+0xc via vfunc +0xd8) plot count is over 10 ("The map's
  regions" below); each keeps its best plots ("Barbarian Camp Evaluation" jobs
  0x14fd6f, waited 0x14fe72); "Barbarian camp region placement" weighs the
  top-score regions by plot count, "Barbarian camp location" uniform, the
  region's weight then 0; adding more, a plot within 7 of a tribe is passed.
- Plot score 0x151fa0: unowned, seen by no living player (0x50b180 over
  +0x4a0), camp terrain / feature, NO resource (0x35fd60 for player −1;
  0x5112f0 gives −1 every resource: 1118, 1119, 1123, 1128 t1), no major city
  within 3, no camp within 7; score = max(0, nearest + second tribe distance
  (dead counted) + the nearest plot of the camp list) + the farthest major
  city within 7. The camp list (+0x4a0, AutoVariable +0x448) takes every new
  camp (0x154642), cleared only at init (0x155aae); 0x152b50 its least
  distance. Confirmed: 1126 t3 (996 / 1041 tie, pick 996), 1117 t8.
- Tribe kind 0x154220: NAVAL on an area under 15 (0x153d60: +8 the CvArea,
  0x25990, +4 its count; GetAreaID 0x259c0) or 4 water neighbours one not a
  lake; CAVALRY with unowned Horses within 3; else MELEE. "Barb Tribe Roll"
  0x152460 over the kind's free names.
- Tribe init 0x147fc0: an anti-cavalry defender, the scouts within 3; the
  chooser 0x147470 the first highest-Combat unit allowed; rings 0x69010 (the
  centre, then each ring from (0,1),(-1,0),(1,-1),(0,-1),(1,0),(-1,1) along
  sides 1,2,0,4,5,3).
- Tribe turn 0x1488a0: the clock to TurnsToWarriorSpawn (scaled); on a spawn
  turn (0x148ab6..0x148c08) the queue's head (+0x90, count +0xa0) raised
  straight (0x144fb0, uncounted; 0x148ac6) and popped (0x149f30); else the pending class
  counts +0xa8..+0xb4 (0x148b18; 0x144b20 / 0x144bf0 / 0x144e00 / 0x144ed0; written only
  by the load 0x1433b0 / 0x143d80 and the copies 0x14c930 / 0x142650 / 0x142e90 / 0x7ca670, so 0); else under
  NumMilitary (+0x30) "Barbarian Ranged unit roll" rand(100) <
  PercentRangedUnits; off a spawn turn a tribe short of its scout counts 5
  and raises one.
- The counts are the tribe's own: +0x34 (zeroed at 0x147fc0) by each melee /
  ranged raise (0x144bb8 / 0x144c88; the defender 0x144940, the queue 0x148af1,
  siege, support uncounted), +0x28 by each scout (0x144cc0, 0x144dc4); only a
  battle lowers them (0x1540b0 → 0x148e90): a scout (+0x1c0 2) +0x28 and its
  wait +0x2c, any other but support +0x34 (no other write in 0x144000..0x156000). A unit lost otherwise still counts
  (`BarbTribe.unitCount` / `scoutCount`, `tribe_unitn` / `tribe_scoutn`).
  Confirmed: runs/h1_duely1128 tribe 2 every seventh turn t89-166.
- The battle (0x1540b0) books only unit against unit (a city's or district's
  shot skips), the full-damage side (0x56e0d0) dead, the tribe the barbarian
  side's (+0x11d0); the replay books recorded dead from UnitKilledInCombat
  (`barbBattleDeath`, `barbBattlesFromRecord`; runs/h1_duely1128 t36).
- The queue: Barbarian Recruit's failure (0x7c7ae9 → 0x155b50 → 0x149750 →
  0x0f03b0) ASSIGNS the missing list (0x7c62f0, per class).
- The most camps (+0x110, AutoVariable +0xb8): set once at init (0x153659) =
  living full civs (+0xb50) × BARBARIAN_CAMP_MAX_PER_MAJOR_CIV (+0x7c, read
  0x2d5d0e); +0x170 rises at a tribe, falls at its camp's removal (0x154874).
- The unseen land: 0x50b2d0 walks every living player (+0x50) but tribes
  (0xd959ec24) and city-states (0xc2577075, 0x469de0) — the Free Cities count;
  per player its team's visibility counts (+0x30 by team +0x128, or +0x48 /
  +0x50; array +0x290) above 0 now. Writers of the counts (0x508d50): a unit's
  sight (0x58f3f0 → 0x58b1d0), SetOwner 0x84760 on the plot and its ring, an
  improvement's owner (0x362ec0 → 0x84340), and outgoing visibility (0x508330)
  shared by the suzerain's update 0x451b20 and alliances (0x2ab4f0, 0x2aba80):
  a major sees what its city-states see. Confirmed: runs/h1_dueld1128 "No
  Visibility" 267 → 212 at Hong Kong (t64); `cpu/harness/sightLab.ts` 1,065 /
  1,245 turns (`plotsSeenNow`, `_barb_seen`). Open: alliances' share,
  the sight's residue (C-124).

### The map's regions (AnalyzeChokepoints, Region_Builder) — READ, ported

Map_Region (+0 id, +4 m_plotCount, +0xc m_area), built by
TerrainBuilder.AnalyzeChokepoints (0x2b500 → 0x8923f0 → Region_Builder
0x887810: the chokepoint analysis 0x86c030 on the builder's +0x20, then the
flood). XP2 Continents.lua calls it twice; the second wins. Ported in
`tools/civ6map/chokepoints.py` / `regions.py`, checked stage by stage against
0x86c030 under unicorn on all 26 duels, the chokepoints equal to
Logs/AI_ChokePoint.csv on 1126, 1127, 1128.

- Points 0x87a030: every water / impassable plot, sorted (0x880590) by x, even
  rows first, then y; axial q = x − ⌊y/2⌋.
- Triangulation: leaves of three (0x87a470, 0x86b440), merged pairwise
  (0x87eff0 / 0x87ed40 / 0x86a460): the base the first pair crossing no edge
  (0x8808f0, X = 2q + r), zipped (0x87a6c0) by cosine on the hex geometry in
  float, in-circle 0x878f90.
- Pruning 0x87f7a0: triangles of touching obstacles.
- The dual 0x872580: a cell per triangle at its circumcentre (small maps
  0x86f1a0 in 24.8 fixed point); neighbours across non-neighbour edges.
- Cells without neighbours go (0x87f480); radii shrink to the nearest
  obstacle (0x8801d0, 0x871f00, 0x877890); narrow leaves go (0x87f1b0,
  0x87f5b0).
- Marking 0x87d6a0, linking 0x8759a0 (each path's narrowest cell flagged 1),
  cleaning 0x871d70.
- Merging 0x87e150 (0.9 / 0.85; 0x87df70), only while the analysis log exists
  (0x87a381).
- Chokepoints 0x8783c0 (0x876830, 0x873b00); 0x87cff0 keeps a pair whose line
  (0x38070 of 0x371d0) lies in one area.

Region_Builder: per index-ordered plot of no region, passable land, a flood
(0x77d10, visitor 0x886dd0) through the step test 0x887aa0 (refusing steps
across a chokepoint segment). The camp step admits a region of > 10 plots or
on an area of > 10 (0x153290).

## H-1: the raids — READ

`barbarianScouts` / `barbScoutLook` / `barbBattleBoldness`
(cpu/core/barbarians.ts), the operations in cpu/core/barbarianOps.ts; GPU
gpu/core/sim_barb.py, gpu/core/sim_barbops.py.

- Boldness (tribe +0x20): +2 each tribe turn (0x148ca3); a battle
  (0x1540b0 → 0x148e90): a kill +15, a unit lost −10, a scout −5.
- The report 0x153ef0 (bound 0x153b0d to signal +0x10c8, raised by 0x58aa90
  when 0x508d50 answers 2: the plot newly visible to the barbarian PLAYER; a
  move adds new sight before dropping old, 0x586d40 → 0x58f3f0): a scout
  (+0x1c0 2) seeing a city's owned plot past its owner's throttle (+0x3d8,
  +0x430) starts ScoutingBehaviorTree via 0x1485c0 when none runs (+0x38) and
  the owner is a full civ (0x484a10 → 0x469db0); the throttle = turn +
  max(0, 18 − handicap (+0x908) × 3). `barbScoutLook` / `_barb_scout_look`.
  Open: which of a captive's sight sources counts (C-123).
- Notify Owner 0x7c6fa0 → 0x153ea0 → 0x148270: boldness ≥ RaidingBoldness
  (+0x24, a name's +0x38), no raid (+0x3c), no bribe → the raid starts
  (0x149980), else listed (+0x48); a raid's own tree: CityAttackBoldness
  (+0x1c), the assault 0x1497d0 or its list (+0x60).
- After its spawn (0x148cad..) the tribe turn forgets a gone operation (0x148c6b), starts a
  waiting assault (+0x70) at CityAttackBoldness, else a waiting raid (+0x58).
- "Raid City" / "Barbarian City Attack": Spawn Change 0x7c6e50 (the force
  0x147640, by RaidingForce and the target's handicap) sets the interval to
  its SpawnRate (0x14fc30 → 0x149760, +0x88); Recruit 0x7c7580 under a Turn
  Limiter (10 / 15): counts 0x144610 (unraisable classes dropped, 0x147e70);
  failing, the missing classes to the queue. The raise 0x144fb0 resolves a
  class through 0x147470 at the raise (runs/h1_duelw1127 t34-35)
  (`BarbTribe.queue` / `tribe_queue`, `raise` / `_barb_raise`).
- The recruit's request (0x7c7580 → 0x60a8c0, evaluator +0x12d0) walks the
  units (+0x12e8 → +0xd8) unassigned (+0x7d0), alive; they join in pool order
  (0x6092c0, 0x737e80; runs/h1_duelw1127 t35). The tribe's request 0x7c62f0
  (vtable @d72bb8) takes the tribe's units (+0x11d0), scouts too
  (runs/h1_duely1128 t224 the Ranger), per class (0x8c2880, never
  CLASS_ZOMBIE); a full class swaps for the first held one with strictly more
  damage (+0xcf0; 1121 t11 Horseman 851980).
- Confirmed: 1124 camp (40,21) t8 home, t9-12 W W S S with no roll, the clock
  at t19. Open: a unit raised in the turn not yet recruitable (0x60a8c0 /
  0x5c2650 / 0x6096c0; C-123).
- Protect Unit (node 3; Damage Percentage .25): 0x7f07c0 counts units with
  damage ≥ that share (0x56e0d0) on a plot above 0 of the influence map
  (+0x12d8, 0x716a90); any → 2 and the move waits (1121 camp (3,19) t24-33;
  `dangerPlane` / `_danger_plane`).

## H-1: the sight rule — READ (the walk 0x58b1d0, emulated); a city's look — READ

0x58b1d0 (callers 0x58f3f0 / 0x58f170, the explore counts 0x70a6c0 / 0x70a8b0)
builds a (plot, ring) list: range, the eye's x, y, seeThroughFeatures,
seeThroughTerrain. Rings 0..range + 1 in axial steps (0xeff670 / 0xeff688,
turns 0xeff6a0). Per plot:

- parents: two neighbours by the walk's direction (0: 1, 2; 1: 3, 2; 2: 3, 4;
  3: 4, 5; 4: 5, 0; 5: 1, 0) at distance ring − 1 (0x58ae50); a value ≥ 2^24
  is split;
- own height 0x58d1c0: terrain SightThroughModifier (+0x34) + feature's
  (+0x44), unless seen through; 0 on ring range + 1;
- the carrier: the one present; equal → the first unless split; split gives
  way; else the line from the eye in 24.8 on wrapped coordinates (X = 256x +
  128 on odd rows): the nearer by > 12 carries, within it both — the lower
  carries, stored max(lower, own) + 2^24 when the higher exceeds own;
- listed when the carried value is below own or no higher than the eye
  (0x58af70: SightModifier +0x30, 1 on a centre or a ZOC district 0x24c2f0),
  not on ring range + 1.

Confirmed by emulation (`tools/civ6lab/dll_sight.py`): `losDisk`
(cpu/core/fog.ts), `sight_tables` / `sight_walk` (gpu/core/simbase.py) 45,760
looks; 1127 t2 Rome's Settler leaves (34,14) dark.

A city's look is its owner writes: SetOwner 0x84760 → 0x508d50 on the plot and
its six (vtable +0x58): a founded city reveals two rings (`cityLook`,
`_city_look`; 1117 t1 Rome (12,16) dark to t3). A met city-state's centre and
ring revealed (32 / 32; `meetCityState`).

## H-1: the draw log's labels (RandCalls.csv) — READ

The game's draw log (`cpu/harness/randLog.ts`: `<dump>.randcalls.csv`, or a
shared `h1_randcalls_duelw<a>_<b>.csv`). The label map — every label, the
engines' site, its owner (rule / AI / set-up) and where in the turn it falls
— is `cpu/harness/drawSites.ts` (`DRAW_SITES`, `ENGINE_ONLY_SITES`), checked
per turn by `turn.draws` (`drawLedger.ts`). The biggest on runs/h1_duelw1117 /
1118: Random Direction (AI; act, barb), Pillage Improvement Chance and Boosted
Yield Chance (step), GetNextBuyablePlot picker (start, act), Random Diplomatic
Value (set-up), Unit Combat Damage. The engine-only sites are the minors' walk,
builds, buys and the pantheon pick (the AI's stand-ins).

- The random-event step is the run holding the gap's last "Random Event Roll"
  (`loggedStep`); the era's quests and boosts may follow it. The turn the sea
  rises the roll is over 1 (1117 t224).
- A unit that died in an event is in no record: the log's damage rolls place
  it (1117 t223).
- The harness replays the start draws (`logStart`): 1117 1,740 / 1,743.
- Open: the barbarians' camp step and ranged roll, unit / region names,
  antiquity eras, artifacts (C-122, C-124).

## C-74: the fire's spread — READ (the order)

The walk 0x6b1b0 → 0x691f0 is the ring walk over the table at 0xf0bf40 —
(0, 1), (−1, 0), (1, −1), (0, −1), (1, 0), (−1, 1) in (x − y // 2, y): SE, W,
NE, NW, E, SW (`RING_DIRS`). Each neighbour passing 0x339960 (0x28ec10 and
0x290030) is born at once in that order and ticks in it. Confirmed:
runs/h1_duelw1118 t22 Rainforest 665 lit 664 before 621 (`fireStrike` /
`_fire_strike`; `replayEvents`). Open: the established governor's +0xc8 that
keeps a fire off a city's plots (0x33b580; C-74).

## C-74: the drought's start pick — READ (REVERSED)

0x287e80 lists every plot whose score 0x28ff20 is above 0 (0x28aa00 with the
predicate × (Spacing + 1), less Spacing − d near a live drought) and draws
`rand(n)` over the COUNT (thunk 0x152eb0): the scores are never read.
Confirmed: runs/h1_duelw1118 t92 / t102 over 1, t138 / t151 over 3
(`droughtStart` / `_drought_start`).

## H-1: a city-state sees its suzerain's resources — READ

0x4ac140 (0x4ab4b0's condition): the player's reveal bit (+0xf0), then its
suzerain's (+0x1368 → 0x44c850) condition recursively, the reveal modifiers,
the tech (+0xc8) and civic (+0xc0). Confirmed: runs/h1_duelw1117 Antananarivo
t85-90's Niter (`hiddenResourcesFor` / `_res_hidden`).

## H-1: the envoy annex — READ (settles the extra border picks)

0x1abf40: a city-state whose level CanAnnexTilesWithReceivedInfluence (+0x28
bit 4), E envoys held (0x44c4b0), A annexed past its starting tiles (+0xc −
0x1ab460): E > A annexes E − A plots (0x1a8a30, one picker draw each), in
the major's start as it sends envoys. Confirmed: runs/h1_duelw1117 t28
Caguana's two (`startDraws`).

## H-1: a city's name, a citizen's name — READ

- "Choosing a City Name" (0x327c30 → 0x327a70 → 0x328de0): a CapitalName
  without a draw; else the CityNames rows not used, the first max (10 unless
  0x28a940's row sets +0x1c), weighted n..1, one draw over n(n + 1) / 2 (1117 /
  1118 21 / 21 over 55; `foundCityAt`, `CITY_NAME_DRAW`).
- "Choosing a Citizen Name" (0x486c20): one draw over the unused
  CivilizationCitizenNames. Units: creation 0x4eeb70 → 0x486bf0 where Spy
  (+0x1ba bit 2) or ExtractsArtifacts (+0x1b9 bit 1, `dll_rowmap.py
  0xa6f2b0`) and +0x1458 clear — the Spy and the Archaeologist
  (runs/h1_duelw1118 t231). A storm (0x28d4f0): the major owning its plot
  (0x469db0), else the one whose city is nearest (0x36f6c0). `drawCitizenName`,
  `CITIZEN_NAMED_UNITS` / `_type_named`, `stormNamer` / `_storm_namer`,
  `Seat.citizenNames` / `civ_citizen_names`.
- "Random Era for Antiquity Site" (0x280140 from 0x2805f0): era i < n weighs
  n − i + 1 over n(n + 3) / 2 (1117 t217 over 35, 44, 9). Game_Archaeology
  0x27f640 lays a kind's sites once (done flags +0x180 / +0x1e0) at the first
  revealing civic: history-event plots 100, neighbours 50, then random;
  0x2805f0 draws only for a site with no history (0x280664 → 0x280752; 0x27fe90).
- An Apostle or Rock Band draws its offer at birth however it comes (1118
  t224; `offerApostlePromotions` / `_offer_apostle_promos`).
- Open: "NameManager::GetUnitNamePart"'s units (C-122).

## H-1: a start's own event rows, the wonder's annex, the village a claim takes

The record's `actions` hold a start's rows in order (`startRows`):
- A wonder's annex (0x17f870 → 0x1a8a30) fires its CityTileOwnershipChanged
  rows before WonderCompleted, one picker draw each (an empty list none: 1117
  t217 Meenakshi), then the grants, then the closing pick; a camp it clears
  draws "Barb Tribe Roll" (1121 t190).
- A claim takes the stored plot or a fresh pick (1123 t202); an envoy annex
  lands among or after the closing picks (1118 t66).
- A village a claim takes: Type, Sub Type, the reward's draws (1118 t189).
- A city-state met in the start picks a quest (1117 t249).
- A city founded after its owner's start holds no next plot.

## H-1: the goody hut's kind — READ

0x42bdd0: over the GoodyHuts rows of the popped improvement (+0x38 → +0x14),
Weight (+0x1c) × the count of all rows (800) in 24.8, halved per time the
player had that kind (+0x100[kind], bumped 0x42c875), floored at 1.0 below
2.0, rounded half up; a kind counts only with an eligible subtype (0x42c980,
its Turn through 0x5254d0). One "Choosing a Goody Hut Type" over the sum, one
"Choosing a Sub Type". Confirmed: runs/h1_duelw1117 t5 4,000, t7 3,600
(`goodyKindWeight`, `drawGoodyReward` / `_draw_goody_reward`,
`Seat.goodyKinds` / `civ_goody_kinds`, `goodyEligible`). The other gates: "H-1:
the goody hut's other gates and the Relic".

## H-1: a natural wonder's eruption — READ (the order; REVERSES the ring walk)

0xa22150 runs 0xa1c760 then 0xa21680 PLOT BY PLOT: per wonder plot, per damage
row, the plot itself (impassable: no draw) and its six (0xeff670 / 0xeff688);
the soil likewise, labelled "Pillage Improvement Chance". Confirmed:
runs/h1_duelw1119 t120 Eyjafjallajokull's two plots; 1121 Kilimanjaro
(`eruptionRings`, `erupt` / `_eruption_ring`, `_erupt`).

## H-1: the forced sea rise, the dig sites, the droughts the game leaves out

- The sea's rise (RANDOM_EVENT_SEA_LEVEL_RISE1–7) is the next step's event by
  force, its roll over 1 (1117 t224; `seaRiseFrom` / `sea_rise_from`,
  `seaRise` / `_sea_rise`).
- 1124 t162: the drought's start leaves out a storm's plots ("C-74: the
  drought's storm bar").

## H-1: draws with no game site

The pantheon pick (`_seat_pantheon_race`) has no labelled site: the engines'
draw is the driver's stand-in. The Free Cities' grant ("Free Cities Unit
Choice", 0x274010) is one weighted pick (`freeCityGrantType` /
`_free_grant_type`).

## H-1: a wonder's and an improvement's tourism — PARTLY READ

- A wonder (0x18e160; the city walk 0x18ffe0): TOURISM_BASE_FROM_WONDER 2
  (gp +0x6c4) + (with +0x6c0) the owner's era (0x467eb0) less the wonder's
  (PrereqTech +0x210 → +0xc0, else PrereqCivic +0x220 → +0xc8, else 1) where
  later; × the city's percent (0x1abe50 on +0x1ac8) (`wonderTourism`,
  `WONDER_TOURISM_BASE`).
- An improvement (0x399e10 at 0x39a73c; the city 0x1aba40): its
  Improvement_Tourism row with PrereqTech (+0x60, 0x39d1f0) and +0x68 (0x4cb2f0)
  held; source 6 the appeal (vcall +0x28), else the plot's yield 0x82280 (→
  0x538a60) with the last flag false less with it true, × ScalingFactor / 100,
  × the city's +0x1b20. Open: 0x538a60's fifth argument (1117 t222; C-118).

## C-94: Sovereignty's route yield — READ

- EFFECT_ADJUST_PLAYER_TRADE_ROUTE_BY_CITY_STATE_BONUS_TYPE_MODIFIER (factory
  0xc27d10, vtable 0xdecb08: 0xb468d0 / 0xb47620) adds Amount 100 into
  Congress's +0x4b8 by MinorCivBonusType.
- 0x54c6c0 per yield: X = the destination's route-to-others row (+0x1ee0,
  +0x28 via 0x1f9650); a major's city adds X; a minor's (0x469de0, 0x467f50)
  X × (100 + a) / 100, a the ORIGIN's Congress entry (0x37b7a0 → 0x552d40),
  nothing when a ≤ 0 (`sovereigntyRouteYields` / `_cs_route_sov6`,
  `CITY_STATE_ROUTE_TO_OTHERS`). Confirmed: 1117 Xi'an → Caguana Culture 1 → 3
  t62-81.
- A route to a minor is international to Reform the Coinage (1117 +6 Gold
  t108-120).

## H-1: a city centre's floors — READ

0x538a60: the plot's rows, then on a city (0x81120) Food up to 2 and
Production up to 1 (gp +0x7d4 / +0x7dc, cmovl 0x53916e), THEN the effects'
rows (0xc7e9b0) and the neighbours' (from 0x5391c0) — Feature_AdjacentYields.
Confirmed: 1121 Chengdu beside Yosemite Food 3 t221-250
(`tileYieldsForCenter`, `wonderAdjacentYields`, `tile_nw_adj`).

## H-1: the luxury allocation's rebuilds — PARTLY READ

- Player DoTurn 0x4e4560: the culture (+0x1310, 0x396860), the resources
  (+0x1320, 0x4a8ed0 at 0x4e46c0: holdings 0x4ab6e0, then the rebuild
  0x4a6110), the governors' clocks (0x432980 at 0x4e46df), then each city's
  turn (0x1fa1d0 at 0x4e4813, the loop from 0x4e47bc over +0x12f0). 0x36f420
  at 0x4e4665 is not the city turn. Confirmed: 1122 t200 Reyna's amenity ranks
  nothing to t201.
- ChangeResourceAmount 0x4a7560 rebuilds at once (0x4a77d4, unless the flag
  +0x45e) for any ownership-0 change and any non-accumulated import / export.
  Callers: a completion's strategic cost (0x18433d building, 0x184d95
  project, 0x1856b3 / 0x185a2a unit), an extracted resource changing (0x4ab4d0
  from 0x4ac2e0..0x4ad0d0; accumulated ones skip), the recipients' copies
  0x44eff0, the power ledger 0x4a7cc0.
- A suzerain CHANGE (0x451b20, from 0x44a040 / 0x450fb0 / 0x451460) takes the
  city-state's resources off the old (0x4a91a0) and gives them to the new
  (0x4a6d90 → 0x4a7560). A minor's own change re-hands its copies (0x44eff0;
  recipient counts +0x8a0 / +0x918). The per-luxury / bonus extras (+0x160 /
  +0x1c0; 0x4a7100 / 0x4a70c0) rebuild too.
- A founding does not rebuild (`foundedUnallocated`: 124 / 128 founding
  windows of 1117-1124, 1129-1131); a suzerained minor's upgrade re-ranks
  nothing (1123 t82).
- The turn end's cap (DoTurnDeactivate 0x7eb60 → 0x4e4ad0 → 0x4a8f10): per
  accumulated resource, stock − reserved (0x4aa530, +0x528) strictly over the
  cap (0x4aabe0: 0x5254d0 of StockpileCap + +0x858) is handed back through
  0x4a7560 — a rebuild. Online the cap is 25.
- A suzerained city-state banks no income (runs/h1_duelw1121 Hunza 29 → 25
  from t41; `stockpileIncome`, `_seat_stock_income`).
- The reservation (0x17f3a0 from 0x17f070): a front unit with a strategic cost
  and no progress (0x17d1a0) reserves it (0x4a7400) when covered (0x4aa790),
  else leaves the front; the completion releases and charges together.
- Hattusa's suzerain (MINOR_CIV_HATTUSA_<R>_RESOURCE_XP2) banks 2 a turn of
  each strategic it sees and improves nowhere (runs/h1_duelw1103 t64).
- Open (C-104): the policy-change trigger; 1128 Nazca's Holy Site accruing 4
  the turn it completes; 1119 t93, 1120 t95, 1123 t91, 1131 t53, 1125 t157.

## H-1: the governors' clocks — READ

0x432980 (from 0x4e46df, after culture and resources, before the cities):
0x35df30(location, 1) raises the posting's count (+0x28), at EstablishTurns
(0x433180) "Governor Established" (0x35e5f0); the neutralize clock (0x35e1f0 →
0x35d220(−1)); each logs GovernorChanged (0x8b9120, 0xcb6c9e05). Confirmed:
1117 Reyna seated t94, established at record 100 (`governorPhase` =
`governorClocks` then `applyGovernorActions` / `_governor_apply`;
`_governor_phase` / `_governor_clocks`).

## H-1: the border bank in fixed point — READ

0x1a9bc0 banks the culture c (1/256, 0x1ab060) × the border percent [+0x14]:
((c × ((pct + 100) << 8)) >> 8) / (100 << 8), each truncating (0x16e940;
0x1a9d25..0x1a9e16). Confirmed: 1121 Taiyuan t40-45 153/256 → 175/256 at +15%
(`cityBorderGrowth` / `_seat_border_growth`).

## H-1: war weariness per combat — PARTLY READ

0x1fb680 per side, the attacker "Attacking": loc = 1 in allied lands (gp
+0x76c) else 2 (+0x770), +3 killed (+0x774), +10 WMD (+0x778); base = 16
(+0x780) + the era's WarmongerPoints (+0x30) × X / 100, X = min(the war's
WarmongerPercent, the cap +0x1a48) (0x3d1450); amount = loc × base × (100 +
+0x18c8 + the foe's +0x1808 [+ +0x1868 allied]) / 100. Confirmed:
Player_WarWeariness.csv 1119-1124 Rome (2 / 5 / 1 / 4) × 52. Open: the
defender's branch, China's 78s; not shipped (C-109).

## H-1: the best melee from the log — READ (as above)

0x4c1a30 ("H-1: the best melee ...") raises at every unit made, an upgrade
too, a unit made and removed before the record included (1121 t43 Heavy
Chariot); the importer reads CityProductionCompleted, CityMadePurchase and
UnitUpgraded (`advanceHistory`).

## C-74: the drought's storm bar — READ

0x28de40 (0x28eb60's last clause) walks EVERY m_aStorms record (+0x8b0..+0x8b8,
stride 0x68) and its struck list (+0x38..+0x40); a storm's end (0x28ecd0 →
0x291940) clears its live flag (+0x58) and live handle (+0x8d0) but keeps the
record (0x28e240 rebuilds on load). So a plot any walk struck bars a drought,
with its neighbours, for good; a birth's strike marks a copy (0x291a20).
Droughts (+0x948) feed only 0x28ff20 → 0x28ce90. Confirmed: runs/h1_duelw1124
t162 / t194 / t234 leave out 277, 278, 319 (`Tile.stormStruck` / `storm_scar`,
`droughtCandidate` / `_drought_cands`).

## C-74: the sea's rise halts and removes fertility — READ

A RANDOM_EVENT_SEA_LEVEL_RISE row (0x291a20's arm) writes +0xc8 bit 2 → +0x588
(HaltsFloodFertility), bit 3 → +0x5e8 (HaltsStormFertility), +0x2c → +0x648
(FertilityRemovalChance): RISE4 halts both, RISE5 / 6 / 7 remove 15 / 30 / 45.
After it:
- a flood (0xa2f200) skips its yield pass 0xa2ed80 (runs/h1_duelw1124 t243);
- a storm's strike (0x286f80) draws no yield row, and with removal > 0 runs
  0xa1c0c0, the count off FertilityAdded (1123 t243);
- a drought (0x286530) runs 0xa1c0c0 with removal > 0.
0xa1c0c0 → 0xa19bd0: per yield with c > 0 (map +0x110), x = min(chance, 100)
· c, rand(100) < x mod 100 removes x // 100 + 1 else x // 100; a fire's rows
add to c (1122 t248). Eruptions and fires read no flag. `floodFertilityHalted`,
`stormFertilityHalted`, `fertilityRemoval`, `removeFertility` /
`_flood_halted`, `_storm_halted`, `_fertility_removal`, `_remove_fertility`.

## H-1: the Floodplains list — READ (REVISES the river walk)

0xa2aca0: the river's plot list read from the mouth, each plot asked 0xa2c060:
one that takes Floodplains joins the run, the run full at 10 ends it; one that
takes none ends a run of 4+ else clears it. The list: from the source each
edge adds its own plot then the plot across, each once — a plot stands where
the river reached it LAST. Confirmed: runs/h1_duelw1123 river 181 at 480 (t78,
t128) 10 plots (`floodplainList`; the engines' own rivers `floodRanks`).

## H-1: the goody hut's other gates and the Relic — READ

0x42c980 per subtype (+0x50): bit 3 RequiresUnit; bit 1 MinOneCity (0x4bd370);
bit 2 Relic (0x497030 a relic slot); +0x1c Turn at speed; the XP2 row (+0x18)
+0x28 bit 0 CityState (a met minor, 0x3daaf0), bit 1 StrategicResources (a
seen strategic, 0x4ac140, below its cap 0x4aa790 / 0x4aabe0) (`goodyEligible`
/ `_goody_eligible`). A Relic however it comes: Game_Culture 0x296c00, one
"Choosing a Relic" over the uncreated GREATWORK_RELIC rows (runs/h1_duelw1119
t13 over 24; `createRelic` / `_create_relic`, `relicsMade` / `relics_made`).

## H-1: draws the AI takes, draws the engines lack

- "NameManager::GetUnitNamePart" (0x328760, via 0x327d50 / 0x327de0): the
  AI's log names ("HL: Rock Band Move" 0x710f40, CITY_ASSAULT 0x722690).
- A plot first revealed (0x534950 from 0x58aa90) names its river (0xa29730 →
  0xa292a0 "Random River") and territory (0xa36ff0; 0xa36400 "Random Lake
  Range"). Open: the engines name no region (C-119).
- Game_Quests 0x939980: "H-1: the city-states' quests".
- A record read before its player's start (1117 t168, 1120 t95, ...) shows the
  turn before's culture and next plot; a plot gained by a unit's move is no
  claim (runs/h1_duelw1120 t161).

## H-1: the city-states' quests — READ

Quests_Manager.cpp. A record (stride 0x24): +0 state (1 standing, 2 done, 3
failed), +4 client, +8 actor, +0xc type, +0x10 id, +0x14 start, +0x18 done
turn, +0x1c target; standing +0x110 (data +0x168), completed +0x188 (+0x1e0;
0x939f70). Check: `tools/civ6lab/dll_quests.py` (selects 335 / 341, pickers
261 / 264 over the 29 duels).

- The logics (0x93aaa0, this order): Convert, Send Trade Route, Clear
  Barbarian Camp, Train Unit Type, Zone District Type, Tech Boost, Civic
  Boost, Recruit Great Person. Vtable +0x40 validity, +0x48 picker, +0x38
  hooks, +0x50 reward (0x84a0e0: one envoy).
- Given (0x939980): 1 − the pair's standing; the type of its last completed
  quest skipped; IsValidToStartQuest 0x849110 (alive +0x728, minor / major
  0x449cc0 / 0x449940, met 0x3daaf0, not at war 0x3dcec0, the logic's test);
  one "Selecting a random new quest" over the count (0x152eb0), started
  0x849400, the picker run.
- When: the game era's change (0x93ac50; the player era's 0x93ad80 without
  eras), every client × actor; a meeting (0x93ae70) both ways. No cooldown,
  no expiry (runs/h1_duelw1117 t13, t17, t31, ...).
- Types: Convert 0x84a120 (done 0x84a200); Trade Route 0x84b520 (0x54ff90;
  done 0x84b570); Camp 0x849a70 within 5 (0x6aef0; done 0x849c00, failed
  0x849d60); Train Unit 0x84be90 / 0x84bdc0 (the actor's own combat unit, no
  unlocked upgrade 0x84bc70, its era 0x93e6c0 the actor's 0x467eb0; picker
  0x84c1e0; done on a unit added, an upgrade too, 0x84bf90; failed 0x84bf00);
  Zone District 0x84e120 / 0x84e030 (RequiresPopulation +0xe1 bit 6, era
  0x93e580 / 0x93e9e0, below MaxPerPlayer 0x4bdd70; picker 0x84e3e0; done on
  COMPLETION 0x84e190); Tech / Civic Boost 0x84d630 / 0x84cb90 (0x4cb290 /
  0x39d190; pickers 0x84d870 / 0x84ce50; done 0x84d750 / 0x84ccb0, failed
  0x84cd40); Great Person 0x84ab50 (0x2f1ed0: offered, not excluded, below
  MaxPlayerInstances, a spawn plot 0x2f6500; era 0x2f64d0 ≤ the actor's next;
  picker 0x84b130; done 0x84ac50).
- War (0x8492f0) and a player's end (0x849210) fail the pair's quests
  (runs/h1_duelw1110 t125). Completion 0x848d20: the envoy at once.
- Shipped: `cpu/core/quests.ts`, `_give_quest`, `_give_era_quests`,
  `_quest_*` (gpu/core/sim_seats.py), `cpu/data/quests.ts` (`standing` /
  `_q_standing`).

## H-1: the trade path's search, its score and the Canal — READ

- CvAStar (Pathfinder_Instance.cpp, base vtable 0xd02108): GeneratePath
  0x77d10 loops SearchStep 0x793f0 — GetBest 0x781e0 pops the head, children
  0x77a50 (six neighbours, then extras), the popped node the destination
  test's last. Open list sorted by total, ties by known cost (AddToOpen
  0x775a0 scans from either end). LinkChild 0x78750: re-parent on STRICTLY
  cheaper (UpdateOpenNode 0x79560; closed: UpdateParents 0x79660). The trade
  callbacks (0x557e40): destination 0x271490, destination-valid 0x629460, no
  heuristic, cost 0x558970, valid 0x558db0, notify 0x558900, neighbours
  0x558d60 / 0x271b50, context 0x558ba0; 0x5579b0 memoised per node pair.
- The cost adds nothing onto a plot whose word holds both masks (0x810a0 mask
  5) or a city centre (0x81120). The path score (0x5500b0 count, 0x54eeb0
  weigh): a centre counts its post; a two-mask plot MULTIPLE_DOMAINS 15 (gp
  +0x708); a jump PORTAL 15 (+0x70c); the best route unpillaged (+0x4d bit 1)
  2 (+0x704); water 2 (+0x710). Confirmed: runs/h1_duelw1124 Cardiff →
  Xiurong through Shenyang's Canal 12 Gold (`multiDomainPlot` /
  `_multi_domain_plot`, MULTI_DOMAIN in `routePathGold` / `_route_path_gold`).
- Open (C-108): 1124 Shenyang → Bologna t180, Xi'an → Rome t198; the path
  cache (0x541ae0 over 0x5419a0, before 0x5526a0) and the reverse route.

## H-1: a district's locked price and the turn's research — READ (log)

The action log orders a turn: 1124 China t198 places the Canal before its
Great Scientist's tech lands: locked at 310, not 313. The harness prices a
lock on the research held at the placement (`researchAfterPlacement`).

## H-1: Johannesburg's yield per resource type — PARTLY READ

EFFECT_ADJUST_YIELD_BY_NUMBER_OF_RESOURCES (factory 0xc2e490, vtable 0xdece90;
apply 0xb48710 registers on +0x1da8 via 0xc705d0). The count read is a fit:
distinct seen resources under an unpillaged improvement on the city's plots
(runs/h1_duelw1123 Jiaodong +2; `suzerainResourceTypeProduction` /
`_res_type_prod`). Open: the count's reader (C-117).

## H-1: a completion's overflow and the item multiplier — READ

0x16f050 → 0x1853d0: progress takes (A + overflow) × the item's multiplier
(0x1856ed: the SUM); a completion stores min(A, B) − the lack, A unmultiplied
(0x16f3cb). Both twins' seat production step.

## H-1: the flood's river walk — READ

0xa2cfc0 walks the river vector (+0xb8) in stored order, filled by 0xa28900
from SetNEOfRiver / SetWOfRiver / SetNWOfRiver (0x2be20 / 0x2c220 / 0x2bff0)
in the ID order the map script hands (Expansion2 RiversLakes.lua
`nextRiverID`). A river: +0 NAME (−1 unnamed), +4 ID, +0x28..+0x30 its
Floodplains list, +0x48 its namer, +0x78 its history (16-byte entries). The
weights skip an unnamed or listless river and boost while its history lacks
the row. The reveal gate is the NAME (0x534950 → 0xa29730 → 0xa292a0; one pool
per civ; a namer of 0 renames). `tools/civ6map`, `tools/civ6lab/h1/map_orders.py`,
`cat.rivers`; runs/h1_duelw1126 7 / 7 rivers (`GameMap.rivers`, `floodRivers`).

The shield 0xa2a4d0: mitigated when unnamed or listless, the Great Bath
(0xa2b280: +0x28 & 8) on a plot of the LIST (0x810d0), or a Dam (0xa2c280 /
0xa2b200: +0x48 & 0x40) on a list plot whose city holds it (0x81330)
(`riverShielded` over `riverReach`; `laidRivers` from the record's edges).

## H-1: the volcano roll's branches and order — READ

0x335040: wake "Choose Active Volcano Roll" (0xa20f20: vector +0x160, stride
0xa0, dormant and named; +0x14 the turn), sleep "Choose Inactive Volcano
Roll" (0xa212d0: active and named; +0x14 = −1). Confirmed: runs/h1_duelw1118
t53 woke over 2, t152 slept over 2; 1121 t70–99 no draw until the second is
named. The vector fills as the script sets FEATURE_VOLCANO (0x896c40 →
0xa1e370 → 0xa19360; a wonder's to 0xa18f20): the boundary pass x outer, then
lone mountains per continent; the eruption weights (0xa1e470) walk it
(+0x1b8). 1118 t53 woke 803 of [803, 534] (`GameMap.volcanoes`,
`volcanoOrder` / `_volcano_order`).

## H-1: the citizen manager's placement and the yield flags — READ

City_Citizens.cpp. ChangeNumUnassigned 0x194fb0 (from 0x1c79b0) adds to +0x68:
negative runs the full reassign 0x196320 (save forced +0x08, unassign 0x196440,
assign 0x197230, restore 0x196e30), else 0x197230 places the unassigned
beside the rest. Growth (0x1b41e0: box − threshold, clamped) places one;
starvation re-places all.

- 0x197230: need = max(0, −floor((food256 − consumption(pop) << 8) / 256))
  (cached food 0x1cb8b0, consumption 0x5276c0). One entry per free slot of
  the 37-plot hexspace (0x5cc00 over 0xefedf0 / 0xefeef0: the centre, ring 1
  (0,1) (1,0) (1,−1) (0,−1) (−1,0) (−1,1), rings 2, 3 from (0,r) clockwise),
  capacity 0x195940 (0 on the centre or yieldless, a district's specialists,
  else 1). Score 0x195f90: food (+0x08); each yield not disfavored (+0x50) ×
  2, Gold × 1 (0xf2f97c), into favored (+0x0c, m_favoredYields +0x38) or
  other (+0x10). The pick 0x193dc0 (a DP table): better = old's food below
  need and the candidate's at it, else favored greater, else other greater,
  strict; the backtrack's N assigned (0x194d90). Confirmed: runs/h1_duelw1117
  1,133 / 1,284 city-turns (`dpcheck.py`).
- The flags: 0x196f90 / 0x1970e0 write +0x50 / +0x38, each a full reassign and
  event 0xe808a01e; only the SET_FOCUS command 0x975920 and the Lua setters
  0x9c0c80 / 0x9c0ce0 call them — every CityFocusChanged row is a full
  re-place (`IsFavoredYield`, the dumper's `favored` / `disfavored` from runs/h1_duelw1129
  1129). The city AI's Food focus 0x5cdae0 (AI cities, before the events):
  Food surplus (0x1b5620) below 1.0 with Housing (0x1b5840) above population
  sets Food favored (0x1962a0 on +0x1ba8), else clears it, via 0x975550.
- The harness and the city-states place by it (`cpu/core/citizens.ts`,
  `minorPlaceCitizens` / `_minor_place_citizens`, `recordFlags`). Open: the
  majors' placement in the engines (`assignWorkedTiles`; C-112).

## H-1: a drought on a city centre, Monumentality's districts, Kandy's wonder Relic — PARTLY READ

- 0x538a60 adds the effects' per-plot rows (0xc7e9b0) AFTER the floors
  (0x53916e): a drought's −1 Food lands after them (runs/h1_duelw1124 Shenyang
  t162–163 Food 1). Open: that the drought writes 0xc7e9b0's row (C-106).
- EFFECT_ADJUST_PLAYER_ERA_SCORE_PER_DISTRICT_CONSTRUCTED (factory 0xc25910,
  vtable 0xdf85f8, apply 0xb83b00 → 0x2bf3e0: the era entry +0x34 of +0x560,
  stride 0x78): the records fit a specialty district completed (no Aqueduct,
  1109 t99) (`completeQueueItem` / `_district_completed`). Open: its reader
  (C-115).
- MODIFIER_PLAYER_ADJUST_NATURAL_WONDER_RELIC (Kandy): the reveal 0x50d390
  creates count (+0x1340 → +0x7f0) Relics via 0x495860 → 0x296c00 at the
  capital (0x36f460) (`revealAround` / `_reveal_around`; no record).

## H-1: a unit's Production cost in the queue — READ

BuildQueue:GetUnitCost (0x983930) reads m_aiUnitCost, filled by 0x17c790: c =
the unit manager's (+0x12e8) current cost (+0x3c0, 0x4f2b20); where c > 0, the
row's +0x20 class not 2 via 0xadd5e0, and +0x1048 the currency at 0xf2f978,
c − floor(c · x / 256), x = +0x10a8 (Mercenary Companies). Confirmed:
runs/h1_duelw1104 t242 Biplane 215 → 108 (`mercenaryCost` / `mercenary_cost`,
`unitProdCost`, `unitBuyBase` / `_unit_buy_base`).

## H-1: a National Park's amenities, stored at the owner's turn — READ

- GetAmenities 0x1b4af0: the luxuries 0x1b5210 (a COUNT of the allocation
  entries +0x460 (data +0x4b8, count +0x4c8) naming the city, 0x4aa0e0), the
  entertainment 0x1b4c10, and stored counts, +0x54 of +0x1730 among them.
- Game_NationalParks 0x32deb0 zeroes +0x54, then per park adds gp +0x514 to its
  city and 1 to the nearest +0x51c others (0x32dc40); its one caller the tail
  of 0x4a8ed0 (from 0x4e46c0). Confirmed: every park lands a record before its
  cities' parts[6] (1109 t225 / t226) (`refreshParkAmenities` /
  `_refresh_park_amenities`, `City.parkAmenities` / `city_park_amen`).
- Open: a founding's first luxury, 28 of 45 at once (C-104).

## H-1: an annex re-places the citizens, the garrison's unit, a religious unit killed on a move — READ

- AnnexPlot 0x1a8b70 (from 0x1a9bc0, 0x1a8a30, the purchase 0x1a7710, a
  culture bomb 0x524e30) runs the full reassign 0x196320 on the gaining
  (0x1a8f4c) and the losing city (0x1a903c); other callers 0x196f90, 0x1970e0,
  an improvement laid (0xa4cee0, 0xa4e7a0). Confirmed: 1121 Hunza t41.
- The garrison term 0x24a180 takes ONE unit, the best defender 0x208b80 (flag
  0x10): comparator 0x523d60 keeps the first strictly greater unwounded
  (0x56dc90), wounds taken after (0x522630). Confirmed: 1121 Guangzhou t191
  66.6015625 (`garrisonCS`, `_garrison_cs`).
- A move killing a religious unit (0x26fe20 → 0x493f80, capture 1): −125 (gp
  +0x600) within 6 (+0x5f0) off its religion, × its player's +0x4f0; condemn
  (0x89cc00, 0x947f10) and combat kills (0x20e720, 0x212c30) alike (1121 t110;
  `religiousUnitLost`).
- POPULATION_LOSS strikes a city-state too (`losePopulation` /
  `_lose_citizen`; runs/h1_duelw1117 Antananarivo t170).

## H-1: the melee result, a ranged blow's domain, a city's shot — READ

Checked against `Logs/CombatLog.csv` (runs/h1_logs_duelw1119_1124,
`<dump stem>.logs/`) and `RandCalls.csv`.

- Melee 0x206960: the defender's damage drawn first (0x51a240); no counter on
  an embarked defender (0x8be30, +0x6b0) that does not fight embarked
  (+0x18c3). Where both would fall (0x56e0d0) the further overshoot falls, the
  other left at 1 HP, the attacker on a tie (0x206d01 `jle`); XP after
  (0x1975e0 at 0x206e98 / 0x206ee2). Confirmed: 1124 t13 18 / 32
  (`resolveMutualKill`, `_melee_exchange`).
- An attack ends fortification (0x1fbae0 → 0x5707b0, after 0x205da0); it grows
  only in the Fortify tick (0x95ebb0, 0x960800, 0x959830) (`spendAttack` /
  `_spend_one_attack`).
- The domain term (0x51c810): bombard (0x4fc9163d) −17 (gp +0x188) on land
  (+0x650 2), a land unit's ranged (0x2ec4ce4d) −17 on sea (1124 t45-77)
  (`rangedDomainCS` / `_ranged_domain_cs`).
- On a city: melee (0x206080) draws three — 0x519370, then 0x519440 the hit
  points (0x5e97d629) and the outer defense (0x6da56a3d); ranged (0x204b10)
  and bombard (0x2074b0) two (1117 t14).
- 0x519440's struct: strengths, max HP 0x24b290, outer damage / max, the
  hash, +0x1c minimum, +0x20 base, +0x2d bypass. 0x519090: v unclamped; on
  the HP hash with walls standing, − trunc(v × t / 256), t = trunc(256 × left
  / max) (0x16e940, 0x16e7d0); clamp; on the defense hash × 15 melee (100 via
  0x5212f0 or the ram 0x51af50 on +0x1910), 50 ranged (100 via +0x18c2), 100
  bombard (+0x1a4 / +0x1a8 / +0x1a0); bypass via 0x51acb0 (`districtHit` /
  `_district_hit`, `siegeAssist`).
- A city's strike (0x207080 → 0x249ee0): max(+0x150, best ranged 0x4bd030, 3)
  + +0x1890, less 0x51c2d0's wounded loss (0x522630 at 10). The best ranged
  rises in 0x4c1a30 (0x56e3e0, row +0x6c), the best Bombard +0x1b0
  (0x56daa0). Confirmed: 1120 China 25 from t50 (`cityStrikeStrength` /
  `_strike_strength`, `bestRangedCS` / `civ_best_ranged`).
- Flanking (0x521530) and Support (0x521ed0, 0x5228c0) need +0x1268 (only
  EFFECT_GRANT_COMBAT_ADJACENCY: Military Tradition), every player's own (1117
  t23); the composer 0x51f070 calls 0x521ed0 for 0x5e2f7468, 0x5228c0
  otherwise, which adds Support only on COMBAT_MELEE 0x2ca3edd1
  (`flankSupportLive` / `_flank_support_live`, `defenderCS`). Open:
  runs/h1_duelw1127 t16's −4 against −6.9 (C-110).
- The Spear of Fionn (install): GIANTS_CAUSEWAY_GRANT_UNIT_ABILITY gives a land
  unit beside the Causeway ABILITY_SPEAR_OF_FIONN, +5 in every fight
  (runs/h1_duely1124 Slinger 2883596; h1_duely1128 Scout 262146) (`Unit.fionn` /
  `unit_fionn`, `grantFeatureAbilities` / `_fionn_grant`, `History.fionn`,
  `chassisAbilityCS` / `_chassis_ability_cs`).

## H-1: the cards the luxury allocation ranks on — READ (the order), the triggers partly

- 0x4a7560 rebuilds (0x4a6110 at 0x4a77d4) on every call reaching the update,
  an amount of 0 too, unless +0x45e; an accumulated import / export returns
  first. 0x4a8ed0: holdings 0x4ab6e0, the allocation, the parks 0x32deb0 (1121
  t243 Chengdu).
- Cards re-slotted at a processing's start reach its allocation; a mid-walk
  re-slot (Big Ben, the Alhambra, a Shipyard) or one in the actions waits for
  the next 0x4a7560 (1121 t222; t196's Niter purchase 0x1856b3 / 0x185a2a
  re-ranks). A Builder's improvement rebuilds via 0x4ab4d0 (`luxuryCards`).
  The government changed at the start reaches the walk (1121 t168).
- A city-state's owned-resource change reaches its suzerain through 0x44eff0
  (+n owned or an import), a 0x4a7560 there (1121 Hunza's Horses).
- Open (C-104): 1124 t188 Chengdu's tier; the founding's trigger.

## H-1: the garrison requirement — READ

REQUIREMENT_CITY_HAS_GARRISON_UNIT (0xbbb1a0) walks the districts (+0x1a48);
where one seats a garrison (0x24b820: centre, Encampment) 0x24b170 takes its
best defender (0x208b80) as a combat unit (0x209dd0) and compares the
formation (+0x90 against +0xc90). A unit in the Encampment garrisons
(1121 Xi'an t152 Retainers; `cityGarrisons` / `_city_garrisoned`).

## H-1: the world's carbon in the climate log — READ (the column), the scale a fit

The step writes Game_RandomEvents.csv's row (0x33a280): the turn, the
realism, 0x28db00's world CO2 ("Total CO2"), the categories. Read as
thousands, the flood rows' warming (ChanceIncreasePerDegree 20,
CO2For1DegreeTempRise 500,000) picks every recorded event: 1121 t189
FLOOD_MAJOR at the Tarim (285 → 0.57°) (`loadCarbonLog`). Open: the ×1000
scale (C-74).

## H-1: a growth re-ranks no luxury; war weariness's amenities at the processing — READ

- 0x4a6110's callers are 0x4a7560 (0x4a77d4) and 0x4a8ed0 only: a growth
  (0x1c79b0) reads its new need on the processing's ranking (runs/h1_duelw1128
  Taiyuan t182; `cultureAfterGrowth`'s `luxMap` / `_culture_after_growth`).
- War weariness's losses (0x3cda00, `warWearinessLosses`) are laid by
  0x3d7020, called only from Player DoTurn (0x4e4656, before 0x4e46c0), after
  the decay 0x3d7270 (runs/h1_duelw1128 Xi'an t200 → 201; `readWeariness`,
  `wearyAt`).

## H-1: the records' turn order — log readings (no DLL)

- The Congress resolves at the turn change; a processing reads the session
  standing at its start (runs/h1_duelw1128 China's Border Control t161).
- An idle citizen stays idle through its city's processing (1123 Xi'an
  t175-181). Open: the engines' `placeIdleCitizens` (C-112).
- The step's fire forms stand before the in-turn start (runs/h1_duelw1127
  Rome t57).
- An age reads the score at the turn change, moments past the
  MOMENT_GAME_ERA_STARTED_* counting toward the new era (runs/h1_duelw1127 Rome
  t150; runs/h1_duelw1108 Rome t180).
- "Random River" falls the turn a river first lies in a major's sight at the
  turn's close (runs/h1_duelw1128 t1 ×3, 14, 46, 74, 93; river 3's t37 open).
- The warming's deforestation band is the turn-1 map's removable features
  (`removableAtStart`; runs/h1_duelw1127 t225, t244).

## H-1: the levy's term — READ

Player_Influence 0x44da30 (m_iLevyTurnCounter +0xc90): +1 at each of the
minor's starts (the first after the levy), at 0x5254d0(LEVY_MILITARY_TURN_DURATION
30, gp +0x450) = 15 online the units go home (0x4502b0); 0x4501c0 resets it.
Confirmed: every levy that ran its term came home 14 turns on (1117 t28 → t42,
1121 t42 → t56) (`LEVY_TURNS`, `levyEnds`, `minorLevyReturn` /
`_minor_levy_return`).

## H-1: a minor's research catch-up — READ

0x4cb930 (civics 0x39ec60), from the handler 0x427bf0 on every gain: a FULL_CIV
gainer (0x469db0, 0x253718b0), a receiver lacking it (0x4cb2f0 / 0x39d1f0)
neither FULL_CIV nor TRIBE (0x469ce0, 0xd959ec24); where at least max(1,
(len + 1) × 50 / 100) of the game's majors (+0xb50) hold it, the receiver's
progress is SET to cost − 1 ((cost << 8) − 0x100 via 0x4cc950 / 0x3a1fb0), at
the moment's cost. Confirmed: runs/h1_duelw1121 Rome's Code of Laws t4 puts
every minor at 9 of 10; runs/h1_duelv1128 Bologna's Iron Working 59 → 47 of 48
(`minorCatchUp`, `_minor_research`, `ResearchState.techCatchUp` /
`civicCatchUp`, `citystate_tech_catch` / `citystate_civic_catch`,
`MINOR_CATCHUP_PCT`).

## C-96: the city-states' boosts — the records

A city-state earns boosts as a major does (runs/h1_duelw1117-1128: 9-17 each by
t250); the boosts a turn earns land after its research choice (1117 Sailing
t3). The engines read the triggers at the minor's turn end (`detectBoosts` /
`_detect_minor_boosts`, `markBoost`, `_land_minor_boosts`, `minorCompleteNow`),
a kill's and a camp's at the event. The replay holds the catch-up's count at
the record's majors (`holdMinorCatchUp`).

## C-96: the city-states' government and food — the records

A city-state is in Chiefdom all game (runs/h1_duelw1117-1128: government 0, the
Free Cities −1) (`CITY_STATE_GOVERNMENT`, `seatGovernment`, `_adopted_gov_of`).
The replay's minor food (`minorResearch.food`) parts first on the Builder's
improvements (runs/h1_duelw1121 minor 2's Pasture t20; C-127).

## H-1: a city-state meets a major by a look — PARTLY READ (the records)

They meet when a look of either takes in the other's plot or unit (1121 t33,
1124 t10; the first envoy at the step) (`revealAround`, `minorLook` /
`_reveal_around`, `_minor_look`). Open: the look's line across two plots
(1124 t28; C-38).

## H-1: the Great Bath's Faith per flood — READ

In 0x538a60 (0x539645): with the city's m_aYieldPerFlood (+0x2728,
EFFECT_ADJUST_CITY_YIELD_PER_FLOOD) > 0, 0xa2b810 finds the FIRST river whose
list (+0x28..+0x30) holds the plot, 0xa2b4f0 its record, 0xa2b410(record, −1)
counts every flood (+0x78..+0x80, stride 0x10): amount × count. Confirmed:
runs/h1_duelw1131 Beijing 534; runs/h1_duelw1126 473 (`floodHome` /
`countFlood`, `_flood_home`).

## H-1: an unread record's random-event step — the harness

An unread record's witnesses (`T-1:63:post`, `T:0:pre`) bracket its step: the
replay runs it on the record before (`replayEvents`, `unread`;
runs/h1_duelw1131 record 5).

## H-1: a civilian stepped on — READ

- The move 0x26fe20 walks the destination's units last to first: each live
  (+0x770) non-combat (0x209dd0) unit without +0x1ba bit 2 of a player at war
  (0x469cd0) goes to 0x212500; 0 destroys it (0x493f80, capture 1).
- 0x212500: CanRetreatWhenCaptured (+0x1b8 bit 8) retreats to 0x530650's plot
  (2) or dies (0); else the UnitCaptures type (+0x208: Settler, Builder) — or
  the mover's own after "Unit Capture Chance" — is made for the mover with the
  charges (+0xed0, 0x56cb00), damage (+0xcf0, 0x5705f0), embarked state (1).
  Barbarians keep their captive.
- 0x530650: the nearest of the victim's districts (+0x1308 → +0xd8) other than
  its plot, placeable (0x586360).
- Confirmed: 1117 t33 China's Settler; 1121 t133 a Builder keeps 3 charges
  (`seizeCivilian` / `seizable`, `_seize_civilians` / `_seize_open`).

## H-1: why a seed does not replay — the AI's worker threads — READ, the replay patch MEASURED

The generator 0x8b6c10 takes no lock (state 0x8b6c98, logged at 0x8b6da9,
stored 0x8b6dd9); every recording is one LCG chain, so a reorder is a
different order of work from AI decisions differing on identical state (1117
t162, 1121 t242, 1123 t163).

- The AI's job list (game +0x408): push 0x6e29d0 (list +0x660, set +0x648),
  spawn 0x6e2980 (flag +0x3afc), wait 0x6e3020, from Game::Processor::Update
  at 0x6540f; the exports resolved through 0xcc8d90.
- "City Analysis" (0x5ce3f0) is spawned without a wait; "AI Influence Map"
  (0x717460, critical section 0xcc6d60); "AI Unit Planning" (0x792c90) forks
  min(units, the path-finder pool) chunks (0x791e00 per unit); the pool
  (0xf01920, count +8 via 0xb2f410) bounds the influence map's split
  (0x7176dd). The pool's count at init (0x91e590 → 0x26f7d0) under hash
  0xc181eb6e; the trade pool (0x557e40 / 0x5582a0) under 0xe09781a7.
- No wall clock gates a decision: QueryPerformanceCounter (via 0xcc6080)
  feeds only the profiler (0x8c05a0 / 0x8c0640) and totals (0x5bce20,
  0x7ed0a).

The exe (CivilizationVI.exe 0x6ca90, the [Performance] reader) sets the
hashes: game-core threads 0x7ec3df64 (logged only, 0xf86f0), 0xc181eb6e =
MaxGameCoreUnitMovementThreads, 0xe09781a7 = MaxGameCoreTradeRouteThreads;
MaxJobThreads at 0x6cb59, floored at 2 and capped at 32 (0x6cf0a..0x6cf47),
the TBB scheduler init (0x9858d0); SpawnList 0x985bf0 hands the list to TBB.
No mod reaches them: the Lua `GetWorkerCount` 0x23ce0 only reads.

The FinalRelease DLL: spawn 0x4a10b0 (flags +0x38ac / +0x38ad, list +0x410,
set +0x400), push 0x4a1100, wait 0x4a16e0 (from Update 0x4b72a); spawned
without a wait: City Analysis (0x3e2590), the Policy / Civic / Great Work
analyses (0x4136b0), Espionage (0x45cf70), Governor Analyzer (0x4a79b0),
Victory + Settle (0x4b13f0), Belief Analysis (0x4ec440), Tech Tree Analysis
(0x4f87e0); Settle City Evaluation (0x4b1540) waited; Trade Graph Update
(0x3883a0) joins its own.

The patch (`game.py`): the profile's MaxGameCoreUnitMovementThreads 1 and
MaxGameCoreTradeRouteThreads 1, and `patch apply` makes the FinalRelease
spawn wait: 0x4a10ed's tail jumps to a stub in the file slack (0x9b6630) that
spawns and tail-jumps to 0x4a16e0. Measured: 1117 recorded twice under the
patch, 22,590 / 22,590 draws identical.

## H-1: the AI memory reader — READ (the hooks, the pointer paths, the contracts, the knowledge base, the operations, the trees), PARTLY READ (the religious AI's holder)

`tools/civ6lab/aimem.py` (the reader; the layouts below are its code),
`aimem_hook.py` (the hooks), `aimem_fields.py` (the named members),
`procmem.py`; `h1/fleet.py run --aimem` writes `<stem>.aimem.jsonl`. The
offsets are the FinalRelease DLL's (the Release lays out the Player, Targets
and watched fields differently: AI pointers 0xc20 higher, a watched field 0x60
bytes against 0x18); the knowledge base's inner layout is shared.

- THE HOOKS: a 5-byte `jmp` into a stub in the .text slack (FinalRelease
  0x9b6660, mailbox FinalRelease 0x9b67c0) that, gated, stores the registers
  and spins until the reader acknowledges. The sites: 0x785f30 (FinalRelease
  0x5146e0), the tactical knowledge step on player signal +0x1f8 (bound by
  0x7864c0 (FinalRelease 0x514a60), run where edx is Targets +0x108); 0x5ed280
  (FinalRelease 0x3f3e90), AI_Knowledge.csv's moment; 0x7877e0 (FinalRelease
  0x515d70), the look (from FinalRelease 0x51471a; the end look on signal
  +0x228); 0x84ed50 (FinalRelease 0x5a8250), PlayerTurnStarted.
- THE ORDER (runs/h1_duelm1117): each player's start, then per player its
  tactical step, its log, its end look; a contract submitted at T stands at
  T's end look, not its log moment (1117 t9).
- THE GLOBALS: the game FinalRelease 0xb8aa68 (turn +0xc0, the generator
  +0xf0: state +0xf8, count +0xfc); the players' manager FinalRelease
  0xb8e140 (+0x20 the Players by id); a Player's id +0xd8, signals +0x798, its
  AI at +0x650..+0x780 (the city AI manager +0x650, Military +0x680, Targets
  +0x698, the Control Manager +0x6b0).
- THE KNOWLEDGE BASE: Targets +0x270 (Release +0x3e0): +0x18 per owner per
  type the 0x20-byte records (unit id, +0xc age, +0x10 / +0x14 x, y); +0x638
  the camps (count +0x648); +0x6e8 its player. MEASURED: AI_Knowledge.csv's
  ARMY lines 1,744 / 1,744.
- THE CONTRACTS: the Control Manager +0x170 every live contract (count
  +0x180), +0x110 the controls' pages; watched fields (constructor
  FinalRelease 0x3fc9d0) +0xb0 status, +0xc8 priority, +0x110 id, +0x128
  owner, +0x158 value (24.8). Kinds by vtable: build FinalRelease 0x3f7480,
  tech FinalRelease 0x3f7180, civic FinalRelease 0x3f6c00, Purchase Plot
  FinalRelease 0x3f7040, diplomatic action FinalRelease 0x3f6e20. MEASURED:
  2,006 / 2,006 CONTRACT values.
- THE HOLDERS: a CityBuild +0xa8 city, +0xd8 threat, +0x140 the working
  contract, +0x160 the managed container; the same in Economic (+0x268),
  Research, CultureAi, Diplomatic, each tree (+0x378). Open: the religious
  AI's holder is not reached (C-129).
- THE TREES: watched fields (constructor FinalRelease 0x53e4d0) +0x138
  active, +0x180 allowRecruiting, +0x1c8 treeId, +0x210 presentValue, +0x268
  name, +0x370 operationId; +0xa0 node count, +0xb8 the 0xb8-byte node blocks
  (+8 the data), +0xe0 the graph (parent, end, first, last, current child),
  +0x108 the statuses. The TreeData store: a column per DataTypes id.
- A UNIT: Player::Units +0xd0, id +0xb0, control +0x300, dead +0x2e8,
  experience +0x970 (constructor FinalRelease 0x39b140).
- The sites read, Release (FinalRelease):
  - 0x9ccff0 (FinalRelease 0x6d77f0) GetRandomSeed, through the reader
  - 0x9c98d0 (FinalRelease 0x6d3ce0) of game +0xf0 +8
  - 0x37b760 (FinalRelease 0x26c770) the players by id
  - 0x5d3e0 (FinalRelease 0x44f00) the game's own lookup
  - 0x8a08a0 (FinalRelease 0x63d080) the same, game +0x240 +0x20
  - 0x5c2650 (FinalRelease 0x3d9130) walks the city AI manager's list
  - 0x5ed280 (FinalRelease 0x3f3e90) reads the knowledge base's fields
  - 0x6072d0 (FinalRelease 0x4007d0) finds a contract by id
  - 0x609060 (FinalRelease 0x4019f0) a control by id
  - 0x5f4cd0 (FinalRelease 0x3f97e0) prints a contract's status
  - 0x600800 (FinalRelease 0x3fd780) the status's name
  - 0x600b00 (FinalRelease 0x3fda30) releases a handle
  - 0x5c4f40 (FinalRelease 0x3db2f0) the CityBuild's constructor
  - 0x75e7a0 (FinalRelease 0x4f70f0) Research's container (+0x178)
  - 0x6190d0 (FinalRelease 0x40e8c0) CultureAi's (+0x218)
  - 0x6419c0 (FinalRelease 0x4271a0) Diplomatic's (+0x6158)
  - 0x74af30 (FinalRelease 0x4e9d60) the religious AI, unread
  - 0x7d3670 (FinalRelease 0x544020) a tree's reset
  - 0x7cb930 (FinalRelease 0x540250) a tree's name
  - 0x7d3a00 (FinalRelease 0x544360) a tree's tick
  - 0x7d3d30 (FinalRelease 0x544530) a node's update
  - 0x7e7200 (FinalRelease 0x54f6b0) Add Goal Tech
  - 0x6092c0 (FinalRelease 0x401ba0) a control's units
  - 0x1fc100 (FinalRelease 0x14fa10) asks the experience object
  - 0x116f80 (FinalRelease 0x2af30) the promotion flag
- THE OPERATIONS: Military +0x1f0, an operation +0xa8 definition, +0x150 the
  teams (0x118 bytes), +0x178 target, +0x2e0 tree control. A team
  (runs/h1_duelx1121): +0x10 met, +0x11 ready, +0x18 members, +0x30 per
  requirement, +0x48 taken in. MEASURED: "running" lines on 789 / 836
  player-turns.
  - 0x723cf0 (FinalRelease 0x4cf450) walks the operations
  - 0x727510 (FinalRelease 0x4d26e0) the operations' log
  - 0x733730 (FinalRelease 0x4d80b0) an operation's constructor
  - 0x73b360 (FinalRelease 0x4dee80) the team count
  - 0x73a840 (FinalRelease 0x4de360) the tree control's lookup
  - 0x73b4f0 (FinalRelease 0x4def30) prints a team's members
  - 0x4f2310 (FinalRelease 0x2c4360) Player::Units' lookup
- THE ONE-OFFS: PlayerStats +0xa0 the best melee; Player::Cities +0xec.
  - 0x4d9320 (FinalRelease 0x743c0) reads PlayerStats +0xa0
  - 0x198310 (FinalRelease 0x111920) reads Player::Cities +0xec
- THE MEMBERS: City m_kCulture (+0xb80; FinalRelease 0x11aba0): +8 culture,
  +0x10 plots taken with culture (`City.tilesAcquired`), +0x1c next plot (10,500
  city-records); m_kGrowth (+0x960; FinalRelease 0x122d20): +0x80 food, +0x84
  m_iOtherGrowthModifier; m_kBuildQueue (+0x10c0): per-row progress arrays (51 /
  51). m_aiReservedResources and m_iWarWeariness are
  not what the importer replays; m_iLevyTurnCounter is the levy's age.
- The Lua cache 0x68b390 copies the build queue (GetBuildingProgress reads +0x68).
- COST: 7,224 reads, 32 ms a turn. FIXED POINTS: `h1/dump.py` answers the
  Dedication (`lab.answer_dedication`) and the victory screen
  (`lab.answer_endgame`) at the hold; MEASURED: runs/h1_dueldA1117 /
  runs/h1_dueldB1117 and runs/h1_duelxA1117_20261025T080908Z /
  runs/h1_duelxB1117_20261025T080909Z recorded at once, every record, 23,363
  draws and 7,224 reads identical (`h1/samegame.py`).

## H-1: a pillaged building's specialist, the centre's defence, three moments — READ

- A plot's capacity 0x195940: the district's base slots (+0x54 behind +0x50)
  plus each unpillaged building (0x18fe60 on +0x1c78; IsPillaged 0x9847b0 →
  0x9ed20); only a placement reads it (1128 Xi'an t105 keeps its specialist)
  (`citySpecialistSlots(seated)`, `_city_spec_slots(seated=True)`).
- GetDefenseStrength (0x98ca00 → 0x24ae80) is live: 0x24a000 + 0x24a180 over
  0x208b80; a unit the start window completed garrisons already (1127 Rome t96).
- MITIGATED_RIVER_FLOOD: 0xa2a4d0's out parameter is the mitigating player
  (0x24b4b0 of the first complete (+0xb08) unpillaged (0x24c3a0) Dam, else the
  Bath's, 0xa2c280); its signal (+0xbd0) → 0x3060b0 records it once (0x978039a6)
  (1128 t160; `riverShield`, `mitigatedFloodMoment` / `_flood_mitigator`,
  `_moment_mitigated_flood`).
- WORLD_CIRCUMNAVIGATED: at a reveal (0x50d390) a team that revealed every
  column (+0x2f0) sets +0x8a8 and signals (+0x1728) → 0x315980 FIRST_IN_WORLD
  (0x17cd04dd) else 0x2ada545a (1127 Rome t157; `momentKeysHeld` /
  `_moment_held`).
- IMPROVEMENT_CONSTRUCTED_RENEWABLE_ENERGY_FIRST: 0x311ed0 over 0x306640's
  table; the four renewables one key (1127 China t246; `IMPROVEMENT_KEY`).
- A wonder's annex re-places before the wonder stands (1128 Xi'an t143).

## C-96 / C-97: the city build AI — the choice READ, the values PARTLY READ

AI::CityBuild, one per city (+0x31d0); log AI_CityBuild.csv; values 24.8.
Check: `dll_citybuild.py`, `cpu/harness/cityBuildLab.ts` (`--logtech`).
Engine: `cpu/core/aiCityBuild.ts`.

- Fixed point (Math_FixedPointT): fx(f) = floor(f) << 8 | trunc(frac × 256);
  mul (a b) >> 8 (0x16eb20, 0x16e7d0), div (a << 8) / b (0x16e940), add
  0xac650, sub 0x16ec10; a percent a b / 25600 toward 0.
- The city's turn 0x5ce680 (from 0x5c2650): on a full update 0x5d7e00,
  0x5cadc0, 0x5cbd10 (advantages and weights; logged 0x5cdd70, adv 0x5d83c0,
  the YIELD_* list +0x908), 0x5c9a00, 0x5c9700, the forecast 0x5cb570,
  0x5ca7e0, the military hook 0x79a320, the City Analysis job 0x5ce3f0 (job
  +0xcc0, vtable 0xd59af0 → 0x5ce910 → 0x5ce970 per 0x78-byte plot
  evaluation, +0xcf8 / +0xd08, the centre's first). Then for an AI player:
  0x5cdae0, City Defense 0x5cced0, the unit-or-building event 0x5cd150, the
  district event 0x5cc910 ("City Build District Choice" in 0x5d0c20), the
  improvement event 0x5ccc10, 0x5cd4e0; with the queue empty (+0x2350 0 or
  +0x2340 null) the Default Specialization 0x5d4d70. A second hook 0x5ce5b0
  repeats it and walks 0x5d2810's items via 0x68be60.
- Default Specialization 0x5d4d70 (`defaultSpecialization`): nothing for a
  player 0x469d70 names or a queued item (+0x1e0 / +0x1d0); the contract
  events first (+0x3a8; slots +0x98 / +0x68 / +0xa8). The best building
  (0x5d0860), unit (0x5d2600), project (0x5d1f10) of the centre's evaluation
  (tables +0x28 / +0x40 / +0x38; from FX(−9999), strictly higher, the first
  on a tie). Plain pick: a building not queued (0x17e690: entries +0x1d0, 0x38
  each, directive +0x30 1, type +0x14; a pillaged one is not refused and its
  entry repairs it — runs/h1_duely1117 Valletta t134-141), CanConstruct
  0x170450 with +0x54 / +0x68 clear, not MustPurchase (+0x159 bit 4), × 0.5 /
  × 2 by the favoured verdict (+0x528, 0x5d2d10; the district @0xf2f988 × 5);
  a unit without FoundCity (+0x1b9 bit 2) or BuildCharges (+0x44), CanTrain
  0x172820, not MustPurchase (+0x1b9 bit 128). Defensive pick (military +0x4b8,
  or +0x1b8 > −1 with 0x5e97d629 or +0x218): DefenseModifier (+0x28) /
  OuterDefenseStrength (+0x44) buildings, Combat (+0x48) non-recon units
  (+0x168 / +0x170), no project. A contract in hand (+0x398) worth the unit's
  − 1.0 and the project's takes the turn (vt +0x38); else building ≥ unit, ≥
  project, queued by 0x5c9ea0 / 0x5ca5a0 / 0x5ca450. The queue's CanConstruct
  0x1714d0 refuses a building of a pillaged district (0x1716d2;
  runs/h1_duelv1128 Nazca t26-31 NO BUILDS; `minorBuildingOk` /
  `_minor_building_ok`); none: 0x5d2810's "Generic Offense" for a full civ,
  "NO BUILDS AT ALL" else. MEASURED: 812 / 920 city-state picks
  (`minorPickFacts`, `minorItemFor`).
- The tables 0x5ce970: a non-wonder building on the centre, T = max(tech
  turns 0x7610e0, civic 0x621920) + the district's turns (0x17b5a0, +10 not in
  hand) + build turns 0x17b1e0 + 10 while another item is in hand + missing
  prerequisites; value 0x7a4d40(T, no plot, valueHorizons[1]). A unit
  0x7b62c0 (train turns 0x17bb40); a project 0x7b28c0; a wonder 0x7a4d40 at its
  plot, horizon[2]. T past the horizon FX(−9999). The loop 0x5cfb10..0x5cfca5
  skips only a row CanConstruct refuses for good ([rbp−0x1f]): a held pillaged
  building is valued (`refused`; h1_duelv1124 Granada t73-78).
- 0x7a4d40 with no plot (0x7a5182..0x7a51d9): a held building (0x18e9f0)
  pillaged (0x18fe60), or under damaged walls (0x197ff0) with
  OuterDefenseHitPoints (+0x54 / +0x58), doubles 0x7a7590 (0x7a5136); its T the
  repair's. Confirmed: runs/h1_duelv1124 Granada t86-89 157.77 / 169.69 /
  213.44 / 227.34.
- The defence terms (0x7a84c0 .. 0x7a8758): +4.0 once where a city's +0x1b8 >
  −1; × 4 for its damaged walls (0x197ff0 on +0x1880); × 2 once for a foe
  (0x483b50 +0xb50 at war or denouncing) whose best melee (+0xf0) passes the
  centre's 0x24ae80. Open: the +4.0's threat (1124 Granada's Walls; C-96).
- The rate and horizons: GlobalAI (+0x408) +0x290 = AI_DISCOUNT_RATE × 100 /
  CostMultiplier (0x6ddb40; 4.0 online); m_valueHorizons (+0x298, data +0x2f0)
  by 0x6dd9a0 = [speed(50), speed(100), speed(200), 50] (0x5254d0 → 0x525400)
  (`cpu/data/aiValue.ts`).
- The value 0x7a7590: per Building_YieldChanges row (+0x2e0) amount × fx(1 +
  cityPct 0.01) × fx(1 + bldPct 0.01) (+0xbc0 via 0x7a2fa0; 0x18e890) through
  0x7a6690 = amount × DefaultValue × (1 + min(w[y], 9.0)), w = 0x702ad0's five
  arrays (0x4681a0 +0x340, +0x1288 +0x528, +0x638, +0x7a8, +0x6b0 / +0x6c8);
  pseudo-yields via 0x7a60d0 (GOLDENAGE 0x2c40b0, 0x2c4350, 0x2c3ed0,
  0x2c4290); the second pass 0x18e570; a whole number (+0x1358 +0xf8) when
  CanConstruct's reasons are −1; GP points (+0x1b0); PSEUDOYIELD_WONDER; the
  era moment (0x93e4e0, 0x3002f0); the defence terms; OuterDefenseStrength;
  great work slots (+0x1c8); the chain (+0x1f8: × (1 + 2 depth)); less
  Maintenance (+0x38); then PV(v, H) − PV(v, T) (0x7a16e0). After: an
  Entertainment (+0x2c) building 0x79f7c0 (RegionalRange +0x48), capped 50;
  else (0x7a8daa) a regional one: a converted resource (+0x58 / +0x14) with
  no stock (0x4ab6c0 → 0x4aa790) zeroes it (0x7a9098), else × the cities in
  range (0x7a90d0; +0x30d0); the Buildings_XP2 row (0x28a940 on 0xad50d0,
  `dll_rowmap.py a5ab30`): RequiredPower 0x7a67f0; BlocksCoastalFlooding
  0xa39110 over the lowland list (+0xb0, 0xa3a210; lambda 0x79ecc0): (districts
  × 15 + plots) × 100 (0 with none, 0x7a93b4); free units (+0x298) via
  0x7b62c0; Housing (+0x34) 0x7a3d70; a +0x1310 listed building (0x39dcd0)
  0x7a10c0; modifiers 0x7a4b20. Loader 0xabaaf0 (`dll_rowmap.py a59ee0`).
  Confirmed: runs/h1_duelv1121 Hunza's Flood Barrier +300.00 t208-220.
- The present value 0x7a16e0 (FinalRelease 0x528310): n 0 → v; n < 0 → 0; rate
  0 → v n; rate ≥ 50 or r n ≥ 10 → v / r; else (1 + r)^n − 1 by its binomial
  to the cube, each product truncated (s = a + c/2 + e fx(1/6)), PV = s v /
  max(r (1 + s), fx(0.01)). Confirmed: runs/h1_duelv1124 Cardiff t2..t12's
  Monument 24.25 .. 40.11 = X + trunc(X); `dll_citybuild.py` 254 / 255. Open:
  1127 t41 Cardiff 60.22 (C-96).
- T as read: the analysis runs after the production; 0x17b1e0 = 0x8c4540's
  ceil((cost − progress) / Production); the tech turns 0x7610e0: the research
  AI's entry (+0x1c; 500 at ≤ 0) + its +0x528 (+0x4d0 data +0x58, written by
  0x7609d7 and 0x7630ec via 0x4ca120) where the walk skips the item in hand,
  read before its own turn; the civic's 0x621920 + the civic in hand's turns
  (0x39c1f0).
- The terms (measured): the outer defences +1 for 2+ districts (+0x1a60), +2
  capital (+0x5e8), +1 a wonder (0x18e930), pop / 5 + 1, +2 at war (0x3dcf50);
  the entertainment term passes ONE Amenity (0x7a8dcd, r9d 1; 0x7a2140); the
  city percent (+0xbc0) the modifiers' alone.
- The unit value's exits (0x7b62c0, `unitValueExit`) and branches: "C-96 /
  C-97: the unit value". The Trader 0x7a7110 (`traderValue`): "C-96: the
  Trader's value" (K from +0x6d8, logged by 0x5ed280). The trade walk 0x78e0a0
  (+0xe0 entries, 0x526330 / 0x525b90, 0x5520a0); the unit table 0x7989e0.
- The Trader's destination (0x687bf0 → 0x78e0a0, per idle Trader): over the
  city's list (+0x870, 0x78f210) and +0xe0's entries that 0x78e010 admits,
  international (not at war 0x469cd0) Σ 0x7a6690 of 0x526330 × (1, × 3 for the
  diplomatic focus vt +0x30 / +0x6780, + (1 + +0x480's sum) with no post
  0x4d9830), domestic (origin + destination) × 3 where 0x54ad70 is 0; sorted
  (0x78d510, insertion 0x78cc40 at ≤ 32, stable); the first CanStartRoute
  0x54efc0 admits. A city-state: × 2 without its post. Confirmed:
  runs/h1_duely1127 Mexico City t53 → Hattusa.
- HOUSING 0x7a3d70 (`housingValue`): S = Food (0x1b5620) − 0x5276c0(pop),
  housing 0x1b5840; factor 0x527ca0(left) 0 below −4, 0.25 to 0, 0.5 at 1, else
  1; over the forecast's steps from T (0x5d2c50): 2 × DefaultValue(Food) × (S ×
  (factor − 1) + the withheld Food), PV per step. THE FORECAST 0x5cb570 (+0x6c8
  turns, +0x738 withheld, +0x7a8 pop): g 0x1b5f70; the turns to grow 0x1b6390
  (threshold 0x5276e0, store +0x80, multiplier 0x1b62d0); per citizen while
  below 100 (+0x6c0). Open: its place in the turn (runs/h1_duelv1121
  Ayutthaya's Granary t18; C-106).
- THE ANALYZERS (each its whole part): EFFECT_GRANT_ABILITY 0x6b5b30 (a
  context copy, 0x142650); COLLECTION_CITY_TRAINED_UNITS 0x69ffa0;
  EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER 0x6c09b0 (parser 0x6c0590; the unit's
  level via 0x382f0, else the city's Production, PV to H; runs/h1_duely1127
  Mexico City's Survey 7 / 14 / 21); REQUIREMENT_UNIT_PROMOTION_CLASS_MATCHES
  0x6d22c0; COLLECTION_CITY_PLOT_YIELDS 0x69feb0 (index below 0x5cbc0(2) + 18)
  with EFFECT_ADJUST_PLOT_YIELD 0x6afa10 and TERRAIN 0x6d1dd0, FEATURE
  0x6d4380, RESOURCE_TYPE 0x6d1970, RESOURCE_VISIBLE 0x6d1c00,
  HAS_ANY_IMPROVEMENT 0x6cfcd0; EFFECT_ADJUST_TRADE_ROUTE_CAPACITY 0x6c0ff0;
  EFFECT_ADJUST_PLAYER_RESOURCE_STOCKPILE_CAP 0x6b8e10 (the best centre UNITS
  value 0x5d4cd0, Resources +0x100; not ported).
- The explorer and naval weights: the military turn writes +0x790 as (desired
  − held) − 1.0 (0x7204c3..0x7205ae): −1.0 for a city-state (runs/h1_duelv1117
  Caguana t18 Galley −4.14). 0x700810 = max(−1.0, +0x7e8 + +0x620 + +0x768 /
  +0x748) + the GP pseudo-yields (@0xf2e218 .. @0xf2e238) via 0x2c4230; 0x71fb80
  writes +0x7e8.
- MEASURED: 7,582 / 22,991 values within 0.005 at the reconstructed T over
  runs/h1_duelv1117 / 1121 / 1124 / 1127 / 1128. Open (C-96): the GlobalParameters
  +0x6b4 amenity term; a city-state's Great General point at 0 (C-100); the
  Lighthouse / Shipyard / Market / Arena / Temple residuals; the +0x620
  array's writer. Read elsewhere: the project value 0x7b28c0, the resource
  value 0x7a21e0 with +0x978 (0x5d45c0), the events (0x5cd150, 0x5cc910,
  0x5ccc10, 0x5cced0, 0x5cd4e0), the contract lines (0x5f4cd0, 0x5f3710,
  PURCHASE 0x5f3c40, FAITH PURCHASE 0x5f3ee0), the cancel 0x5d7640.

## C-96 / C-97: the unit value — READ (the combat, trade, explorer branches, the tail, the military AI's unit production), PARTLY READ (its inputs)

`unitValue` / `unitTurns` / `unitTable` (`cpu/core/aiCityBuild.ts`),
`unitProductionTable` (`cpu/core/aiUnitProduction.ts`), `unitEfficiency`
(`cpu/core/aiUnitEfficiency.ts`). Check: `cpu/harness/cityBuildLab.ts` (the
UNITS rows; `--kb -1`, `--enginekb`, `--nodesire`).

- THE TURNS (0x5ce970's unit loop 0x5cf360..0x5cf6ac): FX(−9999) where CanTrain
  0x172820 (flag +0x12a0 +0xba8) refuses — with its sixth argument set (+0xe8:
  the prerequisite checks 0x172951..0x1729ab skipped); else T = max(tech turns
  0x7610e0 + 5, civic turns 0x621920 + 5) where the column is set (`lea ebx,
  [rax+5]`), the least Unit_BuildingPrereqs turns (+0x258), the train turns
  0x17bb40 unless MustPurchase, +10 while another item is in hand. Confirmed:
  1124 Archer rows 253 / 260.
- THE VALUE 0x7b62c0 (out, unit, &rate, T, H, player, city): FX(−9999) at T ≥
  H, a unit not the player's version (+0x12e8 +0x1c0), a domain the city cannot
  train (0x17d660), a non-full (0x469db0, 0x253718b0) non-tribe (0x469ce0,
  0xd959ec24) player at peace (0x3dcf50) with more than five units (+0x12e8
  +0xc0), a Spy (+0x1ba bit 2, `dll_rowmap.py a6f2b0`) of a non-full player.
  By the pseudo-yield (+0x290; the globals @0xf2e254 COMBAT, 258 NAVAL, 25c AIR,
  26c TRADE, 268 RELIGIOUS, 250 ARCHAEOLOGIST, 260 EXPLORER, 264 SETTLER, 270
  SPY, 2bc TOURISM, 2a0 NUCLEAR_WEAPON — `pyglob` over 0x5bbf80):
  - COMBAT / NAVAL / AIR: the unit production value 0x79ca90 (+0x1290 +0x268,
    0x168-byte entries, +0x160), × 3.0 where obsolete (+0x08, 0x79d2d0), +
    fx(0.5 × cities) where Combat (+0x48) exceeds the best melee (0x4d9320 on
    +0x1330): runs/h1_duelv1121 t17 Hunza's Heavy Chariot 1.16 + 0.5 → 7.35;
    AIR + 30.0 with no aircraft in its PrereqDistrict (+0x278), else 5.0 a free
    slot; NAVAL FX(−9999) at a city with no water (0x82a10) or Harbor
    (0xcbecc739) for a non-ranged (+0x6c) unit.
  - TRADE (0x7b6525..0x7b6582): 0x7a7110(out, player, &rate, T, T, 0) — one
    turn's K discounted to T (0x7a1240), × 4 ("C-96: the Trader's value").
  - RELIGIOUS: ReligiousStrength (+0x78) × 0.01, SpreadCharges (+0x7c),
    ReligiousHealCharges (+0x74) by 0x4be880; 0 with no majority religion
    (0x4681c0 +0x1c0); PSEUDOYIELD_TOURISM terms (ParkCharges +0x64; a
    city-state's −1.0 zeroes them).
  - ARCHAEOLOGIST min(artifacts / 56, 10); EXPLORER / SETTLER / SPY 1.0 + the
    eras' points (0x2c43b0) as GOLDENAGE_POINT.
  - THE TAIL (0x7b709f): WMDCapable (+0x1ba bit 64); × (the city's extra copies
    + 1, 0x179dd0); × the promotion class weight 0x723bb0 (+0x288; 0 where
    the class base +0x708 is 0 — a city-state's RECON; else max(base +
    +0x778's term, 0.1)); a StrategicResource (+0x2c8) held nowhere (0x4aa790)
    and counted near no city (+0x978, 0x5d45c0) → 0; the pseudo-yield
    (0x7a60d0); below handicap 3 (+0x908) less Maintenance (+0x5c) and
    +0x13a0 +0x338 as Gold (0.5 each at a city-state); PV(H) − PV(T); a
    FoundCity unit's 0x6fe2b0 + 0x17a600 turns; ParkCharges' tourism (0 where
    culture AI +0x6f8 > 0); an out-of-stock ResourceMaintenanceType (+0x50)
    zeroes it; the modifiers (0x7a4b20, list GlobalAI +0x3a50).
- THE UNIT PRODUCTION TABLE 0x7989e0 (AI/UnitProduction.cpp; from 0x6fae70
  while 0x79d320's flag +0x28 is clear): entries in Units order of the
  player's versions; an obsolete one (0x538460: +0x238 / +0x240 / +0x248 /
  +0x250 held) only while held (0x4f2c90); a not-yet-trainable one (0x4cb590 /
  0x39d490) only where signal +0x168 (0x79ba50) answers — the research AI's
  0x75d3d0 (functor vt 0xd6f258, bound 0x761d30): m_turnsToResearchUnit
  (+0x388, data +0x3e0; filled by 0x763b00 from 0x761090 on signal +0x228,
  per tech entry with turns ≥ 0 over its list +0x20, 0x761b70) not 0.
  Entry: flags (+0x08 obsolete, +0x0b +0x1ba bit 128, +0x0c TraitType +0x2d0,
  +0x0e a held strategic), Cost +0x38, Range +0x68, strengths, the maintenance
  resource, a vector of 64. The opposition: per combat row, over the players
  (0x483b50 +0x4a0) the knowledge base's count (0x5eb650), N their total (the
  at-war 0x469cd0 apart); +0x30 sums count × efficiency[that row][entry]
  (GlobalAI +0x3c8), +0x2c the at-war. N = 0: 1.0. Value +0x160 = N / +0x30
  (0x16e940); × 1.25 (@0xd70c98) for a TraitType unit; a maintenance shortfall
  scales it; counts into +0x20; sorted 0x79d3a0. 0x799b9d's value feeds asserts
  only. The city hook 0x79a320 copies it per city.
- A FOUNDING TURN: N 0, every entry 1.0 (runs/h1_duelv1117 Valletta Builder
  17.38 / Slinger 15.19 / Warrior 14.11 at T 4 / 7 / 8); the +200% military
  production not yet on the city (`minorBuildFacts`' `fresh`, `no_known`).
  Open: the founding Production (Hunza, 1124 Granada; C-96).
- THE MILITARY PRODUCTION (EFFECT_ADJUST_CITY_ALL_MILITARY_UNITS_PRODUCTION,
  0xc1e610, vt 0xdf78a8, apply 0xb7e0d0): rows of non-civilian formation
  (+0xa0, 0xadd5e0) in StartEra..EndEra (+0x270 / +0x280), onto 0xc6f950 (read
  by 0x17c1c0: +0x2c0[unit] + +0x12e8 +0x4a0[unit]) — support units too
  (runs/h1_duelv1121 t17 Hunza's Battering Ram −3.10).
- THE EFFICIENCIES (0x79d040, the job 0x79a440): "C-98: the unit efficiencies".
- THE COMBAT DESIRE (0x71fb80, 0x721302..0x7219ee): below.
- MEASURED (`--logtech --kb -1`): 32,988 / 57,247 UNITS values within 0.005.
  Open (C-96): the support, religious, Archaeologist, Rock Band and air units.

## C-96: the knowledge base's army records and the Combat Desire — READ (the records, the update, the desire), PARTLY READ (the signals' looks; the standing-army count in its own section below)

`minorKnowledge` / `minorKnownUnits` / `minorCombatDesire`
(`cpu/core/minorBuild.ts`), `cityStateSight` (`cpu/core/fog.ts`), `combatDesire`
(`cpu/core/aiMilitary.ts`); GPU `_minor_knowledge` / `_minor_sight`
(`gpu/core/sim_minors.py`). Check: `cpu/harness/cityBuildLab.ts`.

- THE RECORDS (CivKnowledge.cpp, player +0x12b8): per player (64 vectors of
  0x18) per type 0x20-byte records — +0 id (Unit +0x100), +4 / +8 (+0xcf0,
  +0xc90), +0xc age, +0x10 plot, +0x18 / +0x1c the plot's map ids. 0x5e9530
  (from 0x5f0440): found → age 0, plot rewritten; else appended. The ARMY line
  (0x5eceb0) prints size and oldest age; 0x5eb650 counts the sizes.
- THE AGEING 0x5ebb30 (first in 0x785f30 on signal +0x1f8): age + 1, a record
  above 0x14 erased (0x5f09b0) — it lives through 21 (runs/h1_duelv1124 minor
  3's Warrior 131073 t17-38).
- THE LOOK 0x7877e0 (Targets.cpp; after the ageing and again on +0x228): every
  plot of visibility count (+0x290) > 0 — a city 0x5f0280, a district 0x5f0490
  — each unit (0x75ce0), a hidden one (+0x15f0) where 0x5033a0 lets it, via
  0x5f0440; a camp (+0x44) 0x5f0110. Signal +0xc0 (0x7874a0, bound 0x7864c0 at
  0x786b25) records the player's own new unit; game signal +0x2e8 (0x7838a0)
  a city's list (+0x1a50).
- THE LOG'S MOMENT: 0x785f30 ageing, look, then 0x783980 writes AI_Knowledge.csv
  (0x7858b7 → 0x5ed280 → 0x5eceb0): before the units move and the end look.
- THE DEFENDER'S RECORD: the combat log 0x20d280 raises game +0x4c8 and the
  defender owner's +0x78 (0x20d7e5, attacker 0x20d7f8); the functor (vtable
  @d70448, 0x787fb0) → 0x783570 records the attacker where it stands after
  the combat (runs/h1_dueldA1117 t8 Caguana's Warrior 196610)
  (`recordAttacker` / `_kb_attacked`, `lateBlows`).
- A UNIT A CITY MAKES: the train order 0x175730 → 0x1e6570 → 0x586d40(unit,
  plot, 1, 0); 0x586360 refuses only terrain, closed borders, a district need
  or a hostile defender (0x208b80), never the owner's units; refused →
  0x585940 (range 10). So it stacks on the centre (runs/h1_dueld1128 t19 Hong
  Kong's Warrior 327683) (`spawnUnit`'s 'stack', `tileFreeForUnit`,
  `purchaseSpotBlocked`; `_spawn_unit` / `_spawn_barb`, `_occ_set_new`,
  `_occ_clear`).
- A HULL ON A CITY CENTRE: 0x586360 reads the domain (+0x650); a sea unit on
  land only where the district word +0x14 has the water bit (0x81240): a City
  Centre answers both (runs/h1_dueld1128 t56 Rome's Galley 1245190)
  (`hullPassage`, `hullTile`, `_hull_pass`, `_centre_plane`). Open: the word's
  writer (C-20).
- THE REPLAY (C-129): `holdMinorStart`, each look against the log's order,
  units made anew at a levy (`unitMadeAnew`, `levyUnits`, `levyUnitHome`,
  `_kb_unit_anew`, `_minor_levy_return`), the founding Settler's record
  (`placeCityStateAt`'s `settlerSeen`), the roster by serial
  (runs/h1_duely1117 t179); runs/h1_dueld1117 t77, runs/h1_dueld1121, h1_duely1121 / 1124 / 1127 / 1128.
  Open: the bankruptcy's victim (C-129).
- LAYER 0: no ARMY line names a religious unit or another's Trader; the own
  Trader ages from birth (runs/h1_duelw1117 city-state 3's t32 Trader)
  (`_kb_birth`).
- ONE GREAT WORK A CHARGE (install): ActionCharges 0, one activation per work
  (runs/h1_duely1117 Donatello 5636117) (`gpChargesOf`, `gpNextWork`, `gwOpen`,
  `_gw_next_obj`, `_gw_activation_room_at`, `_gw_place_person`).
- A DROUGHT IN THE PLOT ANALYSIS: a drought-barred improvement values 0.00
  (runs/h1_duelv1128 Hong Kong's Farm t5-9) (`droughtBars`, `pickImprovement`,
  `minorPlotEvals` / `_minor_plot_evals`; `draw:eventImprove`,
  runs/h1_duelu1124 t82).
- THE COMBAT DESIRE (0x71fb80; a city-state from 0x7204bc): B = max(1,
  PlayerUnits +0xf0, 0x4bd030); per player (0x483b50 +0x50) the strength over
  the primary region list (+0x1290 +0x2f0) of the records 0x5eb430 returns (no
  area; the region via 0x3beb0, map vt +0x108, 0x6fa5e0's lists; the record's
  +0x1c against the plot's region +0x18; age ≤ 2), each max(Combat, Ranged)
  where + 20 > B; the player adds each city's queue head (0x179860 on +0x2170) —
  Regional (+0x398); at war (0x469cd0) or +0xd18: Enemy (+0x3f8), M (from −0.5,
  0xd5fed0) + 0.5 (0xd20458) unless a tribe; else Other (+0x458), + 0.25
  (0xd2f324) with +0xc58. W (0x721302): below Enemy (Enemy − Regional) × 0.05
  (0xd55ff0); else below cities × B, (target − Regional) / B; else past Enemy
  + 20, toward Other × 0.025 (0xd6ced0) capped 2.0 / 3.0. W < −M → 0, else ≥ M;
  at most 2.0 at peace (+0x4b8, no +0x1b8 ≥ 0); + STANDING_ARMY_VALUE
  (@0xf2e2b4, 0x7a60d0) of the cities' +0x2d8. Confirmed: runs/h1_duelv1124
  minor 3 t43 0.7, t50 1.7. MEASURED (`--enginekb --ourdesire`): the desire
  exact on 1,778 / 3,600.
- Open (C-129): +0xd18 / +0xc58, the threat +0x1b8, the signals' refreshes;
  the sight residue (1128 t47 Hong Kong's record of 327683).

## C-96: the standing army and the Combat Desire's city terms — READ (0x5ca7e0, the watched setter 0x731d10, 0x79b9c0), the unit table's orientation READ

`minorStandingArmyShort` (cpu/core/minorCityAi.ts) / `_minor_standing_short`
(gpu/core/sim_minorai.py), read by `minorCombatDesire` / `_minor_combat_desire`.

- 0x5ca7e0 (the city's full update, after 0x5cbd10): the QUOTA (+0x220's
  watched value +0x278, setter 0x731d10) = pseudoYieldValue(STANDING_ARMY_NUMBER,
  1.0) × fx(sqrtf(pop +0x588)) (sqrtf @0xcf47b0), whole. The list: the owner's
  units (+0x12e8 +0xd8) of AI type DEFENDER (+0x1c0 4) homed on the city
  (+0x11d0 = +0xf8) — one with +0xf30 > 0 held by +0x1278 (0x623910) released
  (COMBAT, home −1); sorted (0x5c4910: the first of the lowest Combat 0x56dc90);
  then each COMBAT unit (or EXPLORE whose type's top flag is COMBAT, 0x79b9c0,
  while units exceed twice the cities) in no job (+0x7d0 −1), land (+0x650 2)
  or sea beside a coastal city (0x82a10): joins below the quota, else replaces
  a weaker weakest. The SHORTFALL (+0x280's +0x2d8) = quota − list.
- The military turn (0x7218a5) adds STANDING_ARMY_VALUE × Σ +0x2d8 (city
  +0x31d0) to the desire.
- A DEFENDER takes only its own plot as an Attack Units spot (0x776140) and
  strikes only before another striker (0x775340) (runs/h1_duelv1121 t4 Warrior
  131073).
- Recruit Units' update (0x81c820), after 0x60a8c0, sets each of the
  operation's units (0x6092c0: +0x7d0, +0x770) to its type's own AI type
  (+0x168, setter 0x1e60f0, via 0x79b9c0) at 0x81cb90..0x81cbd3, before the
  strengths (0x73f7d0): it leaves the standing army (runs/h1_duelw1121 Hunza t9).
- Engines: `minorStandingArmy` / `_minor_standing_army`, `Unit.aiDefender` /
  `unit_defender`, `militaryAiTypeOf`, `ownAiType` (cpu/core/opsOrders.ts),
  `_u_recruit` (gpu/core/sim_minorops.py). MEASURED: the desire 2,897 / 3,600.
  Open: the EXPLORE clause and the +0xf30 release (C-96).
- The table's orientation (0x7989e0 at 0x7992b9: data[width × opposing +
  entry], +0x28 width, +0x30 data, [rbp+0xc00]; the log 0x79b8a0): the value
  reads AI_UnitEfficiency.csv's row the opposing unit, column the entry
  (`unitEfficiency()[i][k]`).

## C-96: the resource value and the research value's resources — READ (bonus, luxury, the call), PARTLY READ (the strategic stockpile terms)

`resourceValue` (`cpu/core/aiResource.ts`); `minorResourceCounts`,
`minorResourceFacts`, `minorResearchResources` (`cpu/core/minorBuild.ts`);
`AI_RESOURCES` / `AI_IMPROVEMENTS` (`cpu/data/aiBuildTables.ts`,
tools/install/ai_tables.py).

- THE CALL (0x7b3e50, 0x7b556f..0x7b5758): per improvement the technology
  unlocks (+0xd0..+0xd8) the player may build (0x35f100), per valid resource
  (+0x1e8): the cities' copies (+0x978 via 0x5d45c0) > 0 → resourceValue(…, 1,
  &rate, turns, H).
- THE COUNTS (0x5c9700): +0x978[r] = the plot evaluations (+0xcf8) whose seen
  resource (0x4ab4b0 → 0x4ac140) is r, owned (+0x5a), unimproved (+0x50).
- THE VALUE 0x7a21e0: BONUS 0. LUXURY: v = PSEUDOYIELD_RESOURCE_LUXURY 1.0 from
  T to H (0x7a2140); held (0x4abfe0: +0x598[r] > 0) with count > 0: 0; else for
  a full civ (0x469db0) or city-state (0x469de0) the amenities a copy gives
  (0x527a50) to the neediest cities (0x5275a0, sorted 0x79ea80) via 0x79f7c0,
  at least v, at most 200. STRATEGIC: need = max ResourceCost + 10 ×
  maintenance over its units in the production table (0x79d340); have =
  0x4a93c0(r, 1); have < 2 need at T = H with no positive count: FX(−9999); a
  count held to 2 need − have; each copy era × 25.0 / need (× 2 with none),
  discounted (0x7a1240); at most 800.
- The stockpile terms (0x7a2850..0x7a2d61): income (+0x350, 0x4aa700) less the
  fuel bill (+0x12e8 +0x1168, 0x4ab270) below 0 with 0.5 (@d20458) × need >
  have → asked, need ≥ the shortfall; at T = H the count held to the cap
  (0x4aabe0) less stock less reservations (0x4aa790)
  (`stockpileIncome`, `unitUpkeepBill`; `resourceValue`'s `income`, `upkeep`,
  `room`, `_cv_resource_value`). Open: Resources +0xd0..+0xd8's list and its
  +50.0 (C-96).
- A minor's strategic queue (0x17f3a0, front check 0x17f070 from 0x178250 at
  +0x3ac): a front unit with a Units_XP2 row (+0x198 / +0x1a0), no progress
  (0x17d1a0) and a StrategicResource (+0x2c8) reserves its cost (0x17c2e0)
  where covered (0x4a7400), else leaves the front — a city-state too
  (`CityState.prodReserved` / `citystate_prod_reserved`, `stockReserved` /
  `_stock_reserved`, `minorBuild` / `_minor_build`); its units burn fuel
  (`chargeUnitUpkeep` / `_seat_charge_upkeep`, `Seat.fuelShort` /
  `citystate_fuel_short`). Open: a city-state's upgrade charge (C-126).

## C-96: the district value — READ (0x7a51f0, 0x7aaf80's terms below, 0x366df0, the purchase price 0x1b1cb0, 0x1c77c0, 0x1b4450), PARTLY READ (the golden-age term, the claims, modifiers and neighbours terms, the domain's resources path), unwired

`cpu/core/aiDistrictValue.ts`; GPU `gpu/core/sim_cityvalue.py`. Measured by
`cpu/harness/plotValueLab.ts --districts`: 8,629 / 55,800 DISTRICTS rows
within 0.02.

- The loop (0x5ce970, 0x5ced80..0x5cefed): the verdict 0x5d2ae0 ([rbp−0x70]
  +0x40) of −1 writes FX(−9999) first (0x5cee0a); of 1, × 1.5 (0xd2f32c,
  0x5cef8f..0x5cefd3). The list: AiFavoredItems of the System Districts list
  (`minorDistrictVerdict`): no city-state favours a district; each values only
  its type's own (runs/h1_duelv1117 Valletta's t2 Encampment 59.93). No
  population limit in the plot test (runs/h1_duelv1124 Bologna t20; `anyCount`,
  `limit=False`).
- 0x7a51f0: T past H FX(−9999); an unowned plot pays its price 0x1b1cb0 (+0x1688;
  −1 beyond gp +0x124 or with no owned neighbour) at the yield value,
  discounted; a feature the district does not keep (0x17cb00) and may not
  clear: 0, else the removal (0x7a3010); a seen resource with no harvest: 0,
  else the harvest (0x7a37d0); an improvement's yields (0x7b1320) and the
  resource at count −1 off; its own pillaged district the repair (+12500 at the
  centre), × 2. Then 0x7aaf80.
- 0x7aaf80: FX(−9999) at T ≥ H or a Coast row on a lake; a sooner flood (unless
  PreventsFloods) or eruption cuts H. A turn: PSEUDOYIELD_DISTRICT 1.0; the
  adjacency 0x366df0 → 0x365720 (0 unowned); the district's rows (0x365ae0),
  less the best other district the city lacks and the plot takes (0x406c00,
  0x1aec20, 0x35f2d0; not for an Aqueduct, +0xe0 bit 2); HitPoints (+0x58 /
  +0x5c) × 0.02 × CITY_DEFENSES terms; 0.5 × ChronologyIndex while the city may
  add one (+0xe1 bit 6, 0x1ae8a0 > 0x1ae8f0); a regional reach (+0x130) × (the
  cities in reach without one + 1) × 0.5; Appeal × 0.5 Food beside a Housing
  district; its domain (0xadd590) where 0x1c77c0 says the city does not train
  it: NAVAL / AIR_COMBAT 5.0 (× 2 where no city does), the domain's units
  (0x5d4cd0) once; Maintenance off; District_GreatPersonPoints. PV(H) − PV(T);
  Housing (gp +0x13c, AppealHousingChanges 0x1b4450) at 0x7a3d70; the civics'
  list (0x39dd20) the claims (0x7a10c0); a Dam 100 / 300 per plot along its
  rivers (0xa2bf20); a Canal 100 × 0x4d9320; its projects (+0x1d0) 0x7b28c0 ×
  0.1, × 3 favoured (0x7a48d0), shared by 0x408b60; the modifiers (0x7a4b20);
  the neighbours (0x79f280).
- T = 0x17b5a0 + max(tech, civic) turns (1127 t2's Campus 15). Confirmed: 1127
  t2 / t4 Campus rows exact.
- Open (C-100): GOLDENAGE_POINT × 0x2c41d0 (+0x5b8 of +0x128, its +0x34); the
  claims, modifiers, neighbours terms; 0x1c77c0's sea test (inland rivers);
  the residuals (Snow coasts 1121 (10,2), Woods past t11).

## C-96: the project value — READ (0x7b28c0, the PROJECTS table 0x5ce970), PARTLY READ (the space-race standing 0x7b8a30, the diplomatic-victory rows, the repair count), unwired

`cpu/core/aiProjectValue.ts`; `cpu/harness/cityBuildLab.ts`: 6,004 / 6,837
PROJECTS values exact.

- The table's gates: MaxPlayerInstances (+0x30 / +0x34) over completions and
  other cities' builds (0x179650); UnlocksFromEffect (+0xe8 bit 2 or XP2 +0x60
  bit 0) unlocked (0x468260); civic +0x120, tech +0x150, district +0x128
  (0x1aea60), RequiredBuilding +0x158, ProjectPrereqs +0x130. T = 0x17b890, H
  horizon[1]; × 1.5 (@0xd2f32c) in the list +0x6e8.
- 0x7b28c0: FX(−9999) at T ≥ H or completed to its max (0x4be7b0). The projects
  it opens (+0xf0..+0xf8) recursively at T + turns, at least 200 each; a weapon
  one (+0x148, written by 0xa99160) PSEUDOYIELD_NUCLEAR_WEAPON 250 (@0xd71c24)
  and 1000's player-less difference. SpaceRace: 0x7b8a30 squared (functor vt
  0xd71b28 +0x10 → 0x79f030, the chain) + 1.0 per completed. GP points
  (+0x108..+0x110; +0x40 → +0x90 → +0x14) escalated by 0x5267a0 type 1, × 4
  (1124 t32's Campus 29). OuterDefenseRepair (bit 0): 0x197ff0 (the most
  GetDamage 0x24ae50 / 0x6da56a3d over the districts +0x1a50 / +0x1a60 /
  0x1ae510 with +0xb08) × pop × 0x1ae8f0 × 10 (runs/h1_duelv1124 Cardiff t89
  3255.0; `outerDamage`). A diplomatic-victory row (+0xe8 bit 4 / XP2 +0x60
  bit 1, 0x25afc0). Paid once at T (0x7a1240); then XP2 +0x1c × pop (+0x2a78),
  CreateBuilding (+0x40 / +0x48 / +0x80) via 0x7a7590 less consumed buildings
  (+0x68), modifiers (GlobalAI +0x3a38) via 0x7a4b20.
- Open (C-96): the space-race standing, the diplomatic rows, the repair count,
  the Encampment's grants, Manhattan and the device.

## C-96: the city events, trees and contracts — READ (the events, the slots, the contract states, the city's list, the Default Specialization's head, the queue, the nodes below, the purchases, City Defense's start), the threat's writer and the operation unread

`cpu/core/aiCityTrees.ts` (events, nodes, tick), `cpu/core/aiContracts.ts`,
the interpreter `cpu/core/behaviorTree.ts`, the trees in `cpu/data/aiCityTrees.ts`
(`tools/install/ai_operation_tables.py`); GPU `gpu/core/sim_citytrees.py`.
Measured by `cpu/harness/cityContractLab.ts` (runs/h1_duelv11{17,21,24,27,28}):
SUBMITTED 259 exact of 434, COMPLETED 127 / 156.

- THE TURN (Control Manager 0x6096c0): three job lists — +0x370 (0x60e8c0: the
  cities 0x5c2650 → 0x5ce680, research 0x760980, the Economic AI 0x687bf0, the
  military 0x722690), +0x388 (0x60e960: 0x785ec0, the second hook 0x5c2610 →
  0x5ce5b0, the tree tick 0x7ffdd0, 0x74f5a0, 0x70a250, the tactical 0x771530),
  +0x3a0 (0x60e820: 0x7ffed0). Each job acts in its own pass (+0x278, setter
  0x731d10 on +0x220): 0x608870 runs +0x370 at 4..0, 0x608580 runs +0x388
  per pass until all answer, then +0x3a0. Passes: Economic 3 (+0x100,
  0x685080), military 2 (+0xf8, 0x71a960), a CityBuildAI 2 (+0x470, 0x5c4f40;
  the trees seeded at it, 0x7cb230), each tree at its priority. So the second
  hook runs in pass 2, after the priority 4 (City Defense, Settle, Barbarian
  City Assault) and 3 (Attack Barb Camp, assaults) trees, before priority 2
  (`operationsRun`'s `cityHook`, `minorSecondHook`; `_mops_run`,
  `_minor_second_hook`; `minorBuysAfter`, `minorLaysAfter`). A city founded in
  the turn sees only the hook.
- GARRISON CITY (0x810d30) ends the turns (0x570b40, dl 1) of the unit on the
  city (formation 0 / 3 at 0x81100a → 0x811129) and of a candidate it moves in
  (0x811038) or beside (0x8111d7); Operation Move (0x816cb0) moves only
  members with turns left; Attack Units takes none (runs/h1_duely1127 Mexico
  City t17; runs/h1_dueldA1117 Antananarivo t24).
- The threatened purchase: a land military unit reaching the centre in the
  turn bars it (runs/h1_dueld1127 city-state 4 t16) (`purchaseSpotBlocked`).
  Open: runs/h1_dueld1127 contract 112's savings 114.96 against 115 (0x68c0ad
  strict; the shares 0x687dcb, 0x687df9; C-126).
- The update 0x5ce680: the in-hand check 0x5d7e00, freed slots (0x800590), the
  analysis (0x5ce910 → 0x5ce970) read by the improvement pick 0x5c9a00 (+0x648;
  log 0x5d4030), then the events: defence 0x5cced0 (slot 5), building / unit
  0x5cd150 (1), district 0x5cc910 (2), improvement 0x5ccc10 (3), 0x5cd4e0; then
  0x5d4d70. A tree is made (0x7ff9a0) and seeded (0x7cb230), never ticked there.
- THE IMPROVEMENT EVENT 0x5ccc10: slot 3 free (+0xb88), handle 3 (+0xb18
  +0x18) live (not @0xe36190), the pick's best plot 0x5d1cb0 (evaluations
  +0xcf8 with no live reservation +0x48 (+0x12d0, 0x609060), owned +0x5a,
  improvable +0x54, value +0x30[pick] strictly best) and 0x5d4ae0 > 0: the tree
  in slot 3 (+0xb30). The pick 0x5c9a00 (`pickImprovement`): tech (+0x1338,
  0x4cb4d0), civic (+0x1310, 0x39d3d0), the Builder's (0x35ede0); the clear
  plot +0x530. Confirmed: runs/h1_duely1124 Granada t47-71 (the unnamed
  Salween's Farm below 0, laid t72).
- The district choice 0x5d0c20: over evaluations with +0x55 and +0x5a or +0x57
  (0x5ceb67), above the reservation; a tie draws 2 (1127 t2).
- The tree tick 0x7ffdd0: each 0x7d3a00, then 0x7cb2e0 destroys a tree with
  +0x368, or +0x308 and its root neither RUNNING nor FRESH (1121 t9 Hunza).
- A contract (vtable 0xd5b948; progress +0x100: 1 CLAIMED, 2 SUBMITTED, 3
  ACCEPTED, 4 FAILED, 5 IN PROGRESS, 6 CANCELLED, 7 COMPLETED): the check
  0x7f2220 fails it past its limit (holder +0xa8, 0x731d10), off the tree
  (0x7d22f0), released (0x600b00); a city's list +0x3a8 holds weak handles.
- The submission 0x60bb50: signal +0x270 → each city's 0x5d6050 in order: one
  that may take it (vt +0x98 0x5f6050) lists it, logs SUBMITTED, and clears its
  production (0x175d10) above +0xa48 when founded this turn or last (+0x2600,
  m_iTurnFounded; 0x8ea750) (runs/h1_duelw1117 Caguana t34); the Economic
  listener 0x68ab40 takes what it may buy; a taker makes it ACCEPTED.
  0x5d4d70's head releases the hand first (0x5d4e0e, +0x340 / +0x398), values
  an ACCEPTED one (vt +0x68 0x5f5d50: the higher of its and the analysis's)
  into hand, logs the rest (vt +0xa8 0x5f4cd0); the hand takes the turn at ≥
  best unit − 1.0 and ≥ the project, queued by vt +0x38 0x5f3710 (IN
  PROGRESS; signals 0x5f5650 / 0x5f35d0 / 0x5f3610); a refusal (0x5d5162 →
  0x5d516a) picks. The in-hand check 0x5d7e00: ineligible CANCELLED, not
  producing FAILED. Confirmed: runs/h1_duelw1124 Bologna t18.
- THE ECONOMIC AI'S CONTRACT PURCHASES (0x687bf0, 0x688920): the list +0x5d0
  (remove-if 0x688961 / 0x6889b0; merge sort 0x684bf0 → 0x6839c0 → 0x6846d0
  by +0x160); each entry vt +0x50 (0xbe4aa0) runs vt +0x20 (0x5f3c40): a unit
  TryPurchaseUnits (+0x408; COMPLETED, the PURCHASE line); a building 0x68afe0
  (+0x468): +0x159 & 0x10 refused, 0x1714d0, price 0x1b18c0 (+0x1688, @0xf2f97c)
  << 8, the analysis value 0x5d4920 below yieldValue(price) × 0.25 (@0xd2f324)
  refuses, UNITS + SLUSH ≤ price refuses, UNITS > price × 0.5 (@0xd20458) or
  SLUSH > 2 × price, the request 0x977490, the spend, +0x1b8 lowered.
  Confirmed: runs/h1_duely1121 t178 Hunza's Stock Exchange 660 Gold
  (`tryPurchaseBuilding` / `_minor_contract_building`). Then goldPatronage
  0x6898b0, 0x68a100, 0x689610. The GREAT_PEOPLE slot stands apart while any
  class stands (0x2f7eb0; runs/h1_duelw1124 p4 t18). Open: 1124 p3 t27, t72
  pass only folded (C-126).
- Build Unit's "already held" (0x7f4e00 → 0x18e9f0 → 0x18fe60) reads the
  buildings, not the queue (runs/h1_duelw1121 Antioch t45).
- CONTRACT lines come only from a city (0x5d6050 and 0x5d4d70's head); a
  contract no city lists prints none (runs/h1_duelw1117 Valletta's contract 47).
- TryPurchaseUnits' threat (0x68c027): +0x1b8's sign clear. The purchase
  request (0x977570) refuses a unit whose stacking class holds the centre
  (runs/h1_duelm1117 Antananarivo t24-26; runs/h1_duelw1124 Granada t20-23).
- 0x5d2810 starts its bests (+0x30, +0x2c) at 0 (0x5d286c / 0x5d2876) and
  stops below them (0x5d2941 / 0x5d2947).
- A city-state's district price locks at placement (runs/h1_duelv1124
  Granada's Harbor 53; `minorPlaceDistrict` / `minorDistrictCost`,
  `citystate_dist_cost`).
- The nodes (registration 0x7cbca0, names 0x7db850): Decode Trigger 0x7f2970;
  Contract Manager 0x7f17a0 (parent 0x7f1500; counter +0x50); Add Goal Tech
  0x7e7d20 / 0x7e7200; Build Unit 0x7f4e00 / 0x7f4240; Reserve Plot 0x7f7da0
  (0x5d74c0: yields to 20.0 above it); Check Plot 0x7f6ea0; Find Available
  Unit 0x7ec7b0; Cancel Contract 0x7f5200 / 0x7f4980; Protect Unit 0x7f07c0;
  Move Unit 0x7f0020; Clear Plot 0x7f7960; Build Improvement 0x7e9670;
  Purchase Plot 0x7f7bf0 / 0x7f6820; Has Player Ability 0x7f1fa0.
- MOVE UNIT 0x7f0020: the kept unit (+0x50) reaching the location in one turn
  (0x791300) SUCCESS else RUNNING; none kept: the first reaching it with
  Movement left (kept, SUCCESS), else the first reaching it or the fewest
  turns (0x272a60), RUNNING. The danger (0x7f040d: 0x716a60 on +0x12d8 into
  0x716a90): a dangerous location releases its unit; a path kept only to a
  clear one (0x7f057e); the execution 0x7eeba0 takes no walk ending in danger
  (0x7eed65 → 0x7ef0bb). Protect Unit counts damaged units in danger.
  Confirmed: runs/h1_duelw1127 Mexico City's Builder t22-39. Open:
  runs/h1_duely1124 t30, runs/h1_duely1121 t28 (C-99).
- CLEAR PLOT 0x7f7960: the first with charges on the plot, or reaching it with
  Movement, kept (+0x40) SUCCESS. Execution 0x7f6630 (@0xf2ef18): on the plot
  it stands on (0x90290) one request (0x53e20, vt +0x60): the improvement's
  removal (0x967100), else with Harvest the harvest (0x95fb20), else the
  feature's removal (0x965fd0); Release on Complete (+0x778 −1, 0x1e60f0).
  Check Plot sets Harvest only on a bare resource (0x7f7844, +0x74).
  Confirmed: runs/h1_duely1117 Caguana's Builder 1114117 t135-138.
- A captured civilian is a new unit (runs/h1_duelw1124 t112 Builder 1114113 →
  5111833; `seizeCivilian`). Attack Units (0x776140, `assignTo` / `_tac_assign`)
  holds CIVILIAN targets (0x80c080's list, blow 150) and moves onto them
  (seed9001 t30; `strikers` / `_tac_attack_units`).
- The plot test reads the plot as seen (0x4ac140): runs/h1_duelv1128 t2 Nazca's
  unrevealed Horses. Improvable (+0x54): no city, no district, +0x1e of the
  interface (0x30) −1, not a canyon, an improvement 0x35fd60 (fifth arg 1)
  takes; an improved plot's own values 0.00 (runs/h1_duelv1117 Valletta t10-14).
  CHECK PLOT 0x7f6ea0: 0x35fd60 (arg 0) or its own pillaged improvement (+0x4d,
  +0x44) SUCCESS, else FAILURE with a feature (+0x3c) or resource (+0x40) to
  clear (runs/h1_duelv1124 Cardiff plot 626 t116-122).
- BUILD IMPROVEMENT 0x7e9670: the first with charges (+0xed0) on the goal, or
  reaching the Builder Plot with Movement (planning +0x1fc0), is kept (+0x50);
  the improvement (+0x54) the list's first the goal takes, or its pillaged one
  (+0x58, unported). Execution 0x7e8ef0 builds (0x95a010; repair 0x967560) on
  arrival, the turn trained too. Open: 0x35fd60's arg-1 feature clause
  (+0x108 bit 8; C-127).
- THE PURCHASES (`cpu/core/aiEconomic.ts`): 0x5ce5b0's tail, threat > −1, buys
  0x5d2810's unit (+0x650 list, 0x168-byte entries, by +0x30 then +0x2c; +0xe,
  CanTrain, +0x1b9 < 0x80) while 0x68be60 succeeds: price 0x1b22d0, UNITS +
  SLUSH above it with UNITS > half or SLUSH > twice, or threatened (+0x1b8 low
  byte) the balance ≥ it; request 0x977570; the spend. A Builder's clearing
  lump lands on the item the hook left (1121 Hunza t21). Open: 1124 Granada t72
  passes the Horseman (C-126).
- CITY DEFENSE'S START 0x5cced0: the cancel 0x5d7640, then with a threat > −1
  and slot 5 free CITY_UNDER_THREAT via 0x7265b0 (tree +0x780, worth 0x7a0ac0)
  (1124 player 3 t19): "C-97: City Defense and the assault target's validity".
- ADD GOAL TECH (0x7e7d20 / 0x7e7200): kept contracts (+0x94 tech, +0x9c civic);
  the lists (desired techs / civics, items' prerequisites, a resource's
  harvest tech, a feature's RemoveTech), sorted 0x7e7080, the first posted
  (runs/h1_duelw1124 Granada t2 Bronze Working). A tech contract is posted
  ACCEPTED, IN PROGRESS while researched, ACCEPTED off it (0x5f5940)
  (`addGoalTech`, `_x_add_goal_tech`, `goalsReached`). Open: the sort's key,
  the goal plot's improvement tests (C-127).

## C-126: the purchase list's buildable test and the upgrade's furthest rung — READ, both twins

- The purchase list's first key (0x79d3a0 on the city's copy 0x79a320) is
  +0x0e, the table's buildable byte (0x7989e0 at 0x798cc2 / 0x798d11): the
  prerequisites held AND the StrategicResource stocked (0x4aa790) — so a
  city-state, which trains a Horseman without Horses, lists it last. 0x5ce5b0
  asks any domain (edx −1 at 0x5ce613 / 0x5ce651). Confirmed: runs/h1_duely1127
  Hattusa t39 bought the Galley over the Horseman (`unitBuildable`,
  `_mops_stock_buildable`, `seatUnitRows`).
- The upgrade type 0x5909a0 → 0x5374c0: the rung 0x5375f0 names, refused by
  0x537fd0 (its PrereqTech +0x280 / PrereqCivic +0x270), else recursively the
  furthest held rung. Readers: 0x58fff0, 0x591000, 0x6bf850. Confirmed:
  runs/h1_duely1127 city-state 2 t105 Warrior → Man-at-Arms
  (`minorUpgradeType`, `_minor_upgrade_type`). Open: the majors'
  `civUpgradeTarget` one rung (C-126).
- A formation's promotions are the absorbed unit's (runs/h1_duely1121 t214;
  `formed`).

## C-96: the unit value's unit count and the founding Production — READ, both twins

- The cut's count (0x7b62c0 at 0x7b63aa; 0x469db0, 0x469ce0, 0x3dcf50): +0x12e8
  +0xc0 is the unit pool's count (0x2200-byte units, 0x4ed94a), every unit; the
  analysis runs before the savings purchases (0x687bf0; the log 0x5d4030):
  `minorPhase` counts before `minorMilitaryTurn` → `minorBuildFacts`'
  `unitCount`; GPU `_minor_ai_turn(s, units)` → `_MinorFacts.units_before`.
  Confirmed: runs/h1_duely1124 Bologna t19 Archery 267.5. Open: 1128 Hong Kong
  t196-203 at war (C-96).
- The founding Production: the turns (0x17bb40 / 0x17b1e0 / 0x17b5a0) read the
  live attribute (0x1cb9f0 → 0x1c5350 → 0xaa740; queue +0x1f0 set at 0x1baa90 →
  0x17d210); the first analysis reads it before the Palace and the minor's
  modifiers (Displeased −10%). Two analyses that turn: the founding one the
  pick reads (0x5ce8f0) and the full one the next research reads
  (`foundingProduction`, `minorBuildFacts`' `founding`;
  `_MinorFacts._founding_production`). Confirmed: every duely founding's t1
  pick (runs/h1_duely1124 Bologna t2 Archery 142.3).

## C-98: the unit efficiencies — READ (0x79a440, its simulated combats 0x205720 off the map), ported: every entry the logged table's

`unitEfficiency` (`cpu/core/aiUnitEfficiency.ts`; tools/install/ai_tables.py's
`support`, `tags`, `abilities`); GPU `rules.unitEfficiency`.

- The job 0x79a440 (once): the neutral player's units off the map (0x4eeb70 at
  −1, −1). Diagonal 1.0 (0x79a7c5); pairs i < j (0x79a8b7); weak = max(Combat
  +0x48, Ranged +0x6c, Bombard +0x40) 0 and AntiAir +0x34 ≤ 0: weak / strong
  0.01 / 100.0, strong / weak 100.0 / 1.0 (0x79a9fd), weak / weak 1.0
  (0x79a95e). Two strong: two simulations (0x205720, expectation), damage over
  both (+0x7c / +0xc4, ≥ 1.0), exchanges 0x640000 / damage (100 / damage); the range term
  (0x79ab16..0x79abeb) ceil((Range − 1) / the other's BaseMoves +0x38), none
  across air / anti-air (0x79aafa, 0xadd590); M = ex_i / ex_j (0x79af67,
  0x79b064). Anti-air (0x79b115..0x79b63f): t = AntiAir × 0.05.
- The simulation's combat (0x205720 → 0x209550): AIR, else RANGED / BOMBARD
  by the larger, else MELEE; base 0x56dc90 / 0x56e3e0 / 0x56daa0 + 0x51c810 /
  0x51f070; damage 0x51a240: base ≤ 0 takes 65 (gp +0x1f0); else 0x519090.
  Melee 0x206960: formation 2 takes nothing (0x206a1f), formation 1 its whole
  HP (0x206bf0) — the Anti-Air Gun's 82.58; ranged 0x207a80. The air strike
  0x202440 → 0x203cb0 (0x204451; the target defends at AntiAir unless a
  fighter, 0x203d3f; 0x2047f2).
- The modifiers: both units the neutral player's, so every
  COLLECTION_UNIT_COMBAT strength modifier of EITHER unit met for the attacker
  counts (the Berserker, Redcoat, Digger); a unit requirement with no plot is
  unmet (0xb028c0, 0xb12d50, 0xb95b80), its Inverse met. Open:
  REQUIREMENT_OPPONENT_IS_STRONGER's code (a fit; C-98).
- Confirmed: AI_UnitEfficiency.csv 20,736 / 20,736; runs/h1_duelv1117 Valletta
  t2 Heavy Chariot 3.33; h1_duely1117 t3 Wheel 153.9.

## C-96: the trade AI's route value — READ (0x5e9b20, 0x78f210, 0x78e010, 0x559140's use), PARTLY READ (0x526330's terms, the knowledge base's city order)

`minorTradeList`, `minorTradeValue` (`cpu/core/aiTrade.ts`);
`_minor_trade_list` / `_minor_trade_value` (gpu/core/sim_minors.py).

- THE LIST (+0x870, entries at +0x10 / +0x20, rejected +0x28 / +0x38), kept by
  0x78f210 in the City Analysis: per knowledge-base city entry (0x786160, 0xe0
  bytes) in order, listed (0x78d630) or rejected passes; a gone city leaves
  (0x57960, 0x78d6d0 / 0x78f5d0); an unrevealed destination (0x2d2220 on
  0x468320, +0x2f0) skipped; two tries a turn; the try 0x559140 (finder
  0xf2dc70, plot +0x158, 0x77d10); a domestic one rates 0x54ad70 ≥ 5. 0x78e010
  the lookup.
- K (0x5e9b20, this = KB +0x680, at the ageing's tail 0x5ebb30): reset
  0x5ea780; per own city per listed entry: international not at war
  (0x469cd0) the origin's yields 0x526330(…, −1, 1) (0x54eb90, 0x54c630; the
  path term 0x54e160 skipped; 0x54c6c0), domestic + 0x525b90; valued by
  0x7a6690, the best kept (+0x58 = +0x6d8); TO (+0x688) −1. Confirmed:
  runs/h1_duelv1117 Valletta K 2.10 from t14.
- The order: the builds read the turn before's K, K the turn before's list
  (runs/h1_duelw1121 Hunza t28-29). Open: the entries' order, 0x54c630's term
  (C-127).
- The levied army's return records each unit as made anew (runs/h1_duelw1117
  t42; `levyUnitHome`, `_minor_levy_return`).

## C-96: the Trader's value — READ (0x7a7110, its call from 0x7b62c0)

`traderValue` (`cpu/core/aiValue.ts`; GPU `_cv_trader_value`); `unitValue` /
`_cv_unit`.

- 0x7a7110(out, player, &rate, start, horizon, extra): 0 once the trade units
  (+0x12e8 +0xd8, +0xa0 → +0x1b9 bit 0x40) fill the capacity (0x4d9320 on
  +0x12e0) + extra; else K (0x786160 on +0x12b8, +0x6d8), end = min(start +
  30, horizon): start = end discounted (0x7a1240), else PV − PV (0x7a16e0); +
  0x2c4470 (eras 0x2c3660, id +0x128) as GOLDENAGE_POINT (0x7a60d0); × 4.
- 0x7b62c0 passes start = horizon = T, extra 0; EFFECT_ADJUST_TRADE_ROUTE_CAPACITY
  (0x6c0ff0) its own.
- Confirmed: runs/h1_duelv1121 p4 t17 68.11; h1_duelv1124 p3 t31 21.37.
  Open: 1121 p2 t129's K (C-127).

## C-96: the improvement value — READ (0x7a58f0, 0x7b1320's yields, tourism and modifiers, the feature removal 0x7a3010, the harvest 0x7a37d0, the build unit 0x7a2e20, EFFECT_ADJUST_CITY_FREE_POWER), PARTLY READ (the hazards' turns, 0x7b1320's defence, claimed plots and neighbours terms)

`cpu/core/aiPlotValue.ts`; `cpu/harness/plotValueLab.ts`: 66,566 / 140,000
IMPROVEMENTS rows within 0.01.

- The analysis 0x5ce970: FX(−9999) where 0x35ede0 or 0x35fd60 refuses; T =
  max(0x7610e0 to +0x160, 0x621920 to +0x158). The row (loader 0xac6bb0):
  AirSlots +0x2c .. YieldFromAppealPercent +0x60; Adjacencies +0x110, Tourism
  +0x168, ValidBuildUnits +0x1b8, ValidFeatures +0x1d0, ValidResources +0x1e8,
  YieldChanges +0x218, YieldFromAppeal +0x230.
- 0x7a58f0: the build unit 0x7a2e20 (the cheapest own version by 0x4f2b20);
  charge = cost / (+0x7b0[u] + 3) at Production's value, discounted (1127 t2
  8); the plot's own improvement 0 / its repair; another's 0x7b1320 and
  resource off; an unlisted resource's harvest 0x7a37d0; a feature not kept
  0x7a3010; − charge + 0x7b1320 + 0x7a21e0 (1 copy; 0x7a2140).
- 0x7a3010: Feature_Removes escalated by n = max(civic %, tech %) (0x399810 /
  0x4c9cf0; 0x5267a0, gp +0x37c), at speed (0x5254d0), discounted; less a
  charge (hash 0x11d57532) and the feature's yields T to H (Appeal 0x79e140).
  0x7a37d0 likewise.
- 0x7b1320: FX(−9999) at T ≥ H; a drought 0; the flood turns (0xa2cbf0 /
  0xa2af70: over named rivers holding the plot, 100 / the sum of the entries'
  +0x98[sev] (0xa2efb0 at the realism 0x339140, N 0x339020); −1.0 with none;
  `floodHazardTurns` / `_minor_flood_turns`) and a volcano's (0xa1cc70) cut H.
  A turn: PSEUDOYIELD_IMPROVEMENT 1.0, YieldChanges, each adjacency row on its
  own through 0x365ae0 (runs/h1_duelv1117 Caguana's Batey), YieldFromAppeal;
  Tourism; min(max(n, 1), DefenseModifier) + min(n, GrantFortification), n =
  0x3dfae0 the majors at war (+0xb50, +0x2b48, +0x728, 0x2a92d0)
  (runs/h1_duelv1128 Hong Kong's Forts t196; `warCount` / `war_count`); the
  trap properties 0x7d27db83 / 0x8634aa0f; × 3 for a chargeless unit; PV;
  Housing / TilesRequired at 0x7a3d70; the claims (+0x1380, 0x39de20; 0x7a10c0:
  0x1b1cb0 × 0.5, 0x79f0c0); the modifiers 0x7a4b20. The Farm's second Housing:
  "C-127: the improvement loop's housing".
- The old improvement: 0x7b1320 and −1 copy off (runs/h1_duelv1117 Caguana's
  Batey over a Farm −101.53). Open: the housing term's second whole part (C-96).
- TOURISM (0x7b19a0): source 6 the Appeal × ScalingFactor / 100 (0x1aba40) ×
  (1 + +0x1b20) × fx(1 − max(5 − era, 0) × 0.1) (@0xd2f320, @0xcfc9f8, 0x467eb0)
  (runs/h1_duelv1124 Ski Resorts 153 / 315).
- MODIFIERS (0x7a4b20 at 0x7b23d8, context 0x6ccd50: +0x80 player, +0x70 city,
  +0x64 T, +0x68 H, +0x6c rate); the top level's ring (0x6b1b0, @0xd71be8 →
  0x79ed40) unported (C-100).
- EFFECT_ADJUST_CITY_FREE_POWER (0x6c9640: @0xf03c90, vtable 0xd630b8, slot
  0x6b1af0): 0x7a67f0's whole part — where free power (+0x30d0: 0x1f0020,
  +0x08 × (100 + +0xa8)%) is below required (+0x58, 0x1f02f0; 0x1ee5c0) half
  the Production (@0xd20458) T to H (0x7a2140), else the Amount at
  GPP_SCIENTIST (@0xf2e22c, 0x7a60d0; 0x7a1240), the larger. Confirmed:
  runs/h1_duelv1117 Solar Farms 389 / 485. Open: a negative Amount (+0x1320),
  the scientist weight's writer (C-96).
- CHECK PLOT's MOUNTAIN (0x7f77a4..0x7f7821): on an impassable plot (+0x3a bit
  3) the ring (0x6b1b0, @0xd74c88, 0x7f81c0) gives Plot To Move, a passable
  empty (+0x4c) neighbour, the player's preferred (`builderPlotOf` /
  `builder_plot`; runs/h1_duely1117 t233 Ski Resort).
- The road tier imported is the game era's (runs/h1_duely1121 t222).
- The research turns 0x7610e0 + +0x528 written by GetTurnsLeft 0x4ca120 (−1 on
  an empty queue +0x188; 0x4c9f90 → 0x4ca000, 0x8c4540 −1 at no Science): the
  founding turn writes −1 (runs/h1_duelw1117 t2 Walls trees).

## H-1: the research AI — READ (the choice), PARTLY READ (the value)

AI/Research.cpp: the object (player +0x12a8), a 0x50-byte entry per tech
(+0x318, data +0x370): +0 row, +4 next step, +0x10 value, +0x14 score, +0x18
owned, +0x19 boosted, +0x1a leaf (0x761b70), +0x1b Repeatable (+0x70 bit 8),
+0x1c turns; goal +0x450 (+0x3f8); favored +0x4b0. Log AI_Research.csv
(0x762b40; "Tech Contract %d" 0x5f4be0). Engine: `cpu/core/aiResearch.ts`,
`cpu/data/aiResearch.ts`, `gpu/core/sim_research.py`.

- THE ANALYSIS 0x761170 ("Tech Tree Analysis" job 0x760890): an owned
  non-repeatable row 0. Else a three-level walk: each row's turns left
  (0x4ca000: cost 0x353a70 less progress [+0x388] and bank [+0x1e8], max 0,
  ceil over Science 0x4c9f40 via 0x8c4540, −1 with no Science; the walk takes
  the cost where ≤ 0, 0x7612ea), an unresearchable row (0x4c8c40) adds its
  unowned prerequisites, the next step the last added not in hand
  ([PlayerTechs+0x178][0]); still adding at the third level: out of reach.
  Else turns = max(0, sum), value = 0x7b3e50.
- THE VALUE 0x7b3e50 (row, &discount, turns, H, player, +0x530): past H −9999
  (0xf04cb0). TECHNOLOGY 1.0 (0x7a60d0, the bias 0x700810), +1.0 with an
  EmbarkUnitType (+0xc0), +5.0 EmbarkAll (+0x70 bit 4), +5.0 where 0x7a4850; a
  row of an earlier era × (game − era + 1), the game era ([+0x1358]+0x158,
  constructor 0x411770) the era before through the starts of a new era's turn
  (runs/h1_duelw1121 t30, t60; `aiGameEra`), else + GOLDENAGE_POINT of
  0x2c4170 — each PV(H) − PV(turns) (0x7a16e0; 0x7a1240). Paid whole: per
  unlocked unit (+0x178) the cities' average analysis value (0x17d660,
  0x5d4cd0, ≤ 50) × 10, per upgrade source (+0x1d8, 0x4f2c90) max(average −
  the upgrade's Gold (0x5376d0 → 0x7a6690), 20); UNIT_COMBAT 100 where 0x4f2af0
  names it and 0x536da0 fails (never). TOURISM of +0xe8 (0x1aba40); buildings
  (+0x90, +0x230) 0.5, a wonder (+0x158 & 0x40) 0.5 WONDER; districts
  (0x406c00) 0.5; projects (+0x160) 1.0 (4.0 counted by [+0x1290]+0x6e8), a
  space-race one (+0xe8 bit 1, 0x7b51ec) 0.1 (@0xd2f320) of n², n the chain
  0x7b8a30 (vt 0xd71b58 +0x10 → 0x79f030, ProjectPrereqs +0x130 / +0x30):
  runs/h1_duely1124 t189-205 Rocketry; a weapon (+0x148) NUCLEAR_WEAPON 1.0; the
  resources (0x5d45c0 → 0x7a21e0); the governments (+0x130, 0x7b26b0); × 1.5
  (0x7b5b22..0x7b5b7f) for the Fav Tech ([+0x12a0] +0xd88) at war (0x3dcf50 over
  +0xb50, not the barbarians); the modifiers (0x7a4b20). The discount GlobalAI
  +0x290 (+0x238; 0x6ddb40..0x6ddba3: AI_DISCOUNT_RATE gp +0x10 via 0x525590
  over 0x200 at 0x6db0cf): 4.0 online; H [GlobalAI+0x2f0][1] 50.
- THE PROPAGATION 0x7604e0: + the unowned prerequisites' +0x10 one and two
  levels up (negatives 0), × 1.5 favored (1124 t1 Rome's Animal Husbandry
  90.4).
- THE CHOICE 0x763020 (key): comparator 0x75d530 — same next step: larger turns
  where the product ≤ 0; a row whose next step is the key loses; unowned first;
  a researchable leaf first; higher score, first on a tie. A best with turns >
  0 and a researchable next: goal, research; else a standing goal; else "BT
  Research Choice" over the researchable (1124 t1 range 5).
- THE TURN 0x760980: the contract list (+0x210) walked, each interface (vtable
  0xd5bae8) +0x40 0x5f36e0 → 0x761980 adds the contract's value (+0x3a0) to its
  tech's (+0x408) score where ≥ 0 and unowned; 5 / 3 with +0x70 (0x5f5940)
  called at +0x10, others released (0x600b00) (runs/h1_duelv1124 t6 Writing
  251.0 = 124.0 + 127.0). Then the propagation; no research: the choice; else
  the best replaces it if its next differs, it beats the goal's by
  AI_CURRENT_TASK_BIAS × 10, and it is researchable.
- A COMPLETION 0x762d60: +0x528 zeroed (0x731d10 on +0x4d0), the propagation,
  the contracts again, 0x68d090 per row (+0x1288), the choice keyed (1124 t6;
  runs/h1_duelw1117 t14 Caguana).
- THE TECH CONTRACT'S CHECK vt +0x70 0x5f5940 (listener 0x7635c0 on signal
  +0x270): no tech CANCELLED; IN PROGRESS with another research (0x761940,
  +0x468) CANCELLED; held COMPLETED; researched → IN PROGRESS; researchable →
  next; else a walk (0x353cb0) to a researchable prerequisite.
- The Science read is after the turn start's growth (runs/h1_duelw1124 t5
  Granada 3.0); the city terms are the city AI's last; a city-state's first
  turn chooses at no Science (runs/h1_duelv1124 t1 Pottery 78.3).
- MEASURED: `cpu/harness/researchValueLab.ts` runs/h1_duelv1127 3,729 / 3,875;
  the logs' goal changes majors 1,654 / 1,805, minors 4,244 / 4,980. Open
  (C-98): the bias 0x700810's arrays, the space race's residue.

## H-1: the military AI's favoured technology — READ (the pick, its use), PARTLY READ (the Free Cities' counts)

`militaryFavTech` (`cpu/core/operations/unitRows.ts`, `ResearchState.favTech`),
`researchAnalysis`; GPU `_military_fav_tech` (sim_minorops.py,
`citystate_fav_tech`), `_rai_analysis`.

- THE PICK (0x71fb80 at 0x720676 / 0x721ad4): "Fav Tech" (+0xd30, value +0xd88)
  := −1, then over the production table ([+0x1290]+0x268, 0x7989e0) an entry
  not buildable (+0x0e clear, 0x798cc2), not sea (+0x0a, 0x798c83), with the
  at-war sum +0x2c (0x469cd0, 0x5eb650 × M, 0x7992b0..0x7994af) above the best
  (r13d from 0x7204b1) and its PrereqTech (+0x280) researchable (0x4c8c40):
  set (0x731d10).
- ITS USE: × 1.5 in 0x7b3e50 (0x7b5b22), read a turn late (runs/h1_duely1127 the
  Free Cities' Archery t33 → t34 83.7 → 125.6). MEASURED: 466 / 513 turns.
  Open (C-98): the Free Cities' counts (no ARMY record), the strengthless rows.

## H-1: the trade record's player — READ (0x5ecb50, 0x787f50, 0x5e9b20's walk), PARTLY READ (the city-states' meetings with each other, the majors' weights)

`routeValueOver`, `majorTradeLists`, `minorTradeValue`, `freeTradeValue`,
`Seat.tradeSeat` (`cpu/core/aiTrade.ts`); `meetCityState`, `meetCityStates`;
`minorLook`; GPU `_route_value_over`, `_major_trade_lists`, `_free_trade_value`,
`citystate_trade_seat`, `citystate_met_minor`, `city_trade_ok` / `_no`,
`_minor_look` / `_meet_citystates`, `_seat_route_income`'s `hypo`, `_cai_value`.

- 0x787f50 (bound by 0x7864c0 on game signal +0xc78 at 0x7869f0, vtable
  @0xd70418): at a meeting 0x5ecb50 sets m_playerKnowledge[+0x2b48] and +0x6e0
  := the other — the trade record's (+0x680) +0x60 whose cities 0x5e9b20 walks
  (init 0x5ec951: the owner +0x6e8). So K is the LAST MET player's route value
  over its lists, knowledge base, wars and weights (domestic 0x5e9f9c:
  0x526330 → +0x108, 0x525b90 → +0x140).
- Confirmed: the Free Cities meet each major at t1 and nobody after
  (runs/h1_duely1127 K 2.10 from t3); city-states meet by a unit's look
  (`minorLook`; 1127 t4 3-4); the meeting reveals no capital.
- The majors' lists: kept at their turn start (0x78f210).
- The destination's Trading Post is the path term's (0x54e160 via 0x5500b0),
  skipped (runs/h1_duely1117 t59 K 5.29).
- The Trader's look along its course (`tradeRouteWalk`). Open: runs/h1_duely1127
  t47, t61 meetings (C-38).
- The majors' weights (`yieldWeights`): leader, civilization, agendas
  (`stageAgendas`, "Choose random agenda"), era strategies, the Economic boost.

## H-1: the civics AI — READ (the choice, the walk, the propagation), PARTLY READ (the value)

AI/CultureAi.cpp: the object (player +0x1278), a 0x50-byte entry per civic at
+0x978 (count +0x988): +8 row, +0xc owned, +0xe boosted (0x39d190), +0x10
value, +0x14 score, +0x18 turns, +0x1c next, +0x20 governments, +0x38
policies. Log AI_GovtPolicies.csv (0x6255f0; "RANDOMLY CHOSEN CIVIC" 0x626600).
Engine: `cpu/core/aiCivics.ts`, `cpu/data/aiCivics.ts`, `gpu/core/sim_civics.py`.

- THE ANALYSIS ("Civic Tree Analysis", 0x61fa20, job +0x838, vtable 0xd5d420;
  0x621e20 → 0x621a20): the research walk with 0x39c0e0 (cost 0x29a010 less
  progress and bank [+0xb40], no max; 0x8c4540), 0x3932d0, prerequisites in
  the install's order (0x29a250; in hand [+0xad0][0]); value = 0x7a9a10.
- THE VALUE 0x7a9a10: past H −9999; CIVIC 1.0 PV(H) − PV(turns); each
  government it unlocks max(v − v(current), v / 2) of +0xb38, written by the
  turn 0x620110 via 0x7b0330(gov, 0x6fec30, 0, 50); the era count multiplies
  both (0x7a9f11: (game − era) times, no +1; runs/h1_duelv1127 120.6), a later
  era GOLDENAGE_POINT of +0x2c (0x2c4110); units (+0x170, 0x5d4cd0 uncapped) and
  upgrades as the research's; UNIT_COMBAT 100 where 0x4f2ac0 (+0xaa8 / +0xb08)
  names it and 0x536da0 fails; buildings, wonders, districts (0x406c00) 0.5;
  its policies: the best card (0x623b90) less the weakest slotted, at least
  20.0 (0x7aacb1) (runs/h1_duelv1121 Hunza Military Training 115.9;
  `civicPolicyBest` / `citystate_civic_pol_best`); the modifiers (0x7a4b20):
  EFFECT_GRANT_INFLUENCE_TOKEN 0x6a3780 (+0x270, 50), EFFECT_GRANT_SPY 0x6aa780,
  EFFECT_GRANT_COMBAT_ADJACENCY 0x6c4060 (0x4bd0d0(−1) = +0x210 − +0x390 as
  0x4bb1e0 stored at the turn start: runs/h1_duelw1121 Antioch t14 459.9),
  EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS 0. (`civicValue`, `governmentValues`.)
- THE PROPAGATION 0x61ee30: own + prerequisites' one and two levels up
  (negatives 0), × 1.5 favored ([+0x268], 0xd2f32c).
- THE CHOICE 0x626600 (key): comparator 0x6182e0 — unowned first; a next step
  on the key loses; larger turns where the product ≤ 0; higher score, first on a
  tie; else "Random Civic Choice".
- WHEN: the turn (0x620110) chooses only with nothing in hand (0x399a90); a
  completion's delegate 0x6293e0 runs the government pass 0x625d70 then
  0x626600 keyed, on the last turn's entries (1103 t12 minor 2).
- THE GOVERNMENT VALUES' CARDS: 0x7b0330 (0x620413, after 0x61ee30 at
  0x6201dc) runs before the slot bests (+0x5b8, 0x620518; read at +0x610) are
  rewritten: a card scored at T counts from T + 2 (runs/h1_duely1117 Caguana
  t15 → t17) (`minorResearchTurn`, `ResearchState.civicSlotBest`,
  `citystate_slot_best`).
- THE CIVIC CONTRACTS (0x623bd0, via 0x5f3650 with +0x408 / +0x3a0): added to
  the civic's score past the propagation; held by the culture AI until done
  (runs/h1_duely1117 Antananarivo contract 65) (`civicAnalysis`'s
  `CivicContract`, `_cai_contracts`).
- THE GOVERNMENTS' HOUSING: EFFECT_ADJUST_POLICY_HOUSING reads the forecast
  after the turn's growth, the policy jobs the city AI's last (runs/h1_duely1121
  Hunza t55-57) (`aiView`'s forecastNow, `_pol_ctx`'s forecast_now, `_cai_turn`).
- PARTLY READ (C-98): Online Communities' 0x6a1380 (@f04068, vtable 0xd62818;
  0x552fb0, 0x54ff90; the tourism toward a player 0x394830: per city +0x1ac8
  0x1ab5f0 + 0x1ab2a0, the defence +0x1310 +0xf30 / +0xff0, gp +0x6d4, +0x1b1c /
  +0x1b18, × (100 + +0x1248 + gp +0x6e4 + open borders 0x3dab70 +0x6dc + tiers
  × +0x6cc + 0x8f1530 / 0x8f3700 / 0x8f2910 − +0xf90)); Market Economy's
  0x6b2aa0 (@f03d60, vtable 0xd63130) / 0x6b44d0 (@f03d68, vtable 0xd631f0):
  per route of +0x1ee0 (0x6c8660 → 0x1fa000, 0x542bd0; functor vtable 0xd64048,
  0x6c8fa0 → 0x6c89b0) the destination's (0x57960) class resources (0x1f71b0,
  0x5cbc0, 0x4ab4b0; LUXURY 0xa9f06a65, STRATEGIC 0xc163880a, BONUS 0xa3fcd07b,
  ARTIFACT 0x438194d8) × Amount (0x7a6690, 0x7a2140).
- UNREAD (C-130): EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER 0x6b2060 (@f04260,
  vtable 0xd630e8; via 0x6b5b30; COLLECTION_UNIT_COMBAT 0x69ed80 over +0x618's
  counts 0x5eab80; gp +0x210, 0x56dc90); EFFECT_ADJUST_UNIT_BUILD_CHARGES
  0x6aaec0 (@f040a0, vtable 0xd62d40; +0xed0, +0x648, 0x5d1cb0, 0x5d4ae0).
- MEASURED: runs/h1_duelv1127's city-states 2,446 / 2,952; the logs' picks
  3,558 / 3,626 minors, 1,203 / 1,295 majors.

## C-95: a river crossing's Movement — READ

MOVEMENT_RIVER_COST (2) loads (0x2d58f0) into gp +0x50c (beside EMBARK +0x504,
PORTAL +0x508); its one reader 0x5301e0, from the cost callbacks 0x26e920,
0x270980, 0x270be0: a crossing (0x531510) by a unit not exempt (0x266470) adds
it << 8 to the step's cost (0x26ee80: +0x34 via 0xac650) (`RIVER_CROSS_MP`,
`river_mp`).

## C-95: the unit pathfinder and the planning's reach — READ, confirmed on the Wander draws

`reachPlots` / `pathTo` / `search` (cpu/core/tactical.ts); `_tac_search`.

- Dijkstra (GeneratePath 0x77d10, step 0x793f0; the pool 0x26f330 has no
  heuristic): the open list (+0xf0 / +0xf8) sorted by (f, g) (0x775a0: below
  the head first, above the tail last, else from the nearer end in float —
  from the head BEFORE the first equal, from the tail AFTER the last); a
  re-keyed node walks headward past strictly greater keys (0x79560). The step
  pops the head (0x781e0: NotifyList 2 then 3) and links its neighbours in
  DirectionTypes order (0xeff730: NE, E, SE, SW, W, NW) as the valid callback
  admits (LinkChild 0x78750).
- UpdateParents 0x79660 (a closed child made strictly cheaper): a stack
  (+0x110) reprices each node's children (+0x38, +0x4a) by the cost callback
  (+0x48), skipping its parent; a cheaper child takes cost and total (+0x1c /
  +0x18), the parent (+0), an open one re-keyed (0x79560), notify (+0x68, 3);
  validity not asked again (`search`'s `kids`, `linked6`, `update_parents`).
- The path's turn ends (0x2720a0 at 0x26e570's end): each node records
  (0x271be0) the plot seen (+0x50 bit 2) and its own stacking units (0x585eb0,
  +0x54); a turn-ending node seen at the stacking limit (+0x1b0) is refused —
  flags +4 / +0x1000 clear; the destination tested only at +0xd8 (taken as
  never) (runs/h1_duelw1121 t11 Horse Archer 34:8 → 30:7). Other turn-end
  tests (0x272262..0x272313): a mountain (+0x50 bit 4, 0x4924), an impassable
  feature (+0x50 bit 8, +0x1f6), water under 0x80 (+0x50 bit 0x10), a city at
  peace (+0x51 bit 2) — off under +4, which the planning carries. After
  (0x272372..0x272692): embarking (+0x1f2 / +0x1f1); flag 2 at-war ground;
  the clans (0x151550, 0x147c20); +0x1f7 or flag 8 danger (0x716a90) from a
  parent of turn ≤ 1, flag 0x8000 water; flag 1 an unrevealed parent unless
  the unit's own plot, a major's territory not open (0x3dab70). Open: the
  +0x1f7 setters (C-95).
- A step (0x26e920, 24.8): no Movement → the next turn at full Movement; the
  cost (0x531660..0x530240: terrain, feature and improvement MovementChange,
  river 2, embark 2, a route's cap, CITY_MOVEMENT_COST 1) above what is left
  waits (turns + 1), unless from the unit's unmoved own plot (flag 0x100) or a
  turn's first step; a zone of control spends everything (0x26f980) save under
  0x800; between two unrevealed plots (+0x51 bit 0, 0x154c0) the parent's or 1.
- The cost 0x270dd0: 1000 × Movement (0x16e7d0, 0x3e800); +4 leaving none, then
  on revealed plots the 1e6 penalties and +3 off own territory; +2 revealed,
  +3 not.
- The planning's reach (0x792c90 → 0x791e00 → 0x26dcd0, 2 turns, 0x115 | 0x800
  | 0x100; 0x26e570 the turn limit): +0x30's 16-byte entries filled by
  NotifyList 0x26d890 at CLOSE (3), a repeat keeping its place with fewer
  turns or more Movement (0x790c60); once per unit at the AI turn's start.
  Confirmed: the Wander draws' order, 98% over 29 duels.

## C-95: the tactical pass — READ (the barbarians' moves; the minors share it)

- The pass (TacticalAI 0x771530): the unit list (+0x240, 0x77d100 from
  0x60a8c0 / 0x6092c0), the moves (0x770ce0) in the AiFavoredItems order
  ("Default Barbarian": Rampage, Attack High, Defend Camps, Attack Civilians,
  Plunder Trader, Coastal Raid, Pillage District, Pillage Improvement, Attack
  Medium, Move to Safety, Attack Low, Chase Target, Wander Near Camp); a used
  unit (+0x258) leaves; the homeland ("Default Barbarian HL": Plunder Trader,
  Move to Safety, Explore Land, End Turn). Globals (0x5bbf80): f2e0f4 Move to
  Safety, f2e100/104/108 Attack High/Medium/Low (0x7784b0), f2e10c Attack
  Civilians (0x779240), f2e120 Defend Camps (0x779010), f2e124 Attack Camps
  (0x778910), f2e130 Chase Target (0x775670, 0x773030), f2e134 Wander
  (0x77b580), f2e138 / f2e13c Pillage (0x77a810), f2e140 Plunder Trader
  (0x77aa20), f2e158 Wander Near Camp (0x77b9a0), f2e168 Coastal Raid
  (0x7794b0), f2e17c Rampage (0x778b40).
- The list's order is the pool's: an id is serial << 16 | slot, ascending slot;
  a gone unit's slot freed next turn, pushed ascending, the last pushed reused.
- AI types (+0x1c0): 2 EXPLORE, 3 COMBAT, 4 DEFENDER; a camp's removal turns
  its DEFENDERs COMBAT (0x154830).
- Wander Near Camp 0x77b9a0: a unit above EXPLORE whose tribe's (+0x11d0) camp
  stands (0x771250): the reach's turn-1 plots with no enemy (0x5862e0) nor own
  stacking (0x585eb0), within 5 of the camp (and its city's); one "Random
  Direction" over the COUNT; none: "Wander Back to Camp" (flag 0x1000); turn
  ends (0x56d6f0, 0x570b40).
- Defend Camps 0x779010: per camp the DEFENDERs within 3 turns (0x774e90), the
  first by slot to the camp.
- Pillage 0x77a810: per target (0x783980) at war — a complete district but a
  centre or Encampment, an unpillaged improvement — the units reaching it this
  turn (0x775340), none already on such a plot (0x774380).

## C-95: the attack plots in the reach, the target list, the rampage, the civilians, the traders, the chase — READ

`tacticalTargets`, `planTargets`, `rampage`, `attackCivilians`,
`plunderTraders`, `chaseTarget` (cpu/core/tactical.ts; gpu/core/sim_tactics.py).

- The reach links a plot a unit at war holds (or a hostile centre,
  Encampment) priced as any step (runs/h1_duelv1121 t4 Warrior 32:22 lists
  33:23 at 2/0), spends the rest (0x26e570: 0x1d0 += 0x1d4), links nothing
  from it (+0x51 & 0x40). The attack test: a district at war with HP
  (+0x58 / +0x5c), else (+0x398 & 0x200 clear) any fighting (0x209dd0) unit at
  war (0x75c50) — no domain test (runs/h1_duelw1117 t73). The planning's own
  ground only (runs/h1_duelw1117 t16), the embarkable water too
  (runs/h1_dueld1121 t69) (`groundOf`'s `anyGround` / `embarks`,
  `_tac_attack_planes`' `any_ground`). Open: the domain test (C-95).
- THE ZONE OF CONTROL 0x530f50 (via 0x26f980 from 0x26e920, 0x270980, the walk
  0x26fe20 at 0x270800, stored +0x518; layer 0x2665b0): the ring functor
  0x52f710 (0x6aef0), else per direction a district at war exerting (0x24c2f0)
  or a unit at war (religious layer +0x1ce4), alive (+0xcf0, +0x770), of the
  mover's domain (+0x650, 0x266720), exerting (0x56d6c0, +0x1410), seen
  (0x5033a0); the path's destination's exerter answers none unless its
  stacking is full (0x585eb0, +0x58c). Cost max(cost, left) (0x26eb7c,
  0x270a2d) unless 0x800. A move keeps its Movement on entering a zone
  (runs/h1_duelw1117 t8 Warrior 196610; 0x56c690 +0xdb0) (`stepUnit`, `walk`,
  `inEnemyZoc`; `_tac_zoc`, `_step_verb`; runs/h1_duely1128 t107 Galley).
  Open: the walk's deduction 0x265d80 (C-95).
- The planning's zone (0x26e570 at 0x26e83e..0x26e8ae, flag 0x200 clear): a
  step from a zoned non-own plot is refused unless an attack (r14b). Exerters a
  fit: seen, same domain, none across a river (runs/h1_duelw1124 t1-60 1,061 /
  1,276) (`groundOf`'s seenZoc, `_tac_search`'s zs).
- The planning's attack plot (0x26e570 at 0x26e5cd): nothing leaves a node
  with +0x51 bit 0x40 (0x5861f0, 0x585fc0 → 0x523520; religious 0x5237e0); a
  bare centre is passed; cities zone their land (runs/h1_duelw1124 t7-52)
  (`foughtOn`, `fought_n`).
- An unrevealed plot is a leaf (0x2720a0 flag 1, 0x272618..0x272635): "C-95:
  Explore Land and the barbarians' revealed plots".
- THE TARGET LIST 0x783980: plots in index order seen (+0x290): own district
  FRIENDLY_CITY; at war (0x469cd0) COMBAT_DISTRICT where it defends (0x24c2f0)
  and nothing more, PASSIVE_DISTRICT where RequiresPopulation (0x527e30),
  complete (+0xb08), unpillaged (0x24c3a0) (1124 t201); else its defender
  (0x208b80) LOW (AIR_UNIT); else the first of a camp, goody hut, Trader at
  war, the civilian (CIVILIAN / NEUTRAL_CIVILIAN), religious unit, an enemy
  improvement. Revealed only: camp, hut, improvement, districts. Then 0x786d50
  MEDIUM beside a non-fighter; the barbarians (0x786e70, +0xa8, 0x469ce0) HIGH
  within 4 of a CAMP (ranged within range + 1; gp +0xb0 / +0xb4). Ids (0x5bcb80):
  f2e198 FRIENDLY_CITY .. 1c8 IMPROVEMENT. Open: the knowledge base's unseen
  units (C-129).
- THE PLANNING'S TARGETS 0x792f90: within 2 × Movement + range; spots 0x790c60
  (≤ 6), LoS 0x58a6d0.
- RAMPAGE 0x778b40: tribes whose camp a unit took (0x152df0: +0x18, +0x1c,
  from 0x154830); each unit the nearest target of that player with a spot, else
  the nearest, struck (0x771670); with none (0x1479e0) toward its raid's
  (+0x48) or assault's (+0x60) city within 16 (0x93d570) by 0x775c60.
  Confirmed: 1124 415 / 423 picks.
- ATTACK CIVILIANS 0x779240: units reaching it in two turns (0x775340; sort
  0x76f210 stable) move onto it (0x773270: 0x56c690, 0x962190 flag 0x10; done
  0x56d6f0, 0x570b40, 0x77d180), ranged ones strike (0x964a40).
- PLUNDER TRADER 0x77aa20: reaching this turn (0x7746a0 → 0x773fb0) and
  plunder (0x955950).
- CHASE TARGET 0x775670 → 0x773030: each land unit takes (0x775170, 8) the LOW
  target on its plot, else the LAST within 8 it reaches in two turns, and moves
  within range (0x775c60).
- ATTACK UNITS 0x7784b0 and MOVE TO SAFETY 0x77a4b0 (influence map 0x717460):
  their sections below.

## C-95: the planning's spots and the combat prediction — READ, ported

`planUnit` / `predictBlow` (cpu/core/tactical.ts), `_tac_plan` / `_tac_predict`
(gpu/core/sim_tactics.py).

- THE TARGETS (0x792f90): unit targets and COMBAT_DISTRICTs within 2 ×
  Movement + range (0x56e3d0), list order.
- THE SPOTS (cost callback 0x26d6f0 → 0x790c60 on every link of the two-turn
  search): melee — the plot an attack on the target is linked from, a plot
  beside it no other player holds that the step ends on with no Movement or the
  unit's own; ranged (+0x19f8) — any linked plot within range (LoS beyond 1,
  0x5cf2b0); land spots never water; six a target, a plot once.
- THE PREDICTION (0x791470): the roll at 6 (`damageExpected`), the blow's
  strengths (`meleeUnitStrengths`, `rangedUnitStrengths`) from where the
  attacker stands; ranged and on-embarked blows take none back; a civilian
  150; the blow back per spot (+0x94 / +0xac); a kill marks `wins` (+0x60).

## C-95: Attack Units — READ, ported

`strikers`, `assignAttacks`, `carryOut`, `attackUnits` (cpu/core/tactical.ts);
`_tac_attack_units`, `_tac_assign`, `_tac_merge_sort`, `_tac_carry_out`.

- THE SELECTOR (0x7710f0): AI type EXPLORE or above; a Scout only while its
  tribe rampages.
- THE STRIKERS (0x775340): per target (LOW takes RELIGIOUS at war), in pool
  order, units whose planning holds the plot in two turns — melee; ranged a plot
  exactly its range away with Movement left and no own stacking (0x78fa10); a
  DEFENDER only its own plot. Targets within 5 (0x76eb50).
- THE FILTERS (0x776140 at 0x776780..0x7767fa): unless HIGH or
  UseMaxMeleeTrainedStrength (+0x1ba bit 0x20): with the fifth argument a spot
  where taken + back taken (+0x7c, +0x94) tops dealt + back dealt (+0x64,
  +0xac) is dropped; with the sixth (always, 0x80d63a) where taken + back taken
  tops the health (0x56e0d0 − +0xcf0). The kill (0x791470 at 0x79174a): dealt =
  the larger of the two results ([rbp−0xc], [rbp−8]), kill byte +0xc4; the
  blow back re-simulated (0x205720, sides swapped via 0x213e00). The combat
  object (0x213ab0): each side its unit, owner, id (+0x2e0, +0x100) and plot now
  (+0x220 / +0x224 at +0x90 + side × 0x48), the combat plot +0x48; 0x205720(…,
  1, 1) by kind (0x206f40 melee) on the units as they stand (runs/h1_duelw1117
  t9 Warrior 131073 fortified; `fortWas`). Open: t10's flee (C-125).
- THE ASSIGNMENT (0x776140): health floor(100 × 281 / 256) − damage; a unit that
  moved with turns 1 only its own plot; the stacking block (0x776890..0x776909:
  a unit of the mover's class blocks unless the player's, in the mover's job
  +0x7d0, with Movement +0xdb0; runs/h1_duelw1124 t11); claims target, unit,
  spot (0x776244..0x7766f3, 0x28 each). ONE pass of the Generalized Assignment
  (0x8b5bf0): gain λ 0x7702b0 (dealt / turns, a kill +100, overkill (health −
  damage) + 100, a barbarian × 0.8, less what is held), the knapsack 0x61ddb0 at
  capacity 1, move λ 0x770710; sorted 0x7704e0 by EASTL's merge sort.
- THE EXECUTION (0x771f80): moves, bombards, ranged (unless a melee one is
  stronger and reaches), move-and-attack. The moves (0x771ff0..0x77219b): per
  valid entry (stride 0x38, +0x2c ≥ 0) of a live unit off its spot:
  UNITOPERATION_SWAP_UNITS (0x972880, 0x7fa205d1, queue +0x60); still off it,
  nothing where an enemy (0x5862e0) or own stacking (0x585eb0) holds it, else
  MOVE_TO (0x962030, 0x580f2f68) (runs/h1_duelw1121 t15; `swapUnits`). Open: the
  swap's CanStart (C-125).
- The GPU predicts a pass's blows as a batch (`_GameRows`).

## C-95: a strike's move order onto a plot out of sight — READ (the strike), FIT (the path's sight test)

- THE STRIKE 0x771670: the unit list (+0x270, 0x30 each: +0x24 dealt, +0x28
  taken), two filters ([rbp+0x108] exchange, [rbp+0x110] survival); Rampage
  (0x778b40 at 0x778f57) passes neither. A fighter / COMBAT_DISTRICT (0x208b80,
  0x7716f4): the ranged loop, then the melee loop's MOVE_TO with flag 0x10
  (0x962030 at 0x771e44).
- FIT: a melee MOVE_TO on a target its player does not see goes nowhere
  (runs/h1_duely1117 t13-21 Scout at 13:13; h1_duely1124 t114 → t115) (`groundOf`'s
  attack, `_tac_attack_planes`). Open: 0x2720a0's test (C-95).

## C-95: the planning sets out on the full Movement, the walk on the turn's restored — READ (the planning), FIT (the restore's place)

- UnitPlanning 0x791e00 → 0x26dcd0 (third argument 1, flags 0x115) installs the
  start callback 0x26eea0 (+0xa8): the start node's Movement (+0x1bc, read by
  0x26e920) = GetMaxMoves (0x56e130 via 0x266660) << 8; "unmoved" 0x100 the
  formation's +0x4b8 (`search`'s fromFull, `_tac_search`'s from_full).
- FIT: the barbarians' Movement restores before 0x1514a0 grants the techs
  (0x14f530) (runs/h1_duely1121 t61 Quadriremes 1900549 / 2228245) (`barbMovesNow`,
  `refreshBarbarians`, `_barb_reset_mp`'s opened).
- The replay's blows go to the combat log's unit (`engineId`;
  runs/h1_duely1127 t86 Crouching Tiger 1703937; cpu/harness/replayActions.ts).

## C-95: the danger map and Move to Safety — READ, ported

`dangerPlane`, `flees`, `safePlot`, `moveToSafety`, `homelandSafety`
(cpu/core/tactical.ts); `_danger_plane`, `_tac_flees`, `_tac_safe_plot`,
`_tac_move_to_safety`. Move to Safety follows Attack Medium (barbarians, Free
Cities), Attack High (city-states), and in the homelands.

- THE DANGER MAP (0x717460, read 0x716a90; built at DoTurn's end 0x4e4560 →
  0x46cdd0 at 0x4e4aa4): per player at war (0x469cd0) each seen (0x5033a0) live
  (+0x770) fighting unit, danger 0x716400 (bombard: max(combat, bombard − 17 gp
  +0x188); else max(combat, ranged)); its plots: the one-turn search (0x7921e0 →
  0x26df90, 0x311) closed, plus a second list within range (0x1e000) outside
  them, and for CanRaid (+0x18bd; Coastal Raid 0x7794b0) the land beside them
  (0x6b0a0, 0x715f40); added per entry (0x71690c / 0x7169a1); air (+0x650 1)
  within range. Each seen district of theirs (+0x1308 → +0xd8, every placed one
  and DISTRICT_WONDER): defence (0x24ae80) >> 8 on its plot, its strike
  (0x249ee0) >> 8 over its reach (0x249e40) less its plot, else 1 on the ring
  (0x6b1b0 → 0x691f0, 0x715ff0); defence base 0x24a000 only with HP (+0x58 /
  +0x5c), strike only while 0x24b960 (+0x8d8, 0x5e97d629). The player's own
  districts lower it (a defended plot 0, the strike's reach ≥ 1). Features'
  DangerValue (+0x2c): burning 80, Bermuda 10. The garrison term at flag 0
  (0x24a180, 0x208b80, 0x522630, +0x1868) (`districtGarrisonedStrength`,
  `_garrison_cs(plot=)`).
- A ship's strike onto land (a fit): the search's reach holds no land plot of
  a naval unit; the search pays the seen zones' cost (runs/h1_duelv1128 t45;
  runs/h1_duely1124 t53 Archer 3473429). Open: 0x26df90's flag, runs/h1_duelv1128
  t20's 31:9 (C-95).
- LAB: the danger search strikes only from a standable plot (runs/h1_duelw1117
  t38; `standToAttack`, `stand`).
- MOVE TO SAFETY 0x77a4b0: each unit left (+0x530, +0x770) in danger listed when
  strengthless or embarked (0x8be30); hurt: a barbarian (0x56ee80 → 0x469ce0) at
  sea always, else at 2 × damage ≥ health (0x56e0d0) with no killing blow
  (+0x1fc0 → +0x60); whole: never a barbarian, else danger > max strength + 20.
  Then (0x774190) each takes its safe plot (0x773fb0).
- THE HOMELAND'S (0x70f3b0, 0x70bf90): 4 × damage, `unitDanger` + 15; a safe
  plot (0x962030) or, a barbarian, Fortify (0x95eae0).
- THE SAFE PLOT 0x716b90: the reach's turn-1 plots, not taken, no fallout
  (0x2d2100), no own stacking (0x585eb0), no enemy (0x5861f0). A FORT: own plot
  (+0x1c / +0x2e0) whose district (0x810d0) has HitPoints (+0x58; 0xabfc20). The
  order: fort; no danger; own territory, less Movement (+0xc); lower danger;
  farther (0x1deb0). A strengthless unit (0x56dc90(1)) skips dangerous water
  (0x834d0) while the best is ashore (+0x738); religious strength (+0x1ce8)
  adds 0x716b10; a goal (0x497d20) none.
- MEASURED: 1117's barbarian "Current Danger" rows 34 / 35 with the others'
  units where their turns left them (tools/civ6lab/turn_order_civ6.md); a
  wonder keeps its required feature (Chichen Itza's Rainforest, t109;
  `paveGround`). Open: t58's fortified Warrior (C-125).
- THE AI'S COMBAT STRENGTH 0x56dc90(unit, flag) (`aiStrengths` / `_ai_combat`):
  Combat (+0xa0 +0x48; +0x1ba bit 0x20 raised to +0xf0); flag 0: an embarked
  (0x8be30) unit not fighting so (+0x18c3), formation class (0x8bcd0) neither 1
  nor 2, +0x21e0 −1 takes its era's (0x467eb0) embarked strength (Eras +0x20);
  then +0x18a8, the formation (+0xc90), 0x56df30. 0x56e3e0 / 0x56daa0 have no
  embarked test. Only the safe plot's test (0x716e8b) passes 1; flag 0 at
  0x7164b9..0x716502, 0x70f4a5..0x70f59a, 0x77a5fb, 0x772437, 0x7753fa,
  0x793453, 0x738f20, 0x73fba0, 0x80dcc5, 0x810e3e..0x810f13, 0x817847,
  0x5ca7e0, 0x5c4910, 0x4bb1e0.

## C-95: Explore Land and the barbarians' revealed plots — READ, ported (two tests below unread)

`exploreLand`, `exploreTarget`, `exploreOk` (cpu/core/tactical.ts);
`_tac_explore`, `_tac_explore_ok`, `_tac_explore_region`; `revealAround` /
`_barb_reveal` (`barb_explored`).

- THE REVEALED PLOTS (+0x2f0, 0x154c0): an unrevealed plot is a leaf (0x2720a0
  flag 1), +3 not +2 (0x270dd0); a move order reads all as revealed.
- THE WRITERS: the reveal 0x50d390 only from 0x508d50 for a barbarian (0x508330
  sharing, 0x50ccc0 war / peace, 0x50d080 RevealAllPlots); 0x508d50's callers:
  sight (0x58aa90 over 0x58b1d0 from 0x58f3f0, 0x586d40), owner 0x84760, an
  improvement's owner (0x84340 from 0x363080 → 0x362ec0). A camp (0x150a30)
  owns its improvement: its plot and ring seen while it stands (`plotsSeenNow`,
  `_barb_seen`, `CAMP_SIGHT`). Confirmed: runs/h1_duelw1124 planning rows 822 /
  1,276.
- EXPLORE LAND 0x70ce90: up to three rounds; each unit live with Movement
  (+0xdb0), EXPLORE (+0x1c0 2), damage ≤ half (0x56e0d0 >> 1), not under way
  (0x26f830), takes HL Explore (0x70aa40); the round's orders (0x962030) carried
  together (0x70a440).
- HL EXPLORE 0x70aa40: the one-turn search (0x7921e0 → 0x26df90, 0x40 / 0x42);
  per closed plot with no danger (0x716a90), not chosen, enterable (0x70bd40:
  revealed, others' ground only at war, +0x4c, own area unless it embarks
  0x56c480, no foreign centre): the unrevealed (0x70a6c0) and unseen (0x70a8b0)
  counts over its sight (0x58b1d0, +0x1998); the largest first count wins.
  Else the region (plot +0x18) not all revealed (0x7861d0: +0x28 / +0x24) —
  the nearest unrevealed plot (0x70b6f0, 0x586360) with a path (0x272a60);
  off any region its area (0x70b550); then the primary, secondary, tertiary
  lists (+0x1290 +0x2f0 / +0x360 / +0x3d0); else the largest second count.
- THE REGION LISTS (+0x298 → +0x2f0, +0x308 → +0x360, +0x378 → +0x3d0): the
  primary every region within three of a city (0x700630 from 0x5cdd70, 0x5cbc0,
  0x5d1e0 → 0x5d000, 0x6fa5e0) (runs/h1_duelv1128 Bologna t5; `cityRegions` /
  `_city_regions`); the secondary across their chokepoints (0x6fe240 /
  0x6febc0); the tertiary every region seen (0x783d5c) or revealed (0x7852db),
  stored by 0x6fad50 (`seenRegions`, `Pass.regions`, `_tac_seen_regions`).
- THE ROUTE FLAG (0x70a6c0): a revealed plot with a route (+0x47) sets the
  second flag; in HL Explore (0x70abe6..0x70ac15) the first such plot with a
  count leads once.
- Open (C-95): 0x70bd40's turn test (+0x128), a goody hut for a full civ
  (0x82d90).

## C-95: the barbarians' raid — READ ("Raid City"'s nodes), ported on the operation manager (the Defend Units' moves and the rally below unread)

The one operation manager (cpu/core/operations: `startOperationAt`,
`operationsRefresh`, `tickOperation`; nodes cpu/core/operations/barbarian.ts)
via cpu/core/barbarianOps.ts (`barbOpStart`, `barbarianOpsTurn`,
`barbarianTrees`, `hooksOf`); Operation Move `passMoveUpdate` / `passMoveExec`
(cpu/core/tactical.ts). GPU gpu/core/sim_barbops.py (`_barb_start_op`,
`_barb_ops_refresh`, `_barb_trees`, `_bop_raid_tick`, `_bop_move_update`,
`_bop_move_exec`, `_bop_attack_units`, `_bop_pillage`); `barbPillageScore` /
`_barb_pillage_score` (gpu/core/sim_orders.py).

- THE TURN (0x6096c0): first list — 0x5c2650, the manager 0x1514a0, the
  planning 0x791b20, the targets 0x785f30, ..., the operation manager 0x722690
  (0x727510) — then 0x785ec0 and the tactical 0x771530, then the homeland
  0x70a370. The operations tick after the tribes and before the pass; a tribe's
  start logs first (runs/h1_duelw1110 t42).
- THE TREE POOL (manager +0x3a0): 0x7ff7b0 → 0x7fef20 takes the free list's head
  (+0x2c, +8 next) else a new block (0x7ff430); id = (+0x28 += 0x10000) | slot;
  the used list (+0x38 / +0x40, +8 / +0x10) in slot order. The tick 0x7ffdd0
  walks it (0x7d3a00), the destroy loop (0x7cb2e0) frees to the head; a tree
  started mid-walk ticks only past the ticking slot (runs/h1_duelw1105 t12).
  Slots 0, 1 held, generation 3 first (runs/h1_duely 196610; `BARB_TREE_HELD`,
  `BARB_TREE_FIRST_GEN`). Once per priority, highest first (0x7cb3d0: +0x548):
  the City Assault 4, the raid, capture and scout trees 3 (runs/h1_duely1128
  t35-78) (`newBarbTreeId` / `_bop_next_id`, `freeEndedTrees` /
  `_bop_free_ended`).
- THE HANDLERS (dispatcher 0x7cbca0, ids by 0x7db850, @d5b198 unnamed):
  Operation Move 0x81a130 / 0x816cb0; Attack Units 0x80ecf0 / 0x80ceb0; Defend
  Units 0x80ee70 / 0x80d790; Pillage 0x8134a0 / 0x811390; Siege City 0x8136a0 /
  0x811e80; Attack City 0x813250 / 0x8109e0; Raid Check 0x7c7330; Recruit
  0x7c7580; Spawn Change 0x7c7b70 / 0x7c6e50; Notify Owner 0x7c6fa0; In
  Difficulty Range 0x7f1d70; Make Formation 0x7efd70 / 0x7ee630; Protect Unit
  0x7f07c0 / 0x7ef0e0; Move Unit 0x7f0020 / 0x7eeba0; Change Target 0x8196d0 /
  0x8163a0; Is Ready 0x81a090.
- "RAID CITY" (0x7d3a00): the root Sequence resumes at the child that ran —
  recruit (2: Spawn Change, Turn Limiter over Recruit), march (Concurrent 9:
  Attack Units 10, Move 11, range 2, distance 0), raid (Priority 12: Raid Check
  13, else Turn Limiter 14 (10 turns) over Concurrent 15: Attack Units 16,
  Pillage 17, In Difficulty Range 18 over Attack City 19, Defend Units 20, Move
  21 range 3), home (Concurrent 22: Attack Units 23, Move 24 to the rally,
  range 1, distance 4), Notify Owner 25. A SUCCESS hands on in the tick; the
  walk's SUCCESS / RUNNING nodes execute after it in order; a Concurrent's
  FAILURE skips the rest. A limiter over a FRESH child RUNS.
- ATTACK UNITS: update SUCCESS (the target gone 0x73a8e0); FAILURE only for a
  team in battle (+0x90, 0x738f20) with no unit. Execution 0x80ceb0: teams in
  battle or joined (+0x58; 0x737f90 to +0x18 and +0x48; `OpTeam.joined`); the
  members in list order (runs/h1_duelw1117 t4; `passAttack` /
  `_tac_team_order`), alive, able (0x56c690), on land (+0x738 1), bombard only on
  a foreign city or as a DEFENDER; the targets 0x80b9b0 narrowed (0x80bd20 →
  0x80c080: at war or the enemy, within max(2, Movement) of a member; 0x80be90 /
  0x80bb50 never run); 0x776140 with the exchange filter for a one-unit team,
  the survival filter always; 0x771f80.
- OPERATION MOVE'S UPDATE 0x81a130: per team the goal (0 rally +0xe8, 1 target
  +0xf0); the node's per-team list (0x737920, +0x78 / +0x74) for its goal
  (0x739f60); the unlisted members nearest first (stable 0x814d10, ties the
  join order 0x737e80): within Range the team arrives (+0x70); a planning
  reaching the range this turn with Movement (0x791300) counts; AlwaysRunning
  (+0x50, 0x81be70) RUNNING (0x81c3a6); no Leader Tag (+0x6c) arrived with the
  target the goal: SUCCESS (0x81bed5). Else the run within Unit distance
  (0x814930, 0x815a10, 0x814840), two strays per counted member clear the
  arrival (0x81c042..0x81c07b), the close ones leave the list (0x8160a0). +0x70
  one byte cleared at 0x81a15b, written per team (0x81b241, 0x81b3cc, 0x81bdf7,
  0x81c07b, 0x81c1b7); status 0x81c32c. A missing member (0x81a8f5..0x81a925,
  0x4f2310) or +0x1939 is skipped. Confirmed: runs/h1_duelv1117 t112-122 City
  Defense's Crossbowman.
- OPERATION MOVE'S EXECUTION 0x816cb0: none where the teams gather (0x73aa60:
  +0x5d0 or 0x73ab20) and arrived, with no Leader Tag (+0x7c); the Nonmoving
  list (+0x74, emptied at 0x81c080: none logged); the others nearest first:
  radius min(Unit distance (+0x30 / +0x3c), Range (+0x19f8, 0x56e3d0)), 0 where
  +0x738 > 1 or a Leader Tag, at least 1 where the goal is barred (0x586360
  flag 0x40; 0x586724; 0x5862e0; 0x585eb0); its two-turn planning at the radius
  (0x791300, 0x78fa10) in the goal's region; else the ring walk 0x6aef0 (test
  0x815d50: in-region first, nearer, enterable 0x586360; own units only via
  0x265ac0 → 0x265af0); none, the goal with 0x10; turn ends (0x570b40), MoveTo
  0x962030 (runs/h1_duelw1121 t11 Horseman 851980 → 36:14; t56-76 the Archer).
  THE FLAGS (0x8176d7..0x8178b1): 0x1000 and 1 (Can Explore, DefnId 6, +0x60 /
  +0x6c, only Civ Royale's; 0x469ce0): 0x1001 — later turns may end on own
  stacking, no step from an unrevealed plot (0x2720a0); 0x80 with the game's
  +0x590, 8 non-combat or 0x266950(2), 0x8000, 0x10 barred. The homeland and
  tactical moves pass 0 or 0x1000. A solo +0x1939 unit's alternate order
  (vtable +0x48 / +0x60 at 0x817bea..0x817d9e) unread. Confirmed:
  runs/h1_duely1128 t26-63 Builder Capture's Settler 2228251 stays (`passMoveExec`'s
  moveTo, `laterTurns`, `_op_move_exec`, `_tac_move_to`). Open: runs/h1_duely1128
  t21's raid (C-124).
- RAID CHECK 0x7c7330: SUCCESS at the tribe's score (0x152c00: +0x78 + +0x7c) ≥
  Score; signal +0x8d0 from the pillage 0x9633c0, coastal raids 0x95ba10 /
  0xa4fbc0, combat pillage 0x20bae0 runs 0x154b80: +5 to +0x78.
- PILLAGE: update 0x8134a0 SUCCESS while it holds a unit, else FAILURE;
  execution 0x811390: an unpillaged improvement, pillageable PASSIVE_DISTRICT or
  goody hut of the target city's ground under a member with Movement, on land,
  no bombard: 0x963190.
- IN DIFFICULTY RANGE 0x7f1d70: outside Low / High the child skipped, SUCCESS;
  Raid City's Low IMMORTAL: Attack City never runs (`Seat.handicap`).
- DEFEND UNITS: update 0x80ee70 SUCCESS; marks endangered (+0xb0), hurt past
  AutoProtect 33, a land unit (+0x650 2) afloat (0x834d0) in danger (0x266950(3)).
  Execution 0x80d790: each endangered member (+0xa0) to its safe plot (0x716b90);
  the second pass (0x80de60..0x80ebfc): a promotion (0x116f80, 0x7b5d70); a
  bombard stops; a ship off friendly ground (0x530880) collected
  (0x80e39f..0x80e3d8) and released (0x73d1f0: +0x778 −1 via 0x1e60f0, erased
  only from a COPY of each team (0x735110) — the team keeps it;
  runs/h1_duelw1130 t19 Warrior 851979); a plunder (0x51a080 / 0x51a160);
  (0x80e7e5..0x80e811) no Movement or a barbarian: next; else in danger to the
  safe plot (0x56d6f0 at 0x80e9c5), then Fortify (0x56ef30, 0x570b40, 0x56d6f0
  at 0x80eb3a / 0x80eb42). The moves at 0x80dc28..0x80dc4e and
  0x80e559..0x80e57c end the Movement; 0x56d6f0 zeroes +0xdb0 (via +0xd58)
  (runs/h1_duelw1117 t7-8) (`passDefend`, `hostilePillageAmount`, `_x_defend`,
  `_bop_defend_exec`, `_promote_due`, `_plunder`; `passView`, the pass's
  `ended`).
- THE ENDANGERED (0x738f20, +0xa0): per member each target entry (+0x370) within
  2 × base Movement (0x56d9f0): a fighting unit with no friend on its ring
  (0x6b1b0, 0x737610) where the member is in danger (0x716a60) or HIGH, in its
  reach (0x56e130), adds 0x51a240; a striking city (0x408770) 0x519370; a
  non-fighter joins at a positive sum (not a lone formation 0x739659, +0x1fb8,
  +0x4c), else at damage + sum ≥ HP. A captive in its escort's formation never
  (runs/h1_duely1128 t85 Settler 4718622; `endangered`'s `formed`,
  `_bop_endangered`, `bcap_form`).
- THE RECRUIT'S OFFER 0x60a8c0: unassigned (+0x7d0), turn not done (+0x530),
  alive; 0x816380 → 0x738050. The turn-done setter 0x570b40 (+0x4d8, event
  0xd70ba51f): cleared in DoTurn 0x4e4560; set by 0x771f80, the homeland
  0x70a440, Defend Units, 0x590a30, 0x695660, 0x212500, the creation handler
  0x60a440 (signal +0x60 from 0x4eeb70, a +0x2b8 entry with +8 0).
- THE ASSIGNMENT (+0x778 / +0x7d0): addMember 0x737e80 (+0x720); the pass
  (0x7715a0) and homeland release; a tree's units (0x7d2190 from 0x7cb3d0)
  released when marked (+0x3c8) with no operation (+0x888), else turn done; the
  operation's end (0x7353d0 → 0x73ea10, 0x735790) writes none; the rebuild
  0x73f7d0 adds the live unheld to the first team; the team update 0x73fba0 at
  0x740016 frees a flagged slot (+0x18) with +0x890 clear and +0x1fb8 +0x738 1.
- NOTIFY OWNER 0x7c6fa0 → signal +0x288 → 0x148270; the assault 0x1497d0
  refuses while the raid stands (+0x3c / +0x40): listed (+0x60); the tree done,
  0x73a840 → 0x725000 → 0x7353d0. An operation that loses its units stands empty
  (runs/h1_duelw1124 t22; h1_duelw1128 t143).
- THE RALLY: the camp (init 0x147fc0 → tribe +0x10, +0x18); the starts 0x149980
  / 0x1497d0 → 0x73e7d0 (target +0x2a8, rally via 0x7eb220 at +0x2c0 to +0x318,
  the goals) over 0x7265b0's.
- THE STAGING PLOTS: m_operationStartPoints (+0x12b8 +0xb00, +0xb58 / +0xb68),
  rebuilt by 0x7877e0 (0x785f30, 0x725b80 / 0x726a20): a barbarian's the KB's
  camps (+0x638 / +0x648), else its cities (+0x158 / +0x15c); the evaluation
  0x746920 walks them; no barbarian move reads one.
- THE DESIRED STRENGTH 0x723ab0: advantage ≤ −5 asks −enemy; else advantage ×
  min(own, enemy +0xf0); Raid City −1; the barbarians' +0xf0 stays 0
  (runs/h1_duelt1121; `raiseBestTrained`). The refresh (0x73eb60 / 0x73f7d0)
  after the knowledge look. Open: runs/h1_duelw1121 t57-68's enemy strength
  (C-124).

## C-95: the barbarians' operations on the manager — READ (the starts, Notify Owner, the assault's walk), ported

cpu/core/barbarianOps.ts over cpu/core/operations (cpu/core/operations/barbarian.ts);
gpu/core/sim_barbops.py.

- THE STARTS: the raid (0x149980) names no enemy (−1); the city assault
  (0x1497d0) sets op +0x2a0 to the city's owner (its Attack Units takes that
  player's units and any civilian; Siege City ERRORS at −1); both via 0x73e7d0;
  the trigger value the tribe's index; one at a time.
- NOTIFY OWNER (0x148270): the scout's tree starts or lists the raid; the raid's
  lists the assault (+0x60); the assault's only a bribe (0x147c20).
- "BARBARIAN CITY ATTACK": Concurrent over Defend Units and the Sequence —
  Decode Trigger, recruit (Spawn Change, Turn Limiter over Recruit), gathering
  (Make Formation, Move to the rally), march (Attack Units, Make Formation, Move
  to the target), assault (Siege City, Attack City, Attack Units, Make
  Formation, Pillage, Move onto it), Notify Owner. Its Make Formation takes a
  civilian, so no pair forms.
- Open (C-123): a raid starts a turn after the game's; the readiness (1121
  t16-19, 1127 t36-43).

## C-95: an operation's enemy strength — READ (0x73eb60), ported

`refreshStrengths` / `enemyStrengthAbout` (cpu/core/operations/nodes.ts);
`_ops_enemy_str` (gpu/core/sim_minorops.py).

- THE AGE: 0x5eadb0 counts the records of 0x5ef760 aged at most its seventh
  argument, 2 at every caller — the city threat (0x5cbfc1, 0x5cc394), the
  target walk (0x747433, 0x7477ca, 0x747a0e), the enemy strength (0x73ecda /
  0x73ecf4), the target check (0x73abf0), the evaluation (0x746d07), the city
  value (0x7a0142), 0x654c9a, 0x7aed3b. Confirmed: runs/h1_duelv1117 Caguana t50
  (`recentOf` / `_mops_records`' recent, `minorThreat`, `armyAged` /
  `citystate_kb_aged`, `recentArmy`, `lookArmy`).
- 0x73eb60 over +0x4a0: the enemy (op +0x2a0) or every player at war
  (0x469cd0): the army within 3 of the target (0x5eadb0: max(Combat, Ranged) −
  damage × 0.1), the enemy's own apart ([rbp+0x6f]); then its known cities
  (0xe0-byte entries) within 3, each defence (0x5eb2c0: the strongest district −
  10, or walls); the first above 0 — enemy none or a full civ (0x484a10) — adds
  the owner's best melee (+0xf0, 0x4d9320) less the army there where smaller.
  The readiness (0x73fba0) reads it (runs/h1_duelw1127 t36-43). The Free Cities'
  best melee a GPU plane (`free_best_melee`).

## C-95: the barbarians' Builder Capture — READ (the event, the start, the tree's walk), ported

`barbarianCaptures`, `barbarianOpsTurn`'s backups (cpu/core/barbarianOps.ts),
`seizeCivilian` (cpu/core/combat.ts, `GameState.barbCaptures`);
`_barb_capture_event`, `_barb_captures`, `_bcap_refresh`, `_bop_capture_tick`,
`_seize_civilians` (gpu/core/sim_seats.py).

- THE EVENT (0x212500): the captive then the captor (+0x100; its +0x7d0 / 0x56ee80
  test unread, taken always) as AI_EVENT_UNIT_CAPTURED (@f2e088) on signals
  +0x2b8 (0x200e10): TRIGGER_CAPTURE_BARBARIAN → "Escort Worker To Camp",
  "Barbarian Builder Capture".
- THE START (0x800c60): 0x7265b0 by name, the target the captive's plot
  (+0x220); each payload unit to its team (0x737e80, leaving its old one:
  runs/h1_duelw1128 t25-26); at the event, so it ticks in its priority's walk
  still to come (runs/h1_duely1128 t35 / t37).
- THE BACKUP (0x73e610, set by 0x727510 at 0x72763d before the strengths
  0x73eb60 / 0x73f7d0 at 0x727c74; the walk's 6, 0x746920): runs/h1_duelw1127
  t23's farther camp; Change Target INVALID swaps (1128 t26).
- THE TREE: Sequence 0 — Make Formation 1 (LAND_COMBAT + CIVILIAN), Change
  Target 2, Concurrent 3 (Is Ready 4, Defend Units 5, Move 6 range 1 distance
  2), Make Formation 7 (destroy), Move 8 (range 0). Team: one civilian, a
  COMBAT unit, no naval; advantage 0, ongoing 0.5.
- The barbarians' known camps (+0x638): dropped when seen empty (0x5ebb30),
  added at a look (0x7877e0 → 0x5f0110) in plot order behind those held
  (`barbSeat.campsKnown`, `barbCampsLook`, `lookCamps`; `barb_camps_known`,
  `_barb_kb_camps`, `_kb_camps`).
- DEFEND UNITS on the barbarians (0x80ee70 / 0x80d790): a hurt ship released,
  kept in its team (0x73d1f0); a plunder (runs/h1_duelw1128 t39 "Plunder 16 10";
  `_barb_pillage_here`); a hurt barbarian's orders end (0x469ce0;
  runs/h1_duelw1128 t35-37 Warrior 1114128).
- THE FORMATION'S PATH (0x26ef40): 2+ members (+0x738), not embarked (+0x278),
  one land / 4 (0x2669d0 on +0x650) sets 0x2000; the move 0x26fe20 turns it
  into 0x80 per placement (0x587ca0 → 0x586d40 → 0x586360), read only for sea.
  Open: runs/h1_duely1121 t157-160 capture team 983046 (C-123).
- `targetValid` holds a camp valid; the INVALID swap reads 0x73abf0's camp
  branch (`targetGone`).

## C-95: Coastal Raid — READ, ported

`coastalRaids` (cpu/core/tactical.ts; `coastalRaid` cpu/core/combat.ts);
`_tac_coastal_raid` (`_barb_coastal_raid`, gpu/core/sim_orders.py).

0x7794b0: each IMPROVEMENT then PASSIVE_DISTRICT entry on coastal land
(0x82a10); each live sea (+0x650 0) CanRaid (+0x18bd) unit whose two-turn
planning holds a plot at range 1 (0x791300) queued (0x7803d0); carried out
(0x7735d0): move (0x962190, flag 0x10) and raid (0x95b100 → 0x95b7c0): the
improvement, else the district, 3 Movement; the pillage signal scores the tribe.
MEASURED: 9 / 9 rows take the move.

## C-60: the Free Cities' research — READ (the catch-up's receivers), ported

`freeCitiesPhase` (cpu/core/phase.ts) → `minorResearch`; `_free_cities_phase`
(gpu/core/sim_phase.py) → `_minor_research` on row `FR`.

Player 62 holds a research (AI_Research.csv rows from t1); the catch-up
0x4cb930 / 0x39ec60 counts it a receiver: each row the majors hold at cost − 1,
completing when the era's price falls below it (runs/h1_duelw1123 Pottery t32);
with a city, its cities' Science and Culture. The engines run a city-state's
research for it (`urbanDefensesFit`). Open: its resources term (C-60).

## C-60: the Free City's grant — READ (0x274010, 0x273c50), ported (the allowed list's upgrade lines and the repairs below)

`freeCityGrant` (cpu/core/phase.ts), `_free_city_grant` (gpu/core/sim_phase.py).

- 0x274010 per record (+0x0c city, +0x14 live) each turn: +0x18 + 1; at 5+ the
  city's grants (+0x11d0, +0x7d0 −1) counted (a Builder +0xed0 aside), 6+
  waits. No Builder, no HIGH target within 5 (0x272fa0) and a pillaged
  improvement (+0x44, +0x4d bit 0) within 2: CLASS_BUILDER; else one "Free
  Cities Unit Choice" (0x152eb0) over MELEE, RANGED, LIGHT_CAVALRY; the unit
  0x273a40 the allowed (+0x28) class's highest Combat (+0x48), placed by 0x6aef0
  within 3; the count to 0. Then, not producing (+0x2350), a pillaged district
  (0x173f70) else building's repair.
- THE RECORD (0x273c50, at the revolt 0x276bc0): allowed units: CanTrain
  (0x172820) by the former owner but +0x1b8 bit 0x40, religious (+0x78), air
  (+0x20 2, +0x44 0), class def (0x28a940) +0x48 bit 0x10 (a +0x2b0..+0x2b8
  list, +0x2d0, flags its listless units instead); buildings (+0x48: +0x54,
  +0x58); +0x1c from +0x12f0 +0xf4; the revolt's pair at MELEE within 3.
- The engines: `City.freeGrantTurns` / `city_free_grant`, `FREE_CITY_BUILDER`
  (`_spawn_barb`'s `civ`), `threatened`, `City.freeAllowed` /
  `city_free_allowed` (`trainableIn`), `freeCityChassis` / `_free_chassis`.
  Open (C-120): the +0x2b0 lists; the repairs (0x97a1b0 / 0x97a0d0) and the
  Builder's work.

## C-95: the homeland's Plunder Trader — READ, ported

`homelandPlunder` (cpu/core/tactical.ts); `_tac_homeland_plunder`.

0x70f610, first of the homeland: each TRADER entry (+0x12b8 +0x370, 40 bytes),
each homeland unit (+0x208) not moved (+0x220), live, whose planning (+0x1fc0)
reaches it this turn (0x791300): the move (0x962190) and plunder (0x955950)
queued (0x7094f0), carried out at the end (0x70a440); a civilian too
(runs/h1_duelw1124 t137-151). Open: a Trader on its route stands on no plot in
the engines (C-123).

## C-95: the target list's knowledge-base entries — READ, ported (two records on one plot below)

- After its walk and regions (0x7856f6), 0x783980 asks each player at war
  (0x483b50 +0x4a0..+0x4a8, 0x469cd0) of the knowledge base (0x786160) for its
  units (0x5eb8b0, age 1, distance 2): each record (0x5ef650) of age exactly 1
  whose live unit (0x4f2310, +0x770) stands within 2 of the recorded plot (+0x10
  / +0x14), on a plot unseen now: LOW where its type has Combat (+0x48), else
  CIVILIAN; then 0x786d50.
- The look (0x7877e0) reads layer 0 (0x75800 → 0x75ce0): no Trader
  (runs/h1_duelw1117 t74).
- `knowledgeLook` (`Seat.armyKnown`) / `_knowledge_look` (row `BK`,
  `citystate_kb_seq`); `knowledgeEntries` / `_tac_known_entries` (`uk`, `uu`,
  `us`, `uo`). Open: the GPU's one unit entry a plot (C-129).

## C-95: the scout's tree "Barbarian Found City" — READ, ported

`barbScoutTreeStart`, `SCOUT_NODES`, `tickScout` (cpu/core/barbarianOps.ts),
`barbScoutLook`; `_bop_scout_tick`, `_barbarian_scouts`.

- THE START (0x1485c0 from 0x153ef0): "Barbarian Found City" (0x7ff9a0) on the
  scout, Location the camp, Value the tribe; signals linked (0x1808c4af0).
- THE TREE: Sequence 0 — Decode Trigger 1, Concurrent 2 over Protect Unit 3
  (0.25) and Move Unit 4 (Home Camp, release, allow danger, range 1), Notify
  Owner 5 (0x7c6fa0 → 0x148270).
- PROTECT UNIT 0x7f07c0 (units of 0x6092c0 on +0x12d0): damage ≥ 0.25 of health
  (0x56e0d0, 8.8) on danger (+0x12d8, 0x716a90): RUNNING, else SUCCESS;
  execution 0x7ef0e0 to the safe plot (0x716b90; `passSafePlot` /
  `_tac_safe_plot`), 0x962030, 0x570b40.
- MOVE UNIT 0x7f0020: the held unit reaching To Range this turn (0x791300)
  SUCCESS, else RUNNING; none held: one reaching the location this turn (with
  Movement first), else the fewest path turns (0x272a60 on +0x1fb8, flag
  0x1000). A camp its defender holds is a goal (runs/h1_duelw1121 camp 12:14
  t64-78). Execution 0x7eeba0 (0x53e20, 0x972880 / 0x962030).
- THE PATH 0x272a60 → 0x272880: the plot tested (0x2669d0 / 0x586900 /
  0x20a3c0), the path (0x26f1d0: flags to +0x398, bit 8 with +0x4b8 clear,
  0x2000 for a formation; the A* 0x7a630 over 0x26f330: validity 0x2720a0, cost
  0x26e920); its turns. 0x26e570 is only the breadth-first searches' (0x26dcd0 /
  0x26df90); here a zone spends the Movement (+0x398 & 0x800 clear). 0x2720a0
  (0x272230..0x27235a: parent +0x0, turn +0x2c, newest +0x1dc) refuses a
  turn-ending node (+0x50 & 2) at the stacking limit (+0x54 / +0x1b0) unless
  +0x51 & 4 with +0x1f8, or flags & 4; under 0x1000 (+0xe0, 0x2721df) only at
  turn ≤ 1 (0x27229b). Move Unit passes 0x1000 (0x7f05a0) (runs/h1_duelw1128
  t7-11; `turnsToPlot`, `laterTurns`, `_tac_search(..., True, later_turns=True)`,
  `turns_to`).
- THE LOOK (0x153ef0): a scout (+0x1c0 2), the owner's throttle (@f28c78 +0x110
  at +0x430), an improvement (+0x44) or district (0x810d0) — a wonder's plot too
  (runs/h1_duelw1121 t31; `city_wonder`); a full civ (0x484a10); the throttle
  written (+0x3d8) either way. Each step's sight (0x58aa90) raises it, in move
  order (`stepUnit`, `setBarbStepLook`, `_step_verb`). Confirmed: the first
  trees 1117 t6, 1121 t4, 1124 t6 / t20, 1128 t6 / t8, 1127 t27.
- The scout's tree ticks in the player's list (0x7ffdd0) by id; its Notify
  Owner's raid (0x149980) ticks in the same walk.

## C-96: the city-states' tactical pass — READ (Wander Near City, Heal, the non-barbarian priorities, FindAlternateLocation), the families it needs PARTLY READ

`cityStateTactics` / `freeCityTactics` (cpu/core/tactical.ts), `_minor_tactics`
/ `_free_tactics` (gpu/core/sim_tactics.py); the replay runs them on a copy
(`minorAi`, `minorAi:move`).

- The lists (Tactics.xml): "Minor Civ Tactical" — Support Formation, Attack
  High, Move to Safety, Attack Medium, Attack Civilians, Promotion, Make
  Military Formation, Attack Low, Heal, Chase Target, Wander Near City;
  homeland — First Turn Settler, Move to Safety, Promotion, Builder Outside
  Ring, End Turn. The Free Cities ("FreeCitiesTactics"): Attack High, Attack
  Medium, Move to Safety, Attack Low, Wander Near Camp; homeland End Turn. Ids
  (0x5bbf80): f2e128 Heal (0x779a70), f2e12c Make Military Formation
  (0x77a190), f2e164 Wander Near City (0x77bf50).
- WANDER NEAR CITY 0x77bf50: none with no city ([+0x12f0] +0xc0); a full civ
  (0x469db0) DEFENDERs round their city (+0x11d0 via 0x36f660), the garrison
  test 0x5cdce0 first; anyone else every unit EXPLORE+ with Movement (+0xdb0)
  round its first city (+0x158): the reach's turn-1 plots within 5 (0x1deb0),
  no enemy (0x5862e0), no own stacking (0x585eb0); the weights (0x716a60, +0x60,
  0x2d2220) unread; ONE "Random Direction" over the count, 0x962030. None:
  FindAlternateLocation (0x585940) within 3 (flag 0x1000), else 0x95eae0
  ("Wander Back to City"). Turn ends (0x56d6f0, 0x570b40). Confirmed: 1,199 /
  1,199 turn-pairs pair the draws with the Wander / Garrison rows.
- The Free Cities' Wander Near Camp (0x77b9a0 via 0x771250). Open: their camp
  (runs/h1_duelw1114 t124-127; C-120).
- FIND ALTERNATE LOCATION 0x585940: dx outer −range..range, dy inner (0x1e000);
  enterable (0x586360 flag 0x40), revealed, no other player's unit, no
  unstackable own (0x9406e0); the nearest, another area (+8) × 3; strictly
  nearer replaces.
- HEAL 0x779a70 (moves 0x7737c0): a damaged (+0xcf0), unembarked (0x8be30) unit
  off danger (0x716a90) queued: a non-sea unit fortifies (0x95eae0 where 0x56ef30
  allows) else sleeps (0x9686d0); a hull abroad heads home (0x586360 flag 0x10).
- THE NON-BARBARIAN PRIORITIES (TacticalAI +0xa8 = 0x787000 unless 0x469ce0):
  each FRIENDLY_CITY and ALLY_SUPPORT entry makes the LOW / MEDIUM units that
  threaten it (ranged 0x56e3e0 / bombard 0x56daa0 within range 0x56e3d0, others
  within 2 × Movement 0x56e130) HIGH / MEDIUM. Ids (0x5bcb80): f2e198
  FRIENDLY_CITY ... f2e1c8 ENEMY_IMPROVEMENT, f2e1cc SETTLE_LOCATION, f2e1d0
  GOODY_HUT, f2e1d4 ALLY_SUPPORT, f2e1d8 AIR_UNIT; per owner (0x783980
  0x783ec5..0x7856a5): own FRIENDLY_CITY, an ally's (0x3da560) ALLY_SUPPORT, at
  war COMBAT / PASSIVE_DISTRICT, else NEUTRAL_CITY, by the type flags (+0xb0).
- THE PLANNING'S GROUND: the list (0x26d890) keeps the unit's own plot
  (runs/h1_duelv1117 t115, a fit) and another only where 0x586900 lets it end —
  past a peaceful foreign unit (runs/h1_duelw1117 t52), not into a major's
  closed territory (t32-37), water where it may embark (0x26e920's [r9 + 0x180 +
  domain × 4]); the barbarians' land units none. The step: into a city ≤ 1
  (0x531660, 0x272ca0), no river crossing at a city or water (0x531510); the
  embark 0x530420 / disembark 0x530240 waived by a FreeEmbark district (+0xe1
  bit 2, `dll_rowmap.py a5dfb0`) at either end, its completion read off the FROM
  plot (0x811b0) (t72; `stepCost`, `_embark_waived`).
- THE OPEN LIST AMONG EQUAL COSTS: 0x26dcd0 keeps the null heuristic
  (+0x30 / +0x38), zeroes the destination test (+0x20 / +0x28), destination
  (−9999, −9999); keys (+0x18 f, +0x1c g); AddToOpen 0x775a0 (0x774c0 to float);
  0x79560; LinkChild 0x78750 (cost +0x48 = 0x270dd0 first). An unrevealed plot
  closes before revealed equals two dearer (runs/h1_duely1117 t2 Valletta's
  Warrior: 11:10 4018 against 15:11 4019).
- THE COST'S WATER TERM (0x270dd0 at 0x2712be): a land formation (+0x1f2 =
  0x2669d0(…, 2), set by 0x2715a0 at +0x180 +0x72) on revealed water +1000
  (0x3e800) unless human (+0x1f6) or +0x590 (runs/h1_duely1117 t69 Archer);
  embark tests 0x52fe90 / 0x52fb90 (+1e6). The init: +0x1f1 sea, +0x1f5
  embarked, +0x1f7 +0x590, +0x198 owner, +0x1a4 0x2665b0 (`search`'s price,
  `_tac_search`'s `wet`).
- A city-state's revealed plots (0x50d390 off 0x508d50): written as its units
  step, read at the turn's start (0x792c90) (`minorLook` / `_minor_look`,
  `CityState.revealed`, `mops_revealed`, `revealedOf` / `_tac_known`).
- THE LIST TEST (0x26d890 at close): flags (0x271be0): +0x50 bit 1 seen (+0x290),
  bit 2 mountain (0x4924), bit 3 (+0x3a bit 8), bit 4 water, bits 6 / 7 0x586900
  under 1; +0x51 bit 0 revealed (0x154c0), bit 7 +0x54 at the limit (+0x1b0);
  +0x54 = 0x585eb0 less the mover (0x585d90, vtable +0xb8; 0x518f40; not
  MakeTradeRoute +0x1b9 bit 64 / Spy). Listed: seen, no bits 2 / 3, bit 6, not
  another's occupied; then 0x586900 under 9 (0x586360 with 0x208b80 at 0x109) —
  an unseen plot is listed whatever stands on it (runs/h1_duely1117 t2;
  h1_duely1127 t10, t45) (`groundOf`'s stand, `_tac_peaceful`).
- SUPPORT FORMATION 0x77ae80 (`supportFormation` / `_tac_support_formation`):
  classes (0x8bcd0 → 0xadd5e0): LAND_COMBAT 0, SUPPORT 1, CIVILIAN 2, NAVAL 3,
  AIR 4. A SUPPORT unit alone (+0x1fb8 +0x738 1) with a planning (+0x1fc0) takes
  a free (+0x7d0 / +0x188) same-domain combat unit (0x56dc90) without its class
  (0x266950) — the strongest reached in two turns (0x791300), else the nearest;
  a land unit takes a free SETTLER-pseudo-yield unit. Listed (+0x270), the
  moves 0x773bd0 (also 0x779d00): 0x53e20, 0x962030, joined (0x94bb50), turns
  done (0x570b40, 0x77d180) (runs/h1_duelw1105 city-state 3 t34, t64).
- MEASURED (the replay, five seeds): Wander 5,743 / 5,952, 4,147 end plots; Heal
  253 / 354; Chase Target 29 / 287. Open (C-96): the embark quirk, the
  planning's unrevealed plots.

## C-96 / C-97: the AI's yield weights and the modifier evaluator — READ (agendas' lists, the other analyzers unread)

`cpu/core/aiWeights.ts`, `cpu/core/aiModifiers.ts`; GPU `gpu/core/sim_policy.py`,
`gpu/core/sim_cityvalue.py`.

THE WEIGHT w[y] (0x702ad0, `this` AI::GrandStrategic at +0x1290, constructor
0x6f6e10; a member's data at its descriptor + 0x58): the sum of five 24.8 parts;
0x7a6690 = amount × DefaultValue (Gold 0.5) × (1 + min(w, 9.0)), no floor.

- AI::Religious m_yieldPriorityBoost (0x4681a0 → GlobalAI +0x628, data +0x340):
  Faith; 0x74f5a0: 0, −0.25 when the faith balance (+0x1340 +0x100) passes a
  wanted unit's cost, −0.25 more when the faith per turn (0x496fd0) passes half.
- AI::Economic m_yieldPriorityBoost (+0x1288, data +0x528): Gold; 0x687bf0:
  fx(−0.2) × gold per turn (+0x13a0 +0x1b8) while negative — a member written
  after the research and civics AIs (0x760980, 0x620110) read it
  (`EconomicMemory.goldBoost`, `economicGoldBoost`, `citystate_gold_boost`).
  Open: runs/h1_duely1121 Hunza t88, 1127 Mexico City t150 (C-127).
- The victory manager's Yields (+0x508 → +0x638; 0x7c05e0): Strategy_YieldPriorities
  (0x7bf160 / 0x7bb870): none in the install.
- +0x7a8, the Yields list system (GlobalAI +0x2360, 0x6dd9a0, 0x6e3fe0): the
  leader's and civilization's trait lists within the handicap (+0x908) via
  0x6fece0 → 0x6fde70, a followed strategy's lists (0x7bf160 → 0x7ba440, off
  0x7bb870), fx(Value × 0.01) (0x6dd1b0). DefaultYieldBias: Production +25,
  Gold +20, Science +10, Culture +10, Faith −25; city-states none.
- m_yieldSensitivityBoost (+0x6b0, default +0x6c8; 0x6fafc0 at
  0x6fbdf1..0x6fc771): s = +0x788[y] (GlobalAI +0x2508) > 0, over the player and
  met majors (0x483b50, 0x3daaf0) their yield per turn (0x4bf7c0 on +0x1330): s ×
  (max − x) / sd.
- A city-state's w: 0 but Gold and Faith. The era strategies start the turn a
  major first holds the era's tech / civic and never stop; the policies score
  before the strategies update (1124 player 1 t6 → t7). Open: China's hidden
  agenda's Yields path (C-130).

THE PSEUDO-YIELD WEIGHT 0x700810: [+0x12a0] +0x7e8[p] + +0x620[p] + the
PseudoYields list (GlobalAI +0x2010, 0x6e3e20 → +0x748, default +0x760) + the
+0x768 / +0x780 list, at least −1.0 (@0xd136f4); a GP class (@0xf2e218 ..
@0xf2e238) adds 0x2c4230 (0x2c3660's +0x6c) as GOLDENAGE_POINT (0x7a60d0);
DISTRICT (@0xf2e274) + 0.5 × ChronologyIndex (+0x1c, `dll_rowmap.py a5f3b0`) of
the era (0x467eb0: +0x1358 +0xf8). 0x7a60d0: f = 1 + w, q = 0x655840; f q ≥ 0 → f
+ q, else ±0.1 (@0xd2f320) where |q| > |f|; amount × f × DefaultValue.
Confirmed: 1124 player 1's Great Scientist points under ScienceVictoryPseudoYields;
runs/h1_duelw1110 / 1112 / 1115 an agenda's INFLUENCE +25; runs/h1_duelw1124 t2
Astrology 124.0.

THE REQUIREMENT SET (0x6cef90 → 0x6ccec0, map at GlobalAI +0x4d0): TEST_ANY 1,
TEST_NONE 2, else 0; a type the registry (+0x80, 66: `REGISTERED_REQUIREMENTS`)
lacks is left out; entries {evaluator, args, Inverse (vt +0x40)}. 0x6cf3c0
evaluates. Evaluators: DISTRICT_TYPE_MATCHES 0x6d08c0 (+0x78, else +0x1c);
CITY_HAS_BUILDING 0x6d3830 (a wonder only in its city's evaluation,
+0x10..+0x14); CITY_HAS_GARRISON_UNIT 0x6d4420 (population +0x588 ≥ 9, no unit:
every city-state's Retainers first at 9); CITY_HAS_X_SPECIALTY_DISTRICTS 0x6d4190
(0x1ae8f0); CITY_IS_OWNER_CAPITAL_CONTINENT 0x6cfd60 (+0x70; no capital 0x36f460
holds; +0x30 against m_eHomeContinent 0x467cd0 → +0x160, constructor 0x36a870);
CITY_HAS_X_POPULATION 0x6cfad0; CITY_HAS_HIGH_ADJACENCY_DISTRICT 0x6d4860
(0x1ae530, 0x249850; +0x78); PLAYER_IS_MINOR 0x6d2760 (@f04448; 0x469db0,
0x469ce0). COLLECTION_PLAYER_CITIES (vtable 0xd624b8, @f03bb8: begin 0x69e9e0,
next 0x69ea00 over +0x12f0 +0xa0, at least five subjects (+0xd4), end 0x69efa0):
an empty subject fails 0x6cfd60, so its inverse admits it and
EFFECT_ADJUST_CITY_GROWTH 0x6beb00 values the context city's 2.0 Food —
Colonial Offices 16.0 a city-state (China 12 / 8 / 4, runs/h1_duely1117 t61-122);
Colonial Taxes (EFFECT_ADJUST_CITY_YIELD_MODIFIER 0x6b9d90) never listed
(`subjects`, the `nocity` subject; `_pol_subjects`, `_cv_subjects`). Open: the
city-state's 16 (C-130).

THE ANALYZERS (slot 1; the whole part into +0xc0; span = PV(H) − PV(start) via
0x7a16e0; between 0x7a2140; weighted via 0x7a6690):
- COLLECTION_PLAYER_DISTRICTS holds a district under construction
  (runs/h1_duelw1124 t54).
- EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER 0x6addf0: 0x24b5a0 (0x249850 — none with
  +0xc88; adjacency at +0x218 via 0x366df0 + 0x24acc0 + 0x249db0 × (100 +
  0x249940) / 100 — + 0x24aae0 over +0x3e0) × Amount × 0.01, bare, span
  (`districtYieldOf`, `_pol_district_yield`). Open: the buildings' part
  (runs/h1_duelu Bologna 29; C-130). _CHANGE 0x6acd00 Amount, span.
- EFFECT_ADJUST_PLAYER_OPEN_BORDERS_FROM_INFLUENCE 0x6b63a0 (@f03f28): +10 per
  city-state (game +0x3f8 +0x1650, +0x1368) not suzerained (0x44c850).
- The building production analyzer 0x6c1a80 treats BUILDING_TSIKHE as its own
  type (runs/h1_duelu1117 Antananarivo Limes).
- EFFECT_ADJUST_UNIT_FRIENDLY_TERRITORY_START_MOVEMENT 0x6ac440 (@f040b8):
  fx(Amount) × 0x79ca90 (+0x1290 +0x268, +0x160) / fx(Movement 0x56e130)
  (0x16e940) as Production (@f2f978), between (Logistics 23 / 30).
- EFFECT_ADJUST_UNIT_SEA_MOVEMENT 0x6b85d0 (@f040f0): a naval unit's Amount ×
  (cost 0x4f2b20 × 0.5) / Movement as Production, discounted (0x7a1240); in the
  research value via 0x7b3e50 → 0x7a4b20 (runs/h1_duelw1121 p3 Mathematics).
- EFFECT_ADJUST_PLAYER_UNIT_UPGRADE_DISCOUNT_PERCENT 0x6bf850 (@f04120; parser
  0x6bf3a0): over +0x12e8 +0xd8 (by +0x10), per unit 0x58fff0 (not a barbarian
  0x56ee80; 0x5909a0 → 0x5374c0) Amount × its upgrade Gold (0x590520 << 8, via
  0x5376d0; `MINOR_UPGRADE_GOLD`) × 0.75 (@d1a188) (runs/h1_duelw1121 Hunza t76
  1.0) (`unitUpgradeGolds`).
- EFFECT_ADJUST_FLAT_BONUS 0x6c5700 (@f03ea0, vtable 0xd626c8; parser 0x6c4e40):
  WONDER_CONSTRUCTION (0x5953bf98) the best Production × WONDER; COMBAT_EXPERIENCE
  (0xc819e0a3) units (+0x12e8 +0xc0) × UNIT_COMBAT / 10, running on into
  GREAT_PEOPLE (0xf8705d00) per class (+0x1360 +0x168); ENVOYS (0xe96ca959) ×
  0x44c6a0's points (+0x1b0) as INFLUENCE (Monarchy's 5 on runs/h1_duely1121);
  FAITH_PURCHASES (0xc25143f9; 0x4979f0, +0xa0 / +0x128 / +0x100); OVERALL_PRODUCTION
  (0xc1a005d2); UNIT_PRODUCTION (0x3d5ff1a2; 0x179860 on +0x2170, ≤ 75);
  GOLD_PURCHASES (0x7530bd65; +0x13a0 +0xf8, 0x4e0bf0); DISTRICT_PRODUCTION
  (0x0112d393) no branch. Open: DISTRICT_PROJECTS (0xbcfe99b8, 0x5d1f10), the
  Free Cities' terms (C-130).
- EFFECT_ADJUST_BUILDING_YIELD_CHANGE 0x6c5080: Amount weighted, × 0.5 lacking
  (0x18e9f0), span. _MODIFIERS_FOR_DISTRICT 0x6a1b80 (parser 0x6a1700): per
  building of the district (Districts +0x130, +0x200) the player's version
  (+0x12f0 +0x230), its yield rows × amount.
- EFFECT_ADJUST_TRADE_ROUTE_YIELD 0x6a3160 (parser 0x6a2f70: +0x10 / +0x11):
  capacity (+0xf0, 0x4d9320) × Amount; _FOR_INTERNATIONAL / _DOMESTIC 0x6a49e0.
- _PER_USED_INFLUENCE_TOKEN 0x6a9550 (0x44a440), _PER_TRIBUTARY 0x6ac7f0
  (0x44a5a0), EFFECT_ADJUST_UNIT_MAINTENANCE_DISCOUNT 0x6b0840 (+0x5c),
  EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN 0x6c4820 (@0xf2e204).
- The civics' modifiers: GRANT_INFLUENCE_TOKEN 0x6a3780 (+0x270, @0xf2e240);
  ADJUST_PLAYER_GOVERNOR_POINTS 0x6c2720 PARTLY (0x6eeee0 → 0x6ed2d0, @0xf2e214);
  ADJUST_TRADE_ROUTE_CAPACITY 0x6c0ff0 PARTLY.
- PARTLY: RESOURCE_ACCUMULATION_MODIFIER 0x6b8930 (0x4aa790, 0x7a21e0);
  YIELD_MODIFIER_PER_TRIBUTARY 0x6adb20 (0x4bf7c0); ADJUST_CITY_TOURISM 0x6ac690
  (0x18ddf0, 0x18e0e0).
- EFFECT_ADJUST_BUILDING_PRODUCTION 0x6c1a80 (@f03c18, vtable 0xd638e0; parser
  0x6c1760: +8, +0xc, +0x10; +0x18 / +0x1c / +0x20 from +0x220 / +0x210 / +0x218,
  +0x14 (+0x159 bit 16), +0x15 MaxWorldInstances (+0x40, 0x1e7b70)): a lacking
  building (0x18e9f0; 0x1aec20; 0x5d17b0 unread, none): R = max(0x621920,
  0x7610e0), T0 / T1 = 0x17b1e0 without / with; v = (T0 − T1) × Cost (+0x24) /
  max(1, T0 T1), bare Production over [start + R, start + R + T1]; a district:
  0x17b5a0 (cost 0x4088a0) multiplies Production by the Amount (0x16eb20 at
  0x17b807) — Veterancy below 0, never logged; 0x5d4650's result unread
  (`researchTurns`, `cityItemTurns`, `districtCost`, `buildingsBuilt`,
  `_pol_building_production`).
- Discipline's EFFECT_ADJUST_UNIT_BARBARIAN_COMBAT 0x6bef40 (@f03c08, vtable
  0xd63760; parser 0x6bedb0: fx(expf(Amount × 0.04 gp +0x210)) = 1.2214 → 17 a
  unit): over COLLECTION_PLAYER_UNITS (+0x90) fighting units on a plot (0x90290,
  0x209dd0): the knowledge base (+0x12b8, 0x786160) over the barbarians
  (0x483b50 +0x29f0) by 0x5eb0f0(kb, player, area, no region, 10) — records of
  the area (+0x18) or region (+0x1c; 0x5ef870), age ≤ 10, max(Combat, Ranged) —
  greater than its own: + Amount between (`knownStrength`, `_pol_barbarian_combat`).
- Agoge's EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION 0x6bc9e0: the best of the class
  (0x4bcd30: own version +0x12e8 +0x1c0, not MustPurchase, +0x288, +0x280 / +0x270
  held), its era (0x940740) ≥ EraType; Combat / max(1, +0xf0) × Production
  (0x6c8dd0) / max(1, Cost +0x4c) × Amount / 100 (0x51eb851f) as UNIT_COMBAT
  (`unitEraIndex`, `bestUnitOfClass`, `_pol_best_of_class`).
- Ilkum's EFFECT_ADJUST_UNIT_PRODUCTION 0x6b2350 (@f040d0, vtable 0xd63100;
  parser 0x6b1d00): per city Amount × (Production +0x1008 × the expected count
  0x5d4750) over the train turns 0x17bb40 (0x1cb9f0, 0x17c1c0, cost 0x17bfa0,
  progress +0x230); 0x5d4750: 1.0 with progress (0x17d1a0), 0 if CanTrain
  (0x172820) refuses, else 0.2 × the listed contracts' +0x160 (+0x3a8 → +0x400,
  +0x408) + 0.5 (@d5aff0, @d20458); 0x5ff390 writes +0x160 0 (LAB: read as 1;
  runs/h1_duelw1117 Valletta t16-24) (`cityUnitTurns`, `cityUnitExpected`,
  `minorUnitTurns`, `minorUnitExpected`, `majorItemTurns`, `majorUnitExpected`,
  `_cv_unit_prod_value`).
- Bastions: EFFECT_ADJUST_CITY_OUTER_DEFENSE 0x6c4650 (@f03cf0, vtable 0xd63a18):
  outer damage (0x24ae50 / 0x6da56a3d, +0x8d8) below max (0x24b290 → +0x1880,
  0x198310) + Amount; EFFECT_ADJUST_CITY_RANGED_STRIKE 0x6a69c0 (@f03d20, vtable
  0xd62ad0): 0x249ee0 × Amount / 100. 0x198310: the Free Cities (0x469d40,
  0x4e6b0a0) a table row (0x276310 / 0x276370, +0x1c); else +0x12f0 +0xf4 > 0,
  else Σ OuterDefenseHitPoints (+0x58 / +0x54); + City +0x14 (every Bastions line
  first at the walls' completion; `cityOuterStands`, `cityStrike`). Open:
  +0x12f0 +0xf4's writer (C-130).
- The policy Amenity and Housing: EFFECT_ADJUST_POLICY_AMENITY 0x6b45a0 →
  0x79f7c0(player +0x80, city, Amount +8, rate +0xbc, start +0xb4, horizon +0xb8);
  EFFECT_ADJUST_POLICY_HOUSING 0x6b5eb0 → 0x7a3d70 (one Housing, `setg`).
  0x79f7c0: the balance (0x5275a0) and its level (0x527850) before and after;
  one level: HAPPINESS of n; else the levels' difference + per non-Food yield
  (@f2f974) the base yield (+0x1028 → +0x1080, 0x5cc510 from 0x1c64d0) ×
  ((after + 100) / (before + 100) − 1) (0x527b40: NonFoodYieldModifier +0x3c /
  +0x38, loader 0xac62c0, + the city's +0x11d8 via 0x1cb0f0), at least n; −gp
  +0x6b4 × balance (0 in GS). The base: 0xaa740 with the clamps (+0x30 / +0x38)
  set to [0, 0] into +0x1028, beside +0xfb0 (runs/h1_duely1127 Hattusa t77
  Retainers 82) (`amenityPerTurn`, `amenityCityOf`, `CityStats.baseYields`,
  `_seat_city_base`). Open: the level-changing cities' Food term (1121 Hunza t45;
  C-130).
- The registry (`reg.py` over 0x6c9640): 211 effects, 27 collections, 66
  requirements; CityBuildAI reach 0xa5c20.

THE EVALUATOR: a building's modifiers analysed once at GlobalAI's start
(0x6dfc70 → 0x6cef90 into +0x3948[b]): analyzer and collection by hash in
0x6c9640 (EFFECT_ADJUST_CITY_YIELD_CHANGE object 0xf03d80, vtable 0xd63400).
0x6cede0 runs ≤ 51 subjects (0x6cf3c0 → slot 1, else slot 2; depth 4). The
context 0x6ccd50 (filled in 0x7a7590): T +0xb4, H +0xb8, rate +0xbc, city,
player; 0x7a4b20 adds the whole sum (+0xc0, ± 0x7fffff), × DefaultValue with a
yield (+0x64). A type the registry lacks adds nothing
(EFFECT_ADJUST_CITY_IDENTITY_PER_TURN). EFFECT_ADJUST_CITY_YIELD_CHANGE 0x6b8ba0:
trunc(PV(H) − PV(T)) of yieldValue (0x7a2140; 0x7a1240). Unread: the other
analyzers (EFFECT_ADJUST_CITY_YIELD_MODIFIER 0xd63490 ...), the Monument's
COLLECTION_OWNER subject (C-96). The GPU twin pins 46 rows
(tests/gpu/city_value_test.py, tests/cpu/minors/modifier-value.test.ts,
tests/cpu/minors/minor-tables.test.ts).

## C-97: the government and policy choice — the choice READ, the values PARTLY READ

The policy AI (0x620110's object; AI_GovtPolicies.csv). Check:
`dll_govtpolicies.py`. Ported for the city-states (`cpu/core/aiPolicyValue.ts`,
`gpu/core/sim_policy.py`); the majors' choice is the recording's or the RL seat's.

- The lists: civics +0x978 (0x50: +0x14 score, +0x18 turns); policies +0x9e8 in
  DATABASE order (0x624060: +0x28 policy, +0x2c slot type, +0x30 / +0x31
  RequiresDarkAge / GoldenAge, +0x34 / +0x38 era bounds, +0x48 score); 0x6255f0
  logs every score above 0 (515,913 lines in row order).
- The policy job 0x621eb0: −1.0; a non-Dark-Age card needs its PrereqCivic held
  (0x39d1f0) or scored above 0 on the civic list (the analysis's own value:
  runs/h1_duelw1121 Charismatic Leader); an age card its age (0x412880 /
  0x412910); the era (+0x158 → Eras +0x1c) in its window; then 0x7b26b0(policy,
  0x6fec30 = GlobalAI +0x290, 0, horizon[0] via 0x5d2bc0, player, +0xb80[policy]).
- 0x7b26b0: FX_MIN at start ≥ horizon or obsolete (0x39e050: an unlocked
  ObsoletePolicy 0x39e1e0, or a RequiresAvailableGreatPersonClass the player
  cannot earn 0x2f1ed0 — CanEarnGreatPeople 0x43a980 lacking for the minors);
  250.0 for an age card in its age; + 0x7a4b20.
- 0x7a4b20: per modifier (0x40 bytes: analyzer, collection, set +0x10, args
  +0x38) 0x6cede0 into a context copy (0x142650: +0xb4 start, +0xb8 horizon,
  +0xbc rate, +0x70 city, +0x80 player, +0x90 unit, +0xc0 value); a yield context
  (+0x64) × DefaultValue, else min(value, 0x7fffff) << 8. 0x6cede0: a fourth
  nesting refused; ≤ 51 subjects (vt [0], +8); a subject passes when its set is
  absent from GlobalAI +0x4d0 or 0x6cf3c0 admits it; vt +8 per subject, vt
  +0x10 for none. 0x6c9640 registers 238 effects: the policies name 65
  registered (396 modifiers) and 26 not (75, worth 0). Read:
  EFFECT_ADJUST_CITY_YIELD_CHANGE 0x6b8ba0; _MODIFIER 0x6b9d90 (min(0x1cb8b0,
  100) × pct × 0.01); EFFECT_ADJUST_PLAYER_YIELD_CHANGE 0x6a7d70 (unweighted);
  EFFECT_ADJUST_GREAT_PERSON_POINTS 0x6a0b10 (PV(horizon)); _INFLUENCE_POINTS_PER_TURN
  0x6ae510; _DUPLICATE_FIRST_INFLUENCE_TOKEN 0x6afcd0 (0x449940, +0x28 bit 6; Game
  +0x3f8 +0x1650 count × +0x270, 0x7a1240; +0x270 the threshold at the speed,
  0x44eaa0). The rest: "C-96 / C-97: the AI's yield weights and the modifier
  evaluator" (0x6bef40, 0x6bc9e0, 0x4bcd30, 0x6c8dd0, 0x6b45a0, 0x6b5eb0,
  0x79f7c0, 0x7a3d70, 0x6b5b30, 0x5eb0f0).
- The weights: 0x7a6690 (0x702ad0), 0x7a60d0 (0x700810: +0x7e8 by 0x6fff90's
  handlers; q = 0x655840, +0x2f58[player] +0x14 for DIPLOMATIC_BONUS; @0xd136f4,
  @0xd2f320; 0x2c4230).
- THE CHOICE 0x625d70 (from 0x6293e0 with the civic, or 0x620110 with −1 when
  +0x758): no card ≥ 0 requests the next turn (+0x700 → +0x758). The government:
  every one 0x392cb0 admits (0x39df60, not current) and the current, valued by
  0x7b0330 to horizon[0], the first strictly highest, commanded (0x44bb0 type 1;
  "C-94: the slot rebuild"). Each slot (0x399690, 0x399ab0): the bar its card's
  score; a policy above it that CanSlot (0x393400: +0x890, +0x820, 0x3930a0 —
  Policy_GovernmentExclusives_XP2 —, the type or AllowsAnyPolicy) admits raises
  it; the best commanded (type 0), "Slot Policy" logged.
- Best per slot type (0x620110, +0x5b8 / +0x610): the first strictly highest.
- 0x7b0330: FX_MIN at start ≥ horizon or for a past government (+0x350, 0x399260)
  not current; per Government_SlotCounts row the type's best / 10 (×
  0x6666666666666667 >> 74) / the slot's place; + Favor as DIPLOMATIC_FAVOR; +
  the modifiers (+0xb68) via 0x7a4b20. No government returned to (142 changes).
- The horizon[0] (0x6dd9a0 → 0x5254d0 → 0x525400, +0x28): 25 online at rate 4.0.
  Confirmed: Diplomatic League 75 / 112 / 150 / 187 = 3 × the token × 0.5; the
  city-states' 11,038 / 11,038 lines.
- MEASURED (`dll_govtpolicies.py`): 1,170 / 1,284 completed civics, 6,589 / 6,734
  slot lines. Open (C-130): the agendas' path, 0x700810's +0x7e8 / +0x620
  writers, the civic jobs 0x61ee30, 0x3930a0, 0x2f1ed0 (Strategos).

## C-97: the majors' opinion — the agendas and the first impression READ, the modifiers PARTLY READ

The opinion is the diplomatic modifiers' sum (24.8): AI_Diplomacy.csv (0x652bb0:
"opinion:state" from +0x330 / +0x2f58; threat:n:trust from +0x6560 / 0x650550 /
+0x6480). `cpu/core/agendas.ts` (the replay's import of the majors' agendas).

- The set-up draws ("Random Diplomatic Value", 0x3ffdd0): every slot in use, in
  order, one value over 100 toward each of 64 slots, twice; the second kept
  (+0x7bc[slot]); 896 draws a duel.
- The first impression (MODIFIER_PLAYER_DIPLOMACY_RANDOM, init 0xb8edb0: R 3):
  floor(v × 7 / 100) − 3 at the meeting, −1 per 10 of the owner's starts from
  its first after the meeting (runs/h1_duelw1110 Qin 45 → 54; Rome 46 → 55);
  every requirement-driven ReductionTurns modifier alike.
- The agendas (Game_Initializer 0x31d3c0; the civic's 0x31f7f0 / 0x427bf0):
  HistoricalAgendas, RandomAgendasInEra at set-up, RandomAgendasForCivic at
  Nationalism; the pool by tag (EARLY then ANY / LATE then ANY), Agendas order;
  one "Choose random agenda", an exclusive one redrawn; the 63 draws of the 29
  duels agree. Open: the civic pool's GameLimit (runs/h1_duelw1112, 1121; C-2).
- Optimus Princeps (compute 0xb4d2b0, args 0xb50250): plots (0x4be720) beyond 20%
  ± 5; the rank among FULL_CIVs (0x469db0) ± 8 (1114 Trajan −8 / 0 / +5).
- TRADE_RELATIONS (0xbb1a20, args 0xbb40f0): +2 a route either way.
- The Delegation's +3 ends at the Resident Embassy's +5 (runs/h1_duelw1110 t99).
- Requirements: PLAYER_YIELD_LEAD 0xb6ff10 (MinimumDelta; the ratio to 1/256);
  COMPETING_MINORS 0xb61120; NOT_COMPETING_MINORS 0xb32500;
  MILITARY_STRENGTH_LEAD 0xb548f0 (0x4bd0d0: LAND +0x2d0, SEA +0x330, AIR +0x270;
  runs/h1_duelw1104 Trajan −6 at 106); NEW_WARMONGER 0xb7eee0 (args 0xb81dd0;
  0x3d8d20: −20% of grievances, ≥ −60); SETTLED_CITIES 0xb96bf0 (args 0xb986e0;
  0x3d8da0 kind 0xfadf5055); FORCE_INCURSION 0xc00500 (+0x1280 +0x40 / +0x48,
  +0x12a0 +0x588).
- The diplomatic state: the Require bounds force, the Allow band is the AI's.
- THE VERBOSE LOG (runs/h1_duelv1124): per action "desire:cost" (0x676510: +0x48,
  +0x68; Alliance +0x18, War +0x1c, Penalty +0x20). A recorded mission's turn is
  the receiver's acceptance (runs/h1_duelv1117 / 1121 / 1127 / 1128 attempts).
- Open (C-2): FORCE_INCURSION's counts, NEAR_CULTURE_BORDER, SETTLED_CITIES'
  ledger, the other agendas' effects, the event triggers, threat.

## C-97: the settle site evaluation — READ (the score, the choices), PARTLY READ (the danger, the plot yield)

AI::GrandStrategic (+0x1290) and SiteEvaluator; AI_SiteEval.csv on
runs/h1_duelv1124 (`h1_duelv1124_20261010T215402Z`). `firstTurnSettlerOrders`
(the replay's settle probe).

- The lists (0x6d6c80, "PlotEvaluations", handler 0x6dd310): AiFavoredItems of
  the leader chain's, civilization's, agenda's and followed strategies' lists;
  one entry per PlotEvalConditions row; Favored adds to the threshold, else the
  value; keyed rows to a weight (0x76cee0). A natural wonder row adds to ITS OWN
  feature per natural wonder ([r15+0x14]): FEATURE_DEAD_SEA × 6, others none.
- The evaluation 0x6fd1d0 (ring 0x6f93a0 within 5, 0x6b000): invalid unrevealed
  or unfoundable (0x1eaa30: impassable +0x3a, Settlement +0xc2 bit 2, a
  district, another's, a city within 3 — Rules_Cities 0x515910), or near a
  promise (0xfadf5055). Then continent (+0x30), coastal (0x82a10), fresh water
  (0x82c20), the nearest own city, the danger (0x716a90), pressure (0x19d470 >>
  8); per revealed ring plot not another's: yields (0x82280 → 0x538a60) within 3,
  inner at 1; features within 2; seen resources (0x4ab4b0); at 1 an unheld
  (0x4aa790) non-bonus (0xadd080) one is new.
- The score 0x702380: per entry the table 0xf2e740's evaluator (0x6f3420 ..
  0x6f37b0, 0x6f9630..0x6fa060): gates (−9999, skipped for a human 0x469d70) or
  counts × value; less the danger; clamped at 0.
- The regions (0x6fafc0, "Settle City Evaluation" jobs): each region scored in
  plot order (0x6fd510), stable merge sort (0x6f5fb0); the best top (0x6fe2b0) the
  Settle New City target (0x747230); Change Target the next.
- The first turn settler 0x70d250: the reach's turn-1 plot whose list scores best
  (0x6fec50), first on a tie; else found in place; else "First Turn Settler
  Fallback".
- The danger: "C-95: the danger map and Move to Safety" (0x717460; 0x56dc90,
  0x56e3e0, 0x56daa0, 0x716400, 0x7921e0 → 0x26df90, 0x56e3d0, 0x6b0a0 → 0x691f0,
  0x24ae80, 0x249ee0, 0x249e40, 0x715ff0, 0x716080).
- MEASURED: runs/h1_duelv1124 84,606 / 90,387 plot scores; the targets 85 / 99.
  Open (C-2): the backup's rule; ownership type 0's resources.

## C-97: the victory manager's strategies — READ (the evaluation, the apply, the conditions below), PARTLY READ (three conditions, the island's count)

AI/VictoryStrategy.cpp, GrandStrategic +0x508; AI_Victories.csv (0x7bec80). The
majors' strategies feed only their unported AI; the minors' era strategies
are none ("Is Not Major").

- Arrays per strategy (AI_STRATEGIES order): +0x30 following, +0x48 disqualified,
  +0x60 changes, +0x78 exclusive, +0x90 next change turn, +0xa8 bias (the
  leader's (0x622e90) and civilization's Strategies AiLists within the handicap).
- The evaluation 0x7bc580 (vtable 0xd71c30 slot 1): a disabled victory or
  ConditionsNeeded + bias over its conditions disqualifies; each condition via
  the registry 0x7bd310: Exclusive marks, Disqualifier disqualifies and stops,
  Forbidden holds it this turn, others count; past +0x90, count ≥ need starts,
  below stops.
- The apply 0x7bb3e0: an exclusive victory strategy stops the others; each change
  flips and stamps +0x90 = turn + 20 (0x7bf160 on, 0x7bb870 off).
- Conditions: Is <Era> 0x7bea40; Good Faith / Tech / Culture City 0x7bcd60
  (0x5d83c0); Major Civ Wars 0x3dfae0; Is On Island (+0x4a0); Has Agenda (+0xe20);
  Unconverted Cities 0x7bff10; Cannot Found Religion 0x7bada0 (0x2f7eb0,
  0x2f30c0); Religion Destroyed 0x7bf080; Good Culture 0x7bce30; Tourists Taken
  (+0x10b0, 0x39bee0); Has Taken Capital 0x7bd1c0; Leads / Lags Military 0x7baa20
  / 0x7babc0; Next Lower Score 0x7bebc0; Has Tech Lead 0x7bd210; Is Not Major
  (0x469db0; 0x469ce0 the tribe test). Lists +0xb50, +0x50, +0xfa0.
- m_iMilitaryStrength (+0x210, 0x4bb1e0 at each turn start before production):
  Σ max(Combat, Ranged) × HP share + trunc((gold × 256 / 6) / 512), >> 8
  (runs/h1_duelw1124 t6).
- The island (0x6fafc0; AI_ISLAND_COAST_PERCENTAGE 20): +0x440 / +0x4a0; the
  landmass share via 0x786080 (+0x2e8's +0x28 / +0x24, refreshed by 0x783980)
  above 0.5 (0xd20458).
- MEASURED: 120 / 163 lines on the record's state. Open (C-2): the island's count,
  Has Settle Spot (0x6fe2b0), Cities Under Threat, +0x9d0.

## C-97: the AI's knowledge of the map's cities — READ (the record, the update, the statistics, the advantage), PARTLY READ (the city AI's stored yields)

AI::Knowledge (+0x12b8); AI_Knowledge.csv.

- The defaults (GlobalAI 0x6df230): per yield the mean and deviation of every
  non-barbarian start plot and its ring; +0x1d0 the count.
- The record 0x5ef9a0: per known city its yields, majority religion, age. The
  update 0x5ebb30 ages them, drops a seen cityless one; mean Σ trunc(y × 256 /
  n), variance Σ trunc(d² / (n − 1)).
- The advantage 0x5d83c0 (flag 0): x = max(CityBuildAI +0x1118, the city's
  yield); (x − mean) × 256 / deviation, the knowledge base's at +0x1d0 entries
  or more, else the defaults' × 6 and × fx(2.449); flag 1 takes 37 and √37.
  Open: +0x1118 (C-96).

## C-97: the majors' meeting — READ (the triggers, the effects), PARTLY READ (the shared sight)

The meet 0x484ab0 from the visibility manager: a unit placed where another sees
(0x5246f0 from 0x586d40), a plot (0x524890) or unit (0x5249c0) coming into view.
A city-state's sight is its suzerain's (runs/h1_duelw1124 t89). The effects:
BOOST_TRIGGER_MEET_CIV (runs/h1_duelw1114 t15), PLAYER_MET_ALL_MAJORS (1121 t127).
Delegation and Resident Embassy are two missions (`MISSION_DELEGATION`,
`MISSION_EMBASSY`). `meetMajors`, `majorLookMeets`, `seatSeesPlot`
(cpu/core/fog.ts); `_meet_majors`, `_major_look_meets`, `_eyes_of`,
`_suzerain_look` (gpu/core/sim_masks.py). Confirmed: the five verbose recordings'
Met lines. Open: a new suzerain's view, an envoy's reveal (C-38).

## C-97: the behaviour trees — READ (the interpreter), the nodes PARTLY READ

BehaviorTree.cpp: `cpu/core/behaviorTree.ts` (interpreter), `nodes.ts`; the
tables by `tools/install/ai_operation_tables.py` (against DebugGameplay.sqlite).

- Statuses FRESH 0, SUCCESS 1, RUNNING 2, FAILURE 3, ERROR 4, SKIPPED 5; shapes 0
  selector, 1 action, 2 decision, 3 decorator; handler tables: selector update
  @f2ed50, parent function @f2ed70, decorator update @f2ed90, leaf @f2edb0,
  decision @f2edd0, execution @f2edf0, next node @f2ee10.
- The tick 0x7d3a00 (root FRESH or SKIPPED): each node updated (0x7d3d30; a
  SKIPPED parent skips it), the next node the larger of its own (Sequence
  0x7f3e70: max(resume, i + 1)) and the parent propagation's (0x7d1750 via
  @f2ed70); with the root finished every SUCCESS / RUNNING node executes in order
  (0x7cb3d0); a root RUNNING or FRESH resets for next turn, else done.
- Parents: Priority 0x7f2390, Sequence 0x7f3e80, Concurrent 0x7eb0f0 (update
  0x7eb210), Not 0x7f15f0 (update 0x6a7bd0; @f2eef4), pass-through 0x7f15a0, Turn
  Limiter 0x7f1620 (update 0x7f21c0, 0x5254d0), Contract Manager 0x7f1500 (update
  0x7f17a0, check 0x7f2220).
- Leaves: Decode Trigger 0x7f2970; Change Target 0x8196d0 (0x723ab0 gates); Find
  Available Unit 0x7ec7b0; Build Unit 0x7f4e00; Recruit Units 0x81c820 (0x60a8c0 →
  0x738050); Lock Units 0x7f5240; Make Formation 0x7efd70 / 0x7ee630 (0x73b6c0 →
  0x73b8a0); Operation Move 0x81a130 / 0x816cb0 (radius as "C-95: the barbarians'
  raid"; Leader Tag 0x79cb30; 0x585eb0 → 0x585d90; 0x6aef0 in 0x69010's order;
  0x815d50); Settle 0x7f0b30 / 0x7ef530; Is Ready 0x81a090; Operation Attack
  0x80ec10 (0x73a8e0); Attack Units 0x80ecf0; Naval Patrol / Pillage 0x803880;
  Defend Units 0x80ee70.
- NAVAL CHOOSE TARGET 0x803590 (list 0x802ea0): the target list (+0x12b8 +0x368,
  0x28 bytes) CIVILIAN..HIGH entries on water for domain 0 (0xadd590, +0x20), the
  nearest the operation's target (+0x2a8 / +0x2ac) → 0x73e7d0, the cursor to the
  first child; none: to the end (+0x10 ← +4), FAILURE with Fail for no target
  (runs/h1_duelv1121 city-state 3's Galley t54) (`navalChooseTarget`,
  `_u_naval_choose`).
- NAVAL PILLAGE 0x803250: live units with Movement (0x56c690) and a planning
  (+0x1fc0): its first COMBAT_DISTRICT target (+0x48, 0xd0 entries, +0x18 > 0), else
  a ranged one's first LOW..HIGH (0x56e3d0); those entries (0x790450, 0x802cf0)
  through 0x776140 (survival filter) and 0x771f80 (`passNavalPillage`,
  `_x_naval_pillage`).
- NAVAL PATROL 0x803060: each job unit (0x6092c0 by +0x488) live with Movement
  (+0xdb0): HL Explore's target (0x70aa40), turn done (0x570b40), a move there
  (0x962030) (runs/h1_duelv1121 city-state 3's Galley t34; `passPatrol`,
  `_x_naval_patrol`).
- Open (C-99): Naval Escort 0x817f60; Operation Move's tactical block (0x791300).

## C-97: the operations — the manager and its candidates READ, the staging list and City Defense's start unread

`cpu/core/operations/` (manager.ts, evaluate.ts, recruit.ts, operation.ts);
OperationsProbe against AI_Operation.csv / AI_Operation_Eval.csv.

- The manager (0x722690 → 0x727510). Candidates (0x722d70, 0x70 bytes at +0x328):
  each running operation (0x747f30 + 0x747fa0: rally +0x40, strength +0x48 =
  teams' +0x4b0, id +0x4c); per other player a WAR definition at war (0x469cd0 =
  0x3dcec0) or flagged (+0xc58, +0xd18), an ALLY one where allied (0x3da560,
  0x3de4e0); each allowed NONE-enemy definition (ActiveEmergency +0x18). Allowed:
  Leaders.OperationList, else Default_List.
- The evaluation ("Op Evaluation" 0x746920): MustBeAtWar, MustHaveNukes,
  MustHaveUnits (+0x12e8 +0xc0); each target (0x747230) × staging plot (+0x12b8
  +0xb58; a running one's rally): distance 0 only for FRIENDLY_CITY; the region
  (+0x18) / area (+8) limits; ours the fixed strength or 0x5eadb0 within 10
  (damage × WOUNDED_MULTIPLIER × −0.01; kinds 1 / 2 gp +0x198 / +0x17c and 0x4f2b50
  unread); odds = min(0.9, ((ours − theirs) / min(bests) + 1) × 0.5) × 0.97 ^
  (max(0, theirs − ours) − trunc(d × −0.75)) (bests 0x4d9320); MinOddsOfSuccess;
  the best value × odds (0x16e7d0), the later of equals.
- The targets 0x747230: SETTLE the best region top (0x6fe2b0); NAVAL_SUPERIORITY
  the most populous coastal city (0x1c77c0, +0x588) with open sea within 4
  (@d6e100: 0x834d0, 0x82e80), 100; BARBARIAN_CAMP each known camp (+0x638) 50 ×
  camps, strength 6 (@d26898) + the army within 3 for a non-barbarian with no
  enemy (0x7476f9..0x747745); FRIENDLY_CITY own cities (+0x1b8 > −1 with a
  parameter), 0x5eb2c0 × 1.5 per 0x5eb600 (unread); COMBAT / PASSIVE_DISTRICT the
  city value 0x79fef0.
- The pick: a running operation's backup (0x73e610); of new ones the highest
  Priority (+0x40), then odds (+0x54), under base + perWar × wars per type. The
  running lines, strengths (0x73eb60, 0x73f7d0), teams (0x73b360), then the start
  (0x726470 → 0x73a120).
- AI_EVENT_DESIRE_SETTLE (0x800c60 → 0x7265b0): the named definition's candidate
  (0x747fa0 vt +8, 0x73e610, 0x73e870).
- The pool (+0x2e0, 0x71e370): the slot freed last, else new; slot order (1124
  t26-27).
- Confirmed: 1124 t3-t15 every eval line; Attack Barb Camp t32 at 6:3. Open (C-99):
  the ALLY gate, City Defense's start ("Defense %s"), the known camps' order.

## C-97: the war operations — the war candidates, the city value's frame, the assault nodes and Attack Units READ; the loyalty lead's sources, the team update's danger and the assault's executions PARTLY READ

`cpu/core/operations/` (cityValue.ts, evaluate.ts's district walk, manager.ts's
war candidates, knowledge.ts, assault.ts); OperationsProbe on runs/h1_duelv1117 /
1121 / 1124 / 1127 / 1128.

- THE WAR GATE (0x722d70 over +0x4a0): at war (0x469cd0) or flagged
  m_prepareForWarWith (+0xbb0, data +0xc08 +0x50 = +0xc58) or +0xd18: the "WAR"
  definitions (+0x178, 0x80 each); allied (0x3da560 / 0x3de4e0): "ALLY".
  PrepareForWarWith (0x724f30; Lua 0x9bbaa0) is set by the declarations'
  not-ready hook (slot +0x68 = 0x6742d0 from 0x64ba90 via 0x6744a0 / 0x674420),
  cleared by 0x650890 (1117 China → 3: desire t18, eval t20).
- THE DISTRICT WALK (0x747230): each known enemy city; TargetParameter 0 skips one
  whose defences outnumber its districts (0x5eb600: +0x14, +0x18 against +0x58);
  active targets skipped (0x724dd0: +0x318, 0x73a840); listed by a city's trade AI
  (+0x870, 0x78e010); MustHaveNukes (+0x7a: 0x2d1f20 / 0x2d2090); value 0x79fef0;
  the enemy within 3 (0x5eadb0) where the best combat passes by 30; above
  MaxTargetDefense skipped. Fields +0x60..+0x7c (distances, strength, defence,
  odds, SelfStart, MustBeAtWar, MustHaveNukes, MustHaveUnits).
- THE CITY'S WORTH 0x7a0ac0: CITY_POPULATION floor(pop / 5), CITY_BASE 1,
  ORIGINAL_CAPITAL 1 (+0x14) / 0.5 (+0x15), WONDER 40 each (0x5eb680), 7 × the
  Production, Science, Culture (+0x30; 0x34460 orders @f2f974 .. @f2f984); the
  loyalty lead (0x19d470): ≤ −20 (gp +0x474) → 0, else + 10 a point to 5, and
  below −5 more; great works (0x623b30 over +0x7b8, unread), resources (0x7a21e0).
- THE LOYALTY LEAD 0x19d470: per player 0x19cd80 (for P alone 0x1a1050 and gp
  +0x40c / +0x408 for a Free City / city-state (0x469d40 / 0x469de0); per p
  CAPITAL 0x1a0140 and its cities' terms 0x1a08d0 / 0x1a0ae0 / 0x1a0cc0 over
  0x19b5f0 / 0x19bbb0 / 0x19b820, where +0x728); then 0x1a1ae0's raw difference.
- THE CITY VALUE 0x79fef0: W; the fifth argument max(W, 0). Else A / B the land
  strengths (0x4bd0d0 domain 2, +0x2d0), C / D the best melee (+0xf0, 0x4d9320;
  the import raises it as 0x4580b0), N P's nearest city, G the defence (0x5eb2c0),
  H the enemy's known units within 3 (0x5eadb0) and districts' strikes (+0x1c); T
  = H + D (+ a distance term at 0x5254d0); less CITY_DEFENSES of G / C, per nearer
  enemy city 2 × its defence / C (× 2 within 5), × 0.25 (@d2f324) when weak, less
  CITY_DEFENDING_UNITS of T / C; + the war record (kb +0x668 +0xc); ≥ 0.
- THE KNOWN CITY RECORD (0x5efaf0, 0xe0; CITY lines 0x5ed0b0): +0x8 / +0xc plot,
  +0x1c pop, +0x14 / +0x15, +0x30 yields, +0x48 defensible districts (0x5e97d629
  > 0: +0x14 defence, +0x18 while 0x6da56a3d holds, +0x1c strike 0x249ee0), +0x58
  count, +0xa8 works, +0xc0 resources (1117 t18 Caguana).
- CITY VALUES (0x7277d0): logged after the evals; the evaluation reads the turn
  before's (the look 0x7877e0).
- THE NODES: IS AT WAR 0x7edde0 (0x484a10); CAN ALPHA CITY 0x812cc0 (0x793210
  +0x64 under 0x791470 against half the centre's HP); OPERATION DIPLOMACY 0x819db0
  (0x3da8e0 +0x9d0; execution 0x8163f0: DENOUNCE @f2e584, DECLARE_SURPRISE_WAR
  @f2e5a8, op +0x5d8, the contract via +0x12d0 0x60bb50, type 4 at +0x368); ATTACK
  CITY 0x813250 (+0xe2); AIR ASSAULT 0x813140; PILLAGE 0x8134a0; SIEGE CITY
  0x8136a0; BUILD MILITARY IMPROVEMENT 0x7e9b10 (+0xed0, +0x160, +0x108 & 0x40,
  +0x34, 0x35ede0). Names 0x7db850 (@f2eeb0..), handlers 0x7cbca0.
- THE TEAM UPDATE (0x738f20 from 0x73f7d0; goals +0xe8 + 8 × slot): per target
  (kb +0x370) within 2 × base Movement (0x56d9f0): +0x98 attack, the damage
  (0x51a240 / 0x519370 under 0x716a60), +0xb8 list, +0x94 enemy, +0xa0
  endangered; slot 3 (+0x100) the centre; slot 5 (+0x110) the march point (axial
  steps back toward the rally, 0x38070, the first enterable plot — 0x3dab70,
  diplomacy +0x6c0); slot 4 (+0x108) the battle line, engaged (+0x90).
- ATTACK UNITS 0x80ceb0: members in no formation (+0x1fb8 +0x738 1); targets
  (+0x368, 0x80b9b0) by the node's data: Nearby (0x80bd20 / 0x80c080), Along
  March (0x80be90), Near Target (0x80bb50; 0x249e40), all (0x80b830); 0x776140,
  0x771f80. ATTACK CITY 0x8109e0: the COMBAT_DISTRICTs within 3 (0x80f280).
- MEASURED: CITY VALUES within 0.1 27 / 502 .. 176 / 528. Open (C-99): +0xd18,
  +0x2d0's writer, the loyalty sources, +0x7b8, the war record's writer.

## C-97: the war desires, the war operation's readiness and the assault's executions — the war value, the not-ready hook, the readiness and the executions READ; the leader's war factor, the WMD flags, the deal items and the war record's writer unread

`cpu/core/operations/manager.ts` (the hook, the readiness 0x723db0),
`cpu/core/operations/assault.ts`, `cpu/core/aiAssignment.ts`, `cpu/core/aiContracts.ts`,
`cpu/core/tactical.ts`; DiplomaticSender and OperationsProbe.

- THE CHAIN: the pick 0x64ba90 per action with desire > 0: CanDoAction (0x3dd9a0);
  0x672ef0 (+0x6390 0x650460, the can-do 0x672e40) false → the +0x68 hook via
  0x6744a0 — 0x6742d0: the majors of +0xfa0 fought or prepared (0x672bb0) ≤ half
  +0xb50, not a friend (0x3da770) nor ally (0x3da560): PrepareForWarWith (0x724f30).
  Skips this turn's entries (+0x1a). Cleared in 0x650890 (+0x138 < 4); set by
  OnDenouncePlayer (0x681c10). The diplomacy runs before the operations.
- THE WAR VALUE 0x7b7760 = spoils 0x7b7ab0 + balance 0x7b7830 + 0x7b87b0 (casus
  belli). Spoils: the best captured civilian's cost; known cities (0x79fef0) × (1
  + 0.02 × +0x204) ascending, Σ v_i / rank; × 0.5 / 0.8 / 0.75 / 0.9 / 1.25 / 1.1 by
  the wars; the war record (+0x668 +0xc); WMDs (+0x11f0 0x4bf200, +0xf30) −10000.
  Balance: S, T (+0x210), R (mil +0x588 from 0x71fb80): −R where T / 4 > R, else
  −min(S, T) where T + 30 > S; + (S − T) × (2 or 1); + deals (0x64d320).
- THE CITY-STATE WAR'S DESIRE 0x66d9d0: the war value; ≤ 1 envoy less the envoys'
  worth (0x7a46c0) and 800 / 200 for its suzerain's ally / friend; more envoys 0
  unless out-envoyed by 2.
- THE READINESS 0x723db0(p, needReady, dist, slot): the first operation against
  p (+0x318, 0x73a840): ready (0x73aa60: +0x5d0, or 0x73ab20) or buildable
  (+0x630 of +0x5d8); slot −1 yes; else a member (+0x230, 0x118; +0x18) within
  dist of the goal (+0xe8 + 8 × slot). The war can-do 0x673800 asks (p, 1, 2, 5).
- THE CONTRACTS: Build Unit 0x7f4e00, Contract Manager 0x7f17a0; the economic
  listener 0x68ab40 (connected 0x6892d0) takes Gold-purchasable ones (vt +0x80
  0x5f6830) (runs/h1_duelv1128 China's Settle New City t2-t13); turns 0x17bb40.
- THE EXECUTIONS: ATTACK 0x80c180 (the spot 0x791300; "Attack Target Move",
  "... Direct", "... Range Attack" (+0x4c), "... Melee Attack"); ATTACK CITY
  0x8109e0 (0x80f280, 0x776140 type 3); SIEGE CITY 0x811e80 (the six plots
  0x812950, the assignment 0x8b5bf0 three passes: start 0x80f9d0, gain 0x80f6b0
  ([rsp + 0x28]), move 0x80f4a0; encircled 0x24bf70); PILLAGE 0x811390; AIR ASSAULT
  0x80fb50; BUILD MILITARY IMPROVEMENT 0x7e9b10 / 0x7e9120 (+0x108 & 0x40, 0xac6bb0;
  0x95a010).
- THE GENERALIZED ASSIGNMENT 0x8b5bf0 (weight and capacity 1): per pass per slot
  the first largest positive gain takes it, unseating; repeated while one moved.
  The governors' seats (0x6ee100) run it once.
- MEASURED: the Surprise War rows 504 / 682; the first war candidates 3 / 14 on
  the log's turn. Open (C-99): +0x204's writer, +0xf30, the deal items, the war
  record, 0x650890's signal, Siege City's first part, the air contract.

## C-99: the upgrade trees — READ (the trigger, Find Available Unit's upgradeable offer, Find Unit Targets' job, Upgrade Units, the economic AI's upgrade, Move Unit with no Location), ported; the deletion of an excess obsolete unit unported

`upgradeTreesTick` (cpu/core/minorOps.ts, `CityState.upgrading` /
`upgradeTrigger`), `upgradePurchase` (cpu/core/aiEconomic.ts);
`_mops_upgrade_trees`, `_cv_upgrade_purchase`, `_minor_upgrade_unit`
(`mops_upg`, `mops_upg_on`, `mops_upg_trig`).

- THE TRIGGER: MinorCivTriggeredTrees' TRIGGER_TECH_UPGRADE / _CIVIC_UPGRADE →
  "Upgrade Units" at priority 3, no operation; 0x800c60 (+0x388) makes a tree
  (0x7fef20, nodes 0x7faa60) and starts it (0x7cb230) — one per tech or civic.
- THE TREE: Concurrent 0 over Find Available Unit 1 (Upgradeable, tag Upgrades),
  Find Unit Targets 2, Upgrade Units 3, Move Unit 4 (no danger). Handlers (0x7db850,
  0x7cbca0): Find Unit Targets 0x7ed200, Upgrade Units 0x7f0ea0 / 0x7ef850.
- FIND AVAILABLE UNIT 0x7ec7b0 (upgradeable): units whose upgrade passes the
  visible test (0x58fff0, r8 1); the evaluator (0x60a8c0; priority 0x723b90)
  offers free units, then lower-priority operations' (Naval Superiority's at 2,
  never City Defense's at 4), each passing (@d74188) joining (0x737e80).
- FIND UNIT TARGETS 0x7ed200 ("Nearest City Search", job @d741d8, 0x7eba40): the
  nearest city's centre (+0x12f0 +0xd8) → +0x7d8 → +0x830 (0x7eb220); a sea unit
  off coastal land (0x82a10) its Harbor (0xcbecc739, 0x1ae530); an upgrade asking a
  district (Units +0x2c8 +0x14) the city lacks (0x510d30) skipped.
- UPGRADE UNITS: update 0x7f0ea0; execution 0x7ef850 (units by 0x6092c0): the full
  test (0x58fff0 r8 0) → 0x68c940; else the deletion ("C-96: the upgrade trees'
  deletion"; UNITCOMMAND_DELETE 0x73cd1698; 0x591000, 0x4f2c90); failing both
  tests: released (+0x778, 0x570b40).
- THE ECONOMIC AI'S UPGRADE 0x68c940: cost 0x590520 << 8; UNITS (+0x540 slot 1) +
  SLUSH ≥ cost spends UNITS then SLUSH, else the balance (+0x1b8); then
  UNITCOMMAND_UPGRADE (0x9576d0; vt +0x48 / +0x58) (`MINOR_UPGRADE_GOLD`).
- MOVE UNIT with no Location (0x7f0020 from 0x7f067c): RUNNING while a unit
  reaches no target (0x791300) or has no planning (+0x1fc0); the units' turns done
  each tick (0x7d2190); the execution 0x7eeba0 moves each.
- Confirmed: runs/h1_duelw1121 city-state 3's Galley leaves Naval Superiority at
  t89; runs/h1_duelw1128 Hong Kong t144-250 with 0 Gold.

## C-99: Move Unit's no-Location execution, the swap's partner and the move order's first turn — READ, ported; the swap's path tests and 0x56e760 unread

`upgradeMove` (cpu/core/minorOps.ts), `swapUnits` / `moveTo(laterTurns)` /
`pathTo`; `_mops_upgrade_move`, `_tac_carry_out`'s swap, `_tac_move_to(later_turns)`.

- 0x7eeba0 (from 0x7eee6a), units by 0x6092c0 with a target (+0x830 / +0x834) off
  their plot (+0x220 / +0x224): turn done (0x570b40, dl 1); without Allow Danger
  (rbp+0x50) a dangerous target (0x716a60) only where reached this turn with
  Movement (0x791300); then SWAP_UNITS (0x972880) and MOVE_TO (0x962030), flags
  0x100a.
- THE SWAP'S PARTNER (0x972540, vt +0xc0; CanStart 0x9724c0, Start 0x972a50):
  Movement (0x56c690), not moved into a zone (0x56e780), distance 1 (0x1deb0);
  (0x56e760: 0x272a60 flag 4); a same-owner (+0x2e0), same-relation (vt +0xc8 on
  +0x160) unit on the target's layer (0x75c50) with Movement, valid both ways
  (0x2726b0 flag 4); Start moves the unit's formation (flags | 4), then the
  partner's. Ended units read none (`pass.ended`).
- The move order's first turn under 0x1000 (0x2720a0): a target its own stacking
  holds reached in the first turn is no path.
- Confirmed: runs/h1_duely1128 Hong Kong t33-35, Bologna t154 swaps. Open (C-99):
  0x56e760, the swap's path tests.

## C-95: the clear-terrain start Movement — PARTLY READ, ported

`startTileMoves` (cpu/core/units.ts), `_start_tile_mp` (gpu/core/sim_economy.py).
EFFECT_ADJUST_UNIT_CLEAR_TERRAIN_START_MOVEMENT (0xc0a3a0, apply 0xb76b20 into
0x9034b0 of +0x18c8, +4); GetMaxMoves 0x56e130 adds +0x1924 where the plot's vt
+0x18 answers 1 — taken as the movement cost (a centre 1): runs/h1_duely1117
Heavy Chariot 589825 3 on its centre, 2 on Woods / Hills. Open: vt +0x18 with a
road (C-111).

## C-95: a city-state's ground closed to another city-state — ported

`closedToMinor` (cpu/core/tactical.ts), `_tac_closed`: Early Empire closes a
city-state's territory to other city-states at peace (runs/h1_duely1128 Hong Kong
t41; h1_duely1127 city-state 4 t51).

## C-97: City Defense and the assault target's validity — the city's threat, the defence event, Is City Threatened, Garrison City and the district target's validity READ; the threat's level terms, the garrison's swap and the team's unit to build unread

`cpu/core/operations/` (manager, operation, nodes, recruit, types, evaluate,
assault, knowledge, cityValue, cityThreat; `cpu/data/aiOperations.ts`).

- THE CITY'S THREAT 0x5cbd10 (m_cityThreat +0x160, data +0x1b8; set by 0x5ce680):
  per player (+0x4a0) but the owner and a friend (0x3da770): a full civ fought
  (0x469cd0) or denouncing (0x3da5e0 / 0x3da8e0), and the barbarians, margin 5.0;
  another full civ 20.0 (0x1400) or the garrison term where higher (0x5cc088:
  0x24a180, `garrisonTerm`; runs/h1_duelw1117 Antananarivo t214); an unfought
  city-state skipped; skipped where an owner's operation against it targets within
  5 (0x723cf0 over +0x318, 0x73a840, +0x2a0) (runs/h1_duelw1121 Hunza t13). Its
  known units within 5 (a full civ's) or 3 (0x5eadb0): s = max(Combat +0x48,
  Ranged +0x6c, Bombard + 20), counted where it bombards, is ranged above D − 15, or
  above D − 5 (D = 0x24ae80 without the garrison: 0x5cbd72, r8b; runs/h1_dueld1128
  Hong Kong t144-148); never an explorer, nor a barbarian (0x484910) of the
  manager's anti-cavalry list (+0x298 / +0x2f0, 0x153e40, filled by 0x153720)
  (runs/h1_duelv1121 t4-t13); the sum ≥ D + margin threatens at level 2; the first
  such player decides. Open (C-96): the level terms (+0x1a60, +0x5e8, +0x1c78,
  +0x588), +0x1c0's use.
- THE DEFENCE EVENT 0x5cced0: a threat > −1, slot 5 free: "City Defense" via
  0x7265b0, before the running lines.
- IS CITY THREATENED 0x813050: the target gone (0x73a8e0) or +0x1b8 > −1: SUCCESS.
  GARRISON CITY 0x8133c0; execution 0x810d30: the garrison on the city; a
  stronger candidate reaching it (0x791300) moves in and fortifies (0x56d6f0) or
  swaps (0x972880, unported); else the garrison fortifies (0x95eae0) at +0x98 −
  +0x94 ≤ 10.
- THE DISTRICT TARGET VALID 0x73abf0: the city record (kind 2); defences ≤ its
  districts (0x5eb600, +0x58) valid; op +0x124 1 valid; else a member the walls
  do not hold (+0x18b8 / +0x18b9, +0xb94 / +0xc14) valid unless the city's flag
  (+0x158 → +0x1c, +0x12f0 +0xf4); else the simulated blow (0x213e00 .. 0x205720,
  +0x24 / +0x28) against COMBAT_HEAL_CITY_GARRISON 20 (gp +0x1b8) (runs/h1_duelv1128
  China's Attack Enemy City t73 → INVALID t76).
- MEASURED: City Defense starts log / port 1117 35 / 69 .. 1128 45 / 54.

## C-96 / C-97: the team's unit to build, the recruit's contract and the knowledge base's camps — the team update's requirements and readiness, the unit choice, Recruit Units' result and contract, the camps READ; the maintenance resource test, the recruit's stealing and levy unread

`cpu/core/operations/` (nodes.ts teamUpdate, Recruit Units; unitChoice.ts,
unitRows.ts, manager.ts lookCamps) over `cpu/core/aiUnitProduction.ts`.

- THE TEAM UPDATE 0x73fba0 (+0x08 definition, +0x10 / +0x11 / +0x12 flags, +0x14
  unit to build, +0x18 members, +0x30 counts): per requirement (0x1c bytes: AiType,
  Dependence, Min / MaxNumber, Min / MaxPercentage, Reconsider) needed below its
  minimum, full at its maximum (0x740562); ready (+0x11) with the minimums met and
  the strength at the enemy's + desired (0x723ab0); +0x12 ongoing. The unit to
  build: the old one while 0x79cba0 takes it, else 0x79bd30 against op +0x888's
  player. Open: the reconsider test (+0x1fb8 +0x738, +0x778).
- THE UNIT CHOICE 0x79bd30 (check 0x79cba0): the table (+0x268: +0x00 unit, +0x08
  obsolete (0x538460), +0x0e buildable (0x798cc2: 0x4cb590 on +0x1338, 0x39d490 on
  +0x1310, 0x4aa790 at 0x798d11; Units +0x2c8 +0x14), +0x18 strength, +0x24
  maintenance resource, +0x2c / +0x30 / +0x38 sums) sorted (0x7976f0, comparator
  0x79d3e0); the walk 0x79bfe6 takes the first standing entry of a needed type (GlobalAI +0x408 +0x400),
  replaced by a Priority type (UnitAiTypes +0x31) or both sums above; the sums run
  the efficiency table row = entry (1128 248 / 580 "Contract for" lines). The
  maintenance test (0x79c277): income (+0x1320 +0x350) > +0x440 + the fuel bill
  (0x4ab270: +0x12e8 +0x1168), as the turn's 0x4a79e0; +0x440 the plants' burn
  (0x4a72c0 from 0x4a7cc0, cleared 0x4ade20). Signal +0x168 (0x79ba50). Open
  (C-99): runs/h1_duelw1121 city-state 3's Naval Superiority asks the Warrior Monk,
  not the Caravel (runs/h1_duelt1121 t92 sums equal; runs/h1_duelw1125,
  h1_duelw1111).
- RECRUIT UNITS 0x81c820 (data +0x00 .. +0x60): "Contract for" names the first
  team's unit (0x739cd0); done (+0x88) with none FAILURE; its contract FAILED
  FAILURE; with creation the unit asked (+0x8c); not ready (0x73aa60) and not in
  progress RUNNING with a contract or unit. Execution 0x8189f0: a stale contract
  cancelled (0x5cc8e0), a new one (0x5f47c0: the unit, Recruit Value × 3 for +0x40
  > 0, the Time Limit (+0x168 → +0x1c0)) submitted (0x60bb50). THE SECOND OFFER
  (0x60a8c0): the satisfied test (@0xd760f8 +8, 0xb3c380) false, so signal +0x1c8
  (0x6075b0) with the priority (+0x5a8, else 0x723b90: +0x548 via 0x73a120 →
  0x7cb230) and Allow Stealing (+0x60); each tree (0x7cbb40 binds +0x628 to
  0x7d1e40) of lower priority, or marked (+0x3c8, 0x7d3670), answers with its units
  (0x6092c0 by +0x488; alone +0x1fb8 +0x738 1, not done +0x530); a city tree's
  priority its list Value (+0x470; 0x5cc910 / 0x5ccc10 / 0x5cd150) (runs/h1_duelv1121
  t7 twice). Open (C-99): the levy (0x449b70), stealing.
- THE CAMPS (m_barbarians +0x638, 0x10 bytes): the look 0x7877e0 adds each camp
  seen or revealed (+0x290 / +0x2f0, 0x787bee..0x787cd5) via 0x5f0110; the update
  0x5ebb30 drops an empty one; a city-state knows the camps on its revealed plots
  (`CityState.revealed`, `cityStateSight`).
- THE KNOWLEDGE LOG (0x5ed280 by 0x783980 at 0x785f30's end): a camp placed at N on
  a revealed plot logs at N + 1, a candidate at N + 2 (runs/h1_duelv1124 player 2's
  8:14); the evaluation runs before the ageing and look (`minorMilitaryTurn`,
  `minorKnowledge`).
- MEASURED: Attack Barb Camp's running lines 1124 932 / 490 (log 277).

## C-97: the majors' diplomatic actions — the pick, the state machine and the receiver READ, the evaluator's terms PARTLY READ

AI::Diplomatic (+0x1280; DiplomaticActions.cpp, DiplomaticState.cpp,
Diplomatic.cpp). The majors' diplomacy is the recording's or the RL seat's
(proposals through the deal offer / accept path, `cpu/core/deals.ts`).

- THE ACTION ROWS (0x652800): ", %3.1f:%3.1f" = FIRST 0x66cc40 (+0x48 desire;
  dump 0x676510) and SECOND 0x66b490 (+0x68 cost) of m_diploActionEvaluator[p]
  (+0x2eb8, stride 0x88), refilled per action by 0x670210; 0.0:0.0 on an attempt.
- THE FUNCTORS (0x672210: +0x08 cost, +0x28 desire, +0x48 can-do, +0x68 hook,
  +0x88 perform): Delegation 0x66b590 / 0x66cd40 / 0x672f90 / 0x674960; Embassy
  0x66b610 / 0x66cf30 / 0x6730e0 / 0x674a10; Demand Tribute 0x66b220 / 0x66c800 /
  0x672df0; Open Borders 0x66bb50 / 0x66dda0; Declare Friendship 0x66ae10 /
  0x66c160 / 0x672c40 / 0x674820; Request Assistance 0x66bf30 / 0x66e750 /
  0x6737b0; the war declarations' hook 0x6742d0. Indices (0x67ff10): @f2e564
  Embassy, @f2e568 Demand Tribute, @f2e56c Open Borders, @f2e58c Delegation,
  @f2e594 Declare Friendship, @f2e5d4 Propose Trade.
- WORTH / COST (0x6718a0 / 0x671650): DiplomaticStateActions (Worth +0x24, Cost
  +0x18) less the Gold cost at the Gold weight (0x527610 → 0x7a6690), clipped by
  the preference (+0x6240, else p's +0x62b0); + +0x6320[p][a] (0x6504f0, writer
  unread).
- THE TRUST TERM 0x671b80: with +0x6480[p] non-zero, n = 1 + the more trusted
  (0x650550), L = trunc(+0x6420 × 0.25 / 0.5 / −), T = (10 / 20 / 40) × (L − n +
  1) / L.
- THE DESIRES: Delegation / Embassy Worth + T + 20 for the focus (vt +0x30 =
  0x657d90: +0x6780, set by 0x647bb0); Demand Tribute (0x66c800) Worth − 10 focus +
  (20 − T) when twice as strong (0x4bd0d0(−1): +0x210) or a later era (+0x1358
  +0xf8); Open Borders Worth − T + (40 − d) × 0.5 + 10 focus; costs Cost − T.
- THE PICK 0x64ba90: the state turn, then repeatedly each met unmarked player
  (+0x1a): its state's actions skipping DISFAVORED, desire ≤ 0, CanDoAction
  (0x3dd9a0), NOT READY (0x672ef0: +0x6390, can-do); favoured first, else the
  higher desire; performed (0x674900): one action a player a turn.
- THE MISSIONS' CAN-DO (0x672f90 / 0x6730e0): savings slot 2 (0x6874d0: ≥ half, +
  slot 0 ≥ cost), CanDoAction, the last diplomatic turn (+0x11b8 via 0x3d9450) +
  AI_TURNS_BETWEEN_PEACE_OFFERS 3 (gp +0x20) below the turn; perform 0x674960
  spends slot 1 (0x68acd0).
- THE SAVINGS (0x687bf0): the treasury's change since +0x1b8 shared by
  DefaultSavings (SLUSH 3, UNITS 4, PLOTS 1, GREAT_PEOPLE 1), negatives cleared,
  slot 2 capped 150; a spend (0x68acd0) takes its slot, the overflow from slot 0.
- THE RECEIVER (0x237c60 / 0x238330): an AI receiver (0x653f60) refuses an action
  outside its state's lists, else accepts at 0x66b490 of +0xca8[sender] ≤ 0;
  0x6543a0 records it (a refusal refunds slot 2; +0x6338). Confirmed: 20 / 20
  answers (runs/h1_duelv1127 the Delegation refused 61, 68, accepted 79).
- THE STATE TURN (0x67b6e0; entries 0x67aff0, terms 0x67aaf0): a REQUIRED row
  (RequireTransitionMax ≤ opinion, else ≤ Min) is taken; else the heaviest
  positive ALLOWED row whose target lists every desired action. Friendly →
  Declared Friend (0x67c740; AI_TURNS_BETWEEN_FRIENDSHIP_OFFERS 5) never passes.
  The required rows alone hold 4,828 / 5,049 (Rome) and 5,300 / 5,341 (Qin).
- Open (C-2): +0x6320, the focus 0x647bb0 (0x650270 +0x630, 0x2a81f0, gp +0x268),
  +0x6480 / +0x6420, +0x11b8's writer, the other functors, CanDenounce /
  CanGoToWar / CanOfferAlliance.

## C-97: the religion AI — the belief scores READ (the job, the value, the analysis's attach), the picks READ, the analyzers PARTLY READ

AI::Religious (constructor 0x74af30; +0x168 / +0x1c0 favored religion, +0x1c8 /
+0x220 must found pantheon, +0x228 / +0x280, +0x288 / +0x2e0, +0x2e8 / +0x340 the
boost); AI_Religious.csv (header 0x750500, writer 0x750e30). Pantheon and
religion choices are seat actions ("C-97: the proposals ...").

- Signals (0x750830): turn 0x74fbf0, boost 0x74f5a0, founding 0x750fe0, belief add
  0x751430, Belief Analysis start 0x74ea60 (full civs only, 0x469db0), 0x751830,
  0x74e390, 0x7513f0.
- THE BELIEF LIST (+0x3b0, +0x3c0, 0x30 each: +8 belief, +0xc class (Beliefs
  +0x40 → +0x14), +0x10 taken, +0x14 score, +0x18 modifiers 0x750350 / 0x6cef90):
  "Belief Analysis" (0x750230 → 0x7500d0): taken where a pantheon (0x3408d0) or
  religion (0x340950) holds it; else 0x7a7400(belief, rate, 0, horizon[2] = 100).
  A minor logs −1.0 throughout.
- 0x7a7400: 0x7a4b20 with the religion founded (0x497520) else the majority
  (0x497240).
- 0x6cede0 CLEARS +0xc0; EFFECT_ATTACH_MODIFIER 0x6ab630 (parser 0x6ab400) SETS it
  to its copy's (0x142650) total — the last admitted subject's (runs/h1_duelw1124
  t2 Rome Feed the World 68); EFFECT_GRANT_ABILITY 0x6b5b30 adds; slot 2 0xbe4aa0.
- Collections: ALL_CITIES 0x69f320 / 0x69f340 (the knowledge base's); ALL_PLAYERS
  0x69f6c0 / 0x69f6e0; OWNER 0x69fc90 / 0x69e790; CITY_DISTRICTS 0x69fdf0;
  PLAYER_UNITS 0x69ec70. Requirements: CITY_FOLLOWS_PANTHEON 0x6cfbf0,
  CITY_FOLLOWS_RELIGION 0x6cfcb0, PLAYER_HAS_PANTHEON 0x6cfbd0,
  PLAYER_IS_RELIGION_FOUNDER 0x6d27a0 (0x497cc0).
- Analyzers: TERRAIN 0x6b76f0 / FEATURE_ADJACENCY 0x6aee30 (0x6c7690 / 0x6c78a0
  read the offset (x, y) AS AXIAL: runs/h1_duelw1124 t3 Desert Folklore 22; 0x5d2df0
  over +0xcf8); CULTURE_BORDER_EXPANSION 0x6abc40 (0x6ab8a0; 0x16eb20, @0xd20458);
  CITY_GROWTH 0x6beb00 (0x1b5620); ALL_MILITARY_UNITS_PRODUCTION 0x6b5d50
  (0x467eb0, sar 9); FAITH_FROM_DISPERSAL 0x6bdd40 (+0x648); HEALING_FROM_DISPERSAL
  0x6a6d20 (@0xf2e254); DISTRICT_GREAT_PERSON_POINTS 0x6a4680 (parser 0x6a44b0;
  slot 2 0x6a4750); GRANT_UNIT_IN_CITY 0x6abe40 (0x4f2b20, 0x7b62c0);
  ADD_RELIGIOUS_BUILDING 0x6bb1f0 (0x7a7590); DISTRICT_AMENITY 0x6a1170 (0x79f7c0),
  DISTRICT_HOUSING 0x6a5d20, BUILDING_HOUSING 0x6c0490 (0x7a3d70).
- THE PICKS: the pantheon 0x74e2b0 (→ 0x33fb70) the first strictly highest; a
  belief 0x751430 with room (0x3409a0 → 0x340740), a Follower first; the founding
  0x750fe0: FavoredReligions (leader, civilization) not founded (0x340490), else
  "Random Religion Choice".
- THE FAITH BOOST 0x74f5a0: "C-96 / C-97: the AI's yield weights ..." (0x5d4cd0,
  0x172820, @0xd2f324, 0x496fd0).
- MEASURED: the picks on the log's scores 5 / 5 and 17 / 17. Open (B-91): the
  Settler tail (0x2c43b0, 0x6fe2b0, 0x17a600), a major's building value, the
  religious units' targets (0x74ea60 +0x4a0, 0x74cf50 / 0x74d320).

## C-97: the proposals and the religion's choices as seat actions — the price READ, the receiver's value READ but the trust term

The missions, friendship, alliance and open borders are deal items
(`cpu/core/deals.ts` MISSION / FRIENDSHIP / ALLIANCE, `sim_deals.py`) offered by
`offer`, answered by `accept`; the pantheon, religion and beliefs are the
record's (`foundPantheon`, `adoptBeliefs`, `religionChoice`; `RELIGION_TYPES`,
`civ_religion_type`).

- THE PRICE 0x527610 (from 0x237c60 / 0x238330): Cost (+0x20) at speed
  (0x525400) less its remainder by 5 (gp +0x5b0): Delegation 10, Embassy 25 online
  (runs/h1_duelv1127 Rome +10 t79, +25 t191).
- THE RECEIVER'S VALUE 0x66b490 = 0x671650 − 0x671b80: Cost(state) − 0.5 × price ×
  (1 + w_gold) − T (runs/h1_duelv1127 t68 58.0 / 72.5: 1.4, T 10). Open: the trust
  term's inputs (C-2).

## C-97: the governor AI — the analysis, the choice and the seats READ, the analyzers PARTLY READ

AI::Governors (AI/Governors.cpp; AI_Governors.csv, opener 0x6eef10). The majors'
governor choices are the recording's or the RL seat's.

- THE TABLES (0x6ef120; data +0x1d0 / +0x280): per governor (Governors order,
  0xad57f0) 0x40 bytes: +0x8 governor, +0x10 slot cities, +0x28 values; per
  promotion (GovernorPromotions order, 0xad5830) 0x38 bytes, +0x30 score.
- "Governor Analyzer" (0x6edfc0 for a full civ; 0x6eee50): 0x6ee5f0 per governor,
  0x6eedb0 per promotion.
- 0x6ee5f0: slots 1 + cities + the game's city-states (+0x1650); nothing for one
  not appointed (0x433450) nor open (0x4316f0); slot 0 0x7b0e40(no city) / the
  society level (0x16e940); slot 1 + i the i-th city; AssignCityState (+0x48 bit
  0) the met (0x3daaf0) city-states' capitals (0x36f460).
- 0x7b0e40(governor, rate, 0, 100 (`push 0x64`), player, city, modifiers): no city
  10.0 (20.0 AssignToMajor); a city for AssignToMajor FX(−9999) (@0xf04cb0);
  another's or held (+0x58) 0; else Loyalty (0x19d200 on +0x2a78) less
  IdentityPressure (+0x20) — its loss from establishment (start + 5) to horizon
  (0x7a2140), at least 20, + 0x79fef0 where lifted above 0; then the BaseAbility
  modifiers (GlobalAI +0x39c0, built 0x6dfc70) via 0x7a4b20 (runs/h1_duelw1117
  China t2..t30: Educator 38, Ambassador 112 at Caguana).
- A PROMOTION 0x6eedb0 → 0x7b0bb0 (GlobalAI +0x39d8): from 5.0, −1.0 for an
  unappointed one, a society's level × 250, + the modifiers in the governor's
  city (0x432d80); at least 10.0 (runs/h1_duelw1117 t24 Messenger 112).
- THE AI TURN (0x6ee100): the log (0x6ef6a0); while a title stands (0x430ee0,
  0x431ac0): the first strictly highest above 0 — an unappointed governor's best
  slot or an unheld (0x35e320) takeable (0x431400) promotion — APPOINT
  (0xa68659ab) or PROMOTE (0x7d3da99d) (0x48a330 / 0x49a50); one a turn.
- THE SEATS (0x6ed750): the generalized assignment 0x8b5bf0, one pass, λ start
  0x6ecee0, gain 0x6ece40 (−1 unappointed or missing, 0x6eff30), move 0x6ed060,
  knapsack 0x616570 → 0x61ddb0; ASSIGN_GOVERNOR (0xf97c278b) (runs/h1_duelw1117
  t205 Merchant → Xiurong).
- THE ANALYZERS: EFFECT_ADJUST_CITY_YIELD_MODIFIER 0x6b9d90;
  CULTURE_BORDER_EXPANSION 0x6abc40 (halved by 0x16eb20 @0xd20458);
  YIELD_PER_POPULATION 0x6b6460, GOLD_FROM_CITIZENS 0x6b8150 (+0x588);
  YIELD_PER_DISTRICT 0x6b4e80 (0x1ae8f0(1, 1, 1, 0, 0): +0xe1 bit 2, +0xb08, bit
  6); CITY_INNER_DEFENSE 0x6c2dc0 (0x249ee0); TRADE_ROUTE_YIELD_TO_OTHERS 0x6a49e0;
  GOVERNOR_ADJUST_CITY_TOKENS_GRANTED 0x6b2850 (0x7a46c0); SPACE_RACE_PROJECTS_PRODUCTION
  0x6be2d0 (@0xf2e2ac; 0x4be7b0; parser 0x6be5b0; 0x17b890 adds the Amount raw;
  0x17a8c0 (+0x2f0, 0x178c50), cost 0x17a680 (0x5254d0), +0x260, +0x1f4, 0x8c4540).
- THE ENVOYS' WORTH 0x7a46c0(n, rate, start, horizon, player, city-state,
  +0x1280 +0x6868): 0 at war (0x469cd0); else 0x7a4b20 in a fresh context (+0x40,
  +0x08 n) over the list 0x651490 (@0xe261e0: the INFLUENCE_REQUIREMENT trait
  modifiers); PLAYER_HAS_GIVEN_INFLUENCE_TOKENS 0x6d45b0 (0x44c860, +0x5d0,
  0x44caa0; parser 0x6d4490), PLAYER_IS_AT_PEACE 0x6d2470; the suzerain
  requirements unregistered (runs/h1_duelw1117 Caguana 112 → 186 at t28).
- Open (C-114): religion pressure 0x6a8080 (0x1f33e0), CITY_TOURISM 0x6ac690
  (0x18ddf0 / 0x18e0e0), ALL_DISTRICTS_PRODUCTION 0x6a9e80 (0x5d4a20),
  RESOURCE_POWER_PROVIDED_GOVERNOR 0x6b2b70 (0x7a67f0), DISTRICT_HOUSING 0x6a5d20 /
  AMENITY 0x6a1170, PROJECT_PRODUCTION 0x6b10b0, COMBAT_BONUS 0x6a8d10,
  SIEGE_PROTECTION 0x6a9650, ATTACKS_PER_TURN 0x6a7510, AIR_DEFENSE_BONUS 0x6a3a80
  (0x7a0ac0), EXTRA_ACCUMULATION 0x6ae390 (0x7a21e0), UNIT_GRANT_EXPERIENCE 0x6af1e0.

## C-97: the sender's pick, the savings, the threat and the focus — the savings, the spacing, the trust term and the focus READ, the threat PARTLY READ

- THE THREAT (+0x6428, data +0x6480; 0x647f10 each turn): per met p, (a) its
  knowledge entry's +4 (0x5eb7c0, written by 0x5f0020: the team's best victory
  progress, vfunc +0x58) above 0.4 (@d5fec8) × 100; (b) 0.05 (@d55ff0) × its lead
  in strength (0x4bd0d0) past 100; (c) 0.2 (@d5aff0) × +0x12a0 +0x698[p] past 100.
  Logged by 0x652bb0. THE RANK 0x650550.
- THE THREAT TERM T 0x671b80: the preference (+0x6240, else +0x62b0 via 0x6504a0);
  L = ceil(+0x6420 × 0.25 / 0.5) / +0x6420 (ceilf 0xcef33c); 10 / 20 / 40 × (L − n
  + 1) / L (runs/h1_duelv1127 Qin T 10 on 185 / 185).
- THE FOCUS (+0x6728, data +0x6780; 0x647bb0): per met major, a friend within the
  recency (0x2a81f0, gp +0x268), not at war nor turned away (0x3da8e0), p's value
  of the owner (vt +0x18) highest.
- THE LAST ACTION'S TURN (+0x1160, data +0x11b8; writer 0x3e6d20, reader
  0x3d9450): set by 0x674960, 0x674a10, 0x674b60, 0x675100, 0x675410, 0x681b60.
- THE SAVINGS (0x687bf0, +0x540 / +0x598, data +0x5b8): the treasury (+0x13a0
  +0xf8) less +0x1b8 × fx(weight / +0x458); slot 2 above 150 (0x9600) to slot 0;
  slot 3 joins slot 0 with no Great Person class left. Can-afford 0x6874d0; spend
  0x68acd0; a refusal (0x6543a0) −price on slot 2.
- PREFERENCES and weights read the agendas' lists (runs/h1_duelv1127 Qin's Gold
  0.6 = 0.2 + 0.2 + MoneyGrubber 0.2).
- THE ALLOWED ROWS weigh s(a) = desire where CanDoAction (runs/h1_duelv1127
  t100-105 → Unfriendly at t105).
- The receivers' answers (`answerAction`): 21 / 26 on the log's opinions. Open
  (C-2): the threat's (a) and (c).

## C-97: the other actions' desires, the trust and the transitions — the friendship, the alliance, the trust, the threat term and the transitions READ; the war value, the deals and the victories' progress PARTLY READ

- THE MODES (T 0x671b80, U 0x671ef0): the missions T(0, +), cost (0x66b590) − T(0,
  +); Open Borders (0x66dda0) T(1, −), cost (0x66bb50) − T(1, −) − U(0, +); Demand
  Tribute's cost (0x66b220) − T(1, +).
- THE TRUST (+0x6560, object +0x6508; 0x2e04e0): +2 per deal struck (signal +0x5a0,
  0x6535f0, subscribed 0x651490), −10 on +0x5d0 (0x653630) (runs/h1_duelv1127 t99).
  U: v × 0.02 × 10 / 20 / 40 within the weight (0.78 at 2.00).
- 0x647f10 counts +0x6420 (alive majors met + self, +0xb50) and the near-victory
  flags +0x64f0[p] (alliance 0x3d7e20 ≤ 2, no winner 0x357ff0, CriticalPercentage
  +0x1c via 0x357e60).
- DECLARE FRIENDSHIP: desire 0x66c160 (0 near victory, 0x652770; Worth + T(1, −) +
  U(1, +) + 20 focus + 20 per war of +0xfa0); cost 0x66ae10 (9999 near victory; +30
  with a ready war operation 0x723db0) (runs/h1_duelv1128 Qin t182-197).
- THE ALLIANCE: desire 0x66d810, cost 0x66b990: U(1, +) + 5 × (+0x6420 −
  min(ranks) + 1).
- THE SURPRISE WAR (0x669310): desire 0x66e950 (−1 at two wars, 0x3dfae0; −9999
  disfavoured @f04cb0; else the war value 0x7b7760, at least 5 at rank 1); can-do
  0x673800 (0x4396d725, 0x723db0(p, 1, 2, 5) over +0x318 type 5 against +0x2a0);
  perform 0x675ae0.
- DENOUNCE's desire 0x66d800 is 0; the state machine denounces.
- THE CHECKS (0x67ff10): CanDeclareFriendship 0x67c740, CanDenounce 0x67c860,
  CanGoToWar 0x67c920 (0x723cf0, 0x64a560, 0x73b8c966), CanOfferAlliance 0x67ca30.
- THE ACTIONS (0x67b410): OnDeclareFriendship 0x681b60 (false), OnDenouncePlayer
  0x681c10 (0x724f30, true), OnOfferAlliance 0x681e80 (0x674900, false), GoToWar
  0x67df10.
- THE TRIGGERS (DiplomaticTriggeredTransitions): GO_TO_WAR War, MAKE_PEACE
  Unfriendly, DENOUNCE Denounced, ..., LEAVE_ALLIANCE Friendly.
- THE NOT-READY FLAG (+0x6390, object +0x6338; 0x650460): set by 0x6543a0 on 0xc,
  cleared by 0x653f60; clear between AI majors.
- +0x6320[p][a] (0x6504f0, object +0x62c8): Propose Trade alone, +150 (0x653b80) /
  −150 (0x653840) on the emergencies' signals.
- Open (C-2): the favoured doubling (runs/h1_duelv1121 Qin from t127), 0x723cf0's
  preparation, Propose Trade (0x82dff0 / 0x64d320; 0x673460), the victories'
  progress, the Formal War family (0x6690a0).

## C-97: the World Congress AI — the evaluation, the outcome, the votes, the hints, the option values and the targets READ

Ported: the valid targets and the target draw (`cpu/core/congressTargets.ts`,
`drawTargets` / `_congress_targets`, `_congress_target_draws`;
`cpu/data/congressTargets.ts`); the ballots are the seats' actions.

- THE SESSION'S PLACE: its draws are the turn's last (runs/h1_duelv1127 t61, t101,
  t181); the slate is drawn and voted at the session.
- THE EVALUATION 0x622140 (entries 0x20 at +0xa58): each option's value 0x7b3be0
  into +0x18 / +0x1c; the player's +0x348[r] list > 0 takes A (+0x14 1, desire
  +0x10), < 0 B, else the greater (A on a tie).
- THE OPTION VALUE 0x7b3be0: a context (0x6ccd50) of the player, start 0, horizon
  30 (0x1e), rate 0x6fec30; the AITargetChooser handler 0x67dd40 fills it (none:
  0); the option's modifiers (+0x3978 / +0x3990) via 0x7a4b20.
- THE HINTS (0x67f160): TradingPartners 0x682fb0 (0x3ffaf0 unread), PlayerOrDiploLeader
  0x682220, BorderControlTarget 0x67c640 (0x3ce840; gp +0x264 / +0x260),
  GrievancesType 0x67f040 (0x3da8e0, +0x9d0), MigrationTarget 0x6810a0 (+0x3070,
  0x67dea0), MostCommonLuxury 0x681940 (0x4aa790), UnitBuildYield 0x683120,
  Government 0x67e3d0, GreatPersonPatronage 0x67e730, GreatWorkObjects 0x67ed10,
  MinorCivBonus 0x6813a0, ReligiousTarget 0x682c00, UnitPromotionType 0x6832f0,
  District 0x67cce0 (+0xe1 bit 4, +0x260, +0xe0 bit 7); unread by any chooser:
  FeatureType 0x67db60, SpyOperationType 0x682f80, PowerBuilding 0x682440; Project
  0x6826d0 (+0x1290 +0x560, 0x7004c0; +0x20, +0xe8 bits 2 / 8, 0x16f7b0).
- THE ANALYZERS (ten of twenty registered): ATTACH_MODIFIER_TO_PLAYERTYPE =
  0x6ab630; COLLECTION_MAJOR_PLAYERS 0x6a00f0; NO_CAP_RESOURCE 0x6a8320 (0x79f7c0);
  BAN_RESOURCE 0x6bc050; BUFF_UNIT_PRODUCTION_YIELD 0x6b47f0;
  GREAT_PERSON_POINTS_PERCENT 0x6a2270 (+0x1360 +0x168); NO_GREAT_PERSON_POINTS
  0x6b0050; GOVERNMENT_SLOTS 0x6a3870 (0x623b90); PLAYER_DIPLOMATIC_VICTORY_POINTS
  0x6c6d60 (0x25d5f0); PLAYER_GRIEVANCE_GENERATION 0x6c3bc0; PROJECT_PRODUCTION
  0x6b10b0; PLAYER_BAN_CITY_PRODUCTION 0x6bb020; BUILDING_PRODUCTION 0x6c1a80.
- THE ORDER (0x61dc50, comparator 0x617d70): listed first, then desire.
- THE VOTES 0x628450: F favor (+0x110); per resolution the cap 0x527d80
  (whole((√(4F / s + 1) + 1) × 0.5)), the want whole(desire / 2) or floor(F ×
  desire / S), cast max(1, min(want, cap)) (0x59bc40), priced 0x527680 (s × n × (n
  − 1), s = 5 at speed 0x525400: 2 online) (runs/h1_duelv1127 Qin 4 votes at t61
  for 24) (`voteCost`, CONGRESS_VOTE_PRICE).
- THE TARGET (0x611140 .. 0x612e50, per TargetKind): the first hint field set
  (+0x1c .. +0x58) picks; a valid hint applied (0x610440), else ONE "Random
  congress resolution target" (0x8b6c10; a count of 0 still draws) applied
  (0x487650); the valid list WorldCongress.lua's ValidationLua in database order
  (1127 t181 two draws over 10; 1128 t181 over 3).
- MEASURED: outcomes 106 / 109, votes 83 / 109, targets 66 / 75. Open (C-121):
  1127 t161's Luxury value.

## C-97: the great people's patronage — the Gold and Faith patronage READ, the usable plots and the points a turn PARTLY READ

- THE GOLD PATRONAGE 0x6898b0 (from 0x687bf0's close): K = 0.5 (@d20458); per
  class (0xad58b0) standing person (0x2f64a0): one claimable (0x2f28a0) by
  RECRUIT_GREAT_PERSON (0xe8e854ba, 0x385fc342) is recruited; else Gold-patronizable
  (0x2f26c0) at a price (0x2f70e0) below the best, SLUSH + GREAT_PEOPLE above it,
  GREAT_PEOPLE above K × it, a usable plot (0x561070): the cheapest PATRONIZE
  (0xebdeb9f6, Gold 0x2b8aba02), spent from the savings.
- With no class available (0x2f7eb0) the GREAT_PEOPLE slot joins the SLUSH_FUND.
- THE FAITH PATRONAGE 0x751590 (the religion turn 0x74fbf0 after 0x74de60): the
  cheapest Faith-patronizable person its Faith (+0x1340 +0x100) exceeds.
- CanPatronize 0x2f26c0: earnable (0x2f23f0), standing, not passed (+0x10), the
  purse, not barred (0x43d1e0) (`patronizeGreatPerson`).
- THE PASS 0x2f8c00 only from 0x48b9d0: the AI never passes; 0x2f2e90 / 0x2f8100
  claim at the points.
- Open (C-114): 0x561070 (0x55f900); the points a turn 0x43c410 (+0x10f8[class],
  0x1cb000, +0x1d8, 0x43c340: +0x250, 0xf8705d00; read by the hints 0x67e680 /
  0x67e730) (`greatPersonPointsPerTurn`).

## C-96: the improvement value's resource copies, a minor's strategic copies, the district count — READ (0x7a58f0's count, 0x4a93c0, 0x1ae8a0, 0x1ae8f0), a LAB (a city-state's Great General weight)

- THE COPIES (0x7a58f0 → 0x7a21e0's count, 0x7a5c00..0x7a6022): an improvement
  working the plot's resource (+0x1e8) passes 1.0, or for an Accumulate resource
  (0x28a940 on +0x1c, +0x48 bit 0) valueBetween (0x7a2140) of
  ImprovedExtractionRate (+0x24) × (1 + 0.01 × +0x1e00 at the terrain +0x2c,
  0x4a9ff0; @0xd136f0, @0xcfc9f8) T to H, whole; its own 1, the replaced −1
  (`resourceCopies`, `_cv_resource_copies`). Confirmed: runs/h1_duelv1121 Hunza
  t19's Pastures 171.45.
- THE COPIES HELD 0x4a93c0(r, 1): +0x2e0[r][0] − reserved (0x4aa530) +
  +0x2e0[r][1]; `have` (0x7a228f / 0x7a28e7); a city-state's stockpile
  (`minorResourceFacts`, `_rai_resources`, `CityState.stockpile`,
  `citystate_stockpile`); the strategic flag [rsp+0x40] skips the exit and the cap
  (0x4aabe0 − 0x4aa790).
- THE DISTRICT COUNT: 0x1ae8a0 = ceil(pop / gp +0x2ac) + +0x20; 0x1ae8f0(skip +0xe1
  bit 2, complete, RequiresPopulation, 0x24c3b0, unpillaged) — 0x7aaf80 calls (1, 0,
  1, 0, 0).
- LAB: a city-state's GPP_GENERAL weight at −1.0 (runs/h1_duelv1124 Granada t2's
  Encampment) (`pseudoYieldWeights`, `_MinorFacts.pseudo_w`). Open: its writer
  (C-100).

## C-96: the city under threat and a pillaged district's repair — the test READ, the repair PARTLY READ

- THE CITY UNDER THREAT 0x5cdc50: the war footing ([+0x12a0] +0x4b8), else
  +0x1b8 > −1 AND (the centre's GetDamage(0x5e97d629) > 0 or +0x218). Readers:
  0x5f6050 (0x5f60c0, 0x5f62a1, 0x5f64a6), the defensive pick; 0x5d7640 inline
  (0x5d766a..0x5d76ac). Under threat a district passes only with HP (+0x58 /
  +0x5c; 0x5f62d3, 0x5f6304) (`minorUnderThreat` / `_minor_under_threat`,
  `underThreat`, `districtDefensive` / `d_defensive`). Confirmed: runs/h1_duelw1124
  Granada t42 kept its Harbor; runs/h1_duelw1127 Muscat t160-165 NO BUILDS.
- +0x218 (a watched bool at +0x1c0, setter 0x29fdf0): written only by 0x5cbd10 —
  cleared at 0x5cbd9e; per player past the skips, 0x5eadb0 at radius 2, strength 5,
  age 2: three units or more (0x5eafd2) set it (0x5cc3d4); a fought player with
  it set threatens at once (0x5cc3d9 → 0x5cc475) (runs/h1_duelw1103 Hattusa t46;
  runs/h1_duelw1105 Bandar Brunei t16) (`cityThreat`'s `near`,
  `CityState.threatNear` / `citystate_threat_near`, `City.aiThreatNear` /
  `city_ai_near`).
- A PILLAGED DISTRICT'S REPAIR: 0x7a51f0's own-district term on its plot
  (runs/h1_duelw1127 Muscat t160 Commercial Hub 5469.0, queued t167, resumed at 75%)
  (`minorRepairsDistrictAt` / `_minor_repairs_district_at`, `districtBlocked` /
  `district_blocked`, `minorDistrictCost`). Open (C-96): the repair's T, two repairs
  in one step, the Market's own contract.

## C-96: the district value's remaining terms — READ (the envoys' term, the golden-age term's reader, the modifiers' list, the neighbours' functor), a LAB (the district's buildings), and the Farm's adjacency in the plot values

- THE ENVOYS' TERM (0x7aaf80, 0x7ab8f5..0x7abac8): per city-state (+0x1650) whose
  verdict (0x5d2ae0 on +0x1290 +0x1f8) is 1: 6+ tokens (0x44c860) +2.0, suzerain
  (0x44c850) +4.0 more; none at a minor.
- THE GOLDEN-AGE TERM (0x7ab294..0x7ab2db): GOLDENAGE_POINT of 0x2c41d0 (0x2c3660,
  +0x128 → the record +0x5b8's +0x34). Open: +0x34 (C-100).
- THE MODIFIERS (0x7a4b20 at 0x7adc10): GlobalAI +0x39a8 by district (0x675e40),
  filled at 0x6e0736..0x6e08f5 (0xc7a880): only the Aqueduct's, Bath's, Cothon's,
  Suguba's.
- THE NEIGHBOURS (0x79f280 at 0x7add12, top level): the candidate pushed
  (0x7b8bd0 from 0x7adc88), radius 1 (0x6b1b0, @0xd71be8 → 0x7b8a20 → 0x79ed40): a
  wonder's (+0x30 → +0x1e) building value 0x7a7590 with the list less with a fresh
  one; an improvement's (+0x44) 0x7b1320 likewise.
- LAB: THE DISTRICT'S BUILDINGS — every row stands above 0x7aaf80's terms by the
  best building of the district the centre values (runs/h1_duelv1128 Bologna's
  Campus 4.37 at t13; the only accessor 0x5d4920 is the contract's)
  (`districtBodyValue`, `buildingsValue`, `_cv_district_body`, `buildings_value`).
  Open: the reader (C-100).
- THE FARM'S ADJACENCY: `improvementAdjacency` pays the Farm rows
  (runs/h1_duelv1127 Forts 3,952 → 4,969 exact).
- Open (C-100): the T under a district in production (runs/h1_duelv1121 Hunza
  t136-162), unnamed floodplains (1127 p2 (43,15)), the Neighborhood's housing.

## C-96: the Free Cities' city build AI, threat and Combat Desire — the lists READ, the threat and desire's inputs READ off the logs, +0x4b8's writer unread

- THE LISTS: TRAIT_LEADER_FREE_CITIES' FreeCitiesCityBuilds holds
  CITY_EVENT_DEFAULT "Simple City Tree" alone — no City Defense, no building,
  district or improvement event, no contract. A Free City's build is the Default
  Specialization on an empty queue (runs/h1_duelw1114 Rome t124 UNIT_SLINGER 60.3;
  runs/h1_duelw1123 Chen t202; runs/h1_duelw1130 Rome t152).
- The defensive pick reads 0x5cdc50 as a city-state's.
- THE THREAT AND DESIRE: the military AI runs every turn on its own knowledge base;
  M counts each MAJOR at war (1123 t200 0.5); the desire capped at 2.0 on a city's
  threat at or above 0 (t213-215) (`freeKnowledge` / `_free_knowledge` (row `FK`),
  `freeCombatDesire` / `_free_combat_desire` (row `FR`), `pseudoYieldWeights`,
  `freeCityThreat` / `_free_city_threat`, `City.aiThreat` / `city_ai_threat`,
  `freeOpNear` / `_known_threat`'s `op_near`; 0x5cbd10, 0x723cf0). Open (C-120):
  +0x4b8's writer (writes only at 0x71b68a in 0x71a960, and 0x264296).

## C-96: an event's civilian kill spares a Trader — PARTLY READ

UNIT_KILLED_CIVILIAN 0x33a070: the plot's layer-0 units (0x75c50, r9d 0), live
(+0x770), CIVILIAN class, not CanRetreatWhenCaptured (+0x1b8 bit 8), owner not
immune (0x468100) are killed; a Trader stands in a layer of its own
(runs/h1_duelw1127 t160 Muscat's Trader survives) (`strikeUnits` /
`_strike_units`). Open: the layers' assignment (C-113).

## C-100: the rivers' names and the flood cut — READ (0x534950's river call, 0xa29730, the plot-to-rivers map), MEASURED (the naming sight)

- 0x534950 (a FULL_CIV's plot first revealed, from 0x58aa90): with +0x37 > 0,
  0xa29730 over the plot's rivers (+0x190 map, 0xa285b0; by ID +0xb8..+0xc0, +4)
  whose namer +0x48 is 0 or name −1: the player names it (0xa292a0) — its own
  plots alone.
- MEASURED: the "Floodable Rivers" column against a major's sight
  (`plotsSeenNow`) over each river's plots: runs/h1_duelv1127 t1, t1, t3, t29, t59,
  t106 as logged (`nameRivers`, `GameState.riverNamed`; `_name_rivers`,
  `river_named`; `riverRevealed` / `_flood_open`); runs/h1_duelv1127 p2 (43,15)'s
  Farm 100.35 at t28.
- The lab's idle store (`prodOverflow`; runs/h1_duelv1121 Antioch t126-162).
- Open (C-122): the name draw itself.

## C-100: a district on a feature it may not stand on, and the Mountain Portal's analyzer — READ

- 0x7a51f0 at 0x7a5335..0x7a5412: a feature the city keeps under the district
  (0x17cb00 over +0x2170 +0x378, written by EFFECT_ADJUST_VALID_FEATURES_DISTRICTS
  0xbb9de0 → 0x183b30) or on the row's +0x218 list stays; a Removable (+0xc1 bit
  7) is cleared (0x7a3010); a ValidDistrictPlacement (Features_XP2 +0x28 bit 2,
  `dll_rowmap.py a603f0`) stood on; any other values 0 (0x7a540a). The placement
  test 0x35f2d0 (0x35f6ad..0x35f7b0) alike: the Reef, Oasis, Geothermal Fissure
  refuse (`featureRefusesDistrict`, `canPlaceDistrictIn`, `du` / `du0` / `cw`;
  runs/h1_duely1124 Bologna's Harbor). `keepsFeature` false for a city-state.
- EFFECT_MOUNTAIN_PORTAL (0xf04278, vtable 0xd632c8, slot 0x6b6610): over the ring
  (0x6b1b0, @0xd64018, 0x6c8fb0) neighbours with a route (+0x47) count, a portal
  without one (0x88680) refuses, a mountain (0x4924) must stand; count × K (+0x6d8,
  0x7a2df0) × 0.5 (0x16e7d0) over T..H (0x7a2140) (`portalRoutes` /
  `portal_routes`; runs/h1_duelv1124 Cardiff 12:13 239.34).

## C-100: the plot values' residuals traced — the Farm rows' Food, the Neighbourhood's T, a Campus lump (MEASURED)

- runs/h1_duelv1117 Caguana's Farm rows 15.03 from t51: the record's surplus a Food
  above its plots' (a Farm removed and relaid); the lab reads the record's surplus.
- The Neighbourhood's T: the minors' civic turns for Urbanization
  (runs/h1_duelv1121 Hunza 117 → 3 at t123 against the lab's 271).
- Open (C-100): 1128 Bologna's Campus +7.12 t34-62; 1117 player 4's Theater.

## C-99: the district and improvement events on one plot — the eruption's turns (a LAB, both twins)

Both events read the turn's analysis and may name one plot; Reserve Plot
(0x7f7da0) gives it to the higher value (20.0 margin); the tree tick 0x7ffdd0.
The analysis ends the horizon at the eruption's expected turns (the feature
manager's +0x98, reader unread): `eruptionHazardTurns` / `_minor_eruption_turns`
= 100 over Σ 100 / (N / OccurrencesPerGame), 31.29, beside a volcano.
Confirmed: runs/h1_duelw1121 Antioch t2 (runs/h1_duelv1121's 0.59).

## C-96 / C-60: the defensive cancel — READ (0x5d7640), ported for the city-states and the Free Cities

`defensiveCancel` (cpu/core/aiCityTrees.ts), `minorAiTurn` (cpu/core/minorCityAi.ts),
`freeCityBuild` (cpu/core/minorBuild.ts); `_defensive_cancel`,
`_minor_defensive_cancel`, `_free_defensive_cancel` (gpu/core/sim_minorai.py).

- 0x5d7640 opens 0x5cced0; its gate 0x5cdc50 inline (+0x1b8, 0x5e97d629, +0x218).
- The item in hand: the contract (+0x398), else the head; NOT DEFENSIVE: a unit
  with Combat (+0x48) 0 or Bombard (+0x40) > 0, a building with no
  DefenseModifier (+0x28; the Walls none), a district without HP (+0x58 / +0x5c),
  any project.
- OLD: the contract's value, raised to the head's table value (a combat unit with
  no contract returns; a wonder 0; a district 0x5d4a20; a project 0x5d4c30); an
  empty queue (+0x2350) returns.
- THE BAR: OLD + max(OLD, AI_CURRENT_TASK_BIAS 80 at 0x00f28c80 + 0xc); cancel
  where an ACCEPTED listed contract reaches it, the item is not defensive, the
  plain best building (0x5d0860) reaches it or the defensive best unit (0x5d2600)
  passes it: FAILED, "Canceling current build", production cleared.
- Confirmed: runs/h1_duelw1105 Bandar Brunei t63-69; runs/h1_duelw1103 Hattusa t46.
  Open (C-120): a Free City's cleared progress.

## C-60: the Free Cities Raid — READ (the start 0x274ea0, the record 0x277470, the signals 0x276d90 / 0x276e70 / 0x276ff0, the record's clear in 0x274010), the signal 0x276a40's event unread, ported

`freeRaidSignal`, `freeRaidStart`, `freeRaidCheck`, `freeCitiesMilitary`,
`freeOpNear` (cpu/core/freeOps.ts); `_free_raid_signal`, `_free_raid_plot`,
`_free_raid_start`, `_free_raid_check` (gpu/core/sim_minorai.py), row `FR`.

- THE SIGNALS (connected by 0x2765f0): a combat on a Free City's district
  (0x276d90), its district (0x276e70) or improvement (0x276ff0) pillaged (the
  plot's last unit's owner), 0x276a40; each finds the record (0x277470: +0x0c /
  +0x10 plot, +0x14 live) and calls 0x274ea0.
- THE START 0x274ea0: with +0x24 and +0x20 both −1 — once a life — "Free Cities
  Raid" by name (0x7265b0) at the raided player's first city (+0x12f0, +0x158),
  0x73e7d0 (rally the Free City); +0x24 the tree, +0x20 the player; no enemy (op
  +0x2a0) (runs/h1_duelw1123 t205).
- THE CLEAR: 0x274010 frees +0x24 once its tree is gone.
- THE OPERATION: TARGET_ENEMY_COMBAT_DISTRICT, CITY_ASSAULT, priority 3; "Free
  Cities Assault Force" (UNITAI_COMBAT 2-6, −40); "Free Cities Assault": Recruit,
  Priority [Not [Is City Threatened], Attack Units], Concurrent [Attack Units,
  Move], Concurrent [Pillage, Attack Units, Siege City, Attack City, Pillage, Move].
- Open (C-120): 0x276a40's event; the pillager read as the last unit.

## DLL rules the engines contradict

- The wounded law (0x522630) on a fighting unit: the engines' `woundPenalty`
  rounds 10 − HP/10 (C-110).
- Lifetime culture (0x3a1fb0): the engines' `cultureTotal` / `civ_culture` sum the
  culture yield (C-118).
- The citizen placement (0x197230): the majors' `assignWorkedTiles` scores
  FOCUS_BASE (C-112).
- A move onto a religious unit (0x26fe20) only shares the plot; an embarking move
  takes no civilian (C-111).
- The high-adjacency moment reads only Nan Madol's flat bucket (+0x2f0) and appeal
  rows (+0x458) (C-115).

## C-99: a unit's experience is never spent — LAB on the records, ported

The experience counts from the first, kept through promotions; level L+1 at 15 ×
L(L+1)/2 (runs/h1_duelw1121 2:2883584 at 54 takes no promotion at level 3)
(`xpToNextLevel` / `_xp_to_next`, `takePromotion` / `_take_promotion`). Open: the
flag (+0x1bc0 +8, 0x116f80) and its writer (C-111).

## C-94: the aid request's gate — READ (0x2597d0 over the event tally 0x33b350), both twins

EMERGENCY_TRIGGER_PLAYER_LOSES_POP_TO_RANDOM_EVENT (0x63e0b202), subscribed in
0x25c460 (CAPABILITY_EMERGENCIES 0x370521e0) to GameSignals +0xc48; 0x261ce0 →
0x2597d0(player, a, b, c); the install's requirement sets are empty.

- 0x2597d0: a living full civ (0x484a10, 0x4848c0) with a × 0.5 + b + c ≥
  WORLD_CONGRESS_REQUEST_FOR_AID_DAMAGE_MIN 4 (gp +0x7c4; loader 0x2d58f0 at
  0x2d9870) queues it (0x260760).
- 0x33b350 raises it once per player at the end of ONE event (callers 0x286530,
  0x2867f0, 0x286f80, 0x2d33a0, 0xa1c1a0 / 0xa1c760, 0xa2a4d0) over a per-player
  stack record (0x4c bytes, zeroed 0x3338d0): a = 0x3388e0, b = +0x18, c = 0x339270.
- 0x336a50 adds each landed row's return to the owner's field: +0x0
  IMPROVEMENT_PILLAGED (0x33aba0: 1 per improvement), +0x4 DESTROYED, +0x8 / +0xc
  SPECIFIC_*, +0x10 BUILDING_PILLAGED, +0x14 DISTRICT_PILLAGED, +0x18
  POPULATION_LOSS (0x33a6e0), +0x1c UNIT_KILLED_CIVILIAN (0x33a070), +0x20 / +0x24
  UNIT_DAMAGE_* (0x3366a0: the units KILLED), +0x38 / +0x40 / +0x44 / +0x48 hashes
  0x24424839 / 0xfdf34e62 / 0x94d0056f / 0xb8eaa363. a = +0x0 + +0x4 + 2 × +0x8 +
  +0x10 + +0x14 + +0x2c + +0x3c + +0x44; c = +0x1c + +0x20 + +0x24 + +0x40.
- Confirmed: no SEND_AID in 29 duels (runs/h1_duelw1128 t46) (`aidScope` /
  `_aid_open` + `_aid_close`, `aidDamage` / `_aid_damage`, `AID_DAMAGE_MIN` /
  `_aid_damage_min`, `raiseAidRequest` / `_raise_aid_request`). Open: the queue
  (+0x68) (C-121).

## C-96: CanTrain's obsolescence and the contract purchase's refusal — READ (0x172820's prerequisite block, 0x538460, the callers' sixth argument), ported both twins

- CanTrain 0x172820 (sixth argument [rbp + 0xe8]): PrereqTech (+0x280, 0x4cb2f0 on
  +0x1338) and PrereqCivic (+0x270, 0x39d1f0 on +0x1310) (0x17296d / 0x172995), then
  0x538460 (obsolete; 0x1729be..0x1729ca → 0x1738e2) refuse unless set.
- 0x538460: Mandatory / Obsolete Tech / Civic (+0x240 / +0x238 / +0x250 / +0x248)
  held.
- Clear at 0x5d2600 (0x5d2760), 0x5d2810 (0x5d28ba), 0x5f6050 (0x5f67ec), 0x5ca5a0
  (0x5ca61e), 0x5d4750 (0x5d47be); set only in 0x5ce970's unit loop.
- The purchase (0x68be60 → 0x977570): the price 0x1b22d0 has no CanTrain test; the
  request refuses an obsolete unit (runs/h1_duelu1117 Valletta's Warrior contract
  680 t195-220) (`unitObsoleteIn`, `researchHolds`, `minorCanTrain`,
  `minorPurchaseCity`'s `canPurchase`; `_unit_obsolete_in`, `_minor_can_train`,
  `_MinorFacts.can_train`, `_FreeFacts.can_train`, `_minor_contract_purchases`).

## C-96: the savings' accrual — READ (0x687bf0's slots, remainder and debt), both twins

`savingsTurn` (cpu/core/aiEconomic.ts), `_cv_savings_turn`.

- 0x687bf0 (not barbarian, not human): delta = treasury (+0x13a0 +0xf8) − balance
  (+0x1b8); per slot weight (+0x4b8[i]) / total (+0x458) as float → 24.8, (fx ×
  delta) >> 8 into +0x540[i]; a negative slot (0x688045) cleared, its debt off the
  sum (0x688064).
- PLOTS (slot 2) above 0x9600 (150) to slot 0; no class available (0x2f7eb0,
  0x6882f0 .. 0x688339) GREAT_PEOPLE to slot 0.
- THE REMAINDER (0x68845b..0x68851b): slot 0 += delta − sum.
- THE DEBT (0x6885bd..0x68872b): slot 0 below 0 — treasury ≤ 0 clears all; else
  each slot gives min(slot, owed).
- The balance := the treasury (0x688836, watched +0x160).
- Confirmed: runs/h1_duelu1117 Valletta's Builder 47 at t22 (105.47 over 105);
  runs/h1_duelu1124 Granada's Builder 58 t27.

## C-96: the upgrade trees' deletion — READ (0x7ef850's branches, 0x591000), both twins

`upgradeTreesTick` / `upgradeMayGo` / `unupgradedDeleted` (cpu/core/minorOps.ts),
`_mops_upgrade_trees`.

- Can Delete (r14, 0x7ef8b3): node 3 has no TreeData row: true.
- Per unit: the full test (0x58fff0 r8 0) → 0x68c940; else 0x591000 −1 deletes;
  else ≤ 1 promotion (+0x1bc0, 0x382f0) with > 10 of its type (0x4f2c90 > 0xa)
  deletes. The full test failing: the visible one failing releases (+0x778, 0x570b40)
  and deletes; passing deletes on its own ground (+0x1c = +0x2e0) with 0x591000 −1
  (UNITCOMMAND_DELETE via vt +0x48 / +0x58).
- 0x591000: the upgrade's (0x5909a0) +0x2c8 StrategicResource, −1 none.
- Confirmed: runs/h1_duelu1128 Bologna's eight Scouts gone at t240;
  runs/h1_duelw1128 Hong Kong's units held t144-250.

## C-127: the improvement loop's housing — EFFECT_ADJUST_IMPROVEMENT_HOUSING READ (0x6ad2b0), the growth forecast as the last analysis read it (a LAB fit), the water arm's resource rows, the Mountain Tunnel's analysis rows

- EFFECT_ADJUST_IMPROVEMENT_HOUSING (@0xf03ef8, vtable @0xd62e78, slot 0x6ad2b0): on
  the context city 0x7a3d70(CityBuildAI 0x0a5c20, +0x1788, +0xbc, +0x588, Amount
  +0x08, +0xb4, +0xb8) whole into +0xc0 — FARM_HOUSING_WITH_MAYAB_TRAIT (its
  requirement unregistered) is the Farm's second housing (runs/h1_duelv1117
  Caguana's Farm 18.00 t6) (`_cv_analyze`).
- 0x7a3d70 reads the surplus (0x1b5620) and Housing (0x1b5840) live, the forecast
  CityBuildAI's (+0x6c8 / +0x738 / +0x7a8). THE LOOP (runs/h1_duely1117 Caguana
  657, Builder 1114117 t135-221). LAB: the forecast's inputs as the city AI's last
  turn read them (`CityState.aiGrowthSeen`). Open (C-127): 0x5cb570's caller, the
  residues (runs/h1_duelv1117 Caguana t38).
- THE WATER ARM: the Offshore Oil Rig only on Oil (`validImprovementsIn`, `wtr`;
  runs/h1_duely1124 Granada 613).
- THE MOUNTAIN TUNNEL: runs/h1_duely1124 Cardiff t214-250 m_bestImprovementToMake 46
  with no tree: the Military Engineer's row ("C-100: ... the Mountain Portal's
  analyzer"; runs/h1_duelv1124).

## C-95 / C-99: the Matterhorn's Alpine Training — READ (install), both twins

`grantAlpine` / `alpineChassis` / `terrainMp` (cpu/core/units.ts),
`chassisAbilityCS`; `_alpine_grant`, `_road_terms`, `_tac_step_cost(hill_free)`,
`_chassis_ability_cs(alpine=)`. MATTERHORN_ADJACENT_UNITS_GRANT_ABILITY gives a
land unit beside it ABILITY_ALPINE_TRAINING for good (the combat classes; hills
free, +3 on hills). Confirmed: runs/h1_duely1124 Cardiff's Warrior 196610 (1/1) from
t32, kept through upgrades (`foldAlpine`).

## C-95: the roads' type per plot — READ (Route_Builder, Player_Trade, Trade_Manager, Rules_Movement), both twins

`bestRoadTier` / `layRoad` / `upgradeAllRoads` (cpu/core/eras.ts), `routeApplies`
/ `routeStepMp`; `_row_road_tier` / `_lay_road` / `_upgrade_all_roads`,
`_road_terms`, `_tac_step_cost`.

- The plot's route (+0x47) and era (+0x48; 0x8d14a0 / 0x8cf720); the bridge +0x4d
  bit 4 at placement (0x513120).
- The best route 0x512120: the top valid PlacementValue (0x511700) with its
  owned-tile rule, PrereqEra (0x467eb0, 0x93e9e0), Routes_XP2 PrereqTech,
  BuildOnlyWithUnit only by a unit; + the owner's +0x12e0 rungs (0x6fe50).
- The upgrade 0x5134c0 (only from 0x4d9a70): a new road era upgrades every owned
  routed plot (pillaged stays pillaged).
- A trade route's road (0x554340 from 0x512610).
- The step's route term 0x52fa40: both plots routed, a river crossing (0x531510)
  only both bridging (0x530e80: +0x4d & 6 == 4); the dearer MovementCost.
- Confirmed: runs/h1_duely1128 t146-158 (`ResearchState.roadTier`).

## C-99: a shore crossing's carried Movement — READ (0x26e920, 0x530420, 0x530240), both twins

`search`'s `price` and `walk`; `price6`, `_tac_move_to`.

- 0x26e920's context: +0x18 the TO domain's full Movement ([+0x180 + domain × 4]),
  +0x20 the starting Movement, +0x34 the cost (0x26ee80), +0x38 a carry
  (0x26ee90), stored as node +0x20 (0x26d7f0: +0x28 Movement, +0x2c turns); the
  next step pays it (0x26ed00).
- Embark 0x530420 / disembark 0x530240: MOVEMENT_EMBARK_COST unless FreeEmbark
  (or 0x266510); the excess over the TO pool (0x774c0: +0x20 − +0x18) carried.
- Confirmed: runs/h1_duely1128 t88 Nazca's Horseman 31:6 → 31:5 carrying 2. Open
  (C-99): the zone case with a carry (0x26f980 +0x5c); 1128 Cavalry 35:7.

## C-99: an upgraded unit out of the tactical pass — READ (records), both twins

`upgradeTreesTick` (`passEnd`), `_mops_upgrade_trees` (`done`). An Upgrade Units
upgrade is a new unit after the pass's list was taken: no row that turn (193 / 217
"(no row)" unit-turns). The improvement event starts no tree for a row no Builder
lays (`adjacentRowsOn`, `improvementEvent`; runs/h1_duely1127 Hattusa t220-250).
Open: where in 0x5ccc10 the Tunnel stops (C-127).

## C-95: the pathfinder's Woods waivers — ported (GPU twin)

`_tac_waived` / `_tac_waive_code` / `_tac_cost(waive)` / `_tac_cost_rows`, the twin
of `search`'s `stepCostHeld` through `terrainMp`: bit 1 hills, bit 2 live Woods /
Rainforest lifted in the search, the walk and the shore step.

## C-99: the planning's carry and the embarked pool — explained

The embarked pool rises with EMBARK_MOVE_TECHS (Square Rigging +1, Steam Power +2):
runs/h1_duely1128 city-state 4's Cavalry carries 2 over 3 to t182, none over 5 from
t186.

## C-99: the carry under a zone of control — READ (0x26e920), both twins

0x26f980 (no 0x800, not a turn's start) sets the minimum cost to the starting
Movement; the parent's carry on top (0x26ed00) leaves the step short: a wait
(`price`'s zone branch, `price6`'s `waits`).

## C-99: a unit with no Movement as the city-state's pass opens — none of its

A unit at Movement 0 as the pass opens logs no row (bought at its start:
runs/h1_duely1117 t19 Warrior 393220; upgraded: 1121 t61 Swordsman 1310720) — 199
unit-turns (`cityStateTactics`, `done`). Open: the pass's gather (C-99).

## C-95: the best route's owner term — READ, nothing to port

0x512120's +0x12e0 (0x6fe50) is m_iImprovedRouteLevel, raised by
EFFECT_ADJUST_PLAYER_IMPROVED_ROUTE_LEVEL (Persia's TRAIT_SATRAPIES only): 0 here.

## C-126 / C-99: the purchase list's at-war sums, Garrison City's turn done and Operation Move's movers — READ, both twins

- The at-war sums (+0x2c, 0x79d3a0's second key) count the barbarians (0x469cd0);
  0x5d2810 walks in that order. Confirmed: runs/h1_duely1124 Granada t72 the
  Quadrireme; runs/h1_duely1117 Caguana t111 the Crossbowman (`purchaseEntries`,
  `_minor_purchase_rows`, `seatUnitRows`, `_mops_unit_rows`).
- GARRISON CITY 0x810d30: every taken unit's turn done (0x570b40, dl 1), Movement
  kept; moves ended (0x56d6f0) only for a non-ranged (0x56e3e0, 0x811110) candidate
  moving in, and, with none stronger (0x811133..0x811149), a rangeless (0x56e3d0)
  garrison fortifying (0x95eae0) at +0x98 − +0x94 ≤ 10 (0x810f80..0x810fac); a
  seat unit of class 0 / 3 takes the garrison branch (0x81100a → 0x811129).
- OPERATION MOVE'S MOVERS (0x816cb0 at 0x81705b..0x81706f): live with Movement
  (+0xdb0), done or not; one on the goal skips the barred test (0x817905..0x817921).
  Confirmed: runs/h1_duely1117 Antananarivo t85 Catapult 917509; runs/h1_duely1121
  t31; runs/h1_dueldA1117 t24 (`garrisonExecute`, `endTurn` / `endMoves`,
  `passMoveExec`; `_x_garrison`, `_op_move_exec`).

## C-96: the plot analysis's owner test, Build Unit's pillaged district and a unique's install type — READ (0x5ceba7, 0x7f5112 -> 0x1aec20 / 0x1ad720), both twins

- THE OWNER TEST (0x5ce970, 0x5ceac1..0x5cecc0): +0x5a owned (vt +0x30, +0x1c),
  +0x57 the six-neighbour walk 0x5ceb67; then (0x5ceba7) another owner or city
  (+0xc / +0xf8) clears +0x57 / +0x55, FX(−9999) rows, +0x54 / +0x56, and leaves
  (0x5d023b) (`minorPlotEvals` / `_minor_plot_evals`; runs/h1_duely1124 Cardiff
  10:12 t187).
- BUILD UNIT'S DISTRICT (0x7f4e00, 0x7f510d..0x7f513c, 0x7f5112): held complete
  (0x1aec20 on +0x1a48) and 0x1ad720 false (its type at +0x1308 / +0xf8 / +0x218
  pillaged 0x24c3a0): a pillaged one is not held, its contract repairs it
  (`districtHeld` / `district_held`; runs/h1_duely1128 Nazca t49-149;
  runs/h1_duely1124 Granada's Encampment).
- A UNIQUE'S INSTALL TYPE: `gameTypeOf` names the row read most (BUILDING_STAR_FORT,
  DISTRICT_THEATER, DISTRICT_WATER_ENTERTAINMENT_COMPLEX) (runs/h1_duely1121 Hunza
  contract 423; `_engine_rows`).
- The memory reader's civic goal contracts have owner −1 (runs/h1_duely1117 p4 t25).
- +0x55 (0x5cede6..0x5cee82): +0xe1 bit 4 clear, the verdict 0x5d2ae0 not −1,
  0x406c00, then the plot's own district (0x5cee3f) or 0x35f2d0; a 0.0 value
  stands chosen (0x5d0c20) (`districtOk` / `district_ok`; runs/h1_duely1128 Nazca
  0.0).
- The per-turn world: a switched item keeps its progress (runs/h1_duely1117 Caguana
  t116; `prodRetained`, `repairWait`; runs/h1_duely1127 Muscat t154).

## C-126 / C-128: the outer defences' repair, a city-state's centre and a unit made anew — the repair READ (0x17a680, 0x7b28c0's count), the jump a fit, both twins

- A city-state's centre holds the City Center's 200 HitPoints (runs/h1_duely1124
  Cardiff t86-89) (`CITY_MAX_HP`).
- THE REPAIR'S PRICE (0x17a680, OuterDefenseRepair): +0x1880 (0x197ff0) over
  COMBAT_HEAL_CITY_OUTER_DEFENSES 10 (gp +0x1bc), through 0x5254d0 (runs/h1_duely1124
  Granada t83 2) (`projectCost`, REPAIR_HP_PER_COST, `_repair_price`).
- THE REPAIR'S VALUE (0x7b28c0): +0x1880 × pop × districts × 10.0, discounted
  (runs/h1_duely1124 Granada t127 21971.3) (`minorProjectFacts`' defenceRepairs,
  `_MinorFacts.defence_repairs`).
- THE QUIET TURNS: a city struck at t repairs from t + 4 (runs/h1_duely1124 Cardiff
  86 → 89) (`repairAvailable`, `_repair_available`, `_minor_repair`,
  `History.lastHit`).
- A UNIT MADE ANEW (a levy, its return; a records fit): it keeps its plot unless
  another's district, wonder, ground (a minor's) or unit holds it; else the first
  ring plot (0x69010) passing, revealed, free (runs/h1_duely1117 t74; h1_duely1121
  t56) (`jumpMadeAnew` / `_jump_made_anew`). Open (C-128): 1117 t42 608, 1121 t56
  362.
- The copy keeps the engine's fraction of a floored progress (runs/h1_duely1127
  Hattusa's Trader t40).

## C-99: the pathfinder's later-turn pool, Heal's hull, the tactical list's explorers, Move Unit's planning — READ, both twins

`domainPool` / `search` / `walk`, `heal`, `ownMilitaryAi` / `militaryAiTypeOf` /
`tacticalUnit` (cpu/core/tactical.ts); `upgradeMove`. GPU `_tac_pool`,
`_minor_ai` / `_minor_tactical`, `_minor_pass`, `_free_tactics`, `_mops_upgrade_move`.

- THE POOL (0x2715a0 → 0x56d9f0): per domain (+0x180 + domain × 4) the largest
  base Moves (+0x38), an embarker (0x56c480) on water the embarked pool (game
  +0x510 + player +0x880) unless +0x18c3; +0x194 the largest GetMaxMoves
  (0x56e130) — read only by the start node (0x26eea0); later turns and the carry
  take the pool, none of GetMaxMoves' terms (+0x1920, +0x1300 / 0x3d8510, +0x1924,
  +0x1928, +0x192c). Confirmed: runs/h1_duely1124 t29-55 Heavy Chariot 83; the
  planning lab 1112 → 1230 / 1829.
- HEAL'S MOVES (0x7737c0): a non-sea unit or a hull at home (+0x1c) fortifies
  (0x56ef30 → 0x95eae0) or sleeps (0x9686d0); a hull abroad moves (0x962030) to its
  nearest city only where 0x586360 (flag 0x10) answers 0 (1 takes, 2 an alternate
  within 10, read nonzero at 0x585ba5): it holds (runs/h1_duely1124 Quadrireme
  1048577 t93-126).
- OWN AI TYPE (0x79b9c0) and the selector (0x7710f0): EXPLORE for the explorer
  chassis; kept at EXPLORE+, in no AI system (+0x770), +0xf90 ≤ 0; a Scout only
  while its tribe rampages (0x152d60); +0xf30 held by +0x1278; no Spy; +0x1c70 /
  +0x1c74. A city-state's Scouts go to the homeland (165 / 165 HL: End Turn).
- MOVE UNIT'S PLANNING (0x7eeba0 at 0x7eef84): the danger exception reads the
  pass's planning (+0x1fc0, 0x791300). Open: runs/h1_duely1121 Horseman 786438
  t80-112 (C-99).

## H-1: a minor's repair in the per-turn world — its progress and its locked price (importer), its rest as the step's price

The queue shows a repair's progress with its resumed share against the full price
(runs/h1_duely1124 Granada's Encampment 104 / 107 t165); the importer takes
`minorRepairResumed` off it. A pillaged district's repair is at its locked price
(the buy row 107). Open: done t165 against the game's t166 (C-126).

## C-100 / C-112: a city-state's power and its regional buildings, the citizen reassign's callers — a fit and a reading

- A city-state is never short of power (a fit; runs/h1_duely1124 Cardiff t214
  9.30078125) (`minorPower`, `_minor_power`). Its own regional buildings reach its
  city (`regionalEffects`, `_seat_regional`).
- 0x196320's callers: completions (0x180cb0, 0x181700), the yield setters
  (0x196f90, 0x1970e0), AnnexPlot (0x1a8b70), culture bombs (0x524e30), an
  improvement laid (0xa4cee0, 0xa4e7a0), 0x1956b0 (only from 0x9766c0's plot
  command 5). Open: runs/h1_duely1128 Hong Kong t5 316 → 362 (C-112).

## C-99: Move Unit's update with no Location ends the Upgrade Units trees — READ, both twins

`upgradeArrived` in `upgradeTreesTick`; `_mops_upgrade_trees`.

- 0x7f0020 (no Location, from 0x7f067c): no unit SUCCESS; else each unit with a
  target (+0x830 / +0x834) passes where its planning (+0x1fc0) reaches it this turn
  (0x791300) — a dangerous target (0x716a60) without Movement asked, else with
  Movement (r9b 1); else RUNNING. All passing: SUCCESS, the tree ends. Confirmed:
  runs/h1_duely1128 Bologna tree 5963782 gone at t154.
- Open (C-99): Defend Units' ship release (0x73d1f0) on runs/h1_duely1127 t113-114
  against t66-75.

## C-112: a city-state's citizens re-placed between records — the records' counts, the trigger unread

runs/h1_duely1128 Hong Kong t5 works 362 after the drought on 316 with no trigger
(`minorReplaceCitizens`); of 3,179 unchanged city-turns the engine's re-place moves
a citizen in 196, the record holds it in 88. Open: the trigger (C-112).

## C-96: the promotion class weight's vectors and the event building's pillaged prerequisite — PARTLY READ (AI::Military +0x708 / +0x778), ported (the prerequisite) both twins

- 0x723bb0 reads AI::Military (constructor 0x71a960) +0x708 m_defaultUnitPreferences
  and +0x778 m_modifiedUnitPreferences (by promotion class, 0x4c1cd0): max(default +
  modified, 0.1), 0 at a 0 default. Open (C-96): +0x778's writer (none in
  0x400000..0xc00000 but the constructor, destructor, 0x71d970, 0x723bb0); 1121
  Antioch t150, 1117 Caguana t88.
- The event building's reasons (0x5d0860 flags 0, 0): a pillaged prerequisite
  stands for none (runs/h1_duely1127 Muscat t156) (`minorPickFacts`,
  `reasonsClear`, `event_building`).

## C-112: the citizen manager has no turn of its own — READ (the event's raisers), the records' counts

CityFocusChanged (0xe808a01e) is raised at the yield setters (0x1970e0 at
0x1971e5, 0x196f90 at 0x197095: SET_FOCUS 0x975920 from 0x5cdae0 via 0x975550, the
Lua setters) and at an improvement laid (0xa4cee0 at 0xa4d25b, 0xa4e7a0 at
0xa4ebb3), each beside 0x196320; the cache listeners (Culture 0x108210, Religion
0x11ea50, Techs 0x1259a0, Treasury 0x1295c0) only listen; 0x197230's one caller is
the full reassign. Confirmed: 74 / 99 with a focus row, 56 / 58 old set without;
runs/h1_duely1121 Hunza's "......" rows follow its Builders (`minorReplaceCitizens`).

## C-96: a city-state's City Center projects, Build Unit's pillaged building, the pick's pillaged district and the war footing's writer — READ (0x7f50e9, 0x71fb80 at 0x721158 / 0x72118a), the pick's district test PARTLY (0x170450 at 0x17071d), both twins

- A City Center project runs in the centre (runs/h1_duely1124 Bologna's Manhattan
  Project t214) (`minorProjectOk`, `_MinorFacts.can_produce`, `_minor_queue_ok`).
- 0x170450 at 0x17071d: PrereqDistrict (+0x160) or its replacement (0x408860) in
  +0x1a48 (0x1ae530); held, +0xb08, 0x406c00: reason +0x1c cleared, then 0x1ad720
  (+0x2a), 0x1aeff0 (+0x2b), 0x1af120 (+0x29); a held pillaged building (0x18e9f0,
  0x18fe60 at 0x17082b) via +0x218 and 0x1af250.
- THE WAR FOOTING +0x4b8 (+0x460, setter 0x29fdf0, +0x58): only 0x71fb80 — cleared
  at 0x721158, set at 0x72142b behind 0x72118a's IsMajor (0x469db0); a city-state
  skips to 0x721302: always clear.
- BUILD UNIT'S BUILDING (0x7f4e00, 0x7f50e9..0x7f5103): held unpillaged (0x18e9f0,
  0x18fe60) → held (0x7f513c); a pillaged one's contract repairs it; eligibility's
  0x170450 at 0x1707f1..0x170832 alike (`buildingHeld` / `buildingBlocked`,
  `_MinorWorld.building_held` / `building_blocked`; runs/h1_duely1121 Ayutthaya's
  Shipyard contract 649).

## C-99: the city-states' Promotion move on the replay's copy, Garrison City's swap — READ, both twins

`minorPromoted` (cpu/harness/replay.ts), `garrisonExecute` with `swap`
(cpu/core/opsOrders.ts, `swapUnits`); `_x_garrison`, `_mops_swap`.

- The copy stands each unit the pair's promote order raised as before it, so the
  pass's Promotion move takes it (runs/h1_duely1124 t52 Warrior 131073).
- THE SWAP (0x810d30 at 0x8111d2..0x811323): the stronger candidate's turn done
  (0x570b40), to its planning's plot beside the city (0x791300, 0x962030), then
  SWAP_UNITS (0x972880; 0x972540) onto it, moves ended (0x56d6f0); the AI types
  swapped (0x1e60f0 on +0x168; unported).

## C-108: a trade route's term and its end — READ (the MakeTradeRoute operation's check, the term), both twins

Unit_Operations_MakeTradeRoute 0x960f40 (FinalRelease 0x66bf70) and Trade_Manager
0x552bc0 (FinalRelease 0x38f720).

- 0x960f40: the route's cities (0x57580); the route held (0x553210) and the Trader
  on its origin (+0x220 / +0x224): the game turn (+0x110) at or past 0x552bc0(start
  +0x20) removes it (0x5521f0). Away from home it runs on.
- 0x552bc0(start) = start + 0x5254d0(TRADE_ROUTE_TURN_DURATION_BASE, gp +0x714) +
  0x5254d0(the GAME era's (0x2c3660 +0x108) Eras_XP2 TradeRouteMinimumEndTurnChange
  +0x30, present +0x2c) at the check; at least start + 1. Online 10 + 0 / 0 / 5 / 5 /
  10 / 10 / 10 / 15 / 15.
- Confirmed: runs/h1_duely1127 Hattusa's routes end t100, t124, t148 / t114, t144
  (`tradeRouteMinDuration` / `_trade_min_duration`, `tradeRouteExpiry` /
  `_expire_seat_routes`).

## C-96: the project value's weapon test, CanConstruct's district gates and Nazca's early turns — READ (0x7b2aee -> +0x148, 0xa99160; 0x170450's exit 0x17143f, 0x406c00 / +0xb08), a fit for the rest, both twins

- THE WEAPON TEST (0x7b28c0 at 0x7b2aee): +0x148, the PrereqResource reference
  0xa99160 writes (the Devices, not Operation Ivy) (`AiProjectRow.prereqResource`,
  tools/install/ai_tables.py, `projectValue`, `_cv_project`, `techUnlocks`;
  runs/h1_duelv1124 Bologna's Manhattan Project t204-234 exact).
- THE BUILD TURNS 0x17b890: Production × 0x17a8c0 (+0x2f0 named by 0x186460 ×
  0x178c50) × (1 + pct).
- CanConstruct's result (exit 0x17143f): [rsi] (set 0x1705c2) and +0x18 clear, +0x1
  refuses; the district test at 0x17071d needs +0xb08 and 0x406c00 (+0x430), then
  0x1ad720 (+0x2a); the pick 0x5d0860 checks it with [rbp+0x40]. A pillaged Holy
  Site's Shrine is refused at the pick (runs/h1_duely1128 Nazca t32 Horseman 33.68
  over 60.34; runs/h1_duelv1128 t26-31).
- NAZCA t32: not under threat (+0x218 unmet, footing clear); the Horseman queued
  on the turns the queue takes it (ResourceCost 20 Horses). Open (C-96): the stock.

## C-99: the Upgrade Units trees start on a technology gained alone — FIT (records), both twins

`minorTurn`'s trigger (`upgradeTrigger`); `_minor_turn`'s `mops_upg_trig`.
TRIGGER_TECH_UPGRADE (AI_EVENT_GAIN_TECH) and TRIGGER_CIVIC_UPGRADE; a tech gained
starts a tree on 1042 / 1061 minor-turns, a civic alone 68 / 446 (runs/h1_duely1124
t84; runs/h1_duely1128 t139). Open (C-99): the civic dispatch (0x800c60); the Heal
entry (runs/h1_duely1124 t53, flags 0x311).

## C-98: a goal contract the research or culture AI holds — the end looks' holders read, both twins and the import

The research and culture AIs hold a goal contract while accepted or in progress,
past its tree, and drop it on their turn once neither (runs/h1_duely1121 p2 contract
8 Masonry FAILED at t8, gone t9); a tree's end CANCELS its open Tech Contracts
(p4 contract 60 t33); a Civic Contract stays ACCEPTED (runs/h1_duely1117
Antananarivo 65). The value skips FAILED / CANCELLED ones (Masonry 142.0 t9)
(`AiContract.goalHeld` / `c_goal_held`, `goalsReached` / `goals_reached`,
`minorTechContracts` / `minorCivicContracts`, `_rai_contracts` / `_cai_contracts`).

## C-96 / C-129: a city-state's unit production table counts the records its look's ageing keeps, none its sightings add — the aimem sites read, both twins

The city AI turn's table (0x7989e0) counts the records the tactical turn's ageing
keeps, before the look's sightings (0x785f30: ageing, then 0x7877e0): runs/h1_duely1121
p2 Hunza t9 Warrior 3 / (2 × 1.0 + 1 × 1.2) = 0.9375, 10.1 over the Walls;
runs/h1_duely1128 Hong Kong t106, Bologna t109 (`CityState.armyCounted`,
`minorKnownUnits`; `_cv_counted`, `citystate_kb_seq`, `_cv_known`).

## C-96: a unit's strategic cost through the game speed, the pick's pillaged district and the queue's pillaged project — READ (0x17c2e0, 0x4f2cc0, 0x4f2df0 / 0x4f31f0), a fit for the project, both twins

- THE COST (0x17c2e0): a Units_XP2 (+0x198) StrategicResource (+0x1a0) unit's
  0x4f2cc0(+0x12e8, unit, formation) — the array +0x430 (vector +0x3d8, count
  +0x440), × 2 Corps, × 3 Army — less +0x390[unit] and +0x3b0[unit], at least 1.
  0x4f2df0 / 0x4f31f0 (from 0x4f2f40) fill it with 0x5254d0(Units_XP2 +0x20
  ResourceCost; reader 0xad41e0, +0x24 the maintenance): online 20 → 10.
  Confirmed: runs/h1_duely1128 Nazca's Equestrian Orders 25.0 / 50.0 t31-33
  (`unitBaseResourceCost`, `resCost`). Open: the floor before the formation
  multiple (C-128).
- THE PICK'S PILLAGED DISTRICT: refused at 0x17071d (0x1ad720); a held pillaged
  building let through (runs/h1_duely1117 Valletta t134-141) (`pickDistrictPillaged`
  / `_pick_district_pillaged`).
- THE QUEUE'S PILLAGED PROJECT (a fit): the pick lets it through, the queue refuses
  (runs/h1_duely1128 Nazca t26-35 Prayers) (`minorQueueOk` / `_minor_queue_ok`).
  Open: CanProduce (C-96).

## C-99: the Upgrade Units trigger counts the technologies completed — both twins and the replay's copy

`minorResearchBank` returns its technology and civic completions apart, `minorEconomy` the technologies, `minorTurn`'s `upgradeTrigger` (cpu/core/minorBuild.ts); `_minor_research_bank` / `_minor_economy` / `mops_upg_trig` (gpu/core/sim_minors.py). The replay's copy (`minorAi`, cpu/harness/replay.ts) also raises the trigger for a technology record t+1 holds that the start left the city-state short of: there the start's completion is the record's, not the bank's.
- Confirmed: runs/h1_duely1128 Bologna t154-155, the game's new trees hold its four units (no tactical row; 2228224 444 -> 357, 1179650 on 399); the copy's plots now 3 of 4 the record's, where its units wandered.
- Open: the game's AI memory names no tree member at the log site those turns, so the score reads the rows "(no row)" against ours "Upgrade Units".
- Open: City Defense's recruits, runs/h1_duely1121 t31 city-state 2. The recruit rule matches; the operation's enemy strength does not (the game's "Enemy Str: 30 / 25.0", ours 55: the knowledge base's Quadrireme within 3 of 11:5 a turn early, C-129), so ours recruits a fourth Warrior, 589826.

## C-127: a Trader keeps none of its player's units out — ported (0x585eb0 -> 0x585d90), both twins

- The stacking test of a unit's walk (0x585d90) counts no unit with
  MakeTradeRoute (Units +0x1b9 bit 64) or Spy (+0x1ba bit 2): a Builder ends
  on its player's Trader's plot. Ported: `stackedAt` (cpu/core/tactical.ts),
  `_tac_move_to`'s own-civilian test (gpu/core/sim_tactics.py).
- CONFIRMED: runs/h1_duely1124 Cardiff's Farm on 582 (10:13) under its
  Trader, laid t95 and t113 as recorded (both missed before).
- Open: the stacking classes themselves (vtable +0xb8) unread; the engines
  keep the domain (military / civilian / support).

## C-96: the unit value's Maintenance at the player's Gold weight — READ (0x7b62c0 at 0x7b729e..0x7b72de), both twins

- Below handicap 3 the unit value takes max(Maintenance (+0x5c) - the
  treasury's +0x338, 0) as Gold through yieldValue 0x7a6690 with the player
  (r9 = the player, 0x7b72ae): the player's Gold weight, the Economic AI's
  gold boost in it — not the unweighted DefaultValue (0.5 a Maintenance only
  while the boost is 0). Ported (`unitValue`, `_cv_unit`: `yieldValue(f.view,
  f.seat, ...)` / `f.yield_w("YIELD_GOLD")`).
- CONFIRMED: runs/h1_duely1121 Antioch (aimem, one-seed trace t146-t172):
  the Field Cannon's table 2.785 on the game's records less 5 Maintenance
  at 5.80 / 8.28 goes negative, the game's Scout at 0.0 picked t151, t152,
  t156, t162, t167, t169, t170 as recorded (the opposition sum 0x5eb650 on
  the counted records equals the game's: the records match its tactical
  site). Open: the treasury's +0x338 (held 0); the cityBuildLab runs no
  Economic AI, so its tables keep the unboosted weight.

## C-96: the queue's strategic charge, a placed district's resource, the minors' resource turn — READ (0x17c2e0, 0x186460's names), a fit for the district, both twins

- THE CHARGE (City_BuildQueue 0x17c2e0): base (Player_Units +0x430, the
  scaled ResourceCost) x the formation's multiple (0x4f2cc0); a Corps or
  Army less trunc(cost x m_xCorpsArmyDiscount) (+0x390, by unit; MODIFIER_CITY_CORPS_ARMY_ADJUST_DISCOUNT's
  25 — Military Academy, Seaport, Ikanda); less round(cost x
  m_xStrategicResourceRequirementModifier) (+0x3b0;
  MODIFIER_CITY_ADJUST_STRATEGIC_RESOURCE_REQUIREMENT_MODIFIER, Black
  Marketeer's 80); at least 1, last. The names are 0x186460's dump. Both
  twins: `formationResourceCost` / `_formation_res_cost`
  (`unitBaseResourceCost`, `resCost` the base, 0 for a fuel unit). No
  recording trains a formation or holds Black Marketeer.
- THE QUEUE PROCESS where the queue changed (0x178250, +0x3ac) runs the
  front check as an item is taken: a fresh unit short of its cost leaves at
  once (runs/h1_duely1128 Nazca t41: its Horseman picked at 51.7 on no
  Horses, the record's queue empty at t42). Both twins: `minorSetItem` /
  `_minor_set_item`.
- A DISTRICT PLACED on a resource extracts it, complete or not, unpillaged
  (a fit; 0x811b0 reads +0xb08 for 0x4aa8e0, its meaning open):
  runs/h1_duely1128 Nazca's Holy Site on Horses, placed t14, complete t16 —
  Equestrian Orders 7.0 ... 25.0 t16-t31 to the turn (ours two accruals
  short before). `extractsResource` / `_res_extracting`, every player's.
- A MINOR'S RESOURCE TURN after its city's turn (DoTurn 0x4e4560 runs the
  cities before the resources), its units' fuel after: `minorPhase` /
  `_city_state_phase`. runs/h1_duelw1121 Hunza's Equestrian Orders still
  every turn as logged (t1-60); 1128 Nazca's Walls (t39-40) and its
  Horsemen (t33, t37) as the record.

## C-129: an operation's enemy strength reads the knowledge base after the tactical look, before a later player's blows — the aimem sites read, the replay's copy

- An operation's enemy strength (0x73eb60 -> 0x5eadb0, records of age at
  most 2 within 3 of the target) reads the records the tactical turn's look
  left: runs/h1_duely1121 t31, city-state 2's City Defense on 11:5 logs
  "Enemy Str: 30 / 25.0" — the barbarian Galley 1572882 on 13:5, absent at
  the aimem tactical site and at age 0 at the log site (the look added it);
  the Galley 1114128 on 9:2 at age 4 not read; the Quadrireme 786443 at
  age 0 on 8:4, four from 11:5. So the operations read later than the city
  AI's unit production table, which counts no record the look adds (the
  section "C-96 / C-129" above).
- A defender's record of its attacker (0x787fb0 -> 0x5f0440, `recordAttacker`)
  lands in the attacker's turn: the Quadrireme strikes city-state 2's
  Warrior from 8:5 in the barbarians' turn of t31, and the t32 tactical
  site holds it on 8:5 at age 0. The engines' order is the game's
  (the barbarians' turn closes the turn the minors acted in). The
  replay's pair applies the record's battles before the minors' turns on
  the copy (`minorAi`): a blow by a later player on a city-state's or the
  Free Cities' unit leaves the defender's knowledge base as it stood, and
  its record of the attacker waits for `lateBlows`, after the copy
  (cpu/harness/replay.ts, the battle case). Both modes on runs/h1_duely1121
  t31: City Defense 30, three recruits, Warrior 589826 wanders as logged.
- runs/h1_duely1121 Hunza t9 (its Quadrireme absent at the tactical site,
  at the log site from the look): the unit production table's
  `armyCounted` already matches, its Warrior contract the game's in both
  modes.

## C-123: Operation Move's danger flags, the MoveTo execution and m_blockedTurns — READ (0x816cb0 at 0x816e70 / 0x817839, 0x962380, 0x73e610), both twins

`passMoveExec`'s `PathDanger` through `moveTo` / `pathTo` / `search`
(cpu/core/tactical.ts; `weak` / `formed` from `operationMove`,
cpu/core/operations/nodes.ts); `_op_move_exec`'s `danger` / `weak` /
`formed` through `_tac_move_to` / `_tac_search` (gpu/core/sim_tactics.py;
the captures' `bcap_str` / `bcap_estr` / `zero`, the minors' `mops_str` /
`mops_estr`), the pass's danger map read on the plots within 2 of the
planning's first turn (`_tac_danger_need`).

- THE ORDER'S DANGER FLAGS (0x816cb0): at 0x816e70..0x816e85 the operation's
  m_opStrength (op +0x4b0, the autovariable at +0x458) against its
  m_targetStrength (+0x510, at +0x4b8): `strong` = op >= target. At
  0x817839..0x8178b1, per mover: not strong, flag 8 for a unit with no
  combat (0x56dc90 0) or one whose formation (+0x1fb8) holds a CIVILIAN
  (0x266950(2), Make Formation's pair); strong, flag 8 for a unit with no
  combat in no formation (+0x738 == 1); flag 0x8000 for a land unit (+0x650
  2) whose formation holds no NAVAL member (0x266950(3)). The path validity
  (0x2720a0 at 0x272590..0x272612, `[rbp+0x2c]` the parent's turn against
  1): under flag 8 (or the finder's +0x1f7 byte, unread) a child of danger
  (the player's influence map +0x12d8, 0x716a90 above 0) is refused from a
  parent of turn 1 or less; under 0x8000 a water child of danger likewise.
  So a weak operation's escorted civilian and its escort take no first-turn
  step onto danger, and with no such path stay.
- CONFIRMED (the strengths at the aimem tactical site, the game's AI_Operation
  rows): runs/h1_duely1121 Builder Capture 983046 (Builder 4522014, Line
  Infantry 4128797 on 9:12, every plot beside it on the barbarians' danger
  map): t158-t160 strength 62 / 65 / 64 below 66, "Operation Move ... 9:12,
  4:19, 9:12" — the engines hold both; t161 (64 to 86) a path free of danger
  opens and both step to 8:13; t162 (63 to 51) the Line Infantry steps to
  8:12; t164 (63 to 55) 7:13 -> 6:15; t170-t173 (60-62 below 67-83) the
  team on 5:16 holds — each as recorded.
- THE MOVETO EXECUTION (0x962380, Unit_Operations_MoveTo.cpp): a request of
  this turn (+0x20) cancels the formation's other members' operations; the
  formation's path 0x2726b0: the unit's own plot 0; a visible goal (the
  player's visibility count, 0x20a3c0) where a member may not be placed
  (0x586900 -> 0x586360, flags 0) 0; else the A* (0x272aa0 -> 0x26ef40), its
  goal node's (+0x638 [0]) turns the answer. None: the order done, no move.
  The first step (0x266690: the node before the start, the path stored goal
  first) reached this turn (+4 at most 1): under the attack flag 0x10 the
  battle (0x211f80, 0x1fbae0); else a visible defender at war or a hostile
  district with defence unpillaged there (0x209e30) ends the order unmoved.
  Then a unit not of the air (+0x650 != 1) whose formation moved into a zone
  of control this turn (m_bHasMovedIntoZOC, formation +0x518, the
  autovariable +0x4c0: set by the move 0x26fe20 from 0x26f980 on its new
  plot, cleared each turn by Player_Units' DoTurn 0x4e4560 -> 0x2673f0)
  waits (+0x11), else it moves (0x26fe20). Ended (+0x10), a unit whose plot
  is not valid for it (0x585d90 over the stacking limit, or 0x586360) is
  placed (0x586d40 flag 1) at the order's stored plot (+8; its setters
  unread).
- M_BLOCKEDTURNS (op +0x378, the autovariable +0x320): written only by the
  backup's naming 0x73e610 — 0 where the target stays valid (0x73abf0 with
  1), else one more — and read by 0x73abf0 (at 3 the target is invalid); the
  start (0x73a120) sets it 0. runs/h1_duely1121 983046 holds 1 from its t156
  Change Target (INVALID, the backup 3:19) on: it gates no move.
- OPEN: the finder's +0x1f7 byte's setters; 0x962380's visible-goal and
  first-step tests and the zone-of-control wait are not in the engines (no
  recorded case named); runs/h1_duely1128 t171 (strong, 0 to 0) 9:3 -> 9:4
  for 14:16, the engines' 10:3: a path choice, not these flags.

## C-99: Move Unit's path flags 0x2 / 0x8 — READ (0x2720a0, 0x716080), both twins

One path test for both move orders: `PathDanger` (its `war`, flag 2) and
`moveUnitDanger` through `moveTo` / `pathTo` / `search` (cpu/core/tactical.ts),
from `upgradeMove` (cpu/core/minorOps.ts), the city trees' move order
(cpu/core/minorCityAi.ts) and the scout tree's Move Unit (cpu/core/barbarianOps.ts);
`_move_unit_danger` and the danger tuple's fourth member through `_tac_move_to`
/ `_tac_search` (gpu/core/sim_tactics.py), from `_mops_upgrade_move`
(sim_minorops.py), the city trees' `order` (sim_minorai.py), the scout's Move
Unit (sim_barbops.py). Operation Move's flags (the section "C-123: Operation
Move's danger flags ...") set no flag 2.

- MOVE UNIT'S EXECUTION (0x7eeba0) orders its swap and its move with the
  flags 0x100a, 0x1000 where the node's Allow Danger holds (no data: true;
  BehaviorTrees.xml TreeData sets it false on the Upgrade Units tree's node
  4 and the city trees' Move Units, true on Barbarian Found City's), in
  both its branches (the Location's at 0x7eec91, the targets' at
  0x7eee6a). The Location branch takes no move where the plot (its
  planning's within To Range) is on the danger map (0x7eed65).
- THE PATH'S VALIDITY (0x2720a0, the new node rdi, its parent rbp): flag 2
  (0x2724c8) refuses a node whose plot's owner is at war with the path's
  player (0x3dcec0 on the owner's diplomacy +0x1300); flag 8 refuses a node
  of danger from a parent of turn 1 or less, as read for Operation Move.
- THE DANGER MAP'S OWN DISTRICTS (0x717c85..0x717dc6, the lambda 0x716080):
  a district with a defence above 0 sets its plot to 0; each plot within its
  strike but its own, above 0, goes down by the strike to 1 at least — as
  `dangerPlane` holds it.
- CONFIRMED: runs/h1_duely1121 city-state 2's Horseman 786438 on 8:6, in an
  Upgrade Units tree from t74 (aimem `assigned`), its six neighbours on the
  danger map (25 to 85): it holds every turn where the engines walked it
  into its free centre 11:5 (t78, t80-89 ...); runs/h1_duely1124 t91
  city-state 4's Catapult 786437 goes round 427 (danger 32) onto 426 as
  recorded.
- OPEN: runs/h1_duely1124 t92 city-state 3's Catapult 1245186 on 743 walks
  743 -> 699 -> 656 in the game, 699 at 25 on the engines' danger map (the
  barbarian Archer 3801089 on 38:18, 76 damage, seen at age 0): the engines
  find no path. The Archer's danger there (its reach, its health) unread.

## C-127: a city-state's roads re-laid at its research step

- The era handler 0x4d9a70 -> 0x5134c0 re-lays a player's road plots when
  its era brings a new road. A city-state's era comes at its research step
  (`minorEconomy` / `_minor_economy`), and its roads take the new type there,
  before its units move: `upgradeRoads` (cpu/core/eras.ts) called from
  `minorPhase` (cpu/core/minorBuild.ts) right after the economy, the GPU's
  `_upgrade_roads(row)` (gpu/core/sim_seats.py) from `_city_state_phase`.
  The turn's change (`upgradeAllRoads` / `_upgrade_all_roads`) still
  upgrades the majors and the Free Cities. The replay's copy of the minors'
  units' turn keeps a city-state's re-laid tier above the first record's.
- Confirmed: runs/h1_duely1128 Hong Kong t156. Scientific Theory and The
  Enlightenment bring its Industrial era. Its new Builder 2621440 goes
  9:7 -> 9:8 -> 9:9: the road step at 0.75, then the plain step at 1.0,
  leaves it 0.25 Movement, and it lays the Farm on 405 that turn. With
  Medieval roads it would arrive with none. Record t157 holds the roads
  Industrial; the t157 trip back ends at 0.25 Movement, as recorded.
- Open: a major's era. China's Industrial era at its t145 start leaves the
  minors' planning that turn on Medieval roads. That would fit an immediate
  upgrade only if the minors read China's plots through their own revealed
  route types, which neither twin models. So the majors stay at the turn's
  change.

## C-130: the Economic AI's Gold boost on the treasury's banked net income — READ (0x4e08f0, PlayerTreasury +0x1b8), both twins

`economicGoldBoost` (cpu/core/aiWeights.ts) on `CityState.netIncome`
(written in `minorEconomy`, cpu/core/minorBuild.ts); `_gold_boost_of`
(gpu/core/sim_cityvalue.py) on `citystate_net_income` (written in
`_minor_economy`, gpu/core/sim_minors.py).

- The player's treasury (player +0x13a0) holds its named members at
  descriptor + 0x58: m_xGoldBalance +0xa0 (data +0xf8), m_xGoldRateChange
  +0x100 (+0x158), m_xCachedNetIncome +0x160 (+0x1b8), m_xGoldInterestPercent
  +0x1c0, m_xCachedNetIncomeExcludingTrade +0x220 (+0x278) — the aimem
  dump's PlayerTreasury names and the setter 0x731d10's targets agree.
- +0x1b8's writers: the reset 0x4e11b0 (0), the load 0x4dcd20, and the
  treasury's turn 0x4e08f0, the first call of the player's DoTurn 0x4e4560
  (0x4e45ee), before the culture, the resources and the cities' turns:
  +0x1b8 = GetGoldYield (0x4ddc70 -> GameAttribute::Value) less 0x4dd3b0's
  sum less the total Maintenance (0x4df2d0); then 0x4deb70 stores the
  income excluding trade (+0x278) and 0x4e02e0 banks +0x1b8 into the
  balance; a balance below 0 runs the shortfall (0x4dd270, 0x4e1300).
- So the Economic AI's turn (0x687bf0 at 0x687d46) reads the net income the
  same turn's gold step banked, not a live yield. Ported: the minor's gold
  step stores the city's Gold less its units' Maintenance as it banks it,
  and its savings turn's boost is -0.2 x that while negative. The Free
  Cities and the majors keep the live gold per turn.
- CONFIRMED (aimem, one-seed traces): runs/h1_duely1121 Hunza t73-t92, the
  stat (mem PlayerTreasury m_xCachedNetIncome) equals the engine's banked
  net on every turn but t85 (below); its Civil Prestige / Retainers /
  Caravansaries rows at t79 / t84 / t87 / t88 as logged. The stat's Gold
  holds the city's district-project conversion (Hunza's project 11, 2.85
  Gold at t72): the importer now carries a minor's `projectYield` from the
  record before, as a major's. runs/h1_duely1124 p4 t225 Builder bought as
  recorded, aimem and carried.
- With it: a route's Trader takes its first plot the turn the route starts
  (every route's first record holds its Trader a plot from its origin:
  runs/h1_duely1121 Hunza 275 from 231 at t48 / t68 / t88, China 405 / 448
  from 449), `commitRoute`'s `tradeRouteStep` / `_trade_first_step`; so the
  Trader is home and its route ends the turn the game's ends, the next gold
  step banks no route Gold, and the next route's pick reads that boost:
  runs/h1_duely1121 Hunza t88 Taiyuan, runs/h1_duely1127 Mexico City t150
  Hattusa, as recorded.
- Open: 0x4dd3b0's sum (city GetYield 0x1cb8b0 terms, read as 0 for a
  city-state); a district project that starts on a record's 0 progress takes
  an overflow no record holds (1121 Hunza t85: the stat -1.73, the
  importer's -4.40).

## C-127 / C-100: a building's value carries its dependents' (0x5cadc0) — READ, live-confirmed

- After the plot analysis job fills the centre's buildings table, the city
  update's 0x5cadc0 (its walk 0x5cb10d..0x5cb2ea; FinalRelease 0x3dfee0,
  the walk FinalRelease 0x3e0170..0x3e01ed) walks the Buildings in database
  order: a building B
  that is not a wonder (+0x159 bit 0x10), for each row D of B's +0x198 list
  (the BuildingPrereqs rows whose PrereqBuilding is B, live: Shrine 12 / 13
  / 82 = Temple, Stave Church, Prasat; Temple the nine worship buildings,
  Mahabodhi, Kotoku-in), takes the player's version of D (player +0x12f0
  +0x230 [D], none -> skipped) and, where its value (CityBuildAI +0xd68
  [D']) is above 0, adds it into B's slot (+0xd10 through 0x9034b0
  (FinalRelease 0x72a920), the
  table the PLOT ANALYSIS LOG prints). So a Shrine logs its own value plus
  the Temple's once the Temple values above 0; a FX(-9999) dependent adds
  nothing.
- Live (runs/lb1_bv1128*, seed 1128 replayed, its logs identical to
  runs/h1_duelv1128 at t49-t56): the building value 0x7a7590 (FinalRelease
  0x52b900, `bvlog.py`) returns Nazca's Shrine 27.18 every turn t49-t56 with
  the claimed-plots, modifiers and neighbours terms all 0; the table store
  after 0x7a4d40 (FinalRelease 0x3e3ef3) writes 27.18; a data breakpoint on
  the slot (`hwwatch.py`, t56) caught the one later write, FinalRelease
  0x3e01e2 `add [rax+r15*4], edi`, 27.18 -> 70.43 = + the Temple's 43.25 —
  the log's 32.75 / 42.0 / 42.2 / 51.98 / 66.11 / 70.43 at t51-t56 are
  27.18 + the Temple's 5.57 / 14.82 / 15.02 / 24.8 / 38.93 / 43.25.
- The same function's first loop (0x5caf30..0x5cb0a1) sums, per district,
  the positive values of the buildings whose PrereqDistrict it is (the
  player's version, 0x408860; skipping a building the city holds a +0x1e0
  row of, or one of whose +0x1e0 rows comes earlier in the table), and the
  loop at 0x5cb36b..0x5cb44e adds each district's sum into the positive
  DISTRICTS slots of the plot evaluations (CityBuildAI +0xd80): the
  district value's buildings term. Static only, no live case read.

## C-96: AI::Military's modified unit preferences hold 0 (live) — READ

- The promotion-class weight 0x723bb0 (FinalRelease 0x4cf3b0) reads, in
  FinalRelease's layout, the player's Military (Player +0x680): +0x3e8 the default
  vector's data, +0x3f8 its size (21, the promotion classes), +0x410 the
  modified vector's data, unchecked against a size; max(default +
  modified, 0.1), 0 where the default is 0.
- Live: every player's modified vector reads 0 in all 21 classes at t57
  (seed 1128), t95 (1117) and t93 / t150 / t152 (1121); a data breakpoint
  (`hwwatch.py`) on Caguana's classes 0-5 and the vector's data pointer
  caught no write t1-t95 (1117, covering its t88 and the t92 Trebuchet
  contract, VALUE 22.0 as recorded), and on Antioch's t1-t127 (1121; the
  instance died at t128 under the debugger, the t150 poll ran without it).
  The term is 0 for every seat: the engines' 0 stands, and the Trebuchet /
  Catapult and Field Cannon / Warrior cases lie elsewhere.

## C-130: the government values' parts at Hunza (live) — READ

- `govlog.py` on seed 1121 replayed (its AI_GovtPolicies Political
  Philosophy lines identical to runs/h1_duely1121 t13-t26): the civics AI's
  government values (0x620413 -> 0x7b0330 (FinalRelease 0x52fd20)) and each
  government modifier's whole part (the modifiers' sum 0x7a4b20 (FinalRelease
  0x529ed0)). Hunza (player 2): every modifier term is
  EFFECT_ADJUST_FLAT_BONUS 0x6c5700 (FinalRelease 0x476060, the analyzer
  object's vtable slot 1 the modifier entry's +0 names); the others
  (Autocracy's four non-analysed rows, Oligarchy's EFFECT_GRANT_ABILITY,
  Classical Republic's) add 0. Autocracy's flat bonus 12 / 12 / 16 / 15 /
  15 / 15 / 16 / 18 / 18 / 20 / 20 / 20 / 21 / 21 / 21 / 22 at t11-t26 over
  a pre-modifier 22.86 (t11-14) / 21.35 (t15-19) / 19.65..24.35;
  Oligarchy's 1 at t19-t22 and t26, 0 at t11-t18 and t23-t25, over 24.65 /
  20.80 / 18.25..24.65; Classical Republic 20.50 / 20.70 / 22.0, no
  modifier term; Chiefdom 5.50 / 3.80 / 2.10..5.50.
- The civic value of turn T reads the government values the civics AI
  stored at T - 1: sum max(v - v(Chiefdom), v / 2) over the three
  governments reads 66.52 / 66.46 / 66.46 / 67.46 / 69.46 at t14-t18, and
  Political Philosophy logs 436.1 / 435.1 / 435.0 / 435.0 / 436.0 / 438.0
  at t14-t19: each log step (-1.0 at t15, +1.0 at t18, +2.0 at t19) is the
  sum's step a turn before.

## C-130: Discipline's knowledge records and a levied unit's return

- 0x6bef40 (EFFECT_ADJUST_UNIT_BARBARIAN_COMBAT) and 0x5eb0f0 (the known
  strength, through 0x5ef870) are ported as read in both twins
  (`knownStrength`, `_pol_barbarian_combat`). For each fighting unit
  subject, the plot comes from 0x90290 and the area is the first dword of
  the plot's +8. 0x5eb0f0 runs once per barbarian player (0x483b50
  +0x29f0) and once for the player itself (+0x128), with no region and an
  age limit of 10. It walks DB.Units in order and takes the records of the
  area or of no region (+0x18 / +0x1c). Each record of age (+0xc) 10 or
  less adds max(Combat, RangedCombat). The amount applies only where the
  player's own sum is below the barbarians'.
- A levied unit sent home (`sendLevyHome` / `_minor_levy_return`) is made
  anew under the minor, so every record of it becomes a gone unit's
  (`unitMadeAnew`). The minor's own knowledge base takes the unit at its
  tactical turn's look, not at the return. Before this change both twins
  recorded it at once.
- Confirmed on runs/h1_duely1121 Hunza t56:
  - Its five Warriors come home (UnitAddedToMap after its research step,
    before PlayerTurnActivated).
  - They are absent from its knowledge base at the tactical site
    (seq 4264) and on it at the log (seq 4266).
  - Discipline's own sum is the Horseman's 36, under the barbarians' 85,
    so all six units count: 102 as logged.
  - With the records at the return, ours read 136 (0).
- Also matched: runs/h1_duely1117 p3 t88 Discipline 17 and
  runs/h1_duely1124 p4 t83 Discipline 68 (both 0 before). Divine Right and
  Reformed Church at 1121 t58 now score 414.7, as logged.

## C-99: a unit bought in the turn sits out the operations, a Harbor trains ships — the recruit's turn-done offer READ (0x60a8c0, 0x60a440), 0x1c77c0's district arm READ, the candidates' own strength a FIT, both twins

`minorEnv` (`army`, `held`), `freeCitiesMilitary`, `evaluate`
(TARGET_NAVAL_SUPERIORITY), `AiView.cityTrainsSea`; `_mops_army_near`,
`_u_recruit`, `_mops_naval_target`.

- THE RECRUIT'S OFFER (0x60a8c0: unassigned +0x7d0, turn not done +0x530):
  a unit made in the AI's turn has its turn done at creation (the handler
  0x60a440 on player signal +0x60 sets 0x570b40); in the engines a unit the
  minor buys stands at Movement 0, in the pass's `done`. Recruit Units and
  Find Available Unit offer no unit of `done` (a city-state's and the Free
  Cities' `held`; the GPU's `_u_recruit` off `view["done"]`):
  runs/h1_duely1124 t72 city-state 3's City Defense recruits none, its Heavy
  Chariot bought that turn, and completes; t73 it takes the Chariot.
- THE CANDIDATES' OWN STRENGTH (0x746920 -> 0x5eadb0 within 10 of the rally)
  counts no unit at Movement 0: runs/h1_duely1117 t69 city-state 4's Heavy
  Chariot 589825 bought (contract 177), its Attack Barb Camp at 35:6 not a
  candidate until t70 (Started, the Chariot recruited). A FIT: the reading's
  0x5eadb0 walks the knowledge base, whose own record of a purchase the
  aimem sites show only at the end look (1117 t14 / t19 / t59 / t69 / t102:
  the bought unit absent at the log site); the engines keep their own live
  units and drop those at Movement 0.
- TARGET_NAVAL_SUPERIORITY (0x747230 over 0x1c77c0 for the sea): a city
  trains ships where a district of its trains the domain (0x1aed10 over the
  city's districts +0x1a48, DB.Districts) — a completed Harbor — else its
  centre's plot is coastal (vt +0x40, 0x81230). runs/h1_duely1121 Hunza on
  inland 11:5: its Harbor completes at t218 (City_BuildQueue 184.2 / 165)
  and Naval Superiority starts at 12:3 that turn, as logged; never before.
- OPEN: 0x1aed10's completion test read off the case (a placed Harbor
  t215-217 starts none); the Harbor's replacements (no recording holds one).
  runs/h1_duely1128 t148 Bologna's City Defense (threat 1 from player 1): the
  Trebuchet 65 alone short of D + 20 at t147, so D > 45, and at t148 the new
  Courser (46) must count (above D - 5), so D < 51; the engines' D is 51
  (35 + the Palace 3 + two walls 6 + seven envoys 7): one term of 0x24ae80
  over the city-state's centre unread.

## C-129: a city-state's contract purchases come after its knowledge base's look — the job order READ (0x6096c0), the birth record's timing off the aimem sites, both twins

`minorContractPurchases` (after `minorKnowledge(…, true)` in `minorPhase`),
`CityState.armyCounted`; `_minor_contract_purchases` after `_minor_knowledge`
in the minors' phase, `_cv_known(s, before, after)`.

- THE ORDER: the player AI's turn (0x6096c0) registers the tactical
  knowledge step 0x785f30 (the ageing and the look 0x7877e0, the aimem
  `tactical` / `log` sites) in its first job group (0x60b4c0) and the
  economic AI's turn 0x687bf0 (the savings, then the contract purchases
  0x5f3c40's walk) in the next (0x60e8c0). A unit the purchase makes is
  recorded at once (player signal +0xc0 -> 0x7874a0), so its own record
  stands at the end look, never at the log: runs/h1_duely1117 city-state 3's
  t19 Warrior 393220, 2's t59 Archer 655365, 4's t69 Heavy Chariot 589825,
  3's t102 Crossbowman 1245186; runs/h1_duely1124 3's t72 Heavy Chariot
  (each absent at the log site, at age 0 at the end look). The engines buy
  after the look: knowledge.army now matches on each of those turns (1117
  t19 / t22 / t48 / t59 / t62 / t69 / t73 / t102, 1124 t18 / t27 / t40 /
  t56 / t72, 1127 t22 / t30 / t46, 1128 t25 / t77).
- The operations' candidates are weighed before the look (`minorMilitaryTurn`,
  the camps' evidence of "C-97: the operations"), so before the purchases:
  a unit bought that turn is no candidate's own strength (1117 t69 Attack
  Barb Camp from t70, as logged), with no Movement test.
- The unit production table (`armyCounted`) keeps the records the ageing
  kept and those the purchases add; none the look's sightings add.
- OPEN: where the military AI's turn (0x722690, registered after the
  economic AI) reads its camps and own units from; the purchases' records
  in the city AI's table read off no case.

## C-126 / C-130: who may plunder a route (0x9555a0) and the treasury turn's city term (0x4dd3b0) — READ, the plunder ported in both twins

`canPlunder` / `routePlunderer` (cpu/core/trade.ts); `_trade_walk_tick`'s
`raider_seat` (gpu/core/sim_seats.py).

- The Plunder Trade Route command's can-do (0x9555a0,
  Unit_Commands_PlunderTradeRoute.cpp): a unit with movement left (0x56c690),
  a Combat (0x56dc90), Ranged (0x56e3e0) or Bombard (0x56daa0) strength
  above 0, unit +0x650 not 1, not embarked (0x8be30), then the plot's route
  tests. Ported: a raider on the walker's plot is a unit with a Combat,
  Ranged or Bombard strength that is not embarked; a civilian, a support
  unit or a passenger never plunders.
- CONFIRMED: runs/h1_duely1124 Bologna's Trader 655362 on 431 at t205-t206
  beside the barbarians' captured Builder 5111833, its route to Shenyang
  ending t209 as logged; the engine had plundered it at t205, its gold step
  then short the route's Gold through t210. Now the engine's banked net
  equals the record's m_xCachedNetIncome t204-t214 (-3.44 / -1.44 / -3.44 /
  -3.44 / 7.56 / 5.56 / 5.56 / 0 / 10.77) and Bologna's t225 and t240
  Builders are bought as recorded (aimem and carried).
- 0x4dd3b0 (the treasury turn's second term): over the player's cities
  (Player_Cities +0x12f0 +0xd8), a city whose int +0x1724 is above 0 gives
  min(+0x1724, its Gold yield's whole part) (City::GetYield 0x1cb8b0, the
  whole Gold where it is the smaller), summed as 24.8 and taken off the net
  income; the taken amount is subtracted from the city's +0x1630 block's
  +0x9c. No instruction writes +0x1724 by displacement (its writer unread).
  For a city-state it reads 0: over the five duely duels the stat equals
  the record before's Gold yield less Maintenance on 3,635 of 3,698 minor
  turns; of the 63 others one is a whole Gold short (1124 t93 player 2, its
  Gold yield itself 15 -> 14 in m_xCachedNetIncomeExcludingTrade), the rest
  fractions or gains (a change between the record and the treasury turn).
  The engines take no term.

## C-123: Protect Units' plunder at the barbarians' turn open and Operation Move's formation bar — READ (0x80d790 at 0x80de60..0x80e7dc, 0x816cb0 at 0x81794d..0x817985 -> 0x585eb0), both twins and the replay's copy

`passDefend` / `hurt` (cpu/core/opsOrders.ts), `_bop_defend_exec`
(gpu/core/sim_barbops.py); `moveBarred`'s `mates` through `passMoveExec`
(cpu/core/tactical.ts, from `operationMove`'s formation, cpu/core/operations/
nodes.ts), `_op_move_exec`'s `stacks` and `_tac_own_class`
(gpu/core/sim_tactics.py); `barbarianAi`'s damage at the turn's open
(cpu/harness/replay.ts).

- PROTECT UNITS' SECOND PASS (0x80d790 at 0x80de60..0x80ebfc): over every
  member of each team (+0x18, not the endangered list): alive (+0x770), with
  Movement (+0xdb0), on a plot, outside Protect Outside Range of the target;
  then hurt — damage +0xcf0 at least maxHP x AutoProtect Percentage x 0.01
  (`setae` at 0x80df44; the node's data, 33 where the tree gives none: no
  TreeData row for "Escort Worker To Camp" node 5) — or a land unit afloat
  in danger outside a naval formation; any other member is skipped. The hurt
  take the promotion, the bombard stop, the ship release, the afloat move,
  then with Movement the pillage order 0x963190 where the district's
  (0x51a080) or improvement's (0x51a160) plunder is above 0 ("Plunder %d
  %d"), then a barbarian's orders end (0x469ce0). The test reads the damage
  the unit holds as the barbarians' turn opens: the blows of the players
  before them in the turn landed (the game runs the players in order, the
  barbarians last), its own pillage heal not.
- CONFIRMED (the action log's UnitDamageChanged before the barbarians'
  PlayerTurnActivated): runs/h1_duely1121 t157 Line Infantry 4128797 on 9:12
  at 38 (China's centre's strike 31 -> 38, seq 59110, before the
  barbarians' turn at 59219) logs "Plunder 9 12", healed to 0 (59247); t168
  / t169 Line Infantry 4456462 on 6:10 at 39 / 45 logs "Plunder 6 10"; t167
  at 32 none. The replay's copy (`barbarianAi`) sets each unit it maps to the
  log's last damage before that open, else the pair's first record's.
- THE FORMATION BAR (0x816cb0 at 0x81794d..0x817985): the goal is barred to a
  member off it where 0x586360 (flags 0x40) refuses it, a unit at war holds
  it (0x5862e0), or 0x585eb0 on the unit's formation (+0x1fb8) is above 0 —
  the most own units stacking (0x585d90) over the formation's members
  (+0x728, count +0x738); barred, the radius is at least 1. So an escorted
  civilian is barred from a camp its tribe's defender holds.
- CONFIRMED: runs/h1_duely1121 t157-t173 the Settler teams' Settler (4325384,
  4390925) logs the escort's ring plot (4:19 / 4:18 beside the camp 3:19,
  the Spearman 1376265 on it) where the engines took 3:19, and the 6:10
  team's Settler 4587543 logs 4:18 (t167-t173).
- OPEN: runs/h1_duely1121 t169 the 5:17 team steps 5:17 -> 5:18 for 4:18
  over plots our danger map holds at 0 (the game holds); t172 it steps to
  6:18 on a later-turn path past 5:18's danger 20 (the game holds); t159
  the 7:19 team ends on 6:19 for 4:19 where the game's ends on 6:18, and
  runs/h1_duely1128 t171 / t173 the capture team steps 9:3 -> 10:3 and
  9:5 -> 10:5 for 14:16 where the game's takes 9:4 / 9:6: the formation's
  path (0x2726b0 -> 0x272aa0) against a single member's, unread.

## C-130: the flat bonus's wonder term runs on into the combat experience term — READ, both twins

- EFFECT_ADJUST_FLAT_BONUS 0x6c5700's GOVERNMENTBONUS_WONDER_CONSTRUCTION case
  (0x6c5b9d: the most City::GetYield 0x1cb8b0 Production over the player's
  cities x PSEUDOYIELD_WONDER of the Amount, 0x7a2140 from the start to the
  horizon, into +0x7c0) has no break: its sum (ebx at 0x6c5c87) falls into
  COMBAT_EXPERIENCE's label 0x6c5c8d (Player_Units +0xc0 units x
  PSEUDOYIELD_UNIT_COMBAT of the Amount / 10.0, added at 0x6c5df7) and on into
  GREAT_PEOPLE's class loop (0x6c5e45); the whole is taken once, of the
  three terms' sum (0x6c65eb) (`EFFECT_ADJUST_FLAT_BONUS` in ANALYZERS;
  `_pol_analyze`).
- Confirmed: runs/h1_duely1121 Hunza (player 2), Autocracy's term against
  runs/lb1_gov1121's govlog: 12 / 12 / 16 / 15 / 15 / 15 / 16 at t11-17 and
  18 / 20 / 20 / 20 / 21 / 21 / 21 / 22 at t19-26, Political Philosophy
  t14-30 as logged but t19.
- City::GetYield passes only the head's KIND (0x1795d0: building 0xd8a30267,
  unit 0x15d11e18, district 0x80d3734) into the yield build 0x1c5350, whose
  0x1c4460 adds the city's per-kind flat (+0xa40 / +0xaa0 / +0xb00) and
  percent (+0x248c / +0x2484 / +0x2490); a Builder and a Warrior read alike.
- Open (C-112): t18's term is the game's after Hunza's citizens moved
  187 / 188 -> 230 / 232 before its civics AI (Animal Husbandry completing
  that turn, Horses on 230 / 232); ours keeps the record's placement to t19.

## C-127 / C-100: the buildings' dependents and the districts' buildings (0x5cadc0) — ported, both twins

- The rule (`buildingsPass` / `cityBuildingsPass` in `cpu/core/aiCityBuild.ts`,
  `_cv_buildings_pass` in `gpu/core/sim_cityvalue.py`): after the plot
  analysis, before the improvement pick, the log and the events (0x5ce806),
  over the centre's BUILDINGS table in place, the Buildings in database
  order. For a building B: its positive value goes into its PrereqDistrict's
  (+0x218, the player's version 0x408860) sum, unless B is MustPurchase
  (+0x159 bit 4; no row of Base / Exp1 / Exp2 is), the city holds one of its
  +0x1e0 rows' buildings (MutuallyExclusiveBuildings, 0x18e9f0) or one of
  them comes earlier in the table, or the city holds the district complete
  and unpillaged (0x1aea60(d, 1, 1): its complete districts of the type or
  a related one, 0x93e050; 0x1ad720: true where those of the type are all
  pillaged). Then a B that is no wonder (+0x159 bit 0x10) adds each
  BuildingPrereqs dependent's value (+0x198, the player's version through
  +0x12f0 +0x230, -1 skipped) that is above 0 into its own slot; B's own
  value is not tested. The slot's holder +0xd10 is a synced variable whose
  data 0x9034b0 returns at +0x58 = +0xd68, the array the dependents are read
  from: one table, so a dependent earlier in the table adds as the pass has
  left it. Last (0x5cb36b..0x5cb44e) each district's non-zero sum goes into
  every plot evaluation's DISTRICTS slot (+0xd80, +0x58 its data, evaluation
  x Districts + district) that is above 0; the first evaluation's, the
  centre's, is set to the sum. Every city's update runs it: the minors'
  (`minorAiTurn`, the second hook's plot analysis read again) and the Free
  Cities' (`freeCityBuild`). It replaces the district value's best-building
  fit.
- Confirmed on runs/h1_duelv1128 (Nazca p4): its logged Shrine less the
  logged Temple is ours, 54.88 / 57.88 / 60.34 / 60.34 at t44-47 (70.10 -
  15.22, 74.56 - 16.68, 75.55 - 15.22, 85.79 - 25.45) and 27.18 at t51-56;
  p2 t50-54 logs its Shrine FX(-9999) + the Temple's (-9985.50 / -9992.05 ..),
  B's own value untested. The DISTRICTS rows (`plotValueLab.ts --districts`,
  the logged centre row taken back to the analysis's own) within 0.01 of the
  log: Holy Site 377 of 402 (196 on the best-building fit), Campus 2544
  (2301), Neighbourhood 752 (731), Industrial Zone 737 (731).
- Open: our Temple values FX(-9999) plus its own at a minor with five units
  or fewer (h1_duelv1128 Nazca t44-57: the log 15.22 .. 43.25, ours
  FX(-9999) + 13.85 .. 40.81): its Warrior Monk (EnabledByReligion) takes
  the version exit in ours (`minorUnitVersion`), where the logged Temple
  stays valid (the game's version of it for a minor, and its value there,
  unread); with six units all four of its units read FX(-9999) in both
  (p3 t42 -39986.70); the rest of the Temple's residual (1.0 .. 2.4, T past
  the horizon at t46 / t51) untraced. So the Shrine's dependent term never
  lands in ours.

## C-99: an embarked unit passes no other player's passenger — the step's flag-1 test READ (0x2720a0 at 0x272372, 0x271be0, 0x586360 at 0x586542, 0x208b80 under 0x108, 0x20a2a0), both twins

- THE STEP'S STAND TEST (0x2720a0 at 0x272372..0x27242e): a land formation
  (+0x1f2) stepping onto a revealed plot (+0x51 bit 0) of the domain it
  leaves needs the child's +0x50 bit 0x40, the plot it may stand on under
  flag 1 (0x271be0 at 0x271d9e: 0x586900(formation, plot, 1) == 1); an
  embarking step (land -> water) takes 0x52fe90 and a landing one 0x52fb90
  instead. A sea formation (+0x1f1) needs bit 0x40 on any revealed child.
  The planning's list (0x26d890) needs the same bit.
- 0x586360 UNDER FLAG 1 (0x586542..0x5865a1): the plot's best defender
  0x208b80(plot, -1, owner, unit, 0x108) — under 0x108 any other player's
  unit, at war or not, combat or not (flag 8), seen or not (0x20a2a0 with
  0x100 skips the visibility count +0x290; a TeamVisibility type, +0x1ba bit
  8, of another player none), the first of strictly the greatest strength
  (0x523d60) — refuses the plot without flag 1, and with it where the mover
  is embarked and that unit embarked too (IsEmbarked 0x8be30 on both). So
  an embarked unit neither passes nor ends on water another player's
  passenger holds; a hull, a land unit ashore or any unit of its own
  passes. Engines: `groundOf`'s `boarded`, `search`'s step test and the
  planning's `stand` (`_tac_boarded`, `_tac_search`).
- Confirmed (AI_Planning.csv): runs/h1_duely1121 t86 city-state 3's
  embarked Man-At-Arms on 40:20 plans 40:20 and 39:21 alone — player 0's
  embarked Warrior on 40:19 and city-state 4's embarked Man-At-Arms on 41:20
  close the water to its Harbor 41:19 and beyond; t94 city-state 4's
  embarked Man-At-Arms on 28:23 plans 29:21 and 30:22 past player 0's
  Quadriremes on 29:20 / 29:22. A one-seed aimem trace of 1121 t1-100: the
  city-states' planning rows whose first-turn plots the engine reproduces
  1,207 -> 1,226 of 1,228 (with the ground below), its Wander draws off the
  game's range 23 -> 9.
- THE MINORS' PLANNING GROUND (the replay's copy, not the DLL): the plots'
  features, improvements, pillage and roads as the pair's first record holds
  them — the turn's own units change them after the planning: runs/h1_duely1121
  t21 city-state 2's Builder clears the Woods of 11:4 (record 22), its
  Warrior at 10:3 planning 11:4 (1/0) and 11:5 a turn on; t45 city-state 4's
  Trader lays the road of 34:16 stepping there (record 46) after the Warrior
  on 34:16 planned 34:18 two turns away. Owners and districts stay record
  t+1's (taking those of record t loses rows).
- OPEN: the best defender read as the passenger only where no other
  player's unit stands there unembarked (0x523d60's strengths of a hull
  beside a passenger not compared); runs/h1_duely1127 t80-91 city-state 3's
  Swordsman plans 4:10, player 1's Missionary there in the record (0x585d90
  counts it for a Swordsman: +0x1ce0 of the pair 0x518f40 unread).

## C-126: a city-state centre's envoy term is the most envoys one player holds there, and the unit choice walks the game's unstable std::sort — 0x24a180's envoy arm and 0x7976f0 READ, both twins

`mostEnvoysReceived` (cpu/core/cityStates.ts) in `centreStrength`;
`_minor_most_envoys` in `_centre_strength`. `stdSort` (cpu/core/stdSort.ts)
in `choiceOrder`; `std_sort` (gpu/core/std_sort.py) in `_mops_choice_order`.

- THE ENVOY TERM (0x24a180, LOC_COMBAT_PREVIEW_ENVOY_STRENGTH_BONUS): where
  the district's owner can receive influence (0x449cc0), GetMostTokensReceived
  (0x44c4b0: over the player list, the store +0x5d0[p] plus 0x44caa0's
  governor share, the greatest) times the float global +0x22c (fixed-point
  whole and fraction; COMBAT_STRENGTH_FROM_ENVOYS 1). Not the sum over the
  givers. The other centre terms read as the engines take them: the base
  0x24a000 (the strongest melee trained, +0x1330 +0xf0, less global +0x1b4),
  the garrison, the walls' OuterDefenseStrength sum plus city +0x1888, the
  districts' strength, the Palace's city +0x188c.
- CONFIRMED: runs/h1_duely1128 t148 Bologna (player 3: one envoy from player
  0, six from player 1) holds 35 + 3 + 6 + 6 = 50, inside the bound the
  City Defense start gives (above 45: the Trebuchet 65 short of D + 20 at
  t147; below 51: the new Courser 46 counts at t148); the engines' sum gave
  51. Its City Defense now starts at t148 with the Trebuchet and two
  Warriors, as logged (aimem trace t140-151: no op.start / ops.members miss
  for player 3 at t148-149).
- THE SORT (0x7976f0 over 0x168-byte entries): the MSVC STL's
  _Sort_unchecked — above 32 elements and with divisions left, the
  partition by median guess 0x796f60 (the median guess 0x795f80: Tukey's
  ninther above 40 elements through the median-of-three 0x796bf0, else one
  median of three; the pivot range of equals grown both ways, swaps
  0x797bf0), the smaller side recursed, ideal = ideal/2 + ideal/4; with no
  divisions left the heap pair 0x796970 / 0x797420; 32 or fewer the
  insertion sort 0x7963a0. Unstable: equal entries (0x79d3e0 equal on
  buildable, the sums and the strength) land where the partition leaves
  them, not in the table's order.
- CONFIRMED: runs/h1_duely1121 city-state 3's Naval Superiority (aimem trace
  from t212): of its 66-entry table Pike and Shot (55) before the Caravel
  (55), every sum 0: "Contract for: UNIT_PIKE_AND_SHOT" t212-t221 as logged
  (the engines' stable order named the Caravel). The TS and Python sorts
  agree on 400 random key vectors (1-150 elements).
- OPEN: where the sums are not equal the game still names a land unit over
  the Caravel: 1121 city-state 2 (Hunza) t218 Pike and Shot (engines: the
  Caravel's every-player sum 2738 over Pike and Shot's 2639, at-war sums
  equal 1585); city-state 3 t90 the Warrior Monk and t92-t174 the Trebuchet
  over the Caravel (engines' every-player sum 60432 / 31327). The sums'
  terms against a sea entry (the efficiency orientation or the opposition's
  domain) unread.

## C-130 / C-112: the domain strength's treasury carry and the city's turn's citizen re-place — READ, both twins

- The strength over every domain the civics AI reads (Military Tradition's
  EFFECT_GRANT_COMBAT_ADJACENCY 0x6c4060, 0x4bd0d0(-1)) is +0x210 less
  +0x390, both written by 0x4bc720 at the player's turn start through the
  synced setter 0x731d10: +0x1b8's value (+0x210) is 0x4bb1e0(-1), the units'
  term plus the treasury's (PlayerTreasury +0xf8, a 24.8, x 256 / 6 / 512:
  gold / 12 in 24.8), its whole part; +0x338's (+0x390) the whole part of the
  treasury / 12.0 (0x16e940 at 0x4bc7fb). The treasury's fraction carries the
  units' into one more (`storeUnitStrength`, `_store_unit_strength`).
  Confirmed: runs/h1_duely1121 player 4 t14 / t16 / t19 / t21 / t23 / t27
  (Warriors 23.4 with 70 gold -> 24; Military Tradition 459.9 / 854.9 /
  808.9 / 839.9 / 816.1 / 1374.6 as logged), t15 / t17 / t18 / t20 / t22
  held (26.4 with 75 gold -> 26).
- Every city's turn (0x1fa1d0, from Player DoTurn 0x4e4560 at 0x4e4813, over
  the player's cities) runs production 0x178310, growth 0x1b46e0, borders
  0x1a9bc0, loyalty 0x19f8d0, then the citizens' (city +0x1b50, 0x1783b0)
  0x194f80, a thunk to the full reassign 0x196320: every citizen re-placed
  every turn after the border step (`minorGrowth`'s last step; `_minor_growth`),
  which subsumes the annex's. Confirmed: runs/h1_duely1121 Hunza t18 187 /
  188 -> 230 / 232 (Animal Husbandry completed that turn, its Horses on 230 /
  232), Political Philosophy t19 438.0 as logged.
- Open: the majors' and the Free Cities' cities re-place the same way; neither
  engine places their citizens at the city's turn (C-112).

## C-127 / C-96: a minor's unit versions, the unit table's religion gate and the building value's era reasons — READ, both twins

- The player's unit versions (player +0x12e8 +0x1c0) are written by 0x4f4a50
  per Units row: itself, then -1 for a row not CanTrain (Units +0x1b8 bit
  0x20), a FoundCity row (+0x1b9 bit 2) where the player's level forbids it,
  a TraitType row (+0x2d0) the player's traits do not name, and the
  level-hashed rows (0x8e7bf0); a trait's unit replaces its base. It never
  reads EnabledByReligion (+0x1b8 bit 0x40). `minorUnitVersion`
  (cpu/core/minorBuild.ts) and `_MinorFacts.unit_version`
  (gpu/core/sim_cityvalue.py) no longer drop an EnabledByReligion unit.
- The building value's unit loop (0x7a93c4..0x7a94b2): each Buildings +0x298
  row (the units the building enables), an Archaeologist skipped, through
  0x7b62c0 and added. A minor's Temple counts its Warrior Monk at its value
  (the version passes); with six units or more each of its four units exits
  at FX(-9999) as before.
- The UNITS table keeps the Warrior Monk at FX(-9999) by CanTrain (0x172820,
  its prerequisites skipped): an EnabledByReligion unit (0x172cdf) needs a
  belief that enables it in the player's religion (+0x1340, 0x496970) or,
  without one, in the city's majority religion (city religion +0x1910,
  0x340880): `beliefEnables` / `belief_enables` (the Warrior Monks follower
  belief, the only such row) in `unitTable` / `_cv_unit_table`.
- The building value's era term (0x7a7f30..0x7a7f5a): CanConstruct's result
  +0x24 (PrereqTech, 0x1705f1), +0x14 (PrereqCivic, 0x170628) and +0x18
  (PrereqDistrict, 0x17091e; cleared at 0x170951 by a complete district,
  the pillaged flag +0x2a apart) all -1 add the era index. The prerequisite
  buildings (+0x1f8) are not among them: `reasonsClearNow` /
  `_cv_reasons_clear_now` replaces `constructibleNow` there.
- Confirmed on runs/h1_duelv1128 (`cityBuildLab.ts --logtech`): Nazca's
  Temple valid on 195 of the 198 logged rows (0 before), within 0.005 on 135
  (t52 14.82, t56 43.25, t57 40.35, t62 86.00, t90-97 137.36 / 99.07); the Shrine within 0.005 on 187 of 274 (62). On duely1128 from t1
  the game's Shrine contracts land: Nazca's contract misses t83-99 and
  t236-242 all clear (contracts 1154 -> 1178 of 1210 to t243).
- Open: the Temple's T past the horizon at t46 / t51 (ours 51 / 52) is the
  civics AI's turns to Theology (ours 45 at t46 where the log's analysis
  reads 29, the civic in hand's 16 turns added: the analysis's `next`);
  the six-unit cut on
  p2 / p3 (t75 / t78 / t98 the log's 4 x FX(-9999), ours valued: the unit
  count the cut reads).

## C-123: a formation's Movement and its path's stacking — READ (0x2673f0, 0x267650, 0x262cd0, 0x585eb0 in the path validity), both twins

`passMoveExec`'s `opened` / `held` and `moveTo` / `pathTo` / `search` /
`groundOf` / `walk` with `mates`, `stackedWith` (cpu/core/tactical.ts);
`_op_move_exec`'s `mp_open` / `mate`, `_tac_move_to` / `_tac_search`'s
`mate` (gpu/core/sim_tactics.py), the capture's `mate` (gpu/core/sim_barbops.py).

- THE FORMATION'S MOVEMENT (formation +0x218, fixed point << 8): set as the
  player's units' turn opens (0x2673f0, from DoTurn 0x4e4560) to 0x262cd0
  over the members (+0x708) with GetMaxMoves: the least, raised to the most
  of members with +0x1938 set (no recorded member holds it); refreshed by
  0x267650 (its loop 0x2679e0..0x267a27) to the least of the members'
  GetMovementMovesRemaining (0x56e2b0) whenever a member's order ends its
  moves (0x56d6f0 -> 0x267b00), each member told the new value (event
  0xc50d66d6). The formation's move 0x26fe20 sets out on +0x218 (0x270215).
  So the formation moves once, on the least Movement its members held as
  the order opened; a member whose moves an order ended holds the others.
- THE PATH'S STACKING (0x2720a0's +0x54 = 0x585eb0 over the formation): a
  turn may not end where an own unit stacks with any member — a civilian
  and its escort are kept off both an own civilian's and an own fighter's
  plot — the formation's own members not counted; the walk's stop and flag
  0x1000's first turn read the same.
- CONFIRMED: runs/h1_duely1121 t168 the 6:10 team's Settler 4587543 holds
  while its escort's Protect Units plunder ends the Line Infantry's moves;
  t97 / t98 Settler 3211277 and t102 / t113 / t114 Settler 3407879 end where
  logged (their turns' ends off their tribe's units' plots); t149 / t150
  Builder 4259860 as logged.
- OPEN: runs/h1_duely1121 t157 the 16:17 team: the game's 16:17 -> 16:19 for
  4:18 past its Crossbowmen on 16:18 / 15:19, ours a northern route (the
  validity refusing the turn-ending node itself, so a later parent may reach
  it, against the engines' refusing its children, unread); t159 the 7:19
  team on 6:19 for 4:19 (the game's 6:18) and runs/h1_duely1128 t171 / t173
  9:3 -> 10:3 / 9:5 -> 10:5 for 14:16 (the game's 9:4 / 9:6), every step a
  full turn: the zone of control's sight on a move order's path (0x5033a0)
  or the barbarians' revealed plots, no record holding either; the 5:17
  team's t169 / t172 steps over our danger map.

## C-98: Cold War's growing term at the city-states is Rock Band's unit value (live, 0x7a9a10) — READ

- `civlog.py` on seed 1121 replayed (its AI_GovtPolicies.csv identical to
  runs/h1_duely1121's through its t202 rows): every part of the civic
  value 0x7a9a10 (FinalRelease 0x52caf0) for CIVIC_COLD_WAR (Civics index
  43), runs/lab2_cw1121.civlog.jsonl. Antioch (player 4), t175-t202: T 2, H
  50, rate 4.0; own (PSEUDOYIELD_CIVIC, PV(H) - PV(T)) 96.473; no government;
  civic era 6 = the game's (no multiplier, no golden-age term); no upgrade,
  building, wonder, district or formation term (Amundsen-Scott never reaches
  the wonder present value, FinalRelease 0x52d0a5); the cards 85, 86, 87, 111 score 0 (-1 at
  t175) against a weakest slotted 0, so the policy floor 20.0; one modifier,
  EFFECT_GRANT_SPY (CIVIC_GRANT_SPY) 385.0. Value 501.473 at t175-t195.
- The term that grows is the UNITS term: Rock Band (unit 122), the one unit
  Cold War unlocks, its value in Antioch's one city through CityBuildAI
  (FinalRelease 0x3e8150, the city's unit table; the call at 0x52ce06), taken where above 0
  and averaged over such cities: FX(-9999) at t175-t195 (skipped), then 6.13
  / 8.49 / 6.62 / 10.11 / 12.17 / 15.91 / 17.80 at t196-t202, the value
  507.602 .. 519.270, the logged score's steps (1063.0 -> 1069.2 / 1071.5 /
  1069.7 / 1073.1 / 1075.2 / 1078.9 / 1080.8) to the 0.1. Player 3 the same
  term from t198: 2.28 / 4.06 / 6.04 / 8.49 / 6.62 at t198-t202; player 2
  holds FX(-9999) through t202. Player 1 (a major) has it positive from t145
  (22.29 .. 359.21 at t174, the same in its three cities).
- So the gap is upstream of the civic value: the city build AI's Rock Band
  value at a city-state, which the game's table carries above 0 from a turn
  on (Antioch t196, player 3 t198) where ours reads 0 or FX(-9999)
  (`minorUnitTerm` takes `CityState.unitValues`'s entry, max 0). Antioch's
  state t195 -> t196 (runs/h1_lab2cw1121's records) moves only its growth
  and housing, the religion's pressure 32 -> 34 and its staycationers'
  count (126 -> 138, t194 -> t195); which of the unit value's inputs flips
  the FX(-9999) exit is unread.

## C-99: the planning list's map layer and closed ground, a siege unit in Attack Units — READ (0x2665b0 -> 0x585eb0, 0x26d890's 0x586900 under 9 -> 0x586360 at 0x586624, 0x80ceb0 at 0x80d015 / 0x80d1cf), both twins

- THE PLOT LIST IS THE FORMATION'S LAYER'S: the pathfinder's +0x1a4 (0x2665b0)
  is the map layer holding the formation's first unit (0x75ae0); every plot
  list the search reads (0x271be0 -> 0x75c50, 0x585eb0's +0x54 count, the list
  test 0x26d890's first unit) is that layer's. A religious unit stands on a
  layer of its own (3), so it keeps no other unit out of the planning's list,
  nor is it a passenger to an embarked mover. Engines: `groundOf`'s `stand`
  and `boarded` (`onLayer`), `_tac_layer` / `_tac_peaceful` / `_tac_boarded`
  by the mover's layer in `_tac_search`. Confirmed: runs/h1_duely1127
  t80-91 city-state 3's Swordsman 589829 plans 4:10, player 1's Missionary
  1572870 standing there in sight (records 84-86, AI_Planning.csv); 1127
  t76-78 city-state 2's 43:15 and t49-51 city-state 4's 8:9 / 10:9 / 11:9
  match with it too. The 1127 t1-100 aimem trace: planning rows matching 740 -> 773 of
  773, Wander draws off the game's range 31 -> 4.
- THE LIST KEEPS NO CLOSED GROUND, AN ATTACK'S NEITHER: 0x26d890 adds a plot
  only where 0x586900 under 9 answers; 0x586360 (flags & 3 != 3, at
  0x586624..0x586664) refuses another player's plot at peace the mover may not
  enter (0x3dab70) where its owner closes it (+0x6c0). `planUnit` and
  `reachPlots` list no plot `closedToMinor` holds but the unit's own
  (`_tac_search`'s `listed`). Confirmed: runs/h1_duely1127 t70-74 city-state
  4's Catapult on 10:10 lists none of 11:10, the barbarian Swordsman 3407872 on
  player 1's ground; 1117 t83-90 city-state 4's Catapults list the barbarians
  on unowned 35:7 / 35:8 / 34:7.
- ATTACK UNITS' SIEGE MEMBERS (0x80ceb0 at 0x80d015..0x80d030 and 0x80d1cf):
  the flag is set where the operation's target is a city of the seat's OWN
  (IsCity, its owner == player +0x128); a member with a bombard strength
  (0x56daa0) joins only under that flag or of AI type DEFENDER (unit +0x1c0
  4). `attackUnitsExecute`'s `ownCity` and the view's `defender`
  (`aiDefenderOf`); `_x_attack_units`, `_bop_attack_units`. Confirmed:
  runs/h1_duely1127 t70 city-state 4's City Defense (target its centre 8:10)
  logs "Operation Attack Units, UNIT_CATAPULT, At 10:10, Move 10:10, Attack
  11:10" — the Catapult now stays on 10:10 at t70-74 as recorded; 1117 t88-89
  city-state 4's City Defense Catapults in Attack Units likewise.
- OPEN: the layer filter is ported for the list and the passenger alone —
  `groundOf`'s foes / own / fighters (enter, attack, full) still count a
  religious unit; 1117 t84-90 city-state 4's Catapults' assignment
  (t84 4:917509 ours 342 // 252, t88 4:1114113 341 // 252); runs/h1_duely1127
  city-state 3's Galley 393216 under Naval Superiority (Naval Patrol's explore
  target, `passPatrol`) t62-97 822 // 866.

## C-130 / C-96: a contract's priority in the expected unit count, the strength's treasury flag — READ, both twins

- CityBuildAI's expected count of a unit 0x5d4750 (FinalRelease 0x3e7c80):
  0.2f x the most priority of the city's listed contracts of the unit +
  0.5f, as a 24.8 with the fraction truncated — the priority Release +0x160,
  FinalRelease +0xc8 m_priority (the AI memory's `priority`; Release +0x160
  is not the FinalRelease handle count) (`expectedOfPriority`,
  `minorUnitExpected`; `_expected_of_priority`, `unit_expected`).
- A contract's priority (`AiContract.priority`, `c_priority`): Build Unit's
  execution 0x7f4240 takes its Build Priority datum (0x7f43a3), else its
  operation's priority (0x7f43bc -> 0x723b90, the definition's Priority),
  else its tree's +0x548 (0x7f43c6); Add Goal Tech (0x7e7200), Purchase Plot
  (0x7f6820) and Find Available Unit (0x7ec7b0) read the tree's +0x548. A
  city tree's +0x548 is 2 on every city tree of the runs/h1_duely AI memory
  (its writer unread: `CITY_TREE_PRIORITY`); Build City District's and the
  wonder district's Build Priority 4, as their contracts hold.
- Confirmed: runs/h1_duely1121 Hunza's Ilkum (EFFECT_ADJUST_UNIT_PRODUCTION
  0x6b2350) 1.0 at t23 / t24 / t26 on Builder contract 57 of priority 2
  (0.8984375), 0 at t18-22 with none listed, as logged.
- 0x4bd0d0(-1, r8b) is +0x210 with r8b set, +0x210 less +0x390 without:
  Mercenary Companies' 0x6b47f0 passes r8b = YieldType != YIELD_GOLD
  (0x6b4a8f), so a Gold debuff compares the strengths without the
  treasury's term (`militaryStrength(seat, withGold)`); one function holds
  the strength, its unit term `aiStrengths`' combat (0x56dc90 with 0) and
  its treasury term the 24.8 gold / 12.
- The economic AI's purchase list (0x684bf0, a stable insertion / merge sort,
  0x6846d0 at 0x684738) holds the higher priority first, of equals in arrival
  order (`purchaseContracts`; `_minor_contract_purchases`).
- Open: Ilkum 0 for the logged 1.0 on runs/h1_duely1117 p2 t23-32 and p3
  t44-51.

## C-127: the civic in hand's turns left carry the completion overflow (0x39c1f0 -> 0x39c070 -> 0x39c0e0) — READ, both twins

- THE CIVIC'S TURNS (0x621920, `analysedTurns` through `seatResearchTurns`):
  0 for -1 or an owned entry (+0xc); else the civics AI's entry turns
  (+0x18, 500 at 0 or below), plus, below 500, GetTurnsLeftOnCurrentCivic
  (0x39c1f0) where the civic in hand (GetProgressingCivic 0x399a90) is neither
  the entry's next step (+0x1c) nor the entry (+0x8). 0x39c1f0 takes the
  queue head (+0xad0 while +0xae0 is set) into 0x39c070: the player's Culture
  (0x392260, GameAttribute::Value) into 0x39c0e0, the cost less the progress
  kept on it plus the bank +0xb40 — the overflow a completion leaves, which
  the next turn's Culture pays in. The engines' turns left on the civic in
  hand now add it (`civicLeft` in `seatResearchTurns`: `civicOverflow`;
  `_civic_left` x2 in gpu/core/sim_cityvalue.py: `citystate_civic_ovf`), as
  the walk's rows (0x39c0e0 from 0x621a20) already did.
- Confirmed on runs/h1_duelv1128 Nazca (`cityBuildLab.ts --logtech`, the
  lab deriving the overflow from the pair: the civic the record before held
  in hand, now held, at its progress or its catch-up's cost less one, plus
  that record's Culture): t46 Political Philosophy completed off its
  catch-up (54 + 4.5 - 55 = 3.5): Drama and Poetry 12, Mysticism 4,
  Theology 29 as AI_GovtPolicies logs them (13 / 5 / 32 without), the
  Temple's T 29 + 12 + 5 + 1 = 47 and its 15.22 as logged (before: T 51,
  past the horizon); t51 Drama and Poetry's 3.80: Mysticism in hand 4,
  Theology 17, T 49 and 5.57 as logged. Nazca's tables 931 -> 933 exact,
  the Temple valid on all 158 logged rows.
- THE SIX-UNIT CUT's count (0x7b62c0's exit, `unitValueExit`): the player's
  units as its city's analysis stands — after the turn's production (a unit
  it made counts: duelv1128 Bologna t100 the Warrior off 313 Production,
  cut), before its purchases (t77 Bologna's bought Builder uncounted,
  valid) and before its units act or later players' turns (t75 Bologna's
  Builder spending its last charge, Hong Kong t78's Swordsman killed by a
  barbarian, t98 / t106 Bologna's two Men-at-Arms: counted that turn, cut;
  gone the turn after, valid). The engine's `minorPhase` counts there
  already (`units` before `minorMilitaryTurn`); the lab read the record
  after and now counts the record before plus the unit its production made
  (an upgrade on its unit's plot not added): Temple / Shrine onlyOurs on p2
  7 / 8 -> 1 / 0, p3 11 / 11 -> 1 / 1.
- Open: runs/h1_duelv1128 Bologna t133: three Men-at-Arms disbanded in
  turn 132 at a 0 treasury (Player_Stats land units 6 / 5 / 3 at t131-133,
  no combat) still count at the t133 analysis (Temple 4 x FX(-9999),
  -39406.50), valid at t134: a bankrupt disband's units stay in the count
  (player +0x12e8 +0xc0) a turn, where `bankruptcy` removes them at the
  economy step.

## C-98: a religious unit's value at the city-states — READ (0x7b62c0's religious branch, CanTrain's religion and inquisition refusals), both twins

`unitValue` / `unitTable` (`cpu/core/aiCityBuild.ts`), `_cv_unit` /
`_cv_unit_table` (`gpu/core/sim_cityvalue.py`); the Units rows'
`requiresInquisition`, `tourismBomb`, `tourismBombPossible`
(`tools/install/ai_tables.py`).

- THE BRANCH (PSEUDOYIELD_UNIT_RELIGIOUS, 0x7b6593..0x7b6a87): the religious
  term (ReligiousStrength x 0.01 by its charges, x the eras' points) counts
  only where the player's own founded religion (0x4681c0 +0x1c0) is the
  city's: -1 at a city-state and the Free Cities, so 0 (runs/h1_duelv1127:
  a minor's Missionary 0.00 on its turns following religion 11). The
  culture AI's park term (0x6239a0 x ParkCharges) and the park tail
  (0x7b7456) read 0 at these players (every valid Naturalist row of the
  five verbose duels 0.00). Then the tourism bomb, Units_XP2 (0xad67b0)
  TourismBomb (+0x28) + 10 where TourismBombPossible (+0x48 bit 32), as
  PSEUDOYIELD_TOURISM (0x7b6a3e) at the city-states' weight 0 (the
  MinorCivPseudoYields -200 does not reach it), then the tail: Rock Band
  10.0 a turn from T to H.
- CANTRAIN (0x172820, past the prerequisites the table's call skips): a
  unit of ReligiousStrength in a city following no religion (0x172d88), and
  a RequiresInquisition unit for a player with no inquisition launched
  (0x497a30, which a city-state and the Free Cities never launch).
- Rock Band's T is Cold War's civic turns + 5 (MustPurchase: no train turns,
  no +10); its FX(-9999) the exits: T >= H, or more than five units at
  peace. Confirmed: every minor's Rock Band row of runs/h1_duelv1117 /
  1121 / 1124 / 1127 / 1128 at 10.0 a turn (165.30 at T 5 with Cold War
  held .. 2.28 at T 49); runs/lab2_cw1121 Antioch (player 4) FX(-9999) to
  t195 on six units (five from the record of t195), then T 46 .. 40 at
  t196-202 (6.13 / 8.49 / 6.62 / 10.11 / 12.17 / 15.91 / 17.80: the present
  value's cubic is not monotone at T 44-46); player 3 T >= 50 to t197, then
  T 49 / 48 / 47 / 45 / 44 (2.28 .. 6.62); on runs/h1_duely1121 t191-205
  under aimem every civicScore.minor row of players 3 and 4 as logged.
- Open: the full civilizations' religious term (the heal counts 0x4be880,
  the Evangelize and evict terms, the inquisition's points); the +0x2a78
  row (keyed by Units +0x24, +0x1c x 100 tourism) unnamed, no row for a
  city-state's unit in these games.

## C-130: Antioch's government values read the Combat Desire of their own turn (live) — READ

- `govlog.py` on seed 1121 replayed to t15 (AI_GovtPolicies.csv, AI_Research.csv,
  RandCalls.csv and AI_CityBuild.csv byte-identical to runs/h1_duely1121's
  first rows), with the flat bonus's parts (sites 5-10: FinalRelease
  0x47634e / 0x476386 / 0x4763e7 / 0x476420 / 0x4764a6 / 0x476580 in 0x476060's
  WONDER_CONSTRUCTION case 0x476325) and the slot bests the government value
  reads (culture AI +0x2f0, 0x52fe44): runs/lab3_gov1121.govlog.jsonl.
- Antioch (player 4), t8-t14: Autocracy's flat bonus is the wonder term
  13.734 (best Production 3.5 in its one city, PSEUDOYIELD_WONDER of the
  Amount 0.0977 = 0.1953, 0..50) plus COMBAT_EXPERIENCE: the units (1 to t12,
  2 from t13) x PSEUDOYIELD_UNIT_COMBAT of the Amount / 10, discounted. That
  pseudo-yield reads 0.0977 / 0.0977 / 0.0977 / 0.2266 / 0.1055 / 0.1055 /
  0.0977 at t8-t14: the Amount x (1 + W), W the Combat Desire AI_Military.csv
  logs for player 4 the same turn (0.0 / 0.0 / 0.0 / 1.3 / 0.1 / 0.1 / 0.0).
  The term 0.152 / 0.383 (t11) / 0.152 (t12) / 0.383 (t13, two units); the
  flat bonus, one whole of the sum, 13 / 13 / 13 / 14 / 13 / 14 / 14.
  Oligarchy's COMBAT_EXPERIENCE alike (0.383 / 0.859 at t11 / 0.383) stays
  below 1 and adds 0; Classical Republic's GREAT_PEOPLE 0.
- The pre-modifier values: Chiefdom 2.098 / 3.797 (t12-13) / 2.098 (t14),
  Autocracy 18.156 / 21.352 / 19.652, Oligarchy 18.254 / 20.801 / 18.254,
  Classical Republic 19.203 / 20.699, from the slot bests 21 / 0 / -1 / -1 /
  21 / 0 (t8-11), 21 / 17 / 14 / -1 / 21 / 0 (t12-13), 21 / 0 / 14 / -1 / 21
  / 0 (t14) by GovernmentSlots index.
- So the civics AI's government values of turn T read the Combat Desire the
  military AI wrote at T (its row of turn T): Autocracy 14 at t11 and 13 at
  t12 where a desire a turn late (0.0 at t11, 1.3 at t12) gives 13 / 14 —
  Political Philosophy's +1 / -1 at the t11 / t12 computes. The CPU twin
  (`minorBuild.ts`) sets `CityState.combatDesire` after `minorResearchAi`
  in a city-state's turn, so its government values read the previous turn's.

## C-127: an idle city's store through the queue step (0x16f050), the build lab on it — READ (the engines unchanged)

- THE STORE (0x16f050, `minorBuild`, `_minor_build` in gpu/core/sim_minors.py,
  as the engines already hold it): an idle step adds the plain Production B
  to BuildQueue.m_xProductionOverflow +0x1f4 (0x16f62d -> 0x0ac650); with a
  head the step pays (A + the store) through the item's add (0x1853d0: the
  SUM times the item's percent multiplier) and clears the store (0x16f31b);
  a completion stores min(A, B) less what the item lacked before the step
  (0x16f3bf..0x16f474, none below 0). The excess past the cost is lost.
  The other writer: a building made by another path with its flag set
  (0x175da0 at 0x175eec) adds the progress kept on that building
  (+0x218[building]) into the store.
- The build lab now keeps that store (`cityBuildLab.ts` `inHandAtAnalysis`:
  a completion stores the turn's Production less what the item lacked, where
  before it stored the excess over the multiplier), and pays the turn's
  production step at the Production the turn's record stood at, not the
  next record's.
- Confirmed (runs/h1_duelv1128, City_BuildQueue.csv): Nazca t33 the Horseman
  117.6 of 40 leaves no store, the Shrine's T 8 / 7 / 6 / 5 at t33-36 and
  8 / 7 at t37-38 as logged (the excess carried gave 5 / 4 / 3 / 2); t39 the
  Walls 26.4 = (4.4 + 4.4) x 3 off the turn's 4.4; t40 the Shrine T 7. The
  lab's tables, all rows exact: Nazca 933 -> 984 of 1330, Hong Kong
  505 -> 777 of 1627, Bologna 740 -> 1157 of 2633 (onlyOurs 17 / 88 / 43 ->
  1 / 24 / 10). Hong Kong t56's Temple a bare FX(-9999) in both now (T past
  the horizon on the store as the game keeps it).
- Open: runs/h1_duelv1128 Nazca t27-32: the game's store reads 9 or so above
  the idle Production from t27's analysis on (the Shrine T 6 / 5 / 4 / 3 / 2,
  ours 8 / 7 / 6 / 5 / 4; t33's Horseman 117.6 = (34.8 + 4.4) x 3 against
  25.8 of idle Production t27-32), entering after the t26 analysis (T 7 as
  logged there): no queue row, map change, combat or building explains it.
  The Builder's lump (Nazca t22: the Granary's second row 9.0, overflow 8.5)
  is not in the lab, which reads no feature removal (t22-23 a turn off).

## C-126: the unit choice walks the stored table, stable-sorted at its build, and the table is rebuilt every turn — 0x797980 / 0x79d3a0 and the build's signals READ, both twins; the sea entries' absence open

`storedTable` in `choiceOrder` (cpu/core/operations/unitChoice.ts);
`_mops_choice_order`'s stable pre-sort (gpu/core/sim_minorops.py).

- THE STORED ORDER: the unit production table (0x7989e0) ends with
  std::stable_sort (0x797980: a buffer of (n + 1) / 2 entries, 0x797870
  halving down to the insertion sort at 32 elements and merging) under
  0x79d3a0 — buildable (+0x0e), the at-war sum (+0x2c), the every-player sum
  (+0x30), the strength (+0x18), each greater first, no per-player term. The
  choice (0x79bd30) copies that stored order (0x6f83a0 per entry) and sorts
  the copy with std::sort under 0x79d3e0. Ported: the entries, in the Units'
  order, are stable-sorted first, then `stdSort`.
- THE REBUILD: 0x6fff90 binds the military AI's handlers on the player
  signals: 0x6fa950 on +0x1e0 clears the table's built flag (0x79d800,
  +0x28), and Game::Processor::BeginTurn fires +0x1e0 for every live player
  (0x7d980 -> 0x4e44d0 -> 0x6070b0); 0x6fae70 on +0x258 rebuilds the table
  while the flag is clear or the table empty (0x79d320), and the AI's job
  passes 0x608580 (Player::Processor::Update) fire +0x258. So the table
  stands fresh every turn; no staleness explains the cases below.
- THE ORIENTATION: the choice's sums run the efficiency table with the
  entry's row (the engines' table equals AI_UnitEfficiency.csv on all
  20,736 cells). runs/h1_duely1121, aimem, t1-t222: the row way names 152 of
  the game's 293 "Contract for" lines; the column way 0.
- OPEN: the remaining misses all name a unit the game never names for these
  city-states — the Caravel (110), the Privateer (25), the Cavalry (5), the
  Field Cannon (1); the game names the Warrior Monk, the Trebuchet or Pike
  and Shot. Under the game's own table no column puts the Warrior Monk's row
  above the Caravel's, so in the game the Caravel is not a standing entry
  of city-state 3's table at t90-t221 (nor of Hunza's at t218), while the
  Nuclear Submarine is at t241. The walk (0x79bd30), the team update's
  need and full lists (0x73fba0) and the entry's buildable flag (0x4cb590,
  0x39d490, 0x4aa790) read as the engines take them; the AI-type bitfield
  the walk tests (global @0xf28c78 +0x408, +0x400 per unit) is unread.

## C-98 / C-130: a city-state's building turns under the Urban Development Treaty — READ (0x17b1e0's rate), both twins

`minorItemMult`, `minorItemTurns`, the minor's production step and its
`buildTurns` (`cpu/core/minorBuild.ts`), `majorItemTurns`
(`cpu/core/freeCityBuild.ts`); `_minor_item_mult` (`gpu/core/sim_minors.py`),
`_item_rate_mult` (`gpu/core/sim_cityvalue.py`).

- THE RATE (0x17b1e0, 0x17b2ae..0x17b516): the city's Production x (the
  queue's modifier on the building + the extra the caller passes), then the
  queue's multipliers past it. The treaty's outcome A
  (MODIFIER_ALL_CITIES_ADJUST_DISTRICT_BUILDING_PRODUCTION, Amount 100, every
  city, the city-states' too) doubles the Production toward a building of
  its district past the minor's percents: 1121 Hunza's Star Fort at
  Production x (1 + 2.0 walls + extra) x 2.
- A civilization's own building at a minor (the Tsikhe, which the engine
  files under the Star Fort's key) takes none of the Star Fort's kept
  progress: the queue keeps progress per building row.
- Confirmed (runs/h1_duely1121, the City Centre treaty t142-161, AI_GovtPolicies
  .csv's POLICY_LIMES at Hunza fitted through 0x6c1a80): the Star Fort 4 / 3
  turns and the Tsikhe 10 / 5 (Limes 185 at R 1, 138 at R 0, 93 with the
  Star Fort built), its Star Fort done at t150. On a one-seed aimem trace to
  t170: every Limes row t142-148 and t150-161 as logged, the governments'
  military slot best with them (Merchant Republic +2.0, Theocracy +3.0 x
  the era's 2): Exploration and Reformed Church t144-152 as logged;
  civicScore.minor misses to t170 97 -> 33, policyScore.minor 87 -> 12.
- Open: the other multipliers of the minor's queue (the Global Energy
  Treaty's plant, Public Works' projects, the roster's prodMults) not on a
  minor's step or turns; 0x178610 and +0x308 / +0x30c unread.

## C-95: Operation Move's ring test takes no path (0x815d50) — READ, both twins

- Operation Move's execution (0x816cb0) walks the ring of its radius around
  the goal (0x6aef0) with the test 0x815d50: the goal's region before
  another, then strictly nearer the mover; off the mover's own plot (0x90290)
  each unit of the mover's player on the plot goes to 0x265ac0, whose test
  (0x265af0: a unit off the leader's plot) refuses it, so any unit of its own
  refuses the plot; then the location test 0x586360 (flags 0 / 0, the ground,
  the domain, closed borders, a hostile defender) on any plot. No path test:
  a ring plot the mover has no path to is taken, and the move order walks
  toward it. Ported as `passMoveExec`'s ring walk (the stacking test kept,
  `groundOf(...).enter` for 0x586360) and `_op_move_exec`'s
  (`_tac_enter`, `_tac_embarks`).
- runs/h1_duely1121 t59-t65 and t79-t91: the raid's Archer 2031620 and
  Warriors 589832 / 1310730 / 1769487 log 6:13 / 7:12 beside their target
  6:12 and step on while their own Scout 131073 stands on the land bridge
  11:18 / 9:19, the only way from the eastern peninsula; with a path test
  every ring plot failed, the goal 6:12 (the city) taken with the attack
  flag and no path, the units standing still (23 rows to t150, none lost on
  the five duels to t150).
- runs/h1_duely1124 t100: city-state 4's City Defense Trebuchet on 31:8
  keeps its plot, the goal 32:8 holding its own Trader and Builder: a unit
  of the player of any class refuses a ring plot (the stacking class test
  of the path finder does not apply here).
- The move order's destination (the path validity 0x2720a0's stacking test
  at the path's end): a destination its own stacking unit holds, reached in
  the first turn, is no path under flag 0x1000 or not; one reached in a later
  turn is kept (refusing it at any turn loses 14 rows on the five duels to
  t200). `pathTo`, `_tac_move_to`. runs/h1_duely1124 t182-t196: the
  barbarian Ironclad 5701639 on 19:3 holds for China's Water Park 19:8
  (Pillage Improvement, no flag) while the rampaging Galley 720906 stands on
  it, ours had walked to 19:7 (27 rows to t200, none lost).
- Open: 1121 t56-t58 the same raid's units, Not Ready, end one or two plots
  away from the goal (14:13 -> 15:13, 15:14 -> 16:16, 16:15 -> 17:16) where
  our move order walks the path west; MoveTo 0x962380 below the order unread.

## C-130: the Combat Desire between the policy jobs and the government values; a released contract on its city's list — READ, both twins

`minorResearchTurn`'s `military` (cpu/core/minorBuild.ts; `minorPhase`,
`freeDesire` in cpu/core/phase.ts), `reapContracts` / `cityContracts` and
`AiContract.released` (cpu/core/aiContracts.ts); `_cai_turn`'s `military`
(gpu/core/sim_civics.py; `_minor_research_turn`, `_minor_research_ai`,
`_minor_research` in gpu/core/sim_minors.py), `reap_contracts` /
`city_contracts` and `c_released` (gpu/core/sim_citytrees.py).

- THE SIGNAL: the player AI's update 0x608580 fires player signal +0x258
  (0x6078f0 at 0x6085d0) on the update where the player's +0x7e8 is clear,
  and on the others runs the turn start 0x608870 (the +0x370 job list) and
  the +0x388 passes. 0x724280 binds 0x7271d0 to that signal (0x724a97);
  0x7271d0 runs the military AI's strengths 0x71fb80 (the Combat Desire and
  the favoured technology, AI_Military.csv's row) at 0x72725a, then the
  operation candidates 0x722d70.
- THE TURN AS THE RECORDS ORDER IT: the civics AI's policy jobs (0x621eb0)
  read the Combat Desire of the turn before, its government values
  (0x7b0330) the turn's own; the engines take the military AI's strengths
  between the two, the research AI's analysis (the favoured technology of
  the turn before) and the civic analysis (on the government values of the
  turn before) ahead of both. runs/h1_duely1121 Antioch (player 4): desire
  0.0 / 1.3 / 0.1 at t10-12 (AI_Military.csv); Agoge 1 at t12, unlogged at
  t11; Autocracy's flat bonus 14 / 13 at t11 / t12 and Political
  Philosophy 483.0 / 498.0 at t12 / t13 as logged; civicScore.minor and
  policyScore.minor of seed 1121 to t30 under aimem with no miss. The Free
  Cities take theirs alike (`freeDesire`, `_free_combat_desire` through
  `_minor_research`).
- A RELEASED CONTRACT: a contract its tree ends with (no tree, hand,
  research or culture AI holding it) stays alive on its city's list
  (CityBuildAI +0x3a8): runs/h1_duely1117 Valletta's Builder contract 47
  (Build City Improvement, bought t22, the tree gone at the t22 end look):
  CANCELLED with refs 2 (the economic list's and the city list's) from the t22
  end look, refs 1 from t23's end look to t32, on the list [47, 49] until the
  t32 pick; Caguana's Builder contract 104 CANCELLED t43-t51 on its list
  until its t52 pick. The expected unit count 0x5d4750 walks the list, so
  Ilkum (EFFECT_ADJUST_UNIT_PRODUCTION 0x6b2350) holds 1.0 while it is
  listed: p2 t23-t32 and p3 t44-t51 as logged. The pick's walk (0x5d4d70)
  passes it to the line 0x5f4cd0, which prints none where the owner control
  is gone (0x609060 at 0x5f4d59 returns none): no line for contract 47 at
  the t32 pick beside contract 49's COMPLETED. The engines release such a
  contract (an open one CANCELLED, off the purchase list and its tree) and
  drop it at the city's pick without a line; the aimem import takes a
  contract the city's list alone holds as released.
- Open: a contract a live tree drops from its own list (Recruit Units'
  replacement) is released by the engines, where 0x5f4cd0 would print its
  line; the status the release writes on a COMPLETED or FAILED contract
  (kept).

## H-1: a city-state's boost completion and the research AI — READ

`minorCompleteNow`, `minorPhase`, `_minor_complete_now`, `_city_state_phase`;
the replay's `foldResearchParked` (`History.researchParked`).

- THE COMPLETION: 0x762d60 (bound by 0x761d30 at 0x761ffe on the player's
  signals +0x13b8) tests no research in hand: any row the player completes,
  a boost's included, runs the propagation again and the keyed choice
  0x763020, which replaces the research in hand. runs/h1_duely1128 t117
  city-state 2: Banking boosted complete, Education 231.3 taken over the
  Gunpowder in hand (82.8), as logged; 1127 t124 city-state 2's Cartography.
- THE TIMING: a boost lands at its event. A building the city's step
  completes lands before the research AI's turn (list B): runs/h1_duely1121
  t58 city-state 3, Walls complete in the step (City_BuildQueue 40.5 / 40),
  Engineering logged owned at t58 and Irrigation in hand; a Builder's,
  a chop's or a trade route's after it (1121 t50 city-state 2's Water Mill
  on a chop, Construction 1 turn at t50's analysis; 1117 t80 Apprenticeship).
  The engines detect the boosts after the city's step and growth, before the
  research AI, and again at the turn's end.
- THE RECORD'S PARKED RESEARCH: a record shows the progress of the item in
  hand alone; an item left unfinished keeps the record's progress plus the
  record's yield (the bank before the AI's turn). runs/h1_duely1117
  city-state 3's Sanitation, in hand t149-t154: 50 turns at t156, 49 at t160
  as logged, beside Economics' 58 at the same cost.

## C-99: a siege unit's planning spots — READ (0x790c60 at 0x791021..0x79103c, 0x793400, 0x56dc40), both twins

`planUnit`'s `shoots` and `movesAndShoots` (cpu/core/tactical.ts,
cpu/core/combat.ts; `siegeMayShoot` its unmoved case on top);
`_tac_spot_link`'s `shoots`, `_tac_plan`'s plan["shoots"] and
`_moves_and_shoots` (gpu/core/sim_tactics.py, gpu/core/sim_masks.py).

- THE PLANNING CONTEXT (0x793400): +0x14 the unit's domain, +0x18 its plot,
  +0x20 its owner, +0x24 GetRange, +0x28 0x56dc40, +0x29 a combat, ranged or
  bombard strength, +0x2a a religious strength.
- MAY SHOOT AFTER MOVING (0x56dc40): the unit's byte +0x1290, else GetMaxMoves
  (0x56e130) above its Units row's BaseMoves (+0x38; the row filler 0xad1f60).
  The five duels' Operation Attack Units rows: Archers 13, Slingers 11, Field
  Cannons 3 move and strike in one row; Catapults 0 of 13, Trebuchets 0 of 17
  (a Bombard 1, 1124 t180); so the byte stands for every unit but a siege one
  (Bombard Strength or ABILITY_NO_MOVE_AND_SHOOT) without Expert Crew — the
  engines' `movesAndShoots`, the siege rule less its unmoved case.
- THE SPOT'S TURN (0x790c60, the ranged / general path at 0x791021): the
  link's turn, the next where the link ends with no Movement, and the next
  too where the spot is not the unit's own plot and +0x28 is clear. So a
  Catapult's spot it moves to is next turn's: the assignment's blow there is
  halved and it moves with no attack.
- CONFIRMED: runs/h1_duely1117 t89 city-state 4's City Defense Catapult on
  33:8 strikes 34:8 from where it stands (AI_Operation.csv "At 33:8, Move
  33:8, Attack 34:8"); t90 the Catapult on 31:6 moves with no strike, as
  logged ("At 31:6, Move 32:6, Attack -9999:-9999"; the engines' goes to 32:7,
  its position carried).
- OPEN (C-99): 1117 t89 the Catapult on 32:7 (spot 32:7 this turn, 32 dealt)
  takes 32:8 next turn's in our assignment where the game strikes from 32:7;
  1117 t84 city-state 4's City Defense Catapult 917509 on 33:6
  takes the 2-turn spot 34:7 (the Man-at-Arms' own plot, a ranged spot at
  distance 0 as 0x790c60 reads) in our assignment, where the game logs no row
  for it and record t85 holds it on 32:5 (no AI_Operation / AI_Tactical row
  moves it).

## C-99: Naval Patrol's explore target — the list and the tests READ, two cases unexplained

`passPatrol` / `exploreTarget` / `exploreOk` (cpu/core/tactical.ts);
`_x_naval_patrol`, `_tac_explore`, `_tac_explore_ok`.

- THE CANDIDATE LIST (0x26df90's list callback 0x26dab0): a plot is appended
  on GetBest's NotifyList 3 (0x781e0, parent argument 0), once (0x791270) —
  the BFS's closing order; NotifyList 1 / 2 (AddToOpen, GetBest) append
  nothing. A plot the player sees now (+0x50 & 2) joins only with +0x50 &
  0x40 (0x586900 under flag 1, set by 0x271be0) and no mountain / impassable
  feature (+0x50 & 0xc), then 0x586900 under the search's flags. Naval
  Patrol passes 0x70aa40 search flags 0 (0x26df90 adds 0x800, 0x100 for an
  unmoved formation), a chosen list of its own, the first round on.
- THE SELECTION (0x70aa40 at 0x70ab21..0x70ac5b): the first plot of the
  largest unrevealed count, strictly larger replacing (the route-led plot
  aside); the fallback the first plot of the largest unseen count, the first
  candidate always taken.
- EXPLORE'S PLOT TEST (0x70bd40) first refuses a plot under a live storm
  (0x28b120 -> 0x28b5d0 GetActiveStormAtPlot: the plot in a live storm's
  footprint, 0x28d6b0) — unported: no recorded explorer stands beside a
  storm.
- OPEN: runs/h1_duely1127 city-state 3's Galley 393216 t62 (from 29:15:
  30:17, 29:17, 28:17 close in that order, unrevealed counts 10 / 9 / 10 in
  the engines, the game takes 28:17) and t63 (from 28:17: 30:17 and 30:18 at
  7 / 7, the game takes 30:18): the engines' counts tie where the game's
  later plot wins; the plots only 30:17's look holds (31:15, 32:16, 32:17,
  32:18) are land no unit of the city-state saw (its army records hold
  Rome's Warriors on 31:15 / 32:16 unseen at t62). t67 / t89 / t93 / t95 /
  t97: the Galley ends Operation Move on 30:19 with 1 Movement left (records
  68 / 90 moves 1) and Naval Patrol moves it no further; the engines' patrol
  then takes the fallback 30:18 (822 // 866). The interpreter runs Pillage
  and Patrol after Choose Target's subtree (0x7cb3d0 executes every SUCCESS /
  RUNNING node in node order; 0x803880 RUNNING with units), and 30:18 passes
  every test read here, so what stops the patrol after a move is unread (the
  formation's Movement +0x218 the search starts on, 0x271909, against the
  unit's +0xdb0 after the move: unread). t66 / t68 / t72 / t74 / t76: the
  hurt Galley's Move to Safety (C-99's "t66-75 the same hurt Galley stays").

## C-130: a city-state's government values on the city its update left; the boosts its city's turn earns land at once — READ, both twins

`minorResearchTurn`'s returned government step, run in `minorPhase` after
`minorAiTurn`, the Free Cities' after `freeDesire` (cpu/core/minorBuild.ts,
cpu/core/phase.ts); `detectBoosts` after `minorBuild`. GPU: `_cai_turn`'s
returned `government` (gpu/core/sim_civics.py), run in the minors' phase
after `_minor_ai_turn` and in `_free_cities_phase` after `_free_combat_desire`;
`_detect_minor_boosts` after `_minor_build` (gpu/core/sim_minors.py).

- CITY::GETYIELD (0x1cb8b0) reads a per-yield cache (city +0x31d8, 8-byte
  entries: the value, +4 the cached flag) while the game state is locked
  (game instance +0x458 at 1 or more), else computes afresh (0x1c5350). The
  lock 0x91e540 (from the AI turn start 0x608870 at 0x60889e) on its first
  count fires game signal +0x18f0 with 1; Player_Cities' handler 0x370080
  (bound by 0x36fe20) clears every city's cached flags (0x1cd040). So the
  flat bonus's wonder term (0x6c5bcf) reads the city as it stands when the
  AI turn reads it.
- THE GOVERNMENT VALUES (0x7b0330) read the city as its CityBuildAI update
  left it: the update's Food focus (0x5cdae0) re-places the citizens before
  them. runs/h1_duely1128 city-state 3 t16-t30: the focus toggling a turn
  apart, the Production 4 / 3 between the plots 399 and 445; Autocracy's
  wonder term on it and Political Philosophy 392.1 / 396.1 a turn apart as
  logged (ours a turn out of phase on the city before the focus). The
  research AI's analysis, the policy jobs and the City Analysis tables read
  the city before the focus (the research rows and Ilkum's policy job of
  1128 p3 t16-t22 as logged only so).
- A BOOST the city's turn earns lands at once, before the AI turn reads the
  civics: runs/h1_duely1128 Nazca's Holy Site completed t15 (AI_CityBuild.csv
  CONTRACT 28 COMPLETED), Game_Boosts.csv State Workforce t15, its t15
  analysis at 6 turns (State Workforce 144.9, Military Training 657.3 at 48
  turns as logged), Military Training inside the horizon and Equestrian
  Orders scored 5 that turn.
- Open: runs/h1_duely1124 city-state 3's Foreign Trade value +89 a turn
  early (t12 170.23 for the logged t13 170.2): its route value K over
  player 1's cities nonzero from its t11 turn (met t10, initiated by the
  city-state), the game's from t12 — player 1's trade list at its t11 turn
  or the knowledge base's met record a turn later, unread.

## H-1: the random Future tree — READ

`drawResearchTree`, `treePrereqs`, `treeBaseCost`, `requiredRows`
(`cpu/core/researchTree.ts`, `GameState.researchTree`); GPU
`_init_research_tree`, `_draw_tree_rows`, `tree_t_pre` / `tree_c_pre`,
`tree_t_cost` / `tree_c_cost`, `_prereq_t` / `_prereq_c` [B, N, N],
`_tree_lv_t` / `_tree_lv_c`, `_tree_leaf_t`, `_tree_lin_c`; the replay's
`importResearchTree`.

- At the game's set-up (0xa56500) the civics' tree (0x2976d0) and then the
  techs' (0x351fc0) are drawn on the synchronous generator. Per row in table
  order a random-cost row (TechnologyRandomCosts / CivicRandomCosts) draws
  one of its Costs whose level holds fewer than 7 rows, uniformly ("Choosing
  a random cost for a tech to have"); every row joins its Cost's level.
- The levels ascending; a level's candidates are the rows of the nearest
  lower level holding any, weight 100, in table order. Each RandomPrereqs row
  (Technologies_XP2 / Civics_XP2) of the level draws its count over
  ceil(candidates / the level's rows) ("Choosing how many prerequisites ..."),
  plus one, at most the candidates, then that many weighted picks (0x353070,
  "Choosing a random prerequisite ..."), a pick kept once and its weight set
  to 1 (0x354000) for the level's later rows.
- Confirmed: every tree draw's range on runs/h1_duely1117-1128 as the rule
  takes it (setup draws 98-137). runs/h1_duely1124: Seasteads on
  Nanotechnology, Cybernetics on Nuclear Fusion, Smart Materials on
  Robotics, 377 / 516 / 516 turns at t216 as logged; the city-states'
  Future picks t210-235 53 of 53, every research score of the window as
  logged.
- The replay reads the tree off the draw log's set-up draws; a recording
  that kept no log draws one on its first record's seed.

## H-1: a city-state's units' boosts in the replay

The replay runs the city-states' units on a copy and lays their
improvements, clearings and routes after the engine's turn
(`minorLaysAfter`, `minorClearsAfter`); the boosts those earn land there
(`detectBoosts` per city-state), after the research AI's turn, as the game's
do: runs/h1_duely1121 t41 city-state 4's Currency (its Trader's route),
Archery taken in record t42; t47 city-state 2's Currency, t50 its Water Mill
on a chop (Construction); runs/h1_duely1124 t49 a Quarry (Masonry);
runs/h1_duely1117 t46 a resource Farm (Irrigation). The research the AI's
turn left is AI_Research.csv's RESEARCHING row (`Ctx.researchAtTurn`).

## C-126: the second hook's purchase sits out the trees after it; an operation a recruit empties ends at its tick — the turn-done offer (0x60a8c0, 0x60a440) READ, the empty operation's end a log reading, both twins

`cityStateMilitary` (`cityHook`), `robbedOps` (`recruitUnits`, `tickTree`);
`_mops_run` (`city_hook`, `view["robbed"]`), `_u_recruit`.

- A UNIT THE SECOND HOOK BUYS (its threatened city's TryPurchaseUnits, in
  pass 2 ahead of the trees of priority 2) has its turn done at its
  creation (0x60a440 on player signal +0x60), so the recruit's offer
  (0x60a8c0: turn not done +0x530) of a priority-2 tree after the hook
  holds it not: runs/h1_duely1121 t30 city-state 3's Galley 524294 bought
  (CityMadePurchase after City Defense's moves), Naval Superiority logging
  "No recruits to reach minimum", its target 41:19 kept, City Defense
  taking the Galley at t31; runs/h1_duely1127 t39 city-state 3 the same.
  The engines end the turn of each unit the hook made (`passEnd`; the
  GPU's `done` over the pool slots the hook filled).
- AN OPERATION A RECRUIT EMPTIES: a higher operation's Recruit Units taking
  the last unit of an unlocked lower one (the recruit signal +0x1c8 and the
  tree listener 0x7d1e40) ends the lower one at its tick, no node of its
  tree run: it logs "Operation complete" alone and its recruit's contract
  is CANCELLED at the end look. runs/h1_duely1128 t32 city-state 4's
  City Defense takes Attack Barb Camp's Archer (contract 83 CANCELLED);
  1124 t19, t29, t42, t99, 1121 t13, t21, 1127 t15, 1128 t37 alike; 1124
  t28 Attack Barb Camp, one of its two Warriors taken, recruits on. An
  upgrade tree's take (Find Available Unit) does not: runs/h1_duelw1121 t89
  Naval Superiority, its Galley taken, logs its recruit and completes after.
- OPEN: the site that ends the emptied operation (the listener's caller
  0x7cbb40 or the operation's own update) is unread; the captor of a
  barbarian capture stays listed in its old operation through the end look
  (runs/h1_duely1121 t68: Barbarian Attack's three, Builder Capture's
  Settler and Warrior), the engines drop it at the capture.

## C-95: the danger map's search pays no zone of control, a ranged unit strikes from its range; the rampage strike's ring — READ (0x26df90, 0x26e920, 0x771670, 0x691f0, 0x76ecf0), FIT (the ranged unit's strike), both twins

`search` (its standToAttack link and price's zone branch), `turnsToPlot`
(its `laterTurns`), `strike` (cpu/core/tactical.ts); `_tac_search` (`stand`'s
`atk_n`, no `zp`), `_tac_rampage`'s ring (gpu/core/sim_tactics.py).

- THE REACH SEARCH 0x26df90 adds 0x800 to the flags it is given (bts eax,
  0xb at 0x26e12f) before the search 0x7a630 with no destination; the cost
  0x26e920 runs the zone of control 0x26f980 only with +0x398 & 0x800 clear
  (at 0x26eb27). The danger map's call (0x716739, flags 0x311) so pays no
  zone: runs/h1_duely1127 t4, the barbarian Scout on 5:12 (hp 10) flees to
  4:13, 5:13 beyond it in the danger of city-state 3's Warrior on 4:12;
  runs/h1_duely1121 t26, the Scout on 4:18 (hp 53) flees to 5:19, its plot
  in the danger of player 1's Warrior on 5:16 through 4:17; h1_duely1124
  t11, the Scout on 37:6 goes to 36:6. The danger map's range list walks
  the same reach list (0x7167b0 over [rbp-0x51]) as the reach's own add
  (0x716930).
- FIT: in the danger map's search a unit with a range strikes by stepping
  onto no plot (no attack node), its range covering the plots beside its
  reach: runs/h1_duely1124 t53, the barbarian Archer on 40:8 reaches 39:8 /
  39:9 beside city-state 4's Warrior on 38:8, 36:7 three plots from them
  holds no danger and its Warrior 327683 Heals there as logged. Unread: the
  attack node's own test for a ranged mover in 0x2720a0 / 0x271be0.
- THE RAMPAGE STRIKE 0x771670, a ranged unit beyond its range of a fighter
  or COMBAT_DISTRICT: with a planning (+0x1fc0; none, no move), the first
  plot of the planning's reach of turn 1 with Movement within its range and
  no own stacking unit (0x771a84..0x771b17); with none, the ring of the
  target at max(range, 1) (0x6b1b0 -> GetRingPlots 0x6b130 -> 0x691f0: the
  ring at that radius, its six corners (0,1), (-1,0), (1,-1), (0,-1),
  (1,0), (-1,1) times the radius, each walked along its next side 1, 2, 0,
  4, 5, 3 — `ringPlots`' ring at that radius) through the functor
  0x76ecf0, which keeps the first plot whose path 0x272a60 under flags 0
  answers turns (no 0x1000: no turn of it ends on its own stacking unit,
  the plot the path's last); then MOVE_TO (0x962190) on the plot found,
  the strike (0x964a40) where the move brings it in range.
  runs/h1_duely1121 t30 / t51 / t57 / t60: the rampaging Quadrireme 786443
  sails 9:1 -> 8:4, 8:5 -> 7:7, 6:9 -> 7:7, 7:7 -> 8:5 toward its targets as
  logged; h1_duely1127 t52 / t69: the Quadrireme 1769491 on 32:21 / 32:20
  for 35:22 stays (Barbarian Rampage, then HL: End Turn as logged), the
  ring's one plot it has a path to, 35:23, its own Galley 917516's.
- Open: 1124 t119 the Caravel 4587523 on 31:19 and t125 the Galley 1376265
  on 28:6, 1127 t121 the Musketman 4325382 on 11:3, 1128 t159 the
  Man-At-Arms 5505044 on 40:15 flee (Move to safety) where the game's
  strike (Attack Units / Wander): the enemy ships and units beside them
  now reach their plots; 1121 t28 the Scout 1441809 on 7:17 takes 8:17, the
  game's 7:15 (our danger 15 from player 1's Slinger 327682 on 6:14).

## C-129: a unit made anew that no plot takes is destroyed, its own plot refused by a hostile defender alone; a bankruptcy's disband before the look — READ, both twins

- THE TRANSFER (0x93fa10, the unit manager's vtable +0x80 at 0xd92c18; the
  levy's return 0x4502b0 calls it with the 5th argument 1): the old unit is
  destroyed (vtable +0x60, 0x941130), a new one of the new owner made off
  the map (vtable +0x48), then placed at the old plot by 0x586d40 with flags
  1 and 0x10. Placement answering 0 destroys the new unit (0x93ff0b): no
  unit of the new owner stands. 0x4502b0 destroys each levied unit instead
  of transferring it where the minor is dead (Player +0x728, the alive flag
  IsAtWarWith and CanEarnGreatPeople read). The placement's own plot is the
  location test 0x586360: terrain, another player's closed ground or
  district, a hostile defender; never another's civilian nor the owner's
  own units.
- Ported: `jumpMadeAnew` / `_jump_made_anew` answer whether a plot took the
  unit; `levyUnitHome` and `levyUnits` destroy the unit where none did (its
  records not those of a unit made anew: no unit stands under the new id),
  `_jump_made_anew` clears it from the pool. The unit's own plot is kept
  past another player's civilian and its own units, refused by a hostile
  military unit (`unitIsMilitary` and `unitsHostile`; the GPU's military and
  embarked planes through `_seats_hostile`).
- Confirmed: runs/h1_duely1124 t82, China's levied Warrior 1638402 on
  city-state 2's ground 13:14 removed at city-state 3's start with no unit
  added (no plot round it revealed to city-state 3): city-state 3's and
  city-state 2's knowledge bases t82-t103 as the aimem log sites hold them.
  runs/h1_duely1117 t42, the levied Warrior 720902 home as 655361 on 36:13
  under China's Trader, city-state 3's records at t42 as logged.
- A BANKRUPTCY'S DISBAND (`bankruptcy`) comes at the player's start between
  its research and civic steps, before the tactical look (0x785f30): the
  disbanded unit's own record keeps its last sighting, aging on. Every
  city-state loss of the five duely duels at its start removed between the
  ResearchChanged and CivicChanged events, the treasury at 0 after it, logs
  one age past its last sighting (1117 t184 Bombard 1835012; 1121 t165
  Skirmisher 2293760, t178 2818053, t185 2883588; 1128 t132 Man-at-Arms
  2031619, t178 Line Infantry 2490374); the losses after ResearchChanged(-1)
  (the AI's research job, its tactical look before) with gold left log age
  0 (1117 t104 / t179 / t240, 1124 t118 / t130, 1127 t51 / t122, 1128
  t98 / t117). The engines record no loss (`bankruptcy` /
  `_bankruptcy`).
- Open: the bankruptcy's victim — the game's 1128 t132 Man-at-Arms 2031619
  and t178 Line Infantry 2490374 stand after units with upkeep earlier in
  the record's roster (`bankruptcy` takes the first).

## C-99: Defend Units' ship release and the team update's members — READ (0x73d1f0, 0x73fba0 at 0x73fc75 -> 0x732cd0), both twins

`Operation.released`, `opJobUnits` (cpu/core/operations/operation.ts), the
release in `passDefend` (cpu/core/opsOrders.ts) through `DefendOrders.execute`,
the drop in `refreshStrengths` (cpu/core/operations/nodes.ts), the job sets
`assigned` (manager.ts), `minorOpUnits` (minorOps.ts), `jobOf` (tactical.ts),
Naval Patrol / Naval Pillage over `opJobUnits`; the importer's released
members (cpu/harness/gameAiImport.ts). GPU `mops_rel`, `_mops_jobs`
(`_mops_op_units`, `_mops_held`), `_x_defend`, `_mops_refresh`,
`_job_members` (gpu/core/sim_minorops.py).

- THE RELEASE (0x73d1f0, Defend Units' execution, the hurt branch: a ship off
  friendly ground): the unit's assignment (the watched +0x778, its value
  +0x7d0) to -1; the erase from the teams runs on stack copies of them, so
  the team keeps the unit as a member through the tick — Operation Move
  (over the team's members) still moves it — but it is in no job of the
  operation: Naval Patrol and Naval Pillage (0x6092c0 on +0x7d0) skip it,
  the recruit's offer (+0x7d0 == -1) and the tactical pass take it free.
- THE DROP (0x73fba0, called with the operation's id from the refresh
  0x73f7d0): at 0x73fc75 the members are filtered (remove_if 0x732cd0, the
  count +0x28 cut) to those alive (+0x770) whose +0x7d0 is the operation's
  id — the released (and the dead) leave before the team line and the
  readiness, so the operation reads "Not Ready" and its Recruit Units takes
  the unit back (its minimums, then its strength over the same offer).
- THE RECRUIT'S STRENGTH OFFER: the units the minimums took stay in the
  offer the strength reads (the five duely duels: 165 of their 332 minimums
  lines are followed by the same unit's "Recruiting strength", none by "No
  recruits to match strength") (`recruitOperation`, `_mops_recruit_team`).
- THE IMPORT (`--memory aimem`): a member whose assignment at the end look
  (unit +0x300 FinalRelease) is not the operation's tree id is released.
- CONFIRMED (runs/h1_duely1127 city-state 3's Galley 393216, damage 60, a
  one-seed aimem trace t60-150): t66 / 68 / 72 / 74 / 76 / 102 / 106 / 108
  Move to safety; t67 "Not Ready", Recruiting minimums and strength
  UNIT_GALLEY, "1 units, Recruited 1", Operation Move 30:16 -> 30:19 and no
  patrol after (t89 / 93 / 95 / 97 / 101 likewise); t114-128 and t139-144
  Heal on 27:15 / 27:12 as AI_Tactical.csv logs.
- OPEN: the barbarians' release (their hurt ships keep their job); the
  Galley's Operation Move ring plots once Naval Patrol no longer moves it on
  (t103 29:17, t109 / t113: the game's move order refused, the Galley holds);
  its Protect Units safe plot after the re-recruit (t88 / 92 / 94 / 96: the
  game's 28:17, ours 29:15); t129 Move to safety from 27:15 (our danger map
  0 there, the game's 30).

## C-130: a city-state's Great Person points store, its Faith and its flat bonus; Bastions' strike on standing walls — READ, both twins

`projectGreatPersonRows` / `projectGreatPersonPoints`, `minorFinish`,
`minorEconomy`, `CityState.gpPoints` (cpu/core/minorBuild.ts), the view's
`greatPersonPointsPerTurn` and `cityStrike` (cpu/core/aiView.ts),
`EFFECT_ADJUST_FLAT_BONUS` / `EFFECT_ADJUST_CITY_RANGED_STRIKE` (cpu/core/
aiModifiers.ts), the replay's `MINOR_STORES`; GPU `citystate_gp_points`,
`_minor_finish`, `_minor_economy` (gpu/core/sim_minors.py), `_pol_analyze`
(gpu/core/sim_policy.py), the rules' project column `mgp` and
`civic_ai.gpClassTypes`.

- THE STORE (Player_GreatPeoplePoints, player +0x1360): the synced array at
  +0x110 (its data +0x168) holds a fixed-point value per Great Person class.
  The turn 0x43c190 rewrites it (0x439b30 per class, then 0x43b1c0 adds it
  to the total) only where CanEarnGreatPeople (0x43a980) holds; a city-state
  never passes, so nothing rewrites it.
- THE GRANT 0x43d510 (project, city): per Project_GreatPersonPoints row its
  Points (0 for a class on the player's +0x628 list) x (100 + a bonus
  percent from the district's buildings) / 100, through the progression
  0x5267a0 (type 1, the row's PointProgressionParam1, the game's progress)
  where the row's model is set, added << 8 into the store's class and into
  the total. Ported for a city-state's district project: Points + (Points x
  Param1 / 100 - Points) x pct / 100, the bonus 0 (no city-state building
  carries one).
- THE FAITH: GetFaithYield 0x496fd0 -> 0x494090 adds 0x43c9a0, the store
  summed over the classes the player cannot earn (0x2f1ed0) — a city-state's
  every class. Confirmed on the records' faithYield: runs/h1_duely1124
  Bologna's Campus Research Grants t35 (9%) 16, t40 (11%) 17: 16 / 33 from
  records t36 / t41; runs/h1_duely1121 Hunza's Commercial Hub Investment t68 /
  t77: 26 / 56; runs/h1_duely1128 Nazca's Harbor Shipping t68: 23 — the
  engines' store the same.
- THE FLAT BONUS'S GREAT_PEOPLE TERM (0x6c5e45) reads the store per class x
  the Amount as the class's pseudo-yield, between: for a city-state the
  points its district projects added. runs/h1_duely1124 Bologna (player 4):
  Political Philosophy and its five dependants +71 at t36-41 and +147 at
  t42-44 above the store-less value (Autocracy's, Oligarchy's and Classical
  Republic's terms on 16 / 33 Great Scientist points), as logged.
- BASTIONS' STRIKE: EFFECT_ADJUST_CITY_RANGED_STRIKE 0x6a69c0 calls 0x249ee0
  with its flag clear, which returns 0 unless 0x24b960 holds (the district's
  outer damage +0x8d8 below its outer maximum 0x198310: walls standing). So a
  wall-less centre's strike term is 0: runs/h1_duely1117 city-states 2 and 4
  unlogged Bastions t47-56 / t48-63 on a trained ranged strike of 20 or more, 7.0 from their
  walls; runs/h1_duely1128 city-state 4 t37-39.
- Open: the grant's bonus percent (the player property 0x27be6039 times the
  district's buildings, 0x43d5f9) and the +0x628 class list are not ported
  (no city-state recording reads them); a major's store between its turns
  (the flat bonus reads it, the engines read `greatPersonPointsPerTurn`).

## C-99: an operation's start takes its strengths; a unit's AI strengths with its formation — READ (0x73a120, 0x56dc90, 0x56e3e0, 0x56daa0, 0x1497d0), both twins

`startOperation` (cpu/core/operations/manager.ts) through `refreshStrengths`;
`barbOpStart` (cpu/core/barbarianOps.ts); `aiStrengths`, `aiFormed`,
`aiRanged` (cpu/core/tactical.ts), read by `unitView` and `militaryStrength`
(cpu/core/aiView.ts). GPU `_mops_start` (gpu/core/sim_minorops.py),
`_barb_captures` (gpu/core/sim_barbops.py), `_ai_combat`, `_ai_formed`,
`_ai_ranged`, `_ai_bombard` (gpu/core/sim_tactics.py) at the members'
strength (`_mops_units`, `_barb_ops_refresh`), the endangered sum, Garrison
City, the danger map, the flee test and the stored unit strength
(`_store_unit_strength`).

- THE START (0x73a120): after the teams (0x73a5e0) and the target and rally
  (0x73e7d0), before the "Started" line, the enemy's strength about the
  target (0x73eb60) and the team rebuild and update (0x73f7d0, dl 1: the
  team update's fifth argument, which only skips its member release at
  0x73fffd). The start by name (0x7265b0) passes enemy -1 (the watched
  +0x248, value +0x2a0); the barbarians' city assault (0x1497d0) sets its
  enemy after it, so the start counts every player.
- THE AI STRENGTHS (0x56dc90 with dl 0, 0x56e3e0, 0x56daa0): the type's
  Combat (embarked: the era's EmbarkedStrength), RangedCombat, Bombard, each
  plus the unit's own term (+0x18a8 / +0x18ac / +0x18b0) where above 0; a
  strength above 0 adds the formation's (+0xc90: 1 a Corps,
  COMBAT_CORPS_STRENGTH_MODIFIER gp +0x198; 2 an Army,
  COMBAT_ARMY_STRENGTH_MODIFIER gp +0x17c) and the player's 0x4f2b50 term;
  Combat and RangedCombat then 0x56df30 (unit +0x1170 x the era's
  ChronologyIndex). The operations' member strength, the recruit's offer,
  the danger map and the standing strength read them.
- CONFIRMED (one-seed aimem traces): runs/h1_duely1117 t9 the barbarians'
  Barbarian Attack on 12:19 at Target Str 43 in its start turn, its tree
  unticked; runs/h1_duely1121 t33 Barbarian Attack's 53 likewise;
  runs/h1_duely1124 t184-212 city-state 3's Attack Barb Camp with the
  Cuirassier Corps 1835008 (UnitFormCorps t149) at the game's 58-90 (t190:
  70 = 64 + 10 - 4 at 40 damage); runs/h1_duely1117 t169-179 city-state 3's
  and t203-213 city-state 4's City Defense with their Corps at 70 / 90 /
  100.
- OPEN: the knowledge base's records carry no formation (0x5eadb0's kinds
  1 / 2 add the same terms to an enemy's Corps / Army: the target side);
  the unit terms +0x18a8 / +0x18ac / +0x18b0, +0x1170 and 0x4f2b50 held 0;
  a capture's start reading a record the game adds later (1117 t33 the
  Scout 851971 on 33:12, 33 against 23); 1124 t111 a capture's start at 167 against 97, untraced.

## C-129: the bankruptcy's victim and every seat's upgrade to the furthest rung — READ (0x4e05e0, 0x5374c0), both twins

`bankruptcy` (cpu/core/phase.ts) through `seatPoolSlots` (cpu/core/tactical.ts)
and `promotionsHeld` (cpu/core/units.ts); `upgradeType` (cpu/core/stockpile.ts)
read by `canUpgradeUnit` / `upgradeUnit`, `minorUpgradeVisible` /
`minorUpgradeUnit`, the replay's upgrade. GPU `_bankruptcy`
(gpu/core/sim_orders.py, `_seat_pool_slots` first), `_upgrade_type_of`
(gpu/core/sim_seats.py) read by `_upgrade_ok` / `_upgrade_units`.

- THE VICTIM (0x4e05e0, once per disband 0x4dd270 counts): over the player's
  unit list (Player +0x12e8 +0xd8, slot order — the id's low 16 bits), a unit
  whose Units.Maintenance less the treasury's per-unit discount (+0x338) is
  above 0 is a candidate. The first candidate sets both minima; a later one
  becomes the victim where it carries strictly fewer air units (0x929790,
  none in these engines) or holds strictly fewer promotions (0x55e710 on its
  experience record +0x1bc0). So the victim is the first candidate, in pool
  order, holding the fewest promotions.
- THE POOL ORDER: a unit holds its slot from its making (the free slots a
  stack: 1128 city-state 3's slots 1, 6, 9 freed t164 / t166 / t176, the
  Field Cannon made first takes 9, the Line Infantry 6); the engines give a
  city-state's and the Free Cities' units theirs at the tactical pass
  (`poolSlots`), so the bankruptcy brings the pool up to date first. The
  replay's per-turn world stands the record's units of a city-state and the
  Free Cities in the game's slots (the id's low half), as the barbarians'.
  A major's units keep `state.units` order (its pool is not modelled).
  Not a bankruptcy: 1117 t179's Bombard 1638405 (shortfall 7, removed after
  the research job).
- Confirmed: runs/h1_duely1128 t132 city-state 3's Man-at-Arms 2031619
  (slot 3, no promotion) after three Men-at-Arms with one each (slots 0-2);
  t178 its Line Infantry 2490374 (slot 6) before the Field Cannon 2424841
  made before it (slot 9); runs/h1_duely1121 t165 city-state 4's Skirmisher
  2293760 (slot 0) before 1638401 (slot 1); its t178 / t185 losses. 1128's
  city-state 3 knowledge base t90-t108 and t132-t153, 1121's city-state 4
  t165-t189 (but t177) as logged.
- THE UPGRADE TYPE (0x5909a0 -> 0x5374c0, 0x5375f0 the rung with the
  player's unique standing in for it, 0x537fd0 its PrereqTech / PrereqCivic)
  is every seat's: the furthest rung of the line whose every step is held.
  The upgrade's Gold (0x590520 -> 0x5376d0) and its resource (0x591000) read
  the same type. runs/h1_duely1124 t178 China's Quadrireme 1572876, Square
  Rigging and Refining held, UnitUpgraded to the Battleship 6160397 past the
  Frigate; 1124's knowledge bases to t180 as logged.
- Open: 0x4dd270's disband count reads floor(S / 10) for the shortfall S
  where the lab's runs/bankrupt_m35 lost one unit a turn at S 35
  (`GOLD_DISBANDS_PER_TURN`); its balance operand (+0xf8 >> 8) unidentified.

## C-119: the rivers' names on the visibility count — READ (0x58aa90 -> 0x534950, 0x508d50, 0x508330), ported both twins

- THE CALL: the unit sight update 0x58aa90 (a move 0x58f3f0, a placement
  0x586d40) changes the unit owner's count per plot of the look (0x508d50) and,
  where it answers 2 (a count rose from 0), calls 0x534950 with the plot and
  the owner — its first-revealed flag (the sixth argument) is not read. 0x534950
  names the plot's rivers (0xa29730) for a FULL_CIV owner where the plot's
  +0x37 is above 0. A move adds the new sight before it drops the old.
- THE COUNT: 0x508d50 walks the players receiving the owner's visibility
  (0x50a510: the owner, and a suzerain the city-state shares with, 0x508330
  adding the giver's own count +0x288 into the receiver's +0x290). So a plot a
  suzerained city-state sees is visible to the suzerain, and its own unit's look
  there names nothing; a city-state's unit's look names nothing (not FULL_CIV).
- Ported: `nameRiversInLook` (cpu/core/disasters.ts) from `majorLook`'s own-unit
  looks, `seatSeesPlot` (cpu/core/fog.ts) the count's test with the stepping
  units at the plot they left (`Look.mover`: `stepUnit`, `spawnUnit`, the melee
  advance, the portal); `_name_rivers_look` / `_seat_sees_plot`
  (gpu/core/sim_masks.py) from `_reveal_around` (`movers`, `from_tile`), the
  start units' looks at the load. The importer replays the records' unit events
  (`recordRiverNames`, cpu/harness/riverNames.ts); the action replay walks the
  majors' units in their first logged step's order (`syncUnits`).
- Confirmed: every flood river of runs/h1_duely1117, 1121, 1124, 1127, 1128
  named in the logged turn (Game_RandomEvents.csv's Floodable Rivers, counted
  the turn after), in the engine replay and the importer alike; runs/h1_duely1124
  the Salween at t72 (China's Catapult on 39:9 takes 41:9; 40:9-41:12 in
  Granada's sight shared from t51, China's Heavy Chariot, whose look held 41:9,
  gone first), Granada's floodplain Farm on 524 at t72 as logged.
- Open: a plot's owner change inside a turn (0x84760's count) is not replayed by
  the importer; an ally's shared sight (Poundmaker) is not a receiver.

## C-128: the army records' formation in the army strength; a capture's start before the end look — READ (0x5eadb0 at 0x5eaf79), both twins

`ArmyRecord.formation` (cpu/core/types.ts) set by the looks and the attacker's
record (`setRecordFormation`, cpu/core/units.ts; `knowledgeLook`,
`recordAttacker`), carried by `knownOf` (cpu/core/minorOps.ts) into
`armyStrength` (cpu/core/operations/evaluate.ts); `barbarianTactics`
(cpu/core/tactical.ts). The import of the game's records (cpu/harness/replay.ts)
takes the entry's +8. GPU `citystate_kb_form` (gpu/core/sim_minors.py
`_knowledge_look`, `_kb_birth`, `_kb_attacked`), `_mops_records`' form and
`_mops_army_term` (gpu/core/sim_minorops.py), `_barbarian_tactics`' close
(gpu/core/sim_tactics.py).

- THE RECORD'S FORMATION (0x5eadb0 over 0x5ef760's out list, 0x20-byte
  entries: +4 the damage, +8 the formation): per entry the damage term, then
  kind 1 adds COMBAT_CORPS_STRENGTH_MODIFIER (gp +0x198) and the player's
  0x4f2b50 Corps term (r13), kind 2 COMBAT_ARMY_STRENGTH_MODIFIER (gp +0x17c)
  and its Army term (r12); -1 (a unit that forms none) and 0 add nothing.
  The aimem records' third field is that +8: runs/h1_duely1124 city-state
  3's Cuirassier 1835008 reads 0 to t148 and 1 from t149 (UnitFormCorps) in
  every holder's records. The known cities' term behind the flag (+0xf8)
  is off at the enemy strength's calls (0x73ecda / 0x73ecf4 pass 0).
- THE CAPTURE'S START: the barbarians' captures start their operations
  (AI_EVENT_UNIT_CAPTURED, 0x7265b0 -> 0x73a120) on the knowledge base their
  pass left, before the turn's end look: runs/h1_duely1117 t33 Barbarian
  Builder Capture on 31:14 at Target Str 23 (the known city's term alone),
  the Scout 851971 on 33:12 (10) in the end look's records only;
  runs/h1_duely1124 t111 the capture's start at 97 (167 on the end look's
  records).
- OPEN: the Corps / Army terms of 0x4f2b50 held 0; the city threat
  (`knownThreat` -> 0x5cbd10) and the minors' standing army by record read
  no formation.

## C-128: the standing army's home and Garrison City's DEFENDER — READ, both twins

`minorStandingArmy` (cpu/core/minorCityAi.ts: `Unit.aiDefender`,
`Unit.aiHomed`), `garrisonExecute` (cpu/core/operations/assault.ts) through
`defenderAiType` / `ownAiType` (cpu/core/opsOrders.ts), `minorUpgradeUnit`
(cpu/core/minorBuild.ts). GPU `_minor_standing_army`
(gpu/core/sim_minorai.py: `unit_defender`, `unit_homed`), `_x_garrison`
(gpu/core/sim_minorops.py), `_minor_upgrade_unit` (gpu/core/sim_minors.py).

- THE HOME: a unit's AI type (the watched +0x168, value +0x1c0) and its home
  (the watched +0x1178, value +0x11d0) are two fields. The standing army
  (0x5ca7e0) counts a DEFENDER only where it is homed on the city, in an
  operation or not; it writes the home where it takes a unit (the city's
  +0xf8) and where it drops one (-1). The other writers of the home: the
  unit's init (0x5657b2, -1) and a city's capture (0x5c9d40 from 0x1fdea0:
  the capturing unit's assignment -1, DEFENDER, homed on the city). Recruit
  Units' update turns every unit of the operation its type's own AI type
  each tick (0x81cbb2, 0x79b9c0) and leaves the home.
- GARRISON CITY (0x810d30) writes the AI type alone: a stronger candidate
  swapped in takes DEFENDER and the garrison its type's own (0x81132d,
  0x81135e); with no stronger candidate the garrison takes DEFENDER whether
  it fortifies or not (0x8111c2 -> 0x811359); a candidate moved in with no
  garrison takes none (0x811124). Recruit Units running first in Simple City
  Defense, the garrison is the one member a standing army counts, and only
  where the army homed it before its recruit.
- AN UPGRADE is a new unit (a new id in the records): its type's own AI
  type, homed nowhere.
- THE POOL ORDER: the army walks the units in pool order with the pool
  brought up to date first (`seatPoolSlots`), a unit made this turn in its
  slot.
- CONFIRMED (one-seed aimem traces, AI_Military.csv's Combat Desire):
  runs/h1_duely1127 Mexico City t70-79: t70 its Heavy Chariot 655362 moved
  onto 8:10 with no garrison (no DEFENDER), the garrison from t71 (homed by
  the army at t69): 0.3 / 0.2 / 0.2 / 0.1 at t72 / t73 / t74 / t75 (an Archer
  joining) and 0.0 at t79 as logged; runs/h1_duely1127 city-state 2 t37-44
  -0.1 with its homed garrison over a quota of 2, 0.0 once the garrison's
  upgrade is a new unit; runs/h1_duely1124 city-state 3 t27-45 (its Warrior
  589824 made on slot 0 at t27 joins ahead of the older ones; 720900, made
  on slot 4 at t29 with the quota of 1 full, recruited, City Defense's
  garrison t30-39 never counted: 0.1 / 0.2 as logged).
- OPEN: the EXPLORE clause and the +0xf30 release of 0x5ca7e0; whether an
  upgraded member leaves its operation (runs/h1_duely1117 city-state 4
  t93-94: 0.2 / 0.1 against the logged 0.0); the Free Cities' garrison in
  the GPU twin (`_x_garrison` reads the minors' pool).

## C-99: the stacking count holds other players' units, the wanders' kept-out plots, a Harbor's water no shore — READ (0x585d90, 0x585eb0, 0x2720a0, 0x77bf50, 0x77b9a0, 0x530240), both twins

`groundOf`'s `crowded` and `peaceHeld`, the turn-end test in `search`,
`keptOut` in `wanderNearCity` / `wanderNearCamp`, Wander Back to City's
move under flag 0x1000 (cpu/core/tactical.ts); `shoreCrossing` in
`stepCost`, the search's and the walk's carry (cpu/core/units.ts,
tactical.ts). GPU `crowd_n` in `_tac_search`, the Wander candidates over
`_tac_peaceful`, `_harbor_exit` in `price6` / `_tac_step` / the walk
(gpu/core/sim_tactics.py), the step's dock in gpu/core/sim_seats.py.

- THE COUNT (0x585d90, over a plot's unit list of the mover's map layer):
  a unit at war with the mover counts none (IsAtWarWith 0x3dcec0); one of
  the mover's player counts where its type stacks with the mover's (vtable
  +0xb8); one of another player counts but a unit whose info holds
  MakeTradeRoute (+0x1b9 bit 0x40) or Spy (+0x1ba bit 2), and but a pair
  0x518f40 lets share a plot (owners apart, both +0x1ce0 above 0, their
  +0x1ce4 apart, 0x93f090 false: none on the five duels). 0x585eb0 takes
  the most over the formation's members.
- THE PATH'S TURN END (0x2720a0's walk over the parents, the node's +0x54
  from 0x585eb0 at its first visit 0x271be0): a node after which a turn
  begins, on a plot the player sees now, refused where the count reaches
  the stacking limit — another player's unit at peace in sight as its own
  stacking unit; flag 0x1000 tests the first turn alone, the planning
  (flags & 4) none.
- THE WANDERS (Wander Near City 0x77bf50 at 0x77c2e5, Wander Near Camp
  0x77b9a0): a reach plot of turn 1 is a candidate only where 0x585eb0 over
  its list (0x75c50 on the mover's layer) counts none — another player's
  unit at peace keeps it out whether the player sees it or not. Wander Back
  to City moves to the alternate plot with flag 0x1000 (0x77c505).
- A HARBOR'S WATER (0x530240 at 0x530289..0x5302c8): a step off a water
  plot whose district takes the formation (the plot's district word,
  0x81240 on the formation's +0x278) is no disembark: no embark cost, no
  Movement carried. Read as the Harbor (its replacements map onto it).
- CONFIRMED (one-seed aimem traces to t200, runs/h1_duely1117 and 1121,
  no other kind moved): 1121 t81 city-state 4's embarked Man-At-Arms
  1048577 on 36:19, player 0's Warriors on the landings 36:18 / 35:19,
  sails to 38:18; 1117 t176 / 181 / 198 city-state 2's Line Infantry
  1179654 draws over 28 / 23 / 17 plots (RandCalls.csv), player 0's Warriors
  on the others; t176 its planning from its Harbor 14:7: 14:8 (1/4), 14:9
  (1/3) as AI_Planning.csv; 1121 city-state 4's Musketman 1310726 t113-125
  and Line Infantry 1703943 t145-188 Wander as logged.
- OPEN: a disembark onto an improved plot paid as a land step (runs/
  h1_duely1117 city-state 3's embarked Bombard 1769477 on 42:14 t185 plans
  41:14's Farm (1/2) and 41:15's Mine (1/0); 1121 / 1124 the same onto
  Farms, Pastures, an Alcazar; 0x530240's plot test at 0x530297 on the
  FROM plot only, unexplained); 1121 4:1048577 t82-98 the sail east past
  the north landings (our path lands at 39:16).

## C-124: a path enters a plot the player never revealed whatever it is — READ (0x2720a0 at 0x272372..0x27242e, 0x271be0's +0x50 bit 0x20, 0x26e920), both twins

`search`'s step (`blindStep`, `price`'s `wet`), `Ground.fits` in `reachPlots`,
`planUnit` and `dangerPlane` (cpu/core/tactical.ts); `_tac_search`'s
`unrev6` / `blind6` / `wt` / `fits`, `_tac_enter(foes=False)`
(gpu/core/sim_tactics.py).

- THE STEP'S VALIDITY (0x2720a0 at 0x272372..0x27242e): a land formation
  (+0x1f2) runs the embarking tests (0x52fe90 / 0x52fb90) and the location
  test (+0x50 bit 0x40, 0x586900 under flag 1) on a child the player revealed
  (+0x51 bit 0) alone, a naval one (+0x1f1) the location test the same: a
  child it never revealed is valid whatever its terrain, domain or units —
  never an attack. The turn-end tests (mountain, city, stacking) read a seen
  node only.
- THE NODE'S WATER (0x271be0 at 0x27203b / 0x27205b): +0x50 bit 0x20 is the
  plot's own water (bit 0x10) where it or its parent is revealed, else the
  parent's bit 0x20; the cost (0x26e920 at 0x26e9f2..0x26ea17) takes it for
  the step between two unrevealed plots.
- THE COST BETWEEN TWO UNREVEALED PLOTS (0x26e920 at 0x26eab2..0x26ead2):
  the parent's carry (+0x20), else 0x100 (one Movement); no movement rule,
  no cliff, no shore crossing, no zone of control. A later turn starts on
  the pool of the parent's water as the search takes it.
- THE LISTS (0x26d890 / 0x26dab0 -> 0x586900 -> 0x586360): a closed plot
  never revealed is listed (the reach, the planning's reach, the danger
  map's reach) only where the location test lets the unit stand there.
- Confirmed (one-seed aimem traces): runs/h1_duely1117 t24-33 the
  Galley 720906 on 31:2 "HL: Explore cur area" for the unrevealed coast 33:3
  behind the ice, its path round the map, walking to 29:0 / 26:1 as logged
  (the engines' "fallback" without the rule); h1_duely1121 t12 the Scout
  131073 on 12:20 "cur region" 9:18 past the unrevealed 10:16 / 9:17, t24-26
  "tertiary regions" 20:7 / 19:6, t29-62 Galleys 524295 / 1572882 "cur area"
  41:19 / 43:23 / 40:18; h1_duely1124 t15-21 Scouts 524295 / 131073
  "tertiary regions" 33:8 / 36:10 / 35:9, Galley 262147 t20-21 "cur area"
  1:10 / 32:18; h1_duely1128 t7 Galley 524295 "cur area" 42:4.
- Open: a move order's walk on such a path once a plot ahead is revealed
  impassable (the game re-plans: 1117 t26 the Galley 720906 from 26:1 walks
  25:1 / 25:2 / 25:3, the engines' path without flag 0x1000 refused by the
  turn ends on its own units 28:18 / 30:11 on a twenty-turn route);
  h1_duely1121 t41-77 the Scout 131073's "tertiary regions" 10:9 inside
  China's cities, no path in the engines (the zone of control of units the
  barbarians do not see, unread).

## C-128: a unit made anew leaves its operation and its standing army — READ, both twins

`minorUpgradeUnit` (cpu/core/minorBuild.ts), `unitMadeAnew`
(cpu/core/units.ts), `garrisonExecute`; GPU `_minor_upgrade_unit` and
`_kb_unit_anew` (gpu/core/sim_minors.py), `_x_garrison`
(gpu/core/sim_minorops.py) on the holder's pool (`_mops_u`).

- AN UPGRADE and A LEVY (granted or home) remove the unit and add one of a
  new id. The new unit's constructor (0x563cd0) writes its assignment
  (+0x7d0, written afresh at 0x563e50) and its home (-1 at
  0x5657b2): it is in no operation — the team update keeps a member alive
  (+0x770 clear) and assigned to the operation (0x73fba0 at 0x73fc75 ->
  0x732cd0), which neither the dead old unit nor the new one is — and in no
  standing army, of its type's own AI type, until the army takes it.
- GARRISON CITY runs on the holder's own pool: the Free Cities' garrison
  moves and takes DEFENDER as a city-state's does.
- CONFIRMED (one-seed aimem traces, AI_Military.csv's Combat Desire):
  runs/h1_duely1117 city-state 4 t91-94 (City Defense's garrison Catapult
  upgraded at t91; its Trebuchet 1179651 wanders at t92 and joins the army:
  0.0 at t93-94 as logged, City Defense three units); runs/h1_duely1121
  Hunza t56-63 (its levied Warriors home at t56, out of the army: 0.0 as
  logged); runs/h1_duely1124 city-state 4 t83-91 (its units added anew at
  t83: 0.0 as logged).
- OPEN: no recording holds a Free City, so their garrison has no case.

## C-129: the military AI's upgrade — READ (0x727db0, 0x6874d0), both twins

`minorMilitaryUpgrade` (cpu/core/minorOps.ts) from `minorMilitaryTurn`
(cpu/core/minorCityAi.ts) after the operations' evaluation; `canAfford`
(cpu/core/aiEconomic.ts). GPU `_mops_military_upgrade`
(gpu/core/sim_minorops.py) from `_minor_military_turn`
(gpu/core/sim_minorai.py), `_cv_can_afford` (gpu/core/sim_cityvalue.py).
Under the replay's hold the pick is not bought (`traceMinorUpgrade`): the
replay scores it as `unit.upgrade` against the UNITCOMMAND_UPGRADE the log
orders before the minor's PlayerTurnActivated, and lands the record's.

- THE WALK (0x727db0, from the military AI's job 0x722690 after 0x727510):
  the player's units in pool order (+0x12e8 +0xd8), alive and on the map,
  each with an upgrade type (0x5909a0, `upgradeType`'s furthest rung); the
  gain 0x79ca90(the unit production table +0x1290 +0x268, the upgrade) less
  0x79ca90(its own type), 0 for a type the table lacks; a unit is kept where
  its gain is above the best so far (strict: the first of equals), its full
  test passes (0x58fff0 r8 0 r9 0, `upgradeMayGo`: the research, the minor's
  ground, Movement left, the treasury at the 5 Gold) and the economic AI
  affords the upgrade's Gold (0x590520 << 8) at slot 1 (UNITS) with the
  reserve 0.5 (@0xd20458; 0x6874d0: the slot at the cost x (1 - 0.5), the
  SLUSH slot with it at the cost). After the walk the one unit kept, for a
  player no human drives, is bought (0x68c940, `upgradePurchase`): at most
  one upgrade a player-turn, before its turn opens.
- The table's values are N over the sum of count x efficiency on the
  knowledge base's records (1.0 every entry with none known): no upgrade
  while the minor's records hold no combat unit.
- THE LEVIED ARMY HOME is made anew with its whole Movement (`levyUnitHome`;
  GPU `_minor_levy_return`): runs/h1_duely1117 t42 city-state 3's Warrior
  720898 home on 32:14 steps to 31:15 in its turn; runs/h1_duely1121 t154
  city-state 2's Musketman 2424833 home on 10:6 passes the full test.
- Cases (carried, one seed each): the upgrades the log orders before a
  city-state's turn opens (at most one a player-turn) against the engine's
  pick: runs/h1_duely1121 t1-189 40 of 40, also under the game's AI memory
  (t61-t72 the Warriors, t73-t75 the Swordsmen, t91 the Galley, t96-t98 the
  Men-at-Arms, t154 the Musketman home from China's levy); runs/h1_duely1127
  t1-129 20 of 20; runs/h1_duely1128 t1-129 15 of 16; runs/h1_duely1124
  t1-129 9 of 10; runs/h1_duely1117 t1-59 1 of 1. A unit held in an
  "Upgrade Units" tree is walked like any other (runs/h1_duely1124 t77-t79).
- OPEN: runs/h1_duely1124 t47 city-state 2's Warrior 196610 on its ground
  with its UNITS slot at 2.9 Gold (the test's 2.5): the engine buys it, the
  game none before its turn opens (its tree upgrades it after), under the
  game's AI memory too — the savings' order against the military AI's job
  unread; the Free Cities' upgrade (no recording holds one).

## C-125: a melee unit's spot beside its target — READ (0x790c60 at 0x790faa..0x79103c, 0x776140's claim loop, 0x7702b0), both twins

`planUnit`'s `foreign` (cpu/core/tactical.ts, `foreignAt` on each entry's
plot); GPU `_tac_plan`'s "foreign" [N, E] (`_tac_foreign` gathered at the
entries' plots) read by `_tac_spot_link` (gpu/core/sim_tactics.py).

- THE SPOT BESIDE THE TARGET (0x790c60, melee, the link's plot one from the
  target's): with Movement left only the unit's own plot goes on; then
  0x75c50 fetches the TARGET's plot and walks its unit list (+0x50, count
  +0x60): a unit whose owner word is not the planning's player (+0x20) sends
  the link to the turn test with the distance still 1, and the range test
  (0x791044, distance above +0xc) drops it. So the next-turn / own-plot spot
  beside a target is laid only where no other player's unit stands on the
  target's plot (a COMBAT_DISTRICT nobody holds); against a unit target a
  melee unit's spots are the parents of its attack links alone, in the order
  the search prices them (the closing order of the parents), at the
  attack's turn. A plot one from the target reached with no Movement on the
  search's last turn lays none: its attack would fall on the third turn,
  past the search.
- THE CLAIMS (0x776140, 0x776780..0x7769cb): per target, per unit, the
  unit's planning entry's spots in their laid order; a spot's place in the
  assignment is its first claim's (0x77695a). The gain (0x7702b0) is dealt /
  turns (a kill +100, an overkill's health - damage + 100, a barbarian
  target x 0.8) — no blow back enters it, so tied spots go to the first.
- runs/h1_duely1128 t47 city-state 2: Swordsman 589827 on 12:5 against the
  barbarian Scout on 14:4 lays 13:4, 13:5, 13:3 (the parents of its attacks,
  turn 2, value 30 each) and takes 13:4 (189); Swordsman 720898 on 12:6 lays
  no spot against the Scout (13:5 / 13:3 reached at (2/0)) and takes 13:7
  (321, the parent of its attack on the Swordsman on 14:6), as logged
  (AI_Tactical.csv "Move 13 4" / "Move 13 7", AI_Planning.csv).
- OPEN: runs/h1_duely1124 t119 the barbarian Man-At-Arms 4521989 on 39:20
  moves for 37:17 ((2/0) in its planning) against player 1's Missionary
  3080203; the target entry's plot at the barbarians' turn is unread.

## C-124: the formation's kept path, and a path's other players' units — READ (0x272aa0, 0x26e3a0, 0x782d0, 0x586360 at 0x586542..0x5865a1), unported

The engines recompute every move order's path (`moveTo` -> `pathTo`,
cpu/core/tactical.ts; `_tac_move_to`, gpu/core/sim_tactics.py); nothing below
is ported.

- THE KEPT PATH (0x2726b0 -> 0x272aa0): a formation keeps the nodes of the
  last path it found (+0x638, goal first, its start last; +0x5d8 set; +0x6a8
  / +0x6ac the goal). With two nodes or more kept: where the goal node is
  flagged (+8 bit 1) and its plot is visible now, a path to that goal is
  searched (0x26ef40); else, where the node after the start is not flagged,
  the kept path is taken unsearched; else the node ending the path's first
  turn (0x782d0(nodes, 1): the last node of turn 1, walking from the start) is
  searched for, and on failure the requested plot. With fewer than two the
  requested plot is searched unless it is the kept goal.
- THE FLAGS (0x26e3a0, on each path found): walking from the start, the
  first node whose plot the player does not see now takes bit 1 and the node
  before it bit 2; a goal not seen now takes bit 1.
- THE WRITER OF +0x5d8 outside the formation's constructor (0x263240 at
  0x2646ad) is not found by a direct store (its sub-object at +0x580): when
  a kept path is dropped (a new goal, the operation's end) is unread.
- A PATH'S OTHER PLAYERS' UNITS: the step's location test (0x271be0 ->
  0x586900 under flag 1 -> 0x586360) refuses no plot for another player's
  unit, seen or not, but where both the mover and that unit are embarked
  (0x586542..0x5865a1: 0x208b80 under 0x108, the refusal only without flag
  1); a hostile unit makes an attack node only on a plot the player sees now
  (+0x51 bits 5 / 6, 0x5861f0, set under +0x50 bit 1). The zone of control
  (0x530f50) skips only a hidden unit the player cannot see (0x5033a0, the
  stealth test), not a unit out of sight.
- Trials (one-seed aimem traces, the five duels): keeping the path as read,
  with the goal taken as the kept path's key, matches runs/h1_duely1117 t26
  / t32 / t52 (Galley 720906 walking 25:1 / 25:2 / 25:3 on the t25 path) and
  breaks as many moves of other families (1117 t14 the rampaging Scout
  131073, t35 Operation, t59 Attack Units); a path passing other players'
  units out of sight matches runs/h1_duely1121 t58-77 the Scout 131073's
  "tertiary regions" 10:9 and 1127 t46 / t51 the Galley 262147, and breaks
  1117 t80-103 / 1127 t27-126 Attack Civilian and Rampage moves the game
  makes none of (1117 t80 Warrior 3670030 holding on 32:16 for 31:13). Open:
  the kept path's drop, and what keeps those moves unmade in the game.

## C-125: a civilian at war in the planning's search, a zone of control across a river, the attack's move onto a city — READ (0x26e570, 0x530f50 at 0x5310c8..0x5311c9, 0x771f80 at 0x772121), both twins

`groundOf`'s `plainCivilians` (enter / attack, cpu/core/tactical.ts) and its
`seenZoc`; `inEnemyZoc` (cpu/core/units.ts); `carryOut`'s move. GPU
`_tac_fighters`, `_tac_enter(plain_civ)`, `_tac_attack_planes`, `_tac_zoc`,
`_tac_carry_out` (gpu/core/sim_tactics.py).

- THE PLANNING'S STEP ONTO A CIVILIAN (0x26e570): the attack test is a
  district at war with hit points or a unit at war that fights (0x209dd0);
  a civilian at war is neither, so the planning's search (not a move
  order's path, not the danger map's) steps onto its plot as onto any
  other — Movement left on it, the search going on past it, and from a plot
  in a seen zone of control (0x26e83e) no such step. Over the five duels
  t1-140 the planning rows of a unit beside or reaching a hostile
  civilian's plot read 475 equal / 51 differ as plain steps, 357 / 167 as
  attacks (the 51 a step cost apart). runs/h1_duely1128 t35: the barbarian
  Warrior on 15:13 lists player 1's Settler's 16:13 at (1/1).
- THE ZONE ACROSS A RIVER (0x530f50): the plot entered and its six
  neighbours in turn; a district at war that exerts one (0x24c2f0) zones
  before the river is read; a unit (at war, alive, of the mover's domain,
  exerting, seen) only where the neighbour's river bit toward the plot
  (+0x38 by 0x2133b0) is clear or the neighbour is a city (IsCity).
- THE ATTACK'S MOVE ONTO A CITY (0x771f80 at 0x772121): the move of an
  assignment off its spot is a MoveTo order with flags 0 (0x962030); for a
  spot the unit would attack into (a hostile city or Encampment, no unit on
  it so 0x5862e0 clear) it takes the unit nowhere.
- runs/h1_duely1121 t97-103: the raid's Man-At-Arms 2883594 on 6:14 lists
  China's Great Scientist's 5:12 at (2/1), linked from the city 6:12 (its
  attack goes on), none from 5:13, which the city zones across the river;
  the civilian's first spot 6:12 (turn 2), the order onto the city, the
  unit on 6:14 each turn, as logged.
- OPEN: a city's or Encampment's zone in a move's cost (`inEnemyZoc`
  counts units alone); the MoveTo order's own refusal of the city (the
  operation's start) is read on the recording, not in the order's code.

## C-129: the military AI's upgrade after the look; the Free Cities buy none — READ (0x6096c0's lists, 0x687bf0), both twins

`minorMilitaryUpgrade` (cpu/core/minorOps.ts) runs in `minorPhase`
(cpu/core/minorBuild.ts) after the city AI's turn and the civics AI's
government values, on the unit production table the city AI read
(`armyCounted`), before the units' turn; GPU `_mops_military_upgrade` in
`_city_state_phase` (gpu/core/sim_minors.py) at the same place. The replay
lands the record's upgrade ordered before the minor's PlayerTurnActivated at
that call (`traceMinorUpgrade`), not at the minor's turn end.

- THE ORDER: the Control Manager's first list (0x60e8c0) holds the cities'
  update (CityBuildAI pass 2), research, the economic AI 0x687bf0 (pass 3,
  written 0x68534e) and the military AI 0x722690 (pass 2, written 0x71ac27);
  it runs pass by pass from 4 down, each job acting in its own pass, so the
  savings and contract purchases come before the upgrade and the cities'
  update before it within pass 2. The knowledge base's look is before it:
  runs/h1_duely1124 t43 city-state 2's Warrior 262144, upgraded before its
  PlayerTurnActivated, stands a Warrior at age 0 in its own records of the
  turn and a Swordsman from t44 (landing the upgrade before the look moves
  knowledge.army 0 -> 73 misses on 1124 to t130, 1 -> 269 on 1121 to t190).
- The upgrade reads the savings the turn's savings turn left:
  runs/h1_duely1127 t126 / t127 / t129 city-state 4's Skirmishers are bought
  only on them (with the slots of the turn before none is).
- THE FREE CITIES: TRAIT_LEADER_FREE_CITIES carries no DefaultSavings list
  (Expansion1_Leaders.xml; Leaders.xml lists it for TRAIT_LEADER_MAJOR_CIV
  and MINOR_CIV_DEFAULT_TRAIT alone), so the economic AI's total weight
  (+0x458) is 0: 0x687bf0 asserts at 0x687c89 and goes on, the weight over
  the total a NaN whose 24.8 conversion (cvttss2si, << 8) is 0, every share
  0 and the treasury's change all the SLUSH slot's. The UNITS slot stays 0,
  the can-afford (0x6874d0, slot 1 at half the cost) fails, and 0x727db0
  buys nothing: no Free City upgrade in any recording; neither twin walks it
  for them.
- Cases (carried, one seed each, unit.upgrade): runs/h1_duely1121 t1-189
  40 of 40, runs/h1_duely1127 t1-129 20 of 20, runs/h1_duely1128 t1-129 16
  of 16 (t110 Hong Kong's Warrior 1966081 to the Man-at-Arms, the unit its
  city trained that turn), runs/h1_duely1124 t1-129 9 of 10; every other
  kind as before on those spans.
- OPEN: runs/h1_duely1124 t47 city-state 2's Warrior 196610 on its ground,
  its UNITS slot at 2.9 Gold after the turn's savings (2.5 the test): the
  engine buys it, the game none before its PlayerTurnActivated (its tree
  upgrades it after); on the slots before the turn's savings (2.4) the game's,
  which loses 1127 t126-t129.

## C-99: an owned water plot no shore, a move order carried on as the turn ends — READ (0x530240, 0x66790, 0x66a90, 0x66680, 0x814e0, 0x81240, 0x7eeba0), both twins

`shoreCrossing` and `stepUnit`'s transfer cap (cpu/core/units.ts); `moveTo`,
`withShortOrders`, `orderOnce`, `walk` (cpu/core/tactical.ts). GPU
`_owned_exit` in `price6` / `_tac_step` / the walk, `_tac_with_short` and the
registration at `_tac_move_to`'s end (gpu/core/sim_tactics.py), the step's dock
and the cap in `_step_verb` (gpu/core/sim_seats.py).

- THE PLOT'S DOMAIN MASK (the plot info's word +0x14): a claim (0x66790,
  Map_CityPlots: SetOwner 0x84760, then 0x66a90) clears it and sets bit 1
  where the plot is water or a coastal city, bit 4 where it is land, and 0x10
  and 2 on every claimed plot (0x814e0 sets or clears a bit); the load's
  refresh 0x66680 does the same over the map's plots. 0x81240 tests it by
  domain (0 bit 1, 1 bit 2, 2 bit 4, 4 0x10, else 8). An unclaimed plot holds
  none.
- THE DISEMBARK RULE 0x530240 (0x530289..0x5302c8): a step off a water plot
  whose mask takes the embarked formation (+0x278, 0x81240) is no shore
  crossing: no MOVEMENT_EMBARK_COST, no Movement carried, the unit keeping
  the Movement it lands with. Every claimed water plot, a Harbor's or not,
  whoever owns it.
- Confirmed (AI_Planning.csv, every embarked city-state land unit's step
  ashore in turn 1 on 1117 / 1121 / 1124): off an owned water plot the land
  plot's own cost (1 flat, 2 Woods / Jungle / Marsh), off an unowned one that
  and the embark cost; runs/h1_duely1117 t185 city-state 3's Bombard 1769477
  on its water 42:14 plans 41:14's Farm (1/2); one-seed aimem traces to t200:
  1117 city-state 3's Wander and Operation units t141-187.
- A MOVE ORDER'S QUEUE: Move Unit's execution 0x7eeba0 queues SWAP_UNITS
  (0x972880, op 0x7fa205d1) and MOVE_TO (0x962030, op 0x580f2f68) on the
  unit's operation queue (vt +0x60); each MOVE_TO logs two
  UnitOperationSegmentComplete. A walk that stands short of a plot its path
  goes through but may not end on, Movement left, keeps the order; the unit
  walks it again, its path found anew, once the player's other units have
  moved (the record's UnitMoved after the first segment's event: 33 over the
  five duely duels, runs/h1_duely1121 t71 city-state 4's Warrior 262146 on
  to 33:20 once its Swordsman left it). Ported for the city-states', the Free
  Cities' and the barbarians' passes. Matched: 1121 t103 its Man-At-Arms
  1048577 on from 38:13 to 38:12; 1127 t109 city-state 3's Galley 393216 to
  29:16.
- OPEN (C-99): the embark side's test at 0x530473..0x530499 (the TO water
  plot's mask on the land formation's domain): onto owned water the
  planning keeps one more Movement than onto unowned (runs/h1_duely1124 t76
  city-state 3's Heavy Chariot on 40:12: 40:13 (1/1), 39:12 (1/0)), not
  ported; an order whose walk stopped for its Movement, no plot held, went
  on in the game (1121 t95 the barbarian Warrior 1769487, t148 the Builder
  4259860), not ported; the second walk's path of 1121 t69 (Warrior 262146
  back from 35:19 to 35:18, ours staying) unmatched; plot vt +0x40 (read
  first by 0x530240 and 0x66680) unread.

## C-95: a ranged unit's danger reach holds only plots with Movement left — READ (0x7921e0, 0x791270, 0x26dab0), both twins

`dangerPlane`'s list callback (cpu/core/tactical.ts); `_danger_plane`'s
`reach` (gpu/core/sim_tactics.py).

- THE LIST'S RANGED FLAG: the danger map's per-unit lambda (0x716400) sets
  the reach list up with 0x7921e0(list, unit, GetRange 0x56e3d0 > 0, 1)
  before the search 0x26df90 (flags 0x311); 0x7921e0 stores the ranged flag
  at the list's +0x18.
- THE APPEND (0x26dab0 -> 0x791270): the list callback passes a pointer to
  the closed node's Movement left (node +0x28); with the list's +0x18 set a
  node of Movement 0 is not appended. A unit with a range so lists only the
  plots it can still strike from; its range list (0x7167b0) walks those
  alone. A melee unit lists every plot it may stand on as before.
- CONFIRMED (one-seed aimem traces to t100, the five duels):
  runs/h1_duely1121 t28-29 the barbarian Scout 1441809 on 7:17 flees to
  7:15 as logged, player 1's Slinger 327682 on 6:14 no longer covering it;
  t56-57 city-state 2's Warrior 1245191 Heals as logged; barb.move.plot
  +48, cityState.move.plot +5, no other kind moved.
- OPEN: runs/h1_duely1127 t8 city-state 4's hurt Warrior 131073 on 5:9
  (Attack Barb Camp's Protect Units) takes 4:10, ours 6:10 — our danger map
  holds 6:10 at 0 (the camp's Spearman on 6:8 and the Slinger on 5:8 reach
  no plot beside it); runs/h1_duely1121 t11 city-state 4's Warrior 131073 on
  32:23 takes 31:23, ours its own 32:22 at danger 0 (the barbarian Warrior on
  33:23 reaches no plot beside it). The safe plot's order (0x716b90) is as
  ported; the game holds danger on those plots the map as ported does not.

## C-124: the kept path is never taken; a move order's path passes other players' units out of sight — READ (0x272aa0, 0x2714b0, 0x586360 at 0x586542..0x5865a1, 0x26fe20), both twins

`Ground.pass` in `search`, `pathTo` and `walk` (cpu/core/tactical.ts);
`_tac_enter(foes_seen=True)` in `_tac_search`, `_tac_move_to`'s destination
mask and its walk's `foe_n` (gpu/core/sim_tactics.py).

- THE KEPT PATH IS DEAD CODE: 0x272aa0 takes the formation's kept path
  (+0x638) only where its byte +0x5d8 is set, the value of the tracked bool
  at +0x580 (a tracked variable's value lies +0x58 past it: 0x9034b0 /
  0x7eb220 return or set that slot). Every store to it is false: the
  constructor 0x263240 at 0x2646ad (r12b 0), the reset 0x266a60 at 0x266b24
  (0x29fdf0 with 0), the load 0x264d90 at 0x264f75 (0x29fdf0 with 0). No
  other instruction of the image addresses +0x580 or +0x5d8 of a formation
  (displacement and immediate scans; the build the game runs the same at its
  own offsets, its flag written by the constructor, the reset and the load
  alone). Every move order searches its
  requested plot afresh (0x272ad7 -> 0x272c5e -> 0x26ef40), as the engines do;
  the flags 0x26e3a0 sets and the turn-1 end 0x782d0 serve that dead branch
  and the MoveTo first step's attack test alone.
- THE MOVE GOES ONE NODE AT A TIME: 0x26fe20 searches the path again and
  places the formation on the node after its start (0x2666c0: +0x638 at
  count-2, the goal where one node is kept; an air member takes the goal
  itself, 0x2669d0(1)), the MoveTo execution 0x962380 running again for the
  next; its first step ends the order unmoved on a defender at war it sees
  there (0x209e30). The engines walk one path's first turn: `walk` stops
  short of a plot a unit at war with it holds (the GPU walk's `foe_n`).
- THE DESTINATION TEST (0x2714b0, the instance's +0x20 / +0x28 pair laid by
  0x26f330, called by GeneratePath 0x77d10 at 0x78060 before the search):
  with search flag 0x4000 a plot the player does not see now passes; else the
  location test 0x586900 under the order's flags mapped (4 -> 8, 0x10 -> 1,
  0x20 -> 2, 0x2000 -> 0x80). An order without the attack flag 0x10 has no
  path to a plot another player's unit holds, seen or not (0x586360's
  0x208b80 under 0x108: no sight test, 0x20a2a0 under 0x100).
- A PATH'S OTHER PLAYERS' UNITS: each node's location test (0x271be0 ->
  0x586900 under flag 1 -> 0x586360 at 0x586542..0x5865a1) refuses no plot
  for another player's unit, seen or not, but where both the mover and the
  best of them are embarked; a hostile unit makes an attack node (+0x51 bits
  5 / 6, 0x5861f0) only on a plot the player sees now (+0x50 & 2). A move
  order's path passes a unit at war with it on a plot it does not see now as
  empty ground (`pass`); one it sees is an attack or no step, as before.
- THE DESTINATION OUT OF SIGHT: a destination another player's unit holds
  that the player does not see now is no path (`pathTo`; `_tac_move_to`'s
  mask), the attack-flag orders included. For an order without 0x10 that is
  0x2714b0's refusal; under 0x10 the recorded moves say so (below) while
  0x2714b0 passes such a plot under location flag 1: the refusal's place in
  the DLL is not found.
- Confirmed (one-seed aimem traces, each against the head without the rule):
  runs/h1_duely1121 t58-77 the barbarian Scout 131073 "tertiary regions" 10:9
  past China's units out of its sight; t17-20 city-state 4's Warrior 327680
  (Operation); t27 / t33 the rampaging Galleys 1114128 / 1245196 holding for
  a target out of sight; h1_duely1127 t46 / t51 the Galley 262147 "HL:
  Explore", t30 the Slinger 720905, t113 city-state 3's Galley 393216;
  h1_duely1117 t11 the rampaging Scout 131073 and Warrior 589832 holding for
  14:8 (a city-state's Warrior out of their sight), t40-41 the Scout
  1441799, t48 the Settler 2293774; the Attack Civilian movers of 1117 hold
  for a civilian out of their sight (t80 Warrior 3670030 for the Settler on
  31:13, t85 / t88 / t97 / t100 / t103) and go for one in it (t31-t36, t68);
  h1_duely1124 t15-20 the Scouts 524295 / 131073 "HL: Explore".
- Open: the place of the destination-out-of-sight refusal under the attack
  flag; h1_duely1127 t36 the barbarian Warrior 2031626 (Operation, 12:14 for
  12:7) steps 11:13 on the path past player 1's Archer out of its sight
  on 11:7, the game 12:13; h1_duely1117 t26 / t32 the Galley 720906's fresh
  search from 26:1 for 33:3 (no path in the engines; the game walks 25:1 /
  25:2 / 25:3).
