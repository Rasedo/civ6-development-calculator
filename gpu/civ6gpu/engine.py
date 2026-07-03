"""Vectorized (batched) port of the TypeScript engine's economic core.

Phase 1 scope — one auto-settled city per game, peaceful world:
tile yields → citizen assignment → city stats (housing, amenities) →
growth/starvation → production (City Center buildings) → cultural border
expansion → research with eureka discounts. Every formula mirrors
src/core/*.ts; gpu/parity_test.py proves turn-exact agreement against
traces recorded from the real engine (scripts/export-gpu.ts).

All state lives in [B, ...] torch tensors, so thousands of games step in
lockstep — float64 on CPU for parity, float32 on CUDA for throughput.
"""

from __future__ import annotations

import json
import math
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

GROWTH_LOOPS = 1  # TS grows at most one pop per turn
BORDER_LOOPS = 4  # TS expands in a while-loop; 4 covers any realistic culture
RESEARCH_LOOPS = 4


class BatchSim:
    """B games stepping in lockstep. Build from fixtures (parity) or by
    replicating one fixture B times (benchmark)."""

    def __init__(self, fixtures: list[dict], rules: Rules, device: str = "cpu", dtype=torch.float64):
        self.rules = rules
        self.device = device
        self.dtype = dtype
        B = len(fixtures)
        f0 = fixtures[0]
        self.B, self.W, self.H = B, f0["width"], f0["height"]
        T = self.W * self.H
        self.T = T

        def ften(getter, shape_tail=()):
            return torch.tensor([getter(f) for f in fixtures], dtype=dtype, device=device).reshape(B, *shape_tail)

        self.tile_yields = ften(lambda f: [t["y"] for t in f["tiles"]], (T, 6))
        self.workable = torch.tensor([[t["workable"] for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.res_priority = torch.tensor([[t["res"] for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.center = torch.tensor([f["centerIndex"] for f in fixtures], dtype=torch.long, device=device)
        self.center_yields = ften(lambda f: f["centerYields"], (6,))
        self.base_maintenance = ften(lambda f: f["baseMaintenance"])
        water = [
            rules.housing_fresh if f["freshWater"] else rules.housing_coastal if f["coastal"] else rules.housing_none
            for f in fixtures
        ]
        self.water_housing = torch.tensor(water, dtype=dtype, device=device)
        self.river_center = torch.tensor([bool(f["riverAtCenter"]) for f in fixtures], dtype=torch.bool, device=device)
        self.owned = torch.tensor([f["ownedInit"] for f in fixtures], dtype=torch.bool, device=device)

        # Distance-from-center and neighbors are per-map (same size for all).
        dists = torch.stack([hex_distance_from(self.W, self.H, f["centerIndex"]) for f in fixtures]).to(device)
        self.dist = dists  # [B, T]
        self.neigh = neighbor_table(self.W, self.H).to(device)  # [T, 6]

        # Boost schedules: [turn, kind(0 tech/1 civic), idx] per game.
        self.boost_schedule = [f.get("boostSchedule", []) for f in fixtures]

        NB, NT, NC = len(rules.b_cost), len(rules.t_cost), len(rules.c_cost)
        self.rules_dev = Rules(
            **{
                k: (v.to(device=device, dtype=dtype) if isinstance(v, torch.Tensor) and v.is_floating_point() else v.to(device) if isinstance(v, torch.Tensor) else v)
                for k, v in vars(rules).items()
            }
        )

        z = lambda *shape, dt=dtype: torch.zeros(*shape, dtype=dt, device=device)
        self.turn = 1
        self.pop = torch.ones(B, dtype=torch.long, device=device)
        self.food_box = z(B)
        self.culture_box = z(B)
        self.tiles_acquired = torch.zeros(B, dtype=torch.long, device=device)
        self.treasury = z(B)
        self.science_total = z(B)
        self.culture_total = z(B)
        self.buildings = torch.zeros(B, NB, dtype=torch.bool, device=device)
        self.current = torch.full((B,), -1, dtype=torch.long, device=device)
        self.progress = z(B)
        self.techs = torch.zeros(B, NT, dtype=torch.bool, device=device)
        self.civics = torch.zeros(B, NC, dtype=torch.bool, device=device)
        self.tech_boosted = torch.zeros(B, NT, dtype=torch.bool, device=device)
        self.civic_boosted = torch.zeros(B, NC, dtype=torch.bool, device=device)
        self.cur_tech = torch.full((B,), -1, dtype=torch.long, device=device)
        self.cur_civic = torch.full((B,), -1, dtype=torch.long, device=device)
        self.tech_prog = z(B)
        self.civic_prog = z(B)

        # Precomputed static prereq masks would race with completion inside a
        # turn; availability is recomputed per loop (cheap: NT ≤ 32).
        self._prereq_t = self._prereq_matrix(rules.t_prereqs, NT)
        self._prereq_c = self._prereq_matrix(rules.c_prereqs, NC)
        self._arangeT = torch.arange(T, device=device)

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

    # --- one full turn -----------------------------------------------------------

    def step(self) -> None:
        r, B, dev = self.rules, self.B, self.device

        # Boost schedule fires at the start of the turn (mirrors detectBoosts
        # running before research advances).
        for b, sched in enumerate(self.boost_schedule):
            for e in sched:
                if e["turn"] == self.turn:
                    (self.tech_boosted if e["kind"] == "tech" else self.civic_boosted)[b, e["idx"]] = True

        # --- scripted production pick (cheapest available building) -------------
        unlocked = torch.where(
            self.rules_dev.b_unlock.unsqueeze(0) >= 0,
            self.techs.gather(1, self.rules_dev.b_unlock.clamp(min=0).unsqueeze(0).expand(B, -1)),
            torch.ones(B, len(r.b_cost), dtype=torch.bool, device=dev),
        )
        buildable = unlocked & ~self.buildings & (~self.rules_dev.b_river.unsqueeze(0) | self.river_center.unsqueeze(1))
        first = torch.where(buildable, torch.arange(len(r.b_cost), device=dev).unsqueeze(0), len(r.b_cost)).min(dim=1).values
        pick = torch.where((self.current == -1) & (first < len(r.b_cost)), first, self.current)
        self.progress = torch.where((self.current == -1) & (pick != -1), torch.zeros_like(self.progress), self.progress)
        self.current = pick

        # --- worked tiles + city yields ------------------------------------------
        cand = self.owned & self.workable & (self.dist <= 3) & (self._arangeT.unsqueeze(0) != self.center.unsqueeze(1))
        score = (self.tile_yields * self.rules_dev.focus_base).sum(dim=2)
        score = torch.where(cand, score, torch.tensor(-1e18, dtype=self.dtype, device=dev))
        score = score - self._arangeT.to(self.dtype) * 1e-9  # tie: lowest index first
        k = int(self.pop.max().item())
        top_scores, top_idx = score.topk(k, dim=1)
        take = (torch.arange(k, device=dev).unsqueeze(0) < self.pop.unsqueeze(1)) & (top_scores > -1e17)
        worked_y = (self.tile_yields.gather(1, top_idx.unsqueeze(2).expand(-1, -1, 6)) * take.unsqueeze(2)).sum(dim=1)

        b_y = (self.buildings.to(self.dtype) @ self.rules_dev.b_yields)
        total = worked_y + self.center_yields + self.rules_dev.palace_yields.unsqueeze(0) + b_y
        popf = self.pop.to(self.dtype)
        total[:, 3] += popf * r.citizen_science
        total[:, 4] += popf * r.citizen_culture

        amen_have = self.rules.palace_amenities + (self.buildings.to(self.dtype) @ self.rules_dev.b_amenities)
        amen_need = torch.ceil((popf - 2) / 2).clamp(min=0)
        growth_f, yield_f = self._amenity_factors(amen_have - amen_need)
        total[:, 1:] *= yield_f.unsqueeze(1)  # non-food × amenity factor
        maintenance = self.base_maintenance + (self.buildings.to(self.dtype) @ self.rules_dev.b_maintenance)
        total[:, 2] -= maintenance

        housing = self.water_housing + r.palace_housing + (self.buildings.to(self.dtype) @ self.rules_dev.b_housing)

        # --- production ------------------------------------------------------------
        has_item = self.current >= 0
        self.progress = torch.where(has_item, self.progress + total[:, 1], self.progress)
        cost = self.rules_dev.b_cost.gather(0, self.current.clamp(min=0))
        done = has_item & (self.progress >= cost)
        if done.any():
            rows = done.nonzero(as_tuple=True)[0]
            self.buildings[rows, self.current[rows]] = True
            self.current = torch.where(done, torch.full_like(self.current, -1), self.current)
            self.progress = torch.where(done, torch.zeros_like(self.progress), self.progress)  # overflow drops (queue empty)

        # --- growth ------------------------------------------------------------------
        surplus = total[:, 0] - popf * r.food_per_citizen
        head = (housing - popf)
        hf = torch.where(head >= 2, 1.0, torch.where(head >= 1, 0.5, 0.25).to(self.dtype)).to(self.dtype)
        effective = torch.where(surplus > 0, surplus * hf * growth_f, surplus)
        self.food_box = self.food_box + effective
        need = self._growth_needed(self.pop)
        grow = self.food_box >= need
        self.pop = torch.where(grow, self.pop + 1, self.pop)
        self.food_box = torch.where(grow, self.food_box - need, self.food_box)
        starve = ~grow & (self.food_box < 0)
        self.pop = torch.where(starve, (self.pop - 1).clamp(min=1), self.pop)
        self.food_box = torch.where(starve, torch.zeros_like(self.food_box), self.food_box)

        # --- borders --------------------------------------------------------------------
        self.culture_box = self.culture_box + total[:, 4]
        y_sum = self.tile_yields.sum(dim=2)
        for _ in range(BORDER_LOOPS):
            cost_b = self._border_cost(self.tiles_acquired)
            ready = self.culture_box >= cost_b
            if not ready.any():
                break
            adj_owned = self.owned.gather(1, self.neigh.clamp(min=0).reshape(1, -1).expand(B, -1)).reshape(B, self.T, 6)
            adj_owned = (adj_owned & (self.neigh >= 0).unsqueeze(0)).any(dim=2)
            cand_b = ~self.owned & (self.dist <= 5) & adj_owned
            # order: dist asc, resource priority desc, yield sum desc, index asc
            key = (
                self.dist.to(self.dtype) * 1e12
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
                self.owned[rows, best[rows]] = True
                self.culture_box = torch.where(expand, self.culture_box - cost_b, self.culture_box)
                self.tiles_acquired = torch.where(expand, self.tiles_acquired + 1, self.tiles_acquired)
            capped = ready & ~has_cand
            self.culture_box = torch.where(capped, torch.minimum(self.culture_box, cost_b), self.culture_box)
            if not (ready & has_cand).any():
                break

        # --- empire accumulators ----------------------------------------------------------
        self.treasury = self.treasury + total[:, 2]
        self.science_total = self.science_total + total[:, 3]
        self.culture_total = self.culture_total + total[:, 4]

        # --- research ---------------------------------------------------------------------
        self.cur_tech = self._auto_pick(self.cur_tech, self.techs, self.tech_boosted, self.rules_dev.t_cost, self._prereq_t.to(dev))
        self.tech_prog = self.tech_prog + total[:, 3]
        for _ in range(RESEARCH_LOOPS):
            active = self.cur_tech >= 0
            eff = self._eff_cost(
                self.rules_dev.t_cost.gather(0, self.cur_tech.clamp(min=0)),
                self.tech_boosted.gather(1, self.cur_tech.clamp(min=0).unsqueeze(1)).squeeze(1),
            )
            fin = active & (self.tech_prog >= eff)
            if not fin.any():
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.techs[rows, self.cur_tech[rows]] = True
            self.tech_prog = torch.where(fin, self.tech_prog - eff, self.tech_prog)
            self.cur_tech = torch.where(fin, torch.full_like(self.cur_tech, -1), self.cur_tech)
            self.cur_tech = self._auto_pick(self.cur_tech, self.techs, self.tech_boosted, self.rules_dev.t_cost, self._prereq_t.to(dev))

        self.cur_civic = self._auto_pick(self.cur_civic, self.civics, self.civic_boosted, self.rules_dev.c_cost, self._prereq_c.to(dev))
        self.civic_prog = self.civic_prog + total[:, 4]
        for _ in range(RESEARCH_LOOPS):
            active = self.cur_civic >= 0
            eff = self._eff_cost(
                self.rules_dev.c_cost.gather(0, self.cur_civic.clamp(min=0)),
                self.civic_boosted.gather(1, self.cur_civic.clamp(min=0).unsqueeze(1)).squeeze(1),
            )
            fin = active & (self.civic_prog >= eff)
            if not fin.any():
                break
            rows = fin.nonzero(as_tuple=True)[0]
            self.civics[rows, self.cur_civic[rows]] = True
            self.civic_prog = torch.where(fin, self.civic_prog - eff, self.civic_prog)
            self.cur_civic = torch.where(fin, torch.full_like(self.cur_civic, -1), self.cur_civic)
            self.cur_civic = self._auto_pick(self.cur_civic, self.civics, self.civic_boosted, self.rules_dev.c_cost, self._prereq_c.to(dev))

        self.turn += 1

    # --- parity trace row (matches scripts/export-gpu.ts encoding) ----------------

    def trace_row(self) -> torch.Tensor:
        return torch.stack(
            [
                torch.full((self.B,), float(self.turn), dtype=self.dtype, device=self.device),
                self.pop.to(self.dtype),
                torch.round(self.food_box * 1000),
                torch.round(self.treasury * 1000),
                torch.round(self.science_total * 1000),
                torch.round(self.culture_total * 1000),
                self.techs.sum(dim=1).to(self.dtype),
                self.civics.sum(dim=1).to(self.dtype),
                self.owned.sum(dim=1).to(self.dtype),
                self.buildings.sum(dim=1).to(self.dtype) + 1,  # +PALACE
                torch.round(self.culture_box * 1000),
            ],
            dim=1,
        )
