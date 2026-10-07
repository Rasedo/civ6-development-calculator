"""The SHARED FLOOR of the batched engine.

Everything the region mixins stand on lives here: `Rules` and its loaders,
the fixture loader and its staleness checks, the `_MUTABLE` plane registry
(the tensors snapshot/reset round-trip), the seat constants and seat-class
tables, and the hex / tile-order / rounding helpers. The `BatchSim` class
itself is assembled from the `sim_*.py` mixins in `engine.py`.

State lives in [B, C, ...] torch tensors (B games × C city slots stepping in
lockstep; a slot is dead until its city is founded). Cities within one game
interact only through the tile-owner map, and border growth resolves in
founding order — so everything is batched across B and C except the border
loop, which walks the C slots sequentially (C is tiny).

Every formula mirrors cpu/core/*.ts. float64 on CPU for parity with that
engine, float32 on CUDA for throughput.
"""

from __future__ import annotations

import itertools
import json
import math
import os
from dataclasses import dataclass
from pathlib import Path

import torch

# CIV6_WORLDS_DIR points the whole python side — fixture loads, serve_gate
# and the TS children it spawns, the probes — at another fixture family
# (e.g. seeder/worlds/presets/<name>). Unset = the baseline gate set.
FIXTURES = Path(os.environ.get("CIV6_WORLDS_DIR")
                or Path(__file__).resolve().parent.parent.parent / "seeder" / "worlds").resolve()

# ---------------------------------------------------------------------------
# Hex math (mirrors world/hex.ts: pointy-top, odd-r offset). A map with
# `wrap_x` wraps in x: columns are read modulo the width, distances go the
# shorter way round, rows never wrap.
# ---------------------------------------------------------------------------


def _cube(dq, dr):
    return (abs(dq) + abs(dr) + abs(dq + dr)) // 2


def _axial(c, r):
    return c - ((r - (r & 1)) >> 1), r


def hex_shift(width: int, wrap_x: bool, ac: int, ar: int, bc: int, br: int) -> int:
    """`axialDelta`'s column shift for the step from (ac, ar) to (bc, br): 0,
    -width or +width, the first of the shortest; 0 on a map that does not
    wrap."""
    if not wrap_x:
        return 0
    (qa, _), (qb, _) = _axial(ac, ar), _axial(bc, br)
    dr = br - ar
    best, shift = _cube(qb - qa, dr), 0
    for s in (-width, width):
        n = _cube(qb + s - qa, dr)
        if n < best:
            best, shift = n, s
    return shift


