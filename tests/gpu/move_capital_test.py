"""THE MOVING CAPITAL — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/move_capital_test.py

The TS twin is tests/cpu/city/move-capital.test.ts.

CIV6 (Founder of Carthage): "Can move their original Capital to any city with
a Cothon they founded by completing a unique project in that city." Two
carriers land here: a civilization-UNIQUE project row (`cv`/`ld` on the wire,
`_proj_seat_ok` in the production mask and the applier) and `_move_capital`,
the one composer for everything the capital identity reaches. The Cothon's
own project waits on the Cothon district (docs/AUDIT.md), so the wire
carries no gated row yet and these scenes drive the two composers directly.
  1. the wire: every shipped row is everyone's and none moves the capital
  2. the seat gate: a Phoenicia-keyed row opens for Phoenicia alone, a
     Dido-keyed row for Dido alone, a plain row for everyone
  3. the move: is_cap, civ_cap_tile and the original mark travel together,
     the old capital's mark clears wherever it stands
  4. the domination check follows: holding the OLD capital no longer counts
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all, plant_city

B0 = 0


def play(sim, row: int, name) -> None:
    ci = sim._civ_ids.index(name)
    sim.row_civ[B0, row] = ci
    sim.row_leader[B0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


def fresh(rules, path) -> BatchSim:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for r, name in enumerate(("PHOENICIA", "EGYPT", "NORWAY")):
        play(sim, r, name)
    return settle_all(sim)


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    assert len(sim._proj_seat_rows) == len(sim._proj_rows)
    # THE COTHON'S PROJECT is the one seat-gated row and the one that moves a
    # capital. The pin is its IDENTITY, not a slot: the catalog is
    # append-only, so later rows land BEHIND it and the last index moves.
    gated = [i for i, (c, l) in enumerate(sim._proj_seat_rows) if c >= 0 or l >= 0]
    assert len(gated) == 1, f"the seat-gated projects are {gated}"
    assert int(sim._proj_rows[gated[0]].get("mc", 0)) == 1, \
        "the one seat-gated project is not the capital-mover"
    # `_proj_move_cap` is a SET of project indices, not a per-row flag list
    assert sorted(sim._proj_move_cap) == gated, (
        f"the capital-moving projects are {sorted(sim._proj_move_cap)}, the gated {gated}")
    print("  1 the wire OK — the Cothon's project alone is gated, and it moves the capital")


def test_seat_gate(rules, path) -> None:
    sim = fresh(rules, path)
    phoen = sim._civ_ids.index("PHOENICIA")
    dido = sim._leader_idx("DIDO")
    n = len(sim._proj_rows)
    # a synthetic row appended to the seat table alone: the gate reads only this
    sim._proj_seat_rows = list(sim._proj_seat_rows) + [(phoen, -1), (-1, dido), (-1, -1)]
    civ_row, lead_row, plain_row = n, n + 1, n + 2
    assert bool(sim._proj_seat_ok(0, civ_row)[B0]) and not bool(sim._proj_seat_ok(1, civ_row)[B0])
    assert bool(sim._proj_seat_ok(0, lead_row)[B0]) and not bool(sim._proj_seat_ok(2, lead_row)[B0])
    assert all(bool(sim._proj_seat_ok(r, plain_row)[B0]) for r in range(sim.n_majors))
    # the same gate answers the mask and the applier: a row playing Phoenicia
    # under a different leader still opens the civilization-keyed row
    sim.row_leader[B0, 0] = dido
    assert bool(sim._proj_seat_ok(0, civ_row)[B0])
    print("  2 the seat gate OK — Phoenicia's row for Phoenicia, Dido's for Dido, a plain row for all")


def test_move(rules, path) -> None:
    sim = fresh(rules, path)
    plant_city(sim, 0)
    cols = sim.city_alive[B0, 0].nonzero(as_tuple=True)[0].tolist()
    assert len(cols) >= 2
    old = next(c for c in cols if bool(sim.city_is_cap[B0, 0, c]))
    new = next(c for c in cols if c != old)
    old_ctr, new_ctr = int(sim.city_center[B0, 0, old]), int(sim.city_center[B0, 0, new])
    assert int(sim.civ_cap_tile[B0, 0]) == old_ctr and int(sim.city_orig_cap[B0, 0, old]) == 0
    assert int(sim.city_orig_cap[B0, 0, new]) == -1
    hit = torch.zeros(sim.B, dtype=torch.bool)
    hit[B0] = True
    sim._move_capital(0, hit, torch.full((sim.B,), new, dtype=torch.long))
    assert not bool(sim.city_is_cap[B0, 0, old]) and bool(sim.city_is_cap[B0, 0, new])
    assert int(sim.city_is_cap[B0, 0].sum()) == 1, "two capitals"
    assert int(sim.civ_cap_tile[B0, 0]) == new_ctr
    assert int(sim.city_orig_cap[B0, 0, old]) == -1 and int(sim.city_orig_cap[B0, 0, new]) == 0
    assert int((sim.city_orig_cap[B0] == 0).sum()) == 1, "the original mark stands in two cities"
    # the other rows' marks are untouched
    for r in (1, 2):
        assert int(sim.city_orig_cap[B0, r, 0]) == r
    # a masked-out game moves nothing
    sim._move_capital(0, torch.zeros(sim.B, dtype=torch.bool), torch.full((sim.B,), old, dtype=torch.long))
    assert bool(sim.city_is_cap[B0, 0, new]) and int(sim.civ_cap_tile[B0, 0]) == new_ctr
    print("  3 the move OK — is_cap, civ_cap_tile and the original mark travel together")


def test_domination_follows(rules, path) -> None:
    def holding_old_capital(move: bool) -> int:
        sim = fresh(rules, path)
        plant_city(sim, 0)
        cols = sim.city_alive[B0, 0].nonzero(as_tuple=True)[0].tolist()
        old = next(c for c in cols if bool(sim.city_is_cap[B0, 0, c]))
        new = next(c for c in cols if c != old)
        if move:
            hit = torch.zeros(sim.B, dtype=torch.bool)
            hit[B0] = True
            sim._move_capital(0, hit, torch.full((sim.B,), new, dtype=torch.long))
        # row 1 takes row 0's OLD capital, and every other row's capital too
        sim._transfer_city(B0, 0, old, 1, conquest=True)
        for r in range(2, sim.n_majors):
            sim._transfer_city(B0, r, 0, 1, conquest=True)
        return int(sim._domination()[B0])

    assert holding_old_capital(move=False) == 1, "the old capital plus every other capital is domination"
    assert holding_old_capital(move=True) == -1, "the moved capital still stands with row 0"
    print("  4 the domination check OK — it follows the moved capital")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_seat_gate(rules, path)
    test_move(rules, path)
    test_domination_follows(rules, path)
    print("BATTERY OK move_capital")
    return 0


if __name__ == "__main__":
    sys.exit(main())
