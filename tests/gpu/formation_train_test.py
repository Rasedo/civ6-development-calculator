"""THE CITY TRAINS THE FORMATION DIRECTLY.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/formation_train_test.py

CIV6 (Military Academy, Seaport): the building lets its city train a Corps or
Army (a Fleet or Armada at sea) DIRECTLY once the formation's own civic is in
— 150% / 200% of the unit's cost, 25% off for the building that enables the
order. The production layout carries the order as its own column block
(`FORM_BASE`, corps then army), the queue stores that code, and the completion
spawns the unit already at its tier.

Proven here:
  * a formation column lights only with the enabling building standing AND the
    tier's civic in — and the LAND building unlocks nothing at sea;
  * the queued order costs round(unit x 1.5 x 0.75) for the corps and
    round(unit x 2.0 x 0.75) for the army, half rounding UP as Math.round does;
  * the APPLY re-validates — a fuzzed code for a chassis without combat, a city
    without the building, or a tier without its civic commits nothing;
  * the completion spawns the unit AT its tier;
  * `_q_unit_of` / `_q_form_tier` fold the whole block onto the unit space and
    touch no other code — the contract every `kind === 'unit'` reader rides;
  * the driver's swap only ever lands on a column the mask offers.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0, ROW = 0, 0


def build(rules, path) -> BatchSim:
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(8):
        sim.step()
    return sim


def a_city(sim) -> int:
    live = sim.city_alive[B0, ROW].nonzero().flatten().tolist()
    assert live, "the fixture gave row 0 no city"
    return live[0]


def a_land_chassis(sim, j: int) -> int:
    """A military LAND unit this city can train right now."""
    tr = sim._trainable_units(ROW)[B0, j]
    ok = (tr & (sim._type_combat > 0) & (sim._type_air == 0) & ~sim.unit_naval)
    if sim._gdr_idx >= 0:
        ok[sim._gdr_idx] = False
    picks = ok.nonzero().flatten().tolist()
    assert picks, "no trainable military land chassis in the fixture's opening"
    return picks[0]


def grant(sim, j: int, ma: bool = False, sp: bool = False, civ1: bool = False, civ2: bool = False) -> None:
    """Set the two gates by hand — these pokes are about the COLUMNS, not about
    how a game would earn an Academy."""
    if sim._ma_bidx >= 0:
        sim.city_bldg[B0, ROW, j, sim._ma_bidx] = ma
    if sim._seaport_bidx >= 0:
        sim.city_bldg[B0, ROW, j, sim._seaport_bidx] = sp
    for k, on in ((1, civ1), (2, civ2)):
        ci = sim._formation_civic[k] if k < len(sim._formation_civic) else -1
        if ci >= 0:
            sim.civ_civics[B0, ROW, ci] = on
    sim._eff_version += 1
    sim._bldg_version += 1


def expected_cost(sim, ui: int, tier: int) -> float:
    """Math.round's half-UP, the TS spelling."""
    import math
    return math.floor(float(sim._type_cost[ui]) * float(sim._form_cost_mult[tier])
                      * sim._form_train_disc + 0.5)


def apply_code(sim, j: int, code: int) -> None:
    prod = torch.full((sim.B, sim.RC), -1, dtype=torch.long)
    prod[B0, j] = code
    sim._apply_seat_production(ROW, prod, None)


def clear_queue(sim, j: int) -> None:
    sim.city_current[B0, ROW, j, :] = -1
    sim.city_progress[B0, ROW, j, :] = 0
    sim.city_cost[B0, ROW, j, :] = 0
    sim.city_qtile[B0, ROW, j, :] = -1


# ---------------------------------------------------------------------------


def test_the_building_and_the_civic_gate_the_columns(rules, path) -> None:
    sim = build(rules, path)
    assert sim._ma_bidx >= 0 and sim._seaport_bidx >= 0, "the two enabling buildings must ride the wire"
    j = a_city(sim)
    ui = a_land_chassis(sim, j)
    corps, army = sim.FORM_BASE + ui, sim.FORM_BASE + sim.NU + ui

    grant(sim, j)  # nothing standing, nothing in
    m = sim.production_mask()[B0, j]
    assert not bool(m[sim.FORM_BASE:sim.PROD_W].any()), \
        "a formation column lit with no enabling building and no civic"

    grant(sim, j, ma=True)  # the building alone
    m = sim.production_mask()[B0, j]
    assert not bool(m[corps]) and not bool(m[army]), \
        "the Academy offered a formation before its civic was in"

    grant(sim, j, ma=True, civ1=True)  # + the corps civic
    m = sim.production_mask()[B0, j]
    assert bool(m[corps]), "the corps column stayed dark with the Academy standing and its civic in"
    assert not bool(m[army]), "the army column lit without its own civic"

    grant(sim, j, ma=True, civ1=True, civ2=True)  # + the army civic
    m = sim.production_mask()[B0, j]
    assert bool(m[corps]) and bool(m[army]), "both civics in, both tiers must stand"

    # the LAND building unlocks nothing at sea — a Seaport alone leaves the
    # land chassis dark
    grant(sim, j, sp=True, civ1=True, civ2=True)
    m = sim.production_mask()[B0, j]
    assert not bool(m[corps]), "a Seaport offered a LAND formation"
    print("  1 gates OK — building then civic, tier by tier, and never across the shoreline")


