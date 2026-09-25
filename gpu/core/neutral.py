"""THE NEUTRAL OBSERVATION, GPU side: what the decision server reads, as a
plain value — one dict per game per seat, Python ints and bools only, no
tensor and no sim. City references are CENTRE TILES, never slots, so any
engine can emit the same value. The field names, kinds and meanings live in
`shared/decide.schema.json`, the one spec every emitter matches.

The groups: `buy` (every purchase candidate the seat has), `route` (the
trade route it would open), `nuke` (the silo launch it would take),
`research` (the open techs and civics with their prices), `policy` (the cards
it may slot and the slots), `war` (the open war columns and the kind each
declaration takes), `envoy` (the bank and the courtship per city-state),
`congress` (the session the coming turn holds and this seat's preference on
it) and `gp` (the Great Person offers and this seat's points); `war` also says
whether the seat is at war with anyone. After them
`cities`: one row per living city in the seat's ARRAY order, with its
production columns, the plots each open district column may take, its
specialist slots and pins, the plots it may work and the plots a sibling
holds that it may claim. Then `targets`: the tile planes the unit planner
walks toward (builder and engineer jobs, religious spread, founding, digs,
park anchors, Great Person sites, villages), each emitted only for a game
whose seat holds a unit that walks toward it, and the war march's targets
(enemy improvements and cities) for a game whose seat is at war. Then
`units`: one row per living unit in the seat's array order, with the unit
action columns it may take. Last the `head`: the engine turn and `vec`, the
RL observation vector.

Three values ride beside the per-seat observation, ONE per game each:
`geo_obs`, the diplomatic table every seat's agreements and deals are
decided from at once; `world_obs`, the facts every seat sees alike, which
the TS engine emits too (cpu/core/decideObs.ts) and the gate compares; and
`static_of`, the rules and map facts the driver reads (`Static`), built from
rules.json and the world's dimensions alone.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import torch

from . import simbase

SCHEMA = json.loads((Path(__file__).resolve().parents[2] / "shared" / "decide.schema.json")
                    .read_text(encoding="utf-8"))
SEAT_GROUPS: dict = {g: [(f[0], f[1]) for f in fields] for g, fields in SCHEMA["seat"].items()}
CITY_FIELDS: list = [(f[0], f[1]) for f in SCHEMA["city"]]
TARGET_FIELDS: list = [(f[0], f[1]) for f in SCHEMA["targets"]]
UNIT_FIELDS: list = [(f[0], f[1]) for f in SCHEMA["unit"]]
HEAD_FIELDS: list = [(f[0], f[1]) for f in SCHEMA["head"]]
GEO_FIELDS: list = [(f[0], f[1]) for f in SCHEMA["geo"]]
WORLD_FIELDS: list = [(f[0], f[1]) for f in SCHEMA["world"]]
STATIC_FIELDS: list = [f[0] for f in SCHEMA["static"]]


@dataclass(frozen=True)
class Static:
    """The facts of one game that never change, as the driver reads them —
    every field named and meant in the schema's `static` section. Integers,
    lists and dicts of them, and three geometry tables as tensors."""
    device: str
    T: int
    neigh: torch.Tensor
    ring2: torch.Tensor
    pair_dist: torch.Tensor
    n_majors: int
    S: int
    RC: int
    NT: int
    NC: int
    NB: int
    NU: int
    max_cities: int
    unit_slots: int
    spec_keep: int
    units: list
    unit_base: int
    district_base: int
    form_base: int
    prod_w: int
    districts_on: bool
    scaffold: list
    n_wonders: int
    n_projects: int
    improvements_on: bool
    builder: int
    engineer: int
    missionary: int
    apostle: int
    settler: int
    archaeologist: int
    naturalist: int
    act: dict
    act_w: int
    a_pillage: int
    a_snipe: int
    a_snipe3: int
    a_repair: int
    a_imp: list
    promo_cols: int
    air_strike_cols: int
    air_rebase_cols: int
    spy_missions: int
    spy_travel_cols: int
    spy_counterspy: int
    npol: int
    pol_kind: torch.Tensor
    pol_legacy: torch.Tensor
    pol_dark: torch.Tensor
    dow_proximity: int
    war_min_turns: int
    open_borders_civic: int
    alliance_civic: int
    embassy_civic: int
    joint_war_civic: int
    embassy_cost: int
    delegation_cost: int
    deal_items: int
    deal_kind: dict
    comp_aid: int
    promise_cost: list

    def col(self, name: str) -> int:
        """The unit action column called `name`, -1 where the layout has none."""
        return self.act.get(name, -1)


def _whole(x) -> int:
    """A rules number the driver compares a floored quantity against: it must
    be whole, or flooring the other side would move the comparison."""
    assert float(x) == int(x), f"{x} is not a whole number"
    return int(x)


def static_of(rules, world: dict, device: str = "cpu") -> Static:
    """The game's `Static`, from rules.json (`rules`, as `load_rules` reads
    it) and its world file (`world`, as `load_fixture` reads it). Reads no
    engine state."""
    return _static(rules, int(world["width"]), int(world["height"]), len(world["civs"]),
                   int(world.get("cityStateMax", 0)), device)


def static_for(sim) -> Static:
    """`static_of` for a caller that holds a sim and no world file: the
    sim's rules and the world's four dimensions, which is all `static_of`
    reads from the world."""
    return _static(sim.rules, sim.W, sim.H, sim.n_majors, sim.S, sim.device)


def _static(rules, width: int, height: int, n_majors: int, n_citystates: int, device: str) -> Static:
    T = width * height
    neigh = simbase.neighbor_table(width, height).to(device)
    pair_dist = simbase.pair_distances(width, height).to(device)
    # the distance-2 ring, each row ascending and padded -1: the tiles two
    # steps out, in tile-index order
    ar = torch.arange(T, device=device).expand(T, -1)
    ring2 = torch.where(pair_dist == 2, ar, torch.full_like(ar, T)).sort(dim=1).values[:, :12]
    ring2 = torch.where(ring2 < T, ring2, torch.full_like(ring2, -1))
    units = list(rules.units or [{"id": "WARRIOR"}])
    ids = [u.get("id") for u in units]
    NB, NU = len(rules.b_cost), len(units)
    imp = rules.improvements or {}
    bel = rules.beliefs or {}
    districts = list(rules.districts or [])
    place = list((rules.district_scaffold or {}).get("place", []))
    n_wonders = len((rules.wonders or {}).get("rows", []))
    n_projects = len((rules.projects or {}).get("rows", []))
    unit_base = NB + 2
    district_base = unit_base + NU
    form_base = district_base + len(place) + n_wonders + n_projects
    names = list((rules.actions or {}).get("unit", []))
    assert names, "rules.actions.unit missing — the unit action layout is the exporter's"
    act = {n: i for i, n in enumerate(names)}
    sp = rules.eras["espionage"]
    mids = [str(m["id"]) for m in sp["missions"]]
    pols = list(rules.policies or [])
    kinds = [str(k) for k in rules.eras["dealItemKinds"]]
    comps = [c["id"] for c in rules.eras["competitions"]]
    seats = rules.seats
    return Static(
        device=device, T=T, neigh=neigh, ring2=ring2, pair_dist=pair_dist,
        n_majors=n_majors, S=n_citystates, RC=int(seats.get("citySlots", 24)),
        NT=len(rules.t_cost), NC=len(rules.c_cost), NB=NB, NU=NU,
        max_cities=int(seats.get("maxCities", 6)),
        unit_slots=simbase.UNIT_SLOTS, spec_keep=simbase.SPEC_KEEP, units=units,
        unit_base=unit_base, district_base=district_base, form_base=form_base, prod_w=form_base + 2 * NU,
        districts_on=bool(districts),
        scaffold=[districts[int(p["idx"])].get("id") if districts else None for p in place],
        n_wonders=n_wonders, n_projects=n_projects,
        improvements_on=bool(imp.get("ids", [])),
        builder=int(imp.get("builderIdx", -1)), engineer=int(imp.get("engineerIdx", -1)),
        missionary=int(bel.get("missionaryIdx", -1)), apostle=int(bel.get("apostleIdx", -1)),
        settler=next((i for i, u in enumerate(units) if bool(u.get("settler", 0))), -1),
        archaeologist=ids.index("ARCHAEOLOGIST") if "ARCHAEOLOGIST" in ids else -1,
        naturalist=next((i for i, u in enumerate(units) if bool(u.get("naturalist", 0))), -1),
        act=act, act_w=len(names),
        a_pillage=act["PILLAGE"], a_snipe=act.get("SNIPE_0", act["PILLAGE"] + 1),
        a_snipe3=act.get("SNIPE3_0", -1), a_repair=act["REPAIR"],
        a_imp=[act.get(f"BUILD_{n}", -1) for n in imp.get("ids", [])],
        promo_cols=int(rules.promo_cols),
        air_strike_cols=sum(1 for n in names if n.startswith("AIR_STRIKE_")),
        air_rebase_cols=sum(1 for n in names if n.startswith("REBASE_")),
        spy_missions=len(mids), spy_travel_cols=int(sp["travelCols"]),
        spy_counterspy=mids.index("COUNTERSPY"),
        npol=len(pols),
        pol_kind=torch.tensor([int(p["kind"]) for p in pols], dtype=torch.long, device=device),
        pol_legacy=torch.tensor([int(p.get("legacy", -1)) >= 0 for p in pols], dtype=torch.bool, device=device),
        pol_dark=torch.tensor([int(p.get("dark", [-1, -1])[0]) >= 0 for p in pols], dtype=torch.bool, device=device),
        dow_proximity=int(seats.get("dowProximity", 9)), war_min_turns=int(seats["warMinTurns"]),
        open_borders_civic=int(seats["openBordersCivic"]), alliance_civic=int(seats["allianceCivic"]),
        embassy_civic=int(rules.eras["embassyCivic"]), joint_war_civic=int(seats["jointWarCivic"]),
        embassy_cost=_whole(rules.eras["embassyCost"]), delegation_cost=_whole(rules.eras["delegationCost"]),
        deal_items=int(rules.eras["dealItems"]),
        deal_kind={k: kinds.index(k) for k in ("GOLD", "FAVOR", "RESOURCE", "SPY", "OPEN_BORDERS", "JOINT_WAR")},
        comp_aid=comps.index("AID_REQUEST") if "AID_REQUEST" in comps else -1,
        promise_cost=[_whole(p[0]) for p in rules.eras["promises"]],
    )


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
    jj, bb, can_b, price, elig_b = sim._seat_buy_candidates(row, active)
    # no eligible building at all: the candidate is NONE (-1, -1, price 0),
    # not the argmin of an all-infinite key (slot 0, building 0)
    has_b = active & elig_b.reshape(elig_b.shape[0], -1).any(dim=1)
    jj = torch.where(has_b, jj, torch.full_like(jj, -1))
    bb = torch.where(has_b, bb, torch.full_like(bb, -1))
    price = torch.where(has_b, price, torch.zeros_like(price))
    # `settlerCost` counts every settler on order, at any depth in any queue
    _sq = (alive_row.unsqueeze(2) & (sim.city_current[:, row] == sim.SETTLER)).sum(dim=(1, 2))
    sett_base = (sim.rules.settler_base + sim.rules.settler_per_city
                 * (n_cities - 1 + sim._seat_settlers(row) + _sq).clamp(min=0).double())
    mon_g = sim._golden_ded(row, sim._ded_monumentality)
    # the 0.7 before the five-step floor, as the buy arm prices it
    _sb = sett_base * sim.rules.gold_purchase_mult
    sett_cost = sim._gold_price(row, torch.where(mon_g, _sb * 0.7, _sb))
    # the buy SPAWNS a unit at the capital (else first city), which must have
    # the pop to pay — the TS driver's tripwire mirrors this exactly.
    _cap_is = sim.city_is_cap[:, row]
    _spawn_slot = torch.where(_cap_is.any(dim=1), _cap_is.long().argmax(dim=1), alive_row.long().argmax(dim=1))
    _spawn_pop = sim.city_pop[:, row].gather(1, _spawn_slot.unsqueeze(1)).squeeze(1)
    # ...and a civilian may stand there (`purchaseSpotBlocked`): the buy arm
    # only lands the settler on a free centre, and the candidate says so
    _spawn_ctr = sim.city_center[:, row].gather(1, _spawn_slot.unsqueeze(1)).clamp(min=0)
    _spot_free = ~sim._blocked_for(_spawn_ctr, row, is_civilian=True)[:, 0]
    settler_ok = active & (_spawn_pop >= sim.rules.settler_pop_gate) & _spot_free \
        & sim._afford(sim.civ_treasury[:, row], sett_cost)
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
    levy_cs = torch.where(levy_ok, levy_cs, torch.full_like(levy_cs, -1))
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


def _floored(v: torch.Tensor) -> torch.Tensor:
    """A [B, ...] quantity as whole numbers, rounded down."""
    return v.floor().to(torch.long) if v.is_floating_point() else v.to(torch.long)


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
    out["war", "at_war"] = sim.war[:, row].any(dim=1)
    out["envoy", "avail"] = sim.civ_envoys_avail[:, row]
    met_live = sim.seat_citystate_met[:, row, : sim.S] & sim.citystate_alive[:, : sim.S]
    held = sim.seat_citystate_envoys[:, row, : sim.S]
    out["envoy", "held"] = torch.where(met_live, _as_long(held), torch.full_like(held, -1, dtype=torch.long))
    out.update(_congress(sim, row))
    # the Great Person offers, one row per class; points are floored, which
    # keeps `points >= price` exact because a price is a whole number
    nG = sim.gp_offer.shape[1] if sim._gp_nc else 0
    out["gp", "offer"] = sim.gp_offer[:, :nG]
    out["gp", "passed_by"] = sim.gp_passed_by[:, :nG]
    out["gp", "price"] = _as_long(sim.gp_price[:, :nG])
    out["gp", "points"] = _floored(sim.civ_gpp[:, row, :nG])
    out.update(_beliefs(sim, row))
    return out


def _beliefs(sim, row: int) -> dict:
    """The `belief` group: whether the seat may found or enhance its
    religion now, the class catalog row it holds per class (-1 none), and
    each class's open beliefs as membership rows (`_INDEX_LISTS`)."""
    out = {("belief", "found"): sim._can_found(row), ("belief", "enhance"): sim._can_enhance(row)}
    pools = sim._bel_pools()
    out["belief", "held"] = torch.stack([ids[:, row] for _m, ids, _n in pools], dim=1)
    for name, (m, _ids, n) in zip(("follower", "worship", "founder", "enhancer"), pools):
        out["belief", name] = ~m[:, :n]
    return out


