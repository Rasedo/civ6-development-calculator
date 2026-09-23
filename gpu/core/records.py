"""THE WIRE RECORD, GPU side: encode the driver's decisions into it, decode it
back into engine calls, apply decisions to the sim, and run driven rollouts.

`policy/drive.py` DECIDES and writes nothing; everything here touches the
engine. The caller puts `policy/` on sys.path (this module imports the
driver, never the other way round).

ACTION FILE SCHEMA v3 — THE FILE IS THE INTERFACE.

Both engines parse this, so it records DECISIONS, never derived state: a
replay must be able to reproduce the run without re-deriving anything the
policy knew. Per turn, per driven seat:
    {"turn": t, "s<seatRow>": {
        "production": [[centreTile, col], ...]  one entry per city that acts;
                                 a DISTRICT column carries a third element,
                                 the TILE to build it on, because WHERE a
                                 district goes is a decision and neither
                                 engine may pick it (v3)
        "tech": col | None       None = no pick
        "civic": col | None
        "policies": [i, ...]     the SLOTTED policy cards as table indices, a
                                 SET (v3+); absent = no decision this turn
        "units": [[N], ...]      one entry per unit STEP this turn, since a
                                 unit may act several times
    }}
plus the optional fields the extractors below document (war, warKind, envoys,
buy, buyFaith, levy, and the geo intents). Codes are the MASK layouts
(`seat_masks`, `_seat_unit_mask`), one layout for every seat, so the same file
can drive any of them.
The CITY AXIS is keyed by CENTRE TILE, not index: the recorder reads cities by
GPU slot and TS applies by founding-order array position, and the two diverge
exactly when compaction or capture reorders slots — match cities by centre,
never by slot. The UNITS axis stays positional: the engines deliberately
mirror unit order (TS splices captured units to the END because the GPU
appends; deaths drop identically from both).
"""
from __future__ import annotations

import json
from pathlib import Path

import torch

import drive
import ladder
from . import simbase

SCHEMA_VERSION = 3


def take_seat(sim, row: int) -> None:
    sim.seat_ext[:, row] = True


def apply_decisions(sim, row: int, dec: dict) -> None:
    """Stash one seat's non-unit decisions (the DECIDE_FIELDS names) for the
    step to apply. production_tile rides along or the drive and its own record
    diverge: a district column without its tile is refused at the apply, while
    the replay side passes the recorded tile and places it."""
    sim.apply_seat_actions(row, production=dec["prod"], production_tile=dec["dtile"], tech=dec["tech"],
                           civic=dec["civic"], policies=dec["policies"], war=dec["war"], war_kind=dec["war_kind"],
                           envoys=dec["env_seq"], buy=dec["buy"], worship=dec["worship"], relig=dec["relig"],
                           levy=dec["levy"], monu=dec["monu"], nat=dec["nat"], cls=dec["cls"], ucls=dec["ucls"],
                           pat=dec["pat"], band=dec["band"], dist=dec["dist"], route=dec["route"], nuke=dec["nuke"],
                           spec=dec["spec"], lock=dec["lock"], swap=dec["swap"], vote=dec["vote"],
                           gp_pass=dec["gp_pass"])


def stash_units(sim, row: int, seq: torch.Tensor) -> None:
    """Park one seat's [B, N, K] unit plan for the phase to execute."""
    if not hasattr(sim, "_driven_useq") or sim._driven_useq is None:
        sim._driven_useq = {}
    sim._driven_useq[row] = seq


def decide_and_apply(env, sim, row: int, roster: dict, classes: dict, max_steps: int = 4,
                     seeds=None, turn=None, pre: dict | None = None) -> tuple:
    """One seat's turn: decide, stash the decisions, then plan and stash the
    units — the unit plan is taken AFTER the seat's other decisions are
    stashed, the order the step has always seen. Returns the positional
    record in `drive.DECIDE_FIELDS` order."""
    dec = drive.decide_seat(env, sim, row, roster, classes, seeds=seeds, turn=turn, pre=pre)
    apply_decisions(sim, row, dec)
    dec["seq"] = drive.plan_units(sim, row, max_steps, pre=pre)
    stash_units(sim, row, dec["seq"])
    return tuple(dec[f] for f in drive.DECIDE_FIELDS)


