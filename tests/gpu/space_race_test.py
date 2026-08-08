"""Space-race / science-victory self-test.

The GPU space-race chain is GATE-UNREACHABLE: seat 0 never queues projects and
the civ greedy pick always resolves to a base project (RESEARCH_GRANTS wins the
Campus slot ahead of the space rows), so no civ starts the chain under the
scripted policy. These pokes pin the semantics the parity rollout cannot reach
— mirroring tests/cpu/victory/space-victory.test.ts against the GPU tensors
(the occupancy_test / government_test pattern: load rules + a fixture, drive the
GPU BatchSim, assert on its internal state).

Proven here, turn-exact with the TS contract (cpu/data/projects.ts +
production.ts completeProject + the endTurn victoryType recompute):
  * the exported chain: 6 space rows, chain order via rp, single victory
    step, every step tech-gated (rt);
  * a CIV completing the victory step -> victoryType 4 (seat-0 DEFEAT,
    the domination-defeat mirror) + game_over + space_done bookkeeping,
    through the real civ projects path;
  * the endTurn recompute PRESERVES a science win/defeat (3/4) over the
    domination/score result, and leaves a running game untouched;
  * space_done is _MUTABLE (snapshot/restore round-trip).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES
from core.engine import _MUTABLE


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text())
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"

    # --- 1) the exported chain: catalog + gating + sequence ----------------
    rows = rj["projects"]["rows"]
    space = [(i, row) for i, row in enumerate(rows) if int(row.get("sp", 0))]
    assert len(space) == 6, f"expected 6 space-race rows exported, got {len(space)}"
    # space rows sit LAST (chain order) so the civ greedy pick never reaches
    # them (RESEARCH_GRANTS, a base Campus project, wins slot 0 first).
    base_n = len(rows) - 6
    assert [i for i, _ in space] == list(range(base_n, base_n + 6)), "space rows must be the LAST 6 (chain order)"
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
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert sim._n_space == 6, f"_n_space should be 6, got {sim._n_space}"
    assert sim._space_proj_idx == [i for i, _ in space], "_space_proj_idx must match the exported space rows"
    assert sim._space_step == {i: k for k, (i, _) in enumerate(space)}, "chain-step map mismatch"
    assert sim._space_victory_idx == {space[-1][0]}, "victory step index mismatch"
    assert "space_done" in _MUTABLE, "space_done must be registered in _MUTABLE"
    assert sim.space_done.shape == (sim.B, 1 + sim.R, 6), f"space_done shape {tuple(sim.space_done.shape)}"

    # --- 3) a CIV completes the victory step -> victoryType 4 (DEFEAT) ---
    #   Force a live civ capital to hold the EXOPLANET_EXPEDITION project at
    #   full progress, then run the seat phase: the completion path must set
    #   space_done (civ r+1, last step), victoryType 4, and game_over. This is
    #   the production.ts completeProject twin (rc.queue = [EXOPLANET...] in
    #   the TS poke). Civs never SELECT a space row, so plant it directly.
    assert sim.R >= 1, "need at least one civ for the defeat path"
    sim2 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    r, j = 0, 0
    assert bool(sim2.r_alive[0, r]) and bool(sim2.rc_alive[0, r, j]), "civ capital must be alive at turn 0"
    NBc = sim2.rules_dev.b_cost.shape[0]
    pi_exo = space[-1][0]
    exo_code = 1 + sim2.NU + len(sim2._scaffold) + NBc + pi_exo
    sim2.rc_current[0, r, j] = exo_code
    sim2.rc_cost[0, r, j] = 1.0
    sim2.rc_progress[0, r, j] = 1.0e6
    last_step = sim2._space_step[pi_exo]
    sim2._seat_phase()
    assert bool(sim2.space_done[0, r + 1, last_step]), "civ's victory step must land in space_done"
    assert int(sim2.victory_type[0]) == 4, f"a civ completing the race is victoryType 4, got {int(sim2.victory_type[0])}"
    assert bool(sim2.game_over[0]), "the game must be over on a civ science win"

    # --- 4) the endTurn recompute preserves a science win/defeat ----------
    #   game.ts: spaceWon = victoryType in {3,4} takes precedence over the
    #   domination/score recompute. A game NOT in a space victory recomputes
    #   normally (running game -> 0 at an early, sub-limit turn).
    for vt in (3, 4):
        s = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
        s.victory_type[:] = vt
        s.step()
        assert int(s.victory_type[0]) == vt, f"recompute must PRESERVE victoryType {vt}, got {int(s.victory_type[0])}"
        assert bool(s.game_over[0]), f"a science victory ({vt}) ends the game"
    s0 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    s0.step()  # early turn, no dom, below the turn limit
    assert int(s0.victory_type[0]) == 0 and not bool(s0.game_over[0]), "a running game recomputes to victoryType 0 / not over"

    # --- 5) space_done rides snapshot/restore (the _MUTABLE contract) ------
    s = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    snap = s.snapshot()
    s.space_done[0, 1, 0] = True
    assert bool(s.space_done[0, 1, 0]), "mutation applied"
    s.restore(snap)
    assert not bool(s.space_done[0, 1, 0]), "restore must roll space_done back to the snapshot"

    print("space_race_test OK — chain export/gating/sequence, civ victoryType 4, endTurn 3/4 preservation, _MUTABLE round-trip")


if __name__ == "__main__":
    main()
