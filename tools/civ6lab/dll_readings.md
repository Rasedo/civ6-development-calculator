# DLL readings (GameCore_XP2_Release.dll)

The install's `DLC/Expansion2/Binaries/Win64/GameCore_XP2_Release.dll`,
read as code with `dll_q.py` (annotated disassembly: every RIP operand and
call target labelled by the strings it cites; `xref`, `ann`, `callers`,
`gref`, `fld` (a struct field's users), `vt`, `s`), `dll_gp.py` (the
GlobalParameters struct: each parameter's field offset, from the loader at
0x2d58f0), `dll_vtab.py` (vtables pointing into a code range) and
`dll_rng.py` (every draw on the synchronous generator by its label).
Addresses are RVAs. Each rule below is ported to a `dll_*.py` check and
scored on the lab's existing records; the FinalRelease DLL the game runs is
the same code without asserts (the H-3 readings held on the live game).

## B-D: the policy-unlock price — CLOSED

`PlayerCulture::GetCostToUnlockPolicies` 0x398e70 (Lua `GetCostToUnlockPolicies`
0x9a2280), the escalation 0x5267a0 (type 1), the progress 0x399810 (civics)
/ 0x4c9cf0 (techs). Check: `dll_policy.py`.

- 0 when the government has an empty policy slot or the culture's flag
  +0xc00 is set (no free-window zero in this function).
- p = max(100·C // NC, 100·T // NT), C / T the civics / techs held of the
  NC = 61 / NT = 77 the game offers (the counts fit: 789/853 at 77/61, the
  next best 704).
- E(x) = x + (x·GAME_COST_ESCALATION(1000)//100 − x)·p // 100 = x + 9x·p//100.
- price = max(E(CivicUnlockMaxCost 50) − s·E(CivicUnlockPerTurnDrop 5),
  E(CivicUnlockMinCost 10)), s = game turn − the stored last-civic turn − 1
  (the lab's s); halved when GOVERNMENT_UNLOCK_WITH_FAITH (false);
  then price −= price % PURCHASE_DIVISOR 5 (rounded DOWN).
- Verified: 853 / 853 reads exact (ladders +1 517/517, −1 63/63, probe
  base 7/7, probe steps 266/266). The probe's civic grants on seats 1, 4, 5,
  7 stamp the grant turn as the last civic (s = −1: the price jumps by
  E(5)); seats 2, 3, 6 keep their s — each seat fits one reading on every row.
- kT / kC and their out-of-table extensions, the half-up rounding and the
  fall's exceptions all dissolve into this one formula.

## B-D-S1: the war-weariness split — CLOSED (structure)

`Player_Diplomacy` allocation 0x3cda00 (from 0x3d7020); requirement
0x5275a0; city sorts 0x3bdd20 / 0x3bdbc0 / 0x3bdc70 / 0x3bdb10 (population
descending, EASTL insertion under 29: ties keep the city list's order);
opponent sorts 0x3bde80 / 0x3bddd0. Check: `dll_ww.py`.

- need = max(0, ceil(pop / CITY_POP_PER_AMENITY 2) − CITY_AMENITIES_FOR_FREE 0).
- Per opponent o with weariness W[o] > 0 against the seat (the seat's
  per-opponent array): L(o) = W[o] // WAR_WEARINESS_POINTS_FOR_AMENITY_LOSS 400,
  floored PER OPPONENT. At-war opponents first (list A), then at-peace (B).
- A: L(o) goes to the seat's cities whose ORIGINAL owner is o, most
  populous first, each min(rest, need + LOSS_OVER_REQ_AMENITIES_AT_WAR_CITY 3);
  B: the same at + NONFOUNDED_CITY 1. What A and B leave is pooled.
- C: the pool to cities founded by a third party (original owner neither the
  seat nor any o in A or B), most populous first, need + NONFOUNDED 1;
- D: the rest to the seat's FOUNDED cities, most populous first,
  need + FOUNDED_CITY 0 — a founded city loses at most its need.
- Verified on `runs/ww_xsec_*`: need = ceil(pop/2) 135/135 cities; every
  losing city within need + its category's cap 20/20; founded losers are the
  seat's most populous founded cities 10/10 seats; three losers sit exactly
  at their cap (a nonfounded at need+1 twice, a founded at need). Unread:
  the per-opponent W (no reader) — the A/B/C split per opponent.

## B-31r-S1: the plunder payout — CLOSED

Trade_Manager plunder 0x5545e0 (yield loop 0x554860..0x554a4e, route yields
0x559b30 origin / 0x559bc0 destination, speed scaling 0x5254d0). Check:
`dll_plunder.py`.

- V = Σ over yields (origin_y + destination_y) × (1 for Gold,
  GOLD_EQUIVALENT_OTHER_YIELDS 2 otherwise) — the route's per-turn yields.
- base = max(50, V × speed(TRADE_ROUTE_TURN_DURATION_BASE 20) // 2)
  (Online 10 → 5V; Standard 10V; the 50 a literal, unscaled).
- payout = base + base × pct // 100 (the plundering UNIT's plunder percent,
  unit field +0x1858 — the caller passes the unit whose +0x2e0 owner it
  tests — when > 0); Gold; no draw. Total War and Letter of Marque
  (MODIFIER_PLAYER_UNITS_ADJUST_PLUNDER_YIELDS, every unit) and the
  admirals' naval abilities (MODIFIER_PLAYER_UNIT_ADJUST_PLUNDER_YIELDS)
  all write EFFECT_ADJUST_UNIT_PLUNDER_YIELDS into that one field: they add.
- Verified 16 / 16 plunders (`runs/plunder_*`), including the two 50s the
  route term could not reach (Quebec→Halifax V 6, Quebec→Ngaruawahia V 8).
  The records' destination yields are all 0: the destination term is read,
  not exercised.

## C-16: the counterspy and the escape

Rules_Espionage: mission target `ComputeNeededDieRoll` 0x529b60, outcome
table 0x52b8f0, mission roll 0x52b2a0; the counterspy finder 0x52ac80;
escape: ResolveEscape 0x52ce40 → 0x52aea0 → table 0x52b090 → target 0x529ab0;
police 0x528560; 3d6 counts at 0xf02c70. Check: `dll_escape.py`.

- The mission's counterspy term: needed roll += EnemyProbChange (3) +
  EnemyLevelProbChange (1) × (counterspy level − 1) + the counterspy's
  promotion terms; its level + ADJACENT_LEVEL_BOOST when within 1 of the
  target. So 3 flat PLUS 1 per level above the first (the level field's base
  unread: a level-3 post adds 4 or 5; the guard3b/c fit: shift 3 logL −65.6,
  4 −66.5, 5 −72.4 — 4 is within 1).
- Reach: the counterspy is the FIRST unit in the target owner's unit list
  (not the highest level) that is a spy on a counterspy operation, in a city,
  and within hex distance 1 of the target plot — any district, any city —
  or anywhere in its own city with the ENTIRE_CITY effect.
- Escape: v = ESCAPE_BASE 10 − LEVEL_BOOST·(level − 1) − the spy's escape
  boost + 4 on a right police guess; ONE weighted draw over the 3d6 counts:
  escaped P(3d6 ≥ v), captured P(v−2 ≤ 3d6 ≤ v−1), killed P(3d6 ≤ v−3)
  (a capture becomes a kill for one civ/district pairing).
  **ResolveEscape passes no counterspy (0x52cf77 `xor r8d, r8d`): the
  COUNTERSPY_LEVEL_MODIFIER term is dead code.**
- The police draw one offered route weighted by 5 − TravelTime (the max
  TravelTime 4 − own + 1: City Centre 1, Commercial Hub 2, Harbor 3,
  Aerodrome 4; "Police Exit Covered").
- On the 214 paired escapes: the capture band beats the flat 29% (logL
  −196.9 against −200.0). The escape rate is not closed: one-route cities
  escape less and multi-route cities more than any uniform or weighted guess
  predicts; a free fit wants P(guess | 1 route) = 1 and P(guess | 2+ routes)
  ≈ 0–0.15 (logL −186.3 with the level field one below the log's level,
  −190.3 at the log's level).

## B-89 tail: an air strike's XP — READ, one term open

Rules_Combat 0x5197e0 (called by every resolver; the air strike 0x203cb0
picks the combat type 0x204451: BOMBARD when the plane's Bombard > its
Ranged). Check: `dll_xp.py`.

- base = EXPERIENCE_COMBAT_RANGED 1 for the ranged / bombard combat types,
  else NOT_COMBAT_RANGED 2; the ranged side's strength is its RAW Ranged or
  Bombard column (a Bomber 110, not 110 − 17), the other side's raw Combat
  (Infantry 75), corps/army terms added; k = KILL_BONUS 2 on a kill.
- attacker: ceil(ATTACKER_BONUS 1 + base + k·D/A); defender: ceil(base +
  k·A/D); then × the side's XP percent, rounded UP again; capped at
  EXPERIENCE_MAXIMUM_ONE_COMBAT (Base 10, Expansion2 8: the game runs 8);
  barbarian soft cap 1.
- The Bomber's +3 on Infantry: 4 / 4 strikes. The Infantry's +4 is ceil(1 +
  110/75) = 3 then a positive XP percent (≥ 11%); the city-state's +3 is the
  bare 3. Open: the Georgian Infantry's XP percent (read it, or strike a
  unit with none: the rule says 3).

## C-74: the event draw, the volcanoes, the drought

Game_RandomEvents: the turn's step 0x338710 (gate: turn ≥ start +
RANDOM_EVENT_START_TURN − 1), the volcano roll 0x335040, the weights
0x335260, "Random Event Roll" at 0x338814; N 0x339020; families: storms
0x28f490 (map-size 0x28d0f0), floods 0xa2cfc0, eruptions 0xa1e470, warming
0x28da10.

- N = the game's last turn − its start turn (else the speed's
  GameSpeed_Turns total: Online 250, Standard 500; else 500). The draw
  total is 10N; the remainder is the empty slot.
- Once-per-map rows: weight = trunc(10·Occ) × (W·H) // (84·54) — the map
  area over MAPSIZE_STANDARD's, integer — plus warming. Duel (44×26):
  Occ × 1144/4536 / N — at N 250 that is Occ/991, inside the lab's
  (933, 1120]: **the "N" of the once-per-map rows is the map-size law**.
- Per-site rows (floods per river, eruptions per ACTIVE volcano): weight =
  trunc(10·Occ) × (100 + 30 while the site has had no event of that
  severity) // 100, no map scaling (the lab's 251).
- Warming: extra = trunc(ChanceIncreasePerDegree × weight × T) // 100 in
  integers, T = CO2 / (the map's CO2For1DegreeTempRise / 1000): nothing
  until C·weight·T reaches 100 — the lab's "holds its cold value while
  T < ~0.4–0.5". A flood's weight (0xa2cfc0) warms the BOOSTED weight:
  w' = trunc(10·Occ) × (100 + boost) // 100, then w' + trunc(T × (C × w'))
  // 100 in float32.
- What wakes a volcano (`dll_volcano.py`): ONE roll a turn for the map.
  pct = active share over the volcanoes AND volcanic wonders; D = N // (2V);
  below PercentVolcanoesActive (MODERATE 70): D //= ((70 − pct)·V // 100)
  when that is ≥ 2, and rand(D) = 0 wakes one dormant volcano drawn
  uniformly ("Choose Active Volcano Roll"); at or above 70 the same roll
  puts one ACTIVE volcano to sleep ("Choose Inactive Volcano Roll").
  On the Duel games: 2 sleeps observed where the engines keep a volcano
  active; the wake count fits an effective N of 500 (expected 15.3 wakes
  against 15, 2.7 sleeps against 2; logL −93.8) and not 250 (31.1 wakes,
  logL −100.3), while the event draw measured N 250: a factor 2 left open
  (the owner-gated reading of field +8 dies: 10 wakes were unowned).
- The drought start (`dll_drought.py`): ONE weighted draw over EVERY map
  plot ("Pick Drought Start Plot" 0x287e80): valid when the plot and its
  six neighbours all pass the drought predicate 0x28eb60 — no feature, no
  river (plot byte +0x37), not water and not beside an ocean-sized water
  body (0x82a10), Plains / Grassland (hills too), not under an event —
  weight 1 + min(hex distance to the nearest live event's current plot,
  Spacing 15), the live events being the DROUGHTS alone (m_aDroughts
  +0x948 in 0x28ce90; storms are m_aStorms +0x8b0), each at the last plot
  of its stored footprint (0x288430 → 0x28aa00). No city anchor. Verified: 13 / 13 placed droughts start on a
  candidate, 34 / 34 droughts that found no plot had none (without the
  river clause 16 / 34, without the water clause 23 / 34). `Spacing` is this
  distance weight, the storm and one-off pickers take the same form.
- The fire spread: no labelled draw found (not among the 224 draw sites).

## C-93: the great person draw

`Game_GreatPeople` 0x2f94d0 draws ONE uniform pick ("Generating a random
new Great Person") among the class's candidates of the earliest era that has
any, walking eras forward. Callers: the timeline's setup 0x2f7c10; the
replacement after a person leaves the timeline 0x2f8f70 (grant 0x2f74b0 via
recruit 0x2f8890, patronize 0x2f83e0, reject 0x2f8c00); and a deferred
grant queue 0x2f2a60 (reached through the virtual 0x2f46a0) that grants a
random person of a class from the first chronological era. The 9 turn-opening
draws are that queue or a grant's replacement at another seat's turn end —
not separated here. The victory / turn-limit order: unread.

## H-1: the draws per event (`dll_rng.py`)

One generator (0x8b6c10, 16-bit max); 224 labelled draw sites.
- Combat: one "Unit Combat Damage" draw rand(COMBAT_MAX_EXTRA_DAMAGE 12)
  per damage figure (0x519090; the preview takes the midpoint 6, no draw);
  "Unit Capture Chance" on a capture; an interception is a combat: two.
- Goody hut: "Choosing a Goody Hut Type" then "Choosing a Sub Type", two
  weighted draws before the reward's own.
- Random events: "Active Volcano Roll" (+ the choice when it fires), then
  "Random Event Roll" (one weighted draw, 10N total); the placement picks
  "Pick Storm / Drought / One Off Start Plot"; per struck plot "Pillage
  Improvement Chance", "Random Event Unit Damage Roll", "Remove Fertility
  Chance", "Fertility Gain Chance", "Boosted Yield Chance", "Extra Range
  Chance".
- Espionage: "Rolling Espionage Result" (mission, escape), "Police Exit
  Covered", "Spy EscapeRoute".

## Tools added for these readings

`dll_hash.py` names a 32-bit type hash (the game's hash is CRC32 without its
final inversion: TERRAIN_GRASS 0x83e7c630 as the game reports).
`dll_rowmap.py` maps a database row struct's fields to their columns (from
the table's loader). `dll_luabind.py` lists a Lua registrar's bindings with
the virtual slots each one calls. The plot's virtual slots: +0x18 the
movement cost, +0x30 the plot's district/ownership info (+0x1c the owner,
+0x10 the district id), byte +0x3a bit 3 IsImpassable, word +0x2c the
terrain (mountains 2, 5, 8, 11, 14; 15/16 Coast/Ocean), byte +0x47 the route.

## C-20: the Trader's path and range

XP2 Trade_Movement.cpp: the pathfinder's callbacks are installed at
0x557fd0: step cost 0x558970, node valid 0x558db0, node init 0x558900,
context 0x558ba0, range 0x5579b0. Check: `dll_tradepath.py`.

- Range, a budget walked along the path, in 1/256: the origin node starts
  at TRADE_ROUTE_BASE_RANGE 15 (+ player trade +0x1b0). Per edge: a
  land<->water switch (0x558300) caps the budget at 1; then a from-plot
  holding a TradeEmbark district (Districts byte +0xe1 bit 7: City Centre,
  Harbor, Royal Navy Dockyard, Cothon) of the ORIGIN city or of a city where
  the player has a constructed trading post (City_Trade 0x1f99d0, false
  against a player the owner is at war with) refuels it to
  TRADE_ROUTE_LAND_RANGE_REFUEL 15 when the next plot is land, WATER_RANGE
  30 (+ Portugal's row) when water; the destination's own district to 3;
  the step costs 1. An edge leaving less than 0 is refused (0x5590a9).
- Step cost (1/100 move): 100; +10000 for a switch not at a refuelling
  district; onto a city centre or a tunnelled mountain +0; a route +10 when
  it is the highest-PlacementValue route (Railroad), else +50; water with no
  route +50; land with no route +100 x the plot's movement cost.
- Closed nodes: impassable, a mountain with no tunnel, a plot a major has
  not revealed, water when the player's Trader cannot embark, a foreign
  centre of a player at war, a plot whose feature has DangerValue > 0
  (burning forest / jungle, the Bermuda Triangle) unless it is the
  destination; a switch edge needs a TradeEmbark district at one end.
- The path is the least-cost path within that budget (A*, heuristic
  0x271490), not a greedy step, and the range is the budget, not a hex
  distance between the ends.
- Records: the 31 distinct startable paths in `runs/trade_path_*` fit the
  budget with the origin's refuel alone (31 / 31). The sweep's
  GetTradeRoutePath paths (read from the trade manager's path cache,
  0x9af6c0, which answers pairs CanStartTradeRoute refuses: 10 of the 54
  recorded) carry 44 pure-land legs of 16..26 steps between the recorded
  active posts; with no CanStart and no constructed-post read per row they
  are listed, not scored.

## C-34: the interception's damage, XP, weariness and the answers

- The damage law (0x519090; struct 0x519370): damage = trunc((24 + r) x
  expf(x) + 0.5), clamped [1, 100], x = (k x D) >> 8 in 1/256, D the
  strength difference in 1/256, k = trunc(COMBAT_POWER_SCALING 0.04 x 256)
  = 10. The factor per point is e^(10/256) = 1.03984, not 1.04: a 1.04 fit
  sees 0.99597 D (26.89 at 27) — the "~0.1". Check `dll_damage.py`: the
  12 drawn interceptions 12 / 12 and their previews 12 / 12 (the 1.04 law
  8 / 12 and 0 / 12); the laws part on 81 of 1452 (r, D) cells in
  0..11 x -60..60.
- The air resolver 0x203cb0 (struct: [+0] the plane, [+8] the target,
  [+0x10] the interceptor, [+0x18] the anti-air unit) computes the
  interception, then the anti-air answer, then the strike, with no test of
  the plane's health between them: the cover answers a bomber the
  interception downed, and a burst that downs a bomber does not stop its
  strike (the strike runs at the accumulated damage's wound term).
- XP: the interceptor's = 0x5197e0 with the MELEE / UNIT_VS_UNIT types, the
  kill flag 0 and the interceptor as the DEFENDER: min(8 cap GP +0x31c,
  ceil(ceil(2 + S_plane / S_interceptor) x its XP percent)), S the Combat
  column plus corps/army (0x56dc90). Fighter 100 v Bomber 85: 3 before the
  percent; the measured 4 (Georgia's Fighter) is the percent (> 0) — the
  same unread Georgian XP percent as B-89's Infantry. The plane earns
  nothing from the interception. The anti-air gun's XP is the RANGED
  defender formula on the plane's Ranged column: 0 against a Bomber
  (Ranged 0).
- War weariness (0x1fb680, from the combat log 0x20d280): it reads only
  the struct's [+0] and [+8] and the combat's location — the interceptor
  and the anti-air unit never enter it. Per side: (1 in lands allied to the
  unit, else 2) + WAR_WEARINESS_PER_UNIT_KILLED 3 when that side's unit is
  dead at the log (+10 for a WMD on the attacking side), x (16 +
  era/casus-belli term) x (100 + the players' percents) / 100.

## C-41: the eruption's soil, the ring and the gates

The volcano's eruption 0xa22000 runs the damage pass 0xa1c1a0 FIRST, then
the soil pass 0xa219e0. The natural-wonder eruption 0xa22150 runs 0xa1c760
then 0xa21680 over EACH wonder plot's six neighbours (a plot two wonder
plots share is taken twice). Check: `dll_eruption.py`.

- Soil: for each RandomEvent_Yields row of the severity (XML order), for
  each neighbour (NE, E, SE, SW, W, NW): skip an impassable plot, a water
  plot, and a feature that is neither Removable (Woods, Rainforest, Marsh)
  nor the row's own (Volcanic Soil); ONE draw rand(100) < Percentage: the
  row's ReplaceFeature (true on every eruption row) paints Volcanic Soil
  and the row's yield gains +1 (0xa190d0) — no district, city-centre or
  wonder gate (the feature goes on through the raw setter 0x896c40; the
  records' city centres gained the rows' yields and all 105 district plots
  in the rings stood on Volcanic Soil). So each row paints: a plot is
  painted when ANY row lands, and the production / science rows land at
  their own Percentage on every eligible plot. Painted share on 201 bare
  eligible plots (`runs/volcano_own_*`): 30/67, 46/67, 54/67 against the
  DLL's 0.448 / 0.662 / 0.862 (logL -121.6) and the engines' food-gated
  0.35 / 0.50 / 0.75 (-127.4); 34 painted plots gained no food (the engines
  paint only with food). The yield gains read low under both (the rings
  were re-erupted without a reset).
- Damage: for each RandomEvent_Damages row, for each neighbour: skip an
  impassable plot and a feature neither Removable nor Eruptable; a BONUS
  resource (RESOURCECLASS_BONUS) on the plot is removed before the draw —
  land or WATER, any owner; one draw rand(100) < Percentage applies the
  row through the shared applier 0x336a50.
- The owned-plot gate belongs to the damage TYPE, not the family:
  IMPROVEMENT_PILLAGED 0x33aba0, IMPROVEMENT_DESTROYED 0x337210,
  DISTRICT_PILLAGED 0x33a910, BUILDING_PILLAGED 0x33a780, POPULATION_LOSS
  0x33a6e0 refuse an unowned plot; UNIT_DAMAGE_LAND / NAVAL 0x3366a0 and
  UNIT_KILLED_CIVILIAN 0x33a070 do not (the owner only sets the damage
  percent). Floods (0xa2a4d0), storms (0x286530, 0x2867f0, 0x286f80),
  eruptions and the accident (0x2d0e00, 0x2d33a0) share the appliers.
- Unit damage: ONE "Random Event Unit Damage Roll" PER UNIT of the row's
  domain on the plot (not dead, not civilian), MinHP + rand(MaxHP - MinHP)
  — this is C-1's "several land units" answer: one draw each.

## C-49: the storm's walk

Game_Climate: the turn's walk 0x28ecd0, one step 0x28c500 ("Storm
Direction"), the step's strike 0x286f80.

- Latitude (0x69d80): lat = Bottom + (Top - Bottom) x (100y // H) // 100
  (the map's 90 / -90; x / W on a Y-wrapping map). Every PrevailingWinds row
  with Min <= lat <= Max joins (both ends inclusive: at 60, 30, 5, 0, -5,
  -30, -60 two bands pool).
- A step: one weighted draw over the band's directions whose neighbour
  EXISTS (an edge is out of the vector, not a dropped step); the storm
  MOVES there whatever the terrain; the step costs 1 on a terrain in the
  storm's RandomEvent_Terrains list (hurricanes: Ocean only; an empty list
  is every terrain) and 2 elsewhere, out of Movement 8; when the drawn step
  costs more than what is left, the walk ends for the turn. No other storm
  blocks a plot.
- Each step strikes the footprint at the new centre (0x286f80), each plot
  at most once per storm (the storm's struck list, +0x38), at 100% of the
  rows' Percentage, 50% on the storm's last turn (turn - start + 1 >=
  Duration): Percentage x pct // 100 in integers against rand(100), the
  RandomEvent_Damages rows' "Pillage Improvement Chance" and the
  RandomEvent_Yields rows' "Boosted Yield Chance" alike (both read the same
  pct argument).

## B-24r: the governor operations

- APPOINT_GOVERNOR (0x48c219 -> CanAppoint 0x430fa0 -> Appoint 0x430590):
  the PARAM_GOVERNOR_TYPE value is looked up by 0x28a940, which takes an
  INDEX when it is below the table's size and a HASH otherwise — and the
  governor record stores the raw value ([+4]). The install's screens pass
  the row INDEX (GovernorPanel.lua 551, GovernorDetailsPanel.lua 375-376:
  the governor Index and the promotion Index; GovernorAssignmentChooser.lua
  402-404: the Index, PARAM_PLAYER_ONE the city's owner, PARAM_CITY_DEST the
  city ID). `c1g_gov.lua` passed row.Hash: the points were spent (4 -> 6 ->
  7) on a governor recorded under its hash, which every index-keyed read
  then misses — the "misroute". The path to try: the Index in both params.
  GameCore Lua has ChangeGovernorPoints and no appoint call.
- Carbon: the climate observer 0x288740 takes the AMOUNT of a resource
  consumed (x CLIMATE_CO2_PERCENT_FROM_UNITS 50% for a unit's upkeep) and
  the resource's CO2perkWh: carbon follows the resources burnt, not the
  Power generated. The Industrialist's +1 Power per resource
  (EFFECT_ADJUST_RESOURCE_POWER_PROVIDED_GOVERNOR) adds no carbon of its own.

## C-26: the struck unit's terms (install audit)

`c26_strike_terms.py` (record `runs/c26_strike_terms.txt`) lists each
omitted term's modifiers and requirements from the layered install; the
district-defender strength 0x520270 (called by the district attack 0x207080)
carries the diplomatic-visibility ("ESPIONAGE") bonus.

- Apply to a unit a city or Encampment strikes (no opponent requirement):
  the position terms of `chassisAbilityCS` — Khevsureti and Highlander
  (hills / woods), Hoplite (adjacent Hoplite), Varu's -5 (adjacent at war),
  Carolean (unused moves), Huszar (allies), Cossack / Malon Raider (near own
  territory), Garde / Redcoat (continent), Black Army (levies),
  Conquistador (adjacent religious unit), U-Boat (Ocean), Mountie (park) —
  and Ngao Mbeba's +10 (REQUIREMENT_COMBAT_TYPE_MATCHES COMBAT_RANGED and
  NOT attacking: a city's shot is ranged); `visibilityCS` (0x520270).
- Do not apply: `allianceWarCS` (Military Alliance level 1 and Enkidu both
  require REQUIREMENT_COMBAT_VERSUS_TYPE_MATCHES COMBAT_UNIT_VS_UNIT); the
  P-51's and Dogfighting's vs-fighter rows (opponent promotion class); De
  Zeven Provincien (attacking a district); `barbarianCombatCS` is 0 by
  construction (no barbarian owns a district).
- Unread: Cyber Warfare (REQUIREMENT_OPPONENT_ERA_AT_LEAST) against a
  district opponent.

## C-1: the nuclear accident's plant and the spared unit's draw — CLOSED

The accident 0x2d33a0 walks the event's RandomEvent_Damages rows; for EACH
row, before its draw, it pillages every Buildings_XP2 row with
NuclearReactor (byte +0x48 bit 8: BUILDING_POWER_PLANT alone) in the city
owning the plot, through the city's building pillage 0x193190 directly —
not the damage applier 0x336a50 — when the plot's district is owned and not
already pillaged. So the plant goes with no draw and past Reinforced
Materials (lab 5e: 9 of 9; the engines follow). Then one "Pillage Improvement Chance"
rand(100) < Percentage applies the row through 0x336a50, and a ring walk
over 1..Hexes (RandomEvents +0x30) follows — Hexes defaults to 0 and the
accident rows set none, so nothing beyond the plot.

The unit applier 0x3366a0 takes "Random Event Unit Damage Roll" for every
unit that passes the alive / domain gates BEFORE any immunity: the owner's
damage percent (0x468060), the player's event immunity (0x468100), the
unit's own counter (+0x1110) and its ability list each zero the damage
after the draw. A spared unit still spends its draw.

## C-74: BUILDING_PILLAGED's building — CLOSED

The applier 0x33a780 (owned plot, the district's city) asks the district's
chooser 0x24af90: nothing on a pillaged district or an InternalOnly one
(Districts +0xe1 bit 4: the City Centre, the wonder district); otherwise,
over the city's buildings in that district not yet pillaged, the first with
a strictly greater Buildings.Cost (+0x24). The applier then refuses a
building whose Buildings_XP2 row has Pillage false (+0x48 bit 16:
BUILDING_DAR_E_MEHR, BUILDING_FLOOD_BARRIER), so a Dar-e Mehr atop its
Holy Site spares the Temple under it. No draw. DISTRICT_PILLAGED (0x33a910)
takes every building of the district but the Pillage-false ones, then the
district; every event reaches both through the shared applier 0x336a50,
so a flood's, an eruption's, a fire's and an accident's act as a storm's.

## C-93: the climate step after the events — CLOSED

The turn's world step 0xa55190 calls the random-event step 0x338710 —
the droughts' tick and the storms' walk (0x288f40: 0x2876c0, 0x28ecd0), the
volcano roll 0x335040, the weights and "Random Event Roll" — and only then
the climate component's turn (0x2d1f20's component, the one the district
repair's FLOODED / CONTAMINATED reasons read). The engines' `endTurn` runs
`disasterPhase` then `climateTurn`, the same order.

## C-20 tail: the trade path's land and water tests and the switch — READ

IsLand 0x5583a0 / IsWater 0x558460 (Trade_Movement.cpp): when the plot's
virtual +0x40 holds (a district stands there), they read the plot info's word
+0x14 through 0x81240 — argument 0 tests bit 1, 1 bit 2, 2 bit 4: land = bit 4
and not bit 1, water = bit 1 and not bit 4; a plot carrying both (or neither)
is neither land nor water. Without a district: land = not water (0x834d0).
Who writes word +0x14 is unread; the records fix the answers (below).

The range callback 0x5579b0, per edge: r = the from-node's range; a switch
(0x558300) caps r at 1; a from-plot holding a TradeEmbark district of the
origin city or of a city with the player's trading post refuels r to the land
refuel onto land, the water refuel onto water, the larger of the two onto a
plot that is neither; else a TradeEmbark district of the destination's city
to 3 (+0x1b0); a refuel sets the context's flag +0x1cc. left = r - 1. The step
cost 0x558970 swaps its 100 for 10100 (0x558a08) when 0x558300 answers a
switch and the flag is clear. (The context's +0x1a2, a player-trade count
+0x4b0 / +0x510 <= 0, is set in every recorded game; clear, it would hold the
base range and the land refuel at 3 and cap every step onto land at 1.)

Recorded, runs/h1_duelw1108: Rome's Trader to Shenyang walks 618 (land) -> its
Harbor 617 -> Ocean at t182 (Antium not yet founded: every way to sea pays a
switch) and, from t212 with Antium standing, Rome -> Antium's centre 796 ->
the coast -> Shenyang's Harbor 479 -> 522, 21 plots against 13: the step onto
Rome's Harbor is a switch that pays 10000 (a Harbor's plot is water), the step
from Antium's centre to sea is none or refuelled (a City Centre's plot is
neither). China's Jiaodong -> Rome (t200) walks Shenyang's centre 522 -> its
Harbor 479 -> sea with no post in Shenyang: a switch there would leave range
0 at the Harbor and refuse the next step, so the centre is neither land nor
water. The engines (`walk` / `_trade_reach`): a City Centre's plot neither,
every other plot its ground; route.originYields on the six duels 112 -> 44.

## C-49 tail: the storm's start plot — READ

"Pick Storm Start Plot" 0x288250: every map plot scored by 0x2900c0 — valid
(0x28aa00 over the radius the row's Hexes gives: >= 19 → 2, >= 3 → 1, else
0) when each plot in it passes 0x28eab0 (its terrain in the row's
RandomEvent_Terrains, an empty list passing all), weight valid × (Spacing +
1), less (Spacing − d) when the nearest live storm's current plot (m_aStorms
+0x8b0, stride 0x68, the path's last plot; 0x28cfa0) lies d < Spacing away;
ONE weighted draw. No test of a plot under another event: a storm may begin
on a live storm's centre (weight 1). Every storm row's Spacing is 15.

## C-74 tail: "under an event" for a drought start — READ

0x28de40 (the drought predicate's event test): true when the plot is in any
live storm record's struck list (m_aStorms +0x8b0, stride 0x68, the vector at
+0x38..+0x40). Droughts' and fires' plots are not read. A burning plot fails
the predicate anyway (it carries a feature).

## Border plot: GetNextBuyablePlot — READ

0x1aa7f0 scores every plot within PLOT_INFLUENCE_MAX_ACQUIRE_DISTANCE (5)
of the centre that is unowned and touches a plot of this city (owner and
city id): cost = d * DISTANCE_MULTIPLIER * 2; a resource the player can see
(0x4ab4b0, the reveal condition) adds RESOURCE_COST when d <= 3, any other
plot adds WATER_COST if water (0x834d0) and RING_COST when d > 3; an
improvement adds RING_COST if it is the barbarian camp (0x362130), else
IMPROVEMENT_COST; a natural wonder (0x82e90) NW_COST; YIELD_POINT_COST per
yield point to the owner (0x82280); then over its six neighbours, each
UNOWNED one with a seen resource -1 and with a natural wonder -1, and -1 once
more if such a wonder lies within 3 of the centre. The lowest cost collects
a tie list; 0x1ab1c0 draws one ("GetNextBuyablePlot picker") whenever the
list is non-empty. BASE_MULTIPLIER and DISTANCE_DIVISOR are not read here.
The turn's handler 0x1a9bc0 (City_Culture.cpp) banks culture × (100 +
percent) / 100 when the civ level annexes with culture, and when the box
covers the cost spends it and annexes the STORED plot (+0x1c) if still
unowned, else a fresh pick (nothing annexed if none); at most one plot a
turn. Every turn, every city, it then re-picks and stores the next plot.
Fit on the H-1 Duels with the game's own plot yields: 2,489 of 2,780
city-turns (the rest: unseen resources the fitter cannot tell).

## C-94: the game era, the ages and the founding moments — READ

Game_Eras.cpp. The per-turn update 0x2c2dc0 (gated by a game option,
hash 0xf10572be) runs with the game's other end-of-turn steps after the
counter moves; m_eCurrentGameEra +0x108, its first turn +0x168, the
countdown variable +0x170 (value +0x1c8, -1 idle). Check:
`.claude/scratchpad/era_player_check.py` over the H-1 dumps.

- Short of the last chronological era (0x93e8a0): with the countdown idle
  and 0x2c4c80 true, the countdown is set to NEXT_ERA_TURN_COUNTDOWN
  (GlobalParameters +0x524, 10); a running countdown is decremented the same
  call; when it falls below 0 it is reset to -1 and the next era begins
  (0x93eaa0 next era; ages 0x2c0e80; 0x2c6d70 sets the era and its turn).
  So the era begins 10 turns after the countdown starts.
- 0x2c4c80: false when turn < MinTurn − 10; true when turn ≥ MaxTurn − 10;
  else true when at least half the game's players vector (+0xb50; the majors,
  eliminated ones counted — no alive test) stand in a chronologically later
  era than the game's (0x2c3940 counts them; 0x2c3900 the rest; the test
  is ahead ≥ total − ahead). MinTurn 0x2c3870 = start + scale(Eras_XP1
  GameEraMinimumTurns), MaxTurn 0x2c37c0 = start + scale(GameEraMaximumTurns)
  (Eras_XP1 row +0x24 / +0x2c), scale 0x5254d0 = x × GameSpeeds.
  CostMultiplier / 100 truncated: online 20 / 30. The first era's start is
  the game's first turn.
- A player's era (0x467eb0, the techs object +0xf8) is the highest era of
  its techs and civics as of its turn's end: a tech granted in its turn
  shows in the next record's era field (1104 t162 → t163) and in the check
  that ran after that turn.
- Verified: era starts 31, 61, 91, 121, 151, 181, 201, 231 (1103) and
  31, 61, 91, 121, 151, 173, 193, 223 (1104), 16 of 16; the countdown's
  start by the half-ahead clause on 1103 t191, 1104 t163 and t183.

The ages, 0x2c0e80 at the era change, per player in the game's list: the
score s = the sum of the player's era-score vector (+0x5b8, 22 types,
never reset — the whole game's, `GetPlayerCurrentScore`); Golden when
s ≥ the Golden threshold 0x2c3b60, Dark when s < the Dark threshold
0x2c3a70 (each = max(0, base + Σ shifts)), Heroic when Golden out of a
Dark age (the copied previous flag). Then the next thresholds: 0x2c6be0
sets the bases to s + scale_SLIGHT(GOLDEN_AGE_SCORE_BASE_THRESHOLD 28) and
s + scale_SLIGHT(DARK_AGE_SCORE_BASE_THRESHOLD 14) (0x525500 with
SCALING_SLIGHT 0x50b150fa: × GameSpeed_Scalings.DefaultCostMultiplier
/ 100 truncated, ONLINE_SLIGHT 80 → 22 / 11; 100 where the speed has no
SLIGHT row); 0x2c55d0 the eleven shifts: THRESHOLD_SHIFT_PER_CITY ×
max(0, cities − 1); MISSING_AMENITY and the four INCOMPLETE_* (0 in GS);
[10] the entered era's Eras_XP2 EraScoreThresholdShift (Ancient −3);
then 0x2c0e80 adds PER_PAST_GOLDEN_AGE 5 to [7] for a Golden or Heroic age
entered and PER_PAST_DARK_AGE −5 to [8] for a Dark one (cumulative). The
game's start (0x2c69c0) fixes the first bars off s = 0: 8 / 19 online.
Thresholds never move mid-era (the city count is read at the change).
Verified: every age and both bars of both majors at every era change of
the H-1 Duels, 16 / 16 each (`era.age`, `era.bars`).

Moments (Game_History_MomentHandlers.cpp, Game_History_Manager.cpp).
Recording 0x3004e0 pays the row's EraScore unless the game era is before
its MinimumGameEra or after its MaximumGameEra, the game's START era is at
or past its ObsoleteEra, or the same moment for the same player lies within
RepeatTurnCooldown (speed-scaled) turns. 0x315af0: has the player ever
recorded this moment type (the whole history). The city-founded handler
0x306b40 records, for a founding with no plain founding moment:
BECAME_LARGEST_CIV_BY_MARGIN when its cities − 3 ≥ every other major's
(once a game); NEAR_NATURAL_WONDER, a natural wonder within 2 (once per
wonder); NEAR_OTHER_CIV_CITY, another player's city within 5 (every time);
NEAR_FLOODABLE_RIVER and NEAR_VOLCANO within 2 (once a game); NEW_CONTINENT
when none of its other cities stands on the plot's continent (every time,
not the first city); ON_DESERT / ON_SNOW / ON_TUNDRA by the centre's
terrain, flat or hills (every time). The other-civ test (0x312b00): the
plot holds a city whose owner is not the founder, is a full civ (0x469db0,
CIVILIZATION_LEVEL_FULL_CIV), the founder has met (0x3daaf0) and the plot
is revealed to the founder. Pantheon 0x314840: FIRST_IN_WORLD when no
other player holds a pantheon, else the plain row; religion 0x3057a0:
FIRST_IN_WORLD while no player has recorded it, else the plain row. A
world wonder 0x3110a0: GAME_ERA_WONDER (4) when the wonder's era is the
game era or later, else PAST_ERA_WONDER (3). A city transferred 0x3088a0
(paid to the new owner): TO_ORIGINAL_OWNER when its original owner (+0x218)
is the new owner and the reason is not BY_CULTURAL_IDENTITY, once per city
and player (0x315b50); then, when the old owner is a full civ,
PLAYER_DEFEATED when the old owner's city count is ≤ 1, else
FOREIGN_CAPITAL when the city is an original capital (+0x648) of the old
owner. A city-state's or a Free City's city records neither. Great People
0x3142a0: GAME_ERA / PAST_ERA, both 1. Fit: `step.eraScore` 394 / 482
(1103) and 372 / 480 (1104), from 382 and 365; the rest are moments the
engines do not record.

## H-1: the plot's event yields and the city yield's percent — READ

- An event's yield gain 0xa190d0 (from the flood 0xa2ed80 "Boosted Yield
  Chance", the storms 0x2867f0 / 0x286f80, the eruption soil 0xa219e0
  "Fertility Gain Chance" and 0xa21680): after the floater, the plot's
  sparse yield slot takes `add [slot], amount` (0xa192ea / 0xa19337) — no
  clamp, so a plot's event yields have no cap. Records: runs/h1_duelw1108
  plot 609 (Plains, Volcanic Soil) reads 5 Food at t217 after four Food
  draws.
- A city's yield (Lua City:GetYield 0x981dd0 -> 0xaa060 -> GameAttribute
  value 0xaa740): ONE fixed-point modifier per attribute, clamped to
  (-1000, 1000), value = base + base x modifier / 100 (the 0xa3d70a3d...
  divide). Every percent a modifier puts on the yield sums into that one
  field. Records: runs/h1_duelw1108 Handan t105, 12.5 Science reads 13.125
  (Displeased -10% + Librarian +15% = +5%), 9.1 Culture 9.55.
- The city's Production read (GetYield) holds the flat the Industrial /
  Militaristic envoys pay toward the head of the queue, under the same
  percent: Xi'an t25 reads 10 building an Archer (9 + Wolin's 1), 8 at t45
  building a district; t95 14.4 = (15 + 1) x 0.9.

## C-94: the slot rebuild — READ

Player_Culture.cpp and GameEffects_GameEventHandler.cpp. The slots are a
vector of {slot type, policy} pairs (+0x3d8, read at +0x430, count +0x440;
`GetSlotPolicy` 0x399ab0); a byte per policy (+0x7c8, read at +0x820) marks
it slotted (`IsPolicyActive` 0x39dff0 reads it, so it never shows a lapse).
A card's modifiers attach on the "policy added" signal (GameSignals +0x11a0,
handler 0xc97410, "Policy Enacted - Attaching modifiers") and detach on
"policy removed" (+0x11b8, 0xc97780, "Policy Retracted - Detaching").

- SetSlotPolicy 0x3a3990: CanSlot 0x393400 (refuses a card already flagged
  slotted), flag the card, signal REMOVED for the card the slot held
  (unflagging it), store, signal ADDED. ClearPolicySlot 0x394730: unflag,
  REMOVED. The civics command 0x44bb0 (type 0 set one slot, 1 government,
  2 clear one slot, 3 the UI's clear list then add list).
- The rebuild (SetGovernment 0x3a25f0; the slot-count changes 0x39fc00,
  0x3a2bf0, 0x3a2e30): save the slots (0x3a3b00 into +0x448, std::sort
  0x386350 / 0x385b50 by the card's policy row +0x88 link's +0x1c — the
  PrereqCivic's Cost, the civics loader's column 4 at +0x1c (0xabc150) —
  highest first; a card with no link after, an empty slot last; insertion
  sort, so ties keep slot order), clear every slot (0x3942d0 with -1:
  unflag and REMOVED for each card), build the new slots (0x391650: the
  government's rows, the player's extra slots, the removals, the per-
  government extras), then walk the new slots in order: while more than
  one slot stands empty (0x3996b0 counts them), 0x398cf0 takes the first
  saved entry whose SLOT type is the new slot's, spends it and flags its
  card slotted; 0x3930a0 (the card valid under the government) and the
  card is written into the slot directly — no ADDED signal, so its
  modifiers stay detached.
- The AI (0x625d70, on a completed civic and each turn): the government
  command, then each slot in order: the best-scoring card CanSlot admits
  (so never one already slotted, a laid-back one included) scoring above
  the slot's card takes the slot by command type 0. A card laid back pays
  again only when it is displaced and slotted again; one left where the
  rebuild laid it pays nothing while it is listed.
- Fit: `importLapsed` reads the records' slot lists by these rules (a
  rebuild where the government or the slot count moved). Over the six
  Duels gap-free city.housing 1,319 → 438, city.amenities 1,629 → 827,
  city.amenityTier 767 → 404, city.loyaltyPerTurn 758 → 441, buy.plotGold
  978 → 174 (Expropriation); 1108's housing 1,940 / 1,940. 1108 China t249
  (Monarchy [Force Modernization, Levée, Heritage Tourism, Raj, Civil
  Prestige, Liberalism] → Theocracy with an extra Economic slot): Liberalism
  (the Enlightenment 360) lapses in the Wildcard, Civil Prestige (Civil
  Service 150) is slotted anew and pays.

## C-94: the religious spread — READ

City_Religion.cpp, PlayerReligion. A city's religion object holds a vector
of {religion, followers, pressure, remainder} entries (+0xa0, count +0xb0),
the majority at +8 (the last one at +0xc8). Pressure is fixed point, 8
fraction bits (every amount is written `<< 8`).

- The spread (0x4967f0 PlayerReligion's turn: faith, the purchase
  notification, then 0x498570): a player whose founded religion (the
  vector at +0xa0 by its +0x128 index) is not -1 spreads THAT religion: for
  every player in the game's list (+0x7f8), every city of it whose majority
  ([city +0x1910]) is the religion, 0x498660 walks every player's every
  city other than the source and adds 0x496980's amount when positive
  (0x1f20e0, the entry found or appended), then recomputes the target
  (0x1f6480). A player with no religion — a city-state, the Free Cities —
  spreads nothing; its cities press on the founder's turn.
- The pair amount 0x496980(religion, source, target): nothing to an ally's
  city (the 0xd71225de check) or a Citadel-of-God city of another founder
  (+0x19e8); the source's step (0x1f33e0) when the target is within the
  range and the source follows the religion; then the trade manager's
  route source -> target (0x54ae60, TRADE_ROUTE_PRESSURE_FOR_DESTINATION at
  gp +0x5f8) and target -> source (0x54bae0, _FOR_ORIGIN at +0x5fc).
- The step 0x1f33e0: ADJACENT_PER_TURN_PRESSURE (gp +0x5d4); x
  HOLY_CITY_PRESSURE_MULTIPLIER (+0x5e0) on the religion's Holy City plot,
  or when the OWNER's religion object counts TREAT_HOLY_SITE_AS_HOLY_CITY
  (+0xce0, Jerusalem's suzerain) and the city has a Holy Site, or the
  owner counts TREAT_CAPITAL_AS_HOLY_CITY (+0xc80, gone in Gathering Storm:
  Expansion2_RemoveData deletes the base Jerusalem trait) and its +0x1368
  player founded the religion; else HOLY_SITE_PRESSURE_MULTIPLIER (+0x5e8)
  with a Holy Site; then x (100 + the owner religion's 0x4975a0 + the
  city's +0xd4 (MODIFIER_SINGLE_CITY_RELIGION_PRESSURE, the Bishop) + a
  table term read through the city's +0x2170) / 100, then the game speed
  (0x525590). The unread percent terms are 1107 Kandy's 8 against 4.
- The population change 0x1f3050 (called from City ChangePopulation
  0x1c79b0): a gain of n adds ATHEISM_PRESSURE_PER_POP (gp +0x5d8) x n,
  `<< 8`, to the entry of the current majority (+8: -1 when none, the
  unconverted), then recomputes; a loss only recomputes. The reset
  0x1f6360 leaves one entry, {religion, pop x 50}; a recompute with no
  positive pressure leaves {-1, 1 follower, 50} (0x1f43c0).
- The recompute 0x1f43c0 shares the citizens by largest remainder; the
  leftover citizens go one at a time to the entry with the largest
  remainder, a tie to the LATER entry (`jl` at 0x1f48aa) — the engines'
  tie order (higher pressure, lower id) is the lab's fit and unread here.
- Fit: the harness spreads each founder in seat order on the record's
  state, each major's recorded growth (`gainPopulationPressure`) before
  its spread and its route changes after: 1108 step.pressure 1,415 / 307
  → 1,720 / 2; six duels 7,172 / 2,973 → 8,648 / 1,516.

## C-94: trade posts and cultural dominance — READ

- Trade_Manager 0x5500b0 counts the Trading Posts on a route's path from
  index 1 through the destination, own and foreign apart: a foreign post
  pays TRADING_POST_GOLD_IN_FOREIGN_CITY, an own one the player's own
  bonus (Rome's All Roads Lead to Rome +1, the destination's post too).
- PlayerCulture's turn (0x396860), a major's: the culture lands (lifetime
  culture +0x1050, 24.8, grows by every gain of civic progress, 0x3a1fb0 —
  a boost's share included; culture with no civic chosen is held at +0xb40
  until one is), then per other player it has met (0x3daaf0) the tourism
  toward it is banked (0x394830 / 0x3939b0, +0xc68) and its tourists
  refreshed (0x39f610), then 0x393af0 the dominance, then the visiting
  total is stored (+0x1118).
- A seat's citizens: (lifetime culture >> 8) / TOURISM_CULTURE_PER_CITIZEN
  100. Raw tourists p draws from o: ((bank >> 8) / TOURISM_TOURISM_TO_MOVE_
  CITIZEN 200) / the number of majors (+0x10d0). Drawn (0x394fa0): the raw
  count, or raw x citizens(o) / demand when o's citizens fall below the
  demand — every met player's raw count toward o (0x399b90). Domestic
  tourists (+0x10b0, "staycationers"): citizens less what the others draw
  (0x3a2250 with 0x399c80; 0x39f610 moves it by each refresh's delta).
  Visiting (0x39bee0): the sum of what the player draws from each other.
- Cultural dominance 0x393af0, per met other player: visiting > the other's
  domestic sets the pair's flag, < clears it, equal keeps it. 0x54c6c0 adds
  TRADE_ROUTE_GOLD_CULTURAL_DOMINANCE (gp +0x6ec, 4) to a route whose
  origin's owner dominates the destination's (`updateCulturalDominance` /
  `_update_cultural_dominance`, `Seat.culturallyDominant` / `civ_dominant`;
  the culture victory reads the same counts, `visitingTourists` /
  `domesticTourists`). 1108 Jiaodong -> Rome +4 from its first record t200.
- CITIZEN_IDENTITY_PRESSURE_MOD_CULTURAL_DOMINANCE (gp +0xec, 25): 0x1a1640
  raises a player's great-work identity pressure (+0x588, + Great Works x
  +0x1aec) at a plot whose owner it dominates by 25%, before the distance
  falloff (gp +0xf0). No engine term matched yet (AUDIT C-94 BUILD).

## H-1: a route's yield per path plot (Hunza) — READ

Trade_Manager 0x54bdb0 (a route's yield of one type): the route's path from
the trade manager's cache (0x541ae0; else a fresh path, 0x5526a0), n its
plots (4-byte entries, both ends included); the posts counted on it
(0x5500b0) times the player's own / foreign post bonuses (0x4d9750,
0x4d9670); then the per-path-tile bonus (0x4d9620, the player trade vector
+0xeb8 that EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_PER_PATH_TILE writes through
0x4d8220): floor(n x a + a / 2) in 24.8 fixed point (`and ebx, 0xffffff00`),
a = Hunza's 0.2 held as 51. Aquileia -> Rome (5 plots) +1, Aquileia -> Hunza
(10) +2, Rome -> Shenyang through Antium (21) +4 (runs/h1_duelw1108; the
engines' `routeLengthGold` / `_route_length_gold`). The route's path is laid
once, when the route begins: the harness keeps the course the first record
carrying a route laid (`History.routeCourse`).

## H-1: the citizen pressure term — PARTLY READ

0x1a1ae0 (City_CulturalIdentity.cpp) turns a city's own and foreign
citizen pressure (24.8 fixed point, gathered by the plot walk 0x6aef0 over
CITIZEN_IDENTITY_PRESSURE_RADIUS_CUTOFF, gp +0xf0 = 10, with the per-plot
functor 0x19b090) into its loyalty term: both 0 → 0; own 0 → −MAX_LOYALTY;
foreign 0 → +MAX_LOYALTY; else r = hi / lo in 24.8 (0x16e940), clamped
into [NEUTRAL_RATIO, MAX_RATIO] (gp +0x480 / +0x478, floats cut to 1/256);
t = (r − NEUTRAL_RATIO) / (MAX_RATIO − NEUTRAL_RATIO) in 24.8; the term
NEUTRAL_LOYALTY + (MAX_LOYALTY − NEUTRAL_LOYALTY)·t >> 8 (gp +0x474 /
+0x47c, ints << 8), clamped into [NEUTRAL, MAX], times −1.0 when the
foreign side is larger (`pressureTerm` / `_pressure_term`). A byte argument
returns the raw own − foreign instead. Not read: the distance falloff the
walk's entries take; the engines' floor(256·(10 − d)/10) per city, each
city's product floored, is a fit (AUDIT C-94 LAB): runs/h1_duelw1112 Yiyang
t192 reads 0.546875 (own 971/256, foreign 918/256 → r 270/256) where the
reals read 0.411; recorded terms 2,036 → 2,092 of 2,097 (1112), 2,038 →
2,092 of 2,114 (1106), 1,619 → 1,751 of 1,843 (1110).

## H-1: the annex, the purchase and the stored next plot — READ

0x1a8b70 annexes one plot to a city (City_Culture.cpp): it writes the city
culture's stored next plot (+0x1c) to -1 and counts the plot (+0xc). Its
callers: the culture turn (0x1a9bc0, which then draws and stores a fresh
plot), AnnexPlots(n) (0x1a8a30: n picker draws, each annexed), the plot
swap (0x1ac910), the culture bombs (0x524e30), the Trader's tiles en route
(0x558510) and the Gold purchase (0x977aa0: the price spent through
0x4e02e0, then the annex). A purchase made after the turn's culture step so
leaves the city with no stored plot until its next culture turn (the
records' -1 after an AI's purchase: 1108 Chengdu t159–162); the engines
clear it in `buyTile` / the GPU's tile purchase. Which record a purchase
lands in against the culture step (the human seat's purchases fall before
its next turn's step, the AI's after) is the harness's to read, so a city
the record shows holding no plot after a plot gained stays a skip.

## H-1: a religious unit's spread — PARTLY READ

0x968e20 (the spread's pressure, a unit's): max(0, ReligiousStrength (unit
+0x1ce0) x RELIGION_SPREAD_STRENGTH_MULTIPLIER (gp +0x5f4, 200) / 100 −
unit +0xcf0), then, when the caller's flag is set and the unit's +0x1d00 is
positive, x (100 + it) / 100. Recorded: a full-health Missionary lands 200,
an Apostle 220 (1108 Rome t108–110, Aquileia t239–240; 1104 Nanjing t233),
and the spread takes the unit's Units.ReligionEvictPercent off every other
religion (Missionary 10: 1103 Lugdunum 1,000 → 900 → 810 → 729), never off
the unconverted. The engines: `spreadFromUnit` / the GPU's spread arm (the
strength at SPREAD_STRENGTH_PCT, the enhancer's multiplier, the health
scale, `evictPct`). Unread: what +0xcf0 holds (the engines scale by health)
and who writes +0x1d00 — 1103 t144 / t191 and 1106 t179 Missionaries land
250 with no Scripture in the religion, while 1103 t124 and 1108 land 200.

## C-94: the wounded law and the garrison — READ

- 0x522630, the Combat a wounded unit loses, 24.8: m = COMBAT_WOUNDED_DAMAGE_
  MULTIPLIER (gp +0x238, 10) << 8, less m x the unit's reduction percent
  (+0x1868, the Samurai's NoReduction); times the damage percent (damage x
  100 / COMBAT_MAX_HIT_POINTS) >> 8. Each percent is a float32 product with
  0.01f cut to 1/256 (the whole part << 8, the fraction x 256 truncated to a
  byte): 82 damage -> 209/256 -> 2090/256 lost, not 8.2. Callers: the
  district preview, the unit-vs-unit strength (DAMAGED_UNIT_DESC), the air
  strikes (`woundedLoss256`, `_wounded_loss`).
- The centre's garrison term (0x24a180): FP(Combat incl. formation,
  0x56dc90) less the wounded loss, less the base, where positive (H-1 1108
  Jiaodong 30.8359375 = 29 + 36 - 26 - 2090/256).
- The walls' term: each wall building's OuterDefenseStrength (+0x44) and
  the city's enhanced-walls bonus (+0x1888), paid while 0x24b960 holds: the
  district's outer damage (+0x8d8) below its outer maximum — a breached
  perimeter pays none (1108 Xi'an 3 lower t97-111, `centreStrength`).

## H-1: the district adjacency — READ

Improvement_Yields.cpp. Lua Plot:GetAdjacencyYield (binding 0x25600 ->
0x81b90 -> 0x5389b0) and District::GetYield (0x249850) both reach the sum
0x365720 (via 0x366df0, the plot's owner and city); the city's yield walk
0x7aaf80 calls the per-row 0x365ae0 itself.

- 0x365720 (player, city, district type, yield, plot): the district row's
  vector of Adjacency_YieldChanges rows (+0x100), each through 0x365ae0,
  SUMMED AS INTEGERS; then the player's modifier-added adjacencies
  (0x1cb470: MODIFIER_PLAYER_CITIES_TERRAIN_ADJACENCY and kin, entries of
  0x30 bytes: terrain, feature, river +8, adjacent district +9, appeal
  +0xc, TilesRequired +0x14, amount +0x18), each entry's count × amount
  truncated by `idiv` TilesRequired on its own and added.
- 0x365ae0, one row (column map from the loader 0xa57930's SELECT: flag
  byte +0xc0 = AdjacentNaturalWonder 1, AdjacentResource 2, AdjacentRiver 4,
  AdjacentSeaResource 8, AdjacentWonder 0x10, OtherDistrictAdjacent 0x20,
  Self 0x40; +0x1c YieldChange, +0x18 TilesRequired, +0xc8 AdjacentDistrict,
  +0xd0 AdjacentFeature, +0xd8 AdjacentImprovement, +0x100 AdjacentTerrain,
  +0x20 AdjacentResourceClass): 0 unless the row's yield is the one asked
  and 0x367010 admits it (YieldChange ≠ 0, PrereqTech / PrereqCivic held,
  ObsoleteTech / ObsoleteCivic not, the row not in the civ's or leader's
  ExcludedAdjacencies). A fixed-point accumulator (8 fractional bits) takes
  YieldChange once for Self and once for a river on the district's own plot
  (+0x37), then for each of the six neighbours YieldChange per clause it
  answers: a natural wonder (0x82e90); the resource AS THE PLAYER SEES IT
  (0x50a690 with the player's team; artifacts excluded) for
  AdjacentResource, on water for AdjacentSeaResource, by class name for
  AdjacentResourceClass; a wonder (0x81330); OtherDistrictAdjacent: the
  neighbour's owner (+0x1c) is the player, its district (0x810d0) is not
  InternalOnly (Districts +0xe1 bit 4 — the Wonder district), is complete
  (District +0xb08, Lua IsComplete 0x9c83d0) and not pillaged (+0xc88,
  0x24c3a0); AdjacentTerrain: the plot's terrain (+0x2c) alone;
  AdjacentFeature (+0x3c); AdjacentImprovement (+0x44) not pillaged (+0x4d
  bit 0); AdjacentDistrict: that type, complete (0x811b0) and not pillaged
  (0x811f0), WHOEVER OWNS IT. After the six: divided by TilesRequired when
  over 1 (0x3640e0, fixed point) and `sar 8` — floor(n · YieldChange /
  TilesRequired) per row.
- The city's walk 0x7aaf80 shifts each row's integer back to fixed point
  and applies the adjacency percent per row (0x7a6690) before adding it.
- District::GetYield 0x249850 (yield, percent flag): 0 while pillaged;
  else 0x366df0's adjacency + the district's flat yield bucket (+0x2f0) +
  its appeal rows (+0x458: yield, minimum appeal, amount); the percent only
  when asked.
- The high-adjacency moments, handler 0x312c00 at a district's
  completion: per district type (Campus 0x675dbc7a, Commercial Hub,
  Harbor, Holy Site, Industrial Zone, Theater Square) GetYield(that
  district, its yield, no percent) ≥ 3 / 4 / 4 / 3 / 4 / 3, once per
  player and type.

The two recorded cases: 1104 Xian's Campus (1 Mountain, 3 Rainforest, its
centre) 1 + floor(3/2) + floor(1/2) = 2, the game's 2 (pooling would give
3); 1106 Handan's (2 Mountains, a Rainforest, the centre) 2 + 0 + 0 = 2. The
centre counts as a district (not InternalOnly, complete). Machu Picchu's
mountain rules close 1104 t143 and 1108 t187 (an Industrial Zone at 3 rows
+ 1 Mountain, the game's moment paid). Check: `tests/cpu/city/adjacency-rows.test.ts`,
`tests/gpu/adjacency_rows_test.py`; H-1 `city.yields` 5,759 → 5,921 passes,
`step.eraScore` 2,690 → 2,693 over the six Duels.

## H-1: a district project's yield conversion — READ

City_BuildQueue.cpp. The queue's turn 0x177d10 reads the city's Production
(0x1c5350), CLEARS the city's per-yield conversion vector (+0x1108 of the
city's yield component) and its project id (+0x1360 = -1), then applies the
Production (0x16f050), whose ORDER_ADVANCE arm 0x184ae0 walks the project's
Project_YieldConversions rows (Project +0x168, loader 0xa98af0): for each,
amount = min(the Production passed in, the item's full cost (0x179510)) x
(PercentOfProductionRate << 8) / 100 — fixed point, so the rate is the
percent truncated to 256ths (15% 38/256, 30% 76/256) — plus a player
attribute's percent of that (hash 0xbcfe99b8, 0 in every record), asserted
non-negative and never the Production yield itself, added into +0x1108 at
the row's yield. The city's yields read the vector under their one percent
until the next step clears it; a completion pays no lump. Records:
runs/h1_duelw1108 Aquileia t112-125 7.625 Science = (7 + 9.9 x 38/256) x 0.9,
t169-176 16.75 Gold = 12 + 16 x 76/256; the first step's figure holds the
bank paid in (t111 14.8 Production). Engines: `City.projectYield` /
`city_proj_conv`, `city_proj_yield`; `projectConversionRate`.

## C-94: the growth modifier — READ (the accumulator's writer unread)

Lua `City:GetGrowth():GetOverallGrowthModifier()` (binding 0x9876b0) reads
the city-growth cache's +0x28, a 24.8 fixed-point value; the cache copy
0xa7b10 (its data 8 bytes into the cache) fills it from CityGrowth
0x1b62d0, beside housing 0x1b5f70 (Lua +0x14), happiness 0x1b5800 (+0x18),
other 0x1b6180 (+0x1c) and occupation 0x1b6120 (+0x20). 0x1b62d0:

- r = 1.0 (0x100); r += the amenity tier's Happinesses.GrowthModifier as
  (percent << 8) / 100 through the fixed-point divide 0x16e940 (an integer
  idiv: −15% −38, −30% −76);
- r += other (0x1b6180): a game-configuration percent turned to fixed point
  through float (floor of the value, then the fraction × 256 truncated —
  0 in every record) plus CityGrowth +0x84, m_iOtherGrowthModifier, the
  accumulator EFFECT_ADJUST_CITY_GROWTH feeds (the effect's Amount parsed by
  0xbc1300 into its +8; the writer of +0x84 is not read);
- r < 0 → 0; r ×= the housing factor (0x1b5f70), then ×= 0x1b6040 (1 in
  every record), each a fixed-point multiply.

The accumulator, fitted on runs/h1_duelw1103–1108 (`growthmods.py`-style
reads of `overallGrowthMod` where the housing factor is 1): a +15% percent
(the Hanging Gardens) reads +38, a +20% (the Migration Treaty, Surplus
Logistics) +51; when the treaty ends its cities fall by 52 (1108 Jiaodong
89 → 37 at the t142 session, Rome's 51 → −1 at t222), so a detach adds
floor(−p·256/100): each detach of a percent that is no whole number of
256ths leaves −1 for good (1104 China's 38 → 37 → 36 over two sessions).
Engines: `growth256` (the tier), `growthPct256` (the accumulator's terms),
`City.growthDrift` / `city_growth_drift` (the residue), the treaty's detach in
`congressSession` / `_world_congress`.

## DLL rules the engines contradict

- The wounded law (0x522630) on a unit's strength in a fight: the engines'
  `woundPenalty` / its GPU twin round 10 - HP/10 (AUDIT C-94 BUILD); the
  garrison term reads the law.
- CITIZEN_IDENTITY_PRESSURE_MOD_CULTURAL_DOMINANCE's 0x1a1640 term (AUDIT
  C-94 BUILD).
- Lifetime culture (0x3a1fb0) grows by every gain of civic progress, a
  boost's share included, and not by culture held with no civic chosen: the
  engines' `cultureTotal` / `civ_culture` sum the culture yield (AUDIT C-94
  BUILD; the H-1 importer folds the game's rule).
- The high-adjacency moment reads District::GetYield's flat bucket (+0x2f0)
  and appeal rows (+0x458) only as Nan Madol's Culture (docs/AUDIT.md, the
  Harness section's Moments BUILD line).

Every other rule read above ships on both engines.
