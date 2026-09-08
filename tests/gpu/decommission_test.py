"""THE THREE DECOMMISSION PROJECTS, GPU side.

CIV6 (Expansion2_Projects.xml): Cost 400 apiece, PrereqDistrict
DISTRICT_INDUSTRIAL_ZONE, `UnlocksFromEffect` — the CLIMATE ACCORDS
competition is the effect that opens them — and each one's
`Project_BuildingCosts` row names the plant it CONSUMES.

CIV6 (Expansion2_Emergencies.xml,
CLIMATE_ACCORDS_SCORE_DECOMMISSION_{COAL,OIL,NUCLEAR}): `ScoreAmount` 100
apiece, `FromProject` the decommission row.

No rollout path builds a power plant (the power plants' reach is ZERO), so this lane
drives the gate and the completion by hand — its whole GPU reach.

Run: PYTHONIOENCODING=utf-8 python tests/gpu/decommission_test.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES  # noqa: E402
from warmup import settle_all  # noqa: E402
from core import simbase  # noqa: E402

B0 = 0
ROW = 0


def build(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def main() -> int:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = build(rules, paths[0])
    print(f"decommission_test on {paths[0].name}")

    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    bids = [b["id"] for b in rj["buildings"]]
    # `ao` names the COMPETITION that unlocks the row, so the three
    # decommission rows are the ones the Climate Accords open
    rows = [(i, r) for i, r in enumerate(sim._proj_rows)
            if int(r.get("ao", -1)) == sim._comp_climate]
    assert len(rows) == 3, f"the catalog carries {len(rows)} decommission rows, wanted 3"

    # 1 — the install's own columns
    for _, r in rows:
        cb = int(r.get("cb", -1))
        assert cb >= 0, "a decommission row names no building to consume"
        assert bids[cb].endswith("POWER_PLANT"), f"row consumes {bids[cb]}, not a plant"
    # the Accords' own <EmergencyScoreSources> table names each row at 100
    _acc = sim._comp_scored[sim._comp_climate]
    for pi_c, _ in rows:
        _amt = sum(a for k, a, o in _acc if k == simbase.SCORE_PROJECT and o == pi_c)
        assert _amt == 100, f"CLIMATE_ACCORDS_SCORE_DECOMMISSION is 100, the table says {_amt}"
    print("  1 catalog OK — 3 rows, each consuming its own plant, each scored 100")

    # 2 — the GATE: no Accords, no offer; and only the plant standing here
    pi, prow = rows[0]
    cb = int(prow["cb"])
    j = int(sim.city_alive[B0, ROW].long().argmax())
    sim.city_bldg[B0, ROW, j, cb] = True
    sim.comp_kind[B0] = -1
    sim._eff_version += 1
    assert not bool(sim._competition_project_ok(ROW, j, pi)[B0]), (
        "a decommission project was offered with no Climate Accords running")

    sim.comp_kind[B0] = sim._comp_climate
    sim._eff_version += 1
    assert bool(sim._competition_project_ok(ROW, j, pi)[B0]), (
        "the Accords are running and the plant stands, yet the row was refused")

    sim.city_bldg[B0, ROW, j, cb] = False
    sim._eff_version += 1
    assert not bool(sim._competition_project_ok(ROW, j, pi)[B0]), (
        "a decommission project was offered with its plant absent")
    print("  2 gate OK — the Accords open it, the plant standing here is its second half")

    # 3 — the COMPLETION consumes the plant and scores the Accords
    sim2 = build(rules, paths[0])
    j2 = int(sim2.city_alive[B0, ROW].long().argmax())
    sim2.city_bldg[B0, ROW, j2, cb] = True
    sim2.city_bldg_pillaged[B0, ROW, j2, cb] = True
    sim2.comp_kind[B0] = sim2._comp_climate
    sim2.comp_member[B0, ROW] = True
    before = float(sim2.comp_score[B0, ROW])
    if cb == sim2._nuclear_bidx:
        sim2.city_reactor_age[B0, ROW, j2] = 17
    sim2._eff_version += 1

    # queue it at the head and drive it to completion
    sim2.city_current[B0, ROW, j2, 0] = sim2.PROJECT_BASE + pi
    sim2.city_progress[B0, ROW, j2, 0] = 0.0
    sim2.city_cost[B0, ROW, j2, 0] = 1.0
    sim2._seat_city_produce(ROW, torch.tensor([j2]), torch.tensor([True]),
                            torch.tensor([50.0], dtype=torch.float64))
    assert not bool(sim2.city_bldg[B0, ROW, j2, cb]), "the project did not consume its plant"
    assert not bool(sim2.city_bldg_pillaged[B0, ROW, j2, cb]), (
        "a pillage mark outlived the building it named")
    assert float(sim2.comp_score[B0, ROW]) == before + 100, (
        f"the Accords scored {float(sim2.comp_score[B0, ROW]) - before}, wanted 100")
    print("  3 completion OK — the plant is gone and the Accords scored 100")

    print("DECOMMISSION OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
