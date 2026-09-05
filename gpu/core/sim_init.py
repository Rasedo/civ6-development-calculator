from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .simbase import _MUTABLE  # noqa: F401 — private names do not ride a star import
from . import simbase  # the PATCHABLE globals (the pool caps/_ALIAS_CHECK) must be read live


class SimInit:

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
        # THE CITY BLOCK. Twenty city facts, one `city_x [B, n_majors+S, RC]` plane
        # each. There are NO family views: every reader indexes the base by
        # ROW, because a second name for a row is a second way to write a
        # body that only serves one seat.
        #     seat 0:      city_x[:, 0]
        #     civ seats:   city_x[:, 1:n_majors]
        #     city-states: city_x[:, n_majors:, 0]   (carved out further below)
        # ONE COLUMN WIDTH for every seat row: the block is RC wide on every
        # row, so no body carries a `cols = ... if row == 0` and row 0 can
        # receive the uncapped loyalty flip its own rules allow.
        # Float planes take `dtype`, so this arithmetic is f32 in the f32 lanes.
        # Two facts open ROW 0 differently — hp starts at cityMaxHp where the
        # other rows start at 0, and `center` starts at -1 where they start at
        # 0 — which is a FILL, not a fork: every reader is the same expression.
        # ------------------------------------------------------------------
        # THE MAJOR ROSTER WIDTH, read off THE ROSTER: `civs[]` is seat-keyed
        # and holds one entry per major, seat 0 among them. A separate scalar
        # wire key for the width would be a second source of truth that could
        # disagree with the array right beside it. An opponent count, where
        # one is genuinely meant (the war head's columns, the observation's
        # per-opponent block), is `n_majors - 1` written at the site that
        self.n_majors = len(f0["civs"])
        # City COLUMNS per seat row — ONE width, exported by the TS engine as
        # rules.seats.citySlots (CITY_SLOTS_PER_SEAT) so the observation head
        # and this storage cannot drift. Settling caps at maxCities; loyalty
        # flips exceed it. Empty slots are city_alive=False.
        self.RC = int(rules.seats.get("citySlots", 24))
        # A city's production QUEUE is a tensor dimension: `city_current`,
        # `city_progress`, `city_cost` and `city_qtile` are dense over it, slot
        # 0 the head, -1 an empty slot. `_q_*` is the only way in or out.
        self.QD = max(int(rules.seats.get("productionQueueMax", 1)), 1)
        self.S = int(f0.get("cityStateMax", 0))
        # FOG IS LIVE in units mode (fogOfWar rides the fixture; older
        # fixtures predate the key and fall back to unitsMode — the creation
        # rule). Reveals gate on this exactly as TS's revealAround gates on
        # state.fogOfWar, so a fog-off world accrues NO explored state.
        self.fog_of_war = bool(f0.get("fogOfWar", f0.get("unitsMode", 0)))
        _rcp, _sp = self.RC, max(self.S, 1)
        self._CITY_MINOR0 = self.n_majors
        self._aliases: dict = {}
        for _k, _dt, _rf, _pf, _ex in (
            ("alive", torch.bool, False, None, None),
            ("center", torch.long, 0, -1, None),
            ("pop", torch.long, 0, None, None),
            ("hp", torch.long, 0, int((rules.combat or {}).get("cityMaxHp", 200)), None),
            ("outer_hp", torch.long, 0, None, None),
            ("last_hit", torch.long, 0, None, None),
            ("boost_turn", torch.long, 0, None, None),
            ("is_cap", torch.bool, False, None, None),
            ("orig_cap", torch.long, -1, None, None),
            ("founder", torch.long, -1, None, None),
            ("loyalty", dtype, 100.0, None, None),
            ("acquired", torch.long, 0, None, None),
            ("growth", dtype, 0, None, None),
            ("cbox", dtype, 0, None, None),
            ("current", torch.long, -1, None, self.QD),
            ("progress", dtype, 0, None, self.QD),
            ("cost", dtype, 0, None, self.QD),
            ("qtile", torch.long, -1, None, self.QD),
            ("gw_writing", torch.long, 0, None, None),
            ("gw_art", torch.long, 0, None, None),
            ("gw_music", torch.long, 0, None, None),
            ("relics", torch.long, 0, None, None),
            ("artifacts", torch.long, 0, None, None),
            ("artifact_era", torch.long, -1, None, max(int((rules.seats or {}).get("artifactProvW", 3)), 1)),
            ("artifact_seat", torch.long, -1, None, max(int((rules.seats or {}).get("artifactProvW", 3)), 1)),
            ("gwart_type", torch.long, -1, None, max(int((rules.seats or {}).get("gwSlotsByKind", [2, 3, 1])[1]), 1)),
            ("gwart_artist", torch.long, -1, None, max(int((rules.seats or {}).get("gwSlotsByKind", [2, 3, 1])[1]), 1)),
            ("bldg", torch.bool, False, None, max(len(rules.b_cost), 1)),
            ("gp_perm", dtype, 0, None, max(len((rules.seats or {}).get("gpCityPermKeys", [])), 1)),
        ):
            _shape = (B, self.n_majors + _sp, _rcp) + ((_ex,) if _ex else ())
            _base = torch.full(_shape, _rf, dtype=_dt, device=device)
            setattr(self, f"city_{_k}", _base)
            if _pf is not None:
                _base[:, 0].fill_(_pf)

        def ften(getter, shape_tail=()):
            return torch.tensor([getter(f) for f in fixtures], dtype=dtype, device=device).reshape(B, *shape_tail)

        self.tile_yields = ften(lambda f: [t["y"] for t in f["tiles"]], (T, 6))
        self.res_priority = torch.tensor([[t["res"] for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # what a Great Person's per-adjacent clause counts. Both are static;
        # RAINFOREST reads the LIVE pair (`feat_id`/`feat_stripped`), so a
        # chop leaves it and `_add_feature` joins it, exactly as TS reads
        # `tile.feature` live.
        self.tile_mountain = torch.tensor([[t.get("mtn", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.coastal_land = torch.tensor([[t.get("cl", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.passable = torch.tensor([[t["pass"] for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.wpass = torch.tensor([[t.get("wpass", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # OCEAN tiles need CARTOGRAPHY to enter (COAST/LAKE do not); the gate is
        # applied per-mover.
        self.ocean_tile = torch.tensor([[t.get("ocean", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)

        self.work_ok = torch.tensor([[t.get("work", t["pass"]) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # Luxury amenity source (mirrors luxuryAmenities): per tile, the
        # luxury's catalog index (-1 none) and the improvement index that
        # activates it (-9 = outside the GPU roster, never matches).
        self.lux_id = torch.tensor([[t.get("lux", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.lux_req = torch.tensor([[t.get("luxreq", -9) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # the CATALOG width, not the fixtures' max index — the Congress
        # target space must agree with `LUXURY_IDS.length` even when the last
        # luxury never spawned on any map in the batch.
        self._n_lux = int(rules.improvements["nLuxuries"])
        self._lux_k = int((rules.improvements or {}).get("luxAmenityCities", 4))
        self.camp_ok = torch.tensor([[t["camp"] for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # TRIBAL VILLAGES (C-47) — MUTABLE: a village is claimed and gone, and
        # `camp_ok` deliberately does NOT bake it, so every camp-placement read
        # ANDs the two live (the baked-derivation trap C-52 exists for).
        self.tile_goody = torch.tensor([[t.get("goody", 0) for t in f["tiles"]] for f in fixtures],
                                       dtype=torch.bool, device=device)
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
        for t in range(self.T):
            d1 = set(int(x) for x in _n1[t].tolist() if int(x) >= 0)
            cand = sorted(set(int(x) for x in _n2[t].tolist() if int(x) >= 0) - d1 - {t})
            for k, x in enumerate(cand[:12]):
                _ring[t, k] = x
        self.ring2 = _ring  # [T, 12]
        self.pair_dist = pair_distances(self.W, self.H).to(device)  # [T, T] int16
        # The distance-3 ring, [T, 18], sorted ascending and padded -1 at map
        # edges — the SNIPE ring's contract one hex out, so SNIPE3 columns
        # scan ring tiles in tile-index order like SNIPE columns do.
        _pd3 = (self.pair_dist == 3).cpu()
        _r3 = torch.full((self.T, 18), -1, dtype=torch.long)
        for t in range(self.T):
            cand = _pd3[t].nonzero(as_tuple=True)[0]
            _r3[t, :min(cand.numel(), 18)] = cand[:18]
        self.ring3 = _r3.to(device)  # [T, 18]

        # --- per-slot city data (dynamic: a slot binds to a tile when a SETTLER
        # founds there; nothing is pre-founded, and every center stat below is
        # derived from the tile planes at founding) --------------------------
        # SLOT ORDER IS TS ARRAY ORDER for every seat row: cities
        # append at last-alive+1 (the push mirror) and the step-end reclaim
        # compacts stably (the splice mirror), so every order-coupled mirror
        # of the TS city loop walks columns living-first, in column order.
        # The capital is an IDENTITY (is_cap plus civ_cap_tile), not column 0:
        # a captured capital's hole-reused column must not pin loyalty, carry
        # the Palace or anchor domination, and _reclaim_cities compaction permutes
        # slots underneath. civ_cap_tile is allocated with the civ block below.
        import os as _os
        self._reclaim_headroom = int(_os.environ.get("CIV6_RECLAIM_HEADROOM", 24))
        self._reclaim_force_at = (int(_os.environ["CIV6_RECLAIM_AT"])
                                  if "CIV6_RECLAIM_AT" in _os.environ else None)

        # --- city-states: static, placed at game creation ----------------------
        # THE ONE SURVIVING PAD, and it is not the major axis's: seat 0 always
        # exists, so the major width needs no floor and can never come out zero. `S == 0` genuinely means NO
        # city-state rows, so dropping THIS one would: `seat_citystate_*`
        # becomes `[B, n_majors, 0]`, and a reduction over an empty dim raises
        # where a reduction over a dead row returns the identity. The guards
        # are all `if self.S > 0`, so the pad is never read — it is one column
        # of storage buying an invariant, not a seat.
        s_pad = max(self.S, 1)  # self.S is set with the city block
        # A city-state's city IS a city — these are views into the minor section
        # of the city block, row n_majors+s, slot 0.
        _m0 = self._CITY_MINOR0
        self.citystate_alive = self.city_alive[:, _m0:_m0 + s_pad, 0]
        self.register_alias("citystate_alive", lambda sim: sim.city_alive[:, sim._CITY_MINOR0:sim._CITY_MINOR0 + max(sim.S, 1), 0])
        self.citystate_type = torch.zeros(B, s_pad, dtype=torch.long, device=device)
        self.citystate_center = self.city_center[:, _m0:_m0 + s_pad, 0]
        self.register_alias("citystate_center", lambda sim: sim.city_center[:, sim._CITY_MINOR0:sim._CITY_MINOR0 + max(sim.S, 1), 0])
        self.citystate_pop = self.city_pop[:, _m0:_m0 + s_pad, 0]
        self.register_alias("citystate_pop", lambda sim: sim.city_pop[:, sim._CITY_MINOR0:sim._CITY_MINOR0 + max(sim.S, 1), 0])
        self.citystate_suz_key = torch.full((B, s_pad), -1, dtype=torch.long, device=device)
        self.citystate_suz_peace = torch.zeros(B, s_pad, dtype=torch.bool, device=device)
        # tourism SENT per (from, to) major pair — real Civ 6 accrues toward
        # each foreign civ separately, through its own summed modifier
        self.civ_rock_bands = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        self.civ_naturalists = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        self.civ_tourism_to = torch.zeros(B, self.n_majors, self.n_majors, dtype=torch.long, device=device)
        self.civ_tourism_rel_to = torch.zeros(B, self.n_majors, self.n_majors, dtype=torch.long, device=device)
        # the RESOLVED suzerain contest (-1 none) and the minor's own research
        # record — `resolveSuzerain` / `minorResearch` storage
        self.citystate_suzerain = torch.full((B, s_pad), -1, dtype=torch.long, device=device)
        self.citystate_techs = torch.zeros(B, s_pad, len(rules.t_cost), dtype=torch.bool, device=device)
        self.citystate_civics = torch.zeros(B, s_pad, len(rules.c_cost), dtype=torch.bool, device=device)
        self.citystate_tech_prog = torch.zeros(B, s_pad, dtype=torch.float64, device=device)
        self.citystate_civic_prog = torch.zeros(B, s_pad, dtype=torch.float64, device=device)
        # the minor's PRODUCTION pot (`minorBuild`): population points a turn,
        # spent down the fixed build ladder — walls, the type's district, the
        # coastal Harbor. The built results live on the shared city planes
        # (`city_bldg`, `city_dist_tile`, `city_outer_hp`) at the minor's row.
        self.citystate_prod = torch.zeros(B, s_pad, dtype=torch.float64, device=device)
        self.citystate_suz_code = torch.full((B, s_pad), -1, dtype=torch.long, device=device)
        # the IMPROVEMENT this minor's suzerain may build, by roster index
        self.citystate_suz_imp = torch.full((B, s_pad), -1, dtype=torch.long, device=device)
        for b, f in enumerate(fixtures):
            for s, cs in enumerate(f.get("cityStates", [])):
                self.citystate_alive[b, s] = True
                self.citystate_type[b, s] = cs["type"]
                self.citystate_center[b, s] = cs["center"]
                self.citystate_pop[b, s] = cs["pop"]
                self.citystate_suz_key[b, s] = cs.get("suzKey", -1)
                self.citystate_suz_peace[b, s] = bool(cs.get("suzPeace", 0))
                self.citystate_suz_code[b, s] = cs.get("suzCode", -1)
                self.citystate_suz_imp[b, s] = cs.get("suzImp", -1)
        # A city-state's tile ownership lives in `tile_seat` (seeded below off
        # the wire's `ownerSeatInit` plane); `citystate_at` is a derived view.
        # The (seat, city-state) relations live on `seat_citystate_*`
        # [B, n_majors, S] planes allocated below, once self.n_majors is known;
        # every reader addresses one by row, `seat_citystate_met[:, row, s]`.
        # (the asked-for district is never stored: it is always the CS type's
        # own — _citystate_didx — so quest resolve/digest both re-derive it)
        # LEVY cooldown — per CS, SHARED across seats (the TS cs.lastLevyTurn
        # twin). Init to -levyCooldown so a never-levied CS reads cooldown-ready
        # (turn - (-cd) >= cd for turn >= 0).
        self._levy_cooldown = int(rules.citystate.get("levyCooldown", 20))
        self.citystate_last_levy = torch.full((B, s_pad), -self._levy_cooldown, dtype=torch.long, device=device)
        self._alloc_war(B, self.n_majors, s_pad, device)
        # Siege hit points (attackCityState) — the TS `cs.hp` twin.
        self.citystate_hp = self.city_hp[:, _m0:_m0 + s_pad, 0]
        self.citystate_hp.fill_(int(rules.citystate.get("maxHp", 150)))
        self.register_alias("citystate_hp", lambda sim: sim.city_hp[:, sim._CITY_MINOR0:sim._CITY_MINOR0 + max(sim.S, 1), 0])
        # `war_turns[b, i, j]` is how long i and j have been at war — one cell
        # per WAR, symmetric like the matrix it counts, because that is what
        # the rule it gates is: peace cannot be offered until warMinTurns of
        # THAT war have passed, and its price is that war's own length.
        #
        # `peace_turns[b, row]` is per SEAT and stays that way: it counts turns
        # at war with NOBODY, which is the driver's peacefulness heuristic
        # rather than a Civ 6 rule.
        #
        # `treaty_turns[b, i, j]` is the PEACE TREATY the pair signed, counting
        # down: while it is above zero neither side may declare on the other.
        # `civ_grievance[b, i, j]` is what i holds against j — ANTISYMMETRIC, so
        # the pair carries ONE signed balance, the coordinate system the
        # Grievances page describes. Majors only.
        self.civ_grievance = torch.zeros(B, self.NS, self.NS, dtype=torch.long, device=device)
        self.war_turns = torch.zeros(B, self.NS, self.NS, dtype=torch.long, device=device)
        self.treaty_turns = torch.zeros(B, self.NS, self.NS, dtype=torch.long, device=device)
        self.peace_turns = torch.zeros(B, self.NS, dtype=torch.long, device=device)
        # `conquest_turns[b, row]` is the WARLORD'S THRONE window: turns of
        # empire-wide bonus production still to run after a capture.
        self.conquest_turns = torch.zeros(B, self.NS, dtype=torch.long, device=device)
        citystate_yidx = rules.citystate.get("typeYieldIdx", [3, 4, 2, 1, 1, 5])
        self._cs_type_n = len(citystate_yidx)  # CITY_STATE_TYPES' width
        self._citystate_yidx = torch.tensor(citystate_yidx, dtype=torch.long, device=device)[self.citystate_type.clamp(min=0)]  # [B, S]
        citystate_didx = rules.citystate.get("typeDistrictIdx", [0, 2, 3, 5, 6, 1])  # CS type -> district idx (Campus/Theater/CommHub/IZ/Encampment/HolySite)
        self._citystate_didx = torch.tensor(citystate_didx, dtype=torch.long, device=device)[self.citystate_type.clamp(min=0)]  # [B, S] district each CS boosts at 3/6 envoys
        self._citystate_district_bonus = float(rules.citystate.get("districtBonus", 2))  # per-district amount at each of the 3-/6-envoy thresholds
        # CIV6 (Rise and Fall): the 3-/6-envoy bonus lands on the type's
        # TIER-1 / TIER-2 building rows — either member of an exclusive pair
        # (a city holds at most one); -1 pads the narrower types. Constant,
        # derived from citystate_type.
        _t1 = rules.citystate["typeT1Idx"]
        _t2 = rules.citystate["typeT2Idx"]
        _w1 = max(max((len(x) for x in _t1), default=1), 1)
        _w2 = max(max((len(x) for x in _t2), default=1), 1)
        _t1p = torch.tensor([list(x) + [-1] * (_w1 - len(x)) for x in _t1], dtype=torch.long, device=device)
        _t2p = torch.tensor([list(x) + [-1] * (_w2 - len(x)) for x in _t2], dtype=torch.long, device=device)
        self._citystate_t1idx = _t1p[self.citystate_type.clamp(min=0)]  # [B, S, w1]
        self._citystate_t2idx = _t2p[self.citystate_type.clamp(min=0)]  # [B, S, w2]
        # the minor's own build ladder raises the FIRST tier-1 member
        self._citystate_t1b = self._citystate_t1idx[:, :, 0]  # [B, S]
        self._citystate_suz_amt = float(rules.citystate.get("suzerainYield", 3))  # flat suzerain capital-yield amount
        # Suzerain perks modeled as RULES — `effects` is the code order the
        # per-CS `suzCode` plane indexes; -1 = the perk is not in this build.
        _suz = rules.citystate["suz"]
        _sfx = list(_suz["effects"])
        self._suz_c_xp = _sfx.index("xpDouble") if "xpDouble" in _sfx else -1
        self._suz_c_hill = _sfx.index("cavalryHills") if "cavalryHills" in _sfx else -1
        self._suz_c_reach = _sfx.index("regionalReach") if "regionalReach" in _sfx else -1
        self._suz_c_works = _sfx.index("worksScience") if "worksScience" in _sfx else -1
        self._suz_c_route = _sfx.index("csRouteYields") if "csRouteYields" in _sfx else -1
        self._suz_c_holy = _sfx.index("holySitePressure") if "holySitePressure" in _sfx else -1
        self._suz_c_apostle = _sfx.index("apostlePromoChoice") if "apostlePromoChoice" in _sfx else -1
        self._suz_c_era = _sfx.index("eraInspiration") if "eraInspiration" in _sfx else -1
        self._suz_c_harbor_pow = _sfx.index("harborPower") if "harborPower" in _sfx else -1
        self._suz_c_walls_full = _sfx.index("wallsFullDamage") if "wallsFullDamage" in _sfx else -1
        self._suz_c_faith_bldg = _sfx.index("faithBuildings") if "faithBuildings" in _sfx else -1
        self._suz_c_route_post = _sfx.index("routePostGold") if "routePostGold" in _sfx else -1
        self._suz_xp_mult_k = int(_suz["xpMult"])
        self._suz_hill_cs = int(_suz["hillCs"])
        self._suz_reach_bonus = int(_suz["reachBonus"])
        self._suz_writing_sci = float(_suz["writingScience"])
        self._suz_relic_sci = float(_suz["relicScience"])
        self._suz_route_cul = float(_suz["routeCulture"])
        self._suz_route_gold = float(_suz["routeGold"])

        rr = rules.seats
        n_gp = len(rr.get("gpClassDistrict", [])) or 5

        # City slots append at last-alive+1 (order-preserving) and compact at
        # the step end whenever any major row holds a hole, so the layout is
        # always the dense array TS splices.
        # Env-gated machine-checked registry invariant, via
        # CIV6_RC_REGISTRY_CHECK. No hot-path cost otherwise.
        self._civ_city_reg_check = bool(_os.environ.get("CIV6_RC_REGISTRY_CHECK"))
        civ_city_pad = self.RC
        self.water = torch.tensor([[t.get("wt", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.settle_ok = torch.tensor([[t.get("st", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.site_q3 = torch.tensor(
            [[t.get("sq", [0.0, 0.0, 0.0]) for t in f["tiles"]] for f in fixtures], dtype=torch.float64, device=device
        )
        self.hills = torch.tensor([[t.get("hl", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.river_mask = torch.tensor([[int(t.get("rm", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # CIV6 (Flood): "flooding all Floodplains tiles found along the River".
        # Which river a tile is on, -1 for none — `riverReach`'s twin. Two
        # tiles share a river when a river EDGE separates them; a river's edges
        # are a vertex-connected chain and any two edges meeting at a vertex
        # are consecutive edges of one common tile, so this walk covers exactly
        # one river. Static: rivers never move.
        _rm = self.river_mask.tolist()
        _nb = self.neigh.tolist()
        _comp = [[-1] * T for _ in range(B)]
        for _b in range(B):
            _lbl, _next = _comp[_b], 0
            for _t0 in range(T):
                if _lbl[_t0] >= 0 or _rm[_b][_t0] == 0:
                    continue
                _lbl[_t0] = _next
                _stack = [_t0]
                while _stack:
                    _t = _stack.pop()
                    for _d in range(6):
                        if not (_rm[_b][_t] >> _d) & 1:
                            continue
                        _n = _nb[_t][_d]
                        if _n < 0 or _lbl[_n] >= 0:
                            continue
                        _lbl[_n] = _next
                        _stack.append(_n)
                _next += 1
        self.river_comp = torch.tensor(_comp, dtype=torch.long, device=device)
        self.cliff_mask = torch.tensor([[int(t.get("cm", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self._has_cliffs = bool(self.cliff_mask.any())
        # Per-tile APPEAL contribution (cpu/core/appeal.ts tileAppeal sums what
        # each NEIGHBOUR contributes). `ap` = static part + the t0 feature term;
        # `apf` isolates that feature term so a chopped tile subtracts
        # exactly it. Dynamic terms are applied in _tile_appeal.
        self.appeal_base = torch.tensor([[int(t.get("ap", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.appeal_feat = torch.tensor([[int(t.get("apf", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.appeal_self = torch.tensor([[int(t.get("aps", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # Appeal OVERRIDE — natural wonder 5, mountain 4, neither touched by
        # adjacency; -999 = compute normally. Mirrors the two early returns in
        # cpu/core/appeal.ts tileAppeal.
        self.appeal_over = torch.tensor([[int(t.get("apo", -999)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.civ_alive = torch.zeros(B, self.n_majors, dtype=torch.bool, device=device)
        self.seat_explored = torch.zeros(B, self.n_majors, self.T, dtype=torch.bool, device=device)
        self.civ_aggression = torch.zeros(B, self.n_majors, dtype=torch.float64, device=device)

        _civ_scalars = (
            ("best_melee", torch.long, 0), ("builders_trained", torch.long, 0),
            ("relic_reserve", torch.long, 0),
            ("civic_prog", dtype, 0), ("cur_civic", torch.long, -1),
            ("cur_tech", torch.long, -1), ("diplo_favor", torch.long, 0),
            ("diplo_points", torch.long, 0), ("envoys_avail", torch.long, 0),
            ("influence", dtype, 0), ("tech_prog", dtype, 0),
            ("treasury", dtype, 0),
            # LIFETIME raw carbon. Signed: Carbon Recapture takes it below 0.
            ("co2", dtype, 0), ("co2_turn", dtype, 0),
            ("enhancer", torch.long, -1), ("enhancer_done", torch.bool, 0),
            ("follower", torch.long, -1), ("founder", torch.long, -1),
            ("next_city_id", torch.long, 0), ("pantheon", torch.long, -1),
            ("pantheon_done", torch.bool, 0), ("prophets", torch.long, 0),
            ("religion_done", torch.bool, 0), ("tiles_purchased", torch.long, 0),
            ("inquisition", torch.bool, 0),
        )
        for _nm, _dt, _fill in _civ_scalars:
            setattr(self, f"civ_{_nm}", torch.full((B, self.n_majors), _fill, dtype=_dt, device=device))
        for _b, _f in enumerate(fixtures):
            for _cv in _f["civs"]:
                _s = int(_cv["seat"])
                if 0 <= _s < self.n_majors:
                    self.civ_treasury[_b, _s] = float(_cv.get("treasury", 0.0))
        _pw = self.n_majors
        self.seat_warkind = torch.zeros(B, _pw, _pw, dtype=torch.bool, device=device)
        # CIV6 (Golden Age War): the To Arms! declaration's quarter-priced
        # war, remembered per pair for the captures it discounts.
        self.seat_wargolden = torch.zeros(B, _pw, _pw, dtype=torch.bool, device=device)
        self.seat_denounced = torch.full((B, _pw, _pw), -1, dtype=torch.long, device=device)
        # THE DIPLOMATIC AGREEMENT CLOCKS, turns LEFT. Friendship and the
        # alliance are symmetric; the Open Borders grant is DIRECTED - row a,
        # column b is what a grants b. `seatsAllied` is the alliance clock
        # above zero, the single storage for that fact.
        self.seat_friend_turns = torch.zeros(B, _pw, _pw, dtype=torch.long, device=device)
        self.seat_ally_turns = torch.zeros(B, _pw, _pw, dtype=torch.long, device=device)
        # THE ALLIANCE'S TYPE (the exporter's ALLIANCE_TYPES order, -1 while
        # none stands) and its POINTS in quarter-points - the pair's
        # accumulated trust, kept when an alliance lapses.
        self.seat_alliance_type = torch.full((B, _pw, _pw), -1, dtype=torch.long, device=device)
        self.seat_alliance_pts = torch.zeros(B, _pw, _pw, dtype=torch.long, device=device)
        # the seat's science / culture / tourism OUTPUT of its last completed
        # accrual - what an ally's percentage bonus reads (Alliance level 3)
        self.civ_sci_rate = torch.zeros(B, self.n_majors, dtype=torch.float64, device=device)
        self.civ_cul_rate = torch.zeros(B, self.n_majors, dtype=torch.float64, device=device)
        self.civ_tour_rate = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        self.seat_borders_turns = torch.zeros(B, _pw, _pw, dtype=torch.long, device=device)
        # DIRECTED, 1 where the row seat holds a Delegation or Resident Embassy
        # with the column seat. Indefinite: a war ends it, never a clock.
        self.seat_delegation = torch.zeros(B, _pw, _pw, dtype=torch.long, device=device)
        # THE NEGOTIATED DEAL. An offer sits on the table keyed from -> to: the
        # turns it still stands (0 = none) and the two bundles, each
        # `dealItems` slots of [kind, a, b] with kind -1 for an empty slot. A
        # term is what the giver still owes for the rest of the deal's 30.
        self._deal_items = int(rules.eras["dealItems"])
        self._deal_turns = int(rules.eras["dealTurns"])
        self._deal_offer_turns = int(rules.eras["dealOfferTurns"])
        _di = self._deal_items
        self.deal_offer_left = torch.zeros(B, _pw, _pw, dtype=torch.long, device=device)
        self.deal_offer_give = torch.full((B, _pw, _pw, _di, 3), -1, dtype=torch.long, device=device)
        self.deal_offer_ask = torch.full((B, _pw, _pw, _di, 3), -1, dtype=torch.long, device=device)
        self.deal_term_left = torch.zeros(B, _pw, _pw, dtype=torch.long, device=device)
        self.deal_term_item = torch.full((B, _pw, _pw, _di, 3), -1, dtype=torch.long, device=device)
        # CIV6: a captured spy is "imprisoned, but not killed" — keyed
        # owner -> captor, and still counted against the owner's capacity.
        # ...as COUNTS BY LEVEL, so the spy that is traded back is the one that
        # was caught (C-16): [B, pw, pw, level].
        self.seat_spy_held = torch.zeros(B, _pw, _pw, int(rules.eras["espionage"]["maxLevel"]) + 1,
                                         dtype=torch.long, device=device)
        # THE SCORED COMPETITION running right now: which one (-1 = none), the
        # turns it has left, and the field's running scores. ONE at a time.
        # CIV6 (Nuclear accident): the reactor's AGE per city — the turns since
        # its plant was built or last recommissioned. -1 = no reactor here.
        self.city_reactor_age = torch.full(
            (B, self.n_majors, civ_city_pad), -1, dtype=torch.long, device=device)
        self.comp_kind = torch.full((B,), -1, dtype=torch.long, device=device)
        self.comp_left = torch.zeros(B, dtype=torch.long, device=device)
        self.comp_score = torch.zeros(B, _pw, dtype=dtype, device=device)
        self.comp_member = torch.zeros(B, _pw, dtype=torch.bool, device=device)
        self.congress_sessions = torch.zeros(B, dtype=torch.long, device=device)
        # the ANNOUNCED slate for the next Regular Session (resolution
        # indices; -1 = empty slot), drawn at the previous session's close.
        self.congress_slate = torch.full((B, 2), -1, dtype=torch.long, device=device)
        # Standing World Congress resolutions of the LAST session, 2 slots x
        # (res, outcome 0=A/1=B, target); -1 empty. Replaced every session.
        self.congress_active = torch.full((B, 2, 3), -1, dtype=torch.long, device=device)
        # THIS TURN's ballot per major: [outcome, target, extra votes] for the
        # two rotating slate slots, the always-3rd Diplomatic Victory
        # resolution and the SPECIAL SESSION. -1 in the outcome field = no
        # intent, vote the AI line. `_world_congress` clears it whether a
        # session fires or not.
        self.civ_congress_vote = torch.full((B, self.n_majors, 4, 3), -1, dtype=torch.long, device=device)
        # EMERGENCIES, one fixed table of slots. A live row carries its kind,
        # the offending seat, the contested city id, the phase (0 pending, 1
        # called, 2 running) and the turn that phase acts on; `emg_affected`
        # is who may SPONSOR it and `emg_member` who voted it through.
        _ke = int(rules.eras["emergencySlots"])  # the loader below re-reads it as _emg_slots
        self.emg_kind = torch.full((B, _ke), -1, dtype=torch.long, device=device)
        self.emg_target = torch.full((B, _ke), -1, dtype=torch.long, device=device)
        self.emg_city = torch.full((B, _ke), -1, dtype=torch.long, device=device)
        self.emg_phase = torch.full((B, _ke), -1, dtype=torch.long, device=device)
        self.emg_act = torch.full((B, _ke), -1, dtype=torch.long, device=device)
        self.emg_affected = torch.zeros(B, _ke, self.n_majors, dtype=torch.bool, device=device)
        self.emg_member = torch.zeros(B, _ke, self.n_majors, dtype=torch.bool, device=device)
        # the turn the Congress last sat, Regular or Special; -1 = never
        self.last_session_turn = torch.full((B,), -1, dtype=torch.long, device=device)
        # what RESOLVED emergencies left standing, forever — counters, because
        # winning the same kind twice pays twice
        self.civ_emg_heal = torch.zeros(B, self.n_majors, self.n_majors, dtype=torch.long, device=device)
        self.civ_emg_strike = torch.zeros(B, self.n_majors, self.n_majors, dtype=torch.long, device=device)
        self.civ_emg_envoy_gold = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        self.civ_emg_route_gold = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        # Per-seat era-score accumulator, one column per seat row — the TS
        # `state.eraScore` mirror. Integer, zero-draw;
        # resets at every eraLength boundary (right after `self.turn += 1`, the
        # endTurn eraBoundary mirror). Loaded from the fixture's t0 snapshot.
        # _MUTABLE for snapshot/restore.
        self.era_score = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        # CIV6 (Ages): how many DARK and GOLDEN/HEROIC ages each civ has
        # entered — the per-civ threshold drift's memory.
        self.dark_ages = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        self.golden_ages = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        self.ded_picks = torch.full((B, self.n_majors, max(int(rules.eras.get("heroicDedications", 3)), 1)), -1, dtype=torch.long, device=device)
        for b, f in enumerate(fixtures):
            esi = f.get("eraScoreInit", [])
            for c, v in enumerate(esi[: self.n_majors]):
                self.era_score[b, c] = int(v)
        _er = rules.eras
        self._formal_war_min = int(rules.seats.get("formalWarMinTurns", 5))
        self._agreement_turns = int(rules.seats["agreementTurns"])
        self._alliance_civic = int(rules.seats["allianceCivic"])
        self._open_borders_civic = int(rules.seats["openBordersCivic"])
        self._favor_per_alliance = int(rules.seats["favorPerAlliance"])
        self._al_qp_turn = int(rules.seats["allianceQpTurn"])
        self._al_qp_route = int(rules.seats["allianceQpRoute"])
        self._al_l2_qp = int(rules.seats["allianceL2Qp"])
        self._al_l3_qp = int(rules.seats["allianceL3Qp"])
        self._al_route_to = torch.tensor([int(x) for x in rules.seats["allianceRouteTo"]], dtype=torch.long, device=device)
        self._al_route_from = torch.tensor([int(x) for x in rules.seats["allianceRouteFrom"]], dtype=torch.long, device=device)
        self._al_route_ycol = torch.tensor([int(x) for x in rules.seats["allianceRouteYcol"]], dtype=torch.long, device=device)
        self._al_m1_cs = int(rules.seats["allianceM1Cs"])
        self._al_m2_mil_prod_pct = int(rules.seats["allianceM2MilProdPct"])
        self._al_r2_boost_turns = int(rules.seats["allianceR2BoostTurns"])
        self._al_r3_sci_pct = float(rules.seats["allianceR3SciPct"])
        self._al_c2_gpp = int(rules.seats["allianceC2Gpp"])
        self._al_c3_cul_pct = float(rules.seats["allianceC3CulPct"])
        self._al_c3_tour_pct = float(rules.seats["allianceC3TourPct"])
        self._al_e2_influence = int(rules.seats["allianceE2Influence"])
        self._al_rel2_theo_cs = int(rules.seats["allianceRel2TheoCs"])
        self._al_rel3_faith_pop = int(rules.seats["allianceRel3FaithPerPop"])
        self._treaty_turns = int(rules.seats["peaceTreatyTurns"])
        # rules.eras is the exporter's eras bag (the diplomacy/congress
        # scalars ride it); reading it off rules.seats returned {} and every
        # .get below silently DEFAULTED — hard reads keep that from recurring.
        _er2 = rules.eras
        _wgp = _er2["warGrievancePct"]
        self._war_griev_pct = {k: tuple(int(x) for x in _wgp[k])
                               for k in ("surprise", "formal", "golden")}
        self._griev_war_base = int(_er2["grievanceWarBase"])
        self._griev_war_on_friend = int(_er2["grievanceWarOnFriend"])
        self._griev_war_on_suzerain = int(_er2["grievanceWarOnSuzerain"])
        self._griev_war_on_cs_friend = int(_er2["grievanceWarOnCsFriend"])
        self._griev_city_taken = int(_er2["grievanceCityTaken"])
        self._griev_last_city = int(_er2["grievanceLastCity"])
        self._griev_cs_conquered = int(_er2["grievanceCsConquered"])
        self._griev_cs_razed = int(_er2["grievanceCsRazed"])
        self._griev_denounce = int(_er2["grievanceDenounce"])
        self._griev_held_capital = int(_er2["grievanceHeldCapital"])
        self._griev_ally_share = int(_er2["grievanceAllyShare"])
        self._griev_friend_share = int(_er2["grievanceFriendShare"])
        self._griev_decay_base = int(_er2["grievanceDecayBase"])
        self._griev_decay_floor = int(_er2["grievanceDecayFloor"])
        self._griev_occ_decay = int(_er2["grievanceOccupiedDecay"])
        self._griev_occ_cap_decay = int(_er2["grievanceOccupiedCapitalDecay"])
        self._griev_favor_floor = int(_er2["grievanceFavorFloor"])
        self._griev_favor_step = int(_er2["grievanceFavorStep"])
        self._griev_favor_max = int(_er2["grievanceFavorMax"])
        self._griev_gang = int(_er2["grievanceGang"])
        self._favor_per_suz = int(_er2["diplomaticFavorPerSuzerain"])
        self._congress_interval = int(_er2["congressInterval"])
        self._congress_min_era = int(_er2["congressMinEra"])
        self._dvp_per_res = int(_er2["dvpPerResolution"])
        self._dvp_win = int(_er2["diploVictoryPoints"])
        # WORLD CONGRESS catalog + magnitudes (data/seats.ts carries the
        # sources). Hard reads — a missing key must fail loud, not default.
        self._congress_res = [
            {"id": str(r["id"]), "min": int(r["min"]), "max": int(r["max"]), "t": int(r["t"])}
            for r in _er2["congressResolutions"]
        ]
        # A resolution is addressed by NAME: the catalog's ORDER is the wire's,
        # and a body that hard-codes a position breaks silently when one is
        # appended before it.
        self._congress_at = {r["id"]: i for i, r in enumerate(self._congress_res)}
        self._congress_dv_min = int(_er2["congressDvMinEra"])
        self._congress_dv_delta = int(_er2["congressDvDelta"])
        self._congress_vstep = int(_er2["congressVoteStep"])
        self._c_prod_mult = float(_er2["congressProdMult"])
        self._c_plus100 = float(_er2["congressPlus100"])
        self._c_energy_discount = float(_er2["congressEnergyDiscount"])
        self._c_minus50 = float(_er2["congressMinus50"])
        self._c_trade_gold = float(_er2["congressTradeGold"])
        self._c_trade_cap = int(_er2["congressTradeCapacity"])
        self._c_policy_favor = float(_er2["congressPolicyFavor"])
        self._c_pr_a = int(_er2["congressPrMultA"])
        self._c_pr_b = int(_er2["congressPrMultB"])
        self._c_advisory_cs = int(_er2["congressAdvisoryCs"])
        self._c_pact_levels = int(_er2["congressPactLevels"])
        self._vis_max = int(_er2["visibilityMax"])
        self._vis_cs_per_level = int(_er2["visibilityCsPerLevel"])
        self._vis_tech = int(_er2["visibilityTech"])
        self._deleg_cost = float(_er2["delegationCost"])
        self._embassy_cost = float(_er2["embassyCost"])
        self._embassy_civic = int(_er2["embassyCivic"])
        self._deal_kinds = [str(k) for k in _er2["dealItemKinds"]]
        self._deal_permanent = [bool(v) for v in _er2["dealPermanent"]]
        self._deal_k_gold = self._deal_kinds.index("GOLD")
        self._deal_k_gpt = self._deal_kinds.index("GOLD_PER_TURN")
        self._deal_k_favor = self._deal_kinds.index("FAVOR")
        self._deal_k_res = self._deal_kinds.index("RESOURCE")
        self._deal_k_gw = self._deal_kinds.index("GREAT_WORK")
        self._deal_k_city = self._deal_kinds.index("CITY")
        self._deal_k_spy = self._deal_kinds.index("SPY")
        self._deal_k_borders = self._deal_kinds.index("OPEN_BORDERS")
        self._comp_turns = int(_er2["competitionTurns"])
        self._comp_silver_pct = int(_er2["competitionSilverPct"])
        self._comp_bronze_pct = int(_er2["competitionBronzePct"])
        self._comps = list(_er2["competitions"])
        self._comp_climate = [c["id"] for c in self._comps].index("CLIMATE_ACCORDS")
        self._c_wr_rs = int(_er2["congressWorldReligionRs"])
        self._c_wr_favor = int(_er2["congressWorldReligionFavor"])
        self._c_ideology_slots = int(_er2["congressIdeologySlots"])
        self._culture_bomb_range = int(_er2["cultureBombRange"])
        self._favor_occ_capital = float(_er2["favorOccupiedCapital"])
        # EMERGENCIES: the catalog and the magnitudes the special session pays out
        self._emg_rows = [{"id": str(e["id"]), "turns": int(e["turns"])} for e in _er2["emergencies"]]
        self._emg_at = {r["id"]: i for i, r in enumerate(self._emg_rows)}
        self._emg_slots = int(_er2["emergencySlots"])
        self._special_slot = 3  # the special session's slot in the vote head
        # a Deforestation Treaty target `k` is the tile feature `_congress_feat[k]`
        self._congress_feat = [int(x) for x in _er2.get("congressFeatures", [])]
        # the terrains the Lighthouse pays its food on
        self._coast_food_terr = [int(x) for x in _er2.get("coastFoodTerrains", [])]
        self._loyalty_max = float(rules.seats["loyaltyMax"])
        self._special_cost = float(_er2["specialSessionCost"])
        self._special_gap = int(_er2["specialSessionGap"])
        self._emg_member_favor = float(_er2["emergencyMemberFavor"])
        self._emg_target_favor = float(_er2["emergencyTargetFavor"])
        self._emg_member_cs = float(_er2["emergencyMemberCs"])
        self._emg_member_mp = int(_er2["emergencyMemberMp"])
        self._emg_target_loyalty = float(_er2["emergencyTargetLoyalty"])
        self._emg_member_heal = int(_er2["emergencyMemberHeal"])
        self._emg_strike_cs = float(_er2["emergencyTargetStrikeCs"])
        self._emg_envoy_gold = float(_er2["emergencyEnvoyGold"])
        self._emg_cs_route_gold = float(_er2["emergencyCsRouteGold"])
        self._c_gpp_mult = float(_er2["congressGppMult"])
        self._c_grow_a = float(_er2["congressGrowthA"])
        self._c_grow_b = float(_er2["congressGrowthB"])
        self._c_mig_loy = float(_er2["congressMigLoyalty"])
        self._c_gw_mult = int(_er2["congressGwMult"])
        self._era_len = int(_er.get("length", 50))
        self._era_count = int(_er["count"])
        self._era_pts = {k: int(_er.get(k, d)) for k, d in (("found", 2), ("conquer", 3), ("wonder", 3), ("pantheon", 1), ("religion", 2), ("gp", 1))}
        self._era_moment_min = int(_er["momentMin"])
        # Per-seat Age (0 Dark / 1 Normal / 2 Golden), assigned at each era
        # boundary from the just-ended window's score; era 0 is all Normal (the
        # TS civAges default — nothing exported at t0). _MUTABLE. _age_factor =
        # the SOURCE seat's loyalty-pressure multiplier (halves — exact in f32
        # AND f64, so modulated sums stay association-free).
        self.civ_age = torch.ones(B, self.n_majors, dtype=torch.long, device=device)
        # CIV6 (Legacy policy card): the governments this seat HAS BEEN in, as
        # a bitmask over the government roster's own order — what unlocks each
        # legacy card, and the one fact `_adopted_gov` cannot re-derive because
        # it depends on the ORDER the civics arrived in.
        self.civ_gov_held = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        # ...and the CLOCK (C-63): turns this seat has spent in each government,
        # which is what an accumulating bonus accrues on. `civ_gov_held` answers
        # "ever" and this answers "how long"; they are written on the same line
        # under the same condition, because an idempotent `|=` hides a gating
        # difference that a counter would show at once.
        self.civ_gov_turns = torch.zeros(B, self.n_majors, max(1, len(rules.governments or [])), dtype=torch.long, device=device)
        self.prev_age = torch.ones_like(self.civ_age)
        self.dedications = torch.ones_like(self.civ_age)
        self._era_dark = int(_er.get("darkT", 12))
        self._era_gold = int(_er.get("goldenT", 24))
        self._age_step = int(_er.get("agePrevStep", 5))
        self._age_factor = torch.tensor(_er.get("agePressure", [0.5, 1.0, 1.5]), dtype=torch.float64, device=device)
        # THE GOVERNOR CATALOG. `governors` order IS the governor index; the
        # thirteen title civics, the neutralize clock and the Governance
        # Doctrine favor ride the era block beside the ages that gate them.
        _gv = rules.governors
        _gp = rules.governor_promotions
        self.n_governors = len(_gv)
        self.n_gov_promos = len(_gp)
        self._gov_establish = torch.tensor([int(g["establish"]) for g in _gv] or [0],
                                           dtype=torch.long, device=device)
        self._gov_minor_ok = torch.tensor([bool(g["cityStates"]) for g in _gv] or [False],
                                          dtype=torch.bool, device=device)
        self._gov_base_promo = torch.tensor([int(g["base"]) for g in _gv] or [0],
                                            dtype=torch.long, device=device)
        self._gov_title_civics = torch.tensor(_er.get("governorTitleCivics", []) or [-1],
                                              dtype=torch.long, device=device)
        self._gov_neutralize = int(_er["governorNeutralizeTurns"])
        self._gov_doctrine_favor = int(_er["governanceDoctrineFavor"])
        self._gpromo_gov = torch.tensor([int(p["gov"]) for p in _gp] or [0], dtype=torch.long, device=device)
        self._gpromo_tier = torch.tensor([int(p["tier"]) for p in _gp] or [0], dtype=torch.long, device=device)
        self._gpromo_req = torch.tensor([int(p["requires"]) for p in _gp] or [0], dtype=torch.long, device=device)
        self._gpromo = {}
        if _gp:
            for _k in ("cityYields", "perCitizen", "yieldMult", "adjacencyMult",
                       "loyaltyToOwn", "loyaltyToForeign",
                       "faithPerSpecialty", "districtProdMult", "projectProdMult", "growthMult",
                       "gppMult", "gwTourismMult", "pressureMult", "builderCharges",
                       "settlerFreePop", "harvestMult", "cityDefense", "territoryCS",
                       "extraStrikes", "freePromoOnTrain", "theologyCS", "fullHeal",
                       "ignoreForeignPressure", "faithOnBuildPct", "waterWorks",
                       "spyLevelPenalty", "noSiege", "stockpilePerTurn", "resourceDiscountPct",
                       "envoysAtMinor", "envoyDoubleAtMinor", "minorLuxuries",
                       "routeStartFood", "industryAllSources", "envDamageImmune",
                       "goldPerFeature", "appealNearFeature", "firstPromoBonus",
                       "passRouteGold", "borderExpansionPct"):
                self._gpromo[_k] = torch.tensor([p[_k] for p in _gp], dtype=torch.float64, device=device)
        # Whether ANY governor promotion can move `_tile_appeal` at all — the
        # gate on the version bump `_governor_phase` owes that cache.
        self._gov_appeal_any = bool(
            self._gpromo and float(self._gpromo["appealNearFeature"].abs().sum()) > 0)
        self._water_works_housing = int(_er.get("waterWorksHousing", 2))
        self._water_works_amenities = int(_er.get("waterWorksAmenities", 1))
        self._ded_payouts_live = bool(_er.get("dedicationPayoutsLive", False))
        self._ded_monumentality = int(_er.get("dedMonumentality", 0))
        self._ded_free_inquiry = int(_er.get("dedFreeInquiry", 1))
        self._ded_pen_brush = int(_er.get("dedPenBrush", 2))
        # +Movement from MONUMENTALITY (Builders) / EXODUS (Missionaries,
        # Apostles). Defaults to 0 so a stale rules.json fails LOUDLY at the
        # parity gate instead of quietly disagreeing with TS.
        self._golden_move = int(_er.get("goldenMoveBonus", 0))
        self._ded_exodus = int(_er.get("dedExodus", 3))
        self._heroic_ded = int(_er.get("heroicDedications", 3))
        self._ded_event_score = [int(x) for x in _er.get("dedEventScore", [1, 1, 1, 2])]
        self._n_ded = len(self._ded_event_score)
        self._gov_loy = float(_er.get("governorLoyalty", 8))
        self._ded_to_arms = int(_er["dedToArms"])
        self._ded_dracones = int(_er["dedDracones"])
        self._ded_coinage = int(_er["dedCoinage"])
        self._ded_steam = int(_er["dedSteam"])
        self._ded_wish = int(_er["dedWish"])
        self._ded_sky = int(_er["dedSky"])
        self._ded_bodyguard = int(_er["dedBodyguard"])
        self._ded_automaton = int(_er["dedAutomaton"])
        self._sky_eurekas = [[int(x) for x in w if int(x) >= 0] for w in _er["skyEurekas"]]
        self._sky_alu_slot = int(_er["skyAluminumSlot"])
        self._sky_alu_rate = int(_er["skyAluminumPerTurn"])
        self._sky_air_xp = int(_er["skyAirXpPct"])
        self._auto_ura_slot = int(_er["automatonUraniumSlot"])
        self._auto_ura_rate = int(_er["automatonUraniumPerTurn"])
        self._auto_ura_mine = int(_er["automatonUraniumPerMine"])
        # Which catalog entries each WORLD ERA offers, padded with -1.
        self._ded_eras = [[int(x) for x in w] for w in _er["dedEras"]]
        self._ded_era_len = [int(x) for x in _er["dedEraLen"]]
        self._wish_park = float(_er["wishParkTourism"])
        self._wish_wond_num = int(_er["wishWonderTourNum"])
        self._wish_wond_den = int(_er["wishWonderTourDen"])
        self._to_arms_prod = float(_er["toArmsMilProd"])
        self._dracones_disc = int(_er["draconesDiscoveryScore"])
        self._coinage_spec_gold = float(_er["coinageIntlGoldPerSpec"])
        self._steam_wonder_prod = float(_er["steamWonderProd"])
        self._industrial_era = int(_er["industrialEra"])
        _sp = _er["espionage"]
        self._spy_cap_civics = [int(x) for x in _sp["capacityCivics"]]
        self._spy_cap_techs = [int(x) for x in _sp["capacityTechs"]]
        self._spy_cap_max = int(_sp["capacityMax"])
        self._spy_max_level = int(_sp["maxLevel"])
        self._spy_idle = int(_sp["idle"])
        self._spy_travelling = int(_sp["travelling"])
        self._spy_travel_cols = int(_sp["travelCols"])
        self._spy_missions = [
            {k: int(v) for k, v in m.items() if k != "id"} for m in _sp["missions"]
        ]
        _mid = [str(m["id"]) for m in _sp["missions"]]
        self._spy_m_sources = _mid.index("GAIN_SOURCES")
        self._spy_m_siphon = _mid.index("SIPHON_FUNDS")
        self._spy_m_heist = _mid.index("GREAT_WORK_HEIST")
        self._spy_m_sabotage = _mid.index("SABOTAGE_PRODUCTION")
        self._spy_m_steal = _mid.index("STEAL_TECH_BOOST")
        self._spy_m_partisans = _mid.index("RECRUIT_PARTISANS")
        self._spy_m_rocketry = _mid.index("DISRUPT_ROCKETRY")
        self._spy_m_unrest = _mid.index("FOMENT_UNREST")
        self._spy_m_governor = _mid.index("NEUTRALIZE_GOVERNOR")
        self._spy_m_counterspy = _mid.index("COUNTERSPY")
        self._spy_m_listening = _mid.index("LISTENING_POST")
        self._spy_secret_level = int(_sp["secretAgentLevel"])
        self._spy_m_breach = _mid.index("BREACH_DAM") if "BREACH_DAM" in _mid else -1
        self._spy_travel_min = int(_sp["travelMin"])
        self._spy_travel_per = int(_sp["travelTilesPerTurn"])
        self._spy_travel_max = int(_sp["travelMax"])
        self._spy_success_per_level = int(_sp["successPerLevel"])
        self._spy_capture_pct = int(_sp["capturePct"])
        self._spy_counterspy_pct = int(_sp["counterspyPct"])
        self._bodyguard_num = int(_sp["bodyguardNum"])
        self._bodyguard_den = int(_sp["bodyguardDen"])
        self._spy_unrest = int(_sp["unrestLoyalty"])
        self._spy_unrest_per_level = int(_sp["unrestPerLevel"])
        self._spy_gov_turns = int(_sp["governorTurns"])
        self._spy_sources_levels = int(_sp["sourcesLevels"])
        self._spy_sources_turns = int(_sp["sourcesTurns"])
        self._spy_partisans_min = int(_sp["partisansMin"])
        self._spy_partisans_max = int(_sp["partisansMax"])
        self._spy_m_scandal = _mid.index("FABRICATE_SCANDAL")
        self._spy_escape_routes = [
            {k: int(v) for k, v in r.items() if k != "id"} for r in _sp["escapeRoutes"]
        ]
        self._spy_scandal_base = int(_sp["scandalEnvoysBase"])
        self._spy_scandal_per_level = int(_sp["scandalEnvoysPerLevel"])
        self._n_spy_missions = len(self._spy_missions)
        # the operations the Espionage Pact can name — `SPY_OFFENSIVE_MISSIONS`
        self._spy_offensive = [i for i, m in enumerate(self._spy_missions) if m["offensive"]]
        nt_b3, nc_b3 = len(rules.t_cost), len(rules.c_cost)
        # The per-seat RESEARCH vectors, merged like the scalars. Placed here
        # because their width is only known once the rules tables are read.
        for _nm, _w in (("techs", nt_b3), ("civics", nc_b3),
                        ("tech_boosted", nt_b3), ("civic_boosted", nc_b3)):
            setattr(self, f"civ_{_nm}", torch.zeros(B, self.n_majors, _w, dtype=torch.bool, device=device))
        # PARKED research progress, per item. A seat may switch research at any
        # time (real Civ 6 does, and hands the abandoned item's science back on
        # return), so the progress POOL — `civ_tech_prog`, which belongs to
        # whatever is current — is parked here under the outgoing item and the
        # incoming item's parked value is loaded into it. The item being
        # researched is never in here: the two stores PARTITION a seat's
        # science and no body may add them.
        for _nm, _w in (("tech_retain", nt_b3), ("civic_retain", nc_b3)):
            setattr(self, f"civ_{_nm}", torch.zeros(B, self.n_majors, _w, dtype=dtype, device=device))
        self.seat_ext = torch.zeros(B, self.n_majors + s_pad + 1, dtype=torch.bool, device=device)
        self.seat_ext[:, :self.n_majors] = True
        # Civ-city district registry [.., nD]: the tile of each placed district
        # type, -1 = none. A queued district already occupies its column, so it
        # counts toward the cap and the one-per-type rule (city.districts in TS).
        nd_b4 = max(len(rules.districts or []), 1)
        # ... spanning the MINOR rows too: a city-state's one city keeps its
        # district registry at [:, n_majors+s, 0] like every other city fact.
        self.city_dist_tile = torch.full((B, self.n_majors + max(self.S, 1), civ_city_pad, nd_b4), -1, dtype=torch.long, device=device)
        # CITIZENS PINNED into each district's specialist slots, -1 where the
        # automatic rule decides (City.specialistPref). Same geometry as the
        # registry above, because a pin names a district TYPE.
        self.city_spec_pin = torch.full((B, self.n_majors, civ_city_pad, nd_b4), -1, dtype=torch.long, device=device)
        self.district_dead = torch.zeros(B, T, dtype=torch.bool, device=device)
        # Persistent city ids on the seat axis — the TS City.id, allocated per
        # seat from civ_next_city_id. tile_city stores THESE ids for every seat;
        # consumers that speak column space resolve through the `owner` cache's
        # id→slot match.
        self.city_id = torch.zeros(B, self.n_majors, civ_city_pad, dtype=torch.long, device=device)
        # capitalTiles, seat-indexed: only an isCapital founding (t0 or a
        # total-collapse refound) writes a row. The capital is an identity
        # (city_is_cap), not a slot — _reclaim_cities compaction permutes slots
        # underneath. EVERY row starts -1: no capital until a FOUND crowns one,
        # which is the `capitalTile ?? -1` the digest compares against and the
        # missing capital `dominationWinner` refuses to name a winner over.
        self.civ_cap_tile = torch.full((B, self.n_majors), -1, dtype=torch.long, device=device)
        k_routes = 1 + int(self.rules.seats.get("maxCities", 6)) + 2 + max(int(self.S), 0) + 2
        self.seat_routes = torch.full((B, self.n_majors + s_pad + 1, k_routes, 2), -1, dtype=torch.long, device=device)
        # An INTERNATIONAL leg's destination, keyed the way TS keys it: the
        # (seat, city id) pair, not a tile. A city id is only unique WITHIN a
        # seat (`civ_next_city_id` counts per row) and a capture mints a NEW
        # one, so the pair is what makes a captured destination stop resolving.
        self.seat_route_dseat = torch.full((B, self.n_majors + s_pad + 1, k_routes), -1, dtype=torch.long, device=device)
        self.seat_route_dcity = torch.full((B, self.n_majors + s_pad + 1, k_routes), -1, dtype=torch.long, device=device)
        self.seat_route_exp = torch.full((B, self.n_majors + s_pad + 1, k_routes), -1, dtype=torch.long, device=device)
        # the WALK: the servicing Trader's turn of birth, current tile, and
        # leg (-1 parked at origin/sea, 0 walking out, 1 walking home) — what
        # plunder targets and the round-trip expiry reads.
        self.seat_route_born = torch.full((B, self.n_majors + s_pad + 1, k_routes), -1, dtype=torch.long, device=device)
        self.seat_route_walk = torch.full((B, self.n_majors + s_pad + 1, k_routes), -1, dtype=torch.long, device=device)
        self.seat_route_leg = torch.full((B, self.n_majors + s_pad + 1, k_routes), -1, dtype=torch.long, device=device)
        # the stored COURSE (`TradeRoute.chain`): the Trading-Post centres the
        # route rides through, walk order, -1-padded — `routeChain` computes it
        # ONCE at commit on both engines, the pass-through gold reads it every
        # turn, and a freed slot is wiped at its next commit.
        self._route_chain_max = max(int(self.rules.seats.get("routeChainMax", 6)), 1)
        self.seat_route_chain = torch.full(
            (B, self.n_majors + s_pad + 1, k_routes, self._route_chain_max), -1,
            dtype=torch.long, device=device)
        # CIV6 (Trading Post): one bool per (major row, CENTRE tile) — the row
        # holds a Trading Post there. Stamped at both endpoints when a route
        # runs its FULL term; the chain and gold readers gate on a living city
        # still standing at the centre.
        self.trading_post = torch.zeros(B, self.n_majors, T, dtype=torch.bool, device=device)
        self._alloc_cs_pairs(B, self.n_majors, s_pad, device)

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
        self.POOL_NEXT = {"major": "unit_next", "barb": "next_slot"}
        self._UNIT_PLANES: list = []
        for _pl, _dt in (
            ("alive", torch.bool),      # a slot holds a living unit
            ("emb", torch.bool),        # embarked — a land unit standing on water
            ("type", torch.long),       # roster index (barbs too)
            ("tile", torch.long),
            ("hp", torch.long),
            ("fortify", torch.long),    # fortifyTurns (military; cap 2)
            ("xp", torch.long),         # combat experience TOWARD the next level
            ("level", torch.long),      # 1..MAX_LEVEL; the unit holds level-1 promotions
            ("promos", torch.long),     # bitmask over the rows of this chassis's class list
            ("promo_offer", torch.long),  # the columns this unit may take (0 = every legal one)
            ("promo_used", torch.long),  # the ONCE-ONLY columns already collected
            # extra promotions the TRAINING city banked on this unit (Patron
            # Saint), each spent by re-arming it as it takes one
            ("promo_bonus", torch.long),
            ("xp_pct", torch.long),     # the training city's percentage XP modifier, for life
            ("charges", torch.long),    # builder/missionary charges
            # The general/admiral aura's +MP, FROZEN at the refreshUnits site
            # (_refresh_aura_mp) — walkers read it instead of recomputing, so a
            # general that walks later in the same step cannot retro-change a
            # pool TS already granted.
            ("aura_mp", torch.long),
            ("mp", torch.long),
            ("mp_full", torch.long),
            # ATTACKS left this turn. CIV6: a unit attacks ONCE a turn, and
            # Sweeping Wind is the only row that buys a second.
            ("attacks", torch.long),
            # The OWNER of whatever sits in this slot, in the absolute seat
            # space TS uses (0 seat 0, 1..99 civs, 100+ city-states, 200 barbs)
            # — a value you can gather and compare without already knowing which
            # pool range you are looking at. Checked by _check_seat_invariant.
            ("seat", torch.long),
            # ESPIONAGE. `spy_mission` is the idle sentinel, the travelling
            # sentinel or a mission index; `spy_target` the CENTRE TILE a
            # travelling spy is bound for.
            ("spy_mission", torch.long),
            ("spy_turns", torch.long),
            ("spy_target", torch.long),
            ("spy_level", torch.long),
            # THE ROCK BAND. `band_level` is 1..4 (0 on every other unit),
            # `band_album` its accumulated Album Sales.
            ("band_level", torch.long),
            ("band_album", torch.long),
            # a GREAT PERSON chassis's QUEUE POSITION — which person it is
            # carrying, and so which sourced row its charge spends. -1 on
            # every other unit.
            ("gp_at", torch.long),
            # the turn a STEALTH hull last attacked: CIV6 (Unit) says one that
            # attacks "will become visible for a turn". -1 = never.
            ("revealed_turn", torch.long),
            # FORMATION TIER: 0 a lone unit, 1 a Corps or Fleet, 2 an Army or
            # Armada. A tier holds `tier + 1` units and never comes apart.
            ("formation", torch.long),
            # IN AN ESCORT FORMATION with the military unit on its own tile —
            # the CIVILIAN half carries it, and the tile names the escort.
            ("escorted", torch.bool),
            # CIV6 (The Raven King): this unit came from a city-state LEVY.
            # Nothing here returns a levied unit, so the mark is permanent and
            # survives an upgrade — which is what makes the 75% upgrade
            # discount meaningful (C-66).
            ("levied", torch.bool),
        ):
            _base = torch.zeros(B, self.UNIT_MAX, dtype=_dt, device=device)
            setattr(self, f"unit_{_pl}", _base)
            self._UNIT_PLANES.append(_pl)
            for _pre in ("major", "barb"):
                setattr(self, f"{_pre}_unit_{_pl}", _base[:, self.POOL_LO[_pre]:self.POOL_HI[_pre]])
                self.register_alias(
                    f"{_pre}_unit_{_pl}",
                    lambda sim, pl=_pl, pre=_pre: getattr(sim, f"unit_{pl}")[
                        :, sim.POOL_LO[pre]:sim.POOL_HI[pre]
                    ],
                )
        self.unit_level.fill_(1)  # a brand-new unit starts at level 1
        self.unit_gp_at.fill_(-1)
        self.unit_revealed_turn.fill_(-1)
        self.unit_spy_mission.fill_(self._spy_idle)
        self.unit_spy_target.fill_(-1)
        self.barb_unit_seat.fill_(BARB_SEAT)
        self.major_unit_seat.fill_(1)

        self.unit_next = torch.zeros(B, dtype=torch.long, device=device)
        self.military_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.civilian_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        # CIV6 (Movement, "Stacking"): "Embarked units are also considered a
        # separate class, and may stack with both a military ship and an
        # Admiral" — so a water tile holds a hull, an Admiral and ONE
        # passenger, and the passenger needs a plane of its own.
        self.embarked_at = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.gp_earned = torch.zeros(B, n_gp, dtype=torch.long, device=device)
        # the FROZEN offer per class (`GameState.gpOffer`): a roster index,
        # -1 = a draw is pending, -2 = exhausted for good; and the price
        # frozen with it.
        self.gp_offer = torch.full((B, n_gp), -1, dtype=torch.long, device=device)
        self.gp_price = torch.zeros(B, n_gp, dtype=torch.float64, device=device)
        # who PASSED on the standing offer, per class (-1 nobody): the passer
        # is locked out of THAT individual, the claim resets the cell
        self.gp_passed_by = torch.full((B, n_gp), -1, dtype=torch.long, device=device)
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
        self.enh_claimed = torch.zeros(B, max(len(_bl.get("enhancers", [])), 1), dtype=torch.bool, device=device)
        self._enh_any = len(_bl.get("enhancers", [])) > 0
        # Religious pressure spread. A religion is indexed by the MAJOR SEAT
        # that founded it, so there are exactly `n_majors` of them and group g
        # IS seat g. holy_tile[:, g] = religion g's frozen holy tile (its
        # founding capital centre) or -1. The per-city integer pressure
        # accumulators and the followed religion id (-1 = none) live on the city
        # block below. Dead/absent slots are zeroed each turn, mirroring the TS
        # fresh-object reset on founding/flip.
        self._pressure_range = int(rr.get("pressureRange", 10))  # a following city's spread radius
        # CIV6 (GlobalParameters, the RELIGION_SPREAD_* rows): what one following
        # city presses per turn, the Holy City's and a Holy Site city's steps,
        # the atheism baseline per citizen and the Holy City's founding grant
        self._pressure_per_turn = int(rr["pressurePerTurn"])
        self._holy_city_mult = int(rr["holyCityMult"])
        self._holy_site_mult = int(rr["holySiteMult"])
        self._atheism_per_pop = int(rr["atheismPerPop"])
        self._holy_founding_per_pop = int(rr["holyCityFoundingPerPop"])
        self._route_dest_pressure = float(rr["routeDestPressure"])
        self._route_origin_pressure = float(rr["routeOriginPressure"])
        # pressure -> yields coupling. True: a city's FOLLOWER-belief yields key
        # on its own followedReligion (city_followed). False: on the owning
        # seat's religion.
        self._b18_couple = bool(rr.get("followerCoupling", False))
        self.holy_tile = torch.full((B, self.n_majors), -1, dtype=torch.long, device=device)
        # ONE religion plane pair over every seat row — seat 0 is a row like any
        # other, matching TS's single `allCities(state)` loop over one
        # religionPressure field.
        self.city_pressure = torch.zeros(B, self.n_majors + s_pad, civ_city_pad, self.n_majors, dtype=torch.long, device=device)
        # THE GOVERNOR ROSTER, one slot per catalog governor per major row.
        # The neutralize clock follows the PERSON, not the city — a governor a
        # spy turns out keeps counting down in the Palace.
        _ng = max(1, self.n_governors)
        self.civ_gov_appointed = torch.zeros(B, self.n_majors, _ng, dtype=torch.bool, device=device)
        self.civ_gov_city = torch.full((B, self.n_majors, _ng), -1, dtype=torch.long, device=device)
        # the CITY-STATE this governor is posted to, by roster index (-1 =
        # none). Only the catalog's `_gov_minor_ok` rows ever hold one.
        # governor titles a TRIBAL VILLAGE granted outright — nothing derives
        # them, so they need a store, and it is MUTABLE (C-47)
        self.civ_granted_titles = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        self.civ_gov_minor = torch.full((B, self.n_majors, _ng), -1, dtype=torch.long, device=device)
        self.civ_gov_establish = torch.zeros(B, self.n_majors, _ng, dtype=torch.long, device=device)
        self.civ_gov_out = torch.zeros(B, self.n_majors, _ng, dtype=torch.long, device=device)
        self.civ_gov_promos = torch.zeros(B, self.n_majors, _ng, dtype=torch.long, device=device)
        # the per-SEAT Gain Sources clock (a spy of that seat operates higher here)
        self.city_spy_sources = torch.zeros(B, self.n_majors + s_pad, civ_city_pad, self.n_majors, dtype=torch.long, device=device)
        self.city_followed = torch.full((B, self.n_majors + s_pad, civ_city_pad), -1, dtype=torch.long, device=device)
        self._bel = {}
        for _pool, _rows in (("pan", _bl.get("pantheons", [])), ("fol", _bl.get("followers", [])), ("fou", _bl.get("founders", []))):
            _nf = len(_rows[0]["featY"]) if _rows else 1
            _nb = len(_rows[0]["bldgY"]) if _rows else 1
            _ng = len(_rows[0]["gpp"]) if _rows else 1
            _ni = len(_rows[0]["impY"]) if _rows and "impY" in _rows[0] else 1
            _nad = len(_rows[0]["distAdj"]) if _rows else 1
            _nas = len(_rows[0]["distAdj"][0]) if _rows else 1
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
                "impY": torch.tensor(
                    [[[0.0] * 6] * _ni] + [x.get("impY", [[0.0] * 6] * _ni) for x in _rows],
                    dtype=torch.float64, device=device,
                ),
                # the ADJACENCY a belief hands a district type, [district,
                # source] — additive, so the pad row is zeros
                "distAdj": torch.tensor(
                    [[[0.0] * _nas] * _nad] + [x["distAdj"] for x in _rows],
                    dtype=torch.float64, device=device,
                ),
            }
        self._bel_any = any(len(_bl.get(k, [])) > 0 for k in ("pantheons", "followers", "founders"))
        # Each adjacency source as the FEATURE / the TERRAIN it names, -1 where
        # it is neither. `_district_adj_raw` reads the district catalog's own
        # sources off the static export; a BELIEF names one the export never
        # counted, so those are counted live from these two tables.
        self._adj_src_feat = [int(x) for x in _bl.get("adjSrcFeat", [])]
        self._adj_src_terr = [int(x) for x in _bl.get("adjSrcTerr", [])]
        # ...and the sources any belief row actually names, per district type.
        self._bel_adj_srcs: dict[int, list[int]] = {}
        if self._bel_any:
            _tot = sum(self._bel[_p]["distAdj"].abs().sum(dim=0) for _p in ("pan", "fol", "fou"))
            for _di, _src in (_tot > 0).nonzero(as_tuple=False).tolist():
                self._bel_adj_srcs.setdefault(int(_di), []).append(int(_src))
        for _di, _srcs in self._bel_adj_srcs.items():
            for _s in _srcs:
                assert self._adj_src_feat[_s] >= 0 or self._adj_src_terr[_s] >= 0, (
                    f"a belief hands district {_di} adjacency source {_s}, which names "
                    "neither a feature nor a terrain — _adj_src_count cannot count it")
        _erows = _bl.get("enhancers", [])
        # The missionary chassis anchors + per-enhancer channels. The exporter
        # pre-rounds mcost/mlump to INTEGERS (Math.round on the TS side), so
        # both engines read the identical value; the pad row (index 0 = no
        # enhancer) carries the BASE cost/lump, unlike the additive zero pads of
        # the other channels.
        _mcost0 = float(_bl["missionaryCost"])
        _mlump0 = int(_bl.get("spreadPressure", 10))
        self._missionary_idx = int(_bl.get("missionaryIdx", -1))
        self._missionary_cap = int(_bl.get("missionaryCap", 2))
        self._apostle_idx = int(_bl.get("apostleIdx", -1))
        self._apostle_cost = float(_bl["apostleCost"])
        self._apostle_cap = int(_bl.get("apostleCap", 1))
        self._inquisitor_idx = int(_bl.get("inquisitorIdx", -1))
        self._inquisitor_cost = float(_bl["inquisitorCost"])
        self._inquisitor_cap = int(_bl.get("inquisitorCap", 2))
        self._monk_idx = int(_bl.get("warriorMonkIdx", -1))
        self._monk_cost = float(_bl["warriorMonkCost"])
        self._monk_follower = int(_bl.get("warriorMonkFollower", -1))
        self._inquisitor_home_strength = int(_bl.get("inquisitorHomeStrength", 35))
        self._remove_heresy_pct = int(_bl.get("removeHeresyPct", 75))
        self._launch_inquisition_charges = int(_bl.get("launchInquisitionCharges", 3))
        self._condemn_range = int(_bl.get("condemnPressureRange", 6))
        self._condemn_swing = int(_bl.get("condemnPressureSwing", 7))
        _rs = _bl.get("relStrength") or []
        self._rel_strength = torch.tensor(list(_rs) + [0] * 64, dtype=torch.long, device=device)
        self._city_rel_live = bool(_bl.get("cityReligionAdderLive", False))
        self._theo_swing = float(_bl.get("theoPressureSwing", 15))
        self._theo_range = int(_bl.get("theoPressureRange", 6))
        self._relig_heal_per_faith = int(_bl.get("religiousHealPerFaith", 3))
        self._theo_holy_ground = int(_bl.get("theoHolyGround", 5))
        self._theo_holy_city = int(_bl.get("theoHolyCity", 15))
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
        self._proj_didx = torch.tensor([int(p.get("d", -1)) for p in self._proj_rows]
                                       or [-1], dtype=torch.long, device=device)
        self._proj_yf = float(_pj.get("yieldFraction", 0.15))
        self._proj_gf = float(_pj.get("gppFraction", 0.22))
        # The space-race chain. Space rows carry sp/vic flags (+ rt tech gate,
        # rp previous-step link) and sit LAST in the projects table, in chain
        # order. space_proj_idx = the projects-table rows that are space steps;
        # space_step maps a row idx to its 0-based position in the chain;
        # space_victory_idx = the winning step(s). Mirrors cpu/data/projects.ts
        # the one-time ledger + completeProject.
        self._once_proj_idx = [i for i, row in enumerate(self._proj_rows) if int(row["one"])]
        self._n_once = len(self._once_proj_idx)
        self._once_step = {pi: k for k, pi in enumerate(self._once_proj_idx)}
        self._once_victory_idx = {i for i in self._once_proj_idx if int(self._proj_rows[i].get("vic", 0))}
        # the SPACE-RACE subset, which is what a Great Engineer's space
        # production acts on — a one-time project elsewhere is not one.
        self._space_proj_idx = [i for i, row in enumerate(self._proj_rows) if int(row["spc"])]
        # the two space steps with a side effect of their own, addressed by ROW
        # rather than by chain position - the ledger now holds more than the
        # space chain.
        self._proj_reveal_idx = self._space_proj_idx[0] if len(self._space_proj_idx) > 0 else -1
        self._proj_moon_idx = self._space_proj_idx[1] if len(self._space_proj_idx) > 1 else -1
        # Laser-station rows: repeatable, gated on the tech AND the finished
        # expedition, each completion speeding the craft by +1 LY/turn. The
        # ORBITAL one (`orb`) pays unconditionally; the terrestrial one draws
        # `laser_power_load` from the city it stands in and pays only while
        # that city is powered — cpu/data/projects.ts.
        self._laser_proj_idx = {i for i, row in enumerate(self._proj_rows) if int(row.get("ls", 0))}
        self._orbital_proj_idx = {i for i in self._laser_proj_idx if int(self._proj_rows[i].get("orb", 0))}
        # The REPAIR row, whose production pays the perimeter as it accrues.
        self._repair_proj_idx = next(
            (i for i, row in enumerate(self._proj_rows) if int(row.get("rep", 0))), -1)
        _wd = rules.wonders or {}
        self._wond_rows = list(_wd.get("rows", []))
        self._wond_n = len(self._wond_rows)
        self._fp_fid = int(_wd.get("fpFid", -1))
        self.built_wonder = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.built_wonder_complete = torch.zeros(B, T, dtype=torch.bool, device=device)
        self.city_wonder = torch.full((B, self.n_majors, civ_city_pad, max(self._wond_n, 1)), -1, dtype=torch.long, device=device)
        self.res_id = torch.tensor([[t.get("rid", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.desert = torch.tensor([[t.get("des", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.terrain = torch.tensor([[t["terr"] for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.wok = torch.tensor([[t.get("wok", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        if self._wond_n:
            self._wond_cy = torch.tensor([w["cy"] for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW, 6]
            self._wond_mult = torch.tensor([w["mult"] for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW, 6]
            self._wond_grow = torch.tensor([w["growAll"] for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW]
            # wonderRegionalAmenities — amenities a COMPLETE wonder pays to every
            # same-seat city centre within regional_range (Colosseum 3). Reaches
            # the tier balance only, never the luxury ranking's baseHave
            # (city.ts luxuryAmenities).
            self._wond_regam = torch.tensor([float(w["regionalAmenities"]) for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW]
            # ...and the ones a wonder pays only to the city that holds it.
            self._wond_cityamen = torch.tensor([float(w["cityAmenities"]) for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW]
            self._wond_cityhouse = torch.tensor([float(w["cityHousing"]) for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW]
            self._wond_faithflood = torch.tensor([float(w.get("faithPerFlood", 0)) for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW]
            self._wond_dvp = torch.tensor([int(w["dvp"]) for w in self._wond_rows], dtype=torch.long, device=device)  # [nW] DVP paid at completion
            self._wond_grant_unit = torch.tensor([int(w.get("grantUnit", -1)) for w in self._wond_rows], dtype=torch.long, device=device)  # [nW] unit granted FREE at completion
            self._wond_bonusres_gold = torch.tensor([float(w["bonusResRouteGold"]) for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW] gold per bonus resource on outgoing routes
            self._wond_routes_sci = torch.tensor([float(w["routesToSci"]) for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW] science per route TO the city
            self._wond_routes_faithdom = torch.tensor([float(w["routesToFaithDom"]) for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW] faith per own DOMESTIC route to it
            self._wond_sender_sci = torch.tensor([float(w["routesToSenderSci"]) for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW] the foreign SENDER's science
            self._wond_sender_gold = torch.tensor([float(w["routesToSenderGold"]) for w in self._wond_rows], dtype=torch.float64, device=device)  # [nW] ...and gold
            self._wond_grant_prophet = torch.tensor([bool(w.get("grantProphet", 0)) for w in self._wond_rows], dtype=torch.bool, device=device)
            self._wond_rival_sci = torch.tensor([bool(w.get("rivalSciBoost", 0)) for w in self._wond_rows], dtype=torch.bool, device=device)
            self._wond_religion_site = torch.tensor([bool(w.get("religionSite", 0)) for w in self._wond_rows], dtype=torch.bool, device=device)
            # CIV6 (Biosphere): every renewable Power source the seat holds pays
            # `_biosphere_mult` times its published figure.
            self._wond_renew_power = torch.tensor([bool(w.get("renewablePower", 0)) for w in self._wond_rows], dtype=torch.bool, device=device)
            # Policy slots [nW, 4] in SLOT_KINDS order (military, economic,
            # diplomatic, wildcard) — the counts `_gov_policy_mods` adds.
            self._wond_slots = torch.tensor([list(w["slots"]) for w in self._wond_rows], dtype=torch.long, device=device)
            # Great Person points per turn [nW, nGpClasses], parallel to the
            # GP class roster.
            self._wond_gpp = torch.tensor([list(w["gpp"]) for w in self._wond_rows], dtype=torch.float64, device=device)
            # Terrain/feature-keyed tile yields. One (terr, feat, xfeat, emp,
            # y[6]) rule per entry, flattened with the wonder index it came
            # from so the yield walk can loop over rules, not wonders.
            self._wond_tiley = [
                (wi, int(r["terr"]), int(r["feat"]), int(r["xfeat"]), bool(r["emp"]),
                 torch.tensor(list(r["y"]), dtype=torch.float64, device=device))
                for wi, w in enumerate(self._wond_rows) for r in w["tiley"]
            ]
            # Amenity-per-improvement (Temple of Artemis): improvement indices
            # and the reach, per wonder.
            self._wond_amen_imp = [(wi, list(w["amenImp"]), int(w["amenImpRange"]))
                                   for wi, w in enumerate(self._wond_rows) if w["amenImp"]]
            # Ruhr Valley: the improvements the HOLDING city is paid a yield
            # for, and that yield [6], per wonder that names any.
            self._wond_imp_yield = [
                (wi, list(w["impY"]), torch.tensor(list(w["impYYields"]), dtype=torch.float64, device=device))
                for wi, w in enumerate(self._wond_rows) if w["impY"]]
            # Great Library: boost every technology up to this era, -1 = none.
            self._wond_boost_era = torch.tensor([int(w["boostTechEra"]) for w in self._wond_rows], dtype=torch.long, device=device)
            # Oracle: what each of the holding city's districts adds to its own class.
            self._wond_distgpp = torch.tensor([float(w["distGpp"]) for w in self._wond_rows], dtype=torch.float64, device=device)
            self._wond_patron = torch.tensor([float(w.get("patronPct", 0)) for w in self._wond_rows], dtype=torch.float64, device=device)
            self._wond_envoy = torch.tensor([int(w["envoysPerWonder"]) for w in self._wond_rows], dtype=torch.long, device=device)
            self._wond_spread = torch.tensor([int(w["spreadCharges"]) for w in self._wond_rows], dtype=torch.long, device=device)
            self._wond_build_ch = torch.tensor([int(w["buildCharges"]) for w in self._wond_rows], dtype=torch.long, device=device)
            self._wond_eng_ch = torch.tensor([int(w.get("engineerCharges", 0)) for w in self._wond_rows], dtype=torch.long, device=device)
            self._wond_martyr = torch.tensor([bool(w["apostleMartyr"]) for w in self._wond_rows], dtype=torch.bool, device=device)
            self._wond_floodmit = torch.tensor([bool(w["floodMitigation"]) for w in self._wond_rows], dtype=torch.bool, device=device)
            self._wond_dupnaval = torch.tensor([bool(w["dupNaval"]) for w in self._wond_rows], dtype=torch.bool, device=device)
            self._wond_relictour = torch.tensor([float(w["relicTourismMult"]) for w in self._wond_rows], dtype=torch.float64, device=device)
            self._wond_resorttour = torch.tensor([float(w["resortTourismMult"]) for w in self._wond_rows], dtype=torch.float64, device=device)
            self._wond_holy_shield = torch.tensor([bool(w.get("holyShield", 0)) for w in self._wond_rows], dtype=torch.bool, device=device)
            self._wond_loyalty = torch.tensor([int(w["loyaltyAura"]) for w in self._wond_rows], dtype=torch.long, device=device)
            self._wond_occdef = torch.tensor([int(w["occupyDefense"]) for w in self._wond_rows], dtype=torch.long, device=device)
            self._wond_freeciv = torch.tensor([int(w["freeCivics"]) for w in self._wond_rows], dtype=torch.long, device=device)
            self._wond_freetech = torch.tensor([int(w["freeTechs"]) for w in self._wond_rows], dtype=torch.long, device=device)
            self._wond_treasury = torch.tensor([float(w["treasuryMult"]) for w in self._wond_rows], dtype=torch.float64, device=device)
            self._wond_erascore = torch.tensor([int(w["eraScorePerMoment"]) for w in self._wond_rows], dtype=torch.long, device=device)
            # Per-wonder Great Work slots [nW, 3] in kind order (writing, art,
            # music), additive with the GW_BUILDINGS slots.
            self._wond_gw = torch.tensor([list(w.get("gwslots", [0, 0, 0])) for w in self._wond_rows], dtype=torch.long, device=device)
            # Per-wonder RELIC slots [nW], additive with the relic building's.
            self._wond_relic = torch.tensor([int(w["relicslots"]) for w in self._wond_rows], dtype=torch.long, device=device)
        self.feat_id = torch.tensor([[t.get("fid", -1) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self.feat_removable = torch.tensor([[bool(t.get("frm", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        # ONE roster: a natural wonder is a FEATURE row, and this plane is a
        # VIEW of `feat_id` through the catalog flag — never a wire field of
        # its own. `wonder_near` is its neighbourhood closure (the ASTROLOGY
        # eureka's "near a wonder").
        self._feat_natural = torch.tensor([bool(x) for x in rules.improvements["featNatural"]], dtype=torch.bool, device=device)
        self._feat_cat_y = torch.tensor(rules.improvements["featCatalogY"], dtype=self.dtype, device=device)
        # `feat_id` is LIVE (`_add_feature` writes it); `feat_id0` keeps the
        # t0 bake the per-tile `feat_yields`/chop planes were computed from.
        self.feat_id0 = self.feat_id.clone()
        self.nwonder = self._feat_natural[self.feat_id.clamp(min=0)] & (self.feat_id >= 0)
        _nwn = self.neigh.reshape(1, -1).expand(B, -1).clamp(min=0)
        _nwv = (self.nwonder.gather(1, _nwn) & (self.neigh.reshape(1, -1) >= 0)).reshape(B, T, 6)
        self.wonder_near = self.nwonder | _nwv.any(dim=2)
        # CIV6: the civilization each seat plays (`Seat.civ`), fixed at seed time
        # per GAME: the seeder draws which roster rows a world seats
        _row_pair = [[-1] * self.NS for _ in fixtures]
        for b, f in enumerate(fixtures):
            for cv in f["civs"]:
                row = int(cv["seat"])
                self.civ_alive[b, row] = True
                self.civ_aggression[b, row] = cv.get("aggression", 0.0)
                _row_pair[b][row] = int(cv["leader"])
                # Nothing is pre-founded — `cities` is [] and every city arrives
                # through a FOUND verb; the loop stays for the shape.
                for j, rc in enumerate(cv.get("cities", [])):
                    self.city_alive[b, row, j] = True
                    self.city_center[b, row, j] = rc["center"]
                    self.city_pop[b, row, j] = rc["pop"]
                    self.city_hp[b, row, j] = rr.get("cityMaxHp", 200)
                    self.city_id[b, row, j] = rc["id"]
                    self.centre_slot_at[b, rc["center"]] = j
                self.civ_next_city_id[b, row] = len(cv.get("cities", []))
        # [person era, eras the world is BEHIND that person] -> GPP price,
        # floored by the exporter so both engines read the same doubles.
        self._gp_cost_table = torch.tensor(
            rr.get("gpCostTable", [[60] * 9] * 9), dtype=torch.float64, device=device)
        self._gp_roster = torch.tensor(rr.get("gpRoster", [4, 4, 4, 4, 4]), dtype=torch.long, device=device)
        # who is CLAIMED, per (class, roster position) — the draw pool's
        # complement (`GameState.claimedGreatPeople`)
        self.gp_claimed = torch.zeros(B, n_gp, int(self._gp_roster.max()) if self._gp_roster.numel() else 1,
                                      dtype=torch.bool, device=device)
        self._gp_flat_cost = torch.tensor(
            rr.get("gpFlatCost", [0] * n_gp), dtype=torch.bool, device=device)
        gp_cd = rr.get("gpClassDistrict", [])
        self._gp_class_district = torch.tensor(gp_cd if gp_cd else [-1] * n_gp, dtype=torch.long, device=device)
        # THE PERSON'S OWN ROW. `gpFx` names the dense columns and the two
        # permanent runs ride its tail, so nothing here writes a position down.
        self._gp_fx_names = list(rr.get("gpFx", []))
        self._gp_perm_names = list(rr.get("gpPermKeys", []))
        self._gp_city_perm_names = list(rr.get("gpCityPermKeys", []))
        # A Great Person's city APPEAL grant moves `_tile_appeal`, which is
        # `_eff_version`-cached — the claim has to say so, and only this
        # column can make it necessary.
        self._gp_appeal_col = (self._gp_city_perm_names.index("appeal")
                               if "appeal" in self._gp_city_perm_names else -1)
        self._GPFX = {n: i for i, n in enumerate(self._gp_fx_names)}
        self._GP_PERM0 = len(self._gp_fx_names)
        self._GP_CPERM0 = self._GP_PERM0 + len(self._gp_perm_names)
        _fxw = self._GP_CPERM0 + len(self._gp_city_perm_names)
        gp_fx = rr.get("gpEffects", []) or [[[0] * max(1, _fxw)] * 4] * n_gp
        gp_ea = rr.get("gpEra", []) or [[0] * len(c) for c in gp_fx]
        _maxN = max(1, max(len(c) for c in gp_fx))
        _fxw = max(_fxw, max((len(r) for c in gp_fx for r in c), default=1))
        # the rosters are RAGGED (each class has as many people as its page
        # names); pad to the widest and let `_gp_roster` gate the tail.
        self._gp_effects = torch.tensor(
            [c + [[0] * _fxw] * (_maxN - len(c)) for c in gp_fx], dtype=dtype, device=device)  # [n_gp, maxN, fxw]
        self._gp_era = torch.tensor(
            [c + [0] * (_maxN - len(c)) for c in gp_ea], dtype=torch.long, device=device)

        def _gp_pad(key: str, fill: int) -> torch.Tensor:
            rows = rr.get(key, []) or [[fill] * _maxN for _ in range(n_gp)]
            return torch.tensor([c + [fill] * (_maxN - len(c)) for c in rows], dtype=torch.long, device=device)

        self._gp_site = _gp_pad("gpSite", 0)               # GP_SITES index
        self._gp_site_district = _gp_pad("gpSiteDistrict", -1)
        self._gp_charges = _gp_pad("gpCharges", 1)
        self._gp_scientist = int(rr["gpScientist"])
        # the NAMED eurekas and the instant buildings, catalog bitmasks
        _eu = rr.get("gpEureka", [])
        _bl_gp = rr.get("gpBuildings", [])
        _euw = max((len(r) for c in _eu for r in c), default=1)
        _blw = max((len(r) for c in _bl_gp for r in c), default=1)
        self._gp_eureka = torch.tensor(
            [c + [[0] * _euw] * (_maxN - len(c)) for c in _eu] if _eu
            else [[[0] * _euw] * _maxN for _ in range(n_gp)], dtype=torch.bool, device=device)
        self._gp_bldg = torch.tensor(
            [c + [[0] * _blw] * (_maxN - len(c)) for c in _bl_gp] if _bl_gp
            else [[[0] * _blw] * _maxN for _ in range(n_gp)], dtype=torch.bool, device=device)
        self._gp_class_unit = torch.tensor(
            rr.get("gpClassUnitIdx", [-1] * n_gp), dtype=torch.long, device=device)
        self._gp_work_class = [bool(x) for x in rr.get("gpWorkClasses", [0] * n_gp)]
        self._gp_any_fx = bool((self._gp_effects != 0).any()) if self._gp_effects.numel() else False
        self._prophet_cls = int(rr.get("prophetCls", 3))  # PROPHET's class index
        self._writer_cls = int(rr["writerCls"])  # WRITER's class index
        self._gp_engineer_cls = int(rr.get("engineerCls", -1))  # the Great ENGINEER's
        self._promo_max_level = int(rr.get("promoMaxLevel", 8))
        self._kill_spread_range = int(rr.get("killSpreadRange", 10))
        self._promo_xp_per_level = int(rr.get("promoXpPerLevel", 15))
        self._rainforest_fid = int(rr.get("rainforestFid", -1))
        self._gp_nc = int(self._gp_class_district.numel())
        # PERMANENT channels a spent Great Person leaves behind, the count of
        # charges actually spent (which is what a founded religion reads), and
        # the INVENTED luxuries — each entry how many cities that copy reaches,
        # with `civ_gp_lux_n` saying how many of the row are live.
        self.civ_gp_used = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        # how many of each CLASS this seat has been awarded — `Seat.gpEarned`
        # counted per class, which the roster's guarantee rows ask for
        self.civ_gp_earned = torch.zeros(B, self.n_majors, n_gp, dtype=torch.long, device=device)
        self.civ_gp_perm = torch.zeros(
            B, self.n_majors, max(1, len(self._gp_perm_names)), dtype=dtype, device=device)
        self.civ_gp_lux = torch.zeros(B, self.n_majors, simbase.GP_LUX_MAX, dtype=torch.long, device=device)
        self.civ_gp_lux_n = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        self._alloc_civ_pairs(B, self.n_majors, dtype, device)
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
        self._modern_era_index = int(rr.get("modernEraIndex", 5))
        self._artifact_bidx = int(rr.get("artifactBidx", -1))
        self._artifact_slots = int(rr.get("artifactSlots", 3))
        self._artifact_culture = int(rr.get("artifactCulture", 3))
        self._artifact_tourism = int(rr.get("artifactTourism", 3))
        # every slot an Artifact can STAND in per city — the museum's own
        # plus the whole any-work pool; the provenance arrays' width.
        self._artifact_prov_w = max(int(rr.get("artifactProvW", self._artifact_slots)), 1)
        self._theming_mult = int(rr["themingMult"])
        self._artist_works = [[int(x) for x in w] for w in rr.get("artistWorks", [])]
        _ri = rules.improvements or {}
        self._park_min_appeal = int(_ri["parkMinAppeal"])
        self._park_amen_owner = int(_ri["parkAmenitiesOwner"])
        self._park_amen_near = int(_ri["parkAmenitiesNear"])
        self._park_amen_cities = int(_ri["parkAmenityCities"])
        self._shipwreck_civic = int(_ri["shipwreckCivic"])
        self._relic_bidx = int(rr.get("relicBidx", -1))
        self._relic_slots = int(rr.get("relicSlots", 1))
        self._relic_faith = int(rr.get("relicFaith", 4))
        self._relic_tour = int(rr.get("relicTourism", 8))
        self._gw_cul_k = [float(x) for x in rr.get("gwCultureByKind", [2, 2, 4])]
        self._gw_tour_k = [int(x) for x in rr.get("gwTourismByKind", [2, 2, 4])]
        self._gw_printing_tech = int(rr.get("gwPrintingTech", -1))
        self._gw_printing_mult = int(rr.get("gwPrintingWritingMult", 2))
        self._wonder_tour_base = int(rr.get("wonderTourismBase", 2))
        self._tourism_per_visitor = int(rr.get("tourismPerVisitorPerCiv", 200))
        # (building idx, district idx, venue value) — the exporter carries the
        # district because no other wire row does
        self._band_venue = [(int(_b), int(_d), int(_v))
                            for _b, _d, _v in rr.get("rockBandVenues", [])
                            if int(_b) >= 0 and int(_d) >= 0]
        self._band_wonder_venue = int(rr.get("rockBandWonderVenue", 1000))
        self._band_tiers = torch.tensor(rr.get("rockBandTiers", []), dtype=torch.long, device=device)
        self._band_odds = torch.tensor(rr.get("rockBandOdds", []), dtype=torch.long, device=device)
        self._band_max_level = int(rr.get("rockBandMaxLevel", 4))
        self._band_max_promos = int(rr["rockBandMaxPromotions"])
        # the venue KIND bits a band promotion's mask names, and the districts
        # among them as (bit, district idx)
        self._band_venue_bits = {str(_k): int(_v) for _k, _v in rr["bandVenueBits"].items()}
        self._band_venue_districts = [(int(_b), int(_d)) for _b, _d in rr["bandVenueDistricts"] if int(_d) >= 0]
        self._concert_share_range = int(rr["concertShareRange"])
        self._band_cost_step = int(rr["rockBandCostStep"])
        self._naturalist_cost_step = int(rr["naturalistCostStep"])
        self._holy_city_tour = int(rr.get("holyCityTourism", 8))
        self._enl_cidx = int(rr.get("enlightenmentCidx", -3))
        self._culture_per_tourist = int(rr.get("culturePerDomesticTourist", 100))
        self._tech_era = torch.tensor(rr.get("techEra", []) or [0], dtype=torch.long, device=device)
        self._civic_era = torch.tensor(rr.get("civicEra", []) or [0], dtype=torch.long, device=device)
        # the wonder CATALOG cost — `itemCost` reads a wonder off the catalog
        # and never its queued price, which is what "the ORIGINAL wonder
        # cost" means for the Builder's charge (C-55)
        self._wond_cost = torch.tensor(
            [float(w["cost"]) for w in self._wond_rows] or [0.0],
            dtype=torch.float64, device=device)
        _wera = (rules.wonders or {}).get("eras", []) or [0]
        self._wonder_era = torch.tensor(list(_wera), dtype=torch.long, device=device)
        self.antiquity = torch.zeros(B, self.T, dtype=torch.bool, device=device)
        # CIV6 (Coastal Lowlands): the sea has taken this tile FOREVER
        # (`Tile.submerged`). Open water for every rule that asks, and unusable
        # besides — it yields nothing and no citizen may work it.
        self.tile_submerged = torch.zeros(B, self.T, dtype=torch.bool, device=device)
        # A dig REMEMBERS its era and its civilization — the theming rule's
        # inputs travel with the Artifact out of the ground.
        self.antiquity_era = torch.full((B, self.T), -1, dtype=torch.long, device=device)
        self.antiquity_seat = torch.full((B, self.T), -1, dtype=torch.long, device=device)
        # SHIPWRECKS: the water dig, same provenance shape.
        self.shipwreck = torch.zeros(B, self.T, dtype=torch.bool, device=device)
        self.shipwreck_era = torch.full((B, self.T), -1, dtype=torch.long, device=device)
        self.shipwreck_seat = torch.full((B, self.T), -1, dtype=torch.long, device=device)
        # NATIONAL PARK membership: the ANCHOR tile that names this tile's
        # park (its cluster's lowest index), -1 where there is none.
        self.park = torch.full((B, self.T), -1, dtype=torch.long, device=device)
        self._loyalty_amenity = torch.tensor(rr.get("loyaltyAmenity", [6, 3, 0, -3, -6]), dtype=dtype, device=device)
        self._off3 = tiles_within_offsets(int(rr.get("workRadius", 3))).to(device)
        self._off5 = tiles_within_offsets(5).to(device)
        self._off7 = tiles_within_offsets(7).to(device)
        self._off2 = tiles_within_offsets(2).to(device)
        self._off1 = tiles_within_offsets(1).to(device)
        ids = [u["id"] for u in (rules.units or [])]
        self._spearman_idx = ids.index("SPEARMAN") if "SPEARMAN" in ids else 0
        self._horseman_idx = ids.index("HORSEMAN") if "HORSEMAN" in ids else 0
        self._slinger_idx = ids.index("SLINGER") if "SLINGER" in ids else -1
        self._archaeologist_idx = ids.index("ARCHAEOLOGIST") if "ARCHAEOLOGIST" in ids else -1
        self._naturalist_idx = next((i for i, u in enumerate(rules.units or []) if bool(u.get("naturalist", 0))), -1)
        self._band_idx = next((i for i, u in enumerate(rules.units or []) if u.get("id") == "ROCK_BAND"), -1)
        self._archer_idx = ids.index("ARCHER") if "ARCHER" in ids else -1

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
        # the PRODUCTION half of flood silt — real Civ 6 rolls food and
        # production separately, so the two accumulate apart.
        self.fertility_prod = torch.zeros(B, T, dtype=torch.long, device=device)
        # a CITIZEN is PINNED to this plot (Tile.locked): the work ranking takes
        # every locked plot a city can reach before it ranks anything by score.
        self.tile_locked = torch.zeros(B, T, dtype=torch.bool, device=device)
        # CIV6 (Marina Raskova): the permanent "+1 air unit slots" a retired
        # general leaves on a district tile (`Tile.airSlotBonus`)
        self.tile_air_bonus = torch.zeros(B, T, dtype=torch.long, device=device)
        self.drought = torch.zeros(B, T, dtype=torch.long, device=device)
        self._init_climate(fixtures)

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
            self._snipe_on = "SNIPE_0" in self._act
            self._snipe3_on = "SNIPE3_0" in self._act
            self._A_SPREAD = self._act.get("SPREAD_HERE", -1)  # religious spread head
            self._A_FOUND = self._act.get("FOUND_CITY", -1)  # the settler's verb
            self._A_EXCAVATE = self._act.get("EXCAVATE", -1)  # the archaeologist's
            self._A_PARK = self._act.get("PARK", -1)          # the naturalist's
            self._A_PROMOTE = self._act.get("PROMOTE_0", -1)  # the level-up head
            self._A_CONDEMN = self._act.get("CONDEMN_0", -1)  # vs an adjacent religious unit
            self._A_HERESY = self._act.get("REMOVE_HERESY", -1)
            self._A_INQUISITION = self._act.get("LAUNCH_INQUISITION", -1)
            self._A_HEATHEN = self._act.get("CONVERT_HEATHEN", -1)
            self._A_UPGRADE = self._act.get("UPGRADE", -1)   # the ladder's own verb
            self._A_AIR_STRIKE = self._act.get("AIR_STRIKE_0", -1)
            self._A_NUKE = self._act.get("NUKE_0_0", -1)   # one head per device row
            self._A_AIR_PILLAGE = self._act.get("AIR_PILLAGE_0", -1)
            self._A_REBASE = self._act.get("REBASE_0", -1)
            self._A_SPY_TRAVEL = self._act.get("SPY_TRAVEL_0", -1)
            self._A_SPY_MISSION = self._act.get("SPY_MISSION_0", -1)
            self._A_ROAD = self._act.get("BUILD_ROAD", -1)          # the engineer's
            self._A_RAIL = self._act.get("BUILD_RAILROAD", -1)       # ...and its second route
            self._A_CLEAN = self._act.get("CLEAN_FALLOUT", -1)       # a build charge against the fallout
            self._A_FINISH = self._act.get("FINISH_DISTRICT", -1)   # its 20% charge
            self._A_GP = self._act.get("ACTIVATE_GP", -1)           # the great person's
            self._A_PERFORM = self._act.get("PERFORM_CONCERT", -1)   # the rock band's
            self._A_BOOST = self._act.get("BOOST_PROJECT", -1)       # the Royal Society's
            self._A_FORM_UP = self._act.get("FORM_UP_0", -1)          # merge into a same-type neighbour
            self._A_ESCORT = self._act.get("ESCORT", -1)              # a civilian joins the tile's military unit
            self._A_UNESCORT = self._act.get("BREAK_ESCORT", -1)      # and leaves again
            self._A_REMOVE_IMP = self._act.get("REMOVE_IMPROVEMENT", -1)  # gone, not pillaged; no charge
            # CIV6 (Builder): the resource goes for its own lump (C-52)
            self._A_HARVEST = self._act.get("HARVEST", -1)
            # CIV6 (The First Emperor): a charge into the wonder underfoot (C-55)
            self._A_WONDER_CHARGE = self._act.get("WONDER_CHARGE", -1)
            # CIV6 (Mountain Tunnel): the portal step, 2 Movement (C-20)
            self._A_PORTAL = self._act.get("PORTAL", -1)
            self._air_strike_cols = sum(1 for n in self._act_names if n.startswith("AIR_STRIKE_"))
            _apc = sum(1 for n in self._act_names if n.startswith("AIR_PILLAGE_"))
            assert _apc in (0, self._air_strike_cols), (
                f"the air pillage head is {_apc} wide, the strike head {self._air_strike_cols}")
            self._air_rebase_cols = sum(1 for n in self._act_names if n.startswith("REBASE_"))
            self._nuke_cols = int((rules.nuclear or {}).get("nukeCols", 0))
            _nkc = sum(1 for n in self._act_names if n.startswith("NUKE_"))
            assert self._nuke_cols == 0 or _nkc % self._nuke_cols == 0, (
                f"the nuclear head is {_nkc} columns over a width of {self._nuke_cols}")
            _stc = sum(1 for n in self._act_names if n.startswith("SPY_TRAVEL_"))
            _smc = sum(1 for n in self._act_names if n.startswith("SPY_MISSION_"))
            assert _stc == self._spy_travel_cols and _smc == self._n_spy_missions, (
                f"spy heads are {_stc}/{_smc} wide, the wire says "
                f"{self._spy_travel_cols}/{self._n_spy_missions}")
            _want = 13 + len(ids) + 3 + (12 if self._snipe_on else 0) \
                + (18 if self._snipe3_on else 0) + (7 if self._A_SPREAD >= 0 else 0) \
                + (1 if self._A_FOUND >= 0 else 0) + (1 if self._A_EXCAVATE >= 0 else 0) \
                + (1 if self._A_PARK >= 0 else 0) \
                + (rules.promo_cols if self._A_PROMOTE >= 0 else 0) \
                + (6 if self._A_CONDEMN >= 0 else 0) \
                + (1 if self._A_HERESY >= 0 else 0) + (1 if self._A_INQUISITION >= 0 else 0)                 + (1 if self._A_HEATHEN >= 0 else 0) \
                + (1 if self._A_UPGRADE >= 0 else 0) \
                + (1 if self._A_ROAD >= 0 else 0) + (1 if self._A_FINISH >= 0 else 0) \
                + (1 if self._A_RAIL >= 0 else 0) \
                + (1 if self._A_CLEAN >= 0 else 0) \
                + (1 if self._A_REMOVE_IMP >= 0 else 0) \
                + (1 if self._A_HARVEST >= 0 else 0) \
                + (1 if self._A_WONDER_CHARGE >= 0 else 0) \
                + (1 if self._A_PORTAL >= 0 else 0) \
                + (1 if self._A_GP >= 0 else 0) \
                + (1 if self._A_PERFORM >= 0 else 0) \
                + (1 if self._A_BOOST >= 0 else 0) \
                + (6 if self._A_FORM_UP >= 0 else 0) \
                + (1 if self._A_ESCORT >= 0 else 0) \
                + (1 if self._A_UNESCORT >= 0 else 0) \
                + self._air_strike_cols + _apc + self._air_rebase_cols + _stc + _smc + _nkc
            assert len(self._act_names) == _want, f"unit action enum is {len(self._act_names)} wide, expected {_want} for {len(ids)} improvements"
            self._A_CHOP = self._act["CHOP"]
            self._A_REPAIR = self._act["REPAIR"]
            self._A_PILLAGE = self._act["PILLAGE"]
            self._A_SNIPE = self._act.get("SNIPE_0", self._A_PILLAGE + 1)
            self._A_SNIPE3 = self._act.get("SNIPE3_0", -1)
            self._A_IMP = [self._act.get(f"BUILD_{n}", -1) for n in ids]
        else:
            self._A_CHOP, self._A_REPAIR = 16, 17
            self._A_PILLAGE = 13 + len(ids) + 2
            self._A_SNIPE = self._A_PILLAGE + 1
            self._A_SPREAD = -1  # no names -> no spread columns
            self._A_FOUND = -1  # no names -> no FOUND column
            self._A_EXCAVATE = -1
            self._A_PARK = -1
            self._A_REMOVE_IMP = -1
            self._A_HARVEST = -1
            self._A_WONDER_CHARGE = -1
            self._A_PORTAL = -1
            self._A_PERFORM = -1
            self._A_BOOST = -1
            self._A_FORM_UP = -1
            self._A_ESCORT = -1
            self._A_UNESCORT = -1
            self._A_PROMOTE = -1
            self._A_CONDEMN = -1
            self._A_HERESY = -1
            self._A_INQUISITION = -1
            self._A_HEATHEN = -1
            self._A_UPGRADE = -1
            self._A_AIR_STRIKE = -1
            self._A_NUKE = -1
            self._nuke_cols = 0
            self._A_AIR_PILLAGE = -1
            self._A_REBASE = -1
            self._A_SPY_TRAVEL = -1
            self._A_SPY_MISSION = -1
            self._A_ROAD = -1
            self._A_FINISH = -1
            self._A_GP = -1
            self._air_strike_cols = 0
            self._air_rebase_cols = 0
            self._snipe_on = False
            self._snipe3_on = False
            self._A_SNIPE3 = -1
            self._A_IMP = [13 + i if i < 3 else 18 + i - 3 for i in range(len(ids))]
        self.FARM = ids.index("FARM") if "FARM" in ids else 0
        self.MINE = ids.index("MINE") if "MINE" in ids else -1        # -1 = not in scope
        self.LUMBER = ids.index("LUMBER_MILL") if "LUMBER_MILL" in ids else -1
        self.SEASIDE = ids.index("SEASIDE_RESORT") if "SEASIDE_RESORT" in ids else -1
        self.FORT = ids.index("FORT") if "FORT" in ids else -1
        self.TUNNEL = ids.index("MOUNTAIN_TUNNEL") if "MOUNTAIN_TUNNEL" in ids else -1
        # CIV6 (Pillaging): each improvement's plunder row — kind (0 none,
        # 1 heal, 2 gold, 3 faith, 4 science, 5 culture) and base amount.
        self._imp_plun_kind = torch.tensor(
            [int(r.get("plun", [0, 0])[0]) for r in imp.get("rows", [])] or [0], dtype=torch.long, device=device)
        self._imp_plun_amt = torch.tensor(
            [int(r.get("plun", [0, 0])[1]) for r in imp.get("rows", [])] or [0], dtype=torch.long, device=device)
        self._farm_food = float(imp.get("farmFood", 1))
        self._farm_housing = float(imp.get("farmHousing", 0.5))
        self._mine_prod = float(imp.get("mineProd", 1))       # base MINE production
        self._lumber_prod = float(imp.get("lumberProd", 1))   # LUMBER_MILL production (no tech boost)
        self._builder_idx = int(imp.get("builderIdx", -1))
        self._eng_idx = int(imp.get("engineerIdx", -1))
        self._seat_eng_live = bool(imp.get("engineerLive", False))
        self._eng_finish_frac = float(imp.get("engineerFinishFraction", 0.2))
        self._hillfarms_civic = int(imp.get("hillFarmsCivic", -1))
        self._farmadj_civic = int(imp.get("farmAdjCivic", -1))  # GS: Feudalism farm-adjacency +1 food
        self._farmadj_tech = int(imp.get("farmAdjTech", -1))    # GS: Replaceable Parts +1 more
        self._mine_unlock_tech = int(imp.get("mineUnlockTech", -1))       # MINING
        self._lumber_unlock_tech = int(imp.get("lumberUnlockTech", -1))   # CONSTRUCTION
        self._seaside_unlock_tech = int(imp.get("seasideUnlockTech", -1))  # RADIO
        self._seaside_min_appeal = int(imp.get("seasideMinAppeal", 4))     # BREATHTAKING
        # What RESEARCH adds to an improvement's own yields — the TS
        # `mods.improvementYields` map, which techs and civics both write.
        self._tech_imp_y = torch.tensor(imp.get("techImpY", [[[0.0] * 6]]), dtype=dtype, device=device)
        self._civic_imp_y = torch.tensor(imp.get("civicImpY", [[[0.0] * 6]]), dtype=dtype, device=device)
        self._research_imp_y_any = bool((self._tech_imp_y != 0).any() or (self._civic_imp_y != 0).any())
        # CIV6 (Lumber Mill): "+1 Production if adjacent to River."
        self._imp_river_y = torch.tensor(imp.get("impRiverY", [[0.0] * 6]), dtype=dtype, device=device)
        self._imp_river_any = bool((self._imp_river_y != 0).any())
        irows = imp.get("rows", [])
        nI = max(len(ids), 1)
        self._imp_yields = torch.zeros(nI, 6, dtype=dtype, device=device)
        self._imp_housing = torch.zeros(nI, dtype=dtype, device=device)
        self._imp_unlock = torch.full((nI,), -1, dtype=torch.long, device=device)
        for i, row in enumerate(irows):
            self._imp_yields[i] = torch.tensor(row["yields"], dtype=dtype)
            self._imp_housing[i] = float(row["housing"])
            self._imp_unlock[i] = int(row["unlock"])
        # THE SUZERAIN IMPROVEMENTS. Every clause is a catalog column: the
        # ground it may stand on, the ban on standing beside its own kind,
        # what its neighbours pay it, and the three tails (housing civic,
        # religious healing, tourism) it carries.
        self._imp_suz = [bool(r.get("suz", 0)) for r in imp["rows"]]
        # THE UNIQUE ROWS (`uniqueTo`): the civilization index, the civic that
        # opens the row beside `_imp_unlock`'s tech, the features it may stand
        # on, and the yields it pays while standing on one of `featY`'s.
        self._imp_uniq = [int(r["uniq"]) for r in imp["rows"]]
        self._imp_unlock_civic = [int(r["unlockCivic"]) for r in imp["rows"]]
        self._imp_feats_ok = [list(r["feats"]) for r in imp["rows"]]
        self._imp_feat_list = [list(r["featY"]["feats"]) if r["featY"] else [] for r in imp["rows"]]
        self._imp_feat_y = torch.tensor(
            [list(r["featY"]["y"]) if r["featY"] else [0.0] * 6 for r in imp["rows"]], dtype=dtype, device=device)
        self._imp_feat_any = any(self._imp_feat_list)
        self._imp_terr = [list(r.get("terr", [])) for r in imp["rows"]]
        self._imp_xterr = [list(r.get("xterr", [])) for r in imp["rows"]]
        self._imp_elev = [list(r.get("elev", [])) for r in imp["rows"]]
        self._imp_no_adj_same = [bool(r.get("noAdjSame", 0)) for r in imp["rows"]]
        self._imp_adj = [list(r.get("adj", [])) for r in imp["rows"]]
        self._imp_adj_live = any(self._imp_adj)
        self._imp_house_civic = torch.tensor(
            [int(r.get("houseCivic", -1)) for r in imp["rows"]], dtype=torch.long, device=device)
        self._imp_rel_heal = torch.tensor(
            [float(r.get("relHeal", 0)) for r in imp["rows"]], dtype=dtype, device=device)
        self._imp_tour_y = [int(r.get("tourY", -1)) for r in imp["rows"]]
        self._imp_tour_tech = [int(r.get("tourTech", -1)) for r in imp["rows"]]
        # THE MILITARY ENGINEER'S ROWS. `eng` marks the ones it — and only it —
        # builds; `noFeat` is the Fort's featureless-tile clause; `air` is what
        # an Airstrip bases; `appeal` is what ANY improvement takes off its
        # neighbours, the `DistrictDef.appealAdjacent` twin.
        self._imp_eng = [bool(r.get("eng", 0)) for r in imp["rows"]]
        self._imp_no_feat = [bool(r.get("noFeat", 0)) for r in imp["rows"]]
        # the ONE feature a row may stand on (-1 = free) — the Geothermal Plant
        self._imp_req_feat = [int(r.get("reqFeat", -1)) for r in imp["rows"]]
        self._imp_air_slots = torch.tensor(
            [int(r.get("air", 0)) for r in imp["rows"]], dtype=torch.long, device=device)
        self._imp_appeal_adj = torch.tensor(
            [int(r.get("appeal", 0)) for r in imp["rows"]], dtype=torch.long, device=device)
        self._imp_appeal_any = bool((self._imp_appeal_adj != 0).any())
        self._imp_air_any = bool((self._imp_air_slots > 0).any())
        # CIV6 (Solar Farm, Wind Farm): what a RENEWABLE generator supplies the
        # city that owns its plot, per turn.
        self._imp_power = torch.tensor(
            [float(r.get("power", 0)) for r in imp["rows"]], dtype=torch.float64, device=device)
        self._imp_power_any = bool((self._imp_power > 0).any())
        # The rows a Builder places on their own catalog GROUND alone — no
        # resource under them, no suzerainty, no appeal bar, not the
        # Engineer's (`validImprovementsIn`'s ground-only arm).
        self._imp_ground = [bool(r.get("gnd", 0)) for r in imp["rows"]]
        self._imp_ground_idx = [i for i, g in enumerate(self._imp_ground) if g]
        # a Builder row standing on WATER on its own terrain list alone
        self._imp_water = [bool(r.get("wtr", 0)) for r in imp["rows"]]
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
        # The Seaside Resort's STATIC half (flat G/P/D beside COAST, unpaved).
        # The live feature test reads the mutable pair directly — a chop makes
        # a tile eligible, an ARRIVED feature un-makes it, exactly as TS gates
        # on the LIVE tile.feature === null; the appeal test is dynamic and
        # runs off _tile_appeal().
        self._sr_c = torch.tensor([[t.get("sr_c", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
        self.improvement = torch.full((B, T), -1, dtype=torch.long, device=device)
        self.pillaged = torch.zeros(B, T, dtype=torch.bool, device=device)

        self.districts_cat = list(rules.districts or [])
        self.districts_on = bool(self.districts_cat)
        # -1 none, else PLACEABLE_DISTRICTS idx. CENTRES ARE NOT IN HERE —
        # they live in `centre_slot_at`, while TS keeps one `tile.district`
        # that `foundCity` sets to 'CITY_CENTER'. Every twin of a TS test that
        # reads `t.district` must therefore name BOTH planes.
        self.district = torch.full((B, T), -1, dtype=torch.long, device=device)
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
        self.encamp_outer_hp = torch.zeros(B, T, dtype=torch.long, device=device)
        # The ROAD plane (the TS `Tile.road` twin). Laid by trade routes; a
        # route-to-route step ignores the terrain penalty and pays its tier's
        # own cost, and every tier above the Ancient road drops the river
        # charge too (`road_tier`).
        self.road = torch.tensor(
            [[bool(t.get("rd", 0)) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )
        # CIV6: "all roads in your territory will upgrade to the next level
        # automatically" on reaching the era that brings the tier. Latched at
        # the era boundary, the site both engines already fire in lockstep.
        self.road_tier = 0
        self.district_pillaged = torch.zeros(B, T, dtype=torch.bool, device=device)
        nD = len(self.districts_cat)
        self.d_static_adj = torch.tensor(
            [[t.get("dadj", [0.0] * nD) for t in f["tiles"]] for f in fixtures],
            dtype=dtype, device=device,
        )
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
        # CIV6 (Continents): the landmass id per tile, -1 for water. A seat's
        # HOME continent is its ORIGINAL capital's (`civ_cap_tile`, which
        # deliberately does not move).
        self.tile_continent = torch.tensor(
            [[int(t.get("cont", -1)) for t in f["tiles"]] for f in fixtures],
            dtype=torch.long, device=device)
        # CIV6 (Mountain Tunnel): the connected MOUNTAIN component per tile, -1
        # off a mountain — "a movement portal on a mountain range" (C-20).
        self.tile_range = torch.tensor(
            [[int(t.get("mrange", -1)) for t in f["tiles"]] for f in fixtures],
            dtype=torch.long, device=device)
        self.tile_ftu = torch.tensor([[int(t.get("ftu", -1)) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        self._feat_adj = torch.tensor(
            [[t.get("fadj", [0.0] * nD) for t in f["tiles"]] for f in fixtures],
            dtype=dtype, device=device,
        )
        self._nfeat_adj = torch.tensor(
            [[t.get("nfadj", [0.0] * nD) for t in f["tiles"]] for f in fixtures],
            dtype=dtype, device=device,
        )
        sc = rules.district_scaffold or {}
        self.CAMPUS = int(sc.get("campusIdx", 0))
        self.campus_unlock_tech = int(sc.get("campusUnlockTech", -1))  # WRITING
        self._scaffold = [(int(p["idx"]), int(p["unlockTech"]), int(p.get("unlockCivic", -1)), int(p.get("placement", 0)), int(p.get("fixedCost", -1))) for p in sc.get("place", [])]  # (district idx, unlock tech idx, unlock CIVIC idx — at most one of the two >= 0, placement: 0 land / 1 aqueduct / 2 coastal / 3 encampment / 4 flat, fixed cost or -1 = the research curve)
        # VETERANCY's encampHarborProdMult needs the ENCAMPMENT and HARBOR
        # district idxs and scaffold slots (the queue head codes for the
        # district and its buildings — cpu/core/game.ts isEncampHarborItem).
        self._encamp_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "ENCAMPMENT"), -1)
        self._harbor_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "HARBOR"), -1)
        # The Urban Development Treaty ban on HOLY_SITE also refuses the
        # worship faith-buy (a purchase still CREATES the building).
        self._holy_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "HOLY_SITE"), -1)
        # What each district type does to its NEIGHBOURS' appeal, straight off
        # the catalog column (`tileAppeal`'s `appealAdjacent`) — no type is
        # named here, so a new district row carries its own term.
        self._appeal_adj = torch.tensor(
            [int(d.get("appealAdjacent", 0)) for d in self.districts_cat],
            dtype=torch.long, device=device)  # [nD]
        self._appeal_adj_any = bool((self._appeal_adj != 0).any())
        self._nbhd_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "NEIGHBORHOOD"), -1)
        # The columns the three per-district-type adjacency sources count.
        self._dam_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "DAM"), -1)
        self._canal_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "CANAL"), -1)
        self._govplaza_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "GOVERNMENT_PLAZA"), -1)
        self._appeal_cuts = [(4, 6), (2, 5), (-1, 4), (-3, 3)]
        self._appeal_floor = 2
        # the same five bands, as the CUTS alone — what `appealBand` returns and
        # the Preserve's housing table and the Grove's yield bands are keyed by.
        self._appeal_bands = [c for c, _v in sorted(self._appeal_cuts, reverse=True)]
        # the DISTRICT each production slot builds — a queue code is a SCAFFOLD
        # slot, so a row naming a district must come through here
        self._scaffold_di = torch.tensor([p[0] for p in self._scaffold] or [-1], dtype=torch.long, device=device)
        self._encamp_si = next((si for si, (di, _ut, _uc, _plc, _fc) in enumerate(self._scaffold) if di == self._encamp_didx), -1)
        self._harbor_si = next((si for si, (di, _ut, _uc, _plc, _fc) in enumerate(self._scaffold) if di == self._harbor_didx), -1)
        self._campus_active = bool(sc.get("active", 0))  # scaffold master on/off (mirrors exporter SCRIPTED_CAMPUS)
        # The seat-0 diplomacy head (declareWar / sueForPeace on a civ). While
        # False, war_mask() is all-False and step(war=…) is ignored, so nothing
        # samples or applies it; scripted/parity paths never pass war=.
        self._rl_war_active = True
        self._log_combat_b: int | None = None
        self._combat_events: list[str] = []
        self.d_usable = torch.tensor(
            [[t.get("du", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )
        self.aqsrc = torch.tensor(
            [[t.get("aqsrc", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )
        self.coastal_water = torch.tensor(
            [[t.get("cw", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device
        )  # [B, T] Harbor surface: coastal/lake water adjacent to land, static
        # CIV6 (Builder): a HARVESTED tile becomes the same tile with NO
        # resource. Every flag below is baked from `t.resource` at export
        # while TS recomputes it live, so the fixture ships each resource
        # tile's resource-free value in `nr` and the harvest copies it in.
        # A district pave never needed this: it hides the loss behind a
        # zero-yield district. Keyed by the plane the flag feeds (C-52).
        self._nr_planes: list[tuple[str, torch.Tensor]] = []
        _nr_map = (
            ("y", "tile_yields"), ("res", "res_priority"), ("res", "res_cat"),
            ("rid", "res_id"), ("rq", "res_imp"), ("sq", "site_q3"),
            ("lux", "lux_id"), ("luxreq", "lux_req"), ("du", "d_usable"),
            ("cw", "coastal_water"), ("ftr", "tile_ftr"), ("wh", "tile_wh"),
            ("fa_f", "farm_flat"), ("fa_h", "farm_hill"), ("mi", "mine_ok"),
            ("lu", "lumber_ok"), ("sr_c", "_sr_c"),
            ("fa_f_c", "_fa_f_c"), ("fa_h_c", "_fa_h_c"), ("mi_c", "_mi_c"),
        )
        # a key the table does not name would silently keep its resource-era
        # value on the harvested tile, so refuse the fixture instead
        _seen = {k for f in fixtures for t in f["tiles"] for k in t.get("nr", ())}
        _unmapped = _seen - {k for k, _ in _nr_map}
        assert not _unmapped, f"planes.ts `nr` carries unmapped keys {sorted(_unmapped)}"
        for _k, _plane in _nr_map:
            _live = getattr(self, _plane)
            _bare = _live.clone()
            for _b, _f in enumerate(fixtures):
                for _ti, _t in enumerate(_f["tiles"]):
                    _v = _t.get("nr", {}).get(_k)
                    if _v is not None:
                        _bare[_b, _ti] = torch.tensor(_v, dtype=_live.dtype, device=device)
            self._nr_planes.append((_plane, _bare))
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
        # CIV6 (GS Industrial Zone): "+2 Production for each adjacent Aqueduct,
        # Dam or Canal", and (Government Plaza) "+1 adjacency bonus to all
        # adjacent districts" — three more per-district-type sources, each
        # matching a COMPLETE district of that type on a neighbouring tile.
        self._dyn_dam = torch.tensor([_src_amt(d, 14) for d in self.districts_cat], dtype=dtype, device=device)  # [nD]
        self._dyn_canal = torch.tensor([_src_amt(d, 15) for d in self.districts_cat], dtype=dtype, device=device)  # [nD]
        self._dyn_govplaza = torch.tensor([_src_amt(d, 16) for d in self.districts_cat], dtype=dtype, device=device)  # [nD]
        # CIV6: an Aqueduct beside a Geothermal Fissure provides 1 Amenity —
        # an AMENITY per adjacent tile of one kind, which no yield row carries.
        self._d_amen_adj = [(int(d.get("amenAdj", (-1, 0))[0]), float(d.get("amenAdj", (-1, 0))[1]))
                            for d in self.districts_cat]
        self._d_amen_adj_any = any(s >= 0 and a != 0 for s, a in self._d_amen_adj)
        self._mine_iidx = 1   # IMPROVEMENT_IDS: FARM=0, MINE=1, LUMBER_MILL=2, QUARRY=3, ...
        self._quarry_iidx = 3
        # C-73: the wire's GOV_BONUS_TYPES order (cpu/data/policies.ts),
        # named so the payout switch reads as the mapping it is.
        (self.GB_WONDER, self.GB_COMBAT_XP, self.GB_GREAT_PEOPLE, self.GB_ENVOYS,
         self.GB_FAITH_BUY, self.GB_GOLD_BUY, self.GB_UNIT_PROD,
         self.GB_OVERALL_PROD, self.GB_DISTRICT_PROJ) = range(9)
        _govs = rules.governments or []
        _pols = rules.policies or []
        self._ngov = len(_govs)
        self._npol = len(_pols)
        # the cards a seat has SLOTTED — a DRIVER decision carried on the
        # wire. INERT this step: the record writes it and the compare reads it;
        # the greedy fill in `_slotted_policies` still pays every effect.
        self.civ_policies = torch.zeros(self.B, self.n_majors, max(self._npol, 1), dtype=torch.bool, device=device)
        if self._ngov:
            self._gov_tier = torch.tensor([int(g["tier"]) for g in _govs], dtype=torch.long, device=device)
            self._gov_intol = torch.tensor([int(g.get("intolerance", 0)) for g in _govs], dtype=torch.long, device=device)
            self._gov_unlock_civic = torch.tensor([int(g["unlockCivic"]) for g in _govs], dtype=torch.long, device=device)
            # C-63 (MODIFIER_PLAYER_GOVERNMENT_ACCUMULATING_BONUS): [nGov] each,
            # the bonus TYPE this government accumulates (-1 = none, the Chiefdom
            # alone), the percent per step and the turns per step.
            assert self.civ_gov_turns.shape[2] == self._ngov, "the clock's width is not the government roster's"
            self._gov_bonus_type = torch.tensor([int(g["bonus"][0]) for g in _govs], dtype=torch.long, device=device)
            self._gov_bonus_inc = torch.tensor([int(g["bonus"][1]) for g in _govs], dtype=torch.long, device=device)
            self._gov_bonus_int = torch.tensor([int(g["bonus"][2]) for g in _govs], dtype=torch.long, device=device)
            self._gov_slots = torch.tensor([[int(x) for x in g["slots"]] for g in _govs], dtype=torch.long, device=device)  # [nGov,4] m/e/d/w
            self._gov_city_y = torch.tensor([[float(x) for x in g["cityYields"]] for g in _govs], dtype=dtype, device=device)  # [nGov,6]
            self._gov_cap_y = torch.tensor([[float(x) for x in g["capitalYields"]] for g in _govs], dtype=dtype, device=device)  # [nGov,6]
            # housingAll: +housing to every city of the adopting seat.
            self._gov_housing = torch.tensor([float(g.get("housingAll", 0)) for g in _govs], dtype=dtype, device=device)  # [nGov]
            # yieldMult: tier-2/3 governments multiply one yield
            # (MERCHANT_REPUBLIC gold, THEOCRACY faith, DEMOCRACY culture,
            # COMMUNISM production).
            self._gov_ymult = torch.tensor([[float(x) for x in g.get("yieldMult", [1] * 6)] for g in _govs], dtype=dtype, device=device)  # [nGov,6]
            # the two channels a GOVERNOR gates: Merchant Republic's gold wants
            # an ESTABLISHED one, Theocracy's and Communism's per-citizen
            # yields only a seated one.
            self._gov_gov_ymult = torch.tensor([[float(x) for x in g.get("governorYieldMult", [1] * 6)] for g in _govs], dtype=dtype, device=device)
            self._gov_gov_percit = torch.tensor([[float(x) for x in g.get("governorPerCitizen", [0] * 6)] for g in _govs], dtype=dtype, device=device)
            self._gov_ehprod = torch.tensor([float(g.get("encampHarborProdMult", 1)) for g in _govs], dtype=dtype, device=device)  # [nGov] channel-complete; no government carries it
            self._gov_tpmult = torch.tensor([float(g.get("tilePurchaseMult", 1)) for g in _govs], dtype=dtype, device=device)  # [nGov]
            # The amenity + district-conditional channels, applied for EVERY
            # seat (computeHousing / computeCityStats). newDeal carries housing
            # AND amenities; both it and housingIfDistricts key on SPECIALTY
            # district counts.
            self._gov_amen = torch.tensor([float(g.get("amenitiesAll", 0)) for g in _govs], dtype=dtype, device=device)
            _ghid = [g.get("housingIfDistricts", [-1, 0]) for g in _govs]
            self._gov_hid_min = torch.tensor([int(x[0]) for x in _ghid], dtype=torch.long, device=device)
            self._gov_hid_house = torch.tensor([float(x[1]) for x in _ghid], dtype=dtype, device=device)
            _gnd = [g.get("newDeal", [-1, 0, 0]) for g in _govs]
            self._gov_nd_min = torch.tensor([int(x[0]) for x in _gnd], dtype=torch.long, device=device)
            self._gov_nd_house = torch.tensor([float(x[1]) for x in _gnd], dtype=dtype, device=device)
            self._gov_nd_amen = torch.tensor([float(x[2]) for x in _gnd], dtype=dtype, device=device)
            # adjacencyMult: a MULTIPLIER on one district type's adjacency
            # bonus, per PLACEABLE district column. buildingYieldBoost: one
            # [district, yield, pct, popMin, popPct, adjMin, adjPct] row.
            _nd_pl = len(self.districts_cat)
            self._gov_adj_mult = torch.tensor(
                [[float(x) for x in g.get("adjacencyMult", [1] * _nd_pl)] for g in _govs],
                dtype=dtype, device=device)  # [nGov, nD]
            self._gov_byb = torch.tensor(
                [[float(x) for x in g.get("buildingYieldBoost", [-1, -1, 0, 0, 0, 0, 0])] for g in _govs],
                dtype=torch.float64, device=device)  # [nGov, 7]
            # prodBoost: [wonderTarget, unit-class mask, eraMax, pct], the
            # production cards' two axes. wonderTarget -1 = no boost.
            self._gov_prodb = torch.tensor(
                [[float(x) for x in r.get("prodBoost", [-1, 0, 0, 0])] for r in _govs],
                dtype=torch.float64, device=device)
            self._gov_bcharge = torch.tensor([float(r.get("builderCharges", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_mcut = torch.tensor([float(r.get("unitMaintenanceCut", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_wmdup = torch.tensor([float(r.get("wmdUpkeepPct", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_vbarb = torch.tensor([float(r.get("combatVsBarbarians", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_cdef = torch.tensor([float(r.get("cityDefense", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_crng = torch.tensor([float(r.get("cityRanged", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_rxp = torch.tensor([float(r.get("reconXpMult", 1)) for r in _govs], dtype=dtype, device=device)
            self._gov_rplun = torch.tensor([float(r.get("routePlunderMult", 1)) for r in _govs], dtype=dtype, device=device)
            self._gov_pillm = torch.tensor([float(r.get("pillageMult", 1)) for r in _govs], dtype=dtype, device=device)
            self._gov_faith_units = torch.tensor([bool(r.get("faithBuyLandUnits", 0)) for r in _govs], dtype=torch.bool, device=device)
            self._gov_rgold = torch.tensor([float(r.get("routeGold", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_infl = torch.tensor([float(r.get("influencePerTurn", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_envoy1 = torch.tensor([bool(r.get("firstEnvoyDouble", 0)) for r in _govs], dtype=torch.bool, device=device)
            self._gov_envoy2 = torch.tensor([bool(r.get("envoyDoubleDiffGov", 0)) for r in _govs], dtype=torch.bool, device=device)
            self._gov_culsuz = torch.tensor([float(r.get("culturePerSuzerain", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_gpp = torch.tensor(
                [[float(x) for x in r.get("gpp", [0] * n_gp)] for r in _govs],
                dtype=torch.float64, device=device)
            # unitCombatCS [promotion-class mask, allCombat, cs] — the
            # PROMOTION-class axis (`governmentUnitCS`): Oligarchy names
            # MELEE, ANTICAV and NAVAL_MELEE; Fascism's `all` arm reaches
            # every combat unit.
            _gucs = [r.get("unitCombatCS", [0, 0, 0]) for r in _govs]
            self._gov_ucs_mask = torch.tensor([int(x[0]) for x in _gucs], dtype=torch.long, device=device)
            self._gov_ucs_allc = torch.tensor([bool(x[1]) for x in _gucs], dtype=torch.bool, device=device)
            self._gov_ucs_cs = torch.tensor([float(x[2]) for x in _gucs], dtype=torch.float64, device=device)
            self._gov_xppct = torch.tensor([float(r.get("xpPct", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_wwcut = torch.tensor([float(r.get("wwCutPct", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_gppmult = torch.tensor([float(r.get("gppMult", 1)) for r in _govs], dtype=torch.float64, device=device)
            _gdc = [r.get("cityWithDistrict", [0, 0]) for r in _govs]
            self._gov_dc_house = torch.tensor([float(x[0]) for x in _gdc], dtype=dtype, device=device)
            self._gov_dc_amen = torch.tensor([float(x[1]) for x in _gdc], dtype=dtype, device=device)
            self._gov_wallhouse = torch.tensor([float(r.get("housingPerWallLevel", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_theocs = torch.tensor([float(r.get("theologyCS", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_govbldy = torch.tensor([float(r.get("yieldsPerGovBuilding", 0)) for r in _govs], dtype=dtype, device=device)
            self._gov_fx_mag = float(
                (self._gov_prodb[:, 0] >= 0).sum()
                + self._gov_bcharge.abs().sum() + self._gov_mcut.abs().sum()
                + self._gov_wmdup.abs().sum()
                + self._gov_vbarb.abs().sum() + self._gov_cdef.abs().sum()
                + self._gov_crng.abs().sum() + (self._gov_rxp - 1).abs().sum()
                + (self._gov_rplun - 1).abs().sum() + self._gov_rgold.abs().sum()
                + (self._gov_pillm - 1).abs().sum()
                + self._gov_infl.abs().sum() + self._gov_envoy1.sum()
                + self._gov_culsuz.abs().sum() + self._gov_gpp.abs().sum()
                + (self._gov_ucs_cs.abs() * ((self._gov_ucs_mask != 0) | self._gov_ucs_allc).double()).sum()
                + self._gov_xppct.abs().sum()
                + self._gov_wwcut.abs().sum() + (self._gov_gppmult - 1).abs().sum()
                + self._gov_dc_house.abs().sum() + self._gov_dc_amen.abs().sum()
                + self._gov_wallhouse.abs().sum() + self._gov_theocs.abs().sum()
                + self._gov_govbldy.abs().sum())
            self._gov_arange = torch.arange(self._ngov, dtype=torch.long, device=device)
        if self._npol:
            self._pol_kind = torch.tensor([int(p["kind"]) for p in _pols], dtype=torch.long, device=device)
            self._pol_unlock_civic = torch.tensor([int(p["unlockCivic"]) for p in _pols], dtype=torch.long, device=device)
            self._pol_city_y = torch.tensor([[float(x) for x in p["cityYields"]] for p in _pols], dtype=dtype, device=device)
            self._pol_cap_y = torch.tensor([[float(x) for x in p["capitalYields"]] for p in _pols], dtype=dtype, device=device)
            self._pol_housing = torch.tensor([float(p.get("housingAll", 0)) for p in _pols], dtype=dtype, device=device)  # [nPol]
            # housingIfDistricts (INSULAE {min 2, +1}): +housing to a city with
            # >= min completed SPECIALTY districts.
            _hid = [p.get("housingIfDistricts", [-1, 0]) for p in _pols]
            self._pol_hid_min = torch.tensor([int(x[0]) for x in _hid], dtype=torch.long, device=device)  # [nPol] (-1 = none)
            self._pol_hid_house = torch.tensor([float(x[1]) for x in _hid], dtype=dtype, device=device)  # [nPol]
            # VETERANCY: a production multiplier toward Encampment and Harbor
            # items (cpu/core/game.ts isEncampHarborItem).
            self._pol_ehprod = torch.tensor([float(p.get("encampHarborProdMult", 1)) for p in _pols], dtype=dtype, device=device)  # [nPol]
            self._pol_tpmult = torch.tensor([float(p.get("tilePurchaseMult", 1)) for p in _pols], dtype=dtype, device=device)  # [nPol] (LAND_SURVEYORS = 0.8)
            self._pol_amen = torch.tensor([float(p.get("amenitiesAll", 0)) for p in _pols], dtype=dtype, device=device)
            _pnd = [p.get("newDeal", [-1, 0, 0]) for p in _pols]
            self._pol_nd_min = torch.tensor([int(x[0]) for x in _pnd], dtype=torch.long, device=device)
            self._pol_nd_house = torch.tensor([float(x[1]) for x in _pnd], dtype=dtype, device=device)
            self._pol_nd_amen = torch.tensor([float(x[2]) for x in _pnd], dtype=dtype, device=device)
            _nd_pl = len(self.districts_cat)
            self._pol_adj_mult = torch.tensor(
                [[float(x) for x in p.get("adjacencyMult", [1] * _nd_pl)] for p in _pols],
                dtype=dtype, device=device)  # [nPol, nD]
            self._pol_byb = torch.tensor(
                [[float(x) for x in p.get("buildingYieldBoost", [-1, -1, 0, 0, 0, 0, 0])] for p in _pols],
                dtype=torch.float64, device=device)  # [nPol, 7]
            # prodBoost: [wonderTarget, unit-class mask, eraMax, pct], the
            # production cards' two axes. wonderTarget -1 = no boost.
            self._pol_prodb = torch.tensor(
                [[float(x) for x in r.get("prodBoost", [-1, 0, 0, 0])] for r in _pols],
                dtype=torch.float64, device=device)
            self._pol_bcharge = torch.tensor([float(r.get("builderCharges", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_mcut = torch.tensor([float(r.get("unitMaintenanceCut", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_wmdup = torch.tensor([float(r.get("wmdUpkeepPct", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_vbarb = torch.tensor([float(r.get("combatVsBarbarians", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_cdef = torch.tensor([float(r.get("cityDefense", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_crng = torch.tensor([float(r.get("cityRanged", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_rxp = torch.tensor([float(r.get("reconXpMult", 1)) for r in _pols], dtype=dtype, device=device)
            self._pol_rplun = torch.tensor([float(r.get("routePlunderMult", 1)) for r in _pols], dtype=dtype, device=device)
            self._pol_pillm = torch.tensor([float(r.get("pillageMult", 1)) for r in _pols], dtype=dtype, device=device)
            self._pol_rgold = torch.tensor([float(r.get("routeGold", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_infl = torch.tensor([float(r.get("influencePerTurn", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_envoy1 = torch.tensor([bool(r.get("firstEnvoyDouble", 0)) for r in _pols], dtype=torch.bool, device=device)
            self._pol_envoy2 = torch.tensor([bool(r.get("envoyDoubleDiffGov", 0)) for r in _pols], dtype=torch.bool, device=device)
            self._pol_tourroute = torch.tensor([int(r.get("tourismRouteBonus", 0)) for r in _pols], dtype=torch.long, device=device)
            self._pol_culsuz = torch.tensor([float(r.get("culturePerSuzerain", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_gpp = torch.tensor(
                [[float(x) for x in r.get("gpp", [0] * n_gp)] for r in _pols],
                dtype=torch.float64, device=device)
            # yieldMult, the channel a card gained with COLLECTIVE_ACTIVISM's
            # per-suzerainty culture; the government table has always had it.
            self._pol_ymult = torch.tensor([[float(x) for x in p.get("yieldMult", [1] * 6)] for p in _pols], dtype=dtype, device=device)  # [nPol,6]
            # THE DARK-AGE window: [firstEra, lastEra], [-1, -1] on every
            # ordinary card. A Dark Age card needs no unlocking civic — the
            # seat's AGE and this window are its whole gate.
            # CIV6 (Legacy policy card): the government whose bonus the card
            # carries, -1 on an ordinary card. Having BEEN in that government
            # unlocks it; being in it still forbids the slot.
            self._pol_legacy = torch.tensor([int(r.get("legacy", -1)) for r in _pols], dtype=torch.long, device=device)
            _pdk = [r.get("dark", [-1, -1]) for r in _pols]
            self._pol_dark_lo = torch.tensor([int(x[0]) for x in _pdk], dtype=torch.long, device=device)
            self._pol_dark_hi = torch.tensor([int(x[1]) for x in _pdk], dtype=torch.long, device=device)
            self._pol_route_ymult = torch.tensor([float(r.get("routeYieldMult", 1)) for r in _pols], dtype=dtype, device=device)
            self._pol_dom_route = torch.tensor([[float(x) for x in r.get("domesticRouteYield", [0] * 6)] for r in _pols], dtype=dtype, device=device)
            self._pol_no_settlers = torch.tensor([bool(r.get("noSettlers", 0)) for r in _pols], dtype=torch.bool, device=device)
            self._pol_heal_home = torch.tensor([bool(r.get("healOnlyHome", 0)) for r in _pols], dtype=torch.bool, device=device)
            self._pol_relig_home = torch.tensor([float(r.get("religiousCsHome", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_raider_prod = torch.tensor([float(r.get("navalRaiderProdMult", 1)) for r in _pols], dtype=dtype, device=device)
            self._pol_raider_moves = torch.tensor([int(r.get("navalRaiderMoves", 0)) for r in _pols], dtype=torch.long, device=device)
            self._pol_griev_hold = torch.tensor([bool(r.get("grievanceNoDecay", 0)) for r in _pols], dtype=torch.bool, device=device)
            self._pol_proj_prod = torch.tensor([float(r.get("projectProdMult", 1)) for r in _pols], dtype=dtype, device=device)
            self._pol_loyalty_all = torch.tensor([float(r.get("loyaltyAll", 0)) for r in _pols], dtype=dtype, device=device)
            _pfb = [r.get("favorPerBuilding", [-1, 0]) for r in _pols]
            self._pol_favor_b = torch.tensor([int(x[0]) for x in _pfb], dtype=torch.long, device=device)
            self._pol_favor_n = torch.tensor([float(x[1]) for x in _pfb], dtype=dtype, device=device)
            self._pol_no_envoy = torch.tensor([bool(r.get("noEnvoyInfluence", 0)) for r in _pols], dtype=torch.bool, device=device)
            _pve = [r.get("unitCsVsEra", [-1, 0]) for r in _pols]
            self._pol_era_cs_min = torch.tensor([int(x[0]) for x in _pve], dtype=torch.long, device=device)
            self._pol_era_cs = torch.tensor([float(x[1]) for x in _pve], dtype=torch.float64, device=device)
            self._pol_land_cost = torch.tensor([float(r.get("landUnitCostMult", 1)) for r in _pols], dtype=dtype, device=device)
            self._pol_concert = torch.tensor([float(r.get("concertShare", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_mil_maint = torch.tensor([float(r.get("militaryMaintenanceAdd", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_imp_y = torch.tensor([[[float(y) for y in i] for i in r.get("improvementYields", [])] or [[0.0] * 6] for r in _pols], dtype=dtype, device=device)
            # [target, yield, x1000 multiplier] rows, padded to the widest
            # card with a -1 target that matches nothing
            for _nm, _key in (("_pol_dist_ym", "districtYieldMult"), ("_pol_bldg_ym", "buildingYieldMult")):
                _rows = [r.get(_key, []) for r in _pols]
                _w = max([len(x) for x in _rows] + [1])
                _pad = [[list(map(int, y)) for y in x] + [[-1, 0, 1000]] * (_w - len(x)) for x in _rows]
                setattr(self, _nm, torch.tensor(_pad, dtype=torch.long, device=device))
            # the two GOVERNOR-GATED government channels
            self._pol_gov_ymult = torch.tensor([[float(x) for x in r.get("governorYieldMult", [1] * 6)] for r in _pols], dtype=dtype, device=device)
            self._pol_gov_percit = torch.tensor([[float(x) for x in r.get("governorPerCitizen", [0] * 6)] for r in _pols], dtype=dtype, device=device)
            # the civic that RETIRES the card; -1 = it never leaves the pool
            _pucs = [r.get("unitCombatCS", [0, 0, 0]) for r in _pols]
            self._pol_ucs_mask = torch.tensor([int(x[0]) for x in _pucs], dtype=torch.long, device=device)
            self._pol_ucs_allc = torch.tensor([bool(x[1]) for x in _pucs], dtype=torch.bool, device=device)
            self._pol_ucs_cs = torch.tensor([float(x[2]) for x in _pucs], dtype=torch.float64, device=device)
            self._pol_xppct = torch.tensor([float(r.get("xpPct", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_wwcut = torch.tensor([float(r.get("wwCutPct", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_gppmult = torch.tensor([float(r.get("gppMult", 1)) for r in _pols], dtype=torch.float64, device=device)
            _pdc = [r.get("cityWithDistrict", [0, 0]) for r in _pols]
            self._pol_dc_house = torch.tensor([float(x[0]) for x in _pdc], dtype=dtype, device=device)
            self._pol_dc_amen = torch.tensor([float(x[1]) for x in _pdc], dtype=dtype, device=device)
            self._pol_wallhouse = torch.tensor([float(r.get("housingPerWallLevel", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_theocs = torch.tensor([float(r.get("theologyCS", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_govbldy = torch.tensor([float(r.get("yieldsPerGovBuilding", 0)) for r in _pols], dtype=dtype, device=device)
            self._pol_fx_mag = float(
                (self._pol_prodb[:, 0] >= 0).sum()
                + self._pol_bcharge.abs().sum() + self._pol_mcut.abs().sum()
                + self._pol_wmdup.abs().sum()
                + self._pol_vbarb.abs().sum() + self._pol_cdef.abs().sum()
                + self._pol_crng.abs().sum() + (self._pol_rxp - 1).abs().sum()
                + (self._pol_rplun - 1).abs().sum() + self._pol_rgold.abs().sum()
                + (self._pol_pillm - 1).abs().sum()
                + self._pol_infl.abs().sum() + self._pol_envoy1.sum()
                + self._pol_culsuz.abs().sum() + self._pol_gpp.abs().sum()
                + (self._pol_ucs_cs.abs() * ((self._pol_ucs_mask != 0) | self._pol_ucs_allc).double()).sum()
                + self._pol_xppct.abs().sum()
                + self._pol_wwcut.abs().sum() + (self._pol_gppmult - 1).abs().sum()
                + self._pol_dc_house.abs().sum() + self._pol_dc_amen.abs().sum()
                + self._pol_wallhouse.abs().sum() + self._pol_theocs.abs().sum()
                + self._pol_govbldy.abs().sum())
            self._pol_obsolete_civic = torch.tensor([int(p.get("obsoleteCivic", -1)) for p in _pols], dtype=torch.long, device=device)
        # Master switch (rules.governmentsLive), mirroring the TS
        # GOVERNMENTS_ADOPTION_LIVE. Gates every gov/policy application and the
        # influence-tier addition, so the two engines flip in lockstep; when
        # False the tables load but change nothing.
        self._gov_live = bool(getattr(rules, "governments_live", False))
        self._gov_has_effects = self._gov_live and bool(
            (self._ngov and float(self._gov_city_y.abs().sum() + self._gov_cap_y.abs().sum() + self._gov_housing.abs().sum() + (self._gov_ymult - 1).abs().sum() + (self._gov_ehprod - 1).abs().sum() + (self._gov_tpmult - 1).abs().sum() + (self._gov_adj_mult - 1).abs().sum() + (self._gov_byb[:, 0] >= 0).sum()) > 0 or self._gov_fx_mag > 0)
            or (self._npol and float(self._pol_city_y.abs().sum() + self._pol_cap_y.abs().sum() + self._pol_housing.abs().sum() + self._pol_hid_house.abs().sum() + (self._pol_ehprod - 1).abs().sum() + (self._pol_tpmult - 1).abs().sum() + (self._pol_adj_mult - 1).abs().sum() + (self._pol_byb[:, 0] >= 0).sum() + (self._pol_ymult - 1).abs().sum()) > 0 or self._pol_fx_mag > 0)
        )
        self._harbor_idx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "HARBOR"), -1)
        self._hs_idx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "HOLY_SITE"), -1)
        self._campus_idx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "CAMPUS"), -1)
        self._commhub_idx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "COMMERCIAL_HUB"), -1)
        self._iz_idx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "INDUSTRIAL_ZONE"), -1)
        self._aerodrome_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "AERODROME"), -1)
        self._spaceport_didx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "SPACEPORT"), -1)

        # CIV6 (Air combat): a City Center bases 1, an Aerodrome 2 before its
        # buildings.
        self._city_centre_air_slots = 1
        self._aerodrome_air_slots = 2
        self._mp_scale = int(rules.mp_scale)
        # CIV6 (Mountain Tunnel): the published exit price, "2 Movement" (C-20)
        self._portal_mp = 2
        self._road_tier_mp = list(rules.road_tier_mp)
        self._road_tier_bridges = list(rules.road_tier_bridges)
        self._road_tier_era = list(rules.road_tier_era)
        self._railroad_mp = int(rules.railroad_mp)
        self._wonder_coastal_mask = int(rules.wonder_coastal_mask)
        self._railroad_tech = int(rules.railroad_tech)
        self._railroad_cost = list(rules.railroad_cost)
        self._embark_transition_mp = int(rules.embark_transition_mp)
        self._shipyard_bidx = int(rules.shipyard_bidx)
        self._ma_bidx = int(rules.military_academy_bidx)
        self._seaport_bidx = int(rules.seaport_bidx)
        self._nuclear_bidx = int(rules.nuclear_plant_bidx)
        self._walls_bidx = int(rules.ancient_walls_bidx)
        _tr = rules.trade or {}
        self._trade_mkt = int(_tr.get("marketBidx", -1))
        self._trade_lgh = int(_tr.get("lighthouseBidx", -1))
        self._trade_ftc = int(_tr.get("foreignTradeCidx", -3))
        self._trade_wonders = [int(x) for x in _tr.get("capWonderWidx", [])]
        self._trade_range = int(_tr.get("range", 15))
        self._trade_sea_range = int(_tr.get("seaRange", 30))
        self._trade_intl_gold = int(_tr.get("intlGold", 3))  # international base gold
        self._trade_duration = int(_tr.get("duration", 20))  # route lifetime
        self._trade_plunder_gold = int(_tr["plunderGold"])
        self._trade_walk_rail = int(_tr["walkRail"])
        self._trade_dur_bumps = [int(x) for x in _tr["durEraBumps"]]  # eras adding +10/+20/+30
        self._trader_cost_prog = int(_tr["traderCostProg"])
        # RIVER FLOOD, the Flood (Civ6) tables by severity.
        _ds = rules.disasters
        self._flood_sev_p = [float(x) for x in _ds["floodSeverityP"]]
        # the per-turn base chances the climate phase scales
        self._flood_chance = float(_ds["floodChance"])
        self._eruption_chance = float(_ds["eruptionChance"])
        self._drought_chance = float(_ds["droughtChance"])
        self._storm_chance = float(_ds["stormChance"])
        self._drought_length = int(_ds["droughtLength"])
        self._flood_destroy_p = torch.tensor([float(x) for x in _ds["floodDestroyP"]], dtype=torch.float64, device=device)
        self._flood_district_p = torch.tensor([float(x) for x in _ds["floodDistrictP"]], dtype=torch.float64, device=device)
        self._flood_pop_p = torch.tensor([float(x) for x in _ds["floodPopP"]], dtype=torch.float64, device=device)
        self._flood_dmg_lo = torch.tensor([int(x) for x in _ds["floodDmgLo"]], dtype=torch.long, device=device)
        self._flood_dmg_hi = torch.tensor([int(x) for x in _ds["floodDmgHi"]], dtype=torch.long, device=device)
        self._flood_fert_food = torch.tensor(_ds["floodFertFood"], dtype=torch.float64, device=device)  # [3, 3]
        self._flood_fert_prod = torch.tensor(_ds["floodFertProd"], dtype=torch.float64, device=device)  # [3, 3]
        self._flood_fert_col = torch.tensor([int(x) for x in _ds["floodFertCol"]], dtype=torch.long, device=device)  # [nTerrain]
        # The outer-defense pool and the defensive Combat Strength by WALLS
        # TIER, plus the tech that grants the top tier outright.
        self._walls_tier_hp = torch.tensor([int(x) for x in rules.combat["wallsTierHp"]], dtype=torch.long, device=device)
        self._walls_tier_cs = torch.tensor([int(x) for x in rules.combat["wallsTierCs"]], dtype=torch.long, device=device)
        self._walls_tier_urban = int(rules.combat["wallsTierUrban"])
        self._urban_def_tech = int(rules.combat["urbanDefensesTech"])
        self._repair_quiet = int(rules.combat["repairQuietTurns"])
        self._b_walls = rules.b_walls.to(device)  # [NB] walls tier per building row
        self._b_no_purchase = rules.b_no_purchase.to(device)  # [NB] bool
        self._b_faith_units = rules.b_faith_units.to(device)  # [NB] bool
        self._b_pill_faith_imp = rules.b_pill_faith_imp.to(device)  # [NB] long
        self._b_pill_faith_dist = rules.b_pill_faith_dist.to(device)  # [NB] long
        self._b_grant_unit = rules.b_grant_unit.to(device)  # [NB] long
        self._walls_rows = [i for i, t in enumerate(rules.b_walls.tolist()) if int(t) > 0]
        # the ANCIENT tier's pool, which is what a fresh set of Walls is worth
        self._walls_hp = int(self._walls_tier_hp[1])
        # What `_city_damage_split` and `_ranged_city_penalty` read: the
        # perimeter's share of a melee and of a ranged hit, the fraction below
        # which the centre takes full damage, and the ranged penalty against
        # city and district defenses.
        self._wall_dmg_melee = float(rules.combat["wallDamageMelee"])
        self._wall_dmg_ranged = float(rules.combat["wallDamageRanged"])
        self._wall_breach = float(rules.combat["wallBreachFraction"])
        self._ranged_city_pen = float(rules.combat["rangedCityPenalty"])
        self._formation_cs = torch.tensor(
            [int(x) for x in rules.combat.get("formationCs", [0])], dtype=torch.long, device=device)
        self._formation_civic = [int(x) for x in rules.combat.get("formationCivic", [-1])]
        self._form_cost_mult = torch.tensor(
            [float(x) for x in rules.combat.get("formationCostMult", [1.0])],
            dtype=torch.float64, device=device)
        self._form_train_disc = float(rules.combat.get("formationTrainDiscount", 1.0))
        self._form_max = self._formation_cs.numel() - 1
        # The ENCAMPMENT garrison pool cap (TS ENCAMPMENT_HP).
        self._encamp_hp_max = int(rules.combat.get("encampHp", 100))
        # Which district types count toward the specialty cap (Aqueduct/Neighborhood
        # do NOT). Aqueduct also carries housing, not an adjacency yield.
        self._is_specialty = torch.tensor([bool(d.get("countsTowardLimit", True)) for d in self.districts_cat], dtype=torch.bool, device=device)  # [nD]
        # Types a city may hold SEVERAL of (CIV 6: the Neighborhood). The
        # registry keeps ONE tile per type, so these are counted off the tile
        # plane in `_district_counts`; the registry entry is the first of them.
        self._is_repeatable = torch.tensor([bool(d.get("allowMultiple", 0)) for d in self.districts_cat], dtype=torch.bool, device=device)  # [nD]
        self._rep_any = bool(self._is_repeatable.any())
        if self._rep_any and bool((self._is_repeatable & self._is_specialty).any()):
            raise ValueError("a repeatable district that counts toward the specialty cap: "
                             "the cap and the discount both read the registry, which holds one tile per type")
        self._aqueduct_idx = next((i for i, d in enumerate(self.districts_cat) if d.get("id") == "AQUEDUCT"), -1)
        # CIV6 (Military Engineer): its charge finishes 20% of "an engineering
        # type of district (Aqueduct, Bath, Canal, Dam)". The Bath is Rome's
        # unique Aqueduct, which this model has no carrier for. Held as
        # SCAFFOLD positions, which is what `city_current` stores.
        _fin = {d for d in (self._aqueduct_idx, self._canal_didx, self._dam_didx) if d >= 0}
        self._eng_finish_slots = [s for s, p in enumerate(self._scaffold) if p[0] in _fin]
        # The rest of the per-district catalog columns, every one read by index
        # rather than by id: the amenity the district itself pays, its flat
        # loyalty, the governor title and envoys it awards on completion, the
        # one-per-civilization limit, the types it refuses to share a city
        # with, its appeal-based housing, its flood shield, and what it takes
        # off an enemy spy's level.
        self._d_amenity = torch.tensor([float(d.get("amenities", 0)) for d in self.districts_cat], dtype=dtype, device=device)
        # CIV6 (DistrictReplaces): a civilization's unique district standing in
        # for a row — {district idx: [{civ, costMult, housing, amenities}]}
        self._d_variants = {i: list(d["variants"]) for i, d in enumerate(self.districts_cat) if d.get("variants")}
        self._d_loyalty = torch.tensor([float(d.get("loyalty", 0)) for d in self.districts_cat], dtype=dtype, device=device)
        self._d_gov_title = torch.tensor([int(d.get("governorTitle", 0)) for d in self.districts_cat], dtype=torch.long, device=device)
        self._d_envoy_centre = torch.tensor([int(d.get("envoysNextToCenter", 0)) for d in self.districts_cat], dtype=torch.long, device=device)
        self._d_one_civ = torch.tensor([bool(d.get("oneCivWide", 0)) for d in self.districts_cat], dtype=torch.bool, device=device)
        self._d_exclusive = [[int(x) for x in d.get("exclusive", [])] for d in self.districts_cat]
        self._d_appeal_housing = torch.tensor([bool(d.get("appealHousing", 0)) for d in self.districts_cat], dtype=torch.bool, device=device)
        self._d_flood_shield = torch.tensor([bool(d.get("floodShield", 0)) for d in self.districts_cat], dtype=torch.bool, device=device)
        self._d_bomb_unowned = torch.tensor([bool(d.get("cultureBombUnowned", 0)) for d in self.districts_cat], dtype=torch.bool, device=device)
        self._d_spy_pen = torch.tensor([int(d.get("spyLevelPenalty", 0)) for d in self.districts_cat], dtype=torch.long, device=device)
        # CIV6 (Pillaging): the district plunder rows, same enum as the
        # improvements'
        self._d_plun_kind = torch.tensor([int(d.get("plun", [0, 0])[0]) for d in self.districts_cat], dtype=torch.long, device=device)
        self._d_plun_amt = torch.tensor([int(d.get("plun", [0, 0])[1]) for d in self.districts_cat], dtype=torch.long, device=device)
        self._preserve_housing = [int(x) for x in _er2.get("preserveHousing", [0, 0, 0, 0, 0])]
        self._d_unlock_t = torch.tensor([int(d.get("unlockTech", -1)) for d in self.districts_cat], dtype=torch.long, device=device)
        self._d_unlock_c = torch.tensor([int(d.get("unlockCivic", -1)) for d in self.districts_cat], dtype=torch.long, device=device)
        self._d_maint = torch.tensor([float(d.get("maintenance", 1)) for d in self.districts_cat], dtype=dtype, device=device)
        self._d_housing = torch.tensor([float(d.get("housing", 0)) for d in self.districts_cat], dtype=dtype, device=device)
        # The NEIGHBORHOOD ladder as a plain per-band list, the shape the
        # Preserve's own table already has.
        self._nbhd_housing = [v for _c, v in sorted(self._appeal_cuts, reverse=True)] + [self._appeal_floor]
        # Types whose housing has to be counted off the TILE plane rather than
        # the registry: a city may hold several, and the registry keeps one.
        self._rep_house_idx = [
            i for i in range(len(self.districts_cat))
            if bool(self._is_repeatable[i]) and float(self._d_housing[i]) != 0
        ]
        self._appeal_house_idx = [i for i in range(len(self.districts_cat)) if bool(self._d_appeal_housing[i])]
        self._h_fresh = float(rules.housing_fresh)
        self._h_none = float(rules.housing_none)
        self._aq_fresh_bonus = float(rules.housing_aq_fresh_bonus)
        self._aq_no_fresh_total = float(rules.housing_aq_no_fresh)

        self._mut_sig: dict = {}

        self._eff_version = 0
        self._bel_version = 0
        self._rp_kill_version = 0
        self._claim_version = 0
        self._gen_ver = 0
        self._gen_aura_cache = None
        self._bidx1 = torch.arange(B, device=device).unsqueeze(1)  # [B, 1] batch index, for advanced indexing
        self._fbase_cache: tuple[int, torch.Tensor] | None = None
        self._food_cache: tuple[int, torch.Tensor] | None = None
        self._nprod_cache: tuple[int, torch.Tensor] | None = None
        # Civ-phase caches, same single-slot-by-key shape as _rcy_globals.
        self._seat_route_cache = None   # ((turn,r,_eff_version,_rp_kill_version), [B,RC]|None)
        self._suz_rows_cache = None  # ((turn, _eff_version), {code: [B, n_majors] bool})
        self._belief_feat_cache = None   # ((r,_eff_version,_bel_version), [B,T,6])
        self._bel_add_memo = None        # (_bel_version, {(fn,key,r): tensor})
        self._gov_pol_cache = None       # {row: (ver, civ, slots, dark, era, mods)}
        # `_gov_mods` memoises an answer the government CATALOG feeds, and
        # the catalog is written once at load. Anything that rewrites a
        # `_gov_*` or `_pol_*` row after that must move this counter, or the
        # memo keeps answering off the row it replaced.
        self._gov_cat_version = 0
        self._dadj_cache = None          # (_eff_version, {di: floored [B,T] adjacency})
        self._wadj_cache = None          # (_eff_version, {key: [B,T] wonder-adjacency plane})
        self._fx_row_cache = None        # (_eff_version, {channel: [B, n_majors]})
        self._hs_faith_cache = None      # (_eff_version, [B,T] Holy Site faith output)
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

        self.turn = 1
        # THE t0 TILE-OWNERSHIP PAIR, seat-generic and shipped as a pair:
        # `ownerSeatInit` is TS's `ownerSeat` per tile (NO_SEAT for nobody,
        # 100+ for a city-state) and `ownerInit` its `ownerCity` — the owning
        # city's PERSISTENT id within that seat, -1 for none. Settler starts
        # mean no major holds a tile at t0, so `ownerInit` is all -1 and
        # `ownerSeatInit` carries only the city-state rings; but the pair is the
        # contract, and reading only seat 0's half is how a civ's ring would be
        # dropped on load.
        self.tile_city = torch.tensor([f["ownerInit"] for f in fixtures], dtype=torch.long, device=device)  # [B, T]
        # Bumped by EVERY write to tile_seat / tile_city; keys the derived
        # views below. Not a tensor — python state, so it is not in _MUTABLE.
        self._tile_owner_ver = 0
        self._citystate_at_ver = -1
        self._citystate_at_cache: torch.Tensor | None = None
        self._civ_at_cache: torch.Tensor | None = None
        self._city_slot_cache: dict[int, tuple[int, torch.Tensor]] = {}
        self.tile_seat = torch.tensor(
            [f["ownerSeatInit"] for f in fixtures], dtype=torch.long, device=device)
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
        # GS POWER (data/buildings.ts): the base load a building demands, what
        # it pays on top once its city is powered, and the two special rows —
        # a PLANT supplies its region, the Coal one also banks its Industrial
        # Zone's adjacency as production.
        self._b_power = rules.b_power.to(device)  # [NB] f64
        self._b_pow_y = rules.b_pow_yields.to(device)  # [NB, 6] f64
        self._b_pow_y_mask = (self._b_pow_y != 0).double()  # which yields a powered half pays at all
        self._b_pow_am = rules.b_pow_amenities.to(device)  # [NB] f64
        self._b_powerplant = rules.b_powerplant.to(device)  # [NB] bool
        self._b_iz_adj = rules.b_iz_adj_prod.to(device)  # [NB] bool
        self._b_pow_y_any = self._b_pow_y.abs().sum(dim=1) > 0  # [NB] bool
        self._plant_bidx = [i for i in range(self.NB) if bool(self._b_powerplant[i])]
        self._iz_adj_bidx = [i for i in range(self.NB) if bool(self._b_iz_adj[i])]
        self._cardiff_harbor_power = float(rules.cardiff_harbor_power)
        self._b_power_supply = rules.b_power_supply.to(device)  # [NB] renewable Power a row supplies its own city
        self._b_flood_barrier = rules.b_flood_barrier.to(device)  # [NB] bool
        self._barrier_bidx = next((i for i in range(self.NB) if bool(self._b_flood_barrier[i])), -1)
        self._b_regional_range = rules.b_regional_range.to(device)  # [NB] its own regional reach, 0 = the shared one
        self._b_gov_tier = rules.b_gov_tier.to(device)  # [NB] the government TIER a row demands
        self._b_gov_title = rules.b_gov_title.to(device)
        self._b_spy_capacity = rules.b_spy_capacity.to(device)
        self._b_spy_pen = rules.b_spy_pen.to(device)
        self._b_spy_pen_enc = rules.b_spy_pen_enc.to(device)
        self._b_influence = rules.b_influence.to(device)
        self._b_favor = rules.b_favor.to(device)
        self._b_loy_no_gov = rules.b_loy_no_gov.to(device)
        self._b_amen_gov = rules.b_amen_gov.to(device)
        self._b_house_gov = rules.b_house_gov.to(device)
        self._b_gov_yield = rules.b_gov_yield.to(device)
        self._palace_gov_yield = bool(rules.palace_gov_yield)
        self._b_grant_new_city = rules.b_grant_new_city.to(device)
        self._b_settler_prod = rules.b_settler_prod.to(device)
        self._b_conquest_pct = rules.b_conquest_pct.to(device)
        self._b_conquest_turns = rules.b_conquest_turns.to(device)
        self._b_any_work = rules.b_any_work.to(device)
        self._any_work_live = bool((self._b_any_work != 0).any())
        self._b_heal_kill = rules.b_heal_kill.to(device)
        self._heal_kill_live = bool((self._b_heal_kill != 0).any())
        self._b_project_charge = rules.b_project_charge.to(device)
        self._project_charge_live = bool((self._b_project_charge != 0).any())
        self._bsum_row_cache = None
        self._bldg_version = 0  # every `city_bldg` write moves it
        # CIV6 (Water Works): housing per Neighborhood/Aqueduct, amenities per
        # Canal/Dam — the district roster, by catalog id.
        _dids = [str(d.get("id", "")) for d in self.districts_cat]
        self._d_water_house = torch.tensor(
            [float(self._water_works_housing) if i in ("NEIGHBORHOOD", "AQUEDUCT") else 0.0 for i in _dids] or [0.0],
            dtype=torch.float64, device=device)
        self._d_water_amen = torch.tensor(
            [float(self._water_works_amenities) if i in ("CANAL", "DAM") else 0.0 for i in _dids] or [0.0],
            dtype=torch.float64, device=device)
        self._b_appeal_y = rules.b_appeal_y.to(device)  # [NB, 2, 6]
        self._b_appeal_rows = [i for i in range(len(rules.b_appeal_y)) if float(rules.b_appeal_y[i].abs().sum()) != 0]
        self._laser_power_load = float(rules.laser_power_load)
        self._biosphere_mult = float(rules.biosphere_power_mult)
        self._b_fuel_slot = rules.b_fuel_slot.to(device)  # [NB] long
        self._b_fuel_rate = rules.b_fuel_rate.to(device)  # [NB] long
        self._b_air_slots = rules.b_air_slots.to(device)  # [NB] long
        # GS STRATEGIC STOCKPILES: one slot per strategic resource, the
        # resource-table id it reads a tile with, and what one improved source
        # pays per turn. `_strat_slot_of` inverts the map for a tile's `rid`.
        _nuc = rules.nuclear
        self._devices = list(_nuc["devices"])
        self._n_devices = len(self._devices)
        self._nuke_radius = [int(d["radius"]) for d in self._devices]
        self._nuke_fallout = [int(d["fallout"]) for d in self._devices]
        self._nuke_range = [int(d["range"]) for d in self._devices]
        self._nuke_upkeep = [float(d["upkeep"]) for d in self._devices]
        self._fallout_damage = float(_nuc["falloutDamage"])
        self._nuke_robot_damage = float(_nuc["robotDamage"])
        self._nuke_cover_range = int(_nuc["coverRange"])
        self._fallout_clean_charges = int(_nuc["cleanCharges"])
        self._silo_iid = int(_nuc["siloIid"])
        self._ww_wmd_launched = float(_nuc["wwLaunched"])
        self._emg_nuclear = int(_nuc["emergencyNuclear"])
        self._emg_nuke_cs = float(_nuc["emergencyNukeCS"])
        self._emg_nuke_loyalty_cut = float(_nuc["emergencyNukeLoyaltyCut"])
        _gdr = rules.gdr
        self._gdr_upgrade_tech = [int(x) for x in _gdr["upgradeTech"]]
        # the upgrades address BY NAME: the catalog is the wire order, and a
        # row appended to it must not move what a clause reads.
        _gdr_ids = [str(x) for x in _gdr["upgradeId"]]
        self._gdr_u_drone = _gdr_ids.index("DRONE_AIR_DEFENSE")
        self._gdr_u_beam = _gdr_ids.index("PARTICLE_BEAM")
        self._gdr_u_moves = _gdr_ids.index("ENHANCED_MOBILITY")
        self._gdr_u_armor = _gdr_ids.index("REINFORCED_ARMOR")
        self._gdr_drone_aa = float(_gdr["droneAA"])
        self._gdr_particle_cs = float(_gdr["particleBeamCS"])
        self._gdr_enhanced_moves = int(_gdr["enhancedMoves"])
        self._gdr_plate_cs = float(_gdr["armorPlatingCS"])
        self._gdr_naval_penalty = float(_gdr["navalPenalty"])
        _st = rules.strategic
        _rsc = rules.resources
        # CIV6 (Resource_Harvests): the HARVEST's yield column, its own base
        # before the progress scale, and the improvement whose unlock gates it
        self._res_harvest_y = torch.tensor(
            [int(x) for x in _rsc.get("harvestYield", [])] or [-1], dtype=torch.long, device=device)
        self._res_harvest_amt = torch.tensor(
            [int(x) for x in _rsc.get("harvestAmount", [])] or [0], dtype=torch.long, device=device)
        self._res_harvest_imp = torch.tensor(
            [int(x) for x in _rsc.get("improvement", [])] or [-1], dtype=torch.long, device=device)
        self._strat_rid = [int(x) for x in _st["rid"]]
        self._strat_rate = [int(x) for x in _st["rate"]]
        self._n_strategic = len(self._strat_rid)
        self._strat_slot_of = torch.tensor([int(x) for x in _st["slotOf"]], dtype=torch.long, device=device)
        self._stock_cap_base = int(_st["capBase"])
        self._fuel_short_cs_val = int(_st["fuelShortCs"])
        self._stock_cap_per_enc = int(_st["capPerEncampmentBuilding"])
        self._encampment_didx = int(_st["encampmentDidx"])
        # SPECIALISTS (data/greatPeople.ts SPECIALIST_YIELDS / SPECIALIST_TIERS,
        # exported per PLACEABLE district): base yields, the TOP buildings that
        # upgrade them (any ONE of them; -2 = any worship building), and the add.
        _ndc = max(len(self.districts_cat), 1)
        self._spec_y = torch.tensor([[float(x) for x in d["spec"]] for d in self.districts_cat] or [[0.0] * 6], dtype=torch.float64, device=device)  # [nD, 6]
        self._spec_tb = [[int(b) for b in d["specTB"]] for d in self.districts_cat]  # [nD][*]
        self._spec_ta = torch.tensor([[float(x) for x in d["specTA"]] for d in self.districts_cat] or [[0.0] * 6], dtype=torch.float64, device=device)  # [nD, 6]
        self._spec_any = self._spec_y.abs().sum(dim=1) > 0  # [nD]
        self._b_dist_oh = (
            torch.nn.functional.one_hot(self._b_req_district.clamp(min=0), _ndc).to(torch.float64)
            * (self._b_req_district >= 0).double().unsqueeze(1)
        )  # [NB, nD] building -> its district column
        self._pk = {n: i for i, n in enumerate(rules.promo_kinds)}
        self._promo_offer_n = int(rules.promo_offer_draw)
        # the two promo classes the ZOC exert test names — CIV6 (Zone of
        # Control): "Ranged and Bombard class units do not exert ZOC"
        self._pc_ranged = rules.promo_classes.index("RANGED") if "RANGED" in rules.promo_classes else -1
        self._pc_siege = rules.promo_classes.index("SIEGE") if "SIEGE" in rules.promo_classes else -1
        self._choke_feats = torch.tensor([int(x) for x in rules.choke_features if int(x) >= 0], dtype=torch.long, device=device)
        self._woods_feats = torch.tensor([int(x) for x in rules.woods_features if int(x) >= 0], dtype=torch.long, device=device)
        self._woods_feat = int(rules.woods_feature)
        self._b_era = rules.b_era.to(device)  # [NB] long — unlock era (Heartbeat of Steam's gate) — per-building training XP (best tier over present buildings)
        # What `_building_dedications` reads besides the era: Free Inquiry pays
        # for a building that provides SCIENCE, Pen Brush and Voice for one
        # carrying a GREAT WORK slot.
        self._b_science = (rules.b_yields[:, 3] > 0).to(device)  # [NB] bool
        # the FAITH a building adds to the Holy Site it stands in — what a
        # religious unit heals off (`holySiteFaith`).
        self._b_hs_faith = (rules.b_yields[:, 5].to(device).long()
                            * (self._b_req_district == self._hs_idx).long())  # [NB]
        self._b_gwslot = torch.zeros(self.NB, dtype=torch.bool, device=device)
        for _k in self._gw_bidx:
            if _k >= 0:
                self._b_gwslot[_k] = True
        self._worship_bidx = [int(x) for x in rules.worship_bidx]
        self._temple_bidx = int(rules.temple_bidx)
        # CIV6 (BuildingReplaces): a civilization's unique building standing in
        # for a row — its district adjacency rule and its coast-resource yields.
        self._bvar_adj: list[tuple[int, int, int, str, float]] = [
            (bi, int(v["civ"]), int(v["adjDist"]), str(v["adjSrc"]), float(v["adjAmt"]))
            for bi, vs in enumerate(rules.b_variants) for v in vs if int(v["adjDist"]) >= 0]
        for _bv in self._bvar_adj:
            assert _bv[3] == "WOODS", f"a building's adjacency source the GPU cannot count: {_bv[3]}"
        self._bvar_coast: list[tuple[int, int, torch.Tensor]] = [
            (bi, int(v["civ"]), torch.tensor([float(x) for x in v["coastResY"]], dtype=dtype, device=device))
            for bi, vs in enumerate(rules.b_variants) for v in vs if any(float(x) for x in v["coastResY"])]
        self._worship_cost = float(rules.worship_faith_cost)
        self._shrine_bidx = int(rules.shrine_bidx)  # missionary buy gate
        self._workshop_bidx = int(rules.workshop_bidx)  # Leonardo's culture perm
        # The completion-overflow / chop bank on the city-block seat axis
        # (row 0 = seat 0, rows 1.. = the civ seats, then the city-state rows
        # for family-shape consistency; every city starts with an empty bank,
        # so unlike the fixture-loaded city_* table it allocates plain).
        self.city_prod_bank = torch.zeros(B, self.n_majors + max(self.S, 1), self.RC, dtype=dtype, device=device)
        # CIV6: production is never lost — a CANCELLED item keeps its own
        # hammers, held against the ITEM's production column until it is
        # queued again (`_q_push` resumes them). Eight columns per city is a
        # capacity choice like the queue's own depth; a full ledger banks
        # nothing more.
        self.city_item_bank = torch.full((B, self.n_majors + max(self.S, 1), self.RC, 8), -1,
                                         dtype=torch.long, device=device)
        self.city_item_amt = torch.zeros(B, self.n_majors + max(self.S, 1), self.RC, 8,
                                         dtype=dtype, device=device)
        self.seat_science_total = torch.zeros(B, self.n_majors, dtype=dtype, device=device)

        self.units_mode = bool(f0.get("unitsMode", 0))
        assert all(bool(f.get("unitsMode", 0)) == self.units_mode for f in fixtures)
        # ONE BATCH IS ONE WORLD PRESET: every plane dimension above was baked
        # from fixtures[0], so a mixed-shape batch would mis-index silently.
        for _k in ("width", "height", "cityStateMax"):
            assert all(f.get(_k) == fixtures[0].get(_k) for f in fixtures), \
                f"mixed-preset batch: {_k} differs across fixtures"
        assert all(len(f["civs"]) == self.n_majors for f in fixtures), \
            "mixed-preset batch: civ count differs across fixtures"
        cb = rules.combat
        self.max_camps = torch.tensor([f.get("maxCamps", 0) for f in fixtures], dtype=torch.long, device=device)
        self.K = int(self.max_camps.max().item()) if self.units_mode else 0
        self.rng_state = torch.tensor([f.get("rngInit", 0) for f in fixtures], dtype=torch.int64, device=device)
        # Tile -> unit-slot occupancy stacking mirrors tileFreeForUnit: a
        # foreign unit blocks a tile entirely; among one seat's own units, one
        # military + one civilian may share.
        self.next_slot = torch.zeros(B, dtype=torch.long, device=device)  # append-only: keeps unit order
        self.game_over = torch.zeros(B, dtype=torch.bool, device=device)
        # WHAT ended the game (0 none, 1 score/turn limit, 2 domination,
        # 3 science, 4 religion, 5 culture, 6 diplomatic) and WHO won it (the
        # seat row, -1 where no condition named one — a turn-limit end has a
        # score leader, not a victor, and that lives in `winner`).
        self.victory_type = torch.zeros(B, dtype=torch.long, device=device)
        self.victory_row = torch.full((B,), -1, dtype=torch.long, device=device)
        self.winner = torch.full((B,), -1, dtype=torch.long, device=device)
        self.project_done = torch.zeros(B, self.n_majors, max(self._n_once, 1), dtype=torch.bool, device=device)
        self.civ_wmd = torch.zeros(B, self.n_majors, max(self._n_devices, 1), dtype=torch.long, device=device)
        self.tile_fallout = torch.zeros(B, self.T, dtype=torch.long, device=device)
        # The Exoplanet flight: LY travelled (-1 = no craft in flight) and the
        # completed laser stations that speed it. Win on ARRIVAL, in step().
        self.space_ly = torch.full((B, self.n_majors), -1, dtype=torch.long, device=device)
        self.civ_orbital_lasers = torch.zeros(B, self.n_majors, dtype=torch.long, device=device)
        self.city_lasers = torch.zeros(B, self.n_majors + max(self.S, 1), self.RC, dtype=torch.long, device=device)
        # GS: the strategic banks, and the POWERED flag the grid resolves to
        # once a turn (every yield reader takes the flag, not a live scan).
        self.civ_stockpile = torch.zeros(B, self.n_majors, max(self._n_strategic, 1), dtype=torch.long, device=device)
        self.civ_fuel_short = torch.zeros(B, self.n_majors, max(self._n_strategic, 1), dtype=torch.bool, device=device)
        self.city_powered = torch.zeros(B, self.n_majors + max(self.S, 1), self.RC, dtype=torch.bool, device=device)
        self.camp_tile = torch.full((B, max(self.K, 1)), -1, dtype=torch.long, device=device)
        self.n_camps = torch.zeros(B, dtype=torch.long, device=device)
        self.unit_next = torch.zeros(B, dtype=torch.long, device=device)
        self.tdef = torch.tensor([[t.get("tdef", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # the terrain PENALTY over a plain step, in `mp_scale` units
        self.tmove = torch.tensor([[t.get("tmove", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.long, device=device)
        # CIV6 (Railroad): the 0.25-Movement route a Military Engineer lays
        # over the road, at the cost of 1 Iron and 1 Coal.
        self.railroad = torch.tensor([[t.get("rr", 0) for t in f["tiles"]] for f in fixtures], dtype=torch.bool, device=device)
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
            raise ValueError(
                "rules.json has no combat.barbLadder — this export predates the ladder. "
                "Re-run the exporter for this fixture set (`npm run seed && npm run export`)."
            )
        self._barb_ladder = torch.tensor(_bl, dtype=torch.long, device=device)
        _bn = rules.combat.get("barbNavalTypes", []) or []
        self._barb_galley_idx = int(_bn[0]) if len(_bn) > 0 else -1
        self._barb_quad_idx = int(_bn[1]) if len(_bn) > 1 else -1
        _bc = rules.combat.get("barbCavalryTypes", []) or []
        self._barb_horseman_idx = int(_bc[0]) if len(_bc) > 0 else -1
        self._barb_knight_idx = int(_bc[1]) if len(_bc) > 1 else -1
        self._barb_horse_res = int(rules.combat["barbHorseRes"])
        self._barb_horse_range = int(rules.combat["barbHorseRange"])
        # EMBARK: the Classical embarked pool, the rungs that raise it, the
        # Mathematics rung every hull and passenger reads, the water-step
        # master switch (`embarkState.live` on the TS side) and the
        # embark/ocean tech gate indices (military embarks on SHIPBUILDING,
        # civilians on SAILING, OCEAN needs CARTOGRAPHY).
        self._embark_moves = int(cb.get("embarkMoves", 2))
        self._embark_move_techs = [(int(a), int(b)) for a, b in cb.get("embarkMoveTechs", [])
                                   if int(a) >= 0]
        self._sea_move_tech = int(cb.get("seaMoveTech", -1))
        self._sea_move_bonus = int(cb.get("seaMoveBonus", 1))
        # CIV6 (Combat): the CS an embarked unit DEFENDS at, by the OWNER's
        # technological era; and the two "Unit class modifiers", with the civic
        # that unlocks flanking and support at all.
        self._embarked_def_by_era = torch.tensor(
            [int(x) for x in cb.get("embarkedDefenseCsByEra", [15])], dtype=torch.long, device=device)
        self._class_melee_vs_anticav = int(cb.get("classMeleeVsAnticav", 5))
        self._class_anticav_vs_cav = int(cb.get("classAnticavVsCav", 10))
        self._flank_support_civic = int(cb.get("flankSupportCivic", -1))
        self._amphibious_attack_cs = int(cb.get("amphibiousAttackCs", 10))
        self._fort_def_cs = int(cb.get("fortDefenseCs", 4))
        self._embark_live = bool(cb.get("embarkLive", 0))
        self._shipbuilding_tech = int(cb.get("shipbuildingTech", -1))
        self._sailing_tech = int(cb.get("sailingTech", -1))
        self._cartography_tech = int(cb.get("cartographyTech", -1))
        self._celestial_tech = int(cb.get("celestialTech", -1))
        ru = rules.units or [{"id": "WARRIOR", "cost": 40, "combat": 20, "maintenance": 0, "civilian": 0, "requiresTech": -1}]
        self.NU = len(ru)
        # THE PRODUCTION LAYOUT (cpu/core/prodLayout.ts), named once. It is the
        # space the wire's action codes ride in, the space `city_current`
        # stores its queue head in for EVERY seat row, and the space the state
        # compare's queueColumn twin decodes — one layout, so a code cannot
        # mean one thing on row 0 and another on a civ row.
        self.UNIT_BASE = NB + 2  # production action codes NB+2 … NB+1+NU train units
        self.DISTRICT_BASE = NB + 2 + self.NU
        self.WONDER_BASE = self.DISTRICT_BASE + len(self._scaffold)
        self.PROJECT_BASE = self.WONDER_BASE + self._wond_n
        # FORM trains the unit AS A FORMATION — the corps block then the army
        # block — and PROMOTE closes the layout: code PROMOTE_BASE + k moves
        # queue entry k+1 to the head. There is no column for entry 0 — it is
        # the head already.
        self.FORM_BASE = self.PROJECT_BASE + len(self._proj_rows)
        self.PROMOTE_BASE = self.FORM_BASE + 2 * self.NU
        self._type_cost = torch.tensor([u["cost"] for u in ru], dtype=dtype, device=device)
        self._type_combat = torch.tensor([u["combat"] for u in ru], dtype=torch.long, device=device)
        self._type_maintenance = torch.tensor([u["maintenance"] for u in ru], dtype=dtype, device=device)
        self._type_civilian = torch.tensor([bool(u["civilian"]) for u in ru], dtype=torch.bool, device=device)
        self._type_military = torch.tensor([bool(u["military"]) for u in ru], dtype=torch.bool, device=device)
        self._type_ranged_strength = torch.tensor([u.get("rangedStrength", 0) for u in ru], dtype=torch.long, device=device)  # 0 = melee-only
        self._type_ranged_range = torch.tensor([u.get("rangedRange", 0) for u in ru], dtype=torch.long, device=device)  # strike range
        self._type_moves = torch.tensor([u.get("moves", 2) for u in ru], dtype=torch.long, device=device)  # full MP per turn
        # NAVAL unit flag per roster index. A naval mover stands on water
        # natively; an embarked LAND mover stands on water via the embark gate.
        # Read at the war-march passability composition.
        self.unit_naval = torch.tensor([bool(u.get("naval", 0)) for u in ru], dtype=torch.bool, device=device)
        # CIV6 (Giant Death Robot): "Can move and fight in Ocean and Coast
        # tiles as it would on land" — water is simply ground to such a
        # chassis, so it never embarks and asks no seafaring tech.
        self.unit_water_walk = torch.tensor([bool(u.get("ww", 0)) for u in ru], dtype=torch.bool, device=device)
        self._type_heal_friendly = torch.tensor([bool(u.get("healFriendly", 0)) for u in ru], dtype=torch.bool, device=device)
        self._type_nuke_cover = torch.tensor([bool(u.get("nukeCover", 0)) for u in ru], dtype=torch.bool, device=device)
        self._type_nuke_carry = torch.tensor([bool(u.get("nukeCarry", 0)) for u in ru], dtype=torch.bool, device=device)
        self._type_cavalry = torch.tensor([bool(u.get("cavalry", 0)) for u in ru], dtype=torch.bool, device=device)  # light+heavy cavalry (Preslav)
        # THE SIEGE CLASSES. `_type_bombard` > 0 marks a unit whose attack
        # "uses Bombard Strength": full damage to a perimeter, no city penalty,
        # and no melee attack at all. `_type_siege_support` is the support
        # chassis (1 Battering Ram, 2 Siege Tower) and `_type_siege_max_walls`
        # the highest walls tier it still works against. The ram and the tower
        # help MELEE and ANTI-CAVALRY attackers and nobody else.
        self._type_melee = torch.tensor([bool(u.get("melee", 0)) for u in ru], dtype=torch.bool, device=device)
        self._type_anticav = torch.tensor([bool(u.get("antiCavalry", 0)) for u in ru], dtype=torch.bool, device=device)
        # the per-TYPE flat Combat Strength each government/policy row grants
        # (`_gov_unit_cs`): a promotion-class mask hit, or the all-combat
        # arm, both gated on the chassis carrying any strength at all.
        _pcls = self.rules_dev.u_promo_class
        _pbit = torch.where(_pcls >= 0, torch.ones_like(_pcls) << _pcls.clamp(min=0), torch.zeros_like(_pcls))
        _pcbt = self._type_combat > 0
        if self._ngov:
            _ghit = (((self._gov_ucs_mask.unsqueeze(1) & _pbit.unsqueeze(0)) != 0)
                     | self._gov_ucs_allc.unsqueeze(1)) & _pcbt.unsqueeze(0)
            self._gov_ucs_by_type = self._gov_ucs_cs.unsqueeze(1) * _ghit.double()
        if self._npol:
            _phit = (((self._pol_ucs_mask.unsqueeze(1) & _pbit.unsqueeze(0)) != 0)
                     | self._pol_ucs_allc.unsqueeze(1)) & _pcbt.unsqueeze(0)
            self._pol_ucs_by_type = self._pol_ucs_cs.unsqueeze(1) * _phit.double()
        self._type_bombard = torch.tensor([int(u.get("bombard", 0)) for u in ru], dtype=torch.long, device=device)
        # the CLASS bit mask and the ERA index a production card reads
        self._type_cls = torch.tensor([int(u.get("cls", 0)) for u in ru], dtype=torch.long, device=device)
        self._type_era = torch.tensor([int(u.get("era", 0)) for u in ru], dtype=torch.long, device=device)
        self._type_recon = torch.tensor([bool(u.get("recon", 0)) for u in ru], dtype=torch.bool, device=device)
        # CIV6 (PROMOTION_CLASS_LIGHT_CAVALRY): `COPY_CLASSES[0]`'s plane
        self._type_lightcav = torch.tensor([bool(u["lightcav"]) for u in ru], dtype=torch.bool, device=device)
        # THE NAVAL RAIDER AXIS. `_type_sight` is the chassis override; 0 means
        # the SIGHT_RANGE default, which `_unit_sight` supplies.
        self._type_stealth = torch.tensor([bool(u.get("stealth", 0)) for u in ru], dtype=torch.bool, device=device)
        # CIV6: the NAVAL RAIDER class — "Can perform Coastal Raids."
        self._type_raider = torch.tensor([bool(u.get("raider", 0)) for u in ru], dtype=torch.bool, device=device)
        # CIV6 (Anti-Air Gun, Mobile SAM): "Provides cover from air attacks up
        # to 1 hex away from the weapon"; -1 covers nothing. `_air_cover_scan`
        # walks the target hex and its own ring, so a wider weapon would need a
        # wider walk — the assert is the tripwire for that.
        self._type_anti_air_range = torch.tensor(
            [int(u.get("antiAirRange", -1)) for u in ru], dtype=torch.long, device=device)
        self._air_cover_max = int(self._type_anti_air_range.max().item()) if len(ru) else -1
        assert self._air_cover_max <= 1, (
            f"a chassis covers {self._air_cover_max} hexes; _air_cover_scan walks one ring")
        self._type_reveal = torch.tensor([bool(u.get("revealStealth", 0)) for u in ru], dtype=torch.bool, device=device)
        self._type_zoc_ignore = torch.tensor([bool(u.get("ignoresZoc", 0)) for u in ru], dtype=torch.bool, device=device)
        self._type_zoc_none = torch.tensor([bool(u.get("exertsNoZoc", 0)) for u in ru], dtype=torch.bool, device=device)
        self._type_sight = torch.tensor([int(u.get("sight", 0)) for u in ru], dtype=torch.long, device=device)
        # a chassis is not the only hider: Twilight Veil is a PROMOTION.
        _veil = self._pk.get("STEALTH", -1)
        self._stealth_live = bool(self._type_stealth.any()) or (
            _veil >= 0 and bool((rules.promo_kind == _veil).any()))
        self._type_siege_support = torch.tensor([int(u.get("siegeSupport", 0)) for u in ru], dtype=torch.long, device=device)
        self._type_siege_max_walls = torch.tensor([int(u.get("siegeMaxWalls", 0)) for u in ru], dtype=torch.long, device=device)
        self._siege_support_any = bool((self._type_siege_support > 0).any())
        self._siege_support_idx = [i for i, v in enumerate(self._type_siege_support.tolist()) if int(v) > 0]
        self._type_tech = torch.tensor([u["requiresTech"] for u in ru], dtype=torch.long, device=device)
        self._type_civic = torch.tensor([u.get("requiresCivic", -1) for u in ru], dtype=torch.long, device=device)
        self._type_needs_slot = torch.tensor([bool(u.get("needsArtifactSlot", 0)) for u in ru], dtype=torch.bool, device=device)
        # a building the TRAINING city must hold (the Military Engineer's Armory)
        self._type_req_bldg = torch.tensor([int(u.get("requiresBuilding", -1)) for u in ru], dtype=torch.long, device=device)
        self._type_resource = torch.tensor([int(u.get("requiresResource", -1)) for u in ru], dtype=torch.long, device=device)
        self._res_unit_pairs = [(i, int(u.get("requiresResource", -1))) for i, u in enumerate(ru) if int(u.get("requiresResource", -1)) >= 0]
        # GS: the STOCKPILE slot a unit charges, and what it charges.
        self._type_res_slot = torch.tensor([int(u.get("resSlot", -1)) for u in ru], dtype=torch.long, device=device)
        self._type_res_cost = torch.tensor([int(u.get("resCost", 0)) for u in ru], dtype=torch.long, device=device)
        self._res_slot_units = [(i, int(u.get("resSlot", -1)), int(u.get("resCost", 0)))
                                for i, u in enumerate(ru) if int(u.get("resSlot", -1)) >= 0]
        # GS: a FUEL unit bills its resource EVERY turn it lives.
        self._type_res_upkeep = torch.tensor([int(u.get("resUpkeep", 0)) for u in ru], dtype=torch.long, device=device)
        self._upkeep_units = [(i, int(u.get("resSlot", -1)), int(u.get("resUpkeep", 0)))
                              for i, u in enumerate(ru)
                              if int(u.get("resSlot", -1)) >= 0 and int(u.get("resUpkeep", 0)) > 0]
        # the upgrade ladder: the roster index this chassis becomes.
        self._type_up_to = torch.tensor([int(u.get("upTo", -1)) for u in ru], dtype=torch.long, device=device)
        self._type_anti_air = torch.tensor([int(u.get("antiAir", 0)) for u in ru], dtype=torch.long, device=device)
        # AIR: 0 = not an aircraft, 1 = fighter, 2 = bomber; `airSlots` is what
        # a chassis provides as a BASE (the Aircraft Carrier).
        self._type_air = torch.tensor([int(u.get("air", 0)) for u in ru], dtype=torch.long, device=device)
        self._type_air_slots = torch.tensor([int(u.get("airSlots", 0)) for u in ru], dtype=torch.long, device=device)
        self._gdr_idx = next((i for i, u in enumerate(ru) if int(u.get("gdr", 0))), -1)
        self._spy_idx = next((i for i, u in enumerate(ru) if int(u.get("spy", 0))), -1)
        self._type_no_gold = torch.tensor([bool(u.get("noGold", 0)) for u in ru], dtype=torch.bool, device=device)
        self._any_air = bool((self._type_air > 0).any())
        self._type_charges = torch.tensor([u.get("charges", 0) for u in ru], dtype=torch.long, device=device)
        self._type_faith_only = torch.tensor([bool(u.get("fo", 0)) for u in ru], dtype=torch.bool, device=device)
        self._type_spawn_only = torch.tensor([bool(u.get("so", 0)) for u in ru], dtype=torch.bool, device=device)
        self._warrior_idx = next((i for i, u in enumerate(ru) if u["id"] == "WARRIOR"), 0)
        self._settler_idx = next((i for i, u in enumerate(ru) if bool(u.get("settler", 0))), -1)
        self._type_settler = torch.tensor([bool(u.get("settler", 0)) for u in ru], dtype=torch.bool, device=device)
        # THE UNIQUE UNITS (`uniqueTo` / `replaces` and the chassis terms only
        # a unique carries): `_civ_unit_ok` hands each to its civilization.
        self._type_uniq = torch.tensor([int(u["uniq"]) for u in ru], dtype=torch.long, device=device)
        self._type_repl = torch.tensor([int(u["repl"]) for u in ru], dtype=torch.long, device=device)
        self._type_chariot = torch.tensor([bool(u["chariot"]) for u in ru], dtype=torch.bool, device=device)
        self._type_open_mp = torch.tensor([int(u["openMoves"]) for u in ru], dtype=torch.long, device=device)
        self._type_enemy_mp = torch.tensor([int(u["enemyMoves"]) for u in ru], dtype=torch.long, device=device)
        self._type_coast_mp = torch.tensor([int(u["coastMoves"]) for u in ru], dtype=torch.long, device=device)
        self._type_atk_cs = torch.tensor([int(u["atkCs"]) for u in ru], dtype=torch.long, device=device)
        self._type_def_melee_cs = torch.tensor([int(u["defMeleeCs"]) for u in ru], dtype=torch.long, device=device)
        self._type_fort_builder = torch.tensor([bool(u["fortBuilder"]) for u in ru], dtype=torch.bool, device=device)
        _uq = rules.uniques
        self._civ_ids: list[str] = list(_uq["civs"])
        self._open_terr = torch.tensor([int(t) for t in _uq["openTerrains"]], dtype=torch.long, device=device)
        self._coast_terr = int(_uq["coastTerrain"])
        # `civReplacement` as a table: row c = civilization c's unique standing
        # in for each base chassis (-1 where none); the LAST row plays none.
        _nc = len(self._civ_ids)
        self._civ_repl = torch.full((_nc + 1, self.NU), -1, dtype=torch.long, device=device)
        for _i, _u in enumerate(ru):
            if int(_u["uniq"]) >= 0 and int(_u["repl"]) >= 0:
                self._civ_repl[int(_u["uniq"]), int(_u["repl"])] = _i
        # [B, NS] long — the roster ROW (`Seat.civ`) a seat plays per game, its
        # civilization and its leader; -1 plays nothing
        self._pair_leader: list[str] = list(_uq["leaders"])
        self._pair_civ: list[int] = [int(x) for x in _uq["pairCiv"]]
        self.row_leader = torch.tensor(_row_pair, dtype=torch.long, device=device)
        self.row_civ = torch.where(self.row_leader >= 0,
                                   torch.tensor(self._pair_civ + [-1], dtype=torch.long, device=device)[self.row_leader.clamp(min=0)],
                                   torch.full_like(self.row_leader, -1))
        _ab = _uq["abilities"]
        self._iteru_mult = float(_ab["iteruProdMult"])
        self._knarr_heal = int(_ab["knarrNeutralHeal"])
        self._epic_levy_mult = float(_ab["epicQuestLevyMult"])
        self._rome_post_gold = float(_ab["romeOwnPostGold"])
        _la = _uq["leaderAbilities"]
        self._cleo_intl_gold = float(_la["cleopatraIntlGold"])
        self._cleo_in_food = float(_la["cleopatraIncomingFood"])
        self._cleo_in_gold = float(_la["cleopatraIncomingGold"])
        self._cleo_trade_qp_mult = int(_la["cleopatraTradeQpMult"])
        self._hard_naval_prod = float(_la["hardradaNavalMeleeProdMult"])
        _ni = len(rules.improvements["ids"])
        self._hard_plun_kind = torch.zeros(_ni, dtype=torch.long, device=device)
        self._hard_plun_amt = torch.zeros(_ni, dtype=torch.long, device=device)
        for _ii, _k, _a in _la["hardradaPillage"]:
            self._hard_plun_kind[int(_ii)] = int(_k)
            self._hard_plun_amt[int(_ii)] = int(_a)
        self._enkidu_cs = int(_la["enkiduWarCs"])
        self._enkidu_qp = int(_la["enkiduCommonFoeQp"])
        self._enkidu_range = int(_la["enkiduShareRange"])
        # CIV6 (EFFECT_ADJUST_PLOT_YIELD): the roster's plot rows, one tensor
        # per column (`PLOT_YIELD_ROWS`)
        _py = [[int(x) if i != 3 else float(x) for i, x in enumerate(r)] for r in _uq["plotYields"]]
        # the plot plane also pays the terrain-adjacency rows, so it must run
        # whenever EITHER family is on the wire
        self._plot_rows_any = len(_py) > 0 or bool(_uq["terrainAdjYields"])
        _col = lambda i, dt: torch.tensor([r[i] for r in _py] or [0], dtype=dt, device=device)  # noqa: E731
        self._py_civ, self._py_leader, self._py_yield = _col(0, torch.long), _col(1, torch.long), _col(2, torch.long)
        self._py_amt = _col(3, dtype)
        self._py_terr, self._py_hills, self._py_imp, self._py_feat = _col(4, torch.long), _col(5, torch.long), _col(6, torch.long), _col(7, torch.long)
        self._py_anyimp, self._py_civic, self._py_mtn, self._py_era = _col(8, torch.long), _col(9, torch.long), _col(10, torch.long), _col(11, torch.long)
        # the roster's other data families (`PROD_MULT_ROWS`, `DISTRICT_ADJ_ROWS`,
        # `INTL_ROUTE_YIELD_ROWS`, `ROUTE_CAPACITY_ROWS`): python lists of
        # tuples, each site reads the columns it needs
        _pcl = list(rules.promo_classes)
        # [civ, leaderRow, building, buildings-of-district, promoClass, pct, districtItem, every (1 building / 2 unit), unit]
        # ...the last field gates the row on the city sitting OFF the seat's
        # home continent (`offHomeContinent`, C-48)
        self._prod_mult_rows: list[tuple[int, int, int, int, int, float, int, int, int, int]] = [
            (int(r[0]), int(r[1]), int(r[2]), int(r[3]), (_pcl.index(r[4]) if r[4] in _pcl else -1), float(r[5]),
             int(r[6]), int(r[7]), int(r[8]), int(r[9]))
            for r in _uq["prodMults"]]
        # [civ, leaderRow, district, amount, source (0 adjacent districts / 1 the river)]
        self._district_adj_rows: list[tuple[int, int, int, float, int]] = [
            (int(r[0]), int(r[1]), int(r[2]), float(r[3]), int(r[4])) for r in _uq["districtAdj"]]
        # THE CITY'S ROWS (`CENTER_ADJ_ROWS` and its siblings): [civ, leaderRow, ...clauses]
        self._center_adj_rows: list[tuple[int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["centerAdj"]]  # type: ignore[misc]
        self._great_work_yield_rows: list[tuple[int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["greatWorkYields"]]  # type: ignore[misc]
        self._gpp_class_rows: list[tuple[int, int, int, float]] = [
            (int(r[0]), int(r[1]), int(r[2]), float(r[3])) for r in _uq["gppClass"]]
        self._powered_yield_rows: list[tuple[int, int, int, float]] = [
            (int(r[0]), int(r[1]), int(r[2]), float(r[3])) for r in _uq["poweredYields"]]
        # [civ, leaderRow, resource (RESOURCE_IDS), terrain, amount, pct]
        self._stockpile_rate_rows: list[tuple[int, int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["stockpileRate"]]  # type: ignore[misc]
        self._stockpile_cap_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["stockpileCap"]]  # type: ignore[misc]
        self._unit_charge_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["unitCharges"]]  # type: ignore[misc]
        self._tile_cost_rows: list[tuple[int, int, int, float]] = [
            (int(r[0]), int(r[1]), int(r[2]), float(r[3])) for r in _uq["tileCost"]]
        # [civ, leaderRow, terrain, hills, civic]
        self._farm_terrain_rows: list[tuple[int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["farmTerrain"]]  # type: ignore[misc]
        # [civ, leaderRow, improvement, yield, amount, side (0 origin / 1 destination)]
        self._route_improvement_rows: list[tuple[int, int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["routeImprovement"]]  # type: ignore[misc]
        # [civ, leaderRow, unit, tech, firstCity]
        # [civ, leaderRow, unit, tech, firstCity, promoClass, foreignContinent]
        # — unit -1 with a promoClass means "the best chassis of that class
        # the seat could train" (`bestTrainableOfClass`, C-48)
        self._grant_unit_rows: list[tuple[int, int, int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["grantUnits"]]  # type: ignore[misc]
        self._spy_capacity_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["spyCapacity"]]  # type: ignore[misc]
        # [civ, leaderRow, firstCityPop, palaceHousing, palaceAmenities, presettle yields x6]
        self._capital_rows: list[tuple[int, int, int, int, int, list[float]]] = [
            (int(r[0]), int(r[1]), int(r[2]), int(r[3]), int(r[4]), [float(x) for x in r[5:11]]) for r in _uq["capital"]]
        # THE SEAT'S ROWS: happiness, policy slots and what a kill pays
        # [civ, leaderRow, tier (amenityTiers index), yield, pct]
        self._happy_yield_rows: list[tuple[int, int, int, int, float]] = [
            (int(r[0]), int(r[1]), int(r[2]), int(r[3]), float(r[4])) for r in _uq["happyYields"]]
        # [civ, leaderRow, tier, class, district, amount]
        self._happy_gpp_rows: list[tuple[int, int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["happyGpp"]]  # type: ignore[misc]
        self._policy_slot_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["policySlots"]]  # type: ignore[misc]
        self._post_combat_yield_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["postCombatYields"]]  # type: ignore[misc]
        # THE MOUNTAIN, THE GOVERNOR AND THE FORMATION
        self._work_mountain_rows: list[tuple[int, int]] = [
            (int(r[0]), int(r[1])) for r in _uq["workMountains"]]
        self._route_terrain_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["routeTerrain"]]  # type: ignore[misc]
        # [civ, leaderRow, improvement, yield, amount] on a MOUNTAIN tile
        self._terrain_adj_yield_rows: list[tuple[int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["terrainAdjYields"]]  # type: ignore[misc]
        # [civ, leaderRow, yield, pct, founded]
        self._governor_yield_rows: list[tuple[int, int, int, float, int]] = [
            (int(r[0]), int(r[1]), int(r[2]), float(r[3]), int(r[4])) for r in _uq["governorYields"]]
        self._governor_loyalty_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["governorLoyalty"]]  # type: ignore[misc]
        self._garrison_loyalty_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["garrisonLoyalty"]]  # type: ignore[misc]
        # [civ, leaderRow, tier, naval, civic, cs]
        self._formation_rows: list[tuple[int, int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["formations"]]  # type: ignore[misc]
        # THE TITLE, THE PRIZE, THE START AND THE BAN
        # [civ, leaderRow, yield, pct] per governor PROMOTION in the city
        self._governor_title_yield_rows: list[tuple[int, int, int, float]] = [
            (int(r[0]), int(r[1]), int(r[2]), float(r[3])) for r in _uq["governorTitleYields"]]
        # [civ, leaderRow, building, greatPersonClass, amount]
        self._gpp_building_rows: list[tuple[int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["gppBuildings"]]  # type: ignore[misc]
        self._gp_favor_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["gpFavor"]]  # type: ignore[misc]
        self._start_tech_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["startTechs"]]  # type: ignore[misc]
        # [civ, leaderRow, ban] — the ban's index is `SEAT_BANS` order
        self._seat_ban_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["seatBans"]]  # type: ignore[misc]
        # [civ, leaderRow, costPct, yieldPct] on the worship building
        self._worship_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["worship"]]  # type: ignore[misc]
        # THE CONQUERED CITY, THE SECOND HORSE AND THE BOOST
        # [civ, leaderRow, COPY_CLASSES index, amount] on a TRAINED unit
        self._extra_unit_copy_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["extraUnitCopies"]]  # type: ignore[misc]
        self._conquest_pop_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["conquestPop"]]  # type: ignore[misc]
        # [civ, leaderRow, channel (0 amenity / 1 loyalty), amount]
        self._not_founded_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["notFounded"]]  # type: ignore[misc]
        self._extra_district_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["extraDistricts"]]  # type: ignore[misc]
        self._city_tiles_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["cityTiles"]]  # type: ignore[misc]
        # [civ, leaderRow, tech(1)/civic(0), PERCENTAGE POINTS on the boost]
        self._boost_pct_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["boostPct"]]  # type: ignore[misc]
        # [civ, leaderRow, district, tech] — REPLACES the district's own unlock
        self._district_prereq_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["districtPrereq"]]  # type: ignore[misc]
        self._war_weariness_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["warWeariness"]]  # type: ignore[misc]
        self._peaceful_founder_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["peacefulFounders"]]  # type: ignore[misc]
        self._yield_per_suzerain_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["yieldPerSuzerain"]]  # type: ignore[misc]
        self._governor_title_grant_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["governorTitleGrants"]]  # type: ignore[misc]
        self._gp_refund_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["gpRefund"]]  # type: ignore[misc]
        self._evict_pct_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["evictPct"]]  # type: ignore[misc]
        # [civ, leaderRow, improvement, district] — exactly one of the last two
        # CIV6 (Mediterranean Colonies): whose COASTAL cities on their home
        # continent are 100% Loyal, by civilization index
        self._coastal_home_loyal = torch.tensor(
            [int(x) for x in _uq.get("coastalHomeLoyal", [])] or [0],
            dtype=torch.bool, device=device)
        self._culture_bomb_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["cultureBombs"]]  # type: ignore[misc]
        # THE SLOT, THE GREAT WORK AND THE CONQUERED FORMATION
        # [civ, leaderRow, fromSlot, toSlot] in SLOT_KINDS order
        self._slot_convert_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["slotConvert"]]  # type: ignore[misc]
        self._slot_favor_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["slotFavor"]]  # type: ignore[misc]
        self._plaza_district_prod_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["plazaDistrictProd"]]  # type: ignore[misc]
        # [civ, leaderRow, amount (NEGATIVE), range] per Great Work
        self._great_work_loyalty_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["greatWorkLoyalty"]]  # type: ignore[misc]
        self._park_appeal_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["parkAppeal"]]  # type: ignore[misc]
        # [civ, leaderRow, pct, founded]
        self._governor_xp_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["governorXp"]]  # type: ignore[misc]
        self._conquest_formation_rows: list[tuple[int, int]] = [
            tuple(int(x) for x in r) for r in _uq["conquestFormation"]]  # type: ignore[misc]
        self._spy_promo_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["spyPromos"]]  # type: ignore[misc]
        # THE WONDER, THE RIVER AND THE POST
        # [civ, leaderRow, startEra, endEra, pct] — an ERA BAND on a wonder
        self._wonder_era_prod_rows: list[tuple[int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["wonderEraProd"]]  # type: ignore[misc]
        # [civ, leaderRow, startEra, endEra, pct] — the same band, spent as a
        # Builder's CHARGE rather than per-turn Production (C-55)
        self._wonder_charge_rows: list[tuple[int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["wonderCharge"]]  # type: ignore[misc]
        # [civ, leaderRow, techs, civics] — a random Eureka and Inspiration
        # from the ERA of the wonder just completed (C-54)
        self._wonder_era_boost_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["wonderEraBoost"]]  # type: ignore[misc]
        self._wonder_tourism_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["wonderTourism"]]  # type: ignore[misc]
        # [civ, leaderRow, district(1)/building(0), pct] ACROSS A RIVER
        self._river_cross_prod_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["riverCrossProd"]]  # type: ignore[misc]
        self._immediate_post_rows: list[tuple[int, int]] = [
            tuple(int(x) for x in r) for r in _uq["immediatePosts"]]  # type: ignore[misc]
        # [civ, leaderRow, postLevels, csPerLevel, flatLevels]
        self._diplo_vis_rows: list[tuple[int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["diploVis"]]  # type: ignore[misc]
        # [civ, leaderRow, ban] — the ban's index is `WAR_BANS` order
        self._war_ban_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["warBans"]]  # type: ignore[misc]
        self._tourism_favor_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["tourismFavor"]]  # type: ignore[misc]
        self._emergency_favor_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["emergencyFavor"]]  # type: ignore[misc]
        self._golden_dedication_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["goldenDedication"]]  # type: ignore[misc]
        # [civ, leaderRow, terrain, flatOnly, yield, amount] on an INTERNATIONAL leg
        self._intl_route_terrain_rows: list[tuple[int, int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["intlRouteTerrain"]]  # type: ignore[misc]
        self._golden_route_capacity_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["goldenRouteCapacity"]]  # type: ignore[misc]
        self._progress_trade_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["progressTrade"]]  # type: ignore[misc]
        # THE FOLLOWER, THE LEVY AND THE ROUTE
        # [civ, leaderRow, followers, amenities]
        self._religion_amenity_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["religionAmenities"]]  # type: ignore[misc]
        self._all_follower_belief_rows: list[tuple[int, int]] = [
            tuple(int(x) for x in r) for r in _uq["allFollowerBeliefs"]]  # type: ignore[misc]
        # CIV6 (Epic Quest): a cleared barbarian outpost pays a village reward —
        # the install maps the camp to a goody hut outright, so it is the SAME
        # draw off the SAME table (C-47)
        self._camp_goody_rows: list[tuple[int, int]] = [
            tuple(int(x) for x in r) for r in _uq["campGoody"]]  # type: ignore[misc]
        # [civ, leaderRow, featureIdx, amount] — CIV6 (Amazon): what an adjacent
        # FEATURE is worth to this seat's appeal, over the map-global walk (C-50)
        self._feature_appeal_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["featureAppeal"]]  # type: ignore[misc]
        # CIV6 (Poundmaker): this seat's alliances share MAP visibility (C-70)
        self._alliance_shared_vis_rows: list[tuple[int, int]] = [
            tuple(int(x) for x in r) for r in _uq["allianceSharedVis"]]  # type: ignore[misc]

        # TRIBAL VILLAGES (C-47) — the install's own table, straight off the
        # wire so the GPU draws what TS draws. Kind weights are all equal, so
        # the kind draw is uniform over the kinds with an eligible subtype.
        _gh = rules.goody_huts
        self._goody_kinds: list[str] = list(_gh["kinds"])
        self._goody_payload_kinds: list[str] = list(_gh["payloadKinds"])
        self._goody_sub = [
            (str(r["id"]), int(r["hut"]), int(r["weight"]), int(r["turn"]),
             int(r["minOneCity"]), int(r["payload"]), int(r["amount"]),
             int(r["unit"]), str(r["promoClass"]))
            for r in _gh["subTypes"]
        ]
        # every channel the wire names must have an arm, or a reward silently
        # pays nothing (the disjoint-arms class)
        self._goody_ch = {k: i for i, k in enumerate(self._goody_payload_kinds)}
        # [civ, leaderRow, origin, destination, pct]
        self._route_pressure_rows: list[tuple[int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["routePressure"]]  # type: ignore[misc]
        # [civ, leaderRow, yield, amount, per] per FOREIGN city following it
        self._foreign_follower_yield_rows: list[tuple[int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["foreignFollowerYields"]]  # type: ignore[misc]
        self._gp_guarantee_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["gpGuarantee"]]  # type: ignore[misc]
        self._faith_purchase_district_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["faithPurchaseDistricts"]]  # type: ignore[misc]
        self._start_boost_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["startBoosts"]]  # type: ignore[misc]
        # [civ, leaderRow, amount, goldenExtra] — both NEGATIVE, a loyalty loss
        self._post_combat_loyalty_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["postCombatLoyalty"]]  # type: ignore[misc]
        # [civ, leaderRow, upgradeDiscountPct, envoys, levyMoves, levyCombat] (C-66)
        # [civ, leaderRow, governmentIndex, ratePct] — America's nine
        # TRAIT_*_BONUS_RATE rows, added to the base 100 (C-63).
        self._legacy_rate_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["legacyRates"]]  # type: ignore[misc]
        self._levy_rows: list[tuple[int, int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["levy"]]  # type: ignore[misc]
        self._domestic_route_loyalty_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["domesticRouteLoyalty"]]  # type: ignore[misc]
        self._incoming_route_yield_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["incomingRouteYields"]]  # type: ignore[misc]
        # [civ, leaderRow, tech] — the tech an OCEAN crossing waits on, -1 none
        self._ocean_access_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["oceanAccess"]]  # type: ignore[misc]
        # [civ, leaderRow, district, unit] on that district's COMPLETION
        self._district_unit_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["districtUnits"]]  # type: ignore[misc]
        self._apply_roster_start()
        # [civ, leaderRow, yield, amount, intercontinental] — the last gates
        # the row on the route's two ENDPOINTS sitting on different
        # landmasses (`_route_intercontinental`, C-48)
        self._intl_route_rows: list[tuple[int, int, int, float, int]] = [
            (int(r[0]), int(r[1]), int(r[2]), float(r[3]), int(r[4]))
            for r in _uq["intlRouteYields"]]
        self._domestic_route_rows: list[tuple[int, int, int, float, int]] = [
            (int(r[0]), int(r[1]), int(r[2]), float(r[3]), int(r[4]))
            for r in _uq["domesticRouteYields"]]
        # ...the last field pays the amount once PER city off the home
        # continent (`perForeignCity`, C-48)
        self._route_cap_rows: list[tuple[int, int, int, int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["routeCapacity"]]  # type: ignore[misc]
        # [civ, leaderRow, amount, classMask, when, per (1 = per slotted MILITARY policy)]
        self._combat_cs_rows: list[tuple[int, int, int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["combatCs"]]  # type: ignore[misc]
        self._post_kill_heal_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["postKillHeal"]]  # type: ignore[misc]
        # [civ, leaderRow, classMask] — CIV6 (Mongol Horde): a defeated unit of
        # the mask's class may be CAPTURED by an attacker of the same class
        self._capture_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["captureUnits"]]  # type: ignore[misc]
        self._captured_hp = int(rules.combat["capturedHp"])
        self._capture_base_diff = int(rules.combat["captureBaseDiff"])
        self._embark_move_rows: list[tuple[int, int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["embarkMoves"]]  # type: ignore[misc]
        self._ignore_shores_rows: list[tuple[int, int, int]] = [
            tuple(int(x) for x in r) for r in _uq["ignoreShores"]]  # type: ignore[misc]
        # the naval MELEE line (`navalMelee`): a hull with no ranged strength
        # that is neither a raider nor a carrier
        self._type_naval_melee = (self.unit_naval & (self._type_ranged_strength == 0)
                                  & ~self._type_raider & (self._type_air_slots == 0))
        self._trader_idx = next(i for i, u in enumerate(ru) if bool(u.get("trader", 0)))
        # SCOUT is a military explorer (combat 10) but never in the civ roster
        # (BUY_UNITS and the ladder exclude it). The production ladder
        # prefers WARRIOR anyway, but the gold buy's affordability gate can
        # leave SCOUT the only affordable candidate, so it is masked out of the
        # buy set to mirror TS.
        self._scout_idx = next((i for i, u in enumerate(ru) if u["id"] == "SCOUT"), -1)
        self._general_unit_idx = int(rr.get("generalUnitIdx", -1))
        self._admiral_unit_idx = int(rr.get("admiralUnitIdx", -1))
        self._admiral_march_live = bool(rr.get("admiralMarchLive", False))
        self._general_cls = int(rr.get("generalClassIdx", -1))
        self._admiral_cls = int(rr.get("admiralClassIdx", -1))
        self._gen_aura_cs_val = float(rr.get("generalAuraCs", 5))
        self._gen_aura_range = int(rr.get("generalAuraRange", 2))
        self._gen_aura_mp = int(rr.get("generalAuraMp", 1))  # the aura's movement half, already in mp_scale units
        self._gen_off = tiles_within_offsets(self._gen_aura_range).to(device)  # aura disk (hexDistance ≤ range)

        self._prereq_t = self._prereq_matrix(rules.t_prereqs, NT).to(device)
        self._prereq_c = self._prereq_matrix(rules.c_prereqs, NC).to(device)
        self._arangeT = torch.arange(T, device=device)
        self._arangeT_f = self._arangeT.to(dtype)
        # The two halves of a TILE-ORDER argmin key, [B, T]: the tile index
        # where the scan hits and an out-of-range sentinel where it does not.
        # Both are read-only constants a per-unit scan would otherwise re-fill.
        self._arange_bt = self._arangeT.unsqueeze(0).expand(B, T)
        self._tile_miss = torch.full((B, T), T + 1, dtype=torch.long, device=device)
        self._march_miss = torch.full((B, T), 10**9, dtype=torch.long, device=device)
        # The march key's SEAT term, one entry per city-block cell in
        # `city_center.reshape(B, -1)` order (row-major, so the column index
        # runs fastest). A CITY-STATE row carries its 100+ seat id, which is
        # why the distance term is scaled by 2048 * 256 rather than 2048 * 8.
        _cell_row = torch.arange(self.city_center.shape[1] * self.RC, device=device) // self.RC
        self._march_seatkey = torch.where(
            _cell_row < self.n_majors, _cell_row, 100 + _cell_row - self.n_majors) * 2048
        self._bidx = torch.arange(B, device=device)
        self._inf_f = torch.tensor(float("inf"), dtype=dtype, device=device)
        self._adjd_cache = None
        self._adjc_cache = None
        self._adjh_cache = None
        self._adjt_cache = None
        self._fadjq_cache = None
        self._appeal_cache = None
        self._rcy_cache = None
        self._bld_cache: dict = {}  # (row, complete) -> (_eff_version, mask); one entry per seat row
        # The WIRE's spending intents, parked between decide-time and the
        # gold block's phase position. Keyed by ABSOLUTE seat row — seat 0
        # stashes through step(), the civ rows through apply_seat_actions,
        # and _seat_buy_ladder drains whichever row it is running.
        self._driven_buy: dict = {}
        self._driven_buy_worship: dict = {}
        self._driven_buy_relig: dict = {}
        self._driven_buy_monu: dict = {}
        self._driven_levy: dict = {}
        self._driven_nuke: dict = {}
        self._driven_route: dict = {}
        self._driven_citizens: dict = {}
        self._driven_vote: dict = {}
        self._driven_gp_pass: dict = {}
        self._driven_buy_nat: dict = {}
        self._driven_buy_cls: dict = {}
        self._driven_buy_ucls: dict = {}
        self._driven_buy_pat: dict = {}
        self._driven_buy_band: dict = {}
        self._driven_tech: dict = {}
        self._driven_policies: dict[int, torch.Tensor] = {}
        self._driven_civic: dict = {}
        self._driven_envoys: dict = {}
        self._driven_picks: dict = {}
        self._driven_war: dict = {}
        # One stash per DIPLOMATIC verb, allocated once and drained in place —
        # a per-verb attribute would have to be rebound to exist.
        self._driven_geo: dict = {v: {} for v in GEO_VERBS}
        self._arangeNB = torch.arange(NB, device=device)

        # EVERY seat's t0 units seed the pool HERE, through ONE body — after
        # the roster tables and the pool planes exist, which is why the load is
        # split in two passes rather than by seat. charges/MP mirror
        # `_spawn_unit`'s writes minus the spot search (the file tile is the
        # tile); the civ arm this replaced wrote neither, so every civ started
        # with a 0-charge builder and 0 movesLeft until the first refresh.
        #
        # ORDER: civ rows in fixture order, then row 0. The pool is compared
        # POSITIONALLY against TS's `state.units`, so the append order is a
        # wire contract — not a statement about which seat matters.
        for b, f in enumerate(fixtures):
            for cv in sorted(f["civs"], key=lambda c: int(c["seat"]) == 0):
                seat = int(cv["seat"])
                for u_ in cv["units"]:
                    i = int(self.unit_next[b])
                    ti = int(u_["type"])
                    self.major_unit_alive[b, i] = True
                    self.major_unit_seat[b, i] = seat
                    self.major_unit_type[b, i] = ti
                    self.major_unit_tile[b, i] = int(u_["tile"])
                    self.major_unit_hp[b, i] = rules.combat.get("unitHp", 100)
                    self.major_unit_charges[b, i] = int(self._type_charges[ti])
                    _m0u = self._mp_scale * int(self._type_moves[ti])
                    self.major_unit_mp[b, i] = _m0u
                    self.major_unit_mp_full[b, i] = _m0u
                    self.major_unit_attacks[b, i] = 1
                    if bool(self._type_civilian[ti]):
                        self.civilian_at[(b, int(u_["tile"]))] = i
                    else:
                        self.military_at[(b, int(u_["tile"]))] = i
                    if self.fog_of_war:
                        _s0 = int(self._type_sight[ti]) or 2
                        self.seat_explored[b, seat] |= self.pair_dist[int(u_["tile"])] <= _s0
                    self.unit_next[b] += 1

        # The FIXTURE-LOADED starting units must seed the best-melee trackers:
        # TS counts them through spawnUnit at placeSeats, so a seat starting
        # with a WARRIOR has city defense 20, not the floor. ONE scan over the
        # merged pool, one row per seat.
        _ut0 = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        _melee0 = self.major_unit_alive & (self._type_ranged_strength[_ut0] == 0)
        _mcs0 = torch.where(_melee0, self._type_combat[_ut0], torch.zeros_like(self.major_unit_type))
        for _row0 in range(self.n_majors):
            self.civ_best_melee[:, _row0] = torch.where(
                self.major_unit_seat == _row0, _mcs0, torch.zeros_like(_mcs0)
            ).max(dim=1).values

        self._pristine = {k: getattr(self, k).clone() for k in _MUTABLE}

    def reset(self) -> None:
        for k, v in self._pristine.items():
            getattr(self, k).copy_(v)
        self.turn = 1
        self._eff_version += 1
        self._fbase_cache = None
        self._food_cache = None
        self._nprod_cache = None
        self._adjd_cache = self._adjc_cache = self._adjh_cache = self._adjt_cache = None
        self._dadj_cache = None
        self._fx_row_cache = None
        self._fadjq_cache = self._rcy_cache = self._bsum_row_cache = None
        self._bld_cache = {}
        self._bel_version += 1
        self._rp_kill_version += 1
        self._claim_version += 1
        self._seat_route_cache = self._belief_feat_cache = self._suz_rows_cache = None
        self._bel_add_memo = self._gov_pol_cache = None

    def register_alias(self, name: str, recompute) -> None:
        self._aliases[name] = recompute

    def row_of(self, seat: int) -> int:
        return int(self._seat_row[seat])

    def _init_climate(self, fixtures: list[dict]) -> None:
        """THE CLIMATE ARC's planes and its two denominators.

        The coastal-lowland band is READ, not re-derived: `deriveLowlands`
        runs once on the TS side and the fixture ships what it computed, so
        the two engines cannot disagree about which tiles the sea reaches."""
        B, T, dev = self.B, self.T, self.device
        c = self.rules.climate
        self.tile_lowland = torch.tensor(
            [[int(t.get("lw", 0)) for t in f["tiles"]] for f in fixtures],
            dtype=torch.long, device=dev)
        self.tile_flooded = torch.zeros(B, T, dtype=torch.bool, device=dev)
        # every river-flood EPISODE a tile has taken — the Great Bath's faith
        # counts them (`Tile.floodCount`)
        self.tile_flood_ct = torch.zeros(B, T, dtype=torch.long, device=dev)
        # -1 = no climate change yet; monotone, so it never steps back.
        self.climate_idx = torch.full((B,), -1, dtype=torch.long, device=dev)

        self._clear_fids = torch.tensor([int(x) for x in c["clearFids"] if int(x) >= 0],
                                        dtype=torch.long, device=dev)
        self._ice_fid = int(c["iceFid"])
        _clear = torch.zeros(B, T, dtype=torch.bool, device=dev)
        for _f in self._clear_fids.tolist():
            _clear |= self.feat_id == _f
        self._removable_at_start = _clear.sum(dim=1)
        self._ice_at_start = (self.feat_id == self._ice_fid).sum(dim=1)

        # [points, flood band, submerge band, iceMelt, fertility, desertify]
        _ph = c["phases"]
        self._cl_points = torch.tensor([r[0] for r in _ph], dtype=torch.long, device=dev)
        self._cl_flood = torch.tensor([int(r[1]) for r in _ph], dtype=torch.long, device=dev)
        self._cl_submerge = torch.tensor([int(r[2]) for r in _ph], dtype=torch.long, device=dev)
        self._cl_ice_melt = [float(r[3]) for r in _ph]
        self._cl_fertility = [bool(r[4]) for r in _ph]
        self._cl_desertify = [bool(r[5]) for r in _ph]
        self._defor_cuts = [(float(a), float(b)) for a, b in c["deforestation"]]

        self._carbon_per_resource = torch.tensor(
            [float(x) for x in c["carbonPerResource"]], dtype=torch.float64, device=dev)
        self._carbon_unit_share = float(c["unitShare"])
        self._carbon_unit_res_share = float(c["unitResourceShare"])
        self._carbon_cells_share = float(c["cellsShare"])
        self._carbon_cells_tech = int(c["cellsTech"])
        self._co2_per_point = float(c["co2PerPoint"])
        self._recapture_units = float(c["recaptureUnits"])
        self._recapture_favor = int(c["recaptureFavor"])
        self._barrier_per_tile = int(c["barrierPerTile"])
        self._pollution_divisor = float(c["pollutionDivisor"])
        self._favor_per_over = int(c["favorPerOver"])
        self._favor_pollution_cap = int(c["favorCap"])

    def _check_seat_invariant(self) -> None:
        al = self.unit_alive
        seat = self.unit_seat
        v, u = self.POOL_LO["major"], self.POOL_LO["barb"]
        ve, ue = self.POOL_HI["major"], self.POOL_HI["barb"]
        if not bool(((seat[:, v:ve] >= 0) & (seat[:, v:ve] < self.n_majors)).all()):
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

    _CS_PAIR_FIELDS = (
        ("met", torch.bool, False),
        ("envoys", torch.long, 0),
        ("quest", torch.long, 0),
        ("quest_camp", torch.long, -1),
        ("quest_issued", torch.long, 0),
    )

    _CIV_PAIR_FIELDS = (
        ("culture", None, None),
        ("faith", None, None),
        ("tourism", torch.long, None),
        ("tourism_rel", torch.long, None),
        ("gpp", None, "_gp_nc"),
    )

    def _alloc_civ_pairs(self, B: int, n_majors: int, dtype, device) -> None:
        for _k, _dt, _ex in self._CIV_PAIR_FIELDS:
            _w = getattr(self, _ex) if _ex else None
            _shape = (B, n_majors) + ((_w,) if _w else ())
            setattr(self, f"civ_{_k}", torch.zeros(_shape, dtype=_dt or dtype, device=device))

    def _alloc_cs_pairs(self, B: int, n_majors: int, s_pad: int, device) -> None:
        for _nm, _dt, _fill in self._CS_PAIR_FIELDS:
            setattr(self, f"seat_citystate_{_nm}",
                    torch.full((B, n_majors, s_pad), _fill, dtype=_dt, device=device))

    def _alloc_war(self, B: int, n_majors: int, s_pad: int, device) -> None:
        self.NS = n_majors + s_pad + 1
        self.BARB_ROW = n_majors + s_pad
        _row = torch.zeros(BARB_SEAT + 1, dtype=torch.long, device=device)
        for _r in range(n_majors):
            _row[_r] = _r
        for _c in range(s_pad):
            _row[100 + _c] = n_majors + _c
        _row[BARB_SEAT] = self.BARB_ROW
        self._seat_row = _row
        _rs = torch.full((self.NS,), NO_SEAT, dtype=torch.long, device=device)
        for _r in range(n_majors):
            _rs[_r] = _r
        for _c in range(s_pad):
            _rs[n_majors + _c] = 100 + _c
        _rs[self.BARB_ROW] = BARB_SEAT
        self._ROW_SEAT = _rs
        self.war = torch.zeros(B, self.NS, self.NS, dtype=torch.bool, device=device)
        self.ww = torch.zeros(B, self.NS, self.NS, dtype=torch.long, device=device)
        self._ww_opened = torch.zeros(B, dtype=torch.long, device=device)
        self._ww_hooked = torch.zeros(B, dtype=torch.long, device=device)
        self.ww_turn = torch.full((B, self.NS, self.NS), -1, dtype=torch.long, device=device)

    def sync_war(self) -> None:
        w = self.war
        keep = torch.triu(
            torch.ones(self.NS, self.NS, dtype=torch.bool, device=w.device), diagonal=1
        )
        w.copy_(torch.where(keep, w, w.transpose(1, 2).clone()))

    def _check_war_invariant(self) -> None:
        """The war matrix must be symmetric, with no seat at war with itself.

        Checked every step under CIV6_ALIAS_CHECK=1."""
        w = self.war
        # The matrix is the only store, so there is no second copy to
        # cross-check against. SYMMETRY is the property code can break: a
        # declaration writes one cell of a pair, and the mirror has to be
        # written too.
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
            "road_tier": self.road_tier,
        }

    def restore(self, snap: dict) -> None:
        for k, v in snap["mut"].items():
            getattr(self, k).copy_(v)
        # restore rewrites tile ownership in place, which is a
        # tile-ownership write like any other, so `_tile_owner_ver` has to be
        # bumped here: an in-place write through a generic loop is invisible to
        # a scan for `self.tile_seat[...] =`.
        self._tile_owner_ver += 1
        self.turn = snap["turn"]
        self.road_tier = snap.get("road_tier", 0)
        self._eff_version += 1
        self._fbase_cache = None
        self._food_cache = None
        self._nprod_cache = None
        self._adjd_cache = self._adjc_cache = self._adjh_cache = self._adjt_cache = None
        self._dadj_cache = None
        self._fx_row_cache = None
        self._fadjq_cache = self._rcy_cache = self._bsum_row_cache = None
        self._bld_cache = {}
        self._bel_version += 1
        self._gen_ver += 1
        self._rp_kill_version += 1
        self._claim_version += 1
        self._seat_route_cache = self._belief_feat_cache = self._suz_rows_cache = None
        self._bel_add_memo = self._gov_pol_cache = None

    @staticmethod
    def _prereq_matrix(prereqs: list, n: int) -> torch.Tensor:
        m = torch.zeros(n, n, dtype=torch.bool)
        for i, ps in enumerate(prereqs):
            for p in ps:
                m[i, p] = True
        return m

