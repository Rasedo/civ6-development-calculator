"""THE BUILDER'S CHARGE INTO A WONDER — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/wonder_charge_test.py

The TS twin is tests/cpu/seats/wonder-charge.test.ts.

CIV6 (The First Emperor, EFFECT_ADJUST_PLAYER_UNIT_WONDER_PERCENT): "When
building Ancient and Classical wonders you may spend Builder charges to
complete 15% of the original wonder cost." No fixture seats China, so no gate
lane can reach this verb — these lanes are the only evidence (C-55).
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

B0 = 0
ROOT = Path(__file__).resolve().parent.parent.parent
RULES = json.loads((ROOT / "seeder" / "worlds" / "rules.json").read_text())
UNITS = [u["id"] for u in RULES["units"]]


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def test_the_wire(rules, path) -> None:
    """One row, 15 percent, and an era band that is not the whole game."""
    sim = fresh(rules, path)
    rows = sim._wonder_charge_rows
    assert len(rows) == 1, f"the roster names one carrier, wire has {len(rows)}"
    _c, _l, _s, _e, _p = rows[0]
    assert _p == 15, f"the install's Amount is 15, wire says {_p}"
    assert _l >= 0, "the carrier is a LEADER ability and the wire names none"
    assert 0 <= _s <= _e, f"the band is malformed: {_s}..{_e}"
    assert _e < int(sim._wonder_era.max()), \
        "the band covers every wonder era — the refusal lane would prove nothing"
    print("  1 the wire OK — one leader row, 15 percent, eras", _s, "to", _e)


def _wonders_in_and_out(sim) -> tuple[int, int]:
    _c, _l, _s, _e, _p = sim._wonder_charge_rows[0]
    era = sim._wonder_era
    inside = next(w for w in range(sim._wond_n) if _s <= int(era[w]) <= _e)
    outside = next(w for w in range(sim._wond_n) if int(era[w]) > _e)
    return inside, outside


def _scene(sim, row: int, widx: int, seat_it: bool):
    """The row's first city with `widx` queued at an adjacent plot, and a
    charged Builder standing on that plot."""
    if seat_it:
        _c, _l, _s, _e, _p = sim._wonder_charge_rows[0]
        # the row is a LEADER ability: seat the civilization the pair belongs
        # to, then the leader itself
        ci = sim._pair_civ[_l]
        sim.row_civ[B0, row] = ci
        sim.row_leader[B0, row] = _l
    else:
        sim.row_civ[B0, row] = -1
        sim.row_leader[B0, row] = -1
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1

    j = 0
    ctr = int(sim.city_center[B0, row, j])
    at = next(int(x) for x in sim.neigh[ctr].tolist() if x >= 0)
    sim.tile_seat[B0, at] = row
    sim.tile_city[B0, at] = int(sim.city_id[B0, row, j])
    sim.improvement[B0, at] = -1
    sim._tile_owner_ver += 1
    sim.city_current[B0, row, j, 0] = sim.WONDER_BASE + widx
    sim.city_wonder[B0, row, j, widx] = at
    sim.city_progress[B0, row, j, 0] = 0.0
    sim._eff_version += 1

    one = torch.ones(sim.B, dtype=torch.bool)
    sim._spawn_unit(row, one, torch.full((sim.B,), at, dtype=torch.long),
                    torch.full((sim.B,), UNITS.index("BUILDER"), dtype=torch.long))
    smap = sim._seat_slot_map(row)
    sc = smap[B0].clamp(min=0)
    live = ((smap[B0] >= 0) & (sim.unit_tile[B0, sc] == at)
            & (sim.unit_type[B0, sc] == UNITS.index("BUILDER")))
    slot = int(live.nonzero().flatten()[-1])
    sim.unit_mp[B0, int(smap[B0, slot])] = sim._mp_scale
    return j, at, slot


def _charge(sim, row: int, slot: int) -> None:
    smap = sim._seat_slot_map(row)
    act = torch.full(smap.shape, -1, dtype=torch.long)
    act[B0, slot] = sim._A_WONDER_CHARGE
    sim._apply_seat_unit_actions(row, act)


def test_pays_the_original_cost(rules, path) -> None:
    sim = fresh(rules, path)
    row = 1
    inside, _out = _wonders_in_and_out(sim)
    j, at, slot = _scene(sim, row, inside, True)
    assert bool(sim._seat_unit_mask(row)[B0, slot, sim._A_WONDER_CHARGE]), \
        "the wonder's own site under a charged builder offered no column"
    cost = float(sim._wond_cost[inside])
    _charge(sim, row, slot)
    got = float(sim.city_progress[B0, row, j, 0])
    assert got == round(cost * 15 / 100), \
        f"paid {got}, expected 15 percent of the catalog cost {cost}"
    print("  2 the payout OK —", got, "of the catalog's", cost)


def test_refuses_the_wrong_era(rules, path) -> None:
    sim = fresh(rules, path)
    row = 1
    _in, outside = _wonders_in_and_out(sim)
    j, at, slot = _scene(sim, row, outside, True)
    assert not bool(sim._seat_unit_mask(row)[B0, slot, sim._A_WONDER_CHARGE]), \
        "a wonder outside the band was still offered the column"
    # the APPLIER carries the band too, since the driver may order it anyway
    _charge(sim, row, slot)
    assert float(sim.city_progress[B0, row, j, 0]) == 0.0, \
        "the applier paid a wonder outside the band"
    print("  3 the band OK — mask and applier both refuse a later era")


def test_refuses_a_plain_seat(rules, path) -> None:
    sim = fresh(rules, path)
    row = 1
    inside, _out = _wonders_in_and_out(sim)
    j, at, slot = _scene(sim, row, inside, False)
    assert not bool(sim._seat_unit_mask(row)[B0, slot, sim._A_WONDER_CHARGE]), \
        "a seat with no roster row was offered the column"
    _charge(sim, row, slot)
    assert float(sim.city_progress[B0, row, j, 0]) == 0.0, \
        "the applier paid a seat the roster does not name"
    print("  4 the plain seat OK — no row, no charge")


def test_refuses_a_tile_that_is_not_the_site(rules, path) -> None:
    sim = fresh(rules, path)
    row = 1
    inside, _out = _wonders_in_and_out(sim)
    j, at, slot = _scene(sim, row, inside, True)
    # move the wonder's registered plot elsewhere: the builder now stands on
    # a tile that is not the site
    other = next(int(x) for x in sim.neigh[at].tolist()
                 if x >= 0 and int(x) != at and int(sim.city_center[B0, row, j]) != int(x))
    sim.city_wonder[B0, row, j, inside] = other
    sim._eff_version += 1
    assert not bool(sim._seat_unit_mask(row)[B0, slot, sim._A_WONDER_CHARGE]), \
        "a tile that is not the wonder site was offered the column"
    _charge(sim, row, slot)
    assert float(sim.city_progress[B0, row, j, 0]) == 0.0, \
        "the applier paid from off the site"
    print("  5 the site OK — the charge goes into the wonder's own plot")


def test_only_the_head_accrues(rules, path) -> None:
    """A wonder sitting BEHIND the queue head takes nothing — the same rule
    the engineer's charge and every production add already follow."""
    sim = fresh(rules, path)
    row = 1
    inside, _out = _wonders_in_and_out(sim)
    j, at, slot = _scene(sim, row, inside, True)
    # something else at the head, the wonder one deep
    sim.city_current[B0, row, j, 0] = 0          # a BUILDING index
    sim.city_current[B0, row, j, 1] = sim.WONDER_BASE + inside
    sim._eff_version += 1
    assert not bool(sim._seat_unit_mask(row)[B0, slot, sim._A_WONDER_CHARGE]), \
        "a wonder behind the queue head was offered the column"
    print("  6 the head OK — only the queue head takes the charge")


def test_the_charge_is_spent(rules, path) -> None:
    sim = fresh(rules, path)
    row = 1
    inside, _out = _wonders_in_and_out(sim)
    j, at, slot = _scene(sim, row, inside, True)
    raw = int(sim._seat_slot_map(row)[B0, slot])
    before = int(sim.unit_charges[B0, raw])
    _charge(sim, row, slot)
    after = int(sim.unit_charges[B0, raw]) if bool(sim.unit_alive[B0, raw]) else 0
    assert after in (before - 1, 0), f"spent {before - after} charges, not one"
    print("  7 the charge OK — one charge per helping")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_pays_the_original_cost(rules, path)
    test_refuses_the_wrong_era(rules, path)
    test_refuses_a_plain_seat(rules, path)
    test_refuses_a_tile_that_is_not_the_site(rules, path)
    test_only_the_head_accrues(rules, path)
    test_the_charge_is_spent(rules, path)
    print("BATTERY OK wonder_charge")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