def _congress(sim, row: int) -> dict:
    """The `congress` group: the session the coming step would hold, and
    what this seat prefers on each resolution of its slate."""
    turn = int(sim.turn) + 1
    _fires, res0, res1, dv = sim._congress_upcoming(turn)
    slate = torch.stack([res0, res1], dim=1)                          # -1 off a session turn
    pref_o, pref_t = torch.full_like(slate, -1), torch.full_like(slate, -1)
    for r in sorted({r for r in slate.flatten().tolist() if r >= 0}):
        o, t = sim._congress_pref(r, row)
        at = slate == r
        pref_o = torch.where(at, o.unsqueeze(1), pref_o)
        pref_t = torch.where(at, t.unsqueeze(1), pref_t)
    return {("congress", "slate"): slate, ("congress", "pref_outcome"): pref_o,
            ("congress", "pref_target"): pref_t, ("congress", "dv"): dv,
            ("congress", "leader"): sim._congress_leader(dv),
            ("congress", "special"): sim._special_upcoming(turn),
            ("congress", "favor"): _floored(sim.civ_diplo_favor[:, row]),
            ("congress", "vote_step"): torch.full((sim.B,), int(sim._congress_vstep), dtype=torch.long, device=sim.device)}


# the `list` fields that hold ASCENDING INDICES; every other list is dense
_INDEX_LISTS = {("policy", "unlocked"), ("war", "declare"), ("war", "sue"),
                ("belief", "follower"), ("belief", "worship"), ("belief", "founder"), ("belief", "enhancer")}


