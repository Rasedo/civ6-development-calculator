"""War weariness is scored PER BATTLE — the
tests/cpu/seats/war-weariness.test.ts twin.

    python tests/gpu/war_weariness_test.py

The scripted parity gate proves the two engines AGREE, never that either agrees
with Civ 6, and it reaches only the wars its seeds happen to fight — Ancient and
Classical bases, no city-state combat, no simultaneous wars. Every rule below is
poked directly instead, through the same seat-generic entry points both engines
call.

    WWP = (EraBase * Location) + Death

Location 1 at home / 2 abroad; Death = 3 * EraBase to the side that lost a unit;
any battle with a CITY at the abroad column; both sides score, "without any
discrimination".
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES


def build():
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert sim.R >= 2, "needs two civs to poke simultaneous wars"
    for _ in range(20):
        sim.step()
    sim.war[:, 0, 1:1 + sim.R] = sim.war[:, 1:1 + sim.R, 0] = False
    sim.war[:, 1:1 + sim.R, 1:1 + sim.R] = False
    sim.sync_war()  # close the pokes under transpose
    sim.ww[:] = 0
    sim.ww_turn[:] = -1
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
    abroad, death = int(rww["abroad"]), int(rww["death"])
    per = int(rww["perAmenity"])
    # Ancient SURPRISE — the one row of the sourced table where a casus belli
    # buys nothing (formal == surprise); the premium opens at Classical.
    b = int(rww["eraSurprise"][0])
    assert int(rww["eraFormal"][0]) == b, "Ancient formal and surprise are equal"
    assert int(rww["eraSurprise"][1]) > int(rww["eraFormal"][1]), "the premium opens at Classical"

    away, home = neutral_tile(sim), owned_tile(sim, 0)

    # --- both sides score, and the aggressor gets no discount --------------
    sim.ww[:] = 0
    sim._ww_battle(one(sim), 0, 1, away)
    assert int(sim.ww[0, 0, 1]) == b * abroad, int(sim.ww[0, 0, 1])
    assert int(sim.ww[0, 1, 0]) == b * abroad, int(sim.ww[0, 1, 0])
    print(f"  both sides score {b * abroad} on neutral ground")

    # --- HOME is half of ABROAD, per side, on the SAME battle --------------
    sim.ww[:] = 0
    sim._ww_battle(one(sim), 0, 1, home)
    assert int(sim.ww[0, 0, 1]) == b, "the defender at home pays a single base"
    assert int(sim.ww[0, 1, 0]) == b * abroad, "the invader pays double"
    print(f"  one battle, two multipliers: home {b} vs abroad {b * abroad}")

    # --- a CITY forces the abroad column for BOTH --------------------------
    sim.ww[:] = 0
    sim._ww_battle(one(sim), 0, 1, home, city=True)
    assert int(sim.ww[0, 0, 1]) == b * abroad, "a city drags its own defender abroad"
    print("  a city giving or receiving the attack scores at the abroad column")

    # --- a death costs the side that LOST the unit, and only that side -----
    sim.ww[:] = 0
    sim._ww_battle(one(sim), 0, 1, away, d_died=one(sim))
    assert int(sim.ww[0, 0, 1]) == b * abroad, "the survivor pays no death term"
    assert int(sim.ww[0, 1, 0]) == b * abroad + death * b, int(sim.ww[0, 1, 0])
    print(f"  the loser pays {death} more bases: {int(sim.ww[0, 1, 0])} vs {int(sim.ww[0, 0, 1])}")

    # --- BARBARIANS neither accrue it nor inflict it -----------------------
    sim.ww[:] = 0
    barb = int(sim.BARB_ROW)
    sim._ww_battle(one(sim), 0, barb, away, d_died=one(sim))
    sim._ww_battle(one(sim), barb, 0, away, d_died=one(sim))
    assert int(sim.ww.sum()) == 0, (
        "a barbarian fight scored war weariness. Every seat is permanently "
        "hostile to barbarians, so counting it makes 'at peace with everyone' "
        "unreachable for the whole game and no accumulator can ever drain"
    )
    print("  barbarians score nothing, in either direction")

    # --- a CITY-STATE is a real opponent but holds no accumulator ---------
    sim.ww[:] = 0
    citystate_row = 1 + sim.R
    sim._ww_battle(one(sim), 0, citystate_row, away, city=True)
    assert int(sim.ww[0, 0, citystate_row]) > 0, "warring a minor wears you down normally"
    assert int(sim.ww[0, citystate_row, :].sum()) == 0, "a minor keeps no accumulator"
    print("  a city-state is a valid opponent and holds nothing itself")

    # --- wars score SEPARATELY; only the worst is felt --------------------
    sim.ww[:] = 0
    sim._ww_battle(one(sim), 0, 1, away)
    sim._ww_battle(one(sim), 0, 1, away)
    sim._ww_battle(one(sim), 0, 2, away)
    step = b * abroad
    assert int(sim._ww_max(0)[0]) == step * 2, int(sim._ww_max(0)[0])
    assert int(sim._ww_sum(0)[0]) == step * 3, int(sim._ww_sum(0)[0])
    print(f"  the max {step * 2} is the worst war, NOT the sum {step * 3}")

    # --- decay: fought this turn / phoney / at peace with everyone --------
    sim.ww[:] = 0
    sim.ww_turn[:] = -1
    sim.ww[:, 0, 1] = 1000
    sim.ww[:, 0, 2] = 1000
    sim.ww_turn[:, 0, 1] = int(sim.turn)  # blood was spilled against civ 0
    sim.war[:, 0, 1 + 0] = sim.war[:, 1 + 0, 0] = True
    sim.sync_war()
    sim._ww_decay(0)
    assert int(sim.ww[0, 0, 1]) == 1000, "a war fought THIS turn does not decay"
    assert int(sim.ww[0, 0, 2]) == 1000 - int(rww["decayAtWar"]), int(sim.ww[0, 0, 2])
    sim.turn += 1
    sim.war[:, 0, 1 + 0] = sim.war[:, 1 + 0, 0] = False
    sim.sync_war()
    sim._ww_decay(0)
    assert int(sim.ww[0, 0, 1]) == 1000 - int(rww["decayAtPeace"]), int(sim.ww[0, 0, 1])
    print(f"  decay: 0 fought, {int(rww['decayAtWar'])} phoney, {int(rww['decayAtPeace'])} at peace")

    # --- a peace treaty settles THAT war and no other ---------------------
    sim.ww[:] = 0
    sim.ww[:, 0, 1] = 900
    sim.ww[:, 0, 2] = 900
    sim._ww_peace(one(sim), 0, 1)
    assert int(sim.ww[0, 0, 1]) == 0, "the treaty sheds 2000, floored at zero"
    assert int(sim.ww[0, 0, 2]) == 900, "the OTHER war is untouched"
    print(f"  a treaty sheds {int(rww['peaceTreaty'])} from one war only")

    # --- the amenity conversion, with no ceiling -------------------------
    sim.ww[:] = 0
    sim.ww[:, 0, 1] = per * 12 + (per - 1)
    assert int(sim._ww_penalty(0)[0]) == 12, int(sim._ww_penalty(0)[0])
    assert int(sim._ww_penalty(1)[0]) == 0, "civ 0 has fought nothing"
    sim.ww[:, 0, 1] = per - 1
    assert int(sim._ww_penalty(0)[0]) == 0, "the remainder buys nothing"
    print(f"  {per} points buy one amenity, remainder lost, and 12 is reachable (no cap)")

    # --- the accumulator round-trips snapshot/restore ---------------------
    sim.ww[:] = 0
    sim.ww[:, 0, 1] = 4321
    sim.ww_turn[:, 0, 1] = 7
    snap = sim.snapshot()
    sim.ww[:, 0, 1] = 0
    sim.ww_turn[:, 0, 1] = -1
    sim.restore(snap)
    assert int(sim.ww[0, 0, 1]) == 4321, "ww lost in snapshot/restore"
    assert int(sim.ww_turn[0, 0, 1]) == 7, "ww_turn lost in snapshot/restore"
    print("  ww and ww_turn round-trip snapshot/restore")

    # --- a war DECLARED but never fought costs nothing -------------------
    sim = build()
    sim.war[:, 0, 1 + 0] = sim.war[:, 1 + 0, 0] = True
    sim.sync_war()
    for _ in range(30):
        sim.step()
    assert int(sim._ww_max(0)[0]) == 0, (
        f"a phoney war accrued {int(sim._ww_max(0)[0])}. The per-BATTLE model's "
        "whole point is that DECLARING a war costs nothing — the old flat "
        "+1/turn could not tell a phoney war from a bloody one"
    )
    print("  30 turns of a declared, unfought war cost nothing")

    print("WAR WEARINESS OK — per-battle accrual, per-war accumulators, no ceiling")


if __name__ == "__main__":
    main()
