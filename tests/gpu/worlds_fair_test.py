"""THE WORLD'S FAIR, GPU side — the second scored competition.

CIV6 (Expansion2_Emergencies.xml, EMERGENCY_WORLDS_FAIR): Duration 29,
LockoutTime 60; scored 1 point per Great Person POINT of every class earned
during the window (eight `WORLDS_FAIR_SCORE_GPP_*` rows, ScoreAmount 1 — the
Prophet is not among them). FIRST PLACE +1 Diplomatic Victory point and +100
Great Person points; TOP TIER +50 Favor and 2 random Industrial..Information
civic boosts; BOTTOM TIER 1 such boost.

`scoreTurn` / `payPodium`'s twins, driven directly: the driver votes a
competition rarely, so this is the lane that reaches it.

Run: PYTHONIOENCODING=utf-8 python tests/gpu/worlds_fair_test.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
from warmup import settle_all  # noqa: E402

B0 = 0


def build(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def main() -> int:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = build(rules, paths[0])
    print(f"worlds_fair_test on {paths[0].name}")

    k = sim._comp_fair
    assert k >= 0, "the catalog carries no WORLDS_FAIR row"
    row = sim._comps[k]

    # 1 — the install's own reward columns
    assert row["scored"] == "gpp", f"the Fair scores {row['scored']}, not gpp"
    assert int(row["gold"]) == 1 and int(row["goldGpp"]) == 100, "first place pays 1 DV point + 100 GPP"
    assert int(row["silver"]) == 50 and int(row["bronze"]) == 0, "the favor tiers are 50 / 0"
    assert int(row["silverBoosts"]) == 2 and int(row["bronzeBoosts"]) == 1, "the boosts are 2 / 1"
    assert int(row["boostLo"]) >= 0 and int(row["boostHi"]) > int(row["boostLo"]), (
        "the boost era window is empty")
    # the Prophet is not one of the eight classes it scores
    assert sim._prophet_cls not in sim._fair_gp_classes, "the Prophet is scored"
    assert len(sim._fair_gp_classes) == 8, (
        f"the Fair scores {len(sim._fair_gp_classes)} classes, wanted 8")
    print(f"  1 catalog OK — 8 classes, gold 1 DV + {int(row['goldGpp'])} GPP, tiers 50/0, boosts 2/1")

    # 2 — the SCORE is the points EARNED this turn, and the stash clears
    nrow = sim.n_majors
    sim.comp_kind[B0] = k
    sim.comp_left[B0] = 5
    sim.comp_score[B0] = 0
    sim.comp_member[B0, :nrow] = True
    sci = sim._fair_gp_classes[0]
    sim.civ_gpp_turn[B0, 0, sci] = 7.0
    sim.civ_gpp_turn[B0, 1, sci] = 3.0
    sim.civ_gpp_turn[B0, 0, sim._prophet_cls] = 99.0  # never scored
    sim._competition_score()
    assert float(sim.comp_score[B0, 0]) == 7.0, (
        f"row 0 scored {float(sim.comp_score[B0, 0])}, wanted the 7 it earned")
    assert float(sim.comp_score[B0, 1]) == 3.0, "row 1 scored the wrong points"
    print("  2 score OK — the points earned this turn, and the Prophet's are not among them")

    # 3 — the PODIUM pays the winner its victory point and its Great Person points
    sim.comp_left[B0] = 0
    dv = int(sim.civ_diplo_points[B0, 0])
    gp0 = float(sim.civ_gpp[B0, 0, sci])
    sim._competition_podium(torch.tensor([True]))
    assert int(sim.civ_diplo_points[B0, 0]) == dv + int(row["gold"]), (
        "the winner took no victory point")
    assert float(sim.civ_gpp[B0, 0, sci]) == gp0 + int(row["goldGpp"]), (
        "the winner took no Great Person points")
    print(f"  3 podium OK — +{int(row['gold'])} DV point and +{int(row['goldGpp'])} GPP to the winner")

    print("WORLDS FAIR OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
