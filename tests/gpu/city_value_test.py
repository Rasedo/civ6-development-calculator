"""The city build AI's values on the GPU (`gpu/core/sim_cityvalue.py`): the
growth forecast and the housing value, the improvement value, the district
value, the project value and the PROJECTS table's gates, the savings and the
unit purchase, the modifiers' values, and the minors' tables and pick read
off a sim's own state — the same numbers the TS vitests pin
(tests/cpu/minors/plot-value.test.ts, district-value.test.ts,
city-build-values.test.ts, modifier-value.test.ts, minor-tables.test.ts).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/city_value_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import load_rules
from core.sim_civics import SimCivics
from core.sim_cityvalue import SimCityValue
from core.sim_economy import SimEconomy

FX = 256


class Values(SimCityValue, SimEconomy, SimCivics):
    """the value mixin over the rules alone"""

    def __init__(self, rules):
        self.rules = rules
        self.device = torch.device("cpu")


def L(x: int) -> torch.Tensor:
    return torch.tensor([x], dtype=torch.long)


def at(v: torch.Tensor) -> float:
    return round(int(v[0]) / FX * 100) / 100


class Plot:
    """a plot's facts as `aiPlotValue.ts`'s stub (plot-value.test.ts): every
    yield and pseudo-yield at its DefaultValue"""

    def __init__(self, **over):
        self.o = dict(improvement=None, pillaged=False, resource=None, feature=None, flood=-1, eruption=-1, appeal=0,
                      beside=False, pct=0, housing=None)
        self.o.update(over)

    def like(self):
        return L(0)

    def yield_w(self, y):
        return 0

    def pseudo_w(self, p):
        return 0

    def plot_improvement(self):
        return self.o["improvement"]

    def resource(self):
        return self.o["resource"]

    def feature(self):
        return self.o["feature"]

    def plot_pillaged(self):
        return int(self.o["pillaged"])

    def flood_turns(self):
        return self.o["flood"]

    def eruption_turns(self):
        return self.o["eruption"]

    def appeal(self):
        return self.o["appeal"]

    def beside_housing(self):
        return int(self.o["beside"])

    def unit_cost(self, unit):
        return 25

    def builds_unit(self, unit):
        return 1

    def extra_charges(self, unit):
        return 0

    def progress_pct(self):
        return self.o["pct"]

    def escalation(self):
        return 1000

    def speed_scaled(self, n):
        return torch.div(n, 2, rounding_mode="floor")

    def adjacency(self, imp, y):
        return 0

    def housing_value(self, housing, t, h):
        fn = self.o["housing"]
        return fn(housing, t, h) if fn else torch.zeros_like(t)

    def resource_value(self, res, count, t, h):
        return torch.zeros_like(t)


class District(Plot):
    """a plot of runs/h1_duelv1127 t2 player 3 (district-value.test.ts): the
    district pseudo-yield's weight 0.5"""

    def __init__(self, **over):
        base = dict(owned=False, price=25, adj=0, regional=0, trains=True, chron=1, count=0, cap=1, district=None)
        base.update(over)
        super().__init__(**base)

    def pseudo_w(self, p):
        return FX // 2 if p == "PSEUDOYIELD_DISTRICT" else 0

    def owned(self):
        return int(self.o["owned"])

    def purchase_cost(self):
        return self.o["price"]

    def lake(self):
        return 0

    def keeps_feature(self, d):
        return False

    def plot_district(self):
        return self.o["district"]

    def plot_district_pillaged(self):
        return 0

    def is_city(self):
        return 0

    def district_adjacency(self, d, y):
        return self.o["adj"] if y == "YIELD_SCIENCE" else 0

    rows_adjacency = district_adjacency

    def other_districts(self, d):
        return []

    def chronology(self):
        return self.o["chron"]

    def district_count(self):
        return self.o["count"]

    def district_cap(self):
        return self.o["cap"]

    def regional_cities(self, d, r):
        return self.o["regional"]

    def city_trains(self, dom):
        return int(self.o["trains"])

    player_trains = city_trains

    def domain_units_value(self, dom):
        return 0

    def river_plots(self):
        return 0, 0

    def canal_trade(self):
        return 0

    def project_value(self, p, t, h):
        return 0

    def space_race(self, p):
        return False

    def favoured(self, p):
        return False

    def districts_of(self, d, complete):
        return 0


