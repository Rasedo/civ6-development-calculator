"""THE CITY BUILDS ONE THING.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/production_queue_test.py

OWNER RULING 2026-09-08: the queue collapsed to depth 1 — the "queue" is the
current build. The deeper slots were never a mechanic. Only the HEAD ever
accrued (every `progress +=` reads slot 0), so an entry behind it held an id
and a permanent zero; what makes hammers survive a switch is `city_prod_bank`
and the per-item ledger, both of which are independent of depth. What the
slots did cost was Q-1 promote columns per city, legal every turn, asking a
policy to reorder a list the observation never showed it.

`city_current`, `city_progress`, `city_cost` and `city_qtile` stay dense over
the queue so the storage keeps one shape; QD is simply 1.

Proven here:
  * the depth is ONE, and the production layout closes with the formation
    block — there is no promote block to address;
  * the head accrues, and a completion banks its overflow because nothing
    waits behind it;
  * a city already building is offered NO item column at all;
  * a building on order is not offered twice;
  * `_q_drop` empties the head;
  * a CANCELLED entry banks its hammers against the ITEM and `_q_push` of the
    same column resumes them — the ledger pays ONCE;
  * a cancelled DISTRICT vacates its plot and its registry entry.
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


def load_queue(sim, j: int, codes, costs=None, progs=None) -> None:
    """Put a queue in place directly — the pokes below are about the QUEUE, not
    about what a driver would choose to put in it."""
    for k in range(sim.QD):
        sim.city_current[B0, ROW, j, k] = codes[k] if k < len(codes) else -1
        sim.city_cost[B0, ROW, j, k] = (costs[k] if costs and k < len(costs) else 100)
        sim.city_progress[B0, ROW, j, k] = (progs[k] if progs and k < len(progs) else 0)


def unit(sim, k: int = 0) -> int:
    """A unit code. A BUILDING's price is re-read live every turn (TS locks no
    building price at all), so a poke that wants to fix a cost must not use
    one."""
    return sim.UNIT_BASE + k


def q(sim, j: int):
    return sim.city_current[B0, ROW, j].tolist()


def prg(sim, j: int):
    return [round(float(x), 3) for x in sim.city_progress[B0, ROW, j].tolist()]


# ---------------------------------------------------------------------------


def test_the_depth_is_shared(rules, path) -> None:
    sim = build(rules, path)
    assert sim.QD == 1, f"the queue is {sim.QD} deep, not the current build alone"
    assert sim.city_current.shape[-1] == sim.QD, "the code plane is not dense over the queue"
    for name in ("city_progress", "city_cost", "city_qtile"):
        assert getattr(sim, name).shape[-1] == sim.QD, f"{name} does not span the queue"
    assert sim.FORM_BASE == sim.PROJECT_BASE + len(sim._proj_rows),         "the formation block must open right after the projects"
    assert sim.PROD_W == sim.FORM_BASE + 2 * sim.NU,         "the formation block does not close the production layout"
    assert not hasattr(sim, "PROMOTE_BASE"), "a promote block survived the collapse"
    assert sim.production_mask().shape[2] == sim.PROD_W,         "the mask is wider than the layout — a dead block is still addressed"
    print(f"  1 depth OK — one slot on four planes, layout closes at {sim.PROD_W}")

def test_only_the_head_accrues(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    load_queue(sim, j, [unit(sim, 0)], costs=[10_000])
    before = prg(sim, j)
    for _ in range(3):
        sim.step()
    after = prg(sim, j)
    assert after[0] > before[0], "the head earned nothing in three turns"
    print(f"  2 head OK — the head took {after[0] - before[0]:.1f}")

def test_a_completion_carries_its_overflow(rules, path) -> None:
    """With nothing behind the head, every completion's overflow BANKS — the
    hidden buffer real Civ 6 keeps, and the reason depth was never what made
    hammers survive."""
    sim = build(rules, path)
    j = a_city(sim)
    load_queue(sim, j, [unit(sim, 0)], costs=[1])
    sim.step()
    assert int(q(sim, j)[0]) == -1, "the queue did not empty"
    assert float(sim.city_prod_bank[B0, ROW, j]) > 0,         "an emptied queue lost its overflow instead of banking it"
    print("  3 overflow OK — a completion banks what it did not need")

def test_a_busy_city_is_offered_nothing(rules, path) -> None:
    """One deep: a city already building has no column at all, because there
    is no second slot to stack an order into."""
    sim = build(rules, path)
    j = a_city(sim)
    load_queue(sim, j, [unit(sim, 0)], costs=[10_000])
    sim._eff_version += 1
    m = sim.production_mask()[B0, j]
    assert m.shape[0] == sim.PROD_W, "the mask is wider than the layout"
    assert not bool(m.any()), "a busy city was still offered something"
    # ...and an IDLE city is offered plenty
    sim._q_drop(torch.tensor([B0]), ROW, j,
                torch.ones(1, sim.QD, dtype=torch.bool))
    sim._eff_version += 1
    assert bool(sim.production_mask()[B0, j].any()), "an idle city was offered nothing"
    print("  5 busy OK — building something means no column; idle means a choice")

def test_a_queued_building_is_not_offered_twice(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    load_queue(sim, j, [], costs=[10_000] * sim.QD)
    # CIV6 (Trajan's Column): Rome's capital starts with its Monument — hand
    # it back, so the city has something to build
    sim.city_bldg[B0, ROW, j, :] = False
    sim._bldg_version += 1
    sim._eff_version += 1
    open_b = sim._seat_buildable(ROW)[B0, j].nonzero().flatten().tolist()
    assert open_b, "this city may build nothing at all — the poke proves nothing"
    b = open_b[0]
    load_queue(sim, j, [b], costs=[10_000])
    sim._eff_version += 1
    assert not bool(sim._seat_buildable(ROW)[B0, j, b]), \
        f"building {b} was offered while it stood at the head"
    load_queue(sim, j, [open_b[-1], b] if len(open_b) > 1 else [b, b], costs=[10_000, 10_000])
    sim._eff_version += 1
    assert not bool(sim._seat_buildable(ROW)[B0, j, b]), \
        f"building {b} was offered while it WAITED at slot 1 — a head test cannot see it"
    print("  6 duplicates OK — a building on order anywhere is not offered again")


def test_a_drop_empties_the_head(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    load_queue(sim, j, [unit(sim, 0)], costs=[10], progs=[1])
    rows = torch.tensor([B0])
    gone = torch.zeros(1, sim.QD, dtype=torch.bool)
    gone[0, 0] = True
    sim._q_drop(rows, ROW, j, gone)
    assert q(sim, j)[0] == -1, f"the head survived the drop: {q(sim, j)}"
    assert prg(sim, j)[0] == 0, f"the emptied slot kept hammers: {prg(sim, j)}"
    print("  7 drop OK — the head goes and the slot comes back empty")


def test_a_cancel_banks_against_the_item(rules, path) -> None:
    """The per-ITEM ledger is what makes hammers survive a switch, and it is
    independent of depth — which is why collapsing the queue costs nothing
    here. Cancel the build, take something else, come back: the hammers are
    waiting, and they are paid ONCE."""
    sim = build(rules, path)
    j = a_city(sim)
    load_queue(sim, j, [unit(sim, 0)], costs=[100], progs=[7])
    sim._cancel_queue_item(B0, ROW, j, 0)
    assert q(sim, j)[0] == -1, "the cancelled head did not leave the queue"
    assert float(sim.city_prod_bank[B0, ROW, j]) == 0,         "a CANCEL banked into the city buffer — that is INVALIDATION's path"
    ks = sim.city_item_bank[B0, ROW, j].tolist()
    assert unit(sim, 0) in ks, "the ledger holds no entry for the cancelled item"
    li = ks.index(unit(sim, 0))
    assert float(sim.city_item_amt[B0, ROW, j, li]) == 7
    hit = torch.ones(1, dtype=torch.bool)
    sim._q_push(ROW, j, hit, torch.tensor([unit(sim, 0)]), torch.tensor([100.0]))
    assert prg(sim, j)[0] == 7, "queueing the item again did not resume its hammers"
    assert int(sim.city_item_bank[B0, ROW, j, li]) == -1,         "the ledger entry survived the resume"
    # ...and a second take of the same item is paid nothing
    sim._q_drop(torch.tensor([B0]), ROW, j, torch.ones(1, sim.QD, dtype=torch.bool))
    sim._q_push(ROW, j, hit, torch.tensor([unit(sim, 0)]), torch.tensor([100.0]))
    assert prg(sim, j)[0] == 0, "the ledger paid TWICE"
    print("  9 cancel OK — banked 7 against the item, resumed once, paid once")

def test_a_cancelled_district_vacates_its_plot(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    t2 = int((sim.district[B0] < 0).nonzero().flatten()[0])
    di = 0
    code = sim.DISTRICT_BASE + di
    load_queue(sim, j, [code], costs=[100], progs=[11])
    sim.city_qtile[B0, ROW, j, 0] = t2
    sim.district[B0, t2] = di
    sim.district_complete[B0, t2] = False
    sim.city_dist_tile[B0, ROW, j, di] = t2
    sim._cancel_queue_item(B0, ROW, j, 0)
    assert int(sim.district[B0, t2]) == -1, "the plot still carries the district"
    assert int(sim.city_dist_tile[B0, ROW, j, di]) == -1, \
        "the registry still names the plot"
    ks = sim.city_item_bank[B0, ROW, j].tolist()
    assert code in ks and float(sim.city_item_amt[B0, ROW, j, ks.index(code)]) == 11, \
        "the district's hammers did not bank against the item"
    print("  10 district OK — plot and registry vacated, 11 hammers held")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_depth_is_shared(rules, path)
    test_only_the_head_accrues(rules, path)
    test_a_completion_carries_its_overflow(rules, path)
    test_a_busy_city_is_offered_nothing(rules, path)
    test_a_queued_building_is_not_offered_twice(rules, path)
    test_a_drop_empties_the_head(rules, path)
    test_a_cancel_banks_against_the_item(rules, path)
    test_a_cancelled_district_vacates_its_plot(rules, path)
    print("BATTERY OK production_queue")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
