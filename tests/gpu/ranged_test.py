"""Ranged-strike self-test.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/ranged_test.py

Units with rangedStrength > 0 execute attack codes 6-11 as a RANGED attack —
one damage roll, no retaliation, no advance — mirroring `rangedAttack`; melee
units take the `meleeAttack` exchange instead. The discriminator is
RETALIATION: `_damage_roll` clamps at min 1, so a MELEE attacker always takes
damage while a RANGED attacker never does. The test finds a real
adjacent-hostile situation in scripted play and runs the SAME order twice from
one snapshot — once with the attacker retyped SLINGER (ranged), once WARRIOR
(melee). Nothing but the unit's TYPE decides which resolution runs, on either
engine."""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES
from core.engine import UNIT_SLOTS, MAJOR_POOL_MAX, pool_view

HOLD = 12


def rank_of(sim, slot: int, row: int = 0) -> int:
    """The HEAD ROW merged slot `slot` occupies — what the applier and the
    mask index by."""
    return int((sim._seat_slot_map(row)[0] == slot).nonzero(as_tuple=True)[0][0])


def maj_mil_at(sim, tile: int, seat: int | None = None) -> int:
    """The MERGED slot of a MAJOR's military unit on `tile` (of `seat`, or of
    any seat but 0 when None), else -1. One shared window, so occupancy is a
    SEAT question."""
    m = int(sim.military_at[0, tile])
    if m < 0 or m >= MAJOR_POOL_MAX:
        return -1
    s = int(sim.unit_seat[0, m])
    return m if (s == seat if seat is not None else 0 < s < 100) else -1


def find_fight(rules, paths):
    """Scripted-advance a sim until a seat-0 military unit can attack a
    UNIT (barb or another major's) — the mask also offers at-war CITY sieges,
    which this test's defender probe doesn't model."""
    for path in paths:
        sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
        for _ in range(90):
            smap = sim._seat_slot_map(0)[0]
            m = sim._seat_unit_mask(0)[0]  # [N, A] — head rows, not slots
            for n in m[:, 6:12].any(dim=1).nonzero(as_tuple=True)[0].tolist():
                p = int(smap[n])
                if p < 0:
                    continue
                for d in m[n, 6:12].nonzero(as_tuple=True)[0].tolist():
                    tgt = int(sim.neigh[int(sim.unit_tile[0, p]), d])
                    if tgt >= 0 and (int(sim.barb_at[0, tgt]) >= 0 or maj_mil_at(sim, tgt) >= 0):
                        return sim, p, 6 + d, path.name
            sim.step()
    raise AssertionError("no adjacent-hostile situation found in scripted play")


def defender_state(sim, tile, pre=None):
    b = int(sim.barb_at[0, tile])
    if b >= 0:
        return ("barb", b, int(sim.barb_unit_hp[0, b]), bool(sim.barb_unit_alive[0, b]))
    v = maj_mil_at(sim, tile)
    if v >= 0:
        return ("major", v, int(sim.unit_hp[0, v]), bool(sim.unit_alive[0, v]))
    # the strike killed the defender and the map slot cleared — report it
    # dead via the pre-attack identity (a wounded defender CAN die to a
    # single ranged hit)
    assert pre is not None, "no hostile at the attack target?"
    return (pre[0], pre[1], 0, False)


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim, p, code, name = find_fight(rules, paths)
    print(f"ranged_test on {name}: unit slot {p}, attack code {code}, turn {sim.turn}")

    def unit_idx(uid: str) -> int:
        return next(i for i, u in enumerate(sim.rules.units) if u["id"] == uid)

    slinger, warrior = unit_idx("SLINGER"), unit_idx("WARRIOR")
    assert float(sim._type_ranged_strength[slinger]) > 0, "SLINGER rangedStrength not exported"
    assert float(sim._type_ranged_strength[warrior]) == 0, "WARRIOR must be melee"
    here = int(sim.unit_tile[0, p])
    tgt = int(sim.neigh[here, code - 6])

    ua = torch.full((1, UNIT_SLOTS), HOLD, dtype=torch.long)
    ua[0, rank_of(sim, p)] = code
    snap = sim.snapshot()
    pre_kind, pre_slot, pre_hp, _ = defender_state_from_snap(snap, tgt)

    # Run the UNIT-ACTION PHASE alone (not a full step): the rest of the
    # turn has the world fight back (hostile phases, healing), which would
    # confound the attacker-hp assertions.
    # --- RANGED: no retaliation, no advance, defender damaged
    sim.unit_type[0, p] = slinger
    hp0 = int(sim.unit_hp[0, p])
    sim._apply_seat_unit_actions(0, ua)
    kind, slot, hp_d, alive_d = defender_state(sim, tgt, (pre_kind, pre_slot, pre_hp, True))
    assert int(sim.unit_hp[0, p]) == hp0, (
        f"ranged attacker took retaliation ({hp0} -> {int(sim.unit_hp[0, p])})"
    )
    assert int(sim.unit_tile[0, p]) == here, "ranged attacker advanced"
    assert (not alive_d) or hp_d <= pre_hp - 1, "defender untouched by the strike"
    print(f"  ranged OK: attacker hp {hp0} (untouched), stayed at {here}; {kind} defender {pre_hp}->{hp_d if alive_d else 'dead'}")

    # --- MELEE: retaliation is guaranteed (damage roll min 1)
    sim.restore(snap)
    sim.unit_type[0, p] = warrior
    sim._apply_seat_unit_actions(0, ua)
    hp_melee = int(sim.unit_hp[0, p])
    dead_melee = not bool(sim.unit_alive[0, p])
    assert dead_melee or hp_melee <= hp0 - 1, f"melee attacker took no retaliation? ({hp0} -> {hp_melee})"
    sim.restore(snap)
    print(f"  melee OK: attacker hp {hp0}->{'dead' if dead_melee else hp_melee} (retaliation felt)")
    print("RANGED STRIKE OK")


def defender_state_from_snap(snap, tile):
    # the snapshot stores the MERGED occupancy plane, so the window a slot
    # falls in names its owner class
    _m = int(snap["mut"]["military_at"][0, tile])
    if _m >= MAJOR_POOL_MAX:
        b = _m - MAJOR_POOL_MAX
        return ("barb", b, int(pool_view(snap, "barb", "hp")[0, b]), bool(pool_view(snap, "barb", "alive")[0, b]))
    assert _m >= 0
    return ("major", _m, int(pool_view(snap, "major", "hp")[0, _m]), bool(pool_view(snap, "major", "alive")[0, _m]))


if __name__ == "__main__":
    main()
