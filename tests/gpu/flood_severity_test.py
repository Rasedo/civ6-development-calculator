"""The flood's SEVERITY LADDER, poked one column at a time.

    python tests/gpu/flood_severity_test.py

CIV 6 (Gathering Storm): a flood "damages or destroys Districts, improvements,
and units on the Floodplains tiles near the River. This may also include a City
Center, in which case it loses some HP and Defenses... May kill some Citizens in
a nearby city... Can fertilize affected tiles." The severity decides every
magnitude; a Dam or Great Bath along the river cancels the damage half for
every tile that river floods and halves the silt.

Disasters are off in most fixtures and the flood picks one tile out of every
floodplain on the map, so the driven gate reaches this at a rate no run can be
counted on for — the lane pokes the phase directly.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

N = 400


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(p) for p in fixture_paths()[:1]],
                              rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    return sim


def floodplain(sim) -> int:
    tiles = [t for t in range(sim.T)
             if bool(sim.floodplain[0, t]) and int(sim.centre_slot_at[0, t]) < 0]
    assert tiles, "fixture has no non-centre floodplain tile"
    return tiles[0]


def solo(sim, t: int) -> None:
    """Make `t` the ONLY floodplain the picker can reach AND the only one its
    river reaches, so a flood driven through the whole disaster phase lands
    where the assertions read. The reach itself is poke `f`."""
    idx, cnt = sim._flood_list
    idx[0, :] = t
    cnt[0] = 1
    sim.river_comp[0, :] = -1


def flood(sim, t: int) -> None:
    """One flood on `t`, with the 5% gate and the picker taken out — the storm
    and the eruption in the same phase scorch too, and would be read as the
    river's work. `_flood_river` rolls the severity the whole flood shares."""
    sim._flood_river(torch.ones(sim.B, dtype=torch.bool, device=sim.device),
                     torch.full((sim.B,), t, dtype=torch.long, device=sim.device))


def main() -> None:
    sim = build()
    t = floodplain(sim)
    solo(sim, t)

    # THE DRAW COUNT IS FIXED. One severity roll plus seven per REACHED tile,
    # whatever stands on it — TS spends the same, so a bare floodplain and a
    # built-up one cannot slide the two streams apart.
    seed = int(sim.rng_state[0])
    sim.improvement[0, t] = -1
    sim._disaster_phase()
    bare = int(sim.rng_state[0])
    sim.rng_state[0] = seed
    sim.improvement[0, t] = 0
    sim.pillaged[0, t] = False
    sim._disaster_phase()
    assert int(sim.rng_state[0]) == bare, (
        "a flood over an IMPROVED tile spent a different number of draws than a bare one")
    print("  a flood costs the same draws whatever stands on the tile")

    # PILLAGE ALWAYS, DESTROY SOMETIMES — the page's "Pillaged: 100%;
    # Destroyed: 50% / 80%".
    pillaged = destroyed = 0
    for _ in range(N):
        sim.improvement[0, t] = 0
        sim.pillaged[0, t] = False
        flood(sim, t)
        if int(sim.improvement[0, t]) < 0:
            destroyed += 1
        elif bool(sim.pillaged[0, t]):
            pillaged += 1
    assert pillaged + destroyed == N, "a flood left an improvement whole"
    assert destroyed > 0, "no flood ever destroyed the improvement"
    assert destroyed < pillaged, "destruction was not the rarer half of the pillage column"
    print(f"  every one of {N} floods pillaged; {destroyed} took the improvement away")

    # THE DAMAGE BANDS. 30-50 and 50-70 HP by severity; a Moderate flood pays
    # nothing at all.
    hurt = sim._flood_dmg_lo > 0
    lo, hi = int(sim._flood_dmg_lo[hurt].min()), int(sim._flood_dmg_hi[hurt].max())
    slot, pool = None, "major"
    for p in ("major", "barb"):
        live = getattr(sim, f"{p}_unit_alive")[0].nonzero().flatten()
        if live.numel():
            slot, pool = int(live[0]), p
            break
    assert slot is not None, "no unit in the fixture to stand on the floodplain"
    hp_plane = getattr(sim, f"{pool}_unit_hp")
    tile_plane = getattr(sim, f"{pool}_unit_tile")
    seen = set()
    for _ in range(N):
        getattr(sim, f"{pool}_unit_alive")[0, slot] = True
        tile_plane[0, slot] = t
        hp_plane[0, slot] = 100
        sim.military_at[0, t] = slot + sim.POOL_LO[pool]
        sim.civilian_at[0, t] = -1
        flood(sim, t)
        if bool(getattr(sim, f"{pool}_unit_alive")[0, slot]):
            seen.add(100 - int(hp_plane[0, slot]))
    assert seen - {0}, "no flood ever damaged the unit standing on it"
    assert 0 in seen, "a Moderate flood must leave the unit untouched"
    for d in seen:
        assert d == 0 or lo <= d <= hi, f"a flood dealt {d}, outside the sourced {lo}-{hi} band"
    print(f"  unit damage stayed inside {lo}-{hi} over {len(seen)} distinct values")

    # THE SILT. Food and production are separate rolls off the same flood, so
    # one flood may pay both.
    sim.fertility[0, t] = 0
    sim.fertility_prod[0, t] = 0
    for _ in range(N):
        if int(sim.fertility[0, t]) and int(sim.fertility_prod[0, t]):
            break
        flood(sim, t)
    assert int(sim.fertility[0, t]) > 0, "the flood never silted FOOD"
    assert int(sim.fertility_prod[0, t]) > 0, "the flood never silted PRODUCTION"
    print("  a river silts food and production on their own rolls")

    # THE GREAT BATH, AND WHERE IT HAS TO STAND. CIV6: a Dam or Great Bath
    # "along a River will mitigate floods THERE", so the shield belongs to the
    # RIVER — it spares the damage half on every tile that river floods,
    # whoever owns them, and still lets the river silt at half rate.
    assert bool(sim._wond_floodmit.any()), "no wonder in the catalog carries flood mitigation"
    widx = int(sim._wond_floodmit.nonzero()[0])
    up = next(int(x) for x in sim.neigh[t].tolist()
              if x >= 0 and int(sim.centre_slot_at[0, x]) < 0
              and int(sim.built_wonder[0, x]) < 0 and int(sim.district[0, x]) < 0)
    # a two-tile river: `t` and `up` share one component, so a shield on either
    # covers both. `solo` cleared every component, so these two are the river.
    sim.floodplain[0, up] = True
    sim.river_comp[0, t] = 0
    sim.river_comp[0, up] = 0
    sim.built_wonder[0, up] = widx
    sim.built_wonder_complete[0, up] = True
    sim._eff_version += 1
    sim.fertility[0, t] = 0
    sim.district[0, t] = 0
    sim.district_complete[0, t] = True
    sim.district_pillaged[0, t] = False
    for _ in range(N):
        sim.improvement[0, t] = 0
        sim.pillaged[0, t] = False
        flood(sim, t)
        assert int(sim.improvement[0, t]) >= 0, "the Great Bath let a flood destroy an improvement"
        assert not bool(sim.pillaged[0, t]), "the Great Bath let a flood pillage an improvement"
        assert not bool(sim.district_pillaged[0, t]), "the Great Bath let a flood take a district"
    assert int(sim.fertility[0, t]) > 0, "a mitigated river stopped silting entirely"

    # ...and off that river it protects nothing: the same wonder, one river
    # component away, leaves every flood on `t` unmitigated.
    sim.river_comp[0, up] = 1
    struck = 0
    for _ in range(N):
        sim.improvement[0, t] = 0
        sim.pillaged[0, t] = False
        sim.district_pillaged[0, t] = False
        flood(sim, t)
        if bool(sim.pillaged[0, t]) or int(sim.improvement[0, t]) < 0:
            struck += 1
    assert struck > 0, "a shield off the river spared a flood it has no business reaching"
    sim.river_comp[0, up] = 0
    print("  the Bath shields its own river, and only its own")

    poke_river_reach()
    print("FLOOD SEVERITY OK — the ladder, the bands, the two silts, the Bath and the reach")