def test_the_order_costs_the_formation_price(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    ui = a_land_chassis(sim, j)
    grant(sim, j, ma=True, civ1=True, civ2=True)
    clear_queue(sim, j)

    apply_code(sim, j, sim.FORM_BASE + ui)
    assert int(sim.city_current[B0, ROW, j, 0]) == sim.FORM_BASE + ui, "the corps order did not queue"
    assert float(sim.city_cost[B0, ROW, j, 0]) == expected_cost(sim, ui, 1), \
        f"corps cost {float(sim.city_cost[B0, ROW, j, 0])}, wanted {expected_cost(sim, ui, 1)}"

    # the queue is ONE deep, so the army is priced on its own turn rather
    # than stacked behind the corps
    clear_queue(sim, j)
    apply_code(sim, j, sim.FORM_BASE + sim.NU + ui)
    assert int(sim.city_current[B0, ROW, j, 0]) == sim.FORM_BASE + sim.NU + ui, "the army order did not queue"
    assert float(sim.city_cost[B0, ROW, j, 0]) == expected_cost(sim, ui, 2),         f"army cost {float(sim.city_cost[B0, ROW, j, 0])}, wanted {expected_cost(sim, ui, 2)}"

    print(f"  2 price OK — corps {expected_cost(sim, ui, 1):.0f}, army {expected_cost(sim, ui, 2):.0f}")


def test_the_order_charges_the_tier_s_resource(rules, path) -> None:
    """CIV6 (Formations): a DIRECT-trained Corps pays DOUBLE the chassis'
    strategic resource and an Army TRIPLE — charged at the QUEUE, like the
    plain unit's own, and asked for by the column before it is offered."""
    sim = build(rules, path)
    j = a_city(sim)
    grant(sim, j, ma=True, civ1=True, civ2=True)
    # a strategic-gated LAND chassis, with its tech, an owned improved source
    # and a bank — the fixture's opening fields none, so the scene grants them
    gated = [(u, sl, c) for u, sl, c in sim._res_slot_units
             if int(sim._type_combat[u]) > 0 and int(sim._type_air[u]) == 0
             and not bool(sim.unit_naval[u]) and u != sim._gdr_idx]
    assert gated, "the roster carries no strategic-gated land chassis"
    ui, slot, cost = gated[0]
    ti = int(sim._type_tech[ui])
    if ti >= 0:
        sim.civ_techs[B0, ROW, ti] = True
    res = next(r for u, r in sim._res_unit_pairs if u == ui)
    t = next(t for t in reversed(range(sim.T)) if int(sim.tile_seat[B0, t]) == ROW)
    sim.res_id[B0, t] = res
    sim.res_imp[B0, t] = 3
    sim.improvement[B0, t] = 3
    sim.pillaged[B0, t] = False
    sim.civ_stockpile[B0, ROW, slot] = cost * 10
    sim._eff_version += 1
    assert bool(sim._trainable_units(ROW)[B0, j, ui]), (
        "the granted chassis is still untrainable — the check below would be vacuous")
    assert sim._form_res_mult[1] == 2 and sim._form_res_mult[2] == 3, (
        f"the tier table must be 1/2/3, read {sim._form_res_mult}")

    for tier, code in ((1, sim.FORM_BASE + ui), (2, sim.FORM_BASE + sim.NU + ui)):
        clear_queue(sim, j)
        sim.civ_stockpile[B0, ROW, slot] = cost * 10
        sim._eff_version += 1
        before = float(sim.civ_stockpile[B0, ROW, slot])
        apply_code(sim, j, code)
        paid = before - float(sim.civ_stockpile[B0, ROW, slot])
        want = cost * sim._form_res_mult[tier]
        assert paid == want, f"tier {tier} paid {paid}, wanted {want}"

    # the COLUMN asks for what the applier will charge: a bank that covers the
    # chassis but not the tier must not offer the tier
    clear_queue(sim, j)
    sim.civ_stockpile[B0, ROW, slot] = cost
    sim._eff_version += 1
    mask = sim._seat_production_mask(ROW)
    assert not bool(mask[B0, j, sim.FORM_BASE + ui]), (
        "a corps was offered on a bank that covers only the single charge")
    assert not bool(mask[B0, j, sim.FORM_BASE + sim.NU + ui]), (
        "an army was offered on a bank that covers only the single charge")
    print(f"  2b tier charge OK — {cost} single, {cost * 2} corps, {cost * 3} army")


def test_the_apply_re_validates(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    ui = a_land_chassis(sim, j)

    # a chassis with no combat — the builder trains, the "builder corps" must not
    grant(sim, j, ma=True, civ1=True, civ2=True)
    civil = ((sim._type_combat == 0) & sim._trainable_units(ROW)[B0, j]).nonzero().flatten().tolist()
    if civil:
        clear_queue(sim, j)
        apply_code(sim, j, sim.FORM_BASE + civil[0])
        assert int(sim.city_current[B0, ROW, j, 0]) == -1, \
            "a combat-free chassis was accepted as a corps"

    # the city without its building
    grant(sim, j, civ1=True, civ2=True)
    clear_queue(sim, j)
    apply_code(sim, j, sim.FORM_BASE + ui)
    assert int(sim.city_current[B0, ROW, j, 0]) == -1, "the apply trusted a mask the building had left"

    # the tier without its civic
    grant(sim, j, ma=True, civ1=True, civ2=False)
    clear_queue(sim, j)
    apply_code(sim, j, sim.FORM_BASE + sim.NU + ui)
    assert int(sim.city_current[B0, ROW, j, 0]) == -1, "an army queued without MOBILIZATION"
    print("  3 apply OK — no combat, no building, no civic: three refusals")


def test_the_completion_spawns_the_tier(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    ui = a_land_chassis(sim, j)
    grant(sim, j, ma=True, civ1=True)
    clear_queue(sim, j)
    sim.city_current[B0, ROW, j, 0] = sim.FORM_BASE + ui
    sim.city_cost[B0, ROW, j, 0] = 1.0

    def tiered() -> int:
        mine = (sim.major_unit_alive[B0] & (sim.major_unit_seat[B0] == ROW)
                & (sim.major_unit_type[B0] == ui) & (sim.major_unit_formation[B0] == 1))
        return int(mine.sum())

    before = tiered()
    sim.step()
    assert tiered() == before + 1, \
        f"the corps completion did not arrive at tier 1 ({before} -> {tiered()})"
    print("  4 spawn OK — the corps arrives already formed")


def test_the_fold_touches_only_the_form_block(rules, path) -> None:
    sim = build(rules, path)
    width = sim.PROD_W
    codes = torch.arange(-1, width, dtype=torch.long)
    folded = sim._q_unit_of(codes)
    tiers = sim._q_form_tier(codes)
    for c, f, tr in zip(codes.tolist(), folded.tolist(), tiers.tolist()):
        if sim.FORM_BASE <= c < sim.FORM_BASE + 2 * sim.NU:
            k = c - sim.FORM_BASE
            assert f == sim.UNIT_BASE + k % sim.NU, f"code {c} folded to {f}"
            assert tr == 1 + k // sim.NU, f"code {c} answered tier {tr}"
        else:
            assert f == c, f"code {c} moved to {f} — the fold leaked past the block"
            assert tr == 0, f"code {c} answered tier {tr} outside the block"
    print("  5 fold OK — the block maps onto the unit space and nothing else moves")


def test_the_driver_swap_lands_only_on_offered_columns(rules, path) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
    from drive import _maybe_form_tier
    sim = build(rules, path)
    j = a_city(sim)
    ui = a_land_chassis(sim, j)
    grant(sim, j, ma=True, civ1=True)  # corps offered, army NOT (no MOBILIZATION)
    m = sim.production_mask().unsqueeze(0) if sim.production_mask().dim() == 2 \
        else sim.production_mask()
    corps = sim.FORM_BASE + ui
    prod0 = torch.full((sim.B, sim.RC), -1, dtype=torch.long)
    prod0[B0, j] = sim.UNIT_BASE + ui
    swaps = 0
    for turn in range(60):
        out = _maybe_form_tier(sim, ROW, m, prod0.clone(), [42], turn)
        got = int(out[B0, j])
        assert got in (sim.UNIT_BASE + ui, corps), \
            f"turn {turn}: the swap landed on {got} — the army column is not offered"
        swaps += int(got == corps)
    assert swaps > 0, "sixty turns of a legal corps column and the driver never took it"
    print(f"  6 driver OK — {swaps}/60 swaps, all onto the offered column")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_building_and_the_civic_gate_the_columns(rules, path)
    test_the_order_costs_the_formation_price(rules, path)
    test_the_order_charges_the_tier_s_resource(rules, path)
    test_the_apply_re_validates(rules, path)
    test_the_completion_spawns_the_tier(rules, path)
    test_the_fold_touches_only_the_form_block(rules, path)
    test_the_driver_swap_lands_only_on_offered_columns(rules, path)
    print("BATTERY OK formation_train")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
