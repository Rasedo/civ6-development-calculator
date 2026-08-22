"""The three RESTORED random draws, and the artifact's civilization.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/era_draws_test.py

Scripted parity proves the two engines agree; these pokes prove the RULES,
because the gate reaches each of them only by accident:

  1. `_nth_open` — the shared "k-th open column" pick every restored draw
     goes through. Its TS twin indexes a FILTERED list, so k must count only
     open columns and the answer must be the k-th of THOSE.
  2. `_grant_free_research` — Oxford and the Bolshoi draw AT RANDOM over the
     rows available at that moment, spend exactly one number per grant, and
     spend none where nothing is available.
  3. `_era_inspirations` — Vilnius's suzerain earns one Inspiration from the
     era just entered, and only a suzerain does.
  4. `_dig_at` — the dig records the EVENT's civilization, not the acting
     seat's: a killer's dig at a foreign unit stamps the DEAD unit's seat, and
     a razed outpost stamps the barbarians.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
from core.simbase import BARB_SEAT  # noqa: E402


def build(rules, path, b: int = 3):
    return BatchSim([load_fixture(path) for _ in range(b)], rules, device="cpu", dtype=torch.float64)


def test_nth_open(rules, path) -> None:
    sim = build(rules, path)
    open_m = torch.tensor([
        [False, True, False, True, True],   # open columns 1, 3, 4
        [True, False, False, False, False],  # only column 0
        [False, False, False, False, False],  # nothing open
    ], device=sim.device)
    # the k-th OPEN column for k = 0, 1, 2 -> 1, 3, 4
    for k, want in enumerate((1, 3, 4)):
        rnd = torch.full((3,), (k + 0.5) / 3.0, dtype=torch.float64, device=sim.device)
        got = int(sim._nth_open(open_m, rnd)[0])
        assert got == want, f"draw {k}/3 picked column {got}, want {want}"
    # a draw of exactly 1.0 is impossible (the generator is [0, 1)), but the
    # top of the range must still land on the LAST open column
    top = torch.full((3,), 1.0 - 1e-12, dtype=torch.float64, device=sim.device)
    assert int(sim._nth_open(open_m, top)[0]) == 4
    assert int(sim._nth_open(open_m, top)[1]) == 0
    # a row with nothing open answers 0; its caller is what masks the write
    assert int(sim._nth_open(open_m, top)[2]) == 0
    print("  _nth_open OK: the k-th OPEN column, not the k-th column")


def test_free_research(rules, path) -> None:
    sim = build(rules, path)
    row = 0
    n1 = torch.ones(sim.B, dtype=torch.long, device=sim.device)
    n0 = torch.zeros(sim.B, dtype=torch.long, device=sim.device)

    # ONE free tech: exactly one number off the stream, and the tech taken is
    # one that was AVAILABLE (not merely the first column).
    avail = sim._available_mask(sim.civ_techs[:, row], sim._prereq_t)
    before = sim.rng_state.clone()
    sim._grant_free_research(row, n1, n0)
    assert not bool((sim.rng_state == before).any()), "the free tech drew nothing"
    took = sim.civ_techs[:, row] & avail
    assert int(took.sum()) == sim.B, "the free tech was not one of the available rows"
    assert int(sim.civ_civics[:, row].sum()) == 0, "a free TECH completed a civic"

    # a seat with nothing available spends none of the stream
    sim.civ_techs[:, row, :] = True
    quiet = sim.rng_state.clone()
    sim._grant_free_research(row, n1, n0)
    assert bool((sim.rng_state == quiet).all()), "an exhausted tree still drew"

    # the draw SPREADS: over many grants a row is not always the first column
    sim2 = build(rules, path, b=1)
    seen = set()
    for _ in range(12):
        a = sim2._available_mask(sim2.civ_techs[:, row], sim2._prereq_t)
        first = int(a.long().argmax(dim=1)[0])
        sim2._grant_free_research(row, torch.ones(1, dtype=torch.long, device=sim2.device),
                                  torch.zeros(1, dtype=torch.long, device=sim2.device))
        got = int((sim2.civ_techs[0, row] & a[0]).long().argmax())
        seen.add(got == first)
    assert False in seen, "twelve draws all landed on the first available column"
    print("  _grant_free_research OK: a masked draw, one number per grant")


def test_era_inspirations(rules, path) -> None:
    sim = build(rules, path)
    if sim._suz_c_era < 0 or sim.S == 0:
        raise AssertionError("no eraInspiration perk in the rules — the wire lost it")
    row, cs = 0, 0
    sim.citystate_alive[:, cs] = True
    sim.citystate_suz_code[:, cs] = sim._suz_c_era
    sim.seat_citystate_envoys[:, :, cs] = 0
    sim.seat_citystate_envoys[:, row, cs] = 9
    sim.seat_citystate_met[:, row, cs] = True
    sim._eff_version += 1
    assert bool(sim._suz_effect(row, sim._suz_c_era).all()), "the suzerain contest was not won"

    sim.turn = sim._era_len  # the first era boundary
    era_i = 1
    was = sim.civ_civic_boosted[:, row].clone()
    n_other = [int(sim.civ_civic_boosted[0, r].sum()) for r in range(sim.n_majors)]
    sim._era_inspirations()
    fresh = sim.civ_civic_boosted[:, row] & ~was
    ncv = min(sim.civ_civic_boosted.shape[2], sim._civic_era.numel())
    for b in range(sim.B):
        cols = fresh[b].nonzero().reshape(-1).tolist()
        assert len(cols) == 1, f"game {b}: the suzerain earned {len(cols)} Inspirations, want 1"
        k = cols[0]
        assert k < ncv and int(sim._civic_era[k]) == era_i, (
            f"civic {k} is era {int(sim._civic_era[k])}, not the era just entered ({era_i})")

    # every OTHER row is not the suzerain and earns nothing
    for r in range(sim.n_majors):
        if r == row:
            continue
        assert int(sim.civ_civic_boosted[0, r].sum()) == n_other[r], (
            f"row {r} earned an Inspiration it is not suzerain for")

    # with the whole era already triggered there is nothing to pay, and the
    # shared stream must stay exactly where it is
    sim.civ_civic_boosted[:, row, :ncv] |= (sim._civic_era[:ncv] == era_i).reshape(1, -1)
    quiet = sim.rng_state.clone()
    sim._era_inspirations()
    assert bool((sim.rng_state == quiet).all()), "an unpayable suzerain still drew"
    print("  _era_inspirations OK: one civic of the new era, suzerain only")


def test_dig_civilization(rules, path) -> None:
    sim = build(rules, path)
    # a land tile with nothing on it, so the dig gates all pass
    land = int((~sim.water[0] & (sim.district[0] < 0) & (sim.built_wonder[0] < 0)
                & (sim.centre_slot_at[0] < 0)).nonzero()[0])
    gd = torch.tensor([0], dtype=torch.long, device=sim.device)
    td = torch.tensor([land], dtype=torch.long, device=sim.device)
    victim = torch.tensor([BARB_SEAT], dtype=torch.long, device=sim.device)
    sim._dig_at(gd, td, 0, victim)  # seat 0 kills a BARBARIAN here
    assert bool(sim.antiquity[0, land]), "no dig was stamped"
    assert int(sim.antiquity_seat[0, land]) == BARB_SEAT, \
        f"the dig recorded seat {int(sim.antiquity_seat[0, land])}, not the dead unit's"
    assert int(sim.antiquity_era[0, land]) == int(sim._row_era(0)[0]), \
        "the era is not the ACTING seat's"

    # the water twin, on a hull the barbarians sank: the WRECK is the major's
    sea = int(sim.water[0].nonzero()[0])
    gd2 = torch.tensor([0], dtype=torch.long, device=sim.device)
    td2 = torch.tensor([sea], dtype=torch.long, device=sim.device)
    sim._dig_at(gd2, td2, 0, torch.zeros(1, dtype=torch.long, device=sim.device))
    assert bool(sim.shipwreck[0, sea]), "no wreck was stamped"
    assert int(sim.shipwreck_seat[0, sea]) == 0
    print("  _dig_at OK: the EVENT's civilization, the ACTOR's era")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    p = paths[0]
    print(f"era_draws_test on {p.name}:")
    test_nth_open(rules, p)
    test_free_research(rules, p)
    test_era_inspirations(rules, p)
    test_dig_civilization(rules, p)
    print("ERA_DRAWS OK")


if __name__ == "__main__":
    main()
