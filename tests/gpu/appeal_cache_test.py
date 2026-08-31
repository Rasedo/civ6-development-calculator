"""THE APPEAL CACHE AND WHO OWES IT A VERSION.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/appeal_cache_test.py

`_tile_appeal` is version-cached on `_eff_version` and its docstring promises
that every contributing write bumps it. Two inputs did not, and both are paid
by an actor that arrives MID-GAME rather than at t0:

  * a GOVERNOR's Forestry Management ("Tiles adjacent to unimproved features
    receive +1 Appeal in this city"), which starts paying the turn its
    establishment clock reaches zero, inside `_governor_phase`;
  * a GREAT PERSON's city appeal grant, written into `city_gp_perm` at the
    claim.

A stale plane costs more than the appeal: the Preserve's bands and the Seaside
Resort's gold both read it, so a tile can sit one point below Charming on one
engine and inside it on the other. That is what seed 9053 t243 was.

This pins the CONTRACT, not the arithmetic: after each write, the cached read
must equal a freshly computed one.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0, ROW = 0, 0


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def uncached_appeal(sim) -> torch.Tensor:
    """`_tile_appeal` with the memo forced cold — the value the cached read has
    to match."""
    keep = sim._appeal_cache
    sim._appeal_cache = None
    out = sim._tile_appeal().clone()
    sim._appeal_cache = keep
    return out


def promo_with(sim, channel: str) -> int:
    gp = sim.rules.governor_promotions
    hit = [i for i, p in enumerate(gp) if float(p[channel]) != 0]
    assert len(hit) == 1, f"{channel} is carried by rows {hit}"
    return hit[0]


def a_tile_beside_a_feature(sim, row: int, col: int) -> int:
    """A tile this city owns that stands next to an unimproved feature — what
    Forestry Management pays and the only place the term can show."""
    slot = sim.city_slot_at(row)
    un = sim._unimproved_feature()
    for t in range(sim.T):
        if int(slot[B0, t]) != col:
            continue
        for d in range(6):
            n = int(sim.neigh[t, d])
            if n >= 0 and bool(un[B0, n]):
                return t
    raise AssertionError(f"city ({row}, {col}) owns no tile beside an unimproved feature")


# ---------------------------------------------------------------------------


def test_the_catalog_still_carries_the_term(rules, path) -> None:
    sim = fresh(rules, path)
    assert sim._gov_appeal_any, (
        "no governor promotion carries appealNearFeature — the version bump is "
        "gated on this flag, so the gate would be silently dead")
    p = promo_with(sim, "appealNearFeature")
    assert float(sim._gpromo["appealNearFeature"][p]) == 1.0
    print("  1 catalog OK — Forestry Management carries +1, and the gate is live")


def test_the_establishment_clock_bumps(rules, path) -> None:
    sim = fresh(rules, path)
    p = promo_with(sim, "appealNearFeature")
    g = int(sim._gpromo_gov[p])
    col = int(sim.city_alive[B0, ROW].nonzero(as_tuple=True)[0][0])
    t = a_tile_beside_a_feature(sim, ROW, col)

    before = int(sim._tile_appeal()[B0, t])
    # seated, promoted, and ONE turn short of established: it pays nothing yet
    sim.civ_gov_appointed[B0, ROW, g] = True
    sim.civ_gov_city[B0, ROW, g] = int(sim.city_id[B0, ROW, col])
    sim.civ_gov_promos[B0, ROW, g] = 1 << p
    sim.civ_gov_establish[B0, ROW, g] = 1
    sim._eff_version += 1
    assert int(sim._tile_appeal()[B0, t]) == before, "an establishing governor already paid"

    # the tick that lands it — the write `_governor_phase` owes the cache
    sim._governor_phase(ROW)
    assert int(sim.civ_gov_establish[B0, ROW, g]) == 0, "the clock did not run out"
    got, want = int(sim._tile_appeal()[B0, t]), int(uncached_appeal(sim)[B0, t])
    assert got == want, f"the cached appeal is stale: {got} vs a fresh {want}"
    assert got == before + 1, f"the governor's +1 never arrived ({before} -> {got})"
    print(f"  2 establishment OK — tile {t} appeal {before} -> {got}, cache fresh")


def test_a_quiet_turn_invalidates_nothing(rules, path) -> None:
    sim = fresh(rules, path)
    sim._tile_appeal()
    v = sim._eff_version
    sim._governor_phase(ROW)
    sim._governor_phase(ROW)
    assert sim._eff_version == v, (
        f"a governor phase that changed nothing bumped the version {sim._eff_version - v}x — "
        "the fingerprint gate is not holding")
    print("  3 quiet turn OK — nothing changed, nothing invalidated")


def test_the_great_person_grant_bumps(rules, path) -> None:
    sim = fresh(rules, path)
    if sim._gp_appeal_col < 0:
        print("  4 great person SKIPPED — no city-perm appeal column in this catalog")
        return
    col = int(sim.city_alive[B0, ROW].nonzero(as_tuple=True)[0][0])
    slot = sim.city_slot_at(ROW)
    t = int((slot[B0] == col).nonzero(as_tuple=True)[0][0])
    sim._tile_appeal()
    before = int(sim._tile_appeal()[B0, t])
    # the write the claim makes, without the claim's own machinery
    sim.city_gp_perm[B0, ROW, col, sim._gp_appeal_col] += 1
    sim._eff_version += 1
    got, want = int(sim._tile_appeal()[B0, t]), int(uncached_appeal(sim)[B0, t])
    assert got == want == before + 1, f"the grant read {got}, fresh {want}, was {before}"
    print(f"  4 great person OK — tile {t} appeal {before} -> {got}")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_catalog_still_carries_the_term(rules, path)
    test_the_establishment_clock_bumps(rules, path)
    test_a_quiet_turn_invalidates_nothing(rules, path)
    test_the_great_person_grant_bumps(rules, path)
    print("BATTERY OK appeal_cache")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
