"""#51/S0.4 STATE DISCIPLINE — the aliasing safety net, landed before the aliases.

Round 3 of the seat unification makes `p_*` and `v_*` VIEWS of one seat-indexed
tensor. A view survives `x[...] = v` and `x.copy_(v)` but is silently destroyed
by `self.x = torch.where(...)`, which rebinds the name to a fresh dense tensor.
Nothing raises; the two engines just start drifting, and the first symptom is a
red column many turns downstream with no pointer to the cause.

This lane exists NOW, while the alias registry is still empty, so that it can
never be "added later" once the first alias is already broken. It pins:

  1. the registry mechanism actually detects a rebind (a check that cannot fail
     is worth nothing — the watermill lesson);
  2. shape/dtype of every _MUTABLE plane is stable across steps, which is what
     snapshot()/restore() assume when they copy by name;
  3. running with CIV6_ALIAS_CHECK=1 does not itself change behaviour.

MEASURED before writing it: 48 of the 230 _MUTABLE tensors are legitimately
rebound every step (`current`, `settlers`, `rng_state`, ...), so the blanket
"no _MUTABLE data_ptr may change across a step" rule the plan originally asked
for is false for this engine and would fail on turn 1. Aliased names are held to
that rule; everything else is held to shape/dtype.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# The engine reads CIV6_ALIAS_CHECK at IMPORT time, so set it before the import
# rather than plumbing per-lane env through gpu/battery.py.
os.environ.setdefault("CIV6_ALIAS_CHECK", "1")

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import _MUTABLE


def build(paths, rules):
    return BatchSim([load_fixture(p) for p in paths[:2]], rules, device="cpu", dtype=torch.float64)


def main() -> None:
    from civ6gpu.engine import _ALIAS_CHECK

    assert _ALIAS_CHECK, "the engine flag is off — CIV6_ALIAS_CHECK must be set BEFORE importing civ6gpu"

    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"

    # --- 1) the check runs clean on the real engine ------------------------
    sim = build(paths, rules)
    for _ in range(30):
        sim.step()
    assert len(sim._mut_sig) == len([k for k in _MUTABLE if hasattr(sim, k)]), "_MUTABLE baseline incomplete"
    print(f"  30 steps clean with the check on ({len(sim._mut_sig)} _MUTABLE planes tracked)")

    # --- 2) the alias check DETECTS a rebind -------------------------------
    # Stand up exactly the Round 3 shape: a unified seat tensor with p_hp as a view.
    sim._seat_hp = torch.zeros(sim.B, 2, sim.p_hp.shape[1], dtype=sim.p_hp.dtype)
    sim._seat_hp[:, 0] = sim.p_hp
    sim.p_hp = sim._seat_hp[:, 0]
    sim.register_alias("p_hp", lambda s: s._seat_hp[:, 0])
    sim._check_state_discipline()  # intact view must pass

    # writing THROUGH the view is fine and must reach the base
    sim.p_hp[:, 0] = 42
    assert int(sim._seat_hp[0, 0, 0]) == 42, "a write through the view must reach the base"
    sim._check_state_discipline()

    # rebinding it is the bug, and must be caught
    sim.p_hp = sim.p_hp.clone()
    try:
        sim._check_state_discipline()
        raise SystemExit("FAIL: a rebound alias was NOT detected — the safety net is inert")
    except AssertionError as e:
        assert "ALIAS BROKEN" in str(e), f"wrong assertion fired: {e}"
    print("  a rebound alias is detected")

    # --- 3) _MUTABLE shape/dtype drift is detected -------------------------
    s2 = build(paths, rules)
    s2.step()
    # #51/S4: skip ALIASED names — rebinding one trips the alias check
    # first (correctly: a broken view is the more fundamental error), so
    # the dtype-drift probe needs a plane that owns its own storage.
    nm = next(k for k in _MUTABLE if hasattr(s2, k) and k not in s2._aliases)
    setattr(s2, nm, getattr(s2, nm).to(torch.int8) if getattr(s2, nm).dtype != torch.int8 else getattr(s2, nm).float())
    try:
        s2._check_state_discipline()
        raise SystemExit(f"FAIL: dtype drift on {nm} was NOT detected")
    except AssertionError as e:
        assert "_MUTABLE DRIFT" in str(e), f"wrong assertion fired: {e}"
    print(f"  _MUTABLE dtype drift is detected (probed {nm})")

    # --- 4) the check does not itself change behaviour ---------------------
    # Same seeds, same turns, with and without the flag -> identical trace.
    import civ6gpu.engine as eng

    a = build(paths, rules)
    for _ in range(20):
        a.step()
    row_on = a.trace_row().clone()

    eng._ALIAS_CHECK = False
    try:
        b = build(paths, rules)
        for _ in range(20):
            b.step()
        row_off = b.trace_row().clone()
    finally:
        eng._ALIAS_CHECK = True
    assert torch.equal(row_on, row_off), "CIV6_ALIAS_CHECK changed engine behaviour — it must be observation-only"
    print("  the check is observation-only (traces identical with it on and off)")

    print("state_discipline OK — alias rebinds and _MUTABLE drift both detected, zero behaviour change")


if __name__ == "__main__":
    main()
