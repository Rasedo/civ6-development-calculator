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
  below PercentVolcanoesActive (MODERATE 70): D //= ((70 − pct)·V' // 100)
  when that is ≥ 2, V' the NAMED volcanoes, and rand(D) = 0 wakes one
  dormant named volcano drawn uniformly ("Choose Active Volcano Roll"); at
  or above 70 the same roll puts one ACTIVE volcano to sleep ("Choose
  Inactive Volcano Roll"); the gate below ("C-74: the volcano roll's gate").
  **REVERSED by the game's draw log** ("H-1: the draw log's labels"): N is
  the event draw's N, 250 online — every "Active Volcano Roll" of
  runs/h1_duelw1117 (243) and 1118 (277) draws over 62 with two volcanoes
  (250 // 4; 500 // 4 is 125, and with two named volcanoes (70 − pct)·V'
  never reaches 200, so no divisor brings 500 to 62), and 1118 t152's
  "Choose Inactive Volcano Roll" over 2 is the sleep branch with both
  volcanoes active (pct 100 with V = 2). The earlier fit of N 500 to the
  Duel lab wakes (15.3 expected against 15) is withdrawn; the engines read
  `TURN_LIMIT` (`volcanoRoll` / `_volcano_roll`). The owner-gated reading of
  field +8 stays dead (10 wakes were unowned).
- The drought start (`dll_drought.py`): ONE draw over EVERY candidate plot
  ("Pick Drought Start Plot" 0x287e80) — **REVERSED: a uniform draw**, see
  "C-74: the drought's start pick" below; a candidate is a plot that and its
  six neighbours all pass the drought predicate 0x28eb60 — no feature, no
  river (plot byte +0x37), not water and not beside an ocean-sized water
  body (0x82a10), Plains / Grassland (hills too), not under an event —
  its score 0x28ff20 = 1 + min(hex distance to the nearest live drought's
  last footprint plot, Spacing 15) (m_aDroughts +0x948 in 0x28ce90) keeps
  in the list while above 0. No city anchor. Verified: 13 / 13 placed
  droughts start on a candidate, 34 / 34 droughts that found no plot had
  none (without the river clause 16 / 34, without the water clause 23 / 34).
- The fire's draws: "C-74: the fire" below (the strike 0x2867f0, SPREAD).

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

## H-1: the great person's spawn — READ

The grant 0x2f74b0 asks 0x2f6500 for the spawn plot: the class row (+0x70
its district, +0x98 its unit) and the unit's domain (0xadd590 on unit info
+0x1c). A land unit (domain 2): walk the player's cities (+0x12f0 -> +0xd8,
list order); a city holding the class's district (0x1aec20 on city +0x1a48
with (district, true, 0) — completed) and of greater population (+0x588,
strict >, so the first city wins a tie) takes the spawn, on its centre
(+0x158); none, the capital's centre (0x36f460), else the player's start
plot (+0x1398). A sea unit (domain 0) walks the player's districts, the
most populous city's water district plot. Confirmed on runs/h1_duelw1109 ..
1116: 152 of 154 newly listed units standing on one of their player's city
centres stand on the predicted city's (the two misses had spent their
moves). The importer
(`spentAtSpawn`) takes a person spent before any record showed its unit
to its site in that city: 1116 Ibn Khaldun t112 on Xian's Campus (the
city's Districts housing part 3 -> 5 in the next record agrees).

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

## H-1: the random events' draws — READ, replayed on 1115 / 1116

