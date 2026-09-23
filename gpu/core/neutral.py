"""THE NEUTRAL OBSERVATION, GPU side: what the decision server reads, as a
plain value — one dict per game per seat, Python ints and bools only, no
tensor and no sim. City references are CENTRE TILES, never slots, so any
engine can emit the same value. The field names, kinds and meanings live in
`shared/decide.schema.json`, the one spec every emitter matches.

The groups: `buy` (every purchase candidate the seat has), `route` (the
trade route it would open), `nuke` (the silo launch it would take),
`research` (the open techs and civics with their prices), `policy` (the cards
it may slot and the slots), `war` (the open war columns and the kind each
declaration takes) and `envoy` (the bank and the courtship per city-state).
After them `cities`: one row per living city in the seat's ARRAY order, with
its production columns and the plots each open district column may take.
"""
from __future__ import annotations

import json
from pathlib import Path

import torch

SCHEMA = json.loads((Path(__file__).resolve().parents[2] / "shared" / "decide.schema.json")
                    .read_text(encoding="utf-8"))
SEAT_GROUPS: dict = {g: [(f[0], f[1]) for f in fields] for g, fields in SCHEMA["seat"].items()}
CITY_FIELDS: list = [(f[0], f[1]) for f in SCHEMA["city"]]


def living_order(alive: torch.Tensor) -> torch.Tensor:
    """[B, RC] city slots -> [B, RC] the slot at each position of the seat's
    city ARRAY: the living first, in slot order (which is founding order —
    cities append and the step-end reclaim compacts stably), the dead after.
    Every reader of the city axis in living order takes this one ordering."""
    return torch.argsort((~alive).long(), dim=1, stable=True)


