"""A-7r government/policy adoption self-test.

LIVE since #46r (rules.governmentsLive = True). Drives the deterministic
adoption + greedy slot-fill directly (the occupancy_test pattern), asserting
the GPU's `_adopted_gov` / `_adopted_gov_tier` / `_gov_policy_mods` match the
TS `computeAdoption` / `applyGovernment` rule at the boundaries: newest-tier
government with table-order tie-break, greedy slot fill incl. the wildcard
overflow (#46r), housingAll/yieldMult/housingIfDistricts channels, and the
influence tier."""

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
    city_y, cap_y, hous, ymult, _sl, _em, _tp = sim._gov_policy_mods(c0)
    assert float(city_y.abs().sum()) == 0.0 and float(cap_y.abs().sum()) == 0.0 and float(hous.abs().sum()) == 0.0, "no gov/policy mods with zero civics"
    assert int(sim._adopted_gov_tier(c0)[0]) == 0, "influence tier 0 with no government"

    # 2) CODE_OF_LAWS -> CHIEFDOM (tier 0) + URBAN_PLANNING slotted (+1 prod/city).
    #    GOD_KING is also unlocked but CHIEFDOM has one economic slot and no
    #    wildcard -> it stays out (overflow needs a W slot).
    c1 = civics_with(["CODE_OF_LAWS"])
    adopted, has_gov = sim._adopted_gov(c1)
    assert bool(has_gov.all()), "CHIEFDOM should be adopted once CODE_OF_LAWS is in"
    assert int(adopted[0]) == gov_idx["CHIEFDOM"], "newest unlocked government is CHIEFDOM here"
    city_y, cap_y, hous, ymult, _sl, _em, _tp = sim._gov_policy_mods(c1)
    assert float(city_y[0, PROD]) == 1.0, "URBAN_PLANNING gives +1 production to every city"
    assert float(cap_y.abs().sum()) == 0.0, "CHIEFDOM has no capital yields and GOD_KING must NOT spill (no W slot)"
    assert int(sim._adopted_gov_tier(c1)[0]) == 0, "CHIEFDOM influence tier is 0"

    # 3) + POLITICAL_PHILOSOPHY -> AUTOCRACY (tier 1, table-order tie-break over
    #    OLIGARCHY/CLASSICAL_REPUBLIC): +1 all yields in the capital, URBAN_PLANNING
    #    still slotted in the economic slot, influence tier 1.
    #    #78: AUTOCRACY's slots are now the SOURCED [M,E,D,W] (Civilopedia:
    #    1 Military, 1 Economic, 1 Diplomatic, 1 Wildcard) — it was [M,M,E,D],
    #    the same total of 4 with the composition wrong. That gives it a
    #    WILDCARD it never used to have, so GOD_KING (economic, E taken by
    #    URBAN_PLANNING) now legitimately spills into it, exactly as it already
    #    did under MONARCHY in step 4. The capital therefore reads AUTOCRACY's
    #    +1 on every yield PLUS GOD_KING's +1 gold / +1 faith on top.
    #    The old flat "== 1.0 everywhere" encoded the WRONG slot list, so it is
    #    the expectation that was corrected here, not the gate that was weakened.
    c2 = civics_with(["CODE_OF_LAWS", "CRAFTSMANSHIP", "POLITICAL_PHILOSOPHY"])
    adopted, has_gov = sim._adopted_gov(c2)
    assert int(adopted[0]) == gov_idx["AUTOCRACY"], "newest tier-1 government, table-order tie-break => AUTOCRACY"
    city_y, cap_y, hous, ymult, _sl, _em, _tp = sim._gov_policy_mods(c2)
    assert float(city_y[0, PROD]) == 1.0, "URBAN_PLANNING still slotted in AUTOCRACY's economic slot"
    for k in range(6):
        want = 2.0 if k in (2, 5) else 1.0  # gold, faith carry GOD_KING's wildcard spill
        assert float(cap_y[0, k]) == want, (
            f"AUTOCRACY capital yield column {k}: expected {want} "
            "(+1 all yields, and +1 more on gold/faith from GOD_KING in the wildcard)"
        )
    assert int(sim._adopted_gov_tier(c2)[0]) == 1, "AUTOCRACY influence tier is 1"
    assert float(hous.abs().sum()) == 0.0, "no housingAll below MONARCHY"

    # 4) #46r: MONARCHY (tier 2) -> housingAll +1 AND the wildcard-overflow
    #    fill: slots [M,M,E,D,W,W] since #78 (was [M,M,M,E,D,W] when this step
    #    was written; the Civilopedia composition is 2M/1E/1D/2W and the
    #    assertions below are unaffected — GOD_KING still finds a W slot);
    #    VETERANCY -> M1, URBAN_PLANNING -> E,
    #    GOD_KING (economic, E full) spills into the W slot -> +1 gold +1
    #    faith on the capital ON TOP of nothing else (MONARCHY has no
    #    capitalYields). The exact live set the 250t scripted gate reaches
    #    at ~t117 (the seed-cluster divergence this stage fixed).
    c3 = civics_with(["CODE_OF_LAWS", "CRAFTSMANSHIP", "MILITARY_TRADITION", "POLITICAL_PHILOSOPHY", "STATE_WORKFORCE", "EARLY_EMPIRE", "CIVIL_SERVICE", "DIVINE_RIGHT"])
    adopted, has_gov = sim._adopted_gov(c3)
    assert int(adopted[0]) == gov_idx["MONARCHY"], "newest tier-2 government => MONARCHY"
    city_y, cap_y, hous, ymult, _sl, _em, _tp = sim._gov_policy_mods(c3)
    assert float(hous[0]) == 1.0, "MONARCHY housingAll +1 (player-only channel; rival sites discard it)"
    GOLD, FAITH = 2, 5
    assert float(cap_y[0, GOLD]) == 1.0 and float(cap_y[0, FAITH]) == 1.0, "GOD_KING spills into MONARCHY's wildcard slot (+1 gold/+1 faith capital)"
    assert float(city_y[0, PROD]) == 1.0, "URBAN_PLANNING keeps the economic slot"

    # 4b) #46r yieldMult + INSULAE: EXPLORATION (no DIVINE_RIGHT) ->
    #     MERCHANT_REPUBLIC (only unlocked tier-2): gold ×1.1; INSULAE
    #     (unlocked at EARLY_EMPIRE) spills into a W slot with
    #     LAND_SURVEYORS — the rng-2026006082 configuration.
    c4 = civics_with(["CODE_OF_LAWS", "CRAFTSMANSHIP", "FOREIGN_TRADE", "MILITARY_TRADITION", "STATE_WORKFORCE", "EARLY_EMPIRE", "POLITICAL_PHILOSOPHY", "CIVIL_SERVICE", "FEUDALISM", "GUILDS", "MEDIEVAL_FAIRES", "EXPLORATION"])
    adopted, has_gov = sim._adopted_gov(c4)
    assert int(adopted[0]) == gov_idx["MERCHANT_REPUBLIC"], "EXPLORATION without DIVINE_RIGHT => MERCHANT_REPUBLIC"
    city_y, cap_y, hous, ymult, sl4, _em, _tp = sim._gov_policy_mods(c4)
    GOLD2 = 2
    assert abs(float(ymult[0, GOLD2]) - 1.1) < 1e-12, "MERCHANT_REPUBLIC gold ×1.1 (the rng-2026006082 t249 catch)"
    pol_idx = {p["id"]: i for i, p in enumerate(rj["policies"])}
    # #78: MERCHANT_REPUBLIC's slots are now the SOURCED [M,E,E,D,D,W]
    # (Civilopedia: 1M/2E/2D/1W). It was [M,E,E,D,W,W] — same total of 6, with
    # a Wildcard standing in for a Diplomatic slot. Losing that second W means
    # the two economic overflows can no longer BOTH spill: LAND_SURVEYORS
    # (policy table index 81) takes the single W ahead of INSULAE (index 84).
    # So INSULAE is now correctly squeezed out.
    assert bool(sl4[0, pol_idx["LAND_SURVEYORS"]]), "LAND_SURVEYORS takes the single W slot"
    assert not bool(sl4[0, pol_idx["INSULAE"]]), (
        "INSULAE must NOT be slotted — MERCHANT_REPUBLIC has one Wildcard, not two, "
        "and LAND_SURVEYORS wins it on table order"
    )

    # 5) #46r: the master switch ships LIVE now — a real sim computes the
    #    mods; forcing the switch off in-memory silences them (the old
    #    inert-by-default assertion inverted).
    sim2 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert sim2._gov_live is True, "A-7r ships LIVE (rules.governmentsLive True since #46r)"
    sim2._gov_has_effects = False  # force-off in memory
    cy, cpy, ch, cym, _s2, _e2, _tp2 = sim2._gov_policy_mods(civics_with(["CODE_OF_LAWS"]))
    assert float(cy.abs().sum()) == 0.0 and float(cpy.abs().sum()) == 0.0 and float(ch.abs().sum()) == 0.0, "switch off => no mods"

    # 6) B-13 (Slice V) — a newly-wired card slots at its civic boundary.
    #    CODE_OF_LAWS now also grants DISCIPLINE + SURVEY. CHIEFDOM has ONE
    #    military slot; DISCIPLINE (earlier in POLICIES table order than SURVEY)
    #    takes it, SURVEY is dropped, URBAN_PLANNING keeps the economic slot.
    pol_i = {p["id"]: i for i, p in enumerate(rj["policies"])}
    _, _, _, _, sl6, _, _ = sim._gov_policy_mods(civics_with(["CODE_OF_LAWS"]))
    assert bool(sl6[0, pol_i["DISCIPLINE"]]), "DISCIPLINE fills CHIEFDOM's military slot once CODE_OF_LAWS grants it"
    assert not bool(sl6[0, pol_i["SURVEY"]]), "SURVEY is dropped — CHIEFDOM has only one military slot"
    assert bool(sl6[0, pol_i["URBAN_PLANNING"]]), "URBAN_PLANNING keeps the economic slot"

    # 7) B-13: every newly-wired card is INERT — no gov/policy CHANNEL becomes
    #    reachable through the wiring (the re-derived A-7 reachability proof).
    #    All 37 new cards are wired (unlockCivic >= 0) and carry zero yields /
    #    neutral multipliers, so slotting one never changes a traced quantity.
    NEW_CARDS = {
        "DISCIPLINE", "SURVEY", "MANEUVER", "AGOGE", "CHIVALRY", "BASTIONS", "FEUDAL_CONTRACT",
        "CONSCRIPTION", "LEVEE_EN_MASSE", "ELITE_FORCES", "MILITARY_FIRST", "REDOUBT", "TOTAL_WAR",
        "GOD_OF_THE_OPEN_SKY", "COLONIZATION", "ILKUM", "CARAVANSARIES", "MARITIME_INDUSTRIES",
        "CORVEE", "SERFDOM", "PUBLIC_WORKS", "GOTHIC_ARCHITECTURE", "SKYSCRAPERS", "ECONOMIC_UNION",
        "GRAND_MASTERS_CHAPEL", "FREE_TRADE", "DIPLOMATIC_LEAGUE", "CHARISMATIC_LEADER", "CONTAINMENT",
        "COLLECTIVE_ACTIVISM", "ONLINE_COMMUNITIES", "MARTYRDOM", "STRATEGOS", "INSPIRATION",
        "REVELATION", "LITERARY_TRADITION", "MONUMENTALITY",
    }
    seen_new = 0
    for p in rj["policies"]:
        if p["id"] not in NEW_CARDS:
            continue
        seen_new += 1
        assert p["unlockCivic"] >= 0, f"{p['id']} must be wired to a granting civic"
        assert all(v == 0 for v in p["cityYields"]) and all(v == 0 for v in p["capitalYields"]), f"{p['id']} carries flat yields (not inert)"
        assert p["housingAll"] == 0 and p["amenitiesAll"] == 0, f"{p['id']} carries housing/amenity (not inert)"
        assert all(v == 1 for v in p["yieldMult"]), f"{p['id']} carries yieldMult (not inert)"
        assert all(v == 1 for v in p["adjacencyMult"]) and all(v == 1 for v in p["buildingYieldMult"]), f"{p['id']} carries a mult (not inert)"
        assert p["tilePurchaseMult"] == 1, f"{p['id']} carries tilePurchaseMult (not inert)"
        assert p["housingIfDistricts"][0] == -1 and p["amenitiesIfSpecialty"][0] == -1 and p["newDeal"][0] == -1, f"{p['id']} carries a conditional (not inert)"
    assert seen_new == 37, f"expected all 37 Round-B2 cards present, saw {seen_new}"

    # 8) B-13: the MEDIEVAL_FAIRES "run 4 policy cards" inspiration — dormant until
    #    the wiring let the scripted player fill 4+ slots in-gate. Drive
    #    _detect_boosts and assert it fires at >=4 slotted policies, not below.
    #    Player-only (rivalCheckSatisfied returns false for 'policies').
    mf_idx = civ_idx["MEDIEVAL_FAIRES"]
    simp = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    simp.civics.copy_(civics_with(["CODE_OF_LAWS", "CRAFTSMANSHIP", "MILITARY_TRADITION", "POLITICAL_PHILOSOPHY", "STATE_WORKFORCE", "EARLY_EMPIRE", "CIVIL_SERVICE", "DIVINE_RIGHT"]))
    _, _, _, _, slp, _, _ = simp._gov_policy_mods(simp.civics)
    assert int(slp[0].sum()) >= 4, "MONARCHY config must slot >=4 policies to arm the inspiration"
    simp.civic_boosted[:] = False
    simp._detect_boosts()
    assert bool(simp.civic_boosted[0, mf_idx]), "MEDIEVAL_FAIRES inspiration fires at 4+ slotted policies"
    simn = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    simn.civics.copy_(civics_with(["CODE_OF_LAWS"]))
    _, _, _, _, sln, _, _ = simn._gov_policy_mods(simn.civics)
    assert int(sln[0].sum()) < 4, "CHIEFDOM+CODE_OF_LAWS slots <4 policies"
    simn.civic_boosted[:] = False
    simn._detect_boosts()
    assert not bool(simn.civic_boosted[0, mf_idx]), "MEDIEVAL_FAIRES does NOT fire below 4 slotted policies"

    print("government_test OK — adoption, slot fill incl. wildcard overflow, housingAll, influence tier, B-13 new-card slotting + inert-channel proof + MEDIEVAL_FAIRES policies inspiration")


if __name__ == "__main__":
    main()
