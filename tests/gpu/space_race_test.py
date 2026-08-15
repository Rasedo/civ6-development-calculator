"""Space-race / science-victory self-test.

The chain is GATE-UNREACHABLE: it needs Information- and Future-era techs no
250-turn lane comes close to, so nothing in the battery ever queues a space
project. These pokes are the only proof the mechanic works — mirroring
tests/cpu/victory/space-victory.test.ts against the GPU tensors.

Proven here, turn-exact with the TS contract (cpu/data/projects.ts +
`availableProjects` + `completeProject` + the endTurn victoryType recompute):
  * the exported chain: 4 space rows, chain order via rp, single victory step,
    every step tech-gated (rt);
  * `_space_step_ok`'s truth table — the `availableProjects` space arm: a step
    needs its tech, needs its predecessor DONE, and is refused once it is in
    the ledger (these are one-time);
  * THE MASK OFFERS IT. This is what the mechanic was missing: the ledger, the
    completion write and the victory fire were all live, but the production
    mask skipped every space row, so no seat could ever queue one and the
    science victory had no action that expressed it;
  * a seat completing the victory step -> victoryType 3 + victory_row + the
    ledger write, through the real projects path;
  * the endTurn recompute PRESERVES a science result over the domination/score
    one, and leaves a running game untouched;
  * space_done is _MUTABLE (snapshot/restore round-trip).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from core.engine import _MUTABLE
from warmup import settle_all


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text())
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"

    # --- 1) the exported chain: catalog + gating + sequence ----------------
    rows = rj["projects"]["rows"]
    space = [(i, row) for i, row in enumerate(rows) if int(row.get("sp", 0))]
    assert len(space) == 4, f"expected 4 space-race rows exported, got {len(space)}"
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

    # --- 2) engine metadata mirrors the exported chain ---------------------
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    assert sim._n_space == 4, f"_n_space should be 4, got {sim._n_space}"
    assert sim._space_proj_idx == [i for i, _ in space], "_space_proj_idx must match the exported space rows"
    assert sim._space_step == {i: k for k, (i, _) in enumerate(space)}, "chain-step map mismatch"
    assert sim._space_victory_idx == {space[-1][0]}, "victory step index mismatch"
    assert "space_done" in _MUTABLE, "space_done must be registered in _MUTABLE"
    assert sim.space_done.shape == (sim.B, sim.n_majors, 4), f"space_done shape {tuple(sim.space_done.shape)}"

    # --- 2b) _space_step_ok — the `availableProjects` space arm, term by term
    #   Step 2 (Moon Landing) is the useful probe: it has both a tech gate and
    #   a predecessor, so all four states of the truth table are reachable.
    gk = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
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

    # --- 2c) THE MASK OFFERS THE CHAIN ------------------------------------
    #   The whole mechanic hung on this: every other piece was live, but the
    #   mask skipped space rows, so the column was never legal and nothing
    #   could reach the completion path.
    mk = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    mrow, mj = 1, 0
    assert bool(mk.city_alive[0, mrow, mj]), "need a live city to hold the project"
    di_camp = int(space[0][1]["d"])
    t_camp = int(mk.city_center[0, mrow, mj])
    mk.city_dist_tile[0, mrow, mj, di_camp] = t_camp
    mk.district_complete[0, t_camp] = True
    mk.city_current[0, mrow, mj] = -1          # idle, or no column is legal
    col_0 = mk.PROJECT_BASE + space[0][0]
    mk.civ_techs[0, mrow, int(space[0][1]["rt"])] = False
    assert not bool(mk.seat_masks(mrow)["production"][0, mj, col_0]), "step 1 without its tech must be illegal"
    mk.civ_techs[0, mrow, int(space[0][1]["rt"])] = True
    assert bool(mk.seat_masks(mrow)["production"][0, mj, col_0]), "step 1 with Rocketry and a complete Campus MUST be offered"
    mk.space_done[0, mrow, mk._space_step[space[0][0]]] = True
    assert not bool(mk.seat_masks(mrow)["production"][0, mj, col_0]), "a completed step must leave the mask"
    col_1 = mk.PROJECT_BASE + space[1][0]
    mk.civ_techs[0, mrow, int(space[1][1]["rt"])] = True
    assert bool(mk.seat_masks(mrow)["production"][0, mj, col_1]), "finishing step 1 must open step 2"

    # --- 3) completing the victory step -> victoryType 3, won by that seat ---
    #   Force a live capital to hold EXOPLANET_EXPEDITION at full progress, then
    #   run the seat phase: the completion path must set space_done (that row,
    #   last step), victoryType 3, victory_row and game_over. The
    #   `completeProject` twin, and the outcome code names the WINNER whoever
    #   it is — no seat has an outcome of its own.
    assert sim.n_majors >= 2, "need a second major to prove the outcome is not seat 0's"
    sim2 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    r, j = 0, 0
    assert bool(sim2.civ_alive[0, r + 1]) and bool(sim2.city_alive[0, r + 1, j]), "civ capital must be alive at turn 0"
    pi_exo = space[-1][0]
    exo_code = sim2.PROJECT_BASE + pi_exo
    sim2.city_current[0, r + 1, j] = exo_code
    sim2.city_cost[0, r + 1, j] = 1.0
    sim2.city_progress[0, r + 1, j] = 1.0e6
    last_step = sim2._space_step[pi_exo]
    sim2._seat_phase()
    assert bool(sim2.space_done[0, r + 1, last_step]), "civ's victory step must land in space_done"
    assert int(sim2.victory_type[0]) == 3, f"a science win is victoryType 3 whoever flies it, got {int(sim2.victory_type[0])}"
    assert int(sim2.victory_row[0]) == r + 1, f"victoryRow must name the seat that launched, got {int(sim2.victory_row[0])}"
    assert bool(sim2.game_over[0]), "the game must be over on a civ science win"

    # --- 4) the endTurn recompute preserves a science win -----------------
    #   game.ts: spaceWon = victoryType 3 takes precedence over the
    #   domination/score recompute, winner and all. A game NOT in a space
    #   victory recomputes normally (running game -> 0 at an early turn).
    for wrow in (0, 1):
        s = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
        s.victory_type[:] = 3
        s.victory_row[:] = wrow
        s.step()
        assert int(s.victory_type[0]) == 3, f"recompute must PRESERVE victoryType 3, got {int(s.victory_type[0])}"
        assert int(s.victory_row[0]) == wrow, f"recompute must PRESERVE the victor row {wrow}, got {int(s.victory_row[0])}"
        assert bool(s.game_over[0]), "a science victory ends the game"
    s0 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    s0.step()  # early turn, no dom, below the turn limit
    assert int(s0.victory_type[0]) == 0 and not bool(s0.game_over[0]), "a running game recomputes to victoryType 0 / not over"

    # --- 5) space_done rides snapshot/restore (the _MUTABLE contract) ------
    s = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    snap = s.snapshot()
    s.space_done[0, 1, 0] = True
    assert bool(s.space_done[0, 1, 0]), "mutation applied"
    s.restore(snap)
    assert not bool(s.space_done[0, 1, 0]), "restore must roll space_done back to the snapshot"

    print("space_race_test OK — 4-step chain, _space_step_ok truth table, THE MASK OFFERS IT, "
          "victoryType 3 by the launching seat, endTurn preservation, _MUTABLE round-trip")


if __name__ == "__main__":
    main()
