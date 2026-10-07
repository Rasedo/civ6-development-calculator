"""The flood's SEVERITY LADDER, poked one column at a time.

    python tests/gpu/flood_severity_test.py

CIV 6 (Gathering Storm): a flood "damages or destroys Districts, improvements,
and units on the Floodplains tiles near the River. This may also include a City
Center, in which case it loses some HP and Defenses... May kill some Citizens in
a nearby city... Can fertilize affected tiles." The severity decides every
magnitude; a Dam or Great Bath along the river cancels the damage half for
every tile that river floods and halves the silt.

The turn's one event draw names a flood beside every other event and the
flood strikes one river of several, so the driven gate reaches a given
severity on a given tile at a rate no run can be counted on for — the lane
pokes the phase directly.
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
    """a non-centre floodplain tile, OWNED by a seat that is not Egypt: the
    improvement, district, building and population rows refuse an unowned
    plot (the applier 0x336a50), and Egypt's ground takes no flood damage"""
    tiles = [t for t in range(sim.T)
             if bool(sim.floodplain[0, t]) and int(sim.centre_slot_at[0, t]) < 0]
    assert tiles, "fixture has no non-centre floodplain tile"
    t = tiles[0]
    if int(sim.tile_seat[0, t]) < 0:
        owner = next(s for s in range(sim.n_majors)
                     if not bool(sim._seat_plays(torch.tensor([s]), "EGYPT")[0]))
        sim.tile_seat[0, t] = owner
        sim._tile_owner_ver += 1
    return t


def solo(sim, t: int) -> None:
    """Make `t` the ONLY flood site AND the only floodplain its river
    reaches, so a flood driven through the whole disaster phase lands where
    the assertions read. The reach itself is poke `f`."""
    idx, cnt = sim._flood_sites
    idx[0, :] = t
    cnt[0] = 1
    sim._flood_lists[0] = -1
    sim._flood_lists[0, :, 0] = t
    sim.river_comp[0, :] = -1


def alone(sim, t: int) -> torch.Tensor:
    """[B, L] a Floodplains list of `t` alone, for every game"""
    lst = torch.full((sim.B, sim._flood_lists.shape[2]), -1, dtype=torch.long, device=sim.device)
    lst[:, 0] = t
    return lst


def flood(sim, t: int) -> None:
    """One flood on `t`, the turn's draw taken out — the storm and the
    eruption it might name scorch too, and would be read as the river's
    work. The severity is one draw by the flood rows' weights
    (`_flood_severity_draw`, the breached Dam's)."""
    one = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
    sim._flood_river(one, alone(sim, t),
                     sim._flood_severity_draw(one), torch.full((sim.B,), -1, dtype=torch.long, device=sim.device))


def main() -> None:
    sim = build()
    t = floodplain(sim)
    solo(sim, t)

    # AN IMPROVEMENT SPENDS NO DRAW: one per damage row and one per yield row
    # a plot, whatever improvement stands on it. The flood alone, so no other
    # event of the turn moves the stream between the two runs.
    seed = int(sim.rng_state[0])
    sim.improvement[0, t] = -1
    flood(sim, t)
    bare = int(sim.rng_state[0])
    sim.rng_state[0] = seed
    sim.improvement[0, t] = 0
    sim.pillaged[0, t] = False
    flood(sim, t)
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

    # THE DAMAGE BANDS. 30-50 and 50-70 HP by severity; a Moderate flood
    # carries no unit row and pays nothing at all.
    bands = [(lo_, hi_) for rows in sim._flood_damage for k, _p, lo_, hi_ in rows if k == "UNIT_DAMAGE_LAND"]
    lo, hi = min(b[0] for b in bands), max(b[1] for b in bands)
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
    # each unit's own draw, MinHP + rand(MaxHP - MinHP) (the applier 0x3366a0):
    # MaxHP itself is never dealt
    for d in seen:
        assert d == 0 or lo <= d < hi, f"a flood dealt {d}, outside the sourced {lo}..{hi - 1} band"
    print(f"  unit damage stayed inside {lo}..{hi - 1} over {len(seen)} distinct values")

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
    # a two-plot Floodplains list, `t` then `up`: a shield on either covers
    # both (0xa2a4d0 reads the river's list)
    sim.floodplain[0, up] = True
    two = alone(sim, t)
    two[:, 1] = up
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
        one = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
        sim._flood_river(one, two, sim._flood_severity_draw(one), torch.full((sim.B,), -1, dtype=torch.long, device=sim.device))
        assert int(sim.improvement[0, t]) >= 0, "the Great Bath let a flood destroy an improvement"
        assert not bool(sim.pillaged[0, t]), "the Great Bath let a flood pillage an improvement"
        assert not bool(sim.district_pillaged[0, t]), "the Great Bath let a flood take a district"
    assert int(sim.fertility[0, t]) > 0, "a mitigated river stopped silting entirely"
    # the mitigating player is the Bath's owner (`riverShield`); its seat
    # records the MITIGATED_RIVER_FLOOD key
    owner = int(sim.tile_seat[0, up])
    assert int(sim._flood_mitigator(two)[0]) == owner, "the Bath's owner mitigates its river's flood"
    if 0 <= owner < sim.n_majors:
        assert bool(sim.moment_seen[0, owner, sim._mk_mitigated_flood]), "the mitigating seat's moment"

    # ...and off that list it protects nothing: the same wonder beside a
    # list of `t` alone leaves every flood on `t` unmitigated.
    struck = 0
    for _ in range(N):
        sim.improvement[0, t] = 0
        sim.pillaged[0, t] = False
        sim.district_pillaged[0, t] = False
        flood(sim, t)
        if bool(sim.pillaged[0, t]) or int(sim.improvement[0, t]) < 0:
            struck += 1
    assert struck > 0, "a shield off the river spared a flood it has no business reaching"
    print("  the Bath shields its own river, and only its own")

    poke_river_reach()
    poke_row_walk()
    print("FLOOD SEVERITY OK — the ladder, the bands, the two silts, the Bath, the reach and the row walk")


