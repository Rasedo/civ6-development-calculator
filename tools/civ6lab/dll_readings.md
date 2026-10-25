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
Every address cited here has a record in the DLL atlas (`atlas.py <addr>`:
the function's bounds, source file, FinalRelease twin, callers, the
curated record; `atlas_check.py` holds the two in step).

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
the table's loader). `dll_emu.py` runs a leaf routine of the shipped DLL
under the unicorn emulator (`pv`: the AI's present value) to check a port's
arithmetic against the code itself. `dll_luabind.py` lists a Lua registrar's bindings with
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
  rebuild laid it pays nothing while it is listed. The engines carry the
  slots on the per-seat action as the slot LAYOUT (`policies`: per slot,
  grouped by kind, a card or -1; `policyLayoutOf` / `_policy_slots_of`, the
  GPU's `civ_policy_slot` a card's kind and ordinal): a card in another
  slot than before came off and went on again and pays, a lapsed one left
  in its slot stays lapsed. runs/h1_duelw1121 China t31: Autocracy's
  rebuild lays Survey (Military) and Urban Planning (Economic) back
  lapsed; the AI slots Discipline, Caravansaries in the Economic slot,
  Diplomatic League, and Urban Planning in the Wildcard, which pays its +1.
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
  player's start (0x4580b0 through UpdateMaxMeleeStrengthTrained 0x4c1c10,
  which raises to its argument: the start era's row +0x40 or +0x44,
  StartEras StartingMeleeStrengthMajor 20 / StartingMeleeStrengthMinor 25
  in the Ancient era, the ranged at +0x50 / +0x54; the operations' desired
  strength 0x723ab0 reads the stat, 1117-1128's city-states 25 before any
  unit they train beats it — the recruit lines' 25 / 12.5, 0x16e7d0 on City
  Defense's ongoing 1 and Attack Barb Camp's 0.5), raises it to
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

## C-96: the AI's promotion choice (0x77ac30, 0x774970, 0x7b5d70) — READ, ported for the city-states (the modifiers' term unread)

The tactical move Promotion (0x77ac30): each unit of the pool (+0x240)
alive (+0x770 clear) with a promotion due (0x116f80 on +0x1bc0) joins the
move list (logged "Promote" in AI_Tactical.csv); 0x774970 then runs each:
over the UnitPromotions rows in database order that the unit can earn
(0x55d750), the row's modifiers gathered (+0x28) and valued by 0x7b5d70
(start 0, the horizon [GlobalAI+0x2f0][0], the discount 0x6fec30); the
first row strictly above the best so far (from 0) is taken. 0x7b5d70: past
the horizon -9999, 0 where the unit cannot earn it; else a = the military
AI's unit value of the type ([player+0x1290]+0x268, 0x79ca90) x min(unit
+0xcf0, global +0x328) / its max hit points, PV(horizon) - PV(start), plus
max(the modifiers' sum 0x7a4b20, 5 x the row's +0x24); the a term is the
same for every row of a unit, so the pick is the first row with the
greatest max(modifiers, 5 x +0x24). Operation Protect Units (0x80d790) and
0x70fae0 take the same value. Unported: the promotion modifiers' analyzers
(AUDIT C-96). The row's +0x24 read as its Level: every city-state pick of
runs/h1_duelw1117-1128 is the first row of the highest Level it may take
(melee Battlecry, then Commando; ranged Volley; siege Grape Shot; light
cavalry Caparison; heavy cavalry Charge; naval ranged Line of Battle).
Ported: `aiPromotionPick` and the city-states' tactical Promotion after
Attack Medium Priority (Tactics.xml's "Minor Civ Tactical"; GPU
`_tac_promotion`); the barbarians' lists hold no Promotion and the records
log no barbarian promotion; the majors' and Operation Protect Units' use
not ported.

## H-1: the World Congress slate (0x598270) — READ

The session setup, at the session itself, lists the resolutions in their
era (EarliestEra / LatestEra at row +0x68 / +0x98 against the game era)
that the Lua `CanUseResolutions` allows (WorldCongress.lua: World Religion
with a religion founded, the Luxury resolution with a luxury on the map),
split by InjectionOnly (row +0xb8, `dll_rowmap.py 0xa6a7b0`): of the rest,
in the database's order, min(3, n) "World Congress Resolutions" draws, each
over what is left and removing its pick (0x59a680), the first two the slate
voted at that session, the third drawn and dropped; then ONE draw over the
InjectionOnly rows (the Diplomatic Victory resolution, Modern on: a lone
row, a draw over 1). runs/h1_duelv1127: t61 10, 9, 8 -> 1, 1, 5 (the Trade
Treaty, World Religion voted; Sovereignty dropped), t81 10, 9, 8 -> Border
Control, Sovereignty; t121 12, 11, 10 -> Military Advisory, Mercenary
Companies (Mercenary Companies held at t101 too: no repeat rule); t161 14
(Modern: World Religion out, Heritage, World Ideology, Global Energy in)
-> Urban Development, Luxury; t181 13 (Atomic) -> the Espionage Pact, the
Trade Treaty; t221 10 (Information) -> Mercenary Companies, the Global
Energy Treaty — each the session's voted pair. A second 0/1 from t161 is
0x596b40's (called from 0x599275): it walks a database collection
(0xad5430: the game's +0xb40 table), keeps each row whose byte +0x48 is
set and +0x50 non-null and whose live record (0x27a680 -> 0x25bef0 on the
row's +0x20) reads -1 at +0x0 and +0xc — not in play —, weighs each 1 and
draws ONE "World Congress Resolutions" pick over them (0x59a540), appending
the pick at +0x310. The scored competitions fit it: the EmergencyAlliances
rows of Trigger EMERGENCY_TRIGGER_WORLD_CONGRESS (Expansion2_Emergencies.xml)
whose TargetRequirementSet's game era holds (the World's Fair Modern only,
the World Games from Atomic, the Climate Accords from Information, the Space
Station from Future; the Nobel Prizes need TRAIT_CIVILIZATION_NOBEL_PRIZE).
1117 / 1118 / 1121 all draw it at t161, Game_Emergencies.csv's World's Fair
STARTED at t162 and SCORED ENDED at the next session (1117 t181, both
players SCORING), the World Games t182 - t201, the Climate Accords t222 -
t241, the Space Station from t242; at t181, after the step, China (player 1)
draws two "Choosing random civic boost to grant based on era" — the World's
Fair's top tier (WORLD_FAIR_TOP_TIER_CULTURE, MODIFIER_EMERGENCY_PLAYERS_
GRANT_RANDOM_CIVIC_BOOST_BY_ERA, Expansion2_Emergencies.xml). The table's
row order is the database's EmergencyAlliances order (LAB: +0xb40 unread).
The "Random congress resolution target" draws after them (16 sites,
0x611140..) are the AI's targets. The engines (`drawCongressSlate` /
`_congress_draw_slate`) follow: the slate's pool the install's resolutions
in their order, the competitions `CONGRESS_COMPETITIONS`, every living
major the field.

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
  best-scored plots (stable order) — the job "Barbarian Camp Evaluation", one
  per region entry (0x14fd6f, the jobs waited on at 0x14fe72). "Barbarian camp region placement" weighs
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
  THE COUNTS (READ): "under 5 units" and "short of its scout" read the
  tribe's own counts, not its living units: +0x34 (zeroed at the tribe's
  init 0x147fc0, the defender 0x144940 uncounted) grows by each unit the
  melee and ranged raises place (0x144b20 / 0x144bf0 at 0x144bb8 /
  0x144c88), the operation's asked units (0x144fb0 straight, 0x148af1) and
  the siege and support raises (0x144e00 / 0x144ed0) uncounted; +0x28 by
  each scout 0x144cc0 places (0x144dc4). Only a battle lowers them
  (0x1540b0 -> 0x148e90, the dead unit the barbarians'): a scout (AI type
  +0x1c0 2) +0x28 by one and its wait +0x2c to 0; any other but a support
  unit (formation class 1) +0x34 by one (no other write to +0x28 or +0x34
  in 0x144000..0x156000). A unit gone any other way — disbanded, converted
  or captured — still counts, so its tribe raises none in its place (runs/h1_dueld*
  full games: the engines' extra recon units 92 of the barb.unit misses).
  The engines: `BarbTribe.unitCount` / `scoutCount` (`tribeTurn`,
  `raiseCamp`, `barbBattleBoldness`; the replay's `adoptByTribe` counts a
  recorded raise) / `tribe_unitn` / `tribe_scoutn`.
- Raids: "H-1: the raids" below.

- THE MOST CAMPS (+0x110, READ): an AutoVariable (+0xb8, its value at
  +0x110) the manager's init writes once (0x153659: the game's +0xb50 list
  of the living full civs, its count, times GlobalParameters
  BARBARIAN_CAMP_MAX_PER_MAJOR_CIV +0x7c, read at 0x2d5d0e; 0 under
  NO_BARBARIAN_TRIBES), so a major's elimination lowers nothing. The
  standing camps +0x170 (m_numCamps) rise at a tribe's creation and fall at
  its camp's removal (0x154874). The unseen land: 0x50b2d0 on FULL_CIV
  (0x253718b0) walks every living player (+0x50) but a tribe (0xd959ec24)
  and a city-state (0xc2577075, 0x469de0's), so the Free Cities' sight
  counts with the majors'. The engines: the game's majors x the parameter
  (`campStep`'s `state.seats.length`; `n_majors`), the majors' and the Free
  Cities' sight (`plotsSeenNow` with FREE_SEAT; `_barb_seen("fullciv")`).

- THE UNSEEN LAND (READ): the camp step counts the land plots (0x834d0 not
  water) on which 0x50b2d0 finds no player of the class seeing: per living
  player of the list (+0x50) its team's visibility (the visibility
  manager's +0x30 by the player's team +0x128, or +0x48 / +0x50) count
  array +0x290 above 0 at the plot — what the team sees now, not what it
  revealed. Barbarians.csv logs it each turn ("Land Plots", "No
  Visibility"). The counts' writers (0x508d50): a unit's sight walk
  (0x58f3f0 -> 0x58b1d0), a plot's owner on the plot and its six
  neighbours (SetOwner 0x84760), an improvement's owner (0x362ec0 ->
  0x84340, the camp's ring); and a player's outgoing visibility added to
  another's (0x508330, Lua AddOutgoingVisibility) by the suzerain's update
  (0x451b20, "Attempting to update the suzerain") and by alliances
  (0x2ab4f0, "Permanently Allied" 0x2aba80): a major sees what each
  city-state it is suzerain of sees, the minor's units' sight with its
  plots'. runs/h1_dueld1128: "No Visibility" 267 -> 212 the turn China
  takes Hong Kong (t64), 49 -> 88 below the engines' when it takes Granada
  (t97), the gap again at Bologna (t242). `cpu/harness/sightLab.ts` (the
  engines' unseen land of each record against the log), the five dueld
  duels' 1,245 turns: 206 equal without the share, 454 with the minors'
  plots alone, 1,065 with their whole sight (the residue a turn's moves:
  1128 t25's +28 the turn China's reveals take Hong Kong's centre and
  ring). The engines:
  `plotsSeenNow` (a seat's suzerain city-states join it), the GPU's
  `_barb_seen` (`shared`, per game). Alliances' share is not ported (no
  alliance in the recorded duels).
LAB: the sight the score and the target read is the engines' line of sight
plus each centre's two rings and each owned plot's ring and the shares
above — a fit, its unit and plot writers read.

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

## H-1: the raids — READ

`barbarianScouts` / `barbScoutLook` / `barbBattleBoldness` in
cpu/core/barbarians.ts, the operations and the scout's tree in
cpu/core/barbarianOps.ts; `_barbarian_scouts` & co in gpu/core/sim_barb.py,
the operations and the scout's tree in gpu/core/sim_barbops.py.

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
  The queue holds the classes' names, not unit types: the raise 0x144fb0
  (its flag +0xe0 clear, the tribe turn's) resolves the name through
  0x147470 — the class's units the tribe may raise, the best — when it
  raises (runs/h1_duelw1127 log t34-35: tribe 4's ranged asks raise Archers
  the turn China holds Archery, asked for before it). The engines: the
  queue's classes (`BarbTribe.queue` / `tribe_queue`, the export's tag
  order), `raise` / `_barb_raise` by class.

Cases (the log's rolls tell a queue spawn from a clock one): 1124 camp
(40,21): its scout home at t8's pass, then t9 W, t10 W, t11 S, t12 S with no
"Barbarian Ranged unit roll" for them, the clock back at t19 (t12 + 7); 1117
camp (9,24): home at t9, t10 W (no roll), t11 W, t12 W, t13 S, t14 S, the
clock at t21 with its roll; 1124 camp (41,7): home at t22, t23 W, t24 W, t25
W, t26 S, t27 S, the clock at t34. StandardRaid (2 melee, 1 ranged) fits all
three only if a unit raised in the turn is not yet recruitable (W at t7
recruited at t8, the t9 W not at t9): LAB — the recruit's list (0x60a8c0,
unread) taken by the player's first job (0x5c2650, before the tribes' turn in
0x6096c0) would not hold a unit raised in the turn. The raid's end: "C-95: the
barbarians' raid" (its tree's Notify Owner lists the city for the assault).
The recruit's request (0x7c7580 -> 0x60a8c0, the unit evaluator +0x12d0)
walks the player's units (+0x12e8 -> +0xd8) unassigned (+0x7d0 -1), alive,
and the operation's units it took are then listed (0x6092c0) and join in
that order (0x737e80): the pool's slot order (runs/h1_duelw1127 t35: Warrior
2162693, slot 5, taken before 1835024, slot 16, the older). The tribe's
request (0x7c62f0, its vtable @d72bb8) walks that list: a unit of the tribe
(+0x11d0) of each class (0x8c2880 on the force's class lists, never
CLASS_ZOMBIE) fills the class's count in order; the class full, it takes the
place of the first held one with more damage (+0xcf0, strictly) — 1121 t11:
Horseman 851980 (whole) displaces 655369 (20 damage) beside 720906.

- The report's event: 0x153ef0 is bound (0x153b0d) to the game signal at
  signals +0x10c8, which the unit sight update 0x58aa90 raises per plot
  when 0x508d50 (Player_Visibility_Manager, the count change) answers 2:
  the plot's visibility count for the unit's OWNER went from 0 to more —
  newly visible to the barbarian player, not to the scout alone. A move
  (0x586d40 → 0x58f3f0 with add) adds the new sight before it drops the
  old, so a plot both sights hold raises nothing. The engines: the scout's
  plots in sight now, not at its last look, that no other unit of theirs
  sees (`barbScoutLook` / `_barb_scout_look`), a civilian of theirs (a
  capture) counted for none — LAB, a fit: runs/h1_dueld1128 t76, the
  Builder Capture's Settler 2228251 (sight 3) on 13:14, three plots from
  the Farm on 15:12, and the new Skirmisher 4259868's step to 15:14 starts
  the scout's tree all the same ("Barbarian Found City" in the AI memory
  reader's end look, the raid "Started" at t78); which of the captive's
  sight sources the count leaves out is unread. The throttle write follows
  0x1485c0 whether or not a tree starts, on a plot of an improvement or a
  district alone ("C-95: the scout's tree").
- Protect Unit ("Barbarian Found City" node 3, a Concurrent with Move
  Unit; TreeData Damage Percentage .25): its check 0x7f07c0 counts the
  node's units whose damage (unit +0xcf0) is at least that share of their
  health (0x56e0d0) AND whose plot reads above 0 on the AI's influence map
  (player +0x12d8, 0x716a90 — its builder unread); any such unit and the
  node answers 2, the concurrent's Move Unit and Notify Owner wait. Case:
  1121 camp (3,19): its Scout reports at t23, takes 47 from China's
  Warrior at t24, stands home at t25 three plots from it and raises no
  raid (none at boldness 10 on t26 either); home again at t33 with no
  enemy within four, the raid starts at once (Warriors t34, t35, t36, its
  t28 Archer counted). The engines read the danger as the tactical pass's
  danger map on the scout's plot (`dangerPlane` / `_danger_plane`; "C-95:
  the scout's tree").

## H-1: the sight rule — READ (the walk 0x58b1d0, emulated); a city's look — READ

0x58b1d0 (Unit_Sight; callers the unit sight update 0x58f3f0 / 0x58f170,
the explore counts 0x70a6c0 / 0x70a8b0, two range-attack previews) builds
a unit's (plot, ring) sight list; its arguments the range (edx), the
eye's x, y, then seeThroughFeatures, seeThroughTerrain and the list. It
zeroes a carried-height array over the map and walks rings 0 .. range + 1
in axial steps (0xeff670 dq 0 1 1 0 -1 -1, 0xeff688 dr 1 0 -1 -1 0 1):
each ring starts one step in direction 0 past the last ring's end with
direction 1, and turns to the next direction (0xeff6a0) where a step
would leave the ring. Per plot on the map:

- its parents: the two neighbours the six-way switch on the walk's
  direction names (direction 0: 1 and 2; 1: 3 and 2; 2: 3 and 4; 3: 4 and
  5; 4: 5 and 0; 5: 1 and 0), a parent counting only on the map at hex
  distance ring - 1 from the eye (0x58ae50, the wrap's shorter way); a
  parent's stored value at 2^24 or more is split, the bit dropped;
- its own height (0x58d1c0): the terrain's SightThroughModifier (+0x34)
  unless seeThroughTerrain plus the feature's (+0x44) unless
  seeThroughFeatures (Sentry), both 0 on ring range + 1;
- the carrying parent: with the first missing the second; with the
  second missing or the two equal the first unless it is split; else a
  split first gives way to the second, a split second to the first; else
  the line a*X + b*Y + c from the eye's centre to the plot's, in 24.8
  fixed point on the WRAPPED coordinates (X = x * 256, plus 128 on an odd
  row; Y = y * 256): the parent nearer it by more than 0.05 (12) carries,
  and within that both — the lower carries, and the plot is stored
  max(lower, own) + 2^24 when the higher exceeds its own, else its
  own;
- one carrying parent: stored max(own, its value); the plot is listed
  when that value is below its own, or no higher than the eye (0x58af70:
  the terrain's SightModifier +0x30, 1 on a city centre or a complete,
  unpillaged district with ZOC and HitPoints — 0x24c2f0, the Encampment
  and its replacements) and the ring is not range + 1; no carrying parent:
  stored its own, unlisted.

Checked by emulation (unicorn, the callees answered with the map's
heights, `tools/civ6lab/dll_sight.py`):
`losDisk` (cpu/core/fog.ts) and `sight_tables` / `sight_walk`
(gpu/core/simbase.py) list the same plots as the DLL on every plot of
runs/h1_duelw1127 t2 and t100, 1117 t60 and 1121 t150, ranges 1-5, Sentry
off and on (45,760 looks). The records: 1127 t2 Rome's Settler (36,13)
leaves the Mountain (34,14) dark, 1127 t30 China's Settler (12,7) sees
the Grassland (13,10) past the Forest (12,9), 1117 t2 Rome leaves plot 716
dark — each as recorded, each misread by the former two-line rule.

A city's look is not this walk (no city caller): it is its plots' owner
writes (READ). SetOwner 0x84760 calls the visibility count change 0x508d50
for the new owner on the plot and, through the plot's neighbour walk
(vtable +0x58), on each of the six beside it — no line of sight. A city
founded owns its centre and first ring, so it reveals the plots two round
its centre and nothing three out; a city taken, its plots and their ring
(`cityLook`, `_city_look`). Case: the records' foundings on a plot the
Settler already stood on (runs/h1_duelw1103–1131): of the 193 plots three
from the centre no unit had revealed, none revealed, the line clear or not
(1117 t1 Rome at (12,19): (12,16) across flat ground dark to t3; 1127
Xi'an (13,9), 1121 Rome (33,11), (34,11)); the ring-3 plots a founding after
a step shows are the Settler's own look (BaseSightRange 3) from the centre.
A major meeting a city-state sees its centre and ring revealed (32 of 32
meetings; plots past the ring dark on 8; `meetCityState`).

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
| Selecting a random new quest (+ its type pickers) | 12 / 11 (11 / 8) | after step (the game era's change), act (a meeting) | rule |
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
names, the antiquity sites' eras and the artifacts — AUDIT C-74 BUILD. Every value is ((state' >> 16) · range16) >> 16 (46,082 of 46,082).

What the log settled:
- The random-event step is the run of step draws holding the gap's last
  "Random Event Roll" (`loggedStep`): the game era's quests ("Selecting a
  random new quest": t31, t61 ...) and an era's boosts may
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
- The turn end's cap (Player::Processor::DoTurnDeactivate 0x7eb60 ->
  0x4e4ad0, which tail-jumps to Player_Resources 0x4a8f10): for each
  accumulated resource, the stockpile less the player's reserved amount
  (0x4aa530, m_aiReservedResources +0x528), where that is above 0, is
  tested strictly over the cap (0x4aabe0: 0x5254d0, the game speed's
  scaling, of the Resource_Consumption row's StockpileCap, plus the
  player's per-resource extra +0x858 the Encampment buildings' modifiers
  raise) and handed back to it through ChangeResourceAmount (ownership 0,
  amount cap - (stock - reserved)) — a rebuild. A bank at the cap is not
  over it. Online the cap is 25 before the buildings.
- A city-state under a suzerain banks no income of its own (the suzerain
  holds its resources, LOC_CITY_STATES_SUZERAIN_DIPLOMATIC_BONUS): runs/
  h1_duelw1121 Hunza, Horses 29 a turn (the cap's 25 + two Pastures' 4) at
  its AI turns t30-t40, 25 every turn from t41 (its suzerain, player 1,
  set during t41), Equestrian Orders 27 -> 37, 56, 75 as logged
  (`stockpileIncome`, `_seat_stock_income`; the income writer unread).
- A district on the resource accrues once complete (0x4aa8e0: the plot's
  district complete, 0x811b0, and not pillaged): yet runs/h1_dueld1128 /
  h1_duelw1128 Nazca, its Holy Site placed on its Horses at t14 (the record's
  t14, incomplete), complete in t15's production (complete in the record's
  t16), lists Equestrian Orders 5.0 at t15 (4 Horses), then +2 a turn (7.0,
  10.0 ...), where ours accrues from t16 (2) — ASK: the 4 the turn the
  district completes.
- The reservation (City_BuildQueue 0x17f3a0 from the front check 0x17f070):
  a unit at the queue's front with a strategic cost and no progress
  (0x17d1a0) reserves its cost (0x4a7400) where the player's amount less
  its reservations covers it (0x4aa790), else leaves the front; the
  completion (0x1856b3 / 0x185a2a) releases the reservation and charges
  the stockpile together.
- What the recorder's rows tell: LuxAllocNone [owner, city, row] stands at
  the owner's next activation (a `false` activation, the AI's re-entry, does
  not process the turn) and a rebuild that hands the new city nothing reads
  the same — of the founding windows on the 162102Z / 194856Z
  re-recordings, every None row whose city a full rebuild would serve
  nothing agrees with a rebuild; the per-city luxAlloc of the records is the
  measure. The founded city's luxuries (the harness's `foundedUnallocated`,
  the triggers above) agree with the records' luxAlloc on 124 of 128
  founding windows over the re-recorded 1117-1124 and 1129-1131, and on
  all of 1103's (194856Z) with Hattusa below. A suzerained city-state's
  unit upgrade re-ranks nothing (1123 t82 Brussels, 1125 t105). Open: 1119
  t93 (China's turn end hands Iron back with Handan's Man-at-Arms at its
  front, the bank short of it in the replay), 1120 t95 (the bank over the
  cap a turn early: the record read before China's start), 1123 t91 (a
  Cattle centre ranked one copy, the record none), 1131 t53 (Hunza's turn
  re-ranks China: its Swordsman upgrade or its new technology); on the
  earlier recordings 1125 t157 (China's turn end with Jebel Barkal
  completed and Crassus spent, the bank under its cap).
- Hattusa's suzerain (Expansion2_Leaders.xml, MINOR_CIV_HATTUSA_<R>_RESOURCE_XP2:
  MODIFIER_PLAYER_ADJUST_FREE_RESOURCE_IMPORT_EXTRACTION Amount 2 under
  PLAYER_HAS_NO_IMPROVED_<R>, REQUIREMENT_PLAYER_HAS_RESOURCE_IMPROVED
  inverse and REQUIREMENT_PLAYER_HAS_RESOURCE_VISIBILITY) banks 2 a turn of
  each strategic it sees and improves nowhere: runs/h1_duelw1103 (194856Z)
  China with no strategic source rebuilt at its turn ends t64 and t92, its
  bank over the cap.
- Unread: what rebuilds it at a policy change (the records: 9 of 9 policy
  changes at the processing's start re-rank the cities' luxuries before
  their growth).

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
  `governorPhase` = `governorClocks` then the record's governor verbs
  (`applyGovernorActions` / `_governor_apply`), after the Culture
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
- Game_Quests 0x939980 gives a city-state's quests: "H-1: the city-states'
  quests" below.
- A record read before its player's start of the turn (its event log holds
  rows of the turn but no PlayerTurnActivated of the recorder's player:
  1117 t168, 1118 t101, 1119 t4 and t112, 1120 t95, 1121 t134, 1122 t108,
  1123 t101, 1124 t196) shows the city's culture and next plot as the turn
  before left them; the next start's stored plot is the one that start drew
  (runs/h1_duelw1120 t96: Rome claims 1051, the t95 pick).
- A plot a city gains in its owner's actions, after its start (a unit's
  move: runs/h1_duelw1120 t161, Xi'an's stored 275), is no culture claim:
  the city holds no next plot after it.

## H-1: the city-states' quests — READ

Game_Quests (Quests_Manager.cpp, the logics in GameQuests/Quests_Logic_*.cpp).
A quest record (stride 0x24): +0 state (1 standing, 2 completed, 3 failed),
+4 the client (the minor), +8 the actor (the major), +0xc the type, +0x10
its id, +0x14 its start turn, +0x18 its completion turn, +0x1c its target.
The standing list is +0x110 (data +0x168), the completed one +0x188 (data
+0x1e0; 0x939f70 moves the completed records there and drops the failed).
Check: `tools/civ6lab/dll_quests.py` replays every quest draw of the 29
duels from the records (the types' validity and targets at the moment of
each "Selecting a random new quest" and its picker, against the logged
range): select 335 of 341 ranges where the log holds a draw at the pair's
turn, pickers 261 of 264; 18 logged draws the records do not explain and
12 the reading gives that the log lacks (records a turn apart, a quest's
completion read off two records).

- The logics, registered in this order (0x93aaa0): Convert Capital to
  Religion, Send Trade Route, Clear Barbarian Camp, Train Unit Type, Zone
  District Type, Trigger Tech Boost, Trigger Civic Boost, Recruit Great
  Person Class — the Quests table's rows. Each logic's vtable: +0x8 its
  type name, +0x10..+0x20 its texts, +0x38 its signal hooks, +0x40 its
  validity, +0x48 its picker, +0x50 the reward (0x84a0e0: the actor's
  Influence gives ONE token to the minor), +0x58 the failure note.
- Who is given one (0x939980, client edx, actor r8d): 1 − the pair's
  standing quests; the type of the pair's last COMPLETED quest (its highest
  completion turn) skipped; each logic kept where IsValidToStartQuest
  (0x849110) holds: the type known, client != actor, both alive (+0x728),
  the client a minor and the actor a major (Influence 0x449cc0 / 0x449940),
  the client has met the actor (0x3daaf0) and is not at war with it
  (0x3dcec0), then the logic's own test; weight 1 each; one draw "Selecting
  a random new quest" over their count (0x152eb0), the type's record started
  (0x849400: state 1, the ids, the turn) and its picker (+0x48) run.
- When: the game era's change (0x93ac50, registered on GameEras' signal when
  the game has eras, the player era's 0x93ad80 otherwise): every player as
  client, in the players' order, with every player as actor; a meeting
  (0x93ae70): both directions. Nothing else gives a quest: no cooldown, no
  expiry — a pair whose quest ended waits for the next era or meeting
  (runs/h1_duelw1117: t13, t17, t31 era + a meeting, t61, t91, t151, t161
  a meeting, t238).
- The types, validity (+0x40), target (+0x48) and end (+0x38):
  - Convert (0x84a120): the actor founded a religion the minor's capital
    does not follow (+0x1910); target the religion; done
    when the minor's capital comes to follow it (0x84a200).
  - Send Trade Route (0x84b520): the actor runs no route to the minor
    (0x54ff90 == 0); done when the actor starts one to it (0x84b570).
  - Clear Barbarian Camp (0x849a70): a camp within 5 of the minor's capital
    (the plots in range 5, 0x6aef0); no target; done when the actor clears
    a camp within 5 (0x849c00: distance <= 5); a camp another clears fails
    the quest when none is left in range (0x849d60).
  - Train Unit Type (0x84be90 / 0x84bdc0): a unit with CanTrain and a
    Combat, RangedCombat or Bombard, the actor's own (its civilization's
    table maps the unit to itself), no upgrade the actor has unlocked
    (0x84bc70: the upgrade's PrereqTech and PrereqCivic held, the upgrade
    the actor's own), its era (0x93e6c0: the later of its PrereqTech's and
    PrereqCivic's, none for a unit with neither) the actor's era (0x467eb0:
    the latest era of its techs and civics); the picker draws "Choosing
    random unit type for Train Unit quest" over them in the Units table's
    order (0x84c1e0); done when a unit of the type is added to the actor —
    an upgrade too (0x84bf90; runs/h1_duelw1117 t24: China's Slinger
    upgraded to an Archer in its start, the envoy to Caguana annexing 702);
    failed when the actor unlocks its upgrade (0x84bf00 on a tech or civic).
  - Zone District Type (0x84e120 / 0x84e030): the actor's own district
    (0x406c00) with RequiresPopulation (+0xe1 bit 6), its era known and at
    most the actor's (0x93e580, 0x93e9e0), below MaxPerPlayer counting every
    one it holds (0x4bdd70); the picker over them in the table's order
    (0x84e3e0); done when the actor COMPLETES one (0x84e190; the variant
    done at the district's placement scores worse on the records, 332
    against 335).
  - Trigger Tech / Civic Boost (0x84d630, 0x84cb90): neither held nor
    boosted (0x4cb290 / 0x39d190), with a boost, of the actor's era; the
    pickers over them in the tables' order (0x84d870, 0x84ce50); done on the
    boost (0x84d750, 0x84ccb0), failed when the actor researches it
    (0x84cd40).
  - Recruit Great Person Class (0x84ab50): a class the actor can earn
    (0x2f1ed0: on offer, not barred by its civilization's or leader's trait
    — ExcludedGreatPersonClasses —, below MaxPlayerInstances, a plot for the
    person to arrive on: a Great Admiral a non-wonder district beside water,
    0x2f6500) whose offer's era (0x2f64d0) is at most the actor's or its
    next; the picker over the classes in the table's order (0x84b130); done
    when the actor recruits one (0x84ac50), failed when the class has no
    offer at another's recruit. Another's recruit of the class fails
    nothing while a replacement stands (the variant failing it scores 320
    against 335).
- Every type: war between the pair (0x8492f0) and a player's end (0x849210)
  fail its quests (runs/h1_duelw1110 t125: the war ends 2->0's and 3->0's,
  both given again at t181).
- Completion (0x848d20): state 2, the completion turn, the reward — the
  envoy lands at once, its ground drawn there.

Shipped: `cpu/core/quests.ts` / its GPU twin (`_give_quest`,
`_give_era_quests`, `_quest_*` in `gpu/core/sim_seats.py`), the tables in
`cpu/data/quests.ts`. The engines fail a quest whose end the DLL takes on a
research or a recruit when the pair is next given one (`standing` /
`_q_standing`) or its unit is added.

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
own placement for a major (`assignWorkedTiles` / the GPU walk: locked plots,
then FOCUS_BASE 2/2/1/1/1/1) is not this reading (AUDIT C-94 BUILD); the
city-states place by it (`cpu/core/citizens.ts`, `minorPlaceCitizens` /
`_minor_place_citizens`: their founding's annex, a grown citizen, a starved
city, a border or envoy annex, an improvement laid, the Food focus below).
THE CITY AI'S FOOD FOCUS (0x5cdae0, the city update's call before its
events, an AI player's city only): the growth object's Food surplus
(0x1b5620) below 1.0 with its Housing (0x1b5840) above the population
(+0x588): Food not favored (0x1962a0 on +0x1ba8) is set favored; otherwise a
favored Food is cleared — each through the SET_FOCUS command (0x975550),
a full re-place. The H-1
harness places by it (`cpu/core/citizens.ts`, no favored yields): a
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
  / `_flank_support_live` read each player's civics. The defender's
  composer 0x51f070 calls 0x521ed0 for the combat type 0x5e2f7468 and
  0x5228c0 for every other; 0x5228c0 adds Support only when the combat
  type is 0x2ca3edd1, COMBAT_MELEE (`dll_hash.py`) — no Support against a
  ranged or bombard attack (the engines' `defenderCS`, melee only). So the
  gap at runs/h1_duelw1127 t16 — a barbarian Slinger on city-state 3's
  Warrior at 51 HP on Floodplains beside a friend, 23 logged and the
  engines' 26, the log's DefenderStrMod −4 where the engines compose −6.9 —
  is some other term's, unread.
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
Laws 4.59 of 10 at 1121 t4). Each acquisition SETS the progress, at the
cost of the moment: a second major's acquisition lowers what the first
left where the row's cost fell between (runs/h1_duelv1128 Bologna's Iron
Working: 59 of 60 from Rome's at t32, 47 of 48 at record t64 after China's
at t63, its Engineering's 99 of 80 kept with no second acquisition). The
engines read it at the minor's turn (`minorCatchUp`, inline in
`_minor_research`): a row whose holders grew since the minor's last turn
(`ResearchState.techCatchUp` / `civicCatchUp`, `citystate_tech_catch` /
`citystate_civic_catch`) is set at its cost less one; MINOR_CATCHUP_PCT is
the 50. The action replay counts the active major's research at the
minors' starts as record t holds it plus what its own turn's actions
completed that record t+1 confirms (1128 t20: Rome's Bronze Working boosted
complete in its turn, Bologna's done at its own start of t20). The record
shows no progress but the item in hand's, so the importer stands every row
a minor lacks that the record's majors hold enough of at its cost less one
(1121 Hunza t118: Civil Engineering and Nationalism 1 turn each, Urbanization
117 = 115 + 1 + 1, t121 102, t123 3, as AI_GovtPolicies.csv logs).

## C-96: the city-states' boosts — the records

A city-state earns eurekas and inspirations as a major does: the records'
techBoosts / civicBoosts of every city-state of runs/h1_duelw1117-1128
grow to 9-17 by t250 (`.claude` mboost: CULTURVATE_CIVIC 44, RESEARCH_TECH
37, CONSTRUCT_BUILDING 19, HAVE_X_IMPROVEMENTS 13, MAINTAIN_X_TRADE_ROUTES 7,
SETTLE_COAST 6, OWN_X_UNITS_OF_TYPE 7, CLEAR_CAMP 4, NUM_BARBS_KILLED 3,
KILL_WITH 2, the population, district and improved-plot classes). None of
the five seeds' city-states reads Astrology's (FIND_NATURAL_WONDER) nor a
government's (HAVE_GOVERNMENT_TIER). Every city-state of 1117 researches
Pottery from t1 with its coastal city's Sailing eureka held at t3: the
boosts a turn earns land after its research choice. The engines read the
state triggers at the end of the minor's turn on its one city (`detectBoosts`
/ `_detect_minor_boosts`), land them as a major's (`markBoost`,
`_land_minor_boosts`; a boost filling an item completes it there, the item
in hand making the completion's choice over its last analysis,
`minorCompleteNow`), and take a kill's and a camp clear's at the event.

The action replay's research gap: the replay's majors research the record's
choices on the engine's Science, which runs short of the record's (1117
China at t150 45.5 against 64.5) until the record's next choice lacks a
prerequisite and the major stalls (China 24 techs t120-t230 against the
record's 29-58). The catch-up reads the majors' holdings, so every
city-state stalled with it (1117 t248: 90 techs against 189). The replay
holds the catch-up's count at the record's majors (`holdMinorCatchUp`): the
city-states' techs then stand at 187 / 189, 171 / 171, 204 / 212, 168 / 168
at t248 and 128 / 136 at t200 (1128), their record catch-up completions 561
of 626.

## C-96: the city-states' government and food — the records

A city-state is in Chiefdom from its founding to the game's end: every
city-state's government row of runs/h1_duelw1117-1128 is 0
(GOVERNMENT_CHIEFDOM) at every turn, whatever its civics unlock, the Free
Cities' -1. The engines held a city-state in the newest government its
civics unlocked, so Political Philosophy put each into Autocracy, +1 to
every yield of the city with a Palace (runs/h1_duelw1124 t41: the three
city-states' +1 Food against the record's). The engines now read
`CITY_STATE_GOVERNMENT` (`seatGovernment`, `_adopted_gov_of`).

The action replay's city-states' food first diverges (`minorResearch.food`:
their food box, surplus, worked plots, improvements, housing, amenities and
our formula on the record's own state, against record t+1) on the five
seeds, by the first input that differs:
- an improvement the record's Builder laid that ours did not, or another
  one, or a Rainforest ours left standing: 4 of 15 (runs/h1_duelw1121
  minor 2's Pasture at t20 where ours keeps a Farm; 1127 minor 2's Farm at
  t32). Over the five seeds the replay copies 270 of the minors' plot
  changes (152 the record's laid where ours laid none, 83 ours where the
  record laid none, 35 another), against 66 matched. The record's minors lay
  an improvement where their Builder stood the turn before 144 times, the
  turn it arrived 88, the turn it was trained 27.
- a Food building the record holds and ours does not (its builds): 3.
- the government's +1 Food, Chiefdom's absence: 3 (fixed).
- a worked plot or the population: 3; an amenity drop to Revolt for a
  turn (runs/h1_duelw1127 minor 4 t24, -10 against -1) or Unrest: 2; the
  surplus banked before a worked plot's yield fell in the record's turn
  (runs/h1_duelw1128 minor 2 t5): 1.

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
## H-1: a civilian stepped on — READ

- The move 0x26fe20 walks the destination plot's units from the last to the
  first; for each one not dead (+0x770), not a combat unit (0x209dd0), whose
  unit info lacks the +0x1ba bit 2, and whose player the mover's player is
  at war with (0x469cd0), it calls 0x212500(victim, mover, plot, ...); a 0
  back destroys the victim (the religion swing 0x493f80 with the capture
  flag 1), a 1 or a 2 leaves it be. The mover then completes its step.
- 0x212500: a unit info with the +0x1b8 bit 8 (CanRetreatWhenCaptured: the
  Great People, the Archaeologist, the Naturalist, the Rock Band) retreats
  to 0x530650's plot and returns 2, or returns 0 where none is valid;
  otherwise the type the unit info's UnitCaptures collection names first
  (+0x208, BecomesUnitType: Settler -> Settler, Builder -> Builder, the
  install's only rows) — or, where the mover may capture combat units, its
  own type after the "Unit Capture Chance" draw — is created under the
  mover's player on the victim's plot with the victim's build charges
  (+0xed0, through 0x56cb00) and damage (+0xcf0, 0x5705f0) and embarked
  state, the victim removed (1); no type: 0. Nothing in it reads the
  barbarians: their captive is theirs.
- 0x530650: the nearest of the victim's player's districts (the list at the
  player's +0x1308 -> +0xd8) other than its own plot where it may be placed
  (0x586360), a city centre only for a unit of a domain other than land; the
  first strictly nearest in the list's order.
- Recorded (the log's UnitCaptured, then the re-added captive, then the
  mover's UnitMoved onto the plot — before the capture where the step
  ended on water): 1117 t33 China's Settler to a barbarian Warrior, a
  Settler; t54 China's Warrior kills the barbarian escort and its advance
  takes the Settler back; 1121 t133 a Builder keeps its 3 charges; 1121
  t141 / t142 a barbarian Galley takes China's embarked Builders, embarked;
  every capture the recordings of 1117-1131 hold takes a Settler or a Builder. The
  engines: `seizeCivilian` / `seizable` (the order onto a plot holding no
  fighter is a move that seizes, and so is a victor's advance),
  `_seize_civilians` / `_seize_open`; a barbarian's captive holds where it
  stands and guards no camp.

## H-1: why a seed does not replay — the AI's worker threads — READ, the replay patch MEASURED
Measured 2026-10-08: duel seed 1117 recorded twice under `game.py patch apply` + `profile apply`, the second beside a full harness sweep, draws identical over all 22,590 (unpatched recordings parted at t169).

The synchronous generator is never raced. 0x8b6c10 (Random.cpp) takes no
lock: it reads the state at 0x8b6c98, logs the old state (the RandCalls seed
column) through a virtual call at 0x8b6da9 and stores the new state only at
0x8b6dd9. Its guards are logical, not mutual exclusion: `!IsLocked()` (+0x14)
and "App side is accessing the synchronous random number generator while the
game core is running" (an engine-utility check, vtable +0x50 / +0x58). Two
draws racing that window would log one seed twice; every recording the lab
holds (28 games, 600k sync draws) is one unbroken LCG chain, breaking only at
a new game. A reorder in the log is therefore a different ORDER OF WORK on
the game-core thread, not two threads drawing at once.

The order of work comes from AI decisions that differ on identical state. The
two recordings of 1117, 1121 and 1123 hold identical records (the action log
and the units, compared on the action kinds both recorder versions log) until
one decision of player 1 (the AI major; seat 0 is the autoplayed human slot)
differs, with no draw affected; the draws part only turns later:

| seed | first differing record | the decision | draws part |
|---|---|---|---|
| 1117 | t162 | Qin's Builder 3407873 at (38,16) spends a charge on building 50 in 458758 (new) or keeps it (old) | t169, draw 12,185 |
| 1121 | t242 | player 1's unit order: 4718611 (embarked) moves before 6356992 (new) | t246, draw 19,468 |
| 1123 | t163 | city 458758 places district 2 at (42,13) (old) or finishes building 10 (new) | t169, draw 14,945 |

1119, 1122, 1124 (whole games) and 1118, 1120 (over the shorter recording)
are identical; the old 1119-1124 slices of `h1_logs_duelw1119_1124` agree with
the 000315Z files. The first labels to part are not one fixed pair: 1117
Random Direction / GetNextBuyablePlot picker, 1121 Random Direction / City
Build District Choice, 1123 City Build District Choice / Random Promotion —
whatever the turn's first changed decision draws next.

Where the AI runs off the game-core thread:
- The AI's job list (the global AI at game +0x408): push 0x6e29d0
  (EXP_JobManager_PushJobOntoList, list +0x660, job set +0x648), spawn
  0x6e2980 (EXP_JobManager_SpawnList; flag +0x3afc), wait 0x6e3020
  (EXP_JobManager_Wait), called from Game::Processor::Update at 0x6540f
  (asserting `!GetGlobalAi().IsProcessingAi()`). The JobManager lives in the
  engine (Platform_JobManager.cpp; the DLL resolves the exports by name
  through 0xcc8d90).
- Jobs pushed: "City Analysis" (0x5ce3f0 — pushed and SPAWNED with no wait in
  the function: AI::CityBuild's analysis runs beside the game-core thread
  until the processor's next wait), "Settle City Evaluation", "Victory
  Conditions", "Governor Analyzer", "Belief Analysis", "Tech Tree Analysis",
  "Barbarian Camp Evaluation", "Nearest City Search", "AI Influence Map"
  (0x717460, with a critical section 0xcc6d60), "AI Unit Planning".
- "AI Unit Planning" (0x792c90) is a fork-join: N = min(units, the path
  finder pool's count) chunks; N <= 1 plans each unit serially on the
  calling thread (0x791e00 per unit), else N-1 jobs, chunk 0 inline, then
  the wait. The pool (0xf01920, count at +8, read by 0xb2f410) also bounds
  the influence map's split (0x7176dd) and serves the units' path searches
  ("Unable to acquire a path finder, all %d are busy").
- The pool's count is set at game init (0x91e590 -> 0x26f7d0) to
  max(1, the engine's value under hash 0xc181eb6e); the trade-route pool's
  (0x557e40 / 0x5582a0) under 0xe09781a7.
- The exe (CivilizationVI.exe 0x6ca90, the AppOptions [Performance] reader)
  sets those hashes: game-core threads (0x7ec3df64) = MaxGameCoreThreads (-1:
  the hardware count) less GameCoreReserveThreads (-1: 2 under 9 threads, 4
  under 17), floored; 0xc181eb6e = MaxGameCoreUnitMovementThreads and
  0xe09781a7 = MaxGameCoreTradeRouteThreads, each the game-core count when
  <= 0. MaxJobThreads (the engine's job threads, the main thread included)
  is read at 0x6cb59.
- What each option reaches. The game-core count (0x7ec3df64) has no reader
  in either game-core DLL; the exe reads it back only to log "Game Core
  Thread Count = %d." (0xf86f0) — MaxGameCoreThreads and
  GameCoreReserveThreads serialize nothing beyond defaulting the two pool
  counts. The job threads: MaxJobThreads -1 is the logical count (+1 at 4 or
  fewer, the physical count on AMD family 0x15) less 2; any value is then
  floored at 2 and capped at 32 (0x6cf0a..0x6cf47, options +0x26c), and the
  TBB scheduler is initialised with it (Platform_TBBJobManager.cpp,
  0x9858d0: `task_scheduler_init(min(n, 32))`). The engine always holds a
  worker beside the main thread, so no option keeps a spawned AI job off
  the game-core thread's time: EXP_JobManager_SpawnList (0x985bf0) hands
  the list to TBB and returns.
- The FinalRelease DLL the game loads: the AI's spawn 0x4a10b0 (flags
  +0x38ac / +0x38ad, job list +0x410, job set +0x400), push 0x4a1100, wait
  0x4a16e0 (called from Game::Processor::Update 0x4b72a). Spawned with no
  wait in the spawning function: City Analysis (0x3e2590), Policy Tree /
  Civic Tree / Great Work Collection Analysis (0x4136b0), Espionage
  (0x45cf70), Governor Analyzer (0x4a79b0), Victory Conditions + Settle
  City Evaluation (0x4b13f0), Belief Analysis (0x4ec440), Tech Tree
  Analysis (0x4f87e0). Spawned and waited at once: Barbarian Camp
  Evaluation, Settle City Evaluation (0x4b1540), AI Influence Map, AI Unit
  Planning, Nearest City Search; Trade Graph Update (0x3883a0) forks over
  its own list and joins.

No wall-clock budget gates an AI decision: the DLL's only clock reads
(QueryPerformanceCounter through 0xcc6080) feed the scoped profiler
(0x8c05a0 / 0x8c0640) and timing totals (0x5bce20, Player::Processor::EndTurn
0x7ed0a); none is compared to a limit.

The reading: an AI job that reads shared state while the game-core thread
(or another chunk) changes it — City Analysis spawned without a wait, the
unit-planning chunks sharing the path-finder pool and their reservations —
decides by thread timing, and a loaded box shifts the timing (the new 1117
was recorded under load). No gameplay mod reaches it: the options are the
exe's, read before the mod system loads, no GlobalParameters row or Lua
binding sets them (the Lua `GetWorkerCount` 0x23ce0 only reads), and the
jobs are DLL code.

The off-switch the lab runs (`game.py`): the profile's
`MaxGameCoreUnitMovementThreads 1` and `MaxGameCoreTradeRouteThreads 1`
make the path-finder pools one wide (AI Unit Planning plans every unit on
the calling thread, the influence map is one chunk), and `patch apply`
patches the FinalRelease DLL so the AI's spawn waits: 0x4a10ed's tail
jumps to a stub in the .text section's file slack (0x9b6630, VirtualSize
raised to the raw size) that spawns the list and tail-jumps to the wait
0x4a16e0. The spawn's flag protocol is unchanged (set before the spawn,
cleared by the wait); every job list now runs to its end before the
game-core thread goes on, the only parallel work left is jobs of one list
beside each other on the scheduler's two threads.

## H-1: the AI memory reader — READ (the hooks, the pointer paths, the contracts, the knowledge base, the operations, the trees), PARTLY READ (the religious AI's holder)

`tools/civ6lab/aimem.py` (the reader), `aimem_hook.py` (the hooks),
`procmem.py` (ReadProcessMemory / WriteProcessMemory / VirtualProtectEx);
`h1/fleet.py run --aimem` runs it beside each game, `<stem>.aimem.jsonl`.
Every offset below is the FinalRelease DLL's, read from its own code: the
Release DLL lays out the Player, Targets and the watched fields of the AI
objects differently (the Player's AI pointers sit 0xc20 higher, a watched
field is 0x60 bytes against 0x18), so the Release offsets cited elsewhere in
this file do not carry over; the knowledge base's inner layout does.

- THE HOOKS. The game thread is held at a site while the reader reads: a
  5-byte `jmp` over the site's first instructions into a stub in the .text
  file slack past the replay patch's cave (FinalRelease 0x9b6660, the mailbox
  FinalRelease 0x9b67c0: gate, lock, sequence, acknowledgement, the site
  number, rcx, rdx, r8, r9, the return address, the stack pointer, the end
  look's saved return and Targets). With the gate set the stub takes the lock,
  stores the registers, increments the sequence and spins on PAUSE until the
  reader acknowledges it (about 40 s at most), then runs the displaced
  instructions; the gate clear, it costs a load and a branch. Written into
  the process only, the process suspended (NtSuspendProcess) meanwhile; a
  hosted game loads the DLL afresh and the reader re-arms it. The sites:
  0x785f30 (FinalRelease 0x5146e0), the tactical turn's knowledge step bound
  on player signal +0x1f8 (0x7864c0 (FinalRelease 0x514a60) binds it, the
  Targets +0x98 the player): the signal reaches every player's Targets with
  edx 4, 3, 2, 1, 0 and the step runs where r8b is set and edx is the
  Targets' +0x108 (4); 0x5ed280 (FinalRelease 0x3f3e90), the knowledge base's
  log, AI_Knowledge.csv's moment; 0x7877e0 (FinalRelease 0x515d70), the look,
  the tactical step's own call returning to FinalRelease 0x51471a, any other
  the end look on player signal +0x228, whose return the stub redirects to a
  fourth site; 0x84ed50 (FinalRelease 0x5a8250), the raise of the Lua
  PlayerTurnStarted (rdx the player), a player's turn start.
- THE ORDER, MEASURED (runs/h1_duelm1117, every turn): a turn holds each
  player's start (0, 1, 2, 3, 4, 62, 63), then per player in that order its
  tactical step, its log, its end look; player 0's end look runs twice. A
  city's contract SUBMITTED at turn T (AI_CityBuild.csv) is in the Control
  Manager's list at T's end look, not at T's log moment (seed 1117 t9:
  contracts 28, 29, 30): the log moment precedes the cities' submissions,
  the end look follows them.
- THE GLOBALS. The game: FinalRelease 0xb8aa68 (the turn +0xc0, the
  synchronous generator at +0xf0: its state +0xf8, its draw count +0xfc;
  0x9ccff0 (FinalRelease 0x6d77f0), Lua's GetRandomSeed, reads game +0xf0
  +8 through 0x9c98d0 (FinalRelease 0x6d3ce0); game +0x240 is the players'
  manager). The players: FinalRelease 0xb8e140, the players' manager, +0x20
  the array of Players by id (0x37b760 (FinalRelease 0x26c770) reads it; the
  game's own lookup 0x5d3e0 (FinalRelease 0x44f00) takes game +0x240 +0x20,
  0x8a08a0 (FinalRelease 0x63d080)); a Player's id +0xd8, its signals +0x798.
- THE PLAYER'S AI (vtables read off each pointer's constructor): +0x650 the
  city AI manager (its +0 the Player; +0x98 a list, node +0 a CityBuild, +0x10
  the next; walked by 0x5c2650 (FinalRelease 0x3d9130)), +0x658 CultureAi,
  +0x660 Diplomatic, +0x668 Economic, +0x670 GrandStrategic, +0x678 Homeland,
  +0x680 Military, +0x688 Research, +0x690 Tactical, +0x698 Targets, +0x6a0
  the planning manager, +0x6a8 the behaviour tree manager, +0x6b0 the Control
  Manager, +0x6b8 the influence map, +0x6c0 Player::Trade, +0x6c8
  Player::Units, +0x6d0 Player::Cities, +0x6e0 PlayerDiplomacy, +0x6f0
  PlayerCulture, +0x700 Player::Resources, +0x710 PlayerStats, +0x718
  PlayerTechs, +0x720 PlayerReligion, +0x738 PlayerEras, +0x748
  PlayerInfluence, +0x750 Player::Quests, +0x770 CulturalIdentity, +0x780
  PlayerTreasury.
- THE KNOWLEDGE BASE: Targets +0x270 (Release: +0x3e0); its layout is the
  Release's (0x5ed280 (FinalRelease 0x3f3e90) reads +0x18, +0x638, +0x648,
  +0x668, +0x6d8, +0x6e8 as 0x5ed280 does): +0x18 per owner id a 0x18-byte
  vector (+0 the per-type array, +0x10 its count), a type's entry +0 its
  records, +0x10 their count, a record 0x20 bytes (+0 the unit id, +0xc the
  age, +0x10 / +0x14 x, y, +0x18 / +0x1c the plot's map ids); +0x638 the camps
  (0x10 bytes: x, y, +0xc the value), their count +0x648; +0x6e8 its player.
  MEASURED: at the log site the records' per-type counts and oldest ages are
  AI_Knowledge.csv's ARMY lines on every player-turn (runs/h1_duelm1117: 1,744
  of 1,744).
- THE CONTRACTS: the Control Manager (Player +0x6b0) +0x170 a vector of every
  live contract of the player, its count +0x180 (0x6072d0 (FinalRelease
  0x4007d0) finds one by id there); +0x110 the controls' pages (8 entries of
  0x18 a page, the entry's +0 the control: +0 its id, +4 its kind, +0x10 its
  object; a free entry holds the next free index; 0x609060 (FinalRelease
  0x4019f0) the lookup by id). A contract's watched fields (vtable, owner,
  value at +0x10; the constructor FinalRelease 0x3fc9d0 names them): +0xb0
  m_status (the progress: 0x5f4cd0 (FinalRelease 0x3f97e0) prints the name
  0x600800 (FinalRelease 0x3fd780) takes for it), +0xc8 m_priority, +0xe0
  m_timeLimit, +0xf8 m_timeEstimate, +0x110 m_id, +0x128 m_owner (the
  control id of the tree that made it; its +0x10 object is the tree's control
  interface, the tree's name the line prints), +0x140 m_player, +0x158
  m_extraPresentValue (24.8 fixed point, the line's VALUE), +0x160 the handle
  count (0x600b00 (FinalRelease 0x3fda30) releases a handle {pointer, owner,
  id}). Its kinds by vtable: the build contract (FinalRelease 0x3f7480: +0x178
  m_desiredUnit, +0x190 m_desiredBuilding, +0x1a8 m_desiredDistrict, +0x1c0
  m_desiredLocation x, y, +0x1d8 m_requiredCity, +0x1f0 m_keepControl), the
  tech contract (FinalRelease 0x3f7180: +0x178 m_goalTech, +0x190 m_nextTech,
  +0x1a8 m_bestController), the civic contract (FinalRelease 0x3f6c00: +0x178
  m_goalCivic, +0x190 m_nextCivic), the Purchase Plot contract (FinalRelease
  0x3f7040: +0x178 m_purchasePlot x, y). The Release fields cited for the
  contract (+0x100 progress, +0x1c0, +0x220, +0x3a0, +0x408, +0x468, +0x4c8,
  +0x528, +0x588, +0x5e8) are these in order. A fifth kind, the diplomatic
  action's (FinalRelease 0x3f6e20: +0x178 m_enemy, +0x190 m_action), stands
  in Qin's list (runs/h1_duelm1117, contracts 427 and 429). MEASURED
  (runs/h1_duelm1117): every CONTRACT line whose contract still stands at
  that turn's end look carries its value (2,006 of 2,006; 125 more gone by
  then); of the 967 contracts read, AI_CityBuild.csv never names 290: 109
  goal techs, 11 goal civics, 48 Purchase Plots, 6 diplomatic actions, 116
  build contracts.
- THE HOLDERS: a CityBuild (constructor 0x5c4f40 (FinalRelease 0x3db2f0)):
  +0xa8 m_cityId, +0xc0 m_playerOwner, +0xd8 m_cityThreat, +0x140
  m_managedWorkingContract (the handle in hand at +0x150, its id +0x15c),
  +0x160 m_managedContracts (a container: +0x10 a vector of 16-byte handles,
  +0x18 its capacity, +0x20 the count; stale copies stand past the count). The same container in the Economic AI (+0x268, the
  purchases), Research (0x75e7a0 (FinalRelease 0x4f70f0): +0x178), CultureAi
  (0x6190d0 (FinalRelease 0x40e8c0): +0x218), Diplomatic (0x6419c0
  (FinalRelease 0x4271a0): +0x6158) and each behaviour tree (+0x378). The
  religious AI's (0x74af30 (FinalRelease 0x4e9d60), made by the religious
  manager, not reached from the Player) is not read: its Warrior Monk
  contracts stand in the Control Manager's list with no holder named. A
  handle within a container's count names a contract the Control Manager
  holds, or is released (its pointer null): runs/h1_dueldA1117, 1,992
  end-look records, none naming a contract the manager lacks.
- THE BEHAVIOUR TREES: each control whose object's vtable is the tree's
  control interface (the tree +0x218; its +8 the tree): the tree's watched
  fields (constructor FinalRelease 0x53e4d0) +0x138 m_isActive, +0x150
  m_isTemporary, +0x168 m_markForDestroy, +0x180 m_allowRecruiting, +0x1b0
  m_controlId, +0x1c8 m_treeId, +0x1e0 m_requestPriority, +0x1f8
  m_recruitPriority, +0x210 m_presentValue, +0x268 m_name (0x7cb930
  (FinalRelease 0x540250) returns it for the contract line), +0x370
  m_operationId, +0x378 m_managedContracts. The reset 0x7d3670 (FinalRelease
  0x544020) sets +0x170's value to 1: the Release's "marked (+0x3c8)" is
  m_allowRecruiting.
- A TREE'S NODES (the tick 0x7d3a00 (FinalRelease 0x544360) and the node
  update 0x7d3d30 (FinalRelease 0x544530)): +0xa0 the node count
  (m_numNodes' value), +0xb8 the node blocks (m_definitions' value: 0xb8
  bytes a node in BehaviorTreeNodes order — +0 its shape, +4 its handler's
  index in the shape's table, +8 the node's own data, the update handed
  +8), +0xe0 the node graph (0x14 bytes a node, +0 its parent), +0x108 the
  statuses (m_actionStates' value, an int a node; the tick writes each
  node's update there and the root's decides the execution). The statuses
  stand at the end look as the turn's tick left them. A node's data holds
  its own fields (Add Goal Tech, 0x7e7200 (FinalRelease 0x54f6b0): +0x94
  its tech contract, +0x98 the goal, at the Release offsets of the data)
  and, at 16 x each TreeData row's DefnId, its reference {the column, its
  DataTypes id, its slot}.
- THE TREEDATA STORE (READ, live, the five duelu recordings): one table per
  player, a column per DataTypes id (BehaviorTrees.xml: 0 UnitTypesList, 1
  TechTypeList, 2 BuildingTypesList, 3 int, 4 bool, 5 Map Point, 6 string,
  7 ImprovementList, 8 ID List, 9 float, 10 DistrictList, 11 CivicsList) at
  the table + 0x18 + 0x20 x the id: +0 its entries, +0x10 their count, +0x18
  its free head. An entry: int, bool, float (24.8) 8 bytes, the value first
  and a link; Map Point 12, x, y, link; string 16, the text's pointer; a
  list 32, {its 4-byte items (the database index; for an ID List the
  contract or unit ids), its capacity, its count, a link}. A tag's nodes
  share its slot; an untagged datum has its own slot (its default, or what
  the node wrote). The node fields read, at the data's offset: Move Unit's
  kept unit +0x50 (0 or -1 none), Clear Plot's +0x40, Build Improvement's
  unit +0x50 and improvement +0x54, the Contract Manager Decorator's turn
  counter +0x50.
- A UNIT'S ASSIGNMENT: Player::Units +0xd0 the units' list (node +0 the
  unit, +0x10 the next), a unit's id +0xb0, its control +0x300 (a tree's, an
  operation's tree's or the tactical pass's control id; the Release's +0x778
  / +0x7d0), dead +0x2e8 (the Release's +0x770); 0x6092c0 (FinalRelease
  0x401ba0) lists a control's units by it.
- aimem.py reads every tree's nodes at the end look (`tree_nodes`: [status,
  shape, handler, the data as hex, the TreeData values by DefnId]) and every
  unit's assignment (`assigned`).
- THE OPERATIONS: Military (Player +0x680) +0x1f0 a list (node +0 the
  operation, +0x10 the next; 0x723cf0 (FinalRelease 0x4cf450) and the log
  0x727510 (FinalRelease 0x4d26e0) walk it). An operation (constructor
  0x733730 (FinalRelease 0x4d80b0)): +0xa8 m_opDefinition (its first bytes
  the name, the "%s running" line), +0x138 m_controlId, +0x150 the teams
  (0x118 bytes each, inline; their count +0x160: 0x73b360 (FinalRelease
  0x4dee80)), +0x178 / +0x180 / +0x184 m_target (the enemy, x, y), +0x1a8
  m_rallyPoint, +0x1c0 m_blockedTurns, +0x1d8 m_backupTarget, +0x208
  m_forceTargetSwitch, +0x220 m_opStrength, +0x238 m_targetStrength, +0x250
  m_currentCombatStrength, +0x268 m_forceReady, +0x280 m_warReady, +0x298
  m_isEmergency, +0x2e0 m_treeControlId (0x73a840 (FinalRelease 0x4de360)
  asks the Control Manager for it), +0x2f8 m_treeManagerId. A team: +0x18 its
  members' unit ids, their count +0x28 (0x73b4f0 (FinalRelease 0x4def30)
  prints them through Player::Units' lookup 0x4f2310 (FinalRelease 0x2c4360):
  +0x98 the units' pages, as the controls'; a unit's type +0xc8). An
  operation the military manager starts after the tactical step stands at
  the end look, not at that step (runs/h1_duelm1117 t3, Qin's Settle New
  City), and one started and completed in one turn at neither: the
  operations at the tactical step are AI_Operation.csv's "running" lines on
  789 of 836 player-turns.
- A UNIT'S EXPERIENCE: m_kExperience at unit +0x960 (the Unit constructor
  FinalRelease 0x39b140), its object +0x970 (the Release's +0x1bc0; 0x1fc100
  (FinalRelease 0x14fa10) asks 0x116f80 (FinalRelease 0x2af30) of unit
  +0x970): +8 the promotion flag, +0xc the experience points, +0x10 the level
  (seed 1117 t21: Qin's Warrior 131073 at 11, as GetExperiencePoints; the
  operations' members at the end look against the next record's units:
  1,284 of 1,305, the rest gaining experience after the end look).
- THE ONE-OFFS: PlayerStats (Player +0x710) +0xa0 m_iMaxMeleeStrengthTrained
  (the Release's +0xf0; 0x4d9320 (FinalRelease 0x743c0) reads +0xa0; the
  Free Cities' 0 at their start); Player::Cities (Player +0x6d0) +0xec, the
  Release's "+0x12f0 +0xf4" (0x198310 (FinalRelease 0x111920) reads +0xec);
  the generator's state and count at every site.
- COST, MEASURED (runs/h1_duelm1117, 250 turns): 7,224 reads, the game
  thread standing 7.9 s in all — 32 ms a turn, 1.1 ms a read, the stub's
  spin and the reader's ReadProcessMemory calls together; 19 MB of lines.
  Through t164 the turns took about 2 s each, as in the recording without
  the reader (runs/h1_duelw1117).
- THE REPLAY WITH THE READER ON (runs/h1_duelm1117 against
  runs/h1_duelw1117, `h1/samegame.py`): every record section equal through
  t164; at t165 player 0's Dedication (COMMEMORATION_EXPLORATION) and its
  age change stand in the new record and not the old — the recorder's
  `lab.wait_turn` answers the ENDTURN_BLOCKING_COMMEMORATION_AVAILABLE blocker
  of the autoplayed seat only once a turn has stood 5 s, which t165 did in the
  new recording (17 s, a World Congress screen) and not in the old (2 s; its
  blocker answered at t168, under the victory screen); the records' seed
  equal through t166, the draws through draw 11,833 (t166's Random Direction
  then draws in 8 against 5); every section parts from t167. The two older
  recordings of the seed (runs/h1_duelw1117, runs/h1_duelv1117) part the
  same way at t245 (the Dedication answered there in one, not the other),
  their draws equal to the end.
- THE DEDICATION AT A FIXED POINT. The autoplayed seat's AI never answers
  its Dedication (runs/h1_duelw1117: none taken at the t31, t61, t91, t121
  era changes). `h1/dump.py` now answers it at the hold, after the record
  and before the seat's turn is released, wherever one of the seat's
  notifications blocks on ENDTURN_BLOCKING_COMMEMORATION_AVAILABLE
  (`lab.answer_dedication`, the first blocker or not), and `wait_turn`
  never answers it. The choice is commemorate.lua's: the offered choices
  (Game.GetEras():GetPlayerCommemorateChoices) in the order offered, as many
  as GetPlayerNumAllowedCommemorations allows. The blocker stands at the
  hold of each game-era turn (the record of t31, t61, ..., t241 holds the
  new age with no Dedication; the next record holds it). MEASURED: seed
  1117 recorded twice at once (runs/h1_dueldA1117, runs/h1_dueldB1117,
  20261025T035053Z): every record of the 250, every one of the 23,363
  draws and every one of the 7,224 AI memory reads identical; the
  Dedication answered at t31, t61, t91, t121, t151, t181, t211, t241 in
  both.

## H-1: a pillaged building's specialist, the centre's defence, three moments — READ

- A plot's capacity (0x195940) counts a district's specialist slots as its
  row's base (+0x54 behind +0x50) plus each building of the district not
  pillaged (0x18fe60 on the city's buildings +0x1c78: the byte array the
  Lua IsPillaged binding 0x9847b0 -> 0x9ed20 reads; its other callers are
  the pillaged-building gates, the building upkeep among them). Only a
  placement reads the capacity: nothing evicts a citizen at the pillage.
  Recorded: 1128 Xi'an t105, the barbarians' UNITOPERATION_PILLAGE on the
  Holy Site at t104, the Shrine pillaged, the record's worked plots keep the
  district's specialist and the city's Faith 5 = 1 + 2 + the specialist's 2;
  China's turn re-places it (t106: Faith 3). The engines seat a pinned
  specialist on the slots of every standing building, pillaged or not, and
  the overflow on the live ones (`citySpecialistSlots(seated)`,
  `_city_spec_slots(seated=True)`).
- A district's GetDefenseStrength (Lua 0x98ca00 -> 0x24ae80) is computed
  live: the base 0x24a000 plus the garrison term 0x24a180 over the plot's
  best defender 0x208b80. The record's unit list stands before the in-turn
  player's start while the plot reads the gamecore's: a military unit that
  start's production completed already garrisons the centre (1127 Rome t96,
  1117 t168, 1122 t108, 1123 t101: a Warrior completed in the start window,
  26 with no unit on the centre in the record; 1119 t112 an Archer, no
  term). The harness lays it on the centre for the defence read.
- MITIGATED_RIVER_FLOOD: the flood (0xa2f200) runs the damage pass
  0xa2a4d0, whose out parameter is the MITIGATING player — the owner
  (0x24b4b0) of the first complete (+0xb08), unpillaged (0x24c3a0) Dam on
  the river's plot list, else the Great Bath's (0xa2c280); a mitigating
  player fires the game signal (+0xbd0) whose handler 0x3060b0 records the
  moment unless the player's history holds it (hash 0x978039a6 and the
  player, any river): once a game. 1128 t160 (climate log FLOOD MITIGATED
  on the Amur): China +1. `riverShield`, `mitigatedFloodMoment` /
  `_flood_mitigator`, `_moment_mitigated_flood`.
- WORLD_CIRCUMNAVIGATED: on a plot revealed (0x50d390, the visibility
  manager), a player without the flag (+0x8a8) whose team has revealed a
  plot in every column x of the map (the y loop over the team's revealed
  bytes +0x2f0) sets it and signals (+0x1728); the handler 0x315980 records
  FIRST_IN_WORLD (0x17cd04dd) unless another player holds the flag, else the
  plain row (0x2ada545a). 1127 Rome t157 (5), China t183 (3). A once key,
  under fog, over the seat's explored plots (`momentKeysHeld` /
  `_moment_held`; a game with no fog explores nothing).
- IMPROVEMENT_CONSTRUCTED_RENEWABLE_ENERGY_FIRST: the improvement handler
  0x311ed0 compares the improvement with a table of types (0x306640:
  Beach Resort +8, Mountain Tunnel +0xc, Geothermal Plant +0x10, Solar Farm
  +0x14, Wind Farm +0x18, Offshore Wind Farm +0x1c, Industry +0x20,
  Corporation +0x24); the four renewables record the plain row for the
  player once, FIRST_IN_WORLD where no one holds it. 1127 China t246 (3).
  One key for the four (`IMPROVEMENT_KEY`).
- A wonder's annex re-places the city's citizens before the wonder stands:
  its CityTileOwnershipChanged rows precede its BuildingChanged row, and the
  re-place scores the plots as they read without it (1128 Xi'an t143: the
  Great Bath's Floodplains Faith unpaid at the re-place, surplus 9 under
  every flag set its standing citizens fit; Jiaodong t185 7).

## C-96 / C-97: the city build AI — the choice READ, the values PARTLY READ

AI::CityBuild, one per city (city +0x31d0, `m_pCityBuildAI`); its log is
AI_CityBuild.csv. Values are 24.8 fixed point throughout (the log prints the
low byte / 256 plus the rest). Check: `dll_citybuild.py` (the present value
on every logged city-state Monument), `cpu/harness/cityBuildLab.ts` (the
building tables).

- Fixed point (CivTech Math_FixedPointT): fx(f) = floor(f) << 8 | trunc(frac
  x 256), so fx(0.01) = 2; mul (a b) >> 8 (0x16eb20 in place, 0x16e7d0),
  div (a << 8) / b truncated (0x16e940), add 0xac650, sub 0x16ec10; a
  "percent" product is a b / 25600 truncated toward 0 (the /100 magic
  0xa3d70a3d70a3d70b, shift 14).
- The city's turn (0x5ce680, from the player's AI turn 0x5c2650 over its
  cities). On a full update: 0x5d7e00, 0x5cadc0, 0x5cbd10 (the yield
  advantages and weights; logged by 0x5cdd70: Food Adv. / Prod. Adv. are
  adv[YIELD_FOOD] / adv[YIELD_PRODUCTION] from 0x5d83c0, the YIELD_* list is
  CityBuildAI +0x908), 0x5c9a00, 0x5c9700, 0x5cb570, 0x5ca7e0, the military
  AI's city hook 0x79a320, and the City Analysis job (0x5ce3f0: the job
  object at +0xcc0, vtable 0xd59af0 -> 0x5ce910 -> 0x5ce970 once per plot
  evaluation, 0x78 bytes each, `m_plotEvaluations` at +0xcf8 / +0xd08, the
  city centre's first; spawned with no wait, "H-1: why a seed does not
  replay"). Then, for a player the AI drives: 0x5cdae0, the City Defense
  event 0x5cced0, the unit-or-building event 0x5cd150 (tree "Build City
  Building"), the district event 0x5cc910 (its "City Build District Choice"
  draw in 0x5d0c20), the improvement event 0x5ccc10 ("Build City
  Improvement"), 0x5cd4e0; last, with the build queue empty (city +0x2350 0
  or +0x2340 null), the Default Specialization pick 0x5d4d70. A second hook
  (0x5ce5b0) runs the same pick on an empty queue (queue +0x1e0 / +0x1d0)
  and then walks 0x5d2810's items through 0x68be60.
- The Default Specialization pick (0x5d4d70, `defaultSpecialization` in
  `cpu/core/aiCityBuild.ts`): nothing for a player 0x469d70 names or with
  an item in the queue (city +0x1e0 / +0x1d0); the contract events first
  (+0x3a8, their trees' slot +0x98 / +0x68 / +0xa8). Then the best building
  (0x5d0860), unit (0x5d2600) and project (0x5d1f10) of the city centre's
  evaluation (tables +0x28, +0x40, +0x38; each best starts at FX(-9999) and
  takes a strictly higher value, the first in table order on a tie). Plain
  pick (flags 1, 0): the building not queued or held (0x17e690 > 0),
  CanConstruct (0x170450) true with its reason fields +0x54 / +0x68 clear,
  not MustPurchase (Buildings +0x159 bit 4 — MustPurchase, no row sets it),
  its value x0.5 where the favoured-items verdict (CityBuildAI +0x528,
  0x5d2d10: list > 0 -> 1, < 0 -> -1) is -1, x2 where 1 (a MustPurchase row
  of the district @0xf2f988 x5 first); the unit without FoundCity (+0x1b9
  bit 2) or BuildCharges (+0x44), CanTrain (0x172820), not MustPurchase
  (+0x1b9 bit 128). Defensive pick (flags 1, 1; the military AI's +0x4b8 set,
  or CityBuildAI +0x1b8 above -1 with the centre's property 0x5e97d629 or
  CityBuildAI +0x218): only a building with DefenseModifier (+0x28) or
  OuterDefenseStrength (+0x44), only a unit with Combat (+0x48), +0x168 and
  +0x170 set and no CLASS_RECON tag, no project. A contract in hand (+0x398)
  worth at least the unit's value less 1.0 and the project's takes the turn
  (its vt +0x38). Else the building wins at least the unit's and the
  project's value, else the unit at least the project's, else the project,
  queued by 0x5c9ea0 / 0x5ca5a0 / 0x5ca450; with none, or the queue refusing
  it (0x5c9ea0's queue CanConstruct 0x1714d0, which the pick's 0x170450 is
  not: a building of a pillaged district refused, its byte [rbp-0x16] ->
  LOC_BUILDING_CONSTRUCT_DISTRICT_IS_PILLAGED at 0x1716d2; runs/h1_duelv1128
  Nazca t26-t31, its Holy Site pillaged at t24, the pick's Shrine at 30.4
  over the log's own tables, NO BUILDS AT ALL each turn; `minorBuildingOk` /
  `_minor_building_ok`, the Free Cities' alike), 0x5d2810's item for a full civilization ("Generic Offense"), "NO BUILDS
  AT ALL (maybe city was nuked?)" for any other. The log line is the pick
  and its value; the second hook 0x5ce5b0 runs it again (two NO BUILDS lines
  a turn). MEASURED (`cityBuildLab.ts`, the five verbose duels, every
  city-state pick line, the engine's CanConstruct / CanTrain / projects, no
  favoured items, the plain pick): 812 of 920 as logged over the log's own
  three tables, 801 with our buildings table in place of the log's; of the
  log's own-table misses 78 are the log's NO BUILDS where we pick (a valued
  building the queue refuses — runs/h1_duelv1124 Cardiff t155..t157 holds an
  unfilled Factory contract of t125 —, or the defensive pick: Granada
  t124..t126 under siege), 29 another item.
- The tables (0x5ce970, per plot evaluation). A building other than a
  wonder is valued on the city centre only: T = max(tech turns 0x7610e0,
  civic turns 0x621920) + the prerequisite district's turns (0x17b5a0, +10
  when not the current production) + the build turns (0x17b1e0, the
  queue's own estimate) + 10 while the city builds something else (city
  +0x2350 set and the current item not this one) + each missing
  prerequisite building's turns; value = 0x7a4d40(building, T, no plot,
  valueHorizons[1]). A unit: 0x7b62c0(unit, T from its prerequisites and
  train turns 0x17bb40, +10 likewise, valueHorizons[1]); a project 0x7b28c0;
  a wonder 0x7a4d40 at its plot with valueHorizons[2]. T beyond the
  horizon values FX(-9999).
- The rate and the horizons: GlobalAI (game +0x408) +0x290 is the discount
  rate, AI_DISCOUNT_RATE x 100 / the speed's CostMultiplier (the initializer
  0x6ddb40; 4.0 online, `cpu/data/aiValue.ts`); `m_valueHorizons` (+0x298,
  data +0x2f0) is filled by 0x6dd9a0 as [speed(50), speed(100), speed(200),
  50], speed(x) = x x GameSpeeds.CostMultiplier / 100 (0x5254d0 -> 0x525400):
  the tables' valueHorizons[1] is 50 online.
- A building's or project's value 0x7a7590: per Building_YieldChanges row
  (Buildings +0x2e0) the amount x fx(1 + cityPct[y] 0.01) x fx(1 + bldPct
  0.01) (city +0xbc0 through 0x7a2fa0; 0x18e890) through the yield value
  0x7a6690 = amount x Yields.DefaultValue (Gold 0.5) x (1 + min(w[y], 9.0)),
  w[y] = 0x702ad0, the sum of five per-player arrays (0x4681a0 +0x340, player
  +0x1288 +0x528, the AI yields' +0x638, +0x7a8, the +0x6b0 list or +0x6c8);
  per row also pseudo-yield terms through 0x7a60d0 (PSEUDOYIELD_GOLDENAGE_POINT
  from 0x2c40b0, 0x2c4350 for Science, 0x2c3ed0, 0x2c4290 for a prerequisite
  of era 5 or later); then a second yields pass (0x18e570), a whole number
  (player +0x1358 +0xf8) when CanConstruct's three reason fields are all -1,
  the great person points (+0x1b0, each class's pseudo-yield),
  PSEUDOYIELD_WONDER for a wonder, the era moment (0x93e4e0, 0x3002f0), the
  defence terms (OuterDefenseHitPoints +0x54/+0x58 present: city +0x1a60,
  +0x5e8, +0x588 / 5 + 1, CityBuildAI +0x1b8, the war terms, x4 for a
  damaged own copy, x2 against a later-era enemy), OuterDefenseStrength
  (+0x44) as a whole number, the great work slots (+0x1c8), the prerequisite
  chain (+0x1f8: x(1 + 2 depth)), less Maintenance (+0x38) as Gold; the sum
  v becomes PV(v, rate, H) - PV(v, rate, T) (0x7a16e0 twice). After it,
  already discounted: Entertainment (+0x2c) > 0 adds 0x79f7c0 for this city
  (RegionalRange +0x48 <= 1) or over the player's cities in range, capped at
  50.0; the Buildings_XP2 row (0x28a940 on 0xad50d0: +0x28 > 0 -> 0x7a67f0,
  +0x48 bit 1 -> 0x39110); each free unit (+0x298) through 0x7b62c0; Housing
  (+0x34) > 0 through 0x7a3d70 (CityBuildAI, city +0x1788, population +0x588,
  T, H); a building on player +0x1310's list (0x39dcd0) through 0x7a10c0 (a
  Gold value per plot of a walk); the modifiers through 0x7a4b20 ("the AI's
  yield weights and the modifier evaluator" below). Column offsets from the
  Buildings loader 0xabaaf0 (`dll_rowmap.py a59ee0`).
- The present value 0x7a16e0 (FinalRelease 0x528310, the same code): n 0 ->
  v; n < 0 -> 0; rate 0 -> v n; rate >= 50.0 or rate n fx(0.01) >= 10.0 ->
  v / (rate fx(0.01)); else n <= 400 and (1 + r)^n - 1 by its binomial to
  the third power, each product truncated (a = n r, c = n(n-1) r^2, e =
  n(n-1)(n-2) r^3; s = a + c/2 + e fx(1/6)), PV = (s v) / max(r (1 + s),
  fx(0.01)).
- A unit's value 0x7b62c0: the section "C-96 / C-97: the unit value".
- SETTLED (the present value, on the PLOT ANALYSIS LOG tables of the verbose
  recordings, every building at every T): the shipped routine at rate 4.0 to
  the horizon 50, as called. A city-state's Monument logs X + trunc(X), X =
  PV(1.0, 50) - PV(1.0, T): its +1 Culture (a city-state's Culture weight 0)
  and MONUMENT_CULTURE_AT_FULL_LOYALTY's whole number (COLLECTION_OWNER is the
  building's city in its analysis; REQUIREMENT_CITY_HAS_FULL_LOYALTY is not
  registered, so its set holds). runs/h1_duelv1124 Cardiff t2..t12 logs
  24.25 26.04 26.68 28.11 30.19 30.61 32.53 34.38 36.29 38.29 40.11 at T 11
  down to 1 — the uneven steps (30.61 -> 30.19 at T 7 -> 6) the routine's
  truncations; Bologna's values run on the same ladder turn for turn.
  `dll_citybuild.py`: 254 of the 255 city-state Monument values the five
  verbose duels log are X + trunc(X) at a whole T below 50 (the one other,
  1127 t41 Cardiff's 60.22, unread); the exact annuity prints none. The earlier fits (H 100
  at the Standard cost) read the T a turn late and the Monument without its
  modifier.
- The building turns T as the job reads them (`cpu/core/aiCityBuild.ts`,
  measured by `cpu/harness/cityBuildLab.ts` on the record of the turn after,
  the research turns from AI_Research.csv): the analysis runs after the
  turn's production — its progress is the record of the turn after's, the
  record keeping only the whole part; the build turns 0x17b1e0 are
  0x8c4540's ceil((cost - progress) / Production toward the item) — the
  progress kept on the item plus the store an idle step or a completion
  left (Cardiff idle t60..t75: its Library a turn sooner each turn); +10
  while any other item is in hand (a unit, a district, a project too; an
  item the step completed leaves nothing in hand: Granada t6 values its
  Granary at T 13 after its Builder); the district's turns +10 unless it is
  the item in hand, a district under construction not held (Bologna's
  Campus t16: T 24 = 2 + 12 + 10). The technology's turns (0x7610e0): the
  research AI's entry turns (+0x1c; 500 at 0 or below), plus the research
  AI's +0x528 where the entry's walk does not lead through the research in
  hand — a tracked int (+0x4d0, data +0x58) written only by its turn
  (0x7609d7) and its completion's choice (0x7630ec), each 0x4ca120: the
  turns left on the research in hand; the analysis reads the value before
  its own turn rewrites it (1124 minors' Walls t3..t12: Masonry's 21 + the
  Pottery's turns left as the turn before logged them; t6 after a
  completion: 21 + Astrology's 10 the choice set). The civic's (0x621920):
  the civics AI's entry turns plus the turns left on the civic in hand,
  live (0x39c1f0; -1 with none).
- The terms measured (the same lab): a row's amount through the city's
  percent (a city-state's -50% Production: the Water Mill's v 1.5); the
  great person points at their class's pseudo-yield (a Shrine 2.0 = 2 Faith
  + 0.5 Prophet - 0.5 Gold); the era's whole number only where CanConstruct
  holds now — the technology and the civic held, the district standing, a
  prerequisite held (the Grove 0 with no Preserve); the outer defences: +1
  for a city of two districts or more (city +0x1a60, the districts'
  count, 0x197ff0's array), +2 for a capital (city +0x5e8 m_bCapital), +1
  with a wonder (0x18e930), population / 5 + 1, +2 at war (0x3dcf50), the
  city's CityBuildAI +0x1b8 where above -1, +4 where any city of the player
  has its +0x1b8 above -1; the Walls' v 6.0 at population 1..4; the
  entertainment term passes ONE Amenity whatever the Entertainment
  (0x7a8dcd: r9d 1): PSEUDOYIELD_HAPPINESS of 1 where the happiness level
  holds, else of the levels climbed plus per yield but Food the level's
  NonFoodYieldModifier change on the city's yield, at least 1.0, from T to
  the horizon (0x7a2140) — the Arena; a city-state's gold per turn counts
  its city's Gold (the Economic boost; a Library's Gold maintenance otherwise
  reads 1.72). CanConstruct refuses outright: a building held or one
  MutuallyExclusiveBuildings names, a Capital row off the capital, a
  government building above the tier (a city-state none), a worship
  building the city's religion does not offer, RequiresAdjacentRiver off a
  river, a Flood Barrier with no coastal lowland — not a district no plot can
  hold yet (the Harbor's buildings are valued).
- READ, the unit value's exits (0x7b62c0, `unitValueExit`): T at the
  horizon; a unit not the player's version (player +0x12e8 +0x1c0); a
  domain the city cannot build (0x17d660); a player that is neither
  CIVILIZATION_LEVEL_FULL_CIV (0x469db0, hash 0x253718b0) nor _TRIBE
  (0x469ce0, 0xd959ec24), not at war (0x3dcf50) and holding more than five
  units (player +0x12e8 +0xc0); a Spy (Units +0x1ba bit 2 — the Spy column,
  `dll_rowmap.py a6f2b0`; not a religious flag) for a player not a full
  civilization -> FX(-9999). Then by the unit's pseudo-yield (Units +0x290,
  PSEUDOYIELD_UNIT_COMBAT by default; the globals @0xf2e254 COMBAT, 258
  NAVAL, 25c AIR, 26c TRADE, 268 RELIGIOUS, 250 ARCHAEOLOGIST, 260 EXPLORER,
  264 SETTLER, 270 SPY, 2bc TOURISM, 2a0 NUCLEAR_WEAPON — `pyglob` over
  0x5bbf80, each global stored after the next name's load): a Trader
  0x7a7110 through PSEUDOYIELD_UNIT_TRADE; a religious unit from
  ReligiousStrength (+0x78) x 0.01, SpreadCharges (+0x7c), ReligiousHealCharges
  (+0x74), nothing where the player's majority religion (0x4681c0 +0x1c0) is
  -1, then PSEUDOYIELD_TOURISM terms (ParkCharges +0x64, Units_XP2 tourism)
  that a city-state's TOURISM weight (MinorCivPseudoYields -200, held at
  -1.0) zeroes; WMDCapable (+0x1ba bit 64) PSEUDOYIELD_NUCLEAR_WEAPON. The
  tail: x (the city's extra copies + 1, 0x179dd0), the promotion class
  weight, a strategic resource the player lacks and no city of its holds
  near (0x4aa790, 0x5d45c0) -> 0, the pseudo-yield, the Gold maintenance
  below handicap 3, the PV over T to H, the tourism and modifier terms. A
  building's free units (Unit_BuildingPrereqs, its +0x298; an Archaeologist,
  PSEUDOYIELD_UNIT_ARCHAEOLOGIST, skipped) add their value: runs/h1_duelv1124
  a city-state's Shrine logs FX(-9999) plus its own value on 124 of the 127
  analyses at six units or more at peace, and its own value on 356 of 362
  below (the remainder the lab's unit count a step off). The Trader
  (0x7a7110, `traderValue`): 0 once the player's MakeTradeRoute units
  (+0x1b9 bit 64) fill its capacity (0x4d9320, + the extra the caller adds);
  else the trade AI's route value K (its knowledge base +0x6d8, logged as
  AI_Knowledge.csv "TRADE, TO -1, VAL" by 0x5ed280; its writer unread) from
  T to min(T + 30, H) (one discounted turn where they meet), plus a route's
  era score (0x2c4470: the eras record's +0x44, none for a city-state) as
  PSEUDOYIELD_GOLDENAGE_POINT, x4; the analysis reads the K the turn before
  logged (Lighthouse 96 -> 110, Market 91 -> 107 of 1124's at the same T).
  0x78e0a0 (per known city of the knowledge base +0xe0 entries, the routes'
  yields 0x526330 / 0x525b90, 0x5520a0) is the trade AI's route walk, not the
  unit table: that is 0x7989e0 (the section "C-96 / C-97: the unit value").
- HOUSING 0x7a3d70 (`housingValue`, args: CityBuildAI, the city's growth
  +0x1788, the rate, population, Housing, T, H): S = the Food surplus less
  the citizens' (0x1b5620: City::GetYield FOOD - 0x5276c0(pop)), housing
  0x1b5840 (whole); the factor 0x527ca0(left) = 0 below
  CITY_HOUSING_LEFT_ZERO_GROWTH (-4), 0.25 to _25PCT (0), 0.5 at _50PCT (1),
  else 1. Over the forecast's steps from T (0x5d2c50: the first entry whose
  turn is past the one given): a step at population p pays 2 x
  DefaultValue(Food) x (S x (factor(housing - p + Housing) - 1) + the Food
  the step withholds), PV to min(H, the next step's turn) less PV from
  max(T, its turn); past the last step, where it withholds Food, to H. THE
  FORECAST 0x5cb570 (CityBuildAI +0x6c8 turns, +0x738 withheld, +0x7a8
  population; each turn's full update): the current factor g (0x1b5f70);
  where g < 1 a step (0, S(1 - g), pop); the turns to the next citizen
  0x1b6390 (the threshold 0x5276e0 less the store +0x80 over S x the overall
  growth multiplier 0x1b62d0, rounded up; -1 with no surplus); then per next
  citizen while the turn is below 100 (+0x6c0): its factor, a step where it
  changes, the whole turns its threshold takes at g x S, S less 2.0 (at
  least 0). The Sewer 7 -> 47 and the Granary 172 -> 177 of 1124's. A
  city-state's forecast is of its citizens and store before the turn's
  growth while the analysis reads the rest after it (runs/h1_duelv1121
  Ayutthaya's Granary: t18, grown to 3, logs 14.11, no housing term — the
  forecast of population 2; t20-t24 each the housing term of the forecast a
  turn longer; LAB, the update's place in the turn not read).
- THE ANALYZERS added (each its whole part): EFFECT_GRANT_ABILITY 0x6b5b30
  (per subject the ability's UnitAbilityModifiers analysed in a copy of the
  context, 0x142650, their sums added); COLLECTION_CITY_TRAINED_UNITS
  (0x69ffa0: once, the evaluation's city); EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER
  0x6c09b0 (its parser 0x6c0590 stores Amount x 0.01f as unweighted Gold;
  no unit: the city's Production, City::GetYield, times it, from T to H) —
  the Barracks', Stable's, Lighthouse's trained-unit XP, an integer 0..3 at
  a city-state; COLLECTION_CITY_PLOT_YIELDS (0x69feb0: the city's plots of
  index below 0x5cbc0(2) + 18 that it owns) with EFFECT_ADJUST_PLOT_YIELD
  0x6afa10 (a plot not impassable: half the Amount's PV(H) - PV(T),
  unweighted) and the plot evaluators TERRAIN 0x6d1dd0 (+0x2c), FEATURE
  0x6d4380, RESOURCE_TYPE 0x6d1970 (+0x40), RESOURCE_VISIBLE 0x6d1c00,
  HAS_ANY_IMPROVEMENT 0x6cfcd0 (+0x44) — the Water Mill 121 -> 163 of 1124's;
  EFFECT_ADJUST_TRADE_ROUTE_CAPACITY 0x6c0ff0 (the Trader's worth with the
  Amount's capacity more); EFFECT_ADJUST_PLAYER_RESOURCE_STOCKPILE_CAP
  0x6b8e10 READ, not ported (no Amount: the whole part of the best of the
  city centre's UNITS values, 0x5d4cd0, over the units each resource — or
  the named one — lists, Resources +0x100; it waits for the units' table).
- PARTLY: the GlobalParameters +0x6b4 term of a negative Amenity balance
  (PSEUDOYIELD_GOLDENAGE_POINT). ASK: a city-state's Barracks and Stable
  read their Great General point at 0 (the lab with PSEUDOYIELD_GPP_GENERAL's
  factor 0: the Barracks 0 -> 740, the Stable 0 -> 468 of the five duels'
  within 0.005; every other class counts: the Prophet's, Scientist's,
  Admiral's, Engineer's and Writer's at 0 lose their buildings' matches).
  The military AI's turn writes PSEUDOYIELD_UNIT_EXPLORER's weight (its
  +0x790 array) as (desired explorers +0x930 - held +0x9f0) - 1.0 and
  PSEUDOYIELD_UNIT_NAVAL_COMBAT's as (desired naval +0x990 - held +0xa50)
  - 1.0 (0x7204c3..0x7205ae, `shl 8; sub 0x100`); a city-state desires and
  holds none (AI_Military.csv "0:0, 0:0" on every city-state turn of
  runs/h1_duelw1117 / 1121 / 1124), so both read -1.0, factor 0: every
  Galley and Quadrireme the city-states log is its Maintenance alone
  (runs/h1_duelv1117 Caguana t18 Galley -4.14 at T 19, Valletta t13 -2.28
  at T 27) and Sailing's unit term none.
  0x700810's sum is max(-1.0, military AI +0x7e8 + player AI +0x620 + the
  lists +0x768 / +0x748) plus, for the GP pseudo-yields (@0xf2e218
  GPP_GENERAL .. @0xf2e238 GPP_MUSICIAN), the eras' 0x2c4230 points as
  GOLDENAGE_POINT; the military AI's turn 0x71fb80 writes +0x7e8 for
  UNIT_COMBAT, NAVAL, EXPLORER, NUCLEAR, STANDING_ARMY, never GPP_GENERAL;
  the +0x620 array's writer is unread.
- Measured (`cpu/harness/cityBuildLab.ts --logtech` over runs/h1_duelv1117 /
  1121 / 1124 / 1127 / 1128, every city-state's centre BUILDINGS row, a value
  at or below -9000 counted as none, the trade route value from
  AI_Knowledge.csv): 24,438 logged values, 22,991 valued by both, 7,582
  within 0.005 at the reconstructed T (8,782 with the General at 0), 11,526
  at some T below the horizon (13,320); 1,447 the log's alone, 1,318 ours
  alone (3,041 before the free units' exit). The Monument 255 of 255 at some
  T, the Grove 1161 / 1161, the Water Mill 100%, the Walls 91%, the Castle
  89%; the heaviest residuals the Lighthouse (31% at some T) and Shipyard
  (32%) — the lab's district progress a turn off (1124 Cardiff t49..t55 logs
  each turn's value one turn late) —, the Market (50%), the Arena (53%), the
  Temple (0%: the Warrior Monk's unit value, a combat unit's). The city's
  percent on a yield (city +0xbc0) is the modifiers' alone, not the
  happiness level's (1127: 477 -> 801 within 0.005).
- Unread: the knowledge base's army records and the Combat Desire's strengths (the unit value's inputs), the
  project value 0x7b28c0, the resource value 0x7a21e0 (3 KB: luxuries'
  amenities over the player's cities, strategics over the units needing
  them) with CityBuildAI +0x978's counts (0x5d45c0), the events (0x5cd150,
  0x5cc910, 0x5ccc10, 0x5cced0, 0x5cd4e0) and their trees' nodes, the
  contracts (Contracts.cpp: the contract line 0x5f4cd0, the queued line
  0x5f3710, PURCHASE 0x5f3c40, FAITH PURCHASE 0x5f3ee0), the cancellation
  0x5d7640 ("Canceling current build"). About 224 KB of code reaches from
  0x5ce680 and 0x5ce970.

## C-96 / C-97: the unit value — READ (the combat, trade, explorer branches, the tail, the military AI's unit production), PARTLY READ (its inputs)

`unitValue` / `unitTurns` / `unitTable` in `cpu/core/aiCityBuild.ts`,
`unitProductionTable` in `cpu/core/aiUnitProduction.ts`; the efficiency
table `AI_UNIT_EFFICIENCY` in `cpu/data/aiBuildTables.ts`
(tools/install/ai_tables.py). Check: `cpu/harness/cityBuildLab.ts` (the UNITS
rows; `--kb -1` the knowledge base of the turn before, `--enginekb` /
`--nodesire` the engine's own inputs).

- THE TURNS (0x5ce970's unit loop, 0x5cf360..0x5cf6ac): FX(-9999) where the
  CityBuildAI's CanTrain 0x172820 (the player AI +0x12a0 +0xba8 flag set)
  refuses — called with its sixth argument set (+0xe8: the PrereqTech and
  PrereqCivic checks 0x172951..0x1729ab skipped), so a locked unit is
  valued on the research AI's turns, not m_turnsToResearchUnit; else T = max(the research AI's turns 0x7610e0 to PrereqTech + 5,
  the civics AI's 0x621920 to PrereqCivic + 5) — the +5 (`lea ebx, [rax+5]`)
  whenever the column is set, the technology held or not —, then the least
  of the Unit_BuildingPrereqs buildings' turns (+0x258), then, but for
  MustPurchase (+0x1b9 bit 128), the train turns 0x17bb40 and +10 while the
  city builds another item; negative T values FX(-9999). Measured: the
  units with a PrereqTech logged at our T + 5 on 253 of 260 1124 Archer rows
  before the +5 (Spearman, Heavy Chariot, Catapult, Crossbowman alike).
- THE VALUE 0x7b62c0 (out, unit, &rate, T, H, player, city): T >= H, a unit
  not the player's version (player +0x12e8 +0x1c0), a domain the city cannot
  train (0x17d660), a non-full, non-tribe player at peace with more than five
  units, a Spy for a non-full player -> FX(-9999). By the pseudo-yield
  (Units +0x290, PSEUDOYIELD_UNIT_COMBAT where none):
  COMBAT / NAVAL / AIR: the military AI's unit production value 0x79ca90
  (player AI +0x1290 +0x268: a linear find in its 0x168-byte entries, +0x160;
  0 for a unit it lacks), x3.0 where the entry's obsolete flag (+0x08,
  0x79d2d0) is set, + fx(0.5 x the player's cities (player +0x12f0 +0xc0))
  where Combat (+0x48) exceeds 0x4d9320 on player +0x1330 (PlayerStats
  +0xf0, the strongest melee strength trained: a city-state's 25 at the
  start) — runs/h1_duelv1121 t17 Hunza: the Heavy Chariot (Combat 28) its
  table's 1.16 + 0.5, 7.35 as logged, the Spearman (25) and Warrior (20)
  their table values alone (2.87, 14.31; runs/h1_duelv1124 Cardiff's
  Warrior likewise); AIR + 30.0 where its PrereqDistrict (+0x278) in
  the city holds no aircraft, else 5.0 a free slot; NAVAL FX(-9999) at a
  city with no water (0x82a10) and no Harbor (0xcbecc739) for a unit of no
  RangedCombat (+0x6c). TRADE (0x7b6525..0x7b6582): 0x7a7110(out, player,
  &rate, T, T, 0) — the landing turn T passed as both start (r9d) and
  horizon (the fifth argument, both from [rbp+0x118]), extra 0 — so its end
  min(T + 30, T) is T and its value is one turn's K discounted to T
  (0x7a1240), x4; then through PSEUDOYIELD_UNIT_TRADE, into the tail.
  Section "C-96: the Trader's value" holds the cases. RELIGIOUS: ReligiousStrength (+0x78) x 0.01, SpreadCharges (+0x7c) or
  ReligiousHealCharges (+0x74) by the counts 0x4be880, 0 with no majority
  religion (0x4681c0 +0x1c0) — and PSEUDOYIELD_TOURISM terms (ParkCharges
  +0x64, Units_XP2 TourismBomb). ARCHAEOLOGIST: min(artifacts / 56, 10) and
  the eras' points. EXPLORER / SETTLER / SPY: 1.0 + the eras' points
  (0x2c43b0) as PSEUDOYIELD_GOLDENAGE_POINT. THE TAIL (0x7b709f): WMDCapable
  (+0x1ba bit 64) PSEUDOYIELD_NUCLEAR_WEAPON; x (the city's extra copies + 1,
  0x179dd0); x the promotion class weight 0x723bb0 (PromotionClass +0x288:
  1.0 with none; 0 where the class's base +0x708 is 0 — a city-state's RECON,
  MinorCivUnitBuilds -100 —; else max(base + the +0x778 term, 0.1)); a
  StrategicResource (+0x2c8) the player holds none of (0x4aa790 ownerships
  0 and 1) and no city counts near it (CityBuildAI +0x978, 0x5d45c0) ->
  0 outright; through the pseudo-yield (0x7a60d0); below handicap 3 (player
  +0x908) less Maintenance (+0x5c) less player +0x13a0 +0x338 (at least 0)
  as Gold — measured 0.5 a Maintenance at a city-state, the unweighted
  DefaultValue (1124 t28 Archer 431 -> 304, Spearman 290 -> 161 raw); then
  PV(H) - PV(T); a FoundCity unit's 0x6fe2b0 + 0x17a600 turns; ParkCharges'
  tourism (0 where the culture AI +0x6f8 > 0); a Units_XP2
  ResourceMaintenanceType (+0x50) whose stockpile is out zeroes the value
  before the modifiers (0x7a4b20, the per-unit list GlobalAI +0x3a50).
- THE UNIT PRODUCTION TABLE 0x7989e0 (AI/UnitProduction.cpp; run from
  0x6fae70 at the player AI's turn while 0x79d320 — the built flag +0x28 —
  is clear): entries, in the Units' order, for each unit the player's version
  of itself, an obsolete one (0x538460: MandatoryObsoleteCivic +0x238 /
  Tech +0x240, ObsoleteCivic +0x248 / Tech +0x250 held) only while the player
  holds one (0x4f2c90), a unit not yet trainable only where the player
  signal +0x168 (0x79ba50) answers (a not-yet-trainable unit: its
  PrereqTech or PrereqCivic unheld, 0x4cb590 / 0x39d490; the one listener
  the research AI's 0x75d3d0, functor vt 0xd6f258 bound in 0x761d30: its
  m_turnsToResearchUnit (+0x388, data +0x3e0) at the unit is not 0 — the
  vector 0x763b00 fills from 0x761090 on player signal +0x228, the turn's
  end after the city AI: zeroed, then per technology entry whose turns
  (+0x1c) are >= 0 each unit the technology unlocks (the entry's list
  +0x20, 0x761b70) takes those turns; a unit locked by a civic alone never
  answers); per entry its flags (+0x08 obsolete,
  +0x0b Units +0x1ba bit 128, +0x0c TraitType +0x2d0, +0x0e a held strategic
  resource), Cost +0x38, Range +0x68, max(Combat, RangedCombat), Combat, the
  Units_XP2 maintenance resource and amount, and a per-player vector of 64.
  The opposition: per Units row of Combat above 0 not obsolete to the player
  with a combat pseudo-yield (or none), over the player list (0x483b50
  +0x4a0) the knowledge base's count of it (CivKnowledge 0x5eb650: the
  player's army records, AI_Knowledge.csv's ARMY lines "UNIT_X count age"),
  N their total (the at-war ones, 0x469cd0, apart); each entry's +0x30 sums
  count x efficiency[that row][the entry] (GlobalAI +0x3c8: raw, row the
  opposing unit), +0x2c the at-war counts, the per-player vector likewise.
  With N = 0 every entry reads 1.0. Value +0x160 = N / +0x30 (0x16e940,
  truncated); x1.25 (@0xd70c98) for a TraitType unit; a shortfall of the
  maintenance resource scales it; the player's units of each type counted
  into +0x20; sorted by 0x79d3a0 (+0x0e, +0x2c, +0x30, strength). The
  value 0x799b9d computes from the player's counts (+0x510, +0x4a0) feeds
  asserts only. The city hook 0x79a320 copies the table per city, the
  +0x2c / +0x30 times the extra copies.
- A FOUNDING TURN'S TABLE (the city's first look, C only): the unit
  production table counts no known unit — N 0, every entry 1.0. The five
  verbose duels' t1 UNITS rows: every city-state's Warrior, Slinger and
  Builder (pseudo-yield none: the combat path; no Maintenance; their
  promotion weights 1.0) land on the one value curve of an entry of 1.0, each
  at its own T — runs/h1_duelv1117 Valletta Builder 17.38 / Slinger 15.19 /
  Warrior 14.11 at T 4 / 7 / 8, Antananarivo 13.04 / 8.25 / 6.20 at T 10 /
  19 / 23; 1121 Hunza 18.29 / 16.53 / 15.61 at T 3 / 5 / 6 — and the
  Default Specialization takes the Slinger (no BuildCharges unit). From t2
  the table counts the knowledge base's records (1117 Antananarivo t2
  Warrior 9.95 at T 15 as ours). The founding T: MINOR_CIV_PRODUCTION_MILITARY
  (+200%, PLAYER_CITIES) is not yet on the founding city while the
  Builder's (PLAYER_UNITS) is (`minorBuildFacts`' `fresh`, the GPU's
  `no_known`): Valletta and Caguana's 8 / 7 / 4, 1124 Cardiff's, the
  Archer past the horizon (Archery's 37 turns + 5 + its own at the bare
  Production; Galleys valued) — the founding Production itself differs from
  the record's of t2 for Hunza (6 / 5 against our 7 / 6), 1124 Granada (12 /
  10 against 10 / 9: 2 x 0.9, as if Displeased) and Antananarivo (its
  citizens' first placement and amenities unread).
- THE MILITARY PRODUCTION'S UNITS (EFFECT_ADJUST_CITY_ALL_MILITARY_UNITS_PRODUCTION,
  registered 0xc1e610, its arguments' object vt 0xdf78a8, apply +0x60
  0xb7e0d0): per Units row whose FormationClass (+0xa0, 0xadd5e0) is not
  the civilian one (2) and whose PrereqCivic's / PrereqTech's era (+0x270 /
  +0x280) lies in StartEra..EndEra, the Amount onto the city's per-unit
  production modifier (0xc6f950; read back by 0x17c1c0: city +0x2c0[unit] +
  player +0x12e8 +0x4a0[unit]) — support units too (runs/h1_duelv1121 t17
  Hunza's Battering Ram valued at its Spearman's 22 turns, -3.10 as logged,
  against 27 without the +200%).
- THE EFFICIENCIES (0x79d040 allocates, the job 0x79a440 fills, "Could not
  find a neutral player"): per pair of Units rows both without strength
  (max(Combat, RangedCombat, Bombard) 0 and AntiAirCombat 0) 1.0; one
  without against one with 0.01 / 100.0; else two combat simulations
  (0x205720) of the neutral player's units, each attacking the other: the
  damage each takes in both (+0x7c / +0xc4 words), 100 / damage the
  exchanges to kill, a range advantage ((Range - 1) / the other's moves,
  rounded up) added where the domains match, AntiAirCombat terms against
  air; M[a][b] = a's exchanges-to-die over b's. Logged once a game as
  AI_UnitEfficiency.csv (", %3.2f"), the same in every recording; the port
  reads that table at its 0.01 (the job is unported).
- THE COMBAT DESIRE: the military AI's turn (0x71fb80, 0x721302..0x7219ee)
  writes the PSEUDOYIELD_UNIT_COMBAT weight (+0x790): from its strengths
  (+0x398 its own, +0x3f8 the enemy's, +0x458 the others', logged as
  AI_Military.csv's Regional / Enemy / Other Strength) — below the enemy's
  (enemy - own) x @0xd55ff0, below a target (target - own) / +0xd8, 20 past
  the enemy a negative term toward the others' with caps 2.0 / 3.0 —,
  clamped against +0x7e8, at most 2.0 at peace (+0x4b8 clear), plus the
  cities' CityBuildAI +0x2d8 as PSEUDOYIELD_STANDING_ARMY. Logged as
  AI_Military.csv's Combat Desire (1124 Cardiff: 0.1 at t9 -> the Warrior
  10.73 -> 11.05 at the same table value; 0.6 at t13 x1.6).
- MEASURED (`cityBuildLab.ts --logtech --kb -1` over the five verbose
  duels, every city-state centre UNITS row, the knowledge base of the turn
  before from AI_Knowledge.csv and the turn's Combat Desire from
  AI_Military.csv): 59,767 logged values, 57,247 valued by both, 32,988 within
  0.005 (Scout 2,385 / 2,385, Builder 2,299, Warrior 2,059, Slinger 2,060,
  Swordsman 1,926, Archer 1,420, Spearman 1,130); on the engine's inputs (its
  knowledge base the minor's own units, no Combat Desire) 27,209. The rest:
  the item in hand a turn off (the buildings' lab residue), the table where
  the knowledge base moves, the support units (Battering Ram 18 / 2,256,
  Siege Tower, Military Engineer: Combat 0, the 0.01 / 100 rows), the
  religious, Archaeologist, Rock Band and air units (unported).

## C-96: the knowledge base's army records and the Combat Desire — READ (the records, the update, the desire), PARTLY READ (the signals' looks; the standing-army count in its own section below)

`minorKnowledge` / `minorKnownUnits` / `minorCombatDesire` in
`cpu/core/minorBuild.ts`, `cityStateSight` in `cpu/core/fog.ts`,
`combatDesire` in `cpu/core/aiMilitary.ts`; GPU `_minor_knowledge` /
`_minor_sight` in `gpu/core/sim_minors.py` (the records only). Check:
`cpu/harness/cityBuildLab.ts` (KNOWLEDGE BASE against AI_Knowledge.csv's
ARMY lines, COMBAT DESIRE against AI_Military.csv).

- THE RECORDS (CivKnowledge.cpp, the knowledge base at player +0x12b8): per
  player (0x18-byte vectors, 64 of them) per unit type a list of 0x20-byte
  records — +0 the unit's id (Unit +0x100), +4 / +8 two unit fields
  (+0xcf0, +0xc90), +0xc the age, +0x10 its plot (x, y), +0x18 / +0x1c the
  plot's two map ids (the second its area). 0x5e9530 (from 0x5f0440) finds
  the unit's id in its type's list: found, age 0 and the plot rewritten;
  else a record appended. The ARMY log line (0x5eceb0, "%s %d %d,") prints
  per type the list's size and its oldest age; the counts 0x5eb650 reads
  (the unit production table's) are those sizes over every player, the
  player's own included.
- THE AGEING (0x5ebb30, the first step of the tactical AI's turn 0x785f30 on
  player signal +0x1f8): every record's age + 1; one whose age before the
  step was above 0x14 is erased (0x5f09b0) — a record lives through age 21
  (runs/h1_duelv1124 minor 3's dead Warrior 131073: on its ARMY line from
  t17 to t38, gone at t39).
- THE LOOK (0x7877e0, Targets.cpp, "Invalid unit when updating AI knowledge
  base"; after the ageing in 0x785f30 and again on player signal +0x228):
  over every plot the player's visibility count (+0x290) holds above 0 —
  a city -> the known cities (0x5f0280), a district -> 0x5f0490 — each unit
  on it (0x75ce0's list), one hidden (+0x15f0, not +0x1650) only where
  0x5033a0 lets the player see it, through 0x5f0440 into its owner's list;
  a barbarian camp improvement (plot +0x44 the barbarians') -> 0x5f0110.
  Player signal +0xc0 (0x7874a0, bound in 0x7864c0 at 0x786b25) records
  a unit of the player's own through 0x5f0440 with no sight asked: the
  unit it made. Game signal +0x2e8 (0x7838a0) walks a city's list
  (+0x1a50) into the known cities, not a unit; the lambda 0x783570 (one
  unit, through 0x5f0440) is referenced only from 0x787fb0, its caller
  unread.
- THE LOG'S MOMENT (READ): 0x785f30 runs the ageing, the look, then the
  targets update 0x783980, which writes AI_Knowledge.csv's lines (0x7858b7
  -> 0x5ed280 -> 0x5eceb0) — so a turn's ARMY lines show the records after
  that turn's ageing and look, before its units move and before the turn's
  end look (player signal +0x228). A record's age is the count of ageings
  since it was last seen (+0xc reset to 0 by a sight or a birth): a unit
  made before the turn's ageing reads age 1 on that turn's line.
- THE CITY-STATES ONE AT A TIME (the replay): each city-state's turn opens
  with the city-states before it standing where their turn left them (the
  record t+1's plots: `holdMinorStart`), and a city-state's own unit the
  next record lost stands, for its end look, on the last plot the log's
  steps of the turn took it to. The cases: runs/h1_dueld1121 t40 Ayutthaya's
  Galley out of Antioch's sight before Antioch's look (its record the
  game's age 1, ours 0 before); h1_dueldA1117 t8 Valletta's Warrior walking
  to 13:12 and falling after the look (its record the game's 13:12). --aiscore
  --to 60, the five dueld duels: knowledge.army 59.5% -> 61.7% (ages one
  turn younger 208 -> 73 rows). Left: 1117 t42 city-state 3's sight of
  China's units is the levied Warriors' return a pair late (the replay's
  levy clock).
- THE DEFENDER'S RECORD OF ITS ATTACKER (READ): the combat log 0x20d280,
  after its CombatLog.csv line, raises game signal +0x4c8 and player signal
  +0x78 of the defender's owner (0x20d7e5: the unit's +0x2e0) with the
  attacking unit (0x20d7f8). The signal's functor (vtable @d70448, entry
  0x787fb0) calls 0x783570, which records the one unit through 0x5f0440
  (its id +0x100, owner +0x2e0, type +0x160, plot +0x220) with no sight
  asked: the record found takes age 0 and the plot, else one is added. The
  plot is where the attacker stands once the combat is done, after a melee
  victor's advance, and an attacker the combat killed is not recorded.
  Cases: runs/h1_dueldA1117 t8 Caguana's Warrior 196610 kills the
  barbarians' Scout on 42:10 and advances: the barbarians' t8 tactical read
  (before the ageing) holds it on 42:10 at age 0, age 1 on their log (their
  look does not see it); t10 / t11 China's Warrior 131073 strikes the
  barbarians' Scout from 30:20, then kills it and advances to 29:20, their
  record following; t22 the barbarians' Scout steps to 14:12, strikes
  Valletta's Warrior and falls on the blow: Valletta's record of it stays
  13:13, where its end look saw it; runs/h1_dueld1121 t22 Hunza's end look
  sees the barbarians' Quadrireme on 8:3, which then strikes its Warrior
  from 9:1: Hunza's t23 tactical read holds 9:1 at age 0. The engines:
  `recordAttacker` / `_kb_attacked` on the melee unit arm (after the
  advance), the ranged and the hostile ranged unit arms. The replay takes
  a later player's blow on a city-state's or the Free Cities' unit after
  their end looks (`lateBlows`), and lifts the units an earlier city-state
  killed out of the later ones' turns (runs/h1_dueld1127 t39: the
  barbarians' Slinger Hattusa killed on 7:10, out of Mexico's look; the
  record's battles land after the minors' turns). --aiscore --to 60, the
  five dueld duels: knowledge.army 64.9% -> 69.9% (another player's unit
  on another plot at the same age 299 -> 46 rows).
- THE REPLAY'S UNITS AS THE KNOWLEDGE BASES SEE THEM: a record unit our
  battle killed and the game's did not keeps its engine id when the next
  pair's world re-makes it, so the records of it stay its own
  (runs/h1_dueldA1117 t50: China's Scout 983049, 58 damage on our blow to
  the game's 53, held once). A civilian the barbarians seize stands its
  owner's, on its plot, through their tactical turn's ageing and look, the
  seizure after it (1117 t33: China's Settler steps to 31:14, the
  barbarians' log holds it there at age 0 and their own Settler first on
  their end look). A barbarian a battle of the pair fought opens their turn
  on its plot in the pair's first record (1117 t22: their Scout on 13:13,
  which stepped to 14:12 and fell on its blow, their record of it 13:13);
  a minor's own unit record t+1 lost and the log's steps never moved stands
  for its end look where its turn found it (1124 t21: Cardiff's Warrior
  strikes from 8:14 and falls in the barbarians' turn, its record 8:14).
  --aiscore --to 60, the five dueld duels: knowledge.army 69.7% -> 81.1%
  (a player's own unit on another plot at the same age 229 -> 47 rows).
- A UNIT A CITY MAKES (READ): the train order (0x175730, "pFront->eDirective
  == ORDER_TRAIN") makes each unit through the city's create 0x1e6570, which
  picks the plot (the centre; a district for a domain that needs one) and
  places the unit with 0x586d40(unit, plot, 1, 0). Flags 1 run the
  location test 0x586360 with no flag bit set: the plot is refused for its
  terrain (impassable, the unit's domain), another player's closed borders,
  a unit type that needs a district off one, or a hostile defender there
  (0x208b80) — never for the owner's own units. A refused plot goes to
  FindAlternateLocation 0x585940 (range 10). So a trained unit lands on the
  centre whatever of its owner's stands there, stacked until one of them
  moves; no step parts them (runs/h1_dueld1128 t19: Hong Kong's Warrior
  327683 added on 9:7 with its Warrior 196610 there, which steps off in its
  turn; t50 China's Archer 983042 on Archer 917504's centre; record t24
  holds Rome's Warriors 393216 and 589828 both on its centre 42:20). A
  purchase is
  refused where a unit of its class stands (`purchaseSpotBlocked`), so a
  bought unit stands on a centre its class leaves free. The engines:
  `spawnUnit`'s 'stack' (`tileFreeForUnit`'s `stacks`: the owner's units
  block none) for the majors' trained units, Settlers, copies and twins,
  the city-states' and the Free Cities' trained units; the GPU's
  `_spawn_unit` / `_spawn_barb` `stack`, the occupancy plane keeping the unit
  already there (`_occ_set_new`) and taking the next of its class when it
  leaves (`_occ_clear`). --aiscore --to 60, the five dueld duels: knowledge.army 1184 -> 1207 of 1460, every other kind within one row; the CPU tests 2659 of 2659 before and after.
- A HULL ON A CITY CENTRE (READ): 0x586360's domain test reads the unit's
  domain (+0x650; DOMAIN_SEA 0, DOMAIN_LAND 2). A sea unit stands on water;
  on a plot not of water only where a district stands (plot virtual +0x40)
  whose info word +0x14 carries the water bit (0x81240 argument 0, bit 1); a
  land unit the same with the land bit (argument 2, bit 4) on water it may
  not embark onto. A City Centre's word answers both (the trade path reads
  its plot neither land nor water, above), so a hull is placed on its
  centre (runs/h1_dueld1128 t56: Rome's Galley 1245190 trained onto 42:20;
  1121 t30: Ayutthaya's Galley 524294 onto 42:18) and steps through it as
  through a Canal. The engines: `hullPassage` (a City Centre or a complete,
  unpillaged Canal) wherever a hull may stand or step — `hullTile`,
  `tileFreeForUnit`, the move mask, the step's cost, the tactical
  `enterable` (its own centre alone) — and the GPU's `_hull_pass`
  (`_centre_plane` with the Canal), the tactical NAVAL plane with it.
  Who writes the word +0x14 is unread: an inland centre is reached by no
  hull and trains none. --aiscore --to 60, the five dueld duels, with the next entry: knowledge.army 1207 -> 1212 of 1460, researchScore.minor 12814 -> 12844 of 15577, unit.trained compared 96 -> 94 (82 equal), cityState.move.plot 2053 -> 2052; the CPU tests 2659 of 2659.
- A UNIT TRAINED AND UPGRADED IN ITS PLAYER'S TURN (the replay): the
  engine's own unit of the chassis that upgrades to the record's is the
  record's, and a city-state's upgrades land before the next city-state's
  turn (runs/h1_dueld1128 t41: Hong Kong's Warrior 851968 trained and
  upgraded to the Swordsman 917509 before Granada's look; Granada's record
  a Swordsman, no Warrior).
- A DROUGHT IN THE PLOT ANALYSIS (the PLOT ANALYSIS LOG of the verbose
  recordings): an improvement a drought on the plot bars (the drought's
  list, `droughtBars`), which the plot's ground takes otherwise, is valued
  0.00, not FX(-9999), and the plot stays improvable — the plot test asks
  no drought, the build does. runs/h1_duelv1128 Hong Kong: the Farm at 9:6
  72.45 to t4, 0.00 through the drought of t5-t9, 71.45 at t10; t16-t17's
  drought makes 8:5's, 7:6's and 7:7's Farms and 8:6's Camp 0.00 while
  7:5's Mine stays 71.45. A Farm at 0 is a researched pick of value 0 that
  holds a higher unresearched one off (`pickImprovement`): Hong Kong's
  Mine at 8:7 (34.23-47.99, Mining not held) is never picked through the
  drought, and the Farm is laid on 9:6 at t10, where the engines picked
  the Mine at t7 and held the slot on its Mining contract. The engines:
  `minorPlotEvals` / `_minor_plot_evals` (`_minor_ground_imps`'s `drought`).
  The replay counts an improvement the engine's turn change (its random
  events) took or laid as `draw:eventImprove`, no Builder's (runs/h1_duelu1124
  t82: Cardiff's Farms on 539, 582 and 627 gone in the engine's turn change).
- THE FOUNDING SETTLER'S RECORD: a city-state's knowledge base holds the
  Settler that founded its city, a unit gone, aging as any record to 21
  (runs/h1_dueld1121 aimem: each city-state's SETTLER on its centre at age
  1 on t2's log, 2 on t3's). The engines: `placeCityStateAt` (its
  `settlerSeen`: the replay's founding the turn before), the GPU's t0 load
  (slot -1). --aiscore --to 60, the five dueld duels: knowledge.army 42.1%
  -> 59.5%. Left: a record's plot where the unit last stood (the replay's
  copy puts a unit the record lost where its turn found it: 1117 t9
  Valletta's Warrior last seen at 12:11, the game's 13:12, both at age 1),
  ages one off (1121 t40 city-state 4's record of player 3's Galley, 0 / 1).
- LAYER 0 FOR EVERY PLAYER: no ARMY line of runs/h1_duelw1117-1128 names a
  Missionary, Apostle, Inquisitor or Guru, nor another player's Trader; a
  player's own Trader is on its line from its birth, never refreshed, its
  age climbing to 21 then gone (runs/h1_duelw1117 city-state 3's Trader
  made at t32: age 1 at t33 to 21 at t53; its next made at t63: t64-t84).
  The engines' look takes no Trader and no religious unit for any player,
  and `spawnUnit` / `_spawn_unit` / `_spawn_barb` record the unit made
  (`_kb_birth`), its age 0 as of the knowledge base's last ageing.
- MEASURED (--aiscore, `--to 60`, knowledge.army player-turns equal; the
  memory read at the log's moment, `traceKnowledge`, the type names the
  log's): runs/h1_duelw1117 48.8% -> 56.6%, h1_duelw1121 47.8% -> 60.3%.
  The decisions on clean memory: barb.move.plot compared 16 -> 91 (1117),
  12 -> 146 (1121); cityState.build 165 -> 168 of 174 (1117).
- THE LOOKS AGAINST THE TURN'S MOVES (the replay; the game's order:
  turn_order_civ6.md, the starts in ascending player id, each AI player
  acting in its own start): the barbarians' end look (+0x228) sees their
  units where the game's moves left them, not where the replay's copy of
  their AI moved them (runs/h1_duelw1117 t16: the copy's Warrior beside
  city-state 4's at 28:5, the game's not: the record's age 2 at t17, ours
  1); a city-state's look sees an AI major's units after that major's own
  start of the turn moved them, the active player's before its actions
  (runs/h1_duelw1117 t20: China's Scout gone from 41:12 by city-state 3's
  look, the log's age 1). The replay: the barbarians' records after their
  tactical turn's look, their end look once their units stand as record
  t+1 holds them; the other majors' units as record t+1 holds them while
  the city-states' turn runs. MEASURED (knowledge.army, --to 60): 1117
  56.6% -> 61.0% -> 66.1%, 1121 60.3% -> 69.8%; barb.move.plot 869 -> 872
  of 957 (1117), 862 -> 863 of 944 (1121). Left: units the replay's AI
  made that the game did not (a birth record each pair: 1117 city-state
  4's Archer t25-t27, 1121 city-state 2's Archer t32-t34); 1117 t42 the
  game's city-state 3 sees a turn before ours (player 1's Archer and a
  second Scout, the barbarians' Scout, all age 0 at t42, ours at t43-t44)
  and holds three more Warrior records of its own (8 against 5, age 16).
- MEASURED (the lab's update over the five verbose duels in turn order —
  the players before the minor where the next record has them, its own
  units made this turn, its turn's end with its units where the next
  record has them): the unit table on these counts and the logged Combat
  Desire takes 32,838 of the 57,247 UNITS values both value (32,988 on
  AI_Knowledge.csv's own counts); every type's count as logged on 1,940 of 3,600 minor-turns. The
  residue is the lab's: a unit made and lost between two records.
- THE COMBAT DESIRE (the military AI's turn 0x71fb80, a city-state from
  0x7204bc): the yardstick B = max(1, PlayerUnits +0xf0 (the best melee
  Combat made), 0x4bd030 = max(+0x150, COMBAT_MINIMUM_CITY_STRIKE_STRENGTH));
  per player in the players list (0x483b50 +0x50) the strength summed over
  the military AI's primary region list (+0x1290 +0x2f0, "THE REGION
  LISTS": every region within three of its cities) of the records 0x5eb430
  returns — called with no area (r8 null) and the region object 0x3beb0
  looks up by id on the map's region list (map vt +0x108, the lookup
  0x6fa5e0's region lists take too), so the record's +0x1c, its plot's
  region (plot +0x18), against the region's id; age at most 2 —, each unit's
  max(Combat, RangedCombat) where it plus 20 exceeds B; the player itself
  adds each city's unit at the head of its queue (0x179860 on city +0x2170)
  of such strength — Regional (+0x398); a player at war (0x469cd0) or
  flagged (+0xd18) gives Enemy (+0x3f8) its max and, not a tribe
  (0x469ce0), raises the floor M (from -0.5, 0xd5fed0) by 0.5 (0xd20458); any
  other gives Other (+0x458) its max and, flagged at +0xc58, raises M by
  0.25 (0xd2f324). Then (0x721302) the desire W := 0; Regional below Enemy:
  (Enemy - Regional) x 0.05 (0xd55ff0); else below the target, the cities
  (player +0x12f0 +0xc0) times B: (target - Regional) / B, whole; else
  Regional - 20 above Enemy: where Regional + 60 is below Other,
  (Other - Regional - 60) x 0.025 (0xd6ced0) capped at 2.0, else (Enemy -
  max(Other - 60, Regional)) x 0.025 capped at 3.0. W below -M is 0, else
  at least M; with no war footing (+0x4b8) and no city's CityBuildAI +0x1b8
  at or above 0 at most 2.0; plus PSEUDOYIELD_STANDING_ARMY_VALUE (@0xf2e2b4,
  0x7a60d0, DefaultValue 0.1) of the cities' CityBuildAI +0x2d8 summed.
  runs/h1_duelv1124 minor 3: t43 20/30 -> 0.5 + 0.2 = 0.7, t50 20/50 -> 1.7,
  t56 0/0 -> 1.0 + 0.2.
- MEASURED (`cityBuildLab.ts --enginekb --ourdesire`, the five duels): the
  three strengths as logged 3,166 / 3,493 / 3,172 of 3,600 minor-turns; the
  desire exact on 1,778 and off by the standing-army term alone (0.1 to 0.3)
  on 1,659; the UNITS values 29,397 of 57,247 within 0.005 (28,586 with no
  desire, 32,838 on the logged desire).
- PARTLY READ: the standing-army count CityBuildAI +0x2d8 (a tracked int at
  +0x280; no writer found through its offsets — taken as 0), the +0xd18 /
  +0xc58 flags, the city's threat +0x1b8 (taken as none), and what the
  signals +0xc0 / +0x2e8 refresh outside the turn's two looks.

## C-96: the standing army and the Combat Desire's city terms — READ (0x5ca7e0, the watched setter 0x731d10, 0x79b9c0), the unit table's orientation READ

`minorStandingArmyShort` (cpu/core/minorCityAi.ts) / `_minor_standing_short`
(gpu/core/sim_minorai.py), read by `minorCombatDesire` / `_minor_combat_desire`.

- 0x5ca7e0, a step of the city's full update (after the threat 0x5cbd10):
  the QUOTA, CityBuildAI +0x220's watched value (+0x278, the setter
  0x731d10 writes +0x58 of the variable), is pseudoYieldValue(
  PSEUDOYIELD_STANDING_ARMY_NUMBER, 1.0, the owner) times fx(sqrtf(the
  city's population +0x588)) (the IAT slot @0xcf47b0 is sqrtf), whole
  (sar 8). Then over the owner's units (player +0x12e8 +0xd8): a unit of AI
  type DEFENDER (+0x1c0 == 4) homed on the city (+0x11d0 == the city's id
  +0xf8) stays in the list unless +0xf30 > 0 with player +0x1278 holding it
  (then it is released: COMBAT 3, home -1); the list sorted (0x5c4910); each
  unit of AI type COMBAT (3) — or EXPLORE (2) whose type's highest AI flag
  up to 3 is COMBAT (0x79b9c0) while the player's units exceed twice its
  cities — with no operation (+0x7d0 == -1), of the land domain (+0x650 ==
  2) or the sea (0) beside a coastal city (0x82a10), joins (DEFENDER, homed)
  while the list is below the quota, else replaces the weakest member of
  lower Combat (0x56dc90). The SHORTFALL, CityBuildAI +0x280's watched
  value (+0x2d8), is the quota less the list's length.
- The military AI's turn (0x7218a5) sums +0x2d8 over the player's cities
  (city +0x31d0 the CityBuildAI) and adds pseudoYieldValue(
  PSEUDOYIELD_STANDING_ARMY_VALUE, 1.0) times that sum (0.1 at DefaultValue,
  raw 25 each) to the desire. The cap of 2.0 lifts with the war footing or a
  city's threat +0x1b8 at or above 0 (`threatened`, the threat of its last
  update).
- The list in full (0x5ca7e0's tail): first the player's units (+0xd8) of
  AI type DEFENDER (+0x1c0 4) homed on the city (+0x11d0 == city +0xf8) —
  one with +0xf30 above 0 that the player's +0x1278 holds (0x623910 >= 0)
  released (COMBAT 3, home -1); the weakest (0x5c4910: the first of the
  lowest Combat 0x56dc90); then per unit of AI type COMBAT (or EXPLORE
  whose type's highest AI flag up to 3 is COMBAT, 0x79b9c0, while the
  player's units exceed twice its cities), in no job (+0x7d0 -1), of the
  land (+0x650 2) or the sea (0) beside a coastal city, not so held: below
  the quota (+0x278) it joins (DEFENDER, homed); else where its Combat tops
  the weakest's it takes the weakest's place (the weakest COMBAT, home -1);
  the weakest found again after each change. The shortfall is the quota
  less the list, below 0 where the list outgrew a fallen quota. A DEFENDER
  takes its own plot alone as an Attack Units spot (0x776140) and goes in
  only before another unit among the strikers (0x775340): runs/h1_duelv1121
  t4, city-state 4's Warrior 131073 (its first unit, the quota 1) wanders
  while 196610 strikes the barbarian Scout it could reach too.
- An operation's recruit clears the DEFENDER: Recruit Units' update
  (0x81c820), after the recruit (0x60a8c0, whose offer does not exclude a
  DEFENDER), lists the operation's units (0x6092c0: the player's units
  +0xd8 with +0x7d0 the operation's id and +0x770 clear) and sets each one's
  AI type (+0x168, setter 0x1e60f0) to its type's own (0x79b9c0: the highest
  UnitAiInfos flag of the type up to COMBAT 3, -1 none), at 0x81cb90..0x81cbd3,
  before the strengths (0x73f7d0). The standing army then counts it no more
  (a unit in a job never rejoins it): runs/h1_duelw1121 Hunza (player 2) t9,
  Attack Barb Camp's "Recruiting strength ... UNIT_WARRIOR" takes its
  standing DEFENDER, the Combat Desire 0.0 at t10 (the city's update before
  the recruit), 0.1 from t11 (AI_Military.csv), the shortfall 1.
- The engines (`minorStandingArmy` / `_minor_standing_army`): the units' AI
  type kept as `Unit.aiDefender` / `unit_defender`, the units' order taken
  as pool order, COMBAT read as not civilian, not recon, of strength above
  0; the EXPLORE clause and the +0xf30 release not ported; the pass's AI type
  (`militaryAiTypeOf`) DEFENDER where it holds; Recruit Units' reset
  (`ownAiType` in cpu/core/opsOrders.ts through the operations' context,
  `_u_recruit` in gpu/core/sim_minorops.py) clears `aiDefender` /
  `unit_defender` on every unit of the operation.
- MEASURED (`cityBuildLab.ts`, the five verbose duels): the Combat Desire as
  logged 1,778 -> 2,897 of 3,600 minor-turns (within 0.05); the action
  replay's own desire (REPLAY_TRACE=minorRows against AI_Military.csv)
  1,714 -> 2,089 of 3,602.
- The unit production table's value (0x7989e0): each opposing type's count
  times the efficiency at data[width x opposing + entry] (0x7992b9: the
  matrix +0x28 width, +0x30 data, the opposing type the loop's index
  [rbp+0xc00], the entry's unit +0 of its 0x168-byte record); the log
  (0x79b8a0) prints row r, column c as data[width x r + c], so the value
  reads AI_UnitEfficiency.csv's row the opposing unit, column the entry
  (`AI_UNIT_EFFICIENCY[i][k]`). The other way round the lab's units within
  0.005 fall 7,815 -> 6,099 on runs/h1_duelv1117. The entry's value is its
  +0x160 (0x79ca90), N over the summed products (+0x30), 1.0 where nothing
  opposes.

## C-96: the resource value and the research value's resources — READ (bonus, luxury, the call), PARTLY READ (the strategic stockpile terms)

`resourceValue` in `cpu/core/aiResource.ts`; `minorResourceCounts`,
`minorResourceFacts`, `minorResearchResources` in `cpu/core/minorBuild.ts`;
the tables `AI_RESOURCES` / `AI_IMPROVEMENTS` in `cpu/data/aiBuildTables.ts`
(tools/install/ai_tables.py).

- THE CALL (the research value 0x7b3e50, 0x7b556f..0x7b5758): per
  improvement of the technology's list (row +0xd0..+0xd8, the
  improvements it unlocks in table order) the player may build (0x35f100:
  the improvement's trait against the player's civilization and leader),
  per resource of its valid list (+0x1e8, Improvement_ValidResources): the
  copies its cities count (CityBuildAI +0x978 through 0x5d45c0, summed over
  the player's cities); where above 0, `resourceValue(player, resource, 1,
  &rate, turns, H)` added to the row's value.
- THE COUNTS (0x5c9700, the city's full update): +0x978[r] = the city's plot
  evaluations (+0xcf8, the 37 plots within three of the centre the PLOT
  ANALYSIS LOG lists) whose resource (+0, the plot's resource where the
  player sees it, 0x4ab4b0 -> the resource's condition 0x4ac140) is r,
  owned by the player (+0x5a: the plot's owner the evaluation's player) and
  unimproved (+0x50: the plot's improvement +0x44 set).
- THE VALUE (0x7a21e0, out, player, resource, count, &rate, T, H): no
  resource 0. BONUS 0. LUXURY: v = PSEUDOYIELD_RESOURCE_LUXURY of 1.0 from T
  to H (0x7a2140); where the player holds it (0x4abfe0: Player_Resources
  +0x598[r] > 0) and count > 0, 0; else for a full civilization (0x469db0)
  or a city-state (0x469de0) the amenities a copy gives (0x527a50: Resources
  Happiness, its PeakEra's chronology against the era's times
  LUXURY_HAPPINESS_LOSS_PER_ERA off, at least LUXURY_HAPPINESS_MINIMUM —
  the greater at the player's era and the next, the last era's own at the
  end), the player's cities with their amenities less those required
  (0x5275a0) sorted (0x79ea80), the first min(cities, amenities) (the last
  for a negative count) each one Amenity more from T to H (0x79f7c0), at
  least v; at most 200.0. STRATEGIC: the need, the most of ResourceCost +
  10 x ResourceMaintenanceAmount (Units_XP2) over the resource's units in
  the military AI's production table (0x79d340); have = 0x4a93c0(r, 1);
  where have is below twice the need, T = H (or H = 0) and count is not
  positive, FX(-9999); a positive count is held to twice the need less
  have, at least 0; with a unit asking it, each copy is worth the era's
  chronology x 25.0 over the need (x2 with none had), discounted to T
  (0x7a1240), times the copies. At most 800.0. ARTIFACT and LEY_LINE 0.
- READ, the strategic stockpile terms (0x7a2850..0x7a2d61): with the need
  and have computed, where Player_Resources +0x350 (0x4aa700, fx) less the
  player's +0x12e8 +0x1168 (0x4ab270, << 8) is below 0 and 0.5 (@d20458) x
  the need is above have, the resource counts as asked and the need is at
  least the whole part of the shortfall (+0x1168 less +0x350); then, with a
  unit asking it, after the era's worth and the x2 of none had: at T = H
  (or H = 0) a positive count is held to the cap (0x4aabe0) less the stock
  less its reservations (0x4aa790, ownership 0, the reservations off),
  which may leave it below 0; a resource whose row holds a +0xd0 list
  (Resources +0xd0..+0xd8) adds 50.0 to the worth; the x1.5 reads the count
  held there. +0x350 is read as the turn's income and +0x1168 as the
  units' fuel bill (`stockpileIncome`, `unitUpkeepBill`); ASK: what fills
  Resources +0xd0 (the 50.0 term is not ported). Port: `resourceValue`
  (`income`, `upkeep`, `room`), `_cv_resource_value`.
- A minor's strategic queue (City_BuildQueue 0x17f3a0, the front check
  0x17f070 the queue process 0x178250 runs where the queue changed, +0x3ac):
  the front unit not CanTrain leaves the front; a unit with a Units_XP2 row
  (+0x198 / +0x1a0), no progress (0x17d1a0) and a StrategicResource
  (+0x2c8) reserves its cost (0x17c2e0, its formation's) where the stock
  less the reservations (0x4aa790) covers it (0x4a7400), else leaves the
  front — no civilization level is read here, so a city-state, which
  CanTrain lets ignore the resource, still needs it to start the unit. The
  completion releases and charges together; the turn end's cap tests the
  stock less the reservations. Port: `CityState.prodReserved` /
  `citystate_prod_reserved`, `stockReserved` / `_stock_reserved`, `minorBuild`
  / `_minor_build`. A minor's units burn their fuel as a major's do
  (`chargeUnitUpkeep` / `_seat_charge_upkeep` on its row, `Seat.fuelShort` /
  `citystate_fuel_short`, the -20 on its units). Its upgrades pay the new
  chassis' strategic cost where the stock covers it, none where both rungs
  ask the same resource (the completion's rule, LAB: the upgrade's resource
  charge for a city-state not read).
- MEASURED: the replay's research tallies (`cpu/harness/replay.ts`, "The
  research AI"), the five seeds before and after (AUDIT C-96).

## C-96: the district value — READ (0x7a51f0, 0x7aaf80's terms below, 0x366df0, the purchase price 0x1b1cb0, 0x1c77c0, 0x1b4450), PARTLY READ (the golden-age term, the claims, modifiers and neighbours terms, the domain's resources path), unwired

Ported in `cpu/core/aiDistrictValue.ts` (its GPU twin, with the improvement,
project, building and unit values, the pick, the Combat Desire and the
purchase, `gpu/core/sim_cityvalue.py`, paired by tests/gpu/city_value_test.py);
measured by
`cpu/harness/plotValueLab.ts --districts` against AI_CityBuild.csv's
DISTRICTS rows of the five verbose duels: 8,629 of 55,800 within 0.02
(Commercial Hub 2,077 of 7,627, Harbor 2,849 of 9,896, Industrial Zone
911 of 6,108, Neighborhood 2,057 of 15,864, Campus 409 of 5,842, Holy
Site 181 of 402; Theater 124 and Encampment 21 of ~5,000 each).

- The plot analysis' district loop (0x5ce970, 0x5ced80..0x5cefed), per
  Districts row: the verdict 0x5d2ae0 (the player's districts list,
  [rbp-0x70] +0x40 per row: above 0 -> 1, else its sign) of -1 writes
  FX(-9999) before any other check (0x5cee0a); one of 1 takes the value
  0x7a51f0 gives x1.5 (0xd2f32c, 0x5cef8f..0x5cefd3). The list is the
  AiFavoredItems of the player's AiLists System Districts, a row +1
  Favored, -1 not, summed (`minorDistrictVerdict`): MINOR_CIV_DEFAULT_TRAIT
  -1 on Holy Site, Campus, Encampment, Commercial Hub, Theater, Industrial
  Zone, Aqueduct and the later specialty districts, each type's trait +1 on
  its own — no city-state favours a district, none values one its type does
  not own (runs/h1_duelv1117, 1121, 1124: no city-state's plot values a
  Holy Site; the cultural Antananarivo values Theaters, the militaristic
  Valletta Encampments, the scientific Bologna Campuses; Valletta's t2
  Encampment at (15,10) logs 59.93, our unscaled value 63.05 — no x1.5,
  the two lists summing to 0). The other
  districts 0x7aaf80 sets against the row (0x406c00, 0x1aec20, 0x35f2d0)
  do not read the verdict. The plot test asks no population limit: the
  value's chronology term reads it (runs/h1_duelv1124 Bologna t20, its
  Campus at the limit of 3 citizens: its Harbor rows 33-41 and its tree's
  Celestial Navigation contract 50.0, as logged; `anyCount`, the GPU
  plane's `limit=False`).

- 0x7a51f0 (out, district, &rate, T, H, plot, city, ...): T past H
  FX(-9999). A plot without an owner pays its price: the city's Gold price
  0x1b1cb0 (city +0x1688; -1 where the plot lies beyond GlobalParameters
  +0x124 of the city or no plot beside it is the city owner's — r8 0, no
  forced buy) at the yield value with no player, discounted T, taken off.
  A feature the district does not keep (0x17cb00) and the Features row
  does not let it clear: 0; else the feature removal (0x7a3010). A
  resource seen with no harvest row: 0; else the harvest (0x7a37d0). An
  unpillaged improvement: its yields (0x7b1320) and the resource's value
  at count -1 off. The plot's own district pillaged: the repair, +12500.0
  at the city centre, the whole x2. Then 0x7aaf80.
- 0x7aaf80 (the body): T at or past H FX(-9999); a Coast row on a lake
  FX(-9999); a flood (unless Districts_XP2 PreventsFloods) or an eruption
  sooner cuts H. A turn: PSEUDOYIELD_DISTRICT 1.0; per yield the whole
  adjacency 0x366df0 -> 0x365720 (its rows through 0x365ae0 plus the
  owner's adjacency modifiers), 0 at a plot without an owner (0x366df0
  reads the plot's owner byte); the district's own rows (each through
  0x365ae0) and, where a district the player may build, the city lacks and
  the plot takes (0x406c00, 0x1aec20, 0x35f2d0) earns more by its rows,
  that best off (not for an Aqueduct, +0xe0 bit 2); HitPoints (+0x58 /
  +0x5c) x 0.02 x ((d - d f) / d + 1) of PSEUDOYIELD_CITY_DEFENSES at no
  player (d) and at the player's (d f); 0.5 x the era's ChronologyIndex x
  the district pseudo-yield while the city may add a district (not
  RequiresPopulation, +0xe1 bit 6, or 0x1ae8a0 above 0x1ae8f0), the whole
  where the plot holds it; a regional building's reach (the largest
  RegionalRange of its buildings, +0x130) multiplies the turn so far by
  (the player's other cities within it holding no such district within it
  + 1) x 0.5; Appeal x 0.5 Food beside a district with Housing; its
  domain (0xadd590: sea 0, air 1, land 2) where 0x1c77c0 says the city
  does not train it (a district of the domain, land, or the sea where the
  centre's plot's +0x40 and its flags +0x14 bit 0 hold) PSEUDOYIELD_UNIT_
  NAVAL / AIR_COMBAT 5.0, twice where no city of the player's does, then
  the domain's units' values (0x5d4cd0, each at least 0) once where none
  does; Maintenance Gold off; District_GreatPersonPoints at their class's
  pseudo-yield. PV(H) - PV(T) plus the units' lump; Housing (an
  Aqueduct's CITY_POPULATION_AQUEDUCT_BOOST 2, the globals' +0x13c) plus
  the first AppealHousingChanges band the plot's Appeal reaches (0x1b4450)
  at the housing value 0x7a3d70; where the civics' list holds the district
  (0x39dd20) the claimed plots (0x7a10c0); a Dam (Districts_XP2 +0x28 bit
  3) 100.0 an improved and 300.0 a districted plot of the owner's along
  its rivers (0xa2bf20); a Canal (bit 0) 100.0 x 0x4d9320; its projects
  (+0x1d0) each 0x7b28c0 x 0.1, x3.0 a favoured one (0x7a48d0), the
  positive summed, added only where its SpaceRace ones value above 0 —
  shared by (0x408b60 all + 1) while 0x408b60 complete stands within
  ceil(0.5 x their count) and the plot lacks the district; the modifiers
  (0x7a4b20); at the top level the neighbours (0x79f280).
- The analysis' T: the build turns (0x17b5a0) + max(the tech's turns, the
  civic's) — 1127 t2's Campus T 15 = 2 + 13, no +10 for an item in hand.
- Measured: 1127 t2 / t4's Campus rows exact on every plot (owned twice
  the adjacency, unowned once, beyond the reach at -1); 1121 / 1127 Harbor
  exact where the inland city-state's river counts as training ships (LAB:
  0x1c77c0's sea test unread; every inland city-state of the five sits on
  a river); the Industrial Zone 77 -> 911 with its reach.
- PARTLY READ / unported: PSEUDOYIELD_GOLDENAGE_POINT x 0x2c41d0 (the era
  manager's +0x5b8 record of player +0x128, its +0x34); the claims,
  modifiers and neighbours terms (as the improvement value's); the
  domain's resources path (where a city trains the domain). The residuals:
  per (turn, player) a constant across plots (Campus, Holy Site: 0.4 to
  5.5), Snow coast plots 3.0 a turn high
  (1121 (10,2) / (34,23)), Woods / Rainforest plots 0.44 low past t11 (the
  removal), and the civic turns of the Theater and the Neighborhood (the
  minors' civics analysis).

## C-96: the project value — READ (0x7b28c0, the PROJECTS table 0x5ce970), PARTLY READ (the space-race standing 0x7b8a30, the diplomatic-victory rows, the repair count), unwired

0x7b28c0 (out, project, &rate, T, H, player, city, ...), the city build
AI's PROJECTS table (0x5ce970) and the research value's projects. Ported in
`cpu/core/aiProjectValue.ts`; measured by `cpu/harness/cityBuildLab.ts`
against the PROJECTS rows of the five verbose duels: 6,004 of 6,837 logged
values exact, the misses the build turns a turn either side (the value at
the log's T exact: 1124's Campus, Harbor and Industrial Zone grants), the
Encampment's grants (logged 0), Repair Outer Defenses (its count), the
Manhattan Project and the nuclear device.

- The table's gates: MaxPlayerInstances (+0x30 / +0x34) above the player's
  completions and the other cities' builds (0x179650); UnlocksFromEffect
  (+0xe8 bit 2, or Projects_XP2's +0x60 bit 0) the player's unlock
  (0x468260); the civic (+0x120), tech (+0x150), district in the city
  (+0x128, 0x1aea60), RequiredBuilding (+0x158) held; its ProjectPrereqs
  (+0x130) each completed. T = the build turns (0x17b890), H
  valueHorizons[1]; x1.5 (@0xd2f32c) where the player's list +0x6e8 holds
  it. +0xe8: bit 0 OuterDefenseRepair, bit 1 SpaceRace, bit 2
  UnlocksFromEffect, the SELECT's booleans in order.

- T at or past H: FX(-9999). A row with MaxPlayerInstances (+0x30 / +0x34)
  the player has completed (0x4be7b0): FX(-9999).
- The projects it opens (+0xf0..+0xf8, the ProjectPrereqs naming it):
  each valued recursively at T plus its build turns (0x17b890), at least
  200.0, summed; a WMD one (+0x148) adds PSEUDOYIELD_NUCLEAR_WEAPON 250.0
  (@0xd71c24) at the player's value and 1000.0's at the player's less at
  none.
- SpaceRace (+0xe8 bit 1): PSEUDOYIELD_SPACE_RACE of 0x7b8a30 squared, and
  1.0 per space-race project the player has completed.
- Project_GreatPersonPoints (+0x108..+0x110): each class's pseudo-yield
  (+0x40 -> +0x90 -> +0x14) of its Points escalated by the progression
  0x5267a0 type 1 at PointProgressionParam1 — Points + (Points x Param /
  100 - Points) x p / 100, p the game's progress percent max(100 x techs
  // 77, 100 x civics // 61) (1124 t32 .. t34's Campus grants 29 / 30 /
  31: 16 points at 9%) —, x4.
- OuterDefenseRepair (+0xe8 bit 0), where the city's +0x1880 count is
  above 0: that count x the population (+0x588) x 0x1ae8f0 x 10.0.
- A diplomatic-victory row (+0xe8 bit 4, or the Projects_XP2 row's +0x60
  bit 1, with 0x25afc0): per its rows PSEUDOYIELD_DIPLOMATIC_VICTORY_POINT
  of the era's points.
- The sum is paid once, discounted to T (0x7a1240). Then the Projects_XP2
  row's +0x1c (a float) times the population from T to H where the city's
  +0x2a78 check is negative; the row's CreateBuilding (+0x40, +0x48, +0x80)
  through the building value 0x7a7590 less the value of each consumed
  building (+0x68, Project_BuildingCosts) the city holds (FX(-9999) where
  it has some and holds none); the project's
  modifiers (GlobalAI +0x3a38) through 0x7a4b20.
- Logged at the city-states (the five verbose duels): Repair Outer Defenses
  0 or 3255.0 / 4708.13 / 10656.25 held turn after turn while the walls are
  down (runs/h1_duelv1124 minor 2 t86..t89, t104..t107, t155..t158); the
  district projects 0..148 moving with the city's yields (Industrial Zone
  50.86..87.0); Manhattan 337.7..8884.5; the nuclear device 134..379.

## C-96: the city events, trees and contracts — READ (the events, the slots, the contract states, the city's list, the Default Specialization's head, the queue, the nodes below, the purchases, City Defense's start), the threat's writer and the operation unread

Ported in `cpu/core/aiCityTrees.ts` (the events, the trees' nodes, the
tick), `cpu/core/aiContracts.ts` (the contracts) and the interpreter
`cpu/core/behaviorTree.ts` (shared with the majors' operations); the trees
generated into `cpu/data/aiCityTrees.ts` by
`tools/install/ai_operation_tables.py`. The GPU twin, `gpu/core/sim_citytrees.py`
(the events, the city trees on a batched interpreter, the contracts and
the economic AI's gold purchase), is paired with the TS by a scenario both
tests run (tests/cpu/minors/city-trees.test.ts, tests/gpu/city_trees_test.py:
42 turn digests equal). Measured by
`cpu/harness/cityContractLab.ts` against AI_CityBuild.csv's contract and
queue lines of the five verbose duels (runs/h1_duelv11{17,21,24,27,28}):
SUBMITTED 259 exact, 8 at another value, 75 a turn or two apart of 434
logged; queue lines 133 of 179; COMPLETED 127 of 156 (the rest: the
operations' contracts, the improvement values below, the purchases).

- The turn (the Control Manager 0x6096c0): per player list B (governors,
  research 0x760980, the Economic AI 0x687bf0 with its purchases,
  military), then A (the cities 0x5c2650 -> 0x5ce680), then C (the second
  city hook 0x5c2610 -> 0x5ce5b0: the Default Specialization where the
  queue is empty, then TryPurchaseUnits 0x68be60 over the city's units;
  the tree manager's tick 0x7ffdd0; tactical). A city founded during the
  turn exists for C only: the Default Specialization, no events.
- THE TURN'S PASSES (READ): 0x6096c0 pushes three job lists (std::function,
  0x40 bytes each) — +0x370 (0x60e8c0: the cities 0x5c2650, ..., the
  Economic AI 0x687bf0, the military 0x722690), +0x388 (0x60e960: 0x785ec0,
  the second city hook 0x5c2610, the tree manager's tick 0x7ffdd0,
  0x74f5a0, 0x70a250, the tactical pass 0x771530) and +0x3a0 (0x60e820:
  0x7ffed0, ...). Each job takes a pass number (Control Manager +0x278,
  its watched setter 0x731d10 on +0x220) and acts only in its own pass:
  the turn start 0x608870 sets the pass to 4 and runs the whole +0x370 list
  at 4, 3, 2, 1, 0; 0x608580 then runs the +0x388 list from 4 down to 0,
  each pass again until every job answers true, then the +0x3a0 list, then
  the next pass. The passes the jobs keep: the Economic AI 3 (+0x100, its
  constructor 0x685080), the military 2 (+0xf8, 0x71a960),
  a city's CityBuildAI 2 (+0x470, the AI::CityBuild constructor 0x5c4f40;
  0x5ce680 and 0x5ce5b0 open with that test; the city trees are seeded at
  that priority, 0x7cb230), the tree manager's tick each tree of the
  pass's priority. So the city's second hook — its Default Specialization
  and its threatened purchases — runs in pass 2, after the trees of
  priority 4 (City Defense, Settle New City, Barbarian City Assault) and 3
  (Attack Barb Camp and the assaults) have ticked, and before the trees of
  priority 2 (Naval Superiority, the city trees). The port runs the city's
  second hook in the city's update, before any tree ticks.
- THE THREATENED PURCHASE AFTER THE PASS-4 AND PASS-3 TREES (the records,
  runs/h1_dueld*): with the city threatened (aimem CityBuildAI +0x1b8), a
  land military unit of the city-state reaching the centre in the turn
  bars the purchase, and one leaving it lets the purchase through.
  runs/h1_dueld1127 city-state 4 t16 (City Defense's Warrior 7:12 -> 8:10,
  AI_Planning.csv at 7:12 that turn, 80 Gold, the Warrior at 80: none bought),
  city-state 2 t20 and t28, city-state 4 t70 (a Heavy Chariot): none bought,
  the port buying a Warrior, a Warrior, a Spearman, a Horseman; runs/
  h1_dueldA1117 city-state 3 t140 and t148 (its Trebuchet off the centre:
  bought), city-state 4 t85 (its Catapult off: a Catapult bought). The
  port's spot test reads the centre at the city's update (`purchaseSpotBlocked`),
  before the operations move.
- THE SAVINGS' TEST AT ITS EDGE: runs/h1_dueld1127 city-state 4's Builder
  contract 112 (SUBMITTED t44, the game's PURCHASE t46 at 115 Gold): with
  the port's purchases equal to the game's through t46 (no t16 Warrior),
  the port's SLUSH_FUND + UNITS at t46 come to 114.96 against the price's
  115 (0x68c0ad: the sum strictly above the price) — the per-turn shares
  (0x687dcb: weight / total as a float, its floor and its fraction x 256
  truncated, 85 / 113 / 28 / 28; (change x share) >> 8, 0x687df9) as the
  port computes them, the record's treasury each turn; the game's sum
  passes. Unread: where the game's sum gains the 0.04.
- The city's update 0x5ce680: the in-hand contract's check 0x5d7e00, the
  slots freed of trees no longer running (0x800590), the analysis the
  turn's job wrote (0x5ce910 -> 0x5ce970 per plot; no direct caller) read by
  the improvement pick 0x5c9a00 (CityBuildAI +0x648; the log 0x5d4030
  prints the same evaluations), the events: defence 0x5cced0 (slot 5),
  building or unit 0x5cd150 (slot 1), district 0x5cc910 (slot 2),
  improvement 0x5ccc10 (slot 3), 0x5cd4e0; then 0x5d4d70 where the queue
  is empty. A tree is made (0x7ff9a0) and seeded (0x7cb230) by its event,
  never ticked there: no city-tree contract of the five logs is SUBMITTED
  and queued in one turn.
- The district choice 0x5d0c20 ("City Build District Choice"): over the
  evaluations with +0x55 and +0x5a or +0x57 (an adjacent plot of the
  player's, 0x5ceb67), the district valued above the plot's reservation;
  an equal value draws 2 and a 1 takes it. The majors' cities draw first:
  a turn's last draws are the city-states' (1127 t2: three draws, Hattusa's
  tie the second).
- The tree manager's tick 0x7ffdd0: each tree 0x7d3a00, then 0x7cb2e0 in a
  loop destroys a tree whose +0x368 is set or whose +0x308 is set with its
  root neither RUNNING nor FRESH. A tree one of whose units its own orders
  spent ends that tick (1121 t9 Hunza's last charge on a Rainforest: the
  next Builder contract t10; the abort's writer unread).
- A contract (vtable 0xd5b948; progress +0x100: 1 CLAIMED, 2 SUBMITTED, 3
  ACCEPTED, 4 FAILED, 5 IN PROGRESS, 6 CANCELLED, 7 COMPLETED) lives while
  a tree holds it or a city has it in hand: the Contract Manager's check
  0x7f2220 sets FAILED past the turn limit through the holder +0xa8
  (0x731d10), removes it from the tree (0x7d22f0) and releases it
  (0x600b00); a city's list +0x3a8 holds weak handles, and 0x5d4d70's head
  skips an emptied one without a line (the five logs print 8 FAILED lines).
- The submission 0x60bb50: SUBMITTED, then the player's signal +0x270
  runs each city's listener 0x5d6050 in city order: a city that may take
  it (vt +0x98 0x5f6050) lists it (+0x3a8), logs its SUBMITTED line, and
  clears its production (0x175d10) where the value passes CityBuildAI
  +0xa48 and the city was founded this turn or the last (city +0x2600 + 1
  >= the game turn; +0x2600 is m_iTurnFounded, the field 0x8ea750's
  CitiesFounded / TurnFounded reads: runs/h1_duelw1117 Caguana t34 keeps
  the Warrior its Default Specialization set at t33 under the Harbor
  contract at 40.0, the Warrior done at t35; Valletta's Monument of its
  founding turn t1 cleared by the Builder contract at t2; Bologna's of t1
  kept at t3);
  the economic AI's listener 0x68ab40 takes a unit or building contract
  it may buy with gold; any taker makes it ACCEPTED (SUBMITTED lines 259
  exact before the economic AI's listener, 283 with it; queue lines 133,
  COMPLETED 127 both). 0x5d4d70's head: an ACCEPTED contract the
  city may take is valued (vt +0x68 0x5f5d50: the higher of its value and
  the city's analysis value; districts always "producing") and held in hand
  (+0x398) where higher; any other logs its line (vt +0xa8 0x5f4cd0) and
  leaves; the hand takes the turn where its value is at least the best
  unit's less 1.0 and the best project's (the defensive pick's project 0),
  queued by vt +0x38 0x5f3710 (IN PROGRESS, bound to the city, the
  completion signals 0x5f5650 / 0x5f35d0 / 0x5f3610 connected; the queue's
  refusal FAILED, no line). The in-hand check 0x5d7e00: not eligible
  CANCELLED and the production cleared, not producing FAILED.
- 0x5d4d70's head RELEASES the hand first (0x5d4e0e: 0x600b00 on the handle
  +0x340, whose object +0x398 reads), so a contract its item's completion
  left in hand — a district's, which vt +0x68 holds "producing" — takes no
  turn (runs/h1_duelw1124 Bologna t18: the Campus completed, its Library
  the Default Specialization's that turn); the queue's refusal of the hand
  (vt +0x38 false, 0x5d5162) falls to 0x5d516a, the hand released and the
  pick made.
- THE ECONOMIC AI'S CONTRACT PURCHASES (0x687bf0 after the savings and the
  balance assert, 0x688920): its purchase list (+0x5d0, filled by the
  listener 0x68ab40) keeps the handles alive, ACCEPTED and vt +0x80 true
  (a remove-if, 0x688961 / 0x6889b0); a stable merge sort (0x684bf0 ->
  0x6839c0 -> 0x6846d0) orders it by contract +0x160, the larger first
  (the constructor's 0; no writer read); for a player no human drives each
  entry with vt +0x50 (0xbe4aa0, true) runs vt +0x20 (0x5f3c40): a unit's
  (+0x408) TryPurchaseUnits(economic, the city +0x588 binds or null — every
  city —, unit, 0), on success progress 7 COMPLETED through the holder
  +0xa8 and "%d, %d, PURCHASE, , , %s, %s, CONTRACT %d"; a building's
  (+0x468) 0x68afe0 (MustPurchase +0x159 & 0x10 refused, CanConstruct
  0x1714d0, a value test against the city's analysis 0x5d4920; not
  ported). Then goldPatronage 0x6898b0, 0x68a100, 0x689610. The purchased
  unit binds to no tree (the completion signals are a queued contract's);
  the tree's Find Available Unit takes it. Measured (city-states, the
  PURCHASE lines of runs/h1_duelw1117-1128, 38, the savings on the record's Gold):
  27 bought the turn the test first passes with the GREAT_PEOPLE slot
  apart, 26 with it folded into the SLUSH_FUND (runs/h1_duelw1124 p4's
  Warrior of contract 36, submitted t15, bought t18 at 101 + 6 Gold;
  1127 p4 t46, p2 t210); 0x2f7eb0 reads the game's classes (a class's
  three timeline entries set), so a city-state keeps the slot apart while
  any class stands. 1124 p3 t27 and t72 (Granada's Builder and Heavy
  Chariot) pass only folded.
- BUILD UNIT's "already held" test (0x7f4e00 -> 0x18e9f0 City_Buildings ->
  0x18fe60 HasBuilding) reads the city's buildings, not its queue:
  runs/h1_duelw1121 Antioch t45, its Walls queued by that turn's Default
  Specialization (135.1), the walls tree's BUILDING_WALLS contract
  submitted the same turn.
- AI_CityBuild.csv's CONTRACT lines come only from a city: the SUBMITTED
  line of each city that lists a contract at its submission (0x5d6050) and
  the line 0x5d4d70's head prints for a listed contract it drops (its
  progress then: COMPLETED, FAILED, CANCELLED, IN PROGRESS, or ACCEPTED where
  the city may no longer take it). A contract no city lists (a Purchase
  Plot's, a goal tech's, an operation's Warrior Monk the religious AI
  alone takes) prints none, and one a tree releases or a purchase completes
  while the queue is busy prints none until (unless) the head runs — the
  log's fold keeps it open (runs/h1_duelw1117 Valletta's Builder contract
  47, PURCHASED t22, open in the fold after; 1117 Antananarivo's Slinger
  contract 10 of t2, its tree gone by t9).
- TryPurchaseUnits' threatened city (0x68c027): CityBuildAI +0x1b8's sign
  bit clear — a threat at or above 0.
- THE THREATENED CITY'S PURCHASE GATE is the purchase request (0x977570)'s
  placement: a land unit bought stands on the city's centre, refused where
  a unit of its stacking class stands there (the majors' rule,
  `purchaseSpotBlocked`); a Trader there holds no slot. The records: the
  game's city threat (runs/h1_duelm1117 aimem, CityBuildAI +0x1b8)
  Antananarivo 4 at t24-t26 with 121-138 Gold and the Archer at 120, a
  Warrior on the centre: nothing bought, ours an Archer at t24; runs/
  h1_duelw1124 Granada t20-t23 under City Defense with a Warrior on the
  centre: none. Every logged military purchase of the five duels landed on a
  centre with no military unit (a Trader or a Builder there allowed:
  1117 Valletta t59, Caguana t73 / t102; 1124 Granada t72), a Galley beside
  a Warrior (1121 Ayutthaya t30), a Builder beside a Trader (1117 Caguana
  t42, 1124 Bologna t88). MEASURED (--aiscore --to 100, five duels):
  unit.trained's compared rows 167 -> 147 (ours' purchases the records lack,
  equal 117 both), unit.bought 17 -> 18 of 26 equal, cityState.build 1405
  -> 1403 of 1470, knowledge.army 1422 -> 1483 of 2475.
- 0x5d2810's walk starts its bests (+0x30, then +0x2c) at 0 (0x5d286c /
  0x5d2876) and stops at the first entry it may train ranked below them
  (0x5d2941 / 0x5d2947): an eligible first entry whose sums fall below 0
  yields none.
- A CITY-STATE'S DISTRICT PRICE locks at its placement, as a major's does
  ("buy.districtCost"'s lock): runs/h1_duelv1124 Granada's Harbor at 53
  (City_BuildQueue.csv Production Needed) from t42 to its completion at
  t44 through a civic that took the fresh price to 58; runs/h1_duelw1127
  Muscat's Commercial Hub repaired at 114 at t168 where the fresh price
  was 148. `minorPlaceDistrict` / `minorDistrictCost`,
  `citystate_dist_cost`.
- The nodes (registration 0x7cbca0, names 0x7db850): Decode Trigger
  0x7f2970; Contract Manager 0x7f17a0 (parent 0x7f1500; a counter +0x50
  over the turn limit, reset when every contract it holds is alive);
  Add Goal Tech 0x7e7d20 / 0x7e7200; Build Unit 0x7f4e00 / 0x7f4240;
  Reserve Plot 0x7f7da0 (0x5d74c0: another tree's reservation yields to a
  value 20.0 above it); Check Plot 0x7f6ea0; Find Available Unit
  0x7ec7b0; Cancel Contract 0x7f5200 / 0x7f4980; Protect Unit 0x7f07c0;
  Move Unit 0x7f0020; Clear Plot 0x7f7960; Build Improvement 0x7e9670;
  Purchase Plot 0x7f7bf0 / 0x7f6820; Has Player Ability 0x7f1fa0.
- MOVE UNIT's DANGER (data "Allow Danger", every city tree's 0): the update
  reads the location on the player's danger map (0x7f040d: 0x716a60 on
  player +0x12d8, x + y x width into 0x716a90); a location of danger lets
  the kept unit that reaches it go (+0x50 -1, SUCCESS), and a unit is kept
  by its path only where the location is clear (0x7f057e). The execution
  plans the unit's walk (0x791300, one turn) and, the location aside, takes
  none ending on a plot of danger (0x7eed65 -> 0x7ef0bb). PROTECT UNIT
  (0x7f07c0): over the tag's units, else the tree's job's (0x6092c0), each
  damaged (+0xcf0) at least its Damage Percentage of its hit points
  (COMBAT_MAX_HIT_POINTS; every city tree's 0) on a plot of danger counts
  (+0x20): RUNNING with one, SUCCESS with none, FAILURE with no unit.
  runs/h1_duelw1127 Mexico City: its Builder of contract 51, bought t22,
  stood on the centre to t39 beside its tree's Farm plot (the game's Farm
  there from t40), the barbarians about (City Defense t20-24, t32-33,
  t36-37).
- MOVE UNIT, READ. Update 0x7f0020: its
  kept unit (+0x50, kept across turns; an id of 0 or -1 none) alive with a
  planning: SUCCESS where the planning reaches the location within one turn
  (0x791300, the flag clear), else RUNNING. None kept: over its units in
  order, the first reaching it this turn with Movement left (the flag set)
  is kept and it SUCCEEDS; else the first reaching it this turn, where none
  is kept yet, or the one whose path (0x272a60) takes the fewest turns
  (fewer than the best so far), is kept, RUNNING; none FAILURE. Execution
  0x7eeba0: the kept unit, else each of its units, moves. In "Build City
  Improvement" Move Unit (27) sits in a Concurrent with Protect Unit before
  Build Improvement (28) in their Sequence: its SUCCESS on the turn the
  Builder can arrive lets 28 update in the same walk.
- CLEAR PLOT, READ (its execution unread: the clear by the kept unit
  standing on the plot). Update 0x7f7960: over its Builder List (the
  tree's units where none), the first unit with charges on the Plot To
  Clear, or whose planning reaches it this turn with Movement left, is
  kept (+0x40): SUCCESS; else RUNNING where one reaches it this turn with
  none left, else FAILURE. It reads no improvement: in "Build City
  Improvement" its SUCCESS walks on into Build Improvement in the same
  tick, whose plot test still finds the feature, and the tree fails; the
  next improvement event builds.
- A CAPTURED CIVILIAN is a new unit with a new ID (runs/h1_duelw1124 t112:
  player 4's Builder 1114113 becomes the barbarians' Builder 5111833), so a
  knowledge base's record of the old unit stays with its owner as a unit
  gone (`seizeCivilian`; the GPU takes a new pool slot). Operation Attack
  Units' assignment (0x776140, `assignTo` / `_tac_assign`) holds CIVILIAN
  targets with the rest (0x80c080's list: a civilian through a HIGH unit;
  a civilian's blow 150), the carry-out striking none of them and moving
  onto them (seed9001 t30: Nan Madol's Warrior retakes its Builder from
  plot 603 over the barbarian Warrior at 648). Attack Units' strikers for
  each target read the stacking where the units stand then, after the
  earlier targets' attacks moved them (`strikers` / `_tac_attack_units`;
  seed9001 t33: a barbarian Warrior's move onto 906 bars the Slinger's spot
  there, and the Slinger wanders).
- 0x5ce970's plot test reads the plot as the player sees it: a resource
  whose revealing technology it lacks (and its suzerain does not see,
  0x4ac140) is none — the plot's plain ground takes its improvements
  (runs/h1_duelv1128 t2 Nazca: plot 473's Horses unrevealed, "No resource",
  its Farm 72.45 beside plot 472's; the improvement event takes 473, whose
  tree loses its reservation to the Holy Site tree's on it and fails, and
  the Builder contract comes at t3 for 472, as runs/h1_duelw1128 logs).
- 0x5ce970's improvable flag (+0x54): no city, no district, the word at
  +0x1e of the plot's interface (0x30) -1 (not the improvement: Check Plot
  reads that at the plot's +0x44), not a canyon, and an improvement the
  plot test (0x35fd60, its fifth argument 1) takes. A plot holding an
  improvement is improvable, its own valued 0.00 (runs/h1_duelv1117
  Valletta t10-t14: the improved Farms' 0.00 the improvement pick's
  researched one over plot 321's Mine at 55.03 without Mining, no tree and
  no Mining contract until Mining at t15, the Builder contract then 71.0).
  CHECK PLOT 0x7f6ea0 (the improvement): the plot test (0x35fd60, fifth
  argument 0) or the plot's own pillaged improvement (+0x4d bit 1, +0x44)
  SUCCESS; else FAILURE, a feature (+0x3c) or resource (+0x40) on a plot
  holding no improvement set to clear. The clear takes the improvement first at
  no charge (runs/h1_duelv1124 Cardiff's Lumber Mill on plot 626 gone t116
  with its Builder's charge kept, the Forest t117, the Farm t122; LAB,
  Clear Plot's execution unread). No city-state improvement is laid over
  another (runs/h1_duelw1117-1128).
- BUILD IMPROVEMENT, READ. Update 0x7e9670: over the Worker List, the
  first unit with charges (+0xed0) on the Goal Plot, or whose planning
  (+0x1fc0) reaches the Builder Plot (the goal where none) this turn with
  Movement left (0x791300: one turn, the flag set), is the node's (+0x50);
  a unit reaching it this turn with none left (the flag clear) keeps it
  RUNNING; else FAILURE. The improvement (+0x54): the list's first the goal
  can take (0x35fd60, no district there), or the goal's pillaged one
  (+0x58, the repair, unported); none FAILURE. The nodes' plot test reads
  the plot as it stands (Check Plot, Clear Plot, Build Improvement: a
  feature or resource to clear first goes through Clear Plot; LAB:
  0x35fd60's fifth argument, 1 here, lets an improvement whose +0x108 has
  bit 8 take a removable feature, and runs/h1_duelw1117-1128 hold no
  city-state improvement laid the turn its plot's feature or resource
  went; 1124 Granada's Builder on plot 570's Marsh t7-t21, the Marsh gone
  t22, the Alcazar t24). Execution 0x7e8ef0: that unit standing on the
  Builder Plot when it runs — after Move Unit's (node 27 before 28), which
  moved it — builds (0x95a010; the repair 0x967560): a Builder lays on the
  turn it arrives, and on the turn it was trained (runs/h1_duelw1117-1128:
  of the city-states' improvements, 88 the turn the builder arrived, 27
  the turn it was trained, 144 by one already there).
- THE PURCHASES (`cpu/core/aiEconomic.ts`, the savings shared with the
  majors' sender): 0x5ce5b0's tail, for a city whose CityBuildAI +0x1b8 is
  above -1 and a player no human drives, buys 0x5d2810's unit while
  TryPurchaseUnits 0x68be60 succeeds. 0x5d2810: the city's list (CityBuildAI
  +0x650, 0x168 bytes an entry, ranked by +0x30 then +0x2c) — its first
  entry standing (+0xe), CanTrain, its unit's +0x1b9 byte below 0x80, of the
  domain asked (-1 any); equal ranks take the first. 0x68be60 (Economic,
  city or all, unit, flag): per city, the Gold price 0x1b22d0 (below 0
  skipped); the UNITS and SLUSH slots together above it with UNITS above
  half of it or SLUSH above twice it, or — the city's threat byte (CityBuildAI
  +0x1b8's low byte) set — the balance (+0x1b8) at or above it; the
  purchase request (0x977570, the game core's +0x48 / +0x50); then the
  spend: UNITS then SLUSH for the overflow, a threatened city's from each
  slot in order; the balance less the price.
- CITY DEFENSE'S START 0x5cced0 (slot 5): first the defensive cancel
  0x5d7640 (the military AI's +0x4b8, or the threat above -1 with the
  centre damaged or CityBuildAI +0x218: the in-hand item cancelled unless a
  defensive unit, building or district); a threat above -1 with slot 5
  free starts the list's CITY_UNDER_THREAT operation ("City Defense") at
  the city's plot through the player's operation manager (0x7265b0), slot
  5 holding its tree (+0x780), its target the city, its worth the city's
  (0x7a0ac0), its threat CityBuildAI +0x1b8. The city-states run it (1124
  player 3 t19 "City Defense, Started"); the threat, the one manager and
  the tree's nodes: "City Defense and the assault target's validity".
- ADD GOAL TECH, READ (0x7e7d20; its execution 0x7e7200). Its kept
  contracts first (+0x94 tech, +0x9c civic: SUBMITTED / FAILED / COMPLETED /
  0 released, IN PROGRESS RUNNING); no list in its data ERROR. The lists:
  Desired Techs and Civics the player lacks, each desired unit's, building's
  and improvement's PrereqTech / PrereqCivic it lacks; per improvement, on
  the Goal Plot to work, the resource the player sees there (0x4ab4b0):
  one it works (Improvement_ValidResources) keeps the feature where
  MustRemoveFeature is false, one it does not adds its Resource_Harvests'
  PrereqTech; then a feature it neither keeps nor lists
  (Improvement_ValidFeatures): not Removable FAILURE, else its RemoveTech.
  "Add Techs For All" clear: an item lacking its own SUCCEEDS at once (no
  city tree sets it so). After the lists the Goal Plot alone: each
  improvement working the seen resource (its +0xd8 / +0xe0 tests unread)
  adds its PrereqTech, and where the last clears the feature, a removable
  feature's RemoveTech (not ported). The tech list sorted (0x7e7080, its
  key unread), the first the goal; none SUCCESS, else RUNNING
  (runs/h1_duelw1124 Granada t2: the Alcazar tree on plot 570's Rainforest
  posts Bronze Working, Tech Contract 7 at the tree's 104.0).
- A tech contract (Add Goal Tech) is IN PROGRESS while the tech is the
  research (AI_Research.csv prints it alive while RESEARCHING), ACCEPTED
  off it (the research AI's check 0x5f5940) and from its posting, COMPLETED
  when held: the game's memory (runs/h1_dueld* aimem, the city-states'
  contracts at the end look) holds no goal tech or civic CLAIMED — status 3
  on its first read (35 tech and 3 civic contracts of 1117), then 5, 7 or 4.
  The engines post it ACCEPTED (`addGoalTech`, `_x_add_goal_tech`) and
  hold it ACCEPTED off the research (`goalsReached`); --aiscore --to 60,
  the five dueld duels: contracts.progress 52.7% -> 88.7%. The AI's view at turn T: the record of T,
  plus what the player's turn start completes (the research's tech or
  civic, the buildings built, the units trained and bought); the districts
  placed as the record of T has them, refused for good only complete.

## C-96: the trade AI's route value — READ (0x5e9b20, 0x78f210, 0x78e010, 0x559140's use), PARTLY READ (0x526330's terms, the knowledge base's city order)

Ported in `cpu/core/aiTrade.ts` (`minorTradeList`, `minorTradeValue`; the
GPU twin `_minor_trade_list` / `_minor_trade_value` in gpu/core/sim_minors.py);
the city build AI's Trader value (`traderValue`, 0x7a7110) and the
EFFECT_ADJUST_TRADE_ROUTE_CAPACITY term read the K it keeps.

- THE CITY'S TRADE LIST (CityBuildAI +0x870, 0x10 an entry at +0x10 / count
  +0x20, a rejected list of 8-byte entries at +0x28 / +0x38), kept by
  0x78f210 from the city's analysis (0x5ce3f0 "City Analysis"): per city
  entry of the owner's knowledge base (0x786160, 0xe0 bytes an entry) in its
  order — one listed (0x78d630) or rejected passes; the city itself passes;
  a city no longer standing (0x57960 null) leaves the list (0x78d6d0 /
  0x78f5d0); the destination's plot revealed to the player (0x2d2220 on its visibility
  0x468320: the byte at visibility +0x2f0; unrevealed -> the next entry,
  neither tried nor counted); with the
  list holding a city at the call's start, a counter allows two tries a
  turn (r13 > 2 skips); the try is the trade pathfinder (0x559140: the
  Trade_Movement finder 0xf2dc70 from the city's plot +0x158 to the
  destination's, GeneratePath 0x77d10) — reached: appended listed (byte +8
  and dword +0xc 0), else rejected; a turn that tried none (r13 0) clears
  the rejected list. A listed city of the owner's own (a domestic route)
  rates its destination (0x54ad70 >= 5: +8 set) — a city-state holds one
  city. 0x78e010 is the list's lookup.
- THE ROUTE VALUE K (0x5e9b20, this = the knowledge base +0x680; called at
  the tail of the knowledge base's ageing 0x5ebb30): the best record reset
  (0x5ea780), then per city of the player (its +0x12f0 list) and per city
  entry of its knowledge base in the city's trade list (0x78e010): an
  international destination (owner not the player) not at war (0x469cd0)
  takes the origin's yields of a route there (0x526330(origin, dest, out,
  -1, 1): CalculateOriginYieldsFromPotentialRoute 0x54eb90, 0x54c630, the
  path term CalculateOriginYieldsFromPath 0x54e160 skipped on the last
  argument 1, Trade_Manager 0x54c6c0); a domestic one adds the
  destination's (0x525b90). Each yield's amount valued (0x7a6690, the
  player's weights) and summed; a sum above the best (+0x58 = +0x6d8) is
  kept with its route. TO (+0x688) is the reset's -1: AI_Knowledge.csv
  prints "TRADE, TO -1, VAL K" (0x5ed280). runs/h1_duelv1117: Valletta's K
  2.10 from t14 (0.00 before), the record training its Trader at t33.
- Unread: the knowledge base's city entries' order (the engines take the
  route scorer's: the other city-states by id, then the majors' cities);
  0x54c630's term; what reveals a major's city to a minor beyond its looks:
  the engines reveal the major's first city at the meeting (`meetCityState`)
  — the records: a minor's K turns above 0 the turn after it meets its
  first major (runs/h1_duelw1121 DiplomacySummary: Antioch meets Rome at t6,
  K 1.80 from t7; Hunza meets China at t28, 2.10 from t29; both majors act
  before the minor in the turn), and a major meeting a city-state has its centre revealed
  that turn (21 of 21 meetings, 1117 / 1121 / 1128). Measured K: the
  engines' 1.50 against the log's 1.80 (1121 Antioch t7) and 2.10 (Hunza),
  the route's origin yields short.
- THE TURN'S ORDER OF THE LIST, K AND THE BUILDS: the city update (A,
  0x5c2650 -> 0x5ce680, its events the builds) runs before the tactical
  turn (0x785f30, its ageing's tail 0x5e9b20 setting K); the trade list is
  0x78f210's in the City Analysis job (0x5ce3f0), which the K of the same
  turn has not read. So a turn's builds read the K of the turn before, and
  its K the list of the turn before: Hunza's list takes China's capital at
  t28, its K reads it at t29, its t29 build a Warrior on the t28 K of 0.
  The engines: `minorTradeValue` / `_minor_trade_value` at the tactical
  turn after the city AI, then `minorTradeList` / `_minor_trade_list`.
  MEASURED (--aiscore --to 60): 1121 cityState.build 170 -> 171 of 174 (the
  t29 Warrior); 1117 unchanged.
- THE LEVIED ARMY'S RETURN (runs/h1_duelw1117 t42, the action log): each of
  China's three levied Warriors removed (UnitRemovedFromMap 1:655365,
  1:720902, 1:786439) and a Warrior of city-state 3 added on its plot
  (UnitAddedToMap 3:589824 ...), in city-state 3's turn; its ARMY line of
  t42 holds 8 own Warrior records against 5 the turn before, the old
  records aging on (age 16). The engines' return (`levyUnitHome`, GPU
  `_minor_levy_return`) records each unit as one the minor made (the birth
  record), the record of the unit from before the levy one of a gone
  unit's (TS id -1, GPU slot -1). MEASURED (--aiscore --to 60):
  knowledge.army 1117 69.8% -> 71.5%, 1121 70.2% -> 70.8%; 1117 t42 ours
  still 5 (the replay applies the return with the record's levyEnd
  decision a pair after the minor's turn), 8 from t43.

## C-96: the Trader's value — READ (0x7a7110, its call from 0x7b62c0)

`traderValue` in `cpu/core/aiValue.ts` (GPU `_cv_trader_value`,
gpu/core/sim_cityvalue.py); its unit-value call `unitValue`
(cpu/core/aiCityBuild.ts, GPU `_cv_unit`). Check:
`cpu/harness/cityBuildLab.ts`, the UNIT_TRADER rows.

- 0x7a7110(out rcx, player rdx, &rate r8, start r9d, horizon [rsp+0x28],
  extra [rsp+0x30]): a null player 0. The player's units (+0x12e8 +0xd8
  list) whose Units row (+0xa0) has +0x1b9 bit 0x40 (a trade unit) counted;
  at or above the trade route capacity (0x4d9320 on player +0x12e0) +
  extra -> 0. Else K = the knowledge base's (0x786160 on player +0x12b8)
  +0x6d8; end = min(start + 30, horizon); start == end: discounted(K, rate,
  start) (0x7a1240); else PV(K, rate, end) - PV(K, rate, start) (0x7a16e0
  twice). Plus 0x2c4470(the eras 0x2c3660, player id +0x128) x 256 through
  PSEUDOYIELD_GOLDENAGE_POINT (0x7a60d0); the sum (sign-extended) << 10 >> 8,
  x4.
- Its caller 0x7b62c0 (the TRADE branch) passes start = horizon = the
  unit's landing turn T and extra 0: the value is 4 x discounted(K, rate,
  T), which the unit value's tail then weights again through the
  pseudo-yield and takes PV(H) - PV(T) of. EFFECT_ADJUST_TRADE_ROUTE_CAPACITY
  (0x6c0ff0) passes its own start and horizon.
- Cases (the lab, K from AI_Knowledge.csv a turn back): runs/h1_duelv1121
  p4 t14 logged 22.02 (ours 22.12; 284.71 with the horizon H passed),
  t15 58.79 (58.93; 939.93), t17 68.11 (68.11); h1_duelv1117 p2 t17 19.95
  (19.95; 243.64), t19 56.72 (56.87; 892.15); h1_duelv1124 p3 t31 21.37
  (21.37; 260.88), t32 55.21 (55.21; 814.49). UNIT_TRADER rows within
  0.005: 1121 259 -> 314 of 338, 1117 386 -> 473 of 543, 1124 427 -> 543
  of 584. The rows left are T (1121 p4 t20 ours at T 6, the log's value
  t21's at T 6; 1124 p3 t33 likewise) or K (1121 p2 t129 424.02 against
  353.63).

## C-96: the improvement value — READ (0x7a58f0, 0x7b1320's yields, the feature removal 0x7a3010, the harvest 0x7a37d0, the build unit 0x7a2e20), PARTLY READ (the hazards' turns, 0x7b1320's tourism, defence, claimed plots, modifiers and neighbours terms), unwired

Ported in `cpu/core/aiPlotValue.ts`; measured by
`cpu/harness/plotValueLab.ts` on every IMPROVEMENTS row the five verbose
duels print (a plot whose row is all 0 the analysis skipped): 66,566 of
140,000 within 0.01 (Lumber Mill 9,401 of 9,634, Quarry 2,174 of 2,484,
Fishing Boats 4,458 of 4,810, Mine 15,547 of 22,576, Farm 22,568 of
49,067; Fort, Airstrip and the uniques far).

- The analysis (0x5ce970): per improvement in database order, FX(-9999)
  where 0x35ede0 refuses the player or 0x35fd60 the plot; else T = max(the
  research AI's turns 0x7610e0 to PrereqTech +0x160, the civics AI's
  0x621920 to PrereqCivic +0x158), the value 0x7a58f0(impr, rate, T,
  horizon, plot, city). The Improvements row (loader 0xac6bb0, its SELECT
  alphabetical): AirSlots +0x2c, Appeal +0x30, DefenseModifier +0x34,
  DispersalGold +0x38, GrantFortification +0x3c, Housing +0x40,
  MovementChange +0x44, YieldFromAppealPercent +0x60; lists Adjacencies
  +0x110, Tourism +0x168, ValidBuildUnits +0x1b8 (ConsumesCharge +0x28
  bit 0), ValidFeatures +0x1d0, ValidResources +0x1e8 (MustRemoveFeature
  +0x28 bit 0), YieldChanges +0x218, YieldFromAppeal +0x230.
- 0x7a58f0: T at or past the horizon FX(-9999); the build unit 0x7a2e20
  (ValidBuildUnits: the player's own version, the cheapest by its current
  cost 0x4f2b20, 0 for one spending no charge; none FX(-9999)); the charge
  = current cost / (+0x7b0[u] + 3), whole, at the Production DefaultValue
  with no player, discounted T (1127 t2: a 25 Builder's 8). The plot's own
  improvement: 0 unpillaged, its repair pillaged. Another improvement: its
  resource value and 0x7b1320 off. A resource the improvement does not
  list: its harvest 0x7a37d0 where Resource_Harvests has rows, else 0;
  one it lists keeps the feature where MustRemoveFeature is false. A
  feature it neither keeps nor lists: 0x7a3010, or 0 where not Removable.
  Then - the charge + 0x7b1320 + the resource value 0x7a21e0 (1 copy; a
  stockpiled resource's count by 0x7a2140, unread).
- 0x7a3010: Feature_Removes' rows escalated x + (10x - x) n / 100, n the
  larger of the civics' and techs' percent held (0x399810 / 0x4c9cf0 return
  100 x held / possible; 0x5267a0 type 1 takes n as given, GlobalParameters
  +0x37c; the five duels' improvement rows 66,566 -> 75,404 exact over the
  raw counts), at the speed (0x5254d0), at DefaultValue, discounted T; less a
  Builder's charge (the unit by hash 0x11d57532) and Feature_YieldChanges
  at DefaultValue (Appeal x 0.5 Food more where a neighbour holds a
  district with Housing, 0x79e140; Districts +0x40 Housing) from T to H.
  0x7a37d0: Resource_Harvests at DefaultValue discounted T, less a charge
  and Resource_YieldChanges from T to H.
- 0x7b1320: T >= H FX(-9999); a drought hitting it 0; the XP2 river manager
  (0xa2cbf0 / 0xa2af70 at severity 1: over the named rivers whose
  Floodplains list holds the plot, each severity from MAJOR up adds 100 /
  its river entry +0x98[sev] — 0xa2efb0's N / OccurrencesPerGame at the
  game's realism (0x339140), N the event draw's 0x339020 — and the turns are
  100 over the sum, -1.0 where no named river holds the plot; an unnamed
  river is skipped, so a farm on its floodplains reads -8, its charge;
  `floodHazardTurns` / `_minor_flood_turns`) and the feature manager
  (0xa1cc70, its +0x28 / +0x98: a volcano beside the plot) cut H to their
  turns, H <= T 0 (LAB: an eruption in 31 beside a volcano, its computation
  unread). The plot test 0x35fd60 takes a removable feature cleared and a
  harvestable resource harvested (the five verbose duels: the Farm on
  Woods, Rainforest and Marsh at 54.34, on Cattle beside the Pasture; none on
  Sugar or Ivory) and a ground row's civic held (no Farm on Hills before
  Civil Engineering). A turn: PSEUDOYIELD_IMPROVEMENT 1.0, Improvement_YieldChanges
  and its adjacency: the loop over Improvement_Adjacencies (+0x110..+0x118)
  hands 0x365ae0 each row on its own (r8 = the row, r9d its yield +0x108 ->
  +0x14) and values that row's integer, so the rows sum, each counted once
  — a yield's whole adjacency once, not once per row (runs/h1_duelv1117
  Caguana's Batey, four Culture rows: 692 -> 1,279 of 2,525 rows exact,
  the misses whole multiples of one Culture's 20.11 gone), YieldFromAppeal at the plot's
  Appeal x the percent, each at the player's value (0x7a6690, 0x7a60d0);
  Improvement_Tourism at PSEUDOYIELD_TOURISM x the era factor;
  min(max(n, 1), DefenseModifier) + min(n, GrantFortification), n by
  0x3dfae0 (partly read: a count over the game's players; ported at n 0, a
  LAB fit — runs/h1_duelv1124 Granada's Alcazar, DefenseModifier 4, every
  row 1.0 a turn above the value without it, 104.61 at its t2 plot); the Barbarian Clans traps' properties
  (PLOT_DAMAGE_TO_WALKING_INTO / _ADJACENT, hashes 0x7d27db83 /
  0x8634aa0f); x3 where a build unit spends no charge. PV(H) - PV(T); the
  Housing over TilesRequired at the housing value 0x7a3d70; where the
  civics' list +0x1380 holds the improvement (0x39de20) the claimed plots
  0x7a10c0 (each neighbour within 3 of the city another owns, without a
  wonder or district: its purchase cost 0x1b1cb0 x 0.5 Gold discounted T,
  0x79f0c0); its modifiers 0x7a4b20. No neighbour is revalued for an
  improvement (0x79f280's one caller is the district value body). Unported:
  the tourism, claims and modifiers terms. LAB: the
  Housing counted a second time at its whole value (the housing value's
  whole part, as an analyzer's): runs/h1_duelv1117 Caguana's Farm rows
  each the value without it plus exactly that whole part (18.00 at t6, 30.00
  at t12, 47.00 at t38, 88.00 at t45), the Batey over a Farm as much below;
  1,115 -> 1,623 of Caguana's 2,716 Farm rows exact with it. Its writer in
  0x7a58f0 / 0x7b1320 / the modifiers 0x7a4b20 unread (0x7b1320 calls the
  housing value once, over TilesRequired; 0x6ad2b0, an analyzer beside
  EFFECT_ADJUST_DISTRICT_AMENITY, calls it too).
- The research AI's turns (0x7610e0): the entry's turns plus its +0x528,
  the turns left on the research as its last turn wrote them; a city
  founded the turn before reads -1 (1127 t2: the minors' Mines at T 4 of
  Mining's 5). The write is GetTurnsLeft 0x4ca120: -1 with the queue empty
  (+0x188 0) or its head -1, else 0x4c9f90 -> 0x4ca000 at the player's
  Science, whose 0x8c4540 gives -1 at no Science with no fallback to the
  cost — the founding turn's research AI turn, before the city stands, writes
  -1 (runs/h1_duelw1117 t2: Valletta's and Caguana's Walls trees, Masonry's
  21 - 1, no Warrior contract in AI_CityBuild until t9).

## H-1: the research AI — READ (the choice), PARTLY READ (the value)

AI/Research.cpp. The object (the player's +0x12a8) keeps one 0x50-byte entry
per technology in table order (+0x318 tracked, data at +0x370): +0 the row,
+4 its next step, +0x10 its own value, +0x14 its score, +0x18 owned, +0x19
boosted, +0x1a leaf (0x761b70: no row lists it as a prerequisite), +0x1b
Repeatable (`Technologies` +0x70 bit 8), +0x1c turns; the goal at +0x450
(tracked +0x3f8), the favored flags (AiFavoredItems of the leader's
Technologies list) at +0x4b0. Its log is AI_Research.csv (0x762b40: "%d, %d,
Tech, %s, %3.1f, %s, %d" — OWNED / RESEARCHING / GOAL / BOOSTED, the score
and the turns; a row with turns < 0 unowned is not logged; 0x5f4be0 "Tech
Contract %d").

- THE ANALYSIS, 0x761170 (the "Tech Tree Analysis" job 0x760890): next :=
  row, turns := -1; a non-repeatable row the player holds is owned, value 0.
  Else three levels: each walked row adds its turns left (0x4ca000: the cost
  0x353a70 in fixed point less the progress kept on it [+0x388] and the bank
  [+0x1e8] read through max(0, ·), ceil over the Science rate 0x4c9f40 —
  0x8c4540 compares the remainder to rate x the truncated quotient, -1 with
  no Science — the walk itself takes the cost where the turns are not above
  0, 0x7612ea `test eax; jg`); a row not researchable (0x4c8c40) adds its unowned
  prerequisites, each level's rows once, the next step the last one added
  that is not the research in hand ([PlayerTechs+0x178][0]). Rows still
  added at the third level leave the entry out of reach (turns -1, value
  untouched: 0 for every row the walk never reached). Else turns = max(0,
  sum) and value = 0x7b3e50(row, turns, H, discount); score = value.
- THE VALUE, 0x7b3e50 (args: row, &discount, turns, H, player, the row's
  record +0x530): past H, -9999 (0xf04cb0). The own term: PSEUDOYIELD_TECHNOLOGY
  of 1.0 (0x7a60d0: amount x DefaultValue x max(0, 1 + bias), the bias
  0x700810 the sum of four per-player arrays, unread), +1.0 where row +0xc0
  is set, +5.0 for EmbarkAll (+0x70 bit 4), +5.0 where 0x7a4850 holds; a row
  of an era before the game's x (game - era + 1) — the game's era as the
  player's PlayerEras holds it ([player+0x1358]+0x158, m_eGameEra, named in
  the constructor 0x411770; its writer unread), the era before through the
  players' starts of the turn a new era begins: runs/h1_duelw1121 t30 and t60,
  every major's, city-state's and the Free Cities' Tech and Civic rows as in
  the era before, while those starts' research prices read the new era
  (`aiGameEra`) — else + PSEUDOYIELD_GOLDENAGE_POINT
  of 0x2c4170(player). Each term is paid from landing to the horizon:
  PV(H) - PV(turns) (0x7a16e0: a(D-1)/(kD), D = 1 + nk + n(n-1)k²/2 +
  n(n-1)(n-2)k³ x 0.16667, k = rate/100, a perpetuity a/k past nk >= 10;
  the horizon itself one discounted turn 0x7a1240, (1-k)^n with -0.16667).
  Row +0xc0 is the EmbarkUnitType (Sailing, Celestial Navigation). Then,
  paid whole: per unlocked unit (+0x178) the player's version, over its
  cities training the unit's domain (0x17d660) the average of the City
  Analysis values above 0 (0x5d4cd0, each capped 50.0) x 10, and per upgrade
  source (unit +0x1d8) each of the player's units of it (0x4f2c90, a plain
  count) max(that average - the upgrade's Gold as a yield (0x5376d0 ->
  0x7a6690), 20.0); PSEUDOYIELD_UNIT_COMBAT of 100 where 0x4f2af0 (the units
  manager's Corps / Army TECH, -1 in the install) names the row and
  0x536da0 (the player holds that civic and tech) fails — never.
  PSEUDOYIELD_TOURISM of the +0xe8 list (per improvement Tourism row, the
  player's plots of it, 0x1aba40); per building (+0x90) the player's
  version (+0x230) 0.5, a wonder (+0x158 & 0x40) PSEUDOYIELD_WONDER of 0.5;
  per district the player may have (0x406c00) PSEUDOYIELD_DISTRICT of 0.5;
  per project (+0x160) 1.0 (4.0 where [player+0x1290]+0x6e8 counts it),
  PSEUDOYIELD_SPACE_RACE of 0x7b8a30² (a std::function walk, unread) for a
  space race one, + NUCLEAR_WEAPON of 1.0 for a weapon (+0x148), each paid
  from landing; per improvement the resources near the cities (0x5d45c0 -> 0x7a21e0);
  the governments' (+0x130, 0x7b26b0); x1.5 where the row is [+0x12a0]+0xd88
  and 0x3dcf50 holds; + the row's modifiers analysed (0x7a4b20). The
  discount is the GlobalAI's +0x290 (a variable at +0x238): its initializer
  (0x6ddb40..0x6ddba3) writes AI_DISCOUNT_RATE (GlobalParameters +0x10, 2.0)
  through 0x525590 — x 100 / the speed's CostMultiplier ([speed+0x28]) — over
  the constructor's 0x200 (0x6db0cf): 4.0 at the online speed. H the value
  horizon [GlobalAI+0x2f0][1]: 50 on every duel (632,528 rows: past 50
  -9999, at or under 50 not, but contracts and Future Tech).
- THE PROPAGATION, 0x7604e0: a row in reach adds the +0x10 of its unowned
  prerequisites one and two levels up (each level's rows once; a negative
  one adds 0), then x1.5 if favored (Rome's Animal Husbandry 90.4 = 60.3 x
  1.5 at 1124 t1, China's Masonry -14908.1 = -9938.8 x 1.5).
- THE CHOICE, 0x763020 (key): the comparator 0x75d530 over the entries —
  the same next step: the larger turns where their product is not positive;
  a row whose next step is the key loses, another takes its place; unowned
  before owned; a leaf researchable now before a required row that is not
  (and the reverse); else the higher score, the first on a tie. A best row
  with turns > 0 and a researchable next step: goal := row, research := next.
  Else a goal still unowned stays; else one draw "BT Research Choice" over
  the researchable rows in table order (range 5 at 1124 t1: the five roots).
- THE TURN, 0x760980: contracts — the research AI's list (+0x210, 0x10 an
  entry) walked, each live contract's interface (vtable 0xd5bae8) called at
  +0x40 = 0x5f36e0: 0x761980(research AI, the contract's tech +0x408, its
  value +0x3a0), which adds the value to the entry's score (+0x14) where
  the score is not negative and the row unowned (+0x18 clear); a contract
  IN PROGRESS (5) or ACCEPTED (3) whose +0x70 (0x5f5940) holds is also
  called at +0x10, any other released (0x600b00) after the add (`researchAnalysis`'s
  `contracts`; runs/h1_duelv1124 t6 player 4: Writing 251.0 = 124.0 + its
  Tech Contract 127.0, Astrology 124.0 none). Then the propagation, then: with no research the choice (key -1); with
  one, the best (first entry, then any unowned higher) replaces it only if
  its next step differs, it scores more than the goal's (the research's
  without a goal) + AI_CURRENT_TASK_BIAS x 10, it is researchable itself.
- A COMPLETION, 0x762d60 (the completed row): the in-hand turns +0x528
  zeroed (0x731d10 on +0x4d0), the propagation once more on the entries as
  they stand, then the contract list (+0x210) walked once more — a contract
  IN PROGRESS (5) or ACCEPTED (3) adds its value again (+0x40 0x5f36e0 ->
  0x761980) and is called at +0x10, any other released (0x600b00) — then
  per row 0x68d090 (the player +0x1288, the row's prerequisite the
  completed one), then the choice with the row as the key (1124 t6: minors
  2 and 3 pass Writing, Currency and Irrigation over — their next step was
  Pottery — and take Celestial Navigation through Astrology and Bronze
  Working through Mining, as logged; runs/h1_duelw1117 t14 Caguana:
  Astrology done, Celestial Navigation 477.1 + its Tech Contract 36's 40.0
  over Iron Working's 480.7, Sailing taken, as logged).
- THE TECH CONTRACT'S CHECK, vt +0x70 0x5f5940 (the research AI's
  submission listener 0x7635c0 on player signal +0x270 takes a contract it
  passes — ACCEPTED — into +0x210; the turn walk calls it on the IN
  PROGRESS / ACCEPTED ones): no tech (+0x408 -1) CANCELLED (6), fails; IN
  PROGRESS with the research (0x761940) other than its next step (+0x468)
  CANCELLED, fails; the tech held COMPLETED (7); the tech the research: next
  step := the tech, IN PROGRESS; the tech researchable (0x4c8c40): next step
  := the tech; else a next step still researchable stays; else the
  prerequisites walked from the tech (0x353cb0) to an unheld researchable
  one, next step := it — each passes, the status otherwise unchanged.
- THE SCIENCE THE TURN READS: the research and civics AIs' turns (list B)
  run after the player's own turn start banked the pots and grew its
  cities, on the Science and Culture the grown city makes — runs/h1_duelw1124
  t5 Granada, grown to two citizens that turn: every row at 3.0 Science
  (Animal Husbandry and Mining 4 turns, Writing 10, Bronze Working 18), not
  the 2.5 its pots banked (5 / 11 / 21). A completion's choice stays at the
  bank, on the analysis of the turn before.
- THE CITY TERMS' TIMING (list B before the cities A, "The turn" in the
  city build AI's section): the unit term reads the city's UNITS table
  (0x5d4cd0) as the city AI's last turn left it, the resources term the
  counts the city's last update kept (CityBuildAI +0x978, 0x5d45c0). A
  city-state's first turn: its research and civics AIs choose before its
  city stands, at no Science, Culture or city term (runs/h1_duelv1124 t1:
  every minor's Pottery 78.3 at 12 turns, RESEARCHING, Writing its GOAL); at
  t2 the founding turn's Default Specialization table gives the unit term
  (Iron Working 181.4 = 141.4 + two Warriors' upgrade floor 20.0 each,
  minor 4) and no update has counted resources yet (Animal Husbandry 82.6,
  107.5 from t3 with the Cattle counted); Pottery at 4 turns, the t1
  choice's 2.5 Science banked on it (113.0). On the engines' own founding
  table the Archer's 1.54 is the game's -0.2 (t2 Archery 157.7 against
  142.3): the founding turn's tables' LAB.
- MEASURED on the logs alone (29 duels, a goal change the comparator's best
  over the turn before's or the turn's logged scores): majors 1,654 of 1,805,
  minors 4,244 of 4,980 by one of the timings (1,017 minor changes with every
  score negative: the random pick). At the discount of 4.0 the read terms
  give a root row (no prerequisite logged that turn) of a city-state exactly
  21,700 of 78,986 times (Mining 60.3 at 12 turns, Pottery 78.3, as every
  minor of 1124 logs at t1); the rest carries the terms marked unread above
  (the Tech Contracts' values among them: 1124 t3 minor 2 Masonry 13.0, as
  its contract row) — AUDIT C-96. The prerequisites walk in the install's
  order (Education: Mathematics, then Apprenticeship).
- MEASURED with the terms above (`cpu/harness/researchValueLab.ts`, the
  verbose duels' city-states, a row researchable now against its own
  value plus the logged Tech Contracts, the unit term on the city's
  UNITS table the log printed the turn before): runs/h1_duelv1127 3,729 of
  3,875 (Sailing 120.7 at 1 turn with its EmbarkUnitType; Iron Working +20 a
  Warrior; Industrialization's project +20.1); the space race (Rocketry)
  the rest. On the engine's own unit tables 3,488.

## H-1: the civics AI — READ (the choice, the walk, the propagation), PARTLY READ (the value)

AI/CultureAi.cpp. The object (the player's +0x1278) keeps one 0x50-byte
entry per civic in table order at +0x978 (count +0x988): +0 the player, +8
the row, +0xc owned, +0xe boosted (0x39d190), +0xf repeatable, +0x10 its own
value, +0x14 its score, +0x18 turns, +0x1c its next step, +0x20 the
governments it unlocks, +0x38 its policies. Its log is AI_GovtPolicies.csv
(0x6255f0: "%d, %d, Civic, %s, %3.1f, %d" — the score and the turns of every
row with turns at least 0; "RANDOMLY CHOSEN CIVIC" 0x626600).

- THE ANALYSIS, the "Civic Tree Analysis" job (0x61fa20 launches the job at
  +0x838, vtable 0xd5d420; 0x621e20 runs 0x621a20 on each entry): turns :=
  -1, value := 0, next := row; a non-repeatable row held is owned. Else the
  research AI's three-level walk: each walked row adds its turns left
  (0x39c0e0: the cost 0x29a010 less the progress kept on it and the bank
  [+0xb40] — no max(0, ·) here — through 0x8c4540; -1 with no Culture, then
  the cost), a row not researchable (0x3932d0) adds its unowned
  prerequisites (0x29a250, the install's order: the walk's next step, the
  last added that is not the civic in hand ([+0xad0][0]), takes the install
  order 3,558 of 3,626 picks, the sorted order 3,130), each level's rows
  once; rows still added at the third level leave the entry out of reach.
  Else turns = max(0, sum), value = 0x7a9a10, score = value.
- THE VALUE, 0x7a9a10 (row, &discount, turns, H, player, policies,
  governments, ...): at or past H, -9999 (the research value's: past H). The
  own term PSEUDOYIELD_CIVIC of 1.0 (0x7a60d0) paid from landing to the
  horizon (PV(H) - PV(turns), 0x7a16e0); the governments it unlocks, each
  max(v - v(the current), v / 2) of the government values [+0xb38], bare (a
  city-state's current is Chiefdom); +0xb38 [gov] is written by the civics
  AI's turn 0x620110 after its propagation, 0x7b0330(gov, the rate
  0x6fec30, start 0, valueHorizons[1] = 50), the government value of "C-97:
  the government and policy choice" (0x621eb0 is the policy job, not this
  term) — the sum of the own term and these, not the own term alone, is
  what the era count multiplies (0x7a9f11: r13 holds both). Ported TS-only
  (`civicValue`, `governmentValues`): runs/h1_duelw1121's city-states'
  Political Philosophy -78..-81 -> -29 under the log at t11-t13, -64..-67 ->
  -13..-18 from t14, the rest the policy analyzers still at 0 (Discipline
  34, Ilkum 1 ...); the first civic pick off the log t21 -> t46; then a civic of an era before [player+0x1358]+0x158
  (the game's era, as the research value reads it) is taken (that - era)
  times — no +1 here (runs/h1_duelv1127: every city-state's Ancient civic at
  1 turn 120.6 in the Classical era) — and a later one adds
  PSEUDOYIELD_GOLDENAGE_POINT of the player's eras record +0x2c (0x2c4110, 0
  for a city-state); per unit the player's version (+0x170) the cities'
  average City Analysis value (0x5d4cd0, uncapped, once) and per upgrade
  source unit max(that - the upgrade's gold, 20.0), paid whole;
  PSEUDOYIELD_UNIT_COMBAT of 100, paid whole, where 0x4f2ac0 — the units
  manager's land Corps (+0xaa8) / Army (+0xb08) civic: Nationalism,
  Mobilization, a trait's EFFECT_ADJUST_CORPS_ARMY_PREREQ — names the row
  and 0x536da0 fails; per building the player's version 0.5, a wonder
  PSEUDOYIELD_WONDER of 0.5; per district the player may have (0x406c00)
  PSEUDOYIELD_DISTRICT of 0.5 — each paid from landing to the horizon; its
  policies: the best of its cards' scores (0x623b90, 0 at least) less the
  weakest slotted card's (0 with none), at least 20.0 (0x7aacb1) — the
  scores the policy jobs of the civics AI's last turn wrote, on the civics
  that turn's analysis listed (runs/h1_duelv1121 Hunza: Military Training
  115.9 at t44-46 on Equestrian Orders' 37.0, Civil Service 71.5 at t46 on
  Civil Prestige's 62.0, first scored at t45 as Civil Service first valued
  above 0 that turn; `civicPolicyBest` / `citystate_civic_pol_best`); and the
  civic's modifiers analysed (0x7a4b20) from landing to the horizon. The
  discount and H are the research value's (4.0, 50). The CivicModifiers'
  analyzers: EFFECT_GRANT_INFLUENCE_TOKEN 0x6a3780 (Amount x the player's
  points a token, Player_Influence +0x270 — 50 for every city-state, the
  Chiefdom threshold at the speed; the Free Cities' none: their Mysticism
  logged the token's whole 13.0 below it at 20 turns, runs/h1_duelw1121
  t32-t100 — PSEUDOYIELD_INFLUENCE, discounted from landing); EFFECT_GRANT_SPY 0x6aa780 (PSEUDOYIELD_UNIT_SPY of Amount, landing
  to the horizon); EFFECT_GRANT_COMBAT_ADJACENCY 0x6c4060 (Enable: the
  player's strength over every domain 0x4bd0d0(-1) = PlayerStats +0x210 -
  +0x390, bare, landing to the horizon — 20 a Warrior, AI_Military.csv's
  Regional Strength; m_iMilitaryStrength less m_iMilitaryStrengthFromGold
  as 0x4bb1e0 stored them at the player's turn start, before its
  production: runs/h1_duelw1121 Antioch's Warrior, trained by its t13
  production (contract 28 COMPLETED at t13), first counts in Military
  Tradition's value at t14, 186.9 -> 459.9, as logged; 1127 t13 player 2
  likewise); EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS 0 for a
  city-state (State Workforce, Early Empire every one exact).
- MEASURED (`cpu/harness/researchValueLab.ts`, a row researchable now
  against its own value, the policy term on the logged Policies scores of
  the turn before): runs/h1_duelv1127's city-states 2,446 of 2,952; the
  governments (Reformed Church, Divine Right, Exploration, Political
  Philosophy, the tier-3 civics) and Foreign Trade's route value the rest.
  On the policy floor alone 2,058.
- THE PROPAGATION, 0x61ee30 (the turn 0x620110's first step, on each
  entry): a row in reach scores its own value and its prerequisites' one and
  two levels up (owned ones walked through at no value; each level's rows
  once; a negative value counts 0 — Military Tradition 123.7 at 55 turns,
  its own -9999 counting nothing), x1.5 if favored ([+0x268], the leader's
  Civics lists' AiFavoredItems; 1.5 at 0xd2f32c).
- THE CHOICE, 0x626600 (key): the comparator 0x6182e0 over the entries —
  unowned before owned; a row whose next step is the key loses to one whose
  is not; the larger turns where their product is not positive; else the
  higher score, the first on a tie. Its next step, researchable (0x3932d0),
  is queued; else one draw "Random Civic Choice" over the rows neither held
  nor unresearchable, in table order.
- WHEN: the AI's turn (0x620110) chooses with key -1 only where nothing is
  in hand (0x399a90 = -1). A COMPLETION fires the delegate 0x6293e0 — the
  government pass 0x625d70, then 0x626600 with the completed civic as the
  key — over the entries the AI's last turn left, before this turn's
  analysis (1103 t12 minor 2: Craftsmanship completes, Military Tradition,
  726.8 at t11, is taken; the t12 log already scores Military Training
  797.9 first).
- MEASURED on the logs alone (29 duels): the completion's choice over the
  logged scores of the turn before takes the record's pick 3,558 of 3,626
  minor picks and 1,203 of 1,295 majors' (11 "Random Civic Choice" draws in
  all). The value as ported (the own term, the era count, buildings,
  wonders, districts, the policy floor) fits every root row the read terms
  cover — Code of Laws 85.2 at 10 turns, Craftsmanship 38.5 at 30, 51.0 at
  23 — and takes the record's pick 2,868 of 3,626 on the logged turns; the
  terms unported (governments, units, the policies' values, the modifiers,
  the per-player bias of 0x7a60d0's pseudo-yields 0x700810) are AUDIT C-96.

## C-95: a river crossing's Movement — READ

- GlobalParameters MOVEMENT_RIVER_COST (Base GlobalParameters.xml 2, no
  expansion row) is loaded by the parameter reader 0x2d58f0 into the
  parameter block +0x50c (default 2, beside MOVEMENT_EMBARK_COST +0x504 and
  MOVEMENT_PORTAL_COST +0x508).
- Its one reader is the movement cost's river term 0x5301e0, called from
  the three movement-cost callbacks (0x26e920, 0x270980, 0x270be0): when
  the step crosses a river (0x531510 on the from / to plots) and the unit
  is not exempt (0x266470), it adds (+0x50c) << 8 — 2 MP in 24.8 — to the
  step's cost accumulator (0x26ee80: +0x34 += x through 0xac650). A
  crossing is the terrain's cost plus 2 (`RIVER_CROSS_MP`, the GPU's
  `river_mp`).

## C-95: the unit pathfinder and the planning's reach — READ, confirmed on the Wander draws

`reachPlots` / `pathTo` in cpu/core/tactical.ts.

- The pathfinder (Pathfinder_Instance; GeneratePath 0x77d10, one step
  0x793f0) is Dijkstra: the pool's instances (0x26f330) carry no heuristic
  (the +0x30/+0x38 pair is null), so a node's key is its cost. The open list
  (+0xf0 head, +0xf8 tail, doubly linked) is sorted by (f, g) (0x775a0): a
  key below the head's goes first, above the tail's last; otherwise the
  insertion scans from whichever end the key lies nearer in float (|key -
  head| <= |key - tail| scans from the head and goes BEFORE its first equal,
  else from the tail AFTER its last equal). A node re-keyed while open walks
  toward the head past strictly greater keys (0x79560). The step pops the
  head (0x781e0: NotifyList 2 then 3, closed) and links its neighbours in
  DirectionTypes order (0xeff730: (0,1) (1,0) (1,-1) (0,-1) (-1,0) (-1,1)
  in the game's (x - y//2, y) — NE, E, SE, SW, W, NW), each the valid
  callback admits (LinkChild 0x78750).
- UPDATEPARENTS (0x79660, READ), from LinkChild where a CLOSED child is
  made strictly cheaper: a stack (+0x110, empty at entry) from the child;
  each node popped has its children (+0x38, count +0x4a, six inline) priced
  again from it by the cost callback (+0x48: the step's cost onto the
  child's +0x1c known cost, saturating), the node's own parent skipped
  ("parent->m_pParent != kid"); a child strictly cheaper takes the new known
  cost and total (+0x1c / +0x18, the heuristic +0x24 << 8 none here), the
  node as its parent (+0), an open one re-keyed (UpdateOpenNode 0x79560),
  the notify callback (+0x68, type 3) told, and it is pushed once. The
  validity callback is not asked again. The engines: `search`'s `kids`
  and the walk after a closed child's re-parenting / `_tac_search`'s
  `linked6` and `update_parents` (the links landing one by one in a step
  that re-parents a closed child). Measured (--aiscore --to 60, eight
  duels): cityState.move.plot 3112 -> 3139 of 4021; the barbarians'
  families unchanged.
- THE PATH'S TURN ENDS (0x2720a0, the move order's validity at the end of
  0x26e570): each node records (0x271be0) whether its player sees its plot
  (+0x50 bit 2) and the count of the unit's own stacking units on it, the
  unit itself not counted (0x585eb0, +0x54); the validity walks the new
  node back through its parents and, at each node after which a turn
  begins, refuses the link where the plot is seen and the count reaches the
  stacking limit (+0x1b0) — search flags +4 / +0x1000 clear. A node is
  tested at the destination only where it is the pathfinder's +0xd8 plot
  (unread: taken as never), so a path may end on its own unit's plot and
  the walk stops short (the move mission). runs/h1_duelw1121 t11: the
  Horse Archer at 34:8 for 30:7 takes the path whose turn ends on the free
  33:6, not the one through 33:7 / 32:7, both held by its own units. Ported
  (`search`'s zone-of-control paths, `groundOf`'s full; `_tac_search` with
  `zoc`).
  The walk's other turn-end tests (0x272262..0x272313), each on a seen node
  after which a turn begins: a mountain (+0x50 bit 4, terrain bits 0x4924)
  or an impassable feature (+0x50 bit 8) unless the unit's +0x1f6 lets it,
  water under flag 0x80 (+0x50 bit 0x10), a city not at war (+0x51 bit 2)
  — the stacking, mountain and city tests all off under flag +4. The
  planning's search (0x115 | 0x800 | 0x100) carries +4: none of them runs
  there (the planning classifier, 1124 t1-60: applying the stacking test
  takes 822 equal rows to 472).
  After the walk (0x272372..0x272692): the embarking tests under the unit's
  +0x1f2 / +0x1f1 bytes on a revealed child; flag 2: a child owned by a
  player at war refused; a clans' tribe test (0x151550, 0x147c20); under
  the unit's +0x1f7 byte or flag 8, a child whose danger (0x716a90) is above
  0 refused from a parent of turn 1 or less, and under flag 0x8000 the same
  for a water child; flag 1: a parent not revealed refused unless it is the
  unit's own plot, and a child in a major's territory not at war refused
  unless the player may enter it (0x3dab70). Which of the +0x1f7 byte's
  setters the planning's pool takes is UNREAD.
- A step's turns and Movement (0x26e920, in 24.8 fixed point): a parent with
  no Movement starts the next turn at the domain's full Movement; the step's
  cost (Rules_Movement 0x531660..0x530240: the terrain's MovementCost, the
  feature's and the improvement's MovementChange, MOVEMENT_RIVER_COST 2 over
  a river, MOVEMENT_EMBARK_COST 2 over a shore, a route's own cost as a cap,
  CITY_MOVEMENT_COST 1 into a city) above the Movement left waits for the
  next turn (turns + 1, Movement 0), unless the parent is the unit's own plot
  and the unit has not moved (flag 0x100: the step spends everything this
  turn) or the parent began a turn (it spends everything); a zone of control
  spends everything (0x26f980) — save under flag 0x800. Between two plots
  the player never revealed (node +0x51 bit 0, 0x154c0) the step costs the
  parent's or 1 and no rule runs.
- The cost (0x270dd0): 1000 x the step's Movement (0x16e7d0, the 0x3e800
  constant); where the step leaves no Movement +4, and on a revealed plot
  then the 1e6 penalties (mountain, impassable) and +3 off the player's
  territory; then +2 on a revealed plot, +3 on an unrevealed one. The
  engines (`search`) read every plot as revealed: +2 a step, and where it
  leaves no Movement +4 and +3 more off the unit's own territory; the
  impassable plots never link.
- The planning's reach (AI Unit Planning 0x792c90 -> 0x791e00 -> the
  breadth-first search 0x26dcd0 for 2 turns, flags 0x115 | 0x800 | 0x100
  where the unit has not moved; the valid wrapper 0x26e570 refuses a node
  past the turn limit): the list at planning +0x30 (16-byte entries x, y,
  turns, Movement) is filled by the NotifyList callback 0x26d890 when a node
  CLOSES (code 3), so it holds the plots in the order Dijkstra closes them,
  the unit's own plot first; a plot met again keeps its place and takes the
  fewer turns, or at equal turns the more Movement (0x790c60). The planning
  runs once for every unit at the start of the AI's turn. Flag 0x800 skips
  the zone of control: the reach walks through it.

Confirmed on the game's Wander draws (below): the order of the plots the
draw indexes, over 29 duels, reproduces the logged pick on 98% of the rows
whose state the records pin (`.claude` analysis `wander.ts`); the misses
are rows whose unit acted earlier in its turn (a pillage) or stood where
the records do not show it.

## C-95: the tactical pass — READ (the barbarians' moves; the minors share it)

- The pass (TacticalAI 0x771530, a vtable slot): the unit list (+0x240,
  0x77d100 from the player's unit evaluator 0x60a8c0 / 0x6092c0), then the
  moves (0x770ce0) in the order of the player's AiFavoredItems tactical list
  (Tactics.xml "Default Barbarian": Barbarian Rampage, Attack High
  Priority, Defend Camps, Attack Civilians, Plunder Trader, Coastal Raid,
  Pillage District, Pillage Improvement, Attack Medium Priority, Move to
  Safety, Attack Low Priority, Chase Target, Wander Near Camp); each move
  walks the units left, and the units a move used (+0x258) leave the list
  after it. The homeland list ("Default Barbarian HL": Plunder Trader, Move
  to Safety, Explore Land, End Turn) takes what is left. The moves' globals
  (0x5bbf80, AllowedMoves hashes): f2e0f4 Move to Safety, f2e100/104/108
  Attack High/Medium/Low (0x7784b0 with TARGET_HIGH/MEDIUM/LOW_PRIORITY_UNIT),
  f2e10c Attack Civilians (0x779240), f2e120 Defend Camps (0x779010),
  f2e124 Attack Camps (0x778910), f2e130 Chase Target (0x775670 then
  0x773030), f2e134 Wander (0x77b580), f2e138 / f2e13c Pillage Improvement /
  District (0x77a810), f2e140 Plunder Trader (0x77aa20), f2e158 Wander Near
  Camp (0x77b9a0), f2e168 Coastal Raid (0x7794b0), f2e17c Barbarian Rampage
  (0x778b40).
- The unit list's order is the player's unit pool's: a unit's ID is its
  serial << 16 | its slot, and a turn's rows of one move run in ascending
  slot (every Wander row of 1117, 1124 and 1128). The pool is a free list:
  a unit gone frees its slot at the next turn, the slots freed in a turn
  pushed in ascending order, and a new unit takes the slot last pushed, else
  a new one past the end (every barbarian unit added in 1105, 1117, 1121,
  1124, 1127, 1128 to turn 250).
- A unit's AI type (+0x1c0, UnitAiTypes: 2 EXPLORE, 3 COMBAT, 4 DEFENDER):
  a tribe's camp defender DEFENDER, its scouts EXPLORE, the rest COMBAT; a
  camp destroyed turns its tribe's DEFENDER units COMBAT (0x154830).
- Wander Near Camp (0x77b9a0): each unit of AI type above EXPLORE with a
  tribe (+0x11d0) whose camp stands (0x771250): from its planning reach, the
  plots of turns 1 with no unit at war with it (0x5862e0) and none of its
  own stacking with it (0x585eb0, the unit itself counted: its own plot is
  never one), within 5 of the camp and, where the camp plot belongs to a
  city, of that city's; one "Random Direction" draw over their COUNT — the
  weights the loop builds (influence and revealed) are never read — and the
  unit moves to the plot drawn ("Wander"); with none, it moves toward its
  camp ("Wander Back to Camp", mission flag 0x1000). The unit's turn ends
  (0x56d6f0, 0x570b40).
- Defend Camps (0x779010): each TARGET_BARBARIAN_CAMP target, the units of
  AI type DEFENDER within 3 turns (0x774e90), the nearest moved to the camp
  ("Barb. Camp Defense", AT the camp). The engines take the first by pool
  slot: a camp keeps one DEFENDER, the unit it raised first.
- Pillage District / Pillage Improvement (0x77a810): each target of the
  kind in the tactical target list (0x783980, PARTLY READ: the visible plots
  in index order; the engines take the plots the barbarians see, in plot
  order) on the ground of a player at war with them — a complete district
  but a city centre or an Encampment, else an unpillaged improvement — the
  units of AI type EXPLORE or above whose planning reaches it this turn
  (0x775340, 1 turn) in pool order, none standing on a plot of the kind
  itself (0x774380), go to it until one stands on it and pillages it.
- Barbarian Rampage (0x778b40), the target list (0x783980), Attack Civilians,
  Plunder Trader, Chase Target, Attack Units and Move to Safety: the section
  "C-95: the attack plots in the reach, the target list, the rampage, ...".

## C-95: the attack plots in the reach, the target list, the rampage, the civilians, the traders, the chase — READ

`tacticalTargets`, `planTargets`, `rampage`, `attackCivilians`,
`plunderTraders`, `chaseTarget` in cpu/core/tactical.ts (twins in
gpu/core/sim_tactics.py). Shadow checks `.claude/scratchpad/ana/{plan,rampage,attack}.ts`
(bt2's worktree) read each family against AI_Tactical.csv / AI_Planning.csv.

- The reach holds the plots the unit attacks into: the planning's
  breadth-first search links a plot a unit of a player at war holds (or a
  hostile city centre, an Encampment) as a node whose step is priced as any
  step (0x26e920: a river's 2 above the Movement left waits for the next
  turn — runs/h1_duelv1121 t4, city-state 4's Warrior at 32:22 lists 32:23
  (1/1) and the barbarian Scout's 33:23 across the river from it (2/0),
  AI_Planning.csv) and then spends the Movement it leaves (the valid
  wrapper 0x26e570: the attack's cost adds the Movement left, 0x1d0 +=
  0x1d4) and links nothing from it (a parent with
  node flag +0x51 & 0x40 is refused). AI_Planning.csv lists them (1124 t9:
  the barbarian Warrior at 40:22 holds 39:23 (1/0), China's Warrior there);
  a Slinger's reach holds them too (combat > 0, the range aside). The
  wrapper's attack test: a district at war with hit points (DistrictInfo
  +0x58 / +0x5c) on the plot, else (search flag +0x398 & 0x200 clear) any
  unit on the plot (0x75c50) of a player at war that fights (0x209dd0:
  combat, ranged or bombard above 0) — no domain test, so a land melee
  unit's search strikes a ship on the water beside it and a ship's a land
  unit ashore (runs/h1_duelw1117 t73 / t74: China's Spearman's 25 on the
  barbarians' Quadrireme and Galley beside Longxi in the danger map). With them
  the planning rows of 1124 t1-60 the reach reproduces exactly went 705 ->
  758 of 1,241, the game's plots within ours 862 -> 1,192. The planning's
  reach (flags 0x115 | 0x800 | 0x100) holds no such strike off the mover's
  own ground, LAB (the domain test unread): AI_Planning.csv lists no ship's
  water for a land unit nor a land unit's plot for a ship (runs/h1_duelw1117
  t16: city-state 4's Warrior at 28:4 lists 27:4 (1/0), beside the
  barbarian Galley on 26:4, and not 26:4). The engines: `groundOf`'s
  `anyGround` / `_tac_attack_planes`' `any_ground`, the danger map's search
  alone striking on any ground (--aiscore --to 60, eight duels:
  barb.move.family 7900 -> 8019 of 8336, barb.move.plot 7345 -> 7446,
  cityState.move.plot 3203 -> 3231).
- THE ZONE OF CONTROL'S TEST (Rules_Movement 0x530f50, READ; through
  0x26f980(finder, from, to, the path's destination) from the path cost
  0x26e920, the move's step cost 0x270980 and the walk 0x26fe20 at
  0x270800, which stores the answer on the formation +0x518): the plot
  entered (the fifth argument: x, y, the formation's layer 0x2665b0 — 3
  the religious one) is in a zone where, first, the functor 0x52f710 over
  its ring (0x6aef0, range 1) finds one, else per direction (0..5) a
  neighbour holds a district of a player at war with the mover that
  exerts one (0x24c2f0) or a unit that is not the mover's player's, of a
  player at war (on the religious layer, of another religion +0x1ce4),
  alive (+0xcf0 below its hit points, +0x770 clear), of the mover's domain
  (+0x650 against the fourth argument, 0x266720), exerting (0x56d6c0: not
  embarked, +0x1410) and seen by the mover's player (0x5033a0: the plot's
  visibility count above 0, a stealth unit only its own team's). An
  exerter or district on the sixth argument — the path's destination —
  answers no zone at all unless the seventh (the plot's stacking count at
  its limit, 0x585eb0 against the player's +0x58c) is set: an attack's
  target never zones the plot the attack is made from. The path cost and
  the step cost then take max(cost, the Movement left) (0x26eb7c,
  0x270a2d) unless the path flags hold 0x800 (the planning's). THE LOG
  AGAINST IT: the moves keep their Movement on entering a zone —
  runs/h1_duelw1117 log t8, city-state 2's Warrior 196610 steps 13:10 ->
  12:11 beside the camp's Spearman ("Attack Target Move ... Arrive 12:11")
  and melee-attacks it in Operation Attack's fourth pass, which takes
  members with Movement left (0x56c690, +0xdb0 > 0); AI_Planning.csv t10
  lists the Warrior on 13:11, beside the camp, reaching 12:11 (1/1), one
  Movement left; 48 of the log's 161 melee attacks are made from two plots
  or more. How the cost's "spend everything" leaves the Movement is
  unread (the walk's deduction 0x265d80 of [rsp+0x60]). The engines: a
  walk halts on a plot of an enemy's zone with its Movement kept
  (`stepUnit`, `walk`; `_tac_zoc`'s halt, `_step_verb` no longer zeroes).
- THE PLANNING'S ZONE OF CONTROL (0x26e570 at 0x26e83e..0x26e8ae, READ;
  its exerters PARTLY READ): with the search's flag 0x200 clear (the
  planning's 0x115 | 0x800 | 0x100; the danger map's 0x311 sets it), a step
  whose parent is not the unit's own plot and lies in the unit's enemy zone
  of control (0x26f980 -> Rules_Movement 0x530f50, the mover's owner, its
  stacking count 0x585eb0) is refused unless it is an attack (r14b: a
  hostile city or Encampment at war, or a unit at war that fights, 0x209dd0,
  on the child). The cost's flag 0x800 skips the zone's "spend
  everything"; this test is the validity's own. The exerters the engines
  take (fit, 0x530f50 unread): hostile units that exert a zone, of the
  mover's domain, on plots the player sees now, none across a river; the
  mover's own ignoring (a naval raider, the cavalry but the chariot) as the
  zone's. runs/h1_duelw1124 t1-60 planning rows (the replay's classifier):
  855 -> 1,061 of 1,276 equal, the extra plots 609 -> 98, no new miss (65
  revealed, 30 unrevealed as before); the seen and domain filters each
  needed (all exerters 1,016 equal with 287 new misses; seen exerters of any
  domain 1,056 with 125, the Galleys'). t7: the Scout at 9:18 reaches 9:17
  beside city-state 2's Warrior at 10:16 and moves no further but onto it.
  The engines: `groundOf`'s seenZoc in `search` (no zone of control, not
  the danger map's) / `_tac_search`'s zs (`_tac_zoc` with seen and naval).
- THE PLANNING'S ATTACK PLOT (0x26e570 at 0x26e5cd, READ): no step leaves a
  node whose +0x51 bit 0x40 is set — 0x5861f0's out-flag on a seen plot,
  0x585fc0 -> 0x523520: a unit at war that fights stands there (0x5237e0
  the religious units' twin). An attack on a city centre or an Encampment
  with no such unit is no path's end: the reach goes on past it. The cities
  and Encampments exert the zone of control on the land beside them
  (Civ 6's rule; Rules_Movement 0x530f50 unread). runs/h1_duelw1124 t7-t52:
  city-state 4's city at 32:8 — the barbarian Scouts beside it list 31:7
  and 33:8 at 2/2 past it; with both, the planning rows of t1-60: 1,061 ->
  1,068 of 1,276 equal, the revealed misses 65 -> 1, the unrevealed 30 ->
  22, no new miss (27 new extra plots in 11 rows round major cities). The
  engines: `groundOf`'s foughtOn and seenZoc's town term / `_tac_search`'s
  fought_n and `_tac_zoc`'s town plane; the danger map's search and the
  paths keep an attack plot as their end.
- A plot the player never revealed is the reach's leaf (READ): the
  validity 0x2720a0 under the search's flag 1 (0x115) refuses a step whose
  parent is not revealed (node +0x51 bit 0) unless the parent is the unit's
  own plot (0x272618..0x272635), so such a plot is entered and listed but
  nothing leaves it: "C-95: Explore Land and the barbarians' revealed
  plots".
- THE TARGET LIST (0x783980): the plots in index order, a plot the player
  sees (the word plane +0x290 > 0) giving, by its district (0x810d0): the
  player's own a FRIENDLY_CITY; a player's at war (0x469cd0) a COMBAT_DISTRICT
  where the district defends (0x24c2f0: a City Center, an Encampment) — and
  then nothing else of the plot — and a PASSIVE_DISTRICT where its type
  counts toward the city's limit (0x527e30: Districts.RequiresPopulation; a
  Neighborhood, an Aqueduct none: 1124 t201, the Ironclads pass the
  Neighborhood at 17:15 for the Campus at 17:14), complete (+0xb08) and not
  pillaged (0x24c3a0); else its defender against the player (0x208b80) as
  LOW (an aircraft AIR_UNIT); else the first of a barbarian camp
  (CAMP), a goody hut, a Trader at war (one entry per Trader), the one
  civilian of the plot's civilian layer (CIVILIAN at war, else
  NEUTRAL_CIVILIAN; a fighter in that layer LOW), its religious unit
  (RELIGIOUS), an unpillaged improvement of a player at war (IMPROVEMENT, no
  owner in the entry). A plot only revealed gives its camp, goody hut,
  improvement and districts. The knowledge base's enemy units on plots not
  seen follow (LOW, CIVILIAN where the unit cannot fight): unported (AUDIT).
  Then 0x786d50: a LOW unit sharing its plot with one that cannot fight is
  MEDIUM; the barbarians' prioritization (0x786e70, the member at +0xa8 for
  a barbarian player 0x469ce0) makes HIGH every LOW or MEDIUM unit within
  BARBARIAN_DEFENSE_ALL_UNITS 4 of a CAMP of the list, a ranged one within
  its range + BARBARIAN_DEFENSE_RANGED_UNITS 1 (GlobalParameters +0xb0 /
  +0xb4). The type ids: f2e198 FRIENDLY_CITY, 19c COMBAT_DISTRICT, 1a0
  PASSIVE_DISTRICT, 1a4 NEUTRAL_CITY, 1a8 BARBARIAN_CAMP, 1ac
  NEUTRAL_CIVILIAN, 1b0 RELIGIOUS, 1b4 TRADER, 1b8 CIVILIAN, 1bc LOW, 1c0
  MEDIUM, 1c4 HIGH, 1c8 IMPROVEMENT (0x5bcb80's table, each global the id of
  the string loaded before it).
- THE PLANNING'S TARGETS (0x792f90): every target within its Movement x 2 +
  its range of the unit; the spots (0x790c60 on each link the search makes,
  at most 6): a unit target or a COMBAT_DISTRICT only — in melee the plot
  the target stands on reached (the spot its parent), at range a plot within
  range (LoS beyond 1, 0x58a6d0). Count > 0 = the unit can strike it within
  the planning's two turns.
- BARBARIAN RAMPAGE (0x778b40): the tribes whose camp a unit took (0x152df0:
  tribe +0x18 clear, +0x1c the taker's player, written by the camp's removal
  0x154830); each of their units, in pool order, takes of the planning's
  targets of that player the nearest with a spot, else the nearest (strictly
  nearer replaces; the list's first of equals), and strikes it (0x771670: a
  civilian, Trader or religious unit it moves onto; a ranged unit at a
  fighter or COMBAT_DISTRICT strikes, first moving to the first plot of its
  reach of this turn with Movement left within range and none of its own
  stacking; else MOVE_TO the target's plot with the attack flag 0x10). With
  no target (0x1479e0): of the cities its raid (+0x48) then its assault
  (+0x60) wait for that the player holds, the nearest its camp within 16,
  else the player's nearest within 16 (0x93d570); it moves to the first plot
  of its reach of this turn within its range (1 at least) of the city with
  none of its own stacking (0x775c60) and logs no row. Shadow check over
  1124: of 446 rows the logged target is in the list for 423 (the rest the
  knowledge base's), the pick matches 415 of them; the replay's end plots
  (5 seeds) 1,583 -> 2,282 of 2,616 (below).
- ATTACK CIVILIANS (0x779240): each CIVILIAN target, the units whose
  planning holds its plot within two turns (0x775340: pool order, a strength
  to fight with, a DEFENDER held until another unit goes in; the sort
  0x76f210 is on +8, -1 for all — stable), go for it in order (0x773270):
  each that can act (0x56c690) takes the move order onto it (0x962190, flag
  0x10), a unit with no ranged or bombard strength then done (0x56d6f0,
  0x570b40, 0x77d180); the civilian taken ends the target; then each ranged
  one within range strikes it (0x964a40).
- PLUNDER TRADER (0x77aa20): each TRADER target, the units whose planning
  holds its plot this turn (0x775340, 1 turn) go for it (0x7746a0): each that
  can act moves onto it (0x773fb0, its Movement kept) and plunders
  (PLUNDER_TRADE_ROUTE 0x955950), its turn done, until one stands on it.
- CHASE TARGET (0x775670 then 0x773030): each land unit (+0x650 == 2) left,
  in pool order, takes (0x775170, 8) the LOW target standing on its plot,
  else the LAST of the list within 8 whose plot its planning holds within two
  turns, and moves to the first plot of its reach of this turn within its
  range (1 at least) of the target with none of its own stacking (0x775c60);
  the row's "Move To" is the target's plot.
- ATTACK UNITS (0x7784b0): `attackUnits` / `_tac_attack_units`, below.
- MOVE TO SAFETY (0x77a4b0) and the influence map (0x717460): below
  ("C-95: the danger map and Move to Safety").

## C-95: the planning's spots and the combat prediction — READ, ported

`planUnit` / `predictBlow` in cpu/core/tactical.ts, `_tac_plan` / `_tac_predict` in gpu/core/sim_tactics.py.

- THE TARGETS (0x792f90): the list's unit targets and COMBAT_DISTRICTs
  within 2 x the unit's Movement + its range (0x56e3d0) of it, in list order.
- THE SPOTS (the cost callback 0x26d6f0 -> 0x790c60 on every link the
  planning's two-turn search prices, the start node linked from itself):
  melee — the plot an attack on the target's plot is linked from (the
  attack's turn), a plot beside the target no other player's unit holds that
  the step ends on with no Movement (the next turn) or that is the unit's own
  plot (this turn); ranged (+0x19f8 the range) — any linked plot within the
  range (in sight beyond 1, 0x5cf2b0), its turn the step's, the next where
  it ends with no Movement; a civilian's plot taken from the plot it is
  linked from; a land unit's spot (and a melee one's target) never water; six
  spots a target at most, a plot once (the first link wins).
- THE PREDICTION (0x791470): the damage law under the simulation flag takes
  the roll at COMBAT_MAX_EXTRA_DAMAGE / 2 (`damageExpected`), the two
  strengths the blow resolves on (`meleeUnitStrengths`,
  `rangedUnitStrengths`: the engine's own terms, from the plot the attacker
  stands on); a ranged blow and one on an embarked defender take none; a
  civilian taken counts 150 dealt. Per spot of a fighter target the target's
  blow back on the unit standing there (+0x94 / +0xac). A blow that kills
  (dealt above the target's health) marks the planning (+0x60, `wins`).
- MEASURED (the action replay, 5 seeds): the barbarians' "Attack Units" rows
  end on the game's plot 70 of 126 (43 with the stand-in); on 1124 206 of
  330 rows take the logged move and attack. The rest: the replay's state
  (city-state units the record places after the move), spot order among
  equal turns.

## C-95: Attack Units — READ, ported

`strikers`, `assignAttacks`, `carryOut`, `attackUnits` in cpu/core/tactical.ts; `_tac_attack_units`, `_tac_assign`, `_tac_merge_sort`, `_tac_carry_out` in gpu/core/sim_tactics.py.

- THE UNIT SELECTOR (0x7710f0): a unit of AI type EXPLORE or above; an
  explorer (PSEUDOYIELD_UNIT_EXPLORER: the Scout) only while its tribe
  rampages; the rest go to the homeland.
- THE STRIKERS (0x775340): per target of the move's type (LOW also takes
  RELIGIOUS at war), in pool order, each unit whose planning holds the
  target's plot within two turns — melee; a ranged unit a plot exactly its
  range from the target within two turns with Movement left and none of its
  own stacking there unless its own plot (0x78fa10); a DEFENDER only on its
  own plot. The targets of the type within 5 of it (0x76eb50).
- THE ASSIGNMENT'S FILTERS (0x776140 at 0x776780..0x7767fa, READ): per
  spot i of a claim, unless the target is HIGH or the unit info's +0x1ba
  bit 0x20 (UseMaxMeleeTrainedStrength) is set: with the fifth argument,
  dropped where taken + back taken (+0x7c, +0x94) tops dealt + back dealt
  (+0x64, +0xac); with the sixth (Operation Attack Units passes it always,
  0x80d63a), dropped where taken + back taken tops the unit's health
  (0x56e0d0 less +0xcf0). THE PREDICTION'S KILL (0x791470 at 0x79174a):
  per spot dealt = the larger of the simulation's two results ([rbp-0xc],
  [rbp-8]; 150 a civilian), its kill byte (+0xc4) dealt >= the target's
  health, the planning's `wins` (+0x60) dealt > it; the blow back per spot
  re-simulated (0x205720 with the combat's sides swapped through 0x213e00,
  the location the spot) into +0x94 / +0xac. MOVE TO SAFETY's test
  (0x77a4b0): a unit with damage, less than half lost, holds; half or more
  flees unless `wins`. THE SIMULATION'S INPUTS (READ): the combat object
  (0x213ab0) takes its two sides through 0x213e00(combat, side, unit) —
  the unit, its owner and id (+0x2e0, +0x100) and its location, the plot it
  stands on now (+0x220 / +0x224, at +0x90 + side x 0x48) — and the combat's
  plot at +0x48: the forward blow the target's entry plot, the blow back
  each spot in turn, the sides swapped (the target from combat +8 the
  attacker, the unit the defender, still on its own plot). 0x205720(combat,
  1, 1) resolves it by the combat's kind (0x206f40 the melee one) on the
  units as they stand — their damage, promotions and fortification
  untouched by the forward result. So the blow back reads the unit's own
  fortification (runs/h1_duelw1117 t9: city-state 2's Warrior 131073 at 60
  health, fortified 2 on 14:10 at the turn's start: 30 taken + 26 back, the
  spot kept, the attack logged and fought, CombatLog t9). The replay's
  minors' copy reads each unit's turn-start fortification from the first
  record (`fortWas`). Unresolved: t10, the Warrior at 8 health on 13:11
  beside the camp's Warrior at 27 on Floodplains (13:12, -2): ours deals 30
  (10.82 against 10.73), `wins`, and holds; the game flees ("Move to
  safety, Current Danger: 20"); record t10 holds neither fortified.
- THE ASSIGNMENT (0x776140): a target's health floor(100 x 281 / 256) less
  its damage (1.1 in 24.8); for MEDIUM / LOW a spot whose received (taken +
  back taken) tops the dealt (dealt + back dealt), or the unit's health, is
  dropped; a unit that moved with turns 1 only its own plot; the stacking
  block (0x776890..0x776909: a unit on the spot not the target, of the
  mover's formation class, blocks unless it is the player's, in the mover's
  job — unit +0x7d0, the pass's, an operation's — with Movement left
  +0xdb0: a unit raised this turn, in no job, blocks; runs/h1_duelw1124 t11,
  the camp at 40:21's new Slinger on 41:22 keeps the Warrior at 41:21 off
  its spot there); claims in target, unit, spot order (the outer loop 0x776244..0x7766f3 walks the targets, 0x28 each, the inner the units). ONE pass of the Generalized
  Assignment (0x8b5bf0): the gain λ 0x7702b0 (dealt / turns, a kill +100,
  an overkill (health - damage) + 100, a barbarian target x 0.8, less what
  the unit holds assigned; early out where the unit already claims the
  target), the knapsack 0x61ddb0 at capacity 1 (the first largest positive),
  the move λ 0x770710. The results sorted by 0x7704e0 through EASTL's merge
  sort (halves n / 2).
- THE EXECUTION (0x771f80): the moves, the bombard strikes, the ranged
  strikes (unless a melee one is stronger and reaches this turn), the
  move-and-attack onto the attack plot; turns end. THE MOVES (READ,
  0x771ff0..0x77219b): per entry (stride 0x38) valid (+0x2c >= 0) whose unit
  lives (+0x770 clear) and stands off its spot: UNITOPERATION_SWAP_UNITS to
  the spot (0x972880, hash 0x7fa205d1, pushed through the unit's operation
  queue +0x60); still off it: nothing where a unit at war holds the spot
  (0x5862e0) or one of its own stacking with it (0x585eb0 on its path
  finder, itself not counted), else UNITOPERATION_MOVE_TO (0x962030, hash
  0x580f2f68). The swap's own rule (CanStart) is unread: the engines take it
  as the unit beside the spot stepping there and the other taking its plot
  (`swapUnits` / `_tac_carry_out`). runs/h1_duelw1121 t15: the Horse
  Archer 983054 on 34:11 holds the Horseman 720906's spot, which stays on
  31:9 as recorded, and the Horse Archer 1048591 ends on 34:10 as recorded.
  Measured on top of UpdateParents: barb.move.plot 7329 -> 7345 of 8324,
  cityState.move.plot 3139 -> 3136.
- THE GPU TWIN predicts a pass's blows as a batch of their own
  (`_GameRows`: each job a game, the per-game planes taken by rows), the
  strength routines unchanged.

## C-95: the danger map and Move to Safety — READ, ported

`dangerPlane`, `flees`, `safePlot`, `moveToSafety`, `homelandSafety` in cpu/core/tactical.ts; `_danger_plane`, `_tac_flees`, `_tac_safe_plot`, `_tac_move_to_safety` in gpu/core/sim_tactics.py. The barbarians' lists take Move to Safety after Attack Medium Priority and in their homeland; the city-states' after Attack High Priority and in their homeland; the Free Cities' after Attack Medium Priority.

- THE DANGER MAP (0x717460, a plot read by 0x716a90): per player at war
  with the player (0x469cd0), each unit it sees (0x5033a0) not dead (+0x770)
  with a combat, ranged or bombard strength; its danger (0x716400): a unit
  with a bombard strength the larger of combat and bombard less
  COMBAT_BOMBARD_VS_UNIT_STRENGTH_MODIFIER (+0x188), any other the larger of
  combat and ranged (a religious unit's religious strength onto the
  religious map). Its plots: the one-turn breadth-first search (0x7921e0 ->
  0x26df90, flags 0x311) from where it stands, every plot it closes; a
  SECOND list — every plot within its range (0x1e000 over dx, dy) of those
  outside them, then, a unit with +0x18bd (CanRaid: the field Coastal Raid
  0x7794b0 and the pillage checks read — ABILITY_COASTAL_RAID's
  MODIFIER_UNIT_ADJUST_RAIDING), the land plots beside them (the ring
  0x6b0a0 radius 1, lambda 0x715f40: water skipped, deduped within the second
  list alone, so a reached plot beside another takes the danger twice). The
  danger is added once per list entry (two loops at 0x71690c / 0x7169a1). An
  air unit (+0x650 == 1): the plots within its range. Each DISTRICT of such
  a player (the player's +0x1308 -> +0xd8, its district list: every district
  placed, built or not — the recordings' city district lists hold districts
  under construction — and each wonder's DISTRICT_WONDER plot, 1,948 entries
  on 1117) whose plot the player sees ([player +0x290] > 0): its defence
  (0x24ae80) >> 8 on its plot; its strike (0x249ee0) >> 8 over its strike's
  reach (0x249e40) less its plot, else 1 on each plot beside it (0x6b1b0 ->
  0x691f0, the ring at distance 1, lambda 0x715ff0). A district's defence
  base (0x24a000) is 0 unless its DistrictInfo has hit points (+0x58 set,
  +0x5c > 0: the City Center, the Encampment); its strike is 0 unless
  0x24b960 holds (its outer damage +0x8d8 below its outer maximum,
  GetMaxDamage 0x5e97d629). So every other district — a Campus, a Harbor, a
  wonder — puts 1 on the six plots round it. Then the player's own
  districts: one with a defence its plot 0; each plot of its strike's reach
  with danger down by the strike, to 1 at least. Features' DangerValue
  (+0x2c) last: FEATURE_BURNING_FOREST / FEATURE_BURNING_JUNGLE 80 and the
  Bermuda Triangle 10 (DLC GranColombia_Maya), no other. The map is built
  at the player's DoTurn (0x4e4560 -> 0x46cdd0 at 0x4e4aa4); the engines
  build it as each tactical pass opens, the hostile units' searches on their
  full Movement; an Encampment's strike its city's. A district's defence
  with the garrison flag 0 (the danger map's call): the base (0x24a000) and
  0x24a180's terms, its garrison first — the best defender on the
  district's own plot (0x208b80, flags 0x10): its Combat (0x56dc90) << 8
  less the wounded loss (0x522630 on its damage percent and its +0x1868
  reduction), less the base, where positive — then the walls and the
  rest the centre reads. The engines: an Encampment at its city's standing
  strength without the centre's garrison plus its own plot's garrison term
  (`districtGarrisonedStrength`, `_garrison_cs(plot=)`).
- A SHIP'S STRIKE ONTO LAND, a LAB fit (the flag of 0x26df90 that bars it
  under 0x311 unread): the danger search's reach holds no land plot of a
  naval unit; the land a ship threatens is its range over its water plots.
  runs/h1_duelv1128, the city-states' "Move to safety ... Current Danger"
  rows: t45 city-state 3's Warrior at 3:4 logs 25 beside a barbarian Galley
  (30, its strike onto the Warrior's plot) and a Quadrireme (25, range 1);
  t80 its Swordsman 50 beside a Galley and two Quadriremes; t109 its
  Man-at-Arms 50 likewise. With the rule the rows equal 10 -> 12 of 14
  (1117 unchanged); the ZOC read as a move order's (flags without 0x800)
  equals the same rows but takes 2-3 barbarian moves off on 1128 / 1117, so
  the search keeps the planning's ZOC-free walk. Ported (`dangerPlane`,
  `_danger_plane`).
- runs/h1_duelv1128 t20, city-state 4's Operation Protect Units (the hurt
  Warrior at 31:7, Attack Barb Camp): the game sends it to 33:8, ours to
  31:9. The reach order is the game's (AI_Planning.csv t20: 31:7, 31:8,
  32:7, 32:8, 32:6, 31:6, 30:7, 31:9, 30:8, 33:8 ..., 31:9 and 33:8 both
  turn 1 with no Movement left), so 0x716b90 takes 31:9 unless the game's
  danger there is above 0. No unit the city-state sees reaches 31:9; the
  barbarians' Scout at 29:8 (unseen: three plots from the Warrior, its
  sight 2) reaches 31:9 and not 33:8, and with every hostile unit counted
  the pick is the game's — but the city-states' Move to safety rows then
  fall 10 -> 5 of 14, and with the units the city-state saw the turn before
  7 of 14. The danger loop's visibility test (0x5033a0: the player's
  visibility count +0x290 at the unit's plot) reads as "seen now"; what
  makes 31:9 a plot of danger is unread.
- LAB: the danger map's search (0x26df90, flags 0x311, no +4: the path
  validity's stacking test on) strikes from a plot the unit may stand on —
  its own, or one none of its own stacking units holds — read as the
  stacking turn-end test on the plot an attack leaves from.
  runs/h1_duelw1117 t38: China's Scout at 34:12 reaches the barbarian
  Warrior at 32:13 only through 33:13 and Xi'an's centre 33:12, each held
  by a Chinese Warrior, and its 10 is not in the game's 42 (the two
  Warriors' 20 each, the city's rings); 36 of 36 barbarian danger rows of
  1117 equal with it (`search`'s standToAttack, `_tac_search`'s stand).
- MOVE TO SAFETY (0x77a4b0): each unit left (+0x530, +0x770 clear) on a plot
  of danger above 0 is listed ("Move to safety ... Current Danger") when it
  has no strength, or is embarked (0x8be30, IsEmbarked); hurt (+0xcf0 > 0): a
  barbarian's (0x56ee80 -> 0x469ce0) at sea (+0x650 == 0) always, else when
  2 x its damage reaches its health (0x56e0d0) and its planning (+0x1fc0)
  holds no blow that kills (+0x60; none without a planning); whole: a
  barbarian never, any other where the danger tops the larger of its combat
  and ranged strengths + 20. Then (0x774190) each listed unit in order takes
  its safe plot, the plots the ones before took left out, and moves there
  (0x773fb0, its turn done); with none it stays for the moves after.
- THE HOMELAND'S (0x70f3b0, each unit 0x70bf90): the same test with a
  quarter of its health (4 x damage) for the hurt, the danger above
  `unitDanger` + 15 for a whole unit not a barbarian; each fleeing unit in
  turn takes its safe plot (0x962030, "Move To") or, a barbarian with none,
  fortifies (0x95eae0, "Fortify in place").
- THE SAFE PLOT (0x716b90): over the planning reach's plots of this turn
  (+0x8 <= 1), none taken already, none with fallout (0x2d2100, HasFallout,
  on the plot index), none (0x585eb0) with a unit of its own stacking with
  it (itself counted), none with a unit at war (0x5861f0). A FORT (r12b):
  the plot's owner (+0x1c) is the unit's owner (+0x2e0) and its district
  (0x810d0) has DistrictInfo +0x58 set — the HitPoints column (0xabfc20,
  Districts column 0x16; the install: CITY_CENTER 200, ENCAMPMENT 100,
  IKANDA 100). Against the best so far, the first taken — a fort over any
  but a fort, of two forts the lower danger (equal keeps); then of no danger
  over one of danger while the best is no fort; of two of no danger the
  player's own territory, else less Movement left (+0xc); of two of danger
  (or the best a fort) on its own territory: a fort or plot of no danger
  kept, its own over another's, the lower danger, then less Movement left;
  off it the lower danger, then the farther (0x1deb0) from the unit. A unit
  with no combat strength (0x56dc90(1) == 0) skips a water plot (0x834d0:
  terrain 15/16) of danger while the best is ashore (the planning's +0x738
  == 1: a land unit). A unit of religious strength (+0x1ce8 > 0) adds the
  religious map (0x716b10) to the danger: no party on the tactical core
  holds one. A goal plot argument (0x497d20 valid) puts the nearer to it
  first off its own territory: both callers pass none.
- MEASURED: the replay's barbarian "Current Danger" rows (the map as the
  barbarians' turn opens on the copy), 1117: 30 of 35 equal with the
  districts (17 with the cities alone: the +1 misses were the rings of the
  Harbor, Campus and other districts beside the plot). Of the five left,
  t73 / t74 were China's Spearman the replay had not made (its strike on the
  ships beside it) and t108 its Trebuchet. t107: the city-state's Trebuchet
  stands embarked (record t107 and t108), so its combat strength is its
  owner's era's embarked one (0x56dc90(unit, 0): IsEmbarked, a land combat
  unit, +0x18c3 clear, +0x21e0 -1 — Eras' value), 30 over its bombard less
  17 (28); ported. The map is the last step of the player's DoTurn
  (0x4e4560 -> 0x46cdd0 at 0x4e4aa4, a tail jump to 0x717460), and the
  barbarians' DoTurn follows every other player's actions (the players one
  at a time, tools/civ6lab/turn_order_civ6.md), so the other players' units
  stand where their own turns left them: on 1117 the copy's map with them
  there equals 34 of 35 rows, with them where record t (the turn's start)
  holds them 16 of 35 (t12, t22, t23, t26 ... t108 all off). t109 (+35):
  China's Trebuchet at (35,12), where its turn left it, on Chichen Itza's
  plot (placed t84, in progress): the wonder keeps its Rainforest
  (Building_RequiredFeatures; every record from t84 holds FEATURE_JUNGLE
  there, where the Oracle t61 and the Hanging Gardens t75 took theirs off),
  so the plot stands 2 high (Hills + Rainforest) and the Man-at-Arms at
  (35,14) sees it over the 1-high plots between; the engines' `paveGround`
  had taken the Rainforest off, the plot stood 1 high and hid the Trebuchet;
  a wonder now keeps its required feature. New on 2a1caa0c: t58 the Quadrireme beside Longxi
  reads 46, the game 26 — China's Warrior fortified (record fortify 2) on
  the centre counts its 20 in the copy and nothing in the game (the unit
  walk skips +0x770; fortified as a skip is unread). End plots: "HL: Move To Safety" 183 of 371 (60 with
  the stand-in), "Move to safety" 29 of 60 (0).
- THE AI'S COMBAT STRENGTH (0x56dc90(unit, flag); `aiStrengths` /
  `_ai_combat`): the row's Combat (+0xa0 +0x48; a row with +0x1ba bit 0x20
  raised to its player's best trained melee, PlayerStats +0xf0); with the
  flag 0, an embarked unit (0x8be30) not fighting embarked (+0x18c3 clear),
  of formation class neither 1 (SUPPORT) nor 2 (CIVILIAN) — GetFormationClass
  0x8bcd0: LAND_COMBAT 0, SUPPORT 1, CIVILIAN 2, NAVAL 3, AIR 4 — and +0x21e0
  -1 takes its owner's era's (0x467eb0) embarked strength (the Eras row
  +0x20) in its place; then +0x18a8 where positive, the formation's
  strength (+0xc90 1 corps, 2 army), 0x56df30. GetRangedCombat 0x56e3e0 and
  GetBombardCombat 0x56daa0 have no embarked test. Of the AI's callers only
  the safe plot's no-strength test (0x716e8b) passes 1 (the row's own); every
  other passes 0: the danger map (0x7164b9..0x716502), the homeland's safety
  (0x70f4a5..0x70f59a), Move to Safety (0x77a5fb..), the assignment carried
  out's melee-over-ranged test (0x772437), Attack Strikers (0x7753fa), the
  planning's fights flag (0x793453), the team updates (0x738f20 — the
  endangered — and 0x73fba0, the members' strength), Operation Defend Units
  (0x80dcc5), Garrison City (0x810e3e..0x810f13), Operation Move (0x817847),
  the standing army and its weakest (0x5ca7e0, 0x5c4910) and
  m_iMilitaryStrength (0x4bb1e0).

## C-95: Explore Land and the barbarians' revealed plots — READ, ported (two tests below unread)

`exploreLand`, `exploreTarget`, `exploreOk` in cpu/core/tactical.ts; `_tac_explore`, `_tac_explore_ok`, `_tac_explore_region` in gpu/core/sim_tactics.py; the revealed plots in cpu/core/fog.ts `revealAround` / gpu `_barb_reveal` (`barb_explored`).

- THE REVEALED PLOTS (the player's +0x2f0, read by 0x154c0): the
  barbarians' units' looks (each step's, a new unit's: a new camp's defender
  and scouts look from their plots). In the planning's breadth-first lists
  (`groundOf`'s known for a search without zones of control) a plot not
  revealed is entered and never left (0x2720a0, flag 1: the parent
  unrevealed and not the unit's plot refuses the step), its step costing +3
  where a revealed plot's costs +2 and no +3 off the territory (0x270dd0);
  a path (the move order's pathfinder) reads every plot as revealed. A plot
  only revealed gives the target list its districts, camp, goody hut,
  improvement.
- THE WRITERS (READ): the reveal 0x50d390 is reached from the visibility
  count change 0x508d50 alone for a barbarian (0x508330 is the diplomatic
  sharing, 0x50ccc0 the war / peace one, 0x50d080 RevealAllPlots and the
  Free Cities' start). 0x508d50's callers: a unit's sight update (0x58aa90
  per plot of 0x58b1d0's line-of-sight list, from 0x58f3f0 on a move,
  0x586d40), a plot's owner (0x84760, territory: none for the barbarians),
  an improvement's owner (0x84340 from the placement 0x363080 -> 0x362ec0:
  the plot and the six beside it, no line of sight), the scripted
  operations. A camp's placement (0x150a30) passes the barbarian player as
  the improvement's owner, so a camp gives its plot and ring 1 to the
  barbarians' sight as long as it stands (ported: `plotsSeenNow` /
  `_barb_seen`, `CAMP_SIGHT`). Nothing in the camp's arrival reveals more:
  the plots the game lists three round a new camp are the unrevealed
  leaves past its units' looks. Case (runs/h1_duelw1124, planning rows
  t1-60, inside the replay): of the 123 plots the game listed that the
  barbarians had not revealed, every one lies beside a revealed plot and
  none within two of a recorded barbarian look (plot or step) on 9 of the
  10 traced; with the leaf rule and no camp reveal 23 remain, the rows
  reproduced exactly 792 -> 822 of 1,276 (radius 1, 2 or none the same).
- EXPLORE LAND (0x70ce90): up to three rounds over the homeland's units;
  each unit not done (+0x770) with Movement left (+0xdb0), of AI type
  EXPLORE (+0x1c0 == 2), its damage at most half its health (0x56e0d0 >>
  1), in a later round not still on its way (0x26f830), takes HL Explore
  (0x70aa40, the region fallbacks on the first round alone) and its target
  joins the chosen list; the round's move orders (0x962030) are carried out
  together as it ends (0x70a440); another round only where one moved.
- HL EXPLORE (0x70aa40): the unit's breadth-first search of one turn
  (0x7921e0 -> 0x26df90, flags 0x40 / 0x42) on its Movement left; per plot
  closed, in order: no danger (0x716a90), not chosen, one it may go to
  (0x70bd40: not its own plot; revealed; another player's ground only at war
  with it; +0x4c not above 0, taken as no unit on it; its own area unless it
  embarks (0x56c480), a hull on water; no city centre but its player's);
  its two counts over its sight (0x58b1d0, the plots within the unit's sight
  +0x1998 seen from the plot): those the player never revealed (0x70a6c0)
  and those not visible now (0x70a8b0, [player +0x290] <= 0). The first plot
  of the largest first count above 0 wins ("HL: Explore"). Else, on the
  first round: the unit's region (plot +0x18) where the player's region
  record holds less than all of it revealed (0x7861d0: +0x28 / +0x24 < 1.0)
  — the nearest unrevealed plot of the region (0x70b6f0: plots in index
  order, strictly nearer replaces, +0x4c clear, enterable 0x586360), with a
  path to it (0x272a60), not chosen ("HL: Explore cur region"); a unit off
  any region the nearest of its area (0x70b550, "cur area"); then the
  player's primary, secondary and tertiary region lists (+0x1290 +0x2f0 /
  +0x360 / +0x3d0, the same search: "primary / secondary / tertiary
  regions"); else the first plot of the largest second count ("HL: Explore
  fallback"). The unit's plot joins the chosen.
- THE REGION LISTS (+0x1290: the double-buffered lists +0x298 -> +0x2f0,
  +0x308 -> +0x360, +0x378 -> +0x3d0). The primary: the region of a city's
  plot and, where that plot has a region (plot +0x18 set), the region of
  each of its city plots 0..36 (0x700630 from the city analysis 0x5cdd70:
  the count 0x5cbc0(2) + 18 = 37, f(0) = 1, f(n) = f(n-1) + 6n; each plot
  through 0x5d1e0 -> 0x5d000, off the map or off any region skipped, one
  equal to the centre's skipped; each added through 0x6fa5e0) — every
  region within three of the centre (runs/h1_duelv1128 t5 / t10-12
  Bologna: its two Warriors on region 0, its centre on region 4, Regional
  Strength 40 as AI_Military.csv logs, the Combat Desire 0.0, its UNITS
  table as logged; `cityRegions` / `_city_regions`), the secondary the regions across those regions'
  chokepoints (0x6fe240 / 0x6febc0) not already primary — a player with no
  city holds neither. The tertiary: the tactical target list (0x783980)
  gathers into a set every region of a plot its player sees (+0x290 count
  above 0, 0x783d5c) or revealed (+0x2f0, 0x7852db), plots off any region
  left out, and stores it (0x6fad50, ascending) after its plot walk. The
  search over a list (0x70b6f0): the plots in index order whose region the
  list holds, never revealed, +0x4c clear, enterable, strictly nearer
  replacing; then not chosen and a path to it (0x272a60), else the next
  list. The engines: `seenRegions` (`Pass.regions`) / `_tac_seen_regions`,
  the barbarians' lists the tertiary alone ("HL: Explore tertiary regions"):
  the "HL: Explore" rows of the 5-seed replay end on the game's plot 419 ->
  490 of 1,056; barb:move imposed 1117 418 -> 404, 1121 1,096 -> 1,070,
  1124 1,043 -> 1,018.
- THE ROUTE FLAG (0x70a6c0, READ): over the look, a plot not revealed
  counts; a revealed one whose route byte (+0x47) is not -1 sets the second
  flag (a goody hut on the revealed plot itself sets the first and counts
  nothing; the first wins at once for a full civilization alone). In HL
  Explore (0x70abe6..0x70ac15) the first plot in closing order with the
  route flag and a count above 0 takes the lead once, whatever led before;
  after it, as before it, a plot leads only with a strictly larger count.
  Ported (`exploreTarget`, `_tac_explore`).
- PARTLY READ: the turn test on
  a plot of a player at war (0x70bd40: the game turn below the regions
  record's +0x128; taken as passing); a goody hut's plot taken at once by a
  full civilization (0x82d90: no barbarian).
- MEASURED (the action replay, 5 seeds): the barbarians' "HL: Explore" rows
  end on the game's plot 407 of 1,056 (128 with the stand-in); barb:move
  applied 13,702 against 12,592 on the base engine.

## C-95: the barbarians' raid — READ ("Raid City"'s nodes), ported on the operation manager (the Defend Units' moves and the rally below unread)

The trees on the one operation manager (cpu/core/operations: `startOperationAt`,
`operationsRefresh`, `tickOperation`; the barbarians' nodes
cpu/core/operations/barbarian.ts) through cpu/core/barbarianOps.ts
(`barbOpStart`, `barbarianOpsTurn`, `barbarianTrees`, the hooks `hooksOf`);
Operation Move `passMoveUpdate` / `passMoveExec` (cpu/core/tactical.ts). The
GPU twin gpu/core/sim_barbops.py (`_barb_start_op`, `_barb_ops_refresh`,
`_barb_trees`, `_bop_raid_tick`, `_bop_move_update`, `_bop_move_exec`,
`_bop_attack_units`, `_bop_pillage`); the score `barbPillageScore`
(cpu/core/barbarians.ts) / `_barb_pillage_score` (gpu/core/sim_orders.py).

- THE TURN (0x6096c0, the player AI's jobs): a first list — the unit
  evaluator 0x5c2650, the barbarian manager's turn 0x1514a0 (barbarians
  only), the planning 0x791b20, the target list 0x785f30, ..., the operation
  manager 0x722690 (0x727510: each operation's tree ticks) — then a second
  — 0x785ec0, the tactical pass 0x771530 — then the homeland 0x70a370. The
  operations' trees tick after the tribes' turn and before the tactical
  pass, on the plannings and the target list the pass then reads; an
  operation's units leave the pass. The military AI's part (each running
  operation logged and its team refreshed) follows the tribes' turn:
  AI_Operation.csv prints a tribe's start before the running operations'
  lines and the new one's "running" line the same turn (runs/h1_duelw1110
  log t42, 1128 t32, 1105 t31: "Barbarian City Assault, Started" first).
  THE TREE POOL (the manager +0x3a0, READ): 0x7ff7b0 makes a tree in the
  pool by 0x7fef20 — the slot its free list's head (+0x2c, each entry's +8
  the next) names, else a new block's (0x7ff430); the id (+0x28 +=
  0x10000) | slot; the used list (head +0x38, tail +0x40, each entry's +8
  / +0x10 its neighbours) kept in slot order (the next used slot after the
  new one found, the entry linked before it, else at the tail). The tick
  0x7ffdd0 walks the used list from its head by +0x10, ticking each
  (0x7d3a00), then its destroy loop (0x7cb2e0) frees each ended tree's
  slot to the free list's head. So a tree started in the walk ticks in it
  only where its slot lies past the one ticking: runs/h1_duelw1105 log t12,
  tribe 4's scout's tree (slot 1) starts the raid on 12:14 in slot 0 (tribe
  0's scout's, freed at t9): the raid first recruits at t13 and its
  Warriors come at t14, t15, t16 (Barbarians_Units.csv), where 1124 t8's
  raid in a new slot recruits at once. The engines: the military AI's part
  after the tribes' turn (`barbarianOpsTurn` / `_barb_ops_refresh`); the
  trees' pool (`newBarbTreeId` / `_bop_next_id`, `freeEndedTrees` /
  `_bop_free_ended`), every tree of the barbarian player — its operations',
  its captures' and its scouts' — ticking in slot order in the tactical pass
  (`barbarianTrees` / `_barb_trees`); the trees' units leave the pass's
  later moves.
- THE NODES' HANDLERS (the dispatcher 0x7cbca0 storing each type's
  functions under the id the registration 0x7db850 gives it, the k-th id
  stored the k-th name, @d5b198 one unnamed): Operation Move update 0x81a130
  / execution 0x816cb0; Operation Attack Units 0x80ecf0 / 0x80ceb0;
  Operation Defend Units 0x80ee70 / 0x80d790; Operation Pillage 0x8134a0 /
  0x811390; Operation Siege City 0x8136a0 / 0x811e80; Operation Attack City
  0x813250 / 0x8109e0; Barbarian Raid Check 0x7c7330; Barbarian Recruit
  0x7c7580; Barbarian Spawn Change 0x7c7b70 / 0x7c6e50; Notify Owner
  0x7c6fa0; In Difficulty Range 0x7f1d70; Make Formation 0x7efd70 /
  0x7ee630; Protect Unit 0x7f07c0 / 0x7ef0e0; Move Unit 0x7f0020 / 0x7eeba0;
  Operation Change Target 0x8196d0 / 0x8163a0; Operation Is Ready 0x81a090.
- "RAID CITY" under the interpreter (0x7d3a00): the root Sequence resumes at
  the child that RAN — the recruit (2: Spawn Change, the Turn Limiter over
  Barbarian Recruit), the march (Concurrent 9: Attack Units 10, Operation
  Move 11 to the target, range 2, unit distance 0), the raid (Priority 12:
  Barbarian Raid Check 13, else the Turn Limiter 14 — 10 turns, Limit Is Min,
  Fail at Limit false — over Concurrent 15: Attack Units 16, Operation
  Pillage 17, In Difficulty Range 18 over Operation Attack City 19,
  Operation Defend Units 20, Operation Move 21 to the target, range 3), the
  way home (Concurrent 22: Attack Units 23, Operation Move 24 to the rally,
  range 1, unit distance 4), Notify Owner 25. A child that SUCCEEDS hands on
  in the same tick (the recruit's last turn marches; a march arrived raids);
  every node of the walk that SUCCEEDED or RUNS executes after it, in node
  order. A Concurrent's FAILURE skips its later children. The Turn Limiter
  (Limit Is Min): RUNNING while its turns since it first ran are at most 10,
  then SUCCESS once its child RUNS past 10 x the speed's percent.
- OPERATION ATTACK UNITS. Update: the target gone (0x73a8e0: no city on its
  plot) SUCCESS, else SUCCESS (RUNNING under Always Running); FAILURE where
  a team is in battle (+0x90, the team update's battle points 0x738f20) and
  the operation holds no unit — a team in battle has a member, so never in
  a turn. Execution (0x80ceb0): none for a team neither in battle nor
  joined by a unit (+0x58: the count of the units added to the team, 0x737f90
  pushing each to the members +0x18 and to the list +0x48; the engines'
  `OpTeam.joined` / the members a tribe's operation holds); per team its
  members, in the members' list's order (the assignment's units in that
  order: runs/h1_duelw1117 t4, city-state 2's Attack Barb Camp's Warrior
  196610, recruited first, claims 12:11 and 131073 13:11, as logged;
  `passAttack` / `_tac_team_order`), alive, not done, able
  to act (0x56c690), on land (+0x738 == 1), a bombard unit only against a
  city of another player or as a DEFENDER (+0x1c0 == 4); the targets: the
  list's unit entries (0x80b9b0: CIVILIAN through HIGH) narrowed to those
  near (0x80bd20 -> 0x80c080: not the player's own, of a player at war or
  the operation's enemy — a civilian of anyone —, within max(2, Movement
  left) of a member); every barbarian node asks Attack Nearby Units, so the
  march's 0x80be90 and the near-target 0x80bb50 never run. The assignment
  0x776140 with its fifth argument (the exchange filter) where the node
  allows no unequal attacks and the team is one unit, its sixth (the
  survival filter) always, a HIGH target dropping neither; carried out by
  0x771f80 ("Operation Attack Units, %s, At, Move, Attack").
- OPERATION MOVE'S UPDATE (0x81a130). Per team (the first one only for the
  head's test): a team the 0x73ab20 check passes with no member skipped; the
  goal its slot (Move To: 0 the rally +0xe8, 1 the target +0xf0); the node
  keeps a list per team (the member storage 0x737920, slots +0x78 and
  +0x74, made on its first tick) with the goal it was kept for (0x739f60):
  the list the store while the goal holds, else empty, the team's +0x48
  units added unless Validate new units. The members not listed, nearest the
  goal first (the stable sort 0x814d10): the nearest within Range to goal
  has the team arrived (+0x70); else its planning reaching a plot at the
  range this turn with Movement left (0x791300: 1 turn, the flag set) counts
  as arrived for the success test; else a listed member within the range
  arrives, joining the others. No member unlisted: the nearest listed one
  joins them. AlwaysRunning (data +0x50, 0x81be70): +0x70 cleared and the
  update returns RUNNING at that team (0x81c3a6), no store written; no
  member of the Leader Tag (+0x6c) and arrived (or reaching) with the target
  the goal: the update returns SUCCESS at that team (0x81bed5), +0x70 as
  the distance left it, so the execution moves a team that only reaches.
  Else, Unit distance (default 1) above 0: the members within it of the
  goal, then each next one within it of one of those (0x814930, 0x815a10,
  0x814840 grow the run in the sorted order), the rest strays — two strays
  or more for each member counted and arrived is cleared; the listed members
  within the unit distance of the others (0x8160a0) leave the list, one
  within the range arriving; the list stored with the goal. The status
  (0x81c32c): +0x70 SUCCESS, else RUNNING, a member of the Leader Tag
  RUNNING. +0x70 is one byte for the node, cleared at entry (0x81a15b) and
  written by each team in turn (0x81b241 the first team's head, 0x81b3cc,
  0x81bdf7, 0x81c07b, 0x81c1b7), the last team's write standing for the
  execution. Recorded: runs/h1_duelv1117 t112-122, city-state 3's City
  Defense (Simple City Defense node 10: Move To 1, Range 0, AlwaysRunning)
  Crossbowman recruited in its city 42:13, then garrisoned there each turn
  (Garrison City), moves on to 41:13 each turn ("Operation Move,
  UNIT_CROSSBOWMAN, 42:13, 41:13, 41:13", AI_Operation.csv).
- OPERATION MOVE'S EXECUTION (0x816cb0): none where the operation's teams
  gather (0x73aa60: op +0x5d0, or every team's 0x73ab20) and the update
  found it arrived, and the node names no Leader Tag (+0x7c, the tag's
  AiType; -1 takes the skip, a tagged node moves its members every tick);
  per team its members listed at +0x74 "Nonmoving" (their
  turn ends; the update empties the list at each team, 0x81c080, and no
  node fills it before the execution reads it: no recording logs
  "Operation Move Nonmoving unit", 0 of 5,577 Operation Move lines on
  1117-1128), the others with
  Movement, nearest the goal first: the radius the smaller of the node's
  Unit distance (its slot 3, node +0x30 / +0x3c — the node's data slots lie
  0x10 apart in DefnId order, as Move Unit's do; 1 where the node names
  none) and its Range (unit +0x19f8, 0x56e3d0: 0 for a melee unit), 0
  where the path finder's +0x738 is above 1 or the unit carries the Leader
  Tag; at least 1 where the goal is barred (0x586360 under flag 0x40 no
  path or a plot it would attack into — an at-war city refused to every
  unit at 0x586724 —, 0x5862e0 a unit at war, 0x585eb0 its own stacking);
  its planning of two turns at the radius
  (0x791300, no Movement asked; 0x78fa10: a plot exactly the radius away,
  none of its own stacking there but its own plot) where that plot lies in
  the goal's region; else the ring walk 0x6aef0 (the test 0x815d50: one in
  the goal's region before one outside, then strictly nearer, its own plot
  or one with none of its own, and one it may move into (0x586360 with no
  flags: no plot it would attack into, so not the goal's city centre — the
  walk is the disc, the centre first); none, the goal with flag 0x10.
  runs/h1_duelw1121 t11: Horseman 851980's march (range 2, radius 1) to
  35:14 takes 36:14, the first in-region ring plot nearest it, not the
  city's centre.
  The unit's turn ends (0x570b40) and its MoveTo (0x962030) runs at once
  ("Operation Move, %s, at, goal, after").
- BARBARIAN RAID CHECK (0x7c7330): SUCCESS where the tribe's score
  (0x152c00: +0x78 + +0x7c) reaches Score, else FAILURE; Signal At Start
  links a game signal for the target. The score: the game signal +0x8d0 —
  raised by the pillage 0x9633c0, the coastal raids 0x95ba10 / 0xa4fbc0 and
  a district's pillage in combat 0x20bae0 — runs 0x154b80: a barbarian unit
  of a tribe adds 5 to its +0x78 (+0x7c has no writer but the serializer).
- OPERATION PILLAGE. Update (0x8134a0): the target gone SUCCESS; the
  operation holding a unit SUCCESS, else FAILURE (no flag set: ERROR).
  Execution (0x811390): each IMPROVEMENT (unpillaged), PASSIVE_DISTRICT
  (pillageable) or GOODY_HUT entry of the list on the ground of the target's
  city, a member standing on it with Movement left, on land, no bombard
  strength, pillages it (0x963190; "Operation Pillage City").
- IN DIFFICULTY RANGE (0x7f1d70): the opponent's handicap (Apply to
  opponent) below Low or above High: the child skipped, SUCCESS (FAILURE
  with Fail if Outside). The duels' Prince and Warlord: Operation Attack City
  never runs in a raid. The engines read the node's bounds (Raid City's
  Low Difficulty DIFFICULTY_IMMORTAL, no High) against the target owner's
  handicap: TS the seat's (`Seat.handicap`, the AI's Prince where none),
  the GPU the rules' one handicap (no seat carries its own outside the
  replay's lab seat).
- OPERATION DEFEND UNITS. Update (0x80ee70): SUCCESS; marks the node where a
  team lists endangered units (+0xb0), a member is hurt past AutoProtect
  Percentage (default 33), or a land unit (+0x650 == 2: the unit's domain,
  0 sea, 1 air, 2 land, as HEAL and CHASE TARGET read it) stands on water
  (0x834d0) in danger, the path finder's 0x266950(3) clear.
  Execution (0x80d790): each endangered member (+0xa0 list) off the target
  (Protect Outside Range), no bombard strength, not in a city, to its safe
  plot (0x716b90 with the target), "Operation Protect Units, Move"; then the
  hurt: a promotion (0x7b5d70, "Promote"), a plunder, a safe plot afloat.
  The second pass in full (0x80de60..0x80ebfc), each member alive with
  Movement outside Protect Outside Range of the target, hurt to the
  percentage or a land unit afloat on danger: a promotion due (0x116f80 on
  +0x1bc0) takes the best (0x7b5d70, "Promote"); a bombard unit stops
  there; a ship (+0x650 == 0) whose plot is not friendly ground
  (Rules_Movement 0x530880: 1 the player's own, a city-state it is
  suzerain of, an ally's; 2 no one's; 3 another's) is collected
  (0x80e39f..0x80e3d8, no 0x570b40: its turn not done) and, after the
  walk, released (0x73d1f0, which sets no turn done either) — its later
  orders skipped. The engines: `passDefend`'s `continue`, `_x_defend` /
  `_bop_defend_exec` leaving `done` alone. THE RELEASE
  0x73d1f0 (READ): its assignment +0x778 to -1 (0x1e60f0); then per team
  of the operation (stride 0x118) the team is copy-constructed onto the
  stack (0x735110), the unit's id (+0x100) erased from the COPY's member
  list (+0x18 / +0x28 of the copy), and the copy destroyed — the team
  itself keeps the unit, and its +0x7d0 (the recruit offer's test) holds.
  So a released unit stays its operation's member, ordered by its tree
  (runs/h1_duelw1130 log t19: tribe 0's Warrior 851979, damage 68, two
  Movement on 14:8, stays in the raid's team W/S/W through t31; 1128 log
  t17 the same). The engines: no member leaves a team (`passDefend` /
  `_bop_defend_exec` / `_x_defend`). A land unit on water (+0x650 == 2,
  0x834d0) to its safe plot ("Move"); with Movement a
  plunder where the plot's district or improvement pays a heal (0x51a080 /
  0x51a160, "Plunder"); then (0x80e7e5..0x80e811) a unit with no Movement
  left (0x56c690) or a barbarian's (0x469ce0) goes on to the next member:
  no danger move, no fortification, its turn not done; any other on a plot
  of a player it fights (0x469cd0) or of danger to its safe plot ("Move",
  its moves ended 0x56d6f0 at 0x80e9c5); then, still on the map, fortified
  (0x56ef30's mission, "Fortify", 0x570b40 then 0x56d6f0 at 0x80eb3a /
  0x80eb42). The endangered's move (0x80dc28..0x80dc4e) and the afloat's
  (0x80e559..0x80e57c) end the unit's moves (0x56d6f0) where it stands on
  its safe plot after the move or has no Movement left. 0x56d6f0 sets the
  Movement left (+0xdb0, through +0xd58) to 0: the later nodes' units with
  Movement (0x56c690: Operation Attack's four passes, Attack Units' members)
  leave it out, and the unit still rests (runs/h1_duelw1117 log t7:
  city-state 2's Attack Barb Camp's two Warriors fortify under Protect
  Units and the operation's attack lists no target and moves no one; t8
  the one at 46 damage, under the node's 50, attacks alone; record t8 holds
  both healed 10 on the plots they fortified on). The engines: the pass's `ended`
  (`passView` reads their Movement as none, `passDefend`'s `moves`) /
  `view["ended"]` and `ctx["ended"]` (the Movement zeroed through the run,
  given back after it). Each order sets the unit's turn done (0x570b40).
  The promotion ("Operation Protect Units, %s, Promote") and the plunder
  ("Plunder %d %d": the pillage mission 0x963190 where it may, the plot's
  district (0x51a080) or improvement (0x51a160, the row's +0x48 scaled by
  the player's progress) paying above 0) are ported (`passDefend`,
  `hostilePillageAmount`; `_promote_due`, `_plunder`).
- THE TEAM UPDATE'S ENDANGERED (0x738f20, +0xa0, cleared each tick): per
  live member, each entry of the player's target list (+0x370, 40 bytes)
  within twice its base Movement (0x56d9f0): an entry's unit (kind 1) that
  fights, where no unit of the member's player stands on its ring (0x6b1b0
  over the lambda 0x737610) and the member's plot holds danger (0x716a60)
  or the entry is HIGH, within the unit's Movement (0x56e130) or its range,
  adds its blow on the member (0x51a240 on GetCombat's strengths); a
  district's city (kind 3, 0x408770) that strikes, the member within its
  strike range of the centre, its strike (0x519370); after each entry a
  member not yet listed joins where the sum is above 0 and it does not
  fight (a lone unit on land), else where its damage plus the sum passes
  its hit points.
- THE RECRUIT'S OFFER (0x60a8c0): the player's units with no operation
  (+0x7d0 == -1), their turn not done (+0x530 clear) and alive (+0x770
  clear), then the evaluator's test (Recruit Units' 0x816380 -> 0x738050).
  The turn-done flag's one setter 0x570b40 (through the replicated field at
  +0x4d8, a game event 0xd70ba51f when set): cleared for every unit in
  DoTurn (0x4e4560), set by the tactical moves (the attacks' carry-out
  0x771f80, Chase Target, Random Direction's wander, the air moves), the
  homeland (0x70a440), Defend Units, a conversion (0x590a30), the
  espionage AI (0x695660), a retreat (0x212500), and the unit-created
  handler 0x60a440 (player signals +0x60, raised by the unit's creation
  0x4eeb70) for an AI player whose Control Manager's job list (+0x2b8)
  holds an entry with +8 == 0. 1128's city-state 2 offers its six units
  none at t167-183 (its City Defense started and completed each turn, no
  tactical row for them): its "Upgrade Units" trees hold them ("C-99: the
  upgrade trees").
- THE UNIT'S ASSIGNMENT (the field at +0x778, its value +0x7d0): the job
  the unit is in — the tactical pass's, the homeland's, an operation's
  (`addMember` 0x737e80 writes the operation's id +0x720) — listed by job
  through 0x6092c0. The tactical pass (0x7715a0) and the homeland
  (0x70a370) release their units (-1) as they end. A tree's units each
  tick (0x7d2190 from the tree manager 0x7cb3d0), those not done: the tree
  marked (+0x3c8) with no operation (+0x888 == -1) releases them, else
  their turn is done (0x570b40). The operation's end (0x7353d0 -> 0x73ea10,
  the teams' destructor 0x735790) writes no unit, and the release 0x73d1f0
  is Defend Units'. The team rebuild (0x73f7d0, before the team update)
  lists the operation's units by its id (0x6092c0 on +0x720) and adds each
  one alive (+0x770 clear) that no team of it holds to its first team
  (0x737f90); it resets no field. The team update (0x73fba0, at 0x740016)
  sets a member's assignment to -1 where its slot is flagged (+0x18), the
  operation's +0x890 is clear and the unit's +0x1fb8 +0x738 is 1, and
  counts it otherwise. The engines free an ended operation's units with
  its end (a unit is the operation's while a live operation's team holds
  it); 1117 city-state 2's Warrior 131073, its Attack Barb Camp complete at
  t9 after the Warrior's attack, offered to no recruit at t9 and taking
  tactical moves from t10, agrees. 1128's city-state 2 offers its units
  none at t167-183: its "Upgrade Units" trees hold them.
- NOTIFY OWNER (0x7c6fa0 -> the player signals +0x288 -> 0x148270): the
  tree's tribe; the raid's tree (+0x3c) offers its city to the city assault
  (0x1497d0), which refuses while the raid stands (+0x3c or +0x40 set): the
  city to the assault list (+0x60), the tribe's next turn starting it at
  CityAttackBoldness. The tree done, 0x73a840 finds the operation's tree gone
  and the manager ends it ("Operation complete", 0x725000 -> 0x7353d0).
- AN OPERATION THAT LOSES ITS UNITS: in the raid Operation Pillage FAILS and
  the tree ends; in the march or the way home nothing FAILS and the
  operation stands with none (runs/h1_duelw1124: the t22 raid empty for 444
  turns; h1_duelw1128: the t78 raid at home empty from t143) — its tribe
  starts no other.
- THE RALLY (READ): the tribe's camp. The tribe's init (0x147fc0) writes
  the camp's plot to tribe +0x10 (the defender placed on it, +0x18 the camp
  standing); the raid's start (0x149980) and the assault's (0x1497d0) call
  0x73e7d0 (op, the city's plot +0x158, &tribe +0x10): the target to op
  +0x2a8, the rally through the autovariable at op +0x2c0 (0x7eb220) to op
  +0x318, then each team's goals, slot 0 (+0xe8) the rally and slot 1
  (+0xf0) the target — over whatever rally the start by name (0x7265b0)
  took from the candidate.
- THE STAGING PLOTS (READ): m_operationStartPoints, the Targets object's
  autovariable (player +0x12b8 +0xb00, its vector +0xb58 / count +0xb68,
  8 bytes a plot), rebuilt at each Targets update (0x7877e0: the tactical
  knowledge turn 0x785f30, the scripted starts 0x725b80 / 0x726a20) — a
  barbarian player's: the knowledge base's camps (KB +0x638, 16 bytes each,
  count +0x648) in its order; any other's: its cities' plots (+0x158 /
  +0x15c) in Player_Cities' order. The evaluation (0x746920) walks them as
  the candidate's rallies; the barbarians' rally a running operation's
  fixed one, and a capture's tree moves on the target (Move To 1), so no
  barbarian move reads a staging plot.
- A MEMBER KILLED (READ): the update's member walk over the team's list
  (0x81a8f5..0x81a925, 0x4f2310 on each id) skips a unit it cannot find, or
  one with +0x1939 set, before anything counts it: it is neither listed nor
  sorted, and the stray test (0x81c042..0x81c07b) clears the arrival where
  twice the strays reach the count of the members the walk sorted
  (strays: those past the run of 0x814930 / 0x814840). The sort 0x814d10 is
  an insertion sort on the distance to the goal alone, strictly nearer
  first, so equals keep the team's member order (the order they joined,
  0x737e80), not the pool slot. The engines: `passMoveUpdate` /
  `_op_move_update` (the member order: the TS team's list, the GPU's
  `barb_unit_join`, a capture's captive then captor, a city-state's
  `mops_mem` place). runs/h1_duelw1128's raid (its Crossbowman alone on its
  rally 15:15 t90-t142, two of three killed) is no stray case then: it is
  a team of one. LAB: the execution's gathering test is the update's
  arrival (the team's readiness +0x11, 0x73fba0's strength advantage,
  unread); the team's +0x48 units are none.
- THE TURN LIMITER over a child the walk has not reached yet (FRESH) has
  not finished it: the limiter RUNS (the raid's Concurrent 15 under it
  ticks the turn it is reached).
- THE MOVE'S RADIUS: the Unit distance caps it, not Range to goal (Raid
  City's march node 11 names 0, its node 21 none: 1). runs/h1_duelw1121
  t56-t76: the raid's Archer (Range 2) and Warriors log one goal each turn,
  6:13 or 7:12 beside the target 6:12 (the barred city: radius 1); the
  Archer from 7:14 to 6:13 at t73 and stays at t74. runs/h1_duelv1124 t35
  (a Warrior's goal one plot short of its target) agrees. The ring test
  0x815d50 takes a plot holding a unit of the mover's player only where
  0x265ac0 -> 0x265af0 passes it on the mover's path finder (READ): with
  no member (+0x738 0) any unit; else the unit must be alive (+0x770
  clear, +0xcf0 below its hit points), not of the air domain (+0x650 1),
  on the group's leader's plot (the first member +0x728, +0x220 / +0x224),
  no Spy (unit info +0x1ba bit 2) nor +0x1b9 bit 0x40; with one member a
  civilian (formation class 2) beside a support leader (1) or a support
  unit beside a civilian leader refused; and none of its formation's units
  of a member's formation class or of the air class (4). A unit on another
  ring plot never stands on the leader's plot, so a mover with a member
  takes no plot of its own player's units: the engines take none.
- THE DESIRED STRENGTH (0x723ab0, READ): the advantage (fixed x256) at -5
  or less asks minus the enemy strength; else the advantage times the
  smaller of the seat's and the enemy's PlayerStats +0xf0 (the best melee
  strength trained; the seat's own where the enemy is none). Raid City's
  team asks -1. The barbarians' PlayerStats +0xf0 stays 0 (the AI memory
  reader, runs/h1_duelt1121 player 63 t1-t60, its units raised and
  upgraded), so a barbarian team asks nothing past the enemy's strength:
  the engines raise no barbarian best strength (`raiseBestTrained`, the
  importer) and the GPU asks none. The refresh (0x73eb60 / 0x73f7d0) runs
  in the barbarians' tactical turn after the knowledge base aged and
  looked (the reader: t16 the raid's stored 49 against 47 at the log
  moment, 46 against 54 at the end look, the log "Not Ready"; t61 65
  against 81 Not Ready, t63 65 against 61 Ready): `barbarianOpsTurn` /
  `_barb_ops_refresh` after `knowledgeLook` in the pass. runs/h1_duelw1121 t57-t68: the game's raid team (Archer,
  two Warriors, 65) Ready t59-60 and t63-66, Not Ready t57-58, t61-62,
  t67-68 — an enemy strength about 6:12 near 65; the engines' 115-167 (the
  city 28, its owner's best 28, the knowledge base's 86-111 of seat 1's
  units within 3: the replay's seat-1 units round 6:12 are not the game's).
- MEASURED: below, "C-95: the barbarians' operations on the manager".

## C-95: the barbarians' operations on the manager — READ (the starts, Notify Owner, the assault's walk), ported

cpu/core/barbarianOps.ts over cpu/core/operations (the barbarians' nodes
cpu/core/operations/barbarian.ts); gpu/core/sim_barbops.py.

- THE STARTS: the raid (0x149980) names no enemy (-1); the city assault
  (0x1497d0) sets op +0x2a0 to the city's owner — the assault's enemy, so
  its Attack Units takes that player's units (and any civilian), and Siege
  City's update ERRORS with +0x2a0 at -1. Both set the target with 0x73e7d0
  (the target, the rally — the tribe's camp —, each team's goals); the tree's
  trigger value is the tribe's index. A tribe holds one at a time.
- NOTIFY OWNER (0x148270, by the tree that sends it): the scout's tree
  starts the raid at RaidingBoldness or lists the city for it; the raid's
  tree lists the city for the assault (+0x60); the assault's tree lists
  nothing but where the tribe was bribed (0x147c20's turns).
- "BARBARIAN CITY ATTACK" under the interpreter: the root Concurrent over
  Operation Defend Units and the Sequence — Decode Trigger, the recruit
  (Spawn Change, the Turn Limiter over Barbarian Recruit and Spawn Change,
  Spawn Change), the gathering (Make Formation, Operation Move to the
  rally), the march (Attack Units, Make Formation, Operation Move to the
  target), the assault (Siege City, Attack City, Attack Units, Make
  Formation, Pillage, Operation Move onto the target), Notify Owner. Its
  Make Formation nodes take a civilian, so a barbarian assault forms no pair.
- MEASURED (the action replay, 5 seeds, main c3253523 -> the trees on the
  manager): barb:move imposed 1117 400 -> 335, 1121 1,055 -> 952, 1124
  1,007 -> 1,047, 1127 590 -> 544, 1128 791 -> 1,023 (3,843 -> 3,901);
  barb:unit 511 -> 500, barb:unitNew 125 -> 156. The logs' "Barbarian
  Attack" lines: turns with every line equal 1117 5 of 15, 1121 12 of 171,
  1124 207 of 242, 1127 5 of 220, 1128 0 of 193; "Barbarian City Assault"
  0 of 146 (1121, 1128: the replay's assault never starts). Every raid
  starts a turn after the game's ("Started" at t, ours at t+1: the scout's
  report lands in the tactical pass, the game's before it), and the
  team's readiness reads Ready where the game's Not Ready (1121 t16-t19,
  1127 t36-t43). 1124 and 1128 regress: the scout's look starts trees the
  game does not (1128's raid on 15:10 at t12 against the game's 42:20).

## C-95: an operation's enemy strength — READ (0x73eb60), ported

`refreshStrengths` / `enemyStrengthAbout` (cpu/core/operations/nodes.ts);
`_ops_enemy_str` (gpu/core/sim_minorops.py), read by the city-states' and the
barbarians' operations alike.

- THE ARMY STRENGTH'S AGE: 0x5eadb0 counts per unit type the records of
  0x5ef760, which skips a record whose age (+0xc, the ageing's count since
  last seen) passes its seventh argument; every caller passes 2 — the city
  threat (0x5cbfc1, 0x5cc394), the target walk (0x747433, 0x7477ca,
  0x747a0e), the enemy strength (0x73ecda / 0x73ecf4), the target check
  (0x73abf0), the evaluation's own strength (0x746d07), the city value
  (0x7a0142), 0x654c9a, 0x7aed3b. runs/h1_duelv1117 Caguana t50: three
  Warrior records on 611 seen t33, t35, t50 — the last alone counts, 20
  against 23 + 23, no threat, and the game starts no City Defense. The
  engines read the city-states' and the barbarians' records so
  (`recentOf` / `_mops_records`' recent, `minorThreat`; the age the last
  ageing's turn `armyAged` / `citystate_kb_aged` less the turn last seen)
  and the majors' (`recentArmy`, the probe's `armyAged` at its `lookArmy`).
- 0x73eb60 over the player list (+0x4a0): the players it counts — the
  operation's enemy (op +0x2a0), else (-1) each player the seat is at war
  with (0x469cd0 -> IsAtWarWith; the barbarians at war with every player).
  For each, the knowledge base's army strength within 3 of the target
  (0x5eadb0, minimum 0: each record max(Combat, RangedCombat) less its
  damage x 0.1), the enemy's own kept apart ([rbp+0x6f]); then of its known
  cities (kb m_knownCities, 0xe0-byte entries) within 3 of the target, each
  its defense (0x5eb2c0 without its byte: the strongest district's defense
  - 10, or its walls; whole); the first with a defense above 0 — where the
  enemy is none or a full civilization (0x484a10) — adds the owner's best
  trained melee strength (PlayerStats +0xf0, 0x4d9320) less the enemy's
  army there, where that is the smaller. The team's readiness (0x73fba0)
  reads it: the barbarians' raid on a city Not Ready where a garrisoned
  city stands (runs/h1_duelw1127 t36-t43: the members' 65 against 83 to 121;
  h1_duelw1121 t16-t19).
- The Free Cities' best trained melee strength is a plane of its own on the
  GPU (`free_best_melee`).
- The engines' tactical target list (both twins) holds a camp only revealed
  among the camps whose ring makes a barbarian's target HIGH; the barbarians'
  Attack Units takes a CIVILIAN target's planning entry (a Builder two plots
  off: seed9001's opening, t13, where the twins parted).
- MEASURED (the action replay, 5 seeds, the look, the readiness and the
  replay's scout trees kept between turns): barb:move imposed 3,901 ->
  3,698 (1117 335 -> 339, 1121 952 -> 1,008, 1124 1,047 -> 1,003, 1127 544
  -> 590, 1128 1,023 -> 758); barb:unit 500 -> 483, barb:unitNew 156 ->
  135. The logs' "Barbarian Attack" turns with every line equal 1117 5 -> 7,
  1121 12 -> 10, 1124 207 -> 227, 1127 5 -> 5, 1128 0 -> 0. Raid starts on
  the log's turn: 1117 t9, 1121 t6 and t55, 1124 t8 and t22, 1127 t30, 1128
  one of t11's two (the other at t10); missed 1121 t33 / t78 / t119 and 1127
  t59 (no tree). The city assault starts on 1128 at t33 against the log's
  t32 (its raid's way home ends a turn late: the members' planning), none
  on 1121 (its raids missing).

## C-95: the barbarians' Builder Capture — READ (the event, the start, the tree's walk), ported

`barbarianCaptures`, `barbarianOpsTurn`'s backups (cpu/core/barbarianOps.ts),
the event in `seizeCivilian` (cpu/core/combat.ts, `GameState.barbCaptures`);
`_barb_capture_event`, `_barb_captures`, `_bcap_refresh`, `_bop_capture_tick`
(gpu/core/sim_barbops.py), the event in `_seize_civilians` (gpu/core/sim_seats.py).

- THE EVENT (Combat_Manager 0x212500, a civilian captured): the payload's
  units — the captive (r14 +0x100), then the captor (rsi +0x100; where its
  +0x7d0 is -1 or 0x56ee80 answers, both unread: the engines take it
  always) — raised as AI_EVENT_UNIT_CAPTURED (@f2e088) on the player's
  signals (+0x2b8, 0x200e10). The barbarians' triggered trees
  (BarbarianTriggeredTrees: TRIGGER_CAPTURE_BARBARIAN, the tree "Escort
  Worker To Camp", the operation "Barbarian Builder Capture") run it.
- THE START (0x800c60): the named definition by 0x7265b0 with its flag,
  the target the first payload unit's plot (+0x220), the candidate's rally
  (the engines: the plot); each payload unit to its team (addMember
  0x737e80, the unit leaving the team it held: runs/h1_duelw1128 t25-26, the
  raid's Slinger to the capture, the raid's team two Warriors).
- THE BACKUP: the military AI's turn names a running operation's candidate
  its backup (0x73e610): of the camps, from the target, at the strength
  the last refresh left (0x727510 sets the backups at 0x72763d, before the
  strengths 0x73eb60 / 0x73f7d0 at 0x727c74: none on the turn after the
  start), against the walk's 6 alone (0x746920); runs/h1_duelw1127 t23: at
  strength 0 both odds fall below 0 and the farther camp 14:13 reads the
  higher (the 0.97 power shrinks a negative base), the game's backup;
  the tree's Change Target finds the capture's plot no camp (INVALID) and
  switches to it (1128 t26: "INVALID Changing to backup", the target 30:6).
- THE TREE ("Escort Worker To Camp"): Sequence 0 over Make Formation 1
  (Combat Unit UNITTYPE_LAND_COMBAT, Civilian Unit UNITTYPE_CIVILIAN),
  Operation Change Target 2 (Backup Amount 0, Failure Amount -1),
  Concurrent 3 (Operation Is Ready 4, Operation Defend Units 5, Operation
  Move 6: the target, range 1, unit distance 2), Make Formation 7 (Destroy
  Formations), Operation Move 8 (the target, range 0). The team: one
  civilian (UNITTYPE_CIVILIAN 1..1), a UNITAI_COMBAT unit at least, no
  naval one; InitialStrengthAdvantage 0, Ongoing 0.5.
- The barbarians' knowledge base's camps (+0x638) are any player's: the
  update drops a camp whose plot they see or have revealed with none there
  (0x5ebb30), the look adds each camp on a plot they see or have revealed
  (0x7877e0 -> 0x5f0110), in plot order behind those held — so a camp joins
  at the look after its units revealed its plot (the pass's opening look,
  the turn's end look), and the list keeps the order camps joined. The
  engines: `barbSeat.campsKnown` (`barbCampsLook`, `lookCamps`) /
  `barb_camps_known` (`_barb_kb_camps`, `_kb_camps`), read by the capture's
  backup and its target test as the operations' camps.
- OPERATION DEFEND UNITS (0x80ee70 / 0x80d790) runs the
  city-states' reading ("Operation Defend Units, both twins") on the
  barbarians' pool: the raid's node 20, the assault's 1, the capture's 5;
  a hurt ship is released (no plot is the barbarians' own ground), staying
  in its team (THE RELEASE 0x73d1f0); a hurt land unit afloat goes to its
  safe plot; one with Movement on a plot paying a plunder pillages it
  ("Plunder", runs/h1_duelw1128 log t39: the assault's Warrior "Plunder 16
  10"; `passDefend`, `_bop_defend_exec` through `_barb_pillage_here`); then
  a hurt barbarian's orders end (0x469ce0: no danger
  move, no fortification, no line, its turn not done: runs/h1_duelw1128 log
  t35-t37, the assault's Warrior 1114128 at 83 damage, over the node's 66,
  logs no Protect Units and attacks at t37). runs/h1_duelw1117 log t6:
  city-state 2's Attack Barb Camp's
  Warriors, 56 and 60 damage on no one's ground beside the camp, go to
  their safe plots 13:10 and 14:10 and fortify ("Operation Protect Units,
  Move" / "Fortify").
- ASK (the operation manager's files): `targetValid` (nodes.ts) holds a
  camp target valid; the tree's INVALID swap needs the camp branch of
  0x73abf0 there ("no camp the seat knows on the target": `targetGone`),
  which the GPU twin reads.

## C-95: Coastal Raid — READ, ported

`coastalRaids` in cpu/core/tactical.ts (the raid `coastalRaid`,
cpu/core/combat.ts); `_tac_coastal_raid` in gpu/core/sim_tactics.py
(`_barb_coastal_raid`, gpu/core/sim_orders.py).

- 0x7794b0: each IMPROVEMENT, then PASSIVE_DISTRICT entry of the list on
  coastal land (0x82a10), each unit of the move's list alive, +0x650 == 0,
  CanRaid (+0x18bd) whose planning of two turns holds a plot at range 1
  (0x791300) is queued with it (0x7803d0, "Coastal Raid"); the queue
  carried out (0x7735d0): each queued unit that can act moves to its plot
  (0x962190, flag 0x10) and raids the target where it may (0x95b100 ->
  0x95b7c0). The raid wrecks the plot's improvement, else its district, 3
  Movement spent (none for a raider that raids free); the pillage signal
  scores the tribe.
- MEASURED: 9 of 9 Coastal Raid rows take the move (0 on the base), 5 end
  on the game's plot.

## C-60: the Free Cities' research — READ (the catch-up's receivers), ported

`freeCitiesPhase` (cpu/core/phase.ts) through `minorResearch`
(cpu/core/minorBuild.ts); `_free_cities_phase` (gpu/core/sim_phase.py)
through `_minor_research` on the research row `FR` (gpu/core/sim_minors.py).

- The Free Cities player (62) holds a research of its own, logged from turn 1
  like a city-state's (AI_Research.csv / AI_GovtPolicies.csv rows of player
  62 in every duel; its record's techs, civics and progress in every
  record). The catch-up 0x4cb930 / 0x39ec60 counts it among its receivers
  (neither FULL_CIV nor TRIBE: "H-1: a minor's research catch-up"), so each
  row the majors hold stands at its cost less one; with no city it makes no
  Science, and a row completes once the game era's price falls below that
  progress (runs/h1_duelw1123: Pottery at 11 of 12 from turn 2, done at t32
  when the Classical prices make it 10; then one a turn — Writing, Animal
  Husbandry, Mining, Bronze Working, Archery, Astrology to t38, each at its
  old cost less one against the new price). With a city its Science and
  Culture are its cities' (1123 t203-t210 0.45 to 0.90 a turn).
- The engines: the seat is made at its first turn and runs a city-state's
  research every turn — the catch-up, its cities' Science and Culture summed
  in their order, the research and civics AIs' choices, Urban Defenses
  fitting its cities (`urbanDefensesFit`); every reader of a seat's research
  takes it (the walls' tier, the yield walk's techs and civics, the
  resources it sees, the dig sites, the flank and embark rungs, the
  embarked defence's era, the appeal's civic). Its build table reads it in
  place of the world era's research.
- UNREAD: the research analysis's resources term for a player of several
  cities (the engines carry none for the Free Cities, as for the majors).
- MEASURED (the action replay, player 62): its research choices as the
  record's 2 of 2 in 1114, 1117 and 1124, 5 of 5 in 1130, 6 of 35 in 1123
  (first off t35, Astrology for Archery); its analysis's rows within 0.05
  of AI_Research.csv 1,652 of 2,074 (1114) to 3,362 of 4,233 (1117).

## C-60: the Free City's grant — READ (0x274010, 0x273c50), ported (the allowed list's upgrade lines and the repairs below)

`freeCityGrant` (cpu/core/phase.ts), `_free_city_grant`
(gpu/core/sim_phase.py).

- 0x274010, each Free City's record (+0x0c the city, +0x14 live) every
  Free Cities turn: the count +0x18 rises by one; at 5 or more: the units
  whose +0x11d0 names the record (the city's grants), +0x7d0 == -1, are
  counted — a unit with build charges (+0xed0 > 0) kept aside as its
  Builder — and with 6 or more the grant waits, the count held. With no
  Builder of its own, no HIGH_PRIORITY_UNIT target of the player's list
  within 5 of the city (0x272fa0) and a pillaged improvement (+0x44 set,
  +0x4d bit 0) on a plot within 2 of it, CLASS_BUILDER is raised; else ONE
  draw "Free Cities Unit Choice" (0x152eb0) over CLASS_MELEE, CLASS_RANGED,
  CLASS_LIGHT_CAVALRY, weight 1 each; the unit 0x273a40: of the record's
  allowed units (+0x28) of the class, the highest Combat (+0x48, the first
  of equals), placed by the ring walk 0x6aef0 within 3. The count back to
  0. Then, the city not producing (+0x2350 == 0), the first pillaged
  district it may repair (0x173f70), else a pillaged building's repair.
- THE RECORD (0x273c50, made at the revolt by 0x276bc0): the city, live,
  the count 0; its allowed units (+0x28, one flag per Units row): each unit
  the city can train (CanTrain 0x172820 on its build queue, the former
  owner's then) but those flagged +0x1b8 bit 0x40, those with religious
  strength (+0x78) and the air ones (domain +0x20 2 with +0x44 0) and those
  whose class def (0x28a940) bears +0x48 bit 0x10 — a unit with a list at
  +0x2b0..+0x2b8 (its count +0x2d0) flags that list's units with no list
  of their own in its place; its allowed buildings (+0x48: +0x54 set,
  +0x58 above 0, constructible there); +0x1c the player's +0x12f0 +0xf4
  where above 0; then the revolt's pair, 0x273a40 at CLASS_MELEE, 2 units
  within 3.
- The engines: the count `City.freeGrantTurns` / `city_free_grant`, the cap
  6 over the units the city granted (its Builder, `charges` above 0, not
  counted), the Builder (`FREE_CITY_BUILDER`, a civilian of the hostile
  pool on the GPU, `_spawn_barb`'s `civ`) where a pillaged improvement
  lies within 2 and no HIGH target of the Free Cities' list within 5
  (`threatened`, the list as `tacticalTargets` / `_tac_targets` builds it
  then), else the uniform draw and the class's chassis of the city's
  allowed units (`City.freeAllowed` / `city_free_allowed`: the former
  owner's `trainableIn` at the revolt; `freeCityChassis` /
  `_free_chassis`), the pair the same at MELEE. LAB: the +0x2b0 lists
  (read as the units' own rows: `trainableIn` takes the generic chassis),
  the units +0x7d0 skips. BUILD (AUDIT C-60): the repairs (requests on the
  city's production, 0x97a1b0 / 0x97a0d0, the Free City's build the pick
  takes over), the Builder's work.

## C-95: the homeland's Plunder Trader — READ, ported

`homelandPlunder` in cpu/core/tactical.ts; `_tac_homeland_plunder` in
gpu/core/sim_tactics.py.

- 0x70f610, first of "Default Barbarian HL": each TRADER entry of the
  player's target list (+0x12b8 +0x370, 40-byte entries), each homeland
  unit (+0x208) not yet in the move list (+0x220), not +0x770, with a
  planning (+0x1fc0) that reaches the entry's plot this turn (0x791300: one
  turn, range 0): the row ("%d, %d, %s, %s, %s, %s (%d), Available Units:
  %d", the count 1), a move order onto it (0x962190) and the plunder
  (PLUNDER_TRADE_ROUTE 0x955950) queued (0x7094f0); the queue carried out as
  the move ends (0x70a440). A civilian goes too: runs/h1_duelw1124 t137-t151,
  t170-t173 the barbarians' captured Builder stands each turn on the plot of
  player 4's Trader.
- The engines: the homeland's units take a search of one turn for the
  plot (a civilian holds no planning there); the plunder is the move's.
- MEASURED: none of the 26 rows of the five duels takes it — a Trader on
  its route stands on no plot in the engines (`trade.ts` spawns one only
  where a route ends), so the target list holds no TRADER entry there.

## C-95: the target list's knowledge-base entries — READ, ported (two records on one plot below)

- After its plot walk and the region set (0x7856f6), the tactical target
  list 0x783980 walks the game's players (0x483b50 +0x4a0..+0x4a8) and, for
  each its player is at war with (0x469cd0), asks its knowledge base
  (0x786160) for that player's units (0x5eb8b0, age 1, distance 2): per
  unit type in DB order, each record (0x5ef650, 32 bytes) whose age (+0xc)
  is exactly 1 — seen at the last look, not at this turn's — whose unit
  (+0, the player's unit list 0x4f2310) still stands (+0x770 clear) within
  2 of the plot recorded (+0x10 / +0x14): the unit's own plot now. Each such
  plot the player does not see now (+0x290 count 0) takes an entry after
  the walk's: TARGET_LOW_PRIORITY_UNIT where the unit's type has Combat
  (+0x48), else TARGET_CIVILIAN_UNIT. The priorities (0x786d50) follow.
- The barbarians' look (Targets.cpp 0x7877e0) walks each seen plot's
  units of the map's layer 0 (0x75800(map, 0) -> 0x75ce0): no Trader is
  one of them — none of the barbarians' AI_Knowledge.csv ARMY lines on
  runs/h1_duelw1117-1128 names a UNIT_TRADER (the city-states' name 90-147
  each), and none of the 207 barbarian Attack Civilian rows targets one
  (1117 t74: China's Trader at 36:13 drew ours off a pillage). Every
  player's look reads layer 0 alike: "LAYER 0 FOR EVERY PLAYER" above.
- The knowledge base: the city-states' (C-96) and the barbarians' (aged
  and looked at their tactical turn's start, looked again at its end),
  `knowledgeLook` in cpu/core/tactical.ts (`Seat.armyKnown`) /
  `_knowledge_look` in gpu/core/sim_minors.py (the knowledge tensors' row
  `BK` the barbarians'; `citystate_kb_seq` the records' order). The
  entries: `knowledgeEntries` / `_tac_known_entries`. The GPU list keeps
  its unit entries apart from the plot's other one (`uk`, `uu`, `us`, and
  `uo` each entry's place in the list), so a remembered unit on a plot the
  walk gave a revealed camp, goody hut or improvement takes its own entry.
  LAB: a plot holds one unit entry on the GPU — a second record's unit on
  it takes none (the TS list takes both).
- MEASURED (the action replay, 5 seeds, against main e46f1ae3): barb:move
  imposed 1117 404 -> 401, 1121 1,069 -> 1,066, 1124 1,017 -> 1,003, 1128
  772 -> 766, 1127 535 -> 586; Attack Civilian rows taking the game's move
  72 -> 102 of 157, Barbarian Rampage 2,552 -> 2,575; Pillage Improvement
  59 -> 49 of 198. The city-states' moves unchanged.

## C-95: the scout's tree "Barbarian Found City" — READ, ported

`barbScoutTreeStart`, `SCOUT_NODES`, `tickScout` in cpu/core/barbarianOps.ts
(the look `barbScoutLook`, cpu/core/barbarians.ts); `_bop_scout_tick`
(gpu/core/sim_barbops.py), the look in `_barbarian_scouts`
(gpu/core/sim_barb.py).

- THE START (0x1485c0, from the scout's look 0x153ef0 once the player's
  throttle allows, the tribe's scout walking none yet): the tree "Barbarian
  Found City" ("Barbarian Behavior", 0x7ff9a0) on the scout alone, the
  trigger's Location its tribe's camp ("Home Camp") and Value the tribe's
  index ("Tribe Index"); the game signals BARBARIAN_SPOTTED_CITY and
  BARBARIAN_RAID_STARTED linked (0x1808c4af0).
- THE TREE (BehaviorTrees.xml): Sequence 0 (JumpTo 6) — Decode Trigger 1
  (its Location to "Home Camp", its Value to "Tribe Index"), Concurrent 2
  (JumpTo 5) over Protect Unit 3 (Damage Percentage 0.25) and Move Unit 4
  (Location "Home Camp", Release when done true, Allow Danger true, To
  Range 1), Notify Owner 5 (Data Payload "Tribe Index", 0x7c6fa0 ->
  0x148270: the city to the tribe's raid or its list, "C-95: the
  barbarians' raid"). The Concurrent RUNS while a child runs; the notify
  follows its SUCCESS (the interpreter as "Raid City"'s, 0x7d3a00).
- PROTECT UNIT. Update (0x7f07c0): its units (the Unit List, else the
  tree's, 0x6092c0 on player +0x12d0); none FAILURE; each whose damage
  (+0xcf0) is at least Damage Percentage of its health (0x56e0d0; the
  percentage in 8.8) on a plot the influence map rates dangerous (player
  +0x12d8, 0x716a90 above 0) counts; any counted RUNNING, else SUCCESS.
  Execution (0x7ef0e0): where the update counted one, each such unit to
  its safe plot (0x716b90; the engines' `passSafePlot` / `_tac_safe_plot`)
  and the move (0x962030), its turn ended (0x570b40) either way.
- MOVE UNIT. Update (0x7f0020): no Location SUCCESS, no unit SUCCESS; the
  unit it holds (the node's memory): its planning reaching a plot at To
  Range of the location this turn (0x791300) SUCCESS, else RUNNING, a held
  unit with no planning FAILURE; none held, the unit whose planning reaches
  the location itself this turn — one with Movement left there first —,
  else the one whose path (0x272a60 on the unit's path finder +0x1fb8,
  flag 0x1000; see THE PATH 0x272a60 below) takes the fewest turns (above
  0, fewer than the best so far), is held: SUCCESS where it reaches it with
  Movement left, else RUNNING; none FAILURE. A camp its own defender holds
  is such a goal (runs/h1_duelw1121 camp 12:14: its Scout reports 6:12 at
  t64 and walks home round the mountains by row 19, where the tribe's own
  Warriors stand at t65, home at t73; Notify Owner lists 6:12 under the
  running raid, and the tribe's turn after that raid's end starts the next
  on it — the game's t77 end, t78 start). Execution (0x7eeba0):
  the held unit's turn ends; it goes for the plot at To Range its planning
  reaches this turn, else the location (a plot of danger only where Allow
  Danger), woken (0x53e20) and moved (0x972880 / 0x962030).
- THE PATH 0x272a60 (READ): 0x272a60(path finder, plot, flags) ->
  0x272880(0, finder, plot, flags): the unit's own plot 0; a plot off the
  map 0; the plot tested (0x2669d0 / 0x586900 / 0x20a3c0) and the path
  generated (0x26f1d0: the flags to the instance's +0x398, bit 8 where the
  finder's +0x4b8 is clear, 0x2000 for a unit +0x738 above 1 holding
  0x2669d0 2 or 4; then the A* 0x7a630 over the callbacks 0x26f330 sets:
  the validity 0x2720a0, the cost 0x26e920), its turns the answer. The
  planning's breadth-first validity 0x26e570 (its zone-of-control refusal
  under +0x398 & 0x200 clear, its attack-plot stop) is referenced only by
  the breadth-first searches 0x26dcd0 / 0x26df90 — not this path's. Here
  the zone of control is the cost's (0x26e920: +0x398 & 0x800 clear, so a
  step into a zone spends the Movement). The validity 0x2720a0 walks the
  chain back from the new node (0x272230..0x27235a: each node, its parent
  +0x0, its turn +0x2c, the newest from the instance's +0x1dc); a node
  ending a turn (+0x50 & 2) whose stacking count (+0x54) reaches the
  limit (+0x1b0) is refused unless +0x51 & 4 with +0x1f8, or flags & 4;
  with flags & 0x1000 (the validity's flag word +0xe0, 0x2721df) only
  where that node's turn is 1 or less (0x27229b). So the Move Unit / the
  minors' trees' path (Move Unit's 0x7f05a0: r8d 0x1000) is the path's own
  search, a turn after the first free to end on the unit's own stacking
  unit. runs/h1_duelw1128 t7-t11: tribe 0's Scout reports Rome 42:20 from
  39:20 beside China's Warrior and Scout, the planning's refusal shuts it
  in (875 / 963 in the Warrior's zone), the path takes it home by 39:19 as
  the game walked it, and both tribes' raids start at t11 as AI_Operation
  logs. The engines: `turnsToPlot` (`search` zoc, `laterTurns`) /
  `_tac_search(..., True, later_turns=True)` in the scout's Move Unit and
  the minors' `turns_to`.
- THE LOOK (0x153ef0, per plot newly visible to the barbarian player): the
  plot's owner (+0x1c) any player; for a scout (unit AI type +0x1c0 == 2,
  UNITAI_EXPLORE), the owner's throttle passed (@f28c78 +0x110, the game
  turn, at the player's +0x430 entry), a plot holding an improvement (+0x44,
  the type, -1 none) or a district (0x810d0): the tree starts where its
  tribe's scout walks none (0x1485c0; a full civilization's city, 0x484a10)
  and the throttle is written (+0x3d8: the turn + BARBARIAN_MAX_THROTTLE_PER_RAID
  less the level's, whether or not a tree started). Confirmed on the five
  recordings' first trees: 1117 t6, 1121 t4, 1124 t6 and t20, 1128 t6 and
  t8, 1127 t27 (the scouts' last tactical moves before their trees hold them), each
  the engines' start turn in the action replay, which looks along the
  record's steps once the barbarians' turn is done.
- THE TREES' ORDER: the scout's tree is a tree of the barbarian player's
  list (0x7ffdd0, creation order), so it ticks in the tactical pass among
  the operations' by id; its Notify Owner starting the raid (0x149980) the
  raid's tree ticks in the same walk.
- The report's plot is one of an improvement or a district, and a wonder's
  plot is a district (DISTRICT_WONDER, built or placed). runs/h1_duelw1121
  t31: the scout steps from 4:15 to 4:14 and sees China's complete wonder at
  5:12 (record plot district DISTRICT_WONDER, wonder complete), three from
  4:15, two from 4:14, seen by no other barbarian unit; its tree runs from
  t32 and the raid starts at t33. The engines take the plots of a city's
  wonders, built or queued (`barbScoutLook`; `_barb_scout_look` on the
  `city_wonder` registry); the action replay starts the tree there.
- THE LOOK'S MOMENT: the sight update of each step (0x58aa90) raises it,
  so a scout looks at each step it takes, in the order the moves are made,
  the other units where they stand then: the engines' step (`stepUnit`
  through `setBarbStepLook` in the barbarians' tactical pass; `_step_verb`
  for the barbarians' pool), a plot new against the scout's last look and
  seen by no other barbarian unit; the action replay along the record's
  steps.

## C-96 / C-97: the AI's weights and the modifier evaluator — READ (the parts below), the agendas' path and most analyzers unread

## C-96: the city-states' tactical pass — READ (Wander Near City, Heal, the non-barbarian priorities, FindAlternateLocation), the families it needs PARTLY READ

`cityStateTactics` / `freeCityTactics` in cpu/core/tactical.ts, `_minor_tactics` / `_free_tactics` in gpu/core/sim_tactics.py; the replay runs them on a copy (`minorAi`, `minorAi:move`).

- The lists (Tactics.xml): "Minor Civ Tactical" — Support Formation, Attack
  High Priority, Move to Safety, Attack Medium Priority, Attack Civilians,
  Promotion, Make Military Formation, Attack Low Priority, Heal, Chase
  Target, Wander Near City; "Minor Civ Homeland" — First Turn Settler, Move
  to Safety, Promotion, Builder Outside Ring, End Turn. The Free Cities
  (Expansion1_Leaders.xml "FreeCitiesTactics") — Attack High, Attack Medium,
  Move to Safety, Attack Low, Wander Near Camp; homeland End Turn. The move
  ids (0x5bbf80, each global the hash of the string loaded before its
  store): f2e128 Heal (0x779a70), f2e12c Make Military Formation (0x77a190),
  f2e164 Wander Near City (0x77bf50).
- WANDER NEAR CITY (0x77bf50): nothing for a player with no city ([+0x12f0]
  +0xc0, so a city-state's first turn, its Settler founding in the homeland
  pass after, wanders none: every minor's t1 rows are End Turn). For a
  player of a full civilization (0x469db0, CIVILIZATION_LEVEL_FULL_CIV)
  only DEFENDER units, round the unit's city (+0x11d0 through 0x36f660),
  the garrison test 0x5cdce0 first ("Garrison" rows, a draw over one plot);
  for anyone else every unit of AI type EXPLORE or above with Movement left
  (+0xdb0), round the player's first city (+0x158). Of its planning reach
  the plots of turn 1 within 5 of the city (0x1deb0), no unit at war with it
  (0x5862e0), none of its own stacking with it (0x585eb0); the weighted
  vector's weights (influence 0x716a60, the plot's owner +0x60, revealed
  0x2d2220) are never read: ONE "Random Direction" draw over the count, the
  move 0x962030 to the plot drawn ("Wander", "Move To" the plot). With none:
  FindAlternateLocation (0x585940) round the city within 3, moved to with
  flag 0x1000, else the skip 0x95eae0 ("Wander Back to City", "Move To" the
  city). The turn ends (0x56d6f0, 0x570b40). Confirmed: the turn's "Random
  Direction" draws pair one to one with the AI_Tactical.csv rows "Wander" and
  "Garrison", every player's in log order (1,199 of 1,199 turn-pairs of the
  five seeds), and a draw's range is the engine's candidate count on the
  rows the records pin (below).
- THE FREE CITIES' Wander Near Camp (0x77b9a0, C-95's reading): a unit with
  a group (+0x11d0 >= 0) whose camp the player's signals answer (0x771250 —
  for the barbarians their tribe's camp; for the Free Cities UNREAD, the
  engines read the unit's Free City, else the nearest: AUDIT C-60's ASK).
  Their logs hold 11 "Wander" rows (runs/h1_duelw1114 t124-127, 1130
  t152-154), each after the recording's last snapshot (t123, t151): no
  record pins them; 1123's eight are Attack Units.
- FIND ALTERNATE LOCATION (0x585940): over the game's axial steps (dx, dy),
  dx outer from -range to range, dy inner, the plot at the step within range
  (0x1e000: x - y//2 + dx, then back; the distance max(|dx|, |dy|) where the
  signs differ, |dx| + |dy| else); the unit may enter it (0x586360 flag
  0x40), the player revealed it, no other player's unit on it and none of
  its own that it may not stack with (0x9406e0); the nearest the target, a
  plot of another area (plot +8) counted three times as far; strictly nearer
  replaces.
- HEAL (0x779a70, its moves 0x7737c0): each unit (+0x770 clear) that has
  taken damage (+0xcf0 > 0), not embarked (0x8be30, IsEmbarked), on a plot of no
  danger (the influence map 0x716a90 <= 0) is queued ("Heal"); the queue's
  moves: a unit not of the sea domain (+0x650: 0 sea, 1 air, 2 land, the
  gossip strings GOSSIP_LAND/NAVAL_UNIT_LEVEL) holds its plot — fortify
  (0x95eae0) where 0x56ef30 allows, else sleep (0x9686d0); a hull outside
  its own territory heads for its player's nearest city (first of equals) —
  where 0x586360 (flag 0x10) allows it, PARTLY READ. The danger: "C-95: the
  danger map and Move to Safety".
- THE NON-BARBARIAN PRIORITIES (TacticalAI +0xa8 = 0x787000 for any player
  0x469ce0 refuses): over the target list, each FRIENDLY_CITY entry (a
  district of the player's own: its city centre too) and each ALLY_SUPPORT
  one (an ally's), in list order, makes each LOW or MEDIUM unit that
  threatens it — one with a ranged (0x56e3e0) or bombard (0x56daa0) strength
  within its range (0x56e3d0), any other nearer than twice its Movement
  (0x56e130) — HIGH for a FRIENDLY_CITY, MEDIUM for an ALLY_SUPPORT. The
  type ids (0x5bcb80, each global the hash loaded before its store): f2e198
  FRIENDLY_CITY ... f2e1bc LOW, f2e1c0 MEDIUM, f2e1c4 HIGH, f2e1c8
  ENEMY_IMPROVEMENT, f2e1cc SETTLE_LOCATION, f2e1d0 GOODY_HUT, f2e1d4
  ALLY_SUPPORT, f2e1d8 AIR_UNIT. The list's entries per plot owner (0x783980
  0x783ec5..0x7856a5): the player's own district FRIENDLY_CITY, an ally's
  (0x3da560) ALLY_SUPPORT, a player at war COMBAT/PASSIVE_DISTRICT, else
  NEUTRAL_CITY — each where the player's type flags (+0xb0) take it.
- THE PLANNING'S GROUND, beside the barbarians': the list (0x26d890) keeps
  the unit's own plot whatever holds it, LAB (a fit: every AI_Planning.csv
  row opens on the unit's plot; runs/h1_duelv1117 t115, city-state 3's
  Crossbowman on 41:13 lists 41:13(1/2) first, China's Trader on 41:13 by
  the turn's end — the replay holds the Trader there before the
  Crossbowman's turn) and another plot only where 0x586900 lets the unit end — another player's unit at
  peace it passes and never ends on (runs/h1_duelw1117 t52: city-state 2's
  Swordsman at (15,9) plans (14,11) in turn 1 past Rome's Scout on (15,10),
  which its list leaves out); a city-state's unit never takes a major's
  territory the major's Early Empire closes and no war opens (t32-37: its
  Warriors' lists leave China's (32,11), (33,10) out); a land unit whose
  player may embark it takes water (a turn starting on the domain's pool:
  0x26e920's [r9 + 0x180 + domain*4]); the barbarians' land units take none
  (0 of 6,269 of their AI_Planning.csv rows on 1117, 1121 and 1124 hold a
  water plot; the majors' and the minors' do from t62-69). The step's cost
  (0x26e920's rules 0x531660..0x530240): into a city at most
  CITY_MOVEMENT_COST 1 (0x531660 caps the step, 0x272ca0), no river
  crossing where either plot is a city's or water (0x531510); the embark
  rule 0x530420 (land to water) and the disembark 0x530240 waive
  MOVEMENT_EMBARK_COST where a district with FreeEmbark (Districts +0xe1
  bit 2, `dll_rowmap.py a5dfb0`: the City Center, the Harbor, the Cothon,
  the Royal Navy Dockyard) stands at the FROM plot, or at the TO plot — the
  completion (0x811b0) read off the FROM plot's district in both cases (t72:
  2's Swordsman embarking from (15,6) onto its complete Harbor (14,7) plans
  (1/0), the embarking paid; ported: `stepCost`, `_embark_waived`). Mathematics' MODIFIER_PLAYER_UNITS_ADJUST_SEA_
  MOVEMENT reaches a hull alone (t78: 2's embarked Swordsman plans on 2
  Movement with Mathematics).
- Measured (the action replay on 1117, 1121, 1124, 1127, 1128: each turn's
  pass on a copy, the units where the pair's first record holds them, the
  ground and research record t+1's, the "Random Direction" draws the log's):
  of 5,952 unit-turns the log names "Wander" the pass wanders 5,743 (the
  rest went first to an unported move earlier in the pass), 3,799 of the
  5,743 draws over the log's own range, 4,147 end on record t+1's plot; Heal
  253 of 354 by the same move, 252 end plots; Wander Back to City 54 of 61,
  28; Chase Target 29 of 287 (most of the game's chases follow its unported
  attacks), 101. On 1117 the planning rows the log holds for the wandering
  units (AI_Planning.csv, matched by turn, player, type and first plot) agree
  with the engines' turn-1 reach on 816 of 1,087; the rest are units that an
  unported move left or entered a plot before the draw (Attack Units, an
  operation), the embark quirk above and the record's ground between its
  snapshots. 1,925 unit-turns log no tactical row: the minors' operations.
- SUPPORT FORMATION (0x77ae80; `supportFormation` / `_tac_support_formation`):
  per unit of the pass's list (+0x240), alive. GetFormationClass (0x8bcd0 ->
  0xadd5e0, over the class's hash, ~CRC32 of its name): LAND_COMBAT 0,
  SUPPORT 1, CIVILIAN 2, NAVAL 3, AIR 4. One of class 1 (SUPPORT), in
  no formation (+0x1fb8 +0x738 1), with a planning (+0x1fc0), takes of its
  player's units (+0xd8) one alive on the map, in no job or the pass's
  (+0x7d0 -1 or +0x188), of its domain (+0x650), with Combat (0x56dc90),
  whose formation holds none of its class (0x266950): of those its
  planning reaches within two turns (0x791300) the strongest, else the
  nearest. One of the land domain (+0x650 2) with a planning takes a unit
  alive on the map, in no job (+0x7d0 -1), in no formation, whose AI row's
  pseudo-yield is PSEUDOYIELD_UNIT_SETTLER: the first reached, else the
  nearest unreached (a reached one replaces only a weaker one, an unreached
  one only a farther one while the pick's Combat is 0). Each pick is listed
  (+0x270: the unit, the other, the other's plot) and logged "Support
  Formation, <unit> (<id>), x y" (the other's plot); then the moves
  (0x773bd0, also called at 0x779d00): per entry the unit woken (0x53e20),
  sent to the plot (the move order 0x962030), on arrival the formation
  joined (the unit operation 0x94bb50 with the other's id) and the other's
  turn done (0x570b40); the unit's turn done and it leaves the list
  (0x77d180). The minors: runs/h1_duelw1105 city-state 3's five Warriors to
  its captured Settler at 5 15 (t34) and 3 15 (t64), none while the Settler
  stands in a formation; 1128 t251 city-state 3's Spec Ops to the Settler it
  holds from t251 (the Settler's turn done: no row until t252). A minor's
  pass walks its military units alone, so the support half finds none (1128
  t251: its Supply Convoy, alone beside the Spec Ops, ends its turn).
- Not ported (AUDIT C-96): Attack High/Medium/Low (C-95's prediction), Move to
  Safety (the influence map), Promotion
  0x77ac30, Attack Civilians' strike, the minors' operations (Naval
  Superiority, City Defense, Attack Barb Camp: AI_Operation.csv; their units
  log no tactical row), the embark waiver's quirk above, the planning's
  unrevealed plots.

## C-96 / C-97: the AI's yield weights and the modifier evaluator — READ (agendas' lists, the other analyzers unread)

The weight w[y] (0x702ad0, `this` the player's AI::GrandStrategic at player
+0x1290, its members named by the constructor 0x6f6e10) is the sum of five
24.8 parts; the yield value 0x7a6690 is amount x Yields.DefaultValue (Gold
0.5, the rest 1.0) x (1 + min(w, 9.0)), with no floor on w. A named member's
data sits at its descriptor + 0x58.

- AI::Religious m_yieldPriorityBoost (0x4681a0 -> GlobalAI +0x628 per
  player, data +0x340): Faith only. 0x74f5a0 each turn: 0; when a
  religious unit is wanted, -0.25 once the faith balance (player +0x1340
  +0x100) passes its faith cost and -0.25 more once the faith per turn
  (0x496fd0) passes half of it.
- AI::Economic m_yieldPriorityBoost (player +0x1288, data +0x528): Gold
  only. 0x687bf0 each turn: 0, or fx(-0.2) x the gold per turn (player
  +0x13a0 +0x1b8) while that is negative.
- The victory manager's Yields (GrandStrategic +0x508, inner +0xd8 = +0x638;
  0x7c05e0 dumps it as "Yields:"): a followed strategy's
  Strategy_YieldPriorities rows add fx(PercentageDelta x 0.01) (0x7bf160 on,
  0x7bb870 off). The install has no such row: 0.
- GrandStrategic +0x7a8 (rebuilt, not saved): the Yields list system
  (GlobalAI +0x2360, registered in 0x6dd9a0 with the retrieval 0x6e3fe0 ->
  +0x7a8). 0x6fece0 -> 0x6fde70 applies the leader's and the
  civilization's trait lists (AiLists LeaderType = one of their traits, a row
  kept when the player's handicap, player +0x908, is within its
  MinDifficulty..MaxDifficulty); 0x7bf160 -> 0x7ba440 adds a followed
  strategy's Strategy_Priorities lists to the same array, 0x7bb870 takes
  them off. A row adds fx(Value x 0.01) (0x6dd1b0; Favored false
  subtracts). A major: DefaultYieldBias (TRAIT_LEADER_MAJOR_CIV) Production
  +25, Gold +20, Science +10, Culture +10, Faith -25 (fx 64, 51, 25, 25,
  -64), the era strategies' lists (ClassicalYields ...), the victory
  strategies' (CultureVictoryYields ...). No city-state trait has a Yields
  list: 0.
- GrandStrategic m_yieldSensitivityBoost (data +0x6b0, default +0x6c8),
  each turn in 0x6fafc0 (0x6fbdf1..0x6fc771): for a yield whose sensitivity
  s = +0x788[y] (the YieldSensitivities system, GlobalAI +0x2508, over the
  same leader, civilization and strategy lists: ClassicalSensitivity Science
  10 ...) is > 0, over the player and every major it has met (0x483b50's
  list, 0x3daaf0) with x their yield per turn (0x4bf7c0 on player +0x1330):
  n, max, mean; n > 1, sd = sqrt(sum (x - mean)^2 / (n - 1)) > 0 and the
  player's x < max -> s x (max - x) / sd, else 0.
- So a city-state's w is 0 for every yield but Gold (the Economic part) and
  Faith (the Religious part); the 50 city-state Monument picks the exact
  annuity prints at v 1.0 ("C-96 / C-97: the city build AI" LAB) agree.
- The strategies (AI_Victories.csv logs each change): the era strategies
  (Strategies STRATEGY_<ERA>_CHANGES, condition "Is <Era>", "Is Not Major"
  disqualifying) start the AI turn the major first holds a technology or a
  civic of that era (every one of the 29 duels' majors: the turn the AI
  log's OWNED rows or Completed Civic first show the era) and none is ever
  stopped, so a major follows every era's up to its own; STRATEGY_DARKAGE
  ("Is In Dark Age"). The AI turn scores its policies before it updates its
  strategies: a strategy logged at turn t moves the scores from t + 1
  (1124 player 1: VICTORY_STRATEGY_SCIENCE_VICTORY at 6, its Great Scientist
  points card from 7; stopped at 26, back at 27).
- Measured on the logged scores (AI_GovtPolicies.csv): DefaultYieldBias and
  LowReligiousPreferenceYields (Faith -50) give 1124 Rome's (Trajan)
  Urban Planning 18 and God King 11 at 25 turns; China's (Qin, the same
  lists) God King 13 asks +0.2 Gold more — its hidden agenda's Yields list
  (MoneyGrubber), whose path into the array is unread.

THE PSEUDO-YIELD WEIGHT (0x700810, `this` the GrandStrategic too): the sum
of [player +0x12a0] +0x7e8 [p], +0x620 [p], the PseudoYields list system's
array (GlobalAI +0x2010, retrieval 0x6e3e20 -> +0x748, default +0x760) and
the +0x768 / +0x780 list, held at -1.0 at least (@0xd136f4); then a Great
Person class's pseudo-yield (pseudo index in [@0xf2e218, @0xf2e238]) adds
0x2c4230(player) [the record +0x6c of the 0x2c3660 manager's per-player
vector] valued as PSEUDOYIELD_GOLDENAGE_POINT through 0x7a60d0, and
PSEUDOYIELD_DISTRICT (@0xf2e274) adds 0.5 x Eras.ChronologyIndex (+0x1c,
`dll_rowmap.py a5f3b0`) of the player's era (0x467eb0: player +0x1358
+0xf8). The value 0x7a60d0: f = 1 + w, q = 0x655840; f q >= 0 -> f + q, else
+-0.1 (@0xd2f320, f's sign) where |q| > |f|, else f + q; the amount x (f x
DefaultValue). A followed strategy's lists go to the list system through
0x7bf160 -> 0x7ba440 (the list's SQL rows, each item's own
MinDifficulty / MaxDifficulty columns 6 / 7 against the handicap).
- Measured on the great person cards' logged scores (EFFECT_ADJUST_GREAT_PERSON_POINTS:
  PV(25) of the class's pseudo-yield): a strategy's PseudoYields row moves w
  by twice its Value x 0.01 — 1124 player 1's Great Scientist points +0.5
  under ScienceVictoryPseudoYields' +25, +1.2 under the Medieval and
  Renaissance +30 each with it, +3.1 with the Industrial rows (+20 and
  Expansion2's +50) as well, the Merchant's +0.4 under ClassicalPseudoYields'
  +20 — within a residue of about +0.015 (the golden-age term's share,
  unread). No trait's PseudoYields list moves them: China's Great Prophet
  points read 1.0 against LowReligiousPreferencePseudoYields' -75. An
  agenda's list moves them once: player 0 of runs/h1_duelw1110, 1112, 1115
  (CityStateAllyInfluencePreference, PSEUDOYIELD_INFLUENCE +25) reads
  Diplomatic League and Charismatic Leader at 1.25 (93 / 140 / 234, 18).
- PSEUDOYIELD_DISTRICT's era term: runs/h1_duelw1124 t2 minor 3's Astrology
  124.0 at 10 turns is its own 5, the Shrine's share, Stonehenge's at
  PSEUDOYIELD_WONDER and the Holy Site's at 1.5 x PSEUDOYIELD_DISTRICT (the
  Ancient era's ChronologyIndex 1); the research AI's minor rows within
  0.05 on 1124 247 -> 474.

THE REQUIREMENT SET of a modifier the AI analyses (0x6cef90 -> 0x6ccec0,
into the map at registry +0xc0, i.e. GlobalAI +0x4d0): RequirementSetType
TEST_ANY -> 1, TEST_NONE -> 2, else 0; per requirement its RequirementType
hash looked up in the registry's requirement list (+0x80, 66 names: the
`REGISTERED_REQUIREMENTS` of cpu/core/aiModifiers.ts) — a type the
registry lacks is left out of the set — the entry {evaluator object, its
parsed arguments (slot 0), Inverse (the requirement's vt +0x40)}. 0x6cf3c0:
per entry the evaluator's slot 1 on (subject, context), negated by Inverse;
type 0 fails on the first false, type 1 holds on the first true, type 2
fails on the first true; at the end type 1 fails, the others hold. Every
set a policy or a government names is in the map, so a subject passes only
by 0x6cf3c0. Read evaluators: REQUIREMENT_DISTRICT_TYPE_MATCHES 0x6d08c0 (the
district subject's type, context +0x78; else the district type the
evaluation is of, +0x1c), REQUIREMENT_CITY_HAS_BUILDING 0x6d3830 (a city
subject holding it; a wonder (Buildings +0x158 & 0x40) only when the
evaluation is of that city, context +0x10..+0x14),
REQUIREMENT_CITY_HAS_GARRISON_UNIT 0x6d4420 (a city subject whose population,
City +0x588, is at least 9 — no unit is read; every city-state's Retainers
line is first logged the turn its city grows to 9, runs/h1_duelw1117 / 1121 /
1124 / 1127 / 1128), REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS 0x6d4190 (a
city subject whose City_Districts count of finished districts counting toward the
limit, 0x1ae8f0, is at least Amount), REQUIREMENT_CITY_IS_OWNER_CAPITAL_CONTINENT
0x6cfd60 (the context's city, +0x70: an owner with no capital, 0x36f460,
holds; else the city's plot continent, +0x30, against the owner's
PlayerCities m_eHomeContinent, 0x467cd0 -> +0x160, named in the constructor
0x36a870; a city-state's one city on it, the Free Cities holding no
capital: no player lists Colonial Taxes in runs/h1_duelw1117 / 1121 / 1124 /
1127 / 1128). Colonial Offices, whose sets are the same inverse, is logged
16.0 for every city-state on every turn of those five runs (majors 4.0 a
city): the set refused, its subjects go to the analyzer's slot 2, which
EFFECT_ADJUST_CITY_GROWTH's 0x6beb00 does not hold here — ASK: the slot-2
analysis that pays it. The Monument's
MONUMENT_CULTURE_AT_FULL_LOYALTY's set (REQUIREMENT_CITY_HAS_FULL_LOYALTY, not
registered) is therefore empty and holds: what keeps it out of the city
build AI's v 1.0 is not its requirement (its COLLECTION_OWNER subject in a
building's analysis, unread).

THE ANALYZERS READ (the registry's slot 1; each adds its whole part to
context +0xc0; "span" is PV(horizon) - PV(start) by two 0x7a16e0 calls,
"between" 0x7a2140; "weighted" a yield through 0x7a6690 with the player,
"bare" without):
- COLLECTION_PLAYER_DISTRICTS holds a district under construction
  (runs/h1_duelw1124 player 1's Natural Philosophy 58 at t54, its one Campus
  not yet built).
- EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER 0x6addf0: a district subject; its
  yield 0x24b5a0 (0x249850: its own yields x (100 + its modifier) / 100;
  0x24aae0: its buildings') x Amount x 0.01f, bare, span (a city-state's Natural
  Philosophy 29 for one Campus of 2, runs/h1_duelw1124 player 4 t40).
- EFFECT_ADJUST_DISTRICT_YIELD_CHANGE 0x6acd00: a district subject; Amount
  bare, span.
- EFFECT_ADJUST_UNIT_FRIENDLY_TERRITORY_START_MOVEMENT 0x6ac440 (the
  registry's @f040b8; Amount +8): on the context's unit (+0x90, set per
  subject by COLLECTION_PLAYER_UNITS' walk) of Movement (0x56e130 above 0):
  fx(Amount) x the military AI's unit production value of its type (0x79ca90
  on player +0x1290 +0x268: the entry's +0x160, 0 for none) over fx(its
  Movement) (0x16e940), as Production (@f2f978) at the player's weight
  (0x7a6690), between the start and the horizon (0x7a2140), whole. Logistics
  on runs/h1_duelw1121's city-states, 30 rows of 0 -> 23 of 30 as logged.
- EFFECT_ADJUST_UNIT_SEA_MOVEMENT 0x6b85d0 (@f040f0; Amount +8): on the
  context's unit, a naval one (+0x650 0) of Movement: float(Amount) x
  (float(its current cost, 0x4f2b20) x 0.5f) / float(its Movement), to 24.8
  through floorf, as Production at the player's weight, discounted to the
  start (0x7a1240), whole. The research value adds the row's
  TechnologyModifiers analysed from landing (0x7b3e50 -> 0x7a4b20):
  Mathematics' MATHEMATICS_ADJUST_SEA_MOVEMENT, Ayutthaya's galleys
  (runs/h1_duelw1121 p3 t37-t63, Mathematics 1.0 / 2.0 / 3.0 / 5.0 under
  the log before it, its descendants alike).
- EFFECT_ADJUST_PLAYER_UNIT_UPGRADE_DISCOUNT_PERCENT 0x6bf850 (@f04120;
  Amount stored fx(Amount x 0.01f) by its parser 0x6bf3a0): over the
  player's units manager's list (player +0x12e8 +0xd8, a linked list by
  +0x10), per unit 0x58fff0(upgrade manager, unit, test-visible 1) — not a
  barbarian's (0x56ee80) and an upgrade type it may take (0x5909a0 ->
  0x5374c0) — the Amount x its upgrade's Gold (0x590520 << 8) as Gold at the
  player's weight, x 0.75 (@d1a188), whole. The list +0xd8 is the player's
  every unit (the standing army's walk 0x5ca7e0 and the trade count 0x7a7110
  read it alike). Not ported: on runs/h1_duelw1121 Hunza t76 the one unit
  whose upgrade is unlocked and reachable, its Horseman (to the Courser, 125
  Gold), reads whole(0.75 x 0.5 x 0.5 x 125) = 23 where the game lists 1.0,
  and Ayutthaya t78, with two Warriors (55) and a Swordsman (75) whose
  upgrades lack their Iron, 3.0 where none of ours counts — ASK: the Gold
  weight the analyzer's 0x7a6690 takes for a city-state, or the upgrade
  0x5374c0 names (its walk past the first rung unread).
- EFFECT_ADJUST_BUILDING_YIELD_CHANGE 0x6c5080 (args BuildingType +8,
  YieldType +0xc, Amount +0x10): a city subject; Amount weighted, x0.5 where
  the city lacks the building (0x18e9f0), span.
- EFFECT_ADJUST_BUILDING_YIELD_MODIFIERS_FOR_DISTRICT 0x6a1b80 (parser
  0x6a1700: Amount stored as fx(Amount x 0.01f)): a city subject with the
  district (context +0x78, else 0x1ae530 by DistrictType); per building of
  the district type (Districts +0x130 list, the first replacing district's
  where +0x200 names one) that is the player's version (player +0x12f0
  +0x230 [b] == b), the sum of its Building_YieldChanges of the yield x the
  amount, weighted, between, x0.5 where the city lacks it, each whole part
  added.
- EFFECT_ADJUST_TRADE_ROUTE_YIELD 0x6a3160 (parser 0x6a2f70: AffectOrigin
  default true +0x10, AffectDestination default false +0x11): the trade
  route capacity (PlayerTrade +0xf0, 0x4d9320; the CanTrain capacity test)
  x Amount, weighted; AffectOrigin: between; else AffectDestination with a
  named player (+0x40) half of it; with a named player the sum / the met
  list's count.
- EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL and _FOR_DOMESTIC
  0x6a49e0: the capacity x Amount, weighted, span.
- EFFECT_ADJUST_PLAYER_YIELD_CHANGE_PER_USED_INFLUENCE_TOKEN 0x6a9550 (a
  yield filter, context +0x64, -1 or the YieldType): the envoys placed
  (0x44a440) x Amount, weighted, between.
- EFFECT_ADJUST_PLAYER_YIELD_CHANGE_PER_TRIBUTARY 0x6ac7f0 (the same filter):
  the city-states it is suzerain of (0x44a5a0) x Amount, weighted, span.
- EFFECT_ADJUST_UNIT_MAINTENANCE_DISCOUNT 0x6b0840: over the player's units,
  min(Amount, Units.Maintenance +0x5c), bare Gold, span.
- EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN 0x6c4820: PSEUDOYIELD_DIPLOMATIC_FAVOR
  (@0xf2e204) of Amount with the player, span.
- The trees' modifiers (CivicModifiers, the civics AI's 0x7a4b20 term, not
  wired): EFFECT_GRANT_INFLUENCE_TOKEN 0x6a3780 READ (Amount x the player's
  points a token, Player_Influence +0x270, 30 without a player AI, as
  PSEUDOYIELD_INFLUENCE @0xf2e240 with the player, discounted from the start
  0x7a1240); EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS 0x6c2720 PARTLY (Amount x
  the governor AI's point value 0x6eeee0 -> 0x6ed2d0, unread, as
  PSEUDOYIELD_GOVERNOR @0xf2e214, discounted from the start);
  EFFECT_ADJUST_TRADE_ROUTE_CAPACITY 0x6c0ff0 PARTLY (the Trader's value
  0x7a7110 of Amount, start to horizon).
- PARTLY (their inputs unported): EFFECT_ADJUST_PLAYER_RESOURCE_ACCUMULATION_MODIFIER
  0x6b8930 (per resource, or the named one, the player's count of it 0x4aa790
  x Amount through the resource value 0x7a21e0),
  EFFECT_ADJUST_PLAYER_YIELD_MODIFIER_PER_TRIBUTARY 0x6adb20 (the player's
  yield per turn 0x4bf7c0 x Amount x the tributaries, weighted, between; the
  parser's scaling unread), EFFECT_ADJUST_CITY_TOURISM 0x6ac690 (a Great Work
  type's slots 0x18ddf0 and filled 0x18e0e0 in the city, PSEUDOYIELD_TOURISM,
  between).
- READ, EFFECT_ADJUST_BUILDING_PRODUCTION 0x6c1a80 (Limes, Veterancy; @f03c18,
  vtable 0xd638e0; its parser 0x6c1760: BuildingType +8, DistrictType +0xc,
  fx(Amount x 0.01f) +0x10; for a building its PrereqTech +0x18 (+0x220),
  PrereqCivic +0x1c (+0x210), PrereqDistrict +0x20 (+0x218),
  RequiresPlacement +0x14 (Buildings +0x159 bit 16), +0x15 its
  MaxWorldInstances (+0x40) reached by the world's copies (0x1e7b70); for
  a district its PrereqTech / PrereqCivic, +0x14 set): with the player and
  the context's city. The city lacking the building (City_Buildings
  0x18e9f0): none where +0x15, where its district is not the city's
  (0x1aec20), or where it needs a placement and CityBuildAI's 0x5d17b0
  finds none (ported as none: 0x5d17b0 unread, no Limes or Veterancy row
  needs it); R = the later of turnsToCompleteCivic 0x621920 and
  turnsToResearchTech 0x7610e0, none where start + R reaches the horizon;
  T0 / T1 = turnsToBuildBuilding 0x17b1e0 without and with the Amount;
  v = (T0 - T1) x Cost (+0x24) / max(1, T0 x T1); bare Production of
  PV(min(start + R + T1, horizon)) - PV(start + R), whole. The city holding
  the building, or none named: the DistrictType (none where the city holds
  it), T0 / T1 turnsToBuildDistrict 0x17b5a0 each at least 1, the cost the
  player's (0x4088a0), the same value — 0x17b5a0 takes the Amount by
  pointer (its fifth argument) and, where it is not 0, multiplies the
  Production by it (fx_mul_assign 0x16eb20, 0x17b807): Veterancy's 30 makes
  the Production 0.297 of itself, T1 above T0, the value below 0 (no
  Veterancy line in any recording's AI_GovtPolicies.csv, majors' or
  minors'; the building path's 0x17b1e0 adds its percent: Limes logs
  above 0). The 0x5d4650 call's result is not
  read. Port: `aiModifiers.ts` (`researchTurns`, `cityItemTurns`,
  `districtCost`, `buildingsBuilt`), `sim_policy.py`
  (`_pol_building_production`).
- READ, Discipline's EFFECT_ADJUST_UNIT_BARBARIAN_COMBAT 0x6bef40 (@f03c08,
  vtable 0xd63760; its parser 0x6bedb0 stores fx(expf(Amount x
  COMBAT_POWER_SCALING)) at +8, GlobalParameters +0x210, 0.04 under
  Expansion1's Replace: Discipline's 5 reads 1.2214, from the start to the
  horizon whole 17 — every minor's logged Discipline line is a multiple of
  17, runs/h1_duelw1117 / 1121 / 1124 / 1127 / 1128: 17 to 102, one per
  unit outnumbered). Over
  COLLECTION_PLAYER_UNITS (the context's unit +0x90), with the player
  (+0x80): a unit on a plot (0x90290) that fights (0x209dd0: GetCombat,
  GetRangedCombat or GetBombardCombat above 0); its knowledge base (player
  +0x12b8, 0x786160) summed over the game's barbarian players (0x483b50
  +0x29f0) of 0x5eb0f0(kb, barbarian, the unit plot's area +8, no region,
  10) against 0x5eb0f0(kb, its own player, ...); the barbarians' greater
  adds the Amount between start and horizon (0x7a2140). 0x5eb0f0(kb,
  player, &area, &region, maxAge): over the Units in order, the player's
  records of the type (0x5ef870: record +0x18 the area or +0x1c the region
  given, -1 for none — so a record on a plot of no region counts at any
  area), each of age (+0xc) at most maxAge adding the unit's max(Combat
  +0x48, RangedCombat +0x6c). The records' +0x18 / +0x1c are the plot's
  +8 (the CvArea, its id +0) and +0x18 (the region; 0x5e9530). Port:
  `aiModifiers.ts` (`COLLECTION_PLAYER_UNITS`, `knownStrength` on
  `Seat.armyKnown` aged at `armyAged`), `sim_policy.py`
  (`_pol_barbarian_combat` on `citystate_kb_*`); in a city's analysis
  the GPU walks no unit (its analyzers read nothing on a unit).
- READ, Agoge's EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION 0x6bc9e0 (EraType +8,
  UnitPromotionClass +0xc, Amount +0x10): with the context's city and an
  era, the city's owner in that era (GetEra); its strongest unit of the
  class (PlayerStats 0x4bcd30: over the Units in order, its own version —
  player +0x12e8 +0x1c0[i] = i —, not MustPurchase +0x1b9 bit 7, of the
  PromotionClass +0x288, PrereqTech +0x280 and PrereqCivic +0x270 held, the
  last of the greatest max(Combat, RangedCombat), from 0); the unit's era
  (Unit_Manager 0x940740: of its PrereqTech's and PrereqCivic's eras the
  later by ChronologyIndex, with neither the start era's ChronologyIndex
  returned as an Eras index — Classical for an Ancient start) at least the
  EraType's chronology; then fdiv(Combat +0x48, max(1, PlayerStats +0xf0)) x
  fdiv(CityBuildAI's Production 0x6c8dd0, max(1, Cost +0x4c)) x Amount /
  100 (0x51eb851f-style divide by 25600), as PSEUDOYIELD_UNIT_COMBAT at the
  owner's weight, from the start to the horizon, whole. Port:
  `aiModifiers.ts` (`unitEraIndex`, `bestUnitOfClass`), `sim_policy.py`
  (`_pol_best_of_class`).
- READ, Ilkum's EFFECT_ADJUST_UNIT_PRODUCTION 0x6b2350 (@f040d0, vtable
  0xd63100; its parser 0x6b1d00 stores UnitType +8 and fx(Amount x 0.01f)
  +0x10): with a player, per city of its list (+0x12f0 +0xd8; the context's
  city alone where it has one), v = the Amount x (CityBuildAI's Production
  +0x1008 x its expected count of the unit 0x5d4750), bare Production,
  PV(min(start + the train turns, horizon)) - PV(start) (PV(0) the turn's
  v), its whole part added. The train turns 0x17bb40(unit, 0, &extra): the
  city's Production (0x1cb9f0) x (the unit's production multiplier 0x17c1c0
  + extra), the cost (0x17bfa0) less the unit's progress (+0x230). The
  expected count 0x5d4750: 1.0 where the unit holds progress (0x17d1a0); 0
  where CanTrain (0x172820) refuses; else 0.2 x the most +0x160 of the
  city's listed contracts of the unit (CityBuildAI +0x3a8's data +0x400,
  contract +0x408 the unit, the vector of weak handles) + 0.5 (@d5aff0,
  @d20458). The base contract's constructor (0x5ff390) writes +0x160 0; its
  other writer is unread — LAB: read as 1 for a listed contract
  (runs/h1_duelw1117 Valletta's Ilkum 1 while its Builder contract 47 stays
  listed, t16-24, 0 with the list read empty). Port: `aiModifiers.ts`
  (`cityUnitTurns`, `cityUnitExpected`: `minorUnitTurns` /
  `minorUnitExpected`, `majorItemTurns` / `majorUnitExpected` — a major's
  and the Free Cities' contracts not read), `sim_cityvalue.py`
  (`_cv_unit_prod_value`), `sim_policy.py`. Measured (minor turns the game
  lists Ilkum): 1121 24 of 32, 1124 19 of 34, 1117 25 of 61 equal; the rest
  our contracts' or queues' divergence (1124 Cardiff t40-48 a Builder's
  kept 24 of 25 where the game built a Granary).
- READ, Bastions' two analyzers: EFFECT_ADJUST_CITY_OUTER_DEFENSE 0x6c4650
  (the registry's object @f03cf0, vtable 0xd63a18 slot 1): with arguments
  and the context's city, its centre's outer damage (0x24ae50 on 0x6da56a3d:
  district +0x8d8) below its outer maximum (0x24b290 -> City +0x1880,
  0x198310) adds Amount raw. EFFECT_ADJUST_CITY_RANGED_STRIKE 0x6a69c0
  (@f03d20, vtable 0xd62ad0): the centre's strike 0x249ee0, its whole part
  above 0, x Amount / 100 truncated (0x51eb851f), raw. The outer maximum
  0x198310: the Free Cities (0x469d40: civilization level 0x4e6b0a0,
  CIVILIZATION_LEVEL_FREE_CITIES) a table's row (0x276310 / 0x276370, +0x1c);
  any other player its +0x12f0 +0xf4 where above 0, else the sum of its
  buildings' OuterDefenseHitPoints (+0x58 where +0x54); then + City +0x14, at
  least 0. A city-state's centre stands as any other's, on its walls' pool:
  every city-state's Bastions line is first logged the turn its walls
  complete (the fifteen city-states of runs/h1_duelw1117 / 1121 / 1124 /
  1127 / 1128: 1121 Hunza t40, Ayutthaya t58, Antioch t47; 1124 Granada t70;
  before, its civic listed, none), as in combat a wall-less city-state's
  centre has no outer pool (CombatLog: 1117 t13 a Warrior's 18 on Valletta,
  1116 t8-9, 1127 t22-25 whole damage); ASK: player +0x12f0 +0xf4's writer.
  Port: `aiModifiers.ts` (`cityOuterStands`, `cityStrike`), `sim_policy.py`.
- READ, the policy Amenity and Housing (Civil Prestige, Retainers, Robber
  Barons, Monarchy's walls, Collectivism, Digital Democracy):
  EFFECT_ADJUST_POLICY_AMENITY 0x6b45a0: with arguments and the context's
  city (+0x70, which COLLECTION_PLAYER_CITIES' walk sets per subject), its
  whole part of 0x79f7c0(player +0x80, city, Amount +8, the rate +0xbc, start
  +0xb4, horizon +0xb8). EFFECT_ADJUST_POLICY_HOUSING 0x6b5eb0: with the
  context's city, the whole part of 0x7a3d70(CityBuildAI, the city's growth
  +0x1788, the rate, the population +0x588, Amount > 0 (`setg`: one Housing,
  the Amount itself not passed), start, horizon). 0x79f7c0(out, player, city,
  n, &rate, start, horizon) with n Amenities: the balance (GetAmenities less
  the need of +0x588, 0x5275a0), its level (0x527850) and that of balance + n;
  one level: PSEUDOYIELD_HAPPINESS of n; else PSEUDOYIELD_HAPPINESS of the
  levels' difference plus, per yield but Food (@f2f974), CityBuildAI's yield
  (+0x1028's vector +0x1080, filled per yield by 0x5cc510 from 0x1c64d0's
  attribute) x (after + 100) / (before + 100) - 1, the level's percent being
  0x527b40: the Happinesses row's NonFoodYieldModifier (+0x3c, its flag
  +0x38; the loader 0xac62c0) plus the city's own per-level rows (+0x11d8,
  0x1cb0f0), at the player's weight, the total at least n; then, n > 0 and the
  balance below 0, PSEUDOYIELD_GOLDENAGE_POINT of -(GlobalParameters +0x6b4
  THRESHOLD_SHIFT_PER_MISSING_AMENITY x the balance) (0 under Expansion1/2's
  Replace), n < 0 and the balance at most 0 the same subtracted; from start to
  horizon (0x7a2140). Port: `aiModifiers.ts` / `amenityPerTurn`,
  `sim_policy.py`. Logged (runs/h1_duelw1121, 1124, 1127, 1128 minors' Civil
  Prestige): every city staying in its level reads 14, PSEUDOYIELD_HAPPINESS
  of 1; the Housing term matches (1124 Cardiff t55-57: 23, 24, 24); a city
  changing level reads more than the reading gives (1121 Hunza t45 62 against
  42, t48 66 against 47; 1124 Bologna t61 60 against 50; 1128 Bologna t70 55
  against 39), as if a Food term of about 0.8 x its Food stood beside the
  others — ASK: CityBuildAI +0x1080's yields (0x1c64d0's attribute and its
  Value flag) unread.
- The registry (`reg.py` over 0x6c9640): 211 effect names, 27 collections, 66
  requirements; the effects the policies and governments name, ranked by the
  score lines they miss, with their analyzers and whether they reach
  CityBuildAI (0xa5c20): `.claude` analysis `anlist.py` / `ancalls.py`.

The modifier evaluator's GPU twin (`gpu/core/sim_cityvalue.py`, the
analyzers, evaluators and collections the buildings' and projects' rows
carry; a row with a TS read it lacks is refused at the tables' build) pins
the TS values of the 46 such rows (tests/gpu/city_value_test.py,
tests/cpu/minors/modifier-value.test.ts), and the minors' tables and pick
off the sim's own state equal the TS's on seed9001
(tests/cpu/minors/minor-tables.test.ts).

The modifier evaluator: a building's BuildingModifiers are analysed once,
at GlobalAI's start (0x6dfc70 -> 0x6cef90 into GlobalAI +0x3948[building]):
each entry holds an effect analyzer and a collection iterator found by the
EffectType / CollectionType hash in the registry 0x6c9640
(EFFECT_ADJUST_CITY_YIELD_CHANGE -> object 0xf03d80, vtable 0xd63400;
COLLECTION_OWNER ...), the requirement set and the arguments. 0x6cede0 runs
one over at most 51 subjects: a subject whose requirements hold (0x6cf3c0)
goes to the analyzer's slot 1, none to slot 2; nesting stops at depth 4.
The context (0x6ccd50, filled in 0x7a7590) carries T (+0xb4), H (+0xb8),
the rate as a float (+0xbc), the city and the player; 0x7a4b20 adds, per
modifier, the analyzer's whole-number sum (+0xc0, clamped to +-0x7fffff),
or that count x Yields.DefaultValue when the analysis named a yield (+0x64).
An EffectType the registry lacks adds nothing — EFFECT_ADJUST_CITY_IDENTITY_PER_TURN
(the Monument's MONUMENT_LOYALTY). EFFECT_ADJUST_CITY_YIELD_CHANGE (0x6b8ba0):
per subject, trunc(PV(H) - PV(T)) of yieldValue(Amount, YieldType) (0x7a2140;
0x7a1240 when T = H). The Monument's MONUMENT_CULTURE_AT_FULL_LOYALTY
(REQUIREMENT_CITY_HAS_FULL_LOYALTY, COLLECTION_OWNER) would add about the
building's own term again; the city-state picks at v 1.0 leave no room for
it, so its requirement fails in the analysis (0x6cf3c0's evaluation of it
unread). The other analyzers (EFFECT_ADJUST_CITY_YIELD_MODIFIER 0xd63490
...) are unread.

## C-97: the government and policy choice — the choice READ, the values PARTLY READ

The policy AI (the player AI's civics part, the object 0x620110 runs on;
its log AI_GovtPolicies.csv). Check: `dll_govtpolicies.py` (the choice on
the logged scores). The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents).

- The lists. Civics at +0x978 (0x50 each: +0x14 score, +0x18 turns; the
  "Civic" lines, logged while turns >= 0); policies at +0x9e8 in DATABASE
  ORDER (0x50 each, filled by 0x624060: +0x28 the policy, +0x2c its slot
  type, +0x30 / +0x31 Policies_XP1 RequiresDarkAge / RequiresGoldenAge,
  +0x34 / +0x38 the era bounds, +0x48 the score); 0x6255f0 logs every
  score above 0 ("Policies"). Every logged list of the 29 duels runs in the
  install's row order (`tools/install/ai_tables.py`: 515,913 lines, 0 out of
  order).
- The policy job (0x621eb0): score -1.0; a card that is not a Dark Age
  card needs its PrereqCivic held (0x39d1f0) or on the civic list with a
  score above 0 (+0x978 [civic] +0x14, as the analysis job left it — its own
  value, the turn's propagation not yet run: runs/h1_duelw1121's city-states
  log Charismatic Leader from the turn after Political Philosophy comes
  within the horizon, nothing at t1); a Dark Age / Golden Age card needs
  the age (0x412880 / 0x412910); the game era (the player's era object
  +0x158 -> Eras +0x1c) inside the window; then the value 0x7b26b0(policy,
  the rate 0x6fec30 = GlobalAI +0x290, start 0, horizon `m_valueHorizons[0]`
  via 0x5d2bc0, the player, the card's modifier list +0xb80 [policy]).
- The value (0x7b26b0): FX_MIN when start >= horizon or the card is
  obsolete (0x39e050: an ObsoletePolicies row whose ObsoletePolicy is
  unlocked, 0x39e1e0, or whose RequiresAvailableGreatPersonClass the
  player cannot earn, 0x2f1ed0: its civilization level's CanEarnGreatPeople
  (0x43a980; a city-state's and the Free Cities' levels lack it — no
  city-state of the five duels logs Inspiration, Revelation, Strategos,
  Literary Tradition or Navigation), a civilization or leader trait barring
  the class, or no person left); 250.0 for a Dark Age card in a Dark Age or a
  Golden Age card in a Golden Age; plus the modifiers' sum 0x7a4b20.
- The modifiers' sum (0x7a4b20): per modifier (0x40 bytes: the effect's
  analyzer, the collection, the requirement set's key +0x10, the parsed
  arguments +0x38) the analysis 0x6cede0 into a context (0x142650 copies
  the evaluation's: +0xb4 start, +0xb8 horizon, +0xbc rate, +0x70 the city
  subject, +0x80 the player AI, +0x90 the unit; +0xc0 the whole-number
  value); a context whose +0x64 names a yield adds value x
  Yields.DefaultValue, any other min(value, 0x7fffff) << 8.
- The analysis (0x6cede0): a fourth nested analysis refused ("Nested
  attach modifiers. AI will not analyze"); the collection's iterator (vt [0]
  first, +8 next) over at most 51 subjects; a subject passes when its
  requirement set is not in GlobalAI +0x4d0 or 0x6cf3c0 admits it; the
  effect's analyzer (vt +8) per subject; none passing calls vt +0x10; an
  entry with no analyzer or no collection is skipped, worth 0. The
  analyzers are registered by name in 0x6c9640 (238 effects; collections;
  66 requirements), each a static object (0xf03xxx) whose vtable holds
  them: the policies and governments name 65 registered effects (396
  modifiers) and 26 that are not (75 modifiers, Expansion2's
  EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE and the trade route modifiers among
  them), worth 0 to the AI. Read (each adds the whole part, `sar 8`):
  EFFECT_ADJUST_CITY_YIELD_CHANGE 0x6b8ba0 (a city subject; the yield at the
  player's weight, 0x7a6690; PV(horizon) - PV(start), 0x7a2140);
  EFFECT_ADJUST_CITY_YIELD_MODIFIER 0x6b9d90 (min(City::GetYield 0x1cb8b0,
  100) x the percent x 0.01f, weighted, the same span);
  EFFECT_ADJUST_PLAYER_YIELD_CHANGE 0x6a7d70 (unweighted, no player passed);
  EFFECT_ADJUST_GREAT_PERSON_POINTS 0x6a0b10 (the class's pseudo-yield,
  PV(horizon) alone); EFFECT_ADJUST_INFLUENCE_POINTS_PER_TURN 0x6ae510
  (PSEUDOYIELD_INFLUENCE, PV(horizon) - PV(start));
  EFFECT_ADJUST_DUPLICATE_FIRST_INFLUENCE_TOKEN 0x6afcd0 (a player that may
  give Influence, 0x449940, its civilization level's flag byte +0x28 bit 6:
  a full civilization's — no city-state logs Diplomatic League —, the Game +0x3f8 +0x1650 list's count x
  Player_Influence +0x270 x the amount as PSEUDOYIELD_INFLUENCE, 0x7a1240
  from the start; +0x270 is the government's InfluencePointsThreshold at
  the speed, added on adoption 0x44eaa0). PARTLY: Discipline's 0x6bef40 (a
  combat unit; the barbarians' units the AI knows within 10 of it, 0x5eb0f0
  over the barbarian list, against its own: the amount from the start to
  the horizon when they outnumber), the unit-tag production 0x6bc9e0 (the
  military AI's unit of the class 0x4bcd30, CityBuildAI's production
  0x6c8dd0, PSEUDOYIELD_UNIT_COMBAT), the policy amenity 0x6b45a0 and
  housing 0x6b5eb0 (C-96's evaluator 0x79f7c0 / 0x7a3d70), the ability grant
  0x6b5b30 (the ability's own modifiers analyzed in a copy of the context,
  their values summed).
- The yield's value (0x7a6690) carries the player's weight w[y] (0x702ad0;
  its five parts in "C-96 / C-97: the AI's weights and the modifier
  evaluator"); the pseudo-yield's (0x7a60d0) the pseudo-yield weight
  (0x700810, the same section).
- The pseudo-yield's value (0x7a60d0): amount x PseudoYields.DefaultValue x
  ((1 + w) + q): w = 0x700810 (GrandStrategic +0x7e8, written by 0x6fff90's
  handlers; PlayerAI +0x620; the +0x748 / +0x760 and +0x768 / +0x780 lists;
  at least -1.0, @0xd136f4; a Great Person class adds the golden-age points
  its person earns, 0x2c4230, valued as PSEUDOYIELD_GOLDENAGE_POINT; the
  DISTRICT one a term of the player's districts), q = 0x655840 (0 but for
  PSEUDOYIELD_DIPLOMATIC_BONUS toward a named player: +0x2f58 [player]
  +0x14); when q and 1 + w differ in sign and |q| > |1 + w|, the factor is
  +-0.1 (@0xd2f320).
- The choice (0x625d70; on the completed-civic event 0x6293e0 with the
  civic, and from the AI turn 0x620110 with -1 when +0x758 is set): on a
  civic, logged "Completed Civic", and when no card scores 0 or more it
  requests the next turn (+0x700 -> +0x758) and returns. The government:
  every one CanChangeGovernment admits (0x392cb0: unlocked 0x39df60, not
  the current) and the current, in order, valued by 0x7b0330 to
  valueHorizons[0]; the first strictly highest; a different one is
  commanded (civics command 1, 0x44bb0; the slot rebuild follows, "C-94:
  the slot rebuild") and logged. Then each slot of the government in order
  (0x399690 the count, 0x399ab0 the card): the bar is its card's score
  (-1.0 with none, or for an obsolete card, dropped); each policy in order
  scoring above the bar that CanSlot admits (0x393400: not banned +0x890,
  not slotted +0x820, valid under the government 0x3930a0 — the exclusive
  cards of Policy_GovernmentExclusives_XP2 only in theirs —, the slot's type
  or AllowsAnyPolicy) and is not obsolete raises the bar; a best other than
  the card is commanded (type 0); every slot is logged "Slot Policy" with
  its card and its score's whole part.
- The best score per slot type (0x620110, the array +0x5b8 / +0x610): over
  the policy list, the first strictly highest of the type (any card for an
  AllowsAnyPolicy type); a card of another type stands while none of the
  type has come.
- The government's value (0x7b0330): FX_MIN when start >= horizon, or for
  one held before (PlayerCulture +0x350 [government] != 0, 0x399260) that
  is not the current; per Government_SlotCounts row, the type's best / 10
  (x 0x6666666666666667 >> 74) divided by the slot's place (i + 1; an
  AllowsAnyPolicy type 1, 1, 2, 3, 3...); plus Governments_XP2 Favor as
  PSEUDOYIELD_DIPLOMATIC_FAVOR, PV(horizon) - PV(start); plus a golden-age
  term of amount 0; plus its modifiers (+0xb68 [government]) by 0x7a4b20.
  No government is ever returned to in the 29 duels (142 changes).
- THE HORIZON AND THE RATE: valueHorizons[0] as the filler writes it
  (0x6dd9a0 -> 0x5254d0 -> 0x525400, GameSpeeds +0x28 CostMultiplier):
  speed(50) = 25 at Online, at the GlobalAI's rate 4.0 (AI_DISCOUNT_RATE x
  100 / CostMultiplier, "H-1: the civics AI"). Diplomatic League's 75 / 112
  / 150 / 187 is 3 x the token (50 / 75 / 100 / 125: the governments' 100 /
  150 / 200 / 250 at the speed) x 0.5 exactly, so the Influence factor is 1;
  Charismatic Leader's 14, Literary Tradition's 15 (+2 Writer points), a
  city-state's Urban Planning 14 and God King 21 are their weight-0 values
  at 25 turns and 4.0 (the 29 duels' city-states: 11,038 of 11,038 and 5,862
  of 6,102 lines, the rest above it, a weight above 0). Player 0 of
  runs/h1_duelw1110, 1112 and 1115 reads Diplomatic League 93 / 140 / 234
  and Charismatic Leader 18: its agenda's Influence row at 1.25 (the
  pseudo-yield weight above).
- Confirming cases: the choice on the game's own scores (`dll_govtpolicies.py`,
  29 duels): on the scores the AI's turn before logged, 1,170 of 1,284
  completed civics whole (on the event turn's own 647), 6,589 / 6,734 slot lines
  (81 more set aside: a slot count the government's rows do not give, a
  wonder's); the misses are nearly all the log's military card (Levee en
  Masse 29, Logistics 16, Force Modernization 12) where the check fills a
  Wildcard, the wonders' slots the check lays as the government's rows.
  The port in the action replay (29 duels, the AI major's 1,114 completed
  civics, the engine's state): on the game's logged scores the government
  as the log's 803 (the government's modifiers' analyzers unread), its cards
  4,202 / 5,919, whole 350; on its own scores (the weights, the pseudo-yield
  weight, the requirement sets and the analyzers of "C-96 / C-97: the AI's
  weights") the government 919, the cards 1,221, whole 86; score lines equal
  35,229 / 215,850 (with every weight 0 and six analyzers: 12,393 / 209,166,
  the government 997, the cards 1,262, whole 76). The choices fall where the
  values are partial: the unread analyzers (the military production cards,
  the amenity and housing cards) score 0 beside cards now valued in full.
- Unread: the agendas' path into the weights (and the agenda draw, RandCalls
  "Choose random agenda"), the golden-age term of a Great Person class's
  pseudo-yield weight, the writers of 0x700810's +0x7e8 / +0x620 arrays, the
  analyzers the section above leaves out or PARTLY reads, the requirement
  evaluators but DISTRICT_TYPE_MATCHES and CITY_HAS_BUILDING, the civic
  list's jobs (0x61ee30), 0x3930a0 itself, the Great Person class
  availability 0x2f1ed0 (Strategos scores in the port where the game logs
  none: 4,739 lines).

## C-97: the majors' opinion — the agendas and the first impression READ, the modifiers PARTLY READ

The opinion one major holds of another is its diplomatic modifiers' values
summed (24.8 fixed point, the log's number the sum >> 8): AI_Diplomacy.csv
(the writer 0x652bb0: per player and per player it has met, in player
order, "opinion:state" from +0x330 / +0x2f58 of the player's diplomacy, and
"Threat and Trust" as threat:n:trust from +0x6560 / 0x650550 / +0x6480,
24.8). The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents).

- The set-up draws ("Random Diplomatic Value", the diplomacy object's
  constructor 0x3ffdd0): every player slot in use, in player order, draws
  one value over 100 toward each of the 64 slots, twice — the second pass
  (the object rebuilt) is the one kept (+0x7bc[slot]). 896 draws = 7 slots
  x 2 x 64 in every duel; player 0's value toward 1 is draw 65, player 1's
  toward 0 draw 192 (both monotone with the logged first impression over
  all 26 meetings of each).
- The first impression (MODIFIER_PLAYER_DIPLOMACY_RANDOM, init 0xb8edb0:
  RandomRange 3, DifficultyOffset 0): floor(v x (2R + 1) / 100) - R at the
  meeting (v 13 -> -3, 15 -> -2, 33 -> -1, 58 -> 1, 72 -> 2, 86 -> 3; 0
  makes none), decaying 1 per ReductionTurns (10) of the owner's turn
  starts. The clock counts the owner's first start after the meeting: a
  meeting made in an earlier player's turn reduces at m + 9 (runs/h1_duelw1110
  Qin: met in Rome's turn 45, -1 -> 0 at 54), one in the owner's own or a
  later player's turn at m + 10 (1110 Rome 46 -> 55; 1117: met in a
  city-state's turn 161, both at 171). Every requirement-driven modifier with
  ReductionTurns decays on the same clock from its failure (STANDARD_
  DIPLOMATIC_NEAR_BORDER_WARNING: the AI's own -1 at d + 9, the human
  slot's at d + 10, every case of the 29 duels).
- The agendas (Game_Initializer 0x31d3c0; the civic's 0x31f7f0 / 0x427bf0):
  each major's HistoricalAgendas, then RandomAgendasInEra's Ancient draw at
  set-up, then RandomAgendasForCivic's at Nationalism. The pool walks the
  draw's tags in their table's order (EARLY then ANY at set-up, LATE then
  ANY at Nationalism) and within a tag the Agendas table's order; one
  uniform draw over it ("Choose random agenda"); an agenda exclusive with
  one the major holds is drawn again over the same pool. Read off the 29
  duels' 63 draws: every logged range (20 at set-up, 29 or 28 at the civic)
  and every agenda the modifiers reveal agree (the set-up pool's index 1
  Civilized, 2 Devout, 3 Explorer, 5 Exploitative ... 19 Great White Fleet;
  the civic pool's 3 Environmentalist, 4 Ideologue, 5 Nuke Lover ... 28
  Great White Fleet). The civic pool leaves out an agenda every major holds
  (28: runs/h1_duelw1112 and 1121, both majors on one agenda); the port
  reads that as a default GameLimit of the majors' count — ASK.
- Optimus Princeps (EFFECT_DIPLOMACY_AGENDA_OPTIMUS_PRINCEPS: compute
  0xb4d2b0, arguments 0xb50250): the subject's plots (0x4be720, the plots it
  owns) against the owner's beyond EquivalentTerritoryPercentage (20) either
  way, BetterTerritoryBonus (5) up or down; its rank by plots among the
  majors (0x469db0: FULL_CIV), TopTerritoryBonus (8) inside the top
  TopTerritoryPercentage (25) and against it from 1 - 25 % of the count.
  Two majors: +5, 0, -8, -13 (1114 Trajan of Qin: -8 at 27, 0 at 32, +5 at
  36).
- TRADE_RELATIONS (0xbb1a20, arguments 0xbb40f0): TradeBonus (2) for a
  route either way, BonusPerRoute and OnlyInboundTrade off, NoTradePenalty 0.
- The Delegation's +3 (STANDARD_DIPLOMATIC_DELEGATION) ends when the same
  sender's Resident Embassy (+5) arrives (runs/h1_duelw1110: Rome's opinion
  of Qin 20 -> 4 at 99, Qin's Delegation of 56 and Embassy of 98).
- The requirements read: PLAYER_YIELD_LEAD (0xb6ff10: both values at or
  below 0 fail; |owner - subject| >> 8 at least MinimumDelta; a positive
  ratio asks subject >= owner x ratio, a negative one owner >= subject x
  |ratio|, the ratio truncated to 1/256), the population, wonder and great
  person leads read as the same test; COMPETING_MINORS (0xb61120: a
  city-state with the owner's envoys and more of the subject's than
  PercentCompeting of them), NOT_COMPETING_MINORS (0xb32500: no city-state
  holding envoys of both).
- MILITARY_STRENGTH_LEAD (0xb548f0): the same lead test on the player
  stats' per-domain strength (0x4bd0d0: LAND +0x330, SEA +0x270, AIR
  +0x2d0), the ratio a float; the field's writer is unread — the port counts
  the seat's military units of the domain (runs/h1_duelw1104: Rome 43+ land
  units to Qin's 8, Trajan's Standing Army -6 at 106 = the meeting + 30).
- NEW_WARMONGER (0xb7eee0, arguments 0xb81dd0): the owner's grievances
  against the subject (0x3d8d20), -PercentOfGrievances (20) % of them, no
  lower than LowerLimit (-60): the logged -30 after each surprise war, -60 in
  runs/h1_duelw1110. The records carry no grievances: the record lane holds 0.
- SETTLED_CITIES (0xb96bf0, arguments 0xb986e0 Penalty / IncludesCapital):
  -Penalty times the owner's ledger count of the subject's incidents of kind
  0xfadf5055 (0x3d8da0) — the logged -3 / -6 / 0; the ledger's writer and
  expiry are unread.
- FORCE_INCURSION (0xc00500): the owner's military AI's two thresholds
  (+0x1280's slots +0x40 / +0x48) against its count for the subject
  (+0x12a0 +0x588): 0 below half the first, -1, -2, then -4 / -3 — the
  count and the thresholds unread.
- When the game evaluates a requirement-driven modifier is not a turn
  start: runs/h1_duelw1110 Rome's City-State Ally holds +12 (not competing)
  from 55 to 66 although both hold envoys in Caguana from 58; it flips with
  Qin's envoys of 66 (the subject's influence event). The port evaluates at
  each owner's turn start — the trigger list is unread.
- The diplomatic state (the row's DIPLO_STATE): DiplomaticStateTransitions'
  Require bounds force a change, the Allow band leaves it to the AI. Over
  the 29 duels the autoplayed slot turns Friendly at 15 and back to Neutral
  at 5 (oscillating at 5 against Unfriendly every turn), while Qin turns
  Friendly from Neutral at opinions down to -2 (30 times) — the AI's pick in
  the band, read in "C-97: the majors' diplomatic actions".
- THE VERBOSE LOG (runs/h1_duelv1124, the same game as h1_duelw1124 with
  the AI's diplomatic action log on): AI_Diplomacy.csv adds, per turn,
  player and DiplomaticActionType, "desire:cost" toward each player met
  (0x676510's evaluator: +0x48 the desires, +0x68 the costs; beside them
  Alliance +0x18, War +0x1c, War Penalty +0x20). Qin toward Rome: each is
  the state's DiplomaticStateActions Worth / Cost plus T on the desire and
  minus T on the cost, plus one shift G on both: T 0 at the meeting (89), 10
  from 90, 20 once Friendly (108); G per action (Embassy -23.7 / -13.7 /
  -36.8, Delegation -9.5 / 0.5 / -8.7 as the game runs). The Embassy went at
  106 (Diplomatic Service at 103) with desire 11.3 over cost -18.7; the
  Delegation stood at 15.5 over -9.5 from 99 and was never sent — the pick
  is not the margin alone. The terms and the pick: "C-97: the majors'
  diplomatic actions".
- THE ATTEMPTS (the five verbose duels, runs/h1_duelv1124 and h1_duelv1117 /
  1121 / 1127 / 1128): an action's entry reads 0.0:0.0 on the turns the AI
  takes it, and DiplomacySummary.csv names only the ones the other side
  accepted. Qin proposes and the autoplayed slot turns it down until it
  does not: the Embassy 171, 181, 190, 197 (1117, accepted 197), 117, 127,
  132 ... 186, 191 (1127, 13 tries, accepted 191); the Delegation 61, 68, 79
  (1127), 83, 89, 97 (1128). Retries come 5 to 11 turns apart. So a
  recorded mission's turn is the receiver's acceptance, and the proposer's
  choice is measured by the attempt turns: the Delegation tried at once
  after the meeting (1127 t61), the Embassy once Diplomatic Service is held
  (1127: held from 118, first try 117 at the civic's completion; 1124: 106,
  held from 103; 1117: held from 95, met 161, first try 171). The
  receiver's answer and the can-do: "C-97: the majors' diplomatic actions".
- Open (AUDIT C-97 BUILD): FORCE_INCURSION's count and thresholds, NEAR_CULTURE_BORDER, SETTLED_CITIES' ledger, GOVERNMENTS, PEACEFUL, the third-party, pledge, espionage, archaeology and one-sided-trade modifiers, the other agendas' own effects (Last Viking King, Zealot, Turtler, Lord of Mines, Kaitiakitanga, Exploitative, Flat Earther, Paranoid), the event triggers of requirement-driven modifiers, a meeting between two players' turns (1104 t76), threat, and ("C-97: the majors' diplomatic actions") the evaluator's unread terms and the decisions themselves as per-seat actions (delegation, embassy, open borders, friendship, denouncement, war, peace, deals). Not engine facts: the majors' meeting, the Delegation and Embassy as two missions (the replay takes both from the logs), the game's grievances (absent from the records). ASK: the agenda pool's default GameLimit (read as every major).

## C-97: the settle site evaluation — READ (the score, the choices), PARTLY READ (the danger, the plot yield)

AI::GrandStrategic (GrandStrategic.cpp, the player AI's +0x1290) and
SiteEvaluator. The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents). Its logs: AI_Operation.csv, AI_Planning.csv and, on the verbose re-recording
runs/h1_duelv1124 (`h1_duelv1124_20261010T215402Z`), AI_SiteEval.csv: every
region's plots with their scores, per turn and player.

- The lists (the generic list loader 0x6d6c80, system "PlotEvaluations",
  its item handler 0x6dd310): the AiFavoredItems rows of the lists AiLists
  binds to a trait of the leader's chain (LeaderTraits through
  Leaders.InheritFrom: StandardSettlePlot on TRAIT_LEADER_MAJOR_CIV), of its
  civilization, of its historical agenda, and of each strategy the AI
  follows (Strategy_Priorities: STRATEGY_NAVAL's NavalSettlementPreferences,
  STRATEGY_RAPID_EXPANSION's ExpansionSettlementPreferences). One entry per
  PlotEvalConditions row (by its Value; Expansion2 adds 11 Cultural
  Pressure); a row's Value adds to the entry's threshold where Favored, else
  to its value, and a keyed row (StringVal) also to its yield, resource,
  feature or resource class weight (0x76cee0). A natural wonder row adds its
  value to ITS OWN feature once per natural wonder in the database (the loop
  over the features indexes the row's feature, [r15+0x14], not the loop's):
  FEATURE_DEAD_SEA weighs 6 x the natural wonders, the other wonders nothing
  — the install's "HACK NOTE" does not happen (runs/h1_duelv1124 t40: the
  plots within 2 of the Matterhorn score as without it).
- The evaluation (0x6fd1d0, its ring callback 0x6f93a0 over the plots
  within 5, 0x6b000): invalid where the player has not revealed the plot or
  may not found there (0x1eaa30: not impassable (+0x3a bit 3), a feature
  with Settlement (Features +0xc2 bit 2), no district, unowned or the
  player's own, no city within CITY_MIN_RANGE 3 on the plot's area nor
  closer than 3 off it — Rules_Cities 0x515910), or within
  CITY_MIN_DISTANCE_FOR_INCURSION of a known promise's plot
  (PROMISE_DONT_SETTLE_NEAR_ME, 0xfadf5055). Then: the continent (+0x30),
  coastal (0x82a10) and fresh water (0x82c20); the nearest own city (a min,
  0 with none); the danger (the influence map below, 0x716a90); the Loyalty
  pressure (0x19d470 >> 8); and per ring plot revealed: one owned by another
  player is skipped (a city there sets "enemy" to the min of 0 and its
  distance, always 0); at distance 1..CITY_MIN_RANGE every yield (the plot's
  yield for the player, 0x82280 -> 0x538a60) into the total, at 1 into the
  inner ring; a feature within 2 counted; a resource the player sees
  (0x4ab4b0) counted by its plot's amount, and at distance 1 one the player
  holds none of (0x4aa790, ownership 0) and not a bonus (0xadd080) is a new
  resource.
- The score (0x702380): per entry with a threshold or a value, the
  evaluator the table at 0xf2e740 holds for its condition (0x6f3420..
  0x6f37b0, 0x6f9630..0x6fa060), each a whole number << 8: Nearest Enemy /
  Friendly City and New Resources — with a threshold above 0 a gate (at
  least it, else invalid), else count x value; Inner Ring / Total Yield
  Sum(weight x yield) over the keyed yields; Coastal — gate, else the value
  where coastal and not fresh water; Fresh Water — gate, else the value;
  Specific Resource / Feature Sum(weight x count); Resource Class
  Sum(count x the class's weight); Foreign Continent — the threshold where
  the player has no city on the plot's continent, plus the value off its
  home continent; Cultural Pressure — a threshold below 0 a gate (pressure
  above it), else pressure x value. A failed gate (-9999) is skipped for a
  human (0x469d70: the slot status 3) and otherwise adds -100% to the stack:
  the score 0. Less the danger << 8. AI_SiteEval.csv logs no score below 0:
  the port clamps there.
- The regions (0x6fafc0, the "Settle City Evaluation" jobs, one per map
  region of the regions list, run and waited): each job scores every plot
  of its region in plot order (0x6fd510) and sorts them best first, a
  stable merge sort (0x6f5fb0); a region holds a site where one scores above
  0. The best region top other than a given plot (0x6fe2b0) is the "Settle
  New City" operation's target (the target list 0x747230, TARGET_SETTLE_
  LOCATION); its "Operation Change Target" takes the best top other than
  the old target. With no city the operation names none ("TARGET
  -9999:-9999", "INVALID, No backup": the log, not read).
- The first turn settler (0x70d250, the player with no city): of the
  settler's planning reach (unit +0x1fc0, AI_Planning.csv) the plots of
  this turn (turns <= 1), the one whose region list scores best above 0
  (0x6fec50), the first in the reach's order on a tie; the settler moves
  there and founds ("HL: First turn settler"). With none, it founds where
  it stands if it may, else the weighted draw "First Turn Settler Fallback"
  (the plots of this turn weighted by distance, x5 unowned; later ones 100 /
  turns where it may found).
- The danger map (InfluenceMap.cpp 0x717460, m_influence): per player at
  war with the player (0x469cd0), each unit it sees now (0x5033a0) with a
  combat, ranged or bombard strength (0x56dc90, 0x56e3e0, 0x56daa0): its
  strength (0x716400: bombard > 0 — the combat strength where it tops the
  bombard less COMBAT_BOMBARD_VS_UNIT_STRENGTH_MODIFIER 17, else that less;
  otherwise the larger of combat and ranged) onto the plots of its 1-turn
  planning reach (0x7921e0 -> 0x26df90) and every plot within its range
  (0x56e3d0) of them; a unit with the flag +0x18bd also onto the land plots
  beside each reach plot (the ring 0x6b0a0 -> 0x691f0, deduped within its
  own list). An air unit (+0x650 == 1, taken as the air domain) onto the
  plots within its range. Each district of such a player on a plot the
  player sees ("C-95: the danger map and Move to Safety"): its strength
  (0x24ae80) on its plot, its strike (0x249ee0) over its reach (0x249e40)
  or, with none, 1 on each plot beside it (0x715ff0). Then the player's own
  districts: one with a strength its plot 0, each plot their strike covers
  down by its strength to 1 at least (0x716080). Features' DangerValue last
  (the burning Woods and Rainforest 80, the Bermuda Triangle 10).
- PARTLY READ: the unit flag +0x18bd (CanRaid: "C-95: the danger map
  and Move to Safety"), the units' strengths (the install's base, the
  routines' modifiers unread), the plot yield 0x538a60 (the engine's
  `tileYields` for the seat), ownership type 0 (taken as the improved plots
  of the resource in the player's territory: the +4 new resources at
  runs/h1_duelv1124 t3 0:13 then agree).
  The Loyalty pressure is the engine's citizens' term (`plotPressure`):
  the -6 gate agrees with the log on all but 532 of its plots.
- MEASURED (runs/h1_duelv1124, China, AI_SiteEval.csv against record t,
  `.claude/scratchpad`'s sitecmp and the replay's settle probe): 84,606 of
  90,387 plot scores equal over turns 1-249, every one of turns 1-9 (the
  lists, the gates, the ring, the clamp, STRATEGY_NAVAL from turn 72, the
  Dead Sea row); the region lists hold the game's plots but for the map's x
  seam (the game splits our region 4 into its 4, 7 and 10). The unequal
  lines: a yield of 1 to 6 on the plots near China's improved land (the
  plot yield as the engine reads it), the danger's reach and strengths
  (h1_duelv1124 t100: an Archer's range 2 off its reach covers 10:5 where
  the game's covers 9:6 alone), the pressure gate. The verbose
  re-recordings of 1117 / 1121 / 1127 / 1128 (`h1_duelv*_20261010T220644Z`):
  80,028 of 84,909, 77,049 of 83,166, 90,060 of 92,628, 64,786 of 69,905
  equal; each first turn whole; a +4 the commonest there (a new resource
  the game does not count: ownership 0 is more than the improved plots).
- The choices (the replay's settle probe on record t, 1117 / 1121 / 1124 /
  1127 / 1128): the first turn settler's pick founds or stands where record
  t+1 shows it every time (the reach as AI_Planning.csv's line once the
  seat's units stand on their full Movement, as at its turn's start); the
  operation's target where it starts is our best region top 85 of 99 times
  (19/22, 15/18, 15/18, 19/21, 17/20); the changes' backups 42 of 88 (the
  backup's rule unread: the log alternates two plots of one region).
  The first turn settlers' orders (`firstTurnSettlerOrders`: the path's
  steps, then FOUND_CITY, as `SeatActionRecord.units` rows) carry each
  settler to its pick on a copy of the state (7 of 7 on the replayed engine).

## C-97: the victory manager's strategies — READ (the evaluation, the apply, the conditions below), PARTLY READ (three conditions, the island's count)

AI/VictoryStrategy.cpp, the player's victory manager at GrandStrategic
+0x508. The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents). Its log: AI_Victories.csv ("%d, %d, %s, %s", the writer 0x7bec80: the turn,
the player, the strategy, Following / Exclusive / Stopped / Forbidden; one
line per strategy changed), on the engine's state and on the record's.

- The manager's arrays (per strategy, database order = AI_STRATEGIES):
  +0x30 following, +0x48 disqualified for good, +0x60 changes this turn,
  +0x78 exclusive, +0x90 the turn it may next change, +0xa8 the bias — the
  sum of the leader's and civilization's Strategies-system AiLists rows
  (AiFavoredItems Value, within MinDifficulty / MaxDifficulty of the
  player's handicap; the leader query 0x622e90).
- The evaluation (0x7bc580, vtable 0xd71c30 slot 1, at the player's
  activation): a strategy disqualified for good is skipped; a victory
  strategy whose victory is off, or whose ConditionsNeeded + bias exceeds
  its conditions, is disqualified. Else each StrategyConditions row in
  order, through the registry 0x7bd310 (name -> function): a true
  Exclusive row marks it exclusive, a true Disqualifier disqualifies it,
  sets its change and stops the walk, a true Forbidden row makes its change
  = following and skips it this turn, any other true row counts. Before
  +0x90 nothing changes; else count >= need changes a strategy not
  followed, count < need one followed.
- The apply (0x7bb3e0): the first victory strategy marked exclusive that
  follows or changes makes every other followed victory strategy change and
  voids the others' changes; then each change flips the strategy (a
  disqualified one stays off) and stamps +0x90 = turn + 20 (0x7bf160 on,
  0x7bb870 off). The log prints Forbidden / Following / Stopped, and
  Exclusive for the forced stops.
- The conditions READ: Is Ancient .. Is Information (0x7bea40: the
  player's era >= the row's); Good Faith / Tech / Culture City (0x7bcd60:
  some city's yield advantage 0x5d83c0, flag 0, >= threshold << 8);
  Fewer Cities (cities <= threshold); Handicap at or below (player +0x908);
  Major Civ Wars (0x3dfae0: majors at war <= threshold); Is On Island
  (GrandStrategic +0x4a0); Has Agenda (+0xe20, the row's StringValue);
  Founded Religion; Unconverted Cities (0x7bff10: knowledge-base entries
  with no majority religion >= threshold); Cannot Found Religion (0x7bada0:
  none founded, no Prophet offered now 0x2f7eb0, none earned 0x2f30c0);
  Religion Destroyed (0x7bf080); Good Culture (0x7bce30: the player and the
  met majors whose Culture is at most its own >= trunc(n x thr / 100));
  Has Great Writer / Artist / Musician (0x2f30c0 earned); Has Great Works;
  Tourists Taken (the most domestic tourists of another major, +0x10b0, > 0
  and the player's visiting tourists from met majors, 0x39bee0, >=
  trunc(max x thr x 0.01f)); Has Taken Capital (0x7bd1c0, also registered
  for the three "Diplomatic Victory Points" names); Leads Military
  (0x7baa20) and Lags Military (0x7babc0): the rank among the majors
  against trunc(n x pct x 0.01f + 0.5), read only inside the "stronger"
  count; Leads Score; Next Lower Score (0x7bebc0); Has Science Wonders;
  Has Tech Lead (0x7bd210); Finished Space Project; Is Not Major (0x469db0,
  CIVILIZATION_LEVEL_FULL_CIV; 0x469ce0 is the tribe test). Lists: +0xb50
  the living full civs, +0x50 every living player, +0xfa0 the full civs' ids.
- The military strength the rank conditions read (PlayerStats
  m_iMilitaryStrength, data +0x210, computed at 0x4bb1e0, stored as each
  player's turn starts, before its production): per unit max(Combat,
  RangedCombat) x HP left / max HP in 24.8, truncated, plus the treasury's
  whole Gold as trunc((gold x 256 / 6) / 512), the sum >> 8. A player
  reads, as its last turn start before its own activation left them, this
  turn's values for the players up to itself and last turn's for the
  players after it (runs/h1_duelw1124: Rome, first to move, reads China's of
  t-1; Rome's Scout, in record 5, first moves China's Lags Military at t6).
- The island (GrandStrategic 0x6fafc0, after the apply; AI_ISLAND_COAST_PERCENTAGE
  20): while +0x440 (a city's landmass more than half revealed) is clear or
  +0x4a0 (island) set: per entry of the player +0x12f0 list, the share of
  its landmass the knowledge base counts (0x786080: the +0x2e8 map's
  +0x28 / +0x24, keyed by the plot's +8 id; the map refreshed by the
  knowledge base's update 0x783980 from a per-plot visibility word > 0)
  above 0.5 (0xd20458) sets +0x440 and decides: coastal plots >=
  trunc(total x 20 / 100) sets the island, else clears it and ends the walk.
  PARTLY READ: the port takes the player's revealed plots for the share;
  the game turns later (runs/h1_duelv1124: Qin's Naval at t71, the port's
  at t48), so the +0x12f0 list and the visibility word are unread.
- PARTLY READ: Has Settle Spot (0x6fe2b0), Cities Under Threat (the city
  AI's +0x1b8) and Has Opponents' +0x9d0 array (only its wars are counted)
  read false in the port and are counted as gaps.
- The AI's handicap: AI_Victories.csv logs Rapid Expansion "Forbidden" at
  t1 for both AI majors of every duel ("Handicap at or below 2"), so the
  majors' handicap is the game's difficulty (Warlord in the lab's games),
  not the AI default; the replay sets it.
- Timing on the records: record t is taken as the first player (Rome)
  activates; a later player's turn start (its techs and civics completed
  before its activation) lands before its own evaluation
  (runs/h1_duelw1124: China's Civil Service, completed before its
  activation at t69, moves its Medieval strategy at t69; its Celestial
  Navigation, completed after it at t31, at t32).

Measured on the five verbose recordings (runs/h1_duelv1117, 1121, 1124,
1127, 1128): AI_Victories 120 of 163 lines equal on the record's state
(24 / 34, 22 / 30, 27 / 38, 22 / 31, 25 / 30), 71 of 163 on the replayed
engine's. The misses named on 1124: Religious t40 (the
log) against t54 (Qin's Xi'an reads 0 Faith on record 40 and 1 on 41: its
own turn start, after the record, reaches the yield the game reads), Naval
(the island above), Cultural t103 against t138, Science p0 at t49 / 118 /
154 / 179 / 242 and the Exclusive at t221.

## C-97: the AI's knowledge of the map's cities — READ (the record, the update, the statistics, the advantage), PARTLY READ (the city AI's stored yields)

AI::Knowledge at player +0x12b8; its log AI_Knowledge.csv (per turn "START
LOG" with mean +/- deviation per yield, then a CITY line per entry). The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents).

- The defaults (GlobalAI 0x6df230, once a game): per yield the mean and the
  sample deviation (24.8) of the plot yields of every non-barbarian
  player's start plot and the six beside it, each read for that player;
  +0x1d0 the players counted — the entries the knowledge base needs before
  its own statistics stand in.
- The record (0x5ef9a0): an entry per city the player knows (its own and
  those it sees): the yields truncated, the majority religion, the age.
- The update (0x5ebb30): every entry ages; one whose plot the player sees
  with no city of its owner there is dropped; with two entries or more the
  mean is the sum of trunc(y x 256 / n), the variance the sum of
  trunc(d^2 / (n - 1)), the deviation its square root; else 0.
- The advantage (0x5d83c0, flag 0): x = the greater of the city AI's
  stored yield (CityBuildAI +0x1118, unread: the port takes the city's
  own) and the city's yield; mean and deviation the knowledge base's where
  it holds +0x1d0 entries or more, else the defaults' mean x 6 and
  deviation x fx(2.449) (626 >> 8); (x - mean) x 256 / deviation, x - mean
  where the deviation is 0. Flag 1 (AI_CityBuild's Food / Prod Adv.) takes
  37 and sqrt(37).

Measured on the record's state: the statistics 317 of 2,398 turn-player
lines over the five verbose recordings (1124: 100 of 498, its CITY lines
212 equal). The first miss is t1: the log prints no CITY line on the turn
the first city is founded.

## C-97: the majors' meeting — READ (the triggers, the effects), PARTLY READ (the shared sight)

The players manager's meet (0x484ab0) and its three callers in the
visibility manager. Ported in both twins (`meetMajors`, `majorLookMeets`,
`seatSeesPlot` in cpu/core/fog.ts; `_meet_majors`, `_major_look_meets`,
`_eyes_of`, `_suzerain_look` in gpu/core/sim_masks.py); measured against
the records' `met` lists and DiplomacySummary.csv.

- The triggers: a unit placed on a plot another player sees (0x5246f0, from
  the placement 0x586d40: each player whose visibility count of the plot is
  above 0); a plot coming into view meets its owner (0x524890); a unit
  coming into view meets its owner (0x5249c0).
- A city-state's sight is its suzerain's: runs/h1_duelw1124 t89, Rome's
  Warrior steps beside Bologna's unit and China, Bologna's suzerain, meets
  Rome that turn (the engine without the share met at t107); t90, China's
  revealed plots take in the sight of Granada's unit at (39,17).
- The effects: each side's BOOST_TRIGGER_MEET_CIV rows (runs/h1_duelw1114
  t15, 1130 t11: both majors' Writing boosted the turn they met);
  PLAYER_MET_ALL_MAJORS (3, FIRST_IN_WORLD 5) for each side that has now
  met every living major (1121 t127: Rome and China, 5 each). The
  "hospitality" greeting is the AI's diplomacy flavour, no rule.
- Before the meeting no war (DiplomaticActions' declarations need the
  contact) and no mission: Delegation (cost 25, NoCurrentDelegation,
  obsolete for the sender with Diplomatic Service) and Resident Embassy
  (cost 50, Diplomatic Service, NoCurrentEmbassy, taking the Delegation's
  place) are two missions (`MISSION_DELEGATION`, `MISSION_EMBASSY`).
- PARTLY READ: what a newly gained suzerain sees of the city-state's
  revealed plots, and whether an envoy reveals the city-state's territory.

Measured: the five verbose recordings' meeting turns all equal
DiplomacySummary.csv's Met lines (1117 t161, 1121 t127, 1124 t89 through
Bologna, 1127 t61, 1128 t81); the replay lands the other players' recorded
moves in the turn they were made.

## C-97: the behaviour trees — READ (the interpreter), the nodes PARTLY READ

The majors' operations run AiOperationDefs.BehaviorTree trees
(BehaviorTreeNodes / TreeData, the game DB's order) through
BehaviorTree.cpp; ported in `cpu/core/behaviorTree.ts` (the interpreter)
and `nodes.ts` (the nodes); the tables generated by
`tools/install/ai_operation_tables.py` (checked against
DebugGameplay.sqlite).

- Statuses: FRESH 0, SUCCESS 1, RUNNING 2, FAILURE 3, ERROR 4, SKIPPED 5.
  Shapes (NodeDefinitions.ShapeId): 0 selector, 1 action, 2 decision, 3
  decorator. Handler tables by shape: selector update @f2ed50, parent
  function @f2ed70, decorator update @f2ed90, leaf (action) update
  @f2edb0, decision update @f2edd0, execution @f2edf0, the next-node
  function @f2ee10 (default i + 1).
- The tick 0x7d3a00 runs where the root is FRESH or SKIPPED: each node in
  order is updated (0x7d3d30; a SKIPPED parent skips it), the walk's next
  node the larger of its own next (Sequence 0x7f3e70: max(its resume, i +
  1); Contract Manager / Interval / Naval Choose Target: the index their
  update stored) and the parent propagation's (0x7d1750: a finished child
  tells its parent's function, @f2ed70, which may finish the parent and jump
  past its subtree). With the root SUCCESS, RUNNING or FAILURE every node
  left SUCCESS or RUNNING executes in node order (0x7cb3d0); a root RUNNING
  or FRESH resets the tree for the next turn, else the tree is done (the
  operation complete).
- Parent functions: Priority 0x7f2390 (first SUCCESS or RUNNING child
  ends it), Sequence 0x7f3e80 (a child not SUCCESS ends it; RUNNING keeps
  the resume), Concurrent 0x7eb0f0 (Max Failures, Exit on Success; its
  update 0x7eb210 clears failures and the last good child), Not 0x7f15f0
  (its decorator update 0x6a7bd0 returns 0: its child runs; the handler
  tables at 0x7cbca0 store it at Not's index @f2eef4),
  pass-through 0x7f15a0, Turn Limiter 0x7f1620 (update 0x7f21c0; the
  limit at the game speed, 0x5254d0), Contract Manager 0x7f1500 (update
  0x7f17a0, each contract's check 0x7f2220).
- Leaves READ: Decode Trigger 0x7f2970; Operation Change Target 0x8196d0
  (INVALID -> the backup of the same kind, else "No backup" FAILURE; Always
  Swap; Fail on Invalid Team; Required Tag; the strength gates over 0x723ab0
  — WEAK to the backup, TOO WEAK FAILURE); Find Available Unit 0x7ec7b0;
  Build Unit 0x7f4e00; Recruit Units 0x81c820 (the recruit 0x60a8c0 ->
  0x738050: the free units, then the units of the lower-priority unlocked
  operations); Lock Units 0x7f5240; Make Formation 0x7efd70 / 0x7ee630 (pairs
  0x73b6c0 -> 0x73b8a0); Operation Move 0x81a130 / 0x816cb0; Settle 0x7f0b30
  / 0x7ef530; Operation Is Ready 0x81a090; Operation Attack 0x80ec10
  (SUCCESS once the target is gone, 0x73a8e0; RUNNING with units, else
  FAILURE); Operation Attack Units 0x80ecf0 (target gone SUCCESS; Always
  Running RUNNING; else SUCCESS — the team flag +0x90 with no units FAILURE,
  unread); Naval Patrol / Naval Pillage 0x803880 (RUNNING with units, else
  FAILURE); Operation Defend Units' update 0x80ee70 (SUCCESS; marks a
  member wounded past AutoProtect Percentage).
- Operation Move's destination (0x816cb0): radius = min(Unit distance (the
  node's slot 3; 1 where it names none), the unit's Range +0x19f8), 0 where
  the path finder's +0x1fb8 +0x738 is above 1 or the unit carries the
  node's Leader Tag (0x79cb30); at least 1 where the goal is barred — no
  path or an attack into it (0x586360 under flag 0x40), a visible enemy unit there
  (0x5862e0), a unit there that keeps it out (0x585eb0 -> 0x585d90: the
  owner's of a stacking class, another player's not at war) — and, the
  goal open, for a unit outside the tag and any formation where the node
  names a Leader Tag and Range above 0. With a radius the ring walk 0x6aef0
  (0x69010's order) around the goal with the test 0x815d50: a plot in the
  goal's region (plot +0x18) before one outside, then the nearest the unit
  (strictly), its own plot or one with no own unit but its formation's and
  a path; none, the goal. The logged moves agree in form (1124 t17: 3:9 ->
  3:9, 3:13 -> 3:11 around a held rally 3:10).
- PARTLY READ / unread: the executions of Defend Units 0x80d790
  ("Operation Protect Units"), Naval Escort 0x817f60; Operation Move's unit
  tactical block (+0x1fc0, 0x791300).
- NAVAL CHOOSE TARGET (0x803590; its list 0x802ea0), READ: the tree's
  operation (none: 4, an assert); the node's Fail for no target (TreeData
  +0x10, unset: true) and its Target Domain (the string's hash to the
  DomainTypes index, 0xadd590, cached at +0x20; unset: 2). The list: the
  player's tactical target list (+0x12b8 +0x368, 0x28-byte entries) filtered
  to the entries of type TARGET_CIVILIAN_UNIT through
  TARGET_HIGH_PRIORITY_UNIT whose plot is water exactly where the domain is
  0 (DOMAIN_SEA). Of those the nearest the operation's target (op +0x2a8 /
  +0x2ac), strictly nearer replacing, the first of equals kept: the
  operation's target and rally set to it with each team's goals (0x73e7d0),
  the cursor to the node's first child (+0x10 <- +8), SUCCESS; none: the
  cursor to the node's end (+0x10 <- +4), FAILURE with Fail for no target,
  else SUCCESS. runs/h1_duelv1121 city-state 3's Galley logs Operation Move
  from t54 (36:23 -> 0:19 ...), the move node under Naval Choose Target
  running only on a find. Ported (`navalChooseTarget`, `_u_naval_choose`).
- NAVAL PILLAGE's execution (0x803250), READ: the tree's job units alive
  (+0x770 clear) with Movement left (0x56c690) listed; then each listed unit
  still with Movement left and a planning (+0x1fc0): the first of its
  planning's targets (+0x48, 0xd0-byte entries) of TARGET_ENEMY_COMBAT_DISTRICT
  with +0x18 above 0 (taken as the entry's spot count: PARTLY), else — a
  unit with a range (0x56e3d0) — the first of TARGET_LOW_PRIORITY_UNIT
  through TARGET_HIGH_PRIORITY_UNIT; that target's entries of the player's
  target list (0x790450's key, 0x802cf0: +0x10 / +0x12 / +0x14 equal), the
  attack assignment (0x776140) of the whole list over them with no exchange
  filter (byte 5 clear) and the survival filter (byte 6 set), carried out
  (0x771f80). No line. Ported (`passNavalPillage`, `_x_naval_pillage`).
- NAVAL PATROL's execution (0x803060), READ: over the tree's job units
  (0x6092c0 by the job +0x488, the player's unit order), each alive (+0x770
  clear) on the map with Movement left (+0xdb0): HL Explore's target
  (0x70aa40 with no chosen list of the round's, a list of its own, the
  first-round fallbacks on), the unit's turn done (0x570b40), and where a
  target stands a move order there (0x962030, vt +0x60). No line.
  runs/h1_duelv1121 city-state 3's Naval Superiority: its Galley, Ready from
  t34 with no target (Naval Choose Target skipping its children), moves
  every turn with no tactical row and no operation line (834 -> 920 -> 963
  -> 832 ...). Ported (`passPatrol`, `_x_naval_patrol`).

## C-97: the operations — the manager and its candidates READ, the staging list and City Defense's start unread

Ported in `cpu/core/operations/` (manager.ts, evaluate.ts, recruit.ts,
operation.ts); measured by the replay's OperationsProbe against
AI_Operation.csv and AI_Operation_Eval.csv (the verbose recordings).

- The manager (0x722690 -> 0x727510). The candidates (0x722d70, 0x70-byte
  entries at +0x328), built and evaluated before the turn's triggers: one
  per running operation (0x747f30 + 0x747fa0: its definition and enemy, its
  target as the fixed rally +0x40, its teams' strength +0x4b0 as ours
  +0x48, its id +0x4c); then per other player — a WAR definition where at
  war (0x469cd0 = diplomacy 0x3dcec0) or flagged (+0xc58 m_prepareForWarWith,
  +0xd18; the section "C-97: the war operations"), an ALLY one where allied
  (0x3da560, 0x3de4e0); then each allowed
  definition with EnemyType NONE (one with ActiveEmergency, +0x18, only
  where the player has that emergency). The allowed list: Leaders
  .OperationList, else Default_List, AllowedOperations by rowid.
- The evaluation (job "Op Evaluation", 0x746920): MustBeAtWar, MustHaveNukes,
  MustHaveUnits (player +0x12e8 +0xc0) first; then each target of the walk
  0x747230 (an enemy's target needs a value above 0) against each staging
  plot (m_operationStartPoints, player +0x12b8 +0xb58: "THE STAGING
  PLOTS"; the fixed rally for a running one): the
  distance 0 refused but for TARGET_FRIENDLY_CITY; MaxTargetDistInRegion /
  InArea / InWorld by the rally's and target's region (+0x18) and area
  (+8), -1 none; ours = the fixed strength, else the knowledge base's army
  strength of the player within 10 of the rally (0x5eadb0: per unit type
  max(Combat, RangedCombat) x the known units in range, each less its damage
  x COMBAT_WOUNDED_DAMAGE_MULTIPLIER x -0.01f cut toward 0; the entries'
  kinds 1 / 2 add gp +0x198 / +0x17c and 0x4f2b50 terms, unread); the odds
  min(0.9, ((ours - theirs) / min(best ours, best theirs) + 1) x 0.5) x
  0.97 ^ (max(0, theirs - ours) - trunc(d x -0.75)) (the best combat
  strengths 0x4d9320, at least 1, 1 for no enemy; with an enemy theirs
  above ours caps the odds at 1 - lead x 0.75 / 25, ours above raises them
  to min(1, lead x 0.75 / 25)); MinOddsOfSuccess above 0 needs odds above
  it; the best value x odds in 24.8 (0x16e7d0), the later of equals. The
  candidate is valid with a target; the eval line logs value +0x58.
- The target walk (0x747230): SETTLE — the best region top but the running
  operation's target, value its score's whole part << 8 (0x6fe2b0);
  NAVAL_SUPERIORITY — of the player's coastal cities (0x1c77c0) the most
  populous (+0x588, strictly, the first of equals) whose ring walk within 4
  holds a sea plot not a lake (callback @d6e100: 0x834d0, 0x82e80), value
  100, enemy strength the largest best combat strength of the game's
  majors; BARBARIAN_CAMP — each camp of the knowledge base (+0x638), value
  50 x the camps known, enemy strength 6 (@d26898), + the barbarians' army
  within 3 only for an evaluating player not the barbarians with no enemy
  (0x7476f9..0x747745: the camps are walked where the player is the
  barbarians, the enemy none or the barbarians); FRIENDLY_CITY — the player's own cities (TargetParameter > 0
  needs the city AI's +0x1b8 above -1), value 0, enemy strength 0x5eb2c0 x
  1.5 per 0x5eb600 > 1 and +0x58 > 1 (unread terms); COMBAT_DISTRICT /
  PASSIVE — the enemy's known cities, valued by the city value 0x79fef0
  (the section "C-97: the war operations").
- The pick: a running operation's valid candidate sets its backup
  (0x73e610); of the new ones that start themselves the highest Priority
  (+0x40), then the larger odds (+0x54), where the running operations of
  its OperationType are fewer than base + perWar x wars (AiOperationTypes /
  PerWarOperationTypes lists: TRAIT_LEADER_MAJOR_CIV's, those of the
  strategies followed); a type of none has no limit. The running lines
  ("%s running, TARGET"), the strengths (0x73eb60, 0x73f7d0) and team lines
  (0x73b360) come first, then the start (0x726470 -> 0x73a120, "Started").
- AI_EVENT_DESIRE_SETTLE (0x800c60 -> 0x7265b0): the candidate of the named
  definition with no operation (with the call's flag any, else a valid
  one), under the limit: the trigger's plot as the target (else the
  candidate's), the candidate's rally; with the flag and no target the
  candidate is weighed again for the new operation (0x747fa0, vt +8) and
  switched to (0x73e610, 0x73e870).
- The pool (+0x2e0, 0x71e370): an operation takes the slot freed last,
  else a new one; the manager and the trees walk the slots in order. 1124's
  running-line orders t1-t74 all read so (t26 Settle and Attack Enemy City
  end, t27's Settle takes the city assault's slot 2 and the new assault
  slot 0).
- Confirming: 1124 t3-t15 every eval line equal (Settle New City 27 / 48 /
  72 ... 114, Civilian Builder Capture 0.0, Naval Superiority 100.0, the
  running Settle operation's backup absent on its start turn); the Attack
  Barb Camp start on t32 at 6:3 with value 50.
- The staging list: "THE STAGING PLOTS" above (the port takes the player's
  cities; the port's barbarians evaluate their running operations alone,
  the game's also the Builder Capture candidate each turn — its eval line
  50 x the camps known). Unread:
  the ALLY gate, City Defense's start (0x5cced0 "Defense %s"), the
  knowledge base's camp order (the port reads plot order).

## C-97: the war operations — the war candidates, the city value's frame, the assault nodes and Attack Units READ; the loyalty lead's sources, the team update's danger and the assault's executions PARTLY READ

Ported in `cpu/core/operations/` (cityValue.ts, evaluate.ts's district
walk, manager.ts's war candidates, knowledge.ts, assault.ts); measured by
the replay's OperationsProbe (the war candidates' eval lines, the "CITY
VALUES" lines, the "Attack Enemy City" / "Attack Walled City" families).
Evidence: the verbose recordings runs/h1_duelv1117 / 1121 / 1124 / 1127 /
1128 (AI_Operation.csv, AI_Operation_Eval.csv, AI_Diplomacy.csv,
AI_Knowledge.csv).

- THE WAR GATE (0x722d70, per player of the game's list +0x4a0 but the
  seat): at war (0x469cd0), or flagged in the military AI's
  m_prepareForWarWith (+0xbb0 autovariable, data +0xc08 +0x50 = +0xc58) or
  +0xd18: each allowed definition whose EnemyType is "WAR" (the +0x178 list,
  0x80 each) is a candidate against the player; else allied (0x3da560 /
  0x3de4e0): the "ALLY" ones. PrepareForWarWith (0x724f30; Lua
  PrepareForWarWith 0x9bbaa0) is set by the war declarations' not-ready hook
  (DiplomaticActions slot +0x68 = 0x6742d0, from the pick 0x64ba90 through
  0x6744a0 / 0x674420 where the best action toward a player is not ready):
  where the players at war or prepared for number at most half the +0xb50
  list and the player is neither a declared friend nor an ally; 0x650890
  clears it. The log shows it: every war candidate's first eval line comes
  the turn after the first positive war-declaration desire toward that
  player in AI_Diplomacy.csv, or later (1117 China -> 3: desire t18, eval
  t20; 1127 -> 3: t48, t49; eleven pairs over the five verbose duels), and
  it stays (1117 China's candidates against Caguana t20 .. t56 with no war
  declared and the desires negative from t21). The replay sets it from
  the pick's hook ("the war desires, the war operation's readiness and the
  assault's executions" below).
- THE DISTRICT WALK (0x747230, COMBAT_DISTRICT / PASSIVE): an enemy needed;
  each known city of the enemy with a valid plot; TargetParameter 0 skips a
  city whose districts' defenses and walls (0x5eb600: per district +0x14 > 0
  and +0x18 > 0) outnumber its districts (+0x58) — walls standing; the
  running operation's own target and any active operation's (0x724dd0: the
  manager's +0x318 list, 0x73a840) skipped; one of the player's cities must
  list it in its trade AI's city list (CityBuildAI +0x870 m_cityTrade,
  0x78e010); MustHaveNukes (definition +0x7a) asks the nuke check 0x2d1f20 /
  0x2d2090; the value the city value (0x79fef0, its fifth argument
  MustHaveNukes, its sixth 1); the enemy strength — where the player's best
  combat strength passes the enemy's by more than 30 (or no enemy) — the
  enemy's known units within 3 (0x5eadb0, threshold 0, no districts); above
  MaxTargetDefense (+0x70, >= 0) the target is skipped. The definition's
  fields: +0x60 / +0x64 / +0x68 MaxTargetDistInRegion / InArea / InWorld,
  +0x6c MaxTargetStrength, +0x70 MaxTargetDefense, +0x74 MinOddsOfSuccess,
  +0x78 SelfStart, +0x79 MustBeAtWar, +0x7a MustHaveNukes, +0x7c
  MustHaveUnits.
- THE CITY'S WORTH (0x7a0ac0, the known city K, the player P):
  PSEUDOYIELD_CITY_POPULATION of floor(pop / 5); CITY_BASE of 1;
  ORIGINAL_CAPITAL of 1 for an original capital (K +0x14), of 0.5 (the float
  cut to 24.8) for a capital (+0x15); PSEUDOYIELD_WONDER of 40 per wonder
  (0x5eb680: buildings flagged +0x158 & 0x40 K holds); the yield values of 7
  x K's Production, Science and Culture (+0x30; the serializer 0x34460 orders
  the yield globals Food @f2f974, Production @f2f978, Gold @f2f97c, Science
  @f2f980, Culture @f2f984); then P's loyalty lead there (0x19d470 with its
  byte, whole): at or below -LOYALTY_PER_TURN_FROM_NEARBY_CITIZEN_PRESSURE_
  MAX_LOYALTY (gp +0x474, 20) the worth is 0, else + 10 a point up to 5,
  and below -5 another 10 a point per step of 5 back up; then the culture
  AI's value of each great work K holds (0x623b30 over CultureAi +0x7b8: a
  table's entry, 0 above 5000 unless P owns K; unread) and each resource K
  holds (0x7a21e0 at count 1, turn 0, horizon 100, rate 2.0).
- THE LOYALTY LEAD (0x19d470 with its byte): per player p of the game's
  list, 0x19cd80 — its own sources at the plot as P would hold a city there,
  added for P and taken off for every other p: for P alone
  OWNERSHIP_IDENTITY_PRESSURE_FROM_* (0x1a1050; 0 in Gathering Storm) and
  IDENTITY_PER_TURN_FROM_FREE_CITIES / _CITY_STATES (gp +0x40c / +0x408)
  where P is a Free City / city-state (0x469d40 / 0x469de0); for each p
  CAPITAL_IDENTITY_PRESSURE (0x1a0140; MAXIMUM / MINIMUM 0) and its cities'
  terms near the plot (0x1a08d0 / 0x1a0ae0 / 0x1a0cc0 over 0x19b5f0 /
  0x19bbb0 / 0x19b820: governors, great works ...; unread), each only where
  p's +0x728 is set — then the citizens' own - foreign (0x1a1ae0 with its
  byte: the plot walk over CITIZEN_IDENTITY_PRESSURE_RADIUS_CUTOFF, no
  ratio). The port counts the citizens with the city on the plot on P's
  side (as P would hold it): 1117 China at Caguana (distance 10, no Chinese
  pressure) reads the city's 3 citizens; the log sits 10 above (t18, t20,
  t25: a lead of 4).
- THE CITY VALUE (0x79fef0): W the worth; with the fifth argument max(W, 0).
  Else A / B the land strength of P / the owner E (PlayerStats 0x4bd0d0
  domain 2, +0x2d0; its writer unread — the port counts the land units), C
  / D their best combat strengths (PlayerStats +0xf0
  m_iMaxMeleeStrengthTrained through the shared getter 0x4d9320; the
  replay's import now raises it from the first record's starting units, as
  0x4580b0 does); the nearest city N of P (the first of the least
  distance); G the city's defense (0x5eb2c0 with its byte: per district the
  walls' strongest + 10 where its walls stand (+0x18), else its defense
  (+0x14); without it the strongest of defense - 10 and walls); H E's known
  units within 3 of K at least C - 30 strong (0x5eadb0 over the knowledge
  base's army records) and E's known districts' strikes there (+0x1c, 0
  without walls: 1117 t18 682.9 holds without Caguana's 3); T = H + D, +
  min(1, 2 dist(N, K) / (25 at the game speed, 0x5254d0)) x B where B > 2
  (H + D). With C > 0: less PSEUDOYIELD_CITY_DEFENSES of G / C where G >=
  C; with the sixth argument and N, per other known city X of E no further
  from K than N is (the offset coordinates read as axial) and on N's side of
  K (the dot product above 0), less 2 x CITY_DEFENSES of X's defense (no
  byte) / C, twice where X is within 5 of K; where C < D + 30: x 0.25 (float
  @d2f324) where C < D - 15 or B > 3A, less PSEUDOYIELD_CITY_DEFENDING_UNITS
  of T / C. Plus the knowledge base's war record's +0xc toward E (kb +0x668,
  0x10 an entry by player id; every AI_Knowledge.csv WAR line logs 0.00);
  never below 0.
- THE KNOWN CITY RECORD (0x5efaf0, 0xe0 bytes; AI_Knowledge.csv's CITY
  lines 0x5ed0b0): +0x8 / +0xc the plot, +0x1c the population, +0x14 /
  +0x15 original capital / capital, +0x30 the yields, +0x48 the defensible
  districts (0x20 each, a district with a hit-point pool: GetMaxDamage
  0x5e97d629 above 0 — +0x14 GetDefenseStrength, +0x18 the same while the
  outer defense 0x6da56a3d holds, +0x1c the strike 0x249ee0), +0x58 their
  count, +0xa8 the great works, +0xc0 the resources. 1117 t18 Caguana: "0, 3,
  100, 43.00, 1, 1, 9, 24, 0" = population 3, one district, max(19 - 10, 0)
  = 9, yields 24 — the engine's.
- THE MANAGER'S CITY VALUES (0x7277d0): after the candidates' eval lines,
  each known city of another player, "%d, %d, -1, CITY VALUES, %3.1f, %s" —
  the walk's call. A turn's evaluation reads what the turn before logged
  (1117 China t20 442.9 = t19's; over the five duels the war eval lines
  match the CITY VALUES of the turn before only on 461, of the same turn
  only on 37, both on 249): the knowledge base's records refresh after the
  evaluation — the port evaluates on the records of the turn before and
  logs the CITY VALUES on the turn's (the city records' 0x5efaf0 and the
  look 0x7877e0).
- THE NODES: IS AT WAR (0x7edde0) — at war with at least Minimum Number (1
  absent) players, the barbarians only with Include Barbarian, only the
  operation's enemy With Operation Target (ERROR with no operation); Skip
  For Minors is tested present and read through With Operation Target's
  value, then SUCCESS against an enemy that is no full civ (0x484a10).
  CAN ALPHA CITY (0x812cc0) — FAILURE with the target gone (0x73a8e0) or no
  city there; else the sum over the teams' units with Movement left
  (0x56c690: +0xdb0 > 0) of the largest predicted damage of their
  planning's entry for the city (0x793210, +0x64 per spot; 0x791470 runs
  the combat under the simulation flag) against half the centre's hit
  points left (0x5e97d629's most less its damage): SUCCESS at or above.
  OPERATION DIPLOMACY (0x819db0) — ERROR without any of its four flags or
  with no enemy; Had Denounced and not denounced (0x3da8e0: diplomacy
  +0x9d0[p] >= 0) SUCCESS; Is At War and not at war FAILURE; with a
  Contract, Desires Denouncement SUCCESS, Desires War RUNNING until at war;
  else SUCCESS. Its execution (0x8163f0): an AI owner; DENOUNCE (@f2e584)
  where it desires denouncement and has neither denounced nor gone to war;
  with Desires War it sets the operation's AllowUnitConstruction (op
  +0x5d8) and, not at war, DECLARE_SURPRISE_WAR (@f2e5a8); the action goes
  to the contract manager (P +0x12d0, 0x60bb50) as a diplomatic contract
  (+0x368 type 4) at the tree's present value unless the tag holds one.
  OPERATION ATTACK CITY (0x813250) — SUCCESS with the target gone; FAILURE
  where the target plot holds no city nor a district whose row's +0xe2 is
  set; RUNNING while the operation holds units (0x6092c0), else FAILURE.
  OPERATION AIR ASSAULT (0x813140) — the same district test, SUCCESS.
  OPERATION PILLAGE (0x8134a0) — ERROR where its three flags are present and
  false; SUCCESS with the target gone or units held, else FAILURE.
  OPERATION SIEGE CITY (0x8136a0) — SUCCESS with the target gone, ERROR with
  no enemy, SUCCESS with units, else FAILURE. BUILD MILITARY IMPROVEMENT
  (0x7e9b10) — ERROR with neither Defensive Improvement nor a Specific
  Improvement; else it picks a member with build charges (+0xed0) whose
  class (+0x160) builds a defensive improvement (+0x108 & 0x40, +0x34 > 0)
  the player may build (0x35ede0) into its memory (+0x20 the unit, +0x24 the
  improvement): SUCCESS. The node table: the registration 0x7db850 (names
  -> id globals @f2eeb0..) and the handler tables filled by 0x7cbca0.
- THE TEAM UPDATE (0x738f20 from 0x73f7d0, the team +0xe8 + 8 x the goal
  slot): per member its axial column (x - floor(y / 2)) and row summed; per
  tactical target (kb +0x370: the unit targets CIVILIAN..HIGH, the
  districts) within twice its base Movement (0x56d9f0 with -1: Units +0x38,
  embarked the embarked pool): the team's attack strength (+0x98) once per
  member that can strike it (0x791300), the damage the target would deal it
  (0x51a240 / 0x519370 under the danger map 0x716a60), the target into the
  team's list (+0xb8) and the enemy strength (+0x94); a member the expected
  damage would kill is endangered (+0xa0). Then slot 3 (+0x100) the centre
  (the sums' signed quotients, x = q + floor(y / 2)); slot 5 (+0x110) the
  march point — with the operation's enemy (the second argument) not at war,
  from the target back toward the rally in single-precision axial steps of
  one plot (n = the truncated largest of |dq|, |dy|, |dq + dy|; the
  position rounded by 0x38070: each component roundf'd, where they no
  longer sum to 0 the one furthest by the sum's sign rebuilt), the first
  plot P may enter — its own, no one's, open borders / alliance (0x3dab70),
  or an owner not enforcing its borders (diplomacy +0x6c0) — the rally where
  the walk reaches it; with no enemy or at war, the target; and with targets
  slot 4 (+0x108) the battle line, halfway (cut toward 0) between the centre
  and the targets' average (unsigned quotients of the sums), the team
  engaged (+0x90). Logged "%d, %s, %d, , Battle line, %d:%d, %d endangered".
- OPERATION ATTACK UNITS' EXECUTION (0x80ceb0): per team engaged (+0x90) or
  with strength (+0x58): the members alive with Movement left, in no
  formation (+0x1fb8 +0x738 = 1), a siege unit (bombard) only where the
  target is another player's city (or its +0x1c0 is 4); the targets of the
  tactical target list (kb +0x368, 0x80b9b0) the node's data pick: Attack
  Nearby Units (0x80bd20 / 0x80c080) — another player's, at war with P or
  (with an enemy named) the enemy's, of a player other than the enemy only
  its civilians, within max(2, Movement left) of a member; else Attack
  Along March (0x80be90) — another player's ahead of the battle line toward
  the target (the axial dot product of target - line and the target slot -
  line above 0); else Attack Near Target (0x80bb50) — a player at war's
  within 3 + its reach (+0x18: GetRange, a district's 0x249e40) of the
  target slot; else all (0x80b830). Logged "Op Attack Units Targets, Target
  %d, Owner %d, %s, %d:%d" (NULL TARGET for none). The assignment 0x776140
  — byte 5 (Allow Unequal Attacks unset and one unit) drops a spot whose
  received damage tops the dealt, byte 6 (always) one that would kill the
  unit, neither against a HIGH target — logged "Operation Attack Units, %s,
  At %d:%d, Move %d:%d, Attack %d:%d" and carried out (0x771f80). The port
  runs `cpu/core/tactical.ts`'s planUnit and assignAttacks through the view
  and leaves the moves and blows as the seat's unit action rows in
  0x771f80's order.
- OPERATION ATTACK CITY'S EXECUTION (0x8109e0): per team the members alive
  with Movement left; the COMBAT_DISTRICT targets within 3 of the target
  (0x80f280); the assignment (bytes 0, 1) logged "Operation City Attack" and
  carried out.
- MEASURED (the replay on the five verbose duels, the war candidates fed
  nothing but the prepare flag): war-candidate eval lines log / ours 1117
  194 / 231, 1121 9 / 3, 1124 436 / 528, 1127 73 / 148, 1128 101 / 142;
  the first candidate's turn met in 1117 (t20) and 1121 (t31), its value
  off (1117 682.9 against 442.9: ours keeps the log's t18 value through
  the log's t19 drop of 240; 1121 506.3 against 501.3); CITY VALUES within 0.1: 27 /
  502, 176 / 528, 72 / 799, 72 / 695, 21 / 356, the misses the knowledge
  base's army memory and the lead's per-city sources. The log's candidates
  fall silent on turns the desire holds (1117 China -> 3: 46 eval turns
  over 228 desire turns), unread.
- PARTLY READ / unread (AUDIT C-97): the +0xd18 gate flag; the trade AI's
  city list (CityBuildAI +0x870: the port takes every known city); the land
  strength +0x2d0's writer; the loyalty lead's per-city sources (0x19b5f0,
  0x19bbb0, 0x19b820); the culture AI's great-work values (+0x7b8); the war
  record +0xc's writer; the team update's danger and attack strengths.

## C-97: the war desires, the war operation's readiness and the assault's executions — the war value, the not-ready hook, the readiness and the executions READ; the leader's war factor, the WMD flags, the deal items and the war record's writer unread

The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents). Ported for the minors in `cpu/core/operations/manager.ts`
(PrepareForWarWith from the hook, the readiness 0x723db0, the contracts on
`cpu/core/aiContracts.ts`), `cpu/core/operations/assault.ts` (the
executions), `cpu/core/aiAssignment.ts` (the generalized assignment) and
`cpu/core/tactical.ts` (the district targets); measured by the replay's
DiplomaticSender (the desire rows, the war declarations) and
OperationsProbe (the first war candidate per player and enemy, the
execution families) on runs/h1_duelv1117 / 1121 / 1124 / 1127 / 1128.

- THE CHAIN FROM A DESIRE TO THE FLAG: the pick 0x64ba90 walks each action
  toward a player whose desire is above 0: CanDoAction (0x3dd9a0) failing
  is "action invalid"; passing it, 0x672ef0 (the not-ready flag +0x6390
  0x650460, then the action's can-do functor 0x672e40) false is "not
  ready" and calls the action's +0x68 hook through 0x6744a0 — for the war
  declarations 0x6742d0: where the majors of the +0xfa0 list the owner
  fights or is prepared against (0x672bb0) number at most the +0xb50
  list's size >> 1 and the player is neither a declared friend (0x3da770)
  nor an ally (0x3da560), PrepareForWarWith(player, 1) (0x724f30). The
  pick skips a player whose entry it made this turn (+0x1a). The flag
  clears in 0x650890 (a game signal's handler between the two, taken as
  their peace; it also completes the operations whose enemy the owner no
  longer fights, +0x138 below 4) and OnDenouncePlayer (0x681c10) sets it.
  The AI's turn (the callbacks of 0x6096c0 in push order) runs the
  diplomacy (0x64ba90) before the operations (0x722690). The replay's
  sender and OperationsProbe share the seat's operations AI: the fitted
  feed from AI_Diplomacy.csv is gone.
- THE WAR VALUE (0x7b7760) = the spoils 0x7b7ab0 + the balance 0x7b7830
  unless the war is favoured + 0x7b87b0 where a casus belli is named (its
  amount 0 in the declarations' calls). THE SPOILS: the largest current
  unit cost (m_aCurrentUnitCost) of what a known civilian of the player
  becomes when captured (UnitCaptures BecomesUnitType); each known city of
  the player valued (0x79fef0) x (1 + 0.02 x GrandStrategic +0x204), sorted
  ascending, summed v_i / rank, the rank from n + 1 down to 2 (a negative
  value skipped, its rank spent); x 0.5 per other major and x 0.8 per
  city-state the owner fights where the player is a major, x 0.75 / x 0.9
  where it is a city-state; x 1.25 per major and x 1.1 per city-state the
  player fights; the war record (knowledge base +0x668[p] +0xc) a floor
  where positive, a cut to 0 where its negative passes the value; with any
  known WMD of the player (PlayerStats +0x11f0 0x4bf200) or the diplomacy's
  +0xf30 flag: -10000 without the owner's own, then at most 0; with the
  owner's and none of the player's, at least 0; nothing known -9999.
  THE BALANCE: S, T the two players' military strengths (+0x210), R the
  military AI's m_regionalMilitaryStrength[p] (mil +0x588, 0x71fb80's
  second loop: the knowledge base's records of the player's units seen
  within two turns in the areas of the owner's cities, each max(Combat,
  RangedCombat) where it passes the yardstick less 20): -R where T / 4 > R,
  else -min(S, T) where T + 30 > S; + (S - T) x (2 where S <= T, else 1);
  + the deal items between them (0x64d320).
- THE CITY-STATE WAR'S DESIRE (0x66d9d0): -9999 disfavoured; else the war
  value (favoured where the preference is +1); at most one envoy there:
  less, unfavoured, the envoys' worth (0x7a46c0: start 5, the horizon
  m_valueHorizons[1]) and 800 allied with its suzerain / 200 a declared
  friend of it; more envoys: 0 unless the most envoys any player holds
  there pass the owner's by more than 2 (unfavoured; 0 favoured), then the
  war value favoured, else where the suzerain is a major the owner regards
  below -5 or fights.
- THE READINESS (0x723db0(p, needReady, dist, slot)): the first active
  operation (+0x318, 0x73a840) against p decides: with needReady, ready
  (0x73aa60: +0x5d0, its contract gone, or every team ready 0x73ab20) or
  its units may be built (+0x630, the data of autovar +0x5d8 that Operation
  Diplomacy sets on Desires War); slot -1 yes; else a living member of a
  team (+0x230, 0x118 each; members +0x18) within dist of the team's goal
  slot (+0xe8 + 8 x slot). The wars' can-do 0x673800: CanDeclareWarOn and,
  flagged, 0x723db0(p, 1, 2, 5) — a member within 2 of the march point.
- THE CONTRACTS of the operations' trees are the city build AI's
  (`cpu/core/aiContracts.ts`): Build Unit 0x7f4e00 and the Contract
  Manager 0x7f17a0 are the city trees' nodes. The submission's signal
  +0x270 also runs the economic AI's listener (0x68ab40, connected in
  0x6892d0): a contract for a unit or a building — no district — whose
  PurchaseYield is YIELD_GOLD (vt +0x80 0x5f6830; a building flagged
  +0x159 & 0x10 declines) it takes into its purchase list and makes
  ACCEPTED. A Settle City Op contract no city may take waits ACCEPTED to
  the Contract Manager's turn limit: runs/h1_duelv1128 China's Settle New
  City started t2, failed at its limit t13 with no city's SUBMITTED line,
  its next contract (34) SUBMITTED at Xi'an t14. A contract's turns are
  the queue's turns left (0x17bb40) as the player's turn start left them;
  the city queues it on its turn's choice, before the trees tick.
- THE EXECUTIONS: OPERATION ATTACK (0x80c180; Simple Operation Attack,
  the camps): per team with a target, each member alive with Movement left:
  beyond its reach (max(1, range)) to the planner's spot (0x791300: the
  first reach entry exactly `reach` from the target within 2 turns,
  stackable or its own plot) "Attack Target Move", none found straight to
  the target "Attack Target Move Direct" (Move -9999:-9999); a ranged
  member at the target where it holds units (Plot +0x4c) "Attack Target
  Range Attack"; each member left onto the target "Attack Target Melee
  Attack". ATTACK CITY (0x8109e0): the members with Movement left against
  the COMBAT_DISTRICT targets within 3 of the target (0x80f280) through
  the assignment 0x776140 (unequal blows dropped, no suicide), logged
  "Operation City Attack, type, x:y, Move, Attack"; a district target's
  health (0x776140 type 3) floor(maxHP x ATTACK_HEALTH / 256) - damage,
  its blow the city combat prediction. SIEGE CITY (0x811e80): without
  ABILITY_AUTO_SIEGE, the six plots around the city (0x812950: domain,
  passable, connected) as slots, the members with Movement left and no
  bombard as agents, the generalized assignment 0x8b5bf0 (three passes;
  the start 0x80f9d0, the gain 0x80f6b0 — its multiplier the store at
  [rsp + 0x28] that dis.sh dropped —, the move 0x80f4a0) logged "From,
  Goal:, Move"; encircled (0x24bf70) the ranged members strike "Operation
  Siege City Attack". PILLAGE (0x811390): Pillage Districts, Pillage
  Improvements and Get Goody Huts as the run's flags, a member pillaging
  where it stands. AIR ASSAULT (0x80fb50): the air members by priority
  strike or rebase. BUILD MILITARY IMPROVEMENT (update 0x7e9b10, execute
  0x7e9120): a defensive improvement is one CanBuildOutsideTerritory
  (+0x108 & 0x40, the loader 0xac6bb0) with DefenseModifier above 0; the
  run's unit (+0x20) builds it (+0x24, 0x95a010).
- THE GENERALIZED ASSIGNMENT (0x8b5bf0) at weight and capacity 1: per pass,
  per slot in order, each agent's gain there (where it sits elsewhere, its
  gain there less its gain where it sits), the first largest above 0 takes
  the slot, unseating its holder; passes repeat while one moved. The
  governors' seats (0x6ee100) run it once.
- MEASURED (the action replay on the five verbose duels; the war value on
  the replay's own city values and strengths): the Surprise War's desire
  rows 504 / 682 (1117 88 / 88, 1121 123 / 123, 1124 22 / 161, 1127
  188 / 188, 1128 83 / 122 - most rows the floor 5.0 or -9999); the
  city-state war's 0 / 158, its war value off with the city values
  (CITY VALUES within 0.1 27 / 502 .. 176 / 528) and the envoys' worth
  1.22 times ours (runs/h1_duelv1121 Qin toward 2: the log's Surprise War
  row less its city-state war row 45.0 t29 - t36, 67.0 t37; ours 37, 55).
  The first war candidate per player and enemy 3 of 14 on the log's turn
  (1117 1>3 t20, 1>4 t34; 1121 1>2 t31), the others early (1124 1>3 t13 /
  log t17, 1127 1>4 t5 / t14) or a turn off (1128 1>3 t68 / t69). The
  execution families: "Attack Target" lines log / ours 1124 5 / 0, 1127
  4 / 0, 1117 0 / 2, 1128 0 / 12 within the replayed turns (the camps'
  operation the log runs as Barb Camp Tech Boost); "Operation City
  Attack" 17 and "Operation Siege City" 3 are 1128's Attack Walled City
  (t121), which the port does not start: its Attack Enemy City of t68
  holds the enemy where the game's turned INVALID at once (t69). The
  record's six wars (Qin's Surprise Wars on Rome, runs/h1_duelw1109 t200,
  1110 t124, 1112 t200, 1118 t239, 1120 t216, 1128 t196): the port
  declares none; its first war candidate against Rome comes before each
  (t186, t100, t188, t196, t116, t167), no operation of it reaching
  its march point. Settle New City's turns with every line equal, before
  the shared contracts / with them: 1117 38 / 38, 1121 19 / 25, 1124
  33 / 30, 1127 34 / 14, 1128 35 / 27 (1128 t13's end at the turn limit
  now the game's; 1127 t22's recruit is City Defense's, unported).
- PARTLY READ / unread (AUDIT C-97): GrandStrategic +0x204's writer (the
  leader's war factor, read 0); the diplomacy's +0xf30 and the known WMD
  counts' writers (none); the deal items 0x64d320 (none); the war record
  +0xc's writer (every WAR line logs 0.00); 0x650890's signal (taken as the
  peace); Siege City's first part (the ZOC-ignoring units' adjacent move);
  the air units' contract.

## C-99: the upgrade trees — READ (the trigger, Find Available Unit's upgradeable offer, Find Unit Targets' job, Upgrade Units, the economic AI's upgrade, Move Unit with no Location), ported; the deletion of an excess obsolete unit unported

`upgradeTreesTick` (cpu/core/minorOps.ts, `CityState.upgrading` /
`upgradeTrigger`), `upgradePurchase` (cpu/core/aiEconomic.ts);
`_mops_upgrade_trees`, `_cv_upgrade_purchase`, `_minor_upgrade_unit`
(gpu/core/sim_minorops.py, sim_cityvalue.py, sim_minors.py; `mops_upg`,
`mops_upg_on`, `mops_upg_trig`).

- THE TRIGGER: MinorCivTriggeredTrees (Leaders.xml, the list
  MINOR_CIV_DEFAULT_TRAIT binds to the system TriggeredTrees) holds
  TRIGGER_TECH_UPGRADE and TRIGGER_CIVIC_UPGRADE, both the tree "Upgrade
  Units" at Priority 3 with no operation (TriggeredBehaviorTrees). The
  event handler 0x800c60 (the trigger row +0x388): a row with no operation
  makes a tree in the manager (0x7fef20, its nodes 0x7faa60; none, it is
  dropped) and starts it at the row's priority (0x7cb230) — one tree per
  technology or civic gained, no test of a tree already running.
- THE TREE: Concurrent 0 over Find Available Unit 1 (Upgradeable Units
  true, Found Unit the tag Upgrades), Find Unit Targets 2 (Nearest Owned
  City), Upgrade Units 3, Move Unit 4 (Allow Danger false). The handlers
  (registration 0x7db850: the k-th name's id stored at the mov after the
  next name's lea; 0x7cbca0's tables): Find Unit Targets update 0x7ed200,
  Upgrade Units update 0x7f0ea0 / execution 0x7ef850.
- FIND AVAILABLE UNIT, Upgradeable Units (0x7ec7b0): the tree's units of a
  desired type or, upgradeable, each whose upgrade passes the visible test
  (0x58fff0 with r8 1) are found; found none, or upgradeable, the
  evaluator (0x60a8c0, the tree's priority 0x723b90, its job id) offers the
  player's units in no job (+0x7d0 -1) with their turn not done, then those
  of its unlocked operations of a lower priority — Naval Superiority's at
  2 under the trees' 3, City Defense's at 4 never — and each the test (the
  lambda @d74188, the visible test) passes joins the tree (addMember
  0x737e80), leaving its operation. None found: FAILURE.
- FIND UNIT TARGETS (0x7ed200, "Nearest City Search"): a job per tree unit
  (its vtable @d741d8, run 0x7eba40); a plot found becomes the unit's
  target (+0x7d8 -> +0x830, 0x7eb220). The job for a unit that is no Great
  Person: over the player's cities (+0x12f0 +0xd8) the nearest by plot
  distance — its centre; for a unit of domain 0 (the sea) whose centre is
  not coastal land (0x82a10), the city's Harbor (0xcbecc739) plot
  (0x1ae530), the plot water or coastal land; an upgrade asking a
  district (DB.Units +0x2c8 +0x14) the city lacks (0x510d30) skipped.
  SUCCESS where some unit has a target, else FAILURE.
- UPGRADE UNITS: update (0x7f0ea0) SUCCESS with the tree holding a unit,
  else FAILURE. Execution (0x7ef850), a player no human drives, over the
  tree's units in the player's order (0x6092c0): the full test (0x58fff0,
  r8 0: the research, the territory "MUST_BE_IN_TERRITORY", the Gold
  "INSUFFICIENT_FUNDS", Movement) passing, the economic AI's upgrade
  (0x68c940) — else, with Can Delete (no data: true), the deletion
  (UNITCOMMAND_DELETE, 0x73cd1698) of an excess obsolete unit: no
  district asked by its upgrade (0x591000 -1), or at most one promotion and
  more than 10 of its type (0x4f2c90); the full test failing and the
  visible one too: released (+0x778 -1, its turn done 0x570b40) and, Can
  Delete, deleted; the visible one passing: Can Delete, on its own ground
  and no district asked, deleted.
- THE ECONOMIC AI'S UPGRADE (0x68c940): the cost (0x590520, << 8): the
  UNITS (+0x540 slot 1) and SLUSH (slot 0) slots together at the cost or
  more spend the UNITS slot, the rest from SLUSH; else a balance (+0x1b8)
  above the cost takes from each slot in order what it holds; the balance
  lowered by what was taken; then UNITCOMMAND_UPGRADE (0x9576d0) where it
  may start (vt +0x48 / +0x58). Bought: 1, else 0.
- MOVE UNIT with no Location (0x7f0020 from 0x7f067c): over the tree's
  units, each with a target (+0x830) reaching it within a turn with
  Movement left (0x791300, the flag set) or whose target holds danger
  (0x716a60, Allow Danger false) passes; one with no planning (+0x1fc0
  null) or none reaching it RUNNING, else SUCCESS. The tree's units have
  their turn done each tick (0x7d2190), so they plan no move: the tree
  RUNS while it holds a unit, its execution (0x7eeba0) moving each to its
  target.
- MEASURED: runs/h1_duelw1121 city-state 3's Galley in Naval Superiority
  (priority 2) leaves it at t89 as Cartography lands ("Operation Recruit,
  0 units", "Operation complete"; Naval Superiority Started t90), goes
  home, a Caravel from t92; the Caravel leaves the next at t177 as Steam
  Power lands. runs/h1_duelw1128 Hong Kong from Gunpowder at t144 holds its
  six units with 0 Gold (Player gold 0, its yield 9.6): no tactical row
  t144-250 but four, City Defense recruiting none ("No recruits to match
  strength") and completing each turn t167-183. A minor's upgrade is
  `MINOR_UPGRADE_GOLD` (the census; 0x590520 at the minors' 100% discount).

## C-97: City Defense and the assault target's validity — the city's threat, the defence event, Is City Threatened, Garrison City and the district target's validity READ; the threat's level terms, the garrison's swap and the team's unit to build unread

The one operation manager is `cpu/core/operations/` (manager.ts,
operation.ts, nodes.ts, recruit.ts, types.ts, evaluate.ts, assault.ts,
knowledge.ts, cityValue.ts, cityThreat.ts; its tables
`cpu/data/aiOperations.ts`): the majors' AI and the city-states run it, a
party that settles handing it its settling AI. Measured by the replay's
OperationsProbe over the AI majors and the city-states (runs/h1_duelv1117
/ 1121 / 1124 / 1127 / 1128, AI_Operation.csv).

- THE CITY'S THREAT (0x5cbd10; CityBuildAI autovariable m_cityThreat at
  +0x160, its data +0x1b8, set by the city's update 0x5ce680 — a
  city-state's update sets it and returns): per player of the game's list
  (+0x4a0) but the owner and a declared friend (0x3da770): a full civ the
  owner fights (0x469cd0) or that has denounced it (0x3da5e0) or that it
  denounced (0x3da8e0), and the barbarians, are hostile (margin 5.0);
  another full civ, margin 20.0 (0x1400) or the centre's garrison term
  where higher (0x5cc088: 0x24a180(centre, out, 0, 0), the garrison's
  Combat and formation strength less its wounds less the holder's base,
  `garrisonTerm`; runs/h1_duelw1117 Antananarivo t214, t222, t225 and
  h1_duelw1127 Mexico City t226, t233 start City Defense as logged and
  1127 t201-207 start none as logged, where the centre's whole strength as
  the margin did otherwise; the five duels' city-state starts 54 -> 59 of
  140, aiscore); a city-state the owner does not fight is
  skipped. An undamaged city with an operation of the owner against the
  player whose target lies within 5 of it (0x723cf0: each operation of the
  owner's list +0x318 valid (0x73a840) whose enemy +0x2a0 is the player
  itself — an operation against no enemy, a camp's, never; asked ready
  where its third argument is set, here not) skips the player
  (runs/h1_duelw1121 Hunza t13: its Attack Barb Camp's target 10:2 three
  from the city, the barbarian Quadrireme at 11:2 starts City Defense,
  which recruits the camp operation's Warriors; the camp operation
  completes, empty, the same turn). The
  knowledge base's units of the player within 5 (a full civ's) or 3
  (0x5eadb0) each by its unit row: s = max(Combat +0x48, RangedCombat
  +0x6c, Bombard + 20 where +0x40 is above 0), counted where it bombards,
  where ranged and s above D - 15.0, or s above D - 5.0 (D the centre's
  GetDefenseStrength, 24.8, without its garrison: 0x5cbd72 calls 0x24ae80
  with r8b set, which 0x24a180 takes as skipping the garrison term; the
  garrison stands in the margin alone — runs/h1_dueld1128 Hong Kong
  t144-148 holds threat 1 through its Man-at-Arms' garrison, its knowledge
  base's records of China equal to the replay's: Trebuchet 9:8, Crossbowman
  10:8, Courser 8:10), an explorer (PSEUDOYIELD_UNIT_EXPLORER) never,
  nor a barbarian's (0x484910) of a type in the barbarian manager's list
  (+0x298, its vector +0x2f0; 0x153e40), which its start (0x153720) fills
  with each Units row tagged CLASS_ANTI_CAVALRY — the camps' defenders
  (runs/h1_duelv1121 t4-t12: a barbarian Spearman 3 from city-states 2's
  and 4's cities, 25 against 18 + 5, starts no City Defense; t13 a
  Quadrireme beside it does);
  their sum at D plus the margin or more threatens the city, at level 2 —
  +1 above 2 of city +0x1a60, +2 with +0x5e8, +1 with +0x1c78's list, +
  +0x588 / 5, all unread — at most 1 for a player not hostile; the first
  such player decides, else -1. The units within 2 above 5.0 strength (a
  second 0x5eadb0) set the autovariable +0x1c0 (unread use).
- THE DEFENCE EVENT 0x5cced0 (slot 5): a threat above -1 with the slot's
  operation gone starts the list's operation ("City Defense") at the city
  through the manager's start by name 0x7265b0; the port runs it in the
  manager's turn before the running operations log their lines (the log's
  order: "City Defense, Started" then each operation's "running" line).
- IS CITY THREATENED (0x813050): the target gone (0x73a8e0: a camp off the
  knowledge base's camps, a district target off its city records, a
  friendly city or a settle plot never, any other kind always) or the city
  on the target threatened (+0x1b8 above -1): SUCCESS, else FAILURE.
  GARRISON CITY (0x8133c0): the target gone SUCCESS; the operation's units
  (0x6092c0) any RUNNING, none FAILURE. Its execution (0x810d30): over the
  operation's units in order, the one on the city its garrison (its ranged
  strength or its Bombard less 5, its Combat); of those whose planning
  reaches the city in a turn (0x791300) the candidate by ranged, then
  Bombard less 5, then Combat strength above the garrison's; with no
  garrison and no military unit of the seat on the city (formation class
  neither 0 nor 3), the candidate moves in and fortifies (0x56d6f0) unless
  ranged; with a garrison and a stronger candidate, the candidate moves to
  its planning's spot by the city and swaps in (the swap command 0x972880,
  unported); else the garrison fortifies (0x95eae0) where it has no range
  and the teams' +0x98 - +0x94 is at most 10.
- THE DISTRICT TARGET STILL VALID (0x73abf0, TARGET_ENEMY_COMBAT_DISTRICT):
  the knowledge base's record of the city on the target (owner +0, city id
  +4, kind 2 at +2) — none, invalid; its defenses and walls (0x5eb600) at
  most its defensible districts (+0x58), valid; op +0x124 at 1 valid (the
  definition's TargetParameter by the log, its writer unread); else per
  member of its teams alive (+0x770 clear): one the walls do not hold back
  (unit +0x18b8 / +0x18b9, the counts +0xb94 / +0xc14: a siege assist on
  the city in the port), valid, unless the city's flag (an owner major:
  city +0x158's lookup +0x1c above 0; else player +0x12f0 +0xf4 above 0;
  unread, taken clear); else the combat simulation's blow (0x213e00 ..
  0x205720, dealt +0x24, taken +0x28 — the blow back none in the port)
  against COMBAT_HEAL_CITY_GARRISON (20, GlobalParameters +0x1b8): either
  at 20 or more valid; both below 10: the taken sum above 40 or the dealt
  sum above 20 valid; else a second such member valid; none, invalid.
  runs/h1_duelv1128 China's Attack Enemy City of t73 on a city that raised
  its defenses turns INVALID at t76 with no team member; the port's of t68
  turns INVALID at t76 (the log's first, t69, at once: the port starts a
  turn early).
- THE CONTRACT FOR AN OPERATION'S UNIT: "the team's unit to build, the
  recruit's contract and the knowledge base's camps" below.
- MEASURED (the action replay on the five verbose duels, the majors and the
  city-states on the manager): City Defense started log / port 1117 35 /
  69, 1121 25 / 53, 1124 23 / 27, 1127 132 / 222, 1128 45 / 54 (1128 t15
  Xi'an's on the log's turn; the port's threat leaves and comes back a
  turn at a time where the log's holds); Settle New City's turns with every
  line equal 1117 38 -> 34, 1121 25 -> 30, 1124 30 -> 35, 1127 14 -> 25,
  1128 27 -> 38 (the units City Defense holds); the city-states' Attack
  Barb Camp runs to the game's end with no recruit contract (1128 running
  lines log 183, port 770). The record's six wars (runs/h1_duelw1109 t200,
  1110 t124, 1112 t200, 1118 t239, 1120 t216, 1128 t196): the port declares
  none; its war operations hold no contract and never end, no team reaches
  the march point.

## C-96 / C-97: the team's unit to build, the recruit's contract and the knowledge base's camps — the team update's requirements and readiness, the unit choice, Recruit Units' result and contract, the camps READ; the maintenance resource test, the recruit's stealing and levy unread

Ported in `cpu/core/operations/` (nodes.ts teamUpdate and Recruit Units,
unitChoice.ts, unitRows.ts, manager.ts lookCamps) over
`cpu/core/aiUnitProduction.ts`'s entries; measured by the replay's
OperationsProbe over the AI majors and the city-states (runs/h1_duelv1117
/ 1121 / 1124 / 1127 / 1128, AI_Operation.csv's "Contract for" and
"running" lines).

- THE TEAM UPDATE (0x73fba0; the team: +0x08 its definition, +0x10 / +0x11
  / +0x12 its flags, +0x14 its unit to build, +0x18 its members, +0x30 its
  counts): per requirement (0x1c bytes: +0 AiType, +4 Dependence, +8
  MinNumber, +0xc MaxNumber, +0x10 MinPercentage, +0x14 MaxPercentage,
  +0x18 ReconsiderWhilePreparing) the members carrying its type; one with a
  Dependence counts only where a member carries that type. Each: below its
  MinNumber (with none, its MinPercentage of the members above its count)
  it is needed and the minimums unmet (+0x10), else had; at its MaxNumber
  (with none, where one more passes MaxPercentage of one more member)
  full. Ready (+0x11): the minimums met and, with an
  InitialStrengthAdvantage, the members' strength at the enemy's plus the
  desired (0x723ab0) or more; +0x12 likewise with the
  OngoingStrengthAdvantage. The unit to build (+0x14): with the readiness
  unchanged, the old one where 0x79cba0 still takes it; else 0x79bd30 over
  the needed types (the had ones where none is needed), barring the full,
  against the operation's enemy (op +0x888's player). The reconsider flag's
  unit test (+0x1fb8 +0x738, autovariable +0x778) is unread.
- THE UNIT CHOICE (0x79bd30; its check 0x79cba0): over the military AI's
  unit production table (+0x268, entries 0x168 bytes: +0x00 the unit, +0x08
  obsolete, +0x0e PrereqTech and PrereqCivic held and StrategicResource
  stocked, +0x18 max(Combat, RangedCombat), +0x24 the maintenance resource,
  +0x2c the at-war players' sum, +0x30 every player's, +0x38 per player),
  sorted (0x7976f0, comparator 0x79d3e0): buildable first, then against
  the player its per-player sum, the at-war sum, the all-player sum, the
  strength, each greater first. The first entry standing (+0x0e, not
  +0x08) of a needed type (the GlobalAI bitfield +0x408 +0x400 by unit,
  bit by UnitAiTypes index) and no full type; a later one replaces it where
  its type is a Priority one (UnitAiTypes +0x31: UNITTYPE_SIEGE_SUPPORT)
  over a non-priority one, or with both sums above the chosen's. The sums
  the choice reads run the efficiency table the other way from the value's
  (the entry's row against the opposing unit's column): AI_Operation.csv's
  "Contract for" names the Warrior Monk where the value's way names the
  Scout (1128, 248 of 580 recruit lines equal against 7). The maintenance
  resource's test (0x79c277, after the type tests): an entry whose +0x24
  is a resource stands only where Player_Resources (player +0x1320) +0x350
  of it, the turn's income, exceeds +0x440 of it plus the units' fuel bill
  (0x4ab270: +0x12e8 +0x1168, << 8) — the same sum the turn (0x4a79e0, from
  DoTurn) sets against +0x350 for its shortage. +0x440 is the power
  plants' burn: 0x4a72c0, called only by the power pass 0x4a7cc0
  (xExtraPowerAvailable), adds each burn << 8 to it, 0x4ade20 clears it.
  The port sets the income against the units' bill alone: no city-state
  of the five duels stands a power plant.
  The table's +0x0e (0x7989e0 at 0x798cc2): PrereqTech (0x4cb590 on player
  +0x1338), PrereqCivic (0x39d490 on +0x1310) held and the StrategicResource
  (DB.Units +0x2c8 +0x14) stocked above 0 (0x4aa790 at 0x798d11, ownership
  0: the stock less its reservations), never a plot owned; an entry whose
  prerequisites are unheld is still listed where the signal +0x168
  (0x79ba50) answers. OPEN: runs/h1_duelw1121 city-state 3's Naval
  Superiority asks the Warrior Monk on an empty team (MELEE needed) and the
  Trebuchet with its Caravel (the had types), never the Caravel, the Pikeman
  or the Courser the sums put first — its knowledge base's ARMY lines
  (AI_Knowledge.csv t92) the replay's records, the team's MaxPercentage test
  ((members + 1) x the percentage, 0x740562) as ported; no city-state's
  "Contract for" on the five duels names a Caravel, a Pikeman, a
  Crossbowman, a Courser, an Infantry or a Field Cannon. The sums are the
  game's: runs/h1_duelt1121 city-state 3 t92 (AI_UnitEfficiency.csv over
  the aimem knowledge base, row the entry) Caravel 199.5, Trebuchet 103.2,
  Crossbowman 102.6, Pikeman 89.3, Warrior Monk 72.0 — the port's to the
  0.01. The entry's +0x0e (0x7989e0: PrereqTech 0x4cb590, PrereqCivic
  0x39d490, the stock 0x4aa790) and +0x08 (0x538460: ObsoleteTech +0x240,
  ObsoleteCivic +0x238, MandatoryObsoleteTech +0x250, MandatoryObsoleteCivic
  +0x248) hold for the Caravel and the Pikeman there (Cartography, Military
  Tactics held; Combined Arms, Composites not); the comparator 0x79d3e0
  (+0x0e, then +0x38[player] where the player is not -1, +0x2c, +0x30,
  +0x18) and the walk (0x79bfe6: +0x0e, +0x08, a needed type by the GlobalAI
  bitfield, no full type, the priority rule, the maintenance test, both sums
  above the chosen's from -1.0, the last taken) as ported. Yet the game asks
  the Warrior Monk on the empty team (MELEE needed: the Caravel and the
  Pikeman above it) and the Trebuchet with the Caravel joined (the four had
  types: the Caravel above it). The game does name a Caravel (runs/
  h1_duelw1125 city-state 4 t187-, 41 lines) and a Pikeman (runs/
  h1_duelw1111 city-state 2 t241-243); a Crossbowman or a Frigate never, on
  any recording, a major's or a minor's. The aimem tree_nodes blocks of the
  Naval Superiority Tree (runs/h1_duelt1121 t93) hold the nodes' tag
  references (a pointer, a type, a slot), not the choice. Unread: what bars
  the Caravel and the Pikeman.
- RECRUIT UNITS (0x81c820; its data: +0x00 Already in progress, +0x10
  Contract ID, +0x20 Recruit Range, +0x30 Allow creation, +0x40 Recruit
  Value, +0x50 Time Limit, +0x60 Allow Stealing): "Contract for" names the
  first team's unit to build (0x739cd0), NONE for none; done (+0x88) with no
  units FAILURE; the tag's contract FAILED: FAILURE; COMPLETED: it leaves
  the tree; with creation and a unit, the unit asked (+0x8c). Not done, not
  ready (0x73aa60) and not in progress: RUNNING with a contract or a unit
  asked, else FAILURE; otherwise done, SUCCESS. Its execution (0x8189f0):
  for an AI player with a unit asked and a Contract ID — the tag's contract
  accepted or in progress for that unit stays, any other is cancelled
  (0x5cc8e0) and leaves the tree — a new contract (0x5f47c0): the unit, the
  Recruit Value (x 3 for a unit row +0x40 above 0), the Time Limit as its
  turn limit (autovariable +0x168, the contract's +0x1c0), the tree's,
  submitted (0x60bb50) and held under the tag. The levy (Allow Levying,
  0x449b70, "LEVIED FROM") is unread. THE SECOND OFFER (0x60a8c0): the
  evaluator's satisfied test (vtable @0xd760f8 +8, 0xb3c380) answers false
  always, so after the first offer (the units in no job, not done, alive)
  player signal +0x1c8 is raised (0x6075b0) with the recruit's priority (the
  tree's +0x5a8, else its operation's 0x723b90: the root tree's +0x548, its
  definition's Priority, 0x73a120 -> 0x7cb230), its value, its job and the
  node's Allow Stealing (TreeData +0x60, no default: false); each behaviour
  tree listens (0x7cbb40 binds tree +0x628 to 0x7d1e40): a tree not the
  requester's job, marked (+0x3c8, set by its reset 0x7d3670) or asked with
  Allow Stealing, of a priority below the request's (or marked, of equal
  priority and a value below), answers with its units (0x6092c0 by its job
  +0x488) alive and alone (+0x1fb8 +0x738 1); those not done (+0x530) are
  offered again — the evaluation logged a second time — and taken units
  leave their job. A city event tree's priority is its list entry's Value
  (+0x470, 0x5cc910 / 0x5ccc10 / 0x5cd150; the city-states' lists none: 0).
  runs/h1_duelv1121 t7: city-state 2's Attack Barb Camp logs its "No
  recruits" pair twice — the Builder made at t6 held by a city tree; t6 and
  t8 once. Not ported: the engines keep no tree priorities, marks or turn-
  done flags, and a city tree's Builder never fits a combat team — the
  second pair is a log line, no unit moves on it.
- THE KNOWLEDGE BASE'S CAMPS (CivKnowledge m_barbarians +0x638, 0x10 bytes:
  the plot, an age, the camp's unit): the look (0x7877e0) walks every plot —
  one the player sees (visibility +0x290 above 0) its units and camp, one it
  has revealed (the byte +0x2f0, 0x787bee..0x787cd5) its city and camp —
  and adds each camp (plot +0x44 the barbarians' camp) through 0x5f0110;
  the update (0x5ebb30) drops one whose plot the player sees or has
  revealed with no camp: the list is the camps on the plots it has
  revealed. A city-state's revealed plots are those its looks have seen
  (`CityState.revealed`, `cityStateSight` at each look). Its operations'
  camp targets and Is Target Gone read them: a city-state knows the camps
  on plots it has revealed, not every camp (1128 players 2 and 3: no
  Attack Barb Camp in the log, every camp of the map in the port before).
- THE KNOWLEDGE LOG (AI_Knowledge.csv, "START LOG", 0x5ed280) is written by
  0x783980 at the end of 0x785f30, after the ageing and the look. A camp
  placed in turn N on a plot a minor had revealed is in its log at N+1 and
  its Attack Barb Camp candidate first at N+2 (runs/h1_duelv1124 player 2's
  8:14 placed t5, revealed by its Warrior at 9:13 t2 and 10:14 t4: logged
  t6, a candidate and Started t7; 1121 player 2's 10:2 and player 4's
  34:23, 1127 player 4's 6:8 the same); a camp a minor first sees by its
  moves is a candidate the turn the log first lists it (1117 player 2's
  13:12 t4, 1124 player 4's 41:7 t54). The minor's operations' evaluation
  runs before that turn's ageing and look (`minorMilitaryTurn`, then
  `minorKnowledge`), though the job list (0x6096c0) names the target list
  0x785f30 before the operation manager 0x722690 — the look the log follows
  runs on player signal +0x1f8, its moment in the turn unread.
- MEASURED (the replay on the AI majors and the city-states, before /
  after, runs/h1_duelv1117 / 1121 / 1124 / 1127 / 1128): the candidates
  against no enemy with every line equal 99 / 196, 231 / 428, 122 / 411,
  252 / 440, 24 / 359; Attack Barb Camp's "running" lines (log 132, 77,
  277, 123, 183) 769 / 89, 464 / 51, 932 / 490, 913 / 126, 770 / 203;
  "City Defense, Started" (log 35, 25, 23, 132, 45) 67, 53, 24, 236, 55. City Defense starts on the log's turns (t15, t87); where the
  port's flickers (t88 - t114) its Recruit Units fails, done with no unit,
  its units taken by the older operation in slot order (t87's Archer).

## C-97: the majors' diplomatic actions — the pick, the state machine and the receiver READ, the evaluator's terms PARTLY READ

AI::Diplomatic (player +0x1280; DiplomaticActions.cpp, DiplomaticState.cpp,
Diplomatic.cpp). The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents). Evidence: the verbose recordings runs/h1_duelv1117 / 1121 /
1124 / 1127 / 1128 (AI_Diplomacy.csv's action rows, DiplomacyManager.csv,
DiplomacySummary.csv).

- THE LOG'S ACTION ROWS (0x652800): per action and player, ", %3.1f:%3.1f"
  is FIRST 0x66cc40 (the evaluation record's +0x48 vector, "Desired" in the
  record's own dump 0x676510) and SECOND 0x66b490 (+0x68, "Cost") of the
  record m_diploActionEvaluator[p] (+0x2eb8, stride 0x88). The records are
  refilled per action by 0x670210: +0x68 from the action's COST functor,
  +0x48 from its DESIRE functor, the fourth argument the owner's diplomatic
  AI. 0.0:0.0 on an attempt turn (the record reset by the perform).
- THE FUNCTORS (registered per action in 0x672210, slots +0x08 cost, +0x28 desire,
  +0x48 can-do, +0x68 not-ready hook, +0x88 perform, +0xa8 fresh value):
  Delegation 0x66b590 / 0x66cd40 / 0x672f90 / - / 0x674960; Embassy
  0x66b610 / 0x66cf30 / 0x6730e0 / - / 0x674a10; Demand Tribute 0x66b220 /
  0x66c800 / 0x672df0; Open Borders 0x66bb50 / 0x66dda0; Declare Friendship
  0x66ae10 / 0x66c160 / 0x672c40 / - / 0x674820; Request Assistance
  0x66bf30 / 0x66e750 / 0x6737b0; the war declarations 0x6742d0 (one).
  The action indices are globals of the static initializer 0x67ff10
  (Embassy @f2e564, Demand Tribute @f2e568, Open Borders @f2e56c,
  Delegation @f2e58c, Declare Friendship @f2e594, Propose Trade @f2e5d4).
- STATE WORTH / COST (0x6718a0 / 0x671650): the DiplomaticStateActions row
  of the owner's state toward p for the action (Worth +0x24, Cost +0x18),
  less the action's gold cost valued at the owner's Gold weight (0x527610 ->
  0x7a6690), both sign-clipped by the owner's preference of the action
  (+0x6240, the AiFavoredItems lists; favored keeps Worth >= 0 and drops a
  positive gold value) or else p's (+0x62b0); the worth adds +0x6320[p][a]
  (0x6504f0). No other instruction of the DLL names +0x6320 than its getter
  and the save's serializer: its writer is unread.
- THE TRUST TERM T (0x671b80): 0 unless the owner's trust of p (+0x6480[p])
  is non-zero; else, with n = 1 + the players trusted more (0x650550) and L =
  trunc(+0x6420 x 0.25 / 0.5 / -) for modes 0 / 1 / 2, T = (10 / 20 / 40) x
  (L - n + 1) / L where n <= L; negated when the caller asks.
- THE DESIRES READ: Delegation (0x66cd40) and Embassy: Worth + T, then +20
  where the owner's diplomatic AI names p (vt+0x30 = 0x657d90: p == the
  +0x6780 player, set by 0x647bb0 at the AI turn's close); two flagged
  branches give max(X + 20, 20) instead (AI owner and a human p; both AI).
  Demand Tribute (0x66c800): Worth, -10 where +0x6780 names p, + (20 - T in
  mode 1) where the owner's military strength (0x4bd0d0(-1): PlayerStats
  +0x210) is above twice p's or its era (player +0x1358 +0xf8, the Eras
  row's ChronologyIndex) is later. Open Borders (0x66dda0): Worth - T, + (40 -
  d) x 0.5 (whole part) for the least plot distance d (1..39) between p's
  cities in the knowledge base and the owner's, +10 where +0x6780 names p.
  The cost functors: Cost - T.
- THE PICK (0x64ba90, the diplomatic AI turn): the state turn below first;
  then, repeatedly, every met player p not yet acted on this turn, whose
  entry is valid, unchanged this turn (+0x1a) and with no pending session,
  offers the actions of the owner's state toward p (the entry's list): an
  action is skipped DISFAVORED by the owner's or p's preference, with desire
  <= 0, refused by the game's CanDoAction (0x3dd9a0), or NOT READY (0x672ef0:
  the per-player per-action flag +0x6390, then the can-do functor); a
  favoured action (the owner's or p's preference) beats any other, else the
  higher desire. The best is performed (0x674900), p marked, and the scan
  runs again: at most one action per player per turn.
- THE MISSIONS' CAN-DO (0x672f90 / 0x6730e0): an AI owner; the Economic AI
  affords the action's gold cost from savings slot 2 (0x6874d0: slot 2 >=
  half the cost and slot 0 + slot 2 >= the cost); CanDoAction; and the last
  diplomatic turn with p (diplomacy +0x11b8[p] via 0x3d9450, writer unread)
  + GlobalParameters AI_TURNS_BETWEEN_PEACE_OFFERS (3, +0x20) below the
  turn. The perform (0x674960) sends the action ("Processing Action From AI
  to AI") and spends the cost from savings slot 1 (0x68acd0).
- THE ECONOMIC AI'S SAVINGS (0x687bf0, each AI turn): the treasury's change
  since the last balance (+0x1b8) shared over the four SavingTypes by the
  AiLists DefaultSavings weights (SLUSH_FUND 3, UNITS 4, PLOTS 1,
  GREAT_PEOPLE 1 of 9), a slot below 0 cleared, slot 2 capped at 150 (the
  excess to slot 0); a spend (0x68acd0) takes its slot, the overflow from
  slot 0, and lowers the balance by the amount.
- THE RECEIVER (the Delegation's handler 0x237c60, the Embassy's 0x238330):
  an AI receiver answers by 0x653f60: an action outside its state's lists
  toward the sender refuses; else the value 0x66b490 of its incoming record
  (+0xca8[sender]) above 0 refuses, at or below 0 accepts. On acceptance the
  cost moves from sender to receiver and the mission is set; then the
  sender's AI records the answer (0x6543a0: a refusal returns the cost to
  savings slot 2; answer 12 sets +0x6338[p][a]). Confirmed on every answer
  of the five verbose duels (20 / 20): accepted exactly where the
  receiver's own logged cost of the action toward the sender is <= 0 —
  every refusal in Unfriendly (Cost 75 / 100), every acceptance in Neutral
  (runs/h1_duelv1127: the Delegation refused 61, 68, accepted 79; the
  Embassy refused 117 ... 186, accepted 191 at Rome's Neutral).
- THE STATE TURN (0x67b6e0, the entries built by 0x67aff0, their terms by
  0x67aaf0). Each DiplomaticStateTransitions row out of the state, in table
  order: REQUIRED when RequireTransitionMax <= opinion (else, without it,
  opinion <= RequireTransitionMin) and the AllowTransitionCheck passes —
  the first required row is taken (OnTransitionAction fires); else ALLOWED
  when AllowTransitionMin <= opinion <= AllowTransitionMax and the check
  passes, weighing the sum of s(a) over the AI-allowed, non-leaving actions
  the target adds, less the sum over those it drops, plus the best s(a) of
  the actions leading into the target (s = desire where CanDoAction, else
  0); the heaviest positive row is taken when the target state has a row
  for every action the owner now desires (desire > 0). Read off the
  records: Neutral -> Unfriendly adds only Demand Tribute, so Rome moves at
  opinion <= 5 exactly while its Demand Tribute desire is positive
  (runs/h1_duelv1127: -10 from 71 to 96 and Neutral at opinion 5; 15 at 97
  and Unfriendly; from 105 Unfriendly at 5 and Neutral the next turn, the
  required return, every turn); Neutral -> Friendly adds Open Borders and
  Request Assistance, so Qin moves at opinion >= -5 when its Open Borders
  desire turns positive (1127 t192, 1124 t108, 1128 t167, 1117 t235: 0 at
  234, no move). Unfriendly -> Neutral and Friendly -> Neutral drop actions
  and are taken only when required. Friendly -> Declared Friend at 25
  (CanDeclareFriendship 0x67c740: CanDoAction, not-ready, the last
  diplomatic turn + AI_TURNS_BETWEEN_FRIENDSHIP_OFFERS (5) toward a full
  civ, the Declare Friendship desire of the incoming record >= 0) never
  passes in the 29 duels (151 Rome lines at 25 and 26 stay Friendly).
  The required rows alone hold 4,828 / 5,049 of Rome's state lines and
  5,300 / 5,341 of Qin's over the 29 duels and the five verbose ones (following the log
  after a miss).
- PARTLY READ / unread (AUDIT C-97): the +0x6320 term (the desires' D of 0,
  20, 40 over the records), the focus player +0x6780 (0x647bb0: the met
  major ranked by its own AI's vt+0x18 = 0x650270 entry +0x630, recency
  0x2a81f0 against GlobalParameters +0x268), the trust +0x6480 writer and
  +0x6420, the Gold weight inside the valuation (the logged costs give
  gold values of 6 to 74 for 25 / 50 gold), the last diplomatic turn's
  writer (+0x11b8; the Embassy's retries come 4 to 10 turns apart), the
  savings' other spenders (purchases' slots), the remaining functors (Open
  Borders' knowledge-base distance, Request Assistance, Declare Friendship,
  the war declarations, Propose Trade and the deals), CanDoAction
  (0x3dd9a0), and the checks CanDenounce / CanGoToWar / CanOfferAlliance.

## C-97: the religion AI — the belief scores READ (the job, the value, the analysis's attach), the picks READ, the analyzers PARTLY READ

AI::Religious (the player AI's, constructor 0x74af30; members m_isInitialized,
m_priority, m_favoredReligion +0x168 (data +0x1c0), m_mustFoundPantheon
+0x1c8 (+0x220), m_isReligionComplete +0x228 (+0x280), m_onlyConvertOwnCities
+0x288 (+0x2e0), m_yieldPriorityBoost +0x2e8 (+0x340), m_beliefAnalyzers,
m_managedContracts, m_religiousUnitContract). Its log AI_Religious.csv
(header 0x750500, writer 0x750e30: "%d, %d, %s, %3.1f" per entry). The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents).

- The signals (0x750830): the AI turn 0x74fbf0, the faith boost 0x74f5a0,
  the founding 0x750fe0, the belief add 0x751430, the Belief Analysis start
  0x74ea60 (registered for a full civilization only, 0x469db0), 0x751830,
  0x74e390, the game's 0x7513f0.
- THE BELIEF LIST (+0x3b0, count +0x3c0, 0x30 each): +8 the belief, +0xc its
  class (Beliefs +0x40 -> +0x14: Pantheon 0, Follower 1, Worship 2, Founder 3,
  Enhancer 4), +0x10 taken, +0x14 the score (24.8), +0x18 the belief's
  analysed modifiers (0x750350, 0x6cef90). The job "Belief Analysis"
  (pushed by 0x74ea60 once every city's CityBuildAI analysis stands,
  spawned) scores each entry (0x750230 -> 0x7500d0): taken and -1.0 where a
  pantheon holds it (0x3408d0) or a religion does (0x340950), or where the
  player's own religion holds a belief of its class; else 0x7a7400(belief,
  the rate, start 0, `m_valueHorizons`[2] = speed(200) = 100 online). A
  player the job never runs for logs -1.0 throughout (every city-state,
  Free Cities and barbarian line of the 29 duels).
- THE VALUE (0x7a7400): FX(-9999) where start >= horizon; else the modifiers'
  sum 0x7a4b20 in a context of the player (+0x40 its id, +0x80 it) and a
  religion (+0x48): the one it founded (0x497520), else its majority
  religion (0x497240).
- THE ANALYSIS (0x6cede0) CLEARS the context's whole number (+0xc0) as it
  starts; each subject's analyzer adds to it. EFFECT_ATTACH_MODIFIER 0x6ab630
  analyses its attached modifier (parser 0x6ab400: ModifierId) in a copy of
  the context (0x142650) on the subject and SETS +0xc0 to that analysis's
  total — an attach over many subjects is worth its last admitted subject's
  (runs/h1_duelw1124 t2 Rome: Feed the World 68 = Shrine 34 + Temple 34, one
  city's whatever the cities known; Choral Music 75 = 25 + 50).
  EFFECT_GRANT_ABILITY 0x6b5b30 adds each ability modifier's analysis. Where
  no subject passes, the analyzer's slot 2 (0xbe4aa0, nothing, but for
  EFFECT_ADJUST_DISTRICT_GREAT_PERSON_POINTS 0x6a4750).
- The collections: COLLECTION_ALL_CITIES 0x69f320 / 0x69f340 walks the
  player's KNOWLEDGE BASE's cities (player +0x12b8, its entries, setting
  +0x70); COLLECTION_ALL_PLAYERS 0x69f6c0 / 0x69f6e0 stands once on the
  context as it is (the evaluating player); COLLECTION_OWNER 0x69fc90 /
  0x69e790 once, the context's city (+0x70) where one is set;
  COLLECTION_CITY_DISTRICTS 0x69fdf0 the city's districts (+0x78, plot +0x88);
  COLLECTION_PLAYER_UNITS 0x69ec70 (+0x90).
- The requirements: CITY_FOLLOWS_PANTHEON 0x6cfbf0 (the city's owner +0x1b8
  is the context's player); CITY_FOLLOWS_RELIGION 0x6cfcb0 (any city with no
  religion in the context, else its religion +0x1910 is it);
  PLAYER_HAS_PANTHEON 0x6cfbd0 (the context's player is +0x40's — the
  evaluating player); PLAYER_IS_RELIGION_FOUNDER 0x6d27a0 (no religion: held;
  else 0x497cc0). A requirement the registry lacks
  (PLAYER_HAS_AT_LEAST_NUMBER_CITIES) is left out of the set.
- The analyzers read (args in the parser's order; "span" PV(H) - PV(T),
  "between" 0x7a2140): EFFECT_TERRAIN_ADJACENCY 0x6b76f0 and
  EFFECT_FEATURE_ADJACENCY 0x6aee30 (Amount, YieldType, Terrain/FeatureType,
  DistrictType): a city with the district counts the district's plot and its
  six neighbours of the terrain (plot +0x2c) or feature (+0x3c), without one
  the plots within 3 of the centre (0x6c7690 / 0x6c78a0); BOTH WALKS TAKE THE
  PLOT'S OFFSET (x, y) AS AXIAL, standing on the plot at column x + y/2 of
  the row (runs/h1_duelw1124 t3, China's capital at (3,10): no Desert within
  3 of it, four within 3 of (8,10) — Desert Folklore logs 22 = whole(4 x
  0.25 x 22.89); three Jungle there, Sacred Path 17); the feature's is gated
  on the city AI's plot evaluations holding the feature (0x5d2df0, +0xcf8
  0x78 each); Amount x the count at the player's weight, span.
  EFFECT_ADJUST_CITY_CULTURE_BORDER_EXPANSION 0x6abc40 (Amount as fx(x
  0.01f), 0x6ab8a0): the context city's (+0x70; none, nothing) Culture x
  it, weighted, x 0.5 (0x16eb20 is the multiply, @0xd20458 = 0.5f), span
  ("C-97: the governor AI"). EFFECT_ADJUST_CITY_GROWTH 0x6beb00 (+0x64 cleared): the growth
  object's surplus (0x1b5620), 2.0 with no city, x fx(Amount x 0.01), bare
  Food, between. EFFECT_ADJUST_CITY_ALL_MILITARY_UNITS_PRODUCTION 0x6b5d50
  (Amount, StartEra, EndEra): the player's era (0x467eb0) in the window, the
  city's Production x fx(Amount x 0.01), weighted, between, halved (sar 9).
  EFFECT_ADJUST_PLAYER_FAITH_FROM_DISPERSAL 0x6bdd40: min(the knowledge
  base's camps +0x648, 5) x Amount, Faith weighted, discounted from the start
  (0x7a1240); EFFECT_ADJUST_PLAYER_HEALING_FROM_DISPERSAL 0x6a6d20: the camps
  x ceil(Amount / 10) as PSEUDOYIELD_UNIT_COMBAT (@0xf2e254), the same.
  EFFECT_ADJUST_DISTRICT_GREAT_PERSON_POINTS 0x6a4680 (parser 0x6a44b0: the
  class +8, its pseudo-yield +0xc, Amount +0x10 kept whole): the Amount read
  raw as the pseudo-yield, between; slot 2 0x6a4750 half the Amount as fx.
  EFFECT_GRANT_UNIT_IN_CITY 0x6abe40: the greater of the unit's current cost
  (0x4f2b20) and its value 0x7b62c0, x Amount, added whole.
  EFFECT_ADD_RELIGIOUS_BUILDING 0x6bb1f0: the greatest over the player's
  cities of the building's value 0x7a7590 from the start to the horizon.
  EFFECT_ADJUST_DISTRICT_AMENITY 0x6a1170 (0x79f7c0), _DISTRICT_HOUSING
  0x6a5d20 and _BUILDING_HOUSING 0x6c0490 (0x7a3d70, CityBuildAI's).
  Unregistered, worth 0: EFFECT_ADD_RELIGIOUS_BELIEF_YIELD (every Founder
  belief logs 0), the religious spread / combat / healing effects, the unit
  purchase cost, the culture bomb.
- THE PICKS. The pantheon (0x74e2b0, from the AI turn while
  m_mustFoundPantheon holds, then 0x33fb70): the first strictly highest
  pantheon entry not taken. A belief for the religion (0x751430): entries not
  taken of class 1..4 whose class the religion has room for (0x3409a0 ->
  0x340740: MaxInReligion); a higher score, or any while none stands,
  replaces the best; a Follower replaces a best of another class whatever it
  scores, and once one stands only a better Follower does. The founding
  (0x750fe0, after waiting for the job): the leader's FavoredReligions, then
  the civilization's, the first not founded (0x340490), else "Random
  Religion Choice" over the religions not founded but the pantheon's row and
  the one flagged +0x40 bit 1; then the beliefs, 0x751430 per belief the
  founding grants.
- THE FAITH BOOST (0x74f5a0, m_yieldPriorityBoost [Faith]): 0 each turn; for
  a full civilization's AI with a favored religion, the religious unit it
  wants (the Units with a Faith purchase yield, by CityBuildAI's unit value
  0x5d4cd0 in a city that may buy it, 0x172820, worth more than its Faith
  cost valued or with twice the cost in hand; then the heroes) gets a
  contract, and the boost takes -0.25 (@0xd2f324) once the balance passes its
  cost, -0.25 more once the Faith per turn (0x496fd0) passes half of it.
- Measured (the action replay, runs/h1_duelw1117, 1121, 1124, 1127, 1128):
  the picks on the log's own scores — pantheons 5 of 5, the religions'
  beliefs 17 of 17 (the founding's Follower then a Worship belief, the
  Enhancer and Founder after); on the port's own scores the pantheons 5 of
  5, the beliefs 8 of 17 (the Follower: Choral Music over the log's Feed the
  World, whose Shrine housing — 0x7a3d70 — the port leaves at 0). Score
  lines 60,837 of 70,741 equal, 2,427 of the 11,214 the log scores above 0;
  the pantheon beliefs whose analyzers stand (Fertility Rites, God of the
  Forge, Desert Folklore, Sacred Path, Divine Spark) equal to the turn the
  knowledge base takes a second city.
- Unread: the unit value 0x7b62c0's tail (the Settler's: GOLDENAGE_POINT of
  0x2c43b0 + 1.0, the copies, the promotion weight, PSEUDOYIELD_UNIT_SETTLER,
  the maintenance, then the settle AI's 0x6fe2b0 and 0x17a600 for a founder
  — Religious Settlements 198 at t3 against the cost's 40), the building
  value 0x7a7590 for a major's city (the Worship beliefs), the military AI's
  value (Warrior Monks), the ability analyzers (Missionary Zeal), the
  amenity and housing evaluators, the knowledge base's camp list (the port
  reads the camps revealed), the signal that sets m_mustFoundPantheon, the
  faith boost's unit choice, the religious units' targets (0x74ea60's list
  +0x4a0, 0x74cf50 / 0x74d320) and moves, the faith purchases.

## C-97: the proposals and the religion's choices as seat actions — the price READ, the receiver's value READ but the trust term

Ports: the missions, the friendship, the alliance and open borders are deal
items (`cpu/core/deals.ts` MISSION / FRIENDSHIP / ALLIANCE, `sim_deals.py`),
put on the table by the proposer's `offer` and answered by the receiver's
`accept`; the pantheon, the religion founded and its beliefs are the
record's `pantheon`, `religion` and `beliefs` (`foundPantheon`,
`adoptBeliefs`).

- THE PRICE (0x527610, from the handlers 0x237c60 / 0x238330 and the
  evaluator): the DiplomaticActions row's Cost (+0x20) through the game speed
  (0x525400), then less its remainder by GlobalParameters PURCHASE_DIVISOR
  (+0x5b0, 5): the Delegation 25 -> 12 -> 10 online, the Resident Embassy
  50 -> 25. Confirmed: runs/h1_duelv1127 Player_Stats — Rome's treasury
  559 -> 575 the turn after China's Delegation at t79 (its own yield 6, +10),
  1341 -> 1371 after the Embassy at t191 (yield 5, +25).
- THE RECEIVER'S VALUE (0x66b490 = 0x671650 - 0x671b80), solved on the
  receiver's logged rows (AI_Diplomacy.csv, Rome toward China, runs/
  h1_duelv1127; Delegation and Embassy on one turn give two equations):
  Cost(state) - 0.5 x price x (1 + w_gold) - T. t68 (Unfriendly) 58.0 /
  72.5: 1 + w = 1.4, T = 10; t79 (Neutral) -7.0 / -12.5: 1.4, 10; t117
  (Unfriendly) 68.0 / 82.5: 1.4, 0; t191 (Neutral) 2.3 / -4.3: 1.547, 0 —
  the price the 10 / 25 above at the Gold yield's value 0x7a6690. T is
  non-zero on exactly the turns the "Threat and Trust" row's first cell
  toward the sender is (10.16 at t68 and t79, 0.00 at t117 and t191).
- The trust term, the threat it reads and the sender's side: the section
  below.
- THE RELIGION'S NAME: a founding takes a ReligionType (0x750fe0); the game
  names it by Religions.Name; the RequiresCustomName rows are a human's own
  naming, which the AI's choice passes over. The engines carry the type
  (`RELIGION_TYPES`, `civ_religion_type`), no name of their own.
- Measured (the action replay, runs/h1_duelw1117 / 1121 / 1124 / 1127 /
  1128): the record's 26 mission proposals (DiplomacyManager.csv
  SET_DELEGATION / SET_EMBASSY), 7 accepted (DiplomacySummary.csv); the
  receivers' answers in the section below.
  The founding's religion (`religionChoice`) names the record's on 5 / 5
  (Qin's favoured Taoism).

## C-97: the governor AI — the analysis, the choice and the seats READ, the analyzers PARTLY READ

AI::Governors (AI/Governors.cpp, the player AI's; its log AI_Governors.csv,
opener 0x6eef10, header "Game Turn, Player, Governor, Assignment,
Promotions"). The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents). MEASURED on the replayed state
(runs/h1_duelw1117 / 1121 / 1124 / 1127 / 1128): appointments and
promotions as the log's on 8/19, 6/18, 9/21, 6/17, 8/11 turns; assignments
6/9, 4/10, 4/12, 9/10, 5/6. The misses trace to the replayed inputs (the
engine's civics and so its titles, a city-state not yet met, the strategies'
weights, the cities' yields) and to the analyzers below left unread.

- THE TABLES (0x6ef120 sets them up; a game-synchronized variable each,
  data at +0x1d0 and +0x280): per governor in the Governors table's order
  (0xad57f0; the duels' eight, Ibrahim last) 0x40 bytes — +0x8 the governor,
  +0x10 the slots' cities ({owner, type 2, city id}, `m_cityIds`), +0x28 the
  slots' values (`m_values`, 24.8); per promotion in the GovernorPromotions
  order (0xad5830) 0x38 bytes, +0x30 its score. A governor's promotions are
  its GovernorPromotionSets rows in the GovernorPromotions order (the log's
  order: Messenger, Emissary, Affluence, Local Informants...; the XML's set
  order differs).
- THE JOB "Governor Analyzer" (0x6edfc0 starts it on the player's signal for
  a full civilization; 0x6eee50 runs it): each governor's analysis 0x6ee5f0,
  each promotion's score 0x6eedb0.
- A GOVERNOR'S ANALYSIS (0x6ee5f0): the arrays sized to 1 + the player's
  cities + the game's city-states (Game +0x1650), every id {-1, 2, -1} and
  every value 0; nothing more for a governor neither appointed (0x433450) nor
  open to the player (0x4316f0: no TraitType, or a trait its civilization or
  leader holds; a secret society's governor its society's). Slot 0 (no
  city): the value 0x7b0e40(city none) divided by the secret society's level
  (1.0 for every other governor, 0x16e940). Slot 1 + i: the player's i-th
  city (its cities' list +0xd8). For a governor with AssignCityState
  (+0x48 bit 0): slot 1 + cities + k the k-th city-state's capital where it
  has one (0x36f460) and the player has met it (0x3daaf0), else left as it
  was.
- THE VALUE IN A SLOT (0x7b0e40(governor, rate, start 0, horizon 100 — the
  literal `push 0x64` —, the player, the city, the governor's modifiers)):
  - no city: 10.0, 20.0 for a Governors_XP2 AssignToMajor governor;
  - a city for an AssignToMajor governor: FX(-9999) (@0xf04cb0);
  - a city holding another governor (the player's assignment list +0x58,
    {owner, type 2, city} -> governor +4), or not the player's: 0;
  - the player's city else: its Loyalty a turn (0x19d200 on city +0x2a78,
    the identity sum), less the governor's IdentityPressure (+0x20) where it
    sits there; where that is at or below 0, its loss as a yield from the
    turn the governor would establish (start + 5 where it does not sit
    there) to the horizon (0x7a2140), at least 20.0; where the Loyalty is
    below 0 and the governor's IdentityPressure lifts it above, the city's
    value (0x79fef0, unread) more;
  - then the governor's modifiers — its BaseAbility promotions' (the query
    "SELECT ModifierId FROM GovernorPromotionModifiers gpm inner join
    GovernorPromotions gp ... where gps.GovernorType = ? and gp.BaseAbility
    = 1", GlobalAI +0x39c0, built 0x6dfc70) — summed (0x7a4b20) in a context
    of the player, the city (+0x70), the governor (+0x24), start, horizon
    and rate.
  runs/h1_duelw1117 China t2..t30: Defender, Cardinal, Builder, Resource
  Manager 20 on its capital (10 before its first city), Educator 38 = 20 +
  Librarian's 18, Merchant 23 = 20 + Land Acquisition's 3, Ambassador 112
  at Caguana (two envoys' worth, no base: a city-state's city is not the
  player's).
- A PROMOTION'S SCORE (0x6eedb0 over 0x7b0bb0(promotion, rate, start 0,
  horizon 100, the player, its GovernorPromotionModifiers by ModifierId,
  GlobalAI +0x39d8)): from 5.0, over the governors whose set holds it: -1.0
  (and done) where one is not appointed; else the best of its level x 250.0
  for a secret society's governor (0 else) plus the modifiers' sum in a
  context of the player and the city that governor sits in (0x432d80, none
  where it sits in none). The score is at least 10.0 (runs/h1_duelw1117
  t24: Messenger 112 once Amani sits at Caguana, 10 before).
- THE AI TURN (0x6ee100, the second phase): the log (0x6ef6a0: per
  governor "%d, %d, %s, %d" — turn, player, type, the largest of its slot
  values' whole part — then ", %d:%s" per promotion, its score's whole part;
  some players' turn writes it twice, the blocks equal); a human player
  stops there. While the player holds a title for an appointment or a
  promotion (0x430ee0: spent below earned, and a governor of the list not
  appointed — Ibrahim, whom only Suleiman appoints, always is; 0x431ac0): over
  the governors in order, an unappointed one at its best slot value, an
  appointed one at each promotion of its set it does not hold (0x35e320) and
  may take (0x431400) at the promotion's score; the first strictly highest
  above 0 is appointed (APPOINT_GOVERNOR 0xa68659ab) or promoted
  (PROMOTE_GOVERNOR 0x7d3da99d), executed at once (0x48a330 / 0x49a50). One
  action a turn: a player with two titles spends the second the turn after.
- THE SEATS (0x6ed750): the slots — no city, the player's cities, every
  city-state with a capital in the game's list (met or not) — and the
  generalized assignment 0x8b5bf0 over the governors and the slots, one pass
  (its last argument), with λ 0x6ecee0 (the start: each assigned governor on
  its city's slot, the slot's occupant it), λ 0x6ece40 (the gain: the
  governor's value there whole, -1 for one not appointed now — the turn's
  appointment counts — or a slot its analysis lacks, 0x6eff30), weight and
  capacity 1, λ 0x6ed060 (the move: the slot's occupant replaced and
  returned) and the knapsack 0x616570 -> 0x61ddb0 (at capacity 1 the first
  largest gain above 0). Per slot in order, per governor in order: its gain
  is its value there, less its value where it sits when that is elsewhere;
  the winner takes the slot unless it sits there, the slot's previous
  occupant left without a slot — the occupant record of the slot the winner
  left is not cleared. Every governor left on a slot is assigned there
  (ASSIGN_GOVERNOR 0xf97c278b: owner, governor, city), the operation
  changing nothing where it already sits (runs/h1_duelw1117 t205: Merchant
  Handan 46 -> Xiurong 69 outgains the Resource Manager's 20 there, which
  then takes Chengdu — the log's two assignments).
- THE ANALYZERS the governors' modifiers reach (each a registry entry of
  0x6c9640: the effect's static object, its vtable's slot 1). READ:
  EFFECT_ADJUST_CITY_YIELD_MODIFIER 0x6b9d90 (on the context's city +0x70,
  the context's yield filter +0x64), EFFECT_ADJUST_CITY_CULTURE_BORDER_EXPANSION
  0x6abc40 (the context city's Culture x fx(Amount x 0.01) weighted, HALVED
  by 0x16eb20 @0xd20458 = 0.5f, span — the prose's "plus 0.5" read 0x16eb20
  as an add), EFFECT_ADJUST_CITY_YIELD_PER_POPULATION 0x6b6460 and
  EFFECT_ADJUST_CITY_GOLD_FROM_CITIZENS 0x6b8150 (Amount x the context city's
  citizens +0x588 of the yield, unweighted, span),
  EFFECT_ADJUST_CITY_YIELD_PER_DISTRICT 0x6b4e80 (Amount x 0x1ae8f0(1, 1, 1,
  0, 0): the city's districts not InternalOnly (+0xe1 bit 2), complete
  (+0xb08) and RequiresPopulation (+0xe1 bit 6), pillaged or not;
  unweighted, span), EFFECT_ADJUST_CITY_INNER_DEFENSE 0x6c2dc0 (Amount,
  raw, where the context city's centre strikes, 0x249ee0 > 0, and stands),
  EFFECT_ADJUST_TRADE_ROUTE_YIELD_TO_OTHERS (the international analyzer
  0x6a49e0), EFFECT_GOVERNOR_ADJUST_CITY_TOKENS_GRANTED 0x6b2850 (the
  context city's owner's envoys' worth 0x7a46c0 at Amount),
  EFFECT_ADJUST_SPACE_RACE_PROJECTS_PRODUCTION 0x6be2d0 (the context city's
  owner's PSEUDOYIELD_SPACE_RACE @0xf2e2ac of 1.0 at its weight; per project
  with Projects +0xe8 bit 1 — SpaceRace, bit 0 OuterDefenseRepair, the
  SELECT's booleans in order — the value whole where the owner advanced it,
  m_aiNumProjectsAdvanced 0x4be7b0; else, where the build turns at the
  Amount (parser 0x6be5b0: whole, 30) lifted fall before the horizon, the
  value discounted (0x7a1240) at them less at the turns without; the build
  turns 0x17b890 add the Amount RAW to 1.0 fixed point, 30 being +11.7%,
  over the city's Production x the project's modifier 0x17a8c0 — the queue's
  per-project modifier +0x2f0 and its district's 0x178c50 —, the cost
  0x17a680 (OuterDefenseRepair's own; else the cost progression model: game
  progress 1, 8; 0x5254d0's speed) less the progress kept +0x260 and the
  store +0x1f4, through 0x8c4540. Every space project counts whether the
  city may build it: China's Space Initiative 66 at t28 of
  runs/h1_duelw1117 on the replayed state, the log's 111 under its
  science-victory weight).
- AN ENVOYS' WORTH (0x7a46c0(n, rate, start, horizon, the player, the
  city-state, the city-state's +0x1280 +0x6868 list)): 0 at war with it
  (0x469cd0); else the list's modifiers summed (0x7a4b20) in a fresh context
  of the player, the city-state (+0x40) and n envoys (+0x08). The list
  (0x651490, the city-state's diplomatic AI's): its leader's InheritFrom
  chain's and its civilization's trait modifiers (the query @0xe261e0,
  ORDER BY ModifierId) whose requirements name a type tagged
  INFLUENCE_REQUIREMENT (TypeTags: PLAYER_HAS_GIVEN_INFLUENCE_TOKENS,
  PLAYER_IS_SUZERAIN). REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS 0x6d45b0:
  the tokens the city-state received from the player (0x44c860, the store
  +0x5d0 and a posted governor's 0x44caa0) plus the context's n reach
  MinimumTokens (parser 0x6d4490, stoi); REQUIREMENT_PLAYER_IS_AT_PEACE
  0x6d2470: a context player (+0x40) the player is not at war with. The
  suzerain requirements are not in the registry, so a suzerain bonus's set
  keeps its peace term alone (runs/h1_duelw1117 t20..t27: Caguana 112 for two
  envoys, t28 186 with Amani's two counted).
- PARTLY / UNREAD (worth 10 in the scores where the log reads more): the
  religion pressure term 0x6a8080 (the context city's majority religion is
  the player's: its pressure 0x1f33e0 x Amount, raw), EFFECT_ADJUST_SPACE_RACE_PROJECTS_PRODUCTION
  0x6be2d0 (per SpaceRace project the owner has not completed: PSEUDOYIELD_SPACE_RACE
  1.0 weighted, discounted at the build turns 0x17b890 with the Amount
  percent less without, where they fall before the horizon; a completed one
  its value), EFFECT_ADJUST_CITY_TOURISM 0x6ac690 (0x18ddf0 / 0x18e0e0 over
  the city's great works, PSEUDOYIELD_TOURISM, between),
  EFFECT_ADJUST_ALL_DISTRICTS_PRODUCTION 0x6a9e80 (CityBuildAI's district
  value 0x5d4a20 per district it reserves a plot for), EFFECT_ADJUST_RESOURCE_POWER_PROVIDED_GOVERNOR
  0x6b2b70 (the power value 0x7a67f0), EFFECT_ADJUST_DISTRICT_HOUSING
  0x6a5d20 / EFFECT_ADJUST_DISTRICT_AMENITY 0x6a1170 (CityBuildAI's 0x7a3d70
  / 0x79f7c0), EFFECT_ADJUST_PROJECT_PRODUCTION 0x6b10b0, and the knowledge
  base's city value 0x7a0ac0 behind EFFECT_ADJUST_CITY_COMBAT_BONUS 0x6a8d10,
  EFFECT_ADJUST_CITY_SIEGE_PROTECTION 0x6a9650, EFFECT_ADJUST_CITY_ATTACKS_PER_TURN
  0x6a7510, EFFECT_ADJUST_CITY_AIR_DEFENSE_BONUS 0x6a3a80, and
  EFFECT_ADJUST_CITY_EXTRA_ACCUMULATION 0x6ae390 (the resource value
  0x7a21e0), EFFECT_ADJUST_UNIT_GRANT_EXPERIENCE 0x6af1e0.

## C-97: the sender's pick, the savings, the threat and the focus — the savings, the spacing, the trust term and the focus READ, the threat PARTLY READ

The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents).

- THE THREAT (+0x6428, its data +0x6480 per player; the writer 0x647f10, each
  diplomatic AI turn): zeroed, then per met player p the sum of (a) its
  knowledge base entry's +4 (0x5eb7c0, m_playerKnowledge 8 bytes a player,
  written by 0x5f0020: the most of p's team's progress num / den over the
  game's victories, vfunc +0x58) above 0.4 (@d5fec8), x 100; (b) 0.05
  (@d55ff0) x p's military strength (0x4bd0d0) above the owner's where that
  lead passes 100; (c) 0.2 (@d5aff0) x the owner's +0x12a0 +0x698[p] above
  the owner's strength where the lead passes 100. The log's "Threat and
  Trust" row prints it first (0x652bb0: ", %3.2f:%d:%3.2f" = +0x6480[p],
  the rank 0x650550, +0x6560[p]).
- THE RANK (0x650550): -1 below 0, else 1 + the players threatened more.
- THE THREAT TERM T (0x671b80; out, the other, the owner's AI, the action,
  the mode, the sign flag): the owner's preference of the action (+0x6240),
  else p's in its eyes (+0x62b0, 0x6504a0) — favoured runs only with the
  flag, disfavoured only without, neither always; then 0 where the threat is
  0, else n the rank, L = ceil(+0x6420 x 0.25) / ceil(+0x6420 x 0.5) /
  +0x6420 by the mode (ceilf, 0xcef33c; +0x6420 the majors met counted by
  0x647f10, the owner among them), 0 where n > L, else 10 / 20 / 40 x (L - n
  + 1) / L; negated without the flag. On the missions' paired desire and
  cost rows T is the weight (n = 1, L = 1 in a duel): runs/h1_duelv1127 Qin
  toward Rome T = 10 on 185 of 185 rows, the threat 32 - 52; Rome toward Qin
  T = 10 exactly while its threat reads 10.16 (t63 - t96), 0 after.
- THE FOCUS (+0x6728, data +0x6780; 0x647bb0 at the AI turn's close): per
  met major p not the owner: a declared friend counts only within the
  recency 0x2a81f0 against GlobalParameters +0x268 through the speed; one at
  war, or turned away (0x3da8e0), is passed over; else p's AI's value of the
  owner (p's +0x1280 vt+0x18) above the best so far makes p the focus; none
  where nothing passes. The desires' +20 (+10 Open Borders, -10 Demand
  Tribute) at the focus agrees with "the other's opinion of the owner at the
  previous turn above 0" on 172 / 185 (Qin) and 26 / 28 (Rome) rows of
  h1_duelv1127, 26 / 27 and 24 / 26 of 1128, 82 / 86 of 1117, 48 / 49 of 1124
  (1121's Qin carries Gossip, below).
- THE LAST ACTION'S TURN (+0x1160, data +0x11b8; the writer 0x3e6d20, the
  reader 0x3d9450): the game turn, set by the performs of the Delegation
  (0x674960), the Embassy (0x674a10) and the deal-carrying actions (0x674b60,
  0x675100, 0x675410), and 0x681b60. The missions' can-do asks it +
  AI_TURNS_BETWEEN_PEACE_OFFERS (3) below the turn.
- THE SAVINGS (0x687bf0, AI::Economic +0x540 / +0x598, data +0x5b8): the
  treasury (+0x13a0 +0xf8) less the last balance (+0x1b8) shared per slot as
  the change x fx(weight / total weight +0x458) (the DefaultSavings list:
  SLUSH_FUND 3, UNITS 4, PLOTS 1, GREAT_PEOPLE 1 in SavingTypes order), a
  slot below 0 cleared; slot 2 above 150 (0x9600) gives its excess to slot 0;
  with no Great Person class left slot 3 joins slot 0. The can-afford
  (0x6874d0): savings[slot] >= amount x (1 - frac) and savings[0] +
  savings[slot] >= amount. The spend (0x68acd0): the amount over the slot
  taken from slot 0, the slot to max(0, slot - amount), the balance less the
  amount. The missions' can-do asks slot 2 at frac 0.5; their perform spends
  slot 1 (0x674960: r8d = 1); a refusal (0x6543a0) spends -price on slot 2.
- PREFERENCES: the DiplomaticActions AiLists of the leader's traits, its
  agendas' traits and its strategies (Gossip favours the Delegation, the
  Embassy and Open Borders). A favoured action's state Worth stands at 0 or
  more without the gold and adds +0x6320[p][a] (h1_duelv1121 Qin: +40 a step
  over the turns, the writer unread).
- THE YIELD WEIGHTS read the agendas' Yields lists too (AgendaTraits ->
  AiLists AgendaType): h1_duelv1127 Qin's Gold weight 0.6 at t62 = the
  major's DefaultYieldBias 0.2 + CLASSICAL_CHANGES 0.2 + MoneyGrubber's 0.2,
  solved from its mission rows; Rome's 0.4 with no gold agenda.
- THE STATE TURN'S ALLOWED ROWS weigh s(a) = the desire where CanDoAction
  lets the action be taken, else 0: runs/
  h1_duelv1127 t100 - t105 Rome toward Qin at opinion 5 holds Demand Tribute
  10 and Open Borders 21 (logged), Open Borders shut (Rome without Early
  Empire): Neutral -> Friendly weighs 0, Neutral -> Unfriendly 10 — the
  game's move at t105. The machine on the log's own opinions holds 1,037 of
  1,365 state lines of the five duels (811 with the allowed rows untaken),
  361 / 377 on h1_duelw1127; on the port's opinions 812 (645).
- THE RECEIVER'S ANSWERS (`answerAction`, the record's 26 proposals): 17 / 26
  in the port's state, 21 / 26 in the state on the log's opinions (19 / 19
  refusals there); the acceptances 3 / 7 in the port's state (1 / 7 before
  the weights read the strategies and agendas). The misses: the Delegations
  of h1_duelw1127 t79 and 1128 t97 need T, whose threat stands on (a); the
  states the port's opinions put in Neutral where the game's were
  Unfriendly (1127 t117 - t181) or the reverse (1121 t127, 1124 t106).
- PARTLY READ: the threat's (a) — which victories and how their progress
  reads (vfunc +0x58) — and (c) (+0x12a0 +0x698); the other actions are the
  next section's.

## C-97: the other actions' desires, the trust and the transitions — the friendship, the alliance, the trust, the threat term and the transitions READ; the war value, the deals and the victories' progress PARTLY READ

The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents).

- THE FUNCTORS' MODES (the calls to T 0x671b80 and U 0x671ef0, mode and
  sign flag): the missions' desire T(0, +), their cost (0x66b590) Cost -
  T(0, +); Open Borders' desire (0x66dda0) T(1, -), its cost (0x66bb50)
  Cost - T(1, -) - U(0, +); Demand Tribute's cost (0x66b220) Cost - T(1, +).
- THE TRUST (+0x6560, the object +0x6508; 0x2e04e0 adds to it): +2 toward
  the other party of each deal the owner strikes (the game signal +0x5a0's
  handler 0x6535f0, subscribed by 0x651490); -10 on the signal +0x5d0
  (0x653630, its event unread). runs/h1_duelv1127: the deal Qin proposed and
  Rome accepted at t99 — Qin's trust of Rome 2.00 in its t99 row, Rome's of
  Qin at t100; the Delegation Rome accepted at t79 adds none (a mission is no
  deal). Qin's own rows of t99 weigh no trust: the deal follows its desires.
  1128: the deal of t108, 2.00 from t108 / t109.
- THE TRUST TERM U (0x671ef0; the mode, the sign flag): v the trust; 0 where
  the flag matches v > 0 and the action is disfavoured, or differs and it is
  favoured; else v x 0.02 (24.8: 5) x 10 / 20 / 40, held within the weight,
  negated without the flag. The trust 2.00 gives 0.78 in mode 1 (the log's
  0.8).
- THE THREAT'S TURN (0x647f10) also counts +0x6420: zeroed, then +1 for each
  alive major (the game's list +0xb50) met or the owner itself; and sets the
  near-victory flags +0x64f0[p] (zeroed each turn): where the alliance level
  0x3d7e20 toward p is at most 2 and no team has won (0x357ff0), any enabled
  victory whose CriticalPercentage (+0x1c) is below 100 and p's team's
  progress (GetVictoryProgressForTeam 0x357e60: the two outputs a, b) meets
  b x pct <= a x 100. Which progress the duels' victories report is unread:
  the flags stand from the meeting to t96 (1127), t134 (1121), t168 (1117),
  t181 (1128), t196 (1124), for both majors at once.
- DECLARE FRIENDSHIP: the desire (0x66c160) 0 where p is near a victory
  (0x652770); else Worth + T(1, -) + U(1, +) + 20 at the focus + 20 per
  player of the game's list +0xfa0 the owner is at war with. The cost
  (0x66ae10) 9999 near a victory; else Cost - T(1, -) - U(1, +) - 20 at the
  focus + 30 where the military AI holds a war operation ready against p
  (0x723db0) - 5 per war. runs/h1_duelv1128 Qin toward Rome t182 - t195:
  35.8 / -5.8, the +30 on the turns before its Surprise War of t196; t197 at
  war 20.8 / 24.2 (no focus at war, the war's +20 / -5). On the logs' own
  inputs (the state, the threat cells, the focus as the other's opinion at
  t-1 above 0, the flag from the cost 9999; `.claude/scratchpad`
  dofcheck.py) the desire holds 847 / 905 open rows, the misses the focus
  stand-in.
- THE ALLIANCE: the desire (0x66d810) 0 near a victory; else Worth (no row:
  0) + U(1, +) + 5 x (+0x6420 - min(p's rank, the owner's) + 1); the cost
  (0x66b990) Cost - U(1, +) - the same. 862 / 905 open rows on the logs'
  inputs; 1127 Rome toward Qin 10.8 = 0 + 0.8 + 10.
- THE SURPRISE WAR (registered 0x669310, each functor bound to the war type):
  the desire (0x66e950) -1 for a full civ at war with two or more majors
  (0x3dfae0); disfavoured -9999 (@f04cb0); else X the war value (0x7b7760,
  below), max(X, 5) where p's rank is 1 or within ceil(+0x6420 x 0.25). 1127 Rome toward Qin: -9999 at rank 2 (t62), 5.0 at rank 1 while
  X is -9999, 798 at t94. The can-do (0x673800): CanDeclareWarOn(0x4396d725)
  and the military AI's war operation against p ready (0x723db0(p, 1, 2, 5):
  the operations +0x318 of type 5 against +0x2a0 past their state). The
  perform (0x675ae0) sends the declaration 0x4396d725.
- DENOUNCE AND THE PROMISES: the desire 0x66d800 returns 0 — never picked;
  the denouncement comes from the state machine.
- THE TRANSITIONS' CHECKS (0x67ff10): CanDeclareFriendship (0x67c740)
  CanDoAction, the not-ready flag clear, toward a full civ the last action +
  AI_TURNS_BETWEEN_FRIENDSHIP_OFFERS (5) at or below the turn, the
  friendship's desire at 0 or more. CanDenounce (0x67c860) an AI owner, the
  denouncement not disfavoured, CanDoAction, CanDeclareWarOn(0x4396d725).
  CanGoToWar (0x67c920) fewer than three wars, the military AI's war
  operation against p (0x723cf0), the Formal War not disfavoured, 0x64a560
  at 0 or more, CanDeclareWarOn(0x73b8c966). CanOfferAlliance (0x67ca30) the
  friendship's spacing, then an alliance type CanDoAction lets be offered
  and, for an AI p, its evaluator's cost of it weighed through 0.5 against
  the owner's economic AI (unread).
- THE TRANSITIONS' ACTIONS (0x67b410 runs a row's action for an AI owner; the
  state moves only where it returns true): OnDeclareFriendship (0x681b60)
  CanDoAction and no session pending, sends the friendship, stamps the last
  action's turn, returns false — Declared Friend comes with the friendship's
  trigger. OnDenouncePlayer (0x681c10) sends the denouncement, the military
  AI's PrepareForWarWith (0x724f30), returns true. OnOfferAlliance
  (0x681e80) picks an alliance type and performs it (0x674900), returns
  false. GoToWar (0x67df10) false where a war operation stands, else the war
  types toward the military AI (unread).
- THE TRIGGERS (DiplomaticTriggeredTransitions): GO_TO_WAR War, MAKE_PEACE
  Unfriendly, DENOUNCE Denounced, DENOUNCE_EXPIRES Unfriendly,
  DECLARE_FRIENDSHIP Declared Friend, DECLARE_FRIENDSHIP_EXPIRES Friendly,
  DECLARE_ALLIANCE Allied, LEAVE_ALLIANCE Friendly.
- THE NOT-READY FLAG (+0x6390, the +0x6338 object; 0x650460): set by the
  sender's 0x6543a0 on an answer of 0xc, cleared by the owner's own answer
  to p's action (0x653f60); the AI's answer is 1 or 2, so between AI majors
  it stays clear.
- THE STATE WORTH'S +0x6320[p][a] (0x6504f0; the object +0x62c8): written
  for Propose Trade alone — +AI_TRADE_VALUE_FOR_AID (150, 0x653b80) and
  -150 (0x653840) on the emergencies' signals. A favoured action reads it
  0; the stateWorth clips a favoured Worth at 0 or more and its gold value
  at 0 or less, a disfavoured one the reverse.
- A FAVOURED ACTION'S DOUBLING: runs/h1_duelv1121 Qin (Gossip favours the
  missions and Open Borders) logs every favoured desire and cost twice the
  reading — the Delegation 110 = 2 x (25 + T 10 + the focus 20), the Embassy
  160 = 2 x (50 + 10 + 20), Open Borders 64 = 2 x (10 + 12 + 10), both
  missions' cost -20 = 2 x (0 - 10) — on every row from t127. The doubling
  instruction is unread (ASK); the port reads the single value.
- Measured (the action replay, runs/h1_duelv1117 / 1121 / 1124 / 1127 /
  1128, the port's states and inputs): the logged desires the port reads
  equal on 1,391 of 3,749 rows (107 / 1,736 with the missions alone read) —
  the alliance 682 / 682, the friendship 514 / 682 (the threat's (a)
  missing where the port reads no threat), Open Borders 75 / 276 (9 / 309
  on the mode-0 T), the missions 113 / 1,323 (the threat's (a), the
  favoured doubling of 1121); the Surprise War's 682 rows wait on the war
  value. The state lines 845 / 1,365 (812), on the log's own opinions
  1,070 / 1,365 (1,037), the gain 1117's, whose allowed rows weigh the
  desires now read. The transitions sent no friendship and no denouncement, as the
  record's majors made none.
- PARTLY READ: the military AI's 0x723cf0 and GoToWar's preparation, Propose
  Trade's desire (the deal AI 0x82dff0 / 0x64d320) and its can-do (0x673460:
  the last action + AI_TURNS_BETWEEN_TRADES), the alliance's offer, the
  victories' progress (the threat's (a), the near-victory flags), the
  threat's (c), Request Assistance, Joint War, Third Party War, the Formal
  War family (0x6690a0), the -10 trust signal's event, the doubling.

## C-97: the World Congress AI — the evaluation, the outcome, the votes, the hints, the option values and the targets READ

The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents). Ported: the valid targets and the target draw in both engines
(`cpu/core/congressTargets.ts`, `drawTargets` / `_congress_targets`,
`_congress_target_draws`; `cpu/data/congressTargets.ts`).

- THE SESSION'S PLACE: its draws are the turn's last — the slate's "World
  Congress Resolutions" draws, then the targets' — after every player's and
  the barbarians' moves and before the next turn's volcano roll
  (runs/h1_duelv1127 t61, t101, t181). The game draws the slate AT the
  session and votes on it then (1127 t61: 10, 9, 8 -> 1, 1, 5 = the Trade
  Treaty, World Religion, Sovereignty; the Trade Treaty and World Religion
  voted; t81 5, 6, 6 -> Border Control, Sovereignty, Public Relations; the
  first two voted). The engines draw it there too and vote on it then: the
  ballots the session's decider casts, the AI line for a seat without one.
- THE EVALUATION (0x622140, a CultureAi job; per resolution of the session,
  entries of 0x20 at +0xa58): each option's value (0x7b3be0, Value_Manager)
  into +0x18 / +0x1c; then where the player's +0x348[r] (the Resolutions
  lists: AiLists System Resolutions owned by a leader's or an agenda's
  trait, or a strategy) is above 0 the outcome A (+0x14 = 1) with its value
  the desire (+0x10), below 0 the outcome B with its; else the greater, A
  on a tie.
- THE OPTION VALUE (0x7b3be0): a context (0x6ccd50: every hint field -1)
  of the player (+0x80, +0x40 its id), the start 0, the horizon 30 (0x1e),
  the rate (0x6fec30); the handler 0x67dd40 of the resolution's
  AITargetChooser fills it — none (Arms Control) or a handler returning
  false leaves the value 0 —, then the option's modifiers (the game's
  +0x3978 / +0x3990, the ResolutionEffects rows of WhichEffect 1 / 2)
  summed through 0x7a4b20.
- THE HINTS (0x67f160 registers DiplomaticSupport.cpp's handlers by name;
  each takes the player, the option, the context): TradingPartners 0x682fb0
  (+0x40: the alive majors met, a value 0x3ffaf0 sums of each — its list
  unread, the port reads 0 —, A the last not at war at or above the best,
  B the last not allied at or below; -1 first), PlayerOrDiploLeader
  0x682220 (+0x40: A the player, B the met major with the most victory
  points), BorderControlTarget 0x67c640 (+0x40: A the player, B the last met
  major whose empire is not adjacent — 0x3ce840: the player's cities with a
  city of it within DIPLOMACY_ADJACENT_EMPIRE_RANGE 10 number
  DIPLOMACY_ADJACENT_EMPIRE_CITIES_REQUIRED 2, the globals +0x264 / +0x260),
  GrievancesType 0x67f040 (+0x40: A the alive major at war or denounced —
  0x3da8e0, diplomacy +0x9d0 — it holds the most grievances against, above
  0; B the player), MigrationTarget 0x6810a0 (+0x40: a city's +0x3070 == 1
  read as losing Loyalty, housing to spare 0x67dea0: Housing above its
  citizens + 1; A the player where none loses Loyalty and more than half
  have housing to spare, else the ally or declared friend with the most
  housing to spare less 3 x losing; B the player where one loses Loyalty,
  else the ally or friend with the most losing), MostCommonLuxury 0x681940
  (+0x4c: A the luxury the player holds the most copies of, above 0 —
  0x4aa790 ownership 0 less reserved; B among those it holds none of, the
  one the other alive majors not allied hold the most of), UnitBuildYield
  0x683120 (+0x64: Production (the cached yield a turn), Gold and Faith (the
  rates); A the least, B the most), Government 0x67e3d0 (+0x28: A the
  player's government; B the one the other majors not allied hold most, 2 a
  major at war, its own left out), GreatPersonPatronage 0x67e730 (+0x6c: A
  the available class it leads most by points over a major, a class it
  leads every major in first; B where a major not allied holds more points
  and earns more a turn in a class with a person, the class the nearest
  such major — at war first — needs the fewest points to recruit in),
  GreatWorkObjects 0x67ed10 (+0x30: its Great Works per object type, A the
  most, B the least), MinorCivBonus 0x6813a0 (+0x3c: per bonus type its
  suzerainties (A) or the others' (B), the most above 0, else the type with
  the most city-states), ReligiousTarget 0x682c00 (+0x48: A its religion, B
  the other founder's with the most cities following), UnitPromotionType
  0x6832f0 (+0x58: per promotion class the units it knows, its own less
  those of the majors at war with it; A the most, B the least), District
  0x67cce0 (+0x1c: per base district — row +0xe1 bit 4 and the replacement
  +0x260 left out — its buildings the player's cities may construct, 1 each
  where the row's byte +0xe0 has bit 7 — read as CityCenter —, 6 else; A
  the most above 0, B the least). FeatureType 0x67db60 writes its feature's
  HASH (+0x20), SpyOperationType 0x682f80 +0x54, PowerBuilding 0x682440 +4:
  no chooser reads those. Project 0x6826d0 (+0x68): by the victory
  strategies the player follows (player +0x1290 +0x560, 0x7004c0; the
  Strategies rows of VICTORY_TECHNOLOGY and VICTORY_CONQUEST): A, pursuing
  the technology victory, the costliest (+0x20) project of row +0xe8 bit 2
  (SpaceRace) one of its cities may advance (0x16f7b0), else, pursuing
  conquest, of bit 8 (WMD); B, not pursuing the technology victory, the
  costliest SpaceRace project another major's city may advance, else, not
  pursuing conquest, the costliest WMD one.
- THE ANALYZERS (the registry 0x6c9640; ten of the twenty resolution
  effect types registered, the rest worth 0): EFFECT_ATTACH_MODIFIER_TO_
  PLAYERTYPE is EFFECT_ATTACH_MODIFIER's object (0x6ab630).
  COLLECTION_MAJOR_PLAYERS (0x6a00f0) walks the game's majors, each alive
  one setting +0x40. NO_CAP_RESOURCE 0x6a8320 (own subject, a luxury held
  twice or more: the most one Amenity more is worth over its cities,
  0x79f7c0); BAN_RESOURCE 0x6bc050 (none held: per other major not allied
  its copies x 100 at war, 60 denounced, 25, raw, per subject);
  BUFF_UNIT_PRODUCTION_YIELD 0x6b47f0 (a buff on its own subject: half of
  its yield a turn x the percent; a debuff on another's: that one's yield x
  the percent x 2.0 / 0.25 at war by military strength, 0.33 at peace; the
  greatest over the subjects); GREAT_PERSON_POINTS_PERCENT 0x6a2270 (0.01 x
  its points a turn of the class, +0x1360 +0x168, x Amount, as Gold);
  NO_GREAT_PERSON_POINTS 0x6b0050 (the others' points a turn, not allied,
  less twice its own, as Gold); GOVERNMENT_SLOTS 0x6a3870 (in the named
  government: |Amount| x the policy AI's best card for the slot, 0x623b90,
  on its own subject for a slot gained, another's for one lost; a slot lost
  on its own subject sets 0); PLAYER_DIPLOMATIC_VICTORY_POINTS 0x6c6d60 (P
  the worth of a point, W the points to win: on itself gaining Amount x 2P +
  W x P / max(1, W - points - Amount)^2; on another losing |Amount| x P + W
  x P / r^2, r one less per running competition it ranks in the top
  quarter of, 0x25d5f0); PLAYER_GRIEVANCE_GENERATION 0x6c3bc0 (on itself
  gaining: its grievances x Amount / 100; on another losing: that one's
  against it x Amount / 100; PSEUDOYIELD_DIPLOMATIC_GRIEVANCE, discounted
  from the start); PROJECT_PRODUCTION 0x6b10b0 (the project from the hint
  +0x68: a city's Production x the percent, or the most another major's
  city makes over the player's cities, negated); PLAYER_BAN_CITY_PRODUCTION
  0x6bb020 (per city a count of the building, the project's district and the
  district held, x 50, SETTING the total — 0 with none named);
  BUILDING_PRODUCTION 0x6c1a80 (0 with neither a building nor a district
  named; the rest unread).
- THE ORDER (0x61dc50, 0x617d70's comparator): the resolutions a list names
  first, then the desire, the greatest first — the cast order; the log's
  OPTIONS rows run in it.
- THE VOTES (0x628450, the session's handler): F the player's favor (the
  Congress player +0x110). The cost of the session's wants: the sum over
  the resolutions of the price of whole(desire / 2) votes, at least 1; the
  sum of the positive desires S, at least 1.0. Per resolution in order: the
  cap the votes F's remainder buys (0x527d80: 1 for nothing, else
  whole((sqrt(4 x F / s + 1) + 1) x 0.5) in single precision); the want
  whole(desire / 2) where F covers the cost, else the votes floor(F x desire
  / S) buys; the votes cast max(1, min(want, cap)) (0x59bc40) and their price
  taken from F (0x527680: s x n x (n - 1), s = 5 through the game speed
  0x525400, whole — 2 online). runs/h1_duelv1127 Qin's whole favor bought
  4 votes at t61 (29), 9 at t101 (149), 7 at t121 (85), and paid 24, 144,
  84 (Player_Stats_2's favor balance). The engines charge the same
  (`voteCost`, CONGRESS_VOTE_PRICE).
- THE TARGET (0x611140 .. 0x612e50, one template per TargetKind, differing
  in the vtable slot of the valid list): on a fresh context (+0x40 -1) the
  handler runs for the outcome taken; the first field set in the order
  +0x1c, +0x20, +0x28, +0x6c, +0x30, +0x3c, +0x40, +0x44, +0x68, +0x48,
  +0x4c, +0x64, +0x58 picks the chooser; none set, the TargetKind's with
  the hint -1. A hint among the valid targets is applied (0x610440); else ONE
  "Random congress resolution target" draw over their count (0x8b6c10; a
  count of 0 still draws) and the drawn index applied (0x487650, the log's
  OPTIONS row). The valid targets are the ResolutionOptions
  WorldCongress.lua's ValidationLua handler gives the player (the players
  met or itself; the luxuries the map holds; Production, Gold, Faith; the
  three power plants; the governments with a Wildcard slot; the fourteen
  districts in the game era; the space race and WMD projects; the available
  great person classes; marsh, forest, jungle; the ten offensive spy
  operations; seven promotion classes) in database order; a handler the Lua
  lacks or that sets nothing offers every row — the religions as those
  founded. RandCalls fit it: 1127 t181 two draws over 10 (the Espionage
  Pact, whose hint no chooser reads), t201 two over 2 (Arms Control, no
  chooser), t221 two over 3 (the Global Energy Treaty), t241 one over 12 (a
  government without a Wildcard slot); 1128 t181 two over 3 (the
  Deforestation Treaty: jungle 2, forest 3, marsh 5 by index, the drawn 1
  and 2 the logged 3 and 5).
- Measured (the action replay, runs/h1_duelv1117 / 1121 / 1124 / 1127 / 1128,
  the port's ballot on the game's slate, the AI major of each, on the game's
  favor and Diplomatic Victory points): the outcome as the log's OPTIONS on
  106 / 109 resolutions, the votes as its VOTES on 83 / 109 (on the
  engine's points 58: the Diplomatic Victory desire's W x P / rem^2 term
  needs the game's points, 1127 China 20 from t182), the target where the
  port names one 66 / 75; the port leaves 31 ballots to the draw, the game
  draws 65 times for both majors. The misses left: 1127 t161 the Luxury
  resolution valued 45 against the Diplomatic Victory one's 440 (its votes
  2 for 4).

## C-97: the great people's patronage — the Gold and Faith patronage READ, the usable plots and the points a turn PARTLY READ

The majors' AI is not ported (the replay imposes the recording's majors, training seats RL agents).

- THE GOLD PATRONAGE (0x6898b0, AI::Economic, called from the savings turn
  0x687bf0 at its close): K = 0.5 (@d20458, fixed). Over the classes
  (0xad58b0) and each class's standing person (0x2f64a0): a person the
  player may claim (0x2f28a0) whose RECRUIT_GREAT_PERSON operation
  (0xe8e854ba, the individual 0x385fc342) can start is recruited and ends
  the call. Else, where it may patronize with Gold (0x2f26c0), the price
  (0x2f70e0, whole) a candidate where it is cheaper than the best so far,
  the SLUSH_FUND and GREAT_PEOPLE savings together exceed it, the
  GREAT_PEOPLE savings alone exceed K x it, and the person can act on some
  plot (0x561070). The cheapest: the PATRONIZE_GREAT_PERSON operation
  (0xebdeb9f6, the yield 0x2b8aba02 Gold); the price over the GREAT_PEOPLE
  savings taken from the SLUSH_FUND, that slot to max(0, slot - price), the
  balance (+0x1b8) less the price.
- THE SAVINGS' GREAT PEOPLE SLOT (0x687bf0): with no class available
  (0x2f7eb0) it joins the SLUSH_FUND and stands at 0.
- THE FAITH PATRONAGE (0x751590, the religion AI's turn 0x74fbf0 after
  0x74de60, not for a human): the cheapest person it may patronize with
  Faith (0x2f26c0) whose price its Faith (+0x1340 +0x100) exceeds and that
  can act on some plot; the PATRONIZE operation with Faith.
- CanPatronize (0x2f26c0): the class may be earned (0x2f23f0), the person
  stands (its timeline entry), the player has not passed on it (+0x10), the
  purse holds the price, the yield's patronage not barred (0x43d1e0) —
  `patronizeGreatPerson`'s checks.
- THE PASS (0x2f8c00): its one caller is the player operation handler
  0x48b9d0: the AI never passes. After it, 0x2f2e90 claims for the player
  with the most points who can (0x2f8100 the same on a points change) —
  the engines' claim at the points.
- PARTLY READ: 0x561070 (over every plot, 0x55f900, the plots the person
  can act on: the port takes one as held); 0x43c410 (a class's points a
  turn: over the cities the city build AI's +0x10f8[class] where it has one
  and the city's own 0x1cb000 on its amenities, the player's bonus a turn
  +0x1d8[class] whole, x (1 + 0x43c340 / 100: +0x250[class] and the
  modifier 0xf8705d00); the congress hints 0x67e680 / 0x67e730 read it, the
  engines' `greatPersonPointsPerTurn` the city's own).
- Measured (the action replay, the five duels, the AI major of each): the
  port's patronages 19, the game's 51 (Game_GreatPeople.csv's grants beyond
  the class's points, the purse that paid), none on the same turn — the
  engine's purses and points are not the game's; the Faith rule on the
  record's own purse decides 26 times, 4 of them the game's (1127 t89 the
  Scientist at 258 + 22 Faith against 257, 1117 t73 the Writer with the
  Oracle's 25% off). The rest want the turn's points and Faith as the AI
  reads them (LAB).

## C-96: the improvement value's resource copies, a minor's strategic copies, the district count — READ (0x7a58f0's count, 0x4a93c0, 0x1ae8a0, 0x1ae8f0), a LAB (a city-state's Great General weight)

- THE COPIES (0x7a58f0 -> 0x7a21e0's count, 0x7a5c00..0x7a6022): an
  improvement that works the plot's resource (its Improvement_ValidResources
  entry, Improvements +0x1e8) values the resource at `count` = 1.0 raw,
  replaced where the resource's Resource_Consumption row (0x28a940 on
  Resources +0x1c) is Accumulate (+0x48 bit 0) by valueBetween (0x7a2140)
  of its ImprovedExtractionRate (+0x24) x (1 + 0.01 x the city's +0x1e00 at
  the plot's terrain +0x2c, 0x4a9ff0; @0xd136f0 0.01, @0xcfc9f8 1.0) from T
  to H; the count passed is its whole part (`sar 8`). The plot's own
  improvement (its repair) passes 1, the improvement it replaces -1.
  `resourceCopies` (cpu/core/aiPlotValue.ts), `_cv_resource_copies`
  (gpu/core/sim_cityvalue.py). Confirmed: runs/h1_duelv1121 Hunza t19's
  Pasture on Horses at (12,5) and (10,5) 171.45 (= the yields 71.45 + 40
  copies x 2.5: the count held to twice the Horseman's 20), t20 118.95 and
  t21 116.45 (38 and 36 copies at 1.25 as its Horses stand at 2 and 4);
  the plotValueLab's Pastures 451 -> 453 exact on 1121 (the lab imports the
  record, which holds no minor's stockpile, so its t20+ rows read 0 held).
- THE COPIES HELD (0x4a93c0(r, 1)): Player_Resources +0x2e0[r][0] less the
  reserved (0x4aa530, with the flag) plus +0x2e0[r][1] — a strategic one's
  stockpile; the resource value's `have` (0x7a21e0 at 0x7a228f / 0x7a28e7).
  A city-state's (`minorResourceFacts`, the research term
  `_rai_resources`): its stockpile (`CityState.stockpile`,
  `citystate_stockpile`). In 0x7a21e0 the strategic flag [rsp+0x40] (set
  where T != H and H != 0) skips both the FX(-9999) exit and the cap clamp
  (0x4aabe0 less 0x4aa790), so the count is held to 2 x need - have alone.
- THE DISTRICT COUNT (0x1ae8a0, 0x1ae8f0): the most districts the
  population allows = ceil(population (+0x588) / the globals' +0x2ac) +
  the city's extra (+0x20), 1 below +0x2ac 1; the count 0x1ae8f0(skip
  +0xe1 bit 2, complete only, RequiresPopulation only, the 5th flag 0x24c3b0,
  not pillaged) — 0x7aaf80 calls it (1, 0, 1, 0, 0): the city's districts
  that require population, complete or not. The district value's half
  chronology term stands while the first exceeds the second.
- LAB: a city-state's PSEUDOYIELD_GPP_GENERAL weight at its floor (-1.0,
  factor 0); the writer unread (0x700810 sums the military AI's +0x7e8, the
  player AI's +0x620 and the lists, the GP pseudo-yields' golden-age points
  besides). It accounts for the Encampment's residual 0.5 a turn
  (runs/h1_duelv1124 Granada t2 at (42,11): log 52.43, 55.54 before) — the
  Encampment 21 -> 477 exact of 1,111 on 1124, 0 -> 1,820 of 3,915 on 1117
  — beside the Barracks' and Stable's General point (ASK in "C-96 / C-97:
  the city build AI"). `pseudoYieldWeights`, `_MinorFacts.pseudo_w`.

## C-96: the city under threat and a pillaged district's repair — the test READ, the repair PARTLY READ

- THE CITY UNDER THREAT 0x5cdc50 (READ): true where
  the player AI's [+0x12a0] +0x4b8 (the war footing) is set, else where
  CityBuildAI +0x1b8 (the city's threat) is above -1 AND either the centre
  district's GetDamage(0x5e97d629) — its hit points' damage — is above 0 or
  CityBuildAI +0x218 is set. A threat alone is not enough. Its readers: the
  contract eligibility 0x5f6050 (at 0x5f60c0, 0x5f62a1, 0x5f64a6) and the
  Default Specialization's defensive pick; the defensive cancel 0x5d7640
  opens with the same test inline (0x5d766a..0x5d76ac). Under threat
  0x5f6050 passes a district only where its Districts row has +0x58 set and
  +0x5c non-zero (0x5f62d3, 0x5f6304) — the hit points: the City Center,
  the Encampment and its replacements (Ikanda, Oppidum, Thanh). The
  engines: `minorUnderThreat` / `_minor_under_threat` (a city-state's war
  footing held clear as `combatDesire`'s; +0x218 the threat's, below), the contracts'
  `underThreat`, the pick's `defense`, `districtDefensive` / `d_defensive`.
  Recorded: runs/h1_duelw1124 Granada t42 "City Defense, Started" with its
  centre whole — its Harbor contract (Build City District, CONTRACT 90)
  kept, complete t45 (AI_CityBuild.csv COMPLETED, VALUE 734.1), its Gold
  6 -> 10 (the Harbor's +4) where the engine cancelled it for an Archer;
  runs/h1_duelw1127 Muscat t160-t165, its centre damaged (38, 18, 43, 23, 3)
  under major 0's army: NO BUILDS AT ALL each turn (Walls, Castle and Star
  Fort held: the defensive pick finds nothing), PROJECT_REPAIR_OUTER_DEFENSES
  at t166 once healed. The defensive cancel's body in its own section
  below ("C-96 / C-60: the defensive cancel").
- +0x218, THE ENEMY AT THE GATES (READ): the value of a watched bool at
  CityBuildAI +0x1c0 (its setter 0x29fdf0 writes +0x1c0 + 0x58). Its one
  writer is the threat 0x5cbd10 itself: cleared as the walk opens
  (0x5cbd9e), and per player the walk reads — past the friendship, the
  city-state-not-fought and the 0x723cf0 skips, with records within its
  range (the first 0x5eadb0's strength above 0) — after its strength sum,
  0x5eadb0 again at radius 2, least strength 5 (the type's larger of
  Combat +0x48 and RangedCombat +0x6c), age 2: its out list's entries are
  per unit type [type, count] (0x5eafd2), their counts summed above 2 —
  three units or more — set it (0x5cc3d4), for good for the walk. Then
  a player the owner fights (the war flag [rbp+0x6f], the barbarians not)
  with +0x218 set threatens the city at once (0x5cc3d9 -> 0x5cc475), the
  margin unread. Recorded: runs/h1_duelw1103 Hattusa t46 and
  runs/h1_duelw1105 Bandar Brunei t16 "Canceling current build" with their
  centres whole (CombatLog.csv: no blow on either city since t23 / ever)
  and no war footing (Combat Desire 0.1 / 0). The engines: `cityThreat`'s
  `near` (stored `CityState.threatNear` / `citystate_threat_near`,
  `City.aiThreatNear` / `city_ai_near`), read by the city under threat.
- A PILLAGED DISTRICT'S REPAIR (PARTLY READ): 0x7a51f0's own-district term
  (the repair x2, +12500.0 at the centre) is reached by the plot analysis on
  the plot holding the city's own pillaged district, which values that row
  alone; CanConstruct takes it there. Recorded: runs/h1_duelw1127 Muscat
  t160 its Commercial Hub pillaged (with its Market), "Build City District"
  SUBMITTED on DISTRICT_COMMERCIAL_HUB at 5469.0; queued t167 (CONTRACT
  660) once the centre healed; City_BuildQueue t168 the Hub at 85 of 114 —
  the repair resumes at 100 - PILLAGE_BUILDING_REPAIR_PERCENT 25 of the
  district's cost, as a building's — then the Market's repair (100 of 60,
  resumed at 45) the same turn; Gold 6 -> 12.4 at t170. The engines:
  `minorRepairsDistrictAt` / `_minor_repairs_district_at`, the plot
  analysis, `districtBlocked` / `district_blocked` (complete and
  unpillaged), the queue, `minorDistrictCost`, the completion unpillaging
  it. LAB: the repair's T in the analysis (the district's build turns
  taken), the game's two repairs completing in one step (the engines one a
  step), the Market's own repair contract (SUBMITTED t165, the engines'
  automatic building repair after the district).

## C-96: the district value's remaining terms — READ (the envoys' term, the golden-age term's reader, the modifiers' list, the neighbours' functor), a LAB (the district's buildings), and the Farm's adjacency in the plot values

- THE ENVOYS' TERM (0x7aaf80, 0x7ab8f5..0x7abac8, per yield with an
  adjacency above 0): over the city-states (player manager +0x1650), each
  whose district list's verdict on the district is 1 (0x5d2ae0 on its
  +0x1290 +0x1f8): 6 or more tokens received from the player (0x44c860)
  +2.0 of the yield at the player's value, the player its suzerain
  (0x44c850) +4.0 more. A city-state receives no tokens: none at a minor.
  Not ported (the majors' district value).
- THE GOLDEN-AGE TERM (0x7ab294..0x7ab2db): a turn's PSEUDOYIELD_GOLDENAGE_
  POINT of 0x2c41d0(the era manager 0x2c3660, player +0x128) — the
  player's era record (0x78 bytes each, at +0x5b8) +0x34, 0 for a player
  past the list. Unread: what +0x34 holds. Not ported.
- THE MODIFIERS (0x7a4b20 at 0x7adc10): the list GlobalAI +0x39a8 indexed
  by the district (0x675e40), filled once (0x6e0736..0x6e08f5) per
  Districts row from "SELECT ModifierId from DistrictModifiers where
  DistrictType = ? ORDER BY ModifierId" (0xc7a880): the Aqueduct's, the
  Bath's, the Cothon's and the Suguba's; no specialty district carries one.
- THE NEIGHBOURS (0x79f280, the district value body's alone, 0x7add12, at
  its top level — the analysis context's plot list +0x10 empty): the body
  first pushes the candidate onto the context's list (0x7b8bd0, its one
  caller 0x7adc88: the plot's x, y, index and the district), then walks
  radius 1 (0x6b1b0) with a functor (vtable @0xd71be8, invoke 0x7b8a20 ->
  0x79ed40): a neighbour holding a WONDER (the plot's +0x30 object's
  +0x1e, the building 0x5ce970's wonder loop tests there) adds the
  building value 0x7a7590 of its wonder with the context's list less with
  a fresh one (one placeholder entry, x and y -9999, so the nested value
  walks no neighbours); else one holding an improvement (+0x44) the
  improvement yields value 0x7b1320 likewise; T and H the candidate's. No
  neighbour district is revalued. A port of the improvement half (each
  neighbour improvement's yields value with the district complete on the
  plot less as the map stands) moved no row of the five duels' DISTRICTS
  (a city-state's improvements take no district adjacency before the
  Industrial Zone's rows); the wonder half not ported (a city-state builds
  none). (An earlier port of the same for an improvement's own value — no
  such term exists — lowered 1127's Farms 10,904 -> 9,376.)
- LAB: THE DISTRICT'S BUILDINGS — every logged DISTRICTS row stands above
  0x7aaf80's terms by the most the city's analysis values a building of
  the district (the centre's BUILDINGS row; max, not the sum, where two are
  valued: runs/h1_duelv1117 player 2's Encampment: 9 turn-players the max of
  Barracks and Stable alone, none the sum alone), within the body (a flood
  cutting the horizon to the landing leaves the row 0, the building too).
  runs/h1_duelv1128 Bologna's Campus each its Library's 4.37 at t13 and
  t16, 7.04 at t24, 13.77 at t30; 1121 Hunza's Commercial Hub its Market's
  2.38 at t26, 25.50 at t32, 80.77 at t47; 1128 player 4's Holy Site
  its Shrine's 2.02 at t2, 15.22 at t13. The reader is unfound: 0x7a51f0,
  0x7aaf80 and 0x5ce970's district loop call no building value, and the
  only accessor of the centre's BUILDINGS (0x5d4920) is the contract
  evaluation's. `districtBodyValue` (`buildingsValue`), `_cv_district_body`
  (`buildings_value`). The plot values lab's DISTRICTS rows within 0.01
  over the five verbose duels: 12,730 -> 23,881 of 55,447.
- THE FARM'S ADJACENCY in the plot values: the improvement yields value's
  adjacency term (0x7b1320 through 0x365ae0 per Improvement_Adjacencies
  row) counts Farms_MedievalAdjacency / Farms_MechanizedAdjacency like any
  row; the engine's `improvementAdjacency` now pays the Farm's Food per
  group of live Farms beside the plot itself (the tile yields read it
  there), so the city-states' Farm values carry it: runs/h1_duelv1127's
  Forts over a Farm 20.11 a Food low before (3,952 -> 4,969 exact), Farms
  9,611 -> 10,904; the five duels' IMPROVEMENTS rows 104,693 -> 113,299.
- Left in the district rows: the T a turn or two off (the lab's build turns
  under a district in production, runs/h1_duelv1121 Hunza's Commercial Hub
  t136..t162 at 4-5 for 2-3), the floodplains' cut (a river the game has
  not named yet: 1127 p2 (43,15) a Farm at -9.00 to t27, named at t28;
  1128 Bologna's Campus at (5,10) 0 from t46 to t73), the Neighborhood's
  housing value, a Theater's late rows (1117 player 4's hundreds off
  from t99).

## C-96: the Free Cities' city build AI, threat and Combat Desire — the lists READ, the threat and desire's inputs READ off the logs, +0x4b8's writer unread

- THE LISTS (Expansion1_Leaders.xml, Expansion2's copy alike):
  TRAIT_LEADER_FREE_CITIES' CityEvents list FreeCitiesCityBuilds holds
  CITY_EVENT_DEFAULT "Simple City Tree" alone — no CITY_UNDER_THREAT (no
  City Defense operation: AI_Operation.csv's player 62 runs "Free Cities
  Raid" only, runs/h1_duelw1123 t205-), no building, district or
  improvement event, so no contract and no district repair through a
  tree. A Free City's build is the Default Specialization on an empty
  queue (AI_CityBuild.csv player 62: runs/h1_duelw1114 Rome t124
  UNIT_SLINGER 60.3, t125 UNIT_WARRIOR 16.9; runs/h1_duelw1123 Chen t202
  UNIT_SLINGER 54.9, t205 UNIT_ARCHER 118.5; runs/h1_duelw1130 Rome t152
  UNIT_SLINGER 57.9, t154 UNIT_WARRIOR 16.8), each after the city's
  update's yield lines.
- THE DEFENSIVE PICK reads 0x5cdc50 as a city-state's: the war footing, or
  the city's threat above -1 with its centre damaged. The six recorded
  picks stand on undamaged centres (Chen's garrison damage 0 t203-t213), so
  none tells it from the plain pick.
- THE THREAT AND THE DESIRE: the Free Cities' military AI runs every turn
  with or without a city (AI_Military.csv player 62, 249 rows a game) on a
  knowledge base of their own (AI_Knowledge.csv player 62, 2,308 rows on
  1123). The floor M counts each MAJOR at war and no city-state (1123
  t200-t201, no Free City: 0.5 = -0.5 + 0.5 x 2); a Free City lifts the
  target term (t202 1.0); t203-t212 the desire stands uncapped (3.5 =
  (160 - 90) x 0.05 to 9.5) and t213-t215 capped at 2.0 (raw 3.9, 4.25,
  2.75) with Chen still Free — so the war footing +0x4b8 is clear and the
  cap lifts on a city's threat at or above 0, the Free City's threat
  (0x5cbd10) varying turn to turn; no standing-army term (t203 exact). The
  engines: `freeKnowledge` / `_free_knowledge` (the row `FK`) at the
  military AI's turn and at the turn's end, `freeCombatDesire` /
  `_free_combat_desire` (the row `FR`) over `pseudoYieldWeights`' Combat,
  explorer and naval scout weights as a city-state's, `freeCityThreat` /
  `_free_city_threat` (the majors fought, the city-states not) stored
  per city (`City.aiThreat` /
  `city_ai_threat`), the defensive pick on it; the Free Cities' tactical
  target list takes the knowledge base's entries; the threat passes over a
  player the Free Cities run an operation against whose target lies within 5 of
  the undamaged city (0x723cf0, `freeOpNear` / `_known_threat`'s
  `op_near`, "C-60: the Free Cities Raid"). LAB: +0x4b8's writer (the only
  displacement writes are the military AI's constructor 0x71a960 at
  0x71b68a and 0x264296); the desire's unit values against the recorded
  picks (the free runs diverge before every Free City: 1123's Chen still
  China's at t203).

## C-96: an event's civilian kill spares a Trader — PARTLY READ

- UNIT_KILLED_CIVILIAN 0x33a070 (every event's: floods, storms, eruptions,
  the accident): the plot's units of the unit container's layer 0
  (0x75c50, its layer argument r9d 0), each not dead (+0x770), of
  formation class CIVILIAN (GetFormationClass 2), without
  CanRetreatWhenCaptured (unit info +0x1b8 bit 8), its owner not immune to
  the event (0x468100, the player's m_aRandomEventNoUnitDamage), are
  collected and killed. A Trader stands in a layer of its own (the target
  list's one entry per Trader beside the plot's one civilian, "C-95: the
  attack plots in the reach, ...") and is not among them. Recorded:
  runs/h1_duelw1127 t160, the major flood at 43:13 (Game_RandomEvents.csv
  FLOOD Severity 1, Units Killed 0): six reach plots, Muscat's centre the
  fifth (its CITY_GARRISON band, RandCalls line 11520, after the row's fifth
  draw), its UNIT_KILLED_CIVILIAN draw 6 < 15 (line 11506), its Trader in
  the centre alive after; the engines killed it. The engines
  (`strikeUnits` / `_strike_units`) spare a Trader. LAB: the layers'
  assignment (a religious unit's layer: the target list gives the plot's
  religious unit apart from its civilian; no recorded kill), whether layer
  0 holds the civilians alone.

## C-100: the rivers' names and the flood cut — READ (0x534950's river call, 0xa29730, the plot-to-rivers map), MEASURED (the naming sight)

- 0x534950 (a FULL_CIV player's plot first revealed, from the sight update
  0x58aa90): where the plot's +0x37 is above 0, 0xa29730(the river manager,
  the plot, the player): over the plot's rivers (the manager's +0x190
  plot-to-rivers map, 0xa285b0 — the rivers whose edges SetXOfRiver laid
  on the plot or across it, the river vector's own plot lists) each river
  found by ID (+0xb8..+0xc0, +4) whose namer +0x48 is 0 or name +0 is -1
  takes the player as namer and a name (0xa292a0). A river's merged
  network does not name it: its own plots alone.
- MEASURED, the five verbose duels' "Floodable Rivers" column
  (Game_RandomEvents.csv) against a major's sight (`plotsSeenNow` of the
  majors: units' sight, cities two round, owned plots and their ring) over
  each river's own plots at each record: runs/h1_duelv1127 t1, t1, t3, t29,
  t59, t106; 1128 t1, t15, t38, t75; 1117 t1, t1, t10, t32 — all as
  logged; 1124 t1, t35 and t69 for t73. The records' revealed own plots name
  1127's at t1, t1, t3, t16, t48, t106 and 1124's at t2, t11, t29 (a plot is
  revealed on the walk, a river named on the sight that stays).
- `nameRivers` (disasters.ts, `GameState.riverNamed`; `_name_rivers`,
  `river_named` on the GPU) names at the random-event step of each
  `endTurn`, the majors' actions of the turn done; `riverRevealed` /
  `_flood_open` read the name alone. The importer folds the names through
  its history (the look at each record). The city-states' turn t reads the
  look over record t+1's positions: runs/h1_duelv1127 p2 (43,15)'s Farm
  -9.00 to t27 and 100.35 at t28 as logged (we read 98.94 from t16). The
  plot values lab's DISTRICTS rows within 0.01 over the five duels:
  23,881 -> 29,598 of 55,800 with the idle store below; IMPROVEMENTS
  113,299 -> 113,836.
- THE LAB'S IDLE STORE: a city-state with nothing to build stores its
  production (`prodOverflow`), which its build turns read; the record keeps
  no store, so the lab adds each idle record's production (runs/h1_duelv1121
  Antioch, t126-t162 "NO BUILDS AT ALL": its Commercial Hub 969 -> 2,305
  exact, Harbor 786 -> 1,338). The engine keeps the store itself.
- Not drawn: the name itself (0xa292a0, one draw over the namer's names
  left; AUDIT C-74).

## C-100: the plot values' residuals traced — the Farm rows' Food, the Neighbourhood's T, a Campus lump (MEASURED)

- THE FARM ROWS' 15.03 (runs/h1_duelv1117 Caguana, player 3, from t51):
  one Food of housing value. The city's surplus the lab reads off the
  record's plots is a Food short of the record's own (`foodSurplus` 5
  where the plots give 4 from t51): Caguana's builder takes a Farm off
  plot 571 and lays it back a turn later (ImprovementRemovedFromMap t50,
  ImprovementAddedToMap t51), and the record's city yields count the Farm
  its plots do not hold yet. The lab now reads the record's surplus
  (`plotValueLab.ts`); the five duels' IMPROVEMENTS rows within 0.01
  113,836 -> 115,629, DISTRICTS 29,598 -> 29,805. The engine computes its
  own surplus; nothing to port.
- THE NEIGHBOURHOOD: its T, not its housing value. Its landing reads the
  civic's turns (Urbanization), which the city-states' civics analysis
  gives far longer than the game: runs/h1_duelv1121 Hunza (player 2)
  AI_GovtPolicies.csv Urbanization 117 at t120, 102 at t121-122, 3 at
  t123-125, 2, 1, 1 — the lab's 271, 270, 269, 186, 102, 101 over t123-
  t128 (the minors' civics turns; the research and civics AI's). The rows
  past it (t130-t250) stand off by a constant per turn, owned and unowned
  plots apart (runs/h1_duelv1121 t130 -16.87 / +34.27), not by the Appeal
  band.
- 1128 Bologna's Campus +7.12 a row from t34 to t62 above the Library's
  term, whatever the T (2 or 3), not a building's or project's of the
  centre's rows; unread.
- 1117 player 4's Theater from t99: not traced.

## C-99: the district and improvement events on one plot — the eruption's turns (a LAB, both twins)

- The events do not share plots by rule: a tree is made by its event and
  only ticks in the tree manager's tick (0x7ffdd0, list C), so both events
  read the turn's analysis as it stands and either may name the same plot;
  Reserve Plot (0x7f7da0) then hands the plot to the higher value (another
  tree's reservation yields only to a value 20.0 above it), and the
  district tree whose Reserve Plot fails ends.
- runs/h1_duelw1121 Antioch t2: ours chose the Commercial Hub at (32,22)
  (plot 1000, Forest and Deer beside its volcano) at 8.21 — the game's row
  there is 0.59 (runs/h1_duelv1121's DISTRICTS) — and the Camp tree's
  48.0 on the same plot took it at t3, the district event firing again t4
  with three District Choice draws the game does not make. The game's row
  is the eruption's cut: the plot lies beside a volcano, and the analysis
  ends the horizon at the eruption's expected turns (the feature manager's
  +0x98, its reader unread). `eruptionHazardTurns` (disasters.ts) /
  `_minor_eruption_turns` (sim_minorai.py): 100 over the volcano rows' sum
  of 100 / (N / OccurrencesPerGame), 31.29 turns, on every plot beside a
  volcano (the plot values lab's fit at 31, now the engine's). With it
  Antioch's t2 district tree takes the Commercial Hub at a 5.25 plot (999)
  and posts Currency at 5.0, the Camp tree Animal Husbandry at 48.0, as
  logged (AI_Research.csv Tech Contracts 16 / 17); the district trees on
  the full replay start t2, t12, t22, t34 as the log's District Choice
  draws do.

## C-96 / C-60: the defensive cancel — READ (0x5d7640), ported for the city-states and the Free Cities

`defensiveCancel` (cpu/core/aiCityTrees.ts), the city-states' in
`minorAiTurn` (cpu/core/minorCityAi.ts), the Free Cities' in
`freeCityBuild` (cpu/core/minorBuild.ts); `_defensive_cancel`,
`_minor_defensive_cancel`, `_free_defensive_cancel`
(gpu/core/sim_minorai.py).

- 0x5d7640 is the City Defense event's opening (0x5cced0 calls it first,
  unconditionally). Its gate is 0x5cdc50's test inline: the war footing,
  or the city's threat (+0x1b8) above -1 with the centre's GetDamage
  (0x5e97d629) above 0 or +0x218 set.
- THE ITEM IN HAND: the contract in hand (+0x398) where the city holds
  one, else the queue's head. It is NOT DEFENSIVE where a unit with Combat
  (+0x48) 0 or a Bombard (+0x40) above 0, a building with no
  DefenseModifier (+0x28; the Walls carry none, their defense is the outer
  pool), a district without hit points (Districts +0x58 / +0x5c), any
  project.
- THE OLD VALUE: the contract's value (else 0), raised to the head's table
  value — a unit's (a queued unit with no contract and PseudoYieldType null
  or PSEUDOYIELD_UNIT_COMBAT returns: the task kept), a building's (a wonder,
  Buildings +0x158 bit 64, 0), a district's at its plot (0x5d4a20), a
  project's (0x5d4c30). An empty queue (+0x2350 == 0) returns.
- THE BAR: OLD + max(OLD, AI_CURRENT_TASK_BIAS) (GlobalParameters 80, read
  at 0x00f28c80 + 0xc). The city cancels where a contract it lists stands
  ACCEPTED (3) with a value at the bar or above, or the item is not
  defensive, or the plain pick's best building (0x5d0860 flags 1, 0) reaches
  the bar, or the defensive pick's best unit (0x5d2600 flags 1, 1) passes
  it; under the gate the contract in hand is FAILED (4), the log line
  "Canceling current build, OLD VALUE v", the production cleared.
- Recorded (AI_CityBuild.csv, 98 city-state cancels over the 29 duels):
  runs/h1_duelw1105 Bandar Brunei t63-t69, its Walls contract FAILED and
  re-picked each turn (OLD VALUE 468.4, 495.9, ... the Walls' own value);
  runs/h1_duelw1103 Hattusa t46, its Granary (OLD 33.1) cancelled for a
  Heavy Chariot. No Free City cancel is recorded (their centres whole).
- The engines: a city-state's head its item (a repair its building's, a
  district valued at its plot by the plot analysis); a Free City's its
  queue's head (a unit, a building, a wonder, a project: the walls'
  repair) over an empty book (the Free Cities make no contract: "C-60: the
  Free Cities Raid"), the production cleared emptying its queue. LAB:
  whether a Free City's cleared production keeps the item's progress (the
  engines' queue drops it).

## C-60: the Free Cities Raid — READ (the start 0x274ea0, the record 0x277470, the signals 0x276d90 / 0x276e70 / 0x276ff0, the record's clear in 0x274010), the signal 0x276a40's event unread, ported

`freeRaidSignal`, `freeRaidStart`, `freeRaidCheck`, `freeCitiesMilitary`,
`freeOpNear` (cpu/core/freeOps.ts) on the one operation manager;
`_free_raid_signal`, `_free_raid_plot`, `_free_raid_start`,
`_free_raid_check` (gpu/core/sim_minorai.py) and the operations' row `FR`
(gpu/core/sim_minorops.py).

- THE SIGNALS (FreeCities_Manager, the listeners 0x2765f0 connects): a
  combat on a Free City's district (0x276d90: the attacker, +0x70); a Free
  City's district pillaged (0x276e70: the owner of the last unit on the
  plot); an improvement of a Free City pillaged (0x276ff0: the owner of the
  last unit on the plot); 0x276a40 (a Free City with a flag, the plot's last
  unit's owner; its event unread). Each finds the Free City's record by the
  plot (0x277470: the records' +0x0c / +0x10 plot, +0x14 live) and calls
  0x274ea0.
- THE START 0x274ea0: where the record's +0x24 (the operation's tree) and
  +0x20 (the player) are both -1 — a Free City raids ONCE in its life —
  "Free Cities Raid" is started by name (0x7265b0) with the target the
  raided player's first city's plot (the player's +0x12f0 city list, its
  first's +0x158; with none -9999, no target), then 0x73e7d0 sets the
  target, the rally the Free City's plot (+0x0c) and each team's goals;
  +0x24 takes the tree's id, +0x20 the player. Nothing writes the
  operation's enemy (op +0x2a0): the raid runs against none — its Attack
  Units lines list both majors' units (runs/h1_duelw1123 t205: Owner 0
  and Owner 1 targets; t206 a Great General's).
- THE CLEAR: 0x274010 (a Free City's turn) opens with: +0x24 set and its
  tree gone, +0x24 = -1 (+0x20 kept).
- THE OPERATION (AiOperationDefs): TARGET_ENEMY_COMBAT_DISTRICT, enemy
  WAR, CITY_ASSAULT, priority 3, SelfStart false; its team "Free Cities
  Assault Force" (UNITAI_COMBAT 2-6, initial strength advantage -40); its
  tree "Free Cities Assault": Sequence [Recruit Units, Priority [Not [Is
  City Threatened], Operation Attack Units], Concurrent [Operation Attack
  Units, Operation Move (range 2, unit distance 2)], Concurrent [Operation
  Pillage (districts), Operation Attack Units (along march), Operation
  Siege City, Operation Attack City, Operation Pillage (improvements),
  Operation Move (range 2)]]. The Free Cities weigh no candidate: no
  AI_Operation_Eval.csv line of player 62.
- THE THREAT: 0x5cbd10 asks 0x723cf0 per player — a running operation of
  the city's owner against that player (op +0x2a0) whose target lies within
  5 of the city — and passes the player over while the city is undamaged.
  The raid names no enemy, so it holds back no threat.
- Recorded: runs/h1_duelw1123 t205, Rome's Warrior pillaging the Free City
  Chen's improvement ("Pillage Improvement"): AI_Operation.csv player 62
  "Free Cities Raid, Started", TARGET 11:13 (Rome's capital), its recruit's
  "Contract for: UNIT_ARCHER" (the team's unit to build: the Recruit Units
  node names no Contract ID, so no contract is made, nor is any by the Free
  Cities: their CityEvents list's "Simple City Tree" has no nodes); the
  operation complete t213.
- The engines: the signals at a melee or ranged blow on a Free City's centre
  or Encampment and at a pillage on a Free City's ground by the unit on it
  (the majors' PILLAGE; the barbarians hold no city to raid), the raided
  player's first
  city its cities' first; the operations' tree ids the Free Cities' city
  AI's serial (`freeSeat.cityAi`, the row `FR`); the run in the Free
  Cities' tactical pass once each unit's planning is taken. LAB: the
  signal 0x276a40's event; the last unit on a pillaged plot read as the
  pillager (a coastal raid's and an air pillage's plot holds none of
  theirs: no signal there).

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
  every citizen afresh, and keep a pinned specialist on a pillaged
  building's slot until the pin changes where the game keeps it until its
  next full re-place (AUDIT C-94 BUILD).
- A move onto a religious unit (0x26fe20): the engines' melee order onto
  one only shares its plot (AUDIT C-94 BUILD).
- An embarking move onto a civilian (0x26fe20 takes it): the engines'
  seizure takes no plot the mover cannot stand on without embarking (AUDIT
  C-94 BUILD).
- The high-adjacency moment reads District::GetYield's flat bucket (+0x2f0)
  and appeal rows (+0x458) only as Nan Madol's Culture (docs/AUDIT.md, the
  Harness section's Moments BUILD line).

Every other rule read above ships on both engines.

## C-99: a unit's experience is never spent — LAB on the records, ported

The records' unit rows (`xp`, `level`): the experience a unit holds counts
from its first, kept through its promotions; the next level needs 15 x
L(L+1)/2 at level L (15, 45, 90, ...). runs/h1_duelw1121: 1:131073 promoted
to level 2 at t6 keeps its 15; 2:1441793 at t72 holds 16 at level 2 the turn
after its promotion on 15; 2:1900545 at level 2 with 45 is promoted to level
3 at t122 (46); 2:1966080 goes from level 1 with 3 to level 3 with 49 in one
turn; 2:2883584, an Infantry at level 3 with 54 from t194, takes no promotion
(the engines, spending a level's experience at each promotion, read 54 above
level 3's 45 and promoted it every turn: 48 of 56 of its turns off). The
promotion flag (+0x1bc0 +8, read by 0x116f80) and its writer are unread.
Ported: `xpToNextLevel` / `_xp_to_next` the cumulative threshold,
`takePromotion` / `_take_promotion` keep the experience.

## C-94: the aid request's gate — READ (0x2597d0 over the event tally 0x33b350), both twins

EMERGENCY_SEND_AID's Trigger EMERGENCY_TRIGGER_PLAYER_LOSES_POP_TO_RANDOM_EVENT
(hash 0x63e0b202) is subscribed in the emergency manager's setup 0x25c460
(CAPABILITY_EMERGENCIES, hash 0x370521e0, gates it) to the game signal at
GameSignals +0xc48; the subscriber 0x261ce0 calls 0x2597d0(player, a, b, c).
The install's SEND_AID_EMERGENCY_TARGET_REQUIREMENTS / _MEMBER_REQUIREMENTS
are REQUIREMENTSET_TEST_ALL sets with no requirement rows
(Expansion2_Emergencies.xml), so the gate is the DLL's:

- 0x2597d0: the player is a living full civilization (0x484a10, 0x4848c0),
  and a x 0.5 + b + c >= GlobalParameters +0x7c4 —
  WORLD_CONGRESS_REQUEST_FOR_AID_DAMAGE_MIN (the loader 0x2d58f0 at
  0x2d9870; Expansion2_GlobalParameters.xml Replace 4). Below it nothing is
  raised; at or above it the trigger 0x260760 queues the emergency.
- The signal is raised once per affected player at the end of ONE event's
  application by 0x33b350 (callers: the drought strike 0x286530, the one-off
  strike 0x2867f0 — a fire plot's, a meteor's —, the storm strike 0x286f80,
  the accident 0x2d33a0, the eruption passes 0xa1c1a0 / 0xa1c760, the flood
  0xa2a4d0), over a per-player record the caller keeps on its own stack
  (0x4c bytes per player, zeroed by 0x3338d0): a = 0x3388e0, b = rec+0x18,
  c = 0x339270.
- The shared applier 0x336a50 adds each landed row's return to the field of
  the plot's (or unit's) owner its out-parameter names: +0x0
  IMPROVEMENT_PILLAGED (0x33aba0: 1 on any improvement of an owned plot,
  pillaged already or not), +0x4 IMPROVEMENT_DESTROYED, +0x8
  SPECIFIC_IMPROVEMENT_PILLAGED, +0xc SPECIFIC_IMPROVEMENT_DESTROYED, +0x10
  BUILDING_PILLAGED, +0x14 DISTRICT_PILLAGED, +0x18 POPULATION_LOSS
  (0x33a6e0: 1 per citizen), +0x1c UNIT_KILLED_CIVILIAN (0x33a070: the
  civilians killed), +0x20 UNIT_DAMAGE_LAND, +0x24 UNIT_DAMAGE_NAVAL
  (0x3366a0: the units the damage KILLS, damage >= COMBAT_MAX_HIT_POINTS, not
  the units struck), +0x38 hash 0x24424839, +0x40 hash 0xfdf34e62, +0x44
  hash 0x94d0056f, +0x48 hash 0xb8eaa363 (types no install row names).
- a = +0x0 + +0x4 + 2 x +0x8 + +0x10 + +0x14 + +0x2c + +0x3c + +0x44
  (0x3388e0 reads +0x8 twice); c = +0x1c + +0x20 + +0x24 + +0x40. So one
  event must take 4 citizens, or kill 4 units, or pillage 8 improvements,
  districts or buildings, or a mix, from ONE civilization.

Records: 0 of the 29 duels' Game_Emergencies.csv raise SEND_AID over ~250
majors' citizens lost to random events (runs/h1_duelw1128 t46: the fire on
plot 542 takes Xi'an's one citizen, 1 point of 4; the engines raised the
request on any citizen lost, Rome +100 Favor at t65).

Ported: `aidScope` / `_aid_open` + `_aid_close` (one event's tally, a fire's
spread its own), `aidDamage` / `_aid_damage` at each applier, `AID_DAMAGE_MIN`
/ `_aid_damage_min`; the phase's lowest victim raises the request as before
(`raiseAidRequest` / `_raise_aid_request`). Unread: what 0x260760's queue
(+0x68) does with a raised aid request before it runs (the World Congress's
WC_EMERGENCY_REQUEST_AID discussion, Expansion2_Congress.xml) — no record
raised one.

## C-96: CanTrain's obsolescence and the contract purchase's refusal — READ (0x172820's prerequisite block, 0x538460, the callers' sixth argument), ported both twins

- CANTRAIN 0x172820 (city build queue +0x2170, unit, ..., its sixth argument
  a byte at [rbp + 0xe8], the caller's [rsp + 0x28]): the PrereqTech
  (Units +0x280, HasTech 0x4cb2f0 on player +0x1338) and PrereqCivic (+0x270,
  HasCivic 0x39d1f0 on +0x1310) refuse unless the byte is set
  (0x17296d / 0x172995); then 0x538460 — the unit OBSOLETE — refuses unless
  the byte is set (0x1729be..0x1729ca, `test r12b, r12b; je` to the refusal
  0x1738e2).
- 0x538460 (unit, player): true where the player holds the unit's
  MandatoryObsoleteTech (+0x240), MandatoryObsoleteCivic (+0x238),
  ObsoleteTech (+0x250) or ObsoleteCivic (+0x248) — nothing more (no
  upgrade-line test).
- THE SIXTH ARGUMENT, read at each call: clear (0) in the Default
  Specialization's best unit 0x5d2600 (0x5d2760, r12b = 0), the purchase
  pick 0x5d2810 (0x5d28ba), the contracts' eligibility 0x5f6050 (0x5f67ec:
  a unit contract is eligible where COMPLETED, else not MustPurchase and
  CanTrain), the queue 0x5ca5a0 (0x5ca61e, r14b = 0) and the expected count
  0x5d4750 (0x5d47be); set only in the plot analysis's unit loop 0x5ce970
  (the AI +0x12a0 +0xba8 flag, "C-96 / C-97: the unit value"). So the unit
  table and the building-or-unit event (0x5d2600 unchecked) value an
  obsolete unit — its table entry x3 — and the event may submit its
  contract, while the queue, the Default Specialization, the eligibility
  and the purchase never take it.
- THE PURCHASE (TryPurchaseUnits 0x68be60 -> the purchase request 0x977570,
  the game core's command): the Gold price 0x1b22d0 holds no CanTrain test
  (the cost, its modifiers, the Gold multiplier, the step), so an obsolete
  unit's contract passes the savings test and the request refuses it — read
  off the records below (the command's own validation of the request
  unread). The record's own purchase list (each city's "buy" rows, the
  game's CanPurchase) lists no obsolete unit.
- CONFIRMED: runs/h1_duelu1117 Valletta (player 2), Gunpowder held, its
  Warrior contract 680 (unit 21, value 0, ACCEPTED, in the economic AI's
  purchase list at t195's aimem) unbought t195-t220 with its Gold at 99-150
  over a Warrior's price; t195's purchase list: Scout, Swordsman, Horseman,
  Heavy Chariot ... — no Warrior, Slinger, Archer, Spearman, Galley,
  Catapult, Quadrireme or Trebuchet, each obsolete (ObsoleteTech Gunpowder,
  Machinery, Ballistics, Metal Casting, Steam Power, Steel). The engines
  bought the Warrior every second turn (1117 p2 t195-t223, 1121 Hunza
  t158-t225: 35 of the five duels' unit.trained misses).
- Ported: `unitObsoleteIn` / `researchHolds` (`minorBuild.ts`), refused by
  `minorCanTrain` and the Free Cities' `canTrain`, the minor's purchase
  request (`minorPurchaseCity` `canPurchase`); GPU `_unit_obsolete_in` /
  `_minor_can_train` (sim_minors.py), `_MinorFacts.can_train` /
  `_FreeFacts.can_train` (sim_cityvalue.py), `_minor_contract_purchases`.
- MEASURED (--aiscore, the five duelu duels, carried memory, with the
  replay's own corrections of the same pass — the last city-state's
  in-turn upgrades, a route's returned or spent Trader, a purchase's undo
  and the record's purchases and upgrades through the savings):
  unit.trained 213 / 359 (59.3%) -> 231 / 281 (82.2%), cityState.build
  91.6% -> 92.2%; the Warrior contract purchases (35 of the 146 misses) gone.
