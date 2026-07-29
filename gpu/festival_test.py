"""#79 THEATER SQUARE FESTIVAL — the multi-class project award.

    python gpu/festival_test.py

Real Civ 6 (Civilopedia + the per-project rates): the Festival converts 15% of
the city's Production to Culture and, on completion, pays Great WRITER, Great
ARTIST **and** Great MUSICIAN points each worth ~11% of the Production invested.
Every other district project pays ~22% to a SINGLE class. The split is not
arbitrary: the Festival's D_TYPE is 5 where the others' is 10.

WHY THIS LANE EXISTS. Measured on the 12-seed scripted gate at 250 turns: the
rivals complete 51 Campus Research Grants and 7 Holy Site Prayers and **ZERO**
Festivals. So scripted parity exercises the yield fraction thoroughly but cannot
reach the multi-class award at all — the one behaviour this slice changes. This
lane constructs the completion directly instead of hoping a seed wanders into
one (the watermill/relics lesson).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    rows = (rules.projects or {}).get("rows", [])
    assert rows, "no exported project rows"

    # --- 1) the exported table carries the per-project override -------------
    multi = [(i, r) for i, r in enumerate(rows) if len(r.get("gs") or []) > 1]
    assert len(multi) == 1, f"exactly ONE project pays multiple classes (the Festival), got {len(multi)}"
    pi_fest, frow = multi[0]
    assert abs(float(frow["gf"]) - 0.11) < 1e-12, f"Festival pays 0.11 per class, got {frow['gf']}"
    assert len(frow["gs"]) == 3, f"the Festival pays THREE classes, got {frow['gs']}"
    yf = float((rules.projects or {}).get("yieldFraction"))
    gf = float((rules.projects or {}).get("gppFraction"))
    assert abs(yf - 0.15) < 1e-12, f"district projects convert 15% of production, got {yf}"
    assert abs(gf - 0.22) < 1e-12, f"a single-class project pays 22%, got {gf}"
    # and every OTHER project stays single-class
    for i, r in enumerate(rows):
        if i == pi_fest:
            continue
        assert len(r.get("gs") or []) <= 1, f"row {i} unexpectedly pays multiple classes"

    # --- 2) a RIVAL completing the Festival pays all three classes ----------
    #   Plant the project at full progress in a live rival capital and run the
    #   rival phase — the space_race_test pattern. Rivals do select Festivals
    #   in principle, but never do in-gate, so we plant it.
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert sim.R >= 1, "need a rival"
    r, j = 0, 0
    assert bool(sim.r_alive[0, r]) and bool(sim.rc_alive[0, r, j]), "rival capital must be alive"
    NBc = sim.rules_dev.b_cost.shape[0]
    code = 1 + sim.NU + len(sim._scaffold) + NBc + pi_fest
    cost = 100.0
    sim.rc_current[0, r, j] = code
    sim.rc_cost[0, r, j] = cost
    sim.rc_progress[0, r, j] = 1.0e6
    before = sim.r_gpp[0, r].clone()
    sim._rival_phase()
    delta = (sim.r_gpp[0, r] - before).tolist()

    want_each = round(cost * 0.11)
    paid = {g: int(delta[g]) for g in frow["gs"]}
    for g, got in paid.items():
        assert got == want_each, (
            f"class {g} must gain {want_each} GPP (0.11 x {cost:.0f}), got {got}"
        )
    # nothing else moved — a single-class rate must not leak in
    for g, d in enumerate(delta):
        if g in frow["gs"]:
            continue
        assert int(d) == 0, f"class {g} must gain nothing from a Festival, got {int(d)}"
    assert want_each != round(cost * gf), (
        "the test is degenerate: the Festival rate equals the single-class rate"
    )
    print(f"  a exported table OK (Festival row {pi_fest}, classes {frow['gs']}, 0.11 each; others 0.22)")
    print(f"  b rival Festival paid {want_each} GPP to EACH of {sorted(paid)} and nothing elsewhere OK")
    print("festival_test OK — #79 multi-class project award, 15% yield / 11% per class")


if __name__ == "__main__":
    main()