def geo_decide_and_apply(sim, seeds=None):
    geo = drive.decide_geo(sim, seeds)
    den, frd, ally, bord, gift, deleg, off, acc, ally_ty = geo
    for row in range(sim.n_majors):
        sim.apply_geo(row, denounce=den[:, row], friend=frd[:, row], ally=ally[:, row],
                      ally_type=ally_ty[:, row], borders=bord[:, row], gift=gift[:, :, row],
                      delegation=deleg[:, row], offer=off[:, row], accept=acc[:, row])
    return geo


def extract_geo(geo, row: int, b: int) -> dict:
    den, frd, ally, bord, gift, deleg, off, acc, ally_ty = geo
    out = {}
    for name, want in (("denounce", den), ("friend", frd), ("ally", ally), ("borders", bord),
                       ("delegation", deleg)):
        tl = want[b, row].nonzero(as_tuple=True)[0].tolist()
        if tl:
            out[name] = tl
    if "ally" in out:
        out["allyType"] = [int(ally_ty[b, row, j]) for j in out["ally"]]
    gl = [[int(k), int(j)] for k, j in gift[b, :, row].nonzero(as_tuple=False).tolist()]
    if gl:
        out["gift"] = gl
    al = acc[b, row].nonzero(as_tuple=True)[0].tolist()
    if al:
        out["accept"] = [int(j) for j in al]
    to = int(off[b, row, 0])
    if to >= 0:
        di = (off.shape[2] - 1) // 6

        def _bundle(base: int) -> list:
            r = []
            for s in range(di):
                k = int(off[b, row, base + s * 3])
                if k >= 0:
                    r.append([k, int(off[b, row, base + s * 3 + 1]),
                              int(off[b, row, base + s * 3 + 2])])
            return r

        out["offer"] = [to, _bundle(1), _bundle(1 + di * 3)]
    return out


