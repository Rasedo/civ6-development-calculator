"""THE GOVERNMENT FLAT BONUS AND THE LEGACY CARD — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/government_bonus_test.py

The TS twin is tests/cpu/seats/government-bonus.test.ts.

CIV6 (Gathering Storm): a government's second bonus is FLAT — eight
MODIFIER_PLAYER_GOVERNMENT_FLAT_BONUS rows and Communism's COMMUNISM_SCIENCE,
paid while the seat is IN the government. Expansion2_RemoveData.xml deletes
the base game's `*_ACCUMULATING` rows. The exporter writes a government's
inherent and flat bonus as ONE table row; a legacy card's row is its
government's inherent bonus alone.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

ROW = 0
SCIENCE = 3   # YIELD_KEYS: food, production, gold, science, culture, faith

# THE WARMED BASE: a scene pays a `restore` instead of a fixture load and a settle.
_BASE: dict = {}


def build(path) -> BatchSim:
    key = str(path)
    if key not in _BASE:
        sim = settle_all(BatchSim([load_fixture(path)], load_rules(),
                                  device="cpu", dtype=torch.float64))
        _BASE[key] = (sim, sim.snapshot())
    sim, snap = _BASE[key]
    sim.restore(snap)
    return sim


def gov_index(rules, gid: str) -> int:
    return [g["id"] for g in rules.governments].index(gid)


def in_government(sim: BatchSim, rules, civic: str) -> None:
    """the seat holds exactly one civic, the one that unlocks the government
    under test — `_adopted_gov` takes the newest tier it reaches"""
    import json
    from core import FIXTURES
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    ci = [c["id"] for c in rj["civics"]].index(civic)
    sim.civ_civics[:, ROW] = False
    sim.civ_civics[:, ROW, ci] = True
    sim._eff_version += 1


def test_the_wire(rules, path) -> None:
    """the flat bonus rides the government row; no legacy card row carries it"""
    sim = build(path)
    g = {gid: gov_index(rules, gid) for gid in ("AUTOCRACY", "FASCISM", "MONARCHY", "THEOCRACY",
                                                 "DEMOCRACY", "MERCHANT_REPUBLIC", "OLIGARCHY",
                                                 "CLASSICAL_REPUBLIC", "COMMUNISM", "CHIEFDOM")}
    assert float(sim._gov_prodb[g["AUTOCRACY"], 0]) == 1 and abs(float(sim._gov_prodb[g["AUTOCRACY"], 3]) - 0.1) < 1e-12, "Autocracy: +10% toward wonders"
    assert float(sim._gov_prodb[g["FASCISM"], 0]) == 2 and abs(float(sim._gov_prodb[g["FASCISM"], 3]) - 0.5) < 1e-12, "Fascism: +50% toward every unit"
    assert float(sim._gov_inflmult[g["MONARCHY"]]) == 1.5, "Monarchy: +50% influence"
    assert float(sim._gov_faithbuy[g["THEOCRACY"]]) == 15, "Theocracy: 15% off faith"
    assert float(sim._gov_goldbuy[g["DEMOCRACY"]]) == 15, "Democracy: 15% off gold"
    assert abs(float(sim._gov_distprod[g["MERCHANT_REPUBLIC"]]) - 1.15) < 1e-12, "Merchant Republic: +15% toward districts"
    assert float(sim._gov_xppct[g["OLIGARCHY"]]) == 20, "Oligarchy: +20% experience"
    assert abs(float(sim._gov_gppmult[g["CLASSICAL_REPUBLIC"]]) - 1.15) < 1e-12, "Classical Republic: +15% GPP"
    assert abs(float(sim._gov_ymult[g["COMMUNISM"], SCIENCE]) - 1.1) < 1e-12, "Communism: +10% science"
    leg = sim._pol_legacy >= 0
    assert int(leg.sum()) == sim._ngov - 1, "one legacy card per government but the Chiefdom"
    assert not bool((sim._pol_prodb[leg, 0] >= 0).any()), "a legacy card carries a flat production bonus"
    for t in (sim._pol_inflmult, sim._pol_distprod):
        assert bool((t[leg] == 1).all()), "a legacy card carries a flat multiplier"
    for t in (sim._pol_goldbuy, sim._pol_faithbuy):
        assert bool((t[leg] == 0).all()), "a legacy card carries a flat discount"
    print("  1 the wire OK — nine flat bonuses on the government rows, none on a legacy card")


def test_the_purchase_discounts(rules, path) -> None:
    """Democracy takes 15% off a GOLD purchase and nothing off faith;
    Theocracy the other way. `_gold_price` / `_faith_price` are `goldPrice` /
    `faithPrice`'s twins, applied where every purchase is priced and paid."""
    for civic, gid, purse, other, want in (("SUFFRAGE", "DEMOCRACY", "_gold_price", "_faith_price", 85.0),
                                          ("REFORMED_CHURCH", "THEOCRACY", "_faith_price", "_gold_price", 85.0)):
        sim = build(path)
        in_government(sim, rules, civic)
        adopted, _ = sim._adopted_gov(sim.civ_civics[:, ROW])
        assert int(adopted[0]) == gov_index(rules, gid), f"{civic} did not adopt {gid}"
        hundred = torch.full((sim.B,), 100.0, dtype=torch.float64)
        got = float(getattr(sim, purse)(ROW, hundred)[0])
        assert abs(got - want) < 1e-9, f"{gid}: 100 -> {got}, want {want}"
        assert float(getattr(sim, other)(ROW, hundred)[0]) == 100.0, f"{gid} touched the other purse"
        # a [1, N] price row broadcasts per game too: 50 less 15% is 42.5, floored to five
        row2 = getattr(sim, purse)(ROW, torch.tensor([[100.0, 50.0]], dtype=torch.float64))
        assert row2.shape == (sim.B, 2) and abs(float(row2[0, 1]) - 40.0) < 1e-9, row2
    print("  2 the purchase discounts OK — Democracy off gold, Theocracy off faith, 15% each")


