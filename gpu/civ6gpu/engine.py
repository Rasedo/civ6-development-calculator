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
    specialist_yields: list  # A-22: per-district specialist yields [nD, 6]
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
    b_farmbonus: torch.Tensor  # bool — #78 Water Mill: farm-improved BONUS resources gain +1 food
    b_unlock: torch.Tensor  # tech index or -1
    b_unlock_civic: torch.Tensor  # civic index or -1 (Temple/Amphitheater/… gate on a civic, not a tech)
    b_req_district: torch.Tensor  # required district idx (-1 = City Center / none)
    b_req_buildings: list  # per building: list of prerequisite building indices (requiresAny)
    b_excl_buildings: list  # B9-R1: per building: exclusive-sibling indices (exclusiveWith — Barracks/Stable)
    b_regional: torch.Tensor  # B9-R2: bool [NB] — regional building (leaves local sums; delivered by range)
    regional_range: int  # B9-R2: REGIONAL_RANGE (hex distance, source district tile -> receiver center)
    b_worship: torch.Tensor  # B9-R3: bool [NB] — worship building (faith-purchase-only; every production/gold picker skips)
    b_train_xp: torch.Tensor  # B-17 (ROUND B7): long [NB] — flat training XP a unit trained/purchased in a city holding this Encampment military building starts with (best tier over present buildings; 0 for non-military buildings)
    worship_bidx: list  # B9-R3: the 5 worship rows in WORSHIP_BUILDINGS order (religion id % 5 indexes THIS)
    temple_bidx: int  # B9-R3: TEMPLE row (worship prerequisite), -1 if absent
    worship_faith_cost: float  # B9-R3: flat worship faith price (round(190·GAME_SPEED))
    shrine_bidx: int  # B6-S2: SHRINE row (the missionary buy's gate), -1 if absent
    t_cost: torch.Tensor  # [NT]
    t_prereqs: list  # list of lists
    c_cost: torch.Tensor
    c_prereqs: list
    war_weariness: dict  # B-15: {perTurn, decay, perAmenity, cap} — flat amenity drag at war
    trade: dict  # A-11: {marketBidx, lighthouseBidx, foreignTradeCidx, capWonderWidx, range} — rival trade capacity/route anchors
    eras: dict  # B-24: {length, found, conquer, wonder, pantheon, religion, gp} — era-score events (S2 adds age thresholds)


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
        specialist_yields=r.get("specialistYields", []),
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
        worship_bidx=r.get("worshipBidx", []),
        temple_bidx=int(r.get("templeBidx", -1)),
        worship_faith_cost=float(r.get("worshipFaithCost", 114)),
        shrine_bidx=int(r.get("shrineBidx", -1)),
        t_cost=torch.tensor([t["cost"] for t in r["techs"]], dtype=torch.float64),
        t_prereqs=[t["prereqs"] for t in r["techs"]],
        c_cost=torch.tensor([c["cost"] for c in r["civics"]], dtype=torch.float64),
        c_prereqs=[c["prereqs"] for c in r["civics"]],
        war_weariness=r.get("warWeariness", {"perTurn": 1, "decay": 4, "perAmenity": 4, "cap": 24}),
        trade=r.get("trade", {}),
        eras=r.get("eras", {}),
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

# AUDIT B-4 XP & levels (mirrors combat.ts). +5 XP per attack executed (any
# roll-producing melee/ranged vs unit/city/CS/rc), +2 per attack survived as a
# MILITARY defender (incl. city/walls strikes). Barbarians accrue nothing (no
# barb xp plane); civilians never fight. XP_LEVELS grant a flat +5 CS per level
# at every roll the unit fights — an integer add into the CS assembly like the
# B-7 terms, preserved by the B-29 diff quantization.
TRADE_ROAD_MAX_STEPS = 32  # B-23 (#71): the layTradeRoad safety rail
XP_ATTACK = 5
XP_DEFEND = 2
XP_LEVEL_CS = 5
XP_LEVELS = (15, 45, 90)

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
    "p_xp", "v_xp",  # AUDIT B-4 XP (player/rival units; barbs accrue none — no plane)
    "p_aura_mp", "v_aura_mp",  # #70/S3 (B-8) frozen general/admiral +MP (barbs never have generals — no plane)
    "p_emb", "v_emb",  # #45/B-6 EMBARK: a land unit is on water (bool per slot)
    "u_alive", "u_type", "u_tile", "u_hp", "next_slot", "camp_tile", "n_camps", "game_over",
    "victory_type", "winner", "space_done",  # B-25 (Round B3): space-race chain progress
    "p_alive", "p_type", "p_tile", "p_hp", "p_next", "warrior_trained", "builder_trained",
    "builders_trained", "r_builders_trained",  # P4/D-10 cost escalators
    "best_melee", "r_best_melee",  # P4/D-22 city-defense trackers
    "district_dead",  # P5/S1: captured districts are paved-but-dead
    "site", "center_yields", "center_raw_food", "base_maintenance", "water_housing", "coastal", "river_center", "dist",
    "next_site_ptr", "founded_n", "loyalty", "city_seq", "city_seq_next",  # P5/S3: TS array-order rank per column
    "is_cap", "cap_tile_player",  # P7 (C-1): capital identity + the domination anchor
    "cs_met", "cs_envoys", "cs_pop", "cs_quest", "cs_quest_camp", "cs_quest_issued", "cs_quest_district", "cs_hp", "cs_alive", "cs_at", "cs_atwar", "cs_war_turns",  # A-18 (#79): player<->CS war
    "cs_last_levy", "cs_r_quest", "cs_r_quest_camp", "cs_r_quest_issued",  # A-12 (B8-L): rival levy cooldown + rival CS quests
    "influence", "envoys_avail",
    "rival_at", "rc_tile_id", "rvcity_at", "rv_at",  # A-17: rc_tile_id = per-rc tile registry (rc_id-keyed)
    "r_atwar", "rr_war", "rr_warkind", "rr_denounced", "rr_allied", "r_warmonger", "p_warmonger", "diplo_favor", "r_diplo_favor", "congress_sessions", "diplo_points", "r_diplo_points", "era_score", "civ_age", "prev_age", "dedications", "ded_picks", "r_warturns", "r_peaceturns", "war_weariness", "r_war_weariness", "r_treasury", "feat_stripped", "res_stripped", "district_complete", "encamp_hp", "road", "controlled", "r_techs", "r_civics", "prod_bank",
    "r_cur_tech", "r_cur_civic", "r_tech_prog", "r_civic_prog", "rc_current", "rc_progress", "rc_cost", "rc_qtile", "rc_dist_tile", "rc_bldg",
    "r_tiles_purchased",  # A-5r (#71): the rival tile-purchase cost escalator
    "r_pantheon_done", "r_religion_done", "r_next_city_id", "r_gpp", "r_faith", "r_prophets", "rvciv_at", "v_charges",
    "r_routes",  # A-11: rival domestic trade routes (rc-id pairs)
    "r_route_dest",  # B-23: international dest player-city CENTER TILE (>=0), else -1 (domestic/CS)
    "r_route_exp",   # B-23: per-route expiry turn (start + trade.duration), -1 = free slot
    "cs_r_envoys", "cs_r_met", "r_influence", "r_envoys_avail",  # A-12: rival↔CS diplomacy
    "r_tech_boosted", "r_civic_boosted",  # A-3: rival eurekas/inspirations
    "rc_alive", "rc_center", "rc_pop", "rc_growth", "rc_cbox", "rc_loyalty", "rc_acquired", "rc_hp", "rc_outer_hp", "rc_id",
    "rc_is_cap", "cap_tile_rival",  # P7-FULL (C-3): rc.isCapital + capitalTiles[r+1] — explicit, compaction-safe
    "v_alive", "v_civ", "v_type", "v_tile", "v_hp", "v_next",
    "gp_earned", "player_gp_points", "player_faith", "pantheon_claimed_n", "claimed_f_n", "claimed_o_n", "claimed_e_n",
    "pan_claimed", "fol_claimed", "fou_claimed", "r_pantheon", "r_follower", "r_founder",  # A-7: belief identity
    "enh_claimed", "r_enhancer", "r_enhancer_done",  # B-18: enhancer race
    "holy_tile", "city_pressure", "city_followed", "rc_pressure", "rc_followed",  # B-18: pressure spread
    "gw_writing", "gw_art", "gw_music", "rc_gw_writing", "rc_gw_art", "rc_gw_music",  # B-20: Great Works per-city counts (#73: ART is a real kind)
    # B-20: RELICS per city (#73, TEMPLE slot, 4 faith + 8 tourism) and
    # ARTIFACTS + ANTIQUITY SITES (#79, Archaeological Museum, 3 culture + 3 tourism)
    "relics", "rc_relics", "artifacts", "rc_artifacts", "antiquity",
    "tourism_total", "r_tourism",  # B-20 (#71): cumulative TOURISM, player + per rival
    "r_culture",  # B-25 (#72): per-rival LIFETIME culture (the player's culture_total twin)
    "built_wonder", "built_wonder_complete", "rc_wonder",  # A-4: rival world wonders
    "fertility", "drought", "improvement", "pillaged", "p_charges", "district", "dscaffold_placed",
    "district_pillaged",  # B-32: raided-dark districts (tile plane, reclaim-safe)
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
        # #45/B-6: the WATER passability plane (a water tile that is not
        # impassable). Static terrain layer — tech gating (embark-capability +
        # OCEAN needing CARTOGRAPHY) is composed at the war-march gather site.
        # Defaults to 0 for pre-N1 fixtures (no water movement).
        self.wpass = torch.tensor([[t.get("wpass", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # #45/B-6: OCEAN tiles need CARTOGRAPHY to enter (COAST/LAKE do not).
        # Static per-tile flag; the CARTOGRAPHY gate is applied per-mover.
        self.ocean_tile = torch.tensor([[t.get("ocean", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)

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
        # B-21: per-CS-instance suzerain unique-perk yield column (-1 = descoped
        # row). Name-keyed in the exporter, constant thereafter.
        self.cs_suz_key = torch.full((B, s_pad), -1, dtype=torch.long, device=device)
        for b, f in enumerate(fixtures):
            for s, cs in enumerate(f.get("cityStates", [])):
                self.cs_alive[b, s] = True
                self.cs_type[b, s] = cs["type"]
                self.cs_center[b, s] = cs["center"]
                self.cs_pop[b, s] = cs["pop"]
                self.cs_suz_key[b, s] = cs.get("suzKey", -1)
        self.cs_at = torch.tensor([[t.get("cs", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.cs_met = torch.zeros(B, s_pad, dtype=torch.bool, device=device)
        self.cs_envoys = torch.zeros(B, s_pad, dtype=torch.long, device=device)
        self.cs_quest = torch.zeros(B, s_pad, dtype=torch.long, device=device)  # 0 none / 1 clearCamp / 2 trade / 3 district
        self.cs_quest_camp = torch.full((B, s_pad), -1, dtype=torch.long, device=device)
        self.cs_quest_issued = torch.zeros(B, s_pad, dtype=torch.long, device=device)
        self.cs_quest_district = torch.full((B, s_pad), -1, dtype=torch.long, device=device)  # askable idx of a buildDistrict quest (0=CAMPUS)
        # A-12 (B8-L): RIVAL LEVY cooldown — per CS, SHARED across seats (TS
        # cs.lastLevyTurn, `?? -LEVY_COOLDOWN`). Init to -levyCooldown so a
        # never-levied CS reads cooldown-ready (turn - (-cd) >= cd for turn≥0).
        self._levy_cooldown = int(rules.cs.get("levyCooldown", 20))
        self.cs_last_levy = torch.full((B, s_pad), -self._levy_cooldown, dtype=torch.long, device=device)
        # V-CS: siege hit points (attackCityState) — TS `cs.hp ?? CS_MAX_HP`.
        self.cs_hp = torch.full((B, s_pad), int(rules.cs.get("maxHp", 150)), dtype=torch.long, device=device)
        # A-18 (#79): the player<->city-state war state (CityState.atWar twin).
        # Peace is the default; a city-state is a separate player you must
        # DECLARE on, and the attack mask/resolver both read this.
        self.cs_atwar = torch.zeros(B, s_pad, dtype=torch.bool, device=device)
        # #50 (#79): turns since the player declared — the csWarTurns twin,
        # gating when peace may be offered (PEACE_MIN_WAR_TURNS).
        self.cs_war_turns = torch.zeros(B, s_pad, dtype=torch.long, device=device)
        self.influence = torch.zeros(B, dtype=dtype, device=device)
        self.envoys_avail = torch.zeros(B, dtype=torch.long, device=device)
        cs_yidx = rules.cs.get("typeYieldIdx", [3, 4, 2, 1, 1, 5])
        self._cs_yidx = torch.tensor(cs_yidx, dtype=torch.long, device=device)[self.cs_type.clamp(min=0)]  # [B, S]
        cs_didx = rules.cs.get("typeDistrictIdx", [0, 2, 3, 5, 6, 1])  # CS type -> district idx (Campus/Theater/CommHub/IZ/Encampment/HolySite)
        self._cs_didx = torch.tensor(cs_didx, dtype=torch.long, device=device)[self.cs_type.clamp(min=0)]  # [B, S] district each CS boosts at 3/6 envoys
        self._cs_district_bonus = float(rules.cs.get("districtBonus", 2))  # per-district amount at each of the 3-/6-envoy thresholds
        # B-21: the 3/6-envoy bonus lands on the type's tier-1 (>=3) / tier-2
        # (>=6) BUILDING catalog index (csEnvoyBonuses re-key). -1 = building
        # absent from the roster (no bonus). Constant, derived from cs_type.
        cs_b1 = rules.cs.get("typeB1Idx", [-1] * 6)
        cs_b2 = rules.cs.get("typeB2Idx", [-1] * 6)
        self._cs_b1idx = torch.tensor(cs_b1, dtype=torch.long, device=device)[self.cs_type.clamp(min=0)]  # [B, S]
        self._cs_b2idx = torch.tensor(cs_b2, dtype=torch.long, device=device)[self.cs_type.clamp(min=0)]  # [B, S]
        self._cs_suz_amt = float(rules.cs.get("suzerainYield", 3))  # B-21: flat suzerain capital-yield amount
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
        # A-24: env-gated machine-checked registry invariant. Auto-ON whenever
        # forced compaction runs (CIV6_RC_RECLAIM_AT set) so the forced gate in
        # every round ladder exercises it; also standalone via
        # CIV6_RC_REGISTRY_CHECK. NO always-on hot-path cost otherwise.
        self._rc_reg_check = bool(_os.environ.get("CIV6_RC_REGISTRY_CHECK")) or ("CIV6_RC_RECLAIM_AT" in _os.environ)
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
        # B-26 (#79): CLIFF edge mask — the riverMask twin. Blocks EMBARK and
        # DISEMBARK across that land/water edge (cities and Harbors excepted).
        self.cliff_mask = torch.tensor([[int(t.get("cm", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # A-9 (#71): per-tile APPEAL contribution (core/appeal.ts tileAppeal
        # sums what each NEIGHBOUR contributes). `ap` = static part + the t0
        # feature term; `ap_feat` isolates that feature term so a chopped tile
        # subtracts exactly it. Dynamic terms are applied in _tile_appeal.
        self.appeal_base = torch.tensor([[int(t.get("ap", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.appeal_feat = torch.tensor([[int(t.get("apf", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # #78: the ON-TILE appeal terms (mountain +4, river/lake +1). These are
        # NOT neighbour contributions, so they are added to the tile's OWN appeal
        # after the neighbour gather rather than folded into appeal_base.
        self.appeal_self = torch.tensor([[int(t.get("aps", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # #78: appeal OVERRIDE — natural wonder 5, mountain 4, neither touched by
        # adjacency; -999 = compute normally. Mirrors the two early returns in
        # core/appeal.ts tileAppeal.
        self.appeal_over = torch.tensor([[int(t.get("apo", -999)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.r_alive = torch.zeros(B, r_pad, dtype=torch.bool, device=device)  # static: placed at creation
        self.r_aggression = torch.zeros(B, r_pad, dtype=torch.float64, device=device)
        self.r_atwar = torch.zeros(B, r_pad, dtype=torch.bool, device=device)
        # A-19/B-33 (task #55 S1): per-PAIR rival↔rival war matrix, unified with
        # the TS `atWarRivals`. rr_war[b, i, j] = rival i is at war with rival j
        # (symmetric, diagonal false). r_atwar stays the war-with-player [B, R]
        # vector BESIDE this. INERT in S1 (nothing reads it); _MUTABLE-registered
        # for snapshot/restore (civ-level — no slot compaction exposure).
        self.rr_war = torch.zeros(B, r_pad, r_pad, dtype=torch.bool, device=device)
        # B-22 (task #55 S3): per-PAIR casus belli. rr_warkind[b, i, j] = the
        # (i, j) rival↔rival war is FORMAL (denounced ≥ rrFormalMinTurns earlier);
        # False = SURPRISE (default). Symmetric, only meaningful where rr_war.
        # rr_denounced[b, i, j] = turn i denounced j (directed grudge, -1 = none;
        # persistent — never reset). Both start empty at t0 (no rival↔rival war
        # exists), so no exporter load. _MUTABLE for snapshot/restore.
        self.rr_warkind = torch.zeros(B, r_pad, r_pad, dtype=torch.bool, device=device)
        self.rr_denounced = torch.full((B, r_pad, r_pad), -1, dtype=torch.long, device=device)
        # B-22 (2026-07-27): rival<->rival ALLIANCES, symmetric. Allies never
        # declare war on each other; a denouncement or a war breaks it.
        self.rr_allied = torch.zeros_like(self.rr_denounced, dtype=torch.bool)
        # B-22 (2026-07-27): per-civ WARMONGER score (grievances).
        self.r_warmonger = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        # B-22 (#74): the PLAYER's grievance score — the exact r_warmonger twin.
        self.p_warmonger = torch.zeros(B, dtype=torch.long, device=device)
        # B-22 (#75): DIPLOMATIC FAVOR — the World Congress currency, per civ.
        self.diplo_favor = torch.zeros(B, dtype=torch.long, device=device)
        self.r_diplo_favor = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        # B-22 (#76): World Congress sessions held + Diplomatic Victory Points.
        self.congress_sessions = torch.zeros(B, dtype=torch.long, device=device)
        self.diplo_points = torch.zeros(B, dtype=torch.long, device=device)
        self.r_diplo_points = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        # B-24 (task #68 S1): per-civ era-score accumulator on UNIFIED civ ids
        # (col 0 = player, r+1 = rival r) — the TS `state.eraScore` mirror.
        # Integer, zero-draw event hooks only; resets at every eraLength
        # boundary (right after `self.turn += 1`, the endTurn eraBoundary
        # mirror). Loaded from the fixture's t0 snapshot (createGame's capital
        # foundings accrue pre-export). INERT in S1 (nothing reads it — Ages
        # land S2). _MUTABLE for snapshot/restore.
        self.era_score = torch.zeros(B, 1 + r_pad, dtype=torch.long, device=device)
        # B-24 (#77): the NAMED dedications each civ committed this era —
        # catalog indices, HEROIC_DEDICATIONS wide; -1 = slot unused.
        self.ded_picks = torch.full((B, 1 + r_pad, max(int(rules.eras.get("heroicDedications", 3)), 1)), -1, dtype=torch.long, device=device)
        for b, f in enumerate(fixtures):
            esi = f.get("eraScoreInit", [])
            for c, v in enumerate(esi[: 1 + r_pad]):
                self.era_score[b, c] = int(v)
        _er = rules.eras
        self._rr_ally_min_peace = int((rules.rivals.get("eras") or {}).get("rrAllyMinPeace", 30))  # B-22
        _er2 = rules.rivals.get("eras") or {}
        self._wm_dow = int(_er2.get("rrWarmongerDow", 4))
        self._wm_cap = int(_er2.get("rrWarmongerCapture", 3))
        self._wm_gang = int(_er2.get("rrWarmongerGang", 6))
        self._favor_per_suz = int(_er2.get("diploFavorPerSuzerain", 1))  # B-22 (#75)
        # B-22 (#76): the WORLD CONGRESS schedule + victory threshold.
        self._congress_interval = int(_er2.get("congressInterval", 30))
        self._congress_min_era = int(_er2.get("congressMinEra", 2))
        self._dvp_per_res = int(_er2.get("dvpPerResolution", 1))
        self._dvp_win = int(_er2.get("diploVictoryPoints", 20))
        self._era_len = int(_er.get("length", 50))
        self._era_pts = {k: int(_er.get(k, d)) for k, d in (("found", 2), ("conquer", 3), ("wonder", 3), ("pantheon", 1), ("religion", 2), ("gp", 1))}
        # B-24 S2: per-civ Age (0 Dark / 1 Normal / 2 Golden), assigned at each
        # era boundary from the just-ended window's score; era 0 = all Normal
        # (the TS civAges default — nothing exported at t0). _MUTABLE.
        # _age_factor = the SOURCE civ's loyalty-pressure multiplier (halves —
        # exact in f32 AND f64, so modulated sums stay association-free).
        self.civ_age = torch.ones(B, 1 + r_pad, dtype=torch.long, device=device)
        # B-24 (#71): dedication substrate — the PREVIOUS age (the Heroic test)
        # and how many dedications each civ committed this era.
        self.prev_age = torch.ones_like(self.civ_age)
        self.dedications = torch.ones_like(self.civ_age)
        self._era_dark = int(_er.get("darkT", 3))
        self._era_gold = int(_er.get("goldenT", 10))
        self._age_factor = torch.tensor(_er.get("agePressure", [0.5, 1.0, 1.5]), dtype=torch.float64, device=device)
        # B-24 S3: governors — STATELESS greedy loyalty anchors (recomputed
        # every turn from civics + the quantized loyalty snapshot; no state).
        self._gov_per = int(_er.get("govCivicsPerTitle", 10))
        self._gov_max = int(_er.get("govMaxTitles", 5))
        self._tile_buy_live = bool(_er.get("rivalTileBuyLive", False))  # A-5r (#71): inert until the gold-ladder hunt lands
        self._ded_payouts_live = bool(_er.get("dedicationPayoutsLive", False))  # B-24 (#71): substrate live, payouts inert
        self._heroic_ded = int(_er.get("heroicDedications", 3))
        # B-24 (#77): the NAMED dedication catalog — per-kind event era score.
        self._ded_event_score = [int(x) for x in _er.get("dedEventScore", [1, 1, 1, 2])]
        self._n_ded = len(self._ded_event_score)
        self._ded_faith = int(_er.get("dedicationFaith", 2))
        self._ded_era = int(_er.get("dedicationEraScore", 1))
        self._gov_loy = float(_er.get("governorLoyalty", 8))
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
        # slot permutations never touch it. Capacity bound (rivalTradeCapacity):
        # FOREIGN_TRADE 1 + maxCities MARKET/LIGHTHOUSE + 2 wonders (COLOSSUS,
        # GREAT_ZIMBABWE) + one per suzerained TRADE city-state (A-12b). The old
        # K=10 omitted the trade-CS term (true max = 1 + maxCities + 2 + S); the
        # #45 naval reshuffle let a rival actually reach it (rollout assert). Size
        # K to the real bound + slack. t0 fixtures carry no routes (single-city).
        k_routes = 1 + int(self.rules.rivals.get("maxCities", 6)) + 2 + max(int(self.S), 0) + 2
        self.r_routes = torch.full((B, r_pad, k_routes, 2), -1, dtype=torch.long, device=device)
        # B-23: parallel per-route metadata (same [B, R, K] slot layout as
        # r_routes[..., :]). r_route_dest holds an international route's
        # destination player-city CENTER TILE (>=0); -1 marks domestic/CS
        # (dest decoded from r_routes[..., 1]). r_route_exp is the route's
        # expiry turn (start + trade.duration); -1 on a free slot.
        self.r_route_dest = torch.full((B, r_pad, k_routes), -1, dtype=torch.long, device=device)
        self.r_route_exp = torch.full((B, r_pad, k_routes), -1, dtype=torch.long, device=device)
        # AUDIT A-12: rival↔CS diplomacy — per-rival envoys/met planes plus
        # the influence/envoy-bank accumulators (the player twins). t0
        # fixtures carry none of it (rivals start unmet, zero everywhere).
        self.cs_r_envoys = torch.zeros(B, r_pad, s_pad, dtype=torch.long, device=device)
        self.cs_r_met = torch.zeros(B, r_pad, s_pad, dtype=torch.bool, device=device)
        self.r_influence = torch.zeros(B, r_pad, dtype=torch.float64, device=device)
        self.r_envoys_avail = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        # A-12 (B8-L): RIVAL city-state quests — ONE per (rival, CS), the
        # zero-draw twin of cs_quest. kind 0 none / 1 clearCamp / 2 trade /
        # 3 district; the buildDistrict target is deterministic (the CS type's
        # district, from _cs_didx) so no per-quest district plane is needed.
        # cs_r_quest_issued zeros init → first issue at turn≥questCooldown (the
        # TS `rqi[r] ?? 0` default). t0 fixtures carry none (rivals start unmet).
        self.cs_r_quest = torch.zeros(B, r_pad, s_pad, dtype=torch.long, device=device)
        self.cs_r_quest_camp = torch.full((B, r_pad, s_pad), -1, dtype=torch.long, device=device)
        self.cs_r_quest_issued = torch.zeros(B, r_pad, s_pad, dtype=torch.long, device=device)
        self.rvcity_at = torch.full((B, T), -1, dtype=torch.long, device=device)  # civ id at rival centers
        self.v_alive = torch.zeros(B, U_MAX, dtype=torch.bool, device=device)  # rival units, spawn order
        self.v_acted = torch.zeros(B, U_MAX, dtype=torch.bool, device=device)  # P4/D-2: spent MP since the last refresh (blocks healing)
        self.v_civ = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.v_type = torch.zeros(B, U_MAX, dtype=torch.long, device=device)  # roster index
        self.v_tile = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.v_hp = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.v_fortify = torch.zeros(B, U_MAX, dtype=torch.long, device=device)  # B-5: fortifyTurns (military; cap 2)
        self.v_xp = torch.zeros(B, U_MAX, dtype=torch.long, device=device)  # B-4: combat experience (rival units)
        # #70/S3 (B-8): the general/admiral aura's +1 MP, FROZEN at the
        # refreshUnits site (see _refresh_aura_mp) — walkers read this instead
        # of recomputing, so a general that war-walks later in the same step
        # cannot retro-change a pool TS already granted.
        self.v_aura_mp = torch.zeros(B, U_MAX, dtype=torch.long, device=device)
        self.v_emb = torch.zeros(B, U_MAX, dtype=torch.bool, device=device)  # #45/B-6: embarked (rival units)
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
        # B6-S1: enhancer effect channels (row 0 = the unclaimed pad; index =
        # r_enhancer + 1). Only the five S1 channels are read — no enhancer
        # carries the generic beliefRow fields.
        _erows = _bl.get("enhancers", [])
        # B6-S2: the missionary chassis anchors + per-enhancer channels. The
        # exporter pre-rounds mcost/mlump to INTEGERS (Math.round on the TS
        # side), so both engines read the identical value; the pad row (index
        # 0 = unenhanced civ) carries the BASE cost/lump, unlike the additive
        # zero pads of the S1 channels.
        _mcost0 = float(_bl.get("missionaryCost", 60))
        _mlump0 = int(_bl.get("spreadPressure", 10))
        self._missionary_idx = int(_bl.get("missionaryIdx", -1))
        self._missionary_cap = int(_bl.get("missionaryCap", 2))
        # B-18 (#71): APOSTLE + theological combat.
        self.r_tiles_purchased = torch.zeros(B, r_pad, dtype=torch.long, device=device)  # A-5r (#71)
        self._apostle_idx = int(_bl.get("apostleIdx", -1))
        self._apostle_cost = float(_bl.get("apostleCost", 200))
        self._apostle_cap = int(_bl.get("apostleCap", 1))
        self._apostle_buy_live = bool(_bl.get("apostleBuyLive", False))  # B-18 (#71): inert until the buy-timing hunt lands
        _rs = _bl.get("relStrength") or []
        self._rel_strength = torch.tensor(list(_rs) + [0] * 64, dtype=torch.long, device=device)
        self._city_rel_live = bool(_bl.get("cityReligionAdderLive", False))  # #71 DEBT-2: inert pending its hunt
        self._theo_dmg = int(_bl.get("theoDamage", 2))
        self._theo_base = int(_bl.get("theoBaseDamage", 30))
        self._theo_swing = float(_bl.get("theoPressureSwing", 15))
        self._theo_range = int(_bl.get("theoPressureRange", 6))
        self._enh = {
            "presR": torch.tensor([0.0] + [float(x.get("presR", 0)) for x in _erows], dtype=torch.float64, device=device),
            "tradeRel": torch.tensor([[0.0] * 6] + [list(x.get("tradeRel", [0.0] * 6)) for x in _erows], dtype=torch.float64, device=device),
            "cnear": torch.tensor([0.0] + [float(x.get("cnear", 0)) for x in _erows], dtype=torch.float64, device=device),
            "cdef": torch.tensor([0.0] + [float(x.get("cdef", 0)) for x in _erows], dtype=torch.float64, device=device),
            "cvs": torch.tensor([0.0] + [float(x.get("cvs", 0)) for x in _erows], dtype=torch.float64, device=device),
            "mchg": torch.tensor([0] + [int(x.get("mchg", 0)) for x in _erows], dtype=torch.long, device=device),
            "mlump": torch.tensor([_mlump0] + [int(x.get("mlump", _mlump0)) for x in _erows], dtype=torch.long, device=device),
            "mcost": torch.tensor([_mcost0] + [float(x.get("mcost", _mcost0)) for x in _erows], dtype=torch.float64, device=device),
        }
        self._just_war_range = int(_bl.get("justWarRange", 3))
        self._enh_combat_any = bool((self._enh["cnear"] != 0).any() or (self._enh["cdef"] != 0).any() or (self._enh["cvs"] != 0).any())
        self._rel_planes_cache = None  # B6-S1: ((turn, _eff_version), (near3 [B,O,T], terr [B,O,T]))
        # A-14: rival projects — rows {d: district idx, y: yield col, g: GP class}
        _pj = rules.projects or {}
        self._proj_rows = list(_pj.get("rows", []))
        self._proj_yf = float(_pj.get("yieldFraction", 0.15))
        self._proj_gf = float(_pj.get("gppFraction", 0.22))
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
            # AUDIT #78: per-wonder Great Work slots [nW, 3] in kind order
            # (writing, art, music). Additive with the GW_BUILDINGS slots —
            # before this, capacity came from buildings alone and a wonder
            # could not contribute any (Great Library: +2 writing).
            self._wond_gw = torch.tensor([list(w.get("gwslots", [0, 0, 0])) for w in self._wond_rows], dtype=torch.long, device=device)
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
        # B-20 (Round B7): Great Works. A claimed WRITER/MUSICIAN slots
        # gwWorksPerPerson works into its civ's cities — writing into the
        # AMPHITHEATER column, music into the MUSEUM column (b_cost catalog
        # order) — gwSlotsPerBuilding each; overflow charges fall back to the
        # instant culture lump. Per-city work counts feed a culture/turn
        # building-tier yield BY KIND (#70/S1: gwWritingCulture 2 /
        # gwMusicCulture 4 — the real GS values; no Great Work pays gold and
        # tourism is unmodeled; greatWorkCulture is the TS twin). Every
        # write bumps _eff_version (yield-bearing state, the B9/B10 invariant).
        # #73: the work-carrying GP classes now come from gwClsByKind
        # (WRITER / ARTIST / MUSICIAN) — see _gw_cls below.
        # #73: the three slotted Great Work kinds (0 WRITING / 1 ART / 2 MUSIC)
        # on the REAL Civ 6 mapping — Amphitheater 2 slots, Art Museum 3,
        # Broadcast Center 1; an Artist carries 3 works, a Writer/Musician 2.
        self._gw_cls = [int(x) for x in rr.get("gwClsByKind", [-1, -1, -1])]
        self._gw_bidx = [int(x) for x in rr.get("gwBidxByKind", [-1, -1, -1])]
        self._gw_slots_k = [int(x) for x in rr.get("gwSlotsByKind", [2, 3, 1])]
        self._gw_works_k = [int(x) for x in rr.get("gwWorksByKind", [2, 3, 2])]
        # B-20 (#73): RELICS — TEMPLE slot, 4 faith + 8 tourism (GS values).
        # B-20 (#79): ARTIFACTS — the relic plumbing's twin.
        self._modern_era_index = int(rr.get("modernEraIndex", 5))
        self._artifact_bidx = int(rr.get("artifactBidx", -1))
        self._artifact_slots = int(rr.get("artifactSlots", 3))
        self._artifact_culture = int(rr.get("artifactCulture", 3))
        self._artifact_tourism = int(rr.get("artifactTourism", 3))
        self._relic_bidx = int(rr.get("relicBidx", -1))
        self._relic_slots = int(rr.get("relicSlots", 1))
        self._relic_faith = int(rr.get("relicFaith", 4))
        self._relic_tour = int(rr.get("relicTourism", 8))
        self._gw_cul_k = [float(x) for x in rr.get("gwCultureByKind", [2, 2, 4])]
        # B-20 (#71): TOURISM per Great Work — GS pairs it with culture.
        self._gw_tour_k = [int(x) for x in rr.get("gwTourismByKind", [2, 2, 4])]
        # B-20 (#74): PRINTING doubles Great Work of WRITING tourism.
        self._gw_printing_tech = int(rr.get("gwPrintingTech", -1))
        self._gw_printing_mult = int(rr.get("gwPrintingWritingMult", 2))
        # B-20 (#71): WONDER tourism — base + 1 per era advanced PAST the
        # wonder's own era. Wonder era comes from its unlock; a civ's era is
        # the highest era among its completed techs/civics (the same scale).
        self._wonder_tour_base = int(rr.get("wonderTourismBase", 2))
        # B-25 (#72): CULTURE VICTORY thresholds (GS values, exported).
        self._tourism_per_visitor = int(rr.get("tourismPerVisitorPerCiv", 200))
        self._culture_per_tourist = int(rr.get("culturePerDomesticTourist", 100))
        self._tech_era = torch.tensor(rr.get("techEra", []) or [0], dtype=torch.long, device=device)
        self._civic_era = torch.tensor(rr.get("civicEra", []) or [0], dtype=torch.long, device=device)
        _wera = (rules.wonders or {}).get("eras", []) or [0]
        self._wonder_era = torch.tensor(list(_wera), dtype=torch.long, device=device)
        # B-20 (#71): cumulative TOURISM (the `state.tourismTotal` /
        # `RivalCiv.tourism` twins). Integer, zero-draw.
        self.tourism_total = torch.zeros(B, dtype=torch.long, device=device)
        self.r_tourism = torch.zeros(B, r_pad, dtype=torch.long, device=device)
        # B-25 (#72): per-rival LIFETIME culture. float64 like r_faith — it
        # banks the same per-turn `cul_sum` that feeds r_civic_prog, which
        # civic completions SPEND, so a separate total is required.
        self.r_culture = torch.zeros(B, r_pad, dtype=torch.float64, device=device)
        self.gw_writing = torch.zeros(B, C, dtype=torch.long, device=device)  # AMPHITHEATER slots used, per player city
        self.gw_art = torch.zeros(B, C, dtype=torch.long, device=device)      # #73: ART MUSEUM slots used
        self.gw_music = torch.zeros(B, C, dtype=torch.long, device=device)    # #73: BROADCAST CENTER slots used
        self.rc_gw_writing = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        self.rc_gw_art = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        self.rc_gw_music = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        # B-20 (#73): RELICS, per city, held in the TEMPLE's single slot.
        self.relics = torch.zeros(B, C, dtype=torch.long, device=device)
        self.artifacts = torch.zeros(B, C, dtype=torch.long, device=device)  # B-20 (#79)
        # B-20 (#79): ANTIQUITY SITES — the markAntiquitySite twin. Created by
        # PRE-MODERN events (a razed camp, a unit death) and excavated into
        # Artifacts by an Archaeologist.
        self.antiquity = torch.zeros(B, self.T, dtype=torch.bool, device=device)
        self.rc_relics = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)
        self.rc_artifacts = torch.zeros(B, r_pad, rc_pad, dtype=torch.long, device=device)  # B-20 (#79)
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
        self.QUARRY = ids.index("QUARRY") if "QUARRY" in ids else -1  # A-9 (#71): appeal -1
        self.OIL_WELL = ids.index("OIL_WELL") if "OIL_WELL" in ids else -1
        self.LUMBER = ids.index("LUMBER_MILL") if "LUMBER_MILL" in ids else -1
        # B-27 (#71): the Seaside Resort (appended LAST in IMPROVEMENT_IDS).
        self.SEASIDE = ids.index("SEASIDE_RESORT") if "SEASIDE_RESORT" in ids else -1
        self.FORT = ids.index("FORT") if "FORT" in ids else -1  # B-27 (#78)
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
        # B-27 (#79): the Military Engineer roster index + the border/war flag.
        self._eng_idx = int(imp.get("engineerIdx", -1))
        self._rival_eng_live = bool(imp.get("rivalEngineerLive", False))
        self._hillfarms_civic = int(imp.get("hillFarmsCivic", -1))
        self._farmadj_civic = int(imp.get("farmAdjCivic", -1))  # GS: Feudalism farm-adjacency +1 food
        self._farmadj_tech = int(imp.get("farmAdjTech", -1))    # GS: Replaceable Parts +1 more
        self._mine_unlock_tech = int(imp.get("mineUnlockTech", -1))       # MINING
        self._lumber_unlock_tech = int(imp.get("lumberUnlockTech", -1))   # CONSTRUCTION
        self._seaside_unlock_tech = int(imp.get("seasideUnlockTech", -1))  # B-27 (#71): RADIO
        self._seaside_min_appeal = int(imp.get("seasideMinAppeal", 4))     # BREATHTAKING
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
        # A-22 (2026-07-27): per-district SPECIALIST yields [nD, 6], parallel
        # to the districts catalog (all-zero where a district has no row).
        _sy = list(rules.specialist_yields or [])
        if not _sy:
            _sy = [[0.0] * 6] * max(len(rules.districts), 1)
        self._spec_yields = torch.tensor(_sy, dtype=dtype, device=device)  # [nD, 6]
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
        # #78: exported all along as `res` (1 bonus / 2 strategic / 3 luxury,
        # 0 none) but never consumed. Static — a tile's resource CATEGORY never
        # changes — so it is a constant plane like res_imp, not _MUTABLE state.
        self.res_cat = torch.tensor([[t.get("res", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.farm_flat = torch.tensor([[t.get("fa_f", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.farm_hill = torch.tensor([[t.get("fa_h", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.mine_ok = torch.tensor([[t.get("mi", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.lumber_ok = torch.tensor([[t.get("lu", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self._fa_f_c = torch.tensor([[t.get("fa_f_c", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self._fa_h_c = torch.tensor([[t.get("fa_h_c", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self._mi_c = torch.tensor([[t.get("mi_c", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # B-27 (#71): the Seaside Resort's STATIC half (flat G/P/D beside COAST,
        # unpaved) and whether the tile carried NO feature at t0. The live
        # feature test is `sr_nf | feat_stripped` (a chop makes a tile eligible,
        # exactly as TS gates on the LIVE tile.feature === null); the appeal
        # test is dynamic and runs off _tile_appeal().
        self._sr_c = torch.tensor([[t.get("sr_c", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self._sr_nf = torch.tensor([[t.get("sr_nf", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
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
        # B-17 (#71): the ENCAMPMENT garrison pool, per TILE (the TS
        # `Tile.encampHp` twin). Mustered to ENCAMPMENT_HP when the district
        # completes; while positive the tile bars hostile entry and the
        # district may strike; a melee assault depletes it and at 0 the tile
        # opens and the strike goes silent.
        self.encamp_hp = torch.zeros(B, T, dtype=torch.long, device=device)
        # B-23 (#71): the ROAD plane (the TS `Tile.road` twin). Laid by trade
        # routes; a road-to-road step ignores the terrain penalty, and once
        # `road_bridged` latches at the first era boundary, the river charge too.
        self.road = torch.tensor(
            [[bool(t.get("rd", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )
        self.road_bridged = False
        # AUDIT B-32: a COMPLETE, non-CITY_CENTER district raided into darkness —
        # its adjacency/buildings/housing/amenities/GPP/CS-envoy channels stop
        # until a builder repairs it (static counts stay: still owned). t0 world
        # has none (inits zero). A tile plane (not slot-keyed), so snapshot/
        # restore covers it and _reclaim_rc/_reclaim_pool leave it intact.
        self.district_pillaged = torch.zeros(B, T, dtype=torch.bool, device=device)
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
        self._scaffold = [(int(p["idx"]), int(p["unlockTech"]), int(p.get("unlockCivic", -1)), int(p.get("placement", 0))) for p in sc.get("place", [])]  # (district idx, unlock tech idx, unlock CIVIC idx — B9-R1: at most one of the two >= 0, placement: 0 land / 1 aqueduct / 2 coastal / 3 encampment)
        self.dscaffold_placed = torch.zeros(B, max(len(self._scaffold), 1), dtype=torch.bool, device=device)  # per-scaffold-district placed flag
        # B9-R1: VETERANCY's encampmentProdMult needs the EN district idx and
        # its scaffold slot (the player queue-head codes for the district and
        # its buildings — game.ts isEncampmentItem).
        self._encamp_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "ENCAMPMENT"), -1)
        # A-9 (#71): districts that LOWER neighbouring appeal (core/appeal.ts),
        # and the NEIGHBORHOOD column whose housing reads the appeal tier.
        self._appeal_bad_dist = [
            i for i, d in enumerate(self.districts_cat)
            if d.get("id") in ("INDUSTRIAL_ZONE", "ENCAMPMENT")
        ]
        self._nbhd_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "NEIGHBORHOOD"), -1)
        # appealTier thresholds -> Neighborhood housing (real Civ 6, sourced):
        # >=4 Breathtaking 6, >=2 Charming 5, >=-1 Average 4, >=-3 Uninviting 3,
        # else Disgusting 2.
        # #78: bands were OFF BY ONE. Real Civ 6: Breathtaking >=4, Charming
        # 2..3, Average -1..1, Uninviting -3..-2, Disgusting <=-4.
        self._appeal_cuts = [(4, 6), (2, 5), (-1, 4), (-3, 3)]
        self._appeal_floor = 2
        self._encamp_si = next((si for si, (di, _ut, _uc, _plc) in enumerate(self._scaffold) if di == self._encamp_didx), -1)
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
        # B9-R1: the DISTRICT source (src 7) is CATALOG-DRIVEN now — the old
        # hardwired 0.5·adjc was equivalent while every placeable district
        # carried {DISTRICT, 0.5}, but ENTERTAINMENT_COMPLEX (empty adjacency)
        # exposed it: the GPU ranked a district-adjacent tile above the TS
        # lowest-index tie-break (seed 9235 t70, EC@293 vs EC@247).
        self._dyn_district = torch.tensor([_src_amt(d, 7) for d in self.districts_cat], dtype=dtype, device=device)  # [nD] +per adjacent completed district
        self._dyn_bwonder = torch.tensor([_src_amt(d, 5) for d in self.districts_cat], dtype=dtype, device=device)  # [nD] +per adjacent COMPLETED world wonder (B9-R1: Theater Square — matchesAdjacency BUILT_WONDER)
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
            self._gov_encamp = torch.tensor([float(g.get("encampmentProdMult", 1)) for g in _govs], dtype=dtype, device=device)  # [nGov] B9-R1 (no gov carries it today; channel-complete)
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
            # B9-R1: VETERANCY +30% production toward the Encampment district
            # and its buildings — PLAYER queue-head mult (game.ts
            # isEncampmentItem); TS rival accrual is mods-free.
            self._pol_encamp = torch.tensor([float(p.get("encampmentProdMult", 1)) for p in _pols], dtype=dtype, device=device)  # [nPol]
        # A-7r master switch (rules.governmentsLive), mirrored from the TS
        # GOVERNMENTS_ADOPTION_LIVE. Landed inert; gates every gov/policy
        # application + the influence-tier addition so the two engines flip in
        # lockstep. When False the tables load but change nothing (the tables
        # are inert plumbing until the rival-march latent is fixed).
        self._gov_live = bool(getattr(rules, "governments_live", False))
        self._gov_has_effects = self._gov_live and bool(
            (self._ngov and float(self._gov_city_y.abs().sum() + self._gov_cap_y.abs().sum() + self._gov_housing.abs().sum() + (self._gov_ymult - 1).abs().sum() + (self._gov_encamp - 1).abs().sum()) > 0)
            or (self._npol and float(self._pol_city_y.abs().sum() + self._pol_cap_y.abs().sum() + self._pol_housing.abs().sum() + self._pol_hid_house.abs().sum() + (self._pol_encamp - 1).abs().sum()) > 0)
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
        self._trade_intl_gold = int(_tr.get("intlGold", 3))  # B-23 international base gold
        self._trade_duration = int(_tr.get("duration", 20))  # B-23 route lifetime
        self._walls_hp = int(rules.combat.get("wallsHp", 100))
        # B-17 (#71): the ENCAMPMENT garrison pool cap (TS ENCAMPMENT_HP).
        self._encamp_hp_max = int(rules.combat.get("encampHp", 100))
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
        # B7-G (B-8): the Great General/Admiral aura plane cache is keyed on
        # general POSITIONS, which move mid-turn (the rival general walk) and
        # change on spawn/kill/capture — none of which bump _eff_version. This
        # counter bumps at every such site (+restore), so the (turn,_gen_ver)
        # keyed plane cache stays exact within and across turns.
        self._gen_ver = 0
        self._gen_aura_cache = None  # ((turn,_gen_ver), (land [B,O,T], sea [B,O,T]) | None)
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
        self._b_excl_buildings = rules.b_excl_buildings  # B9-R1: exclusive-sibling index lists
        self._b_has_reqs = bool((self._b_req_district >= 0).any()) or any(len(r) > 0 for r in self._b_req_buildings) or any(len(r) > 0 for r in self._b_excl_buildings)
        # B9-R2: regional buildings (Factory/Power Plant/Zoo/Stadium) leave every
        # LOCAL yield/amenity sum; the regional channel delivers them to all
        # same-civ city centers within regional_range of the source district.
        self._b_regional = rules.b_regional.to(device)  # [NB] bool
        self._reg_bidx = [i for i in range(NB) if bool(self._b_regional[i])]
        self._regional_range = int(rules.regional_range)
        self._b_local_f = (~self._b_regional).to(dtype)  # walk-dtype local-building mask
        # B9-R3: worship buildings are faith-purchase-only — every production/
        # gold picker masks them; only the rival A-5 worship faith-buy (and
        # nothing player-side in scripted mode) can set their rc_bldg bits.
        self._b_worship = rules.b_worship.to(device)  # [NB] bool
        self._b_train_xp = rules.b_train_xp.to(device)  # B-17: [NB] long — per-building training XP (best tier over present buildings)
        self._worship_bidx = [int(x) for x in rules.worship_bidx]
        self._temple_bidx = int(rules.temple_bidx)
        self._worship_cost = float(rules.worship_faith_cost)
        self._shrine_bidx = int(rules.shrine_bidx)  # B6-S2: missionary buy gate
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
        self.u_type = torch.zeros(B, U_MAX, dtype=torch.long, device=device)  # barb ladder: 0/1/2/3 melee, 4/5 ranged (#70/S5)
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
        self.p_xp = torch.zeros(B, P_MAX, dtype=torch.long, device=device)  # B-4: combat experience (player units)
        self.p_aura_mp = torch.zeros(B, P_MAX, dtype=torch.long, device=device)  # #70/S3 (B-8): frozen aura +MP (see v_aura_mp)
        self.p_emb = torch.zeros(B, P_MAX, dtype=torch.bool, device=device)  # #45/B-6: embarked (player units)
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
        self._dmg_base = torch.tensor(cb.get("dmgBase", [30.0] * 4001), dtype=torch.float64, device=device)  # B-29: 0.1-granular exp table (B-4: widened to +-200 for XP)
        # AUDIT B-26: the BARBARIAN u_type table (index = the barb ladder slot,
        # NOT rules.units). ROUND B10 widened it to the 4-entry MELEE ladder
        # (0/1/2/3 = WARRIOR/SPEARMAN/PIKEMAN/MUSKETMAN); #70/S5 appends the
        # RANGED pair (4 = ARCHER 15/25·2, 5 = CROSSBOWMAN 15/40·2). The
        # exporter is the source of truth; the tail below only pads a rules.json
        # exported BEFORE S5 so a stale fixture cannot index out of range.
        _uc = list(cb.get("unitCombat", [20, 25, 41, 55]))
        _urs = list(cb.get("unitRangedStrength", []))
        _urr = list(cb.get("unitRangedRange", []))
        _urs += [0] * (len(_uc) - len(_urs))
        _urr += [0] * (len(_uc) - len(_urr))
        for _c, _s, _r in ((15, 25, 2), (15, 40, 2))[max(0, len(_uc) - 4):]:
            _uc.append(_c)
            _urs.append(_s)
            _urr.append(_r)
        self._unit_combat = torch.tensor(_uc, dtype=torch.long, device=device)
        # B-26 (2026-07-27): barb NAVAL flags + the two hull u_types, in the
        # BARB table's own index space (not the roster's).
        _un = rules.combat.get("unitNaval", []) or [0] * len(_uc)
        self._u_naval = torch.tensor(list(_un) + [0] * 8, dtype=torch.bool, device=device)
        _bn = rules.combat.get("barbNavalTypes", []) or []
        self._barb_galley_idx = int(_bn[0]) if len(_bn) > 0 else -1
        self._barb_quad_idx = int(_bn[1]) if len(_bn) > 1 else -1
        # #70/S5 (B-26): barb ranged strength / range, parallel to _unit_combat
        # (0 = melee-only). The u_ twins of _p_rng_str / _p_rng_rng.
        self._u_rng_str = torch.tensor(_urs, dtype=torch.long, device=device)
        self._u_moves = torch.tensor(list(cb.get("unitMoves") or [2, 2, 2, 2, 2, 2, 3]), dtype=torch.long, device=device)  # B-26 (#71)
        self._u_rng_rng = torch.tensor(_urr, dtype=torch.long, device=device)
        # #45/B-6 EMBARK: flat embarked MP, the LIVE war-march water-step master
        # switch (N1 ships it INERT — mirrors TS embarkState.live; poke
        # sim._embark_live=True to exercise the path), and the embark/ocean tech
        # gate indices (military embarks on SHIPBUILDING, civilians on SAILING,
        # OCEAN needs CARTOGRAPHY).
        self._embark_moves = int(cb.get("embarkMoves", 2))
        self._embarked_defense_cs = float(cb.get("embarkedDefenseCs", 10))
        self._embark_live = bool(cb.get("embarkLive", 0))
        self._sailing_tech = int(cb.get("sailingTech", -1))
        self._shipbuilding_tech = int(cb.get("shipbuildingTech", -1))
        self._cartography_tech = int(cb.get("cartographyTech", -1))
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
        # #45/B-6: NAVAL unit flag per roster index (all-false for the current
        # land-only roster; N2 adds GALLEY/QUADRIREME). A naval mover stands on
        # water natively; an embarked LAND mover stands on water via the embark
        # gate. Read at the war-march passability composition.
        self.unit_naval = torch.tensor([bool(u.get("naval", 0)) for u in ru], dtype=torch.bool, device=device)
        self._p_tech = torch.tensor([u["requiresTech"] for u in ru], dtype=torch.long, device=device)
        # B-20 (#79): the Archaeologist's CIVIC gate + its ARTIFACT-slot rule.
        self._p_civic = torch.tensor([u.get("requiresCivic", -1) for u in ru], dtype=torch.long, device=device)
        self._p_needs_slot = torch.tensor([bool(u.get("needsArtifactSlot", 0)) for u in ru], dtype=torch.bool, device=device)
        # AUDIT B-9: per-roster strategic-resource requirement (index into the
        # resource list the tile res_id plane uses; -1 = ungated). _res_unit_pairs
        # caches (unit_idx, res_idx) for the access scan — empty when the roster
        # requires nothing, so _res_avail_mask short-circuits to all-True.
        self._p_res = torch.tensor([int(u.get("requiresResource", -1)) for u in ru], dtype=torch.long, device=device)
        self._res_unit_pairs = [(i, int(u.get("requiresResource", -1))) for i, u in enumerate(ru) if int(u.get("requiresResource", -1)) >= 0]
        self._p_charges = torch.tensor([u.get("charges", 0) for u in ru], dtype=torch.long, device=device)
        # B6-S2: faith-purchase-only roster flag (MISSIONARY) — the
        # trainableUnits filter's mirror; masks the type out of the player
        # purchase path (no actor emits it, the guard is exactness).
        self._p_faith_only = torch.tensor([bool(u.get("fo", 0)) for u in ru], dtype=torch.bool, device=device)
        # B7-G (B-8): spawn-only roster flag (GENERAL/ADMIRAL) — the
        # trainableUnits filter's mirror; masks the type out of production_mask
        # AND the purchase path. Birthed only by the Great-Person claim.
        self._p_spawn_only = torch.tensor([bool(u.get("so", 0)) for u in ru], dtype=torch.bool, device=device)
        self._warrior_idx = next((i for i, u in enumerate(ru) if u["id"] == "WARRIOR"), 0)
        # B-10: SCOUT is a military explorer (combat 10) but NEVER in the rival
        # roster (RIVAL_BUY_UNITS / the ladder exclude it). In the production
        # ladder WARRIOR (combat 20) dominates it, but in the A-5r gold buy the
        # affordability gate can leave SCOUT the only affordable candidate — so
        # it must be masked out of the buy set to mirror TS exactly.
        self._scout_idx = next((i for i, u in enumerate(ru) if u["id"] == "SCOUT"), -1)
        # #45/B-6: the scripted galley-policy build target (the naval MELEE unit,
        # requiresTech SAILING). -1 if the roster has no galley.
        self._galley_idx = next((i for i, u in enumerate(ru) if u["id"] == "GALLEY"), -1)
        # B7-G (B-8): the Great General / Great Admiral chassis. unit_idx = the
        # roster (UNITS) index of the spawned combat-0 civilian; cls = the GP
        # class index whose claim spawns it (-1 = absent). The +5 aura and its
        # 2-tile range are data-driven off the exporter.
        self._general_unit_idx = int(rr.get("generalUnitIdx", -1))
        self._admiral_unit_idx = int(rr.get("admiralUnitIdx", -1))
        self._admiral_march_live = bool(rr.get("admiralMarchLive", False))  # B-8 (#71): inert pending its hunt
        self._general_cls = int(rr.get("generalClassIdx", -1))
        self._admiral_cls = int(rr.get("admiralClassIdx", -1))
        self._gen_aura_cs_val = float(rr.get("generalAuraCs", 5))
        self._gen_aura_range = int(rr.get("generalAuraRange", 2))
        self._gen_aura_mp = int(rr.get("generalAuraMp", 1))  # #70/S3 (B-8): the aura's movement half
        self._gen_off = tiles_within_offsets(self._gen_aura_range).to(device)  # aura disk (hexDistance ≤ range)

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
        self._appeal_cache = None  # A-9 (#71): _tile_appeal, _eff_version-keyed
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
        return {
            "mut": {k: getattr(self, k).clone() for k in _MUTABLE},
            "turn": self.turn,
            "road_bridged": self.road_bridged,  # B-23 (#71): a scalar latch, not a plane
        }

    def restore(self, snap: dict) -> None:
        """Restore a snapshot() in place. Bumps _eff_version + clears the derived
        caches so a later compute recomputes against the restored state."""
        for k, v in snap["mut"].items():
            getattr(self, k).copy_(v)
        self.turn = snap["turn"]
        self.road_bridged = snap.get("road_bridged", False)  # B-23 (#71)
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
        self._gen_ver += 1  # B7-G (B-8): restored unit pools may hold different generals
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
        key = torch.where(avail, eff, torch.tensor(float("inf"), dtype=self.dtype, device=self.device)).double()
        # stable tie-break on index: add a tiny index epsilon. #78: FORCED f64
        # for the same reason as the worked-tile pick — a 1e-6 epsilon is below
        # the f32 ULP of a several-thousand-beaker cost, so on self.dtype=f32 it
        # rounded away and equal-cost techs/civics resolved by argmin's own
        # order instead of table order. f64 lanes are unchanged.
        key = key + torch.arange(key.shape[1], device=self.device, dtype=torch.float64) * 1e-6
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
                # B-27 (#71): the SEASIDE RESORT's gold IS the tile's appeal
                # (real Civ 6), so it cannot come from the static catalog row.
                # Floored at 0 like the TS twin. Cached with the rest on
                # _eff_version — _tile_appeal() is keyed the same way.
                if self.SEASIDE >= 0:
                    sr_live = live_imp & (self.improvement == self.SEASIDE)
                    if bool(sr_live.any()):
                        ty[:, :, 2] = ty[:, :, 2] + (
                            self._tile_appeal().clamp(min=0).to(ty.dtype) * sr_live.to(ty.dtype)
                        )
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
        base = unlocked.unsqueeze(1) & ~self.buildings & (~rd.b_river.view(1, 1, -1) | self.river_center.unsqueeze(2)) & ~self._b_worship.view(1, 1, -1)  # B9-R3: worship is faith-only
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
            for nb, excl in enumerate(self._b_excl_buildings):  # B9-R1: exclusiveWith
                if excl:
                    prereq_ok[:, :, nb] &= ~self.buildings[:, :, excl].any(dim=2)
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
        emult = torch.ones(B, dtype=dt, device=dev)  # B9-R1: encampmentProdMult product (VETERANCY)
        if not self._gov_has_effects or not self._ngov:
            return city_y, cap_y, hous_all, ymult, slotted, emult
        adopted, has_gov = self._adopted_gov(civics2)
        gmask = has_gov.to(dt).unsqueeze(1)
        city_y = city_y + self._gov_city_y[adopted] * gmask
        cap_y = cap_y + self._gov_cap_y[adopted] * gmask
        hous_all = hous_all + self._gov_housing[adopted] * has_gov.to(dt)
        ymult = torch.where(has_gov.unsqueeze(1), self._gov_ymult[adopted], ymult)
        emult = torch.where(has_gov, self._gov_encamp[adopted], emult)
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
            # B9-R1: multiplicative product over slotted cards (TS applyPolicy
            # mods.encampmentProdMult *= fx — only VETERANCY carries it).
            emult = emult * torch.where(slotted, self._pol_encamp.unsqueeze(0).expand(B, -1), torch.ones(B, self._npol, dtype=dt, device=dev)).prod(dim=1)
        return city_y, cap_y, hous_all, ymult, slotted, emult

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
        raw = self.d_static_adj[:, :, di] + self._dyn_district[di] * adjc  # B9-R1: catalog-driven (was hardwired 0.5)
        if float(self._dyn_bwonder[di]) != 0:
            # B9-R1 (Theater Square): +per adjacent COMPLETED world wonder.
            nbw = self.neigh
            nbwc = nbw.clamp(min=0)
            cntw = ((self.built_wonder[:, nbwc] >= 0) & self.built_wonder_complete[:, nbwc] & (nbw >= 0).unsqueeze(0)).sum(dim=2)
            raw = raw + self._dyn_bwonder[di] * cntw.to(self.dtype)
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
            & (self.rc_tile_id == self.rc_id[:, r, j].unsqueeze(1))  # A-24: THIS city's registry, not merely civ-owned (mirrors TS ownsTile === rc.id)
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

    def _place_player_works(self, can_col: torch.Tensor, culture_val: torch.Tensor, kind: int) -> None:
        """B-20 (mirror of placeGreatWorks for the player): distribute gwWorks
        works per earning game across the player's cities in state.cities order
        (city_seq rank), lowest slot first, into the AMPHITHEATER (writing) or
        kind's building column at that kind's slot count. Charges that find no open
        slot anywhere overflow to the person's instant culture lump on the
        current civic. Every slot write bumps _eff_version (yield-bearing)."""
        bcol, nslots, nworks = self._gw_bidx[kind], self._gw_slots_k[kind], self._gw_works_k[kind]
        if bcol < 0:  # building absent from the catalog: every charge overflows
            self.civic_prog = self.civic_prog + can_col.to(self.dtype) * nworks * culture_val
            return
        used = (self.gw_writing, self.gw_art, self.gw_music)[kind]  # [B, C]
        cap = self.buildings[:, :, bcol].long() * nslots  # [B, C] (a city holds 1 such building max)
        # AUDIT #78: plus slots granted by COMPLETED WONDERS (Great Library +2
        # writing), mirroring greatPeople.ts's `extra` resolver. Player wonders
        # have no per-city registry the way rivals do, so they attribute by TILE
        # OWNERSHIP — which is also what makes capture carry them correctly.
        if getattr(self, "_wond_gw", None) is not None and int(self._wond_gw[:, kind].sum()) > 0:
            wsl = self._wond_gw[:, kind]  # [nW]
            live_w = (self.built_wonder >= 0) & self.built_wonder_complete  # [B, T]
            tile_sl = torch.where(live_w, wsl[self.built_wonder.clamp(min=0)], torch.zeros_like(self.built_wonder))
            for c in range(self.C):
                cap[:, c] = cap[:, c] + (tile_sl * (self.owner == c).long()).sum(dim=1)
        openc = (cap - used).clamp(min=0) * self.alive.long()  # [B, C] open slots per live city
        W = nworks * can_col.long()  # [B] works to place this earn
        # state.cities array order = city_seq rank (acquisition order).
        ordv = torch.argsort(torch.where(self.alive, self.city_seq, self.city_seq + 10**6), dim=1, stable=True)
        open_ord = openc.gather(1, ordv)  # [B, C] open slots in visit order
        prefix = open_ord.cumsum(dim=1) - open_ord  # exclusive: slots filled before this city
        alloc_ord = (W.unsqueeze(1) - prefix).clamp(min=0).minimum(open_ord)  # greedy lowest-first fill
        alloc = torch.zeros_like(openc).scatter(1, ordv, alloc_ord)  # back to city index
        overflow = (W - alloc_ord.sum(dim=1)).clamp(min=0)  # [B] charges with no slot
        if kind == 0:
            self.gw_writing = self.gw_writing + alloc
        elif kind == 1:
            self.gw_art = self.gw_art + alloc
        else:
            self.gw_music = self.gw_music + alloc
        self.civic_prog = self.civic_prog + overflow.to(self.dtype) * culture_val
        if bool((alloc != 0).any()):
            self._eff_version += 1

    def _place_rival_works(self, r: int, hit: torch.Tensor, culture_val: torch.Tensor, kind: int) -> None:
        """B-20 (mirror of placeGreatWorks for a rival): distribute gwWorks works
        across rival r's cities in rc slot order (= TS rival.cities array order),
        lowest slot first; overflow charges fall back to the instant culture lump
        on this rival's civic progress. Every slot write bumps _eff_version."""
        bcol, nslots, nworks = self._gw_bidx[kind], self._gw_slots_k[kind], self._gw_works_k[kind]
        if bcol < 0:
            self.r_civic_prog[:, r] = self.r_civic_prog[:, r] + hit.double() * nworks * culture_val
            return
        used = (self.rc_gw_writing, self.rc_gw_art, self.rc_gw_music)[kind][:, r]  # [B, RC]
        cap = self.rc_bldg[:, r, :, bcol].long() * nslots  # [B, RC]
        # AUDIT #78: plus COMPLETED-WONDER slots, the rival twin of the player
        # term and of rivals.ts. Rivals DO carry a per-city wonder registry, so
        # this reads rc_wonder directly instead of going via tile ownership —
        # the same source and completeness test the Petra block uses.
        if getattr(self, "_wond_gw", None) is not None and int(self._wond_gw[:, kind].sum()) > 0:
            wreg = self.rc_wonder[:, r]  # [B, RC, nW]
            compw = (wreg >= 0) & self.built_wonder_complete.gather(
                1, wreg.clamp(min=0).reshape(self.B, -1)
            ).reshape_as(wreg)
            cap = cap + (compw.long() * self._wond_gw[:, kind].view(1, 1, -1)).sum(dim=2)
        openc = (cap - used).clamp(min=0) * self.rc_alive[:, r].long()  # [B, RC]
        W = nworks * hit.long()  # [B]
        prefix = openc.cumsum(dim=1) - openc  # exclusive prefix in slot order
        alloc = (W.unsqueeze(1) - prefix).clamp(min=0).minimum(openc)  # [B, RC]
        overflow = (W - alloc.sum(dim=1)).clamp(min=0)  # [B]
        if kind == 0:
            self.rc_gw_writing[:, r] = self.rc_gw_writing[:, r] + alloc
        elif kind == 1:
            self.rc_gw_art[:, r] = self.rc_gw_art[:, r] + alloc
        else:
            self.rc_gw_music[:, r] = self.rc_gw_music[:, r] + alloc
        self.r_civic_prog[:, r] = self.r_civic_prog[:, r] + overflow.double() * culture_val
        if bool((alloc != 0).any()):
            self._eff_version += 1

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
            has_d = (((self.district == d) & self.district_complete & ~self.district_dead & ~self.district_pillaged).unsqueeze(2) & owner_oh).any(dim=1)  # [B,C] city owns a completed LIVE district d (B-32: pillaged earns no GPP)
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
            # B-20: WRITER/MUSICIAN culture is slotted as Great Works (deferred
            # +2/turn), not applied instantly — mask those columns out of the
            # standard civic add; _place_player_works handles their slot fill +
            # overflow lump below.
            cf_cult = cf.clone()
            for _kcls in self._gw_cls:  # #73: WRITER / ARTIST / MUSICIAN
                if _kcls >= 0:
                    cf_cult[:, _kcls] = 0
            self.tech_prog = self.tech_prog + (eff[:, :, 0] * cf).sum(dim=1)  # science → current tech (banks for next turn)
            self.civic_prog = self.civic_prog + (eff[:, :, 1] * cf_cult).sum(dim=1)  # culture → current civic (W/M slotted)
            self.treasury = self.treasury + (eff[:, :, 2] * cf).sum(dim=1)  # gold → treasury
            if self._gp_effects.shape[2] > 4:  # G-2: faith → player's faith bank (mirrors the rival loop)
                self.player_faith = self.player_faith + (eff[:, :, 4].double() * cf.double()).sum(dim=1)
            prod = (eff[:, :, 3] * cf).sum(dim=1)  # production → capital's current build head
            # #70/S4 (A-9) fallout: applyGreatPersonEffect resolves the capital as
            # `state.cities.find((c) => c.isCapital)` — the FLAG, not the array
            # head. Before palace relocation the flag never left column 0, so
            # column 0 was a safe stand-in; it no longer is (a razed capital
            # leaves column 0 dead while the Palace moves to the highest-pop
            # survivor). Same catch as the scripted production chain below.
            _cap_col = self.is_cap.long().argmax(dim=1)  # [B]; at most one flag
            _cap_live = self.is_cap.any(dim=1) & self.alive.gather(1, _cap_col.unsqueeze(1)).squeeze(1)
            if bool((prod != 0).any()):
                has_build = _cap_live & (self.current.gather(1, _cap_col.unsqueeze(1)).squeeze(1) >= 0)
                if bool(has_build.any()):
                    _hb = has_build.nonzero(as_tuple=True)[0]
                    self.progress[_hb, _cap_col[_hb]] = self.progress[_hb, _cap_col[_hb]] + prod[_hb]
            self.player_gp_points = self.player_gp_points - cost * cf
            self.gp_earned[:, :nCls] = earned + can.long()
            self.era_score[:, 0] += can.long().sum(dim=1) * self._era_pts["gp"]  # B-24: per GP earned
            # B-20: slot the earned WRITER/MUSICIAN's Great Works into the
            # player's cities (eff holds the pre-increment person's culture).
            for _k, _kcls in enumerate(self._gw_cls):  # #73: kind order 0/1/2
                if _kcls >= 0:
                    self._place_player_works(can[:, _kcls], eff[:, _kcls, 1], _k)
            # B7-G (B-8): a GENERAL/ADMIRAL claim spawns its support unit
            # (civilian, 4 MP) at the player CAPITAL, on top of the instant
            # effect — the applyGreatPersonEffect mirror. Zero RNG. #70/S4: the
            # capital is `is_cap`, not column 0 (see above).
            for guidx, gcls in ((self._general_unit_idx, self._general_cls), (self._admiral_unit_idx, self._admiral_cls)):
                if guidx >= 0 and 0 <= gcls < nCls:
                    sm = can[:, gcls] & _cap_live  # TS: spawn only if a capital exists
                    if bool(sm.any()):
                        cap_site = self.site.gather(1, _cap_col.unsqueeze(1)).squeeze(1)
                        self._spawn_player(sm, cap_site, torch.full((B,), guidx, dtype=torch.long, device=dev))
                        self._gen_ver += 1

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
        B, O = self.B, self._O
        # B6-S1 (Itinerant Preachers): per-religion range — base + the
        # religion's claimed enhancer's presR. Player religion 0 keeps base
        # (no GPU player founding path; the TS scripted player never founds).
        RANGE = torch.full((B, O), int(self._pressure_range), dtype=torch.long, device=self.device)
        if self.R > 0 and self._enh_any:
            RANGE[:, 1 : 1 + self.R] += self._enh["presR"][self.r_enhancer + 1].long()
        founded = self.holy_tile >= 0  # [B, O]
        ht = self.holy_tile.clamp(min=0)  # [B, O] valid tile idx (masked where unfounded)
        # --- player cities [B, C] ------------------------------------------
        pc = self.site.clamp(min=0)  # [B, C] center tile (dead slots -> 0, masked out)
        d_pc = self.pair_dist[pc.unsqueeze(2), ht.unsqueeze(1)].to(torch.long)  # [B, C, O]
        add_pc = (d_pc <= RANGE.unsqueeze(1)) & founded.unsqueeze(1) & self.alive.unsqueeze(2)  # [B, C, O]
        self.city_pressure = torch.where(self.alive.unsqueeze(2), self.city_pressure + add_pc.long(), torch.zeros_like(self.city_pressure))
        tot_pc = self.city_pressure.sum(dim=2)
        best_pc = self.city_pressure.argmax(dim=2)  # ties -> lowest id
        # B-24 (#77): EXODUS OF THE EVANGELISTS pays era score each time a city
        # CONVERTS to a civ's religion — the religion's OWNER earns it. Compare
        # against the PRE-flip follow set, exactly like the TS `wasFollowed`.
        _was_pc = self.city_followed.clone()
        self.city_followed = torch.where(self.alive & (tot_pc > 0), best_pc, torch.full_like(best_pc, -1))
        for _g in range(self._O):
            _conv = (self.city_followed == _g) & (_was_pc != _g) & self.alive
            if bool(_conv.any()):
                self._dedication_event(_g, 3, _conv.sum(dim=1))  # #78: per CITY, not per turn
        # --- rival cities [B, r_pad, rc_pad] -------------------------------
        if self.R > 0:
            rcc = self.rc_center.clamp(min=0)  # [B, R, RC]
            d_rc = self.pair_dist[rcc.unsqueeze(3), ht.view(B, 1, 1, O)].to(torch.long)  # [B, R, RC, O]
            add_rc = (d_rc <= RANGE.view(B, 1, 1, O)) & founded.view(B, 1, 1, O) & self.rc_alive.unsqueeze(3)
            self.rc_pressure = torch.where(self.rc_alive.unsqueeze(3), self.rc_pressure + add_rc.long(), torch.zeros_like(self.rc_pressure))
            tot_rc = self.rc_pressure.sum(dim=3)
            best_rc = self.rc_pressure.argmax(dim=3)
            _was_rc = self.rc_followed.clone()
            self.rc_followed = torch.where(self.rc_alive & (tot_rc > 0), best_rc, torch.full_like(best_rc, -1))
            for _g in range(self._O):  # B-24 (#77): EXODUS, the rival-city twin
                _convr = (self.rc_followed == _g) & (_was_rc != _g) & self.rc_alive
                if bool(_convr.any()):
                    self._dedication_event(_g, 3, _convr.reshape(B, -1).sum(dim=1))  # #78: per CITY

    def _rel_combat_planes(self) -> tuple[torch.Tensor, torch.Tensor]:
        """B6-S1: (near3, terr) — [B, O, T] bool planes for the enhancer combat
        adders. terr[b, g, t] = tile t is OWNED by a city following religion g
        (player tiles via the owner slot plane; rival tiles via the A-17
        id-keyed registry). near3[b, g, t] = some city following g has its
        CENTER within justWarRange of t. Keyed (turn, _eff_version):
        followedReligion moves once per turn (_spread_religious_pressure) and
        every city-set/ownership change (founding, capture, transfer, claim,
        compaction) bumps _eff_version — so the keyed cache IS the TS live
        read within a turn."""
        key = (self.turn, self._eff_version)
        if self._rel_planes_cache is not None and self._rel_planes_cache[0] == key:
            return self._rel_planes_cache[1]
        B, T, O = self.B, self.T, self._O
        dev = self.device
        # per-tile followed religion of the OWNING city (-1 none)
        tfol = torch.full((B, T), -1, dtype=torch.long, device=dev)
        pf = self.city_followed.gather(1, self.owner.clamp(min=0))  # [B, T]
        tfol = torch.where((self.owner >= 0) & self.alive.gather(1, self.owner.clamp(min=0)), pf, tfol)
        if self.R > 0:
            for r in range(self.R):
                for j in range(self.RC):
                    if not bool(self.rc_alive[:, r, j].any()):
                        continue
                    ring = (self.rival_at == r) & (self.rc_tile_id == self.rc_id[:, r, j].unsqueeze(1)) & self.rc_alive[:, r, j].unsqueeze(1)
                    tfol = torch.where(ring, self.rc_followed[:, r, j].unsqueeze(1).expand(B, T), tfol)
        terr = tfol.unsqueeze(1) == torch.arange(O, device=dev).view(1, O, 1)  # [B, O, T]
        # near3: dilate FOLLOWING city centers by justWarRange (scatter_add
        # then >0 — a masked bool scatter would clobber tile 0 via the clamp)
        near3 = torch.zeros(B, O, T, dtype=torch.bool, device=dev)
        off3 = tiles_within_offsets(self._just_war_range).to(dev)
        pc_win = tiles_from_offsets(self.site.clamp(min=0).reshape(-1), off3, self.W, self.H).reshape(B, self.C, -1)  # [B, C, M]
        rc_win = None
        if self.R > 0:
            rc_win = tiles_from_offsets(self.rc_center.clamp(min=0).reshape(-1), off3, self.W, self.H).reshape(B, self.R * self.RC, -1)
        for g in range(O):
            srci = torch.zeros(B, T, dtype=torch.long, device=dev)
            fol_c = self.alive & (self.city_followed == g)  # [B, C]
            if bool(fol_c.any()):
                w = torch.where(fol_c.unsqueeze(2), pc_win, torch.full_like(pc_win, -1)).reshape(B, -1)
                srci.scatter_add_(1, w.clamp(min=0), (w >= 0).long())
            if self.R > 0:
                fol_rc = self.rc_alive & (self.rc_followed == g)  # [B, R, RC]
                if bool(fol_rc.any()):
                    wr = torch.where(fol_rc.reshape(B, -1).unsqueeze(2), rc_win, torch.full_like(rc_win, -1)).reshape(B, -1)
                    srci.scatter_add_(1, wr.clamp(min=0), (wr >= 0).long())
            near3[:, g] = srci > 0
        out = (near3, terr)
        self._rel_planes_cache = (key, out)
        return out

    def _rel_atk_cs(self, civ_r: torch.Tensor, battle_tile: torch.Tensor) -> torch.Tensor:
        """B6-S1: enhancer ATTACKER adders (Just War near + Crusade onto
        following-city territory) for units of rival index civ_r ([B], -1 =
        barb/none; GPU player units carry no religion — holy_tile[:, 0] is
        never set in any gate mode, the TS scripted player never founds, so
        the player-side term is structurally 0 and omitted at the call
        sites). Returns f64 [B]."""
        if not self._enh_combat_any or self.R == 0 or not bool((self.r_enhancer >= 0).any()):
            return torch.zeros(self.B, dtype=torch.float64, device=self.device)
        cr = civ_r.clamp(min=0, max=self.R - 1)
        has = (civ_r >= 0) & self.r_religion_done.gather(1, cr.unsqueeze(1)).squeeze(1)
        eidx = self.r_enhancer.gather(1, cr.unsqueeze(1)).squeeze(1) + 1  # [B] 0 = pad
        eidx = torch.where(has, eidx, torch.zeros_like(eidx))
        g = (cr + 1).unsqueeze(1)  # religion id [B, 1]
        near3, terr = self._rel_combat_planes()
        bt = battle_tile.clamp(min=0).unsqueeze(1)
        nr = near3.gather(1, g.unsqueeze(2).expand(-1, -1, self.T)).squeeze(1).gather(1, bt).squeeze(1)
        tr = terr.gather(1, g.unsqueeze(2).expand(-1, -1, self.T)).squeeze(1).gather(1, bt).squeeze(1)
        add = self._enh["cnear"][eidx] * nr.double() + self._enh["cvs"][eidx] * tr.double()
        return torch.where(has & (battle_tile >= 0), add, torch.zeros_like(add))

    def _rel_def_cs(self, civ_r: torch.Tensor, def_tile: torch.Tensor) -> torch.Tensor:
        """B6-S1: enhancer DEFENDER adders (Just War near + Defender of the
        Faith on following-city territory) for unit defenders of rival index
        civ_r ([B], -1 = barb/player/none). f64 [B]."""
        if not self._enh_combat_any or self.R == 0 or not bool((self.r_enhancer >= 0).any()):
            return torch.zeros(self.B, dtype=torch.float64, device=self.device)
        cr = civ_r.clamp(min=0, max=self.R - 1)
        has = (civ_r >= 0) & self.r_religion_done.gather(1, cr.unsqueeze(1)).squeeze(1)
        eidx = self.r_enhancer.gather(1, cr.unsqueeze(1)).squeeze(1) + 1
        eidx = torch.where(has, eidx, torch.zeros_like(eidx))
        g = (cr + 1).unsqueeze(1)
        near3, terr = self._rel_combat_planes()
        bt = def_tile.clamp(min=0).unsqueeze(1)
        nr = near3.gather(1, g.unsqueeze(2).expand(-1, -1, self.T)).squeeze(1).gather(1, bt).squeeze(1)
        tr = terr.gather(1, g.unsqueeze(2).expand(-1, -1, self.T)).squeeze(1).gather(1, bt).squeeze(1)
        add = self._enh["cnear"][eidx] * nr.double() + self._enh["cdef"][eidx] * tr.double()
        return torch.where(has & (def_tile >= 0), add, torch.zeros_like(add))

    def _gen_aura_planes(self):
        """B7-G (B-8): per (batch, unified-civ g, tile) booleans —
        land[b, g, t] = tile t is within gen_aura_range of a LIVE own GENERAL
        of civ g (g=0 player, g=r+1 rival r); sea[b, g, t] the same for
        ADMIRALs. General positions move mid-turn (the rival general walk) and
        change on spawn/kill/capture, none of which bump _eff_version — so the
        keys on (turn, _gen_ver, a general POSITION fingerprint). The fingerprint
        is load-bearing: a general is moved not only by the _gen_ver-bumped
        sites (spawn/rival-walk/kill/capture/restore) but ALSO by the RL/scripted
        MOVE verb in _apply_unit_actions (a random-rollout player steps its own
        general), which does NOT bump _gen_ver — so keying on _gen_ver alone
        went stale mid-apply and mis-placed the aura (rollout hunt, seed 9132
        t155: a player general stepped, the next slot's ranged roll read the
        pre-step plane). The weighted tile/pool/type sum changes on ANY general
        move, kill, capture or spawn, so the cache is exact regardless of the
        mover. Returns None when no General/Admiral is alive anywhere (the common
        case → structural 0; call sites skip the gather). Dilation mirrors
        _rel_combat_planes.near3 (scatter_add of longs then >0)."""
        B, T, O, dev = self.B, self.T, self._O, self.device
        gi, ai = self._general_unit_idx, self._admiral_unit_idx
        p_g = self.p_alive & (self.p_type == gi) if gi >= 0 else torch.zeros(B, P_MAX, dtype=torch.bool, device=dev)
        p_a = self.p_alive & (self.p_type == ai) if ai >= 0 else torch.zeros(B, P_MAX, dtype=torch.bool, device=dev)
        v_g = self.v_alive & (self.v_type == gi) if gi >= 0 else torch.zeros(B, U_MAX, dtype=torch.bool, device=dev)
        v_a = self.v_alive & (self.v_type == ai) if ai >= 0 else torch.zeros(B, U_MAX, dtype=torch.bool, device=dev)
        present = bool(p_g.any()) or bool(p_a.any()) or bool(v_g.any()) or bool(v_a.any())
        if present:
            arp = torch.arange(1, p_g.shape[1] + 1, device=dev)
            arv = torch.arange(1, v_g.shape[1] + 1, device=dev)
            # tile (+1 so tile 0 counts), pool (p vs v via distinct base mults),
            # type (general vs admiral via ×3) and slot — a swap or a same-tile
            # pool transfer (capture) still changes the sum.
            p_fp = int((((self.p_tile + 1) * (1 + 2 * p_a.long()) * arp) * (p_g | p_a).long()).sum())
            v_fp = int((((self.v_tile + 1) * (1 + 2 * v_a.long()) * arv) * (v_g | v_a).long()).sum())
            fp = p_fp * 100003 + v_fp + int((p_g | p_a).sum()) * 31 + int((v_g | v_a).sum())
        else:
            fp = 0
        key = (self.turn, self._gen_ver, fp)
        if self._gen_aura_cache is not None and self._gen_aura_cache[0] == key:
            return self._gen_aura_cache[1]
        if not present:
            self._gen_aura_cache = (key, None)
            return None
        off = self._gen_off
        land = torch.zeros(B, O, T, dtype=torch.bool, device=dev)
        sea = torch.zeros(B, O, T, dtype=torch.bool, device=dev)
        pwin = tiles_from_offsets(self.p_tile.clamp(min=0).reshape(-1), off, self.W, self.H).reshape(B, P_MAX, -1)
        vwin = tiles_from_offsets(self.v_tile.clamp(min=0).reshape(-1), off, self.W, self.H).reshape(B, U_MAX, -1) if self.R > 0 else None

        def dilate(mask: torch.Tensor, win: torch.Tensor) -> torch.Tensor:
            src = torch.zeros(B, T, dtype=torch.long, device=dev)
            w = torch.where(mask.unsqueeze(2), win, torch.full_like(win, -1)).reshape(B, -1)
            src.scatter_add_(1, w.clamp(min=0), (w >= 0).long())
            return src > 0

        if bool(p_g.any()):
            land[:, 0] = dilate(p_g, pwin)
        if bool(p_a.any()):
            sea[:, 0] = dilate(p_a, pwin)
        if self.R > 0:
            for r in range(self.R):
                rg = v_g & (self.v_civ == r)
                ra = v_a & (self.v_civ == r)
                if bool(rg.any()):
                    land[:, r + 1] = dilate(rg, vwin)
                if bool(ra.any()):
                    sea[:, r + 1] = dilate(ra, vwin)
        out = (land, sea)
        self._gen_aura_cache = (key, out)
        return out

    def _gen_aura_hit(self, civ_unified: torch.Tensor, tile: torch.Tensor, naval: torch.Tensor) -> torch.Tensor:
        """#70/S3 (B-8): the RAW aura predicate — bool, shaped like `tile` — for
        a unit of civ `civ_unified` standing on `tile`, ADMIRAL-keyed when
        `naval` (naval|embarked) else GENERAL-keyed. civ_unified: 0 player, r+1
        rival r, -1 none/barb. THE single predicate behind both halves of the
        aura, mirroring TS `aura.inGeneralAura` — `_gen_aura_cs` scales it to
        the +CS adder and the refresh-site snapshot scales it to the +MP one,
        so the two can never drift apart.

        Shape-generic on the trailing dims (leading dim must be B): [B] at the
        combat call sites, [B, P_MAX] / [B, U_MAX] at the pooled snapshot.
        Does NOT screen civilians — callers own that (the combat sites only ever
        ask about a combatant; the snapshot masks on _p_combat > 0)."""
        planes = self._gen_aura_planes()
        if planes is None:
            return torch.zeros_like(tile, dtype=torch.bool)
        land, sea = planes
        valid = (civ_unified >= 0) & (tile >= 0)
        g = civ_unified.clamp(min=0, max=self._O - 1)
        idx = (g * self.T + tile.clamp(min=0)).reshape(self.B, -1)
        land_hit = land.reshape(self.B, -1).gather(1, idx).reshape(tile.shape)
        sea_hit = sea.reshape(self.B, -1).gather(1, idx).reshape(tile.shape)
        return torch.where(naval, sea_hit, land_hit) & valid

    def _gen_aura_cs(self, civ_unified: torch.Tensor, tile: torch.Tensor, naval: torch.Tensor) -> torch.Tensor:
        """B7-G (B-8): the +generalAuraCs adder [B] (dtype) for own military
        near an own GENERAL (land) / ADMIRAL (naval|embarked). civ_unified: 0
        player, r+1 rival r, -1 none/barb. An INTEGER add joining the B-29
        quantized assembly (the JUST_WAR/CRUSADE pattern) — mirrors
        combat.generalAuraCS. #70/S2 (B-8): no longer unit-vs-unit only — the
        aura ALSO joins every unit-vs-CITY roll (rcty/rctyc, csty/cstyc, pcty/
        pctyc, rngcs, vrngc, attacker side) and every CITY-STRIKE roll
        (pcstk/pestk/rcstk/restk, DEFENDER side). Still absent from 'rngrc'
        (player ranged bombardment of a rival city) — TS does not add it
        there. #70/S3: the predicate moved to _gen_aura_hit (shared with the
        +MP half); this is unchanged externally."""
        return self._gen_aura_hit(civ_unified, tile, naval).to(self.dtype) * self._gen_aura_cs_val

    def _refresh_aura_mp(self) -> None:
        """#70/S3 (B-8): FREEZE the aura's +generalAuraMp per unit slot, at the
        refreshUnits moment. TS computes `granted = full + generalAuraMP(state,
        unit)` inside refreshUnits — the TOP of endTurn, before anything moves —
        and spends movesLeft down from that frozen pool all turn. The GPU keeps
        no persistent movesLeft: every walker recomputes `full_mp` from
        `_p_moves[type]` MID-turn, which was safe only while full_mp depended on
        unit TYPE (immutable mid-turn). The aura breaks that — the bonus keys on
        a GENERAL's POSITION and rival generals war-walk during the very phase
        those walkers run (_rival_general_actions), so a recompute could read a
        POST-move general where TS read a PRE-move one (the B7-G stale-plane
        class). Hence the snapshot; the walkers add p_aura_mp / v_aura_mp.

        Barbarians never own a GENERAL/ADMIRAL, so the u_ pool has no plane
        (mirrors p_xp/v_xp). Civilians are screened here (TS inGeneralAura
        returns false at combat <= 0), as are dead slots, so a stale reclaimed
        slot can never leak a bonus. Zero RNG, integer arithmetic."""
        gm = self._gen_aura_mp
        p_ok = self.p_alive & (self._p_combat[self.p_type] > 0)
        p_hit = self._gen_aura_hit(
            torch.zeros_like(self.p_tile),  # the player is civ_unified 0
            self.p_tile,
            self.unit_naval[self.p_type] | self.p_emb,  # ADMIRAL-keyed when naval OR embarked
        )
        self.p_aura_mp = (p_hit & p_ok).long() * gm

    def _refresh_aura_mp_rival(self) -> None:
        """#70/S3: the RIVAL pool freezes at a DIFFERENT moment than the player's
        — the top of `_rival_phase`, not the refreshUnits mirror.

        Why: TS `refreshUnits` does set rival movesLeft at the top of endTurn,
        but `rivalPhase` (rivals.ts) then RE-RESETS every rival unit's pool
        before the rival walkers run. That second reset — not the first — is
        where a rival's real movement budget for the turn is established, so it
        is where TS applies the aura and rewrites `movesFull`. Freezing here
        also lands BEFORE `_rival_general_actions` moves any general, so both
        engines read the same pre-move positions (the whole point of the
        snapshot)."""
        v_ok = self.v_alive & (self._p_combat[self.v_type] > 0)
        v_hit = self._gen_aura_hit(
            self.v_civ + 1,  # rival r is civ_unified r+1
            self.v_tile,
            self.unit_naval[self.v_type] | self.v_emb,
        )
        self.v_aura_mp = (v_hit & v_ok).long() * self._gen_aura_mp

    def _civ_era(self, techs: torch.Tensor, civics: torch.Tensor) -> torch.Tensor:
        """[B] — B-20 (#71): the `civEraIndex` twin. The HIGHEST era among a
        civ's completed techs and civics; 0 (Ancient) when nothing is done."""
        nt = min(techs.shape[1], self._tech_era.numel())
        nc = min(civics.shape[1], self._civic_era.numel())
        e = torch.zeros(techs.shape[0], dtype=torch.long, device=self.device)
        if nt:
            e = torch.maximum(e, (techs[:, :nt].long() * self._tech_era[:nt]).max(dim=1).values)
        if nc:
            e = torch.maximum(e, (civics[:, :nc].long() * self._civic_era[:nc]).max(dim=1).values)
        return e

    def _tourism_of(self, gw_w: torch.Tensor, gw_a: torch.Tensor, gw_m: torch.Tensor, alive: torch.Tensor, own: torch.Tensor, era: torch.Tensor, relics: torch.Tensor | None = None, printing: torch.Tensor | None = None) -> torch.Tensor:
        """[B] — B-20 (#71): a civ's per-turn TOURISM, the `playerTourism` /
        `rivalTourism` twin. Great Works pay the GS values that pair tourism
        with culture; every OWNED unpillaged SEASIDE RESORT pays its tile's
        APPEAL (floored at 0), attributed by tile ownership rather than by
        worked-tile assignment so the seats cannot drift on citizen placement.
        `gw_w`/`gw_m` are the civ's per-city Great Work counts, `alive` the
        matching per-city alive mask, `own` a [B, T] tile-ownership mask."""
        # ALIVE-masked: TS iterates `state.cities` / `rival.cities`, which a
        # captured or razed city has already left. Summing every column would
        # keep paying tourism for a city the civ no longer owns — the exact
        # off-script red this arrived with (seed 9105 t144, +4 = one music
        # work of a lost city).
        # B-20 (#74): PRINTING doubles the WRITING term (tourism only).
        _wmult = self._gw_tour_k[0] * torch.where(
            printing if printing is not None else torch.zeros(self.B, dtype=torch.bool, device=self.device),
            torch.full((self.B,), self._gw_printing_mult, dtype=torch.long, device=self.device),
            torch.ones(self.B, dtype=torch.long, device=self.device),
        )
        t = (
            _wmult * (gw_w * alive.long()).sum(dim=1)
            + self._gw_tour_k[1] * (gw_a * alive.long()).sum(dim=1)
            + self._gw_tour_k[2] * (gw_m * alive.long()).sum(dim=1)
        )
        # B-20 (#73): RELICS pay 8 tourism apiece — the densest source in the
        # game. ALIVE-masked for the same reason the Great Works are.
        if relics is not None:
            t = t + self._relic_tour * (relics * alive.long()).sum(dim=1)
        # WONDERS: base + eras advanced past each wonder's own era.
        w_live = (self.built_wonder >= 0) & self.built_wonder_complete & own
        if bool(w_live.any()):
            w_era = self._wonder_era[self.built_wonder.clamp(min=0, max=max(self._wonder_era.numel() - 1, 0))]
            t = t + (
                (self._wonder_tour_base + (era.unsqueeze(1) - w_era).clamp(min=0)) * w_live.long()
            ).sum(dim=1)
        if self.SEASIDE >= 0:
            live = (self.improvement == self.SEASIDE) & ~self.pillaged & own
            if bool(live.any()):
                t = t + (self._tile_appeal().clamp(min=0) * live.long()).sum(dim=1)
        return t

    def _seaside_ok(self) -> torch.Tensor:
        """[B, T] bool — B-27 (#71): where a SEASIDE RESORT may be built, the
        `validImprovementsIn` arm's twin. Static half from `sr_c` (flat
        Grassland/Plains/Desert beside a COAST tile, unpaved, no resource);
        live feature test = carried none at t0 OR has since been chopped;
        appeal must be BREATHTAKING. The unlock tech and ownership are the
        caller's business, exactly as for farm/mine/lumber."""
        if self.SEASIDE < 0:
            return torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        return (
            self._sr_c
            & (self._sr_nf | self.feat_stripped)
            & (self.improvement < 0)
            & (self.district < 0)
            & (self._tile_appeal() >= self._seaside_min_appeal)
        )

    def _tile_appeal(self) -> torch.Tensor:
        """A-9 (#71): [B, T] tile appeal, the `tileAppeal` (core/appeal.ts)
        mirror. TS sums each NEIGHBOUR's contribution, so build a per-tile
        contribution then gather it over `neigh`.

        `appeal_base` carries the static part (natural wonder +2, mountain +1,
        coast/lake +1) plus the tile's t0 feature term; a chopped tile
        subtracts `appeal_feat` via feat_stripped. The rest is live: a
        COMPLETED built wonder +1, MINE/QUARRY/OIL_WELL -1, and an
        INDUSTRIAL_ZONE or ENCAMPMENT district -1. Version-cached like
        _farmadj_qual — every contributing write already bumps _eff_version."""
        if self._appeal_cache is not None and self._appeal_cache[0] == self._eff_version:
            return self._appeal_cache[1]
        contrib = self.appeal_base - torch.where(self.feat_stripped, self.appeal_feat, torch.zeros_like(self.appeal_feat))
        contrib = contrib + (self.built_wonder_complete & (self.built_wonder >= 0)).long()
        imp = self.improvement
        bad_imp = torch.zeros_like(contrib, dtype=torch.bool)
        for _i in (self.MINE, self.QUARRY, self.OIL_WELL):
            if _i >= 0:
                bad_imp |= imp == _i
        contrib = contrib - bad_imp.long()
        if self._appeal_bad_dist:
            bad_d = torch.zeros_like(contrib, dtype=torch.bool)
            for _d in self._appeal_bad_dist:
                bad_d |= self.district == _d
            contrib = contrib - bad_d.long()
        # #78: "-1 each adjacent pillaged tile" — dynamic, so it joins contrib
        # rather than the exported static plane.
        contrib = contrib - self.pillaged.long()
        nb = self.neigh
        nbc = nb.clamp(min=0)
        out = (contrib[:, nbc] * (nb >= 0).unsqueeze(0).long()).sum(dim=2)  # [B, T]
        # #78: the ON-TILE terms (mountain +4, river/lake +1) are the tile's
        # OWN appeal, not a neighbour contribution, so they are added AFTER the
        # gather. Mirrors the two leading lines of tileAppeal in core/appeal.ts.
        out = out + self.appeal_self
        # #78: wonder/mountain tiles ignore every term above — fixed 5 and 4.
        out = torch.where(self.appeal_over > -999, self.appeal_over, out)
        self._appeal_cache = (self._eff_version, out)
        return out

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

    def _pillaged_bf_live(self, bf: torch.Tensor, tcf: torch.Tensor, tiles: torch.Tensor, slot_ids: torch.Tensor, M: int) -> torch.Tensor:
        """B-32: bf ([B,C,NB] building presence) with every building in a
        COMPLETE-but-PILLAGED district zeroed (its yields/housing/amenities go
        dark). CITY_CENTER buildings (_b_req_district == -1) never gate — the
        city center is unpillageable. Mirrors TS pillagedDistrictTypes +
        cityBuildingYields/computeHousing/localBuildingAmenities."""
        if not self.districts_on:
            return bf
        B, C, dev = self.B, self.C, self.device
        nD = len(self.districts_cat)
        dt_win = self.district.gather(1, tcf).reshape(B, C, M)
        pil_win = (
            (tiles >= 0)
            & (self.owner.gather(1, tcf).reshape(B, C, M) == slot_ids)
            & self.district_complete.gather(1, tcf).reshape(B, C, M)
            & ~self.district_dead.gather(1, tcf).reshape(B, C, M)
            & self.district_pillaged.gather(1, tcf).reshape(B, C, M)
            & (dt_win >= 0)
        )  # [B, C, M] owned completed pillaged districts
        dt_oh = torch.nn.functional.one_hot(dt_win.clamp(min=0), nD).bool() & pil_win.unsqueeze(3)  # [B,C,M,nD]
        pil_dtype = dt_oh.any(dim=2)  # [B, C, nD] this city holds a pillaged district of type di
        breq = self._b_req_district  # [NB] building's district idx (-1 = CITY_CENTER)
        bdark = pil_dtype.gather(2, breq.clamp(min=0).view(1, 1, -1).expand(B, C, -1)) & (breq >= 0).view(1, 1, -1)  # [B,C,NB]
        return bf * (~bdark).to(self.dtype)

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
        # #78: the tie-break runs in FORCED f64, like the rival twin
        # (_rival_city_yields_all builds its key with an explicit .double()).
        # Riding self.dtype silently BROKE this in the f32 lanes: an index
        # epsilon of 1e-9 is far below the f32 ULP of a score around 40
        # (~4e-6), so it rounded away completely and topk resolved exact ties
        # by its own unspecified order — picking the HIGHEST index where TS
        # (city.ts, `b.score - a.score || a.index - b.index`) takes the
        # lowest. f64 lanes are arithmetically unchanged by this (.double()
        # is a no-op on an f64 tensor), so no gate number moves; the f32 RL
        # path (eval.py / behavior_probe.py / gen_targets.py / duel_eval.py)
        # stops working different tiles than the spec.
        score = torch.where(cand, tile_score.gather(1, tcf).reshape(B, C, M).double(), torch.tensor(-1e18, dtype=torch.float64, device=dev))
        score = score - tc.double() * 1e-9  # tie: lowest index first
        self._tiebreak_key_dtype = score.dtype  # #78: what the poke lane asserts
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

        # AUDIT #78 — WATER MILL: "Bonus resources improved by Farms gain +1
        # Food each" (Gathering Storm Civilopedia). POST-selection over the
        # worked set, exactly like the Petra and farm-adjacency terms above,
        # mirroring city.ts's waterMillBonus. Modelled GENERALLY (bonus
        # category + the resource's own required improvement is FARM) rather
        # than as a named rice/wheat pair, so a third farm bonus resource picks
        # it up automatically. The city CENTER never qualifies — it carries no
        # improvement — which is why it needs no separate term here.
        wm_city = self.buildings[:, :, rd.b_farmbonus]  # [B, C, n] -> any()
        if wm_city.numel() and bool(wm_city.any()):
            has_wm = wm_city.any(dim=2)  # [B, C]
            elig = (
                (self.improvement == self.FARM)
                & (self.res_cat == 1)  # bonus category
                & (self.res_imp == self.FARM)  # ...whose improvement IS the farm
            )  # [B, T]
            wm_w = (elig.unsqueeze(1).expand(B, C, T).gather(2, top_tile) & take).to(self.dtype).sum(dim=2)
            worked_y[:, :, 0] = worked_y[:, :, 0] + wm_w * has_wm.to(self.dtype)

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
            bf_live = cc["bf_live"]  # B-32
        else:
            bf = self.buildings.to(self.dtype)
            # B-32: buildings in a COMPLETE-but-PILLAGED district go dark
            # (yields/housing/amenities). Keyed on _eff_version (pillage/repair
            # bumps it), so caching bf_live is safe — the follower terms below
            # read it on every call (city religion can change without a bump,
            # but the pillage mask cannot).
            bf_live = self._pillaged_bf_live(bf, tcf, tiles, slot_ids, M)
            # B9-R2: regional buildings leave every LOCAL sum fed by bf_live
            # (yields/amenities; their housing is 0 and no belief row targets
            # them, so the wholesale mask mirrors cityBuildingYields' /
            # localBuildingAmenities' `if (def.regional) continue`). The
            # regional channel below delivers them by range; maintenance
            # stays on the unmasked bf (cityMaintenance has no regional skip).
            bf_live = bf_live * self._b_local_f.view(1, 1, -1)
            b_y = torch.einsum("bcn,nk->bck", bf_live, rd.b_yields)
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
            _fol_by = torch.einsum("bcn,bcnk->bck", bf_live, self._fol_tab("bldgY", _pcfol).to(self.dtype))  # B-32: dark buildings
            total = total + _fol_by
        reg_y = reg_am = None  # B9-R2 (set by the districts_on block; regional buildings need a district)
        if self.districts_on:
            if cc is not None:
                # D-10: the whole block is pop-free — replay the cached per-
                # district addends in catalog order (same adds, same
                # association as the miss path below).
                d_addends = cc["d_addends"]
                cs_city6 = cc["cs_city6"]  # B9-R1
                ship_add = cc["ship_add"]
                d_maint = cc["d_maint"]
                has_aq = cc["has_aq"]
                dcount_all = cc["dcount_all"]  # #46r: INSULAE's housingIfDistricts
                spec_count = cc["spec_count"]  # B-18: Zen Meditation specialty count
                hs_adj = cc["hs_adj"]  # B-18: Holy Site adjacency (follower Work Ethic)
                reg_y = cc["reg_y"]  # B9-R2: regional-building yields [B, C, 6] | None
                reg_am = cc["reg_am"]  # B9-R2: regional-building amenities [B, C] | None
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
                # B-32: FUNCTIONAL districts (contribute adjacency / CS-envoy /
                # Aqueduct-housing / Shipyard) exclude the PILLAGED ones; the
                # COUNT-based static consumers below (dcount_all / spec_count /
                # d_maint) keep the un-gated owned_d — "pillaged is still owned".
                owned_d_live = owned_d & ~self.district_pillaged.gather(1, tcf).reshape(B, C, M)
                # #46r: per-city COMPLETED live district count (ALL types —
                # computeHousing's completedDistrictCount(state, city, false))
                dcount_all = owned_d.to(torch.long).sum(dim=2)  # [B, C]
                # B-18: per-city COMPLETED specialty district count (Zen Meditation min).
                spec_count = (owned_d & self._is_specialty[dt.clamp(min=0)]).to(torch.long).sum(dim=2)  # [B, C]
                # B-21: City-state envoy bonus re-keyed to BUILDINGS
                # (csEnvoyBonuses): a CS at >=3 envoys grants +districtBonus in
                # its TYPE channel (CS_TYPE_YIELD) to every city holding the
                # type's TIER-1 building; at >=6, again on the TIER-2 building
                # (real Civ 6: the bonus lands on the district's buildings, not
                # the bare district). Routed through bf_live — the pillaged-dark
                # + regional-masked building presence (the _fol_by/beliefAdd
                # vehicle) — so pillage/regional-skip match TS cityBuildingYields
                # exactly. Scatter per (building, channel), pre-amenity-factor.
                nBc = self.buildings.shape[2]
                cs_city6 = torch.zeros(B, C, 6, dtype=self.dtype, device=dev)
                if self.S > 0:
                    _acs = self.cs_alive.to(self.dtype)  # [B, S]
                    per3 = (self.cs_envoys >= 3).to(self.dtype) * self._cs_district_bonus * _acs * (self._cs_b1idx >= 0).to(self.dtype)
                    per6 = (self.cs_envoys >= 6).to(self.dtype) * self._cs_district_bonus * _acs * (self._cs_b2idx >= 0).to(self.dtype)
                    cs_bld6f = torch.zeros(B, nBc * 6, dtype=self.dtype, device=dev)
                    cs_bld6f.scatter_add_(1, self._cs_b1idx.clamp(min=0) * 6 + self._cs_yidx, per3)
                    cs_bld6f.scatter_add_(1, self._cs_b2idx.clamp(min=0) * 6 + self._cs_yidx, per6)
                    cs_bld6 = cs_bld6f.view(B, nBc, 6)
                    cs_city6 = torch.einsum("bcn,bnk->bck", bf_live, cs_bld6)  # [B, C, 6] — pillaged/regional dark via bf_live
                # For each PLACED district with an adjacencyYield: floor(static +
                # 0.5*adjacent-districts) into its yield column. Type-specific dynamic
                # sources (mine/quarry for IZ, city-center for Harbor, built-wonder
                # for Theater) are added when those types are placed (D3b-4+).
                # D-10: the two addends per district are built as a list and
                # applied below — total + adjSum + csTerm, the original
                # left-to-right association, cache hit or miss.
                d_addends = []
                hs_adj = None  # B-18: Holy Site floored adjacency (follower Work Ethic)
                # (B-21: cs_city6 is now BUILDING-keyed, computed above via
                # bf_live — no longer accumulated per district here.)
                for d in self.districts_cat:
                    di = int(d["idx"])
                    mask = owned_d_live & (dt == di)  # B-32: pillaged = dark (adjacency)
                    yc = int(d.get("adjYield", -1))
                    if yc < 0:
                        continue
                    adjv = self._district_adj_floor(di)  # [B, T] full districtAdjacency (G5 memo)
                    _adj_sum = (adjv.gather(1, tcf).reshape(B, C, M) * mask.to(self.dtype)).sum(dim=2)  # [B, C]
                    d_addends.append((yc, _adj_sum))
                    if di == self._hs_idx:
                        hs_adj = _adj_sum
                # SHIPYARD special (yields.ts:171): a city holding a Shipyard adds its completed
                # Harbor's full districtAdjacency as PRODUCTION — the SAME value that fed the Harbor's
                # gold above, re-read here as production, pre-amenity-factor like every district yield.
                ship_add = None
                if self._harbor_idx >= 0 and self._shipyard_bidx >= 0:
                    _hm = (owned_d_live & (dt == self._harbor_idx)).to(self.dtype)  # [B, C, M] this city's LIVE Harbor tiles (B-32)
                    _hadj = self._district_adj_floor(self._harbor_idx)  # [B, T] (G5 memo)
                    _hadj_c = (_hadj.gather(1, tcf).reshape(B, C, M) * _hm).sum(dim=2)  # [B, C]
                    ship_add = _hadj_c * self.buildings[:, :, self._shipyard_bidx].to(self.dtype)
                # districtMaintenance: per-type upkeep (0 for City Center / Neighborhood
                # / Aqueduct, else 1); sum over the city's owned completed districts.
                d_maint = (self._d_maint[dt.clamp(min=0)] * (owned_d & (dt >= 0)).to(self.dtype)).sum(dim=2)
                # Aqueduct ownership feeds computeHousing below (D-10: hoisted
                # into the cacheable block — owned_d/dt live only on this path)
                has_aq = (owned_d_live & (dt == self._aqueduct_idx)).any(dim=2) if self._aqueduct_idx >= 0 else None  # B-32: pillaged Aqueduct gives no housing
                # B9-R2: regional buildings (regionalEffects, yields.ts:215) —
                # a regional building on a COMPLETE unpillaged (live) source
                # district reaches EVERY player city center within
                # regional_range; dedup by building id (any() over sources).
                # Pop-free + every input bumps _eff_version => cacheable.
                reg_y = reg_am = None
                if self._reg_bidx:
                    _sitec_r = self.site.clamp(min=0)  # [B, C] receiver centers
                    for _n in self._reg_bidx:
                        _own_n = self.buildings[:, :, _n] & self.alive  # [B, C] source cities (state.cities = live only)
                        if not bool(_own_n.any()):
                            continue
                        _msrc = _own_n.unsqueeze(2) & owned_d_live & (dt == int(self._b_req_district[_n]))  # [B, C, M]
                        _st = torch.where(_msrc, tiles, torch.full_like(tiles, -1)).max(dim=2).values  # [B, C] source tile (-1 none)
                        if not bool((_st >= 0).any()):
                            continue
                        _ddp = self.pair_dist[_st.clamp(min=0).unsqueeze(2), _sitec_r.unsqueeze(1)]  # [B, Csrc, Crecv] int16
                        _has = ((_st >= 0).unsqueeze(2) & (_ddp <= self._regional_range)).any(dim=1) & self.alive  # [B, C recv]
                        _hf = _has.to(self.dtype)
                        if reg_y is None:
                            reg_y = torch.zeros(B, C, 6, dtype=self.dtype, device=dev)
                            reg_am = torch.zeros(B, C, dtype=self.dtype, device=dev)
                        reg_y = reg_y + _hf.unsqueeze(2) * rd.b_yields[_n].view(1, 1, 6)
                        reg_am = reg_am + _hf * rd.b_amenities[_n]
            for yc_a, adj_add in d_addends:
                total[:, :, yc_a] = total[:, :, yc_a] + adj_add
            total = total + cs_city6  # B9-R1: CS envoy district adds (channel columns, all types)
            if reg_y is not None:
                total = total + reg_y  # B9-R2: regional-building yields (pre-tier, the buildings position)
            # B-18: follower Work Ethic — Holy Site floored adjacency ALSO yields
            # production (yields.ts:154), keyed on each city's followed religion.
            if _pcfol is not None and hs_adj is not None:
                total[:, :, 1] = total[:, :, 1] + hs_adj * self._fol_tab("we", _pcfol).to(self.dtype)
            if ship_add is not None:
                total[:, :, 1] = total[:, :, 1] + ship_add
        popf = self.pop.to(self.dtype)
        total[:, :, 3] += popf * r.citizen_science
        total[:, :, 4] += popf * r.citizen_culture
        # B-20: slotted Great Works — culture/turn per work BY KIND (#70/S1:
        # writing 2, music 4), a building-tier yield (pre-amenity-factor, so it
        # rides yield_f and the government yieldMult below, the city.ts
        # buildings-bucket position). Pop-free and version-keyed (every gw write
        # bumps _eff_version), so an unconditional add each call reproduces
        # exactly like the popf terms. Association mirrors greatWorkCulture:
        # culture += (writingTerm + musicTerm).
        total[:, :, 4] += (
            self._gw_cul_k[0] * self.gw_writing.to(self.dtype)
            + self._gw_cul_k[1] * self.gw_art.to(self.dtype)
            + self._gw_cul_k[2] * self.gw_music.to(self.dtype)
        )
        # B-20 (#73): RELICS pay FAITH in the SAME buildings bucket and at the
        # same position (city.ts: buildings.faith += relicFaith right after
        # buildings.culture += greatWorkCulture).
        total[:, :, 5] += self._relic_faith * self.relics.to(self.dtype)

        # City-state envoy bonuses land on the capital (mods.capitalYields),
        # summed before the amenity multiplier like every other bonus.
        if self.S > 0:
            tier1 = ((self.cs_envoys >= 1) & self.cs_alive).to(self.dtype) * self.rules.cs.get("capitalBonus", 2)
            cap_bonus = torch.zeros(B, 6, dtype=self.dtype, device=dev)
            cap_bonus.scatter_add_(1, self._cs_yidx, tier1)
            # #70/S4 (A-9): key on the CAPITAL FLAG, not column 0. TS applies
            # mods.capitalYields via `if (city.isCapital)`, and A-9 palace
            # relocation means the capital is no longer always column 0. The
            # old `total[:, 0, :] +=` was a dormant column-0 assumption: it
            # agreed with TS only because a fallen capital left TS with NO
            # capital while the GPU added to a dead column (both ~nothing).
            # Once the Palace re-crowns a survivor the two diverge — gate-caught
            # on seed 9183 t219 (score 171400 vs 161725, 3 CS at 4/4/4 envoys).
            # Adding 0.0 to non-capital columns is exact, so this is
            # association-safe. The government/policy capitalYields term below
            # already did it correctly with is_cap.
            _cap_m = self.is_cap.to(self.dtype).unsqueeze(2)  # [B, C, 1]
            total += cap_bonus.unsqueeze(1) * _cap_m
            # B-21: the suzerain's per-CS unique perk — a flat +suzerainYield in
            # the CS's live channel (cs_suz_key, -1 = descoped) to whichever seat
            # holds the STRICT suzerain contest (csSuzerainCapitalBonus). Player
            # seat here — the isSuzerain twin (>= suz_min, strictly > every rival).
            suz_min = int(self.rules.cs.get("suzerainEnvoys", 3))
            p_suz = (self.cs_envoys >= suz_min) & self.cs_alive
            if self.R > 0:
                p_suz = p_suz & (self.cs_envoys > self.cs_r_envoys.max(dim=1).values)
            suz_val = p_suz.to(self.dtype) * self._cs_suz_amt * (self.cs_suz_key >= 0).to(self.dtype)  # [B, S]
            suz_bonus = torch.zeros(B, 6, dtype=self.dtype, device=dev)
            suz_bonus.scatter_add_(1, self.cs_suz_key.clamp(min=0), suz_val)
            total += suz_bonus.unsqueeze(1) * _cap_m  # #70/S4: capital FLAG, not column 0

        # A-7r: the player's adopted government + slotted policies — cityYields
        # to every city, capitalYields to the capital (computeCityStats'
        # `bonuses`, city.ts:445-447), summed pre-amenity-factor. Food (col 0)
        # is left unscaled by the amenity factor below, matching TS.
        if self._gov_has_effects:
            gpc_city, gpc_cap, gpc_hous, gpc_ymult, gpc_slotted, _gpc_emult = self._gov_policy_mods_cached("p", self.civics)
            total += gpc_city.unsqueeze(1)
            total += gpc_cap.unsqueeze(1) * self.is_cap.to(self.dtype).unsqueeze(2)
        else:
            gpc_hous = gpc_ymult = gpc_slotted = None

        amen_b = cc["amen_b"] if cc is not None else torch.einsum("bcn,n->bc", bf_live, rd.b_amenities)  # D-10 (B-32: bf_live)
        amen_have = self.is_cap.to(self.dtype) * self._palace_amenities + amen_b
        # B9-R2: regional amenities join BEFORE the luxury ranking — the
        # city.ts:292 baseHave (localBuildingAmenities + regional.amenities).
        if reg_am is not None:
            amen_have = amen_have + reg_am
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
        house_b = cc["house_b"] if cc is not None else torch.einsum("bcn,n->bc", bf_live, rd.b_housing)  # D-10 (B-32: bf_live)
        housing = water_h + self.is_cap.to(self.dtype) * self._palace_housing + house_b
        # A-9 (#71): NEIGHBORHOOD housing is APPEAL-based, so it cannot ride the
        # flat b_housing/district table (its catalog row is housing: 0). TS:
        # `total += appealTier(tileAppeal(map, dt)).housing` per COMPLETE
        # unpillaged Neighborhood the city owns (computeHousing, city.ts).
        if self._nbhd_didx >= 0:
            _ap = self._tile_appeal()
            _hv = torch.full_like(_ap, self._appeal_floor)
            for _cut, _val in sorted(self._appeal_cuts):  # ascending: higher tiers overwrite
                _hv = torch.where(_ap >= _cut, torch.full_like(_ap, _val), _hv)
            _nb_ok = (self.district == self._nbhd_didx) & self.district_complete & ~self.district_pillaged
            _own = self.owner
            _src = (_hv * _nb_ok.long()).to(self.dtype) * (_own >= 0).to(self.dtype)
            _nb_h = torch.zeros_like(housing)
            _nb_h.scatter_add_(1, _own.clamp(min=0), _src)
            housing = housing + _nb_h
        # B-18: follower Religious Community — +housing on Shrines/Temples
        # (computeHousing beliefHousing), keyed per-city on the followed religion.
        if _pcfol is not None:
            housing = housing + torch.einsum("bcn,bcn->bc", bf_live, self._fol_tab("bldgH", _pcfol).to(self.dtype))  # B-32: dark buildings
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
            store = {"b_y": b_y, "amen_b": amen_b, "maint_b": maint_b, "house_b": house_b, "bf_live": bf_live}  # B-32
            if self.districts_on:
                store["d_addends"] = d_addends
                store["cs_city6"] = cs_city6  # B9-R1
                store["ship_add"] = ship_add
                store["d_maint"] = d_maint
                store["has_aq"] = has_aq
                store["dcount_all"] = dcount_all  # #46r
                store["spec_count"] = spec_count  # B-18 Zen Meditation
                store["hs_adj"] = hs_adj  # B-18 follower Work Ethic
                store["reg_y"] = reg_y  # B9-R2 regional yields (None until one exists)
                store["reg_am"] = reg_am  # B9-R2 regional amenities
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
            # AUDIT A-23 (2026-07-27): PER-CITY, not civ-level — the A-17
            # registry entry must be THIS city, mirroring the player's
            # `t.cityId === city.id`. Without it two adjacent rival cities
            # both worked the same civ tile.
            & (gat(self.rc_tile_id) == self.rc_id[:, r].unsqueeze(2))
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
        # A-22: the batched twin of the specialist merge — same predicate,
        # applied per city column so the two paths cannot drift.
        _ns_all = torch.zeros(B, RC, dtype=torch.long, device=self.device)
        _sa_all = torch.zeros(B, RC, 6, dtype=torch.float64, device=self.device)
        for _j in range(RC):
            _n1, _a1 = self._rc_specialists(r, _j, top_vals[:, _j], self.rc_pop[:, r, _j])
            _ns_all[:, _j] = _n1
            _sa_all[:, _j] = _a1
        take = (
            torch.arange(M, device=self.device).view(1, 1, M)
            < (self.rc_pop[:, r] - _ns_all).clamp(min=0).unsqueeze(2)
        ) & (top_vals > -1e17)
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
            food = cf + f_sel.sum(dim=2) + _sa_all[:, :, 0]
            prod = cp + p_sel.sum(dim=2) + _sa_all[:, :, 1]
            sci = c_sc + sc_sel.sum(dim=2) + _sa_all[:, :, 3]
            cul = c_cu + cu_sel.sum(dim=2) + _sa_all[:, :, 4]
            gold = c_go + go_sel.sum(dim=2) + _sa_all[:, :, 2]  # VP-G1
            faith = c_fa + fa_sel.sum(dim=2) + _sa_all[:, :, 5]  # GV-1a
        else:
            food = cf + _sa_all[:, :, 0]
            prod = cp + _sa_all[:, :, 1]
            sci = c_sc + _sa_all[:, :, 3]
            gold = c_go + _sa_all[:, :, 2]  # VP-G1
            faith = c_fa + _sa_all[:, :, 5]  # GV-1a
            cul = c_cu + _sa_all[:, :, 4]
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
        # AUDIT #78 — WATER MILL, rival twin of the player term and of
        # rivals.ts: farm-improved BONUS resources gain +1 food, POST-selection
        # over the worked set like Petra above.
        wm_r = self.rc_bldg[:, r][:, :, rd.b_farmbonus]  # [B, RC, n]
        if wm_r.numel() and bool(wm_r.any()):
            has_wm = wm_r.any(dim=2)  # [B, RC]
            sel_t = tc3.gather(2, top_idx).reshape(B, RC * M)
            elig = (
                (self.improvement.gather(1, sel_t) == self.FARM)
                & (self.res_cat.gather(1, sel_t) == 1)
                & (self.res_imp.gather(1, sel_t) == self.FARM)
            ).reshape(B, RC, M) & take
            food = food + (elig & has_wm.unsqueeze(2)).sum(dim=2).double()
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
                    has = has & ~self.district_pillaged.gather(1, tile_d.clamp(min=0))  # B-32: pillaged = dark
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
            selb = self.rc_bldg[:, r] & ~self._rc_bdark(self.rc_dist_tile[:, r]) & ~self._b_regional.view(1, 1, -1)  # [B, RC, NB] (B-32 dark; B9-R2 regional by range)
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
        # B9-R3: PALACE on the capital slot — the per-j twin's add, j-batched.
        _isc_palA = (self.rc_is_cap[:, r] & alive).double()  # [B, RC]
        if bool((_isc_palA != 0).any()):
            _pal6A = self._palace_y.double()
            food = food + _pal6A[0] * _isc_palA
            prod = prod + _pal6A[1] * _isc_palA
            gold = gold + _pal6A[2] * _isc_palA
            sci = sci + _pal6A[3] * _isc_palA
            cul = cul + _pal6A[4] * _isc_palA
            faith = faith + _pal6A[5] * _isc_palA
        # B9-R2: regional-building yields, j-batched — state is frozen here
        # (post-step), so ONE _rival_regional serves every receiver (the per-j
        # calls return this same value each time). Integer f64: batching exact.
        _regional_all = self._rival_regional(r)
        if _regional_all is not None:
            _ra = _regional_all[0]  # [B, RC, 6]
            food = food + _ra[:, :, 0]
            prod = prod + _ra[:, :, 1]
            gold = gold + _ra[:, :, 2]
            sci = sci + _ra[:, :, 3]
            cul = cul + _ra[:, :, 4]
            faith = faith + _ra[:, :, 5]
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
        # A-12/B-21: CS envoy bonuses, j-batched — the 3/6 tiers now land on the
        # rival's tier-1 (>=3) / tier-2 (>=6) BUILDINGS (csRivalEnvoyBonuses
        # re-key), the capital yield at 1+ envoys, and (B-21) the suzerain's
        # per-CS unique perk. Integer-valued adds in f64: batching is exact.
        if self.S > 0 and bool((self.cs_r_envoys[:, r] > 0).any()):
            _acs = self.cs_alive.double()
            _isc = (self.rc_is_cap[:, r] & alive).double()  # [B, RC]
            # B-21: 3/6-envoy BUILDING adds — selb is the rc_bldg presence with
            # pillaged-dark + regional-skip (the b_yields twin at line ~3294), so
            # pillage/regional match TS cityBuildingYields exactly.
            _cols6 = None
            if self.districts_on:
                selb_cs = self.rc_bldg[:, r] & ~self._rc_bdark(self.rc_dist_tile[:, r]) & ~self._b_regional.view(1, 1, -1)  # [B, RC, NB]
                if bool(selb_cs.any()):
                    _nBc = selb_cs.shape[2]
                    per3 = (self.cs_r_envoys[:, r] >= 3).double() * self._cs_district_bonus * _acs * (self._cs_b1idx >= 0).double()
                    per6 = (self.cs_r_envoys[:, r] >= 6).double() * self._cs_district_bonus * _acs * (self._cs_b2idx >= 0).double()
                    csb6f = torch.zeros(B, _nBc * 6, dtype=torch.float64, device=self.device)
                    csb6f.scatter_add_(1, self._cs_b1idx.clamp(min=0) * 6 + self._cs_yidx, per3)
                    csb6f.scatter_add_(1, self._cs_b2idx.clamp(min=0) * 6 + self._cs_yidx, per6)
                    csb6 = csb6f.view(B, _nBc, 6)
                    _cs6_all = torch.einsum("bjn,bnk->bjk", selb_cs.double(), csb6)  # [B, RC, 6]
                    _cols6 = [_cs6_all[:, :, _k] for _k in range(6)]
            tier1_r = ((self.cs_r_envoys[:, r] >= 1) & self.cs_alive).double() * float(self.rules.cs.get("capitalBonus", 2))
            capb_r = torch.zeros(B, 6, dtype=torch.float64, device=self.device)
            capb_r.scatter_add_(1, self._cs_yidx, tier1_r)
            # B-21: suzerain unique perk — this rival's STRICT isSuzerain
            # (rivalIsSuzerain: >= suz_min, > player, > every other rival).
            suz_min = int(self.rules.cs.get("suzerainEnvoys", 3))
            _oth = self.cs_r_envoys.clone()
            _oth[:, r] = -1
            r_suz = (self.cs_r_envoys[:, r] >= suz_min) & (self.cs_r_envoys[:, r] > self.cs_envoys) & (self.cs_r_envoys[:, r] > _oth.max(dim=1).values) & self.cs_alive
            suz_valr = r_suz.double() * self._cs_suz_amt * (self.cs_suz_key >= 0).double()  # [B, S]
            capb_r.scatter_add_(1, self.cs_suz_key.clamp(min=0), suz_valr)
            if _cols6 is not None:
                food = food + _cols6[0]
                prod = prod + _cols6[1]
                gold = gold + _cols6[2]
                sci = sci + _cols6[3]
                cul = cul + _cols6[4]
                faith = faith + _cols6[5]
            food = food + capb_r[:, 0].unsqueeze(1) * _isc
            prod = prod + capb_r[:, 1].unsqueeze(1) * _isc
            gold = gold + capb_r[:, 2].unsqueeze(1) * _isc
            sci = sci + capb_r[:, 3].unsqueeze(1) * _isc
            cul = cul + capb_r[:, 4].unsqueeze(1) * _isc
            faith = faith + capb_r[:, 5].unsqueeze(1) * _isc
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
        # B-20: slotted Great Works — culture/turn per work BY KIND (#70/S1:
        # writing 2, music 4), the buildings-tier position (pre-tier, so it
        # rides yf below like TS's total.culture in rivalCityYields). Gated by
        # alive; dead slots reset. The .double() PRECEDES the scalar multiply —
        # a python float times a long tensor promotes to the DEFAULT dtype, not
        # f64. Association mirrors greatWorkCulture.
        cul = cul + (
            self._gw_cul_k[0] * self.rc_gw_writing[:, r].double()
            + self._gw_cul_k[1] * self.rc_gw_art[:, r].double()
            + self._gw_cul_k[2] * self.rc_gw_music[:, r].double()
        ) * alive.double()
        # B-20 (#73): RELIC faith, the city.ts twin position.
        faith = faith + self._relic_faith * self.rc_relics[:, r].double() * alive.double()
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
        bit: a claimed tile goes -1 -> r0, never == r1). Pop is own-column
        and written only AT its iteration, after its yields are consumed;
        BUILDINGS stopped being own-column at B9-R2 (a regional building
        completed/bought at j's iteration reaches LATER columns via
        _rival_regional), so every rc_bldg write site now bumps
        _eff_version. The one live read a snapshot cannot honor is
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

    def _res_avail_mask(self, owned: torch.Tensor) -> torch.Tensor:
        """AUDIT B-9: [B, NU] — for every roster unit, does the civ owning the
        `owned` [B,T] tiles have strategic-resource ACCESS to build/buy it? A tile
        provides access to its resource iff it carries a resource, its improvement
        matches the resource's required improvement (res_imp, the exported `rq`
        plane), it is unpillaged, and the civ owns it. Ungated units are all-True;
        an empty requirement set short-circuits. Mirrors TS civHasStrategic."""
        B, dev = self.B, self.device
        out = torch.ones(B, self.NU, dtype=torch.bool, device=dev)
        if not self._res_unit_pairs:
            return out
        provides = (self.res_id >= 0) & (self.improvement == self.res_imp) & ~self.pillaged & owned  # [B,T]
        for u_idx, res_idx in self._res_unit_pairs:
            out[:, u_idx] = (provides & (self.res_id == res_idx)).any(dim=1)
        return out

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
            unit_ok = unit_ok & self._res_avail_mask(self.owner >= 0)  # B-9: player strategic-resource gate
            unit_ok = unit_ok & ~self._p_faith_only.view(1, -1)  # B6-S2: trainableUnits' faithOnly filter (MISSIONARY never queues)
            unit_ok = unit_ok & ~self._p_spawn_only.view(1, -1)  # B7-G (B-8): spawn-only filter (GENERAL/ADMIRAL never queue)
            # B-20 (#79): the Archaeologist's civic + artifact-slot gates. The
            # slot rule is PER-CITY, so it joins after the [B, NU] -> [B, C, NU]
            # expansion rather than collapsing unit_ok's rank early.
            unit_col = unit_ok.unsqueeze(1).expand(-1, C, -1) & self._p_civic_slot_ok(True)
            if bool(self.unit_naval.any()):
                # #45/B-6: the controlled/RL player builds NO naval (mirrors the
                # controlled rival's rival_masks ladder and the scripted player's
                # bestMilitary); player naval rides #50 with its move/attack
                # verbs. The scripted RIVAL galley policy is the only in-gate
                # naval production.
                unit_col = unit_col & ~self.unit_naval.view(1, 1, -1)
            cols.append(unit_col)
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
                    for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
                        has_tech = self.techs[:, utech] if utech >= 0 else (self.civics[:, uciv] if uciv >= 0 else torch.ones(B, dtype=torch.bool, device=dev))  # B9-R1: kind-aware
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
                u_ok = u_ok & self._p_civic_slot_ok(False)  # B-20 (#79): civic gate
                u_ok = u_ok & self._res_avail_mask(self.owner >= 0)  # B-9: player strategic-resource gate (purchase)
                u_ok = u_ok & ~self._p_faith_only.view(1, -1)  # B6-S2: faith-only never gold-buys (trainableUnits mirror)
                u_ok = u_ok & ~self._p_spawn_only.view(1, -1)  # B7-G (B-8): spawn-only never gold-buys (trainableUnits mirror)
                u_cost = self._p_cost.unsqueeze(0).expand(B, -1)
                if self._builder_idx >= 0:
                    # P4/D-10: the builder column prices off the live escalator
                    # (trained + queued), like TS unitPurchaseCost at mask time.
                    bq = (self.current == self.UNIT_BASE + self._builder_idx).sum(dim=1)
                    u_cost = u_cost.clone()
                    u_cost[:, self._builder_idx] = self._builder_cost(self.builders_trained + bq)
                pu = (u_ok & self._afford(tre.unsqueeze(1), u_cost * mult)).unsqueeze(1).expand(-1, C, -1)
                if bool(self.unit_naval.any()):
                    pu = pu & ~self.unit_naval.view(1, 1, -1)  # #45/B-6: no controlled-player naval buy (rides #50)
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
                if row.get("distinct"):
                    # B9-R1 (CIVIL_ENGINEERING): count DISTINCT types, not instances.
                    _cntt = torch.zeros(self.B, len(self.districts_cat), dtype=torch.long, device=self.device)
                    _cntt.scatter_add_(1, self.district.clamp(min=0), on.long())
                    pred = (_cntt > 0).sum(dim=1) >= row["count"]
                else:
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
                # B-24 (#77): FREE INQUIRY pays era score per EUREKA — fire on
                # the rows where the boost NEWLY lands (the TS `newly` twin).
                _new_t = pred & ~self.techs[:, row["idx"]] & ~self.tech_boosted[:, row["idx"]]
                self.tech_boosted[:, row["idx"]] |= pred & ~self.techs[:, row["idx"]]
                self._dedication_event(0, 1, _new_t)
            else:
                # B-24 (#77): PEN BRUSH AND VOICE pays era score per INSPIRATION.
                _new_c = pred & ~self.civics[:, row["idx"]] & ~self.civic_boosted[:, row["idx"]]
                self.civic_boosted[:, row["idx"]] |= pred & ~self.civics[:, row["idx"]]
                self._dedication_event(0, 2, _new_c)

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
                    if row.get("distinct"):
                        # B9-R1 (CIVIL_ENGINEERING): distinct specialty TYPES across cities.
                        pred = (on.any(dim=1) & self._is_specialty.view(1, -1)).sum(dim=1) >= row["count"]
                    else:
                        pred = (on & self._is_specialty.view(1, 1, -1)).sum(dim=(1, 2)) >= row["count"]
                else:
                    pred = on[:, :, dtype].sum(dim=1) >= row["count"]
            else:
                continue
            hit = active & pred
            if row["target"] == "tech":
                _new_rt = hit & ~self.r_techs[:, r, row["idx"]] & ~self.r_tech_boosted[:, r, row["idx"]]
                self.r_tech_boosted[:, r, row["idx"]] |= hit & ~self.r_techs[:, r, row["idx"]]
                self._dedication_event(r + 1, 1, _new_rt)  # B-24 (#77): rival EUREKA
            else:
                _new_rc = hit & ~self.r_civics[:, r, row["idx"]] & ~self.r_civic_boosted[:, r, row["idx"]]
                self.r_civic_boosted[:, r, row["idx"]] |= hit & ~self.r_civics[:, r, row["idx"]]
                self._dedication_event(r + 1, 2, _new_rc)  # B-24 (#77): rival INSPIRATION

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
        # B-4: table widened to q in [-2000, 2000] (diff +-200) so XP level bonuses
        # (up to +15 CS) can't push |diff| past the table as they could past B-29's
        # +-60 (wounds/river only shrink |diff|; XP grows it). TS damageRoll has no
        # clamp — the wider table keeps the two engines bit-exact under veterancy.
        base = self._dmg_base[(q + 2000).clamp(0, 4000)]
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

    def _xp_lvl_bonus(self, xp: torch.Tensor) -> torch.Tensor:
        """B-4 (mirrors combat.ts xpLevelBonus): the flat CS bonus a unit's
        veterancy grants — XP_LEVEL_CS per XP_LEVELS threshold crossed. Integer
        add (long) into the CS assembly, exactly like the B-7 terms. Barb slots
        never carry xp; pass a zero tensor for them."""
        level = torch.zeros_like(xp)
        for t in XP_LEVELS:
            level = level + (xp >= t).long()
        return XP_LEVEL_CS * level

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
        # #45/B-6: EMBARKED military units flank/support for NOBODY (barbs never
        # embark). Exclude an embarked occupant from the player/rival counts.
        pm_slot_n = self.pmil_at.gather(1, nbc)
        has_pmil = (pm_slot_n >= 0) & on & ~self.p_emb.gather(1, pm_slot_n.clamp(min=0))
        rvn = self.rv_at.gather(1, nbc)
        has_rv = (rvn >= 0) & on & ~self.v_emb.gather(1, rvn.clamp(min=0))
        rv_civ_n = self.v_civ.gather(1, rvn.clamp(min=0)).clamp(max=rcap)  # [B, 6]
        # a rival military neighbour whose civ is at war with the player
        rv_war_n = has_rv & self.r_atwar.gather(1, rv_civ_n)
        dside = def_side.unsqueeze(1)  # [B, 1]
        dciv = def_civ.clamp(min=0).clamp(max=rcap).unsqueeze(1)  # [B, 1]
        is_pl = dside == 0
        is_bb = dside == 1
        is_rv = dside == 2
        atwar_dc = self.r_atwar.gather(1, dciv)  # [B, 1] — the defender's rival civ at war
        # A-19/B-33 (S2): an enemy AT-WAR rival military neighbour is hostile to
        # a RIVAL defender (its own attacker's flankers included; excluded by
        # is_atk below). rr_war[b, dciv[b], rv_civ_n[b,d]] — [B, 6].
        bidx6 = torch.arange(self.B, device=self.device).unsqueeze(1)
        rr_dc = self.rr_war[bidx6, dciv, rv_civ_n]  # [B, 6]
        rv_enemy_dc = has_rv & (rv_civ_n != dciv) & rr_dc
        # hostile-to-defender military per neighbour (unitsHostile, u military)
        hostile = (
            (is_pl & (has_barb | rv_war_n))
            | (is_bb & (has_pmil | has_rv))
            | (is_rv & (has_barb | (has_pmil & atwar_dc) | rv_enemy_dc))
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

    def _lay_trade_road(self, rows: torch.Tensor, frm: torch.Tensor, dest: torch.Tensor) -> None:
        """B-23 (#71): the `layTradeRoad` twin — lay the ROAD a new trade
        route's Trader would leave behind. From the origin centre, repeatedly
        step to the neighbour with the lowest hexDistance to the destination
        (ties by direction order — the same integer rule the war-march uses, so
        both engines agree by construction). A walk that needs a water or
        impassable tile is a SEA route and lays NOTHING, so the path is
        collected first and committed only if it reaches the destination.
        Zero draws, integer-only."""
        if len(rows) == 0:
            return
        dev = self.device
        ar6 = torch.arange(6, device=dev)
        rows2 = rows.unsqueeze(1)
        cur = frm.clone()
        alive = (
            (frm >= 0)
            & (dest >= 0)
            & self.passable[rows, frm.clamp(min=0)]
            & self.passable[rows, dest.clamp(min=0)]
        )
        arrived = alive & (cur == dest)
        path = [torch.where(alive, cur, torch.full_like(cur, -1))]
        for _ in range(TRADE_ROAD_MAX_STEPS):
            walking = alive & ~arrived
            if not bool(walking.any()):
                break
            nb = self.neigh[cur.clamp(min=0)]  # [n, 6]
            nbc = nb.clamp(min=0)
            okn = (nb >= 0) & self.passable[rows2, nbc]
            d_nb = self.pair_dist[dest.clamp(min=0).unsqueeze(1), nbc].to(torch.long)
            d_cur = self.pair_dist[dest.clamp(min=0), cur.clamp(min=0)].to(torch.long)
            key = torch.where(okn & (d_nb < d_cur.unsqueeze(1)), d_nb * 8 + ar6, 10**9)
            best = key.min(dim=1).values
            step_ok = walking & (best < 10**9)
            nxt = nb.gather(1, (best % 8).clamp(max=5).unsqueeze(1)).squeeze(1)
            cur = torch.where(step_ok, nxt, cur)
            path.append(torch.where(step_ok, cur, torch.full_like(cur, -1)))
            # a walking row that could not step is a SEA route — it dies here
            alive = alive & (arrived | step_ok)
            arrived = arrived | (alive & (cur == dest))
        commit = alive & arrived
        if not bool(commit.any()):
            return
        for pt in path:
            m = commit & (pt >= 0)
            if bool(m.any()):
                self.road[rows[m], pt[m]] = True

    def _road_terms(self, frm: torch.Tensor, dest: torch.Tensor, river3: torch.Tensor):
        """B-23 (#71): the (terrain, river) MP terms a step pays, road-aware —
        the `moveCostInto` + `riverCharge` twin. A ROAD-to-ROAD step ignores the
        terrain penalty entirely ("roads let a unit pass through Woods or Hills
        as if it were flat"), and once `road_bridged` latches at the first era
        boundary (Classical roads bring bridges) it ignores the river charge
        too. A road on only ONE end does nothing, exactly as in real Civ 6."""
        tm = torch.div(
            self.tmove.gather(1, dest.clamp(min=0).unsqueeze(1)).squeeze(1), 3, rounding_mode="floor"
        )
        rd = (
            self.road.gather(1, frm.clamp(min=0).unsqueeze(1)).squeeze(1)
            & self.road.gather(1, dest.clamp(min=0).unsqueeze(1)).squeeze(1)
        )
        z = torch.zeros_like(tm)
        terr = torch.where(rd, z, tm)
        riv = torch.where(rd, torch.zeros_like(river3), river3) if self.road_bridged else river3
        return terr, riv

    def _encamp_live(self) -> torch.Tensor:
        """[B, T] bool — B-17 (#71): a LIVE Encampment garrison. The exact
        `encampmentIntact` twin: the district is an ENCAMPMENT, complete,
        unpillaged, and still holding HP. (`district_dead` is deliberately NOT
        a term — TS has no twin for it, and a captured Encampment keeps
        defending its new owner in both engines.)"""
        if self._encamp_didx < 0:
            return torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        return (
            (self.district == self._encamp_didx)
            & self.district_complete
            & ~self.district_pillaged
            & (self.encamp_hp > 0)
        )

    def _encamp_block_plane(self, side: str, civ=None) -> torch.Tensor:
        """[B, T] bool — the `encampmentBlocks` twin over the WHOLE map: does a
        LIVE ENEMY Encampment bar this side from each tile? Hostility mirrors
        `unitsHostile` exactly — barbarians are hostile to every owner, the
        player to at-war rivals, a rival to the player when `r_atwar` and to
        another rival when `rr_war`. `civ` may be an int or a [B, 1] tensor
        (the war-march passes `v_civ` per slot)."""
        live = self._encamp_live()  # [B, T]
        if side == "barb":
            return live  # barbarians are hostile to every owner
        r_at = self.rival_at  # [B, T] owning rival, else -1
        if side in ("pmil", "pciv"):
            war_r = self.r_atwar.gather(1, r_at.clamp(min=0))
            return live & (r_at >= 0) & war_r
        # rival probe ("rmil"/"rciv", and the loose "rival" that _blocked_for
        # resolves through its strict fallthrough): `civ` is this rival's index
        # (int or [B, 1] tensor).
        p_tile = (r_at < 0) & (self.owner >= 0)
        if torch.is_tensor(civ):
            cv = civ.reshape(self.B, 1)
            war_p = self.r_atwar.gather(1, cv)  # [B, 1]
            rr = self.rr_war.gather(
                1, cv.unsqueeze(-1).expand(self.B, 1, self.rr_war.shape[2])
            ).squeeze(1)  # [B, R]
            same = r_at == cv
        else:
            war_p = self.r_atwar[:, civ].unsqueeze(1)
            rr = self.rr_war[:, civ]
            same = r_at == civ
        war_r = rr.gather(1, r_at.clamp(min=0)) & ~same
        hostile = torch.where(r_at >= 0, war_r, p_tile & war_p)
        return live & hostile

    def _encamp_block(self, tiles: torch.Tensor, side: str, civ=None) -> torch.Tensor:
        """[B, N] — `_encamp_block_plane` sampled at `tiles` (one source of
        truth for the predicate; the walkers probe a handful of tiles)."""
        if self._encamp_didx < 0:
            return torch.zeros_like(tiles, dtype=torch.bool)
        return self._encamp_block_plane(side, civ).gather(1, tiles.clamp(min=0))

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
        # B-17 (#71): a live enemy Encampment bars entry on every side, exactly
        # as TS's `tileFreeForUnit` now does.
        enc = self._encamp_block(tiles, side, civ)
        if side == "pmil":
            return barb | pmil | rv | rvc | enc
        if side == "pciv":
            return barb | pciv | rv | rvc | enc
        if side == "rmil":
            # foreign anything; own-civ military (same domain); own-civ
            # civilian stacks (cross-domain)
            rvc_foreign = rvc & (self.v_civ.gather(1, rvc_slot.clamp(min=0)) != civ)
            return barb | pmil | pciv | rv | rvc_foreign | enc
        if side == "rciv":
            # foreign anything; own-civ civilian (same domain); own-civ
            # military stacks (cross-domain)
            rv_foreign = rv & (self.v_civ.gather(1, rv_slot.clamp(min=0)) != civ)
            return barb | pmil | pciv | rv_foreign | rvc | enc
        # 'barb': anything standing there blocks.
        return barb | pmil | pciv | rv | rvc | enc

    def _first_free_spot(self, at_tile: torch.Tensor, side: str, civ_mask: torch.Tensor | None = None, civ: int | None = None, naval_mask: torch.Tensor | None = None, cart: torch.Tensor | None = None) -> tuple[torch.Tensor, torch.Tensor]:
        """Mirrors spawnUnit's placement probe: the anchor if free, else the
        first free neighbor in direction order (the stable distance sort
        keeps exactly that order). side: 'barb' | 'player' | 'rival';
        civ_mask [B] bool (player only) — True = civilian probe.
        #45/B-6: naval_mask [B] bool marks rows spawning a NAVAL unit — those
        probe over enterable WATER (wpass; OCEAN needs the owner's CARTOGRAPHY,
        passed as cart [B]) instead of the land plane, so ships land on water.
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
        terr = self.passable.gather(1, okc)
        if naval_mask is not None and bool(naval_mask.any()):
            # #45/B-6: naval rows use the water plane — wpass, OCEAN gated on the
            # owner's CARTOGRAPHY (else all-false → coast/lake only).
            ocean_ok = ~self.ocean_tile.gather(1, okc)
            if cart is not None:
                ocean_ok = ocean_ok | cart.unsqueeze(1)
            water_terr = self.wpass.gather(1, okc) & ocean_ok
            terr = torch.where(naval_mask.unsqueeze(1), water_terr, terr)
        ok7 = (cand7 >= 0) & terr & ~blocked
        first = torch.where(ok7, torch.arange(7, device=self.device), 7).min(dim=1).values
        spot = cand7.gather(1, first.clamp(max=6).unsqueeze(1)).squeeze(1)
        return first < 7, spot

    def _barb_water_ok(self, tiles: torch.Tensor) -> torch.Tensor:
        """B-26: the water plane a BARBARIAN hull may enter — wpass minus
        OCEAN. Barbarians own no tech, so TS's waterEnterable (which gates
        OCEAN on the owner's CARTOGRAPHY) always refuses ocean for them."""
        tc = tiles.clamp(min=0).unsqueeze(1)
        return (self.wpass.gather(1, tc) & ~self.ocean_tile.gather(1, tc)).squeeze(1)

    def _spawn_barb(self, mask: torch.Tensor, at_tile: torch.Tensor, unit_type: int, naval: bool = False) -> None:
        """Barbarians are military; appends to the slot list, which is what
        keeps GPU unit order identical to state.units array order."""
        if not bool(mask.any()):
            return
        # B-26: a NAVAL barb probes the WATER plane (its hull cannot stand
        # ashore), exactly as TS's spawnUnit branches on UNITS[type].naval.
        _nm = torch.ones(self.B, dtype=torch.bool, device=self.device) if naval else None
        found, spot = self._first_free_spot(at_tile, "barb", naval_mask=_nm)
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

    def _spawn_player(self, mask: torch.Tensor, at_tile: torch.Tensor, type_idx: torch.Tensor, init_xp: torch.Tensor | None = None) -> None:
        """A trained unit appears at/near its city center (spawnUnit). B-17:
        init_xp (a [B] long tensor) seeds a MILITARY unit's starting XP from
        its city's Encampment training buildings; civilians stay at 0."""
        if not bool(mask.any()):
            return
        civ = self._p_civ[type_idx.clamp(min=0)]
        # #45/B-6: naval units probe over water (OCEAN gated on the player's
        # CARTOGRAPHY) — poke/#50 player-naval path; scripted player builds none.
        ti_pn = type_idx.clamp(min=0, max=self.NU - 1)
        naval_mp = self.unit_naval[ti_pn] & mask
        cart_p = self.techs[:, self._cartography_tech] if self._cartography_tech >= 0 else None
        found, spot = self._first_free_spot(at_tile, "player", civ, naval_mask=naval_mp, cart=cart_p)
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
        if init_xp is None:
            self.p_xp[rows, slot] = 0  # B-4: a fresh (possibly reclaimed) slot starts at 0 xp
        else:
            # B-17: MILITARY rows inherit the training city's Encampment XP; civilians stay 0.
            self.p_xp[rows, slot] = torch.where(civ[rows], torch.zeros_like(slot), init_xp[rows])
        # #70/S3 (B-8): a unit spawned MID-turn has no frozen grant yet — TS
        # leaves movesFull undefined until its first refreshUnits and the
        # `?? full` fallback means no aura, so 0 is the faithful mirror (and it
        # scrubs a reclaimed slot's stale value).
        self.p_aura_mp[rows, slot] = 0
        self.p_emb[rows, slot] = False  # #45/B-6: a fresh (possibly reclaimed) slot is ashore
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


    def _mark_antiquity(self, mask: torch.Tensor, tile: torch.Tensor) -> None:
        """B-20 (#79): the markAntiquitySite twin — stamp an ANTIQUITY SITE on
        `tile` for the rows in `mask`. Real Civ 6 creates these from PRE-MODERN
        events (a razed barbarian outpost, a unit dying), so the era gate is the
        sourced part; a tile already carrying a dig does not stack, and water,
        districts and wonder tiles are refused exactly as TS refuses them."""
        if not bool(mask.any()):
            return
        t = tile.clamp(min=0)
        era = self._civ_era(self.techs, self.civics)  # [B] the player's era
        okr = (
            mask
            & (tile >= 0)
            & (era < self._modern_era_index)
            & ~self.water.gather(1, t.unsqueeze(1)).squeeze(1)
            & (self.district.gather(1, t.unsqueeze(1)).squeeze(1) < 0)
            & (self.built_wonder.gather(1, t.unsqueeze(1)).squeeze(1) < 0)
        )
        if not bool(okr.any()):
            return
        rows = okr.nonzero(as_tuple=True)[0]
        self.antiquity[rows, t[rows]] = True



    def _cliff_block_dirs(self, cur: torch.Tensor, nb6: torch.Tensor, own: torch.Tensor | None = None) -> torch.Tensor:
        """B-26 (#79) [B, 6]: per-direction, is the step cur->neighbour a
        land/water crossing closed by a CLIFF? Applied at STEP-legality level so
        a walker routes AROUND a cliff instead of halting at it.
        The mask lives on the LAND tile, so read it there and test the bit
        pointing at the water side — from the water side that is the opposite
        direction ((d + 3) % 6). Sourced exceptions: a city centre, and a HARBOR
        belonging to the mover's OWN civ ("enemy units won't" pass it)."""
        B, dev = self.B, self.device
        if not bool(self.cliff_mask.any()):
            return torch.zeros(B, 6, dtype=torch.bool, device=dev)
        c = cur.clamp(min=0)
        nbc = nb6.clamp(min=0)
        cw = self.water.gather(1, c.unsqueeze(1))            # [B, 1]
        nw = self.water.gather(1, nbc)                        # [B, 6]
        trans = (cw != nw) & (nb6 >= 0)
        if not bool(trans.any()):
            return torch.zeros(B, 6, dtype=torch.bool, device=dev)
        dirs = torch.arange(6, device=dev).view(1, 6).expand(B, 6)
        land = torch.where(cw.expand(B, 6), nbc, c.unsqueeze(1).expand(B, 6))
        dl = torch.where(cw.expand(B, 6), (dirs + 3) % 6, dirs)
        bit = ((self.cliff_mask.gather(1, land) >> dl) & 1).bool()
        free = (self.center_at.gather(1, land) >= 0) | (self.rvcity_at.gather(1, land) >= 0)
        if self._harbor_idx >= 0 and own is not None:
            free = free | ((self.district.gather(1, land) == self._harbor_idx) & own.gather(1, land))
        return trans & bit & ~free

    def _cliff_edge(self, cur: torch.Tensor, dest: torch.Tensor, dir_i, own: torch.Tensor | None = None) -> torch.Tensor:
        """B-26 (#79) [B] bool: is the step cur->dest a land/water crossing that a
        CLIFF closes? The `cliffBlocks` twin. The mask lives on the LAND tile, so
        read it there and test the bit pointing at the water side — from the
        water side that is the OPPOSITE direction ((d + 3) % 6 on this hex
        layout). Sourced exceptions: a city centre and a HARBOR ignore cliffs.
        Cliffs never touch land-to-land steps."""
        if not bool(self.cliff_mask.any()):
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        c = cur.clamp(min=0)
        d = dest.clamp(min=0)
        cw = self.water.gather(1, c.unsqueeze(1)).squeeze(1)
        dw = self.water.gather(1, d.unsqueeze(1)).squeeze(1)
        trans = cw != dw
        if not bool(trans.any()):
            return torch.zeros_like(trans)
        land = torch.where(cw, d, c)
        di = dir_i if torch.is_tensor(dir_i) else torch.full_like(c, int(dir_i))
        dl = torch.where(cw, (di + 3) % 6, di)
        bit = ((self.cliff_mask.gather(1, land.unsqueeze(1)).squeeze(1) >> dl) & 1).bool()
        free = (self.center_at.gather(1, land.unsqueeze(1)).squeeze(1) >= 0) | (
            self.rvcity_at.gather(1, land.unsqueeze(1)).squeeze(1) >= 0
        )
        # SOURCED: the Harbor exception is OWNER-ONLY — "when YOUR units use it
        # they will be able to pass the Cliffs... Enemy units won't." Callers
        # pass `own` = the tiles this mover's civ holds; without it a Harbor
        # would be a hole in the wall for the besieger too.
        if self._harbor_idx >= 0 and own is not None:
            harbor = self.district.gather(1, land.unsqueeze(1)).squeeze(1) == self._harbor_idx
            free = free | (harbor & own.gather(1, land.unsqueeze(1)).squeeze(1))
        return trans & bit & ~free

    def _clear_camp_at(self, mask: torch.Tensor, tile: torch.Tensor, civ: torch.Tensor | None = None) -> None:
        """A non-barbarian unit entering a camp tile clears it: +50 gold to
        ITS civ (P5/S7 C-3 — rivals bank it too; pass civ=[B] rival ids) and
        the camp list splices left (order matters for later garrison loops)."""
        if not bool(mask.any()):
            return
        hit = mask & (self.camp_tile == tile.unsqueeze(1)).any(dim=1)
        if not bool(hit.any()):
            return
        self._mark_antiquity(hit, tile)  # B-20 (#79): a razed outpost leaves a dig
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


    def _p_civic_slot_ok(self, per_city: bool) -> torch.Tensor:
        """B-20 (#79): the Archaeologist's two extra trainableUnits gates —
        the CIVIC unlock (Natural History) and the ARTIFACT-SLOT rule (its city
        must hold an ARCHAEOLOGICAL MUSEUM with a free slot). Returns [B, NU]
        when per_city is False, else [B, C, NU]. Without these the GPU offered
        an ARCHAEOLOGIST at t18 with no civic and no museum and the TS replay
        refused the order — an off-script gate red, not a scripted-parity one."""
        B, dev = self.B, self.device
        civ_ok = (self._p_civic.unsqueeze(0) < 0) | self.civics.gather(
            1, self._p_civic.clamp(min=0).unsqueeze(0).expand(B, -1)
        )  # [B, NU]
        if not per_city:
            return civ_ok
        C = self.C
        need = self._p_needs_slot.view(1, 1, -1)  # [1, 1, NU]
        if self._artifact_bidx < 0:
            room = torch.zeros(B, C, 1, dtype=torch.bool, device=dev)
        else:
            room = (
                self.buildings[:, :, self._artifact_bidx] & (self.artifacts < self._artifact_slots)
            ).unsqueeze(2)  # [B, C, 1]
        return civ_ok.unsqueeze(1) & (~need | room)

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
        # A-18 (#79): city-state centres join the mask once the PLAYER has
        # DECLARED war (cs_atwar) — the column the A-18 residual was blocked
        # on. Gating on the war state is what preserves the autopilot
        # invariant that a PEACEFUL city-state is never offered as a target.
        csn = self.cs_at.gather(1, nbc)
        cs_war = ((csn >= 0) & self.cs_atwar.gather(1, csn.clamp(min=0))).reshape(B, P_MAX, 6)
        attack = on_map & (barb | rv_war | rc_war | cs_war) & can_fight & alive
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
        # A-18 (#50, 2026-07-27): 17 = builder REPAIR. `builderRepair` (units.ts)
        # has always existed and the RIVAL seat has used it since A-13; the
        # PLAYER had no way to call it. A builder standing on an OWNED tile
        # whose improvement or district is pillaged. No charge is spent (the
        # rival path's rule) — the turn is.
        # A-18 (#50): 18-23 = the RESOURCE improvements + SEASIDE_RESORT.
        # `builderImprove` already validates any id through validImprovements —
        # only the mask never offered them, so the player farmed while rivals
        # placed the whole roster (the asymmetry A-18 recorded).
        _res_cols = []
        if self.improvements_on and self._builder_idx >= 0:
            _tc2 = self.p_tile.clamp(min=0)
            _base = (
                self.p_alive
                & (self.p_type == self._builder_idx)
                & (self.p_charges > 0)
                & (self.owner.gather(1, _tc2) >= 0)
                & (self.center_at.gather(1, _tc2) < 0)
                & (self.improvement.gather(1, _tc2) < 0)
                & (self.district.gather(1, _tc2) < 0)
                & (self.built_wonder.gather(1, _tc2) < 0)
            )
            _rq = self.res_imp.gather(1, _tc2)  # required improvement idx, -1 = none
            for _k in range(3, self._imp_unlock.numel()):
                _ut = int(self._imp_unlock[_k])
                _unl = self.techs[:, _ut].unsqueeze(1) if _ut >= 0 else torch.ones(B, 1, dtype=torch.bool, device=dev)
                if self.SEASIDE >= 0 and _k == self.SEASIDE:
                    _ok = _base & self._seaside_ok().gather(1, _tc2) & _unl
                else:
                    _ok = _base & (_rq == _k) & _unl
                _res_cols.append(_ok.unsqueeze(2))
        else:
            _res_cols = []
        rep_t = self.p_tile.clamp(min=0)
        repair = (
            self.p_alive
            & (self.p_type == self._builder_idx if self._builder_idx >= 0 else torch.zeros_like(self.p_alive))
            & (self.owner.gather(1, rep_t) >= 0)
            & (self.pillaged.gather(1, rep_t) | self.district_pillaged.gather(1, rep_t))
        ).unsqueeze(2)
        # A-21 (#50, 2026-07-27): 24 = PLAYER PILLAGE. A military unit standing
        # on an ENEMY tile (an at-war rival's or a city-state's) with a live
        # improvement, or a complete non-centre unpillaged district.
        _pt = self.p_tile.clamp(min=0)
        _rv_t = self.rival_at.gather(1, _pt)
        _enemy = ((_rv_t >= 0) & self.r_atwar.gather(1, _rv_t.clamp(min=0))) | (self.cs_at.gather(1, _pt) >= 0)
        _has_imp = (self.improvement.gather(1, _pt) >= 0) & ~self.pillaged.gather(1, _pt)
        _has_dis = (
            (self.district.gather(1, _pt) >= 0)
            & self.district_complete.gather(1, _pt)
            & ~self.district_pillaged.gather(1, _pt)
            & (self.center_at.gather(1, _pt) < 0)
            & (self.rvcity_at.gather(1, _pt) < 0)
        )
        pillage = (
            self.p_alive & (self._p_combat[self.p_type] > 0) & _enemy & (_has_imp | _has_dis)
        ).unsqueeze(2)
        return torch.cat(
            [move, attack, hold, build_f, build_m, build_l, chop, repair] + _res_cols + [pillage], dim=2
        )

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

    def _relocate_palace_player(self, rows: torch.Tensor) -> None:
        """#70/S4 (AUDIT A-9): PALACE RELOCATION — the rivals.ts
        `relocatePalace` mirror for the PLAYER's city list. Call it on the
        LOSER rows immediately after a player city leaves the empire
        (capture, loyalty defection or raze). No-op when the empire is gone
        (no live column — TS's `cities.length === 0`) or still holds a
        capital; otherwise the surviving city with the HIGHEST population is
        re-crowned, ties to the EARLIEST acquisition (TS scans the array
        with a strict `>`, and array order == city_seq rank, never column
        index — the P5/S3 rule).

        The PALACE BUILDING needs no write: both engines model it as a
        capital TERM (`is_cap` × `_palace_y` / `_palace_housing` /
        `_palace_amenities`), never a b_cost row — export-gpu.ts drops
        PALACE from the catalog ("both engines model it as a capital term,
        not a table row") — so moving `is_cap` moves the building, exactly
        the `buildings.push('PALACE')` half of the TS function.

        `cap_tile_player` (capitalTiles[0]) deliberately does NOT move: it
        is the STATIC domination anchor (GV-3), and real Civ 6 agrees — the
        ORIGINAL capital stays the domination target while the relocated
        Palace carries the capital BONUSES."""
        if rows.numel() == 0:
            return
        alive = self.alive[rows]  # [n, C]
        need = alive.any(dim=1) & ~(self.is_cap[rows] & alive).any(dim=1)  # [n]
        if not bool(need.any()):
            return
        # ONE strictly-ordered key: population DESC, acquisition (city_seq)
        # ASC. city_seq is unique across live columns, so the argmax is
        # tie-free and reproduces the TS strict-`>` first-wins scan exactly.
        seq = self.city_seq[rows]
        key = torch.where(alive, self.pop[rows] * (1 << 20) - seq, torch.full_like(seq, -(1 << 60)))
        pick = key.max(dim=1).indices  # [n] (garbage where ~need, masked below)
        self.is_cap[rows[need], pick[need]] = True
        self._eff_version += 1  # yield-bearing: the palace term (yields/housing/amenities) just moved

    def _relocate_palace_rival(self, rows: torch.Tensor, civ: torch.Tensor) -> None:
        """#70/S4 (AUDIT A-9): the rc-side twin of _relocate_palace_player
        (`relocatePalace(from.cities)` / `relocatePalace(rival.cities)`).
        `rows` and `civ` are parallel [n] index tensors — the losing civ per
        row. rc SLOT order IS the acquisition rank here (founding, capture
        and both transfers all append at last-alive+1 and _reclaim_rc is
        stable — "rc slot order == TS array order"), so the tie-break runs
        on the slot index. rc_bldg is untouched (PALACE is not in the
        b_cost catalog) and `cap_tile_rival` (capitalTiles[r+1]) stays put
        for the same GV-3 reason as the player side."""
        if rows.numel() == 0:
            return
        alive = self.rc_alive[rows, civ]  # [n, RC]
        need = alive.any(dim=1) & ~(self.rc_is_cap[rows, civ] & alive).any(dim=1)  # [n]
        if not bool(need.any()):
            return
        idx = torch.arange(self.RC, device=self.device).view(1, -1).expand_as(alive)
        key = torch.where(alive, self.rc_pop[rows, civ] * (1 << 20) - idx, torch.full_like(idx, -(1 << 60)))
        pick = key.max(dim=1).indices  # [n]
        self.rc_is_cap[rows[need], civ[need], pick[need]] = True
        self._eff_version += 1  # yield-bearing: rivalYields/housing/amenities all read rc_is_cap

    def _capture_rival_city(self, rows: torch.Tensor, civ: torch.Tensor, slot: torch.Tensor, ctr: torch.Tensor, plunder: bool = True) -> None:
        """V-W2: captureRivalCity — the rival city transfers to the PLAYER.
        Into a FREE player slot when one exists (TS gains the matching cap:
        beyond C cities the capture razes instead); the city's OWN tiles
        (A-17 registry) move rivalId -> cityId, pop lands at x0.75 (min 1), the slot
        initializes from the live planes (site = the center, water housing
        from wh, river from riv, dist from the pair_dist row)."""
        for i in range(len(rows)):
            b = int(rows[i]); r = int(civ[i]); j = int(slot[i]); c_t = int(ctr[i])
            # B-22 (#74): taking a rival city earns GRIEVANCES. At the TOP of
            # the loop, matching TS's position at the top of captureRivalCity —
            # which means a RAZED capture earns them too. Off-script catch
            # (seed 9118 t69, warmonger TS=12 GPU=9): the accrual first sat
            # below the two raze `continue`s, so razing was free. Razing a city
            # is if anything MORE warmongering than keeping it, so TS is right.
            self.p_warmonger[b] += self._wm_cap
            pop = max(1, (int(self.rc_pop[b, r, j]) * 3) // 4)
            # AUDIT B-30: conquest keeps infrastructure — snapshot the rival
            # city's buildings BEFORE the rc-slot hygiene wipes them, so the
            # new PLAYER city can inherit them (minus PALACE, which is not in
            # this catalog — it is the is_cap/city-0 implicit building).
            kept_bldg = self.rc_bldg[b, r, j, :].clone()
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
            # #70/S4 (A-9): the losing rival re-crowns its biggest surviving
            # city the moment the city leaves its list — TS calls
            # relocatePalace right after `rival.cities = filter(...)` and
            # BEFORE the route prune / raze early-outs below.
            self._relocate_palace_rival(
                torch.tensor([b], dtype=torch.long, device=self.device),
                torch.tensor([r], dtype=torch.long, device=self.device),
            )
            # A-17: exactly this city's tiles leave the rival (registry scan)
            # — the old radius-3 sweep leaked the outer ring as orphaned civ
            # territory and stole sibling cities' frontage.
            cid = int(self.rc_id[b, r, j])
            ring = (self.rc_tile_id[b] == cid) & (self.rival_at[b] == r)
            # A-11: routes die with their endpoint (the TS filter twin).
            kill = (self.r_routes[b, r, :, 0] == cid) | (self.r_routes[b, r, :, 1] == cid)
            self.r_routes[b, r][kill] = -1
            self.r_route_dest[b, r][kill] = -1  # B-23
            self.r_route_exp[b, r][kill] = -1   # B-23
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
            self.era_score[b, 0] += self._era_pts["conquer"]  # B-24: gained a city (raze paths continue/return above)
            self.city_seq[b, c_new] = int(self.city_seq_next[b])
            self.city_seq_next[b] += 1
            self.is_cap[b, c_new] = False  # P7: captured cities are never capitals (TS isCapital: false)
            self.site[b, c_new] = c_t
            self.center_at[b, c_t] = c_new
            self.owner[b] = torch.where(ring & (self.owner[b] < 0), torch.full_like(self.owner[b], c_new), self.owner[b])
            self.owner[b, c_t] = c_new
            # AUDIT B-30: conquest KEEPS the captured city's COMPLETE districts
            # (the tiles are re-owned to c_new above and their district/complete
            # planes are untouched, so completed districts become LIVE player
            # districts; captured wonders ride the shared built_wonder planes).
            # INCOMPLETE captured districts stay paved-but-dead (the P5/S1
            # district_dead marking, now scoped to ~district_complete): TS drops
            # them from the new city's districts array, and the GPU must exclude
            # them from one-per-type/yields/availability the same way (seed 9235).
            dead_ring = ring & (self.district[b] >= 0) & ~self.district_complete[b]
            dead_ring[c_t] = False  # the center is the new city's live CITY_CENTER
            self.district_dead[b] = self.district_dead[b] | dead_ring
            # B9-R1 hunt catch (rng 2026006118 t109): CLEAR stale dead marks on
            # re-owned COMPLETE district tiles. TS derives the captured city's
            # districts from tiles (complete = listed = live), so a tile marked
            # dead at an EARLIER capture-while-incomplete that completed later
            # (orphan pave finished under a subsequent owner) must return to
            # life with the new owner — TS charges its maintenance/yields, and
            # a sticky dead bit here silently drops them.
            live_ring = ring & (self.district[b] >= 0) & self.district_complete[b]
            self.district_dead[b] = self.district_dead[b] & ~live_ring
            self.pop[b, c_new] = pop
            self.food_box[b, c_new] = 0.0
            self.culture_box[b, c_new] = 0.0
            self.gw_writing[b, c_new] = 0  # B-20: works wiped on capture (buildings kept, works are not)
            self.gw_music[b, c_new] = 0
            self.tiles_acquired[b, c_new] = int(self.rc_acquired[b, r, j]) if hasattr(self, "rc_acquired") else 0
            self.city_hp[b, c_new] = self.rules.combat.get("cityMaxHp", 200) // 2
            self.current[b, c_new] = -1
            # P5/S2 slot hygiene (seed 9235 t241): a reused slot must not
            # leak a dead city's queue progress/cost (TS starts queue = []).
            self.progress[b, c_new] = 0.0
            self.cur_cost[b, c_new] = 0.0
            self.q_dtile[b, c_new] = -1
            self.warrior_trained[b, c_new] = False
            # AUDIT B-30: inherit the rival city's buildings (index spaces
            # match — rc_bldg and buildings both key on the b_cost catalog,
            # PALACE excluded from it). ANCIENT_WALLS rides along; its outer
            # pool stays 0 (walls kept at outerHp 0, heal back via B-1 since
            # the B-1 heal gate reads the walls bit in this plane).
            self.buildings[b, c_new] = kept_bldg
            self.outer_hp[b, c_new] = 0  # AUDIT B-30: walls (if any) kept at outer pool 0
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
            self.r_route_dest[b] = torch.where(dead_cs, torch.full_like(self.r_route_dest[b], -1), self.r_route_dest[b])  # B-23
            self.r_route_exp[b] = torch.where(dead_cs, torch.full_like(self.r_route_exp[b], -1), self.r_route_exp[b])    # B-23
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
            self.era_score[b, 0] += self._era_pts["conquer"]  # B-24: gained a city (raze paths continue/return above)
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
            self.gw_writing[b, c_new] = 0  # B-20: fresh captured CS holds no works
            self.gw_music[b, c_new] = 0
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
            self.r_route_dest[b] = torch.where(dead_cs, torch.full_like(self.r_route_dest[b], -1), self.r_route_dest[b])  # B-23
            self.r_route_exp[b] = torch.where(dead_cs, torch.full_like(self.r_route_exp[b], -1), self.r_route_exp[b])    # B-23
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
            self.era_score[b, r + 1] += self._era_pts["conquer"]  # B-24: gained a city (rival CS conquest; raze continued above)
            self.rc_is_cap[b, r, slot] = False
            self.rc_center[b, r, slot] = c_t
            self.rc_pop[b, r, slot] = pop
            self.rc_growth[b, r, slot] = 0
            self.rc_cbox[b, r, slot] = 0
            self.rc_gw_writing[b, r, slot] = 0  # B-20: fresh rival city holds no works
            self.rc_gw_music[b, r, slot] = 0
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
        atk_e = atk_cs - self._wound(self.p_hp[:, p]) - 5.0 * self._river_cross(self.p_tile[:, p], tgt) + self._xp_lvl_bonus(self.p_xp[:, p])  # B-29 wound + river (city not a unit) + B-4 veterancy
        # #70/S2 (B-8): the General/Admiral aura covers city assaults too
        # (attackRivalCity's atkCS). Added ONCE, before both paired rolls, so
        # the counterattack sees the same atk_e — exactly like TS.
        atk_naval = self.unit_naval[self.p_type[:, p].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, p]
        atk_e = atk_e + self._gen_aura_cs(torch.zeros(self.B, dtype=torch.long, device=self.device), self.p_tile[:, p], atk_naval).to(atk_e.dtype)
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
            # B-4: this player attacker's veterancy bonus (pre-attack xp), added
            # to every atk CS assembly below; accrued at the loop-body end.
            p_lvl5 = self._xp_lvl_bonus(self.p_xp[:, p])

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
                # AUDIT B-31: a player melee on a lone rival civilian CAPTURES
                # it — roll-free (draw-count neutral), the attacker spends its
                # attack but does NOT advance (single-occupancy model). Pool
                # TRANSFER: despawn from the rival v_* pool, append to the
                # player p_* pool in spawn order (last-alive+1) with hp and
                # charges carried; movesLeft=0 -> p_acted so the D-2 heal skips
                # it this turn, exactly like TS's defender.movesLeft = 0.
                kr = civk.nonzero(as_tuple=True)[0]
                ks = rvc_slot_t[kr]
                ct = tc[kr]
                cap_type = self.v_type[kr, ks]
                cap_hp = self.v_hp[kr, ks]
                cap_ch = self.v_charges[kr, ks]
                cap_emb = self.v_emb[kr, ks]  # #45/B-6: read BEFORE despawn
                cap_xp = self.v_xp[kr, ks]  # B-4: read BEFORE despawn (civilian xp 0, but carry it)
                self.v_alive[kr, ks] = False
                self.rvciv_at[kr, ct] = -1
                nslot = self.p_next[kr]
                assert int(nslot.max()) < P_MAX, "player slot pool exhausted — raise P_MAX"
                self.p_alive[kr, nslot] = True
                self.p_type[kr, nslot] = cap_type
                self.p_tile[kr, nslot] = ct
                self.p_hp[kr, nslot] = cap_hp
                self.p_charges[kr, nslot] = cap_ch
                self.p_fortify[kr, nslot] = 0  # B-5: a civilian never fortifies
                self.p_xp[kr, nslot] = cap_xp  # B-4: ownership transfer carries xp
                self.p_aura_mp[kr, nslot] = 0  # #70/S3 (B-8): a captured CIVILIAN never auras (and movesLeft = 0 anyway)
                self.p_emb[kr, nslot] = cap_emb  # #45/B-6: captured unit KEEPS embarked under new owner
                self.p_acted[kr, nslot] = True  # movesLeft = 0 (blocks the D-2 heal)
                self.pciv_at[kr, ct] = nslot
                self.p_next[kr] += 1
                self._gen_ver += 1  # B7-G (B-8): the captured civilian may be a general (owner flip) → invalidate the aura plane
                self.p_acted[:, p] = self.p_acted[:, p] | civk  # P4/D-2: TS meleeAttack spends MP
            siege = alive & (a >= 6) & (a < 12) & (tgt >= 0) & (bslot < 0) & ~v_ok & ~rvc_ok & rc_ok & (self._p_combat[self.p_type[:, p]] > 0) & (self._p_rng_str[self.p_type[:, p]] == 0)
            if bool(siege.any()):
                self._player_attack_rival_city(siege, tgt, p)  # V-W2
                self.p_acted[:, p] = self.p_acted[:, p] | siege  # P4/D-2
            # B-17 (#71): a LIVE enemy Encampment on the target tile is assaulted
            # (meleeAttack's encamp arm). Requires the tile to hold no unit and
            # no rival city — the exact TS precedence — and a MELEE attacker.
            if self._encamp_didx >= 0:
                enc_ok = self._encamp_block(tc.unsqueeze(1), "pmil").squeeze(1)
                enc_att = (
                    alive
                    & (a >= 6)
                    & (a < 12)
                    & (tgt >= 0)
                    & (bslot < 0)
                    & ~v_ok
                    & ~rvc_ok
                    & ~rc_ok
                    & enc_ok
                    & (self._p_combat[self.p_type[:, p]] > 0)
                    & (self._p_rng_str[self.p_type[:, p]] == 0)
                )
                if bool(enc_att.any()):
                    self._attack_encampment(enc_att, tc, "player", p)
                    self.p_acted[:, p] = self.p_acted[:, p] | enc_att
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
                # B-4: a rival defender's veterancy (barbs have no xp). Folded into
                # the base def_cs so the embarked override below drops it (like B-7
                # support), exactly matching TS defenderCS.
                v_lvl5 = torch.where(is_b, torch.zeros_like(is_b, dtype=torch.long), self._xp_lvl_bonus(self.v_xp.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)))
                def_cs = torch.where(is_b, b_cs, v_cs) + self._tdef_g(tc) + torch.where(is_b, b_fy, v_fy) * 3 + v_lvl5  # B-5 + B-4
                # #45/B-6: an EMBARKED rival defender overrides to a flat CS —
                # no terrain/fortify (and no support below). Barbs never embark.
                v_embd = self.v_emb.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1) & ~is_b
                def_cs = torch.where(v_embd, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                # B-29: attacker AND defender fight at HP-reduced strength.
                b_hp = self.u_hp.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                v_hpd = self.v_hp.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                atk_e = atk_cs - self._wound(self.p_hp[:, p]) - 5.0 * self._river_cross(here, tgt) + p_lvl5  # B-29 river + B-4 attacker veterancy
                def_e = def_cs - self._wound(torch.where(is_b, b_hp, v_hpd))
                # B-7: flanking helps the player attacker, support helps the
                # defender (barb or at-war rival). Applied once so both paired
                # rolls see the same adjusted CS. #45/B-6: an embarked defender
                # receives NO support.
                _dside = torch.where(is_b, torch.ones_like(v_civ), torch.full_like(v_civ, 2))
                _fl, _sp = self._flank_support(tgt, _dside, v_civ, here)
                atk_e = atk_e + FLANKING_CS * _fl
                def_e = def_e + SUPPORT_CS * torch.where(v_embd, torch.zeros_like(_sp), _sp)
                # B6-S1: enhancer defender adders for RIVAL defenders (barbs
                # carry none; embarked = flat override, no term; the PLAYER
                # attacker term is structurally 0 — no GPU player religion).
                def_e = def_e + torch.where(v_embd, torch.zeros_like(def_e), self._rel_def_cs(torch.where(is_b, torch.full_like(v_civ, -1), v_civ), tgt).to(def_e.dtype))
                # B7-G (B-8): Great General/Admiral aura. Player attacker (civ 0)
                # keyed on `here`; rival defender (v_civ+1) keyed on `tgt` (barb →
                # no aura). Embarked/naval → the ADMIRAL plane (added on top of the
                # embarked defender's flat CS, mirroring combat.generalAuraCS).
                atk_naval = self.unit_naval[self.p_type[:, p].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, p]
                atk_e = atk_e + self._gen_aura_cs(torch.zeros_like(v_civ), here, atk_naval).to(atk_e.dtype)
                _v_def_nav = self.unit_naval[self.v_type.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)]
                def_naval = v_embd | torch.where(is_b, torch.zeros_like(v_embd), _v_def_nav)
                def_civ_u = torch.where(is_b, torch.full_like(v_civ, -1), v_civ + 1)
                def_e = def_e + self._gen_aura_cs(def_civ_u, tgt, def_naval).to(def_e.dtype)
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
                # B-4: a surviving rival MILITARY defender earns +2 (barbs never
                # accrue; rv_at is the rival-military map, so no civilian here).
                surv_rv = (att & ~is_b & ~def_dead).nonzero(as_tuple=True)[0]
                if len(surv_rv) > 0:
                    self.v_xp[surv_rv, vslot[surv_rv]] += XP_DEFEND
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
                # B5-M1 hunt fix: mirror TS tileFreeForUnit's TERRAIN check — a
                # player LAND unit may not advance onto a WATER tile (e.g. where
                # an embarked enemy was just killed). _blocked_for only checks
                # occupancy; without this the attacker teleported onto water,
                # desyncing from TS (which refuses the advance). Player builds no
                # naval (production_mask excludes it), so the land plane is exact.
                adv_terr = self.passable.gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1)
                adv = def_dead & ~atk_dead & ~self._blocked_for(tgt.unsqueeze(1), "pmil").squeeze(1) & adv_terr
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
                # B-4: rival defender veterancy (barbs none), dropped by the
                # embarked override below (like B-7 support).
                v_lvl5 = torch.where(is_b, torch.zeros_like(is_b, dtype=torch.long), self._xp_lvl_bonus(self.v_xp.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)))
                def_cs = torch.where(is_b, b_cs, v_cs) + self._tdef_g(tc) + torch.where(is_b, b_fy, v_fy) * 3 + v_lvl5  # B-5 + B-4
                # #45/B-6: embarked rival defender → flat CS, no terrain/support.
                v_embd = self.v_emb.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1) & ~is_b
                def_cs = torch.where(v_embd, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                # B-29: ranged attacker + defender wounded (no river for ranged).
                b_hp = self.u_hp.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                v_hpd = self.v_hp.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1)
                atk_e = atk_rs - self._wound(self.p_hp[:, p]) + p_lvl5  # B-4 attacker veterancy
                def_e = def_cs - self._wound(torch.where(is_b, b_hp, v_hpd))
                # B-7 support (no flanking: a ranged attacker takes no retaliation).
                _dside = torch.where(is_b, torch.ones_like(v_civ), torch.full_like(v_civ, 2))
                _, _sp = self._flank_support(tgt, _dside, v_civ, torch.full_like(tgt, -1))
                def_e = def_e + SUPPORT_CS * torch.where(v_embd, torch.zeros_like(_sp), _sp)
                # B6-S1: rival-defender enhancer adders (embarked = flat, none).
                def_e = def_e + torch.where(v_embd, torch.zeros_like(def_e), self._rel_def_cs(torch.where(is_b, torch.full_like(v_civ, -1), v_civ), tgt).to(def_e.dtype))
                # B7-G (B-8): aura — player attacker (civ 0) keyed on its own tile;
                # rival defender (v_civ+1) keyed on `tgt` (barb → none). Naval/embarked → ADMIRAL plane.
                atk_naval = self.unit_naval[self.p_type[:, p].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, p]
                atk_e = atk_e + self._gen_aura_cs(torch.zeros_like(v_civ), self.p_tile[:, p], atk_naval).to(atk_e.dtype)
                _v_def_nav = self.unit_naval[self.v_type.gather(1, vslot.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)]
                def_naval = v_embd | torch.where(is_b, torch.zeros_like(v_embd), _v_def_nav)
                def_e = def_e + self._gen_aura_cs(torch.where(is_b, torch.full_like(v_civ, -1), v_civ + 1), tgt, def_naval).to(def_e.dtype)
                d_def = self._damage_roll(r_att, atk_e - def_e, k="rng", tile=tgt)
                rows = r_att.nonzero(as_tuple=True)[0]
                r_def_dead = torch.zeros_like(r_att)
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
                    r_def_dead[g[dead]] = True
                    at_map[g[dead], tc[g[dead]]] = -1
                    alive_t[g[dead], ds[dead]] = False
                # B-4: a surviving rival MILITARY defender earns +2 (rv_at map).
                surv_rv = (r_att & ~is_b & ~r_def_dead).nonzero(as_tuple=True)[0]
                if len(surv_rv) > 0:
                    self.v_xp[surv_rv, vslot[surv_rv]] += XP_DEFEND
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
                def_cs = self._tdef_g(tc).to(atk_rs.dtype)  # civilian combat 0 + terrain
                # #45/B-6: an embarked lone civilian defends at the flat CS (TS
                # defenderCS applies the override to any defender, civilian too).
                civ_embd = self.v_emb.gather(1, rvc_slot_t.clamp(min=0).unsqueeze(1)).squeeze(1)
                def_cs = torch.where(civ_embd, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                # B-29: attacker + the lone rival civilian defender both wounded.
                # B-4: attacker veterancy; the civilian defender never accrues xp
                # (never fights) so its CS carries no level term.
                civ_hp = self.v_hp.gather(1, rvc_slot_t.clamp(min=0).unsqueeze(1)).squeeze(1)
                atk_e = atk_rs - self._wound(self.p_hp[:, p]) + p_lvl5  # B-4 attacker veterancy
                def_e = def_cs - self._wound(civ_hp)
                # B-7 support: the lone rival civilian is aided by adjacent
                # same-civ rival military (no flanking on a ranged strike).
                # #45/B-6: an embarked civilian receives NO support.
                _, _sp = self._flank_support(tgt, torch.full_like(tgt, 2), rvc_civ_t, torch.full_like(tgt, -1))
                def_e = def_e + SUPPORT_CS * torch.where(civ_embd, torch.zeros_like(_sp), _sp)
                # B6-S1: the lone rival CIVILIAN defender gets the enhancer
                # defender adders too (TS defenderCS applies to any unit).
                def_e = def_e + torch.where(civ_embd, torch.zeros_like(def_e), self._rel_def_cs(rvc_civ_t, tgt).to(def_e.dtype))
                # B7-G (B-8): attacker aura only — the defender is a CIVILIAN
                # (combat 0), and combat.generalAuraCS returns 0 for civilians,
                # so no defender term joins here.
                atk_naval = self.unit_naval[self.p_type[:, p].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, p]
                atk_e = atk_e + self._gen_aura_cs(torch.zeros(self.B, dtype=torch.long, device=self.device), self.p_tile[:, p], atk_naval).to(atk_e.dtype)
                d_def = self._damage_roll(r_civ, atk_e - def_e, k="rng", tile=tgt)
                rows = r_civ.nonzero(as_tuple=True)[0]
                ks = rvc_slot_t[rows]
                self.v_hp[rows, ks] -= d_def[rows]
                dead = self.v_hp[rows, ks] <= 0
                self.v_alive[rows[dead], ks[dead]] = False
                self.rvciv_at[rows[dead], tc[rows[dead]]] = -1
                if bool(dead.any()):
                    self._gen_ver += 1  # B7-G (B-8): the killed civilian may be a general → invalidate the aura plane
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
                atk_e = atk_cs - self._wound(self.p_hp[:, p]) - 5.0 * self._river_cross(here, tgt) + p_lvl5  # B-29 wound + river (CS center not a unit) + B-4 veterancy
                # #70/S2 (B-8): aura on the CS assault (attackCityState's atkCS),
                # added once so the cstyc counter-roll sees the same atk_e.
                atk_naval = self.unit_naval[self.p_type[:, p].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, p]
                atk_e = atk_e + self._gen_aura_cs(torch.zeros_like(here), self.p_tile[:, p], atk_naval).to(atk_e.dtype)
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
                atk_e2 = self._p_rng_str[self.p_type[:, p]] - self._wound(self.p_hp[:, p]) + p_lvl5  # B-29 (city not a unit) + B-4 veterancy
                # #70/S2 (B-8): the general/admiral aura covers ranged bombardment
                # of a rival city too (the combat.ts 'rngrc' twin). Player seat →
                # unified civ 0; naval/embarked select the ADMIRAL plane.
                _rngrc_nav = self.unit_naval[self.p_type[:, p].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, p]
                atk_e2 = atk_e2 + self._gen_aura_cs(
                    torch.zeros(self.B, dtype=torch.long, device=self.device), self.p_tile[:, p], _rngrc_nav
                ).to(atk_e2.dtype)
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
                atk_e3 = self._p_rng_str[self.p_type[:, p]] - self._wound(self.p_hp[:, p]) + p_lvl5  # B-29 (CS center not a unit) + B-4 veterancy
                # #70/S2 (B-8): aura inside the ranged-strength parentheses,
                # after xpLevelBonus (rangedAttack's city-state branch).
                atk_naval = self.unit_naval[self.p_type[:, p].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, p]
                atk_e3 = atk_e3 + self._gen_aura_cs(torch.zeros_like(here), self.p_tile[:, p], atk_naval).to(atk_e3.dtype)
                d_cs3 = self._damage_roll(r_cs, atk_e3 - def_cs3, k="rngcs", tile=tgt)
                rows3 = r_cs.nonzero(as_tuple=True)[0]
                self.cs_hp[rows3, cs_sc[rows3]] = torch.maximum(
                    self.cs_hp[rows3, cs_sc[rows3]] - d_cs3[rows3],
                    torch.ones_like(d_cs3[rows3]),
                )
                self.p_acted[:, p] = self.p_acted[:, p] | r_cs

            # B-4: the player attacker earns +5 for ANY attack it executed this
            # iteration that produced a damage roll (melee vs unit, ranged vs
            # unit/civilian, city-state melee, rival-city/CS bombardment, and the
            # rival-city siege). The roll-free B-31 civilian CAPTURE (civk) grants
            # no xp. Player units are never barbarian, so accrue unconditionally.
            p_attacked = att | r_att | r_civ | cs_hit | r_sieg | r_cs | siege
            self.p_xp[:, p] = torch.where(p_attacked, self.p_xp[:, p] + XP_ATTACK, self.p_xp[:, p])

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
                # A-21 (#50): 24 = PILLAGE — the playerPillage twin. Improvement
                # first, else a complete non-centre district (the B-32 order);
                # PILLAGE_HEAL improvements heal +25; the turn is spent.
                _rvp = self.rival_at.gather(1, hc0.unsqueeze(1)).squeeze(1)
                _en = ((_rvp >= 0) & self.r_atwar.gather(1, _rvp.clamp(min=0).unsqueeze(1)).squeeze(1)) | (
                    self.cs_at.gather(1, hc0.unsqueeze(1)).squeeze(1) >= 0
                )
                _hi = (self.improvement.gather(1, hc0.unsqueeze(1)).squeeze(1) >= 0) & ~self.pillaged.gather(1, hc0.unsqueeze(1)).squeeze(1)
                _hd = (
                    (self.district.gather(1, hc0.unsqueeze(1)).squeeze(1) >= 0)
                    & self.district_complete.gather(1, hc0.unsqueeze(1)).squeeze(1)
                    & ~self.district_pillaged.gather(1, hc0.unsqueeze(1)).squeeze(1)
                    & (self.center_at.gather(1, hc0.unsqueeze(1)).squeeze(1) < 0)
                    & (self.rvcity_at.gather(1, hc0.unsqueeze(1)).squeeze(1) < 0)
                )
                ok_pl = (a == 24) & self.p_alive[:, p] & (self._p_combat[self.p_type[:, p]] > 0) & _en & (_hi | _hd)
                if bool(ok_pl.any()):
                    _pi = ok_pl & _hi
                    if bool(_pi.any()):
                        _r3 = _pi.nonzero(as_tuple=True)[0]
                        self.pillaged[_r3, hc0[_r3]] = True
                        _heal = self._imp_heals[self.improvement[_r3, hc0[_r3]].clamp(min=0)]
                        _cap = self.rules.combat.get("unitHp", 100)
                        self.p_hp[_r3, p] = torch.where(
                            _heal, (self.p_hp[_r3, p] + 25).clamp(max=_cap), self.p_hp[_r3, p]
                        )
                    _pd = ok_pl & ~_hi & _hd
                    if bool(_pd.any()):
                        _r4 = _pd.nonzero(as_tuple=True)[0]
                        self.district_pillaged[_r4, hc0[_r4]] = True
                    self.p_acted[:, p] = self.p_acted[:, p] | ok_pl
                    self._eff_version += 1
                # A-18 (#50): 18-23 = place a RESOURCE improvement (or the
                # Seaside Resort) on the builder's tile — the builderImprove
                # twin, re-validated here exactly as the mask computed it.
                if self.improvements_on and self._builder_idx >= 0:
                    _rq2 = self.res_imp.gather(1, hc0.unsqueeze(1)).squeeze(1)
                    _b2 = (
                        self.p_alive[:, p]
                        & (self.p_type[:, p] == self._builder_idx)
                        & (self.p_charges[:, p] > 0)
                        & (self.owner.gather(1, hc0.unsqueeze(1)).squeeze(1) >= 0)
                        & (self.center_at.gather(1, hc0.unsqueeze(1)).squeeze(1) < 0)
                        & (self.improvement.gather(1, hc0.unsqueeze(1)).squeeze(1) < 0)
                        & (self.district.gather(1, hc0.unsqueeze(1)).squeeze(1) < 0)
                        & (self.built_wonder.gather(1, hc0.unsqueeze(1)).squeeze(1) < 0)
                    )
                    for _k in range(3, self._imp_unlock.numel()):
                        _ut2 = int(self._imp_unlock[_k])
                        _unl2 = self.techs[:, _ut2] if _ut2 >= 0 else torch.ones_like(_b2)
                        if self.SEASIDE >= 0 and _k == self.SEASIDE:
                            _valid = self._seaside_ok().gather(1, hc0.unsqueeze(1)).squeeze(1)
                        else:
                            _valid = _rq2 == _k
                        _ok2 = (a == (18 + _k - 3)) & _b2 & _valid & _unl2
                        if bool(_ok2.any()):
                            _r2 = _ok2.nonzero(as_tuple=True)[0]
                            self.improvement[_r2, hc0[_r2]] = _k
                            self.p_charges[:, p] = torch.where(_ok2, self.p_charges[:, p] - 1, self.p_charges[:, p])
                            _gone = _ok2 & (self.p_charges[:, p] <= 0)
                            if bool(_gone.any()):
                                _g2 = _gone.nonzero(as_tuple=True)[0]
                                self.pciv_at[_g2, self.p_tile[_g2, p]] = -1
                                self.p_alive[:, p] = self.p_alive[:, p] & ~_gone
                            self._eff_version += 1
                # A-18 (#50): 17 = builder REPAIR — the `builderRepair` twin.
                # Clears a pillaged IMPROVEMENT first, else a pillaged DISTRICT
                # (the TS order), spends the turn, costs NO charge.
                ok_rp = (
                    (a == 17)
                    & self.p_alive[:, p]
                    & (self.p_type[:, p] == self._builder_idx)
                    & (self.owner.gather(1, hc0.unsqueeze(1)).squeeze(1) >= 0)
                    & (
                        self.pillaged.gather(1, hc0.unsqueeze(1)).squeeze(1)
                        | self.district_pillaged.gather(1, hc0.unsqueeze(1)).squeeze(1)
                    )
                )
                if bool(ok_rp.any()):
                    rr_ = ok_rp.nonzero(as_tuple=True)[0]
                    tt_ = hc0[rr_]
                    _imp = self.pillaged[rr_, tt_]
                    self.pillaged[rr_[_imp], tt_[_imp]] = False
                    _dis = ~_imp & self.district_pillaged[rr_, tt_]
                    self.district_pillaged[rr_[_dis], tt_[_dis]] = False
                    self.p_acted[:, p] = self.p_acted[:, p] | ok_rp
                    self._eff_version += 1
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
                # B-17 (#71): a LIVE enemy Encampment bars the step (walkPath's
                # blockedByEnemy twin — the melee arm is the only way in).
                # (player hostility is side-independent, so "pmil" covers both)
                & ~self._encamp_block(tgt.clamp(min=0).unsqueeze(1), "pmil").squeeze(1)
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
        # AUDIT B-26 (ROUND B10): the shared barb MELEE era-ladder type index
        # (u_type 0/1/2/3 = WARRIOR/SPEARMAN/PIKEMAN/MUSKETMAN), mirroring the
        # TS barbMeleeType. self.turn is a batch scalar, so one index serves the
        # whole batch. Used at ALL THREE spawn sites (new camp, empty-camp
        # regarrison, the 0.1-roll raid). Ranged raiders are a recorded residual.
        # B-26 (#71): barb u_type 6 = SCOUT (see the exported unitCombat table).
        self._barb_scout_type = 6 if self._unit_combat.numel() > 6 else 0
        self._barb_scout_live = bool(self.rules.combat.get("barbScoutOpenerLive", False))  # B-26 (#71): inert pending its hunt
        melee_type = (
            3 if self.turn > cb.get("musketmanAfterTurn", 180)
            else 2 if self.turn > cb.get("pikemanAfterTurn", 120)
            else 1 if self.turn > cb.get("spearmanAfterTurn", 60)
            else 0
        )
        # #70/S5 (B-26): the RANGED barb ladder (barbRangedType) — u_type
        # 4 = ARCHER, 5 = CROSSBOWMAN after turn 120. Used at the RAID spawn
        # site only, and only for every THIRD camp by its INDEX in the camp
        # list (campNo % 3 === 0). Spawn TYPE only: the 0.1 raid roll is
        # untouched, so this stays draw-count neutral.
        ranged_type = 5 if self.turn > cb.get("crossbowmanAfterTurn", 120) else 4
        # B-26 (2026-07-27): the barb NAVAL ladder — GALLEY, then QUADRIREME
        # past the same era turn the crossbow ladder uses.
        self._barb_naval_type = (
            self._barb_quad_idx
            if self.turn > cb.get("crossbowmanAfterTurn", 120)
            else self._barb_galley_idx
        )

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
                # B-26 (#71): SCOUT-THEN-RAID — a BRAND-NEW camp opens with a
                # SCOUT (barb u_type 6), the TS barbScoutType twin. Regarrison
                # and raid sites keep the melee/ranged ladders. Spawn TYPE only,
                # so the camp roll above is untouched and this is draw-neutral.
                self._spawn_barb(has, spot, self._barb_scout_type if self._barb_scout_live else melee_type)

        # Garrisons + growth. The near-camp check uses the unit list as it
        # stood BEFORE this loop (TS snapshots `barbs` first); the cap check
        # recounts live (TS calls barbUnits() fresh inside the condition).
        # The camp↔unit distance matrix is hoisted (5b): camps don't move,
        # and units spawned mid-loop are invisible to the pre_alive mask.
        pre_alive = self.u_alive.clone()
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
            self._spawn_barb(active & ~near_any, camp, melee_type)  # B-26 era ladder (empty camp regarrisons)
            can_grow = active & near_any & (self.u_alive.sum(dim=1) < self.n_camps * cb.get("maxBarbPerCamp", 3))
            r = self._next_random(can_grow)
            # #70/S5 (B-26): every THIRD camp raids RANGED, the rest melee. `k`
            # IS the TS `campNo`: camps append at n_camps and _clear_camp_at
            # splices left exactly like state.barbCamps.splice, so slots
            # 0..n_camps-1 are dense and in the same order as the TS array.
            grow_type = ranged_type if k % 3 == 0 else melee_type
            _raid = can_grow & (r < cb.get("garrisonGrowChance", 0.1))
            # B-26 (2026-07-27): NAVAL barbs. Every FOURTH camp (a residue that
            # never collides with the ranged rule) puts out a HULL instead when
            # it is coastal, on the LOWEST-index free water neighbour. Zero-draw
            # — the 0.1 roll above already fired and nothing else is consulted.
            _nav_done = torch.zeros_like(_raid)
            if k % 4 == 1 and self._barb_naval_type >= 0:
                _nb = self.neigh[camp.clamp(min=0)]  # [B, 6]
                _nbc = _nb.clamp(min=0)
                _free = (
                    (_nb >= 0)
                    & self.wpass.gather(1, _nbc)
                    & ~self.ocean_tile.gather(1, _nbc)  # barbs have no CARTOGRAPHY
                    & (self.barb_at.gather(1, _nbc) < 0)
                    & (self.pmil_at.gather(1, _nbc) < 0)
                    & (self.pciv_at.gather(1, _nbc) < 0)
                    & (self.rv_at.gather(1, _nbc) < 0)
                    & (self.rvciv_at.gather(1, _nbc) < 0)
                )
                _key = torch.where(_free, _nb, torch.full_like(_nb, self.T + 1))
                _best = _key.min(dim=1).values
                _nav = _raid & (_best <= self.T)
                if bool(_nav.any()):
                    self._spawn_barb(_nav, _best.clamp(max=self.T - 1), self._barb_naval_type, naval=True)
                    _nav_done = _nav
            self._spawn_barb(_raid & ~_nav_done, camp, grow_type)

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
        # #70/S5 (B-26): which barb slots are RANGED (ARCHER/CROSSBOWMAN).
        # Hoisted — nothing spawns barbs inside the raider loop, so u_type is
        # fixed here; the batch-wide flag keeps the pre-S5 melee-only path at
        # ONE extra host sync per turn instead of one per slot.
        u_rngd_all = self.u_alive & (self._u_rng_str[self.u_type.clamp(min=0, max=self._u_rng_str.numel() - 1)] > 0)
        any_rngd = bool(u_rngd_all.any())
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
            # B-17 (#71): an adjacent LIVE Encampment is a melee target for a
            # barbarian too (hostile to every owner) — attackTargets' encampTarget.
            enc_nb = self._encamp_block(nb, "barb") if self._encamp_didx >= 0 else None
            valid = (nb >= 0) & ((ctr >= 0) | has_unit | rvc | (enc_nb if enc_nb is not None else False))
            tkey = torch.where(valid, nb, T + 1)
            target_tile = tkey.min(dim=1).values
            # #70/S5 (B-26): a RANGED raider (ARCHER/CROSSBOWMAN) scans its FULL
            # range instead — attackTargets over the whole map in TILE ORDER
            # (the A-6 convention), d in [1, range]. Target classes mirror TS
            # exactly for a barbarian: `hasEnemy` (any hostile unit — player or
            # rival, military or civilian; a barb is never hostile to a barb)
            # and `playerCity`, which keys on district === 'CITY_CENTER' with
            # hostileToPlayer always true for barbs — so EVERY city-center tile
            # (the player's AND any rival's) is in reach at d <= range. The
            # `rivalCity` clause (barbarian, d === 1) is subsumed by it. CITY-
            # STATE centers carry no district in TS, so they are NOT targets
            # (same as the melee scan). Gated on `.any()` so a batch with no
            # ranged barb pays nothing for the [B, T] scan.
            rngd = u_rngd_all[:, u]
            if any_rngd and bool((act & rngd).any()):
                rng_u = self._u_rng_rng[self.u_type[:, u].clamp(min=0, max=self._u_rng_rng.numel() - 1)]
                d_all = self.pair_dist[here.clamp(min=0)].to(torch.long)  # [B, T]
                r_valid = (
                    (d_all >= 1)
                    & (d_all <= rng_u.unsqueeze(1))
                    & (
                        (self.pmil_at >= 0) | (self.pciv_at >= 0) | (self.rv_at >= 0) | (self.rvciv_at >= 0)
                        | (self.center_at >= 0) | (self.rvcity_at >= 0)
                    )
                )
                r_key = torch.where(r_valid, self._arangeT.unsqueeze(0).expand(B, T), torch.full((B, T), T + 1, dtype=torch.long, device=dev))
                target_tile = torch.where(rngd, r_key.min(dim=1).values, target_tile)
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
            city_att = attack & ~rngd & (tgt_city >= 0)
            unit_att = attack & ~rngd & (tgt_city < 0) & has_u
            rvc_att = attack & ~rngd & (tgt_city < 0) & ~has_u & (self.rvcity_at.gather(1, ttc.unsqueeze(1)).squeeze(1) >= 0)
            enc_att = (
                attack
                & ~rngd
                & (tgt_city < 0)
                & ~has_u
                & (self.rvcity_at.gather(1, ttc.unsqueeze(1)).squeeze(1) < 0)
                & self._encamp_block(ttc.unsqueeze(1), "barb").squeeze(1)
                if self._encamp_didx >= 0
                else None
            )

            if bool(city_att.any()):
                self._hostile_city_attack(city_att, tgt_city, "barb", u)
            if bool(unit_att.any()):
                self._hostile_vs_unit(unit_att, ttc, "barb", u)
            if bool(rvc_att.any()):
                self._attack_rival_city(rvc_att, ttc, u)
            if enc_att is not None and bool(enc_att.any()):
                self._attack_encampment(enc_att, ttc, "barb", u)
            acted_att = city_att | unit_att | rvc_att
            if enc_att is not None:
                acted_att = acted_att | enc_att
            # #70/S5 (B-26): a RANGED raider strikes instead — hostileUnitAct
            # routes any UNITS[type].ranged attacker through hostileRangedStrike:
            # ONE roll, no retaliation, no advance, civilians take the roll, a
            # PLAYER city floors at 1 HP and is never captured. The method
            # returns the rows that actually rolled — a "quirk" row (an
            # ungarrisoned RIVAL center in reach: TS `enemyCity` resolves to
            # PLAYER cities only, so no city is battered and no unit is there)
            # spends nothing, but `attack` still HOLDS the unit (TS returns from
            # hostileUnitAct before the pillage/march branches).
            r_att = attack & rngd
            if any_rngd and bool(r_att.any()):
                acted_att = acted_att | self._hostile_ranged_strike(r_att, ttc, "barb", u)
            self.u_acted[:, u] = self.u_acted[:, u] | acted_att  # P4/D-2

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

            # AUDIT B-32: else pillage the DISTRICT underfoot — a COMPLETE,
            # non-CITY_CENTER (self.district excludes centers by construction),
            # unpillaged enemy district. No heal, no loot (v1). Barbs raid
            # RIVAL districts too (C-4a), the hostileUnitAct district branch.
            dist_pillage = torch.zeros_like(act)
            if self.districts_on:
                h_dist = self.district.gather(1, here.unsqueeze(1)).squeeze(1)
                h_dcomp = self.district_complete.gather(1, here.unsqueeze(1)).squeeze(1)
                h_dunpil = ~self.district_pillaged.gather(1, here.unsqueeze(1)).squeeze(1)
                h_downed = (self.owner.gather(1, here.unsqueeze(1)).squeeze(1) >= 0) | (
                    self.rival_at.gather(1, here.unsqueeze(1)).squeeze(1) >= 0
                )
                dist_pillage = act & ~attack & ~pillage & (h_dist >= 0) & h_dcomp & h_dunpil & h_downed
                if bool(dist_pillage.any()):
                    rows = dist_pillage.nonzero(as_tuple=True)[0]
                    self.district_pillaged[rows, here[rows]] = True
                    self.u_acted[rows, u] = True  # P4/D-2
                    self._eff_version += 1  # CACHE: rival/player district yields just dropped

            # March target: the nearest unpillaged owned improvement OR district
            # (the B-32 union) within dist < 13 (ties → lowest tile index), else
            # the nearest alive city (ties → founding order) — hostileUnitAct's
            # widened target scan (raiders head for your farms AND districts).
            march = act & ~attack & ~pillage & ~dist_pillage
            if not bool(march.any()):
                continue
            arangeT = torch.arange(T, device=dev)
            if self.improvements_on or self.districts_on:
                _owned = (self.owner >= 0) | (self.rival_at >= 0)  # [B, T] (C-4a: rival tiles tempt barbs too)
                imp_job = (self.improvement >= 0) & ~self.pillaged & _owned  # [B, T]
                if self.districts_on:  # B-32: pillageable districts join the union
                    imp_job = imp_job | ((self.district >= 0) & self.district_complete & ~self.district_pillaged & _owned)
                d_imp = self.pair_dist[here.unsqueeze(1), arangeT.unsqueeze(0)].to(torch.long)
                ikey = torch.where(imp_job & (d_imp < 13), d_imp * (T + 1) + arangeT, torch.full_like(d_imp, 10**9))
                imp_min, imp_tgt = ikey.min(dim=1)
                has_imp = imp_min < 10**9
            else:
                has_imp = torch.zeros_like(act)
                imp_tgt = here.clamp(min=0)
            dc = self.pair_dist[here.unsqueeze(1), self.site.clamp(min=0)].to(torch.long)  # [B, C]
            # B9-R1 hunt catch (rng 2026006104 t78): distance ties break by TS
            # ARRAY order = FOUNDING sequence (stable sort over state.cities),
            # which diverges from the slot index once a capture reuses a hole
            # (P5/S2). city_seq is the founding sequence — rank on it.
            ckey = torch.where(self.alive, dc * 4096 + self.city_seq, 10**9)
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
            # the D-2 heal is blocked). EVERY barb ladder type (WARRIOR /
            # SPEARMAN / PIKEMAN / MUSKETMAN and #70/S5's ARCHER /
            # CROSSBOWMAN) has UNITS.moves == 2, so full_mp stays 2. Camps are
            # a barb no-op (clearCampFor skips barbarians).
            # B-26 (#71): READ the barb type's moves. This was a hardcoded 2,
            # correct only while every barb type had 2 MP — the SCOUT opener
            # has 3, and the mismatch showed up as a barb-count + draw-count
            # split at seed 9287 t250.
            full_mp = self._u_moves[self.u_type[:, u].clamp(min=0, max=self._u_moves.numel() - 1)]
            mp = full_mp.clone()
            cur = here.clone()
            d_cur = d_here.clone()
            moving = march & has_tgt
            while bool(moving.any()):
                nb2 = self.neigh[cur.clamp(min=0)]
                nb2c = nb2.clamp(min=0)
                # B-26 (2026-07-27): a NAVAL barb walks the WATER plane. Land
                # hulls and water hulls never share a plane, so this is the
                # whole change the barb march needs (TS's tileFreeForUnit
                # already branches on UNITS[type].naval).
                _navm = self._u_naval[self.u_type[:, u].clamp(min=0)].unsqueeze(1)
                _plane = torch.where(
                    _navm,
                    self.wpass.gather(1, nb2c) & ~self.ocean_tile.gather(1, nb2c),  # no CARTOGRAPHY
                    self.passable.gather(1, nb2c),
                )
                step_ok = (nb2 >= 0) & _plane & ~self._blocked_for(nb2, "barb")
                d_nb = self.pair_dist[tgt.unsqueeze(1), nb2c].to(torch.long)  # dist(neighbor, target); symmetric
                skey = torch.where(step_ok, d_nb * 8 + arange6, 10**9)
                best = skey.min(dim=1).values
                dir_i = (best % 8).clamp(max=5)
                dest = nb2.gather(1, dir_i.unsqueeze(1)).squeeze(1)
                _terr, _riv = self._road_terms(  # B-23 (#71): roads
                    cur, dest, 3 * ((self.river_mask.gather(1, cur.clamp(min=0).unsqueeze(1)).squeeze(1) >> dir_i) & 1)
                )
                cost = 1 + _terr + _riv
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
                # AUDIT B-26/B-3 ZOC (ROUND B10): a march step ending adjacent
                # to a hostile (player OR rival) non-embarked military halts the
                # barb (mp := 0), mirroring hostileUnitAct's per-step inEnemyZoc
                # check now that barbs obey ZOC. No new draws (pure geometry).
                zoc = mv & self._in_enemy_zoc_barb(cur)
                mp = torch.where(zoc, torch.zeros_like(mp), mp)
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
                # B-4: only a rival MILITARY target (is_rmil) carries veterancy.
                def_xp = torch.where(is_rmil, self._xp_lvl_bonus(self.v_xp[bidx, m_slot.clamp(min=0)]), torch.zeros_like(tt))
                def_cs = torch.where(is_barb, d_cs_barb, torch.where(is_rmil, d_cs_rmil, d_cs_rciv)) + self._tdef_i(bidx, tt) + def_xp  # + B-4
                # #45/B-6: an embarked rival target (military/civilian; barbs
                # never embark) → flat CS, no terrain (and no support below).
                d_emb = (self.v_emb[bidx, m_slot.clamp(min=0)] & is_rmil) | (self.v_emb[bidx, c_slot.clamp(min=0)] & is_rciv)
                def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
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
                def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)  # #45/B-6: embarked → no support
                # #70/S2 (B-8): a general/admiral shields its units from CITY
                # fire too (TS defCSa). DEFENDER side — the roll is
                # atk_cs - def_e, so the aura REDUCES the damage taken. Added
                # OUTSIDE the embarked override (an embarked defender keeps its
                # flat CS but still gets its ADMIRAL's aura). Only a rival
                # MILITARY target carries one: barbs have no generals and a
                # rival CIVILIAN is combat-0 (combat.generalAuraCS returns 0).
                _def_civ_u = torch.where(is_rmil, self.v_civ[bidx, m_slot.clamp(min=0)] + 1, torch.full_like(tt, -1))
                _def_nav = torch.where(is_rmil, self.unit_naval[self.v_type[bidx, m_slot.clamp(min=0)].clamp(min=0, max=self.NU - 1)], torch.zeros_like(d_emb))
                def_e = def_e + self._gen_aura_cs(_def_civ_u, tt, d_emb | _def_nav).to(def_e.dtype)
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
                # B-4: a surviving rival MILITARY defender earns +2 (attacker is
                # the city — no attacker xp; barb / rival civilian never accrue).
                surv_rm = (strike & is_rmil).nonzero(as_tuple=True)[0]
                if len(surv_rm) > 0:
                    alive_now = self.v_hp[surv_rm, m_slot[surv_rm]] > 0
                    sp = surv_rm[alive_now]
                    if len(sp) > 0:
                        self.v_xp[sp, m_slot[sp]] += XP_DEFEND

        # B-17 (ROUND B7): the ADDITIONAL Encampment strike (the pestk twin of
        # the pcstk walls strike above). A PLAYER city owning a COMPLETE LIVE
        # unpillaged ENCAMPMENT fires the same once/turn ranged strike — range
        # 2, nearest player-hostile unit, one roll at cityDefenseStrength, no
        # retaliation, never captures — under k="pestk". DRAW ORDER: this pass
        # runs AFTER the whole walls pass (walls first, then Encampment), both
        # scanning cities in walk_ord order, so a city with both rolls twice
        # (walls in the loop above, Encampment here). No Encampment HP pool.
        if self._encamp_didx >= 0 and self.districts_on:
            Bn, Tn, dev2 = self.B, self.T, self.device
            bidx = torch.arange(Bn, device=dev2)
            arangeT = torch.arange(Tn, device=dev2)
            rcap = max(self.R - 1, 0)
            walk_ord = torch.argsort(torch.where(self.alive, self.city_seq, self.city_seq + 10**6), dim=1, stable=True)
            owner_oh = torch.nn.functional.one_hot(self.owner.clamp(min=0), self.C).bool() & (self.owner >= 0).unsqueeze(2)  # [B,T,C]
            has_enc = (((self.district == self._encamp_didx) & self.district_complete & ~self.district_dead & ~self.district_pillaged & (self.encamp_hp > 0)).unsqueeze(2) & owner_oh).any(dim=1)  # [B,C] city owns a completed LIVE unpillaged Encampment; B-17 (#71): an Encampment beaten to 0 HP is occupied and fires nothing
            for s_rank in range(self.C):
                col = walk_ord[:, s_rank]  # [B] — this game's s_rank-th city (TS array order)
                enc_city = self.alive[bidx, col] & has_enc[bidx, col]
                if not bool(enc_city.any()):
                    continue
                ctr = self.site[bidx, col].clamp(min=0)  # [B]
                dist = self.pair_dist[ctr].to(torch.long)  # [B, T]
                barb_h = self.barb_at >= 0
                rvn = self.rv_at
                rmil_h = (rvn >= 0) & self.r_atwar.gather(1, self.v_civ.gather(1, rvn.clamp(min=0)).clamp(max=rcap))
                rcvn = self.rvciv_at
                rciv_h = (rcvn >= 0) & self.r_atwar.gather(1, self.v_civ.gather(1, rcvn.clamp(min=0)).clamp(max=rcap))
                hostile = barb_h | rmil_h | rciv_h  # [B, T]
                valid = enc_city.unsqueeze(1) & hostile & (dist >= 1) & (dist <= 2)
                key = torch.where(valid, dist * (Tn + 1) + arangeT.view(1, -1), torch.full((Bn, Tn), 10**9, device=dev2, dtype=torch.long))
                best_key = key.min(dim=1).values
                tt = key.argmin(dim=1)  # [B] target tile (garbage where no target)
                strike = enc_city & (best_key < 10**9)
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
                def_xp = torch.where(is_rmil, self._xp_lvl_bonus(self.v_xp[bidx, m_slot.clamp(min=0)]), torch.zeros_like(tt))
                def_cs = torch.where(is_barb, d_cs_barb, torch.where(is_rmil, d_cs_rmil, d_cs_rciv)) + self._tdef_i(bidx, tt) + def_xp
                d_emb = (self.v_emb[bidx, m_slot.clamp(min=0)] & is_rmil) | (self.v_emb[bidx, c_slot.clamp(min=0)] & is_rciv)
                def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                gar = (self.pmil_at[bidx, ctr] >= 0).long()  # cityDefenseStrength garrison +5
                atk_cs = torch.maximum(self.best_melee, torch.full_like(self.best_melee, 15)) + gar * 5
                def_hp = torch.where(is_barb, self.u_hp[bidx, b_slot.clamp(min=0)], torch.where(is_rmil, self.v_hp[bidx, m_slot.clamp(min=0)], self.v_hp[bidx, c_slot.clamp(min=0)]))
                def_e = def_cs - self._wound(def_hp)
                _dside = torch.where(is_barb, torch.ones(Bn, dtype=torch.long, device=dev2), torch.full((Bn,), 2, dtype=torch.long, device=dev2))
                _dciv = torch.where(is_rmil, self.v_civ[bidx, m_slot.clamp(min=0)], self.v_civ[bidx, c_slot.clamp(min=0)])
                _, _sp = self._flank_support(tt, _dside, _dciv, torch.full((Bn,), -1, dtype=torch.long, device=dev2))
                def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)
                # #70/S2 (B-8): the pcstk mirror — defender-side aura (rival
                # MILITARY only; barb/civilian none), outside the embarked override.
                _def_civ_u = torch.where(is_rmil, self.v_civ[bidx, m_slot.clamp(min=0)] + 1, torch.full_like(tt, -1))
                _def_nav = torch.where(is_rmil, self.unit_naval[self.v_type[bidx, m_slot.clamp(min=0)].clamp(min=0, max=self.NU - 1)], torch.zeros_like(d_emb))
                def_e = def_e + self._gen_aura_cs(_def_civ_u, tt, d_emb | _def_nav).to(def_e.dtype)
                d = self._damage_roll(strike, atk_cs - def_e, k="pestk", tile=tt)
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
                surv_rm = (strike & is_rmil).nonzero(as_tuple=True)[0]
                if len(surv_rm) > 0:
                    alive_now = self.v_hp[surv_rm, m_slot[surv_rm]] > 0
                    sp = surv_rm[alive_now]
                    if len(sp) > 0:
                        self.v_xp[sp, m_slot[sp]] += XP_DEFEND

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
        # B-17 (#71): the ENCAMPMENT garrison repairs on the SAME unbesieged
        # gate and rate as the wall pool (the TS barbarianPhase twin — the gate
        # is the CITY's siege state, not the district's own adjacency).
        if self._encamp_didx >= 0:
            _enc_t = (
                (self.district == self._encamp_didx)
                & self.district_complete
                & ~self.district_pillaged
                & ~self.district_dead  # captured: TS's fresh City has no districts
                & (self.owner >= 0)
            )
            _unbes = self.alive & ~besieged  # [B, C]
            _heal_t = _enc_t & _unbes.gather(1, self.owner.clamp(min=0))
            self.encamp_hp = torch.where(
                _heal_t,
                (self.encamp_hp + cb.get("cityHealPerTurn", 20)).clamp(max=self._encamp_hp_max),
                self.encamp_hp,
            )

    # --- city-states (phase 4c) ---------------------------------------------------

    def _city_state_phase(self) -> None:
        """Mirrors cityStatePhase draw for draw: meeting (instant, fog off) →
        influence → envoys → quest resolve/issue per city-state in id order
        (issuing draws twice: the askable district, then the option pick —
        the trade-route option always exists here, so the pool is never
        empty) → cosmetic growth every 12 turns."""
        if self.S == 0:
            return
        # #50 (#79): tick the player<->city-state war clock FIRST, exactly where
        # cityStatePhase does — before meeting/influence/envoys.
        self.cs_war_turns = self.cs_war_turns + self.cs_atwar.long()
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
                self._eff_version += 1  # #78 HUNT: quest envoys move capital yields too
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

    def _spawn_rival(self, mask: torch.Tensor, at_tile: torch.Tensor, type_idx: torch.Tensor, civ: int, init_xp: torch.Tensor | None = None) -> torch.Tensor:
        """Rival units are military and share one append-only pool (per-civ
        order = state.units order filtered by civ, which per-civ loops use).
        Returns the LANDED mask (P5/S8: purchases refund on no spawn spot).
        B-17: init_xp ([B] long) seeds the unit's starting XP from its spawn
        city's Encampment training buildings (all spawns here are military)."""
        if not bool(mask.any()):
            return torch.zeros_like(mask)
        # #45/B-6: naval units probe over water (OCEAN gated on the civ's
        # CARTOGRAPHY). type_idx may be scalar or [B].
        ti_n = (type_idx if type_idx.dim() > 0 else type_idx.expand(self.B)).clamp(min=0, max=self.NU - 1)
        naval_m = self.unit_naval[ti_n] & mask
        cart_r = self.r_techs[:, civ, self._cartography_tech] if self._cartography_tech >= 0 else None
        found, spot = self._first_free_spot(at_tile, "rival", civ=civ, naval_mask=naval_m, cart=cart_r)
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
        # B-4/B-17: a fresh slot starts at 0 xp unless the training city grants Encampment XP (all rival spawns here are military).
        self.v_xp[rows, slot] = 0 if init_xp is None else init_xp[rows]
        self.v_aura_mp[rows, slot] = 0  # #70/S3 (B-8): no frozen grant until the first refresh (TS movesFull undefined)
        self.v_emb[rows, slot] = False  # #45/B-6: a fresh (possibly reclaimed) slot is ashore
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
            ok_b = unl_b & ~have_b & (~rdv.b_river.view(1, -1) | riv_c.unsqueeze(1)) & ~self._b_worship.view(1, -1)  # B9-R3: worship is faith-only
            reqd_b = rdv.b_req_district
            reg_t = self.rc_dist_tile[:, r, j].gather(1, reqd_b.clamp(min=0).unsqueeze(0).expand(B, -1))
            dcomp = (reg_t >= 0) & self.district_complete.gather(1, reg_t.clamp(min=0))
            ok_b &= torch.where(reqd_b.unsqueeze(0) >= 0, dcomp, ones_nb)
            for bi2, reqs in enumerate(self.rules.b_req_buildings):
                if reqs:
                    ok_b[:, bi2] &= have_b[:, torch.tensor(reqs, device=dev, dtype=torch.long)].any(dim=1)
            for bi2, excl in enumerate(self.rules.b_excl_buildings):  # B9-R1: exclusiveWith
                if excl:
                    ok_b[:, bi2] &= ~have_b[:, torch.tensor(excl, device=dev, dtype=torch.long)].any(dim=1)
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
            ok_u = ok_u & self._res_avail_mask(self.rival_at == r)  # B-9: rival strategic-resource gate (builder ungated → all-True)
            # scaffold districts: placeable NOW under the B4 gates
            ok_d = torch.zeros(B, nS, dtype=torch.bool, device=dev)
            if self.districts_on and self._scaffold:
                cap_max = torch.div(self.rc_pop[:, r, j] - 1, 3, rounding_mode="floor") + 1
                spec_cnt = ((self.rc_dist_tile[:, r, j] >= 0) & self._is_specialty).sum(dim=1)
                for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
                    has_tech = self.r_techs[:, r, utech] if utech >= 0 else (self.r_civics[:, r, uciv] if uciv >= 0 else torch.ones(B, dtype=torch.bool, device=dev))  # B9-R1: kind-aware
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
                    for bi2, excl in enumerate(self.rules.b_excl_buildings):  # B9-R1: exclusiveWith
                        if excl:
                            m2 = bi == bi2
                            if bool(m2.any()):
                                havex = self.rc_bldg[:, r, j][:, torch.tensor(excl, device=self.device, dtype=torch.long)].any(dim=1)
                                rb_ok = rb_ok & (~m2 | ~havex)
                    ok_now = ok_now & d_ok & rb_ok & ~self._b_worship.gather(0, bi)  # B9-R3: worship is faith-only
                    if bool(ok_now.any()):
                        rows_ = ok_now.nonzero(as_tuple=True)[0]
                        self.rc_bldg[rows_, r, j, bi[rows_]] = True
                        self._eff_version += 1  # B9-R2: a bought regional building reaches other cities this phase
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
                            # B-17: a purchased military unit inherits city j's Encampment training XP (best tier).
                            xp_rj = (self.rc_bldg[:, r, j, :].long() * self._b_train_xp.view(1, -1)).max(dim=1).values
                            landed = landed | self._spawn_rival(is_mil, ctr, ui, r, init_xp=xp_rj)
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
                for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
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
        # B-27 (#71): the SEASIDE RESORT joins the job set on RADIO.
        if self.SEASIDE >= 0 and self._seaside_unlock_tech >= 0:
            ok = ok | (self._seaside_ok() & tk[:, self._seaside_unlock_tech].unsqueeze(1))
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
        ) | (owned & self.pillaged) | (owned & self.district_pillaged)  # B-32: pillaged district = repair job

    def _rival_fort_job_mask(self, r: int, techs: torch.Tensor | None = None) -> torch.Tensor:
        """B-27 (#79) [B, T]: the MILITARY ENGINEER's job set — the isFortJobTile
        twin. Owned, LAND, unimproved, un-districted, not a centre, FORT
        unlocked, and ADJACENT to a tile held by a civ this rival is AT WAR
        with. ONE mask serves all three consumers (the production arm, the
        engineer's build-here test and its walk target), exactly as TS uses one
        predicate — the TS half originally used three different ones and the
        halves disagreed."""
        B = self.B
        dev = self.device
        if self.FORT < 0 or self._eng_idx < 0:
            return torch.zeros(B, self.T, dtype=torch.bool, device=dev)
        tk = techs if techs is not None else self.r_techs[:, r]
        ut = int(self._imp_unlock[self.FORT])
        unl = tk[:, ut].unsqueeze(1) if ut >= 0 else torch.ones(B, 1, dtype=torch.bool, device=dev)
        owned = self.rival_at == r
        base = (
            owned
            & unl
            & self.passable
            & ~self.water
            & ~self.nwonder  # validImprovementsIn refuses natural-wonder tiles
            & (self.improvement < 0)
            & (self.district < 0)
            & (self.built_wonder < 0)
            & (self.rvcity_at < 0)
        )
        if not bool(base.any()):
            return base
        # hostile territory: the PLAYER's tiles while at war with the player,
        # plus any rival this one is at war with (the atWarRivals twin).
        host = torch.zeros(B, self.T, dtype=torch.bool, device=dev)
        at_war_pl = self.r_atwar[:, r].unsqueeze(1)
        host = host | ((self.owner >= 0) & at_war_pl)
        for r2 in range(self.R):
            if r2 == r:
                continue
            pair = self.rr_war[:, r, r2].unsqueeze(1) if self.rr_war is not None else None
            if pair is None:
                continue
            host = host | ((self.rival_at == r2) & pair)
        nb = self.neigh.clamp(min=0)
        adj = (host[:, nb] & (self.neigh >= 0).unsqueeze(0)).any(dim=2)
        return base & adj

    def _spawn_rival_civ(self, mask: torch.Tensor, at_tile: torch.Tensor, civ: int, type_idx: int | None = None, charges: torch.Tensor | None = None) -> torch.Tensor:
        """C1-B5b: spawn a rival CIVILIAN (default BUILDER) — the civilian twin
        of _spawn_rival (rciv blocking; charges seeded from the roster like the
        player's). B6-S2: type_idx/charges override for the MISSIONARY buy
        (charges [B] carries the SCRIPTURE +1 per game).
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
        ti = self._builder_idx if type_idx is None else type_idx
        self.v_alive[rows, slot] = True
        self.v_civ[rows, slot] = civ
        self.v_type[rows, slot] = ti
        self.v_tile[rows, slot] = spot[rows]
        self.v_hp[rows, slot] = self.rules.combat.get("unitHp", 100)
        self.v_fortify[rows, slot] = 0  # B-5: civilian never fortifies; keep the (reclaimed) slot clean
        self.v_xp[rows, slot] = 0  # B-4: civilian never fights; keep the (reclaimed) slot at 0 xp
        self.v_aura_mp[rows, slot] = 0  # #70/S3 (B-8): civilian never auras; keep the (reclaimed) slot clean
        self.v_emb[rows, slot] = False  # #45/B-6: a fresh (possibly reclaimed) slot is ashore
        self.v_charges[rows, slot] = self._p_charges[ti] if charges is None else charges[rows]
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
        # B-27 (#71): SEASIDE_RESORT is appended LAST so ties keep
        # validImprovementsIn's push order (FARM > MINE > LUMBER > RESORT).
        # Its gain is DYNAMIC (gold = tile appeal), filled in per tile below.
        if self.SEASIDE >= 0 and self._seaside_unlock_tech >= 0:
            opts = opts + [(self.SEASIDE, 0.0)]
        # B-27 (#79): ENGINEERS act too when the flag is live — the widened TS
        # filter's twin. Gated on the same flag so both engines flip together.
        _is_civ_t = self.v_type == self._builder_idx
        if self._rival_eng_live and self._eng_idx >= 0:
            _is_civ_t = _is_civ_t | (self.v_type == self._eng_idx)
        cand = self.v_alive & (self.v_civ == r) & _is_civ_t & (self.v_charges > 0)
        if not bool(cand.any()):
            return
        for u in cand.any(dim=0).nonzero(as_tuple=True)[0].tolist():
            act = cand[:, u] & active
            if not bool(act.any()):
                continue
            here = self.v_tile[:, u].clamp(min=0)
            jobm = self._rival_job_mask(r, techs=techs0, civics=civics0)
            # B-27 (#79): an ENGINEER's job set is the BORDER fort set, not the
            # civilian one — the isFortJobTile twin. Per-ROW because a slot's
            # type varies across the batch. ONE mask feeds both the build-here
            # test and the walk target, matching the TS unification.
            _eng_row = (self.v_type[:, u] == self._eng_idx) if (self._rival_eng_live and self._eng_idx >= 0) else None
            if _eng_row is not None and bool(_eng_row.any()):
                jobm = torch.where(_eng_row.unsqueeze(1), self._rival_fort_job_mask(r, techs=techs0), jobm)
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
            # AUDIT B-32: a pillaged DISTRICT underfoot repairs next (the
            # builderRepair twin — TS checks bt.pillaged first, then
            # bt.districtPillaged); no charge, the turn is spent, version bumps.
            distpill_h = self.district_pillaged.gather(1, here.unsqueeze(1)).squeeze(1)
            rep_d = act & own_h & distpill_h
            if bool(rep_d.any()):
                rows = rep_d.nonzero(as_tuple=True)[0]
                self.district_pillaged[rows, here[rows]] = False
                self.v_acted[rows, u] = True
                self._eff_version += 1
                act = act & ~rep_d
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
                # B-27 (#71): the Seaside Resort's validity HERE.
                sr_h = (
                    (self._seaside_ok().gather(1, here.unsqueeze(1)).squeeze(1) & tk0[:, self._seaside_unlock_tech])
                    if self.SEASIDE >= 0 and self._seaside_unlock_tech >= 0
                    else torch.zeros(B, dtype=torch.bool, device=dev)
                )
                valid = [farm_h, mine_h, lum_h] + ([sr_h] if len(opts) > 3 else [])
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
                # B-27 (#71): the resort's Δ-gain is its DYNAMIC gold — the
                # tile's appeal (floored at 0, as tileYields floors it) times
                # the gold focus weight. Same unpil zeroing as the others.
                sr_g = (
                    self._tile_appeal().gather(1, here.unsqueeze(1)).squeeze(1).clamp(min=0).double()
                    * float(wt[2])
                    * unpil
                )
                opt_g = [farm_g, mine_g, lum_g] + ([sr_g] if len(opts) > 3 else [])
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
                # B-27 (#79): an ENGINEER builds the FORT and nothing else —
                # validImprovementsIn(builder=ME) returns exactly ['FORT'].
                # `here_ok` already used the fort mask for these rows, so
                # reaching here means the tile IS a valid border fort job.
                if _eng_row is not None and bool(_eng_row.any()) and self.FORT >= 0:
                    pick = torch.where(_eng_row, torch.full_like(pick, self.FORT), pick)
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
            # #70/S3 (B-8): TS `granted = full + generalAuraMP`, read off the
            # refresh-site SNAPSHOT (never recomputed here — generals move).
            full_mp = self._p_moves[self.v_type[:, u].clamp(min=0, max=self.NU - 1)] + self.v_aura_mp[:, u]
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
                _terr, _riv = self._road_terms(  # B-23 (#71): roads
                    curc, dest, 3 * ((self.river_mask.gather(1, curc.unsqueeze(1)).squeeze(1) >> dir_i) & 1)
                )
                cost = 1 + _terr + _riv
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
                mp = torch.where(mv & self._in_enemy_zoc(dest, self.r_atwar[:, r], torch.full((self.B,), r, dtype=torch.long, device=self.device)), torch.zeros_like(mp), mp)
                d_cur = torch.where(mv, torch.div(best, 8, rounding_mode="floor"), d_cur)
                cur = torch.where(mv, dest, cur)
                moving = mv & (mp > 0)

    def _theological_combat(self, r: int, act: torch.Tensor) -> torch.Tensor:
        """B-18 (#71): the `theologicalCombat` mirror. For each APOSTLE slot of
        rival r flagged in `act` (slot order), find an ADJACENT religious unit
        of a DIFFERENT religion, damage both by the RELIGIOUS-STRENGTH
        difference, kill at 0 HP, and swing pressure in cities within
        theoPressureRange of the fallen unit. Returns [B, U] — the slots that
        fought and therefore skip the spread/walk (the TS `continue`).

        Target pick is the LOWEST SLOT among adjacent enemies, which is the
        v-pool's spawn order and so mirrors TS's lowest-unit-id. Zero RNG."""
        fought = torch.zeros_like(act)
        if not bool(act.any()):
            return fought
        U = self.v_alive.shape[1]
        rs = self._rel_strength
        for u in range(U):
            a_on = act[:, u] & self.v_alive[:, u]
            if not bool(a_on.any()):
                continue
            a_tile = self.v_tile[:, u]
            a_str = rs[self.v_type[:, u].clamp(min=0)]
            # adjacency + different religion + carries religious strength
            d = self.pair_dist[a_tile.unsqueeze(1), self.v_tile]  # [B, U]
            elig = (
                self.v_alive & (d == 1) & (self.v_civ != r)
                & (rs[self.v_type.clamp(min=0)] > 0)
            )
            elig = elig & a_on.unsqueeze(1)
            if not bool(elig.any()):
                continue
            first = elig & (elig.long().cumsum(dim=1) == 1)  # lowest slot
            has = first.any(dim=1)
            d_str = (rs[self.v_type.clamp(min=0)] * first.long()).sum(dim=1)
            to_def = (self._theo_base + self._theo_dmg * (a_str - d_str)).clamp(min=1)
            to_atk = (self._theo_base + self._theo_dmg * (d_str - a_str)).clamp(min=1)
            rows = has.nonzero(as_tuple=True)[0]
            if rows.numel() == 0:
                continue
            j = first.long().argmax(dim=1)  # defender slot
            self.v_hp[rows, j[rows]] = self.v_hp[rows, j[rows]] - to_def[rows].to(self.v_hp.dtype)
            self.v_hp[rows, u] = self.v_hp[rows, u] - to_atk[rows].to(self.v_hp.dtype)
            self.v_acted[rows, u] = True
            fought[rows, u] = True
            def_dead = self.v_hp[rows, j[rows]] <= 0
            atk_dead = self.v_hp[rows, u] <= 0
            # pressure swing at the fallen unit's tile
            win_rel = torch.where(def_dead, torch.full_like(j[rows], r + 1), self.v_civ[rows, j[rows]] + 1)
            los_rel = torch.where(def_dead, self.v_civ[rows, j[rows]] + 1, torch.full_like(j[rows], r + 1))
            any_dead = def_dead | atk_dead
            dead_tile = torch.where(def_dead, self.v_tile[rows, j[rows]], self.v_tile[rows, u])
            if bool(any_dead.any()):
                dr = rows[any_dead]
                dt = dead_tile[any_dead]
                wr = win_rel[any_dead]
                lr = los_rel[any_dead]
                sw = int(self._theo_swing)
                dpc = self.pair_dist[self.site[dr].clamp(min=0), dt.unsqueeze(1)]  # [n, C]
                near_pc = (dpc <= self._theo_range) & self.alive[dr]
                for _k in range(dr.numel()):
                    m = near_pc[_k]
                    if bool(m.any()):
                        self.city_pressure[dr[_k], m, wr[_k]] += sw
                        self.city_pressure[dr[_k], m, lr[_k]] = (self.city_pressure[dr[_k], m, lr[_k]] - sw).clamp(min=0)
                    drc = self.pair_dist[self.rc_center[dr[_k]].clamp(min=0), dt[_k]]  # [R, RC]
                    mrc = (drc <= self._theo_range) & self.rc_alive[dr[_k]]
                    if bool(mrc.any()):
                        self.rc_pressure[dr[_k], mrc, wr[_k]] += sw
                        self.rc_pressure[dr[_k], mrc, lr[_k]] = (self.rc_pressure[dr[_k], mrc, lr[_k]] - sw).clamp(min=0)
            # B-18 (#71) PARITY FIX: a killed unit must also LEAVE ITS TILE.
            # TS's `disbandUnit` drops it from `state.units` entirely, so the
            # tile is free; the GPU only cleared `v_alive` and left the
            # occupancy plane pointing at the corpse, so the tile stayed
            # permanently blocked. That stale entry blocked OTHER civs' movers
            # forever (seed 9183: rival 0's missionary dies at t86 but
            # `rvciv_at[363]` still read its slot at t91, rerouting rival 1 and
            # costing it a spread). Religious units are civilians, but clear
            # whichever plane actually points at the slot so a military
            # defender can never leak either.
            def _vacate(_rws: torch.Tensor, _slots: torch.Tensor) -> None:
                if _rws.numel() == 0:
                    return
                _t = self.v_tile[_rws, _slots]
                _c = self.rvciv_at[_rws, _t] == _slots
                if bool(_c.any()):
                    self.rvciv_at[_rws[_c], _t[_c]] = -1
                _m = self.rv_at[_rws, _t] == _slots
                if bool(_m.any()):
                    self.rv_at[_rws[_m], _t[_m]] = -1

            # B-20 (#73): RELICS — an APOSTLE killed in theological combat
            # martyrs and hands its owner a relic. Granted BEFORE the disbands
            # and in the TS order (defender first, then attacker) so slot
            # placement is order-exact. A dead MISSIONARY yields nothing; the
            # attacker is always an apostle.
            if self._relic_bidx >= 0 and self._apostle_idx >= 0:
                if bool(def_dead.any()):
                    _dr = rows[def_dead]
                    _ap = self.v_type[_dr, j[_dr]] == self._apostle_idx
                    if bool(_ap.any()):
                        self._grant_relic(_dr[_ap], self.v_civ[_dr[_ap], j[_dr][_ap]] + 1)
                if bool(atk_dead.any()):
                    _ar = rows[atk_dead]
                    self._grant_relic(_ar, torch.full_like(_ar, r + 1))
            if bool(def_dead.any()):
                dd = rows[def_dead]
                self.v_alive[dd, j[dd]] = False
                _vacate(dd, j[dd])
            if bool(atk_dead.any()):
                ad = rows[atk_dead]
                self.v_alive[ad, u] = False
                _vacate(ad, torch.full_like(ad, u))
        return fought

    def _grant_relic(self, rows: torch.Tensor, civ: torch.Tensor) -> None:
        """B-20 (#73), the TS `grantRelic`/`placeRelic` mirror: hand each row's
        unified civ (`civ` [n]: 0 player, r+1 rival r) ONE relic, placed in the
        LOWEST city holding a TEMPLE with a free relic slot — city ARRAY order,
        which the GPU's dense city/rc slot order mirrors. A relic that finds no
        slot is LOST (the TS return value is discarded the same way)."""
        if rows.numel() == 0 or self._relic_bidx < 0:
            return
        pl = civ == 0
        if bool(pl.any()):
            pr = rows[pl]
            placed = torch.zeros(pr.numel(), dtype=torch.bool, device=self.device)
            for c in range(self.C):
                take = (
                    ~placed
                    & self.alive[pr, c]
                    & self.buildings[pr, c, self._relic_bidx].bool()
                    & (self.relics[pr, c] < self._relic_slots)
                )
                if bool(take.any()):
                    self.relics[pr[take], c] += 1
                    placed = placed | take
        rv = ~pl
        if bool(rv.any()) and self.R > 0:
            rr = rows[rv]
            rc = (civ[rv] - 1).clamp(min=0, max=max(self.R - 1, 0))
            placed = torch.zeros(rr.numel(), dtype=torch.bool, device=self.device)
            for j in range(self.RC):
                take = (
                    ~placed
                    & self.rc_alive[rr, rc, j]
                    & self.rc_bldg[rr, rc, j, self._relic_bidx].bool()
                    & (self.rc_relics[rr, rc, j] < self._relic_slots)
                )
                if bool(take.any()):
                    self.rc_relics[rr[take], rc[take], j] += 1
                    placed = placed | take
        self._eff_version += 1  # relics are a yield-bearing write (faith)

    def _rival_missionary_actions(self, r: int, active: torch.Tensor) -> None:
        """B6-S2: mirrors rivalMissionaryActions — per missionary (slot order):
        target the NEAREST city of ANY civ (player + every rival, own
        included) whose followedReligion != this civ's religion g = r + 1
        (dist·(T+1)+centerIndex key over city-center tiles — centers are
        unique, so the key is total). Within 1 of the target center → SPREAD:
        += mlump (pad 10, SCRIPTURE 15) to that city's accumulator for g,
        charge −1, dies at 0, turn spent. Else the builder-class real-MP walk
        (rciv blocking, ZOC halt, camp clear) stopping within 1.

        Pressure writes feed NOTHING this turn: the accumulators are only
        read by _spread_religious_pressure at endTurn (after every rival
        phase), where the follow flip lands. city_followed/rc_followed do not
        move mid-turn, so the #58-G4 economy key and the (turn, _eff_version)
        _rel_combat_planes key both stay exact — no version bump. Zero RNG."""
        B, T, dev = self.B, self.T, self.device
        g = r + 1
        # B-18 (#71): apostles spread on the SAME chassis as missionaries.
        _relig = (self.v_type == self._missionary_idx)
        if self._apostle_idx >= 0:
            _relig = _relig | (self.v_type == self._apostle_idx)
        cand = self.v_alive & (self.v_civ == r) & _relig & (self.v_charges > 0)
        # B-18 (#71): THEOLOGICAL COMBAT resolves BEFORE the spread/walk, as a
        # pre-pass over this civ's apostle slots in SLOT ORDER. TS interleaves
        # it per unit (fight -> `continue`, else spread), and a pre-pass is
        # ORDER-EQUIVALENT here: within one civ's pass a spread only writes
        # pressure (read at endTurn, never mid-turn) and a fight can only kill a
        # unit of a DIFFERENT civ, so no unit in this pass can change another's
        # outcome. Units that fought are removed from `cand` — the TS
        # `continue`. Zero-draw (see THEO_DAMAGE).
        # B-18 (#71) PARITY FIX: the fight resolves AT EACH UNIT'S TURN in the
        # order, not as a pre-pass. TS interleaves it, and a fight KILLS units —
        # which FREES THEIR TILE for everyone later in the same pass. Resolving
        # every fight up front handed later movers a tile TS still had occupied
        # (seed 9235 t85: rival 0's missionary walked 341->340->296 through its
        # OWN apostle's tile because the pre-pass had already killed it).
        if not bool(cand.any()):
            return
        # target mask [B, T]: ALIVE city centers following != g. scatter_add_
        # of longs then >0 — a bool scatter_ would clobber tile 0 with a dead
        # slot's False (the S1 near3 lesson).
        acc = torch.zeros(B, T, dtype=torch.long, device=dev)
        acc.scatter_add_(1, self.site.clamp(min=0), (self.alive & (self.city_followed != g)).long())
        if self.R > 0:
            acc.scatter_add_(
                1,
                self.rc_center.clamp(min=0).reshape(B, -1),
                (self.rc_alive & (self.rc_followed != g)).long().reshape(B, -1),
            )
        tm = acc > 0
        has_t = tm.any(dim=1)
        if not bool(has_t.any()):
            return
        lump = self._enh["mlump"][self.r_enhancer[:, r] + 1]  # [B] long
        arT = torch.arange(T, device=dev, dtype=torch.float64)
        arange6 = torch.arange(6, device=dev)
        for u in cand.any(dim=0).nonzero(as_tuple=True)[0].tolist():
            # TS: `if (u.type === 'APOSTLE' && theologicalCombat(...)) continue;`
            if self._apostle_idx >= 0:
                _ap = cand[:, u] & active & (self.v_type[:, u] == self._apostle_idx)
                if bool(_ap.any()):
                    _f = torch.zeros_like(cand)
                    _f[:, u] = _ap
                    cand = cand & ~self._theological_combat(r, _f) & self.v_alive
            act = cand[:, u] & active & has_t
            if not bool(act.any()):
                continue
            here = self.v_tile[:, u].clamp(min=0)
            tkey = torch.where(tm, self.pair_dist[here].double() * (T + 1) + arT, torch.full((B, T), float("inf"), dtype=torch.float64, device=dev))
            tgt = tkey.argmin(dim=1)
            d0 = self.pair_dist[here, tgt].to(torch.long)
            sp = act & (d0 <= 1)
            if bool(sp.any()):
                # lump for religion g at the target CITY — resolve the center
                # tile back to the player slot / rc registry (live rows only;
                # a center is unique across live cities).
                pm = sp.unsqueeze(1) & self.alive & (self.site == tgt.unsqueeze(1))
                prows, pj = pm.nonzero(as_tuple=True)
                if len(prows):
                    self.city_pressure[prows, pj, g] += lump[prows]
                if self.R > 0:
                    rm = sp.view(B, 1, 1) & self.rc_alive & (self.rc_center == tgt.view(B, 1, 1))
                    rrows, rr_, rj = rm.nonzero(as_tuple=True)
                    if len(rrows):
                        self.rc_pressure[rrows, rr_, rj, g] += lump[rrows]
                rows = sp.nonzero(as_tuple=True)[0]
                self.v_charges[rows, u] -= 1
                self.v_acted[rows, u] = True  # P4/D-2: the spread spends the turn
                dead = sp & (self.v_charges[:, u] <= 0)
                if bool(dead.any()):
                    dr = dead.nonzero(as_tuple=True)[0]
                    self.v_alive[dr, u] = False
                    self.rvciv_at[dr, here[dr]] = -1
            walk = act & ~sp
            if not bool(walk.any()):
                continue
            # the rivalBuilderActions step loop verbatim, with the ≤1 stop
            # #70/S3 (B-8): + the frozen aura MP (0 for a civilian missionary).
            full_mp = self._p_moves[self.v_type[:, u].clamp(min=0, max=self.NU - 1)] + self.v_aura_mp[:, u]
            mp = full_mp.clone()
            cur = here.clone()
            d_cur = d0.clone()
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
                _terr, _riv = self._road_terms(  # B-23 (#71): roads
                    curc, dest, 3 * ((self.river_mask.gather(1, curc.unsqueeze(1)).squeeze(1) >> dir_i) & 1)
                )
                cost = 1 + _terr + _riv
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
                self._clear_camp_at(mv, dest, civ=self.v_civ[:, u])  # walkPath's any-unit clear
                mp = torch.where(mv, (mp - cost).clamp(min=0), mp)
                # B-3 ZOC: a civilian mover halts adjacent to a hostile
                # military unit — only the EXERTER must be military.
                mp = torch.where(mv & self._in_enemy_zoc(dest, self.r_atwar[:, r], torch.full((self.B,), r, dtype=torch.long, device=self.device)), torch.zeros_like(mp), mp)
                d_cur = torch.where(mv, torch.div(best, 8, rounding_mode="floor"), d_cur)
                cur = torch.where(mv, dest, cur)
                moving = mv & (mp > 0) & (d_cur > 1)

    def _rival_general_actions(self, r: int, active: torch.Tensor) -> None:
        """B7-G (B-8): mirrors rivalGeneralActions — a live GENERAL of rival r
        walks with the war effort toward the civ's CURRENT war-march target (the
        NEAREST player city center, dist·(T+1)+centerIndex key), on real MP,
        stopping within gen_aura_range so its +5 aura covers the front. Gated on
        r_atwar (peace → hold; the scripted player general is absent from this
        rival-only walker). The _rival_missionary_actions step loop verbatim,
        with the ≤range stop and no spread. Zero RNG.

        #71 (B-8 residual): ADMIRALs march too, on the SAME chassis and target
        scan — real Civ 6 Great Admirals move with the fleet, and an admiral
        held at the capital could never put its naval aura over the front. Only
        the aura's DOMAIN differs, and that is decided at the roll sites by
        _gen_aura_hit, not here."""
        if self._general_unit_idx < 0 and self._admiral_unit_idx < 0:
            return
        B, T, dev = self.B, self.T, self.device
        atw = active & self.r_atwar[:, r]
        _is_gp = torch.zeros_like(self.v_type, dtype=torch.bool)
        if self._general_unit_idx >= 0:
            _is_gp |= self.v_type == self._general_unit_idx
        if self._admiral_unit_idx >= 0 and self._admiral_march_live:
            _is_gp |= self.v_type == self._admiral_unit_idx
        cand = self.v_alive & (self.v_civ == r) & _is_gp
        if not (bool(atw.any()) and bool(cand.any())):
            return
        # war-march target mask [B, T]: alive PLAYER city centers (scatter_add
        # of longs then >0 — a bool scatter clobbers tile 0; the S1 near3 lesson).
        acc = torch.zeros(B, T, dtype=torch.long, device=dev)
        acc.scatter_add_(1, self.site.clamp(min=0), self.alive.long())
        tm = acc > 0
        has_t = tm.any(dim=1)
        if not bool(has_t.any()):
            return
        rng = self._gen_aura_range
        arT = torch.arange(T, device=dev, dtype=torch.float64)
        arange6 = torch.arange(6, device=dev)
        for u in cand.any(dim=0).nonzero(as_tuple=True)[0].tolist():
            act = cand[:, u] & atw & has_t
            if not bool(act.any()):
                continue
            here = self.v_tile[:, u].clamp(min=0)
            tkey = torch.where(tm, self.pair_dist[here].double() * (T + 1) + arT, torch.full((B, T), float("inf"), dtype=torch.float64, device=dev))
            tgt = tkey.argmin(dim=1)
            d0 = self.pair_dist[here, tgt].to(torch.long)
            # #70/S3 (B-8): + the frozen aura MP. Structurally 0 here — the
            # GENERAL/ADMIRAL walking this loop is itself a combat-0 civilian,
            # which _refresh_aura_mp screens out (TS inGeneralAura agrees).
            full_mp = self._p_moves[self.v_type[:, u].clamp(min=0, max=self.NU - 1)] + self.v_aura_mp[:, u]
            mp = full_mp.clone()
            cur = here.clone()
            d_cur = d0.clone()
            moving = act & (d_cur > rng)
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
                _terr, _riv = self._road_terms(  # B-23 (#71): roads
                    curc, dest, 3 * ((self.river_mask.gather(1, curc.unsqueeze(1)).squeeze(1) >> dir_i) & 1)
                )
                cost = 1 + _terr + _riv
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
                self._clear_camp_at(mv, dest, civ=self.v_civ[:, u])  # walkPath's any-unit clear
                mp = torch.where(mv, (mp - cost).clamp(min=0), mp)
                # B-3 ZOC: a civilian mover halts adjacent to a hostile military unit.
                mp = torch.where(mv & self._in_enemy_zoc(dest, self.r_atwar[:, r], torch.full((self.B,), r, dtype=torch.long, device=self.device)), torch.zeros_like(mp), mp)
                d_cur = torch.where(mv, torch.div(best, 8, rounding_mode="floor"), d_cur)
                cur = torch.where(mv, dest, cur)
                moving = mv & (mp > 0) & (d_cur > rng)
        self._gen_ver += 1  # general positions may have changed → invalidate the aura plane

    def _religious_victor(self) -> torch.Tensor:
        """B6-S3 (mirror of TS religiousVictor): [B] the lowest religion id g
        such that EVERY alive civ (player if ≥1 city, each rival with ≥1 city)
        has MORE THAN HALF of its cities following g; -1 none. Requires g
        founded (holy_tile set) and at least one alive civ. At most one g can
        predominate within a civ, so the ascending scan needs no tie-break."""
        B, O = self.B, self._O
        npl = self.alive.sum(dim=1)  # [B] player cities
        n_r = self.rc_alive.sum(dim=2) if self.R > 0 else None  # [B, R]
        any_civ = npl > 0
        if self.R > 0:
            any_civ = any_civ | (n_r > 0).any(dim=1)
        winner = torch.full((B,), -1, dtype=torch.long, device=self.device)
        for g in range(O):
            founded_g = self.holy_tile[:, g] >= 0
            nf = (self.alive & (self.city_followed == g)).sum(dim=1)
            ok = founded_g & any_civ & ((npl == 0) | (2 * nf > npl))
            if self.R > 0:
                nf_r = (self.rc_alive & (self.rc_followed == g)).sum(dim=2)  # [B, R]
                ok = ok & ((n_r == 0) | (2 * nf_r > n_r)).all(dim=1)
            winner = torch.where((winner < 0) & ok, torch.full_like(winner, g), winner)
        return winner

    def _player_suzerain_count(self) -> torch.Tensor:
        """B-22 (#75): [B] city-states the PLAYER is Suzerain of — the
        `isSuzerain` twin (>= suzerainEnvoys and STRICTLY more than every
        rival's envoys; a tie leaves no suzerain)."""
        suz_min = int(self.rules.cs.get("suzerainEnvoys", 3))
        m = (self.cs_envoys >= suz_min) & self.cs_alive
        if self.R > 0:
            m = m & (self.cs_envoys > self.cs_r_envoys.max(dim=1).values)
        return m.sum(dim=1)

    def _rival_suzerain_count(self, r: int) -> torch.Tensor:
        """B-22 (#75): [B] city-states rival r is Suzerain of — the
        `rivalIsSuzerain` twin (>= suzerainEnvoys, strictly more than the
        PLAYER and strictly more than every OTHER rival)."""
        suz_min = int(self.rules.cs.get("suzerainEnvoys", 3))
        mine = self.cs_r_envoys[:, r]  # [B, S]
        m = (mine >= suz_min) & self.cs_alive & (mine > self.cs_envoys)
        for o in range(self.R):
            if o == r:
                continue
            m = m & (mine > self.cs_r_envoys[:, o])
        return m.sum(dim=1)

    def _world_congress(self) -> None:
        """B-22 (#76), the TS `worldCongress` mirror. At every
        congressInterval turn, once ANY civ has reached congressMinEra
        (Medieval), one resolution runs: every civ commits ALL its favor as
        votes, the LARGEST commitment wins DVP_PER_RESOLUTION Diplomatic
        Victory Points, and every commitment is spent. Ties keep the LOWER
        unified civ id (the ascending scan). A civ with zero favor casts no
        vote and cannot win. Zero-draw — a pure function of state."""
        if self._congress_interval <= 0:
            return
        fires = (self.turn % self._congress_interval) == 0
        if not fires:
            return
        era_ok = self._civ_era(self.techs, self.civics) >= self._congress_min_era
        for r in range(self.R):
            era_ok = era_ok | (self._civ_era(self.r_techs[:, r], self.r_civics[:, r]) >= self._congress_min_era)
        if not bool(era_ok.any()):
            return
        self.congress_sessions = self.congress_sessions + era_ok.long()
        # the ascending scan: strictly-greater keeps the LOWER id on a tie
        best = self.diplo_favor.clone()
        win = torch.where(best > 0, torch.zeros_like(best), torch.full_like(best, -1))
        for r in range(self.R):
            v = self.r_diplo_favor[:, r]
            take = (v > 0) & (v > best)
            win = torch.where(take, torch.full_like(win, r + 1), win)
            best = torch.where(take, v, best)
        # commitments are spent whether or not they won (only where the
        # session actually convened)
        self.diplo_favor = torch.where(era_ok, torch.zeros_like(self.diplo_favor), self.diplo_favor)
        for r in range(self.R):
            self.r_diplo_favor[:, r] = torch.where(era_ok, torch.zeros_like(self.r_diplo_favor[:, r]), self.r_diplo_favor[:, r])
        self.diplo_points = self.diplo_points + (era_ok & (win == 0)).long() * self._dvp_per_res
        for r in range(self.R):
            self.r_diplo_points[:, r] = self.r_diplo_points[:, r] + (era_ok & (win == r + 1)).long() * self._dvp_per_res

    def _diplomatic_victor(self) -> torch.Tensor:
        """B-22/B-25 (#76), the TS `diplomaticVictor` mirror: [B] the lowest
        unified civ id holding >= diploVictoryPoints Diplomatic Victory Points
        and still holding a city; -1 none."""
        winner = torch.full((self.B,), -1, dtype=torch.long, device=self.device)
        ok = self.alive.any(dim=1) & (self.diplo_points >= self._dvp_win)
        winner = torch.where(ok, torch.zeros_like(winner), winner)
        for r in range(self.R):
            okr = self.rc_alive[:, r].any(dim=1) & (self.r_diplo_points[:, r] >= self._dvp_win)
            winner = torch.where((winner < 0) & okr, torch.full_like(winner, r + 1), winner)
        return winner

    def _dedication_event(self, civ: int, kind: int, count: torch.Tensor) -> None:
        """B-24 (#77), the TS `dedicationEvent` mirror: the DARK/NORMAL face of
        a civ's committed dedications pays ERA SCORE off a specific EVENT. A
        GOLDEN age takes a standing bonus instead and earns nothing here.
        Every MATCHING committed dedication pays, so a HEROIC age holding the
        same one twice pays twice. Zero-draw.

        `count` [B] is HOW MANY TIMES the event fired this turn. #78: it used to
        be a bool MASK, which silently collapsed N occurrences in one turn into
        ONE payment — TS calls `dedicationEvent` once per OCCURRENCE (per
        converted city, per eureka, per completed district), so N occurrences
        must pay N times. That under-count is the root cause of the rGScore1
        latent: two cities converting on the same turn paid +2 on the GPU and
        +4 in TS. A bool is still accepted and reads as 0/1 for the sites that
        genuinely fire at most once per call."""
        if not self._ded_payouts_live:
            return
        cnt = count.long()
        if not bool((cnt > 0).any()):
            return
        n = (self.ded_picks[:, civ] == kind).sum(dim=1)  # [B]
        pay = (self.civ_age[:, civ] != 2) & (n > 0)
        if bool(pay.any()):
            self.era_score[:, civ] = self.era_score[:, civ] + pay.long() * cnt * n * self._ded_event_score[kind]

    def _culture_victor(self) -> torch.Tensor:
        """B-25 (#72), the TS `cultureVictor` mirror: [B] the lowest unified civ
        id (0 player, r+1 rival r) whose VISITING tourists exceed EVERY other
        civ's DOMESTIC tourists; -1 none.

        visiting = lifetime tourism // (nCivs * TOURISM_PER_VISITOR_PER_CIV)
        domestic = lifetime culture // CULTURE_PER_DOMESTIC_TOURIST

        Both floor to whole tourists, so the comparison is integer-exact and
        zero-draw. Culture is milli-rounded BEFORE the floor (the bankruptcy
        convention) so a sub-milli float drift cannot move a tourist count.
        A cityless civ cannot win."""
        B, dev = self.B, self.device
        n_civs = 1 + self.R
        vis_div = n_civs * self._tourism_per_visitor
        alive = [self.alive.any(dim=1)]
        tour = [self.tourism_total]
        cul = [self.culture_total]
        for r in range(self.R):
            alive.append(self.rc_alive[:, r].any(dim=1))
            tour.append(self.r_tourism[:, r])
            cul.append(self.r_culture[:, r])
        visiting = [torch.div(t.long(), vis_div, rounding_mode="floor") for t in tour]
        domestic = [
            torch.div(js_round(c * 1000).long(), 1000 * self._culture_per_tourist, rounding_mode="floor")
            for c in cul
        ]
        winner = torch.full((B,), -1, dtype=torch.long, device=dev)
        for c in range(n_civs):
            ok = alive[c]
            for o in range(n_civs):
                if o == c:
                    continue
                ok = ok & (visiting[c] > domestic[o])
            winner = torch.where((winner < 0) & ok, torch.full_like(winner, c), winner)
        return winner

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
            # B-27 (#71): the SEASIDE RESORT's gold is the tile's APPEAL, not a
            # catalog constant — the rival yield path needs the same term the
            # player's _eff_yields got, or a resort pays nothing here.
            if self.SEASIDE >= 0:
                sr_live = (self.improvement == self.SEASIDE).to(self.dtype) * live_imp
                if bool(sr_live.any()):
                    ty_oth[:, :, 2] = ty_oth[:, :, 2] + self._tile_appeal().clamp(min=0).to(self.dtype) * sr_live
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
        key = (self.turn, r, self._eff_version, self._rp_kill_version, self._bel_version)  # B6-S1: + bel (enhancer claims move the Messenger term)
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
        # B6-S1 (Messenger of the Gods): +tradeRel yields on each DOMESTIC
        # route whose destination city follows this civ's religion (r+1) —
        # the rivalCityYields route-loop position, pre-tier. CS destinations
        # carry no religion.
        if self._enh_any and bool((self.r_enhancer[:, r] >= 0).any()):
            tr6 = self._enh["tradeRel"][self.r_enhancer[:, r] + 1]  # [B, 6]
            if bool((tr6 != 0).any()):
                dest_fol = self.rc_followed[:, r].gather(1, dest_j)  # [B, K]
                rel_ok = (pays_d & (dest_fol == (r + 1)) & self.r_religion_done[:, r].unsqueeze(1)).double()
                if bool((rel_ok != 0).any()):
                    for _kc in range(6):
                        inc.scatter_add_(1, from_j * 6 + _kc, tr6[:, _kc].unsqueeze(1) * rel_ok)
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
        # B-23 international legs: a route to a player city (r_route_dest = the
        # dest CENTER TILE, >=0) pays intlGold + dest completed specialty count
        # to GOLD only. Suspended while at war with the player (destination-civ
        # interdiction) or while a barbarian prowls within 3 of either endpoint
        # (the peace-time raid; player units are irrelevant here since we only
        # pay in peace). Mirrors rivalCityYields' toPlayer branch.
        rd_i = self.r_route_dest[:, r]  # [B, K] dest center tile (>=0 = intl)
        intl = act & (rd_i >= 0)
        if bool(intl.any()):
            dest_tile = rd_i.clamp(min=0)  # [B, K]
            dest_slot = self.center_at.gather(1, dest_tile)  # [B, K] player city slot (-1 = gone)
            valid_dest = dest_slot >= 0
            # per player-city completed specialty district count [B, C]
            own_spec = (self.district >= 0) & self._is_specialty[self.district.clamp(min=0)] & self.district_complete
            p_city_spec = torch.zeros(B, self.C, dtype=torch.long, device=self.device).scatter_add_(
                1, self.owner.clamp(min=0), (own_spec & (self.owner >= 0)).long()
            )  # [B, C]
            spec_dest = p_city_spec.gather(1, dest_slot.clamp(min=0))  # [B, K]
            gold_i = (self._trade_intl_gold + spec_dest).double()
            near_dest = torch.zeros(B, self.r_routes.shape[2], dtype=torch.bool, device=self.device)
            if self.u_tile.numel():
                d_bi = self.pair_dist[dest_tile.unsqueeze(2), self.u_tile.clamp(min=0).unsqueeze(1)] <= 3  # [B, K, U]
                near_dest = near_dest | (d_bi & self.u_alive.unsqueeze(1)).any(dim=2)
            raided_i = near.gather(1, from_j) | near_dest
            pays_i = act & intl & has_from & valid_dest & ~self.r_atwar[:, r].view(B, 1) & ~raided_i
            inc.scatter_add_(1, from_j * 6 + 2, gold_i * pays_i.double())
        inc = inc.reshape(B, RC, 6)
        self._rival_route_cache = (key, inc)
        return inc

    def _rc_bdark(self, dt_reg: torch.Tensor) -> torch.Tensor:
        """B-32: given an rc district-tile registry [..., nD] (tile per district
        type, -1 = none), return [..., NB] bool = building b is dark because its
        district is COMPLETE-but-PILLAGED. CITY_CENTER buildings (_b_req_district
        == -1) never gate. Mirrors TS pillagedDistrictTypes over rc.buildings."""
        if not self.districts_on or dt_reg.shape[-1] == 0:
            return torch.zeros(*dt_reg.shape[:-1], self.NB, dtype=torch.bool, device=self.device)
        B0 = dt_reg.shape[0]
        flat = dt_reg.clamp(min=0).reshape(B0, -1)
        comp = self.district_complete.gather(1, flat).reshape_as(dt_reg)
        pilf = self.district_pillaged.gather(1, flat).reshape_as(dt_reg)
        pil = (dt_reg >= 0) & comp & pilf  # [..., nD]
        breq = self._b_req_district  # [NB]
        return pil[..., breq.clamp(min=0)] & (breq >= 0)  # [..., NB]

    def _rc_specialists(self, r: int, j: int, top_vals: torch.Tensor, pop: torch.Tensor):
        """A-22: (nSpec [B], yields [B, 6]) for rival r's city j.

        Open slots per district = that city's buildings belonging to it, and
        the district must be registered, COMPLETE and unpillaged (B-32). Each
        slot is scored with the same `focus_base` weighting the tile ranking
        uses, so the two are directly comparable; slots are consumed in
        score-descending district order (ties by district index), exactly the
        order TS sorts them in."""
        nD = self._spec_yields.shape[0]
        B, dev = self.B, self.device
        nspec = torch.zeros(B, dtype=torch.long, device=dev)
        add = torch.zeros(B, 6, dtype=torch.float64, device=dev)
        if nD == 0 or self.rc_bldg.shape[3] == 0:
            return nspec, add
        w = self.rules_dev.focus_base.double()
        sc_d = (self._spec_yields.double() * w.view(1, 6)).sum(dim=1)  # [nD]
        dt = self.rc_dist_tile[:, r, j]  # [B, nD]
        live = (
            (dt >= 0)
            & self.district_complete.gather(1, dt.clamp(min=0))
            & ~self.district_pillaged.gather(1, dt.clamp(min=0))
        )
        nb = self.rc_bldg.shape[3]
        req = self._b_req_district[:nb]
        order = sorted(range(nD), key=lambda d: (-float(sc_d[d]), d))
        kkm = top_vals.shape[1]
        for d in order:
            if float(sc_d[d]) <= 0.0:
                continue
            cnt = (self.rc_bldg[:, r, j] & (req == d).unsqueeze(0)).sum(dim=1) * live[:, d].long()
            if not bool((cnt > 0).any()):
                continue
            for _k in range(int(cnt.max().item())):
                idx = (pop - nspec - 1).clamp(min=0, max=max(kkm - 1, 0))
                t_key = top_vals.gather(1, idx.unsqueeze(1)).squeeze(1)
                # no tile left to displace -> that slot's rival is -1e18
                t_key = torch.where((pop - nspec - 1) < 0, torch.full_like(t_key, -1e18), t_key)
                cond = (_k < cnt) & (nspec < pop) & ((sc_d[d] * 1e6 - float(self.T)) > t_key)
                nspec = nspec + cond.long()
                add = add + cond.double().unsqueeze(1) * self._spec_yields[d].double().unsqueeze(0)
        return nspec, add

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
            # AUDIT A-23 (2026-07-27): PER-CITY (see the _all twin).
            & (self.rc_tile_id.gather(1, tc) == self.rc_id[:, r, j].unsqueeze(1))
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
        # A-22 (2026-07-27): RIVAL SPECIALISTS. TS merges open specialist slots
        # into the SAME ranking as the tiles and takes the top `population`.
        # Equivalent (and cheaper here): count how many slots outrank the tile
        # they would displace, shrink the tile take by that many, and add their
        # yields. Ties go to TILES because a slot's tie index (>= T) always
        # exceeds any tile index in `s * 1e6 - tileIndex`.
        _pop_j = self.rc_pop[:, r, j]
        _nspec, _spec_add = self._rc_specialists(r, j, top_vals, _pop_j)
        take = (torch.arange(kk, device=self.device).unsqueeze(0) < (_pop_j - _nspec).clamp(min=0).unsqueeze(1)) & (top_vals > -1e17)
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
            # A-22: the specialists that displaced tiles pay their yields.
            food = food + _spec_add[:, 0]
            prod = prod + _spec_add[:, 1]
            gold = gold + _spec_add[:, 2]
            sci = sci + _spec_add[:, 3]
            cul = cul + _spec_add[:, 4]
            faith = faith + _spec_add[:, 5]
        else:
            food = cf + _spec_add[:, 0]
            prod = cp + _spec_add[:, 1]
            sci = c_sc + _spec_add[:, 3]
            gold = c_go + _spec_add[:, 2]  # VP-G1
            faith = c_fa + _spec_add[:, 5]  # GV-1a
            cul = c_cu + _spec_add[:, 4]
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
        # AUDIT #78 — WATER MILL, the per-j twin of the batched term (and of
        # rivals.ts): farm-improved BONUS resources gain +1 food, POST-selection
        # over the worked set like Petra above. Kept structurally identical to
        # _rival_city_yields_all's version so column j stays bit-identical.
        wm_p = self.rc_bldg[:, r, j][:, rd.b_farmbonus]  # [B, n]
        if wm_p.numel() and bool(wm_p.any()):
            has_wm = wm_p.any(dim=1)  # [B]
            sel_t = tc.gather(1, top_idx)  # [B, kk]
            elig = (
                (self.improvement.gather(1, sel_t) == self.FARM)
                & (self.res_cat.gather(1, sel_t) == 1)
                & (self.res_imp.gather(1, sel_t) == self.FARM)
            ) & take
            food = food + (elig & has_wm.unsqueeze(1)).sum(dim=1).double()
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
                    has = has & ~self.district_pillaged.gather(1, tile_d.clamp(min=0).unsqueeze(1)).squeeze(1)  # B-32: pillaged = dark
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
            selb = self.rc_bldg[:, r, j] & ~self._rc_bdark(self.rc_dist_tile[:, r, j]) & ~self._b_regional.view(1, -1)  # B-32 dark; B9-R2 regional delivered by range
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
        # B9-R3: PALACE — the civ's FIRST city holds it (rc_is_cap mirrors
        # TS's founding grant exactly: B-30 strips on capture, nothing
        # relocates or re-grants). Its yields sit in the rc.buildings loop
        # position — integer f64, order-exact.
        _isc_pal = (self.rc_is_cap[:, r, j] & mask).double()
        if bool((_isc_pal != 0).any()):
            _pal6 = self._palace_y.double()
            food = food + _pal6[0] * _isc_pal
            prod = prod + _pal6[1] * _isc_pal
            gold = gold + _pal6[2] * _isc_pal
            sci = sci + _pal6[3] * _isc_pal
            cul = cul + _pal6[4] * _isc_pal
            faith = faith + _pal6[5] * _isc_pal
        # B9-R2: regional-building yields — rivalRegionalEffects at the
        # city.ts:445-446 position (after the local buildings, before the
        # wonder flat yields), pre-tier. LIVE per-j compute like TS.
        _regional_j = self._rival_regional(r)
        if _regional_j is not None:
            _rj = _regional_j[0][:, j] * mask.double().unsqueeze(1)  # [B, 6]
            food = food + _rj[:, 0]
            prod = prod + _rj[:, 1]
            gold = gold + _rj[:, 2]
            sci = sci + _rj[:, 3]
            cul = cul + _rj[:, 4]
            faith = faith + _rj[:, 5]
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
        # A-12/B-21: this civ's CS envoy bonuses — the 3/6 tiers now land on the
        # rival's tier-1 (>=3) / tier-2 (>=6) BUILDINGS (csRivalEnvoyBonuses
        # re-key), the capital yield at 1+ envoys, and (B-21) the suzerain's
        # per-CS unique perk. Pre-tier, before A-11 trade.
        if self.S > 0 and bool((self.cs_r_envoys[:, r] > 0).any()):
            _acs = self.cs_alive.double()
            _isc = (self.rc_is_cap[:, r, j] & mask).double()  # [B]
            # B-21: 3/6-envoy BUILDING adds — selb is the per-j rc_bldg presence
            # with pillaged-dark + regional-skip (the b_yields twin at ~7335).
            _cols6 = None
            if self.districts_on:
                selb_cs = self.rc_bldg[:, r, j] & ~self._rc_bdark(self.rc_dist_tile[:, r, j]) & ~self._b_regional.view(1, -1)  # [B, NB]
                if bool(selb_cs.any()):
                    _nBc = selb_cs.shape[1]
                    per3 = (self.cs_r_envoys[:, r] >= 3).double() * self._cs_district_bonus * _acs * (self._cs_b1idx >= 0).double()
                    per6 = (self.cs_r_envoys[:, r] >= 6).double() * self._cs_district_bonus * _acs * (self._cs_b2idx >= 0).double()
                    csb6f = torch.zeros(self.B, _nBc * 6, dtype=torch.float64, device=self.device)
                    csb6f.scatter_add_(1, self._cs_b1idx.clamp(min=0) * 6 + self._cs_yidx, per3)
                    csb6f.scatter_add_(1, self._cs_b2idx.clamp(min=0) * 6 + self._cs_yidx, per6)
                    csb6 = csb6f.view(self.B, _nBc, 6)
                    _cs6_j = torch.einsum("bn,bnk->bk", selb_cs.double(), csb6)  # [B, 6]
                    _cols6 = [_cs6_j[:, _k] for _k in range(6)]
            tier1_r = ((self.cs_r_envoys[:, r] >= 1) & self.cs_alive).double() * float(self.rules.cs.get("capitalBonus", 2))
            capb_r = torch.zeros(self.B, 6, dtype=torch.float64, device=self.device)
            capb_r.scatter_add_(1, self._cs_yidx, tier1_r)
            # B-21: suzerain unique perk — this rival's STRICT isSuzerain.
            suz_min = int(self.rules.cs.get("suzerainEnvoys", 3))
            _oth = self.cs_r_envoys.clone()
            _oth[:, r] = -1
            r_suz = (self.cs_r_envoys[:, r] >= suz_min) & (self.cs_r_envoys[:, r] > self.cs_envoys) & (self.cs_r_envoys[:, r] > _oth.max(dim=1).values) & self.cs_alive
            suz_valr = r_suz.double() * self._cs_suz_amt * (self.cs_suz_key >= 0).double()  # [B, S]
            capb_r.scatter_add_(1, self.cs_suz_key.clamp(min=0), suz_valr)
            if _cols6 is not None:
                food = food + _cols6[0]
                prod = prod + _cols6[1]
                gold = gold + _cols6[2]
                sci = sci + _cols6[3]
                cul = cul + _cols6[4]
                faith = faith + _cols6[5]
            food = food + capb_r[:, 0] * _isc
            prod = prod + capb_r[:, 1] * _isc
            gold = gold + capb_r[:, 2] * _isc
            sci = sci + capb_r[:, 3] * _isc
            cul = cul + capb_r[:, 4] * _isc
            faith = faith + capb_r[:, 5] * _isc
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
        # B-20: slotted Great Works for city j — culture/turn per work BY KIND
        # (#70/S1), pre-tier; gated by mask so column j matches the batched twin.
        cul = cul + (
            self._gw_cul_k[0] * self.rc_gw_writing[:, r, j].double()
            + self._gw_cul_k[1] * self.rc_gw_art[:, r, j].double()
            + self._gw_cul_k[2] * self.rc_gw_music[:, r, j].double()
        ) * mask.double()
        # B-20 (#73): RELIC faith, the batched twin's position.
        faith = faith + self._relic_faith * self.rc_relics[:, r, j].double() * mask.double()
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

    def _rival_regional(self, r: int) -> tuple[torch.Tensor, torch.Tensor] | None:
        """B9-R2: rivalRegionalEffects — each regional building owned by one of
        this rival's cities whose source district (rc_dist_tile of the
        building's type) is COMPLETE and unpillaged reaches every ALIVE
        same-civ city center within regional_range of the source tile; the
        same building id never stacks (any() over sources). Reads LIVE state
        at call time (the per-j path sees mid-phase completions, like TS).
        Returns ([B, RC, 6] yields, [B, RC] amenities) in f64, or None when
        no city of this rival owns a regional building."""
        if not self._reg_bidx or not self.districts_on:
            return None
        B, RC = self.B, self.RC
        alive = self.rc_alive[:, r]
        dt_all = self.rc_dist_tile[:, r]  # [B, RC, nD]
        ctrs = self.rc_center[:, r].clamp(min=0)  # [B, RC] receiver centers
        y6 = am = None
        for n in self._reg_bidx:
            own_n = self.rc_bldg[:, r, :, n] & alive  # [B, RC] source cities
            if not bool(own_n.any()):
                continue
            st = dt_all[:, :, int(self._b_req_district[n])]  # [B, RC] source district tile (-1 none)
            stc = st.clamp(min=0)
            ok = own_n & (st >= 0) & self.district_complete.gather(1, stc) & ~self.district_pillaged.gather(1, stc)  # B-32: pillaged source is dark
            if not bool(ok.any()):
                continue
            dd = self.pair_dist[stc.unsqueeze(2), ctrs.unsqueeze(1)]  # [B, RCsrc, RCrecv] int16
            has = (ok.unsqueeze(2) & (dd <= self._regional_range)).any(dim=1) & alive  # [B, RC recv]
            hf = has.double()
            if y6 is None:
                y6 = torch.zeros(B, RC, 6, dtype=torch.float64, device=self.device)
                am = torch.zeros(B, RC, dtype=torch.float64, device=self.device)
            y6 = y6 + hf.unsqueeze(2) * self.rules_dev.b_yields[n].double().view(1, 1, 6)
            am = am + hf * float(self.rules.b_amenities[n])
        return None if y6 is None else (y6, am)

    def _rival_amenity(self, r: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """P5/S6 (C-20): rivalAmenityTiers — each UNIQUE improved luxury on
        THIS civ's territory grants +1 to its luxAmenityCities neediest
        cities (need desc, slot asc = rc.id acquisition order); tier from
        have − needed with have = local building amenities + regional
        (B9-R2, the city.ts:292 ranking mirror) + the capital PALACE
        (B9-R3; no policy sources). Returns (tier_idx, growth_f,
        yield_f), each [B, RC]."""
        B, RC = self.B, self.RC
        rd = self.rules_dev
        selb_a = self.rc_bldg[:, r] & ~self._rc_bdark(self.rc_dist_tile[:, r]) & ~self._b_regional.view(1, 1, -1)  # B-32 dark; B9-R2 regional delivered by range
        have = torch.einsum("bjn,n->bj", selb_a.to(torch.float64), rd.b_amenities.double())
        # B9-R3: PALACE amenity on the capital slot — rivalAmenityTiers'
        # baseHave sums rc.buildings (now holding the founding PALACE), so it
        # joins BEFORE the luxury ranking. CITY_CENTER never pillages.
        have = have + self._palace_amenities * (self.rc_is_cap[:, r] & self.rc_alive[:, r]).double()
        # B9-R2: regional amenities (Zoo/Stadium) join the base BEFORE the
        # luxury ranking — the rivalAmenityTiers baseHave / city.ts:292 mirror.
        _regional = self._rival_regional(r)
        if _regional is not None:
            have = have + _regional[1]
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
        # B-22 (2026-07-27): taking a rival's city earns GRIEVANCES.
        self.r_warmonger[b, r_to] += self._wm_cap
        c_t = int(self.rc_center[b, r_from, j])
        old_pop = int(self.rc_pop[b, r_from, j])
        old_acq = int(self.rc_acquired[b, r_from, j])
        # AUDIT B-30: conquest keeps infrastructure — snapshot the flipping
        # city's district/wonder/building registries BEFORE the loser-slot
        # hygiene wipes them; the tiles do not move, so the registry indices
        # stay valid for the receiving slot.
        b30_dist = self.rc_dist_tile[b, r_from, j, :].clone()
        b30_wond = self.rc_wonder[b, r_from, j, :].clone()
        b30_bldg = self.rc_bldg[b, r_from, j, :].clone()
        # B-20 (#79): GREAT WORKS AND RELICS RIDE WITH THE CITY. Real Civ 6:
        # the victor gains control of the Great Works held in a captured city's
        # buildings/districts/wonders, and those buildings (the Amphitheater /
        # Museum / Temple slots holding them) are exactly what b30_bldg already
        # carries. Snapshot alongside the B-30 registries, for the same reason.
        b20_gww = int(self.rc_gw_writing[b, r_from, j])
        b20_gwa = int(self.rc_gw_art[b, r_from, j])
        b20_gwm = int(self.rc_gw_music[b, r_from, j])
        b20_rel = int(self.rc_relics[b, r_from, j])
        b20_art = int(self.rc_artifacts[b, r_from, j])  # B-20 (#79)
        self.rc_alive[b, r_from, j] = False
        # B-20 (#79) SLOT HYGIENE: the dead slot must not keep a work count.
        # `slot = occ.max() + 1` REUSES indices, and nothing else clears these
        # four, so a later city landing on this index inherited a DEAD city's
        # relics. That stale inheritance — not any transfer rule — is what the
        # rGScore1 hunt measured as "the GPU carries relics": at seed 9235 t249
        # the receiving slot held a ghost relic worth exactly 2.85 score.
        self.rc_gw_writing[b, r_from, j] = 0
        self.rc_gw_art[b, r_from, j] = 0
        self.rc_gw_music[b, r_from, j] = 0
        self.rc_relics[b, r_from, j] = 0
        self.rc_artifacts[b, r_from, j] = 0
        self.rc_is_cap[b, r_from, j] = False  # P7-FULL: identity dies with the slot
        self.rc_dist_tile[b, r_from, j, :] = -1
        self.rc_wonder[b, r_from, j, :] = -1  # A-4 hygiene
        self.rc_bldg[b, r_from, j, :] = False
        self.rc_outer_hp[b, r_from, j] = 0  # AUDIT B-1
        self.rc_current[b, r_from, j] = -1
        self.rc_cost[b, r_from, j] = 0
        self.rc_progress[b, r_from, j] = 0
        self.rc_qtile[b, r_from, j] = -1
        # #70/S4 (A-9): relocatePalace(from.cities) — the loser re-crowns
        # immediately after its city list loses the slot, before the route
        # prune / territory re-tag (the TS order).
        self._relocate_palace_rival(
            torch.tensor([b], dtype=torch.long, device=self.device),
            torch.tensor([r_from], dtype=torch.long, device=self.device),
        )
        # A-17: exactly the flipping city's tiles re-tag (registry scan) —
        # the transferRivalCityToRival twin (rc_id read before the hygiene
        # writes; the slot's id field itself is never reset on death).
        id_from = int(self.rc_id[b, r_from, j])
        own_t = (self.rc_tile_id[b] == id_from) & (self.rival_at[b] == r_from)
        # A-11: the loser's routes die with their endpoint (receiver starts
        # route-less — the TS from.tradeRoutes filter twin).
        kill = (self.r_routes[b, r_from, :, 0] == id_from) | (self.r_routes[b, r_from, :, 1] == id_from)
        self.r_routes[b, r_from][kill] = -1
        self.r_route_dest[b, r_from][kill] = -1  # B-23
        self.r_route_exp[b, r_from][kill] = -1   # B-23
        self.rival_at[b] = torch.where(own_t, torch.full_like(self.rival_at[b], r_to), self.rival_at[b])
        # A-17: re-tagged tiles register to the receiving rc (its id is
        # assigned below from r_next_city_id — same value, read here first)
        self.rc_tile_id[b] = torch.where(own_t, torch.full_like(self.rc_tile_id[b], int(self.r_next_city_id[b, r_to])), self.rc_tile_id[b])
        occ = self.rc_alive[b, r_to].nonzero(as_tuple=True)[0]
        slot = int(occ.max()) + 1 if len(occ) else 0
        assert slot < self.RC, "rival city slots exhausted - raise RC (compaction already ran; this is true living capacity)"
        self.rc_alive[b, r_to, slot] = True
        self.era_score[b, r_to + 1] += self._era_pts["conquer"]  # B-24: gained a city (rc→rc flip or #55 war capture)
        self.rc_is_cap[b, r_to, slot] = False  # TS transferRivalCityToRival: isCapital false
        self.rc_center[b, r_to, slot] = c_t
        self.rc_pop[b, r_to, slot] = max(1, (old_pop * 3) // 4)
        self.rc_growth[b, r_to, slot] = 0
        self.rc_cbox[b, r_to, slot] = 0
        self.rc_gw_writing[b, r_to, slot] = b20_gww  # B-20 (#79): works ride with the city
        self.rc_gw_art[b, r_to, slot] = b20_gwa      # (was: writing/music zeroed, art/relics
        self.rc_gw_music[b, r_to, slot] = b20_gwm    #  left as whatever the reused slot held)
        self.rc_relics[b, r_to, slot] = b20_rel
        self.rc_artifacts[b, r_to, slot] = b20_art
        self.rc_loyalty[b, r_to, slot] = 100.0
        self.rc_acquired[b, r_to, slot] = old_acq
        self.rc_hp[b, r_to, slot] = round(self.rules.rivals.get("cityMaxHp", 200) / 2)
        self.rc_current[b, r_to, slot] = -1
        self.rc_progress[b, r_to, slot] = 0
        self.rc_cost[b, r_to, slot] = 0
        self.rc_qtile[b, r_to, slot] = -1
        # AUDIT B-30: adopt the flipping city's districts, wonders and
        # buildings (registry indices carried verbatim — the tiles stay put).
        # ANCIENT_WALLS rides along; the outer pool resets to 0 (walls kept at
        # outerHp 0, heal back via B-1 — the heal gate reads rc_bldg's walls bit).
        self.rc_dist_tile[b, r_to, slot, :] = b30_dist
        self.rc_wonder[b, r_to, slot, :] = b30_wond
        self.rc_bldg[b, r_to, slot, :] = b30_bldg
        self.rc_outer_hp[b, r_to, slot] = 0  # AUDIT B-30: walls (if any) kept at outer pool 0
        self.rc_id[b, r_to, slot] = int(self.r_next_city_id[b, r_to])
        self.r_next_city_id[b, r_to] += 1
        self.rvcity_at[b, c_t] = r_to
        self._eff_version += 1

    def _rival_border_key(self, r: int, j: int, center: torch.Tensor):
        """A-5r (#71) / C-15: the SHARED border-candidate pick key for rc slot
        j — dist asc, resource priority desc, milli-rounded yield sum desc,
        global tile index asc (the pickRivalBorderTile twin). Factored out so
        the CULTURE claim (_rival_border_growth) and the GOLD purchase (A-5r)
        use ONE construction and can never drift apart. Loop-invariant: claims
        mutate ownership only, never the key. Returns (tiles, tc, nbs, key0)."""
        B = self.B
        _bmul = self._bel_mul("border", r) if self._r_has_beliefs(r) else None
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
            # B-27 (#71): the resort's appeal-gold rides the border pick key too.
            if self.SEASIDE >= 0:
                y_oth = y_oth + self._tile_appeal().clamp(min=0).to(self.dtype) * (
                    (self.improvement == self.SEASIDE).to(self.dtype) * live_imp
                )
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
        return tiles, tc, nbs, key0

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
        tiles, tc, nbs, key0 = self._rival_border_key(r, j, center)
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
        self.era_score[rows, r + 1] += self._era_pts["found"]  # B-24: foundRivalCity moment
        self.rc_is_cap[rows, r, slot] = new_cap
        self.cap_tile_rival[rows, r] = torch.where(new_cap, s_idx, self.cap_tile_rival[rows, r])
        self.rc_center[rows, r, slot] = s_idx
        self.rc_pop[rows, r, slot] = 1
        self.rc_growth[rows, r, slot] = 0
        self.rc_cbox[rows, r, slot] = 0  # P5/S4
        self.rc_gw_writing[rows, r, slot] = 0  # B-20: fresh rival city holds no works
        self.rc_gw_music[rows, r, slot] = 0
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
            blocked_side = "rival"  # _blocked_for's strict fallthrough (unchanged)
        ttc = tgt.clamp(min=0)
        here = a_tile[:, u]
        dm = self.pmil_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        dc_ = self.pciv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        db = self.barb_at.gather(1, ttc.unsqueeze(1)).squeeze(1) if atk_kind == "rival" else torch.full_like(dm, -1)
        if atk_kind == "barb":
            dv = self.rv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
            dvc = self.rvciv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        else:
            # A-19/B-33 (S2): a RIVAL attacker's valid rival defenders are ENEMY
            # AT-WAR rival units only (never its own civ) — the symmetric
            # unitsHostile. Own-civ units at the tile stay -1 (not targets).
            ac_h = self.v_civ[:, u].clamp(min=0)
            bidx_h = torch.arange(self.B, device=self.device)
            dv_raw = self.rv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
            dvc_raw = self.rvciv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
            dv_civ = torch.where(dv_raw >= 0, self.v_civ.gather(1, dv_raw.clamp(min=0).unsqueeze(1)).squeeze(1), torch.full_like(dv_raw, -1))
            dvc_civ = torch.where(dvc_raw >= 0, self.v_civ.gather(1, dvc_raw.clamp(min=0).unsqueeze(1)).squeeze(1), torch.full_like(dvc_raw, -1))
            dv_war = (dv_raw >= 0) & (dv_civ != ac_h) & self.rr_war[bidx_h, ac_h, dv_civ.clamp(min=0)]
            dvc_war = (dvc_raw >= 0) & (dvc_civ != ac_h) & self.rr_war[bidx_h, ac_h, dvc_civ.clamp(min=0)]
            dv = torch.where(dv_war, dv_raw, torch.full_like(dv_raw, -1))
            dvc = torch.where(dvc_war, dvc_raw, torch.full_like(dvc_raw, -1))
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
            # B-4: defender veterancy — player via p_xp, rival via v_xp, barb none.
            # Folded into base def_cs so the embarked override drops it (like B-7).
            def_xp = torch.where(
                def_is_barb, torch.zeros_like(dm),
                torch.where(
                    def_is_rv,
                    self._xp_lvl_bonus(self.v_xp.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)),
                    self._xp_lvl_bonus(self.p_xp.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)),
                ),
            )
            def_cs = torch.where(def_is_barb, d_cs_b, torch.where(def_is_rv, d_cs_v, d_cs_p)) + self._tdef_g(ttc) + def_fort + def_xp  # B-5 + B-4
            # #45/B-6: an EMBARKED defender (player p_emb, or rival v_emb — barbs
            # never embark) overrides to a flat CS, no terrain/fortify/support.
            d_emb = (self.p_emb.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1) & ~def_is_barb & ~def_is_rv) | (self.v_emb.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1) & def_is_rv)
            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
            # B-29: attacker AND defender fight at HP-reduced strength.
            d_hp_p = self.p_hp.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)
            d_hp_b = self.u_hp.gather(1, db.clamp(min=0).unsqueeze(1)).squeeze(1)
            d_hp_v = self.v_hp.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)
            def_hp = torch.where(def_is_barb, d_hp_b, torch.where(def_is_rv, d_hp_v, d_hp_p))
            # B-4: attacker veterancy — a rival attacker via v_xp; barbs never accrue.
            atk_lvl5 = torch.zeros_like(a_hp[:, u]) if atk_kind == "barb" else self._xp_lvl_bonus(self.v_xp[:, u])
            atk_e = atk_cs_all - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(here, tgt) + atk_lvl5  # B-29 river + B-4 veterancy
            def_e = def_cs - self._wound(def_hp)
            # B-7: flanking helps the hostile attacker (barb/rival at `here`),
            # support helps the defender (player, barb or rival).
            _dside = torch.where(def_is_barb, torch.ones_like(dm), torch.where(def_is_rv, torch.full_like(dm, 2), torch.zeros_like(dm)))
            _dciv = self.v_civ.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)
            _fl, _sp = self._flank_support(tgt, _dside, _dciv, here)
            atk_e = atk_e + FLANKING_CS * _fl
            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)  # #45/B-6: embarked → no support
            # B6-S1: enhancer adders — a RIVAL attacker gets the attack terms
            # (Just War near + Crusade onto following territory); a RIVAL
            # defender gets the defense terms (embarked = flat, none). Barbs
            # and player units carry no religion (no GPU player founding).
            if atk_kind == "rival":
                atk_e = atk_e + (self._rel_atk_cs(self.v_civ[:, u], tgt).to(atk_e.dtype))  # B6-S1 unit-vs-unit: NEVER gated (the #71 city flag must not reach here)
            def_e = def_e + torch.where(d_emb, torch.zeros_like(def_e), self._rel_def_cs(torch.where(def_is_rv, _dciv, torch.full_like(_dciv, -1)), tgt).to(def_e.dtype))
            # B7-G (B-8): Great General / Admiral aura. Attacker keyed on its own
            # tile `here` (a RIVAL attacker gets its civ's aura; a BARB has none);
            # defender keyed on `tgt` — player (civ 0), rival (_dciv+1) or barb
            # (-1). Embarked/naval → the ADMIRAL (sea) plane; NOT zeroed for
            # embarked (mirrors combat.generalAuraCS: embarked defender gets the
            # admiral aura on top of its flat CS).
            if atk_kind == "rival":
                atk_naval = self.unit_naval[self.v_type[:, u].clamp(min=0, max=self.NU - 1)] | self.v_emb[:, u]
                atk_e = atk_e + self._gen_aura_cs(self.v_civ[:, u] + 1, here, atk_naval).to(atk_e.dtype)
            _p_def_nav = self.unit_naval[self.p_type.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)]
            _v_def_nav = self.unit_naval[self.v_type.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)]
            def_naval = d_emb | torch.where(def_is_barb, torch.zeros_like(d_emb), torch.where(def_is_rv, _v_def_nav, _p_def_nav))
            def_civ_u = torch.where(def_is_barb, torch.full_like(dm, -1), torch.where(def_is_rv, _dciv + 1, torch.zeros_like(dm)))
            def_e = def_e + self._gen_aura_cs(def_civ_u, tgt, def_naval).to(def_e.dtype)
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
            # B-4: a rival attacker earns +5 for the attack executed (barbs none);
            # a surviving MILITARY defender earns +2 (player via p_xp / dm, rival
            # via v_xp / dv; barb defenders never accrue).
            if atk_kind == "rival":
                self.v_xp[:, u] = torch.where(mil_att, self.v_xp[:, u] + XP_ATTACK, self.v_xp[:, u])
            surv_p = (mil_att & ~def_is_barb & ~def_is_rv & ~def_dead).nonzero(as_tuple=True)[0]
            if len(surv_p) > 0:
                self.p_xp[surv_p, dm[surv_p]] += XP_DEFEND
            surv_v = (mil_att & def_is_rv & ~def_dead).nonzero(as_tuple=True)[0]
            if len(surv_v) > 0:
                self.v_xp[surv_v, dv[surv_v]] += XP_DEFEND
            a_hp[:, u] = torch.where(mil_att, a_hp[:, u] - d_atk, a_hp[:, u])
            atk_dead = mil_att & (a_hp[:, u] <= 0)
            both = def_dead & atk_dead
            a_hp[:, u] = torch.where(both, torch.ones_like(a_hp[:, u]), a_hp[:, u])  # victor survives
            atk_dead = atk_dead & ~def_dead
            if bool(atk_dead.any()):
                ar = atk_dead.nonzero(as_tuple=True)[0]
                a_at[ar, here[ar]] = -1
                a_alive[:, u] = a_alive[:, u] & ~atk_dead
            # B5-M1 hunt fix: mirror TS tileFreeForUnit's TERRAIN check that
            # _blocked_for (occupancy-only) omits. A LAND attacker (barb, or a
            # land/embarked rival) may not advance onto WATER (allowEmbark is
            # false in meleeAttack); a NAVAL rival advances onto enterable water
            # (wpass, OCEAN needing its civ's CARTOGRAPHY) but never land. Without
            # this the attacker teleported onto the water tile of a just-killed
            # embarked enemy, desyncing from TS.
            ttc_adv = tgt.clamp(min=0)
            land_ok = self.passable.gather(1, ttc_adv.unsqueeze(1)).squeeze(1)
            if atk_kind == "rival":
                naval_att = self.unit_naval[self.v_type[:, u].clamp(min=0, max=self.NU - 1)]
                civ_u = self.v_civ[:, u].clamp(min=0)
                cart_u = (
                    self.r_techs[torch.arange(self.B, device=self.device), civ_u, self._cartography_tech]
                    if self._cartography_tech >= 0 else torch.zeros(self.B, dtype=torch.bool, device=self.device)
                )
                water_ok = self.wpass.gather(1, ttc_adv.unsqueeze(1)).squeeze(1) & (
                    ~self.ocean_tile.gather(1, ttc_adv.unsqueeze(1)).squeeze(1) | cart_u
                )
                adv_terr = torch.where(naval_att, water_ok, land_ok)
            else:
                # B-26 (2026-07-27): barbarians CAN be naval now (the GALLEY /
                # QUADRIREME raiders), so the old "never naval — land plane
                # only" shortcut is wrong: a hull that killed an adjacent land
                # civilian advanced ASHORE. A barb owns no tech, so its water
                # plane is wpass minus OCEAN (no CARTOGRAPHY), which is exactly
                # what TS's tileFreeForUnit/waterEnterable allows it.
                adv_terr = torch.where(
                    self._u_naval[self.u_type[:, u].clamp(min=0)],
                    self._barb_water_ok(ttc_adv),
                    land_ok,
                )
            _bciv = None if atk_kind == "barb" else self.v_civ[:, u]  # B-17 (#71)
            adv = def_dead & ~atk_dead & ~self._blocked_for(tgt.unsqueeze(1), blocked_side, _bciv).squeeze(1) & adv_terr
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
            if atk_kind == "rival":
                # AUDIT B-31: an at-war rival melee on a lone player civilian
                # CAPTURES it — roll-free (draw-count neutral), no advance
                # (single-occupancy). Pool TRANSFER p_* -> v_* in spawn order
                # (last-alive+1), keyed to the attacker's civ, hp and charges
                # carried; movesLeft=0 -> v_acted so the D-2 heal skips it,
                # exactly like TS's defender.movesLeft = 0.
                ct = ttc[rows]
                cap_type = self.p_type[rows, ds]
                cap_hp = self.p_hp[rows, ds]
                cap_ch = self.p_charges[rows, ds]
                cap_emb = self.p_emb[rows, ds]  # #45/B-6: read BEFORE despawn
                cap_xp = self.p_xp[rows, ds]  # B-4: read BEFORE despawn (civilian xp 0, but carry it)
                self.pciv_at[rows, ct] = -1
                self.p_alive[rows, ds] = False
                nslot = self.v_next[rows]
                assert int(nslot.max()) < U_MAX, "rival slot pool exhausted — raise U_MAX"
                self.v_alive[rows, nslot] = True
                self.v_civ[rows, nslot] = self.v_civ[rows, u]
                self.v_type[rows, nslot] = cap_type
                self.v_tile[rows, nslot] = ct
                self.v_hp[rows, nslot] = cap_hp
                self.v_charges[rows, nslot] = cap_ch
                self.v_fortify[rows, nslot] = 0  # B-5: a civilian never fortifies
                self.v_xp[rows, nslot] = cap_xp  # B-4: ownership transfer carries xp
                self.v_aura_mp[rows, nslot] = 0  # #70/S3 (B-8): a captured CIVILIAN never auras
                self.v_emb[rows, nslot] = cap_emb  # #45/B-6: captured unit KEEPS embarked under new owner
                self.v_acted[rows, nslot] = True  # movesLeft = 0 (blocks the D-2 heal)
                self.rvciv_at[rows, ct] = nslot
                self.v_next[rows] += 1
            else:
                self.pciv_at[rows, ttc[rows]] = -1
                self.p_alive[rows, ds] = False
            self._gen_ver += 1  # B7-G (B-8): a captured/killed civilian may be a general → invalidate the aura plane
        if bool(rvciv_att.any()):
            rows = rvciv_att.nonzero(as_tuple=True)[0]
            ds = dvc[rows]
            if atk_kind == "rival":
                # A-19/B-33 (S2): a rival CAPTURES an enemy rival's lone civilian
                # (B-31 symmetric) — despawn the old slot, respawn at POOL END
                # under the attacker's civ; hp/charges/xp/embark kept, moves 0.
                ct = ttc[rows]
                cap_type = self.v_type[rows, ds]
                cap_hp = self.v_hp[rows, ds]
                cap_ch = self.v_charges[rows, ds]
                cap_emb = self.v_emb[rows, ds]
                cap_xp = self.v_xp[rows, ds]
                self.rvciv_at[rows, ct] = -1
                self.v_alive[rows, ds] = False
                nslot = self.v_next[rows]
                assert int(nslot.max()) < U_MAX, "rival slot pool exhausted — raise U_MAX"
                self.v_alive[rows, nslot] = True
                self.v_civ[rows, nslot] = self.v_civ[rows, u]
                self.v_type[rows, nslot] = cap_type
                self.v_tile[rows, nslot] = ct
                self.v_hp[rows, nslot] = cap_hp
                self.v_charges[rows, nslot] = cap_ch
                self.v_fortify[rows, nslot] = 0
                self.v_xp[rows, nslot] = cap_xp
                self.v_aura_mp[rows, nslot] = 0  # #70/S3 (B-8): a captured CIVILIAN never auras
                self.v_emb[rows, nslot] = cap_emb
                self.v_acted[rows, nslot] = True
                self.rvciv_at[rows, ct] = nslot
                self.v_next[rows] += 1
            else:
                # C1-B5b: a barbarian kills a lone rival civilian roll-free.
                self.rvciv_at[rows, ttc[rows]] = -1
                self.v_alive[rows, ds] = False
            self._gen_ver += 1  # B7-G (B-8): the killed/captured civilian may be a general → invalidate the aura plane
        # B-31: a captured civilian is NOT killed — its captor does NOT advance
        # onto it. Only a barbarian kill (barb attacker) frees the tile for the
        # advance; a rival captor (civ_att under atk_kind=="rival") stays put.
        kill_adv = (civ_att | rvciv_att) if atk_kind == "barb" else torch.zeros_like(civ_att)
        if bool(kill_adv.any()):
            _bciv2 = None if atk_kind == "barb" else self.v_civ[:, u]  # B-17 (#71)
            # B-26 (2026-07-27): the SAME naval-plane gate as the melee advance
            # above — a roll-free civilian kill by a barb GALLEY must not walk
            # the hull onto the (land) tile it just cleared.
            _kt = tgt.clamp(min=0)
            _kterr = (
                torch.where(
                    self._u_naval[self.u_type[:, u].clamp(min=0)],
                    self._barb_water_ok(_kt),
                    self.passable.gather(1, _kt.unsqueeze(1)).squeeze(1),
                )
                if atk_kind == "barb"
                else torch.ones_like(kill_adv)
            )
            adv = kill_adv & _kterr & ~self._blocked_for(tgt.unsqueeze(1), blocked_side, _bciv2).squeeze(1)
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
        # #70/S2 (B-8): attackRivalCity's atkCS now carries the general/admiral
        # aura — but this caller's attacker is a BARBARIAN (unified civ -1: barbs
        # own no GENERAL/ADMIRAL), so _gen_aura_cs is structurally 0 here and no
        # term is emitted (the same convention as the barb branch of B6-S1).
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

    def _rival_attack_rival_city(self, att: torch.Tensor, tgt: torch.Tensor, u: int) -> None:
        """A-19/B-33 (S2): a rival battering an enemy AT-WAR rival's city
        (mirrors attackRivalCity for a rival attacker): P4/D-22 defense, B-1
        outer-pool absorb, rcty/rctyc rolls, +5 XP; at 0 HP the CONQUEROR TAKES
        the city via _transfer_rc_to_rc (no +40 for the rival-vs-rival path)."""
        if not bool(att.any()):
            return
        B, dev = self.B, self.device
        bidx = torch.arange(B, device=dev)
        ttc = tgt.clamp(min=0)
        civ = self.rvcity_at.gather(1, ttc.unsqueeze(1)).squeeze(1).clamp(min=0)  # defender civ
        slot = torch.zeros_like(civ)
        for j in range(self.RC):
            hit = (self.rc_center[bidx, civ, j] == ttc) & self.rc_alive[bidx, civ, j]
            slot = torch.where(att & hit, torch.full_like(slot, j), slot)
        # P4/D-22 rivalCityDefense: max(15, defender civ's strongest melee ever)
        # + 5 for its own military garrisoning the center (ungarrisoned here by
        # construction — rc_att required ~has_u — but keep the term for parity).
        best_r = self.r_best_melee[bidx, civ]
        gslot = self.rv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        gar = ((gslot >= 0) & (self.v_civ[bidx, gslot.clamp(min=0)] == civ)).long()
        def_cs = torch.maximum(best_r, torch.full_like(best_r, 15)) + gar * 5
        atk_cs = self._p_combat[self.v_type[:, u].clamp(min=0, max=self.NU - 1)]
        atk_e = atk_cs - self._wound(self.v_hp[:, u]) - 5.0 * self._river_cross(self.v_tile[:, u], tgt) + self._xp_lvl_bonus(self.v_xp[:, u])  # B-29 wound + river + B-4 veterancy
        # #70/S2 (B-8): the RIVAL attacker's own general/admiral aura joins
        # attackRivalCity's atkCS — once, before both paired rolls.
        atk_naval = self.unit_naval[self.v_type[:, u].clamp(min=0, max=self.NU - 1)] | self.v_emb[:, u]
        # #71 (DEBT-2): the enhancer ATTACKER adders apply to city assaults too —
        # Crusade/Just War key on where the UNIT stands, not on what it hits.
        # Inserted BEFORE the aura add so term order matches the TS assembly.
        atk_e = atk_e + (self._rel_atk_cs(self.v_civ[:, u], tgt).to(atk_e.dtype) if self._city_rel_live else 0)
        atk_e = atk_e + self._gen_aura_cs(self.v_civ[:, u] + 1, self.v_tile[:, u], atk_naval).to(atk_e.dtype)
        d_city = self._damage_roll(att, atk_e - def_cs, k="rcty", tile=tgt)
        d_atk = self._damage_roll(att, def_cs - atk_e, k="rctyc", tile=tgt)
        self.v_xp[:, u] = torch.where(att, self.v_xp[:, u] + XP_ATTACK, self.v_xp[:, u])  # B-4: +5 for the attack
        rows = att.nonzero(as_tuple=True)[0]
        # AUDIT B-1: the outer wall pool soaks the hit first, spillover to HP.
        outer = self.rc_outer_hp[rows, civ[rows], slot[rows]]
        absorbed = torch.minimum(outer, d_city[rows])
        self.rc_outer_hp[rows, civ[rows], slot[rows]] = outer - absorbed
        self.rc_hp[rows, civ[rows], slot[rows]] -= d_city[rows] - absorbed
        self.v_hp[:, u] = torch.where(att, self.v_hp[:, u] - d_atk, self.v_hp[:, u])
        died = att & (self.v_hp[:, u] <= 0)
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            self.rv_at[dr, self.v_tile[dr, u]] = -1
            self.v_alive[:, u] = self.v_alive[:, u] & ~died
        captured = rows[self.rc_hp[rows, civ[rows], slot[rows]] <= 0]
        if len(captured) > 0:
            atk_civ = self.v_civ[:, u]
            for b in captured.tolist():
                # the conqueror is the attacker's civ; no +40 plunder (v1 rival-
                # vs-rival). transfer runs per-row (loyalty-flip machinery reuse).
                self._transfer_rc_to_rc(b, int(civ[b]), int(slot[b]), int(atk_civ[b]))

    def _tdef_g(self, tiles: torch.Tensor) -> torch.Tensor:
        """[B] terrain defence at `tiles`, INCLUDING a live FORT (+4).

        B-27 (#78): TS's `terrainDefense` reads `tile.improvement` LIVE, so the
        fort bonus cannot be baked into the static `tdef` plane — a fort is
        built, pillaged and replaced mid-game, and the chop/found paths rewrite
        `tdef` from hills alone, which would silently erase it.
        """
        d = self.tdef.gather(1, tiles.unsqueeze(1)).squeeze(1)
        if self.FORT >= 0:
            d = d + 4 * (self.improvement.gather(1, tiles.unsqueeze(1)).squeeze(1) == self.FORT).long()
        return d

    def _tdef_i(self, bidx: torch.Tensor, tiles: torch.Tensor) -> torch.Tensor:
        """The advanced-indexing twin of _tdef_g (same rule, same +4)."""
        d = self.tdef[bidx, tiles]
        if self.FORT >= 0:
            d = d + 4 * (self.improvement[bidx, tiles] == self.FORT).long()
        return d

    def _in_enemy_zoc(self, dest: torch.Tensor, atwar: torch.Tensor, mover_civ: torch.Tensor | None = None) -> torch.Tensor:
        """B-3 ZOC (mirrors units.inEnemyZoc for a RIVAL mover): does `dest`
        sit adjacent to a MILITARY unit hostile to the mover? Barbarians exert
        it always; player military only while that mover's civ is at war.
        A-19/B-33 (S2): when `mover_civ` [B] (the mover's rival civ) is given,
        an enemy AT-WAR rival's military also exerts ZOC on this mover. [B]->[B]."""
        # #45/B-6: EMBARKED player military exert NO ZOC (barbs never embark).
        pmil_exert = (self.pmil_at >= 0) & ~self.p_emb.gather(1, self.pmil_at.clamp(min=0))
        hostmil = (self.barb_at >= 0) | (pmil_exert & atwar.unsqueeze(1))
        if mover_civ is not None:
            rmil_exert = (self.rv_at >= 0) & ~self.v_emb.gather(1, self.rv_at.clamp(min=0))
            rmil_civ = torch.where(self.rv_at >= 0, self.v_civ.gather(1, self.rv_at.clamp(min=0)), torch.full_like(self.rv_at, -1))  # [B, T]
            mc = mover_civ.clamp(min=0).unsqueeze(1)  # [B, 1]
            bidxT = torch.arange(self.B, device=self.device).unsqueeze(1)
            war_t = self.rr_war[bidxT, mc, rmil_civ.clamp(min=0)]  # [B, T]
            hostmil = hostmil | (rmil_exert & (rmil_civ != mover_civ.unsqueeze(1)) & war_t)
        dn = self.neigh[dest.clamp(min=0)]  # [B, 6] neighbor tile indices
        return ((dn >= 0) & hostmil.gather(1, dn.clamp(min=0))).any(dim=1)

    def _rr_hostile_units_at(self, v: int) -> tuple[torch.Tensor, torch.Tensor]:
        """A-19/B-33 (S2): per-tile masks [B, T] of ENEMY AT-WAR rival units
        (military, civilian) relative to unit slot v's civ — the symmetric
        unitsHostile for the rival-rival war-act target scan. Own-civ units are
        never hostile."""
        ac = self.v_civ[:, v].clamp(min=0)  # [B]
        bidxT = torch.arange(self.B, device=self.device).unsqueeze(1)
        rvm_civ = torch.where(self.rv_at >= 0, self.v_civ.gather(1, self.rv_at.clamp(min=0)), torch.full_like(self.rv_at, -1))  # [B, T]
        rvc_civ = torch.where(self.rvciv_at >= 0, self.v_civ.gather(1, self.rvciv_at.clamp(min=0)), torch.full_like(self.rvciv_at, -1))
        war_m = (self.rv_at >= 0) & (rvm_civ != ac.unsqueeze(1)) & self.rr_war[bidxT, ac.unsqueeze(1), rvm_civ.clamp(min=0)]
        war_c = (self.rvciv_at >= 0) & (rvc_civ != ac.unsqueeze(1)) & self.rr_war[bidxT, ac.unsqueeze(1), rvc_civ.clamp(min=0)]
        return war_m, war_c

    def _in_enemy_zoc_barb(self, dest: torch.Tensor) -> torch.Tensor:
        """AUDIT B-26/B-3 (ROUND B10) ZOC for a BARBARIAN mover — mirrors
        inEnemyZoc via unitsHostile: a barb is hostile to every non-barb, so
        any adjacent NON-EMBARKED PLAYER or RIVAL military halts it (player
        always, rivals always — barbs raid rivals too, C-4a; no at-war gate).
        Other barbs exert nothing. [B]->[B]."""
        # #45/B-6: embarked military exert no ZOC (barbs never embark).
        pmil_exert = (self.pmil_at >= 0) & ~self.p_emb.gather(1, self.pmil_at.clamp(min=0))
        rmil_exert = (self.rv_at >= 0) & ~self.v_emb.gather(1, self.rv_at.clamp(min=0))
        hostmil = pmil_exert | rmil_exert
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
        # A-19/B-33 (S2): hostility is now civ-aware — a rival in the war-act may
        # be at war with the player, an enemy rival, or both. hp = at war with
        # the player (player units/cities + player-suzerain CS are targets only
        # then); barbs always; enemy AT-WAR rival units/cities via rr_war.
        ac = self.v_civ[:, v].clamp(min=0)  # [B] attacker civ
        bidxT = torch.arange(B, device=dev).unsqueeze(1)
        hp = self.r_atwar.gather(1, ac.unsqueeze(1)).squeeze(1)  # [B] hostile to player
        war_m, war_c = self._rr_hostile_units_at(v)  # [B, T] enemy at-war rival units
        # A-19/B-33 (S2): enemy rival units are MELEE-only targets (a rival's
        # RANGED units do not bombard enemy rivals — the ranged-vs-rival-city /
        # walls-strike scope-out family; melee rivals fight rivals via
        # _hostile_vs_unit). Player/barb targets are unchanged for ranged.
        rr_units = (war_m | war_c) & ~rngd.unsqueeze(1)
        units_pl = (((self.pmil_at >= 0) | (self.pciv_at >= 0)) & hp.unsqueeze(1)) | (self.barb_at >= 0) | rr_units
        # enemy AT-WAR rival city center (rvcity_at holds the owning civ) — a
        # MELEE-only d==1 target (rivalVsRivalCity; ranged-vs-rival-city out of
        # scope, like csWar). Own / non-at-war centers are NOT targets.
        rc_civ_at = self.rvcity_at  # [B, T], -1 if not a rival center
        enemy_rc = (rc_civ_at >= 0) & (rc_civ_at != ac.unsqueeze(1)) & self.rr_war[bidxT, ac.unsqueeze(1), rc_civ_at.clamp(min=0)]  # [B, T]
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
        # TS attackTargets.playerCity keys on district==CITY_CENTER (NOT player
        # ownership) — so while hostileToPlayer (hp) EVERY city center (player,
        # own, or another rival) is a target at full range; a non-player center
        # resolves to the no-op quirk (hostileRangedStrike / meleeAttack return
        # early but hostileUnitAct still returns → the unit HOLDS, no march).
        # Mirror that with rvcity_at gated on hp (the pre-S2 GPU included it
        # ungated because war-act rivals were always hp).
        valid = (
            (d_all >= 1)
            & (d_all <= rng_u.unsqueeze(1))
            # AUDIT #78: exclude the attacker's OWN centre (see combat.ts's
            # ownCentre). The blind form let a rival select its own capital,
            # after which the resolver refused the attack while `attack` stayed
            # True, suppressing `march` and freezing the unit permanently.
            # Barbs are untouched here (this is the rival path), matching TS.
            & (
                (
                    # #79 (#49): the rvcity_at arm is GONE. It let an at-war
                    # rival select ANY other rival's centre at full range —
                    # including one it was at PEACE with — which the resolver
                    # then refuses, so the unit HELD and never marched (the
                    # same freeze #78 fixed for the attacker's own capital).
                    # Legitimate rival-vs-rival capture still arrives below via
                    # `enemy_rc & d==1 & melee`. center_at is player centres
                    # only; an unconquered city-state has no CITY_CENTER
                    # district in TS either, so this is now the player-city arm
                    # it always claimed to be.
                    (self.center_at >= 0)
                    & hp.unsqueeze(1)
                )
                | units_pl
            )
        )
        valid = valid | (enemy_rc & (d_all == 1) & ~rngd.unsqueeze(1))  # A-19/B-33: enemy rival center, melee CAPTURE (vs the no-op quirk above)
        # B-17 (#71): an adjacent LIVE enemy Encampment is a melee target — the
        # only way to open its tile (attackTargets' encampTarget: d==1, !ranged).
        enc_plane = self._encamp_block_plane("rmil", ac) if self._encamp_didx >= 0 else None
        if enc_plane is not None:
            valid = valid | (enc_plane & (d_all == 1) & ~rngd.unsqueeze(1))
        if cs_suz_t is not None:
            valid = valid | (cs_suz_t & (d_all == 1) & ~rngd.unsqueeze(1) & hp.unsqueeze(1))  # csWar requires hostileToPlayer
        tkey = torch.where(valid, self._arangeT.unsqueeze(0).expand(B, T), torch.full((B, T), T + 1, dtype=torch.long, device=dev))
        target_tile = tkey.min(dim=1).values
        # #45/B-6: an EMBARKED unit cannot attack (attackTargets returns [] in
        # TS) — it falls through to the march (its water tile has no improvement
        # to pillage, so the pillage branch is naturally inert too).
        attack = act & (target_tile <= T) & ~self.v_emb[:, v]
        ttc = target_tile.clamp(max=T - 1)
        tgt_city = self.center_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        has_u = units_pl.gather(1, ttc.unsqueeze(1)).squeeze(1)
        tgt_enemy_rc = enemy_rc.gather(1, ttc.unsqueeze(1)).squeeze(1)  # A-19/B-33
        city_att = attack & (tgt_city >= 0) & ~rngd  # player city: garrison ignored (enemyCity-first)
        unit_att = attack & (tgt_city < 0) & has_u & ~rngd  # a garrisoned enemy rival center hits the garrison here (TS enemies.length>0)
        # A-19/B-33 (S2): an UNGARRISONED enemy rival center is battered/captured
        # (attackRivalCity via _transfer_rc_to_rc); own/other rival centers with
        # no unit stay the no-op quirk (fall through to the march).
        rc_att = attack & (tgt_city < 0) & ~has_u & tgt_enemy_rc & ~rngd

        if bool(city_att.any()):
            self._hostile_city_attack(city_att, tgt_city, "rival", v)
        if bool(unit_att.any()):
            self._hostile_vs_unit(unit_att, ttc, "rival", v)
        # B-17 (#71): an ungarrisoned, non-city Encampment tile is assaulted.
        # Ordered AFTER the city classes exactly as meleeAttack orders them.
        if enc_plane is not None:
            tgt_enc = enc_plane.gather(1, ttc.unsqueeze(1)).squeeze(1)
            enc_att = attack & (tgt_city < 0) & ~has_u & ~tgt_enemy_rc & tgt_enc & ~rngd
        else:
            enc_att = None
        if bool(rc_att.any()):
            self._rival_attack_rival_city(rc_att, ttc, v)
        if enc_att is not None and bool(enc_att.any()):
            self._attack_encampment(enc_att, ttc, "rival", v)
        acted_att = city_att | unit_att | rc_att
        # B-17 (#71): an Encampment assault SPENDS the attacker, exactly like
        # every other attack class — TS's attackEncampment sets movesLeft = 0.
        # Without this the unit went on to MARCH, which is how the hunt found
        # it (turn 157: acted a1 in TS, a0 on GPU; the rng slipped at 237).
        if enc_att is not None:
            acted_att = acted_att | enc_att
        # A-6: ranged rows strike instead — one roll, no retaliation; the
        # method returns the rows that actually rolled (quirk rows spend
        # nothing, mirroring hostileRangedStrike's early return).
        r_att = attack & rngd
        if bool(r_att.any()):
            acted_att = acted_att | self._hostile_ranged_strike(r_att, ttc, "rival", v)
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
                atk_e = self._p_combat[vt0] - self._wound(self.v_hp[:, v]) - 5.0 * self._river_cross(hc0, ttc) + self._xp_lvl_bonus(self.v_xp[:, v])  # B-29 wound + river (CS center not a unit) + B-4 veterancy
                # #70/S2 (B-8): the rival attacker's aura on attackCityState's
                # atkCS — once, so the cstyc counter sees the same atk_e.
                atk_naval = self.unit_naval[vt0] | self.v_emb[:, v]
                # #71 (DEBT-2): the enhancer ATTACKER adders apply to city assaults too —
                # Crusade/Just War key on where the UNIT stands, not on what it hits.
                # Inserted BEFORE the aura add so term order matches the TS assembly.
                atk_e = atk_e + (self._rel_atk_cs(self.v_civ[:, v], ttc).to(atk_e.dtype) if self._city_rel_live else 0)
                atk_e = atk_e + self._gen_aura_cs(self.v_civ[:, v] + 1, here, atk_naval).to(atk_e.dtype)
                d_cs = self._damage_roll(cs_att, atk_e - def_cs, k="csty", tile=ttc)
                d_atk = self._damage_roll(cs_att, def_cs - atk_e, k="cstyc", tile=ttc)
                # B-4: +5 for the attack executed (CS center is not a unit — no defender xp).
                self.v_xp[:, v] = torch.where(cs_att, self.v_xp[:, v] + XP_ATTACK, self.v_xp[:, v])
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
            # A-19/B-33 (S2): a rival pillages PLAYER tiles only while at war
            # with the player (a rival-only-war rival leaves the neutral player
            # alone; rival-rival improvement pillage is out of scope — residual).
            h_owned = (self.owner.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0) & hp
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

        # AUDIT B-32: else pillage the DISTRICT underfoot — a COMPLETE, non-
        # CITY_CENTER, unpillaged PLAYER district (rival raiders hit the player
        # only; never other rivals). No heal, no loot (v1).
        dist_pillage = torch.zeros_like(act)
        if self.districts_on:
            h_dist = self.district.gather(1, hc.unsqueeze(1)).squeeze(1)
            h_dcomp = self.district_complete.gather(1, hc.unsqueeze(1)).squeeze(1)
            h_dunpil = ~self.district_pillaged.gather(1, hc.unsqueeze(1)).squeeze(1)
            h_downed = (self.owner.gather(1, hc.unsqueeze(1)).squeeze(1) >= 0) & hp  # A-19/B-33 (S2): player districts only at war with the player
            dist_pillage = act & ~attack & ~pillage & (h_dist >= 0) & h_dcomp & h_dunpil & h_downed
            if bool(dist_pillage.any()):
                rows = dist_pillage.nonzero(as_tuple=True)[0]
                self.district_pillaged[rows, hc[rows]] = True
                self.v_acted[rows, v] = True  # P4/D-2
                self._eff_version += 1  # CACHE: player district yields just dropped

        # March target: nearest unpillaged owned improvement OR district (the
        # B-32 union) within dist < 13 (ties -> lowest tile index), else nearest
        # player city — hostileUnitAct's widened target scan.
        march = act & ~attack & ~pillage & ~dist_pillage
        if not bool(march.any()):
            return
        arangeT = torch.arange(T, device=dev)
        # A-19/B-33 (S2): the improvement/district march targets PLAYER tiles
        # only while at war with the player (hp) — a rival-only-war rival heads
        # for the enemy rival's cities, not neutral player improvements.
        hpT = hp.unsqueeze(1)
        if self.improvements_on or self.districts_on:
            imp_job = (self.improvement >= 0) & ~self.pillaged & (self.owner >= 0) & hpT
            if self.districts_on:  # B-32: pillageable player districts join the union
                imp_job = imp_job | ((self.district >= 0) & self.district_complete & ~self.district_pillaged & (self.owner >= 0) & hpT)
            d_imp = self.pair_dist[hc.unsqueeze(1), arangeT.unsqueeze(0)].to(torch.long)
            ikey = torch.where(imp_job & (d_imp < 13), d_imp * (T + 1) + arangeT, torch.full_like(d_imp, 10**9))
            imp_min, imp_tgt = ikey.min(dim=1)
            has_imp = imp_min < 10**9
        else:
            has_imp = torch.zeros_like(act)
            imp_tgt = hc
        dc = self.pair_dist[hc.unsqueeze(1), self.site.clamp(min=0)].to(torch.long)
        # B9-R1: distance ties break by the FOUNDING sequence (TS array order),
        # not the slot index — see the barb twin (rng 2026006104 t78).
        # A-19/B-33 (S2): player cities are march targets only at war with the
        # player (hp); a rival ALSO marches to its at-war ENEMY rivals' cities
        # (key d*16384 + rivalId*2048 + centerTile), the PLAYER winning ties.
        ckey = torch.where(self.alive & hpT, dc * 4096 + self.city_seq, 10**9)
        city_min = ckey.min(dim=1).values
        pc_dist = torch.div(city_min, 4096, rounding_mode="floor")  # player-city distance (1e9//4096 stays huge)
        city_tgt = self.site.gather(1, ckey.argmin(dim=1, keepdim=True)).squeeze(1).clamp(min=0)
        rc_key_min = torch.full((B,), 10**18, dtype=torch.long, device=dev)
        rc_tgt = hc.clone()
        for r2 in range(self.R):
            war2 = self.rr_war[torch.arange(B, device=dev), ac, r2]  # [B]; diagonal false -> r2==ac safe
            if not bool(war2.any()):
                continue
            for j in range(self.RC):
                ct2 = self.rc_center[:, r2, j].clamp(min=0)
                alive2 = self.rc_alive[:, r2, j] & war2
                d2 = self.pair_dist[hc, ct2].to(torch.long)
                key2 = torch.where(alive2, d2 * (2048 * 8) + r2 * 2048 + ct2, torch.full_like(d2, 10**18))
                upd = key2 < rc_key_min
                rc_key_min = torch.where(upd, key2, rc_key_min)
                rc_tgt = torch.where(upd, ct2, rc_tgt)
        has_pc = city_min < 10**9
        has_rc = rc_key_min < 10**18
        rc_dist = torch.div(rc_key_min, 2048 * 8, rounding_mode="floor")
        # player wins ties (pc_dist <= rc_dist); else the nearest enemy rival city
        city_target = torch.where(has_pc & (~has_rc | (pc_dist <= rc_dist)), city_tgt, rc_tgt)
        tgt = torch.where(has_imp, imp_tgt, city_target)
        has_tgt = has_imp | has_pc | has_rc
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
        aw = self.r_atwar.gather(1, self.v_civ[:, v].clamp(min=0).unsqueeze(1)).squeeze(1)  # B-3: player-mil ZOC only at war
        # #45/B-6 EMBARK: the ONLY walker whose passability changes v1 — a land
        # unit may take WATER steps (embark) when `_embark_live`. INERT by
        # default (mirrors TS embarkState.live) so the gates are byte-identical.
        emb0 = self.v_emb[:, v]
        if self._embark_live:
            # embarked land units march on the flat EMBARK_MOVES pool.
            full_mp = torch.where(emb0, torch.full_like(self._p_moves[vt0], self._embark_moves), self._p_moves[vt0])
            bidx_e = torch.arange(B, device=dev)
            civ_r = self.v_civ[:, v].clamp(min=0)
            can_emb = (  # military embarks on SHIPBUILDING (tech of the unit's civ)
                self.r_techs[bidx_e, civ_r, self._shipbuilding_tech]
                if self._shipbuilding_tech >= 0 else torch.zeros(B, dtype=torch.bool, device=dev)
            )
            cart = (  # OCEAN needs CARTOGRAPHY; COAST/LAKE do not
                self.r_techs[bidx_e, civ_r, self._cartography_tech]
                if self._cartography_tech >= 0 else torch.zeros(B, dtype=torch.bool, device=dev)
            )
            is_naval = self.unit_naval[vt0]  # all-false current roster (N2 ships hulls)
        else:
            full_mp = self._p_moves[vt0]
        # #70/S3 (B-8): TS `granted = full + generalAuraMP` — the aura joins
        # AFTER the embark selection above (TS's `full` already accounts for
        # EMBARK_MOVES), and comes from the refresh-site snapshot so a general
        # that walks later this step cannot retro-change this pool.
        full_mp = full_mp + self.v_aura_mp[:, v]
        mp = full_mp.clone()
        cur = here.clone()
        d_cur = d_here.clone()
        emb = emb0.clone()
        moving = march & has_tgt
        while bool(moving.any()):
            nb2 = self.neigh[cur.clamp(min=0)]
            nb2c = nb2.clamp(min=0)
            if self._embark_live:
                land_ok = self.passable.gather(1, nb2c)
                water_gate = self.wpass.gather(1, nb2c) & (~self.ocean_tile.gather(1, nb2c) | cart.unsqueeze(1))
                # naval movers stand on water natively; land movers embark with SHIPBUILDING
                terr = torch.where(is_naval.unsqueeze(1), water_gate, land_ok | (water_gate & can_emb.unsqueeze(1)))
            else:
                terr = self.passable.gather(1, nb2c)
            step_ok = (nb2 >= 0) & terr & ~self._blocked_for(nb2, "rmil", civ=self.v_civ[:, v].unsqueeze(1))
            if self._embark_live:
                # B-26 (#79): a CLIFF closes the embark/disembark edge.
                step_ok = step_ok & ~self._cliff_block_dirs(cur, nb2, self.rival_at == self.v_civ[:, v].unsqueeze(1))
            d_nb = self.pair_dist[tgt.unsqueeze(1), nb2c].to(torch.long)
            skey = torch.where(step_ok, d_nb * 8 + arange6, 10**9)
            best = skey.min(dim=1).values
            dir_i = (best % 8).clamp(max=5)
            dest = nb2.gather(1, dir_i.unsqueeze(1)).squeeze(1)
            _terr, _riv = self._road_terms(  # B-23 (#71): roads
                cur, dest, 3 * ((self.river_mask.gather(1, cur.clamp(min=0).unsqueeze(1)).squeeze(1) >> dir_i) & 1)
            )
            land_cost = 1 + _terr + _riv
            if self._embark_live:
                # embark/disembark (a LAND unit crossing land↔water) costs ALL
                # remaining MP; a water→water step enters at 1 (no river charge).
                to_water = self.wpass.gather(1, dest.clamp(min=0).unsqueeze(1)).squeeze(1)
                transition = (emb != to_water) & ~is_naval
                cost = torch.where(transition, mp, torch.where(to_water, torch.ones_like(land_cost), land_cost))
            else:
                cost = land_cost
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
            if self._embark_live:
                emb = torch.where(mv, to_water & ~is_naval, emb)  # embarked ⟺ on a water tile
            # B-3 ZOC: a march step ending adjacent to a hostile military unit
            # halts (movesLeft:=0 after paying the enter cost above).
            mp = torch.where(mv & self._in_enemy_zoc(dest, aw, self.v_civ[:, v]), torch.zeros_like(mp), mp)
            d_cur = torch.where(mv, torch.div(best, 8, rounding_mode="floor"), d_cur)
            cur = torch.where(mv, dest, cur)
            moving = mv & (mp > 0)
        if self._embark_live:
            self.v_emb[:, v] = emb  # persist embark state across turns

    def _attack_encampment(self, att: torch.Tensor, tile: torch.Tensor, atk_kind: str, u: int) -> None:
        """B-17 (#71): the `attackEncampment` twin — a melee assault ON an
        Encampment tile. The district fights at its OWNER's civ-level defense
        floor (max(15, bestMeleeCS); no city-centre garrison term, since that
        +5 describes a unit standing in the CITY, not on this district), its
        own garrison pool takes the damage, and the attacker never advances.

        The roll KEY differs by target owner ('penc' vs 'renc'), so the two
        owner classes roll under DISJOINT masks. Rows are independent games and
        `_damage_roll` advances only masked rows, so every attacking row still
        draws exactly twice, in TS's order (damage-to-district, then counter)."""
        if atk_kind == "barb":
            a_hp, a_at, a_tile, a_alive = self.u_hp, self.barb_at, self.u_tile, self.u_alive
            atk_cs = self._unit_combat[self.u_type[:, u]]
        elif atk_kind == "player":
            a_hp, a_at, a_tile, a_alive = self.p_hp, self.pmil_at, self.p_tile, self.p_alive
            atk_cs = self._p_combat[self.p_type[:, u]]
        else:
            a_hp, a_at, a_tile, a_alive = self.v_hp, self.rv_at, self.v_tile, self.v_alive
            atk_cs = self._p_combat[self.v_type[:, u]]
        tc = tile.clamp(min=0)
        r_at = self.rival_at.gather(1, tc.unsqueeze(1)).squeeze(1)  # [B] owning rival, else -1
        floor = torch.full_like(self.best_melee, 15)
        p_def = torch.maximum(self.best_melee, floor)
        r_def = torch.maximum(
            self.r_best_melee.gather(1, r_at.clamp(min=0).unsqueeze(1)).squeeze(1), floor
        )
        def_cs = torch.where(r_at >= 0, r_def, p_def)
        # Attacker CS assembled exactly as _hostile_city_attack assembles it.
        if atk_kind == "barb":
            atk_lvl5 = torch.zeros_like(a_hp[:, u])
        elif atk_kind == "player":
            atk_lvl5 = self._xp_lvl_bonus(self.p_xp[:, u])
        else:
            atk_lvl5 = self._xp_lvl_bonus(self.v_xp[:, u])
        atk_e = atk_cs - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(a_tile[:, u], tc) + atk_lvl5
        if atk_kind == "player":
            # The PLAYER's aura (unified civ 0); its religion adder is
            # structurally absent on the GPU (no player holy city — the
            # pre-existing #71 asymmetry, and TS gates that term on rivals).
            p_naval = self.unit_naval[self.p_type[:, u].clamp(min=0, max=self.NU - 1)] | self.p_emb[:, u]
            atk_e = atk_e + self._gen_aura_cs(
                torch.zeros_like(tc), a_tile[:, u], p_naval
            ).to(atk_e.dtype)
        if atk_kind == "rival":
            atk_naval = self.unit_naval[self.v_type[:, u].clamp(min=0, max=self.NU - 1)] | self.v_emb[:, u]
            atk_e = atk_e + (self._rel_atk_cs(self.v_civ[:, u], tc).to(atk_e.dtype) if self._city_rel_live else 0)
            atk_e = atk_e + self._gen_aura_cs(self.v_civ[:, u] + 1, a_tile[:, u], atk_naval).to(atk_e.dtype)
        p_att, r_att = att & (r_at < 0), att & (r_at >= 0)
        diff, cdiff = atk_e - def_cs, def_cs - atk_e
        # CAREFUL: _damage_roll returns a value on EVERY row — only the RNG
        # ADVANCE is masked. Each roll must therefore be gated to its own rows
        # before the two owner classes are combined; summing them raw would
        # roughly DOUBLE both the damage dealt and the counter taken.
        _z = torch.zeros_like(tc)
        _dp = self._damage_roll(p_att, diff, k="penc", tile=tc)
        _sp = self._damage_roll(p_att, cdiff, k="pencc", tile=tc)
        _dr = self._damage_roll(r_att, diff, k="renc", tile=tc)
        _sr = self._damage_roll(r_att, cdiff, k="rencc", tile=tc)
        d_enc = torch.where(p_att, _dp, _z) + torch.where(r_att, _dr, _z)
        d_self = torch.where(p_att, _sp, _z) + torch.where(r_att, _sr, _z)
        if atk_kind == "rival":
            self.v_xp[:, u] = torch.where(att, self.v_xp[:, u] + XP_ATTACK, self.v_xp[:, u])
        elif atk_kind == "player":
            self.p_xp[:, u] = torch.where(att, self.p_xp[:, u] + XP_ATTACK, self.p_xp[:, u])
        rows = att.nonzero(as_tuple=True)[0]
        if len(rows) > 0:
            tr = tc[rows]
            self.encamp_hp[rows, tr] = (self.encamp_hp[rows, tr] - d_enc[rows]).clamp(min=0)
        a_hp[:, u] = torch.where(att, a_hp[:, u] - d_self, a_hp[:, u])
        died = att & (a_hp[:, u] <= 0)
        if bool(died.any()):
            dr = died.nonzero(as_tuple=True)[0]
            a_at[dr, a_tile[dr, u]] = -1
            a_alive[:, u] = a_alive[:, u] & ~died

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
        # B-4: attacker veterancy — a rival attacker via v_xp; barbs never accrue.
        atk_lvl5 = torch.zeros_like(a_hp[:, u]) if atk_kind == "barb" else self._xp_lvl_bonus(self.v_xp[:, u])
        atk_e = atk_cs - self._wound(a_hp[:, u]) - 5.0 * self._river_cross(a_tile[:, u], _ct) + atk_lvl5  # B-29 wound + river (city not a unit) + B-4 veterancy
        # #70/S2 (B-8): attackCity's atkCS carries the aura. Only a RIVAL
        # attacker has one (unified civ v_civ+1); a BARBARIAN is civ -1 and
        # structurally 0, so its branch emits no term (the B6-S1 convention).
        # Added once, before both paired rolls (pcty + the pctyc counter).
        if atk_kind == "rival":
            atk_naval = self.unit_naval[self.v_type[:, u].clamp(min=0, max=self.NU - 1)] | self.v_emb[:, u]
            # #71 (DEBT-2): the enhancer ATTACKER adders apply to city assaults too —
            # Crusade/Just War key on where the UNIT stands, not on what it hits.
            # Inserted BEFORE the aura add so term order matches the TS assembly.
            atk_e = atk_e + (self._rel_atk_cs(self.v_civ[:, u], _ct).to(atk_e.dtype) if self._city_rel_live else 0)
            atk_e = atk_e + self._gen_aura_cs(self.v_civ[:, u] + 1, a_tile[:, u], atk_naval).to(atk_e.dtype)
        d_city = self._damage_roll(att, atk_e - def_cs, k="pcty", tile=_ct)
        d_self = self._damage_roll(att, def_cs - atk_e, k="pctyc", tile=_ct)
        # B-4: +5 for the attack executed (city is not a unit — no defender xp).
        if atk_kind == "rival":
            self.v_xp[:, u] = torch.where(att, self.v_xp[:, u] + XP_ATTACK, self.v_xp[:, u])
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

    def _hostile_ranged_strike(self, att: torch.Tensor, tgt: torch.Tensor, atk_kind: str, u: int) -> torch.Tensor:
        """AUDIT A-6 / #70/S5 (B-26): a hostile RANGED unit strikes tile tgt
        (TS hostileRangedStrike) — one roll, no retaliation, no advance.

        POOL-GENERIC, like _hostile_vs_unit: atk_kind 'rival' reads slot u of
        the v_/rv_ pool, 'barb' reads slot u of the u_/barb_ pool (#70/S5's
        ARCHER / CROSSBOWMAN raiders). Hostility follows unitsHostile — a
        RIVAL attacker hits player units and barbs (the A-19/B-33
        ranged-vs-rival scope-out); a BARB attacker hits player AND rival
        units and never another barb.

        A PLAYER city takes the hit first even through a garrison
        (meleeAttack's city precedence) and HOLDS at 1 HP — ranged fire
        never captures; else the units on the tile (military first;
        civilians take the roll too — rangedAttack's convention, not the
        melee roll-free kill / B-31 capture). Any other civ's center tile is
        the melee scan's same no-op quirk: nothing happens, nothing is spent
        — note this means a barb ARCHER never batters an ungarrisoned RIVAL
        city (TS `enemyCity` only ever resolves to a PLAYER city), unlike the
        melee raider's attackRivalCity siege. Barbs carry no religion, no
        general aura and never accrue XP (gainXp guards that).
        Returns the rows that actually struck (the acted set)."""
        ttc = tgt.clamp(min=0)
        barb = atk_kind == "barb"
        if barb:
            ut0 = self.u_type[:, u].clamp(min=0, max=self._u_rng_str.numel() - 1)
            atk_rs = self._u_rng_str[ut0]
            a_hp, a_tile = self.u_hp[:, u], self.u_tile[:, u]
            a_lvl = torch.zeros_like(a_hp)  # B-4: barbarians never accrue XP
            # A barb hull IS naval since B-26, but this flag only selects the
            # general-vs-ADMIRAL aura and a barbarian (civ -1) has no aura at
            # all, so the constant false stays behaviourally exact.
            a_naval = torch.zeros(self.B, dtype=torch.bool, device=self.device)
        else:
            vt0 = self.v_type[:, u].clamp(min=0, max=self.NU - 1)
            atk_rs = self._p_rng_str[vt0]
            a_hp, a_tile = self.v_hp[:, u], self.v_tile[:, u]
            a_lvl = self._xp_lvl_bonus(self.v_xp[:, u])
            a_naval = self.unit_naval[vt0] | self.v_emb[:, u]
        tgt_city = self.center_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
        city_att = att & (tgt_city >= 0)
        if bool(city_att.any()):
            # cityDefenseStrength: max(15, strongest melee ever) + 5 when the
            # player's own military garrisons the center (P4/D-22)
            gm = self.pmil_at.gather(1, self.site.clamp(min=0))
            gar = (gm.gather(1, tgt_city.clamp(min=0).unsqueeze(1)).squeeze(1) >= 0).long()
            def_cs = torch.maximum(self.best_melee, torch.full_like(self.best_melee, 15)) + gar * 5
            atk_e = atk_rs - self._wound(a_hp) + a_lvl  # B-29 (city not a unit) + B-4 veterancy
            if not barb:
                # #70/S2 (B-8): aura inside hostileRangedStrike's ranged-strength
                # parentheses, after xpLevelBonus (the rngcs twin).
                # #71 (DEBT-2): the enhancer ATTACKER adders apply to city assaults too —
                # Crusade/Just War key on where the UNIT stands, not on what it hits.
                # Inserted BEFORE the aura add so term order matches the TS assembly.
                atk_e = atk_e + (self._rel_atk_cs(self.v_civ[:, u], tgt).to(atk_e.dtype) if self._city_rel_live else 0)
                atk_e = atk_e + self._gen_aura_cs(self.v_civ[:, u] + 1, a_tile, a_naval).to(atk_e.dtype)
            d_city = self._damage_roll(city_att, atk_e - def_cs, k="vrngc", tile=tgt)
            rows = city_att.nonzero(as_tuple=True)[0]
            cs_ = tgt_city[rows]
            self.city_hp[rows, cs_] = (self.city_hp[rows, cs_] - d_city[rows]).clamp(min=1)
        # units: the defender is the tile's MILITARY if any, else the lone
        # civilian — stacking blocks foreign units, so at most one owner
        # occupies the tile and the chain below is a priority, not a sum.
        dm = self.pmil_at.gather(1, ttc.unsqueeze(1)).squeeze(1)  # player military
        dc_ = self.pciv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)  # player civilian
        if barb:
            db = torch.full_like(dm, -1)  # a barb is never hostile to a barb
            dv = self.rv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)  # rival military
            dvc = self.rvciv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)  # rival civilian
        else:
            db = self.barb_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
            dv = torch.full_like(dm, -1)  # A-19/B-33: ranged-vs-rival scope-out
            dvc = torch.full_like(dm, -1)
        unit_att = att & (tgt_city < 0) & ((dm >= 0) | (db >= 0) | (dv >= 0) | (dc_ >= 0) | (dvc >= 0))
        if bool(unit_att.any()):
            def_is_b = (dm < 0) & (db >= 0)
            def_is_v = (dm < 0) & (db < 0) & (dv >= 0)
            def_is_c = (dm < 0) & (db < 0) & (dv < 0) & (dc_ >= 0)
            def_is_vc = (dm < 0) & (db < 0) & (dv < 0) & (dc_ < 0) & (dvc >= 0)
            civ_def = def_is_c | def_is_vc  # a lone CIVILIAN defender (either owner)
            d_cs_p = self._p_combat[self.p_type.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)]
            d_cs_b = self._unit_combat[self.u_type.gather(1, db.clamp(min=0).unsqueeze(1)).squeeze(1)]
            d_cs_v = self._p_combat[self.v_type.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)]
            d_cs_c = self._p_combat[self.p_type.gather(1, dc_.clamp(min=0).unsqueeze(1)).squeeze(1)]
            d_cs_vc = self._p_combat[self.v_type.gather(1, dvc.clamp(min=0).unsqueeze(1)).squeeze(1)]
            def_cs = torch.where(
                def_is_b, d_cs_b,
                torch.where(def_is_v, d_cs_v, torch.where(def_is_c, d_cs_c, torch.where(def_is_vc, d_cs_vc, d_cs_p))),
            )
            f_p = self.p_fortify.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)
            f_b = self.u_fortify.gather(1, db.clamp(min=0).unsqueeze(1)).squeeze(1)
            f_v = self.v_fortify.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)
            f_c = self.p_fortify.gather(1, dc_.clamp(min=0).unsqueeze(1)).squeeze(1)  # civilian: never fortifies (0)
            f_vc = self.v_fortify.gather(1, dvc.clamp(min=0).unsqueeze(1)).squeeze(1)  # civilian: never fortifies (0)
            def_fort = torch.where(
                def_is_b, f_b,
                torch.where(def_is_v, f_v, torch.where(def_is_c, f_c, torch.where(def_is_vc, f_vc, f_p))),
            ) * 3  # B-5
            # B-4: only a MILITARY defender carries veterancy (player p_xp /
            # rival v_xp); civilians never fight and barbs have no plane.
            def_xp = torch.where(
                dm >= 0, self._xp_lvl_bonus(self.p_xp.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)),
                torch.where(def_is_v, self._xp_lvl_bonus(self.v_xp.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)), torch.zeros_like(dm)),
            )
            def_cs = def_cs + self._tdef_g(ttc) + def_fort + def_xp  # B-5 + B-4
            # #45/B-6: an embarked defender (player or rival, military or
            # civilian; barbs never embark) → flat CS, no terrain/fortify/support.
            p_emb_m = self.p_emb.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)
            p_emb_c = self.p_emb.gather(1, dc_.clamp(min=0).unsqueeze(1)).squeeze(1)
            v_emb_m = self.v_emb.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)
            v_emb_c = self.v_emb.gather(1, dvc.clamp(min=0).unsqueeze(1)).squeeze(1)
            d_emb = (p_emb_m & (dm >= 0)) | (v_emb_m & def_is_v) | (p_emb_c & def_is_c) | (v_emb_c & def_is_vc)
            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
            # B-29: ranged attacker + defender wounded (no river for ranged).
            d_hp_p = self.p_hp.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)
            d_hp_b = self.u_hp.gather(1, db.clamp(min=0).unsqueeze(1)).squeeze(1)
            d_hp_v = self.v_hp.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1)
            d_hp_c = self.p_hp.gather(1, dc_.clamp(min=0).unsqueeze(1)).squeeze(1)
            d_hp_vc = self.v_hp.gather(1, dvc.clamp(min=0).unsqueeze(1)).squeeze(1)
            def_hp = torch.where(
                def_is_b, d_hp_b,
                torch.where(def_is_v, d_hp_v, torch.where(def_is_c, d_hp_c, torch.where(def_is_vc, d_hp_vc, d_hp_p))),
            )
            atk_e = atk_rs - self._wound(a_hp) + a_lvl  # B-29 + B-4 attacker veterancy
            def_e = def_cs - self._wound(def_hp)
            # B-7 support: the defender's own side's adjacent MILITARY aids it;
            # no flanking (ranged, no retaliation). def_side 0 player / 1 barb /
            # 2 rival, with the rival civ index for the same-civ test.
            _dside = torch.where(
                def_is_b, torch.ones_like(dm),
                torch.where(def_is_v | def_is_vc, torch.full_like(dm, 2), torch.zeros_like(dm)),
            )
            _dciv = torch.where(
                def_is_v, self.v_civ.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1),
                torch.where(def_is_vc, self.v_civ.gather(1, dvc.clamp(min=0).unsqueeze(1)).squeeze(1), torch.full_like(dm, -1)),
            )
            _, _sp = self._flank_support(tgt, _dside, _dciv, torch.full_like(tgt, -1))
            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)  # #45/B-6: embarked → no support
            # B6-S1: enhancer adders. A RIVAL attacker gets the attack terms; a
            # BARB carries no faith (unitEnhancer returns undefined). A RIVAL
            # DEFENDER gets the defense terms (embarked = flat, none) — reachable
            # only from the #70/S5 barb-archer path (a rival ranged attacker
            # never engages rival units).
            if not barb:
                atk_e = atk_e + (self._rel_atk_cs(self.v_civ[:, u], tgt).to(atk_e.dtype))  # B6-S1 unit-vs-unit: NEVER gated (the #71 city flag must not reach here)
            def_e = def_e + torch.where(d_emb, torch.zeros_like(def_e), self._rel_def_cs(_dciv, tgt).to(def_e.dtype))
            # B7-G (B-8): attacker aura on its OWN tile (barb: none); defender
            # aura keyed on tgt — player military (civ 0) or rival military
            # (_dciv+1); a barb or a lone CIVILIAN defender gets none (barbs have
            # no general; civilians return 0 in combat.generalAuraCS).
            if not barb:
                atk_e = atk_e + self._gen_aura_cs(self.v_civ[:, u] + 1, a_tile, a_naval).to(atk_e.dtype)
            def_civ_u = torch.where(
                def_is_b | civ_def, torch.full_like(dm, -1),
                torch.where(def_is_v, _dciv + 1, torch.zeros_like(dm)),
            )
            _p_def_nav = self.unit_naval[self.p_type.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)]
            _v_def_nav = self.unit_naval[self.v_type.gather(1, dv.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)]
            def_naval = d_emb | torch.where(def_is_b, torch.zeros_like(d_emb), torch.where(def_is_v, _v_def_nav, _p_def_nav))
            def_e = def_e + self._gen_aura_cs(def_civ_u, tgt, def_naval).to(def_e.dtype)
            d_def = self._damage_roll(unit_att, atk_e - def_e, k="vrng", tile=tgt)
            rows = unit_att.nonzero(as_tuple=True)[0]
            for grp, at_map, hp_t, alive_t, slot_t in (
                (dm >= 0, self.pmil_at, self.p_hp, self.p_alive, dm),
                (def_is_b, self.barb_at, self.u_hp, self.u_alive, db),
                (def_is_v, self.rv_at, self.v_hp, self.v_alive, dv),
                (def_is_c, self.pciv_at, self.p_hp, self.p_alive, dc_),
                (def_is_vc, self.rvciv_at, self.v_hp, self.v_alive, dvc),
            ):
                g = rows[grp[rows]]
                if len(g) == 0:
                    continue
                ds = slot_t[g]  # paired rows — gather(1, …) would read rows 0..|g|
                hp_t[g, ds] -= d_def[g]
                dead = hp_t[g, ds] <= 0
                at_map[g[dead], ttc[g[dead]]] = -1
                alive_t[g[dead], ds[dead]] = False
            if bool((unit_att & civ_def).any()):
                self._gen_ver += 1  # B7-G (B-8): a struck lone civilian may be a general → invalidate the aura plane
            # B-4: a surviving MILITARY defender earns +2 (player via p_xp, rival
            # via v_xp; barb / civilian defenders never accrue).
            surv_pm = (unit_att & (dm >= 0)).nonzero(as_tuple=True)[0]
            if len(surv_pm) > 0:
                alive_now = self.p_hp[surv_pm, dm[surv_pm]] > 0
                sp = surv_pm[alive_now]
                if len(sp) > 0:
                    self.p_xp[sp, dm[sp]] += XP_DEFEND
            surv_vm = (unit_att & def_is_v).nonzero(as_tuple=True)[0]
            if len(surv_vm) > 0:
                alive_now_v = self.v_hp[surv_vm, dv[surv_vm]] > 0
                sv = surv_vm[alive_now_v]
                if len(sv) > 0:
                    self.v_xp[sv, dv[sv]] += XP_DEFEND
        # B-4: the RIVAL attacker earns +5 for the attack executed (vs city or
        # unit); a barbarian never accrues (gainXp guards); a "quirk" strike
        # that hit neither returns empty and spends nothing.
        if not barb:
            self.v_xp[:, u] = torch.where(city_att | unit_att, self.v_xp[:, u] + XP_ATTACK, self.v_xp[:, u])
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
        attack = act & (target_tile <= T) & ~self.v_emb[:, v]  # #45/B-6: embarked cannot attack
        ttc = target_tile.clamp(max=T - 1)
        if bool((attack & ~rngd).any()):
            self._hostile_vs_unit(attack & ~rngd, ttc, "rival", v)
        acted_pk = attack & ~rngd
        if bool((attack & rngd).any()):
            acted_pk = acted_pk | self._hostile_ranged_strike(attack & rngd, ttc, "rival", v)
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
        aw = self.r_atwar.gather(1, self.v_civ[:, v].clamp(min=0).unsqueeze(1)).squeeze(1)  # B-3 (False at peace)
        # #45/B-6: the peace-act mirror of the war-march embark handling — a
        # NAVAL galley patrols on water; an EMBARKED land unit that survived a
        # war-march into a peace turn comes home coherently (EMBARK_MOVES pool +
        # disembark transition). Water steps are LIVE-gated; a grounded land unit
        # stays land-only, so with the flag off this is byte-identical to pre-N2.
        emb0 = self.v_emb[:, v]
        if self._embark_live:
            full_mp = torch.where(emb0, torch.full_like(self._p_moves[vt0], self._embark_moves), self._p_moves[vt0])
            bidx_p = torch.arange(B, device=dev)
            civ_rp = self.v_civ[:, v].clamp(min=0)
            cart_p = (self.r_techs[bidx_p, civ_rp, self._cartography_tech] if self._cartography_tech >= 0 else torch.zeros(B, dtype=torch.bool, device=dev))
            is_naval_p = self.unit_naval[vt0]
        else:
            full_mp = self._p_moves[vt0]
        full_mp = full_mp + self.v_aura_mp[:, v]  # #70/S3 (B-8), the war-march mirror (after the embark selection)
        mp = full_mp.clone()
        cur = here.clone()
        emb = emb0.clone()
        moving = patrol & (hkey.min(dim=1).values < 10**9)
        while bool(moving.any()):
            curc = cur.clamp(min=0)
            d_home = self.pair_dist[curc, home].to(torch.long)
            roam = moving & (d_home > 3)
            if not bool(roam.any()):
                break
            nbp = self.neigh[curc][:, PATROL_DIR_PERM]
            nbpc = nbp.clamp(min=0)
            if self._embark_live:
                land_ok = self.passable.gather(1, nbpc)
                water_gate = self.wpass.gather(1, nbpc) & (~self.ocean_tile.gather(1, nbpc) | cart_p.unsqueeze(1))
                # naval → water; embarked land unit → land (disembark) or water;
                # grounded land unit → land only (no embark at peace).
                terr = torch.where(is_naval_p.unsqueeze(1), water_gate, torch.where(emb.unsqueeze(1), land_ok | water_gate, land_ok))
            else:
                terr = self.passable.gather(1, nbpc)
            free = (
                (nbp >= 0)
                & terr
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
            _terr, _riv = self._road_terms(  # B-23 (#71): roads
                curc, dest, 3 * ((self.river_mask.gather(1, curc.unsqueeze(1)).squeeze(1) >> true_dir) & 1)
            )
            land_cost = 1 + _terr + _riv
            if self._embark_live:
                to_water = self.wpass.gather(1, dest.clamp(min=0).unsqueeze(1)).squeeze(1)
                transition = (emb != to_water) & ~is_naval_p
                cost = torch.where(transition, mp, torch.where(to_water, torch.ones_like(land_cost), land_cost))
            else:
                cost = land_cost
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
            if self._embark_live:
                emb = torch.where(mv, to_water & ~is_naval_p, emb)  # embarked ⟺ on a water tile
            # B-3 ZOC: a patrol step adjacent to a hostile military unit halts
            # (at peace only barbarians exert it — aw is False here).
            mp = torch.where(mv & self._in_enemy_zoc(dest, aw, self.v_civ[:, v]), torch.zeros_like(mp), mp)
            cur = torch.where(mv, dest, cur)
            moving = mv & (mp > 0)
        if self._embark_live:
            self.v_emb[:, v] = emb  # persist embark state across turns

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

    def _rival_quest_phase(self, r: int, active: torch.Tensor) -> None:
        """AUDIT A-12 (B8-L): RIVAL city-state quests — the ZERO-DRAW twin of
        the cityStatePhase quest loop (issueRivalQuest/rivalQuestSatisfied),
        called right after _rival_cs_phase (the A-12a accrual position). Each
        MET CS keeps ONE quest per rival (cs_r_quest[:, r]); a satisfied one
        resolves here (+questEnvoys to this rival's cs_r_envoys — a
        yield-bearing write, so _eff_version bumps), else a new one issues on
        cooldown expiry. The kind is DETERMINISTIC (no RNG, unlike the player's
        2-draw path): the FIRST SATISFIABLE option in the fixed order
        [clearCamp (nearest camp ≤6, ties lowest tile idx), buildDistrict (the
        CS type's district, from _cs_didx), sendTradeRoute]."""
        if self.S == 0:
            return
        B, S, dev = self.B, self.S, self.device
        rr = self.rules.cs
        cooldown = int(rr.get("questCooldown", 12))
        q_env = int(rr.get("questEnvoys", 1))
        csc = self.cs_center[:, :S].clamp(min=0)  # [B, S]
        met_live = self.cs_r_met[:, r, :S] & self.cs_alive[:, :S]
        act = active.unsqueeze(1) & met_live  # [B, S]
        if not bool(act.any()):
            return
        # --- rival state used by BOTH resolve and issue (loop-invariant) -----
        # buildDistrict target = the CS type's district (_cs_didx), owned
        # COMPLETE by any of THIS rival's cities (rivalQuestSatisfied's
        # buildDistrict / issueRivalQuest's `alreadyBuilt`).
        dt = self.rc_dist_tile[:, r]  # [B, RC, nD]
        nD = dt.shape[2]
        di = self._cs_didx[:, :S].clamp(min=0, max=nD - 1)  # [B, S]
        own_tile = dt.unsqueeze(1).expand(B, S, self.RC, nD).gather(
            3, di.view(B, S, 1, 1).expand(B, S, self.RC, 1)
        ).squeeze(3)  # [B, S, RC] tile of the CS-type district per rival city
        own_dc = self.district_complete.gather(1, own_tile.clamp(min=0).reshape(B, -1)).reshape(B, S, self.RC)
        owns_dist = ((own_tile >= 0) & own_dc).any(dim=2)  # [B, S]
        # sendTradeRoute: this rival routes to CS s (r_routes dest == -(2+s)).
        route_dest = self.r_routes[:, r, :, 1]  # [B, K_routes]
        s_ar = torch.arange(S, device=dev)
        has_route = (route_dest.unsqueeze(1) == (-(2 + s_ar)).view(1, S, 1)).any(dim=2)  # [B, S]
        # clearCamp: the NEAREST camp within range 6, ties to the lowest tile
        # index (key = dist·(T+1)+tile, the TS issueRivalQuest key).
        cdist = self.pair_dist[csc.unsqueeze(2), self.camp_tile.clamp(min=0).unsqueeze(1)].to(torch.long)  # [B, S, K]
        near_c = (self.camp_tile >= 0).unsqueeze(1) & (cdist <= 6)  # [B, S, K]
        span = self.T + 1
        key_c = torch.where(near_c, cdist * span + self.camp_tile.clamp(min=0).unsqueeze(1), torch.full_like(cdist, 10**18))
        best_k = key_c.argmin(dim=2)  # [B, S]
        has_camp = near_c.any(dim=2)  # [B, S]
        camp_nearest = torch.where(has_camp, self.camp_tile.gather(1, best_k), torch.full((B, S), -1, dtype=torch.long, device=dev))

        # --- RESOLVE existing quests (rivalQuestSatisfied) -------------------
        cur = self.cs_r_quest[:, r, :S]  # [B, S]
        camp_gone = ~(
            (self.camp_tile.unsqueeze(1) == self.cs_r_quest_camp[:, r, :S].unsqueeze(2)) & (self.camp_tile >= 0).unsqueeze(1)
        ).any(dim=2)  # [B, S]
        res_camp = act & (cur == 1) & camp_gone
        res_trade = act & (cur == 2) & has_route
        res_dist = act & (cur == 3) & owns_dist
        resolved = res_camp | res_trade | res_dist
        if bool(resolved.any()):
            self.cs_r_quest[:, r, :S] = torch.where(resolved, torch.zeros_like(cur), cur)
            self.cs_r_quest_issued[:, r, :S] = torch.where(resolved, torch.full_like(cur, self.turn), self.cs_r_quest_issued[:, r, :S])
            self.cs_r_envoys[:, r, :S] = self.cs_r_envoys[:, r, :S] + resolved.long() * q_env
            self._eff_version += 1  # envoy bonuses feed this rival's city yields this phase

        # --- ISSUE on cooldown (deterministic first-satisfiable) ------------
        cur2 = self.cs_r_quest[:, r, :S]  # resolved ones now 0
        due = act & (cur2 == 0) & (self.turn - self.cs_r_quest_issued[:, r, :S] >= cooldown)  # [B, S]
        if bool(due.any()):
            want_camp = due & has_camp
            want_dist = due & ~has_camp & ~owns_dist
            want_trade = due & ~has_camp & owns_dist & ~has_route
            new_kind = want_camp.long() * 1 + want_dist.long() * 3 + want_trade.long() * 2  # 0 = nothing applies
            issued = new_kind > 0
            self.cs_r_quest[:, r, :S] = torch.where(issued, new_kind, cur2)
            self.cs_r_quest_issued[:, r, :S] = torch.where(issued, torch.full_like(cur2, self.turn), self.cs_r_quest_issued[:, r, :S])
            self.cs_r_quest_camp[:, r, :S] = torch.where(want_camp, camp_nearest, self.cs_r_quest_camp[:, r, :S])

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
            self._expire_rival_routes(r)  # B-23: expiry is unconditional
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
            self._expire_rival_routes(r)  # B-23: expiry runs even at capacity
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
        K = self.r_routes.shape[2]
        exp_val = int(self.turn) + self._trade_duration

        def _free_slot(rws: torch.Tensor) -> torch.Tensor:
            free = self.r_routes[rws, r, :, 0] < 0  # [n, K]
            s = torch.where(free, torch.arange(K, device=dev).view(1, -1), torch.full((1, K), K, device=dev)).min(dim=1).values
            assert int(s.max()) < K, "r_routes columns exhausted — raise K above the capacity bound"
            return s

        do = want & (kmax >= 0)
        if bool(do.any()):
            rows = do.nonzero(as_tuple=True)[0]
            i_pick = (first[rows] // W2)
            jj_pick = (first[rows] % W2)
            from_id = ids[rows, i_pick]
            to_id = torch.where(jj_pick < RC, ids[rows, jj_pick.clamp(max=RC - 1)], -(2 + (jj_pick - RC)))
            slot = _free_slot(rows)
            self.r_routes[rows, r, slot, 0] = from_id
            self.r_routes[rows, r, slot, 1] = to_id
            self.r_route_dest[rows, r, slot] = -1  # domestic/CS
            self.r_route_exp[rows, r, slot] = exp_val
            # B-23 (#71): the route's Trader lays road along its land path.
            # i_pick / jj_pick ARE the slot indices the ids arrays are keyed by,
            # so the centres come straight off them (CS destinations sit past RC).
            _o = self.rc_center[rows, r, i_pick]
            _d = torch.where(
                jj_pick < RC,
                self.rc_center[rows, r, jj_pick.clamp(max=RC - 1)],
                self.cs_center[rows, (jj_pick - RC).clamp(min=0, max=max(self.S - 1, 0))],
            )
            self._lay_trade_road(rows, _o, _d)

        # B-23 international: rows that WANT a route but found no domestic/CS
        # candidate consider a player city — NEAREST-city preference (min hex
        # distance; ties keep from-asc, player-city-asc order). Rivals always
        # know the player (no fog); rival→rival routes stay descoped.
        intl_want = want & (kmax < 0)
        C = self.C
        if bool(intl_want.any()) and C > 0:
            psite = self.site.clamp(min=0)  # [B, C] player city center tiles
            palive = self.alive  # [B, C]
            centers = self.rc_center[:, r].clamp(min=0)  # [B, RC]
            d_ip = self.pair_dist[centers.unsqueeze(2), psite.unsqueeze(1)]  # [B, RC, C]
            rr2 = self.r_routes[:, r]  # [B, K, 2]
            rd = self.r_route_dest[:, r]  # [B, K]
            act2 = rr2[:, :, 0] >= 0  # [B, K]
            # already-connected: an ACTIVE intl route from rc i to player tile c
            exists_ip = (
                (rr2[:, :, 0].view(B, 1, 1, -1) == ids.view(B, RC, 1, 1))
                & (rd.view(B, 1, 1, -1) == psite.view(B, 1, C, 1))
                & act2.view(B, 1, 1, -1)
            ).any(dim=3)  # [B, RC, C] (rd is -1 for domestic/CS → never == psite>=0)
            valid_ip = (
                alive.unsqueeze(2)
                & palive.unsqueeze(1)
                & (d_ip <= self._trade_range)
                & ~exists_ip
                & intl_want.view(B, 1, 1)
            )
            BIG = 1 << 30
            dkey = torch.where(valid_ip, d_ip.long(), torch.full((B, RC, C), BIG, dtype=torch.long, device=dev))
            df = dkey.reshape(B, RC * C)  # i-major = from-asc, player-city-asc
            dmin, _ = df.min(dim=1)
            firsti = torch.where(df == dmin.unsqueeze(1), torch.arange(RC * C, device=dev).view(1, -1), torch.full((1, RC * C), RC * C, device=dev)).min(dim=1).values
            doi = intl_want & (dmin < BIG)
            if bool(doi.any()):
                rows = doi.nonzero(as_tuple=True)[0]
                i_pick = (firsti[rows] // C)
                c_pick = (firsti[rows] % C)
                from_id = ids[rows, i_pick]
                dest_tile = psite[rows, c_pick]
                slot = _free_slot(rows)
                self.r_routes[rows, r, slot, 0] = from_id
                self.r_routes[rows, r, slot, 1] = -1  # intl: dest carried in r_route_dest
                self.r_route_dest[rows, r, slot] = dest_tile
                self.r_route_exp[rows, r, slot] = exp_val
                # B-23 (#71): the international route lays road too (dest_tile
                # is already the destination player city's CENTRE tile).
                self._lay_trade_road(rows, self.rc_center[rows, r, i_pick], dest_tile)

        # B-23 duration: after the pick, expire due routes (freed capacity
        # re-picks NEXT turn). ALWAYS runs — TS applies the expiry filter
        # OUTSIDE the capacity-gated pick block, so an at-capacity civ still
        # sheds its expiring route (the early returns above call this too).
        self._expire_rival_routes(r)

    def _expire_rival_routes(self, r: int) -> None:
        """B-23: drop civ r's routes whose expiresTurn has arrived, plus any
        international route whose player destination is no longer a live player
        city center (the TS rival.tradeRoutes filter twin). Consumers gate on
        active (r_routes[..., 0] >= 0), so this is idempotent per turn."""
        act3 = self.r_routes[:, r, :, 0] >= 0
        expired = act3 & (self.r_route_exp[:, r] >= 0) & (self.r_route_exp[:, r] <= int(self.turn))
        rd3 = self.r_route_dest[:, r]
        dest_gone = act3 & (rd3 >= 0) & (self.center_at.gather(1, rd3.clamp(min=0)) < 0)
        drop = expired | dest_gone  # [B, K]
        if bool(drop.any()):
            self.r_routes[:, r][drop] = -1
            self.r_route_dest[:, r][drop] = -1
            self.r_route_exp[:, r][drop] = -1

    def _rr_strengths(self) -> torch.Tensor:
        """[B, R] rivalStrength = js_round(nCities*8 + Σ own-unit combat) for
        every rival (civilians carry combat 0). The DoW/peace twin of the TS
        rivalStrength; computed pre-phase (before this turn's spawns/combat)."""
        B, dev = self.B, self.device
        n_c = self.rc_alive.sum(dim=2)  # [B, R]
        rstr = torch.zeros(B, self.R, dtype=torch.float64, device=dev)
        vt = self.v_type.clamp(min=0, max=self.NU - 1)
        for r in range(self.R):
            combat = ((self.v_alive & (self.v_civ == r)).long() * self._p_combat[vt]).sum(dim=1)
            rstr[:, r] = js_round(n_c[:, r].double() * 8 + combat.double())
        return rstr

    def _rr_proximity(self, a: int, b: int) -> torch.Tensor:
        """[B] closest city-pair distance between rivals a and b (999 if either
        cityless) — the rivalRivalProximity twin."""
        B = self.B
        d_ab = self.pair_dist[
            self.rc_center[:, a].clamp(min=0).unsqueeze(2), self.rc_center[:, b].clamp(min=0).unsqueeze(1)
        ].to(torch.long)  # [B, RC, RC]
        pair_ok = self.rc_alive[:, a].unsqueeze(2) & self.rc_alive[:, b].unsqueeze(1)
        return torch.where(pair_ok, d_ab, 999).reshape(B, -1).min(dim=1).values

    def _rival_rival_denounce(self) -> None:
        """B-22 (S3): pairwise rival↔rival DENOUNCEMENT — ZERO-DRAW. Phase-top,
        BEFORE the DoW pass. Mirror of rivalRivalDenounce: a civ denounces a
        nearer, weaker-scoring rival it is not yet at war with — the DoW family
        of gates (proximity + a strength edge) but the WEAKER bar (`si > sj`, no
        ×ratio) so the stamp reliably PRECEDES the war. rr_denounced is a
        persistent directed grudge (set once, never reset). No draws."""
        if self.R < 2:
            return
        rr = self.rules.rivals
        n_c = self.rc_alive.sum(dim=2)  # [B, R]
        alive_civ = self.r_alive[:, : self.R] & (n_c > 0)  # [B, R]
        rstr = self._rr_strengths()
        prox_max = int(rr.get("rrDowProximity", 9))
        for a in range(self.R):
            if not bool(alive_civ[:, a].any()):
                continue
            for b in range(self.R):
                if a == b:
                    continue
                prox = self._rr_proximity(a, b)
                denounce = (
                    alive_civ[:, a]
                    & alive_civ[:, b]
                    & (self.rr_denounced[:, a, b] < 0)
                    & ~self.rr_war[:, a, b]
                    & (prox <= prox_max)
                    & (rstr[:, a] > rstr[:, b])
                )
                if bool(denounce.any()):
                    self.rr_denounced[:, a, b] = torch.where(
                        denounce, torch.full_like(self.rr_denounced[:, a, b], int(self.turn)), self.rr_denounced[:, a, b]
                    )
                    # B-22: a denouncement BREAKS the alliance, both sides.
                    self.rr_allied[:, a, b] = self.rr_allied[:, a, b] & ~denounce
                    self.rr_allied[:, b, a] = self.rr_allied[:, b, a] & ~denounce
        # B-22 (2026-07-27): ALLIANCE FORMATION — the TS twin, right after the
        # denounce pass so a fresh grudge cannot be allied over the same turn.
        # A pair allies once at PEACE for rrAllyMinPeace turns with NO
        # denouncement either way. Written symmetrically and only from the
        # LOWER id, so scan order cannot matter. Zero-draw.
        if int(self.turn) >= self._rr_ally_min_peace:
            for a in range(self.R):
                for b in range(a + 1, self.R):
                    form = (
                        alive_civ[:, a]
                        & alive_civ[:, b]
                        & ~self.rr_war[:, a, b]
                        & ~self.rr_allied[:, a, b]
                        & (self.rr_denounced[:, a, b] < 0)
                        & (self.rr_denounced[:, b, a] < 0)
                        & (self.r_warmonger[:, a] <= 0)  # B-22: grievances block
                        & (self.r_warmonger[:, b] <= 0)
                    )
                    if bool(form.any()):
                        self.rr_allied[:, a, b] = self.rr_allied[:, a, b] | form
                        self.rr_allied[:, b, a] = self.rr_allied[:, b, a] | form

    def _rival_rival_declare_wars(self) -> None:
        """A-19/B-33 (S2): pairwise rival↔rival auto-DoW — ZERO-DRAW. Phase-top
        mirror of rivalRivalDeclareWars: aggressor id asc, first eligible target
        id asc, one new war per civ per turn (both sides). Deterministic gates
        (proximity, strength ratio); the aggressor's war-weariness is the
        anti-thrash. No draws — the player pair's RNG is untouched. B-22 (S3):
        stamps the war's kind (FORMAL if denounced ≥ rrFormalMinTurns earlier)."""
        if self.R < 2:
            return
        B, dev, rr = self.B, self.device, self.rules.rivals
        n_c = self.rc_alive.sum(dim=2)  # [B, R]
        alive_civ = self.r_alive[:, : self.R] & (n_c > 0)  # [B, R]
        rstr = self._rr_strengths()
        ww = self.r_war_weariness[:, : self.R]
        prox_max = int(rr.get("rrDowProximity", 9))
        ratio = float(rr.get("rrDowStrengthRatio", 1.3))
        ww_max = int(rr.get("rrDowWwMax", 6))
        formal_min = int(rr.get("rrFormalMinTurns", 5))
        peace_ww = int(rr.get("rrPeaceWw", 10))
        used = torch.zeros(B, self.R, dtype=torch.bool, device=dev)
        for a in range(self.R):
            aggr_ok = alive_civ[:, a] & (ww[:, a] < ww_max) & ~used[:, a]
            if not bool(aggr_ok.any()):
                continue
            for b in range(self.R):
                if a == b:
                    continue
                prox = self._rr_proximity(a, b)
                declare = (
                    aggr_ok
                    & alive_civ[:, b]
                    & ~used[:, b]
                    & ~self.rr_war[:, a, b]
                    & (prox <= prox_max)
                    # B-22: a WARMONGER invites unprovoked war — past the gang
                    # threshold the strength advantage is not required.
                    & ((rstr[:, a] > rstr[:, b] * ratio) | (self.r_warmonger[:, b] >= self._wm_gang))
                    # B-22 (S3) anti-thrash: skip a target already past the peace
                    # threshold — it would sue out the SAME turn (mirror of the
                    # TS `rj.warWeariness > RR_PEACE_WW` guard).
                    & (ww[:, b] <= peace_ww)
                    & ~self.rr_allied[:, a, b]  # B-22: allies never declare
                )
                if bool(declare.any()):
                    self.rr_war[:, a, b] = self.rr_war[:, a, b] | declare
                    # B-22: declaring earns GRIEVANCES.
                    self.r_warmonger[:, a] = self.r_warmonger[:, a] + declare.long() * self._wm_dow
                    self.rr_war[:, b, a] = self.rr_war[:, b, a] | declare
                    # B-22 (S3): FORMAL iff a denounced b ≥ formal_min turns ago.
                    dt = self.rr_denounced[:, a, b]
                    formal = declare & (dt >= 0) & ((int(self.turn) - dt) >= formal_min)
                    self.rr_warkind[:, a, b] = torch.where(declare, formal, self.rr_warkind[:, a, b])
                    self.rr_warkind[:, b, a] = torch.where(declare, formal, self.rr_warkind[:, b, a])
                    used[:, a] = used[:, a] | declare
                    used[:, b] = used[:, b] | declare
                    aggr_ok = aggr_ok & ~declare  # one new war per aggressor per turn

    def _rival_rival_make_peace(self) -> None:
        """A-19/B-33 (S2): pairwise rival↔rival auto-peace — ZERO-DRAW. Phase-
        tail mirror of rivalRivalMakePeace: an unordered pair (a<b) sues out
        once EITHER side's war-weariness exceeds rrPeaceWw."""
        if self.R < 2:
            return
        rr = self.rules.rivals
        peace_ww = int(rr.get("rrPeaceWw", 10))
        ww = self.r_war_weariness[:, : self.R]
        for a in range(self.R):
            for b in range(a + 1, self.R):
                peace = self.rr_war[:, a, b] & ((ww[:, a] > peace_ww) | (ww[:, b] > peace_ww))
                if bool(peace.any()):
                    self.rr_war[:, a, b] = self.rr_war[:, a, b] & ~peace
                    self.rr_war[:, b, a] = self.rr_war[:, b, a] & ~peace
                    # B-22 (S3): the ended war's kind flag clears (grudge stamp stays).
                    self.rr_warkind[:, a, b] = self.rr_warkind[:, a, b] & ~peace
                    self.rr_warkind[:, b, a] = self.rr_warkind[:, b, a] & ~peace

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
        # #70/S3 (B-8): freeze the rival aura MP HERE — this is the TS
        # rivalPhase movesLeft reset position, and it lands before any general
        # war-walks, so both engines read the same pre-move general positions.
        self._refresh_aura_mp_rival()
        # A-19/B-33 (S2): pairwise rival↔rival auto-DoW BEFORE the per-rival
        # loop, so a declared war is live for both civs' war-acts this turn.
        # B-22 (S3): denouncements first (a ≥ rrFormalMinTurns-old stamp makes
        # the ensuing DoW FORMAL — halved war-weariness accrual).
        self._rival_rival_denounce()
        self._rival_rival_declare_wars()
        for r in range(self.R):
            n_cities = self.rc_alive[:, r].sum(dim=1)
            active = self.r_alive[:, r] & (n_cities > 0)
            if not bool(active.any()):
                continue
            # B-15: this rival's war weariness — accrue while at war, decay in
            # peace (war state as of last turn; declare/peace run later in this
            # phase). Symmetric with the player + the TS rival block top.
            rww = self.rules.war_weariness
            # A-19/B-33 (S2): a rival at war with ANYONE (player or another
            # rival) accrues weariness; decays only at FULL peace. rr_war is
            # fixed for this turn by the phase-top DoW pass.
            atw_r = self.r_atwar[:, r] | self.rr_war[:, r, : self.R].any(dim=1)
            # B-22 (S3): casus-belli accrual multiplier — rival↔rival ONLY. A
            # SURPRISE rival↔rival war (rr_war & ~rr_warkind) → ×surpriseMult;
            # otherwise (only a player war, or all-FORMAL) → ×formalMult (the S2
            # baseline). The player-war axis stays unchanged (mirror of TS).
            rr_surprise = self.rr_war[:, r, : self.R] & ~self.rr_warkind[:, r, : self.R]
            surprise_r = rr_surprise.any(dim=1)
            per = int(rww.get("perTurn", 1))
            mult_r = torch.where(surprise_r, per * int(rww.get("surpriseMult", 2)), per * int(rww.get("formalMult", 1)))
            inc_r = (self.r_war_weariness[:, r] + mult_r).clamp(max=int(rww.get("cap", 24)))
            dec_r = (self.r_war_weariness[:, r] - int(rww.get("decay", 4))).clamp(min=0)
            self.r_war_weariness[:, r] = torch.where(active, torch.where(atw_r, inc_r, dec_r), self.r_war_weariness[:, r])
            # AUDIT A-3: eurekas/inspirations from this rival's seat — the
            # TS twin runs at the same point (the rival's block top).
            self._detect_rival_boosts(r, active)
            # AUDIT A-12: the CS-diplomacy block sits right after boost
            # detection — the exact rivalPhase position.
            self._rival_cs_phase(r, active)
            # AUDIT A-12 (B8-L): rival CS quests resolve/issue right after the
            # envoy accrual (the TS rivalPhase quest block sits at the tail of
            # the same CS block) — a completed quest's envoy is visible to the
            # levy suzerain test later this phase.
            self._rival_quest_phase(r, active)
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
            # AUDIT B-10: best-of-roster type pick — data-driven over the unit
            # tables (no hardcoded warrior/spearman/horseman ladder). This
            # rival's per-unit strategic access (res_ok_r, reused by the A-5r
            # buy block) and trainable mask (requiresTech satisfied over the
            # FULL tech tree r_techs, via _p_tech; -1 = ungated) gate both lanes.
            res_ok_r = self._res_avail_mask(self.rival_at == r)  # [B, NU]
            tr_u_r = (
                (self._p_tech.unsqueeze(0) < 0)
                | self.r_techs[:, r].gather(1, self._p_tech.clamp(min=0).unsqueeze(0).expand(B, -1))
            ) & res_ok_r  # [B, NU]
            rng_type = self._p_rng_str > 0  # [NU]
            arNU = torch.arange(self.NU, device=dev)
            fill = torch.full((B, self.NU), -(10**9), dtype=torch.long, device=dev)
            # melee lane: highest combat among non-ranged non-naval military;
            # ranged lane: highest ranged strength among ranged non-naval units.
            # key = strength·NU − idx ⇒ argmax ties to the LOWEST unit index =
            # the TS strict-`>` first-wins over UNITS-table order. WARRIOR /
            # SLINGER are ungated so each lane always has a candidate; SCOUT
            # (combat 10) is dominated by WARRIOR (20); BUILDER is combat 0.
            melee_ok = tr_u_r & (self._p_combat.unsqueeze(0) > 0) & ~rng_type.unsqueeze(0) & ~self.unit_naval.unsqueeze(0)
            key_m = torch.where(melee_ok, (self._p_combat.long() * self.NU - arNU).unsqueeze(0).expand(B, -1), fill)
            ty = key_m.argmax(dim=1)  # [B]
            rng_ok = tr_u_r & rng_type.unsqueeze(0) & ~self.unit_naval.unsqueeze(0)
            key_r = torch.where(rng_ok, (self._p_rng_str.long() * self.NU - arNU).unsqueeze(0).expand(B, -1), fill)
            ty_rng = key_r.argmax(dim=1)  # [B]
            has_rng_type = rng_ok.any(dim=1)
            # AUDIT A-6: army composition — military only (builders excluded
            # via combat 0), live + queued, updated through the pick loop
            # exactly like TS's meleeCount/rangedCount; train ranged while
            # the army holds fewer than 1 ranged per 2 melee.
            vt_all = self.v_type.clamp(min=0, max=self.NU - 1)
            mil_live = self.v_alive & (self.v_civ == r) & (self._p_combat[vt_all] > 0)
            n_ranged = (mil_live & rng_type[vt_all]).sum(dim=1)
            n_melee = (mil_live & ~rng_type[vt_all]).sum(dim=1)
            qcur = self.rc_current[:, r]
            q_ty = (qcur - 1).clamp(min=0, max=self.NU - 1)
            q_mil = (qcur >= 1) & (qcur <= self.NU) & (self._p_combat[q_ty] > 0)
            n_ranged = n_ranged + (q_mil & rng_type[q_ty]).sum(dim=1)
            n_melee = n_melee + (q_mil & ~rng_type[q_ty]).sum(dim=1)
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
                ok_bA = unl_b.unsqueeze(1) & ~have_bA & (~rdv3.b_river.view(1, 1, -1) | riv_cA.unsqueeze(2)) & ~self._b_worship.view(1, 1, -1)  # B9-R3: worship is faith-only
                reqd_b = rdv3.b_req_district  # [NB]
                reg_tA = self.rc_dist_tile[:, r].gather(2, reqd_b.clamp(min=0).view(1, 1, -1).expand(B, self.RC, -1))
                dcompA = (reg_tA >= 0) & self.district_complete.gather(1, reg_tA.clamp(min=0).reshape(B, -1)).reshape_as(reg_tA)
                ok_bA &= torch.where(reqd_b.view(1, 1, -1) >= 0, dcompA, torch.ones_like(dcompA))
                for bi2, reqs in enumerate(self.rules.b_req_buildings):
                    if reqs:
                        ok_bA[:, :, bi2] &= have_bA[:, :, torch.tensor(reqs, device=dev, dtype=torch.long)].any(dim=2)
                for bi2, excl in enumerate(self.rules.b_excl_buildings):  # B9-R1: exclusiveWith
                    if excl:
                        ok_bA[:, :, bi2] &= ~have_bA[:, :, torch.tensor(excl, device=dev, dtype=torch.long)].any(dim=2)
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
                    for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
                        if not rem_any:
                            break
                        has_tech = self.r_techs[:, r, utech] if utech >= 0 else (self.r_civics[:, r, uciv] if uciv >= 0 else torch.ones(B, dtype=torch.bool, device=dev))  # B9-R1: kind-aware
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
                        & (self.rc_tile_id == self.rc_id[:, r, j].unsqueeze(1))  # A-24: THIS capital's registry (mirrors canPlaceWonder tile.cityId === city.id)
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
                # B-27 (#79): one MILITARY ENGINEER per civ at a time, only
                # while a BORDER fort job exists — the rivalHasEngineer +
                # rivalHasFortJob twin. Sits AFTER the builder arm so economy
                # work outranks it, exactly like the TS else-if order. Flat
                # roster cost (no escalator: that curve is the BUILDER's).
                if self._rival_eng_live and self._eng_idx >= 0 and rem_any:
                    has_alive_e = (self.v_alive & (self.v_civ == r) & (self.v_type == self._eng_idx)).any(dim=1)
                    has_q_e = ((self.rc_current[:, r] == self._eng_idx + 1) & self.rc_alive[:, r]).any(dim=1)
                    want_me = rem & ~(has_alive_e | has_q_e) & self._rival_fort_job_mask(r).any(dim=1) & (unit_count < cap)
                    if bool(want_me.any()):

                        self.rc_current[:, r, j] = torch.where(want_me, torch.full_like(self.rc_current[:, r, j], self._eng_idx + 1), self.rc_current[:, r, j])
                        self.rc_cost[:, r, j] = torch.where(want_me, self._p_cost[self._eng_idx].double(), self.rc_cost[:, r, j])
                        self.rc_progress[:, r, j] = torch.where(want_me, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
                        unit_count = unit_count + want_me.long()
                        rem = rem & ~want_me
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
                # #45/B-6 SCRIPTED GALLEY POLICY (the TS rivals.ts mirror): a civ
                # with SAILING and a naval-capable city (center adjacent to water
                # OR a completed Harbor) builds exactly ONE GALLEY when it owns
                # zero naval units — priority JUST BELOW the military floor (only
                # on a want_u miss, i.e. army at cap), ABOVE projects. has_naval
                # reads live + queued across all this civ's cities, so a galley
                # queued in an earlier city j blocks a second one same turn.
                if self._galley_idx >= 0 and self._sailing_tech >= 0:
                    has_sail_g = self.r_techs[:, r, self._sailing_tech]
                    ctr_jg = self.rc_center[:, r, j].clamp(min=0)  # [B]
                    nb_jg = self.neigh[ctr_jg]  # [B, 6]
                    coastal_jg = ((nb_jg >= 0) & self.wpass.gather(1, nb_jg.clamp(min=0))).any(dim=1)
                    if self._harbor_idx >= 0:
                        hb_jg = self.rc_dist_tile[:, r, j, self._harbor_idx]
                        harbor_jg = (hb_jg >= 0) & self.district_complete.gather(1, hb_jg.clamp(min=0).unsqueeze(1)).squeeze(1)
                    else:
                        harbor_jg = torch.zeros(B, dtype=torch.bool, device=dev)
                    naval_cap_jg = coastal_jg | harbor_jg
                    naval_live_g = (self.v_alive & (self.v_civ == r) & self.unit_naval[vt_all]).any(dim=1)
                    qcur_g = self.rc_current[:, r]  # [B, RC]
                    q_nav_g = (qcur_g >= 1) & (qcur_g <= self.NU) & self.rc_alive[:, r] & self.unit_naval[(qcur_g - 1).clamp(min=0, max=self.NU - 1)]
                    has_naval_g = naval_live_g | q_nav_g.any(dim=1)
                    want_g = rem & ~want_u & has_sail_g & naval_cap_jg & ~has_naval_g
                    if bool(want_g.any()):
                        self.rc_current[:, r, j] = torch.where(want_g, torch.full_like(self.rc_current[:, r, j], self._galley_idx + 1), self.rc_current[:, r, j])
                        self.rc_cost[:, r, j] = torch.where(want_g, self._p_cost[self._galley_idx].double(), self.rc_cost[:, r, j])
                        self.rc_progress[:, r, j] = torch.where(want_g, torch.zeros_like(self.rc_progress[:, r, j]), self.rc_progress[:, r, j])
                        unit_count = unit_count + want_g.long()
                        rem = rem & ~want_g
                        rem_any = bool(rem.any())
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
                    ok6 = unl6 & ~have6 & (~rdv6.b_river.view(1, -1) | riv6.unsqueeze(1)) & ~self._b_worship.view(1, -1)  # B9-R3: worship is faith-only
                    reg6 = self.rc_dist_tile[:, r, j6].gather(1, rdv6.b_req_district.clamp(min=0).unsqueeze(0).expand(B, -1))
                    dc6 = (reg6 >= 0) & self.district_complete.gather(1, reg6.clamp(min=0))
                    ok6 = ok6 & torch.where(rdv6.b_req_district.unsqueeze(0) >= 0, dc6, ones6)
                    for bi6, reqs6 in enumerate(self.rules.b_req_buildings):
                        if reqs6:
                            ok6[:, bi6] &= have6[:, torch.tensor(reqs6, device=dev, dtype=torch.long)].any(dim=1)
                    for bi6, excl6 in enumerate(self.rules.b_excl_buildings):  # B9-R1: exclusiveWith
                        if excl6:
                            ok6[:, bi6] &= ~have6[:, torch.tensor(excl6, device=dev, dtype=torch.long)].any(dim=1)
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
                        self._eff_version += 1  # B9-R2: a bought regional building reaches other cities this phase
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
                # AUDIT B-10: candidate = every non-naval military unit the rival
                # has the tech + strategic access for (the extended RIVAL_BUY_UNITS
                # roster, data-driven off tr_u_r — WARRIOR/SLINGER ungated, the
                # rest on requiresTech; res_ok_r folded into tr_u_r). BUILDER is
                # combat 0; SCOUT (combat 10) is dominated by WARRIOR in the
                # combat argmax — exactly the RIVAL_BUY_UNITS set (SCOUT masked
                # out: affordability can otherwise leave it the only candidate).
                mil5 = tr_u_r & (self._p_combat.unsqueeze(0) > 0) & ~self.unit_naval.unsqueeze(0)
                if self._scout_idx >= 0:
                    mil5[:, self._scout_idx] = False
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
                    # B-17: a bought military unit inherits the SPAWN city's (capital, else first alive) Encampment training XP.
                    bidx5 = torch.arange(self.B, device=self.device)
                    xp_cap5 = (self.rc_bldg[bidx5, r, spawn_slot5].long() * self._b_train_xp.view(1, -1)).max(dim=1).values
                    landed_u5 = self._spawn_rival(elig_u5, ctr5, pick_ty5, r, init_xp=xp_cap5)
                    price_u5 = self._p_cost.gather(0, pick_ty5).double() * mult_r5
                    self.r_treasury[:, r] = torch.where(landed_u5, self.r_treasury[:, r] - price_u5, self.r_treasury[:, r])
                    bought_r5 = bought_r5 | landed_u5
            # B9-R3 (A-9): WORSHIP — a civ that FOUNDED a religion faith-buys
            # its worship building (the rivals.ts A-5 worship branch twin):
            # deterministic no-draw pick WORSHIP_BUILDINGS[(r+1) % 5] (owner
            # religion = rival index + 1, the B-18 convention), flat
            # worshipFaithCost, FIRST alive city in slot order with a COMPLETE
            # unpillaged Holy Site and the Temple. Faith is a separate
            # currency — independent of bought_r5.
            if self._worship_bidx and self._temple_bidx >= 0 and self._hs_idx >= 0 and bool(self.r_religion_done[:, r].any()):
                wb5 = self._worship_bidx[(r + 1) % len(self._worship_bidx)]
                if wb5 >= 0:
                    want_w5 = active & self.r_religion_done[:, r] & self._afford(self.r_faith[:, r], self._worship_cost)
                    if bool(want_w5.any()):
                        hs_t5 = self.rc_dist_tile[:, r, :, self._hs_idx]  # [B, RC]
                        hs_ok5 = (hs_t5 >= 0) & self.district_complete.gather(1, hs_t5.clamp(min=0)) & ~self.district_pillaged.gather(1, hs_t5.clamp(min=0))
                        elig_w5 = self.rc_alive[:, r] & ~self.rc_bldg[:, r, :, wb5] & self.rc_bldg[:, r, :, self._temple_bidx] & hs_ok5  # [B, RC]
                        buy_w5 = want_w5 & elig_w5.any(dim=1)
                        if bool(buy_w5.any()):
                            first_w5 = elig_w5 & (elig_w5.long().cumsum(dim=1) == 1) & buy_w5.unsqueeze(1)
                            rows_w5, js_w5 = first_w5.nonzero(as_tuple=True)
                            self.rc_bldg[rows_w5, r, js_w5, wb5] = True
                            self._eff_version += 1  # B9-R2 invariant: every rc_bldg write bumps
                            self.r_faith[:, r] = torch.where(buy_w5, self.r_faith[:, r] - self._worship_cost, self.r_faith[:, r])
            # B6-S2: MISSIONARY — after the worship buy (the rivals.ts order;
            # worship saturates first). ONE per civ per turn at the enhancer-
            # adjusted price (mcost pad 60, HOLY_ORDER row 42 — exporter-
            # rounded integers), cap missionaryCap LIVE per civ; gate = the
            # FIRST alive city in slot order with the SHRINE and a COMPLETE
            # unpillaged Holy Site. Spawns at that city center via the
            # civilian spawner (POOL-END; no free spot = refund). SCRIPTURE
            # ships mchg=+1 charge, applied at purchase.
            _bought_relig = torch.zeros(B, dtype=torch.bool, device=dev)  # B-18 (#71)
            if self._missionary_idx >= 0 and self._shrine_bidx >= 0 and self._hs_idx >= 0 and bool(self.r_religion_done[:, r].any()):
                n_live_m5 = (self.v_alive & (self.v_civ == r) & (self.v_type == self._missionary_idx)).sum(dim=1)
                mcost5 = self._enh["mcost"][self.r_enhancer[:, r] + 1]  # [B] f64
                want_m5 = active & self.r_religion_done[:, r] & (n_live_m5 < self._missionary_cap) & self._afford(self.r_faith[:, r], mcost5)
                if bool(want_m5.any()):
                    hs_tm5 = self.rc_dist_tile[:, r, :, self._hs_idx]  # [B, RC]
                    hs_okm5 = (hs_tm5 >= 0) & self.district_complete.gather(1, hs_tm5.clamp(min=0)) & ~self.district_pillaged.gather(1, hs_tm5.clamp(min=0))
                    elig_m5 = self.rc_alive[:, r] & self.rc_bldg[:, r, :, self._shrine_bidx] & hs_okm5  # [B, RC]
                    buy_m5 = want_m5 & elig_m5.any(dim=1)
                    if bool(buy_m5.any()):
                        first_m5 = elig_m5 & (elig_m5.long().cumsum(dim=1) == 1)
                        at_m5 = (self.rc_center[:, r].clamp(min=0) * first_m5.long()).sum(dim=1)  # exactly one nonzero term per buying row
                        chg_m5 = self._p_charges[self._missionary_idx] + self._enh["mchg"][self.r_enhancer[:, r] + 1]
                        landed_m5 = self._spawn_rival_civ(buy_m5, at_m5, r, type_idx=self._missionary_idx, charges=chg_m5)
                        self.r_faith[:, r] = torch.where(landed_m5, self.r_faith[:, r] - mcost5, self.r_faith[:, r])
                        _bought_relig = _bought_relig | landed_m5
            # B-18 (#71): the APOSTLE buy — the missionary block's twin, run
            # AFTER it so the cheaper unit still saturates first (the TS
            # ordering). Same SHRINE + complete unpillaged HOLY_SITE gate,
            # same first-eligible-slot pick, same spawn-refund convention.
            if self._apostle_buy_live and self._apostle_idx >= 0 and self._shrine_bidx >= 0 and self._hs_idx >= 0 and bool(self.r_religion_done[:, r].any()):
                n_live_a = (self.v_alive & (self.v_civ == r) & (self.v_type == self._apostle_idx)).sum(dim=1)
                # B-18 (#71): FLAT cost (the TS twin — missionaryCostMult is a
                # MISSIONARY discount and does not extend to apostles).
                acost = torch.full((self.B,), float(round(self._apostle_cost)), dtype=torch.float64, device=self.device)
                # B-18 (#71): ONE religious unit per civ per turn — skip rows that
                # just bought a missionary (the TS boughtRelig twin).
                want_a = active & self.r_religion_done[:, r] & ~_bought_relig & (n_live_a < self._apostle_cap) & self._afford(self.r_faith[:, r], acost)
                if bool(want_a.any()):
                    hs_ta = self.rc_dist_tile[:, r, :, self._hs_idx]
                    hs_oka = (hs_ta >= 0) & self.district_complete.gather(1, hs_ta.clamp(min=0)) & ~self.district_pillaged.gather(1, hs_ta.clamp(min=0))
                    elig_a = self.rc_alive[:, r] & self.rc_bldg[:, r, :, self._shrine_bidx] & hs_oka
                    buy_a = want_a & elig_a.any(dim=1)
                    if bool(buy_a.any()):
                        first_a = elig_a & (elig_a.long().cumsum(dim=1) == 1)
                        at_a = (self.rc_center[:, r].clamp(min=0) * first_a.long()).sum(dim=1)
                        landed_a = self._spawn_rival_civ(buy_a, at_a, r, type_idx=self._apostle_idx, charges=self._p_charges[self._apostle_idx].expand(self.B))
                        self.r_faith[:, r] = torch.where(landed_a, self.r_faith[:, r] - acost, self.r_faith[:, r])
            # AUDIT A-5r (#71): TILE PURCHASE — the LAST rung of the gold
            # ladder, so it can never starve the building/settler/unit
            # priorities. Position matters: TS buys here, in the gold block,
            # which runs BEFORE _rival_border_growth — a claim feeds the yields
            # computed in between, so this must NOT be folded into the border
            # walker. Candidate + key come from the SHARED _rival_border_key,
            # the same pick the culture claim uses. ONE tile per civ per turn,
            # first rc in slot order with a candidate. P4/D-17: the claim does
            # NOT advance rc_cbox (purchases and culture keep separate clocks).
            # tilePurchaseMult is TS-only on the rival seat (no adopted rival
            # government carries it — the A-7r note), so it is 1 here; when a
            # rival government ever ships it, thread it through like the other
            # mults. `bought_r5` is the gold ladder's priority thread.
            if self._tile_buy_live:
                _tp_left = active & ~bought_r5
                for _j in range(self.RC):
                    if not bool(_tp_left.any()):
                        break
                    _live = _tp_left & self.rc_alive[:, r, _j]
                    if not bool(_live.any()):
                        continue
                    _ctr = self.rc_center[:, r, _j]
                    _tiles, _tc, _nbs, _key0 = self._rival_border_key(r, _j, _ctr)
                    _unowned = (self.owner.gather(1, _tc) < 0) & (self.cs_at.gather(1, _tc) < 0) & (self.rival_at.gather(1, _tc) < 0)
                    _nbf = _nbs.clamp(min=0).reshape(self.B, -1)
                    _adj = (
                        (self.rival_at.gather(1, _nbf).reshape(self.B, -1, 6) == r)
                        & (self.rc_tile_id.gather(1, _nbf).reshape(self.B, -1, 6) == self.rc_id[:, r, _j].view(self.B, 1, 1))
                        & (_nbs >= 0)
                    ).any(dim=2)
                    _ok = (_tiles >= 0) & _unowned & _adj & _live.unsqueeze(1)
                    _has = _ok.any(dim=1)
                    if not bool(_has.any()):
                        continue
                    _best = torch.where(_ok, _key0, self._inf_f).argmin(dim=1)
                    _tgt = _tiles.gather(1, _best.unsqueeze(1)).squeeze(1)
                    _ring = self.pair_dist[_ctr, _tgt].clamp(min=2)
                    _tpct = self.r_techs[:, r].sum(dim=1).double() / max(1, self.r_techs.shape[2])
                    _cpct = self.r_civics[:, r].sum(dim=1).double() / max(1, self.r_civics.shape[2])
                    _base = js_round(torch.full_like(_tpct, 1.0) * (50.0 + 25.0 * (_ring - 2).double()) * self.rules.game_speed)
                    _step = js_round(torch.full_like(_tpct, 5.0 * self.rules.game_speed))
                    _cost = js_round((_base * (1.0 + 4.0 * torch.maximum(_tpct, _cpct)) + _step * self.r_tiles_purchased[:, r].double()) * 1.0)
                    # A-5r HUNT (#71, seed 9158 t157): TS BREAKS out of the rc
                    # loop when the first rc WITH a candidate cannot be
                    # afforded — it does not try the next city. Only a
                    # candidate-less rc is skipped (`continue`). Treating
                    # unaffordable as "try the next rc" let the GPU buy a
                    # cheaper tile at a LATER slot on turn 157 while TS waited
                    # until 166, a ~98-gold treasury split. `_has` already
                    # folds in `_live`, so it IS the has-a-candidate set.
                    _buy = _has & self._afford(self.r_treasury[:, r], _cost)
                    _abort = _has & ~_buy  # the TS `break`
                    if bool(_buy.any()):
                        _rows = _buy.nonzero(as_tuple=True)[0]
                        self.r_treasury[_rows, r] -= _cost[_rows]
                        self.rival_at[_rows, _tgt[_rows]] = r
                        self.rc_tile_id[_rows, _tgt[_rows]] = self.rc_id[_rows, r, _j]
                        self.rc_acquired[_rows, r, _j] += 1
                        self.r_tiles_purchased[_rows, r] += 1
                        self._eff_version += 1
                    _tp_left = _tp_left & ~_buy & ~_abort
            # AUDIT A-12 (B8-L): RIVAL LEVY — the levyUnits twin, AFTER every
            # purchase (the TS gold-block tail; here just before the trade
            # block — the same rivalPhase position). An AT-WAR rival suzerain
            # of a militaristic CS levies levyUnits units of the 2-step ladder
            # (WARRIOR ≤ spearmanAfterTurn else SPEARMAN) at the CS center when
            # it can afford levyGoldCost — ONE CS per rival per turn (the FIRST
            # eligible in slot order). levyCooldown is per-CS, SHARED across
            # seats (cs_last_levy). Payment + cooldown are UNCONDITIONAL on a
            # free spawn spot (levyUnits pays before spawnUnit, which lands the
            # units on the CS center or its nearest free neighbor).
            if self.S > 0:
                Sl = self.S
                mil_idx_l = int(self.rules.cs.get("militaristicIdx", -1))
                levy_cost = float(self.rules.cs.get("levyGoldCost", 120))
                levy_units_n = int(self.rules.cs.get("levyUnits", 2))
                suz_min_l = int(self.rules.cs.get("suzerainEnvoys", 3))
                mine_el = self.cs_r_envoys[:, r, :Sl]  # [B, S]
                oth_el = self.cs_r_envoys[:, :, :Sl].clone()
                oth_el[:, r] = -1
                oth_max_l = oth_el.max(dim=1).values  # [B, S]
                suz_rl = (  # rivalIsSuzerain: strict-most envoys, ≥ min, > player, > every other rival
                    (mine_el >= suz_min_l)
                    & (mine_el > self.cs_envoys[:, :Sl])
                    & (mine_el > oth_max_l)
                    & self.cs_alive[:, :Sl]
                )
                ready_l = (self.turn - self.cs_last_levy[:, :Sl]) >= self._levy_cooldown
                is_mil_l = self.cs_type[:, :Sl] == mil_idx_l
                afford_l = self._afford(self.r_treasury[:, r], levy_cost).unsqueeze(1)  # [B, 1]
                elig_l = active.unsqueeze(1) & is_mil_l & suz_rl & self.r_atwar[:, r].unsqueeze(1) & ready_l & afford_l  # [B, S]
                do_l = elig_l.any(dim=1)  # [B]
                if bool(do_l.any()):
                    first_l = elig_l & (elig_l.long().cumsum(dim=1) == 1)  # the FIRST eligible CS per row
                    at_l = (self.cs_center[:, :Sl].clamp(min=0) * first_l.long()).sum(dim=1)  # [B] one nonzero term
                    ltype = self._r_spearman if self.turn > int(self.rules.combat.get("spearmanAfterTurn", 60)) else self._warrior_idx
                    ltype_t = torch.full((self.B,), ltype, dtype=torch.long, device=dev)
                    for _ in range(levy_units_n):
                        self._spawn_rival(do_l, at_l, ltype_t, r)  # best-effort; refunds nothing (TS pays before spawnUnit)
                    self.r_treasury[:, r] = torch.where(do_l, self.r_treasury[:, r] - levy_cost, self.r_treasury[:, r])
                    self.cs_last_levy[:, :Sl] = torch.where(first_l, torch.full_like(self.cs_last_levy[:, :Sl], self.turn), self.cs_last_levy[:, :Sl])
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
            # B-24 S3: this rival's governor seats for THIS turn — the TS
            # loop-top governorPicks mirror (quantized milli loyalty snapshot,
            # ties by slot index == TS array order; alive-masked).
            _titles_r = (self.r_civics[:, r].sum(dim=1) // self._gov_per).clamp(max=self._gov_max)  # [B]
            _q_rloy = js_round(self.rc_loyalty[:, r] * 1000).long()
            _gk = torch.where(self.rc_alive[:, r], _q_rloy * 64 + torch.arange(self.RC, device=dev).view(1, -1), torch.full_like(_q_rloy, 1 << 40))
            _gr = torch.empty_like(_gk)
            _gr.scatter_(1, _gk.argsort(dim=1, stable=True), torch.arange(self.RC, device=dev).expand(B, self.RC))
            rc_gov = (_gr < _titles_r.unsqueeze(1)) & self.rc_alive[:, r]  # [B, RC]
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
                    has_aq = (aq_t >= 0) & self.district_complete.gather(1, aq_t.clamp(min=0)) & ~self.district_pillaged.gather(1, aq_t.clamp(min=0))  # B-32
                else:
                    has_aq = torch.zeros(B, self.RC, dtype=torch.bool, device=dev)
                water = torch.where(
                    has_aq,
                    torch.where(fresh, wh + self._aq_fresh_bonus, torch.maximum(wh, torch.full_like(wh, self._aq_no_fresh_total))),
                    wh,
                )
                selb_h = self.rc_bldg[:, r] & ~self._rc_bdark(dt_all)  # B-32: buildings in a pillaged district give no housing
                bh = selb_h.double() @ self.rules.b_housing.to(dev).double()  # [B, RC]
                win3a = tiles_from_offsets(_ctr_r.reshape(-1), self._off3, self.W, self.H).reshape(B, self.RC, -1)
                w3f = win3a.clamp(min=0).reshape(B, -1)
                imp_w3 = self.improvement.gather(1, w3f).reshape_as(win3a)
                imp_own = (win3a >= 0) & (self.rival_at.gather(1, w3f).reshape_as(win3a) == r) & (imp_w3 >= 0)
                farm = (self._imp_housing[imp_w3.clamp(min=0)].double() * imp_own.double()).sum(dim=2)
                # B9-R3: PALACE housing on the capital slot (rivalHousing sums
                # rc.buildings, which now hold the founding PALACE; CITY_CENTER
                # never pillages so no darkness gate).
                housing = water + bh + self._palace_housing * (self.rc_is_cap[:, r] & self.rc_alive[:, r]).double() + farm
                # A-9 (#71): appeal-based NEIGHBORHOOD housing, the player twin
                # (computeHousing). rc tiles are keyed by the A-17 per-city
                # registry (rc_tile_id), so sum per rc SLOT over its own tiles.
                if self._nbhd_didx >= 0:
                    _ap = self._tile_appeal()
                    _hv = torch.full_like(_ap, self._appeal_floor)
                    for _cut, _val in sorted(self._appeal_cuts):
                        _hv = torch.where(_ap >= _cut, torch.full_like(_ap, _val), _hv)
                    _nb_ok = (self.district == self._nbhd_didx) & self.district_complete & ~self.district_pillaged
                    _mine = _nb_ok & (self.rival_at == r)
                    _srcd = (_hv * _mine.long()).double()
                    _rid = self.rc_tile_id  # [B, T] persistent rc id, -1 = none
                    _nbh = torch.zeros_like(housing)
                    for _j in range(self.RC):
                        _idj = self.rc_id[:, r, _j].unsqueeze(1)  # [B, 1]
                        _nbh[:, _j] = (_srcd * ((_rid == _idj) & (_idj >= 0)).double()).sum(dim=1)
                    housing = housing + _nbh
                if _rcy_bel:
                    housing = housing + torch.einsum("bjn,bjn->bj", selb_h.double(), self._fol_tab("bldgH", _fol_h_rc))
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
                    # B-24 S2: per-SOURCE-civ age factors (halves — exact f64;
                    # the D-12 single-sum note survives: terms are multiples
                    # of 0.5, still association-free).
                    f_own = self._age_factor[self.civ_age[:, r + 1]]
                    d_own = self.pair_dist[here_j.unsqueeze(1), self.rc_center[:, r].clamp(min=0)].to(torch.float64)
                    own_p = ((lrng + 1 - d_own).clamp(min=0) * self.rc_pop[:, r].double() * self.rc_alive[:, r].double()).sum(dim=1) * f_own
                    d_pl = self.pair_dist[here_j.unsqueeze(1), self.site.clamp(min=0)].to(torch.float64)
                    for_p = ((lrng + 1 - d_pl).clamp(min=0) * self.pop.double() * self.alive.double()).sum(dim=1) * self._age_factor[self.civ_age[:, 0]]
                    others = self.alive.any(dim=1)
                    oth = [r2 for r2 in range(self.R) if r2 != r]
                    if oth:
                        ctr_o = self.rc_center[:, oth].reshape(B, -1)
                        alive_o = self.rc_alive[:, oth].reshape(B, -1)
                        d_o = self.pair_dist[here_j.unsqueeze(1), ctr_o.clamp(min=0)].to(torch.float64)
                        sub_o = ((lrng + 1 - d_o).clamp(min=0) * self.rc_pop[:, oth].reshape(B, -1).double() * alive_o.double()).reshape(B, len(oth), self.RC).sum(dim=2)
                        f_oth = self._age_factor[self.civ_age[:, [r2 + 1 for r2 in oth]]]  # [B, len(oth)]
                        for_p = for_p + (sub_o * f_oth).sum(dim=1)
                        others = others | alive_o.any(dim=1)
                    tot_p = own_p + for_p
                    press = torch.where(tot_p > 0, lscale * (own_p - for_p) / tot_p.clamp(min=1e-9), torch.zeros_like(tot_p))
                    delta_l = press + self._loyalty_amenity[amen_tidx[:, j].clamp(min=0, max=self._loyalty_amenity.shape[0] - 1)].double() + rc_gov[:, j].double() * self._gov_loy  # B-24 S3
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
                        # B-27 (#79): the MILITARY ENGINEER is a CIVILIAN chassis
                        # (charges, no combat) and must spawn through the civilian
                        # path like the Builder. It previously fell through to
                        # _spawn_rival (the MILITARY spawn), so a completed
                        # engineer never existed as a charge-carrying civilian —
                        # `has_alive_e` stayed false and the civ re-queued another
                        # every few turns (seed 9092: GPU re-queued at t128 where
                        # TS did not). Charges come from the roster, like any civ.
                        if self._rival_eng_live and self._eng_idx >= 0:
                            is_eng = spawn_u & (cur - 1 == self._eng_idx)
                            if bool(is_eng.any()):
                                self._spawn_rival_civ(is_eng, self.rc_center[:, r, j], r, type_idx=self._eng_idx)
                            spawn_u = spawn_u & ~is_eng
                        if bool(spawn_u.any()):
                            # B-17: a trained military unit inherits city j's Encampment training XP (best tier).
                            xp_rj = (self.rc_bldg[:, r, j, :].long() * self._b_train_xp.view(1, -1)).max(dim=1).values
                            self._spawn_rival(spawn_u, self.rc_center[:, r, j], (cur - 1).clamp(min=0), r, init_xp=xp_rj)
                        # C1-B4: a finished district completes its paved tile
                        nS_b4 = len(self._scaffold)
                        done_d = done_q & (cur > self.NU) & (cur <= self.NU + nS_b4)
                        if bool(done_d.any()):
                            dr = done_d.nonzero(as_tuple=True)[0]
                            dtile = self.rc_qtile[:, r, j]
                            _dt = dtile[dr].clamp(min=0)
                            self.district_complete[dr, _dt] = True
                            # B-24 (#77): MONUMENTALITY, the rival twin.
                            _monr = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                            _monr[dr] = True
                            self._dedication_event(r + 1, 0, _monr)
                            # B-17 (#71): a completed ENCAMPMENT musters its garrison.
                            _enc = self.district[dr, _dt] == self._encamp_didx
                            self.encamp_hp[dr, _dt] = torch.where(
                                _enc, torch.full_like(_dt, self._encamp_hp_max), self.encamp_hp[dr, _dt]
                            )
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
                            # B9-R2: a completed REGIONAL building reaches OTHER
                            # cities' yields THIS phase (TS accrues later cities
                            # live) — the first cross-city building channel, so
                            # rc_bldg writes must invalidate the economy caches.
                            self._eff_version += 1
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
                                self.era_score[wr_, r + 1] += self._era_pts["wonder"]  # B-24: wonder completed
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
                                    # #79: pay EVERY listed class at THIS row's
                                    # rate — the Festival pays Writer/Artist/
                                    # Musician at 0.11 each, every other project
                                    # one class at 0.22. `gs`/`gf` fall back to
                                    # the legacy single `g` + global fraction.
                                    amt_g = js_round(cost_locked * float(prow.get("gf", self._proj_gf)))
                                    g_list = prow.get("gs")
                                    if not g_list:
                                        g_one = int(prow.get("g", -1))
                                        g_list = [g_one] if g_one >= 0 else []
                                    for g_i in (int(x) for x in g_list):
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
                            # B-4: only a player MILITARY target (is_pmil) carries veterancy.
                            def_xp = torch.where(is_pmil, self._xp_lvl_bonus(self.p_xp[bidx, pm_slot.clamp(min=0)]), torch.zeros_like(tt))
                            def_cs = torch.where(is_barb, d_cs_barb, torch.where(is_pmil, d_cs_pmil, d_cs_pciv)) + self._tdef_i(bidx, tt) + def_xp  # + B-4
                            # #45/B-6: an embarked player target (military/civilian;
                            # barbs never embark) → flat CS, no terrain (no support).
                            d_emb = (self.p_emb[bidx, pm_slot.clamp(min=0)] & is_pmil) | (self.p_emb[bidx, pc_slot.clamp(min=0)] & is_pciv)
                            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                            gslot = self.rv_at[bidx, ctr]  # rivalCityDefense garrison: own military at center
                            gar = ((gslot >= 0) & (self.v_civ[bidx, gslot.clamp(min=0)] == r)).long()
                            atk_cs = torch.maximum(self.r_best_melee[:, r], torch.full_like(self.r_best_melee[:, r], 15)) + gar * 5
                            # B-29: the defending unit is wounded (attacker is the city).
                            def_hp = torch.where(is_barb, self.u_hp[bidx, b_slot.clamp(min=0)], torch.where(is_pmil, self.p_hp[bidx, pm_slot.clamp(min=0)], self.p_hp[bidx, pc_slot.clamp(min=0)]))
                            def_e = def_cs - self._wound(def_hp)
                            # B-7 support (the pcstk mirror): the struck unit — barb
                            # or player — gains support from adjacent same-side
                            # military; the attacker is the city, no flanking.
                            _dside = torch.where(is_barb, torch.ones(Bn, dtype=torch.long, device=dev2), torch.zeros(Bn, dtype=torch.long, device=dev2))
                            _, _sp = self._flank_support(tt, _dside, torch.zeros(Bn, dtype=torch.long, device=dev2), torch.full((Bn,), -1, dtype=torch.long, device=dev2))
                            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)  # #45/B-6: embarked → no support
                            # #70/S2 (B-8): the pcstk mirror on the rival side —
                            # DEFENDER-side aura (roll is atk_cs - def_e, so it
                            # REDUCES the damage taken), outside the embarked
                            # override. Only a PLAYER MILITARY target carries one
                            # (unified civ 0); barbs own no general and a player
                            # CIVILIAN is combat-0 → generalAuraCS returns 0.
                            _def_civ_u = torch.where(is_pmil, torch.zeros_like(tt), torch.full_like(tt, -1))
                            _def_nav = torch.where(is_pmil, self.unit_naval[self.p_type[bidx, pm_slot.clamp(min=0)].clamp(min=0, max=self.NU - 1)], torch.zeros_like(d_emb))
                            def_e = def_e + self._gen_aura_cs(_def_civ_u, tt, d_emb | _def_nav).to(def_e.dtype)
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
                            # B-4: a surviving player MILITARY defender earns +2
                            # (attacker is the city; barb / player civilian never accrue).
                            surv_pm = (strike & is_pmil).nonzero(as_tuple=True)[0]
                            if len(surv_pm) > 0:
                                alive_now = self.p_hp[surv_pm, pm_slot[surv_pm]] > 0
                                sp = surv_pm[alive_now]
                                if len(sp) > 0:
                                    self.p_xp[sp, pm_slot[sp]] += XP_DEFEND
                # B-17 (ROUND B7): the rival mirror of the ADDITIONAL Encampment
                # strike (the restk twin of walls' rcstk). This rival city
                # (r, j), if it owns a COMPLETE unpillaged ENCAMPMENT, fires the
                # same once/turn ranged strike right AFTER its walls strike
                # (walls first, then Encampment — per rc, before the heal),
                # k="restk". rc_dist_tile is districts_cat-indexed (matches
                # self._encamp_didx and the player self.district plane).
                if self._encamp_didx >= 0 and self.districts_on:
                    Bn, Tn, dev2 = self.B, self.T, self.device
                    bidx = torch.arange(Bn, device=dev2)
                    enc_reg = self.rc_dist_tile[:, r, j, self._encamp_didx]  # [B]
                    # B-17 (#71): `encamp_hp > 0` joins the gate — a beaten-down
                    # Encampment is occupied and fires nothing (the pestk twin).
                    enc_ok = (enc_reg >= 0) & self.district_complete.gather(1, enc_reg.clamp(min=0).unsqueeze(1)).squeeze(1) & ~self.district_pillaged.gather(1, enc_reg.clamp(min=0).unsqueeze(1)).squeeze(1) & (self.encamp_hp.gather(1, enc_reg.clamp(min=0).unsqueeze(1)).squeeze(1) > 0)
                    has_enc = cact & enc_ok
                    if bool(has_enc.any()):
                        ctr = self.rc_center[:, r, j].clamp(min=0)  # [B]
                        dist = self.pair_dist[ctr].to(torch.long)  # [B, T]
                        war = self.r_atwar[:, r].unsqueeze(1)  # [B, 1]
                        barb_h = self.barb_at >= 0
                        pmil_h = (self.pmil_at >= 0) & war
                        pciv_h = (self.pciv_at >= 0) & war
                        hostile = barb_h | pmil_h | pciv_h  # [B, T]
                        valid = has_enc.unsqueeze(1) & hostile & (dist >= 1) & (dist <= 2)
                        arangeT = torch.arange(Tn, device=dev2)
                        key = torch.where(valid, dist * (Tn + 1) + arangeT.view(1, -1), torch.full((Bn, Tn), 10**9, device=dev2, dtype=torch.long))
                        best_key = key.min(dim=1).values
                        tt = key.argmin(dim=1)  # [B]
                        strike = has_enc & (best_key < 10**9)
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
                            def_xp = torch.where(is_pmil, self._xp_lvl_bonus(self.p_xp[bidx, pm_slot.clamp(min=0)]), torch.zeros_like(tt))
                            def_cs = torch.where(is_barb, d_cs_barb, torch.where(is_pmil, d_cs_pmil, d_cs_pciv)) + self._tdef_i(bidx, tt) + def_xp
                            d_emb = (self.p_emb[bidx, pm_slot.clamp(min=0)] & is_pmil) | (self.p_emb[bidx, pc_slot.clamp(min=0)] & is_pciv)
                            def_cs = torch.where(d_emb, torch.full_like(def_cs, self._embarked_defense_cs), def_cs)
                            gslot = self.rv_at[bidx, ctr]  # rivalCityDefense garrison: own military at center
                            gar = ((gslot >= 0) & (self.v_civ[bidx, gslot.clamp(min=0)] == r)).long()
                            atk_cs = torch.maximum(self.r_best_melee[:, r], torch.full_like(self.r_best_melee[:, r], 15)) + gar * 5
                            def_hp = torch.where(is_barb, self.u_hp[bidx, b_slot.clamp(min=0)], torch.where(is_pmil, self.p_hp[bidx, pm_slot.clamp(min=0)], self.p_hp[bidx, pc_slot.clamp(min=0)]))
                            def_e = def_cs - self._wound(def_hp)
                            _dside = torch.where(is_barb, torch.ones(Bn, dtype=torch.long, device=dev2), torch.zeros(Bn, dtype=torch.long, device=dev2))
                            _, _sp = self._flank_support(tt, _dside, torch.zeros(Bn, dtype=torch.long, device=dev2), torch.full((Bn,), -1, dtype=torch.long, device=dev2))
                            def_e = def_e + SUPPORT_CS * torch.where(d_emb, torch.zeros_like(_sp), _sp)
                            # #70/S2 (B-8): the rcstk mirror — defender-side aura
                            # (player MILITARY only), outside the embarked override.
                            _def_civ_u = torch.where(is_pmil, torch.zeros_like(tt), torch.full_like(tt, -1))
                            _def_nav = torch.where(is_pmil, self.unit_naval[self.p_type[bidx, pm_slot.clamp(min=0)].clamp(min=0, max=self.NU - 1)], torch.zeros_like(d_emb))
                            def_e = def_e + self._gen_aura_cs(_def_civ_u, tt, d_emb | _def_nav).to(def_e.dtype)
                            d = self._damage_roll(strike, atk_cs - def_e, k="restk", tile=tt)
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
                                    self._rp_kill_version += 1  # G1: death -> raided-mask changes for city j+1
                            surv_pm2 = (strike & is_pmil).nonzero(as_tuple=True)[0]
                            if len(surv_pm2) > 0:
                                alive_now2 = self.p_hp[surv_pm2, pm_slot[surv_pm2]] > 0
                                sp2 = surv_pm2[alive_now2]
                                if len(sp2) > 0:
                                    self.p_xp[sp2, pm_slot[sp2]] += XP_DEFEND
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
                # A-19/B-33 (S2): an adjacent enemy AT-WAR rival unit (mil or
                # civilian) besieges this city too — the symmetric unitsHostile
                # (the TS besiege scan). rr_war[:, r] gather by the neighbour's
                # civ; own-civ units (== r) never besiege.
                rvn = self.rv_at.gather(1, nbhc)
                rvcn = self.rvciv_at.gather(1, nbhc)
                rvn_civ = torch.where(rvn >= 0, self.v_civ.gather(1, rvn.clamp(min=0)), torch.full_like(rvn, -1))
                rvcn_civ = torch.where(rvcn >= 0, self.v_civ.gather(1, rvcn.clamp(min=0)), torch.full_like(rvcn, -1))
                war_rvn = (rvn >= 0) & (rvn_civ != r) & self.rr_war[:, r].gather(1, rvn_civ.clamp(min=0))
                war_rvcn = (rvcn >= 0) & (rvcn_civ != r) & self.rr_war[:, r].gather(1, rvcn_civ.clamp(min=0))
                hostile_adj = hostile_adj | war_rvn | war_rvcn
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
                # B-17 (#71): the rival Encampment garrison repairs on the same
                # gate/rate — the player's barbarianPhase mirror. rc_dist_tile
                # is districts_cat-indexed, so the Encampment column IS the tile.
                if self._encamp_didx >= 0:
                    _et = self.rc_dist_tile[:, r, j, self._encamp_didx]  # [B]
                    _etc = _et.clamp(min=0)
                    _live = (
                        (_et >= 0)
                        & self.district_complete.gather(1, _etc.unsqueeze(1)).squeeze(1)
                        & ~self.district_pillaged.gather(1, _etc.unsqueeze(1)).squeeze(1)
                    )
                    _ok = cact & ~besieged_j & _live
                    _cur = self.encamp_hp.gather(1, _etc.unsqueeze(1)).squeeze(1)
                    self.encamp_hp[:, :] = self.encamp_hp.scatter(
                        1,
                        _etc.unsqueeze(1),
                        torch.where(_ok, (_cur + heal).clamp(max=self._encamp_hp_max), _cur).unsqueeze(1),
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
            # B-20 (#71): TOURISM — the TS `rival.tourism` twin. POSITION IS
            # LOAD-BEARING: TS accumulates AFTER this turn's TECH completions
            # but BEFORE any civic completes, and the wonder term reads the
            # civ's ERA off completed research — so accumulating a step early
            # cost exactly one era-past point per wonder (seed 9014 t112).
            _tour_r = self._tourism_of(
                self.rc_gw_writing[:, r],
                self.rc_gw_art[:, r],
                self.rc_gw_music[:, r],
                self.rc_alive[:, r],
                self.rival_at == r,
                self._civ_era(self.r_techs[:, r], self.r_civics[:, r]),
                self.rc_relics[:, r],  # B-20 (#73)
                self.r_techs[:, r, self._gw_printing_tech] if self._gw_printing_tech >= 0 else None,  # B-20 (#74)
            )
            self.r_tourism[:, r] = torch.where(active, self.r_tourism[:, r] + _tour_r, self.r_tourism[:, r])
            # B-22 (#75): DIPLOMATIC FAVOR — the player's twin, same position.
            _fav_r = self._adopted_gov_tier(self.r_civics[:, r]) + self._favor_per_suz * self._rival_suzerain_count(r)
            self.r_diplo_favor[:, r] = torch.where(active, self.r_diplo_favor[:, r] + _fav_r, self.r_diplo_favor[:, r])
            # B-22: grievances DECAY by 1 per turn at peace on every axis.
            _at_peace = ~self.r_atwar[:, r] & ~self.rr_war[:, r].any(dim=1)
            self.r_warmonger[:, r] = torch.where(
                active & _at_peace & (self.r_warmonger[:, r] > 0),
                self.r_warmonger[:, r] - 1,
                self.r_warmonger[:, r],
            )
            picked = self._auto_pick(self.r_cur_civic[:, r], self.r_civics[:, r], nb_c, rdv.c_cost, self._prereq_c)
            self.r_cur_civic[:, r] = torch.where(auto_r, picked, self.r_cur_civic[:, r])
            self.r_civic_prog[:, r] = torch.where(active, self.r_civic_prog[:, r] + cul_sum, self.r_civic_prog[:, r])
            # B-25 (#72): LIFETIME culture — the TS `rival.cultureTotal` twin,
            # at the same position (immediately after civicProgress takes the
            # same sum). Zero-draw.
            self.r_culture[:, r] = torch.where(active, self.r_culture[:, r] + cul_sum, self.r_culture[:, r])
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
            # B6-S2: missionary actions (spread on the adjacent target, else
            # walk) — the rivals.ts call position, right after the builders.
            if self._missionary_idx >= 0:
                self._rival_missionary_actions(r, active & ~self.controlled[:, r])

            # Great-people race (no draws): accrue, claim from the shared pool.
            for cls in range(self._gp_nc):  # all GP classes (incl Admiral/General)
                # C1-B4c: real accrual — 1 + (that district's buildings) per
                # city owning a COMPLETED district of the class (was
                # cities × gppRate; rivals accrue 0 until their first
                # Campus/HS/CH completes).
                d_cls = int(self._gp_class_district[cls]) if cls < self._gp_nc else -1
                if d_cls >= 0 and self.districts_on:
                    reg_c = self.rc_dist_tile[:, r, :, d_cls]  # [B, RC]
                    comp_c = (reg_c >= 0) & self.district_complete.gather(1, reg_c.clamp(min=0)) & ~self.district_pillaged.gather(1, reg_c.clamp(min=0))  # B-32: pillaged earns no GPP
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
                    # B-20: WRITER/ARTIST/MUSICIAN culture is slotted as Great
                    # Works into this rival's cities (deferred per-kind culture);
                    # overflow charges fall back to the instant lump inside
                    # _place_rival_works. #73: ART is a real kind now.
                    _kind = self._gw_cls.index(cls) if cls in self._gw_cls else -1
                    if _kind >= 0:
                        self._place_rival_works(r, hit, eff[:, 1].double(), _kind)
                    else:
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
                    self.era_score[:, r + 1] += hit.long() * self._era_pts["gp"]  # B-24: per GP earned
                    # B7-G (B-8): a GENERAL/ADMIRAL claim spawns its support
                    # unit (civilian, 4 MP) at the rival's capital (rc_is_cap
                    # center), on top of the instant effect — the rivals.ts
                    # spawn-at-claim mirror. Production-free (zero RNG).
                    if (cls == self._general_cls and self._general_unit_idx >= 0) or (cls == self._admiral_cls and self._admiral_unit_idx >= 0):
                        guidx = self._general_unit_idx if cls == self._general_cls else self._admiral_unit_idx
                        if bool(hit.any()):
                            cap_t = torch.where(self.rc_is_cap[:, r] & self.rc_alive[:, r], self.rc_center[:, r], torch.full_like(self.rc_center[:, r], -1)).max(dim=1).values
                            self._spawn_rival_civ(hit & (cap_t >= 0), cap_t, r, type_idx=guidx)
                            self._gen_ver += 1

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
            self.era_score[:, r + 1] += popen.long() * self._era_pts["pantheon"]  # B-24
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
            self.era_score[:, r + 1] += ropen.long() * self._era_pts["religion"]  # B-24
            # B-18: freeze this religion's holy tile at founding — the pressure
            # source. r_religion_done latches, so ropen fires once and the tile
            # never re-writes. B9-R1 hunt catch (rng 2026006104 t119): TS picks
            # the LIVE capital at founding time, else the FIRST LIVE CITY
            # (rivals.ts `cities.find(isCapital) ?? cities[0]`) — the static
            # cap_tile_rival goes stale when the capital fell before founding.
            _rc_alv = self.rc_alive[:, r]
            _rc_cap = self.rc_is_cap[:, r] & _rc_alv
            _h_slot = torch.where(_rc_cap.any(dim=1), _rc_cap.long().argmax(dim=1), _rc_alv.long().argmax(dim=1))
            _holy = self.rc_center[:, r].gather(1, _h_slot.unsqueeze(1)).squeeze(1)
            _holy = torch.where(_rc_alv.any(dim=1), _holy, torch.full_like(_holy, -1))  # ?? null
            self.holy_tile[:, r + 1] = torch.where(ropen, _holy, self.holy_tile[:, r + 1])

            # B-18: enhance the founded religion — a SECOND earned Prophet
            # claims an enhancer belief, denying it from the shared pool
            # (mirror of the follower/founder claim). TS claimBeliefs adds this
            # draw AFTER the founder draw, gated on
            # religionFounded && !enhancerClaimed && prophets>=2 && pool-open.
            # The draw advances only where eopen (the peace-roll pattern), so it
            # is RNG-neutral when it never fires. B6-S1: effects are LIVE now —
            # presR (pressure range), tradeRel (route income), cnear/cdef/cvs
            # (combat CS) read r_enhancer through the _enh tables.
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

            # B7-G (B-8): the Great General marches with the war effort (spawned
            # above in the GP claim — a fresh one walks this turn on full MP).
            # Runs BEFORE the war loop so the aura reflects the advanced
            # position — the rivals.ts call order (after claimBeliefs).
            self._rival_general_actions(r, active & ~self.controlled[:, r])

            # War or peace (branch on the value at entry; a peace made this
            # turn still ran the war branch, exactly like the TS if/else).
            # A-19/B-33 (S2): a rival at war with ANYONE (player or a rival)
            # takes the WAR branch — its units run the war-act (which now scans
            # at-war rivals' units/cities). r_warturns and the player-peace roll
            # stay gated on the PLAYER war (atw); the player-DoW roll (below) is
            # skipped for a rival already in ANY war via pea = ~atw_any (both
            # engines drop the conditional draw in lockstep).
            atw = active & self.r_atwar[:, r]
            atw_any = atw | (active & self.rr_war[:, r, : self.R].any(dim=1))
            self.r_warturns[:, r] = self.r_warturns[:, r] + atw.long()
            v_high = int(self.v_next.max().item())
            # D-4: this civ's live slots once (deaths only shrink mid-loop; no
            # spawns in either loop) — the war AND peace walks reuse it.
            v_mine = (self.v_alive[:, :v_high] & (self.v_civ[:, :v_high] == r)).any(dim=0).nonzero(as_tuple=True)[0].tolist() if v_high else []
            for v in v_mine:
                # C1-B5b: civilians never act in the war loop (charges mark them)
                # C3-prep: the units head drives controlled rivals now
                a = atw_any & ~self.controlled[:, r] & self.v_alive[:, v] & (self.v_civ[:, v] == r) & (self._p_charges[self.v_type[:, v]] == 0)
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

            pea = active & ~atw_any  # A-19/B-33 (S2): a rival at ANY war does not patrol / roll the player-DoW
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
                # B-22 (#74): a WARMONGERING player is ganged up on — past
                # _wm_gang grievances the strength advantage is not required
                # (the rival↔rival gang rule's twin). Evaluated BEFORE the
                # draw, so it changes how often the roll fires; both engines
                # gate identically.
                & ((r_str > p_str.double() * 1.3) | (self.p_warmonger >= self._wm_gang))
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

        # A-19/B-33 (S2): pairwise rival↔rival auto-peace AFTER every rival
        # acted (ww/cities updated) — the rivalRivalMakePeace twin (zero-draw).
        self._rival_rival_make_peace()

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
        # B-24 S2: contributions scale by the SOURCE civ's age factor (the
        # loyaltyDelta mirror: per-civ subtotal × factor — halves-exact in
        # this dtype, so grouping stays association-free).
        f_age = self._age_factor[self.civ_age].to(self.dtype)  # [B, 1+R]
        own = (w * pop_mix * self.alive.unsqueeze(1).to(self.dtype)).sum(dim=2) * f_age[:, 0].unsqueeze(1)
        # foreign pressure from rival cities, per SOURCE rival × its factor
        rc_flat = self.rc_center.reshape(B, -1).clamp(min=0)
        rc_live = self.rc_alive.reshape(B, -1)
        d_cr = self.pair_dist[sitec.unsqueeze(2), rc_flat.unsqueeze(1)].to(self.dtype)
        wf = (rng + 1 - d_cr).clamp(min=0)
        foreign_r = (
            wf.view(B, C, self.R, self.RC)
            * self.rc_pop.view(B, 1, self.R, self.RC).to(self.dtype)
            * self.rc_alive.view(B, 1, self.R, self.RC).to(self.dtype)
        ).sum(dim=3)  # [B, C, R]
        foreign = (foreign_r * f_age[:, 1 : 1 + self.R].unsqueeze(1)).sum(dim=2)
        tot = own + foreign
        pressure = torch.where(tot > 0, scale * (own - foreign) / tot.clamp(min=1e-9), torch.zeros_like(tot))
        # B-24 S3: the player's governor seats — the endTurn governorPicks
        # mirror. Rank alive cities on QUANTIZED milli loyalty (raw-f64
        # ranking is float-association-fragile — the B-29 lesson), ties by
        # city_seq (TS array position). Pick from the PRE-update snapshot.
        titles_p = (self.civics.sum(dim=1) // self._gov_per).clamp(max=self._gov_max)  # [B]
        q_loy = js_round(self.loyalty * 1000).long()
        gov_key = torch.where(self.alive, q_loy * 256 + self.city_seq, torch.full_like(q_loy, 1 << 40))
        gov_rank = torch.empty_like(gov_key)
        gov_rank.scatter_(1, gov_key.argsort(dim=1, stable=True), torch.arange(C, device=dev).expand(B, C))
        gov_b = (gov_rank < titles_p.unsqueeze(1)) & self.alive
        delta = pressure + self._loyalty_amenity[tier_idx.clamp(min=0, max=self._loyalty_amenity.shape[0] - 1)] + gov_b.to(self.dtype) * self._gov_loy
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
        # #70/S4 (A-9): relocatePalace(state.cities) — TS calls it right
        # after the state.cities filter, i.e. BEFORE the cityHp/route prune
        # and BEFORE the conquest-raze early return below.
        self._relocate_palace_player(torch.tensor([b], dtype=torch.long, device=self.device))
        owned = self.owner[b] == c
        # AUDIT B-30: snapshot the transferring city's COMPLETE placeable-district
        # and wonder tiles from the LIVE owner mask (CITY_CENTER is never in the
        # district plane, so it is excluded) plus its buildings row, BEFORE the
        # owner mask is cleared below. Conquest keeps this infrastructure; only
        # COMPLETE districts carry (incomplete = paved-but-dead), matching the TS
        # twin's district_complete filter.
        b30_dist_t = (owned & (self.district[b] >= 0) & self.district_complete[b]).nonzero(as_tuple=True)[0]
        b30_wond_t = (owned & (self.built_wonder[b] >= 0)).nonzero(as_tuple=True)[0]
        b30_bldg = self.buildings[b, c, :].clone()
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
        self.era_score[b, w_ + 1] += self._era_pts["conquer"]  # B-24: gained a city (flip/conquest; the raze path returned above)
        self.rc_is_cap[b, w_, slot] = False  # TS defect: isCapital false (rivals.ts:420)
        self.rc_center[b, w_, slot] = self.site[b, c]
        self.rc_pop[b, w_, slot] = max(1, (old_pop * 3) // 4)
        self.rc_growth[b, w_, slot] = 0
        self.rc_cbox[b, w_, slot] = 0  # P5/S4 (TS transfer: cultureBox 0)
        self.rc_gw_writing[b, w_, slot] = 0  # B-20: works wiped on player→rival transfer
        self.rc_gw_music[b, w_, slot] = 0
        self.rc_loyalty[b, w_, slot] = 100.0  # P5/S6
        self.rc_acquired[b, w_, slot] = int(self.tiles_acquired[b, c])
        self.rc_hp[b, w_, slot] = round(self.rules.rivals.get("cityMaxHp", 200) / 2)
        self.rc_id[b, w_, slot] = int(self.r_next_city_id[b, w_])
        self.rc_current[b, w_, slot] = -1
        self.rc_progress[b, w_, slot] = 0.0
        self.rc_cost[b, w_, slot] = 0.0
        self.rc_qtile[b, w_, slot] = -1
        # AUDIT B-30: conquest keeps infrastructure. Adopt the transferring
        # city's districts (registry keyed by placeable-district type -> tile),
        # wonders (keyed by wonder index -> tile), and buildings (index space
        # matches — buildings and rc_bldg both key on the b_cost catalog, which
        # excludes PALACE). ANCIENT_WALLS rides along; the outer pool stays 0
        # (walls kept at outerHp 0, heal back via B-1 — the rival heal gate
        # reads the walls bit in rc_bldg).
        self.rc_dist_tile[b, w_, slot, :] = -1
        for _t in b30_dist_t.tolist():
            self.rc_dist_tile[b, w_, slot, int(self.district[b, _t])] = _t
        self.rc_wonder[b, w_, slot, :] = -1
        for _t in b30_wond_t.tolist():
            self.rc_wonder[b, w_, slot, int(self.built_wonder[b, _t])] = _t
        self.rc_bldg[b, w_, slot, :] = b30_bldg
        self.rc_outer_hp[b, w_, slot] = 0  # AUDIT B-30: walls (if any) kept at outer pool 0
        self.r_next_city_id[b, w_] += 1
        self.rvcity_at[b, self.site[b, c]] = w_
        self._eff_version += 1  # B9-R2 invariant: the receiver just gained rc_bldg/districts/tiles mid-phase
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
                # B-9: strategic-resource access gates the purchase (mirrors TS
                # purchaseUnit → trainableUnits), per this slot's chosen unit.
                res_ok = self._res_avail_mask(self.owner >= 0).gather(1, utp.unsqueeze(1)).squeeze(1)
                tech_ok = tech_ok & res_ok & ~self._p_faith_only[utp]  # B6-S2: faith-only never gold-buys
                cost = self._p_cost[utp] * mult
                if self._builder_idx >= 0:
                    # P4/D-10: bought builders price off the live escalator…
                    b_now = self._builder_cost(self.builders_trained + bqueued_live) * mult
                    cost = torch.where(utp == self._builder_idx, b_now, cost)
                found, _ = self._first_free_spot(self.site[:, c], "player", self._p_civ[utp])
                can = is_pu & tech_ok & self._afford(self.treasury, cost) & found
                if bool(can.any()):
                    self.treasury = torch.where(can, self.treasury - cost, self.treasury)
                    # B-17: a purchased military unit inherits city c's Encampment training XP (best tier).
                    xp_c = (self.buildings[:, c, :].long() * self._b_train_xp.view(1, -1)).max(dim=1).values
                    self._spawn_player(can, self.site[:, c], utp, init_xp=xp_c)
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
            fields, counter, maps = ["v_acted", "v_civ", "v_type", "v_tile", "v_hp", "v_charges", "v_fortify", "v_xp", "v_aura_mp", "v_emb"], "v_next", ["rv_at", "rvciv_at"]
        else:
            fields, counter, maps = ["p_acted", "p_type", "p_tile", "p_hp", "p_charges", "p_fortify", "p_xp", "p_aura_mp", "p_emb"], "p_next", ["pmil_at", "pciv_at"]
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
        # B-20 (#79): ALL FOUR work counts must ride the compaction permutation.
        # ART and RELICS were added by #73 after this tuple was written and were
        # never appended, so a compaction left them behind at the old slot index
        # — the city lost its relic (or inherited its neighbour's). Same pair,
        # same cause as the _transfer_rc_to_rc omission above.
        "rc_gw_writing", "rc_gw_art", "rc_gw_music", "rc_relics", "rc_artifacts",
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

    def _check_rc_registry_invariant(self) -> None:
        """A-24 machine-check (env-gated via self._rc_reg_check; NO hot-path
        cost when off). Two-way district/wonder <-> tile-registry coherence for
        every ALIVE rival city (the A-17 rc_tile_id contract; the TS twin is
        assertRivalRegistryCoherent in rivals.ts):

          (1) FORWARD: every district tile (rc_dist_tile) and wonder tile
              (rc_wonder) an rc lists registers BACK to that rc — its
              rc_tile_id equals rc_id (a district/wonder sits on a tile owned
              by THAT city, the placement rule this stage enforces). A tile
              registered to a SIBLING (the seed-9118 latent) fails here.
          (2) BACKWARD: every populated registry cell points at a tile whose
              rival_at is a live civ (no dangling index into re-owned/razed
              land). The registry never lists a tile it does not own.

        Raises AssertionError naming (game, civ, slot, kind, di/wi, tile,
        expected id, actual rc_tile_id) on the first violation."""
        if self.R == 0:
            return
        B, dev = self.B, self.device
        for r in range(self.R):
            expect = self.rc_id[:, r].unsqueeze(2)  # [B, RC, 1] this rc's id
            alive = self.rc_alive[:, r].unsqueeze(2)  # [B, RC, 1]
            for name in ("rc_dist_tile", "rc_wonder"):
                reg = getattr(self, name)[:, r]  # [B, RC, K] tile per (city, type/slot)
                has = (reg >= 0) & alive
                if not bool(has.any()):
                    continue
                # rc_tile_id at the listed tile, per cell
                rt = self.rc_tile_id.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape_as(reg)  # [B, RC, K]
                ra = self.rival_at.gather(1, reg.clamp(min=0).reshape(B, -1)).reshape_as(reg)
                bad_fwd = has & (rt != expect)  # (1) registers to a sibling / no one
                bad_bwd = has & (ra < 0)        # (2) tile no longer civ-owned
                bad = bad_fwd | bad_bwd
                if bool(bad.any()):
                    idx = bad.nonzero(as_tuple=False)[0]
                    b, j, k = int(idx[0]), int(idx[1]), int(idx[2])
                    tile = int(reg[b, j, k])
                    raise AssertionError(
                        f"A-24 registry incoherence: game={b} civ={r} slot={j} "
                        f"{name}[{k}] tile={tile} expected_id={int(self.rc_id[b, r, j])} "
                        f"actual_rc_tile_id={int(self.rc_tile_id[b, tile])} "
                        f"rival_at={int(self.rival_at[b, tile])} turn={self.turn}"
                    )

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

        # --- war weariness: player accrual (B-15) --------------------------------
        # Accrue once per turn while at war with any LIVE rival; decay 4× in
        # peace. Mirrors endTurn's top-of-turn update (game.ts:768-771), which
        # runs AFTER the player's unit orders (the TS replay applies them
        # before endTurn) — a capture that eliminates the last at-war rival
        # must flip ww to DECAY the same turn (B9-R2 hunt, rng 2026006092
        # t172: the pre-orders read held ww at the cap for one extra turn and
        # dropped the whole economy walk a tier). The RL war verb and last
        # turn's rival phase both precede this point, exactly like TS.
        rww = self.rules.war_weariness
        if self.R > 0:
            live = self.rc_alive[:, : self.R].any(dim=2)  # [B, R]
            atwar_now = (self.r_atwar[:, : self.R] & live).any(dim=1)  # [B]
        else:
            atwar_now = torch.zeros(B, dtype=torch.bool, device=dev)
        # B-22 (S3): the player war accrues at the BASELINE rate (×1) — the
        # casus-belli ww differential is rival↔rival only (mirror of game.ts).
        inc = (self.war_weariness + int(rww.get("perTurn", 1))).clamp(max=int(rww.get("cap", 24)))
        dec = (self.war_weariness - int(rww.get("decay", 4))).clamp(min=0)
        self.war_weariness = torch.where(atwar_now, inc, dec)

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
                    # #78 HUNT: an envoy crossing the 1/3/6 thresholds changes
                    # the CAPITAL's yields, which are cached on _eff_version.
                    # Neither increment site bumped it, so the capital could
                    # keep serving pre-crossing yields.
                    self._eff_version += 1
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
            # #70/S4 fallout (parity hunt, seed 9183 t226): the exporter's
            # capital branches key on `city.isCapital`, NOT on the city array
            # slot. Before palace RELOCATION those agreed forever — is_cap was
            # set on column 0 at creation and only ever CLEARED — so this chain
            # was written against column 0. S4 moves the flag to the highest-pop
            # survivor when the capital falls, and TS's builder/settler/district
            # branches follow it; column 0 is by then a dead slot that queues
            # nothing. Resolve the capital COLUMN per game and drive all three
            # capital branches (and the district placement's owner/pop reads)
            # off it. `cap_live` is False for a capital-less empire, which is
            # exactly TS's "no city has isCapital" state.
            cap_col = self.is_cap.long().argmax(dim=1)  # [B]; at most one flag, 0 when none (masked below)
            cap_live = self.is_cap.any(dim=1) & self.alive.gather(1, cap_col.unsqueeze(1)).squeeze(1)
            cap_pop = self.pop.gather(1, cap_col.unsqueeze(1)).squeeze(1)

            # Scripted, in the exporter's else-if order. One builder from the
            # capital FIRST, once (pop >= 2): the capital trains settlers for
            # the rest of the game, so the builder must precede them.
            if self.units_mode and self._builder_idx >= 0 and self.improvements_on:
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
                cap_empty = cap_live & (self.current.gather(1, cap_col.unsqueeze(1)).squeeze(1) == -1)
                want_b = cap_empty & (cap_pop >= 2) & ~b_have & b_job
                # P4/D-10: escalated price (queued count read BEFORE the write)
                b_cost = self._builder_cost(self.builders_trained + (self.current == bcode).sum(dim=1))
                if bool(want_b.any()):
                    rows = want_b.nonzero(as_tuple=True)[0]
                    cc = cap_col[rows]
                    self.current[rows, cc] = bcode
                    self.cur_cost[rows, cc] = b_cost[rows]
                    self.progress[rows, cc] = 0

            # Then a settler when sites remain and pop reached the gate
            # (mirrors the exporter; cost mirrors settlerCost).
            n_cities = self.alive.sum(dim=1)
            queued_settlers = (self.current == self.SETTLER).sum(dim=1)
            cap_empty = cap_live & (self.current.gather(1, cap_col.unsqueeze(1)).squeeze(1) == -1)
            want_settler = cap_empty & (self.settlers_queued < (C - 1)) & (cap_pop >= r.settler_pop_gate)
            s_cost = r.settler_base + r.settler_per_city * (n_cities - 1 + self.settlers + queued_settlers).clamp(min=0).to(self.dtype)
            if bool(want_settler.any()):
                rows = want_settler.nonzero(as_tuple=True)[0]
                cc = cap_col[rows]
                self.current[rows, cc] = self.SETTLER
                self.cur_cost[rows, cc] = s_cost[rows]
                self.progress[rows, cc] = 0
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
                cap_max = torch.div(cap_pop - 1, 3, rounding_mode="floor") + 1  # maxSpecialtyDistricts(capital pop)
                dtaken = torch.zeros(B, dtype=torch.bool, device=dev)  # at most one queue per turn
                for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
                    has_tech = self.techs[:, utech] if utech >= 0 else (self.civics[:, uciv] if uciv >= 0 else torch.ones(B, dtype=torch.bool, device=dev))  # B9-R1: kind-aware
                    cur_cap = self.current.gather(1, cap_col.unsqueeze(1)).squeeze(1)
                    want0 = (cur_cap == -1) & ~dtaken & has_tech & ~self.dscaffold_placed[:, si] & cap_live
                    if not bool(want0.any()):
                        continue
                    # #70/S4 fallout: the capital COLUMN varies per game after a
                    # palace relocation, and _place_district's eligibility
                    # (`owner == c`, `dist[:, c]`, `site[:, c]`) is column-typed
                    # — so split the batch by capital column. C is tiny and each
                    # sub-mask short-circuits; ordering is unchanged because at
                    # most one column is a game's capital.
                    for cc_i in range(C):
                        sel = want0 & (cap_col == cc_i)
                        if not bool(sel.any()):
                            continue
                        spec_count = ((self.district >= 0) & self._is_specialty[self.district.clamp(min=0)] & (self.owner == cc_i) & ~self.district_dead).sum(dim=1)  # LIVE specialty only
                        under_cap = (plc == 1) | (spec_count < cap_max)  # Aqueduct is non-specialty → no cap
                        want = sel & under_cap
                        if not bool(want.any()):
                            continue
                        # P4/D-8: discount read BEFORE the placement registers
                        disc = self._player_district_discounted(di)
                        d_cost_si = torch.where(disc, torch.floor(d_cost * 0.6), d_cost)
                        placed, best = self._place_district(di, want, cc_i, plc)
                        if bool(placed.any()):
                            self.dscaffold_placed[:, si] = self.dscaffold_placed[:, si] | placed
                            self.current[:, cc_i] = torch.where(placed, torch.full_like(self.current[:, cc_i], self.UNIT_BASE + self.NU + si), self.current[:, cc_i])
                            self.cur_cost[:, cc_i] = torch.where(placed, d_cost_si, self.cur_cost[:, cc_i])
                            self.progress[:, cc_i] = torch.where(placed, torch.zeros_like(self.progress[:, cc_i]), self.progress[:, cc_i])
                            self.q_dtile[:, cc_i] = torch.where(placed, best, self.q_dtile[:, cc_i])
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
                        tr_u = tr_u & self._res_avail_mask(self.owner >= 0)  # B-9: bestMilitary respects strategic-resource access
                        base_key = self._p_combat.long() * self.NU - torch.arange(self.NU, device=dev)
                        # #45/B-6: the scripted player's bestMilitary() reads
                        # trainableUnits(state) WITHOUT a city → naval EXCLUDED
                        # (player naval rides #50). Mirror that here.
                        key_u = torch.where(tr_u & (self._p_combat.unsqueeze(0) > 0) & ~self.unit_naval.unsqueeze(0), base_key.unsqueeze(0).expand(B, -1), torch.full((B, self.NU), -(10**9), dtype=torch.long, device=dev))
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
            trainable = trainable & self._res_avail_mask(self.owner >= 0)  # B-9: RL apply re-validates strategic-resource access
            trainable = trainable & ~self._p_faith_only.view(1, -1)  # B6-S2: faith-only never queues (trainableUnits mirror)
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
                    for si, (di, utech, uciv, plc) in enumerate(self._scaffold):
                        has_tech = self.techs[:, utech] if utech >= 0 else (self.civics[:, uciv] if uciv >= 0 else torch.ones(B, dtype=torch.bool, device=dev))  # B9-R1: kind-aware
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
            # #45/B-6: NAVAL units never fortify (TS refreshUnits gates on
            # !naval). B-26 (2026-07-27): barbs CAN be naval now, so the barb
            # pool needs the same gate the other two always had — without it a
            # barb GALLEY dug in for +6 defense that TS never grants it (seed
            # 9212 t80, a 6.0 CS split on every hull the player attacked).
            u_mil = (self._unit_combat[self.u_type] > 0) & ~self._u_naval[self.u_type]
            self.u_fortify = torch.where(
                self.u_alive & u_mil & ~self.u_acted, (self.u_fortify + 1).clamp(max=2),
                torch.where(self.u_alive & u_mil & self.u_acted, torch.zeros_like(self.u_fortify), self.u_fortify),
            )
            v_mil = (self._p_combat[self.v_type] > 0) & ~self.unit_naval[self.v_type]
            self.v_fortify = torch.where(
                self.v_alive & v_mil & ~self.v_acted, (self.v_fortify + 1).clamp(max=2),
                torch.where(self.v_alive & v_mil & self.v_acted, torch.zeros_like(self.v_fortify), self.v_fortify),
            )
            p_mil = (self._p_combat[self.p_type] > 0) & ~self.unit_naval[self.p_type]
            self.p_fortify = torch.where(
                self.p_alive & p_mil & ~self.p_acted, (self.p_fortify + 1).clamp(max=2),
                torch.where(self.p_alive & p_mil & self.p_acted, torch.zeros_like(self.p_fortify), self.p_fortify),
            )
            # the movesLeft reset (TS refreshUnits): a fresh turn begins
            self.p_acted.zero_()
            self.u_acted.zero_()
            self.v_acted.zero_()
            # #70/S3 (B-8): …and with it TS's `granted = full + generalAuraMP`.
            # Frozen HERE, co-located with the acted-flag zeroing, because this
            # block IS the refreshUnits mirror — every later walker reads the
            # snapshot rather than the live (by then possibly moved) generals.
            self._refresh_aura_mp()

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
            # B9-R1: VETERANCY — production toward an ENCAMPMENT item (the
            # district or its buildings) is multiplied FIRST, then the bank
            # adds unmultiplied (game.ts:788-793 order).
            prod_add = t_c[:, 1]
            if self._gov_has_effects and self._encamp_didx >= 0:
                emult_p = self._gov_policy_mods_cached("p", self.civics)[5]
                en_item = (cur_c >= 0) & (cur_c < self.NB) & (self._b_req_district[cur_c.clamp(min=0, max=self.NB - 1)] == self._encamp_didx)
                if self._encamp_si >= 0:
                    en_item = en_item | (cur_c == self.UNIT_BASE + self.NU + self._encamp_si)
                prod_add = torch.where(en_item, t_c[:, 1] * emult_p, t_c[:, 1])
            self.progress[bidx, col] = torch.where(has_item, self.progress[bidx, col] + prod_add + self.prod_bank[bidx, col], self.progress[bidx, col])
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
                # B-17: a trained military unit inherits city `col`'s Encampment training XP (best tier).
                xp_col = (self.buildings[bidx, col, :].long() * self._b_train_xp.view(1, -1)).max(dim=1).values
                self._spawn_player(made_unit, self.site[bidx, col], (cur_c - self.UNIT_BASE).clamp(min=0, max=self.NU - 1), init_xp=xp_col)
                if self._builder_idx >= 0:
                    # P4/D-10: a completed builder moves the cost escalator
                    made_b = made_unit & (cur_c == self.UNIT_BASE + self._builder_idx)
                    self.builders_trained = self.builders_trained + made_b.long()
            # P2: a finished district completes its paved tile (queueDistrict's
            # queue item — the tile was reserved at queue time in q_dtile).
            made_district = done & (cur_c >= self.UNIT_BASE + self.NU)
            if bool(made_district.any()):
                db_ = made_district.nonzero(as_tuple=True)[0]
                _dt = self.q_dtile[db_, col[db_]].clamp(min=0)
                self.district_complete[db_, _dt] = True
                # B-24 (#77): MONUMENTALITY pays era score per SPECIALTY
                # district completed (a city centre is never queued here).
                _mon = torch.zeros(self.B, dtype=torch.bool, device=self.device)
                _mon[db_] = True
                self._dedication_event(0, 0, _mon)
                # B-17 (#71): a completed ENCAMPMENT musters its garrison.
                _enc = self.district[db_, _dt] == self._encamp_didx
                self.encamp_hp[db_, _dt] = torch.where(
                    _enc, torch.full_like(_dt, self._encamp_hp_max), self.encamp_hp[db_, _dt]
                )
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
        # B-20 (#71): TOURISM — accumulated ONCE per turn at the civ level,
        # right after the city loop and BEFORE the loyalty collapses, exactly
        # where TS puts it.
        self.tourism_total = self.tourism_total + self._tourism_of(
            self.gw_writing, self.gw_art, self.gw_music, self.alive, self.owner >= 0, self._civ_era(self.techs, self.civics),
            self.relics,  # B-20 (#73)
            self.techs[:, self._gw_printing_tech] if self._gw_printing_tech >= 0 else None,  # B-20 (#74)
        )
        # B-22 (#75): DIPLOMATIC FAVOR — government TIER + suzerainties, once
        # per turn at the civ level, the TS twin position.
        self.diplo_favor = self.diplo_favor + self._adopted_gov_tier(self.civics) + self._favor_per_suz * self._player_suzerain_count()
        # B-22 (#74): the PLAYER's grievances decay by 1 each turn at peace with
        # EVERY rival (floor 0) — the TS twin position, immediately after the
        # tourism accumulator. NOTE: the +RR_WARMONGER_DOW accrual on declaring
        # has NO GPU twin, because the GPU player has no declare-war verb at all
        # (no diplomacy action exists in the RL space); the CAPTURE accrual does
        # mirror, in _capture_rival_city. Recorded asymmetry — it lands with the
        # #50 player-verb work if a DoW action is ever added.
        self.p_warmonger = torch.where(
            (self.p_warmonger > 0) & ~self.r_atwar.any(dim=1),
            self.p_warmonger - 1,
            self.p_warmonger,
        )

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
            self.gw_writing[rows, c_new] = 0  # B-20: a freshly settled city holds no works
            self.gw_music[rows, c_new] = 0
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
            self.era_score[rows, 0] += self._era_pts["found"]  # B-24: foundCity moment
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
            # A-24: after compaction (the riskiest registry reshuffle) and all
            # of this step's placements/captures — env-gated, so free when off.
            if self._rc_reg_check:
                self._check_rc_registry_invariant()

        # B-18: religious pressure spread — after all foundings/settles/flips and
        # the rc compaction, mirroring TS endTurn's tail (spreadReligiousPressure
        # after the plannedSettles loop). INERT: not read by yields/trace yet.
        self._spread_religious_pressure()

        self.turn += 1
        # B-24 (task #68): era boundary — the eraBoundary mirror (TS runs it
        # right after `state.turn += 1`). S2: every civ's Age for the NEW era
        # comes from the just-ended window's score (Dark < darkT ≤ Normal <
        # goldenT ≤ Golden), THEN the window resets. Padded/dead civs get Dark
        # from score 0 — harmless: their factor only ever multiplies
        # alive-masked zero contributions.
        if self._era_len > 0 and self.turn % self._era_len == 0:
            # B-23 (#71): roads reach the CLASSICAL tier (bridges) at the first
            # era boundary — latched here, the site TS latches it at too.
            self.road_bridged = True
            sc = self.era_score
            _was = self.civ_age  # B-24 (#71): the PREVIOUS age, the Heroic test's substrate
            self.civ_age = torch.where(
                sc < self._era_dark,
                torch.zeros_like(self.civ_age),
                torch.where(sc >= self._era_gold, torch.full_like(self.civ_age, 2), torch.ones_like(self.civ_age)),
            )
            # B-24 (#71): DEDICATIONS. One per civ per era, except the HEROIC
            # age — Dark -> Golden — which grants heroicDedications. The
            # current age alone cannot tell a Heroic age from an ordinary
            # Golden one, which is exactly why prev_age is substrate.
            self.prev_age = _was
            self.dedications = torch.where(
                (_was == 0) & (self.civ_age == 2),
                torch.full_like(self.dedications, self._heroic_ded),
                torch.ones_like(self.dedications),
            )
            # B-24 (#77): commit to NAMED dedications — the TS stateless
            # round-robin twin: catalog index (era + civ + k) % N, taking
            # `dedications[c]` entries (three on a Heroic age).
            _era_i = int(self.turn // self._era_len)
            self.ded_picks[:] = -1
            for _c in range(1 + self.R):
                for _k in range(self.ded_picks.shape[2]):
                    _take = self.dedications[:, _c] > _k
                    self.ded_picks[:, _c, _k] = torch.where(
                        _take,
                        torch.full_like(self.ded_picks[:, _c, _k], (_era_i + _c + _k) % self._n_ded),
                        torch.full_like(self.ded_picks[:, _c, _k], -1),
                    )
            self.era_score[:] = 0
        # B-22 (#76): the WORLD CONGRESS convenes on the same post-increment
        # turn number the era boundary uses — the TS position exactly.
        self._world_congress()
        # B-24 (#71): DEDICATION payouts, every turn, at the TS endTurn
        # position (immediately after eraBoundary). A GOLDEN/HEROIC age pays
        # faith; a DARK or NORMAL age pays era score (the climb-out
        # dedication). Both scale with the dedication COUNT, so a Heroic age
        # pays triple. Zero-draw, integer-only.
        if self._ded_payouts_live and (self._ded_faith > 0 or self._ded_era > 0):
            _gold = self.civ_age == 2
            _fa = torch.where(_gold, self.dedications * self._ded_faith, torch.zeros_like(self.dedications))
            _es = torch.where(_gold, torch.zeros_like(self.dedications), self.dedications * self._ded_era)
            self.era_score = self.era_score + _es
            self.player_faith = self.player_faith + _fa[:, 0].to(self.player_faith.dtype)
            if self.R > 0:
                self.r_faith = self.r_faith + _fa[:, 1 : 1 + self.R].to(self.r_faith.dtype)
        dom = self._domination()  # GV-3
        # B-25 (Round B3): a science victory (3, player) / defeat (4, a rival)
        # set during THIS turn's project completions takes precedence over the
        # domination/score recompute and is preserved — the TS endTurn mirror
        # (game.ts: spaceWon = victoryType∈{3,4} → keep it). In-gate space_won
        # is always False (chain gate-unreachable), so this is byte-identical to
        # the prior recompute.
        space_won = (self.victory_type == 3) | (self.victory_type == 4)  # B-25
        rel = self._religious_victor()  # B6-S3: on the follow set spread just flipped
        # B-25 (#72): CULTURE victory, evaluated only where religion did not
        # already win — the TS `rel >= 0 ? -1 : cultureVictor(state)` twin, so
        # the precedence is space > domination > religion > culture > score.
        cul = torch.where(rel >= 0, torch.full_like(rel, -1), self._culture_victor())
        # B-22/B-25 (#76): DIPLOMATIC victory, evaluated only where neither
        # religion nor culture already won — the TS guard's twin.
        dip = torch.where((rel >= 0) | (cul >= 0), torch.full_like(rel, -1), self._diplomatic_victor())
        self.game_over = space_won | (dom >= 0) | (rel >= 0) | (cul >= 0) | (dip >= 0) | (self.turn > self.rules.turn_limit)  # GV-2/GV-3 + B-25 + B6-S3 + B-22
        # precedence space > domination > religion (5/6) > culture (7/8) > DIPLOMATIC (9/10) > score
        rel_vt = torch.where(rel == 0, torch.full_like(rel, 5), torch.full_like(rel, 6))
        cul_vt = torch.where(cul == 0, torch.full_like(cul, 7), torch.full_like(cul, 8))
        dip_vt = torch.where(dip == 0, torch.full_like(dip, 9), torch.full_like(dip, 10))
        self.victory_type = torch.where(space_won, self.victory_type, torch.where(dom >= 0, torch.full_like(dom, 2), torch.where(rel >= 0, rel_vt, torch.where(cul >= 0, cul_vt, torch.where(dip >= 0, dip_vt, torch.where(self.game_over, torch.ones_like(dom), torch.zeros_like(dom)))))))  # GV-4/GV-3 + B-25 + B6-S3 + B-22
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
            self.civ_age[:, 0].to(self.dtype),  # B-24 S2: the player's Age (compared)
            self.tourism_total.to(self.dtype),  # B-20 (#71): cumulative TOURISM
            self.p_warmonger.to(self.dtype),  # B-22 (#74): the player's GRIEVANCES
            self.diplo_favor.to(self.dtype),  # B-22 (#75): DIPLOMATIC FAVOR
            self.congress_sessions.to(self.dtype),  # B-22 (#76): Congress sessions held
            self.diplo_points.to(self.dtype),  # B-22 (#76): Diplomatic Victory Points
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
                torch.where(live, (self.rc_bldg[:, r].sum(dim=(1, 2)) + (self.rc_is_cap[:, r] & self.rc_alive[:, r]).sum(dim=1)).to(self.dtype), zero),  # B9-R3: +PALACE (trace counts rc.buildings.length)
                torch.where(live, js_round(self.r_treasury[:, r] * 1000).to(self.dtype), zero),  # VP-G1
                torch.where(live, js_round(r_scores[r] * 1000).to(self.dtype), zero),  # GV-1
                # A-19/B-33 (S2): per-pair war bitmask over rival ids (the TS
                # atWarRivals.reduce(|1<<id) twin). rr_war diagonal is false, so
                # the self bit never sets; the (0, r+1) player pair is the atWar
                # column above.
                torch.where(
                    live,
                    sum((self.rr_war[:, r, j].to(self.dtype) * float(1 << j) for j in range(self.R)), zero),
                    zero,
                ),
                # B-24 S2: this rival's Age (compared). PADDED slots zero like
                # the TS !rival zero-pad; real (even cityless) rivals trace
                # their boundary-assigned age — both engines assign ages to
                # EVERY civ at the boundary, dead ones included.
                torch.where(live, self.civ_age[:, r + 1].to(self.dtype), zero),
                torch.where(live, self.r_tourism[:, r].to(self.dtype), zero),  # B-20 (#71): rival TOURISM (appended LAST)
                # #71 COVERAGE: rival FAITH. It was untraced, which is how a
                # +2.0 faith divergence hid behind five green gates — faith
                # only becomes visible when it flips a PURCHASE, so a surplus
                # that crosses no threshold is invisible. Traced now.
                torch.where(live, js_round(self.r_faith[:, r] * 1000).to(self.dtype), zero),
                # #71 COVERAGE: a checksum of this rival's cities' FOLLOWED
                # religion. Only PLAYER cities carry a `followed` trace column,
                # so a rival city converting on a different turn was invisible
                # — the same hole `rFaith` just closed. Sum of (followed+1)
                # over LIVE cities: any single-city change moves it.
                torch.where(live, ((self.rc_followed[:, r] + 1) * self.rc_alive[:, r].long()).sum(dim=1).to(self.dtype), zero),
                # B-25 (#72): rival LIFETIME CULTURE (appended LAST). Traced
                # from the day it lands, the way #71 traced tourism — an
                # untraced accumulator is exactly how the rFaith divergence hid.
                torch.where(live, js_round(self.r_culture[:, r] * 1000).to(self.dtype), zero),
                # B-22 (#75): rival DIPLOMATIC FAVOR (appended LAST).
                torch.where(live, self.r_diplo_favor[:, r].to(self.dtype), zero),
                # B-22 (#76): rival Diplomatic Victory Points (appended LAST).
                torch.where(live, self.r_diplo_points[:, r].to(self.dtype), zero),
                # B-15 (#78 HUNT): rival WAR WEARINESS (appended LAST) — feeds
                # the amenity tier, which scales city yields, which is what
                # rGScore sums. Untraced until now.
                torch.where(live, self.r_war_weariness[:, r].to(self.dtype), zero),
            ]
        zero = torch.zeros(self.B, dtype=self.dtype, device=self.device)
        for c in range(self.C):
            live = self.alive[:, c]
            cols += [
                torch.where(live, self.pop[:, c].to(self.dtype), zero),
                (self.owner == c).sum(dim=1).to(self.dtype),
                # +PALACE: TS traces raw `city.buildings.length`, which INCLUDES
                # the Palace; the GPU has no PALACE column (the exporter filters
                # it — it is modeled as the is_cap yield/housing/amenity term).
                # #70/S4: this used to hardcode `c == 0`, which was only ever
                # true because the Palace could never move. A-9 palace
                # relocation re-crowns the highest-population survivor, so key
                # it off the FLAG — exactly what the rival row above already
                # does with rc_is_cap. (Gate-caught on seed 9183 t219: TS
                # bldgs2 5 vs GPU 4 after the player's capital fell.)
                torch.where(live, self.buildings[:, c].sum(dim=1).to(self.dtype) + (self.is_cap[:, c] & live).to(self.dtype), zero),
                torch.where(live, self.tiles_acquired[:, c].to(self.dtype), zero),
                torch.where(live, js_round(self.food_box[:, c] * 1000), zero),
                torch.where(live, js_round(self.culture_box[:, c] * 1000), zero),
                torch.where(live, self.city_hp[:, c].to(self.dtype), zero),
                torch.where(live, js_round(self.loyalty[:, c] * 1000), zero),
                torch.where(live, self.city_followed[:, c].to(self.dtype), zero),  # B-18: followed religion id (-1 none, dead slot 0)
            ]
        return torch.stack(cols, dim=1)