def extract_record(sim, row: int, prod, dtile, tech, civic, war, war_kind, env_seq, seq, buy, worship, relig, levy, monu, nat, cls, ucls, pat, band, dist, route, nuke, spec, lock, swap, vote, gp_pass, policies, b: int) -> dict:
    _pr = prod[b]
    _ctr = sim.city_center[b, row]
    _alive_c = sim.city_alive[b, row]
    nS = 0 if dtile is None else int(dtile.shape[2])
    prod_pairs = []
    for j in range(min(int(_pr.shape[0]), int(_ctr.shape[0]))):
        col = int(_pr[j])
        if col < 0 or not bool(_alive_c[j]):
            continue
        pair = [int(_ctr[j]), col]
        si = col - sim.DISTRICT_BASE
        if 0 <= si < nS:
            pair.append(int(dtile[b, j, si]))  # a DISTRICT column names its tile
        prod_pairs.append(pair)
    _t = None if tech is None or int(tech[b]) < 0 else int(tech[b])
    _c = None if civic is None or int(civic[b]) < 0 else int(civic[b])
    rows = [seq[b, :, k].tolist() for k in range(int(seq.shape[2]))]
    while len(rows) > 1 and all(x < 0 for x in rows[-1]):
        rows.pop()
    _w = None if war is None or int(war[b]) < 0 else int(war[b])
    _e = [] if env_seq is None else [int(x) for x in env_seq[b].tolist() if int(x) >= 0]
    rec = {"production": prod_pairs, "tech": _t, "civic": _c, "war": _w, "envoys": _e, "units": rows}
    if _w is not None and war_kind is not None and int(war_kind[b]) >= 0:
        rec["warKind"] = int(war_kind[b])  # the WAR_KINDS code the declaration takes
    if policies is not None:
        rec["policies"] = [i for i in range(int(policies.shape[1])) if bool(policies[b, i])]
    rec.update(buy_record_fields(sim, row, b, buy, worship, relig, levy, monu, nat, cls, ucls, pat, band, dist))
    if route is not None and int(route[0][b]) >= 0:
        rec["route"] = [int(route[0][b]), int(route[1][b])]
    if nuke is not None and int(nuke[0][b]) >= 0 and int(nuke[1][b]) >= 0:
        rec["nuke"] = [int(nuke[0][b]), int(nuke[1][b])]
    if spec is not None:
        pins = [[int(_ctr[j]), di, int(spec[b, j, di])]
                for j in range(int(spec.shape[1])) if bool(_alive_c[j])
                for di in range(int(spec.shape[2])) if int(spec[b, j, di]) > simbase.SPEC_KEEP]
        if pins:
            rec["specialists"] = pins
    if lock is not None:
        flips = [int(x) for x in lock[b].tolist() if int(x) >= 0]
        if flips:
            rec["lockTiles"] = flips
    if swap is not None:
        swaps = [[int(swap[b, k, 0]), int(swap[b, k, 1])] for k in range(int(swap.shape[1]))
                 if int(swap[b, k, 0]) >= 0 and int(swap[b, k, 1]) >= 0]
        if swaps:
            rec["swapTiles"] = swaps
    if vote is not None:
        ballot = [[int(vote[b, k, f]) for f in range(3)] for k in range(vote.shape[1])]
        ballot = [e if e[0] >= 0 else None for e in ballot]
        if any(e is not None for e in ballot):
            rec["vote"] = ballot
    if gp_pass is not None and int(gp_pass[b]) >= 0:
        rec["gpPass"] = int(gp_pass[b])
    return rec


def buy_record_fields(sim, row: int, b: int, buy, worship, relig, levy, monu=None, nat=None, cls=None, ucls=None, pat=None, band=None, dist=None) -> dict:
    """The GOLD/FAITH/LEVY half of a seat's record, for ANY seat row — every
    city reference is CENTRE-KEYED like production, because ids are
    engine-local and centres are the shared vocabulary. Every field is
    OPTIONAL: absent = no purchase of that kind this turn."""
    out: dict = {}
    RCn = int(sim.city_center.shape[2])

    def _centre(j: int) -> int | None:
        return int(sim.city_center[b, row, j]) if 0 <= j < RCn and bool(sim.city_alive[b, row, j]) else None

    if buy is not None:
        _k = int(buy[0][b])
        if _k == 0:
            _c = _centre(int(buy[1][b]))
            if _c is not None:
                out["buy"] = [0, _c, int(buy[2][b])]
        elif _k == 1:
            out["buy"] = [1, -1, -1]
        elif _k == 2:
            out["buy"] = [2, -1, -1]
        elif _k == 3:
            _c = _centre(int(buy[2][b]))
            if _c is not None:
                out["buy"] = [3, int(buy[1][b]), _c]
        elif _k == 4:
            out["buy"] = [4, int(buy[1][b]), -1]
        elif _k == 5:
            # DISTRICT: the SITE tile names the city, so no centre resolution.
            out["buy"] = [5, int(buy[1][b]), int(buy[2][b])]
    bf = []
    if worship is not None:
        _c = _centre(int(worship[b]))
        if _c is not None:
            bf.append([4, _c])
    if relig is not None and int(relig[0][b]) in (5, 6, 11, 14):
        _c = _centre(int(relig[1][b]))
        if _c is not None:
            bf.append([int(relig[0][b]), _c])
    if monu is not None and int(monu[0][b]) in (8, 9):
        _c = _centre(int(monu[1][b]))
        if _c is not None:
            bf.append([int(monu[0][b]), _c])
    if nat is not None and int(nat[0][b]) == 10:
        _c = _centre(int(nat[1][b]))
        if _c is not None:
            bf.append([10, _c])
    if band is not None and int(band[b]) >= 0:
        _c = _centre(int(band[b]))
        if _c is not None:
            bf.append([16, _c])
    if cls is not None and int(cls[1][b]) >= 0:
        _c = _centre(int(cls[0][b]))
        if _c is not None:
            bf.append([12, _c, int(cls[1][b])])
    if ucls is not None and int(ucls[1][b]) >= 0:
        _c = _centre(int(ucls[0][b]))
        if _c is not None:
            bf.append([13, _c, int(ucls[1][b])])
    if pat is not None and int(pat[b]) >= 0:
        bf.append([15, -1, int(pat[b])])
    if dist is not None and int(dist[0][b]) >= 0 and int(dist[1][b]) >= 0:
        bf.append([17, int(dist[0][b]), int(dist[1][b])])
    if bf:
        out["buyFaith"] = bf
    if levy is not None and int(levy[b]) >= 0:
        out["levy"] = int(levy[b])
    return out


