"""WINNING A FIGHT IS NOT A GRANT OF ENTRY.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/advance_borders_test.py

CIV6 (Movement): a unit may enter another empire's territory only with Open
Borders, an alliance or a war. A melee victor advancing into the tile it just
cleared is ENTERING that tile, so the same rule binds it — killing a barbarian
standing inside a third party's land leaves the winner where it stood, because
the attacker is at war with the barbarian and not with the owner of the ground.

`tileFreeForUnit` is the TS twin and has always asked `borderClosedTo`; the GPU
advance asked terrain and occupancy alone, so it walked in. Seed 9131 t88 was
one Warrior standing a tile apart because of it.

Proven here in both directions, because a refusal that is really a broken
scenario proves nothing:
  * closed foreign ground: the defender dies and the victor STAYS;
  * the same kill with the border opened by WAR, by an ALLIANCE, by a GRANT,
    and on the owner's own ground: the victor ADVANCES;
  * a religious unit ignores borders and an INQUISITOR does not, on the same
    list the ordinary move reads;
  * the roll-free CIVILIAN advance is barbarian-only (a major captures and
    stays) and a barbarian is never border-bound, so that arm's gate is inert
    by construction — written alike so the two cannot drift.
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
ATT, OWNER = 0, 1          # attacker seat row, and the seat that owns the ground


def build(rules, path) -> BatchSim:
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    return sim


def place(sim, tile: int, seat: int, utype: int = 2, hp: int = 100, civilian: bool = False) -> int:
    slot = int(sim.unit_next[B0])
    sim.major_unit_alive[B0, slot] = True
    sim.major_unit_seat[B0, slot] = seat
    sim.major_unit_type[B0, slot] = utype
    sim.major_unit_tile[B0, slot] = tile
    sim.major_unit_hp[B0, slot] = hp
    sim.major_unit_charges[B0, slot] = 0
    sim.major_unit_fortify[B0, slot] = 0
    (sim.civilian_at if civilian else sim.military_at)[B0, tile] = slot + sim.POOL_LO["major"]
    sim.unit_next[B0] += 1
    return slot


def pair(sim) -> tuple[int, int]:
    """A free unclaimed land tile with a free unclaimed land neighbour."""
    for t in range(sim.T):
        if not bool(sim.passable[B0, t]) or int(sim.tile_seat[B0, t]) >= 0:
            continue
        if int(sim.military_at[B0, t]) >= 0 or int(sim.civilian_at[B0, t]) >= 0:
            continue
        for n in sim.neigh[t].tolist():
            if n < 0 or not bool(sim.passable[B0, n]) or int(sim.tile_seat[B0, n]) >= 0:
                continue
            if int(sim.military_at[B0, n]) >= 0 or int(sim.civilian_at[B0, n]) >= 0:
                continue
            return t, n
    raise AssertionError("no free unclaimed adjacent land pair on this fixture")


def bump(sim) -> None:
    sim.sync_war()
    sim._eff_version += 1
    sim._tile_owner_ver += 1


def close_the_ground(sim, tile: int) -> None:
    """OWNER holds `tile` and has the civic that shuts it; the attacker holds
    no war, no alliance and no grant against that seat."""
    sim.tile_seat[B0, tile] = OWNER
    sim.civ_civics[:, OWNER, sim._open_borders_civic] = True
    sim.war[B0, ATT, OWNER] = sim.war[B0, OWNER, ATT] = False
    sim.seat_ally_turns[B0, ATT, OWNER] = 0
    sim.seat_ally_turns[B0, OWNER, ATT] = 0
    sim.seat_borders_turns[B0, OWNER, ATT] = 0
    bump(sim)


def scene(rules, path, civilian: bool = False):
    """The attacker beside a doomed defender standing on OWNER's closed ground.
    The DEFENDER is a third seat wherever the roster has one, so the war that
    licenses the attack is never a war with the ground's owner."""
    sim = build(rules, path)
    here, there = pair(sim)
    close_the_ground(sim, there)
    atk = place(sim, here, ATT)
    d_seat = OWNER + 1 if sim.n_majors > 2 else OWNER
    place(sim, there, d_seat, hp=1, civilian=civilian,
          utype=sim._builder_idx if civilian else 2)
    sim.war[B0, ATT, d_seat] = sim.war[B0, d_seat, ATT] = True
    bump(sim)
    return sim, here, there, atk


def kill_and_see(sim, there: int, atk: int, civilian_target: bool = False) -> bool:
    """Run the melee, assert the defender really died, and report whether the
    victor moved onto the ground it cleared."""
    att = torch.zeros(sim.B, dtype=torch.bool)
    att[B0] = True
    tgt = torch.full((sim.B,), there, dtype=torch.long)
    sim._hostile_vs_unit(att, tgt, "major", atk)
    plane = sim.civilian_at if civilian_target else sim.military_at
    moved = int(sim.major_unit_tile[B0, atk]) == there
    assert int(plane[B0, there]) < 0 or moved, \
        "the defender survived — the scenario proves nothing"
    return moved


