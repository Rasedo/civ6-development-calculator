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
    settler_base: float
    settler_per_city: float
    settler_pop_gate: int
    score_pop_weight: float
    score_yield_weights: torch.Tensor  # [6]
    boosts: list  # [{target, idx, kind, ...}] — covered-scope eureka conditions
    combat: dict  # barbarian constants + the JS-computed damage-base table
    units: list  # trainable roster [{id, cost, combat, maintenance, civilian, requiresTech}]
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
        settler_base=r["scenario"]["settlerBase"],
        settler_per_city=r["scenario"]["settlerPerCity"],
        settler_pop_gate=r["scenario"]["settlerPopGate"],
        score_pop_weight=r["score"]["popWeight"],
        score_yield_weights=torch.tensor(r["score"]["yieldWeights"], dtype=torch.float64),
        boosts=r.get("boosts", []),
        combat=r.get("combat", {}),
        units=r.get("units", []),
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

# Names of the mutable state tensors (everything reset() restores).
_MUTABLE = [
    "alive", "pop", "food_box", "culture_box", "tiles_acquired", "owner", "workable",
    "buildings", "current", "cur_cost", "progress", "settlers", "settlers_queued",
    "treasury", "science_total", "culture_total", "techs", "civics",
    "tech_boosted", "civic_boosted", "cur_tech", "cur_civic", "tech_prog", "civic_prog",
    "rng_state", "city_hp", "center_at", "barb_at", "pmil_at", "pciv_at",
    "u_alive", "u_type", "u_tile", "u_hp", "next_slot", "camp_tile", "n_camps",
    "p_alive", "p_type", "p_tile", "p_hp", "p_next", "warrior_trained",
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

        # --- static per-city-slot data (sites are known upfront; `alive`
        # gates their use until the city is actually founded) ------------------
        self.site = torch.tensor([[c["site"] for c in f["cities"]] for f in fixtures], dtype=torch.long, device=device)
        self.center_yields = ften(lambda f: [c["centerYields"] for c in f["cities"]], (C, 6))
        self.base_maintenance = ften(lambda f: [c["baseMaintenance"] for c in f["cities"]], (C,))
        water = [
            [
                rules.housing_fresh if c["freshWater"] else rules.housing_coastal if c["coastal"] else rules.housing_none
                for c in f["cities"]
            ]
            for f in fixtures
        ]
        self.water_housing = torch.tensor(water, dtype=dtype, device=device)
        self.coastal = torch.tensor([[bool(c["coastal"]) for c in f["cities"]] for f in fixtures], dtype=torch.bool, device=device)
        self.river_center = torch.tensor(
            [[bool(c["riverAtCenter"]) for c in f["cities"]] for f in fixtures], dtype=torch.bool, device=device
        )
        self.dist = torch.stack(
            [torch.stack([hex_distance_from(self.W, self.H, c["site"]) for c in f["cities"]]) for f in fixtures]
        ).to(device=device, dtype=torch.int16)  # [B, C, T]

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

    def _buildable(self) -> torch.Tensor:
        """[B, C, NB] City Center buildings each city could queue now."""
        rd = self.rules_dev
        unlocked = torch.where(
            rd.b_unlock.unsqueeze(0) >= 0,
            self.techs.gather(1, rd.b_unlock.clamp(min=0).unsqueeze(0).expand(self.B, -1)),
            torch.ones(self.B, self.NB, dtype=torch.bool, device=self.device),
        )
        return unlocked.unsqueeze(1) & ~self.buildings & (~rd.b_river.view(1, 1, -1) | self.river_center.unsqueeze(2))

    def _city_totals(self) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Per-city yields/housing/growth-factor from the current state:
        (total [B, C, 6] alive-masked, housing [B, C], growth_f [B, C]).
        Mirrors computeCityStats — used both inside step() and to score."""
        r, B, C, T, dev = self.rules, self.B, self.C, self.T, self.device
        rd = self.rules_dev

        slot_ids = torch.arange(C, device=dev).view(1, C, 1)
        cand = (
            (self.owner.unsqueeze(1) == slot_ids)
            & self.workable.unsqueeze(1)
            & (self.dist <= 3)
            & (self._arangeT.view(1, 1, T) != self.site.unsqueeze(2))
        )  # [B, C, T]
        tile_score = (self.tile_yields * rd.focus_base).sum(dim=2)  # [B, T]
        score = torch.where(cand, tile_score.unsqueeze(1), torch.tensor(-1e18, dtype=self.dtype, device=dev))
        score = score - self._arangeT.to(self.dtype).view(1, 1, T) * 1e-9  # tie: lowest index first
        k = max(int(self.pop.max().item()), 1)
        top_scores, top_idx = score.topk(k, dim=2)
        take = (torch.arange(k, device=dev).view(1, 1, k) < self.pop.unsqueeze(2)) & (top_scores > -1e17)
        ty = self.tile_yields.unsqueeze(1).expand(B, C, T, 6).gather(2, top_idx.unsqueeze(-1).expand(B, C, k, 6))
        worked_y = (ty * take.unsqueeze(-1).to(self.dtype)).sum(dim=2)  # [B, C, 6]

        bf = self.buildings.to(self.dtype)
        b_y = torch.einsum("bcn,nk->bck", bf, rd.b_yields)
        total = worked_y + self.center_yields + self.palace_slot_yields.unsqueeze(0) + b_y
        popf = self.pop.to(self.dtype)
        total[:, :, 3] += popf * r.citizen_science
        total[:, :, 4] += popf * r.citizen_culture

        amen_have = self.palace_slot_amenities.view(1, C) + torch.einsum("bcn,n->bc", bf, rd.b_amenities)
        amen_need = torch.ceil((popf - 2) / 2).clamp(min=0)
        growth_f, yield_f = self._amenity_factors(amen_have - amen_need)
        total[:, :, 1:] *= yield_f.unsqueeze(2)  # non-food × amenity factor
        maintenance = self.base_maintenance + torch.einsum("bcn,n->bc", bf, rd.b_maintenance)
        total[:, :, 2] -= maintenance

        housing = self.water_housing + self.palace_slot_housing.view(1, C) + torch.einsum("bcn,n->bc", bf, rd.b_housing)

        # Dead slots contribute nothing (their static center yields are preloaded).
        total = total * self.alive.unsqueeze(2).to(self.dtype)
        return total, housing, growth_f

    def empire_score(self) -> torch.Tensor:
        """[B] — mirrors empireScore(state, 'balanced'): Σ over cities of
        population × popWeight + city yields · balanced weights."""
        total, _, _ = self._city_totals()
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
        if side == "barb":
            return barb | pmil | pciv
        if side == "pmil":
            return barb | pmil
        return barb | pciv

    def _first_free_spot(self, at_tile: torch.Tensor, side_of: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Mirrors spawnUnit's placement probe: the anchor if free, else the
        first free neighbor in direction order (the stable distance sort
        keeps exactly that order). side_of: [B] bool — True = civilian.
        Returns (found [B], spot [B])."""
        cand7 = torch.cat([at_tile.unsqueeze(1), self.neigh[at_tile.clamp(min=0)]], dim=1)  # [B, 7]
        okc = cand7.clamp(min=0)
        barb = self.barb_at.gather(1, okc) >= 0
        pmil = self.pmil_at.gather(1, okc) >= 0
        pciv = self.pciv_at.gather(1, okc) >= 0
        dom = torch.where(side_of.unsqueeze(1), pciv, pmil)
        ok7 = (cand7 >= 0) & self.passable.gather(1, okc) & ~barb & ~dom
        first = torch.where(ok7, torch.arange(7, device=self.device), 7).min(dim=1).values
        spot = cand7.gather(1, first.clamp(max=6).unsqueeze(1)).squeeze(1)
        return first < 7, spot

    def _spawn_barb(self, mask: torch.Tensor, at_tile: torch.Tensor, unit_type: int) -> None:
        """Barbarians are military; appends to the slot list, which is what
        keeps GPU unit order identical to state.units array order."""
        if not bool(mask.any()):
            return
        # For a barbarian probe every other unit blocks (foreign or same-domain).
        found, spot = self._first_free_spot(at_tile, torch.zeros(self.B, dtype=torch.bool, device=self.device))
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
        found, spot = self._first_free_spot(at_tile, civ)
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
        """[B, P_MAX, 13] valid orders per player unit: 0–5 step to that
        neighbor, 6–11 melee-attack the barbarian there, 12 hold. Orders are
        RE-validated at execution (both engines identically), because an
        earlier unit's move can invalidate a later unit's order."""
        B, dev = self.B, self.device
        nb = self.neigh[self.p_tile.clamp(min=0).reshape(-1)].reshape(B, P_MAX, 6)
        nbc = nb.clamp(min=0).reshape(B, -1)
        barb = (self.barb_at.gather(1, nbc) >= 0).reshape(B, P_MAX, 6)
        pmil = (self.pmil_at.gather(1, nbc) >= 0).reshape(B, P_MAX, 6)
        pciv = (self.pciv_at.gather(1, nbc) >= 0).reshape(B, P_MAX, 6)
        passable = self.passable.gather(1, nbc).reshape(B, P_MAX, 6)
        on_map = nb >= 0
        civ = self._p_civ[self.p_type]
        dom = torch.where(civ.unsqueeze(2), pciv, pmil)
        alive = self.p_alive.unsqueeze(2)
        move = on_map & passable & ~barb & ~dom & alive
        can_fight = (self._p_combat[self.p_type] > 0).unsqueeze(2)
        attack = on_map & barb & can_fight & alive
        hold = self.p_alive.unsqueeze(2)
        return torch.cat([move, attack, hold], dim=2)

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

            # --- melee attack (6..11) -----------------------------------------
            dirs = (a - 6).clamp(min=0, max=5)
            tgt = nb.gather(1, dirs.unsqueeze(1)).squeeze(1)
            bslot = self.barb_at.gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1)
            att = alive & (a >= 6) & (a < 12) & (tgt >= 0) & (bslot >= 0) & (self._p_combat[self.p_type[:, p]] > 0)
            if bool(att.any()):
                atk_cs = self._p_combat[self.p_type[:, p]]
                b_cs = self._unit_combat[self.u_type.gather(1, bslot.clamp(min=0).unsqueeze(1)).squeeze(1)]
                def_cs = b_cs + self.tdef.gather(1, tgt.clamp(min=0).unsqueeze(1)).squeeze(1)
                d_def = self._damage_roll(att, atk_cs - def_cs)
                d_atk = self._damage_roll(att, def_cs - atk_cs)
                rows = att.nonzero(as_tuple=True)[0]
                bs = bslot[rows]
                self.u_hp[rows, bs] -= d_def[rows]
                self.p_hp[:, p] = torch.where(att, self.p_hp[:, p] - d_atk, self.p_hp[:, p])
                def_dead = torch.zeros_like(att)
                def_dead[rows] = self.u_hp[rows, bs] <= 0
                atk_dead = att & (self.p_hp[:, p] <= 0)
                both = def_dead & atk_dead
                self.p_hp[:, p] = torch.where(both, torch.ones_like(self.p_hp[:, p]), self.p_hp[:, p])  # victor survives
                atk_dead = atk_dead & ~def_dead
                if bool(def_dead.any()):
                    dr = def_dead.nonzero(as_tuple=True)[0]
                    self.barb_at[dr, self.u_tile[dr, bslot[dr]]] = -1
                    self.u_alive[dr, bslot[dr]] = False
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
            cand = self.camp_ok & (self.owner == -1) & ~near_city
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
        pre_alive = self.u_alive.clone()
        grow_type = 1 if self.turn > cb.get("spearmanAfterTurn", 60) else 0
        for k in range(self.K):
            camp = self.camp_tile[:, k]
            active = camp >= 0
            if not bool(active.any()):
                continue
            du = self.pair_dist[camp.clamp(min=0)].gather(1, self.u_tile).to(torch.long)  # [B, U]
            near_any = (pre_alive & (du <= 1)).any(dim=1)
            self._spawn_barb(active & ~near_any, camp, 0)  # empty camp regarrisons
            can_grow = active & near_any & (self.u_alive.sum(dim=1) < self.n_camps * cb.get("maxBarbPerCamp", 3))
            r = self._next_random(can_grow)
            self._spawn_barb(can_grow & (r < cb.get("garrisonGrowChance", 0.1)), camp, grow_type)

        # One guard stays home per camp: first unit (in unit order) within
        # reach of each camp (in camp order), like the TS guard set.
        guard = torch.zeros(B, U_MAX, dtype=torch.bool, device=dev)
        for k in range(self.K):
            camp = self.camp_tile[:, k]
            active = camp >= 0
            if not bool(active.any()):
                continue
            du = self.pair_dist[camp.clamp(min=0)].gather(1, self.u_tile).to(torch.long)
            near = self.u_alive & (du <= 1) & ~guard & active.unsqueeze(1)
            any_near = near.any(dim=1)
            first = near.long().argmax(dim=1)
            rows = any_near.nonzero(as_tuple=True)[0]
            guard[rows, first[rows]] = True

        # Raiders act in unit order: attack something adjacent (unit or
        # city — lowest tile index first, as attackTargets scans the map),
        # else march toward the nearest city. Sequential slots mirror the
        # TS loop — a second raider hitting the same target sees the first
        # one's damage.
        u_high = int(self.next_slot.max().item())
        arange6 = torch.arange(6, device=dev)

        # cityDefenseStrength reads the first military unit standing on the
        # center REGARDLESS of owner — a player garrison, or a barbarian the
        # city was founded under (it can neither attack from range 0 nor
        # step strictly closer, so it stands there forever). Stacking allows
        # at most one military per tile, and nothing here can change center
        # occupancy mid-loop (barbarians attack the CITY at such tiles, not
        # the garrison), so compute it once.
        sitec = self.site.clamp(min=0)
        gm = self.pmil_at.gather(1, sitec)  # [B, C] player military slot at center
        gb = self.barb_at.gather(1, sitec)
        g_cs_p = torch.where(gm >= 0, self._p_combat[self.p_type.gather(1, gm.clamp(min=0))], torch.zeros_like(gm))
        g_cs_b = torch.where(gb >= 0, self._unit_combat[self.u_type.gather(1, gb.clamp(min=0))], torch.zeros_like(gb))
        garrison_cs = torch.where(gm >= 0, g_cs_p, g_cs_b)
        for u in range(u_high):
            act = self.u_alive[:, u] & ~guard[:, u]
            if not bool(act.any()):
                continue
            here = self.u_tile[:, u]
            nb = self.neigh[here]  # [B, 6]
            nbc = nb.clamp(min=0)
            ctr = self.center_at.gather(1, nbc)
            has_unit = (self.pmil_at.gather(1, nbc) >= 0) | (self.pciv_at.gather(1, nbc) >= 0)
            valid = (nb >= 0) & ((ctr >= 0) | has_unit)
            tkey = torch.where(valid, nb, T + 1)
            target_tile = tkey.min(dim=1).values
            attack = act & (target_tile <= T)
            ttc = target_tile.clamp(max=T - 1)
            # meleeAttack routes center tiles to the CITY even when a
            # garrison unit stands there.
            tgt_city = self.center_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
            city_att = attack & (tgt_city >= 0)
            unit_att = attack & (tgt_city < 0)

            if bool(city_att.any()):
                slot = tgt_city
                atk_cs = self._unit_combat[self.u_type[:, u]]
                g_cs = garrison_cs.gather(1, slot.clamp(min=0).unsqueeze(1)).squeeze(1)
                def_cs = torch.maximum(g_cs, torch.full_like(g_cs, 15)) + torch.div(
                    self.pop.gather(1, slot.clamp(min=0).unsqueeze(1)).squeeze(1), 2, rounding_mode="floor"
                )
                d_city = self._damage_roll(city_att, atk_cs - def_cs)
                d_self = self._damage_roll(city_att, def_cs - atk_cs)
                rows = city_att.nonzero(as_tuple=True)[0]
                cs = slot[rows]
                self.city_hp[rows, cs] -= d_city[rows]
                self.u_hp[:, u] = torch.where(city_att, self.u_hp[:, u] - d_self, self.u_hp[:, u])
                died = city_att & (self.u_hp[:, u] <= 0)
                if bool(died.any()):
                    dr = died.nonzero(as_tuple=True)[0]
                    self.barb_at[dr, self.u_tile[dr, u]] = -1
                    self.u_alive[:, u] = self.u_alive[:, u] & ~died
                sacked_rows = rows[self.city_hp[rows, cs] <= 0]
                if len(sacked_rows) > 0:
                    sc = slot[sacked_rows]
                    self.pop[sacked_rows, sc] = ((self.pop[sacked_rows, sc] * 3) // 4).clamp(min=1)
                    loss = torch.minimum(
                        torch.tensor(100.0, dtype=self.dtype, device=dev),
                        js_round(self.treasury[sacked_rows] * 0.2).to(self.dtype),
                    )
                    self.treasury[sacked_rows] -= loss
                    self.city_hp[sacked_rows, sc] = round(city_max_hp / 2)

            if bool(unit_att.any()):
                # Defender: the military unit there, else the civilian.
                dm = self.pmil_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
                dc_ = self.pciv_at.gather(1, ttc.unsqueeze(1)).squeeze(1)
                mil_att = unit_att & (dm >= 0)
                civ_att = unit_att & (dm < 0) & (dc_ >= 0)
                if bool(mil_att.any()):
                    atk_cs = self._unit_combat[self.u_type[:, u]]
                    p_cs = self._p_combat[self.p_type.gather(1, dm.clamp(min=0).unsqueeze(1)).squeeze(1)]
                    def_cs = p_cs + self.tdef.gather(1, ttc.unsqueeze(1)).squeeze(1)
                    d_def = self._damage_roll(mil_att, atk_cs - def_cs)
                    d_atk = self._damage_roll(mil_att, def_cs - atk_cs)
                    rows = mil_att.nonzero(as_tuple=True)[0]
                    ds = dm[rows]
                    self.p_hp[rows, ds] -= d_def[rows]
                    self.u_hp[:, u] = torch.where(mil_att, self.u_hp[:, u] - d_atk, self.u_hp[:, u])
                    def_dead = torch.zeros_like(mil_att)
                    def_dead[rows] = self.p_hp[rows, ds] <= 0
                    atk_dead = mil_att & (self.u_hp[:, u] <= 0)
                    both = def_dead & atk_dead
                    self.u_hp[:, u] = torch.where(both, torch.ones_like(self.u_hp[:, u]), self.u_hp[:, u])  # victor survives
                    atk_dead = atk_dead & ~def_dead
                    if bool(def_dead.any()):
                        dr = def_dead.nonzero(as_tuple=True)[0]
                        self.pmil_at[dr, ttc[dr]] = -1
                        self.p_alive[dr, dm[dr]] = False
                    if bool(atk_dead.any()):
                        ar = atk_dead.nonzero(as_tuple=True)[0]
                        self.barb_at[ar, here[ar]] = -1
                        self.u_alive[:, u] = self.u_alive[:, u] & ~atk_dead
                    # Advance if the tile emptied (a civilian teammate blocks).
                    adv = def_dead & ~atk_dead & ~self._blocked_for(ttc.unsqueeze(1), "barb").squeeze(1)
                    if bool(adv.any()):
                        vr = adv.nonzero(as_tuple=True)[0]
                        self.barb_at[vr, here[vr]] = -1
                        self.u_tile[vr, u] = ttc[vr]
                        self.barb_at[vr, ttc[vr]] = u
                if bool(civ_att.any()):
                    # A lone civilian is killed outright — no damage rolls.
                    rows = civ_att.nonzero(as_tuple=True)[0]
                    ds = dc_[rows]
                    self.pciv_at[rows, ttc[rows]] = -1
                    self.p_alive[rows, ds] = False
                    adv = civ_att & ~self._blocked_for(ttc.unsqueeze(1), "barb").squeeze(1)
                    if bool(adv.any()):
                        vr = adv.nonzero(as_tuple=True)[0]
                        self.barb_at[vr, here[vr]] = -1
                        self.u_tile[vr, u] = ttc[vr]
                        self.barb_at[vr, ttc[vr]] = u

            # March: nearest alive city (ties → founding order), then the
            # passable free neighbor closest to it (ties → direction order),
            # moving only if strictly closer.
            march = act & ~attack
            if not bool(march.any()):
                continue
            dc = self.pair_dist[here].gather(1, self.site).to(torch.long)  # [B, C] dist to each slot's site
            ckey = torch.where(self.alive, dc * 16 + torch.arange(self.C, device=dev), 10**9)
            tgt = self.site.gather(1, ckey.argmin(dim=1, keepdim=True)).squeeze(1)
            d_here = self.pair_dist[here].gather(1, tgt.unsqueeze(1)).squeeze(1).to(torch.long)
            step_ok = (nb >= 0) & self.passable.gather(1, nbc) & ~self._blocked_for(nb, "barb")
            d_nb = self.pair_dist[tgt].gather(1, nbc).to(torch.long)  # dist(neighbor, target); symmetric
            skey = torch.where(step_ok, d_nb * 8 + arange6, 10**9)
            best = skey.min(dim=1).values
            move = march & (best < 10**9) & (torch.div(best, 8, rounding_mode="floor") < d_here)
            if bool(move.any()):
                dest = nb.gather(1, (best % 8).clamp(max=5).unsqueeze(1)).squeeze(1)
                rows = move.nonzero(as_tuple=True)[0]
                self.barb_at[rows, here[rows]] = -1
                self.barb_at[rows, dest[rows]] = u
                self.u_tile[rows, u] = dest[rows]

        # Cities heal +20 when no hostile stands adjacent.
        nb_c = self.neigh[self.site.clamp(min=0)]  # [B, C, 6]
        adj = (self.barb_at.gather(1, nb_c.clamp(min=0).reshape(B, -1)) >= 0).reshape(B, self.C, 6) & (nb_c >= 0)
        besieged = adj.any(dim=2)
        healable = self.alive & (self.city_hp < city_max_hp) & ~besieged
        self.city_hp = torch.where(healable, (self.city_hp + cb.get("cityHealPerTurn", 20)).clamp(max=city_max_hp), self.city_hp)

    # --- one full turn -----------------------------------------------------------

    def step(
        self,
        production: torch.Tensor | None = None,
        tech: torch.Tensor | None = None,
        civic: torch.Tensor | None = None,
        units: torch.Tensor | None = None,
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
        """
        r, B, C, T, dev = self.rules, self.B, self.C, self.T, self.device
        rd = self.rules_dev

        # --- player unit orders (before the turn advances) ----------------------
        if units is not None and self.units_mode:
            self._apply_unit_actions(units)

        # --- production choice ------------------------------------------------
        if production is None:
            # Scripted: the capital trains a settler when sites remain and pop
            # reached the gate (mirrors the exporter; cost mirrors settlerCost).
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
            friendly = self.owner.gather(1, self.p_tile.clamp(min=0)) >= 0
            p_heal = torch.where(friendly, heal, 5)
            self.p_hp = torch.where(self.p_alive, (self.p_hp + p_heal).clamp(max=cap), self.p_hp)

        # --- worked tiles + city yields ------------------------------------------
        total, housing, growth_f = self._city_totals()
        popf = self.pop.to(self.dtype)

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
        y_sum = self.tile_yields.sum(dim=2)
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
                cand_b = (self.owner == -1) & (self.dist[:, c] <= 5) & adj_own
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

        # --- the hostile world (after the city loop, before research) ----------------------
        if self.units_mode:
            self.treasury = self.treasury - (self.p_alive.to(self.dtype) * self._p_maint[self.p_type]).sum(dim=1)
            self._barbarian_phase()

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
        # Slots fill strictly in order, so scanning ascending handles several
        # foundings in one turn: founding slot c makes slot c+1 eligible.
        for c in range(1, C):
            found = (self.settlers > 0) & self.alive[:, c - 1] & ~self.alive[:, c]
            if not found.any():
                continue
            rows = found.nonzero(as_tuple=True)[0]
            s_idx = self.site[rows, c]
            self.alive[rows, c] = True
            self.pop[rows, c] = 1
            self.food_box[rows, c] = 0
            self.culture_box[rows, c] = 0
            self.tiles_acquired[rows, c] = 0
            self.current[rows, c] = -1
            self.progress[rows, c] = 0
            self.settlers[rows] -= 1
            # Claim the center (unconditionally, as foundCity does) plus any
            # unowned first-ring tiles; the center becomes a district tile.
            self.owner[rows, s_idx] = c
            self.workable[rows, s_idx] = False
            self.center_at[rows, s_idx] = c
            nb = self.neigh[s_idx]  # [R, 6]
            for d in range(6):
                n_d = nb[:, d]
                ok = (n_d >= 0) & (self.owner[rows, n_d.clamp(min=0)] == -1)
                self.owner[rows[ok], n_d[ok]] = c

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
        ]
        for c in range(self.C):
            cols += [
                self.pop[:, c].to(self.dtype),
                (self.owner == c).sum(dim=1).to(self.dtype),
                self.buildings[:, c].sum(dim=1).to(self.dtype) + (1 if c == 0 else 0),  # +PALACE in the capital
                self.tiles_acquired[:, c].to(self.dtype),
                torch.round(self.food_box[:, c] * 1000),
                torch.round(self.culture_box[:, c] * 1000),
                torch.where(self.alive[:, c], self.city_hp[:, c], torch.zeros_like(self.city_hp[:, c])).to(self.dtype),
            ]
        return torch.stack(cols, dim=1)
