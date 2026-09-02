"""WHAT RESEARCH ADDS TO AN IMPROVEMENT'S OWN YIELDS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/imp_research_yields_test.py

The TS twin is tests/cpu/city/improvement-research-yields.test.ts.

CIV6, each the Civilopedia's own "(requires X)" line: the Mine's two
Production raises (Apprenticeship, Industrialization), the Quarry's +2 Gold
(Banking) and +1 Production (Rocketry), the Plantation's +1 Food (Scientific
Theory) and +2 Gold (Globalization), the Lumber Mill's +1 Production (Steel)
and its "+1 Production if adjacent to River", the Pasture's +1 Food
(Stirrups) and +1 Production (Robotics), the Fishing Boats' +2 Gold
(Cartography) and +1 Food (Plastics), and the Camp's +1 Gold (Synthetic
Materials) with the +1 Production and +1 Food Mercantilism carries.

Proven here:
  * every catalog row reaches the wire, techs and CIVICS alike;
  * the raise is the ASKING SEAT's own research — a seat without the row is
    paid nothing on the identical tile;
  * a pillaged improvement is paid none of it;
  * the river column pays only where a river runs, and stacks with Steel;
  * `_tile_add_any` names every half `_seat_tile_add` sums, so no half can
    be dropped by a gate that asked about beliefs alone.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0, ROW = 0, 0
RULES = json.loads((Path(__file__).resolve().parent.parent.parent
                    / "seeder" / "worlds" / "rules.json").read_text())
TECHS = [t["id"] for t in RULES["techs"]]
CIVICS = [c["id"] for c in RULES["civics"]]
IMPS = RULES["improvements"]["ids"]
Y = ["food", "production", "gold", "science", "culture", "faith"]

# (improvement, tech|civic, row id, {yield: amount}) — the Civilopedia's
# lines, ONE entry per research row: Mercantilism's Camp line carries two.
ROWS = [
    ("MINE", "tech", "APPRENTICESHIP", {"production": 1}),
    ("MINE", "tech", "INDUSTRIALIZATION", {"production": 1}),
    ("QUARRY", "tech", "BANKING", {"gold": 2}),
    ("QUARRY", "tech", "ROCKETRY", {"production": 1}),
    ("PLANTATION", "tech", "SCIENTIFIC_THEORY", {"food": 1}),
    ("PLANTATION", "civic", "GLOBALIZATION", {"gold": 2}),
    ("LUMBER_MILL", "tech", "STEEL", {"production": 1}),
    ("PASTURE", "tech", "STIRRUPS", {"food": 1}),
    ("PASTURE", "tech", "ROBOTICS", {"production": 1}),
    ("FISHING_BOATS", "tech", "CARTOGRAPHY", {"gold": 2}),
    ("FISHING_BOATS", "tech", "PLASTICS", {"food": 1}),
    ("CAMP", "tech", "SYNTHETIC_MATERIALS", {"gold": 1}),
    ("CAMP", "civic", "MERCANTILISM", {"production": 1, "food": 1}),
    # CIV6 (Improvement_BonusYieldChanges): the two unique rows at Natural History
    ("SPHINX", "civic", "NATURAL_HISTORY", {"culture": 1}),
    ("ZIGGURAT", "civic", "NATURAL_HISTORY", {"culture": 1}),
    # CIV6 (Predictive Systems): "+1 Production to Quarry, Oil Well, and
    # Oil Rig improvements" — the Oil Rig waits on an improvement the
    # catalog does not hold.
    ("QUARRY", "tech", "PREDICTIVE_SYSTEMS", {"production": 1}),
    ("OIL_WELL", "tech", "PREDICTIVE_SYSTEMS", {"production": 1}),
]


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu",
                               dtype=torch.float64))


def dry_land(sim) -> int:
    """A land plot with no river, free of every pave."""
    ok = (~sim.water[B0] & sim.passable[B0] & ~sim.tile_river[B0]
          & (sim.district[B0] < 0) & (sim.built_wonder[B0] < 0)
          & (sim.centre_slot_at[B0] < 0))
    return int(ok.nonzero()[0])


def research(sim, row: int, kind: str, rid: str) -> None:
    if kind == "tech":
        sim.civ_techs[B0, row, TECHS.index(rid)] = True
    else:
        sim.civ_civics[B0, row, CIVICS.index(rid)] = True
    sim._eff_version += 1


def add_at(sim, row: int, t: int) -> list[float]:
    return sim._seat_tile_add(row)[B0, t].tolist()


# ---------------------------------------------------------------------------


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    want: dict[tuple[str, str, str], list[float]] = {}
    for imp, kind, rid, ys in ROWS:
        k = (kind, rid, imp)
        want.setdefault(k, [0.0] * 6)
        for y, amt in ys.items():
            want[k][Y.index(y)] += float(amt)
    got: dict[tuple[str, str, str], list[float]] = {}
    for tab, kind, names in ((sim._tech_imp_y, "tech", TECHS),
                             (sim._civic_imp_y, "civic", CIVICS)):
        for ri, r in enumerate(tab.tolist()):
            for ii, y in enumerate(r):
                if any(y):
                    got[(kind, names[ri], IMPS[ii])] = y
    assert got == want, f"the wire carries {sorted(got)}, the catalog says {sorted(want)}"
    assert sim._research_imp_y_any
    print(f"  1 wire OK — {len(want)} research rows, techs and civics alike")


def test_paid_per_seat(rules, path) -> None:
    sim = fresh(rules, path)
    assert sim.n_majors >= 2, "this lane needs a second seat to hold the research against"
    t = dry_land(sim)
    researched: set[tuple[str, str]] = set()
    for imp, kind, rid, ys in ROWS:
        sim.improvement[B0, t] = IMPS.index(imp)
        sim.pillaged[B0, t] = False
        sim._eff_version += 1
        before = add_at(sim, ROW, t)
        fresh_rid = (kind, rid) not in researched
        research(sim, ROW, kind, rid)
        researched.add((kind, rid))
        after = add_at(sim, ROW, t)
        want = list(before)
        if fresh_rid:
            for y, amt in ys.items():
                want[Y.index(y)] += amt
        else:
            # the rid came in with an EARLIER row (Predictive Systems raises
            # two improvements) — its raise is already standing in `before`
            std = [0.0] * 6
            for y, amt in ys.items():
                std[Y.index(y)] += float(amt)
            assert all(b >= s for b, s in zip(before, std)),                 f"{imp} at {rid}: standing raise {std} missing from {before}"
        assert after == want, f"{imp} at {rid}: {after} != {want}"
        # the OTHER seat holds none of it, on the identical tile
        assert add_at(sim, 1, t) == [0.0] * 6, f"{rid} paid a seat that never researched it"
        # ...and a pillaged improvement is paid nothing at all
        sim.pillaged[B0, t] = True
        sim._eff_version += 1
        assert add_at(sim, ROW, t) == [0.0] * 6, f"{imp} was paid while pillaged"
        sim.pillaged[B0, t] = False
    print(f"  2 per-seat OK — {len(ROWS)} raises, each on the asker's own research")


def test_river_column(rules, path) -> None:
    sim = fresh(rules, path)
    lm = IMPS.index("LUMBER_MILL")
    assert sim._imp_river_any
    # CIV6 (Ziggurat): "+1 Culture if next to River" rides the same column
    zg = IMPS.index("ZIGGURAT")
    nz = sorted(sim._imp_river_y.nonzero().tolist())
    assert nz == sorted([[lm, 1], [zg, 4]]) and float(sim._imp_river_y[lm, 1]) == 1.0 \
        and float(sim._imp_river_y[zg, 4]) == 1.0, f"the river column reads {nz}"
    wet = int((sim.tile_river[B0] & ~sim.water[B0] & (sim.district[B0] < 0)
               & (sim.centre_slot_at[B0] < 0)).nonzero()[0])
    dry = dry_land(sim)
    for t in (wet, dry):
        sim.improvement[B0, t] = lm
        sim.pillaged[B0, t] = False
    sim._eff_version += 1
    assert add_at(sim, ROW, wet)[1] == 1.0, "no river Production on a river tile"
    assert add_at(sim, ROW, dry)[1] == 0.0, "river Production paid off a river"
    research(sim, ROW, "tech", "STEEL")
    assert add_at(sim, ROW, wet)[1] == 2.0, "Steel and the river do not stack"
    assert add_at(sim, ROW, dry)[1] == 1.0
    sim.pillaged[B0, wet] = True
    sim._eff_version += 1
    assert add_at(sim, ROW, wet)[1] == 0.0, "a pillaged mill was paid its river"
    print("  3 river column OK — only on a river, stacking with Steel, dark under pillage")


def test_gate_names_every_half(rules, path) -> None:
    sim = fresh(rules, path)
    assert sim._tile_add_any(ROW), "the gate refuses a seat the plane can pay"
    # the gate must survive losing ANY single half — a catalog that drops the
    # appeal buildings must not take the research and river halves with it.
    saved = sim._b_appeal_rows
    sim._b_appeal_rows = []
    assert sim._tile_add_any(ROW), "the gate leans on the appeal-building rows alone"
    sim._b_appeal_rows = saved
    print("  4 gate OK — it names every half `_seat_tile_add` sums")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_paid_per_seat(rules, path)
    test_river_column(rules, path)
    test_gate_names_every_half(rules, path)
    print("BATTERY OK imp_research_yields")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
