"""THE STOCKPILE MAXIMUM IS A HARD ONE, ON EVERY WAY IN.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/stockpile_ceiling_test.py

CIV6 (GS): "The maximum stockpile amount is initially 50 for each resource but
constructing Encampment buildings in your empire (Barracks, Armory, etc.) will
increase your maximum stockpile by 10 per building for all resources." That is
a ceiling on the BANK, so every path that puts a resource into it stops there —
the turn's income, a deal's lump, a Great Person's grant, and the lump a
30-turn term hands back when it runs out.

The return path is the one with no natural clamp of its own: `_deal_move_res`
sizes the outgoing lump by the taker's ROOM, so its grant can never overflow,
while `_deal_end_term` knows only what the taker holds. TS returns it through
`grantStockpile`, which takes the ceiling; the GPU added it raw and banked a
seat over the cap, where it sat invisible until an ordinary spend drew the bank
back under and the two engines disagreed by the overflow.

Proven here:
  * a lump returned to a seat at the cap is LOST, not banked over it;
  * the taker's side is unchanged by the ceiling — it gives back what it holds;
  * a seat with ROOM gets the whole lump, so the clamp is not a blanket refusal;
  * a taker holding LESS than the lump returns only what it has;
  * an Encampment building raises the ceiling the return respects;
  * and the invariant behind all of it: no seat's bank ever stands above its
    own ceiling. TS funnels every way in through `grantStockpile` and cannot
    drift; the GPU writes each path by hand, so the ceiling is asserted over
    the whole plane rather than one path at a time.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
GIVER, TAKER = 0, 1


def build(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def term(sim, slot: int, lump: int) -> torch.Tensor:
    """One expiring RESOURCE item, as `_deal_end_term` reads it."""
    items = torch.full((sim.B, sim._deal_items, 3), -1, dtype=torch.long)
    items[:, 0, 0] = sim._deal_k_res
    items[:, 0, 1] = slot
    items[:, 0, 2] = lump
    return items


def run_return(sim, slot: int, lump: int, mine: int, held: int) -> tuple[int, int]:
    """Seat GIVER holds `mine`, seat TAKER holds `held`; the term ends. Returns
    both banks after."""
    sim.civ_stockpile[B0, GIVER, slot] = mine
    sim.civ_stockpile[B0, TAKER, slot] = held
    done = torch.zeros(sim.B, dtype=torch.bool)
    done[B0] = True
    sim._deal_end_term(GIVER, TAKER, term(sim, slot, lump), done)
    return (int(sim.civ_stockpile[B0, GIVER, slot]),
            int(sim.civ_stockpile[B0, TAKER, slot]))


# ---------------------------------------------------------------------------


def test_the_ceiling_swallows_the_overflow(rules, path) -> None:
    sim = build(rules, path)
    cap = int(sim._stockpile_cap(GIVER)[B0])
    mine, taken = run_return(sim, 0, 10, cap, 10)
    assert mine == cap, f"a seat at the cap banked a returned lump over it: {mine} > {cap}"
    assert taken == 0, f"the taker kept {taken} of the lump it owed back"
    print(f"  1 ceiling OK — {cap} + 10 back is still {cap}, and the taker still paid it")


def test_room_takes_the_whole_lump(rules, path) -> None:
    sim = build(rules, path)
    cap = int(sim._stockpile_cap(GIVER)[B0])
    assert cap >= 20, "this fixture's cap is too low to leave room for the test"
    mine, taken = run_return(sim, 0, 10, cap - 10, 10)
    assert mine == cap, f"a seat with exact room got {mine}, not {cap}"
    assert taken == 0, "the taker kept part of the lump"
    mine, _ = run_return(sim, 0, 10, 0, 10)
    assert mine == 10, f"an empty seat got {mine} of a 10 lump"
    print("  2 room OK — the clamp is a ceiling, not a refusal")


def test_the_taker_returns_only_what_it_holds(rules, path) -> None:
    sim = build(rules, path)
    mine, taken = run_return(sim, 0, 10, 0, 4)
    assert (mine, taken) == (4, 0), \
        f"a taker holding 4 of a 10 lump returned ({mine}, {taken}), not (4, 0)"
    print("  3 shortfall OK — a spent lump comes home only as far as it survived")


def test_an_encampment_building_raises_the_ceiling(rules, path) -> None:
    sim = build(rules, path)
    base = int(sim._stockpile_cap(GIVER)[B0])
    assert sim._encampment_didx >= 0, "no Encampment district in the catalog"
    enc = (sim._b_req_district == sim._encampment_didx).nonzero().flatten().tolist()
    assert enc, "no Encampment building in the catalog"
    slot_c = int(sim.city_alive[B0, GIVER].long().argmax())
    assert bool(sim.city_alive[B0, GIVER, slot_c]), "the giver holds no city"
    sim.city_bldg[B0, GIVER, slot_c, enc[0]] = True
    sim._eff_version += 1
    raised = int(sim._stockpile_cap(GIVER)[B0])
    assert raised > base, f"an Encampment building left the ceiling at {base}"
    mine, _ = run_return(sim, 0, 10, base, 10)
    assert mine == min(base + 10, raised), \
        f"the return stopped at {mine}, not the raised ceiling {raised}"
    print(f"  4 encampment OK — the ceiling moved {base} -> {raised} and the return followed")


def test_no_bank_ever_stands_above_its_ceiling(rules, path) -> None:
    """The class guard: whatever the turn did — accrue, trade, grant, return —
    every seat's every slot is at or under that seat's own cap."""
    sim = build(rules, path)
    for _ in range(40):
        sim.step()
        for row in range(sim.n_majors):
            cap = sim._stockpile_cap(row)
            over = sim.civ_stockpile[:, row] > cap.unsqueeze(1)
            assert not bool(over.any()), (
                f"turn {int(sim.turn)}: seat {row} banked "
                f"{sim.civ_stockpile[:, row][over].tolist()} over a cap of {cap.tolist()}")
    print(f"  5 invariant OK — {sim.n_majors} seats under their ceiling for {int(sim.turn)} turns")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_ceiling_swallows_the_overflow(rules, path)
    test_room_takes_the_whole_lump(rules, path)
    test_the_taker_returns_only_what_it_holds(rules, path)
    test_an_encampment_building_raises_the_ceiling(rules, path)
    test_no_bank_ever_stands_above_its_ceiling(rules, path)
    print("BATTERY OK stockpile_ceiling")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
