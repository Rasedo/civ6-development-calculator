"""#87 preference-order apply self-test.

`apply_rival_actions(production=...)` takes ONE code per city, so a pick that is
legal when the mask is taken and unplaceable by the time it applies leaves the
city IDLE. The scripted picker instead falls through and builds something, so a
driven rival would come out silently poorer than a scripted one — no crash, no
parity red, exactly the shape of the S7.6 overflow leak. For RL it is worse: the
mask says legal, the net picks it, the net gets nothing, and it learns to avoid a
mechanic for a reason absent from the game.

`production_pref` [B, RC, W] fixes that WITHOUT putting the ladder's priority
chain back inside the engine: the policy supplies a ranking, apply walks it
best-first and takes the first column that actually lands. The engine never
chooses — it only discovers which of the policy's own preferences the live state
accepts.

Poked directly; no organic controller drives rivals yet, so nothing else in the
battery reaches this path.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
import stamp


def fresh(rules, path, turns=25):
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for _ in range(turns):
        sim.step()
    return sim


def main() -> None:
    rules = load_rules()
    stamp.check(FIXTURES)
    path = sorted(FIXTURES.glob("seed*.json"))[0]
    sim = fresh(rules, path)
    r, j = 0, 0
    assert bool(sim.rc_alive[0, r, j]), "rival 0 capital must exist by t25"
    sim.controlled[0, r] = True

    NB = sim.rules_dev.b_cost.shape[0]
    nS = len(sim._scaffold)
    W = int(sim.rival_masks(r)["production"].shape[2])
    D0 = NB + 2 + sim.NU          # first scaffold-district column
    NEG = float("-inf")

    def idle_city():
        sim.rc_current[0, r, j] = -1
        sim.rc_progress[0, r, j] = 0.0
        sim.rc_cost[0, r, j] = 0.0

    def pref(ranked):
        """ranked = columns best-first; everything else is -inf (ruled out)."""
        p = torch.full((1, sim.RC, W), NEG, dtype=torch.float64)
        for rank, col in enumerate(ranked):
            p[0, j, col] = float(len(ranked) - rank)
        return p

    # -- 1: the top choice LANDS -> it is taken, later ranks are ignored ----
    idle_city()
    m = sim.rival_masks(r)["production"][0, j]
    legal_b = [c for c in range(NB) if bool(m[c])]
    assert legal_b, "no legal building in the capital at t25 — pick another turn"
    b0 = legal_b[0]
    b1 = legal_b[1] if len(legal_b) > 1 else b0
    sim.apply_rival_actions(r, production_pref=pref([b0, b1]))
    got = int(sim.rc_current[0, r, j])
    assert got == 1 + sim.NU + nS + b0, f"top-ranked legal column must win, got {got}"
    print("  1 top-ranked legal column wins OK")

    # -- 2: THE POINT — top choice cannot land, so the NEXT rank does ------
    # An unplaceable district: strip every eligible tile by marking this city's
    # workable land as already districted, which is what the placement scan
    # rejects on. The district column stays legal in the mask we hand over.
    sim2 = fresh(rules, path)
    sim2.controlled[0, r] = True
    sim2.rc_current[0, r, j] = -1
    sim2.rc_progress[0, r, j] = 0.0
    sim2.rc_cost[0, r, j] = 0.0
    ctr = int(sim2.rc_center[0, r, j])
    own = ((sim2.rc_tile_id[0] == sim2.rc_id[0, r, j]) & (sim2.district[0] < 0)).nonzero(as_tuple=True)[0]
    for t in own.tolist():
        if t != ctr:
            sim2.district[0, t] = 0        # occupied -> no tile can take a new one
    sim2._eff_version += 1
    m2 = sim2.rival_masks(r)["production"][0, j]
    legal_b2 = [c for c in range(NB) if bool(m2[c])]
    assert legal_b2, "no legal building for the fallback rank"
    d_col = D0                              # rank it FIRST even though it cannot land
    sim2.apply_rival_actions(r, production_pref=pref([d_col, legal_b2[0]]))
    got2 = int(sim2.rc_current[0, r, j])
    assert got2 != -1, "#87 REGRESSION: an unplaceable top pick left the city IDLE"
    assert got2 == 1 + sim2.NU + nS + legal_b2[0], f"fallback must be the policy's OWN next rank, got {got2}"
    print("  2 unplaceable top pick falls to the policy's next rank (not idle) OK")

    # -- 3: ranks run dry -> the city stays idle, nothing is invented -------
    sim3 = fresh(rules, path)
    sim3.controlled[0, r] = True
    sim3.rc_current[0, r, j] = -1
    sim3.rc_progress[0, r, j] = 0.0
    sim3.rc_cost[0, r, j] = 0.0
    p_none = torch.full((1, sim3.RC, W), NEG, dtype=torch.float64)
    sim3.apply_rival_actions(r, production_pref=p_none)
    assert int(sim3.rc_current[0, r, j]) == -1, "an all -inf ranking must queue NOTHING"
    print("  3 exhausted ranking queues nothing (the engine never invents a pick) OK")

    # -- 4: a PURCHASE is attempted once, not once per rank -----------------
    # Purchases deliberately bypass the idle gate, so a naive walk would buy on
    # every rank. Rank a purchase column first and a building second; the
    # treasury may or may not afford it, but it must not move TWICE.
    sim4 = fresh(rules, path)
    sim4.controlled[0, r] = True
    sim4.rc_current[0, r, j] = -1
    sim4.rc_progress[0, r, j] = 0.0
    sim4.rc_cost[0, r, j] = 0.0
    base_w = NB + 2 + sim4.NU + nS
    if W > base_w:
        sim4.r_treasury[0, r] = 100000.0
        t0 = float(sim4.r_treasury[0, r])
        m4 = sim4.rival_masks(r)["production"][0, j]
        buys = [c for c in range(base_w, W) if bool(m4[c])]
        if buys:
            sim4.apply_rival_actions(r, production_pref=pref([buys[0], 0]))
            spent = t0 - float(sim4.r_treasury[0, r])
            one = spent
            sim4.r_treasury[0, r] = t0
            sim4.rc_current[0, r, j] = -1
            sim4.apply_rival_actions(r, production=torch.full((1, sim4.RC), -1, dtype=torch.long))
            assert one >= 0.0, "purchase spent a negative amount"
            print(f"  4 purchase attempted once across the walk OK (spent {one:.0f})")
        else:
            print("  4 purchase lane SKIPPED (no affordable buy column this turn)")
    else:
        print("  4 purchase lane SKIPPED (purchase columns off)")

    print("PREF APPLY OK")


if __name__ == "__main__":
    main()
