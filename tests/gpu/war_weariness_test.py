"""War weariness per combat (Player_Diplomacy 0x1fb680) — the
tests/cpu/seats/war-weariness.test.ts twin.

    python tests/gpu/war_weariness_test.py

Every rule below is poked directly, through the same seat-generic entry points
both engines call: each side of a combat between two majors scores
trunc(loc x base x (100 + pct) / 100), the attacker's base 16 + the game era's
WarmongerPoints x the war's percent / 100, the defender's 16 - the war's
percent; loc 1 on its own or an ally's plot with a unit, else 2, + 3 where its
unit died.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build():
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    assert sim.n_majors >= 3, "needs two civs to poke simultaneous wars"
    for _ in range(20):
        sim.step()
    sim.war[:, 0, 1:sim.n_majors] = sim.war[:, 1:sim.n_majors, 0] = False
    sim.war[:, 1:sim.n_majors, 1:sim.n_majors] = False
    sim.sync_war()  # close the pokes under transpose
    sim.seat_warkind[:] = 0
    sim.ww[:] = 0
    return sim
def one(sim) -> torch.Tensor:
    return torch.ones(sim.B, dtype=torch.bool)


def owned_tile(sim, seat: int) -> torch.Tensor:
    for t in range(sim.T):
        if bool((sim.tile_seat[:, t] == seat).all()):
            return torch.full((sim.B,), t, dtype=torch.long)
    raise AssertionError(f"no tile owned by seat {seat}")


def neutral_tile(sim) -> torch.Tensor:
    for t in range(sim.T):
        if bool((sim.tile_seat[:, t] < 0).all()):
            return torch.full((sim.B,), t, dtype=torch.long)
    raise AssertionError("no unowned tile")


def main() -> None:
    sim = build()
    rww = sim.rules.war_weariness
    home_m, abroad, death = int(rww["home"]), int(rww["abroad"]), int(rww["death"])
    per = int(rww["perAmenity"])
    # a war of no kind: the war's percent 0, both bases WAR_WEARINESS_WARMONGER_BASE
    b = int(rww["base"])

    away, home = neutral_tile(sim), owned_tile(sim, 0)

    # --- a war of no kind scores both sides at the base -------------------
    sim.ww[:] = 0
    sim._ww_battle(one(sim), 0, 1, away)
    assert int(sim.ww[0, 0, 1]) == b * abroad, int(sim.ww[0, 0, 1])
    assert int(sim.ww[0, 1, 0]) == b * abroad, int(sim.ww[0, 1, 0])
    print(f"  both sides score {b * abroad} on neutral ground")

    # --- a unit on its own plot scores the home loc -----------------------
    sim.ww[:] = 0
    sim._ww_battle(one(sim), 1, 0, home)
    assert int(sim.ww[0, 0, 1]) == b * home_m, "the defender at home pays the home loc"
    assert int(sim.ww[0, 1, 0]) == b * abroad, "the invader pays the abroad loc"
    print(f"  one battle, two locs: home {b * home_m} vs abroad {b * abroad}")

    # --- a city side has no unit: the abroad loc --------------------------
    sim.ww[:] = 0
    sim._ww_battle(one(sim), 1, 0, home, d_city=True)
    assert int(sim.ww[0, 0, 1]) == b * abroad, "a city side scores abroad"
    print("  a city side scores at the abroad loc")

    # --- a death adds three to the loc of the side that lost the unit -----
    sim.ww[:] = 0
    sim._ww_battle(one(sim), 0, 1, away, d_died=one(sim))
    assert int(sim.ww[0, 0, 1]) == b * abroad, "the survivor pays no death term"
    assert int(sim.ww[0, 1, 0]) == b * (abroad + death), int(sim.ww[0, 1, 0])
    print(f"  the loser pays {death} more: {int(sim.ww[0, 1, 0])} vs {int(sim.ww[0, 0, 1])}")

    # --- a Surprise war: the attacker 16 + the game era's points x 150%, the defender nothing
    sim.ww[:] = 0
    sim.game_era[:] = 4
    sim.seat_warkind[:, 0, 1] = 1
    sim.seat_warkind[:, 1, 0] = -1
    sim._ww_battle(one(sim), 0, 1, away, d_died=one(sim))
    assert int(sim.ww[0, 0, 1]) == 52 * abroad, int(sim.ww[0, 0, 1])
    assert int(sim.ww[0, 1, 0]) == 0, int(sim.ww[0, 1, 0])
    sim.seat_warkind[:] = 0
    sim.game_era[:] = 0
    print("  a Surprise war: the attacker's base 52 at Industrial, the defender none")

    # --- BARBARIANS and CITY-STATES neither accrue it nor inflict it ------
    sim.ww[:] = 0
    barb = int(sim.BARB_ROW)
    sim._ww_battle(one(sim), 0, barb, away, d_died=one(sim))
    sim._ww_battle(one(sim), barb, 0, away, d_died=one(sim))
    sim._ww_battle(one(sim), 0, sim.n_majors, away, d_city=True)
    assert int(sim.ww.sum()) == 0, "a fight with a barbarian or a city-state scored war weariness"
    print("  barbarians and city-states score nothing, in either direction")

    # --- wars score SEPARATELY --------------------------------------------
    sim.ww[:] = 0
    sim._ww_battle(one(sim), 0, 1, away)
    sim._ww_battle(one(sim), 0, 1, away)
    sim._ww_battle(one(sim), 0, 2, away)
    step = b * abroad
    assert int(sim.ww[0, 0, 1]) == step * 2 and int(sim.ww[0, 0, 2]) == step, sim.ww[0, 0, :3]
    assert int(sim._ww_sum(0)[0]) == step * 3, int(sim._ww_sum(0)[0])
    print(f"  each war its own accumulator ({step * 2}, {step})")

    # --- decay: 50 from an opponent at war, 200 from one at peace ---------
    sim.ww[:] = 0
    sim.ww[:, 0, 1] = 1000
    sim.ww[:, 0, 2] = 1000
    sim.war[:, 0, 1 + 0] = sim.war[:, 1 + 0, 0] = True
    sim.sync_war()
    sim._ww_decay(0)
    assert int(sim.ww[0, 0, 1]) == 1000 - int(rww["decayAtWar"]), int(sim.ww[0, 0, 1])
    assert int(sim.ww[0, 0, 2]) == 1000 - int(rww["decayAtPeace"]), int(sim.ww[0, 0, 2])
    sim.war[:, 0, 1 + 0] = sim.war[:, 1 + 0, 0] = False
    sim.sync_war()
    print(f"  decay: {int(rww['decayAtWar'])} at war with the opponent, {int(rww['decayAtPeace'])} at peace")

    # --- a peace treaty settles THAT war and no other ---------------------
    sim.ww[:] = 0
    sim.ww[:, 0, 1] = 900
    sim.ww[:, 0, 2] = 900
    sim._ww_peace(one(sim), 0, 1)
    assert int(sim.ww[0, 0, 1]) == 0, "the treaty sheds 2000, floored at zero"
    assert int(sim.ww[0, 0, 2]) == 900, "the OTHER war is untouched"
    print(f"  a treaty sheds {int(rww['peaceTreaty'])} from one war only")

    # --- the amenity loss, split over the cities by founder --------------
    # [founder, population]: two of row 0's own, one each of the at-war
    # opponent 1, the at-peace opponent 2 and a third row 3 with no weariness
    snap_l = sim.snapshot()
    sim.ww[:] = 0
    rows = ((0, 6), (0, 4), (1, 5), (2, 2), (3, 3))
    sim.city_alive[:, 0] = False
    for k, (f, pop) in enumerate(rows):
        sim.city_alive[:, 0, k] = True
        sim.city_founder[:, 0, k] = f
        sim.city_pop[:, 0, k] = pop
    sim.ww[:, 0, 1] = per * 10
    sim.ww[:, 0, 2] = per * 3 + per - 1
    sim.war[:, 0, :] = sim.war[:, :, 0] = False
    sim.war[:, 0, 1] = sim.war[:, 1, 0] = True

    def losses() -> list[int]:
        return [int(x) for x in sim._ww_losses(0)[0, :len(rows)]]

    # opponent 1: 10 to its city, need 3 + 3; opponent 2: 3, need 1 + 1; the
    # pool 5 to the third party's city (need 2 + 1), then 2 to row 0's most
    # populous city (need 3 + 0)
    assert losses() == [2, 0, 6, 2, 3], losses()
    sim.war[:, 0, 1] = sim.war[:, 1, 0] = False
    assert losses() == [3, 1, 4, 2, 3], losses()
    sim.ww[:, 0, :] = 0
    sim.ww[:, 0, 3] = per * 50
    assert losses() == [3, 2, 4, 2, 3], losses()
    assert int(sim._ww_losses(1)[0].sum()) == 0, "civ 1 has fought nothing"
    sim.restore(snap_l)
    print(f"  each opponent's WWP // {per} to its founded cities, third parties', then the seat's own, capped by need")

    # --- the accumulator round-trips snapshot/restore ---------------------
    sim.ww[:] = 0
    sim.ww[:, 0, 1] = 4321
    snap = sim.snapshot()
    sim.ww[:, 0, 1] = 0
    sim.restore(snap)
    assert int(sim.ww[0, 0, 1]) == 4321, "ww lost in snapshot/restore"

    # --- a war DECLARED but never fought costs nothing -------------------
    sim = build()
    sim.war[:, 0, 1 + 0] = sim.war[:, 1 + 0, 0] = True
    sim.sync_war()
    for _ in range(30):
        sim.step()
    assert int(sim._ww_sum(0)[0]) == 0, (
        f"a phoney war accrued {int(sim._ww_sum(0)[0])}. The per-BATTLE model's "
        "whole point is that DECLARING a war costs nothing — the old flat "
        "+1/turn could not tell a phoney war from a bloody one"
    )
    print("  30 turns of a declared, unfought war cost nothing")

    print("WAR WEARINESS OK — per-combat accrual, per-war accumulators, no ceiling")


if __name__ == "__main__":
    main()
