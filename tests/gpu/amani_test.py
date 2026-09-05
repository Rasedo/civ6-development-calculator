"""THE GOVERNOR AT A CITY-STATE — the GPU half of Amani's posting.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/amani_test.py

The TS twin is tests/cpu/minors/amani.test.ts.

CIV6 (Amani, the Diplomat): "Can be assigned to a City-state, where she acts as
2 Envoys" (Messenger); "While established in a city-state, provides a copy of
its Luxury resources to you" (Affluence); "While established in a city-state,
doubles the number of Envoys you have there" (Puppeteer).

Proven here:
  * the catalog sends exactly one governor abroad, and `_governor_post_minor`
    picks the met, live minor this seat already has the most envoys at;
  * an unestablished posting pays nothing and its clock runs down abroad;
  * `_envoys_here` adds her two and Puppeteer doubles what she is part of,
    leaving the STORE and every other minor alone;
  * both halves of the suzerain contest weigh the effective count;
  * Affluence copies the minor's own ground into `_luxury_amenities`;
  * a neutralized governor and a conquered minor both send her home.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu",
                               dtype=torch.float64))


def post(sim, row: int, g: int, s: int, promos: int = 0) -> None:
    """Appoint her by hand and post her — the phase's own choice is checked on
    its own, and every ability check wants her already established."""
    sim.civ_gov_appointed[0, row, g] = True
    sim.civ_gov_minor[0, row, g] = s
    sim.civ_gov_establish[0, row, g] = 0
    sim.civ_gov_promos[0, row, g] = promos


def main() -> int:
    rules = load_rules()
    paths = fixture_paths()
    b, row, foe = 0, 0, 1

    sim = fresh(rules, paths[0])
    assert sim.S >= 2, "the checks below need two minors"
    assert sim.n_governors > 0
    travellers = [g for g in range(sim.n_governors) if bool(sim._gov_minor_ok[g])]
    assert len(travellers) == 1, f"one governor travels, the catalog names {travellers}"
    AMANI = travellers[0]
    gp = rules.governor_promotions
    PUPPET = next(i for i, p in enumerate(gp) if float(p["envoyDoubleAtMinor"]) > 0)
    AFFLU = next(i for i, p in enumerate(gp) if float(p["minorLuxuries"]) > 0)
    MESS = next(i for i, p in enumerate(gp) if float(p["envoysAtMinor"]) > 0)
    assert int(sim._gov_base_promo[AMANI]) == MESS, (
        "Messenger is Amani's DEFAULT — the posting itself must pay her two envoys")
    print(f"  0 the catalog sends governor {AMANI} abroad; Messenger is row {MESS}")

    # --- 1) the phase's own choice ------------------------------------------
    s1 = fresh(rules, paths[0])
    s1.seat_citystate_envoys[b, row, :s1.S] = 0
    s1.seat_citystate_envoys[b, row, 0] = 1
    s1.seat_citystate_envoys[b, row, 1] = 4
    s1.seat_citystate_met[b, row, :s1.S] = True
    s1.civ_gov_appointed[b, row, :] = True
    s1.civ_gov_city[b, row, :] = -1
    s1._governor_post_minor(row, torch.ones(s1.B, dtype=torch.bool))
    assert int(s1.civ_gov_minor[b, row, AMANI]) == 1, (
        f"she went to minor {int(s1.civ_gov_minor[b, row, AMANI])}, not the one with 4 envoys")
    assert int(s1.civ_gov_establish[b, row, AMANI]) == int(s1._gov_establish[AMANI])
    for g in range(s1.n_governors):
        if g != AMANI:
            assert int(s1.civ_gov_minor[b, row, g]) == -1, f"governor {g} travelled"
    # an UNMET minor is no candidate
    s2 = fresh(rules, paths[0])
    s2.seat_citystate_met[b, row, :s2.S] = False
    s2.civ_gov_appointed[b, row, AMANI] = True
    s2.civ_gov_city[b, row, AMANI] = -1
    s2._governor_post_minor(row, torch.ones(s2.B, dtype=torch.bool))
    assert int(s2.civ_gov_minor[b, row, AMANI]) == -1, "she went to a minor nobody has met"
    print("  1 the posting takes the met minor with the most envoys, and no other governor")

    # --- 2) the clock, and what an unestablished posting pays -----------------
    s3 = fresh(rules, paths[0])
    s3.seat_citystate_envoys[b, row, 0] = 1
    post(s3, row, AMANI, 0)
    s3.civ_gov_establish[b, row, AMANI] = 2
    assert int(s3._envoys_here(row)[b, 0]) == 1, "an establishing posting counts for nothing"
    s3._governor_tick(row, s3.civ_alive[:, row] & s3.city_alive[:, row].any(dim=1))
    assert int(s3.civ_gov_establish[b, row, AMANI]) == 1, "the clock must run abroad"
    s3._governor_tick(row, s3.civ_alive[:, row] & s3.city_alive[:, row].any(dim=1))
    assert int(s3.civ_gov_establish[b, row, AMANI]) == 0
    assert int(s3._envoys_here(row)[b, 0]) == 3, "and now Messenger counts"
    print("  2 the establishment clock runs abroad and gates the ability")

    # --- 3) Messenger and Puppeteer ------------------------------------------
    s4 = fresh(rules, paths[0])
    s4.seat_citystate_envoys[b, row, :s4.S] = 0
    s4.seat_citystate_envoys[b, row, 0] = 1
    s4.seat_citystate_envoys[b, row, 1] = 1
    post(s4, row, AMANI, 0)
    assert int(s4.seat_citystate_envoys[b, row, 0]) == 1, "the STORE is untouched"
    assert int(s4._envoys_here(row)[b, 0]) == 3, "1 + her two"
    assert int(s4._envoys_here(row)[b, 1]) == 1, "and nowhere else"
    s4.civ_gov_promos[b, row, AMANI] = 1 << PUPPET
    assert int(s4._envoys_here(row)[b, 0]) == 6, "(1 + 2) doubled — she is part of the number"
    assert int(s4._envoys_here(foe)[b, 0]) == int(s4.seat_citystate_envoys[b, foe, 0]), (
        "a rival's count is its own")
    print("  3 Messenger's two and Puppeteer's doubling, on that minor alone")

    # --- 4) both halves of the suzerain contest ------------------------------
    s5 = fresh(rules, paths[0])
    suz_min = int(s5.rules.citystate.get("suzerainEnvoys", 3))
    s5.seat_citystate_envoys[b, :, :s5.S] = 0
    s5.seat_citystate_envoys[b, row, 0] = 1
    s5.seat_citystate_envoys[b, foe, 0] = 2
    s5._cs_resolve_suzerain()
    assert int(s5.citystate_suzerain[b, 0]) == -1, "2 leads but is under the bar"
    assert not bool(s5._suzerain_mask(row)[b, 0])
    post(s5, row, AMANI, 0)
    assert int(s5._envoys_here(row)[b, 0]) == suz_min
    s5._cs_resolve_suzerain()
    assert int(s5.citystate_suzerain[b, 0]) == row, (
        f"her envoys must win it: stored {int(s5.citystate_suzerain[b, 0])}")
    assert bool(s5._suzerain_mask(row)[b, 0]), "and the live contest must agree"
    assert not bool(s5._suzerain_mask(foe)[b, 0])
    print("  4 the stored suzerain and the live contest both weigh her envoys")

    # --- 5) Affluence copies the minor's own ground ---------------------------
    s6 = fresh(rules, paths[0])
    cols = s6.RC
    have = torch.zeros(s6.B, cols, dtype=torch.float64)
    need = torch.full((s6.B, cols), 6.0, dtype=torch.float64)
    lux_t = [t for t in range(s6.T) if int(s6.tile_seat[b, t]) == 100
             and int(s6.lux_id[b, t]) >= 0]
    if not lux_t:
        # plant one on the minor's own ground so the clause is not vacuous
        lux_t = [t for t in range(s6.T) if int(s6.tile_seat[b, t]) == 100]
        assert lux_t, "minor 0 owns no ground"
        s6.lux_id[b, lux_t[0]] = 0
        s6._eff_version += 1
    seen = int(s6.lux_id[b, lux_t[0]])
    mine = ((s6.lux_id == seen) & (s6.tile_seat == row)
            & (s6.improvement == s6.lux_req))
    assert not bool(mine[b].any()), "the seat already works this luxury — the check is vacuous"
    before = float(s6._luxury_amenities(row, have, need).sum())
    post(s6, row, AMANI, 0)
    assert float(s6._luxury_amenities(row, have, need).sum()) == before, (
        "Messenger alone copies nothing")
    s6.civ_gov_promos[b, row, AMANI] = 1 << AFFLU
    after = float(s6._luxury_amenities(row, have, need).sum())
    assert after > before, f"Affluence paid nothing ({before} -> {after})"
    # ...and a neutralized governor takes the copy home with her
    s6.neutralize_governor(b, row, AMANI, 6)
    assert int(s6.civ_gov_minor[b, row, AMANI]) == -1, "neutralize must clear the posting"
    assert float(s6._luxury_amenities(row, have, need).sum()) == before
    print(f"  5 Affluence copies the ground ({before} -> {after}), and leaves with her")

    # --- 6) a conquered minor sends her home ---------------------------------
    s7 = fresh(rules, paths[0])
    post(s7, row, AMANI, 0)
    s7.citystate_alive[b, 0] = False
    s7._governor_tick(row, s7.civ_alive[:, row] & s7.city_alive[:, row].any(dim=1))
    assert int(s7.civ_gov_minor[b, row, AMANI]) == -1, "a dead minor keeps its governor"
    assert int(s7.civ_gov_establish[b, row, AMANI]) == 0
    # and a posted governor is never handed a city as well
    s8 = fresh(rules, paths[0])
    post(s8, row, AMANI, 0)
    s8.civ_gov_city[b, row, AMANI] = -1
    s8._governor_seat(row, torch.ones(s8.B, dtype=torch.bool))
    assert int(s8.civ_gov_city[b, row, AMANI]) == -1, "she took a city while posted abroad"
    print("  6 a conquered minor sends her home, and a posting takes no city")

    print("BATTERY OK amani")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
