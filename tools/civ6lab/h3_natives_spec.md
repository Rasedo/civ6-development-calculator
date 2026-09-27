# H-3: what the map natives do — the spec

Civ 6 Gathering Storm, `Continents.lua` (the Expansion2 script and utilities,
run unmodified), every native call it makes that is not a pure getter,
measured in the live game. Each section: inputs, outputs, draws, the rule,
the evidence and its score. "Exact" means every recorded call or plot agrees;
anything else is stated as a count.

## The evidence base

| record | map | options | what it holds |
|---|---|---|---|
| `runs/h3_session_20260927T015420Z.jsonl` (+`_ledger.json`) | Duel 44x26, map seed 1000 | setup defaults (world age, sea level, temperature, rainfall 2) | natives probe: LOG of draws and native markers, X records, final tables |
| `runs/h3_session_20260927T015648Z.jsonl` (+ledger) | Tiny 60x38, 1000 | defaults | natives probe + post-game reads (`h3_postgen.lua`) + live DB rows (`h3_dbrows.lua`) |
| `runs/h3_session_20260927T020045Z.jsonl` (+ledger) | Small 74x46, 1000 | defaults | natives probe + post-game reads |
| `runs/h3_session_20260927T021047Z.jsonl` (+ledger) | Standard 84x54, 1000 | defaults | natives probe + post-game reads + live DB child tables (`h3_dbtables.lua`) |
| `runs/h3_session_20260927T021509Z.jsonl` | Small | defaults | experiments (`civ6lab_mapprobe_exp.lua`): 18 land shapes stamped, 48 wonder placements |
| `runs/h3_session_20260927T023441Z.jsonl` | Standard | defaults | experiments: 18 shapes, 83 placements |
| `runs/h3_session_20260927T023549Z.jsonl` | Tiny | defaults | experiments: 18 shapes, 73 placements |
| `runs/h3_session_20260927T024959Z.jsonl` | Small | defaults | experiments: the 18 shapes again plus 13 terrain / mountain variants of one rectangle and a tall strip |
| `runs/h3_session_20260927T010916Z.jsonl`, `..010811Z.jsonl` | Duel 1000 / 2024 | world age and sea level rolled | the quiet probe (earlier) |

The probe `h3_mapprobe_mod/Maps/civ6lab_mapprobe_natives.lua` draws nothing
(its map is the unprobed map: Continents.lua with the setup defaults and the
probe with the same options set give byte-identical dumps and the same draw
count, 365,913 on Duel seed 1000, `runs/h3_map_contdef_m1000_g2000.json` vs
`runs/h3_map_nat1_h3_duel_natives_m1000_g2000.json`); every ledger
(`h3_ledger.py`) is exact to the draw: Duel 365,913, Tiny 393,621, Small
395,013, Standard 426,080. The probe's end-of-map tables (CanHaveFeature,
CanHaveResource, GetPlotFertility, FindSecondContinent over every plot) take
no draw (the ledger tail is 0).

Conventions (the game's, confirmed by `Map.GetAdjacentPlot` in
`h3_postgen.lua`): plot index = y*W + x, y = 0 the south row; odd rows sit
half a hex east; DirectionTypes 0 NE (x+odd, y+1), 1 E (x+1, y), 2 SE
(x+odd, y-1), 3 SW (x+odd-1, y-1), 4 W (x-1, y), 5 NW (x+odd-1, y+1), odd =
y & 1; x wraps, y does not. Hex distance is the cube distance of
q = x - (y - (y & 1))/2, r = y, with x wrapping. A draw is
`TerrainBuilder.GetRandomNumber(n)` = CvRandom (AUDIT H-3); `get(n)` below.