def _city_rows(sim, row: int) -> list:
    """Seat `row`'s `cities`, one list per game: a dict per LIVING city in
    array order keyed by `CITY_FIELDS`. The production columns are
    `_seat_production_mask`'s, and the district plots the ones its own sweep
    tested, so an open district column always lists at least one plot. The
    specialist columns hold slots then pins side by side until the split."""
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
    if len(sim.districts_cat):
        spec = torch.cat([sim._city_spec_slots(row), sim.city_spec_pin[:, row]], dim=2)
        spec = spec.gather(1, order.unsqueeze(2).expand(-1, -1, spec.shape[2]))
    else:
        spec = torch.zeros(B, sim.RC, 0, dtype=torch.long, device=sim.device)
    nD = spec.shape[2] // 2
    work_rows, swap_rows = _citizen_rows(sim, row, alive)
    n_alive = alive.sum(dim=1).tolist()
    rank_l, scal_l, spec_l = rank.tolist(), scal.tolist(), spec.tolist()
    out = [[{"centre": c, "isCapital": bool(cap), "pop": pop, "settlerQueued": sq, "prodOpen": [], "distSites": [],
             "specSlots": sp[:nD], "specPin": sp[nD:], "workTiles": [], "swapFrom": []}
            for (c, cap, pop, sq), sp in zip(scal_l[b][:n_alive[b]], spec_l[b])] for b in range(B)]
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
    for field, rows_ in (("workTiles", work_rows), ("swapFrom", swap_rows)):
        for b, j, *r in rows_:
            k = rank_l[b][j]
            if k < n_alive[b]:
                out[b][k][field].append(r)
        for cities in out:
            for c in cities:
                c[field].sort()
    return out


