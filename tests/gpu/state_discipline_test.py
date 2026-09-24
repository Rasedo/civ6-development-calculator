"""STATE DISCIPLINE — the aliasing safety net.

`p_*` and `v_*` are VIEWS of one seat-indexed tensor. A view survives
`x[...] = v` and `x.copy_(v)` but is silently destroyed by
`self.x = torch.where(...)`, which rebinds the name to a fresh dense tensor.
Nothing raises; the two engines just start drifting, and the first symptom is a
red column many turns downstream with no pointer to the cause.

This lane pins:

  1. the registry mechanism actually detects a rebind (a check that cannot fail
     is worth nothing);
  2. shape/dtype of every _MUTABLE plane is stable across steps, which is what
     snapshot()/restore() assume when they copy by name;
  3. running with CIV6_ALIAS_CHECK=1 does not itself change behaviour.

Many _MUTABLE tensors are legitimately rebound every step (`current`,
`settlers`, `rng_state`, ...), so a blanket "no _MUTABLE data_ptr may change
across a step" rule would fail on turn 1. ALIASED names are held to that rule;
everything else is held to shape/dtype.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# The engine reads CIV6_ALIAS_CHECK at IMPORT time, so set it before the import
# rather than plumbing per-lane env through gpu/battery.py.
os.environ.setdefault("CIV6_ALIAS_CHECK", "1")

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.simbase import _MUTABLE
from warmup import settle_all, warm_base


# THE WARMED BASE, ONE PER FIXTURE PAIR. Standing a B=2 engine up costs ~3 s
# where `restore` costs a millisecond, and every plane the scenes below write
# is `_MUTABLE`, so the restore is the whole job. Scene 2 is the exception: it
# REBINDS `major_unit_hp`, registers an alias for it and hangs `_seat_hp` on
# the object — three writes a restore does not carry, and a rebound view is
# precisely the poison the scene exists to demonstrate — so it keeps a build
# of its own (`fresh=True`). The steps stay in the scenes: each wants its own
# horizon, and a base per horizon would build as often as before.


def _stand_up(paths, rules):
    return settle_all(BatchSim([load_fixture(p) for p in paths[:2]], rules, device="cpu", dtype=torch.float64))


def build(paths, rules, fresh: bool = False):
    if fresh:
        return _stand_up(paths, rules)
    return warm_base(tuple(str(p) for p in paths[:2]), lambda: _stand_up(paths, rules))


def main() -> None:
    from core import simbase

    assert simbase._ALIAS_CHECK, "the engine flag is off — CIV6_ALIAS_CHECK must be set BEFORE importing core"

    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"

    # --- 1) the check runs clean on the real engine ------------------------
    # ...on a build of its own: scene 2 below poisons this object for good.
    sim = build(paths, rules, fresh=True)
    for _ in range(30):
        sim.step()
    assert len(sim._mut_sig) == len([k for k in _MUTABLE if hasattr(sim, k)]), "_MUTABLE baseline incomplete"
    print(f"  30 steps clean with the check on ({len(sim._mut_sig)} _MUTABLE planes tracked)")

    # --- 2) the alias check DETECTS a rebind -------------------------------
    # Stand up the real shape: a unified seat tensor with major_unit_hp as a view of it.
    sim._seat_hp = torch.zeros(sim.B, 2, sim.major_unit_hp.shape[1], dtype=sim.major_unit_hp.dtype)
    sim._seat_hp[:, 0] = sim.major_unit_hp
    sim.major_unit_hp = sim._seat_hp[:, 0]
    sim.register_alias("major_unit_hp", lambda s: s._seat_hp[:, 0])
    sim._check_state_discipline()  # intact view must pass

    # writing THROUGH the view is fine and must reach the base
    sim.major_unit_hp[:, 0] = 42
    assert int(sim._seat_hp[0, 0, 0]) == 42, "a write through the view must reach the base"
    sim._check_state_discipline()

    # rebinding it is the bug, and must be caught
    sim.major_unit_hp = sim.major_unit_hp.clone()
    try:
        sim._check_state_discipline()
        raise SystemExit("FAIL: a rebound alias was NOT detected — the safety net is inert")
    except AssertionError as e:
        assert "ALIAS BROKEN" in str(e), f"wrong assertion fired: {e}"
    print("  a rebound alias is detected")

    # --- 3) _MUTABLE shape/dtype drift is detected -------------------------
    s2 = build(paths, rules)
    s2.step()
    # skip ALIASED names — rebinding one trips the alias check first
    # (correctly: a broken view is the more fundamental error), so the
    # dtype-drift probe needs a plane that owns its own storage.
    nm = next(k for k in _MUTABLE if hasattr(s2, k) and k not in s2._aliases)
    # the drifted plane is a REBIND, which no `restore` undoes — put it back by
    # hand so the shared base is clean for the scene below.
    _keep = getattr(s2, nm)
    try:
        setattr(s2, nm, _keep.to(torch.int8) if _keep.dtype != torch.int8 else _keep.float())
        try:
            s2._check_state_discipline()
            raise SystemExit(f"FAIL: dtype drift on {nm} was NOT detected")
        except AssertionError as e:
            assert "_MUTABLE DRIFT" in str(e), f"wrong assertion fired: {e}"
    finally:
        setattr(s2, nm, _keep)
    print(f"  _MUTABLE dtype drift is detected (probed {nm})")

    # --- 4) the check does not itself change behaviour ---------------------
    # Same seeds, same turns, with and without the flag -> identical trace.
    import core.simbase as eng  # the patchable globals live on the module floor

    # eight turns, not twenty: a perturbation by the flag would show on turn
    # one, and the digest's width does not grow with the window
    a = build(paths, rules)
    for _ in range(8):
        a.step()
    from core import statecompare as _sc
    row_on = _sc.state_digest(a, 0)

    eng._ALIAS_CHECK = False
    try:
        b = build(paths, rules)
        for _ in range(8):
            b.step()
        row_off = _sc.state_digest(b, 0)
    finally:
        eng._ALIAS_CHECK = True
    assert row_on == row_off, "CIV6_ALIAS_CHECK changed engine behaviour — it must be observation-only"
    print("  the check is observation-only (traces identical with it on and off)")

    print("state_discipline OK — alias rebinds and _MUTABLE drift both detected, zero behaviour change")


if __name__ == "__main__":
    main()