Analysis scripts (all offline, `python tools/civ6lab/<script> <records>`):
`h3_stamp.py`, `h3_stampmap.py`, `h3_expshow.py`, `h3_corner.py`,
`h3_areas.py`, `h3_findwater.py`, `h3_fsc.py`, `h3_chf.py`, `h3_chffoot.py`,
`h3_chr.py`, `h3_nwfit.py`, `h3_nwshape.py`, `h3_plotfacts.py`, `h3_flood.py`,
`h3_floodfit.py`, `h3_riverlist.py`, `h3_fert*.py`, `h3_voronoi.py`,
`h3_geovoronoi.py`, `h3_seedfit.py`, `h3_seedpair.py`, `h3_stampmodel.py`,
`h3_depthmap.py`; shared readers `h3_x.py`.

---

## TerrainBuilder.StampContinents()

- **Inputs**: the plot types at the call (Continents.lua calls it once, after
  `ApplyBaseTerrain`, `AreaBuilder.Recalculate`, `AnalyzeChokepoints`); the
  map size's continent count N = `Maps.Continents` (Duel 1, Tiny 2, Small 3,
  Standard 4, Large 5, Huge 6).
- **Outputs**: every plot's continent type (`GetContinentType`): an index
  into `Continents` (43 rows, Base `Gameplay/Data/Maps.xml`, AFRICA 0 ..
  ZEALANDIA 42) on every non-ocean plot (land, mountains and lakes), -1 on
  every ocean plot. Nothing else changes (terrain, areas).
- **Draws: exactly 43**, on every size measured (Duel, Tiny, Small, Standard
  ledgers exact with 43). They are Civ 5's `shuffleArray` over the 43
  Continents rows: `a = [0..42]; for i in 0..42: j = i + get(43 - i);
  swap(a[i], a[j])` (43 draws, the last get(1) always 0). The continent
  numbered k of the partition takes `a[k]`.
  - Evidence: the continent types of 7 maps (Duel 1000 rolled and defaults,
    Duel 2024, Tiny, Small, Standard) are `a[0..N-1]` from the ledger's
    stream state at the call; Small (3 continents) rules out drawing from a
    pool (pool order gives 10 at index 28), Standard gets 4 of 4. Chance of
    a false match: 43^-(1+1+1+2+3+4) ~ 1e-20 (`h3_stamp.py`).
- **Which continent is numbered k** (which part of the land takes `a[0]`):
  OPEN. On the natural maps `a[0]` went to the east landmass (Tiny), the
  east landmass (Small), a western strip of a split landmass (Standard).
- **The partition: OPEN (partly measured).** What is established from 18
  controlled shapes on each of Tiny, Small and Standard (`exp` records;
  `h3_expshow.py`):
  - the partition depends on the land only through the stamp's own state,
    not on the draws: the same rectangle stamped twice (different shuffles)
    and shifted 5 plots east gives the same partition, shifted;
  - N parts on every shape with enough land, including a single rectangle
    (split into N), two equal rectangles (N=2: one each; N=3: one kept
    whole, the other split in two; N=4: both split), three equal columns
    (N=3: one each; N=2: two merged; N=4: one split), four quadrants (N=2:
    merged in pairs by column; N=3: one pair merged), five 7x7 blobs
    (merged by column), an island (it joins the nearest part, x wrapping);
    a one-plot-wide line and a single plot stay one continent;
  - within a landmass the boundaries are hex-distance bisectors (60-degree
    edges, `rect_center` on Standard), and every split is consistent with a
    nearest-seed (hex distance, x wrapping) partition with ties
    (`h3_seedfit.py`), but it is NOT a Voronoi of seeds without ties, nor in
    Euclidean, offset or land-path distance (`h3_voronoi.py`,
    `h3_geovoronoi.py`);
  - a 12-wide tall rectangle is cut into bands carved from its NORTH end
    (101, then 60, 60 plots, the rest last) on Tiny, Small and Standard
    alike; a 4-row strip into pieces carved from its EAST end (13, 4, 4,
    the rest). On Standard the tall bands are reproduced exactly by nearest
    seed (hex distance, a tie to the northern seed) from seeds on the strip's
    axis 5 rows apart starting 6 rows below its north shore,
    (41,45), (42,40), (41,35), (42,30) (`h3_seedpair.py`; two other seed
    chains fit too);
  - the flat terrain does NOT matter: one 54x30 rectangle in grassland,
    plains, desert, tundra, grass hills, snow, or half desert (either half
    or the south half) gives the identical partition; a mountain column
    through it (which splits it into two land areas, see
    `AreaBuilder.Recalculate`) changes it to the two-landmass pattern (one
    side whole, the other split): the unit is the land AREA, not the
    landmass (`runs/h3_session_20260927T024959Z.jsonl`, `rectB_*`);
  - the best seed model tried (seeds greedily by distance to water, then by
    plot index, with a spacing of the depth; nearest seed) reaches 84% of
    plots over 54 shapes (`h3_stampmodel.py`): not the rule.

