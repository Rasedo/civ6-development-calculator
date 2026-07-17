"""A-7r government/policy adoption self-test.

The government/policy adoption machinery ships INERT (rules.governmentsLive =
False; see GOVERNMENTS_ADOPTION_LIVE), so the scripted rollout never exercises
it. This poke test forces the switch on IN-MEMORY and drives the deterministic
adoption + greedy slot-fill directly (the occupancy_test pattern), asserting
the GPU's `_adopted_gov` / `_adopted_gov_tier` / `_gov_policy_mods` match the
TS `computeAdoption` / `applyGovernment` rule at the boundaries the rollout
can't reach: newest-tier government with table-order tie-break, greedy
economic-slot fill (URBAN_PLANNING always first), and the influence tier.
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
    rj = json.loads((FIXTURES / "rules.json").read_text())
    civ_idx = {c["id"]: i for i, c in enumerate(rj["civics"])}
    gov_idx = {g["id"]: i for i, g in enumerate(rj["governments"])}

    assert rj["governments"], "rules.json carries no governments table (A-7r exporter rows missing)"
    assert len(rj["policies"]) >= 50, f"expected the full ~50+ policy catalog, got {len(rj['policies'])}"
    # URBAN_PLANNING must remain the first economic card (greedy slotting relies on it).
    econ = [p["id"] for p in rj["policies"] if p["kind"] == 1]
    assert econ[0] == "URBAN_PLANNING", f"URBAN_PLANNING must be the first economic policy, got {econ[0]}"

    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)

    # Force the master switch on in-memory to exercise the (shipped-inert) logic.
    sim._gov_live = True
    sim._gov_has_effects = True

    B = sim.B
    NC = sim.civics.shape[1]

    def civics_with(ids: list[str]) -> torch.Tensor:
        c = torch.zeros(B, NC, dtype=torch.bool, device=sim.device)
        for i in ids:
            c[:, civ_idx[i]] = True
        return c

    PROD = 1  # yield column order: food,prod,gold,sci,cul,faith

    # 1) No civics -> no government, zero modifiers, tier 0.
    c0 = torch.zeros(B, NC, dtype=torch.bool, device=sim.device)
    _, has_gov = sim._adopted_gov(c0)
    assert not bool(has_gov.any()), "no government should be adopted with zero civics"
    city_y, cap_y = sim._gov_policy_mods(c0)
    assert float(city_y.abs().sum()) == 0.0 and float(cap_y.abs().sum()) == 0.0, "no gov/policy mods with zero civics"
    assert int(sim._adopted_gov_tier(c0)[0]) == 0, "influence tier 0 with no government"

    # 2) CODE_OF_LAWS -> CHIEFDOM (tier 0) + URBAN_PLANNING slotted (+1 prod/city).
    c1 = civics_with(["CODE_OF_LAWS"])
    adopted, has_gov = sim._adopted_gov(c1)
    assert bool(has_gov.all()), "CHIEFDOM should be adopted once CODE_OF_LAWS is in"
    assert int(adopted[0]) == gov_idx["CHIEFDOM"], "newest unlocked government is CHIEFDOM here"
    city_y, cap_y = sim._gov_policy_mods(c1)
    assert float(city_y[0, PROD]) == 1.0, "URBAN_PLANNING gives +1 production to every city"
    assert float(cap_y.abs().sum()) == 0.0, "CHIEFDOM has no capital yields"
    assert int(sim._adopted_gov_tier(c1)[0]) == 0, "CHIEFDOM influence tier is 0"

    # 3) + POLITICAL_PHILOSOPHY -> AUTOCRACY (tier 1, table-order tie-break over
    #    OLIGARCHY/CLASSICAL_REPUBLIC): +1 all yields in the capital, URBAN_PLANNING
    #    still slotted in the economic slot, influence tier 1.
    c2 = civics_with(["CODE_OF_LAWS", "CRAFTSMANSHIP", "POLITICAL_PHILOSOPHY"])
    adopted, has_gov = sim._adopted_gov(c2)
    assert int(adopted[0]) == gov_idx["AUTOCRACY"], "newest tier-1 government, table-order tie-break => AUTOCRACY"
    city_y, cap_y = sim._gov_policy_mods(c2)
    assert float(city_y[0, PROD]) == 1.0, "URBAN_PLANNING still slotted in AUTOCRACY's economic slot"
    for k in range(6):
        assert float(cap_y[0, k]) == 1.0, f"AUTOCRACY gives +1 to capital yield column {k}"
    assert int(sim._adopted_gov_tier(c2)[0]) == 1, "AUTOCRACY influence tier is 1"

    # 4) Shipped state is inert: the master switch defaults off, so a real sim
    #    computes zero gov/policy modifiers regardless of civics.
    sim2 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert sim2._gov_live is False, "A-7r must ship inert (rules.governmentsLive False)"
    cy, cpy = sim2._gov_policy_mods(civics_with(["CODE_OF_LAWS"]))
    assert float(cy.abs().sum()) == 0.0 and float(cpy.abs().sum()) == 0.0, "inert: no mods while the switch is off"

    print("government_test OK — adoption, greedy slot fill, influence tier, inert-by-default")


if __name__ == "__main__":
    main()