class Project:
    """a city-state at 9% of the game's progress (district-value.test.ts)"""

    def __init__(self, **over):
        self.o = dict(advanced=0, has=lambda b: False, bv=0)
        self.o.update(over)

    def like(self):
        return L(0)

    def pseudo_w(self, p):
        return 0

    def advanced(self, p):
        return self.o["advanced"]

    def build_turns(self, p):
        return 10

    def progress_pct(self):
        return 9

    def space_race_standing(self):
        return 0

    def defence_repairs(self):
        return 0

    def population(self):
        return 3

    def districts(self):
        return 1

    def loyalty_falling(self):
        return 0

    def building_value(self, b, t, h):
        return self.o["bv"] * FX

    def has_building(self, b):
        return int(self.o["has"](b))

    def modifiers_value(self, p, t, h):
        return 0


def growth(surplus, housing, population, stored, multiplier):
    return {k: L(v) for k, v in dict(surplus=surplus, housing=housing, population=population, stored=stored,
                                     multiplier=multiplier).items()}


GROWTHS = [
    (growth(3 * FX, 4, 2, 5 * FX, FX), [[1679, 323, -2920], [9925, 8569, 2927], [9925, 8569, 2927]]),
    (growth(6 * FX + 128, 5, 4, 0, FX + 64), [[18250, 13767, 6335], [48679, 41260, 19007], [48679, 41260, 19007]]),
    (growth(2 * FX, 3, 3, 10 * FX, FX), [[5148, 4231, 1948], [15446, 12694, 5846], [15446, 12694, 5846]]),
    (growth(0, 6, 3, 0, FX), [[0, 0, 0], [0, 0, 0], [0, 0, 0]]),
]


def test_housing(v: Values) -> None:
    """`growthForecast` and `housingValue`: 1, 2 and 4 Housing more landing
    in 0, 5 and 20 turns"""
    for g, want in GROWTHS:
        fc = v._cv_forecast(g)
        for i, hh in enumerate((1, 2, 4)):
            got = [int(v._cv_housing_value(g, fc, hh, L(t), L(50))[0]) for t in (0, 5, 20)]
            assert got == want[i], (g, hh, got, want[i])
    print("  housing value OK")


def test_improvements(v: Values) -> None:
    """`improvementValue` (plot-value.test.ts)"""
    imp = lambda f, i, t: at(v._cv_improvement(f, i, L(t), L(50)))
    assert imp(Plot(), "IMPROVEMENT_FARM", 0) == 72.45
    assert imp(Plot(feature="FEATURE_FLOODPLAINS_GRASSLAND"), "IMPROVEMENT_FARM", 0) == 72.45
    assert imp(Plot(), "IMPROVEMENT_MINE", 4) == 62.51
    assert imp(Plot(eruption=31 * FX), "IMPROVEMENT_MINE", 4) == 48.44
    assert imp(Plot(flood=FX), "IMPROVEMENT_FARM", 0) == -8
    assert at(v._cv_feature_removal(Plot(), "FEATURE_FOREST", L(0), L(50))) == -18.11
    assert at(v._cv_feature_removal(Plot(pct=6), "FEATURE_FOREST", L(0), L(50))) == -13.11
    assert imp(Plot(feature="FEATURE_FOREST"), "IMPROVEMENT_FARM", 0) == 54.34
    assert int(v._cv_improvement(Plot(improvement="IMPROVEMENT_FARM"), "IMPROVEMENT_FARM", L(0), L(50))[0]) == 0
    assert int(v._cv_improvement(Plot(resource="RESOURCE_HORSES"), "IMPROVEMENT_FARM", L(0), L(50))[0]) == 0
    print("  improvement value OK")