def replay_seat(sim, row: int, rec: dict) -> None:
    """Apply ONE recorded turn for seat `row` without consulting the ladder.

    This is the half of the interface the TS engine has to implement. It must
    touch no policy at all — if a replay needs to ask the ladder anything, the
    file is not a complete record of the decisions and TS could never reproduce
    the run from it.
    """
    dev = sim.device
    prod = torch.full((sim.B, sim.RC), -1, dtype=torch.long, device=dev)
    nS = len(sim._scaffold) if sim.districts_on else 0
    dtile = torch.full((sim.B, sim.RC, nS), -1, dtype=torch.long, device=dev) if nS else None
    for ent in rec["production"]:
        centre, col = int(ent[0]), int(ent[1])
        hit = (sim.city_center[:, row] == centre) & sim.city_alive[:, row]
        prod = torch.where(hit, torch.full_like(prod, col), prod)
        si = col - sim.DISTRICT_BASE
        if dtile is not None and 0 <= si < nS:
            # a district column carries its TILE as the pair's third element
            t = int(ent[2]) if len(ent) > 2 else -1
            dtile[:, :, si] = torch.where(hit, torch.full_like(dtile[:, :, si], t), dtile[:, :, si])
    # [B] like the war arm below — a bare torch.tensor(int) is 0-dim and the
    # record apply gathers on dim 1.
    tech = None if rec["tech"] is None else torch.full((sim.B,), int(rec["tech"]), dtype=torch.long, device=dev)
    civic = None if rec["civic"] is None else torch.full((sim.B,), int(rec["civic"]), dtype=torch.long, device=dev)
    # the slotted cards, a SET of table indices
    _pv = rec.get("policies")
    policies = None
    if _pv is not None:
        policies = torch.zeros(sim.B, max(sim._npol, 1), dtype=torch.bool, device=dev)
        for _i in _pv:
            if 0 <= int(_i) < sim._npol:
                policies[:, int(_i)] = True
    _wv = rec.get("war")
    war = None if _wv is None else torch.full((sim.B,), int(_wv), dtype=torch.long, device=dev)
    _wk = rec.get("warKind")
    war_kind = None if _wk is None else torch.full((sim.B,), int(_wk), dtype=torch.long, device=dev)
    _ev = rec.get("envoys") or []
    env_seq = torch.tensor(_ev, dtype=torch.long, device=dev).reshape(1, -1).expand(sim.B, -1) if _ev else None
    # parse the CENTRE-KEYED buy intent back to tensors (the city resolution
    # rule — match by centre + alive, never by slot).
    _bv = rec.get("buy")
    buy = None
    if _bv is not None and int(_bv[0]) == 0:
        hitj = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        for j in range(sim.RC):
            m = (sim.city_center[:, row, j] == int(_bv[1])) & sim.city_alive[:, row, j]
            hitj = torch.where(m, torch.full_like(hitj, j), hitj)
        kind0 = torch.where(hitj >= 0, torch.zeros_like(hitj), torch.full_like(hitj, -1))
        buy = (kind0, hitj, torch.full((sim.B,), int(_bv[2]), dtype=torch.long, device=dev))
    elif _bv is not None and int(_bv[0]) == 1:
        neg1 = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        buy = (torch.ones((sim.B,), dtype=torch.long, device=dev), neg1, neg1)
    elif _bv is not None and int(_bv[0]) == 2:
        neg1 = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        buy = (torch.full((sim.B,), 2, dtype=torch.long, device=dev), neg1, neg1)
    elif _bv is not None and int(_bv[0]) == 4:
        neg1 = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        buy = (torch.full((sim.B,), 4, dtype=torch.long, device=dev),
               torch.full((sim.B,), int(_bv[1]), dtype=torch.long, device=dev), neg1)
    elif _bv is not None and int(_bv[0]) == 5:
        # DISTRICT: [5, siteTile, scaffoldRow]. No centre resolution — the
        # SITE names the city inside the engine, exactly as kind 3's tile does.
        buy = (torch.full((sim.B,), 5, dtype=torch.long, device=dev),
               torch.full((sim.B,), int(_bv[1]), dtype=torch.long, device=dev),
               torch.full((sim.B,), int(_bv[2]), dtype=torch.long, device=dev))
    elif _bv is not None and int(_bv[0]) == 3:
        # TILE: [3, tileIndex, centreTile] -> (kind, tile, slot) by centre
        # resolution (match by centre + alive, never by slot).
        hitj = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        for j in range(sim.RC):
            m3 = (sim.city_center[:, row, j] == int(_bv[2])) & sim.city_alive[:, row, j]
            hitj = torch.where(m3, torch.full_like(hitj, j), hitj)
        kind3 = torch.where(hitj >= 0, torch.full_like(hitj, 3), torch.full_like(hitj, -1))
        buy = (kind3, torch.full((sim.B,), int(_bv[1]), dtype=torch.long, device=dev), hitj)

    def _centre_slot(centre: int) -> torch.Tensor:
        hj = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        for j in range(sim.RC):
            mm = (sim.city_center[:, row, j] == centre) & sim.city_alive[:, row, j]
            hj = torch.where(mm, torch.full_like(hj, j), hj)
        return hj

    worship = relig = monu = nat = cls = ucls = pat = band = None
    dist = None
    for _ent in rec.get("buyFaith") or []:
        _fk, _fc = int(_ent[0]), int(_ent[1])
        if _fk == 15:
            pat = torch.full((sim.B,), int(_ent[2]), dtype=torch.long, device=dev)
            continue
        if _fk in (12, 13):
            _cjt = _centre_slot(_fc)
            _pair = (_cjt, torch.where(_cjt >= 0, torch.full_like(_cjt, int(_ent[2])), torch.full_like(_cjt, -1)))
            if _fk == 12:
                cls = _pair
            else:
                ucls = _pair
            continue
        if _fk == 4:
            worship = _centre_slot(_fc)
        elif _fk in (5, 6, 11, 14):
            _rjt = _centre_slot(_fc)
            relig = (torch.where(_rjt >= 0, torch.full_like(_rjt, _fk), torch.full_like(_rjt, -1)), _rjt)
        elif _fk in (8, 9):
            _mjt = _centre_slot(_fc)
            monu = (torch.where(_mjt >= 0, torch.full_like(_mjt, _fk), torch.full_like(_mjt, -1)), _mjt)
        elif _fk == 10:
            _njt = _centre_slot(_fc)
            nat = (torch.where(_njt >= 0, torch.full_like(_njt, 10), torch.full_like(_njt, -1)), _njt)
        elif _fk == 16:
            band = _centre_slot(_fc)
        elif _fk == 17:
            # a DISTRICT bought with FAITH: `a` is the SITE tile, not a centre.
            dist = (torch.full((sim.B,), _fc, dtype=torch.long, device=dev),
                    torch.full((sim.B,), int(_ent[2]), dtype=torch.long, device=dev))
    _lv = rec.get("levy")
    levy = None if _lv is None else torch.full((sim.B,), int(_lv), dtype=torch.long, device=dev)
    _rv = rec.get("route")
    route = None
    if _rv is not None:
        route = (torch.full((sim.B,), int(_rv[0]), dtype=torch.long, device=dev),
                 torch.full((sim.B,), int(_rv[1]), dtype=torch.long, device=dev))
    _nv = rec.get("nuke")
    nuke = None
    if _nv is not None:
        nuke = (torch.full((sim.B,), int(_nv[0]), dtype=torch.long, device=dev),
                torch.full((sim.B,), int(_nv[1]), dtype=torch.long, device=dev))
    _sp = rec.get("specialists") or []
    spec = None
    if _sp:
        nD = sim.city_spec_pin.shape[3]
        spec = torch.full((sim.B, sim.RC, nD), simbase.SPEC_KEEP, dtype=torch.long, device=dev)
        for _c, _di, _n in _sp:
            _hj = _centre_slot(int(_c))
            _rw = (_hj >= 0).nonzero(as_tuple=True)[0]
            if len(_rw) and 0 <= int(_di) < nD:
                spec[_rw, _hj[_rw], int(_di)] = int(_n)
    _lk = rec.get("lockTiles") or []
    lock = (torch.tensor(_lk, dtype=torch.long, device=dev).reshape(1, -1).expand(sim.B, -1)
            if _lk else None)
    _sw = rec.get("swapTiles") or []
    swap = (torch.tensor(_sw, dtype=torch.long, device=dev).reshape(1, -1, 2).expand(sim.B, -1, -1)
            if _sw else None)
    _vt = rec.get("vote") or []
    vote = None
    if any(e is not None for e in _vt):
        _kn = sim.civ_congress_vote.shape[2]
        vote = torch.full((sim.B, _kn, 3), -1, dtype=torch.long, device=dev)
        for _k, _ent in enumerate(_vt[:_kn]):
            if _ent is None:
                continue
            for _f in range(3):
                vote[:, _k, _f] = int(_ent[_f])
    _gpv = rec.get("gpPass")
    gp_pass = (torch.full((sim.B,), int(_gpv), dtype=torch.long, device=dev)
               if _gpv is not None and int(_gpv) >= 0 else None)
    apply_decisions(sim, row, {
        "prod": prod, "dtile": dtile, "tech": tech, "civic": civic, "policies": policies,
        "war": war, "war_kind": war_kind, "env_seq": env_seq, "buy": buy, "worship": worship,
        "relig": relig, "levy": levy, "monu": monu, "nat": nat, "cls": cls, "ucls": ucls,
        "pat": pat, "band": band, "dist": dist, "route": route, "nuke": nuke, "spec": spec,
        "lock": lock, "swap": swap, "vote": vote, "gp_pass": gp_pass})

    def _geo_mask(seats) -> torch.Tensor:
        m = torch.zeros(sim.B, sim.n_majors, dtype=torch.bool, device=dev)
        for j in seats:
            if 0 <= int(j) < sim.n_majors:
                m[:, int(j)] = True
        return m

    geo_kwargs = {}
    for _name in ("denounce", "friend", "ally", "delegation", "borders", "accept"):
        if rec.get(_name):
            geo_kwargs[_name] = _geo_mask(rec[_name])
    if rec.get("ally"):
        _tyl = rec.get("allyType") or []
        _ty = torch.full((sim.B, sim.n_majors), -1, dtype=torch.long, device=dev)
        for _k, _j in enumerate(rec["ally"]):
            if 0 <= int(_j) < sim.n_majors:
                # the wire's ONE default: an absent type column reads RESEARCH
                _ty[:, int(_j)] = int(_tyl[_k]) if _k < len(_tyl) else 0
        geo_kwargs["ally_type"] = _ty
    if rec.get("offer"):
        _to, _give, _ask = rec["offer"]
        _di = sim._deal_items
        _blob = torch.full((sim.B, 1 + 2 * _di * 3), -1, dtype=torch.long, device=dev)
        _blob[:, 0] = int(_to)
        for _base, _bun in ((1, _give), (1 + _di * 3, _ask)):
            for _s, _it in enumerate(_bun[:_di]):
                for _c in range(3):
                    _blob[:, _base + _s * 3 + _c] = int(_it[_c])
        geo_kwargs["offer"] = _blob
    if rec.get("gift"):
        _g = torch.zeros(sim.B, ladder.GW_KINDS, sim.n_majors, dtype=torch.bool, device=dev)
        for _k, _j in rec["gift"]:
            if 0 <= int(_k) < ladder.GW_KINDS and 0 <= int(_j) < sim.n_majors:
                _g[:, int(_k), int(_j)] = True
        geo_kwargs["gift"] = _g
    if geo_kwargs:
        sim.apply_geo(row, **geo_kwargs)
    ranks = []
    for step in rec["units"]:
        orders = torch.tensor(step, dtype=torch.long, device=dev)
        if orders.dim() == 1:
            orders = orders.unsqueeze(0)
        ranks.append(orders)
    if ranks:
        stash_units(sim, row, torch.stack(ranks, dim=2))


