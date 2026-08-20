"""UNIT ACTION ENUM — the mask, the dispatch and the RL head agree.

`rules.actions.unit` is the one source of the unit-action width and of every
verb's column. This lane pins that the exported enum, BOTH seats' masks, the
engine's dispatch constants and `env.n_unit_acts` all agree with it.

Neither failure mode raises: a consumer that hardcodes a width silently drops
the tail columns, and a verb dispatched on a bare column number that another
verb also occupies becomes a no-op on both engines at once — so the rollout
stays green while the verb does nothing.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))

    # --- 0) BOTH SEATS' masks are the enum's width -------------------------
    # ONE mask body serves every seat row, so this asserts the SHARED width
    # against the enum on two different rows — a row-dependent width would
    # mean a seat quietly loses the tail verbs (REPAIR, resource
    # improvements, FORT, PILLAGE).
    for _ in range(25):
        sim.step()
    assert sim.n_majors > 1, "needs a civ row to compare against"
    _pm = sim._seat_unit_mask(0)
    _rm = sim._seat_unit_mask(1)
    assert _pm.shape[2] == _rm.shape[2] == len(rj["actions"]["unit"]), (
        f"unit action width disagrees: row 0 {_pm.shape[2]}, row 1 {_rm.shape[2]}, "
        f"enum {len(rj['actions']['unit'])}"
    )
    print(f"  0 the unit mask is {_pm.shape[2]} wide on every row (= the enum) OK")

    # --- 1) the enum is shipped and matches the improvement roster ----------
    acts = rj["actions"]["unit"]
    imp_ids = rj["improvements"]["ids"]
    assert acts, "rules.actions.unit missing — the exporter must ship the enum"
    # +12 SNIPE, +7 SPREAD, +1 FOUND_CITY, +1 EXCAVATE, +1 PARK
    assert len(acts) == 13 + len(imp_ids) + 3 + 12 + 7 + 3, (
        f"enum is {len(acts)} wide for {len(imp_ids)} improvements"
    )
    assert acts[-10] == "SPREAD_HERE" and acts[-4] == "SPREAD_5", "SPREAD tail misplaced"
    # the CIVILIAN VERBS close the enum, in this order: a new verb joins at
    # the END or it moves a column somebody else already keys on.
    assert acts[-3:] == ["FOUND_CITY", "EXCAVATE", "PARK"], "civilian verb tail misplaced"

    # PILLAGE is NOT the last column — the SNIPE ring and the SPREAD tail sit
    # after it — so PILLAGE and the ring must hold their exact seats and every
    # consumer keys on a name or a fixed index, never on W-1 (see A_PILLAGE in
    # policy/ladder.py).
    assert acts[25] == "PILLAGE", f"PILLAGE must hold column 25, got {acts[25]}"
    assert acts[26] == "SNIPE_0" and acts[37] == "SNIPE_11", (  # SPREAD sits past 37 — key on the SEAT, not W-1
        f"SNIPE ring must be 26..37, got {acts[26]}..{acts[37]}"
    )
    for i, name in enumerate(imp_ids[:3]):
        assert acts[13 + i] == f"BUILD_{name}", f"dedicated build col {13+i} is {acts[13+i]}"
    for i, name in enumerate(imp_ids[3:]):
        assert acts[18 + i] == f"BUILD_{name}", f"resource build col {18+i} is {acts[18+i]}"

    # --- 2) the MASK is exactly as wide as the enum ------------------------
    m = sim._seat_unit_mask(0)
    assert m.shape[-1] == len(acts), f"mask {m.shape[-1]} wide, enum {len(acts)}"

    # --- 3) the engine dispatches by NAME, on the right columns ------------
    assert sim._A_PILLAGE == acts.index("PILLAGE"), "PILLAGE dispatch column"
    assert sim._A_CHOP == acts.index("CHOP"), "CHOP dispatch column"
    assert sim._A_REPAIR == acts.index("REPAIR"), "REPAIR dispatch column"
    assert sim._A_FOUND == acts.index("FOUND_CITY"), "FOUND_CITY dispatch column"
    # pillage must NOT share a column with any build verb
    assert sim._A_PILLAGE not in sim._A_IMP, (
        f"PILLAGE column {sim._A_PILLAGE} collides with a BUILD column {sim._A_IMP} "
        "— this is exactly the #78 FORT collision that made the verb dead"
    )
    for k, col in enumerate(sim._A_IMP):
        assert col == acts.index(f"BUILD_{imp_ids[k]}"), f"improvement {imp_ids[k]} dispatch column"

    # --- 4) the env's head-width derivation reads the LIVE enum ------------
    # a policy sizes its unit head from n_unit_acts, never from a literal
    from core.env import n_unit_acts

    assert n_unit_acts(rules) == len(acts), "env.n_unit_acts must read the shipped enum"

    print(
        f"unit_head OK — enum {len(acts)} wide, mask matches, PILLAGE at {sim._A_PILLAGE} "
        "(no BUILD collision), n_unit_acts reads the enum"
    )


if __name__ == "__main__":
    main()