## TerrainBuilder.GetInlandCorner(plot)

- **Inputs**: a land plot P. **Output**: a plot C at whose SE corner a river
  starts (`DoRiver(C)`), or nil.
- **Draws: exactly 4**: Civ 5's `shuffleArray` of [0, 1, 2, 3]
  (`j = i + get(4 - i)`, i = 0..3).
- **Rule** (Civ 5's `CvPlot::getInlandCorner`): walk the shuffled cases in
  order; case 0 = P, 1 = P's NE neighbour, 2 = P's NW neighbour, 3 = P's W
  neighbour; return the first candidate that exists and has no water at its
  SE corner (the candidate itself, its E neighbour and its SE neighbour are
  all land); none: nil.
- **Evidence: exact on 94 of 94 calls** (Duel 13, Tiny 18, Small 30,
  Standard 33; `h3_corner.py`): 92 answer the first shuffled case, the 2
  whose first case has water at its corner answer the second; with 4 cases
  a chance match is 4^-94.

## AreaBuilder.Recalculate()

- **Output**: every plot's area (`plot:GetArea()`, `Areas`): the connected
  components (6 neighbours, x wrapping) of three plot classes: water (Coast
  and Ocean terrain, lakes included), passable land, mountains (the
  `*_MOUNTAIN` terrains); each mountain group is its own area and splits
  the land areas around it.
- **Ids**: components numbered k = 1, 2, ... in the order of their lowest
  plot index; area id = (k << 16) | (k - 1) (65536, 131073, 196610, ...).
- **Draws: 0.**
- Areas are not updated by later terrain changes until the next call (a
  lake wonder's plots turned Coast by `SetFeatureType` keep their land area).
- `plot:IsLake()` = a water plot whose area holds at most
  `LAKE_MAX_AREA_SIZE` 9 plots (GlobalParameters).
- **Evidence: exact** on the final areas of 4 maps (1144 + 2280 + 3404 +
  4536 plots; the two Duel/Tiny misses are the lake-wonder plots above,
  exact once they take their earlier terrain) and IsLake exact on the same
  (`h3_areas.py`).

## TerrainBuilder.AnalyzeChokepoints()

- **Draws: 0.** **Map effect: none a script can read**: `plot:IsChokepoint()`
  answers false on every plot after both calls and at turn 1 on all 4 maps
  (`choke` records, `CHOKE` line of `h3_postgen.lua`); the game's
  `Logs/AI_ChokePoint.csv` stays empty. It feeds the AI only: the generator
  can skip it.

## TerrainBuilder.GenerateFloodplains(bRiversStartInland, 4, 10)

- **Draws: 0.** Called once, first in `FeatureGenerator:AddFeatures`, after
  the rivers and lakes.
- **Each river's plot list** (what `RiverManager.GetRiverByIndex(i,
  "plots").Plots` answers after the game starts): walk the river's setter
  calls in the order `DoRiver` made them (river id = the setter's last
  argument); each edge adds, when not yet listed, first the plot passed to
  the setter, then its partner across the edge (`SetWOfRiver(P)`: P's E
  neighbour; `SetNWOfRiver(P)`: P's SE neighbour; `SetNEOfRiver(P)`: P's SW
  neighbour). Exact on 81 of 81 rivers (Tiny 18, Small 30, Standard 33;
  `h3_riverlist.py`); the other orders fail (0/81 partner first).
- **Rule**: for every river, scan its plot list from the END (the mouth)
  towards the source; a plot is eligible when its terrain is flat grassland,
  plains or desert (not hills, not mountain, so not tundra or snow) and it
  has no feature; the first maximal run of consecutive eligible plots with
  at least 4 (`iMinFloodplainSize`) plots is the river's floodplain, its
  last 10 (`iMaxFloodplainSize`, the ones nearest the mouth) at most; one
  run per river, runs shorter than 4 are passed over. Each floodplain plot
  takes the feature of its terrain: desert FEATURE_FLOODPLAINS (index 0),
  grassland FEATURE_FLOODPLAINS_GRASSLAND (31), plains
  FEATURE_FLOODPLAINS_PLAINS (32) (29 / 132 / 131 plots). A plot on two
  rivers can be taken by either (the model takes the union).
- **Evidence: exact** on 274 of 274 floodplain plots and no extra plot (Tiny
  45, Small 88, Standard 141; `h3_floodfit.py`).
- The climate's floodplain registry (which rivers flood: on Tiny 3 of 18,
  each a named river with a floodplain; `GetRiverForFloodplain`) is kept by
  the game, and river names are OPEN (two named rivers have no floodplain).

## TerrainBuilder.AddIce(plotIndex, eventIndex)

- **Inputs**: a plot that `SetFeatureType(plot, FEATURE_ICE)` has just made
  Ice (FeatureGenerator:AddIceToMap always calls that first), and the
  sea-level phase: -1 (permanent) or a RandomEvents index with
  `EffectOperatorType` SEA_LEVEL (24..30 = RANDOM_EVENT_SEA_LEVEL_RISE1..7,
  IceLoss 10, 20, 30, 40, 55, 70, 85).
- **Output**: no change to the map: the plot's terrain and feature and its
  six neighbours' are the same before and after on every call (Duel 284,
  Tiny 459, Small 751 calls; `ice` records). It registers the plot's ice
  with the climate so that sea-level phase `eventIndex` melts it (-1 never).
- **Draws: 0.**

## TerrainBuilder.AddCoastalLowland(plotIndex, elevation)

- **Output**: `TerrainManager.GetCoastalLowlandType(plot)` goes from -1 to
  `elevation` (0, 1, 2 = COASTAL_LOWLAND_1M / 2M / 3M, the CoastalLowlands
  rows); terrain and feature unchanged.
- **Draws: 0.**
- **Evidence: exact**: 45 + 85 + 88 calls; the post-game reader equals the
  elevations passed on 85/85 (Tiny) and 88/88 (Small).

## TerrainBuilder.CanHaveFeature(plot, f [, bFootprint])

Pure row logic on the plot as it stands. **Draws: 0.**

The single-plot test (third argument true or omitted) refuses when, in order
(the first failing clause names the refusal; all clauses are needed):

1. the plot has a feature;
2. `Feature_ValidTerrains` lists terrains for f and the plot's terrain is not
   one of them, unless f has `Lake` and the plot is a lake;
3. `NoCoast`: a LAND plot with a neighbour that is salt water (water, not a
   lake) not covered by Ice;
4. `NoRiver`: the plot is a river plot or next to one (`IsRiver` or
   `IsRiverAdjacent`);
5. `RequiresRiver`: the plot is not a river plot;
6. `Lake`: any neighbour is water (a lake wonder needs dry land all round;
   a one-plot lake qualifies);
7. the plot is a lake and f has no `Lake`;
8. `Coast`: the plot has no neighbour that is salt water without Ice;
9. `MinDistanceLand` / `MaxDistanceLand` (when non-zero): the hex distance
   to the nearest land plot is below / above them;
10. `NoAdjacentFeatures`: a neighbour has a feature;
11. `Feature_AdjacentTerrains`: no neighbour has one of the terrains;
12. `Feature_NotAdjacentTerrains`: a neighbour has one of the terrains;
13. `Feature_AdjacentFeatures`: no neighbour has one of the features;
14. `Feature_NotNearFeatures` (the water wonders avoid Ice): a plot carrying
    the avoided feature within hex distance `(W * H) // 256` (Duel 4, Tiny
    8, Small 13, Standard 17: each fitted uniquely per size, and the four
    agree with the formula; Large 22 and Huge 27 are predictions);
