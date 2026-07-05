"""M1 single-agent search self-test.

    npm run gpu:export        # (once) writes gpu/fixtures/
    python gpu/mcts_test.py

Two properties, both eval-only (never perturb the parity-checked forward model):

  1. snapshot / restore round-trips the FULL mutable state (every _MUTABLE tensor
     incl. the RNG stream + the turn counter) bit-exactly, and a step taken after
     a restore reproduces the same next state (determinism).

  2. search_production is deterministic, leaves the sim's state bit-identical, and
     its horizon-15 choice's rollout value never trails the myopic (horizon-0)
     greedy choice — and beats it outright on at least one seed.
"""

from __future__ import annotations

import statistics
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import _MUTABLE
from civ6gpu.mcts import (
    search_production, greedy_production, _rollout_value, plan_production, mpc_play,
    mpc_play_empire,
)

HORIZON = 15
MIN_TURN = 30  # skip trivial turn-1 openings; find a real mid-game production choice


def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def advance_to_decision(sim):
    """Scripted-step until the capital faces a >=2-way choice mid-game."""
    for _ in range(160):
        if int(sim.production_mask()[0, 0].sum()) >= 2 and sim.turn >= MIN_TURN:
            break
        sim.step()
    return int(sim.production_mask()[0, 0].sum())


def test_snapshot_restore(rules, paths):
    sim = BatchSim([load_fixture(p) for p in paths[:4]], rules, device="cpu", dtype=torch.float64)
    for _ in range(30):
        sim.step()
    snap = sim.snapshot()
    before = sim.empire_score().clone()
    for _ in range(10):
        sim.step()
    assert not torch.equal(before, sim.empire_score()), "advance didn't change state (vacuous)"
    sim.restore(snap)
    drift = [k for k in _MUTABLE if not torch.equal(getattr(sim, k), snap["mut"][k])]
    assert not drift, f"restore not bit-exact for: {drift}"
    assert sim.turn == snap["turn"], "turn not restored"
    assert torch.equal(sim.empire_score(), before), "empire_score not restored"

    # determinism: two steps from the same restored state must match bit-for-bit.
    sim.restore(snap)
    sim.step()
    a = {k: getattr(sim, k).clone() for k in _MUTABLE}
    sim.restore(snap)
    sim.step()
    nd = [k for k in _MUTABLE if not torch.equal(a[k], getattr(sim, k))]
    assert not nd, f"step-after-restore nondeterministic for: {nd}"
    print(f"snapshot/restore bit-exact across {len(_MUTABLE)} mutable tensors + turn; "
          f"step-after-restore deterministic")


def test_search(rules, paths):
    n_seeds = n_differ = n_disc = 0
    for path in paths:
        sim = build(rules, path)
        if advance_to_decision(sim) < 2:
            continue
        n_seeds += 1
        t = sim.turn

        # eval-only: the search must not mutate the forward model.
        pristine = {k: getattr(sim, k).clone() for k in _MUTABLE}
        best, vals = search_production(sim, city=0, horizon=HORIZON)
        drift = [k for k in _MUTABLE if not torch.equal(getattr(sim, k), pristine[k])]
        assert not drift, f"{path.name}: search mutated {drift}"

        # determinism: rebuild + research reproduces best + values exactly.
        sim2 = build(rules, path)
        advance_to_decision(sim2)
        best2, vals2 = search_production(sim2, city=0, horizon=HORIZON)
        assert (best, vals) == (best2, vals2), f"{path.name}: nondeterministic search"

        # improves on greedy: same horizon-15 yardstick for both choices.
        snap = sim.snapshot()
        g_best, _ = greedy_production(sim, city=0)
        greedy_val = _rollout_value(sim, 0, g_best, HORIZON, snap)
        assert vals[best] >= greedy_val - 1e-9, (
            f"{path.name}: search {vals[best]} < greedy {greedy_val}")
        n_differ += best != g_best
        n_disc += len(vals) >= 3 and max(vals.values()) > statistics.median(vals.values()) + 1e-9
        print(f"  {path.name}: t={t} cands={len(vals)} search={best}({vals[best]:.2f}) "
              f"greedy={g_best}({greedy_val:.2f}) {'DIFFER' if best != g_best else 'same'}")

    assert n_seeds >= 3, f"too few usable seeds ({n_seeds})"
    assert n_differ >= 1, "search never improved on greedy"
    assert n_disc >= 1, "search never discriminated best from median"
    print(f"search: {n_seeds} seeds, >=greedy on all, differed on {n_differ}, discriminated on {n_disc}")


def test_planning(rules, paths):
    """M2a: closed-loop planning must beat the scripted base policy on final score,
    stay deterministic, and never mutate the forward model during search."""
    HZ, TURNS = 20, 60

    # eval-only + determinism at one mid-game decision, exercising depth 1 and 2.
    sim = build(rules, paths[4])
    advance_to_decision(sim)
    pristine = {k: getattr(sim, k).clone() for k in _MUTABLE}
    b1, v1 = plan_production(sim, 0, horizon=HZ, depth=1)
    b2, _ = plan_production(sim, 0, horizon=HZ, depth=2)  # depth-2 (one call; slower)
    drift = [k for k in _MUTABLE if not torch.equal(getattr(sim, k), pristine[k])]
    assert not drift, f"plan mutated forward model for {drift}"
    sim2 = build(rules, paths[4])
    advance_to_decision(sim2)
    assert plan_production(sim2, 0, horizon=HZ, depth=1) == (b1, v1), "depth-1 nondeterministic"
    print(f"  plan eval-only + deterministic; depth1 pick={b1} depth2 pick={b2} "
          f"({'depth changes the pick' if b1 != b2 else 'same pick at this node'})")

    # closed-loop MPC vs scripted final empire_score (the headline).
    wins = n = 0
    for p in paths[:4]:
        s = build(rules, p)
        for _ in range(TURNS):
            s.step()
        base = float(s.empire_score()[0])
        s = build(rules, p)
        got = mpc_play(s, 0, horizon=HZ, depth=1, turns=TURNS)
        n += 1
        wins += got > base + 1e-6
        assert got >= base - 1e-6, f"{p.name}: mpc {got:.2f} < scripted {base:.2f}"
        print(f"  {p.name}: scripted={base:.1f} mpc-d1={got:.1f} gain={got - base:+.1f}")
    assert wins >= 2, f"mpc-d1 only beat scripted on {wins}/{n} (expected a clear edge)"
    print(f"planning: mpc-d1 >= scripted on all {n}, strictly better on {wins}")

    # empire-wide search (every city's production): deterministic, and not worse than
    # the scripted baseline on a sample game.
    ep = 45
    s = build(rules, paths[0])
    for _ in range(ep):
        s.step()
    base = float(s.empire_score()[0])
    e1 = mpc_play_empire(build(rules, paths[0]), horizon=15, depth=1, turns=ep)
    e2 = mpc_play_empire(build(rules, paths[0]), horizon=15, depth=1, turns=ep)
    assert e1 == e2, f"mpc_play_empire nondeterministic ({e1} vs {e2})"
    assert e1 >= base - 1e-6, f"empire search {e1:.2f} < scripted {base:.2f}"
    print(f"empire  : all-cities search deterministic, {e1:.1f} >= scripted {base:.1f}")


def main():
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    test_snapshot_restore(rules, paths)
    test_search(rules, paths[:12])
    test_planning(rules, paths)
    print("M1/M2a SEARCH SELF-TEST OK")


if __name__ == "__main__":
    main()
