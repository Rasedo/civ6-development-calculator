"""RESEARCH SWITCHING — the action, and the science it must not lose.

GATE REACHABILITY IS ZERO for this: no driver in the battery ever switches
research away from an unfinished item, so a green gate says nothing here. This
lane is the only proof.

Two rules, both from real Civ 6 and both broken before #72:
  * a seat may switch research AT ANY MOMENT. The GPU refused — the tech mask
    carried `cur_tech == -1`, so the whole head went illegal for as long as
    anything was underway (measured: 0 of 68 legal at t60 of seed 9002), and
    the apply carried the same term, so even a hand-written record was ignored;
  * the abandoned item KEEPS its progress. Both engines held ONE scalar pool,
    so switching handed the old item's science to the new one — a free transfer
    the real game does not grant.

The pool and the parked map PARTITION a seat's science: the item being
researched is never in the map, and nothing may add the two.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES
from core.engine import _MUTABLE


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    row = 1

    # --- 1) the mask offers every available tech, underway or not ----------
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    free = sim._seat_tech_mask(row)
    n_free = int(free[0].sum())
    assert n_free > 0, "a fresh seat must have techs to research"
    avail = free[0].nonzero(as_tuple=True)[0].tolist()
    t_a, t_b = avail[0], avail[1]
    sim.civ_cur_tech[:, row] = t_a
    busy = sim._seat_tech_mask(row)
    assert int(busy[0].sum()) == n_free, (
        "a tech already underway must not close the head — that is the "
        "action-space hole #72 closed"
    )
    assert bool(busy[0, t_b]), "the seat must be able to switch to another available tech"

    # --- 2) switch away, switch back, science survives ---------------------
    sim2 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    ok = torch.ones(sim2.B, dtype=torch.bool, device=sim2.device)
    sim2._select_research(row, torch.full((sim2.B,), t_a, dtype=torch.long), ok)
    assert int(sim2.civ_cur_tech[0, row]) == t_a
    sim2.civ_tech_prog[:, row] = 40.0                       # sink 40 into A
    sim2._select_research(row, torch.full((sim2.B,), t_b, dtype=torch.long), ok)
    assert int(sim2.civ_cur_tech[0, row]) == t_b, "the switch must land"
    assert float(sim2.civ_tech_prog[0, row]) == 0.0, "B starts from ITS own progress, which is zero"
    assert float(sim2.civ_tech_retain[0, row, t_a]) == 40.0, "A's 40 science must be PARKED, not handed to B"
    sim2.civ_tech_prog[:, row] = 15.0                       # sink 15 into B
    sim2._select_research(row, torch.full((sim2.B,), t_a, dtype=torch.long), ok)
    assert float(sim2.civ_tech_prog[0, row]) == 40.0, "returning to A must hand its 40 back"
    assert float(sim2.civ_tech_retain[0, row, t_a]) == 0.0, "the item being researched is never in the map"
    assert float(sim2.civ_tech_retain[0, row, t_b]) == 15.0, "B's 15 is parked in its place"

    # --- 3) re-stating the current pick is a NO-OP -------------------------
    #   A record that repeats itself must not round-trip the pool through the
    #   map: that is where a rounding step or an ordering slip would eat it.
    before = float(sim2.civ_tech_prog[0, row])
    sim2._select_research(row, torch.full((sim2.B,), t_a, dtype=torch.long), ok)
    assert float(sim2.civ_tech_prog[0, row]) == before, "re-picking the current tech must change nothing"

    # --- 4) an ILLEGAL pick moves nothing ----------------------------------
    no = torch.zeros(sim2.B, dtype=torch.bool, device=sim2.device)
    sim2._select_research(row, torch.full((sim2.B,), t_b, dtype=torch.long), no)
    assert int(sim2.civ_tech_prog[0, row]) == 40 and int(sim2.civ_cur_tech[0, row]) == t_a, \
        "a refused pick must leave both the pool and the selection alone"

    # --- 5) the partition is PER SEAT --------------------------------------
    other = 0 if row != 0 else 1
    assert float(sim2.civ_tech_retain[0, other, t_b]) == 0.0, "one seat's parked science must not appear on another's row"

    # --- 6) civics run the same body ---------------------------------------
    cf = sim2._seat_civic_mask(row)[0].nonzero(as_tuple=True)[0].tolist()
    c_a, c_b = cf[0], cf[1]
    sim2._select_research(row, torch.full((sim2.B,), c_a, dtype=torch.long), ok, is_civic=True)
    sim2.civ_civic_prog[:, row] = 7.0
    sim2._select_research(row, torch.full((sim2.B,), c_b, dtype=torch.long), ok, is_civic=True)
    assert float(sim2.civ_civic_retain[0, row, c_a]) == 7.0, "civics park exactly like techs"
    assert float(sim2.civ_civic_prog[0, row]) == 0.0

    # --- 7) both maps ride snapshot/restore --------------------------------
    for name in ("civ_tech_retain", "civ_civic_retain"):
        assert name in _MUTABLE, f"{name} must be registered in _MUTABLE"
    s = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    snap = s.snapshot()
    s.civ_tech_retain[0, row, t_a] = 99.0
    s.restore(snap)
    assert float(s.civ_tech_retain[0, row, t_a]) == 0.0, "restore must roll parked progress back"

    print("research_switch_test OK — the head stays open while researching, parked science survives "
          "a switch and returns, re-picks and refusals are no-ops, per-seat, civics twinned, _MUTABLE round-trip")


if __name__ == "__main__":
    main()