15. `MinDistanceNW` (8): a natural-wonder plot within hex distance 8.

Not tested by it: `NoResource` (Torres del Paine is admitted on resources),
`NotCliff`, `Impassable`, `Tiles`.

With third argument **false** a natural wonder with `Tiles` > 1 also needs a
footprint: the plot passes, and for some direction d the extra plots pass
the single-plot test: 2 plots: the neighbour d; 3: the neighbours d and
d+1; 4: those and the neighbour d+1 of neighbour d (a rhombus). Other
features: the same as true.

- **Evidence: exact** on all 50 feature rows x 4 maps (11,364 plots each,
  568,200 answers) for the single-plot test, and on the 24 non-custom
  natural wonders for the footprint test (`h3_chf.py`, `h3_chffoot.py`;
  the custom-placement ones, placed by Lua, are exact but Roraima 17 and
  Zhangye Danxia 2 plots). Rows from the live database
  (`h3_dbrows.lua`, `h3_dbtables.lua`).

## ResourceBuilder.CanHaveResource(plot, r)

Pure row logic. **Draws: 0.** Refuses when:

1. the plot has a resource;
2. the plot is a start plot (any player's `GetStartingPlot`, city-states
   included);
3. the plot has a feature not in `Resource_ValidFeatures` for r; or it has no
   feature and its terrain is not in `Resource_ValidTerrains` (a listed
   feature admits the resource whatever the terrain under it);
