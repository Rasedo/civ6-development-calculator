"""Four rules read off the H-1 recordings — the GPU half.

    python tests/gpu/h1_rules_test.py

The TS twins: tests/cpu/culture/dark-policies.test.ts (the game era),
tests/cpu/seats/loyalty-and-conquest.test.ts (the dominance pressure),
tests/cpu/minors/suzerain-channels.test.ts (Vatican City),
tests/cpu/map/disasters.test.ts (the flood home).

  1. a Dark Age card's window reads the GAME era (`game_era`), not the
     seat's own (`_policy_unlocked`; Policies_XP1 MinimumGameEra).
  2. a major culturally dominant over a city's owner presses 25% harder a
     citizen (`_seat_city_loyalty`; 0x1a1640).
  3. Vatican City's suzerain spreads 400 of its religion to every live city
     within 6 of a Great Person's activation plot (`_gp_activated_pressure`).
  4. a plot's floods are its home river's — the first flood list holding it
     (`_flood_home`, `_flood_river`).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

ROW = 0


def build() -> BatchSim:
    return settle_all(BatchSim([load_fixture(fixture_paths()[0])], load_rules(), device="cpu", dtype=torch.float64))


def dark_window(sim: BatchSim) -> None:
    dark = sim._pol_dark_lo >= 0
    assert bool(dark.any()), "no Dark Age card on the wire"
    k = int(dark.nonzero(as_tuple=True)[0][0])
    lo, hi = int(sim._pol_dark_lo[k]), int(sim._pol_dark_hi[k])
    # a government with slots: the civics through the first tier's unlock
    sim.civ_civics[0, ROW, : max(4, int(sim._ngov))] = True
    sim._eff_version += 1
    civ = sim._seat_civics(ROW)
    adopted, has_gov = sim._adopted_gov(ROW)
    assert bool(has_gov[0]), "the seat has no government"
    held = sim.civ_gov_held[:, ROW]
    yes = torch.ones(sim.B, dtype=torch.bool)
    for era in range(0, 9):
        e = torch.full((sim.B,), era, dtype=torch.long)
        got = bool(sim._policy_unlocked(civ, yes, e, held, adopted)[0, k])
        assert got == (lo <= era <= hi), f"card {k} at game era {era}: {got}, window {lo}-{hi}"
        assert not bool(sim._policy_unlocked(civ, ~yes, e, held, adopted)[0, k]), "a dark card outside a Dark Age"
    # the live reader passes the game era
    sim.civ_age[:, ROW] = 0
    sim.game_era[:] = lo
    sim._eff_version += 1
    assert bool(sim._seat_policy_mask(ROW)[0, k]), "the mask did not read the game era"
    sim.game_era[:] = max(0, lo - 1)
    sim._eff_version += 1
    assert not bool(sim._seat_policy_mask(ROW)[0, k]), "the mask opened the card below its window"
    print(f"  1 the dark window OK — card {k} opens at game eras {lo}-{hi} alone")


def dominance(sim: BatchSim) -> None:
    other = 1
    assert sim.n_majors > 1
    # a foreign city 4 from seat 0's capital column
    col = int(sim.city_alive[0, ROW].long().argmax())
    here = int(sim.city_center[0, ROW, col])
    near = [t for t in range(sim.T) if int(sim.pair_dist[here, t]) == 4 and bool(sim.passable[0, t]) and not bool(sim.water[0, t])]
    assert near, "no plot 4 out"
    oc = int((~sim.city_alive[0, other]).long().argmax())
    sim.city_alive[0, other, oc] = True
    sim.city_center[0, other, oc] = near[0]
    sim.city_pop[0, other, oc] = 1
    sim.city_pop[0, ROW, col] = 1
    sim.city_is_cap[0, other, oc] = False
    tier = torch.zeros(sim.B, dtype=torch.long)
    jc = torch.full((sim.B,), col, dtype=torch.long)
    act = torch.ones(sim.B, dtype=torch.bool)
    gov = torch.zeros(sim.B, dtype=torch.bool)

    def delta() -> float:
        keep = sim.city_loyalty.clone()
        sim.city_loyalty[0, ROW, col] = 50.0
        sim._seat_city_loyalty(ROW, jc, act, tier, gov, torch.zeros_like(act))
        d = float(sim.city_loyalty[0, ROW, col]) - 50.0
        sim.city_loyalty.copy_(keep)
        return d

    base = delta()
    sim.civ_dominant[0, other, ROW] = True
    dom = delta()
    sim.civ_dominant[0, ROW, other] = True  # the owner's own dominance is no term
    assert delta() == dom
    sim.civ_dominant[0, ROW, other] = False
    assert dom < base, f"dominance did not press harder: {base} -> {dom}"
    sim.civ_dominant[0, other, ROW] = False
    sim.city_alive[0, other, oc] = False
    print(f"  2 the dominance OK — the term {base:.4f} -> {dom:.4f} under a dominant neighbour")


def vatican(sim: BatchSim) -> None:
    code = sim._suz_c_gp_press
    assert code >= 0, "Vatican City's perk is not on the wire"
    assert sim._vatican_gp_pressure == 400 and sim._theo_range == 6
    col = int(sim.city_alive[0, ROW].long().argmax())
    here = int(sim.city_center[0, ROW, col])
    hc = torch.full((sim.B,), here, dtype=torch.long)
    m = torch.ones(sim.B, dtype=torch.bool)
    sim.civ_religion_done[:, ROW] = True
    before = sim.city_pressure.clone()
    sim._gp_activated_pressure(ROW, m, hc)
    assert torch.equal(sim.city_pressure, before), "a seat with no Vatican suzerainty spread"
    # make seat 0 the suzerain of a minor carrying the perk
    sim._suz_effect_rows = lambda c: torch.ones(sim.B, sim.n_majors, dtype=torch.bool) if c == code \
        else torch.zeros(sim.B, sim.n_majors, dtype=torch.bool)
    sim._gp_activated_pressure(ROW, m, hc)
    d = sim.pair_dist[sim.city_center[0].clamp(min=0).reshape(-1), here].reshape(sim.city_center[0].shape)
    gain = (sim.city_pressure - before)[0, :, :, ROW]
    live = sim.city_alive[0]
    assert torch.equal(gain[live & (d <= 6)], torch.full_like(gain[live & (d <= 6)], 400.0)), "a city within 6 missed the 400"
    assert not bool(gain[~(live & (d <= 6))].any()), "a city past 6 (or none) took pressure"
    del sim._suz_effect_rows
    print(f"  3 Vatican City OK — {int((live & (d <= 6)).sum())} cities within 6 took 400")


def flood_home(sim: BatchSim) -> None:
    fl = sim._flood_lists[0]
    home = sim._flood_home[0]
    for i in range(fl.shape[0]):
        for t in fl[i][fl[i] >= 0].tolist():
            first = next(k for k in range(fl.shape[0]) if bool((fl[k] == t).any()))
            assert int(home[t]) == first, f"plot {t}: home {int(home[t])}, first list {first}"
    print(f"  4 the flood home OK — {int((home >= 0).sum())} plots each on its first list")


def main() -> int:
    sim = build()
    dark_window(sim)
    dominance(sim)
    vatican(sim)
    flood_home(sim)
    print("H1 RULES OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