def _citizen_rows(sim, row: int, alive: torch.Tensor) -> tuple:
    """([b, slot, tile, resource priority, locked] per workable plot,
    [b, slot, tile, holder's centre, worked, locked] per plot a sibling holds
    that the slot may claim) — `workTiles` and `swapFrom` before they are
    laid out per city."""
    B, RC, T = sim.B, sim.RC, sim.T
    tiles, valid = sim._work_window(row)                              # [B, RC, M]
    M = tiles.shape[2]
    tf = tiles.clamp(min=0).reshape(B, -1)
    locked = sim.tile_locked.gather(1, tf).reshape(B, RC, M)
    valid = valid & alive.unsqueeze(2)
    bb, jj, mm = valid.nonzero(as_tuple=True)
    t_v = tiles[bb, jj, mm]
    # the priority of the resource STILL on the plot: a district placed on a
    # bonus resource strips it (`res_stripped`; TS deletes `tile.resource`),
    # and a razed district's plot is workable again without it
    _prio = sim.res_priority[bb, t_v] * (~sim.res_stripped[bb, t_v]).long()
    work = torch.stack([bb, jj, t_v, _prio, locked[bb, jj, mm].long()], dim=1).tolist()
    if not bool((alive.sum(dim=1) >= 2).any()):
        return work, []
    slot = torch.arange(RC, device=sim.device).view(1, RC, 1).expand(B, RC, M)
    ok = sim._swap_tile_ok(row, slot.reshape(B, -1), tiles.reshape(B, -1)).reshape(B, RC, M)
    if not bool(ok.any()):
        return work, []
    # the holder: the living sibling whose id the plot carries
    owner = sim.tile_city.gather(1, tf).reshape(B, RC, M)
    ids, ctrs = sim.city_id[:, row], sim.city_center[:, row]
    hold = (ids.view(B, 1, 1, RC) == owner.unsqueeze(3)) & alive.view(B, 1, 1, RC)
    holder = ctrs.gather(1, hold.long().argmax(dim=3).reshape(B, -1)).reshape(B, RC, M)
    # worked by ANY of the seat's city slots
    wk = sim.city_worked[:, row].reshape(B, -1)
    worked = torch.zeros(B, T + 1, dtype=torch.bool, device=sim.device)
    worked.scatter_(1, torch.where(wk >= 0, wk, torch.full_like(wk, T)), True)
    worked = worked[:, :T].gather(1, tf).reshape(B, RC, M)
    bb, jj, mm = ok.nonzero(as_tuple=True)
    swap = torch.stack([bb, jj, tiles[bb, jj, mm], holder[bb, jj, mm], worked[bb, jj, mm].long(),
                        locked[bb, jj, mm].long()], dim=1).tolist()
    return work, swap