4. `NoRiver` and the plot is a river plot; `RequiresRiver` and it is not;
5. `LakeEligible` false and the plot is a lake;
6. `AdjacentToLand` and no neighbour is land (for land plots too: Amber on a
   one-plot island is refused).

- **Evidence: exact** on all 54 resource rows x 4 maps (613,656 answers,
  `h3_chr.py`).

## Map.FindWater(plot, range, bFresh), Map.FindSecondContinent(plot, range), Map.GetContinentsInUse()

- **FindWater**: true when a plot within hex distance `trunc(range)`
  (the plot itself included) is, with bFresh true, fresh water in the sense
  of `IsFreshWater` below (rivers laid so far count at once; mountains never),
  with bFresh false, water. Exact on 2,210 + 723 calls over 4 maps
  (`h3_findwater.py`; the range 1.5 is 1). No draws.
- **FindSecondContinent**: true when the plot has a continent (not -1) and a
  plot within hex distance `range` has another one (not -1). Exact on
  3 ranges x 3 maps (`h3_fsc.py`).
- **GetContinentsInUse**: the continent types in use, ascending. Exact on 3
  maps.

## The plot predicates the scripts read

Derived from terrain, feature and river flags, scored against the game's own
answers on 4 maps (`h3_plotfacts.py`): IsWater (Coast/Ocean) exact; IsLake
(above) exact; IsRiver = a river on any of the six edges (the plot's own
W/NW/NE-of-river flags, the W neighbour's W-of, the NW neighbour's NW-of,
the NE neighbour's NE-of) exact but 2 plots (an edge between land and water
at the map's ice); IsRiverAdjacent = a neighbour IsRiver; IsCoastalLand =
land with a water neighbour not covered by Ice, exact; IsFreshWater = land,
not mountain, and a river plot, next to a lake or next to a feature with
`AddsFreshWater` (Oasis and the fresh-water wonders; the wonder's own plot
excluded); IsImpassable = mountain or an Impassable feature.

## StartPositioner.GetPlotFertility(i, -1) / GetMajorCivStartInfo(i)

- **Draws: 0** (the ledger shows none across the start-plot phase).
- GetPlotFertility(i, major, false) = GetPlotFertility(i, -1) on every plot;
  with true it differs on 654 of 1144 Duel plots.
- **Rule: OPEN, partly modelled.** Recorded per plot on 4 maps (`fert`,
  `fertw` records). The base is the plot's own yields (as `plot:GetYield`
  answers at the end of generation, resources included):
  2*food + 2*production + gold + science + culture + faith; impassable
  plots (mountains, Ice) 0. On top of it, measured on Tiny and Small
  (`h3_fert3.py`, `h3_fert4.py`): a river plot +3 (222 of 289 flat
  river plots without a resource), a land plot fresh by a lake +2, a
  luxury resource on the plot +5, tundra and snow -2, many Ocean and Coast
  plots down to 0. Flat inland land with no river and no resource equals
  the base on 253 of 339 plots; the rest are +1..+7 by a neighbour term
  not yet found.
