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
    amenity_tiers: list  # [(min, growth, yield)]
    center_min_food: float
    settler_base: float
    settler_per_city: float
    settler_pop_gate: int
    score_pop_weight: float
    score_yield_weights: torch.Tensor  # [6]
    boosts: list  # [{target, idx, kind, ...}] — covered-scope eureka conditions
    combat: dict  # barbarian constants + the JS-computed damage-base table
    units: list  # trainable roster [{id, cost, combat, maintenance, civilian, requiresTech}]
    cs: dict  # city-state constants (envoy cost, influence rate, quest pacing, type→yield)
    rivals: dict  # rival-civ pacing, loyalty, GP costs, belief-pool sizes
    improvements: dict  # phase 6a: FARM food/housing, builder roster idx, hillFarms civic
    districts: list  # D1: catalog [{id, idx, cost, adjYield, adjacency, housing, ...}] — inert until placed
    district_scaffold: dict  # D2b: {campusIdx, campusUnlockTech}
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
    t_cost: torch.Tensor  # [NT]
    t_prereqs: list  # list of lists
    c_cost: torch.Tensor
    c_prereqs: list


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
        amenity_tiers=[(t["min"], t["growth"], t["yield"]) for t in r["amenityTiers"]],
        center_min_food=r.get("centerMinFood", 2),
        settler_base=r["scenario"]["settlerBase"],
        settler_per_city=r["scenario"]["settlerPerCity"],
        settler_pop_gate=r["scenario"]["settlerPopGate"],
        score_pop_weight=r["score"]["popWeight"],
        score_yield_weights=torch.tensor(r["score"]["yieldWeights"], dtype=torch.float64),
        boosts=r.get("boosts", []),
        combat=r.get("combat", {}),
        units=r.get("units", []),
        cs=r.get("cs", {}),
        rivals=r.get("rivals", {}),
        improvements=r.get("improvements", {}),
        districts=r.get("districts", []),
        district_scaffold=r.get("districtScaffold", {}),
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
        t_cost=torch.tensor([t["cost"] for t in r["techs"]], dtype=torch.float64),
        t_prereqs=[t["prereqs"] for t in r["techs"]],
        c_cost=torch.tensor([c["cost"] for c in r["civics"]], dtype=torch.float64),
        c_prereqs=[c["prereqs"] for c in r["civics"]],
    )


def load_fixture(path: Path) -> dict:
    return json.loads(Path(path).read_text())


# ---------------------------------------------------------------------------
# The batched simulation
# ---------------------------------------------------------------------------