def spent_by_walk(sim, reach: list[int], sev: int, egypt: list[int]) -> int:
    """The draws a flood of severity `sev` over the plots `reach` spends, read
    off the board BEFORE it (0xa2a4d0 / 0xa2ed80): per damage row, per plot
    not Egypt's, one draw, then one per land unit standing there for
    UNIT_DAMAGE_LAND, one for CITY_GARRISON where a centre stands and one for
    CITY_WALLS where its walls stand; per yield row one draw per plot. A
    shielded river spends no damage draw, a world past fertility no yield
    draw. Only rows that land for sure (Percentage 100) may carry the extra
    draws for the count to be fixed."""
    mask = torch.zeros(1, sim.T, dtype=torch.bool, device=sim.device)
    mask[0, reach] = True
    n = 0
    if not bool(sim._river_shielded(mask)[0]):
        for kind, pct, _lo, _hi in sim._flood_damage[sev]:
            for t in reach:
                if int(sim.tile_seat[0, t]) in egypt:
                    continue
                n += 1
                if kind == "UNIT_DAMAGE_LAND":
                    assert pct == 100
                    n += int(int(sim.military_at[0, t]) >= 0) + int(int(sim.support_at[0, t]) >= 0)
                tt = torch.tensor([t], dtype=torch.long, device=sim.device)
                if kind == "CITY_GARRISON":
                    assert pct == 100
                    n += int(bool(sim._centre_held(tt)[0]))
                if kind == "CITY_WALLS":
                    assert pct == 100
                    n += int(int(sim._centre_outer_hp(tt)[0]) > 0)
    if not bool(sim._flood_halted()[0]):
        n += len(sim._flood_yields[sev]) * len(reach)
    return n


def poke_row_walk() -> None:
    """g. THE ROW WALK (0xa2a4d0, then 0xa2ed80): Egypt's plots spend no damage
    draw (the shielded river is the Bath poke above), and a yield row's +1 lands
    on its own Floodplains kind alone."""
    sim = build()
    t = floodplain(sim)
    solo(sim, t)
    one = torch.ones(1, dtype=torch.bool, device=sim.device)
    at = alone(sim, t)
    owner = int(sim.tile_seat[0, t])
    civ0, lead0 = int(sim.row_civ[0, owner]), int(sim.row_leader[0, owner])
    ci = sim._civ_ids.index("EGYPT")
    for civ, lead, label in ((ci, sim._pair_civ.index(ci), "Egypt's"), (civ0, lead0, "another seat's")):
        # the plot's owner plays Egypt, then its own civilization again
        sim.row_civ[0, owner] = civ
        sim.row_leader[0, owner] = lead
        sim._eff_version += 1
        sim._gen_ver += 1
        sim._bldg_version += 1
        egypt = [r for r in range(sim.n_majors) if bool(sim._seat_plays(torch.tensor([r]), "EGYPT")[0])]
        assert (owner in egypt) == (civ == ci)
        for sev in range(len(sim._flood_damage)):
            want = spent_by_walk(sim, [t], sev, egypt)
            seed = int(sim.rng_state[0])
            sim._flood_river(one, at, torch.tensor([sev], dtype=torch.long, device=sim.device), torch.full((sim.B,), -1, dtype=torch.long, device=sim.device))
            spent = 0
            probe = int(sim.rng_state[0])
            sim.rng_state[0] = seed
            while int(sim.rng_state[0]) != probe and spent < 4096:
                sim._rand_range(one, 1)
                spent += 1
            assert spent == want, f"{label} plot, severity {sev}: {spent} draws, not {want}"
    # a yield row lands on its own kind alone: MODERATE carries Food rows only,
    # so no flood of it ever silts Production
    fid = int(sim.feat_id[0, t])
    kinds = {f for rows in sim._flood_yields for _pl, f, _p in rows}
    assert fid in kinds, "the floodplain's feature is no row's kind"
    sim.fertility_prod[0, t] = 0
    for _ in range(N):
        sim._flood_river(one, at, torch.zeros(1, dtype=torch.long, device=sim.device), torch.full((sim.B,), -1, dtype=torch.long, device=sim.device))
    assert int(sim.fertility_prod[0, t]) == 0, "a MODERATE flood silted Production"
    # a row naming another kind never lands: the plot recast as no floodplain
    # kind any row names gains nothing
    sim.fertility[0, t] = 0
    sim.feat_id[0, t] = max(kinds) + 1000
    for _ in range(N):
        sim._flood_river(one, at, torch.full((1,), 2, dtype=torch.long, device=sim.device), torch.full((sim.B,), -1, dtype=torch.long, device=sim.device))
    assert int(sim.fertility[0, t]) == 0 and int(sim.fertility_prod[0, t]) == 0, \
        "a yield row landed on a plot of another kind"
    sim.feat_id[0, t] = fid
    print("  g row walk OK — Egypt's plots spend no damage draw; a yield row keeps to its kind")


