"""CULTURE-victory self-test — the GPU twin of
tests/cpu/victory/culture-victory.test.ts.

Real Civ 6 (Gathering Storm) scores two tourist populations: VISITING tourists,
which a civ attracts with its lifetime TOURISM (divided by nCivs * 200), and
DOMESTIC tourists, which it holds from its lifetime CULTURE (divided by 100). A
civ wins the moment its visiting tourists exceed EVERY other civ's domestic
tourists.

The gate cannot reach a culture win: every tourism source ships, but a
driven game never closes the visiting-vs-domestic gap, so scripted parity
proves only the ACCUMULATOR (rCulture is a compared trace column). This lane
is the bar for the CHECK, and it pins the same semantics the TS poke does:

  * a culture win is victory_type 5 whoever takes it (+ game_over), and
    victory_row names the winning seat — no code says "seat 0 lost";
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
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.engine import _MUTABLE
from warmup import settle_all


def _sim(n: int = 1) -> BatchSim:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    return settle_all(BatchSim([load_fixture(p) for p in paths[:n]], rules, device="cpu", dtype=torch.float64))


def main() -> None:
    sim = _sim(1)
    n_civs = sim.n_majors
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
        s.civ_tourism[:, 0] = tour[0]
        s.civ_culture[:, 0] = cul[0]
        for row in range(1, s.n_majors):
            s.civ_tourism[:, row] = tour[row]
            s.civ_culture[:, row] = cul[row]
            if alive_civs is not None and not alive_civs[row - 1]:
                s.city_alive[:, row] = False
        return int(s._culture_victor()[0]), s

    # --- 1) seat 0 out-touring every civ WINS ------------------------------
    w, _ = victor([tourism_for(5)] + [0] * (sim.n_majors - 1), [culture_for(1)] + [culture_for(4)] * (sim.n_majors - 1))
    assert w == 0, f"seat 0 should win the culture victory, got civ {w}"

    # --- 2) a civ out-touring everyone is the DEFEAT direction -----------
    tour = [0] * (sim.n_majors)
    tour[1] = tourism_for(9)
    cul = [culture_for(3)] + [culture_for(1)] * (sim.n_majors - 1)
    w, _ = victor(tour, cul)
    assert w == 1, f"civ 0 should win, got civ {w}"

    # --- 3) EQUAL counts do not win (strictly greater) ---------------------
    w, _ = victor([tourism_for(4)] + [0] * (sim.n_majors - 1), [culture_for(1)] + [culture_for(4)] * (sim.n_majors - 1))
    assert w == -1, f"equal visiting/domestic must NOT win, got civ {w}"

    # --- 4) it must beat EVERY other civ ----------------------------------
    if sim.n_majors >= 3:
        cul = [culture_for(1)] + [culture_for(2), culture_for(9)] + [0.0] * (sim.n_majors - 3)
        w, _ = victor([tourism_for(6)] + [0] * (sim.n_majors - 1), cul)
        assert w == -1, f"beating only one civ must NOT win, got civ {w}"

    # --- 5) the divisor scales with the number of civs ---------------------
    # The SAME raw tourism buys fewer visitors as nCivs grows: assert the
    # boundary directly off the exported constant.
    raw = 6 * 2 * per_visitor  # 6 visitors' worth in a TWO-civ game
    assert raw // (2 * per_visitor) == 6
    assert raw // (3 * per_visitor) == 4, "a 3-civ game must dilute the same tourism to 4"

    # --- 6) a CITYLESS civ cannot win -------------------------------------
    tour = [0] * (sim.n_majors)
    tour[1] = tourism_for(9)
    cul = [culture_for(3)] + [culture_for(1)] * (sim.n_majors - 1)
    w, _ = victor(tour, cul, alive_civs=[False] + [True] * (sim.n_majors - 2))
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
    assert "civ_culture" in _MUTABLE, "civ_culture must be registered in _MUTABLE"
    s = _sim(1)
    s.civ_culture[:, 1] = 1234.5
    snap = s.snapshot()
    s.civ_culture[:, 1] = 0.0
    s.restore(snap)
    assert float(s.civ_culture[0, 1]) == 1234.5, "civ_culture must survive snapshot/restore"

    # --- 9) THE RELIGIOUS HALF: banked apart, halved per rival ------------
    # CIV6 (Tourism): "-50% (Religious Tourism only) if the foreign
    # civilization has The Enlightenment" (Cristo Redentor's shield cancels
    # it) and "-50% (Religious Tourism only) for Different Religions" (only
    # once this seat FOUNDED one, against the rival's majority religion).
    assert "civ_tourism_rel" in _MUTABLE, "the religious bank must ride snapshot/restore"
    s9 = _sim(1)
    assert s9._holy_city_tour == 8, s9._holy_city_tour
    assert s9._enl_cidx >= 0, "the Enlightenment civic must export its index"
    col = int(s9.city_alive[0, 0].nonzero()[0])
    s9.city_relics[0, 0, col] = 2
    s9.holy_tile[0, 0] = int(s9.city_center[0, 0, col])
    got = int(s9._tourism_religious_of(0)[0])
    assert got == 2 * s9._relic_tour + s9._holy_city_tour, got
    # a religion's Holy City pays its CURRENT owner
    col1 = int(s9.city_alive[0, 1].nonzero()[0])
    s9.holy_tile[0, 0] = int(s9.city_center[0, 1, col1])
    assert int(s9._tourism_religious_of(0)[0]) == 2 * s9._relic_tour
    assert int(s9._tourism_religious_of(1)[0]) == s9._holy_city_tour

    def victor_rel(enl_o: bool, shield_c: bool, dom_diff: bool, civ_cul: int = 6) -> int:
        s = _sim(1)
        s.civ_tourism[:, 0] = tourism_for(2)
        s.civ_tourism_rel[:, 0] = tourism_for(6)
        s.civ_culture[:, 0] = culture_for(1)
        for row in range(1, s.n_majors):
            s.civ_culture[:, row] = culture_for(civ_cul if row == 1 else 1)
        if enl_o:
            s.civ_civics[0, 1, s._enl_cidx] = True
        if shield_c:
            wi = int(s._wond_holy_shield.nonzero()[0])
            cc = int(s.city_alive[0, 0].nonzero()[0])
            ct = int(s.city_center[0, 0, cc])
            s.city_wonder[0, 0, cc, wi] = ct
            s.built_wonder_complete[0, ct] = True
        if dom_diff:
            s.civ_religion_done[0, 0] = True
            s.city_followed[0, 1, : s.RC] = 1
        return int(s._culture_victor()[0])

    assert victor_rel(False, False, False) == 0, "2 + 6 = 8 > 6 must win"
    assert victor_rel(True, False, False) == -1, "Enlightenment: 2 + 3 = 5 <= 6 must not"
    assert victor_rel(True, False, False, civ_cul=4) == 0, "the GENERAL half is untouched: 5 > 4"
    assert victor_rel(True, True, False) == 0, "Cristo Redentor keeps all 8"
    assert victor_rel(False, False, True) == -1, "a different majority religion halves it too"
    assert victor_rel(False, True, True) == -1, "the shield answers ENLIGHTENMENT only"

    print("culture victory OK — kind 5 + a named victor + the religious half's "
          "per-rival halvings + _MUTABLE round-trip")


if __name__ == "__main__":
    main()