def test_districts(v: Values) -> None:
    """`districtValue` (district-value.test.ts and the housing-carrying rows)"""
    d = lambda f, n, t: v._cv_district(f, n, L(t), L(50))
    assert at(d(District(owned=True, price=0, adj=1), "DISTRICT_CAMPUS", 15)) == 109.41
    assert at(d(District(adj=1), "DISTRICT_CAMPUS", 15)) == 91.75
    assert at(d(District(), "DISTRICT_CAMPUS", 15)) == 81.8
    assert at(d(District(price=-1), "DISTRICT_CAMPUS", 15)) == 89.82
    assert int(d(District(regional=1), "DISTRICT_INDUSTRIAL_ZONE", 20)[0]) > int(d(District(), "DISTRICT_INDUSTRIAL_ZONE", 20)[0])
    g = GROWTHS[0][0]
    fc = v._cv_forecast(g)
    hv = lambda hh, t, h: v._cv_housing_value(g, fc, hh, t, h)
    base = dict(owned=True, price=0, appeal=2, count=1, cap=2, housing=hv)
    assert int(d(District(**base), "DISTRICT_NEIGHBORHOOD", 20)[0]) == 20467
    assert int(d(District(**base), "DISTRICT_INDUSTRIAL_ZONE", 20)[0]) == 8774
    assert int(d(District(**base, trains=False), "DISTRICT_HARBOR", 10)[0]) == 65133
    assert int(d(District(**base), "DISTRICT_ENCAMPMENT", 12)[0]) == 33933
    print("  district value OK")


def test_projects(v: Values) -> None:
    """`projectValue` (district-value.test.ts)"""
    p = lambda f, n, t: at(v._cv_project(f, n, L(t), L(50)))
    assert p(Project(), "PROJECT_ENHANCE_DISTRICT_CAMPUS", 3) == 29
    assert p(Project(), "PROJECT_ENHANCE_DISTRICT_CAMPUS", 1) == 31
    assert p(Project(), "PROJECT_DECOMMISSION_COAL_POWER_PLANT", 3) == -9999
    held = Project(has=lambda b: b == "BUILDING_COAL_POWER_PLANT", bv=40)
    assert p(held, "PROJECT_DECOMMISSION_COAL_POWER_PLANT", 3) == -40
    assert p(Project(advanced=1), "PROJECT_MANHATTAN_PROJECT", 3) == -9999
    print("  project value OK")


def test_economic(v: Values) -> None:
    """`savingsTurn` and `tryPurchaseUnits` (district-value.test.ts)"""
    s = torch.zeros(1, 4, dtype=torch.long)
    yes = torch.tensor([True])
    s, bal = v._cv_savings_turn(s, L(0), L(90 * FX), yes)
    # 3 / 4 / 1 / 1 of 9, each fraction truncated to 1/256
    assert [int(x) for x in s[0]] == [(90 * FX * w) >> 8 for w in (85, 113, 28, 28)]
    s, bal = v._cv_savings_turn(s, bal, L((90 + 2000) * FX), yes)
    assert int(s[0, 2]) == 150 * FX
    # no Great Person class left: GREAT_PEOPLE folds into the SLUSH_FUND
    gp = int(s[0, 3])
    slush = int(s[0, 0])
    s, bal = v._cv_savings_turn(s, bal, bal, ~yes)
    assert int(s[0, 3]) == 0 and int(s[0, 0]) == slush + gp
    s = torch.tensor([[30 * FX, 25 * FX, 0, 0]])
    s, bal, buy = v._cv_try_purchase(s, L(55 * FX), L(40), L(0), yes)
    assert bool(buy[0]) and int(s[0, 1]) == 0 and int(s[0, 0]) == 15 * FX and int(bal[0]) == 15 * FX
    s = torch.tensor([[10 * FX, 5 * FX, 20 * FX, 0]])
    _s, _b, buy = v._cv_try_purchase(s, L(60 * FX), L(40), L(0), yes)
    assert not bool(buy[0])
    s, bal, buy = v._cv_try_purchase(s, L(60 * FX), L(40), L(2), yes)
    assert bool(buy[0]) and [int(x) for x in s[0]] == [0, 0, 0, 0] and int(bal[0]) == 20 * FX
    print("  savings and purchases OK")


