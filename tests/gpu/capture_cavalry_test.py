"""A DEFEATED CAVALRY UNIT MAY BE CAPTURED (C-58) — the GPU half.

    python tests/gpu/capture_cavalry_test.py

The TS twin is tests/cpu/units/capture-cavalry.test.ts.

CIV6 (Mongol Horde): cavalry gains "a chance to capture defeated enemy
cavalry class units". The install publishes the PERMISSION and one number
beside it, COMBAT_BASE_CAPTURE_STRENGTH_DIFFERENCE 20; the curve through it
is this model's (STYLIZED, owner ruling 2026-09-04): an even fight is a coin
flip, certain at +20 Combat Strength, nothing at -20. The roll is ONE draw
right after the two damage rolls, on both engines, and only when the capture
is possible at all — so the stream is the parity contract this lane pins:
three draws for a carrier's cavalry beating cavalry, two for anyone else.

  1. a carrier's Knight (army, +17) beats a Horseman: CAPTURED — the loser
     stands where it fell under the captor's flag, last in the roster, at
     the captured hit points, its turn spent; the attacker does not advance;
     three draws.
  2. a carrier's Horseman beats an army Knight: the curve reads 0, the
     loser DIES; three draws (the roll is drawn, and misses).
  3. a non-carrier's Knight beats a Horseman: dies; two draws.
  4. a carrier's Warrior (no cavalry) beats a Horseman: dies; two draws.
  5. a carrier's Knight beats a Warrior (no cavalry): dies; two draws.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all

ROW = 0   # the attacker's seat
FOE = 1   # the defender's seat
STEP = 0x6D2B79F5  # mulberry32's per-draw increment, the same on both engines
M32 = 0xFFFFFFFF
UNI = [u["id"] for u in json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))["units"]]


def play(sim, row: int, name) -> None:
    if name is None:
        sim.row_civ[0, row] = -1
        sim.row_leader[0, row] = -1
    else:
        ci = sim._civ_ids.index(name)
        sim.row_civ[0, row] = ci
        sim.row_leader[0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


def fresh(rules) -> BatchSim:
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], rules, device="cpu", dtype=torch.float64))
    sim.war[0, ROW, FOE] = sim.war[0, FOE, ROW] = True
    return sim


def put(sim, row: int, tile: int, kind: str, hp: int = 100, formation: int = 0) -> int:
    """seat a unit of `kind` on `tile` and return its merged slot."""
    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    lo = sim.POOL_LO["major"]
    ty = UNI.index(kind)
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = row
    sim.major_unit_type[0, slot] = ty
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = hp
    sim.major_unit_mp[0, slot] = 2
    sim.major_unit_mp_full[0, slot] = 2
    sim.major_unit_attacks[0, slot] = 1
    sim.major_unit_formation[0, slot] = formation
    sim.military_at[0, tile] = slot + lo
    sim._gen_ver += 1
    return slot + lo


def free_pair(sim) -> tuple[int, int]:
    """two adjacent passable land tiles with nothing standing on either."""
    for t in range(sim.T):
        if (not bool(sim.passable[0, t]) or bool(sim.wpass[0, t])
                or int(sim.military_at[0, t]) >= 0 or int(sim.civilian_at[0, t]) >= 0):
            continue
        for n in sim.neigh[t].tolist():
            if n < 0 or not bool(sim.passable[0, n]) or bool(sim.wpass[0, n]):
                continue
            if int(sim.military_at[0, n]) >= 0 or int(sim.civilian_at[0, n]) >= 0:
                continue
            return t, n
    raise AssertionError("no adjacent free land pair on the map")


def rank_of(sim, row, slot_merged) -> int:
    smap = sim._seat_slot_map(row)
    return int((smap[0] == slot_merged).long().argmax())


def order(sim, row, slot_merged, col) -> None:
    smap = sim._seat_slot_map(row)[0]
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, rank_of(sim, row, slot_merged)] = col
    sim.seat_ext[0, row] = True
    sim._apply_seat_unit_actions(row, acts)


def dir_of(sim, frm, to) -> int:
    d = [i for i, n in enumerate(sim.neigh[frm].tolist()) if n == to]
    assert d, "tiles are not adjacent"
    return d[0]


def draws(s0: int, s1: int) -> int:
    # the state is a 32-bit counter stepping by STEP and wrapping, so count steps
    for k in range(9):
        if (s0 + k * STEP) & M32 == s1 & M32:
            return k
    raise AssertionError(f"the stream moved by a non-draw amount: {s0} -> {s1}")


def fight(rules, carrier: bool, atk: str, dfd: str, atk_form: int = 0, def_form: int = 0):
    sim = fresh(rules)
    play(sim, ROW, "MONGOLIA" if carrier else None)
    a_t, d_t = free_pair(sim)
    a = put(sim, ROW, a_t, atk, formation=atk_form)
    d = put(sim, FOE, d_t, dfd, hp=1, formation=def_form)
    # `put` bypasses the spawn's reveal, and a unit in the fog is no target
    sim._reveal_around(torch.tensor([0]), ROW, torch.tensor([a_t]), 2)
    s0 = int(sim.rng_state[0])
    nxt = int(sim.unit_next[0]) + sim.POOL_LO["major"]
    order(sim, ROW, a, 6 + dir_of(sim, a_t, d_t))  # the ATTACK columns are 6-11, one per direction
    n = draws(s0, int(sim.rng_state[0]))
    return sim, a, d, a_t, d_t, nxt, n


def main() -> int:
    rules = load_rules()

    sim, a, d, a_t, d_t, new, n = fight(rules, True, "KNIGHT", "HORSEMAN", atk_form=2)
    assert not bool(sim.unit_alive[0, d]), "the beaten unit still holds its old slot"
    assert bool(sim.unit_alive[0, new]), "no unit was appended to the captor's roster"
    assert int(sim.unit_seat[0, new]) == ROW, "the captured unit does not fly the captor's flag"
    assert int(sim.unit_type[0, new]) == UNI.index("HORSEMAN"), "the captured chassis changed"
    assert int(sim.unit_tile[0, new]) == d_t and int(sim.military_at[0, d_t]) == new, \
        "the captured unit does not stand where it fell"
    assert int(sim.unit_hp[0, new]) == sim._captured_hp == 25, f"captured hp {int(sim.unit_hp[0, new])}"
    assert int(sim.unit_mp[0, new]) == 0, "the captured unit kept a turn"
    assert int(sim.unit_tile[0, a]) == a_t, "the attacker advanced onto its own unit"
    assert n == 3, f"a possible capture must cost exactly ONE extra draw: {n} draws"
    print("  1 capture OK — the Horseman changes hands at 25 HP where it fell, three draws")

    sim, a, d, a_t, d_t, new, n = fight(rules, True, "HORSEMAN", "KNIGHT", def_form=2)
    assert not bool(sim.unit_alive[0, d]) and not bool(sim.unit_alive[0, new]), \
        "a curve reading 0 still captured"
    assert n == 3, f"the roll is drawn even when it cannot hit: {n} draws"
    print("  2 the far end OK — the weaker captor's roll misses, the Knight dies, three draws")

    for label, carrier, atk, dfd in (("a non-carrier", False, "KNIGHT", "HORSEMAN"),
                                     ("a non-cavalry attacker", True, "WARRIOR", "HORSEMAN"),
                                     ("a non-cavalry loser", True, "KNIGHT", "WARRIOR")):
        sim, a, d, a_t, d_t, new, n = fight(rules, carrier, atk, dfd, atk_form=2)
        assert not bool(sim.unit_alive[0, d]) and not bool(sim.unit_alive[0, new]), f"{label} captured"
        assert n == 2, f"{label} drew {n} times — a capture roll where none is possible"
    print("  3-5 the gates OK — no carrier, no cavalry on either side: no roll, no capture")
    print("BATTERY OK capture_cavalry")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
