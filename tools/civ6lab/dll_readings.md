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
  The importer's lifetime fold takes a pair's gain as the progress move of the
  civic both records research (a city founded after record 1 lands its
  Culture by record 2: runs/h1_duelw1130 Rome 3.296875 at a recorded 0), the
  record before's yield otherwise (`foldCultureTourism`). Open: 1129 Rome
  t146-239 reads no dominance at the fold's 108.9 lifetime culture (AUDIT C-94
  ASK).
- CITIZEN_IDENTITY_PRESSURE_MOD_CULTURAL_DOMINANCE (gp +0xec, 25): 0x1a1640
  is a city's citizen pressure at a plot (City_CulturalIdentity.cpp, the one
  reader of gp +0xec): the city's citizens (+0x588; a city with none presses
  nothing) plus Great Works x +0x1aec (a per-work pressure no install row
  writes), shifted to 24.8, times the per-citizen term (0x1a1370: base,
  capital, age); where the city's owner dominates the plot's owner
  (+0x1b8 against the plot's, 0x106660) that product x (100 + 25) / 100,
  then the distance falloff (gp +0xf0). runs/h1_duelw1130
  Rome t95 reads 18.671875 and t100 18.4375 with China's Taiyuan (8 at 9
  tiles) and Handan (3, then 4, at 7) at 1.875 a citizen, the unraised term
  reading the full 20 (`citizenPressure`'s `pct`, the GPU's `dom`).

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