def poke_river_reach() -> None:
    """f. CIV6 (Flood): "The level of the water rises, flooding all Floodplains
    tiles found along the River". One severity for the whole flood; every
    Floodplains tile of the struck river takes it, nothing off that river
    does, and the draw stream is one severity roll plus seven per tile."""
    rules = load_rules()
    best = None
    for p in fixture_paths():
        sim = BatchSim([load_fixture(p)], rules, device="cpu", dtype=torch.float64)
        rc, fp = sim.river_comp[0], sim.floodplain[0]
        total = int(fp.sum())
        for c in set(int(x) for x in rc[fp].tolist()):
            n = int(((rc == c) & fp).sum())
            # a river with SEVERAL floodplains, and floodplains OFF it to spare
            if c >= 0 and n > 1 and n < total and (best is None or n > best[2]):
                best = (sim, c, n)
        if best is not None and best[2] >= 4:
            break
    assert best is not None, "no fixture holds a multi-tile river beside another floodplain"
    sim, comp, n = best
    rc, fp = sim.river_comp[0], sim.floodplain[0]
    reach = ((rc == comp) & fp).nonzero(as_tuple=True)[0].tolist()
    off = [t for t in ((rc != comp) & fp).nonzero(as_tuple=True)[0].tolist()]
    assert len(reach) == n

    for t in reach + off:
        sim.improvement[0, t] = 0
        sim.pillaged[0, t] = False
    seed = int(sim.rng_state[0])
    sim._flood_river(torch.ones(1, dtype=torch.bool, device=sim.device),
                     torch.tensor([reach[0]], dtype=torch.long, device=sim.device))
    spent = 0
    st = torch.tensor([seed], dtype=sim.rng_state.dtype, device=sim.device)
    probe = sim.rng_state.clone()
    sim.rng_state.copy_(st)
    while int(sim.rng_state[0]) != int(probe[0]) and spent < 4096:
        sim._next_random(torch.ones(1, dtype=torch.bool, device=sim.device))
        spent += 1
    assert spent == 1 + 7 * n, f"a {n}-tile flood spent {spent} draws, not 1 + 7 x {n}"
    for t in reach:
        assert bool(sim.pillaged[0, t]) or int(sim.improvement[0, t]) < 0, \
            f"tile {t} is on the flooded river and kept its improvement whole"
    for t in off:
        assert not bool(sim.pillaged[0, t]) and int(sim.improvement[0, t]) >= 0, \
            f"tile {t} is on ANOTHER river and the flood reached it"
    print(f"  f river reach OK — {n} floodplains flooded together, {len(off)} off-river spared")


if __name__ == "__main__":
    main()
