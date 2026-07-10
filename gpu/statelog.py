"""Phase-1 divergence log: a canonical, per-turn dump of ONE game's full state,
emitted line-for-line identically by the GPU engine (here) and the TS replay
(scripts/statelog.ts). `gpu/logdiff.py` diffs the two and prints the FIRST
divergent line — turning the old patch-both-engines-and-eyeball loop into one run.

Every line is `<turn> <cat> <key> = <value>`; both sides sort before writing so a
plain line diff aligns by (turn, cat, key). Keys are TILE/CENTER indices and unit
tiles (stable, engine-agnostic), never array slots.
"""
import math
from collections import Counter

_IMP = None


def _milli(x):
    """Integer milli-units, round-half-UP — matches JS Math.round(x*1000). Python's
    .3f/round() are round-half-to-EVEN, which disagrees with JS toFixed on exactly-
    dyadic .5-milli values (e.g. 2.0625 -> 2.062 vs 2.063), a pure display artifact."""
    return int(math.floor(float(x) * 1000 + 0.5))


def _imp_name(sim, i):
    global _IMP
    if _IMP is None:
        _IMP = {sim.FARM: "FARM", sim.MINE: "MINE", sim.LUMBER: "LUMBER_MILL"}
    return _IMP.get(i, f"#{i}") if i >= 0 else "-"


def _rc_kind(sim, c):
    """Decode a rival rc_current code to a TS-matching queue kind."""
    if c < 0:
        return "idle"
    if c == 0:
        return "settler"
    if c <= sim.NU:
        return "unit"
    if c < 1 + sim.NU + len(sim._scaffold):
        return "district"
    return "building"


def gpu_state_lines(sim, b):
    T, L = int(sim.turn), []
    p = f"{T} "
    _ct = sim._city_totals()[0]  # [B,C,6] per-city yields (food,prod,gold,sci,cul,faith) — Harbor-stage diag

    ncity = int(sim.alive[b].sum())
    nunit = int(sim.p_alive[b].sum())
    L.append(
        f"{p}PT = treas:{_milli(sim.treasury[b])} sci:{_milli(sim.science_total[b])} "
        f"cul:{_milli(sim.culture_total[b])} ntech:{int(sim.techs[b].sum())} "
        f"nciv:{int(sim.civics[b].sum())} nset:{int(sim.settlers[b])} ncity:{ncity} nunit:{nunit} "
        f"umaint:{_milli((sim.p_alive[b] * sim._p_maint[sim.p_type[b]]).sum())} "
        f"gp:{','.join(str(int(x)) for x in sim.gp_earned[b].tolist())}"
    )
    for pp in range(sim.p_alive.shape[1]):
        if bool(sim.p_alive[b, pp]):
            L.append(f"{p}PU {int(sim.p_tile[b, pp])} = t{int(sim.p_type[b, pp])} hp{int(sim.p_hp[b, pp])}")
    _bn, _bh = Counter(), Counter()
    for u in range(sim.u_alive.shape[1]):
        if bool(sim.u_alive[b, u]):
            t_ = int(sim.u_tile[b, u])
            _bn[t_] += 1
            _bh[t_] += int(sim.u_hp[b, u])
    for tile in sorted(_bn):
        L.append(f"{p}BU {tile} = {_bn[tile]} hp{_bh[tile]}")
    if hasattr(sim, "v_alive"):
        for k, n in sorted(Counter((int(sim.v_civ[b, v]), int(sim.v_tile[b, v]), int(sim.v_type[b, v])) for v in range(sim.v_alive.shape[1]) if bool(sim.v_alive[b, v])).items()):
            L.append(f"{p}RU{k[0]} {k[1]} t{k[2]} = {n}")

    imp, pill = sim.improvement[b], sim.pillaged[b]
    # TS carries district='CITY_CENTER' on every city-center tile (center_at /
    # rvcity_at here), plus specialty districts in self.district — merge for parity.
    has_d = (sim.district[b] >= 0) | (sim.center_at[b] >= 0) | (sim.rvcity_at[b] >= 0)
    mask = (imp >= 0) | pill.bool() | has_d
    for idx in mask.nonzero(as_tuple=True)[0].tolist():
        L.append(f"{p}TI {idx} = i:{_imp_name(sim, int(imp[idx]))} pill:{int(bool(pill[idx]))} dist:{int(bool(has_d[idx]))}")

    dmask = sim.district[b] >= 0
    for idx in dmask.nonzero(as_tuple=True)[0].tolist():
        L.append(f"{p}TD {idx} = td{int(sim.tdef[b, idx])} dc{int(bool(sim.district_complete[b, idx]))}")

    for c in range(sim.alive.shape[1]):
        if bool(sim.alive[b, c]):
            L.append(
                f"{p}PC {int(sim.site[b, c])} = pop{int(sim.pop[b, c])} "
                f"pr{_milli(sim.progress[b, c])} fbox{_milli(sim.food_box[b, c])} "
                f"hp{int(sim.city_hp[b, c])} til{int(sim.tiles_acquired[b, c])} nbld{int(sim.buildings[b, c].sum())} "
                f"yf{_milli(_ct[b, c, 0])} yp{_milli(_ct[b, c, 1])} yg{_milli(_ct[b, c, 2])} "
                f"ys{_milli(_ct[b, c, 3])} yc{_milli(_ct[b, c, 4])} yfa{_milli(_ct[b, c, 5])}"
            )

    for r in range(sim.R):
        nc = int(sim.rc_alive[b, r].sum())
        if nc == 0:
            continue
        pop = int((sim.rc_pop[b, r] * sim.rc_alive[b, r].long()).sum())
        L.append(
            f"{p}RT{r} = ncity{nc} pop{pop} treas{_milli(sim.r_treasury[b, r])} "
            f"ntech{int(sim.r_techs[b, r].sum())} nciv{int(sim.r_civics[b, r].sum())} war{int(bool(sim.r_atwar[b, r]))} "
            f"terr:{int((sim.rival_at[b] == r).sum())} wterr:{int(((sim.rival_at[b] == r) & sim.water[b]).sum())}"
        )
        for j in range(sim.rc_alive.shape[2]):
            if bool(sim.rc_alive[b, r, j]):
                L.append(f"{p}RC{r} {int(sim.rc_center[b, r, j])} = pop{int(sim.rc_pop[b, r, j])} pr{_milli(sim.rc_progress[b, r, j])} co{_milli(sim.rc_cost[b, r, j])} k{_rc_kind(sim, int(sim.rc_current[b, r, j]))}")
    return L