def _buy_ctx(sim, row: int) -> dict:
    """Every purchase candidate of seat `row`, [B] tensors keyed by the
    schema's `buy` names. `city` fields hold city SLOTS here; `seat_obs`
    names them by centre."""
    alive_row = sim.city_alive[:, row]
    n_cities = alive_row.sum(dim=1)
    active = sim.seat_ext[:, row] & (n_cities > 0) & sim.civ_alive[:, row]
    jj, bb, can_b, price, _ = sim._seat_buy_candidates(row, active)
    # `settlerCost` counts every settler on order, at any depth in any queue
    _sq = (alive_row.unsqueeze(2) & (sim.city_current[:, row] == sim.SETTLER)).sum(dim=(1, 2))
    sett_base = (sim.rules.settler_base + sim.rules.settler_per_city
                 * (n_cities - 1 + sim._seat_settlers(row) + _sq).clamp(min=0).double())
    mon_g = sim._golden_ded(row, sim._ded_monumentality)
    sett_cost = sim._gold_price(row, sett_base * sim.rules.gold_purchase_mult)
    sett_cost = torch.where(mon_g, sett_cost * 0.7, sett_cost)
    # the buy SPAWNS a unit at the capital (else first city), which must have
    # the pop to pay — the TS driver's tripwire mirrors this exactly.
    _cap_is = sim.city_is_cap[:, row]
    _spawn_slot = torch.where(_cap_is.any(dim=1), _cap_is.long().argmax(dim=1), alive_row.long().argmax(dim=1))
    _spawn_pop = sim.city_pop[:, row].gather(1, _spawn_slot.unsqueeze(1)).squeeze(1)
    settler_ok = active & (_spawn_pop >= sim.rules.settler_pop_gate) & sim._afford(sim.civ_treasury[:, row], sett_cost)
    cand_u = sim._seat_buy_unit_candidates(row, sim._seat_trainable_units(row))
    unit_ok = active & (sim._seat_army_count(row) < 2 * n_cities) & cand_u.any(dim=1)
    tile_j, tile_t, _tile_cost, tile_ok = sim._seat_tile_buy_candidate(row, active)
    w_ok, w_j, m_ok, m_j, a_ok, a_j, q_ok, q_j, k_ok, k_j = sim._seat_faith_buy_candidates(row, active)
    nat_ok, nat_j = sim._seat_naturalist_candidate(row, active)
    band_ok, band_j = sim._seat_rock_band_candidate(row, active)
    # CIV6 (GS Civilopedia, Monumentality, Golden face): "May purchase civilian
    # units with Faith. Builders and Settlers are 30% cheaper to purchase with
    # Faith and Gold." FAITH_PURCHASE_MULT with the literal 0.7 LAST; the
    # POLICY gate (at most one live builder) is here, the rule is the applier's.
    monu_b_ok = torch.zeros_like(mon_g)
    if sim._builder_idx >= 0:
        n_bl = (sim.major_unit_alive & (sim.major_unit_seat == row) & (sim.major_unit_type == sim._builder_idx)).sum(dim=1)
        bl_cost = sim._faith_price(row, sim._builder_cost(sim.civ_builders_trained[:, row]).double() * sim.rules.faith_purchase_mult * 0.7)
        monu_b_ok = active & mon_g & (n_bl < 1) & sim._afford(sim.civ_faith[:, row], bl_cost)
    monu_s_ok = active & mon_g & (_spawn_pop >= sim.rules.settler_pop_gate) \
        & sim._afford(sim.civ_faith[:, row], sim._faith_price(row, sett_base * sim.rules.faith_purchase_mult * 0.7))
    dist_g_ok, dist_g_t, dist_g_si = sim._seat_district_buy_candidate(row, active, False)
    dist_f_ok, dist_f_t, dist_f_si = sim._seat_district_buy_candidate(row, active, True)
    cls_ok, cls_j, cls_b = sim._seat_class_buy_candidate(row, active)
    ucls_ok, ucls_j, ucls_b = sim._seat_faith_unit_candidate(row, active)
    pat_f_ok, pat_f_cls, pat_g_ok, pat_g_cls = sim._seat_patronage_candidates(row, active)
    levy_ok, levy_cs = sim._seat_levy_candidate(row, active)
    levy_ok = levy_ok & sim.war[:, row, : sim.n_majors].any(dim=1)
    return {"bldg_city": jj, "bldg": bb, "can_building": can_b, "bldg_price": price,
            "settler_ok": settler_ok, "unit_ok": unit_ok,
            "tile_ok": tile_ok, "tile": tile_t, "tile_city": tile_j,
            "monu_builder_ok": monu_b_ok, "monu_settler_ok": monu_s_ok, "spawn_city": _spawn_slot,
            "worship_ok": w_ok, "worship_city": w_j,
            "missionary_ok": m_ok, "missionary_city": m_j,
            "apostle_ok": a_ok, "apostle_city": a_j,
            "inquisitor_ok": q_ok, "inquisitor_city": q_j,
            "monk_ok": k_ok, "monk_city": k_j,
            "levy_ok": levy_ok, "levy_cs": levy_cs,
            "nat_ok": nat_ok, "nat_city": nat_j,
            "band_ok": band_ok, "band_city": band_j,
            "cls_ok": cls_ok, "cls_city": cls_j, "cls_bldg": cls_b,
            "ucls_ok": ucls_ok, "ucls_city": ucls_j, "ucls_unit": ucls_b,
            "pat_f_ok": pat_f_ok, "pat_f_cls": pat_f_cls,
            "pat_g_ok": pat_g_ok, "pat_g_cls": pat_g_cls,
            "dist_g_ok": dist_g_ok, "dist_g_tile": dist_g_t, "dist_g_row": dist_g_si,
            "dist_f_ok": dist_f_ok, "dist_f_tile": dist_f_t, "dist_f_row": dist_f_si}


def _as_long(v: torch.Tensor) -> torch.Tensor:
    """A [B] column as integers. A floating column (a price) must already
    hold whole numbers — the observation carries no fractions."""
    if v.is_floating_point():
        assert bool((v == v.floor()).all()), "a floating observation column holds a fraction"
    return v.to(torch.long)


