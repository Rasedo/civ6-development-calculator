"""Space-race / science-victory self-test.

The chain is GATE-UNREACHABLE: it needs Information- and Future-era techs no
250-turn lane comes close to, so nothing in the battery ever queues a space
project. These pokes are the only proof the mechanic works — mirroring
tests/cpu/victory/space-victory.test.ts against the GPU tensors.

Proven here, turn-exact with the TS contract (cpu/data/projects.ts +
`availableProjects` + `completeProject` + the step() flight tick):
  * the exported chain: 4 space rows, chain order via rp, single victory step,
    every step tech-gated (rt), REAL fixed prices (pc), and the two repeatable
    laser rows (ls) between the base rows and the chain;
  * the SPACEPORT: a scaffold row unlocked by the same tech as step 1, flat
    price, no specialty cap, and a flat-land surface (placement 4 = the plain
    surface minus Hills); the wire queues it at its fixed cost;
  * `_space_step_ok`'s truth table — the `availableProjects` space arm: a step
    needs its tech, needs its predecessor DONE, and is refused once it is in
    the ledger (these are one-time); laser rows are tech-gated only and stay
    offered after completing (repeatable);
  * THE MASK OFFERS IT — the ledger, the completion write and the launch were
    all live once, but the production mask skipped every space row, so no seat
    could ever queue one;
  * the SIDE EFFECTS: Launch Earth Satellite reveals the seat's whole fog
    plane (under the same fog gate as every reveal site), Launch Moon Landing
    pays a one-time Culture lump of js_round(10 x the seat's science/turn),
    Launch Mars Colony pays NOTHING, and the Exoplanet Expedition LAUNCHES
    (space_ly = 0) without winning;
  * THE FLIGHT: step() advances every launched craft 1 LY/turn plus one per
    ORBITAL station and one per TERRESTRIAL station standing in a POWERED
    city; the win fires on ARRIVAL (victoryType 3 + victory_row + game_over),
    a same-turn tie goes to the lowest row, and an already-won space game
    keeps its victor;
  * the step() recompute PRESERVES a science result over the domination/score
    one, and leaves a running game untouched;
  * space_done / space_ly / civ_orbital_lasers / city_lasers are _MUTABLE
    (snapshot/restore).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from core.engine import _MUTABLE
from core.simbase import js_round
from warmup import settle_all


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text())
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"

    def mk() -> BatchSim:
        return settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))

    # --- 1) the exported chain: catalog + gating + sequence + prices --------
    rows = rj["projects"]["rows"]
    space = [(i, row) for i, row in enumerate(rows) if int(row.get("sp", 0))]
    lasers = [(i, row) for i, row in enumerate(rows) if int(row.get("ls", 0))]
    assert len(space) == 4, f"expected 4 space-race rows exported, got {len(space)}"
    assert len(lasers) == 2, f"expected 2 laser-station rows exported, got {len(lasers)}"
    # Space rows sit LAST, in chain order.
    base_n = len(rows) - 4
    assert [i for i, _ in space] == list(range(base_n, base_n + 4)), "space rows must be the LAST 4 (chain order)"
    # exactly one victory step, and it is the final one (EXOPLANET_EXPEDITION).
    vic = [i for i, row in space if int(row.get("vic", 0))]
    assert vic == [space[-1][0]], f"exactly one victory step, the last row: got {vic}"
    # every step tech-gated; each step after the first links to its predecessor
    # (the sequence), the first has no requiresProject.
    for k, (i, row) in enumerate(space):
        assert int(row.get("rt", -1)) >= 0, f"space step {k} must be tech-gated (rt): {row}"
        if k == 0:
            assert int(row.get("rp", -1)) == -1, "step 1 (Earth Satellite) has no requiresProject"
        else:
            assert int(row.get("rp", -1)) == space[k - 1][0], f"space step {k} must require the previous step"
    # THE REAL PRICES (GS 900/1500/1800/2100 and 600, x0.6 game speed); base
    # rows carry pc -1 = the generic curve.
    assert [int(r.get("pc", -1)) for _, r in space] == [540, 900, 1080, 1260], \
        f"space prices off: {[int(r.get('pc', -1)) for _, r in space]}"
    for i, row in lasers:
        assert int(row.get("pc", -1)) == 360, f"laser row {i} price: {row}"
        assert int(row.get("rt", -1)) >= 0 and int(row.get("sp", 0)) == 0, f"laser row {i} gating: {row}"
    assert all(int(r.get("pc", -1)) == -1 for i, r in enumerate(rows) if i < base_n and not int(r.get("ls", 0)) and not int(r.get("rec", 0))), \
        "base projects must keep the generic curve (pc -1)"

    # --- 2) engine metadata mirrors the exported chain ---------------------
    sim = mk()
    assert sim._n_space == 4, f"_n_space should be 4, got {sim._n_space}"
    assert sim._space_proj_idx == [i for i, _ in space], "_space_proj_idx must match the exported space rows"
    assert sim._space_step == {i: k for k, (i, _) in enumerate(space)}, "chain-step map mismatch"
    assert sim._space_victory_idx == {space[-1][0]}, "victory step index mismatch"
    assert sim._laser_proj_idx == {i for i, _ in lasers}, "_laser_proj_idx must match the exported laser rows"
    assert sim._orbital_proj_idx == {i for i, r in lasers if int(r.get("orb", 0))}, \
        "exactly the Lagrange row is orbital"
    assert len(sim._orbital_proj_idx) == 1, "one of the two stations is the orbital one"
    for name in ("space_done", "space_ly", "civ_orbital_lasers", "city_lasers"):
        assert name in _MUTABLE, f"{name} must be registered in _MUTABLE"
    assert sim.space_done.shape == (sim.B, sim.n_majors, 4), f"space_done shape {tuple(sim.space_done.shape)}"
    assert int(sim.rules.space_ly_target) == 30, "the craft's distance: 50 LY x 0.6 game speed"
    assert bool((sim.space_ly == -1).all()), "no craft is in flight at the start"

    # --- 2a) THE SPACEPORT scaffold row ------------------------------------
    spt_didx = next(i for i, d in enumerate(sim.districts_cat) if d.get("id") == "SPACEPORT")
    spt_si, spt_row = next((si, t) for si, t in enumerate(sim._scaffold) if t[0] == spt_didx)
    _di, spt_ut, _uc, spt_plc, spt_fc = spt_row
    assert spt_ut == int(space[0][1]["rt"]), "the Spaceport unlocks with step 1's own tech (Rocketry)"
    assert spt_plc == 4, f"the Spaceport's placement code is 4 (flat land), got {spt_plc}"
    assert spt_fc == 1080, f"the Spaceport's FLAT price is 1800 x 0.6 = 1080, got {spt_fc}"
    assert not bool(sim._is_specialty[spt_didx]), "the Spaceport must not count toward the specialty cap"
    # The flat-land surface: placement 4 is exactly the plain surface minus
    # Hills, for any city that could place on the plain surface at all.
    e0 = sim._district_elig(1, 0, spt_didx, 0)
    e4 = sim._district_elig(1, 0, spt_didx, 4)
    assert torch.equal(e4, e0 & ~sim.hills), "placement 4 must be the plain surface minus Hills"

    # --- 2a') the wire QUEUES a Spaceport at its fixed price ----------------
    def spaceport_site(s: BatchSim):
        for row in range(s.n_majors):
            for j in range(s.RC):
                if not bool(s.city_alive[0, row, j]):
                    continue
                if int(s.city_dist_tile[0, row, j, spt_didx]) >= 0:
                    continue
                cand = s._district_elig(row, j, spt_didx, 4)[0]
                if bool(cand.any()):
                    return row, j, int(cand.nonzero(as_tuple=True)[0][0])
        raise AssertionError("no live city has a flat eligible tile for a Spaceport")

    sq = mk()
    rq, jq, tq = spaceport_site(sq)
    sq.civ_techs[0, rq, spt_ut] = True
    sq.seat_ext[0, rq] = True
    sq.city_current[0, rq, jq] = -1
    dt = torch.full((1, sq.RC, len(sq._scaffold)), -1, dtype=torch.long)
    dt[0, jq, spt_si] = tq
    pr = torch.full((1, sq.RC), -1, dtype=torch.long)
    pr[0, jq] = sq.DISTRICT_BASE + spt_si
    sq.apply_seat_actions(rq, production=pr, production_tile=dt)
    sq._seat_record_apply(rq, torch.ones(1, dtype=torch.bool))
    assert int(sq.city_current[0, rq, jq]) == sq.DISTRICT_BASE + spt_si, "the Spaceport column did not queue"
    assert float(sq.city_cost[0, rq, jq]) == 1080.0, \
        f"the Spaceport must queue at its FLAT price 1080, got {float(sq.city_cost[0, rq, jq])}"
    assert int(sq.city_dist_tile[0, rq, jq, spt_didx]) == tq, "the registry missed the Spaceport's tile"

    # --- 2b) _space_step_ok — the `availableProjects` space arm, term by term
    #   Step 2 (Moon Landing) is the useful probe: it has both a tech gate and
    #   a predecessor, so all four states of the truth table are reachable.
    gk = mk()
    pi_1, row_1 = space[1][0], 1
    rt_1, step_0, step_1 = int(space[1][1]["rt"]), gk._space_step[space[0][0]], gk._space_step[space[1][0]]
    gk.civ_techs[:, row_1, rt_1] = False
    gk.space_done[:, row_1, :] = False
    assert not bool(gk._space_step_ok(row_1, pi_1)[0]), "no tech, no predecessor -> refused"
    gk.civ_techs[:, row_1, rt_1] = True
    assert not bool(gk._space_step_ok(row_1, pi_1)[0]), "tech alone is not enough — the predecessor must be DONE"
    gk.space_done[:, row_1, step_0] = True
    assert bool(gk._space_step_ok(row_1, pi_1)[0]), "tech + finished predecessor -> offered"
    gk.civ_techs[:, row_1, rt_1] = False
    assert not bool(gk._space_step_ok(row_1, pi_1)[0]), "predecessor alone is not enough — the tech gates it"
    gk.civ_techs[:, row_1, rt_1] = True
    gk.space_done[:, row_1, step_1] = True
    assert not bool(gk._space_step_ok(row_1, pi_1)[0]), "a step already in the ledger is ONE-TIME — never re-offered"
    # and the gate is per SEAT: one seat's ledger must not open another's step
    gk.space_done[:, row_1, :] = False
    gk.space_done[:, row_1, step_0] = True
    other = 0 if row_1 != 0 else 1
    gk.civ_techs[:, other, rt_1] = True
    assert not bool(gk._space_step_ok(other, pi_1)[0]), "the chain is per-seat: row A's progress must not open row B's step"

    # --- 2c) THE MASK OFFERS THE CHAIN — space rows on the SPACEPORT --------
    mk_sim = mk()
    mrow, mj = 1, 0
    assert bool(mk_sim.city_alive[0, mrow, mj]), "need a live city to hold the project"
    di_spt = int(space[0][1]["d"])
    assert di_spt == spt_didx, "space rows must run in the SPACEPORT"
    t_spt = int(mk_sim.city_center[0, mrow, mj])
    mk_sim.city_dist_tile[0, mrow, mj, di_spt] = t_spt
    mk_sim.district_complete[0, t_spt] = True
    mk_sim.city_current[0, mrow, mj] = -1          # idle, or no column is legal
    col_0 = mk_sim.PROJECT_BASE + space[0][0]
    mk_sim.civ_techs[0, mrow, int(space[0][1]["rt"])] = False
    assert not bool(mk_sim.seat_masks(mrow)["production"][0, mj, col_0]), "step 1 without its tech must be illegal"
    mk_sim.civ_techs[0, mrow, int(space[0][1]["rt"])] = True
    assert bool(mk_sim.seat_masks(mrow)["production"][0, mj, col_0]), "step 1 with Rocketry and a complete Spaceport MUST be offered"
    mk_sim.space_done[0, mrow, mk_sim._space_step[space[0][0]]] = True
    assert not bool(mk_sim.seat_masks(mrow)["production"][0, mj, col_0]), "a completed step must leave the mask"
    col_1 = mk_sim.PROJECT_BASE + space[1][0]
    mk_sim.civ_techs[0, mrow, int(space[1][1]["rt"])] = True
    assert bool(mk_sim.seat_masks(mrow)["production"][0, mj, col_1]), "finishing step 1 must open step 2"
    # LASER rows: gated on the tech AND the launched craft, then REPEATABLE.
    li, lrow = lasers[0]
    col_l = mk_sim.PROJECT_BASE + li
    rt_l = int(lrow["rt"])
    last_k = mk_sim._space_step[space[-1][0]]
    mk_sim.space_done[0, mrow, last_k] = False
    mk_sim.civ_techs[0, mrow, rt_l] = False
    assert not bool(mk_sim.seat_masks(mrow)["production"][0, mj, col_l]), "a laser row without its tech must be illegal"
    mk_sim.civ_techs[0, mrow, rt_l] = True
    assert not bool(mk_sim.seat_masks(mrow)["production"][0, mj, col_l]), \
        "Offworld Mission alone is not enough — the craft has to be in flight"
    mk_sim.space_done[0, mrow, last_k] = True
    assert bool(mk_sim.seat_masks(mrow)["production"][0, mj, col_l]), \
        "a laser row with its tech and the finished Expedition MUST be offered"
    mk_sim.city_lasers[0, mrow, mj] = 3
    mk_sim.civ_orbital_lasers[0, mrow] = 3
    assert bool(mk_sim.seat_masks(mrow)["production"][0, mj, col_l]), "laser rows are REPEATABLE — never one-time-consumed"

    # --- 3) completing the victory step LAUNCHES — the win is the ARRIVAL ---
    assert sim.n_majors >= 2, "need a second major to prove the outcome is not seat 0's"
    sim2 = mk()
    r, j = 0, 0
    assert bool(sim2.civ_alive[0, r + 1]) and bool(sim2.city_alive[0, r + 1, j]), "civ capital must be alive at turn 0"
    pi_exo = space[-1][0]
    sim2.city_current[0, r + 1, j] = sim2.PROJECT_BASE + pi_exo
    sim2.city_cost[0, r + 1, j] = 1.0
    sim2.city_progress[0, r + 1, j] = 1.0e6
    last_step = sim2._space_step[pi_exo]
    sim2._seat_phase()
    assert bool(sim2.space_done[0, r + 1, last_step]), "civ's victory step must land in space_done"
    assert int(sim2.space_ly[0, r + 1]) == 0, "completing the Exoplanet Expedition LAUNCHES (space_ly = 0)"
    assert int(sim2.victory_type[0]) == 0, "the launch alone must NOT win — the craft has 30 LY to fly"
    assert not bool(sim2.game_over[0]), "the game runs on while the craft flies"

    # --- 3a) THE FLIGHT: 1 LY/turn, +1 per laser, win on arrival ------------
    tgt = int(sim2.rules.space_ly_target)
    sim2.step()
    assert int(sim2.space_ly[0, r + 1]) == 1, "the craft covers 1 LY/turn at base speed"
    assert int(sim2.victory_type[0]) == 0, "1 of 30 LY is not an arrival"
    # an ORBITAL station pays whatever happens; a TERRESTRIAL one in a city
    # that cannot meet its own load pays nothing at all
    sim2.civ_orbital_lasers[0, r + 1] = 2
    sim2.city_lasers[0, r + 1, j] = 1
    sim2._resolve_seat_power(r + 1)
    assert not bool(sim2.city_powered[0, r + 1, j]), "the station's own 5 Power is not met by anything here"
    assert int(sim2._laser_speed(r + 1)[0]) == 2, "an unpowered terrestrial station adds nothing"
    sim2.step()
    assert int(sim2.space_ly[0, r + 1]) == 4, "two orbital stations make the craft cover 3 LY/turn"
    sim2.space_ly[0, r + 1] = tgt - 3
    sim2.step()
    assert int(sim2.victory_type[0]) == 3, "reaching the target LY must fire the science win"
    assert int(sim2.victory_row[0]) == r + 1, f"victoryRow must name the seat that flew, got {int(sim2.victory_row[0])}"
    assert bool(sim2.game_over[0]), "the game must be over on arrival"
    # a same-turn tie goes to the LOWEST row
    tie = mk()
    tie.space_ly[0, 0] = tgt - 1
    tie.space_ly[0, 1] = tgt - 1
    tie.step()
    assert int(tie.victory_type[0]) == 3 and int(tie.victory_row[0]) == 0, "a same-turn tie goes to the lowest row"
    # an already-won space game keeps its victor even if another craft arrives
    keep = mk()
    keep.victory_type[:] = 3
    keep.victory_row[:] = 1
    keep.space_ly[0, 0] = tgt - 1
    keep.step()
    assert int(keep.victory_row[0]) == 1, "a later arrival must not overwrite an existing space victor"

    # --- 3b) SIDE EFFECTS, measured against an identical baseline twin ------
    def force_complete(s: BatchSim, row: int, jj: int, pidx: int) -> None:
        s.city_current[0, row, jj] = s.PROJECT_BASE + pidx
        s.city_cost[0, row, jj] = 1.0
        s.city_progress[0, row, jj] = 1.0e6

    # Launch Earth Satellite: reveals the seat's ENTIRE fog plane — under the
    # same fog gate as every reveal site (a fog-off world accrues nothing).
    fs = mk()
    fs.fog_of_war = True
    assert not bool(fs.seat_explored[0, 1].all()), "the probe needs unexplored tiles to reveal"
    force_complete(fs, 1, 0, space[0][0])
    fs._seat_phase()
    assert bool(fs.seat_explored[0, 1].all()), "Launch Earth Satellite must reveal the whole map"
    assert not bool(fs.seat_explored[0, 0].all()), "…for the LAUNCHING seat only"
    fo = mk()
    fo.fog_of_war = False
    pre_ex = fo.seat_explored[0, 1].clone()
    force_complete(fo, 1, 0, space[0][0])
    fo._seat_phase()
    assert torch.equal(fo.seat_explored[0, 1], pre_ex), "with fog off the reveal is a no-op on both engines"

    # Launch Moon Landing: a one-time Culture lump of js_round(10 x the seat's
    # science/turn) into the pool AND the lifetime bank; Mars Colony: NOTHING.
    base = mk()
    twin = mk()
    mars = mk()
    for s in (base, twin, mars):
        s.city_current[0, 1, 0] = -1
    sci_pre = float(base.seat_science_total[0, 1])
    twin.space_done[0, 1, step_0] = True
    force_complete(twin, 1, 0, space[1][0])
    mars.space_done[0, 1, step_0] = True
    mars.space_done[0, 1, step_1] = True
    force_complete(mars, 1, 0, space[2][0])
    base._seat_phase()
    twin._seat_phase()
    mars._seat_phase()
    sci_turn = float(base.seat_science_total[0, 1]) - sci_pre
    lump = float(twin.civ_culture[0, 1]) - float(base.civ_culture[0, 1])
    want = float(js_round(torch.tensor(10.0 * sci_turn, dtype=torch.float64)))
    assert lump == want, f"Moon Landing culture lump {lump} != js_round(10 x sci/turn) {want} (sci {sci_turn})"
    civic_lump = float(twin.civ_civic_prog[0, 1]) - float(base.civ_civic_prog[0, 1])
    assert civic_lump == want, "the lump is the applyLumpYield culture arm: pool AND lifetime bank"
    for plane in ("civ_culture", "civ_treasury", "civ_faith", "seat_science_total"):
        assert float(getattr(mars, plane)[0, 1]) == float(getattr(base, plane)[0, 1]), \
            f"Launch Mars Colony must pay NOTHING ({plane} moved)"
    assert int(mars.space_ly[0, 1]) == -1, "Mars Colony must not launch anything"

    # a LASER completion counts stations — twice for twice (repeatable), and
    # the two kinds land in DIFFERENT places: the terrestrial one on the city
    # that must power it, the orbital one on the seat.
    lz = mk()
    ter_i = next(i for i, rw in lasers if not int(rw.get("orb", 0)))
    orb_i = next(i for i, rw in lasers if int(rw.get("orb", 0)))
    force_complete(lz, 1, 0, ter_i)
    lz._seat_phase()
    assert int(lz.city_lasers[0, 1, 0]) == 1, "a completed terrestrial station counts on its own city"
    assert int(lz.civ_orbital_lasers[0, 1]) == 0, "the terrestrial one is not the seat's"
    force_complete(lz, 1, 0, ter_i)
    lz._seat_phase()
    assert int(lz.city_lasers[0, 1, 0]) == 2, "laser stations STACK — each completion adds one"
    force_complete(lz, 1, 0, orb_i)
    lz._seat_phase()
    assert int(lz.civ_orbital_lasers[0, 1]) == 1, "the Lagrange station is the seat's, not a city's"
    assert int(lz.city_lasers[0, 1, 0]) == 2, "the orbital completion must not touch the city count"
    assert not bool(lz.space_done[0, 1].any()), "laser rows never enter the one-time ledger"
    # the city's load is 2 stations x 5 Power, and nothing here supplies it
    assert float((lz.city_bldg[0, 1, 0].double() @ lz._b_power)) + 2 * lz._laser_power_load \
        == 2 * lz._laser_power_load, "no building in the capital draws Power this early"
    lz._resolve_seat_power(1)
    assert not bool(lz.city_powered[0, 1, 0]), "10 Power of demand and no supply leaves the city dark"
    assert int(lz._laser_speed(1)[0]) == 1, "only the orbital station speeds the craft while the city is dark"

    # --- 4) the step() recompute preserves a science win --------------------
    #   spaceWon = victoryType 3 takes precedence over the domination/score
    #   recompute, winner and all. A game NOT in a space victory recomputes
    #   normally (running game -> 0 at an early turn).
    for wrow in (0, 1):
        s = mk()
        s.victory_type[:] = 3
        s.victory_row[:] = wrow
        s.step()
        assert int(s.victory_type[0]) == 3, f"recompute must PRESERVE victoryType 3, got {int(s.victory_type[0])}"
        assert int(s.victory_row[0]) == wrow, f"recompute must PRESERVE the victor row {wrow}, got {int(s.victory_row[0])}"
        assert bool(s.game_over[0]), "a science victory ends the game"
    s0 = mk()
    s0.step()  # early turn, no dom, below the turn limit
    assert int(s0.victory_type[0]) == 0 and not bool(s0.game_over[0]), "a running game recomputes to victoryType 0 / not over"

    # --- 5) the flight state rides snapshot/restore (the _MUTABLE contract) --
    s = mk()
    snap = s.snapshot()
    s.space_done[0, 1, 0] = True
    s.space_ly[0, 1] = 7
    s.civ_orbital_lasers[0, 1] = 2
    s.city_lasers[0, 1, 0] = 3
    s.restore(snap)
    assert not bool(s.space_done[0, 1, 0]), "restore must roll space_done back to the snapshot"
    assert int(s.space_ly[0, 1]) == -1 and int(s.civ_orbital_lasers[0, 1]) == 0 \
        and int(s.city_lasers[0, 1, 0]) == 0, \
        "restore must roll the flight state back to the snapshot"

    print("space_race_test OK — Spaceport (flat land, flat 1080), real prices 540/900/1080/1260 (+360 lasers), "
          "the truth table, THE MASK OFFERS IT (tech + launched craft), the reveal/culture/nothing side effects, "
          "launch -> 30 LY flight (+1 per orbital station, +1 per POWERED terrestrial one) -> victoryType 3 on "
          "ARRIVAL, tie to the lowest row, preservation, _MUTABLE round-trip")


if __name__ == "__main__":
    main()
