"""A garrison does not shield its city — #51/S7.10a.

    python gpu/city_first_test.py

WHY THIS EXISTS. The player's melee and ranged city branches were gated on
`(bslot < 0) & ~v_ok` — no unit on the tile — so a MILITARY garrison standing on
an at-war rival's city centre absorbed an attack aimed at the city. The
`enemyCity` arm (a hostile attacking the PLAYER's city) has never carried that
gate, so the same garrison shielded a rival city and shielded nothing in a
player city. That is the asymmetry this task exists to destroy.

In Civ 6 a garrisoned unit adds its strength to the CITY's defence; it is not a
separate defender standing in front of it.
  https://forums.civfanatics.com/threads/669378/

A LONE CIVILIAN still wins, and that is deliberate. B-31 kills it ROLL-FREE and
advances, and P2's reshuffle pinned that against TS at seed 9053 t204 — a rival
builder on an at-war rival centre, where besieging the city instead cost 2 extra
draws. Civilians cannot defend, so a city is never attacked "through" one.

The scripted parity gate barely reaches this (`export-gpu.ts` never issues a
player attack), so without this lane the precedence would rest on the rollout
alone. Both cases below are asserted, and the negative twin is the civilian.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import PLAYER_SEAT, P_MAX


def build():
    rules = load_rules()
    sim = BatchSim([load_fixture(sorted(FIXTURES.glob("seed*.json"))[0])], rules,
                   device="cpu", dtype=torch.float64)
    for _ in range(40):
        sim.step()
    assert sim.R > 0, "needs a rival"
    return sim


def rival_centre(sim) -> tuple[int, int]:
    """An ALIVE rival city centre, and a free land neighbour to attack from."""
    for r in range(sim.R):
        for j in range(sim.RC):
            if not bool(sim.rc_alive[0, r, j]):
                continue
            ctr = int(sim.rc_center[0, r, j])
            for nb in sim.neigh[ctr].tolist():
                if nb < 0 or not bool(sim.passable[0, nb]):
                    continue
                if int(sim.occ_mil[0, nb]) >= 0 or int(sim.occ_civ[0, nb]) >= 0:
                    continue
                sim.r_atwar[0, r] = True
                sim.sync_war()
                return ctr, nb
    raise AssertionError("no alive rival centre with a free neighbour")


def put_player_melee(sim, tile: int) -> int:
    slot = int(sim.p_next[0])
    sim.p_alive[0, slot] = True
    sim.p_type[0, slot] = 2  # WARRIOR
    sim.p_tile[0, slot] = tile
    sim.p_hp[0, slot] = 100
    sim.p_seat[0, slot] = PLAYER_SEAT
    sim.p_mp[0, slot] = 2
    sim.p_mp_full[0, slot] = 2
    sim.occ_mil[0, tile] = slot + sim.POOL_LO["p"]
    sim.p_next[0] += 1
    return slot


def garrison(sim, ctr: int, civilian: bool) -> int:
    """Put a RIVAL unit on the city centre — military, or a civilian."""
    slot = int(sim.v_next[0])
    sim.v_alive[0, slot] = True
    sim.v_civ[0, slot] = 0
    sim.v_seat[0, slot] = 1
    sim.v_type[0, slot] = sim._builder_idx if civilian else 2
    sim.v_tile[0, slot] = ctr
    sim.v_hp[0, slot] = 100
    if civilian:
        sim.occ_civ[0, ctr] = slot + sim.POOL_LO["v"]
    else:
        sim.occ_mil[0, ctr] = slot + sim.POOL_LO["v"]
    sim.v_next[0] += 1
    return slot


def run(civilian: bool) -> tuple[int, int]:
    """Returns (city hp delta, garrison hp delta) after one player melee."""
    sim = build()
    ctr, from_tile = rival_centre(sim)
    g = garrison(sim, ctr, civilian)
    p = put_player_melee(sim, from_tile)

    r, j = next((r, j) for r in range(sim.R) for j in range(sim.RC)
                if bool(sim.rc_alive[0, r, j]) and int(sim.rc_center[0, r, j]) == ctr)
    hp0 = int(sim.rc_hp[0, r, j])
    g_hp0 = int(sim.v_hp[0, g])

    # the melee action toward the centre
    d = next(i for i, nb in enumerate(sim.neigh[from_tile].tolist()) if nb == ctr)
    act = torch.zeros(sim.B, P_MAX, dtype=torch.long)
    act[0, p] = 6 + d
    sim._apply_unit_actions(act)

    dead = not bool(sim.v_alive[0, g])
    return hp0 - int(sim.rc_hp[0, r, j]), (g_hp0 if dead else g_hp0 - int(sim.v_hp[0, g]))


def main() -> None:
    city_d, garr_d = run(civilian=False)
    print(f"  MILITARY garrison: city -{city_d} hp, garrison -{garr_d} hp")
    assert city_d > 0, (
        "a MILITARY garrison still shields its city — the attack hit the unit "
        "instead of the city (#51/S7.10a: a garrison adds to CITY strength, it "
        "is not a separate defender)"
    )
    assert garr_d == 0, (
        f"the garrison took {garr_d} damage — the city should take the whole "
        "roll through it"
    )

    city_c, garr_c = run(civilian=True)
    print(f"  LONE CIVILIAN    : city -{city_c} hp, civilian -{garr_c} hp")
    assert city_c == 0, (
        "the city took damage through a LONE CIVILIAN — B-31 kills it roll-free "
        "and P2's reshuffle pinned that against TS at seed 9053 t204"
    )
    print("CITY-FIRST OK — a military garrison shields nothing, a lone civilian still does")


if __name__ == "__main__":
    main()