def _open_cost(sim, row: int, civic: bool) -> torch.Tensor:
    """[B, n] long — every item's effective research cost, -1 where the item
    is not open. The cost is `_eff_cost`'s: a base cost, boosted and
    js-rounded, so a whole number and exact as an integer."""
    base = sim.rules_dev.c_cost if civic else sim.rules_dev.t_cost
    B = sim.B
    boosted = sim.civ_civic_boosted[:, row] if civic else sim.civ_tech_boosted[:, row]
    cost = _as_long(sim._eff_cost(base.unsqueeze(0).expand(B, -1), boosted, row, is_civic=civic))
    open_ = sim._seat_civic_mask(row) if civic else sim._seat_tech_mask(row)
    return torch.where(open_, cost, torch.full_like(cost, -1))


def _columns(sim, row: int) -> dict:
    """Every field of seat `row` as a [B, w] long tensor keyed (group, name):
    w = 1 for a scalar, the list's width for a `list` (a 0/1 membership row
    where the list holds ascending indices)."""
    B, RC, dev = sim.B, sim.RC, sim.device
    ctr = sim.city_center[:, row]
    alive = sim.city_alive[:, row]
    out: dict = {}
    bc = _buy_ctx(sim, row)
    for name, kind in SEAT_GROUPS["buy"]:
        v = _as_long(bc[name])
        if kind == "city":
            # a slot becomes the centre it stands on, -1 where it names no
            # living city of this seat
            j = v.clamp(min=0, max=RC - 1).unsqueeze(1)
            ok = (v >= 0) & (v < RC) & alive.gather(1, j).squeeze(1)
            v = torch.where(ok, ctr.gather(1, j).squeeze(1), torch.full_like(v, -1))
        out["buy", name] = v
    out["route", "from"], out["route", "dest"] = sim._seat_route_candidate(row)
    out["nuke", "device"], out["nuke", "tile"] = sim._seat_nuke_candidate(row)
    out["research", "tech_cost"] = _open_cost(sim, row, civic=False)
    out["research", "civic_cost"] = _open_cost(sim, row, civic=True)
    out["policy", "unlocked"] = sim._seat_policy_mask(row)[:, : sim._npol]
    out["policy", "slots"] = (sim._seat_policy_slots(row) if sim._ngov
                              else torch.zeros(B, 4, dtype=torch.long, device=dev))
    wm = sim._seat_war_mask(row)
    n = wm.shape[1] // 2
    declare = wm[:, :n]
    out["war", "targets"] = torch.full((B,), n, dtype=torch.long, device=dev)
    out["war", "declare"], out["war", "sue"] = declare, wm[:, n:]
    out["war", "kind_default"], out["war", "kind_own"] = sim._war_kind_table(row, declare[:, : sim.n_majors - 1])
    out["envoy", "avail"] = sim.civ_envoys_avail[:, row]
    met_live = sim.seat_citystate_met[:, row, : sim.S] & sim.citystate_alive[:, : sim.S]
    held = sim.seat_citystate_envoys[:, row, : sim.S]
    out["envoy", "held"] = torch.where(met_live, _as_long(held), torch.full_like(held, -1, dtype=torch.long))
    return out


# the `list` fields that hold ASCENDING INDICES; every other list is dense
_INDEX_LISTS = {("policy", "unlocked"), ("war", "declare"), ("war", "sue")}