class City:
    """a city-state's centre as city-build-values.test.ts's facts: weights 0,
    Production -50%, every building's research held, a turn to build each"""

    def __init__(self, v, **over):
        self.v = v
        self.o = dict(units=1, war=False)
        self.o.update(over)
        nu = len(v._cv_tables()["unit_rows"])
        idx = v._cv_tables()["unit_index"]
        known = torch.zeros(1, nu, dtype=torch.long)
        known[0, idx["UNIT_WARRIOR"]] = 2
        one = torch.ones(1, nu, dtype=torch.bool)
        self.val, self.entry = v._cv_unit_production(one, ~one, torch.zeros(1, nu, dtype=torch.long), known)
        self.idx = idx

    def like(self):
        return L(0)

    def yield_w(self, y):
        return 0

    def pseudo_w(self, p):
        return 0

    def yield_pct(self, y):
        return -50 if y == "YIELD_PRODUCTION" else 0

    def version(self, b):
        return b

    unit_version = version

    def has_building(self, b):
        return 0

    def has_district(self, d):
        return 1

    def capital(self):
        return True

    def government_tier(self):
        return 0

    def worship_is(self, b):
        return 0

    def riverside(self):
        return False

    def ground_refuses(self, b):
        return False

    def producing(self):
        return 0

    def current_is(self, item):
        return 0

    def tech_turns(self, t):
        return 0

    civic_turns = tech_turns

    def build_turns(self, item):
        return 1

    def era(self):
        return 0

    def district_count(self):
        return 1

    def has_wonder(self):
        return 0

    def population(self):
        return 1

    def at_war(self):
        return int(self.o["war"])

    def amenity(self):
        return 0, {"YIELD_FOOD": 3, "YIELD_GOLD": 4, "YIELD_SCIENCE": 2.5}

    def regional_amenities(self, r):
        return []

    def full_civ(self):
        return False

    def tribe(self):
        return False

    def unit_count(self):
        return self.o["units"]

    def unit_production(self, u):
        k = self.idx[u]
        return self.val[:, k], ~self.entry[:, k] & False

    def trade_route_capacity(self):
        return 0

    def combat_count(self):
        return 0

    def trains_domain(self, d):
        return 1

    def extra_copies(self, u):
        return 0

    def promotion_weight(self, c):
        return FX

    def resource_access(self, r):
        return 1

    def handicap(self):
        return 0

    def value_horizon(self):
        return 50

    def housing_value(self, housing, t, h):
        g = growth(2 * FX, 5, 1, 0, FX)
        return self.v._cv_housing_value(g, self.v._cv_forecast(g), housing, t, h)

    def modifiers_value(self, b, t, h):
        return 0


def test_units_and_buildings(v: Values) -> None:
    """the unit production table, `unitValue` and `buildingValue`
    (city-build-values.test.ts; runs/h1_duelv1124 Cardiff t2, Granada t3)"""
    c = City(v)
    idx = v._cv_tables()["unit_index"]
    assert int(c.val[0, idx["UNIT_WARRIOR"]]) == 256 and int(c.val[0, idx["UNIT_SLINGER"]]) == 199
    u = lambda n, t: int(v._cv_unit(c, n, L(t), L(50))[0][0])
    assert at(v._cv_unit(c, "UNIT_WARRIOR", L(13), L(50))[0]) == 10.73
    assert (u("UNIT_WARRIOR", 13), u("UNIT_SLINGER", 13), u("UNIT_SCOUT", 4), u("UNIT_BUILDER", 4)) == (2748, 2135, 4450, 41)
    b = lambda n, t, cc=c: int(v._cv_building(cc, n, L(t), L(50))[0])
    assert at(v._cv_building(c, "BUILDING_WALLS", L(32), L(50))) == 19.74
    assert (b("BUILDING_WALLS", 32), b("BUILDING_LIBRARY", 5), b("BUILDING_GRANARY", 7), b("BUILDING_SHRINE", 42),
            b("BUILDING_ARENA", 9)) == (5053, 8463, 3888, 623, 5253)
    six = City(v, units=6)
    assert b("BUILDING_SHRINE", 42, six) == -2559121
    war = City(v, units=6, war=True)
    assert b("BUILDING_SHRINE", 42, war) == 623
    print("  units and buildings OK")