def _unit_cols(sim, row: int) -> tuple:
    """(present [B, N] bool, {unit field: [B, N] long}) — seat `row`'s living
    units on the slot-map axis (`_seat_slot_map`: the living in slot order,
    which is the TS array order). A Great Person's site code and argument are
    looked up from its class and roster position."""
    smap = sim._seat_slot_map(row)
    sc = smap.clamp(min=0)
    present = smap >= 0
    types = _as_long(sim.unit_type.gather(1, sc))
    gp_at = _as_long(sim.unit_gp_at.gather(1, sc))
    neg = torch.full_like(types, -1)
    gsite, garg = neg, neg
    if getattr(sim, "_A_GP", -1) >= 0:
        cls = sim._gp_cls_of(types)
        maxN = sim._gp_site.shape[1] - 1
        ok = present & (cls >= 0) & (gp_at >= 0)
        gsite = torch.where(ok, _as_long(sim._gp_site[cls.clamp(min=0), gp_at.clamp(min=0, max=maxN)]), neg)
        garg = torch.where(ok, _as_long(sim._gp_site_district[cls.clamp(min=0), gp_at.clamp(min=0, max=maxN)]), neg)
    cols = {"tile": _as_long(sim.unit_tile.gather(1, sc)), "type": types,
            "charges": _as_long(sim.unit_charges.gather(1, sc)),
            "gpAt": torch.where(present, gp_at, neg), "gpSite": gsite, "gpArg": garg}
    return present, cols


def gp_site_plane(sim, seat: int, site: int, arg: int) -> torch.Tensor:
    """[B, T] — where a Great Person charge with this SITE code may be spent.
    The unit mask is the authority on legality; this is only what a person
    walks toward, so it answers per site rather than per person."""
    own = sim.tile_seat == seat
    if site == 0:  # the class's own completed district
        if arg < 0:
            return torch.zeros_like(own)
        # the DISTRICT's pillage fact (`_gp_site_ok`, TS gpActivateOk), never
        # the improvement plane's
        return own & (sim.district == arg) & sim.district_complete & ~sim.district_pillaged
    if site == 1:  # anywhere — nothing to walk to
        return torch.ones_like(own)
    if site == 2:  # a city with an open slot taking a work of this class's kind
        out = torch.zeros_like(own)
        col = sim.city_slot_at(seat)
        for kind in range(3):
            if sim._gw_cls[kind] < 0:
                continue
            free = sim._gw_room_kind(seat, kind) & sim.city_alive[:, seat]
            out = out | (own & (col >= 0) & free.gather(1, col.clamp(min=0)))
        return out
    if site == 3:  # inside any city-state's territory
        return (sim.tile_seat >= 100) & (sim.tile_seat < simbase.BARB_SEAT)
    if site == 4:  # an owned tile carrying a luxury
        return own & (sim.lux_id >= 0)
    if site == 6:  # a city-state's territory this seat is Suzerain of (Raffles)
        if sim.S == 0:
            return torch.zeros_like(own)
        cs = (sim.tile_seat >= 100) & (sim.tile_seat < simbase.BARB_SEAT)
        s = (sim.tile_seat - 100).clamp(min=0, max=sim.S - 1)
        return cs & sim._suzerain_mask(seat).gather(1, s)
    if site == 7:  # beside a barbarian unit (Boudica)
        bp = sim._barb_unit_plane()
        nb7 = sim.neigh
        near = (bp[:, nb7.clamp(min=0).reshape(-1)].reshape(own.shape[0], sim.T, 6)
                & (nb7 >= 0).unsqueeze(0)).any(dim=2)
        return near & sim.passable
    if site == 8:  # the territory of a seat at war with this one (Tupac Amaru)
        return sim._enemy_ground(seat, sim.tile_seat)
    # 5: unclaimed ground next to this seat's territory
    nb = sim.neigh
    adj = (own[:, nb.clamp(min=0).reshape(-1)].reshape(own.shape[0], sim.T, 6)
           & (nb >= 0).unsqueeze(0)).any(dim=2)
    return (sim.tile_seat < 0) & adj