def _city_rows(sim, row: int) -> list:
    """Seat `row`'s `cities`, one list per game: a dict per LIVING city in
    array order keyed by `CITY_FIELDS`. The production columns are
    `_seat_production_mask`'s, and the district plots the ones its own sweep
    tested, so an open district column always lists at least one plot."""
    B = sim.B
    alive = sim.city_alive[:, row]
    sites: dict = {}
    mask = sim._seat_production_mask(row, sites)                      # [B, RC, W]
    order = living_order(alive)
    rank = torch.argsort(order, dim=1)                                # slot -> array position
    scal = torch.stack([_as_long(sim.city_center[:, row]), sim.city_is_cap[:, row].long(),
                        _as_long(sim.city_pop[:, row]),
                        (sim.city_current[:, row] == sim.SETTLER).sum(dim=2)], dim=2)
    scal = scal.gather(1, order.unsqueeze(2).expand(-1, -1, scal.shape[2]))
    opened = mask.nonzero()                                           # (b, slot, column), ascending
    site_rows = torch.zeros(0, 5, dtype=torch.long, device=sim.device)
    if sites:
        keys = sorted(sites)                                          # (slot, scaffold row)
        planes = torch.stack([sites[k] for k in keys])                # [K, B, T]
        kk, bb, tt = planes.nonzero(as_tuple=True)                    # key, then game, then tile
        if kk.numel():
            srows = sorted({si for _j, si in keys})
            adj = torch.stack([sim.district_rank_adj(sim._scaffold[si][0], sim._scaffold[si][3])
                               for si in srows])                      # [nS', B, T]
            at = {si: i for i, si in enumerate(srows)}
            k_adj = torch.tensor([at[si] for _j, si in keys], dtype=torch.long, device=sim.device)
            k_slot = torch.tensor([j for j, _si in keys], dtype=torch.long, device=sim.device)
            k_col = torch.tensor([sim.DISTRICT_BASE + si for _j, si in keys], dtype=torch.long, device=sim.device)
            site_rows = torch.stack([bb, k_slot[kk], k_col[kk], tt, _as_long(adj[k_adj[kk], bb, tt])], dim=1)
    n_alive = alive.sum(dim=1).tolist()
    rank_l, scal_l = rank.tolist(), scal.tolist()
    out = [[{"centre": c, "isCapital": bool(cap), "pop": pop, "settlerQueued": sq, "prodOpen": [], "distSites": []}
            for c, cap, pop, sq in scal_l[b][:n_alive[b]]] for b in range(B)]
    for b, j, c in opened.tolist():
        k = rank_l[b][j]
        if k < n_alive[b]:
            out[b][k]["prodOpen"].append(c)
    # the keys are sorted by (slot, scaffold row) and the nonzero walks each
    # key's tiles ascending, so a city's plots arrive by column, then tile
    for b, j, c, t, a in site_rows.tolist():
        k = rank_l[b][j]
        if k < n_alive[b]:
            out[b][k]["distSites"].append([c, t, a])
    return out


def seat_obs(sim, row: int) -> list:
    """Seat `row`'s observation, one dict per game of the batch (index = b):
    {group: {field: int | bool | list[int]}} over `SEAT_GROUPS`, then
    "cities": [{field: ...} over `CITY_FIELDS`, one per living city in array
    order]. Reads only."""
    cities = _city_rows(sim, row)
    cols = _columns(sim, row)
    order = [(g, name, kind) for g in SEAT_GROUPS for name, kind in SEAT_GROUPS[g]]
    assert [(g, n) for g, n, _k in order] == list(cols), "the schema and the emitted columns disagree"
    mats = [_as_long(v).reshape(sim.B, -1) for v in cols.values()]
    widths = [m.shape[1] for m in mats]
    # ONE transfer for the whole seat
    rows = torch.cat(mats, dim=1).tolist()
    out = []
    for b in range(sim.B):
        ob: dict = {g: {} for g in SEAT_GROUPS}
        i = 0
        for (g, name, kind), w in zip(order, widths):
            xs = rows[b][i:i + w]
            i += w
            if kind == "list":
                ob[g][name] = [k for k, x in enumerate(xs) if x] if (g, name) in _INDEX_LISTS else [int(x) for x in xs]
            else:
                ob[g][name] = bool(xs[0]) if kind == "bool" else int(xs[0])
        ob["cities"] = cities[b]
        out.append(ob)
    return out