class Pick:
    def __init__(self, **over):
        self.o = dict(favored=lambda b: 0, defense=False, can_train=lambda u: u != "UNIT_SCOUT", can_construct=lambda b: True)
        self.o.update(over)

    def defense(self):
        return int(self.o["defense"])

    def building_held(self, b):
        return 0

    def can_construct(self, b):
        return int(self.o["can_construct"](b))

    def can_train(self, u):
        return int(self.o["can_train"](u))

    def can_produce(self, p):
        return 1

    def favored(self, b):
        return self.o["favored"](b)


def test_pick(v: Values) -> None:
    """`defaultSpecialization` (city-build-values.test.ts)"""
    T = v._cv_tables()
    nmin = -9999 * FX
    bt = [L(nmin) for _ in T["bld_rows"]]
    ut = [L(nmin) for _ in T["unit_rows"]]
    pt = [L(nmin) for _ in T["proj_rows"]]
    bi = {b["type"]: k for k, b in enumerate(T["bld_rows"])}
    pi = {b["type"]: k for k, b in enumerate(T["proj_rows"])}
    ui = T["unit_index"]
    bt[bi["BUILDING_MONUMENT"]] = L(30 * FX)
    bt[bi["BUILDING_WALLS"]] = L(20 * FX)
    ut[ui["UNIT_WARRIOR"]] = L(25 * FX)
    ut[ui["UNIT_SCOUT"]] = L(40 * FX)
    pt[pi["PROJECT_ENHANCE_DISTRICT_CAMPUS"]] = L(12 * FX)

    def pick(**o):
        kind, row, val = v._cv_pick(bt, ut, pt, Pick(**o))
        return int(kind[0]), int(row[0]), int(val[0])

    assert pick() == (0, bi["BUILDING_MONUMENT"], 30 * FX)
    assert pick(favored=lambda b: -1 if b == "BUILDING_MONUMENT" else 0) == (1, ui["UNIT_WARRIOR"], 25 * FX)
    assert pick(defense=True) == (1, ui["UNIT_WARRIOR"], 25 * FX)
    assert pick(can_train=lambda u: False, can_construct=lambda b: False) == (2, pi["PROJECT_ENHANCE_DISTRICT_CAMPUS"], 12 * FX)
    print("  the pick OK")


STRENGTH = {"WARRIOR": 20, "SLINGER": 15, "ARCHER": 25, "SWORDSMAN": 35, "KNIGHT": 50}


def desire(v: Values, recs, players=None, war_footing=False, standing=0, queued=()):
    """combat-desire.test.ts's minor 100 with its two Warriors"""
    rows = [(100, "WARRIOR"), (100, "WARRIOR")] + list(recs)
    owner = torch.tensor([[o for o, _ in rows]])
    strength = torch.tensor([[STRENGTH[t] for _, t in rows]])
    best = L(20)
    q = sum(STRENGTH[t] for t in queued if STRENGTH[t] + 20 > 20)
    players = players or [(0, False, False, False), (100, False, False, False), (63, True, True, False)]
    out = v._cv_combat_desire(owner, strength, torch.ones_like(owner, dtype=torch.bool), best, L(1),
                              [(s, int(w), t, int(fl)) for s, w, t, fl in players], 100, L(q), int(war_footing), 0, standing)
    return tuple(int(x[0]) for x in out)