- GetMajorCivStartInfo(i) answers {ContinentType, LandmassID, Fertility,
  TotalPlots, WestEdge, EastEdge, NorthEdge, SouthEdge} for region i
  (`sinfo` / `minfo` records; LandmassID uses the area id form
  (k << 16) | (k - 1)); the region division (DivideMapIntoMajorRegions) is
  OPEN.

## ResetTerrain, SetNaturalCliff (B-94)

Both are Lua, in `NaturalWonderGenerator.lua`, and run unmodified:
`ResetTerrain(i)` turns a hills or mountain terrain into its flat terrain
(SNOW/DESERT/PLAINS/GRASS/TUNDRA *_HILLS and *_MOUNTAIN -> the base);
`__PlaceWonders` calls it on the anchor after `SetFeatureType` and on every
natural-wonder plot within `Map.GetPlotXY(x, y, dx, dy, 2)` for dx, dy in
-2..2; `CustomSetFeatureType` calls `SetNaturalCliff(i)` then
`ResetTerrain(i)` on each of the custom shape's plots. `SetNaturalCliff`
sets a cliff on every edge the plot shares with water (NE: the neighbour's
NE-of-cliff flag via `SetNEOfCliff(adjacent)`; E: own W-of; SE: own NW-of;
SW: own NE-of; W: the W neighbour's W-of; NW: the NW neighbour's NW-of). The
natives they call are setters: `TerrainBuilder.SetTerrainType`,
`SetNEOfCliff`, `SetNWOfCliff`, `SetWOfCliff` (flag writes, no draw).

## TerrainBuilder.SetFeatureType(anchor, f) for a multi-plot wonder without a CustomPlacement

- **Output**: f on the anchor and on the extra plots of the first
  orientation d, in DirectionTypes order (NE, E, SE, SW, W, NW), whose extra
  plots all pass the single-plot CanHaveFeature test: 2 plots: the anchor and
  its neighbour d; 3 plots: the anchor and its neighbours d and d+1 (a
  triangle); 4 plots: those and the neighbour d+1 of neighbour d (a
  rhombus). No orientation: nothing is placed (not even the anchor).
- A lake wonder (`Lake`: Crater Lake, Dead Sea, Lake Retba) turns every plot
  it covers into TERRAIN_COAST; no other wonder changes terrain here.
- **Draws: 0.**
- **Evidence**: 190 of 204 placements on 3 maps (`nwexp` records,
  `h3_nwfit.py`): Barrier Reef, Galapagos, Ha Long Bay, Pamukkale, Dead Sea,
  Lake Retba (2); Bermuda Triangle, Everest, Eye of the Sahara, Gobustan (3);
  Pantanal, Chocolate Hills, White Desert (4). The misses are lake wonders
  and Pantanal on the experiment maps whose own state (restored terrain
  after earlier placements, stale areas) the dump does not show.