def _found_ok(sim, row: int, gate: torch.Tensor) -> torch.Tensor:
    """[B, T] — `canFoundCity`'s own terms over the whole map, in the games
    `gate` names: unowned, settle_ok, bare of district and wonder, >= 4 from
    every live city (majors, the Free Cities row and city-states — the
    engine's `_found_city_at` spacing, TS `canFoundCity` over `cityHolders`)."""
    B, T, dev = sim.B, sim.T, sim.device
    ok = torch.zeros(B, T, dtype=torch.bool, device=dev)
    nrow = sim.n_majors
    fr = sim.FREE_ROW
    ctr = torch.cat((sim.city_center[:, :nrow].reshape(B, -1), sim.city_center[:, fr:fr + 1].reshape(B, -1),
                     sim.citystate_center), dim=1)
    live = torch.cat((sim.city_alive[:, :nrow].reshape(B, -1), sim.city_alive[:, fr:fr + 1].reshape(B, -1),
                      sim.citystate_alive), dim=1)
    for b in range(B):
        if not bool(gate[b]):
            continue
        cb = ctr[b][live[b]]
        dmin = (sim.pair_dist[:, cb.clamp(min=0)].min(dim=1).values.to(torch.long)
                if int(live[b].sum()) else torch.full((T,), 999, dtype=torch.long, device=dev))
        ok[b] = ((sim.tile_seat[b] < 0) & sim.settle_ok[b]
                 & (sim.district[b] < 0) & (sim.built_wonder[b] < 0) & (dmin >= 4))
    return ok


def _war_targets(sim, war_row: torch.Tensor) -> tuple:
    """([B, T] the improvement and district tiles a unit at war marches on,
    sorted [b, seat, centre] rows for every living city of a seat this one
    is at war with) — `war_row` [B, NS] is the seat's row of the war matrix.
    A tile's owner is at war with the seat when its war cell is set; every
    territorial owner alike, a barbarian tile never (it is not `owned`)."""
    _ts = sim.tile_seat
    owned = (_ts >= 0) & (_ts < simbase.BARB_SEAT)
    at_war_t = owned & war_row.gather(1, sim._seat_row[torch.where(owned, _ts, torch.zeros_like(_ts))])
    imps = torch.zeros_like(at_war_t)
    if sim.improvements_on or sim.districts_on:
        imps = (sim.improvement >= 0) & ~sim.pillaged & at_war_t
        if sim.districts_on:
            imps = imps | ((sim.district >= 0) & sim.district_complete & ~sim.district_pillaged & at_war_t)
    B, CB = sim.B, sim.city_center.shape[1]
    live = sim.city_alive.reshape(B, -1) & war_row[:, :CB].repeat_interleave(sim.RC, dim=1)
    bb, cell = live.nonzero(as_tuple=True)
    rows = torch.stack([bb, sim._march_seatkey[cell] // 2048,
                        sim.city_center.reshape(B, -1)[bb, cell]], dim=1).tolist()
    return imps, sorted(rows)


def _targets(sim, row: int, present: torch.Tensor, cols: dict) -> list:
    """Seat `row`'s `targets`, one dict per game keyed by `TARGET_FIELDS`.
    Each plane is built only when some game holds a unit that walks toward
    it — the map-wide scans cost nothing on a seat without one — and listed
    only for those games; the war march's targets only where the seat is at
    war."""
    B, T, NU, dev = sim.B, sim.T, sim.NU, sim.device
    types, charges = cols["type"].clamp(min=0, max=NU - 1), cols["charges"]
    charged = present & (charges > 0)
    no = torch.zeros(B, dtype=torch.bool, device=dev)

    def holds(idx: int, need_charge: bool = True) -> torch.Tensor:
        """[B] — the seat holds a unit of type `idx` (with a charge)."""
        if idx < 0:
            return no
        return ((charged if need_charge else present) & (types == idx)).any(dim=1)

    allt = torch.arange(T, device=dev).reshape(1, -1).expand(B, -1)
    planes: dict = {}                                                  # field -> (gate [B], plane [B, T])
    if sim.improvements_on:
        g = holds(sim._builder_idx)
        if bool(g.any()):
            planes["jobs"] = (g, sim._seat_job_mask(row))
        g = holds(getattr(sim, "_eng_idx", -1))
        if bool(g.any()):
            planes["engJobs"] = (g, sim._seat_engineer_job_mask(row))
    relig = no.unsqueeze(1).expand(B, types.shape[1])
    for idx in (sim._missionary_idx, sim._apostle_idx):
        if idx >= 0:
            relig = relig | (types == idx)
    g = (charged & relig).any(dim=1) & sim.civ_religion_done[:, row]
    if bool(g.any()):
        nrow = sim.n_majors
        acc = torch.zeros(B, T, dtype=torch.long, device=dev)
        acc.scatter_add_(1, sim.city_center[:, :nrow].clamp(min=0).reshape(B, -1),
                         (sim.city_alive[:, :nrow] & (sim.city_followed[:, :nrow] != row)).long().reshape(B, -1))
        planes["spread"] = (g, acc > 0)
    if sim._settler_idx >= 0 and sim._A_FOUND >= 0:
        g = holds(sim._settler_idx, need_charge=False) \
            & (sim.city_alive[:, row].sum(dim=1) < int(sim.rules.seats.get("maxCities", 6)))
        if bool(g.any()):
            planes["foundOk"] = (g, _found_ok(sim, row, g))
    if sim._archaeologist_idx >= 0 and sim._A_EXCAVATE >= 0:
        g = holds(sim._archaeologist_idx)
        if bool(g.any()):
            digs = sim._dig_here(row, allt) & ((sim.tile_seat < 0) | (sim.tile_seat == row))
            planes["digs"] = (g, digs & sim._museum_room(row).unsqueeze(1))
    if sim._naturalist_idx >= 0 and sim._A_PARK >= 0:
        g = holds(sim._naturalist_idx)
        if bool(g.any()):
            planes["parks"] = (g, sim._park_cluster_legal(row, sim._park_cluster(allt)).any(dim=2))
    planes["goody"] = (~no, sim.tile_goody)
    war_row = sim.war[:, row]
    at_war = war_row.any(dim=1)
    city_rows: list = []
    if bool(at_war.any()):
        imps, city_rows = _war_targets(sim, war_row)
        planes["warImps"] = (at_war, imps)
    out = [{f: [] for f, _k in TARGET_FIELDS} for _b in range(B)]
    for b, s, c in city_rows:                                         # game, then seat, then centre
        out[b]["warCities"].append([s, c])
    names = list(planes)
    stack = torch.stack([pl & g.unsqueeze(1) for g, pl in planes.values()])  # [K, B, T]
    for k, b, t in stack.nonzero().tolist():                          # field, game, tile ascending
        out[b][names[k]].append(t)
    # the Great Person sites: one plane per (site, arg) some charged person
    # walks toward, listed for the games holding such a person
    gs, ga = cols["gpSite"], cols["gpArg"]
    walk = charged & (gs >= 0) & (gs != 1)
    if bool(walk.any()):
        bb, nn = walk.nonzero(as_tuple=True)
        want = sorted({(s, a, b) for b, s, a in zip(bb.tolist(), gs[bb, nn].tolist(), ga[bb, nn].tolist())})
        rows_: list = []
        for key in sorted({(s, a) for s, a, _b in want}):
            games = torch.tensor([b for s, a, b in want if (s, a) == key], dtype=torch.long, device=dev)
            g = torch.zeros(B, dtype=torch.bool, device=dev).index_fill_(0, games, True)
            pb, pt = (gp_site_plane(sim, row, *key) & g.unsqueeze(1)).nonzero(as_tuple=True)
            rows_ += [[b, key[0], key[1], t] for b, t in zip(pb.tolist(), pt.tolist())]
        for b, s, a, t in sorted(rows_):
            out[b]["gpSites"].append([s, a, t])
    return out