def test_desire(v: Values) -> None:
    """`combatDesire` (combat-desire.test.ts)"""
    assert desire(v, [(63, "SWORDSMAN"), (63, "SLINGER")]) == (40, 50, 0, 128)
    assert desire(v, [(63, "SLINGER")]) == (40, 15, 0, 0)
    flagged = [(0, False, False, True), (100, False, False, False), (63, True, True, False)]
    recs = [(0, "KNIGHT"), (0, "KNIGHT"), (0, "KNIGHT"), (0, "SWORDSMAN")]
    assert desire(v, recs, flagged) == (40, 0, 185, 512)
    assert desire(v, [(0, "ARCHER")]) == (40, 0, 25, 0)
    war = [(0, True, False, False), (100, False, False, False), (63, True, True, False)]
    assert desire(v, recs, war, war_footing=True, standing=100) == (40, 185, 0, 1956)
    assert desire(v, recs, war, queued=("ARCHER", "SLINGER")) == (80, 185, 0, 512)
    print("  combat desire OK")


def test_known(v: Values) -> None:
    """`minorKnownUnits` over the knowledge base's planes: two Warriors, a
    Slinger, a freed record (combat-desire.test.ts)"""
    T = v._cv_tables()
    rows = T["engine_row"].tolist()
    ui = T["unit_index"]
    eng = {name: rows.index(ui[name]) for name in ("UNIT_WARRIOR", "UNIT_SLINGER")}
    v.citystate_kb_slot = torch.tensor([[[3, 4, 9, -2]]])
    v.citystate_kb_type = torch.tensor([[[eng["UNIT_WARRIOR"], eng["UNIT_WARRIOR"], eng["UNIT_SLINGER"], -1]]])
    k = v._cv_known(0)
    assert int(k[0, ui["UNIT_WARRIOR"]]) == 2 and int(k[0, ui["UNIT_SLINGER"]]) == 1 and int(k.sum()) == 3
    print("  the known units OK")