The generator (0x8b6c10): state' = 0x41c64e6d · state + 0x3039 (mod 2^32),
value = ((state' >> 16) · (max & 0xffff)) >> 16, the state stored every
call — a max of 0 steps and returns 0 (Lua's GetRandNum returns early;
rng_fit.py's (top15 · r) >> 15 misses seeds 2147483647 and -1 of the tuner
sweep, this form fits all 120 observations: `tests/cpu/harness/
civ6Random.test.ts`). The weighted picker 0x287c00: one draw over the
16-bit total, the first entry whose running sum passes it.

Where the turn's step falls: `Game.GetRandomSeed()` read at every
PlayerTurnStarted / PlayerTurnStartComplete (h1_starts.lua) brackets the
draws from the barbarians' completed start of turn T-1 to player 0's start
of turn T; the random-event step 0x338710 is the LAST thing to draw there.
Its order: the storms' walks (0x288f40 → 0x28ecd0), the volcano roll
(0x335040: one "Active Volcano Roll", a choice after a 0), the weights
(0x335260, no draw; entries in RandomEvents order, the empty slot appended
last for 10N − Σ), "Random Event Roll", the event (0x334d30). On 1116
39 of 39 floods and on 1115 25 of 25 reproduce the recorded silt with the
flood's draws ending on the witness (after the units and districts that
spend draws: see below); a flood whose replay lands also lands its roll in
its row's band (moderate 18–157, major 121–251, 1000-year 264–371 on 1116).

Per family, after the roll:
- Flood 0xa2f200: unless mitigated (a complete unpillaged Dam on one of the
  river's Floodplains, 0xa2c280; the Great Bath on one, 0xa2b280), each
  RandomEvent_Damages row (XML order) over the plots, one "Pillage
  Improvement Chance" rand(100) a plot whose owner is not immune (0xa28eb0,
  TRAIT_AVOID_*); a landed UNIT_DAMAGE_LAND rolls once per land unit,
  CITY_GARRISON once on a complete district with garrison hit points
  (0x336000), CITY_WALLS once while the walls stand (0x336170); then each
  RandomEvent_Yields row over the plots, one "Boosted Yield Chance" rand(100)
  a plot, +1 where under the Percentage (halved, truncated, when mitigated)
  and the plot carries the row's Floodplains — the count FertilityAdded.
  The plots: the river's Floodplains list (0xa2aa30 → 0xa2aca0): the river's
  plot list as its edges were laid from the source (the source edge its own
  plot, IsNE/NW/WOfRiver, then the plot across; each later edge the plot
  across it, each plot once), reversed (rivers start inland), the first
  unbroken run of 4–10 plots taking Floodplains (REVISED: "H-1: the
  Floodplains list"). Read off the record's river
  edges from the flood's start plot (`floodplainList`); two rivers meeting
  above a shared mouth (1116 rivers 12 and 178 at plot 480) give two walks,
  told apart by which river holds which list. 1115 river 181 (446 / 490,
  the source edge's owner) separates the source rule from "shared then
  other": Jiaodong's centre never takes silt (t46, t64, t248).
- Storm birth 0x291a20: "Pick Storm Start Plot" (above), "Storm Direction
  Preview" (0x28d1f0, a weighted draw over the wind rows at its latitude),
  the name (one draw over the naming player's citizen names, 0x28d400), the
  first strike 0x286f80 at 100% on a COPY of the record (stored before it,
  so the stored struck list starts empty).
- Storm walk 0x28ecd0, on the two turns after birth (a third turn's gap
  holds the quiet turn's draws): percent 50 once turn − start + 1 ≥
  Duration; steps of 0x28c500 — one "Storm Direction" weighted draw over the
  PrevailingWinds rows (XML order) whose latitude band holds the plot and
  whose neighbour exists (DirectionTypes offsets 0xeff670 / 0xeff688: NE
  (0,+1), E (+1,0), SE (+1,−1), SW (0,−1), W (−1,0), NW (−1,+1) axial, y
  north), cost 1 on the storm's terrain else 2 of Movement 8, a drawn step
  past what is left ending the walk with its draw spent; each step strikes;
  then a Preview draw. The strike: the footprint 0x28d6b0 (centre; Hexes 3
  adds NE and NW; 7 the six in direction order; 19 every axial (dq, dr) of
  −2..2 within 2, dq outer, the centre again) minus the struck list; per
  plot each damage row one rand(100) against Percentage × pct // 100 (the
  row's CoastalLowlandPercentage on a lowland plot), its own rolls after it;
  then off water and impassable plots each yield row one rand(100). 38 of 38
  births and first walks (1115: 28, 1116: 10) land the recorded plot and
  FertilityAdded.
- Eruption 0xa22000: damage 0xa1c1a0 (each row, each neighbour in
  DirectionTypes order not impassable and bare / Removable / Volcanic Soil,
  a bonus resource removed, one rand(100)), then soil 0xa219e0 (each yield
  row, each such neighbour off water, one "Fertility Gain Chance"
  rand(100)). 13 of 14 eruptions reproduce the painted plots and yields.

What the records cannot show and the replay allows for: a unit that came
and went on a struck plot between the records (0–2 draws before the yields),
draws after the event (1116 t91: two). The volcano roll does not run every
turn (1116 t6, t8: a one-draw gap; some walk turns fit only without it):
its gate counts the NAMED volcanoes ("C-74: the volcano roll's gate"). A
fire's birth draws as "C-74: the fire" reads.

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

## C-49 tail: the storm's start plot — READ (REVERSED)

"Pick Storm Start Plot" 0x288250 passes 0x2900c0 a COUNT, not a radius:
2 for Hexes ≥ 19, 1 for Hexes ≥ 3, 0 otherwise. 0x28aa00 with that count:
0 fails every plot (TORNADO_FAMILY never starts: 8 of 8 recorded at -1 on
runs/h1_duelw1115 / 1116); 1 asks the plot alone to pass the predicate (its
terrain in the row's RandomEvent_Terrains); 2 asks the plot, all six ring-1
plots on the map, and one of them passing. 0x2900c0's weight (valid ×
(Spacing + 1), less Spacing − d near a live storm) only sorts plots into the
vector of weight > 0: the draw is `get(count of entries)` — ONE UNIFORM draw
over the qualifying plots in ascending order (0x2883a4 passes the vector's
size, not its total). The earlier reading (a weighted draw over plots whose
whole disc qualifies) reproduces 1 of the 15 recorded births on 1115; this one 22 of 22
(the replay of `cpu/harness/eventReplay.ts`: hurricanes t45, t69, t74, t103,
t109, t163, t209, t243, dust storms t9, t24, t179, blizzards t30, t210,
tornado outbreaks t114, t158 on 1115; t13, t47, t48, t83, t191, t211, t225
on 1116).

## C-74 tail: "under an event" for a drought start — READ

0x28de40 (the drought predicate's event test): true when the plot is in any storm record's struck list, live or ended (m_aStorms +0x8b0, stride 0x68, the vector at
+0x38..+0x40; "C-74: the drought's storm bar"). Droughts' and fires' plots are not read. A burning plot fails
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
  city's +0xd4 (MODIFIER_SINGLE_CITY_RELIGION_PRESSURE, the Bishop) + the
  queue term) / 100, the percents SUMMED, then the game speed (0x525590).
  The queue term: the city's build queue (+0x2170, head 0x179650; -1 when
  empty) names an item whose Projects row (0xad5f10, +0x1c its index) has a
  Projects_XP2 row (0xad5fb0 / 0x28a940) — its +0x24, ReligiousPressureModifier
  (Holy Site Prayers 100, every other row 0). Recorded: runs/h1_duelw1118
  Armagh, a city-state with a Holy Site, reads GetPressureFromCity 8 on every
  record whose queue Prayers heads (t68–85, t116–130, t139–156, t212 on) and
  4 on the rest (t61–67, t86–115, t131–138, t157–211), China's cities each
  pressed 4 a turn harder with it (`pressureFromCity` / the GPU spread's
  `pct`; a minor's head is its unfinished build, `CityState.buildProject` /
  `citystate_build_proj`); 1107 Kandy's 8 against 4. 0x4975a0 (the owner
  religion's +0x6d0, plus +0x790 while its +0x730 entry holds) is unread.
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
- The spread runs inside PlayerReligion's turn, after its faith (the
  turn order's A6), so before the player's cities process (A8): a city the
  spread converts gives a citizen it grows that turn to the new majority
  (runs/h1_duelw1117 t148 Guangzhou and t190 Changsha +50 to China's
  religion, and each then presses its neighbours +2 the same turn). Both
  engines spread at the seat block's top, before the city walk; the
  harness spreads each founder in seat order on the record's state, each
  major's recorded growth (`gainPopulationPressure`) after its spread and
  its route changes after that: step.pressure over twenty-two duels
  1,741 → 1,574 gap-free failures, no duel worse.

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

An improvement's adjacency runs the same row evaluator: 0x3664d0
(`improvementDef != nullptr`) walks the improvement's
Improvement_Adjacencies rows (+0x110..+0x118) through 0x365ae0 with the
player it is handed, so an OtherDistrictAdjacent row counts only that
player's complete, unpillaged, non-InternalOnly districts and an
AdjacentDistrict row its type complete and unpillaged, whoever owns it
(`improvementAdjacency` / `_imp_adjacency`, the plot's owner the player).
Recorded (runs/h1_duelw1118): China's Monastery on plot 781 beside Longxi's
Campus and Armagh's Neighborhood reads 2 Faith t208–249 (counting both
would pay 3); Armagh's Monastery on plot 915 beside its centre and its
pillaged Holy Site reads 2 t23–25 and 3 once the site is repaired (t26).

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

## H-1: the luxury allocation — READ

Player_Resources.cpp 0x4a6110 (callers 0x4a7560, the import/export setter,
and 0x4a8ed0) rebuilds `m_aLuxuryAllocations` (Player_Resources +0x460,
serialized at 0x4a3d46):
- a city entry per city of the player's list (+0x12f0 -> +0xd8, walked in
  order): {id +0xf8, population +0x588, the city's amenities 0x1b4af0 less
  its luxury amenities 0x1b5210 (its non-luxury amenities), granted 0};
- a resource entry per resource the player holds (0x510960), resource index
  order: reach = the resource's per-copy reach (0x527a50); a no-cap resource
  (`m_aiNoCapResources` > 0, the Luxury Policy's duplicate) multiplies it by
  its copies (0x4a93c0) and carries a wrap flag; a luxury the player owns
  adds `m_iExtraAmenitiesPerOwnedLuxuryResource` (+0x160), a bonus resource
  `m_iExtraAmenitiesPerOwnedBonusResource` (+0x1c0); reach 0 is dropped;
- the resources are insertion-sorted (0x4a1eb0 -> 0x4a0e90, stable) by reach
  descending; the cities (0x4a1fd0 -> 0x4a0f60, stable) ascending by
  non-luxury + granted - amenities needed (0x5275a0), i.e. neediest first,
  once before the first resource and again after each;
- each resource grants one amenity to each of the first `reach` cities in
  that order, stopping at the list's end — a wrapping (no-cap, copies > 1)
  one runs on from the list's start (0x4a6b74).

Recorded, runs/h1_duelw1112 t83-t102: China's Amber under Luxury Policy A
(2 copies) reaches 8 in one pass, then three passes of 4: Xi'an, Guangzhou,
Beijing, Taiyuan, Chengdu read 3, 5, 4, 5, 3 (t83) and 5, 3, 4, 5, 3 (t90),
which the pass-per-copy fit with a fewer-copies-first rank (the engines'
rule before this reading) missed by one in two cities each turn. On the ten
duels city.amenities 18,085 -> 18,267 passes, no duel worse (1104's six
Cocoa included). The engines: `luxuryAmenities` / `_luxury_amenities`.

## H-1: the best melee, the drought's turns, the Trader's sea, the harvest's lump, the district discount — READ

- The city base's best melee (PlayerStats +0xf0, saved as
  m_iMaxMeleeStrengthTrained): 0x4c1a30, called as a unit is made (the
  city's 0x1e6570, 0xb02c60, 0xb67b30, 0xbd8be0, a hero 0x8ffac0) and the
  era's starting units (0x4580b0 through 0x4c1c10), raises it to
  0x56dc90(unit, 0) — the unit's strength as it stands, its formation's in
  it — where 0x4bffa0 passes the unit row: its domain (row +0x1c) not 1, no
  tag 0x36c125c9 (no install or DLL name hashes to it) and its row +0x24
  entry's flag +0x48 bit 4. An embarked unit stands at its embarked
  strength and raises nothing. Records: 1112 China's Mechanized Infantry
  made at sea at t213 (an upgrade, xp 0) left the centres at 80 until the
  corps upgraded on land at t216 read 95. The harness: a unit first seen
  embarked raises nothing (the ten duels' city.defense 0 worse; it also
  clears 1106 t243's Giant Death Robot, 80 checks, which was trained on land
  and raised nothing — 0x4bffa0's row test, unnamed, a LAB line).
- A drought's end turn (0x2922ff, beside "Pick Drought Start Plot"): the
  current turn plus 0x5254d0(the row's Duration) — the game speed's
  CostMultiplier / 100, truncated: online 2 (MAJOR) and 5 (EXTREME); the
  clear at 0x28789a when the turn reaches it. Records: 1109 plot 785's
  footprint −1 Food t110–111 (and t121, t133, t209), 1110 plot 887's
  EXTREME t64–68. `DROUGHT_TURNS` / the exported droughtDuration.
- The Trader's sea: the trade path's context (0x558ba0) sets +0x1a1 from
  0x553680, the player's CanEmbark (0x4ee3f0) of its Trader type (0x552dd0):
  a game flag, the player's embark list, or a researched technology with
  EmbarkAll (Technologies +0x70 bit 4: Shipbuilding) or an EmbarkUnitType
  naming the unit (Celestial Navigation's UNIT_TRADER); the node test
  0x558db0 closes water while it is clear. Record: 1112 China's Trader to
  Preslav at sea t68–72 with Shipbuilding and no Celestial Navigation, the
  route paying the water path's 11.4375 from t64. Unexplained: Guangzhou →
  Preslav t54–55 at 11.4375 with Sailing alone (AUDIT C-94 LAB).
- A harvest's or feature removal's lump: the harvest 0x95fbf0 calls
  0x5256d0 once per yield row (`Resource_Harvests.Amount`,
  `Feature_Removes.Yield`): A = base + (base·GAME_COST_ESCALATION(1000)/100
  − base)·P/100 in integers, P = max(tech %, civic %) (0x4c9cf0 /
  0x399810, the 77 / 61 of `gameProgressPct`); on a plot holding an
  improvement (+0x44) A·(100 − HARVEST_IMPROVED_DEGRADATION 50 − 30 more
  pillaged, +0x4d bit 0)/100; then the game speed (0x525400 in 1/256,
  truncated: half online); then the plot's city's harvest percent (+0x1e08,
  the Groundbreaker's 50). Records: runs/h1_duelw1112 Xi'an's Rainforest
  (Food 10 and Production 10, Features.xml) cleared t49 and t64, +11 and +14
  Food at P 15 and 20, its Marsh (Food 20) t74 +31 at P 24 — each landing
  in the box in the owner's actions, the city growing at once where it
  fills it (t49 6 → 7 with 9.55 left). `lumpValue` / `_lump_value`.
- The district discount (0x409870's under-average models): the type's count
  0x4bdd70 (placed districts included) against 0x4bca20's average, the
  completed specialty districts over the unlocked specialty types, both live.
  What the city's quoted price caches is unread: the records fit every
  type's price retaking the completed count at a technology or civic and a
  type's own again when a district of it completes (1112 Holy Site 119
  t208–209; the ten duels' buy.districtCost +161, 1110 −6 where the record
  caught China mid-turn) — `refreshDistrictDiscount`, a LAB line.

## C-74: the random-event step's order — READ

0x338710 (gated whole: turn ≥ [0x5b8] − 1 + the start turn, a game option
0x72ce2afb first): 0x288f40 — the droughts' tick 0x2876c0 (no draw), every
live storm's walk 0x28ecd0, then (a tail jump) every live one-off's turn
0x289430 — the volcano roll 0x335040, the weights 0x335260 (no draw),
0x33a280, "Random Event Roll" (0x287c00, over the vector at +0x128, never
empty: the empty slot rides it), the event 0x334d30, then the history's
update 0x2910d0 (no draw). Before the start turn nothing draws, the volcano
roll included. The engines (`disasterPhase` / `_disaster_phase`) run this
order: `stormsTurn`, `fireTurn`, `volcanoRoll`, `randomEvent`, each new
event's own draws inside it. 0x33a280's draws: unread (no labelled site in
it; the replay on 1115 / 1116 places every event without one).

## C-74: the fire — READ

The one-off birth (0x291a20's one-off arm): "Pick One Off Start Plot"
0x288020 (skipped when the plot is handed in and passes 0x28ec10, the
event's own start test), the naming 0x28c0d0 (no draw), the record
(+0x988, stride 0x40) and its index pushed on the live list (+0xa00) when
Duration > 1, then the strike 0x2867f0 at age 0. The strike, per plot of
the record (a fire is Hexes 1: its plot): unless the plot is water
(0x834d0) or impassable (byte +0x3a bit 3), each `RandomEvent_Yields` row
whose Turn (+0x30, gated by +0x2c) is the age draws ONE "Boosted Yield
Chance" rand(100) and lands at or under its Percentage (`jg`: roll ≤
Percentage; 100 always) — ReplaceFeature (+0x50 bit 0) paints the row's
feature, 0xa190d0 adds its Amount; then each `RandomEvent_Damages` row whose
MinTurn / MaxTurn (+0x48 / +0x40, gated by +0x44 / +0x3c) hold the age draws
ONE "Pillage Improvement Chance" rand(100) under its Percentage (the
CoastalLowlandPercentage +0x38 on a lowland plot) and lands through
0x336a50. A forest or jungle fire at age 0: the Turn 0 yield row and five
damage rows (the pillage pair, the citizen, the civilians, the land units —
each land unit its own roll in the applier), six draws: the five of five
fires the replay placed on runs/h1_duelw1116 with no unit on the plot. Age
1: five (no yield row, no citizen; SPREAD joins); age 2: the Turn 2 row and
the same five; ages 3-5 none; age 6 the Turn 6 row. The tick 0x289430 walks
a COPY of the live list each turn, so a fire started inside it waits for the
next turn; a record past start + Duration (9) leaves (0x291870).

SPREAD (0x336a50's last arm → 0x33b580): the plot's neighbours within 1
(0x6b1b0), each that passes 0x339960 — for a one-off, the event's own start
test 0x28ec10 (its RandomEvent_Features row: a Forest Fire Woods, a Jungle
Fire Rainforest) and the spacing 0x290030 — starts the SAME event there
(0x334d30), its own record and clock, its own birth strike straight away.
So one 50% roll a fire-turn lights every eligible neighbour at once: the
lab's "2 of 5 fires spread, each lighting every Woods neighbour at once, 1-2
turns after the origin" (runs/c74s3_fire*), and no Rainforest caught from a
Forest Fire. The engines' rule that a Jungle Fire spreads into Woods
(the Climate screen's text) dies with this reading: no recorded case has a
Jungle Fire beside Woods — a LAB line. The neighbour order 0x6b1b0 walks is
the ring walk 0x691f0 ("C-74: the fire's spread"): it orders the births and so
their later ticks and spreads.

## C-74: the one-off start — READ

"Pick One Off Start Plot" 0x288020 walks every plot in index order and keeps
those 0x28aa00 passes with the event's +0x30 (1 for the one-offs: the plot
alone) under the predicate 0x28ec10 (the functor 0xd267d0's call, 0x292e10):
with AvoidTerritory (+0xc8 bit 1) the plot unowned (its info +0x1c is 0xff);
with +0xc8 bit 4 a test 0x81120 on the plot's info (unread; no recorded case
needs it); the terrain in the event's RandomEvent_Terrains (0x28eab0), the
feature in its RandomEvent_Features (0x28e740: a fire's own feature; the
meteor lists none and any feature passes); not impassable. ONE uniform draw
over the count. Then the strike 0x2867f0 at age 0: a meteor's two damage
rows (IMPROVEMENT_PILLAGED, DISTRICT_PILLAGED at 101, no turns) draw once
each, no yield row. Replayed: both recorded meteors land their plot with the
pick over the record-before's unowned plots of the terrain list and two
draws after it (runs/h1_duelw1115 t135 of 159 plots, runs/h1_duelw1116 t243
of 109 — a Floodplains plot, which the engines' Meteor Site feature list
refused). The engines (`meteorCandidate` / `_meteor_cands`) follow; the
improvement, village, district and feature bars they kept die.

## C-74: the drought's strike — READ

0x286530 (from 0x291a20's drought arm): per plot of the stored footprint
(the land plots), each `RandomEvent_Damages` row with turns holding the age
draws ONE "Pillage Improvement Chance" rand(100) under its Percentage —
MAJOR's SPECIFIC_IMPROVEMENT_PILLAGED, EXTREME's SPECIFIC_IMPROVEMENT_DESTROYED
then SPECIFIC_IMPROVEMENT_PILLAGED: one draw a plot or two. Then, when the
climate's fertility-loss value (+0x750) is above 0, 0xa1c0c0: per yield
type, "Remove Fertility Chance" (0xa19bd0) — on a plot holding that yield's
event fertility c > 0, x = min(value, 100) × c, one rand(100) < x mod 100
removes x // 100 + 1, else x // 100. The value at +0x750 is the last
sea rise's FertilityRemovalChance ("C-74: the sea's rise halts and removes
fertility").

## C-74: the volcano roll's gate — READ

0x335040 reads the volcano component's counts (vtable 0xdb11b8): +0x68(b)
0xa1d2b0 counts the volcano entries (+0x1a0, stride 0xa0), with b true only
those whose name field (+8) is set; +0x50 0xa1d310 the active percent over
the volcanoes and the volcanic wonders (+0x218), 100 with none; +0x58
0xa1d130 the active volcanoes; +0x60 0xa1d450 the total. With N the game's
turns (0x339020): no draw when the named count N' is 0 or N is 0; D = N //
(2 × all volcanoes); below PercentVolcanoesActive, no draw unless N' −
active > 0, then D //= (target − pct) × N' // 100 when that is ≥ 200; at or
above it, no draw without an active volcano. "Choose Active Volcano Roll"
0xa20f20 draws rand(N' − active) and walks the entries skipping the active
and the unnamed. On runs/h1_duelw1116 t6 and t8 the replay needed no roll:
no volcano named yet. LAB: what sets the name — the engines read it as a
major's first sight of the plot (`volcanoNamed` / `_volcano_named`).

## C-16: the espionage roll's bands — READ

"Rolling Espionage Result" draws ONE weighted pick (0x287c00) over six
weights in index order. A mission (0x52b2a0, table 0x52b8f0) with the needed
roll T (0x529b60, the pursuing counterspy's term in it): a5 = clamp(T, 8,
18), a4 = clamp(T − 2, 7, 17), a3 = clamp(T − 3, 6, 16), a2 = clamp(T − 5, 5,
15), a1 = clamp(T − 7, 4, 14); the weights are the 3d6 counts (0xf02c70, of
216; summed by 0x52b5c0) over 3..a1−1 (killed), a1..a2−1 (captured),
a2..a3−1 (fail, must escape), a3..a4−1 (fail, undetected), a4..a5−1 (success,
must escape), a5..18 (success, undetected) — killed first in the draw. The
engines' threshold t is T − 2 (`missionWeights` / `_mission_weights`); the
lab's tables (base 13, k = 2: 66/61/32/54/29/11 of 256; base 16:
11/29/24/61/61/66) are these bands' floor(count × 256 / 216). An escape
(0x52aea0, table 0x52b090): killed 3..v−3, caught v−2..v−1, away v..18, the
other three weights 0. Before this reading the engines rolled three dice
(three draws); the clamps (no band certain or impossible) are new to them.
"Police Exit Covered" is one weighted pick over the offered routes (weights
as read in C-16); "Spy EscapeRoute" 0x81d360 is the AI's route choice, which
the driver makes.

## H-1: the start of a player's turn — the border pick (witnesses)

Between a player's PlayerTurnStarted and PlayerTurnStartComplete seeds the
game draws once per city whose next-plot tie list is not empty ("GetNextBuyablePlot
picker", 0x1ab1c0 from the border turn 0x1a9bc0; turn_order_civ6.md A8): on
runs/h1_duelw1116 player 0's starts take exactly its city count 248 of 249
turns, the three city-states theirs 222, 217 and 248 of 249 (the rest one
more: a quest's draw after it), the barbarians and the Free Cities none. The
tie list runs in the scorer's walk over the plots within 5 of the centre,
axial dq outer and dr inner (0x1aa7f0) — not tile-index order: replaying
each start's picks from the `pre` seed over the record's ties lands the
record's next plot on 449 of 452 multi-plot ties of runs/h1_duelw1116 in that
order, 207 in index order; with single ties, 1,315 of 1,335 picks (the rest
a plot bought after the start). The engines draw it as `randRange(ties)` /
`_rand_range` over that order (`borderBestPlots`, `drawBorderPlot`,
`_seat_border_draw`); the harness's `city.nextPlotDraw` replays it.

## H-1: a plot's resource for its owner (strategic access) — READ

Player_Resources 0x4aa8e0 (callers: the per-city accumulation 0x4aafd0,
the ownership pass 0x4ae4e0, Lua `IsResourceExtractableAt` 0x4ac120) takes
the plot's improvement (+0x44, read as none while pillaged, +0x4d bit 0)
and, when the plot's district (0x810d0, the district at the plot's id) is
complete (district +0xb08, Lua `District:IsComplete` 0x9c83d0) and not
pillaged (0x24c3a0, `IsPillaged`), that district's type; 0x4aaa70 then
answers the plot's resource (+0x40, count +0x42 > 0) when the plot's owner
is the player, the resource's condition holds (0x4ac140, the revealing
tech), and EITHER a district stands there — any type, the city centre
included — OR the improvement's valid-resource list holds it. 0x4aafd0
pays an accumulating resource `BaseExtractionRate` (+0x1c) plus
`ImprovedExtractionRate` (+0x24) when an unpillaged improvement stands,
else when a complete unpillaged district stands; a pillaged improvement
pays the base alone (0 for every GS row). A Great Wall (Improvements.xml:
no `Improvement_ValidResources` row) on Coal extracts nothing.
Record: runs/h1_duelw1116 China — Coal at plot 411 under a Campus placed
t120 before the Coal was revealed, plot 322 under a Great Wall, no mine
anywhere — powers Beijing's Coal Power Plant (Factory +3 regional, Xi'an's
Broadcast Center +4 Culture) from its completion t193 to the end, and bought
an Ironclad (1 Coal) at t176. Both 3-a-turn sources fit 1116 alike (the
ceiling binds); the DLL picks the district. 1116 city.yields 249 -> 112,
step.border 114 -> 69; no duel moves otherwise. `extractsResource` /
`_res_extracting` (the accrual, `civHasStrategic`, the most advanced
strategic, the unit-access and heal-starvation masks).

## H-1: the plot's Appeal — READ

Rules_Appeal 0x513d70 (Lua `Plot:GetAppeal` reads the cached value through
the plot's vtable +0x28) for a plot: the owning city's appeal term
(+0x1800, EFFECT_ADJUST_CITY_APPEAL: Aalto, Correa, the park rows) first;
a natural wonder (0x82e90) returns that + 5, a water terrain (0x834d0, the
terrain row's water bit) returns 0, a mountain (terrain 2/5/8/11/14) that +
4; else +1 for its own river (+0x37) or 0x82e80, -1 for its own complete
district while pillaged, -1 for its own pillaged improvement (+0x4d bit 0),
then the ring of radius 1 (0x6b1b0 -> 0x691f0, the centre not in it)
through 0x513780, and last +1 when the plot's owner holds the civic its
feature's row names (feature def +0xc8 -> `Features.AddCivic`: Woods with
Conservation; the owner's tree at player +0x1310, a minor's included).
0x513780 per neighbour n: with a city and a district at n, a wonder (n's
+0x1e) lends `Districts.Appeal` of its district once the city holds the
building, any other district its `Districts.Appeal` once complete (+0xb08)
and 1 less while pillaged — a district under construction lends nothing;
then `Features.Appeal` plus the city's feature modifier (0x1b55d0 on city
+0x1788: Amazon), `Terrains.Appeal`, -1 for a pillaged improvement,
`Improvements.Appeal`, and the city's governor's +0xc4 term (Forestry
Management) when n holds a feature and no improvement. Records (land plots,
game `GetAppeal` against the engine, per record): runs/h1_duelw1116 4,700
mismatching plot-turns -> 156, the rest one-turn readings and the cases
below; Woods +1 from China's (and Auckland's) Conservation t167; the
Torres del Paine plots of Beijing lending +1 each from Reyna's Forestry
Management (t77) to unowned plots beside them; a Holy Site, Theater, Dam,
Encampment or Aerodrome lending nothing while it builds. 1116 city.tourism
78 -> 13, seat.tourism 75 -> 10, city.housing 35 -> 0, plot.yields 66 -> 1.
Unexplained: a plot China acquired by purchase reads 0 for the rest of
the game (1110 plots 760/761, 1113 plot 57) — Plot appeal is a cached
value refreshed on events (the PLOT_APPEAL event instances), not modelled;
and a National Park's Tourism (1109 Handan t225-241) read the park's
appeal before the Conservation term until t242 — the same cache. LAB lines.
`tileAppeal` / `_tile_appeal`.

## H-1: the build queue's overflow, the yields' fixed point, the dispersal Gold, the pantheon's price — READ

- The queue's step (City_BuildQueue 0x177d10 → 0x16f050) reads the city's
  Production twice through 0x1c5350: A with the head's id (the Production
  toward the item), B with none (the city's plain Production). With an item
  at the head it adds A plus the stored overflow (`m_xProductionOverflow`,
  +0x1f4, 0x16f1db) and clears the overflow (0x16f31b); on a completion the
  overflow becomes min(A, B) − (cost − progress before the step) (0x16f3bf:
  B under the remainder → 0, else the smaller less the remainder), the
  carried overflow not counted, and waits for the next step. With nothing
  queued the step adds B to the overflow (0x16f62d → 0x0ac650). Records:
  1115 / 1116 Xi'an, queue empty at t3, a Builder at 0 at t4 and 10 at t5 on
  5 a turn; 1117 Xi'an's Scout done at 16 of 15, the Builder 0 at t7 and 6 at
  t8. Engines: `City.productionBank` / `city_prod_bank`. B, read with no
  item, holds none of the city-states' Production toward the head (the
  Industrial / Militaristic envoy rows are toward-item terms): 1117 Rome t15,
  a Warrior at 12 + 9 of 20 with one Militaristic envoy's +1 leaves 0, the
  next Warrior reading 9 on 8 + 1 (`CityStats.plainProduction`, the walk's
  `item_flat=False`).
- The research and civic overflows (`m_xResearchOverflow`, serializer
  0x4c6dc2; `m_xCulturalOverflow`, 0x38a93a): only the members are read; the
  records fit the production rule's shape — a completion's remainder is held
  apart and paid in with the next turn's yield (1116 China: Pottery done at 13
  of 12, Mining 0 at t7 and 4 at t8 on 3; Code of Laws done at 11.58 of 10,
  Craftsmanship 0 at t10, 3.18 at t11). Engines: `techOverflow` /
  `civicOverflow`, `civ_tech_ovf` / `civ_civic_ovf`.
- A citizen's yield share (0x1cbd10): population << 8 times
  SCIENCE / CULTURE_PERCENTAGE_YIELD_PER_POP << 8, then the fixed-point divide
  by 100 << 8 (0x16e940): floor(pop · pct · 256 / 100) / 256 — Culture 0.3 a
  citizen reads 76/256 at size 1, 153/256 at 2, 230/256 at 3, 307/256 at 4
  (1115 / 1116 Xi'an 1.296875, 1.59765625, 1.8984375, 4.19921875). A city
  yield's one modifier (0xaa740) truncates toward zero: 1108 Xi'an t95, 16
  Production at −10% reads 14.40234375 (floor would read 14.3984375).
  Engines: `citizenYield256`, `withPercent256` and their GPU spellings.
- A barbarian outpost's dispersal (0x52e970): the improvement's DispersalGold
  (row +0x38) plus the clearer's `m_axGoldDispersalChange` >> 8, through the
  game speed (0x5254d0, CostMultiplier / 100 truncated), to the unit's owner:
  25 online (1116 China t6 +25). Engines: `CAMP_DISPERSAL_GOLD`.
- The pantheon's price (0x340c90, at the game's setup): 0x5254d0 of
  RELIGION_PANTHEON_MIN_FAITH (gp +0x5cc), stored at +0x128: 12 online (1116
  China 15 → 3 at t15). Engines: `PANTHEON_FAITH_COST`.
- A unit's heal (0x538040, a vtable slot of the turn's unit manager): gated on
  the unit's `m_bEligibleToHeal` (+0x1590) and its plot's relation to the
  owner (0x530880: 1 own or allied, 2 unowned, 3 another's; the owner's
  no-neutral / no-foreign flags +0x2f0 / +0x290 of +0x12e8). The barbarians'
  gate is not found: that a barbarian never heals by resting is a record fit
  (5,099 unhealed still turns over the sixteen duels, its gains all pillage
  heals; AUDIT C-94 LAB).

## H-1: every draw of a player's start (witnesses, RandCalls.csv)

The game's own per-draw log (`Logs/RandCalls.csv`, kept as
`runs/h1_randcalls_duelw1117_1118.csv`: turn, range, value, the
state BEFORE the draw, label) holds runs/h1_duelw1117 (t1-250, 21,322 draws)
and runs/h1_duelw1118 (t1-278, 23,169) whole, chained, every value
((state' >> 16) · max16) >> 16 (46,082 of 46,082); each witness seed lands in
the chain, so every start's draws carry their labels. A start (pre -> post)
draws, in order:
- before the cities: a city-state whose research or civic completed picks
  the next ("BT Research Choice" 0x763020: the AI plan's tech, no draw, else
  ONE uniform draw over every researchable tech; "Random Civic Choice"
  0x626600 alike) — which way the plan went the records do not show; a great
  person's replacement when the player recruits in its start (C-93's pick);
  rarer: a civic's or a GP's boosts, "Choose random agenda", a quest.
- each city in the player's order (0x4e4560 -> city turn 0x1fa1d0:
  production, growth, the border turn 0x1a9bc0, loyalty): a WONDER its
  production completes annexes WONDER_FREE_TILES_UPON_COMPLETION (2) plots
  (0x17f870, building info +0x158 bit 0x40, -> 0x1a8a30), one picker draw
  each, before the wonder's own grants (China's Dynastic Cycle boost, Oxford's
  techs: runs/h1_duelw1117 t44, t226); the annex 0x1a8b70 clears the city's
  stored next plot (+0x1c = -1) and counts no culture claim (+0x10 is the
  border turn's alone); the border turn taking a plot draws afresh when the
  stored plot is -1 or owned (0x1a9e74), then every turn the closing pick; a
  Spy the city trains takes "Choosing a Citizen Name" and its level offer
  (below); a unit's goody hut.
- the picker 0x1ab1c0 draws only over a non-empty list (0x1aa7f0: unowned
  plots, byte +0x1c 0xff). Its three callers are the border turn's two and
  0x1a8a30 (the wonder, the founding 0x1a9f10, the minors' envoy annex
  0x1abf40, a unit signal 0x1abe90); no jump or pointer reaches any of them.
Replayed (`startDraws`, `resolveStart`, the harness's `start.draws`): of the
witnessed starts, the count lands exactly with no AI choice in it on
1115 81.1%, 1116 81.5%, 1117 80.4%, 1118 82.2% (of the starts that draw at
all: 73.4 / 74.0 / 72.4 / 74.0%), and with its city-states' and recruits'
choices resolved by the count on 99.6 / 99.7 / 99.4 / 99.4%.
On 1117 / 1118 the resolved choices are
the game's logged ones on 630 of 631 starts. Unexplained, 6-10 a duel: a
civic's antiquity eras and boosts, a Spy's name and shuffle, an agenda, a
quest, a start goody; and the player 1 starts that draw one or two picks
more with NO plot changing hands between China's cities — the city-states'
envoy annex ("H-1: the envoy annex").

## H-1: the random promotion offer (0x4f23a0) — READ

Called from a unit's XP gain 0x55d990 when it levels and its type's
`NumRandomChoices` (unit info +0x60: Apostle, Spy, Rock Band 3) is above 0
(and 0x4f2d50 refuses): every row of the player's promotion list (+0x940)
whose class is the unit's (0x524010) goes in a weight-1 vector; the vector
is drawn OUT ("Random Promotion", one draw over what is left, the drawn row
erased) — a full shuffle, as many draws as rows; the shuffled list is
stably sorted by the entries' second word (0x4e6d70, an insertion sort below
29: the Level), and the first NumRandomChoices make the offer. No held-row
filter. runs/h1_duelw1118 t218: a Spy's 17 draws 17..1 after its "Choosing a
Citizen Name"; t224: two Apostles' 9..1 twice; all 16 Rock Band offers of
the two logs draw 12, its class's rows. Each of the three classes'
rows share one Level in the engines' catalog, so the sort keeps the shuffle's
order. The engines follow (`drawPromoOffer` / `_promo_offer_draw`).

## H-1: the World Congress slate (0x598270) — READ

The session setup lists the resolutions in their era (EarliestEra / LatestEra
at row +0x68 / +0x98 against the game era) that the Lua `CanUseResolutions`
allows, split by InjectionOnly (row +0xb8, `dll_rowmap.py 0xa6a7b0`): of the
rest, min(3, n) "World Congress Resolutions" draws, each over what is left
and removing its pick (0x59a680); with three drawn, the first two the
previous session did not hold stand, else all drawn; then ONE draw over the
InjectionOnly rows (the Diplomatic Victory resolution, Modern on: a lone row,
a draw over 1). runs/h1_duelw1117 t61, t81, t101: 10, 9, 8; t121, t141: 12,
11, 10; t161 on: the 0/1 after them. A second 0/1 from t161 is 0x596b40's
(one draw over a list of rows not in play, called from 0x599275) — unread.
The "Random congress resolution target" draws after them (16 sites,
0x611140..) are the AI's targets. The engines (`congressSession` /
`_congress_draw_slate`) follow, over the resolutions they model.

## H-1: the random boost and free research pickers — READ

0x4ca470 (techs; civics 0x39c330), "Choosing random tech / civic boost to
grant based on era" — the goody hut's boosts: the earliest era holding a row
neither researched nor boosted that carries a `Boosts` row; that era's rows
(its own list, +0x168), weight 1 each; n draws, each erasing its pick.
runs/h1_duelw1117 t6: 8 Ancient techs (the eleven less Pottery, Animal
Husbandry, Mining, which carry no Boosts row), t30: 6 then 5 civics (Code of
Laws carries none); 1118 t10, t25, t29 alike. 0x4caa50 (civics 0x39c930), the
same over the eras lo..hi, era by era, labelled "..., Player: n": a Great
Person's range, the Dynastic Cycle (the wonder's era: 1117 t26 Stonehenge,
4), Vilnius. Every weight is 1. The engines follow (`BOOSTLESS`, `boostPool`,
`earliestBoostEra`, `drawBoosts` / `_boost_pool`, `_draw_boosts`). 0x4caeb0
(civics 0x39cd90), "Choosing random tech / civic to grant based on era"
(Oxford, the Bolshoi, a Great Person's free tech): ONE pool of the rows
researchable before the grants (0x4c8c40), each draw erasing its pick — a
row the first grant opens is not offered (1117 t226: two draws); the engines
follow (`grantFreeResearch` / `_grant_free_research`).

## H-1: a boost lands as progress — READ

The trigger 0x4cd900 (techs, "LOC_NOTIFICATION_TECH_BOOST_MESSAGE"; civics
0x3a3c00, "Cannot trigger a boost for a civic that is not in this game"),
past its "already held / already boosted" gates (0x39d190 / 0x39d1f0), marks
m_abBoostTriggered, finds the item's Boosts row (0x3990d0) and, in the 24.8
fixed point: B = 0x161d60 = floor(Boost x cost / 100) (the row's +0x18 times
the item's cost 0x29a010 / 0x353a70, sar 8); the share q = (B<<16) / (cost<<8)
(0x16e940, a truncating divide), times 100 (0x16e7d0); plus the player's
m_iModifiedBoost (+0xf8, `<< 8`: Dynastic Cycle's 10, a golden Free
Inquiry's / Pen, Brush and Voice's 10); the amount (cost<<8) x that / 25600,
its fraction dropped (`and 0xffffff00`); min(cost - progress, amount) is
added to THAT item's progress (0x393670 -> 0x3a1fb0), current or not. The
setter completes the item the moment its progress reaches the cost
(0x3a22c5 -> 0x3a1ac0). The cost is never cut. Check: `dll_boost.py`, the recorded
current-item boosts of the sixteen duels: 29 of 32 land exactly amount
+ the turn's yield
(Rome Astrology 25 -> 9 where floor(0.4 x 25) = 10; Writing 40 -> 15 where
16; China, ten points more, Writing 40 -> 19, Craftsmanship 20 -> 9); the
other three carry a second grant the same turn. The engines follow
(`boostAmount`, `markBoost`, `completeResearchNow` / `_boost_amount`,
`_land_boosts`, `_complete_research_now`); this REVERSES their earlier
cost cut (cost x (1 - 0.4 - points)), which no recorded case fits (Rome's
Astrology read 14 where the cut model shows 5, every duel's t9-t12).

## H-1: the upgrade's gold — READ

Unit_Upgrade_Manager's cost 0x5376d0 (via 0x590520; "Upgraded unit is
cheaper than current unit", "iNetProduction >= 0"), in 24.8: UPGRADE_BASE_COST
(GP +0x740, 10) at the game's speed (0x525400); net = (the new chassis'
production cost − the old one's, 0x4f2b20) x UPGRADE_NET_PRODUCTION_PERCENT_COST
(+0x74c, 100) / 100, never below 0; cost = base + net x
GOLD_EQUIVALENT_OTHER_YIELDS (+0x380, 2), less an argument the engines pass
as 0; a Corps x2, an Army x3; less the player's discount percent (+0x398,
Force Modernization); below UPGRADE_MINIMUM_COST (+0x744, 15, compared
unscaled) it is that at the speed (0x5254d0); a levied unit then less its
percent (+0x458) and the levy floor (+0x748); then down to a multiple of
PURCHASE_DIVISOR (+0x5b0). Check: runs/h1_duelw1117 China t25, Slinger
(17) to Archer (30): 5 + 2 x 13 = 31, the purse fell 30. The engines follow
(`upgradeGoldCost` / `_upgrade_gold_cost`); the production cost they read is
the chassis' catalog cost (a LAB line: whether 0x4f2b20 carries the player's
own unit-cost percents).

## H-1: the barbarians' turn (0x1514a0) — PARTLY READ

The barbarian manager's turn: 0x14f530, the camp step 0x14fcc0, each tribe's
turn 0x1488a0 ("[BarbarianTribe_Instance] Conversion Point Chance", "Tech
Steal Cooldown", "Barbarian Ranged unit roll" rand(100) per unit it raises),
then the clans' 0x8e1bf0. The camp step: a target of max camps (+0x110) ×
the land plots no major has seen over all land plots (0x50b2d0 on hash
0x253718b0), less the camps standing (+0x170); the first placement adds
BARBARIAN_CAMP_FIRST_TURN_PERCENT_OF_TARGET_TO_ADD (33) % of it, every later
turn one; each camp a weighted pick over the scored regions ("Barbarian camp
region placement", the "Barbarian Camp Evaluation" jobs at +0x620), a plot in
it ("Barbarian camp location"), a tribe ("Barb Tribe Roll" 0x152460).
runs/h1_duelw1117: camps on t1-4 and t8 only. The engines keep their own
camp and raid rolls (8%, 10%: `BARB_CAMP_SPAWN_PCT`, `BARB_RAID_PCT`) on
integer draws — a BUILD line.

## H-1: the draw log's labels (RandCalls.csv) — READ

The game's own draw log, every draw with its label, is the harness's to
read (`cpu/harness/randLog.ts`: a dump's own `<dump>.randcalls.csv`, or a
shared `h1_randcalls_duelw<a>_<b>.csv` beside it; the game whose chain holds
the witness seeds). The label map — every label the game draws at, the
engines' site for it, and who owns it — is `cpu/harness/drawSites.ts`
(`DRAW_SITES`, `ENGINE_ONLY_SITES`); the harness reads it for its per-turn
`turn.draws` check (`drawLedger.ts`). runs/h1_duelw1117 (21,322 draws) and
1118 (23,169), where in the turn each label falls (`start` a player's
start, `act` its actions, `barb` the barbarians' turn and the congress,
`step` the random-event step, `after step` the quests' and era's draws):

| label | 1117 / 1118 | where | owner |
|---|---|---|---|
| Random Direction | 12,754 / 10,982 | act, barb | AI |
| Pillage Improvement Chance | 2,313 / 4,896 | step | rule (event damage rows) |
| GetNextBuyablePlot picker | 2,187 / 2,766 | start, act (foundings, envoys) | rule |
| Boosted Yield Chance | 1,143 / 975 | step | rule (event yield rows) |
| Random Diplomatic Value | 896 / 896 | set-up | AI |
| Unit Combat Damage | 607 / 705 | act, barb | rule |
| Random Event Roll, Active Volcano Roll | 249 / 277, 243 / 277 | step | rule |
| Storm Direction (+ Preview, Start Plot) | 89 / 248 (21 / 57, 7 / 19) | step | rule |
| City Build District Choice | 105 / 171 | act | AI |
| Random Promotion | 60 / 194 | act, start | rule |
| BT Research Choice | 108 / 121 | barb (a city-state's research at the turn's end), start | AI |
| Unknown | 96 / 96 | set-up | set-up |
| Fertility Gain Chance | 90 / 84 | step | rule (eruption soil) |
| Barbarian Ranged unit roll | 40 / 48 | barb | rule, lacking |
| World Congress Resolutions / target | 39 / 43, 18 / 12 | barb | rule / AI |
| Generating a random new Great Person | 37 / 40 | act, start, set-up | rule |
| Random Event Unit Damage Roll | 28 / 28 | step | rule |
| Choosing a Citizen Name | 13 / 34 | step (a storm's name), act and start (a Spy's) | rule |
| NameManager::GetUnitNamePart | 10 / 24 | act, two a unit (118 then 155; 86 then 81) | rule, lacking |
| tech / civic boosts, free techs | 24 / 27 | act, start, after step | rule |
| Selecting a random new quest (+ its type pickers) | 12 / 11 (11 / 8) | after step (every 30 turns), act | rule, lacking |
| Choosing a City Name | 11 / 10 | act (a major's founding past its capital) | rule |
| Goody Hut Type / Sub Type | 9 / 11 each | act, start | rule |
| region names (River, Sea, Desert, Volcano, Mountain Range, Ocean, Lake Range) | 20 / 19 | act, set-up | rule, lacking |
| Barbarian camp region / location / Barb Tribe Roll | 5 / 6 each | barb | rule, lacking |
| tech and civic tree set-up | 44 / 41 | set-up | set-up |
| Random Era for Antiquity Site, Choosing Artifact | 3 / 0, 0 / 3 | start, act | rule, lacking |
| Choose random agenda, Random Civic Choice | 3 / 3, 1 / 0 | set-up, start | AI |

The engines' sites the game has no label for (`ENGINE_ONLY_SITES`): the
city-states' and Free Cities' walk (`walkUnit`), their builds and buys
(`minorPlan`, `minorPurchases`, ...) and the pantheon pick — the AI's, the
driver's stand-ins. The labels the engines never draw: the barbarians'
camp step and ranged roll (as the DLL runs them), the unit and region
names, the quests, the antiquity sites' eras and the artifacts — AUDIT C-74
BUILD. Every value is ((state' >> 16) · range16) >> 16 (46,082 of 46,082).

What the log settled:
- The random-event step is the run of step draws holding the gap's last
  "Random Event Roll" (`loggedStep`): the quests' refresh ("Selecting a
  random new quest", every 30 turns: t31, t61 ...) and an era's boosts may
  follow it before the first player's start, so the step is no tail of
  the gap. On the turn the sea rises the roll is a draw over 1 (1117 t224,
  t244; 1118 t239, t270): the rise is the turn's event by force.
- A unit that walked onto a struck plot and died in the event is in no
  record: the log's "Random Event Unit Damage Roll"s place it (1117 t223,
  a Warrior on 805 when the fire there was born).
- The harness replays every start draw for draw where the records tell
  what the start did: the city-states' research and civics, the recruits'
  replacements, an agenda (the AI's own labels), a Spy's name and level
  offer, a wonder's annex and grants (the Dynastic Cycle's boosts, Oxford's
  techs), the envoy annex, the closing picks (`logStart`). 1117: 1,740 of
  1,743 witnessed starts, 1118: 1,731 of 1,736.

## C-74: the fire's spread — READ (the order)

The spread's neighbour walk 0x6b1b0 -> 0x691f0 is the ring walk: from the
plot's cube coordinates, the six steps of the table at 0xf0bf40 — (0, 1),
(-1, 0), (1, -1), (0, -1), (1, 0), (-1, 1) in (x - y // 2, y) — this grid's
SOUTHEAST, WEST, NORTHEAST, NORTHWEST, EAST, SOUTHWEST (`RING_DIRS`). Each
neighbour passing 0x339960 (the start test 0x28ec10 and 0x290030 with the
row's Hexes) is born at once with its age-0 strike, in that order, and the
births tick in it: runs/h1_duelw1118 t22, Rainforest 665's spread lit 664
(its WEST) before 621 (its NORTHWEST), and at t23 664's tick came first —
its spread lit 620 alone (621's neighbour 576 is no neighbour of 664). The
engines walked DirectionTypes; they walk the ring (`fireStrike` /
`_fire_strike`). The spread's births are no event rows in the records:
the harness lights them from the step's own spread rolls on the record's
features (`replayEvents`; 1117 t222-229, 1118 t20-29 replayed draw for
draw). Units and cities 0x33b580 skips: a city whose established
governor's +0xc8 holds (unread which) keeps the fire off its plots.

## C-74: the drought's start pick — READ (REVERSED)

0x287e80 builds the list of every plot whose score 0x28ff20 is above 0
(the area test 0x28aa00 with the row's predicate, times Spacing + 1, less
Spacing − d where the nearest live drought's last plot is d < Spacing away)
and draws over the list's COUNT, `rand(n)` through the thunk 0x152eb0,
indexing the list: the scores are stored and never read. **This reverses
the weighted pick** shipped before (1 + min(d, 15)): runs/h1_duelw1118 t92
and t102 draw over 1, t138 and t151 over 3, where the weights summed 16,
16, 48, 48 (equal weights gave the same plot; a live drought's neighbours
would not). The engines draw uniformly (`droughtStart` / `_drought_start`);
`DROUGHT_SPACING` and `droughtEnds` are gone.

## H-1: a city-state sees its suzerain's resources — READ

0x4ac140 (a player's resource condition, 0x4ab4b0's): the player's own
reveal bit (+0xf0), then — where its influence component's suzerain
(+0x1368 -> 0x44c850) is a player — the SUZERAIN's resource condition,
recursively; then the reveal modifiers, then the tech (+0xc8) and civic
(+0xc0). So a city-state sees every resource its suzerain sees.
runs/h1_duelw1117 Antananarivo t85-90 and runs/h1_duelw1118 Armagh t83-95:
the next-plot scorer's -1 for the Niter beside 339/340 and 872 counts
from the turn China (their suzerain) holds Military Engineering, before
the city-state does (logged ties 4 and 1 against the engines' 2 and 5).
The engines follow (`hiddenResourcesFor` / `_res_hidden`).

## H-1: the envoy annex — READ (settles the extra border picks)

0x1abf40, a city-state's culture reacting to influence received: where its
civilization level CanAnnexTilesWithReceivedInfluence (+0x28 bit 4), with
E the envoys it holds (0x44c4b0, every giver) and A its annexed count past
its starting tiles (+0xc less 0x1ab460, StartingTilesForCity's), E > A
annexes E − A plots (AnnexPlots 0x1a8a30, one "GetNextBuyablePlot picker"
draw each). The AI sends its envoys in its start, before its cities: the
"one or two border picks more with no plot changing hands" of the major's
start (LAB) are the city-state's annex — runs/h1_duelw1117 t28 (Caguana's
two for China's two envoys), t44 (Antananarivo's and Caguana's);
runs/h1_duelw1118 t33 (Armagh's two), t66, t113, t148 (Kumasi's two before
China's seven cities). The harness replays them (`startDraws`, an envoy
sent in the start or in the actions: the log places it).

## H-1: a city's name, a citizen's name — READ

- "Choosing a City Name" (0x327c30 -> 0x327a70 -> 0x328de0): a city whose
  founder holds a CapitalName for it (its first) takes it with no draw;
  else the civilization's CityNames rows less the names used, the first
  max (10, unless the row 0x28a940 returns sets +0x1c) kept, weighted
  n, n − 1, ... 1: ONE draw over n(n + 1) / 2. runs/h1_duelw1117 and 1118:
  21 of 21 foundings past a capital draw over 55, each followed by one
  picker draw (unread). The engines draw at a major's founding past its
  capital (`foundCityAt` / `_found_city_at`, `CITY_NAME_DRAW`) and keep
  their own name list.
- "Choosing a Citizen Name" (0x486c20): one draw over the civilization's
  CivilizationCitizenNames rows not yet given, the name given. A Spy takes
  one at its birth (1117 t102, t118, t199 in China's start; 1118 t218
  before its level offer); a storm takes one for its naming player
  (Game_Climate 0x28d4f0): the major owning its plot (0x469db0), else the
  major whose city stands nearest it (0x36f6c0 per player, the first at
  the least distance); none, no draw. China's pool falls 40, 39, 38 ... as
  storms and Spies take names. Which units: the unit's creation 0x4eeb70
  calls 0x486bf0 → 0x486c20 where the unit info's Spy (+0x1ba bit 2) or
  ExtractsArtifacts (+0x1b9 bit 1, `dll_rowmap.py 0xa6f2b0`) is set and the
  player's +0x1458 is clear — the Spy and the ARCHAEOLOGIST (runs/h1_duelw1118
  t231 and 1122 t202: an Archaeologist trained in China's start, one name
  drawn; 1122 t129 and 1124 t248 a Spy, trained and granted by the
  Intelligence Agency, a name and no level offer). The engines follow
  (`drawCitizenName`, `CITIZEN_NAMED_UNITS` / `_type_named`, `stormNamer` /
  `_draw_citizen_name`, `_storm_namer`; `Seat.citizenNames` /
  `civ_citizen_names`).
- "NameManager::GetUnitNamePart": two draws a unit (118 then 155, or 86
  then 81) in the majors' actions from t192 — unread which units are named.
- "Random Era for Antiquity Site" (0x280140, from 0x2805f0): with n the era
  row's +0x1c, era i < n weighs n − i + 1, one draw over n(n + 3) / 2:
  runs/h1_duelw1117 t217's three draws over 35, 44 and 9 are n = 7, 8 and
  3. The caller: Game_Archaeology 0x27f640 lays a kind's dig sites once a
  game (RESOURCE_ANTIQUITY_SITE / RESOURCE_SHIPWRECK, a done flag each at
  +0x180 / +0x1e0), when a player first completes its revealing civic
  (Natural History, Cultural Heritage — every logged case is China's
  Cultural Heritage in its start: 1117 t217, 1119 t215, 1120 t206, 1123
  t207): candidate plots from the game's history of events (100 each, their
  neighbours 50), filled out by random plots with no history (index −1);
  0x2805f0 takes a site's era from its history event, and draws one only
  for a site with none (the js at 0x280664 → 0x280752; n from the era of a
  player 0x27fe90 names). 1117 t217: four Shipwrecks laid, three draws. The
  history is in no record: the harness counts the record's new sites and
  takes each draw as a choice.
- An Apostle or a Rock Band (Units.InitialLevel 2, NumRandomChoices 3)
  draws its level offer at its birth however it comes: runs/h1_duelw1118
  t224, Mahabodhi's two granted Apostles, 9..1 twice after the annex
  (1123 t127 alike). The engines follow for a granted Apostle (the grant
  loop, Stonehenge's fallback: `offerApostlePromotions` /
  `_offer_apostle_promos`).

## H-1: a start's own event rows, the wonder's annex, the village a claim takes

The record's event log (`actions`) holds every row a player's start fired,
in order, before its PlayerTurnActivated (`startRows`): the cities' turns in
the player's city order, then what the AI does before the activation. Read
with the game's draw log:
- A wonder's annex (0x17f870 → AnnexPlots 0x1a8a30) fires its
  CityTileOwnershipChanged rows BEFORE the WonderCompleted row (a
  BuildingChanged of the city, a unit pushed off, an improvement's owner, a
  camp cleared between): each plot one picker draw; the list emptied, no
  draw (runs/h1_duelw1117 t217: Meenakshi at Xi'an with nothing in reach,
  none; t224 Machu Picchu at Longxi, none; 1123 t112 two; 1118 t227
  Kotoku-in two, a Roman unit teleported between). The grants follow the
  annex (1123 t112: annex 2, annex 1, the Dynastic Cycle's civic boost, then
  the closing pick over 4), the city's closing pick after them; a camp the
  annex clears draws a "Barb Tribe Roll" (1121 t190, the Colossus at Longxi
  over 12,14). Which wonder completes in the start: its WonderCompleted row
  in the window — the banked-production test missed 1123 t112 (325 + 28 of
  355).
- A culture claim the window shows took the stored plot, or another after a
  fresh pick (1123 t202: Shanghai's 914 taken, lost to a founding in the
  actions); an envoy annex lands among the closing picks or after them
  (1118 t66: Caguana's after China's four; t144 Armagh's after, its 916
  Handan's stored plot, whose reader then answers 919 — the scorer's best
  plot, no draw).
- A Tribal Village a claim takes (GoodyHutReward with no unit, the claim's
  row after it): "Choosing a Goody Hut Type", "Choosing a Sub Type", then the
  reward's own draws (1118 t189 Military / Resources; 1119 t84 Science / One
  Tech Boost and its boost; 1123 t104 Faith / Large Faith).
- A city-state met in the start picks it a quest ("Selecting a random new
  quest", DiplomacyMeet: 1117 t249, 1122 t226).
- A city founded after its owner's start holds no next plot (every founding
  of 1117: -1 until its own start); the camps a player clears after its
  start stood at its picks (1123 t124: Beijing's pick over 616, 440's camp
  cleared in China's actions); a fire's woods burnt or grown back by the
  turn's step stood as the record before left them (1117 t187: Antananarivo
  over 340, 341 still Burnt Woods).

## H-1: the goody hut's kind — READ

0x42bdd0 (Player_Goody_Hut.cpp): over the GoodyHuts rows whose
ImprovementType is the popped one (row +0x38 → +0x14), each kind weighs its
Weight (+0x1c) × the count of ALL GoodyHuts rows (8 with GOODYHUT_DIPLOMACY
and METEOR_GOODIES: 800) in 24.8, halved once per time the player has had
that kind (+0x100[kind], the counter bumped after the pick, 0x42c875),
floored at 1.0 below 2.0, rounded half up; a kind counts only with an
eligible subtype (0x42c980: MinOneCity, Turn, RequiresUnit, CityState,
StrategicResources...). ONE "Choosing a Goody Hut Type" draw over the sum,
then "Choosing a Sub Type" over the kind's eligible subtypes' weights.
runs/h1_duelw1117: t5 4,000 (five kinds, the first village), t7 3,600,
t13 4,400, t16 / t27 4,800; sub types 70 (Culture: the relic 15, a boost
55), 75 (Survivors: 40 + 35), 100. A village a culture claim takes has no
unit: Military's subtypes needing one drop out (1118 t189: Resources alone,
over 20). A subtype's Turn is read at the game's speed (0x42c980 through
0x5254d0: online, Turn 20 is turn 10 — 1117 t13's Gold over 85 holds Medium
Gold, t16's seven kinds hold Faith). The engines follow (`goodyKindWeight`,
`drawGoodyReward` / `_goody_kind_weight`, `_draw_goody_reward`;
`Seat.goodyKinds` / `civ_goody_kinds`; `goodyEligible`'s Turn through
`scaleByGameSpeed`); the other gates of 0x42c980 ("H-1: the goody hut's
other gates and the Relic").

## H-1: a natural wonder's eruption — READ (the order; REVERSES the ring walk)

0xa22150 (a natural wonder) runs 0xa1c760 then 0xa21680, where a volcano's
0xa22000 runs 0xa1c1a0 then 0xa219e0 ("Fertility Gain Chance"): for each of
the wonder's plots in turn, for each damage row, the plot itself (r12 = −1,
impassable: no draw) and its six (the table at 0xeff670 / 0xeff688) — and the
soil likewise, plot by plot, its draws labelled "Pillage Improvement Chance".
**This reverses the engines' walk** of every row over the joined ring of all
the wonder's plots (one plot's eruption reads the same either way):
runs/h1_duelw1119 t120, Eyjafjallajokull's two plots: the three
"Random Event Unit Damage Roll"s fall after the 31st draw (the first plot's
UNIT_DAMAGE_LAND row) and the second plot's 32nd and 34th, and the soil laid
(11) is the record's only so; the joined walk puts the unit row 60–69 and
lays other soil. 1119 t17 – t223 (eight eruptions) and 1121's Kilimanjaro
(t19, t38, t108, t140, t146, t226: one plot, the soil's label alone) land
draw for draw. The engines follow (`eruptionRings`, `erupt` / `_eruption_ring`,
`_erupt`).

## H-1: the forced sea rise, the dig sites, the droughts the game leaves out

- The sea's rise (RANDOM_EVENT_SEA_LEVEL_RISE1–7, EffectOperatorType
  SEA_LEVEL) is the turn's event by force, its "Random Event Roll" over 1
  (1117 t224, t244, 1118 t239, t270; 1122 t240, t249; 1124 t214, t223,
  t232): the climate step crossing a phase leaves the sea for the next
  event step. The engines follow (`seaRiseFrom` / `sea_rise_from`,
  `seaRise` / `_sea_rise`; a world with no random events rises at once).
- 1124 t162, t194, t234: the drought's start leaves out 277, 278 and 319,
  a storm's walk's plots and their neighbours ("C-74: the drought's storm
  bar").

## H-1: draws with no game site

The engines' pantheon pick (`_seat_pantheon_race`) and the Free Cities' grant
("Free Cities Unit Choice", 0x274010, one weighted pick: the engines'
`freeCityGrantType` / `_free_grant_type` take it as the picker does)
— the pantheon has no labelled site: Civ 6's AI picks its belief without a
draw of the game's, so the engines' integer draw there is the driver's stand-in
(AUDIT BUILD).

## H-1: a wonder's and an improvement's tourism — PARTLY READ

- A wonder (0x18e160, and the city walk 0x18ffe0 over the city's wonders):
  TOURISM_BASE_FROM_WONDER (2, GP +0x6c4); when TOURISM_ADVANCED_ERA_WONDER
  (GP +0x6c0) is set, plus the owner's era index (0x467eb0) less the
  wonder's — its PrereqTech's era (+0x210 → +0xc0), else its PrereqCivic's
  (+0x220 → +0xc8), else 1 — where the owner's is later; then times the
  city's tourism percent (0x1abe50 on +0x1ac8) over 100 when not 100
  (`wonderTourism`, `WONDER_TOURISM_BASE`).
- An improvement (the lens 0x399e10 at 0x39a73c, the city 0x1aba40): its
  Improvement_Tourism row pays only with its PrereqTech (+0x60, the
  player's techs 0x39d1f0) and its second link (+0x68, the civics 0x4cb2f0)
  held; source 6 (Appeal) reads the plot's appeal (vcall +0x28); any other
  source the plot's yield of that type from 0x82280 (→ 0x538a60) with its
  last flag false less the same with it true, times ScalingFactor / 100
  when not 100, then the city's percent (+0x1b20) when positive. The flag
  is 0x538a60's fifth argument, unread: which yields it leaves out is the
  open question behind 1117 t222 (docs/AUDIT.md C-94).

## C-94: Sovereignty's route yield — READ

- EFFECT_ADJUST_PLAYER_TRADE_ROUTE_BY_CITY_STATE_BONUS_TYPE_MODIFIER (the
  factory 0xc27d10, the effect's vtable 0xdecb08: apply 0xb468d0 / remove
  0xb47620) adds its Amount (WC_RES_MODIFY_CITY_STATE_TRADE_YIELD 100) into
  Player::Congress's int vector +0x4b8 indexed by MinorCivBonusType.
- Trade_Manager 0x54c6c0, per yield of a route: X = the DESTINATION city's
  route-to-others row of that yield (city +0x1ee0, its vector +0x28 read
  by 0x1f9650 — MODIFIER_PLAYER_CITIES_ADJUST_TRADE_ROUTE_YIELD_TO_OTHERS
  writes it). A major's city adds X as it stands. A minor's city with a
  bonus type (0x469de0, 0x467f50) adds X x (100 + a) / 100 where a is the
  ORIGIN player's Congress entry for that type (0x37b7a0 -> 0x552d40,
  shifted to 24.8), and nothing when a <= 0 or X <= 0: a minor's row is paid
  only under Sovereignty A naming its type, and then doubled. Every minor
  trait carries one such row on its type's yield (Leaders.xml
  MINOR_CIV_<TYPE>_SEND_TRADE_ROUTE_BONUS: 1, Trade's Gold 2); the
  district rows are untouched (`sovereigntyRouteYields` /
  `_cs_route_sov6`, `CITY_STATE_ROUTE_TO_OTHERS`).
- Recorded cases: 1117 Xi'an -> Caguana (Harbor, Theater) Culture 1 -> 3
  under Cultural t62-81 and t102-121, Gold 7 throughout where the
  doubled rows paid 13; Xi'an -> Antananarivo (centre only) Culture 0 -> 2;
  1122 Xi'an -> Babylon Science 1 -> 3 t64-81, Gold 5.18 where the doubled
  rows paid 10.36; 1114 Xi'an -> Vilnius Culture 8 -> 10 t102-104.
- A route to a minor is international to Reform the Coinage's Golden face
  (MODIFIER_PLAYER_ADJUST_TRADE_ROUTE_YIELD_PER_SPECIALTY_DISTRICT_FOR_INTERNATIONAL):
  1117 Xi'an -> Caguana +6 Gold t108-120 under COMMEMORATION_ECONOMIC.

## H-1: a city centre's floors — READ

- The plot yield 0x538a60 sums the plot's own rows, then, on a plot holding
  a city (0x81120), raises Food to YIELD_FOOD_CITY_TERRAIN_REPLACE 2 and
  Production to YIELD_PRODUCTION_CITY_TERRAIN_REPLACE 1 (GlobalParameters
  +0x7d4 / +0x7dc, the cmovl at 0x53916e), and only then adds the game
  effects' rows (0xc7e9b0) and the neighbours' (the walk over the plot's x,
  y from 0x5391c0) — Feature_AdjacentYields among them.
- Recorded: 1121 Chengdu on Plains beside Yosemite (Food 1 adjacent) reads
  Food 3 t221-250, the engines' floor-after 2. `tileYieldsForCenter` takes
  its floors on the plot less `wonderAdjacentYields`; the GPU walk on its
  planes less the exported `nwa` plane (`tile_nw_adj`).

## H-1: the luxury allocation's rebuilds — PARTLY READ

- Player DoTurn 0x4e4560 runs its cities (Player_Cities +0x12f0, 0x36f420 at
  0x4e4665) before its resources (+0x1320, 0x4a8ed0 at 0x4e46c0: the
  holdings recomputed by 0x4ab6e0, then 0x4a6110 rebuilds the allocation).
  So a city's growth and border read the allocation the previous rebuild
  left. Recorded: 1122 t200, Reyna established in Changsha (Civil Prestige's
  amenity) leaves the ranking standing to t201.
- ChangeResourceAmount 0x4a7560 (resource, ownership, amount) rebuilds the
  allocation at once (0x4a77d4, unless the game's flag +0x45e) for any
  ownership-0 change and any non-accumulated import / export. Its callers:
  a production completion's strategic costs (0x18433d building, 0x184d95
  project, 0x1856b3 / 0x185a2a unit), a plot's extracted resource changing
  (0x4ab4d0 from the city, district and plot handlers 0x4ac2e0..0x4ad0d0;
  an accumulated resource skips it), the copies 0x44eff0 hands a resource's
  recipients, the power ledger 0x4a7cc0.
- Unread: what rebuilds it at a policy change (the records: 9 of 9 policy
  changes at the processing's start re-rank the cities' luxuries before
  their growth), and which change re-runs it after a founding in the
  action phase (AUDIT C-94 LAB).

## H-1: the best melee from the log — READ (as above)

- 0x4c1a30 raises the base as a unit is made, an upgrade included; a unit
  made and removed before the record still raised it (1121 t43: Xi'an's
  Heavy Chariot, 28, holds every centre at 18 until t77), and an upgrade
  made embarked raises nothing (1122 t131's Line Infantry). The importer
  reads CityProductionCompleted (order 0), CityMadePurchase of a unit and
  UnitUpgraded off the action log (`advanceHistory`).

## C-74: the drought's storm bar — READ

0x28de40, the drought predicate's "under an event" (0x28eb60's last
clause), walks EVERY record of m_aStorms (+0x8b0..+0x8b8, stride 0x68) and
its struck list (+0x38..+0x40). A storm's end (0x28ecd0 → 0x291940) clears
the record's live flag (+0x58) and drops its handle from the live list
(+0x8d0) — the record and its struck list stay (0x28e240 rebuilds the live
list from +0x58 on a load). So a plot any storm's walk ever struck bars a
drought start, and its six neighbours with it, for the rest of the game;
a newborn storm's first strike marks a copy (0x291a20), so its birth plots
are not on the list. Droughts (m_aDroughts +0x948) are read only by the
spacing score 0x28ff20 → 0x28ce90 (every record, the last footprint plot),
which never drops a candidate. Cases: runs/h1_duelw1124 — no drought start
at t112 and t115 (the records' predicate passes 277 and 278), and t162
(over 1: 578), t194 (over 3) and t234 (over 3) leave out 277, 278 and 319
while 535, 578 and 579 (a drought's own plots) stay: the t49 blizzard's
walk struck their neighbours; a drought's plots drawn again (1118's 780,
1123's 388, 1124's 579) are no storm's. 1124 t194 reads the ground as the
step found it — the record after (624's Rainforest cut on the turn
before). The engines keep the bar on the plot (`Tile.stormStruck` /
`storm_scar`, set by a walk's strikes; `droughtCandidate` / `_drought_cands`).

## C-74: the sea's rise halts and removes fertility — READ

A RANDOM_EVENT_SEA_LEVEL_RISE row firing (0x291a20's rise arm) writes the
climate's tracked values: the row's +0xc8 bit 2 to the bool at +0x588
(HaltsFloodFertility), bit 3 to +0x5e8 (HaltsStormFertility), +0x2c to the
int at +0x648 (FertilityRemovalChance) — RISE4 on halts both, RISE5 / 6 / 7
remove 15 / 30 / 45 (Expansion2_RandomEvents.xml). From the step after the
rise:
- a flood (0xa2f200) skips its yield pass 0xa2ed80 — no "Boosted Yield
  Chance" draw at all (runs/h1_duelw1124 t243, t245; 1123 t245, t248; 1122
  t242);
- a storm's strike (0x286f80), per plot off water and impassable, draws no
  yield row; where the removal is above 0 it runs 0xa1c0c0 instead and
  takes the removed count off the event's FertilityAdded (1123 t243: the
  hurricane's walk after t242's RISE4, damage rows alone; 1122 t247–249);
- a drought's strike (0x286530) runs 0xa1c0c0 on each plot after its rows
  whenever the removal is above 0.
0xa1c0c0 → 0xa19bd0 "Remove Fertility Chance": per yield type, where the
plot's event fertility c (the random-events map +0x110) is above 0, x =
min(chance, 100) · c, ONE rand(100) under x mod 100 removes x // 100 + 1,
else x // 100. A fire's Turn 2 (burnt, Food 1) and Turn 6 (regrown,
Production 1) rows add to c (1122 t248: the t245 fire at 158, burnt at
t247, takes the second removal draw). Eruptions and fires draw their yield
rows whatever the sea (0x2867f0 and 0xa219e0 read no flag; 1123 t244's
eruption adds 3). **This reverses the engines' climate gate** (fertility
off from the climate's Phase IV crossing, a draw-free strip of one Food
and one Production from Phase V): the flags follow the rise's event
(`floodFertilityHalted`, `stormFertilityHalted`, `fertilityRemoval`,
`removeFertility` / `_flood_halted`, `_storm_halted`, `_fertility_removal`,
`_remove_fertility`; the phase table's columns now the RISE rows').

## H-1: the Floodplains list — READ (REVISES the river walk)

0xa2aca0 (GenerateFloodplains' per-river pass): the river's plot list as
its edges were laid, read from the mouth (the reverse flag), each plot
asked 0xa2c060 (the Floodplains feature it takes, -1 none): a plot that
takes one joins the run, the run full at the maximum (10) ends it; a plot
that takes none ends a run of the minimum (4) or more, else clears it.
The list itself: from the source, each edge adds its own plot (the IsNE /
NW / WOfRiver plot) then the plot across, each plot once — so read from the
mouth a plot stands where the river reached it LAST. **This revises the
earlier walk** (each later edge adding only the plot the next edge up does
not border, a plot kept at its first place from the mouth): runs/h1_duelw1123
river 181 at 480 (t78, t128): the old walk stopped at 7 plots (480 … 391,
then 347), the game's draws strike 10 (… 391, 392, 393, 349) — 347 and
348 stand where the source edges laid them. Every other recorded flood of
1113–1124 walks the same list either way (the harness's `floodplainList`).
The engines' own rivers keep no flow (`floodRanks`), so this is the
harness's reading of the record.

## H-1: the goody hut's other gates and the Relic — READ

0x42c980 per subtype row (+0x50 flags): bit 3 RequiresUnit — no unit (a
culture claim), not eligible; bit 1 MinOneCity (0x4bd370 ≥ 1); bit 2 Relic
— 0x497030 finds a slot for a GREATWORKOBJECT_RELIC in the claimer's
cities; +0x1c the Turn at the speed; then the XP2 row (+0x18): +0x28 bit 0
CityState — a city-state in the minor list the player has met (0x3daaf0);
bit 1 StrategicResources — a RESOURCECLASS_STRATEGIC resource whose
condition the player meets (0x4ac140) with its stockpile (0x4aa790) below
the cap (0x4aabe0). The engines take CityState, StrategicResources and
Relic (`goodyEligible` / `_goody_eligible`). A Relic, however it comes —
a martyred Apostle, a village, Jeanne d'Arc — is created by Game_Culture
0x296c00: ONE "Choosing a Relic" draw over the 24 GREATWORK_RELIC rows not
yet created, none left no Relic (runs/h1_duelw1119 t13 over 24 after the
village's Culture / One Relic; 1120 t83 over 24, t92 over 23; 1123 t168
over 24). The engines draw it (`createRelic` / `_create_relic`,
`GameState.relicsMade` / `relics_made`).

## H-1: draws the AI takes, draws the engines lack

- "NameManager::GetUnitNamePart" (0x328760) is called only through
  0x327d50 / 0x327de0 from the behaviour tree — "HL: Rock Band Move"
  (0x710f40) and the CITY_ASSAULT operation (0x722690), each building a
  unit's name for its log (the band template over 118 and 155): the AI's.
- A plot first revealed to a player (0x534950, from the sight update
  0x58aa90) names its river (0xa29730 → 0xa292a0, "Random River") and its
  territory (0xa36ff0: "Random Desert", "Sea", "Ocean", "Mountain Range",
  "Volcano"; 0xa36400 "Random Lake Range") — one draw over the names left.
  The engines name no region (AUDIT C-74 BUILD).
- Game_Quests 0x939980 (on a game era's or a player era's change, and
  0x93ae70) draws "Selecting a random new quest" over the quest types valid
  for the pair, then the type's picker (0x84d870, a tech boost's). The
  engines' quest issuer draws nothing (AUDIT C-74 BUILD).
- A record read before its player's start of the turn (its event log holds
  rows of the turn but no PlayerTurnActivated of the recorder's player:
  1117 t168, 1118 t101, 1119 t4 and t112, 1120 t95, 1121 t134, 1122 t108,
  1123 t101, 1124 t196) shows the city's culture and next plot as the turn
  before left them; the next start's stored plot is the one that start drew
  (runs/h1_duelw1120 t96: Rome claims 1051, the t95 pick).
- A plot a city gains in its owner's actions, after its start (a unit's
  move: runs/h1_duelw1120 t161, Xi'an's stored 275), is no culture claim:
  the city holds no next plot after it.

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