def _unit_rows(present: torch.Tensor, cols: dict, mask: torch.Tensor) -> list:
    """The seat's `units`, one list per game: a dict per living unit in
    array order keyed by `UNIT_FIELDS`. `mask` is `_seat_unit_mask` [B, N, A]
    on the same slot-map axis; each unit lists its open columns, from one
    `nonzero` and one transfer for the whole seat."""
    n = present.sum(dim=1).tolist()
    names = [f for f, _k in UNIT_FIELDS if f != "mask"]
    mat = torch.stack([cols[f] for f in names], dim=2).tolist()        # [B, N, F]
    out = [[{**dict(zip(names, r)), "mask": []} for r in mat[b][:n[b]]] for b in range(len(n))]
    for b, k, c in mask.nonzero().tolist():                          # game, unit, column ascending
        out[b][k]["mask"].append(c)
    return out


def seat_obs(sim, row: int, vec: torch.Tensor | None = None) -> list:
    """Seat `row`'s observation, one dict per game of the batch (index = b):
    {group: {field: int | bool | list[int]}} over `SEAT_GROUPS`, then
    "cities": [{field: ...} over `CITY_FIELDS`, one per living city in array
    order], "targets": {field: ...} over `TARGET_FIELDS`, "units":
    [{field: ...} over `UNIT_FIELDS`, one per living unit in array order],
    then the `HEAD_FIELDS`: "turn" and "vec", the seat's RL observation
    (`vec` [B, F], the caller's `env.observe(row)`; an empty list where the
    caller rendered none). Reads only."""
    cities = _city_rows(sim, row)
    present, ucols = _unit_cols(sim, row)
    targets = _targets(sim, row, present, ucols)
    units = _unit_rows(present, ucols, sim._seat_unit_mask(row))
    cols = _columns(sim, row)
    order = [(g, name, kind) for g in SEAT_GROUPS for name, kind in SEAT_GROUPS[g]]
    assert [(g, n) for g, n, _k in order] == list(cols), "the schema and the emitted columns disagree"
    mats = [_as_long(v).reshape(sim.B, -1) for v in cols.values()]
    widths = [m.shape[1] for m in mats]
    # ONE transfer for the whole seat
    rows = torch.cat(mats, dim=1).tolist()
    turn = int(sim.turn)
    vecs = vec.tolist() if vec is not None else [[] for _b in range(sim.B)]
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
        ob["targets"] = targets[b]
        ob["units"] = units[b]
        ob["turn"] = turn
        ob["vec"] = vecs[b]
        out.append(ob)
    return out


