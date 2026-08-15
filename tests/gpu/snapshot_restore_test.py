"""ENGINE state round-trip self-test — snapshot/restore + step determinism.

    python tests/gpu/snapshot_restore_test.py

These are ENGINE invariants, and this lane is their only coverage:

  1. `snapshot()` / `restore()` round-trips the FULL mutable state — every
     tensor in `_MUTABLE`, plus the RNG stream and the turn counter — BIT-
     EXACTLY.
  2. A step taken after a restore reproduces the same next state bit-for-bit
     (determinism).

Scripted parity NEVER snapshots or restores, so a plane that is missing from
`_MUTABLE` sails straight through it and fails only here.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.engine import _MUTABLE
from warmup import settle_all


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"

    sim = settle_all(BatchSim([load_fixture(p) for p in paths[:4]], rules, device="cpu", dtype=torch.float64))
    for _ in range(30):
        sim.step()
    snap = sim.snapshot()
    before = sim.seat_score(0).clone()
    for _ in range(10):
        sim.step()
    assert not torch.equal(before, sim.seat_score(0)), "advance didn't change state (vacuous)"

    sim.restore(snap)
    drift = [k for k in _MUTABLE if not torch.equal(getattr(sim, k), snap["mut"][k])]
    assert not drift, f"restore not bit-exact for: {drift}"
    assert sim.turn == snap["turn"], "turn not restored"
    assert torch.equal(sim.seat_score(0), before), "seat_score not restored"

    # determinism: two steps from the same restored state must match bit-for-bit
    sim.restore(snap)
    sim.step()
    a = {k: getattr(sim, k).clone() for k in _MUTABLE}
    sim.restore(snap)
    sim.step()
    nd = [k for k in _MUTABLE if not torch.equal(a[k], getattr(sim, k))]
    assert not nd, f"step-after-restore nondeterministic for: {nd}"

    # --- the registry is COMPLETE, not merely self-consistent ---------------
    # The round-trip above only proves the tensors ALREADY in _MUTABLE restore;
    # a plane that a step mutates but nobody registered is invisible to it. So
    # assert the real property: EVERY tensor attribute a step changes must be
    # registered, or snapshot/restore silently leaks it across a search.
    s2 = settle_all(BatchSim([load_fixture(p) for p in paths[:4]], rules, device="cpu", dtype=torch.float64))
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
    # mutate in the sampled window. A plane no reachable mechanic moves can be
    # unregistered and still slip past. The check hardens as mechanics become
    # reachable, but it is not a substitute for registering a new plane
    # deliberately.
    # A plane may be covered by NAME or by STORAGE. The merged unit pool
    # registers ten bases (unit_hp, ...) and exposes thirty p_/v_/u_ views
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
