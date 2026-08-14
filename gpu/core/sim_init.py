"""Construction: fixture loading, plane allocation, aliases, snapshot/restore, invariants.

One mixin of BatchSim (assembled in engine.py); state and helpers live on
self / gpu/core/simbase.py.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimInit:
    """B games × RC city slots per seat row, stepping in lockstep. Build from fixtures
    (parity) or by replicating one fixture B times (benchmark/training).
    """

    def __init__(self, fixtures: list[dict], rules: Rules, device: str = "cpu", dtype=torch.float64):
        self.rules = rules
        self.device = device
        self.dtype = dtype
        B = len(fixtures)
        f0 = fixtures[0]
        self.B, self.W, self.H = B, f0["width"], f0["height"]
        T = self.W * self.H
        self.T = T
        # ------------------------------------------------------------------
        # THE CITY BLOCK. Twenty city facts, one `city_x [B, 1+R+S, RC]` plane
        # each, addressed through per-seat-family VIEWS:
        #     seat 0:      city_x[:, 0]
        #     civ seats:   city_x[:, 1:1+R]
        #     city-states: city_x[:, 1+R:, 0]   (carved out further below)
        # ONE COLUMN WIDTH for every seat row (#68 step 3): row 0 used to hold
        # `maxCities` columns where the civ rows hold RC, which forked a `cols =
        # C if row == 0 else RC` out of every row-generic body — and left row 0
        # unable to receive the uncapped loyalty flip its own rules allow.
        # Float planes take `dtype`, so this arithmetic is f32 in the f32 lanes.
        # Two facts carry a seat-0 fill of their own: hp starts at cityMaxHp
        # where the civ rows start at 0, and `site` starts at -1 where
        # civ_city_center starts at 0. A `None` seat-0 name means row 0 has no
        # view of its own and every reader says `city_x[:, 0]` — the direction
        # this block is travelling in, since a seat-0 alias is one more name a
        # row-generic body can be written against by accident.
        # ------------------------------------------------------------------
        self.R = int(f0.get("civMax", 0))
        # City COLUMNS per seat row — ONE width, exported by the TS engine as
        # rules.seats.citySlots (CITY_SLOTS_PER_SEAT) so the observation head
        # and this storage cannot drift. Settling caps at maxCities; loyalty
        # flips exceed it. Empty slots are city_alive=False.
        self.RC = int(rules.seats.get("citySlots", 24))
        # A city-state's one city is slot 0 of its own seat row, at the row
        # index the war matrix uses, so "which row is this seat" has one answer
        # everywhere; `S` is hoisted here beside `R`.
        self.S = int(f0.get("cityStateMax", 0))
        # FOG IS LIVE in units mode (fogOfWar rides the fixture; older
        # fixtures predate the key and fall back to unitsMode — the creation
        # rule). Reveals gate on this exactly as TS's revealAround gates on
        # state.fogOfWar, so a fog-off world accrues NO explored state.
        self.fog_of_war = bool(f0.get("fogOfWar", f0.get("unitsMode", 0)))
        _rp, _rcp, _sp = max(self.R, 1), self.RC, max(self.S, 1)
        self._CITY_MINOR0 = 1 + _rp
        self._aliases: dict = {}
        for _k, _pa, _ra, _dt, _rf, _pf, _ex in (
            ("alive", "alive", "civ_city_alive", torch.bool, False, None, None),
            ("center", "site", "civ_city_center", torch.long, 0, -1, None),
            ("pop", "pop", "civ_city_pop", torch.long, 0, None, None),
            ("hp", None, "civ_city_hp", torch.long, 0, int((rules.combat or {}).get("cityMaxHp", 200)), None),
            ("outer_hp", "outer_hp", "civ_city_outer_hp", torch.long, 0, None, None),
            ("is_cap", "is_cap", "civ_city_is_cap", torch.bool, False, None, None),
            ("loyalty", "loyalty", "civ_city_loyalty", dtype, 100.0, None, None),
            ("acquired", "tiles_acquired", "civ_city_acquired", torch.long, 0, None, None),
            ("growth", "food_box", "civ_city_growth", dtype, 0, None, None),
            ("cbox", "culture_box", "civ_city_cbox", dtype, 0, None, None),
            ("current", "current", "civ_city_current", torch.long, -1, None, None),
            ("progress", "progress", "civ_city_progress", dtype, 0, None, None),
            ("cost", "cur_cost", "civ_city_cost", dtype, 0, None, None),
            ("qtile", "q_dtile", "civ_city_qtile", torch.long, -1, None, None),
            ("gw_writing", "gw_writing", "civ_city_gw_writing", torch.long, 0, None, None),
            ("gw_art", "gw_art", "civ_city_gw_art", torch.long, 0, None, None),
            ("gw_music", "gw_music", "civ_city_gw_music", torch.long, 0, None, None),
            ("relics", "relics", "civ_city_relics", torch.long, 0, None, None),
            ("artifacts", "artifacts", "civ_city_artifacts", torch.long, 0, None, None),
            ("bldg", "buildings", "civ_city_bldg", torch.bool, False, None, max(len(rules.b_cost), 1)),
        ):
            _shape = (B, 1 + _rp + _sp, _rcp) + ((_ex,) if _ex else ())
            _base = torch.full(_shape, _rf, dtype=_dt, device=device)
            # A seat-0 name equal to the base's would SHADOW it: the base is
            # bound first and the view second, so `city_x` would silently
            # become row 0 and every `city_x[b, row, col]` in a row-generic
            # body would index a 2-D tensor. `hp` shipped exactly that.
            assert _pa != f"city_{_k}", f"city block: seat-0 name {_pa!r} shadows the merged base"
            setattr(self, f"city_{_k}", _base)
            _pv = _base[:, 0]
            if _pf is not None:
                _pv.fill_(_pf)
            if _pa is not None:
                setattr(self, _pa, _pv)
                self.register_alias(_pa, lambda sim, k=_k: getattr(sim, f"city_{k}")[:, 0])
            setattr(self, _ra, _base[:, 1:1 + _rp])
            self.register_alias(_ra, lambda sim, k=_k, rp=_rp: getattr(sim, f"city_{k}")[:, 1:1 + rp])

        def ften(getter, shape_tail=()):
            return torch.tensor([getter(f) for f in fixtures], dtype=dtype, device=device).reshape(B, *shape_tail)

        # --- static map -------------------------------------------------------
        self.tile_yields = ften(lambda f: [t["y"] for t in f["tiles"]], (T, 6))
        self.res_priority = torch.tensor([[t["res"] for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.wonder_near = torch.tensor([[t.get("wnear", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.coastal_land = torch.tensor([[t.get("cl", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)  # isCoastalLand (coastalCity eurekas)
        self.passable = torch.tensor([[t["pass"] for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # WATER passability (a water tile that is not impassable). Static
        # terrain layer — tech gating (embark capability, OCEAN needing
        # CARTOGRAPHY) is composed at the war-march gather site.
        self.wpass = torch.tensor([[t.get("wpass", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # OCEAN tiles need CARTOGRAPHY to enter (COAST/LAKE do not); the gate is
        # applied per-mover.
        self.ocean_tile = torch.tensor([[t.get("ocean", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)

        # Citizen-workability (= !isImpassable — water IS workable, unlike unit
        # passability).
        self.work_ok = torch.tensor([[t.get("work", t["pass"]) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # Luxury amenity source (mirrors luxuryAmenities): per tile, the
        # luxury's catalog index (-1 none) and the improvement index that
        # activates it (-9 = outside the GPU roster, never matches).
        self.lux_id = torch.tensor([[t.get("lux", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.lux_req = torch.tensor([[t.get("luxreq", -9) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self._n_lux = int(self.lux_id.max().item()) + 1 if int(self.lux_id.max().item()) >= 0 else 0
        self._lux_k = int((rules.improvements or {}).get("luxAmenityCities", 4))
        self.camp_ok = torch.tensor([[t["camp"] for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.neigh = neighbor_table(self.W, self.H).to(device)  # [T, 6]
        # The distance-2 ring, [T, 12], each row SORTED ASCENDING and padded -1
        # at map edges. Column order IS tile-index order, the engine's own
        # target tie-break, so scanning SNIPE columns in order scans ring tiles
        # in index order. Built from neigh (neighbours-of-neighbours minus self
        # and the d=1 set).
        _n1 = self.neigh  # [T, 6]
        _n2 = torch.where(_n1.unsqueeze(2) >= 0,
                          _n1[_n1.clamp(min=0)], torch.full((self.T, 6, 6), -1, dtype=_n1.dtype, device=device))
        _n2 = _n2.reshape(self.T, 36)
        _ring = torch.full((self.T, 12), -1, dtype=torch.long, device=device)
        _selfT = torch.arange(self.T, device=device)
        for t in range(self.T):
            d1 = set(int(x) for x in _n1[t].tolist() if int(x) >= 0)
            cand = sorted(set(int(x) for x in _n2[t].tolist() if int(x) >= 0) - d1 - {t})
            for k, x in enumerate(cand[:12]):
                _ring[t, k] = x
        self.ring2 = _ring  # [T, 12]
        self.pair_dist = pair_distances(self.W, self.H).to(device)  # [T, T] int16

        # --- per-slot city data (dynamic: a slot binds to a tile when a SETTLER
        # founds there; nothing is pre-founded, and every center stat below is
        # derived from the tile planes at founding) --------------------------
        # SLOT ORDER IS TS ARRAY ORDER for every seat row (#110): cities
        # append at last-alive+1 (the push mirror) and the step-end reclaim
        # compacts stably (the splice mirror), so every order-coupled mirror
        # of the TS city loop walks columns living-first, in column order.
        # The capital is an IDENTITY (is_cap plus civ_cap_tile), not column 0:
        # a captured capital's hole-reused column must not pin loyalty, carry
        # the Palace or anchor domination, and _reclaim_cities compaction permutes
        # slots underneath. civ_cap_tile is allocated with the civ block below.
        import os as _os
        # How close a pool may get to its own cap before `_reclaim_pool`
        # compacts it — a HEADROOM, applied to whichever pool is asked, so
        # the two pool sizes need no threshold each.
        self._reclaim_headroom = int(_os.environ.get("CIV6_RECLAIM_HEADROOM", 24))
        # ...or an ABSOLUTE high-water trigger, which is what the
        # forced-compaction gate sets to compact on every step.
        self._reclaim_force_at = (int(_os.environ["CIV6_RECLAIM_AT"])
                                  if "CIV6_RECLAIM_AT" in _os.environ else None)

        # --- city-states: static, placed at game creation ----------------------
        s_pad = max(self.S, 1)  # self.S is set with the city block
        # A city-state's city IS a city — these are views into the minor section
        # of the city block, row 1+R+s, slot 0.
        _m0 = self._CITY_MINOR0
        self.citystate_alive = self.city_alive[:, _m0:_m0 + s_pad, 0]
        self.register_alias("citystate_alive", lambda sim: sim.city_alive[:, sim._CITY_MINOR0:sim._CITY_MINOR0 + max(sim.S, 1), 0])
        self.citystate_type = torch.zeros(B, s_pad, dtype=torch.long, device=device)
        self.citystate_center = self.city_center[:, _m0:_m0 + s_pad, 0]
        self.register_alias("citystate_center", lambda sim: sim.city_center[:, sim._CITY_MINOR0:sim._CITY_MINOR0 + max(sim.S, 1), 0])
        self.citystate_pop = self.city_pop[:, _m0:_m0 + s_pad, 0]
        self.register_alias("citystate_pop", lambda sim: sim.city_pop[:, sim._CITY_MINOR0:sim._CITY_MINOR0 + max(sim.S, 1), 0])
        # Per-CS suzerain unique-perk yield column (-1 = none). Name-keyed in
        # the exporter, constant thereafter.
        self.citystate_suz_key = torch.full((B, s_pad), -1, dtype=torch.long, device=device)
        for b, f in enumerate(fixtures):
            for s, cs in enumerate(f.get("cityStates", [])):
                self.citystate_alive[b, s] = True
                self.citystate_type[b, s] = cs["type"]
                self.citystate_center[b, s] = cs["center"]
                self.citystate_pop[b, s] = cs["pop"]
                self.citystate_suz_key[b, s] = cs.get("suzKey", -1)
        # A city-state's tile ownership lives in `tile_seat` (seeded below, once
        # `owner` and `civ_at` exist); `citystate_at` is a derived view.
        self._citystate_at_init = torch.tensor([[t.get("cs", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # The (seat, city-state) relations live on `seat_citystate_*` [B, 1+R, S] planes
        # allocated below, once r_pad is known — `citystate_met` is `[:, 0]` and
        # `civ_only_citystate_met` is `[:, 1:]` of ONE tensor, and so on.
        # (the asked-for district is never stored: it is always the CS type's
        # own — _citystate_didx — so quest resolve/digest both re-derive it)
        # LEVY cooldown — per CS, SHARED across seats (the TS cs.lastLevyTurn
        # twin). Init to -levyCooldown so a never-levied CS reads cooldown-ready
        # (turn - (-cd) >= cd for turn >= 0).
        self._levy_cooldown = int(rules.citystate.get("levyCooldown", 20))
        self.citystate_last_levy = torch.full((B, s_pad), -self._levy_cooldown, dtype=torch.long, device=device)
        self._alloc_war(B, max(self.R, 1), s_pad, device)
        # Siege hit points (attackCityState) — the TS `cs.hp` twin.
        self.citystate_hp = self.city_hp[:, _m0:_m0 + s_pad, 0]
        # The block fills every non-seat-0 row with 0; a minor's own maximum is
        # written once here rather than teaching the block a third fill.
        self.citystate_hp.fill_(int(rules.citystate.get("maxHp", 150)))
        self.register_alias("citystate_hp", lambda sim: sim.city_hp[:, sim._CITY_MINOR0:sim._CITY_MINOR0 + max(sim.S, 1), 0])
        # Seat 0 <-> city-state war state (the CityState.atWar twin), a SLICE of
        # the war matrix carved out after `_alloc_war` runs above. Peace is the
        # default; the attack mask and the resolver both read it.
        self.citystate_atwar = self.war[:, 0, 1 + max(self.R, 1):1 + max(self.R, 1) + s_pad]
        self.register_alias("citystate_atwar", lambda sim: sim.war[:, 0, 1 + max(sim.R, 1):1 + max(sim.R, 1) + max(sim.S, 1)])
        # The two war CLOCKS are seat-indexed like the matrix they count.
        # `war_turns[b, row]` is how long that seat has been at war with seat 0
        # (the cityStateWarTurns twin, gating PEACE_MIN_WAR_TURNS); `civ_only_warturns` and
        # `citystate_war_turns` are its civ and minor slices, at the same `_seat_row`
        # index `war` uses. `peace_turns` has the same shape, but only its civ
        # slice is written — there is no city-state peace clock.
        self.war_turns = torch.zeros(B, self.NS, dtype=torch.long, device=device)
        self.peace_turns = torch.zeros(B, self.NS, dtype=torch.long, device=device)
        _cs0 = 1 + max(self.R, 1)
        self.citystate_war_turns = self.war_turns[:, _cs0:_cs0 + s_pad]
        self.register_alias("citystate_war_turns", lambda sim: sim.war_turns[:, 1 + max(sim.R, 1):1 + max(sim.R, 1) + max(sim.S, 1)])
        citystate_yidx = rules.citystate.get("typeYieldIdx", [3, 4, 2, 1, 1, 5])
        self._citystate_yidx = torch.tensor(citystate_yidx, dtype=torch.long, device=device)[self.citystate_type.clamp(min=0)]  # [B, S]
        citystate_didx = rules.citystate.get("typeDistrictIdx", [0, 2, 3, 5, 6, 1])  # CS type -> district idx (Campus/Theater/CommHub/IZ/Encampment/HolySite)
        self._citystate_didx = torch.tensor(citystate_didx, dtype=torch.long, device=device)[self.citystate_type.clamp(min=0)]  # [B, S] district each CS boosts at 3/6 envoys
        self._citystate_district_bonus = float(rules.citystate.get("districtBonus", 2))  # per-district amount at each of the 3-/6-envoy thresholds
        # The 3/6-envoy bonus lands on the type's tier-1 (>=3) / tier-2 (>=6)
        # BUILDING catalog index; -1 = building absent from the roster (no
        # bonus). Constant, derived from citystate_type.
        citystate_b1 = rules.citystate.get("typeB1Idx", [-1] * 6)
        citystate_b2 = rules.citystate.get("typeB2Idx", [-1] * 6)
        self._citystate_b1idx = torch.tensor(citystate_b1, dtype=torch.long, device=device)[self.citystate_type.clamp(min=0)]  # [B, S]
        self._citystate_b2idx = torch.tensor(citystate_b2, dtype=torch.long, device=device)[self.citystate_type.clamp(min=0)]  # [B, S]
        self._citystate_suz_amt = float(rules.citystate.get("suzerainYield", 3))  # flat suzerain capital-yield amount

        # --- civ seats ---------------------------------------------------------
        rr = rules.seats
        n_gp = len(rr.get("gpClassDistrict", [])) or 5  # GP class count (Scientist..General)
        # The unified civ index space: 0 = seat 0, r+1 = civ index r.
        self.O = 1 + self.R
        # rc slots append at last-alive+1 (order-preserving), so churn can
        # exhaust the space while holes sit below — compact at the step end once
        # the high-water nears the cap (forced low via CIV6_RC_RECLAIM_AT).
        self._civ_city_reclaim_at = int(_os.environ.get("CIV6_RC_RECLAIM_AT", self.RC - 8))
        # Env-gated machine-checked registry invariant. Auto-ON whenever forced
        # compaction runs (CIV6_RC_RECLAIM_AT set), also standalone via
        # CIV6_RC_REGISTRY_CHECK. No hot-path cost otherwise.
        self._civ_city_reg_check = bool(_os.environ.get("CIV6_RC_REGISTRY_CHECK")) or ("CIV6_RC_RECLAIM_AT" in _os.environ)
        r_pad, civ_city_pad = max(self.R, 1), self.RC
        # Per-tile registry of the owning civ CITY as its persistent civ_city_id
        # (per-civ ids, meaningful only where civ_at >= 0). Keyed on the ID, not
        # the slot, so _reclaim_cities compaction needs no tile-plane remap. No civ
        # city exists at t0, so it starts empty.
        self.water = torch.tensor([[t.get("wt", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.nwonder = torch.tensor([[t.get("nw", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.settle_ok = torch.tensor([[t.get("st", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.site_q3 = torch.tensor(
            [[t.get("sq", [0.0, 0.0, 0.0]) for t in f["tiles"]] for f in fixtures], dtype=torch.float64, device=device
        )  # [B, T, 3] per-source contributions, added separately like siteQuality
        self.hills = torch.tensor([[t.get("hl", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # River-edge crossing bits, riverMask verbatim — the neigh columns
        # enumerate AXIAL_DIRS order (E NE NW W SW SE), the same order the
        # mask's bits use: bit d = crossing toward neigh column d.
        self.river_mask = torch.tensor([[int(t.get("rm", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # CLIFF edge mask — the riverMask twin. Blocks EMBARK and DISEMBARK
        # across that land/water edge (cities and Harbors excepted).
        self.cliff_mask = torch.tensor([[int(t.get("cm", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # Per-tile APPEAL contribution (cpu/core/appeal.ts tileAppeal sums what
        # each NEIGHBOUR contributes). `ap` = static part + the t0 feature term;
        # `ap_feat` isolates that feature term so a chopped tile subtracts
        # exactly it. Dynamic terms are applied in _tile_appeal.
        self.appeal_base = torch.tensor([[int(t.get("ap", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.appeal_feat = torch.tensor([[int(t.get("apf", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # The ON-TILE appeal terms (mountain +4, river/lake +1). NOT neighbour
        # contributions, so they are added to the tile's OWN appeal after the
        # neighbour gather rather than folded into appeal_base.
        self.appeal_self = torch.tensor([[int(t.get("aps", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # Appeal OVERRIDE — natural wonder 5, mountain 4, neither touched by
        # adjacency; -999 = compute normally. Mirrors the two early returns in
        # cpu/core/appeal.ts tileAppeal.
        self.appeal_over = torch.tensor([[int(t.get("apo", -999)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # Existence + temperament on the seat axis (row 0 = seat 0). Static:
        # placed at creation, never mutated, so neither base is snapshot-
        # registered. r_-view-only — `alive` names seat 0's city plane until
        # the city block itself unifies.
        self.civ_alive = torch.zeros(B, 1 + r_pad, dtype=torch.bool, device=device)
        self.civ_alive[:, 0] = True
        self.civ_only_alive = self.civ_alive[:, 1:]
        self.register_alias("civ_only_alive", lambda sim: sim.civ_alive[:, 1:])
        # Per-seat FOG — Seat.explored's twin. Row 0 = seat 0, r+1 = civ r;
        # a tile is dark until a reveal (spawn/walk/found/growth/capture)
        # lifts it for THAT seat. Accrues only with fog_of_war (the
        # revealAround gate), and the t0 unit loads below seed the start
        # disks exactly as the seeder's spawn reveals did.
        self.seat_explored = torch.zeros(B, 1 + r_pad, self.T, dtype=torch.bool, device=device)
        self.explored = self.seat_explored[:, 0]
        self.civ_only_explored = self.seat_explored[:, 1:]
        self.register_alias("explored", lambda sim: sim.seat_explored[:, 0])
        self.register_alias("civ_only_explored", lambda sim: sim.seat_explored[:, 1:])
        self.civ_aggression = torch.zeros(B, 1 + r_pad, dtype=torch.float64, device=device)
        self.civ_only_aggression = self.civ_aggression[:, 1:]
        self.register_alias("civ_only_aggression", lambda sim: sim.civ_aggression[:, 1:])
        # The seat-0/civ vector and the civ/civ block are SLICES of the war
        # matrix (allocated in `_alloc_war` above), not tensors of their own:
        # `civ_only_atwar[b, r]` and `civ_pair_war[b, i, j]` address the matrix's own memory.
        self.civ_only_atwar = self.war[:, 0, 1:1 + r_pad]
        self.register_alias("civ_only_atwar", lambda sim: sim.war[:, 0, 1:1 + max(sim.R, 1)])
        self.civ_pair_war = self.war[:, 1:1 + r_pad, 1:1 + r_pad]
        self.register_alias("civ_pair_war", lambda sim: sim.war[:, 1:1 + max(sim.R, 1), 1:1 + max(sim.R, 1)])

        # ------------------------------------------------------------------
        # PER-SEAT SCALARS. One `civ_x [B, 1+R]` plane per fact, addressed
        # through VIEWS:
        #     self.x   = civ_x[:, 0]      seat 0
        #     self.civ_only_x = civ_x[:, 1:]     the civ seats
        # ------------------------------------------------------------------
        _civ_scalars = (
            ("best_melee", torch.long, 0), ("builders_trained", torch.long, 0),
            ("civic_prog", dtype, 0), ("cur_civic", torch.long, -1),
            ("cur_tech", torch.long, -1), ("diplo_favor", torch.long, 0),
            ("diplo_points", torch.long, 0), ("envoys_avail", torch.long, 0),
            ("influence", dtype, 0), ("tech_prog", dtype, 0),
            ("treasury", dtype, 0),
            # The belief/religion identity row, the city-id allocator and the
            # tile-purchase escalator ride the same seat axis. Seat 0's rows
            # exist from here on; the mechanics that write them arrive with
            # the seat-0 religion work and the seat-0 purchase wire.
            ("enhancer", torch.long, -1), ("enhancer_done", torch.bool, 0),
            ("follower", torch.long, -1), ("founder", torch.long, -1),
            ("next_city_id", torch.long, 0), ("pantheon", torch.long, -1),
            ("pantheon_done", torch.bool, 0), ("prophets", torch.long, 0),
            ("religion_done", torch.bool, 0), ("tiles_purchased", torch.long, 0),
        )
        for _nm, _dt, _fill in _civ_scalars:
            _base = torch.full((B, 1 + r_pad), _fill, dtype=_dt, device=device)
            setattr(self, f"civ_{_nm}", _base)
            setattr(self, _nm, _base[:, 0])
            setattr(self, f"civ_only_{_nm}", _base[:, 1:])
            self.register_alias(_nm, lambda sim, k=_nm: getattr(sim, f"civ_{k}")[:, 0])
            self.register_alias(f"civ_only_{_nm}", lambda sim, k=_nm: getattr(sim, f"civ_{k}")[:, 1:])
        # civ_only_treasury's opening balance — the fixture's `civs[]` is seat-ordered
        # with seat 0 first; rows 1+ are the civ seats.
        self.civ_only_treasury.copy_(torch.tensor(
            [[float(cv.get("treasury", 0.0)) for cv in f["civs"] if int(cv["seat"]) > 0][:r_pad]
             + [0.0] * max(0, r_pad - (len(f["civs"]) - 1))
             for f in fixtures], dtype=dtype, device=device))
        # Per-PAIR casus belli. civ_pair_warkind[b, i, j] = the (i, j) civ/civ war is
        # FORMAL (denounced >= formalWarMinTurns earlier); False = SURPRISE
        # (default). Symmetric, only meaningful where civ_pair_war. civ_pair_denounced[b, i,
        # j] = the turn i denounced j (a directed grudge, -1 = none, never
        # reset). Both start empty (no civ/civ war exists at t0), so there is no
        # exporter load. _MUTABLE for snapshot/restore.
        self.civ_pair_warkind = torch.zeros(B, r_pad, r_pad, dtype=torch.bool, device=device)
        self.civ_pair_denounced = torch.full((B, r_pad, r_pad), -1, dtype=torch.long, device=device)
        # civ/civ ALLIANCES, symmetric. Allies never declare war on each other;
        # a denouncement or a war breaks it.
        self.civ_pair_allied = torch.zeros_like(self.civ_pair_denounced, dtype=torch.bool)
        # World Congress sessions held.
        self.congress_sessions = torch.zeros(B, dtype=torch.long, device=device)
        # Per-seat era-score accumulator on unified civ ids (col 0 = seat 0,
        # r+1 = civ r) — the TS `state.eraScore` mirror. Integer, zero-draw;
        # resets at every eraLength boundary (right after `self.turn += 1`, the
        # endTurn eraBoundary mirror). Loaded from the fixture's t0 snapshot.
        # _MUTABLE for snapshot/restore.
        self.era_score = torch.zeros(B, 1 + r_pad, dtype=torch.long, device=device)
        # The NAMED dedications each seat committed this era — catalog indices,
        # HEROIC_DEDICATIONS wide; -1 = slot unused.
        self.ded_picks = torch.full((B, 1 + r_pad, max(int(rules.eras.get("heroicDedications", 3)), 1)), -1, dtype=torch.long, device=device)
        for b, f in enumerate(fixtures):
            esi = f.get("eraScoreInit", [])
            for c, v in enumerate(esi[: 1 + r_pad]):
                self.era_score[b, c] = int(v)
        _er = rules.eras
        self._civ_pair_ally_min_peace = int((rules.seats.get("eras") or {}).get("allyMinPeace", 30))
        _er2 = rules.seats.get("eras") or {}
        self._wm_dow = int(_er2.get("warmongerDow", 4))
        self._wm_cap = int(_er2.get("warmongerCapture", 3))
        self._wm_gang = int(_er2.get("warmongerGang", 6))
        self._favor_per_suz = int(_er2.get("diplomaticFavorPerSuzerain", 1))
        # The WORLD CONGRESS schedule + victory threshold.
        self._congress_interval = int(_er2.get("congressInterval", 30))
        self._congress_min_era = int(_er2.get("congressMinEra", 2))
        self._dvp_per_res = int(_er2.get("dvpPerResolution", 1))
        self._dvp_win = int(_er2.get("diploVictoryPoints", 20))
        self._era_len = int(_er.get("length", 50))
        self._era_pts = {k: int(_er.get(k, d)) for k, d in (("found", 2), ("conquer", 3), ("wonder", 3), ("pantheon", 1), ("religion", 2), ("gp", 1))}
        # Per-seat Age (0 Dark / 1 Normal / 2 Golden), assigned at each era
        # boundary from the just-ended window's score; era 0 is all Normal (the
        # TS civAges default — nothing exported at t0). _MUTABLE. _age_factor =
        # the SOURCE seat's loyalty-pressure multiplier (halves — exact in f32
        # AND f64, so modulated sums stay association-free).
        self.civ_age = torch.ones(B, 1 + r_pad, dtype=torch.long, device=device)
        # Dedication substrate — the PREVIOUS age (the Heroic test) and how many
        # dedications each seat committed this era.
        self.prev_age = torch.ones_like(self.civ_age)
        self.dedications = torch.ones_like(self.civ_age)
        self._era_dark = int(_er.get("darkT", 3))
        self._era_gold = int(_er.get("goldenT", 10))
        self._age_factor = torch.tensor(_er.get("agePressure", [0.5, 1.0, 1.5]), dtype=torch.float64, device=device)
        # Governors — STATELESS greedy loyalty anchors, recomputed every turn
        # from civics + the quantized loyalty snapshot.
        self._gov_per = int(_er.get("govCivicsPerTitle", 10))
        self._gov_max = int(_er.get("govMaxTitles", 5))
        self._ded_payouts_live = bool(_er.get("dedicationPayoutsLive", False))
        # Catalog indices for the golden-age dedications.
        self._ded_monumentality = int(_er.get("dedMonumentality", 0))
        self._ded_free_inquiry = int(_er.get("dedFreeInquiry", 1))
        self._ded_pen_brush = int(_er.get("dedPenBrush", 2))
        # +Movement from MONUMENTALITY (Builders) / EXODUS (Missionaries,
        # Apostles). Defaults to 0 so a stale rules.json fails LOUDLY at the
        # parity gate instead of quietly disagreeing with TS.
        self._golden_move = int(_er.get("goldenMoveBonus", 0))
        self._ded_exodus = int(_er.get("dedExodus", 3))
        self._heroic_ded = int(_er.get("heroicDedications", 3))
        # The NAMED dedication catalog — per-kind event era score.
        self._ded_event_score = [int(x) for x in _er.get("dedEventScore", [1, 1, 1, 2])]
        self._n_ded = len(self._ded_event_score)
        self._ded_faith = int(_er.get("dedicationFaith", 2))
        self._ded_era = int(_er.get("dedicationEraScore", 1))
        self._gov_loy = float(_er.get("governorLoyalty", 8))
        # The civ slices of the two clocks (integer turn counters).
        self.civ_only_warturns = self.war_turns[:, 1:1 + r_pad]
        self.register_alias("civ_only_warturns", lambda sim: sim.war_turns[:, 1:1 + max(sim.R, 1)])
        self.civ_only_peaceturns = self.peace_turns[:, 1:1 + r_pad]
        self.register_alias("civ_only_peaceturns", lambda sim: sim.peace_turns[:, 1:1 + max(sim.R, 1)])
        # Per-city production queue head. civ_city_current: -1 idle, 0 settler,
        # 1+u trains roster unit u.
        nt_b3, nc_b3 = len(rules.t_cost), len(rules.c_cost)
        # The per-seat RESEARCH vectors, merged like the scalars. Placed here
        # because their width is only known once the rules tables are read.
        for _nm, _w in (("techs", nt_b3), ("civics", nc_b3),
                        ("tech_boosted", nt_b3), ("civic_boosted", nc_b3)):
            _base = torch.zeros(B, 1 + r_pad, _w, dtype=torch.bool, device=device)
            setattr(self, f"civ_{_nm}", _base)
            setattr(self, _nm, _base[:, 0])
            setattr(self, f"civ_only_{_nm}", _base[:, 1:])
            self.register_alias(_nm, lambda sim, k=_nm: getattr(sim, f"civ_{k}")[:, 0])
            self.register_alias(f"civ_only_{_nm}", lambda sim, k=_nm: getattr(sim, f"civ_{k}")[:, 1:])
        # WHO DRIVES EACH SEAT — one column per seat row, False = the built-in
        # AI, True = actions supplied from outside. The scripted picker,
        # research auto-pick and unit AI skip an externally driven seat;
        # externally written choices (civ_city_current, civ_only_cur_*) are honored by the
        # existing mechanics. `controlled` is the VIEW of the civ columns. Only
        # `seat_ext` is _MUTABLE-registered — registering a view as well would
        # double-restore it (the citystate_atwar contract, asserted in citystate_war_test).
        self.seat_ext = torch.zeros(B, 1 + r_pad + s_pad + 1, dtype=torch.bool, device=device)
        # Row 0 is driven from outside from the moment the world exists: the
        # decision server IS seat 0's only driver (#93). Saying so here is what
        # lets `_apply_seat_unit_actions` gate on `seat_ext[:, row]` for every
        # seat instead of carrying a "row 0 needs no permission" branch.
        self.seat_ext[:, 0] = True
        self.controlled = self.seat_ext[:, 1:1 + r_pad]
        self.register_alias("controlled", lambda sim: sim.seat_ext[:, 1:1 + max(sim.R, 1)])
        # Civ-city district registry [.., nD]: the tile of each placed district
        # type, -1 = none. A queued district already occupies its column, so it
        # counts toward the cap and the one-per-type rule (city.districts in TS).
        nd_b4 = max(len(rules.districts or []), 1)
        # The district-tile registry on the city-block seat axis (row 0 =
        # seat 0, rows 1.. = the civ seats; city-states pave no districts, so
        # no CS rows). EVERY row is live: writes at queue (_place_district /
        # _place_district_civ), the capture rebuilds, and clears at every
        # city-exit path; _district_discounted and _quest_owns_dist read one
        # body over city_dist_tile[:, row]. One base, one geometry.
        self.city_dist_tile = torch.full((B, 1 + r_pad, civ_city_pad, nd_b4), -1, dtype=torch.long, device=device)
        self.civ_city_dist_tile = self.city_dist_tile[:, 1:]
        self.dist_tile = self.city_dist_tile[:, 0]
        self.register_alias("civ_city_dist_tile", lambda sim: sim.city_dist_tile[:, 1:])
        self.register_alias("dist_tile", lambda sim: sim.city_dist_tile[:, 0])
        # Districts on CAPTURED territory are DEAD — the tiles stay paved but
        # the conquering city's registry holds only CITY_CENTER (no
        # yields/upkeep/counts; the paving still blocks).
        self.district_dead = torch.zeros(B, T, dtype=torch.bool, device=device)
        # Persistent city ids on the seat axis (row 0 = seat 0, rows 1.. =
        # the civ seats) — the TS City.id, allocated per seat from
        # civ_next_city_id. tile_city stores THESE ids for every seat
        # (#110 slice 2); consumers that speak seat-0 column space resolve
        # through the `owner` cache's id→slot match.
        self.city_id = torch.zeros(B, 1 + r_pad, civ_city_pad, dtype=torch.long, device=device)
        self.civ_city_id = self.city_id[:, 1:]
        self.register_alias("civ_city_id", lambda sim: sim.city_id[:, 1:])
        # capitalTiles, seat-indexed: only an isCapital founding (t0 or a
        # total-collapse refound) writes a row. The capital is an identity
        # (city_is_cap), not a slot — _reclaim_cities compaction permutes slots
        # underneath. Row 0 starts -1 (no capital until the first FOUND crowns
        # it); cap_tile / civ_only_cap_tile are the row views.
        self.civ_cap_tile = torch.zeros(B, 1 + r_pad, dtype=torch.long, device=device)
        self.civ_cap_tile[:, 0] = -1
        self.cap_tile = self.civ_cap_tile[:, 0]
        self.civ_only_cap_tile = self.civ_cap_tile[:, 1:]
        # Trade routes — (from_id, to_id) rc-id pairs, -1 = empty column.
        # Id-keyed like tile_city, so _reclaim_cities slot permutations never touch
        # it. K must cover the real capacity bound (tradeCapacity):
        # FOREIGN_TRADE 1 + maxCities MARKET/LIGHTHOUSE + 2 wonders (COLOSSUS,
        # GREAT_ZIMBABWE) + one per suzerained TRADE city-state, plus slack.
        # No route exists at t0.
        k_routes = 1 + int(self.rules.seats.get("maxCities", 6)) + 2 + max(int(self.S), 0) + 2
        # ROUTES ARE A SEAT PLANE: one `seat_routes` over every seat row, with
        # `civ_only_routes` as the [:, 1:] VIEW onto it, exactly like seat_ext ->
        # controlled and civ_* -> r_*. Seat 0 having a slice is what lets a
        # seat-generic rule (the shared CS-quest issuer) ask "do I already route
        # to this city-state?" without caring which seat is asking.
        self.seat_routes = torch.full((B, 1 + r_pad + s_pad + 1, k_routes, 2), -1, dtype=torch.long, device=device)
        self.civ_only_routes = self.seat_routes[:, 1:1 + r_pad]
        self.register_alias("civ_only_routes", lambda sim: sim.seat_routes[:, 1:1 + max(sim.R, 1)])
        # Parallel per-route metadata (same slot layout as civ_only_routes[..., :]).
        # civ_only_route_dest holds an international route's destination city CENTER
        # TILE (>=0); -1 marks domestic/CS (dest decoded from civ_only_routes[..., 1]).
        # civ_only_route_exp is the route's expiry turn (start + trade.duration); -1 on
        # a free slot.
        self.seat_route_dest = torch.full((B, 1 + r_pad + s_pad + 1, k_routes), -1, dtype=torch.long, device=device)
        self.seat_route_exp = torch.full((B, 1 + r_pad + s_pad + 1, k_routes), -1, dtype=torch.long, device=device)
        self.civ_only_route_dest = self.seat_route_dest[:, 1:1 + r_pad]
        self.civ_only_route_exp = self.seat_route_exp[:, 1:1 + r_pad]
        self.register_alias("civ_only_route_dest", lambda sim: sim.seat_route_dest[:, 1:1 + max(sim.R, 1)])
        self.register_alias("civ_only_route_exp", lambda sim: sim.seat_route_exp[:, 1:1 + max(sim.R, 1)])
        # Seat <-> city-state diplomacy: the envoys/met planes plus the
        # influence/envoy-bank accumulators. Nothing at t0 (every seat starts
        # unmet, zero everywhere).
        self._alloc_cs_pairs(B, r_pad, s_pad, device)
        # City-state quests — ONE per (seat, CS). kind 0 none / 1 clearCamp /
        # 2 trade / 3 district; the buildDistrict target is deterministic (the
        # CS type's district, from _citystate_didx), so no per-quest district plane is
        # needed. civ_only_citystate_quest_issued starts at 0, so the first issue is at
        # turn >= questCooldown.

        # THE CENTRE REGISTRY, seat-generic: the owning seat's city SLOT at
        # any major centre tile, -1 elsewhere. The seat is tile_seat's, the
        # id is tile_city's; center_at / civ_city_at are cached derived views.
        self.centre_slot_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        # ---------------------------------------------------------------------
        # ONE UNIT POOL. Two DISJOINT CONTIGUOUS SLOT RANGES of one tensor per
        # plane:
        #
        #     [ 0 .. MAJOR_POOL_MAX )                        EVERY major seat
        #     [ MAJOR_POOL_MAX .. MAJOR_POOL_MAX+BARB_POOL_MAX )  barbarians
        #
        # A unit's OWNER is `unit_seat`, NEVER the range it landed in — seat 0
        # spawns through the same cursor into the same range as every civ seat,
        # exactly as TS pushes every seat's unit onto one `state.units`. A
        # RANGE only says which CLASS of actor lives there, which is what the
        # barbarian split is for.
        #
        # `major_unit_*` / `barb_unit_*` are VIEWS, so every write must be in
        # place. tests/gpu/inplace_discipline_test.py enforces that statically
        # and _check_state_discipline re-checks the data_ptr at runtime under
        # CIV6_ALIAS_CHECK=1.
        # ---------------------------------------------------------------------
        self.UNIT_MAX = simbase.MAJOR_POOL_MAX + simbase.BARB_POOL_MAX
        self.POOL_LO = {"major": 0, "barb": simbase.MAJOR_POOL_MAX}
        self.POOL_HI = {"major": simbase.MAJOR_POOL_MAX, "barb": self.UNIT_MAX}
        #: The APPEND CURSOR behind each pool, named once. Every spawn, capture
        #: and compaction reads it from here rather than re-deriving the name.
        self.POOL_NEXT = {"major": "unit_next", "barb": "next_slot"}
        self._UNIT_PLANES: list = []
        for _pl, _dt in (
            ("alive", torch.bool),      # a slot holds a living unit
            ("emb", torch.bool),        # embarked — a land unit standing on water
            ("type", torch.long),       # roster index (barbs too)
            ("tile", torch.long),
            ("hp", torch.long),
            ("fortify", torch.long),    # fortifyTurns (military; cap 2)
            ("xp", torch.long),         # combat experience
            ("charges", torch.long),    # builder/missionary charges
            # The general/admiral aura's +MP, FROZEN at the refreshUnits site
            # (_refresh_aura_mp) — walkers read it instead of recomputing, so a
            # general that walks later in the same step cannot retro-change a
            # pool TS already granted.
            ("aura_mp", torch.long),
            # MOVEMENT POINTS as state: what the unit has left this turn, and
            # its full per-turn pool.
            ("mp", torch.long),
            ("mp_full", torch.long),
            # The OWNER of whatever sits in this slot, in the absolute seat
            # space TS uses (0 seat 0, 1..99 civs, 100+ city-states, 200 barbs)
            # — a value you can gather and compare without already knowing which
            # pool range you are looking at. Checked by _check_seat_invariant.
            ("seat", torch.long),
        ):
            _base = torch.zeros(B, self.UNIT_MAX, dtype=_dt, device=device)
            setattr(self, f"unit_{_pl}", _base)
            self._UNIT_PLANES.append(_pl)
            for _pre in ("major", "barb"):
                setattr(self, f"{_pre}_unit_{_pl}", _base[:, self.POOL_LO[_pre]:self.POOL_HI[_pre]])
                # Assert forever that the view still shares storage with the
                # merged pool.
                self.register_alias(
                    f"{_pre}_unit_{_pl}",
                    lambda sim, pl=_pl, pre=_pre: getattr(sim, f"unit_{pl}")[
                        :, sim.POOL_LO[pre]:sim.POOL_HI[pre]
                    ],
                )
        # The barbarian range carries BARB_SEAT. The MAJOR range is SEEDED to
        # seat 1 so a DEAD slot still names a real seat — and deliberately NOT
        # to 0: `unit_seat == 0` is how every seat-0 read is spelled now, and a
        # never-spawned slot reading as seat 0 would hand seat 0 the whole
        # unused pool.
        self.barb_unit_seat.fill_(BARB_SEAT)
        self.major_unit_seat.fill_(1)

        #: The ONE major append cursor. `_reclaim_pool` compacts the range and
        #: rewinds it, so it bounds LIVE units, not ever-spawned ones.
        self.unit_next = torch.zeros(B, dtype=torch.long, device=device)
        # ONE occupancy map per DOMAIN, holding a MERGED-pool slot: "whose unit
        # is on this tile?" is unit_seat.gather(1, occ_*), with no per-pool
        # plane to pick first.
        self.military_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.civilian_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.gp_earned = torch.zeros(B, n_gp, dtype=torch.long, device=device)
        self.pantheon_claimed_n = torch.zeros(B, dtype=torch.long, device=device)
        self.claimed_f_n = torch.zeros(B, dtype=torch.long, device=device)
        self.claimed_o_n = torch.zeros(B, dtype=torch.long, device=device)
        self.claimed_e_n = torch.zeros(B, dtype=torch.long, device=device)  # enhancer race
        # Belief IDENTITY — per-id pool masks + per-seat claimed ids (the counts
        # above are gate mirrors; masks and counts move together). Ids are -1
        # until claimed; effects gather rows id+1 from tables whose row 0 is the
        # neutral pad (zeros for adds, ones for multipliers).
        _bl = rules.beliefs or {}
        self.pan_claimed = torch.zeros(B, max(len(_bl.get("pantheons", [])), 1), dtype=torch.bool, device=device)
        self.fol_claimed = torch.zeros(B, max(len(_bl.get("followers", [])), 1), dtype=torch.bool, device=device)
        self.fou_claimed = torch.zeros(B, max(len(_bl.get("founders", [])), 1), dtype=torch.bool, device=device)
        # Enhancer pool mask + per-seat claimed identity + a done flag, in the
        # fol_claimed / civ_only_follower / civ_only_religion_done shape. Enhancers carry none
        # of the generic beliefRow fields, so they have no `_bel` table; their
        # channels are the separate `_enh` table below.
        self.enh_claimed = torch.zeros(B, max(len(_bl.get("enhancers", [])), 1), dtype=torch.bool, device=device)
        self._enh_any = len(_bl.get("enhancers", [])) > 0
        # Religious pressure spread. Religions are indexed in the unified civ
        # space: 0 = seat 0, i+1 = civ i. holy_tile[:, g] = religion g's frozen
        # holy tile (its founding capital center) or -1. The per-city integer
        # pressure accumulators and the followed religion id (-1 = none) live on
        # the city block below. Dead/absent slots are zeroed each turn, mirroring
        # the TS fresh-object reset on founding/flip.
        self._O = self.O  # 1 + R
        self._pressure_range = int(rr.get("pressureRange", 10))  # holy-city spread radius
        # pressure -> yields coupling. True: a city's FOLLOWER-belief yields key
        # on its own followedReligion (city_followed). False: on the owning
        # seat's religion.
        self._b18_couple = bool(rr.get("followerCoupling", False))
        self.holy_tile = torch.full((B, self._O), -1, dtype=torch.long, device=device)
        # ONE religion plane pair over every seat row — seat 0 is a row like any
        # other, matching TS's single `allCities(state)` loop over one
        # religionPressure field.
        self.city_pressure = torch.zeros(B, 1 + r_pad + s_pad, civ_city_pad, self._O, dtype=torch.long, device=device)
        self.city_followed = torch.full((B, 1 + r_pad + s_pad, civ_city_pad), -1, dtype=torch.long, device=device)
        self._bel = {}
        for _pool, _rows in (("pan", _bl.get("pantheons", [])), ("fol", _bl.get("followers", [])), ("fou", _bl.get("founders", []))):
            _nf = len(_rows[0]["featY"]) if _rows else 1
            _nb = len(_rows[0]["bldgY"]) if _rows else 1
            _ng = len(_rows[0]["gpp"]) if _rows else 1
            _ni = len(_rows[0]["impY"]) if _rows and "impY" in _rows[0] else 1
            self._bel[_pool] = {
                "featY": torch.tensor([[[0.0] * 6] * _nf] + [x["featY"] for x in _rows], dtype=torch.float64, device=device),
                "bldgY": torch.tensor([[[0.0] * 6] * _nb] + [x["bldgY"] for x in _rows], dtype=torch.float64, device=device),
                "bldgH": torch.tensor([[0.0] * _nb] + [x["bldgH"] for x in _rows], dtype=torch.float64, device=device),
                "border": torch.tensor([1.0] + [x["border"] for x in _rows], dtype=torch.float64, device=device),
                "growth": torch.tensor([1.0] + [x["growth"] for x in _rows], dtype=torch.float64, device=device),
                "gpp": torch.tensor([[0] * _ng] + [x["gpp"] for x in _rows], dtype=torch.long, device=device),
                "we": torch.tensor([0.0] + [float(x["we"]) for x in _rows], dtype=torch.float64, device=device),
                "river": torch.tensor([[0.0, 0.0]] + [x["river"] for x in _rows], dtype=torch.float64, device=device),
                "zen": torch.tensor([[0.0, 0.0]] + [x["zen"] for x in _rows], dtype=torch.float64, device=device),
                "perF": torch.tensor([[0.0] * 7] + [x["perF"] for x in _rows], dtype=torch.float64, device=device),
                "perC": torch.tensor([[0.0] * 6] + [x["perC"] for x in _rows], dtype=torch.float64, device=device),
                "impRes": torch.tensor([[[0.0] * 6] * 4] + [x.get("impRes", [[0.0] * 6] * 4) for x in _rows], dtype=torch.float64, device=device),
                "fpw": torch.tensor([0.0] + [float(x.get("fpw", 0)) for x in _rows], dtype=torch.float64, device=device),
                # improvementYields [nBel+1, nImp, 6], row 0 = the unclaimed
                # pad.
                "impY": torch.tensor(
                    [[[0.0] * 6] * _ni] + [x.get("impY", [[0.0] * 6] * _ni) for x in _rows],
                    dtype=torch.float64, device=device,
                ),
            }
        self._bel_any = any(len(_bl.get(k, [])) > 0 for k in ("pantheons", "followers", "founders"))
        # Enhancer effect channels (row 0 = the unclaimed pad; index =
        # civ_only_enhancer + 1).
        _erows = _bl.get("enhancers", [])
        # The missionary chassis anchors + per-enhancer channels. The exporter
        # pre-rounds mcost/mlump to INTEGERS (Math.round on the TS side), so
        # both engines read the identical value; the pad row (index 0 = no
        # enhancer) carries the BASE cost/lump, unlike the additive zero pads of
        # the other channels.
        _mcost0 = float(_bl.get("missionaryCost", 60))
        _mlump0 = int(_bl.get("spreadPressure", 10))
        self._missionary_idx = int(_bl.get("missionaryIdx", -1))
        self._missionary_cap = int(_bl.get("missionaryCap", 2))
        # APOSTLE + theological combat.
        self._apostle_idx = int(_bl.get("apostleIdx", -1))
        self._apostle_cost = float(_bl.get("apostleCost", 200))
        self._apostle_cap = int(_bl.get("apostleCap", 1))
        _rs = _bl.get("relStrength") or []
        self._rel_strength = torch.tensor(list(_rs) + [0] * 64, dtype=torch.long, device=device)
        self._city_rel_live = bool(_bl.get("cityReligionAdderLive", False))  # gates _rel_atk_cs on city attacks
        self._theo_dmg = int(_bl.get("theoDamage", 2))
        self._theo_base = int(_bl.get("theoBaseDamage", 30))
        self._theo_swing = float(_bl.get("theoPressureSwing", 15))
        self._theo_range = int(_bl.get("theoPressureRange", 6))
        self._enh = {
            "presR": torch.tensor([0.0] + [float(x.get("presR", 0)) for x in _erows], dtype=torch.float64, device=device),
            "tradeRel": torch.tensor([[0.0] * 6] + [list(x.get("tradeRel", [0.0] * 6)) for x in _erows], dtype=torch.float64, device=device),
            "cnear": torch.tensor([0.0] + [float(x.get("cnear", 0)) for x in _erows], dtype=torch.float64, device=device),
            "cdef": torch.tensor([0.0] + [float(x.get("cdef", 0)) for x in _erows], dtype=torch.float64, device=device),
            "cvs": torch.tensor([0.0] + [float(x.get("cvs", 0)) for x in _erows], dtype=torch.float64, device=device),
            "mchg": torch.tensor([0] + [int(x.get("mchg", 0)) for x in _erows], dtype=torch.long, device=device),
            "mlump": torch.tensor([_mlump0] + [int(x.get("mlump", _mlump0)) for x in _erows], dtype=torch.long, device=device),
            "mcost": torch.tensor([_mcost0] + [float(x.get("mcost", _mcost0)) for x in _erows], dtype=torch.float64, device=device),
        }
        self._just_war_range = int(_bl.get("justWarRange", 3))
        self._enh_combat_any = bool((self._enh["cnear"] != 0).any() or (self._enh["cdef"] != 0).any() or (self._enh["cvs"] != 0).any())
        self._rel_planes_cache = None  # ((turn, _eff_version), (near3 [B,O,T], terr [B,O,T]))
        # Projects — rows {d: district idx, y: yield col, g: GP class}
        _pj = rules.projects or {}
        self._proj_rows = list(_pj.get("rows", []))
        self._proj_yf = float(_pj.get("yieldFraction", 0.15))
        self._proj_gf = float(_pj.get("gppFraction", 0.22))
        # The space-race chain. Space rows carry sp/vic flags (+ rt tech gate,
        # rp previous-step link) and sit LAST in the projects table, in chain
        # order. space_proj_idx = the projects-table rows that are space steps;
        # space_step maps a row idx to its 0-based position in the chain;
        # space_victory_idx = the winning step(s). Mirrors cpu/data/projects.ts
        # SPACE_PROJECTS + completeProject.
        self._space_proj_idx = [i for i, row in enumerate(self._proj_rows) if int(row.get("sp", 0))]
        self._n_space = len(self._space_proj_idx)
        self._space_step = {pi: k for k, pi in enumerate(self._space_proj_idx)}
        self._space_victory_idx = {i for i in self._space_proj_idx if int(self._proj_rows[i].get("vic", 0))}
        # World wonders — the tile planes (built_wonder id at a paved tile, its
        # completion flag), the per-rc registry, the static placement bitmask +
        # rid/des planes, and the effect tables.
        _wd = rules.wonders or {}
        self._wond_rows = list(_wd.get("rows", []))
        self._wond_n = len(self._wond_rows)
        self._fp_fid = int(_wd.get("fpFid", -1))
        self.built_wonder = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.built_wonder_complete = torch.zeros(B, T, dtype=torch.bool, device=device)
        # The wonder-tile registry, same seat-axis shape and row liveness as
        # city_dist_tile above (row 0 fills only via capture — seat 0 cannot
        # queue wonders, the #83 action-surface gap).
        self.city_wonder = torch.full((B, 1 + r_pad, civ_city_pad, max(self._wond_n, 1)), -1, dtype=torch.long, device=device)
        self.civ_city_wonder = self.city_wonder[:, 1:]
        self.wonder_reg = self.city_wonder[:, 0]
        self.register_alias("civ_city_wonder", lambda sim: sim.city_wonder[:, 1:])
        self.register_alias("wonder_reg", lambda sim: sim.city_wonder[:, 0])
        self.res_id = torch.tensor([[t.get("rid", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.desert = torch.tensor([[t.get("des", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.wok = torch.tensor([[t.get("wok", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        if self._wond_n:
            self._wond_cy = torch.tensor([w["cy"] for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW, 6]
            self._wond_mult = torch.tensor([w["mult"] for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW, 6]
            self._wond_grow = torch.tensor([w["growAll"] for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW]
            self._wond_petra = torch.tensor([bool(w.get("petra", 0)) for w in self._wond_rows], dtype=torch.bool, device=device)  # [nW]
            # wonderRegionalAmenities — amenities a COMPLETE wonder pays to every
            # same-seat city centre within regional_range (Great Bath 1, Alhambra
            # 2, Colosseum 1). Reaches the tier balance only, never the luxury
            # ranking's baseHave (city.ts luxuryAmenities).
            self._wond_regam = torch.tensor([float(w.get("regionalAmenities", 0)) for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW]
            # Per-wonder Great Work slots [nW, 3] in kind order (writing, art,
            # music), additive with the GW_BUILDINGS slots.
            self._wond_gw = torch.tensor([list(w.get("gwslots", [0, 0, 0])) for w in self._wond_rows], dtype=torch.long, device=device)
        self.feat_id = torch.tensor([[t.get("fid", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # foundCity strips ONLY a REMOVABLE feature — an OASIS/FLOODPLAINS
        # center keeps its feature LIVE (belief featureYields still apply
        # there). Founding paths gate their feat_stripped/tdef writes on this.
        self.feat_removable = torch.tensor([[bool(t.get("frm", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        for b, f in enumerate(fixtures):
            for cv in f["civs"]:
                seat = int(cv["seat"])
                if seat == 0:
                    continue  # seat 0's units seed the pool below, once the roster tables exist
                rid = seat - 1
                self.civ_only_alive[b, rid] = True
                self.civ_only_aggression[b, rid] = cv["aggression"]
                # Nothing is pre-founded — `cities` is [] and every city arrives
                # through a FOUND verb; the loop stays for the shape.
                for j, rc in enumerate(cv.get("cities", [])):
                    self.civ_city_alive[b, rid, j] = True
                    self.civ_city_center[b, rid, j] = rc["center"]
                    self.civ_city_pop[b, rid, j] = rc["pop"]
                    self.civ_city_hp[b, rid, j] = rr.get("cityMaxHp", 200)
                    self.civ_city_id[b, rid, j] = rc["id"]
                    self.centre_slot_at[b, rc["center"]] = j
                self.civ_only_next_city_id[b, rid] = len(cv.get("cities", []))
                for u_ in cv["units"]:
                    v = int(self.unit_next[b])
                    self.major_unit_alive[b, v] = True
                    self.major_unit_seat[b, v] = seat
                    self.major_unit_type[b, v] = u_["type"]
                    self.major_unit_tile[b, v] = u_["tile"]
                    self.major_unit_hp[b, v] = rules.combat.get("unitHp", 100)
                    # The t0 roster carries a SETTLER (civilian) beside the
                    # warrior — occupancy goes to the CIVILIAN map for it.
                    if bool((rules.units[int(u_["type"])]).get("civilian", 0)):
                        self.civilian_at[(b, u_['tile'])] = v
                    else:
                        self.military_at[(b, u_['tile'])] = v
                    # the seeder's spawn reveal — t0 explored derives from the
                    # start units on BOTH engines (the fixture carries none).
                    if self.fog_of_war:
                        self.seat_explored[b, seat] |= self.pair_dist[int(u_["tile"])] <= 2
                    self.unit_next[b] += 1
        self._gp_costs = torch.tensor(rr.get("gpCosts", [60 * 2**n for n in range(8)]), dtype=torch.float64, device=device)
        self._gp_roster = torch.tensor(rr.get("gpRoster", [4, 4, 4, 4, 4]), dtype=torch.long, device=device)
        # Great people (advanceGreatPeople): points accrue per class from its
        # district + that district's buildings; earning the n-th person costs
        # gp_costs[n] and applies gp_effects[cls, n]. Every seat draws from the
        # SAME gp_earned pool, the civ seats claiming first each turn.
        gp_cd = rr.get("gpClassDistrict", [])
        self._gp_class_district = torch.tensor(gp_cd if gp_cd else [-1] * n_gp, dtype=torch.long, device=device)  # [n_gp] every class
        gp_fx = rr.get("gpEffects", [])
        self._gp_effects = torch.tensor(gp_fx if gp_fx else [[[0, 0, 0, 0, 0]] * 4] * n_gp, dtype=dtype, device=device)  # [n_gp, maxN, 5] (col 4 = faith)
        self._prophet_cls = int(rr.get("prophetCls", 3))  # PROPHET's class index
        self._gp_nc = int(self._gp_class_district.numel())
        self._alloc_civ_pairs(B, max(self.R, 1), dtype, device)
        # GREAT WORKS, in three slotted kinds (0 WRITING / 1 ART / 2 MUSIC). A
        # claimed WRITER / ARTIST / MUSICIAN (gwClsByKind) slots gwWorksByKind
        # works into its seat's cities, into the building column gwBidxByKind
        # names (b_cost catalog order), gwSlotsByKind per building; overflow
        # charges fall back to the instant culture lump. Per-city work counts
        # feed a culture/turn yield BY KIND (greatWorkCulture is the TS twin).
        # Every write bumps _eff_version — this is yield-bearing state.
        self._gw_cls = [int(x) for x in rr.get("gwClsByKind", [-1, -1, -1])]
        self._gw_bidx = [int(x) for x in rr.get("gwBidxByKind", [-1, -1, -1])]
        self._gw_slots_k = [int(x) for x in rr.get("gwSlotsByKind", [2, 3, 1])]
        self._gw_works_k = [int(x) for x in rr.get("gwWorksByKind", [2, 3, 2])]
        # RELICS (the TEMPLE's slot) and ARTIFACTS — the same plumbing shape.
        self._modern_era_index = int(rr.get("modernEraIndex", 5))
        self._artifact_bidx = int(rr.get("artifactBidx", -1))
        self._artifact_slots = int(rr.get("artifactSlots", 3))
        self._artifact_culture = int(rr.get("artifactCulture", 3))
        self._artifact_tourism = int(rr.get("artifactTourism", 3))
        self._relic_bidx = int(rr.get("relicBidx", -1))
        self._relic_slots = int(rr.get("relicSlots", 1))
        self._relic_faith = int(rr.get("relicFaith", 4))
        self._relic_tour = int(rr.get("relicTourism", 8))
        self._gw_cul_k = [float(x) for x in rr.get("gwCultureByKind", [2, 2, 4])]
        # TOURISM per Great Work, paired with the culture above.
        self._gw_tour_k = [int(x) for x in rr.get("gwTourismByKind", [2, 2, 4])]
        # PRINTING doubles Great Work of WRITING tourism.
        self._gw_printing_tech = int(rr.get("gwPrintingTech", -1))
        self._gw_printing_mult = int(rr.get("gwPrintingWritingMult", 2))
        # WONDER tourism — base + 1 per era advanced PAST the wonder's own era.
        # Wonder era comes from its unlock; a seat's era is the highest era
        # among its completed techs/civics (the same scale).
        self._wonder_tour_base = int(rr.get("wonderTourismBase", 2))
        # CULTURE VICTORY thresholds.
        self._tourism_per_visitor = int(rr.get("tourismPerVisitorPerCiv", 200))
        self._culture_per_tourist = int(rr.get("culturePerDomesticTourist", 100))
        self._tech_era = torch.tensor(rr.get("techEra", []) or [0], dtype=torch.long, device=device)
        self._civic_era = torch.tensor(rr.get("civicEra", []) or [0], dtype=torch.long, device=device)
        _wera = (rules.wonders or {}).get("eras", []) or [0]
        self._wonder_era = torch.tensor(list(_wera), dtype=torch.long, device=device)
        # ANTIQUITY SITES — the markAntiquitySite twin. Created by PRE-MODERN
        # events (a razed camp, a unit death) and excavated into Artifacts by an
        # Archaeologist.
        self.antiquity = torch.zeros(B, self.T, dtype=torch.bool, device=device)
        self._loyalty_amenity = torch.tensor(rr.get("loyaltyAmenity", [6, 3, 0, -3, -6]), dtype=dtype, device=device)
        self._off3 = tiles_within_offsets(int(rr.get("workRadius", 3))).to(device)
        self._off5 = tiles_within_offsets(5).to(device)  # border growth radius (BORDER_MAX_RADIUS)
        self._off7 = tiles_within_offsets(7).to(device)
        self._off2 = tiles_within_offsets(2).to(device)
        self._off1 = tiles_within_offsets(1).to(device)
        ids = [u["id"] for u in (rules.units or [])]
        self._civ_only_spearman = ids.index("SPEARMAN") if "SPEARMAN" in ids else 0
        self._civ_only_horseman = ids.index("HORSEMAN") if "HORSEMAN" in ids else 0
        # The ranged rung (SLINGER ungated, ARCHER on archerTech)
        self._civ_only_slinger = ids.index("SLINGER") if "SLINGER" in ids else -1
        self._civ_only_archer = ids.index("ARCHER") if "ARCHER" in ids else -1

        # --- disasters -----------------------------------------------------------
        self.disasters = bool(f0.get("disasters", 0))
        self.floodplain = torch.tensor([[t.get("fp", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.drought_cand = torch.tensor([[t.get("dc", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.desert = torch.tensor([[t.get("de", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.fertilizable = torch.tensor([[t.get("fz", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        n_volc = max(max((len(f.get("volcanoes", [])) for f in fixtures), default=0), 1)
        self.volcano_tile = torch.full((B, n_volc), -1, dtype=torch.long, device=device)
        for b, f in enumerate(fixtures):
            for i, v in enumerate(f.get("volcanoes", [])):
                self.volcano_tile[b, i] = v
        self.fertility = torch.zeros(B, T, dtype=torch.long, device=device)
        self.drought = torch.zeros(B, T, dtype=torch.long, device=device)

        # --- improvements ---------------------------------------------------------
        imp = rules.improvements or {}
        ids = imp.get("ids", [])
        self.improvements_on = bool(ids)
        self._imp_ids = list(ids)  # roster names, index-aligned
        # The unit-action enum, exported from cpu/core/unitActions.ts
        # (unitActionNames). Every dispatch indexes BY NAME, never by a
        # hardcoded column number.
        self._act_names = list((rules.actions or {}).get("unit", []))
        self._act = {n: i for i, n in enumerate(self._act_names)}
        if self._act_names:
            # The expected width VERSIONS ON THE ENUM'S OWN CONTENT: each
            # optional block (SNIPE, SPREAD, FOUND) is all-or-nothing, so a
            # PARTIAL enum fails loudly whichever blocks an export carries.
            self._snipe_on = "SNIPE_0" in self._act
            self._A_SPREAD = self._act.get("SPREAD_HERE", -1)  # religious spread head
            self._A_FOUND = self._act.get("FOUND_CITY", -1)  # the settler's verb
            _want = 13 + len(ids) + 3 + (12 if self._snipe_on else 0) + (7 if self._A_SPREAD >= 0 else 0) \
                + (1 if self._A_FOUND >= 0 else 0)
            assert len(self._act_names) == _want, f"unit action enum is {len(self._act_names)} wide, expected {_want} for {len(ids)} improvements"
            self._A_CHOP = self._act["CHOP"]
            self._A_REPAIR = self._act["REPAIR"]
            self._A_PILLAGE = self._act["PILLAGE"]
            self._A_SNIPE = self._act.get("SNIPE_0", self._A_PILLAGE + 1)
            # column for BUILD_<improvement>, indexed by improvement roster index
            self._A_IMP = [self._act.get(f"BUILD_{n}", -1) for n in ids]
        else:
            # No enum shipped (a stale rules.json): fall back to hardcoded
            # column numbers so nothing crashes. These numbers can collide —
            # re-export rather than rely on them.
            self._A_CHOP, self._A_REPAIR = 16, 17
            self._A_PILLAGE = 13 + len(ids) + 2
            self._A_SNIPE = self._A_PILLAGE + 1
            self._A_SPREAD = -1  # no names -> no spread columns
            self._A_FOUND = -1  # no names -> no FOUND column
            self._snipe_on = False
            self._A_IMP = [13 + i if i < 3 else 18 + i - 3 for i in range(len(ids))]
        self.FARM = ids.index("FARM") if "FARM" in ids else 0
        self.MINE = ids.index("MINE") if "MINE" in ids else -1        # -1 = not in scope
        self.QUARRY = ids.index("QUARRY") if "QUARRY" in ids else -1  # appeal -1
        self.OIL_WELL = ids.index("OIL_WELL") if "OIL_WELL" in ids else -1
        self.LUMBER = ids.index("LUMBER_MILL") if "LUMBER_MILL" in ids else -1
        self.SEASIDE = ids.index("SEASIDE_RESORT") if "SEASIDE_RESORT" in ids else -1
        self.FORT = ids.index("FORT") if "FORT" in ids else -1
        # Food improvements heal their pillager (cpu/core/combat.ts
        # PILLAGE_HEAL_IMPROVEMENTS); indexed by improvement code.
        heal_names = ("FARM", "PASTURE", "CAMP", "PLANTATION", "FISHING_BOATS")
        self._imp_heals = torch.tensor(
            [n in heal_names for n in ids] or [False], dtype=torch.bool, device=device
        )
        self._farm_food = float(imp.get("farmFood", 1))
        self._farm_housing = float(imp.get("farmHousing", 0.5))
        self._mine_prod = float(imp.get("mineProd", 1))       # base MINE production
        self._lumber_prod = float(imp.get("lumberProd", 1))   # LUMBER_MILL production (no tech boost)
        self._builder_idx = int(imp.get("builderIdx", -1))
        # The Military Engineer roster index + its live flag.
        self._eng_idx = int(imp.get("engineerIdx", -1))
        self._seat_eng_live = bool(imp.get("engineerLive", False))
        self._hillfarms_civic = int(imp.get("hillFarmsCivic", -1))
        self._farmadj_civic = int(imp.get("farmAdjCivic", -1))  # GS: Feudalism farm-adjacency +1 food
        self._farmadj_tech = int(imp.get("farmAdjTech", -1))    # GS: Replaceable Parts +1 more
        self._mine_unlock_tech = int(imp.get("mineUnlockTech", -1))       # MINING
        self._lumber_unlock_tech = int(imp.get("lumberUnlockTech", -1))   # CONSTRUCTION
        self._seaside_unlock_tech = int(imp.get("seasideUnlockTech", -1))  # RADIO
        self._seaside_min_appeal = int(imp.get("seasideMinAppeal", 4))     # BREATHTAKING
        # techs that permanently lift a MINE's yield (Apprenticeship, Industrialization → +1⚙ each)
        mbt = imp.get("mineBoostTechs", [])  # [[techIdx, prodAmount], ...]
        self._mine_boost_tech = torch.tensor([x[0] for x in mbt], dtype=torch.long, device=device)
        self._mine_boost_amt = torch.tensor([float(x[1]) for x in mbt], dtype=dtype, device=device)
        # The dense per-improvement catalog (base yields [nI, 6], housing [nI],
        # unlockImprovement tech idx [nI]; -1 = baseline FARM) and the per-tile
        # resource-improvement plane rq: a resource tile accepts exactly this
        # roster index (-1 no resource, -9 out of roster = FISHING_BOATS on sea
        # resources, unreachable in both engines).
        irows = imp.get("rows", [])
        nI = max(len(ids), 1)
        self._imp_yields = torch.zeros(nI, 6, dtype=dtype, device=device)
        self._imp_housing = torch.zeros(nI, dtype=dtype, device=device)
        self._imp_unlock = torch.full((nI,), -1, dtype=torch.long, device=device)
        for i, row in enumerate(irows):
            self._imp_yields[i] = torch.tensor(row["yields"], dtype=dtype)
            self._imp_housing[i] = float(row["housing"])
            self._imp_unlock[i] = int(row["unlock"])
        self.res_imp = torch.tensor(
            [[t.get("rq", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device
        )
        # Resource CATEGORY per tile (0 none / 1 bonus / 2 strategic /
        # 3 luxury). A tile's category never changes, so this is a constant
        # plane like res_imp, not _MUTABLE state.
        self.res_cat = torch.tensor([[t.get("res", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.farm_flat = torch.tensor([[t.get("fa_f", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.farm_hill = torch.tensor([[t.get("fa_h", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.mine_ok = torch.tensor([[t.get("mi", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.lumber_ok = torch.tensor([[t.get("lu", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self._fa_f_c = torch.tensor([[t.get("fa_f_c", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self._fa_h_c = torch.tensor([[t.get("fa_h_c", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self._mi_c = torch.tensor([[t.get("mi_c", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # The Seaside Resort's STATIC half (flat G/P/D beside COAST, unpaved)
        # and whether the tile carried NO feature at t0. The live feature test
        # is `sr_nf | feat_stripped` (a chop makes a tile eligible, exactly as
        # TS gates on the LIVE tile.feature === null); the appeal test is
        # dynamic and runs off _tile_appeal().
        self._sr_c = torch.tensor([[t.get("sr_c", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self._sr_nf = torch.tensor([[t.get("sr_nf", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.improvement = torch.full((B, T), -1, dtype=torch.long, device=device)  # -1 none, else improvement idx
        self.pillaged = torch.zeros(B, T, dtype=torch.bool, device=device)

        # --- districts ------------------------------------------------------------
        # The catalog plus a [B, T] district-type-index tensor (-1 = none).
        # Writers: the scripted scaffold, civ queues and the RL district head —
        # see _place_district.
        self.districts_cat = list(rules.districts or [])
        self.districts_on = bool(self.districts_cat)
        self.district = torch.full((B, T), -1, dtype=torch.long, device=device)  # -1 none, else PLACEABLE_DISTRICTS idx
        # A queued district is placed but NOT complete; paving, eligibility and
        # cap consumers deliberately stay placement-based (TS paves and caps on
        # tile.district regardless of completeness).
        self.district_complete = torch.zeros(B, T, dtype=torch.bool, device=device)
        # The ENCAMPMENT garrison pool, per TILE (the TS `Tile.encampHp` twin).
        # Mustered to ENCAMPMENT_HP when the district completes; while positive
        # the tile bars hostile entry and the district may strike; a melee
        # assault depletes it, and at 0 the tile opens and the strike goes
        # silent.
        self.encamp_hp = torch.zeros(B, T, dtype=torch.long, device=device)
        # The ROAD plane (the TS `Tile.road` twin). Laid by trade routes; a
        # road-to-road step ignores the terrain penalty, and once `road_bridged`
        # latches at the first era boundary, the river charge too.
        self.road = torch.tensor(
            [[bool(t.get("rd", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )
        self.road_bridged = False
        # A COMPLETE, non-CITY_CENTER district raided into darkness — its
        # adjacency/buildings/housing/amenities/GPP/CS-envoy channels stop until
        # a builder repairs it (static counts stay: still owned). A tile plane,
        # not slot-keyed, so snapshot/restore covers it and
        # _reclaim_cities/_reclaim_pool leave it intact.
        self.district_pillaged = torch.zeros(B, T, dtype=torch.bool, device=device)
        nD = len(self.districts_cat)
        self.d_static_adj = torch.tensor(
            [[t.get("dadj", [0.0] * nD) for t in f["tiles"]] for f in fixtures],
            dtype=dtype, device=device,
        )  # [B, T, nD] raw static-source adjacency; mutated when an in-game founding clears a center feature
        self.feat_yields = torch.tensor(
            [[t.get("fy", [0.0] * 6) for t in f["tiles"]] for f in fixtures],
            dtype=dtype, device=device,
        )  # [B, T, 6] the removable feature's own yields (stripped at founding)
        self.feat_stripped = torch.zeros(B, T, dtype=torch.bool, device=device)  # centers whose removable feature is gone (flips read them stripped)
        # A district pave removes a BONUS resource (both engines' queue paths
        # strip; canPlace refuses luxury/strategic). Readers: border-pick
        # resource priority + siteQuality's resource column.
        self.res_stripped = torch.zeros(B, T, dtype=torch.bool, device=device)
        self.tile_river = torch.tensor([[bool(t.get("riv", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)  # Water Mill at city centers
        self.tile_wh = torch.tensor([[float(t.get("wh", 2)) for t in f["tiles"]] for f in fixtures], dtype=torch.float64, device=device)  # water housing at a hypothetical center
        # Chop planes: grant key (0 none/1 food/2 prod) + removal-unlock tech
        self.tile_ftr = torch.tensor([[int(t.get("ftr", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.tile_ftu = torch.tensor([[int(t.get("ftu", -1)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self._feat_adj = torch.tensor(
            [[t.get("fadj", [0.0] * nD) for t in f["tiles"]] for f in fixtures],
            dtype=dtype, device=device,
        )  # [B, T, nD] adjacency a tile's removable feature lends to neighbours (dropped on founding here)
        self._nfeat_adj = torch.tensor(
            [[t.get("nfadj", [0.0] * nD) for t in f["tiles"]] for f in fixtures],
            dtype=dtype, device=device,
        )  # [B, T, nD] the NON-removable feature's lent adjacency (GS REEF -> Campus): queueDistrict paves null ANY feature, foundCity only removable
        sc = rules.district_scaffold or {}
        self.CAMPUS = int(sc.get("campusIdx", 0))
        self.campus_unlock_tech = int(sc.get("campusUnlockTech", -1))  # WRITING
        self._scaffold = [(int(p["idx"]), int(p["unlockTech"]), int(p.get("unlockCivic", -1)), int(p.get("placement", 0))) for p in sc.get("place", [])]  # (district idx, unlock tech idx, unlock CIVIC idx — at most one of the two >= 0, placement: 0 land / 1 aqueduct / 2 coastal / 3 encampment)
        self.dscaffold_placed = torch.zeros(B, max(len(self._scaffold), 1), dtype=torch.bool, device=device)  # per-scaffold-district placed flag
        # VETERANCY's encampmentProdMult needs the ENCAMPMENT district idx and
        # its scaffold slot (the queue head codes for the district and its
        # buildings — cpu/core/game.ts isEncampmentItem).
        self._encamp_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "ENCAMPMENT"), -1)
        # Districts that LOWER neighbouring appeal (cpu/core/appeal.ts), and the
        # NEIGHBORHOOD column whose housing reads the appeal tier.
        self._appeal_bad_dist = [
            i for i, d in enumerate(self.districts_cat)
            if d.get("id") in ("INDUSTRIAL_ZONE", "ENCAMPMENT")
        ]
        self._nbhd_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "NEIGHBORHOOD"), -1)
        # appealTier thresholds -> Neighborhood housing: >=4 Breathtaking 6,
        # 2..3 Charming 5, -1..1 Average 4, -3..-2 Uninviting 3, <=-4
        # Disgusting 2.
        self._appeal_cuts = [(4, 6), (2, 5), (-1, 4), (-3, 3)]
        self._appeal_floor = 2
        self._encamp_si = next((si for si, (di, _ut, _uc, _plc) in enumerate(self._scaffold) if di == self._encamp_didx), -1)
        self._campus_active = bool(sc.get("active", 0))  # scaffold master on/off (mirrors exporter SCRIPTED_CAMPUS)
        self._rl_district_active = True  # the RL production head may place districts — mask columns NB+2+NU+si
        self._rl_any_city = True  # True lets non-capital cities place districts too
        # Gold purchases (buy a building / settler / unit outright at
        # gold_purchase_mult× production cost, mirroring purchaseBuilding /
        # purchaseSettler / purchaseUnit). While True the production mask
        # carries NB+1+NU extra purchase columns, so a checkpoint trained
        # against the narrower head does not match.
        self._rl_purchase_active = True
        # The seat-0 diplomacy head (declareWar / sueForPeace on a civ). While
        # False, war_mask() is all-False and step(war=…) is ignored, so nothing
        # samples or applies it; scripted/parity paths never pass war=.
        self._rl_war_active = True
        # Combat log hooks (inert unless rollout --log sets the batch)
        self._log_combat_b: int | None = None
        self._combat_events: list[str] = []
        # (the CS-quest "askable" list is no longer consumed: the asked
        # district is always the CS type's own, _citystate_didx)
        self.d_usable = torch.tensor(
            [[t.get("du", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )  # [B, T] district-placeable land — static part of canPlaceDistrict
        self.aqsrc = torch.tensor(
            [[t.get("aqsrc", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )  # [B, T] Aqueduct water source (river / adjacent lake·oasis·mountain), static
        self.coastal_water = torch.tensor(
            [[t.get("cw", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )  # [B, T] Harbor surface: coastal/lake water adjacent to land, static
        # Per-district DYNAMIC adjacency source amounts, every one read from the
        # catalog (a district with no such row scores 0, which is not the same
        # as a hardwired default). The static sources live in d_static_adj.
        def _src_amt(d, src):
            return float(next((a["amount"] for a in d.get("adjacency", []) if int(a["src"]) == src), 0.0))
        self._dyn_district = torch.tensor([_src_amt(d, 7) for d in self.districts_cat], dtype=dtype, device=device)  # [nD] +per adjacent completed district (src 7)
        self._dyn_bwonder = torch.tensor([_src_amt(d, 5) for d in self.districts_cat], dtype=dtype, device=device)  # [nD] +per adjacent COMPLETED world wonder (matchesAdjacency BUILT_WONDER)
        self._dyn_center = torch.tensor([_src_amt(d, 8) for d in self.districts_cat], dtype=dtype, device=device)  # [nD] +per adjacent center
        self._dyn_harbor = torch.tensor([_src_amt(d, 9) for d in self.districts_cat], dtype=dtype, device=device)  # [nD] +per adjacent Harbor
        self._dyn_searesource = torch.tensor([_src_amt(d, 10) for d in self.districts_cat], dtype=dtype, device=device)  # [nD] +per adjacent live SEA resource (withdrawn on strip)
        # Dynamic MINE (src 11), QUARRY (src 12) and AQUEDUCT (src 13) sources.
        # Only the Industrial Zone carries them in the catalog.
        self._dyn_mine = torch.tensor([_src_amt(d, 11) for d in self.districts_cat], dtype=dtype, device=device)  # [nD]
        self._dyn_quarry = torch.tensor([_src_amt(d, 12) for d in self.districts_cat], dtype=dtype, device=device)  # [nD]
        self._dyn_aqueduct = torch.tensor([_src_amt(d, 13) for d in self.districts_cat], dtype=dtype, device=device)  # [nD]
        self._mine_iidx = 1   # IMPROVEMENT_IDS: FARM=0, MINE=1, LUMBER_MILL=2, QUARRY=3, ...
        self._quarry_iidx = 3
        # Government + policy modifier tables. Per seat, per turn the engine
        # adopts the newest unlocked government (highest tier, ties to table
        # order) and greedily fills its BASE slots in policy-table order among
        # unlocked cards of matching kind — the computeAdoption twin. See
        # _gov_policy_mods for how the channels below are applied.
        _govs = rules.governments or []
        _pols = rules.policies or []
        self._ngov = len(_govs)
        self._npol = len(_pols)
        if self._ngov:
            self._gov_tier = torch.tensor([int(g["tier"]) for g in _govs], dtype=torch.long, device=device)
            self._gov_unlock_civic = torch.tensor([int(g["unlockCivic"]) for g in _govs], dtype=torch.long, device=device)
            self._gov_slots = torch.tensor([[int(x) for x in g["slots"]] for g in _govs], dtype=torch.long, device=device)  # [nGov,4] m/e/d/w
            self._gov_city_y = torch.tensor([[float(x) for x in g["cityYields"]] for g in _govs], dtype=dtype, device=device)  # [nGov,6]
            self._gov_cap_y = torch.tensor([[float(x) for x in g["capitalYields"]] for g in _govs], dtype=dtype, device=device)  # [nGov,6]
            # housingAll: +housing to every city of the adopting seat.
            self._gov_housing = torch.tensor([float(g.get("housingAll", 0)) for g in _govs], dtype=dtype, device=device)  # [nGov]
            # yieldMult: tier-2/3 governments multiply one yield
            # (MERCHANT_REPUBLIC gold, THEOCRACY faith, DEMOCRACY culture,
            # COMMUNISM production).
            self._gov_ymult = torch.tensor([[float(x) for x in g.get("yieldMult", [1] * 6)] for g in _govs], dtype=dtype, device=device)  # [nGov,6]
            self._gov_encamp = torch.tensor([float(g.get("encampmentProdMult", 1)) for g in _govs], dtype=dtype, device=device)  # [nGov] channel-complete; no government carries it
            self._gov_tpmult = torch.tensor([float(g.get("tilePurchaseMult", 1)) for g in _govs], dtype=dtype, device=device)  # [nGov]
            # The amenity + district-conditional channels, applied for EVERY
            # seat (computeHousing / computeCityStats). newDeal carries housing
            # AND amenities on one
            # specialty threshold; housingIfDistricts counts ALL completed
            # districts.
            self._gov_amen = torch.tensor([float(g.get("amenitiesAll", 0)) for g in _govs], dtype=dtype, device=device)
            _ghid = [g.get("housingIfDistricts", [-1, 0]) for g in _govs]
            self._gov_hid_min = torch.tensor([int(x[0]) for x in _ghid], dtype=torch.long, device=device)
            self._gov_hid_house = torch.tensor([float(x[1]) for x in _ghid], dtype=dtype, device=device)
            _gnd = [g.get("newDeal", [-1, 0, 0]) for g in _govs]
            self._gov_nd_min = torch.tensor([int(x[0]) for x in _gnd], dtype=torch.long, device=device)
            self._gov_nd_house = torch.tensor([float(x[1]) for x in _gnd], dtype=dtype, device=device)
            self._gov_nd_amen = torch.tensor([float(x[2]) for x in _gnd], dtype=dtype, device=device)
            self._gov_arange = torch.arange(self._ngov, dtype=torch.long, device=device)
        if self._npol:
            self._pol_kind = torch.tensor([int(p["kind"]) for p in _pols], dtype=torch.long, device=device)  # [nPol]
            self._pol_unlock_civic = torch.tensor([int(p["unlockCivic"]) for p in _pols], dtype=torch.long, device=device)
            self._pol_city_y = torch.tensor([[float(x) for x in p["cityYields"]] for p in _pols], dtype=dtype, device=device)  # [nPol,6]
            self._pol_cap_y = torch.tensor([[float(x) for x in p["capitalYields"]] for p in _pols], dtype=dtype, device=device)
            self._pol_housing = torch.tensor([float(p.get("housingAll", 0)) for p in _pols], dtype=dtype, device=device)  # [nPol]
            # housingIfDistricts (INSULAE {min 2, +1}): +housing to a city with
            # >= min completed districts.
            _hid = [p.get("housingIfDistricts", [-1, 0]) for p in _pols]
            self._pol_hid_min = torch.tensor([int(x[0]) for x in _hid], dtype=torch.long, device=device)  # [nPol] (-1 = none)
            self._pol_hid_house = torch.tensor([float(x[1]) for x in _hid], dtype=dtype, device=device)  # [nPol]
            # VETERANCY: a production multiplier toward the Encampment district
            # and its buildings (cpu/core/game.ts isEncampmentItem).
            self._pol_encamp = torch.tensor([float(p.get("encampmentProdMult", 1)) for p in _pols], dtype=dtype, device=device)  # [nPol]
            self._pol_tpmult = torch.tensor([float(p.get("tilePurchaseMult", 1)) for p in _pols], dtype=dtype, device=device)  # [nPol] (LAND_SURVEYORS = 0.8)
            self._pol_amen = torch.tensor([float(p.get("amenitiesAll", 0)) for p in _pols], dtype=dtype, device=device)
            _pnd = [p.get("newDeal", [-1, 0, 0]) for p in _pols]
            self._pol_nd_min = torch.tensor([int(x[0]) for x in _pnd], dtype=torch.long, device=device)
            self._pol_nd_house = torch.tensor([float(x[1]) for x in _pnd], dtype=dtype, device=device)
            self._pol_nd_amen = torch.tensor([float(x[2]) for x in _pnd], dtype=dtype, device=device)
        # Master switch (rules.governmentsLive), mirroring the TS
        # GOVERNMENTS_ADOPTION_LIVE. Gates every gov/policy application and the
        # influence-tier addition, so the two engines flip in lockstep; when
        # False the tables load but change nothing.
        self._gov_live = bool(getattr(rules, "governments_live", False))
        self._gov_has_effects = self._gov_live and bool(
            (self._ngov and float(self._gov_city_y.abs().sum() + self._gov_cap_y.abs().sum() + self._gov_housing.abs().sum() + (self._gov_ymult - 1).abs().sum() + (self._gov_encamp - 1).abs().sum() + (self._gov_tpmult - 1).abs().sum()) > 0)
            or (self._npol and float(self._pol_city_y.abs().sum() + self._pol_cap_y.abs().sum() + self._pol_housing.abs().sum() + self._pol_hid_house.abs().sum() + (self._pol_encamp - 1).abs().sum() + (self._pol_tpmult - 1).abs().sum()) > 0)
        )
        self._harbor_idx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "HARBOR"), -1)
        self._hs_idx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "HOLY_SITE"), -1)  # Work Ethic
        self._shipyard_bidx = int(rules.shipyard_bidx)
        self._walls_bidx = int(rules.ancient_walls_bidx)
        # Trade anchors: id-anchored capacity sources + route constants (the
        # tradeCapacity / routeYields mirror).
        _tr = rules.trade or {}
        self._trade_mkt = int(_tr.get("marketBidx", -1))
        self._trade_lgh = int(_tr.get("lighthouseBidx", -1))
        self._trade_ftc = int(_tr.get("foreignTradeCidx", -3))
        self._trade_wonders = [int(x) for x in _tr.get("capWonderWidx", [])]
        self._trade_range = int(_tr.get("range", 15))
        self._trade_intl_gold = int(_tr.get("intlGold", 3))  # international base gold
        self._trade_duration = int(_tr.get("duration", 20))  # route lifetime
        self._walls_hp = int(rules.combat.get("wallsHp", 100))
        # The ENCAMPMENT garrison pool cap (TS ENCAMPMENT_HP).
        self._encamp_hp_max = int(rules.combat.get("encampHp", 100))
        # Which district types count toward the specialty cap (Aqueduct/Neighborhood
        # do NOT). Aqueduct also carries housing, not an adjacency yield.
        self._is_specialty = torch.tensor([bool(d.get("countsTowardLimit", True)) for d in self.districts_cat], dtype=torch.bool, device=device)  # [nD]
        self._aqueduct_idx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "AQUEDUCT"), -1)
        # Per-type unlock indices (-1 = no unlockDistrict effect in the compact
        # tree — NOT unlocked, mirroring computeUnlocks).
        self._d_unlock_t = torch.tensor([int(d.get("unlockTech", -1)) for d in self.districts_cat], dtype=torch.long, device=device)
        self._d_unlock_c = torch.tensor([int(d.get("unlockCivic", -1)) for d in self.districts_cat], dtype=torch.long, device=device)
        self._d_maint = torch.tensor([float(d.get("maintenance", 1)) for d in self.districts_cat], dtype=dtype, device=device)  # [nD] gold upkeep per district type
        self._h_fresh = float(rules.housing_fresh)
        self._aq_fresh_bonus = float(rules.housing_aq_fresh_bonus)
        self._aq_no_fresh_total = float(rules.housing_aq_no_fresh)

        # The _MUTABLE shape/dtype baseline, captured lazily on the first check
        # so every plane exists by then. (_aliases is initialised earlier — the
        # merged unit pool is the first thing to register into it.)
        self._mut_sig: dict = {}

        self._eff_version = 0
        # Two extra invalidation counters the _eff_version epoch misses.
        #  _bel_version     — bumped at the belief-claim sites (+restore/reset);
        #                     civ_only_pantheon/civ_only_follower/civ_only_founder change there only,
        #                     with no eff bump, yet the same-turn trace re-reads
        #                     that seat.
        #  _rp_kill_version — bumped at the economy-loop strike-kill, the only
        #                     unit-death site inside the loop; it flips
        #                     barb_unit_alive/major_unit_alive (the route raided-mask) with no
        #                     eff bump.
        self._bel_version = 0
        self._rp_kill_version = 0
        # Bumped when a border-growth claim lands INSIDE a later same-civ city's
        # worked-tile window (civ_at is the valid-mask input the eff epoch
        # misses); claims elsewhere leave the yields cache intact.
        self._claim_version = 0
        # The Great General/Admiral aura plane cache is keyed on general
        # POSITIONS, which move mid-turn and change on spawn/kill/capture —
        # none of which bump _eff_version. This counter bumps at every such site
        # (+restore), so the (turn, _gen_ver) keyed cache stays exact within and
        # across turns.
        self._gen_ver = 0
        self._gen_aura_cache = None  # ((turn,_gen_ver), (land [B,O,T], sea [B,O,T]) | None)
        self._eff_cache: tuple[int, torch.Tensor] | None = None
        self._food_cache: tuple[int, torch.Tensor] | None = None
        self._nprod_cache: tuple[int, torch.Tensor] | None = None
        # Civ-phase caches, same single-slot-by-key shape as _rcy_globals.
        self._seat_route_cache = None   # ((turn,r,_eff_version,_rp_kill_version), [B,RC]|None)
        self._belief_feat_cache = None   # ((r,_eff_version,_bel_version), [B,T,6])
        self._bel_add_memo = None        # (_bel_version, {(fn,key,r): tensor})
        self._gov_pol_cache = None       # (_eff_version, {seat_tag: 5-tuple})
        self._rcy_all_cache = None       # ((turn,r,eff,bel,kill,claim), 6-tuple [B,RC])
        self._dadj_cache = None          # (_eff_version, {di: floored [B,T] adjacency})
        # Static candidate lists for _pick_static: the k-th candidate in
        # tile order, so a pick is one gather instead of a [B, T] cumsum.
        def cand_list(cand: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
            n = cand.sum(dim=1)
            width = max(int(n.max()), 1)
            idx = torch.argsort((~cand).to(torch.int8), dim=1, stable=True)[:, :width]
            return idx, n
        self._flood_list = cand_list(self.floodplain)
        self._droughtc_list = cand_list(self.drought_cand)
        self._land_list = cand_list(~self.water)
        # Yields sum the picked tiles sequentially to mirror the TS reduce. When
        # every value is a dyadic rational (integers and halves — true for all
        # shipped rules), every partial sum is exact in f64, so ANY summation
        # order gives identical bits and one .sum() replaces the per-tile add
        # loop. The guard covers all six yield columns (tileScore).
        fp2 = self.tile_yields.double() * 2
        self._dyadic_fp = bool((fp2 == fp2.round()).all())

        # The Palace follows the capital IDENTITY (is_cap), not column 0 — a
        # refound capital gains it, a hole-reused column 0 does not.
        self._palace_y = rules.palace_yields.to(device=device, dtype=dtype)  # [6]
        self._palace_housing = float(rules.palace_housing)
        self._palace_amenities = float(rules.palace_amenities)

        NB, NT, NC = len(rules.b_cost), len(rules.t_cost), len(rules.c_cost)
        self.NB = NB
        self.SETTLER = NB  # production action: one past the building table
        self.IDLE = NB + 1  # production action: queue nothing this turn
        self.rules_dev = Rules(
            **{
                k: (v.to(device=device, dtype=dtype) if isinstance(v, torch.Tensor) and v.is_floating_point() else v.to(device) if isinstance(v, torch.Tensor) else v)
                for k, v in vars(rules).items()
            }
        )

        # --- dynamic state ------------------------------------------------------
        self.turn = 1
        # Settler starts: NO pre-founded city for any seat — every city arrives
        # through a FOUND verb, allocating its persistent id (nextCityId++).
        # ownerInit ships TS City.ids per tile (all -1 in a t0 world); it seeds
        # `tile_city`, and `tile_seat` gets 0 wherever it is set.
        self.tile_city = torch.tensor([f["ownerInit"] for f in fixtures], dtype=torch.long, device=device)  # [B, T]
        # Bumped by EVERY write to owner / civ_at; keys the derived views below.
        # Not a tensor — python state, so it is not in _MUTABLE.
        self._tile_owner_ver = 0
        self._citystate_at_ver = -1
        self._citystate_at_cache: torch.Tensor | None = None
        self._civ_at_ver = -1
        self._civ_at_cache: torch.Tensor | None = None
        self._center_at_ver = -1
        self._center_at_cache: torch.Tensor | None = None
        self._civ_city_at_ver = -1
        self._civ_city_at_cache: torch.Tensor | None = None
        self._owner_ver = -1
        self._owner_cache: torch.Tensor | None = None
        # `tile_seat` is STATE, not a cache. The seat-0 and civ parts mirror
        # `owner` / `civ_at` (checked every step), but the CITY-STATE part is
        # stored ONLY here — `citystate_at` is a view of it. No civ tile exists at t0,
        # so only the city-state and seat-0 arms are seeded.
        self.tile_seat = torch.where(
            self._citystate_at_init >= 0, self._citystate_at_init + 100,
            torch.where(
                self.tile_city >= 0, torch.zeros_like(self.tile_city),
                torch.full_like(self.tile_city, NO_SEAT),
            ),
        )
        del self._citystate_at_init
        self._b_req_district = rules.b_req_district.to(device)  # [NB] required district idx (-1 none)
        self._b_req_buildings = rules.b_req_buildings  # list of prereq-building-index lists
        self._b_excl_buildings = rules.b_excl_buildings  # exclusive-sibling index lists
        self._b_has_reqs = bool((self._b_req_district >= 0).any()) or any(len(r) > 0 for r in self._b_req_buildings) or any(len(r) > 0 for r in self._b_excl_buildings)
        # Regional buildings (Factory/Power Plant/Zoo/Stadium) leave every LOCAL
        # yield/amenity sum; the regional channel delivers them to all same-seat
        # city centers within regional_range of the source district.
        self._b_regional = rules.b_regional.to(device)  # [NB] bool
        self._reg_bidx = [i for i in range(NB) if bool(self._b_regional[i])]
        self._regional_range = int(rules.regional_range)
        # Worship buildings are faith-purchase-only — every production/gold
        # picker masks them; only the worship faith-buy sets their civ_city_bldg bits.
        self._b_worship = rules.b_worship.to(device)  # [NB] bool
        self._b_train_xp = rules.b_train_xp.to(device)  # [NB] long — per-building training XP (best tier over present buildings)
        self._worship_bidx = [int(x) for x in rules.worship_bidx]
        self._temple_bidx = int(rules.temple_bidx)
        self._worship_cost = float(rules.worship_faith_cost)
        self._shrine_bidx = int(rules.shrine_bidx)  # missionary buy gate
        # The completion-overflow / chop bank on the city-block seat axis
        # (row 0 = seat 0, rows 1.. = the civ seats, then the city-state rows
        # for family-shape consistency; every city starts with an empty bank,
        # so unlike the fixture-loaded city_* table it allocates plain).
        self.city_prod_bank = torch.zeros(B, 1 + max(self.R, 1) + max(self.S, 1), self.RC, dtype=dtype, device=device)
        self.prod_bank = self.city_prod_bank[:, 0]
        self.civ_city_prod_bank = self.city_prod_bank[:, 1:1 + max(self.R, 1)]
        self.register_alias("prod_bank", lambda sim: sim.city_prod_bank[:, 0])
        self.register_alias("civ_city_prod_bank", lambda sim: sim.city_prod_bank[:, 1:1 + max(sim.R, 1)])
        # LIFETIME science — Seat.scienceTotal on the seat axis (row 0 =
        # seat 0, rows 1..R the civ seats), accrued beside each row's
        # techProgress stream add in the seatPhase loop.
        self.seat_science_total = torch.zeros(B, 1 + max(self.R, 1), dtype=dtype, device=device)
        self.science_total = self.seat_science_total[:, 0]
        self.civ_only_science_total = self.seat_science_total[:, 1:1 + max(self.R, 1)]
        self.register_alias("science_total", lambda sim: sim.seat_science_total[:, 0])
        self.register_alias("civ_only_science_total", lambda sim: sim.seat_science_total[:, 1:1 + max(sim.R, 1)])

        # --- the hostile world: barbarians ----------------------------------------
        self.units_mode = bool(f0.get("unitsMode", 0))
        assert all(bool(f.get("unitsMode", 0)) == self.units_mode for f in fixtures)
        cb = rules.combat
        self.max_camps = torch.tensor([f.get("maxCamps", 0) for f in fixtures], dtype=torch.long, device=device)
        self.K = int(self.max_camps.max().item()) if self.units_mode else 0
        # The in-state mulberry32, one u32 per game, mirrored draw for draw.
        self.rng_state = torch.tensor([f.get("rngInit", 0) for f in fixtures], dtype=torch.int64, device=device)
        # Tile -> unit-slot occupancy stacking mirrors tileFreeForUnit: a
        # foreign unit blocks a tile entirely; among one seat's own units, one
        # military + one civilian may share.
        self.next_slot = torch.zeros(B, dtype=torch.long, device=device)  # append-only: keeps unit order
        self.game_over = torch.zeros(B, dtype=torch.bool, device=device)
        self.victory_type = torch.zeros(B, dtype=torch.long, device=device)
        self.winner = torch.full((B,), -1, dtype=torch.long, device=device)
        # Per-seat space-race chain progress in the unified civ space (index
        # 0 = seat 0, 1..R = civ i). Bool [B, 1+R, n_space]. Bookkeeping only —
        # the science victory fires on the victory STEP directly — and
        # _MUTABLE-registered for snapshot/restore. Keyed per seat, not per city
        # slot, so _reclaim_cities leaves it intact and it needs no kill hygiene.
        self.space_done = torch.zeros(B, 1 + self.R, max(self._n_space, 1), dtype=torch.bool, device=device)
        self.camp_tile = torch.full((B, max(self.K, 1)), -1, dtype=torch.long, device=device)
        self.n_camps = torch.zeros(B, dtype=torch.long, device=device)
        # Seat 0's units: trained via the production head, ordered like
        # state.units (append-only slots preserve spawn order).
        self.unit_next = torch.zeros(B, dtype=torch.long, device=device)
        self.tdef = torch.tensor([[t.get("tdef", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # tdef holds the DEFENDER bonus (terrainDefense: hills/woods/rainforest
        # +3, marsh/floodplains −2), read at the def_cs sites. tmove holds the
        # movement-slow encoding (hills, woods, rainforest and marsh +3;
        # floodplains flat) — enter cost is 1 + tmove//3, so marsh stays SLOW
        # while its defense is negative.
        self.tmove = torch.tensor([[t.get("tmove", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # Damage table stays float64 regardless of sim dtype: the RNG factor
        # is float64 and damage rounds to integers the TS engine must match.
        self._dmg_base = torch.tensor(cb.get("dmgBase", [30.0] * 4001), dtype=torch.float64, device=device)  # 0.1-granular exp table over ±200
        # The BARBARIAN ladder maps a ladder POSITION (0..3 melee, 4/5 ranged,
        # 6 scout, 7/8 naval) to a ROSTER index. barb_unit_type holds that roster index,
        # exactly like major_unit_type and major_unit_type, so combat / moves / ranged strength /
        # ranged range / naval all come from the one roster table. The exporter
        # is the source of truth for the ladder's contents.
        _bl = list(cb.get("barbLadder") or [])
        if not _bl:
            # A rules.json without barbLadder is a STALE EXPORT; falling back to
            # a one-entry ladder would only move the failure somewhere confusing
            # ("index 4 out of bounds" deep inside _spawn_barb).
            raise ValueError(
                "rules.json has no combat.barbLadder — this is a pre-#51/S3.2 export. "
                "Re-run the exporter for this fixture set (`npm run seed && npm run export`)."
            )
        self._barb_ladder = torch.tensor(_bl, dtype=torch.long, device=device)
        _bn = rules.combat.get("barbNavalTypes", []) or []
        self._barb_galley_idx = int(_bn[0]) if len(_bn) > 0 else -1
        self._barb_quad_idx = int(_bn[1]) if len(_bn) > 1 else -1
        # EMBARK: flat embarked MP, the water-step master switch
        # (`embarkState.live` on the TS side) and the embark/ocean tech gate
        # indices (military embarks on SHIPBUILDING, civilians on SAILING,
        # OCEAN needs CARTOGRAPHY).
        self._embark_moves = int(cb.get("embarkMoves", 2))
        self._embarked_defense_cs = float(cb.get("embarkedDefenseCs", 10))
        self._embark_live = bool(cb.get("embarkLive", 0))
        self._sailing_tech = int(cb.get("sailingTech", -1))
        self._shipbuilding_tech = int(cb.get("shipbuildingTech", -1))
        self._cartography_tech = int(cb.get("cartographyTech", -1))
        # Trainable roster tables (index = position in rules.units).
        ru = rules.units or [{"id": "WARRIOR", "cost": 40, "combat": 20, "maintenance": 0, "civilian": 0, "requiresTech": -1}]
        self.NU = len(ru)
        # THE PRODUCTION LAYOUT (cpu/core/prodLayout.ts), named once. It is the
        # space the wire's action codes ride in, the space `city_current`
        # stores its queue head in for EVERY seat row, and the space the state
        # compare's queueColumn twin decodes — one layout, so a code cannot
        # mean one thing on row 0 and another on a civ row.
        self.UNIT_BASE = NB + 2  # production action codes NB+2 … NB+1+NU train units
        self.DISTRICT_BASE = NB + 2 + self.NU
        self.PURCHASE_BASE = self.DISTRICT_BASE + len(self._scaffold)
        self.WONDER_BASE = self.PURCHASE_BASE + NB + 1 + self.NU
        self.PROJECT_BASE = self.WONDER_BASE + self._wond_n
        self._type_cost = torch.tensor([u["cost"] for u in ru], dtype=dtype, device=device)
        self._type_combat = torch.tensor([u["combat"] for u in ru], dtype=torch.long, device=device)
        self._type_maintenance = torch.tensor([u["maintenance"] for u in ru], dtype=dtype, device=device)
        self._type_civilian = torch.tensor([bool(u["civilian"]) for u in ru], dtype=torch.bool, device=device)
        self._type_ranged_strength = torch.tensor([u.get("rangedStrength", 0) for u in ru], dtype=torch.long, device=device)  # 0 = melee-only
        self._type_ranged_range = torch.tensor([u.get("rangedRange", 0) for u in ru], dtype=torch.long, device=device)  # strike range
        self._type_moves = torch.tensor([u.get("moves", 2) for u in ru], dtype=torch.long, device=device)  # full MP per turn
        # NAVAL unit flag per roster index. A naval mover stands on water
        # natively; an embarked LAND mover stands on water via the embark gate.
        # Read at the war-march passability composition.
        self.unit_naval = torch.tensor([bool(u.get("naval", 0)) for u in ru], dtype=torch.bool, device=device)
        self._type_tech = torch.tensor([u["requiresTech"] for u in ru], dtype=torch.long, device=device)
        # The Archaeologist's CIVIC gate + its ARTIFACT-slot rule.
        self._type_civic = torch.tensor([u.get("requiresCivic", -1) for u in ru], dtype=torch.long, device=device)
        self._type_needs_slot = torch.tensor([bool(u.get("needsArtifactSlot", 0)) for u in ru], dtype=torch.bool, device=device)
        # Per-roster strategic-resource requirement (index into the resource
        # list the tile res_id plane uses; -1 = ungated). _res_unit_pairs caches
        # (unit_idx, res_idx) for the access scan — empty when the roster
        # requires nothing, so _res_avail_mask short-circuits to all-True.
        self._type_resource = torch.tensor([int(u.get("requiresResource", -1)) for u in ru], dtype=torch.long, device=device)
        self._res_unit_pairs = [(i, int(u.get("requiresResource", -1))) for i, u in enumerate(ru) if int(u.get("requiresResource", -1)) >= 0]
        self._type_charges = torch.tensor([u.get("charges", 0) for u in ru], dtype=torch.long, device=device)
        # Faith-purchase-only roster flag (MISSIONARY) — the trainableUnits
        # filter's mirror; masks the type out of the gold purchase path.
        self._type_faith_only = torch.tensor([bool(u.get("fo", 0)) for u in ru], dtype=torch.bool, device=device)
        # Spawn-only roster flag (GENERAL/ADMIRAL) — the trainableUnits filter's
        # mirror; masks the type out of production_mask AND the purchase path.
        # Birthed only by the Great-Person claim.
        self._type_spawn_only = torch.tensor([bool(u.get("so", 0)) for u in ru], dtype=torch.bool, device=device)
        self._warrior_idx = next((i for i, u in enumerate(ru) if u["id"] == "WARRIOR"), 0)
        # The SETTLER chassis is a real roster unit. `settler: 1` masks it out
        # of the generic unit columns; training goes through the dedicated
        # escalating settler column, founding through FOUND_CITY.
        self._settler_idx = next((i for i, u in enumerate(ru) if bool(u.get("settler", 0))), -1)
        self._type_settler = torch.tensor([bool(u.get("settler", 0)) for u in ru], dtype=torch.bool, device=device)
        # SCOUT is a military explorer (combat 10) but never in the civ roster
        # (BUY_UNITS and the ladder exclude it). The production ladder
        # prefers WARRIOR anyway, but the gold buy's affordability gate can
        # leave SCOUT the only affordable candidate, so it is masked out of the
        # buy set to mirror TS.
        self._scout_idx = next((i for i, u in enumerate(ru) if u["id"] == "SCOUT"), -1)
        # The scripted galley-policy build target (the naval MELEE unit,
        # requiresTech SAILING). -1 if the roster has no galley.
        self._galley_idx = next((i for i, u in enumerate(ru) if u["id"] == "GALLEY"), -1)
        # The Great General / Great Admiral chassis. unit_idx = the roster index
        # of the spawned combat-0 civilian; cls = the GP class index whose claim
        # spawns it (-1 = absent). The aura amount and range come from the
        # exporter.
        self._general_unit_idx = int(rr.get("generalUnitIdx", -1))
        self._admiral_unit_idx = int(rr.get("admiralUnitIdx", -1))
        self._admiral_march_live = bool(rr.get("admiralMarchLive", False))  # gates the admiral march
        self._general_cls = int(rr.get("generalClassIdx", -1))
        self._admiral_cls = int(rr.get("admiralClassIdx", -1))
        self._gen_aura_cs_val = float(rr.get("generalAuraCs", 5))
        self._gen_aura_range = int(rr.get("generalAuraRange", 2))
        self._gen_aura_mp = int(rr.get("generalAuraMp", 1))  # the aura's movement half
        self._gen_off = tiles_within_offsets(self._gen_aura_range).to(device)  # aura disk (hexDistance ≤ range)

        # Precomputed static prereq masks would race with completion inside a
        # turn; availability is recomputed per loop (cheap: NT ≤ 32).
        self._prereq_t = self._prereq_matrix(rules.t_prereqs, NT).to(device)
        self._prereq_c = self._prereq_matrix(rules.c_prereqs, NC).to(device)
        self._arangeT = torch.arange(T, device=device)
        # Hoisted per-call allocations (index buffers + scalar consts)
        self._arangeT_f = self._arangeT.to(dtype)
        self._bidx = torch.arange(B, device=device)
        self._inf_f = torch.tensor(float("inf"), dtype=dtype, device=device)
        self._neg_f = torch.tensor(-1e18, dtype=dtype, device=device)
        # Derived caches, all keyed on _eff_version like _eff_cache — every
        # dependency's mutation site bumps it.
        self._adjd_cache = None
        self._adjc_cache = None
        self._adjh_cache = None
        self._fadjq_cache = None
        self._appeal_cache = None  # _tile_appeal, _eff_version-keyed
        self._fadjf_cache = None
        self._rcy_cache = None
        self._bld_cache = None
        self._arangeNB = torch.arange(NB, device=device)

        # Seat 0's t0 units seed the pool HERE — after the roster tables and
        # the pool planes exist. They append through the SAME cursor the civ
        # loop above used, which is why they land after the civs' units rather
        # than at slot 0: the per-seat unit ORDER is the wire contract, and a
        # shared pool preserves each seat's own order however the seats
        # interleave. charges/MP mirror _spawn_unit's writes, minus the spot
        # search (the file tile is the tile).
        for b, f in enumerate(fixtures):
            for cv in f["civs"]:
                if int(cv["seat"]) != 0:
                    continue
                for u_ in cv["units"]:
                    i = int(self.unit_next[b])
                    ti = int(u_["type"])
                    self.major_unit_alive[b, i] = True
                    self.major_unit_seat[b, i] = 0
                    self.major_unit_type[b, i] = ti
                    self.major_unit_tile[b, i] = int(u_["tile"])
                    self.major_unit_hp[b, i] = rules.combat.get("unitHp", 100)
                    self.major_unit_charges[b, i] = int(self._type_charges[ti])
                    _m0u = int(self._type_moves[ti])
                    self.major_unit_mp[b, i] = _m0u
                    self.major_unit_mp_full[b, i] = _m0u
                    if bool(self._type_civilian[ti]):
                        self.civilian_at[(b, int(u_["tile"]))] = i
                    else:
                        self.military_at[(b, int(u_["tile"]))] = i
                    # the seeder's spawn reveal — see the civ loop's twin above.
                    if self.fog_of_war:
                        self.seat_explored[b, 0] |= self.pair_dist[int(u_["tile"])] <= 2
                    self.unit_next[b] += 1

        # The FIXTURE-LOADED starting units must seed the best-melee trackers:
        # TS counts them through spawnUnit at placeSeats, so a seat starting
        # with a WARRIOR has city defense 20, not the floor. ONE scan over the
        # merged pool, one row per seat.
        _ut0 = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        _melee0 = self.major_unit_alive & (self._type_ranged_strength[_ut0] == 0)
        _mcs0 = torch.where(_melee0, self._type_combat[_ut0], torch.zeros_like(self.major_unit_type))
        for _row0 in range(1 + r_pad):
            self.civ_best_melee[:, _row0] = torch.where(
                self.major_unit_seat == _row0, _mcs0, torch.zeros_like(_mcs0)
            ).max(dim=1).values

        # Pristine copy of the mutable state, for reset().
        self._pristine = {k: getattr(self, k).clone() for k in _MUTABLE}

    def reset(self) -> None:
        """Restore the initial state (all games, lockstep)."""
        for k, v in self._pristine.items():
            getattr(self, k).copy_(v)
        self.turn = 1
        self._eff_version += 1  # fertility/drought just changed under the cache
        self._eff_cache = None
        self._food_cache = None
        self._nprod_cache = None
        self._adjd_cache = self._adjc_cache = self._adjh_cache = None
        self._dadj_cache = None
        self._fadjq_cache = self._fadjf_cache = self._rcy_cache = self._bld_cache = None
        # Beliefs/units are back to pristine — bump the counters and drop the
        # civ-phase caches (the bel_add memo is keyed on _bel_version alone).
        self._bel_version += 1
        self._rp_kill_version += 1
        self._claim_version += 1
        self._seat_route_cache = self._belief_feat_cache = None
        self._bel_add_memo = self._gov_pol_cache = None
        self._rcy_all_cache = None

    # ---- state discipline: the aliasing safety net ---------------------------
    #
    # The per-seat names (`p_*`, `v_*`, `civ_only_*`, `citystate_*`, ...) are VIEWS of one
    # merged tensor. A view survives `x[...] = v` and `x.copy_(v)` but is
    # silently destroyed by `self.x = torch.where(...)`, which REBINDS the name
    # to a fresh dense tensor; writes through it then never reach the base, with
    # no exception until some downstream sum disagrees many turns later.
    #
    # So: any name registered as an alias must keep its storage across a step.
    # Plenty of `_MUTABLE` tensors are legitimately rebound every step, so a
    # blanket "no _MUTABLE data_ptr may change" rule would fail on turn 1; what
    # is pinned for them is shape and dtype.
    def register_alias(self, name: str, recompute) -> None:
        """Declare `self.<name>` to be a VIEW of `recompute(self)`, forever."""
        self._aliases[name] = recompute

    def _check_seat_invariant(self) -> None:
        """unit_seat must agree with the slot range it sits in.

        It is written at every spawn, capture and fixture load, so it can drift
        the moment a new spawn path appears. Checked on EVERY slot, alive or
        not: both ranges are seeded to a real seat and a dead slot is reused by
        the next spawn, so a bogus seat sitting there is a wrong owner waiting
        to happen — and a stale 0 in the major range would silently enlist the
        slot for seat 0.
        """
        al = self.unit_alive
        seat = self.unit_seat
        v, u = self.POOL_LO["major"], self.POOL_LO["barb"]
        ve, ue = self.POOL_HI["major"], self.POOL_HI["barb"]
        if not bool(((seat[:, v:ve] >= 0) & (seat[:, v:ve] <= max(self.R, 1))).all()):
            raise AssertionError("SEAT DRIFT: a MAJOR slot's seat is not a major seat")
        if not bool(((seat[:, u:ue] == BARB_SEAT) | ~al[:, u:ue]).all()):
            raise AssertionError(f"SEAT DRIFT: a living BARB slot does not carry seat {BARB_SEAT}")
        # `caps.xp` is FALSE for the hostile class, and the TS twin enforces it
        # by never giving a barbarian unit an `xp` field at all
        # (cpu/core/units.ts spawnUnit). A dense plane cannot leave a field out,
        # so the same fact is an invariant: a barb slot's xp stays 0. Whole
        # pool, dead slots included — a dead slot is reused by the next spawn,
        # so a stale non-zero xp there is a veteran waiting to happen.
        if not SEAT_CAPS[POOL_CLASS["barb"]]["xp"] and not bool((self.unit_xp[:, u:ue] == 0).all()):
            raise AssertionError("CAP VIOLATION: a BARB slot carries xp, but caps.xp is False for the hostile class")

    #: (name, dtype, fill) for every relation a SEAT holds with a CITY-STATE.
    #: Each is one `seat_citystate_<name> [B, 1+R, S]` plane; `citystate_<name>` is row 0 and
    #: `civ_only_citystate_<name>` is rows 1.., both views.
    _CS_PAIR_FIELDS = (
        ("met", torch.bool, False),
        ("envoys", torch.long, 0),
        ("quest", torch.long, 0),        # 0 none / 1 clearCamp / 2 trade / 3 district
        ("quest_camp", torch.long, -1),
        ("quest_issued", torch.long, 0),
    )

    #: (key, seat-0 name, civ name, dtype, trailing dim) for the per-seat
    #: scalars whose two views carry different NAMES. `dtype=None` takes the
    #: engine's dtype.
    _CIV_PAIR_FIELDS = (
        ("culture", "culture_total", "civ_only_culture", None, None),
        ("faith", "faith", "civ_only_faith", None, None),
        ("tourism", "tourism_total", "civ_only_tourism", torch.long, None),
        ("warmonger", "warmonger", "civ_only_warmonger", torch.long, None),
        ("gpp", "gp_points", "civ_only_gpp", None, "_gp_nc"),
    )

    def _alloc_civ_pairs(self, B: int, r_pad: int, dtype, device) -> None:
        """Allocate one plane per fact, seat 0 at row 0 and the civ seats after.

        `dtype=None` means the merged plane takes the engine's dtype."""
        for _k, _pa, _ra, _dt, _ex in self._CIV_PAIR_FIELDS:
            _w = getattr(self, _ex) if _ex else None
            _shape = (B, 1 + r_pad) + ((_w,) if _w else ())
            _base = torch.zeros(_shape, dtype=_dt or dtype, device=device)
            setattr(self, f"civ_{_k}", _base)
            setattr(self, _pa, _base[:, 0])
            setattr(self, _ra, _base[:, 1:])
            self.register_alias(_pa, lambda sim, k=_k: getattr(sim, f"civ_{k}")[:, 0])
            self.register_alias(_ra, lambda sim, k=_k: getattr(sim, f"civ_{k}")[:, 1:])

    def _alloc_cs_pairs(self, B: int, r_pad: int, s_pad: int, device) -> None:
        """Allocate one plane per (seat, city-state) relation.

        `citystate_<name>` is the row-0 view and `civ_only_citystate_<name>` the rows-1.. view."""
        for _nm, _dt, _fill in self._CS_PAIR_FIELDS:
            _base = torch.full((B, 1 + r_pad, s_pad), _fill, dtype=_dt, device=device)
            setattr(self, f"seat_citystate_{_nm}", _base)
            setattr(self, f"citystate_{_nm}", _base[:, 0])
            setattr(self, f"civ_only_citystate_{_nm}", _base[:, 1:])
            self.register_alias(f"citystate_{_nm}", lambda sim, k=_nm: getattr(sim, f"seat_citystate_{k}")[:, 0])
            self.register_alias(f"civ_only_citystate_{_nm}", lambda sim, k=_nm: getattr(sim, f"seat_citystate_{k}")[:, 1:])

    def _alloc_war(self, B: int, r_pad: int, s_pad: int, device) -> None:
        """ONE war relation: `war[b, i, j]`, symmetric, covering every pair.

        Rows are a COMPACT seat index:
          0            seat 0
          1 .. R       civ seats       (absolute seat r+1)
          1+R .. +S    city-states     (absolute seat 100+s)
          1+R+S        barbarians      (absolute seat 200)
        The absolute space is sparse — a dense 201x201 per game would be 40KB —
        so `_seat_row` maps absolute seat -> row in one gather.

        Allocated BEFORE `civ_only_atwar` / `civ_pair_war` / `citystate_atwar`, which are slices of
        it rather than tensors beside it."""
        self.NS = 1 + r_pad + s_pad + 1
        self.BARB_ROW = 1 + r_pad + s_pad
        _row = torch.zeros(BARB_SEAT + 1, dtype=torch.long, device=device)
        for _r in range(r_pad):
            _row[_r + 1] = 1 + _r
        for _c in range(s_pad):
            _row[100 + _c] = 1 + r_pad + _c
        _row[BARB_SEAT] = self.BARB_ROW
        self._seat_row = _row
        # The INVERSE. `_seat_row` answers "which row is this seat"; the
        # weariness rules ask the other way round ("is the tile owned by the
        # seat sitting in this row"), and a row-indexed lookup keeps that a
        # gather rather than a Python branch per seat class.
        _rs = torch.full((self.NS,), NO_SEAT, dtype=torch.long, device=device)
        _rs[0] = 0
        for _r in range(r_pad):
            _rs[1 + _r] = _r + 1
        for _c in range(s_pad):
            _rs[1 + r_pad + _c] = 100 + _c
        _rs[self.BARB_ROW] = BARB_SEAT
        self._ROW_SEAT = _rs
        self.war = torch.zeros(B, self.NS, self.NS, dtype=torch.bool, device=device)
        # WAR WEARINESS is keyed exactly like WAR, because every rule that
        # touches it is per-war — a battle scores against one enemy, the decay
        # applies to a war nobody fought, and a treaty settles ONE war.
        # `ww[b, i, j]` is row i's points from its war with row j (NOT
        # symmetric: each side accrues its own). `ww_turn` stamps the last turn
        # a battle was fought there, which tells a war being fought from a
        # phoney one. The barbarian row exists and is never written.
        self.ww = torch.zeros(B, self.NS, self.NS, dtype=torch.long, device=device)
        # The per-step battle-site audit. Not game state — a tripwire, reset
        # every step, asserted at the turn boundary.
        self._ww_opened = torch.zeros(B, dtype=torch.long, device=device)
        self._ww_hooked = torch.zeros(B, dtype=torch.long, device=device)
        self.ww_turn = torch.full((B, self.NS, self.NS), -1, dtype=torch.long, device=device)

    def sync_war(self) -> None:
        """Close the war matrix under TRANSPOSE.

        A write through `civ_only_atwar` / `civ_pair_war` / `citystate_atwar` lands in one cell of
        the matrix; the mirror cell of the pair still has to be written.

        The UPPER triangle is authoritative and is mirrored down. Deliberately
        NOT an OR: a write that makes PEACE clears one cell, and ORing the
        transpose back in would hand the war straight over again. All three
        names live in the upper triangle — row 0 for civ_only_atwar/citystate_atwar, the a<b
        half for civ_pair_war. Idempotent; call it as often as you like."""
        w = self.war
        keep = torch.triu(
            torch.ones(self.NS, self.NS, dtype=torch.bool, device=w.device), diagonal=1
        )
        w.copy_(torch.where(keep, w, w.transpose(1, 2).clone()))

    def _check_war_invariant(self) -> None:
        """The war matrix must be symmetric, with no seat at war with itself.

        Checked every step under CIV6_ALIAS_CHECK=1."""
        w = self.war
        # civ_only_atwar / civ_pair_war / citystate_atwar ARE the matrix, so there is no separate
        # store to cross-check against. SYMMETRY is the property code can
        # break: every write through one of those names touches one cell of a
        # pair, and the mirror has to be written too.
        if not bool((w == w.transpose(1, 2)).all()):
            bad = (w != w.transpose(1, 2)).nonzero()[0].tolist()
            raise AssertionError(
                f"WAR DRIFT: the matrix is not symmetric at (game {bad[0]}, rows "
                f"{bad[1]}/{bad[2]}) — a declaration wrote one side of the pair"
            )
        if not bool((torch.diagonal(w, dim1=1, dim2=2) == False).all()):  # noqa: E712
            raise AssertionError("WAR DRIFT: a seat is at war with itself")

    def _check_state_discipline(self) -> None:
        self._check_seat_invariant()
        self._check_war_invariant()
        self._check_tile_owner_invariant()
        for name, fn in self._aliases.items():
            cur = getattr(self, name)
            want = fn(self)
            if cur.data_ptr() != want.data_ptr():
                raise AssertionError(
                    f"ALIAS BROKEN: self.{name} no longer shares storage with its base — "
                    f"something rebound it (`self.{name} = ...`) instead of writing in place "
                    f"(`self.{name}[...] = ...` / `.copy_()`). Writes to it are now invisible to the base."
                )
            if cur.shape != want.shape or cur.dtype != want.dtype:
                raise AssertionError(
                    f"ALIAS SHAPE/DTYPE DRIFT: self.{name} is {tuple(cur.shape)}/{cur.dtype}, "
                    f"base slice is {tuple(want.shape)}/{want.dtype}"
                )
        if not self._mut_sig:
            self._mut_sig = {
                k: (tuple(getattr(self, k).shape), getattr(self, k).dtype) for k in _MUTABLE if hasattr(self, k)
            }
        for name, (shape, dtype) in self._mut_sig.items():
            t = getattr(self, name)
            if tuple(t.shape) != shape or t.dtype != dtype:
                raise AssertionError(
                    f"_MUTABLE DRIFT: {name} is {tuple(t.shape)}/{t.dtype}, was {shape}/{dtype} at construction. "
                    "snapshot()/restore() copy by name and would silently mis-shape."
                )

    def snapshot(self) -> dict:
        """Clone the full mutable state (every _MUTABLE tensor + the turn counter)
        for cheap save/restore during search (MCTS). Eval-only — never touched by
        the parity gates. The derived caches are keyed by _eff_version, which
        restore() bumps, so they need not be captured."""
        return {
            "mut": {k: getattr(self, k).clone() for k in _MUTABLE},
            "turn": self.turn,
            "road_bridged": self.road_bridged,  # a scalar latch, not a plane
        }

    def restore(self, snap: dict) -> None:
        """Restore a snapshot() in place. Bumps _eff_version + clears the derived
        caches so a later compute recomputes against the restored state."""
        for k, v in snap["mut"].items():
            getattr(self, k).copy_(v)
        # restore rewrites owner / civ_at / citystate_at in place, which is a
        # tile-ownership write like any other, so `_tile_owner_ver` has to be
        # bumped here: an in-place write through a generic loop is invisible to
        # a scan for `self.owner[...] =`.
        self._tile_owner_ver += 1
        self.turn = snap["turn"]
        self.road_bridged = snap.get("road_bridged", False)
        self._eff_version += 1
        self._eff_cache = None
        self._food_cache = None
        self._nprod_cache = None
        self._adjd_cache = self._adjc_cache = self._adjh_cache = None
        self._dadj_cache = None
        self._fadjq_cache = self._fadjf_cache = self._rcy_cache = self._bld_cache = None
        # The restored snapshot may carry different beliefs/units — bump the
        # counters and drop the civ-phase caches.
        self._bel_version += 1
        self._gen_ver += 1  # restored unit pools may hold different generals
        self._rp_kill_version += 1
        self._claim_version += 1
        self._seat_route_cache = self._belief_feat_cache = None
        self._bel_add_memo = self._gov_pol_cache = None
        self._rcy_all_cache = None

    @staticmethod
    def _prereq_matrix(prereqs: list, n: int) -> torch.Tensor:
        m = torch.zeros(n, n, dtype=torch.bool)
        for i, ps in enumerate(prereqs):
            for p in ps:
                m[i, p] = True
        return m

    # --- helpers ---------------------------------------------------------------
