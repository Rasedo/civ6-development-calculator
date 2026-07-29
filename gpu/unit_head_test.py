"""#51/S0.3 UNIT ACTION ENUM — the mask, the dispatch and the RL head agree.

This lane exists because a 9-column gap sat in a green tree. `N_UNIT_ACTS` was
hardcoded to 17 in BOTH gpu/train_ppo.py and gpu/civ6gpu/env.py while the real
`unit_action_mask` has been 26 wide since the resource-improvement columns
landed, so building a Policy against the live env could not work. No battery
lane built one, so nothing failed.

It also pins the collision that motivated the exported enum: PILLAGE used to be
dispatched on `a == 24`, which is the column of the LAST resource improvement
(FORT, appended at #78). So the pillage verb was bound to the FORT column while
the mask's real pillage column was dispatched by NEITHER engine — A-21's PILLAGE
was a total no-op on both sides, and the rollout stayed green because both
engines no-op'd identically.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)

    # --- 1) the enum is shipped and matches the improvement roster ----------
    acts = rj["actions"]["unit"]
    imp_ids = rj["improvements"]["ids"]
    assert acts, "rules.actions.unit missing — the exporter must ship the enum"
    assert len(acts) == 13 + len(imp_ids) + 3, (
        f"enum is {len(acts)} wide for {len(imp_ids)} improvements"
    )
    assert acts[-1] == "PILLAGE", f"PILLAGE must be the LAST column, got {acts[-1]}"
    for i, name in enumerate(imp_ids[:3]):
        assert acts[13 + i] == f"BUILD_{name}", f"dedicated build col {13+i} is {acts[13+i]}"
    for i, name in enumerate(imp_ids[3:]):
        assert acts[18 + i] == f"BUILD_{name}", f"resource build col {18+i} is {acts[18+i]}"

    # --- 2) the MASK is exactly as wide as the enum ------------------------
    m = sim.unit_action_mask()
    assert m.shape[-1] == len(acts), f"mask {m.shape[-1]} wide, enum {len(acts)}"

    # --- 3) the engine dispatches by NAME, on the right columns ------------
    assert sim._A_PILLAGE == acts.index("PILLAGE"), "PILLAGE dispatch column"
    assert sim._A_CHOP == acts.index("CHOP"), "CHOP dispatch column"
    assert sim._A_REPAIR == acts.index("REPAIR"), "REPAIR dispatch column"
    # THE REGRESSION: pillage must NOT share a column with any build verb.
    assert sim._A_PILLAGE not in sim._A_IMP, (
        f"PILLAGE column {sim._A_PILLAGE} collides with a BUILD column {sim._A_IMP} "
        "— this is exactly the #78 FORT collision that made the verb dead"
    )
    for k, col in enumerate(sim._A_IMP):
        assert col == acts.index(f"BUILD_{imp_ids[k]}"), f"improvement {imp_ids[k]} dispatch column"

    # --- 4) the RL unit head is built to the LIVE mask width ---------------
    # (the actual break: Policy's last layer was nn.Linear(uhidden, 17))
    from civ6gpu.env import n_unit_acts

    assert n_unit_acts(rules) == len(acts), "env.n_unit_acts must read the shipped enum"

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from train_ppo import Policy
    from civ6gpu.env import UNIT_FEATURES
    from civ6gpu.engine import P_MAX

    dims = {"C": 6, "AP": 4, "NT": 8, "NC": 8, "S": 3, "W": 0, "UA": m.shape[-1]}
    pol = Policy(obs_size=32, dims=dims, hidden=16, uhidden=8)
    out = pol(torch.zeros(2, 32), torch.zeros(2, P_MAX, UNIT_FEATURES))
    assert out["units"].shape[-1] == m.shape[-1], (
        f"unit head emits {out['units'].shape[-1]} logits for a {m.shape[-1]}-wide mask "
        "— masking would broadcast-fail or silently misalign"
    )

    print(
        f"unit_head OK — enum {len(acts)} wide, mask matches, PILLAGE at {sim._A_PILLAGE} "
        f"(no BUILD collision), RL head {out['units'].shape[-1]} logits"
    )


if __name__ == "__main__":
    main()
