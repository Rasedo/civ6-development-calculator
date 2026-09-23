"""THE GOVERNOR'S PROJECT PERCENT — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/project_governor_test.py

The TS twin is tests/cpu/city/project-governor.test.ts.

CIV6 (Arms Race Proponent): one MODIFIER_SINGLE_CITY_ADJUST_PROJECT_PRODUCTION
row, Amount 30, on each of PROJECT_MANHATTAN_PROJECT, PROJECT_OPERATION_IVY,
PROJECT_BUILD_NUCLEAR_DEVICE and PROJECT_BUILD_THERMONUCLEAR_DEVICE; (Space
Initiative) MODIFIER_SINGLE_CITY_ADJUST_SPACE_RACE_PROJECTS_PRODUCTION, Amount
30, on every project the install marks SpaceRace.

Proven here, for each promotion in turn: every project of its set fills x1.3
in the governed city, x1 in the seat's other city, and every other project
fills x1 in the governed city. The sets are read off the catalog columns (the
devices and their prerequisites; the space-race chain and the lasers), never
off the promotion row under test.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
from warmup import settle_all, plant_city  # noqa: E402

B0, ROW = 0, 0
PROD = 100.0


def promo_id(sim, pid: str) -> int:
    gp = sim.rules.governor_promotions
    hit = [i for i, p in enumerate(gp) if p["id"] == pid]
    assert len(hit) == 1, f"{pid} is rows {hit}"
    return hit[0]


def seat_gov(sim, promo: int, col: int) -> None:
    g = int(sim._gpromo_gov[promo])
    sim.civ_gov_appointed[B0, ROW, g] = True
    sim.civ_gov_city[B0, ROW, g] = int(sim.city_id[B0, ROW, col])
    sim.civ_gov_establish[B0, ROW, g] = 0
    sim.civ_gov_promos[B0, ROW, g] = 1 << promo
    sim._eff_version += 1


def fill(sim, col: int, pi: int) -> float:
    """one turn's hammers into project `pi` at the head of city `col`."""
    sim.city_current[B0, ROW, col, 0] = sim.PROJECT_BASE + pi
    sim.city_progress[B0, ROW, col, 0] = 0.0
    sim.city_cost[B0, ROW, col, 0] = 1.0e9
    sim._seat_city_produce(ROW, torch.tensor([col]), torch.tensor([True]),
                           torch.tensor([PROD], dtype=torch.float64))
    return float(sim.city_progress[B0, ROW, col, 0])


def main() -> int:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    base = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    plant_city(base, ROW)
    assert bool(base.city_alive[B0, ROW, 1]), "the seat needs two cities"
    snap = base.snapshot()

    rows = base._proj_rows
    nuclear = {i for i, r in enumerate(rows) if int(r["wmd"]) > 0}
    nuclear |= {int(rows[i]["rp"]) for i in list(nuclear)}
    assert len(nuclear) == 4, f"the nuclear chain is {sorted(nuclear)}"
    space = {i for i, r in enumerate(rows) if int(r["spc"]) or int(r["ls"])}
    assert len(space) == 6, f"the space-race set is {sorted(space)}"

    for n, (pid, want) in enumerate((("ARMS_RACE_PROPONENT", nuclear),
                                     ("SPACE_INITIATIVE", space)), start=1):
        P = promo_id(base, pid)
        for pi in range(len(rows)):
            base.restore(snap)
            plain = [fill(base, c, pi) for c in (0, 1)]
            assert plain[0] > 0 and plain[1] > 0, f"project {pi} fills nothing ungoverned"
            base.restore(snap)
            seat_gov(base, P, 0)
            got = [fill(base, c, pi) for c in (0, 1)]
            k = 1.3 if pi in want else 1.0
            assert abs(got[0] - plain[0] * k) < 1e-9, (
                f"{pid} x{got[0] / plain[0]} on project {pi} in its city, wanted x{k}")
            assert got[1] == plain[1], f"{pid} reached project {pi} in the OTHER city"
        print(f"  {n} {pid} OK — x1.3 on {sorted(want)} in its city only, x1 elsewhere")

    print("BATTERY OK project_governor")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