def poke_river_reach() -> None:
    """f. CIV6 (Flood): "The level of the water rises, flooding all Floodplains
    tiles found along the River" — the river's Floodplains list (0xa2aca0,
    shipped per site by the exporter, `floodRivers`). One severity for the
    whole flood; every plot of the list takes it, in its order, no plot off
    it does, and the draw stream is the row walk's (`spent_by_walk`)."""
    rules = load_rules()
    best = None
    for p in fixture_paths():
        sim = BatchSim([load_fixture(p)], rules, device="cpu", dtype=torch.float64)
        fp = sim.floodplain[0]
        for lst in sim._flood_lists[0].tolist():
            reach = [t for t in lst if t >= 0]
            # a list of SEVERAL plots, and floodplains off it to spare
            if len(reach) > 1 and len(reach) < int(fp.sum()) and (best is None or len(reach) > len(best[1])):
                best = (sim, reach)
        if best is not None and len(best[1]) >= 4:
            break
    assert best is not None, "no fixture holds a multi-plot flood list beside another floodplain"
    sim, reach = best
    n = len(reach)
    fp = sim.floodplain[0]
    off = [t for t in fp.nonzero(as_tuple=True)[0].tolist() if t not in reach]

    for t in reach + off:
        sim.improvement[0, t] = 0
        sim.pillaged[0, t] = False
    seed = int(sim.rng_state[0])
    lst = torch.full((1, sim._flood_lists.shape[2]), -1, dtype=torch.long, device=sim.device)
    lst[0, :n] = torch.tensor(reach, dtype=torch.long, device=sim.device)
    sim._flood_river(torch.ones(1, dtype=torch.bool, device=sim.device), lst,
                     torch.tensor([2], dtype=torch.long, device=sim.device), torch.full((sim.B,), -1, dtype=torch.long, device=sim.device))
    spent = 0
    st = torch.tensor([seed], dtype=sim.rng_state.dtype, device=sim.device)
    probe = sim.rng_state.clone()
    sim.rng_state.copy_(st)
    while int(sim.rng_state[0]) != int(probe[0]) and spent < 4096:
        sim._rand_range(torch.ones(1, dtype=torch.bool, device=sim.device), 1)
        spent += 1
    egypt = [s for s in range(sim.n_majors) if bool(sim._seat_plays(torch.tensor([s]), "EGYPT")[0])]
    want = spent_by_walk(sim, reach, 2, egypt)
    assert spent == want, f"a {n}-plot flood spent {spent} draws, not the row walk's {want}"
    for t in reach:
        owner = int(sim.tile_seat[0, t])
        if owner >= 0 and owner not in egypt:
            assert bool(sim.pillaged[0, t]) or int(sim.improvement[0, t]) < 0, \
                f"tile {t} is on the flooded list and kept its improvement whole"
        elif owner < 0:
            # the improvement rows refuse an unowned plot (the applier 0x336a50)
            assert not bool(sim.pillaged[0, t]) and int(sim.improvement[0, t]) >= 0, \
                f"tile {t} is unowned and the flood pillaged it"
    for t in off:
        assert not bool(sim.pillaged[0, t]) and int(sim.improvement[0, t]) >= 0, \
            f"tile {t} is off the flooded list and the flood reached it"
    print(f"  f river reach OK — {n} floodplains flooded together, {len(off)} off the list spared")

    # THE FLOOD SITES: one per river whose list is not empty, each keyed on
    # its list's first plot, in the order of each list's lowest plot; every
    # listed plot carries Floodplains
    idx, cnt = sim._flood_sites
    got = idx[0, : int(cnt[0])].tolist()
    lists = [[t for t in lst if t >= 0] for lst in sim._flood_lists[0].tolist()][: int(cnt[0])]
    assert all(lst and lst[0] == s for lst, s in zip(lists, got)), f"a flood site is not its list's start: {got}"
    assert all(bool(fp[t]) for lst in lists for t in lst), "a listed plot carries no Floodplains"
    lows = [min(lst) for lst in lists]
    assert lows == sorted(lows), f"flood sites out of their lowest-plot order: {lows}"
    print(f"  g flood sites OK — {len(got)} rivers, each its list's start")
if __name__ == "__main__":
    main()
