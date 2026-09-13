"""A Varu (or Toa) beside the SHOOTER weakens the shot, not only the melee blow.

    python tests/gpu/varu_ranged_test.py

CIV6 (Varu): "-5 Combat Strength to adjacent enemy units". TS reads
`chassisAbilityCS(attacker, ...)` in `rangedAttack` and `hostileRangedStrikeInner`
as it does in `meleeAttack`; the GPU's two ranged paths once added the term
for the DEFENDER only, and the battery caught it at seed 9027 turn 182 — a
Slinger shooting from beside a freshly bought Varu at 10 instead of 5.

The scripted gate reaches this only when a carrier happens to stand beside a
shooter, so this lane builds it by hand: the same shot from a snapshot, once
with the Varu beside the shooter and once without, and reads the attacker's
strength off the combat log's `a<tenths>` field. The two must differ by
exactly the carrier's amount.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build():
    rules = load_rules()
    paths = fixture_paths()[:1]
    sim = settle_all(BatchSim([load_fixture(p) for p in paths], rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    return sim


def place(sim, tile, seat, utype, hp=100):
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = utype
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = hp
    sim.military_at[0, tile] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1
    return slot


def free(sim, t) -> bool:
    return (t >= 0 and bool(sim.passable[0, t])
            and int(sim.military_at[0, t]) < 0 and int(sim.civilian_at[0, t]) < 0)


def scenario(sim):
    """A free land tile with TWO free land neighbours: the shooter's tile,
    the target's and the carrier's."""
    for t in range(sim.T):
        if not free(sim, t):
            continue
        ns = [n for n in sim.neigh[t].tolist() if free(sim, n)]
        if len(ns) >= 2:
            return t, ns[0], ns[1]
    raise AssertionError("no free land tile with two free neighbours")


def attacker_strength(sim, att, tgt, v) -> int:
    sim._combat_events.clear()
    sim._ranged_attack(att, tgt, "major", v, 1)
    ev = [e for e in sim._combat_events if e.startswith("k:rng ")]
    assert ev, f"no ranged roll was logged: {sim._combat_events}"
    m = re.search(r" a(-?\d+) d(-?\d+)", ev[-1])
    assert m, f"the ranged CB line carries no strength split: {ev[-1]}"
    return int(m.group(1))


def main() -> None:
    sim = build()
    carriers = (sim._type_adj_enemy_cs != 0).nonzero().flatten().tolist()
    if not carriers:
        print("  SKIPPED — no adjacent-enemy carrier (Varu/Toa) in the roster")
        return
    varu = carriers[0]
    amt = int(sim._type_adj_enemy_cs[varu])
    shooter = next(i for i in range(sim.NU) if float(sim._type_ranged_strength[i]) > 0)
    a_tile, t_tile, c_tile = scenario(sim)
    v = place(sim, a_tile, seat=1, utype=shooter)  # the absolute seat of civ 0
    place(sim, t_tile, seat=0, utype=2)  # WARRIOR, seat 0's
    sim.war[0, 0, 1] = sim.war[0, 1, 0] = True
    sim.sync_war()
    sim._log_combat_b = 0
    att = torch.zeros(sim.B, dtype=torch.bool)
    att[0] = True
    tgt = torch.full((sim.B,), t_tile, dtype=torch.long)

    base = sim.snapshot()
    a_alone = attacker_strength(sim, att, tgt, v)
    sim.restore(base)
    place(sim, c_tile, seat=0, utype=varu)  # the carrier beside the shooter
    a_beside = attacker_strength(sim, att, tgt, v)
    assert a_beside == a_alone + amt * 10, (
        f"a carrier beside the shooter reads {a_beside} against {a_alone} alone — "
        f"the ranged attacker must carry chassisAbilityCS ({amt})"
    )
    print(f"  ranged: shooter {a_alone / 10:.0f} alone, {a_beside / 10:.0f} beside a carrier ({amt}) — VARU RANGED OK")


if __name__ == "__main__":
    main()
