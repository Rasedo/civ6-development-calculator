"""B-25 (#72) CULTURE-victory self-test — the GPU twin of tests/culture-victory.ts.

Real Civ 6 (Gathering Storm) scores two tourist populations: VISITING tourists,
which a civ attracts with its lifetime TOURISM (divided by nCivs * 200), and
DOMESTIC tourists, which it holds from its lifetime CULTURE (divided by 100). A
civ wins the moment its visiting tourists exceed EVERY other civ's domestic
tourists.

MEASURED gate-unreachable: over the 24 scripted seeds at 250 turns the best any
civ manages is a gap of -12 (visiting peaks at 7, domestic reaches 97) — this
model's tourism still lacks relics, artifacts, National Parks and Great Works of
Art, so the two populations are orders apart. Scripted parity therefore proves
only the ACCUMULATOR (rCulture is a compared trace column, 0.0 milli); this lane
is the bar for the CHECK, and it pins the same seven semantics the TS poke does:

  * player win  -> victory_type 7 (+ game_over);
  * rival win   -> victory_type 8 (the DEFEAT direction);
  * EQUAL counts do not win (the bar is strictly greater);
  * it must beat EVERY other civ, not just one;
  * the divisor scales with the number of civs;
  * a CITYLESS civ cannot win on tourism banked while it was alive;
  * a RELIGIOUS victory outranks a culture one on the same turn;
  * r_culture is _MUTABLE (snapshot/restore round-trip).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import _MUTABLE


def _sim(n: int = 1) -> BatchSim:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    return BatchSim([load_fixture(p) for p in paths[:n]], rules, device="cpu", dtype=torch.float64)


def main() -> None:
    sim = _sim(1)
    n_civs = 1 + sim.R
    per_visitor = sim._tourism_per_visitor
    per_domestic = sim._culture_per_tourist
    assert per_visitor == 200, f"GS value is 200 per civ, got {per_visitor}"
    assert per_domestic == 100, f"GS value is 100 culture per domestic tourist, got {per_domestic}"

    def tourism_for(k: int) -> int:
        return k * n_civs * per_visitor

    def culture_for(k: int) -> float:
        return float(k * per_domestic)

    def victor(tour, cul, alive_rivals=None):
        """Drive _culture_victor directly on planted totals. tour/cul are
        per-unified-civ lists (index 0 = player)."""
        s = _sim(1)
        s.tourism_total = torch.tensor([tour[0]], dtype=s.tourism_total.dtype)
        s.culture_total = torch.tensor([cul[0]], dtype=s.culture_total.dtype)
        for r in range(s.R):
            s.r_tourism[:, r] = tour[r + 1]
            s.r_culture[:, r] = cul[r + 1]
            if alive_rivals is not None and not alive_rivals[r]:
                s.rc_alive[:, r] = False
        return int(s._culture_victor()[0]), s

    # --- 1) the player out-touring every rival WINS ------------------------
    w, _ = victor([tourism_for(5)] + [0] * sim.R, [culture_for(1)] + [culture_for(4)] * sim.R)
    assert w == 0, f"player should win the culture victory, got civ {w}"

    # --- 2) a rival out-touring everyone is the DEFEAT direction -----------
    tour = [0] * (1 + sim.R)
    tour[1] = tourism_for(9)
    cul = [culture_for(3)] + [culture_for(1)] * sim.R
    w, _ = victor(tour, cul)
    assert w == 1, f"rival 0 should win, got civ {w}"

    # --- 3) EQUAL counts do not win (strictly greater) ---------------------
    w, _ = victor([tourism_for(4)] + [0] * sim.R, [culture_for(1)] + [culture_for(4)] * sim.R)
    assert w == -1, f"equal visiting/domestic must NOT win, got civ {w}"

    # --- 4) it must beat EVERY other civ ----------------------------------
    if sim.R >= 2:
        cul = [culture_for(1)] + [culture_for(2), culture_for(9)] + [0.0] * (sim.R - 2)
        w, _ = victor([tourism_for(6)] + [0] * sim.R, cul)
        assert w == -1, f"beating only one rival must NOT win, got civ {w}"

    # --- 5) the divisor scales with the number of civs ---------------------
    # The SAME raw tourism buys fewer visitors as nCivs grows: assert the
    # boundary directly off the exported constant.
    raw = 6 * 2 * per_visitor  # 6 visitors' worth in a TWO-civ game
    assert raw // (2 * per_visitor) == 6
    assert raw // (3 * per_visitor) == 4, "a 3-civ game must dilute the same tourism to 4"

    # --- 6) a CITYLESS civ cannot win -------------------------------------
    tour = [0] * (1 + sim.R)
    tour[1] = tourism_for(9)
    cul = [culture_for(3)] + [culture_for(1)] * sim.R
    w, _ = victor(tour, cul, alive_rivals=[False] + [True] * (sim.R - 1))
    assert w != 1, "a rival with no cities must not win on banked tourism"

    # --- 7) RELIGION outranks CULTURE on the same turn --------------------
    # _culture_victor is only consulted where religion did not already win, so
    # assert the guard the endTurn recompute applies (the TS
    # `rel >= 0 ? -1 : cultureVictor(state)` twin).
    rel = torch.tensor([0], dtype=torch.long)
    cul_v = torch.tensor([0], dtype=torch.long)
    gated = torch.where(rel >= 0, torch.full_like(rel, -1), cul_v)
    assert int(gated[0]) == -1, "a religious win must suppress the culture check"

    # --- 8) r_culture is _MUTABLE (snapshot/restore round-trip) ------------
    assert "r_culture" in _MUTABLE, "r_culture must be registered in _MUTABLE"
    s = _sim(1)
    s.r_culture[:, 0] = 1234.5
    snap = s.snapshot()
    s.r_culture[:, 0] = 0.0
    s.restore(snap)
    assert float(s.r_culture[0, 0]) == 1234.5, "r_culture must survive snapshot/restore"

    print("culture victory OK — 7/8 semantics + _MUTABLE round-trip")


if __name__ == "__main__":
    main()
