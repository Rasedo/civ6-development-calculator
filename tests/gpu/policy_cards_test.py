"""Policy-card CHANNEL self-test.

The government/policy assembler now returns the whole effect matrix, not the
yield columns alone: `_gov_policy_mods` hands back adjacencyMult, the
buildingYieldBoost rows, and a bundle carrying every remaining channel. This
lane drives the assembler directly (the government_test pattern) and asserts
each channel arrives, that a retired card leaves the pool, and that the two
appliers with a direction — Discipline's barbarian bonus and the unit-upkeep
cut — run the way their TS twins do."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from core.simbase import BARB_SEAT
from warmup import settle_all


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text())
    civ_idx = {c["id"]: i for i, c in enumerate(rj["civics"])}
    pol_i = {p["id"]: i for i, p in enumerate(rj["policies"])}
    unit_i = {u["id"]: i for i, u in enumerate(rj["units"])}

    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    sim._gov_live = True
    sim._gov_has_effects = True

    B, NC = sim.B, sim.civ_civics.shape[2]

    def civics_with(ids: list[str]) -> torch.Tensor:
        c = torch.zeros(B, NC, dtype=torch.bool, device=sim.device)
        for i in ids:
            c[:, civ_idx[i]] = True
        return c

    def fx_of(ids: list[str]):
        return sim._gov_policy_mods(civics_with(ids))

    # The greedy fill takes TABLE order, so a late card is only reachable once
    # the earlier ones retire — COLONIALISM is what retires the two Ancient
    # military cards, and each set below is the smallest that lands its card.
    AGOGE_IN = ["CODE_OF_LAWS", "CRAFTSMANSHIP", "COLONIALISM"]

    # 1) A retired card leaves the pool for good.
    slot_a = fx_of(AGOGE_IN)[4]
    assert bool(slot_a[0, pol_i["AGOGE"]]), "AGOGE fills the military slot once CRAFTSMANSHIP grants it"
    slot_b = fx_of(AGOGE_IN + ["FEUDALISM"])[4]
    assert not bool(slot_b[0, pol_i["AGOGE"]]), "FEUDALISM is AGOGE's obsolete_with — the card leaves the pool"
    print("  1 obsolescence: AGOGE in on CRAFTSMANSHIP, out on FEUDALISM")

    # 2) adjacencyMult reaches the per-seat adjacency read.
    scr = ["CODE_OF_LAWS", "THEOLOGY", "COLONIALISM", "ENLIGHTENMENT"]
    assert bool(fx_of(scr)[4][0, pol_i["SCRIPTURE"]]), "SCRIPTURE takes an economic slot"
    adj = fx_of(scr)[10]
    hs = sim._hs_idx
    assert float(adj[0, hs]) == 2.0, f"SCRIPTURE doubles Holy Site adjacency, got {float(adj[0, hs])}"
    assert float(adj[0, sim._campus_idx]) == 1.0, "and nothing else moves"
    print(f"  2 adjacencyMult: Holy Site x{float(adj[0, hs])}")

    # 3) buildingYieldBoost arrives as a row, not a per-district multiplier.
    byb = fx_of(["CODE_OF_LAWS", "REFORMED_CHURCH"])[11]
    live = [r for a, r in byb if bool(a[0])]
    assert len(live) == 1, f"SIMULTANEUM is the one live boost row, got {len(live)}"
    _row = live[0]
    assert int(_row[0]) == hs and int(_row[1]) == 5, "Simultaneum is FAITH from the Holy Site"
    assert float(_row[2]) == 1.0 and float(_row[3]) == 15.0 and float(_row[4]) == 0.5, "flat +100%, +50% at pop 15"
    assert float(_row[5]) == 4.0 and float(_row[6]) == 0.5, "+50% at +4 adjacency"
    print(f"  3 buildingYieldBoost: district {int(_row[0])} yield {int(_row[1])} pct {float(_row[2])}")

    # 4) The production cards' two axes.
    prod = [p for p in fx_of(AGOGE_IN)[12]["prod"] if bool(p[0][0])]
    assert len(prod) == 1, f"AGOGE is the one live production boost, got {len(prod)}"
    _pact, _isw, _cmask, _eramax, _pct = prod[0]
    assert _isw == 0 and _eramax == 1 and abs(_pct - 0.5) < 1e-12, "AGOGE: units, Classical and earlier, +50%"
    war = unit_i["WARRIOR"]
    xbow = unit_i["CROSSBOWMAN"]
    assert int(sim._type_cls[war]) & _cmask, "a WARRIOR is melee — AGOGE reaches it"
    assert int(sim._type_era[xbow]) > _eramax, "a CROSSBOWMAN is Medieval — AGOGE does not"
    print(f"  4 prodBoost: mask {_cmask}, eraMax {_eramax}, pct {_pct}")

    # 5) Every remaining channel arrives on the seat that slotted its card.
    BAST = ["CODE_OF_LAWS", "DEFENSIVE_TACTICS", "COLONIALISM"]
    CHECKS = [
        (["CODE_OF_LAWS"], "vbarb", 5.0, "DISCIPLINE +5 vs barbarians"),
        (BAST, "cdef", 6.0, "BASTIONS +6 city defence"),
        (BAST, "crng", 5.0, "BASTIONS +5 city ranged"),
        (["CODE_OF_LAWS", "DIVINE_RIGHT", "FEUDALISM", "COLONIALISM"], "bcharge", 2.0, "SERFDOM +2 build charges"),
        (["CODE_OF_LAWS", "STATE_WORKFORCE", "COLONIALISM"], "mcut", 1.0, "CONSCRIPTION -1 gold upkeep"),
        (["CODE_OF_LAWS", "FOREIGN_TRADE", "COLONIALISM", "EXPLORATION"], "rgold", 2.0, "CARAVANSARIES +2 gold per route"),
        (["CODE_OF_LAWS", "SUFFRAGE", "POLITICAL_PHILOSOPHY"], "infl", 2.0, "CHARISMATIC_LEADER +2 influence"),
        (["CODE_OF_LAWS", "DIVINE_RIGHT", "SOCIAL_MEDIA"], "culsuz", 0.05, "COLLECTIVE_ACTIVISM +5% culture per suzerainty"),
    ]
    for ids, key, want, why in CHECKS:
        got = float(fx_of(ids)[12][key][0])
        assert abs(got - want) < 1e-12, f"{why}: expected {want}, got {got}"
    print("  5 flat channels: " + ", ".join(k for _, k, _, _ in CHECKS))

    rxp = fx_of(["CODE_OF_LAWS", "DIVINE_RIGHT"])[12]["rxp"]
    assert float(rxp[0]) == 2.0, f"SURVEY doubles recon experience, got {float(rxp[0])}"
    tw = fx_of(["CODE_OF_LAWS", "SCORCHED_EARTH", "COLONIALISM"])[12]["rplun"]
    assert float(tw[0]) == 1.5, f"TOTAL_WAR pays +50% route plunder, got {float(tw[0])}"
    e1 = fx_of(["CODE_OF_LAWS", "POLITICAL_PHILOSOPHY"])[12]["envoy1"]
    assert bool(e1[0]), "DIPLOMATIC_LEAGUE takes AUTOCRACY's diplomatic slot"
    gpp = fx_of(["CODE_OF_LAWS", "SUFFRAGE", "MILITARY_TRADITION", "COLONIALISM"])[12]["gpp"]
    assert float(gpp[0].sum()) == 2.0, f"STRATEGOS pays +2 General points, got {float(gpp[0].sum())}"
    print(f"  6 rxp {float(rxp[0])}, rplun {float(tw[0])}, envoy1 {bool(e1[0])}, gpp {float(gpp[0].sum())}")

    # 7) The two appliers with a direction.
    sim.civ_civics[:, 0].copy_(civics_with(["CODE_OF_LAWS", "STATE_WORKFORCE", "COLONIALISM"]))
    sim._eff_version += 1
    types = torch.full((B,), unit_i["KNIGHT"], dtype=torch.long, device=sim.device)
    base = float(sim._type_maintenance[unit_i["KNIGHT"]])
    cut = float(sim._unit_upkeep(0, types)[0])
    assert abs(cut - max(0.0, base - 1.0)) < 1e-12, f"CONSCRIPTION: {base} -> {cut}"
    free = float(sim._unit_upkeep(0, torch.full((B,), unit_i["BUILDER"], dtype=torch.long, device=sim.device))[0])
    assert free == 0.0, "a free unit never goes negative"

    sim.civ_civics[:, 0].copy_(civics_with(["CODE_OF_LAWS"]))
    sim._eff_version += 1
    mine = torch.zeros(B, dtype=torch.long, device=sim.device)
    barb = torch.full((B,), BARB_SEAT, dtype=torch.long, device=sim.device)
    assert float(sim._barb_cs(mine, barb)[0]) == 5.0, "seat 0 fighting a barbarian takes DISCIPLINE's +5"
    assert float(sim._barb_cs(mine, torch.ones_like(mine))[0]) == 0.0, "a major foe is not a barbarian"
    assert float(sim._barb_cs(barb, mine)[0]) == 0.0, "and a barbarian adopts no government"
    print(f"  7 upkeep {base} -> {cut}, barb CS {float(sim._barb_cs(mine, barb)[0])}")

    print("POLICY CARDS OK")


if __name__ == "__main__":
    main()
