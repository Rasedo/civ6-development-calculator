"""ROUND B9 (AUDIT A-9 catalog breadth) self-test — the gate-UNREACHABLE
district/worship/regional/palace surfaces the 24x250 scripted rollout barely
touches (IZ/Theater/Encampment placement, the regional channel, the rival
worship faith-buy, the rival PALACE grant, and the newly-reachable GP-district
accrual).

    npm run gpu:export        # (once) writes gpu/fixtures/  (B9 catalog)
    $env:PYTHONUTF8='1'; python gpu/district_breadth_test.py

Every poke builds a BatchSim from a fixture, forces the state in-memory, then
drives the EXACT engine twin (_district_adj_raw, _place_district,
_rival_regional, rival_masks, _rival_phase, _rival_city_yields[_all]) and
asserts TS-mirroring behaviour. Indices are derived from the rules JSON by id
(never hardcoded — the building table grew NB 29->34 this round).

Covered:
  a. IZ adjacency channels live (mine/quarry sources) + ENTERTAINMENT_COMPLEX
     has NO adjacency (catalog-driven _dyn_district / static planes zero).
  b. ENCAMPMENT placement rule (scaffold placement 3): never adjacent-center.
  c. Regional channel: a Factory delivers +3 production to a same-civ city at
     hex distance 6 and NOT at 7; dedup (two Factories -> +3 once); pillaged
     source is dark; a different civ never receives.
  d. exclusiveWith: a rival city owning BARRACKS never queues STABLE (and the
     converse) — poke rc_bldg + read the picker's queue mask.
  e. Worship faith-buy: religionFounded + Temple + complete Holy Site + >=114
     faith -> the WORSHIP_BUILDINGS[(r+1)%5] row is set and faith drops by
     EXACTLY 114 (two-run BUY-vs-OWN diff, isolating the debit); no Temple -> no
     buy.
  f. Rival PALACE: a founded capital's yields carry the palace row (+2 prod/
     +5 gold/+2 sci/+1 cul, a non-capital does not); the per-j path and the
     D-9 batched twin agree column-for-column; housing/amenity wired.
  g. GP accrual: ENGINEER/GENERAL/ARTIST GPP now accrue for a rival owning a
     completed IZ/ENCAMPMENT/THEATER_SQUARE (via GP_CLASS_DISTRICT).
  h. Dtype: every NEW round tensor (_b_local_f/_b_regional/_b_worship + the
     walk reg_y/reg_am terms) is consistent under dtype=torch.float32.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


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
    """First n on-map tiles that are not any center/CS/rival-center, carry no
    district / wonder, and (optionally) have >= need_neighbors free on-map
    neighbours. Returns the tile indices."""
    out: list[int] = []
    banned = set(banned)
    for t in range(sim.T):
        if t in banned:
            continue
        if int(sim.center_at[0, t]) >= 0 or int(sim.rvcity_at[0, t]) >= 0 or int(sim.cs_at[0, t]) >= 0:
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
    improvements (catalog-driven _dyn_mine/_dyn_quarry); Entertainment Complex
    has NO adjacency source at all (every _dyn_* term and its static plane are
    zero) — the B9-R1 catalog-driven _district_adj_raw."""
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
    when adjacent-center tiles are otherwise eligible. #55 S4: which cities
    have a legal far-tile is trajectory-dependent — probe fixtures in order
    until one exercises the rule (the first fixture's cities can legitimately
    have none after a reshuffle)."""
    for path in paths:
        if _try_encampment_placement(rules, rj, path):
            return
    raise AssertionError("no fixture's player cities could place an ENCAMPMENT to exercise the rule")


def _try_encampment_placement(rules, rj, path) -> bool:
    sim = build(rules, path)
    EN = didx(rj, "ENCAMPMENT")
    # scaffold spec carries placement 3 for the encampment district
    plc = next((p for (di, ut, uc, p) in sim._scaffold if di == EN), None)
    assert plc == 3, f"ENCAMPMENT scaffold placement must be 3 (notAdjacentToCityCenter), got {plc}"

    cc = sim._adj_center_count()  # [B, T]
    placed = False
    for c in sim.alive[0].nonzero(as_tuple=True)[0].tolist():
        # eligible-but-adjacent-center tiles exist for this city? (so the rule
        # actually filters something)
        site_c = int(sim.site[0, c])
        base_elig = (
            (sim.owner[0] == c)
            & sim.d_usable[0]
            & (sim.district[0] < 0)
            & (sim.built_wonder[0] < 0)
            & (sim.improvement[0] < 0)
            & (sim.res_priority[0] <= 1)
            & (sim.dist[0, c] <= 3)
        )
        base_elig[site_c] = False
        adj_elig = base_elig & (cc[0] >= 1)  # eligible AND adjacent to a center
        far_elig = base_elig & (cc[0] == 0)
        if not bool(far_elig.any()):
            continue  # nowhere legal for an encampment here
        placed_mask, best = sim._place_district(EN, torch.tensor([True]), c, placement=3)
        if not bool(placed_mask[0]):
            continue
        bt = int(best[0])
        assert int(cc[0, bt]) == 0, f"ENCAMPMENT placed adjacent to a city center (cc={int(cc[0, bt])})"
        assert int(sim.district[0, bt]) == EN, "ENCAMPMENT tile not paved"
        note = "adjacent-center tiles were available but excluded" if bool(adj_elig.any()) else "no adjacent-center tiles here"
        print(f"  b ENCAMPMENT placement OK ({path.name} city {c}, tile {bt}, cc==0; {note})")
        placed = True
        break
    return placed


def poke_regional_channel(rules, rj, path):
    """c. rivalRegionalEffects: a Factory on a COMPLETE unpillaged Industrial
    Zone reaches every same-civ city center within REGIONAL_RANGE 6 (delivering
    its +3 production), dedups by building id (two Factories -> +3 once), goes
    dark when the source district is pillaged, and never crosses to another
    civ. Uses dedicated (forced-alive) rival slots to control hex distances."""
    sim = build(rules, path)
    r = 0
    FAC = bidx(rj, "FACTORY")
    IZ = didx(rj, "INDUSTRIAL_ZONE")
    RANGE = sim._regional_range
    fac_prod = float(sim.rules_dev.b_yields[FAC][1])  # FACTORY production yield
    assert fac_prod == 3.0, f"FACTORY production yield expected 3, got {fac_prod}"
    assert bool(sim._b_regional[FAC]), "FACTORY must be a regional building"
    assert int(sim._b_req_district[FAC]) == IZ, "FACTORY source district must be the Industrial Zone"

    # wipe any organic regional presence for this rival
    for n in sim._reg_bidx:
        sim.rc_bldg[:, r, :, n] = False
    sim.rc_dist_tile[:, r, :, IZ] = -1

    SRC1, SRC2, RECV = 5, 6, 7  # dedicated slots (avoid clobbering live cities)
    for s in (SRC1, SRC2, RECV):
        sim.rc_alive[0, r, s] = True

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
    sim.rc_center[0, r, SRC1] = A
    sim.rc_dist_tile[0, r, SRC1, IZ] = A
    sim.rc_bldg[0, r, SRC1, FAC] = True
    sim.rc_center[0, r, RECV] = C6

    # -- single source, receiver in range 6 -> +3 production
    reg = sim._rival_regional(r)
    assert reg is not None, "regional helper returned None with a live Factory"
    assert abs(float(reg[0][0, RECV, 1]) - fac_prod) < 1e-9, "Factory did not deliver +3 to a range-6 receiver"

    # -- receiver at range 7 -> nothing
    sim.rc_center[0, r, RECV] = C7
    reg7 = sim._rival_regional(r)
    got7 = 0.0 if reg7 is None else float(reg7[0][0, RECV, 1])
    assert got7 == 0.0, f"Factory reached a range-7 receiver ({got7})"

    # -- dedup: a SECOND Factory (src2) also in range -> still +3, not +6
    sim.rc_center[0, r, RECV] = C6
    sim.district[0, B] = IZ
    sim.district_complete[0, B] = True
    sim.district_pillaged[0, B] = False
    sim.rc_center[0, r, SRC2] = B
    sim.rc_dist_tile[0, r, SRC2, IZ] = B
    sim.rc_bldg[0, r, SRC2, FAC] = True
    reg2 = sim._rival_regional(r)
    assert abs(float(reg2[0][0, RECV, 1]) - fac_prod) < 1e-9, "two Factories must dedup to +3 (not stack)"

    # -- pillaged sources are dark
    sim.district_pillaged[0, A] = True
    sim.district_pillaged[0, B] = True
    regp = sim._rival_regional(r)
    gotp = 0.0 if regp is None else float(regp[0][0, RECV, 1])
    assert gotp == 0.0, f"pillaged source district still delivered ({gotp})"

    # -- a different civ (no regional buildings) never receives
    assert sim._rival_regional(1) is None, "a civ with no regional building must get None"
    print(f"  c regional channel OK (+{fac_prod} at range {RANGE}, dark at {RANGE + 1}, dedup, pillage-dark, civ-isolated)")


def poke_exclusive_with(rules, rj, path):
    """d. exclusiveWith (Barracks/Stable): a rival city that owns BARRACKS can
    never QUEUE STABLE, and vice versa. Poke rc_bldg + read the picker's queue
    mask (rival_masks -> production[:, j, 0:NB])."""
    sim = build(rules, path)
    r, j = 0, 0
    assert bool(sim.rc_alive[0, r, j]), "rival capital slot must be alive"
    BAR, STA = bidx(rj, "BARRACKS"), bidx(rj, "STABLE")
    EN = didx(rj, "ENCAMPMENT")
    b_bar, b_sta = rj["buildings"][BAR], rj["buildings"][STA]
    assert b_bar["exclBuildings"] == [STA] and b_sta["exclBuildings"] == [BAR], "Barracks/Stable exclusiveWith not exported"

    # unlock both + a completed Encampment (their required district), city idle
    if b_bar["unlockTech"] >= 0:
        sim.r_techs[0, r, b_bar["unlockTech"]] = True
    if b_sta["unlockTech"] >= 0:
        sim.r_techs[0, r, b_sta["unlockTech"]] = True
    T = free_tiles(sim, 1)[0]
    sim.district[0, T] = EN
    sim.district_complete[0, T] = True
    sim.rc_dist_tile[0, r, j, EN] = T
    sim.rc_current[0, r, j] = -1  # idle
    sim.rc_bldg[0, r, j, BAR] = False
    sim.rc_bldg[0, r, j, STA] = False

    def queue_col(b):
        return bool(sim.rival_masks(r)["production"][0, j, b])

    assert queue_col(STA), "STABLE must be queueable when neither exclusive is owned"
    assert queue_col(BAR), "BARRACKS must be queueable when neither exclusive is owned"
    # own BARRACKS -> STABLE masked out (excl); BARRACKS itself masked (have)
    sim.rc_bldg[0, r, j, BAR] = True
    assert not queue_col(STA), "owning BARRACKS must forbid queuing STABLE (exclusiveWith)"
    assert not queue_col(BAR), "owning BARRACKS must forbid re-queuing BARRACKS (have)"
    # converse: own STABLE -> BARRACKS masked out
    sim.rc_bldg[0, r, j, BAR] = False
    sim.rc_bldg[0, r, j, STA] = True
    assert not queue_col(BAR), "owning STABLE must forbid queuing BARRACKS (exclusiveWith)"
    print("  d exclusiveWith OK (BARRACKS<->STABLE mutually mask the queue)")


def poke_worship_buy(rules, rj, path):
    """e. WORSHIP faith-buy: a religion-founder with a Temple + a COMPLETE
    unpillaged Holy Site + >=114 faith buys WORSHIP_BUILDINGS[(r+1)%5] for a
    flat 114 faith. The exact -114 debit is isolated by a two-run BUY-vs-OWN
    diff (both runs carry the worship building's income; only BUY pays). A rival
    without the Temple does not buy."""
    sim = build(rules, path)
    r, j = 0, 0
    assert bool(sim.rc_alive[0, r, j]), "rival capital must be alive"
    TEMPLE, HS = sim._temple_bidx, sim._hs_idx
    wb = sim._worship_bidx[(r + 1) % len(sim._worship_bidx)]
    cost = sim._worship_cost
    assert TEMPLE >= 0 and HS >= 0 and wb >= 0, "worship anchors missing from export"

    # make city j the SOLE eligible city; found the religion; strip beliefs so
    # r_religion_done is the only lever gating the buy (income identical across
    # the two runs).
    sim.r_religion_done[:, r] = True
    sim.r_pantheon_done[:, r] = True   # skip the pantheon-buy faith drain
    sim.r_prophets[:, r] = 0           # skip enhancer / (re)founding branches
    sim.r_pantheon[:, r] = -1
    sim.r_follower[:, r] = -1
    sim.r_faith[:, r] = 500.0
    sim.rc_bldg[:, r, :, TEMPLE] = False           # only city j has the Temple
    sim.rc_bldg[:, r, :, wb] = False
    sim.rc_bldg[0, r, j, TEMPLE] = True
    T_hs = free_tiles(sim, 1)[0]
    sim.district[0, T_hs] = didx(rj, "HOLY_SITE")
    sim.district_complete[0, T_hs] = True
    sim.district_pillaged[0, T_hs] = False
    sim.rc_dist_tile[:, r, :, HS] = -1
    sim.rc_dist_tile[0, r, j, HS] = T_hs

    base = sim.snapshot()

    # run BUY: the worship building is purchased this phase
    sim._rival_phase()
    faith_buy = float(sim.r_faith[0, r])
    bought = bool(sim.rc_bldg[0, r, j, wb])
    assert bought, "founder with Temple + complete Holy Site + faith did not buy its worship building"

    # control OWN: same state, but the city already owns the worship building ->
    # no purchase, yet identical worship-building income. faith_own - faith_buy
    # isolates the flat 114 debit.
    sim.restore(base)
    sim.rc_bldg[0, r, j, wb] = True
    sim._rival_phase()
    faith_own = float(sim.r_faith[0, r])
    assert abs((faith_own - faith_buy) - cost) < 1e-6, (
        f"worship debit not exactly {cost} faith (own {faith_own} - buy {faith_buy} = {faith_own - faith_buy})"
    )

    # no Temple -> no buy at all
    sim.restore(base)
    sim.rc_bldg[0, r, j, TEMPLE] = False
    sim._rival_phase()
    assert not bool(sim.rc_bldg[0, r, j, wb]), "a founder WITHOUT the Temple must not buy a worship building"
    print(f"  e worship faith-buy OK (row {wb}=WORSHIP[(r+1)%5], -{cost} faith exact; no-Temple no-buy)")


def poke_rival_palace(rules, rj, path):
    """f. Rival PALACE: a founded capital's yields carry the palace row
    (+2 prod/+5 gold/+2 sci/+1 cul; a non-capital does not); the per-j path and
    the D-9 batched twin agree column-for-column; housing/amenity are wired."""
    sim = build(rules, path)
    r, j = 0, 0
    assert bool(sim.rc_alive[0, r, j]) and bool(sim.rc_is_cap[0, r, j]), "rival slot 0 must be a live capital"
    py = sim._palace_y  # [food, prod, gold, sci, cul, faith]
    assert py.tolist() == [0, 2, 5, 2, 1, 0], f"palace yields drifted: {py.tolist()}"

    # neutralise the OTHER capital-only terms (gov / beliefs / CS-envoy) so the
    # rc_is_cap toggle isolates the palace; pass amen_yf=1 so nothing scales.
    sim._gov_has_effects = False
    sim.r_pantheon[:, r] = -1
    sim.r_follower[:, r] = -1
    sim.cs_r_envoys[:, r] = 0
    one = torch.ones(sim.B, dtype=torch.float64)
    mask = sim.rc_alive[:, r, j]

    y_cap = sim._rival_city_yields(r, j, mask, amen_yf=one)  # (food,prod,sci,cul,gold,faith)
    sim.rc_is_cap[0, r, j] = False
    y_non = sim._rival_city_yields(r, j, mask, amen_yf=one)
    sim.rc_is_cap[0, r, j] = True
    diff = [float(y_cap[k][0] - y_non[k][0]) for k in range(6)]
    # return order: food, prod, sci, cul, gold, faith
    assert diff == [0.0, 2.0, 2.0, 1.0, 5.0, 0.0], f"palace-row contribution wrong: {diff}"

    # per-j path == D-9 batched twin, column-for-column, on the poked state
    af = sim._rival_amenity(r)[2]  # [B, RC]
    allc = sim._rival_city_yields_all(r, amen_yf=af)  # 6 x [B, RC]
    for jj in sim.rc_alive[0, r].nonzero(as_tuple=True)[0].tolist():
        m = sim.rc_alive[:, r, jj]
        pj = sim._rival_city_yields(r, jj, m, amen_yf=af[:, jj])
        for k in range(6):
            a, b = float(pj[k][0]), float(allc[k][0, jj])
            assert abs(a - b) < 1e-9, f"per-j vs batched twin disagree (city {jj}, col {k}): {a} != {b}"

    # housing / amenity constants wired; the palace amenity never lowers the tier
    assert sim._palace_housing == 1.0 and sim._palace_amenities == 1.0, "palace housing/amenity must be +1/+1"
    yf_on = float(sim._rival_amenity(r)[2][0, j])
    sim.rc_is_cap[0, r, j] = False
    yf_off = float(sim._rival_amenity(r)[2][0, j])
    sim.rc_is_cap[0, r, j] = True
    assert yf_on >= yf_off, "the palace amenity must not reduce the capital's amenity factor"
    print("  f rival PALACE OK (+2p/+5g/+2s/+1c capital row; per-j==batched twin; housing/amenity wired)")


def poke_gp_district_accrual(rules, rj, path):
    """g. GP-district accrual: the ENGINEER/GENERAL/ARTIST classes (GP_CLASS_
    DISTRICT -> IZ / ENCAMPMENT / THEATER_SQUARE) now accrue GPP for a rival
    that owns a COMPLETED district of that type — newly reachable this round."""
    sim = build(rules, path)
    r, j = 0, 0
    assert bool(sim.rc_alive[0, r, j]), "rival capital must be alive"
    IZ, EN, TS = didx(rj, "INDUSTRIAL_ZONE"), didx(rj, "ENCAMPMENT"), didx(rj, "THEATER_SQUARE")

    # one representative GP class per new district, via GP_CLASS_DISTRICT
    gcd = sim._gp_class_district.tolist()
    targets = []
    for dcls in (IZ, EN, TS):
        cls = next((c for c in range(sim._gp_nc) if gcd[c] == dcls), None)
        assert cls is not None, f"no GP class maps to district {dcls}"
        targets.append((cls, dcls))

    # prevent the shared-pool earn/consume from decrementing r_gpp mid-phase
    for cls, _ in targets:
        sim.gp_earned[:, cls] = int(sim._gp_roster[cls])

    tiles = free_tiles(sim, len(targets))
    before = {}
    for (cls, dcls), T in zip(targets, tiles):
        sim.district[0, T] = dcls
        sim.district_complete[0, T] = True
        sim.district_pillaged[0, T] = False
        sim.rc_dist_tile[0, r, j, dcls] = T
        before[cls] = float(sim.r_gpp[0, r, cls])

    sim._rival_phase()
    for cls, dcls in targets:
        after = float(sim.r_gpp[0, r, cls])
        assert after > before[cls], (
            f"GP class {cls} (district {dcls}) accrued nothing: {before[cls]} -> {after}"
        )
    print(f"  g GP-district accrual OK (classes {[c for c, _ in targets]} accrue for IZ/ENCAMPMENT/THEATER_SQUARE)")


def poke_float32_dtype(rules, path):
    """h. Every NEW round tensor (_b_local_f/_b_regional/_b_worship + the walk
    reg_y/reg_am terms) is consistent under a float32 build: step 30 turns with
    dtype=torch.float32 and hit no dtype-mismatch crash (the battery's f32
    gumbel-lane class of bug)."""
    sim = build(rules, path, steps=30, dtype=torch.float32)
    assert sim._b_local_f.dtype == torch.float32, "walk-dtype local-building mask must follow the sim dtype"
    assert sim._b_regional.dtype == torch.bool and sim._b_worship.dtype == torch.bool, "regional/worship masks are bool"
    # the walk reg_y/reg_am blocks fired during the 30 steps without a crash

    # #78 REGRESSION: the f32 build must WORK THE SAME TILES as the f64 build.
    # The tie-breaks (worked-tile pick, _auto_pick) run on a forced-f64 key
    # because an index epsilon of 1e-9 sits below the f32 ULP of a score around
    # 40 and rounds away entirely — leaving topk to resolve exact ties by its
    # own order, i.e. the HIGHEST index where TS takes the lowest. That bug was
    # invisible to every gate (all f64) and corrupted only the f32 RL lanes.
    # Real tile scores are separated by halves, far above f32 noise (~4e-6), so
    # identical picks must produce city yields equal well inside 1e-3; a single
    # swapped tile moves a yield by >= 0.5.
    # Asserted on INTEGER state only: it is exactly comparable across dtypes
    # (float accumulators carry legitimate f32 noise), and a swapped tile feeds
    # straight into growth and build timing, so pop/techs move with it.
    #
    # #78: the tie-break key must be f64 even in an f32 build. Asserted on the
    # CONSTRUCT, not on end-to-end agreement, and the difference matters:
    #
    # f32 and f64 accumulators diverge from TURN 1 (measured on seed9002: max
    # |f32-f64| = 2.9e-07 at t1, growing monotonically to ~5e-05 by t48). Every
    # discrete comparison in the engine — `mp >= cost`, `food >= need`, any
    # score ranking — therefore lands on opposite sides eventually. f32-vs-f64
    # end-to-end equality is NOT an invariant and must never be asserted: an
    # earlier version of this poke asserted exactly that at 120 turns, which
    # passed only by where the boundaries happened to fall on one fixture.
    #
    # What IS invariant is that the tie-break key carries enough precision to
    # hold the index epsilon. A 1e-9 epsilon sits far below the f32 ULP of a
    # score around 40 (~4e-6), so on self.dtype=f32 it rounded away completely
    # and topk resolved exact ties by its own order — taking the HIGHEST index
    # where TS (`b.score - a.score || a.index - b.index`) takes the lowest.
    # Reverting the .double() flips this assert immediately, on any fixture,
    # with no reachability question to measure.
    assert sim._tiebreak_key_dtype == torch.float64, (
        f"worked-tile tie-break key is {sim._tiebreak_key_dtype} in an f32 build — "
        "the index epsilon rounds away below the f32 ULP and ties invert vs TS"
    )
    print("  h float32 dtype OK (30 turns, reg_y/reg_am + masks consistent; tie-break key forced f64)")


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text())
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    path = paths[0]
    print(f"district_breadth_test on {path.name}")

    poke_iz_ec_adjacency(rules, rj, path)
    poke_encampment_placement(rules, rj, paths)
    poke_regional_channel(rules, rj, path)
    poke_exclusive_with(rules, rj, path)
    poke_worship_buy(rules, rj, path)
    poke_rival_palace(rules, rj, path)
    poke_gp_district_accrual(rules, rj, path)
    poke_float32_dtype(rules, path)
    print("DISTRICT BREADTH (A-9) POKES OK")


if __name__ == "__main__":
    main()
