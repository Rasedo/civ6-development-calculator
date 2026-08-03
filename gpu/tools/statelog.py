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

import torch

_IMP = None


def _milli(x):
    """Integer milli-units, round-half-UP — matches JS Math.round(x*1000). Python's
    .3f/round() are round-half-to-EVEN, which disagrees with JS toFixed on exactly-
    dyadic .5-milli values (e.g. 2.0625 -> 2.062 vs 2.063), a pure display artifact."""
    return int(math.floor(float(x) * 1000 + 0.5))


def _imp_name(sim, i):
    global _IMP
    if _IMP is None:
        # A-13: data-driven over the exported roster so QUARRY/PASTURE/CAMP/
        # PLANTATION/OIL_WELL print by name (the TS statelog prints
        # t.improvement verbatim — logdiff must align).
        _IMP = dict(enumerate(getattr(sim, "_imp_ids", []) or []))
        if not _IMP:
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
    nb = sim.rules_dev.b_cost.shape[0]
    if c <= sim.NU + len(sim._scaffold) + nb:
        return "building"
    if c <= sim.NU + len(sim._scaffold) + nb + len(sim._proj_rows):
        return "project"  # A-14
    return "wonder"  # A-4


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
        f"gp:{','.join(str(int(x)) for x in sim.gp_earned[b].tolist())} "
        f"ers:{int(sim.era_score[b, 0])} age:{int(sim.civ_age[b, 0])} "  # B-24: player era score + Age (esc is empire score)
        f"esc:{_milli(sim.empire_score()[b])}"
    )
    for pp in range(sim.p_alive.shape[1]):
        if bool(sim.p_alive[b, pp]):
            L.append(f"{p}PU {int(sim.p_tile[b, pp])} = t{int(sim.p_type[b, pp])} hp{int(sim.p_hp[b, pp])}")
    _bn, _bh, _ba = Counter(), Counter(), Counter()
    for u in range(sim.u_alive.shape[1]):
        if bool(sim.u_alive[b, u]):
            t_ = int(sim.u_tile[b, u])
            _bn[t_] += 1
            _bh[t_] += int(sim.u_hp[b, u])
            _ba[t_] += int(bool(sim.u_mp[b, u] < sim.u_mp_full[b, u]))
    for tile in sorted(_bn):
        L.append(f"{p}BU {tile} = {_bn[tile]} hp{_bh[tile]} a{_ba[tile]}")
    # barb CAMPS (P5/S6 hunt: camp LOCATIONS were invisible — only the
    # count is traced, and a draw-picked spot divergence cascades silently)
    for kk in range(sim.camp_tile.shape[1]):
        if int(sim.camp_tile[b, kk]) >= 0:
            L.append(f"{p}CA {int(sim.camp_tile[b, kk])} = 1")
    if hasattr(sim, "v_alive"):
        _rn, _rh, _ra = Counter(), Counter(), Counter()
        for v in range(sim.v_alive.shape[1]):
            if bool(sim.v_alive[b, v]):
                k = (int(sim.v_civ[b, v]), int(sim.v_tile[b, v]), int(sim.v_type[b, v]))
                _rn[k] += 1
                _rh[k] += int(sim.v_hp[b, v])
                _ra[k] += int(bool(sim.v_mp[b, v] < sim.v_mp_full[b, v]))
        for k in sorted(_rn):
            L.append(f"{p}RU{k[0]} {k[1]} t{k[2]} = {_rn[k]} hp{_rh[k]} a{_ra[k]}")

    imp, pill = sim.improvement[b], sim.pillaged[b]
    # TS carries district='CITY_CENTER' on every city-center tile (center_at /
    # rvcity_at here), plus specialty districts in self.district — merge for parity.
    has_d = (sim.district[b] >= 0) | (sim.center_at[b] >= 0) | (sim.rvcity_at[b] >= 0)
    mask = (imp >= 0) | pill.bool() | has_d
    rp = sim.res_priority[b] * (~sim.res_stripped[b]).long()  # C-6: live priority (paved bonus = gone)
    for idx in mask.nonzero(as_tuple=True)[0].tolist():
        L.append(f"{p}TI {idx} = i:{_imp_name(sim, int(imp[idx]))} pill:{int(bool(pill[idx]))} dist:{int(bool(has_d[idx]))} rp:{int(rp[idx])}")

    dmask = sim.district[b] >= 0
    for idx in dmask.nonzero(as_tuple=True)[0].tolist():
        L.append(f"{p}TD {idx} = td{int(sim.tdef[b, idx])} dc{int(bool(sim.district_complete[b, idx]))}")

    for c in range(sim.alive.shape[1]):
        if bool(sim.alive[b, c]):
            L.append(
                f"{p}PC {int(sim.site[b, c])} = pop{int(sim.pop[b, c])} "
                f"pr{_milli(sim.progress[b, c])} fbox{_milli(sim.food_box[b, c])} "
                f"loy{_milli(sim.loyalty[b, c])} "
                f"hp{int(sim.city_hp[b, c])} til{int(sim.tiles_acquired[b, c])} nbld{int(sim.buildings[b, c].sum())} "
                f"yf{_milli(_ct[b, c, 0])} yp{_milli(_ct[b, c, 1])} yg{_milli(_ct[b, c, 2])} "
                f"ys{_milli(_ct[b, c, 3])} yc{_milli(_ct[b, c, 4])} yfa{_milli(_ct[b, c, 5])}"
            )

    # Phase-1 combat log: drain the step's damage rolls (engine _damage_roll
    # buffers them for the logged batch) into keyed CB lines.
    ev = getattr(sim, "_combat_events", None)
    if ev:
        for i, e in enumerate(ev):
            L.append(f"{p}CB{i} = {e}")
        ev.clear()

    for r in range(sim.R):
        nc = int(sim.rc_alive[b, r].sum())
        if nc == 0:
            continue
        pop = int((sim.rc_pop[b, r] * sim.rc_alive[b, r].long()).sum())
        L.append(
            f"{p}RT{r} = ncity{nc} pop{pop} treas{_milli(sim.r_treasury[b, r])} fai{_milli(sim.r_faith[b, r])} "
            f"ntech{int(sim.r_techs[b, r].sum())} nciv{int(sim.r_civics[b, r].sum())} war{int(bool(sim.r_atwar[b, r]))} "
            f"ww{int(sim._ww_sum(r + 1)[b])} rrw{sum((1 << j) for j in range(sim.R) if bool(sim.rr_war[b, r, j]))} rrk{sum((1 << j) for j in range(sim.R) if bool(sim.rr_warkind[b, r, j]))} ers{int(sim.era_score[b, r + 1])} age{int(sim.civ_age[b, r + 1])} "
            f"terr:{int((sim.rival_at[b] == r).sum())} wterr:{int(((sim.rival_at[b] == r) & sim.water[b]).sum())} "
            f"tsum:{int(((sim.rival_at[b] == r) * torch.arange(sim.T, device=sim.device)).sum())} "
            f"rsc:{_milli(sim.rival_empire_score(r)[b])}"
        )
        for j in range(sim.rc_alive.shape[2]):
            if bool(sim.rc_alive[b, r, j]):
                _ry = sim._rival_city_yields(r, j, sim.rc_alive[:, r, j])
                L.append(f"{p}RC{r} {int(sim.rc_center[b, r, j])} = pop{int(sim.rc_pop[b, r, j])} pr{_milli(sim.rc_progress[b, r, j])} co{_milli(sim.rc_cost[b, r, j])} k{_rc_kind(sim, int(sim.rc_current[b, r, j]))} hp{int(sim.rc_hp[b, r, j])} loy{_milli(sim.rc_loyalty[b, r, j])} cb{_milli(sim.rc_cbox[b, r, j])} til{int(sim.rc_acquired[b, r, j])} ryf{_milli(_ry[0][b])} ryp{_milli(_ry[1][b])}")
    return L