# the owner city's plots, view and pins of tests/cpu/minors/modifier-value.test.ts
MOD_PLOTS = [
    dict(terrain="TERRAIN_COAST", feature=None, resource="RESOURCE_FISH", resourceVisible=True, improvement=False, impassable=False),
    dict(terrain="TERRAIN_COAST", feature="FEATURE_REEF", resource=None, resourceVisible=False, improvement=False, impassable=False),
    dict(terrain="TERRAIN_COAST", feature=None, resource=None, resourceVisible=False, improvement=True, impassable=False),
    dict(terrain="TERRAIN_GRASS", feature="FEATURE_JUNGLE", resource="RESOURCE_WHEAT", resourceVisible=True, improvement=True, impassable=False),
    dict(terrain="TERRAIN_PLAINS", feature="FEATURE_MARSH", resource="RESOURCE_RICE", resourceVisible=True, improvement=False, impassable=False),
    dict(terrain="TERRAIN_GRASS_MOUNTAIN", feature=None, resource=None, resourceVisible=False, improvement=False, impassable=True),
]
MOD_PINS = {
    "BUILDING_MONUMENT": [5120, 4096, 1792],
    "BUILDING_PALACE": [768, 768, 768],
    "BUILDING_BARRACKS": [4608, 3840, 1792],
    "BUILDING_WATER_MILL": [5120, 4096, 1536],
    "BUILDING_LIGHTHOUSE": [83712, 69888, 37120],
    "BUILDING_MARKET": [71424, 59904, 33024],
    "BUILDING_STABLE": [4608, 3840, 1792],
    "BUILDING_CASTLE": [0, 0, 0],
    "BUILDING_ARMORY": [4608, 3840, 1792],
    "BUILDING_SHIPYARD": [9728, 7936, 3328],
    "BUILDING_STAR_FORT": [0, 0, 0],
    "BUILDING_MILITARY_ACADEMY": [4608, 3840, 1792],
    "BUILDING_ZOO": [5120, 4096, 1536],
    "BUILDING_HANGAR": [4608, 3840, 1792],
    "BUILDING_SEAPORT": [12288, 9984, 4096],
    "BUILDING_AIRPORT": [9472, 7680, 3584],
    "BUILDING_STADIUM": [0, 0, 0],
    "BUILDING_MOSQUE": [0, 0, 0],
    "BUILDING_PAGODA": [5376, 4352, 2048],
    "BUILDING_FERRIS_WHEEL": [0, 0, 0],
    "BUILDING_AQUARIUM": [5120, 4096, 1536],
    "BUILDING_AQUATICS_CENTER": [0, 0, 0],
    "BUILDING_GOV_TALL": [0, 0, 0],
    "BUILDING_GOV_WIDE": [0, 0, 0],
    "BUILDING_GOV_CONQUEST": [0, 0, 0],
    "BUILDING_GOV_CITYSTATES": [16128, 13056, 5888],
    # its spy (EFFECT_GRANT_SPY, 402 / 330 / 152) and its 40
    "BUILDING_GOV_SPIES": [113152, 94720, 49152],
    "BUILDING_GOV_FAITH": [0, 0, 0],
    "BUILDING_GOV_MILITARY": [0, 0, 0],
    "BUILDING_GOV_SCIENCE": [0, 0, 0],
    "BUILDING_SHOPPING_MALL": [0, 0, 0],
    "BUILDING_HYDROELECTRIC_DAM": [0, 0, 0],
    "BUILDING_CONSULATE": [5120, 4096, 1792],
    "BUILDING_CHANCERY": [7680, 6144, 2816],
    "PROJECT_LAUNCH_EARTH_SATELLITE": [0, 0, 0],
    "PROJECT_LAUNCH_MOON_LANDING": [0, 0, 0],
    "PROJECT_BUILD_NUCLEAR_DEVICE": [0, 0, 0],
    "PROJECT_BUILD_THERMONUCLEAR_DEVICE": [0, 0, 0],
    "PROJECT_BREAD_AND_CIRCUSES": [0, 0, 0],
    "PROJECT_WATER_BREAD_AND_CIRCUSES": [0, 0, 0],
    "PROJECT_CARBON_RECAPTURE": [0, 0, 0],
    "PROJECT_LAUNCH_EXOPLANET_EXPEDITION": [0, 0, 0],
    "PROJECT_ORBITAL_LASER": [0, 0, 0],
    "PROJECT_TERRESTRIAL_LASER": [0, 0, 0],
    "PROJECT_SEND_AID": [0, 0, 0],
    "PROJECT_RECOMMISSION_REACTOR": [0, 0, 0],
}


class Mods:
    """the owner city's analysis (modifier-value.test.ts's view)"""

    def like(self):
        return L(0)

    def yield_w(self, y):
        return 0

    def pseudo_w(self, p):
        return 128 if p == "PSEUDOYIELD_DIPLOMATIC_FAVOR" else 0

    def player_cities(self):
        return 1

    def city_districts(self):
        return [("DISTRICT_CITY_CENTER", 1), ("DISTRICT_HARBOR", 1)]

    def plot_valid(self):
        return torch.ones(1, len(MOD_PLOTS), dtype=torch.bool)

    def plot_is(self, kind, name):
        if kind in ("resourceVisible", "improvement", "impassable"):
            vals = [bool(p[kind]) for p in MOD_PLOTS]
        else:
            vals = [p[kind] is not None and p[kind] == name for p in MOD_PLOTS]
        return torch.tensor([vals])

    def city_yield(self, y):
        return 7.5 if y == "YIELD_PRODUCTION" else 3

    def city_strikes(self):
        return 1

    def city_has_building(self, b):
        return int(b == "BUILDING_MONUMENT")

    def traders(self):
        return 0

    def trade_capacity(self):
        return 1

    def trade_knowledge(self):
        return 4 * FX + 64

    def unit_cost(self, u):
        return 40


