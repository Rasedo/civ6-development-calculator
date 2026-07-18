"""Vectorized (batched) port of the TypeScript engine's economic core.

Phase 3 scope — the multi-city economy of phase 2 driven by an RL-style
macro-action surface instead of a hardwired script. Each turn a policy may
choose, per game: what every idle city produces (a City Center building, a
settler, or idle), which tech to research and which civic to pursue —
validity masks mirror the TS engine's availability rules exactly. Eurekas
are *detected* from state (not replayed from a schedule), because an
off-script trajectory triggers them at different turns. Rewards come from
an exact mirror of empireScore(state, 'balanced').

Passing no actions runs the phase-2 scripted policy (settler-gated capital
+ cheapest-building + cheapest-research), which is what the fixture parity
test exercises. Off-script behaviour is proven by the round trip in
gpu/rollout.py + scripts/replay-gpu.ts: this engine plays random masked
actions and logs them; the real TS engine replays that log and must
reproduce every trace row.

State lives in [B, C, ...] torch tensors (B games × C city slots stepping
in lockstep; a slot is dead until its city is founded). Cities within one
game interact only through the tile-owner map, and the TS engine resolves
border growth in founding order — so everything is batched across B and C
except the border loop, which walks the C slots sequentially (C is tiny).

Every formula mirrors src/core/*.ts; gpu/parity_test.py proves turn-exact
agreement against traces recorded from the real engine
(scripts/export-gpu.ts). float64 on CPU for parity, float32 on CUDA for
throughput.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import torch

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"

# ---------------------------------------------------------------------------
# Hex math (mirrors src/core/hex.ts: pointy-top, odd-r offset)
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
    """[T, 6] neighbor indices (-1 off-map), odd-r offsets."""
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


# ---------------------------------------------------------------------------
# Rules & fixtures
# ---------------------------------------------------------------------------


@dataclass
class Rules:
    focus_base: torch.Tensor  # [6]
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
    center_min_production: float  # C1-B1: rival centers floor production live (player centers ship post-clamp)
    settler_base: float
    settler_per_city: float
    settler_pop_gate: int
    builder_base: float  # P4/D-10: builderCost = round((base + per·n)·speed)
    builder_per: float
    game_speed: float
    gold_purchase_mult: float  # V-P1: gold price = production cost × this (GOLD_PURCHASE_MULT)
    turn_limit: int  # GV-2: game over once turn > this
    civs: dict  # C1-A3: {player: 0, rivalBase: 1} — the unified civ-id space (asserted vs engine constants)
    district_cost: dict  # C1-B4: districtCost params {base: 54, scale: 8} — rivals pay it from THEIR research
    score_pop_weight: float
    score_yield_weights: torch.Tensor  # [6]
    boosts: list  # [{target, idx, kind, ...}] — covered-scope eureka conditions
    combat: dict  # barbarian constants + the JS-computed damage-base table
    units: list  # trainable roster [{id, cost, combat, maintenance, civilian, requiresTech}]
    cs: dict  # city-state constants (envoy cost, influence rate, quest pacing, type→yield)
    rivals: dict  # rival-civ pacing, loyalty, GP costs, belief-pool sizes
    beliefs: dict  # A-7: dense pantheon/follower/founder effect tables (data-file key order = claim-draw order)
    projects: dict  # A-14: {rows: [{d, y, g}], yieldFraction, gppFraction} in data order
    wonders: dict  # A-4: {rows: [{cost, ut, uc, cy, growAll, petra, mult, adjD, adjR}], fpFid} in data order
    improvements: dict  # phase 6a: FARM food/housing, builder roster idx, hillFarms civic
    districts: list  # D1: catalog [{id, idx, cost, adjYield, adjacency, housing, ...}] — inert until placed
    governments: list  # A-7r: [{id, tier, unlockCivic, slots:[m,e,d,w], cityYields[6], capitalYields[6]}] table order
    policies: list  # A-7r: [{id, kind, unlockCivic, cityYields[6], capitalYields[6]}] table order
    governments_live: bool  # A-7r master switch (GOVERNMENTS_ADOPTION_LIVE) — inert until flipped
    district_scaffold: dict  # D2b: {campusIdx, campusUnlockTech}
    shipyard_bidx: int  # building-roster index of SHIPYARD (special: prod = Harbor adjacency), -1 if absent
    ancient_walls_bidx: int  # AUDIT B-1: building-roster index of ANCIENT_WALLS (outer HP + city strike), -1 if absent
    palace_yields: torch.Tensor  # [6]
    palace_housing: float
    palace_amenities: float
    b_cost: torch.Tensor  # [NB]
    b_yields: torch.Tensor  # [NB, 6]
    b_housing: torch.Tensor
    b_amenities: torch.Tensor
    b_maintenance: torch.Tensor
    b_river: torch.Tensor  # bool
    b_unlock: torch.Tensor  # tech index or -1
    b_unlock_civic: torch.Tensor  # civic index or -1 (Temple/Amphitheater/… gate on a civic, not a tech)
    b_req_district: torch.Tensor  # required district idx (-1 = City Center / none)
    b_req_buildings: list  # per building: list of prerequisite building indices (requiresAny)
    t_cost: torch.Tensor  # [NT]
    t_prereqs: list  # list of lists
    c_cost: torch.Tensor
    c_prereqs: list
    war_weariness: dict  # B-15: {perTurn, decay, perAmenity, cap} — flat amenity drag at war
    trade: dict  # A-11: {marketBidx, lighthouseBidx, foreignTradeCidx, capWonderWidx, range} — rival trade capacity/route anchors


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
        builder_base=r["scenario"].get("builderBase", 50),  # P4/D-10
        builder_per=r["scenario"].get("builderPer", 4),
        game_speed=r["scenario"].get("gameSpeed", 0.6),
        gold_purchase_mult=r["scenario"].get("goldPurchaseMult", 4),
        turn_limit=r["scenario"].get("turnLimit", 250),  # TS TURN_LIMIT; the get() is for pre-GV-4 fixtures
        civs=r.get("civs", {"player": 0, "rivalBase": 1}),
        district_cost=r.get("districtCost", {"base": 54, "scale": 8}),
        score_pop_weight=r["score"]["popWeight"],
        score_yield_weights=torch.tensor(r["score"]["yieldWeights"], dtype=torch.float64),
        boosts=r.get("boosts", []),
        combat=r.get("combat", {}),
        units=r.get("units", []),
        cs=r.get("cs", {}),
        rivals=r.get("rivals", {}),
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
        b_cost=torch.tensor([b["cost"] for b in B], dtype=torch.float64),
        b_yields=torch.tensor([b["yields"] for b in B], dtype=torch.float64),
        b_housing=torch.tensor([b["housing"] for b in B], dtype=torch.float64),
        b_amenities=torch.tensor([b["amenities"] for b in B], dtype=torch.float64),
        b_maintenance=torch.tensor([b["maintenance"] for b in B], dtype=torch.float64),
        b_river=torch.tensor([b["river"] for b in B], dtype=torch.bool),
        b_unlock=torch.tensor([b["unlockTech"] for b in B], dtype=torch.long),
        b_unlock_civic=torch.tensor([b.get("unlockCivic", -1) for b in B], dtype=torch.long),
        b_req_district=torch.tensor([b.get("reqDistrict", -1) for b in B], dtype=torch.long),
        b_req_buildings=[b.get("reqBuildings", []) for b in B],
        t_cost=torch.tensor([t["cost"] for t in r["techs"]], dtype=torch.float64),
        t_prereqs=[t["prereqs"] for t in r["techs"]],
        c_cost=torch.tensor([c["cost"] for c in r["civics"]], dtype=torch.float64),
        c_prereqs=[c["prereqs"] for c in r["civics"]],
        war_weariness=r.get("warWeariness", {"perTurn": 1, "decay": 4, "perAmenity": 4, "cap": 24}),
        trade=r.get("trade", {}),
    )


def load_fixture(path: Path) -> dict:
    return json.loads(Path(path).read_text())


# ---------------------------------------------------------------------------
# The batched simulation
# ---------------------------------------------------------------------------

BORDER_LOOPS = 4  # TS expands in a while-loop; 4 covers any realistic culture
RESEARCH_LOOPS = 40  # > tree size: complete all ready techs/civics per turn (TS uses an unbounded while); early-exit keeps it free
U_MAX = 256  # barbarian/rival unit slots per game (append-only; runtime-asserted).
             # Raised 96→256 for horizon-300 (G-S cliff #1): barbs high-water
             # ~160 ever-spawned by t300, rivals ~55. Behavior-preserving at the
             # horizon-100 gate (barb_hi ~33 there, cap never touched; fixtures
             # are TS-exported and don't encode this). Append-only is still a
             # band-aid — true fix = dead-slot reclamation (a future G-S stage,
             # parity-core risk: unit-order-is-spec).
P_MAX = 256  # player unit slots per game (append-only; runtime-asserted)

# AUDIT B-7 flanking & support (mirrors combat.ts). A melee attacker gains +2 CS
# per OTHER unit adjacent to the defender that is hostile to the defender
# (flanking); a defender gains +2 CS per friendly MILITARY unit adjacent to it
# (support), against melee AND ranged. Integer CS adds → the B-29 diff
# quantization survives. Cities/CS/rc-cities are not units — no flanking there.
FLANKING_CS = 2
SUPPORT_CS = 2

# --- one civ-id space (C1-A3, mirrors src/core/civs.ts) -----------------------
# The player is civ 0; rival r (fixture array index == TS rival.id, asserted
# at export) is civ r+1. City-states and barbarians stay outside the
# numbering. Tensor families keep their existing layouts for now — the [B, C]
# city tensors ARE civ 0's seat, and rival tensors' dim-1 index r means civ
# r+1 — until each C1-B stage re-lays its subsystem out per-owner (the
# per-subsystem road chosen in BUILD_PLAN §3 A3). NB: the pre-existing
# `_p_civ` unit tensor means "unit type is CIVILIAN" and is unrelated.
PLAYER_CIV = 0


def civ_of_rival(r: int) -> int:
    return r + 1


def rival_of_civ(c: int) -> int:
    return c - 1
M32 = 0xFFFFFFFF

_PAIR_DIST_CACHE: dict[tuple[int, int], torch.Tensor] = {}


def pair_distances(width: int, height: int) -> torch.Tensor:
    """[T, T] int16 hex distance between every pair of tiles (per map shape)."""
    key = (width, height)
    if key not in _PAIR_DIST_CACHE:
        rows = [hex_distance_from(width, height, i) for i in range(width * height)]
        _PAIR_DIST_CACHE[key] = torch.stack(rows).to(torch.int16)
    return _PAIR_DIST_CACHE[key]


def js_round(x: torch.Tensor) -> torch.Tensor:
    """JS Math.round: half-up toward +∞ (torch.round is half-to-even)."""
    return torch.floor(x + 0.5)


def first_argmax(x: torch.Tensor) -> torch.Tensor:
    """argmax along dim 1 with ties -> LOWEST index. torch.argmax's tie pick
    is UNSPECIFIED (P4 gate catch: an exact player/rival score tie flipped
    the GV-1 leader column between engines); TS scans with strict >."""
    best = x.max(dim=1, keepdim=True).values
    n = x.shape[1]
    ar = torch.arange(n, device=x.device).unsqueeze(0).expand_as(x)
    return torch.where(x == best, ar, torch.full_like(ar, n)).min(dim=1).values


_OFFSETS_CACHE: dict[int, torch.Tensor] = {}


def tiles_within_offsets(radius: int) -> torch.Tensor:
    """[M, 2] axial (dq, dr) offsets in EXACT tilesWithin iteration order —
    several TS scans break ties by that order, so it is part of the parity
    contract (rivalCityYields' equal-sum tile picks, tryFoundCity's
    first-best site, patrol steps)."""
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
    """[N, M] tile indices reached from centers [N] by axial offsets [M, 2]
    (-1 off-map). Mirrors offsetToAxial/axialToOffset arithmetic."""
    col = centers % width
    row = torch.div(centers, width, rounding_mode="floor")
    q = col - ((row - (row & 1)) >> 1)
    tq = q.unsqueeze(1) + offsets[:, 0].unsqueeze(0)
    tr = row.unsqueeze(1) + offsets[:, 1].unsqueeze(0)
    tcol = tq + ((tr - (tr & 1)) >> 1)
    ok = (tcol >= 0) & (tcol < width) & (tr >= 0) & (tr < height)
    idx = tr * width + tcol
    return torch.where(ok, idx, torch.full_like(idx, -1))


# tilesWithin(radius 1) enumerates neighbors in W, SW, NW, SE, NE, E order —
# NOT the riverMask direction order neighbors() uses. Patrol tie-breaks
# follow the former; this permutation maps neigh's columns onto it.
PATROL_DIR_PERM = [3, 4, 2, 5, 1, 0]

# Names of the mutable state tensors (everything reset() restores).
_MUTABLE = [
    "alive", "pop", "food_box", "culture_box", "tiles_acquired", "owner", "workable",
    "buildings", "current", "cur_cost", "progress", "q_dtile", "settlers", "settlers_queued",
    "treasury", "science_total", "culture_total", "techs", "civics",
    "tech_boosted", "civic_boosted", "cur_tech", "cur_civic", "tech_prog", "civic_prog",
    "rng_state", "city_hp", "outer_hp", "center_at", "barb_at", "pmil_at", "pciv_at", "tdef", "tmove",
    "p_acted", "u_acted", "v_acted",
    "p_fortify", "u_fortify", "v_fortify",  # B-5 FORTIFY (military; cap 2)
    "u_alive", "u_type", "u_tile", "u_hp", "next_slot", "camp_tile", "n_camps", "game_over",
    "victory_type", "winner", "space_done",  # B-25 (Round B3): space-race chain progress
    "p_alive", "p_type", "p_tile", "p_hp", "p_next", "warrior_trained", "builder_trained",
    "builders_trained", "r_builders_trained",  # P4/D-10 cost escalators
    "best_melee", "r_best_melee",  # P4/D-22 city-defense trackers
    "district_dead",  # P5/S1: captured districts are paved-but-dead
    "site", "center_yields", "center_raw_food", "base_maintenance", "water_housing", "coastal", "river_center", "dist",
    "next_site_ptr", "founded_n", "loyalty", "city_seq", "city_seq_next",  # P5/S3: TS array-order rank per column
    "is_cap", "cap_tile_player",  # P7 (C-1): capital identity + the domination anchor
    "cs_met", "cs_envoys", "cs_pop", "cs_quest", "cs_quest_camp", "cs_quest_issued", "cs_quest_district", "cs_hp", "cs_alive", "cs_at",
    "influence", "envoys_avail",
    "rival_at", "rc_tile_id", "rvcity_at", "rv_at",  # A-17: rc_tile_id = per-rc tile registry (rc_id-keyed)
    "r_atwar", "r_warturns", "r_peaceturns", "war_weariness", "r_war_weariness", "r_treasury", "feat_stripped", "res_stripped", "district_complete", "controlled", "r_techs", "r_civics", "prod_bank",
    "r_cur_tech", "r_cur_civic", "r_tech_prog", "r_civic_prog", "rc_current", "rc_progress", "rc_cost", "rc_qtile", "rc_dist_tile", "rc_bldg",
    "r_pantheon_done", "r_religion_done", "r_next_city_id", "r_gpp", "r_faith", "r_prophets", "rvciv_at", "v_charges",
    "r_routes",  # A-11: rival domestic trade routes (rc-id pairs)
    "cs_r_envoys", "cs_r_met", "r_influence", "r_envoys_avail",  # A-12: rival↔CS diplomacy
    "r_tech_boosted", "r_civic_boosted",  # A-3: rival eurekas/inspirations
    "rc_alive", "rc_center", "rc_pop", "rc_growth", "rc_cbox", "rc_loyalty", "rc_acquired", "rc_hp", "rc_outer_hp", "rc_id",
    "rc_is_cap", "cap_tile_rival",  # P7-FULL (C-3): rc.isCapital + capitalTiles[r+1] — explicit, compaction-safe
    "v_alive", "v_civ", "v_type", "v_tile", "v_hp", "v_next",
    "gp_earned", "player_gp_points", "player_faith", "pantheon_claimed_n", "claimed_f_n", "claimed_o_n", "claimed_e_n",
    "pan_claimed", "fol_claimed", "fou_claimed", "r_pantheon", "r_follower", "r_founder",  # A-7: belief identity
    "enh_claimed", "r_enhancer", "r_enhancer_done",  # B-18: enhancer race
    "holy_tile", "city_pressure", "city_followed", "rc_pressure", "rc_followed",  # B-18: pressure spread
    "built_wonder", "built_wonder_complete", "rc_wonder",  # A-4: rival world wonders
    "fertility", "drought", "improvement", "pillaged", "p_charges", "district", "dscaffold_placed",
    "d_static_adj",  # mutated when an in-game founding clears the center tile's removable feature
]


class BatchSim:
    """B games × C city slots stepping in lockstep. Build from fixtures
    (parity) or by replicating one fixture B times (benchmark/training).

    `boosts` mode: 'detect' evaluates eureka conditions from state each
    turn (required for off-script play); 'schedule' replays the turns the
    exporter recorded (debug aid for isolating detection bugs).
    """

    def __init__(self, fixtures: list[dict], rules: Rules, device: str = "cpu", dtype=torch.float64, boosts: str = "detect"):
        self.rules = rules
        self.device = device
        self.dtype = dtype
        self.boost_mode = boosts
        B = len(fixtures)
        f0 = fixtures[0]
        self.B, self.W, self.H = B, f0["width"], f0["height"]
        T = self.W * self.H
        self.T = T
        C = len(f0["cities"])
        assert all(len(f["cities"]) == C for f in fixtures), "fixtures must share a city-slot count"
        self.C = C

        def ften(getter, shape_tail=()):
            return torch.tensor([getter(f) for f in fixtures], dtype=dtype, device=device).reshape(B, *shape_tail)

        # --- static map -------------------------------------------------------
        self.tile_yields = ften(lambda f: [t["y"] for t in f["tiles"]], (T, 6))
        self.workable = torch.tensor([[t["workable"] for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.res_priority = torch.tensor([[t["res"] for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.wonder_near = torch.tensor([[t.get("wnear", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.coastal_land = torch.tensor([[t.get("cl", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)  # A-3: isCoastalLand (rc coastalCity eurekas)
        self.passable = torch.tensor([[t["pass"] for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # C1-B1: citizen-workability (= !isImpassable — water IS workable,
        # unlike unit passability). Defaults to `pass` for pre-B1 fixtures.
        self.work_ok = torch.tensor([[t.get("work", t["pass"]) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # Luxury amenity source (mirrors luxuryAmenities; C1-B1 gate catch):
        # per tile, the luxury's catalog index (-1 none) and the improvement
        # index that activates it (-9 = outside the GPU roster, never matches).
        self.lux_id = torch.tensor([[t.get("lux", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.lux_req = torch.tensor([[t.get("luxreq", -9) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self._n_lux = int(self.lux_id.max().item()) + 1 if int(self.lux_id.max().item()) >= 0 else 0
        self._lux_k = int((rules.improvements or {}).get("luxAmenityCities", 4))
        self.camp_ok = torch.tensor([[t["camp"] for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.neigh = neighbor_table(self.W, self.H).to(device)  # [T, 6]
        self.pair_dist = pair_distances(self.W, self.H).to(device)  # [T, T] int16

        # --- the candidate-site table (static) and per-slot city data (dynamic:
        # a slot binds to a site when a settler founds there — planned sites
        # can be DROPPED when the world invalidates them, exactly like the
        # plannedSettles loop skips a failed canFoundCity without consuming
        # the settler) ---------------------------------------------------------
        self.KS = C  # candidate sites; slot 0's site is the pre-founded capital
        self.site_tile = torch.tensor([[c["site"] for c in f["cities"]] for f in fixtures], dtype=torch.long, device=device)
        self.site_cy = ften(lambda f: [c["centerYields"] for c in f["cities"]], (C, 6))
        self.site_raw_food = ften(lambda f: [c.get("rawFood", 2) for c in f["cities"]], (C,))
        self.site_maint = ften(lambda f: [c["baseMaintenance"] for c in f["cities"]], (C,))
        water = [
            [
                rules.housing_fresh if c["freshWater"] else rules.housing_coastal if c["coastal"] else rules.housing_none
                for c in f["cities"]
            ]
            for f in fixtures
        ]
        self.site_water = torch.tensor(water, dtype=dtype, device=device)
        self.site_coastal = torch.tensor([[bool(c["coastal"]) for c in f["cities"]] for f in fixtures], dtype=torch.bool, device=device)
        self.site_river = torch.tensor(
            [[bool(c["riverAtCenter"]) for c in f["cities"]] for f in fixtures], dtype=torch.bool, device=device
        )

        self.site = torch.full((B, C), -1, dtype=torch.long, device=device)
        self.center_yields = torch.zeros(B, C, 6, dtype=dtype, device=device)
        self.center_raw_food = torch.zeros(B, C, dtype=dtype, device=device)
        self.base_maintenance = torch.zeros(B, C, dtype=dtype, device=device)
        self.water_housing = torch.zeros(B, C, dtype=dtype, device=device)
        self.coastal = torch.zeros(B, C, dtype=torch.bool, device=device)
        self.river_center = torch.zeros(B, C, dtype=torch.bool, device=device)
        self.dist = torch.full((B, C, T), 127, dtype=torch.int16, device=device)
        self.next_site_ptr = torch.ones(B, dtype=torch.long, device=device)  # site 0 = the capital, consumed
        self.founded_n = torch.ones(B, dtype=torch.long, device=device)  # monotonic: flips never free a slot
        # P5/S3 gate-catch (seed 9066 t184): TS iterates state.cities in
        # ARRAY order (acquisition order), which stops matching column order
        # once an S2 hole-reuse founding lands a NEW city in a LOW column.
        # city_seq[b, c] ranks column c by acquisition; every order-coupled
        # mirror of the TS city loop (loyalty's grown/not-grown pop mix)
        # must compare seq, not column index. P7-FULL (C-2): the city WALK
        # and empire_score now iterate seq rank too (per-batch column
        # gathers), so border-claim/worked-tile couplings and the score's
        # float association are TS-ordered even after hole reuse.
        self.city_seq = torch.zeros(B, C, dtype=torch.long, device=device)  # capital = seq 0
        self.city_seq_next = torch.ones(B, dtype=torch.long, device=device)
        # P7 (C-1): the capital is an IDENTITY, not column 0 — TS isCapital
        # + capitalTiles[0] (which UPDATES when a total-collapse refound
        # crowns a new capital). A captured capital's hole-reused column
        # must not pin loyalty / carry the Palace / anchor domination.
        # (P7-FULL: the rc side carries the same identity — rc_is_cap +
        # cap_tile_rival — because _reclaim_rc compaction retires the old
        # "slot 0 ≡ rc capital" invariant.)
        self.is_cap = torch.zeros(B, C, dtype=torch.bool, device=device)
        self.is_cap[:, 0] = True
        import os as _os
        self._reclaim_at = int(_os.environ.get("CIV6_RECLAIM_AT", U_MAX - 24))
        self.site[:, 0] = self.site_tile[:, 0]
        self.cap_tile_player = self.site[:, 0].clone()  # P7 (C-1): capitalTiles[0] — after the capital site lands
        self.center_yields[:, 0] = self.site_cy[:, 0]
        self.center_raw_food[:, 0] = self.site_raw_food[:, 0]
        self.base_maintenance[:, 0] = self.site_maint[:, 0]
        self.water_housing[:, 0] = self.site_water[:, 0]
        self.coastal[:, 0] = self.site_coastal[:, 0]
        self.river_center[:, 0] = self.site_river[:, 0]
        self.dist[:, 0] = torch.stack([hex_distance_from(self.W, self.H, f["cities"][0]["site"]) for f in fixtures]).to(
            device=device, dtype=torch.int16
        )

        # --- city-states (phase 4c): static minors placed at game creation ----
        self.S = int(f0.get("csMax", 0))
        s_pad = max(self.S, 1)
        self.cs_alive = torch.zeros(B, s_pad, dtype=torch.bool, device=device)
        self.cs_type = torch.zeros(B, s_pad, dtype=torch.long, device=device)
        self.cs_center = torch.zeros(B, s_pad, dtype=torch.long, device=device)
        self.cs_pop = torch.zeros(B, s_pad, dtype=torch.long, device=device)
        for b, f in enumerate(fixtures):
            for s, cs in enumerate(f.get("cityStates", [])):
                self.cs_alive[b, s] = True
                self.cs_type[b, s] = cs["type"]
                self.cs_center[b, s] = cs["center"]
                self.cs_pop[b, s] = cs["pop"]
        self.cs_at = torch.tensor([[t.get("cs", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.cs_met = torch.zeros(B, s_pad, dtype=torch.bool, device=device)
        self.cs_envoys = torch.zeros(B, s_pad, dtype=torch.long, device=device)
        self.cs_quest = torch.zeros(B, s_pad, dtype=torch.long, device=device)  # 0 none / 1 clearCamp / 2 trade / 3 district
        self.cs_quest_camp = torch.full((B, s_pad), -1, dtype=torch.long, device=device)
        self.cs_quest_issued = torch.zeros(B, s_pad, dtype=torch.long, device=device)
        self.cs_quest_district = torch.full((B, s_pad), -1, dtype=torch.long, device=device)  # askable idx of a buildDistrict quest (0=CAMPUS)
        # V-CS: siege hit points (attackCityState) — TS `cs.hp ?? CS_MAX_HP`.
        self.cs_hp = torch.full((B, s_pad), int(rules.cs.get("maxHp", 150)), dtype=torch.long, device=device)
        self.influence = torch.zeros(B, dtype=dtype, device=device)
        self.envoys_avail = torch.zeros(B, dtype=torch.long, device=device)
        cs_yidx = rules.cs.get("typeYieldIdx", [3, 4, 2, 1, 1, 5])
        self._cs_yidx = torch.tensor(cs_yidx, dtype=torch.long, device=device)[self.cs_type.clamp(min=0)]  # [B, S]
        cs_didx = rules.cs.get("typeDistrictIdx", [0, 2, 3, 5, 6, 1])  # CS type -> district idx (Campus/Theater/CommHub/IZ/Encampment/HolySite)
        self._cs_didx = torch.tensor(cs_didx, dtype=torch.long, device=device)[self.cs_type.clamp(min=0)]  # [B, S] district each CS boosts at 3/6 envoys
        self._cs_district_bonus = float(rules.cs.get("districtBonus", 2))  # per-district amount at each of the 3-/6-envoy thresholds
        self.loyalty = torch.full((B, C), 100.0, dtype=dtype, device=device)

        # --- rival civs (phase 4c) ---------------------------------------------
        rr = rules.rivals
        n_gp = len(rr.get("gpClassDistrict", [])) or 5  # GP class count (7: Scientist..General; was truncated to 5)
        self.R = int(f0.get("rMax", 0))
        # C1-A3: seats. Civ 0 = the player ([B, C] tensors); civ r+1 = rival
        # index r. O becomes a real tensor axis per-subsystem in the C1-B
        # stages; until then it is metadata for the seat convention.
        self.O = 1 + self.R
        cv = rules.civs or {}
        assert int(cv.get("player", PLAYER_CIV)) == PLAYER_CIV and int(cv.get("rivalBase", 1)) == 1, (
            "fixture civ numbering disagrees with engine constants (civs.ts drift?)"
        )
        self.RC = 24  # rival city slots per civ (settling caps at maxCities; loyalty flips can exceed — a strong Harbor-fed rival accumulates many by t300; bumped 10->24, empty slots are rc_alive=False so inert)
        # P7-FULL (C-3): rc slots append at last-alive+1 (order-preserving),
        # so churn can exhaust the space while holes sit below — compact at
        # the step end once the high-water nears the cap (forced low for
        # validation gates via CIV6_RC_RECLAIM_AT).
        self._rc_reclaim_at = int(_os.environ.get("CIV6_RC_RECLAIM_AT", self.RC - 8))
        r_pad, rc_pad = max(self.R, 1), self.RC
        self.rival_at = torch.tensor([[t.get("rv", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # AUDIT A-17: per-rc tile registry — the owning rival CITY as its
        # persistent rc_id (per-civ ids, meaningful only where rival_at>=0).
        # Keyed on the ID, not the slot, so _reclaim_rc compaction needs no
        # tile-plane remap (ids survive the slot permutation; rc_id rides it).
        self.rc_tile_id = torch.tensor([[t.get("rci", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.water = torch.tensor([[t.get("wt", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.nwonder = torch.tensor([[t.get("nw", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.fresh_water = torch.tensor([[t.get("fw", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.settle_ok = torch.tensor([[t.get("st", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.site_q3 = torch.tensor(
            [[t.get("sq", [0.0, 0.0, 0.0]) for t in f["tiles"]] for f in fixtures], dtype=torch.float64, device=device
        )  # [B, T, 3] per-source contributions, added separately like siteQuality
        self.hills = torch.tensor([[t.get("hl", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # AUDIT A-8: river-edge crossing bits, riverMask verbatim — the neigh
        # columns enumerate AXIAL_DIRS order (E NE NW W SW SE), the same
        # order the mask's bits use: bit d = crossing toward neigh column d.
        self.river_mask = torch.tensor([[int(t.get("rm", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.r_alive = torch.zeros(B, r_pad, dtype=torch.bool, device=device)  # static: placed at creation
        self.r_aggression = torch.zeros(B, r_pad, dtype=torch.float64, device=device)
        self.r_atwar = torch.zeros(B, r_pad, dtype=torch.bool, device=device)
        self.r_warturns = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        # B-15: war-weariness accumulators (integer turn counters), player + per rival
        self.war_weariness = torch.zeros(B, dtype=torch.long, device=device)
        self.r_war_weariness = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        self.r_treasury = torch.tensor(
            [[float((rv.get("treasury") or 0)) for rv in (f.get("rivals") or [])[:r_pad]] + [0.0] * max(r_pad - len(f.get("rivals") or []), 0) for f in fixtures],
            dtype=torch.float64, device=device,
        ) if r_pad > 0 else torch.zeros(B, 0, dtype=torch.float64, device=device)  # VP-G1
        self.r_peaceturns = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        # C1-B2: per-city production queues replace the pooled stocks.
        # rc_current: -1 idle, 0 settler, 1+u trains roster unit u.
        self.rc_current = torch.full((B, r_pad, rc_pad), -1, dtype=torch.long, device=device)
        self.rc_progress = torch.zeros(B, r_pad, rc_pad, dtype=torch.float64, device=device)
        self.rc_cost = torch.zeros(B, r_pad, rc_pad, dtype=torch.float64, device=device)
        # C1-B3a: real per-rival research trees — the SAME tech/civic tables
        # as the player, cheapest-first at raw cost; researched techs feed
        # the consumers (production divisor, city defense, unit gates).
        nt_b3, nc_b3 = len(rules.t_cost), len(rules.c_cost)
        self.r_techs = torch.zeros(B, r_pad, nt_b3, dtype=torch.bool, device=device)
        self.r_civics = torch.zeros(B, r_pad, nc_b3, dtype=torch.bool, device=device)
        # AUDIT A-3: rivals fire eurekas/inspirations too (detectRivalBoosts)
        self.r_tech_boosted = torch.zeros(B, r_pad, nt_b3, dtype=torch.bool, device=device)
        self.r_civic_boosted = torch.zeros(B, r_pad, nc_b3, dtype=torch.bool, device=device)
        self.r_cur_tech = torch.full((B, r_pad), -1, dtype=torch.long, device=device)
        self.r_cur_civic = torch.full((B, r_pad), -1, dtype=torch.long, device=device)
        self.r_tech_prog = torch.zeros(B, r_pad, dtype=torch.float64, device=device)
        self.r_civic_prog = torch.zeros(B, r_pad, dtype=torch.float64, device=device)
        # C2b: net-controlled rival seats — the scripted PICKER, research
        # auto-pick and unit AI skip these rivals; externally written
        # choices (rc_current, r_cur_*) are honored by the existing
        # mechanics. Empty by default = bit-inert.
        self.controlled = torch.zeros(B, r_pad, dtype=torch.bool, device=device)
        # C1-B4: rival districts — the in-flight queued tile per city (the
        # completion target) and the per-city registry [.., nD] of placed
        # district tiles (one per type; queued counts for cap/one-per-type,
        # exactly like city.districts in TS).
        nd_b4 = max(len(rules.districts or []), 1)
        self.rc_qtile = torch.full((B, r_pad, rc_pad), -1, dtype=torch.long, device=device)
        self.rc_dist_tile = torch.full((B, r_pad, rc_pad, nd_b4), -1, dtype=torch.long, device=device)
        # C1-B4b-2: per-city built-buildings registry (queue codes above
        # NU + nScaffold complete into it)
        self.rc_bldg = torch.zeros(B, r_pad, rc_pad, max(len(rules.b_cost), 1), dtype=torch.bool, device=device)
        self.r_pantheon_done = torch.zeros(B, r_pad, dtype=torch.bool, device=device)
        self.r_religion_done = torch.zeros(B, r_pad, dtype=torch.bool, device=device)
        self.r_faith = torch.zeros(B, r_pad, dtype=torch.float64, device=device)  # P5/S5 (C-17): the pantheon's funding
        self.r_prophets = torch.zeros(B, r_pad, dtype=torch.long, device=device)  # P5/S5 (C-16): religion gate
        self.r_next_city_id = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        self.r_gpp = torch.zeros(B, r_pad, n_gp, dtype=torch.float64, device=device)
        # P4/D-10: builders ever trained — the player's and each rival's own
        # cost escalator (builderCost = round((50 + 4·n) · gameSpeed)).
        self.builders_trained = torch.zeros(B, dtype=torch.long, device=device)
        self.r_builders_trained = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        # P4/D-22: strongest MELEE unit each civ ever fielded (city defense).
        self.best_melee = torch.zeros(B, dtype=torch.long, device=device)
        self.r_best_melee = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        # P5/S1 gate-catch: districts on CAPTURED territory are DEAD — TS
        # keeps the tiles paved but the conquering city's registry holds only
        # CITY_CENTER (no yields/upkeep/counts; the paving still blocks).
        self.district_dead = torch.zeros(B, T, dtype=torch.bool, device=device)
        self.rc_alive = torch.zeros(B, r_pad, rc_pad, dtype=torch.bool, device=device)
        self.rc_center = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        self.rc_pop = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        self.rc_growth = torch.zeros(B, r_pad, rc_pad, dtype=torch.float64, device=device)
        self.rc_cbox = torch.zeros(B, r_pad, rc_pad, dtype=torch.float64, device=device)  # P5/S4: rc.cultureBox
        self.rc_loyalty = torch.full((B, r_pad, rc_pad), 100.0, dtype=torch.float64, device=device)  # P5/S6 (C-19)
        self.rc_acquired = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        self.rc_hp = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        self.rc_outer_hp = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)  # AUDIT B-1: ANCIENT_WALLS outer pool
        self.rc_id = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        # P7-FULL (C-3): rc.isCapital as identity (TS find(isCapital)) — the
        # old "slot 0 ≡ capital" invariant dies with _reclaim_rc compaction.
        self.rc_is_cap = torch.zeros(B, r_pad, rc_pad, dtype=torch.bool, device=device)
        # capitalTiles[r+1] — static like TS's (game.ts:234): only an
        # isCapital founding (t0 or a total-collapse refound) writes it.
        self.cap_tile_rival = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        # AUDIT A-11: domestic trade routes per civ — (from_id, to_id) rc-id
        # pairs, -1 = empty column. Id-keyed like rc_tile_id, so _reclaim_rc
        # slot permutations never touch it; K=10 > the max capacity
        # (FOREIGN_TRADE 1 + maxCities 6 + 2 wonders). t0 fixtures carry no
        # routes (single-city civs), so no fixture field is needed.
        self.r_routes = torch.full((B, r_pad, 10, 2), -1, dtype=torch.long, device=device)
        # AUDIT A-12: rival↔CS diplomacy — per-rival envoys/met planes plus
        # the influence/envoy-bank accumulators (the player twins). t0
        # fixtures carry none of it (rivals start unmet, zero everywhere).
        self.cs_r_envoys = torch.zeros(B, r_pad, s_pad, dtype=torch.long, device=device)
        self.cs_r_met = torch.zeros(B, r_pad, s_pad, dtype=torch.bool, device=device)
        self.r_influence = torch.zeros(B, r_pad, dtype=torch.float64, device=device)
        self.r_envoys_avail = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        self.rvcity_at = torch.full((B, T), -1, dtype=torch.long, device=device)  # civ id at rival centers
        self.v_alive = torch.zeros(B, U_MAX, dtype=torch.bool, device=device)  # rival units, spawn order
        self.v_acted = torch.zeros(B, U_MAX, dtype=torch.bool, device=device)  # P4/D-2: spent MP since the last refresh (blocks healing)
        self.v_civ = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.v_type = torch.zeros(B, U_MAX, dtype=torch.long, device=device)  # roster index
        self.v_tile = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.v_hp = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.v_fortify = torch.zeros(B, U_MAX, dtype=torch.long, device=device)  # B-5: fortifyTurns (military; cap 2)
        self.v_next = torch.zeros(B, dtype=torch.long, device=device)
        self.rv_at = torch.full((B, T), -1, dtype=torch.long, device=device)  # rival-unit slot at tile
        # C1-B5a: rival CIVILIAN occupancy (slot at tile; civ via v_civ) and
        # per-slot build charges — inert until B5b spawns the first builder.
        self.rvciv_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.v_charges = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.gp_earned = torch.zeros(B, n_gp, dtype=torch.long, device=device)
        self.pantheon_claimed_n = torch.zeros(B, dtype=torch.long, device=device)
        self.claimed_f_n = torch.zeros(B, dtype=torch.long, device=device)
        self.claimed_o_n = torch.zeros(B, dtype=torch.long, device=device)
        self.claimed_e_n = torch.zeros(B, dtype=torch.long, device=device)  # B-18: enhancer race
        # A-7: belief IDENTITY — per-id pool masks + per-civ claimed ids (the
        # counts above stay as gate mirrors; masks and counts move together).
        # Ids are -1 until claimed; effects gather rows id+1 from tables whose
        # row 0 is the neutral pad (zeros for adds, ones for multipliers).
        _bl = rules.beliefs or {}
        self.pan_claimed = torch.zeros(B, max(len(_bl.get("pantheons", [])), 1), dtype=torch.bool, device=device)
        self.fol_claimed = torch.zeros(B, max(len(_bl.get("followers", [])), 1), dtype=torch.bool, device=device)
        self.fou_claimed = torch.zeros(B, max(len(_bl.get("founders", [])), 1), dtype=torch.bool, device=device)
        # B-18: enhancer pool mask + per-civ claimed identity + a done flag
        # (mirror of fol_claimed / r_follower / r_religion_done). Effects stay
        # unwired (all enhancers inert), so no _bel["enh"] table is built — the
        # identity is kept for when a non-inert enhancer lands.
        self.enh_claimed = torch.zeros(B, max(len(_bl.get("enhancers", [])), 1), dtype=torch.bool, device=device)
        self._enh_any = len(_bl.get("enhancers", [])) > 0
        self.r_pantheon = torch.full((B, r_pad), -1, dtype=torch.long, device=device)
        self.r_follower = torch.full((B, r_pad), -1, dtype=torch.long, device=device)
        self.r_founder = torch.full((B, r_pad), -1, dtype=torch.long, device=device)
        self.r_enhancer = torch.full((B, r_pad), -1, dtype=torch.long, device=device)  # B-18
        self.r_enhancer_done = torch.zeros(B, r_pad, dtype=torch.bool, device=device)  # B-18
        # B-18 religious pressure spread (INERT: not read by yields/trace yet).
        # Religions indexed in the unified civ space: 0 = player, i+1 = rival i.
        # holy_tile[:, g] = religion g's frozen holy tile (its founding capital
        # center) or -1. Per-city integer pressure accumulators + the followed
        # religion id (-1 = none), for player cities [B,C] and rival cities
        # [B,r_pad,rc_pad]. Dead/absent slots are zeroed each turn (KILL hygiene,
        # mirroring the TS fresh-object reset on founding/flip).
        self._O = self.O  # 1 + R
        self._pressure_range = int(rr.get("pressureRange", 10))  # B-18: holy-city spread radius
        # B-18 (slice U): pressure->yields coupling. LIVE => a city's FOLLOWER-
        # belief yields key on its followedReligion (city_followed / rc_followed);
        # INERT => the OWNER civ's religion (byte-identical to the per-civ apply).
        self._b18_couple = bool(rr.get("followerCoupling", False))
        self.holy_tile = torch.full((B, self._O), -1, dtype=torch.long, device=device)
        self.city_pressure = torch.zeros(B, C, self._O, dtype=torch.long, device=device)
        self.city_followed = torch.full((B, C), -1, dtype=torch.long, device=device)
        self.rc_pressure = torch.zeros(B, r_pad, rc_pad, self._O, dtype=torch.long, device=device)
        self.rc_followed = torch.full((B, r_pad, rc_pad), -1, dtype=torch.long, device=device)
        self._bel = {}
        for _pool, _rows in (("pan", _bl.get("pantheons", [])), ("fol", _bl.get("followers", [])), ("fou", _bl.get("founders", []))):
            _nf = len(_rows[0]["featY"]) if _rows else 1
            _nb = len(_rows[0]["bldgY"]) if _rows else 1
            _ng = len(_rows[0]["gpp"]) if _rows else 1
            _ni = len(_rows[0]["impY"]) if _rows and "impY" in _rows[0] else 1  # A-13
            self._bel[_pool] = {
                "featY": torch.tensor([[[0.0] * 6] * _nf] + [x["featY"] for x in _rows], dtype=torch.float64, device=device),
                "bldgY": torch.tensor([[[0.0] * 6] * _nb] + [x["bldgY"] for x in _rows], dtype=torch.float64, device=device),
                "bldgH": torch.tensor([[0.0] * _nb] + [x["bldgH"] for x in _rows], dtype=torch.float64, device=device),
                "border": torch.tensor([1.0] + [x["border"] for x in _rows], dtype=torch.float64, device=device),
                "growth": torch.tensor([1.0] + [x["growth"] for x in _rows], dtype=torch.float64, device=device),
                "gpp": torch.tensor([[0] * _ng] + [x["gpp"] for x in _rows], dtype=torch.long, device=device),
                "we": torch.tensor([0.0] + [float(x["we"]) for x in _rows], dtype=torch.float64, device=device),
                "river": torch.tensor([[0.0, 0.0]] + [x["river"] for x in _rows], dtype=torch.float64, device=device),
                "zen": torch.tensor([[0.0, 0.0]] + [x["zen"] for x in _rows], dtype=torch.float64, device=device),
                "perF": torch.tensor([[0.0] * 7] + [x["perF"] for x in _rows], dtype=torch.float64, device=device),
                "perC": torch.tensor([[0.0] * 6] + [x["perC"] for x in _rows], dtype=torch.float64, device=device),
                "impRes": torch.tensor([[[0.0] * 6] * 4] + [x.get("impRes", [[0.0] * 6] * 4) for x in _rows], dtype=torch.float64, device=device),
                "fpw": torch.tensor([0.0] + [float(x.get("fpw", 0)) for x in _rows], dtype=torch.float64, device=device),  # A-4 activates
                # A-13 activates improvementYields ([nBel+1, nImp, 6], row 0
                # = the unclaimed pad): PASTURE/CAMP/QUARRY/PLANTATION are
                # buildable now (the FISHING_BOATS row never exports).
                "impY": torch.tensor(
                    [[[0.0] * 6] * _ni] + [x.get("impY", [[0.0] * 6] * _ni) for x in _rows],
                    dtype=torch.float64, device=device,
                ),
            }
        self._bel_any = any(len(_bl.get(k, [])) > 0 for k in ("pantheons", "followers", "founders"))
        # A-14: rival projects — rows {d: district idx, y: yield col, g: GP class}
        _pj = rules.projects or {}
        self._proj_rows = list(_pj.get("rows", []))
        self._proj_yf = float(_pj.get("yieldFraction", 0.75))
        self._proj_gf = float(_pj.get("gppFraction", 0.3))
        # B-25 (Round B3, Slice W): the space-race chain. Space rows carry
        # sp/vic flags (+ rt tech gate, rp previous-step link) and sit LAST in
        # the projects table (chain order). The rival greedy pick resolves to a
        # base project first and the scripted player never queues projects, so
        # the chain is inert in-gate (gate-unreachable at 250t). space_proj_idx
        # = projects-table rows that are space steps; space_step maps a row idx
        # to its 0-based position in the chain; space_victory_idx = the winning
        # step(s). Mirrors data/projects.ts SPACE_PROJECTS + completeProject.
        self._space_proj_idx = [i for i, row in enumerate(self._proj_rows) if int(row.get("sp", 0))]
        self._n_space = len(self._space_proj_idx)
        self._space_step = {pi: k for k, pi in enumerate(self._space_proj_idx)}
        self._space_victory_idx = {i for i in self._space_proj_idx if int(self._proj_rows[i].get("vic", 0))}
        # A-4: rival world wonders — the tile planes (built_wonder id at a
        # paved tile, its completion flag), the per-rc registry, the static
        # placement bitmask + rid/des planes, and the effect tables.
        _wd = rules.wonders or {}
        self._wond_rows = list(_wd.get("rows", []))
        self._wond_n = len(self._wond_rows)
        self._fp_fid = int(_wd.get("fpFid", -1))
        self.built_wonder = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.built_wonder_complete = torch.zeros(B, T, dtype=torch.bool, device=device)
        self.rc_wonder = torch.full((B, r_pad, rc_pad, max(self._wond_n, 1)), -1, dtype=torch.long, device=device)
        self.res_id = torch.tensor([[t.get("rid", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.desert = torch.tensor([[t.get("des", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.wok = torch.tensor([[t.get("wok", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        if self._wond_n:
            self._wond_cy = torch.tensor([w["cy"] for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW, 6]
            self._wond_mult = torch.tensor([w["mult"] for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW, 6]
            self._wond_grow = torch.tensor([w["growAll"] for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW]
            self._wond_petra = torch.tensor([bool(w.get("petra", 0)) for w in self._wond_rows], dtype=torch.bool, device=device)  # [nW]
        self.feat_id = torch.tensor([[t.get("fid", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # A-13 off-script gate catch (rng 2026006108 t81): foundCity strips
        # ONLY a REMOVABLE feature — an OASIS/FLOODPLAINS center keeps its
        # feature LIVE (belief featureYields still apply there). Founding
        # paths gate their feat_stripped/tdef writes on this bit.
        self.feat_removable = torch.tensor([[bool(t.get("frm", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        for b, f in enumerate(fixtures):
            for r_ in f.get("rivals", []):
                rid = r_["id"]
                self.r_alive[b, rid] = True
                self.r_aggression[b, rid] = r_["aggression"]
                for j, rc in enumerate(r_["cities"]):
                    self.rc_alive[b, rid, j] = True
                    self.rc_center[b, rid, j] = rc["center"]
                    self.rc_pop[b, rid, j] = rc["pop"]
                    self.rc_hp[b, rid, j] = rr.get("cityMaxHp", 200)
                    self.rc_id[b, rid, j] = rc["id"]
                    self.rvcity_at[b, rc["center"]] = rid
                    if j == 0:  # the fixture's first city is the founded capital
                        self.rc_is_cap[b, rid, 0] = True
                        self.cap_tile_rival[b, rid] = rc["center"]
                self.r_next_city_id[b, rid] = len(r_["cities"])
                for u_ in r_["units"]:
                    v = int(self.v_next[b])
                    self.v_alive[b, v] = True
                    self.v_civ[b, v] = rid
                    self.v_type[b, v] = u_["type"]
                    self.v_tile[b, v] = u_["tile"]
                    self.v_hp[b, v] = rules.combat.get("unitHp", 100)
                    self.rv_at[b, u_["tile"]] = v
                    self.v_next[b] += 1
        self._gp_costs = torch.tensor(rr.get("gpCosts", [60 * 2**n for n in range(8)]), dtype=torch.float64, device=device)
        self._gp_roster = torch.tensor(rr.get("gpRoster", [4, 4, 4, 4, 4]), dtype=torch.long, device=device)
        # Player great people (advanceGreatPeople): points accrue per class from
        # its district + that district's buildings; earning the n-th person costs
        # gp_costs[n] and applies gp_effects[cls, n]. Draws from the SAME gp_earned
        # pool as the rival race (which claims first each turn). Only the 5 raced
        # classes (0-4) matter; the player's reachable ones are Scientist(0),
        # Merchant(2), Prophet(3) — the rest have unplaceable districts.
        gp_cd = rr.get("gpClassDistrict", [])
        self._gp_class_district = torch.tensor(gp_cd if gp_cd else [-1] * n_gp, dtype=torch.long, device=device)  # [n_gp] all 7 classes
        gp_fx = rr.get("gpEffects", [])
        self._gp_effects = torch.tensor(gp_fx if gp_fx else [[[0, 0, 0, 0, 0]] * 4] * n_gp, dtype=dtype, device=device)  # [n_gp, maxN, 5] (P5/S5: col 4 = faith)
        self._prophet_cls = int(rr.get("prophetCls", 3))  # P5/S5: PROPHET's class index
        self._gp_nc = int(self._gp_class_district.numel())
        self.player_gp_points = torch.zeros(B, self._gp_nc, dtype=dtype, device=device)
        # G-2: the player's faith bank. TS applyGreatPersonEffect banks fx.faith
        # into state.faithTotal (game.ts); the rival GP loop already applies its
        # gpEffects col-4 into r_faith, but the player GP loop did not — an
        # earned Prophet banked faith in TS, not on the GPU. This mirrors that.
        # Not a parity-compared column (player faith has no in-gate consumer —
        # worship/pantheon founding is TS-only for the player), so it stays a
        # pure internal accumulator; the per-turn yield-faith side (game.ts:851)
        # remains unmodeled (the larger B-18 player religion-founding work).
        self.player_faith = torch.zeros(B, dtype=torch.float64, device=device)
        self._loyalty_amenity = torch.tensor(rr.get("loyaltyAmenity", [6, 3, 0, -3, -6]), dtype=dtype, device=device)
        self._off3 = tiles_within_offsets(int(rr.get("workRadius", 3))).to(device)
        self._off5 = tiles_within_offsets(5).to(device)  # P5/S4: rival border growth radius (= player BORDER_MAX_RADIUS)
        self._off7 = tiles_within_offsets(7).to(device)
        self._off2 = tiles_within_offsets(2).to(device)
        self._off1 = tiles_within_offsets(1).to(device)
        ids = [u["id"] for u in (rules.units or [])]
        self._r_spearman = ids.index("SPEARMAN") if "SPEARMAN" in ids else 0
        self._r_horseman = ids.index("HORSEMAN") if "HORSEMAN" in ids else 0
        # AUDIT A-6: the ranged rung (SLINGER ungated, ARCHER on archerTech)
        self._r_slinger = ids.index("SLINGER") if "SLINGER" in ids else -1
        self._r_archer = ids.index("ARCHER") if "ARCHER" in ids else -1

        # --- disasters (phase 4d) ------------------------------------------------
        self.disasters = bool(f0.get("disasters", 0))
        self.floodplain = torch.tensor([[t.get("fp", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.drought_cand = torch.tensor([[t.get("dc", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.desert = torch.tensor([[t.get("de", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.fertilizable = torch.tensor([[t.get("fz", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        n_volc = max(max((len(f.get("volcanoes", [])) for f in fixtures), default=0), 1)
        self.volcano_tile = torch.full((B, n_volc), -1, dtype=torch.long, device=device)
        for b, f in enumerate(fixtures):
            for i, v in enumerate(f.get("volcanoes", [])):
                self.volcano_tile[b, i] = v
        self.fertility = torch.zeros(B, T, dtype=torch.long, device=device)
        self.drought = torch.zeros(B, T, dtype=torch.long, device=device)

        # --- improvements (phase 6a: FARM; 6b: MINE, LUMBER_MILL) -----------------
        imp = rules.improvements or {}
        ids = imp.get("ids", [])
        self.improvements_on = bool(ids)
        self._imp_ids = list(ids)  # A-13: roster names (statelog TI lines)
        self.FARM = ids.index("FARM") if "FARM" in ids else 0
        self.MINE = ids.index("MINE") if "MINE" in ids else -1        # -1 = not in scope
        self.LUMBER = ids.index("LUMBER_MILL") if "LUMBER_MILL" in ids else -1
        # P4/D-20: food improvements heal their pillager (combat.ts
        # PILLAGE_HEAL_IMPROVEMENTS); indexed by improvement code.
        heal_names = ("FARM", "PASTURE", "CAMP", "PLANTATION", "FISHING_BOATS")
        self._imp_heals = torch.tensor(
            [n in heal_names for n in ids] or [False], dtype=torch.bool, device=device
        )
        self._farm_food = float(imp.get("farmFood", 1))
        self._farm_housing = float(imp.get("farmHousing", 0.5))
        self._mine_prod = float(imp.get("mineProd", 1))       # base MINE production
        self._lumber_prod = float(imp.get("lumberProd", 1))   # LUMBER_MILL production (no tech boost)
        self._builder_idx = int(imp.get("builderIdx", -1))
        self._hillfarms_civic = int(imp.get("hillFarmsCivic", -1))
        self._farmadj_civic = int(imp.get("farmAdjCivic", -1))  # GS: Feudalism farm-adjacency +1 food
        self._farmadj_tech = int(imp.get("farmAdjTech", -1))    # GS: Replaceable Parts +1 more
        self._mine_unlock_tech = int(imp.get("mineUnlockTech", -1))       # MINING
        self._lumber_unlock_tech = int(imp.get("lumberUnlockTech", -1))   # CONSTRUCTION
        # techs that permanently lift a MINE's yield (Apprenticeship, Industrialization → +1⚙ each)
        mbt = imp.get("mineBoostTechs", [])  # [[techIdx, prodAmount], ...]
        self._mine_boost_tech = torch.tensor([x[0] for x in mbt], dtype=torch.long, device=device)
        self._mine_boost_amt = torch.tensor([float(x[1]) for x in mbt], dtype=dtype, device=device)
        # AUDIT A-13: the dense per-improvement catalog (base yields [nI, 6],
        # housing [nI], unlockImprovement tech idx [nI]; -1 = baseline FARM)
        # and the per-tile resource-improvement plane rq: resource tiles
        # accept exactly this roster index (-1 no resource, -9 out of roster
        # = FISHING_BOATS on sea resources, unreachable in both engines).
        irows = imp.get("rows", [])
        nI = max(len(ids), 1)
        self._imp_yields = torch.zeros(nI, 6, dtype=dtype, device=device)
        self._imp_housing = torch.zeros(nI, dtype=dtype, device=device)
        self._imp_unlock = torch.full((nI,), -1, dtype=torch.long, device=device)
        for i, row in enumerate(irows):
            self._imp_yields[i] = torch.tensor(row["yields"], dtype=dtype)
            self._imp_housing[i] = float(row["housing"])
            self._imp_unlock[i] = int(row["unlock"])
        self.res_imp = torch.tensor(
            [[t.get("rq", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device
        )
        self.farm_flat = torch.tensor([[t.get("fa_f", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.farm_hill = torch.tensor([[t.get("fa_h", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.mine_ok = torch.tensor([[t.get("mi", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.lumber_ok = torch.tensor([[t.get("lu", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self._fa_f_c = torch.tensor([[t.get("fa_f_c", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self._fa_h_c = torch.tensor([[t.get("fa_h_c", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self._mi_c = torch.tensor([[t.get("mi_c", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.improvement = torch.full((B, T), -1, dtype=torch.long, device=device)  # -1 none, else improvement idx
        self.pillaged = torch.zeros(B, T, dtype=torch.bool, device=device)
        self.p_charges = torch.zeros(B, P_MAX, dtype=torch.long, device=device)

        # --- districts (D1: catalog + state tensor) -------------------------------
        # The catalog is loaded and a [B, T] district-type-index tensor is
        # allocated (-1 = none). Writers since D1: the scripted scaffold (D2),
        # rival queues (D4) and the RL district head (D5) — see _place_district.
        self.districts_cat = list(rules.districts or [])
        self.districts_on = bool(self.districts_cat)
        self.district = torch.full((B, T), -1, dtype=torch.long, device=device)  # -1 none, else PLACEABLE_DISTRICTS idx
        # C1-B4a (inert): completion joins the model. Every current writer
        # completes instantly (True at placement) so gating consumers on it
        # is bit-inert TODAY; rival QUEUED districts (B4) write False first.
        # Paving/eligibility/cap consumers deliberately stay placement-based
        # (TS paves and caps on tile.district regardless of completeness).
        self.district_complete = torch.zeros(B, T, dtype=torch.bool, device=device)
        nD = len(self.districts_cat)
        self.d_static_adj = torch.tensor(
            [[t.get("dadj", [0.0] * nD) for t in f["tiles"]] for f in fixtures],
            dtype=dtype, device=device,
        )  # [B, T, nD] raw static-source adjacency; mutated when an in-game founding clears a center feature
        self.feat_yields = torch.tensor(
            [[t.get("fy", [0.0] * 6) for t in f["tiles"]] for f in fixtures],
            dtype=dtype, device=device,
        )  # [B, T, 6] the removable feature's own yields (stripped at player founding)
        self.feat_stripped = torch.zeros(B, T, dtype=torch.bool, device=device)  # player-founded centers (flips read them stripped)
        # AUDIT C-6: a district pave removes a BONUS resource (both engines'
        # queue paths strip; canPlace refuses luxury/strategic). Live readers:
        # border-pick resource priority + siteQuality's resource column.
        self.res_stripped = torch.zeros(B, T, dtype=torch.bool, device=device)
        self.tile_river = torch.tensor([[bool(t.get("riv", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)  # C1-B4b-2: Water Mill at rival centers
        self.tile_wh = torch.tensor([[float(t.get("wh", 2)) for t in f["tiles"]] for f in fixtures], dtype=torch.float64, device=device)  # C1-B5b-iii: water housing at a hypothetical center
        # V-H1 chop planes: grant key (0 none/1 food/2 prod) + removal-unlock tech
        self.tile_ftr = torch.tensor([[int(t.get("ftr", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.tile_ftu = torch.tensor([[int(t.get("ftu", -1)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self._feat_adj = torch.tensor(
            [[t.get("fadj", [0.0] * nD) for t in f["tiles"]] for f in fixtures],
            dtype=dtype, device=device,
        )  # [B, T, nD] adjacency a tile's removable feature lends to neighbours (dropped on founding here)
        self._nfeat_adj = torch.tensor(
            [[t.get("nfadj", [0.0] * nD) for t in f["tiles"]] for f in fixtures],
            dtype=dtype, device=device,
        )  # [B, T, nD] the NON-removable feature's lent adjacency (GS REEF -> Campus): queueDistrict paves null ANY feature (P2), foundCity only removable
        sc = rules.district_scaffold or {}
        self.CAMPUS = int(sc.get("campusIdx", 0))
        self.campus_unlock_tech = int(sc.get("campusUnlockTech", -1))  # WRITING
        self._scaffold = [(int(p["idx"]), int(p["unlockTech"]), int(p.get("placement", 0))) for p in sc.get("place", [])]  # (district idx, unlock tech idx, placement: 0 land / 1 aqueduct)
        self.dscaffold_placed = torch.zeros(B, max(len(self._scaffold), 1), dtype=torch.bool, device=device)  # per-scaffold-district placed flag
        self._campus_active = bool(sc.get("active", 0))  # scaffold master on/off (mirrors exporter SCRIPTED_CAMPUS)
        self._rl_district_active = True  # D5b: the RL production head can place districts (off-script) — mask columns NB+2+NU+si
        self._rl_any_city = True  # D5c: True lets non-capital cities place districts too
        # V-P1/2: gold purchases (buy a building / settler / unit outright at
        # gold_purchase_mult× production cost, mirroring purchaseBuilding/
        # purchaseSettler/purchaseUnit). ACTIVE since V-P2: the production
        # mask carries NB+1+NU purchase columns (width 26→46) — checkpoints
        # trained on the 26-column head (tune1 and older) no longer match;
        # retrain, or flip this off to benchmark them.
        self._rl_purchase_active = True
        # V-W1: player diplomacy (declareWar / sueForPeace on a rival) as a
        # NEW head, plumbed but OFF: war_mask() is all-False and step(war=…)
        # is ignored while False, so nothing samples or applies it. The head
        # is not wired into BatchEnv until activation (+ retrain).
        self._rl_war_active = True  # V-W1 ACTIVE (2026-07-08): the war/peace head samples live; scripted/parity paths never pass war= so the gates stay untouched
        # V-R: ranged units (rangedStrength > 0) execute attack codes 6-11 as
        # a RANGED strike — one damage roll, no retaliation, no advance, no
        # camp clear (mirrors rangedAttack; range-1 targets only, legal for
        # both Slinger rng-1 and Archer rng-2). The replay dispatches by the
        # same rule via rollout.json's rangedActive flag. Off = the old
        # weak-melee behavior, for replaying pre-V-R action logs.
        self._rl_ranged_active = True
        # Phase-1 combat log hooks (inert unless rollout --log sets the batch)
        self._log_combat_b: int | None = None
        self._combat_events: list[str] = []
        self._askable = torch.tensor(sc.get("askable", []), dtype=torch.long, device=device)  # CS-quest askable idx -> district-type idx
        self.d_usable = torch.tensor(
            [[t.get("du", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )  # [B, T] district-placeable land — static part of canPlaceDistrict
        self.aqsrc = torch.tensor(
            [[t.get("aqsrc", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )  # [B, T] Aqueduct water source (river / adjacent lake·oasis·mountain), static
        self.coastal_water = torch.tensor(
            [[t.get("cw", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )  # [B, T] Harbor surface: coastal/lake water adjacent to land, static
        # Per-district DYNAMIC adjacency source amounts (src 8 = CITY_CENTER, 9 =
        # HARBOR_DISTRICT), derived from the catalog. The DISTRICT source (7, +0.5)
        # is handled by 0.5·adjc; the static sources live in d_static_adj.
        def _src_amt(d, src):
            return float(next((a["amount"] for a in d.get("adjacency", []) if int(a["src"]) == src), 0.0))
        self._dyn_center = torch.tensor([_src_amt(d, 8) for d in self.districts_cat], dtype=dtype, device=device)  # [nD] +per adjacent center
        self._dyn_harbor = torch.tensor([_src_amt(d, 9) for d in self.districts_cat], dtype=dtype, device=device)  # [nD] +per adjacent Harbor
        self._dyn_searesource = torch.tensor([_src_amt(d, 10) for d in self.districts_cat], dtype=dtype, device=device)  # [nD] +per adjacent live SEA resource (withdrawn on strip)
        # B-16 (GS Industrial Zone): dynamic MINE (src 11, +0.5), QUARRY (src 12,
        # +1), AQUEDUCT (src 13, +2) sources. Only the Industrial Zone carries
        # them; IZ is rival-unreachable and never scaffolded, so these amounts
        # stay 0 for every PLACED district — the branches in _district_adj_raw
        # never fire in the current gate (inert), but keep the catalog faithful.
        self._dyn_mine = torch.tensor([_src_amt(d, 11) for d in self.districts_cat], dtype=dtype, device=device)  # [nD]
        self._dyn_quarry = torch.tensor([_src_amt(d, 12) for d in self.districts_cat], dtype=dtype, device=device)  # [nD]
        self._dyn_aqueduct = torch.tensor([_src_amt(d, 13) for d in self.districts_cat], dtype=dtype, device=device)  # [nD]
        self._mine_iidx = 1   # IMPROVEMENT_IDS: FARM=0, MINE=1, LUMBER_MILL=2, QUARRY=3, ...
        self._quarry_iidx = 3
        # A-7r: government + policy modifier tables. Per seat, per turn the
        # engine adopts the newest unlocked government (highest tier, ties to
        # table order) and greedily fills its BASE slots in policy-table order
        # among unlocked cards of matching kind — the computeAdoption twin.
        # Only the cityYields/capitalYields channels are applied (the live gov/
        # policy effects in the scripted gate: URBAN_PLANNING +1 production to
        # every city, AUTOCRACY +1 to all yields in the capital; #46r:
        # MONARCHY housingAll + the wildcard-overflow slot fill went live
        # with the 250t horizon — see _gov_policy_mods).
        _govs = rules.governments or []
        _pols = rules.policies or []
        self._ngov = len(_govs)
        self._npol = len(_pols)
        if self._ngov:
            self._gov_tier = torch.tensor([int(g["tier"]) for g in _govs], dtype=torch.long, device=device)
            self._gov_unlock_civic = torch.tensor([int(g["unlockCivic"]) for g in _govs], dtype=torch.long, device=device)
            self._gov_slots = torch.tensor([[int(x) for x in g["slots"]] for g in _govs], dtype=torch.long, device=device)  # [nGov,4] m/e/d/w
            self._gov_city_y = torch.tensor([[float(x) for x in g["cityYields"]] for g in _govs], dtype=dtype, device=device)  # [nGov,6]
            self._gov_cap_y = torch.tensor([[float(x) for x in g["capitalYields"]] for g in _govs], dtype=dtype, device=device)  # [nGov,6]
            # #46r: MONARCHY's housingAll went live at the 250t horizon —
            # PLAYER housing only (TS rivalHousing is deliberately mods-free).
            self._gov_housing = torch.tensor([float(g.get("housingAll", 0)) for g in _govs], dtype=dtype, device=device)  # [nGov]
            # #46r yieldMult: tier-2/3 governments multiply a yield ×1.1
            # (MERCHANT_REPUBLIC gold — the rng-2026006082 t249 catch —
            # THEOCRACY faith, DEMOCRACY culture, COMMUNISM production).
            # PLAYER totals only: TS rivalCityYields never applies yieldMult.
            self._gov_ymult = torch.tensor([[float(x) for x in g.get("yieldMult", [1] * 6)] for g in _govs], dtype=dtype, device=device)  # [nGov,6]
            self._gov_arange = torch.arange(self._ngov, dtype=torch.long, device=device)
        if self._npol:
            self._pol_kind = torch.tensor([int(p["kind"]) for p in _pols], dtype=torch.long, device=device)  # [nPol]
            self._pol_unlock_civic = torch.tensor([int(p["unlockCivic"]) for p in _pols], dtype=torch.long, device=device)
            self._pol_city_y = torch.tensor([[float(x) for x in p["cityYields"]] for p in _pols], dtype=dtype, device=device)  # [nPol,6]
            self._pol_cap_y = torch.tensor([[float(x) for x in p["capitalYields"]] for p in _pols], dtype=dtype, device=device)
            self._pol_housing = torch.tensor([float(p.get("housingAll", 0)) for p in _pols], dtype=dtype, device=device)  # [nPol] (#46r)
            # #46r housingIfDistricts (INSULAE {min 2, +1} — deterministically
            # slotted via the wildcard overflow): +housing to PLAYER cities
            # with >= min completed districts (rivalHousing is mods-free).
            _hid = [p.get("housingIfDistricts", [-1, 0]) for p in _pols]
            self._pol_hid_min = torch.tensor([int(x[0]) for x in _hid], dtype=torch.long, device=device)  # [nPol] (-1 = none)
            self._pol_hid_house = torch.tensor([float(x[1]) for x in _hid], dtype=dtype, device=device)  # [nPol]
        # A-7r master switch (rules.governmentsLive), mirrored from the TS
        # GOVERNMENTS_ADOPTION_LIVE. Landed inert; gates every gov/policy
        # application + the influence-tier addition so the two engines flip in
        # lockstep. When False the tables load but change nothing (the tables
        # are inert plumbing until the rival-march latent is fixed).
        self._gov_live = bool(getattr(rules, "governments_live", False))
        self._gov_has_effects = self._gov_live and bool(
            (self._ngov and float(self._gov_city_y.abs().sum() + self._gov_cap_y.abs().sum() + self._gov_housing.abs().sum() + (self._gov_ymult - 1).abs().sum()) > 0)
            or (self._npol and float(self._pol_city_y.abs().sum() + self._pol_cap_y.abs().sum() + self._pol_housing.abs().sum() + self._pol_hid_house.abs().sum()) > 0)
        )
        self._harbor_idx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "HARBOR"), -1)
        self._hs_idx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "HOLY_SITE"), -1)  # A-7: Work Ethic
        self._shipyard_bidx = int(rules.shipyard_bidx)
        self._walls_bidx = int(rules.ancient_walls_bidx)  # AUDIT B-1/B-2
        # AUDIT A-11: rival trade anchors (id-anchored capacity sources +
        # route constants — the rivalTradeCapacity/routeYields mirror).
        _tr = rules.trade or {}
        self._trade_mkt = int(_tr.get("marketBidx", -1))
        self._trade_lgh = int(_tr.get("lighthouseBidx", -1))
        self._trade_ftc = int(_tr.get("foreignTradeCidx", -3))
        self._trade_wonders = [int(x) for x in _tr.get("capWonderWidx", [])]
        self._trade_range = int(_tr.get("range", 15))
        self._walls_hp = int(rules.combat.get("wallsHp", 100))
        # Which district types count toward the specialty cap (Aqueduct/Neighborhood
        # do NOT). Aqueduct also carries housing, not an adjacency yield.
        self._is_specialty = torch.tensor([bool(d.get("countsTowardLimit", True)) for d in self.districts_cat], dtype=torch.bool, device=device)  # [nD]
        self._aqueduct_idx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "AQUEDUCT"), -1)
        # P4/D-8: per-type unlock indices (-1 = no unlockDistrict effect in
        # the compact tree — NOT unlocked, mirroring computeUnlocks).
        self._d_unlock_t = torch.tensor([int(d.get("unlockTech", -1)) for d in self.districts_cat], dtype=torch.long, device=device)
        self._d_unlock_c = torch.tensor([int(d.get("unlockCivic", -1)) for d in self.districts_cat], dtype=torch.long, device=device)
        self._d_maint = torch.tensor([float(d.get("maintenance", 1)) for d in self.districts_cat], dtype=dtype, device=device)  # [nD] gold upkeep per district type
        self._h_fresh = float(rules.housing_fresh)
        self._aq_fresh_bonus = float(rules.housing_aq_fresh_bonus)
        self._aq_no_fresh_total = float(rules.housing_aq_no_fresh)

        self._eff_version = 0
        # G1: two extra invalidation counters the _eff_version epoch misses.
        #  _bel_version   — bumped at the three belief-claim sites (+restore/reset);
        #                   r_pantheon/r_follower/r_founder change there only, with
        #                   no eff bump, yet the same-turn trace re-reads that civ.
        #  _rp_kill_version — bumped at the economy-loop strike-kill (7714-7717),
        #                   the only unit-death site inside the loop; it flips
        #                   u_alive/p_alive (route raided-mask) with no eff bump.
        self._bel_version = 0
        self._rp_kill_version = 0
        # G4: bumped when a border-growth claim lands INSIDE a later same-civ
        # city's worked-tile window (rival_at is the valid-mask input the eff
        # epoch misses); claims elsewhere leave the yields cache intact.
        self._claim_version = 0
        self._eff_cache: tuple[int, torch.Tensor] | None = None
        self._food_cache: tuple[int, torch.Tensor] | None = None
        self._score_cache: tuple[int, torch.Tensor] | None = None
        self._nprod_cache: tuple[int, torch.Tensor] | None = None
        # G1: rival-phase caches, same single-slot-by-key shape as _rcy_globals.
        self._rival_route_cache = None   # ((turn,r,_eff_version,_rp_kill_version), [B,RC]|None)
        self._belief_feat_cache = None   # ((r,_eff_version,_bel_version), [B,T,6])
        self._bel_add_memo = None        # (_bel_version, {(fn,key,r): tensor})
        self._gov_pol_cache = None       # (_eff_version, {seat_tag: 5-tuple})
        self._rcy_all_cache = None       # G4: ((turn,r,eff,bel,kill,claim), 6-tuple [B,RC])
        self._dadj_cache = None          # G5: (_eff_version, {di: floored [B,T] adjacency})
        # Static candidate lists for _pick_static: the k-th candidate in
        # tile order, so a pick is one gather instead of a [B, T] cumsum.
        def cand_list(cand: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
            n = cand.sum(dim=1)
            width = max(int(n.max()), 1)
            idx = torch.argsort((~cand).to(torch.int8), dim=1, stable=True)[:, :width]
            return idx, n
        self._flood_list = cand_list(self.floodplain)
        self._droughtc_list = cand_list(self.drought_cand)
        self._land_list = cand_list(~self.water)
        # Rival yields sum the picked tiles' yields sequentially to mirror
        # the TS reduce. When every value is a dyadic rational (integers and
        # halves — true for all shipped rules), every partial sum is exact
        # in f64, so ANY summation order gives the identical bits and one
        # .sum() replaces the per-tile add loop. C1-B1 scores tiles over all
        # SIX columns (tileScore), so the guard now covers the full table.
        fp2 = self.tile_yields.double() * 2
        self._dyadic_fp = bool((fp2 == fp2.round()).all())

        # P7 (C-1): the Palace follows the capital IDENTITY (is_cap), not
        # column 0 — a refound capital gains it (TS gives the first city
        # ['PALACE']), a hole-reused column 0 does not.
        self._palace_y = rules.palace_yields.to(device=device, dtype=dtype)  # [6]
        self._palace_housing = float(rules.palace_housing)
        self._palace_amenities = float(rules.palace_amenities)

        # Boost schedules: [turn, kind(0 tech/1 civic), idx] per game.
        self.boost_schedule = [f.get("boostSchedule", []) for f in fixtures]

        NB, NT, NC = len(rules.b_cost), len(rules.t_cost), len(rules.c_cost)
        self.NB = NB
        self.SETTLER = NB  # production action: one past the building table
        self.IDLE = NB + 1  # production action: queue nothing this turn
        self.rules_dev = Rules(
            **{
                k: (v.to(device=device, dtype=dtype) if isinstance(v, torch.Tensor) and v.is_floating_point() else v.to(device) if isinstance(v, torch.Tensor) else v)
                for k, v in vars(rules).items()
            }
        )

        # --- dynamic state ------------------------------------------------------
        z = lambda *shape, dt=dtype: torch.zeros(*shape, dtype=dt, device=device)
        self.turn = 1
        self.alive = torch.zeros(B, C, dtype=torch.bool, device=device)
        self.alive[:, 0] = True
        self.pop = torch.zeros(B, C, dtype=torch.long, device=device)
        self.pop[:, 0] = 1
        self.food_box = z(B, C)
        self.culture_box = z(B, C)
        self.tiles_acquired = torch.zeros(B, C, dtype=torch.long, device=device)
        self.owner = torch.tensor([f["ownerInit"] for f in fixtures], dtype=torch.long, device=device)  # [B, T]
        self.buildings = torch.zeros(B, C, NB, dtype=torch.bool, device=device)
        self._b_req_district = rules.b_req_district.to(device)  # [NB] required district idx (-1 none)
        self._b_req_buildings = rules.b_req_buildings  # list of prereq-building-index lists
        self._b_has_reqs = bool((self._b_req_district >= 0).any()) or any(len(r) > 0 for r in self._b_req_buildings)
        self.current = torch.full((B, C), -1, dtype=torch.long, device=device)
        self.cur_cost = z(B, C)
        self.q_dtile = torch.full((B, C), -1, dtype=torch.long, device=device)  # P2: the queued district's target tile
        self.progress = z(B, C)
        self.prod_bank = z(B, C)  # V-H1: chop production banked while the queue is empty
        self.settlers = torch.zeros(B, dtype=torch.long, device=device)
        self.settlers_queued = torch.zeros(B, dtype=torch.long, device=device)
        self.treasury = z(B)
        self.science_total = z(B)
        self.culture_total = z(B)
        self.techs = torch.zeros(B, NT, dtype=torch.bool, device=device)
        self.civics = torch.zeros(B, NC, dtype=torch.bool, device=device)
        self.tech_boosted = torch.zeros(B, NT, dtype=torch.bool, device=device)
        self.civic_boosted = torch.zeros(B, NC, dtype=torch.bool, device=device)
        self.cur_tech = torch.full((B,), -1, dtype=torch.long, device=device)
        self.cur_civic = torch.full((B,), -1, dtype=torch.long, device=device)
        self.tech_prog = z(B)
        self.civic_prog = z(B)

        # --- the hostile world (phase 4a: barbarians) -----------------------------
        self.units_mode = bool(f0.get("unitsMode", 0))
        assert all(bool(f.get("unitsMode", 0)) == self.units_mode for f in fixtures)
        cb = rules.combat
        self.max_camps = torch.tensor([f.get("maxCamps", 0) for f in fixtures], dtype=torch.long, device=device)
        self.K = int(self.max_camps.max().item()) if self.units_mode else 0
        # The in-state mulberry32, one u32 per game, mirrored draw for draw.
        self.rng_state = torch.tensor([f.get("rngInit", 0) for f in fixtures], dtype=torch.int64, device=device)
        self.city_hp = torch.full((B, C), int(cb.get("cityMaxHp", 200)), dtype=torch.long, device=device)
        self.outer_hp = torch.zeros(B, C, dtype=torch.long, device=device)  # AUDIT B-1: ANCIENT_WALLS outer pool (0 = no walls)
        self.center_at = torch.full((B, T), -1, dtype=torch.long, device=device)  # city slot at tile
        self.center_at.scatter_(1, self.site[:, :1], 0)  # the capital
        # Tile → unit-slot occupancy maps. Stacking mirrors tileFreeForUnit:
        # a foreign unit blocks a tile entirely; among the player's own
        # units, one military + one civilian may share.
        self.barb_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.pmil_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.pciv_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.u_alive = torch.zeros(B, U_MAX, dtype=torch.bool, device=device)
        self.u_acted = torch.zeros(B, U_MAX, dtype=torch.bool, device=device)  # P4/D-2
        self.u_type = torch.zeros(B, U_MAX, dtype=torch.long, device=device)  # 0 WARRIOR / 1 SPEARMAN
        self.u_tile = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.u_hp = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.u_fortify = torch.zeros(B, U_MAX, dtype=torch.long, device=device)  # B-5: fortifyTurns (military; cap 2)
        self.next_slot = torch.zeros(B, dtype=torch.long, device=device)  # append-only: keeps unit order
        self.game_over = torch.zeros(B, dtype=torch.bool, device=device)  # GV-2
        self.victory_type = torch.zeros(B, dtype=torch.long, device=device)  # GV-4/GV-3
        self.winner = torch.full((B,), -1, dtype=torch.long, device=device)  # GV-3
        # B-25 (Round B3): per-civ space-race chain progress in the unified civ
        # space (index 0 = player, 1..R = rival i). Bool [B, 1+R, n_space].
        # WRITE-tracked bookkeeping (the science victory fires on the victory
        # STEP directly, like TS state/rival.spaceProjects — nothing reads it
        # for behavior); _MUTABLE-registered for snapshot/restore. Per-CIV (not
        # a city slot) so it is NOT slot-coupled: _reclaim_rc leaves it intact,
        # and a dead rival cannot write it (no kill hygiene needed).
        self.space_done = torch.zeros(B, 1 + self.R, max(self._n_space, 1), dtype=torch.bool, device=device)  # B-25
        self.camp_tile = torch.full((B, max(self.K, 1)), -1, dtype=torch.long, device=device)
        self.n_camps = torch.zeros(B, dtype=torch.long, device=device)
        # Player units (phase 4b): trained via the production head, ordered
        # like state.units (append-only slots preserve spawn order).
        self.p_alive = torch.zeros(B, P_MAX, dtype=torch.bool, device=device)
        self.p_acted = torch.zeros(B, P_MAX, dtype=torch.bool, device=device)  # P4/D-2
        self.p_type = torch.zeros(B, P_MAX, dtype=torch.long, device=device)  # index into rules.units
        self.p_tile = torch.zeros(B, P_MAX, dtype=torch.long, device=device)
        self.p_hp = torch.zeros(B, P_MAX, dtype=torch.long, device=device)
        self.p_fortify = torch.zeros(B, P_MAX, dtype=torch.long, device=device)  # B-5: fortifyTurns (military; cap 2)
        self.p_next = torch.zeros(B, dtype=torch.long, device=device)
        self.warrior_trained = torch.zeros(B, C, dtype=torch.bool, device=device)  # scripted-policy flag
        self.builder_trained = torch.zeros(B, dtype=torch.bool, device=device)  # scripted-policy flag (capital, once)
        self.tdef = torch.tensor([[t.get("tdef", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # B-28: tdef is DUAL-PURPOSE no more. tdef holds the DEFENDER bonus
        # (real terrainDefense: hills/woods/rainforest +3; marsh/floodplains
        # −2), read at the def_cs sites. tmove holds the movement-slow encoding
        # (hills +3, woods/rainforest/marsh +3; floodplains flat) — enter cost
        # is 1 + tmove//3, keeping marsh SLOW while its defense flips to −2.
        # tmove//3 is bit-identical to the old tdef//3 for every tile.
        self.tmove = torch.tensor([[t.get("tmove", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # Damage table stays float64 regardless of sim dtype: the RNG factor
        # is float64 and damage rounds to integers the TS engine must match.
        self._dmg_base = torch.tensor(cb.get("dmgBase", [30.0] * 1201), dtype=torch.float64, device=device)  # B-29: 0.1-granular exp table
        self._unit_combat = torch.tensor(cb.get("unitCombat", [20, 25]), dtype=torch.long, device=device)
        # Trainable roster tables (index = position in rules.units).
        ru = rules.units or [{"id": "WARRIOR", "cost": 40, "combat": 20, "maintenance": 0, "civilian": 0, "requiresTech": -1}]
        self.NU = len(ru)
        self.UNIT_BASE = NB + 2  # production action codes NB+2 … NB+1+NU train units
        self._p_cost = torch.tensor([u["cost"] for u in ru], dtype=dtype, device=device)
        self._p_combat = torch.tensor([u["combat"] for u in ru], dtype=torch.long, device=device)
        self._p_maint = torch.tensor([u["maintenance"] for u in ru], dtype=dtype, device=device)
        self._p_civ = torch.tensor([bool(u["civilian"]) for u in ru], dtype=torch.bool, device=device)
        self._p_rng_str = torch.tensor([u.get("rangedStrength", 0) for u in ru], dtype=torch.long, device=device)  # V-R: 0 = melee-only
        self._p_rng_rng = torch.tensor([u.get("rangedRange", 0) for u in ru], dtype=torch.long, device=device)  # A-6: strike range
        self._p_moves = torch.tensor([u.get("moves", 2) for u in ru], dtype=torch.long, device=device)  # A-8: full MP per turn
        self._p_tech = torch.tensor([u["requiresTech"] for u in ru], dtype=torch.long, device=device)
        self._p_charges = torch.tensor([u.get("charges", 0) for u in ru], dtype=torch.long, device=device)
        self._warrior_idx = next((i for i, u in enumerate(ru) if u["id"] == "WARRIOR"), 0)

        # Precomputed static prereq masks would race with completion inside a
        # turn; availability is recomputed per loop (cheap: NT ≤ 32).
        self._prereq_t = self._prereq_matrix(rules.t_prereqs, NT).to(device)
        self._prereq_c = self._prereq_matrix(rules.c_prereqs, NC).to(device)
        self._arangeT = torch.arange(T, device=device)
        # D-7: hoisted per-call allocations (index buffers + scalar consts)
        self._arangeT_f = self._arangeT.to(dtype)
        self._bidx = torch.arange(B, device=device)
        self._inf_f = torch.tensor(float("inf"), dtype=dtype, device=device)
        self._neg_f = torch.tensor(-1e18, dtype=dtype, device=device)
        # D-2/D-3/D-5/D-8: derived caches, all keyed on _eff_version like
        # _eff_cache (every dependency's mutation site bumps it — research
        # completions and building purchases gained unconditional bumps)
        self._adjd_cache = None
        self._adjc_cache = None
        self._adjh_cache = None
        self._fadjq_cache = None
        self._fadjf_cache = None
        self._rcy_cache = None
        self._bld_cache = None
        # D-10: _city_totals walk-scoped sub-term cache (building einsums,
        # district adjacency/CS addends, upkeep + housing pieces) — keyed on
        # _eff_version, READ only by the step() walk's lux-frozen recomputes.
        self._ct_cache = None
        self._arangeNB = torch.arange(NB, device=device)

        # P4/D-22 latent, caught by P5-S2's reshuffle (seed 9001 t43): the
        # FIXTURE-LOADED starting units must seed the best-melee trackers —
        # TS counts them through spawnUnit at placeRivals (every rival
        # starts with a WARRIOR → its city defense is 20, not the floor 15;
        # the 5-point gap drifted rc_hp invisibly until a capture threshold
        # split on it). Player pools start empty in these worlds; computed
        # anyway for robustness.
        vt = self.v_type.clamp(min=0, max=self.NU - 1)
        melee_v = self.v_alive & (self._p_rng_str[vt] == 0)
        cs_v = torch.where(melee_v, self._p_combat[vt], torch.zeros_like(self.v_type))
        for r_ in range(r_pad):
            self.r_best_melee[:, r_] = torch.where(self.v_civ == r_, cs_v, torch.zeros_like(cs_v)).max(dim=1).values
        pt_ = self.p_type.clamp(min=0, max=self.NU - 1)
        melee_p = self.p_alive & (self._p_rng_str[pt_] == 0)
        self.best_melee = torch.where(melee_p, self._p_combat[pt_], torch.zeros_like(self.p_type)).max(dim=1).values

        # Pristine copy of the mutable state, for reset().
        self._pristine = {k: getattr(self, k).clone() for k in _MUTABLE}

    def reset(self) -> None:
        """Restore the initial state (all games, lockstep)."""
        for k, v in self._pristine.items():
            getattr(self, k).copy_(v)
        self.turn = 1
        self._eff_version += 1  # fertility/drought just changed under the cache
        self._eff_cache = None
        self._food_cache = None
        self._score_cache = None
        self._nprod_cache = None
        self._adjd_cache = self._adjc_cache = self._adjh_cache = None
        self._dadj_cache = None  # G5
        self._fadjq_cache = self._fadjf_cache = self._rcy_cache = self._bld_cache = None
        self._ct_cache = None  # D-10
        # G1: beliefs/units reset to pristine — bump the counters and drop the
        # rival-phase caches (bel_add memo is keyed on _bel_version alone).
        self._bel_version += 1
        self._rp_kill_version += 1
        self._claim_version += 1
        self._rival_route_cache = self._belief_feat_cache = None
        self._bel_add_memo = self._gov_pol_cache = None
        self._rcy_all_cache = None  # G4

    def snapshot(self) -> dict:
        """Clone the full mutable state (every _MUTABLE tensor + the turn counter)
        for cheap save/restore during search (MCTS). Eval-only — never touched by
        the parity gates. The derived caches are keyed by _eff_version, which
        restore() bumps, so they need not be captured."""
        return {"mut": {k: getattr(self, k).clone() for k in _MUTABLE}, "turn": self.turn}

    def restore(self, snap: dict) -> None:
        """Restore a snapshot() in place. Bumps _eff_version + clears the derived
        caches so a later compute recomputes against the restored state."""
        for k, v in snap["mut"].items():
            getattr(self, k).copy_(v)
        self.turn = snap["turn"]
        self._eff_version += 1
        self._eff_cache = None
        self._food_cache = None
        self._score_cache = None
        self._nprod_cache = None
        self._adjd_cache = self._adjc_cache = self._adjh_cache = None
        self._dadj_cache = None  # G5
        self._fadjq_cache = self._fadjf_cache = self._rcy_cache = self._bld_cache = None
        self._ct_cache = None  # D-10
        # G1: the restored snapshot may carry different beliefs/units — bump the
        # counters (mcts self-test covers this) and drop the rival-phase caches.
        self._bel_version += 1
        self._rp_kill_version += 1
        self._claim_version += 1
        self._rival_route_cache = self._belief_feat_cache = None
        self._bel_add_memo = self._gov_pol_cache = None
        self._rcy_all_cache = None  # G4

    @staticmethod
    def _prereq_matrix(prereqs: list, n: int) -> torch.Tensor:
        m = torch.zeros(n, n, dtype=torch.bool)
        for i, ps in enumerate(prereqs):
            for p in ps:
                m[i, p] = True
        return m

    # --- helpers ---------------------------------------------------------------

    def _luxury_amenities(self, amen_have: torch.Tensor, amen_need: torch.Tensor) -> torch.Tensor:
        """[B, C] luxuryAmenities mirror (C1-B1 gate catch — a random game's
        builder mined Diamonds and the TS amenity tier shifted): each UNIQUE
        improved luxury inside player borders — tile.improvement equals the
        resource's OWN improvement; pillage does NOT suspend it, faithfully —
        grants +1 amenity to the luxAmenityCities NEEDIEST cities. Grants
        feed back into the ranking (need desc, ties CITY ID asc — the
        ACQUISITION order, city_seq: P5/S5 gate-catch seed 9183 t164, an
        equal-need tie between a hole-reused low column and an older high
        column flipped the grant and both cities' amenity tiers), and
        rounds are homogeneous, so only the per-game COUNT of active
        luxuries matters."""
        B, C = self.B, self.C
        out = torch.zeros(B, C, dtype=self.dtype, device=self.device)
        if self._n_lux == 0 or not self.improvements_on:
            return out
        improved = (self.lux_id >= 0) & (self.owner >= 0) & (self.improvement == self.lux_req)
        counts = torch.zeros(B, self._n_lux, dtype=torch.long, device=self.device)
        counts.scatter_add_(1, self.lux_id.clamp(min=0), improved.long())
        rounds = (counts > 0).long().sum(dim=1)  # [B] unique improved luxuries
        mx = int(rounds.max().item())
        if mx == 0:
            return out
        seq = self.city_seq.to(self.dtype)  # TS tie: a.id − b.id (acquisition order)
        k = min(self._lux_k, C)
        for rnd in range(mx):
            act = rounds > rnd
            need = amen_need - (amen_have + out)
            key = torch.where(self.alive, need * 64 - seq, torch.full_like(need, -1e9))
            top_v, top_i = key.topk(k, dim=1)
            grant = (top_v > -1e8) & act.unsqueeze(1)
            out.scatter_add_(1, top_i, grant.to(self.dtype))
        return out

    def _ww_penalty_player(self) -> torch.Tensor:
        """B-15: player war-weariness amenity penalty [B] (integer floor → dtype),
        mirrors warWearinessPenalty(state.warWeariness)."""
        per = int(self.rules.war_weariness.get("perAmenity", 4))
        return torch.div(self.war_weariness, per, rounding_mode="floor").to(self.dtype)

    def _ww_penalty_rival(self, r: int) -> torch.Tensor:
        """B-15: rival r's war-weariness amenity penalty [B] (integer floor → float64),
        mirrors warWearinessPenalty(rival.warWeariness)."""
        per = int(self.rules.war_weariness.get("perAmenity", 4))
        return torch.div(self.r_war_weariness[:, r], per, rounding_mode="floor").to(torch.float64)

    def _amenity_factors(self, balance: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        growth = torch.full_like(balance, self.rules.amenity_tiers[-1][1])
        yld = torch.full_like(balance, self.rules.amenity_tiers[-1][2])
        for mn, g, y in reversed(self.rules.amenity_tiers):
            mask = balance >= mn
            growth = torch.where(mask, torch.tensor(g, dtype=self.dtype, device=self.device), growth)
            yld = torch.where(mask, torch.tensor(y, dtype=self.dtype, device=self.device), yld)
        return growth, yld

    def _growth_needed(self, pop: torch.Tensor) -> torch.Tensor:
        p = pop.to(self.dtype)
        return torch.floor(15 + 8 * (p - 1) + (p - 1).clamp(min=0) ** 1.5)

    def _border_cost(self, n: torch.Tensor) -> torch.Tensor:
        # P4/D-16: the real Civ 6 curve — 10 + (6t)^1.3, t = 1-based tile count.
        return torch.floor(10 + (6 * (n.to(self.dtype) + 1)) ** 1.3)

    def _builder_cost(self, n: torch.Tensor) -> torch.Tensor:
        """P4/D-10: builderCost — round((base + per·n) · gameSpeed), n =
        builders ever trained + queued (units.ts builderCost; Math.round
        == js_round)."""
        r = self.rules
        return js_round((r.builder_base + r.builder_per * n.to(self.dtype)) * r.game_speed)

    def _afford(self, tre: torch.Tensor, cost) -> torch.Tensor:
        """GS: milli-rounded gold-threshold compare (mirrors TS
        goldAffordable) — the treasuries accumulate non-dyadic 0.05-unit
        gold whose sub-milli drift differs between the engines, so a raw
        `treasury >= cost` splits at invisible knife-edges (P5-S7 hunt:
        seed 9261 t228 — a 72.000-milli treasury vs a 72-gold scout)."""
        if not torch.is_tensor(cost):
            cost = torch.tensor(float(cost), dtype=tre.dtype, device=tre.device)
        return js_round(tre * 1000) >= js_round(cost * 1000)

    def _unlocked_specialty_count(self, techs2: torch.Tensor, civics2: torch.Tensor) -> torch.Tensor:
        """P4/D-8: [B] U — specialty district types whose unlockDistrict
        tech/civic is researched (districtDiscounted's U; -1 = never)."""
        ut, uc = self._d_unlock_t, self._d_unlock_c
        unl = ((ut >= 0).unsqueeze(0) & techs2[:, ut.clamp(min=0)]) | (
            (uc >= 0).unsqueeze(0) & civics2[:, uc.clamp(min=0)]
        )  # [B, nD]
        return (unl & self._is_specialty.unsqueeze(0)).sum(dim=1)

    def _player_district_discounted(self, di: int) -> torch.Tensor:
        """P4/D-8 (districtDiscounted): [B] bool — 40% off type di while the
        player has PLACED fewer of it than ceil(D/U) with D = COMPLETED
        specialty districts owned, U = unlocked specialty types, D ≥ U."""
        if not bool(self._is_specialty[di]):
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        U = self._unlocked_specialty_count(self.techs, self.civics)
        own = (self.owner >= 0) & ~self.district_dead  # P5/S1: captured = dead, uncounted
        spec_t = (self.district >= 0) & self._is_specialty[self.district.clamp(min=0)]
        D = (own & spec_t & self.district_complete).sum(dim=1)
        n = (own & (self.district == di)).sum(dim=1)
        thresh = torch.div(D + U.clamp(min=1) - 1, U.clamp(min=1), rounding_mode="floor")  # ceil(D/U)
        return (U > 0) & (D >= U) & (n < thresh)

    def _rival_district_discounted(self, r: int, di: int) -> torch.Tensor:
        """P4/D-8 (rivalDistrictDiscounted): the same rule from THIS rival's
        own trees and rc_dist_tile registry."""
        if not bool(self._is_specialty[di]):
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        U = self._unlocked_specialty_count(self.r_techs[:, r], self.r_civics[:, r])
        placed = self.rc_dist_tile[:, r]  # [B, RC, nD] tile per (city, type)
        n = (placed[:, :, di] >= 0).sum(dim=1)
        tiles_f = placed.clamp(min=0).reshape(self.B, -1)
        comp = (placed >= 0) & self.district_complete.gather(1, tiles_f).reshape(placed.shape)
        D = (comp & self._is_specialty.view(1, 1, -1)).sum(dim=(1, 2))
        thresh = torch.div(D + U.clamp(min=1) - 1, U.clamp(min=1), rounding_mode="floor")
        return (U > 0) & (D >= U) & (n < thresh)

    def _available_mask(self, done: torch.Tensor, prereq: torch.Tensor) -> torch.Tensor:
        """[B, N] researchable now: not done, all prereqs done."""
        missing = (prereq.unsqueeze(0) & ~done.unsqueeze(1)).any(dim=2)
        return ~done & ~missing

    def _eff_cost(self, cost: torch.Tensor, boosted: torch.Tensor) -> torch.Tensor:
        return torch.where(boosted, js_round(cost * (1 - self.rules.boost_fraction)), cost)  # Math.round is half-up

    def _auto_pick(self, cur, done, boosted, cost, prereq):
        """Cheapest-available (effective cost, tie = table order), where cur == -1."""
        avail = self._available_mask(done, prereq)
        eff = self._eff_cost(cost.unsqueeze(0).expand_as(avail), boosted)
        key = torch.where(avail, eff, torch.tensor(float("inf"), dtype=self.dtype, device=self.device))
        # stable tie-break on index: add a tiny index epsilon
        key = key + torch.arange(key.shape[1], device=self.device, dtype=self.dtype) * 1e-6
        best = key.argmin(dim=1)
        has = avail.any(dim=1)
        return torch.where((cur == -1) & has, best, cur)

    def _eff_food(self) -> torch.Tensor:
        """[B, T] tile FOOD with the disaster legacy applied: fertility
        feeds (+1 each, already capped), drought starves (−1, floored at
        0) — mirrors the tail of tileYields. Food is the only column
        disasters touch; consumers that don't mix columns read this
        directly and skip the full [B, T, 6] assembly."""
        if self._food_cache is not None and self._food_cache[0] == self._eff_version:
            return self._food_cache[1]
        base = self.tile_yields[:, :, 0]
        if self.improvements_on:
            # A FARM adds its food to the tile's base yield (part of
            # tileYields, before the fertility/drought tail); a pillaged
            # improvement yields nothing.
            farm = (self.improvement == self.FARM) & ~self.pillaged
            base = base + farm.to(self.dtype) * self._farm_food
        food = base + self.fertility.to(self.dtype)
        food = torch.where(self.drought > 0, (food - 1).clamp(min=0), food)
        # Natural-wonder tiles EARLY-RETURN in tileYields with the wonder's
        # fixed yields, BEFORE the fertility/drought tail — the disaster
        # STATE still lands on them (the trace counts it), but their food
        # never moves.
        food = torch.where(self.nwonder, self.tile_yields[:, :, 0], food)
        self._food_cache = (self._eff_version, food)
        return food

    def _eff_prod(self) -> torch.Tensor:
        """[B, T] tile PRODUCTION with improvement yields applied: a MINE or
        LUMBER_MILL adds its production to the tile's base (mirrors the
        improvement branch of tileYields), a pillaged improvement adds
        nothing. MINE production is tech-boosted — each of Apprenticeship /
        Industrialization adds +1⚙ to EVERY mine — so an existing mine's
        yield RISES when a boost tech completes; _eff_version bumps there so
        the eff/score caches follow. Production has no fertility/drought or
        natural-wonder tail (those touch food only), so base + improvement
        is the whole story."""
        base = self.tile_yields[:, :, 1]
        if not self.improvements_on:
            return base
        live = ~self.pillaged
        out = base
        if self.MINE >= 0:
            if self._mine_boost_tech.numel() > 0:
                researched = self.techs[:, self._mine_boost_tech].to(self.dtype)  # [B, K]
                boost = (researched * self._mine_boost_amt).sum(dim=1)            # [B]
            else:
                boost = torch.zeros(self.B, dtype=self.dtype, device=self.device)
            mine_prod = (self._mine_prod + boost).unsqueeze(1)                    # [B, 1]
            out = out + ((self.improvement == self.MINE) & live).to(self.dtype) * mine_prod
        if self.LUMBER >= 0:
            out = out + ((self.improvement == self.LUMBER) & live).to(self.dtype) * self._lumber_prod
        # AUDIT A-13: the grown roster (QUARRY/PASTURE/CAMP/PLANTATION/
        # OIL_WELL, idx >= 3) adds its catalog production via the dense
        # table — FARM/MINE/LUMBER keep their bespoke terms above so the
        # old paths stay bit-identical.
        new_imp = self.improvement >= 3
        if bool(new_imp.any()):
            out = out + (new_imp & live).to(self.dtype) * self._imp_yields[self.improvement.clamp(min=0), 1]
        return out

    def _neutral_prod(self) -> torch.Tensor:
        """[B, T] tile PRODUCTION as a RIVAL works it. rivalCityYields calls
        tileYields with defaultModifiers(): the improvement's BASE production
        applies (the mine/lumber mill is physically on the tile; pillage
        suspends it) but the PLAYER's mine-boost techs do NOT — those ride
        ctx.mods, which defaultModifiers zeroes. Distinct from _eff_prod(),
        the player-context plane that adds the boosts. Cached per
        _eff_version (improvement/pillage changes bump it)."""
        base = self.tile_yields[:, :, 1]
        if not self.improvements_on:
            return base
        if self._nprod_cache is not None and self._nprod_cache[0] == self._eff_version:
            return self._nprod_cache[1]
        live = ~self.pillaged
        out = base
        if self.MINE >= 0:
            out = out + ((self.improvement == self.MINE) & live).to(self.dtype) * self._mine_prod
        if self.LUMBER >= 0:
            out = out + ((self.improvement == self.LUMBER) & live).to(self.dtype) * self._lumber_prod
        # AUDIT A-13: the grown roster's catalog production — context-free
        # (IMPROVEMENTS[imp].yields applies under defaultModifiers too; only
        # the player's mine-boost ctx.mods stay out of the neutral plane).
        new_imp = self.improvement >= 3
        if bool(new_imp.any()):
            out = out + (new_imp & live).to(self.dtype) * self._imp_yields[self.improvement.clamp(min=0), 1]
        self._nprod_cache = (self._eff_version, out)
        return out

    def _eff_yields(self) -> torch.Tensor:
        """[B, T, 6] tile yields with disaster food AND improvement production
        — for consumers whose cross-column float sums must keep the assembled
        row order.

        Cached per disaster version: fertility/drought mutate ONLY inside
        _disaster_phase, improvement/pillaged state inside the builder/raider
        paths, and mine-boost techs inside research — each bumps the version.
        The cache returns the identical tensor, so downstream float behavior
        is unchanged."""
        if not self.disasters and not self.improvements_on and not bool(self.feat_stripped.any()):
            return self.tile_yields
        if self._eff_cache is not None and self._eff_cache[0] == self._eff_version:
            return self._eff_cache[1]
        ty = self.tile_yields.clone()
        ty[:, :, 0] = self._eff_food()
        if self.improvements_on:
            ty[:, :, 1] = self._eff_prod()
            # AUDIT A-13: gold+ columns — CAMP/PLANTATION add catalog gold.
            # Generic over the whole roster (cols 2-5 are zero for the rest),
            # pillage-suspended like every improvement yield.
            live_imp = (self.improvement >= 0) & ~self.pillaged
            if bool(live_imp.any()):
                ty[:, :, 2:] = ty[:, :, 2:] + self._imp_yields[self.improvement.clamp(min=0), 2:] * live_imp.unsqueeze(-1).to(ty.dtype)
        # V-H1: a chopped (or founding-stripped) tile loses its feature's own
        # yields on every column — TS reads tile.feature === null live. The
        # center path is untouched (it reads the neutral planes and applies
        # its own strip), and _eff_food/_eff_prod rebuild cols 0/1 feature-
        # inclusive, so the subtraction comes after the overwrites.
        if bool(self.feat_stripped.any()):
            ty = ty - self.feat_yields.to(ty.dtype) * self.feat_stripped.unsqueeze(-1).to(ty.dtype)
        self._eff_cache = (self._eff_version, ty)
        return ty

    def _fertilize(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """+1 fertility (capped) on land, non-mountain tiles. (row, tile)
        pairs must be unique — duplicates would collapse to a single +1."""
        ok = self.fertilizable[rows, tiles]
        r2, t2 = rows[ok], tiles[ok]
        self.fertility[r2, t2] = (self.fertility[r2, t2] + 1).clamp(max=3)

    def _fertilize_counted(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """Like _fertilize but duplicate (row, tile) pairs stack: min(3,
        f + n) equals n sequential capped +1s, so a scatter-add then one
        clamp reproduces the TS loop exactly."""
        ok = self.fertilizable[rows, tiles]
        gi = rows[ok] * self.T + tiles[ok]
        cnt = torch.zeros(self.B * self.T, dtype=torch.long, device=self.device)
        cnt.index_put_((gi,), torch.ones_like(gi), accumulate=True)
        touched = cnt > 0
        flat = self.fertility.view(-1)
        flat[touched] = (flat[touched] + cnt[touched]).clamp(max=3)

    def _scorch(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """Mirrors scorch(tile): pillage an improved, unpillaged tile.
        Setting pillaged is idempotent, so duplicate (row, tile) pairs are
        harmless."""
        ok = (self.improvement[rows, tiles] >= 0) & ~self.pillaged[rows, tiles]
        self.pillaged[rows[ok], tiles[ok]] = True

    def _pick_static(self, mask_hit: torch.Tensor, cand_list: tuple[torch.Tensor, torch.Tensor]) -> tuple[torch.Tensor, torch.Tensor]:
        """Mirror of pick(): one draw where mask_hit & candidates exist;
        returns (chosen mask, tile). The candidate sets are static, so the
        k-th candidate comes from a precomputed tile-ordered list — one
        gather instead of a [B, T] cumsum."""
        idx, cnt = cand_list
        has = mask_hit & (cnt > 0)
        r = self._next_random(has)
        k = torch.floor(r * cnt.to(torch.float64)).to(torch.long)
        tile = idx.gather(1, k.clamp(min=0, max=idx.shape[1] - 1).unsqueeze(1)).squeeze(1)
        return has, tile

    def _disaster_phase(self) -> None:
        """Mirrors disasterPhase draw for draw: drought clocks tick, then a
        flood roll (+pick), one roll per volcano, a drought roll (+pick),
        and a storm roll (+pick). Improvement scorching is inert (none
        exist); the lasting effects are fertility and drought clocks.

        Area effects are applied BATCHED (5b): no draw in this phase reads
        fertility or the drought clocks, so deferring each event's writes
        past the remaining rolls is exact; +1-capped fertility and max()ed
        drought clocks are order-free (min(3, f+n) equals any sequence of
        capped +1s, max is commutative)."""
        B, dev = self.B, self.device
        self._eff_version += 1
        self.drought = (self.drought - 1).clamp(min=0)
        every = torch.ones(B, dtype=torch.bool, device=dev)

        r = self._next_random(every)
        hit, tile = self._pick_static(r < 0.05, self._flood_list)
        if bool(hit.any()):
            rows = hit.nonzero(as_tuple=True)[0]
            self._scorch(rows, tile[rows])
            self._fertilize(rows, tile[rows])

        # Per-volcano rolls stay sequential (draw order is the contract);
        # the eruptions' neighbor fertilization batches across volcanoes.
        er_rows, er_volc = [], []
        for k in range(self.volcano_tile.shape[1]):
            volc = self.volcano_tile[:, k]
            active = volc >= 0
            if not bool(active.any()):
                continue
            rv = self._next_random(active)
            erupt = active & (rv < 0.02)
            if bool(erupt.any()):
                rows = erupt.nonzero(as_tuple=True)[0]
                er_rows.append(rows)
                er_volc.append(volc[rows])
        if er_rows:
            rows = torch.cat(er_rows)
            nb = self.neigh[torch.cat(er_volc)]  # [R, 6]
            rr6 = rows.unsqueeze(1).expand(-1, 6).reshape(-1)
            nbf = nb.reshape(-1)
            on = nbf >= 0
            self._scorch(rr6[on], nbf[on])
            self._fertilize_counted(rr6[on], nbf[on])

        r = self._next_random(every)
        hit, tile = self._pick_static(r < 0.02, self._droughtc_list)
        if bool(hit.any()):
            rows = hit.nonzero(as_tuple=True)[0]
            area = tiles_from_offsets(tile[rows], self._off2, self.W, self.H)  # [R, 19]
            M = area.shape[1]
            rrm = rows.unsqueeze(1).expand(-1, M).reshape(-1)
            af = area.reshape(-1)
            on = (af >= 0) & ~self.water[rrm, af.clamp(min=0)]
            flat = self.drought.view(-1)
            gi = rrm[on] * self.T + af[on]
            flat.scatter_reduce_(0, gi, torch.full_like(gi, 8), reduce="amax")

        r = self._next_random(every)
        hit, tile = self._pick_static(r < 0.04, self._land_list)
        if bool(hit.any()):
            rows = hit.nonzero(as_tuple=True)[0]
            area = tiles_from_offsets(tile[rows], self._off1, self.W, self.H)  # [R, 7]
            M = area.shape[1]
            rrm = rows.unsqueeze(1).expand(-1, M).reshape(-1)
            af = area.reshape(-1)
            valid = af >= 0
            self._scorch(rrm[valid], af[valid])  # a storm scorches its whole area
            on = valid & self.desert[rrm, af.clamp(min=0)]
            self._fertilize(rrm[on], af[on])  # ...and deposits silt on desert tiles

    def _buildable(self) -> torch.Tensor:
        """[B, C, NB] buildings each city could queue now: unlocked (tech), not
        already built, river gate — and for district buildings, the city owns a
        completed district of the required type and has a prerequisite building
        (mirrors availableBuildings)."""
        if self._bld_cache is not None and self._bld_cache[0] == self._eff_version:  # D-8
            return self._bld_cache[1]
        rd = self.rules_dev
        B, C, NB, dev = self.B, self.C, self.NB, self.device
        unlocked = torch.where(
            rd.b_unlock.unsqueeze(0) >= 0,
            self.techs.gather(1, rd.b_unlock.clamp(min=0).unsqueeze(0).expand(B, -1)),
            torch.ones(B, NB, dtype=torch.bool, device=dev),
        )
        unlocked_civic = torch.where(
            rd.b_unlock_civic.unsqueeze(0) >= 0,
            self.civics.gather(1, rd.b_unlock_civic.clamp(min=0).unsqueeze(0).expand(B, -1)),
            torch.ones(B, NB, dtype=torch.bool, device=dev),
        )  # Temple/Amphitheater/… gate on a civic (mirrors availableBuildings' unlocks.buildings)
        unlocked = unlocked & unlocked_civic
        base = unlocked.unsqueeze(1) & ~self.buildings & (~rd.b_river.view(1, 1, -1) | self.river_center.unsqueeze(2))
        if self.districts_on and self._b_has_reqs:
            nD = len(self.districts_cat)
            valid = (self.district >= 0) & self.district_complete & (self.owner >= 0) & ~self.district_dead  # [B, T] (buildingCompletable: district DONE; captured = dead)
            ow_oh = torch.nn.functional.one_hot(self.owner.clamp(min=0), C).bool() & valid.unsqueeze(2)  # [B, T, C]
            dt_oh = torch.nn.functional.one_hot(self.district.clamp(min=0), nD).bool()  # [B, T, nD]
            has_dtype = (ow_oh.unsqueeze(3) & dt_oh.unsqueeze(2)).any(dim=1)  # [B, C, nD] city owns a district of type d
            rq = self._b_req_district  # [NB]
            district_ok = (rq < 0).view(1, 1, NB) | has_dtype[:, :, rq.clamp(min=0)]  # [B, C, NB]
            prereq_ok = torch.ones(B, C, NB, dtype=torch.bool, device=dev)
            for nb, reqs in enumerate(self._b_req_buildings):
                if reqs:
                    prereq_ok[:, :, nb] = self.buildings[:, :, reqs].any(dim=2)
            base = base & district_ok & prereq_ok
        self._bld_cache = (self._eff_version, base)
        return base

    def _adj_district_count(self) -> torch.Tensor:
        """[B, T] number of adjacent COMPLETED districts — the DISTRICT adjacency
        source. Counts player city centers (center_at), player specialty
        districts (self.district) and rival city centers (rvcity_at, which set
        tile.district='CITY_CENTER' in the TS engine). No owner filter, mirroring
        matchesAdjacency('DISTRICT')."""
        if self._adjd_cache is not None and self._adjd_cache[0] == self._eff_version:  # D-3
            return self._adjd_cache[1]
        nb = self.neigh
        nbc = nb.clamp(min=0)
        on_map = (nb >= 0).unsqueeze(0)  # [1, T, 6]
        is_d = ((self.center_at[:, nbc] >= 0) | ((self.district[:, nbc] >= 0) & self.district_complete[:, nbc]) | (self.rvcity_at[:, nbc] >= 0)) & on_map
        out = is_d.sum(dim=2)  # [B, T]
        self._adjd_cache = (self._eff_version, out)
        return out

    def _adj_center_count(self) -> torch.Tensor:
        """[B, T] adjacent CITY_CENTER districts (player centers + rival centers) —
        the CITY_CENTER adjacency source. matchesAdjacency('CITY_CENTER')."""
        if self._adjc_cache is not None and self._adjc_cache[0] == self._eff_version:  # D-3
            return self._adjc_cache[1]
        nb = self.neigh
        nbc = nb.clamp(min=0)
        on_map = (nb >= 0).unsqueeze(0)
        is_c = ((self.center_at[:, nbc] >= 0) | (self.rvcity_at[:, nbc] >= 0)) & on_map
        out = is_c.sum(dim=2)
        self._adjc_cache = (self._eff_version, out)
        return out

    def _adj_harbor_count(self) -> torch.Tensor:
        """[B, T] adjacent completed HARBOR districts — the HARBOR_DISTRICT source
        (Commercial Hub +2/harbor). Empty until Harbors are placeable (D6b)."""
        if self._harbor_idx < 0:
            return torch.zeros(self.B, self.T, dtype=torch.long, device=self.device)
        if self._adjh_cache is not None and self._adjh_cache[0] == self._eff_version:  # D-3
            return self._adjh_cache[1]
        nb = self.neigh
        nbc = nb.clamp(min=0)
        on_map = (nb >= 0).unsqueeze(0)
        is_h = (self.district[:, nbc] == self._harbor_idx) & self.district_complete[:, nbc] & on_map
        out = is_h.sum(dim=2)
        self._adjh_cache = (self._eff_version, out)
        return out

    def _adj_dtype_complete(self, di: int) -> torch.Tensor:
        """A-4: [B, T] bool — any adjacent COMPLETED district of type di
        (wonder adjacentDistrict requirement; no owner filter, like TS
        canPlaceWonder's neighbor scan)."""
        nb = self.neigh
        nbc = nb.clamp(min=0)
        hit = (self.district[:, nbc] == di) & self.district_complete[:, nbc] & (nb >= 0).unsqueeze(0)
        return hit.any(dim=2)

    def _adj_res_live(self, ri: int) -> torch.Tensor:
        """A-4: [B, T] bool — any adjacent tile with LIVE resource ri
        (Stonehenge's stone: a C-6-stripped bonus resource is GONE in TS)."""
        nb = self.neigh
        nbc = nb.clamp(min=0)
        hit = (self.res_id[:, nbc] == ri) & ~self.res_stripped[:, nbc] & (nb >= 0).unsqueeze(0)
        return hit.any(dim=2)

    def _adopted_gov(self, civics2: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """A-7r: (adopted government index [B], has_gov [B]) for a seat's
        researched civics [B, NC] — the newest unlocked government, highest
        tier with ties broken by lowest table index (effects.computeAdoption)."""
        B, dev = civics2.shape[0], self.device
        guc = self._gov_unlock_civic  # [nGov]
        gov_unlocked = torch.where(
            guc.unsqueeze(0) >= 0,
            civics2.gather(1, guc.clamp(min=0).unsqueeze(0).expand(B, -1)),
            torch.ones(B, self._ngov, dtype=torch.bool, device=dev),
        )  # [B, nGov]
        has_gov = gov_unlocked.any(dim=1)  # [B]
        score = torch.where(
            gov_unlocked,
            self._gov_tier.unsqueeze(0) * self._ngov - self._gov_arange.unsqueeze(0),
            torch.full((B, self._ngov), -(10 ** 9), dtype=torch.long, device=dev),
        )
        return score.argmax(dim=1), has_gov

    def _adopted_gov_tier(self, civics2: torch.Tensor) -> torch.Tensor:
        """A-7r: [B] the adopted government's tier (0 if none) — the
        GOV_INFLUENCE_TIER lookup, which equals the government tier by
        definition (data/cityStates.ts) — added to the city-state influence
        rate exactly like cityStatePhase (cityStates.ts:248-249)."""
        B = civics2.shape[0]
        if not self._ngov:
            return torch.zeros(B, dtype=torch.long, device=self.device)
        adopted, has_gov = self._adopted_gov(civics2)
        return torch.where(has_gov, self._gov_tier[adopted], torch.zeros(B, dtype=torch.long, device=self.device))

    def _gov_policy_mods(self, civics2: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """A-7r: ([B,6] cityYields, [B,6] capitalYields, [B] housingAll,
        [B,6] yieldMult, [B,nPol] slotted-mask) from a
        seat's adopted government + greedily slotted policies, computed from
        its researched civics [B, NC]. The effects.computeAdoption /
        applyGovernment twin for the cityYields+capitalYields+housingAll
        channels. #46r: WILDCARD slots fill with the within-kind OVERFLOW in
        card-table order (TS findIndex: a card whose kind slots are full takes
        the first open W; every catalog government lists its W slots LAST, so
        kind-first matches findIndex — MONARCHY's W takes GOD_KING at ~t117).
        housingAll is the PLAYER-only channel: TS rivalHousing is mods-free,
        so the rival call sites discard it."""
        B = civics2.shape[0]
        dev, dt = self.device, self.dtype
        city_y = torch.zeros(B, 6, dtype=dt, device=dev)
        cap_y = torch.zeros(B, 6, dtype=dt, device=dev)
        hous_all = torch.zeros(B, dtype=dt, device=dev)
        ymult = torch.ones(B, 6, dtype=dt, device=dev)
        slotted = torch.zeros(B, self._npol, dtype=torch.bool, device=dev)
        if not self._gov_has_effects or not self._ngov:
            return city_y, cap_y, hous_all, ymult, slotted
        adopted, has_gov = self._adopted_gov(civics2)
        gmask = has_gov.to(dt).unsqueeze(1)
        city_y = city_y + self._gov_city_y[adopted] * gmask
        cap_y = cap_y + self._gov_cap_y[adopted] * gmask
        hous_all = hous_all + self._gov_housing[adopted] * has_gov.to(dt)
        ymult = torch.where(has_gov.unsqueeze(1), self._gov_ymult[adopted], ymult)
        if self._npol:
            nslots = self._gov_slots[adopted] * has_gov.long().unsqueeze(1)  # [B, 4]
            puc = self._pol_unlock_civic  # [nPol]
            pol_unlocked = torch.where(
                puc.unsqueeze(0) >= 0,
                civics2.gather(1, puc.clamp(min=0).unsqueeze(0).expand(B, -1)),
                torch.zeros(B, self._npol, dtype=torch.bool, device=dev),
            )  # [B, nPol]
            for k in range(3):  # military/economic/diplomatic
                uk = pol_unlocked & (self._pol_kind == k).unsqueeze(0)  # [B, nPol]
                cum = uk.long().cumsum(dim=1)  # inclusive rank among unlocked-of-kind, table order
                slotted = slotted | (uk & (cum <= nslots[:, k : k + 1]))
            # #46r wildcard: unlocked cards whose kind slots are full spill
            # into W slots in table order, up to the W count.
            overflow = pol_unlocked & ~slotted
            w_rank = overflow.long().cumsum(dim=1)
            slotted = slotted | (overflow & (w_rank <= nslots[:, 3:4]))
            sd = slotted.to(dt)
            city_y = city_y + sd @ self._pol_city_y
            cap_y = cap_y + sd @ self._pol_cap_y
            hous_all = hous_all + sd @ self._pol_housing
        return city_y, cap_y, hous_all, ymult, slotted

    def _gov_policy_mods_cached(self, seat_tag, civics2: torch.Tensor):
        """G1: (seat_tag, _eff_version)-keyed wrapper over _gov_policy_mods. The
        only mutable input is civics2 (a seat's researched civics); every civic
        completion bumps _eff_version (player engine.py:9021, rival 7852), so the
        eff epoch is a complete key. seat_tag is 'p' (player) or the rival index —
        we key on the tag, never hash the tensor. Consumers only READ the returned
        tuple (verified at 2293/2324/2367/2372/2711/2993/5855), so sharing one
        object across the per-city loop is safe."""
        if self._gov_pol_cache is None or self._gov_pol_cache[0] != self._eff_version:
            self._gov_pol_cache = (self._eff_version, {})
        d = self._gov_pol_cache[1]
        v = d.get(seat_tag)
        if v is None:
            v = self._gov_policy_mods(civics2)
            d[seat_tag] = v
        return v

    def _district_adj_raw(self, di: int, adjc: torch.Tensor) -> torch.Tensor:
        """[B, T] UNFLOORED districtAdjacency for district di: static (d_static_adj)
        + 0.5·adjacent-districts + CITY_CENTER·adjacent-centers + HARBOR_DISTRICT·
        adjacent-harbors. Callers floor it. The center is counted BOTH by the
        DISTRICT source (in adjc) and by CITY_CENTER — e.g. Harbor gets +2.5/center."""
        raw = self.d_static_adj[:, :, di] + 0.5 * adjc
        if float(self._dyn_center[di]) != 0:
            raw = raw + self._dyn_center[di] * self._adj_center_count().to(self.dtype)
        if float(self._dyn_harbor[di]) != 0:
            raw = raw + self._dyn_harbor[di] * self._adj_harbor_count().to(self.dtype)
        # B-16 (GS Industrial Zone): adjacent MINE/QUARRY improvements + adjacent
        # completed AQUEDUCT. Amounts are nonzero only for the Industrial Zone,
        # which is never placed in the current gate — inert but catalog-faithful.
        if float(self._dyn_mine[di]) != 0 or float(self._dyn_quarry[di]) != 0 or float(self._dyn_aqueduct[di]) != 0:
            nb = self.neigh
            nbc = nb.clamp(min=0)
            on_map = (nb >= 0).unsqueeze(0)
            if float(self._dyn_mine[di]) != 0:
                cnt = ((self.improvement[:, nbc] == self._mine_iidx) & on_map).sum(dim=2)
                raw = raw + self._dyn_mine[di] * cnt.to(self.dtype)
            if float(self._dyn_quarry[di]) != 0:
                cnt = ((self.improvement[:, nbc] == self._quarry_iidx) & on_map).sum(dim=2)
                raw = raw + self._dyn_quarry[di] * cnt.to(self.dtype)
            if float(self._dyn_aqueduct[di]) != 0 and self._aqueduct_idx >= 0:
                cnt = ((self.district[:, nbc] == self._aqueduct_idx) & self.district_complete[:, nbc] & on_map).sum(dim=2)
                raw = raw + self._dyn_aqueduct[di] * cnt.to(self.dtype)
        return raw

    def _district_adj_floor(self, di: int) -> torch.Tensor:
        """G5: (di, _eff_version)-keyed memo of floor(_district_adj_raw(di,
        _adj_district_count())) — the exact expression every caller built
        fresh (14.4k calls/run). Sound: d_static_adj's four in-place
        mutation sites all bump _eff_version, the three adjacency-count
        helpers are D-3 eff-cached, and improvement/district planes bump
        eff at their mutation sites. Callers only gather/multiply the
        returned plane — read-only sharing."""
        if self._dadj_cache is None or self._dadj_cache[0] != self._eff_version:
            self._dadj_cache = (self._eff_version, {})
        d = self._dadj_cache[1]
        v = d.get(di)
        if v is None:
            v = torch.floor(self._district_adj_raw(di, self._adj_district_count().to(self.dtype)))
            d[di] = v
        return v

    def _place_district(self, di: int, want: torch.Tensor, c: int, placement: int = 0) -> tuple[torch.Tensor, torch.Tensor]:
        """QUEUE district-type `di` in city slot `c` on its best tile, for batch
        rows where `want` is set AND an eligible tile exists. Mirrors the exporter's
        best-tile scan: eligible = owned by city c, district-placeable, empty (no
        district/improvement), no LUXURY/STRATEGIC resource (AUDIT C-6: bonus
        tiles are pickable and the pave strips the resource, the real Civ 6
        rule), within radius 3, not
        the center; ranked by floor(static + 0.5·adjacent-completed-districts),
        ties to lowest tile index. placement=1 (Aqueduct): adjacent-center + water
        source; placement=3 (Encampment): NOT adjacent-center. P2: queueDistrict
        semantics — the tile is paved INCOMPLETE and its feature stripped
        (tile.feature = null); completion arrives via the production loop.
        Recomputes adjacency each call, so placing city-by-city in slot order
        reproduces the replay's sequential act.p loop. Returns ([B] placed, [B] tile)."""
        B, T, dev = self.B, self.T, self.device
        site_c = self.site[:, c].clamp(min=0)
        surface = self.coastal_water if placement == 2 else self.d_usable  # Harbor sits on coastal water, others on land
        elig = ((self.owner == c) & surface & (self.district < 0) & (self.built_wonder < 0) & (self.improvement < 0) & (self.res_priority <= 1) & (self.dist[:, c] <= 3))  # C-6/A-4
        elig[torch.arange(B, device=dev), site_c] = False
        if placement in (1, 3):  # no-adjacency-yield districts (Aqueduct / Encampment)
            cc = self._adj_center_count()  # [B, T] adjacent CITY_CENTERs (any player/rival) — matches TS requires/notAdjacentToCityCenter
            elig = elig & ((cc >= 1) & self.aqsrc if placement == 1 else (cc == 0))  # Aqueduct: adjacent-center+water; Encampment: NOT adjacent-center
            adjf = torch.zeros(B, T, dtype=self.dtype, device=dev)  # no yield → lowest-index tie-break
        else:  # economic (land) or Harbor (coastal) — full districtAdjacency
            adjf = self._district_adj_floor(di)  # [B, T] (G5 memo)
        key = torch.where(elig, adjf * T - self._arangeT_f, self._neg_f)  # D-7
        best = key.argmax(dim=1)  # [B]
        place = want & elig.any(dim=1)
        if bool(place.any()):
            rows = place.nonzero(as_tuple=True)[0]
            bt = best[rows]
            self.district[rows, bt] = di
            self.district_complete[rows, bt] = False  # P2: queued, not complete
            self._strip_feature_at(rows, bt)  # queueDistrict: tile.feature = null
            # C-6: queueDistrict removes a bonus resource (only priority-1
            # tiles carrying a resource are eligible at all); a FRESH sea
            # strip withdraws its lent SEA_RESOURCE adjacency (live in TS)
            fresh_rs = (self.res_priority[rows, bt] == 1) & ~self.res_stripped[rows, bt]
            self.res_stripped[rows, bt] = self.res_stripped[rows, bt] | (self.res_priority[rows, bt] == 1)
            self._withdraw_sea_adj(rows[fresh_rs], bt[fresh_rs])
            self._eff_version += 1
        return place, best

    def _place_district_rival(self, r: int, j: int, di: int, want: torch.Tensor, placement: int = 0) -> torch.Tensor:
        """C1-B4: the rival twin of _place_district — same rank (best
        floor(static + 0.5·adjacent-completed), ties lowest tile index), rival
        eligibility (civ-owned via rival_at, district-usable, empty,
        unimproved, within radius 3 of THIS city's center, not the center) —
        and it QUEUES rather than completes: tile paved (district set,
        complete stays False), rc_qtile remembers the completion target, the
        per-city registry gains the type. Returns the placed mask."""
        B, T, dev = self.B, self.T, self.device
        center = self.rc_center[:, r, j].clamp(min=0)
        surface = self.coastal_water if placement == 2 else self.d_usable
        d_center = self.pair_dist[center]  # [B, T]
        elig = (
            (self.rival_at == r)
            & surface
            & (self.district < 0)
            & (self.built_wonder < 0)  # A-4
            & (self.rvcity_at < 0)  # sibling centers carry district='CITY_CENTER' in TS
            & (self.improvement < 0)
            & (d_center <= 3)
        )
        elig[torch.arange(B, device=dev), center] = False
        if placement in (1, 3):
            cc = self._adj_center_count()
            elig = elig & ((cc >= 1) & self.aqsrc if placement == 1 else (cc == 0))
            adjf = torch.zeros(B, T, dtype=self.dtype, device=dev)
        else:
            adjf = self._district_adj_floor(di)  # (G5 memo)
        key = torch.where(elig, adjf * T - self._arangeT_f, self._neg_f)  # D-7
        best = key.argmax(dim=1)
        place = want & elig.any(dim=1)
        if bool(place.any()):
            rows = place.nonzero(as_tuple=True)[0]
            self.district[rows, best[rows]] = di
            self.rc_qtile[rows, r, j] = best[rows]
            self.rc_dist_tile[rows, r, j, di] = best[rows]
            self.improvement[rows, best[rows]] = -1  # queueDistrict clears it
            # C-6: the rival pave strips a bonus resource too (TS
            # tryQueueRivalDistrict gained the queueDistrict rule); fresh
            # sea strips withdraw their lent SEA_RESOURCE adjacency
            bt_r = best[rows]
            fresh_rs = (self.res_priority[rows, bt_r] == 1) & ~self.res_stripped[rows, bt_r]
            self.res_stripped[rows, bt_r] = self.res_stripped[rows, bt_r] | (self.res_priority[rows, bt_r] == 1)
            self._withdraw_sea_adj(rows[fresh_rs], bt_r[fresh_rs])
            self._eff_version += 1
        return place

    def _advance_player_great_people(self) -> None:
        """Mirrors advanceGreatPeople (runs after research, after rivalPhase has
        claimed): each class accrues 1 + (its district's built buildings) per
        city owning a completed district of its type, earns the n-th person at
        gp_costs[n] from the shared gp_earned pool, and applies its effect —
        science→current tech, culture→current civic, gold→treasury,
        production→capital build head. Only Campus/Holy Site/Commercial Hub are
        placeable, so only Scientist/Prophet/Merchant ever accrue."""
        if not self.districts_on or self._gp_nc == 0:
            return
        B, C, dev, nCls = self.B, self.C, self.device, self._gp_nc
        owner_oh = torch.nn.functional.one_hot(self.owner.clamp(min=0), C).bool() & (self.owner >= 0).unsqueeze(2)  # [B,T,C]
        for cls in range(nCls):
            d = int(self._gp_class_district[cls])
            if d < 0:
                continue
            has_d = (((self.district == d) & self.district_complete & ~self.district_dead).unsqueeze(2) & owner_oh).any(dim=1)  # [B,C] city owns a completed LIVE district d
            in_d = self._b_req_district == d  # [NB] buildings of district d
            bcount = self.buildings[:, :, in_d].to(self.dtype).sum(dim=2)  # [B,C]
            self.player_gp_points[:, cls] = self.player_gp_points[:, cls] + (has_d.to(self.dtype) * (1.0 + bcount)).sum(dim=1)
        maxN = self._gp_effects.shape[1]
        for _ in range(maxN):  # usually one earn per class per turn; loop covers the roster
            earned = self.gp_earned[:, :nCls]
            cost = self._gp_costs[earned.clamp(max=self._gp_costs.shape[0] - 1)]  # [B,nCls] gpCost(earned)
            can = (earned < self._gp_roster[:nCls].unsqueeze(0)) & (self.player_gp_points >= cost)
            if not bool(can.any()):
                break
            eff = self._gp_effects[torch.arange(nCls, device=dev).view(1, nCls), earned.clamp(max=maxN - 1)]  # [B,nCls,5] (col 4 = faith)
            cf = can.to(self.dtype)
            self.tech_prog = self.tech_prog + (eff[:, :, 0] * cf).sum(dim=1)  # science → current tech (banks for next turn)
            self.civic_prog = self.civic_prog + (eff[:, :, 1] * cf).sum(dim=1)  # culture → current civic
            self.treasury = self.treasury + (eff[:, :, 2] * cf).sum(dim=1)  # gold → treasury
            if self._gp_effects.shape[2] > 4:  # G-2: faith → player's faith bank (mirrors the rival loop)
                self.player_faith = self.player_faith + (eff[:, :, 4].double() * cf.double()).sum(dim=1)
            prod = (eff[:, :, 3] * cf).sum(dim=1)  # production → capital's current build head
            if bool((prod != 0).any()):
                has_build = self.alive[:, 0] & (self.current[:, 0] >= 0)
                self.progress[:, 0] = self.progress[:, 0] + torch.where(has_build, prod, torch.zeros_like(prod))
            self.player_gp_points = self.player_gp_points - cost * cf
            self.gp_earned[:, :nCls] = earned + can.long()

    def _spread_religious_pressure(self) -> None:
        """B-18 (mirror of TS spreadReligiousPressure): each founded religion's
        HOLY tile (holy_tile[:, g], the founding capital center, frozen) adds +1
        integer pressure to every LIVE city within range; each city then follows
        the religion with the most pressure (>0), ties to the lowest id (argmax
        returns the first max). Religions are the unified civ ids: g=0 player,
        g=i+1 rival i. Deterministic, zero-RNG. INERT — city_followed/rc_followed
        are NOT read by yields or the trace yet (coupling deferred, §T).

        KILL hygiene: dead/absent slots are zeroed each turn (torch.where on the
        alive mask), so a razed-then-reused slot starts fresh — the TS mirror is
        the fresh City object a founded/flipped city gets. rc_pressure/rc_followed
        permute with their city in _reclaim_rc, so pressure tracks the CITY, not
        the slot, through compaction."""
        RANGE = self._pressure_range
        B, O = self.B, self._O
        founded = self.holy_tile >= 0  # [B, O]
        ht = self.holy_tile.clamp(min=0)  # [B, O] valid tile idx (masked where unfounded)
        # --- player cities [B, C] ------------------------------------------
        pc = self.site.clamp(min=0)  # [B, C] center tile (dead slots -> 0, masked out)
        d_pc = self.pair_dist[pc.unsqueeze(2), ht.unsqueeze(1)].to(torch.long)  # [B, C, O]
        add_pc = (d_pc <= RANGE) & founded.unsqueeze(1) & self.alive.unsqueeze(2)  # [B, C, O]
        self.city_pressure = torch.where(self.alive.unsqueeze(2), self.city_pressure + add_pc.long(), torch.zeros_like(self.city_pressure))
        tot_pc = self.city_pressure.sum(dim=2)
        best_pc = self.city_pressure.argmax(dim=2)  # ties -> lowest id
        self.city_followed = torch.where(self.alive & (tot_pc > 0), best_pc, torch.full_like(best_pc, -1))
        # --- rival cities [B, r_pad, rc_pad] -------------------------------
        if self.R > 0:
            rcc = self.rc_center.clamp(min=0)  # [B, R, RC]
            d_rc = self.pair_dist[rcc.unsqueeze(3), ht.view(B, 1, 1, O)].to(torch.long)  # [B, R, RC, O]
            add_rc = (d_rc <= RANGE) & founded.view(B, 1, 1, O) & self.rc_alive.unsqueeze(3)
            self.rc_pressure = torch.where(self.rc_alive.unsqueeze(3), self.rc_pressure + add_rc.long(), torch.zeros_like(self.rc_pressure))
            tot_rc = self.rc_pressure.sum(dim=3)
            best_rc = self.rc_pressure.argmax(dim=3)
            self.rc_followed = torch.where(self.rc_alive & (tot_rc > 0), best_rc, torch.full_like(best_rc, -1))

    def _farmadj_qual(self) -> torch.Tensor:
        """[B, T] bool: a non-pillaged FARM with >=2 neighboring FARM tiles
        (yields.ts:60). Tile-based and CIV-INDEPENDENT — the per-civ tier
        (Feudalism + Replaceable Parts) multiplies it, so the player and each
        rival reuse this same qualifying set."""
        if self._fadjq_cache is not None and self._fadjq_cache[0] == self._eff_version:  # D-5
            return self._fadjq_cache[1]
        nb = self.neigh
        nbc = nb.clamp(min=0)
        farm_imp = self.improvement == self.FARM  # pillaged neighbors still count
        adj = farm_imp[:, nbc] & (nb >= 0).unsqueeze(0)  # [B, T, 6]
        out = (self.improvement == self.FARM) & ~self.pillaged & (adj.sum(dim=2) >= 2)
        self._fadjq_cache = (self._eff_version, out)
        return out

    def _farmadj_tier(self, civics: torch.Tensor, techs: torch.Tensor) -> torch.Tensor:
        """[B] a civ's farm-adjacency tier from ITS OWN civics/techs (Feudalism
        +1, Replaceable Parts +1). civics/techs are [B, n] for that civ."""
        tier = torch.zeros(self.B, dtype=torch.long, device=self.device)
        if self._farmadj_civic >= 0:
            tier = tier + civics[:, self._farmadj_civic].long()
        if self._farmadj_tech >= 0:
            tier = tier + techs[:, self._farmadj_tech].long()
        return tier

    def _farmadj_food(self) -> torch.Tensor:
        """[B, T] the PLAYER'S farm-adjacency food bonus = qual * player tier.
        Each rival adds its OWN via _farmadj_qual*_farmadj_tier in
        _rival_city_yields (every civ applies its own research boosts, Civ 6)."""
        if self._fadjf_cache is not None and self._fadjf_cache[0] == self._eff_version:  # D-5: computed 2×/_city_totals
            return self._fadjf_cache[1]
        z = torch.zeros(self.B, self.T, dtype=self.dtype, device=self.device)
        if not self.improvements_on:
            out = z
        else:
            tier = self._farmadj_tier(self.civics, self.techs)
            if not bool((tier > 0).any()):
                out = z
            else:
                out = self._farmadj_qual().to(self.dtype) * tier.unsqueeze(1).to(self.dtype)
        self._fadjf_cache = (self._eff_version, out)
        return out

    def _city_totals(self, lux: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Per-city yields/housing/growth-factor from the current state:
        (total [B, C, 6] alive-masked, housing [B, C], growth_f [B, C]).
        Mirrors computeCityStats — used both inside step() and to score.

        lux: optional FROZEN luxury-amenity map [B, C]. TS endTurn computes
        luxuryAmenities(state) ONCE before its city loop (game.ts:667) and
        feeds that same map to every city's fresh computeCityStats — so the
        city walk's guard-triggered recomputes must NOT re-rank luxuries
        with mid-walk pops (D-12's tighter bands turned that flicker into a
        real tier split: rng 2026006142 t160, city 522 Content-vs-Displeased
        for one apply). The freshly computed map is stashed on _last_lux for
        the walk to freeze."""
        r, B, C, T, dev = self.rules, self.B, self.C, self.T, self.device
        rd = self.rules_dev

        # Workable candidates live within the radius-3 window (37 offsets) —
        # scoring only that window (5b) keeps the exact same candidate set,
        # per-tile keys and topk order as the full-map scan, 30× smaller.
        eff_y = self._eff_yields()  # disasters make food dynamic
        if self._score_cache is not None and self._score_cache[0] == self._eff_version:
            tile_score = self._score_cache[1]
        else:
            tile_score = (eff_y * rd.focus_base).sum(dim=2)  # [B, T]
            # PLAYER farm-adjacency food also scores tiles for selection
            # (TS assignWorkedTiles uses tileScore WITH the bonus).
            tile_score = tile_score + self._farmadj_food() * float(rd.focus_base[0])
            self._score_cache = (self._eff_version, tile_score)
        tiles = tiles_from_offsets(self.site.clamp(min=0).reshape(-1), self._off3, self.W, self.H).reshape(B, C, -1)
        M = tiles.shape[2]
        tc = tiles.clamp(min=0)
        tcf = tc.reshape(B, -1)
        slot_ids = torch.arange(C, device=dev).view(1, C, 1)
        cand = (
            (tiles >= 0)
            & (self.owner.gather(1, tcf).reshape(B, C, M) == slot_ids)
            & self.workable.gather(1, tcf).reshape(B, C, M)
            & (self.dist.gather(2, tc) <= 3)
            & (tiles != self.site.unsqueeze(2))
            & (self.district.gather(1, tcf).reshape(B, C, M) < 0)  # district tiles are paved (mirrors workableTiles !t.district)
            # Task-#39 forced-gate catch (rng 2026006084 t193): workableTiles
            # excludes builtWonder tiles too (city.ts:121) — the A-4 sweep
            # covered the RIVAL walks but the player only meets an in-flight
            # wonder pave by CAPTURING it; a citizen worked the zero-yield
            # tile here while TS worked a real one.
            & (self.built_wonder.gather(1, tcf).reshape(B, C, M) < 0)
        )  # [B, C, M]
        score = torch.where(cand, tile_score.gather(1, tcf).reshape(B, C, M), torch.tensor(-1e18, dtype=self.dtype, device=dev))
        score = score - tc.to(self.dtype) * 1e-9  # tie: lowest index first
        k = min(max(int(self.pop.max().item()), 1), M)
        top_scores, top_idx = score.topk(k, dim=2)
        take = (torch.arange(k, device=dev).view(1, 1, k) < self.pop.unsqueeze(2)) & (top_scores > -1e17)
        top_tile = tc.gather(2, top_idx)  # [B, C, k] global tile ids
        ty = eff_y.unsqueeze(1).expand(B, C, T, 6).gather(2, top_tile.unsqueeze(-1).expand(B, C, k, 6))
        worked_y = (ty * take.unsqueeze(-1).to(self.dtype)).sum(dim=2)  # [B, C, 6]
        # PLAYER-only farm-adjacency food, summed over the worked FARM tiles.
        fadj = self._farmadj_food()  # [B, T]
        fadj_w = (fadj.unsqueeze(1).expand(B, C, T).gather(2, top_tile) * take.to(self.dtype)).sum(dim=2)  # [B, C]
        worked_y = worked_y.clone()
        worked_y[:, :, 0] = worked_y[:, :, 0] + fadj_w

        # D-10: walk-scoped sub-term cache. The step() walk's guard-triggered
        # recomputes (lux is not None — the frozen luxMap path) mostly fire on
        # POP-only changes; every term below that doesn't read pop is then
        # bit-identical to the last compute. Keyed on _eff_version: every
        # non-pop mutation inside the walk (completion, claim, purchase...)
        # bumps it, and out-of-walk consumers (trace/empire_score, lux=None)
        # never read the cache — they always recompute and refresh the store,
        # so a hit can only return values a fresh recompute would reproduce.
        cc = None
        if lux is not None and self._ct_cache is not None and self._ct_cache[0] == self._eff_version:
            cc = self._ct_cache[1]
        if cc is not None:
            b_y = cc["b_y"]
        else:
            bf = self.buildings.to(self.dtype)
            b_y = torch.einsum("bcn,nk->bck", bf, rd.b_yields)
        center_y = self.center_yields
        if self.disasters:
            # fertility/drought hit the center's RAW food before the min-clamp
            sitec = self.site.clamp(min=0)
            cf = self.center_raw_food + self.fertility.gather(1, sitec).to(self.dtype)
            cf = torch.where(self.drought.gather(1, sitec) > 0, (cf - 1).clamp(min=0), cf)
            center_y = self.center_yields.clone()
            center_y[:, :, 0] = torch.maximum(cf, torch.full_like(cf, float(r.center_min_food)))
        total = worked_y + center_y + self.is_cap.unsqueeze(2).to(self.dtype) * self._palace_y.view(1, 1, 6) + b_y
        # B-18: per-PLAYER-city FOLLOWER-belief id (from followedReligion when
        # LIVE, else player religion 0 = -1 follower = no add; INERT byte-exact).
        # Its building-yield adds (Feed the World / Choral Music) land at the
        # buildings position (pre-amenity), like cityBuildingYields' beliefAdd.
        # Computed fresh (not cached): the term is pop-free but city_followed can
        # change between turns without an _eff_version bump.
        _pcfol = self._follower_id_for(self._city_rel_player()) if self._bel_any else None
        if _pcfol is not None:
            # (.to(self.dtype): the fol tables are f64 for the rival paths; the
            # player walk runs in self.dtype — f32 under gumbel/training, where
            # the raw f64 table would break the einsum. No-op under parity f64.)
            _fol_by = torch.einsum("bcn,bcnk->bck", self.buildings.to(self.dtype), self._fol_tab("bldgY", _pcfol).to(self.dtype))
            total = total + _fol_by
        if self.districts_on:
            if cc is not None:
                # D-10: the whole block is pop-free — replay the cached per-
                # district addends in catalog order (same adds, same
                # association as the miss path below).
                d_addends = cc["d_addends"]
                ship_add = cc["ship_add"]
                d_maint = cc["d_maint"]
                has_aq = cc["has_aq"]
                dcount_all = cc["dcount_all"]  # #46r: INSULAE's housingIfDistricts
                spec_count = cc["spec_count"]  # B-18: Zen Meditation specialty count
                hs_adj = cc["hs_adj"]  # B-18: Holy Site adjacency (follower Work Ethic)
            else:
                # District adjacency yields (D2b: Campus science only, placed where no
                # dynamic source is live so the value is purely floor(static);
                # dynamic sources + other district types are D3). Mirrors
                # cityDistrictYields: floor(adjacency) into the district's yield
                # column, summed into the pre-amenity total.
                dt = self.district.gather(1, tcf).reshape(B, C, M)
                owned_d = (tiles >= 0) & (self.owner.gather(1, tcf).reshape(B, C, M) == slot_ids)
                # yields/maintenance/Aqueduct housing all count COMPLETED districts
                owned_d = owned_d & self.district_complete.gather(1, tcf).reshape(B, C, M)
                owned_d = owned_d & ~self.district_dead.gather(1, tcf).reshape(B, C, M)  # P5/S1: captured = dead
                # #46r: per-city COMPLETED live district count (ALL types —
                # computeHousing's completedDistrictCount(state, city, false))
                dcount_all = owned_d.to(torch.long).sum(dim=2)  # [B, C]
                # B-18: per-city COMPLETED specialty district count (Zen Meditation min).
                spec_count = (owned_d & self._is_specialty[dt.clamp(min=0)]).to(torch.long).sum(dim=2)  # [B, C]
                # City-state district bonus (csEnvoyBonuses): a scientific/religious/…
                # CS at >=3 envoys grants +districtBonus (again at >=6) to each owned
                # completed district of its type. Sum per district idx here; the CS
                # yield equals that district's adjYield for every CS-associated type
                # (Campus→science, Holy Site→faith, Commercial Hub→gold, …), so it
                # lands in the same column as the adjacency below, pre-amenity-factor.
                nD = len(self.districts_cat)
                cs_dbonus = torch.zeros(B, nD, dtype=self.dtype, device=dev)
                if self.S > 0:
                    perD = ((self.cs_envoys >= 3).to(self.dtype) + (self.cs_envoys >= 6).to(self.dtype)) * self._cs_district_bonus
                    perD = perD * self.cs_alive.to(self.dtype)  # [B, S]
                    cs_dbonus.scatter_add_(1, self._cs_didx.clamp(min=0), perD)
                # For each PLACED district with an adjacencyYield: floor(static +
                # 0.5*adjacent-districts) into its yield column. Type-specific dynamic
                # sources (mine/quarry for IZ, city-center for Harbor, built-wonder
                # for Theater) are added when those types are placed (D3b-4+).
                # D-10: the two addends per district are built as a list and
                # applied below — total + adjSum + csTerm, the original
                # left-to-right association, cache hit or miss.
                d_addends = []
                hs_adj = None  # B-18: Holy Site floored adjacency (follower Work Ethic)
                for d in self.districts_cat:
                    yc = int(d.get("adjYield", -1))
                    if yc < 0:
                        continue
                    di = int(d["idx"])
                    adjv = self._district_adj_floor(di)  # [B, T] full districtAdjacency (G5 memo)
                    mask = owned_d & (dt == di)
                    dcount = mask.to(self.dtype).sum(dim=2)  # [B, C] owned completed type-di districts (0/1)
                    _adj_sum = (adjv.gather(1, tcf).reshape(B, C, M) * mask.to(self.dtype)).sum(dim=2)  # [B, C]
                    d_addends.append((yc, _adj_sum, cs_dbonus[:, di].unsqueeze(1) * dcount))
                    if di == self._hs_idx:
                        hs_adj = _adj_sum
                # SHIPYARD special (yields.ts:171): a city holding a Shipyard adds its completed
                # Harbor's full districtAdjacency as PRODUCTION — the SAME value that fed the Harbor's
                # gold above, re-read here as production, pre-amenity-factor like every district yield.
                ship_add = None
                if self._harbor_idx >= 0 and self._shipyard_bidx >= 0:
                    _hm = (owned_d & (dt == self._harbor_idx)).to(self.dtype)  # [B, C, M] this city's Harbor tiles
                    _hadj = self._district_adj_floor(self._harbor_idx)  # [B, T] (G5 memo)
                    _hadj_c = (_hadj.gather(1, tcf).reshape(B, C, M) * _hm).sum(dim=2)  # [B, C]
                    ship_add = _hadj_c * self.buildings[:, :, self._shipyard_bidx].to(self.dtype)
                # districtMaintenance: per-type upkeep (0 for City Center / Neighborhood
                # / Aqueduct, else 1); sum over the city's owned completed districts.
                d_maint = (self._d_maint[dt.clamp(min=0)] * (owned_d & (dt >= 0)).to(self.dtype)).sum(dim=2)
                # Aqueduct ownership feeds computeHousing below (D-10: hoisted
                # into the cacheable block — owned_d/dt live only on this path)
                has_aq = (owned_d & (dt == self._aqueduct_idx)).any(dim=2) if self._aqueduct_idx >= 0 else None
            for yc_a, adj_add, cs_add in d_addends:
                total[:, :, yc_a] = total[:, :, yc_a] + adj_add + cs_add
            # B-18: follower Work Ethic — Holy Site floored adjacency ALSO yields
            # production (yields.ts:154), keyed on each city's followed religion.
            if _pcfol is not None and hs_adj is not None:
                total[:, :, 1] = total[:, :, 1] + hs_adj * self._fol_tab("we", _pcfol).to(self.dtype)
            if ship_add is not None:
                total[:, :, 1] = total[:, :, 1] + ship_add
        popf = self.pop.to(self.dtype)
        total[:, :, 3] += popf * r.citizen_science
        total[:, :, 4] += popf * r.citizen_culture

        # City-state envoy bonuses land on the capital (mods.capitalYields),
        # summed before the amenity multiplier like every other bonus.
        if self.S > 0:
            tier1 = ((self.cs_envoys >= 1) & self.cs_alive).to(self.dtype) * self.rules.cs.get("capitalBonus", 2)
            cap_bonus = torch.zeros(B, 6, dtype=self.dtype, device=dev)
            cap_bonus.scatter_add_(1, self._cs_yidx, tier1)
            total[:, 0, :] += cap_bonus

        # A-7r: the player's adopted government + slotted policies — cityYields
        # to every city, capitalYields to the capital (computeCityStats'
        # `bonuses`, city.ts:445-447), summed pre-amenity-factor. Food (col 0)
        # is left unscaled by the amenity factor below, matching TS.
        if self._gov_has_effects:
            gpc_city, gpc_cap, gpc_hous, gpc_ymult, gpc_slotted = self._gov_policy_mods_cached("p", self.civics)
            total += gpc_city.unsqueeze(1)
            total += gpc_cap.unsqueeze(1) * self.is_cap.to(self.dtype).unsqueeze(2)
        else:
            gpc_hous = gpc_ymult = gpc_slotted = None

        amen_b = cc["amen_b"] if cc is not None else torch.einsum("bcn,n->bc", bf, rd.b_amenities)  # D-10
        amen_have = self.is_cap.to(self.dtype) * self._palace_amenities + amen_b
        amen_need = torch.ceil((popf - 2) / 2).clamp(min=0)
        lux_add = self._luxury_amenities(amen_have, amen_need) if lux is None else lux  # C1-B1: improved luxuries
        self._last_lux = lux_add  # the walk freezes this (TS: one luxMap per turn)
        amen_have = amen_have + lux_add
        # B-18: follower Zen Meditation — +amenities where the city's completed
        # specialty count meets the belief's min (city.ts:464), keyed per-city on
        # the followed religion. Integer terms => the balance sum stays exact.
        if _pcfol is not None and self.districts_on:
            _zen = self._fol_tab("zen", _pcfol).to(self.dtype)  # [B, C, 2] = min, amenities
            amen_have = amen_have + torch.where(spec_count.to(self.dtype) >= _zen[:, :, 0], _zen[:, :, 1], torch.zeros_like(_zen[:, :, 1]))
        # B-15: flat empire-wide war-weariness drag, applied after the luxury
        # grant (mirrors city.ts `have -= warWearinessPenalty(...)`).
        balance = amen_have - amen_need - self._ww_penalty_player().unsqueeze(1)
        growth_f, yield_f = self._amenity_factors(balance)
        # Amenity-tier INDEX (0 Ecstatic … 4 Unhappy) — loyalty reads it.
        tier_idx = torch.full_like(self.pop, len(self.rules.amenity_tiers) - 1)
        for i in reversed(range(len(self.rules.amenity_tiers))):
            tier_idx = torch.where(balance >= self.rules.amenity_tiers[i][0], torch.full_like(tier_idx, i), tier_idx)
        total[:, :, 1:] *= yield_f.unsqueeze(2)  # non-food × amenity factor
        # #46r: government yieldMult AFTER the tier factor — TS
        # computeCityStats order (tier.yieldFactor at city.ts:483, then the
        # m.yieldMult loop). MERCHANT_REPUBLIC gold ×1.1 was the
        # rng-2026006082 t249 off-script catch.
        if gpc_ymult is not None:
            total = total * gpc_ymult.unsqueeze(1)
        maint_b = cc["maint_b"] if cc is not None else torch.einsum("bcn,n->bc", bf, rd.b_maintenance)  # D-10
        maintenance = self.base_maintenance + maint_b
        if self.districts_on:
            maintenance = maintenance + d_maint  # specialty-district upkeep (Campus = 1 gold)
        total[:, :, 2] -= maintenance

        water_h = self.water_housing
        if self.districts_on and self._aqueduct_idx >= 0:
            # Aqueduct (computeHousing): a fresh-water city gets +aqFreshBonus;
            # a non-fresh city's water housing is raised to aqNoFreshTotal.
            # (has_aq — owns a completed Aqueduct [B, C] — comes from the D-10
            # cacheable district block above.)
            fresh = self.water_housing == self._h_fresh  # [B, C]
            aq_h = torch.where(
                fresh,
                self.water_housing + self._aq_fresh_bonus,
                torch.maximum(self.water_housing, torch.full_like(self.water_housing, self._aq_no_fresh_total)),
            )
            water_h = torch.where(has_aq, aq_h, self.water_housing)
        house_b = cc["house_b"] if cc is not None else torch.einsum("bcn,n->bc", bf, rd.b_housing)  # D-10
        housing = water_h + self.is_cap.to(self.dtype) * self._palace_housing + house_b
        # B-18: follower Religious Community — +housing on Shrines/Temples
        # (computeHousing beliefHousing), keyed per-city on the followed religion.
        if _pcfol is not None:
            housing = housing + torch.einsum("bcn,bcn->bc", self.buildings.to(self.dtype), self._fol_tab("bldgH", _pcfol).to(self.dtype))
        if self.improvements_on:
            # +catalog housing per owned improvement within the work radius
            # (pillaged or not — computeHousing does not gate on pillaged,
            # unlike yields). A-13: table-gathered — FARM/PASTURE/CAMP/
            # PLANTATION carry 0.5, MINE/LUMBER/QUARRY/OIL_WELL carry 0.
            if cc is not None:
                imp_add = cc["imp_add"]  # D-10: pop-free, improvement/owner writes bump the version
            else:
                imp_win = self.improvement.gather(1, tcf).reshape(B, C, M)
                owned_c = self.owner.gather(1, tcf).reshape(B, C, M) == slot_ids
                imp_owned = (tiles >= 0) & owned_c & (imp_win >= 0)
                imp_add = (self._imp_housing[imp_win.clamp(min=0)] * imp_owned.to(self.dtype)).sum(dim=2)
            housing = housing + imp_add
        # #46r: government/policy housingAll (MONARCHY +1) — PLAYER cities
        # only, the computeHousing `total += m.housingAll` twin (rivalHousing
        # is mods-free in TS, so the rival paths never add this).
        if gpc_hous is not None:
            housing = housing + gpc_hous.unsqueeze(1)
        # #46r: housingIfDistricts (INSULAE) — +housing where the city's
        # completed-district count meets the card's min (computeHousing's
        # rule loop; player-only like every housing mod).
        if gpc_slotted is not None and self._npol and self.districts_on:
            _hid_act = gpc_slotted & (self._pol_hid_min >= 0).unsqueeze(0)  # [B, nPol]
            if bool(_hid_act.any()):
                _hid_ok = _hid_act.unsqueeze(1) & (dcount_all.unsqueeze(2) >= self._pol_hid_min.clamp(min=0).view(1, 1, -1))
                housing = housing + (_hid_ok.to(self.dtype) * self._pol_hid_house.view(1, 1, -1)).sum(dim=2)

        # D-10: refresh the store on every miss (lux=None callers always land
        # here, so a fresh walk always starts from a same-version store).
        if cc is None:
            store = {"b_y": b_y, "amen_b": amen_b, "maint_b": maint_b, "house_b": house_b}
            if self.districts_on:
                store["d_addends"] = d_addends
                store["ship_add"] = ship_add
                store["d_maint"] = d_maint
                store["has_aq"] = has_aq
                store["dcount_all"] = dcount_all  # #46r
                store["spec_count"] = spec_count  # B-18 Zen Meditation
                store["hs_adj"] = hs_adj  # B-18 follower Work Ethic
            if self.improvements_on:
                store["imp_add"] = imp_add
            self._ct_cache = (self._eff_version, store)

        # Dead slots contribute nothing (their static center yields are preloaded).
        total = total * self.alive.unsqueeze(2).to(self.dtype)
        return total, housing, growth_f, tier_idx

    def empire_score(self) -> torch.Tensor:
        """[B] — mirrors empireScore(state, 'balanced') with the TS
        ASSOCIATION — per city: pop×popWeight, then each yield×weight in
        key order. Science rides non-dyadic 0.7s, so the sum ORDER is a
        real ±1 ulp (P4 catch: the GPU's einsum gave the player
        124.74999999999999 vs TS's exact 124.75, flipping the GV-1 leader
        while every rounded trace column matched). P7-FULL (C-2): TS
        iterates state.cities in ARRAY order (splice on death, push on
        found = acquisition order), so the sum walks city_seq rank —
        column order stops matching after a hole-reuse founding. Dead
        columns sort last and add exact 0.0 (association-neutral)."""
        total, _, _, _ = self._city_totals()
        rd = self.rules_dev
        w = rd.score_yield_weights
        pw = float(self.rules.score_pop_weight)
        ord_ = torch.argsort(torch.where(self.alive, self.city_seq, self.city_seq + 10**6), dim=1, stable=True)
        bidx = self._bidx  # D-7
        score = torch.zeros(self.B, dtype=self.dtype, device=self.device)
        for s in range(self.C):
            col = ord_[:, s]
            score = score + (self.pop[bidx, col] * self.alive[bidx, col].long()).to(self.dtype) * pw
            t_c = total[bidx, col]
            for k in range(6):
                score = score + t_c[:, k] * float(w[k])
        return score

    def rival_score(self, r: int) -> torch.Tensor:
        """[B] — the empire_score analog for rival r's seat: pop x
        popWeight + per-city (food, production, science, culture) dotted
        with the balanced weights, plus building gold/faith (the only
        rival sources of those columns in scope). Comparable in scale to
        empire_score for the C2 relative-reward phase; the sparse win/loss
        phase (C3) supersedes any residual asymmetry."""
        rd = self.rules_dev
        w = rd.score_yield_weights
        B = self.B
        pop_term = (self.rc_pop[:, r] * self.rc_alive[:, r].long()).sum(dim=1).to(self.dtype) * self.rules.score_pop_weight
        yt = torch.zeros(B, dtype=torch.float64, device=self.device)
        for j in range(self.RC):
            mask = self.rc_alive[:, r, j]
            if not bool(mask.any()):
                continue
            f, pr, sc, cu, _g, _fa = self._rival_city_yields(r, j, mask)
            yt = yt + f * float(w[0]) + pr * float(w[1]) + sc * float(w[3]) + cu * float(w[4])
            bgf = self.rc_bldg[:, r, j].double() @ rd.b_yields.double()  # [B, 6]
            yt = yt + bgf[:, 2] * float(w[2]) + bgf[:, 5] * float(w[5])
        return pop_term + yt.to(self.dtype)

    def rival_empire_score(self, r: int) -> torch.Tensor:
        """GV-1: the CLEAN balanced empire score for rival r — the exact
        rival mirror of empire_score('balanced') (Σcity pop*popWeight +
        Σ_k yields[k]·balanced_weight over ALL SIX yields, worked+building
        gold/faith via _rival_city_yields). NOT rival_score (the quirky
        building-only reward helper). Used for the winner/leader."""
        rd = self.rules_dev
        w = rd.score_yield_weights
        B = self.B
        pw = float(self.rules.score_pop_weight)
        # TS association (P4): per city — pop×popWeight FIRST, then the six
        # yields in key order (rivalEmpireScore's per-city loop).
        yt = torch.zeros(B, dtype=torch.float64, device=self.device)
        if not bool(self.rc_alive[:, r].any()):
            return yt.to(self.dtype)
        # D-9: ONE batched pass replaces the RC per-j _rival_city_yields
        # calls (each a full window gather + ~30 plane gathers + topk); the
        # per-j ACCUMULATION below keeps the loop's exact j order and op
        # association (P4: this sum order is a real ±1 ulp). Serves every
        # consumer — trace_row, leader(), statelog — through this one body.
        F, PR, SC, CU, GO, FA = self._rival_city_yields_all(r)
        for j in range(self.RC):
            mask = self.rc_alive[:, r, j]
            if not bool(mask.any()):
                continue
            yt = yt + (self.rc_pop[:, r, j] * self.rc_alive[:, r, j].long()).double() * pw
            yt = yt + F[:, j] * float(w[0]) + PR[:, j] * float(w[1]) + GO[:, j] * float(w[2]) + SC[:, j] * float(w[3]) + CU[:, j] * float(w[4]) + FA[:, j] * float(w[5])
        return yt.to(self.dtype)

    def _rival_city_yields_all(self, r: int, amen_yf: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """D-9: the batched-j twin of _rival_city_yields for the POST-STEP
        score/trace path (FRESH amenity factors, state frozen between j's)
        — one [B, RC, M] window + plane gather + a single topk instead of
        RC per-j passes. Returns (food, prod, sci, cul, gold, faith), each
        [B, RC], column j bit-identical to _rival_city_yields(r, j, mask):
        every op is the per-j op batched along the new dim (gathers and
        elementwise ops are shape-blind; the citizen sums ride the same
        _dyadic_fp guard, with the same sequential m-loop when it's off;
        int-valued matmuls/einsums are exact in f64 for any order; the
        wonder-multiplier product runs an explicit wonder-id-order loop —
        the TS registry order). Guards widened from per-j to any-j only
        gate adds of exact 0.0. _rival_phase keeps the per-j function: its
        frozen amen_yf and mid-phase sequencing are per-city by spec."""
        rd = self.rules_dev
        B, RC = self.B, self.RC
        alive = self.rc_alive[:, r]  # [B, RC]
        centers = self.rc_center[:, r]  # [B, RC]
        g = self._rcy_globals()
        # D-9 window cache: centers move only on found/capture/transfer/
        # compaction, and every such site bumps _eff_version (the existing
        # (r, j)-cache convention — _reclaim_rc's own comment), so the per-r
        # window rides g's _eff_version lifetime.
        win = g.setdefault("win_r", {})
        tiles = win.get(r)
        if tiles is None:
            tiles = tiles_from_offsets(centers.reshape(-1), self._off3, self.W, self.H).reshape(B, RC, -1)
            win[r] = tiles
        M = tiles.shape[2]
        tc3 = tiles.clamp(min=0)
        tc = tc3.reshape(B, RC * M)

        def gat(plane: torch.Tensor) -> torch.Tensor:  # [B, T] -> [B, RC, M]
            return plane.gather(1, tc).reshape(B, RC, M)

        districted = (
            (self.center_at.gather(1, tc) >= 0)
            | (self.rvcity_at.gather(1, tc) >= 0)
            | (self.district.gather(1, tc) >= 0)
            | (self.built_wonder.gather(1, tc) >= 0)  # A-4: wonder tiles are not workable
        ).reshape(B, RC, M)
        valid = (
            (tiles >= 0)
            & (gat(self.rival_at) == r)
            & gat(self.work_ok)
            & (tiles != centers.unsqueeze(2))
            & ~districted
        )
        f_plane = self._rcy_food_plane(r, g)
        p_plane = g["p_plane"]
        ty_oth = g["ty_oth"]
        oth_sc = g["oth_score"]
        _has_bel = self._r_has_beliefs(r)
        # B-18: per-rc FOLLOWER-belief id [B, RC] (followed religion when LIVE,
        # else owner r+1). Bit-identical to _bel_add's fol term when inert.
        _fol_rc = self._follower_id_for(self._rc_rel(r)) if _has_bel else None
        featP = None
        if _has_bel:
            featP = self._belief_feat_plane(r)
            f_plane = f_plane + featP[:, :, 0]
            p_plane = p_plane + featP[:, :, 1]
            ty_oth = ty_oth + featP
            oth_sc = oth_sc + (featP[:, :, 2:].double() * g["w"][2:].view(1, 1, 4)).sum(dim=2)
        f = gat(f_plane).double()
        p = gat(p_plane).double()
        if self._mine_boost_tech.numel() > 0 and self.MINE >= 0:
            boost_r = (self.r_techs[:, r][:, self._mine_boost_tech].to(self.dtype) * self._mine_boost_amt).sum(dim=1).double()
            mine_here = (gat(self.improvement) == self.MINE) & ~gat(self.pillaged)
            p = p + mine_here.double() * boost_r.view(B, 1, 1)
        w = g["w"]
        s = f * w[0] + p * w[1] + gat(oth_sc)
        # ties break by GLOBAL tile index like the per-j path; valid keys are
        # collision-free (distinct tiles -> distinct keys), so the batched
        # topk picks the identical set in the identical order.
        key = torch.where(valid, s * 1e6 - tiles.double(), torch.tensor(-1e18, dtype=torch.float64, device=self.device))
        top_vals, top_idx = key.topk(M, dim=2)
        take = (torch.arange(M, device=self.device).view(1, 1, M) < self.rc_pop[:, r].unsqueeze(2)) & (top_vals > -1e17)
        f_sel = f.gather(2, top_idx) * take.double()
        p_sel = p.gather(2, top_idx) * take.double()
        sc = gat(ty_oth[:, :, 3]).double()
        cu = gat(ty_oth[:, :, 4]).double()
        go = gat(ty_oth[:, :, 2]).double()  # VP-G1
        fa = gat(ty_oth[:, :, 5]).double()  # GV-1a
        sc_sel = sc.gather(2, top_idx) * take.double()
        cu_sel = cu.gather(2, top_idx) * take.double()
        go_sel = go.gather(2, top_idx) * take.double()  # VP-G1
        fa_sel = fa.gather(2, top_idx) * take.double()  # GV-1a
        # center: real floored yields — the per-j block with [B] -> [B, RC]
        ctr = centers.clamp(min=0)
        r_ = self.rules
        strip = self.feat_stripped.gather(1, ctr).double()  # [B, RC]
        fy_c = self.feat_yields.gather(1, ctr.unsqueeze(2).expand(-1, -1, 6)).double()  # [B, RC, 6]
        cf = torch.maximum(f_plane.gather(1, ctr).double(), torch.tensor(float(r_.center_min_food), dtype=torch.float64, device=self.device))
        cp = torch.maximum(p_plane.gather(1, ctr).double(), torch.tensor(float(r_.center_min_production), dtype=torch.float64, device=self.device))
        c_sc = self.tile_yields[:, :, 3].gather(1, ctr).double() - fy_c[:, :, 3] * strip
        c_cu = self.tile_yields[:, :, 4].gather(1, ctr).double() - fy_c[:, :, 4] * strip
        c_go = self.tile_yields[:, :, 2].gather(1, ctr).double() - fy_c[:, :, 2] * strip  # VP-G1
        c_fa = self.tile_yields[:, :, 5].gather(1, ctr).double() - fy_c[:, :, 5] * strip  # GV-1a
        if _has_bel:
            featC = featP.gather(1, ctr.unsqueeze(2).expand(-1, -1, 6)).double()  # [B, RC, 6]
            c_sc = c_sc + featC[:, :, 3]
            c_cu = c_cu + featC[:, :, 4]
            c_go = c_go + featC[:, :, 2]
            c_fa = c_fa + featC[:, :, 5]
        if self._dyadic_fp:
            food = cf + f_sel.sum(dim=2)
            prod = cp + p_sel.sum(dim=2)
            sci = c_sc + sc_sel.sum(dim=2)
            cul = c_cu + cu_sel.sum(dim=2)
            gold = c_go + go_sel.sum(dim=2)  # VP-G1
            faith = c_fa + fa_sel.sum(dim=2)  # GV-1a
        else:
            food = cf.clone()
            prod = cp.clone()
            sci = c_sc.clone()
            gold = c_go.clone()  # VP-G1 (per-j quirk kept: no worked-tile tail)
            faith = c_fa.clone()  # GV-1a (per-j quirk kept: no worked-tile tail)
            cul = c_cu.clone()
            for m in range(M):  # sequential adds mirror the per-j (TS) loop's rounding
                food = food + f_sel[:, :, m]
                prod = prod + p_sel[:, :, m]
                sci = sci + sc_sel[:, :, m]
                cul = cul + cu_sel[:, :, m]
        # A-4 Petra (per-j guard widened to any-j: absent cities add exact 0)
        compw = None
        if self._wond_n:
            wreg = self.rc_wonder[:, r]  # [B, RC, nW]
            compw = (wreg >= 0) & self.built_wonder_complete.gather(1, wreg.clamp(min=0).reshape(B, -1)).reshape_as(wreg)
            hasP = (compw & self._wond_petra.view(1, 1, -1)).any(dim=2)  # [B, RC]
            if bool(hasP.any()):
                sel_tiles = tc3.gather(2, top_idx)  # [B, RC, M] the worked tiles
                st = sel_tiles.reshape(B, RC * M)
                qual = (
                    self.desert.gather(1, st).reshape(B, RC, M)
                    & (self.feat_id.gather(1, st).reshape(B, RC, M) != self._fp_fid)
                    & (self.district.gather(1, st).reshape(B, RC, M) < 0)
                    & take
                )
                nq = (qual & hasP.unsqueeze(2)).sum(dim=2).double()
                food = food + 2.0 * nq
                gold = gold + 2.0 * nq
                prod = prod + nq
        # C1-B4b: completed-district floored adjacency. State is frozen here
        # (post-step), so ONE _adj_district_count serves every j — the per-j
        # calls returned this same tensor each time.
        if self.districts_on:
            reg = self.rc_dist_tile[:, r]  # [B, RC, nD]
            if bool((reg >= 0).any()):
                for di, dd in enumerate(self.districts_cat):
                    yc = int(dd.get("adjYield", -1))
                    if yc < 0:
                        continue
                    tile_d = reg[:, :, di]  # [B, RC]
                    has = alive & (tile_d >= 0)
                    if not bool(has.any()):
                        continue
                    has = has & self.district_complete.gather(1, tile_d.clamp(min=0))
                    if not bool(has.any()):
                        continue
                    adjf = self._district_adj_floor(di).gather(1, tile_d.clamp(min=0)).double()  # (G5 memo)
                    add = torch.where(has, adjf, torch.zeros_like(adjf))
                    if di == self._hs_idx and _has_bel:  # A-7/B-18 Work Ethic (per-city)
                        prod = prod + add * self._fol_tab("we", _fol_rc)
                    if yc == 3:
                        sci = sci + add
                    elif yc == 4:
                        cul = cul + add
                    elif yc == 0:
                        food = food + add
                    elif yc == 1:
                        prod = prod + add
                    elif yc == 2:
                        gold = gold + add  # VP-G1
                    elif yc == 5:
                        faith = faith + add  # GV-1a
        # C1-B4b-2: building yields (int-valued matmul: exact in any order)
        if self.districts_on:
            selb = self.rc_bldg[:, r]  # [B, RC, NB]
            if bool(selb.any()):
                add6 = selb.double() @ self.rules_dev.b_yields.double()  # [B, RC, 6]
                food = food + add6[:, :, 0]
                prod = prod + add6[:, :, 1]
                gold = gold + add6[:, :, 2]  # VP-G1
                faith = faith + add6[:, :, 5]  # GV-1a
                sci = sci + add6[:, :, 3]
                cul = cul + add6[:, :, 4]
                if _has_bel:  # A-7/B-18 belief building adds (int rows)
                    # founder (Stewardship) per-civ + follower (Feed the World /
                    # Choral Music) per-city; disjoint int keys => split is exact.
                    badd = torch.einsum("bjn,bnk->bjk", selb.double(), self._bel_add_pf("bldgY", r))
                    badd = badd + torch.einsum("bjn,bjnk->bjk", selb.double(), self._fol_tab("bldgY", _fol_rc))
                    food = food + badd[:, :, 0]
                    prod = prod + badd[:, :, 1]
                    gold = gold + badd[:, :, 2]
                    sci = sci + badd[:, :, 3]
                    cul = cul + badd[:, :, 4]
                    faith = faith + badd[:, :, 5]
                # P1/C-22 SHIPYARD: completed Harbor's LIVE floor(adjacency)
                if self._harbor_idx >= 0 and self._shipyard_bidx >= 0:
                    hb_tile = self.rc_dist_tile[:, r, :, self._harbor_idx]  # [B, RC]
                    has_sy = alive & selb[:, :, self._shipyard_bidx] & (hb_tile >= 0)
                    has_sy = has_sy & self.district_complete.gather(1, hb_tile.clamp(min=0))
                    if bool(has_sy.any()):
                        hadj = self._district_adj_floor(self._harbor_idx).gather(1, hb_tile.clamp(min=0)).double()  # (G5 memo)
                        prod = prod + torch.where(has_sy, hadj, torch.zeros_like(hadj))
        # A-4: completed wonders — flat city yields + belief faithPerWonder
        if compw is not None and bool(compw.any()):
            wcy = compw.double() @ self._wond_cy  # [B, RC, 6] (int-valued)
            food = food + wcy[:, :, 0]
            prod = prod + wcy[:, :, 1]
            gold = gold + wcy[:, :, 2]
            sci = sci + wcy[:, :, 3]
            cul = cul + wcy[:, :, 4]
            faith = faith + wcy[:, :, 5]
            if _has_bel:
                faith = faith + self._fol_tab("fpw", _fol_rc) * compw.sum(dim=2).double()  # B-18 per-city Divine Inspiration
        # A-7: founder capital incomes (per-civ values, applied at the capital)
        if _has_bel:
            perF = self._bel_add("perF", r)  # [B, 7]
            perC = self._bel_add("perC", r)  # [B, 6]
            followers = (self.rc_pop[:, r] * self.rc_alive[:, r].long()).sum(dim=1).double()
            times = torch.where(perF[:, 0] > 0, torch.floor(followers / perF[:, 0].clamp(min=1)), torch.zeros_like(followers))
            capY = perF[:, 1:] * times.unsqueeze(1) + perC * self.rc_alive[:, r].sum(dim=1).double().unsqueeze(1)
            isc = (self.rc_is_cap[:, r] & alive).double()  # [B, RC]
            food = food + capY[:, 0].unsqueeze(1) * isc
            prod = prod + capY[:, 1].unsqueeze(1) * isc
            gold = gold + capY[:, 2].unsqueeze(1) * isc
            sci = sci + capY[:, 3].unsqueeze(1) * isc
            cul = cul + capY[:, 4].unsqueeze(1) * isc
            faith = faith + capY[:, 5].unsqueeze(1) * isc
        # A-7r: this rival's government + slotted-policy flat yields — cityYields
        # to every alive city, capitalYields to the capital — pre-tier, the
        # rivalCityYields `bonuses` position (rivals.ts). Same channels as the
        # player path (getRivalModifiers layers gov+policy into these mods).
        if self._gov_has_effects:
            gcity, gcap, *_ = self._gov_policy_mods_cached(r, self.r_civics[:, r])  # housing/ymult/slots discarded (TS rival paths don't consume them)
            acell = alive.double()  # [B, RC]
            gisc = (self.rc_is_cap[:, r] & alive).double()  # [B, RC]
            food = food + gcity[:, 0].unsqueeze(1) * acell + gcap[:, 0].unsqueeze(1) * gisc
            prod = prod + gcity[:, 1].unsqueeze(1) * acell + gcap[:, 1].unsqueeze(1) * gisc
            gold = gold + gcity[:, 2].unsqueeze(1) * acell + gcap[:, 2].unsqueeze(1) * gisc
            sci = sci + gcity[:, 3].unsqueeze(1) * acell + gcap[:, 3].unsqueeze(1) * gisc
            cul = cul + gcity[:, 4].unsqueeze(1) * acell + gcap[:, 4].unsqueeze(1) * gisc
            faith = faith + gcity[:, 5].unsqueeze(1) * acell + gcap[:, 5].unsqueeze(1) * gisc
        # A-12: CS envoy bonuses, j-batched (per-completed-district adds at
        # 3/6 + capital yield at 1+) — the per-j twin's position and values
        # (integer-valued adds in f64: batching is exact).
        if self.S > 0 and bool((self.cs_r_envoys[:, r] > 0).any()):
            _acs = self.cs_alive.double()
            perD_r = ((self.cs_r_envoys[:, r] >= 3).double() + (self.cs_r_envoys[:, r] >= 6).double()) * self._cs_district_bonus * _acs
            csd_r = torch.zeros(B, len(self.districts_cat), dtype=torch.float64, device=self.device)
            csd_r.scatter_add_(1, self._cs_didx.clamp(min=0), perD_r)
            dt_all = self.rc_dist_tile[:, r]  # [B, RC, nD]
            comp_all = ((dt_all >= 0) & self.district_complete.gather(1, dt_all.clamp(min=0).reshape(B, -1)).reshape_as(dt_all)).double() * alive.double().unsqueeze(2)
            _cols = [torch.zeros(B, self.RC, dtype=torch.float64, device=self.device) for _ in range(6)]
            for _d in self.districts_cat:
                _yc = int(_d.get("adjYield", -1))
                if _yc < 0:
                    continue
                _di = int(_d["idx"])
                _cols[_yc] = _cols[_yc] + csd_r[:, _di].unsqueeze(1) * comp_all[:, :, _di]
            tier1_r = ((self.cs_r_envoys[:, r] >= 1) & self.cs_alive).double() * float(self.rules.cs.get("capitalBonus", 2))
            capb_r = torch.zeros(B, 6, dtype=torch.float64, device=self.device)
            capb_r.scatter_add_(1, self._cs_yidx, tier1_r)
            _isc = (self.rc_is_cap[:, r] & alive).double()  # [B, RC]
            food = food + _cols[0] + capb_r[:, 0].unsqueeze(1) * _isc
            prod = prod + _cols[1] + capb_r[:, 1].unsqueeze(1) * _isc
            gold = gold + _cols[2] + capb_r[:, 2].unsqueeze(1) * _isc
            sci = sci + _cols[3] + capb_r[:, 3].unsqueeze(1) * _isc
            cul = cul + _cols[4] + capb_r[:, 4].unsqueeze(1) * _isc
            faith = faith + _cols[5] + capb_r[:, 5].unsqueeze(1) * _isc
        # A-11/A-12b: outgoing unraided route income — pre-tier, the per-j
        # twin's position (integer-valued adds in f64: batching is exact).
        _route_inc = self._rival_route_income(r)
        if _route_inc is not None:
            a6 = alive.double()
            food = food + _route_inc[:, :, 0] * a6
            prod = prod + _route_inc[:, :, 1] * a6
            gold = gold + _route_inc[:, :, 2] * a6  # A-12b: CS-route gold/specialty
            sci = sci + _route_inc[:, :, 3] * a6
            cul = cul + _route_inc[:, :, 4] * a6
            faith = faith + _route_inc[:, :, 5] * a6
        # P5/S6 (C-20): FRESH amenity tier (external-caller path) — one call
        # replaces RC identical per-j calls; elementwise scaling is exact.
        # G4: the economy loop passes its loop-top FROZEN factors instead
        # (the per-j twin's amen_yf contract).
        yf = amen_yf if amen_yf is not None else self._rival_amenity(r)[2]  # [B, RC]
        prod = prod * yf
        sci = sci * yf
        cul = cul * yf
        gold = gold * yf
        faith = faith * yf
        # A-4: wonder yield multipliers AFTER the tier scaling — an EXPLICIT
        # wonder-id-order product (the TS registry order the per-j
        # .prod(dim=1) realizes on all gated data): shape-independent.
        if compw is not None and bool(compw.any()):
            ones6 = torch.ones(1, 1, 6, dtype=torch.float64, device=self.device)
            wmm = torch.ones(B, RC, 6, dtype=torch.float64, device=self.device)
            for wi in range(compw.shape[2]):
                wmm = wmm * torch.where(compw[:, :, wi : wi + 1], self._wond_mult[wi].view(1, 1, 6), ones6)
            food = food * wmm[:, :, 0]
            prod = prod * wmm[:, :, 1]
            gold = gold * wmm[:, :, 2]
            sci = sci * wmm[:, :, 3]
            cul = cul * wmm[:, :, 4]
            faith = faith * wmm[:, :, 5]
        z = torch.zeros_like(food)
        return (
            torch.where(alive, food, z),
            torch.where(alive, prod, z),
            torch.where(alive, sci, z),
            torch.where(alive, cul, z),
            torch.where(alive, gold, z),
            torch.where(alive, faith, z),
        )

    def _rcy_all_cached(self, r: int, amen_yf: torch.Tensor) -> tuple:
        """G4: the economy loop's keyed slot over the D-9 batched twin (with
        the loop's FROZEN amenity factors). Key exactness — every mid-loop
        mutation that can change a LATER column's yields bumps a component:
        completions/paves/founding/civic-completion (_eff_version), belief
        claims (_bel_version), the economy strike-kill (_rp_kill_version,
        the route raided-mask), border claims landing inside a later
        same-civ window (_claim_version — rival_at is the valid-mask input;
        claims elsewhere, and any r0 claim seen by r1, cannot flip a valid
        bit: a claimed tile goes -1 -> r0, never == r1). A city's own-column
        inputs (pop, buildings) are written only AT its iteration, after its
        yields are consumed. The one live read a snapshot cannot honor is
        capY's civ-total follower pop under beliefs — the economy loop keeps
        the per-j path for capital columns in that case (see the call site).
        Post-phase callers (trace/leader/rival_score) stay on the raw twin:
        fresh amenity factors, post-war state."""
        key = (self.turn, r, self._eff_version, self._bel_version, self._rp_kill_version, self._claim_version)
        if self._rcy_all_cache is not None and self._rcy_all_cache[0] == key:
            return self._rcy_all_cache[1]
        out = self._rival_city_yields_all(r, amen_yf=amen_yf)
        self._rcy_all_cache = (key, out)
        return out

    def leader(self) -> torch.Tensor:
        """GV-1: [B] the current score-leader as a unified civ id — 0 =
        player, r+1 = rival r (civOfRival). Ties → lowest id (player first,
        then lowest rival), matching TS's strict-> scan — via first_argmax
        (torch.argmax's tie pick is unspecified)."""
        cols = [self.empire_score()] + [self.rival_empire_score(r) for r in range(self.R)]
        return first_argmax(torch.stack(cols, dim=1))

    def _domination(self) -> torch.Tensor:
        """GV-3: [B] the civ holding EVERY original capital (capitalTiles:
        cap_tile_player + cap_tile_rival), else -1. Owner of a capital tile: 0
        if a player city is centered there (center_at>=0), else rvcity_at+1 (the
        rival index -> civ id), else -1 (razed). Mirrors dominationWinner: a solo
        game (R==0) never dominates; any unowned or split capital -> -1."""
        B, dev = self.B, self.device
        if self.R == 0:
            return torch.full((B,), -1, dtype=torch.long, device=dev)
        caps = torch.cat([self.cap_tile_player.unsqueeze(1), self.cap_tile_rival[:, : self.R]], dim=1)  # [B, 1+R] — P7-FULL: capitalTiles, survives rc compaction
        p_owns = self.center_at.gather(1, caps) >= 0
        rv = self.rvcity_at.gather(1, caps)  # rival index or -1
        owner = torch.where(p_owns, torch.zeros_like(rv), torch.where(rv >= 0, rv + 1, torch.full_like(rv, -1)))
        bad = (owner < 0).any(dim=1) | (owner != owner[:, :1]).any(dim=1)
        return torch.where(bad, torch.full((B,), -1, dtype=torch.long, device=dev), owner[:, 0])

    # --- action masks (the macro-action surface) --------------------------------

    def production_mask(self) -> torch.Tensor:
        """[B, C, NB+2+NU+nScaffold(+NB+1+NU)] valid production actions for idle
        cities: columns 0..NB-1 = City Center buildings, NB = settler (always
        trainable, as queueSettler is), NB+1 = idle, NB+2..NB+1+NU = train that
        roster unit (tech-gated like trainableUnits), NB+2+NU.. = place that
        scaffold district (capital-only, off-script; all-False unless
        _rl_district_active). With _rl_purchase_active the mask WIDENS by
        NB+1+NU gold-purchase columns (buy building / settler / unit at
        gold_purchase_mult× cost — V-P1); while off those columns don't exist,
        keeping old checkpoints loadable. All-False where no decision pends."""
        B, C, dev = self.B, self.C, self.device
        pend = self.alive & (self.current == -1)
        always = torch.ones(B, C, 2, dtype=torch.bool, device=dev)
        cols = [self._buildable(), always]
        if self.units_mode:
            unit_ok = (self._p_tech.unsqueeze(0) < 0) | self.techs.gather(
                1, self._p_tech.clamp(min=0).unsqueeze(0).expand(B, -1)
            )
            cols.append(unit_ok.unsqueeze(1).expand(-1, C, -1))
        else:
            cols.append(torch.zeros(B, C, self.NU, dtype=torch.bool, device=dev))
        nS = len(self._scaffold)
        if nS:
            dcols = torch.zeros(B, C, nS, dtype=torch.bool, device=dev)
            if self._rl_district_active:  # D5b/c: capital (or any city if _rl_any_city) places districts off-script
                ar = torch.arange(B, device=dev)
                spec_tile = (self.district >= 0) & self._is_specialty[self.district.clamp(min=0)] & ~self.district_dead  # [B,T] LIVE specialty district tiles
                cc = self._adj_center_count()  # [B,T] adjacent CITY_CENTERs (global) — Aqueduct requires, Encampment forbids
                for c in range(C if self._rl_any_city else 1):
                    site_c = self.site[:, c].clamp(min=0)
                    cap_c = torch.div(self.pop[:, c] - 1, 3, rounding_mode="floor") + 1  # maxSpecialtyDistricts(pop_c)
                    under_cap = (spec_tile & (self.owner == c)).sum(dim=1) < cap_c  # only specialty districts count
                    base = (self.owner == c) & self.d_usable & (self.district < 0) & (self.built_wonder < 0) & (self.improvement < 0) & (self.res_priority <= 1) & (self.dist[:, c] <= 3)  # C-6/A-4
                    base[ar, site_c] = False
                    cbase = (self.owner == c) & self.coastal_water & (self.district < 0) & (self.built_wonder < 0) & (self.improvement < 0) & (self.res_priority <= 1) & (self.dist[:, c] <= 3)  # C-6/A-4
                    cbase[ar, site_c] = False
                    has_land = base.any(dim=1)  # [B]
                    has_aq = (base & (cc >= 1) & self.aqsrc).any(dim=1)  # [B] adjacent center + water source
                    has_coastal = cbase.any(dim=1)  # [B] a coastal-water tile (Harbor)
                    has_enc = (base & (cc == 0)).any(dim=1)  # [B] a land tile NOT adjacent to any center (Encampment)
                    for si, (di, utech, plc) in enumerate(self._scaffold):
                        has_tech = self.techs[:, utech] if utech >= 0 else torch.ones(B, dtype=torch.bool, device=dev)
                        not_owned = ~((self.district == di) & (self.owner == c) & ~self.district_dead).any(dim=1)  # one-per-type (LIVE)
                        if plc == 1:  # Aqueduct: non-specialty (no cap), aqueduct-eligible tile
                            dcols[:, c, si] = has_tech & has_aq & not_owned
                        elif plc == 2:  # Harbor: specialty (cap), coastal-water tile
                            dcols[:, c, si] = has_tech & under_cap & has_coastal & not_owned
                        elif plc == 3:  # Encampment: specialty (cap), not adjacent to the center
                            dcols[:, c, si] = has_tech & under_cap & has_enc & not_owned
                        else:
                            dcols[:, c, si] = has_tech & under_cap & has_land & not_owned
            cols.append(dcols)
        if self._rl_purchase_active:
            # V-P1 purchases. Eligibility mirrors the TS functions at a pending
            # decision (queue empty, so availableBuildings ∧ buildingCompletable
            # collapses to _buildable): building = _buildable & gold; settler =
            # gold at the live settlerCost; unit = trainableUnits & gold. Gold is
            # checked optimistically here and RE-validated at apply in slot
            # order (earlier slots' purchases drain the shared treasury and a
            # bought settler raises the next slot's price, exactly like the
            # replay's sequential act.p loop; a unit also needs a free spawn
            # tile there — TS refunds when spawnUnit finds none).
            mult = self.rules.gold_purchase_mult
            tre = self.treasury
            pb = cols[0] & self._afford(tre.view(B, 1, 1), self.rules_dev.b_cost.view(1, 1, -1) * mult)
            n_cities = self.alive.sum(dim=1, keepdim=True)
            queued_s = (self.current == self.SETTLER).sum(dim=1, keepdim=True)
            s_cost = self.rules.settler_base + self.rules.settler_per_city * (
                n_cities - 1 + self.settlers.unsqueeze(1) + queued_s
            ).clamp(min=0).to(self.dtype)
            ps = self._afford(tre.unsqueeze(1), s_cost * mult).unsqueeze(2).expand(B, C, 1)
            if self.units_mode:
                u_ok = (self._p_tech.unsqueeze(0) < 0) | self.techs.gather(
                    1, self._p_tech.clamp(min=0).unsqueeze(0).expand(B, -1)
                )
                u_cost = self._p_cost.unsqueeze(0).expand(B, -1)
                if self._builder_idx >= 0:
                    # P4/D-10: the builder column prices off the live escalator
                    # (trained + queued), like TS unitPurchaseCost at mask time.
                    bq = (self.current == self.UNIT_BASE + self._builder_idx).sum(dim=1)
                    u_cost = u_cost.clone()
                    u_cost[:, self._builder_idx] = self._builder_cost(self.builders_trained + bq)
                pu = (u_ok & self._afford(tre.unsqueeze(1), u_cost * mult)).unsqueeze(1).expand(-1, C, -1)
            else:
                pu = torch.zeros(B, C, self.NU, dtype=torch.bool, device=dev)
            cols.append(torch.cat([pb, ps, pu], dim=2))
        return torch.cat(cols, dim=2) & pend.unsqueeze(2)

    def tech_mask(self) -> torch.Tensor:
        """[B, NT] valid research picks; all-False where research is busy."""
        return self._available_mask(self.techs, self._prereq_t) & (self.cur_tech == -1).unsqueeze(1)

    def civic_mask(self) -> torch.Tensor:
        """[B, NC] valid civic picks; all-False where the slot is busy."""
        return self._available_mask(self.civics, self._prereq_c) & (self.cur_civic == -1).unsqueeze(1)

    def envoy_mask(self) -> torch.Tensor:
        """[B, S] city-states an available envoy could back right now."""
        return self.cs_alive & self.cs_met & (self.envoys_avail > 0).unsqueeze(1)

    def war_mask(self) -> torch.Tensor:
        """[B, 2R] player diplomacy actions (V-W1): columns 0..R-1 declare war
        on that rival (declareWar: alive & not already at war — free, no RNG),
        R..2R-1 sue for peace (sueForPeace: at war for >= peaceMinWarTurns and
        treasury covers peaceGold0 + peaceGoldSlope·warTurns). All-False while
        _rl_war_active is off — the head exists but nothing samples it."""
        B, dev = self.B, self.device
        R = max(self.R, 1)
        if self.R == 0 or not self._rl_war_active:
            return torch.zeros(B, 2 * R, dtype=torch.bool, device=dev)
        rr = self.rules.rivals
        declare = self.r_alive & ~self.r_atwar
        cost = rr.get("peaceGold0", 150) + rr.get("peaceGoldSlope", 10) * self.r_warturns.to(self.dtype)
        peace = (
            self.r_alive
            & self.r_atwar
            & (self.r_warturns >= rr.get("peaceMinWarTurns", 8))
            & self._afford(self.treasury.unsqueeze(1), cost)
        )
        return torch.cat([declare, peace], dim=1)

    # --- eureka detection --------------------------------------------------------

    def _detect_boosts(self) -> None:
        """Mirrors detectBoosts: flag every satisfied, unresearched,
        un-boosted condition. Runs where detectBoosts does — the start of
        the turn, before anything advances."""
        pop_sum = None
        for row in self.rules.boosts:
            kind = row["kind"]
            if kind == "building":
                # detectBoosts counts buildings in LIVE cities only (it iterates
                # state.cities). A razed/lost city leaves a dead slot whose stale
                # buildings must NOT count — mask by self.alive or a leftover
                # Market inflates e.g. the GUILDS "build 2 Markets" inspiration.
                pred = (self.buildings[:, :, row["b"]].bool() & self.alive).sum(dim=1) >= row["count"]
            elif kind == "cityPop":
                pred = ((self.pop >= row["pop"]) & self.alive).any(dim=1)
            elif kind == "totalPop":
                if pop_sum is None:
                    pop_sum = (self.pop * self.alive.to(self.pop.dtype)).sum(dim=1)
                pred = pop_sum >= row["pop"]
            elif kind == "coastalCity":
                pred = (self.alive & self.coastal).any(dim=1)
            elif kind == "cities":
                pred = self.alive.sum(dim=1) >= row["count"]
            elif kind == "greatPeople":
                pred = (self.gp_earned.sum(dim=1) if row["cls"] < 0 else self.gp_earned[:, row["cls"]]) >= row["count"]
            elif kind == "tech":
                pred = self.techs[:, row["t"]]
            elif kind == "anyWonderBuilt":
                pred = self.built_wonder_complete.any(dim=1)  # A-4: reachable now (global scan, both civs)
            elif kind == "nearNaturalWonder":
                pred = ((self.owner >= 0) & self.wonder_near).any(dim=1)
            elif kind == "improvement":
                # count tiles with this improvement (on a resource, if the
                # condition requires it) — pillaged still counts, like
                # detectBoosts. Only FARM is buildable in covered scope.
                on = self.improvement == row["imp"]
                if row.get("onResource"):
                    on = on & (self.res_priority > 0)
                pred = on.sum(dim=1) >= row["count"]
            elif kind == "district":
                # completed districts of a type (dtype>=0) or any specialty
                # (dtype<0). Only specialty districts live in self.district (>=0).
                dtype = row.get("dtype", -1)
                if dtype < 0:
                    # boosts.ts: with no check.type, only districts that COUNT
                    # TOWARD THE LIMIT qualify (specialty) — aqueducts/neighborhoods
                    # and other support districts are excluded. A specific dtype
                    # counts regardless (matching check.type).
                    dsel = (self.district >= 0) & self._is_specialty[self.district.clamp(min=0)]
                else:
                    dsel = self.district == dtype
                on = dsel & self.district_complete & (self.owner >= 0) & ~self.district_dead  # player eurekas count PLAYER (live) districts
                pred = on.sum(dim=1) >= row["count"]
            elif kind == "policies":
                # B-13 (Slice V): "run N policy cards" (MEDIEVAL_FAIRES, count 4).
                # checkSatisfied counts state.government.policies non-null entries
                # = the player's slotted-policy count. Gated on _gov_has_effects
                # (matches TS: no adoption => empty government.policies => 0).
                if self._gov_has_effects and self._npol:
                    slotted = self._gov_policy_mods_cached("p", self.civics)[4]
                    pred = slotted.sum(dim=1) >= row["count"]
                else:
                    pred = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            else:
                continue
            if row["target"] == "tech":
                self.tech_boosted[:, row["idx"]] |= pred & ~self.techs[:, row["idx"]]
            else:
                self.civic_boosted[:, row["idx"]] |= pred & ~self.civics[:, row["idx"]]

    def _detect_rival_boosts(self, r: int, active: torch.Tensor) -> None:
        """AUDIT A-3: detectRivalBoosts — the same condition rows evaluated
        from rival r's seat (its cities/research/territory; the map-global
        rows — improvement counts, the shared GP pool — read the same
        global state the player's check does, so every civ runs one
        formula). Runs at the rival's block top, mirroring the player's
        turn-top call; policy rows aren't exported (unreachable in scope
        for every civ)."""
        alive = self.rc_alive[:, r]
        pop_sum = None
        for row in self.rules.boosts:
            kind = row["kind"]
            if kind == "building":
                pred = (self.rc_bldg[:, r, :, row["b"]] & alive).sum(dim=1) >= row["count"]
            elif kind == "cityPop":
                pred = ((self.rc_pop[:, r] >= row["pop"]) & alive).any(dim=1)
            elif kind == "totalPop":
                if pop_sum is None:
                    pop_sum = (self.rc_pop[:, r] * alive.to(self.rc_pop.dtype)).sum(dim=1)
                pred = pop_sum >= row["pop"]
            elif kind == "coastalCity":
                pred = (alive & self.coastal_land.gather(1, self.rc_center[:, r].clamp(min=0))).any(dim=1)
            elif kind == "cities":
                pred = alive.sum(dim=1) >= row["count"]
            elif kind == "greatPeople":
                pred = (self.gp_earned.sum(dim=1) if row["cls"] < 0 else self.gp_earned[:, row["cls"]]) >= row["count"]
            elif kind == "tech":
                pred = self.r_techs[:, r, row["t"]]
            elif kind == "anyWonderBuilt":
                pred = self.built_wonder_complete.any(dim=1)  # A-4: the same global scan
            elif kind == "nearNaturalWonder":
                pred = ((self.rival_at == r) & self.wonder_near).any(dim=1)
            elif kind == "improvement":
                # global tile scan, exactly like the player's (TS scans
                # state.map.tiles with no owner filter — one formula per civ)
                on = self.improvement == row["imp"]
                if row.get("onResource"):
                    on = on & (self.res_priority > 0)
                pred = on.sum(dim=1) >= row["count"]
            elif kind == "district":
                dtype = row.get("dtype", -1)
                dt = self.rc_dist_tile[:, r]  # [B, RC, nD] registry tiles
                comp = self.district_complete.gather(1, dt.clamp(min=0).reshape(self.B, -1)).reshape_as(dt)
                on = (dt >= 0) & comp & alive.unsqueeze(2)
                if dtype < 0:
                    pred = (on & self._is_specialty.view(1, 1, -1)).sum(dim=(1, 2)) >= row["count"]
                else:
                    pred = on[:, :, dtype].sum(dim=1) >= row["count"]
            else:
                continue
            hit = active & pred
            if row["target"] == "tech":
                self.r_tech_boosted[:, r, row["idx"]] |= hit & ~self.r_techs[:, r, row["idx"]]
            else:
                self.r_civic_boosted[:, r, row["idx"]] |= hit & ~self.r_civics[:, r, row["idx"]]

    # --- barbarians (phase 4a) ----------------------------------------------------

    def _next_random(self, mask: torch.Tensor) -> torch.Tensor:
        """Mirrors nextRandom (mulberry32 on state.rngState): advances the
        u32 state ONLY where mask, returns [B] float64 draws (garbage
        elsewhere). All arithmetic runs on u32-in-int64; int64 wrap-around
        preserves values mod 2^32, so masking after each op is exact."""
        a = (self.rng_state + 0x6D2B79F5) & M32
        t = ((a ^ (a >> 15)) * (1 | a)) & M32
        t = (((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t) & M32
        out = ((t ^ (t >> 14)) & M32).to(torch.float64) / 4294967296.0
        self.rng_state = torch.where(mask, a, self.rng_state)
        return out

    def _damage_roll(self, mask: torch.Tensor, diff: torch.Tensor, k: str = "?", tile: torch.Tensor | None = None) -> torch.Tensor:
        """Mirrors damageRoll: 30·e^(0.04·Δ)·rand(0.8–1.2) (P4/D-1: the real
        Civ 6 range — equal-strength hits land 24–36), JS-rounded, min 1.
        Δ is always an integer here, so the exponential comes from the
        fixture's JS-computed table (libm exp() can differ by an ulp
        between runtimes and the result rounds to an integer)."""
        # Phase-1 combat log (P5/S4 tooling; §F enrichment): every roll of
        # the logged game becomes a keyed CB<seq> line — TS damageRoll is
        # the twin. k = the TS call-site tag (one tag per TS function, even
        # when it serves several GPU branches), t = target tile, c = the
        # rng counter BEFORE the draw (absolute stream position — aligns
        # draws even when sequences slip). Draw-order parity makes
        # sequences align; a reordered/extra roll shows as a mismatched CB
        # line, invisible to the rng column.
        b = getattr(self, "_log_combat_b", None)
        log_hit = b is not None and bool(mask[b])
        c0 = int(self.rng_state[b]) if log_hit else 0
        r = self._next_random(mask)
        # B-29: diff may be fractional now (wounded units subtract hp/10, a
        # river melee subtracts 5). Quantize to 0.1 (q = round(diff·10)) and
        # look up 30·e^(0.04·q/10) — the fixture table (indexed i = q+600) is
        # the EXACT JS double damageRoll computes, so parity survives the ulp.
        q = js_round(diff * 10).to(torch.long)
        base = self._dmg_base[(q + 600).clamp(0, 1200)]
        dmg = js_round(base * (0.8 + 0.4 * r)).clamp(min=1).to(torch.long)
        if log_hit:
            t_ = int(tile[b]) if tile is not None else -1
            self._combat_events.append(
                f"k:{k} t:{t_} c:{c0} diff{int(q[b])} r{int(js_round(r[b] * 1e6))} dmg{int(dmg[b])}"
            )
        return dmg

    def _wound(self, hp: torch.Tensor) -> torch.Tensor:
        """B-29 (real Civ 6): a damaged unit's combat-strength penalty —
        −1 CS per 10 HP lost, linear, up to −10 at 0 HP. Float64, no rounding
        (damageRoll quantizes the final diff). hp is a unit-HP tensor; cities /
        city-states / walls are NOT units and never pass through here."""
        return 10.0 * ((100.0 - hp.double()) / 100.0)

    def _river_cross(self, frm: torch.Tensor, to: torch.Tensor) -> torch.Tensor:
        """B-29 (mirrors crossesRiver): returns 1 where the melee edge
        frm->to (an adjacent tile pair) crosses a river, else 0. neigh column
        d IS riverMask bit d — the movement walkers read the same bit for the
        +3 crossing charge — so find the neighbour direction of frm that lands
        on `to` and return that river bit (at most one direction matches; a
        non-adjacent or off-map `to` yields 0, exactly like crossesRiver)."""
        arange6 = torch.arange(6, device=self.device)
        nb = self.neigh[frm.clamp(min=0)]  # [B, 6]
        match = (nb == to.unsqueeze(1)) & (to.unsqueeze(1) >= 0) & (frm.unsqueeze(1) >= 0)
        rm = self.river_mask.gather(1, frm.clamp(min=0).unsqueeze(1)).squeeze(1)  # [B]
        bits = (rm.unsqueeze(1) >> arange6) & 1  # [B, 6]
        return (bits * match.long()).sum(dim=1)  # 0 or 1

    def _flank_support(
        self,
        def_tile: torch.Tensor,
        def_side: torch.Tensor,
        def_civ: torch.Tensor,
        attacker_tile: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """B-7 (mirrors combat.ts flankCount/supportCount). For a UNIT defender
        on def_tile [B], count the MILITARY units on the 6 adjacent tiles that
        are hostile to (flanking) or friendly to (support) the defender.

        def_side [B] long: 0 = player, 1 = barbarian, 2 = rival (civ index in
        def_civ [B]). attacker_tile [B]: the tile of the melee attacker to
        EXCLUDE from flanking (u != attacker); pass all -1 for a ranged/city
        attacker (support-only sites — the returned flank is then unused).

        Stacking blocks foreign units, so each tile holds at most ONE military
        unit — each of the 6 neighbours contributes 0 or 1. Returns
        (flank [B] long, support [B] long)."""
        rcap = max(self.R - 1, 0)
        nb = self.neigh[def_tile.clamp(min=0)]  # [B, 6]
        nbc = nb.clamp(min=0)
        on = nb >= 0
        has_barb = (self.barb_at.gather(1, nbc) >= 0) & on
        has_pmil = (self.pmil_at.gather(1, nbc) >= 0) & on
        rvn = self.rv_at.gather(1, nbc)
        has_rv = (rvn >= 0) & on
        rv_civ_n = self.v_civ.gather(1, rvn.clamp(min=0)).clamp(max=rcap)  # [B, 6]
        # a rival military neighbour whose civ is at war with the player
        rv_war_n = has_rv & self.r_atwar.gather(1, rv_civ_n)
        dside = def_side.unsqueeze(1)  # [B, 1]
        dciv = def_civ.clamp(min=0).clamp(max=rcap).unsqueeze(1)  # [B, 1]
        is_pl = dside == 0
        is_bb = dside == 1
        is_rv = dside == 2
        atwar_dc = self.r_atwar.gather(1, dciv)  # [B, 1] — the defender's rival civ at war
        # hostile-to-defender military per neighbour (unitsHostile, u military)
        hostile = (
            (is_pl & (has_barb | rv_war_n))
            | (is_bb & (has_pmil | has_rv))
            | (is_rv & (has_barb | (has_pmil & atwar_dc)))
        )
        # exclude the attacker's own unit (the military at attacker_tile)
        is_atk = (nb == attacker_tile.unsqueeze(1)) & (attacker_tile.unsqueeze(1) >= 0)
        hostile = hostile & ~is_atk
        # friendly-to-defender military (same owner AND civId), u military
        friendly = (
            (is_pl & has_pmil)
            | (is_bb & has_barb)
            | (is_rv & has_rv & (rv_civ_n == dciv))
        )
        return hostile.long().sum(dim=1), friendly.long().sum(dim=1)

    def _blocked_for(self, tiles: torch.Tensor, side: str, civ: int | None = None) -> torch.Tensor:
        """Stacking check for tiles [B, N] (mirrors tileFreeForUnit): a
        foreign unit blocks entirely; an own unit of the same domain blocks;
        own cross-domain stacks. side: 'barb' | 'pmil' | 'pciv' | 'rmil' |
        'rciv' ('rmil'/'rciv' are C1-B5a's civ-aware rival probes — pass the
        probing rival index; rival civs are FOREIGN to each other)."""
        tc = tiles.clamp(min=0)
        barb = self.barb_at.gather(1, tc) >= 0
        pmil = self.pmil_at.gather(1, tc) >= 0
        pciv = self.pciv_at.gather(1, tc) >= 0
        rv_slot = self.rv_at.gather(1, tc)
        rv = rv_slot >= 0
        rvc_slot = self.rvciv_at.gather(1, tc)
        rvc = rvc_slot >= 0
        if side == "pmil":
            return barb | pmil | rv | rvc
        if side == "pciv":
            return barb | pciv | rv | rvc
        if side == "rmil":
            # foreign anything; own-civ military (same domain); own-civ
            # civilian stacks (cross-domain)
            rvc_foreign = rvc & (self.v_civ.gather(1, rvc_slot.clamp(min=0)) != civ)
            return barb | pmil | pciv | rv | rvc_foreign
        if side == "rciv":
            # foreign anything; own-civ civilian (same domain); own-civ
            # military stacks (cross-domain)
            rv_foreign = rv & (self.v_civ.gather(1, rv_slot.clamp(min=0)) != civ)
            return barb | pmil | pciv | rv_foreign | rvc
        # 'barb': anything standing there blocks.
        return barb | pmil | pciv | rv | rvc

    def _first_free_spot(self, at_tile: torch.Tensor, side: str, civ_mask: torch.Tensor | None = None, civ: int | None = None) -> tuple[torch.Tensor, torch.Tensor]:
        """Mirrors spawnUnit's placement probe: the anchor if free, else the
        first free neighbor in direction order (the stable distance sort
        keeps exactly that order). side: 'barb' | 'player' | 'rival';
        civ_mask [B] bool (player only) — True = civilian probe.
        Returns (found [B], spot [B])."""
        cand7 = torch.cat([at_tile.unsqueeze(1), self.neigh[at_tile.clamp(min=0)]], dim=1)  # [B, 7]
        okc = cand7.clamp(min=0)
        barb = self.barb_at.gather(1, okc) >= 0
        pmil = self.pmil_at.gather(1, okc) >= 0
        pciv = self.pciv_at.gather(1, okc) >= 0
        rv = self.rv_at.gather(1, okc) >= 0
        rvc_slot = self.rvciv_at.gather(1, okc)
        rvc = rvc_slot >= 0
        if side == "player":
            dom = torch.where(civ_mask.unsqueeze(1), pciv, pmil)
            blocked = barb | rv | rvc | dom
        elif side == "rival" and civ is not None:
            # C1-B5b: spawnUnit probes through tileFreeForUnit — an OWN-CIV
            # civilian stacks with a fresh military unit (cross-domain);
            # foreign civilians block.
            rvc_foreign = rvc & (self.v_civ.gather(1, rvc_slot.clamp(min=0)) != civ)
            blocked = barb | pmil | pciv | rv | rvc_foreign
        else:  # barb: every other unit blocks
            blocked = barb | pmil | pciv | rv | rvc
        ok7 = (cand7 >= 0) & self.passable.gather(1, okc) & ~blocked
        first = torch.where(ok7, torch.arange(7, device=self.device), 7).min(dim=1).values
        spot = cand7.gather(1, first.clamp(max=6).unsqueeze(1)).squeeze(1)
        return first < 7, spot

    def _spawn_barb(self, mask: torch.Tensor, at_tile: torch.Tensor, unit_type: int) -> None:
        """Barbarians are military; appends to the slot list, which is what
        keeps GPU unit order identical to state.units array order."""
        if not bool(mask.any()):
            return
        found, spot = self._first_free_spot(at_tile, "barb")
        can = mask & found
        if not bool(can.any()):
            return
        rows = can.nonzero(as_tuple=True)[0]
        slot = self.next_slot[rows]
        assert int(slot.max()) < U_MAX, "barbarian slot pool exhausted — raise U_MAX"
        self.u_alive[rows, slot] = True
        self.u_type[rows, slot] = unit_type
        self.u_tile[rows, slot] = spot[rows]
        self.u_hp[rows, slot] = self.rules.combat.get("unitHp", 100)
        self.u_fortify[rows, slot] = 0  # B-5: a fresh (possibly reclaimed) slot starts undug
        self.barb_at[rows, spot[rows]] = slot
        self.next_slot[rows] += 1

    def _spawn_player(self, mask: torch.Tensor, at_tile: torch.Tensor, type_idx: torch.Tensor) -> None:
        """A trained unit appears at/near its city center (spawnUnit)."""
        if not bool(mask.any()):
            return
        civ = self._p_civ[type_idx.clamp(min=0)]
        found, spot = self._first_free_spot(at_tile, "player", civ)
        can = mask & found
        if not bool(can.any()):
            return
        rows = can.nonzero(as_tuple=True)[0]
        slot = self.p_next[rows]
        assert int(slot.max()) < P_MAX, "player slot pool exhausted — raise P_MAX"
        self.p_alive[rows, slot] = True
        self.p_type[rows, slot] = type_idx[rows]
        self.p_tile[rows, slot] = spot[rows]
        self.p_hp[rows, slot] = self.rules.combat.get("unitHp", 100)
        self.p_fortify[rows, slot] = 0  # B-5: a fresh (possibly reclaimed) slot starts undug
        self.p_charges[rows, slot] = self._p_charges[type_idx[rows]]
        civ_rows = civ[rows]
        mil_rows = rows[~civ_rows]
        if len(mil_rows) > 0:
            self.pmil_at[mil_rows, spot[mil_rows]] = self.p_next[mil_rows]
        cv_rows = rows[civ_rows]
        if len(cv_rows) > 0:
            self.pciv_at[cv_rows, spot[cv_rows]] = self.p_next[cv_rows]
        self.p_next[rows] += 1
        # P4/D-22: track the strongest MELEE ever fielded (city defense).
        # Gated on `can` like TS — a no-spot spawn never lands the unit.
        # clamp max too: unmasked rows may hold district queue codes.
        tim = type_idx.clamp(min=0, max=self.NU - 1)
        melee_cs = torch.where(
            can & (self._p_rng_str[tim] == 0),
            self._p_combat[tim],
            torch.zeros_like(self.best_melee),
        )
        self.best_melee = torch.maximum(self.best_melee, melee_cs)

    def _clear_camp_at(self, mask: torch.Tensor, tile: torch.Tensor, civ: torch.Tensor | None = None) -> None:
        """A non-barbarian unit entering a camp tile clears it: +50 gold to
        ITS civ (P5/S7 C-3 — rivals bank it too; pass civ=[B] rival ids) and
        the camp list splices left (order matters for later garrison loops)."""
        if not bool(mask.any()):
            return
        hit = mask & (self.camp_tile == tile.unsqueeze(1)).any(dim=1)
        if not bool(hit.any()):
            return
        reward = self.rules.combat.get("campClearReward", 50)
        for b in hit.nonzero(as_tuple=True)[0].tolist():
            row = self.camp_tile[b]
            k = int((row == tile[b]).nonzero(as_tuple=True)[0][0])
            row[k:-1] = row[k + 1 :].clone()
            row[-1] = -1
            self.n_camps[b] -= 1
            if civ is None:
                self.treasury[b] += reward
            else:
                self.r_treasury[b, int(civ[b])] += float(reward)

    # --- player unit actions (phase 4b) ---------------------------------------

    def unit_action_mask(self) -> torch.Tensor:
        """[B, P_MAX, 16] valid orders per player unit: 0–5 step to that
        neighbor, 6–11 melee-attack the barbarian there, 12 hold, 13/14/15
        build a FARM / MINE / LUMBER_MILL (builders only, on a tile where
        that improvement is valid). Orders are RE-validated at execution
        (both engines identically), because an earlier unit's move can
        invalidate a later unit's order."""
        B, dev = self.B, self.device
        nb = self.neigh[self.p_tile.clamp(min=0).reshape(-1)].reshape(B, P_MAX, 6)
        nbc = nb.clamp(min=0).reshape(B, -1)
        barb = (self.barb_at.gather(1, nbc) >= 0).reshape(B, P_MAX, 6)
        pmil = (self.pmil_at.gather(1, nbc) >= 0).reshape(B, P_MAX, 6)
        pciv = (self.pciv_at.gather(1, nbc) >= 0).reshape(B, P_MAX, 6)
        rvn = self.rv_at.gather(1, nbc)
        rv_civ = self.v_civ.gather(1, rvn.clamp(min=0)).clamp(max=max(self.R - 1, 0))
        rv_war = ((rvn >= 0) & self.r_atwar.gather(1, rv_civ)).reshape(B, P_MAX, 6)
        rv_any = (rvn >= 0).reshape(B, P_MAX, 6)
        # V-W2: at-war rival CITY CENTERS are melee targets (attackTargets'
        # rivalCity branch) — the siege the mask previously never offered.
        rcn = self.rvcity_at.gather(1, nbc)
        rc_war = ((rcn >= 0) & self.r_atwar.gather(1, rcn.clamp(min=0).clamp(max=max(self.R - 1, 0)))).reshape(B, P_MAX, 6)
        rvc_civ_n = (self.rvciv_at.gather(1, nbc) >= 0).reshape(B, P_MAX, 6)
        passable = self.passable.gather(1, nbc).reshape(B, P_MAX, 6)
        on_map = nb >= 0
        civ = self._p_civ[self.p_type]
        dom = torch.where(civ.unsqueeze(2), pciv, pmil)
        alive = self.p_alive.unsqueeze(2)
        move = on_map & passable & ~barb & ~rv_any & ~rvc_civ_n & ~dom & alive
        can_fight = (self._p_combat[self.p_type] > 0).unsqueeze(2)
        # P4/D-23: rangedAttack bombards cities too — rc_war is a target for
        # every fighter now (CS centers stay a tracked mask follow-up).
        attack = on_map & (barb | rv_war | rc_war) & can_fight & alive
        hold = self.p_alive.unsqueeze(2)
        # 13/14/15: build FARM / MINE / LUMBER_MILL — a builder with charges
        # standing on an owned, unimproved, non-center tile where that
        # improvement is valid (mirrors validImprovements: FARM's hill case is
        # hillFarms-civic-gated, MINE gated by MINING, LUMBER_MILL by
        # CONSTRUCTION; each static mask carries the terrain/resource part).
        if self.improvements_on and self._builder_idx >= 0:
            tc = self.p_tile.clamp(min=0)  # [B, P_MAX]
            if self._hillfarms_civic >= 0:
                civ_done = self.civics[:, self._hillfarms_civic].unsqueeze(1)
            else:
                civ_done = torch.zeros(B, 1, dtype=torch.bool, device=dev)
            mining = self.techs[:, self._mine_unlock_tech].unsqueeze(1) if self._mine_unlock_tech >= 0 else torch.zeros(B, 1, dtype=torch.bool, device=dev)
            constr = self.techs[:, self._lumber_unlock_tech].unsqueeze(1) if self._lumber_unlock_tech >= 0 else torch.zeros(B, 1, dtype=torch.bool, device=dev)
            here_ok = (
                self.p_alive
                & (self.p_type == self._builder_idx)
                & (self.p_charges > 0)
                & (self.owner.gather(1, tc) >= 0)
                & (self.center_at.gather(1, tc) < 0)
                & (self.improvement.gather(1, tc) < 0)
                & (self.district.gather(1, tc) < 0)  # can't improve a district tile (mirrors validImprovements; matters once off-script districts land, D5b)
                & (self.built_wonder.gather(1, tc) < 0)  # A-8 gate-catch: an in-flight wonder pave refuses improvements
            )
            farmable = self.farm_flat.gather(1, tc) | (self.farm_hill.gather(1, tc) & civ_done)
            build_f = (here_ok & farmable).unsqueeze(2)
            build_m = (here_ok & self.mine_ok.gather(1, tc) & mining).unsqueeze(2)
            build_l = (here_ok & self.lumber_ok.gather(1, tc) & ~self.feat_stripped.gather(1, tc) & constr).unsqueeze(2)  # GS: chopped woods -> no lumber mill
        else:
            zc = torch.zeros(B, P_MAX, 1, dtype=torch.bool, device=dev)
            build_f = build_m = build_l = zc
        ftr_t = self.tile_ftr.gather(1, tc)
        ftu_t = self.tile_ftu.gather(1, tc).clamp(min=0)
        ft_unlocked = self.techs.gather(1, ftu_t) & (self.tile_ftu.gather(1, tc) >= 0)
        not_stripped = ~self.feat_stripped.gather(1, tc)
        chop = (here_ok & (ftr_t > 0) & ft_unlocked & not_stripped).unsqueeze(2)
        return torch.cat([move, attack, hold, build_f, build_m, build_l, chop], dim=2)

    def rival_slot_map(self, r: int) -> torch.Tensor:
        """[B, P_MAX] the v-slot index behind each rival-r unit row (slot
        order = spawn order, padded with -1) — the seat-1 units head rides
        the same P_MAX row layout as the player's."""
        B = self.B
        civ_units = self.v_alive & (self.v_civ == r)  # [B, U_MAX]
        rank = civ_units.long().cumsum(dim=1) - 1  # rank among the civ's alive slots
        out = torch.full((B, P_MAX), -1, dtype=torch.long, device=self.device)
        take = civ_units & (rank < P_MAX)
        bs, slots = take.nonzero(as_tuple=True)
        out[bs, rank[bs, slots]] = slots
        return out

    def rival_unit_mask(self, r: int) -> torch.Tensor:
        """[B, P_MAX, 16] valid orders per CONTROLLED rival-r unit, in the
        player head layout: 0-5 step (civ-aware blocking), 6-11 attack the
        barbarian there or — at war — the player unit/center there, 12
        hold, 13/14/15 build FARM/MINE/LUMBER (builders, B5b rules under
        the rival's own unlocks). Execution re-validates, like the
        player's."""
        B, dev = self.B, self.device
        smap = self.rival_slot_map(r)
        present = smap >= 0
        sc = smap.clamp(min=0)
        tile = self.v_tile.gather(1, sc)  # [B, P_MAX]
        nb = self.neigh[tile.clamp(min=0).reshape(-1)].reshape(B, P_MAX, 6)
        nbc = nb.clamp(min=0).reshape(B, -1)
        barb = (self.barb_at.gather(1, nbc) >= 0).reshape(B, P_MAX, 6)
        pmil = (self.pmil_at.gather(1, nbc) >= 0).reshape(B, P_MAX, 6)
        pciv = (self.pciv_at.gather(1, nbc) >= 0).reshape(B, P_MAX, 6)
        rvn = self.rv_at.gather(1, nbc)
        rv_own = ((rvn >= 0) & (self.v_civ.gather(1, rvn.clamp(min=0)) == r)).reshape(B, P_MAX, 6)
        rv_any = (rvn >= 0).reshape(B, P_MAX, 6)
        rcn = self.rvciv_at.gather(1, nbc)
        rc_own = ((rcn >= 0) & (self.v_civ.gather(1, rcn.clamp(min=0)) == r)).reshape(B, P_MAX, 6)
        rc_any = (rcn >= 0).reshape(B, P_MAX, 6)
        passable = self.passable.gather(1, nbc).reshape(B, P_MAX, 6)
        on_map = nb >= 0
        is_civ = (self._p_charges[self.v_type.gather(1, sc)] > 0).unsqueeze(2)  # builders
        # blocking mirrors tileFreeForUnit for the moving unit's domain
        own_dom = torch.where(is_civ, rc_own, rv_own)
        foreign = barb | pmil | pciv | (rv_any & ~rv_own) | (rc_any & ~rc_own)
        alive = present.unsqueeze(2)
        move = on_map & passable & ~foreign & ~own_dom & alive
        can_fight = (self._p_combat[self.v_type.gather(1, sc)] > 0).unsqueeze(2)
        at_war = self.r_atwar[:, r].view(B, 1, 1)
        p_target = (pmil | pciv | (self.center_at.gather(1, nbc) >= 0).reshape(B, P_MAX, 6)) & at_war
        attack = on_map & (barb | p_target) & can_fight & alive
        hold = present.unsqueeze(2)
        if self.improvements_on and self._builder_idx >= 0:
            tc = tile.clamp(min=0)
            hf = self.r_civics[:, r, self._hillfarms_civic].unsqueeze(1) if self._hillfarms_civic >= 0 else torch.zeros(B, 1, dtype=torch.bool, device=dev)
            mining = self.r_techs[:, r, self._mine_unlock_tech].unsqueeze(1) if self._mine_unlock_tech >= 0 else torch.zeros(B, 1, dtype=torch.bool, device=dev)
            constr = self.r_techs[:, r, self._lumber_unlock_tech].unsqueeze(1) if self._lumber_unlock_tech >= 0 else torch.zeros(B, 1, dtype=torch.bool, device=dev)
            here_ok = (
                present
                & (self.v_type.gather(1, sc) == self._builder_idx)
                & (self.v_charges.gather(1, sc) > 0)
                & (self.rival_at.gather(1, tc) == r)
                & (self.rvcity_at.gather(1, tc) < 0)
                & (self.improvement.gather(1, tc) < 0)
                & (self.district.gather(1, tc) < 0)
                & (self.built_wonder.gather(1, tc) < 0)  # A-8 gate-catch: an in-flight wonder pave refuses improvements
            )
            farmable = self.farm_flat.gather(1, tc) | (self.farm_hill.gather(1, tc) & hf)
            build_f = (here_ok & farmable).unsqueeze(2)
            build_m = (here_ok & self.mine_ok.gather(1, tc) & mining).unsqueeze(2)
            build_l = (here_ok & self.lumber_ok.gather(1, tc) & ~self.feat_stripped.gather(1, tc) & constr).unsqueeze(2)  # GS: chopped woods -> no lumber mill
        else:
            zc = torch.zeros(B, P_MAX, 1, dtype=torch.bool, device=dev)
            build_f = build_m = build_l = zc
        # C3-sym V-H1: controlled rival builders chop like the player —
        # removable feature present, THAT RIVAL's removal tech in, unstripped.
        ftr_t = self.tile_ftr.gather(1, tc)
        ftu_t = self.tile_ftu.gather(1, tc)
        unlocked = self.r_techs[:, r, :].gather(1, ftu_t.clamp(min=0)) & (ftu_t >= 0)
        chop = (is_civ.squeeze(2) & (self.v_charges.gather(1, sc) > 0) & (ftr_t > 0) & unlocked & ~self.feat_stripped.gather(1, tc)).unsqueeze(2)
        return torch.cat([move, attack, hold, build_f, build_m, build_l, chop], dim=2)

    def _apply_rival_unit_actions(self, r: int, actions: torch.Tensor) -> None:
        """C3-prep: execute a CONTROLLED rival's unit orders in slot order
        (the rival_unit_mask layout; -1/12 = hold). Orders are re-validated
        at execution exactly like the player applier; combat draws from the
        shared stream (off the parity path — controlled is empty in the
        gates)."""
        B, dev = self.B, self.device
        smap = self.rival_slot_map(r)
        ctl = self.controlled[:, r]
        for row in range(P_MAX):
            slot = smap[:, row]
            present = (slot >= 0) & ctl
            if not bool(present.any()):
                continue
            sc = slot.clamp(min=0)
            a = actions[:, row].to(torch.long)
            act = present & (a >= 0) & (a != 12)
            if not bool(act.any()):
                continue
            here = self.v_tile.gather(1, sc.unsqueeze(1)).squeeze(1)
            is_civ = self._p_charges[self.v_type.gather(1, sc.unsqueeze(1)).squeeze(1)] > 0
            # --- moves 0-5 ---
            mv = act & (a < 6)
            if bool(mv.any()):
                nb = self.neigh[here.clamp(min=0)]  # [B, 6]
                tgt = nb.gather(1, a.clamp(min=0, max=5).unsqueeze(1)).squeeze(1)
                tc = tgt.clamp(min=0)
                blocked_mil = self._blocked_for(tgt.unsqueeze(1), "rmil", civ=r).squeeze(1)
                blocked_civ = self._blocked_for(tgt.unsqueeze(1), "rciv", civ=r).squeeze(1)
                blocked = torch.where(is_civ, blocked_civ, blocked_mil)
                ok = mv & (tgt >= 0) & self.passable.gather(1, tc.unsqueeze(1)).squeeze(1) & ~blocked
                if bool(ok.any()):
                    rows_ = ok.nonzero(as_tuple=True)[0]
                    civ_rows = rows_[is_civ[rows_]]
                    mil_rows = rows_[~is_civ[rows_]]
                    if len(civ_rows):
                        self.rvciv_at[civ_rows, here[civ_rows]] = -1
                        self.rvciv_at[civ_rows, tgt[civ_rows]] = sc[civ_rows]
                    if len(mil_rows):
                        self.rv_at[mil_rows, here[mil_rows]] = -1
                        self.rv_at[mil_rows, tgt[mil_rows]] = sc[mil_rows]
                    self.v_tile[rows_, sc[rows_]] = tgt[rows_]
                    self.v_acted[rows_, sc[rows_]] = True  # P4/D-2
                    self._clear_camp_at(ok, tgt, civ=torch.full((B,), r, dtype=torch.long, device=dev))  # P5/S7 (C-3)
            # --- attacks 6-11 (military only; the shared resolution handles
            # barb/player defenders, lone civilians and city targets) ---
            atk = act & (a >= 6) & (a < 12) & ~is_civ
            if bool(atk.any()):
                nb = self.neigh[here.clamp(min=0)]
                tgt = nb.gather(1, (a - 6).clamp(min=0, max=5).unsqueeze(1)).squeeze(1)
                valid_t = atk & (tgt >= 0)
                if bool(valid_t.any()):
                    tc = tgt.clamp(min=0)
                    barb_t = self.barb_at.gather(1, tc.unsqueeze(1)).squeeze(1) >= 0
                    at_war = self.r_atwar[:, r]
                    p_unit = (self.pmil_at.gather(1, tc.unsqueeze(1)).squeeze(1) >= 0) | (self.pciv_at.gather(1, tc.unsqueeze(1)).squeeze(1) >= 0)
                    p_city = self.center_at.gather(1, tc.unsqueeze(1)).squeeze(1) >= 0
                    unit_att = valid_t & (barb_t | (p_unit & at_war))
                    city_att = valid_t & ~barb_t & ~p_unit & p_city & at_war
                    for b_ in range(B):
                        if not bool(valid_t[b_]):
                            continue
                        v = int(sc[b_])
                        one = torch.zeros(B, dtype=torch.bool, device=dev)
                        one[b_] = True
                        if bool(unit_att[b_]):
                            self._hostile_vs_unit(one, tgt, "rival", v)
                            self.v_acted[b_, v] = True  # P4/D-2
                        elif bool(city_att[b_]):
                            self._hostile_city_attack(one, self.center_at.gather(1, tc.unsqueeze(1)).squeeze(1), "rival", v)
                            self.v_acted[b_, v] = True  # P4/D-2
            # --- builds 13-15 (builders) ---
            # C3-sym V-H1: rival chop (16) — strip + grant into the owning
            # rival's NEAREST alive city (food -> rc_growth, production ->
            # rc_progress), mirroring the player branch; charge spends via
            # the applier's slot-gather pattern, disband at 0.
            ftr_c = self.tile_ftr.gather(1, here.unsqueeze(1)).squeeze(1)
            ftu_c = self.tile_ftu.gather(1, here.unsqueeze(1)).squeeze(1)
            unlocked_c = (ftu_c >= 0) & self.r_techs[:, r, :].gather(1, ftu_c.clamp(min=0).unsqueeze(1)).squeeze(1)
            chp = (
                act
                & (a == 16)
                & is_civ
                & (self.v_charges.gather(1, sc.unsqueeze(1)).squeeze(1) > 0)
                & (ftr_c > 0)
                & unlocked_c
                & ~self.feat_stripped.gather(1, here.unsqueeze(1)).squeeze(1)
            )
            if bool(chp.any()):
                rows_c = chp.nonzero(as_tuple=True)[0]
                tiles_c = here[rows_c]
                self._strip_feature_at(rows_c, tiles_c)
                if self.LUMBER >= 0:
                    was_l = self.improvement[rows_c, tiles_c] == self.LUMBER
                    self.improvement[rows_c, tiles_c] = torch.where(was_l, torch.full_like(self.improvement[rows_c, tiles_c], -1), self.improvement[rows_c, tiles_c])
                done_r = (self.r_techs[:, r, :].sum(dim=1) + self.r_civics[:, r, :].sum(dim=1)).to(self.dtype)
                amount_r = js_round(20.0 + 2.5 * done_r)
                own_r = self.rival_at[rows_c, tiles_c]
                for i2 in range(len(rows_c)):
                    b2 = int(rows_c[i2])
                    if int(own_r[i2]) != r:
                        continue  # outside this rival's borders: chopped, no lump
                    aliv = self.rc_alive[b2, r]
                    if not bool(aliv.any()):
                        continue
                    ctrs = self.rc_center[b2, r].clamp(min=0)
                    d = self.pair_dist[int(tiles_c[i2])][ctrs].float()
                    d = torch.where(aliv, d, torch.full_like(d, 1e9))
                    j = int(d.argmin())
                    amt = float(amount_r[b2])
                    if int(ftr_c[rows_c[i2]]) == 1:
                        self.rc_growth[b2, r, j] += amt
                    else:
                        self.rc_progress[b2, r, j] += amt
                self.v_charges[rows_c, sc[rows_c]] -= 1
                self.v_acted[rows_c, sc[rows_c]] = True  # P4/D-2
                spent_c = chp & (self.v_charges.gather(1, sc.unsqueeze(1)).squeeze(1) <= 0)
                if bool(spent_c.any()):
                    dr = spent_c.nonzero(as_tuple=True)[0]
                    self.v_alive[dr, sc[dr]] = False
                    self.rvciv_at[dr, here[dr]] = -1
            bld = act & (a >= 13) & (a < 16) & is_civ
            if bool(bld.any()):
                tc = here.clamp(min=0)
                imp_for = {13: self.FARM, 14: self.MINE, 15: self.LUMBER}
                hf = self.r_civics[:, r, self._hillfarms_civic] if self._hillfarms_civic >= 0 else torch.zeros(B, dtype=torch.bool, device=dev)
                mining = self.r_techs[:, r, self._mine_unlock_tech] if self._mine_unlock_tech >= 0 else torch.zeros(B, dtype=torch.bool, device=dev)
                constr = self.r_techs[:, r, self._lumber_unlock_tech] if self._lumber_unlock_tech >= 0 else torch.zeros(B, dtype=torch.bool, device=dev)
                base_ok = (
                    bld
                    & (self.v_charges.gather(1, sc.unsqueeze(1)).squeeze(1) > 0)
                    & (self.rival_at.gather(1, tc.unsqueeze(1)).squeeze(1) == r)
                    & (self.rvcity_at.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
                    & (self.improvement.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
                    & (self.district.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)
                    & (self.built_wonder.gather(1, tc.unsqueeze(1)).squeeze(1) < 0)  # A-8 gate-catch
                )
                farm_ok = base_ok & (a == 13) & (self.farm_flat.gather(1, tc.unsqueeze(1)).squeeze(1) | (self.farm_hill.gather(1, tc.unsqueeze(1)).squeeze(1) & hf))
                mine_ok2 = base_ok & (a == 14) & self.mine_ok.gather(1, tc.unsqueeze(1)).squeeze(1) & mining & (self.MINE >= 0)
                lum_ok = base_ok & (a == 15) & self.lumber_ok.gather(1, tc.unsqueeze(1)).squeeze(1) & ~self.feat_stripped.gather(1, tc.unsqueeze(1)).squeeze(1) & constr & (self.LUMBER >= 0)  # GS: chopped woods
                did = torch.zeros(B, dtype=torch.bool, device=dev)
                for code, okm in ((13, farm_ok), (14, mine_ok2), (15, lum_ok)):
                    if bool(okm.any()):
                        rows_ = okm.nonzero(as_tuple=True)[0]
                        self.improvement[rows_, tc[rows_]] = imp_for[code]
                        self.pillaged[rows_, tc[rows_]] = False
                        did[rows_] = True
                if bool(did.any()):
                    rows_ = did.nonzero(as_tuple=True)[0]
                    self.v_charges[rows_, sc[rows_]] -= 1
                    self.v_acted[rows_, sc[rows_]] = True  # P4/D-2
                    self._eff_version += 1
                    spent = did & (self.v_charges.gather(1, sc.unsqueeze(1)).squeeze(1) <= 0)
                    if bool(spent.any()):
                        dr = spent.nonzero(as_tuple=True)[0]
                        self.v_alive[dr, sc[dr]] = False
                        self.rvciv_at[dr, here[dr]] = -1

    def _scripted_builder(self) -> None:
        """Scripted-policy builder (phase 6a): each player BUILDER with
        charges either builds a FARM on its tile (buildable unimproved farm
        inside its borders) and spends a charge (disbanding at 0), or
        single-steps toward the nearest farm job (nearest by distance, ties
        to lowest tile index; then the passable, civilian-free neighbour
        closest to it, ties to direction order, move only if strictly
        closer). Draws no RNG. Scripted path only (units is None)."""
        if self._builder_idx < 0 or not self.improvements_on:
            return
        active = self.p_alive & (self.p_type == self._builder_idx) & (self.p_charges > 0)
        if not bool(active.any()):
            return
        dev, T = self.device, self.T
        if self._hillfarms_civic >= 0:
            civ_done = self.civics[:, self._hillfarms_civic]
        else:
            civ_done = torch.zeros(self.B, dtype=torch.bool, device=dev)
        arangeT = torch.arange(T, device=dev)
        arange6 = torch.arange(6, device=dev)
        p_high = int(self.p_next.max().item())
        # D-14 (the D-4 live-slot pattern): `active` is FIXED at the loop top,
        # so slots outside this snapshot are exactly the ones the old per-slot
        # any() check skipped — same iteration set, no per-dead-slot sync.
        p_live = active[:, :p_high].any(dim=0).nonzero(as_tuple=True)[0].tolist() if p_high else []
        for p in p_live:
            act = active[:, p]
            here = self.p_tile[:, p]
            hc = here.clamp(min=0)
            owned_here = self.owner.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0
            not_center = self.center_at.gather(1, hc.unsqueeze(1)).squeeze(1) < 0
            unimproved = self.improvement.gather(1, hc.unsqueeze(1)).squeeze(1) < 0
            flat_h = self.farm_flat.gather(1, hc.unsqueeze(1)).squeeze(1)
            hill_h = self.farm_hill.gather(1, hc.unsqueeze(1)).squeeze(1)
            district_free = self.district.gather(1, hc.unsqueeze(1)).squeeze(1) < 0  # a district paves the tile (validImprovements returns [] there)
            wonder_free = self.built_wonder.gather(1, hc.unsqueeze(1)).squeeze(1) < 0  # A-8 gate-catch: in-flight wonder paves too
            # #56 H2: REPAIR first — an owned pillaged tile underfoot clears
            # the flag (no charge, the turn is spent via p_acted), exactly the
            # rival A-13 branch and the exporter's repair-first order.
            pill_h = self.pillaged.gather(1, hc.unsqueeze(1)).squeeze(1)
            rep = act & owned_here & pill_h
            if bool(rep.any()):
                rrows = rep.nonzero(as_tuple=True)[0]
                self.pillaged[rrows, here[rrows]] = False
                self.p_acted[:, p] = self.p_acted[:, p] | rep
                self._eff_version += 1
            build = (act & ~rep) & owned_here & not_center & unimproved & district_free & wonder_free & (flat_h | (hill_h & civ_done))
            if bool(build.any()):
                rows = build.nonzero(as_tuple=True)[0]
                self.improvement[rows, here[rows]] = self.FARM
                self.p_charges[rows, p] -= 1
                self.p_acted[:, p] = self.p_acted[:, p] | build  # P4/D-2
                self._eff_version += 1
                gone = build & (self.p_charges[:, p] <= 0)
                if bool(gone.any()):
                    gr = gone.nonzero(as_tuple=True)[0]
                    self.pciv_at[gr, here[gr]] = -1
                    self.p_alive[gr, p] = False

            march = act & ~rep & ~build
            if not bool(march.any()):
                continue
            farmable = self.farm_flat | (self.farm_hill & civ_done.unsqueeze(1))
            # #56 H2: a job is unimproved-farmable OR pillaged (repair),
            # owned either way — the exporter walker's exact set.
            job = ((self.owner >= 0) & (self.center_at < 0) & (self.improvement < 0) & (self.district < 0) & (self.built_wonder < 0) & farmable) | ((self.owner >= 0) & self.pillaged)
            has_job = job.any(dim=1)
            d_job = self.pair_dist[hc.unsqueeze(1), arangeT.unsqueeze(0)].to(torch.long)
            jkey = torch.where(job, d_job * (T + 1) + arangeT, torch.full_like(d_job, 10**9))
            tgt = jkey.argmin(dim=1)
            d_here = self.pair_dist[here.clamp(min=0), tgt].to(torch.long)
            nb = self.neigh[hc]
            nbc = nb.clamp(min=0)
            step_ok = (nb >= 0) & self.passable.gather(1, nbc) & ~self._blocked_for(nb, "pciv")
            d_nb = self.pair_dist[tgt.unsqueeze(1), nbc].to(torch.long)
            skey = torch.where(step_ok, d_nb * 8 + arange6, torch.full_like(d_nb, 10**9))
            best = skey.min(dim=1).values
            move = march & has_job & (best < 10**9) & (torch.div(best, 8, rounding_mode="floor") < d_here)
            if bool(move.any()):
                dest = nb.gather(1, (best % 8).clamp(max=5).unsqueeze(1)).squeeze(1)
                rows = move.nonzero(as_tuple=True)[0]
                self.pciv_at[rows, here[rows]] = -1
                self.pciv_at[rows, dest[rows]] = p
                self.p_tile[rows, p] = dest[rows]
                self.p_acted[:, p] = self.p_acted[:, p] | move  # P4/D-2
                # #46r gate-catch (seed 9170 t160): walkPath clears camps for
                # ANY landing unit (+50 player treasury) — the scripted
                # builder was the ONLY mover in the engine missing the
                # mirror; dormant until a 250t trajectory walked one onto an
                # empty camp.
                self._clear_camp_at(move, dest)

    def _capture_rival_city(self, rows: torch.Tensor, civ: torch.Tensor, slot: torch.Tensor, ctr: torch.Tensor, plunder: bool = True) -> None:
        """V-W2: captureRivalCity — the rival city transfers to the PLAYER.
        Into a FREE player slot when one exists (TS gains the matching cap:
        beyond C cities the capture razes instead); the city's OWN tiles
        (A-17 registry) move rivalId -> cityId, pop lands at x0.75 (min 1), the slot
        initializes from the live planes (site = the center, water housing
        from wh, river from riv, dist from the pair_dist row)."""
        for i in range(len(rows)):
            b = int(rows[i]); r = int(civ[i]); j = int(slot[i]); c_t = int(ctr[i])
            pop = max(1, (int(self.rc_pop[b, r, j]) * 3) // 4)
            # the rival city dies either way — and its registries die with
            # it (TS removes the City object; a stale rc_dist_tile otherwise
            # leaks into rNDist and the D-8 counts: seed 9131 t196, 9 vs 7)
            self.rc_alive[b, r, j] = False
            self.rc_is_cap[b, r, j] = False  # P7-FULL: identity dies with the city (capitalTiles keeps the tile)
            self.rvcity_at[b, c_t] = -1
            self.rc_dist_tile[b, r, j, :] = -1
            self.rc_wonder[b, r, j, :] = -1  # A-4 hygiene
            self.rc_bldg[b, r, j, :] = False
            self.rc_outer_hp[b, r, j] = 0  # AUDIT B-1: walls die with the city
            # P5/S5 gate-catch (seed 9157 t111): the dead city's QUEUE dies
            # with it — a stale rc_current builder code made has_q see a
            # phantom queued builder civ-wide (TS removes the City object,
            # queue and all), flipping the next pick builder→horseman.
            self.rc_current[b, r, j] = -1
            self.rc_cost[b, r, j] = 0
            self.rc_progress[b, r, j] = 0
            self.rc_qtile[b, r, j] = -1
            # A-17: exactly this city's tiles leave the rival (registry scan)
            # — the old radius-3 sweep leaked the outer ring as orphaned civ
            # territory and stole sibling cities' frontage.
            cid = int(self.rc_id[b, r, j])
            ring = (self.rc_tile_id[b] == cid) & (self.rival_at[b] == r)
            # A-11: routes die with their endpoint (the TS filter twin).
            kill = (self.r_routes[b, r, :, 0] == cid) | (self.r_routes[b, r, :, 1] == cid)
            self.r_routes[b, r][kill] = -1
            self.rival_at[b] = torch.where(ring, torch.full_like(self.rival_at[b], -1), self.rival_at[b])
            self.rc_tile_id[b] = torch.where(ring, torch.full_like(self.rc_tile_id[b], -1), self.rc_tile_id[b])  # A-17
            # P5/S2 gate-catch (seed 9235 t241): TS APPENDS the captured city
            # (its trace keeps dead cities' columns and the new city gets a
            # NEW column), so the slot must be the founding HIGH-WATER mark
            # (founded_n — last-alive+1 lands in the newest hole when the
            # most recent city was the one that died). Raze at TS's count
            # cap; the hole-reuse fallback only fires when the column space
            # is exhausted below the cap — the trace cityIds follow the same
            # rule, and P7-FULL's seq-ordered walk keeps hole reuse
            # order-safe (behavior rides city_seq, never the column index).
            if int(self.alive[b].sum()) >= 6:
                continue  # razed (TS: state.cities.length >= 6)
            c_new = int(self.founded_n[b])
            if c_new >= self.C:
                free = (~self.alive[b]).nonzero(as_tuple=True)[0]
                if len(free) == 0:
                    continue  # razed: no slot at all
                c_new = int(free[0])
            else:
                self.founded_n[b] += 1
            self.alive[b, c_new] = True
            self.city_seq[b, c_new] = int(self.city_seq_next[b])
            self.city_seq_next[b] += 1
            self.is_cap[b, c_new] = False  # P7: captured cities are never capitals (TS isCapital: false)
            self.site[b, c_new] = c_t
            self.center_at[b, c_t] = c_new
            self.owner[b] = torch.where(ring & (self.owner[b] < 0), torch.full_like(self.owner[b], c_new), self.owner[b])
            self.owner[b, c_t] = c_new
            # P5/S1 gate-catch (seed 9131 rng 2026006110 t196): captured
            # districts are DEAD — TS's new city registers only CITY_CENTER,
            # so their adjacency yields/upkeep must not follow the territory.
            dead_ring = ring & (self.district[b] >= 0)
            dead_ring[c_t] = False  # the center IS the new city's live CITY_CENTER
            self.district_dead[b] = self.district_dead[b] | dead_ring
            self.pop[b, c_new] = pop
            self.food_box[b, c_new] = 0.0
            self.culture_box[b, c_new] = 0.0
            self.tiles_acquired[b, c_new] = int(self.rc_acquired[b, r, j]) if hasattr(self, "rc_acquired") else 0
            self.city_hp[b, c_new] = self.rules.combat.get("cityMaxHp", 200) // 2
            self.current[b, c_new] = -1
            # P5/S2 slot hygiene (seed 9235 t241): a reused slot must not
            # leak a dead city's queue progress/cost (TS starts queue = []).
            self.progress[b, c_new] = 0.0
            self.cur_cost[b, c_new] = 0.0
            self.q_dtile[b, c_new] = -1
            self.warrior_trained[b, c_new] = False
            self.buildings[b, c_new] = False
            self.outer_hp[b, c_new] = 0  # AUDIT B-1: captured city starts with no walls (buildings wiped)
            self.water_housing[b, c_new] = float(self.tile_wh[b, c_t])
            self.river_center[b, c_new] = bool(self.tile_river[b, c_t])
            self.dist[b, c_new] = self.pair_dist[c_t].to(self.dist.dtype)
            self.loyalty[b, c_new] = 100.0
            self._init_center_live(b, c_new, c_t)
            # TS captureRivalCity tail (AUDIT C-11): conquest plunders +40
            # gold, and the war ends if it was the rival's last city. The
            # raze path (`continue` above) mirrors TS's early return —
            # no gold, war state untouched.
            if plunder:  # P5/S6: loyalty defections transfer without the +40
                self.treasury[b] += 40.0
            if not bool(self.rc_alive[b, r].any()):
                self.r_atwar[b, r] = False
        self._eff_version += 1

    def _capture_city_state(self, rows: torch.Tensor, cs_of: torch.Tensor) -> None:
        """V-CS: captureCityState — the city-state joins the PLAYER's empire.
        Territory within radius 2 whose csId matches transfers (owner set
        only where unclaimed — TS `if (t.cityId === -1)`), pop lands at
        x0.75 (min 1), the new city starts at half HP with zero boxes and
        zero tilesAcquired. AUDIT A-16: the V-W2 slot cap applies here too —
        a FULL empire (>= 6 live cities) RAZES the city-state instead of
        annexing it (captureRivalCity's exact rule, now shared by TS; the
        old TS quirk pushed past 6 while the fixed GPU slots could not —
        that documented skip-at-full-pool divergence is gone)."""
        for i in range(len(rows)):
            b = int(rows[i]); s = int(cs_of[rows[i]])
            c_t = int(self.cs_center[b, s])
            pop = max(1, (int(self.cs_pop[b, s]) * 3) // 4)
            self.cs_alive[b, s] = False
            # A-12b: rival CS routes die with the city-state (TS
            # captureCityState prunes rv.tradeRoutes; dest encoding -(2+s)).
            dead_cs = self.r_routes[b, :, :, 1] == -(2 + s)  # [R, K]
            self.r_routes[b] = torch.where(dead_cs.unsqueeze(2), torch.full_like(self.r_routes[b], -1), self.r_routes[b])
            ring = (self.pair_dist[c_t] <= 2) & (self.cs_at[b] == s)
            self.cs_at[b] = torch.where(ring, torch.full_like(self.cs_at[b], -1), self.cs_at[b])
            # AUDIT A-16: raze at TS's count (state.cities.length >= 6) —
            # the CS dies and its ring frees, but NO city is founded (TS
            # early-returns before nextCityId++).
            if int(self.alive[b].sum()) >= 6:
                continue
            # P5/S2: append at the founding HIGH-WATER mark like TS (trace
            # column order — see _capture_rival_city).
            c_new = int(self.founded_n[b])
            if c_new >= self.C:
                free = (~self.alive[b]).nonzero(as_tuple=True)[0]
                if len(free) == 0:
                    continue  # no slot: the CS still dies (see docstring)
                c_new = int(free[0])
            else:
                self.founded_n[b] += 1
            self.alive[b, c_new] = True
            self.city_seq[b, c_new] = int(self.city_seq_next[b])
            self.city_seq_next[b] += 1
            self.is_cap[b, c_new] = False  # P7: captured cities are never capitals (TS isCapital: false)
            self.site[b, c_new] = c_t
            self.center_at[b, c_t] = c_new
            self.owner[b] = torch.where(ring & (self.owner[b] < 0), torch.full_like(self.owner[b], c_new), self.owner[b])
            self.owner[b, c_t] = c_new
            self.pop[b, c_new] = pop
            self.food_box[b, c_new] = 0.0
            self.culture_box[b, c_new] = 0.0
            self.tiles_acquired[b, c_new] = 0
            self.city_hp[b, c_new] = self.rules.combat.get("cityMaxHp", 200) // 2
            self.current[b, c_new] = -1
            # P5/S2: full slot hygiene — a reused slot (post-P7, or the
            # degenerate hole fallback) must not leak the dead city's queue
            # progress/cost into the fresh city (TS starts queue = []).
            self.progress[b, c_new] = 0.0
            self.cur_cost[b, c_new] = 0.0
            self.q_dtile[b, c_new] = -1
            self.warrior_trained[b, c_new] = False
            self.buildings[b, c_new] = False
            self.outer_hp[b, c_new] = 0  # AUDIT B-1: captured city starts with no walls (buildings wiped)
            self.water_housing[b, c_new] = float(self.tile_wh[b, c_t])
            self.river_center[b, c_new] = bool(self.tile_river[b, c_t])
            self.dist[b, c_new] = self.pair_dist[c_t].to(self.dist.dtype)
            self.loyalty[b, c_new] = 100.0
            self._init_center_live(b, c_new, c_t)
        self._eff_version += 1

    def _capture_city_state_rival(self, rows: torch.Tensor, cs_of: torch.Tensor, v: int) -> None:
        """A-12b: captureCityStateForRival — the CS joins the CONQUERING
        rival's empire (join-the-suzerain's-war): pop x0.75 floor 1, the
        ring-2 csId territory re-tags to the new rc (A-17 registry), envoys
        die with the CS (cs_alive gates every consumer), the maxCities raze
        rule, routes pruned with the endpoint. Append bookkeeping mirrors
        _transfer_city_to_rival: last-alive+1 slot (rc slot order == TS
        array order), full slot hygiene, id from r_next_city_id."""
        for i in range(len(rows)):
            b = int(rows[i]); s = int(cs_of[rows[i]])
            r = int(self.v_civ[b, v])
            c_t = int(self.cs_center[b, s])
            pop = max(1, (int(self.cs_pop[b, s]) * 3) // 4)
            self.cs_alive[b, s] = False
            # routes die with the city-state (every civ; dest encoded -(2+s))
            dead_cs = self.r_routes[b, :, :, 1] == -(2 + s)
            self.r_routes[b] = torch.where(dead_cs.unsqueeze(2), torch.full_like(self.r_routes[b], -1), self.r_routes[b])
            ring = (self.pair_dist[c_t] <= 2) & (self.cs_at[b] == s)
            self.cs_at[b] = torch.where(ring, torch.full_like(self.cs_at[b], -1), self.cs_at[b])
            if int(self.rc_alive[b, r].sum()) >= int(self.rules.rivals.get("maxCities", 6)):
                continue  # razed: the CS dies, its ring frees, NO city (TS early-return)
            alive_w = self.rc_alive[b, r].nonzero(as_tuple=True)[0]
            slot = int(alive_w.max()) + 1 if len(alive_w) else 0
            assert slot < self.RC, "rival city slots exhausted — raise RC (compaction already ran; this is true living capacity)"
            new_id = int(self.r_next_city_id[b, r])
            self.rival_at[b] = torch.where(ring, torch.full_like(self.rival_at[b], r), self.rival_at[b])
            self.rc_tile_id[b] = torch.where(ring, torch.full_like(self.rc_tile_id[b], new_id), self.rc_tile_id[b])
            self.rc_alive[b, r, slot] = True
            self.rc_is_cap[b, r, slot] = False
            self.rc_center[b, r, slot] = c_t
            self.rc_pop[b, r, slot] = pop
            self.rc_growth[b, r, slot] = 0
            self.rc_cbox[b, r, slot] = 0
            self.rc_loyalty[b, r, slot] = 100.0
            self.rc_acquired[b, r, slot] = 0  # TS tilesAcquired: 0
            self.rc_hp[b, r, slot] = round(self.rules.rivals.get("cityMaxHp", 200) / 2)
            self.rc_id[b, r, slot] = new_id
            self.rc_current[b, r, slot] = -1
            self.rc_progress[b, r, slot] = 0.0
            self.rc_cost[b, r, slot] = 0.0
            self.rc_qtile[b, r, slot] = -1
            self.rc_dist_tile[b, r, slot, :] = -1
            self.rc_wonder[b, r, slot, :] = -1
            self.rc_bldg[b, r, slot, :] = False
            self.r_next_city_id[b, r] += 1
            self.rvcity_at[b, c_t] = r
        self._eff_version += 1

    def _init_center_live(self, b: int, c_new: int, c_t: int) -> None:
        """P5/S1 gate-catch (seed 9131 rng 2026006110 t196): a CAPTURED
        city's center yields must come from the LIVE tile — TS
        tileYieldsForCenter reads it fresh (raw tile yields, strip-adjusted,
        min-clamped food/production). Settle sites get precomputed site_cy;
        captured centers were never fixture sites, so their slots held
        zeros (or a flipped-away city's stale values)."""
        strip_c = float(self.feat_stripped[b, c_t])
        cy = (self.tile_yields[b, c_t].to(self.dtype) - self.feat_yields[b, c_t].to(self.dtype) * strip_c).clone()
        self.center_raw_food[b, c_new] = float(cy[0])  # pre-clamp (fertility/drought redo the clamp live)
        cy[0] = max(float(cy[0]), float(self.rules.center_min_food))
        cy[1] = max(float(cy[1]), float(self.rules.center_min_production))
        self.center_yields[b, c_new] = cy
        self.base_maintenance[b, c_new] = 0.0  # City Center 0 upkeep; no Palace, no buildings
        nb_c = self.neigh[c_t]
        self.coastal[b, c_new] = bool(self.coastal_water[b, nb_c.clamp(min=0)][nb_c >= 0].any())

    def _player_attack_rival_city(self, att: torch.Tensor, tgt: torch.Tensor, p: int) -> None:
        """V-W2: a PLAYER melee unit besieging a rival city — mirrors
        attackRivalCity for attacker.owner === 'player': defender-first
        rolls with the real defense formula, attacker consumed, CAPTURE at
        0 HP (never the barb sack)."""
        if not bool(att.any()):
            return
        ttc = tgt.clamp(min=0)
        civ = self.rvcity_at.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0)
        slot = torch.zeros_like(civ)
        for j in range(self.RC):
            hit = self.rc_center[torch.arange(self.B, device=self.device), civ, j] == ttc
            hit = hit & self.rc_alive[torch.arange(self.B, device=self.device), civ, j]
            slot = torch.where(att & hit, torch.full_like(slot, j), slot)
        bidx = torch.arange(self.B, device=self.device)
        # P4/D-22 (rivalCityDefense): max(15, THAT civ's strongest melee
        # ever) + 5 for its own military garrisoning the center.
        best_r = self.r_best_melee[bidx, civ]
        gslot = self.rv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        gar = ((gslot >= 0) & (self.v_civ[bidx, gslot.clamp(min=0)] == civ)).long()
        def_cs = torch.maximum(best_r, torch.full_like(best_r, 15)) + gar * 5
        atk_cs = self._p_combat[self.p_type[:, p]]
        atk_e = atk_cs - self._wound(self.p_hp[:, p]) - 5.0 * self._river_cross(self.p_tile[:, p], tgt)  # B-29 wound + river (city not a unit)
        d_city = self._damage_roll(att, atk_e - def_cs, k="rcty", tile=tgt)
        d_atk = self._damage_roll(att, def_cs - atk_e, k="rctyc", tile=tgt)
        rows = att.nonzero(as_tuple=True)[0]
        # AUDIT B-1: the outer wall pool soaks the hit first, spillover to HP.
        outer = self.rc_outer_hp[rows, civ[rows], slot[rows]]
        absorbed = torch.minimum(outer, d_city[rows])
        self.rc_outer_hp[rows, civ[rows], slot[rows]] = outer - absorbed
        self.rc_hp[rows, civ[rows], slot[rows]] -= d_city[rows] - absorbed
        self.p_hp[:, p] = torch.where(att, self.p_hp[:, p] - d_atk, self.p_hp[:, p])
        died = att & (self.p_hp[:, p] <= 0)
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            here_d = self.p_tile[dr, p]
            self.pmil_at[dr, here_d] = -1
            self.p_alive[dr, p] = False
        # P5/S2 gate-catch (seed 9001 t44): TS captureRivalCity fires even
        # when the attacker DIED to the counter (killUnit precedes the
        # city-hp check) — a scout can trade itself for the city. The old
        # `& ~died` denied mutual-death captures.
        cap = att
        cap_rows = cap.nonzero(as_tuple=True)[0]
        cap_rows = cap_rows[self.rc_hp[cap_rows, civ[cap_rows], slot[cap_rows]] <= 0]
        if len(cap_rows) > 0:
            self._capture_rival_city(cap_rows, civ[cap_rows], slot[cap_rows], ttc[cap_rows])

    def _strip_feature_at(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """V-H1 chop: remove the removable feature physically — mark
        feat_stripped and withdraw the adjacency it lent to neighbours
        (the founding strip does the same inline, entangled with its
        tile-grab loop — keep the two twins in sync).
        IDEMPOTENT (P2): TS `tile.feature = null` on an already-bare tile is
        a no-op, but the adjacency withdrawal below is CUMULATIVE — stripping
        an already-stripped tile (queueDistrict paving a chopped tile) would
        double-subtract the lent adjacency (caught: seed 9040 t132, an
        adjacent Holy Site's faith dropped 2→1 in the GPU only)."""
        fresh = ~self.feat_stripped[rows, tiles]
        if not bool(fresh.any()):
            return
        rows, tiles = rows[fresh], tiles[fresh]
        self.feat_stripped[rows, tiles] = True
        self.tdef[rows, tiles] = self.hills[rows, tiles].long() * 3  # GS: chopped feature no longer defends (terrainDefense reads live; mirror the founding strip)
        self.tmove[rows, tiles] = self.hills[rows, tiles].long() * 3  # B-28: the stripped feature is no longer slow either (hills-only movement)
        # TS builderRemoveFeature: chopping WOODS removes a LUMBER_MILL (it requires
        # woods, Civ 6) — else a stale mill keeps +production on a now-bare tile.
        if self.LUMBER >= 0:
            lm = self.improvement[rows, tiles] == self.LUMBER
            if bool(lm.any()):
                self.improvement[rows[lm], tiles[lm]] = -1
            self.lumber_ok[rows, tiles] = False  # no WOODS -> no LUMBER_MILL buildable (TS gates on live tile.feature==='WOODS')
        # chopping the feature ENABLES farm/mine on the now-bare terrain (TS's
        # live gate) — switch the static masks to their post-chop variants.
        self.farm_flat[rows, tiles] = self._fa_f_c[rows, tiles]
        self.farm_hill[rows, tiles] = self._fa_h_c[rows, tiles]
        self.mine_ok[rows, tiles] = self._mi_c[rows, tiles]
        # P4: withdraw BOTH feature classes — TS strip sites that reach this
        # function null ANY feature (P2 queueDistrict paves a REEF too); a
        # tile has one feature, so exactly one of the two planes is nonzero
        # (chops can only target removable features — nfadj is 0 there).
        contrib = self._feat_adj[rows, tiles] + self._nfeat_adj[rows, tiles]
        nb = self.neigh[tiles]
        for d in range(6):
            n_d = nb[:, d]
            on_map = n_d >= 0
            if bool(on_map.any()):
                om = on_map.nonzero(as_tuple=True)[0]
                self.d_static_adj[rows[om], n_d[om], :] -= contrib[om]
        self._eff_version += 1

    def _withdraw_sea_adj(self, rows: torch.Tensor, tiles: torch.Tensor) -> None:
        """C-6 latent, the A-4 hunt's second catch (rng 2026006088 t189):
        SEA_RESOURCE adjacency is baked into d_static_adj, but TS reads the
        neighbor's resource LIVE (isWater(n) && n.resource !== null) — so
        paving over a bonus SEA resource must WITHDRAW the adjacency it
        lent (a Harbor next to the stripped fish kept +1 gold and +1
        Shipyard production GPU-side only). The _strip_feature_at twin;
        callers pass only FRESH strips (idempotence — the P4-F2 lesson)."""
        if not len(rows):
            return
        wet = self.water[rows, tiles]
        if not bool(wet.any()):
            return
        rows, tiles = rows[wet], tiles[wet]
        contrib = self._dyn_searesource.view(1, -1).expand(len(rows), -1)
        nb = self.neigh[tiles]
        for d in range(6):
            n_d = nb[:, d]
            on_map = n_d >= 0
            if bool(on_map.any()):
                om = on_map.nonzero(as_tuple=True)[0]
                self.d_static_adj[rows[om], n_d[om], :] -= contrib[om]
        self._eff_version += 1

    def _apply_unit_actions(self, actions: torch.Tensor) -> None:
        """Execute unit orders in slot (= spawn) order, exactly like a player
        issuing them one by one before ending the turn. Combat draws from
        the shared RNG, so this order is part of the parity contract."""
        cb = self.rules.combat
        p_high = int(self.p_next.max().item())
        # D-14 (the D-4 live-slot pattern): slots alive in SOME game at loop
        # top, ascending. Nothing spawns player units in here and deaths only
        # shrink the set, so this is a superset of every slot the old
        # per-slot any() check would run — a slot that dies in ALL games
        # mid-loop no-ops through the body (every mutation and every
        # _damage_roll sits under a mask ⊆ alive with its own any() guard).
        # G2: additionally require a non-HOLD (12), valid (>=0) order in some
        # game. A slot HOLD/invalid in EVERY game runs a fully masked no-op:
        # every mutation mask (civk/siege/att/r_att/r_civ/cs_hit/r_sieg/r_cs/
        # ok_c/bld/mv/ok) carries (a in 6..11)/(a==16)/(a in 13..15)/(a in 0..5)
        # and is all-False; the single unconditional write (p_acted |= att|r_att)
        # is |False; and every _damage_roll sits inside an if-any block keyed on
        # one of those masks, so a HOLD unit draws no RNG — the skip is exact and
        # draw-count-neutral.
        if p_high:
            live_any = self.p_alive[:, :p_high].any(dim=0)
            ord_any = ((actions[:, :p_high] != 12) & (actions[:, :p_high] >= 0)).any(dim=0)
            p_live = (live_any & ord_any).nonzero(as_tuple=True)[0].tolist()
        else:
            p_live = []
        for p in p_live:
            a = actions[:, p].to(torch.long)
            alive = self.p_alive[:, p]
            here = self.p_tile[:, p]
            nb = self.neigh[here.clamp(min=0)]  # [B, 6]

            # --- melee attack (6..11): a barbarian or an at-war rival unit -----
            dirs = (a - 6).clamp(min=0, max=5)
            tgt = nb.gather(1, dirs.unsqueeze(1)).squeeze(1)
            tc = tgt.clamp(min=0)
            bslot = self.barb_at.gather(1, tc.unsqueeze(1)).squeeze(1)
            vslot = self.rv_at.gather(1, tc.unsqueeze(1)).squeeze(1)
            v_civ = self.v_civ.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(max=max(self.R - 1, 0))
            v_ok = (vslot >= 0) & self.r_atwar.gather(1, v_civ.unsqueeze(1)).squeeze(1)
            rc_civ_t = self.rvcity_at.gather(1, tc.unsqueeze(1)).squeeze(1)
            rc_ok = (rc_civ_t >= 0) & self.r_atwar.gather(1, rc_civ_t.clamp(min=0).clamp(max=max(self.R - 1, 0)).unsqueeze(1)).squeeze(1)
            rvc_slot_t = self.rvciv_at.gather(1, tc.unsqueeze(1)).squeeze(1)
            rvc_civ_t = self.v_civ.gather(1, rvc_slot_t.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(max=max(self.R - 1, 0))
            rvc_ok = (rvc_slot_t >= 0) & self.r_atwar.gather(1, rvc_civ_t.unsqueeze(1)).squeeze(1)
            if self._rl_ranged_active:
                rngd = self._p_rng_str[self.p_type[:, p]] > 0
            else:
                rngd = torch.zeros_like(alive)
            # TS meleeAttack: units ON the tile take the hit FIRST. A lone
            # hostile CIVILIAN is simply killed, ROLL-FREE ("Civ 6 captures;
            # we don't model capture"), then the attacker advances if the
            # tile frees up — including onto an at-war rival CITY CENTER:
            # the city is NOT besieged through its occupant. Caught by P2's
            # reshuffle (seed 9053 t204): a rival builder stood on an at-war
            # rival center — TS killed it roll-free and advanced, the GPU
            # besieged the city (2 extra draws + the city's counter).
            civk = alive & (a >= 6) & (a < 12) & (tgt >= 0) & (bslot < 0) & ~v_ok & rvc_ok & (self._p_combat[self.p_type[:, p]] > 0) & ~rngd
            if bool(civk.any()):
                kr = civk.nonzero(as_tuple=True)[0]
                ks = rvc_slot_t[kr]
                self.v_alive[kr, ks] = False
                self.rvciv_at[kr, tc[kr]] = -1
                self.p_acted[:, p] = self.p_acted[:, p] | civk  # P4/D-2: TS meleeAttack spends MP
                adv = civk & ~self._blocked_for(tgt.unsqueeze(1), "pmil").squeeze(1)
                if bool(adv.any()):
                    vr = adv.nonzero(as_tuple=True)[0]
                    self.pmil_at[vr, here[vr]] = -1
                    self.p_tile[vr, p] = tgt[vr]
                    self.pmil_at[vr, tgt[vr]] = p
                    self._clear_camp_at(adv, tgt)
            siege = alive & (a >= 6) & (a < 12) & (tgt >= 0) & (bslot < 0) & ~v_ok & ~rvc_ok & rc_ok & (self._p_combat[self.p_type[:, p]] > 0) & (self._p_rng_str[self.p_type[:, p]] == 0)
            if bool(siege.any()):
                self._player_attack_rival_city(siege, tgt, p)  # V-W2
                self.p_acted[:, p] = self.p_acted[:, p] | siege  # P4/D-2
            att = alive & (a >= 6) & (a < 12) & (tgt >= 0) & ((bslot >= 0) | v_ok) & (self._p_combat[self.p_type[:, p]] > 0)
            # V-R: ranged units strike instead of meleeing (rangedAttack —
            # one roll, no retaliation, no advance). The mask above is
            # unchanged: legality is the same adjacent-hostile condition.
            r_att = att & rngd
            att = att & ~rngd
            if bool(att.any()):
                is_b = bslot >= 0
                atk_cs = self._p_combat[self.p_type[:, p]]
                b_cs = self._unit_combat[self.u_type.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)]
                v_cs = self._p_combat[self.v_type.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)]
                b_fy = self.u_fortify.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                v_fy = self.v_fortify.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                def_cs = torch.where(is_b, b_cs, v_cs) + self.tdef.gather(1, tc.unsqueeze(1)).squeeze(1) + torch.where(is_b, b_fy, v_fy) * 3  # B-5
                # B-29: attacker AND defender fight at HP-reduced strength.
                b_hp = self.u_hp.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                v_hpd = self.v_hp.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                atk_e = atk_cs - self._wound(self.p_hp[:, p]) - 5.0 * self._river_cross(here, tgt)  # B-29 river
                def_e = def_cs - self._wound(torch.where(is_b, b_hp, v_hpd))
                # B-7: flanking helps the player attacker, support helps the
                # defender (barb or at-war rival). Applied once so both paired
                # rolls see the same adjusted CS.
                _dside = torch.where(is_b, torch.ones_like(v_civ), torch.full_like(v_civ, 2))
                _fl, _sp = self._flank_support(tgt, _dside, v_civ, here)
                atk_e = atk_e + FLANKING_CS * _fl
                def_e = def_e + SUPPORT_CS * _sp
                d_def = self._damage_roll(att, atk_e - def_e, k="mel", tile=tgt)
                d_atk = self._damage_roll(att, def_e - atk_e, k="melc", tile=tgt)
                rows = att.nonzero(as_tuple=True)[0]
                def_dead = torch.zeros_like(att)
                for grp, at_map, hp_t, alive_t, slot_t in (
                    (is_b, self.barb_at, self.u_hp, self.u_alive, bslot),
                    (~is_b, self.rv_at, self.v_hp, self.v_alive, vslot),
                ):
                    g = rows[grp[rows]]
                    if len(g) == 0:
                        continue
                    ds = slot_t[g]
                    hp_t[g, ds] -= d_def[g]
                    dead = hp_t[g, ds] <= 0
                    def_dead[g[dead]] = True
                    at_map[g[dead], tc[g[dead]]] = -1
                    alive_t[g[dead], ds[dead]] = False
                self.p_hp[:, p] = torch.where(att, self.p_hp[:, p] - d_atk, self.p_hp[:, p])
                atk_dead = att & (self.p_hp[:, p] <= 0)
                both = def_dead & atk_dead
                self.p_hp[:, p] = torch.where(both, torch.ones_like(self.p_hp[:, p]), self.p_hp[:, p])  # victor survives
                atk_dead = atk_dead & ~def_dead
                if bool(atk_dead.any()):
                    ar = atk_dead.nonzero(as_tuple=True)[0]
                    self.pmil_at[ar, here[ar]] = -1
                    self.p_alive[:, p] = self.p_alive[:, p] & ~atk_dead
                # Advance into the freed tile (and clear any camp there).
                adv = def_dead & ~atk_dead & ~self._blocked_for(tgt.unsqueeze(1), "pmil").squeeze(1)
                if bool(adv.any()):
                    vr = adv.nonzero(as_tuple=True)[0]
                    self.pmil_at[vr, here[vr]] = -1
                    self.p_tile[vr, p] = tgt[vr]
                    self.pmil_at[vr, tgt[vr]] = p
                    self._clear_camp_at(adv, tgt)

            # --- ranged strike (V-R, same codes 6..11 for ranged units):
            # mirrors rangedAttack — ONE damage roll against the defender
            # (combat + terrain defense), no retaliation, no advance, no
            # camp clear; the attacker never moves or takes damage.
            if bool(r_att.any()):
                is_b = bslot >= 0
                atk_rs = self._p_rng_str[self.p_type[:, p]]
                b_cs = self._unit_combat[self.u_type.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)]
                v_cs = self._p_combat[self.v_type.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)]
                b_fy = self.u_fortify.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                v_fy = self.v_fortify.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                def_cs = torch.where(is_b, b_cs, v_cs) + self.tdef.gather(1, tc.unsqueeze(1)).squeeze(1) + torch.where(is_b, b_fy, v_fy) * 3  # B-5
                # B-29: ranged attacker + defender wounded (no river for ranged).
                b_hp = self.u_hp.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                v_hpd = self.v_hp.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                atk_e = atk_rs - self._wound(self.p_hp[:, p])
                def_e = def_cs - self._wound(torch.where(is_b, b_hp, v_hpd))
                # B-7 support (no flanking: a ranged attacker takes no retaliation).
                _dside = torch.where(is_b, torch.ones_like(v_civ), torch.full_like(v_civ, 2))
                _, _sp = self._flank_support(tgt, _dside, v_civ, torch.full_like(tgt, -1))
                def_e = def_e + SUPPORT_CS * _sp
                d_def = self._damage_roll(r_att, atk_e - def_e, k="rng", tile=tgt)
                rows = r_att.nonzero(as_tuple=True)[0]
                for grp, at_map, hp_t, alive_t, slot_t in (
                    (is_b, self.barb_at, self.u_hp, self.u_alive, bslot),
                    (~is_b, self.rv_at, self.v_hp, self.v_alive, vslot),
                ):
                    g = rows[grp[rows]]
                    if len(g) == 0:
                        continue
                    ds = slot_t[g]
                    hp_t[g, ds] -= d_def[g]
                    dead = hp_t[g, ds] <= 0
                    at_map[g[dead], tc[g[dead]]] = -1
                    alive_t[g[dead], ds[dead]] = False
            # P4/D-2: any fight spends the attacker's MP (att|r_att = the
            # original validated attack set — both branches always execute)
            self.p_acted[:, p] = self.p_acted[:, p] | att | r_att

            # TS rangedAttack with no military defender falls back to
            # enemies[0] — the CIVILIAN takes a damage ROLL (combat 0 +
            # terrain defense), dying at 0; no retaliation, no advance.
            # (P4/D-2 hunt, seed 9209 t136: two archers ground a lone rival
            # builder down; the GPU no-oped — 2 draws short.)
            r_civ = alive & (a >= 6) & (a < 12) & (tgt >= 0) & (bslot < 0) & ~v_ok & rvc_ok & (self._p_combat[self.p_type[:, p]] > 0) & rngd
            if bool(r_civ.any()):
                atk_rs = self._p_rng_str[self.p_type[:, p]]
                def_cs = self.tdef.gather(1, tc.unsqueeze(1)).squeeze(1).to(atk_rs.dtype)  # civilian combat 0 + terrain
                # B-29: attacker + the lone rival civilian defender both wounded.
                civ_hp = self.v_hp.gather(1, rvc_slot_t.clamp(min=0).unsqueeze(1)).squeeze(1)
                atk_e = atk_rs - self._wound(self.p_hp[:, p])
                def_e = def_cs - self._wound(civ_hp)
                # B-7 support: the lone rival civilian is aided by adjacent
                # same-civ rival military (no flanking on a ranged strike).
                _, _sp = self._flank_support(tgt, torch.full_like(tgt, 2), rvc_civ_t, torch.full_like(tgt, -1))
                def_e = def_e + SUPPORT_CS * _sp
                d_def = self._damage_roll(r_civ, atk_e - def_e, k="rng", tile=tgt)
                rows = r_civ.nonzero(as_tuple=True)[0]
                ks = rvc_slot_t[rows]
                self.v_hp[rows, ks] -= d_def[rows]
                dead = self.v_hp[rows, ks] <= 0
                self.v_alive[rows[dead], ks[dead]] = False
                self.rvciv_at[rows[dead], tc[rows[dead]]] = -1
                self.p_acted[:, p] = self.p_acted[:, p] | r_civ

            # --- V-CS: melee vs a CITY-STATE CENTER — meleeAttack's csTarget
            # fallback: fires only when no hostile unit holds the tile and it
            # is not a rival city (TS branch precedence). defCS = 15 + pop
            # (+6 militaristic), CS-damage roll then the counter (that draw
            # order), attacker consumed, NO advance; capture at 0 HP (the
            # city-state joins the empire). Ranged bombardment has its own
            # branches below (P4/D-23): one roll, floor 1 HP, no capture.
            cs_s = self.cs_at.gather(1, tc.unsqueeze(1)).squeeze(1)
            cs_sc = cs_s.clamp(min=0)
            cs_hit = (
                alive & (a >= 6) & (a < 12) & (tgt >= 0)
                & (bslot < 0) & ~v_ok & ~rvc_ok & (rc_civ_t < 0)
                & (cs_s >= 0)
                & (self.cs_center.gather(1, cs_sc.unsqueeze(1)).squeeze(1) == tgt)
                & self.cs_alive.gather(1, cs_sc.unsqueeze(1)).squeeze(1)
                & (self._p_combat[self.p_type[:, p]] > 0) & ~rngd
            )
            if bool(cs_hit.any()):
                atk_cs = self._p_combat[self.p_type[:, p]]
                mil_idx = int(self.rules.cs.get("militaristicIdx", -1))
                def_cs = (
                    15 + self.cs_pop.gather(1, cs_sc.unsqueeze(1)).squeeze(1)
                    + (self.cs_type.gather(1, cs_sc.unsqueeze(1)).squeeze(1) == mil_idx).long() * 6
                )
                atk_e = atk_cs - self._wound(self.p_hp[:, p]) - 5.0 * self._river_cross(here, tgt)  # B-29 wound + river (CS center not a unit)
                d_cs = self._damage_roll(cs_hit, atk_e - def_cs, k="csty", tile=tgt)
                d_atk = self._damage_roll(cs_hit, def_cs - atk_e, k="cstyc", tile=tgt)
                rows = cs_hit.nonzero(as_tuple=True)[0]
                self.cs_hp[rows, cs_sc[rows]] -= d_cs[rows]
                self.p_hp[:, p] = torch.where(cs_hit, self.p_hp[:, p] - d_atk, self.p_hp[:, p])
                atk_dead = cs_hit & (self.p_hp[:, p] <= 0)
                if bool(atk_dead.any()):
                    ar = atk_dead.nonzero(as_tuple=True)[0]
                    self.pmil_at[ar, here[ar]] = -1
                    self.p_alive[:, p] = self.p_alive[:, p] & ~atk_dead
                cap = cs_hit & (self.cs_hp.gather(1, cs_sc.unsqueeze(1)).squeeze(1) <= 0)
                if bool(cap.any()):
                    self._capture_city_state(cap.nonzero(as_tuple=True)[0], cs_sc)
                self.p_acted[:, p] = self.p_acted[:, p] | cs_hit  # P4/D-2

            # --- P4/D-23: ranged BOMBARDMENT of cities (rangedAttack's city
            # fallback) — one roll against the D-22 defense, no retaliation,
            # HP floors at 1 (ranged never captures; melee finishes).
            r_sieg = alive & (a >= 6) & (a < 12) & (tgt >= 0) & (bslot < 0) & ~v_ok & ~rvc_ok & rc_ok & (self._p_combat[self.p_type[:, p]] > 0) & rngd
            if bool(r_sieg.any()):
                bidx2 = torch.arange(self.B, device=self.device)
                civ2 = rc_civ_t.clamp(min=0)
                slot2 = torch.zeros_like(civ2)
                for j2 in range(self.RC):
                    hit2 = (self.rc_center[bidx2, civ2, j2] == tc) & self.rc_alive[bidx2, civ2, j2]
                    slot2 = torch.where(r_sieg & hit2, torch.full_like(slot2, j2), slot2)
                best_r2 = self.r_best_melee[bidx2, civ2]
                gslot2 = self.rv_at.gather(1, tc.unsqueeze(1)).squeeze(1)
                gar2 = ((gslot2 >= 0) & (self.v_civ[bidx2, gslot2.clamp(min=0)] == civ2)).long()
                def_cs2 = torch.maximum(best_r2, torch.full_like(best_r2, 15)) + gar2 * 5
                atk_e2 = self._p_rng_str[self.p_type[:, p]] - self._wound(self.p_hp[:, p])  # B-29 (city not a unit)
                d_city2 = self._damage_roll(r_sieg, atk_e2 - def_cs2, k="rngrc", tile=tgt)
                rows2 = r_sieg.nonzero(as_tuple=True)[0]
                self.rc_hp[rows2, civ2[rows2], slot2[rows2]] = torch.maximum(
                    self.rc_hp[rows2, civ2[rows2], slot2[rows2]] - d_city2[rows2],
                    torch.ones_like(d_city2[rows2]),
                )
                self.p_acted[:, p] = self.p_acted[:, p] | r_sieg
            r_cs = (
                alive & (a >= 6) & (a < 12) & (tgt >= 0)
                & (bslot < 0) & ~v_ok & ~rvc_ok & (rc_civ_t < 0)
                & (cs_s >= 0)
                & (self.cs_center.gather(1, cs_sc.unsqueeze(1)).squeeze(1) == tgt)
                & self.cs_alive.gather(1, cs_sc.unsqueeze(1)).squeeze(1)
                & (self._p_combat[self.p_type[:, p]] > 0) & rngd
            )
            if bool(r_cs.any()):
                mil_idx2 = int(self.rules.cs.get("militaristicIdx", -1))
                def_cs3 = (
                    15 + self.cs_pop.gather(1, cs_sc.unsqueeze(1)).squeeze(1)
                    + (self.cs_type.gather(1, cs_sc.unsqueeze(1)).squeeze(1) == mil_idx2).long() * 6
                )
                atk_e3 = self._p_rng_str[self.p_type[:, p]] - self._wound(self.p_hp[:, p])  # B-29 (CS center not a unit)
                d_cs3 = self._damage_roll(r_cs, atk_e3 - def_cs3, k="rngcs", tile=tgt)
                rows3 = r_cs.nonzero(as_tuple=True)[0]
                self.cs_hp[rows3, cs_sc[rows3]] = torch.maximum(
                    self.cs_hp[rows3, cs_sc[rows3]] - d_cs3[rows3],
                    torch.ones_like(d_cs3[rows3]),
                )
                self.p_acted[:, p] = self.p_acted[:, p] | r_cs

            # --- build FARM/MINE/LUMBER_MILL (13/14/15): a builder on a tile
            # where that improvement is valid. No RNG, re-validated at
            # execution (an earlier unit could have taken the tile / spent
            # state), so an invalid build is a no-op — mirroring the replay's
            # soft-failing builderImprove. Each row's action is one value, so
            # at most one improvement builds per unit (charges spend once).
            # --- V-H1 chop (16): a builder on a removable-feature tile whose
            # removal tech is in — mirrors builderRemoveFeature exactly:
            # canRemoveFeature has NO ownership test (the grant checks the
            # owner itself), the LUMBER_MILL dies with its WOODS, the lump
            # goes food -> foodBox / production -> head progress (bank when
            # idle), and the charge spends (disband at 0).
            if self._builder_idx >= 0:
                hc0 = here.clamp(min=0)
                ftr_t = self.tile_ftr.gather(1, hc0.unsqueeze(1)).squeeze(1)
                ftu_t = self.tile_ftu.gather(1, hc0.unsqueeze(1)).squeeze(1)
                unlocked = (ftu_t >= 0) & self.techs.gather(1, ftu_t.clamp(min=0).unsqueeze(1)).squeeze(1)
                ok_c = (
                    (a == 16)
                    & self.p_alive[:, p]
                    & (self.p_type[:, p] == self._builder_idx)
                    & (self.p_charges[:, p] > 0)
                    & (ftr_t > 0)
                    & unlocked
                    & ~self.feat_stripped.gather(1, hc0.unsqueeze(1)).squeeze(1)
                )
                if bool(ok_c.any()):
                    rows_c = ok_c.nonzero(as_tuple=True)[0]
                    tiles_c = hc0[rows_c]
                    self.p_acted[:, p] = self.p_acted[:, p] | ok_c  # P4/D-2: builderRemoveFeature spends MP
                    self._strip_feature_at(rows_c, tiles_c)
                    if self.LUMBER >= 0:
                        was_l = self.improvement[rows_c, tiles_c] == self.LUMBER
                        self.improvement[rows_c, tiles_c] = torch.where(was_l, torch.full_like(self.improvement[rows_c, tiles_c], -1), self.improvement[rows_c, tiles_c])
                    done = (self.techs.sum(dim=1) + self.civics.sum(dim=1)).to(self.dtype)
                    amount = js_round(20.0 + 2.5 * done)
                    own_c = self.owner[rows_c, tiles_c]
                    for i2 in range(len(rows_c)):
                        b2, c2 = int(rows_c[i2]), int(own_c[i2])
                        if c2 < 0:
                            continue  # outside borders: chopped, no lump
                        amt = float(amount[b2])
                        if int(ftr_t[rows_c[i2]]) == 1:
                            self.food_box[b2, c2] += amt
                        elif int(self.current[b2, c2]) >= 0:
                            self.progress[b2, c2] += amt
                        else:
                            self.prod_bank[b2, c2] += amt
                    self.p_charges[:, p] = torch.where(ok_c, self.p_charges[:, p] - 1, self.p_charges[:, p])
                    spent = ok_c & (self.p_charges[:, p] <= 0)
                    if bool(spent.any()):
                        dr = spent.nonzero(as_tuple=True)[0]
                        self.pciv_at[dr, self.p_tile[dr, p]] = -1
                        self.p_alive[dr, p] = False

            if self.improvements_on and self._builder_idx >= 0:
                hc = here.clamp(min=0).unsqueeze(1)
                if self._hillfarms_civic >= 0:
                    civ_done = self.civics[:, self._hillfarms_civic]
                else:
                    civ_done = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                mining = self.techs[:, self._mine_unlock_tech] if self._mine_unlock_tech >= 0 else torch.zeros(self.B, dtype=torch.bool, device=self.device)
                constr = self.techs[:, self._lumber_unlock_tech] if self._lumber_unlock_tech >= 0 else torch.zeros(self.B, dtype=torch.bool, device=self.device)
                farmable = self.farm_flat.gather(1, hc).squeeze(1) | (self.farm_hill.gather(1, hc).squeeze(1) & civ_done)
                mineable = self.mine_ok.gather(1, hc).squeeze(1) & mining
                woodsy = self.lumber_ok.gather(1, hc).squeeze(1) & constr
                base_ok = (
                    self.p_alive[:, p]
                    & (self.p_type[:, p] == self._builder_idx)
                    & (self.p_charges[:, p] > 0)
                    & (self.owner.gather(1, hc).squeeze(1) >= 0)
                    & (self.center_at.gather(1, hc).squeeze(1) < 0)
                    & (self.improvement.gather(1, hc).squeeze(1) < 0)
                    & (self.district.gather(1, hc).squeeze(1) < 0)  # not a district tile (mirrors validImprovements; D5b)
                    & (self.built_wonder.gather(1, hc).squeeze(1) < 0)  # A-8 gate-catch: an in-flight wonder pave refuses improvements
                )
                for act, valid, imp in ((13, farmable, self.FARM), (14, mineable, self.MINE), (15, woodsy, self.LUMBER)):
                    if imp < 0:
                        continue
                    bld = base_ok & (a == act) & valid
                    if bool(bld.any()):
                        rows = bld.nonzero(as_tuple=True)[0]
                        self.improvement[rows, here[rows]] = imp
                        self.p_charges[rows, p] -= 1
                        self.p_acted[:, p] = self.p_acted[:, p] | bld  # P4/D-2: builderImprove spends MP
                        self._eff_version += 1
                        gone = bld & (self.p_charges[:, p] <= 0)
                        if bool(gone.any()):
                            gr = gone.nonzero(as_tuple=True)[0]
                            self.pciv_at[gr, here[gr]] = -1
                            self.p_alive[:, p] = self.p_alive[:, p] & ~gone

            # --- step to a neighbor (0..5) --------------------------------------
            mv = self.p_alive[:, p] & (a >= 0) & (a < 6)
            if not bool(mv.any()):
                continue
            dirs = a.clamp(min=0, max=5)
            tgt = nb.gather(1, dirs.unsqueeze(1)).squeeze(1)
            civ = self._p_civ[self.p_type[:, p]]
            side = torch.where(civ, self.pciv_at.gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1), self.pmil_at.gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1))
            ok = (
                mv
                & (tgt >= 0)
                & self.passable.gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1)
                & (self.barb_at.gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1) < 0)
                & (self.rv_at.gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1) < 0)
                & (self.rvciv_at.gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1) < 0)  # C1-B5b: rival builders block player moves (foreign)
                & (side < 0)
            )
            if bool(ok.any()):
                rows = ok.nonzero(as_tuple=True)[0]
                mil_rows = rows[~civ[rows]]
                civ_rows = rows[civ[rows]]
                if len(mil_rows) > 0:
                    self.pmil_at[mil_rows, here[mil_rows]] = -1
                    self.pmil_at[mil_rows, tgt[mil_rows]] = p
                if len(civ_rows) > 0:
                    self.pciv_at[civ_rows, here[civ_rows]] = -1
                    self.pciv_at[civ_rows, tgt[civ_rows]] = p
                self.p_tile[rows, p] = tgt[rows]
                self.p_acted[:, p] = self.p_acted[:, p] | ok  # P4/D-2: the step spends MP
                self._clear_camp_at(ok, tgt)  # walkPath clears camps for any player unit

    def _bankrupt_disband(self) -> None:
        """GV-5: an insolvent treasury disbands ONE player unit per turn — the
        priciest alive unit (tie -> lowest slot = oldest, matching TS's lowest
        id; both spawn orders are append-only). Only upkeep>0 units (military)
        are candidates; no refund. Inert at the gate (play stays gold-positive
        by t100), so the gates never exercise it — domination_test-style poke +
        the TS vitest pin the semantics."""
        insolvent = js_round(self.treasury * 1000) < 0  # [B] GS: test at milli precision so sub-milli non-dyadic gold drift (0.05-unit sums) can't spuriously trip the < 0 boundary vs TS
        if not bool(insolvent.any()):
            return
        P = self.p_alive.shape[1]
        maint = self._p_maint[self.p_type]  # [B, P] upkeep per slot
        cand = self.p_alive & (maint > 0)
        slots = torch.arange(P, device=self.device, dtype=maint.dtype).unsqueeze(0)  # [1, P]
        # maximize (upkeep, -slot): upkeep*(P+1) - slot lets upkeep dominate, tie -> lowest slot
        score = torch.where(cand, maint * float(P + 1) - slots, torch.full_like(maint, -1e30))
        victim = score.argmax(dim=1)  # [B]
        do_kill = insolvent & cand.any(dim=1)
        if not bool(do_kill.any()):
            return
        rows = do_kill.nonzero(as_tuple=True)[0]
        vslot = victim[rows]
        vtile = self.p_tile[rows, vslot]
        vciv = self._p_civ[self.p_type[rows, vslot]]  # clear military vs civilian occupancy
        mil = ~vciv
        if bool(mil.any()):
            self.pmil_at[rows[mil], vtile[mil]] = -1
        if bool(vciv.any()):
            self.pciv_at[rows[vciv], vtile[vciv]] = -1
        self.p_alive[rows, vslot] = False

    def _barbarian_phase(self) -> None:
        """Mirrors barbarianPhase turn for turn, draw for draw: camp roll →
        camp placement → per-camp garrison rolls → raider actions (attack
        else march) in unit order → city healing."""
        cb, B, T, dev = self.rules.combat, self.B, self.T, self.device
        city_max_hp = int(cb.get("cityMaxHp", 200))

        # New camp? One draw whenever below the cap AND any CIVILIZATION
        # still holds a city — A-15: the TS gate is anyCivCity now (player
        # OR rival cities; real Civ 6 barbs don't die with the player), so
        # only a fully citiless world skips the roll. The short-circuit is
        # part of the draw-count contract, both engines changed together.
        # A second draw picks the spot only if any candidate exists.
        any_city = self.alive.any(dim=1) | self.rc_alive.reshape(B, -1).any(dim=1)
        can_roll = any_city & (self.n_camps < self.max_camps)
        r1 = self._next_random(can_roll)
        want = can_roll & (r1 < cb.get("campSpawnChance", 0.08))
        if bool(want.any()):
            # D-15: only the `want` rows consume the candidate planes — build
            # them on the want sub-batch (boolean/integer ops row-restrict
            # exactly; the RNG calls keep their full-B masks unchanged).
            wr = want.nonzero(as_tuple=True)[0]
            near_city_w = ((self.dist[wr] < 5) & self.alive[wr].unsqueeze(2)).any(dim=1)  # [n, T]
            # P5/S6 gate-catch (seed 9027 t230): campCandidates excludes
            # t.district LIVE — an ORPHANED pave (razed city's district on an
            # unowned tile) padded the GPU set and shifted the draw-indexed
            # camp spot one candidate over. camp_ok is static; paves aren't.
            # AUDIT A-15: camps rise away from EVERY civilization — live
            # RIVAL city centers repel candidates too (real Civ 6; the TS
            # campCandidates twin loop).
            rcc_w = self.rc_center[wr].reshape(len(wr), -1)
            near_rc_w = ((self.pair_dist[rcc_w.clamp(min=0)] < 5) & self.rc_alive[wr].reshape(len(wr), -1).unsqueeze(2)).any(dim=1)
            cand_w = self.camp_ok[wr] & (self.owner[wr] == -1) & (self.cs_at[wr] < 0) & (self.rival_at[wr] < 0) & ~near_city_w & ~near_rc_w & (self.district[wr] < 0) & (self.built_wonder[wr] < 0)  # A-4: live builtWonder excludes too
            if self.K > 0:
                camp_d_w = self.pair_dist[self.camp_tile[wr].clamp(min=0)].to(torch.long)  # [n, K, T]
                near_camp_w = ((camp_d_w < 5) & (self.camp_tile[wr] >= 0).unsqueeze(2)).any(dim=1)
                cand_w = cand_w & ~near_camp_w
            has = torch.zeros_like(want)
            has[wr] = cand_w.any(dim=1)  # want[wr] is all-True, so has == want & cand.any
            r2 = self._next_random(has)
            if bool(has.any()):
                k_w = torch.floor(r2[wr] * cand_w.sum(dim=1).to(torch.float64)).to(torch.long)
                cum_w = cand_w.long().cumsum(dim=1)
                sel_w = cand_w & (cum_w == (k_w + 1).unsqueeze(1))
                spot = torch.zeros(B, dtype=torch.long, device=dev)
                spot[wr] = sel_w.long().argmax(dim=1)
                rows = has.nonzero(as_tuple=True)[0]
                self.camp_tile[rows, self.n_camps[rows]] = spot[rows]
                self.n_camps[rows] += 1
                self._spawn_barb(has, spot, 0)  # WARRIOR

        # Garrisons + growth. The near-camp check uses the unit list as it
        # stood BEFORE this loop (TS snapshots `barbs` first); the cap check
        # recounts live (TS calls barbUnits() fresh inside the condition).
        # The camp↔unit distance matrix is hoisted (5b): camps don't move,
        # and units spawned mid-loop are invisible to the pre_alive mask.
        pre_alive = self.u_alive.clone()
        grow_type = 1 if self.turn > cb.get("spearmanAfterTurn", 60) else 0
        any_camp = bool((self.camp_tile >= 0).any())
        if any_camp:
            du_all = self.pair_dist[self.camp_tile.clamp(min=0).unsqueeze(2), self.u_tile.unsqueeze(1)].to(torch.long)  # [B, K, U]
            near_any_all = (pre_alive.unsqueeze(1) & (du_all <= 1)).any(dim=2)  # [B, K]
        for k in range(self.K if any_camp else 0):
            camp = self.camp_tile[:, k]
            active = camp >= 0
            if not bool(active.any()):
                continue
            near_any = near_any_all[:, k]
            self._spawn_barb(active & ~near_any, camp, 0)  # empty camp regarrisons
            can_grow = active & near_any & (self.u_alive.sum(dim=1) < self.n_camps * cb.get("maxBarbPerCamp", 3))
            r = self._next_random(can_grow)
            self._spawn_barb(can_grow & (r < cb.get("garrisonGrowChance", 0.1)), camp, grow_type)

        # One guard stays home per camp: first unit (in unit order) within
        # reach of each camp (in camp order), like the TS guard set. Only
        # `guard` mutates inside this loop, so the distances hoist too
        # (fresh — garrison spawns just added units).
        guard = torch.zeros(B, U_MAX, dtype=torch.bool, device=dev)
        if any_camp:
            du_g = self.pair_dist[self.camp_tile.clamp(min=0).unsqueeze(2), self.u_tile.unsqueeze(1)].to(torch.long)  # [B, K, U]
        for k in range(self.K if any_camp else 0):
            camp = self.camp_tile[:, k]
            active = camp >= 0
            if not bool(active.any()):
                continue
            near = self.u_alive & (du_g[:, k] <= 1) & ~guard & active.unsqueeze(1)
            any_near = near.any(dim=1)
            first = near.long().argmax(dim=1)
            rows = any_near.nonzero(as_tuple=True)[0]
            guard[rows, first[rows]] = True

        # Raiders act in unit order: attack something adjacent (a player
        # city, any hostile unit — player or rival — or a rival city;
        # lowest tile index first, as attackTargets scans the map), else
        # march toward the nearest player city. Sequential slots mirror the
        # TS loop — a second raider hitting the same target sees the first
        # one's damage.
        u_high = int(self.next_slot.max().item())
        arange6 = torch.arange(6, device=dev)
        # D-4: iterate only slots alive in SOME game — deaths can only shrink
        # the set mid-loop and nothing spawns barbs here, so the snapshot is a
        # superset; ascending order (and thus the TS unit order) is unchanged.
        # Kills the per-dead-slot host sync (~pool-high-water of them a step).
        u_live = self.u_alive[:, :u_high].any(dim=0).nonzero(as_tuple=True)[0].tolist() if u_high else []
        for u in u_live:
            act = self.u_alive[:, u] & ~guard[:, u]
            if not bool(act.any()):
                continue
            here = self.u_tile[:, u]
            nb = self.neigh[here]  # [B, 6]
            nbc = nb.clamp(min=0)
            ctr = self.center_at.gather(1, nbc)
            has_unit = (
                (self.pmil_at.gather(1, nbc) >= 0)
                | (self.pciv_at.gather(1, nbc) >= 0)
                | (self.rv_at.gather(1, nbc) >= 0)
                | (self.rvciv_at.gather(1, nbc) >= 0)
            )
            rvc = self.rvcity_at.gather(1, nbc) >= 0
            valid = (nb >= 0) & ((ctr >= 0) | has_unit | rvc)
            tkey = torch.where(valid, nb, T + 1)
            target_tile = tkey.min(dim=1).values
            attack = act & (target_tile <= T)
            ttc = target_tile.clamp(max=T - 1)
            # meleeAttack routes PLAYER center tiles to the city even with a
            # garrison; units defend everywhere else; a unit-less rival
            # center is besieged via attackRivalCity.
            tgt_city = self.center_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
            has_u = (
                (self.pmil_at.gather(1, ttc.unsqueeze(1)).squeeze(1) >= 0)
                | (self.pciv_at.gather(1, ttc.unsqueeze(1)).squeeze(1) >= 0)
                | (self.rv_at.gather(1, ttc.unsqueeze(1)).squeeze(1) >= 0)
                | (self.rvciv_at.gather(1, ttc.unsqueeze(1)).squeeze(1) >= 0)
            )
            city_att = attack & (tgt_city >= 0)
            unit_att = attack & (tgt_city < 0) & has_u
            rvc_att = attack & (tgt_city < 0) & ~has_u & (self.rvcity_at.gather(1, ttc.unsqueeze(1)).squeeze(1) >= 0)

            if bool(city_att.any()):
                self._hostile_city_attack(city_att, tgt_city, "barb", u)
            if bool(unit_att.any()):
                self._hostile_vs_unit(unit_att, ttc, "barb", u)
            if bool(rvc_att.any()):
                self._attack_rival_city(rvc_att, ttc, u)
            self.u_acted[:, u] = self.u_acted[:, u] | city_att | unit_att | rvc_att  # P4/D-2

            # Pillage: a raider that did not attack, standing on an owned,
            # improved, unpillaged tile, pillages it (holds — no march this
            # turn), mirroring hostileUnitAct's pillage branch. P4/D-20: only
            # FOOD improvements heal the pillager (+25).
            pillage = torch.zeros_like(act)
            if self.improvements_on:
                h_imp = self.improvement.gather(1, here.unsqueeze(1)).squeeze(1) >= 0
                h_unpil = ~self.pillaged.gather(1, here.unsqueeze(1)).squeeze(1)
                # P5/S7 (C-4a): barbarians raid RIVAL improvements too.
                h_owned = (self.owner.gather(1, here.unsqueeze(1)).squeeze(1) >= 0) | (
                    self.rival_at.gather(1, here.unsqueeze(1)).squeeze(1) >= 0
                )
                pillage = act & ~attack & h_imp & h_unpil & h_owned
                if bool(pillage.any()):
                    rows = pillage.nonzero(as_tuple=True)[0]
                    heal_r = self._imp_heals[self.improvement[rows, here[rows]].clamp(min=0)]
                    self.pillaged[rows, here[rows]] = True
                    self.u_acted[rows, u] = True  # P4/D-2
                    self._eff_version += 1  # a farm's yield just dropped
                    hp_cap = self.rules.combat.get("unitHp", 100)
                    self.u_hp[rows, u] = torch.where(
                        heal_r, (self.u_hp[rows, u] + 25).clamp(max=hp_cap), self.u_hp[rows, u]
                    )

            # March target: the nearest unpillaged owned improvement within
            # dist < 13 (ties → lowest tile index), else the nearest alive
            # city (ties → founding order) — mirrors hostileUnitAct's target
            # scan (raiders head for your farms to pillage them).
            march = act & ~attack & ~pillage
            if not bool(march.any()):
                continue
            arangeT = torch.arange(T, device=dev)
            if self.improvements_on:
                imp_job = (self.improvement >= 0) & ~self.pillaged & ((self.owner >= 0) | (self.rival_at >= 0))  # [B, T] (C-4a: rival farms tempt barbs too)
                d_imp = self.pair_dist[here.unsqueeze(1), arangeT.unsqueeze(0)].to(torch.long)
                ikey = torch.where(imp_job & (d_imp < 13), d_imp * (T + 1) + arangeT, torch.full_like(d_imp, 10**9))
                imp_min, imp_tgt = ikey.min(dim=1)
                has_imp = imp_min < 10**9
            else:
                has_imp = torch.zeros_like(act)
                imp_tgt = here.clamp(min=0)
            dc = self.pair_dist[here.unsqueeze(1), self.site.clamp(min=0)].to(torch.long)  # [B, C]
            ckey = torch.where(self.alive, dc * 16 + torch.arange(self.C, device=dev), 10**9)
            city_min = ckey.min(dim=1).values
            city_tgt = self.site.gather(1, ckey.argmin(dim=1, keepdim=True)).squeeze(1).clamp(min=0)
            tgt = torch.where(has_imp, imp_tgt, city_tgt)
            has_tgt = has_imp | (city_min < 10**9)
            d_here = self.pair_dist[here, tgt].to(torch.long)
            # AUDIT B-26: the raider walks REAL MP toward the (fixed) target,
            # exactly as the A-8 rival march does — per step: the passable free
            # neighbor closest to it (ties → direction order), move only if
            # strictly closer, walkPath's charge (1 + tmove//3, live/strip-
            # adjusted, + 3 per river-edge crossing); a full-MP unit always
            # affords its first step. An improvement target is walked ONTO; a
            # CITY target stops the march ADJACENT (dir >= 1 — enemy centers
            # can't be entered, and the start-of-phase attack scan already met
            # any adjacent target). Any step sets u_acted (movesLeft < full →
            # the D-2 heal is blocked). WARRIOR/SPEARMAN both move 2. Camps are
            # a barb no-op (clearCampFor skips barbarians).
            full_mp = torch.full_like(here, 2)
            mp = full_mp.clone()
            cur = here.clone()
            d_cur = d_here.clone()
            moving = march & has_tgt
            while bool(moving.any()):
                nb2 = self.neigh[cur.clamp(min=0)]
                nb2c = nb2.clamp(min=0)
                step_ok = (nb2 >= 0) & self.passable.gather(1, nb2c) & ~self._blocked_for(nb2, "barb")
                d_nb = self.pair_dist[tgt.unsqueeze(1), nb2c].to(torch.long)  # dist(neighbor, target); symmetric
                skey = torch.where(step_ok, d_nb * 8 + arange6, 10**9)
                best = skey.min(dim=1).values
                dir_i = (best % 8).clamp(max=5)
                dest = nb2.gather(1, dir_i.unsqueeze(1)).squeeze(1)
                cost = (
                    1
                    + torch.div(self.tmove.gather(1, dest.clamp(min=0).unsqueeze(1)).squeeze(1), 3, rounding_mode="floor")
                    + 3 * ((self.river_mask.gather(1, cur.clamp(min=0).unsqueeze(1)).squeeze(1) >> dir_i) & 1)
                )
                mv = (
                    moving
                    & (best < 10**9)
                    & (torch.div(best, 8, rounding_mode="floor") < d_cur)
                    & (has_imp | (torch.div(best, 8, rounding_mode="floor") >= 1))
                    & ((mp >= cost) | (mp >= full_mp))
                )
                if not bool(mv.any()):
                    break
                rows = mv.nonzero(as_tuple=True)[0]
                self.barb_at[rows, cur[rows]] = -1
                self.barb_at[rows, dest[rows]] = u
                self.u_tile[rows, u] = dest[rows]
                self.u_acted[rows, u] = True  # P4/D-2
                mp = torch.where(mv, (mp - cost).clamp(min=0), mp)
                d_cur = torch.where(mv, torch.div(best, 8, rounding_mode="floor"), d_cur)
                cur = torch.where(mv, dest, cur)
                moving = mv & (mp > 0)

        # AUDIT B-2: a PLAYER city with ANCIENT_WALLS fires once/turn at the
        # nearest unit hostile to the player (barbarians always; at-war rival
        # units, civilians included), range 2, lowest tile index breaking
        # ties. One roll at cityDefenseStrength vs the target's defense —
        # mirrors hostileRangedStrike (single roll, no retaliation, civilians
        # take the roll, never captures). City order (walk_ord = TS array
        # order): a kill removes the target for later cities and advances the
        # shared per-row RNG, so it runs immediately BEFORE the heal loop.
        if self._walls_bidx >= 0:
            Bn, Tn, dev2 = self.B, self.T, self.device
            bidx = torch.arange(Bn, device=dev2)
            arangeT = torch.arange(Tn, device=dev2)
            rcap = max(self.R - 1, 0)
            walk_ord = torch.argsort(torch.where(self.alive, self.city_seq, self.city_seq + 10**6), dim=1, stable=True)
            for s_rank in range(self.C):
                col = walk_ord[:, s_rank]  # [B] — this game's s_rank-th city (TS array order)
                walled = self.alive[bidx, col] & self.buildings[bidx, col, self._walls_bidx]
                if not bool(walled.any()):
                    continue
                ctr = self.site[bidx, col].clamp(min=0)  # [B]
                dist = self.pair_dist[ctr].to(torch.long)  # [B, T]
                barb_h = self.barb_at >= 0
                rvn = self.rv_at
                rmil_h = (rvn >= 0) & self.r_atwar.gather(1, self.v_civ.gather(1, rvn.clamp(min=0)).clamp(max=rcap))
                rcvn = self.rvciv_at
                rciv_h = (rcvn >= 0) & self.r_atwar.gather(1, self.v_civ.gather(1, rcvn.clamp(min=0)).clamp(max=rcap))
                hostile = barb_h | rmil_h | rciv_h  # [B, T]
                valid = walled.unsqueeze(1) & hostile & (dist >= 1) & (dist <= 2)
                key = torch.where(valid, dist * (Tn + 1) + arangeT.view(1, -1), torch.full((Bn, Tn), 10**9, device=dev2, dtype=torch.long))
                best_key = key.min(dim=1).values
                tt = key.argmin(dim=1)  # [B] target tile (garbage where no target)
                strike = walled & (best_key < 10**9)
                if not bool(strike.any()):
                    continue
                b_slot = self.barb_at[bidx, tt]
                m_slot = self.rv_at[bidx, tt]
                c_slot = self.rvciv_at[bidx, tt]
                is_barb = b_slot >= 0
                is_rmil = ~is_barb & (m_slot >= 0)  # military first (barb > rival mil > rival civ)
                is_rciv = ~is_barb & ~is_rmil & (c_slot >= 0)
                d_cs_barb = self._unit_combat[self.u_type[bidx, b_slot.clamp(min=0)]]
                d_cs_rmil = self._p_combat[self.v_type[bidx, m_slot.clamp(min=0)]]
                d_cs_rciv = self._p_combat[self.v_type[bidx, c_slot.clamp(min=0)]]
                def_cs = torch.where(is_barb, d_cs_barb, torch.where(is_rmil, d_cs_rmil, d_cs_rciv)) + self.tdef[bidx, tt]
                gar = (self.pmil_at[bidx, ctr] >= 0).long()  # cityDefenseStrength garrison +5
                atk_cs = torch.maximum(self.best_melee, torch.full_like(self.best_melee, 15)) + gar * 5
                # B-29: the defending unit is wounded (the attacker is the city).
                def_hp = torch.where(is_barb, self.u_hp[bidx, b_slot.clamp(min=0)], torch.where(is_rmil, self.v_hp[bidx, m_slot.clamp(min=0)], self.v_hp[bidx, c_slot.clamp(min=0)]))
                def_e = def_cs - self._wound(def_hp)
                # B-7 support: the struck unit (barb, or an at-war rival
                # military/civilian) gains support from adjacent same-side
                # military; the attacker is the city (not a unit) — no flanking.
                _dside = torch.where(is_barb, torch.ones(Bn, dtype=torch.long, device=dev2), torch.full((Bn,), 2, dtype=torch.long, device=dev2))
                _dciv = torch.where(is_rmil, self.v_civ[bidx, m_slot.clamp(min=0)], self.v_civ[bidx, c_slot.clamp(min=0)])
                _, _sp = self._flank_support(tt, _dside, _dciv, torch.full((Bn,), -1, dtype=torch.long, device=dev2))
                def_e = def_e + SUPPORT_CS * _sp
                d = self._damage_roll(strike, atk_cs - def_e, k="pcstk", tile=tt)
                rows = strike.nonzero(as_tuple=True)[0]
                for grp, at_map, hp_t, alive_t, slot_t in (
                    (is_barb, self.barb_at, self.u_hp, self.u_alive, b_slot),
                    (is_rmil, self.rv_at, self.v_hp, self.v_alive, m_slot),
                    (is_rciv, self.rvciv_at, self.v_hp, self.v_alive, c_slot),
                ):
                    g = rows[grp[rows]]
                    if len(g) == 0:
                        continue
                    ds = slot_t[g]
                    hp_t[g, ds] -= d[g]
                    dead = hp_t[g, ds] <= 0
                    at_map[g[dead], tt[g[dead]]] = -1
                    alive_t[g[dead], ds[dead]] = False

        # Cities heal +20 when no hostile stands adjacent (barbarians, or
        # rival units whose civ is at war — TS unitsHostile counts rival
        # CIVILIANS too: an at-war builder besieges. P5/S2 hunt, seed 9131
        # t175: a rival builder on a captured city's ring blocked the TS
        # heal while the GPU read only the military map).
        nb_c = self.neigh[self.site.clamp(min=0)]  # [B, C, 6]
        nbf = nb_c.clamp(min=0).reshape(B, -1)
        adj_b = (self.barb_at.gather(1, nbf) >= 0).reshape(B, self.C, 6)
        rvn = self.rv_at.gather(1, nbf)
        rv_war = (rvn >= 0) & self.r_atwar.gather(1, self.v_civ.gather(1, rvn.clamp(min=0)).clamp(max=max(self.R - 1, 0)))
        rvcn = self.rvciv_at.gather(1, nbf)
        rvc_war = (rvcn >= 0) & self.r_atwar.gather(1, self.v_civ.gather(1, rvcn.clamp(min=0)).clamp(max=max(self.R - 1, 0)))
        besieged = ((adj_b | (rv_war | rvc_war).reshape(B, self.C, 6)) & (nb_c >= 0)).any(dim=2)
        healable = self.alive & (self.city_hp < city_max_hp) & ~besieged
        self.city_hp = torch.where(healable, (self.city_hp + cb.get("cityHealPerTurn", 20)).clamp(max=city_max_hp), self.city_hp)
        # AUDIT B-1: the outer wall pool heals on the SAME unbesieged gate and
        # rate (cap wallsHp), even at full city HP (TS drops the full-HP skip).
        if self._walls_bidx >= 0:
            heal_o = self.alive & self.buildings[:, :, self._walls_bidx] & ~besieged
            self.outer_hp = torch.where(heal_o, (self.outer_hp + cb.get("cityHealPerTurn", 20)).clamp(max=self._walls_hp), self.outer_hp)

    # --- city-states (phase 4c) ---------------------------------------------------

    def _city_state_phase(self) -> None:
        """Mirrors cityStatePhase draw for draw: meeting (instant, fog off) →
        influence → envoys → quest resolve/issue per city-state in id order
        (issuing draws twice: the askable district, then the option pick —
        the trade-route option always exists here, so the pool is never
        empty) → cosmetic growth every 12 turns."""
        if self.S == 0:
            return
        r = self.rules.cs
        B = self.B
        self.cs_met = self.cs_met | self.cs_alive
        any_met = self.cs_met.any(dim=1)
        # A-7r: the player's adopted-government influence tier joins the flat
        # rate (cityStates.ts:248 `INFLUENCE_PER_TURN + GOV_INFLUENCE_TIER`).
        # Gated on the A-7r switch — inert (tier 0) until adoption is live.
        per_turn = float(r.get("influencePerTurn", 3))
        if self._gov_live:
            per_turn = per_turn + self._adopted_gov_tier(self.civics).to(self.dtype)
        self.influence = self.influence + torch.where(any_met, per_turn, torch.zeros_like(self.influence))
        cost = float(r.get("envoyCost", 100))
        for _ in range(3):
            earn = any_met & (self.influence >= cost)
            if not bool(earn.any()):
                break
            self.influence = torch.where(earn, self.influence - cost, self.influence)
            self.envoys_avail = self.envoys_avail + earn.long()

        cooldown = int(r.get("questCooldown", 12))
        # D-16: "player owns a live complete district of askable type a" is
        # constant across the s loop (quest resolution never touches the
        # district planes) — one [B, nAskable] table per turn, gathered per
        # s below, instead of 2·S full [B, T] scans.
        if self._askable.numel() > 0 and self.districts_on:
            own_live = self.district_complete & (self.owner >= 0) & ~self.district_dead  # [B, T]
            own_tbl = ((self.district.unsqueeze(2) == self._askable.view(1, 1, -1)) & own_live.unsqueeze(2)).any(dim=1)  # [B, nA]
        else:
            own_tbl = None
        for s in range(self.S):
            act = self.cs_alive[:, s] & self.cs_met[:, s]
            # Resolve: clear-the-camp, or a buildDistrict quest for a district the
            # player has since completed. Only CAMPUS is buildable in covered
            # scope, so a district quest resolves iff it asked for CAMPUS (idx 0)
            # and the player owns one; trade-route quests remain uncompletable.
            camp_gone = ~((self.camp_tile == self.cs_quest_camp[:, s].unsqueeze(1)) & (self.camp_tile >= 0)).any(dim=1)
            resolved_camp = act & (self.cs_quest[:, s] == 1) & camp_gone
            # a buildDistrict quest resolves when the player owns the asked
            # district type (askable idx recorded in cs_quest_district).
            if own_tbl is not None:
                qd = self.cs_quest_district[:, s].clamp(min=0, max=self._askable.numel() - 1)
                owns_asked = own_tbl.gather(1, qd.unsqueeze(1)).squeeze(1) & (self.cs_quest_district[:, s] >= 0)  # PLAYER (live) districts only (D-16 table)
            else:
                owns_asked = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            resolved_dist = act & (self.cs_quest[:, s] == 3) & owns_asked
            resolved = resolved_camp | resolved_dist
            if bool(resolved.any()):
                rows = resolved.nonzero(as_tuple=True)[0]
                self.cs_quest[rows, s] = 0
                self.cs_quest_issued[rows, s] = self.turn
                self.cs_envoys[rows, s] += int(r.get("questEnvoys", 1))
            # Issue on cooldown (mirrors issueQuest, 2 draws): DRAW 1 picks the
            # askable district (0=CAMPUS); buildDistrict is an option only if the
            # player has NOT already completed that district (only CAMPUS is
            # buildable here). DRAW 2 picks among the options in order
            # [clearCamp?, sendTradeRoute, buildDistrict?].
            due = act & (self.cs_quest[:, s] == 0) & (self.turn - self.cs_quest_issued[:, s] >= cooldown)
            r1 = self._next_random(due)  # the askable-district pick
            draw1 = torch.floor(r1 * 4.0).to(torch.long)
            # buildDistrict offered unless the player already owns the DRAWN
            # askable district (askable idx -> district type via self._askable).
            if own_tbl is not None:
                already_bd = own_tbl.gather(1, draw1.clamp(min=0, max=self._askable.numel() - 1).unsqueeze(1)).squeeze(1)  # PLAYER (live) districts only (D-16 table)
            else:
                already_bd = torch.zeros(self.B, dtype=torch.bool, device=self.device)
            bd = ~already_bd
            cdist = self.pair_dist[self.cs_center[:, s].unsqueeze(1), self.camp_tile.clamp(min=0)].to(torch.long)
            near = (self.camp_tile >= 0) & (cdist <= 6)
            has_camp = near.any(dim=1)
            first_k = near.long().argmax(dim=1)
            camp_idx = self.camp_tile.gather(1, first_k.unsqueeze(1)).squeeze(1)
            n_opts = has_camp.long() + 1 + bd.long()  # clearCamp? + sendTradeRoute + buildDistrict?
            r2 = self._next_random(due)
            pick = torch.floor(r2 * n_opts.to(torch.float64)).to(torch.long)
            st_pos = has_camp.long()  # sendTradeRoute index (clearCamp takes 0 when present)
            kind = torch.where(
                has_camp & (pick == 0),
                torch.ones_like(pick),
                torch.where(pick == st_pos, torch.full_like(pick, 2), torch.full_like(pick, 3)),
            )
            if bool(due.any()):
                rows = due.nonzero(as_tuple=True)[0]
                self.cs_quest[rows, s] = kind[rows]
                self.cs_quest_issued[rows, s] = self.turn
                take_camp = due & (kind == 1)
                if bool(take_camp.any()):
                    cr = take_camp.nonzero(as_tuple=True)[0]
                    self.cs_quest_camp[cr, s] = camp_idx[cr]
                take_dist = due & (kind == 3)
                if bool(take_dist.any()):
                    dr = take_dist.nonzero(as_tuple=True)[0]
                    self.cs_quest_district[dr, s] = draw1[dr]

        if self.turn % 12 == 0:
            self.cs_pop = torch.where(self.cs_alive, (self.cs_pop + 1).clamp(max=10), self.cs_pop)
        # V-CS: siege recovery — +10/turn toward maxHp (cityStatePhase tail).
        cs_max = int(self.rules.cs.get("maxHp", 150))
        self.cs_hp = torch.where(self.cs_alive & (self.cs_hp < cs_max), (self.cs_hp + 10).clamp(max=cs_max), self.cs_hp)

    # --- rival civs (phase 4c) ------------------------------------------------------

    def _spawn_rival(self, mask: torch.Tensor, at_tile: torch.Tensor, type_idx: torch.Tensor, civ: int) -> torch.Tensor:
        """Rival units are military and share one append-only pool (per-civ
        order = state.units order filtered by civ, which per-civ loops use).
        Returns the LANDED mask (P5/S8: purchases refund on no spawn spot)."""
        if not bool(mask.any()):
            return torch.zeros_like(mask)
        found, spot = self._first_free_spot(at_tile, "rival", civ=civ)
        can = mask & found
        if not bool(can.any()):
            return can
        rows = can.nonzero(as_tuple=True)[0]
        slot = self.v_next[rows]
        assert int(slot.max()) < U_MAX, "rival slot pool exhausted — raise U_MAX"
        self.v_alive[rows, slot] = True
        self.v_civ[rows, slot] = civ
        self.v_type[rows, slot] = type_idx[rows] if type_idx.dim() > 0 else type_idx
        self.v_tile[rows, slot] = spot[rows]
        self.v_hp[rows, slot] = self.rules.combat.get("unitHp", 100)
        self.v_fortify[rows, slot] = 0  # B-5: a fresh (possibly reclaimed) slot starts undug
        self.v_charges[rows, slot] = 0  # military; builders (B5b) set their charges
        self.rv_at[rows, spot[rows]] = slot
        self.v_next[rows] += 1
        # P4/D-22: the civ's strongest melee ever (city defense); rival
        # military is melee unless the roster type carries ranged strength.
        # clamp max too: unmasked rows may hold district queue codes.
        ti = (type_idx if type_idx.dim() > 0 else type_idx.expand(self.B)).clamp(min=0, max=self.NU - 1)
        melee_cs = torch.where(
            can & (self._p_rng_str[ti] == 0),
            self._p_combat[ti],
            torch.zeros_like(self.r_best_melee[:, civ]),
        )
        self.r_best_melee[:, civ] = torch.maximum(self.r_best_melee[:, civ], melee_cs)
        return can

    def rival_masks(self, r: int) -> dict[str, torch.Tensor]:
        """C2b: a controlled rival's decision space, in the PLAYER head
        layouts so one net serves every seat. production [B, RC,
        NB+2+NU+nScaffold(+purchase width, all-False)]: col 0..NB-1 queue
        that building (the B4b-2 gates), NB = settler (capital only, under
        the picker's own gate), NB+1 = idle, NB+2.. = train that unit
        (research-gated types + the builder's one-per-civ/jobs gate),
        then scaffold districts (placeable now, B4a gates). tech [B, NT] /
        civic [B, NC] = available picks where cur == -1. Purchases and
        envoys have no rival analog — all-False.
        NOTE: masks are evaluated on the CURRENT state (call before
        step()); apply_rival_actions() writes the choices the rival phase
        will honor."""
        B, dev = self.B, self.device
        rdv = self.rules_dev
        NBn = rdv.b_cost.shape[0]
        nS = len(self._scaffold)
        rr = self.rules.rivals
        alive = self.rc_alive[:, r]  # [B, RC]
        idle = alive & (self.rc_current[:, r] == -1)
        # buildings: the B4b-2 gate block, vectorized over cities
        ones_nb = torch.ones(B, NBn, dtype=torch.bool, device=dev)
        unl_b = torch.where(
            rdv.b_unlock.unsqueeze(0) >= 0,
            self.r_techs[:, r].gather(1, rdv.b_unlock.clamp(min=0).unsqueeze(0).expand(B, -1)),
            ones_nb,
        ) & torch.where(
            rdv.b_unlock_civic.unsqueeze(0) >= 0,
            self.r_civics[:, r].gather(1, rdv.b_unlock_civic.clamp(min=0).unsqueeze(0).expand(B, -1)),
            ones_nb,
        )  # [B, NB]
        prod_cols = []
        for j in range(self.RC):
            have_b = self.rc_bldg[:, r, j]
            ctile = self.rc_center[:, r, j].clamp(min=0)
            riv_c = self.tile_river.gather(1, ctile.unsqueeze(1)).squeeze(1)
            ok_b = unl_b & ~have_b & (~rdv.b_river.view(1, -1) | riv_c.unsqueeze(1))
            reqd_b = rdv.b_req_district
            reg_t = self.rc_dist_tile[:, r, j].gather(1, reqd_b.clamp(min=0).unsqueeze(0).expand(B, -1))
            dcomp = (reg_t >= 0) & self.district_complete.gather(1, reg_t.clamp(min=0))
            ok_b &= torch.where(reqd_b.unsqueeze(0) >= 0, dcomp, ones_nb)
            for bi2, reqs in enumerate(self.rules.b_req_buildings):
                if reqs:
                    ok_b[:, bi2] &= have_b[:, torch.tensor(reqs, device=dev, dtype=torch.long)].any(dim=1)
            # settler: the CAPITAL only (rc_is_cap — the rivals.ts:1077
            # rc.isCapital gate; P7-FULL: no longer necessarily slot 0
            # once compaction runs), under the picker's own gate
            n_cities = self.rc_alive[:, r].sum(dim=1)
            settler_q = (self.rc_current[:, r] == 0).any(dim=1)
            ok_s = (
                self.rc_is_cap[:, r, j]
                & ~settler_q
                & (n_cities < rr.get("maxCities", 6))
            ).unsqueeze(1)
            # units: research-gated types (the picker's ladder exposes all
            # gated types to the NET — it may train spears where the script
            # trained horses); builder under one-per-civ + jobs-exist
            rres = rr.get("research", {})
            sp_t, ho_t = int(rres.get("spearTech", -1)), int(rres.get("horseTech", -1))
            ok_u = torch.zeros(B, self.NU, dtype=torch.bool, device=dev)
            ok_u[:, self._warrior_idx] = True
            if sp_t >= 0 and self._r_spearman >= 0:
                ok_u[:, self._r_spearman] = self.r_techs[:, r, sp_t]
            if ho_t >= 0 and self._r_horseman >= 0:
                ok_u[:, self._r_horseman] = self.r_techs[:, r, ho_t]
            # A-6: the ranged rung — SLINGER ungated, ARCHER on archerTech
            ar_t0 = int(rres.get("archerTech", -1))
            if self._r_slinger >= 0:
                ok_u[:, self._r_slinger] = True
            if ar_t0 >= 0 and self._r_archer >= 0:
                ok_u[:, self._r_archer] = self.r_techs[:, r, ar_t0]
            if self.improvements_on and self._builder_idx >= 0:
                has_alive = (self.v_alive & (self.v_civ == r) & (self.v_type == self._builder_idx)).any(dim=1)
                has_q = ((self.rc_current[:, r] == self._builder_idx + 1) & self.rc_alive[:, r]).any(dim=1)  # P5/S5: alive-masked
                ok_u[:, self._builder_idx] = ~(has_alive | has_q) & self._rival_job_mask(r).any(dim=1)
            # scaffold districts: placeable NOW under the B4 gates
            ok_d = torch.zeros(B, nS, dtype=torch.bool, device=dev)
            if self.districts_on and self._scaffold:
                cap_max = torch.div(self.rc_pop[:, r, j] - 1, 3, rounding_mode="floor") + 1
                spec_cnt = ((self.rc_dist_tile[:, r, j] >= 0) & self._is_specialty).sum(dim=1)
                for si, (di, utech, plc) in enumerate(self._scaffold):
                    has_tech = self.r_techs[:, r, utech] if utech >= 0 else torch.ones(B, dtype=torch.bool, device=dev)
                    not_owned = self.rc_dist_tile[:, r, j, di] < 0
                    under_cap = (spec_cnt < cap_max) if bool(self._is_specialty[di]) else torch.ones(B, dtype=torch.bool, device=dev)
                    # tile existence probed lazily at apply time (the scan
                    # is placement-order-dependent); the mask exposes the
                    # gate-level validity
                    ok_d[:, si] = has_tech & not_owned & under_cap
            row = torch.cat([ok_b, ok_s, torch.ones(B, 1, dtype=torch.bool, device=dev), ok_u, ok_d], dim=1)
            # VP-G2: the purchase block (buy building / settler / unit at
            # goldPurchaseMult x cost from the CIV's shared treasury) — NOT
            # idle-gated, mirroring the player's V-P1 columns. P5/S2 (C-13):
            # the settler column is LIVE now — priced off the rival's own
            # curve; the apply founds immediately (their machinery has no
            # settler bank) and refunds when no valid site exists.
            mult = self.rules.gold_purchase_mult
            afford_b = self._afford(self.r_treasury[:, r].unsqueeze(1), (rdv.b_cost.double() * mult).unsqueeze(0))
            pb = ok_b & afford_b & self.controlled[:, r].unsqueeze(1)
            s_cost_r = rr.get("settlerBase", 48) + rr.get("settlerPer", 18) * (n_cities.double() - 1).clamp(min=0)
            ps = (
                (n_cities < rr.get("maxCities", 6))
                & self._afford(self.r_treasury[:, r], s_cost_r * mult)
                & self.controlled[:, r]
            ).unsqueeze(1) & self.rc_is_cap[:, r, j].unsqueeze(1)  # capital column only (rc.isCapital)
            u_cost_r = self._p_cost.double().unsqueeze(0).expand(B, -1)
            if self._builder_idx >= 0:
                # P4/D-10: the builder column prices off THIS rival's escalator
                rb_n = self.r_builders_trained[:, r] + (self.rc_current[:, r] == self._builder_idx + 1).sum(dim=1)
                u_cost_r = u_cost_r.clone()
                u_cost_r[:, self._builder_idx] = self._builder_cost(rb_n).double()
            afford_u = self._afford(self.r_treasury[:, r].unsqueeze(1), u_cost_r * mult)
            pu = ok_u & afford_u & self.controlled[:, r].unsqueeze(1)
            prod_cols.append(torch.cat([row & idle[:, j].unsqueeze(1), pb, ps, pu], dim=1))
        production = torch.stack(prod_cols, dim=1)  # [B, RC, base + NB+1+NU purchase]
        tech = self._available_mask(self.r_techs[:, r], self._prereq_t) & (self.r_cur_tech[:, r] == -1).unsqueeze(1)
        civic = self._available_mask(self.r_civics[:, r], self._prereq_c) & (self.r_cur_civic[:, r] == -1).unsqueeze(1)
        # symmetric war head (seat-invariant [B, 2R] layout): a controlled
        # rival's only opponent-with-war-rules is THE PLAYER — column 0 =
        # declare (alive, at peace), column R = sue for peace (warTurns >=
        # min AND the player's exact gold schedule from r_treasury —
        # P5/S2 closed the C-13 free ride; the scripted roll pays too).
        rrw = self.rules.rivals
        Rw = max(self.R, 1)
        war = torch.zeros(B, 2 * Rw, dtype=torch.bool, device=dev)
        war[:, 0] = self.r_alive[:, r] & ~self.r_atwar[:, r]
        pcost_m = rrw.get("peaceGold0", 150) + rrw.get("peaceGoldSlope", 10) * self.r_warturns[:, r].to(torch.float64)
        war[:, Rw] = (
            self.r_alive[:, r] & self.r_atwar[:, r]
            & (self.r_warturns[:, r] >= rrw.get("warMinTurns", 14))
            & self._afford(self.r_treasury[:, r], pcost_m)
        )
        return {"production": production, "tech": tech, "civic": civic, "war": war}

    def apply_rival_actions(
        self,
        r: int,
        production: torch.Tensor | None = None,
        tech: torch.Tensor | None = None,
        civic: torch.Tensor | None = None,
        war: torch.Tensor | None = None,
    ) -> None:
        """C2b: write a controlled rival's choices BEFORE step(). Codes use
        the rival_masks layout; -1 = no action. Queue writes mirror the
        picker's exact cost/progress semantics (districts run the same
        placement scan; illegal or unplaceable picks fall to idle)."""
        B, dev = self.B, self.device
        rdv = self.rules_dev
        NBn = rdv.b_cost.shape[0]
        nS = len(self._scaffold)
        rr = self.rules.rivals
        if tech is not None:
            ok = (tech >= 0) & self.controlled[:, r] & (self.r_cur_tech[:, r] == -1)
            self.r_cur_tech[:, r] = torch.where(ok, tech.clamp(min=0), self.r_cur_tech[:, r])
        if civic is not None:
            ok = (civic >= 0) & self.controlled[:, r] & (self.r_cur_civic[:, r] == -1)
            self.r_cur_civic[:, r] = torch.where(ok, civic.clamp(min=0), self.r_cur_civic[:, r])
        if war is not None:
            Rw = max(self.R, 1)
            w = war.to(torch.long)
            declare = (w == 0) & self.controlled[:, r] & self.r_alive[:, r] & ~self.r_atwar[:, r]
            if bool(declare.any()):
                self.r_atwar[:, r] = self.r_atwar[:, r] | declare
                self.r_warturns[:, r] = torch.where(declare, torch.zeros_like(self.r_warturns[:, r]), self.r_warturns[:, r])
            # P5/S2 (C-13): the controlled rival's peace is no longer free —
            # it pays the player's exact schedule from r_treasury (mask
            # prices it; the apply re-validates affordability).
            rrp = self.rules.rivals
            pcost_c = rrp.get("peaceGold0", 150) + rrp.get("peaceGoldSlope", 10) * self.r_warturns[:, r].to(torch.float64)
            peace = (
                (w == Rw) & self.controlled[:, r] & self.r_atwar[:, r]
                & (self.r_warturns[:, r] >= rrp.get("warMinTurns", 14))
                & self._afford(self.r_treasury[:, r], pcost_c)
            )
            if bool(peace.any()):
                self.r_treasury[:, r] = torch.where(peace, self.r_treasury[:, r] - pcost_c, self.r_treasury[:, r])
                self.r_atwar[:, r] = self.r_atwar[:, r] & ~peace
                self.r_warturns[:, r] = torch.where(peace, torch.zeros_like(self.r_warturns[:, r]), self.r_warturns[:, r])
                self.r_peaceturns[:, r] = torch.where(peace, torch.zeros_like(self.r_peaceturns[:, r]), self.r_peaceturns[:, r])
        if production is None:
            return
        for j in range(min(int(production.shape[1]), self.RC)):
            a = production[:, j].to(torch.long)
            act = (a >= 0) & self.controlled[:, r] & self.rc_alive[:, r, j] & (self.rc_current[:, r, j] == -1)
            if not bool(act.any()):
                continue
            # buildings 0..NB-1
            is_b = act & (a < NBn)
            if bool(is_b.any()):
                bi = a.clamp(min=0, max=NBn - 1)
                self.rc_current[:, r, j] = torch.where(is_b, 1 + self.NU + nS + bi, self.rc_current[:, r, j])
                self.rc_cost[:, r, j] = torch.where(is_b, rdv.b_cost.gather(0, bi).double(), self.rc_cost[:, r, j])
                self.rc_progress[:, r, j] = torch.where(is_b, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
            # settler = NB
            is_s = act & (a == NBn)
            if bool(is_s.any()):
                n_cities = self.rc_alive[:, r].sum(dim=1)
                # P5/S2 key fix: the exporter ships "settlerPer" — the old
                # "settlerStep" lookup ALWAYS fell to its default (same value
                # 40, so dormant; now it tracks the export like every knob).
                settle_cost = js_round(rr.get("settlerBase", 48) + rr.get("settlerPer", 18) * (n_cities.double() - 1).clamp(min=0))
                self.rc_current[:, r, j] = torch.where(is_s, torch.zeros_like(self.rc_current[:, r, j]), self.rc_current[:, r, j])
                self.rc_cost[:, r, j] = torch.where(is_s, settle_cost, self.rc_cost[:, r, j])
                self.rc_progress[:, r, j] = torch.where(is_s, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
            # VP-G2: purchase codes live past the base width — buildings
            # base..base+NB-1, (settler col skipped), units follow. Purchases
            # bypass the idle gate and revalidate LIVE (treasury may have
            # drained earlier in this same slot walk — the V-P1 coupling).
            base_w = NBn + 2 + self.NU + nS
            pa = production[:, j].to(torch.long)
            mult = self.rules.gold_purchase_mult
            can_p = (pa >= base_w) & self.controlled[:, r] & self.rc_alive[:, r, j]
            if bool(can_p.any()):
                pb_i = pa - base_w
                is_pb = can_p & (pb_i >= 0) & (pb_i < NBn)
                if bool(is_pb.any()):
                    bi = pb_i.clamp(min=0, max=NBn - 1)
                    cost_b = rdv.b_cost.gather(0, bi).double() * mult
                    ok_now = is_pb & ~self.rc_bldg[torch.arange(self.B, device=self.device), r, j].gather(1, bi.unsqueeze(1)).squeeze(1) & self._afford(self.r_treasury[:, r], cost_b)
                    # P5/S8 (C-23): full re-validation — the district
                    # prerequisite (completed) and required buildings, the
                    # TS purchaseBuilding buildingCompletable gates.
                    reqd_i = rdv.b_req_district.gather(0, bi)
                    reg_i = self.rc_dist_tile[:, r, j].gather(1, reqd_i.clamp(min=0).unsqueeze(1)).squeeze(1)
                    d_ok = (reqd_i < 0) | ((reg_i >= 0) & self.district_complete.gather(1, reg_i.clamp(min=0).unsqueeze(1)).squeeze(1))
                    rb_ok = torch.ones_like(d_ok)
                    for bi2, reqs in enumerate(self.rules.b_req_buildings):
                        if reqs:
                            m2 = bi == bi2
                            if bool(m2.any()):
                                have2 = self.rc_bldg[:, r, j][:, torch.tensor(reqs, device=self.device, dtype=torch.long)].any(dim=1)
                                rb_ok = rb_ok & (~m2 | have2)
                    ok_now = ok_now & d_ok & rb_ok
                    if bool(ok_now.any()):
                        rows_ = ok_now.nonzero(as_tuple=True)[0]
                        self.rc_bldg[rows_, r, j, bi[rows_]] = True
                        if self._walls_bidx >= 0:  # AUDIT B-1
                            wm = rows_[bi[rows_] == self._walls_bidx]
                            if len(wm) > 0:
                                self.rc_outer_hp[wm, r, j] = self._walls_hp
                        self.r_treasury[:, r] = torch.where(ok_now, self.r_treasury[:, r] - cost_b, self.r_treasury[:, r])
                # P5/S2 (C-13): buy a SETTLER — the rival has no settler bank,
                # so the purchase founds immediately via the same site scan a
                # completed settler runs; no valid site = refund (the TS
                # spawnUnit-refund convention).
                is_ps2 = can_p & (pb_i == NBn)
                if bool(is_ps2.any()):
                    rr2 = self.rules.rivals
                    n_cities2 = self.rc_alive[:, r].sum(dim=1)
                    s_cost2 = (rr2.get("settlerBase", 48) + rr2.get("settlerPer", 18) * (n_cities2.double() - 1).clamp(min=0)) * mult
                    ok_ps = is_ps2 & (n_cities2 < rr2.get("maxCities", 6)) & self._afford(self.r_treasury[:, r], s_cost2)
                    if bool(ok_ps.any()):
                        self._rival_try_found(r, ok_ps)
                        founded2 = ok_ps & (self.rc_alive[:, r].sum(dim=1) > n_cities2)
                        self.r_treasury[:, r] = torch.where(founded2, self.r_treasury[:, r] - s_cost2, self.r_treasury[:, r])
                pu_i = pb_i - (NBn + 1)
                is_pu = can_p & (pu_i >= 0) & (pu_i < self.NU)
                if bool(is_pu.any()):
                    ui = pu_i.clamp(min=0, max=self.NU - 1)
                    cost_u = self._p_cost.gather(0, ui).double() * mult
                    if self._builder_idx >= 0:
                        # P4/D-10: bought rival builders price off THEIR escalator
                        rb_n = self.r_builders_trained[:, r] + (self.rc_current[:, r] == self._builder_idx + 1).sum(dim=1)
                        cost_u = torch.where(ui == self._builder_idx, self._builder_cost(rb_n).double() * mult, cost_u)
                    ok_now = is_pu & self._afford(self.r_treasury[:, r], cost_u)
                    if bool(ok_now.any()):
                        is_bldr = ok_now & (self._p_charges[ui] > 0)
                        is_mil = ok_now & ~is_bldr
                        ctr = self.rc_center[:, r, j].clamp(min=0)
                        # P5/S8 (C-23): deduct only where the spawn LANDED —
                        # the TS spawnUnit-refund convention (the settler
                        # branch above already refunds; units now match).
                        landed = torch.zeros_like(ok_now)
                        if bool(is_mil.any()):
                            landed = landed | self._spawn_rival(is_mil, ctr, ui, r)
                        if bool(is_bldr.any()):
                            landed_civ = self._spawn_rival_civ(is_bldr, ctr, r)
                            landed = landed | landed_civ
                            self.r_builders_trained[:, r] = self.r_builders_trained[:, r] + landed_civ.long()  # P4/D-10
                        self.r_treasury[:, r] = torch.where(landed, self.r_treasury[:, r] - cost_u, self.r_treasury[:, r])
            # idle = NB+1 (explicit no-op); units NB+2..NB+1+NU
            is_u = act & (a >= NBn + 2) & (a < NBn + 2 + self.NU)
            if bool(is_u.any()):
                ui = (a - (NBn + 2)).clamp(min=0, max=self.NU - 1)
                cost_q = self._p_cost.gather(0, ui).double()
                if self._builder_idx >= 0:
                    # P4/D-10: queued rival builders lock the escalated price
                    # (earlier j-slots' queues are already in rc_current).
                    rb_n = self.r_builders_trained[:, r] + (self.rc_current[:, r] == self._builder_idx + 1).sum(dim=1)
                    cost_q = torch.where(ui == self._builder_idx, self._builder_cost(rb_n).double(), cost_q)
                self.rc_current[:, r, j] = torch.where(is_u, ui + 1, self.rc_current[:, r, j])
                self.rc_cost[:, r, j] = torch.where(is_u, cost_q, self.rc_cost[:, r, j])
                self.rc_progress[:, r, j] = torch.where(is_u, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
            # scaffold districts: NB+2+NU..
            is_d = act & (a >= NBn + 2 + self.NU) & (a < NBn + 2 + self.NU + nS)
            if bool(is_d.any()) and self.districts_on and self._scaffold:
                # P4/D-15 sweep: this CONTROLLED-rival site still carried the
                # pre-D-8 averaged formula (off the parity path — controlled
                # is empty in the gates, so no gate could catch it). Now the
                # same floor(base·(1+9·max(t%, c%))) as every other site,
                # from THIS rival's trees.
                dcp = self.rules.district_cost
                t_pct_r = self.r_techs[:, r].sum(dim=1).double() / float(rdv.t_cost.shape[0])
                c_pct_r = self.r_civics[:, r].sum(dim=1).double() / float(rdv.c_cost.shape[0])
                d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct_r, c_pct_r)))
                for si, (di, utech, plc) in enumerate(self._scaffold):
                    want_d = is_d & (a == NBn + 2 + self.NU + si)
                    if not bool(want_d.any()):
                        continue
                    # P4/D-8: discount read BEFORE the placement registers
                    disc = self._rival_district_discounted(r, di)
                    d_cost_si = torch.where(disc, torch.floor(d_cost * 0.6), d_cost)
                    placed = self._place_district_rival(r, j, di, want_d, plc)
                    if bool(placed.any()):
                        self.rc_current[:, r, j] = torch.where(placed, torch.full_like(self.rc_current[:, r, j], 1 + self.NU + si), self.rc_current[:, r, j])
                        self.rc_cost[:, r, j] = torch.where(placed, d_cost_si, self.rc_cost[:, r, j])
                        self.rc_progress[:, r, j] = torch.where(placed, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])

    def _rival_job_mask(self, r: int, techs: torch.Tensor | None = None, civics: torch.Tensor | None = None) -> torch.Tensor:
        """[B, T] tiles a rival-r builder could work NOW: civ-owned and
        either BUILDABLE (unimproved, un-districted, not a center — FARM
        baseline with the hillFarms civic gate, MINE/LUMBER on the rival's
        unlock techs, and since A-13 the resource roster QUARRY/PASTURE/
        CAMP/PLANTATION/OIL_WELL on THEIR unlock techs) or PILLAGED (A-13
        repair jobs — rivalHasJob's t.pillaged branch consults no validity
        gates; pillage implies a live improvement implies land, so no water
        term is needed). Mirrors rivalHasJob under the rival's unlocks."""
        B = self.B
        # TS computes rivalUnlocks ONCE at phase top (pre-research-advance);
        # callers past the advance must pass that snapshot or diverge on the
        # exact turn an unlock completes (seed 9274 t100).
        tk = techs if techs is not None else self.r_techs[:, r]
        cv = civics if civics is not None else self.r_civics[:, r]
        farm = self.farm_flat | (self.farm_hill & cv[:, self._hillfarms_civic].unsqueeze(1)) if self._hillfarms_civic >= 0 else self.farm_flat
        ok = farm
        if self.MINE >= 0 and self._mine_unlock_tech >= 0:
            ok = ok | (self.mine_ok & tk[:, self._mine_unlock_tech].unsqueeze(1))
        if self.LUMBER >= 0 and self._lumber_unlock_tech >= 0:
            ok = ok | (self.lumber_ok & tk[:, self._lumber_unlock_tech].unsqueeze(1))
        # A-13: grown-roster resource tiles (rq >= 3; rq 0-2 resource tiles
        # already ride the fa_f/mi planes with the right gates).
        new_res = self.res_imp >= 3
        if bool(new_res.any()):
            unlocked = tk.gather(1, self._imp_unlock[self.res_imp.clamp(min=0)].clamp(min=0))
            ok = ok | (new_res & unlocked)
        owned = self.rival_at == r
        return (
            owned
            & (self.improvement < 0)
            & (self.district < 0)
            & (self.built_wonder < 0)  # A-8 gate-catch: an in-flight wonder pave refuses jobs (validImprovementsIn twin)
            & (self.rvcity_at < 0)
            & ok
        ) | (owned & self.pillaged)

    def _spawn_rival_civ(self, mask: torch.Tensor, at_tile: torch.Tensor, civ: int) -> torch.Tensor:
        """C1-B5b: spawn a rival BUILDER — the civilian twin of _spawn_rival
        (rciv blocking; charges seeded from the roster like the player's).
        Returns the LANDED mask (P5/S8: purchases refund on no spawn spot)."""
        if not bool(mask.any()):
            return torch.zeros_like(mask)
        cand7 = torch.cat([at_tile.unsqueeze(1), self.neigh[at_tile.clamp(min=0)]], dim=1)
        okc = cand7.clamp(min=0)
        ok7 = (cand7 >= 0) & self.passable.gather(1, okc) & ~self._blocked_for(cand7, "rciv", civ=civ)
        first = torch.where(ok7, torch.arange(7, device=self.device), 7).min(dim=1).values
        spot = cand7.gather(1, first.clamp(max=6).unsqueeze(1)).squeeze(1)
        can = mask & (first < 7)
        if not bool(can.any()):
            return can
        rows = can.nonzero(as_tuple=True)[0]
        slot = self.v_next[rows]
        assert int(slot.max()) < U_MAX, "rival slot pool exhausted — raise U_MAX"
        self.v_alive[rows, slot] = True
        self.v_civ[rows, slot] = civ
        self.v_type[rows, slot] = self._builder_idx
        self.v_tile[rows, slot] = spot[rows]
        self.v_hp[rows, slot] = self.rules.combat.get("unitHp", 100)
        self.v_fortify[rows, slot] = 0  # B-5: civilian never fortifies; keep the (reclaimed) slot clean
        self.v_charges[rows, slot] = self._p_charges[self._builder_idx]
        self.rvciv_at[rows, spot[rows]] = slot
        self.v_next[rows] += 1
        return can

    def _rival_builder_actions(self, r: int, active: torch.Tensor, techs0: torch.Tensor | None = None, civics0: torch.Tensor | None = None) -> None:
        """C1-B5b: mirrors rivalBuilderActions — per builder (slot order =
        units order): REPAIR the owned pillaged tile underfoot first (A-13:
        builderRepair semantics — no charge, the turn is spent), else build
        the best-gain valid improvement HERE (gains are constants per option
        since improvement yields are flat adds; strict > keeps the
        validImprovementsIn order on ties; a resource tile offers exactly
        its resource's improvement), else single-step toward the nearest
        job (dist·(T+1)+idx target key; neighbor strictly closer,
        rciv-blocked, ties to direction order). Zero RNG."""
        B, T, dev = self.B, self.T, self.device
        gains = self.rules.rivals.get("builder", {}).get("gains", [1.0, 1.0, 1.0])
        opts = [(self.FARM, float(gains[0])), (self.MINE, float(gains[1])), (self.LUMBER, float(gains[2]))]
        cand = self.v_alive & (self.v_civ == r) & (self.v_type == self._builder_idx) & (self.v_charges > 0)
        if not bool(cand.any()):
            return
        for u in cand.any(dim=0).nonzero(as_tuple=True)[0].tolist():
            act = cand[:, u] & active
            if not bool(act.any()):
                continue
            here = self.v_tile[:, u].clamp(min=0)
            jobm = self._rival_job_mask(r, techs=techs0, civics=civics0)
            # A-13: REPAIR first — TS checks bt.pillaged && owns(bt) before
            # any build/walk; no charge is spent, movesLeft goes 0 (v_acted),
            # and the yield change bumps the version.
            own_h = self.rival_at.gather(1, here.unsqueeze(1)).squeeze(1) == r
            pill_h = self.pillaged.gather(1, here.unsqueeze(1)).squeeze(1)
            rep = act & own_h & pill_h
            if bool(rep.any()):
                rows = rep.nonzero(as_tuple=True)[0]
                self.pillaged[rows, here[rows]] = False
                self.v_acted[rows, u] = True
                self._eff_version += 1
                act = act & ~rep
                if not bool(act.any()):
                    continue
            here_ok = jobm.gather(1, here.unsqueeze(1)).squeeze(1)
            build = act & here_ok
            if bool(build.any()):
                # per-tile validity of each option HERE (unlock-gated like the mask)
                tk0 = techs0 if techs0 is not None else self.r_techs[:, r]
                cv0 = civics0 if civics0 is not None else self.r_civics[:, r]
                farm_h = (self.farm_flat | (self.farm_hill & cv0[:, self._hillfarms_civic].unsqueeze(1))).gather(1, here.unsqueeze(1)).squeeze(1)
                mine_h = (self.mine_ok.gather(1, here.unsqueeze(1)).squeeze(1) & tk0[:, self._mine_unlock_tech]) if self.MINE >= 0 and self._mine_unlock_tech >= 0 else torch.zeros(B, dtype=torch.bool, device=dev)
                lum_h = (self.lumber_ok.gather(1, here.unsqueeze(1)).squeeze(1) & tk0[:, self._lumber_unlock_tech]) if self.LUMBER >= 0 and self._lumber_unlock_tech >= 0 else torch.zeros(B, dtype=torch.bool, device=dev)
                valid = [farm_h, mine_h, lum_h]
                # C1-B5b-iii parity: TS scores each option as Δ tileScore(tileYields, 'balanced')
                # = (the yield the improvement adds) · focus_base, and focus_base ([2,2,1,1,1,1])
                # is NOT the exported BALANCED_WEIGHTS gains (a different set — food 1 vs 2). Compute
                # it here: FARM adds catalog food + THIS tile's farm-adjacency (>=2 adjacent FARMs,
                # not whether the tile is already a farm); MINE adds catalog prod + the rival's own
                # mine boost; LUMBER its flat catalog prod. Ties keep FARM > MINE > LUMBER (opts order).
                # AUDIT G-1: the GAIN terms (tier/boost) ride CURRENT research —
                # TS builds the Δ ctx from modifiersFromResearch(rival.research)
                # at CALL time, after this turn's completions; only VALIDITY
                # keeps the tk0/cv0 phase-top snapshot (rivalUnlocks, the
                # seed-9274 catch). Snapshot gains flipped MINE-vs-FARM on the
                # exact turn a boost landed (seed 9196 t248).
                wt = self.rules_dev.focus_base.double()
                tier_r = self._farmadj_tier(self.r_civics[:, r], self.r_techs[:, r]).double()
                nbc = self.neigh.clamp(min=0)
                fimp = self.improvement == self.FARM
                adj2 = ((fimp[:, nbc] & (self.neigh >= 0).unsqueeze(0)).sum(dim=2) >= 2).double()  # [B,T]
                adj_h = adj2.gather(1, here.unsqueeze(1)).squeeze(1)  # [B] hypothetical FARM's adjacency
                mboost = (self.r_techs[:, r][:, self._mine_boost_tech].double() * self._mine_boost_amt).sum(dim=1) if self._mine_boost_tech.numel() > 0 else torch.zeros(B, dtype=torch.float64, device=dev)
                # A-8 hunt side-find: a bare tile CAN carry a lingering
                # pillaged flag (a chop clears the LUMBER improvement, not the
                # flag) — TS tileYields suppresses improvement yields on
                # pillaged tiles (yields.ts:49), so EVERY option's Δ-gain is 0
                # there and the strict-> tie-break picks FARM. Zero the gains
                # the same way; the build itself still clears the flag.
                unpil = (~self.pillaged.gather(1, here.unsqueeze(1)).squeeze(1)).double()
                farm_g = (self._farm_food + tier_r * adj_h) * float(wt[0]) * unpil
                mine_g = (self._mine_prod + mboost) * float(wt[1]) * unpil
                lum_g = torch.full((B,), self._lumber_prod * float(wt[1]), dtype=torch.float64, device=dev) * unpil
                opt_g = [farm_g, mine_g, lum_g]
                pick = torch.full((B,), -1, dtype=torch.long, device=dev)
                best_g = torch.full((B,), float("-inf"), dtype=torch.float64, device=dev)
                for (imp_i, _g), v, og in zip(opts, valid, opt_g):
                    if imp_i < 0:
                        continue
                    better = v & (og > best_g)
                    pick = torch.where(better, torch.full_like(pick, imp_i), pick)
                    best_g = torch.where(better, og, best_g)
                # A-13: a grown-roster resource tile offers exactly its
                # resource's improvement (validImprovementsIn's resource
                # branch), gated by the rival's own unlock tech; gain =
                # catalog yields · focus_base (the Δ-gain ctx is
                # modifiersFromResearch — no belief terms). Disjoint from
                # farm/mine/lumber: rq >= 3 tiles carry none of those
                # planes, so option order can't matter.
                rq_h = self.res_imp.gather(1, here.unsqueeze(1)).squeeze(1)
                res_v = rq_h >= 3
                if bool(res_v.any()):
                    res_v = res_v & tk0.gather(1, self._imp_unlock[rq_h.clamp(min=0)].clamp(min=0).unsqueeze(1)).squeeze(1)
                    res_g = (self._imp_yields[rq_h.clamp(min=0)].double() * wt).sum(dim=1) * unpil
                    better = res_v & (res_g > best_g)
                    pick = torch.where(better, rq_h, pick)
                    best_g = torch.where(better, res_g, best_g)
                rows = (build & (pick >= 0)).nonzero(as_tuple=True)[0]
                if len(rows):
                    self.improvement[rows, here[rows]] = pick[rows]
                    self.pillaged[rows, here[rows]] = False
                    self.v_charges[rows, u] -= 1
                    self.v_acted[rows, u] = True  # P4/D-2
                    self._eff_version += 1
                    spent = torch.zeros(B, dtype=torch.bool, device=dev)
                    spent[rows] = self.v_charges[rows, u] <= 0
                    if bool(spent.any()):
                        dr = spent.nonzero(as_tuple=True)[0]
                        self.v_alive[dr, u] = False
                        self.rvciv_at[dr, here[dr]] = -1
                continue_mask = act & ~build
            else:
                continue_mask = act
            walk = continue_mask & jobm.any(dim=1)
            if not bool(walk.any()):
                continue
            arT = torch.arange(T, device=dev, dtype=torch.float64)
            tkey = torch.where(jobm, self.pair_dist[here].double() * (T + 1) + arT, torch.full((B, T), float("inf"), dtype=torch.float64, device=dev))
            tgt = tkey.argmin(dim=1)
            # AUDIT A-8: the walk to the (fixed) nearest job runs on REAL MP
            # — per step: the free neighbor strictly closer (rciv-blocked,
            # ties to direction order), walkPath's charge (1 + tmove//3 + 3
            # per river crossing); a full-MP unit always affords its first
            # step. Any step still gates the D-2 heal via v_acted.
            arange6 = torch.arange(6, device=dev)
            full_mp = self._p_moves[self.v_type[:, u].clamp(min=0, max=self.NU - 1)]
            mp = full_mp.clone()
            cur = here.clone()
            d_cur = self.pair_dist[here, tgt].to(torch.long)
            moving = walk
            while bool(moving.any()):
                curc = cur.clamp(min=0)
                nb = self.neigh[curc]  # [B, 6]
                nbc = nb.clamp(min=0)
                step_ok = (nb >= 0) & self.passable.gather(1, nbc) & ~self._blocked_for(nb, "rciv", civ=r)
                d_nb = self.pair_dist[tgt.unsqueeze(1), nbc].to(torch.long)
                skey = torch.where(step_ok, d_nb * 8 + arange6, 10**9)
                best = skey.min(dim=1).values
                dir_i = (best % 8).clamp(max=5)
                dest = nb.gather(1, dir_i.unsqueeze(1)).squeeze(1)
                cost = (
                    1
                    + torch.div(self.tmove.gather(1, dest.clamp(min=0).unsqueeze(1)).squeeze(1), 3, rounding_mode="floor")
                    + 3 * ((self.river_mask.gather(1, curc.unsqueeze(1)).squeeze(1) >> dir_i) & 1)
                )
                mv = (
                    moving
                    & (best < 10**9)
                    & (torch.div(best, 8, rounding_mode="floor") < d_cur)
                    & ((mp >= cost) | (mp >= full_mp))
                )
                if not bool(mv.any()):
                    break
                rows = mv.nonzero(as_tuple=True)[0]
                self.rvciv_at[rows, cur[rows]] = -1
                self.rvciv_at[rows, dest[rows]] = u
                self.v_tile[rows, u] = dest[rows]
                self.v_acted[rows, u] = True  # P4/D-2
                self._clear_camp_at(mv, dest, civ=self.v_civ[:, u])  # P5/S7 (C-3): mirrors walkPath's any-unit clear
                mp = torch.where(mv, (mp - cost).clamp(min=0), mp)
                # B-3 ZOC: the builder (a civilian mover) halts adjacent to a
                # hostile military unit too — only the EXERTER must be military.
                mp = torch.where(mv & self._in_enemy_zoc(dest, self.r_atwar[:, r]), torch.zeros_like(mp), mp)
                d_cur = torch.where(mv, torch.div(best, 8, rounding_mode="floor"), d_cur)
                cur = torch.where(mv, dest, cur)
                moving = mv & (mp > 0)

    def _rcy_globals(self) -> dict:
        """D-2: the r-independent planes that _rival_city_yields and
        _rival_border_growth used to rebuild per (r, j) call (~144×/turn
        with the trace + leader): strip-adjusted food/production, the
        strip-adjusted static columns, and the balanced-score sum of the
        four static columns. Keyed on _eff_version like every derived
        cache; research completions bump it (both civs), so a mid-phase
        tech/civic completion invalidates the per-r entries before the
        trace re-reads that civ. Cached tensors are the IDENTICAL values a
        fresh compute produces (same ops, same order) — float association
        is untouched."""
        if self._rcy_cache is not None and self._rcy_cache[0] == self._eff_version:
            return self._rcy_cache[1]
        fs = self.feat_stripped.to(self.dtype)
        f_base = (self._eff_food() if (self.disasters or self.improvements_on) else self.tile_yields[:, :, 0]) - self.feat_yields[:, :, 0] * fs
        p_plane = self._neutral_prod() - self.feat_yields[:, :, 1] * fs
        ty_oth = self.tile_yields - self.feat_yields * fs.unsqueeze(-1)  # strip-adjusted static (cols 2-5)
        # AUDIT A-13: CAMP/PLANTATION catalog gold joins the static columns
        # (TS tileYields adds improvement yields in every context; pillage
        # suspends them). Cols 0/1 stay untouched — food/production ride
        # f_base/p_plane, adding here would double-count.
        if self.improvements_on:
            live_imp = ((self.improvement >= 0) & ~self.pillaged).to(self.dtype)
            ty_oth[:, :, 2:] = ty_oth[:, :, 2:] + self._imp_yields[self.improvement.clamp(min=0), 2:] * live_imp.unsqueeze(-1)
        w = self.rules_dev.focus_base.double()
        oth_score = (ty_oth[:, :, 2:].double() * w[2:].view(1, 1, 4)).sum(dim=2)  # [B, T]
        g = {"fs": fs, "f_base": f_base, "p_plane": p_plane, "ty_oth": ty_oth, "oth_score": oth_score, "w": w, "f_r": {}}
        self._rcy_cache = (self._eff_version, g)
        return g

    def _rcy_food_plane(self, r: int, g: dict) -> torch.Tensor:
        """D-2: rival r's food plane — f_base plus ITS OWN farm-adjacency
        (Feudalism/Replaceable Parts tier × the shared qualifying set)."""
        if r in g["f_r"]:
            return g["f_r"][r]
        f_plane = g["f_base"]
        if self.improvements_on:
            tier_r = self._farmadj_tier(self.r_civics[:, r], self.r_techs[:, r])
            if bool((tier_r > 0).any()):
                f_plane = f_plane + self._farmadj_qual().to(self.dtype) * tier_r.unsqueeze(1).to(self.dtype)
        g["f_r"][r] = f_plane
        return f_plane

    def _r_has_beliefs(self, r: int) -> bool:
        """A-7 fast path: most civs/turns carry no claimed beliefs (a founder
        implies a follower, so pantheon|follower covers all three)."""
        return self._bel_any and bool(((self.r_pantheon[:, r] >= 0) | (self.r_follower[:, r] >= 0)).any())

    def _bel_add(self, key: str, r: int) -> torch.Tensor:
        """A-7: rival r's summed ADDITIVE effect rows (pantheon + follower +
        founder; unclaimed ids land on the zero pad row). G1: memoised on
        _bel_version — the only mutable inputs are r_pantheon/r_follower/
        r_founder[:,r], which change solely at the belief-claim sites (each bumps
        _bel_version) and restore/reset (ditto). All consumers read-only."""
        if self._bel_add_memo is None or self._bel_add_memo[0] != self._bel_version:
            self._bel_add_memo = (self._bel_version, {})
        d = self._bel_add_memo[1]
        mk = ("add", key, r)
        v = d.get(mk)
        if v is None:
            v = (
                self._bel["pan"][key][self.r_pantheon[:, r] + 1]
                + self._bel["fol"][key][self.r_follower[:, r] + 1]
                + self._bel["fou"][key][self.r_founder[:, r] + 1]
            )
            d[mk] = v
        return v

    def _bel_mul(self, key: str, r: int) -> torch.Tensor:
        """A-7: the MULTIPLICATIVE twin (pad row = 1.0) — border/growth."""
        return (
            self._bel["pan"][key][self.r_pantheon[:, r] + 1]
            * self._bel["fol"][key][self.r_follower[:, r] + 1]
            * self._bel["fou"][key][self.r_founder[:, r] + 1]
        )

    def _bel_add_pf(self, key: str, r: int) -> torch.Tensor:
        """B-18: the pantheon + FOUNDER additive rows ONLY (NO follower) — the
        per-civ remainder after the follower channel moves to the per-city
        followed-religion lookup. Used for bldgY (founder Stewardship keeps its
        Library/University/Market/Bank adds per-civ). G1: memoised on
        _bel_version, same shared memo as _bel_add (disjoint fn tag)."""
        if self._bel_add_memo is None or self._bel_add_memo[0] != self._bel_version:
            self._bel_add_memo = (self._bel_version, {})
        d = self._bel_add_memo[1]
        mk = ("pf", key, r)
        v = d.get(mk)
        if v is None:
            v = (
                self._bel["pan"][key][self.r_pantheon[:, r] + 1]
                + self._bel["fou"][key][self.r_founder[:, r] + 1]
            )
            d[mk] = v
        return v

    def _follower_by_rel(self) -> torch.Tensor:
        """B-18: [B, O] follower-belief id per religion id (0 = player, always
        -1 as the player never founds in-gate; i+1 = rival i's r_follower). Pad
        id -1 gathers the neutral row 0 in the follower tables."""
        fbr = torch.full((self.B, self._O), -1, dtype=torch.long, device=self.device)
        if self.R > 0:
            fbr[:, 1:1 + self.R] = self.r_follower[:, :self.R]
        return fbr

    def _follower_id_for(self, rel: torch.Tensor) -> torch.Tensor:
        """B-18: map religion ids `rel` (any shape [B, ...], -1 = none) to the
        follower-belief id of that religion's founding civ (-1 = none/pad)."""
        fbr = self._follower_by_rel()  # [B, O]
        flat = rel.reshape(self.B, -1)
        fid = fbr.gather(1, flat.clamp(min=0)).reshape_as(rel)
        return torch.where(rel >= 0, fid, torch.full_like(fid, -1))

    def _fol_tab(self, key: str, fol_id: torch.Tensor) -> torch.Tensor:
        """B-18: gather the FOLLOWER-belief effect table `key` per element of
        `fol_id` (-1 pad -> neutral row 0). Result shape = fol_id.shape + the
        table's trailing dims."""
        return self._bel["fol"][key][fol_id + 1]

    def _city_rel_player(self) -> torch.Tensor:
        """B-18: the religion id each PLAYER city draws its follower belief from
        — followedReligion when LIVE, else the player religion id 0 (INERT)."""
        if self._b18_couple:
            return self.city_followed
        return torch.zeros(self.B, self.C, dtype=torch.long, device=self.device)

    def _rc_rel(self, r: int) -> torch.Tensor:
        """B-18: the religion id each rival-r city [B, RC] draws its follower
        belief from — rc_followed when LIVE, else the owner religion id r+1."""
        if self._b18_couple:
            return self.rc_followed[:, r]
        return torch.full((self.B, self.RC), r + 1, dtype=torch.long, device=self.device)

    def _belief_feat_plane(self, r: int) -> torch.Tensor:
        """A-7: [B, T, 6] belief TILE adds — featureYields at tiles with a
        LIVE feature (fid >= 0 and not stripped) plus improvementOnResource
        at unpillaged improvements on a LIVE resource (category = the res
        priority code; the A-7 hunt's catch — strategic MINEs exist today)
        plus, since A-13, improvementYields at unpillaged improvements
        (yields.ts:49-53 — God of the Open Sky pastures etc. are buildable
        now). TS adds all three inside tileYields, so they ride every
        consumer: worked-tile picks and yields, scores, the border ySum.
        G1: cached single-slot on (r, _eff_version, _bel_version). Belief inputs
        bump _bel_version (claims/restore); tile inputs (feat_id/feat_stripped/
        improvement/pillaged/res_stripped/res_priority) bump _eff_version at their
        mutation sites. All consumers read-only (2532/5631/6097)."""
        key = (r, self._eff_version, self._bel_version)
        if self._belief_feat_cache is not None and self._belief_feat_cache[0] == key:
            return self._belief_feat_cache[1]
        featA = self._bel_add("featY", r)  # [B, nFeat, 6]
        plane = featA.gather(1, self.feat_id.clamp(min=0).unsqueeze(2).expand(-1, -1, 6))
        live = ((self.feat_id >= 0) & ~self.feat_stripped).unsqueeze(2).to(plane.dtype)
        plane = plane * live
        impA = self._bel_add("impRes", r)  # [B, 4, 6] rows by category code
        cat = torch.where(
            (self.improvement >= 0) & ~self.pillaged & ~self.res_stripped,
            self.res_priority.clamp(max=3),
            torch.zeros_like(self.res_priority),
        )  # 0 = no add (pad row)
        plane = plane + impA.gather(1, cat.unsqueeze(2).expand(-1, -1, 6))
        # A-13: belief improvementYields, gathered by the tile's improvement
        # (unpillaged; no resource condition — TS keys on the improvement
        # alone). The gather pad (idx 0 = FARM) is masked dead by imp_live.
        impY = self._bel_add("impY", r)  # [B, nImp, 6]
        imp_live = ((self.improvement >= 0) & ~self.pillaged).unsqueeze(2).to(plane.dtype)
        plane = plane + impY.gather(1, self.improvement.clamp(min=0).unsqueeze(2).expand(-1, -1, 6)) * imp_live
        self._belief_feat_cache = (key, plane)
        return plane

    def _rival_route_income(self, r: int) -> torch.Tensor | None:
        """AUDIT A-11/A-12b: per-slot ORIGIN income from this civ's unraided
        routes — [B, RC, 6] double in engine yield order (food, prod, gold,
        sci, cul, faith), or None when the civ holds no routes batch-wide.
        Domestic routes pay routeYields' 1 + floor(destCompletedSpecialty/2)
        to food AND production; a CS route (dest encoded -(2+csIdx) in
        r_routes) pays csRouteGold to gold + csRouteSpec to the CS type's
        specialty column (_cs_yidx), gated on cs_alive (a captured CS is
        removed in TS; its routes are pruned at capture, this gate is the
        mirror for the same-turn read). Mirrors the rivalCityYields route
        loop: dest resolved by rc id among LIVING cities, a route is
        suspended while a barbarian (always) or player unit (at war) sits
        within 3 of either endpoint.
        G1: cached single-slot on (turn, r, _eff_version, _rp_kill_version). Reads
        r_routes/rc_id/rc_alive/rc_center/rc_dist_tile/r_atwar[:,r] (all constant
        through the economy loop for this r — trade/war run outside it), plus
        district_complete (its mid-loop completions bump _eff_version, so a later
        origin's raised dest bonus recomputes — the old 'NOT cacheable' note) and
        u_alive/p_alive (the strike-kill at 7714-7717 bumps _rp_kill_version). All
        other route(r) callers (rival_empire_score/rival_score via leader/domination/
        trace) run after the full rival phase and iterate r strictly sequentially,
        so with R>=2 the single slot is always overwritten by a different r before
        the same r is re-requested -> recompute against current state (gates R=3).
        Consumer reads only column j, read-only."""
        key = (self.turn, r, self._eff_version, self._rp_kill_version)
        if self._rival_route_cache is not None and self._rival_route_cache[0] == key:
            return self._rival_route_cache[1]
        rr = self.r_routes[:, r]  # [B, K, 2]
        act = rr[:, :, 0] >= 0
        if not bool(act.any()):
            self._rival_route_cache = (key, None)
            return None
        B, RC = self.B, self.RC
        ids = self.rc_id[:, r]  # [B, RC]
        alive = self.rc_alive[:, r]
        is_cs = rr[:, :, 1] <= -2  # A-12b: CS dest encoding -(2+csIdx)
        cs_s = (-rr[:, :, 1] - 2).clamp(min=0)  # [B, K] cs index (garbage where ~is_cs)
        fm = (rr[:, :, 0].unsqueeze(2) == ids.unsqueeze(1)) & alive.unsqueeze(1)  # [B, K, RC]
        dm = (rr[:, :, 1].unsqueeze(2) == ids.unsqueeze(1)) & alive.unsqueeze(1)
        has_from = fm.any(dim=2)
        has_dest = dm.any(dim=2)
        from_j = fm.long().argmax(dim=2)  # ids unique per civ → at most one hit
        dest_j = dm.long().argmax(dim=2)
        dt = self.rc_dist_tile[:, r]  # [B, RC, nD]
        comp = (dt >= 0) & self.district_complete.gather(1, dt.clamp(min=0).reshape(B, -1)).reshape_as(dt)
        spec = (comp & self._is_specialty.view(1, 1, -1)).sum(dim=2)  # [B, RC]
        per = (1 + spec // 2).double()  # [B, RC] — routeYields' food (= prod) column
        centers = self.rc_center[:, r].clamp(min=0)  # [B, RC]
        # hostile-near-endpoint [B, RC]: barbarians always; player units at war
        near = torch.zeros(B, RC, dtype=torch.bool, device=self.device)
        if self.u_tile.numel():
            d_b = self.pair_dist[centers.unsqueeze(2), self.u_tile.clamp(min=0).unsqueeze(1)] <= 3  # [B, RC, U]
            near = near | (d_b & self.u_alive.unsqueeze(1)).any(dim=2)
        if self.p_tile.numel():
            d_p = self.pair_dist[centers.unsqueeze(2), self.p_tile.clamp(min=0).unsqueeze(1)] <= 3  # [B, RC, P]
            near = near | ((d_p & self.p_alive.unsqueeze(1)).any(dim=2) & self.r_atwar[:, r].view(B, 1))
        inc = torch.zeros(B, RC * 6, dtype=torch.float64, device=self.device)
        # domestic legs
        raided_d = near.gather(1, from_j) | near.gather(1, dest_j)  # [B, K]
        pays_d = act & ~is_cs & has_from & has_dest & ~raided_d
        pd = pays_d.double()
        inc.scatter_add_(1, from_j * 6 + 0, per.gather(1, dest_j) * pd)
        inc.scatter_add_(1, from_j * 6 + 1, per.gather(1, dest_j) * pd)
        # CS legs (A-12b)
        if self.S > 0 and bool(is_cs.any()):
            S = self.S
            _tr = self.rules.trade or {}
            cs_gold = float(_tr.get("csRouteGold", 3))
            cs_spec = float(_tr.get("csRouteSpec", 1))
            csc = self.cs_center[:, :S].clamp(min=0)  # [B, S]
            near_cs = torch.zeros(B, S, dtype=torch.bool, device=self.device)
            if self.u_tile.numel():
                d_bc = self.pair_dist[csc.unsqueeze(2), self.u_tile.clamp(min=0).unsqueeze(1)] <= 3  # [B, S, U]
                near_cs = near_cs | (d_bc & self.u_alive.unsqueeze(1)).any(dim=2)
            if self.p_tile.numel():
                d_pc = self.pair_dist[csc.unsqueeze(2), self.p_tile.clamp(min=0).unsqueeze(1)] <= 3  # [B, S, P]
                near_cs = near_cs | ((d_pc & self.p_alive.unsqueeze(1)).any(dim=2) & self.r_atwar[:, r].view(B, 1))
            cs_ok = self.cs_alive[:, :S].gather(1, cs_s) & (cs_s < S)
            raided_c = near.gather(1, from_j) | near_cs.gather(1, cs_s)
            pays_c = act & is_cs & has_from & cs_ok & ~raided_c
            pc = pays_c.double()
            inc.scatter_add_(1, from_j * 6 + 2, cs_gold * pc)
            ycol = self._cs_yidx[:, :S].gather(1, cs_s)  # [B, K] specialty column per route
            inc.scatter_add_(1, from_j * 6 + ycol, cs_spec * pc)
        inc = inc.reshape(B, RC, 6)
        self._rival_route_cache = (key, inc)
        return inc

    def _rival_city_yields(self, r: int, j: int, mask: torch.Tensor, amen_yf: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor]:
        """Mirrors rivalCityYields (C1-B1: the REAL citizen path under
        defaultModifiers). Candidates = owned, citizen-workable (water yes,
        impassable no), non-district tiles in the work radius — district/
        center tiles are EXCLUDED like workableTiles, not zero-slot-wasted.
        Scored by the real tileScore ('balanced' focus_base weights over all
        six yields, ties to the lowest index), topped by population; the
        center adds its real floored yields (tileYieldsForCenter) instead of
        the old flat 3🍞/2⚙; the tech production scaler stays until B3b.
        Returns (food, production, science, culture) — the C1-B3 research
        streams ride the same worked-tile selection (C1-B3a).
        Food takes the disaster/farm tail; production takes improvement BASE
        yields via the defaultModifiers plane (never the player's boosts)."""
        rd = self.rules_dev
        center = self.rc_center[:, r, j]
        tiles = tiles_from_offsets(center, self._off3, self.W, self.H)  # [B, M]
        tc = tiles.clamp(min=0)
        # !t.district in TS: player districts, player centers AND rival
        # centers (founding sets tile.district) all disqualify a candidate.
        districted = (
            (self.center_at.gather(1, tc) >= 0)
            | (self.rvcity_at.gather(1, tc) >= 0)
            | (self.district.gather(1, tc) >= 0)
            | (self.built_wonder.gather(1, tc) >= 0)  # A-4: wonder tiles are not workable
        )
        valid = (
            (tiles >= 0)
            & (self.rival_at.gather(1, tc) == r)
            & self.work_ok.gather(1, tc)
            & (tiles != center.unsqueeze(1))
            & ~districted
        )
        # D-2: the strip-adjusted planes (V-H1 — TS reads tile.feature===null
        # live) and the per-r farm-adjacency plane come from the shared
        # _eff_version-keyed cache; the center path below applies its own
        # strip via fy_c, so it reads the raw plane untouched.
        g = self._rcy_globals()
        f_plane = self._rcy_food_plane(r, g)
        p_plane = g["p_plane"]
        ty_oth = g["ty_oth"]
        oth_sc = g["oth_score"]
        # A-7: this civ's belief featureYields join every tile column (TS
        # adds them inside tileYields) — worked picks, scores and yields all
        # see them; the score adds stay exact (dyadic ints, f64).
        _has_bel = self._r_has_beliefs(r)
        # B-18: this city's FOLLOWER-belief id (from its followed religion when
        # LIVE, else the owner religion r+1 = byte-identical to _bel_add's fol
        # term). pan/founder stay per-civ via _bel_add / _bel_add_pf.
        _fol_j = self._follower_id_for(self._rc_rel(r)[:, j]) if _has_bel else None
        if _has_bel:
            featP = self._belief_feat_plane(r)
            f_plane = f_plane + featP[:, :, 0]
            p_plane = p_plane + featP[:, :, 1]
            ty_oth = ty_oth + featP
            oth_sc = oth_sc + (featP[:, :, 2:].double() * g["w"][2:].view(1, 1, 4)).sum(dim=2)
        f = f_plane.gather(1, tc).double()
        p = p_plane.gather(1, tc).double()
        # C1-B5b-iii: the OWNER's mine boosts apply to worked tiles (and via
        # w[1] to the selection score); the neutral plane stays boost-free
        # for cross-owner reads.
        if self._mine_boost_tech.numel() > 0 and self.MINE >= 0:
            boost_r = (self.r_techs[:, r][:, self._mine_boost_tech].to(self.dtype) * self._mine_boost_amt).sum(dim=1).double()
            mine_here = (self.improvement.gather(1, tc) == self.MINE) & ~self.pillaged.gather(1, tc)
            p = p + mine_here.double() * boost_r.unsqueeze(1)
        # tileScore('balanced') = Σ yields · focus_base — food/production from
        # the dynamic (defaultModifiers) planes, the other four columns static.
        # All shipped yields are dyadic (asserted via _dyadic_fp over all six
        # columns), so this sum order is bit-equal to the TS per-key loop.
        w = g["w"]
        s = f * w[0] + p * w[1] + oth_sc.gather(1, tc)
        M = tiles.shape[1]
        # ties break by GLOBAL tile index (assignWorkedTiles' a.index - b.index),
        # NOT window position — the pre-B1 heuristic kept tilesWithin order.
        key = torch.where(valid, s * 1e6 - tiles.double(), torch.tensor(-1e18, dtype=torch.float64, device=self.device))
        kk = M  # C1-B5b-iii: the pop cap is retired — pops can exceed the old 12
        top_vals, top_idx = key.topk(kk, dim=1)
        take = (torch.arange(kk, device=self.device).unsqueeze(0) < self.rc_pop[:, r, j].unsqueeze(1)) & (top_vals > -1e17)
        f_sel = f.gather(1, top_idx) * take.double()
        p_sel = p.gather(1, top_idx) * take.double()
        # C1-B3a: science/culture columns ride the same selection (static
        # planes — no dynamic tail touches them in scope); the center's
        # science/culture pass through unclamped like the TS center.
        sc = ty_oth[:, :, 3].gather(1, tc).double()
        cu = ty_oth[:, :, 4].gather(1, tc).double()
        go = ty_oth[:, :, 2].gather(1, tc).double()  # VP-G1
        fa = ty_oth[:, :, 5].gather(1, tc).double()  # GV-1a
        sc_sel = sc.gather(1, top_idx) * take.double()
        cu_sel = cu.gather(1, top_idx) * take.double()
        go_sel = go.gather(1, top_idx) * take.double()  # VP-G1
        fa_sel = fa.gather(1, top_idx) * take.double()  # GV-1a
        # center: real floored yields (tileYieldsForCenter) — food after the
        # fertility/drought tail, production from the neutral plane
        sitec = center.clamp(min=0).unsqueeze(1)
        r_ = self.rules
        # A PLAYER-founded center (reachable via loyalty flips) was stripped
        # of its removable feature at founding — its yields must drop ONCE.
        # f_plane/p_plane are ALREADY strip-adjusted above (V-H1, lines
        # ~3500/3507), so cf/cp read them directly; the static cols 2-5 read
        # the RAW tile_yields and subtract here. (P4 hunt: the old extra
        # -fy_c*strip on cf/cp DOUBLE-subtracted a flipped center's feature
        # — rival production 4 vs TS 5 at seed 9001 t197, and most likely
        # the never-pinned rng2026006095 t294 rival-score residual.)
        strip = self.feat_stripped.gather(1, sitec).squeeze(1).double()
        fy_c = self.feat_yields.gather(1, sitec.unsqueeze(2).expand(-1, 1, 6)).squeeze(1).double()  # [B, 6]
        cf = torch.maximum(f_plane.gather(1, sitec).squeeze(1).double(), torch.tensor(float(r_.center_min_food), dtype=torch.float64, device=self.device))
        cp = torch.maximum(p_plane.gather(1, sitec).squeeze(1).double(), torch.tensor(float(r_.center_min_production), dtype=torch.float64, device=self.device))
        c_sc = self.tile_yields[:, :, 3].gather(1, sitec).squeeze(1).double() - fy_c[:, 3] * strip
        c_cu = self.tile_yields[:, :, 4].gather(1, sitec).squeeze(1).double() - fy_c[:, 4] * strip
        c_go = self.tile_yields[:, :, 2].gather(1, sitec).squeeze(1).double() - fy_c[:, 2] * strip  # VP-G1
        c_fa = self.tile_yields[:, :, 5].gather(1, sitec).squeeze(1).double() - fy_c[:, 5] * strip  # GV-1a
        if _has_bel:
            # A-7: a LIVE-featured center (e.g. an unremovable floodplain)
            # keeps its belief feature yields — cf/cp read the adjusted
            # planes already; the raw static cols 2-5 add them here.
            featC = featP.gather(1, sitec.unsqueeze(2).expand(-1, 1, 6)).squeeze(1).double()  # [B, 6]
            c_sc = c_sc + featC[:, 3]
            c_cu = c_cu + featC[:, 4]
            c_go = c_go + featC[:, 2]
            c_fa = c_fa + featC[:, 5]
        if self._dyadic_fp:
            # every term is an exact dyadic, so .sum() is bit-identical to
            # the TS reduce
            food = cf + f_sel.sum(dim=1)
            prod = cp + p_sel.sum(dim=1)
            sci = c_sc + sc_sel.sum(dim=1)
            cul = c_cu + cu_sel.sum(dim=1)
            gold = c_go + go_sel.sum(dim=1)  # VP-G1
            faith = c_fa + fa_sel.sum(dim=1)  # GV-1a
        else:
            food = cf.clone()
            prod = cp.clone()
            sci = c_sc.clone()
            gold = c_go.clone()  # VP-G1
            faith = c_fa.clone()  # GV-1a
            cul = c_cu.clone()
            for m in range(kk):  # sequential adds mirror the TS loop's rounding
                food = food + f_sel[:, m]
                prod = prod + p_sel[:, m]
                sci = sci + sc_sel[:, m]
                cul = cul + cu_sel[:, m]
        # A-4 Petra: +2 food +2 gold +1 production per WORKED desert
        # non-floodplain unpaved tile — POST-selection, exactly like
        # computeCityStats' petraBonus (the score ranks without it; the
        # center carries CITY_CENTER and never qualifies).
        if self._wond_n:
            wreg_p = self.rc_wonder[:, r, j]
            compw_p = (wreg_p >= 0) & self.built_wonder_complete.gather(1, wreg_p.clamp(min=0))
            hasP = (compw_p & self._wond_petra.view(1, -1)).any(dim=1)
            if bool(hasP.any()):
                sel_tiles = tc.gather(1, top_idx)  # [B, kk] the worked tiles
                qual = (
                    self.desert.gather(1, sel_tiles)
                    & (self.feat_id.gather(1, sel_tiles) != self._fp_fid)
                    & (self.district.gather(1, sel_tiles) < 0)
                    & take
                )
                nq = (qual & hasP.unsqueeze(1)).sum(dim=1).double()
                food = food + 2.0 * nq
                gold = gold + 2.0 * nq
                prod = prod + nq
        # C1-B3b: the research stand-in reads the REAL tree (retires at B5)
        # C1-B4b: COMPLETED districts add floor(adjacency) into their yield
        # column (rival cityDistrictYields under empty modifiers; gold/faith
        # columns have no rival consumer yet). Adjacency is recomputed LIVE
        # per city so a completion earlier in this same phase is seen,
        # exactly like the TS sequential loop.
        if self.districts_on:
            reg = self.rc_dist_tile[:, r, j]  # [B, nD]
            if bool((reg >= 0).any()):
                for di, dd in enumerate(self.districts_cat):
                    yc = int(dd.get("adjYield", -1))
                    if yc < 0:
                        continue
                    tile_d = reg[:, di]
                    has = mask & (tile_d >= 0)
                    if not bool(has.any()):
                        continue
                    has = has & self.district_complete.gather(1, tile_d.clamp(min=0).unsqueeze(1)).squeeze(1)
                    if not bool(has.any()):
                        continue
                    adjf = self._district_adj_floor(di).gather(1, tile_d.clamp(min=0).unsqueeze(1)).squeeze(1).double()  # (G5 memo)
                    add = torch.where(has, adjf, torch.zeros_like(adjf))
                    # A-7 Work Ethic: Holy Site adjacency ALSO yields
                    # production (the rivals.ts floored-adjacency twin)
                    if di == self._hs_idx and _has_bel:
                        prod = prod + add * self._fol_tab("we", _fol_j)  # B-18: per-city follower Work Ethic
                    if yc == 3:
                        sci = sci + add
                    elif yc == 4:
                        cul = cul + add
                    elif yc == 0:
                        food = food + add
                    elif yc == 1:
                        prod = prod + add
                    elif yc == 2:
                        gold = gold + add  # VP-G1: Harbor/Hub adjacency
                    elif yc == 5:
                        faith = faith + add  # GV-1a: Holy Site adjacency
        # C1-B4b-2: building yields under empty modifiers (worship never
        # queues, so the plain def.yields sum matches cityBuildingYields).
        if self.districts_on:
            selb = self.rc_bldg[:, r, j]
            if bool(selb.any()):
                add6 = selb.double() @ self.rules_dev.b_yields.double()  # [B, 6] (int-valued: dtype roundtrip is exact)
                food = food + add6[:, 0]
                prod = prod + add6[:, 1]
                gold = gold + add6[:, 2]  # VP-G1
                faith = faith + add6[:, 5]  # GV-1a
                sci = sci + add6[:, 3]
                cul = cul + add6[:, 4]
                # A-7: belief building adds (Feed the World / Choral Music —
                # the beliefAdd twin, unscaled, pre-tier like TS)
                if _has_bel:
                    # B-18: founder (Stewardship) bldgY stays per-civ; the
                    # follower part (Feed the World / Choral Music) keys per-city.
                    # Disjoint building keys + integer rows => the split sum is
                    # bit-identical to the old combined _bel_add einsum.
                    badd = torch.einsum("bn,bnk->bk", selb.double(), self._bel_add_pf("bldgY", r))
                    badd = badd + torch.einsum("bn,bnk->bk", selb.double(), self._fol_tab("bldgY", _fol_j))
                    food = food + badd[:, 0]
                    prod = prod + badd[:, 1]
                    gold = gold + badd[:, 2]
                    sci = sci + badd[:, 3]
                    cul = cul + badd[:, 4]
                    faith = faith + badd[:, 5]
                # P1/C-22: rivals reach Harbors now, so the SHIPYARD special
                # is live — production += the completed Harbor's LIVE
                # floor(adjacency), the rival twin of yields.ts:171 under
                # empty modifiers (all int-valued: order-exact in f64).
                if self._harbor_idx >= 0 and self._shipyard_bidx >= 0:
                    hb_tile = self.rc_dist_tile[:, r, j, self._harbor_idx]
                    has_sy = mask & selb[:, self._shipyard_bidx] & (hb_tile >= 0)
                    has_sy = has_sy & self.district_complete.gather(1, hb_tile.clamp(min=0).unsqueeze(1)).squeeze(1)
                    if bool(has_sy.any()):
                        hadj = self._district_adj_floor(self._harbor_idx).gather(1, hb_tile.clamp(min=0).unsqueeze(1)).squeeze(1).double()  # (G5 memo)
                        prod = prod + torch.where(has_sy, hadj, torch.zeros_like(hadj))
        # A-4: this city's completed wonders — flat city yields pre-tier
        # (computeCityStats' buildings position) + the belief faithPerWonder
        # (city.ts:437), now reachable.
        compw = None
        if self._wond_n:
            wreg = self.rc_wonder[:, r, j]  # [B, nW]
            compw = (wreg >= 0) & self.built_wonder_complete.gather(1, wreg.clamp(min=0))
            if bool(compw.any()):
                wcy = compw.double() @ self._wond_cy  # [B, 6]
                food = food + wcy[:, 0]
                prod = prod + wcy[:, 1]
                gold = gold + wcy[:, 2]
                sci = sci + wcy[:, 3]
                cul = cul + wcy[:, 4]
                faith = faith + wcy[:, 5]
                if _has_bel:
                    faith = faith + self._fol_tab("fpw", _fol_j) * compw.sum(dim=1).double()  # B-18: per-city follower Divine Inspiration
        # A-7: the founder's capital incomes (perFollowers on the civ's LIVE
        # total pop + perCity) land on the capital BEFORE the tier scaling —
        # the rivalCityYields capitalYields position.
        if _has_bel:
            perF = self._bel_add("perF", r)  # [B, 7] = per, then the 6 yields
            perC = self._bel_add("perC", r)  # [B, 6]
            followers = (self.rc_pop[:, r] * self.rc_alive[:, r].long()).sum(dim=1).double()
            times = torch.where(perF[:, 0] > 0, torch.floor(followers / perF[:, 0].clamp(min=1)), torch.zeros_like(followers))
            capY = perF[:, 1:] * times.unsqueeze(1) + perC * self.rc_alive[:, r].sum(dim=1).double().unsqueeze(1)
            isc = (self.rc_is_cap[:, r, j] & mask).double()
            food = food + capY[:, 0] * isc
            prod = prod + capY[:, 1] * isc
            gold = gold + capY[:, 2] * isc
            sci = sci + capY[:, 3] * isc
            cul = cul + capY[:, 4] * isc
            faith = faith + capY[:, 5] * isc
        # A-7r: government + slotted-policy flat yields (cityYields all cities,
        # capitalYields the capital) — pre-tier, the batched twin's addition.
        if self._gov_has_effects:
            gcity, gcap, *_ = self._gov_policy_mods_cached(r, self.r_civics[:, r])  # housing/ymult/slots discarded (TS rival paths don't consume them)
            mcell = mask.double()  # [B]
            gisc = (self.rc_is_cap[:, r, j] & mask).double()  # [B]
            food = food + gcity[:, 0] * mcell + gcap[:, 0] * gisc
            prod = prod + gcity[:, 1] * mcell + gcap[:, 1] * gisc
            gold = gold + gcity[:, 2] * mcell + gcap[:, 2] * gisc
            sci = sci + gcity[:, 3] * mcell + gcap[:, 3] * gisc
            cul = cul + gcity[:, 4] * mcell + gcap[:, 4] * gisc
            faith = faith + gcity[:, 5] * mcell + gcap[:, 5] * gisc
        # A-12: this civ's CS envoy bonuses — per-completed-district adds at
        # 3/6 envoys + the capital yield at 1+ (count-based, the
        # csRivalEnvoyBonuses twin; the CS yield column equals its district's
        # adjYield, the player-block invariant). Pre-tier, before A-11 trade.
        if self.S > 0 and bool((self.cs_r_envoys[:, r] > 0).any()):
            _acs = self.cs_alive.double()
            perD_r = ((self.cs_r_envoys[:, r] >= 3).double() + (self.cs_r_envoys[:, r] >= 6).double()) * self._cs_district_bonus * _acs
            csd_r = torch.zeros(self.B, len(self.districts_cat), dtype=torch.float64, device=self.device)
            csd_r.scatter_add_(1, self._cs_didx.clamp(min=0), perD_r)
            dtj = self.rc_dist_tile[:, r, j]  # [B, nD] — one tile per district type
            compj = ((dtj >= 0) & self.district_complete.gather(1, dtj.clamp(min=0))).double() * mask.double().unsqueeze(1)
            _cols = [torch.zeros(self.B, dtype=torch.float64, device=self.device) for _ in range(6)]
            for _d in self.districts_cat:
                _yc = int(_d.get("adjYield", -1))
                if _yc < 0:
                    continue
                _di = int(_d["idx"])
                _cols[_yc] = _cols[_yc] + csd_r[:, _di] * compj[:, _di]
            tier1_r = ((self.cs_r_envoys[:, r] >= 1) & self.cs_alive).double() * float(self.rules.cs.get("capitalBonus", 2))
            capb_r = torch.zeros(self.B, 6, dtype=torch.float64, device=self.device)
            capb_r.scatter_add_(1, self._cs_yidx, tier1_r)
            _isc = (self.rc_is_cap[:, r, j] & mask).double()
            food = food + _cols[0] + capb_r[:, 0] * _isc
            prod = prod + _cols[1] + capb_r[:, 1] * _isc
            gold = gold + _cols[2] + capb_r[:, 2] * _isc
            sci = sci + _cols[3] + capb_r[:, 3] * _isc
            cul = cul + _cols[4] + capb_r[:, 4] * _isc
            faith = faith + _cols[5] + capb_r[:, 5] * _isc
        # A-11: outgoing unraided route income — pre-tier, the trade position
        # in computeCityStats (production scales with the tier, food doesn't).
        _route_inc = self._rival_route_income(r)
        if _route_inc is not None:
            m6 = mask.double()
            food = food + _route_inc[:, j, 0] * m6
            prod = prod + _route_inc[:, j, 1] * m6
            gold = gold + _route_inc[:, j, 2] * m6  # A-12b: CS-route gold/specialty
            sci = sci + _route_inc[:, j, 3] * m6
            cul = cul + _route_inc[:, j, 4] * m6
            faith = faith + _route_inc[:, j, 5] * m6
        # P5/S6 (C-20): the amenity tier scales the non-food columns like
        # computeCityStats (rivalCityYields tail). External callers re-rank
        # FRESH; the phase loop passes its loop-top frozen factors. The
        # CALLER's citizen science/culture terms stay unscaled — TS adds
        # them outside rivalCityYields (a spec quirk, mirrored).
        yf = amen_yf if amen_yf is not None else self._rival_amenity(r)[2][:, j]
        prod = prod * yf
        sci = sci * yf
        cul = cul * yf
        gold = gold * yf
        faith = faith * yf
        # A-4: the owning city's wonder yield multipliers (Oxford/Big Ben)
        # AFTER the tier scaling — the computeCityStats order; the product
        # runs in wonder-id order = the TS registry push order (the picker
        # scans data order one at a time).
        if compw is not None and bool(compw.any()):
            wmm = torch.where(
                compw.unsqueeze(2),
                self._wond_mult.view(1, -1, 6).expand(compw.shape[0], -1, -1),
                torch.ones(compw.shape[0], compw.shape[1], 6, dtype=torch.float64, device=self.device),
            ).prod(dim=1)
            food = food * wmm[:, 0]
            prod = prod * wmm[:, 1]
            gold = gold * wmm[:, 2]
            sci = sci * wmm[:, 3]
            cul = cul * wmm[:, 4]
            faith = faith * wmm[:, 5]
        z = torch.zeros_like(food)
        return (
            torch.where(mask, food, z),
            torch.where(mask, prod, z),
            torch.where(mask, sci, z),
            torch.where(mask, cul, z),
            torch.where(mask, gold, z),
            torch.where(mask, faith, z),
        )

    def _rival_amenity(self, r: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """P5/S6 (C-20): rivalAmenityTiers — each UNIQUE improved luxury on
        THIS civ's territory grants +1 to its luxAmenityCities neediest
        cities (need desc, slot asc = rc.id acquisition order); tier from
        have − needed with have = local building amenities (no Palace, no
        regional/policy sources — rivals can't build them). Returns
        (tier_idx, growth_f, yield_f), each [B, RC]."""
        B, RC = self.B, self.RC
        rd = self.rules_dev
        have = torch.einsum("bjn,n->bj", self.rc_bldg[:, r].to(torch.float64), rd.b_amenities.double())
        need = torch.ceil((self.rc_pop[:, r].double() - 2) / 2).clamp(min=0)
        out = torch.zeros(B, RC, dtype=torch.float64, device=self.device)
        alive = self.rc_alive[:, r]
        if self._n_lux > 0 and self.improvements_on:
            improved = (self.lux_id >= 0) & (self.rival_at == r) & (self.improvement == self.lux_req)
            counts = torch.zeros(B, self._n_lux, dtype=torch.long, device=self.device)
            counts.scatter_add_(1, self.lux_id.clamp(min=0), improved.long())
            rounds = (counts > 0).long().sum(dim=1)
            mx = int(rounds.max().item())
            slot = torch.arange(RC, device=self.device, dtype=torch.float64).view(1, RC)
            k = min(self._lux_k, RC)
            for rnd in range(mx):
                act = rounds > rnd
                needr = need - (have + out)
                key = torch.where(alive, needr * 64 - slot, torch.full_like(needr, -1e9))
                top_v, top_i = key.topk(k, dim=1)
                grant = (top_v > -1e8) & act.unsqueeze(1)
                out.scatter_add_(1, top_i, grant.to(torch.float64))
        if self._r_has_beliefs(r):
            # A-7: River Goddess (river centers) + Zen Meditation (2+
            # completed specialty districts) join the TIER balance only —
            # the luxury-grant RANKING stays building-amenities-based,
            # mirroring rivalAmenityTiers.
            ctr = self.rc_center[:, r].clamp(min=0)
            extra = self._bel_add("river", r)[:, 0].unsqueeze(1) * self.tile_river.gather(1, ctr).double()
            # B-18: Zen Meditation keys per-city on the followed religion's
            # follower belief (owner religion when inert = byte-identical).
            zen_rc = self._fol_tab("zen", self._follower_id_for(self._rc_rel(r)))  # [B, RC, 2] = min, amenities
            zmin, zamt = zen_rc[:, :, 0], zen_rc[:, :, 1]  # each [B, RC]
            if bool((zamt != 0).any()):
                dt_ = self.rc_dist_tile[:, r]
                comp_ = (dt_ >= 0) & self.district_complete.gather(1, dt_.clamp(min=0).reshape(B, -1)).reshape_as(dt_)
                spec_ = (comp_ & self._is_specialty.view(1, 1, -1)).sum(dim=2).double()
                extra = extra + torch.where(spec_ >= zmin, zamt, torch.zeros_like(spec_))
            balance = have + out + extra - need
        else:
            balance = have + out - need
        # B-15: rival war-weariness drag (symmetric with the player), subtracted
        # from the tier balance after luxury grants (mirrors rivalAmenityTiers).
        balance = balance - self._ww_penalty_rival(r).unsqueeze(1)
        growth_f, yield_f = self._amenity_factors(balance)
        tier_idx = torch.full_like(self.rc_pop[:, r], len(self.rules.amenity_tiers) - 1)
        for i in reversed(range(len(self.rules.amenity_tiers))):
            tier_idx = torch.where(balance >= self.rules.amenity_tiers[i][0], torch.full_like(tier_idx, i), tier_idx)
        return tier_idx, growth_f.double(), yield_f.double()

    def _transfer_rc_to_rc(self, b: int, r_from: int, j: int, r_to: int) -> None:
        """P5/S6 (C-19): a loyalty flip between rivals — pop ×0.75 floor 1,
        fresh boxes, CITY_CENTER-only registry, half HP, the city's own
        tiles re-tag (A-17 registry; the transferRivalCityToRival mirror).
        The loser slot dies with full queue/registry hygiene (the S5 lesson)."""
        c_t = int(self.rc_center[b, r_from, j])
        old_pop = int(self.rc_pop[b, r_from, j])
        old_acq = int(self.rc_acquired[b, r_from, j])
        self.rc_alive[b, r_from, j] = False
        self.rc_is_cap[b, r_from, j] = False  # P7-FULL: identity dies with the slot
        self.rc_dist_tile[b, r_from, j, :] = -1
        self.rc_wonder[b, r_from, j, :] = -1  # A-4 hygiene
        self.rc_bldg[b, r_from, j, :] = False
        self.rc_outer_hp[b, r_from, j] = 0  # AUDIT B-1
        self.rc_current[b, r_from, j] = -1
        self.rc_cost[b, r_from, j] = 0
        self.rc_progress[b, r_from, j] = 0
        self.rc_qtile[b, r_from, j] = -1
        # A-17: exactly the flipping city's tiles re-tag (registry scan) —
        # the transferRivalCityToRival twin (rc_id read before the hygiene
        # writes; the slot's id field itself is never reset on death).
        id_from = int(self.rc_id[b, r_from, j])
        own_t = (self.rc_tile_id[b] == id_from) & (self.rival_at[b] == r_from)
        # A-11: the loser's routes die with their endpoint (receiver starts
        # route-less — the TS from.tradeRoutes filter twin).
        kill = (self.r_routes[b, r_from, :, 0] == id_from) | (self.r_routes[b, r_from, :, 1] == id_from)
        self.r_routes[b, r_from][kill] = -1
        self.rival_at[b] = torch.where(own_t, torch.full_like(self.rival_at[b], r_to), self.rival_at[b])
        # A-17: re-tagged tiles register to the receiving rc (its id is
        # assigned below from r_next_city_id — same value, read here first)
        self.rc_tile_id[b] = torch.where(own_t, torch.full_like(self.rc_tile_id[b], int(self.r_next_city_id[b, r_to])), self.rc_tile_id[b])
        occ = self.rc_alive[b, r_to].nonzero(as_tuple=True)[0]
        slot = int(occ.max()) + 1 if len(occ) else 0
        assert slot < self.RC, "rival city slots exhausted - raise RC (compaction already ran; this is true living capacity)"
        self.rc_alive[b, r_to, slot] = True
        self.rc_is_cap[b, r_to, slot] = False  # TS transferRivalCityToRival: isCapital false
        self.rc_center[b, r_to, slot] = c_t
        self.rc_pop[b, r_to, slot] = max(1, (old_pop * 3) // 4)
        self.rc_growth[b, r_to, slot] = 0
        self.rc_cbox[b, r_to, slot] = 0
        self.rc_loyalty[b, r_to, slot] = 100.0
        self.rc_acquired[b, r_to, slot] = old_acq
        self.rc_hp[b, r_to, slot] = round(self.rules.rivals.get("cityMaxHp", 200) / 2)
        self.rc_current[b, r_to, slot] = -1
        self.rc_progress[b, r_to, slot] = 0
        self.rc_cost[b, r_to, slot] = 0
        self.rc_qtile[b, r_to, slot] = -1
        self.rc_dist_tile[b, r_to, slot, :] = -1
        self.rc_wonder[b, r_to, slot, :] = -1
        self.rc_bldg[b, r_to, slot, :] = False
        self.rc_outer_hp[b, r_to, slot] = 0  # AUDIT B-1: transferred city starts wall-less
        self.rc_id[b, r_to, slot] = int(self.r_next_city_id[b, r_to])
        self.r_next_city_id[b, r_to] += 1
        self.rvcity_at[b, c_t] = r_to
        self._eff_version += 1

    def _rival_border_growth(self, r: int, j: int, cact: torch.Tensor, cul_c: torch.Tensor) -> None:
        """P5/S4 (C-15): the player's cultural border growth for rc slot j —
        box += this city's culture, then consume against _border_cost with
        the player's pick key (dist asc, resource priority desc, yield-sum
        desc, index asc; radius 5; fully unowned tiles — water, impassables
        and natural wonders all claimable like borderCandidates). The yield
        sum uses the RIVAL's planes (strip-adjusted food/prod + its own
        farm-adjacency and mine boosts — the rivalCityYields ctx). A-17:
        adjacency is PER-CITY via the rc_tile_id registry, mirroring the
        player's n.cityId === city.id borderCandidates check."""
        self.rc_cbox[:, r, j] = torch.where(cact, self.rc_cbox[:, r, j] + cul_c, self.rc_cbox[:, r, j])
        B, dev = self.B, self.device
        center = self.rc_center[:, r, j]
        # A-7: Religious Settlements — Math.round(base * borderCostMult),
        # the player's city.ts:507 form (mult 1 without beliefs: js_round of
        # the integral base curve is exact, so the expression is identical).
        _bmul = self._bel_mul("border", r) if self._r_has_beliefs(r) else None
        def _rc_cost():
            base = self._border_cost(self.rc_acquired[:, r, j])
            return js_round(base * _bmul) if _bmul is not None else base
        # lazy like the original: most calls have no border-ready city —
        # bail before building anything (the loop re-checks per claim).
        if not bool((cact & (self.rc_cbox[:, r, j] >= _rc_cost())).any()):
            return
        # D-6: claims only mutate OWNERSHIP (rival_at) — the candidate
        # window, the rival ySum plane and the pick key are loop-invariant,
        # so build them ONCE (they were rebuilt per claim iteration).
        # D-2: the strip-adjusted planes come from the shared cache — the
        # same construction _rival_city_yields scores worked tiles with
        # (bit-equal to TS tileYields under modifiersFromResearch: all
        # shipped yields are dyadic).
        tiles = tiles_from_offsets(center, self._off5, self.W, self.H)  # [B, M]
        tc = tiles.clamp(min=0)
        nbs = self.neigh[tc.reshape(-1)].reshape(B, -1, 6)  # [B, M, 6]
        g = self._rcy_globals()
        f_plane = self._rcy_food_plane(r, g)
        p_plane = g["p_plane"]
        if self._mine_boost_tech.numel() > 0 and self.MINE >= 0:
            boost_r = (self.r_techs[:, r][:, self._mine_boost_tech].to(self.dtype) * self._mine_boost_amt).sum(dim=1)
            p_plane = p_plane + ((self.improvement == self.MINE) & ~self.pillaged).to(self.dtype) * boost_r.unsqueeze(1)
        y_oth = (self.tile_yields[:, :, 2:] - self.feat_yields[:, :, 2:] * g["fs"].unsqueeze(-1)).sum(dim=2)
        # AUDIT A-13: CAMP/PLANTATION catalog gold joins the border ySum
        # (the task-#39 _farmadj_food twin — TS tileYields carries it, and
        # orphaned improvements DO reach frontier candidates after a raze).
        if self.improvements_on:
            live_imp = ((self.improvement >= 0) & ~self.pillaged).to(self.dtype)
            y_oth = y_oth + self._imp_yields[self.improvement.clamp(min=0), 2:].sum(dim=2) * live_imp
        if _bmul is not None or self._r_has_beliefs(r):
            # A-7: belief featureYields ride the pick key too (TS
            # pickRivalBorderTile's ctx carries getRivalModifiers now)
            featP = self._belief_feat_plane(r)
            f_plane = f_plane + featP[:, :, 0]
            p_plane = p_plane + featP[:, :, 1]
            y_oth = y_oth + featP[:, :, 2:].sum(dim=2)
        # P5/S5 gate-catch (seed 9027 t239): tileYields returns ZERO for a
        # paved tile (yields.ts:37 — an orphaned district from a razed
        # city can be an unowned candidate, hills base 3 leaked into the
        # key and out-bid TS's real pick one row over).
        y_sum = (f_plane.double() + p_plane.double() + y_oth.double()).gather(1, tc) * ((self.district.gather(1, tc) < 0) & (self.built_wonder.gather(1, tc) < 0)).to(torch.float64)
        # the player's exact key: dist asc, res priority desc, milli-
        # rounded yield sum desc, global tile index asc (the player-walk
        # twin). C-6: priority reads LIVE (paved bonus resource is GONE).
        d = self.pair_dist[center.unsqueeze(1), tc].to(self.dtype)
        key0 = (
            d * 1e12
            - (self.res_priority * (~self.res_stripped).long()).gather(1, tc).to(self.dtype) * 1e9
            - torch.round(y_sum * 1000) * 1e4
            + tiles.to(self.dtype)
        )
        unowned = None  # D-13: window planes dense once, then incremental per claim
        adj_own = None
        for _ in range(64):  # the TS while-loop (multiple claims per turn, escalating cost)
            cost = _rc_cost()  # A-7: belief border multiplier applied
            ready = cact & (self.rc_cbox[:, r, j] >= cost)
            if not bool(ready.any()):
                return
            if unowned is None:
                unowned = (self.owner.gather(1, tc) < 0) & (self.cs_at.gather(1, tc) < 0) & (self.rival_at.gather(1, tc) < 0)
                # A-17: adjacency is PER-CITY — the neighbor must belong to
                # THIS rc's registry (rival_at alone let a city claim across
                # a sibling's frontier), the pickRivalBorderTile twin.
                nb_flat = nbs.clamp(min=0).reshape(B, -1)
                adj_own = (
                    (self.rival_at.gather(1, nb_flat).reshape(B, -1, 6) == r)
                    & (self.rc_tile_id.gather(1, nb_flat).reshape(B, -1, 6) == self.rc_id[:, r, j].view(B, 1, 1))
                    & (nbs >= 0)
                ).any(dim=2)
            ok = (tiles >= 0) & unowned & adj_own & ready.unsqueeze(1)
            key = torch.where(ok, key0, self._inf_f)
            best = key.argmin(dim=1)
            has_cand = ok.any(dim=1)
            claim = ready & has_cand
            if bool(claim.any()):
                rows = claim.nonzero(as_tuple=True)[0]
                spot = tiles[rows, best[rows]]
                self.rival_at[rows, spot] = r
                self.rc_tile_id[rows, spot] = self.rc_id[rows, r, j]  # A-17: claim registers to THIS city
                # G4: invalidate the batched-yields cache ONLY if this claim
                # can change a later column — i.e. the spot lands inside a
                # LATER same-civ city's radius-3 worked window (columns <= j
                # are already consumed this turn; padding -1 never matches a
                # real spot >= 0). Cross-civ claims can't flip a valid bit.
                if j + 1 < self.RC:
                    _win = self._rcy_globals().get("win_r", {}).get(r)
                    if _win is None or bool((_win[rows, j + 1 :, :] == spot.view(-1, 1, 1)).any()):
                        self._claim_version += 1
                self.rc_acquired[rows, r, j] += 1
                self.rc_cbox[rows, r, j] -= cost[rows]
                # D-13: only rival_at[spot] changed (-1 → r, per the unowned
                # gate). The spot leaves the unowned plane; window tiles
                # ADJACENT to it gain r-adjacency — same booleans the dense
                # re-derive would produce (owner/cs_at never move in-loop).
                unowned[rows, best[rows]] = False
                nb_s = self.neigh[spot]  # [n, 6]
                adj_hit = ((tiles[rows].unsqueeze(2) == nb_s.unsqueeze(1)) & (nb_s >= 0).unsqueeze(1)).any(dim=2)  # [n, M]
                adj_own[rows] = adj_own[rows] | adj_hit
            capped = ready & ~has_cand
            if bool(capped.any()):
                # Nowhere to grow: cap the box at the current threshold.
                self.rc_cbox[:, r, j] = torch.where(capped, torch.minimum(self.rc_cbox[:, r, j], cost), self.rc_cbox[:, r, j])
            if not bool(claim.any()):
                return

    def _rival_try_found(self, r: int, want: torch.Tensor) -> None:
        """Mirrors tryFoundCity: scan each own city's 7-ring in city order ×
        tilesWithin order; quality = fresh-water 8 + the ring-2 sum of
        static contributions over passable unowned members (summed in ring
        order — candidate qualities compare strictly); the first strictly
        best site above 3 wins. Deducts the settler cost only on success."""
        B, dev = self.B, self.device
        rrr = self.rules.rivals
        best_q = torch.full((B,), 3.0, dtype=torch.float64, device=dev)
        best_site = torch.full((B,), -1, dtype=torch.long, device=dev)
        # tooClose sources
        pl_centers = self.site.clamp(min=0)  # [B, C]
        rc_flat = self.rc_center.reshape(B, -1)
        rc_live = self.rc_alive.reshape(B, -1)
        for j in range(self.RC):
            src = want & self.rc_alive[:, r, j]
            if not bool(src.any()):
                continue
            center = self.rc_center[:, r, j]
            tiles = tiles_from_offsets(center, self._off7, self.W, self.H)  # [B, M]
            tc = tiles.clamp(min=0)
            unowned = (self.owner.gather(1, tc) < 0) & (self.cs_at.gather(1, tc) < 0) & (self.rival_at.gather(1, tc) < 0)
            # AUDIT C-7: siteQuality's candidate gate reads tile.district
            # LIVE (an orphaned pave — razed city — is unowned but refused);
            # settle_ok only bakes the t0 districts.
            okt = (tiles >= 0) & unowned & self.settle_ok.gather(1, tc) & (self.rvcity_at.gather(1, tc) < 0) & (self.district.gather(1, tc) < 0) & (self.built_wonder.gather(1, tc) < 0)
            # quality: fresh8 + Σ ring-2 contributions of passable, unowned members
            ring = tiles_from_offsets(tc.reshape(-1), self._off2, self.W, self.H).reshape(B, -1, self._off2.shape[0])
            rc2 = ring.clamp(min=0)
            member_ok = (
                (ring >= 0)
                & self.passable.gather(1, rc2.reshape(B, -1)).reshape_as(ring)
                & (self.owner.gather(1, rc2.reshape(B, -1)).reshape_as(ring) < 0)
                & (self.cs_at.gather(1, rc2.reshape(B, -1)).reshape_as(ring) < 0)
                & (self.rival_at.gather(1, rc2.reshape(B, -1)).reshape_as(ring) < 0)
            )
            okd = member_ok.double()
            c3 = self.site_q3.gather(1, rc2.reshape(B, -1).unsqueeze(2).expand(-1, -1, 3)).reshape(B, -1, ring.shape[2], 3)
            # AUDIT C-7: siteQuality reads MEMBER t.feature/t.resource LIVE —
            # a chopped/paved member's feature yields vanish (feat_stripped)
            # and a paved bonus resource is gone (res_stripped, C-6); only
            # the terrain column is truly static.
            fs2 = self.feat_stripped.gather(1, rc2.reshape(B, -1)).reshape_as(ring)
            rs2 = self.res_stripped.gather(1, rc2.reshape(B, -1)).reshape_as(ring)
            c3[:, :, :, 1] = c3[:, :, :, 1] * (~fs2).double()
            c3[:, :, :, 2] = c3[:, :, :, 2] * (~rs2).double()
            hill = (self.hills.gather(1, rc2.reshape(B, -1)).reshape_as(ring) & member_ok).double() * 0.5
            q = self.fresh_water.gather(1, tc).double() * 8
            for m2 in range(ring.shape[2]):  # per member, FOUR separate adds — the exact TS sequence
                q = q + c3[:, :, m2, 0] * okd[:, :, m2]
                q = q + c3[:, :, m2, 1] * okd[:, :, m2]
                q = q + c3[:, :, m2, 2] * okd[:, :, m2]
                q = q + hill[:, :, m2]
            # tooClose (P4/D-5, CITY_MIN_DIST = 4): uniform 4 everywhere —
            # P5/S3 (C-14) dropped the old +1 rival-vs-rival pad.
            tc3 = tc.unsqueeze(2)  # [B, M, 1] — pairwise indexing, no [B, M, T]
            d_pl = self.pair_dist[tc3, pl_centers.unsqueeze(1)].to(torch.long)
            near_pl = ((d_pl < 4) & self.alive.unsqueeze(1)).any(dim=2)
            d_cs = self.pair_dist[tc3, self.cs_center.clamp(min=0).unsqueeze(1)].to(torch.long)
            near_cs = ((d_cs < 4) & self.cs_alive.unsqueeze(1)).any(dim=2)
            d_rc = self.pair_dist[tc3, rc_flat.clamp(min=0).unsqueeze(1)].to(torch.long)
            near_rc = ((d_rc < 4) & rc_live.unsqueeze(1)).any(dim=2)
            good = okt & ~near_pl & ~near_cs & ~near_rc & src.unsqueeze(1)
            q = torch.where(good, q, torch.tensor(-torch.inf, dtype=torch.float64, device=dev))
            # strictly-greater beats the running best (first-found keeps ties)
            qmax, _ = q.max(dim=1)
            first_pos = torch.where(q == qmax.unsqueeze(1), torch.arange(q.shape[1], device=dev), q.shape[1]).min(dim=1).values
            cand_site = tiles.gather(1, first_pos.clamp(max=q.shape[1] - 1).unsqueeze(1)).squeeze(1)
            better = src & (qmax > best_q)
            best_q = torch.where(better, qmax, best_q)
            best_site = torch.where(better, cand_site, best_site)
        found = want & (best_site >= 0)
        if not bool(found.any()):
            return
        rows = found.nonzero(as_tuple=True)[0]
        # P5/S1 gate-catch (seed 9131 t250): the alive COUNT is not a free
        # slot once a capture punches a hole mid-pool — it lands ON a live
        # city and overwrites it. TS appends, so the mirror is last-alive+1
        # (new cities iterate LAST, matching the array order; holes stay
        # holes until P7's reclamation).
        occ_idx = torch.arange(self.RC, device=self.device).view(1, -1)
        slot = (torch.where(self.rc_alive[rows, r], occ_idx, torch.full_like(occ_idx, -1)).max(dim=1).values + 1)
        assert int(slot.max()) < self.RC, "rival city slots exhausted — raise RC (compaction already ran; this is true living capacity)"
        s_idx = best_site[rows]
        # P7-FULL (C-3): TS isCapital = rival.cities.length === 0 — a
        # total-collapse refound re-crowns and updates capitalTiles[r+1]
        # (rivals.ts:149-151); every other settle founds a non-capital.
        new_cap = ~self.rc_alive[rows, r].any(dim=1)
        self.rc_alive[rows, r, slot] = True
        self.rc_is_cap[rows, r, slot] = new_cap
        self.cap_tile_rival[rows, r] = torch.where(new_cap, s_idx, self.cap_tile_rival[rows, r])
        self.rc_center[rows, r, slot] = s_idx
        self.rc_pop[rows, r, slot] = 1
        self.rc_growth[rows, r, slot] = 0
        self.rc_cbox[rows, r, slot] = 0  # P5/S4
        self.rc_loyalty[rows, r, slot] = 100.0  # P5/S6
        self.rc_acquired[rows, r, slot] = 0
        self.rc_hp[rows, r, slot] = rrr.get("cityMaxHp", 200)
        self.rc_current[rows, r, slot] = -1
        self.rc_progress[rows, r, slot] = 0
        self.rc_cost[rows, r, slot] = 0
        self.rc_qtile[rows, r, slot] = -1
        self.rc_dist_tile[rows, r, slot, :] = -1
        self.rc_wonder[rows, r, slot, :] = -1
        self.rc_bldg[rows, r, slot, :] = False
        self.rc_id[rows, r, slot] = self.r_next_city_id[rows, r]
        _new_cid = self.r_next_city_id[rows, r].clone()  # A-17: this city's persistent id
        self.r_next_city_id[rows, r] += 1
        self.rvcity_at[rows, s_idx] = r
        self.rival_at[rows, s_idx] = r
        self.rc_tile_id[rows, s_idx] = _new_cid  # A-17
        # P5/S3 (C-14): rival founding strips like foundCity — the removable
        # feature dies (tdef drops to the hills component, feature yields
        # vanish via feat_stripped, the lent district adjacency withdraws)
        # and the improvement dies with it. Idempotence guard mirrors the
        # player founding twin: a previously CHOPPED tile has nothing left
        # to withdraw. t0 capitals bake the strip into the exported statics.
        # A-13 gate catch (rng 2026006108 t81): an UNREMOVABLE feature
        # (oasis/floodplains) survives the founding LIVE (rivals.ts:144) —
        # Lady of the Reeds kept feeding the TS center +2⚙ while the GPU's
        # blanket feat_stripped starved _belief_feat_plane; both writes
        # gate on feat_removable.
        frm_f = self.feat_removable[rows, s_idx]
        self.tdef[rows, s_idx] = torch.where(frm_f, self.hills[rows, s_idx].long() * 3, self.tdef[rows, s_idx])
        self.tmove[rows, s_idx] = torch.where(frm_f, self.hills[rows, s_idx].long() * 3, self.tmove[rows, s_idx])  # B-28: stripped feature no longer slows movement
        fresh_f = ~self.feat_stripped[rows, s_idx] & frm_f
        self.feat_stripped[rows, s_idx] |= frm_f
        self.improvement[rows, s_idx] = -1
        # P5/S5 gate-catch (seed 9027 t169): foundRivalCity does NOT clear
        # tile.pillaged — a pillaged farm's flag survives the founding (the
        # improvement dies, the flag stays; TI lines log it and later
        # readers see it). Do not mirror the old player-block over-clear.
        contrib = self._feat_adj[rows, s_idx] * fresh_f.unsqueeze(1).to(self._feat_adj.dtype)  # [R, nD]
        nb = self.neigh[s_idx]
        for d in range(6):
            n_d = nb[:, d]
            ndc = n_d.clamp(min=0)
            on_map = n_d >= 0
            if bool(on_map.any()):
                om = on_map.nonzero(as_tuple=True)[0]
                self.d_static_adj[rows[om], n_d[om], :] -= contrib[om]
            free = (
                # the full first ring, water included — mirrors foundCity /
                # foundRivalCity (AUDIT C-1: a coastal rival must own its
                # harbor water or the Harbor line is unreachable)
                on_map
                & (self.owner[rows, ndc] < 0)
                & (self.cs_at[rows, ndc] < 0)
                & (self.rival_at[rows, ndc] < 0)
            )
            self.rival_at[rows[free], n_d[free]] = r
            self.rc_tile_id[rows[free], n_d[free]] = _new_cid[free]  # A-17: ring joins the founder's registry
        self._eff_version += 1  # feat_stripped / d_static_adj changed

    def _hostile_vs_unit(self, att: torch.Tensor, tgt: torch.Tensor, atk_kind: str, u: int) -> None:
        """Shared melee resolution for a hostile attacker (barb slot u of
        u_/barb maps, or rival slot u of v_/rv maps) striking the units on
        tile tgt: military defender takes defender-first rolls with terrain
        defense and the victor-survives rule; a lone civilian dies without a
        roll; the attacker advances into an emptied tile."""
        if atk_kind == "barb":
            a_hp, a_tile, a_at = self.u_hp, self.u_tile, self.barb_at
            a_alive = self.u_alive
            atk_cs_all = self._unit_combat[self.u_type[:, u]]
            blocked_side = "barb"
        else:
            a_hp, a_tile, a_at = self.v_hp, self.v_tile, self.rv_at
            a_alive = self.v_alive
            atk_cs_all = self._p_combat[self.v_type[:, u]]
            blocked_side = "rival"
        ttc = tgt.clamp(min=0)
        here = a_tile[:, u]
        dm = self.pmil_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        dc_ = self.pciv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        db = self.barb_at.gather(1, ttc.unsqueeze(1)).squeeze(1) if atk_kind == "rival" else torch.full_like(dm, -1)
        dv = self.rv_at.gather(1, ttc.unsqueeze(1)).squeeze(1) if atk_kind == "barb" else torch.full_like(dm, -1)
        dvc = self.rvciv_at.gather(1, ttc.unsqueeze(1)).squeeze(1) if atk_kind == "barb" else torch.full_like(dm, -1)
        mil_att = att & ((dm >= 0) | (db >= 0) | (dv >= 0))
        civ_att = att & (dm < 0) & (db < 0) & (dv < 0) & (dc_ >= 0)
        rvciv_att = att & (dm < 0) & (db < 0) & (dv < 0) & (dc_ < 0) & (dvc >= 0)  # C1-B5b: lone rival civilian
        if bool(mil_att.any()):
            def_is_barb = db >= 0
            def_is_rv = (dv >= 0) & ~def_is_barb & (dm < 0)
            d_cs_p = self._p_combat[self.p_type.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)]
            d_cs_b = self._unit_combat[self.u_type.gather(1, db.clamp(min=0).unsqueeze(1)).squeeze(1)]
            d_cs_v = self._p_combat[self.v_type.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)]
            f_p = self.p_fortify.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)
            f_b = self.u_fortify.gather(1, db.clamp(min=0).unsqueeze(1)).squeeze(1)
            f_v = self.v_fortify.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)
            def_fort = torch.where(def_is_barb, f_b, torch.where(def_is_rv, f_v, f_p)) * 3  # B-5
            def_cs = torch.where(def_is_barb, d_cs_b, torch.where(def_is_rv, d_cs_v, d_cs_p)) + self.tdef.gather(1, ttc.unsqueeze(1)).squeeze(1) + def_fort
            # B-29: attacker AND defender fight at HP-reduced strength.
            d_hp_p = self.p_hp.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)
            d_hp_b = self.u_hp.gather(1, db.clamp(min=0).unsqueeze(1)).squeeze(1)
            d_hp_v = self.v_hp.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)
            def_hp = torch.where(def_is_barb, d_hp_b, torch.where(def_is_rv, d_hp_v, d_hp_p))
            atk_e = atk_cs_all - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(here, tgt)  # B-29 river
            def_e = def_cs - self._wound(def_hp)
            # B-7: flanking helps the hostile attacker (barb/rival at `here`),
            # support helps the defender (player, barb or rival).
            _dside = torch.where(def_is_barb, torch.ones_like(dm), torch.where(def_is_rv, torch.full_like(dm, 2), torch.zeros_like(dm)))
            _dciv = self.v_civ.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)
            _fl, _sp = self._flank_support(tgt, _dside, _dciv, here)
            atk_e = atk_e + FLANKING_CS * _fl
            def_e = def_e + SUPPORT_CS * _sp
            d_def = self._damage_roll(mil_att, atk_e - def_e, k="mel", tile=tgt)
            d_atk = self._damage_roll(mil_att, def_e - atk_e, k="melc", tile=tgt)
            rows = mil_att.nonzero(as_tuple=True)[0]
            def_dead = torch.zeros_like(mil_att)
            for grp, at_map, hp_t, alive_t in (
                (~def_is_barb & ~def_is_rv, self.pmil_at, self.p_hp, self.p_alive),
                (def_is_barb, self.barb_at, self.u_hp, self.u_alive),
                (def_is_rv, self.rv_at, self.v_hp, self.v_alive),
            ):
                g = rows[grp[rows]]
                if len(g) == 0:
                    continue
                ds = at_map[g, ttc[g]]  # paired rows — gather(1, …) would read rows 0..|g|
                hp_t[g, ds] -= d_def[g]
                dead = hp_t[g, ds] <= 0
                def_dead[g[dead]] = True
                at_map[g[dead], ttc[g[dead]]] = -1
                alive_t[g[dead], ds[dead]] = False
            a_hp[:, u] = torch.where(mil_att, a_hp[:, u] - d_atk, a_hp[:, u])
            atk_dead = mil_att & (a_hp[:, u] <= 0)
            both = def_dead & atk_dead
            a_hp[:, u] = torch.where(both, torch.ones_like(a_hp[:, u]), a_hp[:, u])  # victor survives
            atk_dead = atk_dead & ~def_dead
            if bool(atk_dead.any()):
                ar = atk_dead.nonzero(as_tuple=True)[0]
                a_at[ar, here[ar]] = -1
                a_alive[:, u] = a_alive[:, u] & ~atk_dead
            adv = def_dead & ~atk_dead & ~self._blocked_for(tgt.unsqueeze(1), blocked_side).squeeze(1)
            if bool(adv.any()):
                vr = adv.nonzero(as_tuple=True)[0]
                a_at[vr, here[vr]] = -1
                a_tile[vr, u] = ttc[vr]
                a_at[vr, ttc[vr]] = u
                if atk_kind == "rival":
                    self._clear_camp_at(adv, ttc, civ=self.v_civ[:, u])  # P5/S7 (C-3)
        if bool(civ_att.any()):
            rows = civ_att.nonzero(as_tuple=True)[0]
            ds = dc_[rows]
            self.pciv_at[rows, ttc[rows]] = -1
            self.p_alive[rows, ds] = False
        if bool(rvciv_att.any()):
            # C1-B5b: a lone rival civilian dies the same roll-free death
            rows = rvciv_att.nonzero(as_tuple=True)[0]
            ds = dvc[rows]
            self.rvciv_at[rows, ttc[rows]] = -1
            self.v_alive[rows, ds] = False
        kill_adv = civ_att | rvciv_att
        if bool(kill_adv.any()):
            adv = kill_adv & ~self._blocked_for(tgt.unsqueeze(1), blocked_side).squeeze(1)
            if bool(adv.any()):
                vr = adv.nonzero(as_tuple=True)[0]
                a_at[vr, here[vr]] = -1
                a_tile[vr, u] = ttc[vr]
                a_at[vr, ttc[vr]] = u
                if atk_kind == "rival":
                    self._clear_camp_at(adv, ttc, civ=self.v_civ[:, u])  # P5/S7 (C-3)

    def _attack_rival_city(self, att: torch.Tensor, tgt: torch.Tensor, u: int) -> None:
        """A barbarian battering a rival city (mirrors attackRivalCity):
        P4/D-22 defense (best-melee-ever + garrison); sacked at 0 HP,
        never captured."""
        if not bool(att.any()):
            return
        ttc = tgt.clamp(min=0)
        civ = self.rvcity_at.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0)
        # locate the city slot at that center
        slot = torch.zeros_like(civ)
        for j in range(self.RC):
            hit = self.rc_center[torch.arange(self.B, device=self.device), civ, j] == ttc
            hit = hit & self.rc_alive[torch.arange(self.B, device=self.device), civ, j]
            slot = torch.where(att & hit, torch.full_like(slot, j), slot)
        bidx = torch.arange(self.B, device=self.device)
        # P4/D-22 (rivalCityDefense): max(15, civ's strongest melee ever)
        # + 5 for its own military garrisoning the center.
        best_r = self.r_best_melee[bidx, civ]
        gslot = self.rv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        gar = ((gslot >= 0) & (self.v_civ[bidx, gslot.clamp(min=0)] == civ)).long()
        def_cs = torch.maximum(best_r, torch.full_like(best_r, 15)) + gar * 5
        atk_cs = self._unit_combat[self.u_type[:, u]]
        atk_e = atk_cs - self._wound(self.u_hp[:, u]) - 5.0 * self._river_cross(self.u_tile[:, u], tgt)  # B-29 wound + river (city not a unit)
        d_city = self._damage_roll(att, atk_e - def_cs, k="rcty", tile=tgt)
        d_atk = self._damage_roll(att, def_cs - atk_e, k="rctyc", tile=tgt)
        rows = att.nonzero(as_tuple=True)[0]
        # AUDIT B-1: the outer wall pool soaks the hit first, spillover to HP.
        outer = self.rc_outer_hp[rows, civ[rows], slot[rows]]
        absorbed = torch.minimum(outer, d_city[rows])
        self.rc_outer_hp[rows, civ[rows], slot[rows]] = outer - absorbed
        self.rc_hp[rows, civ[rows], slot[rows]] -= d_city[rows] - absorbed
        self.u_hp[:, u] = torch.where(att, self.u_hp[:, u] - d_atk, self.u_hp[:, u])
        died = att & (self.u_hp[:, u] <= 0)
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            self.barb_at[dr, self.u_tile[dr, u]] = -1
            self.u_alive[:, u] = self.u_alive[:, u] & ~died
        sacked = rows[self.rc_hp[rows, civ[rows], slot[rows]] <= 0]
        if len(sacked) > 0:
            sc, sj = civ[sacked], slot[sacked]
            self.rc_pop[sacked, sc, sj] = ((self.rc_pop[sacked, sc, sj] * 3) // 4).clamp(min=1)
            # P5/S1 (C-10): the rival sack mirrors sackCity — milli-rounded
            # 20% gold loss (cap 100) + the pillage ring around the center.
            loss_r = torch.minimum(
                torch.tensor(100.0, dtype=torch.float64, device=self.device),
                js_round(js_round(self.r_treasury[sacked, sc] * 1000) / 1000 * 0.2).double(),
            )
            self.r_treasury[sacked, sc] -= loss_r
            if self.improvements_on:
                centers_r = self.rc_center[sacked, sc, sj]
                nb_r = self.neigh[centers_r.clamp(min=0)]  # [K, 6]
                for d_ in range(6):
                    n_d = nb_r[:, d_]
                    on = (n_d >= 0) & (centers_r >= 0)
                    r2, t2 = sacked[on], n_d[on]
                    hit = (self.improvement[r2, t2] >= 0) & ~self.pillaged[r2, t2]
                    self.pillaged[r2[hit], t2[hit]] = True
                self._eff_version += 1
            self.rc_hp[sacked, sc, sj] = round(self.rules.rivals.get("cityMaxHp", 200) / 2)

    def _in_enemy_zoc(self, dest: torch.Tensor, atwar: torch.Tensor) -> torch.Tensor:
        """B-3 ZOC (mirrors units.inEnemyZoc for a RIVAL mover): does `dest`
        sit adjacent to a MILITARY unit hostile to the mover? Barbarians exert
        it always; player military only while that mover's civ is at war
        (rivals never war each other, so their military never exerts). [B]->[B]."""
        hostmil = (self.barb_at >= 0) | ((self.pmil_at >= 0) & atwar.unsqueeze(1))
        dn = self.neigh[dest.clamp(min=0)]  # [B, 6] neighbor tile indices
        return ((dn >= 0) & hostmil.gather(1, dn.clamp(min=0))).any(dim=1)

    def _rival_unit_war_act(self, v: int, act: torch.Tensor) -> None:
        """hostileUnitAct for an at-war rival unit: attack the lowest-index
        adjacent target — player city, hostile unit (player or barbarian),
        or ANY city-center-district tile, where striking another rival's (or
        its own) center is a no-op quirk — else march toward the nearest
        player city."""
        B, T, dev = self.B, self.T, self.device
        here = self.v_tile[:, v]
        hc0 = here.clamp(min=0)
        # AUDIT A-6: attackTargets scans the unit's full RANGE (melee 1) over
        # the whole map in tile order — targets[0] = the LOWEST tile index in
        # reach. Classes unchanged: player center, any unit, any rival center
        # (striking another civ's — or its own — center stays the no-op quirk).
        vt0 = self.v_type[:, v].clamp(min=0, max=self.NU - 1)
        rngd = self._p_rng_str[vt0] > 0
        rng_u = torch.where(rngd, self._p_rng_rng[vt0], torch.ones_like(vt0))
        d_all = self.pair_dist[hc0].to(torch.long)  # [B, T]
        units_pl = (self.pmil_at >= 0) | (self.pciv_at >= 0) | (self.barb_at >= 0)
        # A-12b join-the-suzerain's-war: adjacent CS centers whose suzerain
        # is THE PLAYER (strict contest) are MELEE targets for an at-war
        # rival — attackTargets' csWar predicate (d==1, !ranged).
        cs_suz_t = None
        S = self.S
        if S > 0 and self.R > 0:
            suz_min = int(self.rules.cs.get("suzerainEnvoys", 3))
            suz_p = (
                (self.cs_envoys[:, :S] >= suz_min)
                & (self.cs_envoys[:, :S] > self.cs_r_envoys[:, :, :S].max(dim=1).values)
                & self.cs_alive[:, :S]
            )  # [B, S] the player's strict isSuzerain
            if bool(suz_p.any()):
                cs_suz_t = torch.zeros(B, T, dtype=torch.bool, device=dev)
                cs_suz_t.scatter_(1, self.cs_center[:, :S].clamp(min=0), suz_p)
            else:
                cs_suz_t = None
        valid = (
            (d_all >= 1)
            & (d_all <= rng_u.unsqueeze(1))
            & ((self.center_at >= 0) | units_pl | (self.rvcity_at >= 0))
        )
        if cs_suz_t is not None:
            valid = valid | (cs_suz_t & (d_all == 1) & ~rngd.unsqueeze(1))
        tkey = torch.where(valid, self._arangeT.unsqueeze(0).expand(B, T), torch.full((B, T), T + 1, dtype=torch.long, device=dev))
        target_tile = tkey.min(dim=1).values
        attack = act & (target_tile <= T)
        ttc = target_tile.clamp(max=T - 1)
        tgt_city = self.center_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        has_u = units_pl.gather(1, ttc.unsqueeze(1)).squeeze(1)
        city_att = attack & (tgt_city >= 0) & ~rngd
        unit_att = attack & (tgt_city < 0) & has_u & ~rngd
        # rival-center tiles without units: acted, nothing happens (no draws)

        if bool(city_att.any()):
            self._hostile_city_attack(city_att, tgt_city, "rival", v)
        if bool(unit_att.any()):
            self._hostile_vs_unit(unit_att, ttc, "rival", v)
        acted_att = city_att | unit_att
        # A-6: ranged rows strike instead — one roll, no retaliation; the
        # method returns the rows that actually rolled (quirk rows spend
        # nothing, mirroring hostileRangedStrike's early return).
        r_att = attack & rngd
        if bool(r_att.any()):
            acted_att = acted_att | self._hostile_ranged_strike(r_att, ttc, v)
        # A-12b: melee vs a player-suzerain CS CENTER — attackCityState with
        # the rival attacker: defCS = 15 + pop (+6 militaristic), the
        # csty/cstyc draw pair (the player block's exact order), attacker
        # consumed, NO advance; capture at 0 HP lands the CS as an rc.
        if cs_suz_t is not None:
            cs_s = self.cs_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
            cs_sc = cs_s.clamp(min=0)
            cs_att = (
                attack & ~rngd & (tgt_city < 0) & ~has_u
                & (self.rvcity_at.gather(1, ttc.unsqueeze(1)).squeeze(1) < 0)
                & (cs_s >= 0)
                & (self.cs_center.gather(1, cs_sc.unsqueeze(1)).squeeze(1) == ttc)
                & cs_suz_t.gather(1, ttc.unsqueeze(1)).squeeze(1)
                & (self._p_combat[vt0] > 0)
            )
            if bool(cs_att.any()):
                mil_idx = int(self.rules.cs.get("militaristicIdx", -1))
                def_cs = (
                    15 + self.cs_pop.gather(1, cs_sc.unsqueeze(1)).squeeze(1)
                    + (self.cs_type.gather(1, cs_sc.unsqueeze(1)).squeeze(1) == mil_idx).long() * 6
                )
                atk_e = self._p_combat[vt0] - self._wound(self.v_hp[:, v]) - 5.0 * self._river_cross(hc0, ttc)  # B-29 wound + river (CS center not a unit)
                d_cs = self._damage_roll(cs_att, atk_e - def_cs, k="csty", tile=ttc)
                d_atk = self._damage_roll(cs_att, def_cs - atk_e, k="cstyc", tile=ttc)
                rows = cs_att.nonzero(as_tuple=True)[0]
                self.cs_hp[rows, cs_sc[rows]] -= d_cs[rows]
                self.v_hp[:, v] = torch.where(cs_att, self.v_hp[:, v] - d_atk, self.v_hp[:, v])
                atk_dead = cs_att & (self.v_hp[:, v] <= 0)
                if bool(atk_dead.any()):
                    ar = atk_dead.nonzero(as_tuple=True)[0]
                    self.v_alive[ar, v] = False
                    self.rv_at[ar, hc0[ar]] = -1
                cap = cs_att & (self.cs_hp.gather(1, cs_sc.unsqueeze(1)).squeeze(1) <= 0)
                if bool(cap.any()):
                    self._capture_city_state_rival(cap.nonzero(as_tuple=True)[0], cs_sc, v)
                acted_att = acted_att | cs_att
        self.v_acted[:, v] = self.v_acted[:, v] | acted_att  # P4/D-2

        # Pillage: a war unit that did not attack, standing on an owned
        # improved unpillaged tile, pillages it (hold — no march), mirroring
        # hostileUnitAct's pillage branch. P4/D-20: only FOOD improvements
        # heal the pillager (+25).
        hc = here.clamp(min=0)
        pillage = torch.zeros_like(act)
        if self.improvements_on:
            h_imp = self.improvement.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0
            h_unpil = ~self.pillaged.gather(1, hc.unsqueeze(1)).squeeze(1)
            h_owned = self.owner.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0
            pillage = act & ~attack & h_imp & h_unpil & h_owned
            if bool(pillage.any()):
                rows = pillage.nonzero(as_tuple=True)[0]
                heal_r = self._imp_heals[self.improvement[rows, hc[rows]].clamp(min=0)]
                self.pillaged[rows, hc[rows]] = True
                self.v_acted[rows, v] = True  # P4/D-2
                self._eff_version += 1
                hp_cap = self.rules.combat.get("unitHp", 100)
                self.v_hp[rows, v] = torch.where(
                    heal_r, (self.v_hp[rows, v] + 25).clamp(max=hp_cap), self.v_hp[rows, v]
                )

        # March target: nearest unpillaged owned improvement within dist < 13
        # (ties -> lowest tile index), else nearest player city — mirrors
        # hostileUnitAct's target scan (rivals raid your farms too).
        march = act & ~attack & ~pillage
        if not bool(march.any()):
            return
        arangeT = torch.arange(T, device=dev)
        if self.improvements_on:
            imp_job = (self.improvement >= 0) & ~self.pillaged & (self.owner >= 0)
            d_imp = self.pair_dist[hc.unsqueeze(1), arangeT.unsqueeze(0)].to(torch.long)
            ikey = torch.where(imp_job & (d_imp < 13), d_imp * (T + 1) + arangeT, torch.full_like(d_imp, 10**9))
            imp_min, imp_tgt = ikey.min(dim=1)
            has_imp = imp_min < 10**9
        else:
            has_imp = torch.zeros_like(act)
            imp_tgt = hc
        dc = self.pair_dist[hc.unsqueeze(1), self.site.clamp(min=0)].to(torch.long)
        ckey = torch.where(self.alive, dc * 16 + torch.arange(self.C, device=dev), 10**9)
        city_min = ckey.min(dim=1).values
        city_tgt = self.site.gather(1, ckey.argmin(dim=1, keepdim=True)).squeeze(1).clamp(min=0)
        tgt = torch.where(has_imp, imp_tgt, city_tgt)
        has_tgt = has_imp | (city_min < 10**9)
        d_here = self.pair_dist[hc, tgt].to(torch.long)
        # AUDIT A-8: the march walks REAL MP toward the (fixed) target — per
        # step: the passable free neighbor closest to it (ties to direction
        # order), move only if strictly closer, walkPath's charge (1 + hills
        # + slow feature = 1 + tmove//3, live/strip-adjusted, + 3 per
        # river-edge crossing); a full-MP unit always affords its first step.
        # 'rmil' (civ-aware), not "rival": the latter isn't a handled side so it fell to the
        # default "any unit blocks" — an at-war rival MILITARY unit must be able to stack onto
        # its OWN-civ civilian (Civ 6 cross-domain), matching TS tileFreeForUnit; else it detours.
        arange6 = torch.arange(6, device=dev)
        full_mp = self._p_moves[vt0]
        aw = self.r_atwar.gather(1, self.v_civ[:, v].clamp(min=0).unsqueeze(1)).squeeze(1)  # B-3: player-mil ZOC only at war
        mp = full_mp.clone()
        cur = here.clone()
        d_cur = d_here.clone()
        moving = march & has_tgt
        while bool(moving.any()):
            nb2 = self.neigh[cur.clamp(min=0)]
            nb2c = nb2.clamp(min=0)
            step_ok = (nb2 >= 0) & self.passable.gather(1, nb2c) & ~self._blocked_for(nb2, "rmil", civ=self.v_civ[:, v].unsqueeze(1))
            d_nb = self.pair_dist[tgt.unsqueeze(1), nb2c].to(torch.long)
            skey = torch.where(step_ok, d_nb * 8 + arange6, 10**9)
            best = skey.min(dim=1).values
            dir_i = (best % 8).clamp(max=5)
            dest = nb2.gather(1, dir_i.unsqueeze(1)).squeeze(1)
            cost = (
                1
                + torch.div(self.tmove.gather(1, dest.clamp(min=0).unsqueeze(1)).squeeze(1), 3, rounding_mode="floor")
                + 3 * ((self.river_mask.gather(1, cur.clamp(min=0).unsqueeze(1)).squeeze(1) >> dir_i) & 1)
            )
            # A-8: an improvement target is walked ONTO (pillage reads the
            # tile underfoot); a CITY target stops the march adjacent —
            # enemy centers can't be entered (real Civ 6), and a unit
            # standing on one could never attack it (the d>=1 scan).
            mv = (
                moving
                & (best < 10**9)
                & (torch.div(best, 8, rounding_mode="floor") < d_cur)
                & (has_imp | (torch.div(best, 8, rounding_mode="floor") >= 1))
                & ((mp >= cost) | (mp >= full_mp))
            )
            if not bool(mv.any()):
                break
            rows = mv.nonzero(as_tuple=True)[0]
            self.rv_at[rows, cur[rows]] = -1
            self.rv_at[rows, dest[rows]] = v
            self.v_tile[rows, v] = dest[rows]
            self.v_acted[rows, v] = True  # P4/D-2
            self._clear_camp_at(mv, dest, civ=self.v_civ[:, v])  # P5/S7 (C-3)
            mp = torch.where(mv, (mp - cost).clamp(min=0), mp)
            # B-3 ZOC: a march step ending adjacent to a hostile military unit
            # halts (movesLeft:=0 after paying the enter cost above).
            mp = torch.where(mv & self._in_enemy_zoc(dest, aw), torch.zeros_like(mp), mp)
            d_cur = torch.where(mv, torch.div(best, 8, rounding_mode="floor"), d_cur)
            cur = torch.where(mv, dest, cur)
            moving = mv & (mp > 0)

    def _hostile_city_attack(self, att: torch.Tensor, slot: torch.Tensor, atk_kind: str, u: int) -> None:
        """A hostile unit battering a PLAYER city (attackCity): garrison-
        aware defense, city-first rolls, sack at 0 HP."""
        if atk_kind == "barb":
            a_hp, a_at, a_tile, a_alive = self.u_hp, self.barb_at, self.u_tile, self.u_alive
            atk_cs = self._unit_combat[self.u_type[:, u]]
        else:
            a_hp, a_at, a_tile, a_alive = self.v_hp, self.rv_at, self.v_tile, self.v_alive
            atk_cs = self._p_combat[self.v_type[:, u]]
        city_max_hp = int(self.rules.combat.get("cityMaxHp", 200))
        sitec = self.site.clamp(min=0)
        # P4/D-22 (cityDefenseStrength): max(15, strongest melee ever) + 5
        # when the PLAYER's own military garrisons the center (a hostile
        # standing there is a besieger, not a garrison). No population term.
        gm = self.pmil_at.gather(1, sitec)
        gar = (gm.gather(1, slot.clamp(min=0).unsqueeze(1)).squeeze(1) >= 0).long()
        def_cs = torch.maximum(self.best_melee, torch.full_like(self.best_melee, 15)) + gar * 5
        _ct = self.site.gather(1, slot.clamp(min=0).unsqueeze(1)).squeeze(1)
        atk_e = atk_cs - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(a_tile[:, u], _ct)  # B-29 wound + river (city not a unit)
        d_city = self._damage_roll(att, atk_e - def_cs, k="pcty", tile=_ct)
        d_self = self._damage_roll(att, def_cs - atk_e, k="pctyc", tile=_ct)
        rows = att.nonzero(as_tuple=True)[0]
        cs = slot[rows]
        # AUDIT B-1: the ANCIENT_WALLS outer pool soaks the hit first, only
        # the spillover reaches city HP (mirrors attackCity).
        outer = self.outer_hp[rows, cs]
        absorbed = torch.minimum(outer, d_city[rows])
        self.outer_hp[rows, cs] = outer - absorbed
        self.city_hp[rows, cs] -= d_city[rows] - absorbed
        a_hp[:, u] = torch.where(att, a_hp[:, u] - d_self, a_hp[:, u])
        died = att & (a_hp[:, u] <= 0)
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            a_at[dr, a_tile[dr, u]] = -1
            a_alive[:, u] = a_alive[:, u] & ~died
        sacked_rows = rows[self.city_hp[rows, cs] <= 0]
        # V-W2 symmetric: a RIVAL conqueror TAKES the city (the loyalty-flip
        # transfer, mirroring transferCityToRival); barbarians still sack.
        if atk_kind == "rival" and len(sacked_rows) > 0:
            w_civ = self.v_civ[sacked_rows, u]
            for i in range(len(sacked_rows)):
                # P5/S1 (C-11b): the conqueror plunders +40 on a REAL
                # transfer — the C-5 raze (city cap) pays nothing, like TS.
                if self._transfer_city_to_rival(int(sacked_rows[i]), int(slot[sacked_rows[i]]), int(w_civ[i]), conquest=True):
                    self.r_treasury[int(sacked_rows[i]), int(w_civ[i])] += 40.0
            sacked_rows = sacked_rows[:0]  # transferred, not sacked
        if len(sacked_rows) > 0:
            sc = slot[sacked_rows]
            self.pop[sacked_rows, sc] = ((self.pop[sacked_rows, sc] * 3) // 4).clamp(min=1)
            loss = torch.minimum(
                torch.tensor(100.0, dtype=self.dtype, device=self.device),
                # GS: milli-round the treasury first — sub-milli non-dyadic-gold drift (invisible at
                # the milli trace tolerance) otherwise tips the ×0.2 round across a .5 boundary,
                # making the sack differ by 1 gold vs TS (which mirrors this same milli-round).
                js_round(js_round(self.treasury[sacked_rows] * 1000) / 1000 * 0.2).to(self.dtype),
            )
            self.treasury[sacked_rows] -= loss
            self.city_hp[sacked_rows, sc] = round(city_max_hp / 2)
            if self.improvements_on:
                # sackCity pillages the improvements on the 6 tiles adjacent
                # to the sacked city's center.
                centers = self.site[sacked_rows, sc]  # [K]
                nb = self.neigh[centers]  # [K, 6]
                for d in range(6):
                    n_d = nb[:, d]
                    on = n_d >= 0
                    r2, t2 = sacked_rows[on], n_d[on]
                    hit = (self.improvement[r2, t2] >= 0) & ~self.pillaged[r2, t2]
                    self.pillaged[r2[hit], t2[hit]] = True
                self._eff_version += 1

    def _hostile_ranged_strike(self, att: torch.Tensor, tgt: torch.Tensor, v: int) -> torch.Tensor:
        """AUDIT A-6: a rival RANGED unit strikes tile tgt (TS
        hostileRangedStrike) — one roll, no retaliation, no advance. A
        PLAYER city takes the hit first even through a garrison
        (meleeAttack's city precedence) and HOLDS at 1 HP — ranged fire
        never captures; else the units on the tile (military first;
        civilians take the roll too — rangedAttack's convention, not the
        melee roll-free kill). Any other civ's center tile is the melee
        scan's same no-op quirk: nothing happens, nothing is spent.
        Returns the rows that actually struck (the v_acted set)."""
        ttc = tgt.clamp(min=0)
        vt0 = self.v_type[:, v].clamp(min=0, max=self.NU - 1)
        atk_rs = self._p_rng_str[vt0]
        tgt_city = self.center_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        city_att = att & (tgt_city >= 0)
        if bool(city_att.any()):
            # cityDefenseStrength: max(15, strongest melee ever) + 5 when the
            # player's own military garrisons the center (P4/D-22)
            gm = self.pmil_at.gather(1, self.site.clamp(min=0))
            gar = (gm.gather(1, tgt_city.clamp(min=0).unsqueeze(1)).squeeze(1) >= 0).long()
            def_cs = torch.maximum(self.best_melee, torch.full_like(self.best_melee, 15)) + gar * 5
            atk_e = atk_rs - self._wound(self.v_hp[:, v])  # B-29 (city not a unit)
            d_city = self._damage_roll(city_att, atk_e - def_cs, k="vrngc", tile=tgt)
            rows = city_att.nonzero(as_tuple=True)[0]
            cs_ = tgt_city[rows]
            self.city_hp[rows, cs_] = (self.city_hp[rows, cs_] - d_city[rows]).clamp(min=1)
        # units: the defender is the tile's military if any (the player's, or
        # the barbarian — one side per tile), else the lone player civilian
        dm = self.pmil_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        db = self.barb_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        dc_ = self.pciv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        unit_att = att & (tgt_city < 0) & ((dm >= 0) | (db >= 0) | (dc_ >= 0))
        if bool(unit_att.any()):
            def_is_b = (dm < 0) & (db >= 0)
            def_is_c = (dm < 0) & (db < 0) & (dc_ >= 0)
            d_cs_p = self._p_combat[self.p_type.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)]
            d_cs_b = self._unit_combat[self.u_type.gather(1, db.clamp(min=0).unsqueeze(1)).squeeze(1)]
            d_cs_c = self._p_combat[self.p_type.gather(1, dc_.clamp(min=0).unsqueeze(1)).squeeze(1)]
            f_p = self.p_fortify.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)
            f_b = self.u_fortify.gather(1, db.clamp(min=0).unsqueeze(1)).squeeze(1)
            f_c = self.p_fortify.gather(1, dc_.clamp(min=0).unsqueeze(1)).squeeze(1)  # player civilian: never fortifies (0)
            def_fort = torch.where(def_is_b, f_b, torch.where(def_is_c, f_c, f_p)) * 3  # B-5
            def_cs = torch.where(def_is_b, d_cs_b, torch.where(def_is_c, d_cs_c, d_cs_p)) + self.tdef.gather(1, ttc.unsqueeze(1)).squeeze(1) + def_fort
            # B-29: ranged attacker + defender wounded (no river for ranged).
            d_hp_p = self.p_hp.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)
            d_hp_b = self.u_hp.gather(1, db.clamp(min=0).unsqueeze(1)).squeeze(1)
            d_hp_c = self.p_hp.gather(1, dc_.clamp(min=0).unsqueeze(1)).squeeze(1)
            def_hp = torch.where(def_is_b, d_hp_b, torch.where(def_is_c, d_hp_c, d_hp_p))
            atk_e = atk_rs - self._wound(self.v_hp[:, v])
            def_e = def_cs - self._wound(def_hp)
            # B-7 support: the defender (player military, barb, or the lone
            # player civilian — all player-side units are aided by adjacent
            # player military) gains support; no flanking (ranged, no retaliation).
            _dside = torch.where(def_is_b, torch.ones_like(dm), torch.zeros_like(dm))
            _, _sp = self._flank_support(tgt, _dside, torch.zeros_like(dm), torch.full_like(tgt, -1))
            def_e = def_e + SUPPORT_CS * _sp
            d_def = self._damage_roll(unit_att, atk_e - def_e, k="vrng", tile=tgt)
            rows = unit_att.nonzero(as_tuple=True)[0]
            for grp, at_map, hp_t, alive_t, slot_t in (
                (dm >= 0, self.pmil_at, self.p_hp, self.p_alive, dm),
                (def_is_b, self.barb_at, self.u_hp, self.u_alive, db),
                (def_is_c, self.pciv_at, self.p_hp, self.p_alive, dc_),
            ):
                g = rows[grp[rows]]
                if len(g) == 0:
                    continue
                ds = slot_t[g]  # paired rows — gather(1, …) would read rows 0..|g|
                hp_t[g, ds] -= d_def[g]
                dead = hp_t[g, ds] <= 0
                at_map[g[dead], ttc[g[dead]]] = -1
                alive_t[g[dead], ds[dead]] = False
        return city_att | unit_att

    def _rival_unit_peace_act(self, v: int, act: torch.Tensor, r: int) -> None:
        """Peacetime: snipe a barbarian in reach (ranged units at their full
        range — A-6), else drift home (patrol) — steps break ties in
        tilesWithin order, any unit blocks, and units within 3 of home stay
        put; the drift walks real MP (A-8)."""
        B, T, dev = self.B, self.T, self.device
        here = self.v_tile[:, v]
        hc0 = here.clamp(min=0)
        # AUDIT A-6: the self-defense scan runs at the unit's full range
        # (melee 1) in tile order — attackTargets at peace, where barbarians
        # are the only hostiles; ranged units snipe (one roll, no
        # retaliation) where a melee call would refuse the distant tile.
        vt0 = self.v_type[:, v].clamp(min=0, max=self.NU - 1)
        rngd = self._p_rng_str[vt0] > 0
        rng_u = torch.where(rngd, self._p_rng_rng[vt0], torch.ones_like(vt0))
        d_all = self.pair_dist[hc0].to(torch.long)  # [B, T]
        valid = (d_all >= 1) & (d_all <= rng_u.unsqueeze(1)) & (self.barb_at >= 0)
        tkey = torch.where(valid, self._arangeT.unsqueeze(0).expand(B, T), torch.full((B, T), T + 1, dtype=torch.long, device=dev))
        target_tile = tkey.min(dim=1).values
        attack = act & (target_tile <= T)
        ttc = target_tile.clamp(max=T - 1)
        if bool((attack & ~rngd).any()):
            self._hostile_vs_unit(attack & ~rngd, ttc, "rival", v)
        acted_pk = attack & ~rngd
        if bool((attack & rngd).any()):
            acted_pk = acted_pk | self._hostile_ranged_strike(attack & rngd, ttc, v)
        self.v_acted[:, v] = self.v_acted[:, v] | acted_pk  # P4/D-2
        patrol = act & ~attack
        if not bool(patrol.any()):
            return
        dh = self.pair_dist[hc0.unsqueeze(1), self.rc_center[:, r].clamp(min=0)].to(torch.long)
        hkey = torch.where(self.rc_alive[:, r], dh * 16 + torch.arange(self.RC, device=dev), 10**9)
        home = self.rc_center[:, r].gather(1, hkey.argmin(dim=1, keepdim=True)).squeeze(1).clamp(min=0)
        # AUDIT A-8: the drift walks REAL MP — home is picked once, each step
        # re-checks the within-3 stop and re-runs the free-neighbor scan
        # (PATROL_DIR_PERM tie-break, any unit blocks), pays walkPath's
        # charge; a full-MP unit always affords its first step.
        arange6 = torch.arange(6, device=dev)
        perm_t = torch.tensor(PATROL_DIR_PERM, device=dev, dtype=torch.long)
        full_mp = self._p_moves[vt0]
        aw = self.r_atwar.gather(1, self.v_civ[:, v].clamp(min=0).unsqueeze(1)).squeeze(1)  # B-3 (False at peace)
        mp = full_mp.clone()
        cur = here.clone()
        moving = patrol & (hkey.min(dim=1).values < 10**9)
        while bool(moving.any()):
            curc = cur.clamp(min=0)
            d_home = self.pair_dist[curc, home].to(torch.long)
            roam = moving & (d_home > 3)
            if not bool(roam.any()):
                break
            nbp = self.neigh[curc][:, PATROL_DIR_PERM]
            nbpc = nbp.clamp(min=0)
            free = (
                (nbp >= 0)
                & self.passable.gather(1, nbpc)
                & (self.barb_at.gather(1, nbpc) < 0)
                & (self.pmil_at.gather(1, nbpc) < 0)
                & (self.pciv_at.gather(1, nbpc) < 0)
                & (self.rv_at.gather(1, nbpc) < 0)
                & (self.rvciv_at.gather(1, nbpc) < 0)  # C1-B5b: TS patrol blocks on ANY unit — builders included
            )
            d_nb = self.pair_dist[home.unsqueeze(1), nbpc].to(torch.long)
            skey = torch.where(free, d_nb * 8 + arange6, 10**9)
            best = skey.min(dim=1).values
            pdir = (best % 8).clamp(max=5)
            dest = nbp.gather(1, pdir.unsqueeze(1)).squeeze(1)
            true_dir = perm_t[pdir]  # river bits index the NEIGH direction, not the patrol order
            cost = (
                1
                + torch.div(self.tmove.gather(1, dest.clamp(min=0).unsqueeze(1)).squeeze(1), 3, rounding_mode="floor")
                + 3 * ((self.river_mask.gather(1, curc.unsqueeze(1)).squeeze(1) >> true_dir) & 1)
            )
            mv = (
                roam
                & (best < 10**9)
                & (torch.div(best, 8, rounding_mode="floor") < d_home)
                & ((mp >= cost) | (mp >= full_mp))
            )
            if not bool(mv.any()):
                break
            rows = mv.nonzero(as_tuple=True)[0]
            self.rv_at[rows, cur[rows]] = -1
            self.rv_at[rows, dest[rows]] = v
            self.v_tile[rows, v] = dest[rows]
            self.v_acted[rows, v] = True  # P4/D-2
            self._clear_camp_at(mv, dest, civ=self.v_civ[:, v])  # P5/S7 (C-3)
            mp = torch.where(mv, (mp - cost).clamp(min=0), mp)
            # B-3 ZOC: a patrol step adjacent to a hostile military unit halts
            # (at peace only barbarians exert it — aw is False here).
            mp = torch.where(mv & self._in_enemy_zoc(dest, aw), torch.zeros_like(mp), mp)
            cur = torch.where(mv, dest, cur)
            moving = mv & (mp > 0)

    def _rival_cs_phase(self, r: int, active: torch.Tensor) -> None:
        """AUDIT A-12: CS diplomacy from the rival's seat — the rivalPhase
        block after boost detection. Meet by PROXIMITY (a living city center
        or unit of this civ within meetRange of the CS center — rivals have
        no fog; the player meets via isExplored), then the player's
        influence→envoy accrual (flat rate + the adopted government's tier,
        gated on the A-7r switch), then the scripted greedy assignment:
        neediest met CS by THIS civ's own envoys, ties to the lowest id,
        until the bank is spent (the envoys*64+id key, the player's
        scripted-assign encoding)."""
        if self.S == 0:
            return
        B, S, dev = self.B, self.S, self.device
        rr = self.rules.cs
        csc = self.cs_center[:, :S].clamp(min=0)  # [B, S]
        meet_range = int(rr.get("meetRange", 3))
        # cities within range
        rcc = self.rc_center[:, r].clamp(min=0)  # [B, RC]
        d_city = self.pair_dist[csc.unsqueeze(2), rcc.unsqueeze(1)] <= meet_range  # [B, S, RC]
        near = (d_city & self.rc_alive[:, r].unsqueeze(1)).any(dim=2)
        # units of this civ within range
        vmask = self.v_alive & (self.v_civ == r)  # [B, V]
        if bool(vmask.any()):
            d_unit = self.pair_dist[csc.unsqueeze(2), self.v_tile.clamp(min=0).unsqueeze(1)] <= meet_range  # [B, S, V]
            near = near | (d_unit & vmask.unsqueeze(1)).any(dim=2)
        newly = active.unsqueeze(1) & self.cs_alive[:, :S] & ~self.cs_r_met[:, r, :S] & near
        self.cs_r_met[:, r, :S] = self.cs_r_met[:, r, :S] | newly
        met_live = self.cs_r_met[:, r, :S] & self.cs_alive[:, :S]
        any_met = active & met_live.any(dim=1)
        if not bool(any_met.any()):
            return
        pt = torch.full((B,), float(rr.get("influencePerTurn", 3)), dtype=torch.float64, device=dev)
        if self._gov_live:
            # the rival's adopted government tier (derived from ITS civics —
            # the computeAdoption twin the A-7r machinery already provides)
            pt = pt + self._adopted_gov_tier(self.r_civics[:, r]).double()
        self.r_influence[:, r] = self.r_influence[:, r] + torch.where(any_met, pt, torch.zeros_like(pt))
        cost = float(rr.get("envoyCost", 100))
        for _ in range(3):  # the player conversion loop's bound
            earn = any_met & (self.r_influence[:, r] >= cost)
            if not bool(earn.any()):
                break
            self.r_influence[:, r] = torch.where(earn, self.r_influence[:, r] - cost, self.r_influence[:, r])
            self.r_envoys_avail[:, r] = self.r_envoys_avail[:, r] + earn.long()
        for _ in range(4):  # assignment until spent (bank grows ≤1/turn)
            can = any_met & (self.r_envoys_avail[:, r] > 0)
            if not bool(can.any()):
                return
            key = torch.where(
                met_live,
                self.cs_r_envoys[:, r, :S] * 64 + torch.arange(S, device=dev).view(1, -1),
                torch.full((B, S), 10**9, dtype=torch.long, device=dev),
            )
            pick = key.argmin(dim=1)
            rows = can.nonzero(as_tuple=True)[0]
            self.cs_r_envoys[rows, r, pick[rows]] += 1
            self.r_envoys_avail[:, r] = self.r_envoys_avail[:, r] - can.long()

    def _rival_trade_phase(self, r: int, active: torch.Tensor) -> None:
        """AUDIT A-11: ONE new domestic route per civ per turn while under
        capacity — the rivalPhase creation block. Capacity mirrors
        rivalTradeCapacity: FOREIGN_TRADE civic +1, Market-OR-Lighthouse per
        living city +1 (non-cumulative, the D-7 rule), completed
        Colossus/Great Zimbabwe +1 each (no CS-suzerain term until A-12).
        Pair pick mirrors the TS scan exactly: best NEW in-range pair by
        routeYields(dest) food+prod sum — dest-only, 2 + 2*floor(
        destCompletedSpecialty/2) — with strictly-greater-beats semantics,
        so ties keep the FIRST pair in (from asc, to asc) slot order (rc
        slot order == TS array order: founding/capture/transfer all append
        at last-alive+1 and _reclaim_rc is stable)."""
        B, RC, dev = self.B, self.RC, self.device
        alive = self.rc_alive[:, r]  # [B, RC]
        # A-12b: ONE city suffices now — a met CS is a routable dest (the TS
        # gate is rival.cities.length >= 1); domestic pairs still need 2 via
        # the pair masks below.
        want = active & (alive.sum(dim=1) >= 1)
        if not bool(want.any()):
            return
        cap = torch.zeros(B, dtype=torch.long, device=dev)
        if self._trade_ftc >= 0:
            cap = cap + self.r_civics[:, r, self._trade_ftc].long()
        mkt = torch.zeros(B, RC, dtype=torch.bool, device=dev)
        if self._trade_mkt >= 0:
            mkt = mkt | self.rc_bldg[:, r, :, self._trade_mkt]
        if self._trade_lgh >= 0:
            mkt = mkt | self.rc_bldg[:, r, :, self._trade_lgh]
        cap = cap + (mkt & alive).sum(dim=1)
        for wi in self._trade_wonders:
            wt = self.rc_wonder[:, r, :, wi]  # [B, RC] — wonder wi's tile per slot
            cap = cap + ((wt >= 0) & alive & self.built_wonder_complete.gather(1, wt.clamp(min=0))).sum(dim=1)
        # A-12b: +1 per trade-type CS this rival is SUZERAIN of (the strict
        # contest: >= suzerainEnvoys, strictly more than the player AND every
        # other rival — rivalIsSuzerain's exact predicate; alive-gated, the
        # TS existing-cityStates iteration).
        S = self.S
        if S > 0:
            trade_ti = int(self.rules.cs.get("tradeIdx", -1))
            suz_min = int(self.rules.cs.get("suzerainEnvoys", 3))
            mine_e = self.cs_r_envoys[:, r, :S]  # [B, S]
            oth_e = self.cs_r_envoys[:, :, :S].clone()
            oth_e[:, r] = -1
            oth_max = oth_e.max(dim=1).values  # [B, S]
            suz_r = (
                (mine_e >= suz_min)
                & (mine_e > self.cs_envoys[:, :S])
                & (mine_e > oth_max)
                & self.cs_alive[:, :S]
            )
            cap = cap + (suz_r & (self.cs_type[:, :S] == trade_ti)).sum(dim=1)
        used = (self.r_routes[:, r, :, 0] >= 0).sum(dim=1)
        want = want & (used < cap)
        if not bool(want.any()):
            return
        # dest score (j-only): routeYields food+prod = 2 + 2*floor(spec/2)
        dt = self.rc_dist_tile[:, r]  # [B, RC, nD]
        comp = (dt >= 0) & self.district_complete.gather(1, dt.clamp(min=0).reshape(B, -1)).reshape_as(dt)
        spec = (comp & self._is_specialty.view(1, 1, -1)).sum(dim=2)  # [B, RC]
        ysum = 2 + 2 * (spec // 2)  # [B, RC] long, >= 2
        centers = self.rc_center[:, r].clamp(min=0)  # [B, RC]
        d = self.pair_dist[centers.unsqueeze(2), centers.unsqueeze(1)]  # [B, RC, RC]
        ids = self.rc_id[:, r]  # [B, RC]
        rr = self.r_routes[:, r]  # [B, K, 2]
        exists = (
            (rr[:, :, 0].view(B, 1, 1, -1) == ids.view(B, RC, 1, 1))
            & (rr[:, :, 1].view(B, 1, 1, -1) == ids.view(B, 1, RC, 1))
        ).any(dim=3)  # [B, RC, RC]
        eye = torch.eye(RC, dtype=torch.bool, device=dev).view(1, RC, RC)
        valid = (
            alive.unsqueeze(2)
            & alive.unsqueeze(1)
            & ~eye
            & (d <= self._trade_range)
            & ~exists
            & want.view(B, 1, 1)
        )
        key = torch.where(valid, ysum.unsqueeze(1).expand(B, RC, RC), torch.full((B, RC, RC), -1, dtype=torch.long, device=dev))
        # A-12b: MET city-states join each origin's candidate list AFTER the
        # domestic dests (the TS per-from iteration order: cities asc, then
        # CS asc — the i-major flat scan preserves it). A CS route's ySum is
        # the flat csRouteYields total (gold + specialty).
        W2 = RC
        if S > 0:
            _tr = self.rules.trade or {}
            ysum_cs = int(_tr.get("csRouteGold", 3)) + int(_tr.get("csRouteSpec", 1))
            csc = self.cs_center[:, :S].clamp(min=0)  # [B, S]
            d_cs = self.pair_dist[centers.unsqueeze(2), csc.unsqueeze(1)]  # [B, RC, S]
            cs_to = -(2 + torch.arange(S, device=dev))  # encoded dest ids
            exists_cs = (
                (rr[:, :, 0].view(B, 1, 1, -1) == ids.view(B, RC, 1, 1))
                & (rr[:, :, 1].view(B, 1, 1, -1) == cs_to.view(1, 1, S, 1))
            ).any(dim=3)  # [B, RC, S]
            valid_cs = (
                alive.unsqueeze(2)
                & (self.cs_r_met[:, r, :S] & self.cs_alive[:, :S]).unsqueeze(1)
                & (d_cs <= self._trade_range)
                & ~exists_cs
                & want.view(B, 1, 1)
            )
            key_cs = torch.where(valid_cs, torch.full((B, RC, S), ysum_cs, dtype=torch.long, device=dev), torch.full((B, RC, S), -1, dtype=torch.long, device=dev))
            key = torch.cat([key, key_cs], dim=2)  # [B, RC, RC+S]
            W2 = RC + S
        kf = key.reshape(B, RC * W2)  # i-major flat order = the TS from-asc, dests-then-CS scan
        kmax, _ = kf.max(dim=1)
        first = torch.where(kf == kmax.unsqueeze(1), torch.arange(RC * W2, device=dev).view(1, -1), torch.full((1, RC * W2), RC * W2, device=dev)).min(dim=1).values
        do = want & (kmax >= 0)
        if not bool(do.any()):
            return
        rows = do.nonzero(as_tuple=True)[0]
        i_pick = (first[rows] // W2)
        jj_pick = (first[rows] % W2)
        from_id = ids[rows, i_pick]
        to_id = torch.where(jj_pick < RC, ids[rows, jj_pick.clamp(max=RC - 1)], -(2 + (jj_pick - RC)))
        free = self.r_routes[rows, r, :, 0] < 0  # [n, K]
        K = free.shape[1]
        slot = torch.where(free, torch.arange(K, device=dev).view(1, -1), torch.full((1, K), K, device=dev)).min(dim=1).values
        assert int(slot.max()) < K, "r_routes columns exhausted — raise K above the capacity bound"
        self.r_routes[rows, r, slot, 0] = from_id
        self.r_routes[rows, r, slot, 1] = to_id

    def _rival_phase(self) -> None:
        """Mirrors rivalPhase, rival by rival in id order — queue picks for
        the pre-turn city set, then per-city economy (yields, growth, queue
        progress/completion: settlers found, units spawn at their city — the
        old pooled stocks and their home-pick draw are gone, C1-B2), border
        growth, great-people/pantheon/belief races (draws), then war or
        peace acts with their end-of-branch rolls."""
        if self.R == 0:
            return
        rr, B, dev = self.rules.rivals, self.B, self.device
        for r in range(self.R):
            n_cities = self.rc_alive[:, r].sum(dim=1)
            active = self.r_alive[:, r] & (n_cities > 0)
            if not bool(active.any()):
                continue
            # B-15: this rival's war weariness — accrue while at war, decay in
            # peace (war state as of last turn; declare/peace run later in this
            # phase). Symmetric with the player + the TS rival block top.
            rww = self.rules.war_weariness
            atw_r = self.r_atwar[:, r]
            inc_r = (self.r_war_weariness[:, r] + int(rww.get("perTurn", 1))).clamp(max=int(rww.get("cap", 24)))
            dec_r = (self.r_war_weariness[:, r] - int(rww.get("decay", 4))).clamp(min=0)
            self.r_war_weariness[:, r] = torch.where(active, torch.where(atw_r, inc_r, dec_r), self.r_war_weariness[:, r])
            # AUDIT A-3: eurekas/inspirations from this rival's seat — the
            # TS twin runs at the same point (the rival's block top).
            self._detect_rival_boosts(r, active)
            # AUDIT A-12: the CS-diplomacy block sits right after boost
            # detection — the exact rivalPhase position.
            self._rival_cs_phase(r, active)
            # C1-B2: queue PICKS for the PRE-TURN city set, in slot order —
            # the capital (rc_is_cap, the rivals.ts:1077 rc.isCapital gate;
            # P7-FULL: compaction can move it off slot 0) prefers the
            # settler with one in flight per civ, everyone else trains
            # units up to the cap. Counts update sequentially, exactly
            # like the TS pick loop.
            alive0 = self.rc_alive[:, r].clone()  # newborns must not act this turn
            n_units = (self.v_alive & (self.v_civ == r)).sum(dim=1)
            unit_count = n_units + ((self.rc_current[:, r] >= 1) & (self.rc_current[:, r] <= self.NU)).sum(dim=1)  # units only — district codes sit above NU
            settler_q = (alive0 & (self.rc_current[:, r] == 0)).any(dim=1)
            cap = n_cities * 2 + torch.where(self.r_atwar[:, r], 3, 1)
            # C1-B3b: unit type gates on the rival's REAL techs
            rres = rr.get("research", {})
            sp_t, ho_t = int(rres.get("spearTech", -1)), int(rres.get("horseTech", -1))
            zb = torch.zeros(B, dtype=torch.bool, device=dev)
            has_h = self.r_techs[:, r, ho_t] if ho_t >= 0 else zb
            has_s = self.r_techs[:, r, sp_t] if sp_t >= 0 else zb
            ty = torch.where(
                has_h,
                torch.tensor(self._r_horseman, device=dev),
                torch.where(has_s, torch.tensor(self._r_spearman, device=dev), torch.tensor(self._warrior_idx, device=dev)),
            )
            # AUDIT A-6: army composition — military only (builders excluded
            # via combat 0), live + queued, updated through the pick loop
            # exactly like TS's meleeCount/rangedCount; train ranged while
            # the army holds fewer than 1 ranged per 2 melee. ARCHER once
            # archerTech lands, SLINGER before (ungated, like the catalog).
            vt_all = self.v_type.clamp(min=0, max=self.NU - 1)
            rng_type = self._p_rng_str > 0  # [NU]
            mil_live = self.v_alive & (self.v_civ == r) & (self._p_combat[vt_all] > 0)
            n_ranged = (mil_live & rng_type[vt_all]).sum(dim=1)
            n_melee = (mil_live & ~rng_type[vt_all]).sum(dim=1)
            qcur = self.rc_current[:, r]
            q_ty = (qcur - 1).clamp(min=0, max=self.NU - 1)
            q_mil = (qcur >= 1) & (qcur <= self.NU) & (self._p_combat[q_ty] > 0)
            n_ranged = n_ranged + (q_mil & rng_type[q_ty]).sum(dim=1)
            n_melee = n_melee + (q_mil & ~rng_type[q_ty]).sum(dim=1)
            ar_t = int(rres.get("archerTech", -1))
            has_a = self.r_techs[:, r, ar_t] if (ar_t >= 0 and self._r_archer >= 0) else zb
            if self._r_slinger >= 0:
                ty_rng = torch.where(
                    has_a,
                    torch.tensor(max(self._r_archer, 0), device=dev),
                    torch.tensor(self._r_slinger, device=dev),
                )
                has_rng_type = torch.ones(B, dtype=torch.bool, device=dev)
            else:
                ty_rng = ty
                has_rng_type = torch.zeros(B, dtype=torch.bool, device=dev)
            settle_cost = rr.get("settlerBase", 48) + rr.get("settlerPer", 18) * (n_cities - 1).clamp(min=0).double()
            scripted_r = ~self.controlled[:, r]  # C2b: the picker only drives scripted rivals
            # G3-A: ONE guard sync for the whole pick loop instead of a per-j
            # any(). Exact because iteration j writes only column j of
            # rc_current[:, r] (every pick targets city j) and active/
            # scripted_r/alive0 are loop-invariant clones/locals.
            idle_all = (active & scripted_r).unsqueeze(1) & alive0 & (self.rc_current[:, r] == -1)
            idle_any_l = idle_all.any(dim=0).tolist()
            if self.districts_on and (self._scaffold or self._proj_rows):
                # G3-B hoist: the district-cost curve reads r_techs/r_civics,
                # which nothing in the pick loop writes — j-invariant.
                dcp = self.rules.district_cost
                t_pct = self.r_techs[:, r].sum(dim=1).double() / float(self.rules_dev.t_cost.shape[0])
                c_pct = self.r_civics[:, r].sum(dim=1).double() / float(self.rules_dev.c_cost.shape[0])
                d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct, c_pct)))
            if self.districts_on:
                # G3-B: the req-building pick block vectorized over j. Inputs:
                # rc_bldg / r_techs / r_civics / rc_center / tile_river /
                # rc_dist_tile / district_complete — none written by the pick
                # loop. The one same-j write, _place_district_rival registering
                # rc_dist_tile[:, r, j, di] before the building block runs, is
                # value-neutral: a just-placed district is INCOMPLETE, so its
                # dcomp term is False exactly as the pre-placement reg_t = -1
                # was (wonder paves touch feature/improvement planes only).
                rdv3 = self.rules_dev
                NBn = rdv3.b_cost.shape[0]
                have_bA = self.rc_bldg[:, r]  # [B, RC, NB]
                ones_nb = torch.ones(B, NBn, dtype=torch.bool, device=dev)
                unl_b = torch.where(
                    rdv3.b_unlock.unsqueeze(0) >= 0,
                    self.r_techs[:, r].gather(1, rdv3.b_unlock.clamp(min=0).unsqueeze(0).expand(B, -1)),
                    ones_nb,
                ) & torch.where(
                    rdv3.b_unlock_civic.unsqueeze(0) >= 0,
                    self.r_civics[:, r].gather(1, rdv3.b_unlock_civic.clamp(min=0).unsqueeze(0).expand(B, -1)),
                    ones_nb,
                )  # [B, NB] — j-invariant (previously rebuilt per j)
                riv_cA = self.tile_river.gather(1, self.rc_center[:, r].clamp(min=0))  # [B, RC]
                ok_bA = unl_b.unsqueeze(1) & ~have_bA & (~rdv3.b_river.view(1, 1, -1) | riv_cA.unsqueeze(2))
                reqd_b = rdv3.b_req_district  # [NB]
                reg_tA = self.rc_dist_tile[:, r].gather(2, reqd_b.clamp(min=0).view(1, 1, -1).expand(B, self.RC, -1))
                dcompA = (reg_tA >= 0) & self.district_complete.gather(1, reg_tA.clamp(min=0).reshape(B, -1)).reshape_as(reg_tA)
                ok_bA &= torch.where(reqd_b.view(1, 1, -1) >= 0, dcompA, torch.ones_like(dcompA))
                for bi2, reqs in enumerate(self.rules.b_req_buildings):
                    if reqs:
                        ok_bA[:, :, bi2] &= have_bA[:, :, torch.tensor(reqs, device=dev, dtype=torch.long)].any(dim=2)
                arNB = torch.arange(NBn, device=dev, dtype=rdv3.b_cost.dtype)
                inf_bA = torch.full((B, self.RC, NBn), float("inf"), dtype=rdv3.b_cost.dtype, device=dev)
                key_bA = torch.where(ok_bA, rdv3.b_cost.view(1, 1, -1) * 1024 + arNB, inf_bA)  # the *1024+arNB tie-break key, verbatim
                bi_A = key_bA.argmin(dim=2)  # [B, RC]
                okb_anyA = ok_bA.any(dim=2)  # [B, RC]
                code_bA = bi_A + (1 + self.NU + len(self._scaffold))
                cost_bA = rdv3.b_cost[bi_A].double()
            for j in range(self.RC):
                if not idle_any_l[j]:
                    continue
                idle = idle_all[:, j]
                want_s = idle & ~settler_q & (n_cities < rr.get("maxCities", 6)) & self.rc_is_cap[:, r, j]
                if bool(want_s.any()):
                    self.rc_current[:, r, j] = torch.where(want_s, torch.zeros_like(self.rc_current[:, r, j]), self.rc_current[:, r, j])
                    self.rc_cost[:, r, j] = torch.where(want_s, settle_cost, self.rc_cost[:, r, j])
                    self.rc_progress[:, r, j] = torch.where(want_s, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
                    settler_q = settler_q | want_s
                # C1-B4: districts outrank units (the economy compounds).
                # G3-A: rem_any is a live Python mirror of bool(rem.any()),
                # recomputed ONLY when rem is reassigned — replaces the per-si
                # re-test storm (the d_cost curve itself hoisted above).
                rem = idle & ~want_s
                rem_any = bool(rem.any())
                if self.districts_on and self._scaffold and rem_any:
                    cap_max = torch.div(self.rc_pop[:, r, j] - 1, 3, rounding_mode="floor") + 1
                    spec_cnt = ((self.rc_dist_tile[:, r, j] >= 0) & self._is_specialty).sum(dim=1)
                    for si, (di, utech, plc) in enumerate(self._scaffold):
                        if not rem_any:
                            break
                        has_tech = self.r_techs[:, r, utech] if utech >= 0 else torch.ones(B, dtype=torch.bool, device=dev)
                        not_owned = self.rc_dist_tile[:, r, j, di] < 0
                        under_cap = (spec_cnt < cap_max) if bool(self._is_specialty[di]) else torch.ones(B, dtype=torch.bool, device=dev)
                        want_d = rem & has_tech & not_owned & under_cap
                        if not bool(want_d.any()):
                            continue
                        # P4/D-8: discount read BEFORE the placement registers
                        disc = self._rival_district_discounted(r, di)
                        d_cost_si = torch.where(disc, torch.floor(d_cost * 0.6), d_cost)
                        placed = self._place_district_rival(r, j, di, want_d, plc)
                        if bool(placed.any()):
                            self.rc_current[:, r, j] = torch.where(placed, torch.full_like(self.rc_current[:, r, j], 1 + self.NU + si), self.rc_current[:, r, j])
                            self.rc_cost[:, r, j] = torch.where(placed, d_cost_si, self.rc_cost[:, r, j])
                            self.rc_progress[:, r, j] = torch.where(placed, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
                            spec_cnt = spec_cnt + (placed & torch.tensor(bool(self._is_specialty[di]), device=dev)).long()
                            rem = rem & ~placed
                            rem_any = bool(rem.any())
                # C1-B4b-2: then the CHEAPEST available building (catalog
                # order breaks cost ties, mirroring the TS scan). Gates: the
                # rival's own tech/civic unlocks, required district COMPLETE
                # (single-slot queues can't wait on one in flight), prereq
                # buildings, river for the Water Mill. G3-B: eligibility +
                # argmin precomputed for all j above; this is just the column
                # read under the surviving rem mask.
                if self.districts_on and rem_any:
                    want_b = rem & okb_anyA[:, j]
                    if bool(want_b.any()):
                        self.rc_current[:, r, j] = torch.where(want_b, code_bA[:, j], self.rc_current[:, r, j])
                        self.rc_cost[:, r, j] = torch.where(want_b, cost_bA[:, j], self.rc_cost[:, r, j])
                        self.rc_progress[:, r, j] = torch.where(want_b, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
                        rem = rem & ~want_b
                        rem_any = bool(rem.any())
                # AUDIT A-4: the CAPITAL raises a world wonder once
                # buildings run dry — first unlocked wonder in data order,
                # first eligible owned tile (LOWEST index); one per world
                # (the built_wonder plane counts in-flight: queueing paves
                # the tile, exactly like TS queueWonder).
                if self.districts_on and self._wond_n > 0 and rem_any and bool((rem & self.rc_is_cap[:, r, j]).any()):
                    remw = rem & self.rc_is_cap[:, r, j]
                    remw_any = True  # guarded non-empty above; live mirror below
                    d_ctr = self.pair_dist[self.rc_center[:, r, j].clamp(min=0)]  # [B, T]
                    base_ok = (
                        (self.rival_at == r)
                        & (d_ctr <= 3)
                        & (self.district < 0)
                        & (self.built_wonder < 0)
                        & (self.rvcity_at < 0)
                        & (self.center_at < 0)
                        & (self.res_priority <= 1)
                    )
                    for wi in range(self._wond_n):
                        if not remw_any:
                            break
                        wrow = self._wond_rows[wi]
                        if int(wrow.get("ut", -1)) == -3 or int(wrow.get("uc", -1)) == -3:
                            continue  # unlock absent from the compact tree — unreachable (TS includes() never matches)
                        okc = remw
                        if int(wrow.get("ut", -1)) >= 0:
                            okc = okc & self.r_techs[:, r, int(wrow["ut"])]
                        if int(wrow.get("uc", -1)) >= 0:
                            okc = okc & self.r_civics[:, r, int(wrow["uc"])]
                        if not bool(okc.any()):
                            continue
                        okc = okc & ~(self.built_wonder == wi).any(dim=1)
                        if not bool(okc.any()):
                            continue
                        adjD = int(wrow.get("adjD", -1))
                        if adjD == -3:
                            continue  # requires an out-of-catalog district — never placeable
                        cand_w = base_ok & ((self.wok >> wi) & 1).bool()
                        if adjD == -2:
                            cand_w = cand_w & (self._adj_center_count() > 0)
                        elif adjD >= 0:
                            cand_w = cand_w & self._adj_dtype_complete(adjD)
                        if int(wrow.get("adjR", -1)) >= 0:
                            cand_w = cand_w & self._adj_res_live(int(wrow["adjR"]))
                        has_w = okc & cand_w.any(dim=1)
                        if not bool(has_w.any()):
                            continue
                        keyw = torch.where(cand_w, self._arangeT_f, self._inf_f)
                        bw = keyw.argmin(dim=1)
                        rows_w = has_w.nonzero(as_tuple=True)[0]
                        bwt = bw[rows_w]
                        # queueWonder's tile writes: pave, improvement dies,
                        # feature dies EXCEPT floodplains, bonus resource
                        # stripped (the C-6 rule)
                        self.built_wonder[rows_w, bwt] = wi
                        self.built_wonder_complete[rows_w, bwt] = False
                        self.improvement[rows_w, bwt] = -1
                        nofp = self.feat_id[rows_w, bwt] != self._fp_fid
                        if bool(nofp.any()):
                            self._strip_feature_at(rows_w[nofp], bwt[nofp])
                        fresh_rs = (self.res_priority[rows_w, bwt] == 1) & ~self.res_stripped[rows_w, bwt]
                        self.res_stripped[rows_w, bwt] = self.res_stripped[rows_w, bwt] | (self.res_priority[rows_w, bwt] == 1)
                        self._withdraw_sea_adj(rows_w[fresh_rs], bwt[fresh_rs])
                        self.rc_wonder[rows_w, r, j, wi] = bwt
                        code_w = 1 + self.NU + len(self._scaffold) + self.rules_dev.b_cost.shape[0] + len(self._proj_rows) + wi
                        self.rc_current[:, r, j] = torch.where(has_w, torch.full_like(self.rc_current[:, r, j], code_w), self.rc_current[:, r, j])
                        self.rc_cost[:, r, j] = torch.where(has_w, torch.full_like(self.rc_cost[:, r, j], float(wrow["cost"])), self.rc_cost[:, r, j])
                        self.rc_progress[:, r, j] = torch.where(has_w, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
                        self._eff_version += 1  # a pave: features/improvements changed under the caches
                        remw = remw & ~has_w
                        remw_any = bool(remw.any())
                        rem = rem & ~has_w
                        rem_any = bool(rem.any())
                # C1-B5b: one BUILDER per civ at a time, while a job exists.
                # A builder is a unit — it takes a cap slot like any other.
                if self.improvements_on and self._builder_idx >= 0 and rem_any:
                    has_alive = (self.v_alive & (self.v_civ == r) & (self.v_type == self._builder_idx)).any(dim=1)
                    # alive-masked (P5/S5): dead slots' queues are cleared at
                    # capture, but never trust a hole
                    has_q = ((self.rc_current[:, r] == self._builder_idx + 1) & self.rc_alive[:, r]).any(dim=1)
                    want_bd = rem & ~(has_alive | has_q) & self._rival_job_mask(r).any(dim=1) & (unit_count < cap)
                    if bool(want_bd.any()):
                        # P4/D-10: the rival's own escalator (one builder per
                        # civ at a time, so no queued term — rivals.ts:860).
                        rb_cost = self._builder_cost(self.r_builders_trained[:, r]).double()
                        self.rc_current[:, r, j] = torch.where(want_bd, torch.full_like(self.rc_current[:, r, j], self._builder_idx + 1), self.rc_current[:, r, j])
                        self.rc_cost[:, r, j] = torch.where(want_bd, rb_cost, self.rc_cost[:, r, j])
                        self.rc_progress[:, r, j] = torch.where(want_bd, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
                        unit_count = unit_count + want_bd.long()
                        rem = rem & ~want_bd
                        rem_any = bool(rem.any())
                want_u = rem & (unit_count < cap)
                if bool(want_u.any()):
                    # A-6: the composition pick — ranged while under-shared,
                    # else the melee ladder; counts advance sequentially so
                    # this turn's later cities see this pick (the TS loop).
                    use_rng = has_rng_type & (n_ranged * 2 < n_melee)
                    ty_u = torch.where(use_rng, ty_rng, ty)
                    self.rc_current[:, r, j] = torch.where(want_u, ty_u + 1, self.rc_current[:, r, j])
                    self.rc_cost[:, r, j] = torch.where(want_u, self._p_cost[ty_u].double(), self.rc_cost[:, r, j])
                    self.rc_progress[:, r, j] = torch.where(want_u, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
                    unit_count = unit_count + want_u.long()
                    n_ranged = n_ranged + (want_u & use_rng).long()
                    n_melee = n_melee + (want_u & ~use_rng).long()
                # AUDIT A-14: army capped, nothing else queueable — run the
                # FIRST project whose district is COMPLETE (exported data
                # order); cost = the player's projectCost curve on the
                # RIVAL's research (max(round(15·speed), round(dCost·0.5))).
                if self.districts_on and self._proj_rows:
                    left_p = rem & ~want_u
                    if bool(left_p.any()):
                        # G3-B: d_cost hoisted above the j loop (same formula,
                        # same r_techs/r_civics inputs — nothing in the pick
                        # loop writes them, so the value is identical per j).
                        p_floor = float(round(15 * self.rules.game_speed))
                        p_cost = torch.maximum(torch.full_like(d_cost, p_floor), js_round(d_cost * 0.5))
                        for pi_, prow in enumerate(self._proj_rows):
                            if not bool(left_p.any()):
                                break
                            d_i = int(prow.get("d", -1))
                            if d_i < 0 or d_i >= self.rc_dist_tile.shape[3]:
                                continue
                            regp = self.rc_dist_tile[:, r, j, d_i]
                            has_pd = (regp >= 0) & self.district_complete.gather(1, regp.clamp(min=0).unsqueeze(1)).squeeze(1)
                            want_p = left_p & has_pd
                            if not bool(want_p.any()):
                                continue
                            code_pr = 1 + self.NU + len(self._scaffold) + self.rules_dev.b_cost.shape[0] + pi_
                            self.rc_current[:, r, j] = torch.where(want_p, torch.full_like(self.rc_current[:, r, j], code_pr), self.rc_current[:, r, j])
                            self.rc_cost[:, r, j] = torch.where(want_p, p_cost, self.rc_cost[:, r, j])
                            self.rc_progress[:, r, j] = torch.where(want_p, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
                            left_p = left_p & ~want_p

            # AUDIT A-5 (+A-5r): ONE gold purchase per civ per turn, priority
            # BUILDING > SETTLER > UNIT. Building: the cheapest completable
            # building anywhere in the civ (cost, then catalog id, then city
            # slot — the tryQueueRivalBuilding key), bought INSTANTLY at
            # goldPurchaseMult×, keeping the opening peace cost as a war chest.
            # A building queued in that same city is skipped (completion would
            # duplicate it). exclusiveWith stays TS-only, absent from the GPU
            # catalog like the queue paths. `bought_r5` threads the priority:
            # settler/unit run only where no building was bought (no war-chest
            # reserve — the controlled-head apply_rival_actions purchase spec).
            bought_r5 = torch.zeros(B, dtype=torch.bool, device=dev)
            if self.districts_on:
                rdv6 = self.rules_dev
                NB6 = rdv6.b_cost.shape[0]
                ones6 = torch.ones(B, NB6, dtype=torch.bool, device=dev)
                unl6 = torch.where(
                    rdv6.b_unlock.unsqueeze(0) >= 0,
                    self.r_techs[:, r].gather(1, rdv6.b_unlock.clamp(min=0).unsqueeze(0).expand(B, -1)),
                    ones6,
                ) & torch.where(
                    rdv6.b_unlock_civic.unsqueeze(0) >= 0,
                    self.r_civics[:, r].gather(1, rdv6.b_unlock_civic.clamp(min=0).unsqueeze(0).expand(B, -1)),
                    ones6,
                )
                elig6 = torch.zeros(B, self.RC, NB6, dtype=torch.bool, device=dev)
                for j6 in self.rc_alive[:, r].any(dim=0).nonzero(as_tuple=True)[0].tolist():  # D-4 style
                    al6 = active & self.rc_alive[:, r, j6]
                    if not bool(al6.any()):
                        continue
                    have6 = self.rc_bldg[:, r, j6]
                    ctile6 = self.rc_center[:, r, j6].clamp(min=0)
                    riv6 = self.tile_river.gather(1, ctile6.unsqueeze(1)).squeeze(1)
                    ok6 = unl6 & ~have6 & (~rdv6.b_river.view(1, -1) | riv6.unsqueeze(1))
                    reg6 = self.rc_dist_tile[:, r, j6].gather(1, rdv6.b_req_district.clamp(min=0).unsqueeze(0).expand(B, -1))
                    dc6 = (reg6 >= 0) & self.district_complete.gather(1, reg6.clamp(min=0))
                    ok6 = ok6 & torch.where(rdv6.b_req_district.unsqueeze(0) >= 0, dc6, ones6)
                    for bi6, reqs6 in enumerate(self.rules.b_req_buildings):
                        if reqs6:
                            ok6[:, bi6] &= have6[:, torch.tensor(reqs6, device=dev, dtype=torch.long)].any(dim=1)
                    qb6 = self.rc_current[:, r, j6] - (1 + self.NU + len(self._scaffold))
                    is_qb = (qb6 >= 0) & (qb6 < NB6)
                    if bool(is_qb.any()):
                        rows_q = is_qb.nonzero(as_tuple=True)[0]
                        ok6[rows_q, qb6[rows_q]] = False
                    elig6[:, j6] = ok6 & al6.unsqueeze(1)
                key6 = (rdv6.b_cost.view(1, 1, -1) * 1024 + torch.arange(NB6, device=dev, dtype=rdv6.b_cost.dtype).view(1, 1, -1)) * 32 \
                    + torch.arange(self.RC, device=dev, dtype=rdv6.b_cost.dtype).view(1, -1, 1)
                key6 = torch.where(elig6, key6.expand(B, -1, -1), torch.tensor(float("inf"), dtype=rdv6.b_cost.dtype, device=dev))
                flat6 = key6.reshape(B, -1)
                best6 = flat6.argmin(dim=1)
                has6 = active & torch.isfinite(flat6.gather(1, best6.unsqueeze(1)).squeeze(1))
                if bool(has6.any()):
                    jj6 = torch.div(best6, NB6, rounding_mode="floor")
                    bb6 = best6 % NB6
                    price6 = rdv6.b_cost.gather(0, bb6).double() * self.rules.gold_purchase_mult
                    reserve6 = float(rr.get("peaceGold0", 150))
                    can6 = has6 & (js_round(self.r_treasury[:, r] * 1000) >= js_round((price6 + reserve6) * 1000))
                    if bool(can6.any()):
                        rows6 = can6.nonzero(as_tuple=True)[0]
                        self.rc_bldg[rows6, r, jj6[rows6], bb6[rows6]] = True
                        if self._walls_bidx >= 0:  # AUDIT B-1
                            wm6 = rows6[bb6[rows6] == self._walls_bidx]
                            if len(wm6) > 0:
                                self.rc_outer_hp[wm6, r, jj6[wm6]] = self._walls_hp
                        self.r_treasury[:, r] = torch.where(can6, self.r_treasury[:, r] - price6, self.r_treasury[:, r])
                        bought_r5 = bought_r5 | can6

            # AUDIT A-5r: SETTLER — no building bought, under the city cap,
            # settler price × mult affordable. The rival has no settler bank,
            # so it founds IMMEDIATELY via the same site scan a completed
            # settler runs (_rival_try_found); pay only where a city was
            # actually founded (no site = refund). The newborn joins THIS
            # turn's amenity map + city loop (alive_c below, the TS
            # [...rival.cities] snapshot taken after this block).
            mult_r5 = self.rules.gold_purchase_mult
            sett_price5 = settle_cost * mult_r5  # settle_cost = settlerBase + settlerPer·(n_cities−1), from the picker
            want_s5 = active & ~bought_r5 & (n_cities < rr.get("maxCities", 6)) & self._afford(self.r_treasury[:, r], sett_price5)
            if bool(want_s5.any()):
                n_before5 = self.rc_alive[:, r].sum(dim=1)
                self._rival_try_found(r, want_s5)
                founded5 = want_s5 & (self.rc_alive[:, r].sum(dim=1) > n_before5)
                self.r_treasury[:, r] = torch.where(founded5, self.r_treasury[:, r] - sett_price5, self.r_treasury[:, r])
                bought_r5 = bought_r5 | founded5
            # AUDIT A-5r: MILITARY UNIT — nothing else bought and live+queued
            # military under the #56 H1 quota (2× cities). Buy the STRONGEST
            # affordable trainable military unit (highest _p_combat, ties to
            # lowest unit index = table order), spawned via _spawn_rival at the
            # capital (else the first alive city); pay only where it LANDED
            # (no free spot = refund, the P5/S8 pattern).
            mil_count5 = n_melee + n_ranged
            want_u5 = active & ~bought_r5 & (mil_count5 < 2 * n_cities)
            if bool(want_u5.any()):
                ok_u5 = torch.zeros(B, self.NU, dtype=torch.bool, device=dev)
                ok_u5[:, self._warrior_idx] = True
                if sp_t >= 0 and self._r_spearman >= 0:
                    ok_u5[:, self._r_spearman] = self.r_techs[:, r, sp_t]
                if ho_t >= 0 and self._r_horseman >= 0:
                    ok_u5[:, self._r_horseman] = self.r_techs[:, r, ho_t]
                if self._r_slinger >= 0:
                    ok_u5[:, self._r_slinger] = True
                if ar_t >= 0 and self._r_archer >= 0:
                    ok_u5[:, self._r_archer] = self.r_techs[:, r, ar_t]
                mil5 = ok_u5 & (self._p_combat.unsqueeze(0) > 0)  # military only (excludes the builder)
                afford_u5 = self._afford(self.r_treasury[:, r].unsqueeze(1), self._p_cost.double().unsqueeze(0) * mult_r5)
                cand_u5 = mil5 & afford_u5
                elig_u5 = want_u5 & cand_u5.any(dim=1)
                if bool(elig_u5.any()):
                    # highest combat wins; combat·NU − index breaks ties to the
                    # lowest index (table order), matching the TS strict-`>` scan
                    key_u5 = self._p_combat.double().unsqueeze(0) * self.NU - torch.arange(self.NU, device=dev, dtype=torch.float64).unsqueeze(0)
                    key_u5 = torch.where(cand_u5, key_u5.expand(B, -1), torch.full((B, self.NU), -1e18, dtype=torch.float64, device=dev))
                    pick_ty5 = key_u5.argmax(dim=1)
                    cap_is5 = self.rc_is_cap[:, r]
                    has_cap5 = cap_is5.any(dim=1)
                    spawn_slot5 = torch.where(has_cap5, cap_is5.long().argmax(dim=1), self.rc_alive[:, r].long().argmax(dim=1))
                    ctr5 = self.rc_center[:, r].gather(1, spawn_slot5.unsqueeze(1)).squeeze(1).clamp(min=0)
                    landed_u5 = self._spawn_rival(elig_u5, ctr5, pick_ty5, r)
                    price_u5 = self._p_cost.gather(0, pick_ty5).double() * mult_r5
                    self.r_treasury[:, r] = torch.where(landed_u5, self.r_treasury[:, r] - price_u5, self.r_treasury[:, r])
                    bought_r5 = bought_r5 | landed_u5
            # AUDIT A-11: the trade creation block sits between the buy block
            # and the city-loop snapshot — the exact rivalPhase position.
            self._rival_trade_phase(r, active)
            # A-5r: the city-loop snapshot is taken AFTER the buy block (the TS
            # [...rival.cities] discipline) — an A-5r settler newborn acts this
            # turn (amenity + yields), a queue-completion newborn (founded
            # inside the loop, later) does not.
            alive_c = self.rc_alive[:, r].clone()

            # phase-top unlock snapshot (TS computes rivalUnlocks here)
            r_techs0 = self.r_techs[:, r].clone()
            r_civics0 = self.r_civics[:, r].clone()
            prod_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            sci_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            cul_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            gold_sum = torch.zeros(B, dtype=torch.float64, device=dev)  # VP-G1
            faith_sum = torch.zeros(B, dtype=torch.float64, device=dev)  # P5/S5 (C-17)
            # P5/S6: the amenity map freezes at the loop top (the player's
            # luxMap discipline) — loyalty, growth and yields read it.
            amen_tidx, amen_gf, amen_yf = self._rival_amenity(r)
            rc_flip = torch.zeros(B, self.RC, dtype=torch.bool, device=dev)
            # AUDIT A-20: unbesieged cities heal the flat player rate, war
            # or not (real Civ 6) — the same cityHealPerTurn rules field
            # _barbarian_phase reads; the 15/5 split was a local invention.
            heal = int(self.rules.combat.get("cityHealPerTurn", 20))
            # D-11: the Hanging-Gardens growth product reads the CIV-wide
            # wonder registry — identical for every j. Hoist per r; a wonder
            # COMPLETION mid-loop (the only in-loop write to its inputs —
            # a settler founding only rewrites an all--1 free slot, product
            # term 1.0 either way) drops the cache and the next j recomputes
            # the same expression on the fresh state, exactly like the old
            # per-j compute.
            gw_cache = None
            if self._wond_n:
                wregG = self.rc_wonder[:, r]  # [B, RC, nW]
                compG = (wregG >= 0) & self.built_wonder_complete.gather(1, wregG.clamp(min=0).reshape(B, -1)).reshape_as(wregG)
                gw_cache = torch.where(compG, self._wond_grow.view(1, 1, -1).expand_as(compG).double(), torch.ones_like(compG, dtype=torch.float64)).prod(dim=2).prod(dim=1)
            # G3-A: one guard sync for the whole economy loop. Exact: alive_c
            # is a pre-loop CLONE (a queue-completion newborn founded inside
            # the loop deliberately does not act this turn — the [...rival.
            # cities] discipline above) and `active` is a loop-invariant local,
            # so the precomputed columns equal the old per-j computes.
            cact_all = active.unsqueeze(1) & alive_c  # [B, RC]
            cact_any_l = cact_all.any(dim=0).tolist()
            _rcy_bel = self._r_has_beliefs(r)  # G4: capital fallback gate (capY live-pop)
            # G5: the per-j housing/maintenance/growth-need math batched over
            # j. Inputs are planes (eff-covered), own-column registries (a
            # city's own completions land at the END of its iteration, after
            # these values are consumed — no cross-column write exists), and
            # ONE live edge: rival_at at window tiles in the A-13 improvement
            # -housing term (a mid-loop border claim can put an ORPHANED
            # improvement into a later city's window), so the batch recomputes
            # when (_eff_version, _claim_version) moves — the same key
            # discipline as the G4 yields cache. Every batched sum is
            # dyadic/int-valued: bit-exact in any shape.
            _gmul_r = self._bel_mul("growth", r) if _rcy_bel else 1.0
            _riv_h = self._bel_add("river", r)[:, 1] if _rcy_bel else None
            _fol_h_rc = self._follower_id_for(self._rc_rel(r)) if _rcy_bel else None
            _ctr_r = self.rc_center[:, r].clamp(min=0)  # [B, RC]

            def _g5_hm() -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
                dt_all = self.rc_dist_tile[:, r]  # [B, RC, nD]
                dd_all = (dt_all >= 0) & self.district_complete.gather(1, dt_all.clamp(min=0).reshape(B, -1)).reshape_as(dt_all)
                maint = (self._d_maint.view(1, 1, -1) * dd_all.to(torch.float64)).sum(dim=2)
                maint = maint + torch.einsum("bjn,n->bj", self.rc_bldg[:, r].to(torch.float64), self.rules_dev.b_maintenance.double())
                wh = self.tile_wh.gather(1, _ctr_r)  # [B, RC]
                fresh = wh == float(self._h_fresh)
                if self._aqueduct_idx >= 0:
                    aq_t = self.rc_dist_tile[:, r, :, self._aqueduct_idx]  # [B, RC]
                    has_aq = (aq_t >= 0) & self.district_complete.gather(1, aq_t.clamp(min=0))
                else:
                    has_aq = torch.zeros(B, self.RC, dtype=torch.bool, device=dev)
                water = torch.where(
                    has_aq,
                    torch.where(fresh, wh + self._aq_fresh_bonus, torch.maximum(wh, torch.full_like(wh, self._aq_no_fresh_total))),
                    wh,
                )
                bh = self.rc_bldg[:, r].double() @ self.rules.b_housing.to(dev).double()  # [B, RC]
                win3a = tiles_from_offsets(_ctr_r.reshape(-1), self._off3, self.W, self.H).reshape(B, self.RC, -1)
                w3f = win3a.clamp(min=0).reshape(B, -1)
                imp_w3 = self.improvement.gather(1, w3f).reshape_as(win3a)
                imp_own = (win3a >= 0) & (self.rival_at.gather(1, w3f).reshape_as(win3a) == r) & (imp_w3 >= 0)
                farm = (self._imp_housing[imp_w3.clamp(min=0)].double() * imp_own.double()).sum(dim=2)
                housing = water + bh + farm
                if _rcy_bel:
                    housing = housing + torch.einsum("bjn,bjn->bj", self.rc_bldg[:, r].double(), self._fol_tab("bldgH", _fol_h_rc))
                    housing = housing + _riv_h.unsqueeze(1) * self.tile_river.gather(1, _ctr_r).double()
                p64a = self.rc_pop[:, r].double()
                need = torch.floor(15 + 8 * (p64a - 1) + (p64a - 1).clamp(min=0) ** 1.5)
                return maint, housing, need

            _h_key = None
            maint_all = housing_all = need_all = None
            for j in range(self.RC):
                if not cact_any_l[j]:
                    continue
                cact = cact_all[:, j]  # A-5r: post-buy snapshot (settler newborn acts this turn)
                # P5/S6 (C-19): rival city loyalty at the loop top (the TS
                # position, before yields/growth) — own = THIS civ, foreign
                # = the player + every other rival; LIVE pops (earlier slots
                # in this loop already grew — the natural TS mid-loop mirror);
                # the capital (rc_is_cap — per-BATCH now, since P7-FULL
                # compaction can move it off slot 0) is immune.
                cap_j = self.rc_is_cap[:, r, j]
                pin = cact & cap_j
                if bool(pin.any()):
                    self.rc_loyalty[:, r, j] = torch.where(pin, torch.full_like(self.rc_loyalty[:, r, j], 100.0), self.rc_loyalty[:, r, j])
                ncap = cact & ~cap_j
                if bool(ncap.any()):
                    lrng = int(rr.get("loyaltyRange", 9))
                    lscale = float(rr.get("loyaltyScale", 20))
                    here_j = self.rc_center[:, r, j].clamp(min=0)
                    d_own = self.pair_dist[here_j.unsqueeze(1), self.rc_center[:, r].clamp(min=0)].to(torch.float64)
                    own_p = ((lrng + 1 - d_own).clamp(min=0) * self.rc_pop[:, r].double() * self.rc_alive[:, r].double()).sum(dim=1)
                    d_pl = self.pair_dist[here_j.unsqueeze(1), self.site.clamp(min=0)].to(torch.float64)
                    for_p = ((lrng + 1 - d_pl).clamp(min=0) * self.pop.double() * self.alive.double()).sum(dim=1)
                    others = self.alive.any(dim=1)
                    # D-12: all foreign civs in ONE stacked op — every term is
                    # (lrng+1−d)⁺ × pop × alive, integer-valued f64, so the
                    # single sum is exact regardless of association.
                    oth = [r2 for r2 in range(self.R) if r2 != r]
                    if oth:
                        ctr_o = self.rc_center[:, oth].reshape(B, -1)
                        alive_o = self.rc_alive[:, oth].reshape(B, -1)
                        d_o = self.pair_dist[here_j.unsqueeze(1), ctr_o.clamp(min=0)].to(torch.float64)
                        for_p = for_p + ((lrng + 1 - d_o).clamp(min=0) * self.rc_pop[:, oth].reshape(B, -1).double() * alive_o.double()).sum(dim=1)
                        others = others | alive_o.any(dim=1)
                    tot_p = own_p + for_p
                    press = torch.where(tot_p > 0, lscale * (own_p - for_p) / tot_p.clamp(min=1e-9), torch.zeros_like(tot_p))
                    delta_l = press + self._loyalty_amenity[amen_tidx[:, j].clamp(min=0, max=self._loyalty_amenity.shape[0] - 1)].double()
                    upd_l = ncap & others
                    nxt_l = (self.rc_loyalty[:, r, j] + delta_l).clamp(min=0, max=float(rr.get("loyaltyMax", 100)))
                    self.rc_loyalty[:, r, j] = torch.where(upd_l, nxt_l, self.rc_loyalty[:, r, j])
                    rc_flip[:, j] = upd_l & (self.rc_loyalty[:, r, j] <= 0)
                # G4: column j of the keyed batched twin replaces the per-j
                # pass (see _rcy_all_cached's exactness argument). The one
                # snapshot-vs-live divergence is capY's civ-total follower pop
                # under beliefs — TS sums pops LIVE at the capital's own loop
                # position, so capital columns keep the per-j path there.
                if _rcy_bel and bool(self.rc_is_cap[:, r, j].any()):
                    food, prod, sci, cul, gold_y, faith_y = self._rival_city_yields(r, j, cact, amen_yf=amen_yf[:, j])
                else:
                    F6 = self._rcy_all_cached(r, amen_yf)
                    zj = torch.zeros_like(F6[0][:, j])
                    food = torch.where(cact, F6[0][:, j], zj)
                    prod = torch.where(cact, F6[1][:, j], zj)
                    sci = torch.where(cact, F6[2][:, j], zj)
                    cul = torch.where(cact, F6[3][:, j], zj)
                    gold_y = torch.where(cact, F6[4][:, j], zj)
                    faith_y = torch.where(cact, F6[5][:, j], zj)
                prod_sum = torch.where(cact, prod_sum + prod, prod_sum)
                # C1-B3a: tile/center columns plus the citizens' contribution.
                # ASSOCIATION MATTERS: TS `sciSum += y.science + 0.7*pop`
                # desugars to sciSum + (y.science + 0.7*pop) — the city term
                # sums FIRST. (cul_sum + cul) + 0.3*pop is one ulp off and
                # flips completions when a cost lands inside it (seed 9079).
                sci_sum = torch.where(cact, sci_sum + (sci + self.rules.citizen_science * self.rc_pop[:, r, j].double()), sci_sum)
                cul_c = cul + self.rules.citizen_culture * self.rc_pop[:, r, j].double()  # P5/S4: pre-growth pop, feeds civics AND this city's border box
                cul_sum = torch.where(cact, cul_sum + cul_c, cul_sum)
                # P5/S1 (C-12): net of the city's upkeep — completed districts
                # + buildings, the player's tables (TS: y.gold - maintenance
                # as ONE term inside the +=). G5: batched above; the key check
                # re-runs the batch after a mid-loop eff/claim event.
                if _h_key != (self._eff_version, self._claim_version):
                    _h_key = (self._eff_version, self._claim_version)
                    maint_all, housing_all, need_all = _g5_hm()
                maint_j = maint_all[:, j]
                gold_sum = torch.where(cact, gold_sum + (gold_y - maint_j), gold_sum)  # VP-G1 + C-12
                faith_sum = torch.where(cact, faith_sum + faith_y, faith_sum)  # P5/S5 (C-17)
                # C1-B1: the real growth accounting — true surplus (can be
                # negative), the unscaled Civ 6 curve, grow SUBTRACTS the
                # need, starvation shrinks (pop floor 1, box reset).
                # C1-B5b-iii: real housing throttles positive surplus
                # (housingGrowthFactor); RIVAL_MAX_POP is retired.
                # A-13/D-11/A-7/B-18 housing chain — G5: the whole per-j block
                # (water/aqueduct, building housing, windowed improvement
                # housing, belief housing) is batched in _g5_hm above; the
                # dyadic/int-valued sums make the batched shapes bit-exact.
                housing_j = housing_all[:, j]
                head_j = housing_j - self.rc_pop[:, r, j].double()
                hfac = torch.where(head_j >= 2, torch.ones_like(head_j), torch.where(head_j >= 1, torch.full_like(head_j, 0.5), torch.full_like(head_j, 0.25)))
                surplus = food - self.rules.food_per_citizen * self.rc_pop[:, r, j].double()
                # A-7: Fertility Rites — the belief growth multiplier rides the
                # chain like computeCityStats (hf × tier × growthMult).
                # G5: hoisted (belief ids are static mid-loop — claims are
                # post-phase); gmul rebinds below, never mutates in place.
                gmul = _gmul_r
                # A-4: Hanging Gardens — the civ-wide completed-wonder growth
                # product (rivalGrowthAllMult, LIVE per city like TS's call;
                # D-11: hoisted per r above, recomputed on completion flag)
                if self._wond_n:
                    if gw_cache is None:
                        wregG = self.rc_wonder[:, r]  # [B, RC, nW]
                        compG = (wregG >= 0) & self.built_wonder_complete.gather(1, wregG.clamp(min=0).reshape(B, -1)).reshape_as(wregG)
                        gw_cache = torch.where(compG, self._wond_grow.view(1, 1, -1).expand_as(compG).double(), torch.ones_like(compG, dtype=torch.float64)).prod(dim=2).prod(dim=1)
                    gmul = gmul * gw_cache
                self.rc_growth[:, r, j] = torch.where(cact, self.rc_growth[:, r, j] + torch.where(surplus > 0, surplus * hfac * amen_gf[:, j] * gmul, surplus), self.rc_growth[:, r, j])
                need = need_all[:, j]  # G5: pre-growth pop == the batch's entry value for this column
                grow = cact & (self.rc_growth[:, r, j] >= need)
                self.rc_pop[:, r, j] = self.rc_pop[:, r, j] + grow.long()
                self.rc_growth[:, r, j] = torch.where(grow, self.rc_growth[:, r, j] - need, self.rc_growth[:, r, j])
                starve = cact & ~grow & (self.rc_growth[:, r, j] < 0)
                self.rc_pop[:, r, j] = torch.where(starve, (self.rc_pop[:, r, j] - 1).clamp(min=1), self.rc_pop[:, r, j])
                self.rc_growth[:, r, j] = torch.where(starve, torch.zeros_like(self.rc_growth[:, r, j]), self.rc_growth[:, r, j])
                # C1-B2: queue progress + completion (settler completion runs
                # the site scan; a unit spawns at THIS city — no RNG draw).
                # Clear-then-resolve mirrors the TS shift-then-act order.
                cur = self.rc_current[:, r, j].clone()
                has_q = cact & (cur >= 0)
                if bool(has_q.any()):
                    self.rc_progress[:, r, j] = torch.where(has_q, self.rc_progress[:, r, j] + prod, self.rc_progress[:, r, j])
                    done_q = has_q & (self.rc_progress[:, r, j] >= self.rc_cost[:, r, j])
                    if bool(done_q.any()):
                        cost_locked = self.rc_cost[:, r, j].clone()  # A-14: the project lump reads the LOCKED cost
                        self.rc_current[:, r, j] = torch.where(done_q, torch.full_like(cur, -1), self.rc_current[:, r, j])
                        self.rc_progress[:, r, j] = torch.where(done_q, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
                        self.rc_cost[:, r, j] = torch.where(done_q, torch.zeros_like(self.rc_cost[:, r, j]), self.rc_cost[:, r, j])
                        found_s = done_q & (cur == 0)
                        if bool(found_s.any()):
                            self._rival_try_found(r, found_s)
                        spawn_u = done_q & (cur >= 1) & (cur <= self.NU)
                        is_bldr = spawn_u & (cur - 1 == self._builder_idx)
                        if bool(is_bldr.any()):
                            self._spawn_rival_civ(is_bldr, self.rc_center[:, r, j], r)
                            self.r_builders_trained[:, r] = self.r_builders_trained[:, r] + is_bldr.long()  # P4/D-10
                        spawn_u = spawn_u & ~is_bldr
                        if bool(spawn_u.any()):
                            self._spawn_rival(spawn_u, self.rc_center[:, r, j], (cur - 1).clamp(min=0), r)
                        # C1-B4: a finished district completes its paved tile
                        nS_b4 = len(self._scaffold)
                        done_d = done_q & (cur > self.NU) & (cur <= self.NU + nS_b4)
                        if bool(done_d.any()):
                            dr = done_d.nonzero(as_tuple=True)[0]
                            dtile = self.rc_qtile[:, r, j]
                            self.district_complete[dr, dtile[dr].clamp(min=0)] = True
                            self.rc_qtile[dr, r, j] = -1
                            self._eff_version += 1
                        # C1-B4b-2: a finished building joins the registry
                        # (A-14: bounded above — project codes sit past NB)
                        NBc = self.rules_dev.b_cost.shape[0]
                        done_b = done_q & (cur > self.NU + nS_b4) & (cur <= self.NU + nS_b4 + NBc)
                        if bool(done_b.any()):
                            br = done_b.nonzero(as_tuple=True)[0]
                            bi_done = (cur - 1 - self.NU - nS_b4).clamp(min=0)
                            self.rc_bldg[br, r, j, bi_done[br]] = True
                            if self._walls_bidx >= 0:  # AUDIT B-1
                                wm = br[bi_done[br] == self._walls_bidx]
                                if len(wm) > 0:
                                    self.rc_outer_hp[wm, r, j] = self._walls_hp
                        # A-4: a finished wonder completes its tile (effects
                        # read builtWonderComplete live from the registry).
                        if self._wond_n:
                            base_w = self.NU + nS_b4 + NBc + len(self._proj_rows)
                            done_w = done_q & (cur > base_w)
                            if bool(done_w.any()):
                                wi_done = (cur - 1 - base_w).clamp(min=0)
                                wr_ = done_w.nonzero(as_tuple=True)[0]
                                wt_ = self.rc_wonder[wr_, r, j, wi_done[wr_]]
                                self.built_wonder_complete[wr_, wt_.clamp(min=0)] = True
                                self._eff_version += 1
                                gw_cache = None  # D-11: growth product changed under the hoist
                        # A-14: a finished project pays Math.round(cost×frac)
                        # into the CIV's streams + GPP (the completeProject
                        # twin — rival streams, like GP effects).
                        if self._proj_rows:
                            done_p = done_q & (cur > self.NU + nS_b4 + NBc) & (cur <= self.NU + nS_b4 + NBc + len(self._proj_rows))
                            if bool(done_p.any()):
                                pi_done = (cur - 1 - self.NU - nS_b4 - NBc).clamp(min=0)
                                amt_y = js_round(cost_locked * self._proj_yf)
                                amt_g = js_round(cost_locked * self._proj_gf)
                                for pi_, prow in enumerate(self._proj_rows):
                                    hitp = done_p & (pi_done == pi_)
                                    if not bool(hitp.any()):
                                        continue
                                    y_i = int(prow.get("y", -1))
                                    if y_i == 3:
                                        self.r_tech_prog[:, r] = torch.where(hitp, self.r_tech_prog[:, r] + amt_y, self.r_tech_prog[:, r])
                                    elif y_i == 4:
                                        self.r_civic_prog[:, r] = torch.where(hitp, self.r_civic_prog[:, r] + amt_y, self.r_civic_prog[:, r])
                                    elif y_i == 2:
                                        self.r_treasury[:, r] = torch.where(hitp, self.r_treasury[:, r] + amt_y, self.r_treasury[:, r])
                                    elif y_i == 5:
                                        self.r_faith[:, r] = torch.where(hitp, self.r_faith[:, r] + amt_y, self.r_faith[:, r])
                                    g_i = int(prow.get("g", -1))
                                    if 0 <= g_i < self.r_gpp.shape[2]:
                                        self.r_gpp[:, r, g_i] = torch.where(hitp, self.r_gpp[:, r, g_i] + amt_g, self.r_gpp[:, r, g_i])
                                    # B-25: a rival completing a space-race step
                                    # records chain progress (space_done, civ
                                    # r+1); completing the VICTORY step ends the
                                    # game as a player DEFEAT — victory_type 4,
                                    # the domination-defeat mirror (rivals.ts
                                    # completeProject twin). Space rows carry
                                    # y=g=-1 so the yield/GPP blocks above are
                                    # no-ops for them. Inert in-gate (the greedy
                                    # pick never selects a space row).
                                    if int(prow.get("sp", 0)):
                                        self.space_done[hitp, r + 1, self._space_step[pi_]] = True
                                        if pi_ in self._space_victory_idx:
                                            self.victory_type = torch.where(hitp, torch.full_like(self.victory_type, 4), self.victory_type)
                                            self.game_over = self.game_over | hitp
                self._rival_border_growth(r, j, cact, cul_c)  # P5/S4: the timer died
                # AUDIT B-2: the rival mirror of the player city strike — a
                # rival city with ANCIENT_WALLS fires once/turn at the nearest
                # unit hostile to THIS civ (barbarians always; the player's
                # at-war units incl. civilians), range 2, lowest tile index
                # breaking ties. One roll at rivalCityDefense vs the target's
                # defense (single roll, no retaliation, never captures). rc
                # (slot) order, before the heal — a kill advances the RNG.
                if self._walls_bidx >= 0:
                    Bn, Tn, dev2 = self.B, self.T, self.device
                    bidx = torch.arange(Bn, device=dev2)
                    walled = cact & self.rc_bldg[:, r, j, self._walls_bidx]
                    if bool(walled.any()):
                        ctr = self.rc_center[:, r, j].clamp(min=0)  # [B]
                        dist = self.pair_dist[ctr].to(torch.long)  # [B, T]
                        war = self.r_atwar[:, r].unsqueeze(1)  # [B, 1]
                        barb_h = self.barb_at >= 0
                        pmil_h = (self.pmil_at >= 0) & war
                        pciv_h = (self.pciv_at >= 0) & war
                        hostile = barb_h | pmil_h | pciv_h  # [B, T]
                        valid = walled.unsqueeze(1) & hostile & (dist >= 1) & (dist <= 2)
                        arangeT = torch.arange(Tn, device=dev2)
                        key = torch.where(valid, dist * (Tn + 1) + arangeT.view(1, -1), torch.full((Bn, Tn), 10**9, device=dev2, dtype=torch.long))
                        best_key = key.min(dim=1).values
                        tt = key.argmin(dim=1)  # [B]
                        strike = walled & (best_key < 10**9)
                        if bool(strike.any()):
                            b_slot = self.barb_at[bidx, tt]
                            pm_slot = self.pmil_at[bidx, tt]
                            pc_slot = self.pciv_at[bidx, tt]
                            is_barb = b_slot >= 0
                            is_pmil = ~is_barb & (pm_slot >= 0)  # military first (barb > player mil > player civ)
                            is_pciv = ~is_barb & ~is_pmil & (pc_slot >= 0)
                            d_cs_barb = self._unit_combat[self.u_type[bidx, b_slot.clamp(min=0)]]
                            d_cs_pmil = self._p_combat[self.p_type[bidx, pm_slot.clamp(min=0)]]
                            d_cs_pciv = self._p_combat[self.p_type[bidx, pc_slot.clamp(min=0)]]
                            def_cs = torch.where(is_barb, d_cs_barb, torch.where(is_pmil, d_cs_pmil, d_cs_pciv)) + self.tdef[bidx, tt]
                            gslot = self.rv_at[bidx, ctr]  # rivalCityDefense garrison: own military at center
                            gar = ((gslot >= 0) & (self.v_civ[bidx, gslot.clamp(min=0)] == r)).long()
                            atk_cs = torch.maximum(self.r_best_melee[:, r], torch.full_like(self.r_best_melee[:, r], 15)) + gar * 5
                            # B-29: the defending unit is wounded (attacker is the city).
                            def_hp = torch.where(is_barb, self.u_hp[bidx, b_slot.clamp(min=0)], torch.where(is_pmil, self.p_hp[bidx, pm_slot.clamp(min=0)], self.p_hp[bidx, pc_slot.clamp(min=0)]))
                            def_e = def_cs - self._wound(def_hp)
                            d = self._damage_roll(strike, atk_cs - def_e, k="rcstk", tile=tt)
                            rows = strike.nonzero(as_tuple=True)[0]
                            for grp, at_map, hp_t, alive_t, slot_t in (
                                (is_barb, self.barb_at, self.u_hp, self.u_alive, b_slot),
                                (is_pmil, self.pmil_at, self.p_hp, self.p_alive, pm_slot),
                                (is_pciv, self.pciv_at, self.p_hp, self.p_alive, pc_slot),
                            ):
                                g = rows[grp[rows]]
                                if len(g) == 0:
                                    continue
                                ds = slot_t[g]
                                hp_t[g, ds] -= d[g]
                                dead = hp_t[g, ds] <= 0
                                at_map[g[dead], tt[g[dead]]] = -1
                                alive_t[g[dead], ds[dead]] = False
                                if bool(dead.any()):
                                    self._rp_kill_version += 1  # G1: u_alive/p_alive death -> _rival_route_income raided-mask changes for city j+1
                # AUDIT A-10: a siege pins the HP, exactly like the player's
                # heal — any adjacent unit hostile to THIS civ (the player's
                # at-war units, CIVILIANS included per unitsHostile — the
                # P5/S2 player-heal lesson — or barbarians; other rivals
                # never besiege), read live at this point in the city loop.
                nbh = self.neigh[self.rc_center[:, r, j].clamp(min=0)]  # [B, 6]
                nbhc = nbh.clamp(min=0)
                hostile_adj = (self.barb_at.gather(1, nbhc) >= 0) | (
                    ((self.pmil_at.gather(1, nbhc) >= 0) | (self.pciv_at.gather(1, nbhc) >= 0))
                    & self.r_atwar[:, r].unsqueeze(1)
                )
                besieged_j = ((nbh >= 0) & hostile_adj).any(dim=1)
                self.rc_hp[:, r, j] = torch.where(
                    cact & ~besieged_j, (self.rc_hp[:, r, j] + heal).clamp(max=rr.get("cityMaxHp", 200)), self.rc_hp[:, r, j]
                )
                # AUDIT B-1: the rival outer wall pool heals on the same gate.
                if self._walls_bidx >= 0:
                    heal_oj = cact & ~besieged_j & self.rc_bldg[:, r, j, self._walls_bidx]
                    self.rc_outer_hp[:, r, j] = torch.where(
                        heal_oj, (self.rc_outer_hp[:, r, j] + heal).clamp(max=self._walls_hp), self.rc_outer_hp[:, r, j]
                    )

            # P5/S6 (C-19): loyalty collapses resolve after the city loop —
            # to the max-pressure civ (the PLAYER first on ties, then rivals
            # by id: first_argmax over [player, r0, r1...]); the reverse
            # transfer reuses the capture machinery WITHOUT plunder.
            if bool(rc_flip.any()):
                lrng = int(rr.get("loyaltyRange", 9))
                # P7-FULL forced-gate catch (rng 2026006121 t148): slot 0 is
                # NOT capital-by-construction once compaction runs — a dead
                # capital's survivor compacts into slot 0, its loyalty hits 0,
                # and a range(1, ...) walk dropped the defection (the city
                # hung at loy 0 while TS resolved it). rc_flip is only ever
                # set for non-capitals, so visiting slot 0 is always safe.
                for j2 in range(self.RC):
                    fl = rc_flip[:, j2] & self.rc_alive[:, r, j2]
                    if not bool(fl.any()):
                        continue
                    here_j = self.rc_center[:, r, j2].clamp(min=0)
                    d_pl = self.pair_dist[here_j.unsqueeze(1), self.site.clamp(min=0)].to(torch.float64)
                    p_pl = ((lrng + 1 - d_pl).clamp(min=0) * self.pop.double() * self.alive.double()).sum(dim=1)
                    press_all = [p_pl]
                    for r2 in range(self.R):
                        if r2 == r:
                            press_all.append(torch.full_like(p_pl, -1.0))
                        else:
                            d_o = self.pair_dist[here_j.unsqueeze(1), self.rc_center[:, r2].clamp(min=0)].to(torch.float64)
                            press_all.append(((lrng + 1 - d_o).clamp(min=0) * self.rc_pop[:, r2].double() * self.rc_alive[:, r2].double()).sum(dim=1))
                    winner = first_argmax(torch.stack(press_all, dim=1))  # 0 = the player
                    for b in fl.nonzero(as_tuple=True)[0].tolist():
                        w_ = int(winner[b])
                        if w_ == 0:
                            self._capture_rival_city(
                                torch.tensor([b], device=dev), torch.tensor([r], device=dev),
                                torch.tensor([j2], device=dev), self.rc_center[b, r, j2].view(1),
                                plunder=False,
                            )
                        else:
                            self._transfer_rc_to_rc(b, r, j2, w_ - 1)

            n_cities2 = self.rc_alive[:, r].sum(dim=1)

            # C1-B3a: REAL research — cheapest-first at RAW cost (boosted =
            # all-False through the shared _auto_pick, so ties keep table
            # order exactly like the TS stable sort); progress banks and
            # drains like the player loop.
            rdv = self.rules_dev
            # A-3: the rival's own boosts drive the cheapest-first pick, like
            # the player's (TS pickNext sorts by effectiveResearchCostIn;
            # stable sort = table-order ties, _auto_pick's index epsilon).
            nb_t = self.r_tech_boosted[:, r]
            nb_c = self.r_civic_boosted[:, r]
            auto_r = active & ~self.controlled[:, r]  # C2b: controlled rivals pick via the net
            picked = self._auto_pick(self.r_cur_tech[:, r], self.r_techs[:, r], nb_t, rdv.t_cost, self._prereq_t)
            self.r_cur_tech[:, r] = torch.where(auto_r, picked, self.r_cur_tech[:, r])
            self.r_tech_prog[:, r] = torch.where(active, self.r_tech_prog[:, r] + sci_sum, self.r_tech_prog[:, r])
            self.r_treasury[:, r] = torch.where(active, self.r_treasury[:, r] + gold_sum, self.r_treasury[:, r])  # VP-G1
            self.r_faith[:, r] = torch.where(active, self.r_faith[:, r] + faith_sum, self.r_faith[:, r])  # P5/S5 (C-17)
            # P5/S1 (C-12): unit upkeep + the GV-5 bankruptcy rule, mirroring
            # the player's exactly (milli-rounded test; disband the
            # priciest-upkeep unit, tie → lowest slot = spawn order; no
            # refund). Runs right after the gold lands, before war marches.
            mine_r = self.v_alive & (self.v_civ == r)
            upkeep_r = (self._p_maint[self.v_type.clamp(min=0, max=self.NU - 1)] * mine_r.to(self.dtype)).sum(dim=1)
            self.r_treasury[:, r] = torch.where(active, self.r_treasury[:, r] - upkeep_r, self.r_treasury[:, r])
            broke_r = active & (js_round(self.r_treasury[:, r] * 1000) < 0)
            if bool(broke_r.any()):
                vm = self._p_maint[self.v_type.clamp(min=0, max=self.NU - 1)]  # [B, U_MAX]
                slots_ar = torch.arange(self.v_alive.shape[1], device=dev, dtype=self.dtype).view(1, -1)
                key_v = torch.where(mine_r & (vm > 0), vm * 4096 - slots_ar, torch.full_like(vm, -1.0))
                best_v, victim = key_v.max(dim=1)
                kill = broke_r & (best_v > 0)
                if bool(kill.any()):
                    kr = kill.nonzero(as_tuple=True)[0]
                    vs = victim[kr]
                    vt = self.v_tile[kr, vs]
                    is_civ_v = self._p_charges[self.v_type[kr, vs]] > 0
                    self.v_alive[kr, vs] = False
                    self.rv_at[kr[~is_civ_v], vt[~is_civ_v]] = -1
                    self.rvciv_at[kr[is_civ_v], vt[is_civ_v]] = -1
            for _ in range(RESEARCH_LOOPS):
                curt = self.r_cur_tech[:, r]
                # A-3: boosted techs complete at the player's discounted cost
                # (_eff_cost — identical rounding to effectiveResearchCostIn)
                cost_t = self._eff_cost(
                    rdv.t_cost.gather(0, curt.clamp(min=0)),
                    self.r_tech_boosted[:, r].gather(1, curt.clamp(min=0).unsqueeze(1)).squeeze(1),
                ).double()
                fin = active & (curt >= 0) & (self.r_tech_prog[:, r] >= cost_t)
                if not bool(fin.any()):
                    break
                rows = fin.nonzero(as_tuple=True)[0]
                self.r_techs[rows, r, curt[rows]] = True
                self._eff_version += 1  # D-2: the per-r farm-adj/mine planes key on it (the trace re-reads this civ post-completion)
                self.r_tech_prog[:, r] = torch.where(fin, self.r_tech_prog[:, r] - cost_t, self.r_tech_prog[:, r])
                self.r_cur_tech[:, r] = torch.where(fin, torch.full_like(curt, -1), self.r_cur_tech[:, r])
                picked = self._auto_pick(self.r_cur_tech[:, r], self.r_techs[:, r], nb_t, rdv.t_cost, self._prereq_t)
                self.r_cur_tech[:, r] = torch.where(auto_r, picked, self.r_cur_tech[:, r])
            no_t = active & (self.r_cur_tech[:, r] == -1) & ~self._available_mask(self.r_techs[:, r], self._prereq_t).any(dim=1)
            self.r_tech_prog[:, r] = torch.where(no_t, torch.minimum(self.r_tech_prog[:, r], torch.zeros_like(self.r_tech_prog[:, r])), self.r_tech_prog[:, r])
            picked = self._auto_pick(self.r_cur_civic[:, r], self.r_civics[:, r], nb_c, rdv.c_cost, self._prereq_c)
            self.r_cur_civic[:, r] = torch.where(auto_r, picked, self.r_cur_civic[:, r])
            self.r_civic_prog[:, r] = torch.where(active, self.r_civic_prog[:, r] + cul_sum, self.r_civic_prog[:, r])
            for _ in range(RESEARCH_LOOPS):
                curc = self.r_cur_civic[:, r]
                cost_c = self._eff_cost(
                    rdv.c_cost.gather(0, curc.clamp(min=0)),
                    self.r_civic_boosted[:, r].gather(1, curc.clamp(min=0).unsqueeze(1)).squeeze(1),
                ).double()  # A-3
                fin = active & (curc >= 0) & (self.r_civic_prog[:, r] >= cost_c)
                if not bool(fin.any()):
                    break
                rows = fin.nonzero(as_tuple=True)[0]
                self.r_civics[rows, r, curc[rows]] = True
                self._eff_version += 1  # D-2: Feudalism moves this civ's farm-adj plane
                self.r_civic_prog[:, r] = torch.where(fin, self.r_civic_prog[:, r] - cost_c, self.r_civic_prog[:, r])
                self.r_cur_civic[:, r] = torch.where(fin, torch.full_like(curc, -1), self.r_cur_civic[:, r])
                picked = self._auto_pick(self.r_cur_civic[:, r], self.r_civics[:, r], nb_c, rdv.c_cost, self._prereq_c)
                self.r_cur_civic[:, r] = torch.where(auto_r, picked, self.r_cur_civic[:, r])
            no_c = active & (self.r_cur_civic[:, r] == -1) & ~self._available_mask(self.r_civics[:, r], self._prereq_c).any(dim=1)
            self.r_civic_prog[:, r] = torch.where(no_c, torch.minimum(self.r_civic_prog[:, r], torch.zeros_like(self.r_civic_prog[:, r])), self.r_civic_prog[:, r])

            # C1-B5b: builder actions (build best-gain improvement or walk) —
            # under the PRE-advance unlock snapshot, like TS's rivalUnlocks.
            # C3-prep: controlled rivals' builders answer to the units head.
            if self.improvements_on and self._builder_idx >= 0:
                self._rival_builder_actions(r, active & ~self.controlled[:, r], techs0=r_techs0, civics0=r_civics0)

            # Great-people race (no draws): accrue, claim from the shared pool.
            for cls in range(self._gp_nc):  # all GP classes (incl Admiral/General)
                # C1-B4c: real accrual — 1 + (that district's buildings) per
                # city owning a COMPLETED district of the class (was
                # cities × gppRate; rivals accrue 0 until their first
                # Campus/HS/CH completes).
                d_cls = int(self._gp_class_district[cls]) if cls < self._gp_nc else -1
                if d_cls >= 0 and self.districts_on:
                    reg_c = self.rc_dist_tile[:, r, :, d_cls]  # [B, RC]
                    comp_c = (reg_c >= 0) & self.district_complete.gather(1, reg_c.clamp(min=0))
                    bmask_c = (self.rules_dev.b_req_district == d_cls).view(1, 1, -1)
                    nb_of = (self.rc_bldg[:, r] & bmask_c).sum(dim=2)  # [B, RC]
                    # A-7 Divine Spark: the belief's flat GPP joins the
                    # per-city term (1 + gppFlat + buildings), the
                    # greatPersonPointsPerTurn form.
                    if self._bel_any and cls < self._bel["pan"]["gpp"].shape[1]:
                        gflat = self._bel_add("gpp", r)[:, cls].double().unsqueeze(1)  # [B, 1]
                    else:
                        gflat = torch.zeros(B, 1, dtype=torch.float64, device=dev)
                    pts = (comp_c.double() * (1.0 + gflat + nb_of.double())).sum(dim=1)
                else:
                    pts = torch.zeros(B, dtype=torch.float64, device=dev)
                self.r_gpp[:, r, cls] = torch.where(
                    active & (pts > 0), self.r_gpp[:, r, cls] + pts, self.r_gpp[:, r, cls]
                )
                # P5/S5 (C-16): the player's while-loop — overflow KEPT
                # (gpp −= cost, not zeroed) and the person's effect lands
                # in the RIVAL's own streams (tech/civic progress,
                # treasury, faith, the capital's build head), mirroring
                # _advance_player_great_people. PROPHETs gate the religion.
                maxN = self._gp_effects.shape[1]
                for _ in range(maxN):
                    earned_c = self.gp_earned[:, cls]
                    has_person = earned_c < self._gp_roster[cls]
                    gcost = self._gp_costs[earned_c.clamp(max=self._gp_costs.shape[0] - 1)]
                    hit = active & has_person & (self.r_gpp[:, r, cls] >= gcost)
                    if not bool(hit.any()):
                        break
                    hf = hit.to(torch.float64)
                    eff = self._gp_effects[cls, earned_c.clamp(max=maxN - 1)]  # [B, 5]
                    self.r_tech_prog[:, r] = self.r_tech_prog[:, r] + eff[:, 0].double() * hf
                    self.r_civic_prog[:, r] = self.r_civic_prog[:, r] + eff[:, 1].double() * hf
                    self.r_treasury[:, r] = self.r_treasury[:, r] + eff[:, 2].double() * hf
                    prod_fx = eff[:, 3].double() * hf
                    if bool((prod_fx != 0).any()):
                        # the capital's build head (TS: cities.find(isCapital),
                        # queue non-empty). P7-FULL: rc_is_cap replaces the
                        # slot-0 invariant (compaction can move the capital);
                        # at most one flag per (b, r), so the masked add
                        # lands on exactly the capital's head or nowhere.
                        capm = self.rc_is_cap[:, r] & self.rc_alive[:, r] & (self.rc_current[:, r] >= 0)
                        self.rc_progress[:, r] = self.rc_progress[:, r] + torch.where(capm, prod_fx.unsqueeze(1), torch.zeros_like(self.rc_progress[:, r]))
                    if self._gp_effects.shape[2] > 4:
                        self.r_faith[:, r] = self.r_faith[:, r] + eff[:, 4].double() * hf
                    if cls == self._prophet_cls:
                        self.r_prophets[:, r] = self.r_prophets[:, r] + hit.long()
                    self.r_gpp[:, r, cls] = torch.where(hit, self.r_gpp[:, r, cls] - gcost, self.r_gpp[:, r, cls])
                    self.gp_earned[:, cls] = self.gp_earned[:, cls] + hit.long()

            # Pantheon / religion claims — A-7: the picks' IDENTITIES matter
            # now (effects apply to this civ). The draw picks the k-th OPEN
            # id in data order: TS open[floor(rand * open.length)] where the
            # open list filters the claimed pool (the player's pantheon is
            # null in scope). P5/S5 (C-17): the pantheon costs
            # pantheonFaithCost from the rival's own faith (deducted only
            # when a pick lands); religion needs the player's
            # canFoundReligion gates — pantheon, completed Holy Site, an
            # earned Prophet.
            pfc = float(rr.get("pantheonFaithCost", 25))
            pdue = active & ~self.r_pantheon_done[:, r] & (self.r_faith[:, r] >= pfc)
            popen = pdue & (self.pantheon_claimed_n < rr.get("pantheonPool", 8))
            rp_ = self._next_random(popen)
            if bool(popen.any()) and self._bel_any:
                n_open = (~self.pan_claimed).sum(dim=1)
                k = torch.floor(rp_ * n_open.to(torch.float64)).to(torch.long)
                cum = (~self.pan_claimed).long().cumsum(dim=1)
                sel = (~self.pan_claimed) & (cum == (k + 1).unsqueeze(1))
                pid = sel.long().argmax(dim=1)
                prow = popen.nonzero(as_tuple=True)[0]
                self.pan_claimed[prow, pid[prow]] = True
                self.r_pantheon[prow, r] = pid[prow]
                self._bel_version += 1  # G1: belief change -> _bel_add / _belief_feat_plane invalidate
            self.r_faith[:, r] = torch.where(popen, self.r_faith[:, r] - pfc, self.r_faith[:, r])
            self.pantheon_claimed_n = self.pantheon_claimed_n + popen.long()
            self.r_pantheon_done[:, r] = self.r_pantheon_done[:, r] | popen
            d_hs = int(self._gp_class_district[self._prophet_cls]) if self._prophet_cls < self._gp_nc else -1
            if d_hs >= 0 and self.districts_on:
                reg_hs = self.rc_dist_tile[:, r, :, d_hs]  # [B, RC]
                has_hs = ((reg_hs >= 0) & self.district_complete.gather(1, reg_hs.clamp(min=0))).any(dim=1)
            else:
                has_hs = torch.zeros(B, dtype=torch.bool, device=dev)
            rdue = active & ~self.r_religion_done[:, r] & self.r_pantheon_done[:, r] & (self.r_prophets[:, r] > 0) & has_hs
            ropen = rdue & (self.claimed_f_n < rr.get("followerPool", 8)) & (self.claimed_o_n < rr.get("founderPool", 8))
            rf_ = self._next_random(ropen)  # follower first, founder second — the TS draw order
            ro_ = self._next_random(ropen)
            if bool(ropen.any()) and self._bel_any:
                rrow = ropen.nonzero(as_tuple=True)[0]
                for claimed_m, ids_t, rnd in ((self.fol_claimed, self.r_follower, rf_), (self.fou_claimed, self.r_founder, ro_)):
                    n_open = (~claimed_m).sum(dim=1)
                    k = torch.floor(rnd * n_open.to(torch.float64)).to(torch.long)
                    cum = (~claimed_m).long().cumsum(dim=1)
                    sel = (~claimed_m) & (cum == (k + 1).unsqueeze(1))
                    bid = sel.long().argmax(dim=1)
                    claimed_m[rrow, bid[rrow]] = True
                    ids_t[rrow, r] = bid[rrow]
                self._bel_version += 1  # G1: follower/founder change -> _bel_add / _belief_feat_plane invalidate
            self.claimed_f_n = self.claimed_f_n + ropen.long()
            self.claimed_o_n = self.claimed_o_n + ropen.long()
            self.r_religion_done[:, r] = self.r_religion_done[:, r] | ropen
            # B-18: freeze this religion's holy tile (the rival's capital center)
            # at founding — the pressure source. r_religion_done latches, so
            # ropen fires once and the tile never re-writes.
            self.holy_tile[:, r + 1] = torch.where(ropen, self.cap_tile_rival[:, r], self.holy_tile[:, r + 1])

            # B-18: enhance the founded religion — a SECOND earned Prophet
            # claims an enhancer belief, denying it from the shared pool
            # (mirror of the follower/founder claim). TS claimBeliefs adds this
            # draw AFTER the founder draw, gated on
            # religionFounded && !enhancerClaimed && prophets>=2 && pool-open.
            # The draw advances only where eopen (the peace-roll pattern), so it
            # is RNG-neutral when it never fires. Effects stay unwired (all
            # enhancers inert) — the identity is kept for when one is wired.
            edue = active & self.r_religion_done[:, r] & ~self.r_enhancer_done[:, r] & (self.r_prophets[:, r] >= 2)
            eopen = edue & (self.claimed_e_n < rr.get("enhancerPool", 0))
            re_ = self._next_random(eopen)  # third belief draw — after follower/founder
            if bool(eopen.any()) and self._enh_any:
                erow = eopen.nonzero(as_tuple=True)[0]
                n_open = (~self.enh_claimed).sum(dim=1)
                k = torch.floor(re_ * n_open.to(torch.float64)).to(torch.long)
                cum = (~self.enh_claimed).long().cumsum(dim=1)
                sel = (~self.enh_claimed) & (cum == (k + 1).unsqueeze(1))
                eid = sel.long().argmax(dim=1)
                self.enh_claimed[erow, eid[erow]] = True
                self.r_enhancer[erow, r] = eid[erow]
                self._bel_version += 1  # G1: enhancer claim (inert today, but keep the belief epoch honest)
            self.claimed_e_n = self.claimed_e_n + eopen.long()
            self.r_enhancer_done[:, r] = self.r_enhancer_done[:, r] | eopen

            # War or peace (branch on the value at entry; a peace made this
            # turn still ran the war branch, exactly like the TS if/else).
            atw = active & self.r_atwar[:, r]
            self.r_warturns[:, r] = self.r_warturns[:, r] + atw.long()
            v_high = int(self.v_next.max().item())
            # D-4: this civ's live slots once (deaths only shrink mid-loop; no
            # spawns in either loop) — the war AND peace walks reuse it.
            v_mine = (self.v_alive[:, :v_high] & (self.v_civ[:, :v_high] == r)).any(dim=0).nonzero(as_tuple=True)[0].tolist() if v_high else []
            for v in v_mine:
                # C1-B5b: civilians never act in the war loop (charges mark them)
                # C3-prep: the units head drives controlled rivals now
                a = atw & ~self.controlled[:, r] & self.v_alive[:, v] & (self.v_civ[:, v] == r) & (self._p_charges[self.v_type[:, v]] == 0)
                if bool(a.any()):
                    self._rival_unit_war_act(v, a)
            peace_roll = atw & ~self.controlled[:, r] & (self.r_warturns[:, r] >= rr.get("warMinTurns", 14))  # C3-sym: controlled rivals leave war via the head
            rp = self._next_random(peace_roll)
            # P5/S2 (C-13): suing costs the rival what it costs the player —
            # peaceGold0 + slope·warTurns from ITS treasury; a broke rival
            # fights on. The roll stays UNCONDITIONAL (draw-count parity);
            # only the outcome gates on milli-rounded affordability.
            pcost = rr.get("peaceGold0", 150) + rr.get("peaceGoldSlope", 10) * self.r_warturns[:, r].to(torch.float64)
            made_peace = peace_roll & (rp < 0.25) & self._afford(self.r_treasury[:, r], pcost)
            if bool(made_peace.any()):
                self.r_treasury[:, r] = torch.where(made_peace, self.r_treasury[:, r] - pcost, self.r_treasury[:, r])
                self.r_atwar[:, r] = self.r_atwar[:, r] & ~made_peace
                self.r_warturns[:, r] = torch.where(made_peace, torch.zeros_like(self.r_warturns[:, r]), self.r_warturns[:, r])
                self.r_peaceturns[:, r] = torch.where(made_peace, torch.zeros_like(self.r_peaceturns[:, r]), self.r_peaceturns[:, r])

            pea = active & ~atw
            self.r_peaceturns[:, r] = self.r_peaceturns[:, r] + pea.long()
            for v in v_mine:  # D-4: the same live-slot snapshot (superset)
                # C1-B5b: builders neither snipe nor patrol
                # C3-prep: the units head drives controlled rivals now
                a = pea & ~self.controlled[:, r] & self.v_alive[:, v] & (self.v_civ[:, v] == r) & (self._p_charges[self.v_type[:, v]] == 0)
                if bool(a.any()):
                    self._rival_unit_peace_act(v, a, r)
            # War declaration: strength/proximity gates first, the roll last.
            # C3-sym: controlled rivals own their war choices — the scripted
            # declaration below gates on ~controlled; the peace ROLL above
            # already ran only for atw rows (controlled rivals leave war via
            # the head, so their roll is masked too)
            p_str = self.alive.sum(dim=1) * 10 + (self.p_alive.to(torch.long) * self._p_combat[self.p_type]).sum(dim=1)
            own_cs = (self.v_alive & (self.v_civ == r)).to(torch.long) * self._p_combat[self.v_type]
            # C1-B2: strength counts what exists (cities + fielded units)
            r_str = js_round(n_cities2.double() * 8 + own_cs.sum(dim=1).double())
            d_pr = self.pair_dist[
                self.site.clamp(min=0).unsqueeze(2), self.rc_center[:, r].clamp(min=0).unsqueeze(1)
            ].to(torch.long)  # [B, C, RC] pairwise — no [B, C, T] intermediate
            pair_ok = self.alive.unsqueeze(2) & self.rc_alive[:, r].unsqueeze(1)
            prox = torch.where(pair_ok, d_pr, 999).reshape(B, -1).min(dim=1).values
            cond = (
                pea
                & (self.alive.sum(dim=1) > 0)
                & (self.r_peaceturns[:, r] > 20)
                & (prox <= 9)
                & (r_str > p_str.double() * 1.3)
                & ~self.controlled[:, r]
            )
            rw = self._next_random(cond)
            declare = cond & (rw < 0.08 * (0.5 + self.r_aggression[:, r]))
            if bool(declare.any()):
                self.r_atwar[:, r] = self.r_atwar[:, r] | declare
                self.r_warturns[:, r] = torch.where(declare, torch.zeros_like(self.r_warturns[:, r]), self.r_warturns[:, r])
        # G3 hardening: drop the G1 route-income cache at phase end. Its key
        # (turn, r, eff, _rp_kill_version) does not cover unit deaths in the
        # war/peace acts above, so post-phase callers (leader/domination/
        # trace) must recompute against post-war state. With R>=2 the single
        # slot is overwritten before any same-r re-read (the G1 argument),
        # but that R-parity must not be load-bearing for R=1 configs.
        self._rival_route_cache = None

    def _apply_loyalty_and_flips(self, tier_idx: torch.Tensor, pop_before: torch.Tensor) -> None:
        """Mirrors applyLoyalty inside the city loop + the deferred flips.
        City c's own-pressure mixes pops: cities EARLIER in the loop already
        grew this turn, later ones did not. Capitals pin to 100. A city at 0
        defects to the highest-pressure rival (ties → lowest id)."""
        if self.R == 0:
            return
        B, C, dev = self.B, self.C, self.device
        any_rc = (self.rc_alive.any(dim=2) & self.r_alive).any(dim=1)
        if not bool(any_rc.any()):
            return
        rng = int(self.rules.rivals.get("loyaltyRange", 9))
        scale = float(self.rules.rivals.get("loyaltyScale", 20))
        sitec = self.site.clamp(min=0)
        d_cc = self.pair_dist[sitec.unsqueeze(2), sitec.unsqueeze(1)].to(self.dtype)
        # d_cc[b, c, c'] = dist(site[c], site[c']) — weight by source c'
        w = (rng + 1 - d_cc).clamp(min=0)
        # P5/S3 gate-catch (seed 9066 t184, own 53 vs 58): "earlier in the
        # loop" is TS ARRAY order (acquisition order, city_seq), NOT column
        # order — an S2 hole-reuse founding puts the NEWEST city in a LOW
        # column, and every array-earlier/column-later city's same-turn
        # growth went missing from its own-pressure sum.
        seq = self.city_seq
        earlier = seq.unsqueeze(1) < seq.unsqueeze(2)  # [B, c, c'] → seq[c'] < seq[c]
        pop_mix = torch.where(earlier, self.pop.unsqueeze(1).to(self.dtype), pop_before.unsqueeze(1).to(self.dtype))
        own = (w * pop_mix * self.alive.unsqueeze(1).to(self.dtype)).sum(dim=2)
        # foreign pressure from rival cities
        rc_flat = self.rc_center.reshape(B, -1).clamp(min=0)
        rc_live = self.rc_alive.reshape(B, -1)
        d_cr = self.pair_dist[sitec.unsqueeze(2), rc_flat.unsqueeze(1)].to(self.dtype)
        wf = (rng + 1 - d_cr).clamp(min=0)
        foreign = (wf * self.rc_pop.reshape(B, -1).unsqueeze(1).to(self.dtype) * rc_live.unsqueeze(1).to(self.dtype)).sum(dim=2)
        tot = own + foreign
        pressure = torch.where(tot > 0, scale * (own - foreign) / tot.clamp(min=1e-9), torch.zeros_like(tot))
        delta = pressure + self._loyalty_amenity[tier_idx.clamp(min=0, max=self._loyalty_amenity.shape[0] - 1)]
        upd = self.alive & any_rc.unsqueeze(1)
        nxt = (self.loyalty + delta).clamp(min=0, max=float(self.rules.rivals.get("loyaltyMax", 100)))
        self.loyalty = torch.where(upd, nxt, self.loyalty)
        # P7 (C-1): pin/guard by IDENTITY (TS isCapital), not column 0.
        cap_pin = upd & self.is_cap
        self.loyalty = torch.where(cap_pin, torch.full_like(self.loyalty, 100.0), self.loyalty)
        flip = upd & (self.loyalty <= 0) & ~self.is_cap
        if not bool(flip.any()):
            return
        # Winner per flipping city: the rival with the most pressure (ties →
        # lowest id; zero pressure still wins over the -1 sentinel).
        # P7 (C-2): defectors resolve in ACQUISITION order (TS collects them
        # in its array-order loop) with pressures read LIVE per defection —
        # an earlier transfer moves pops that later defections must see.
        pairs: list[tuple[int, int, int]] = []
        for c in range(C):
            for b in flip[:, c].nonzero(as_tuple=True)[0].tolist():
                pairs.append((b, int(self.city_seq[b, c]), c))
        for b, _, c in sorted(pairs):
            site_c = int(self.site[b, c])
            d_rc1 = self.pair_dist[site_c, rc_flat[b].clamp(min=0)].to(self.dtype)
            wr = (rng + 1 - d_rc1).clamp(min=0) * self.rc_pop[b].reshape(-1).to(self.dtype) * rc_live[b].to(self.dtype)
            press_r = wr.reshape(self.R if self.R > 0 else 1, self.RC).sum(dim=1)
            press_r = torch.where(self.r_alive[b], press_r, torch.full_like(press_r, -1.0))
            winner = int(first_argmax(press_r.unsqueeze(0))[0])  # ties -> lowest rival id (TS strict >)
            self._transfer_city_to_rival(b, c, winner)

    def _transfer_city_to_rival(self, b: int, c: int, w_: int, conquest: bool = False) -> bool:
        """The player-city -> rival-city transfer (shared by loyalty flips
        and V-W2's reverse capture — mirrors transferCityToRival). Returns
        False when a CONQUEST razes at the winner's city cap (P5/S7 C-5,
        mirroring TS: the city ceases — tiles freed, center unpaved, no
        plunder); loyalty flips stay uncapped."""
        old_pop = int(self.pop[b, c])
        # the city leaves the empire
        self.alive[b, c] = False
        self.is_cap[b, c] = False  # P7 hygiene: identity dies with the city (a refound sets it fresh)
        self.pop[b, c] = 0
        self.current[b, c] = -1
        owned = self.owner[b] == c
        if conquest and int(self.rc_alive[b, w_].sum()) >= int(self.rules.rivals.get("maxCities", 6)):
            s_t = int(self.site[b, c])
            self.owner[b] = torch.where(owned, torch.full_like(self.owner[b], -1), self.owner[b])
            self.center_at[b, s_t] = -1
            self.district[b, s_t] = -1
            self.district_complete[b, s_t] = False
            self._eff_version += 1
            return False
        self.owner[b] = torch.where(owned, torch.full_like(self.owner[b], -1), self.owner[b])
        self.rival_at[b] = torch.where(owned, torch.full_like(self.rival_at[b], w_), self.rival_at[b])
        # A-17: the defecting city's tiles register to the receiving rc (id
        # assigned below from r_next_city_id — same value, read here first)
        self.rc_tile_id[b] = torch.where(owned, torch.full_like(self.rc_tile_id[b], int(self.r_next_city_id[b, w_])), self.rc_tile_id[b])
        self.center_at[b, self.site[b, c]] = -1
        # ...and joins the winner. P5/S1: last-alive+1, NOT the alive count —
        # a capture hole would make the count point at a live city (see
        # _rival_try_found; TS appends, new cities iterate last).
        alive_w = self.rc_alive[b, w_].nonzero(as_tuple=True)[0]
        slot = int(alive_w.max()) + 1 if len(alive_w) else 0
        assert slot < self.RC, "rival city slots exhausted — raise RC (compaction already ran; this is true living capacity)"
        self.rc_alive[b, w_, slot] = True
        self.rc_is_cap[b, w_, slot] = False  # TS defect: isCapital false (rivals.ts:420)
        self.rc_center[b, w_, slot] = self.site[b, c]
        self.rc_pop[b, w_, slot] = max(1, (old_pop * 3) // 4)
        self.rc_growth[b, w_, slot] = 0
        self.rc_cbox[b, w_, slot] = 0  # P5/S4 (TS transfer: cultureBox 0)
        self.rc_loyalty[b, w_, slot] = 100.0  # P5/S6
        self.rc_acquired[b, w_, slot] = int(self.tiles_acquired[b, c])
        self.rc_hp[b, w_, slot] = round(self.rules.rivals.get("cityMaxHp", 200) / 2)
        self.rc_id[b, w_, slot] = int(self.r_next_city_id[b, w_])
        self.rc_current[b, w_, slot] = -1
        self.rc_progress[b, w_, slot] = 0.0
        self.rc_cost[b, w_, slot] = 0.0
        self.rc_qtile[b, w_, slot] = -1
        self.rc_dist_tile[b, w_, slot, :] = -1  # flipped districts are NOT adopted (paved-but-dead)
        self.rc_wonder[b, w_, slot, :] = -1  # A-4: nor wonders (the tile keeps builtWonderComplete, orphaned)
        self.rc_bldg[b, w_, slot, :] = False  # nor buildings
        self.r_next_city_id[b, w_] += 1
        self.rvcity_at[b, self.site[b, c]] = w_
        return True

    def _apply_settlers_and_purchases(self, act: torch.Tensor, buildable: torch.Tensor) -> None:
        """RL settler queueing + gold purchases, walked in city-slot order (V-P1).

        Only runs when _rl_purchase_active. Settler prices and the treasury are
        order-coupled across cities deciding in the same turn: queueing OR
        buying a settler raises the next slot's settlerCost (both feed the same
        `cities-1 + settlers + queued` counter, mirroring settlerCost /
        purchaseSettler), and every purchase drains the shared treasury. The TS
        replay applies act.p entries sequentially in slot order, so this walk
        mirrors it exactly. Failed purchases (gold ran out by this slot, or a
        unit with no free spawn tile — TS spawnUnit refunds) are no-ops, not
        errors, matching the units-head revalidation convention. Purchased
        buildings/units land instantly (before _city_totals), so they take
        effect this very turn — exactly when a CivEnv purchase does in endTurn.
        """
        r, rd, C = self.rules, self.rules_dev, self.C
        mult = r.gold_purchase_mult
        pbase = self.UNIT_BASE + self.NU + len(self._scaffold)
        n_cities = self.alive.sum(dim=1)
        # live counters: settlers-in-production from EARLIER turns (pending
        # cities are -1 and building/unit codes never write SETTLER)…
        queued_live = (self.current == self.SETTLER).sum(dim=1)
        # …and the settler stock, which purchases grow as the walk proceeds
        settlers_live = self.settlers.clone()
        # P4/D-10: the builder escalator's live count — builders queued in
        # EARLIER turns plus, as the walk proceeds, this turn's queues and
        # purchases (TS applies act.p sequentially; both move builderCost).
        bcode_w = (self.UNIT_BASE + self._builder_idx) if self._builder_idx >= 0 else -999
        bqueued_live = (self.current == bcode_w).sum(dim=1)
        for c in range(C):
            ac = act[:, c]
            # --- queue a settler (cost from the live counters, queueSettler)
            is_s = ac == self.SETTLER
            if bool(is_s.any()):
                s_cost = r.settler_base + r.settler_per_city * (
                    n_cities - 1 + settlers_live + queued_live
                ).clamp(min=0).to(self.dtype)
                self.progress[:, c] = torch.where(is_s, torch.zeros_like(self.progress[:, c]), self.progress[:, c])
                self.cur_cost[:, c] = torch.where(is_s, s_cost, self.cur_cost[:, c])
                self.current[:, c] = torch.where(is_s, torch.full_like(self.current[:, c], self.SETTLER), self.current[:, c])
                queued_live = queued_live + is_s.long()
                self.settlers_queued = self.settlers_queued + is_s.long()
            # --- queue a builder (P4/D-10: excluded from the vectorized unit
            # block in purchase mode; priced off the live escalator here).
            if self._builder_idx >= 0:
                is_bq = (ac == bcode_w) & self.alive[:, c] & (self.current[:, c] == -1)
                if bool(is_bq.any()):
                    b_cost = self._builder_cost(self.builders_trained + bqueued_live)
                    self.progress[:, c] = torch.where(is_bq, torch.zeros_like(self.progress[:, c]), self.progress[:, c])
                    self.cur_cost[:, c] = torch.where(is_bq, b_cost, self.cur_cost[:, c])
                    self.current[:, c] = torch.where(is_bq, torch.full_like(self.current[:, c], bcode_w), self.current[:, c])
                    bqueued_live = bqueued_live + is_bq.long()
            pi = ac - pbase
            # --- buy a building (purchaseBuilding: _buildable ∧ gold; instant)
            is_pb = (pi >= 0) & (pi < self.NB)
            if bool(is_pb.any()):
                idx = pi.clamp(min=0, max=self.NB - 1)
                cost = rd.b_cost[idx] * mult
                can = is_pb & buildable[:, c].gather(1, idx.unsqueeze(1)).squeeze(1) & self._afford(self.treasury, cost)
                if bool(can.any()):
                    rows = can.nonzero(as_tuple=True)[0]
                    self.buildings[rows, c, idx[rows]] = True
                    # AUDIT B-1: a purchased ANCIENT_WALLS fills the outer pool.
                    if self._walls_bidx >= 0:
                        wm = rows[idx[rows] == self._walls_bidx]
                        if len(wm) > 0:
                            self.outer_hp[wm, c] = self._walls_hp
                    self._eff_version += 1  # D-8: _buildable keys on it (a bought building must vanish from later masks)
                    self.treasury = torch.where(can, self.treasury - cost, self.treasury)
            # --- buy a settler (purchaseSettler: settlers += 1 immediately,
            # which raises every later slot's price)
            is_ps = pi == self.NB
            if bool(is_ps.any()):
                s_cost = (
                    r.settler_base + r.settler_per_city * (n_cities - 1 + settlers_live + queued_live).clamp(min=0).to(self.dtype)
                ) * mult
                can = is_ps & self._afford(self.treasury, s_cost)
                self.treasury = torch.where(can, self.treasury - s_cost, self.treasury)
                self.settlers = self.settlers + can.long()
                self.pop[:, c] = torch.where(can, (self.pop[:, c] - 1).clamp(min=1), self.pop[:, c])  # P4/D-6: purchased settlers cost the pop too
                settlers_live = settlers_live + can.long()
            # --- buy a unit (purchaseUnit: trainable ∧ gold ∧ a free spawn
            # tile at/near the center — no tile means refund, i.e. a no-op)
            pu = pi - (self.NB + 1)
            is_pu = (pu >= 0) & (pu < self.NU)
            if bool(is_pu.any()):
                utp = pu.clamp(min=0, max=self.NU - 1)
                p_tech = self._p_tech[utp]
                tech_ok = (p_tech < 0) | self.techs.gather(1, p_tech.clamp(min=0).unsqueeze(1)).squeeze(1)
                cost = self._p_cost[utp] * mult
                if self._builder_idx >= 0:
                    # P4/D-10: bought builders price off the live escalator…
                    b_now = self._builder_cost(self.builders_trained + bqueued_live) * mult
                    cost = torch.where(utp == self._builder_idx, b_now, cost)
                found, _ = self._first_free_spot(self.site[:, c], "player", self._p_civ[utp])
                can = is_pu & tech_ok & self._afford(self.treasury, cost) & found
                if bool(can.any()):
                    self.treasury = torch.where(can, self.treasury - cost, self.treasury)
                    self._spawn_player(can, self.site[:, c], utp)
                    if self._builder_idx >= 0:
                        # …and move it for every later slot (TS purchaseUnit).
                        self.builders_trained = self.builders_trained + (can & (utp == self._builder_idx)).long()

    # --- one full turn -----------------------------------------------------------

    def _reclaim_pool(self, prefix: str) -> None:
        """P7 (C-3, the G-S cliff): stable compaction of a unit pool when
        its high-water nears the cap. TS arrays SPLICE dead units, so the
        LIVING's relative order IS the spec — a stable compaction preserves
        it exactly (slot loops visit the same units in the same order;
        draws unchanged). Tile->slot maps remap by VALUE through the
        inverse permutation — no semantic rebuild. CIV6_RECLAIM_AT lowers
        the trigger for forced-compaction validation gates."""
        if prefix == "u":
            fields, counter, maps = ["u_acted", "u_type", "u_tile", "u_hp", "u_fortify"], "next_slot", ["barb_at"]
        elif prefix == "v":
            fields, counter, maps = ["v_acted", "v_civ", "v_type", "v_tile", "v_hp", "v_charges", "v_fortify"], "v_next", ["rv_at", "rvciv_at"]
        else:
            fields, counter, maps = ["p_acted", "p_type", "p_tile", "p_hp", "p_charges", "p_fortify"], "p_next", ["pmil_at", "pciv_at"]
        alive = getattr(self, f"{prefix}_alive")
        B, U = alive.shape
        perm = torch.argsort((~alive).long(), dim=1, stable=True)  # living first, order kept
        inv = torch.empty_like(perm)
        inv.scatter_(1, perm, torch.arange(U, device=alive.device).unsqueeze(0).expand(B, -1))
        for name in fields:
            setattr(self, name, getattr(self, name).gather(1, perm))
        new_alive = alive.gather(1, perm)
        setattr(self, f"{prefix}_alive", new_alive)
        getattr(self, counter).copy_(new_alive.sum(dim=1))
        for m in maps:
            at = getattr(self, m)
            setattr(self, m, torch.where(at >= 0, inv.gather(1, at.clamp(min=0)), at))

    _RC_SLOT_FIELDS = (
        "rc_alive", "rc_center", "rc_pop", "rc_growth", "rc_cbox", "rc_loyalty",
        "rc_acquired", "rc_hp", "rc_outer_hp", "rc_id", "rc_is_cap", "rc_current", "rc_progress",
        "rc_cost", "rc_qtile", "rc_followed",  # B-18: pressure spread (3D per-slot)
    )

    def _reclaim_rc(self) -> None:
        """P7-FULL (C-3): stable compaction of the rc city slots, per (game,
        civ). TS SPLICES rival.cities on capture/flip/transfer and pushes on
        settle/receive, so the LIVING's relative order IS the spec — stable
        compaction preserves it exactly (the per-slot loops, the arange
        tie-breaks and rival_empire_score's sequential association all see
        the same cities in the same order). No tile map keys on the SLOT
        (rvcity_at/rival_at are civ-keyed; rc_center carries tile VALUES and
        permutes with its row), so no inverse-map rebuild is needed — but
        the capital is an identity, not a slot (rc_is_cap permutes along).
        Runs at the step END like _reclaim_pool: the controlled head samples
        slot-keyed city actions from the PRE-step masks, so the layout must
        hold through this step's applies. CIV6_RC_RECLAIM_AT lowers the
        trigger for forced-compaction validation gates."""
        alive = self.rc_alive  # [B, R, RC]
        perm = torch.argsort((~alive).long(), dim=2, stable=True)  # living first, order kept
        for name in self._RC_SLOT_FIELDS:
            setattr(self, name, getattr(self, name).gather(2, perm))
        for name in ("rc_dist_tile", "rc_bldg", "rc_wonder", "rc_pressure"):  # B-18: rc_pressure is 4D [B,R,RC,O]
            t = getattr(self, name)
            setattr(self, name, t.gather(2, perm.unsqueeze(3).expand(-1, -1, -1, t.shape[3])))
        self._eff_version += 1  # no (r, j)-keyed cache may survive the permutation

    def step(
        self,
        production: torch.Tensor | None = None,
        tech: torch.Tensor | None = None,
        civic: torch.Tensor | None = None,
        units: torch.Tensor | None = None,
        envoy: torch.Tensor | None = None,
        war: torch.Tensor | None = None,
    ) -> None:
        """Advance every game one turn.

        production: [B, C] long — per-city action (0..NB-1 building, NB
        settler, NB+1 idle, NB+2..NB+1+NU train that roster unit,
        NB+2+NU.. place that scaffold district; with _rl_purchase_active,
        NB+2+NU+nScaffold.. buy that building / a settler / that unit with
        gold — V-P1; masked-invalid = no-op), or None for the scripted policy. tech/civic: [B] long picks
        applied where the research slot is empty (validated against the
        masks; -1 = no pick), or None for cheapest-first auto-research.
        units: [B, P_MAX] long unit orders (0–5 move, 6–11 attack, 12 hold),
        executed in slot order before the turn advances, like a player
        issuing orders before pressing end-turn. None = all hold.
        envoy: [B] long — back that city-state with one available envoy
        (validated; -1 = none), or None for the scripted greedy assignment
        (neediest met city-state, ties to the lowest id, until spent).
        war: [B] long (V-W1, ignored while _rl_war_active is off) — 0..R-1
        declare war on that rival, R..2R-1 sue for peace with it, -1 none.
        Applied FIRST, before unit orders, so a same-turn declaration
        legalizes attacks at execution (the replay applies it at the same
        point); the pre-step masks the policy sampled from simply lag it.
        """
        r, B, C, T, dev = self.rules, self.B, self.C, self.T, self.device
        rd = self.rules_dev

        # --- player diplomacy (V-W1; gated) --------------------------------------
        if war is not None and self._rl_war_active and self.R > 0:
            w = war.to(torch.long)
            ok = (w >= 0) & self.war_mask().gather(1, w.clamp(min=0).unsqueeze(1)).squeeze(1)
            if bool(ok.any()):
                decl = ok & (w < self.R)
                if bool(decl.any()):
                    oh = torch.nn.functional.one_hot(w.clamp(min=0, max=self.R - 1), self.R).bool() & decl.unsqueeze(1)
                    self.r_atwar = self.r_atwar | oh
                    self.r_warturns = torch.where(oh, torch.zeros_like(self.r_warturns), self.r_warturns)
                pea = ok & (w >= self.R)
                if bool(pea.any()):
                    ri = (w - self.R).clamp(min=0, max=self.R - 1)
                    rr = self.rules.rivals
                    cost = rr.get("peaceGold0", 150) + rr.get("peaceGoldSlope", 10) * self.r_warturns.gather(
                        1, ri.unsqueeze(1)
                    ).squeeze(1).to(self.dtype)
                    oh = torch.nn.functional.one_hot(ri, self.R).bool() & pea.unsqueeze(1)
                    self.treasury = torch.where(pea, self.treasury - cost, self.treasury)
                    self.r_atwar = self.r_atwar & ~oh
                    self.r_warturns = torch.where(oh, torch.zeros_like(self.r_warturns), self.r_warturns)
                    self.r_peaceturns = torch.where(oh, torch.zeros_like(self.r_peaceturns), self.r_peaceturns)

        # --- war weariness: player accrual (B-15) --------------------------------
        # Accrue once per turn while at war with any LIVE rival (state as left by
        # last turn's rival phase — the war block above is inert in scripted mode);
        # decay 4× in peace. Mirrors endTurn's top-of-turn update (game.ts).
        rww = self.rules.war_weariness
        if self.R > 0:
            live = self.rc_alive[:, : self.R].any(dim=2)  # [B, R]
            atwar_now = (self.r_atwar[:, : self.R] & live).any(dim=1)  # [B]
        else:
            atwar_now = torch.zeros(B, dtype=torch.bool, device=dev)
        inc = (self.war_weariness + int(rww.get("perTurn", 1))).clamp(max=int(rww.get("cap", 24)))
        dec = (self.war_weariness - int(rww.get("decay", 4))).clamp(min=0)
        self.war_weariness = torch.where(atwar_now, inc, dec)

        # --- player unit orders (before the turn advances) ----------------------
        # #56 phase-order: the EXPORTER's script runs envoys → production →
        # builder walker; the scripted walker call therefore moved BELOW the
        # production-choice section (it used to run here, before production,
        # which (a) made production see post-walker builder state — seeds
        # 9092 t78 / 9274 t77, the GPU re-queued a builder one turn early —
        # and (b) let the walker target a tile THIS turn's production loop
        # had already paved with a district/wonder — seed 9287 t128, tile
        # 296, a one-turn phantom job that desynced the whole walk). Replay
        # unit actions stay here (their ordering contract is the recording).
        if units is not None and self.units_mode:
            self._apply_unit_actions(units)

        # --- envoys --------------------------------------------------------------
        if self.S > 0:
            if envoy is None:
                for _ in range(3):
                    can = (self.envoys_avail > 0) & (self.cs_alive & self.cs_met).any(dim=1)
                    if not bool(can.any()):
                        break
                    key = torch.where(
                        self.cs_alive & self.cs_met,
                        self.cs_envoys * 64 + torch.arange(self.cs_envoys.shape[1], device=dev),
                        torch.full_like(self.cs_envoys, 10**9),
                    )
                    pick = key.argmin(dim=1)
                    rows = can.nonzero(as_tuple=True)[0]
                    self.cs_envoys[rows, pick[rows]] += 1
                    self.envoys_avail = self.envoys_avail - can.long()
            else:
                e_act = envoy.to(torch.long)
                ok = (e_act >= 0) & self.envoy_mask().gather(1, e_act.clamp(min=0).unsqueeze(1)).squeeze(1)
                if bool(ok.any()):
                    rows = ok.nonzero(as_tuple=True)[0]
                    self.cs_envoys[rows, e_act[rows]] += 1
                    self.envoys_avail = self.envoys_avail - ok.long()

        # --- production choice ------------------------------------------------
        if production is None:
            # Scripted, in the exporter's else-if order. One builder from the
            # capital FIRST, once (pop >= 2): the capital trains settlers for
            # the rest of the game, so the builder must precede them.
            if self.units_mode and self._builder_idx >= 0 and self.improvements_on:
                empty = self.alive & (self.current == -1)
                bcode = self.UNIT_BASE + self._builder_idx
                # #56 H2: the once-ever builder_trained flag is replaced by a
                # dynamic gate — re-train when no charged builder is alive or
                # queued AND a builder job exists (owned unimproved-farmable OR
                # owned pillaged; the walker's exact job set). Reads LIVE state:
                # the walker now runs AFTER production (TS phase order), so the
                # live view here IS what TS's loop saw. The legacy flag tensor
                # stays registered for snapshot-format stability.
                b_have = (self.p_alive & (self.p_type == self._builder_idx) & (self.p_charges > 0)).any(dim=1) | (self.current == bcode).any(dim=1)
                if self._hillfarms_civic >= 0:
                    farm_ok_b = self.farm_flat | (self.farm_hill & self.civics[:, self._hillfarms_civic].unsqueeze(1))
                else:
                    farm_ok_b = self.farm_flat
                b_job = (
                    ((self.owner >= 0) & (self.center_at < 0) & (self.improvement < 0) & (self.district < 0) & (self.built_wonder < 0) & farm_ok_b)
                    | ((self.owner >= 0) & self.pillaged)
                ).any(dim=1)
                want_b = empty[:, 0] & (self.pop[:, 0] >= 2) & ~b_have & b_job
                # P4/D-10: escalated price (queued count read BEFORE the write)
                b_cost = self._builder_cost(self.builders_trained + (self.current == bcode).sum(dim=1))
                self.current[:, 0] = torch.where(want_b, torch.full_like(self.current[:, 0], bcode), self.current[:, 0])
                self.cur_cost[:, 0] = torch.where(want_b, b_cost, self.cur_cost[:, 0])
                self.progress[:, 0] = torch.where(want_b, torch.zeros_like(self.progress[:, 0]), self.progress[:, 0])

            # Then a settler when sites remain and pop reached the gate
            # (mirrors the exporter; cost mirrors settlerCost).
            empty = self.alive & (self.current == -1)
            n_cities = self.alive.sum(dim=1)
            queued_settlers = (self.current == self.SETTLER).sum(dim=1)
            want_settler = empty[:, 0] & (self.settlers_queued < (C - 1)) & (self.pop[:, 0] >= r.settler_pop_gate)
            s_cost = r.settler_base + r.settler_per_city * (n_cities - 1 + self.settlers + queued_settlers).clamp(min=0).to(self.dtype)
            self.current[:, 0] = torch.where(want_settler, torch.full_like(self.current[:, 0], self.SETTLER), self.current[:, 0])
            self.cur_cost[:, 0] = torch.where(want_settler, s_cost, self.cur_cost[:, 0])
            self.progress[:, 0] = torch.where(want_settler, torch.zeros_like(self.progress[:, 0]), self.progress[:, 0])
            self.settlers_queued = self.settlers_queued + want_settler.long()

            # One defender per city, once it can spare the production
            # (mirrors the exporter script's warrior branch).
            if self.units_mode:
                empty = self.alive & (self.current == -1)
                # #56 H1: military queued BEFORE this turn's warrior/army
                # writes (TS militaryCount sees pre-loop queues as its base;
                # builders are in the unit code range but combat 0).
                _in_urange = (self.current >= self.UNIT_BASE) & (self.current < self.UNIT_BASE + self.NU)
                mil_q0 = (_in_urange & (self._p_combat[(self.current - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)] > 0)).sum(dim=1)
                want_w = empty & (self.pop >= 2) & ~self.warrior_trained
                wcode = self.UNIT_BASE + self._warrior_idx
                self.current = torch.where(want_w, torch.full_like(self.current, wcode), self.current)
                self.cur_cost = torch.where(want_w, self._p_cost[self._warrior_idx].expand_as(self.cur_cost), self.cur_cost)
                self.progress = torch.where(want_w, torch.zeros_like(self.progress), self.progress)
                self.warrior_trained = self.warrior_trained | want_w

            # Scripted districts (P2): the CAPITAL queues the next scaffold
            # district when idle — after the warrior branch, before the
            # cheapest-building fallback, mirroring the exporter's per-city
            # chain. First unplaced spec (scaffold order) whose tech is in AND
            # an eligible tile exists; queueDistrict semantics via
            # _place_district (paved incomplete + feature strip + cost).
            if self.districts_on and self._campus_active and self._scaffold:
                dcp = self.rules.district_cost
                # P4/D-8: floor(54·(1 + 9·max(tech%, civic%))) — the real curve
                t_pct = self.techs.sum(dim=1).double() / float(rd.t_cost.shape[0])
                c_pct = self.civics.sum(dim=1).double() / float(rd.c_cost.shape[0])
                d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct, c_pct))).to(self.dtype)
                cap_max = torch.div(self.pop[:, 0] - 1, 3, rounding_mode="floor") + 1  # maxSpecialtyDistricts(capital pop)
                dtaken = torch.zeros(B, dtype=torch.bool, device=dev)  # at most one queue per turn
                for si, (di, utech, plc) in enumerate(self._scaffold):
                    has_tech = self.techs[:, utech] if utech >= 0 else torch.ones(B, dtype=torch.bool, device=dev)
                    spec_count = ((self.district >= 0) & self._is_specialty[self.district.clamp(min=0)] & (self.owner == 0) & ~self.district_dead).sum(dim=1)  # LIVE specialty only
                    under_cap = (plc == 1) | (spec_count < cap_max)  # Aqueduct is non-specialty → no cap
                    want = (self.current[:, 0] == -1) & ~dtaken & has_tech & ~self.dscaffold_placed[:, si] & self.alive[:, 0] & under_cap
                    if not bool(want.any()):
                        continue
                    # P4/D-8: discount read BEFORE the placement registers
                    disc = self._player_district_discounted(di)
                    d_cost_si = torch.where(disc, torch.floor(d_cost * 0.6), d_cost)
                    placed, best = self._place_district(di, want, 0, plc)
                    if bool(placed.any()):
                        self.dscaffold_placed[:, si] = self.dscaffold_placed[:, si] | placed
                        self.current[:, 0] = torch.where(placed, torch.full_like(self.current[:, 0], self.UNIT_BASE + self.NU + si), self.current[:, 0])
                        self.cur_cost[:, 0] = torch.where(placed, d_cost_si, self.cur_cost[:, 0])
                        self.progress[:, 0] = torch.where(placed, torch.zeros_like(self.progress[:, 0]), self.progress[:, 0])
                        self.q_dtile[:, 0] = torch.where(placed, best, self.q_dtile[:, 0])
                        dtaken = dtaken | placed

            # #56 H1: army scaling — a standing army of 2 military units per
            # alive city, replacing losses with the best trainable unit.
            # Mirrors the exporter's per-city else-if EXACTLY: city i's count
            # sees this turn's queues from cities earlier in ARRAY order
            # (city_seq), so the fill is a prefix walk in city_seq order —
            # base_k + j is non-decreasing, the allowed set is a prefix, and a
            # single cumsum reproduces the sequential greedy.
            if self.units_mode:
                empty = self.alive & (self.current == -1)
                mil_alive = (self.p_alive & (self._p_combat[self.p_type.clamp(min=0, max=self.NU - 1)] > 0)).sum(dim=1)
                quota = 2 * self.alive.sum(dim=1)
                cand = empty & (self.pop >= 2)
                if bool(cand.any()):
                    ordc = torch.argsort(torch.where(self.alive, self.city_seq, self.city_seq + 10**6), dim=1, stable=True)
                    w_ord = want_w.gather(1, ordc).long()
                    cand_ord = cand.gather(1, ordc)
                    cum_w = w_ord.cumsum(dim=1) - w_ord
                    j_ord = cand_ord.long().cumsum(dim=1) - cand_ord.long()
                    base_ord = (mil_alive + mil_q0).unsqueeze(1) + cum_w
                    allow_ord = cand_ord & (base_ord + j_ord < quota.unsqueeze(1))
                    want_a = torch.zeros_like(cand)
                    want_a.scatter_(1, ordc, allow_ord)
                    if bool(want_a.any()):
                        # best trainable military: unique integer key
                        # combat·NU − idx ⇒ argmax is unambiguous and ties
                        # resolve to the LOWEST unit index = the TS strict->
                        # first-wins over UNITS table order.
                        tr_u = (self._p_tech.unsqueeze(0) < 0) | self.techs.gather(1, self._p_tech.clamp(min=0).unsqueeze(0).expand(B, -1))
                        base_key = self._p_combat.long() * self.NU - torch.arange(self.NU, device=dev)
                        key_u = torch.where(tr_u & (self._p_combat.unsqueeze(0) > 0), base_key.unsqueeze(0).expand(B, -1), torch.full((B, self.NU), -(10**9), dtype=torch.long, device=dev))
                        best_u = key_u.argmax(dim=1)  # [B]
                        ucode = (self.UNIT_BASE + best_u).unsqueeze(1).expand_as(self.current)
                        ucost = self._p_cost[best_u].unsqueeze(1).expand_as(self.cur_cost)
                        self.current = torch.where(want_a, ucode, self.current)
                        self.cur_cost = torch.where(want_a, ucost, self.cur_cost)
                        self.progress = torch.where(want_a, torch.zeros_like(self.progress), self.progress)

            # Everyone else: cheapest available City Center building.
            empty = self.alive & (self.current == -1)
            buildable = self._buildable()
            first = torch.where(buildable, self._arangeNB.view(1, 1, -1), self.NB).min(dim=2).values  # [B, C]
            pickable = empty & (first < self.NB)
            self.progress = torch.where(pickable, torch.zeros_like(self.progress), self.progress)
            self.cur_cost = torch.where(pickable, rd.b_cost[first.clamp(max=self.NB - 1)], self.cur_cost)
            self.current = torch.where(pickable, first, self.current)
        else:
            act = torch.where(self.alive & (self.current == -1), production.to(torch.long), torch.full_like(production.to(torch.long), -1))
            buildable = self._buildable()
            is_b = (act >= 0) & (act < self.NB)
            valid_b = is_b & buildable.gather(2, act.clamp(min=0, max=self.NB - 1).unsqueeze(2)).squeeze(2)
            is_s = act == self.SETTLER
            is_u = (act >= self.UNIT_BASE) & (act < self.UNIT_BASE + self.NU)
            ut = (act - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
            trainable = (self._p_tech.unsqueeze(0) < 0) | self.techs.gather(
                1, self._p_tech.clamp(min=0).unsqueeze(0).expand(B, -1)
            )  # [B, NU]
            valid_u = is_u & trainable.gather(1, ut)
            if self._rl_purchase_active and self._builder_idx >= 0:
                # P4/D-10: with purchases live, builder queues are order-coupled
                # with builder PURCHASES in the same turn (both move the
                # escalator) — the sequential walk below handles them instead.
                valid_u = valid_u & (ut != self._builder_idx)
            self.progress = torch.where(valid_b | valid_u, torch.zeros_like(self.progress), self.progress)
            self.cur_cost = torch.where(valid_b, rd.b_cost[act.clamp(min=0, max=self.NB - 1)], self.cur_cost)
            self.cur_cost = torch.where(valid_u, self._p_cost[ut], self.cur_cost)
            if self._builder_idx >= 0:
                # P4/D-10 (no-purchase mode): builder queues escalate like the
                # settler prefix-sum — earlier slots' queues raise later slots'
                # price (current is pre-decision here, exactly like base_q).
                is_bu = valid_u & (ut == self._builder_idx)
                if bool(is_bu.any()):
                    bcode_q = self.UNIT_BASE + self._builder_idx
                    base_bq = (self.current == bcode_q).sum(dim=1, keepdim=True)
                    prefix_b = is_bu.long().cumsum(dim=1) - is_bu.long()
                    bq_n = self.builders_trained.unsqueeze(1) + base_bq + prefix_b
                    self.cur_cost = torch.where(is_bu, self._builder_cost(bq_n), self.cur_cost)
            self.current = torch.where(valid_b | valid_u, act, self.current)
            if not self._rl_purchase_active:
                # The TS engine queues city-by-city in slot order, and each queued
                # settler raises the next one's price — an exclusive prefix sum
                # reproduces that sequential cost exactly. (Building/unit codes
                # above never write SETTLER, so counting current==SETTLER after
                # them sees exactly the pre-decision queue.)
                base_q = (self.current == self.SETTLER).sum(dim=1, keepdim=True)
                prefix = is_s.long().cumsum(dim=1) - is_s.long()
                n_cities = self.alive.sum(dim=1, keepdim=True)
                s_cost = r.settler_base + r.settler_per_city * (n_cities - 1 + self.settlers.unsqueeze(1) + base_q + prefix).clamp(min=0).to(self.dtype)
                self.progress = torch.where(is_s, torch.zeros_like(self.progress), self.progress)
                self.cur_cost = torch.where(is_s, s_cost, self.cur_cost)
                self.current = torch.where(is_s, torch.full_like(self.current, self.SETTLER), self.current)
                self.settlers_queued = self.settlers_queued + is_s.sum(dim=1)
            else:
                # V-P1: with purchases live, settler prices and the treasury are
                # order-coupled across slots (a queued OR bought settler raises
                # the next slot's price; every purchase drains shared gold), so
                # walk slots sequentially like the replay's act.p loop.
                self._apply_settlers_and_purchases(act, buildable)

            # RL district placement (D5 → P2): the production decision QUEUES a
            # scaffold district — the tile is paved + feature-stripped at once
            # (TS queueDistrict semantics, districtComplete = false) and the
            # build slot works it off at districtCost(state), exactly like the
            # rival path. The district codes double as CURRENT codes (above the
            # unit range at NB+2+NU+si). Cities in slot order, adjacency
            # recomputed each placement, matching the replay's act.p loop.
            if self.districts_on and self._scaffold and self._rl_district_active:
                dbase = self.UNIT_BASE + self.NU  # district action base code (NB+2+NU)
                dcp = self.rules.district_cost
                # P4/D-8: floor(54·(1 + 9·max(tech%, civic%))) — the real curve
                t_pct = self.techs.sum(dim=1).double() / float(rd.t_cost.shape[0])
                c_pct = self.civics.sum(dim=1).double() / float(rd.c_cost.shape[0])
                d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct, c_pct))).to(self.dtype)
                for c in range(C if self._rl_any_city else 1):
                    ac = act[:, c]  # city c's chosen action (-1 where not idle/alive)
                    cap_c = torch.div(self.pop[:, c] - 1, 3, rounding_mode="floor") + 1  # maxSpecialtyDistricts(pop_c)
                    for si, (di, utech, plc) in enumerate(self._scaffold):
                        has_tech = self.techs[:, utech] if utech >= 0 else torch.ones(B, dtype=torch.bool, device=dev)
                        spec_count = ((self.district >= 0) & self._is_specialty[self.district.clamp(min=0)] & (self.owner == c) & ~self.district_dead).sum(dim=1)  # LIVE specialty only (recomputed)
                        not_owned = ~((self.district == di) & (self.owner == c) & ~self.district_dead).any(dim=1)  # one-per-type (LIVE)
                        under_cap = (plc == 1) | (spec_count < cap_c)  # Aqueduct is non-specialty → no cap
                        want = (ac == dbase + si) & has_tech & under_cap & not_owned
                        if bool(want.any()):
                            # P4/D-8: discount read BEFORE the placement registers
                            disc = self._player_district_discounted(di)
                            d_cost_si = torch.where(disc, torch.floor(d_cost * 0.6), d_cost)
                            placed, best = self._place_district(di, want, c, plc)
                            if bool(placed.any()):
                                self.current[:, c] = torch.where(placed, torch.full_like(self.current[:, c], dbase + si), self.current[:, c])
                                self.cur_cost[:, c] = torch.where(placed, d_cost_si, self.cur_cost[:, c])
                                self.progress[:, c] = torch.where(placed, torch.zeros_like(self.progress[:, c]), self.progress[:, c])
                                self.q_dtile[:, c] = torch.where(placed, best, self.q_dtile[:, c])

        # (P2: the scripted district placement moved INTO the production chain
        # above — the capital queues the next scaffold district when idle,
        # paying districtCost like every other build.)

        # --- scripted builder walker (#56 phase-order: AFTER production, the
        # exporter's envoys → production → walker order — see the note at the
        # old call site above). Builders auto-improve; military units hold. ---
        if units is None and self.units_mode:
            self._scripted_builder()

        # --- research choice (validated; -1 or invalid = keep pending) ---------
        if tech is not None:
            t_act = tech.to(torch.long)
            ok = (self.cur_tech == -1) & (t_act >= 0) & self._available_mask(self.techs, self._prereq_t).gather(1, t_act.clamp(min=0).unsqueeze(1)).squeeze(1)
            self.cur_tech = torch.where(ok, t_act, self.cur_tech)
        if civic is not None:
            c_act = civic.to(torch.long)
            ok = (self.cur_civic == -1) & (c_act >= 0) & self._available_mask(self.civics, self._prereq_c).gather(1, c_act.clamp(min=0).unsqueeze(1)).squeeze(1)
            self.cur_civic = torch.where(ok, c_act, self.cur_civic)

        # --- eurekas (mirrors detectBoosts at the start of endTurn) ------------
        if self.boost_mode == "detect":
            self._detect_boosts()
        else:
            for b, sched in enumerate(self.boost_schedule):
                for e in sched:
                    if e["turn"] == self.turn:
                        (self.tech_boosted if e["kind"] == "tech" else self.civic_boosted)[b, e["idx"]] = True

        # --- refreshUnits (P4/D-2, real Civ 6; unifies AUDIT C-7/C-8): heal
        # only units that spent NO MP since their last refresh — +20 in a
        # friendly city (barbs: on their camp), +15 own territory, +10
        # neutral ground, +5 foreign-owned land. Mirrors TS refreshUnits:
        # the heal precedes the reset, so player orders from THIS step and
        # hostile-phase acts from the PREVIOUS step both gate. -------------------
        if self.units_mode:
            cap = self.rules.combat.get("unitHp", 100)
            # barbarians: the camp is home
            ut = self.u_tile.clamp(min=0)
            u_owned = (self.owner.gather(1, ut) >= 0) | (self.rival_at.gather(1, ut) >= 0) | (self.cs_at.gather(1, ut) >= 0)
            u_camp = (self.camp_tile.unsqueeze(2) == ut.unsqueeze(1)).any(dim=1)
            u_heal = torch.where(u_camp, torch.full_like(ut, 20), torch.where(u_owned, torch.full_like(ut, 5), torch.full_like(ut, 10)))
            self.u_hp = torch.where(self.u_alive & ~self.u_acted, (self.u_hp + u_heal).clamp(max=cap), self.u_hp)
            # rival units: own civ's land / own center
            vt = self.v_tile.clamp(min=0)
            v_own = self.rival_at.gather(1, vt) == self.v_civ
            v_center = self.rvcity_at.gather(1, vt) == self.v_civ
            v_owned_any = (self.owner.gather(1, vt) >= 0) | (self.rival_at.gather(1, vt) >= 0) | (self.cs_at.gather(1, vt) >= 0)
            v_heal = torch.where(v_own & v_center, torch.full_like(vt, 20), torch.where(v_own, torch.full_like(vt, 15), torch.where(v_owned_any, torch.full_like(vt, 5), torch.full_like(vt, 10))))
            self.v_hp = torch.where(self.v_alive & ~self.v_acted, (self.v_hp + v_heal).clamp(max=cap), self.v_hp)
            # player units
            pt = self.p_tile.clamp(min=0)
            p_own = self.owner.gather(1, pt) >= 0
            p_center = self.center_at.gather(1, pt) >= 0
            p_owned_any = p_own | (self.rival_at.gather(1, pt) >= 0) | (self.cs_at.gather(1, pt) >= 0)
            p_heal = torch.where(p_own & p_center, torch.full_like(pt, 20), torch.where(p_own, torch.full_like(pt, 15), torch.where(p_owned_any, torch.full_like(pt, 5), torch.full_like(pt, 10))))
            self.p_hp = torch.where(self.p_alive & ~self.p_acted, (self.p_hp + p_heal).clamp(max=cap), self.p_hp)
            # B-5 FORTIFY: co-located with the D-2 heal and keyed on the EXACT
            # SAME gate (~X_acted = spent no MP since the last refresh). A live
            # MILITARY unit that stayed put digs in (+1, cap 2); a move/attack
            # (X_acted) resets it. Civilians never fortify. Symmetric across pools.
            u_mil = self._unit_combat[self.u_type] > 0
            self.u_fortify = torch.where(
                self.u_alive & u_mil & ~self.u_acted, (self.u_fortify + 1).clamp(max=2),
                torch.where(self.u_alive & u_mil & self.u_acted, torch.zeros_like(self.u_fortify), self.u_fortify),
            )
            v_mil = self._p_combat[self.v_type] > 0
            self.v_fortify = torch.where(
                self.v_alive & v_mil & ~self.v_acted, (self.v_fortify + 1).clamp(max=2),
                torch.where(self.v_alive & v_mil & self.v_acted, torch.zeros_like(self.v_fortify), self.v_fortify),
            )
            p_mil = self._p_combat[self.p_type] > 0
            self.p_fortify = torch.where(
                self.p_alive & p_mil & ~self.p_acted, (self.p_fortify + 1).clamp(max=2),
                torch.where(self.p_alive & p_mil & self.p_acted, torch.zeros_like(self.p_fortify), self.p_fortify),
            )
            # the movesLeft reset (TS refreshUnits): a fresh turn begins
            self.p_acted.zero_()
            self.u_acted.zero_()
            self.v_acted.zero_()

        # --- worked tiles + city yields: the PER-CITY interleave (P4) -------------
        # TS endTurn recomputes computeCityStats FRESH for every city inside its
        # loop, so an EARLIER city's mid-turn mutation — a P2 district/building
        # completion shifting a later city's adjacency gold, a growth
        # reshuffling the luxury ranking, a border claim — feeds every LATER
        # city's APPLIED yields the same turn. Mirror with an invalidation-gated
        # recompute: totals refresh only when _eff_version moved or a pop
        # changed since the last compute (completions/claims bump the version;
        # growth rides the pop snapshot). Caught by the F1 reshuffle (seed 9261
        # t192): city 332's completing district raised city 203's adjacency
        # gold and TS applied +1 gold × 0.95 amenity while the GPU applied the
        # top-of-turn value.
        total, housing, growth_f, tier_idx = self._city_totals()
        lux0 = self._last_lux  # frozen for the whole walk (TS luxMap semantics)
        _tot_ver = self._eff_version
        # D-10: pop changes ride a dirty FLAG set at the walk's only pop
        # writes (settler completion, growth, starvation) — replaces the
        # per-rank torch.equal + pop.clone() snapshot compare. A clamp-at-1
        # write that leaves pop unchanged forces a spurious recompute of
        # identical values (bit-exact, rare).
        _pop_dirty = False
        y_sum = self._eff_yields().sum(dim=2) * ((self.district < 0) & (self.built_wonder < 0)).to(self.dtype)  # P5/S5+A-4: paved/wondered tiles yield 0 (tileYields, yields.ts:37)
        # loyalty mirrors TS's loop-top view: city c's tier and pop are
        # captured FRESH at its own iteration (post earlier cities' same-turn
        # mutations, pre its own production/growth) — applyLoyalty runs at the
        # top of TS's per-city block; the flips still resolve after the loop.
        tier_fresh = tier_idx.clone()
        pop_loyal = self.pop.clone()
        gold_add = torch.zeros(B, dtype=self.dtype, device=dev)
        sci_add = torch.zeros(B, dtype=self.dtype, device=dev)
        cul_add = torch.zeros(B, dtype=self.dtype, device=dev)
        neigh_flat = self.neigh.clamp(min=0).reshape(1, -1).expand(B, -1)
        neigh_valid = (self.neigh >= 0).view(1, T, 6)
        # P7-FULL (C-2): TS iterates state.cities in ARRAY order (splice on
        # death, push on found/capture = acquisition order); after a
        # hole-reuse founding the column order stops matching, and every
        # cross-city coupling in this walk — a completion's _eff_version
        # bump feeding a later city's totals, a border claim consuming a
        # shared candidate tile, spawn-spot contention, the accumulators'
        # float association — resolves in the wrong order. Walk the columns
        # by city_seq rank (per-batch gathers); dead/unfounded columns sort
        # last and stay the same masked no-ops they were in column order.
        # Cities can't be founded or die inside the walk, so the order is
        # fixed at the top.
        walk_ord = torch.argsort(torch.where(self.alive, self.city_seq, self.city_seq + 10**6), dim=1, stable=True)
        bidx = self._bidx  # D-7
        for s_rank in range(C):
            col = walk_ord[:, s_rank]  # [B] — each game's s_rank-th city by acquisition
            if self._eff_version != _tot_ver or _pop_dirty:
                total, housing, growth_f, tier_idx = self._city_totals(lux=lux0)
                _tot_ver = self._eff_version
                _pop_dirty = False
                # Task-#39 forced-gate catch (rng 2026006084 t193): tileYields
                # carries FARM-ADJACENCY food (yields.ts:60-63) — the border
                # ySum missed it because frontier tiles never hold farm
                # clusters... until a raze frees EX-RIVAL farmland. Add the
                # player-tier plane, exactly like the walk's scoring does.
                y_sum = (self._eff_yields().sum(dim=2) + self._farmadj_food()) * ((self.district < 0) & (self.built_wonder < 0)).to(self.dtype)  # P5/S5+A-4: paved/wondered tiles yield 0 (tileYields, yields.ts:37)
            tier_fresh[bidx, col] = tier_idx[bidx, col]
            pop_loyal[bidx, col] = self.pop[bidx, col]
            t_c = total[bidx, col]  # [B, 6] this city's FRESH yields
            popf_c = self.pop[bidx, col].to(self.dtype)
            pop_c0 = self.pop[bidx, col].clone()  # loop-top pop: TS stats.growthNeeded is frozen here (P4/D-6: a settler completion can shrink pop mid-block)

            # --- production (this city's column) -----------------------------------
            cur_c = self.current[bidx, col]
            has_item = cur_c >= 0
            # V-H1: banked chop production pays into the head the moment a build
            # exists (game.ts consumes productionBank inside the production add).
            self.progress[bidx, col] = torch.where(has_item, self.progress[bidx, col] + t_c[:, 1] + self.prod_bank[bidx, col], self.progress[bidx, col])
            self.prod_bank[bidx, col] = torch.where(has_item, torch.zeros_like(self.prod_bank[bidx, col]), self.prod_bank[bidx, col])
            done = has_item & (self.progress[bidx, col] >= self.cur_cost[bidx, col])
            made_settler = done & (cur_c == self.SETTLER)
            self.settlers = self.settlers + made_settler.long()
            # P4/D-6: a completed Settler costs the city 1 pop (real Civ 6);
            # the pop-snapshot guard refreshes later cities' totals.
            self.pop[bidx, col] = torch.where(made_settler, (self.pop[bidx, col] - 1).clamp(min=1), self.pop[bidx, col])
            made_building = done & (cur_c < self.NB)
            if bool(made_building.any()):
                bi = made_building.nonzero(as_tuple=True)[0]
                self.buildings[bi, col[bi], cur_c[bi]] = True
                # AUDIT B-1: completing ANCIENT_WALLS fills the outer pool.
                if self._walls_bidx >= 0:
                    wm = bi[cur_c[bi] == self._walls_bidx]
                    if len(wm) > 0:
                        self.outer_hp[wm, col[wm]] = self._walls_hp
                self._eff_version += 1  # its yields join LATER cities' totals this turn (TS: fresh stats)
            made_unit = done & (cur_c >= self.UNIT_BASE) & (cur_c < self.UNIT_BASE + self.NU)
            if bool(made_unit.any()):
                # clamp max too: unmasked rows may hold P2 district codes
                self._spawn_player(made_unit, self.site[bidx, col], (cur_c - self.UNIT_BASE).clamp(min=0, max=self.NU - 1))
                if self._builder_idx >= 0:
                    # P4/D-10: a completed builder moves the cost escalator
                    made_b = made_unit & (cur_c == self.UNIT_BASE + self._builder_idx)
                    self.builders_trained = self.builders_trained + made_b.long()
            # P2: a finished district completes its paved tile (queueDistrict's
            # queue item — the tile was reserved at queue time in q_dtile).
            made_district = done & (cur_c >= self.UNIT_BASE + self.NU)
            if bool(made_district.any()):
                db_ = made_district.nonzero(as_tuple=True)[0]
                self.district_complete[db_, self.q_dtile[db_, col[db_]].clamp(min=0)] = True
                self.q_dtile[db_, col[db_]] = -1
                self._eff_version += 1
            self.current[bidx, col] = torch.where(done, torch.full_like(cur_c, -1), cur_c)
            self.progress[bidx, col] = torch.where(done, torch.zeros_like(self.progress[bidx, col]), self.progress[bidx, col])  # overflow drops (queue empty)

            # --- growth (the pop snapshot re-triggers totals for later cities) ---
            surplus = t_c[:, 0] - popf_c * r.food_per_citizen
            head = housing[bidx, col] - popf_c
            hf = torch.where(head >= 2, 1.0, torch.where(head >= 1, 0.5, 0.25).to(self.dtype)).to(self.dtype)
            effective = torch.where(surplus > 0, surplus * hf * growth_f[bidx, col], surplus)
            self.food_box[bidx, col] = self.food_box[bidx, col] + effective
            need = self._growth_needed(pop_c0)  # TS stats.growthNeeded: loop-top pop (P4/D-6)
            alive_c = self.alive[bidx, col]
            grow = alive_c & (self.food_box[bidx, col] >= need)
            self.pop[bidx, col] = self.pop[bidx, col] + grow.long()
            fb = self.food_box[bidx, col]
            self.food_box[bidx, col] = torch.where(grow, fb - need, fb)
            starve = alive_c & ~grow & (self.food_box[bidx, col] < 0)
            self.pop[bidx, col] = torch.where(starve, (self.pop[bidx, col] - 1).clamp(min=1), self.pop[bidx, col])
            fb2 = self.food_box[bidx, col]
            self.food_box[bidx, col] = torch.where(starve, torch.zeros_like(fb2), fb2)
            # D-10: all three pop-write masks of this rank in one host check
            if bool((made_settler | grow | starve).any()):
                _pop_dirty = True

            # --- borders (later cities see earlier claims, as before) --------
            # TS pickBorderTile reads the LIVE map: refresh the yield ranking
            # if THIS city's own completion/growth just changed it (the box
            # add itself stays the loop-top stats value, like TS).
            if self._eff_version != _tot_ver or _pop_dirty:
                total, housing, growth_f, tier_idx = self._city_totals(lux=lux0)
                _tot_ver = self._eff_version
                _pop_dirty = False
                # Task-#39 forced-gate catch (rng 2026006084 t193): tileYields
                # carries FARM-ADJACENCY food (yields.ts:60-63) — the border
                # ySum missed it because frontier tiles never hold farm
                # clusters... until a raze frees EX-RIVAL farmland. Add the
                # player-tier plane, exactly like the walk's scoring does.
                y_sum = (self._eff_yields().sum(dim=2) + self._farmadj_food()) * ((self.district < 0) & (self.built_wonder < 0)).to(self.dtype)  # P5/S5+A-4: paved/wondered tiles yield 0 (tileYields, yields.ts:37)
            self.culture_box[bidx, col] = self.culture_box[bidx, col] + t_c[:, 4]
            dist_c = self.dist[bidx, col]  # [B, T] — static per city, hoisted out of the claim loop
            adj_own = None  # D-13: dense on the first ready iteration, then incremental
            for _ in range(BORDER_LOOPS):
                cost_b = self._border_cost(self.tiles_acquired[bidx, col])
                ready = self.alive[bidx, col] & (self.culture_box[bidx, col] >= cost_b)
                if not ready.any():
                    break
                if adj_own is None:
                    owner_nb = self.owner.gather(1, neigh_flat).reshape(B, T, 6)
                    adj_own = ((owner_nb == col.view(B, 1, 1)) & neigh_valid).any(dim=2)
                cand_b = (self.owner == -1) & (self.cs_at < 0) & (self.rival_at < 0) & (dist_c <= 5) & adj_own
                # order: dist asc, resource priority desc, yield sum desc, index asc
                # C-6: priority reads LIVE (a paved bonus resource is GONE in
                # TS — an orphaned pave is unowned and claimable)
                key = (
                    dist_c.to(self.dtype) * 1e12
                    - (self.res_priority * (~self.res_stripped).long()).to(self.dtype) * 1e9
                    - torch.round(y_sum * 1000) * 1e4
                    + self._arangeT.to(self.dtype)
                )
                key = torch.where(cand_b, key, self._inf_f)  # D-7
                best = key.argmin(dim=1)
                has_cand = cand_b.any(dim=1)
                expand = ready & has_cand
                if expand.any():
                    rows = expand.nonzero(as_tuple=True)[0]
                    self.owner[rows, best[rows]] = col[rows]
                    # D-13: each claim flips ONE tile (-1 → col, per the
                    # cand_b owner==-1 gate), so adjacency-to-col only GROWS,
                    # and only at the claimed tile's ≤6 on-map neighbours —
                    # the same booleans the dense re-derive would produce.
                    nb_b = self.neigh[best[rows]]  # [n, 6]
                    ok_b = nb_b >= 0
                    rr_b = rows.unsqueeze(1).expand_as(nb_b)
                    adj_own[rr_b[ok_b], nb_b[ok_b]] = True
                    cb = self.culture_box[bidx, col]
                    self.culture_box[bidx, col] = torch.where(expand, cb - cost_b, cb)
                    self.tiles_acquired[bidx, col] = self.tiles_acquired[bidx, col] + expand.long()
                    self._eff_version += 1  # a claim widens LATER cities' worked candidates (TS: fresh stats)
                capped = ready & ~has_cand
                cb2 = self.culture_box[bidx, col]
                self.culture_box[bidx, col] = torch.where(capped, torch.minimum(cb2, cost_b), cb2)
                if not expand.any():
                    break

            # --- empire accumulators (FRESH values — TS game.ts:724-729; the
            # seq-order walk makes each game's float association TS-exact) -----
            gold_add = gold_add + t_c[:, 2]
            sci_add = sci_add + t_c[:, 3]
            cul_add = cul_add + t_c[:, 4]

        self.treasury = self.treasury + gold_add
        self.science_total = self.science_total + sci_add
        self.culture_total = self.culture_total + cul_add

        # --- loyalty & defections (inside/right after the TS city loop) --------------------
        self._apply_loyalty_and_flips(tier_fresh, pop_loyal)
        # P5/S5 gate-catch (seed 9183 t164, +75 milli esc): every POST-WALK
        # consumer (trace_row/empire_score/statelog) must see FRESH stats —
        # TS computeCityStats re-ranks luxuryAmenities LIVE at trace time,
        # so a mid-walk pop change (a settler completing) can move a luxury
        # grant and flip two cities' amenity tiers vs the walk's FROZEN map.
        # The walk's accumulators keep the frozen-map yields (TS does too);
        # only the cached totals must not leak past the walk.
        self._eff_version += 1

        # --- the hostile world (after the city loop, before research) ----------------------
        if self.units_mode:
            self.treasury = self.treasury - (self.p_alive.to(self.dtype) * self._p_maint[self.p_type]).sum(dim=1)
            self._bankrupt_disband()  # GV-5 (after upkeep, before the barb phase — matches TS)
            self._barbarian_phase()
        if self.disasters:
            self._disaster_phase()
        self._city_state_phase()
        self._rival_phase()

        # --- research ---------------------------------------------------------------------
        # P4-interleave: the research streams use the same per-city FRESH sums
        # TS accumulates in its city loop (turnScience/turnCulture, game.ts:728).
        turn_science = sci_add
        turn_culture = cul_add
        if tech is None:
            self.cur_tech = self._auto_pick(self.cur_tech, self.techs, self.tech_boosted, rd.t_cost, self._prereq_t)
        self.tech_prog = self.tech_prog + turn_science
        for _ in range(RESEARCH_LOOPS):
            active = self.cur_tech >= 0
            eff = self._eff_cost(
                rd.t_cost.gather(0, self.cur_tech.clamp(min=0)),
                self.tech_boosted.gather(1, self.cur_tech.clamp(min=0).unsqueeze(1)).squeeze(1),
            )
            fin = active & (self.tech_prog >= eff)
            if not fin.any():
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.techs[rows, self.cur_tech[rows]] = True
            # D-batch: ANY tech completion bumps — unlocks feed _buildable and
            # the mine-boost/Replaceable-Parts techs feed the yield/score
            # caches (subsumes the old conditional bumps; over-invalidation
            # only costs a recompute of identical values).
            self._eff_version += 1
            self.tech_prog = torch.where(fin, self.tech_prog - eff, self.tech_prog)
            self.cur_tech = torch.where(fin, torch.full_like(self.cur_tech, -1), self.cur_tech)
            if tech is None:
                self.cur_tech = self._auto_pick(self.cur_tech, self.techs, self.tech_boosted, rd.t_cost, self._prereq_t)
        # Banked progress only drains once the tree is exhausted (mirrors
        # advanceResearch; in manual mode progress banks while undecided).
        no_tech = (self.cur_tech == -1) & ~self._available_mask(self.techs, self._prereq_t).any(dim=1)
        self.tech_prog = torch.where(no_tech, torch.minimum(self.tech_prog, torch.zeros_like(self.tech_prog)), self.tech_prog)

        if civic is None:
            self.cur_civic = self._auto_pick(self.cur_civic, self.civics, self.civic_boosted, rd.c_cost, self._prereq_c)
        self.civic_prog = self.civic_prog + turn_culture
        for _ in range(RESEARCH_LOOPS):
            active = self.cur_civic >= 0
            eff = self._eff_cost(
                rd.c_cost.gather(0, self.cur_civic.clamp(min=0)),
                self.civic_boosted.gather(1, self.cur_civic.clamp(min=0).unsqueeze(1)).squeeze(1),
            )
            fin = active & (self.civic_prog >= eff)
            if not fin.any():
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.civics[rows, self.cur_civic[rows]] = True
            # D-batch: ANY civic completion bumps (Feudalism farm-adjacency +
            # civic-gated buildings in _buildable) — subsumes the conditional.
            self._eff_version += 1
            self.civic_prog = torch.where(fin, self.civic_prog - eff, self.civic_prog)
            self.cur_civic = torch.where(fin, torch.full_like(self.cur_civic, -1), self.cur_civic)
            if civic is None:
                self.cur_civic = self._auto_pick(self.cur_civic, self.civics, self.civic_boosted, rd.c_cost, self._prereq_c)
        no_civic = (self.cur_civic == -1) & ~self._available_mask(self.civics, self._prereq_c).any(dim=1)
        self.civic_prog = torch.where(no_civic, torch.minimum(self.civic_prog, torch.zeros_like(self.civic_prog)), self.civic_prog)

        # Player great people (advanceGreatPeople) — after research, mirroring
        # endTurn's order (rivalPhase claimed earlier this step). Science/culture
        # bank toward the next turn's tech/civic; gold/production apply now.
        self._advance_player_great_people()

        # --- founding (mirrors the plannedSettles loop at the end of endTurn) ------
        # Consume the planned-site list in order while settlers remain; a
        # site failing canFoundCity is DROPPED without spending the settler.
        # Slots bind at founding: append at founded_n while columns remain,
        # then reuse the first dead column (the trace's cityIds follow the
        # same rule, so reused columns stay aligned).
        for _ in range(self.KS):
            can = (self.settlers > 0) & (self.next_site_ptr < self.KS)
            if not bool(can.any()):
                break
            ptr = self.next_site_ptr.clamp(max=self.KS - 1)
            cand_site = self.site_tile.gather(1, ptr.unsqueeze(1)).squeeze(1)
            sc = cand_site.clamp(min=0)
            # canFoundCity's dynamic parts (static parts were valid at export):
            # free of city-state/rival territory, ≥ CITY_MIN_DIST from every
            # live player city and rival city, no district (a rival center).
            free = (self.cs_at.gather(1, sc.unsqueeze(1)).squeeze(1) < 0) & (
                self.rival_at.gather(1, sc.unsqueeze(1)).squeeze(1) < 0
            )
            dcity = torch.where(self.alive, self.pair_dist[sc.unsqueeze(1), self.site.clamp(min=0)].to(torch.long), 999)
            rc_flat = self.rc_center.reshape(B, -1).clamp(min=0)
            drc = torch.where(self.rc_alive.reshape(B, -1), self.pair_dist[sc.unsqueeze(1), rc_flat].to(torch.long), 999)
            # P5/S2: the 6-cap moved from `can` into `ok` — TS canFoundCity
            # now refuses at 6 cities, so the site DROPS (consumed) while
            # the settler stays banked, on both sides identically. The slot
            # is founded_n (append; captures bump it too) with a first-free
            # hole fallback for the post-flip below-cap case.
            cap_ok = self.alive.sum(dim=1) < 6
            hole = first_argmax((~self.alive).long())
            slot_new = torch.where(self.founded_n < C, self.founded_n, hole)
            ok = free & (dcity.min(dim=1).values >= 4) & (drc.min(dim=1).values >= 4) & cap_ok  # P4/D-5: CITY_MIN_DIST = 4
            valid = can & ok
            self.next_site_ptr = self.next_site_ptr + can.long()  # consumed either way
            if not bool(valid.any()):
                continue
            rows = valid.nonzero(as_tuple=True)[0]
            c_new = slot_new[rows]
            new_cap = self.alive[rows].sum(dim=1) == 0  # P7: a total-collapse refound IS the new capital (TS isCapital + capitalTiles[0] update)
            s_idx = cand_site[rows]
            p_idx = ptr[rows]
            self.site[rows, c_new] = s_idx
            self.center_yields[rows, c_new] = self.site_cy[rows, p_idx]
            self.center_raw_food[rows, c_new] = self.site_raw_food[rows, p_idx]
            self.base_maintenance[rows, c_new] = self.site_maint[rows, p_idx]
            self.water_housing[rows, c_new] = self.site_water[rows, p_idx]
            self.coastal[rows, c_new] = self.site_coastal[rows, p_idx]
            self.river_center[rows, c_new] = self.site_river[rows, p_idx]
            self.dist[rows, c_new] = self.pair_dist[s_idx]
            self.alive[rows, c_new] = True
            self.pop[rows, c_new] = 1
            self.food_box[rows, c_new] = 0
            self.culture_box[rows, c_new] = 0
            self.tiles_acquired[rows, c_new] = 0
            self.current[rows, c_new] = -1
            self.progress[rows, c_new] = 0
            self.loyalty[rows, c_new] = 100.0
            self.city_hp[rows, c_new] = self.rules.combat.get("cityMaxHp", 200)
            self.warrior_trained[rows, c_new] = False
            # Task-#39 forced-gate catch (rng 2026006080 t220): the P5/S2 slot
            # hygiene was INCOMPLETE here — a hole-fallback founding into a
            # column whose dead city had buildings inherited them (3 phantom
            # buildings' yields + maintenance; TS founds with buildings: []).
            # Mirror the CS-capture hygiene block: buildings/cur_cost/q_dtile.
            self.buildings[rows, c_new] = False
            self.outer_hp[rows, c_new] = 0  # AUDIT B-1: fresh/reused column has no walls
            self.cur_cost[rows, c_new] = 0.0
            self.q_dtile[rows, c_new] = -1
            self.settlers[rows] -= 1
            # founded_n bumps only for append slots — a hole-fallback founding
            # reuses a dead column (trace ids reuse it too: TS cityIds keep
            # dead columns only for cities that DIED; a reused id is new).
            self.founded_n[rows] += (c_new == self.founded_n[rows]).long()
            self.city_seq[rows, c_new] = self.city_seq_next[rows]
            self.city_seq_next[rows] += 1
            self.is_cap[rows, c_new] = new_cap
            self.cap_tile_player[rows] = torch.where(new_cap, s_idx, self.cap_tile_player[rows])
            # Claim the center (unconditionally, as foundCity does) plus any
            # unowned first-ring tiles; the center becomes a district tile.
            self.owner[rows, s_idx] = c_new
            self.workable[rows, s_idx] = False
            self.center_at[rows, s_idx] = c_new
            # foundCity strips the removable feature — exactly the woods/
            # rainforest/marsh that carry +3 defense — so the center tile's
            # terrain defense drops to its hills component. (Rival founding
            # strips too since P5/S3 — its own twin in _rival_try_found;
            # city-state founding still does NOT strip.) A-13 gate catch:
            # an UNREMOVABLE feature (oasis/floodplains) survives the
            # founding LIVE (game.ts:209 gates on removable) — belief
            # featureYields keep applying to that center, so both writes
            # gate on feat_removable.
            frm_f = self.feat_removable[rows, s_idx]
            self.tdef[rows, s_idx] = torch.where(frm_f, self.hills[rows, s_idx].long() * 3, self.tdef[rows, s_idx])
            # #47r hunt catch (rng 2026006135 t93): the B-28 tmove mirror was
            # applied to the chop and rival-founding strips but MISSED here —
            # a player-founding strip left tmove stale, and when the city
            # later died the freed tile charged 2 MP on the GPU vs TS's live
            # 1 MP, desyncing a barb walk (697 vs 698).
            self.tmove[rows, s_idx] = torch.where(frm_f, self.hills[rows, s_idx].long() * 3, self.tmove[rows, s_idx])
            # ...and the feature's own yields + any improvement die with the
            # founding (tile.improvement = null; feature = null) — a later
            # loyalty flip reads this center STRIPPED (C1-B3 gate catch).
            # idempotence (P2 twin-sync): a previously CHOPPED tile has nothing
            # left to withdraw — TS feature=null is a no-op there, but the
            # subtraction below is cumulative (same bug class as the
            # _strip_feature_at double-strip caught at seed 9040 t132).
            # P5/S5: tile.pillaged is NOT cleared — foundCity never touches
            # it (a pillaged improvement's flag outlives the improvement).
            fresh_f = ~self.feat_stripped[rows, s_idx] & frm_f
            self.feat_stripped[rows, s_idx] |= frm_f
            self.improvement[rows, s_idx] = -1
            self._eff_version += 1
            # ...and drops the district adjacency that feature lent to neighbours:
            # d_static_adj was baked post-capital-founding, so a NON-capital
            # founding must subtract the center feature's contribution live (else
            # a fresh city's own district over-counts). Mirrors districtAdjacency
            # recomputing on the live map after foundCity clears the feature.
            contrib = self._feat_adj[rows, s_idx] * fresh_f.unsqueeze(1).to(self._feat_adj.dtype)  # [R, nD]
            nb = self.neigh[s_idx]  # [R, 6]
            for d in range(6):
                n_d = nb[:, d]
                ndc = n_d.clamp(min=0)
                on_map = n_d >= 0
                if bool(on_map.any()):
                    om = on_map.nonzero(as_tuple=True)[0]
                    self.d_static_adj[rows[om], n_d[om], :] -= contrib[om]
                free_nb = (
                    on_map
                    & (self.owner[rows, ndc] == -1)
                    & (self.cs_at[rows, ndc] < 0)
                    & (self.rival_at[rows, ndc] < 0)
                )
                self.owner[rows[free_nb], n_d[free_nb]] = c_new[free_nb]
            self._eff_version += 1  # d_static_adj changed

        # --- P7 (C-3): dead-slot reclamation — at the step END, never the
        # top: callers sample slot-keyed unit actions from the PRE-step
        # masks, so the layout must hold from unit_action_mask() through
        # this step's applies (compacting at the top re-pointed in-flight
        # orders at the wrong units — the forced-compaction gate caught
        # it). Stable compaction is otherwise behavior-invariant (TS
        # arrays splice; living relative order is the spec); fires when a
        # pool's high-water nears its cap (or constantly under
        # CIV6_RECLAIM_AT).
        if self.units_mode:
            if int(self.next_slot.max()) >= self._reclaim_at:
                self._reclaim_pool("u")
            if int(self.v_next.max()) >= self._reclaim_at:
                self._reclaim_pool("v")
            if int(self.p_next.max()) >= self._reclaim_at:
                self._reclaim_pool("p")
        if self.R > 0:
            # rc high-water = last-alive slot + 1 (what the next append uses)
            rc_hw = (self.rc_alive.long() * (torch.arange(self.RC, device=dev).view(1, 1, -1) + 1)).amax(dim=2)
            if int(rc_hw.max()) >= self._rc_reclaim_at:
                self._reclaim_rc()

        # B-18: religious pressure spread — after all foundings/settles/flips and
        # the rc compaction, mirroring TS endTurn's tail (spreadReligiousPressure
        # after the plannedSettles loop). INERT: not read by yields/trace yet.
        self._spread_religious_pressure()

        self.turn += 1
        dom = self._domination()  # GV-3
        # B-25 (Round B3): a science victory (3, player) / defeat (4, a rival)
        # set during THIS turn's project completions takes precedence over the
        # domination/score recompute and is preserved — the TS endTurn mirror
        # (game.ts: spaceWon = victoryType∈{3,4} → keep it). In-gate space_won
        # is always False (chain gate-unreachable), so this is byte-identical to
        # the prior recompute.
        space_won = (self.victory_type == 3) | (self.victory_type == 4)  # B-25
        self.game_over = space_won | (dom >= 0) | (self.turn > self.rules.turn_limit)  # GV-2/GV-3 + B-25
        self.victory_type = torch.where(space_won, self.victory_type, torch.where(dom >= 0, torch.full_like(dom, 2), torch.where(self.game_over, torch.ones_like(dom), torch.zeros_like(dom))))  # GV-4/GV-3 + B-25
        # D-1: leader() (a full empire+rival score pass) only matters where a
        # game just ENDED — torch.where evaluated it eagerly every turn and
        # threw it away. Winner stays -1 for running games either way.
        lead = self.leader() if bool(self.game_over.any()) else torch.full_like(dom, -1)
        self.winner = torch.where(dom >= 0, dom, torch.where(self.game_over, lead, torch.full_like(dom, -1)))  # GV-3

    # --- parity trace row (matches scripts/gpu-trace.ts encoding) ----------------

    def trace_row(self) -> torch.Tensor:
        # perf: each civ's empire score is needed by BOTH leader() (GV-1) and
        # its own trace column — compute once and reuse (was a 2-3x recompute
        # of rival_empire_score/_rival_city_yields per turn, the trace hotspot).
        e_score = self.empire_score()
        r_scores = [self.rival_empire_score(r) for r in range(self.R)]
        leader_id = first_argmax(torch.stack([e_score] + r_scores, dim=1))  # ties -> lowest id (TS strict >)
        cols = [
            torch.full((self.B,), float(self.turn), dtype=self.dtype, device=self.device),
            self.techs.sum(dim=1).to(self.dtype),
            self.civics.sum(dim=1).to(self.dtype),
            self.settlers.to(self.dtype),
            self.alive.sum(dim=1).to(self.dtype),
            js_round(self.treasury * 1000),
            js_round(self.science_total * 1000),
            js_round(self.culture_total * 1000),
            js_round(e_score * 1000),
            self.rng_state.to(self.dtype),
            self.n_camps.to(self.dtype),
            self.u_alive.sum(dim=1).to(self.dtype),
            self.p_alive.sum(dim=1).to(self.dtype),
            self.envoys_avail.to(self.dtype),
            self.influence,
            self.fertility.sum(dim=1).to(self.dtype),
            (self.drought > 0).sum(dim=1).to(self.dtype),
            (self.improvement >= 0).sum(dim=1).to(self.dtype),
            leader_id.to(self.dtype),  # GV-1
            self.game_over.to(self.dtype),  # GV-2
            self.winner.to(self.dtype),  # GV-2/GV-3 winner
            self.victory_type.to(self.dtype),  # GV-4/GV-3 victoryType
        ]
        for s in range(self.S):
            cs_live = self.cs_alive[:, s].to(self.dtype)  # V-CS: a captured CS traces as zeros (TS: removed from the list)
            cols += [
                self.cs_envoys[:, s].to(self.dtype) * cs_live,
                self.cs_pop[:, s].to(self.dtype) * cs_live,
                self.cs_quest[:, s].to(self.dtype) * cs_live,
            ]
        for r in range(self.R):
            live = self.r_alive[:, r]
            zero = torch.zeros(self.B, dtype=self.dtype, device=self.device)
            cols += [
                torch.where(live, self.rc_alive[:, r].sum(dim=1).to(self.dtype), zero),
                torch.where(live, (self.rc_pop[:, r] * self.rc_alive[:, r].long()).sum(dim=1).to(self.dtype), zero),
                (self.v_alive & (self.v_civ == r)).sum(dim=1).to(self.dtype),
                torch.where(live & self.r_atwar[:, r], torch.ones_like(zero), zero),
                torch.where(live, self.r_techs[:, r].sum(dim=1).to(self.dtype), zero),
                torch.where(live, self.r_civics[:, r].sum(dim=1).to(self.dtype), zero),
                torch.where(live, js_round(self.r_tech_prog[:, r] * 1000).to(self.dtype), zero),
                torch.where(live, js_round(self.r_civic_prog[:, r] * 1000).to(self.dtype), zero),
                torch.where(live, js_round((self.rc_progress[:, r] * self.rc_alive[:, r].double()).sum(dim=1) * 1000).to(self.dtype), zero),
                torch.where(live, js_round((self.rc_cost[:, r] * self.rc_alive[:, r].double()).sum(dim=1) * 1000).to(self.dtype), zero),
                torch.where(
                    live,
                    (
                        (self.rc_dist_tile[:, r] >= 0)
                        & self.district_complete.gather(1, self.rc_dist_tile[:, r].clamp(min=0).reshape(self.B, -1)).reshape(self.B, self.RC, -1)
                    ).sum(dim=(1, 2)).to(self.dtype),
                    zero,
                ),
                torch.where(live, self.rc_bldg[:, r].sum(dim=(1, 2)).to(self.dtype), zero),
                torch.where(live, js_round(self.r_treasury[:, r] * 1000).to(self.dtype), zero),  # VP-G1
                torch.where(live, js_round(r_scores[r] * 1000).to(self.dtype), zero),  # GV-1
            ]
        zero = torch.zeros(self.B, dtype=self.dtype, device=self.device)
        for c in range(self.C):
            live = self.alive[:, c]
            cols += [
                torch.where(live, self.pop[:, c].to(self.dtype), zero),
                (self.owner == c).sum(dim=1).to(self.dtype),
                torch.where(live, self.buildings[:, c].sum(dim=1).to(self.dtype) + (1 if c == 0 else 0), zero),  # +PALACE
                torch.where(live, self.tiles_acquired[:, c].to(self.dtype), zero),
                torch.where(live, js_round(self.food_box[:, c] * 1000), zero),
                torch.where(live, js_round(self.culture_box[:, c] * 1000), zero),
                torch.where(live, self.city_hp[:, c].to(self.dtype), zero),
                torch.where(live, js_round(self.loyalty[:, c] * 1000), zero),
                torch.where(live, self.city_followed[:, c].to(self.dtype), zero),  # B-18: followed religion id (-1 none, dead slot 0)
            ]
        return torch.stack(cols, dim=1)
