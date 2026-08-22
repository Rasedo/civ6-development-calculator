"""THE INQUISITOR and the two verbs the Apostle unlocks.

    python tests/gpu/inquisitor_test.py

CIV6: "You can only create Inquisitors if you have founded a religion and had
an Apostle use the Launch Inquisition ability within your territory." Nothing
in a 250-turn scripted game is guaranteed to walk that chain, so this lane
walks it end to end: the Apostle's Launch, the faith purchase behind it, the
Inquisitor's Remove Heresy, a military unit's Condemn Heretic, and the two
theological rules the Inquisitor brought with it — that it may INITIATE, and
that it fights +35 stronger at home.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

ROW = 0


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(p) for p in fixture_paths()[:1]],
                              rules, device="cpu", dtype=torch.float64))
    for _ in range(10):
        sim.step()
    return sim


def religious_city(sim) -> int:
    """Give row 0's first city everything `purchaseReligiousUnit` asks for."""
    sim.civ_religion_done[:, ROW] = True
    sim.city_bldg[:, ROW, 0, sim._shrine_bidx] = True
    sim.city_bldg[:, ROW, 0, sim._temple_bidx] = True
    ctr = int(sim.city_center[0, ROW, 0])
    owned = ((sim.city_slot_at(ROW)[0] == 0) & (sim.district[0] < 0)
             & sim.passable[0]).nonzero(as_tuple=True)[0]
    assert len(owned) > 0, "no free owned tile for the Holy Site"
    hs = int(owned[0])
    sim.district[0, hs] = sim._hs_idx
    sim.district_complete[0, hs] = True
    sim.city_dist_tile[0, ROW, 0, sim._hs_idx] = hs
    sim._eff_version += 1
    return ctr


def place(sim, tile: int, utype: int, seat: int, *, hp=100, charges=0) -> int:
    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = utype
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = hp
    sim.major_unit_charges[0, slot] = charges
    sim.major_unit_mp[0, slot] = 4
    sim.major_unit_promos[0, slot] = 0
    plane = sim.civilian_at if bool(sim._type_civilian[utype]) else sim.military_at
    plane[0, tile] = slot + sim.POOL_LO["major"]
    return slot


def order(sim, row: int, slot: int, action: int) -> None:
    smap = sim._seat_slot_map(row)
    rank = int((smap[0] == slot + sim.POOL_LO["major"]).long().argmax())
    assert int(smap[0, rank]) == slot + sim.POOL_LO["major"], "the unit is not in the slot map"
    a = torch.full(smap.shape, -1, dtype=torch.long)
    a[0, rank] = action
    sim._apply_seat_unit_actions(row, a)


def free_tile(sim, near: int) -> int:
    for n in sim.neigh[near].tolist():
        if n >= 0 and bool(sim.passable[0, n]) and int(sim.military_at[0, n]) < 0 \
                and int(sim.civilian_at[0, n]) < 0:
            return n
    raise AssertionError("no free neighbour")


def test_launch(sim, ctr: int) -> None:
    ap = place(sim, ctr, sim._apostle_idx, ROW, charges=sim._launch_inquisition_charges)
    sim.tile_seat[0, ctr] = ROW
    assert not bool(sim.civ_inquisition[0, ROW]), "the seat starts with no Inquisition"

    # too few charges: the column is shut and the verb refuses
    sim.major_unit_charges[0, ap] = sim._launch_inquisition_charges - 1
    um = sim._seat_unit_mask(ROW)
    smap = sim._seat_slot_map(ROW)
    rank = int((smap[0] == ap + sim.POOL_LO["major"]).long().argmax())
    assert not bool(um[0, rank, sim._A_INQUISITION]), "Launch offered under three charges"
    order(sim, ROW, ap, sim._A_INQUISITION)
    assert not bool(sim.civ_inquisition[0, ROW]), "an under-charged Apostle launched anyway"

    sim.major_unit_charges[0, ap] = sim._launch_inquisition_charges
    um = sim._seat_unit_mask(ROW)
    assert bool(um[0, rank, sim._A_INQUISITION]), "Launch is shut with three charges in own territory"
    order(sim, ROW, ap, sim._A_INQUISITION)
    assert bool(sim.civ_inquisition[0, ROW]), "the Inquisition did not open"
    assert not bool(sim.major_unit_alive[0, ap]), "Launch Inquisition did not consume the Apostle"
    assert int(sim.civilian_at[0, ctr]) < 0, "the consumed Apostle still holds its tile"
    print("  launch OK — three charges, own territory, and the Apostle is spent")


