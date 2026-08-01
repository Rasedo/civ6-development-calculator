"""ENGINE state round-trip self-test — snapshot/restore + step determinism.

    python gpu/snapshot_restore_test.py

WHY THIS FILE EXISTS, AND WHY IT IS NAMED FOR WHAT IT TESTS. These invariants
used to live inside `gpu/mcts_test.py` (as its "fast mode"), so the only way to
check them was to run a lane named after MCTS. They are not RL properties at
all — they are the ENGINE's, and they are the ONLY coverage for them:

  1. `snapshot()` / `restore()` round-trips the FULL mutable state — every
     tensor in `_MUTABLE`, plus the RNG stream and the turn counter — BIT-
     EXACTLY.
  2. A step taken after a restore reproduces the same next state bit-for-bit
     (determinism).

Scripted parity NEVER snapshots or restores, so a newly added plane that is
missing from `_MUTABLE` sails straight through it and fails only here. That is
not hypothetical: round #79 alone added `artifacts`, `rc_artifacts`,
`antiquity`, `cs_atwar` and `cs_war_turns`, and every one of them had to be
registered. This lane is what proves it.

The search-QUALITY properties that shared the old file (search is deterministic,
horizon-15 beats myopic greedy, the Gumbel/SH plumbing) are RL work and belong
with the RL stages, not in an engine battery.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import _MUTABLE


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"

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

    # determinism: two steps from the same restored state must match bit-for-bit
    sim.restore(snap)
    sim.step()
    a = {k: getattr(sim, k).clone() for k in _MUTABLE}
    sim.restore(snap)
    sim.step()
    nd = [k for k in _MUTABLE if not torch.equal(a[k], getattr(sim, k))]
    assert not nd, f"step-after-restore nondeterministic for: {nd}"

    # --- the registry is COMPLETE, not merely self-consistent ---------------
    # The round-trip above only proves the tensors ALREADY in _MUTABLE restore.
    # A plane that a step mutates but nobody registered is invisible to it — I
    # verified that by unregistering `artifacts` and watching this file still
    # pass. So assert the real property: EVERY tensor attribute a step changes
    # must be registered, or snapshot/restore silently leaks it across a search.
    s2 = BatchSim([load_fixture(p) for p in paths[:4]], rules, device="cpu", dtype=torch.float64)
    for _ in range(20):
        s2.step()
    watched = {
        k: v.clone()
        for k, v in vars(s2).items()
        if isinstance(v, torch.Tensor) and not k.startswith("_")
    }
    for _ in range(6):
        s2.step()
    changed = {
        k for k, before in watched.items()
        if getattr(s2, k).shape != before.shape or not torch.equal(getattr(s2, k), before)
    }
    # LIMIT, stated because it matters: this catches only planes that actually
    # mutate in the sampled window. `artifacts` is currently registered but does
    # NOT move in-gate (nothing grants one yet), so unregistering it would slip
    # past here — verified. The check hardens as a mechanic becomes reachable,
    # which is the right direction, but it is not a substitute for registering
    # a new plane deliberately.
    # #51/S3.3: a plane may be covered by NAME or by STORAGE. The merged unit
    # pool registers ten bases (unit_hp, ...) and exposes thirty p_/v_/u_ views
    # into them; restoring the base restores every view, so a view is covered
    # even though its own name is absent. Cover-by-storage is checked against
    # the REGISTERED set only — an unregistered plane that merely happens to
    # alias another unregistered one is still missing.
    registered_storage = {
        getattr(s2, k).untyped_storage().data_ptr()
        for k in _MUTABLE
        if isinstance(getattr(s2, k, None), torch.Tensor)
    }
    missing = sorted(
        k
        for k in changed - set(_MUTABLE)
        if getattr(s2, k).untyped_storage().data_ptr() not in registered_storage
    )
    assert not missing, (
        f"{len(missing)} tensor(s) mutate during a step but are NOT in _MUTABLE "
        f"(and are not views of anything that is), so snapshot/restore will not "
        f"round-trip them: {missing}"
    )

    aliased = len(changed - set(_MUTABLE))
    print(
        f"snapshot/restore OK — bit-exact across {len(_MUTABLE)} mutable tensors "
        f"+ RNG + turn; step-after-restore deterministic; "
        f"registry COMPLETE ({len(changed)} step-mutated tensors: "
        f"{len(changed) - aliased} by name, {aliased} as views of a registered base)"
    )


if __name__ == "__main__":
    main()
