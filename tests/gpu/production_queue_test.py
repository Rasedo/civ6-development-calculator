"""THE CITY HOLDS A QUEUE, NOT ONE ITEM.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/production_queue_test.py

CIV6: a city lines several items up. The head is merely the one being worked;
the rest wait, each keeping the production already spent on it, and a
completion shifts the queue and carries its overflow onto the item behind.

TS was written for that queue all along — `wipeConstruction` walks every slot,
`dropQueuedBuilding` splices, `availableBuildings` excludes what is already on
order — and only one line held it to a single item. The GPU stored one code per
city, so the depth is new storage there: `city_current`, `city_progress`,
`city_cost` and `city_qtile` are dense over the queue, slot 0 the head, and
`_q_push` / `_q_pop` / `_q_drop` / `_q_promote` are the only ways in or out.

Proven here:
  * a city takes a second item while the first is still being worked, and only
    the HEAD accrues;
  * a completion SHIFTS and its overflow lands on the next item — banking only
    when the queue ran empty;
  * PROMOTE brings a waiting entry to the head and every entry keeps its own
    hammers, so a reorder spends nothing;
  * a FULL queue is offered no item column and every promote column it can use;
  * a building already on order is not offered twice — the rule a one-deep
    queue never had to state;
  * `_q_drop` removes entries from the middle and closes the gap in order;
  * one promote column stands for each waiting entry and no more;
  * a CANCELLED entry banks its hammers against the ITEM (`_cancel_queue_item`)
    and `_q_push` of the same column resumes them — the ledger pays ONCE;
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
    assert sim.QD >= 2, f"a queue of {sim.QD} is not a queue"
    assert sim.city_current.shape[-1] == sim.QD, "the code plane is not dense over the queue"
    for name in ("city_progress", "city_cost", "city_qtile"):
        assert getattr(sim, name).shape[-1] == sim.QD, f"{name} does not span the queue"
    assert sim.FORM_BASE == sim.PROJECT_BASE + len(sim._proj_rows),         "the formation block must open right after the projects"
    assert sim.PROMOTE_BASE == sim.FORM_BASE + 2 * sim.NU, \
        "the promote block does not sit at the end of the production layout"
    assert sim.production_mask().shape[2] == sim.PROMOTE_BASE + sim.QD - 1, \
        "the mask width does not carry one column per promotable entry"
    print(f"  1 depth OK — {sim.QD} slots on four planes, promote at {sim.PROMOTE_BASE}")


def test_only_the_head_accrues(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    load_queue(sim, j, [unit(sim, 0), unit(sim, 1)], costs=[10_000, 10_000])
    before = prg(sim, j)
    for _ in range(3):
        sim.step()
    after = prg(sim, j)
    assert after[0] > before[0], "the head earned nothing in three turns"
    assert after[1] == before[1] == 0, \
        f"the item WAITING behind the head accrued {after[1]}"
    print(f"  2 head OK — the head took {after[0] - before[0]:.1f} and the next took nothing")


def test_a_completion_carries_its_overflow(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    # the head is one hammer from done and the next item already holds some
    load_queue(sim, j, [unit(sim, 0), unit(sim, 1)], costs=[1, 10_000], progs=[0, 7])
    sim.step()
    assert int(q(sim, j)[0]) == unit(sim, 1), f"the head did not shift: queue {q(sim, j)}"
    assert float(prg(sim, j)[0]) > 7, \
        f"the overflow did not land on the next item: it holds {prg(sim, j)[0]}, it had 7"
    assert float(sim.city_prod_bank[B0, ROW, j]) == 0, \
        "the overflow banked even though an item was waiting for it"
    # ...and with NOTHING behind it, the same overflow banks
    sim2 = build(rules, path)
    j2 = a_city(sim2)
    load_queue(sim2, j2, [unit(sim2, 0)], costs=[1])
    sim2.step()
    assert int(q(sim2, j2)[0]) == -1, "the queue did not empty"
    assert float(sim2.city_prod_bank[B0, ROW, j2]) > 0, \
        "an emptied queue lost its overflow instead of banking it"
    print("  3 overflow OK — it carries onto the next item, and banks only with none")


def test_promote_moves_an_entry_and_spends_nothing(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    load_queue(sim, j, [unit(sim, 0), unit(sim, 1), unit(sim, 2)],
               costs=[10, 20, 30], progs=[1, 2, 3])
    hit = torch.zeros(sim.B, dtype=torch.bool)
    hit[B0] = True
    sim._q_promote(ROW, j, hit, 2)
    want = [unit(sim, 2), unit(sim, 0), unit(sim, 1)]
    assert q(sim, j)[:3] == want, f"the reorder went wrong: {q(sim, j)}"
    assert prg(sim, j)[:3] == [3, 1, 2], f"an entry lost its hammers: {prg(sim, j)}"
    assert [round(float(x)) for x in sim.city_cost[B0, ROW, j].tolist()][:3] == [30, 10, 20], \
        "the costs did not travel with their entries"
    # promoting an EMPTY slot is a no-op, not a hole punched in the queue
    sim._q_promote(ROW, j, hit, sim.QD - 1)
    assert q(sim, j)[:3] == want, f"promoting an empty slot disturbed the queue: {q(sim, j)}"
    print("  4 promote OK — the entry moves whole and the rest close up behind it")


def test_a_full_queue_is_offered_only_the_reorder(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    load_queue(sim, j, [unit(sim, 0)] * sim.QD, costs=[10_000] * sim.QD)
    sim._eff_version += 1
    m = sim.production_mask()[B0, j]
    assert not bool(m[: sim.PROMOTE_BASE].any()), \
        "a full queue was still offered something to add to it"
    assert bool(m[sim.PROMOTE_BASE:].all()), \
        "a full queue was refused the reorder, which is all it can still do"
    # ...and one item short of full, both are offered
    load_queue(sim, j, [unit(sim, 0)] * (sim.QD - 1), costs=[10_000] * sim.QD)
    sim._eff_version += 1
    m2 = sim.production_mask()[B0, j]
    assert bool(m2[: sim.PROMOTE_BASE].any()), "a queue with room was offered nothing to add"
    print("  5 full OK — a full queue keeps the reorder and loses the rest")


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


def test_a_drop_closes_the_gap(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    load_queue(sim, j, [unit(sim, 0), unit(sim, 1), unit(sim, 2), unit(sim, 3)],
               costs=[10, 20, 30, 40], progs=[1, 2, 3, 4])
    rows = torch.tensor([B0])
    gone = torch.zeros(1, sim.QD, dtype=torch.bool)
    gone[0, 1] = True          # take the MIDDLE one
    sim._q_drop(rows, ROW, j, gone)
    assert q(sim, j)[:4] == [unit(sim, 0), unit(sim, 2), unit(sim, 3), -1],         f"the gap did not close in order: {q(sim, j)}"
    assert prg(sim, j)[:4] == [1, 3, 4, 0], f"the survivors lost their hammers: {prg(sim, j)}"
    print("  7 drop OK — the middle goes and the survivors keep their order and their work")


def test_a_promote_column_stands_for_exactly_its_entry(rules, path) -> None:
    """The reorder's own contract: column k is legal exactly when entry k+1
    stands. (What a DRIVEN game actually reaches is a serve-gate measurement,
    not a poke's — a rollout here would be a rollout wearing another name.)"""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
    import ladder                                           # noqa: PLC0415
    assert ladder.REORDER_SHARE > 0, "the driver would never pick a promote column"
    sim = build(rules, path)
    j = a_city(sim)
    for depth in range(1, sim.QD + 1):
        load_queue(sim, j, [unit(sim, 0)] * depth, costs=[10_000] * sim.QD)
        sim._eff_version += 1
        got = sim.production_mask()[B0, j, sim.PROMOTE_BASE:].tolist()
        want = [k + 1 < depth for k in range(sim.QD - 1)]
        assert got == want, f"depth {depth}: promote columns {got}, expected {want}"
    print(f"  8 columns OK — one legal promote per waiting entry, over depths 1..{sim.QD}")


def test_a_cancel_banks_against_the_item(rules, path) -> None:
    sim = build(rules, path)
    j = a_city(sim)
    load_queue(sim, j, [unit(sim, 0), unit(sim, 1)], costs=[100, 100], progs=[7, 3])
    sim._cancel_queue_item(B0, ROW, j, 0)
    assert q(sim, j)[:2] == [unit(sim, 1), -1], "the queue did not close the gap"
    assert prg(sim, j)[0] == 3, "the survivor lost its own hammers"
    assert float(sim.city_prod_bank[B0, ROW, j]) == 0, \
        "a CANCEL banked into the city buffer — that is INVALIDATION's path"
    ks = sim.city_item_bank[B0, ROW, j].tolist()
    assert unit(sim, 0) in ks, "the ledger holds no entry for the cancelled item"
    li = ks.index(unit(sim, 0))
    assert float(sim.city_item_amt[B0, ROW, j, li]) == 7
    hit = torch.ones(1, dtype=torch.bool)
    sim._q_push(ROW, j, hit, torch.tensor([unit(sim, 0)]), torch.tensor([100.0]))
    assert prg(sim, j)[1] == 7, "queueing the item again did not resume its hammers"
    assert int(sim.city_item_bank[B0, ROW, j, li]) == -1, \
        "the ledger entry survived the resume"
    sim._q_push(ROW, j, hit, torch.tensor([unit(sim, 0)]), torch.tensor([100.0]))
    assert prg(sim, j)[2] == 0, "the ledger paid TWICE"
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
    test_promote_moves_an_entry_and_spends_nothing(rules, path)
    test_a_full_queue_is_offered_only_the_reorder(rules, path)
    test_a_queued_building_is_not_offered_twice(rules, path)
    test_a_drop_closes_the_gap(rules, path)
    test_a_promote_column_stands_for_exactly_its_entry(rules, path)
    test_a_cancel_banks_against_the_item(rules, path)
    test_a_cancelled_district_vacates_its_plot(rules, path)
    print("BATTERY OK production_queue")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