def test_purchase(sim, ctr: int) -> None:
    assert sim._inquisitor_idx >= 0, "no INQUISITOR in the roster"
    sim.civ_faith[:, ROW] = 9999.0
    _w, _wj, _m, _mj, _a, _aj, q_ok, q_j = sim._seat_faith_buy_candidates(
        ROW, torch.ones(sim.B, dtype=torch.bool))
    assert bool(q_ok[0]), "the Inquisitor is not on offer with the Inquisition launched"

    before = int(sim.unit_next[0])
    sim._stash_buy(ROW, relig=(torch.full((sim.B,), 11, dtype=torch.long), q_j))
    sim._seat_buy_ladder(ROW, torch.ones(sim.B, dtype=torch.bool),
                         torch.zeros(sim.B, dtype=torch.long))
    assert int(sim.unit_next[0]) == before + 1, "no Inquisitor spawned"
    q = before
    assert int(sim.major_unit_type[0, q]) == sim._inquisitor_idx, "the purchase spawned the wrong chassis"
    assert int(sim.major_unit_charges[0, q]) == int(sim._type_charges[sim._inquisitor_idx]), \
        "the Inquisitor did not land with its Remove Heresy charges"

    # with the Inquisition CLOSED the column is gone again
    sim.civ_inquisition[:, ROW] = False
    _w, _wj, _m, _mj, _a, _aj, q2, _qj = sim._seat_faith_buy_candidates(
        ROW, torch.ones(sim.B, dtype=torch.bool))
    assert not bool(q2[0]), "the Inquisitor is on offer with no Inquisition launched"
    sim.civ_inquisition[:, ROW] = True
    print("  purchase OK — faith, a Temple and a launched Inquisition, and the cap holds")
    return q


def test_remove_heresy(sim, ctr: int, q: int) -> None:
    sim.major_unit_tile[0, q] = ctr
    sim.civilian_at[0, ctr] = q + sim.POOL_LO["major"]
    sim.major_unit_mp[0, q] = 4
    foreign = 1 if sim.n_majors > 1 else 0
    sim.city_pressure[0, ROW, 0, ROW] = 400
    if sim.n_majors > 1:
        sim.city_pressure[0, ROW, 0, foreign] = 400

    smap = sim._seat_slot_map(ROW)
    rank = int((smap[0] == q + sim.POOL_LO["major"]).long().argmax())
    assert bool(sim._seat_unit_mask(ROW)[0, rank, sim._A_HERESY]), \
        "Remove Heresy is shut for an Inquisitor in its own City Center"
    order(sim, ROW, q, sim._A_HERESY)
    assert int(sim.city_pressure[0, ROW, 0, ROW]) == 400, "Remove Heresy hit its OWN religion"
    if sim.n_majors > 1:
        # CIV6 (GS): "Only remove 75% presence of other Religions instead of 100%"
        want = (400 * (100 - sim._remove_heresy_pct)) // 100
        got = int(sim.city_pressure[0, ROW, 0, foreign])
        assert got == want, f"the foreign pressure fell to {got}, want {want}"
    assert int(sim.major_unit_charges[0, q]) == int(sim._type_charges[sim._inquisitor_idx]) - 1, \
        "Remove Heresy spent no charge"
    assert int(sim.major_unit_mp[0, q]) == 0, "Remove Heresy did not end the turn"
    print("  remove heresy OK — 75% of the OTHER religions, one charge, the turn spent")


def test_condemn(sim) -> None:
    if sim.n_majors < 2:
        print("  condemn SKIPPED (one major)")
        return
    ctr = int(sim.city_center[0, ROW, 0])
    t_mil = free_tile(sim, ctr)
    t_rel = free_tile(sim, t_mil)
    mil = int((sim._type_combat > 0).nonzero(as_tuple=True)[0][0])
    sol = place(sim, t_mil, mil, ROW)
    heretic = place(sim, t_rel, sim._missionary_idx, 1, charges=2)

    smap = sim._seat_slot_map(ROW)
    rank = int((smap[0] == sol + sim.POOL_LO["major"]).long().argmax())
    d = [i for i, n in enumerate(sim.neigh[t_mil].tolist()) if n == t_rel][0]

    # CIV6: "Must be at war with the owner of the religious unit."
    sim.war[:, ROW, 1] = False
    sim.war[:, 1, ROW] = False
    assert not bool(sim._seat_unit_mask(ROW)[0, rank, sim._A_CONDEMN + d]), \
        "Condemn offered at peace"
    sim.war[:, ROW, 1] = True
    sim.war[:, 1, ROW] = True
    assert bool(sim._seat_unit_mask(ROW)[0, rank, sim._A_CONDEMN + d]), \
        "Condemn shut against an adjacent enemy religious unit at war"

    sim.city_pressure[0, ROW, 0, 1] = 400
    order(sim, ROW, sol, sim._A_CONDEMN + d)
    assert not bool(sim.major_unit_alive[0, heretic]), "Condemn did not kill the religious unit"
    assert int(sim.civilian_at[0, t_rel]) < 0, "the condemned unit still holds its tile"
    got = int(sim.city_pressure[0, ROW, 0, 1])
    assert got == 400 - sim._condemn_swing, f"the loser's pressure fell to {got}"
    print("  condemn OK — a war, a kill, and only the loser's halved swing")