def replay(env, log: list, seats=None) -> None:
    sim = env.sim
    seats = list(range(1, sim.n_majors)) if seats is None else list(seats)
    for row in seats:
        take_seat(sim, row)
    for turn_rec in log:
        for row in seats:
            key = f"s{row}"
            if key in turn_rec:
                replay_seat(sim, row, turn_rec[key])
        sim.step()


def drive_single(env, turns: int, seats=None, record: Path | None = None) -> list:
    """Run `turns` turns with `seats` (default: every civ row) driven by the ladder.

    THE FILE IS THE INTERFACE: when `record` is given the chosen actions are
    written out, which is what lets the TS engine replay the identical
    decisions instead of keeping its own copy of the policy.
    """
    assert env.sim.B == 1, "drive_single() is the B=1 surface; batches record via drive_batched()"
    log = drive_batched(env, turns, seats)[0]
    if record is not None:
        record.write_text(json.dumps(log), encoding="utf-8")
    return log


def drive_batched(env, turns: int, seats=None, seeds=None) -> list:
    sim = env.sim
    B = sim.B
    seats = list(range(1, sim.n_majors)) if seats is None else list(seats)
    NB = sim.rules_dev.b_cost.shape[0]
    classes = ladder.prod_classes(NB, sim.NU, len(sim._scaffold), sim._wond_n if sim.districts_on else 0, len(sim._proj_rows) if sim.districts_on else 0)
    rj = json.loads((simbase.FIXTURES / "rules.json").read_text(encoding="utf-8"))
    roster = ladder.unit_roster(rj["units"])
    for row in seats:
        take_seat(sim, row)
    logs = [[] for _ in range(B)]
    game_seeds = list(seeds) if seeds is not None else list(range(B))
    for t in range(turns):
        per_seat = {row: decide_and_apply(env, sim, row, roster, classes, seeds=game_seeds, turn=t) for row in seats}
        for b in range(B):
            turn_rec = {"turn": t}
            for row in seats:
                turn_rec[f"s{row}"] = extract_record(sim, row, *per_seat[row], b)
            logs[b].append(turn_rec)
        sim.step()
    return logs
