"""Government/policy adoption self-test.

The system is live (rules.governmentsLive = True). Drives the deterministic
adoption + greedy slot-fill directly (the occupancy_test pattern), asserting
the GPU's `_adopted_gov` / `_adopted_gov_tier` / `_gov_policy_mods` match the
TS `computeAdoption` / `applyGovernment` rule at the boundaries: newest-tier
government with table-order tie-break, greedy slot fill incl. the wildcard
overflow, the influence tier, and the SOURCED government rows — the combat
CS / xp / weariness / GPP / any-district channels, and the deleted
unsourced magnitudes staying deleted."""

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
    rj = json.loads((FIXTURES / "rules.json").read_text())
    civ_idx = {c["id"]: i for i, c in enumerate(rj["civics"])}
    gov_idx = {g["id"]: i for i, g in enumerate(rj["governments"])}

    assert rj["governments"], "rules.json carries no governments table (exporter rows missing)"
    assert rj["policies"], "rules.json carries no policy table (exporter rows missing)"
    # URBAN_PLANNING must remain the first economic card (greedy slotting relies on it).
    econ = [p["id"] for p in rj["policies"] if p["kind"] == 1]
    assert econ[0] == "URBAN_PLANNING", f"URBAN_PLANNING must be the first economic policy, got {econ[0]}"

    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))

    # Force the master switch on in-memory so the pokes are export-independent.
    sim._gov_live = True
    sim._gov_has_effects = True

    B = sim.B
    NC = sim.civ_civics.shape[2]

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
    city_y, cap_y, hous, ymult, _sl, _em, _tp, *_ = sim._gov_policy_mods(c0)
    assert float(city_y.abs().sum()) == 0.0 and float(cap_y.abs().sum()) == 0.0 and float(hous.abs().sum()) == 0.0, "no gov/policy mods with zero civics"
    assert int(sim._adopted_gov_tier(c0)[0]) == 0, "influence tier 0 with no government"

    # 2) CODE_OF_LAWS -> CHIEFDOM (tier 0) + URBAN_PLANNING slotted (+1 prod/city).
    #    GOD_KING is also unlocked but CHIEFDOM has one economic slot and no
    #    wildcard -> it stays out (overflow needs a W slot).
    c1 = civics_with(["CODE_OF_LAWS"])
    adopted, has_gov = sim._adopted_gov(c1)
    assert bool(has_gov.all()), "CHIEFDOM should be adopted once CODE_OF_LAWS is in"
    assert int(adopted[0]) == gov_idx["CHIEFDOM"], "newest unlocked government is CHIEFDOM here"
    city_y, cap_y, hous, ymult, _sl, _em, _tp, *_ = sim._gov_policy_mods(c1)
    assert float(city_y[0, PROD]) == 1.0, "URBAN_PLANNING gives +1 production to every city"
    assert float(cap_y.abs().sum()) == 0.0, "CHIEFDOM has no capital yields and GOD_KING must NOT spill (no W slot)"
    assert int(sim._adopted_gov_tier(c1)[0]) == 0, "CHIEFDOM influence tier is 0"

    # 3) + POLITICAL_PHILOSOPHY -> AUTOCRACY (tier 1, table-order tie-break over
    #    OLIGARCHY/CLASSICAL_REPUBLIC): URBAN_PLANNING still slotted in the
    #    economic slot, influence tier 1.
    #    AUTOCRACY's slots are the sourced [M,E,D,W] (Civilopedia: 1 Military,
    #    1 Economic, 1 Diplomatic, 1 Wildcard), so GOD_KING (economic, E taken
    #    by URBAN_PLANNING) spills into the Wildcard exactly as it does under
    #    MONARCHY in step 4. AUTOCRACY itself pays NO capital yields: its
    #    inherent bonus counts GOVERNMENT BUILDINGS, so the capital reads
    #    GOD_KING's +1 gold / +1 faith and nothing else.
    c2 = civics_with(["CODE_OF_LAWS", "CRAFTSMANSHIP", "POLITICAL_PHILOSOPHY"])
    adopted, has_gov = sim._adopted_gov(c2)
    assert int(adopted[0]) == gov_idx["AUTOCRACY"], "newest tier-1 government, table-order tie-break => AUTOCRACY"
    city_y, cap_y, hous, ymult, _sl, _em, _tp, *_ = sim._gov_policy_mods(c2)
    assert float(city_y[0, PROD]) == 1.0, "URBAN_PLANNING still slotted in AUTOCRACY's economic slot"
    for k in range(6):
        want = 1.0 if k in (2, 5) else 0.0  # gold, faith carry GOD_KING's wildcard spill
        assert float(cap_y[0, k]) == want, (
            f"AUTOCRACY capital yield column {k}: expected {want} "
            "(GOD_KING's gold/faith in the wildcard, and nothing from the government)"
        )
    assert int(sim._adopted_gov_tier(c2)[0]) == 1, "AUTOCRACY influence tier is 1"
    assert float(hous.abs().sum()) == 0.0, "no housingAll at tier 1"

    # The three channels the government rows opened, straight off the loader:
    # a government pays its INHERENT bonus and never its legacy one.
    assert float(sim._gov_govbldy[gov_idx["AUTOCRACY"]]) == 1.0, "AUTOCRACY: +1 all yields per government building"
    assert float(sim._gov_wallhouse[gov_idx["MONARCHY"]]) == 1.0, "MONARCHY: +1 housing per walls level"
    assert float(sim._gov_theocs[gov_idx["THEOCRACY"]]) == 5.0, "THEOCRACY: +5 religious strength"

    # 4) MONARCHY (tier 2) -> its housing rides `wallhouse`, not `housingAll`,
    #    so the flat channel stays empty; plus the wildcard-overflow fill:
    #    slots [M,M,E,D,W,W] (Civilopedia 2M/1E/1D/2W); VETERANCY -> M1,
    #    URBAN_PLANNING -> E, GOD_KING (economic, E full) spills into a W slot
    #    -> +1 gold +1 faith on the capital ON TOP of nothing else (MONARCHY
    #    has no capitalYields).
    c3 = civics_with(["CODE_OF_LAWS", "CRAFTSMANSHIP", "MILITARY_TRADITION", "POLITICAL_PHILOSOPHY", "STATE_WORKFORCE", "EARLY_EMPIRE", "CIVIL_SERVICE", "DIVINE_RIGHT"])
    adopted, has_gov = sim._adopted_gov(c3)
    assert int(adopted[0]) == gov_idx["MONARCHY"], "newest tier-2 government => MONARCHY"
    city_y, cap_y, hous, ymult, _sl, _em, _tp, *_ = sim._gov_policy_mods(c3)
    assert float(hous[0]) == 0.0, "MONARCHY's housing is per walls LEVEL, never the flat `housingAll`"
    GOLD, FAITH = 2, 5
    assert float(cap_y[0, GOLD]) == 1.0 and float(cap_y[0, FAITH]) == 1.0, "GOD_KING spills into MONARCHY's wildcard slot (+1 gold/+1 faith capital)"
    assert float(city_y[0, PROD]) == 1.0, "URBAN_PLANNING keeps the economic slot"

    # 4b) The single-Wildcard contest: EXPLORATION without DIVINE_RIGHT ->
    #     MERCHANT_REPUBLIC (the only unlocked tier-2), which carries no
    #     modeled bonus since its sourced terms are governor-gated.
    c4 = civics_with(["CODE_OF_LAWS", "CRAFTSMANSHIP", "FOREIGN_TRADE", "MILITARY_TRADITION", "STATE_WORKFORCE", "EARLY_EMPIRE", "POLITICAL_PHILOSOPHY", "CIVIL_SERVICE", "FEUDALISM", "GUILDS", "MEDIEVAL_FAIRES", "GAMES_AND_RECREATION", "EXPLORATION"])
    adopted, has_gov = sim._adopted_gov(c4)
    assert int(adopted[0]) == gov_idx["MERCHANT_REPUBLIC"], "EXPLORATION without DIVINE_RIGHT => MERCHANT_REPUBLIC"
    city_y, cap_y, hous, ymult, sl4, _em, _tp, *_ = sim._gov_policy_mods(c4)
    assert float((ymult[0] - 1).abs().sum()) == 0.0, "MERCHANT_REPUBLIC carries no modeled bonus (its sourced terms are governor-gated)"
    pol_idx = {p["id"]: i for i, p in enumerate(rj["policies"])}
    pol_by_id = {p["id"]: p for p in rj["policies"]}
    # MERCHANT_REPUBLIC's slots are the sourced [M,E,E,D,D,W] (Civilopedia
    # 1M/2E/2D/1W). URBAN_PLANNING and GOD_KING fill the two economic slots,
    # so with ONE Wildcard only the FIRST remaining economic card spills:
    # LAND_SURVEYORS takes it on table order and INSULAE is squeezed out.
    assert bool(sl4[0, pol_idx["LAND_SURVEYORS"]]), "LAND_SURVEYORS takes the single W slot"
    assert not bool(sl4[0, pol_idx["INSULAE"]]), (
        "INSULAE must NOT be slotted — MERCHANT_REPUBLIC has one Wildcard, not two, "
        "and LAND_SURVEYORS wins it on table order"
    )

    # 5) The master switch ships LIVE — a real sim computes the mods; forcing
    #    the switch off in-memory silences them.
    sim2 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    assert sim2._gov_live is True, "governments ship LIVE (rules.governmentsLive True)"
    sim2._gov_has_effects = False  # force-off in memory
    cy, cpy, ch, cym, _s2, _e2, _tp2, *_ = sim2._gov_policy_mods(civics_with(["CODE_OF_LAWS"]))
    assert float(cy.abs().sum()) == 0.0 and float(cpy.abs().sum()) == 0.0 and float(ch.abs().sum()) == 0.0, "switch off => no mods"

    # 6) A card slots at its civic boundary. CODE_OF_LAWS also grants
    #    DISCIPLINE + SURVEY. CHIEFDOM has ONE military slot; DISCIPLINE
    #    (earlier in POLICIES table order than SURVEY) takes it, SURVEY is
    #    dropped, URBAN_PLANNING keeps the economic slot.
    pol_i = {p["id"]: i for i, p in enumerate(rj["policies"])}
    _, _, _, _, sl6, *_ = sim._gov_policy_mods(civics_with(["CODE_OF_LAWS"]))
    assert bool(sl6[0, pol_i["DISCIPLINE"]]), "DISCIPLINE fills CHIEFDOM's military slot once CODE_OF_LAWS grants it"
    assert not bool(sl6[0, pol_i["SURVEY"]]), "SURVEY is dropped — CHIEFDOM has only one military slot"
    assert bool(sl6[0, pol_i["URBAN_PLANNING"]]), "URBAN_PLANNING keeps the economic slot"

    # 7) ONE card stays inert, and the export says so channel by channel:
    #    ONLINE_COMMUNITIES' row IS the neutral row, so any card matching it
    #    everywhere carries no effect at all. It is a deferral on an absent
    #    system, not a stub.
    META = {"id", "kind", "unlockCivic", "obsoleteCivic", "dark"}
    neutral = {k: v for k, v in pol_by_id["ONLINE_COMMUNITIES"].items() if k not in META}
    inert = sorted(p["id"] for p in rj["policies"] if all(p[k] == v for k, v in neutral.items()))
    assert inert == ["ONLINE_COMMUNITIES"], f"the inert set moved: {inert}"
    n_era = int(rj["eras"]["count"])
    for p in rj["policies"]:
        # a DARK AGE card is granted by the age and its era window, never by a
        # civic; every other card is granted by exactly one civic
        lo, hi = p["dark"]
        if lo >= 0:
            assert p["unlockCivic"] == -1, f"{p['id']} is a dark card — no civic grants it"
            assert p["obsoleteCivic"] == -1, f"{p['id']} is a dark card — no civic retires it"
            assert p["kind"] == 3, f"{p['id']} is a dark card — wildcard only"
            assert lo <= hi < n_era, f"{p['id']} has an era window outside the ladder"
        else:
            assert hi == -1, f"{p['id']} carries half an era window"
            assert p["unlockCivic"] >= 0, f"{p['id']} is adoptable but no civic grants it"
            assert p["obsoleteCivic"] == -1 or 0 <= p["obsoleteCivic"] < len(rj["civics"]), f"{p['id']} retires to nothing"

    # 8) The MEDIEVAL_FAIRES "run 4 policy cards" inspiration: drive
    #    _detect_seat_boosts and assert it fires at >=4 slotted policies, not
    #    below. ONE detector serves every row, so the lane also proves a CIV
    #    row reads its OWN slotted-policy count.
    mf_idx = civ_idx["MEDIEVAL_FAIRES"]
    simp = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    simp.civ_civics[:, 0].copy_(civics_with(["CODE_OF_LAWS", "CRAFTSMANSHIP", "MILITARY_TRADITION", "POLITICAL_PHILOSOPHY", "STATE_WORKFORCE", "EARLY_EMPIRE", "CIVIL_SERVICE", "DIVINE_RIGHT"]))
    _, _, _, _, slp, *_ = simp._gov_policy_mods(simp.civ_civics[:, 0])
    assert int(slp[0].sum()) >= 4, "MONARCHY config must slot >=4 policies to arm the inspiration"
    simp.civ_civic_boosted[:, 0] = False
    simp._detect_seat_boosts(0, torch.ones(simp.B, dtype=torch.bool))
    assert bool(simp.civ_civic_boosted[0, 0, mf_idx]), "MEDIEVAL_FAIRES inspiration fires at 4+ slotted policies"
    simn = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    simn.civ_civics[:, 0].copy_(civics_with(["CODE_OF_LAWS"]))
    _, _, _, _, sln, *_ = simn._gov_policy_mods(simn.civ_civics[:, 0])
    assert int(sln[0].sum()) < 4, "CHIEFDOM+CODE_OF_LAWS slots <4 policies"
    simn.civ_civic_boosted[:, 0] = False
    simn._detect_seat_boosts(0, torch.ones(simn.B, dtype=torch.bool))
    assert not bool(simn.civ_civic_boosted[0, 0, mf_idx]), "MEDIEVAL_FAIRES does NOT fire below 4 slotted policies"
    # ...and the same row on a CIV seat: the policies condition is keyed on
    # that seat's own civics, not on seat 0's.
    if simp.n_majors > 1:
        simr = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
        simr.civ_civics[:, 1].copy_(civics_with(["CODE_OF_LAWS", "CRAFTSMANSHIP", "MILITARY_TRADITION", "POLITICAL_PHILOSOPHY", "STATE_WORKFORCE", "EARLY_EMPIRE", "CIVIL_SERVICE", "DIVINE_RIGHT"]))
        simr.civ_civic_boosted[:, 1:] = False
        simr._detect_seat_boosts(1, torch.ones(simr.B, dtype=torch.bool))
        assert bool(simr.civ_civic_boosted[0, 1, mf_idx]), (
            "MEDIEVAL_FAIRES never fires for a CIV seat — the policies condition "
            "is still seat-0-only"
        )
        assert not bool(simr.civ_civic_boosted[0, 0, mf_idx]), "a civ's inspiration landed on seat 0's row"

    # 9) The sourced government rows, channel by channel — what each ships,
    #    and the DELETED unsourced magnitudes staying deleted.
    ui = {u["id"]: i for i, u in enumerate(rj["units"])}
    oli, fas = gov_idx["OLIGARCHY"], gov_idx["FASCISM"]
    bt = sim._gov_ucs_by_type
    for uid, o_want, f_want in (("WARRIOR", 4, 5), ("SPEARMAN", 4, 5), ("GALLEY", 4, 5),
                                ("ARCHER", 0, 5), ("CATAPULT", 0, 5),
                                ("SETTLER", 0, 0), ("TRADER", 0, 0)):
        assert float(bt[oli, ui[uid]]) == o_want, f"OLIGARCHY {uid}: want {o_want}"
        assert float(bt[fas, ui[uid]]) == f_want, f"FASCISM {uid}: want {f_want}"
    assert not bool((sim._type_melee & sim._type_anticav).any()), "no unit type is melee AND antiCavalry"
    assert float(sim._gov_wwcut[fas]) == 15.0, "FASCISM war weariness -15%"
    cr = gov_idx["CLASSICAL_REPUBLIC"]
    assert float(sim._gov_dc_house[cr]) == 1.0 and float(sim._gov_dc_amen[cr]) == 1.0, "CLASSICAL_REPUBLIC +1/+1 in cities with ANY district"
    assert int(sim._gov_hid_min[cr]) == -1, "CLASSICAL_REPUBLIC no longer rides the SPECIALTY channel"
    assert float(sim._gov_housing[gov_idx["MONARCHY"]]) == 0.0, "MONARCHY's unsourced flat housing stays deleted"
    # A government pays its INHERENT bonus and never its LEGACY one — Rise and
    # Fall made every legacy bonus a Wildcard card you can only hold once you
    # have left that government, so no row here may carry one.
    for gname in gov_idx:
        g = gov_idx[gname]
        assert float(sim._gov_xppct[g]) == 0.0, f"{gname}: unit experience is a legacy row"
        assert float(sim._gov_gppmult[g]) == 1.0, f"{gname}: the GPP factor is a legacy row"
        assert float(sim._gov_prodb[g, 0]) == -1.0, f"{gname}: production toward wonders/units is a legacy row"
        assert float((sim._gov_ymult[g] - 1).abs().sum()) == 0.0, f"{gname}: a yield multiplier is a legacy row"
        assert not bool(sim._gov_faith_units[g]), f"{gname}: GS moved the faith purchase to the Grand Master's Chapel"

    # 10) FASCISM through the fold: TOTALITARIANISM alone at tier 3 adopts
    #     it, and every new channel lands in the fx dict.
    cF = civics_with(["CODE_OF_LAWS", "POLITICAL_PHILOSOPHY", "TOTALITARIANISM"])
    adoptedF, hasF = sim._adopted_gov(cF)
    assert int(adoptedF[0]) == fas and bool(hasF[0]), "TOTALITARIANISM alone at tier 3 => FASCISM"
    fxF = sim._gov_policy_mods(cF)[12]
    assert float(fxF["wwcut"][0]) == 15.0 and float(fxF["xppct"][0]) == 0.0, "FASCISM fx: -15% weariness, no xp term"
    assert float(fxF["gppmult"][0]) == 1.0, "FASCISM fx: no GPP factor"
    _prows = [(int(w), int(cm), int(e), float(p)) for _a, w, cm, e, p in fxF["prod"] if bool(_a[0])]
    assert (2, 0, -1, 0.5) not in _prows, "FASCISM fx: +50% toward units is its LEGACY row, not the government's"

    # 11) `_gov_unit_cs` — seat 0 under FASCISM pays +5 to combatants only;
    #     a city-state seat adopts nothing; OLIGARCHY's row borrowed onto
    #     the adopted slot proves the promotion-class mask arms.
    simc = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    simc._gov_live = True
    simc._gov_has_effects = True
    simc.civ_civics[:, 0].copy_(cF)
    simc._eff_version += 1
    s0 = torch.zeros(simc.B, dtype=torch.long)

    def ucs(sim_, uid, seat_t):
        return int(sim_._gov_unit_cs(torch.full((sim_.B,), ui[uid], dtype=torch.long), seat_t)[0])

    for uid, want in (("WARRIOR", 5), ("ARCHER", 5), ("GALLEY", 5), ("SETTLER", 0), ("TRADER", 0)):
        assert ucs(simc, uid, s0) == want, f"FASCISM _gov_unit_cs {uid}: want {want}"
    cs_seat = torch.full((simc.B,), 100, dtype=torch.long)
    assert ucs(simc, "WARRIOR", cs_seat) == 0, "a city-state seat adopts no government"
    simc._gov_ucs_by_type[fas] = simc._gov_ucs_by_type[oli]
    simc._eff_version += 1
    for uid, want in (("WARRIOR", 4), ("SPEARMAN", 4), ("GALLEY", 4), ("ARCHER", 0), ("SETTLER", 0)):
        assert ucs(simc, uid, s0) == want, f"OLIGARCHY-row _gov_unit_cs {uid}: want {want}"

    # 12) The ANY-district walk arms, borrowed onto the adopted row: one
    #     completed CANAL (no housing or amenity of its own) opens exactly
    #     the granted point, and a districtless city reads nothing.
    canal_i = next(i for i, d in enumerate(simc.districts_cat) if d.get("id") == "CANAL")
    h0 = simc._seat_housing(0)[1].clone()
    ctr = int(simc.city_center[0, 0, 0])
    simc._gov_dc_house[fas] = 1.0
    simc._eff_version += 1
    h_no_district = simc._seat_housing(0)[1]
    assert float((h_no_district - h0).abs().sum()) == 0.0, "the grant pays NOTHING to a districtless city"
    simc.city_dist_tile[0, 0, 0, canal_i] = ctr + 1
    simc.district_complete[0, ctr + 1] = True
    h1 = simc._seat_housing(0)[1]
    assert float(h1[0, 0] - h0[0, 0]) == 1.0, "one completed CANAL opens exactly the +1 housing grant"
    simc._gov_dc_amen[fas] = -30.0
    simc._eff_version += 1
    t_lo = simc._seat_amenity(0)[0]
    simc._gov_dc_amen[fas] = 30.0
    simc._eff_version += 1
    t_hi = simc._seat_amenity(0)[0]
    # the tier INDEX ranks best-first, so more amenities is a SMALLER index
    assert int(t_hi[0, 0]) < int(t_lo[0, 0]), "the amenity grant reaches the tier balance of the districted city"

    print("government_test OK — adoption, slot fill incl. wildcard overflow, influence tier, card slotting + the two inert cards + MEDIEVAL_FAIRES inspiration + the sourced rows (unit CS by promotion class, xp/weariness/GPP factors, the any-district grant)")


if __name__ == "__main__":
    main()