def geo_obs(sim) -> list:
    """The diplomatic table, one dict per game keyed by `GEO_FIELDS`: per
    major seat (index = seat) its standing, and per ordered pair of majors
    ([a][b]) what stands between them. Every seat's agreements and deal
    tables are decided from it at once — a pair's decision reads the other
    seat's side and a third seat's (the joint war), so it is one table, not
    a row per seat. Reads only."""
    B, n = sim.B, sim.n_majors
    alive = sim.city_alive[:, :n]
    zero = torch.zeros(B, n, n, dtype=torch.long, device=sim.device)
    den, jw, prox = zero.clone(), zero.clone(), zero.clone()
    for a in range(n):
        for b in range(n):
            if a != b:
                den[:, a, b] = sim._denounce_active(a, b).long()
                jw[:, a, b] = sim._joint_war_open(a, b).long()
                prox[:, a, b] = sim._seat_proximity(a, b)
    gw = torch.stack([torch.stack([(sim._gw_kind_count(r, k) * alive[:, r].long()).sum(dim=1)
                                   for k in range(len(sim._gw_cls))], dim=1)
                      for r in range(n)], dim=1)                        # [B, n, kinds]
    # [a][b]: a's living cities following b's religion
    fol = sim.city_followed[:, :n, :alive.shape[2], None]
    conv = ((fol == torch.arange(n, device=sim.device)) & alive[:, :, :, None]).sum(dim=2)
    conv = conv * (1 - torch.eye(n, dtype=torch.long, device=sim.device))
    # an offer that no longer stands asks for nothing: the table keeps the
    # accepted or expired bundle behind a zero clock, TS drops the offer
    ask = torch.where((sim.deal_offer_left[:, :n, :n] > 0).reshape(B, n, n, 1, 1),
                      sim.deal_offer_ask[:, :n, :n], torch.full_like(sim.deal_offer_ask[:, :n, :n], -1))
    cols = {
        "alive": sim.civ_alive[:, :n].long(), "cities": alive.sum(dim=2),
        "strength": _as_long(sim._seat_strengths()), "treasury": _floored(sim.civ_treasury[:, :n]),
        "favor": _floored(sim.civ_diplo_favor[:, :n]), "stockpile": _as_long(sim.civ_stockpile[:, :n]),
        "great_works": gw, "comp_kind": sim.comp_kind, "comp_target": sim.comp_target,
        "comp_member": sim.comp_member[:, :n].long(),
        "war": sim.war[:, :n, :n].long(), "war_turns": sim.war_turns[:, :n, :n],
        "denounce": den, "friend_turns": sim.seat_friend_turns[:, :n, :n],
        "ally_turns": sim.seat_ally_turns[:, :n, :n], "borders_turns": sim.seat_borders_turns[:, :n, :n],
        "delegation": sim.seat_delegation[:, :n, :n], "grievance": sim.civ_grievance[:, :n, :n],
        "proximity": prox, "joint_open": jw,
        "spies_held": sim.seat_spy_held[:, :n, :n].sum(dim=3),
        "offer_left": sim.deal_offer_left[:, :n, :n], "offer_ask": ask.reshape(B, n, n, -1),
        "promise": sim.seat_promise[:, :n, :n],
        "converted": conv,
    }
    lists = {f: v.tolist() for f, v in cols.items()}
    civics = sim.civ_civics[:, :n]
    held = [[row.nonzero(as_tuple=True)[0].tolist() for row in civics[b]] for b in range(B)]
    out = []
    for b in range(B):
        g: dict = {}
        for f, _k in GEO_FIELDS:
            g[f] = held[b] if f == "civics" else lists[f][b]
        out.append(g)
    return out


def world_obs(sim) -> list:
    """The facts every seat sees alike, one dict per game keyed by
    `WORLD_FIELDS`: the turn, every living city of every holder (the majors'
    rows, then the Free Cities row — TS `cityHolders`) as [holder seat,
    centre, followed religion] in slot order, which is array order at the
    decide moment; every living city-state as [id, centre]; the Tribal
    Village tiles. Reads only."""
    n, RC = sim.n_majors, sim.RC
    rows = [(r, r) for r in range(n)] + [(sim.FREE_ROW, simbase.FREE_SEAT)]
    alive = sim.city_alive.tolist()
    ctr = sim.city_center.tolist()
    fol = sim.city_followed[:, :, :RC].tolist()
    cs_alive, cs_ctr = sim.citystate_alive.tolist(), sim.citystate_center.tolist()
    goody = sim.tile_goody.bool()
    turn = int(sim.turn)
    out = []
    for b in range(sim.B):
        cities = [[seat, ctr[b][r][j], fol[b][r][j]] for r, seat in rows for j in range(RC) if alive[b][r][j]]
        states = [[s, cs_ctr[b][s]] for s in range(sim.S) if cs_alive[b][s]]
        out.append({"turn": turn, "cities": cities, "cityStates": states,
                    "goody": goody[b].nonzero(as_tuple=True)[0].tolist()})
    assert not out or list(out[0]) == [f for f, _k in WORLD_FIELDS], "the schema and world_obs disagree"
    return out