def test_theological(sim) -> None:
    if sim.n_majors < 2:
        print("  theological SKIPPED (one major)")
        return
    ctr = int(sim.city_center[0, ROW, 0])
    ta = free_tile(sim, ctr)
    tb = free_tile(sim, ta)
    sim.tile_seat[0, ta] = ROW           # the Inquisitor's own territory
    sim.tile_seat[0, tb] = ROW

    q = place(sim, ta, sim._inquisitor_idx, ROW, hp=100, charges=3)
    m = place(sim, tb, sim._missionary_idx, 1, hp=100, charges=2)

    # +35 Religious Strength at home, and nothing abroad
    home = int(sim._theo_strength(
        sim.major_unit_type[:, q], sim.major_unit_promos[:, q], sim.major_unit_hp[:, q],
        sim.major_unit_tile[:, q], sim.major_unit_seat[:, q])[0])
    sim.tile_seat[0, ta] = 1
    away = int(sim._theo_strength(
        sim.major_unit_type[:, q], sim.major_unit_promos[:, q], sim.major_unit_hp[:, q],
        sim.major_unit_tile[:, q], sim.major_unit_seat[:, q])[0])
    assert home - away == sim._inquisitor_home_strength, \
        f"the home bonus reads {home - away}, want {sim._inquisitor_home_strength}"
    sim.tile_seat[0, ta] = ROW

    # CIV6: "only Apostles and Inquisitors can initiate theological combat"
    hp_before = int(sim.major_unit_hp[0, m])
    sim._theological_combat_phase()
    assert int(sim.major_unit_hp[0, m]) < hp_before, "the Inquisitor did not open a duel"

    # a MISSIONARY may be the target and never the initiator
    for slot in (q, m):
        sim.major_unit_alive[0, slot] = False
        sim._vacate("major", torch.tensor([0]), torch.tensor([slot]))
    tc = free_tile(sim, ctr)
    td = free_tile(sim, tc)
    m1 = place(sim, tc, sim._missionary_idx, ROW, charges=2)
    m2 = place(sim, td, sim._missionary_idx, 1, charges=2)
    h1, h2 = int(sim.major_unit_hp[0, m1]), int(sim.major_unit_hp[0, m2])
    sim._theological_combat_phase()
    assert int(sim.major_unit_hp[0, m1]) == h1 and int(sim.major_unit_hp[0, m2]) == h2, \
        "two Missionaries fought a duel neither may start"
    print("  theological OK — the Inquisitor initiates and fights +35 at home; Missionaries do not")


def test_flanking_layer(sim) -> None:
    """B-50r: a theological duel is flanked by the RELIGIOUS layer."""
    ctr = int(sim.city_center[0, ROW, 0])
    ta = free_tile(sim, ctr)
    tb = free_tile(sim, ta)
    atk = place(sim, ta, sim._apostle_idx, ROW, charges=3)
    seat = sim.major_unit_seat[:, atk]
    slot = torch.full((sim.B,), atk + sim.POOL_LO["major"], dtype=torch.long)
    dseat = torch.ones(sim.B, dtype=torch.long)
    fl0, _sp0 = sim._theo_flank_support(torch.tensor([tb]), dseat, slot, seat)

    # a MILITARY unit of the same seat beside the defender flanks a melee, but
    # never a duel of faith
    for n in sim.neigh[tb].tolist():
        if n >= 0 and bool(sim.passable[0, n]) and n != ta and int(sim.military_at[0, n]) < 0:
            place(sim, n, int((sim._type_combat > 0).nonzero(as_tuple=True)[0][0]), ROW)
            break
    fl1, _sp1 = sim._theo_flank_support(torch.tensor([tb]), dseat, slot, seat)
    assert int(fl1[0]) == int(fl0[0]), "a soldier flanked a theological duel"
    print("  flanking OK — the religious layer, not the military one")


def main() -> None:
    sim = build()
    assert sim._A_INQUISITION >= 0 and sim._A_HERESY >= 0 and sim._A_CONDEMN >= 0, \
        "the religious verbs are not in the action enum"
    ctr = religious_city(sim)
    test_launch(sim, ctr)
    q = test_purchase(sim, ctr)
    test_remove_heresy(sim, ctr, q)
    test_condemn(sim)
    test_theological(sim)
    test_flanking_layer(sim)
    print("INQUISITOR OK")


if __name__ == "__main__":
    main()
