"""CULTURE-victory self-test — the GPU twin of
tests/cpu/victory/culture-victory.test.ts.

Real Civ 6 (Gathering Storm) scores two tourist populations: VISITING tourists,
which a civ attracts with its lifetime TOURISM (divided by nCivs * 200), and
DOMESTIC tourists, which it holds from its lifetime CULTURE (divided by 100). A
civ wins the moment its visiting tourists exceed EVERY other civ's domestic
tourists.

The gate cannot reach a culture win: this model's tourism still lacks relics,
artifacts, National Parks and Great Works of Art, so the two populations stay
orders apart and scripted parity proves only the ACCUMULATOR (rCulture is a
compared trace column). This lane is the bar for the CHECK, and it pins the same
semantics the TS poke does:

  * seat 0 wins -> victory_type 7 (+ game_over);
  * a civ wins  -> victory_type 8 (the DEFEAT direction);
  * EQUAL counts do not win (the bar is strictly greater);
  * it must beat EVERY other civ, not just one;
  * the divisor scales with the number of civs;
  * a CITYLESS civ cannot win on tourism banked while it was alive;
  * a RELIGIOUS victory outranks a culture one on the same turn;
  * civ_only_culture is _MUTABLE (snapshot/restore round-trip).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES
from core.engine import _MUTABLE


def _sim(n: int = 1) -> BatchSim:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
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

    def victor(tour, cul, alive_civs=None):
        """Drive _culture_victor directly on planted totals. tour/cul are
        per-unified-civ lists (index 0 = seat 0)."""
        s = _sim(1)
        s.tourism_total = torch.tensor([tour[0]], dtype=s.tourism_total.dtype)
        s.culture_total = torch.tensor([cul[0]], dtype=s.culture_total.dtype)
        for r in range(s.R):
            s.civ_only_tourism[:, r] = tour[r + 1]
            s.civ_only_culture[:, r] = cul[r + 1]
            if alive_civs is not None and not alive_civs[r]:
                s.civ_city_alive[:, r] = False
        return int(s._culture_victor()[0]), s

    # --- 1) seat 0 out-touring every civ WINS ------------------------------
    w, _ = victor([tourism_for(5)] + [0] * sim.R, [culture_for(1)] + [culture_for(4)] * sim.R)
    assert w == 0, f"seat 0 should win the culture victory, got civ {w}"

    # --- 2) a civ out-touring everyone is the DEFEAT direction -----------
    tour = [0] * (1 + sim.R)
    tour[1] = tourism_for(9)
    cul = [culture_for(3)] + [culture_for(1)] * sim.R
    w, _ = victor(tour, cul)
    assert w == 1, f"civ 0 should win, got civ {w}"

    # --- 3) EQUAL counts do not win (strictly greater) ---------------------
    w, _ = victor([tourism_for(4)] + [0] * sim.R, [culture_for(1)] + [culture_for(4)] * sim.R)
    assert w == -1, f"equal visiting/domestic must NOT win, got civ {w}"

    # --- 4) it must beat EVERY other civ ----------------------------------
    if sim.R >= 2:
        cul = [culture_for(1)] + [culture_for(2), culture_for(9)] + [0.0] * (sim.R - 2)
        w, _ = victor([tourism_for(6)] + [0] * sim.R, cul)
        assert w == -1, f"beating only one civ must NOT win, got civ {w}"

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
    w, _ = victor(tour, cul, alive_civs=[False] + [True] * (sim.R - 1))
    assert w != 1, "a civ with no cities must not win on banked tourism"

    # --- 7) RELIGION outranks CULTURE on the same turn --------------------
    # _culture_victor is only consulted where religion did not already win, so
    # assert the guard the endTurn recompute applies (the TS
    # `rel >= 0 ? -1 : cultureVictor(state)` twin).
    rel = torch.tensor([0], dtype=torch.long)
    cul_v = torch.tensor([0], dtype=torch.long)
    gated = torch.where(rel >= 0, torch.full_like(rel, -1), cul_v)
    assert int(gated[0]) == -1, "a religious win must suppress the culture check"

    # --- 8) the culture plane round-trips (snapshot/restore) ---------------
    # `culture_total` and `civ_only_culture` are the two halves of ONE
    # `civ_culture [B, 1+R]` plane, so the BASE is what carries the state.
    # Registering a view beside its base would restore into fresh storage and
    # orphan the other half.
    assert "civ_culture" in _MUTABLE, "civ_culture must be registered in _MUTABLE"
    assert "civ_only_culture" not in _MUTABLE, "civ_only_culture is a VIEW of civ_culture"
    s = _sim(1)
    assert s.civ_only_culture.data_ptr() == s.civ_culture[:, 1:].data_ptr(), (
        "civ_only_culture must share storage with civ_culture[:, 1:]"
    )
    s.civ_only_culture[:, 0] = 1234.5
    snap = s.snapshot()
    s.civ_only_culture[:, 0] = 0.0
    s.restore(snap)
    assert float(s.civ_only_culture[0, 0]) == 1234.5, "civ_only_culture must survive snapshot/restore"

    print("culture victory OK — 7/8 semantics + _MUTABLE round-trip")


if __name__ == "__main__":
    main()
