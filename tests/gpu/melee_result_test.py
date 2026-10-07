"""THE MELEE RESULT — the GPU twin of tests/cpu/units/melee-result.test.ts.

GameCore_XP2_Release.dll 0x206960, as `_melee_exchange` runs it:
  * where both blows would kill, the side the blow overshot further falls and
    the other stands at 1 HP, the attacker on a tie (`resolveMutualKill`);
  * an embarked defender strikes no blow back and its counter is never drawn;
  * an attack ends the attacker's fortification (`_spend_one_attack`).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths
from warmup import opened

B0 = 0


def place(sim, tile: int, seat: int, utype: int = 2, hp: int = 100) -> int:
    slot = int(sim.unit_next[B0])
    sim.major_unit_alive[B0, slot] = True
    sim.major_unit_seat[B0, slot] = seat
    sim.major_unit_type[B0, slot] = utype
    sim.major_unit_tile[B0, slot] = tile
    sim.major_unit_hp[B0, slot] = hp
    sim.major_unit_charges[B0, slot] = 0
    sim.major_unit_fortify[B0, slot] = 0
    sim.military_at[B0, tile] = slot + sim.POOL_LO["major"]
    sim.unit_next[B0] += 1
    return slot


def pair(sim) -> tuple[int, int]:
    for t in range(sim.T):
        if not bool(sim.passable[B0, t]) or int(sim.military_at[B0, t]) >= 0:
            continue
        for n in sim.neigh[t].tolist():
            if n >= 0 and bool(sim.passable[B0, n]) and int(sim.military_at[B0, n]) < 0:
                return t, n
    raise AssertionError("no free adjacent land pair on this fixture")


def exchange(rules, path, a_hp: int, d_hp: int, diff: float, embarked: bool = False):
    sim = opened(rules, path, 12)
    here, there = pair(sim)
    a = place(sim, here, 0, hp=a_hp)
    d = place(sim, there, 1, hp=d_hp)
    att = torch.zeros(sim.B, dtype=torch.bool)
    att[B0] = True
    tgt = torch.full((sim.B,), there, dtype=torch.long)
    d_slot = torch.full((sim.B,), d + sim.POOL_LO["major"], dtype=torch.long)
    atk_e = torch.full((sim.B,), 20.0 + diff, dtype=torch.float64)
    def_e = torch.full((sim.B,), 20.0, dtype=torch.float64)
    d_emb = torch.full((sim.B,), embarked, dtype=torch.bool)
    rng0 = int(sim.rng_state[B0])
    _rows, def_dead, atk_dead, _cap = sim._melee_exchange(
        att, tgt, tgt, d_slot, sim.major_unit_hp, a, atk_e, def_e,
        torch.zeros(sim.B, dtype=torch.long), sim.major_unit_type[:, a], d_emb)
    return sim, a, d, bool(def_dead[B0]), bool(atk_dead[B0]), rng0


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    # both at 1 HP, the attacker far the stronger: its 1 is no overshoot, the
    # defender's 100 is 99 — the attacker stands at 1, the defender falls
    sim, a, d, dd, ad, _ = exchange(rules, path, 1, 1, +150.0)
    # (it stands at 1, healed by its seat's kill rows where it has them)
    assert dd and not ad and int(sim.major_unit_hp[B0, a]) >= 1, "the stronger attacker should stand"
    # the reverse: the defender stands at 1, the attacker falls
    sim, a, d, dd, ad, _ = exchange(rules, path, 1, 1, -150.0)
    assert ad and not dd and int(sim.unit_hp[B0, d + sim.POOL_LO["major"]]) >= 1, "the stronger defender should stand"
    print("  1 the mutual kill OK - the side overshot further falls, the other stands at 1")
    # an embarked defender: one draw, the attacker untouched
    sim, a, d, dd, ad, rng0 = exchange(rules, path, 100, 100, 0.0, embarked=True)
    assert int(sim.major_unit_hp[B0, a]) == 100 and not ad, "an embarked defender struck back"
    probe = opened(rules, path, 12)
    probe.rng_state[B0] = rng0
    m = torch.zeros(probe.B, dtype=torch.bool)
    m[B0] = True
    probe._rand_range(m, probe._dmg_max_extra)
    assert int(sim.rng_state[B0]) == int(probe.rng_state[B0]), "the counter was drawn"
    print("  2 the embarked defender OK - no blow back, one draw")
    # the attack's spend ends the attacker's fortification
    sim = opened(rules, path, 12)
    here, _there = pair(sim)
    a = place(sim, here, 0)
    sim.major_unit_fortify[B0, a] = 2
    fired = torch.zeros(sim.B, dtype=torch.bool)
    fired[B0] = True
    sim._spend_one_attack("major", a, fired)
    assert int(sim.major_unit_fortify[B0, a]) == 0, "the attacker kept its fortification"
    print("  3 the fortification OK - an attack ends it")
    print("BATTERY OK melee_result")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