def test_the_flat_bonus_is_the_governments_alone(rules, path) -> None:
    """Autocracy's +10% toward wonders is paid while the seat is IN Autocracy,
    and its legacy card slotted under another government pays the inherent
    bonus without it."""
    sim = build(path)
    in_government(sim, rules, "POLITICAL_PHILOSOPHY")
    prod = [p for p in sim._gov_mods(ROW)[12]["prod"] if bool(p[0][0])]
    assert any(p[1] == 1 and abs(p[4] - 0.1) < 1e-12 for p in prod), f"Autocracy's wonder bonus is not paid: {prod}"
    # every civic, every government held: a legacy card is slottable
    sim = build(path)
    sim.civ_civics[:, ROW] = True
    sim.civ_gov_held[:, ROW] = (1 << sim._ngov) - 1
    sim._eff_version += 1
    auto = gov_index(rules, "AUTOCRACY")
    p_idx = int((sim._pol_legacy == auto).nonzero()[0])
    before = sim._gov_mods(ROW)[12]["govbldy"].clone()
    chosen = torch.zeros(sim.B, sim._npol, dtype=torch.bool)
    chosen[:, p_idx] = True
    sim.seat_ext[:, ROW] = True
    sim.apply_seat_actions(ROW, policies=chosen)
    sim._seat_record_apply(ROW, torch.ones(sim.B, dtype=torch.bool))
    assert bool(sim._seat_slotted(ROW)[0, p_idx]), "the store did not take the legacy card"
    fx = sim._gov_mods(ROW)[12]
    assert float(fx["govbldy"][0] - before[0]) == float(sim._gov_govbldy[auto]), "the legacy card did not pay Autocracy's inherent bonus"
    assert not any(p[1] == 1 and abs(p[4] - 0.1) < 1e-12 for p in fx["prod"] if bool(p[0][0])), "the legacy card paid the flat bonus"
    print("  3 the flat bonus is the government's alone OK")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_the_purchase_discounts(rules, path)
    test_the_flat_bonus_is_the_governments_alone(rules, path)
    print("BATTERY OK government_bonus")
    return 0


if __name__ == "__main__":
    sys.exit(main())
