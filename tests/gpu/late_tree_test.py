"""THE LATE TREE and two military cards — the GPU twin's rows, pinned.

  * CIV6 (`Repeatable`): Future Tech and Future Civic stay researchable once
    complete — the seat's research mask offers them over a finished tree,
    while a minor's research (`cheapestAvailable`) never repeats a row;
  * every completion pays the row's award again: Seasteads 1 Diplomatic
    Victory point, Future Tech +5% project production banked, Future Civic
    50 Diplomatic Favor and a Governor title;
  * the Seastead row: TOURISMSOURCE_CULTURE with no tech gate, never beside
    another, unlocked by Seasteads;
  * (Logistics) "+1 Movement if starting turn in friendly territory" — a
    unit on its seat's own ground draws the card's Movement at the start.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all


def main() -> int:
    rules = load_rules()
    rj = json.load(open(FIXTURES / "rules.json", encoding="utf-8"))
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    tech_ids = [t["id"] for t in rj["techs"]]
    civic_ids = [c["id"] for c in rj["civics"]]
    ft, ss, fc = tech_ids.index("FUTURE_TECH"), tech_ids.index("SEASTEADS"), civic_ids.index("FUTURE_CIVIC")
    row = 0
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))

    # --- 1) a finished tree still offers its repeatable row ----------------
    sim.civ_techs[:, row, :] = True
    sim.civ_civics[:, row, :] = True
    sim._eff_version += 1
    assert sim._seat_tech_mask(row)[0].nonzero(as_tuple=True)[0].tolist() == [ft], "Future Tech repeats"
    assert sim._seat_civic_mask(row)[0].nonzero(as_tuple=True)[0].tolist() == [fc], "Future Civic repeats"
    assert not bool(sim._available_mask(sim.civ_techs[:, row], sim._prereq_t).any()), \
        "a minor's research never repeats a row"
    print("  1 repeatable rows OK")

    # --- 2) every completion pays the award --------------------------------
    fin = torch.ones(sim.B, dtype=torch.bool)
    cur = lambda i: torch.full((sim.B,), i, dtype=torch.long)  # noqa: E731
    pct0 = int(sim.civ_research_project_pct[0, row])
    sim._research_award(row, fin, cur(ft), False)
    sim._research_award(row, fin, cur(ft), False)
    assert int(sim.civ_research_project_pct[0, row]) == pct0 + 10, "+5% per Future Tech"
    dvp0 = int(sim.civ_diplo_points[0, row])
    sim._research_award(row, fin, cur(ss), False)
    assert int(sim.civ_diplo_points[0, row]) == dvp0 + 1, "Seasteads awards 1 DVP"
    fav0, tit0 = int(sim.civ_diplo_favor[0, row]), int(sim.civ_granted_titles[0, row])
    sim._research_award(row, fin, cur(fc), True)
    assert int(sim.civ_diplo_favor[0, row]) == fav0 + 50, "Future Civic awards 50 Favor"
    assert int(sim.civ_granted_titles[0, row]) == tit0 + 1, "Future Civic awards a Governor title"
    print("  2 completion awards OK")

    # --- 3) the Seastead row ----------------------------------------------
    k = rj["improvements"]["ids"].index("SEASTEAD")
    assert sim._imp_tour_tech[k] == -1 and sim._imp_tour_y[k] >= 0, "Tourism from Culture, no tech gate"
    assert sim._imp_no_adj_same[k], "never beside another Seastead"
    assert int(sim._imp_unlock[k]) == ss, "Seasteads unlocks it"
    print("  3 Seastead row OK")

    # --- 4) Logistics: Movement for a unit starting on its own ground -----
    alive = sim.major_unit_alive[0] & (sim.major_unit_seat[0] >= 0) & (sim.major_unit_seat[0] < sim.n_majors)
    u = int(alive.nonzero(as_tuple=True)[0][0])
    seat = int(sim.major_unit_seat[0, u])
    tile = int(sim.major_unit_tile[0, u])
    typ = sim.major_unit_type.clamp(min=0, max=sim.NU - 1)
    sim.tile_seat[0, tile] = seat
    before = int(sim._start_tile_mp("major", typ)[0, u])
    orig = sim._fx_by_row
    sim._pol_home_moves_any = True
    sim._fx_by_row = lambda key: (torch.ones(sim.B, sim.n_majors, dtype=torch.long)
                                  if key == "homemove" else orig(key))
    assert int(sim._start_tile_mp("major", typ)[0, u]) == before + 1, "Logistics' +1 at home"
    sim.tile_seat[0, tile] = -1
    assert int(sim._start_tile_mp("major", typ)[0, u]) == before, "none off the seat's ground"
    print("  4 Logistics OK")

    print("LATE TREE OK — repeatable rows, their awards, the Seastead row, Logistics")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
