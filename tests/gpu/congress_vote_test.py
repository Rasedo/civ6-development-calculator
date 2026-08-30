"""THE WORLD CONGRESS BALLOT — the vote as a wire decision.

    python tests/gpu/congress_vote_test.py

CIV 6 (Gathering Storm, wiki "World Congress (Civ6)"): "For each Regular
session resolution, every civilization will first choose one of the two
outcomes. If there are multiple possible targets within that outcome, the
civilization will then choose a single target." Extra votes cost favor up a
curve that restarts per resolution — "it is thus wise to spend Diplomatic
Favor on other resolutions if they are also important" — and the refunds are
100% for a losing outcome, 50% for the winning outcome on a losing target.

The gate reaches a session about five times a game, always with the ladder's
own ballot. This lane pins what a DIFFERENT ballot does: the override, the
favor curve, the two refund tiers, and the Diplomatic Victory resolution's
+/-2 landing on the winning TARGET rather than on the leader.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build():
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    # Every major needs a city to be a voter, and the session gate needs an
    # era: the eras themselves are exercised by the driven gate, so open them
    # here and pin the VOTE.
    sim._congress_min_era = -1
    sim._congress_dv_min = -1
    assert sim.n_majors >= 2, "the tally needs more than one voter"
    for row in range(sim.n_majors):
        assert bool(sim.city_alive[0, row].any()), f"seat {row} holds no city"
    return sim


def session(sim, turn: int) -> None:
    """Run one Regular Session at `turn`, exactly as the turn tail would.
    The slate is ANNOUNCED state — pin it deterministically first, so every
    section reads the same slots whatever the draw did last session."""
    sim.congress_slate[:, 0] = 0
    sim.congress_slate[:, 1] = 1 if len(sim._congress_res) > 1 else -1
    sim.turn = turn
    sim._world_congress()


def main() -> None:
    sim = build()
    iv = sim._congress_interval
    assert iv > 0, "the congress interval is off in this fixture"
    NR = len(sim._congress_res)
    assert NR, "no resolution in the catalog"

    # --- 1) THE SLATE a ballot addresses ------------------------------------
    fires, res0, res1, dv = sim._congress_upcoming(iv)
    assert bool(fires[0]), "a session must fire on an interval turn"
    assert int(res0[0]) == -1, "no slate stands before the first announcement"
    sim.congress_slate[:, 0] = 0
    sim.congress_slate[:, 1] = 1 if NR > 1 else -1
    fires, res0, res1, dv = sim._congress_upcoming(iv)
    assert int(res0[0]) == 0, "the announced slate must read back"
    quiet, _, _, _ = sim._congress_upcoming(iv + 1)
    assert not bool(quiet[0]), "no session on an off-interval turn"
    print(f"  the slate at turn {iv}: slots {int(res0[0])}, {int(res1[0])}; dv={bool(dv[0])}")

    # The Diplomatic Victory resolution runs in the same session and pours
    # every seat's whole bank into it, which would eat the refunds below. It
    # gets its own section at the end.
    sim._congress_dv_min = 99

    # --- 2) A BALLOT OVERRIDES THE AI LINE ----------------------------------
    # One seat names a target its own preference would not pick, and buys
    # enough votes that its target wins the plurality outright.
    r = int(res0[0])
    kind = sim._congress_res[r]["t"]
    size = sim._congress_space(kind)
    assert size >= 2, "this resolution has only one target — nothing to override"
    voter = 0
    pref = int(sim._congress_pref(r, voter)[1][0])
    other = (pref + 1) % size
    for row in range(sim.n_majors):
        sim.civ_diplo_favor[:, row] = 0
    sim.civ_diplo_favor[:, voter] = 10 * (1 + 2 + 3 + 4 + 5)  # five extra votes
    sim.civ_congress_vote[0, voter, 0] = torch.tensor([0, other, 5])
    session(sim, iv)
    assert int(sim.congress_active[0, 0, 0]) == r, "slot 0 did not stand the slate's resolution"
    assert int(sim.congress_active[0, 0, 2]) == other, (
        f"the bought ballot lost: target {int(sim.congress_active[0, 0, 2])}, wanted {other}"
    )
    assert int(sim.civ_diplo_favor[0, voter]) == 0, "the winning combo takes the whole spend"
    assert not bool((sim.civ_congress_vote[0] >= 0).any()), "the ballot must clear after the session"
    print(f"  five bought votes carried target {other} over the AI's {pref}")

    # --- 3) THE CURVE: what the bank cannot clear, it does not buy ----------
    sim.civ_diplo_favor[:, voter] = 10 + 20 + 5   # three rungs cost 10+20+30
    got, spent = sim._congress_buy(voter, torch.ones(sim.B, dtype=torch.bool),
                                  torch.full((sim.B,), 9, dtype=torch.long))
    assert int(got[0]) == 2, f"a 35-favor bank buys two extra votes, got {int(got[0])}"
    assert int(spent[0]) == 30, f"two rungs cost 10+20, spent {int(spent[0])}"
    assert int(sim.civ_diplo_favor[0, voter]) == 5, "the remainder stays in the bank"
    got2, _ = sim._congress_buy(voter, torch.ones(sim.B, dtype=torch.bool),
                               torch.zeros(sim.B, dtype=torch.long))
    assert int(got2[0]) == 0, "a ballot that asks for nothing spends nothing"
    print("  the 10k curve stops at the rung the bank cannot clear")

    # --- 4) THE REFUND TIERS ------------------------------------------------
    # A seat on the LOSING outcome gets everything back; a seat on the winning
    # outcome with a losing target gets half.
    sim.congress_active[:] = -1
    bank = 10 + 20 + 30
    for row in range(sim.n_majors):
        sim.civ_diplo_favor[:, row] = bank
        sim.civ_congress_vote[0, row, 0] = torch.tensor([0, 0, 3])
    loser = sim.n_majors - 1
    sim.civ_congress_vote[0, loser, 0] = torch.tensor([1, 0, 3])   # outcome B, alone
    session(sim, iv)
    assert int(sim.congress_active[0, 0, 1]) == 0, "outcome A had the votes and must win"
    assert int(sim.civ_diplo_favor[0, loser]) == bank, (
        f"a losing OUTCOME is refunded in full, got {int(sim.civ_diplo_favor[0, loser])}"
    )
    sim.congress_active[:] = -1
    for row in range(sim.n_majors):
        sim.civ_diplo_favor[:, row] = bank
        sim.civ_congress_vote[0, row, 0] = torch.tensor([0, 0, 3])
    near = sim.n_majors - 1
    sim.civ_congress_vote[0, near, 0] = torch.tensor([0, min(1, size - 1), 1])
    sim.civ_diplo_favor[:, near] = 10
    session(sim, iv)
    assert int(sim.congress_active[0, 0, 2]) == 0, "the crowd's target must win"
    assert int(sim.civ_diplo_favor[0, near]) == 5, (
        f"the winning outcome on a losing target keeps half, got {int(sim.civ_diplo_favor[0, near])}"
    )
    print("  a losing outcome is refunded whole; a losing target keeps half")

    # --- 5) THE DIPLOMATIC VICTORY resolution pays the WINNING TARGET -------
    # Everyone votes A on seat 1 — who is NOT the DVP leader. The +2 must
    # follow the target the tally produced, not the leader.
    sim._congress_dv_min = -1
    sim._congress_res = []   # the DV resolution alone, so its points are readable
    for row in range(sim.n_majors):
        sim.civ_diplo_favor[:, row] = 0
        sim.civ_diplo_points[:, row] = 0
        sim.civ_congress_vote[0, row, 2] = torch.tensor([0, 1, 0])
    sim.civ_diplo_points[:, 0] = 5   # seat 0 leads
    lead = sim._congress_leader(torch.ones(sim.B, dtype=torch.bool))
    assert int(lead[0]) == 0, f"seat 0 should lead on points, got {int(lead[0])}"
    before = int(sim.civ_diplo_points[0, 1])
    session(sim, iv)
    after = int(sim.civ_diplo_points[0, 1])
    # +1 for voting the winning combo, +2 for being the winning target
    assert after == before + sim._dvp_per_res + sim._congress_dv_delta, (
        f"seat 1 should take {sim._dvp_per_res}+{sim._congress_dv_delta}, went {before} -> {after}"
    )
    assert int(sim.civ_diplo_points[0, 0]) == 5 + sim._dvp_per_res, (
        "the leader voted the winning combo too and takes only the resolution point"
    )
    print("  the +/-2 lands on the winning TARGET, not on the leader")

    # --- 6) THE WIDER SLATE: every reader, both faces -----------------------
    # A standing resolution is three numbers, so the readers are pinned by
    # PLANTING one rather than by winning a vote for each.
    sim2 = build()
    K = sim2.congress_active.shape[1]

    def stand(name: str, outcome: int, target: int) -> None:
        sim2.congress_active[:] = -1
        i = sim2._congress_at.get(name, -1)
        assert i >= 0, f"{name} is not in the catalog"
        sim2.congress_active[:, 0] = torch.tensor([i, outcome, target])

    stand("MERCENARY_COMPANIES", 0, 0)
    assert float(sim2._congress_unit_buy_mult(0)[0]) == sim2._c_plus100
    assert float(sim2._congress_unit_buy_mult(1)[0]) == 1.0
    stand("MERCENARY_COMPANIES", 1, 1)
    assert float(sim2._congress_unit_buy_mult(1)[0]) == sim2._c_minus50

    stand("TRADE_POLICY", 0, 1)
    ds = torch.tensor([[1, 0, -1]], dtype=torch.long)
    assert [float(x) for x in sim2._congress_trade_gold(ds)[0]] == [sim2._c_trade_gold, 0.0, 0.0]
    assert int(sim2._congress_route_capacity(1)[0]) == sim2._c_trade_cap
    assert int(sim2._congress_route_capacity(0)[0]) == 0
    assert not bool(sim2._congress_intl_banned(1)[0])
    stand("TRADE_POLICY", 1, 1)
    assert bool(sim2._congress_intl_banned(1)[0]) and not bool(sim2._congress_intl_banned(0)[0])

    if sim2._npol:
        pol = min(1, sim2._npol - 1)
        held = torch.zeros(sim2.B, sim2._npol, dtype=torch.bool)
        held[:, pol] = True
        stand("POLICY_TREATY", 0, pol)
        assert float(sim2._congress_policy_favor(held)[0]) == sim2._c_policy_favor
        assert float(sim2._congress_policy_favor(~held)[0]) == 0.0
        assert int(sim2._congress_policy_blocked()[0]) == -1
        stand("POLICY_TREATY", 1, pol)
        assert int(sim2._congress_policy_blocked()[0]) == pol

    gov = torch.ones(sim2.B, dtype=torch.long)
    stand("WORLD_IDEOLOGY", 0, 1)
    assert int(sim2._congress_wildcard_delta(gov)[0]) == sim2._c_ideology_slots
    assert int(sim2._congress_wildcard_delta(gov * 0)[0]) == 0
    stand("WORLD_IDEOLOGY", 1, 1)
    assert int(sim2._congress_wildcard_delta(gov)[0]) == -sim2._c_ideology_slots

    stand("BORDER_CONTROL_TREATY", 0, 1)
    assert int(sim2._congress_culture_bomb_seat()[0]) == 1
    assert not bool(sim2._congress_border_frozen(1)[0])
    stand("BORDER_CONTROL_TREATY", 1, 1)
    assert int(sim2._congress_culture_bomb_seat()[0]) == -1
    assert bool(sim2._congress_border_frozen(1)[0]) and not bool(sim2._congress_border_frozen(0)[0])

    if sim2.S:
        ct = int(sim2.citystate_type[0, 0])
        stand("TREATY_ORGANIZATION", 0, ct)
        assert float(sim2._congress_suz_favor_weight()[0, 0]) == sim2._c_plus100
        stand("TREATY_ORGANIZATION", 1, ct)
        assert float(sim2._congress_suz_favor_weight()[0, 0]) == 0.0
        stand("SOVEREIGNTY", 0, ct)
        assert float(sim2._congress_cs_route_mult()[0, 0]) == sim2._c_plus100
        assert not bool(sim2._congress_suz_bonus_blocked()[0, 0])
        stand("SOVEREIGNTY", 1, ct)
        assert float(sim2._congress_cs_route_mult()[0, 0]) == 1.0
        assert bool(sim2._congress_suz_bonus_blocked()[0, 0])

    if sim2._proj_rows:
        stand("PUBLIC_WORKS_PROGRAM", 0, 0)
        assert float(sim2._congress_project_mult(0)[0]) == sim2._c_plus100
        assert float(sim2._congress_project_mult(len(sim2._proj_rows) - 1)[0]) == (
            sim2._c_plus100 if len(sim2._proj_rows) == 1 else 1.0)
        stand("PUBLIC_WORKS_PROGRAM", 1, 0)
        assert float(sim2._congress_project_mult(0)[0]) == sim2._c_minus50
    print(f"  the twelve wider-slate readers answer both faces over {K} slate slots")

    # --- 7) TRADE POLICY B ends the standing legs it forbids ----------------
    row, other = 0, 1
    sim2.seat_routes[:] = -1
    sim2.seat_route_dseat[:] = -1
    ocity = int(sim2.city_id[0, row, 0])
    dcity = int(sim2.city_id[0, other, 0])
    sim2.seat_routes[0, row, 0] = torch.tensor([ocity, -1])
    sim2.seat_route_dseat[0, row, 0] = other
    sim2.seat_route_dcity[0, row, 0] = dcity
    sim2.seat_routes[0, other, 0] = torch.tensor([dcity, -1])
    sim2.seat_route_dseat[0, other, 0] = row
    sim2.seat_route_dcity[0, other, 0] = ocity
    stand("TRADE_POLICY", 1, row)
    sim2._congress_cancel_banned_intl()
    assert int(sim2.seat_routes[0, row, 0, 0]) == -1, "the banned seat keeps an international leg"
    assert int(sim2.seat_routes[0, other, 0, 0]) == -1, "a leg TO the banned seat survived"
    print("  a passed Trade Policy B cancels the legs at both ends")

    # --- 8) THE CULTURE BOMB claims the ring, and refuses a paved tile ------
    stand("BORDER_CONTROL_TREATY", 0, row)
    ctr = int(sim2.city_center[0, row, 0])
    ring = [int(t) for t in sim2.neigh[ctr] if int(t) >= 0]
    assert len(ring) >= 2, "the centre has no ring on this map"
    spot, paved = ring[0], ring[1]
    sim2.district[0, paved] = 0                       # a FINISHED one is never stolen
    sim2.district_complete[0, paved] = True
    sim2.tile_seat[0, paved] = other
    foreign = [int(t) for t in sim2.neigh[spot] if int(t) >= 0 and int(t) not in (ctr, paved)]
    assert foreign, "the trigger tile has no free neighbour"
    sim2.tile_seat[0, foreign[0]] = other
    sim2.tile_city[0, foreign[0]] = 999
    rows = torch.tensor([0], dtype=torch.long)
    sim2._culture_bomb(row, rows, torch.tensor([spot], dtype=torch.long),
                       torch.zeros(1, dtype=torch.long))
    assert int(sim2.tile_seat[0, foreign[0]]) == row, "the bomb left a foreign plot alone"
    assert int(sim2.tile_city[0, foreign[0]]) == int(sim2.city_id[0, row, 0])
    assert int(sim2.tile_seat[0, paved]) == other, "the bomb took a FINISHED district"

    # ...and an UNFINISHED build is taken, and the build undone: CIV6 "if a
    # Wonder or a District is still under construction and it suffers the
    # effect of a Culture Bomb, construction will immediately stop and it'll
    # disappear" — the hammers bank rather than burn.
    ocol = 0
    sim2.district[0, paved] = 0
    sim2.district_complete[0, paved] = False
    sim2.tile_seat[0, paved] = other
    sim2.tile_city[0, paved] = int(sim2.city_id[0, other, ocol])
    sim2.city_qtile[0, other, ocol] = paved
    sim2.city_dist_tile[0, other, ocol, 0] = paved
    sim2.city_current[0, other, ocol] = sim2.DISTRICT_BASE
    sim2.city_progress[0, other, ocol] = 40
    sim2.city_prod_bank[0, other, ocol] = 0
    sim2._culture_bomb(row, rows, torch.tensor([spot], dtype=torch.long),
                       torch.zeros(1, dtype=torch.long))
    assert int(sim2.tile_seat[0, paved]) == row, "an unfinished district was spared"
    assert int(sim2.district[0, paved]) == -1, "the unfinished district survived the bomb"
    assert int(sim2.city_qtile[0, other, ocol]) == -1, "the dig site outlived its district"
    assert int(sim2.city_dist_tile[0, other, ocol, 0]) == -1, "the registry kept the plot"
    assert int(sim2.city_current[0, other, ocol]) == -1, "the item stayed in production"
    assert float(sim2.city_prod_bank[0, other, ocol]) == 40.0, "the hammers burned"
    # ...and the build is named by its SITE, not by what the tile's own plane
    # says is going up: a re-queue moves the two independently, so a plane that
    # names district X while the city is producing district Y must still go.
    dead = [c for c in range(sim2.RC) if not bool(sim2.city_alive[0, other, c])]
    assert dead, "every column of this seat is a live city — the guard is untestable"
    dcol, other_d = dead[-1], 7 % sim2.city_dist_tile.shape[3]
    sim2.district[0, paved] = other_d
    sim2.district_complete[0, paved] = False
    sim2.tile_seat[0, paved] = other
    sim2.tile_city[0, paved] = int(sim2.city_id[0, other, ocol])
    sim2.city_qtile[0, other, ocol] = paved
    sim2.city_dist_tile[0, other, ocol, other_d] = paved
    sim2.city_current[0, other, ocol] = sim2.DISTRICT_BASE + (other_d + 1) % sim2.city_dist_tile.shape[3]
    sim2.city_progress[0, other, ocol] = 55
    sim2.city_prod_bank[0, other, ocol] = 0
    # a DEAD column shares the id plane's zero fill, and must never be written
    sim2.city_qtile[0, other, dcol] = paved
    sim2._culture_bomb(row, rows, torch.tensor([spot], dtype=torch.long),
                       torch.zeros(1, dtype=torch.long))
    assert int(sim2.city_current[0, other, ocol]) == -1, (
        "the item survived because the tile's plane named a different district"
    )
    assert float(sim2.city_prod_bank[0, other, ocol]) == 55.0, "the hammers burned"
    assert int(sim2.city_dist_tile[0, other, ocol, other_d]) == -1, "the registry kept the plot"
    assert int(sim2.city_qtile[0, other, dcol]) == paved, (
        "a DEAD city column was written — the id plane's zero fill matched it"
    )
    print("  the bomb claims a foreign plot, spares a finished district and wipes an unfinished one")

    # --- 9. the Deforestation Treaty, which addresses a FEATURE ------------
    sim9 = build()
    dr = sim9._congress_at["DEFORESTATION_TREATY"]
    feats = sim9._congress_feat
    assert len(feats) >= 2, "the clearable-feature target space collapsed"
    assert sim9._congress_space(9) == len(feats)
    tiles = torch.arange(sim9.T, dtype=torch.long).unsqueeze(0)
    fid = sim9.feat_id.gather(1, tiles)
    have = [t for t, f in enumerate(feats) if bool((fid == f).any())]
    assert have, "no clearable feature on this map"
    t0 = have[0]

    sim9.congress_active[:] = -1
    ban, pay = sim9._congress_chop(fid)
    assert not bool(ban.any()) and not bool(pay.any()), "an empty slate banned a chop"

    sim9.congress_active[:, 0, 0] = dr
    sim9.congress_active[:, 0, 1] = 1          # outcome B
    sim9.congress_active[:, 0, 2] = t0
    ban, pay = sim9._congress_chop(fid)
    assert bool(ban.any()) and not bool(pay.any()), "outcome B did not ban the chop"
    assert bool((ban == (fid == feats[t0])).all()), "the ban strayed off its feature"

    sim9.congress_active[:, 0, 1] = 0          # outcome A
    ban, pay = sim9._congress_chop(fid)
    assert not bool(ban.any()), "outcome A banned a chop"
    assert bool((pay == (fid == feats[t0])).all()), "outcome A did not pay on its feature"
    if len(have) > 1:
        sim9.congress_active[:, 0, 2] = have[1]
        _, pay2 = sim9._congress_chop(fid)
        assert not bool((pay2 & (fid == feats[t0])).any()), "the payout ignored the target"

    # the AI line names the clearable feature the seat owns most of
    sim9.congress_active[:] = -1
    own = (fid[0] == feats[t0]).nonzero(as_tuple=True)[0]
    assert len(own) >= 1
    sim9.tile_seat[0, own] = 0
    for t, f in enumerate(feats):
        if t != t0:
            sim9.tile_seat[0, (fid[0] == f).nonzero(as_tuple=True)[0]] = -1
    out9, tgt9 = sim9._congress_pref(dr, 0)
    assert int(out9[0]) == 0 and int(tgt9[0]) == t0, "the AI line missed its own woods"
    print("  the Deforestation Treaty bans and pays on the FEATURE its target names")

    # --- PUBLIC RELATIONS, MILITARY ADVISORY, WORLD RELIGION ----------------
    pr = sim._congress_at["PUBLIC_RELATIONS"]
    sim.congress_active[:] = -1
    sim.congress_active[:, 0, 0] = pr
    sim.congress_active[:, 0, 1] = 0
    sim.congress_active[:, 0, 2] = 1
    sim.civ_grievance.zero_()
    sim._add_grievance(0, 1, 100)
    assert int(sim.civ_grievance[0, 0, 1]) == 200, "outcome A must double what the target generates"
    if sim.n_majors > 2:
        sim._add_grievance(0, 2, 100)
        assert int(sim.civ_grievance[0, 0, 2]) == 100, "a pair the target is not in must stand"
    sim.congress_active[:, 0, 1] = 1
    sim.civ_grievance.zero_()
    sim._add_grievance(0, 1, 100)
    assert int(sim.civ_grievance[0, 0, 1]) == 50, "outcome B must halve it"
    sim._add_grievance(0, 1, -20)                       # a decay step is a PAYBACK
    assert int(sim.civ_grievance[0, 0, 1]) == 30, "the decay must not be scaled"
    print("  PUBLIC RELATIONS scales what an act GENERATES, on both faces, never the decay")

    ma = sim._congress_at["MILITARY_ADVISORY"]
    cls = sim.rules_dev.u_promo_class
    named = int(cls[cls >= 0][0])
    one = (cls == named).nonzero(as_tuple=True)[0][:1]
    off = (cls == -1).nonzero(as_tuple=True)[0][:1]
    sim.congress_active[:] = -1
    sim.congress_active[:, 0, 0] = ma
    sim.congress_active[:, 0, 1] = 0
    sim.congress_active[:, 0, 2] = named
    seat0 = torch.zeros(sim.B, dtype=torch.long)
    assert int(sim._congress_unit_cs(one.expand(sim.B), seat0)[0]) == sim._c_advisory_cs
    if off.numel():
        assert int(sim._congress_unit_cs(off.expand(sim.B), seat0)[0]) == 0,             "a classless chassis takes nothing"
    sim.congress_active[:, 0, 1] = 1
    assert int(sim._congress_unit_cs(one.expand(sim.B), seat0)[0]) == -sim._c_advisory_cs
    print("  MILITARY ADVISORY moves the named promotion class, on both faces")

    # CIV6 (World Religion, outcome A): "this outcome also gives Warrior Monks
    # +10 Combat Strength", and only to a monk of the named religion.
    monk = torch.full((sim.B,), sim._monk_idx, dtype=torch.long)
    sim.congress_active[:] = -1
    sim.congress_active[:, 0, 0] = sim._congress_at["WORLD_RELIGION"]
    sim.congress_active[:, 0, 1] = 0
    sim.congress_active[:, 0, 2] = 1
    assert int(sim._congress_unit_cs(monk, torch.ones(sim.B, dtype=torch.long))[0]) == sim._c_wr_rs
    assert int(sim._congress_unit_cs(monk, seat0)[0]) == 0, "a rival religion's monk took it"
    assert int(sim._congress_unit_cs(one.expand(sim.B),
                                     torch.ones(sim.B, dtype=torch.long))[0]) == 0,         "the monk bonus reached a chassis that is not a monk"
    sim.congress_active[:, 0, 1] = 1
    assert int(sim._congress_unit_cs(monk, torch.ones(sim.B, dtype=torch.long))[0]) == 0,         "outcome B paid the monk"
    print("  WORLD RELIGION outcome A pays the named religion's Warrior Monks — and nobody else")

    wr = sim._congress_at["WORLD_RELIGION"]
    sim.congress_active[:] = -1
    sim.congress_active[:, 0, 0] = wr
    sim.congress_active[:, 0, 1] = 0
    sim.congress_active[:, 0, 2] = 1
    r0 = torch.zeros(sim.B, dtype=torch.long, device=sim.device)
    assert int(sim._congress_relig_cs(r0 + 1)[0]) == sim._c_wr_rs
    assert int(sim._congress_relig_cs(r0)[0]) == 0, "another religion's row takes nothing"
    assert int(sim._congress_condemn_favor(r0 + 1)[0]) == 0, "outcome A pays no condemnation"
    sim.congress_active[:, 0, 1] = 1
    assert int(sim._congress_relig_cs(r0 + 1)[0]) == 0, "outcome B is not the duel bonus"
    assert int(sim._congress_condemn_favor(r0 + 1)[0]) == sim._c_wr_favor
    print("  WORLD RELIGION pays A in the duel and B at the condemnation")

    # --- the favor tie-break ------------------------------------------------
    # CIV6: "Ties are broken by the proportion of Diplomatic Favor a player
    # commits" — so a tie on VOTES falls to the side that spent, not to A and
    # not to the lower target index.
    simT = build()
    B, NR2 = simT.B, simT.n_majors
    allb = torch.ones(B, dtype=torch.bool, device=simT.device)
    zeros = torch.zeros(B, NR2, dtype=torch.long, device=simT.device)
    out_t = zeros.clone()
    out_t[:, NR2 - 1] = 1                       # the last seat alone votes B
    weight = zeros.clone() + 1
    weight[:, NR2 - 1] = NR2 - 1                # ...with exactly the others' weight
    spent = zeros.clone()
    spent[:, NR2 - 1] = 30
    win_out, _ = simT._congress_settle(allb, out_t, zeros.clone(), weight, spent, 2)
    assert int(win_out[0]) == 1, "the tied OUTCOME must go to the committed favor"
    tgt_t = zeros.clone()
    tgt_t[:, NR2 - 1] = 1                       # ...and the same shape on TARGETS
    _, win_t = simT._congress_settle(allb, zeros.clone(), tgt_t, weight, spent, 2)
    assert int(win_t[0]) == 1, "the tied TARGET must go to the committed favor"
    print("  a tied vote goes to the side that COMMITTED the favor, outcome and target alike")

    # --- THE SCORED COMPETITION: the window, the score and the podium -------
    # CIV6 (Competition): one runs for exactly 30 turns; "the civilization with
    # the highest score wins the Gold Tier rewards", every civ in the top 25%
    # takes Silver and the next quarter Bronze. CIV6 (Climate Accords): "1
    # point per turn for each CO2 emission less than the highest polluter".
    simC = build()
    nrow = simC.n_majors
    assert nrow >= 3, "the podium's two quarters need three in the field"
    ci = simC._congress_at["SCORED_COMPETITION"]
    assert simC._congress_space(simC._congress_res[ci]["t"]) == len(simC._comps), (
        "the target space and the competition catalog disagree"
    )
    simC._congress_dv_min = 99
    simC.congress_slate[:, 0] = ci
    simC.congress_slate[:, 1] = -1
    simC.turn = iv
    for row in range(nrow):
        simC.civ_diplo_favor[:, row] = 0
        simC.civ_congress_vote[0, row, 0] = torch.tensor([0, 0, 0])
    against = nrow - 1
    simC.civ_congress_vote[0, against, 0] = torch.tensor([1, 0, 0])   # outcome B
    simC._world_congress()
    assert int(simC.comp_kind[0]) == simC._comp_climate, "an enacted competition did not start"
    assert int(simC.comp_left[0]) == simC._comp_turns, "the window is not 30 turns"
    assert bool(simC.comp_member[0, 0]) and not bool(simC.comp_member[0, against]), (
        "the field is the A voters, and only them"
    )

    # the score is the gap to the WORLD's highest polluter, and a seat outside
    # the field scores nothing however clean it is
    simC.civ_co2_turn[:] = 0
    simC.civ_co2_turn[0, 0] = 10
    simC.civ_co2_turn[0, 1] = 4
    simC._resolve_competition()
    assert float(simC.comp_score[0, 0]) == 0.0, "the highest polluter scored"
    assert float(simC.comp_score[0, 1]) == 6.0, "the gap to the top polluter is the score"
    assert float(simC.comp_score[0, against]) == 0.0, "a seat outside the field scored"
    assert float(simC.civ_co2_turn[0, 0]) == 0.0, "the turn's emission carried into the next"
    assert int(simC.comp_left[0]) == simC._comp_turns - 1, "the clock did not run"

    # ...and on the FREE vote the smokestack decides: the dirtiest seat refuses
    # the competition it cannot score in, and the rest enact it.
    simC.comp_kind[:] = -1
    simC.civ_co2[:] = 0
    simC.civ_co2[0, 0] = 100
    o_dirty, t_dirty = simC._congress_pref(ci, 0)
    o_clean, t_clean = simC._congress_pref(ci, 1)
    assert int(o_dirty[0]) == 1, "the highest polluter voted for the competition"
    assert int(o_clean[0]) == 0, "a seat that stands to score refused"
    assert int(t_dirty[0]) < len(simC._comps) and int(t_clean[0]) < len(simC._comps), (
        "the free vote named a competition the catalog does not hold"
    )
    simC.congress_slate[:, 0] = ci
    simC.congress_slate[:, 1] = -1
    simC.turn = 2 * iv
    simC._world_congress()
    assert int(simC.comp_kind[0]) == simC._comp_climate, "the free vote did not enact it"
    assert not bool(simC.comp_member[0, 0]), "the seat that voted B joined the field"

    # the podium at the window's end: gold to the best, then the two quarters
    ones = torch.ones(simC.B, dtype=torch.bool, device=simC.device)
    field = torch.ones(simC.B, nrow, dtype=torch.bool, device=simC.device)
    clim = torch.full((simC.B,), simC._comp_climate, dtype=torch.long, device=simC.device)
    silver = -(-nrow * simC._comp_silver_pct // 100)
    bronze = -(-nrow * simC._comp_bronze_pct // 100)
    defn = simC._comps[simC._comp_climate]

    def run_window(emit) -> None:
        simC._start_competition(ones, clim, field)
        for row in range(nrow):
            simC.civ_diplo_points[:, row] = 0
            simC.civ_diplo_favor[:, row] = 0
        for _ in range(simC._comp_turns):
            simC.civ_co2_turn[:] = 0
            for row in range(nrow):
                simC.civ_co2_turn[0, row] = emit(row)
            simC._resolve_competition()
        assert int(simC.comp_kind[0]) == -1, "the window did not close on time"

    run_window(lambda row: 2.0 * (nrow - 1 - row))     # row 0 dirtiest, last cleanest
    for rank, row in enumerate(reversed(range(nrow))):
        want_p = int(defn["gold"]) if rank == 0 else 0
        want_f = (int(defn["silver"]) if rank < silver
                  else int(defn["bronze"]) if rank < bronze else 0)
        assert int(simC.civ_diplo_points[0, row]) == want_p, (
            f"rank {rank} took {int(simC.civ_diplo_points[0, row])} points, wanted {want_p}"
        )
        assert int(simC.civ_diplo_favor[0, row]) == want_f, (
            f"rank {rank} took {int(simC.civ_diplo_favor[0, row])} favor, wanted {want_f}"
        )

    # ...and a tie takes the LOWER row, one total order both engines share
    run_window(lambda row: 4.0 if row == 0 else 0.0)
    assert int(simC.civ_diplo_points[0, 1]) == int(defn["gold"]), "a tie skipped the lower row"
    assert int(simC.civ_diplo_points[0, 2]) == 0, "the tie paid gold twice"
    assert int(simC.civ_diplo_favor[0, 2]) == int(defn["bronze"]), "the tied runner-up missed bronze"
    print("  the competition runs its 30 turns, scores the CO2 gap and pays all three tiers")

    # --- EVERY resolution's free vote lands inside its OWN target space ------
    # A kind with no arm falls through to a default that sizes and picks off a
    # different catalog, and the reader then indexes past its own rows.
    for r in range(len(simC._congress_res)):
        name = simC._congress_res[r]["id"]
        space = simC._congress_space(simC._congress_res[r]["t"])
        assert space > 0, f"{name} offers no target"
        for row in range(nrow):
            o, tg = simC._congress_pref(r, row)
            assert int(o[0]) in (0, 1), f"{name} voted a third outcome"
            assert 0 <= int(tg[0]) < space, (
                f"{name}'s free vote named target {int(tg[0])} of {space}"
            )
    print(f"  all {len(simC._congress_res)} free votes land inside their own target space")

    print("CONGRESS VOTE OK — the slate, the override, the curve, both refunds, the DV target, "
          "the wider slate, the route ban, the culture bomb, the feature target, "
          "the three late resolutions, the favor tie-break and the scored competition")


if __name__ == "__main__":
    main()
