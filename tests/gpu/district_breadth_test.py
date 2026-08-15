"""The district / worship / regional / palace poke lane — catalog breadth the
scripted rollout barely reaches: IZ/Theater/Encampment placement, the regional
channel, the worship faith-buy, the PALACE grant and GP-district accrual.

    python tests/gpu/district_breadth_test.py

Every poke builds a BatchSim from a fixture, forces the state in-memory, then
drives the exact engine twin (_district_adj_raw, _place_district,
_seat_regional, seat_masks, _seat_phase, _seat_city_yields[_all]). Catalog
indices are looked up by id, never hardcoded, so a table that grows a row does
not silently shift a column.

Covered:
  a. IZ adjacency channels live (mine/quarry sources) + ENTERTAINMENT_COMPLEX
     has NO adjacency (every catalog _dyn_* term and its static plane zero).
  b. ENCAMPMENT placement rule (scaffold placement 3): never adjacent-center.
  c. Regional channel: a Factory delivers +3 production to a same-seat city at
     hex distance 6 and NOT at 7; dedup (two Factories -> +3 once); pillaged
     source is dark; another seat never receives.
  d. exclusiveWith: a city owning BARRACKS never queues STABLE (and the
     converse) — poke civ_city_bldg + read the picker's queue mask.
  e. Worship faith-buy: religionFounded + Temple + complete Holy Site + >=114
     faith -> the WORSHIP_BUILDINGS[(r+1)%5] row is set and faith drops by
     EXACTLY 114 (two-run BUY-vs-OWN diff, isolating the debit); no Temple -> no
     buy.
  f. PALACE: a founded capital's yields carry the palace row (+2 prod/+5 gold/
     +2 sci/+1 cul, a non-capital does not); the per-j path and the batched
     twin agree column-for-column; housing/amenity wired.
  g. GP accrual: ENGINEER/GENERAL/ARTIST GPP accrue for a seat owning a
     completed IZ/ENCAMPMENT/THEATER_SQUARE (via GP_CLASS_DISTRICT).
  h. Dtype: the building masks (_b_regional/_b_worship) stay bool and the
     walk's regional terms are consistent under dtype=torch.float32.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES


# ------------------------------------------------------------------ helpers ---
def build(rules, path, steps: int = 18, dtype=torch.float64):
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=dtype)
    for _ in range(steps):
        sim.step()
    return sim


def bidx(rj, name: str) -> int:
    return [b["id"] for b in rj["buildings"]].index(name)


def didx(rj, name: str) -> int:
    return [d["id"] for d in rj["districts"]].index(name)


def free_tiles(sim, n: int, banned=(), need_neighbors: int = 0) -> list[int]:
    """First n on-map tiles holding no city center of any seat, no district and
    no wonder, and (optionally) with >= need_neighbors free on-map neighbours.
    Returns the tile indices."""
    out: list[int] = []
    banned = set(banned)
    for t in range(sim.T):
        if t in banned:
            continue
        if int(sim.centre_slot_at[0, t]) >= 0 or int(sim.citystate_at[0, t]) >= 0:
            continue
        if int(sim.district[0, t]) >= 0 or int(sim.built_wonder[0, t]) >= 0:
            continue
        if need_neighbors:
            nb = sim.neigh[t]
            free_nb = sum(
                1
                for d in range(6)
                if int(nb[d]) >= 0
                and int(sim.improvement[0, int(nb[d])]) < 0
                and int(sim.district[0, int(nb[d])]) < 0
            )
            if free_nb < need_neighbors:
                continue
        out.append(t)
        if len(out) >= n:
            break
    assert len(out) >= n, f"not enough free tiles (wanted {n}, got {len(out)})"
    return out


# ------------------------------------------------------------------ pokes -----
def poke_iz_ec_adjacency(rules, rj, path):
    """a. Industrial Zone draws its adjacency from adjacent MINE/QUARRY
    improvements (the catalog-driven _dyn_mine/_dyn_quarry terms of
    _district_adj_raw); Entertainment Complex has NO adjacency source at all
    (every _dyn_* term and its static plane are zero)."""
    sim = build(rules, path)
    IZ, EC = didx(rj, "INDUSTRIAL_ZONE"), didx(rj, "ENTERTAINMENT_COMPLEX")
    MINE, QUARRY = sim._mine_iidx, sim._quarry_iidx

    # a tile with no adjacent completed districts and >=2 free on-map neighbours
    adjc = sim._adj_district_count().to(sim.dtype)
    t = -1
    for cand in free_tiles(sim, 60, need_neighbors=2):
        if float(adjc[0, cand]) == 0.0:
            t = cand
            break
    assert t >= 0, "no district-isolated tile with two free neighbours"
    nb = [int(x) for x in sim.neigh[t].tolist() if x >= 0 and int(sim.improvement[0, int(x)]) < 0]
    n_mine, n_quarry = nb[0], nb[1]

    base = float(sim._district_adj_raw(IZ, sim._adj_district_count().to(sim.dtype))[0, t])
    # add a MINE neighbour -> IZ raw grows by exactly _dyn_mine[IZ]
    sim.improvement[0, n_mine] = MINE
    after_mine = float(sim._district_adj_raw(IZ, sim._adj_district_count().to(sim.dtype))[0, t])
    assert abs((after_mine - base) - float(sim._dyn_mine[IZ])) < 1e-9, (
        f"IZ mine-adjacency channel dead: delta {after_mine - base} != _dyn_mine {float(sim._dyn_mine[IZ])}"
    )
    assert float(sim._dyn_mine[IZ]) > 0, "IZ mine source must be catalog-live"
    # add a QUARRY neighbour -> grows by _dyn_quarry[IZ] on top
    sim.improvement[0, n_quarry] = QUARRY
    after_quarry = float(sim._district_adj_raw(IZ, sim._adj_district_count().to(sim.dtype))[0, t])
    assert abs((after_quarry - after_mine) - float(sim._dyn_quarry[IZ])) < 1e-9, (
        f"IZ quarry-adjacency channel dead: delta {after_quarry - after_mine} != _dyn_quarry {float(sim._dyn_quarry[IZ])}"
    )

    # Entertainment Complex has NO adjacency source: raw is identically 0
    # everywhere (even next to the mine/quarry we just planted, and next to any
    # district), and every catalog term is zero.
    ec_raw = sim._district_adj_raw(EC, sim._adj_district_count().to(sim.dtype))
    assert float(ec_raw.abs().max()) == 0.0, "ENTERTAINMENT_COMPLEX must have zero adjacency everywhere"
    for term in (sim._dyn_district, sim._dyn_mine, sim._dyn_quarry, sim._dyn_aqueduct, sim._dyn_bwonder, sim._dyn_center, sim._dyn_harbor):
        assert float(term[EC]) == 0.0, "EC carries a non-zero catalog adjacency term"
    assert float(sim.d_static_adj[:, :, EC].abs().max()) == 0.0, "EC carries a non-zero static adjacency plane"
    print(f"  a IZ/EC adjacency OK (IZ mine +{float(sim._dyn_mine[IZ])} quarry +{float(sim._dyn_quarry[IZ])}; EC no-adjacency)")


def poke_encampment_placement(rules, rj, paths):
    """b. ENCAMPMENT scaffold placement code 3 = notAdjacentToCityCenter: the
    best-tile scan never places it on a tile adjacent to a city center, even
    when adjacent-center tiles are otherwise eligible. Which cities hold a
    legal far tile is trajectory-dependent, so probe fixtures in order until
    one exercises the rule — a given fixture's cities may legitimately have
    none."""
    for path in paths:
        if _try_encampment_placement(rules, rj, path):
            return
    raise AssertionError("no fixture's seat-0 cities could place an ENCAMPMENT to exercise the rule")


def _try_encampment_placement(rules, rj, path) -> bool:
    sim = build(rules, path)
    EN = didx(rj, "ENCAMPMENT")
    # scaffold spec carries placement 3 for the encampment district
    plc = next((p for (di, ut, uc, p) in sim._scaffold if di == EN), None)
    assert plc == 3, f"ENCAMPMENT scaffold placement must be 3 (notAdjacentToCityCenter), got {plc}"

    cc = sim._adj_center_count()  # [B, T]
    placed = False
    for c in sim.city_alive[0, 0].nonzero(as_tuple=True)[0].tolist():
        # eligible-but-adjacent-center tiles exist for this city? (so the rule
        # actually filters something)
        site_c = int(sim.city_center[0, 0, c])
        base_elig = (
            (sim.city_slot_at(0)[0] == c)
            & sim.d_usable[0]
            & (sim.district[0] < 0)
            & (sim.built_wonder[0] < 0)
            & (sim.improvement[0] < 0)
            & (sim.res_priority[0] <= 1)
            & (sim.pair_dist[site_c] <= 3)
        )
        base_elig[site_c] = False
        adj_elig = base_elig & (cc[0] >= 1)  # eligible AND adjacent to a center
        far_elig = base_elig & (cc[0] == 0)
        if not bool(far_elig.any()):
            continue  # nowhere legal for an encampment here
        # The RULE lives in the eligibility set, which is what the mask and the
        # policy both read; the engine then only validates the tile it is told.
        elig = sim._district_elig(0, c, EN, 3)[0]
        if not bool(elig.any()):
            continue
        assert not bool((elig & (cc[0] >= 1)).any()), "an ENCAMPMENT tile adjacent to a city center is eligible"
        bt = int(elig.nonzero(as_tuple=True)[0][0])
        placed_mask = sim._place_district(0, c, EN, torch.tensor([True]), 3, torch.tensor([bt]))
        assert bool(placed_mask[0]), f"the engine refused an ELIGIBLE encampment tile {bt}"
        assert int(sim.city_dist_tile[0, 0, c, EN]) == bt, "the registry records another tile"
        assert int(cc[0, bt]) == 0, f"ENCAMPMENT placed adjacent to a city center (cc={int(cc[0, bt])})"
        assert int(sim.district[0, bt]) == EN, "ENCAMPMENT tile not paved"
        note = "adjacent-center tiles were available but excluded" if bool(adj_elig.any()) else "no adjacent-center tiles here"
        print(f"  b ENCAMPMENT placement OK ({path.name} city {c}, tile {bt}, cc==0; {note})")
        placed = True
        break
    return placed


def poke_regional_channel(rules, rj, path):
    """c. regionalEffects: a Factory on a COMPLETE unpillaged Industrial Zone
    reaches every same-seat city center within REGIONAL_RANGE 6 (delivering its
    +3 production), dedups by building id (two Factories -> +3 once), goes dark
    when the source district is pillaged, and never crosses to another seat.
    Uses dedicated (forced-alive) city slots to control hex distances."""
    sim = build(rules, path)
    r = 0
    FAC = bidx(rj, "FACTORY")
    IZ = didx(rj, "INDUSTRIAL_ZONE")
    RANGE = sim._regional_range
    fac_prod = float(sim.rules_dev.b_yields[FAC][1])  # FACTORY production yield
    assert fac_prod == 3.0, f"FACTORY production yield expected 3, got {fac_prod}"
    assert bool(sim._b_regional[FAC]), "FACTORY must be a regional building"
    assert int(sim._b_req_district[FAC]) == IZ, "FACTORY source district must be the Industrial Zone"

    # wipe any organic regional presence for this seat
    for n in sim._reg_bidx:
        sim.city_bldg[:, r + 1, :, n] = False
    sim.city_dist_tile[:, r + 1, :, IZ] = -1

    SRC1, SRC2, RECV = 5, 6, 7  # dedicated slots (avoid clobbering live cities)
    for s in (SRC1, SRC2, RECV):
        sim.city_alive[0, r + 1, s] = True

    # source district tiles + a receiver center at distance exactly 6 from src1
    A = -1
    for cand in free_tiles(sim, 200):
        d = sim.pair_dist[cand]
        if bool((d == RANGE).any()) and bool((d == RANGE + 1).any()):
            A = cand
            break
    assert A >= 0, "no source tile with distance-6 and distance-7 receivers"
    C6 = int((sim.pair_dist[A] == RANGE).nonzero(as_tuple=True)[0][0])
    C7 = int((sim.pair_dist[A] == RANGE + 1).nonzero(as_tuple=True)[0][0])
    B = next(t for t in free_tiles(sim, 400, banned=(A, C6, C7)) if int(sim.pair_dist[C6, t]) <= RANGE and t != A)

    sim.district[0, A] = IZ
    sim.district_complete[0, A] = True
    sim.district_pillaged[0, A] = False
    sim.city_center[0, r + 1, SRC1] = A
    sim.city_dist_tile[0, r + 1, SRC1, IZ] = A
    sim.city_bldg[0, r + 1, SRC1, FAC] = True
    sim.city_center[0, r + 1, RECV] = C6

    # -- single source, receiver in range 6 -> +3 production
    reg = sim._seat_regional(r + 1)
    assert reg is not None, "regional helper returned None with a live Factory"
    assert abs(float(reg[0][0, RECV, 1]) - fac_prod) < 1e-9, "Factory did not deliver +3 to a range-6 receiver"

    # -- receiver at range 7 -> nothing
    sim.city_center[0, r + 1, RECV] = C7
    reg7 = sim._seat_regional(r + 1)
    got7 = 0.0 if reg7 is None else float(reg7[0][0, RECV, 1])
    assert got7 == 0.0, f"Factory reached a range-7 receiver ({got7})"

    # -- dedup: a SECOND Factory (src2) also in range -> still +3, not +6
    sim.city_center[0, r + 1, RECV] = C6
    sim.district[0, B] = IZ
    sim.district_complete[0, B] = True
    sim.district_pillaged[0, B] = False
    sim.city_center[0, r + 1, SRC2] = B
    sim.city_dist_tile[0, r + 1, SRC2, IZ] = B
    sim.city_bldg[0, r + 1, SRC2, FAC] = True
    reg2 = sim._seat_regional(r + 1)
    assert abs(float(reg2[0][0, RECV, 1]) - fac_prod) < 1e-9, "two Factories must dedup to +3 (not stack)"

    # -- pillaged sources are dark
    sim.district_pillaged[0, A] = True
    sim.district_pillaged[0, B] = True
    regp = sim._seat_regional(r + 1)
    gotp = 0.0 if regp is None else float(regp[0][0, RECV, 1])
    assert gotp == 0.0, f"pillaged source district still delivered ({gotp})"

    # -- another seat (no regional buildings) never receives
    # the body is ROW-generic now: no OTHER seat row receives, seat 0 included.
    for _row in (0, 2):
        assert sim._seat_regional(_row) is None, f"seat row {_row} has no regional building and must get None"
    print(f"  c regional channel OK (+{fac_prod} at range {RANGE}, dark at {RANGE + 1}, dedup, pillage-dark, seat-isolated)")


def poke_exclusive_with(rules, rj, path):
    """d. exclusiveWith (Barracks/Stable): a city that owns BARRACKS can never
    QUEUE STABLE, and vice versa. Poke civ_city_bldg + read the picker's queue mask
    (seat_masks -> production[:, j, 0:NB])."""
    sim = build(rules, path)
    r, j = 0, 0
    assert bool(sim.city_alive[0, r + 1, j]), "civ capital slot must be alive"
    BAR, STA = bidx(rj, "BARRACKS"), bidx(rj, "STABLE")
    EN = didx(rj, "ENCAMPMENT")
    b_bar, b_sta = rj["buildings"][BAR], rj["buildings"][STA]
    assert b_bar["exclBuildings"] == [STA] and b_sta["exclBuildings"] == [BAR], "Barracks/Stable exclusiveWith not exported"

    # unlock both + a completed Encampment (their required district), city idle
    if b_bar["unlockTech"] >= 0:
        sim.civ_techs[0, r + 1, b_bar["unlockTech"]] = True
    if b_sta["unlockTech"] >= 0:
        sim.civ_techs[0, r + 1, b_sta["unlockTech"]] = True
    T = free_tiles(sim, 1)[0]
    sim.district[0, T] = EN
    sim.district_complete[0, T] = True
    sim.city_dist_tile[0, r + 1, j, EN] = T
    sim.city_current[0, r + 1, j] = -1  # idle
    sim.city_bldg[0, r + 1, j, BAR] = False
    sim.city_bldg[0, r + 1, j, STA] = False

    def queue_col(b):
        return bool(sim.seat_masks(r + 1)["production"][0, j, b])

    assert queue_col(STA), "STABLE must be queueable when neither exclusive is owned"
    assert queue_col(BAR), "BARRACKS must be queueable when neither exclusive is owned"
    # own BARRACKS -> STABLE masked out (excl); BARRACKS itself masked (have)
    sim.city_bldg[0, r + 1, j, BAR] = True
    assert not queue_col(STA), "owning BARRACKS must forbid queuing STABLE (exclusiveWith)"
    assert not queue_col(BAR), "owning BARRACKS must forbid re-queuing BARRACKS (have)"
    # converse: own STABLE -> BARRACKS masked out
    sim.city_bldg[0, r + 1, j, BAR] = False
    sim.city_bldg[0, r + 1, j, STA] = True
    assert not queue_col(BAR), "owning STABLE must forbid queuing BARRACKS (exclusiveWith)"
    print("  d exclusiveWith OK (BARRACKS<->STABLE mutually mask the queue)")


def poke_worship_buy(rules, rj, path):
    """e. WORSHIP faith-buy: a religion-founder with a Temple + a COMPLETE
    unpillaged Holy Site + >=114 faith buys WORSHIP_BUILDINGS[(r+1)%5] for a
    flat 114 faith. The exact -114 debit is isolated by a two-run BUY-vs-OWN
    diff (both runs carry the worship building's income; only BUY pays). A seat
    without the Temple does not buy."""
    sim = build(rules, path)
    r, j = 0, 0
    assert bool(sim.city_alive[0, r + 1, j]), "civ capital must be alive"
    TEMPLE, HS = sim._temple_bidx, sim._hs_idx
    wb = sim._worship_bidx[(r + 1) % len(sim._worship_bidx)]
    cost = sim._worship_cost
    assert TEMPLE >= 0 and HS >= 0 and wb >= 0, "worship anchors missing from export"

    # make city j the SOLE eligible city; found the religion; strip beliefs so
    # civ_only_religion_done is the only lever gating the buy (income identical across
    # the two runs).
    sim.civ_religion_done[:, r + 1] = True
    sim.civ_pantheon_done[:, r + 1] = True   # skip the pantheon-buy faith drain
    sim.civ_prophets[:, r + 1] = 0           # skip enhancer / (re)founding branches
    sim.civ_pantheon[:, r + 1] = -1
    sim.civ_follower[:, r + 1] = -1
    sim.civ_faith[:, r + 1] = 500.0
    sim.city_bldg[:, r + 1, :, TEMPLE] = False           # only city j has the Temple
    sim.city_bldg[:, r + 1, :, wb] = False
    sim.city_bldg[0, r + 1, j, TEMPLE] = True
    T_hs = free_tiles(sim, 1)[0]
    sim.district[0, T_hs] = didx(rj, "HOLY_SITE")
    sim.district_complete[0, T_hs] = True
    sim.district_pillaged[0, T_hs] = False
    sim.city_dist_tile[:, r + 1, :, HS] = -1
    sim.city_dist_tile[0, r + 1, j, HS] = T_hs

    base = sim.snapshot()

    # run BUY: the worship building is purchased this phase
    sim._seat_phase()
    faith_buy = float(sim.civ_faith[0, r + 1])
    bought = bool(sim.city_bldg[0, r + 1, j, wb])
    assert bought, "founder with Temple + complete Holy Site + faith did not buy its worship building"

    # control OWN: same state, but the city already owns the worship building ->
    # no purchase, yet identical worship-building income. faith_own - faith_buy
    # isolates the flat 114 debit.
    sim.restore(base)
    sim.city_bldg[0, r + 1, j, wb] = True
    sim._seat_phase()
    faith_own = float(sim.civ_faith[0, r + 1])
    assert abs((faith_own - faith_buy) - cost) < 1e-6, (
        f"worship debit not exactly {cost} faith (own {faith_own} - buy {faith_buy} = {faith_own - faith_buy})"
    )

    # no Temple -> no buy at all
    sim.restore(base)
    sim.city_bldg[0, r + 1, j, TEMPLE] = False
    sim._seat_phase()
    assert not bool(sim.city_bldg[0, r + 1, j, wb]), "a founder WITHOUT the Temple must not buy a worship building"
    print(f"  e worship faith-buy OK (row {wb}=WORSHIP[(r+1)%5], -{cost} faith exact; no-Temple no-buy)")


def poke_civ_palace(rules, rj, path):
    """f. PALACE: a founded capital's yields carry the palace row (+2 prod/
    +5 gold/+2 sci/+1 cul; a non-capital does not); the per-j path and the
    batched twin agree column-for-column; housing/amenity are wired."""
    sim = build(rules, path)
    r, j = 0, 0
    assert bool(sim.city_alive[0, r + 1, j]) and bool(sim.city_is_cap[0, r + 1, j]), "civ slot 0 must be a live capital"
    py = sim._palace_y  # [food, prod, gold, sci, cul, faith]
    assert py.tolist() == [0, 2, 5, 2, 1, 0], f"palace yields drifted: {py.tolist()}"

    # neutralise the OTHER capital-only terms (gov / beliefs / CS-envoy) so the
    # civ_city_is_cap toggle isolates the palace; pass amen_yf=1 so nothing scales.
    sim._gov_has_effects = False
    sim.civ_pantheon[:, r + 1] = -1
    sim.civ_follower[:, r + 1] = -1
    sim.seat_citystate_envoys[:, r + 1] = 0
    one = torch.ones(sim.B, dtype=torch.float64)
    mask = sim.city_alive[:, r + 1, j]

    y_cap = sim._seat_city_yields(r + 1, j, mask, amen_yf=one)  # (food,prod,sci,cul,gold,faith)
    sim.city_is_cap[0, r + 1, j] = False
    y_non = sim._seat_city_yields(r + 1, j, mask, amen_yf=one)
    sim.city_is_cap[0, r + 1, j] = True
    diff = [float(y_cap[k][0] - y_non[k][0]) for k in range(6)]
    # return order: food, prod, sci, cul, gold, faith
    assert diff == [0.0, 2.0, 2.0, 1.0, 5.0, 0.0], f"palace-row contribution wrong: {diff}"

    # per-j path == the batched twin, column-for-column, on the poked state
    af = sim._seat_amenity(r + 1)[2]  # [B, RC]
    allc = sim._seat_city_yields_all(r + 1, amen_yf=af)  # 6 x [B, RC]
    for jj in sim.city_alive[0, r + 1].nonzero(as_tuple=True)[0].tolist():
        m = sim.city_alive[:, r + 1, jj]
        pj = sim._seat_city_yields(r + 1, jj, m, amen_yf=af[:, jj])
        for k in range(6):
            a, b = float(pj[k][0]), float(allc[k][0, jj])
            assert abs(a - b) < 1e-9, f"per-j vs batched twin disagree (city {jj}, col {k}): {a} != {b}"

    # housing / amenity constants wired; the palace amenity never lowers the tier
    assert sim._palace_housing == 1.0 and sim._palace_amenities == 1.0, "palace housing/amenity must be +1/+1"
    yf_on = float(sim._seat_amenity(r + 1)[2][0, j])
    sim.city_is_cap[0, r + 1, j] = False
    yf_off = float(sim._seat_amenity(r + 1)[2][0, j])
    sim.city_is_cap[0, r + 1, j] = True
    assert yf_on >= yf_off, "the palace amenity must not reduce the capital's amenity factor"
    print("  f civ PALACE OK (+2p/+5g/+2s/+1c capital row; per-j==batched twin; housing/amenity wired)")


def poke_gp_district_accrual(rules, rj, path):
    """g. GP-district accrual: the ENGINEER/GENERAL/ARTIST classes (GP_CLASS_
    DISTRICT -> IZ / ENCAMPMENT / THEATER_SQUARE) accrue GPP for a seat that
    owns a COMPLETED district of that type."""
    sim = build(rules, path)
    r, j = 0, 0
    assert bool(sim.city_alive[0, r + 1, j]), "civ capital must be alive"
    IZ, EN, TS = didx(rj, "INDUSTRIAL_ZONE"), didx(rj, "ENCAMPMENT"), didx(rj, "THEATER_SQUARE")

    # one representative GP class per district, via GP_CLASS_DISTRICT
    gcd = sim._gp_class_district.tolist()
    targets = []
    for dcls in (IZ, EN, TS):
        cls = next((c for c in range(sim._gp_nc) if gcd[c] == dcls), None)
        assert cls is not None, f"no GP class maps to district {dcls}"
        targets.append((cls, dcls))

    # prevent the shared-pool earn/consume from decrementing civ_only_gpp mid-phase
    for cls, _ in targets:
        sim.gp_earned[:, cls] = int(sim._gp_roster[cls])

    tiles = free_tiles(sim, len(targets))
    before = {}
    for (cls, dcls), T in zip(targets, tiles):
        sim.district[0, T] = dcls
        sim.district_complete[0, T] = True
        sim.district_pillaged[0, T] = False
        sim.city_dist_tile[0, r + 1, j, dcls] = T
        before[cls] = float(sim.civ_gpp[0, r + 1, cls])

    sim._seat_phase()
    for cls, dcls in targets:
        after = float(sim.civ_gpp[0, r + 1, cls])
        assert after > before[cls], (
            f"GP class {cls} (district {dcls}) accrued nothing: {before[cls]} -> {after}"
        )
    print(f"  g GP-district accrual OK (classes {[c for c, _ in targets]} accrue for IZ/ENCAMPMENT/THEATER_SQUARE)")


def poke_float32_dtype(rules, path):
    """h. The building masks (_b_regional/_b_worship) and the walk's regional
    terms are consistent under a float32 build: 30 turns at
    dtype=torch.float32 with no dtype-mismatch crash. The walk itself is f64
    on every row and casts on return, so it carries no dtype-following mask."""
    sim = build(rules, path, steps=30, dtype=torch.float32)
    assert sim._b_regional.dtype == torch.bool and sim._b_worship.dtype == torch.bool, "regional/worship masks are bool"
    # the walk's regional blocks fired during the 30 steps without a crash

    # The tie-break key (worked-tile pick, _auto_pick) is forced to f64 even in
    # an f32 build, and that CONSTRUCT is what is asserted — not end-to-end
    # agreement between the two builds. f32 and f64 accumulators diverge from
    # turn 1, so every discrete comparison (`mp >= cost`, `food >= need`, any
    # score ranking) eventually lands on opposite sides: f32-vs-f64 equality is
    # not an invariant and must never be asserted.
    #
    # What IS invariant is that the key carries enough precision to hold the
    # index epsilon. A 1e-9 epsilon sits far below the f32 ULP of a score around
    # 40 (~4e-6), so on an f32 key it rounds away entirely and topk resolves
    # exact ties by its own order — the HIGHEST index, where TS
    # (`b.score - a.score || a.index - b.index`) takes the lowest. Dropping the
    # .double() flips this assert on any fixture.
    assert sim._tiebreak_key_dtype == torch.float64, (
        f"worked-tile tie-break key is {sim._tiebreak_key_dtype} in an f32 build — "
        "the index epsilon rounds away below the f32 ULP and ties invert vs TS"
    )
    print("  h float32 dtype OK (30 turns, reg_y/reg_am + masks consistent; tie-break key forced f64)")


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text())
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"district_breadth_test on {path.name}")

    poke_iz_ec_adjacency(rules, rj, path)
    poke_encampment_placement(rules, rj, paths)
    poke_regional_channel(rules, rj, path)
    poke_exclusive_with(rules, rj, path)
    poke_worship_buy(rules, rj, path)
    poke_civ_palace(rules, rj, path)
    poke_gp_district_accrual(rules, rj, path)
    poke_float32_dtype(rules, path)
    print("DISTRICT BREADTH POKES OK")


if __name__ == "__main__":
    main()