Where the step falls against the players' ACTIONS (the draw log, read with
the witnesses): every player's start is followed by its own actions ("Unit
Combat Damage", "Random Direction", "City Build District Choice") before the
next player's start, the barbarians' turn and the congress close the turn,
and the step of turn T+1 comes after all of them, before player 0's start
(runs/h1_duelw1117 t40: player 0's start, its 3 combat and 4 walk draws,
player 1's start ... the barbarians' combat and walks, then t41's volcano
and event rolls, then player 0's t41 start). The engines' turn takes the
starts in `endTurn` and the majors' actions between two calls, so the step
and the climate step open `endTurn` / `step`: the event strikes the units
where the actions left them (runs/h1_duelw1118 t8: the step run before the
actions struck a Warrior the game's fire missed).

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
(called from 0x599275): it walks a database collection (0xad5430: the
game's +0xb40 table), keeps each row whose byte +0x48 is set and +0x50 non-
null and whose live record (0x27a680 -> 0x25bef0 on the row's +0x20) reads
-1 at +0x0 and +0xc — not in play —, weighs each 1 and draws ONE "World
Congress Resolutions" pick over them (0x59a540), appending the pick at
+0x310. The scored competitions fit it: 1117 / 1118 / 1121 all draw it at
t161, and at t181, after the step, China (player 1) draws two "Choosing
random civic boost to grant based on era" — the World's Fair's top tier
(WORLD_FAIR_TOP_TIER_CULTURE, MODIFIER_EMERGENCY_PLAYERS_GRANT_RANDOM_CIVIC_
BOOST_BY_ERA, Expansion2_Emergencies.xml). Which table +0xb40 is stays
unread (LAB).
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

## H-1: the barbarians' turn (0x1514a0) — READ (the max camps and the sight LAB)

The barbarian manager's turn (`barbarianRules`, cpu/core/barbarians.ts;
`_barbarian_rules`, gpu/core/sim_barb.py), first in the turn's close: the
techs, the camp step, each living tribe's turn in the tribes' order, then the
clans' 0x8e1bf0 (no clans in these games).

- Techs 0x14f530: the BarbarianFree techs (SAILING, BRONZE_WORKING,
  SHIPBUILDING) and any tech or civic at least max(1, (BARBARIAN_TECH_PERCENT
  50 x living majors + 50) / 100) living majors hold.
- Camp step 0x14fcc0: target = max camps (+0x110) x the land plots no major
  sees (0x50b2d0 on hash 0x253718b0) / all land plots, less the standing camps
  (+0x170); the first step that adds adds
  BARBARIAN_CAMP_FIRST_TURN_PERCENT_OF_TARGET_TO_ADD (33) % of it, every later
  one 1. The regions are the map's Map_Region list (+0x620, filled at 0x153290
  from the map's region container, vfunc +0x108): a region is taken when its
  plot count (+4) or its area's (Map_Region +0xc m_area, looked up through
  vfunc +0xd8) is over 10 — NOT the continents (see "the map's regions"
  below); each keeps its
  best-scored plots (stable order). "Barbarian camp region placement" weighs
  the regions at the global top score by their plot counts, "Barbarian camp
  location" is uniform over the region's plots, the region's weight goes to
  0; adding more than one, a plot within 7 of a tribe is passed over.
- Plot score 0x151fa0: unowned, seen by no living player (0x50b180 walks the
  player manager's +0x4a0 list, every living player), camp terrain and
  feature, no resource at all (0x35fd60 is asked for player -1, and
  0x5112f0 hands player -1 every resource: 1118, 1119, 1123 and 1128 t1
  drop exactly their Coal, Horses, Oil and Aluminum plots from the top, the
  log's ranges 16, 10, 10, 15); no major city nearer than 4, no
  camp within 7; score = max(0, nearest + second-nearest tribe distance, dead
  tribes counted, + the nearest plot of the manager's camp list) + the
  farthest major city within 7. The camp list (+0x4a0, the AutoVariable at
  +0x448) takes each new camp's plot index at tribe creation (0x154642) and
  is cleared only at init (0x155aae); 0x152b50 returns the least plot
  distance to it, 0 when empty — every camp ever raised, so the nearest
  tribe counts twice. Checked on the recorded ties: 1126 turn 3 (996 and
  1041 tie at 52, the log's ranges 2 / 2, the game's pick 996), 1117 turn 8
  (687 alone, range 1, where n1 + n2 tied it with 766), 1128 turn 5.
- Tribe kind 0x154220: the first BarbarianTribes row the camp meets — NAVAL
  on an AREA under 15 plots (0x153d60 reads the plot's +8, the CvArea
  pointer Plot:GetArea returns (0x25990), and its +4 plot count; +0 is the id
  GetAreaID reads, 0x259c0) or with 4 water neighbours one not lake,
  CAVALRY with an unowned Horses plot within ResourceRange 3, else MELEE.
  "Barb Tribe Roll" 0x152460 draws over the kind's names no tribe holds.
- Tribe init 0x147fc0: a CLASS_ANTI_CAVALRY defender on the camp, the scouts
  within 3; the unit chooser 0x147470 takes the first unit of the highest
  Combat in the tag that the barbarians' techs and civics allow; placement
  walks rings 0x69010 (the centre, then each ring from axial corner
  (0,1),(-1,0),(1,-1),(0,-1),(1,0),(-1,1) along sides 1,2,0,4,5,3).
- Tribe turn 0x1488a0: the clock counts to TurnsToWarriorSpawn (speed
  scaled) and resets; under 5 units "Barbarian Ranged unit roll" rand(100) <
  PercentRangedUnits (BARBARIAN_NAVAL_2 100) picks ranged, else melee; off a
  spawn turn a tribe short of its 1 scout counts 5 turns and raises one.
- Raids: "H-1: the raids" below.

LAB: the max camps at +0x110 is taken as 3 per living major, a fit to the
recorded camp counts; its writer is unread. The sight the score and
the target read is the engines' line of sight plus each centre's two rings
and each owned plot's ring — a fit.

### The map's regions (AnalyzeChokepoints, Region_Builder) — READ, ported

The camp step's regions are not the continents (every Duel map of
1103–1128 but 1125 is one continent) nor the areas: they are Map_Region
objects (Core/Common/MapGen/Map_Region.cpp: +0 id, +4 m_plotCount, +0xc
m_area), which TerrainBuilder.AnalyzeChokepoints builds — the binding
(0x2b500 -> 0x8923f0) jumps straight into Region_Builder 0x887810, which
first runs the chokepoint analysis (MapAnalysis.cpp, 0x86c030 on the
builder's +0x20) and then floods the regions. XP2 Continents.lua calls it
twice (after the first AreaBuilder.Recalculate and after AddFeatures); the
second wins. Ported in `tools/civ6map/chokepoints.py` and `regions.py`; the
port was checked stage by stage against the DLL itself run under an
emulator (unicorn, the analysis 0x86c030 called on each duel's regenerated
grid with the map's plot, area and log objects faked): the triangulation,
every cell stage and the chokepoint records equal it on all 26 duels, and
the emulated chokepoints equal the game's own log (Logs/AI_ChokePoint.csv,
the "Choke Points" section of the last call) on 1126, 1127 and 1128.

- The points (0x87a030): every water or impassable plot, sorted by x, even
  rows before odd, then y (0x880590), as axial (q = x − ⌊y/2⌋, r = y).
- The triangulation: leaves of three points (two where n mod 3 leaves one
  at the start or two at the end; 0x87a470, 0x86b440: edges (0,1), (2,0)
  and a triangle unless collinear, (1,2)), merged pairwise until one
  (0x87eff0 / 0x87ed40 / 0x86a460). A merge's base is the first pair, both
  sides walked in (r, q) order, whose segment crosses no edge of either
  side (0x8808f0, X = 2q + r, Y = r); then 0x87a6c0 zips upward: each
  side's candidates are the base end's neighbours turning left of the base,
  ranked by the cosine against it on the true hex geometry in float
  (x = q + r/2, |v|² = 3x² + 2.25r²), the best's edge deleted while the
  second lies in the circle through the base and the best (0x878f90, a float
  determinant); between the two sides the in-circle test again. Triangles
  are edge triples; edges and triangles keep the DLL's vector order.
- Pruning (0x87f7a0): a triangle of touching obstacles goes (all its edges
  neighbours, |len² − 3| < 0.001, or all but one of length² 9).
- The dual graph (0x872580): a cell per triangle at its circumcentre — the
  small-map callback 0x86f1a0 (maps up to 106 x 66) computes it in 24.8
  fixed point (Math_FixedPointT: float to fixed is floor << 8 | the
  fraction's 256ths, products >> 8, quotients (a << 8) / b truncated) with
  the radius from the fixed formula, else (a negative square) from the side
  lengths; cells are neighbours across a shared edge that is not between
  neighbouring plots. The cell match by position never fires (its epsilon
  0.001 is 0 in fixed point).
- Cells with no neighbour go (0x87f480); each radius shrinks to the nearest
  obstacle plot over its radius' rings (0x8801d0: 0x871f00 puts the centre
  in a plot, 0x877890 measures); leaf cells narrower than their neighbour,
  then leaves under 1.5, go until none (0x87f1b0, 0x87f5b0).
- Marking (0x87d6a0): flag 0 on a cell of other than two neighbours, or
  whose 3r² exceeds 12 and no other cell within r has a radius as large.
  Linking (0x8759a0): each path of unflagged cells between flagged ones
  (from the lower end) has its narrowest cell flagged 1 (the last of the
  least, the far end counted), keeping the pair and linking both ends.
  Cleaning (0x871d70) leaves the flagged cells.
- Merging (0x87e150, looped): the widest unmerged chokepoint cell takes
  the cells of its pairs whose radius it nearly matches (0.9 of the
  narrower / 0.85 of the wider; 0.9 or 0.85 of the other when itself an
  end), the narrower into the wider (0x87df70). The loop runs only when the
  map analysis log exists (0x87a381 tests it) — the game's logging is on
  (the owner's Logs/AI_ChokePoint.csv is that log), and with it off the
  emulated chokepoints differ.
- Chokepoints (0x8783c0): per flagged-1 cell the first triangle holding
  its point (0x876830, barycentric in fixed); per pair, across each linked
  cell the triangle edge (of its three obstacles) the link crosses whose
  plots are more than a step apart, the nearest, else the edge nearest the
  cell (0x873b00); the best does not reset between pairs. 0x87cff0 keeps a
  pair (offset plots) when the plots its line passes between them (the
  cube walk 0x38070 of 0x371d0) all lie in one area, once per ordered pair.

Region_Builder then makes a chokepoint object per record (its line's plots,
0x371d0) and walks the plots in index order: a plot of no region, not
impassable (byte +0x3a bit 3) and not water seeds a region, and a flood
(0x77d10, the visitor 0x886dd0 counting and stamping each plot it closes,
m_area its area) takes every plot the step test 0x887aa0 admits: passable
land not yet the flood's own; free between plots off every chokepoint line;
otherwise per chokepoint holding either plot — both on its line: free when
the step misses the segment between its ends, else refused unless both lie
on the line; one on it: refused when the step meets the segment, unless the
target lies on the line and the source off it, the target then taken only
while no region holds it. The camp step admits a region of more than 10
plots or on an area (m_area, looked up at the game's time) of more than 10
(0x153290).

## H-1: the raids — READ (the operation's end unread; the recruit's fresh units a fit)

`barbarianOps` / `opTurn` / `barbScoutLook` / `barbBattleBoldness` in
cpu/core/barbarians.ts; `_barbarian_ops` & co in gpu/core/sim_barb.py.

- Boldness (tribe +0x20): +BARBARIAN_BOLDNESS_PER_TURN (2) each tribe turn
  (0x148ca3); a battle's dead (0x1540b0 -> 0x148e90: the defender dead, else
  the attacker): an enemy a tribe's unit killed +PER_KILL (15), a tribe's
  unit lost PER_UNIT_LOST (-10), a scout PER_SCOUT_LOST (-5). PER_CAMP_ATTACK
  has no reader found.
- The report (0x153ef0, a barbarian unit's sight of a plot): a tribe's scout
  (unit +0x1c0 == 2) seeing an owned plot of a city, its owner's throttle
  (manager +0x3d8, data +0x430) passed: 0x1485c0 starts the tribe's
  ScoutingBehaviorTree ("Barbarian Found City": Move Unit to the camp, To
  Range 1, then Notify Owner) when none runs (+0x38) and the owner is a full
  civ (0x484a10 -> 0x469db0, hash 0x253718b0); the throttle becomes turn +
  max(0, BARBARIAN_MAX_THROTTLE_PER_RAID 18 - handicap x
  BARBARIAN_LOWER_THROTTLE_PER_DIFFICULTY 3), handicap = player +0x908
  (m_eHandicap).
- The scout home (Notify Owner 0x7c6fa0 -> 0x153ea0 -> 0x148270): for the
  scout's tree, threshold RaidingBoldness (BarbarianTribes +0x24, a name's
  +0x38 override: BARBARIAN_NAVAL_3 100); boldness at it, no raid running
  (+0x3c) and no bribe -> the raid starts at once (0x149980), else the city
  goes on the raid list (+0x48). For a raid's own tree ending: threshold
  CityAttackBoldness (+0x1c) and the city assault (0x1497d0) or its list
  (+0x60).
- The tribe turn after its spawn (0x148cad..): an operation gone is forgotten
  (0x148c6b); an assault city waiting (+0x70), no assault running: boldness
  >= CityAttackBoldness starts it (below it nothing more happens), else a
  raid city waiting (+0x58), no raid running: boldness >= RaidingBoldness
  starts it; either pops its list. 0x149980 / 0x1497d0 refuse while either
  operation runs.
- "Raid City" / "Barbarian City Attack" (BehaviorTrees.xml): Barbarian Spawn
  Change (0x7c6e50): the force (0x147640: the name's then the tribe's
  BarbarianTribeForces rows, RaidingForce matching, Min/MaxTargetDifficulty
  holding the target owner's handicap) sets the spawn interval to its
  SpawnRate at the speed (0x14fc30 -> 0x149760, +0x88; 0 or less: the
  tribe's own). Barbarian Recruit (0x7c7580) under a Turn Limiter (10 / 15):
  the force's counts (0x144610, each class the barbarians cannot raise
  dropped, 0x147e70); the units it finds join, success; else the missing
  units go to the tribe's queue (0x155b50 -> 0x149750, +0x90) and it runs
  again next turn. Success or the limiter's end: Spawn Change back to the
  tribe's interval. The tribe turn's tick spawns the queue's head first
  (0x148ac6, popped whatever the raise did), with no roll and no unit cap.

Cases (the log's rolls tell a queue spawn from a clock one): 1124 camp
(40,21): its scout home at t8's pass, then t9 W, t10 W, t11 S, t12 S with no
"Barbarian Ranged unit roll" for them, the clock back at t19 (t12 + 7); 1117
camp (9,24): home at t9, t10 W (no roll), t11 W, t12 W, t13 S, t14 S, the
clock at t21 with its roll; 1124 camp (41,7): home at t22, t23 W, t24 W, t25
W, t26 S, t27 S, the clock at t34. StandardRaid (2 melee, 1 ranged) fits all
three only if a unit raised in the turn is not yet recruitable (W at t7
recruited at t8, the t9 W not at t9): LAB — the evaluator 0x60a8c0 is
unread. The raid operation's own end (its tree's last Notify Owner, which
opens the city assault) is unread: the engines end an operation once the
units it took are gone (ASK in docs/AUDIT.md C-94). The visibility event's
exact trigger (a plot newly in the scout's own sight, the plots in index
order) is the engines' reading.

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

- Player DoTurn 0x4e4560, in order: the culture (+0x1310, 0x396860: the
  civic progress), the resources (+0x1320, 0x4a8ed0 at 0x4e46c0: the
  holdings recomputed by 0x4ab6e0, then 0x4a6110 rebuilds the allocation),
  the governors' clocks (0x432980 at 0x4e46df), and only then each city's
  turn (0x1fa1d0 at 0x4e4813, in the loop over Player_Cities +0x12f0 from
  0x4e47bc). 0x36f420 at 0x4e4665 is not the city turn. This REVERSES the
  earlier reading (cities at 0x4e4665 before the resources); both give the
  same answer on the recorded cases: 1122 t200, Reyna established in
  Changsha (Civil Prestige's amenity) leaves the ranking standing to t201
  (the rebuild precedes her clock), and the 9 policy changes at a
  processing's start re-rank the cities' luxuries before their growth
  (the rebuild follows them) — the new order explains the second without
  an extra rebuild.
- ChangeResourceAmount 0x4a7560 (resource, ownership, amount) rebuilds the
  allocation at once (0x4a77d4, unless the game's flag +0x45e) for any
  ownership-0 change and any non-accumulated import / export. Its callers:
  a production completion's strategic costs (0x18433d building, 0x184d95
  project, 0x1856b3 / 0x185a2a unit), a plot's extracted resource changing
  (0x4ab4d0 from the city, district and plot handlers 0x4ac2e0..0x4ad0d0;
  an accumulated resource skips it), the copies 0x44eff0 hands a resource's
  recipients, the power ledger 0x4a7cc0.
- A suzerain CHANGE (Player_Influence 0x451b20, reached from the envoy
  setters 0x44a040 / 0x450fb0 / 0x451460; old != new or it returns) takes
  the city-state's owned resources off the old suzerain (0x4a91a0) and
  hands them to the new (0x4a6d90 -> 0x4a7560): a rebuild for the new one.
  A city-state's own resource change re-hands its copies to its recipients
  (the signal handler 0x44eff0, Player_Influence.cpp: the luxury and
  strategic recipient counts +0x8a0 / +0x918 per player). The extra
  amenities per owned luxury / bonus resource (+0x160 / +0x1c0, the
  effects' 0x4a7100 / 0x4a70c0) rebuild too.
- A founding does not rebuild it. Over 1117-1129, 54 foundings tell it
  apart (the record's luxury amenities fit a full rebuild with the new
  city, or only the allocation without it): 36 rebuilt before the next
  record, 18 did not; 1122 t36 (a suzerain's Furs improved), 1124 t82 (a
  suzerain's Ivory) and 1129 t52 (China's own Tea) show a holdings move
  after the founding, the rest no logged row. The recorder watches each
  founding with no allocation and logs LuxAllocArrived [owner, city, the
  row it follows] or LuxAllocNone at the owner's activation: a probe game
  (map seed 9131, 140 turns, scratch only) saw two arrivals, at China's
  PlayerTurnDeactivated (t90) and four rows into a city-state's start
  (t70), each after a Builder charge.
- Unread: what rebuilds it at a policy change (the records: 9 of 9 policy
  changes at the processing's start re-rank the cities' luxuries before
  their growth), and which change re-runs it after a founding in the
  action phase (AUDIT C-94 LAB).

## H-1: the governors' clocks — READ

- 0x432980 (from Player DoTurn 0x4e46df, after the culture and the
  resources, before the city turns) walks the roster: 0x35df30(location, 1)
  raises the posting's count (+0x28) and, on reaching the type's
  EstablishTurns (0x433180), raises "Governor Established" (0x35e5f0);
  then the neutralize clock (0x35e1f0 > 0 -> 0x35d220(-1), "returning to
  service" at 0); every governor logs GovernorChanged (0x8b9120, hash
  0xcb6c9e05) — the per-turn GovernorChanged rows, which stand before the
  city rows in every recorded processing.
- So the cities of the processing whose tick establishes her read her, the
  culture already tallied does not. Recorded: 1117 Reyna seated in Handan
  in China's t94 start (after its cities), established at record 100, the
  border +20% in the t99 -> t100 processing; Pingala seated t27, border
  +15% at t32, civic progress from t33; the AI seats after its clocks, so
  a seating counts its EstablishTurns processings from the next. Engines:
  `governorPhase` = `governorClocks` then the script, after the Culture
  tally, before the cities (`_governor_phase` / `_governor_clocks`).

## H-1: the border bank in fixed point — READ

- The border turn 0x1a9bc0 banks the city's culture c (1/256 raw, 0x1ab060)
  scaled by the border percent [+0x14] when not 0:
  ((c x ((pct + 100) << 8)) >> 8) / (100 << 8), the shift and the
  FixedPoint divide (0x16e940) each truncating (0x1a9d25..0x1a9e16).
  Recorded: 1121 Taiyuan t40-45, 153/256 a turn banking 175/256 at +15%;
  strict step.border over the 22 duels 24,988 -> 35,259 passes.
  `cityBorderGrowth` / `_seat_border_growth`.

## H-1: war weariness per combat — PARTLY READ

- 0x1fb680, per side, the attacker logged "Attacking": loc = 1 in lands
  allied to the unit (GP +0x76c), else 2 (+0x770), +3 killed (+0x774), +10
  a WMD (+0x778); base = WAR_WEARINESS_WARMONGER_BASE 16 (+0x780) +
  Eras.WarmongerPoints of the era row (+0x30) x X / 100, X = min(the war's
  DiplomaticActions WarmongerPercent, the player's cap +0x1a48) (0x3d1450);
  amount = loc x base x (100 + the player's +0x18c8 + the foe's +0x1808
  [+ +0x1868 in allied land]) / 100.
- Ledger (Player_WarWeariness.csv, 1119-1124, 74 rows, one game t216-223):
  Rome 104 / 260 / 52 / 208 = (2 / 5 / 1 / 4) x 52, 52 = 16 + 24 x 150%;
  China 124 / 62 = (2 / 1) x 124 x 50%, 124 = 16 + 24 x 450% (its surprise
  war); China's later 78s unread; one "Getting Attacked" row in 74 — the
  defender's branch unread. Not shipped (AUDIT C-94).

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

## H-1: the trade path's search, its score and the Canal — READ

- The path search is the generic CvAStar (Pathfinder_Instance.cpp, the base
  vtable 0xd02108): GeneratePath 0x77d10 seeds the origin and loops
  SearchStep 0x793f0 — GetBest 0x781e0 pops the open list's head, the
  children are made (0x77a50: the six neighbours from the axial tables, then
  the callback's extra neighbours, a portal), the popped node is the
  destination test's last. The open list is a list sorted by total cost,
  equal totals by known cost (AddToOpen 0x775a0 scans from the head or the
  tail by a float midpoint, so a tie lands first or last by the side it
  scanned from). LinkChild 0x78750: a child is linked only when the valid
  callback passed; an open child is re-parented on a STRICTLY cheaper cost
  (UpdateOpenNode 0x79560), a closed one likewise with UpdateParents
  0x79660, a new one opened. The trade path's callbacks (0x557e40): the
  destination test 0x271490, destination-valid 0x629460 (1), no heuristic
  (both slots null: the total is the known cost), cost 0x558970, valid
  0x558db0, notify 0x558900 (type 5 a no-op; 1, 2, 4 store the child's range
  off the range callback), neighbours 0x558d60 / 0x271b50, context 0x558ba0.
  The range callback 0x5579b0 memoises its answer on the (parent, child)
  node pair.
- IsLand 0x5583a0 / IsWater 0x558460 read a district plot's info word +0x14
  (masks 4 and 1): both, or neither, is neither land nor water. The cost
  callback adds nothing onto a plot whose word holds both (0x810a0 mask 5) or
  onto a city centre (0x81120, the district row's hash). The route's path
  score (Trade_Manager 0x5500b0 counting, 0x54eeb0 weighing): past the
  origin, a centre counts its Trading Post (foreign, own); any other plot
  whose district word holds both masks counts MULTIPLE_DOMAINS (gp +0x708,
  15); a step of more than one plot a PORTAL (+0x70c, 15); the best route
  unpillaged (+0x4d bit 1) BEST_ROUTE (+0x704, 2); a water plot WATER
  (+0x710, 2). A Canal is that two-mask plot: runs/h1_duelw1124 Cardiff ->
  Xiurong through Shenyang's Canal, 11 plots, 4 water, pays its 6 Gold
  district rows twice over (score 23 >= 11) — 12 Gold, which water alone
  (score 8, 10.36) does not. The engines: `multiDomainPlot` /
  `_multi_domain_plot`, neither to `walk` / `_trade_reach`, MULTI_DOMAIN in
  `routePathGold` / `_route_path_gold`.
- Unexplained (AUDIT C-94 LAB): 1124's Shenyang -> Bologna (t180) took the
  Taiyuan - sea - Granada path although the walk as read labels the shared
  plot (40,10) off the cheaper road first with 3 range left, and Xi'an -> Rome
  (t198) passes Bologna, 24 steps past Shanghai's refuel, with no Trading
  Post there (the route's own yield counts none until t223). The path cache
  (0x541ae0 over the trade network graph's edges, 0x5419a0) answers a
  pair before any search (0x5526a0); whether an edge holds the reverse
  route's path is unread.

## H-1: a district's locked price and the turn's research — READ (log)

The record's action log orders a turn's events: 1124
China t198 runs CivicCompleted 47, CityProductionCompleted (Beijing's
Research Lab), DistrictAddedToMap (Beijing's Canal), PlayerTurnActivated,
UnitGreatPersonActivated, ResearchCompleted 53 — the Great Scientist's
technology lands after the placement, and the Canal locks at 310, the price
before the climb every other city quotes (313) from t199. The harness prices
a lock on the research held at the placement: the technologies and civics
the log completes after the seat's DistrictAddedToMap left out
(`researchAfterPlacement`; 1117 buy.districtCost 20 -> 6, 1124 74 -> 22).

## H-1: Johannesburg's yield per resource type — PARTLY READ

EFFECT_ADJUST_YIELD_BY_NUMBER_OF_RESOURCES (the factory 0xc2e490, the
instance vtable 0xdece90): its apply (0xb48710) registers the yield type and
Amount on the city's +0x1da8 table (0xc705d0); the count that table is
multiplied by is read where the city's yields sum (unread). The records fix
it: distinct resources the owner sees under an unpillaged improvement on the
city's plots (runs/h1_duelw1123: Jiaodong's Cotton and Cocoa +2, Chengdu's
Coal mine nothing before Industrialization shows Coal; city.yields 1,091 ->
266 gap-free). `suzerainResourceTypeProduction` / `_res_type_prod`.

## H-1: a completion's overflow and the item multiplier — READ

City_BuildQueue 0x16f050 → 0x1853d0: an item's progress takes (A + the
stored overflow) × the item's percent multiplier — 0x1856ed multiplies the
SUM, so the banked overflow is raised with the turn's Production. On
completion the stored overflow is min(A, B) − what the item lacked, A the
turn's Production unmultiplied (0x16f3cb) and B the city's plain
Production. The engines: the seat production step (`(production + banked)
× the item multiplier`, the made share capped at the plain Production) on
both twins.

## H-1: the flood's river walk — READ

0xa2cfc0 walks the river manager's vector (+0xb8) in its stored order. The
vector is filled by 0xa28900, which the SetNEOfRiver / SetWOfRiver /
SetNWOfRiver bindings (0x2be20 / 0x2c220 / 0x2bff0) call per edge: it finds
the river of the edge's ID or creates it at the back ("Incorrect River ID,
going non-sequentially" asserts the IDs come in order) — the map script's
laying order (RiversLakes.lua DoRiver). A river object: +0 its NAME (-1
unnamed; the id the event history carries as River), +4 its ID, +0x28..+0x30
its Floodplains list, +0x48 the player who named it, +0x78 its event history
(16-byte entries, +8 the event row). The weight loop skips a river whose name
is -1 or whose list is empty, and boosts a river's pair while its own history
holds no entry of the row; it tests no reveal itself. The reveal gate is the
NAME: a plot first revealed (0x534950) names its rivers (0xa29730 ->
"Random River" 0xa292a0, an unused name of the namer's civilization; runs/
h1_duelw1118: 7 draws, ranges 5, 4, 3 and 9, 8, 7, 6, one pool per civ; a
river whose namer field is 0 — player 0's — is named again). The order is the map script's river IDs: Expansion2's RiversLakes.lua (the
Base copy passes none) hands every SetXOfRiver its river's ID — `nextRiverID`,
taken by each DoRiver call of AddRivers' four passes over the plots (hills
and mountains; inland plots at a 1-in-8 draw; then both again at half the
ranges), even a call that lays no edge —, and the bindings (0x2c220 &c.)
call 0xa28900 only when the ID argument is present, so the vector runs in
ID order and no source-plot or edge law of the finished map fits it (1117's
floods 181, 8, 207, 251; 1118's 152, 243, 251, 250, 12). `tools/civ6map`
runs the script on the game's map seed: its setter calls give the vector
(`tools/civ6lab/h1/map_orders.py`; 1103–1124 every river edge and volcano
plot as recorded); the dumper reads the game's own (RiverManager.
GetRiverByIndex, `cat.rivers`): runs/h1_duelw1126 7 of 7 rivers in the
generator's ID order, each plot list the generator's, and on 1125 / 1126 all
22 Floodplains lists the run their plot list gives from the mouth. The
engines walk the map's vector (`GameMap.rivers`, `floodRivers`).

The damage pass 0xa2a4d0 decides the shield: mitigated when the river is
unnamed or its list empty, or when the Great Bath (0xa2b280: the first
building flagged +0x28 & 8) stands on a plot of the LIST (0x810d0), or when
0xa2c280 finds a Dam (0xa2b200: the district flagged +0x48 & 0x40) on a plot
of the list whose city holds it (0x81330) — the list, not the river's whole
network (`riverShielded` over `riverReach`). The engines' rivers are laid back
from the record's edges (`laidRivers`): the mouth by the sea, else a lake,
else the lowest end; the source by the lowest plot lays to the mouth, each
later one to the first laid edge (runs/h1_duelw1115 rivers 151 at 794 and 250
at 839; 1111 296; 1123 480 and 612; 1112 two of three; 1116's two lists at 480
stay unmatched).

## H-1: the volcano roll's branches and order — READ

0x335040: the wake branch (active share under 70) draws "Choose Active
Volcano Roll" (0xa20f20: the entries of the volcano vector +0x160, stride
0xa0, not active and named; the chosen one's +0x14 takes the turn), the sleep
branch "Choose Inactive Volcano Roll" (0xa212d0: active and named; +0x14 =
-1) — runs/h1_duelw1118 t53 woke over 2, t152 slept over 2 with both active;
the engines had the two labels crossed (`volcanoRoll` now draws Active for a
wake). The wake's gate is the named count less the active: 1121 t70–99 (two
volcanoes, one named and active: share 50, named − active 0) draws nothing
until the second is named (its "Random Volcano", t99). The vector is filled as the map
script sets each volcano's feature: TerrainGenerator.lua's SetFeatureType
(FEATURE_VOLCANO) -> Terrain_Builder 0x896c40 -> 0xa1e370 -> 0xa19360 appends
an entry (a natural wonder's volcano goes to its own list, 0xa18f20) — the
continent-boundary pass column by column (x outer, y inner), then the lone
mountains shuffled per continent. The eruption weights (0xa1e470) walk the
same vector (+0x1b8). 1118 t53 woke 803 at index 0 of [803, 534], 1117 t154
827 at index 1 of [206, 827], each the generator's placement order; 1123
t35 / t130 and 1124 t120 / t211 (eruptions after each) fit [539, 474] and
[716, 500]. GetNamedVolcanoes walks the vector by index and leaves out an
unnamed one (the dumper's per-record `volcanoes`). The engines walk the
map's vector (`GameMap.volcanoes`, `volcanoOrder` / `_volcano_order`).

## H-1: the citizen manager's placement and the yield flags — READ

City_Citizens.cpp. `ChangeNumUnassigned` (0x194fb0, called with the
population change by City::ChangePopulation 0x1c79b0) adds to
m_iNumUnassignedCitizens (+0x68): a negative count runs the full reassign
0x196320 (save the forced counts +0x08, unassign all 0x196440, assign
0x197230, lay the forced counts back 0x196e30), else 0x197230 places the
unassigned ones beside the citizens already working. Growth (0x1b41e0:
box - threshold, then the box clamped to the new threshold - 1) places one
citizen incrementally; starvation re-places every citizen.

0x197230: need = max(0, -floor((food256 - consumption(pop) << 8) / 256)),
food the city's cached food yield (0x1cb8b0, `m_bIsCached`), consumption
0x5276c0 of the new population. One entry per free slot of each plot of the
city's 37-plot hexspace (0x5cc00 over the tables 0xefedf0 / 0xefeef0: axial
dq, dr per index — the centre, then rings 1, 2, 3; the order the DP walks: (0,0) (0,1) (1,0) (1,-1) (0,-1) (-1,0) (-1,1), ring 2
from (0,2) clockwise to (-1,2), ring 3 from (0,3) to (-1,3); 0x5cc00 maps
q = x - floor(y/2) + dq, y' = y + dr, x' = q + floor(y'/2), x wrapped),
the plot's capacity 0x195940 (0 on the centre, 0 where no yield is above 0,
a district's specialist slots, else 1) less its workers. An entry's score
(0x195f90): food (+0x08) the plot's Food; each yield not disfavored
(+0x50) counted twice, Gold once (0xf2f97c = YIELD_GOLD), into favored
(+0x0c, the yields m_favoredYields +0x38 holds) or other (+0x10). The pick
(0x193dc0) is a table over entries x count: an entry taken where
better(cand, old) — old's food below the need and the candidate's at or
above it, else favored greater, else (favored equal) other greater, strict —
so an earlier entry keeps a tie. The N = unassigned count of the last row's
backtrack are assigned (0x194d90).

Scored on the records with no favored yield (`dpcheck.py`, `dpgrow.py` in
the r22 scratchpad): the full set of worked non-district plots 1,133 of
1,284 city-turns on runs/h1_duelw1117 (need 0 or the offsets ±1, ±2 score
lower: 1,071 / 1,072 / 1,038); the incremental growth pick 186 of 203
(1117, 1118). The rest follow the AI's favored yields: the log's
CityFocusChanged rows (an AI city every turn or two) carry no yields, and
the records hold none — 1117 Xiurong t199-240 (4 <-> 5 citizens: the
growth pick Food-first, Plains 1/2 over a Great Wall 0/0/4/0/2, the
re-placement Culture-first on the Great Walls; the border banks 25.5 and
27.2 where an unfavored DP banks 27.5) and Guangzhou t173-249. The engines'
own placement (`assignWorkedTiles` / the GPU walk: locked plots, then
FOCUS_BASE 2/2/1/1/1/1) is not this reading (AUDIT C-94 BUILD). The H-1
harness places by it (`cpu/harness/citizens.ts`, no favored yields): a
Settler's citizen lost re-places them all, a grown citizen goes beside the
rest, a starved city re-places them all (1121 t21 Xi'an grows back on the
Spices; t231 Shanghai's five specialists back on plots): over the 22
duels step.growth +11 / step.border +73 passes against reading the next
record's worked set. AI_CityBuild.csv logs per-city yield values
("YIELD_FOOD: -0.1, ..."), not the favored / disfavored flags.

The flags and their setters (read; recorded from runs/h1_duelw1129 on):
the InGame Lua answers them per city (`GetCitizens():IsFavoredYield(i)` /
`IsDisfavoredYield(i)`; GameCore_Tuner names them `IsYieldFavored` /
`IsYieldDisfavored` beside `SetFavoredYield` / `SetDisfavoredYield`), and
the dumper writes them per city per record (`favored`, `disfavored`) and on
each CityFocusChanged row (one letter per Yields row). 0x196f90 asserts
the yield is not favored (+0x38) and writes the disfavored byte (+0x50);
0x1970e0 the converse; each runs the full reassign 0x196320 whatever the
value was and fires the event (hash 0xe808a01e) — the city command
0x975920 (SET_FOCUS) and the Lua setters 0x9c0c80 / 0x9c0ce0 are their only
callers, so every CityFocusChanged row is a full re-place. Recorded
(1129-1130): the AI calls a setter on its cities every turn or two, China
mostly with nothing set ("......", a re-place under no flags), at times
Food favored (1130); the city-states toggle Food favored on and off a turn
apart. China's rows fall in its start window (before PlayerTurnActivated)
or in its actions; a start-window row lands after the city turns:
re-placing at those rows before the border step costs 112 step.border
passes on 1129, before the growth 129 step.growth passes — the city turns
bank on the citizens the growth placement left, and the next record
carries the re-placed set. The harness places under the record's flags
(`recordFlags`; `citizens.ts` YieldFlags: a favored flag puts the yield's
doubled value in the favored score, a disfavored one drops it) and
re-places on a start's wonder annex where the record holds them (1129:
step.growth 1484 -> 1487, step.border 1556 -> 1558; with 1130, 2164 ->
2168 and 2231 -> 2233). Under the recorded flags, re-placing every citizen
on a grown one (in place of the one placement) costs 60 step.border on
1129-1130, and re-placing them when a completion adds specialist slots 5
step.growth and 3 step.border: the DLL's single placement stands, and a
slot completion re-places nothing. A city-state's start-window rows too
land after its growth (re-placing at them before it: step.minorGrowth
1168 -> 1160 on 1129-1130).

## H-1: a drought on a city centre, Monumentality's districts, Kandy's wonder Relic — PARTLY READ

- The plot yield 0x538a60 adds the game effects' per-plot rows (0xc7e9b0, a
  scan of the plot's (amount, yield) pairs) AFTER the city's floors (the cmovl
  at 0x53916e). The drought's −1 Food is read there: the records put it after
  the floors — runs/h1_duelw1124 Shenyang, a Grassland centre in the
  footprint t162–163, t194–195, t234–235, reads Food 1 and the city's
  surplus one less; 1111 Shanghai's centre the same (t186, t212, t223). That
  the drought writes one of 0xc7e9b0's rows is unread (a LAB line in AUDIT
  C-94). `tileYieldsForCenter` / the GPU walk's centre floors.
- EFFECT_ADJUST_PLAYER_ERA_SCORE_PER_DISTRICT_CONSTRUCTED (Monumentality's
  COMMEMORATION_INFRASTRUCTURE_QUEST): the factory 0xc25910, the effect
  vtable 0xdf85f8, its player apply 0xb83b00 → 0x2bf3e0 adds the Amount to
  the era manager's player entry +0x34 (the +0x560 vector, stride 0x78).
  Where the district completion reads it is unread; the records fit "a
  specialty district (RequiresPopulation) completed pays": an Aqueduct pays
  nothing under the dedication (1109 t99, 1110 t107, 1120 t94, 1124 t97),
  nor a Dam (1118 t98) nor the Bath (1110 Rome t101). `completeQueueItem`'s
  Monumentality event / `_district_completed`.
- MODIFIER_PLAYER_ADJUST_NATURAL_WONDER_RELIC (Kandy's
  MINOR_CIV_KANDY_GRANT_RELIC_BONUS, Amount 1): the visibility manager's
  reveal 0x50d390 (Player_Visibility_Manager.cpp, the natural-wonder
  discovery notification), for i below the player's count (+0x1340 → +0x7f0),
  creates a Relic through 0x495860 → 0x296c00 ("Choosing a Relic") with the
  player's capital (0x36f460). No record shows it (no Kandy suzerain
  discovered a wonder in the duels). `revealAround` / `_reveal_around`.

## H-1: a unit's Production cost in the queue — READ

Lua `BuildQueue:GetUnitCost` (0x983930) answers an int from the city build
queue cache's `m_aiUnitCost` (Cache_City_BuildQueue.cpp), which 0x17c790
fills per unit row: c = the owner's unit manager (+0x12e8) current cost
array (+0x3c0, 0x4f2b20, `m_aCurrentUnitCost`, an int); where c > 0, the
row's +0x20 class does not read 2 through 0xadd5e0 (unread) and the
player's +0x1048 equals the global at 0xf2f978 (the currency the
resolution names; Production fits the records), the quote is c − ((c << 8)
· x >> 8 >> 8), x the player's +0x10a8 in 24.8 fixed point — Mercenary
Companies on Production's percent off: c − floor(c · x / 256). Outcome B's
−50% (x = 128) quotes 215 → 108, 325 → 163, 227 → 114, 45 → 23
(runs/h1_duelw1104 t242 Biplane, Mechanized Infantry, Anti-Air Gun; 1106
t62 Swordsman; ~14,700 quotes over the 22 duels at 1/512). Engines:
`mercenaryCost` / `mercenary_cost`, `unitProdCost` (the production step's
fill and the harness's quote), `unitBuyBase` / `_unit_buy_base`.

## H-1: a National Park's amenities, stored at the owner's turn — READ

- City::GetAmenities 0x1b4af0 sums the luxury amenities 0x1b5210 (a COUNT of
  the entries of `m_aLuxuryAllocations` (Player_Resources +0x460; data
  +0x4b8, count +0x4c8) naming the city's id, 0x4aa0e0 — a city the last
  rebuild did not list holds none), the entertainment 0x1b4c10, and stored
  per-city counts, among them +0x54 of the city's +0x1730 object.
- Game_NationalParks 0x32deb0 (player) zeroes +0x54 on every city of the
  player, then per park of that player adds NATIONAL_PARK_AMENITIES_OWNING_CITY
  (GlobalParameters +0x514) to its city and, via 0x32dc40, 1 to the nearest
  NATIONAL_PARK_NUM_OTHER_AMENITY_CITIES (+0x51c) others. Its only caller is
  the tail of Player_Resources' DoTurn step 0x4a8ed0 (the holdings 0x4ab6e0,
  the allocation 0x4a6110, then the parks), reached from Player DoTurn
  0x4e46c0 alone; no vtable holds either.
- So a park designated in the action phase pays from its owner's next turn
  processing. Recorded: every park lands in the record one turn before its
  cities' parts[6] (1109 t225/t226 and t233/t234, 1111 t175/t176 and
  t205/t206, 1113 t212/t213 and t222/t223, 1115 t216/t217, 1117 t244/t245,
  1119 t194/t195 and t217/t218, 1121 t227/t228 and t243/t244, 1123
  t220/t221); 1110 and 1114, whose local player is gone and whose records
  are read at the park owner's turn start, show both at once. The engines:
  `refreshParkAmenities` / `_refresh_park_amenities` at the seat's resources
  step, `City.parkAmenities` / `city_park_amen` read by the amenity sum.
- Not explained by this reading (C-94 LAB): a city founded in its owner's
  action phase holds its first luxury at the next record in 28 of 45 cases
  (1117 Handan t94, 1121 Shanghai t45, 1124 Chengdu t82, ...) and none in 17
  (1121 Taiyuan t37, 1124 Shenyang t54, Beijing t60, Shanghai t118, 1118
  Longxi t26, ...) — some rebuild follows the founding in the first group;
  neither the claimed plots' resources, a free building, the holdings, nor
  the suzerainties tell the groups apart. The 1121 t222 ranking is the
  slot rebuild's timing ("H-1: the cards the luxury allocation ranks on").
## H-1: an annex re-places the citizens, the garrison's unit, a religious unit killed on a move — READ

- AnnexPlot 0x1a8b70 (the border turn 0x1a9bc0's claim, AnnexPlots 0x1a8a30
  — a wonder's free tiles, a founding, a city-state's envoy annex —, the
  purchase 0x1a7710, a culture bomb 0x524e30) raises the annexed count
  (+0xc), clears the stored next plot (+0x1c) and runs the full citizen
  reassign 0x196320 on the gaining city (0x1a8f4c) and on a losing one
  (0x1a903c). Other callers of 0x196320: the favored / disfavored yield
  setters (0x196f90, 0x1970e0), an improvement laid (0xa4cee0, 0xa4e7a0).
  Recorded: a city-state's envoy annex re-places before its growth (1121
  Hunza t41: 229 annexed, the growth on surplus 3 where the record's set
  read 4; t45, Ayutthaya t158); step.minorGrowth over the 22 duels 14,284 →
  14,499. A major's annex re-places by the AI's favored yields, which no
  record holds: re-placing with none scores lower (step.growth −4,
  step.border −3), so the harness keeps the record's citizens there.
- The centre's garrison term 0x24a180 takes ONE unit, the plot's best
  defender 0x208b80 (flag 0x10): among the plot's units in its own order
  the comparator 0x523d60 keeps the first whose unwounded strength (0x56dc90
  with the formation's) is strictly greater, and only then takes its wounds
  off (0x522630). Recorded: 1121 Guangzhou t191, a Line Infantry Corps (75,
  16 HP) over an Ironclad (70, 75 HP): 66.6015625 = 60 + 75 − 2150/256 − 60
  (the strongest-by-term reading gave 67.5). `garrisonCS`; the GPU's tile
  seats one military unit, so its `_garrison_cs` reads the same.
- A unit's move onto a plot holding a religious unit it kills (0x26fe20 →
  0x493f80 with the capture flag 1) swings religion: RELIGION_SPREAD_
  UNIT_CAPTURE (gp +0x600, 125) within RELIGION_SPREAD_RANGE_UNIT_CAPTURE
  (+0x5f0, 6) off the victim's religion, scaled by its player's +0x4f0
  percent; the condemn command (0x89cc00, 0x947f10) and a combat kill
  (0x20e720, 0x212c30) pass the same flag. Recorded: 1121 t110, a barbarian
  on China's Missionary beside Taiyuan, −125 in Xi'an and Taiyuan
  (`religiousUnitLost`, the harness replaying the log's kill).
- A random event's POPULATION_LOSS strikes a city-state's city too
  (`losePopulation` / `_lose_citizen`): runs/h1_duelw1117 Antananarivo t170
  (a storm's two plots at the turn's end, 10 → 8, its box standing), 1124
  Granada t74 and t120, Cardiff t103.

## H-1: the melee result, a ranged blow's domain, a city's shot — READ

The action replay's battles against each game's `Logs/CombatLog.csv` (Game
Turn, attacker / defender civ, object types, ids, base strengths, the summed
modifiers, the damage each side took; runs/h1_logs_duelw1119_1124 and
`<dump stem>.logs/` for 1125-1128), the draws from `RandCalls.csv`.

- The melee result (0x206960, Combat_Manager): the defender's damage is
  drawn first (0x51a240); the counter — the attacker's damage — is never
  drawn where the defender is embarked (0x8be30, byte +0x6b0) and does not
  fight embarked (+0x18c3, m_bFightWhileEmbarked). Both sides' totals are
  then summed against COMBAT_MAX_HIT_POINTS (0x56e0d0): where both would
  fall, the side whose total overshoots further falls and the other is left
  at max - 1 damage (1 HP) — the attacker on a tie (0x206d01: `jle`). The
  experience reads the result after it (0x1975e0 at 0x206e98 / 0x206ee2).
  Records: 1124 t13 a barbarian Warrior at 8 HP (32 taken, 24 over) on a
  city-state Warrior at 19 (31 drawn, 12 over): CombatLog 18 / 32, the
  Warrior stands at 1; 1120 t13 17 / 32 (a defender at 18 HP). 197 of the
  CombatLog's melee rows (`UNIT_GALLEY` on Rome's embarked Warriors at
  DefenderStr 15 among them) log 0 for the attacker. The engines:
  `resolveMutualKill`, `meleeAttack`'s embarked arm / `_melee_exchange`.
- An attack ends the attacker's fortification: 0x1fbae0 sets its fortify
  turns to 0 (0x5707b0(attacker, 0)) once the result is made (0x205da0).
  Fortification grows only in the Fortify operation's tick (0x95ebb0,
  0x960800, 0x959830: +1 to FORTIFY_TURN_MAX), as the C-94 BUILD line says.
  The engines: `spendAttack` / `_spend_one_attack`.
- A ranged blow's domain term (0x51c810, the unit-vs-unit attack strength):
  a bombard attack (combat type 0x4fc9163d) loses
  COMBAT_BOMBARD_VS_UNIT_STRENGTH_MODIFIER (GlobalParameters +0x188, 17) on
  a defender of the land domain (+0x650 == 2,
  LESS_EFFECTIVE_VS_LAND_UNITS); a ranged attack (0x2ec4ce4d) by a land unit
  loses it on a defender of the sea domain (0, LESS_EFFECTIVE_VS_NAVAL_UNITS).
  Records: 1124 t45-77 a barbarian Slinger on Rome's Galleys logs 15 - 12
  (a +5 of its own, see below), Archers, Crossbowmen, Rangers and Field
  Cannons on ships 17 under; Catapults, Bombards and Trebuchets on ships their
  whole Bombard (1122 t99, t125, 1124 t103, t116, t198, 1128 t149, t150).
  The engines: `rangedDomainCS` / `_ranged_domain_cs` (the Giant Death
  Robot's naval clause is this rule).
- A unit's attack on a city (0x206080, melee) draws three times: 0x519370 the
  attacker's damage, then 0x519440 the district's hit points (hash
  0x5e97d629) and 0x519440 its outer defense (0x6da56a3d), each its own
  "Unit Combat Damage" draw; the defense's damage is scaled by
  COMBAT_DEFENSE_DAMAGE_PERCENT_MELEE 15 (RANGED 50, BOMBARD 100; +0x1a4,
  +0x1a8, +0x1a0). The ranged (0x204b10) and bombard (0x2074b0) attacks draw
  twice (hit points, defense) and nothing for the attacker. The log carries
  one UnitDamageChanged for the three (1117 t14: a barbarian Warrior at 27 HP
  on Valletta; the three RandCalls seeds are the replay's three draws).
- The district's hit (0x519440 builds the law's struct: +0 / +4 the two
  strengths, +8 the district's maximum hit points 0x24b290, +0xc / +0x10 the
  outer defense's damage and maximum, +0x14 the pool's hash, +0x1c
  COMBAT_MINIMUM_DAMAGE, +0x20 COMBAT_BASE_DAMAGE, +0x2d the bypass flag).
  The law 0x519090 takes v = trunc((24 + r) x expf(x) + 0.5) unclamped; on
  the hit points' hash (0x5e97d629) with the bypass flag clear and the outer
  defense standing (left = max - damage > 0) it subtracts trunc(v x t / 256),
  t = trunc(256 x left / max) (the fixed-point divide 0x16e940 and multiply
  0x16e7d0): intact walls let 1 through after the clamp. Then the clamp to
  [+0x1c, +8]. On the outer defense's hash (0x6da56a3d) the clamped damage
  is taken at its percent: melee 15 unless a player flag (0x5212f0) or the
  ram test (0x51af50, the district's +0x1910 against the support's tier)
  gives 100; ranged 50 unless the unit's +0x18c2 gives 100; bombard 100;
  times / 100 truncated. The bypass flag: no walls-ignore value and 0x51acb0
  (the Siege Tower) without the ram. The engines: `districtHit` /
  `_district_hit` (the ram and the tower as `siegeAssist`'s bits).
- A city's strike strength (0x207080 → 0x249ee0): max(PlayerStats +0x150,
  m_iMaxRangedStrengthTrained (0x4bd030), COMBAT_MINIMUM_CITY_STRIKE_STRENGTH
  3) plus the city's district attack bonus (+0x1890); 0x51c2d0 takes off
  the damaged district's loss — the wounded law (0x522630) at
  COMBAT_WOUNDED_DISTRICT_DAMAGE_MULTIPLIER 10 on the percent of the outer
  defense's damage where the district has an outer defense, else of its hit
  points'. The best ranged rises beside the best melee (0x4c1a30): the unit's
  ranged strength 0x56e3e0 (RangedCombat, row +0x6c, a Bombard is none) with
  its formation's; +0x1b0 the best Bombard (0x56daa0) beside it. Records:
  1120 China's cities strike at 25 from t50 (an Archer made), 40, 60, 70 as
  Crossbowmen, Field Cannons and Battleships come; a city-state that made no
  ranged unit strikes at 3 (t217-219). The engines: `cityStrikeStrength` /
  `_strike_strength`, `Seat.bestRangedCS` / `civ_best_ranged`.
- Flanking (0x521530) and Support (0x521ed0, 0x5228c0) are gated on the
  player's m_bMilitaryCombatAdjacency (+0x1268), which only
  EFFECT_GRANT_COMBAT_ADJACENCY sets (CIVIC_GRANT_COMBAT_ADJACENCY_BONUS on
  Military Tradition) — every player's own, a city-state's and the
  barbarians' included (1117 t23: a city-state holding Military Tradition
  flanks a barbarian Warrior, 32 / 22 where +2 lands and 30 / 24 without;
  1124 t38 CombatLog: a barbarian Warrior at 68 HP beside a second logs +4,
  its +5 less the wound plus one flanker). The engines: `flankSupportLive`
  / `_flank_support_live` read each player's civics.
- Not explained by this reading (C-94 ASK): a +5 a barbarian unit carries on
  some attacks and not others (1124 t14 a Spearman and a Warrior on Rome's
  Scout, t32, t37, t84; 1126 the Archer 2818053 on every shot t75-88; the
  same Slinger 1124 2883596 at -12 on ships and +5 on land t44-83), and a +3
  to +5 China's and the city-states' units carry against barbarians (1124
  t34, t62, t72, t102-104) — no install row (the modifiers of
  MODIFIER_UNIT_ADJUST_COMBAT_STRENGTH, the barbarian traits, the
  difficulty rows), no term of 0x51c810 / 0x51f070 read here, and the dumps'
  promotions are empty.
## H-1: the cards the luxury allocation ranks on — READ (the order), the triggers partly

- ChangeResourceAmount 0x4a7560 adds the amount and rebuilds the
  allocation (0x4a6110 at 0x4a77d4) on every call that reaches the update,
  whatever the amount (an amount of 0 rebuilds too), unless the game's flag
  +0x45e; an accumulated resource's import or export returns before it.
  Player_Resources' DoTurn step 0x4a8ed0 runs the holdings 0x4ab6e0, the
  allocation, then the parks 0x32deb0 — so a park stored at a processing
  pays beside the luxuries ranked on the park amenities before it (1121
  t243: Chengdu's 3 from its park with its 4 luxuries, Happy at its growth
  and border; the next rebuild hands it 2).
- The cards a processing re-slots at its start (the civic step before the
  resources) reach that processing's allocation; a slot rebuild during the
  city walk (a completion opening a slot: Big Ben, the Alhambra, a Shipyard's
  slot) or a card signalled in the actions does not, until the next
  ChangeResourceAmount: 1121 t222, Xi'an's Shipyard re-slots mid-walk with
  no card signalled, Liberalism and Civil Prestige laid back, and the record
  holds the luxuries ranked with their two amenities in Xi'an and Shanghai;
  1121 t196, Big Ben re-slots Xi'an's cards mid-walk and the Line Infantry
  (StrategicResource Niter) it buys after re-ranks them on the new cards —
  the unit's strategic cost (0x1856b3 / 0x185a2a) calls 0x4a7560. A Builder's
  improvement on a resource rebuilds through 0x4ab4d0 (non-accumulated
  resources only). The harness ranks each major's record allocation on the
  record before's cards where its cards moved after its walk began and no
  such rebuild followed (`luxuryCards`).
- A processing's re-slot before its walk also reaches the luxury ranking of
  that walk and the cards the walk's cities read: the government it changed
  to, its cards, the cards it laid back (1121 t168 Oligarchy -> Monarchy,
  Xi'an, Taiyuan, Shanghai bank their culture without Liberalism's and Civil
  Prestige's amenity; 1128 t202 Monarchy, Taiyuan's three luxuries ranked on
  the new cards). A completion re-slotting mid-walk reaches its own city's
  growth and border (1121 t206 Xi'an's Alhambra); 1124 t188 Chengdu's
  Alhambra reads the old ranking's amenity tier at its border (Content, the
  new cards Displeased) — the tier against the yields the re-slot moves is
  unread there (C-94 LAB).
- Founding (C-94 LAB, unread): every one of the 48 foundings that read a
  luxury at once had a city-state its founder is suzerain of take its turn
  between the founding and the record; 10 of the 16 that read none did too.
  0x44eff0 (Player_Influence, a signal on 0x4a7560) passes a city-state's
  owned-resource change to its suzerain — an accumulated resource as owned
  (+n to the suzerain, -n to the city-state), any other as an import —
  each a 0x4a7560 on the suzerain, so a city-state's strategic accumulation
  (0x4ab6e0's per-plot amounts) re-ranks its suzerain at the city-state's
  turn (1121 Hunza's two improved Horses, 1119 Granada's Iron, 1120
  Yerevan's Horses); 1117's eight (Antananarivo's Sugar, Caguana) and 1127's
  Hattusa show no such amount in the records.

## H-1: the garrison requirement — READ

GameEffects_Requirements_CityHasGarrisonUnit (REQUIREMENT_CITY_HAS_GARRISON_
UNIT, 0xbbb1a0) walks the city's districts (+0x1a48); for each that seats a
garrison (0x24b820, the districts with HitPoints: the centre and the
Encampment) 0x24b170 takes the plot's best defender (0x208b80) where it is a
combat unit (0x209dd0: Combat, Ranged or Bombard above 0) and, with a
MilitaryFormation argument (+0x90), compares the unit's formation (+0xc90).
So a unit in the Encampment garrisons the city: 1121 Xi'an t152, a Field
Cannon in its Encampment and a Guru and a Builder on its centre, Retainers
pays its amenity (civics part 2); 1124 Xiurong t168; a military unit its city's production completes garrisons from that city's turn (1124 t157 Taiyuan grows Content). `cityGarrisons` /
`_city_garrisoned` (Retainers, Limitanei, the identity rows).

## H-1: the world's carbon in the climate log — READ (the column), the scale a fit

The random-event step writes Game_RandomEvents.csv's sixteen-number row
(0x33a280): the turn, the realism, then 0x28db00, the climate's world CO2
("Total CO2"), the categories after. Read as thousands of carbon, the flood
rows' warming (ChanceIncreasePerDegree 20, CO2For1DegreeTempRise 500,000 on
Duel) picks the game's event on every step the unwarmed table missed: 1121
t189 FLOOD_MAJOR at the Tarim (285 -> 0.57 degrees, the boosted weights
22 / 16), t203 and t241 FLOOD_MODERATE at the Arno (462, 619), t198 the Cat 4
hurricane, t212 the meteor, t236 the forest fire, t245 the extreme drought;
step.eventPick 2,784 -> 2,849 passes over the 26 duels (1119-1128, the
recordings with the log), 1126 three lower where its flood rivers' order
already fails (t99, t122, t146 ...). The scale (x1000) is a fit; the
harness reads it per step (`loadCarbonLog`). Against the sum of the four
category columns (buildings', projects', routes', units' raw CO2) read
unscaled, the Total column with the deforestation factor laid back picks
2,369 against 2,334 over 1119-1128 (1119 +4, 1120 +2, 1121 +3, 1122 +6,
1123 +16, 1124 +3, 1126 +1; 1125, 1127, 1128 equal).

## H-1: a growth re-ranks no luxury; war weariness's amenities at the processing — READ

- The luxury allocation (0x4a6110) has two callers: ChangeResourceAmount
  (0x4a7560 at 0x4a77d4) and the resources step 0x4a8ed0 in Player DoTurn.
  A city's growth (City::ChangePopulation 0x1c79b0) is neither: the culture
  its border banks after the growth reads its new size's amenity need on the
  allocation its seat's processing ranked before the walk. Recorded:
  runs/h1_duelw1128 Taiyuan t182 (grown to 7 on its two luxuries, Displeased,
  banks 1175/256 x 1.35; the record after shows a later rebuild's third),
  Chengdu t196 / t202, Jiaodong t197, Xi'an t200 (each 0.9 of the re-ranked
  read); runs/h1_duelw1121 t186 (Jiaodong 6 -> 7 on its 3, Displeased), t220
  Shenyang, t238 Taiyuan. `cultureAfterGrowth`'s `luxMap` /
  `_culture_after_growth`'s `lux`; over the 26 duels step.border +~300
  passes, none worse.
- War weariness's amenity losses (0x3cda00, `warWearinessLosses`) are laid
  by 0x3d7020, whose one caller is Player DoTurn (0x4e4656, before the
  resources step 0x4e46c0 and the cities), after the turn's decay (0x3d7270):
  a city's loss stands as its owner's last processing laid it. Recorded:
  runs/h1_duelw1128 Xi'an, China's weariness 474 after its t199 attacks and
  no amenity lost at record 200, 424 after its t200 decay and one lost at
  record 201 (the growth at t200 on the Displeased tier). The ledger
  (Logs/Player_WarWeariness.csv) carries no turn: each "Attacking" row is the
  attacker's k-th combat against that player in Logs/CombatLog.csv (China's
  18, Rome's 9 on 1128), each "At War Decay" the processing the turn after
  the player's row before (`readWeariness`, `wearyAt`).

## H-1: the records' turn order — log readings (no DLL)

- The World Congress resolves at the turn change (the log's
  WorldCongressFinished row after the last player closed the turn): a
  player's processing reads the session that stood at its own start
  (runs/h1_duelw1128 China, the Border Control Treaty's target from session
  161: banks 161 -> 162 in its turn before the session, holds from 162; its
  t181 start draws no next plot under the treaty session 181 ends).
- A citizen a record caught idle stays idle through its city's processing:
  the citizen manager places it only on a reassign (a growth, an annex, the
  AI's focus change). This REVERSES the harness's earlier reading that the
  processing places every idle citizen (1108 Xi'an t207, 1114): on the 26
  duels the new reading loses no pass and wins 1123 Xi'an t175-181 (one idle
  for seven turns, the growth banking its surplus), 1128 Nazca t59 / t157 (a
  Lighthouse, a Shipyard bought in the processing, their slot empty at the
  growth), 1117 Rome t222 / t223, Xi'an t231, Valletta t92 / t149, 1119
  Johannesburg t48 / t156, Akkad t76 / t157. The engines' turn still places
  them (`placeIdleCitizens`; AUDIT C-94 LAB).
- The event step's fire forms (burning, burnt +1 Food, regrown +1
  Production) stand before the in-turn player's start (runs/h1_duelw1127
  Rome t57: its Rainforest regrown at t58, the growth on surplus 7).
- An era's age reads the score at the turn change: a moment with an id past
  the player's MOMENT_GAME_ERA_STARTED_* counts toward the new era
  (runs/h1_duelw1127 Rome t150: 19, a Dark Age, the new era's first
  technology after it; runs/h1_duelw1108 Rome t180: a great person's +1
  before it, 62, a Golden Age).
- The "Random River" draws fall on the turn a river first lies in a major's
  plots', cities' and units' sight at the close of a turn — the look from the
  next record's positions — not on its first revealed plot: runs/h1_duelw1128
  draws t1 x3, 14, 37, 46, 74, 93 against sight 1 x3, 14, 22, 46, 74, 93
  (river 3's t37 the one miss), runs/h1_duelw1127 t1 x2, 2, 28, 58, 105 all
  six; the records' revealed plots name river 2 of 1128 at t45 (no draw).
- The deforestation band the flood rows' warming lays back off the climate
  log's carbon ("H-1: the world's carbon in the climate log") is the turn-1
  map's removable features' (`removableAtStart`): runs/h1_duelw1127 t225 and
  t244, each pick on its recorded river.

## H-1: the levy's term — READ

- Player_Influence 0x44da30 (the minor's levy counter, m_iLevyTurnCounter
  +0xc90): +1, then against 0x5254d0(LEVY_MILITARY_TURN_DURATION, GP
  +0x450 = 30) — the speed's CostMultiplier, 15 online, not
  GameSpeed_Durations' 21 — and at it the levied units go home (0x4502b0);
  0x4501c0 resets it at the levy. The counter ticks at the minor's own turn
  starts, the first the one after the levy in the same game turn: every
  recorded levy that ran its term came home 14 turns on (
  runs/h1_duelw1117-1131, the log's UnitRemovedFromMap / UnitAddedToMap
  pairs; 1117 t28 -> t42, 1121 t42 -> t56). The engines: `LEVY_TURNS`
  (`scaleByGameSpeed`), `levyEnds` = the levy turn + LEVY_TURNS - 1 read at
  the minor's start (`minorLevyReturn`, `_minor_levy_return`).

## H-1: a minor's research catch-up — READ

0x4cb930 (techs; civics 0x39ec60, the same body), called from the handler
0x427bf0 that every player's object runs when a player gains an item
(`player`, `item`): where the gainer's CivilizationLevel is FULL_CIV
(0x469db0, hash 0x253718b0) and the receiver lacks the item (0x4cb2f0 /
0x39d1f0) and is neither FULL_CIV nor TRIBE (0x469ce0, 0xd959ec24) — a
city-state or the Free Cities — it counts the players of the game's list
+0xb50 (the list 0x14f530 reads for the barbarians' techs: the majors in
the game) holding the item, and where at least max(1, (len + 1) x 50 / 100)
do (the immediate 0x32), sets the receiver's progress on the item to its
cost less one ((cost << 8) - 0x100 through 0x4cc950 / 0x3a1fb0), the item
in hand or another. Records: runs/h1_duelw1121 Rome's Code of Laws at its
start of t4 puts every minor's and the Free Cities' at 9 of 10 (the log's
CivicChanged for players 2, 3, 4 and 62 just before Rome's
CivicCompleted), its Pottery at t6 theirs at 11 of 12, Bronze Working at
t22 Antioch's 10.5 at 39 of 40; China's Craftsmanship at t11 completes
Ayutthaya's from 8.98 of 20 at its own start; 1124 Rome's Mining at t17
Cardiff's at 11 of 12. A major's progress is not touched (China's Code of
Laws 4.59 of 10 at 1121 t4). The engines read it at the minor's turn
(`minorCatchUp`, inline in `_minor_research`) and never lower the
progress; MINOR_CATCHUP_PCT is the 50.

## H-1: a city-state meets a major by a look — PARTLY READ (the records)

A city-state and a major meet when a look of either takes in the other:
the major's unit sees a plot of the minor's or a unit of its (1121 t33:
Rome's Warrior two plots from Ayutthaya's Warrior, six from its border;
1127 t15: Rome's Warrior two from Muscat's), and the minor's unit steps
where it sees a plot or a unit of the major's, or where the major sees it
(1124 t10: Granada's Warrior beside Xi'an's coast and China's Builder; the
first meeting's envoy, `InfluenceGiven`, lands at the step, `DiplomacyMeet`
later in the turn). The engines: `revealAround`'s meeting and
`minorLookMeets` / `_reveal_around`, `_minor_look_meets`. Not separated by
these records (C-94 LAB): the line of a look across a ridge of two plots
(1124 t28: Cardiff's Warrior at (7,11) and China's Scout at (6,12) met; the
engines' line between them takes the Rainforest at (7,12) and blocks).

## H-1: the Great Bath's Faith per flood — READ

The plot yield's per-flood term (0x539645, inside the plot-yield builder
0x538a60): when the owning city's `m_aYieldPerFlood` (City +0x2728, filled by
EFFECT_ADJUST_CITY_YIELD_PER_FLOOD, the Bath's GREATBATH_FLOODFAITH Amount 1
Faith) is above 0 for the yield, 0xa2b810 walks the river vector in order and
returns the id of the FIRST river whose floodplain plot vector (+0x28..+0x30,
`m_aRiverFloodPlains`) holds the plot (-1 none); 0xa2b4f0 finds that river's
record; 0xa2b410(record, -1) counts every flood its record holds (+0x78..+0x80,
stride 0x10; a negative filter counts all). The yield adds amount x count.
No per-plot count exists: a plot's floods are its home river's, before the
Bath or after, and a plot in no river's list takes none. Ships as
`floodHome` / `countFlood` (GPU `_flood_home`). Confirmed on the two recorded
plots that lie in two lists: runs/h1_duelw1131 Beijing 534 (rivers 0 and 1)
reads 1 Faith at t96 after floods of both (the first river's alone: 1; every
list: 2), 2 at t122 after river 0's next; runs/h1_duelw1126 473 (rivers 1
and 6) reads 0 at t54 after five floods of river 6, 1 at t59 after river 1's
first (the last list's count would read 5).

## H-1: an unread record's random-event step — the harness

A record whose counter moved while it was dumped is not read, but its
witnesses bracket its own turn's step (`T-1:63:post`, `T:0:pre`) and its
units stand where the step struck: the event replay runs that step on the
read record before it and lands what it laid at the next read record
(`replayEvents`, `unread`). runs/h1_duelw1131: record 5 unread, record 6
missing; the t3 dust storm's last walk at t5 lays 229 and 272 +1 Production
(plot.yields 377 -> 39, city.centreYields 122 -> 0 on Handan's centre 272),
its steps landing on the game's log.

## DLL rules the engines contradict

- The wounded law (0x522630) on a unit's strength in a fight: the engines'
  `woundPenalty` / its GPU twin round 10 - HP/10 (AUDIT C-94 BUILD); the
  garrison term reads the law.
- Lifetime culture (0x3a1fb0) grows by every gain of civic progress, a
  boost's share included, and not by culture held with no civic chosen: the
  engines' `cultureTotal` / `civ_culture` sum the culture yield (AUDIT C-94
  BUILD; the H-1 importer folds the game's rule).
- The citizen placement (0x197230, "H-1: the citizen manager's placement"):
  the engines' `assignWorkedTiles` / GPU walk score FOCUS_BASE and place
  every citizen afresh (AUDIT C-94 BUILD).
- A move onto a religious unit (0x26fe20): the engines' melee order onto
  one only shares its plot (AUDIT C-94 BUILD).
- The high-adjacency moment reads District::GetYield's flat bucket (+0x2f0)
  and appeal rows (+0x458) only as Nan Madol's Culture (docs/AUDIT.md, the
  Harness section's Moments BUILD line).

Every other rule read above ships on both engines.