def test_modifiers(v: Values) -> None:
    """`modifiersValue` (0x7a4b20) over every building the tables value and
    every project that carries modifiers, landing in 0, 5 and 20 turns"""
    T = v._cv_tables()
    rows = {r["type"]: r for r in T["bld_rows"] + T["proj_rows"]}
    m = Mods()
    for name, want in MOD_PINS.items():
        got = [int(v._cv_modifiers(m, rows[name]["modifiers"], L(t), L(50))[0]) for t in (0, 5, 20)]
        assert got == want, (name, got, want)
    print(f"  modifiers OK ({len(MOD_PINS)} rows)")


# per minor the valued rows' (count, sum) of the buildings, units and projects
# tables and the pick (kind, row, value) — tests/cpu/minors/minor-tables.test.ts
MINOR_TABLES = {
    100: ([(9, 62956), (32, 10710), (1, 0)], ("BUILDING_WALLS", 23332)),
    101: ([(15, 94682), (34, 5880), (1, 0)], ("BUILDING_WALLS", 23981)),
    102: ([(17, 111536), (35, 1269), (1, 0)], ("BUILDING_WALLS", 25389)),
}
MINOR_TABLES_HELD = {
    100: ([(11, 52891), (34, 6046), (1, 0)], ("BUILDING_WALLS", 15277)),
    101: ([(18, 100114), (35, -161), (1, 0)], ("BUILDING_WALLS", 16493)),
    102: ([(18, 94321), (35, -161), (1, 0)], ("BUILDING_WALLS", 16493)),
}


def test_minor_tables(rules) -> None:
    """THE MINORS' TABLES OFF THE SIM: seed9001's opening state, then each
    minor at population 3, a Monument held and a Warrior in hand (7 in, 2 in
    the overflow store)"""
    from core.simbase import FIXTURES
    from warmup import opened

    sim = opened(rules, FIXTURES / "seed9001.json", 0)
    T = sim._cv_tables()
    E = T["engine"]
    fx_min = -9999 * FX

    def check(want: dict) -> None:
        for seat, (sums, pick) in want.items():
            s = seat - 100
            tabs = sim._cv_minor_tables(s)
            got = []
            for tab in tabs:
                vals = [int(x[0]) for x in tab if int(x[0]) != fx_min]
                got.append((len(vals), sum(vals)))
            assert got == sums, (seat, got, sums)
            kind, row, value = sim._cv_minor_pick(s)
            assert int(kind[0]) == 0, (seat, int(kind[0]))
            assert (T["bld_rows"][int(row[0])]["type"], int(value[0])) == pick, (seat, int(row[0]), int(value[0]), pick)

    check(MINOR_TABLES)
    mon = E["building"][[r["type"] for r in T["bld_rows"]].index("BUILDING_MONUMENT")]
    war = E["unit"][T["unit_index"]["UNIT_WARRIOR"]]
    for seat in MINOR_TABLES_HELD:
        s = seat - 100
        row = sim._CITY_MINOR0 + s
        sim.city_pop[:, row, 0] = 3
        sim.city_bldg[:, row, 0, mon] = True
        sim.citystate_item[:, s] = war
        sim.citystate_prod[:, s] = 7
        sim.citystate_ovf[:, s] = 2
    sim._eff_version += 1
    sim._bldg_version += 1
    sim._gen_ver += 1
    check(MINOR_TABLES_HELD)
    print("  the minors' tables off the sim OK")


def main() -> None:
    rules = load_rules()
    v = Values(rules)
    print("city_value_test:")
    test_housing(v)
    test_improvements(v)
    test_districts(v)
    test_projects(v)
    test_economic(v)
    test_units_and_buildings(v)
    test_pick(v)
    test_desire(v)
    test_known(v)
    test_modifiers(v)
    test_minor_tables(rules)
    print("CITY VALUE OK")


if __name__ == "__main__":
    main()