# ---------------------------------------------------------------------------


def test_closed_ground_holds_the_victor(rules, path) -> None:
    sim, here, there, atk = scene(rules, path)
    assert not kill_and_see(sim, there, atk), \
        "the victor walked into territory closed to it"
    assert int(sim.major_unit_tile[B0, atk]) == here, "the victor moved somewhere else entirely"
    print("  1 closed OK — the defender died and the victor stayed put")


def test_every_opening_lets_it_in(rules, path) -> None:
    opened = []
    for name in ("war", "alliance", "grant", "own ground"):
        sim, here, there, atk = scene(rules, path)
        if name == "war":
            sim.war[B0, ATT, OWNER] = sim.war[B0, OWNER, ATT] = True
        elif name == "alliance":
            sim.seat_ally_turns[B0, ATT, OWNER] = 5
        elif name == "grant":
            sim.seat_borders_turns[B0, OWNER, ATT] = 5
        else:
            sim.tile_seat[B0, there] = ATT
        bump(sim)
        assert kill_and_see(sim, there, atk), \
            f"{name} opened the border and the victor still refused to advance"
        opened.append(name)
    print(f"  2 openings OK — {', '.join(opened)} each admit the victor")


def test_the_religious_exception(rules, path) -> None:
    sim, _here, there, _atk = scene(rules, path)
    rel = [i for i in range(sim.NU) if float(sim._rel_strength[i]) > 0
           and i != sim._inquisitor_idx]
    assert rel, "no religious unit in the catalog"
    tiles = torch.full((sim.B, 1), there, dtype=torch.long)
    free = sim._border_closed(tiles, ATT, torch.full((sim.B, 1), rel[0], dtype=torch.long))
    shut = sim._border_closed(tiles, ATT, torch.full((sim.B, 1), sim._inquisitor_idx, dtype=torch.long))
    assert not bool(free[B0, 0]), "a religious unit was refused foreign ground"
    assert bool(shut[B0, 0]), "the INQUISITOR walked into closed ground"
    # ...and the gate the ADVANCE asks answers the same for both
    for ut, want in ((rel[0], True), (int(sim._inquisitor_idx), False)):
        got = bool(sim._advance_open(
            torch.full((sim.B,), ut, dtype=torch.long),
            torch.full((sim.B,), ATT, dtype=torch.long),
            torch.full((sim.B,), there, dtype=torch.long))[B0])
        assert got == want, f"unit type {ut}: the advance says {got}, the border says {want}"
    print("  3 religious OK — the exception list is the move's, and the advance shares it")


def test_the_civilian_arm_is_barbarian_only(rules, path) -> None:
    """The roll-free civilian arm advances for a NON-major only: a major
    CAPTURES the civilian and stays on its own tile, so `kill_adv` is empty for
    it. The pool that DOES advance there is the barbarian one, and a barbarian
    is never border-bound — `borderClosedTo` answers only for a civ. The gate
    on that arm is therefore inert, written the same way as the military one so
    the two cannot drift rather than because it can refuse anything."""
    sim, here, there, atk = scene(rules, path, civilian=True)
    att = torch.zeros(sim.B, dtype=torch.bool)
    att[B0] = True
    sim._hostile_vs_unit(att, torch.full((sim.B,), there, dtype=torch.long), "major", atk)
    cap = int(sim.civilian_at[B0, there])
    assert cap >= 0 and int(sim.unit_seat[B0, cap]) == ATT, \
        "the civilian was neither captured nor cleared — the scenario proves nothing"
    assert int(sim.major_unit_tile[B0, atk]) == here, \
        "the captor advanced — a major must stay on the tile it took the civilian from"
    # ...and the border never binds the pool that DOES advance on this arm
    barb = sim.n_majors     # any row past the majors answers as a barbarian does
    assert bool(sim._advance_open(
        torch.full((sim.B,), 2, dtype=torch.long),
        torch.full((sim.B,), barb, dtype=torch.long),
        torch.full((sim.B,), there, dtype=torch.long))[B0]), \
        "a non-major was refused ground — borderClosedTo answers only for a civ"
    print("  4 civilian arm OK — a major captures and stays; the barbarian that advances walks free")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_closed_ground_holds_the_victor(rules, path)
    test_every_opening_lets_it_in(rules, path)
    test_the_religious_exception(rules, path)
    test_the_civilian_arm_is_barbarian_only(rules, path)
    print("BATTERY OK advance_borders")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
