"""A LEVIED UNIT UPGRADES CHEAPLY — the GPU half (C-66).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/levied_upgrade_test.py

The TS twin is tests/cpu/units/levied-upgrade.test.ts.

CIV6 (The Raven King, EFFECT_ADJUST_PLAYER_LEVIED_UNIT_UPGRADE_DISCOUNT_
PERCENT): a LEVIED unit upgrades at 75% off. The row has shipped since batch
11 and NOTHING READ IT — the gap was the MARK, not the magnitude.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
ROW = 0


def build(path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], load_rules(),
                               device="cpu", dtype=torch.float64))


def test_the_wire(rules, path) -> None:
    sim = build(path)
    rows = sim._levy_rows
    assert len(rows) == 1, f"one carrier expected, wire has {len(rows)}"
    _c, leader, pct, envoys, moves, combat = rows[0]
    assert leader >= 0, "the carrier names no leader"
    assert pct == 75, f"the install writes 75, wire has {pct}"
    assert envoys == 2, f"the levy hands back 2 envoys, wire has {envoys}"
    assert moves == 2 and combat == 5, f"the ability writes 2 and 5, wire has {moves}/{combat}"
    print("  1 the wire OK — 75% off, 2 envoys, +2 Movement, +5 Combat")


def test_the_mark_is_its_own_plane(rules, path) -> None:
    sim = build(path)
    assert sim.unit_levied.dtype == torch.bool, "the mark is not a bool plane"
    assert sim.unit_levied.shape == sim.unit_alive.shape, "the mark is not pool-wide"
    assert not bool(sim.unit_levied.any()), "a t0 unit is already marked levied"
    print("  2 the mark OK — a pool-wide bool, clear at t0")


def test_the_mark_survives_and_is_permanent(rules, path) -> None:
    """Nothing in this engine returns a levied unit, so the mark never clears —
    which is what makes an upgrade discount meaningful at all."""
    sim = build(path)
    gs = int((sim.unit_seat[B0] == ROW).nonzero().flatten()[0])
    sim.unit_levied[B0, gs] = True
    sim.step()
    assert bool(sim.unit_levied[B0, gs]), "the mark did not survive a turn"
    print("  3 the mark OK — permanent across a turn")


def test_it_is_in_the_digest(rules, path) -> None:
    """A new piece of unit state the gate cannot see is a gap, not a feature."""
    import json
    man = json.loads((Path(__file__).resolve().parent.parent.parent
                      / "shared" / "statecompare.manifest.json").read_text(encoding="utf-8"))
    found = [f for grp in man["groups"] for f in grp.get("fields", [])
             if f.get("name") == "levied"]
    assert found, "the levied mark is not in the statecompare manifest"
    assert "unit_levied" in found[0]["planes"], "the manifest names another plane"
    print("  4 the digest OK — the mark is compared turn by turn")


def test_the_ability_pays_movement_and_combat(rules, path) -> None:
    """CIV6 (The Raven King): a LEVIED unit carries +2 Movement and +5 Combat.
    Both ride the ONE composer on each side — the pool builder and
    `_roster_cs` — so a levied unit is born with the Movement rather than
    gaining it at the next refresh (A-2r's lesson)."""
    sim = build(path)
    _c, li, _pct, _env, moves, combat = sim._levy_rows[0]
    assert moves == 2 and combat == 5, f"the install writes 2 and 5, wire has {moves}/{combat}"
    # seat the carrier, or the row pays nobody
    sim.row_civ[B0, ROW] = sim._pair_civ[li]
    sim.row_leader[B0, ROW] = li
    sim._eff_version += 1
    sim._gen_ver += 1

    gs = int((sim.unit_seat[B0] == ROW).nonzero().flatten()[0])
    seat_t = sim.unit_seat[:, gs]
    typ_t = sim.unit_type[:, gs]
    tile_t = sim.unit_tile[:, gs]
    foe = torch.full((sim.B,), 1, dtype=torch.long)
    bare = int(sim._roster_cs(seat_t, typ_t, tile_t, foe, None, False)[B0])
    lev = torch.ones(sim.B, dtype=torch.bool)
    got = int(sim._roster_cs(seat_t, typ_t, tile_t, foe, None, False, None, lev)[B0])
    assert got == bare + combat, f"a levied unit got {got - bare} Combat, expected {combat}"

    # ...and the MOVEMENT rides the pool builder
    before = int(sim._full_mp("major")[B0, gs])
    sim.major_unit_levied[B0, gs] = True
    after = int(sim._full_mp("major")[B0, gs])
    assert after - before == moves * sim._mp_scale,         f"a levied unit got {after - before} MP, expected {moves * sim._mp_scale}"
    print(f"  5 the ability OK — +{moves} Movement at birth and +{combat} Combat")


def test_a_seat_without_the_row_gets_neither(rules, path) -> None:
    sim = build(path)
    _c, li, _pct, _env, moves, combat = sim._levy_rows[0]
    sim.row_civ[B0, ROW] = -1
    sim.row_leader[B0, ROW] = -1
    sim._eff_version += 1
    sim._gen_ver += 1
    gs = int((sim.unit_seat[B0] == ROW).nonzero().flatten()[0])
    before = int(sim._full_mp("major")[B0, gs])
    sim.major_unit_levied[B0, gs] = True
    assert int(sim._full_mp("major")[B0, gs]) == before, "a plain seat got the levy Movement"
    seat_t, typ_t, tile_t = sim.unit_seat[:, gs], sim.unit_type[:, gs], sim.unit_tile[:, gs]
    foe = torch.full((sim.B,), 1, dtype=torch.long)
    lev = torch.ones(sim.B, dtype=torch.bool)
    a = int(sim._roster_cs(seat_t, typ_t, tile_t, foe, None, False, None, lev)[B0])
    b = int(sim._roster_cs(seat_t, typ_t, tile_t, foe, None, False)[B0])
    assert a == b, "a plain seat got the levy Combat"
    print("  6 the gate OK — a seat the roster does not name gets neither")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_the_mark_is_its_own_plane(rules, path)
    test_the_mark_survives_and_is_permanent(rules, path)
    test_it_is_in_the_digest(rules, path)
    test_the_ability_pays_movement_and_combat(rules, path)
    test_a_seat_without_the_row_gets_neither(rules, path)
    print("BATTERY OK levied_upgrade")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
