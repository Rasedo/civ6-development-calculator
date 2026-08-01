"""V-P1/2 gold-purchase self-test.

    npm run gpu:export        # (once) writes gpu/fixtures/
    python gpu/purchase_test.py

Purchases ship ACTIVE since V-P2 (_rl_purchase_active = True → 46-column
production head, covered by the off-script gate). The gated-OFF path must
stay available for benchmarking 26-column checkpoints (tune1 and older):
test 1 flips the flag off and proves the mask narrows back to
NB+2+NU+nScaffold and a purchase-range code is a bit-exact no-op. Tests 2-5
check the TS-mirroring semantics: buy = production cost × goldPurchaseMult,
buildings need _buildable, units need tech + a free spawn tile, settler
prices ride the live `cities-1 + settlers + queued` counter and are
order-coupled across slots in the same turn (slot walk, like the replay).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import _MUTABLE

RICH = 10_000.0


def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def pbase(sim) -> int:
    return sim.UNIT_BASE + sim.NU + len(sim._scaffold)


def idle_capital(sim, turns=30):
    """Advance scripted, then force the capital idle so a decision pends."""
    for _ in range(turns):
        sim.step()
    sim.current[:, 0] = -1
    sim.progress[:, 0] = 0.0


def prod(sim, city, code) -> torch.Tensor:
    p = torch.full((1, sim.C), sim.IDLE, dtype=torch.long)
    p[0, city] = code
    return p


def test_inert_when_off(rules, path):
    sim = build(rules, path)
    idle_capital(sim)
    assert sim._rl_purchase_active, "flag ships ON since V-P2"
    sim._rl_purchase_active = False  # the benchmark-old-checkpoints path
    w = sim.production_mask().shape[2]
    assert w == pbase(sim), f"gated-off mask width {w} != {pbase(sim)}"
    # a purchase-range code behaves exactly like IDLE (invalid = no-op)
    snap = sim.snapshot()
    sim.step(production=prod(sim, 0, pbase(sim) + 1))
    after_code = {k: getattr(sim, k).clone() for k in _MUTABLE}
    sim.restore(snap)
    sim.step(production=prod(sim, 0, sim.IDLE))
    drift = [k for k in _MUTABLE if not torch.equal(getattr(sim, k), after_code[k])]
    assert not drift, f"purchase code perturbed gated-off state: {drift}"
    print("  inert-when-off OK (width", w, "+ bit-exact no-op)")


def test_width_and_mask_when_on(rules, path):
    sim = build(rules, path)
    idle_capital(sim)
    sim._rl_purchase_active = True
    w = sim.production_mask().shape[2]
    want = pbase(sim) + sim.NB + 1 + sim.NU
    assert w == want, f"active mask width {w} != {want}"
    # broke: no gold → every purchase column masked off
    sim.treasury[:] = 0.0
    m = sim.production_mask()[0, 0, pbase(sim):]
    assert not bool(m.any()), "purchase columns must be False at 0 gold"
    print("  active width OK (", w, ") + all-False when broke")


def scan_to_purchasable(sim) -> list[int]:
    """#46r: the live-adoption trajectory (URBAN_PLANNING +1 prod from ~t10)
    emptied the old fixed t30 probe — scan deterministically for a turn with
    a purchasable building (idling the capital each step keeps it from
    building the candidates itself). The purchase sim and its baseline twin
    both run THIS exact scan, so they land in the identical pre-step state."""
    pb = pbase(sim)
    for _ in range(80):
        sim.step()
        sim.current[:, 0] = -1
        sim.progress[:, 0] = 0.0
        sim.treasury[:] = RICH
        mask = sim.production_mask()[0, 0]
        js = [j for j in range(sim.NB) if bool(mask[pb + j])]
        if js:
            return js
    return []


def test_building_purchase(rules, path):
    sim = build(rules, path)
    sim._rl_purchase_active = True
    pb = pbase(sim)
    js = scan_to_purchasable(sim)
    assert js, "no purchasable building within 80 turns (fixture drift?)"
    j = js[0]
    cost = float(sim.rules_dev.b_cost[j]) * sim.rules.gold_purchase_mult
    assert not bool(sim.buildings[0, 0, j])
    sim.step(production=prod(sim, 0, pb + j))
    assert bool(sim.buildings[0, 0, j]), "purchased building not granted"
    assert int(sim.current[0, 0]) == -1, "purchase must leave the build slot idle"
    spent = RICH - float(sim.treasury[0])
    # the turn also accrues city gold / maintenance; the purchase must account
    # for exactly `cost` more than an identical turn without it — plus the
    # bought building's own upkeep, which it pays this same turn (it exists
    # before the maintenance charge, exactly like a TS purchase before endTurn)
    sim2 = build(rules, path)
    sim2._rl_purchase_active = True
    scan_to_purchasable(sim2)  # identical deterministic scan -> same pre-step state
    sim2.step(production=prod(sim2, 0, sim2.IDLE))
    base_spent = RICH - float(sim2.treasury[0])
    upkeep = float(sim.rules_dev.b_maintenance[j])
    assert abs((spent - base_spent) - (cost + upkeep)) < 1e-6, (
        f"gold delta {spent - base_spent} != {cost} + {upkeep} upkeep"
    )
    print(f"  building purchase OK (col {j}, {cost:.0f} gold + same-turn upkeep, slot stays idle)")


def test_unit_purchase(rules, path):
    sim = build(rules, path)
    idle_capital(sim)
    sim._rl_purchase_active = True
    sim.treasury[:] = RICH
    pb = pbase(sim)
    # warrior: no tech gate
    widx = next(i for i, u in enumerate(sim.rules.units) if u["id"] == "WARRIOR")
    before = int(sim.p_alive[0].sum())
    sim.step(production=prod(sim, 0, pb + sim.NB + 1 + widx))
    assert int(sim.p_alive[0].sum()) == before + 1, "purchased unit did not spawn"
    # tech-gated unit not yet researched must be masked off
    hidx = next((i for i, u in enumerate(sim.rules.units) if u["id"] == "HORSEMAN"), None)
    if hidx is not None:
        t = int(sim._p_tech[hidx])
        if t >= 0 and not bool(sim.techs[0, t]):
            sim.current[:, 0] = -1
            m = sim.production_mask()[0, 0]
            assert not bool(m[pb + sim.NB + 1 + hidx]), "tech-gated unit purchasable without its tech"
    print("  unit purchase OK (warrior spawned; tech gate holds)")


def test_settler_sequencing(rules, path):
    """Two same-turn settler purchases must price sequentially (+30 apart)."""
    sim = build(rules, path)
    # advance until a second city exists so two slots can decide together
    for _ in range(120):
        sim.step()
        if bool(sim.alive[0, 1]):
            break
    assert bool(sim.alive[0, 1]), "no second city within 120 scripted turns"
    sim._rl_purchase_active = True
    sim.current[:, :2] = -1
    sim.progress[:, :2] = 0.0
    sim.treasury[:] = RICH
    n = int(sim.alive[0].sum())
    s0 = int(sim.settlers[0])
    q = int((sim.current[0] == sim.SETTLER).sum())
    r = sim.rules
    c1 = (r.settler_base + r.settler_per_city * max(0, n - 1 + s0 + q)) * r.gold_purchase_mult
    c2 = (r.settler_base + r.settler_per_city * max(0, n - 1 + s0 + 1 + q)) * r.gold_purchase_mult
    p = torch.full((1, sim.C), sim.IDLE, dtype=torch.long)
    p[0, 0] = pbase(sim) + sim.NB
    p[0, 1] = pbase(sim) + sim.NB
    founded_before = int(sim.alive[0].sum())
    settlers_before = s0
    sim.step(production=p)
    # baseline turn without purchases, from the same start, to isolate the cost
    sim2 = build(rules, path)
    for _ in range(120):
        sim2.step()
        if bool(sim2.alive[0, 1]):
            break
    sim2._rl_purchase_active = True
    sim2.current[:, :2] = -1
    sim2.progress[:, :2] = 0.0
    sim2.treasury[:] = RICH
    sim2.step(production=torch.full((1, sim2.C), sim2.IDLE, dtype=torch.long))
    delta = float(sim2.treasury[0]) - float(sim.treasury[0])
    # #55 S4: the bought settlers FOUND during the divergent step (the walker
    # moves after production), and the new borders can re-carve an existing
    # city's worked set — a ±few-gold income side-channel between the two runs
    # (seen: −1 worked gold tile under a ×1.05 policy mult). The signal this
    # poke guards is the SEQUENCING gap (non-sequenced would read c1+c1, 72
    # gold off), so a 5-gold bound keeps full discriminating power.
    assert abs(delta - (c1 + c2)) < 5.0, f"sequenced settler prices {delta} != {c1}+{c2}"
    gained = (int(sim.settlers[0]) - settlers_before) + (int(sim.alive[0].sum()) - founded_before)
    assert gained == 2, f"two bought settlers → settlers+founds == 2, got {gained}"
    print(f"  settler sequencing OK ({c1:.0f} then {c2:.0f} gold in one turn)")


def test_builder_escalation(rules, path):
    """P4/D-10: two same-turn builder purchases price sequentially off the
    live escalator (+4 pre-speed apart) and advance builders_trained."""
    sim = build(rules, path)
    for _ in range(120):
        sim.step()
        if bool(sim.alive[0, 1]):
            break
    assert bool(sim.alive[0, 1]), "no second city within 120 scripted turns"
    if sim._builder_idx < 0:
        print("  builder escalation SKIPPED (no builder in roster)")
        return
    sim._rl_purchase_active = True
    sim.current[:, :2] = -1
    sim.progress[:, :2] = 0.0
    sim.treasury[:] = RICH
    r = sim.rules
    bt0 = int(sim.builders_trained[0])
    bq = int((sim.current[0] == sim.UNIT_BASE + sim._builder_idx).sum())
    cost = lambda n: round((r.builder_base + r.builder_per * n) * r.game_speed) * r.gold_purchase_mult
    c1 = cost(bt0 + bq)
    c2 = cost(bt0 + bq + 1)
    p = torch.full((1, sim.C), sim.IDLE, dtype=torch.long)
    p[0, 0] = pbase(sim) + sim.NB + 1 + sim._builder_idx
    p[0, 1] = pbase(sim) + sim.NB + 1 + sim._builder_idx
    sim.step(production=p)
    assert int(sim.builders_trained[0]) == bt0 + 2, "builders_trained did not advance by 2"
    # baseline turn without purchases, from the same start, to isolate the cost
    sim2 = build(rules, path)
    for _ in range(120):
        sim2.step()
        if bool(sim2.alive[0, 1]):
            break
    sim2._rl_purchase_active = True
    sim2.current[:, :2] = -1
    sim2.progress[:, :2] = 0.0
    sim2.treasury[:] = RICH
    sim2.step(production=torch.full((1, sim2.C), sim2.IDLE, dtype=torch.long))
    delta = float(sim2.treasury[0]) - float(sim.treasury[0])
    assert abs(delta - (c1 + c2)) < 1e-6, f"sequenced builder prices {delta} != {c1}+{c2}"
    print(f"  builder escalation OK ({c1:.0f} then {c2:.0f} gold in one turn)")


def test_worship_faith_purchase(rules, path):
    """#51/S7.11: a WORSHIP building is faith-purchase ONLY, for the PLAYER too.

    `game.ts:queueBuilding` refuses worship outright ("purchased with faith, not
    built") while `purchaseBuilding` prices it in faith. The GPU used ONE
    `_buildable` mask for both with worship filtered out, so the player could
    never faith-buy while the rival has had the path since B9-R3.

    THIS POKE IS THE ONLY COVERAGE: measured ZERO player worship purchases in
    the 36-game rollout, so neither gate reaches the verb ([[gate-reachability]]).
    """
    sim = build(rules, path)
    if not sim._worship_bidx or sim._temple_bidx < 0 or sim._hs_idx < 0:
        print("  worship faith-purchase SKIPPED (no worship catalog)")
        return
    wj = int(sim._worship_bidx[0])
    sim._rl_purchase_active = True
    pb = pbase(sim)
    # the PRODUCTION mask must still refuse it (queueBuilding's rule)
    assert not bool(sim._buildable()[0, 0, wj]), "worship must never be queueable"
    # buildingCompletable: a worship building needs a COMPLETED HOLY_SITE in the
    # city AND the Temple prerequisite. Plant both, plus the faith to pay with.
    def _endow(s):
        owned = ((s.owner[0] == 0) & (s.district[0] < 0) & (s.center_at[0] < 0)
                 & (s.built_wonder[0] < 0)).nonzero(as_tuple=True)[0]
        assert len(owned), "capital owns no free tile for a HOLY_SITE"
        t = int(owned[0])
        s.district[0, t] = s._hs_idx
        s.district_complete[0, t] = True
        s.buildings[0, 0, s._temple_bidx] = True
        s.player_faith.fill_(10_000.0)
        s._eff_version += 1
        return t
    _endow(sim)
    assert bool(sim._buildable(include_worship=True)[0, 0, wj]), (
        "worship must be PURCHASE-eligible once its Temple stands"
    )
    f0, g0 = float(sim.player_faith[0]), float(sim.treasury[0])
    sim.step(production=prod(sim, 0, pb + wj))
    assert bool(sim.buildings[0, 0, wj]), "worship purchase not granted"
    buy_f, buy_g = f0 - float(sim.player_faith[0]), g0 - float(sim.treasury[0])

    # CONTROL: the identical turn without the purchase. The city EARNS faith
    # during the step (that is #51/S7.11a) and the bought building pays its own
    # faith yield the same turn, so a raw before/after delta nets BOTH against
    # the price. The control therefore holds the building too, granted free —
    # then the only difference between the two deltas is the price itself.
    sim2 = build(rules, path)
    sim2._rl_purchase_active = True
    _endow(sim2)
    sim2.buildings[0, 0, wj] = True   # granted FREE: same yields, same upkeep
    sim2._eff_version += 1
    f0b, g0b = float(sim2.player_faith[0]), float(sim2.treasury[0])
    sim2.step(production=prod(sim2, 0, sim2.IDLE))
    base_f, base_g = f0b - float(sim2.player_faith[0]), g0b - float(sim2.treasury[0])

    assert abs((buy_f - base_f) - sim._worship_cost) < 1e-6, (
        f"worship must cost exactly {sim._worship_cost} faith, "
        f"charged {buy_f - base_f}"
    )
    assert abs(buy_g - base_g) < 1e-6, (
        f"a worship purchase must not touch the treasury; gold delta "
        f"{buy_g - base_g} vs control {base_g}"
    )
    print(f"  worship faith-purchase OK (col {wj}, -{sim._worship_cost:.0f} faith, gold untouched)")

def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    path = paths[0]
    print(f"purchase_test on {path.name}")
    test_inert_when_off(rules, path)
    test_width_and_mask_when_on(rules, path)
    test_building_purchase(rules, path)
    test_worship_faith_purchase(rules, path)
    test_unit_purchase(rules, path)
    test_builder_escalation(rules, path)
    test_settler_sequencing(rules, path)
    print("PURCHASE PLUMBING OK")


if __name__ == "__main__":
    main()
