"""THE RELIGIOUS ZONE OF CONTROL — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/religious_zoc_test.py

The TS twin is tests/cpu/units/religious-zoc.test.ts.

CIV6 (Zone of Control): "Many combat units exert a 'Zone of Control'...
RELIGIOUS UNITS EXERT ZOC AGAINST OTHER RELIGIOUS UNITS. Rivers block Zone of
Control from all units." So the two zones never cross: a Missionary walks
through a Musketman's ring, a Musketman walks through an Apostle's, and only a
matching pair halts.

No scripted lane reaches this — religious units are faith-purchased and the
driver never marches one past a hostile.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def idx(rules, name: str) -> int:
    return [u["id"] for u in rules.units].index(name)


def clear_all(sim) -> None:
    """Empty the shared major window and take the barbarians off the board."""
    sim.barb_unit_alive[:] = False
    sim.major_unit_alive[:] = False
    for pl in (sim.military_at, sim.civilian_at, sim.embarked_at):
        pl[:] = -1
    sim.n_camps[:] = sim.max_camps
    sim.camp_tile[:] = -1
    sim.war[:, 0, 1:sim.n_majors] = sim.war[:, 1:sim.n_majors, 0] = False
    sim.war[0, 0, 1] = sim.war[0, 1, 0] = True
    sim.sync_war()


def place(sim, seat: int, t: int, type_idx: int, plane: str, emb: bool = False) -> int:
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = type_idx
    sim.major_unit_tile[0, slot] = t
    sim.major_unit_hp[0, slot] = 100
    sim.major_unit_charges[0, slot] = 0
    sim.major_unit_fortify[0, slot] = 0
    sim.major_unit_emb[0, slot] = emb
    getattr(sim, "embarked_at" if emb else plane)[0, t] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1
    return slot


def halted(sim, dest: int, mover_type: int, row: int = 0) -> bool:
    return bool(sim._in_enemy_zoc(
        torch.full((sim.B,), dest, dtype=torch.long), row,
        torch.full((sim.B,), mover_type, dtype=torch.long))[0])


def pair(sim) -> tuple[int, int]:
    """An adjacent (exerter tile, entered tile) with no river between them and
    nothing standing on either."""
    for t in range(int(sim.T)):
        if not bool(sim.passable[0, t]) or int(sim.river_mask[0, t]) != 0:
            continue
        for d in range(6):
            n = int(sim.neigh[t, d])
            if n < 0 or not bool(sim.passable[0, n]) or int(sim.river_mask[0, n]) != 0:
                continue
            return int(sim.neigh[t, d]), t
    raise AssertionError("no riverless adjacent land pair on this fixture")


# ---------------------------------------------------------------------------


def test_roster(rules, path) -> None:
    sim = build(rules, path)
    for name in ("MISSIONARY", "APOSTLE", "INQUISITOR"):
        assert int(sim._rel_strength[idx(rules, name)]) > 0, f"{name} is not religious"
    for name in ("WARRIOR", "ARCHER", "SETTLER", "BUILDER"):
        assert int(sim._rel_strength[idx(rules, name)]) == 0, f"{name} reads as religious"
    print("  1 roster OK — the religious set is exactly the religious-strength one")


def test_two_zones_never_cross(rules, path) -> None:
    sim = build(rules, path)
    clear_all(sim)
    post, dest = pair(sim)
    WARRIOR, MISSIONARY, APOSTLE = (idx(rules, n) for n in ("WARRIOR", "MISSIONARY", "APOSTLE"))

    place(sim, 1, post, WARRIOR, "military_at")
    assert halted(sim, dest, WARRIOR), "a military unit walked through a military zone"
    assert not halted(sim, dest, MISSIONARY), "a religious unit obeyed a military zone"

    clear_all(sim)
    place(sim, 1, post, APOSTLE, "civilian_at")
    assert halted(sim, dest, MISSIONARY), "a religious unit walked through a religious zone"
    assert not halted(sim, dest, WARRIOR), "a military unit obeyed a religious zone"
    print("  2 two zones OK — each halts its own kind and neither halts the other")


def test_the_religious_zone_obeys_the_rest(rules, path) -> None:
    sim = build(rules, path)
    clear_all(sim)
    post, dest = pair(sim)
    MISSIONARY, APOSTLE = idx(rules, "MISSIONARY"), idx(rules, "APOSTLE")

    slot = place(sim, 1, post, APOSTLE, "civilian_at")
    assert halted(sim, dest, MISSIONARY)

    # an EMBARKED exerter exerts nothing — it is not on the civilian plane
    sim.civilian_at[0, post] = -1
    sim.embarked_at[0, post] = slot + sim.POOL_LO["major"]
    sim.major_unit_emb[0, slot] = True
    assert not halted(sim, dest, MISSIONARY), "an embarked religious unit exerted a zone"
    sim.embarked_at[0, post] = -1
    sim.civilian_at[0, post] = slot + sim.POOL_LO["major"]
    sim.major_unit_emb[0, slot] = False

    # a river between the two blocks it, exactly as it blocks the military one
    sim.river_mask[0, dest] = 0x3F
    assert not halted(sim, dest, MISSIONARY), "a river did not block the religious zone"
    sim.river_mask[0, dest] = 0

    # ...and PEACE ends it
    sim.war[0, 0, 1] = sim.war[0, 1, 0] = False
    sim.sync_war()
    assert not halted(sim, dest, MISSIONARY), "a unit at peace exerted a zone"
    print("  3 clauses OK — embarked, river and peace all end the religious zone")


def test_a_plain_civilian_exerts_nothing(rules, path) -> None:
    sim = build(rules, path)
    clear_all(sim)
    post, dest = pair(sim)
    MISSIONARY, BUILDER = idx(rules, "MISSIONARY"), idx(rules, "BUILDER")
    place(sim, 1, post, BUILDER, "civilian_at")
    assert not halted(sim, dest, MISSIONARY), "a Builder halted a Missionary"
    assert not halted(sim, dest, idx(rules, "WARRIOR")), "a Builder halted a Warrior"
    print("  4 plain civilian OK — it stands on the same plane and exerts nothing")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_roster(rules, path)
    test_two_zones_never_cross(rules, path)
    test_the_religious_zone_obeys_the_rest(rules, path)
    test_a_plain_civilian_exerts_nothing(rules, path)
    print("BATTERY OK religious_zoc")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