BORDER_LOOPS = 4  # TS expands in a while-loop; 4 covers any realistic culture
RESEARCH_LOOPS = 4
U_MAX = 96  # barbarian unit slots per game (append-only; runtime-asserted)
P_MAX = 96  # player unit slots per game (append-only; runtime-asserted)
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
    "buildings", "current", "cur_cost", "progress", "settlers", "settlers_queued",
    "treasury", "science_total", "culture_total", "techs", "civics",
    "tech_boosted", "civic_boosted", "cur_tech", "cur_civic", "tech_prog", "civic_prog",
    "rng_state", "city_hp", "center_at", "barb_at", "pmil_at", "pciv_at", "tdef",
    "u_alive", "u_type", "u_tile", "u_hp", "next_slot", "camp_tile", "n_camps",
    "p_alive", "p_type", "p_tile", "p_hp", "p_next", "warrior_trained", "builder_trained",
    "site", "center_yields", "center_raw_food", "base_maintenance", "water_housing", "coastal", "river_center", "dist",
    "next_site_ptr", "founded_n", "loyalty",
    "cs_met", "cs_envoys", "cs_pop", "cs_quest", "cs_quest_camp", "cs_quest_issued", "cs_quest_district",
    "influence", "envoys_avail",
    "rival_at", "rvcity_at", "rv_at",
    "r_atwar", "r_warturns", "r_peaceturns", "r_tech", "r_prodstock", "r_milstock",
    "r_pantheon_done", "r_religion_done", "r_next_city_id", "r_gpp",
    "rc_alive", "rc_center", "rc_pop", "rc_growth", "rc_acquired", "rc_hp", "rc_id",
    "v_alive", "v_civ", "v_type", "v_tile", "v_hp", "v_next",
    "gp_earned", "pantheon_claimed_n", "claimed_f_n", "claimed_o_n",
    "fertility", "drought", "improvement", "pillaged", "p_charges", "district", "campus_placed",
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
        self.passable = torch.tensor([[t["pass"] for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
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
        self.site[:, 0] = self.site_tile[:, 0]
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
        self.influence = torch.zeros(B, dtype=dtype, device=device)
        self.envoys_avail = torch.zeros(B, dtype=torch.long, device=device)
        cs_yidx = rules.cs.get("typeYieldIdx", [3, 4, 2, 1, 1, 5])
        self._cs_yidx = torch.tensor(cs_yidx, dtype=torch.long, device=device)[self.cs_type.clamp(min=0)]  # [B, S]
        self.loyalty = torch.full((B, C), 100.0, dtype=dtype, device=device)

        # --- rival civs (phase 4c) ---------------------------------------------
        rr = rules.rivals
        self.R = int(f0.get("rMax", 0))
        self.RC = 10  # rival city slots per civ (settling caps at maxCities; flips can exceed)
        r_pad, rc_pad = max(self.R, 1), self.RC
        self.rival_at = torch.tensor([[t.get("rv", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.water = torch.tensor([[t.get("wt", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.nwonder = torch.tensor([[t.get("nw", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.fresh_water = torch.tensor([[t.get("fw", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.settle_ok = torch.tensor([[t.get("st", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.site_q3 = torch.tensor(
            [[t.get("sq", [0.0, 0.0, 0.0]) for t in f["tiles"]] for f in fixtures], dtype=torch.float64, device=device
        )  # [B, T, 3] per-source contributions, added separately like siteQuality
        self.hills = torch.tensor([[t.get("hl", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.r_alive = torch.zeros(B, r_pad, dtype=torch.bool, device=device)  # static: placed at creation
        self.r_aggression = torch.zeros(B, r_pad, dtype=torch.float64, device=device)
        self.r_atwar = torch.zeros(B, r_pad, dtype=torch.bool, device=device)
        self.r_warturns = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        self.r_peaceturns = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        self.r_tech = torch.zeros(B, r_pad, dtype=torch.float64, device=device)
        self.r_prodstock = torch.zeros(B, r_pad, dtype=torch.float64, device=device)
        self.r_milstock = torch.zeros(B, r_pad, dtype=torch.float64, device=device)
        self.r_pantheon_done = torch.zeros(B, r_pad, dtype=torch.bool, device=device)
        self.r_religion_done = torch.zeros(B, r_pad, dtype=torch.bool, device=device)
        self.r_next_city_id = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        self.r_gpp = torch.zeros(B, r_pad, 5, dtype=torch.float64, device=device)
        self.rc_alive = torch.zeros(B, r_pad, rc_pad, dtype=torch.bool, device=device)
        self.rc_center = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        self.rc_pop = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        self.rc_growth = torch.zeros(B, r_pad, rc_pad, dtype=torch.float64, device=device)
        self.rc_acquired = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        self.rc_hp = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        self.rc_id = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        self.rvcity_at = torch.full((B, T), -1, dtype=torch.long, device=device)  # civ id at rival centers
        self.v_alive = torch.zeros(B, U_MAX, dtype=torch.bool, device=device)  # rival units, spawn order
        self.v_civ = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.v_type = torch.zeros(B, U_MAX, dtype=torch.long, device=device)  # roster index
        self.v_tile = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.v_hp = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.v_next = torch.zeros(B, dtype=torch.long, device=device)
        self.rv_at = torch.full((B, T), -1, dtype=torch.long, device=device)  # rival-unit slot at tile
        self.gp_earned = torch.zeros(B, 5, dtype=torch.long, device=device)
        self.pantheon_claimed_n = torch.zeros(B, dtype=torch.long, device=device)
        self.claimed_f_n = torch.zeros(B, dtype=torch.long, device=device)
        self.claimed_o_n = torch.zeros(B, dtype=torch.long, device=device)
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
        self._loyalty_amenity = torch.tensor(rr.get("loyaltyAmenity", [3, 1.5, 0, -1.5, -3]), dtype=dtype, device=device)
        self._off3 = tiles_within_offsets(int(rr.get("workRadius", 3))).to(device)
        self._off7 = tiles_within_offsets(7).to(device)
        self._off2 = tiles_within_offsets(2).to(device)
        self._off1 = tiles_within_offsets(1).to(device)
        ids = [u["id"] for u in (rules.units or [])]
        self._r_spearman = ids.index("SPEARMAN") if "SPEARMAN" in ids else 0
        self._r_horseman = ids.index("HORSEMAN") if "HORSEMAN" in ids else 0

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
        self.FARM = ids.index("FARM") if "FARM" in ids else 0
        self.MINE = ids.index("MINE") if "MINE" in ids else -1        # -1 = not in scope
        self.LUMBER = ids.index("LUMBER_MILL") if "LUMBER_MILL" in ids else -1
        self._farm_food = float(imp.get("farmFood", 1))
        self._farm_housing = float(imp.get("farmHousing", 0.5))
        self._mine_prod = float(imp.get("mineProd", 1))       # base MINE production
        self._lumber_prod = float(imp.get("lumberProd", 1))   # LUMBER_MILL production (no tech boost)
        self._builder_idx = int(imp.get("builderIdx", -1))
        self._hillfarms_civic = int(imp.get("hillFarmsCivic", -1))
        self._mine_unlock_tech = int(imp.get("mineUnlockTech", -1))       # MINING
        self._lumber_unlock_tech = int(imp.get("lumberUnlockTech", -1))   # CONSTRUCTION
        # techs that permanently lift a MINE's yield (Apprenticeship, Industrialization → +1⚙ each)
        mbt = imp.get("mineBoostTechs", [])  # [[techIdx, prodAmount], ...]
        self._mine_boost_tech = torch.tensor([x[0] for x in mbt], dtype=torch.long, device=device)
        self._mine_boost_amt = torch.tensor([float(x[1]) for x in mbt], dtype=dtype, device=device)
        self.farm_flat = torch.tensor([[t.get("fa_f", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.farm_hill = torch.tensor([[t.get("fa_h", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.mine_ok = torch.tensor([[t.get("mi", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.lumber_ok = torch.tensor([[t.get("lu", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.improvement = torch.full((B, T), -1, dtype=torch.long, device=device)  # -1 none, else improvement idx
        self.pillaged = torch.zeros(B, T, dtype=torch.bool, device=device)
        self.p_charges = torch.zeros(B, P_MAX, dtype=torch.long, device=device)

        # --- districts (D1: catalog + inert state tensor) ------------------------
        # The catalog is loaded and a [B, T] district-type-index tensor is
        # allocated (-1 = none). Nothing places a district yet, so this is a
        # verified no-op — D2 adds scripted placement + static adjacency yields.
        self.districts_cat = list(rules.districts or [])
        self.districts_on = bool(self.districts_cat)
        self.district = torch.full((B, T), -1, dtype=torch.long, device=device)  # -1 none, else PLACEABLE_DISTRICTS idx
        nD = len(self.districts_cat)
        self.d_static_adj = torch.tensor(
            [[t.get("dadj", [0.0] * nD) for t in f["tiles"]] for f in fixtures],
            dtype=dtype, device=device,
        )  # [B, T, nD] raw static-source adjacency, inert until D2b consumes it
        sc = rules.district_scaffold or {}
        self.CAMPUS = int(sc.get("campusIdx", 0))
        self.campus_unlock_tech = int(sc.get("campusUnlockTech", -1))  # WRITING
        self.campus_placed = torch.zeros(B, dtype=torch.bool, device=device)  # D2b scaffold flag (activation is next stage)
        self._campus_active = bool(sc.get("active", 0))  # D2b-activate off-switch (mirrors exporter SCRIPTED_CAMPUS)
        self._askable = torch.tensor(sc.get("askable", []), dtype=torch.long, device=device)  # CS-quest askable idx -> district-type idx
        self.d_usable = torch.tensor(
            [[t.get("du", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )  # [B, T] district-placeable land — static part of canPlaceDistrict

        self._eff_version = 0
        self._eff_cache: tuple[int, torch.Tensor] | None = None
        self._food_cache: tuple[int, torch.Tensor] | None = None
        self._score_cache: tuple[int, torch.Tensor] | None = None
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
        # Rival yields sum the picked tiles' food/production sequentially to
        # mirror the TS reduce. When every value is a dyadic rational
        # (integers and halves — true for all shipped rules), every partial
        # sum is exact in f64, so ANY summation order gives the identical
        # bits and one .sum() replaces the per-tile add loop.
        fp2 = self.tile_yields[:, :, :2].double() * 2
        self._dyadic_fp = bool((fp2 == fp2.round()).all())

        # The Palace exists only in the capital (slot 0).
        pal_y = torch.zeros(C, 6, dtype=dtype, device=device)
        pal_y[0] = rules.palace_yields.to(device=device, dtype=dtype)
        self.palace_slot_yields = pal_y
        slot0 = torch.zeros(C, dtype=dtype, device=device)
        slot0[0] = 1.0
        self.palace_slot_housing = slot0 * rules.palace_housing
        self.palace_slot_amenities = slot0 * rules.palace_amenities

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
        self.current = torch.full((B, C), -1, dtype=torch.long, device=device)
        self.cur_cost = z(B, C)
        self.progress = z(B, C)
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
        self.center_at = torch.full((B, T), -1, dtype=torch.long, device=device)  # city slot at tile
        self.center_at.scatter_(1, self.site[:, :1], 0)  # the capital
        # Tile → unit-slot occupancy maps. Stacking mirrors tileFreeForUnit:
        # a foreign unit blocks a tile entirely; among the player's own
        # units, one military + one civilian may share.
        self.barb_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.pmil_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.pciv_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.u_alive = torch.zeros(B, U_MAX, dtype=torch.bool, device=device)
        self.u_type = torch.zeros(B, U_MAX, dtype=torch.long, device=device)  # 0 WARRIOR / 1 SPEARMAN
        self.u_tile = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.u_hp = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.next_slot = torch.zeros(B, dtype=torch.long, device=device)  # append-only: keeps unit order
        self.camp_tile = torch.full((B, max(self.K, 1)), -1, dtype=torch.long, device=device)
        self.n_camps = torch.zeros(B, dtype=torch.long, device=device)
        # Player units (phase 4b): trained via the production head, ordered
        # like state.units (append-only slots preserve spawn order).
        self.p_alive = torch.zeros(B, P_MAX, dtype=torch.bool, device=device)
        self.p_type = torch.zeros(B, P_MAX, dtype=torch.long, device=device)  # index into rules.units
        self.p_tile = torch.zeros(B, P_MAX, dtype=torch.long, device=device)
        self.p_hp = torch.zeros(B, P_MAX, dtype=torch.long, device=device)
        self.p_next = torch.zeros(B, dtype=torch.long, device=device)
        self.warrior_trained = torch.zeros(B, C, dtype=torch.bool, device=device)  # scripted-policy flag
        self.builder_trained = torch.zeros(B, dtype=torch.bool, device=device)  # scripted-policy flag (capital, once)
        self.tdef = torch.tensor([[t.get("tdef", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # Damage table stays float64 regardless of sim dtype: the RNG factor
        # is float64 and damage rounds to integers the TS engine must match.
        self._dmg_base = torch.tensor(cb.get("dmgBase", [30.0] * 121), dtype=torch.float64, device=device)
        self._unit_combat = torch.tensor(cb.get("unitCombat", [20, 25]), dtype=torch.long, device=device)
        # Trainable roster tables (index = position in rules.units).
        ru = rules.units or [{"id": "WARRIOR", "cost": 40, "combat": 20, "maintenance": 0, "civilian": 0, "requiresTech": -1}]
        self.NU = len(ru)
        self.UNIT_BASE = NB + 2  # production action codes NB+2 … NB+1+NU train units
        self._p_cost = torch.tensor([u["cost"] for u in ru], dtype=dtype, device=device)
        self._p_combat = torch.tensor([u["combat"] for u in ru], dtype=torch.long, device=device)
        self._p_maint = torch.tensor([u["maintenance"] for u in ru], dtype=dtype, device=device)
        self._p_civ = torch.tensor([bool(u["civilian"]) for u in ru], dtype=torch.bool, device=device)
        self._p_tech = torch.tensor([u["requiresTech"] for u in ru], dtype=torch.long, device=device)
        self._p_charges = torch.tensor([u.get("charges", 0) for u in ru], dtype=torch.long, device=device)
        self._warrior_idx = next((i for i, u in enumerate(ru) if u["id"] == "WARRIOR"), 0)

        # Precomputed static prereq masks would race with completion inside a
        # turn; availability is recomputed per loop (cheap: NT ≤ 32).
        self._prereq_t = self._prereq_matrix(rules.t_prereqs, NT).to(device)
        self._prereq_c = self._prereq_matrix(rules.c_prereqs, NC).to(device)
        self._arangeT = torch.arange(T, device=device)
        self._arangeNB = torch.arange(NB, device=device)

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

    @staticmethod
    def _prereq_matrix(prereqs: list, n: int) -> torch.Tensor:
        m = torch.zeros(n, n, dtype=torch.bool)
        for i, ps in enumerate(prereqs):
            for p in ps:
                m[i, p] = True
        return m

    # --- helpers ---------------------------------------------------------------

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
        return torch.floor(20 + 10 * n.to(self.dtype) ** 1.1)

    def _available_mask(self, done: torch.Tensor, prereq: torch.Tensor) -> torch.Tensor:
        """[B, N] researchable now: not done, all prereqs done."""
        missing = (prereq.unsqueeze(0) & ~done.unsqueeze(1)).any(dim=2)
        return ~done & ~missing

    def _eff_cost(self, cost: torch.Tensor, boosted: torch.Tensor) -> torch.Tensor:
        return torch.where(boosted, torch.round(cost * (1 - self.rules.boost_fraction)), cost)

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
        if not self.disasters and not self.improvements_on:
            return self.tile_yields
        if self._eff_cache is not None and self._eff_cache[0] == self._eff_version:
            return self._eff_cache[1]
        ty = self.tile_yields.clone()
        ty[:, :, 0] = self._eff_food()
        if self.improvements_on:
            ty[:, :, 1] = self._eff_prod()
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
        """[B, C, NB] City Center buildings each city could queue now."""
        rd = self.rules_dev
        unlocked = torch.where(
            rd.b_unlock.unsqueeze(0) >= 0,
            self.techs.gather(1, rd.b_unlock.clamp(min=0).unsqueeze(0).expand(self.B, -1)),
            torch.ones(self.B, self.NB, dtype=torch.bool, device=self.device),
        )
        return unlocked.unsqueeze(1) & ~self.buildings & (~rd.b_river.view(1, 1, -1) | self.river_center.unsqueeze(2))

    def _adj_district_count(self) -> torch.Tensor:
        """[B, T] number of adjacent COMPLETED districts — the DISTRICT adjacency
        source. Counts player city centers (center_at), player specialty
        districts (self.district) and rival city centers (rvcity_at, which set
        tile.district='CITY_CENTER' in the TS engine). No owner filter, mirroring
        matchesAdjacency('DISTRICT')."""
        nb = self.neigh
        nbc = nb.clamp(min=0)
        on_map = (nb >= 0).unsqueeze(0)  # [1, T, 6]
        is_d = ((self.center_at[:, nbc] >= 0) | (self.district[:, nbc] >= 0) | (self.rvcity_at[:, nbc] >= 0)) & on_map
        return is_d.sum(dim=2)  # [B, T]

    def _city_totals(self) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Per-city yields/housing/growth-factor from the current state:
        (total [B, C, 6] alive-masked, housing [B, C], growth_f [B, C]).
        Mirrors computeCityStats — used both inside step() and to score."""
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
        )  # [B, C, M]
        score = torch.where(cand, tile_score.gather(1, tcf).reshape(B, C, M), torch.tensor(-1e18, dtype=self.dtype, device=dev))
        score = score - tc.to(self.dtype) * 1e-9  # tie: lowest index first
        k = min(max(int(self.pop.max().item()), 1), M)
        top_scores, top_idx = score.topk(k, dim=2)
        take = (torch.arange(k, device=dev).view(1, 1, k) < self.pop.unsqueeze(2)) & (top_scores > -1e17)
        top_tile = tc.gather(2, top_idx)  # [B, C, k] global tile ids
        ty = eff_y.unsqueeze(1).expand(B, C, T, 6).gather(2, top_tile.unsqueeze(-1).expand(B, C, k, 6))
        worked_y = (ty * take.unsqueeze(-1).to(self.dtype)).sum(dim=2)  # [B, C, 6]

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
        total = worked_y + center_y + self.palace_slot_yields.unsqueeze(0) + b_y
        if self.districts_on:
            # District adjacency yields (D2b: Campus science only, placed where no
            # dynamic source is live so the value is purely floor(static);
            # dynamic sources + other district types are D3). Mirrors
            # cityDistrictYields: floor(adjacency) into the district's yield
            # column, summed into the pre-amenity total.
            dt = self.district.gather(1, tcf).reshape(B, C, M)
            owned_d = (tiles >= 0) & (self.owner.gather(1, tcf).reshape(B, C, M) == slot_ids)
            adjc = self._adj_district_count().to(self.dtype)  # [B, T] DISTRICT source count
            # For each PLACED district with an adjacencyYield: floor(static +
            # 0.5*adjacent-districts) into its yield column. Type-specific dynamic
            # sources (mine/quarry for IZ, city-center for Harbor, built-wonder
            # for Theater) are added when those types are placed (D3b-4+).
            for d in self.districts_cat:
                yc = int(d.get("adjYield", -1))
                if yc < 0:
                    continue
                di = int(d["idx"])
                adjv = torch.floor(self.d_static_adj[:, :, di] + 0.5 * adjc)  # [B, T]
                mask = owned_d & (dt == di)
                total[:, :, yc] = total[:, :, yc] + (adjv.gather(1, tcf).reshape(B, C, M) * mask.to(self.dtype)).sum(dim=2)
            # districtMaintenance: 1 gold per completed specialty district (only
            # CITY_CENTER/NEIGHBORHOOD/AQUEDUCT are 0, none placed in scope).
            d_maint = (owned_d & (dt >= 0)).to(self.dtype).sum(dim=2)
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

        amen_have = self.palace_slot_amenities.view(1, C) + torch.einsum("bcn,n->bc", bf, rd.b_amenities)
        amen_need = torch.ceil((popf - 2) / 2).clamp(min=0)
        balance = amen_have - amen_need
        growth_f, yield_f = self._amenity_factors(balance)
        # Amenity-tier INDEX (0 Ecstatic … 4 Unhappy) — loyalty reads it.
        tier_idx = torch.full_like(self.pop, len(self.rules.amenity_tiers) - 1)
        for i in reversed(range(len(self.rules.amenity_tiers))):
            tier_idx = torch.where(balance >= self.rules.amenity_tiers[i][0], torch.full_like(tier_idx, i), tier_idx)
        total[:, :, 1:] *= yield_f.unsqueeze(2)  # non-food × amenity factor
        maintenance = self.base_maintenance + torch.einsum("bcn,n->bc", bf, rd.b_maintenance)
        if self.districts_on:
            maintenance = maintenance + d_maint  # specialty-district upkeep (Campus = 1 gold)
        total[:, :, 2] -= maintenance

        housing = self.water_housing + self.palace_slot_housing.view(1, C) + torch.einsum("bcn,n->bc", bf, rd.b_housing)
        if self.improvements_on:
            # +housing per owned FARM tile within the work radius (pillaged or
            # not — computeHousing does not gate on pillaged, unlike yields).
            # Only FARM carries housing (0.5); MINE/LUMBER_MILL housing is 0 in
            # TS (IMPROVEMENTS.MINE/LUMBER_MILL.housing === 0), so a mine or
            # lumber mill must NOT be credited farm housing.
            imp_win = self.improvement.gather(1, tcf).reshape(B, C, M)
            owned_c = self.owner.gather(1, tcf).reshape(B, C, M) == slot_ids
            imp_owned = (tiles >= 0) & owned_c & (imp_win == self.FARM)
            housing = housing + imp_owned.to(self.dtype).sum(dim=2) * self._farm_housing

        # Dead slots contribute nothing (their static center yields are preloaded).
        total = total * self.alive.unsqueeze(2).to(self.dtype)
        return total, housing, growth_f, tier_idx

    def empire_score(self) -> torch.Tensor:
        """[B] — mirrors empireScore(state, 'balanced'): Σ over cities of
        population × popWeight + city yields · balanced weights."""
        total, _, _, _ = self._city_totals()
        rd = self.rules_dev
        pop_term = self.pop.sum(dim=1).to(self.dtype) * self.rules.score_pop_weight
        yield_term = torch.einsum("bck,k->b", total, rd.score_yield_weights)
        return pop_term + yield_term

    # --- action masks (the macro-action surface) --------------------------------

    def production_mask(self) -> torch.Tensor:
        """[B, C, NB+2+NU] valid production actions for idle cities: columns
        0..NB-1 = City Center buildings, NB = settler (always trainable, as
        queueSettler is), NB+1 = idle, NB+2.. = train that roster unit
        (tech-gated like trainableUnits). All-False where no decision pends."""
        pend = self.alive & (self.current == -1)
        always = torch.ones(self.B, self.C, 2, dtype=torch.bool, device=self.device)
        cols = [self._buildable(), always]
        if self.units_mode:
            unit_ok = (self._p_tech.unsqueeze(0) < 0) | self.techs.gather(
                1, self._p_tech.clamp(min=0).unsqueeze(0).expand(self.B, -1)
            )
            cols.append(unit_ok.unsqueeze(1).expand(-1, self.C, -1))
        else:
            cols.append(torch.zeros(self.B, self.C, self.NU, dtype=torch.bool, device=self.device))
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

    # --- eureka detection --------------------------------------------------------

    def _detect_boosts(self) -> None:
        """Mirrors detectBoosts: flag every satisfied, unresearched,
        un-boosted condition. Runs where detectBoosts does — the start of
        the turn, before anything advances."""
        pop_sum = None
        for row in self.rules.boosts:
            kind = row["kind"]
            if kind == "building":
                pred = self.buildings[:, :, row["b"]].sum(dim=1) >= row["count"]
            elif kind == "cityPop":
                pred = (self.pop >= row["pop"]).any(dim=1)
            elif kind == "totalPop":
                if pop_sum is None:
                    pop_sum = self.pop.sum(dim=1)
                pred = pop_sum >= row["pop"]
            elif kind == "coastalCity":
                pred = (self.alive & self.coastal).any(dim=1)
            elif kind == "cities":
                pred = self.alive.sum(dim=1) >= row["count"]
            elif kind == "tech":
                pred = self.techs[:, row["t"]]
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
                on = (self.district >= 0) if dtype < 0 else (self.district == dtype)
                pred = on.sum(dim=1) >= row["count"]
            else:
                continue
            if row["target"] == "tech":
                self.tech_boosted[:, row["idx"]] |= pred & ~self.techs[:, row["idx"]]
            else:
                self.civic_boosted[:, row["idx"]] |= pred & ~self.civics[:, row["idx"]]

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

    def _damage_roll(self, mask: torch.Tensor, diff: torch.Tensor) -> torch.Tensor:
        """Mirrors damageRoll: 30·e^(0.04·Δ)·rand(0.75–1.25), JS-rounded,
        min 1. Δ is always an integer here, so the exponential comes from
        the fixture's JS-computed table (libm exp() can differ by an ulp
        between runtimes and the result rounds to an integer)."""
        r = self._next_random(mask)
        base = self._dmg_base[(diff + 60).clamp(0, 120)]
        return js_round(base * (0.75 + 0.5 * r)).clamp(min=1).to(torch.long)

    def _blocked_for(self, tiles: torch.Tensor, side: str) -> torch.Tensor:
        """Stacking check for tiles [B, N] (mirrors tileFreeForUnit): a
        foreign unit blocks entirely; an own unit of the same domain blocks.
        side: 'barb' | 'pmil' | 'pciv'."""
        tc = tiles.clamp(min=0)
        barb = self.barb_at.gather(1, tc) >= 0
        pmil = self.pmil_at.gather(1, tc) >= 0
        pciv = self.pciv_at.gather(1, tc) >= 0
        rv = self.rv_at.gather(1, tc) >= 0
        if side == "pmil":
            return barb | pmil | rv
        if side == "pciv":
            return barb | pciv | rv
        # 'barb' / 'rival': all their units are military, every other unit is
        # foreign or same-domain — anything standing there blocks.
        return barb | pmil | pciv | rv

    def _first_free_spot(self, at_tile: torch.Tensor, side: str, civ_mask: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor]:
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
        if side == "player":
            dom = torch.where(civ_mask.unsqueeze(1), pciv, pmil)
            blocked = barb | rv | dom
        else:  # barb or rival: every other unit blocks
            blocked = barb | pmil | pciv | rv
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
        self.p_charges[rows, slot] = self._p_charges[type_idx[rows]]
        civ_rows = civ[rows]
        mil_rows = rows[~civ_rows]
        if len(mil_rows) > 0:
            self.pmil_at[mil_rows, spot[mil_rows]] = self.p_next[mil_rows]
        cv_rows = rows[civ_rows]
        if len(cv_rows) > 0:
            self.pciv_at[cv_rows, spot[cv_rows]] = self.p_next[cv_rows]
        self.p_next[rows] += 1

    def _clear_camp_at(self, mask: torch.Tensor, tile: torch.Tensor) -> None:
        """A player unit entering a camp tile clears it: +50 gold and the
        camp list splices left (order matters for later garrison loops)."""
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
            self.treasury[b] += reward

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
        passable = self.passable.gather(1, nbc).reshape(B, P_MAX, 6)
        on_map = nb >= 0
        civ = self._p_civ[self.p_type]
        dom = torch.where(civ.unsqueeze(2), pciv, pmil)
        alive = self.p_alive.unsqueeze(2)
        move = on_map & passable & ~barb & ~rv_any & ~dom & alive
        can_fight = (self._p_combat[self.p_type] > 0).unsqueeze(2)
        attack = on_map & (barb | rv_war) & can_fight & alive
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
            )
            farmable = self.farm_flat.gather(1, tc) | (self.farm_hill.gather(1, tc) & civ_done)
            build_f = (here_ok & farmable).unsqueeze(2)
            build_m = (here_ok & self.mine_ok.gather(1, tc) & mining).unsqueeze(2)
            build_l = (here_ok & self.lumber_ok.gather(1, tc) & constr).unsqueeze(2)
        else:
            zc = torch.zeros(B, P_MAX, 1, dtype=torch.bool, device=dev)
            build_f = build_m = build_l = zc
        return torch.cat([move, attack, hold, build_f, build_m, build_l], dim=2)

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
        for p in range(p_high):
            act = active[:, p]
            if not bool(act.any()):
                continue
            here = self.p_tile[:, p]
            hc = here.clamp(min=0)
            owned_here = self.owner.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0
            not_center = self.center_at.gather(1, hc.unsqueeze(1)).squeeze(1) < 0
            unimproved = self.improvement.gather(1, hc.unsqueeze(1)).squeeze(1) < 0
            flat_h = self.farm_flat.gather(1, hc.unsqueeze(1)).squeeze(1)
            hill_h = self.farm_hill.gather(1, hc.unsqueeze(1)).squeeze(1)
            district_free = self.district.gather(1, hc.unsqueeze(1)).squeeze(1) < 0  # a district paves the tile (validImprovements returns [] there)
            build = act & owned_here & not_center & unimproved & district_free & (flat_h | (hill_h & civ_done))
            if bool(build.any()):
                rows = build.nonzero(as_tuple=True)[0]
                self.improvement[rows, here[rows]] = self.FARM
                self.p_charges[rows, p] -= 1
                self._eff_version += 1
                gone = build & (self.p_charges[:, p] <= 0)
                if bool(gone.any()):
                    gr = gone.nonzero(as_tuple=True)[0]
                    self.pciv_at[gr, here[gr]] = -1
                    self.p_alive[gr, p] = False

            march = act & ~build
            if not bool(march.any()):
                continue
            farmable = self.farm_flat | (self.farm_hill & civ_done.unsqueeze(1))
            job = (self.owner >= 0) & (self.center_at < 0) & (self.improvement < 0) & (self.district < 0) & farmable
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

    def _apply_unit_actions(self, actions: torch.Tensor) -> None:
        """Execute unit orders in slot (= spawn) order, exactly like a player
        issuing them one by one before ending the turn. Combat draws from
        the shared RNG, so this order is part of the parity contract."""
        cb = self.rules.combat
        p_high = int(self.p_next.max().item())
        for p in range(p_high):
            a = actions[:, p].to(torch.long)
            alive = self.p_alive[:, p]
            if not bool(alive.any()):
                continue
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
            att = alive & (a >= 6) & (a < 12) & (tgt >= 0) & ((bslot >= 0) | v_ok) & (self._p_combat[self.p_type[:, p]] > 0)
            if bool(att.any()):
                is_b = bslot >= 0
                atk_cs = self._p_combat[self.p_type[:, p]]
                b_cs = self._unit_combat[self.u_type.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)]
                v_cs = self._p_combat[self.v_type.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)]
                def_cs = torch.where(is_b, b_cs, v_cs) + self.tdef.gather(1, tc.unsqueeze(1)).squeeze(1)
                d_def = self._damage_roll(att, atk_cs - def_cs)
                d_atk = self._damage_roll(att, def_cs - atk_cs)
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

            # --- build FARM/MINE/LUMBER_MILL (13/14/15): a builder on a tile
            # where that improvement is valid. No RNG, re-validated at
            # execution (an earlier unit could have taken the tile / spent
            # state), so an invalid build is a no-op — mirroring the replay's
            # soft-failing builderImprove. Each row's action is one value, so
            # at most one improvement builds per unit (charges spend once).
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
                )
                for act, valid, imp in ((13, farmable, self.FARM), (14, mineable, self.MINE), (15, woodsy, self.LUMBER)):
                    if imp < 0:
                        continue
                    bld = base_ok & (a == act) & valid
                    if bool(bld.any()):
                        rows = bld.nonzero(as_tuple=True)[0]
                        self.improvement[rows, here[rows]] = imp
                        self.p_charges[rows, p] -= 1
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
                self._clear_camp_at(ok, tgt)  # walkPath clears camps for any player unit

    def _barbarian_phase(self) -> None:
        """Mirrors barbarianPhase turn for turn, draw for draw: camp roll →
        camp placement → per-camp garrison rolls → raider actions (attack
        else march) in unit order → city healing."""
        cb, B, T, dev = self.rules.combat, self.B, self.T, self.device
        city_max_hp = int(cb.get("cityMaxHp", 200))

        # New camp? One draw whenever below the cap (cities always exist);
        # a second draw picks the spot only if any candidate exists.
        can_roll = self.n_camps < self.max_camps
        r1 = self._next_random(can_roll)
        want = can_roll & (r1 < cb.get("campSpawnChance", 0.08))
        if bool(want.any()):
            near_city = ((self.dist < 5) & self.alive.unsqueeze(2)).any(dim=1)  # [B, T]
            cand = self.camp_ok & (self.owner == -1) & (self.cs_at < 0) & (self.rival_at < 0) & ~near_city
            if self.K > 0:
                camp_d = self.pair_dist[self.camp_tile.clamp(min=0)].to(torch.long)  # [B, K, T]
                near_camp = ((camp_d < 5) & (self.camp_tile >= 0).unsqueeze(2)).any(dim=1)
                cand = cand & ~near_camp
            has = want & cand.any(dim=1)
            r2 = self._next_random(has)
            if bool(has.any()):
                k = torch.floor(r2 * cand.sum(dim=1).to(torch.float64)).to(torch.long)
                cum = cand.long().cumsum(dim=1)
                sel = cand & (cum == (k + 1).unsqueeze(1))
                spot = sel.long().argmax(dim=1)
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
        for u in range(u_high):
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

            # Pillage: a raider that did not attack, standing on an owned,
            # improved, unpillaged tile, pillages it (heals 25, holds — no
            # march this turn), mirroring hostileUnitAct's pillage branch.
            pillage = torch.zeros_like(act)
            if self.improvements_on:
                h_imp = self.improvement.gather(1, here.unsqueeze(1)).squeeze(1) >= 0
                h_unpil = ~self.pillaged.gather(1, here.unsqueeze(1)).squeeze(1)
                h_owned = self.owner.gather(1, here.unsqueeze(1)).squeeze(1) >= 0
                pillage = act & ~attack & h_imp & h_unpil & h_owned
                if bool(pillage.any()):
                    rows = pillage.nonzero(as_tuple=True)[0]
                    self.pillaged[rows, here[rows]] = True
                    self._eff_version += 1  # a farm's yield just dropped
                    hp_cap = self.rules.combat.get("unitHp", 100)
                    self.u_hp[rows, u] = (self.u_hp[rows, u] + 25).clamp(max=hp_cap)

            # March target: the nearest unpillaged owned improvement within
            # dist < 13 (ties → lowest tile index), else the nearest alive
            # city (ties → founding order) — mirrors hostileUnitAct's target
            # scan (raiders head for your farms to pillage them). Then the
            # passable free neighbor closest to it (ties → direction order),
            # moving only if strictly closer.
            march = act & ~attack & ~pillage
            if not bool(march.any()):
                continue
            arangeT = torch.arange(T, device=dev)
            if self.improvements_on:
                imp_job = (self.improvement >= 0) & ~self.pillaged & (self.owner >= 0)  # [B, T]
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
            step_ok = (nb >= 0) & self.passable.gather(1, nbc) & ~self._blocked_for(nb, "barb")
            d_nb = self.pair_dist[tgt.unsqueeze(1), nbc].to(torch.long)  # dist(neighbor, target); symmetric
            skey = torch.where(step_ok, d_nb * 8 + arange6, 10**9)
            best = skey.min(dim=1).values
            move = march & has_tgt & (best < 10**9) & (torch.div(best, 8, rounding_mode="floor") < d_here)
            if bool(move.any()):
                dest = nb.gather(1, (best % 8).clamp(max=5).unsqueeze(1)).squeeze(1)
                rows = move.nonzero(as_tuple=True)[0]
                self.barb_at[rows, here[rows]] = -1
                self.barb_at[rows, dest[rows]] = u
                self.u_tile[rows, u] = dest[rows]

        # Cities heal +20 when no hostile stands adjacent (barbarians, or
        # rival units whose civ is at war).
        nb_c = self.neigh[self.site.clamp(min=0)]  # [B, C, 6]
        nbf = nb_c.clamp(min=0).reshape(B, -1)
        adj_b = (self.barb_at.gather(1, nbf) >= 0).reshape(B, self.C, 6)
        rvn = self.rv_at.gather(1, nbf)
        rv_war = (rvn >= 0) & self.r_atwar.gather(1, self.v_civ.gather(1, rvn.clamp(min=0)).clamp(max=max(self.R - 1, 0)))
        besieged = ((adj_b | rv_war.reshape(B, self.C, 6)) & (nb_c >= 0)).any(dim=2)
        healable = self.alive & (self.city_hp < city_max_hp) & ~besieged
        self.city_hp = torch.where(healable, (self.city_hp + cb.get("cityHealPerTurn", 20)).clamp(max=city_max_hp), self.city_hp)

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
        self.influence = self.influence + torch.where(
            any_met,
            torch.tensor(float(r.get("influencePerTurn", 3)), dtype=self.dtype, device=self.device),
            torch.zeros_like(self.influence),
        )
        cost = float(r.get("envoyCost", 100))
        for _ in range(3):
            earn = any_met & (self.influence >= cost)
            if not bool(earn.any()):
                break
            self.influence = torch.where(earn, self.influence - cost, self.influence)
            self.envoys_avail = self.envoys_avail + earn.long()

        cooldown = int(r.get("questCooldown", 12))
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
            if self._askable.numel() > 0 and self.districts_on:
                qd = self.cs_quest_district[:, s].clamp(min=0, max=self._askable.numel() - 1)
                asked_type = self._askable[qd]  # [B]
                owns_asked = (self.district == asked_type.unsqueeze(1)).any(dim=1) & (self.cs_quest_district[:, s] >= 0)
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
            if self._askable.numel() > 0 and self.districts_on:
                drawn_type = self._askable[draw1.clamp(min=0, max=self._askable.numel() - 1)]  # [B]
                already_bd = (self.district == drawn_type.unsqueeze(1)).any(dim=1)
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

    # --- rival civs (phase 4c) ------------------------------------------------------

    def _spawn_rival(self, mask: torch.Tensor, at_tile: torch.Tensor, type_idx: torch.Tensor, civ: int) -> None:
        """Rival units are military and share one append-only pool (per-civ
        order = state.units order filtered by civ, which per-civ loops use)."""
        if not bool(mask.any()):
            return
        found, spot = self._first_free_spot(at_tile, "rival")
        can = mask & found
        if not bool(can.any()):
            return
        rows = can.nonzero(as_tuple=True)[0]
        slot = self.v_next[rows]
        assert int(slot.max()) < U_MAX, "rival slot pool exhausted — raise U_MAX"
        self.v_alive[rows, slot] = True
        self.v_civ[rows, slot] = civ
        self.v_type[rows, slot] = type_idx[rows] if type_idx.dim() > 0 else type_idx
        self.v_tile[rows, slot] = spot[rows]
        self.v_hp[rows, slot] = self.rules.combat.get("unitHp", 100)
        self.rv_at[rows, spot[rows]] = slot
        self.v_next[rows] += 1

    def _rival_city_yields(self, r: int, j: int, mask: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Mirrors rivalCityYields: best `pop` owned tiles within the work
        radius, sorted by food+production (ties keep tilesWithin order),
        summed IN SORTED ORDER (the TS reduce order — float parity), plus
        the base 3🍞/2⚙ and the tech production scaler."""
        center = self.rc_center[:, r, j]
        tiles = tiles_from_offsets(center, self._off3, self.W, self.H)  # [B, M]
        tc = tiles.clamp(min=0)
        valid = (
            (tiles >= 0)
            & (self.rival_at.gather(1, tc) == r)
            & self.passable.gather(1, tc)
            & (tiles != center.unsqueeze(1))
        )
        # food is the only disaster-dynamic column; production is static —
        # no [B, T, 6] assembly needed here (the sums below are per-column)
        f = (self._eff_food() if (self.disasters or self.improvements_on) else self.tile_yields[:, :, 0]).gather(1, tc).double()
        p = self.tile_yields[:, :, 1].gather(1, tc).double()
        # ANY city center is paved (tile.district set at founding) and
        # yields nothing. Reachable when a loyalty flip parks two same-civ
        # cities inside each other's work radius: the neighbor's center
        # stays a CANDIDATE — it occupies a sorted slot exactly like the
        # TS list — but contributes zero food/production.
        paved = (self.center_at.gather(1, tc) >= 0) | (self.rvcity_at.gather(1, tc) >= 0)
        f = torch.where(paved, torch.zeros_like(f), f)
        p = torch.where(paved, torch.zeros_like(p), p)
        M = tiles.shape[1]
        key = torch.where(valid, (f + p) * 1e6 - torch.arange(M, device=self.device, dtype=torch.float64), torch.tensor(-1e18, dtype=torch.float64, device=self.device))
        kk = min(int(self.rules.rivals.get("maxPop", 12)), M)
        top_vals, top_idx = key.topk(kk, dim=1)
        take = (torch.arange(kk, device=self.device).unsqueeze(0) < self.rc_pop[:, r, j].unsqueeze(1)) & (top_vals > -1e17)
        f_sel = f.gather(1, top_idx) * take.double()
        p_sel = p.gather(1, top_idx) * take.double()
        if self._dyadic_fp:
            # every term is an exact dyadic (disasters shift food by
            # integers), so this .sum() is bit-identical to the TS reduce
            food = 3.0 + f_sel.sum(dim=1)
            prod = 2.0 + p_sel.sum(dim=1)
        else:
            food = torch.full((self.B,), 3.0, dtype=torch.float64, device=self.device)
            prod = torch.full((self.B,), 2.0, dtype=torch.float64, device=self.device)
            for m in range(kk):  # sequential adds mirror the TS loop's rounding
                food = food + f_sel[:, m]
                prod = prod + p_sel[:, m]
        prod = prod * (1 + self.r_tech[:, r] / 25)
        return torch.where(mask, food, torch.zeros_like(food)), torch.where(mask, prod, torch.zeros_like(prod))

    def _expand_rival_border(self, r: int, j: int, due: torch.Tensor) -> None:
        """Mirrors expandRivalBorder: best unowned passable non-wonder tile
        within 3 adjacent to this civ's land; score = resource·3 − dist·2 −
        idx/1e6 (unique — scan order is immaterial)."""
        if not bool(due.any()):
            return
        center = self.rc_center[:, r, j]
        tiles = tiles_from_offsets(center, self._off3, self.W, self.H)
        tc = tiles.clamp(min=0)
        unowned = (self.owner.gather(1, tc) < 0) & (self.cs_at.gather(1, tc) < 0) & (self.rival_at.gather(1, tc) < 0)
        ok = (tiles >= 0) & unowned & self.passable.gather(1, tc) & ~self.nwonder.gather(1, tc)
        nbs = self.neigh[tc.reshape(-1)].reshape(self.B, -1, 6)  # [B, M, 6]
        adj_own = ((self.rival_at.gather(1, nbs.clamp(min=0).reshape(self.B, -1)).reshape(self.B, -1, 6) == r) & (nbs >= 0)).any(dim=2)
        ok = ok & adj_own
        res3 = (self.res_priority.gather(1, tc) > 0).double() * 3
        d = self.pair_dist[center.unsqueeze(1), tc].double()
        score = torch.where(ok, res3 - d * 2 - tiles.double() / 1e6, torch.tensor(-torch.inf, dtype=torch.float64, device=self.device))
        best_s, best_i = score.max(dim=1)
        claim = due & (best_s > -torch.inf)
        if bool(claim.any()):
            rows = claim.nonzero(as_tuple=True)[0]
            spot = tiles[rows, best_i[rows]]
            self.rival_at[rows, spot] = r
            self.rc_acquired[rows, r, j] += 1

    def _rival_try_found(self, r: int, want: torch.Tensor, cost: torch.Tensor) -> None:
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
            okt = (tiles >= 0) & unowned & self.settle_ok.gather(1, tc) & (self.rvcity_at.gather(1, tc) < 0)
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
            hill = (self.hills.gather(1, rc2.reshape(B, -1)).reshape_as(ring) & member_ok).double() * 0.5
            q = self.fresh_water.gather(1, tc).double() * 8
            for m2 in range(ring.shape[2]):  # per member, FOUR separate adds — the exact TS sequence
                q = q + c3[:, :, m2, 0] * okd[:, :, m2]
                q = q + c3[:, :, m2, 1] * okd[:, :, m2]
                q = q + c3[:, :, m2, 2] * okd[:, :, m2]
                q = q + hill[:, :, m2]
            # tooClose: player cities < 3, city-states < 3, any rival city < 4
            tc3 = tc.unsqueeze(2)  # [B, M, 1] — pairwise indexing, no [B, M, T]
            d_pl = self.pair_dist[tc3, pl_centers.unsqueeze(1)].to(torch.long)
            near_pl = ((d_pl < 3) & self.alive.unsqueeze(1)).any(dim=2)
            d_cs = self.pair_dist[tc3, self.cs_center.clamp(min=0).unsqueeze(1)].to(torch.long)
            near_cs = ((d_cs < 3) & self.cs_alive.unsqueeze(1)).any(dim=2)
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
        self.r_prodstock[rows, r] -= cost[rows]
        slot = self.rc_alive[rows, r].sum(dim=1)
        assert int(slot.max()) < self.RC, "rival city slots exhausted — raise RC"
        s_idx = best_site[rows]
        self.rc_alive[rows, r, slot] = True
        self.rc_center[rows, r, slot] = s_idx
        self.rc_pop[rows, r, slot] = 1
        self.rc_growth[rows, r, slot] = 0
        self.rc_acquired[rows, r, slot] = 0
        self.rc_hp[rows, r, slot] = rrr.get("cityMaxHp", 200)
        self.rc_id[rows, r, slot] = self.r_next_city_id[rows, r]
        self.r_next_city_id[rows, r] += 1
        self.rvcity_at[rows, s_idx] = r
        self.rival_at[rows, s_idx] = r
        nb = self.neigh[s_idx]
        for d in range(6):
            n_d = nb[:, d]
            ndc = n_d.clamp(min=0)
            free = (
                (n_d >= 0)
                & (self.owner[rows, ndc] < 0)
                & (self.cs_at[rows, ndc] < 0)
                & (self.rival_at[rows, ndc] < 0)
                & ~self.water[rows, ndc]
            )
            self.rival_at[rows[free], n_d[free]] = r

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
        mil_att = att & ((dm >= 0) | (db >= 0) | (dv >= 0))
        civ_att = att & (dm < 0) & (db < 0) & (dv < 0) & (dc_ >= 0)
        if bool(mil_att.any()):
            def_is_barb = db >= 0
            def_is_rv = (dv >= 0) & ~def_is_barb & (dm < 0)
            d_cs_p = self._p_combat[self.p_type.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)]
            d_cs_b = self._unit_combat[self.u_type.gather(1, db.clamp(min=0).unsqueeze(1)).squeeze(1)]
            d_cs_v = self._p_combat[self.v_type.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)]
            def_cs = torch.where(def_is_barb, d_cs_b, torch.where(def_is_rv, d_cs_v, d_cs_p)) + self.tdef.gather(1, ttc.unsqueeze(1)).squeeze(1)
            d_def = self._damage_roll(mil_att, atk_cs_all - def_cs)
            d_atk = self._damage_roll(mil_att, def_cs - atk_cs_all)
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
        if bool(civ_att.any()):
            rows = civ_att.nonzero(as_tuple=True)[0]
            ds = dc_[rows]
            self.pciv_at[rows, ttc[rows]] = -1
            self.p_alive[rows, ds] = False
            adv = civ_att & ~self._blocked_for(tgt.unsqueeze(1), blocked_side).squeeze(1)
            if bool(adv.any()):
                vr = adv.nonzero(as_tuple=True)[0]
                a_at[vr, here[vr]] = -1
                a_tile[vr, u] = ttc[vr]
                a_at[vr, ttc[vr]] = u

    def _attack_rival_city(self, att: torch.Tensor, tgt: torch.Tensor, u: int) -> None:
        """A barbarian battering a rival city (mirrors attackRivalCity):
        defense 15 + pop + ⌊tech·1.5⌋; sacked at 0 HP, never captured."""
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
        pop = self.rc_pop[bidx, civ, slot]
        tech = self.r_tech[bidx, civ]
        def_cs = 15 + pop + torch.floor(tech * 1.5).long()
        atk_cs = self._unit_combat[self.u_type[:, u]]
        d_city = self._damage_roll(att, atk_cs - def_cs)
        d_atk = self._damage_roll(att, def_cs - atk_cs)
        rows = att.nonzero(as_tuple=True)[0]
        self.rc_hp[rows, civ[rows], slot[rows]] -= d_city[rows]
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
            self.rc_hp[sacked, sc, sj] = round(self.rules.rivals.get("cityMaxHp", 200) / 2)

    def _rival_unit_war_act(self, v: int, act: torch.Tensor) -> None:
        """hostileUnitAct for an at-war rival unit: attack the lowest-index
        adjacent target — player city, hostile unit (player or barbarian),
        or ANY city-center-district tile, where striking another rival's (or
        its own) center is a no-op quirk — else march toward the nearest
        player city."""
        B, T, dev = self.B, self.T, self.device
        here = self.v_tile[:, v]
        nb = self.neigh[here.clamp(min=0)]
        nbc = nb.clamp(min=0)
        ctr_p = self.center_at.gather(1, nbc) >= 0
        has_unit = (
            (self.pmil_at.gather(1, nbc) >= 0)
            | (self.pciv_at.gather(1, nbc) >= 0)
            | (self.barb_at.gather(1, nbc) >= 0)
        )
        rvc = self.rvcity_at.gather(1, nbc) >= 0
        valid = (nb >= 0) & (ctr_p | has_unit | rvc)
        tkey = torch.where(valid, nb, T + 1)
        target_tile = tkey.min(dim=1).values
        attack = act & (target_tile <= T)
        ttc = target_tile.clamp(max=T - 1)
        tgt_city = self.center_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        has_u = (
            (self.pmil_at.gather(1, ttc.unsqueeze(1)).squeeze(1) >= 0)
            | (self.pciv_at.gather(1, ttc.unsqueeze(1)).squeeze(1) >= 0)
            | (self.barb_at.gather(1, ttc.unsqueeze(1)).squeeze(1) >= 0)
        )
        city_att = attack & (tgt_city >= 0)
        unit_att = attack & (tgt_city < 0) & has_u
        # rival-center tiles without units: acted, nothing happens (no draws)

        if bool(city_att.any()):
            self._hostile_city_attack(city_att, tgt_city, "rival", v)
        if bool(unit_att.any()):
            self._hostile_vs_unit(unit_att, ttc, "rival", v)

        # Pillage: a war unit that did not attack, standing on an owned
        # improved unpillaged tile, pillages it (heal 25, hold — no march),
        # mirroring hostileUnitAct's pillage branch.
        hc = here.clamp(min=0)
        pillage = torch.zeros_like(act)
        if self.improvements_on:
            h_imp = self.improvement.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0
            h_unpil = ~self.pillaged.gather(1, hc.unsqueeze(1)).squeeze(1)
            h_owned = self.owner.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0
            pillage = act & ~attack & h_imp & h_unpil & h_owned
            if bool(pillage.any()):
                rows = pillage.nonzero(as_tuple=True)[0]
                self.pillaged[rows, hc[rows]] = True
                self._eff_version += 1
                hp_cap = self.rules.combat.get("unitHp", 100)
                self.v_hp[rows, v] = (self.v_hp[rows, v] + 25).clamp(max=hp_cap)

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
        step_ok = (nb >= 0) & self.passable.gather(1, nbc) & ~self._blocked_for(nb, "rival")
        d_nb = self.pair_dist[tgt.unsqueeze(1), nbc].to(torch.long)
        skey = torch.where(step_ok, d_nb * 8 + torch.arange(6, device=dev), 10**9)
        best = skey.min(dim=1).values
        move = march & has_tgt & (best < 10**9) & (torch.div(best, 8, rounding_mode="floor") < d_here)
        if bool(move.any()):
            dest = nb.gather(1, (best % 8).clamp(max=5).unsqueeze(1)).squeeze(1)
            rows = move.nonzero(as_tuple=True)[0]
            self.rv_at[rows, here[rows]] = -1
            self.rv_at[rows, dest[rows]] = v
            self.v_tile[rows, v] = dest[rows]

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
        gm = self.pmil_at.gather(1, sitec)
        gb = self.barb_at.gather(1, sitec)
        g_cs_p = torch.where(gm >= 0, self._p_combat[self.p_type.gather(1, gm.clamp(min=0))], torch.zeros_like(gm))
        g_cs_b = torch.where(gb >= 0, self._unit_combat[self.u_type.gather(1, gb.clamp(min=0))], torch.zeros_like(gb))
        garrison_cs = torch.where(gm >= 0, g_cs_p, g_cs_b)
        g_cs = garrison_cs.gather(1, slot.clamp(min=0).unsqueeze(1)).squeeze(1)
        def_cs = torch.maximum(g_cs, torch.full_like(g_cs, 15)) + torch.div(
            self.pop.gather(1, slot.clamp(min=0).unsqueeze(1)).squeeze(1), 2, rounding_mode="floor"
        )
        d_city = self._damage_roll(att, atk_cs - def_cs)
        d_self = self._damage_roll(att, def_cs - atk_cs)
        rows = att.nonzero(as_tuple=True)[0]
        cs = slot[rows]
        self.city_hp[rows, cs] -= d_city[rows]
        a_hp[:, u] = torch.where(att, a_hp[:, u] - d_self, a_hp[:, u])
        died = att & (a_hp[:, u] <= 0)
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            a_at[dr, a_tile[dr, u]] = -1
            a_alive[:, u] = a_alive[:, u] & ~died
        sacked_rows = rows[self.city_hp[rows, cs] <= 0]
        if len(sacked_rows) > 0:
            sc = slot[sacked_rows]
            self.pop[sacked_rows, sc] = ((self.pop[sacked_rows, sc] * 3) // 4).clamp(min=1)
            loss = torch.minimum(
                torch.tensor(100.0, dtype=self.dtype, device=self.device),
                js_round(self.treasury[sacked_rows] * 0.2).to(self.dtype),
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

    def _rival_unit_peace_act(self, v: int, act: torch.Tensor, r: int) -> None:
        """Peacetime: snipe an adjacent barbarian, else drift home
        (patrol) — steps break ties in tilesWithin order, any unit blocks,
        and units within 3 of home stay put."""
        B, T, dev = self.B, self.T, self.device
        here = self.v_tile[:, v]
        nb = self.neigh[here.clamp(min=0)]
        nbc = nb.clamp(min=0)
        barb_there = self.barb_at.gather(1, nbc) >= 0
        valid = (nb >= 0) & barb_there
        tkey = torch.where(valid, nb, T + 1)
        target_tile = tkey.min(dim=1).values
        attack = act & (target_tile <= T)
        if bool(attack.any()):
            self._hostile_vs_unit(attack, target_tile.clamp(max=T - 1), "rival", v)
        patrol = act & ~attack
        if not bool(patrol.any()):
            return
        dh = self.pair_dist[here.clamp(min=0).unsqueeze(1), self.rc_center[:, r].clamp(min=0)].to(torch.long)
        hkey = torch.where(self.rc_alive[:, r], dh * 16 + torch.arange(self.RC, device=dev), 10**9)
        home = self.rc_center[:, r].gather(1, hkey.argmin(dim=1, keepdim=True)).squeeze(1).clamp(min=0)
        d_home = self.pair_dist[here.clamp(min=0), home].to(torch.long)
        roam = patrol & (d_home > 3) & (hkey.min(dim=1).values < 10**9)
        if not bool(roam.any()):
            return
        nbp = nb[:, PATROL_DIR_PERM]
        nbpc = nbp.clamp(min=0)
        free = (
            (nbp >= 0)
            & self.passable.gather(1, nbpc)
            & (self.barb_at.gather(1, nbpc) < 0)
            & (self.pmil_at.gather(1, nbpc) < 0)
            & (self.pciv_at.gather(1, nbpc) < 0)
            & (self.rv_at.gather(1, nbpc) < 0)
        )
        d_nb = self.pair_dist[home.unsqueeze(1), nbpc].to(torch.long)
        skey = torch.where(free, d_nb * 8 + torch.arange(6, device=dev), 10**9)
        best = skey.min(dim=1).values
        move = roam & (best < 10**9) & (torch.div(best, 8, rounding_mode="floor") < d_home)
        if bool(move.any()):
            dest = nbp.gather(1, (best % 8).clamp(max=5).unsqueeze(1)).squeeze(1)
            rows = move.nonzero(as_tuple=True)[0]
            self.rv_at[rows, here[rows]] = -1
            self.rv_at[rows, dest[rows]] = v
            self.v_tile[rows, v] = dest[rows]

    def _rival_phase(self) -> None:
        """Mirrors rivalPhase, rival by rival in id order — economy, border
        growth, settling, unit production (one draw for the home pick),
        great-people/pantheon/belief races (draws), then war or peace acts
        with their end-of-branch rolls."""
        if self.R == 0:
            return
        rr, B, dev = self.rules.rivals, self.B, self.device
        for r in range(self.R):
            n_cities = self.rc_alive[:, r].sum(dim=1)
            active = self.r_alive[:, r] & (n_cities > 0)
            if not bool(active.any()):
                continue
            # ONE add of the precomputed increment — techLevel feeds floor()s,
            # so (tech + 0.15) + 0.05n and tech + (0.15 + 0.05n) differ by an
            # ulp that flips them.
            tech_inc = 0.15 + 0.05 * n_cities.double()
            self.r_tech[:, r] = torch.where(active, self.r_tech[:, r] + tech_inc, self.r_tech[:, r])

            prod_sum = torch.zeros(B, dtype=torch.float64, device=dev)
            heal = torch.where(self.r_atwar[:, r], 5, 15)
            for j in range(self.RC):
                cact = active & self.rc_alive[:, r, j]
                if not bool(cact.any()):
                    continue
                food, prod = self._rival_city_yields(r, j, cact)
                prod_sum = torch.where(cact, prod_sum + prod, prod_sum)
                surplus = torch.maximum(
                    torch.tensor(0.5, dtype=torch.float64, device=dev), food - 2 * self.rc_pop[:, r, j].double()
                )
                self.rc_growth[:, r, j] = torch.where(cact, self.rc_growth[:, r, j] + surplus, self.rc_growth[:, r, j])
                p64 = self.rc_pop[:, r, j].double()
                need = torch.floor(15 + 8 * (p64 - 1) + (p64 - 1).clamp(min=0) ** 1.5) * rr.get("growthFactor", 0.75)
                grow = cact & (self.rc_growth[:, r, j] >= need) & (self.rc_pop[:, r, j] < rr.get("maxPop", 12))
                self.rc_pop[:, r, j] = self.rc_pop[:, r, j] + grow.long()
                self.rc_growth[:, r, j] = torch.where(grow, torch.zeros_like(self.rc_growth[:, r, j]), self.rc_growth[:, r, j])
                due = cact & (((self.turn + self.rc_id[:, r, j] * 3) % rr.get("borderPeriod", 9)) == 0)
                self._expand_rival_border(r, j, due)
                self.rc_hp[:, r, j] = torch.where(
                    cact, (self.rc_hp[:, r, j] + heal).clamp(max=rr.get("cityMaxHp", 200)), self.rc_hp[:, r, j]
                )

            pace = 0.7 + self.r_aggression[:, r] * 0.6
            self.r_prodstock[:, r] = torch.where(active, self.r_prodstock[:, r] + prod_sum * rr.get("prodToSettler", 0.3) * pace, self.r_prodstock[:, r])
            self.r_milstock[:, r] = torch.where(active, self.r_milstock[:, r] + prod_sum * rr.get("prodToMilitary", 0.22) * pace, self.r_milstock[:, r])

            settle_cost = rr.get("settlerBase", 90) + rr.get("settlerPer", 40) * (n_cities - 1).clamp(min=0).double()
            want = active & (n_cities < rr.get("maxCities", 6)) & (self.r_prodstock[:, r] >= settle_cost)
            if bool(want.any()):
                self._rival_try_found(r, want, settle_cost)

            n_cities2 = self.rc_alive[:, r].sum(dim=1)
            n_units = (self.v_alive & (self.v_civ == r)).sum(dim=1)
            cap = n_cities2 * 2 + torch.where(self.r_atwar[:, r], 3, 1)
            ucost = 45 + self.r_tech[:, r] * 2
            can_u = active & (n_units < cap) & (self.r_milstock[:, r] >= ucost)
            ru = self._next_random(can_u)
            if bool(can_u.any()):
                self.r_milstock[:, r] = torch.where(can_u, self.r_milstock[:, r] - ucost, self.r_milstock[:, r])
                ty = torch.where(
                    self.r_tech[:, r] > 12,
                    torch.tensor(self._r_horseman, device=dev),
                    torch.where(self.r_tech[:, r] > 6, torch.tensor(self._r_spearman, device=dev), torch.tensor(self._warrior_idx, device=dev)),
                )
                pick = torch.floor(ru * n_cities2.double()).to(torch.long).clamp(min=0)
                home = self.rc_center[:, r].gather(1, pick.clamp(max=self.RC - 1).unsqueeze(1)).squeeze(1)
                self._spawn_rival(can_u, home, ty, r)

            # Great-people race (no draws): accrue, claim from the shared pool.
            for cls in range(5):
                self.r_gpp[:, r, cls] = torch.where(
                    active, self.r_gpp[:, r, cls] + n_cities2.double() * rr.get("gppRate", 0.35), self.r_gpp[:, r, cls]
                )
                has_person = self.gp_earned[:, cls] < self._gp_roster[cls]
                gcost = self._gp_costs[self.gp_earned[:, cls].clamp(max=self._gp_costs.shape[0] - 1)]
                hit = active & has_person & (self.r_gpp[:, r, cls] >= gcost)
                self.r_gpp[:, r, cls] = torch.where(hit, torch.zeros_like(self.r_gpp[:, r, cls]), self.r_gpp[:, r, cls])
                self.gp_earned[:, cls] = self.gp_earned[:, cls] + hit.long()

            # Pantheon / religion claims: the picks' identities are inert in
            # covered scope, but the draws (and pool sizes) are not.
            pdue = active & ~self.r_pantheon_done[:, r] & (self.turn >= rr.get("pantheonTurn", 18) + r * 8)
            popen = pdue & (self.pantheon_claimed_n < rr.get("pantheonPool", 8))
            self._next_random(popen)
            self.pantheon_claimed_n = self.pantheon_claimed_n + popen.long()
            self.r_pantheon_done[:, r] = self.r_pantheon_done[:, r] | popen
            rdue = active & ~self.r_religion_done[:, r] & (self.turn >= rr.get("religionTurn", 45) + r * 12)
            ropen = rdue & (self.claimed_f_n < rr.get("followerPool", 8)) & (self.claimed_o_n < rr.get("founderPool", 8))
            self._next_random(ropen)
            self._next_random(ropen)
            self.claimed_f_n = self.claimed_f_n + ropen.long()
            self.claimed_o_n = self.claimed_o_n + ropen.long()
            self.r_religion_done[:, r] = self.r_religion_done[:, r] | ropen

            # War or peace (branch on the value at entry; a peace made this
            # turn still ran the war branch, exactly like the TS if/else).
            atw = active & self.r_atwar[:, r]
            self.r_warturns[:, r] = self.r_warturns[:, r] + atw.long()
            v_high = int(self.v_next.max().item())
            for v in range(v_high):
                a = atw & self.v_alive[:, v] & (self.v_civ[:, v] == r)
                if bool(a.any()):
                    self._rival_unit_war_act(v, a)
            peace_roll = atw & (self.r_warturns[:, r] >= rr.get("warMinTurns", 14))
            rp = self._next_random(peace_roll)
            made_peace = peace_roll & (rp < 0.25)
            if bool(made_peace.any()):
                self.r_atwar[:, r] = self.r_atwar[:, r] & ~made_peace
                self.r_warturns[:, r] = torch.where(made_peace, torch.zeros_like(self.r_warturns[:, r]), self.r_warturns[:, r])
                self.r_peaceturns[:, r] = torch.where(made_peace, torch.zeros_like(self.r_peaceturns[:, r]), self.r_peaceturns[:, r])

            pea = active & ~atw
            self.r_peaceturns[:, r] = self.r_peaceturns[:, r] + pea.long()
            for v in range(v_high):
                a = pea & self.v_alive[:, v] & (self.v_civ[:, v] == r)
                if bool(a.any()):
                    self._rival_unit_peace_act(v, a, r)
            # War declaration: strength/proximity gates first, the roll last.
            p_str = self.alive.sum(dim=1) * 10 + (self.p_alive.to(torch.long) * self._p_combat[self.p_type]).sum(dim=1)
            own_cs = (self.v_alive & (self.v_civ == r)).to(torch.long) * self._p_combat[self.v_type]
            r_str = js_round(n_cities2.double() * 8 + self.r_milstock[:, r] * 0.2 + own_cs.sum(dim=1).double())
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
            )
            rw = self._next_random(cond)
            declare = cond & (rw < 0.08 * (0.5 + self.r_aggression[:, r]))
            if bool(declare.any()):
                self.r_atwar[:, r] = self.r_atwar[:, r] | declare
                self.r_warturns[:, r] = torch.where(declare, torch.zeros_like(self.r_warturns[:, r]), self.r_warturns[:, r])

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
        scale = float(self.rules.rivals.get("loyaltyScale", 10))
        sitec = self.site.clamp(min=0)
        d_cc = self.pair_dist[sitec.unsqueeze(2), sitec.unsqueeze(1)].to(self.dtype)
        # d_cc[b, c, c'] = dist(site[c], site[c']) — weight by source c'
        w = (rng + 1 - d_cc).clamp(min=0)
        arange_c = torch.arange(C, device=dev)
        earlier = (arange_c.view(1, C) < arange_c.view(C, 1)).unsqueeze(0)  # [1, c, c'] → c' < c
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
        cap_pin = upd[:, 0]
        self.loyalty[:, 0] = torch.where(cap_pin, torch.full_like(self.loyalty[:, 0], 100.0), self.loyalty[:, 0])
        flip = upd & (self.loyalty <= 0)
        flip[:, 0] = False
        if not bool(flip.any()):
            return
        # Winner per flipping city: the rival with the most pressure (ties →
        # lowest id; zero pressure still wins over the -1 sentinel).
        for c in range(1, C):
            fc = flip[:, c]
            if not bool(fc.any()):
                continue
            site_c = self.site[:, c].clamp(min=0)
            d_rc = self.pair_dist[site_c.unsqueeze(1), rc_flat].to(self.dtype)
            wr = (rng + 1 - d_rc).clamp(min=0) * self.rc_pop.reshape(B, -1).to(self.dtype) * rc_live.to(self.dtype)
            press_r = wr.reshape(B, self.R if self.R > 0 else 1, self.RC).sum(dim=2)
            press_r = torch.where(self.r_alive, press_r, torch.full_like(press_r, -1.0))
            winner = press_r.argmax(dim=1)
            rows = fc.nonzero(as_tuple=True)[0]
            for b in rows.tolist():
                w_ = int(winner[b])
                old_pop = int(self.pop[b, c])
                # the city leaves the empire
                self.alive[b, c] = False
                self.pop[b, c] = 0
                self.current[b, c] = -1
                owned = self.owner[b] == c
                self.owner[b] = torch.where(owned, torch.full_like(self.owner[b], -1), self.owner[b])
                self.rival_at[b] = torch.where(owned, torch.full_like(self.rival_at[b], w_), self.rival_at[b])
                self.center_at[b, self.site[b, c]] = -1
                # ...and joins the winner
                slot = int(self.rc_alive[b, w_].sum())
                assert slot < self.RC, "rival city slots exhausted — raise RC"
                self.rc_alive[b, w_, slot] = True
                self.rc_center[b, w_, slot] = self.site[b, c]
                self.rc_pop[b, w_, slot] = max(1, (old_pop * 3) // 4)
                self.rc_growth[b, w_, slot] = 0
                self.rc_acquired[b, w_, slot] = int(self.tiles_acquired[b, c])
                self.rc_hp[b, w_, slot] = round(self.rules.rivals.get("cityMaxHp", 200) / 2)
                self.rc_id[b, w_, slot] = int(self.r_next_city_id[b, w_])
                self.r_next_city_id[b, w_] += 1
                self.rvcity_at[b, self.site[b, c]] = w_

    # --- one full turn -----------------------------------------------------------

    def step(
        self,
        production: torch.Tensor | None = None,
        tech: torch.Tensor | None = None,
        civic: torch.Tensor | None = None,
        units: torch.Tensor | None = None,
        envoy: torch.Tensor | None = None,
    ) -> None:
        """Advance every game one turn.

        production: [B, C] long — per-city action (0..NB-1 building, NB
        settler, NB+1 idle, NB+2.. train that roster unit; masked-invalid =
        no-op), or None for the scripted policy. tech/civic: [B] long picks
        applied where the research slot is empty (validated against the
        masks; -1 = no pick), or None for cheapest-first auto-research.
        units: [B, P_MAX] long unit orders (0–5 move, 6–11 attack, 12 hold),
        executed in slot order before the turn advances, like a player
        issuing orders before pressing end-turn. None = all hold.
        envoy: [B] long — back that city-state with one available envoy
        (validated; -1 = none), or None for the scripted greedy assignment
        (neediest met city-state, ties to the lowest id, until spent).
        """
        r, B, C, T, dev = self.rules, self.B, self.C, self.T, self.device
        rd = self.rules_dev

        # --- player unit orders (before the turn advances) ----------------------
        if units is not None and self.units_mode:
            self._apply_unit_actions(units)
        elif self.units_mode:
            # Scripted path: builders auto-improve (mirrors the exporter);
            # military units hold (passive garrisons), as before.
            self._scripted_builder()

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
                want_b = empty[:, 0] & (self.pop[:, 0] >= 2) & ~self.builder_trained
                bcode = self.UNIT_BASE + self._builder_idx
                self.current[:, 0] = torch.where(want_b, torch.full_like(self.current[:, 0], bcode), self.current[:, 0])
                self.cur_cost[:, 0] = torch.where(want_b, self._p_cost[self._builder_idx].expand_as(self.cur_cost[:, 0]), self.cur_cost[:, 0])
                self.progress[:, 0] = torch.where(want_b, torch.zeros_like(self.progress[:, 0]), self.progress[:, 0])
                self.builder_trained = self.builder_trained | want_b

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
                want_w = empty & (self.pop >= 2) & ~self.warrior_trained
                wcode = self.UNIT_BASE + self._warrior_idx
                self.current = torch.where(want_w, torch.full_like(self.current, wcode), self.current)
                self.cur_cost = torch.where(want_w, self._p_cost[self._warrior_idx].expand_as(self.cur_cost), self.cur_cost)
                self.progress = torch.where(want_w, torch.zeros_like(self.progress), self.progress)
                self.warrior_trained = self.warrior_trained | want_w

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
            # The TS engine queues city-by-city in slot order, and each queued
            # settler raises the next one's price — an exclusive prefix sum
            # reproduces that sequential cost exactly.
            base_q = (self.current == self.SETTLER).sum(dim=1, keepdim=True)
            prefix = is_s.long().cumsum(dim=1) - is_s.long()
            n_cities = self.alive.sum(dim=1, keepdim=True)
            s_cost = r.settler_base + r.settler_per_city * (n_cities - 1 + self.settlers.unsqueeze(1) + base_q + prefix).clamp(min=0).to(self.dtype)
            is_u = (act >= self.UNIT_BASE) & (act < self.UNIT_BASE + self.NU)
            ut = (act - self.UNIT_BASE).clamp(min=0, max=self.NU - 1)
            trainable = (self._p_tech.unsqueeze(0) < 0) | self.techs.gather(
                1, self._p_tech.clamp(min=0).unsqueeze(0).expand(B, -1)
            )  # [B, NU]
            valid_u = is_u & trainable.gather(1, ut)
            self.progress = torch.where(valid_b | is_s | valid_u, torch.zeros_like(self.progress), self.progress)
            self.cur_cost = torch.where(valid_b, rd.b_cost[act.clamp(min=0, max=self.NB - 1)], self.cur_cost)
            self.cur_cost = torch.where(is_s, s_cost, self.cur_cost)
            self.cur_cost = torch.where(valid_u, self._p_cost[ut], self.cur_cost)
            self.current = torch.where(valid_b | valid_u, act, self.current)
            self.current = torch.where(is_s, torch.full_like(self.current, self.SETTLER), self.current)
            self.settlers_queued = self.settlers_queued + is_s.sum(dim=1)

        # --- scripted Campus (D2b-activate) --------------------------------------
        # Scripted path only (the off-script RL rollout gets a district action in
        # D5). Mirrors the exporter: once WRITING is in, place ONE completed
        # Campus in the capital on the best floor(static-adjacency) owned,
        # unimproved, in-radius tile with NO adjacent completed district (center
        # or specialty), ties to lowest tile index — so the yield is purely
        # static (dynamic sources are D3).
        if production is None and self.districts_on and self.campus_unlock_tech >= 0 and self._campus_active:
            has_w = self.techs[:, self.campus_unlock_tech]  # [B]
            want = has_w & ~self.campus_placed & self.alive[:, 0]
            if bool(want.any()):
                site0 = self.site[:, 0].clamp(min=0)  # [B]
                elig = (
                    (self.owner == 0)
                    & self.d_usable
                    & (self.district < 0)
                    & (self.improvement < 0)
                    & (self.dist[:, 0] <= 3)
                )  # [B, T]
                elig[torch.arange(B, device=dev), site0] = False  # not the center itself
                # score by the FULL floor(static + 0.5*adjacent-districts) (D3a):
                # placement now includes the dynamic DISTRICT source, so the Campus
                # may sit next to the center/another district for its +0.5 each.
                adjc = self._adj_district_count().to(self.dtype)  # [B, T]
                adjf = torch.floor(self.d_static_adj[:, :, self.CAMPUS] + 0.5 * adjc)  # [B, T]
                arT = torch.arange(T, device=dev, dtype=self.dtype)
                key = torch.where(elig, adjf * T - arT, torch.full_like(adjf, -1e18))  # max adj, ties lowest index
                best = key.argmax(dim=1)  # [B]
                place = want & elig.any(dim=1)
                if bool(place.any()):
                    rows = place.nonzero(as_tuple=True)[0]
                    self.district[rows, best[rows]] = self.CAMPUS
                    self.campus_placed = self.campus_placed | place
                    self._eff_version += 1

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

        # --- refreshUnits: +10 hp on friendly ground (own territory; always,
        # for hostiles), +5 in the wilds ------------------------------------------
        if self.units_mode:
            heal = self.rules.combat.get("unitHealPerTurn", 10)
            cap = self.rules.combat.get("unitHp", 100)
            self.u_hp = torch.where(self.u_alive, (self.u_hp + heal).clamp(max=cap), self.u_hp)
            self.v_hp = torch.where(self.v_alive, (self.v_hp + heal).clamp(max=cap), self.v_hp)
            friendly = self.owner.gather(1, self.p_tile.clamp(min=0)) >= 0
            p_heal = torch.where(friendly, heal, 5)
            self.p_hp = torch.where(self.p_alive, (self.p_hp + p_heal).clamp(max=cap), self.p_hp)

        # --- worked tiles + city yields ------------------------------------------
        total, housing, growth_f, tier_idx = self._city_totals()
        popf = self.pop.to(self.dtype)
        pop_before = self.pop.clone()  # loyalty mixes pre/post-growth pops

        # --- production ------------------------------------------------------------
        has_item = self.current >= 0
        self.progress = torch.where(has_item, self.progress + total[:, :, 1], self.progress)
        done = has_item & (self.progress >= self.cur_cost)
        made_settler = done & (self.current == self.SETTLER)
        self.settlers = self.settlers + made_settler.sum(dim=1)
        made_building = done & (self.current < self.NB)
        if made_building.any():
            bi, ci = made_building.nonzero(as_tuple=True)
            self.buildings[bi, ci, self.current[bi, ci]] = True
        made_unit = done & (self.current >= self.UNIT_BASE)
        if bool(made_unit.any()):
            # Spawn in city order (the TS city loop completes them that way).
            for c in range(C):
                m = made_unit[:, c]
                if bool(m.any()):
                    self._spawn_player(m, self.site[:, c], (self.current[:, c] - self.UNIT_BASE).clamp(min=0))
        self.current = torch.where(done, torch.full_like(self.current, -1), self.current)
        self.progress = torch.where(done, torch.zeros_like(self.progress), self.progress)  # overflow drops (queue empty)

        # --- growth ------------------------------------------------------------------
        surplus = total[:, :, 0] - popf * r.food_per_citizen
        head = housing - popf
        hf = torch.where(head >= 2, 1.0, torch.where(head >= 1, 0.5, 0.25).to(self.dtype)).to(self.dtype)
        effective = torch.where(surplus > 0, surplus * hf * growth_f, surplus)
        self.food_box = self.food_box + effective
        need = self._growth_needed(self.pop)
        grow = self.alive & (self.food_box >= need)
        self.pop = self.pop + grow.long()
        self.food_box = torch.where(grow, self.food_box - need, self.food_box)
        starve = self.alive & ~grow & (self.food_box < 0)
        self.pop = torch.where(starve, (self.pop - 1).clamp(min=1), self.pop)
        self.food_box = torch.where(starve, torch.zeros_like(self.food_box), self.food_box)

        # --- borders --------------------------------------------------------------------
        # The TS engine expands each city fully, in founding order, within a
        # turn — later cities see earlier claims. C is tiny, so walk slots.
        self.culture_box = self.culture_box + total[:, :, 4]
        y_sum = self._eff_yields().sum(dim=2)
        neigh_flat = self.neigh.clamp(min=0).reshape(1, -1).expand(B, -1)
        neigh_valid = (self.neigh >= 0).view(1, T, 6)
        for c in range(C):
            for _ in range(BORDER_LOOPS):
                cost_b = self._border_cost(self.tiles_acquired[:, c])
                ready = self.alive[:, c] & (self.culture_box[:, c] >= cost_b)
                if not ready.any():
                    break
                owner_nb = self.owner.gather(1, neigh_flat).reshape(B, T, 6)
                adj_own = ((owner_nb == c) & neigh_valid).any(dim=2)
                cand_b = (self.owner == -1) & (self.cs_at < 0) & (self.rival_at < 0) & (self.dist[:, c] <= 5) & adj_own
                # order: dist asc, resource priority desc, yield sum desc, index asc
                key = (
                    self.dist[:, c].to(self.dtype) * 1e12
                    - self.res_priority.to(self.dtype) * 1e9
                    - torch.round(y_sum * 1000) * 1e4
                    + self._arangeT.to(self.dtype)
                )
                key = torch.where(cand_b, key, torch.tensor(float("inf"), dtype=self.dtype, device=dev))
                best = key.argmin(dim=1)
                has_cand = cand_b.any(dim=1)
                expand = ready & has_cand
                if expand.any():
                    rows = expand.nonzero(as_tuple=True)[0]
                    self.owner[rows, best[rows]] = c
                    self.culture_box[:, c] = torch.where(expand, self.culture_box[:, c] - cost_b, self.culture_box[:, c])
                    self.tiles_acquired[:, c] = self.tiles_acquired[:, c] + expand.long()
                capped = ready & ~has_cand
                self.culture_box[:, c] = torch.where(capped, torch.minimum(self.culture_box[:, c], cost_b), self.culture_box[:, c])
                if not expand.any():
                    break

        # --- empire accumulators ----------------------------------------------------------
        self.treasury = self.treasury + total[:, :, 2].sum(dim=1)
        self.science_total = self.science_total + total[:, :, 3].sum(dim=1)
        self.culture_total = self.culture_total + total[:, :, 4].sum(dim=1)

        # --- loyalty & defections (inside/right after the TS city loop) --------------------
        self._apply_loyalty_and_flips(tier_idx, pop_before)

        # --- the hostile world (after the city loop, before research) ----------------------
        if self.units_mode:
            self.treasury = self.treasury - (self.p_alive.to(self.dtype) * self._p_maint[self.p_type]).sum(dim=1)
            self._barbarian_phase()
        if self.disasters:
            self._disaster_phase()
        self._city_state_phase()
        self._rival_phase()

        # --- research ---------------------------------------------------------------------
        turn_science = total[:, :, 3].sum(dim=1)
        turn_culture = total[:, :, 4].sum(dim=1)
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
            if self.improvements_on and self._mine_boost_tech.numel() > 0 and torch.isin(self.cur_tech[rows], self._mine_boost_tech).any():
                self._eff_version += 1  # a boost tech just lifted every existing mine's yield
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
            self.civic_prog = torch.where(fin, self.civic_prog - eff, self.civic_prog)
            self.cur_civic = torch.where(fin, torch.full_like(self.cur_civic, -1), self.cur_civic)
            if civic is None:
                self.cur_civic = self._auto_pick(self.cur_civic, self.civics, self.civic_boosted, rd.c_cost, self._prereq_c)
        no_civic = (self.cur_civic == -1) & ~self._available_mask(self.civics, self._prereq_c).any(dim=1)
        self.civic_prog = torch.where(no_civic, torch.minimum(self.civic_prog, torch.zeros_like(self.civic_prog)), self.civic_prog)

        # --- founding (mirrors the plannedSettles loop at the end of endTurn) ------
        # Consume the planned-site list in order while settlers remain; a
        # site failing canFoundCity is DROPPED without spending the settler.
        # Slots bind at founding (founded_n is monotonic — a flipped city's
        # slot is never reused, exactly like trace ids).
        for _ in range(self.KS):
            can = (self.settlers > 0) & (self.next_site_ptr < self.KS) & (self.founded_n < C)
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
            ok = free & (dcity.min(dim=1).values >= 3) & (drc.min(dim=1).values >= 3)
            valid = can & ok
            self.next_site_ptr = self.next_site_ptr + can.long()  # consumed either way
            if not bool(valid.any()):
                continue
            rows = valid.nonzero(as_tuple=True)[0]
            c_new = self.founded_n[rows]
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
            self.settlers[rows] -= 1
            self.founded_n[rows] += 1
            # Claim the center (unconditionally, as foundCity does) plus any
            # unowned first-ring tiles; the center becomes a district tile.
            self.owner[rows, s_idx] = c_new
            self.workable[rows, s_idx] = False
            self.center_at[rows, s_idx] = c_new
            # foundCity strips the removable feature — exactly the woods/
            # rainforest/marsh that carry +3 defense — so the center tile's
            # terrain defense drops to its hills component. (Rival and
            # city-state founding do NOT strip; the capital's statics were
            # exported post-founding, already stripped.)
            self.tdef[rows, s_idx] = self.hills[rows, s_idx].long() * 3
            nb = self.neigh[s_idx]  # [R, 6]
            for d in range(6):
                n_d = nb[:, d]
                ndc = n_d.clamp(min=0)
                free_nb = (
                    (n_d >= 0)
                    & (self.owner[rows, ndc] == -1)
                    & (self.cs_at[rows, ndc] < 0)
                    & (self.rival_at[rows, ndc] < 0)
                )
                self.owner[rows[free_nb], n_d[free_nb]] = c_new[free_nb]

        self.turn += 1

    # --- parity trace row (matches scripts/gpu-trace.ts encoding) ----------------

    def trace_row(self) -> torch.Tensor:
        cols = [
            torch.full((self.B,), float(self.turn), dtype=self.dtype, device=self.device),
            self.techs.sum(dim=1).to(self.dtype),
            self.civics.sum(dim=1).to(self.dtype),
            self.settlers.to(self.dtype),
            self.alive.sum(dim=1).to(self.dtype),
            torch.round(self.treasury * 1000),
            torch.round(self.science_total * 1000),
            torch.round(self.culture_total * 1000),
            torch.round(self.empire_score() * 1000),
            self.rng_state.to(self.dtype),
            self.n_camps.to(self.dtype),
            self.u_alive.sum(dim=1).to(self.dtype),
            self.p_alive.sum(dim=1).to(self.dtype),
            self.envoys_avail.to(self.dtype),
            self.influence,
            self.fertility.sum(dim=1).to(self.dtype),
            (self.drought > 0).sum(dim=1).to(self.dtype),
            (self.improvement >= 0).sum(dim=1).to(self.dtype),
        ]
        for s in range(self.S):
            cols += [
                self.cs_envoys[:, s].to(self.dtype),
                self.cs_pop[:, s].to(self.dtype),
                self.cs_quest[:, s].to(self.dtype),
            ]
        for r in range(self.R):
            live = self.r_alive[:, r]
            zero = torch.zeros(self.B, dtype=self.dtype, device=self.device)
            cols += [
                torch.where(live, self.rc_alive[:, r].sum(dim=1).to(self.dtype), zero),
                torch.where(live, (self.rc_pop[:, r] * self.rc_alive[:, r].long()).sum(dim=1).to(self.dtype), zero),
                (self.v_alive & (self.v_civ == r)).sum(dim=1).to(self.dtype),
                torch.where(live & self.r_atwar[:, r], torch.ones_like(zero), zero),
                torch.where(live, torch.round(self.r_tech[:, r] * 1000).to(self.dtype), zero),
                torch.where(live, torch.round(self.r_prodstock[:, r] * 1000).to(self.dtype), zero),
                torch.where(live, torch.round(self.r_milstock[:, r] * 1000).to(self.dtype), zero),
            ]
        zero = torch.zeros(self.B, dtype=self.dtype, device=self.device)
        for c in range(self.C):
            live = self.alive[:, c]
            cols += [
                torch.where(live, self.pop[:, c].to(self.dtype), zero),
                (self.owner == c).sum(dim=1).to(self.dtype),
                torch.where(live, self.buildings[:, c].sum(dim=1).to(self.dtype) + (1 if c == 0 else 0), zero),  # +PALACE
                torch.where(live, self.tiles_acquired[:, c].to(self.dtype), zero),
                torch.where(live, torch.round(self.food_box[:, c] * 1000), zero),
                torch.where(live, torch.round(self.culture_box[:, c] * 1000), zero),
                torch.where(live, self.city_hp[:, c].to(self.dtype), zero),
                torch.where(live, torch.round(self.loyalty[:, c] * 1000), zero),
            ]
        return torch.stack(cols, dim=1)
