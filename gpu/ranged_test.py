"""V-R ranged-strike self-test.

    npm run gpu:export        # (once) writes gpu/fixtures/
    python gpu/ranged_test.py

Ranged ships ACTIVE (_rl_ranged_active = True): units with rangedStrength > 0
execute attack codes 6-11 as a RANGED strike — one damage roll, no
retaliation, no advance — mirroring rangedAttack; melee units are untouched.
The discriminator is retaliation: _damage_roll clamps at min 1, so a MELEE
attacker always takes damage while a RANGED attacker never does. The test
finds a real adjacent-hostile situation in scripted play, retypes the
attacker to SLINGER, and runs the same attack under both flag settings from
one snapshot. The unit-action MASK must be identical under both flags (the
flag changes execution semantics only, which is why replay can dispatch by
unit type + rollout.json's rangedActive)."""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import P_MAX

HOLD = 12


def find_fight(rules, paths):
    """Scripted-advance a sim until a player military unit can attack."""
    for path in paths:
        sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
        for _ in range(90):
            m = sim.unit_action_mask()[0]  # [P, 16]
            att = m[:, 6:12].any(dim=1)
            if bool(att.any()):
                p = int(att.nonzero(as_tuple=True)[0][0])
                code = 6 + int(m[p, 6:12].nonzero(as_tuple=True)[0][0])
                return sim, p, code, path.name
            sim.step()
    raise AssertionError("no adjacent-hostile situation found in scripted play")


def defender_state(sim, tile):
    b = int(sim.barb_at[0, tile])
    if b >= 0:
        return ("barb", b, int(sim.u_hp[0, b]), bool(sim.u_alive[0, b]))
    v = int(sim.rv_at[0, tile])
    assert v >= 0, "no hostile at the attack target?"
    return ("rival", v, int(sim.v_hp[0, v]), bool(sim.v_alive[0, v]))


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    sim, p, code, name = find_fight(rules, paths)
    print(f"ranged_test on {name}: unit slot {p}, attack code {code}, turn {sim.turn}")
    assert sim._rl_ranged_active, "flag ships ON since V-R"

    slinger = next(i for i, u in enumerate(sim.rules.units) if u["id"] == "SLINGER")
    assert float(sim._p_rng_str[slinger]) > 0, "SLINGER rangedStrength not exported"
    sim.p_type[0, p] = slinger
    here = int(sim.p_tile[0, p])
    dirs = code - 6
    tgt = int(sim.neigh[here, dirs])
    hp0 = int(sim.p_hp[0, p])

    # mask invariance under the flag
    m_on = sim.unit_action_mask().clone()
    sim._rl_ranged_active = False
    m_off = sim.unit_action_mask()
    assert torch.equal(m_on, m_off), "flag must not change the action mask"
    sim._rl_ranged_active = True

    ua = torch.full((1, P_MAX), HOLD, dtype=torch.long)
    ua[0, p] = code
    snap = sim.snapshot()
    pre_kind, pre_slot, pre_hp, _ = defender_state_from_snap(snap, tgt)

    # Run the UNIT-ACTION PHASE alone (not a full step): the rest of the
    # turn has the world fight back (hostile phases, healing), which would
    # confound the attacker-hp assertions.
    # --- ranged (flag ON): no retaliation, no advance, defender damaged
    sim._apply_unit_actions(ua)
    kind, slot, hp_d, alive_d = defender_state(sim, tgt)
    assert int(sim.p_hp[0, p]) == hp0, (
        f"ranged attacker took retaliation ({hp0} -> {int(sim.p_hp[0, p])})"
    )
    assert int(sim.p_tile[0, p]) == here, "ranged attacker advanced"
    assert (not alive_d) or hp_d <= pre_hp - 1, "defender untouched by the strike"
    print(f"  ranged OK: attacker hp {hp0} (untouched), stayed at {here}; {kind} defender {pre_hp}->{hp_d if alive_d else 'dead'}")

    # --- melee (flag OFF): retaliation is guaranteed (damage roll min 1)
    sim.restore(snap)
    sim._rl_ranged_active = False
    sim._apply_unit_actions(ua)
    hp_melee = int(sim.p_hp[0, p])
    dead_melee = not bool(sim.p_alive[0, p])
    assert dead_melee or hp_melee <= hp0 - 1, f"melee attacker took no retaliation? ({hp0} -> {hp_melee})"
    sim.restore(snap)
    sim._rl_ranged_active = True
    print(f"  melee-off OK: attacker hp {hp0}->{'dead' if dead_melee else hp_melee} (retaliation felt)")
    print("RANGED STRIKE OK")


def defender_state_from_snap(snap, tile):
    b = int(snap["mut"]["barb_at"][0, tile])
    if b >= 0:
        return ("barb", b, int(snap["mut"]["u_hp"][0, b]), bool(snap["mut"]["u_alive"][0, b]))
    v = int(snap["mut"]["rv_at"][0, tile])
    assert v >= 0
    return ("rival", v, int(snap["mut"]["v_hp"][0, v]), bool(snap["mut"]["v_alive"][0, v]))


if __name__ == "__main__":
    main()
