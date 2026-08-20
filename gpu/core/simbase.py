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

import json
import os
from dataclasses import dataclass
from pathlib import Path

import torch

FIXTURES = Path(__file__).resolve().parent.parent.parent / "seeder" / "worlds"

# ---------------------------------------------------------------------------
# Hex math (mirrors world/hex.ts: pointy-top, odd-r offset)
# ---------------------------------------------------------------------------


def hex_distance_from(width: int, height: int, center: int) -> torch.Tensor:
    """Distance of every tile index from `center` (odd-r offset coords)."""
    idx = torch.arange(width * height)
    col, row = idx % width, idx // width

    def to_axial(c, r):
        q = c - torch.div(r - (r % 2), 2, rounding_mode="floor")
        return q, r

    q, r = to_axial(col, row)
    cq, cr = to_axial(torch.tensor(center % width), torch.tensor(center // width))
    dq, dr = q - cq, r - cr
    return (dq.abs() + dr.abs() + (dq + dr).abs()) // 2


def neighbor_table(width: int, height: int) -> torch.Tensor:
    even = [(1, 0), (0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1)]
    odd = [(1, 0), (1, -1), (0, -1), (-1, 0), (0, 1), (1, 1)]
    out = torch.full((width * height, 6), -1, dtype=torch.long)
    for i in range(width * height):
        c, r = i % width, i // width
        offs = odd if r % 2 else even
        for d, (dc, dr) in enumerate(offs):
            nc, nr = c + dc, r + dr
            if 0 <= nc < width and 0 <= nr < height:
                out[i, d] = nr * width + nc
    return out




@dataclass
class Rules:
    focus_base: torch.Tensor
    citizen_science: float
    citizen_culture: float
    food_per_citizen: float
    boost_fraction: float
    housing_fresh: float
    housing_coastal: float
    housing_none: float
    housing_aq_fresh_bonus: float  # Aqueduct: +this to a fresh-water city
    housing_aq_no_fresh: float  # Aqueduct: raise a non-fresh city's water housing to this
    amenity_tiers: list  # [(min, growth, yield)]
    center_min_food: float
    center_min_production: float
    settler_base: float
    settler_per_city: float
    settler_pop_gate: int
    builder_base: float
    builder_per: float
    game_speed: float
    gold_purchase_mult: float  # gold price = production cost × this (GOLD_PURCHASE_MULT)
    faith_purchase_mult: float  # faith price = production cost × this (FAITH_PURCHASE_MULT)
    turn_limit: int  # game over once turn > this
    space_ly_target: int  # the Exoplanet craft's distance (light-years, speed-scaled)
    district_cost: dict  # districtCost params {base, scale} — each seat pays it from ITS OWN research
    score_pop_weight: float
    score_yield_weights: torch.Tensor  # [6]
    boosts: list  # [{target, idx, kind, ...}] — eureka/inspiration conditions
    combat: dict  # barbarian constants + the JS-computed damage-base table
    units: list  # trainable roster [{id, cost, combat, maintenance, civilian, requiresTech}]
    citystate: dict  # city-state constants (envoy cost, influence rate, quest pacing, type→yield)
    seats: dict  # seat pacing, loyalty, GP costs, belief-pool sizes (cpu/data/seats.ts)
    beliefs: dict  # dense pantheon/follower/founder effect tables (data-file key order = claim-draw order)
    projects: dict  # {rows: [{d, y, g}], yieldFraction, gppFraction} in data order
    wonders: dict  # {rows: [{cost, ut, uc, cy, growAll, petra, mult, adjD, adjR}], fpFid} in data order
    improvements: dict  # FARM food/housing, builder roster idx, hillFarms civic
    districts: list  # catalog [{id, idx, cost, adjYield, adjacency, housing, ...}]
    governments: list  # [{id, tier, unlockCivic, slots:[m,e,d,w], cityYields[6], capitalYields[6]}] table order
    policies: list  # [{id, kind, unlockCivic, cityYields[6], capitalYields[6]}] table order
    governments_live: bool  # master switch (GOVERNMENTS_ADOPTION_LIVE)
    district_scaffold: dict  # {campusIdx, campusUnlockTech}
    shipyard_bidx: int  # building-roster index of SHIPYARD (special: prod = Harbor adjacency), -1 if absent
    ancient_walls_bidx: int  # building-roster index of ANCIENT_WALLS (outer HP + city strike), -1 if absent
    palace_yields: torch.Tensor  # [6]
    palace_housing: float
    palace_amenities: float
    palace_maintenance: float  # buildingMaintenance('PALACE') — 0 while the Palace is cost-0
    b_cost: torch.Tensor  # [NB]
    b_yields: torch.Tensor  # [NB, 6]
    b_housing: torch.Tensor
    b_amenities: torch.Tensor
    b_maintenance: torch.Tensor
    b_river: torch.Tensor  # bool
    b_farmbonus: torch.Tensor  # bool — Water Mill: farm-improved BONUS resources gain +1 food
    b_unlock: torch.Tensor  # tech index or -1
    b_unlock_civic: torch.Tensor  # civic index or -1 (Temple/Amphitheater/… gate on a civic, not a tech)
    b_req_district: torch.Tensor  # required district idx (-1 = City Center / none)
    b_req_buildings: list  # per building: list of prerequisite building indices (requiresAny)
    b_excl_buildings: list  # per building: exclusive-sibling indices (exclusiveWith — Barracks/Stable)
    b_regional: torch.Tensor  # bool [NB] — regional building (leaves local sums; delivered by range)
    regional_range: int  # REGIONAL_RANGE (hex distance, source district tile -> receiver center)
    b_worship: torch.Tensor  # bool [NB] — worship building (faith-purchase-only; every production/gold picker skips)
    b_era: torch.Tensor  # long [NB] — the era the building first unlocks (Heartbeat of Steam's gate)
    b_train_xp: torch.Tensor  # long [NB] — flat training XP a unit trained/purchased in a city holding this Encampment military building starts with (best tier over present buildings; 0 for non-military buildings)
    worship_bidx: list  # the 5 worship rows in WORSHIP_BUILDINGS order (religion id % 5 indexes THIS)
    temple_bidx: int  # TEMPLE row (worship prerequisite), -1 if absent
    worship_faith_cost: float  # flat worship faith price (round(190·GAME_SPEED))
    shrine_bidx: int  # SHRINE row (the missionary buy's gate), -1 if absent
    t_cost: torch.Tensor  # [NT]
    t_prereqs: list  # list of lists
    c_cost: torch.Tensor
    c_prereqs: list
    war_weariness: dict  # {perTurn, decay, perAmenity, cap} — flat amenity drag at war
    trade: dict  # {marketBidx, lighthouseBidx, foreignTradeCidx, capWonderWidx, range} — trade capacity/route anchors
    eras: dict  # {length, found, conquer, wonder, pantheon, religion, gp} — era-score events + age thresholds
    actions: dict  # {unit: [name, ...]} — the unit-action enum, index = mask column


def load_rules(path: Path = FIXTURES / "rules.json") -> Rules:
    r = json.loads(Path(path).read_text())
    B = r["buildings"]
    return Rules(
        focus_base=torch.tensor(r["focusBase"], dtype=torch.float64),
        citizen_science=r["citizenScience"],
        citizen_culture=r["citizenCulture"],
        food_per_citizen=r["foodPerCitizen"],
        boost_fraction=r["boostFraction"],
        housing_fresh=r["housing"]["fresh"],
        housing_coastal=r["housing"]["coastal"],
        housing_none=r["housing"]["none"],
        housing_aq_fresh_bonus=r["housing"].get("aqFreshBonus", 2),
        housing_aq_no_fresh=r["housing"].get("aqNoFreshTotal", 6),
        amenity_tiers=[(t["min"], t["growth"], t["yield"]) for t in r["amenityTiers"]],
        center_min_food=r.get("centerMinFood", 2),
        center_min_production=r.get("centerMinProduction", 1),
        settler_base=r["scenario"]["settlerBase"],
        settler_per_city=r["scenario"]["settlerPerCity"],
        settler_pop_gate=r["scenario"]["settlerPopGate"],
        builder_base=r["scenario"].get("builderBase", 50),
        builder_per=r["scenario"].get("builderPer", 4),
        game_speed=r["scenario"].get("gameSpeed", 0.6),
        gold_purchase_mult=r["scenario"].get("goldPurchaseMult", 4),
        faith_purchase_mult=r["scenario"].get("faithPurchaseMult", 2),
        turn_limit=r["scenario"].get("turnLimit", 250),
        space_ly_target=r["scenario"].get("spaceLyTarget", 30),
        district_cost=r.get("districtCost", {"base": 54, "scale": 8}),
        score_pop_weight=r["score"]["popWeight"],
        score_yield_weights=torch.tensor(r["score"]["yieldWeights"], dtype=torch.float64),
        boosts=r.get("boosts", []),
        combat=r.get("combat", {}),
        units=r.get("units", []),
        citystate=r["cityState"],
        seats=r["seats"],  # the seat bag (cpu/data/seats.ts)
        beliefs=r.get("beliefs", {}),
        projects=r.get("projects", {}),
        wonders=r.get("wonders", {}),
        improvements=r.get("improvements", {}),
        districts=r.get("districts", []),
        governments=r.get("governments", []),
        policies=r.get("policies", []),
        governments_live=bool(r.get("governmentsLive", False)),
        district_scaffold=r.get("districtScaffold", {}),
        shipyard_bidx=int(r.get("shipyardBidx", -1)),
        ancient_walls_bidx=int(r.get("ancientWallsBidx", -1)),
        palace_yields=torch.tensor(r["palace"]["yields"], dtype=torch.float64),
        palace_housing=r["palace"]["housing"],
        palace_amenities=r["palace"]["amenities"],
        palace_maintenance=r["palace"].get("maintenance", 0),
        b_cost=torch.tensor([b["cost"] for b in B], dtype=torch.float64),
        b_yields=torch.tensor([b["yields"] for b in B], dtype=torch.float64),
        b_housing=torch.tensor([b["housing"] for b in B], dtype=torch.float64),
        b_amenities=torch.tensor([b["amenities"] for b in B], dtype=torch.float64),
        b_maintenance=torch.tensor([b["maintenance"] for b in B], dtype=torch.float64),
        b_river=torch.tensor([b["river"] for b in B], dtype=torch.bool),
        b_farmbonus=torch.tensor([b.get("farmBonusFood", 0) for b in B], dtype=torch.bool),
        b_unlock=torch.tensor([b["unlockTech"] for b in B], dtype=torch.long),
        b_unlock_civic=torch.tensor([b.get("unlockCivic", -1) for b in B], dtype=torch.long),
        b_req_district=torch.tensor([b.get("reqDistrict", -1) for b in B], dtype=torch.long),
        b_req_buildings=[b.get("reqBuildings", []) for b in B],
        b_excl_buildings=[b.get("exclBuildings", []) for b in B],
        b_regional=torch.tensor([bool(b.get("regional", 0)) for b in B], dtype=torch.bool),
        regional_range=int(r.get("regionalRange", 6)),
        b_worship=torch.tensor([bool(b.get("worship", 0)) for b in B], dtype=torch.bool),
        b_train_xp=torch.tensor([int(b.get("trainXp", 0)) for b in B], dtype=torch.long),
        b_era=torch.tensor([int(b.get("eraIdx", 0)) for b in B], dtype=torch.long),
        worship_bidx=r.get("worshipBidx", []),
        temple_bidx=int(r.get("templeBidx", -1)),
        worship_faith_cost=float(r.get("worshipFaithCost", 114)),
        shrine_bidx=int(r.get("shrineBidx", -1)),
        t_cost=torch.tensor([t["cost"] for t in r["techs"]], dtype=torch.float64),
        t_prereqs=[t["prereqs"] for t in r["techs"]],
        c_cost=torch.tensor([c["cost"] for c in r["civics"]], dtype=torch.float64),
        c_prereqs=[c["prereqs"] for c in r["civics"]],
        war_weariness=r.get("warWeariness", {}),
        trade=r.get("trade", {}),
        eras=r.get("eras", {}),
        actions=r.get("actions", {}),
    )


_RULES_STAMP_CACHE: dict = {}


def _rules_stamp_for(dirpath: Path) -> str:
    key = str(dirpath)
    if key not in _RULES_STAMP_CACHE:
        rp = dirpath / "rules.json"
        _RULES_STAMP_CACHE[key] = (
            json.loads(rp.read_text()).get("srcStamp", "") if rp.exists() else ""
        )
    return _RULES_STAMP_CACHE[key]


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
    """
    out, orphans = [], []
    for p in sorted(dirpath.glob("seed*.json")):
        if p.name.endswith(".world.json"):
            continue
        (out if json.loads(p.read_text()).get("format") == 4 else orphans).append(p)
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
# seat 0 has no window of its own to be different in. The barbarians keep a
# separate one only because nothing indexes them by seat row.
MAJOR_POOL_MAX = 512
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
    "csty",     # melee vs a city-state centre - seat 0 AND a civ seat
    "rcty",     # melee assault on ANY seat's city - the one cityAssault
    "enc",      # melee assault on ANY seat's Encampment district
    "vrngc",    # hostile ranged vs a seat-0 city
    "rngrc",    # seat-0 ranged vs a civ-seat city
    "rngcs",    # seat-0 ranged vs a city-state centre
    "cstk",     # ANY seat's city walls strike
    "estk",     # ANY seat's city Encampment strike
})

BARB_SEAT = 200  # the barbarians — cpu/core/seats.ts BARB_SEAT

# WHAT A SEAT MAY DO — the twin of cpu/data/seats.ts, same two bits. See that
# file for the ADMISSIBILITY RULE that keeps the set this small: a bit earns a
# place only when the empty/zero data value is not already the right answer.
#
#   xp             this seat's units accrue experience and promote.
#   always_hostile hostile to everyone with NO war state — the one thing the
#                  war matrix cannot say, since an all-false row means peace.
SEAT_CAPS = {
    "major": {"xp": True, "always_hostile": False},   # seat 0 and the civ seats
    "minor": {"xp": True, "always_hostile": False},   # city-states
    "hostile": {"xp": False, "always_hostile": True},  # barbarians
}

POOL_CLASS = {"major": "major", "barb": "hostile"}


def seat_class(seat: int) -> str:
    """Which kind of actor an ABSOLUTE seat id is — the twin of
    cpu/core/seats.ts `seatClass`. The id space encodes it, so nothing stores a
    duplicate."""
    if seat == BARB_SEAT:
        return "hostile"
    if 100 <= seat < BARB_SEAT:
        return "minor"
    return "major"
NO_SEAT = -1  # "nobody" — the cpu/core/seats.ts NO_SEAT twin

# Flanking & support (mirrors combat.ts). A melee attacker gains +2 CS per
# OTHER unit adjacent to the defender that is hostile to the defender
# (flanking); a defender gains +2 CS per friendly MILITARY unit adjacent to it
# (support), against melee AND ranged. Integer CS adds, so the combat diff
# quantization survives. Cities/CS/rc-cities are not units — no flanking there.
FLANKING_CS = 2
SUPPORT_CS = 2

# XP & levels (mirrors combat.ts). +5 XP per attack executed (any
# roll-producing melee/ranged vs unit/city/CS/rc), +2 per attack survived as a
# MILITARY defender (incl. city/walls strikes). Barbarians accrue nothing (no
# barb xp plane); civilians never fight. XP_LEVELS grant a flat +5 CS per level
# at every roll the unit fights — an integer add into the CS assembly like the
# flanking terms.
TRADE_ROAD_MAX_STEPS = 32  # the tradeLandReachable/walk safety rail
XP_ATTACK = 5
XP_DEFEND = 2
XP_LEVEL_CS = 5
XP_LEVELS = (15, 45, 90)

# --- ONE INDEX SPACE ---------------------------------------------------------
# A fixture's `civs[]` is SEAT-KEYED — the exporter writes `state.seats` in seat
# order, seat 0 among them, each entry carrying its own absolute `seat` — and
# that id IS the entry's row in every merged plane. City-states (100+) and
# barbarians (200) stay outside the major numbering. There is no second index
# space: the `r + 1` / `c - 1` conversion helpers that used to live here had no
# caller left once every signature took the row, and went with it.
# NB: the `_type_civilian` unit tensor means "unit type is CIVILIAN" and is
# unrelated to any of this.

M32 = 0xFFFFFFFF

_PAIR_DIST_CACHE: dict[tuple[int, int], torch.Tensor] = {}


def pair_distances(width: int, height: int) -> torch.Tensor:
    key = (width, height)
    if key not in _PAIR_DIST_CACHE:
        rows = [hex_distance_from(width, height, i) for i in range(width * height)]
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


def tiles_from_offsets(centers: torch.Tensor, offsets: torch.Tensor, width: int, height: int) -> torch.Tensor:
    col = centers % width
    row = torch.div(centers, width, rounding_mode="floor")
    q = col - ((row - (row & 1)) >> 1)
    tq = q.unsqueeze(1) + offsets[:, 0].unsqueeze(0)
    tr = row.unsqueeze(1) + offsets[:, 1].unsqueeze(0)
    tcol = tq + ((tr - (tr & 1)) >> 1)
    ok = (tcol >= 0) & (tcol < width) & (tr >= 0) & (tr < height)
    idx = tr * width + tcol
    return torch.where(ok, idx, torch.full_like(idx, -1))


PATROL_DIR_PERM = [3, 4, 2, 5, 1, 0]

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
    "rng_state", "centre_slot_at", "tdef", "tmove",
    "next_slot", "camp_tile", "n_camps", "game_over",
    "victory_type", "victory_row", "winner", "space_done",  # space-race chain progress
    "space_ly", "space_lasers",  # the Exoplanet flight (LY travelled, laser stations)
    "district_dead",  # captured districts are paved-but-dead
    "civ_cap_tile",  # capitalTiles — capital identity + the domination anchor
    # `tile_seat` is STATE — the city-state part of tile ownership is stored
    # only here (`citystate_at` is a view of it), so it must round-trip.
    "tile_seat", "tile_city",
    "citystate_last_levy",
    "seat_warkind", "seat_denounced", "seat_allied", "congress_sessions", "congress_active", "era_score", "civ_age", "prev_age", "dedications", "ded_picks", "feat_stripped", "res_stripped", "district_complete", "encamp_hp", "road", "seat_ext", "city_prod_bank",
    "city_dist_tile",
    "seat_routes", "seat_route_exp",  # domestic trade routes (rc-id pairs)
    "seat_route_dseat", "seat_route_dcity",  # international dest (seat row, city id), else -1/-1 (domestic/CS)
    "seat_route_born", "seat_route_walk", "seat_route_leg",  # the Trader's walk (birth turn, tile, leg)
    "city_id",
    "unit_next",
    "gp_earned", "pantheon_claimed_n", "claimed_f_n", "claimed_o_n", "claimed_e_n",
    "pan_claimed", "fol_claimed", "fou_claimed",  # belief-claim masks
    "enh_claimed",  # enhancer-claim mask
    "holy_tile", "city_pressure", "city_followed",  # ONE seat-indexed pressure+followed plane pair
    "antiquity",  # ANTIQUITY SITES (bool tile plane)
    "antiquity_era", "antiquity_seat",  # ...and what a dug Artifact remembers
    "shipwreck", "shipwreck_era", "shipwreck_seat",  # the WATER dig
    "park",  # NATIONAL PARK tiles
    "built_wonder", "built_wonder_complete", "city_wonder",  # world wonders + the per-city registry
    "fertility", "drought", "improvement", "pillaged", "district",
    "district_pillaged",  # raided-dark districts (tile plane, reclaim-safe)
    "d_static_adj",  # mutated when an in-game founding clears the center tile's removable feature
    # The merged unit pool. The BASES are registered, never the `major_`/`barb_`
    # RANGE VIEWS into them — snapshot/restore round-trips one tensor per plane
    # instead of three, and a view can never be half-restored.
    "unit_alive", "unit_type", "unit_tile", "unit_hp", "unit_fortify", "unit_xp", "unit_charges", "unit_aura_mp", "unit_mp", "unit_mp_full", "unit_emb", "unit_seat", "military_at", "civilian_at", "war", "ww", "ww_turn",
    "civ_best_melee", "civ_builders_trained", "civ_civic_prog", "civ_cur_civic", "civ_cur_tech", "civ_diplo_favor", "civ_diplo_points", "civ_envoys_avail", "civ_influence", "civ_tech_prog", "civ_treasury", "civ_techs", "civ_civics", "civ_tech_boosted", "civ_civic_boosted", "civ_tech_retain", "civ_civic_retain",
    "civ_enhancer", "civ_enhancer_done", "civ_follower", "civ_founder", "civ_next_city_id",
    "civ_pantheon", "civ_pantheon_done", "civ_prophets", "civ_religion_done", "civ_tiles_purchased",
    "seat_citystate_met", "seat_citystate_envoys", "seat_citystate_quest", "seat_citystate_quest_camp", "seat_citystate_quest_issued",
    "seat_explored",
    "civ_culture", "civ_faith", "civ_tourism", "civ_warmonger", "civ_gpp",
    "city_alive", "city_center", "city_pop", "city_hp", "city_outer_hp", "city_is_cap", "city_loyalty", "city_acquired", "city_growth", "city_cbox", "city_current", "city_progress", "city_cost", "city_qtile", "city_gw_writing", "city_gw_art", "city_gw_music", "city_relics", "city_artifacts", "city_artifact_era", "city_artifact_seat", "city_bldg",
    "war_turns", "treaty_turns", "peace_turns",
]
