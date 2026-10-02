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
    sim.river_comp[0, :] = -1


def flood(sim, t: int) -> None:
    """One flood on `t`, the turn's draw taken out — the storm and the
    eruption it might name scorch too, and would be read as the river's
    work. The severity is one draw by the flood rows' weights
    (`_flood_severity_draw`, the breached Dam's)."""
    one = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
    sim._flood_river(one, torch.full((sim.B,), t, dtype=torch.long, device=sim.device),
                     sim._flood_severity_draw(one))


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
    if bool(sim._fertility_live()[0]):
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
    at = torch.tensor([t], dtype=torch.long, device=sim.device)
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
            sim._flood_river(one, at, torch.tensor([sev], dtype=torch.long, device=sim.device))
            spent = 0
            probe = int(sim.rng_state[0])
            sim.rng_state[0] = seed
            while int(sim.rng_state[0]) != probe and spent < 4096:
                sim._next_random(one)
                spent += 1
            assert spent == want, f"{label} plot, severity {sev}: {spent} draws, not {want}"
    # a yield row lands on its own kind alone: MODERATE carries Food rows only,
    # so no flood of it ever silts Production
    fid = int(sim.feat_id[0, t])
    kinds = {f for rows in sim._flood_yields for _pl, f, _p in rows}
    assert fid in kinds, "the floodplain's feature is no row's kind"
    sim.fertility_prod[0, t] = 0
    for _ in range(N):
        sim._flood_river(one, at, torch.zeros(1, dtype=torch.long, device=sim.device))
    assert int(sim.fertility_prod[0, t]) == 0, "a MODERATE flood silted Production"
    # a row naming another kind never lands: the plot recast as no floodplain
    # kind any row names gains nothing
    sim.fertility[0, t] = 0
    sim.feat_id[0, t] = max(kinds) + 1000
    for _ in range(N):
        sim._flood_river(one, at, torch.full((1,), 2, dtype=torch.long, device=sim.device))
    assert int(sim.fertility[0, t]) == 0 and int(sim.fertility_prod[0, t]) == 0, \
        "a yield row landed on a plot of another kind"
    sim.feat_id[0, t] = fid
    print("  g row walk OK — Egypt's plots spend no damage draw; a yield row keeps to its kind")


def poke_river_reach() -> None:
    """f. CIV6 (Flood): "The level of the water rises, flooding all Floodplains
    tiles found along the River". One severity for the whole flood; every
    Floodplains tile of the struck river takes it, nothing off that river
    does, and the draw stream is the row walk's (`spent_by_walk`)."""
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
                     torch.tensor([reach[0]], dtype=torch.long, device=sim.device),
                     torch.tensor([2], dtype=torch.long, device=sim.device))
    spent = 0
    st = torch.tensor([seed], dtype=sim.rng_state.dtype, device=sim.device)
    probe = sim.rng_state.clone()
    sim.rng_state.copy_(st)
    while int(sim.rng_state[0]) != int(probe[0]) and spent < 4096:
        sim._next_random(torch.ones(1, dtype=torch.bool, device=sim.device))
        spent += 1
    egypt = [s for s in range(sim.n_majors) if bool(sim._seat_plays(torch.tensor([s]), "EGYPT")[0])]
    want = spent_by_walk(sim, reach, 2, egypt)
    assert spent == want, f"a {n}-tile flood spent {spent} draws, not the row walk's {want}"
    for t in reach:
        owner = int(sim.tile_seat[0, t])
        if owner >= 0 and owner not in egypt:
            assert bool(sim.pillaged[0, t]) or int(sim.improvement[0, t]) < 0, \
                f"tile {t} is on the flooded river and kept its improvement whole"
        elif owner < 0:
            # the improvement rows refuse an unowned plot (the applier 0x336a50)
            assert not bool(sim.pillaged[0, t]) and int(sim.improvement[0, t]) >= 0, \
                f"tile {t} is unowned and the flood pillaged it"
    for t in off:
        assert not bool(sim.pillaged[0, t]) and int(sim.improvement[0, t]) >= 0, \
            f"tile {t} is on ANOTHER river and the flood reached it"
    print(f"  f river reach OK — {n} floodplains flooded together, {len(off)} off-river spared")

    # THE FLOOD SITES (`floodRivers`, shipped by the exporter): the turn's draw
    # weighs each flood row once per RIVER carrying Floodplains and once per
    # Floodplains plot no river touches, in the order of each one's lowest
    # Floodplains plot; a river's site is the Floodplains plot its flood
    # starts on (its upstream-most), one of its own.
    rivers = {int(c) for c in rc[fp].tolist() if int(c) >= 0}
    alone = [t for t in (fp & (rc < 0)).nonzero(as_tuple=True)[0].tolist()]
    lead = [int(((rc == c) & fp).nonzero(as_tuple=True)[0].min()) for c in rivers]
    idx, cnt = sim._flood_sites
    got = idx[0, : int(cnt[0])].tolist()
    assert all(bool(fp[s]) for s in got), f"a flood site off the Floodplains: {got}"

    def lead_of(s: int) -> int:
        c = int(rc[s])
        return s if c < 0 else int(((rc == c) & fp).nonzero(as_tuple=True)[0].min())
    assert [lead_of(s) for s in got] == sorted(lead + alone), \
        f"flood sites {got} name {[lead_of(s) for s in got]}, not {sorted(lead + alone)}"
    moved = sum(1 for s in got if lead_of(s) != s)
    print(f"  g flood sites OK — {len(rivers)} rivers and {len(alone)} lone floodplains, one site each, "
          f"{moved} rivers starting upstream of their lowest plot")


if __name__ == "__main__":
    main()