def hex_distance_from(width: int, height: int, wrap_x: bool, center: int) -> torch.Tensor:
    """Distance of every tile index from `center` (odd-r offset coords), the
    shorter way round on a wrapping map."""
    idx = torch.arange(width * height)
    col, row = idx % width, idx // width

    def to_axial(c, r):
        q = c - torch.div(r - (r % 2), 2, rounding_mode="floor")
        return q, r

    q, r = to_axial(col, row)
    cq, cr = to_axial(torch.tensor(center % width), torch.tensor(center // width))
    dq, dr = q - cq, r - cr
    d = (dq.abs() + dr.abs() + (dq + dr).abs()) // 2
    if wrap_x:
        for s in (-width, width):
            e = dq + s
            d = torch.minimum(d, (e.abs() + dr.abs() + (e + dr).abs()) // 2)
    return d


def axial_delta(a: torch.Tensor, b: torch.Tensor, width: int, wrap_x: bool) -> tuple[torch.Tensor, torch.Tensor]:
    """`axialDelta` elementwise over tile indices: the axial step (dq, dr)
    from `a` to `b`, the shorter way round on a wrapping map (the first of
    shifts 0, -width, +width)."""
    ra = torch.div(a, width, rounding_mode="floor")
    rb = torch.div(b, width, rounding_mode="floor")
    qa = a % width - torch.div(ra - (ra & 1), 2, rounding_mode="floor")
    qb = b % width - torch.div(rb - (rb & 1), 2, rounding_mode="floor")
    dq, dr = qb - qa, rb - ra
    if wrap_x:
        best = (dq.abs() + dr.abs() + (dq + dr).abs()) // 2
        base = dq
        for s in (-width, width):
            e = base + s
            n = (e.abs() + dr.abs() + (e + dr).abs()) // 2
            better = n < best
            dq = torch.where(better, e, dq)
            best = torch.where(better, n, best)
    return dq, dr


def ring_walk_places(ctr: torch.Tensor, k: torch.Tensor, width: int, height: int, wrap_x: bool) -> torch.Tensor:
    """[B, T] each plot's place on the `hexRingWalk` of its ring `k` [B, T]
    round the centre `ctr` [B]: from the ring's W corner along its NE, E, SE,
    SW, W and NW legs, the plot's leg and its step along it. On a wrapping
    map a plot sits on its ring at every column shift that keeps it at
    distance k, and the walk meets it first at the least such place."""
    T = width * height
    ar = torch.arange(T, device=ctr.device)
    row_t = ar // width
    q_t = ar % width - (row_t - (row_t & 1)) // 2
    dq0 = q_t.unsqueeze(0) - q_t[ctr].unsqueeze(1)
    dr = row_t.unsqueeze(0) - row_t[ctr].unsqueeze(1)
    pos = torch.full_like(k, 6 * T)
    n_shift = (3 * (height + width)) // (2 * width) + 2 if wrap_x else 0
    for sh in range(-n_shift, n_shift + 1):
        dq = dq0 + sh * width
        s = dq + dr
        on = (dq.abs() + dr.abs() + s.abs()) // 2 == k
        at = torch.where(
            (s == -k) & (dr > -k), -dr,                                   # NE leg
            torch.where((dr == -k) & (dq < k), k + dq,                    # E leg
            torch.where((dq == k) & (dr < 0), 3 * k + dr,                 # SE leg
            torch.where((s == k) & (dr < k), 3 * k + dr,                  # SW leg
            torch.where((dr == k) & (dq > -k), 4 * k - dq,                # W leg
                        6 * k - dr)))))                                   # NW leg
        pos = torch.where(on, torch.minimum(pos, at), pos)
    return pos


def los_tables(width: int, height: int, wrap_x: bool, rmax: int) -> tuple[torch.Tensor, torch.Tensor]:
    """`hexLineBetween` for every pair within `rmax`, once per map. Returns
    (targets [T, N], mids [T, N, rmax - 1]): for each tile, the tiles at
    distance 1..rmax (-1 padded) and, per target, the tiles strictly BETWEEN
    on the hex line — a cube lerp with the (1e-6, 2e-6, -3e-6) nudge and
    cube rounding, each coordinate rounded with floor(x + 0.5) exactly as
    the TS helper does, an off-map hex on the line absent (-1). On a
    wrapping map a target is each plot once and the line runs the shorter
    way round (`hex_shift`)."""
    import math

    def offset(q, r):
        return q + ((r - (r & 1)) >> 1), r

    def dist(c1, r1, c2, r2):
        q1, s1 = _axial(c1, r1)
        q2, s2 = _axial(c2, r2)
        return _cube(q1 - q2, s1 - s2)

    n_t = 1 + 3 * rmax * (rmax + 1) - 1
    T = width * height
    n_m = max(rmax - 1, 1)
    # filled as python lists and handed to torch once: an element write into
    # a tensor costs microseconds, and there are a few hundred thousand here
    tgt = [[-1] * n_t for _ in range(T)]
    mid = [[[-1] * n_m for _ in range(n_t)] for _ in range(T)]
    for a in range(T):
        ac, ar = a % width, a // width
        aq, arr = _axial(ac, ar)
        k = 0
        seen: set[int] = set()
        for br in range(max(0, ar - rmax), min(height, ar + rmax + 1)):
            cols = (range(ac - rmax - 1, ac + rmax + 2) if wrap_x
                    else range(max(0, ac - rmax - 1), min(width, ac + rmax + 2)))
            for bc in cols:
                if wrap_x:
                    bc %= width
                    b = br * width + bc
                    if b in seen:
                        continue
                    seen.add(b)
                    bc += hex_shift(width, True, ac, ar, bc, br)
                n = dist(ac, ar, bc, br)
                if n < 1 or n > rmax:
                    continue
                b = br * width + bc % width
                tgt[a][k] = b
                mid_ak = mid[a][k]
                bq, brr = _axial(bc, br)
                ax, az, ay = aq + 1e-6, arr + 2e-6, -aq - arr - 3e-6
                bx, bz, by = bq + 1e-6, brr + 2e-6, -bq - brr - 3e-6
                for i in range(1, n):
                    t = i / n
                    x, y, z = ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t
                    rx, ry, rz = math.floor(x + 0.5), math.floor(y + 0.5), math.floor(z + 0.5)
                    dx, dy, dz = abs(rx - x), abs(ry - y), abs(rz - z)
                    if dx > dy and dx > dz:
                        rx = -ry - rz
                    elif dy > dz:
                        ry = -rx - rz
                    else:
                        rz = -rx - ry
                    mc, mr = offset(rx, rz)
                    if 0 <= mr < height and (wrap_x or 0 <= mc < width):
                        mid_ak[i - 1] = mr * width + mc % width
                k += 1
    return (torch.tensor(tgt, dtype=torch.long).reshape(T, n_t),
            torch.tensor(mid, dtype=torch.long).reshape(T, n_t, n_m))


def neighbor_table(width: int, height: int, wrap_x: bool) -> torch.Tensor:
    """[T, 6] the neighbour in each direction (E NE NW W SW SE), -1 off the
    map; a column off either side wraps on a map with `wrap_x`."""
    even = [(1, 0), (0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1)]
    odd = [(1, 0), (1, -1), (0, -1), (-1, 0), (0, 1), (1, 1)]
    out = torch.full((width * height, 6), -1, dtype=torch.long)
    for i in range(width * height):
        c, r = i % width, i // width
        offs = odd if r % 2 else even
        for d, (dc, dr) in enumerate(offs):
            nc, nr = c + dc, r + dr
            if wrap_x:
                nc %= width
            if 0 <= nc < width and 0 <= nr < height:
                out[i, d] = nr * width + nc
    return out




# The <EmergencyScoreSources> kinds, in the exporter's SCORE_SOURCES order —
# this is the WIRE, so the positions are fixed.
SCORE_CO2 = 0
SCORE_GPP = 1
SCORE_PROJECT = 2
SCORE_BUILDING = 3
SCORE_DISTRICT = 4
SCORE_GOLD = 5
SCORE_AT_WAR = 6
SCORE_CO2_TOP = 7


@dataclass
class Rules:
    focus_base: torch.Tensor
    citizen_science: float
    citizen_culture: float
    unassigned_citizen_gold: float
    food_per_citizen: float
    housing_left_growth: tuple  # (half, quarter, zero): growth falls to half / a quarter at, halts below
    housing_fresh: float
    housing_coastal: float
    housing_none: float
    housing_aq_fresh_bonus: float  # Aqueduct: +this to a fresh-water city
    housing_aq_no_fresh: float  # Aqueduct: raise a non-fresh city's water housing to this
    amenity_tiers: list  # [(min, growth, yield)]
    amenity_pop_per: int  # CITY_POP_PER_AMENITY — the need is ceil(pop / this)
    city_growth: tuple  # (CITY_GROWTH_THRESHOLD, _MULTIPLIER, _EXPONENT) — `_growth_needed`
    culture_cost: tuple  # (CULTURE_COST_FIRST_PLOT, _LATER_PLOT_MULTIPLIER, _LATER_PLOT_EXPONENT) — `_border_cost`
    wonder_free_tiles: int  # WONDER_FREE_TILES_UPON_COMPLETION — `_wonder_free_tiles`
    plot_influence: dict  # borderPlotCost's PLOT_INFLUENCE_* terms — `_seat_border_key`
    progress: dict  # {techCount, civicCount, speedPct} — `_progress_pct` / `_progress_cost`
    lump: dict  # {escalation, improvedDegradation, pillagedDegradation, chopRows} — `_lump_value`
    plot_price: tuple  # (base, ring step, climb, divisor) — `_plot_price`
    # the install's `CivilizationLevels` table, one dict per class of player in
    # the exporter's order (TRIBE, CITY_STATE, FULL_CIV, FREE_CITIES). Ten
    # PERMISSIONS, not behaviours: a rule that forks on a class asks this row.
    civ_levels: list
    center_min_food: float
    pillage_building_repair_pct: float
    center_min_production: float
    settler_base: float
    settler_per_city: float
    settler_pop_gate: int
    builder_base: float  # the Builder's scaled Cost
    builder_per: float  # its scaled CostProgressionParam1, per builder trained
    game_speed: float  # GAMESPEED_ONLINE CostMultiplier / 100 (`scale_by_game_speed`)
    gold_purchase_mult: float  # gold price = production cost × this (GOLD_PURCHASE_MULT)
    faith_purchase_mult: float  # faith price = production cost × this (FAITH_PURCHASE_MULT)
    purchase_divisor: int  # every gold / faith price is floored to a multiple of this (PURCHASE_DIVISOR 5, measured)
    upgrade_cost: tuple  # (base at speed, floor, floor at speed, levy floor, levy floor at speed, net %, gold per point) — `upgradeGoldCost`
    civic_unlock: tuple  # (CivicUnlockMaxCost, CivicUnlockPerTurnDrop, CivicUnlockMinCost) — `policyUnlockCost`
    cost_escalation: int  # GAME_COST_ESCALATION 1000, the policy unlock's escalation end point — `policyEscalated`
    anarchy_turns: int  # the turns a return to a held government leaves the seat in none (ANARCHY_TURNS)
    turn_limit: int  # game over once turn > this
    space_ly_target: int  # the Exoplanet craft's distance (light-years, speed-scaled)
    district_cost: dict  # districtCost params {base, scale} — each seat pays it from ITS OWN research
    goody_huts: dict  # TRIBAL VILLAGES: the install's kind + subtype tables
    score_pop_weight: float
    score_yield_weights: torch.Tensor  # [6]
    scoring: list  # Civ 6's Score: [{count, value}] per ScoringLineItems row, in tie order
    boosts: list  # [{target, idx, kind, ...}] — eureka/inspiration conditions
    combat: dict  # barbarian constants + the JS-computed damage-base table
    disasters: dict  # the Flood (Civ6) severity tables + the weights of the turn's one event draw
    climate: dict  # the Climate (Civ6) arc: carbon rates, the seven phases, the deforestation bands
    units: list  # trainable roster [{id, cost, combat, maintenance, civilian, requiresTech}]
    uniques: dict  # {civs, openTerrains, coastTerrain} — the unique-unit wire (cpu/export/rules.ts)
    citystate: dict  # city-state constants (envoy cost, influence rate, quest pacing, type→yield)
    seats: dict  # seat pacing, loyalty, GP costs, belief-pool sizes (cpu/data/seats.ts)
    beliefs: dict  # dense pantheon/follower/founder effect tables (data-file key order = claim-draw order)
    projects: dict  # {rows: [{d, y, yp, fp, g, ...}], gppFraction} in data order
    wonders: dict  # {rows: [{cost, ut, uc, cy, growAll, petra, mult, adjD, adjR}], fpFeat} in data order
    improvements: dict  # FARM food/housing, builder roster idx, hillFarms civic
    districts: list  # catalog [{id, idx, cost, adjYield, adjacency, housing, ...}]
    governments: list  # [{id, tier, unlockCivic, slots:[m,e,d,w], cityYields[6], capitalYields[6]}] table order
    policies: list  # [{id, kind, unlockCivic, cityYields[6], capitalYields[6]}] table order
    governors: list  # [{id, establish, cityStates, base}] catalog order (= the GPU governor index)
    governor_promotions: list  # [{id, gov, tier, requires, <every effect channel>}] catalog order
    district_scaffold: dict  # {campusIdx, place}
    mp_scale: int  # MP_SCALE: the movement point is counted in QUARTERS (the route ladder's own unit)
    road_tier_mp: list  # what a route step costs per road tier, in mp_scale units
    road_tier_bridges: list  # whether each tier bridges rivers
    road_tier_era: list  # the world-era index each tier arrives at
    wonder_coastal_mask: int  # the `wok` bits a COASTAL-WATER placement owns
    railroad_mp: int  # CIV6 (Railroad): "Movement Cost 0.25"
    railroad_tech: int  # the techs-table index of Steam Power, -1 if absent
    railroad_cost: list  # [(stockpile slot, units)] one tile spends
    embark_transition_mp: int  # the embark/disembark charge, unless a Harbor or coastal centre docks it free
    shipyard_bidx: int  # building-roster index of SHIPYARD (special: prod = Harbor adjacency), -1 if absent
    military_academy_bidx: int  # building-roster index of MILITARY_ACADEMY (trains land formations directly), -1 if absent
    seaport_bidx: int  # building-roster index of SEAPORT (trains naval formations directly), -1 if absent
    nuclear_plant_bidx: int  # NUCLEAR_POWER_PLANT row — the reactor whose age is clocked, -1 if absent
    ancient_walls_bidx: int  # building-roster index of ANCIENT_WALLS (outer HP + city strike), -1 if absent
    palace_yields: torch.Tensor  # [6]
    palace_housing: float
    palace_amenities: float
    palace_maintenance: float  # the Palace row's `Buildings.Maintenance` (buildingMaintenance)
    palace_gov_yield: bool  # does the Palace count for Autocracy's per-government-building yields
    b_cost: torch.Tensor  # [NB]
    b_buy_cost: torch.Tensor  # [NB] the purchase base, the untruncated scaled cost (`buyCost`)
    b_yields: torch.Tensor  # [NB, 6]
    b_housing: torch.Tensor
    b_coastal_housing: torch.Tensor  # [NB] housing while the centre is coastal (the Lighthouse's)
    b_amenities: torch.Tensor
    b_maintenance: torch.Tensor
    b_river: torch.Tensor  # bool
    b_farmbonus: torch.Tensor  # bool — Water Mill: farm-improved BONUS resources gain +1 food
    buildings: list  # the raw building catalog rows, in wire order (a building's INDEX is its action code)
    b_variants: list  # per building: the unique building standing in for the row — its column overrides and its own clauses
    b_maxloy_culture: torch.Tensor  # bool — Monument: +1 culture while the city sits at max loyalty
    b_loyalty: torch.Tensor  # f64 — flat loyalty per turn while the building stands
    b_unlock: torch.Tensor  # tech index or -1
    b_unlock_civic: torch.Tensor  # civic index or -1 (Temple/Amphitheater/… gate on a civic, not a tech)
    b_req_district: torch.Tensor  # required district idx (-1 = City Center / none)
    b_req_buildings: list  # per building: list of prerequisite building indices (requiresAny)
    b_excl_buildings: list  # per building: exclusive-sibling indices (exclusiveWith — Barracks/Stable)
    b_regional: torch.Tensor  # bool [NB] — regional building (leaves local sums; delivered by range)
    regional_range: int  # REGIONAL_RANGE (hex distance, source district tile -> receiver center)
    b_power: torch.Tensor  # f64 [NB] — GS Base Load: the Power this building demands while it stands
    b_pow_yields: torch.Tensor  # f64 [NB, 6] — what it pays ON TOP of b_yields while its city is powered
    b_pow_amenities: torch.Tensor  # f64 [NB] — the powered half of its amenities
    b_powerplant: torch.Tensor  # bool [NB] — supplies its region from the Industrial Zone it stands in
    b_iz_adj_prod: torch.Tensor  # bool [NB] — Coal Power Plant: adds its Industrial Zone's adjacency as production
    cardiff_harbor_power: float  # renewable Power per Harbor building for a Cardiff suzerain
    laser_power_load: float  # Power a Terrestrial Laser Station adds to its city
    biosphere_power_mult: float  # CIV6 (Biosphere): "+200% Power" for every renewable
    b_fuel_slot: torch.Tensor  # long [NB] — the stockpile slot a power plant burns, -1 = none
    b_fuel_rate: torch.Tensor  # long [NB] — Power produced per unit of that resource
    b_air_slots: torch.Tensor  # long [NB] — air-unit slots this building adds to its Aerodrome
    b_gov_tier: torch.Tensor  # long [NB] — the GOVERNMENT TIER this row demands, 0 = none
    b_gov_title: torch.Tensor  # long [NB] — governor titles it awards while it stands
    b_spy_capacity: torch.Tensor  # long [NB] — spies its owner may keep beyond the research ladder
    b_spy_pen: torch.Tensor  # long [NB] — levels it takes off an enemy spy working in its city
    b_spy_pen_enc: torch.Tensor  # long [NB] — the same, empire-wide, in any city of the seat holding an Encampment
    b_influence: torch.Tensor  # long [NB] — influence points per turn, paid to the SEAT
    b_favor: torch.Tensor  # long [NB] — diplomatic favor per turn, paid to the SEAT
    b_levy_discount: torch.Tensor  # long [NB] — percent off the SEAT's levies
    b_tourism: torch.Tensor  # long [NB] — flat Tourism on the building's own district
    b_civic_tour: torch.Tensor  # long [NB, 2] — the civic (-1 none) that opens Tourism on its own district, and the amount
    b_loy_no_gov: torch.Tensor  # f64 [NB] — loyalty per turn in every one of the seat's UNGOVERNED cities
    b_amen_gov: torch.Tensor  # f64 [NB] — amenities in every city that HOLDS a governor
    b_house_gov: torch.Tensor  # f64 [NB] — housing in every city that HOLDS a governor
    b_gov_yield: torch.Tensor  # bool [NB] — counts for Autocracy's per-government-building yields
    b_grant_new_city: torch.Tensor  # long [NB] — unit index every city this seat FOUNDS is handed, -1 none
    b_settler_prod: torch.Tensor  # f64 [NB] — percent added to SETTLER production in the building's own city
    b_conquest_pct: torch.Tensor  # f64 [NB] — percent added to every city's production inside the window
    b_conquest_turns: torch.Tensor  # long [NB] — how many turns a capture opens that window for
    b_heal_kill: torch.Tensor  # long [NB] — hit points a unit of this seat heals when it eliminates one
    b_project_charge: torch.Tensor  # f64 [NB] — percent of a District Project's cost each Builder charge pays
    b_power_supply: torch.Tensor  # f64 [NB] — renewable Power it supplies its own city, no stockpile behind it
    b_flood_barrier: torch.Tensor  # bool [NB] — the FLOOD BARRIER row, whose price is its city's lowland tiles
    b_regional_range: torch.Tensor  # long [NB] — this row's own regional reach, 0 = the shared default
    b_appeal_y: torch.Tensor  # f64 [NB, 2, 6] — what it pays an adjacent unimproved tile at Breathtaking, then Charming
    strategic: dict  # {rid, rate, slotOf, capBase, capPerEncampmentBuilding, encampmentDidx}
    resources: dict  # {harvestYield, harvestAmount, improvement} per RESOURCE_IDS — the HARVEST's own table
    nuclear: dict  # {devices[{radius,fallout,range,upkeep,uranium}], falloutDamage, robotDamage, coverRange, aaSupport, aaWound, siloDefense, subDefense, interceptDamage, cleanCharges, siloIid, wwLaunched, emergency*}
    gdr: dict  # {upgradeId[], upgradeTech[], droneAA, particleBeamCS, enhancedMoves, armorPlatingCS, navalPenalty}
    b_worship: torch.Tensor  # bool [NB] — worship building (built or faith-bought by the religion whose Worship belief names it; never gold-bought)
    b_era: torch.Tensor  # long [NB] — the era the building first unlocks (Heartbeat of Steam's gate)
    b_train_xp_pct: torch.Tensor  # long [NB] — the PERCENTAGE experience modifier this building grants a unit trained here; the Encampment and Harbor lines stack
    b_train_xp_cls: torch.Tensor  # bool [NB, NPC] — which promotion classes `b_train_xp_pct` reaches
    b_walls: torch.Tensor  # long [NB] — the WALLS TIER this row supplies (0 = not a walls row)
    b_walls_cs: torch.Tensor  # long [NB] — the row's OuterDefenseStrength (`wallsStrength`)
    b_no_purchase: torch.Tensor  # bool [NB] — refuses a gold purchase (the upgraded walls)
    b_faith_units: torch.Tensor  # bool [NB] — grants the seat the faith LAND-UNIT purchase (Grand Master's Chapel)
    b_pill_faith_imp: torch.Tensor  # long [NB] — the Chapel's flat faith per pillaged improvement
    b_pill_faith_dist: torch.Tensor  # long [NB] — ...and per pillaged district
    b_grant_unit: torch.Tensor  # long [NB] — unit granted FREE at completion (Intelligence Agency's Spy); -1 none
    b_rel_spreads: torch.Tensor  # long [NB] — spread charges a religious unit bought in its city gains (the Mosque)
    b_disaster_proof: torch.Tensor  # bool [NB] — a disaster's building roll passes it by (the Dar-e Mehr)
    b_per_era: torch.Tensor  # long [NB, 6] — yields per game era since the city's stamp (`yieldsPerEra`, the Dar-e Mehr)
    #: THE PROMOTION CATALOG, per class and in COLUMN order (the PROMOTE head's
    #: layout). `promo_req[c, k]` is the bitmask of columns that open row k of
    #: class c; `promo_kind/v/mask[c, k, s]` are its effect slots.
    promo_classes: list
    promo_kinds: list
    promo_cols: int
    promo_offer_draw: int  # `PROMO_OFFER_DRAW` — columns a promotion offer holds
    promo_req: torch.Tensor  # long [NPC, PCOL]
    promo_kind: torch.Tensor  # long [NPC, PCOL, PSLOT]
    promo_v: torch.Tensor  # long [NPC, PCOL, PSLOT]
    promo_mask: torch.Tensor  # long [NPC, PCOL, PSLOT]
    promo_flag_bits: torch.Tensor  # long [NK, NPC] — bit c set when column c carries kind k
    promo_col_val: torch.Tensor  # long [NK, NPC, PCOL] — per-column sum of kind k's values
    promo_col_max: torch.Tensor  # long [NK, NPC, PCOL] — per-column max of kind k's values
    promo_rows: torch.Tensor  # long [NPC] — how many rows each class actually holds
    u_promo_class: torch.Tensor  # long [NU] — the class each chassis promotes from, -1 = none
    promo_class_bit: torch.Tensor  # long [NPC] — the bit a class presents to a `CS_VS_*` mask, 0 = never a target
    choke_features: list  # the feature indices CHOKE POINTS defends in (hills are their own plane)
    woods_features: list  # the feature indices a 1-MP woods step waives (hills are their own plane)
    woods_feature: int  # the Woods feature itself — the Stave Church's adjacency source
    worship_bidx: list  # per Worship belief (WORSHIP_BELIEFS order): the building row it unlocks
    temple_bidx: int  # TEMPLE row (worship prerequisite), -1 if absent
    worship_faith_cost: float  # a worship building's faith price: its row's scaled Cost x the faith rate
    shrine_bidx: int  # SHRINE row (the missionary buy's gate), -1 if absent
    t_cost: torch.Tensor  # [NT]
    t_award_env: torch.Tensor  # long [NT] — envoys paid ONCE at completion
    t_award_dvp: torch.Tensor  # long [NT] — Diplomatic Victory points, same
    c_award_env: torch.Tensor  # long [NC] — the civic twins (Global Warming Mitigation)
    c_award_dvp: torch.Tensor  # long [NC]
    # ...Diplomatic Favor, Governor titles, the project-production percent the
    # seat banks (Future Civic, Future Tech), paid at EVERY completion
    t_award_favor: torch.Tensor  # long [NT]
    t_award_titles: torch.Tensor  # long [NT]
    t_award_projpct: torch.Tensor  # long [NT]
    c_award_favor: torch.Tensor  # long [NC]
    c_award_titles: torch.Tensor  # long [NC]
    c_award_projpct: torch.Tensor  # long [NC]
    t_repeat: torch.Tensor  # bool [NT] — CIV6 `Repeatable`: researchable again once complete
    c_repeat: torch.Tensor  # bool [NC]
    t_prereqs: list  # list of lists
    c_cost: torch.Tensor
    c_prereqs: list
    war_weariness: dict  # the warWeariness block: era bases, decays, perAmenity and the per-city loss caps
    trade: dict  # {marketBidx, lighthouseBidx, foreignTradeCidx, capWonderWidx, range} — trade capacity/route anchors
    eras: dict  # {length, found, conquer, wonder, pantheon, religion, gp} — era-score events + age thresholds
    actions: dict  # {unit: [name, ...]} — the unit-action enum, index = mask column

    def scale_by_game_speed(self, x):
        """A Standard-speed figure at the online speed — `× CostMultiplier /
        100`, TRUNCATED (`scaleByGameSpeed`'s twin): a cost, a progression
        step, or an amount the install types `ScaleByGameSpeed` / flags
        `Scale`. A tensor in, a tensor out; a number in, an int out."""
        if isinstance(x, torch.Tensor):
            return torch.floor(x * self.game_speed)
        return math.floor(x * self.game_speed)


def _class_mask(rows: list, n: int) -> torch.Tensor:
    """[len(rows), n] — the promotion classes each row names, as a bool mask."""
    out = torch.zeros(len(rows), max(n, 1), dtype=torch.bool)
    for i, cls in enumerate(rows):
        for c in cls:
            if 0 <= int(c) < out.shape[1]:
                out[i, int(c)] = True
    return out


def load_rules(path: Path = FIXTURES / "rules.json") -> Rules:
    r = json.loads(Path(path).read_text())
    B = r["buildings"]
    _P = r["promotions"]
    # The promotion catalog folded per (kind, class), for the hot helpers: a
    # FLAG becomes one bit-test against the columns carrying the kind, a
    # VALUE a per-column dot product — never a [rows, PCOL, PSLOT] gather per
    # call. promo_v is integral (long), so the per-column pre-sum is exact.
    _pk3 = torch.tensor(_P["kind"], dtype=torch.long)
    _pv3 = torch.tensor(_P["v"], dtype=torch.long)
    _nk = max(len(_P["kinds"]), 1)
    if _pk3.shape[2]:
        _hit = _pk3.unsqueeze(0) == torch.arange(_nk).view(-1, 1, 1, 1)
        _pv0 = torch.where(_hit, _pv3.unsqueeze(0), torch.zeros_like(_pv3).unsqueeze(0))
        _pf_bits = (_hit.any(dim=3).long() << torch.arange(_pk3.shape[1]).view(1, 1, -1)).sum(dim=2)
        _pf_colv = _pv0.sum(dim=3)
        _pf_colm = _pv0.amax(dim=3)
    else:
        _pf_bits = torch.zeros(_nk, _pk3.shape[0], dtype=torch.long)
        _pf_colv = torch.zeros(_nk, _pk3.shape[0], _pk3.shape[1], dtype=torch.long)
        _pf_colm = torch.zeros(_nk, _pk3.shape[0], _pk3.shape[1], dtype=torch.long)
    return Rules(
        focus_base=torch.tensor(r["focusBase"], dtype=torch.float64),
        citizen_science=r["citizenScience"],
        citizen_culture=r["citizenCulture"],
        unassigned_citizen_gold=r["unassignedCitizenGold"],
        food_per_citizen=r["foodPerCitizen"],
        housing_left_growth=tuple(int(x) for x in r["housingLeftGrowth"]),
        housing_fresh=r["housing"]["fresh"],
        housing_coastal=r["housing"]["coastal"],
        housing_none=r["housing"]["none"],
        housing_aq_fresh_bonus=r["housing"]["aqFreshBonus"],
        housing_aq_no_fresh=r["housing"]["aqNoFreshTotal"],
        amenity_tiers=[(t["min"], t["growth"], t["yield"]) for t in r["amenityTiers"]],
        amenity_pop_per=int(r["amenityPopPer"]),
        city_growth=tuple(float(x) for x in r["cityGrowth"]),
        culture_cost=tuple(float(x) for x in r["cultureCost"]),
        wonder_free_tiles=int(r["wonderFreeTiles"]),
        plot_influence={k: int(v) for k, v in r["plotInfluence"].items()},
        progress=r["progress"],
        lump=r["lump"],
        plot_price=tuple(int(x) for x in r["plotPrice"]),
        civ_levels=r["civLevels"],
        center_min_food=r["centerMinFood"],
        pillage_building_repair_pct=r["pillageBuildingRepairPct"],
        center_min_production=r["centerMinProduction"],
        settler_base=r["scenario"]["settlerBase"],
        settler_per_city=r["scenario"]["settlerPerCity"],
        settler_pop_gate=r["scenario"]["settlerPopGate"],
        builder_base=r["scenario"]["builderBase"],
        builder_per=r["scenario"]["builderPer"],
        game_speed=r["scenario"]["gameSpeed"],
        gold_purchase_mult=r["scenario"]["goldPurchaseMult"],
        faith_purchase_mult=r["scenario"]["faithPurchaseMult"],
        purchase_divisor=int(r["scenario"]["purchaseDivisor"]),
        upgrade_cost=tuple(int(x) for x in r["scenario"]["upgradeCost"]),
        civic_unlock=(int(r["scenario"]["civicUnlockMaxCost"]), int(r["scenario"]["civicUnlockPerTurnDrop"]),
                      int(r["scenario"]["civicUnlockMinCost"])),
        cost_escalation=int(r["scenario"]["gameCostEscalation"]),
        anarchy_turns=int(r["scenario"]["anarchyTurns"]),
        turn_limit=r["scenario"]["turnLimit"],
        space_ly_target=r["scenario"]["spaceLyTarget"],
        district_cost=r["districtCost"],
        goody_huts=r["goodyHuts"],
        score_pop_weight=r["score"]["popWeight"],
        score_yield_weights=torch.tensor(r["score"]["yieldWeights"], dtype=torch.float64),
        scoring=r["scoring"],
        boosts=r["boosts"],
        combat=r["combat"],
        disasters=r["disasters"],
        climate=r["climate"],
        units=r["units"],
        uniques=r["uniques"],
        citystate=r["cityState"],
        seats=r["seats"],  # the seat bag (cpu/data/seats.ts)
        beliefs=r["beliefs"],
        projects=r["projects"],
        wonders=r["wonders"],
        improvements=r["improvements"],
        districts=r["districts"],
        governments=r["governments"],
        policies=r["policies"],
        governors=r["governors"],
        governor_promotions=r["governorPromotions"],
        district_scaffold=r["districtScaffold"],
        mp_scale=int(r["mpScale"]),
        road_tier_mp=[int(x) for x in r["roadTierMp"]],
        road_tier_bridges=[bool(x) for x in r["roadTierBridges"]],
        road_tier_era=[int(x) for x in r["roadTierEra"]],
        wonder_coastal_mask=int(r["wonderCoastalMask"]),
        railroad_mp=int(r["railroadMp"]),
        railroad_tech=int(r["railroadTech"]),
        railroad_cost=[(int(a), int(b)) for a, b in r["railroadCost"]],
        embark_transition_mp=int(r["embarkTransitionMp"]),
        shipyard_bidx=int(r["shipyardBidx"]),
        military_academy_bidx=int(r["militaryAcademyBidx"]),
        seaport_bidx=int(r["seaportBidx"]),
        nuclear_plant_bidx=int(r["nuclearPlantBidx"]),
        ancient_walls_bidx=int(r["ancientWallsBidx"]),
        palace_yields=torch.tensor(r["palace"]["yields"], dtype=torch.float64),
        palace_housing=r["palace"]["housing"],
        palace_amenities=r["palace"]["amenities"],
        palace_maintenance=r["palace"]["maintenance"],
        palace_gov_yield=bool(r["palace"]["govYieldBuilding"]),
        b_cost=torch.tensor([b["cost"] for b in B], dtype=torch.float64),
        b_buy_cost=torch.tensor([b["buyCost"] for b in B], dtype=torch.float64),
        b_yields=torch.tensor([b["yields"] for b in B], dtype=torch.float64),
        b_housing=torch.tensor([b["housing"] for b in B], dtype=torch.float64),
        b_coastal_housing=torch.tensor([b["coastalHousing"] for b in B], dtype=torch.float64),
        b_amenities=torch.tensor([b["amenities"] for b in B], dtype=torch.float64),
        b_maintenance=torch.tensor([b["maintenance"] for b in B], dtype=torch.float64),
        b_river=torch.tensor([b["river"] for b in B], dtype=torch.bool),
        b_farmbonus=torch.tensor([b["farmBonusFood"] for b in B], dtype=torch.bool),
        buildings=list(B),
        b_variants=[list(b["variants"]) for b in B],
        b_maxloy_culture=torch.tensor([b["cultureAtMaxLoyalty"] for b in B], dtype=torch.bool),
        b_loyalty=torch.tensor([float(b["loyalty"]) for b in B], dtype=torch.float64),
        b_unlock=torch.tensor([b["unlockTech"] for b in B], dtype=torch.long),
        b_unlock_civic=torch.tensor([b["unlockCivic"] for b in B], dtype=torch.long),
        b_req_district=torch.tensor([b["reqDistrict"] for b in B], dtype=torch.long),
        b_req_buildings=[b["reqBuildings"] for b in B],
        b_excl_buildings=[b["exclBuildings"] for b in B],
        b_regional=torch.tensor([bool(b["regional"]) for b in B], dtype=torch.bool),
        regional_range=int(r["regionalRange"]),
        b_power=torch.tensor([float(b["power"]) for b in B], dtype=torch.float64),
        b_pow_yields=torch.tensor([b["poweredYields"] for b in B], dtype=torch.float64),
        b_pow_amenities=torch.tensor([float(b["poweredAmenities"]) for b in B], dtype=torch.float64),
        b_powerplant=torch.tensor([bool(b["powerPlant"]) for b in B], dtype=torch.bool),
        b_iz_adj_prod=torch.tensor([bool(b["izAdjProduction"]) for b in B], dtype=torch.bool),
        cardiff_harbor_power=float(r["cardiffHarborPower"]),
        laser_power_load=float(r["laserPowerLoad"]),
        biosphere_power_mult=float(r["biospherePowerMult"]),
        b_fuel_slot=torch.tensor([int(b["fuelSlot"]) for b in B], dtype=torch.long),
        b_fuel_rate=torch.tensor([int(b["fuelRate"]) for b in B], dtype=torch.long),
        b_air_slots=torch.tensor([int(b["airSlots"]) for b in B], dtype=torch.long),
        b_gov_tier=torch.tensor([int(b["govTier"]) for b in B], dtype=torch.long),
        b_gov_title=torch.tensor([int(b["govTitle"]) for b in B], dtype=torch.long),
        b_spy_capacity=torch.tensor([int(b["spyCapacity"]) for b in B], dtype=torch.long),
        b_spy_pen=torch.tensor([int(b["spyLevelPenalty"]) for b in B], dtype=torch.long),
        b_spy_pen_enc=torch.tensor([int(b["spyLevelPenaltyEncampment"]) for b in B], dtype=torch.long),
        b_influence=torch.tensor([int(b["influencePerTurn"]) for b in B], dtype=torch.long),
        b_favor=torch.tensor([int(b["favorPerTurn"]) for b in B], dtype=torch.long),
        b_levy_discount=torch.tensor([int(b["levyDiscountPct"]) for b in B], dtype=torch.long),
        b_tourism=torch.tensor([int(b["tourism"]) for b in B], dtype=torch.long),
        b_civic_tour=torch.tensor([[int(x) for x in b["civicTourism"]] for b in B], dtype=torch.long).reshape(-1, 2),
        b_loy_no_gov=torch.tensor([float(b["loyaltyWithoutGovernor"]) for b in B], dtype=torch.float64),
        b_amen_gov=torch.tensor([float(b["amenitiesWithGovernor"]) for b in B], dtype=torch.float64),
        b_house_gov=torch.tensor([float(b["housingWithGovernor"]) for b in B], dtype=torch.float64),
        b_gov_yield=torch.tensor([bool(b["govYieldBuilding"]) for b in B], dtype=torch.bool),
        b_grant_new_city=torch.tensor([int(b["grantUnitNewCity"]) for b in B], dtype=torch.long),
        b_settler_prod=torch.tensor([float(b["settlerProdPct"]) for b in B], dtype=torch.float64),
        b_conquest_pct=torch.tensor([float(b["conquestProdPct"]) for b in B], dtype=torch.float64),
        b_conquest_turns=torch.tensor([int(b["conquestProdTurns"]) for b in B], dtype=torch.long),
        b_heal_kill=torch.tensor([int(b["healOnKill"]) for b in B], dtype=torch.long),
        b_project_charge=torch.tensor([float(b["projectChargePct"]) for b in B], dtype=torch.float64),
        b_power_supply=torch.tensor([float(b["powerSupply"]) for b in B], dtype=torch.float64),
        b_flood_barrier=torch.tensor([bool(b["floodBarrier"]) for b in B], dtype=torch.bool),
        b_regional_range=torch.tensor([int(b["regionalRange"]) for b in B], dtype=torch.long),
        b_appeal_y=torch.tensor([b["appealYields"] or [[0.0] * 6, [0.0] * 6] for b in B], dtype=torch.float64),
        strategic=r["strategic"],
        resources=r["resources"],
        nuclear=r["nuclear"],
        gdr=r["gdr"],
        b_worship=torch.tensor([bool(b["worship"]) for b in B], dtype=torch.bool),
        b_train_xp_pct=torch.tensor([int(b["trainXpPct"]) for b in B], dtype=torch.long),
        b_train_xp_cls=_class_mask([b["trainXpClasses"] for b in B], len(_P["classes"])),
        b_walls=torch.tensor([int(b["walls"]) for b in B], dtype=torch.long),
        b_walls_cs=torch.tensor([int(b["wallsCs"]) for b in B], dtype=torch.long),
        b_no_purchase=torch.tensor([bool(b["noPurchase"]) for b in B], dtype=torch.bool),
        b_faith_units=torch.tensor([bool(b["faithBuyUnits"]) for b in B], dtype=torch.bool),
        b_pill_faith_imp=torch.tensor([int(b["pillageFaithImp"]) for b in B], dtype=torch.long),
        b_pill_faith_dist=torch.tensor([int(b["pillageFaithDist"]) for b in B], dtype=torch.long),
        b_grant_unit=torch.tensor([int(b["grantUnit"]) for b in B], dtype=torch.long),
        b_rel_spreads=torch.tensor([int(b["religiousSpreads"]) for b in B], dtype=torch.long),
        b_disaster_proof=torch.tensor([bool(b["disasterProof"]) for b in B], dtype=torch.bool),
        b_per_era=torch.tensor([[int(x) for x in b["perEra"]] for b in B], dtype=torch.long).reshape(len(B), 6),
        b_era=torch.tensor([int(b["eraIdx"]) for b in B], dtype=torch.long),
        promo_classes=list(_P["classes"]),
        promo_kinds=list(_P["kinds"]),
        promo_cols=int(_P["cols"]),
        promo_offer_draw=int(_P["offerDraw"]),
        promo_req=torch.tensor(_P["req"], dtype=torch.long),
        promo_kind=torch.tensor(_P["kind"], dtype=torch.long),
        promo_v=torch.tensor(_P["v"], dtype=torch.long),
        promo_mask=torch.tensor(_P["mask"], dtype=torch.long),
        promo_flag_bits=_pf_bits,
        promo_col_val=_pf_colv,
        promo_col_max=_pf_colm,
        promo_rows=torch.tensor([len(x) for x in _P["ids"]], dtype=torch.long),
        u_promo_class=torch.tensor(_P["unitClass"], dtype=torch.long),
        promo_class_bit=torch.tensor(_P["classBit"], dtype=torch.long),
        choke_features=list(_P["chokeFeatures"]),
        woods_features=list(_P["woodsFeatures"]),
        woods_feature=int(_P["woodsFeature"]),
        worship_bidx=[int(x) for x in r["worshipBidx"]],
        temple_bidx=int(r["templeBidx"]),
        worship_faith_cost=float(r["worshipFaithCost"]),
        shrine_bidx=int(r["shrineBidx"]),
        t_cost=torch.tensor([t["cost"] for t in r["techs"]], dtype=torch.float64),
        t_award_env=torch.tensor([int(t["awardEnvoys"]) for t in r["techs"]], dtype=torch.long),
        t_award_dvp=torch.tensor([int(t["awardDvp"]) for t in r["techs"]], dtype=torch.long),
        c_award_env=torch.tensor([int(c["awardEnvoys"]) for c in r["civics"]], dtype=torch.long),
        c_award_dvp=torch.tensor([int(c["awardDvp"]) for c in r["civics"]], dtype=torch.long),
        t_award_favor=torch.tensor([int(t["awardFavor"]) for t in r["techs"]], dtype=torch.long),
        t_award_titles=torch.tensor([int(t["awardTitles"]) for t in r["techs"]], dtype=torch.long),
        t_award_projpct=torch.tensor([int(t["awardProjectPct"]) for t in r["techs"]], dtype=torch.long),
        c_award_favor=torch.tensor([int(c["awardFavor"]) for c in r["civics"]], dtype=torch.long),
        c_award_titles=torch.tensor([int(c["awardTitles"]) for c in r["civics"]], dtype=torch.long),
        c_award_projpct=torch.tensor([int(c["awardProjectPct"]) for c in r["civics"]], dtype=torch.long),
        t_repeat=torch.tensor([bool(t["repeatable"]) for t in r["techs"]], dtype=torch.bool),
        c_repeat=torch.tensor([bool(c["repeatable"]) for c in r["civics"]], dtype=torch.bool),
        t_prereqs=[t["prereqs"] for t in r["techs"]],
        c_cost=torch.tensor([c["cost"] for c in r["civics"]], dtype=torch.float64),
        c_prereqs=[c["prereqs"] for c in r["civics"]],
        war_weariness=r["warWeariness"],
        trade=r["trade"],
        eras=r["eras"],
        actions=r["actions"],
    )


_RULES_STAMP_CACHE: dict = {}


def _rules_stamp_for(dirpath: Path) -> str:
    key = str(dirpath)
    if key not in _RULES_STAMP_CACHE:
        rp = dirpath / "rules.json"
        _RULES_STAMP_CACHE[key] = (
            json.loads(rp.read_text())["srcStamp"] if rp.exists() else ""
        )
    return _RULES_STAMP_CACHE[key]


_FIXTURE_FORMAT: dict[tuple[str, int, int], bool] = {}


def fixture_paths(dirpath: Path = FIXTURES) -> list[Path]:
    """Every EXPORTED fixture in `dirpath`, sorted — and nothing else.

    Two other things live in the same directory and match a `seed*.json`
    glob, so no caller may write one:

    - the seeder's own `seed*.world.json` inputs, which `load_fixture`
      refuses as a foreign format;
    - ORPHANS from an older generation, left behind because seeding a
      different seed count or formula writes the new set without removing
      the old. An orphan makes the set MIXED, and a caller that takes
      `paths[0]` reads clean while its neighbour walking the whole list
      dies — so it is raised HERE, naming every one, instead of surfacing
      one lane at a time as a format refusal.

    Each file's format is parsed once per (mtime, size): a whole fixture is
    megabytes of JSON, and a poke lane calls this once per scene.
    """
    out, orphans = [], []
    for p in sorted(dirpath.glob("seed*.json")):
        if p.name.endswith(".world.json"):
            continue
        st = p.stat()
        key = (str(p), st.st_mtime_ns, st.st_size)
        cur = _FIXTURE_FORMAT.get(key)
        if cur is None:
            cur = _FIXTURE_FORMAT[key] = json.loads(p.read_text()).get("format") == 4
        (out if cur else orphans).append(p)
    if orphans:
        raise RuntimeError(
            f"{dirpath}: {len(orphans)} orphaned fixture(s) from an older generation "
            f"beside {len(out)} current — {', '.join(p.name for p in orphans)}. "
            "Delete them and re-run `npm run seed && npm run export`."
        )
    return out


def load_fixture(path: Path) -> dict:
    """Load one seed fixture — THE chokepoint every fixture-consuming lane
    shares, so staleness is checked exactly once, here:

    - anything but `format` 4 (settler starts: no pre-founded majors, one
      `civs[]` array carrying each seat's t0 units; tile ownership as the
      `ownerSeatInit`/`ownerInit` pair; `du` counting floodplains as
      district-usable) is REFUSED loudly rather than half-read into a world
      this engine cannot represent;
    - a fixture whose `srcStamp` disagrees with the rules.json beside it is a
      MIXED SET (half re-exported), which reads exactly like an engine
      divergence.
    """
    p = Path(path)
    f = json.loads(p.read_text())
    fmt = f.get("format", 1)
    if fmt != 4:
        raise RuntimeError(
            f"{p.name}: fixture format {fmt} — this engine runs FORMAT 4 (settler starts: no "
            "pre-founded majors, one `civs[]` array carrying each seat's t0 units; tile ownership "
            "as the seat-generic `ownerSeatInit`/`ownerInit` pair; floodplains district-usable). "
            "Regenerate with `npm run seed && npm run export`."
        )
    fx_stamp = f.get("srcStamp")
    rules_stamp = _rules_stamp_for(p.parent)
    if fx_stamp and rules_stamp and fx_stamp != rules_stamp:
        raise RuntimeError(
            f"{p.name}: srcStamp {fx_stamp[:12]} disagrees with rules.json's {rules_stamp[:12]} — "
            "a MIXED fixture set (half re-exported). Re-run the export before trusting any comparison."
        )
    return f



RESEARCH_LOOPS = 40  # > tree size: completes every ready tech/civic in one turn; the early exit keeps it free
# Slots in the two unit pools per game (append-only; runtime-asserted).
# Dead slots are recycled by `_reclaim_pool`, so a cap bounds LIVE units, not
# ever-spawned ones.
#
# EVERY MAJOR SEAT SHARES ONE POOL, the twin of TS's single `state.units`
# array: a unit's owner is `unit_seat`, never the slot range it landed in, so
# no seat has a window of its own to be different in. The barbarians keep a
# separate one only because nothing indexes them by seat row.
MAJOR_POOL_MAX = 512
#: how many INVENTED luxuries one seat can hold. Four Great Merchants make
#: them, at most two apiece, so the row can never fill in a real game.
GP_LUX_MAX = 8
BARB_POOL_MAX = 256
UNIT_SLOTS = 256

# The absolute SEAT space, shared with cpu/core/seats.ts.
# Every damage-roll key that OPENS a battle. The paired counter-roll keys
# (melc, cstyc, rctyc, encc) are the SAME battle from the other side and must
# not be counted twice.
#
# `warWearinessBattle` needs a hook at every one of these, and this set is the
# enumeration a grep is not: `_ww_audit` makes the engine prove at runtime that
# the hooks and this set agree.
WW_BATTLE_KEYS = frozenset({
    "mel",      # melee vs a unit - a MAJOR attacker or a hostile one
    "rng",      # p_ ranged vs a unit or a lone civilian
    "vrng",     # hostile ranged vs a unit
    "csty",     # melee vs a city-state centre - by ANY major seat
    "rcty",     # melee assault on ANY seat's city - the one cityAssault
    "enc",      # melee assault on ANY seat's Encampment district
    "vrngc",    # hostile ranged vs ANY seat's city
    "vrnge",    # hostile ranged vs ANY seat's Encampment district
    "vrngcs",   # hostile ranged vs a city-state centre
    "rngrc",    # ordered ranged vs ANY seat's city
    "rnge",     # ordered ranged vs ANY seat's Encampment district
    "rngcs",    # ordered ranged vs a city-state centre
    "cstk",     # ANY seat's city walls strike
    "estk",     # ANY seat's city Encampment strike
    "air",      # an AIR STRIKE on a unit - the sortie's own roll
})

BARB_SEAT = 200  # the barbarians — cpu/core/seats.ts BARB_SEAT
# CIV6's FREE CITIES player (CIVILIZATION_FREE_CITIES) — cpu/core/seats.ts
# FREE_SEAT. One seat holding every city loyalty took from its owner; its
# row in the city planes is `FREE_ROW`, its tiles carry this id.
FREE_SEAT = 300

# WHAT A POOL'S SEATS MAY DO: the `xp` bit of cpu/data/seats.ts SEAT_CAPS for
# the two classes a unit pool holds (`POOL_CLASS`). See that file for the
# ADMISSIBILITY RULE that keeps the set this small. Its other bit,
# `alwaysHostile`, is spelled on the seat ids in `_hostile_table`.
#
#   xp   this seat's units accrue experience and promote.
SEAT_CAPS = {
    "major": {"xp": True},     # every major seat
    "hostile": {"xp": False},  # the barbarians, and the Free Cities' granted units
}

POOL_CLASS = {"major": "major", "barb": "hostile"}

NO_SEAT = -1  # "nobody" — the cpu/core/seats.ts NO_SEAT twin
# `civ_age`: 0 a Dark Age, 1 Normal, 2 Golden. A HEROIC age is a Golden one
# reached out of a Dark one and carries this same code, which is why every
# "is this seat in a Golden Age" test is an equality against it (AGE_GOLDEN).
AGE_GOLDEN = 2

# Flanking & support (mirrors combat.ts). A melee attacker gains +2 CS per
# OTHER unit adjacent to the defender that is hostile to the defender
# (flanking); a defender gains +2 CS per friendly MILITARY unit adjacent to it
# (support), against melee AND ranged. Integer CS adds, so the combat diff
# quantization survives. Cities/CS/rc-cities are not units — no flanking there.
FLANKING_CS = 2
SUPPORT_CS = 2

# XP & levels (mirrors cpu/core/promotions.ts). A unit banks XP TOWARD its next
# level and stalls at the threshold until it promotes; the level itself pays no
# Combat Strength — the CHOSEN PROMOTION does. Barbarians accrue nothing (no
# barb xp plane) and civilians never fight.
#: the CITIZEN-ASSIGNMENT wire's "leave this pin alone" value. A pin is a
#: count, -1 hands the slot back to the automatic rule, and this sits below
#: both so a record can name one district without restating the rest.
SPEC_KEEP = -2

# The DIPLOMATIC verbs, in the order both engines apply them. `apply_geo`
# stashes by these names and `_geo_agreements` drains them in this order.
GEO_VERBS = ("denounce", "friend", "ally", "ally_type", "delegation", "borders", "gift", "offer", "accept",
             "ask_promise", "keep_promise")
XP_PER_LEVEL = 15
MAX_LEVEL = 8
PROMOTE_HEAL = 50
XP_BATTLE_CAP = 8
XP_RANGED_BATTLE = 1
XP_MELEE_BATTLE = 2
XP_INITIATOR = 1
XP_CITY_ATTACK = 3
XP_CITY_DEFEND = 2
XP_CITY_FELLED = 10
XP_BARB_VETERAN = 1
#: how ONE hit reaches a perimeter — the `cityDamageSplit` klass, as a code so
#: a batch can carry a different verb per game.
HIT_MELEE = 0
HIT_RANGED = 1
HIT_BOMBARD = 2
#: the two siege support chassis, as BITS: a target can have both beside it,
#: and each changes a different half of the split.
ASSIST_RAM = 1
ASSIST_TOWER = 2


# --- ONE INDEX SPACE ---------------------------------------------------------
# A fixture's `civs[]` is SEAT-KEYED — the exporter writes `state.seats` in seat
# order, each entry carrying its own absolute `seat` — and
# that id IS the entry's row in every merged plane. City-states (100+) and
# barbarians (200) stay outside the major numbering. There is no second index
# space, so no signature below converts between one and another.
# NB: the `_type_civilian` unit tensor means "unit type is CIVILIAN" and is
# unrelated to any of this.

M32 = 0xFFFFFFFF
# Civ 6's generator, the ANSI LCG (cpu/core/rand.ts LCG_MUL / LCG_ADD)
LCG_MUL = 1103515245
LCG_ADD = 12345

_PAIR_DIST_CACHE: dict[tuple[int, int, bool], torch.Tensor] = {}


def pair_distances(width: int, height: int, wrap_x: bool) -> torch.Tensor:
    key = (width, height, wrap_x)
    if key not in _PAIR_DIST_CACHE:
        rows = [hex_distance_from(width, height, wrap_x, i) for i in range(width * height)]
        _PAIR_DIST_CACHE[key] = torch.stack(rows).to(torch.int16)
    return _PAIR_DIST_CACHE[key]


def js_round(x: torch.Tensor) -> torch.Tensor:
    return torch.floor(x + 0.5)


def first_argmax(x: torch.Tensor) -> torch.Tensor:
    """argmax along dim 1 with ties -> LOWEST index. torch.argmax's tie pick is
    UNSPECIFIED; the TS scans this mirrors use strict >, so an exact tie must
    resolve to the lowest index."""
    best = x.max(dim=1, keepdim=True).values
    n = x.shape[1]
    ar = torch.arange(n, device=x.device).unsqueeze(0).expand_as(x)
    return torch.where(x == best, ar, torch.full_like(ar, n)).min(dim=1).values


_OFFSETS_CACHE: dict[int, torch.Tensor] = {}


def tiles_within_offsets(radius: int) -> torch.Tensor:
    """[M, 2] axial (dq, dr) offsets in EXACT tilesWithin iteration order —
    several TS scans break ties by that order (equal-sum tile picks, the
    first-best founding site, patrol steps), so it is part of the parity
    contract."""
    if radius not in _OFFSETS_CACHE:
        offs = []
        for dq in range(-radius, radius + 1):
            lo = max(-radius, -dq - radius)
            hi = min(radius, -dq + radius)
            for dr in range(lo, hi + 1):
                offs.append((dq, dr))
        _OFFSETS_CACHE[radius] = torch.tensor(offs, dtype=torch.long)
    return _OFFSETS_CACHE[radius]


_WINDOW_TABLES: dict = {}


def tiles_from_offsets(centers: torch.Tensor, offsets: torch.Tensor, width: int, height: int,
                       wrap_x: bool) -> torch.Tensor:
    """[N, M] the plot at each axial offset from each centre [N]
    (`tilesAtOffsets`), -1 off the map. On a wrapping map columns wrap, and
    where the map is narrow enough for two offsets to name one plot the later
    one is -1.

    Each window depends on its own centre alone, so it is read off a table of
    every centre in [-T, 2T) (`_offset_windows` at each), built once per
    offset set and map and kept while the offsets are the same object,
    unwritten; a centre outside that range is an index error."""
    T = width * height
    key = (id(offsets), width, height, wrap_x)
    ent = _WINDOW_TABLES.get(key)
    if ent is None or not stamp_holds(ent[0], (offsets,)):
        tab = _offset_windows(torch.arange(-T, 2 * T, device=offsets.device), offsets, width, height, wrap_x)
        ent = _WINDOW_TABLES[key] = (plane_stamp((offsets,)), tab)
    return ent[1][centers + T]


def _offset_windows(centers: torch.Tensor, offsets: torch.Tensor, width: int, height: int,
                    wrap_x: bool) -> torch.Tensor:
    """`tiles_from_offsets` computed: the window of each centre [N]."""
    col = centers % width
    row = torch.div(centers, width, rounding_mode="floor")
    q = col - ((row - (row & 1)) >> 1)
    tq = q.unsqueeze(1) + offsets[:, 0].unsqueeze(0)
    tr = row.unsqueeze(1) + offsets[:, 1].unsqueeze(0)
    tcol = tq + ((tr - (tr & 1)) >> 1)
    if wrap_x:
        tcol = tcol % width
    ok = (tcol >= 0) & (tcol < width) & (tr >= 0) & (tr < height)
    idx = torch.where(ok, tr * width + tcol, torch.full_like(tcol, -1))
    span = int((offsets[:, 0].max() - offsets[:, 0].min()).item()) + 1 if offsets.shape[0] else 0
    if wrap_x and width < span:
        m = idx.shape[1]
        earlier = torch.ones(m, m, dtype=torch.bool, device=idx.device).tril(-1)
        dup = ((idx.unsqueeze(2) == idx.unsqueeze(1)) & earlier & (idx >= 0).unsqueeze(2)).any(dim=2)
        idx = torch.where(dup, torch.full_like(idx, -1), idx)
    return idx


# CIV6_ALIAS_CHECK=1 turns on the per-step state-discipline assertions (alias
# storage + _MUTABLE shape/dtype). Off by default so the gates keep their
# wall-clock; the battery runs one lane with it on, and every lane that sets
# the env var inherits it.
_ALIAS_CHECK = os.environ.get("CIV6_ALIAS_CHECK", "") not in ("", "0")

def pool_view(snap: dict, pre: str, plane: str):
    lo = {"major": 0, "barb": MAJOR_POOL_MAX}[pre]
    hi = lo + (MAJOR_POOL_MAX if pre == "major" else BARB_POOL_MAX)
    return snap["mut"][f"unit_{plane}"][:, lo:hi]


_MUTABLE = [
    "seat_science_total",
    "rng_state", "centre_slot_at", "tdef", "tmove", "railroad",
    "next_slot", "camp_tile", "n_camps", "game_over",
    "victory_type", "victory_row", "project_done",  # one-time project ledger
    "space_ly", "civ_orbital_lasers", "city_lasers",  # the Exoplanet flight: LY travelled, the seat's orbital stations, the terrestrial ones per city
    "civ_stockpile", "civ_fuel_short", "city_powered",  # GS strategic banks, the slots short at the last fuel bill, and the grid they run
    "civ_wmd",  # nuclear devices held, dense over the device catalog
    "tile_fallout",  # turns of radioactive fallout still on a tile
    "district_dead",  # captured districts are paved-but-dead
    "civ_cap_tile",  # capitalTiles — capital identity + the domination anchor
    # `tile_seat` is STATE — the city-state part of tile ownership is stored
    # only here (`citystate_at` is a view of it), so it must round-trip.
    "tile_seat", "tile_city",
    "citystate_levy_seat", "citystate_levy_ends",
    "seat_warkind", "seat_denounced", "seat_friend_turns", "seat_ally_turns", "seat_alliance_type", "seat_alliance_pts", "civ_sci_rate", "civ_cul_rate", "civ_tour_rate", "seat_borders_turns", "seat_delegation",
    "deal_offer_left", "deal_offer_give", "deal_offer_ask", "deal_term_left", "deal_term_item", "seat_spy_held", "seat_promise", "seat_promise_broken",
    "comp_kind", "comp_left", "comp_target", "comp_score", "comp_member", "congress_sessions", "congress_slate", "congress_active", "civ_congress_vote", "emg_kind", "emg_target", "emg_city", "emg_phase", "emg_act", "emg_affected", "emg_member", "last_session_turn", "civ_emg_heal", "civ_emg_strike", "civ_emg_envoy_gold", "civ_emg_route_gold", "civ_emg_nuke_cs", "civ_emg_nuke_cut", "era_score", "moment_seen", "moment_world", "dark_bar", "golden_bar", "game_era", "era_start", "era_countdown", "road_tier", "dark_ages", "golden_ages", "civ_age", "civ_gov_held", "civ_gov_chosen", "civ_civic_turn", "civ_gov_anarchy_end", "civ_policies", "civ_policy_lapsed", "prev_age", "dedications", "ded_picks", "feat_id", "feat_stripped", "res_stripped", "district_complete", "encamp_hp", "encamp_outer_hp", "road", "seat_ext", "city_prod_bank",
    "city_dist_tile",
    "seat_routes", "seat_route_exp",  # domestic trade routes (rc-id pairs)
    "seat_route_dseat", "seat_route_dcity",  # international dest (seat row, city id), else -1/-1 (domestic/CS)
    "seat_route_born", "seat_route_walk", "seat_route_leg",  # the Trader's walk (birth turn, tile, leg)
    "seat_route_course",  # the stored course (the path's plots, origin to destination, -1-padded)
    "trading_post",  # Trading Posts by (seat row, centre tile)
    "city_id",
    "unit_next",
    "gp_earned", "gp_offer", "gp_price", "gp_passed_by", "gp_claimed", "civ_gp_used", "civ_gp_earned", "civ_barb_kills", "civ_gp_perm", "civ_gp_lux", "civ_gp_lux_n", "civ_gp_lux_copies", "city_gp_perm", "pantheon_claimed_n",
    "pan_claimed", "fol_claimed", "wor_claimed", "fou_claimed", "enh_claimed",  # belief-claim masks, one per class
    "holy_tile", "city_pressure", "city_followed",  # ONE seat-indexed pressure+followed plane pair
    "city_unconverted",  # each city's unconverted pressure
    "city_growth_drift",  # the residue each city's growth accumulator keeps
    "city_worked",  # the worked-tile pick — a city plane, so it rides the compaction
    "city_amen_tier",  # the amenity tier the walk ran on — a city plane, same reason
    "city_spy_sources",  # the per-seat Gain Sources clock a spy mission leaves behind
    "city_free_press", "free_next_city_id",  # a FREE CITY's race per major, and the Free Cities seat's city-id counter
    "city_founded_turn",  # the turn its owner founded or took the city
    "free_treasury",  # the Free Cities seat's treasury
    "seat_shortfall",  # every city row's holder's last turn shortfall, which bankruptcy reads
    # THE GOVERNOR ROSTER — one slot per catalog governor per major row
    "civ_gov_appointed", "civ_gov_city", "civ_gov_minor", "civ_gov_establish", "civ_gov_out", "civ_gov_promos",
    "antiquity",  # ANTIQUITY SITES (bool tile plane)
    "antiquity_era", "antiquity_seat",  # ...and what a dug Artifact remembers
    "shipwreck", "shipwreck_era", "shipwreck_seat",  # the WATER dig
    "park",  # NATIONAL PARK tiles
    # CIV6 (Coastal Lowlands): the sea takes ground, so every tile fact it
    # moves is state, not map generation (`_submerge`).
    "tile_submerged", "water", "wpass", "passable", "work_ok", "settle_ok",
    "d_usable", "d_usable0", "camp_ok", "coastal_land", "coastal_water", "_sr_c", "tile_wh",
    "tile_yields", "wok", "res_id", "res_cat", "res_priority", "lux_id",
    "lux_req", "res_imp", "tile_lowland",
    # the Aqueduct's source and the atom it derives from: a drowned OASIS
    # stops sourcing a neighbour, so both are state, not map generation.
    "aqsrc", "aq_own",
    # CIV6 (Builder): a HARVEST takes the resource off a tile that stays
    # workable, so every baked flag that reads `t.resource` is state —
    # the harvest copies each one's resource-free value in (`_nr_planes`).
    "site_q3", "tile_ftr", "farm_flat", "farm_hill", "mine_ok", "lumber_ok",
    "_fa_f_c", "_fa_h_c", "_mi_c",
    # CIV6 (Volcanic Soil): an eruption's soil replaces Woods or Rainforest
    # for good, so the t0 feature bakes it zeroes are state (`_paint_soil`).
    "appeal_base", "appeal_feat", "feat_removable", "tile_ftu", "_feat_adj", "_nfeat_adj",
    "built_wonder", "built_wonder_complete", "city_wonder",  # world wonders + the per-city registry
    "fertility", "fertility_prod", "fertility_sci", "fertility_cul",
    "tile_locked", "drought", "improvement", "pillaged", "district",
    "storm_event", "storm_at", "storm_left",  # the live STORM records: row, centre, turns left
    "storm_id", "storm_struck", "storm_serial",  # each one's serial and struck plots, the counter
    "drought_left", "drought_plots",  # the live DROUGHT records: turns left, footprint
    "fire_start", "fire_seq", "fire_serial",  # each plot's FIRE: its start turn and its place among the live fires, -1 none; the counter
    "tile_meteor",  # METEOR SITES: laid by the draw, taken by the first unit in
    "tile_goody",  # TRIBAL VILLAGES: claimed and gone
    "district_pillaged",  # raided-dark districts (tile plane, reclaim-safe)
    "d_static_adj",  # mutated when an in-game founding clears the center tile's removable feature
    # The merged unit pool. The BASES are registered, never the `major_`/`barb_`
    # RANGE VIEWS into them — snapshot/restore round-trips one tensor per plane
    # instead of three, and a view can never be half-restored.
    "unit_alive", "unit_type", "unit_tile", "unit_hp", "unit_fortify", "unit_xp", "unit_level", "unit_promos", "unit_promo_offer", "unit_promo_used", "unit_promo_bonus", "unit_xp_pct", "unit_mp_bonus", "unit_charges", "unit_aura_mp", "unit_mp", "unit_mp_full", "unit_attacks", "unit_emb", "unit_seat", "unit_spy_mission", "unit_spy_turns", "unit_spy_target", "unit_spy_level", "unit_band_level", "unit_band_album", "unit_gp_at", "unit_revealed_turn", "unit_formation", "unit_levied", "unit_levy_src", "unit_patrol", "unit_free_city", "unit_no_res_upkeep",
    "unit_escorted", "military_at", "civilian_at", "support_at", "embarked_at", "war", "ww", "ww_turn",
    "civ_best_melee", "civ_builders_trained", "civ_settlers_trained", "civ_discount_districts", "civ_relic_reserve", "civ_civic_prog", "civ_cur_civic", "civ_cur_tech", "civ_diplo_favor", "civ_diplo_points", "civ_envoys_avail", "civ_granted_titles", "civ_research_project_pct", "civ_influence", "civ_tech_prog", "civ_tech_ovf", "civ_civic_ovf", "civ_treasury", "civ_techs", "civ_civics", "civ_tech_boosted", "civ_civic_boosted", "civ_tech_retain", "civ_civic_retain",
    "civ_enhancer", "civ_beliefs_earned", "civ_follower", "civ_founder", "civ_worship", "civ_next_city_id",
    "civ_pantheon", "civ_pantheon_done", "civ_prophets", "civ_religion_done", "civ_inquisition", "civ_first_imp_tech",
    "seat_citystate_met", "seat_citystate_envoys", "seat_citystate_quest", "seat_citystate_quest_camp", "seat_citystate_quest_issued",
    "citystate_suzerain", "citystate_techs", "citystate_civics", "citystate_tech_prog", "citystate_civic_prog", "citystate_prod",
    "citystate_treasury", "citystate_faith",
    "citystate_build_from", "citystate_army_cap", "citystate_builders_trained", "citystate_best_melee",
    "citystate_builder_buy", "citystate_army_seen", "citystate_loss_turn",  # the minor's purse draws and loss window
    "citystate_full_power",  # a running `fullyPowered` project lights the minor's grid
    "citystate_build_proj",  # the unfinished district project the minor's last step worked on
    "citystate_repair_wait",  # a pillaged building's repair waits for the minor's item in hand
    "city_free_pot",  # a Free City's build pot
    "city_proj_conv", "city_proj_yield",  # a district project's converted yield, read until the next step
    "seat_explored",
    "civ_culture", "civ_faith", "civ_tourism", "civ_tourism_rel", "civ_gpp", "civ_grievance",
    "civ_tourism_to", "civ_tourism_rel_to",  # lifetime tourism SENT, per (from, to) major pair
    "civ_dominant",  # cultural dominance, per (from, to) major pair
    "civ_unit_acq",  # copies of each chassis a seat has ever acquired (the progressive price)
    "city_alive", "city_center", "city_pop", "city_hp", "city_outer_hp", "city_last_hit", "city_is_cap", "city_orig_cap", "city_founder", "city_former", "city_loyalty", "city_acquired", "city_growth", "city_cbox", "city_next_plot", "city_current", "city_progress", "city_cost", "city_qtile", "city_gw_obj", "city_gw_maker", "city_gw_era", "city_gw_seat", "city_spec_pin", "city_idle", "city_boost_turn", "city_bldg", "city_bldg_pillaged", "city_bldg_era", "city_reactor_age",
    "war_turns", "treaty_turns", "peace_turns", "conquest_turns",
    "civ_gpp_turn",  # Great Person points EARNED this turn, per class (a competition reads it)
    "civ_co2", "civ_co2_turn", "climate_idx", "tile_flooded", "tile_flood_ct", "tile_air_bonus", "tile_gp_perm",
    "volcano_active", "tile_event_fired",  # the turn's random event: waking volcanoes, first occurrences
]


# ---------------------------------------------------------------------------
# Read-set memo: an engine call run once with every instance-attribute read
# recorded, and answered again while every one of those reads still holds.
#
# A tensor read holds while it is the same object at the same version counter
# (every in-place write moves it), or else while its bits equal the copy taken
# when the entry was stored — so a write that stores what was already there,
# or a plane rebuilt to the same values, keeps the entry. A tensor born under
# inference mode keeps no version counter (`write_count`), so its read is
# always answered by the bits. A scalar holds while
# it compares equal and is of the same type; any other object while it is the
# same object. The derived caches (`*_cache`, `*_memo`, `*_stamp`) are not
# recorded: each is checked against a key it computes from reads that ARE
# recorded, so while those hold, what a cache hands back is what it handed
# back the first time. The engine's evolving state lives in tensors and
# scalars (`snapshot` carries nothing else and a resumed game replays
# exactly), so the python containers a call reads are its catalogues.
# ---------------------------------------------------------------------------

STATS_MEMO_CHECK = os.environ.get("CIV6_STATS_MEMO_CHECK") == "1"
_MEMO_SCALARS = (int, float, bool, str, type(None), torch.dtype, torch.device)
_MEMO_DERIVED = ("_cache", "_memo", "_stamp")
_TRACKING: dict[type, type] = {}
_ABSENT = object()
_FRESH = itertools.count(-1, -1)


def write_count(t: torch.Tensor):
    """`t`'s in-place write counter, or None for a tensor born under
    inference mode, which keeps none."""
    return None if t.is_inference() else t._version


def write_stamp(t: torch.Tensor) -> int:
    """`write_count` for a cache key: a tensor that keeps no counter answers
    a number never answered before, so the key never matches."""
    return next(_FRESH) if t.is_inference() else t._version


def plane_stamp(ts: tuple) -> tuple | None:
    """Each plane with its in-place write counter: `stamp_holds` answers True
    later only while every one of them is the same object, unwritten. None
    when one keeps no counter (`write_count`)."""
    out = []
    for t in ts:
        if t.is_inference():
            return None
        out.append((t, t._version))
    return tuple(out)


def stamp_holds(st: tuple | None, ts: tuple) -> bool:
    if st is None or len(st) != len(ts):
        return False
    for (a, v), t in zip(st, ts):
        if a is not t or a._version != v:
            return False
    return True


def pad_index_lists(lists: list, device) -> tuple[torch.Tensor, torch.Tensor]:
    """A ragged list of index lists as ([N, K] long, [N, K] bool): row i holds
    `lists[i]` padded with index 0, and the mask marks the real entries."""
    k = max([len(r) for r in lists] + [1])
    idx = torch.zeros(len(lists), k, dtype=torch.long, device=device)
    ok = torch.zeros(len(lists), k, dtype=torch.bool, device=device)
    for i, r in enumerate(lists):
        if r:
            idx[i, : len(r)] = torch.tensor(r, dtype=torch.long, device=device)
            ok[i, : len(r)] = True
    return idx, ok


_INFERENCE: list = []


def enter_inference() -> None:
    """Put this thread under torch.inference_mode for good. No engine tensor
    ever needs autograd, and the mode drops autograd's and the view/version
    bookkeeping from every op's dispatch; a dispatch-bound engine pays that on
    every op. Tensors born under it keep no version counter (`write_count`)."""
    if not torch.is_inference_mode_enabled():
        cm = torch.inference_mode()
        cm.__enter__()
        _INFERENCE.append(cm)


# the recordings in progress, outermost first, one per nested recorded call:
# each (reads, writes, held) — `held` the entries the instance dict held when
# the call began, moved out of it for the call. The outermost `held` is the
# whole dict; an inner one, what the enclosing calls had read or written so
# far. A name's first read in a call misses the dict, is found in the
# innermost `held` that has it, and is recorded by every call from that one
# in — the ones that had not read it yet.
_REC: list = []
# the recorded instance's dict and class, while a recording runs
_REC_OBJ: list = []
# every name a class (or a base) defines: an instance attribute shadowing one
# stays in the dict through a recording, or the class's value would answer
_CLASS_NAMES: dict[type, frozenset] = {}


def _tracking_class(cls: type) -> type:
    """`cls` with the recording's two hooks. The recording moves the instance
    dict's entries out, so the first read of an instance attribute misses
    the dict and reaches `__getattr__`, which records it and moves it back:
    every later read of it is a plain lookup."""
    t = _TRACKING.get(cls)
    if t is None:
        def __getattr__(self, name, _rec=_REC, _obj=_REC_OBJ):
            k = len(_rec) - 1
            v = _rec[k][2].get(name, _ABSENT)
            while v is _ABSENT:
                k -= 1
                if k < 0:
                    raise AttributeError(name)
                v = _rec[k][2].get(name, _ABSENT)
            _obj[0][name] = v
            if not name.endswith(_MEMO_DERIVED):
                if isinstance(v, torch.Tensor):
                    e = (0, v, write_count(v))
                elif isinstance(v, _MEMO_SCALARS):
                    e = (1, v, None)
                else:
                    e = (2, v, None)
                for j in range(k, len(_rec)):
                    _rec[j][0][name] = e
            return v

        def __setattr__(self, name, v, _rec=_REC):
            for layer in _rec:
                layer[1].add(name)
            object.__setattr__(self, name, v)

        _CLASS_NAMES[cls] = frozenset(n for c in cls.__mro__ for n in c.__dict__)
        t = _TRACKING[cls] = type(cls.__name__, (cls,),
                                  {"__getattr__": __getattr__, "__setattr__": __setattr__})
    return t


def _bits(t: torch.Tensor) -> torch.Tensor:
    """the tensor as its bit pattern — `torch.equal` calls -0.0 and 0.0 equal"""
    if t.dtype == torch.float64:
        return t.view(torch.int64)
    if t.dtype == torch.float32:
        return t.view(torch.int32)
    return t


def record_reads(obj, fn, *args, may_set: tuple[str, ...] = ()):
    """Run `fn(*args)` (a method bound to `obj`) with `obj`'s reads recorded.
    Returns (result, reads) — `reads` None when the call cannot be memoised:
    it set an attribute other than a derived cache or `may_set`, or wrote into
    a tensor it read. A call inside another recorded call is recorded too,
    and what it reads joins the enclosing calls' reads."""
    d = obj.__dict__
    outer = not _REC
    if outer:
        cls = type(obj)
        tcls = _tracking_class(cls)
        _REC_OBJ[:] = [d, cls]
    else:
        assert _REC_OBJ[0] is d, "a recording runs on one instance at a time"
    reads, writes, held = {}, set(), dict(d)
    d.clear()
    # an instance attribute standing over a class one (a poke's patched
    # method) stays in the dict, where the plain lookup finds it before the
    # class's, and is recorded as read up front
    for name in _CLASS_NAMES[_REC_OBJ[1]].intersection(held):
        v = d[name] = held[name]
        if not name.endswith(_MEMO_DERIVED):
            reads[name] = ((0, v, write_count(v)) if isinstance(v, torch.Tensor)
                           else (1, v, None) if isinstance(v, _MEMO_SCALARS) else (2, v, None))
    _REC.append((reads, writes, held))
    if outer:
        object.__setattr__(obj, "__class__", tcls)
    try:
        out = fn(*args)
    finally:
        _REC.pop()
        if outer:
            object.__setattr__(obj, "__class__", _REC_OBJ[1])
            _REC_OBJ.clear()
        # back in the original order: the held entries, then what the call
        # read back (the same objects) or wrote over them, then what it added
        now = dict(d)
        d.clear()
        d.update(held)
        d.update(now)
    if any(not w.endswith(_MEMO_DERIVED) and w not in may_set for w in writes):
        return out, None
    # one copy per plane per version, shared by every entry that read it
    shadow = getattr(obj, "_memo_shadow_cache", None)
    if shadow is None:
        shadow = obj._memo_shadow_cache = {}
    ents = []
    for name, (k, ref, ver) in reads.items():
        if k == 0:
            if d.get(name, _ABSENT) is not ref or (ver is not None and ref._version != ver):
                return out, None
            sh = shadow.get(name)
            if sh is None or sh[0] is not ref or ver is None or sh[1] != ver:
                sh = shadow[name] = (ref, ver, ref.clone())
            ents.append([name, 0, ref, ver, sh[2]])
        else:
            ents.append([name, k, ref, None, None])
    return out, ents


def memo_read(obj, store: dict, key, fn, *args, may_set: tuple[str, ...] = ()) -> tuple:
    """`fn(*args)` — a reader returning a tuple of tensors — through the
    read-set memo `store` (a derived cache on `obj`), entry `key`: a hit hands
    back clones of the stored result. Under `_log_diff` it runs plain.
    STATS_MEMO_CHECK recomputes on every hit and asserts. Inside a recorded
    call the entry's reads are taken through the recording, so on a hit they
    join the enclosing calls' reads."""
    d = obj.__dict__ if not _REC else _RecView(obj)
    if d.get("_log_diff", None):
        return fn(*args)
    ent = store.get(key)
    if ent is not None and reads_hold(d, ent[0]):
        out = tuple(t.clone() for t in ent[1])
        if STATS_MEMO_CHECK:
            fresh = fn(*args)
            assert all(torch.equal(_bits(a), _bits(b)) for a, b in zip(fresh, out)), \
                f"read-set memo stale: {getattr(fn, '__name__', fn)} {key!r}"
        return out
    out, reads = record_reads(obj, fn, *args, may_set=may_set)
    if reads is None:
        store.pop(key, None)
    else:
        store[key] = (reads, tuple(t.clone() for t in out))
    return out


class _RecView:
    """The recorded instance's attributes as `dict.get` answers them, each
    read through the recording."""
    __slots__ = ("obj",)

    def __init__(self, obj):
        self.obj = obj

    def get(self, name, default):
        return getattr(self.obj, name, default)


def reads_hold(d, ents: list) -> bool:
    """Do the recorded reads `ents` still hold on the instance dict `d` (or a
    `_RecView` of it)?"""
    for e in ents:
        cur = d.get(e[0], _ABSENT)
        k = e[1]
        if k == 0:
            if cur is e[2] and e[3] is not None and cur._version == e[3]:
                continue
            c = e[4]
            if not (isinstance(cur, torch.Tensor) and cur.dtype == c.dtype and cur.shape == c.shape
                    and torch.equal(_bits(cur), _bits(c))):
                return False
            e[2], e[3] = cur, write_count(cur)
        elif k == 1:
            if type(cur) is not type(e[2]) or cur != e[2]:
                return False
        elif cur is not e[2]:
            return False
    return True
