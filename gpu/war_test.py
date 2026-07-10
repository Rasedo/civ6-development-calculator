"""V-W1 player war/peace plumbing self-test.

    npm run gpu:export        # (once) writes gpu/fixtures/
    python gpu/war_test.py

The war head is GATED OFF in the shipped engine (_rl_war_active = False):
war_mask() is all-False and step(war=...) is ignored, so rollouts, gates and
checkpoints are untouched — test 1 proves that bit-exactly. Tests 2-3 flip
the flag on a throwaway sim and prove the applied action is EXACTLY the TS
state transition: step(war=a) must equal hand-poking the declareWar /
sueForPeace effect into the state and then stepping plain (bit-identical
across every _MUTABLE tensor), which sidesteps every same-turn world
confound (rival phase RNG, raids, income).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import _MUTABLE

RICH = 10_000.0


def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def snap_all(sim):
    return {k: getattr(sim, k).clone() for k in _MUTABLE}


def drift(sim, ref) -> list[str]:
    return [k for k in _MUTABLE if not torch.equal(getattr(sim, k), ref[k])]


def war_vec(sim, code) -> torch.Tensor:
    return torch.full((sim.B,), code, dtype=torch.long)


def test_inert_when_off(rules, path):
    """V-W1 ACTIVE (2026-07-08): the flag ships ON. The gate-safety
    property becomes: the SCRIPTED path (war=None) is bit-identical to a
    sim with the head forced off — the gates never pass war=, so parity
    is untouched by activation."""
    sim = build(rules, path)
    assert sim._rl_war_active, "V-W1 ships ACTIVE now"
    ref = build(rules, path)
    ref._rl_war_active = False
    for _ in range(30):
        sim.step()
        ref.step()
    d = drift(sim, snap_all(ref))
    assert not d, f"war=None path must not depend on the flag: {d}"
    # the live mask offers declarations at peace (rivals exist on this seed)
    if bool(sim.r_alive.any()):
        assert bool(sim.war_mask().any()), "live war_mask should offer choices with rivals alive"
    print("  activation OK (scripted path flag-independent; live mask non-degenerate)")


def test_declare(rules, path):
    sim = build(rules, path)
    for _ in range(20):
        sim.step()
    sim._rl_war_active = True
    m = sim.war_mask()[0]
    assert bool(m[0]), "declare-war column should be open (rival 0 alive, at peace)"
    assert not bool(m[sim.R]), "peace column must be closed while not at war"
    snap = sim.snapshot()
    sim.step(war=war_vec(sim, 0))
    assert bool(sim.r_atwar[0, 0]), "declare did not set r_atwar"
    after = snap_all(sim)
    # equivalence: poke declareWar's exact effect, then step plain
    sim.restore(snap)
    sim.r_atwar[:, 0] = True
    sim.r_warturns[:, 0] = 0
    sim.step()
    d = drift(sim, after)
    assert not d, f"declare != poked declareWar + plain step: {d}"
    print("  declare-war OK (bit-equal to the TS transition)")


def test_peace(rules, path):
    sim = build(rules, path)
    for _ in range(20):
        sim.step()
    sim._rl_war_active = True
    sim.step(war=war_vec(sim, 0))  # declare on rival 0
    rr = sim.rules.rivals
    need = int(rr.get("peaceMinWarTurns", 8))
    for _ in range(need):
        assert not bool(sim.war_mask()[0, sim.R]), "peace column open too soon"
        sim.step()
    assert bool(sim.r_atwar[0, 0]), "war ended prematurely (rival auto-peace?)"
    sim.treasury[:] = RICH
    m = sim.war_mask()[0]
    assert bool(m[sim.R]), "peace column should be open now (rich + warTurns >= min)"
    wt = int(sim.r_warturns[0, 0])
    cost = float(rr.get("peaceGold0", 150) + rr.get("peaceGoldSlope", 10) * wt)
    snap = sim.snapshot()
    sim.step(war=war_vec(sim, sim.R))  # sue for peace with rival 0
    assert not bool(sim.r_atwar[0, 0]), "peace did not clear r_atwar"
    after = snap_all(sim)
    # equivalence: poke sueForPeace's exact effect, then step plain
    sim.restore(snap)
    sim.treasury = sim.treasury - cost
    sim.r_atwar[:, 0] = False
    sim.r_warturns[:, 0] = 0
    sim.r_peaceturns[:, 0] = 0
    sim.step()
    d = drift(sim, after)
    assert not d, f"peace != poked sueForPeace + plain step: {d}"
    # broke → column closed
    sim.treasury[:] = 0.0
    sim.r_atwar[:, 0] = True
    sim.r_warturns[:, 0] = need + 1
    assert not bool(sim.war_mask()[0, sim.R]), "peace column open at 0 gold"
    print(f"  sue-for-peace OK (cost {cost:.0f} at warTurns {wt}, bit-equal transition)")


def test_capture_plunder(rules, path):
    """AUDIT C-11: capturing a rival city plunders +40 gold and, when it was
    the rival's LAST city, ends the war — TS captureRivalCity's exact tail.
    The raze path (player city slots full) gets neither: TS returns early."""
    sim = build(rules, path)
    for _ in range(20):
        sim.step()
    idx = sim.rc_alive[0].nonzero()
    assert len(idx), "no rival city by t20 on this seed"
    r = int(idx[0, 0])
    sim.r_atwar[0, r] = True
    caps = 0
    # capture rival r's cities one by one until eliminated (or player slots full)
    while bool(sim.rc_alive[0, r].any()) and bool((~sim.alive[0]).any()):
        jj = int(sim.rc_alive[0, r].nonzero()[0, 0])
        t0 = float(sim.treasury[0])
        sim._capture_rival_city(
            torch.tensor([0]), torch.tensor([r]), torch.tensor([jj]),
            torch.tensor([int(sim.rc_center[0, r, jj])]),
        )
        caps += 1
        assert float(sim.treasury[0]) == t0 + 40.0, "capture must plunder +40 (TS combat.ts:354)"
        if bool(sim.rc_alive[0, r].any()):
            assert bool(sim.r_atwar[0, r]), "war continues while the rival holds cities"
        else:
            assert not bool(sim.r_atwar[0, r]), "last city captured -> the war must end"
    eliminated = not bool(sim.rc_alive[0, r].any())
    assert caps >= 1, "no captures exercised"
    assert eliminated, "player slots filled before elimination — last-city branch untested on this seed"
    # raze path: fake a full empire — every player slot occupied
    idx2 = sim.rc_alive[0].nonzero()
    if len(idx2):
        r2, j2 = int(idx2[0, 0]), int(idx2[0, 1])
        sim.alive[0, :] = True
        sim.r_atwar[0, r2] = True
        t1 = float(sim.treasury[0])
        sim._capture_rival_city(
            torch.tensor([0]), torch.tensor([r2]), torch.tensor([j2]),
            torch.tensor([int(sim.rc_center[0, r2, j2])]),
        )
        assert float(sim.treasury[0]) == t1, "raze must not plunder"
        assert bool(sim.r_atwar[0, r2]), "raze must not end the war (TS early return)"
    print(f"  capture plunder OK ({caps} captures: +40 each, war ends on the last; raze: neither)")


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    path = paths[0]
    print(f"war_test on {path.name}")
    test_inert_when_off(rules, path)
    test_declare(rules, path)
    test_peace(rules, path)
    test_capture_plunder(rules, path)
    print("WAR/PEACE PLUMBING OK")


if __name__ == "__main__":
    main()
