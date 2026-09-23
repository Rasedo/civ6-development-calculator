"""THE NEUTRAL OBSERVATION, GPU side: what the decision server reads, as a
plain value — one dict per game per seat, Python ints and bools only, no
tensor and no sim. City references are CENTRE TILES, never slots, so any
engine can emit the same value. The field names, kinds and meanings live in
`shared/decide.schema.json`, the one spec every emitter matches.

The groups: `buy` (every purchase candidate the seat has), `route` (the
trade route it would open) and `nuke` (the silo launch it would take).
"""
from __future__ import annotations

import json
from pathlib import Path

import torch

SCHEMA = json.loads((Path(__file__).resolve().parents[2] / "shared" / "decide.schema.json")
                    .read_text(encoding="utf-8"))
SEAT_GROUPS: dict = {g: [(f[0], f[1]) for f in fields] for g, fields in SCHEMA["seat"].items()}


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


def seat_obs(sim, row: int) -> list:
    """Seat `row`'s observation, one dict per game of the batch (index = b):
    {group: {field: int | bool}} over `SEAT_GROUPS`. Reads only."""
    B, RC = sim.B, sim.RC
    ctr = sim.city_center[:, row]
    alive = sim.city_alive[:, row]
    bc = _buy_ctx(sim, row)
    cols = []
    for name, kind in SEAT_GROUPS["buy"]:
        v = _as_long(bc[name])
        if kind == "city":
            # a slot becomes the centre it stands on, -1 where it names no
            # living city of this seat
            j = v.clamp(min=0, max=RC - 1).unsqueeze(1)
            ok = (v >= 0) & (v < RC) & alive.gather(1, j).squeeze(1)
            v = torch.where(ok, ctr.gather(1, j).squeeze(1), torch.full_like(v, -1))
        cols.append(v)
    frm, dst = sim._seat_route_candidate(row)
    kd, tl = sim._seat_nuke_candidate(row)
    cols += [_as_long(frm), _as_long(dst), _as_long(kd), _as_long(tl)]
    # ONE transfer for the whole seat
    rows = torch.stack(cols, dim=1).tolist()
    order = [(g, name, kind) for g in ("buy", "route", "nuke") for name, kind in SEAT_GROUPS[g]]
    assert len(order) == len(cols), "the schema and the emitted columns disagree"
    out = []
    for b in range(B):
        ob: dict = {g: {} for g in SEAT_GROUPS}
        for (g, name, kind), x in zip(order, rows[b]):
            ob[g][name] = bool(x) if kind == "bool" else int(x)
        out.append(ob)
    return out
