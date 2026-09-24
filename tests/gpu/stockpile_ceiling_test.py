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
from core import BatchSim, load_rules, fixture_paths
from warmup import warm_base, opened

B0 = 0
GIVER, TAKER = 0, 1


# THE WARMED BASE, ONE PER FIXTURE. A scene pays a `restore` — milliseconds —
# instead of a fixture load and a settle. Every plane these pokes write is in
# `_MUTABLE`, so the restore is the whole of it — the forty stepped turns of
# the invariant scene included.


def build(rules, path) -> BatchSim:
    return warm_base(str(path), lambda: opened(rules, path))


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


def test_a_hidden_strategic_is_not_there_yet(rules, path) -> None:
    """CIV6 (Resources.PrereqTech): a strategic resource is INVISIBLE until
    its revealing technology — its tile pays the seat no resource yield, it
    accrues nothing under its own improvement, and no unit has access to it;
    the technology turns all three on. `_res_hidden`'s poke."""
    sim = build(rules, path)
    B0, row = 0, 0
    ks = [k for k, rid in enumerate(sim._strat_rid) if int(sim._res_reveal_tech[rid]) >= 0]
    assert len(ks) == 7, f"seven strategics carry a reveal tech, not {len(ks)}"
    k = ks[0]
    rid = int(sim._strat_rid[k])
    tech = int(sim._res_reveal_tech[rid])
    imp = int(sim._res_harvest_imp[rid])
    own = ((sim.tile_seat[B0] == int(sim._ROW_SEAT[row])) & ~sim.water[B0] & (sim.improvement[B0] < 0)
           & (sim.district[B0] < 0) & (sim.res_id[B0] < 0) & (sim.centre_slot_at[B0] < 0) & sim.passable[B0]
           & sim.d_usable[B0])
    flat = own & ~sim.hills[B0]
    t = int((flat if bool(flat.any()) else own).nonzero(as_tuple=True)[0][0])
    if int(sim.tile_ftu[B0, t]) >= 0:                    # a feature the district clears: hold its tech
        sim.civ_techs[:, row, int(sim.tile_ftu[B0, t])] = True
    sim.res_id[B0, t] = rid
    sim.res_yields[B0, t] = sim._res_y6[rid]      # the static plane bakes a resource's yields; a plant writes both
    sim.tile_yields[B0, t] += sim._res_y6[rid].to(sim.tile_yields.dtype)
    sim.res_stripped[B0, t] = False
    sim.res_imp[B0, t] = imp
    sim.res_priority[B0, t] = 2
    sim.res_cat[B0, t] = 2
    sim.d_usable[B0, t] = False                 # what the exporter bakes for a non-bonus resource
    if not bool(sim.hills[B0, t]) and imp == sim.MINE:
        # ...and `mine_ok` folds "a resource tile takes its own improvement":
        # flat ground under a Mine resource reads mine-ok, its resource-free
        # value does not — the row that cannot see the resource reads THAT
        sim.mine_ok[B0, t] = True
        sim._nr_bare["mine_ok"][B0, t] = False
        sim.civ_techs[:, row, tech] = False
        assert not bool(sim._plane_seen("mine_ok", row)[B0, t]), "flat ground under unseen Niter read mine-ok"
        sim.civ_techs[:, row, tech] = True
        assert bool(sim._plane_seen("mine_ok", row)[B0, t]), "a SEEN Mine resource lost its mine-ok"
    # a DISTRICT may stand on an unseen strategic (the install allows it; the
    # resource is lost) and not on a seen one — `_district_elig` reads the row
    j = next(jj for jj in range(sim.city_id.shape[2]) if int(sim.city_id[B0, row, jj]) == int(sim.tile_city[B0, t]))
    sim.civ_techs[:, row, tech] = False
    sim._eff_version += 1
    assert bool(sim._district_elig(row, j, 0, 0)[B0, t]), "a district refused over an unseen strategic"
    sim.civ_techs[:, row, tech] = True
    sim._eff_version += 1
    assert not bool(sim._district_elig(row, j, 0, 0)[B0, t]), "a district allowed over a SEEN strategic"
    sim.improvement[B0, t] = imp
    sim.pillaged[B0, t] = False
    sim.civ_techs[:, row, tech] = False
    sim._eff_version += 1
    assert bool(sim._res_hidden(row)[B0, t]), "the planted strategic is not hidden before its tech"
    hy = sim._res_hidden_yields(row)
    assert hy is not None and torch.equal(hy[B0, t], sim.res_yields[B0, t]), "the hidden yield plane misses the planted tile"
    assert float(sim.res_yields[B0, t].abs().sum()) > 0, "the resource's own yields are on the plane"
    bank0 = float(sim.civ_stockpile[B0, row, k])
    sim._seat_accrue_stockpile(row)
    assert float(sim.civ_stockpile[B0, row, k]) == bank0, "accrued from a resource the seat cannot see"
    unit = next((u for u, r in sim._res_unit_pairs if int(r) == rid), None)

    def access() -> bool:
        # the mask ANDs the STOCKPILE's half; a full bank isolates the ACCESS half
        held = sim.civ_stockpile[B0, row, k].item()
        sim.civ_stockpile[B0, row, k] = 10 ** 6
        got = bool(sim._res_avail_mask(sim.tile_seat == row, row)[B0, unit])
        sim.civ_stockpile[B0, row, k] = held
        return got

    if unit is not None:
        assert not access(), "access to an unseen resource"
    sim.civ_techs[:, row, tech] = True
    sim._eff_version += 1
    assert not bool(sim._res_hidden(row)[B0, t]), "the tech did not reveal it"
    hy2 = sim._res_hidden_yields(row)
    assert hy2 is None or float(hy2[B0, t].abs().sum()) == 0, "the revealed resource still withheld its yield"
    sim._seat_accrue_stockpile(row)
    assert float(sim.civ_stockpile[B0, row, k]) > bank0, "the revealed resource did not accrue"
    if unit is not None:
        assert access(), "the revealed resource gives no access"
    print(f"  6 visibility OK — strategic {rid} hidden before tech {tech}: no yield, no accrual, no access; all three after")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_ceiling_swallows_the_overflow(rules, path)
    test_room_takes_the_whole_lump(rules, path)
    test_the_taker_returns_only_what_it_holds(rules, path)
    test_an_encampment_building_raises_the_ceiling(rules, path)
    test_no_bank_ever_stands_above_its_ceiling(rules, path)
    test_a_hidden_strategic_is_not_there_yet(rules, path)
    print("BATTERY OK stockpile_ceiling")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
