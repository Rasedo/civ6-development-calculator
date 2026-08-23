"""SEAT 0 <-> CITY-STATE WAR — the CS-attack mask column.

    python tests/gpu/cs_war_test.py

Real Civ 6 treats a city-state as a separate seat: peace is the default and war
must be DECLARED before its centre can be attacked. Offering a PEACEFUL
city-state as a target is what the autopilot invariant ("target lists never
include peaceful city-states", tests/cpu/seats/loyalty-and-conquest.test.ts)
forbids.

This lane pins the construct the scripted gate cannot reach: the plane exists
and is persisted, peace hides the centre from the mask, and a declaration
reveals it.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.engine import _MUTABLE
from warmup import settle_all


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"

    # --- 1) the plane exists, is peace-by-default and survives a round trip --
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    # A (seat, city-state) war is a cell of the war matrix and has no second
    # name: what is registered and what carries the state through a
    # round trip are the same tensor, so the pair cannot drift.
    assert "war" in _MUTABLE, "the war matrix must be registered in _MUTABLE"
    assert not hasattr(sim, "citystate_atwar"), (
        "the seat-0/city-state war VIEW must stay deleted — one name per fact"
    )
    assert sim.war.shape == (sim.B, sim.NS, sim.NS), f"war shape {tuple(sim.war.shape)}"
    cs_lo = sim.row_of(100 + 0)
    assert not bool(sim.war[:, :, cs_lo:cs_lo + sim.S].any()), (
        "peace is the default — no city-state starts at war"
    )
    sim.war[0, 0, sim.row_of(100 + 0)] = sim.war[0, sim.row_of(100 + 0), 0] = True
    sim.sync_war()  # close the poke under transpose
    snap = sim.snapshot()
    sim.war[0, 0, sim.row_of(100 + 0)] = sim.war[0, sim.row_of(100 + 0), 0] = False
    sim.sync_war()  # close the poke under transpose
    sim.restore(snap)
    assert bool(sim.war[0, 0, sim.row_of(100 + 0)]), "a city-state war must survive snapshot/restore"

    # --- 2) peace hides the centre; a declaration reveals it -----------------
    # Walk a few turns so a seat-0 unit exists, then plant one adjacent to a
    # live city-state centre and read the mask with war off, then on.
    s2 = settle_all(BatchSim([load_fixture(p) for p in paths], rules, device="cpu", dtype=torch.float64))
    for _ in range(30):
        s2.step()
    # CONSTRUCT the configuration rather than hunt for it: take any live seat-0
    # unit, make it a fighter, and stand it next to a live city-state centre —
    # a poke that silently skips proves nothing.
    fighter = int((s2._type_combat > 0).nonzero().flatten()[0])
    found = None
    for b in range(s2.B):
        live = s2.citystate_alive[b].nonzero().flatten().tolist()
        units = (s2.major_unit_alive[b] & (s2.major_unit_seat[b] == 0)).nonzero().flatten().tolist()
        if not live or not units:
            continue
        cs = live[0]
        ctr = int(s2.citystate_center[b, cs])
        nbrs = [int(x) for x in s2.neigh[ctr].tolist() if x >= 0 and bool(s2.passable[b, x])]
        if not nbrs:
            continue
        found = (b, cs, ctr, units[0], nbrs[0])
        break
    assert found is not None, "no fixture has a live city-state and a live seat-0 unit"
    s2.major_unit_type[found[0], found[3]] = fighter
    b, cs, ctr, u, spot = found
    s2.major_unit_tile[b, u] = spot
    s2.war[b, 0, s2.row_of(100 + cs)] = s2.war[b, s2.row_of(100 + cs), 0] = False
    s2.sync_war()  # close the poke under transpose
    # the mask indexes HEAD ROWS — this seat's living units in slot order
    rw = int((s2._seat_slot_map(0)[b] == u).nonzero(as_tuple=True)[0][0])
    m_peace = s2._seat_unit_mask(0)[b, rw, 6:12]
    dirs = [i for i, n in enumerate(s2.neigh[spot].tolist()) if n == ctr]
    assert dirs, "the planted tile is not adjacent to the centre"
    d = dirs[0]
    assert not bool(m_peace[d]), "a PEACEFUL city-state must never appear in the attack mask"
    s2.war[b, 0, s2.row_of(100 + cs)] = s2.war[b, s2.row_of(100 + cs), 0] = True
    s2.sync_war()  # close the poke under transpose
    m_war = s2._seat_unit_mask(0)[b, rw, 6:12]
    assert bool(m_war[d]), "after a declaration the city-state centre MUST be attackable"
    print("  a city-state war: peace default, one store, snapshot round-trip OK")
    print("  b mask: peaceful hidden, declared war reveals the centre OK")

    # --- c: the SUZERAIN RELEASE --------------------------------------------
    # `makePeace` in cpu/core/phase.ts ends the wars a civ's city-states were
    # dragged into and sheds WW_PEACE_TREATY from each. No seat declares on a
    # city-state in the gate, so this poke is the only coverage it has.
    suz_min = int(s2.rules.citystate.get("suzerainEnvoys", 3))
    r = 0
    s2.war[b, 0, s2.row_of(100 + cs)] = s2.war[b, s2.row_of(100 + cs), 0] = True
    _citystate_row0 = s2.n_majors + cs
    s2.war_turns[b, 0, _citystate_row0] = 7
    s2.war_turns[b, _citystate_row0, 0] = 7
    s2.seat_citystate_envoys[b, r + 1, cs] = suz_min + 2   # this civ is the strict suzerain
    s2.seat_citystate_envoys[b, 0, cs] = 0
    if s2.n_majors > 2:
        s2.seat_citystate_envoys[b, 2:, cs] = 0
    _citystate_row = s2.n_majors + cs
    s2.ww[b, 0, _citystate_row] = 900.0
    s2.sync_war()
    shed = int(s2.rules.war_weariness.get("peaceTreaty", 2000))

    _peace = torch.zeros(s2.B, dtype=torch.bool)
    _peace[b] = True
    # the PATRON is the suzerain civ; seat 0 is the foe whose war ends.
    s2._citystate_suzerain_release(r + 1, 0, _peace)
    assert not bool(s2.war[b, 0, s2.row_of(100 + cs)]), "the suzerain's peace must end the city-state's war"
    assert float(s2.ww[b, 0, _citystate_row]) == max(0.0, 900.0 - shed), "seat 0 must shed the treaty amount"
    assert int(s2.war_turns[b, 0, _citystate_row]) == 0, "the (seat 0, city-state) clock must reset"
    assert int(s2.war_turns[b, _citystate_row, 0]) == 0, "...and its mirror cell with it"

    # a civ that is NOT the suzerain releases nothing
    s2.war[b, 0, s2.row_of(100 + cs)] = s2.war[b, s2.row_of(100 + cs), 0] = True
    s2.seat_citystate_envoys[b, r + 1, cs] = 0
    s2.sync_war()
    s2._citystate_suzerain_release(r + 1, 0, _peace)
    assert bool(s2.war[b, 0, s2.row_of(100 + cs)]), "a non-suzerain's peace must NOT free the city-state"
    print("  c suzerain release: war ends, BOTH clock cells reset, -%d ww OK" % shed)

    # --- d: THE WAR HEAD'S MINOR COLUMNS -------------------------------------
    # The head is [declare per target, sue per target] over `war_targets(row)`:
    # every other major in ascending seat order, then the whole city-state
    # roster. A captured minor keeps its column and the column is never legal.
    n_opp = s2.n_majors - 1
    n_tgt = n_opp + s2.S
    assert s2.war_targets(0) == list(range(1, s2.n_majors)) + [s2.n_majors + x for x in range(s2.S)]
    assert tuple(s2._seat_war_mask(0).shape) == (s2.B, 2 * n_tgt)

    def declare_col(idx: int) -> int:
        return n_opp + idx

    def sue_col(idx: int) -> int:
        return n_tgt + n_opp + idx

    crow = s2.row_of(100 + cs)
    def reset() -> None:
        s2.war[b, 0, crow] = s2.war[b, crow, 0] = False
        s2.war_turns[b, 0, crow] = s2.war_turns[b, crow, 0] = 0
        s2.treaty_turns[b, 0, crow] = s2.treaty_turns[b, crow, 0] = 0
        s2.seat_citystate_met[b, :, cs] = False
        s2.seat_citystate_envoys[b, :, cs] = 0
        s2.sync_war()

    def fire(col: int) -> None:
        w = torch.full((s2.B,), -1, dtype=torch.long)
        w[b] = col
        s2._apply_war_column(0, w)

    # UNMET is refused: `declareWarOnCityState` needs the meeting.
    reset()
    assert not bool(s2._seat_war_mask(0)[b, declare_col(cs)]), "an unmet minor must not offer a declare"
    fire(declare_col(cs))
    assert not bool(s2.war[b, 0, crow]), "a declare on an unmet minor must be refused"

    # MET: the column opens, the declaration lands on BOTH cells, and it PAYS
    # the minor's patrons — "War declared on a city-state a civ is the Suzerain
    # over: 100", and 50 "to every civ that has at least 1 Envoy in that
    # city-state, but is not its Suzerain".
    s2.seat_citystate_met[b, 0, cs] = True
    assert bool(s2._seat_war_mask(0)[b, declare_col(cs)]), "a met, peaceful minor must offer a declare"
    if s2.n_majors > 2:
        s2.seat_citystate_envoys[b, :, cs] = 0
        s2.seat_citystate_envoys[b, 1, cs] = 3      # seat 1 is the suzerain
        s2.seat_citystate_envoys[b, 2, cs] = 1      # seat 2 only holds an envoy
        s2._eff_version += 1
    s2.civ_grievance.zero_()
    fire(declare_col(cs))
    assert bool(s2.war[b, 0, crow]) and bool(s2.war[b, crow, 0]), "the declare must set both cells"
    if s2.n_majors > 2:
        assert int(s2.civ_grievance[b, 1, 0]) == s2._griev_war_on_suzerain, (
            "the suzerain must be paid for its minor")
        assert int(s2.civ_grievance[b, 2, 0]) == s2._griev_war_on_cs_friend, (
            "an envoy holder that is not the suzerain takes the smaller row")
        assert int(s2.civ_grievance[b, 0, 1]) == -s2._griev_war_on_suzerain, "the pair is antisymmetric"
    assert not bool(s2._seat_war_mask(0)[b, declare_col(cs)]), "an ongoing war closes the declare column"

    # THE SUE takes the ten-turn clock and costs NO gold — a minor "will
    # always accept an offer of peace without preconditions".
    min_turns = int(s2.rules.seats.get("warMinTurns", 14))
    s2.war_turns[b, 0, crow] = s2.war_turns[b, crow, 0] = min_turns - 1
    assert not bool(s2._seat_war_mask(0)[b, sue_col(cs)]), "too early: the minor will not talk yet"
    s2.war_turns[b, 0, crow] = s2.war_turns[b, crow, 0] = min_turns
    s2.civ_treasury[b, 0] = 0
    assert bool(s2._seat_war_mask(0)[b, sue_col(cs)]), "a broke seat can still make peace with a minor"
    fire(sue_col(cs))
    assert not bool(s2.war[b, 0, crow]), "the sue column must end the war"
    assert int(s2.civ_treasury[b, 0]) == 0, "peace with a minor costs nothing"
    assert int(s2.treaty_turns[b, 0, crow]) > 0, "the peace must stamp a treaty"
    assert not bool(s2._seat_war_mask(0)[b, declare_col(cs)]), "the treaty shuts the declare column"

    # A SUZERAIN STILL AT WAR blocks the talk.
    if s2.n_majors > 1:
        reset()
        s2.seat_citystate_met[b, 0, cs] = True
        s2.war[b, 0, crow] = s2.war[b, crow, 0] = True
        s2.war_turns[b, 0, crow] = s2.war_turns[b, crow, 0] = min_turns
        s2.war[b, 0, 1] = s2.war[b, 1, 0] = True
        s2.seat_citystate_envoys[b, 1, cs] = suz_min + 2
        s2.sync_war()
        assert not bool(s2._seat_war_mask(0)[b, sue_col(cs)]), (
            "a minor will not talk while its suzerain is still fighting you"
        )
        fire(sue_col(cs))
        assert bool(s2.war[b, 0, crow]), "...and the apply refuses it too"
    print("  d the war head's MINOR half: met, declare, the clock, the free peace, the suzerain block")

    # --- 5) the WAR MARCH reaches a minor ------------------------------------
    # A seat that declares on a city-state has to have somewhere to walk: the
    # target scan runs the minor rows exactly like the major ones, and the
    # PILLAGE column opens on the minor's ground only once the war stands.
    s5 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    for _ in range(20):
        s5.step()
    cs5 = next(s for s in range(s5.S) if bool(s5.citystate_alive[0, s]))
    crow5 = s5.row_of(100 + cs5)
    ctr5 = int(s5.citystate_center[0, cs5])
    here = next(int(t) for t in range(s5.T)
                if int(s5.pair_dist[ctr5, t]) == 5 and not bool(s5.water[0, t]))
    hc = torch.full((s5.B,), here, dtype=torch.long, device=s5.device)

    s5.war[:, 0, :] = False
    s5.war[:, :, 0] = False
    _t0, _i0, _c0 = s5._war_march_target(hc, 0)
    assert not bool(_i0[0] or _c0[0]), "at peace with everyone there is nothing to march on"

    s5.war[:, 0, crow5] = True
    s5.war[:, crow5, 0] = True
    tgt, has_i, has_c = s5._war_march_target(hc, 0)
    assert bool(has_i[0] or has_c[0]), "a declared minor war left the walker no target"
    # the minor's OWN ground is what it found — its centre, or an improvement
    # or district on a tile the minor holds
    t5 = int(tgt[0])
    assert int(s5.tile_seat[0, t5]) == 100 + cs5, \
        f"the march target sits on seat {int(s5.tile_seat[0, t5])}, not the minor"

    # the PILLAGE column follows the same war: a minor's improvement is not
    # free to wreck at peace.
    ground = next((int(t) for t in range(s5.T)
                   if int(s5.tile_seat[0, t]) == 100 + cs5 and t != ctr5), -1)
    assert ground >= 0, "the minor holds no ground beside its centre"
    s5.improvement[0, ground] = 0
    s5.pillaged[0, ground] = False
    slot = int(s5.major_unit_alive[0].nonzero()[0][0])
    s5._vacate("major", torch.tensor([0]), torch.tensor([slot]))
    s5.major_unit_tile[0, slot] = ground
    s5.military_at[0, ground] = slot + s5.POOL_LO["major"]
    s5.major_unit_seat[0, slot] = 0
    s5.major_unit_mp[0, slot] = 2
    smap = s5._seat_slot_map(0)
    n5 = int((smap[0] == slot + s5.POOL_LO["major"]).nonzero()[0][0])
    col = s5._A_PILLAGE
    mask_war = s5._seat_unit_mask(0)
    s5.war[:, 0, crow5] = False
    s5.war[:, crow5, 0] = False
    mask_peace = s5._seat_unit_mask(0)
    assert bool(mask_war[0, n5, col]), "war with the minor must open PILLAGE on its ground"
    assert not bool(mask_peace[0, n5, col]), "peace must shut it again"
    print("  e the war march reaches a minor, and PILLAGE follows the same war")

    print("cs_war_test OK — a major<->city-state war gates the attack mask and rides the wire")


if __name__ == "__main__":
    main()
