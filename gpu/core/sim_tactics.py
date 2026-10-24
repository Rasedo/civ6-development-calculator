from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from . import simbase
import inspect
import types

# the pathfinder's fixed point: one Movement is 256
_FIX = 256
# UnitAiTypes (unit +0x1c0)
_AI_EXPLORE = 2
_AI_COMBAT = 3
_AI_DEFENDER = 4
# WANDER NEAR CAMP's radius (0x77b9a0), DEFEND CAMPS' reach (0x774e90), the
# planning's breadth-first search (0x7920d0)
_WANDER_CAMP_RANGE = 5
_DEFEND_CAMP_TURNS = 3
_PLAN_TURNS = 2
# an open node's key: its cost, then its order among equal costs
_KEY_SHIFT = 1 << 22
_TIE_OFF = 1 << 21
_KEY_NONE = 1 << 62
# BARBARIAN_DEFENSE_ALL_UNITS / BARBARIAN_DEFENSE_RANGED_UNITS (GlobalParameters)
_BARB_DEFENSE_ALL = 4
# the knowledge base's query's distance (0x5eb8b0's fifth argument)
_KNOWN_UNIT_RANGE = 2
_BARB_DEFENSE_RANGED = 1
# the reach of a rampaging tribe's city from its camp (0x1479e0)
_CHASE_RANGE = 16
# CHASE TARGET's reach of a target (0x775170)
_CHASE_SIGHT = 8
# WANDER NEAR CITY's radius (0x77bf50) and the one FindAlternateLocation searches
# round the city (0x585940)
_WANDER_CITY_RANGE = 5
_WANDER_BACK_RANGE = 3
# the predicted damage of taking a civilian (0x791470)
_CIVILIAN_TAKEN = 150
# ATTACK UNITS: the reach of the targets one assignment takes (0x76eb50), a
# target's health (1.1 in 24.8 of its whole, 0x776140), a kill's worth and a
# barbarian target's worth in the gain (0x7702b0)
_ATTACK_TARGETS_RANGE = 5
_ATTACK_HEALTH_256 = 281
_ATTACK_KILL = 100
_ATTACK_BARB = 0.8
# the farthest a planning takes a target (2 x a unit's Movement + its range)
_ATTACK_SIGHT = 16
# a city's strike's reach (0x249e40, `CITY_STRIKE_RANGE`)
_CITY_STRIKE_RANGE = 2
# EXPLORE LAND's rounds over the homeland's units (0x70ce90)
_EXPLORE_ROUNDS = 3

# the per-game planes a `_GameRows` takes by its rows: the mutable state, the
# unit pools' views of it and the planes each game holds fixed or derives
_PER_GAME = frozenset(simbase._MUTABLE) | frozenset((
    "_arange_bt _citystate_didx _citystate_item_type _citystate_route_to6 _cs_type_onehot _flood_home "
    "_flood_lists _frm0 _ftr0 _ftu0 _ice_at_start _march_miss _removable_at_start _tile_miss _volcano_order "
    "_wok_sea _ww_hooked _ww_opened appeal_over appeal_self citystate_alive citystate_center citystate_hp "
    "citystate_pop citystate_suz_code citystate_suz_imp citystate_type civ_alive cliff_mask drought_cand "
    "feat_id0 feat_yields fertilizable floodplain max_camps nwonder ocean_tile res_yields river_comp "
    "river_mask row_civ row_leader shallow_adj storm_fam tile_area tile_continent tile_mountain tile_nw_adj "
    "tile_range tile_region tile_river volcano_at wonder_near").split())
_POOL_PREFIXES = tuple(f"{p}_unit_" for p in simbase.POOL_CLASS)


class _GameRows:
    """THE BATCH'S GAMES `rows` [J] AS A BATCH OF J, a game a job: each
    per-game plane (`_PER_GAME`, the pools' views) taken by `rows`, the
    batch index (`_bidx`) the view's own, every rule table the batch's, the
    batch's routines run on it as on the batch (its read-set memos plain,
    `memo_read`). A cache the batch holds is the view's own, empty. A public
    plane shaped by the batch that `_PER_GAME` does not name is refused."""

    def __init__(self, sim, rows: torch.Tensor):
        d = self.__dict__
        d["_sim"] = sim
        d["_rows"] = rows
        d["B"] = int(rows.shape[0])
        d["_game_rows"] = True

    def __getattr__(self, name: str):
        sim = self.__dict__["_sim"]
        if name not in sim.__dict__:
            f = inspect.getattr_static(type(sim), name, None)
            if isinstance(f, property):
                return f.fget(self)
            if isinstance(f, (staticmethod, classmethod)):
                return getattr(type(sim), name)
            if isinstance(f, types.FunctionType):
                return types.MethodType(f, self)
        v = getattr(sim, name)
        if name in ("_bidx", "_bidx1"):
            v = torch.arange(self.__dict__["B"], device=v.device)
            v = v.unsqueeze(1) if name == "_bidx1" else v
        elif "cache" in name or "memo" in name:
            v = {} if isinstance(v, dict) else None
        elif isinstance(v, torch.Tensor) and v.dim() >= 1 and v.shape[0] == sim.B and (
                name in _PER_GAME or name.startswith(_POOL_PREFIXES)):
            v = v[self.__dict__["_rows"]]
        elif isinstance(v, torch.Tensor) and v.dim() >= 1 and v.shape[0] == sim.B and not name.startswith("_"):
            raise AttributeError(f"_GameRows: {name} is shaped by the batch and not a per-game plane")
        self.__dict__[name] = v
        return v


class SimTactics:
    """THE GAME'S UNIT AI — `cpu/core/tactical.ts`'s twin: the unit
    pathfinder's reach and path, and the barbarians' tactical pass
    (GameCore_XP2 TacticalAI; tools/civ6lab/dll_readings.md "C-95: the unit
    pathfinder and the planning's reach", "C-95: the tactical pass")."""

    # what a tactical pass holds while it runs: the steps' costs (dropped at
    # a pillage) and the units' full Movement
    _tac_in_pass = False
    _tac_cost_held = None
    _tac_full_held = None

    # ------------------------------------------------------- the unit pool

    def _barb_slots(self) -> None:
        """`barbSlots`: the slots whose unit was gone when the barbarians'
        last turn ended go free, pushed in ascending order; each barbarian
        unit without a slot takes one in pool order — the slot pushed last,
        else a new one past the end."""
        P = simbase.BARB_POOL_MAX
        dy = self.barb_pool_dying
        if bool(dy.count_nonzero()):
            pos = self.barb_pool_nfree.unsqueeze(1) + dy.long().cumsum(dim=1) - 1
            b_i, s_i = dy.nonzero(as_tuple=True)
            self.barb_pool_free[b_i, pos[b_i, s_i]] = s_i
            self.barb_pool_nfree += dy.sum(dim=1)
            self.barb_pool_dying.zero_()
        need = self.barb_unit_alive & (self.barb_unit_seat == BARB_SEAT) & (self.barb_unit_slotno < 0)
        if not bool(need.count_nonzero()):
            return
        r = need.long().cumsum(dim=1) - 1
        nf = self.barb_pool_nfree.unsqueeze(1)
        s_free = self.barb_pool_free.gather(1, (nf - 1 - r).clamp(min=0, max=P - 1))
        s_new = self.barb_pool_size.unsqueeze(1) + (r - nf)
        self.barb_unit_slotno.copy_(torch.where(need, torch.where(r < nf, s_free, s_new), self.barb_unit_slotno))
        n = need.sum(dim=1)
        used = torch.minimum(n, self.barb_pool_nfree)
        self.barb_pool_nfree -= used
        self.barb_pool_size += n - used
        assert int(self.barb_pool_size.max()) <= P, "barbarian slot numbers exhausted — raise simbase.BARB_POOL_MAX"

    def _barb_slots_dying(self) -> None:
        """`barbSlotsDying`: the barbarians' turn ends, and the slots no unit
        holds and none free wait for the next turn to go free."""
        P = simbase.BARB_POOL_MAX
        dev = self.device
        B = self.B
        ar = torch.arange(P, device=dev).unsqueeze(0)
        held = torch.zeros(B, P + 1, dtype=torch.bool, device=dev)
        hm = self.barb_unit_alive & (self.barb_unit_seat == BARB_SEAT) & (self.barb_unit_slotno >= 0)
        held.scatter_(1, torch.where(hm, self.barb_unit_slotno, P), True)
        infree = torch.zeros(B, P + 1, dtype=torch.bool, device=dev)
        infree.scatter_(1, torch.where(ar < self.barb_pool_nfree.unsqueeze(1), self.barb_pool_free, P), True)
        self.barb_pool_dying.copy_((ar < self.barb_pool_size.unsqueeze(1)) & ~held[:, :P] & ~infree[:, :P])

    # ------------------------------------------------------ the pathfinder

    def _tac_entry(self) -> torch.Tensor:
        """[B, T] long — `moveCostInto` of each land plot off no route, in
        `mp_scale` units: its terrain's cost, an improvement's Movement in its
        place."""
        tm = self.tmove
        if self._imp_move_cost_any:
            mi = self.improvement
            mc = self._imp_move_cost.take(mi.clamp(min=0)) * ((mi >= 0) & ~self.pillaged).long()
            tm = torch.where(mc > 0, (mc - 1) * self._mp_scale, tm)
        return self._mp_scale + tm

    def _tac_step_cost(self) -> torch.Tensor:
        """[B, T, 6] long — `stepCost` for a step off each plot along each
        neighbour column onto LAND, in `mp_scale` units: the plot's own cost
        (an improvement's Movement in its place), a route at both ends its
        tier's instead, the river crossing a bridging tier drops and none
        where either plot is a city's (0x531510); a step into a city costs
        one Movement at most (CITY_MOVEMENT_COST, 0x531660). No chassis here
        waives terrain."""
        nb = self.neigh.clamp(min=0)  # [T, 6]
        tm = self._tac_entry()[:, nb] - self._mp_scale
        rr_f = self.railroad.unsqueeze(2)
        rr_t = self.railroad[:, nb]
        rd = (self.road.unsqueeze(2) | rr_f) & (self.road[:, nb] | rr_t)
        tier = self._road_tier_mp.take(self.road_tier).view(-1, 1, 1)
        step = torch.where(rr_f & rr_t, torch.full_like(tm, self._railroad_mp), tier.expand_as(tm))
        terr = torch.where(rd, step - self._mp_scale, tm)
        bits = torch.arange(6, device=self.device).view(1, 1, 6)
        river_mp = (2 * self._mp_scale) * ((self.river_mask.unsqueeze(2) >> bits) & 1)
        bridged = self._road_tier_bridges.take(self.road_tier).view(-1, 1, 1)
        riv = torch.where(rd & bridged, torch.zeros_like(river_mp), river_mp)
        ctr = self._centre_plane()
        ctr_to = ctr[:, nb]
        riv = torch.where(ctr.unsqueeze(2) | ctr_to, torch.zeros_like(riv), riv)
        cost = self._mp_scale + terr + riv
        return torch.where(ctr_to, cost.clamp(max=self._mp_scale), cost)

    def _tac_foreign(self, seat: int) -> torch.Tensor:
        """[B, T] bool — a unit of another player than `seat` holds the plot
        (an aircraft or a spy holds none)."""
        out = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for pl in (self.military_at, self.civilian_at, self.support_at, self.embarked_at):
            s = torch.where(pl >= 0, self.unit_seat.gather(1, pl.clamp(min=0)), torch.full_like(pl, seat))
            out |= s != seat
        return out

    def _tac_hostile(self, seat: int) -> torch.Tensor:
        """[B, T] bool — a unit of a player at war with `seat` holds the plot
        (an aircraft or a spy holds none)."""
        out = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for pl in (self.military_at, self.civilian_at, self.support_at, self.embarked_at):
            s = torch.where(pl >= 0, self.unit_seat.gather(1, pl.clamp(min=0)), torch.full_like(pl, -1))
            out |= (pl >= 0) & self._seats_hostile(seat, s)
        return out

    def _tac_closed(self, seat: int) -> torch.Tensor:
        """[B, T] bool — `majorClosedToMinor`: for a city-state's `seat`, a
        major's territory where the major holds the open-borders civic and is
        not at war with it; nothing for any other seat."""
        zero = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        if not (100 <= seat < 100 + self.S) or self._open_borders_civic < 0 or self.n_majors == 0:
            return zero
        R = self.n_majors
        own = self.tile_seat
        maj = (own >= 0) & (own < R)
        oc = own.clamp(min=0, max=R - 1)
        civic = self.civ_civics[:, :R, self._open_borders_civic].gather(1, oc)
        war = self.war[:, self._CITY_MINOR0 + seat - 100, :R].gather(1, oc)
        return maj & civic & ~war

    def _tac_known(self, seat: int) -> torch.Tensor | None:
        """[B, T] bool — `groundOf`'s known: the plots `seat` revealed (a
        major's explored plane; the barbarians' where they revealed any, else
        every plot); None for a player that tracks none (every plot)."""
        if 0 <= seat < self.n_majors:
            return self.seat_explored[:, seat]
        if seat == BARB_SEAT:
            ex = self.barb_explored
            return ex | ~ex.any(dim=1, keepdim=True)
        return None

    def _tac_enter(self, seat: int, revealed_only: bool = True) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, T] bool twice — the plots a LAND and a NAVAL unit of `seat` may
        enter (`enterable`): its domain's ground, no unit of a player at war
        with it (another player's unit it passes), no city centre but its
        own, no live enemy Encampment, no major's ground closed to a
        city-state (`_tac_closed`), with `revealed_only` (the lists', not a
        path's) none it never revealed (`_tac_known`). The
        NAVAL plane is the water an embarking land unit takes too."""
        block = (self._tac_hostile(seat) | (self._centre_plane() & (self.tile_seat != seat))
                 | self._tac_closed(seat))
        if self._encamp_didx >= 0:
            block = block | self._encamp_block_plane(seat)
        known = self._tac_known(seat) if revealed_only else None
        if known is not None:
            block = block | ~known
        cart = self._ocean_open(torch.full((self.B,), seat, dtype=torch.long, device=self.device))
        land = self.passable & ~block
        naval = self.wpass & (~self.ocean_tile | cart.unsqueeze(1)) & ~block
        return land, naval

    def _tac_attack_planes(self, seat: int, revealed_only: bool = True, planning: bool = True) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, T] bool twice — the plots a LAND and a NAVAL unit of `seat`
        attacks into (`groundOf`'s attack): in the planning (`planning`) a
        unit of a player at war with it that fights, on any ground (0x26e570
        -> 0x209dd0); any such unit on ground of the mover's domain, a city
        centre of such a player, an Encampment that blocks a land mover — on
        plots it revealed."""
        foe = self._tac_hostile(seat)
        fight = torch.zeros_like(foe)
        for pl in (self.military_at, self.civilian_at, self.support_at, self.embarked_at) if planning else ():
            pc = pl.clamp(min=0)
            ut = self.unit_type.gather(1, pc).clamp(min=0, max=self.NU - 1)
            st = (self._type_combat.take(ut) > 0) | (self._type_ranged_strength.take(ut) > 0) | (self._type_bombard.take(ut) > 0)
            s = torch.where(pl >= 0, self.unit_seat.gather(1, pc), torch.full_like(pl, -1))
            fight |= (pl >= 0) & st & self._seats_hostile(seat, s)
        fight &= self.passable | self.wpass
        ctr = self._centre_plane() & (self.tile_seat != seat) & self._seats_hostile(seat, self.tile_seat)
        land = self.passable & ((foe & ~self.water) | ctr)
        if self._encamp_didx >= 0:
            land = land | (self.passable & self._encamp_block_plane(seat))
        land = land | fight
        naval = (self.wpass & foe) | (self.passable & ctr) | fight
        known = self._tac_known(seat) if revealed_only else None
        if known is not None:
            land, naval = land & known, naval & known
        return land, naval

    def _tac_zoc(self, seat: int, seen: torch.Tensor | None = None, naval: bool | None = None) -> torch.Tensor:
        """[B, T] bool — `inEnemyZoc` for a military mover of `seat` at every
        plot: a military unit hostile to it beside the plot that exerts a zone
        (no Ranged or Siege class without SUPPRESSION, none embarked, none of a
        chassis that exerts none), none across a river. With `seen` [B, T]
        and `naval` (`groundOf`'s seenZoc) only an exerter on a plot it sees
        and of the mover's domain, and for a land mover a hostile city or
        Encampment too. The mover's own ignoring is the caller's."""
        mil = self.military_at
        here = mil >= 0
        ms = mil.clamp(min=0)
        mtype = self.unit_type.gather(1, ms).clamp(min=0, max=self.NU - 1)
        mseat = torch.where(here, self.unit_seat.gather(1, ms), torch.full_like(mil, -1))
        pc = self.rules_dev.u_promo_class.take(mtype)
        no_ex = (pc == self._pc_ranged) | (pc == self._pc_siege)
        if bool(no_ex.count_nonzero()):
            no_ex = no_ex & ~self._promo_flag(mtype, self.unit_promos.gather(1, ms), "ZOC_EXERT")
        ex = here & ~self.unit_emb.gather(1, ms) & ~self._type_zoc_none.take(mtype) & ~no_ex
        ex = ex & self._seats_hostile(seat, mseat)
        if seen is not None:
            ex = ex & seen & (self.unit_naval.take(mtype) == naval)
            if not naval:
                # a hostile city or Encampment exerts one on the land beside it
                town = self._centre_plane() & self._seats_hostile(seat, self.tile_seat)
                if self._encamp_didx >= 0:
                    town = town | self._encamp_block_plane(seat)
                ex = ex | (town & seen)
        nb = self.neigh.clamp(min=0)
        bits = torch.arange(6, device=self.device).view(1, 1, 6)
        riv = (self.river_mask.unsqueeze(2) >> bits) & 1
        return ((self.neigh >= 0).unsqueeze(0) & (riv == 0) & ex[:, nb]).any(dim=2)

    def _tac_zoc_ignored(self, utype: torch.Tensor) -> torch.Tensor:
        """bool — the chassis ignores zones of control (a naval raider, the
        cavalry classes but the chariot)."""
        ign = self._type_zoc_ignore | (self._type_cavalry & ~self._type_chariot)
        return ign.take(utype.clamp(min=0, max=self.NU - 1))

    def _tac_cost(self) -> torch.Tensor:
        """`_tac_step_cost`, held through a tactical pass until a pillage
        changes the ground"""
        if not self._tac_in_pass:
            return self._tac_step_cost()
        if self._tac_cost_held is None:
            self._tac_cost_held = self._tac_step_cost()
        return self._tac_cost_held

    def _tac_full(self, pre: str = "barb") -> tuple[torch.Tensor, torch.Tensor]:
        """[B, P] twice — each unit of pool `pre`'s full Movement
        (`unitFullMoves`, no aura) ashore and embarked, held through a
        tactical pass"""
        held = self._tac_full_held if self._tac_in_pass else None
        if held is not None and pre in held:
            return held[pre]
        emb = getattr(self, f"{pre}_unit_emb")
        aura = getattr(self, f"{pre}_unit_aura_mp")
        f = (self._full_mp(pre, torch.zeros_like(emb)) - aura, self._full_mp(pre, torch.ones_like(emb)) - aura)
        if self._tac_in_pass:
            if self._tac_full_held is None:
                self._tac_full_held = {}
            self._tac_full_held[pre] = f
        return f

    def _tac_full_now(self, pre: str = "barb") -> torch.Tensor:
        """[B, P] — `unitFullMoves` of each unit of pool `pre` as it stands,
        embarked or ashore"""
        f_land, f_sea = self._tac_full(pre)
        return torch.where(getattr(self, f"{pre}_unit_emb"), f_sea, f_land)

    def _tac_tech(self, seat: int, tech: int) -> torch.Tensor:
        """[B] bool — `seat` holds `tech`: a major's research, a city-state's,
        the Free Cities' (`FR`), the barbarians'."""
        if tech < 0:
            return torch.zeros(self.B, dtype=torch.bool, device=self.device)
        if 0 <= seat < self.n_majors:
            return self.civ_techs[:, seat, tech]
        if 100 <= seat < 100 + self.S:
            return self.citystate_techs[:, seat - 100, tech]
        if seat == FREE_SEAT:
            return self.citystate_techs[:, self.FR, tech]
        if seat == BARB_SEAT:
            return self.barb_techs[:, tech]
        return torch.zeros(self.B, dtype=torch.bool, device=self.device)

    def _tac_embarks(self, rows: torch.Tensor, utype: torch.Tensor, seat: int) -> torch.Tensor:
        """[N] bool — `canEmbark` for land units of `utype` [N] of `seat` in
        the games `rows`: Sailing for a civilian, Shipbuilding for any other;
        the barbarians' planning takes no water (`groundOf`)."""
        if seat == BARB_SEAT:
            return torch.zeros_like(utype, dtype=torch.bool)
        civ = self._type_civilian.take(utype) | self._type_support.take(utype)
        ok = torch.where(civ, self._tac_tech(seat, self._sailing_tech)[rows],
                         self._tac_tech(seat, self._shipbuilding_tech)[rows])
        return ok & ~self.unit_naval.take(utype) & ~self.unit_water_walk.take(utype)

    def _tac_cliffs(self, seat: int) -> torch.Tensor:
        """[B, T, 6] bool, neighbour columns — `cliffBlocks` on a land/water
        step off each plot: the cliff bit of the land plot toward the water,
        none at a city centre or at a Harbor of `seat`'s own."""
        B, T, dev = self.B, self.T, self.device
        if not self._has_cliffs:
            return torch.zeros(B, T, 6, dtype=torch.bool, device=dev)
        nb = self.neigh.clamp(min=0)  # [T, 6]
        w_f = self.water.unsqueeze(2)
        w_t = self.water[:, nb]
        trans = (w_f != w_t) & (self.neigh >= 0).unsqueeze(0)
        dirs = torch.arange(6, device=dev).view(1, 1, 6)
        land = torch.where(w_f, nb.unsqueeze(0).expand(B, -1, -1), torch.arange(T, device=dev).view(1, T, 1).expand(B, T, 6))
        dl = torch.where(w_f, (dirs + 3) % 6, dirs.expand(B, T, 6))
        lf = land.reshape(B, -1)
        bit = ((self.cliff_mask.gather(1, lf) >> dl.reshape(B, -1)) & 1).bool().reshape(B, T, 6)
        free = self._centre_plane().gather(1, lf).reshape(B, T, 6)
        if self._harbor_idx >= 0:
            free = free | ((self.district.gather(1, lf) == self._harbor_idx)
                           & (self.tile_seat.gather(1, lf) == seat)).reshape(B, T, 6)
        return trans & bit & ~free

    def _tac_search(self, rows: torch.Tensor, slots: torch.Tensor, seat: int, max_turns: int, zoc: bool,
                    dest: torch.Tensor | None = None, pre: str = "barb", plan: dict | None = None,
                    full: bool = False, stand: bool = False) -> dict:
        """THE PATHFINDER (`search`) for the units at local `slots` of pool
        `pre` in the games `rows` [N]: Dijkstra from each unit's plot over
        the open nodes by (cost, tie) — a node inserted where its cost lies
        nearer the cheapest open node goes before its equals, else after them;
        a node made cheaper goes after its new equals; each closed node links
        its neighbours in DirectionTypes order. A land unit whose player may
        embark it takes water too, a turn starting on the Movement of the
        domain its plot holds it in. Returns the closing rank and turns of each
        plot it may end on ([N, T], -1 never closed or only passed: another
        player's unit holds it) and each node's parent; with `dest` [N] each
        row stops once its plot closes. With `plan` (`_tac_plan`'s targets)
        each link the search prices — the start first, linked from itself —
        lays the targets' spots (`planUnit`'s `onLink`): "spot" [N, E, 6]
        plots, "spot_turns" and "spot_n" [N, E]. With `full` each unit sets
        out on its full Movement (`unitFullMoves`); "closed" [N, T] is the
        turn of every plot the search closed, those it only passes or attacks
        included. With `stand` (the danger map's search) an attack is struck
        only from the unit's own plot or one none of its own stacking units
        holds."""
        dev = self.device
        N, T = rows.shape[0], self.T
        NONE = _KEY_NONE
        ar = torch.arange(N, device=dev)
        utype = getattr(self, f"{pre}_unit_type")[rows, slots].clamp(min=0, max=self.NU - 1)
        naval = self.unit_naval.take(utype)
        start = getattr(self, f"{pre}_unit_tile")[rows, slots].clamp(min=0)
        mp = (self._tac_full_now(pre) if full else getattr(self, f"{pre}_unit_mp"))[rows, slots]
        granted = getattr(self, f"{pre}_unit_mp_full")[rows, slots]
        f_land, f_sea = self._tac_full(pre)
        full_l = torch.div(f_land[rows, slots] * _FIX, self._mp_scale, rounding_mode="floor")
        full_s = torch.div(f_sea[rows, slots] * _FIX, self._mp_scale, rounding_mode="floor")
        unmoved = mp >= granted
        land, wat = self._tac_enter(seat, False)
        # the plots the player revealed (`groundOf`'s known; a path reads
        # every plot as revealed): one it never revealed is entered, and no
        # step leaves it but the unit's own
        known = self._tac_known(seat) if not zoc else None
        kn_n = known[rows] if known is not None else torch.ones(N, T, dtype=torch.bool, device=dev)
        embarks = self._tac_embarks(rows, utype, seat)
        ent_n = torch.where(naval.unsqueeze(1), wat[rows], land[rows] | (wat[rows] & embarks.unsqueeze(1)))  # [N, T]
        water_n = self.water[rows]
        # the plots each unit attacks into (`groundOf`'s attack): an enemy
        # unit's of its own domain (the planning's: one that fights, on any
        # ground), a hostile city centre, an Encampment for a land unit — the
        # path's end, the attack's step priced as any step and spending the
        # Movement it leaves
        a_land, a_nav = self._tac_attack_planes(seat, not zoc, not zoc)
        fights = self._type_combat.take(utype) > 0
        atk_n = torch.where(naval.unsqueeze(1), a_nav[rows], a_land[rows]) & fights.unsqueeze(1) & ~ent_n
        cost_b = self._tac_cost()  # [B, T, 6]
        # the land/water steps priced (`stepCost`'s transition) where a unit
        # embarks or strikes a plot across the shore
        any_embark = bool(embarks.count_nonzero()) or bool((atk_n & water_n & ~naval.unsqueeze(1)).count_nonzero())
        if any_embark:
            entry_n = self._tac_entry()[rows]
            ctr_n = self._centre_plane()[rows]
            ut_pool = getattr(self, f"{pre}_unit_type")
            ign_shore = self._ignore_shores(torch.full_like(ut_pool, seat), ut_pool)[rows, slots]
            cliffs_b = self._tac_cliffs(seat)
            waive_cliff = self._promo_flag(utype, getattr(self, f"{pre}_unit_promos")[rows, slots], "CLIFFS")
        zp = (self._tac_zoc(seat)[rows] & ~self._tac_zoc_ignored(utype).unsqueeze(1)) if zoc else None
        # the planning's search (no flag 0x200: 0x26e570 at 0x26e83e) moves on
        # from no plot of a zone of control the player sees but the unit's
        # own; an attack it strikes from there all the same (`groundOf`'s
        # seenZoc)
        zs = None
        fought_n = None
        if not zoc and not stand:
            sn = self._barb_seen("barbarians" if seat == BARB_SEAT else seat)
            # an attack's plot ends the planning's path where a seen unit at
            # war that fights holds it (the parent's +0x51 bit 0x40): an
            # attack on a city or Encampment alone goes on
            fought = torch.zeros(self.B, self.T, dtype=torch.bool, device=dev)
            for pl in (self.military_at, self.civilian_at, self.support_at, self.embarked_at):
                pc = pl.clamp(min=0)
                ut_ = self.unit_type.gather(1, pc).clamp(min=0, max=self.NU - 1)
                st_ = (self._type_combat.take(ut_) > 0) | (self._type_ranged_strength.take(ut_) > 0) | (self._type_bombard.take(ut_) > 0)
                sv_ = torch.where(pl >= 0, self.unit_seat.gather(1, pc), torch.full_like(pl, -1))
                fought |= (pl >= 0) & st_ & self._seats_hostile(seat, sv_)
            fought_n = (fought & sn)[rows]
            zs = torch.where(naval.unsqueeze(1), self._tac_zoc(seat, sn, True)[rows], self._tac_zoc(seat, sn, False)[rows])
            zs = zs & ~self._tac_zoc_ignored(utype).unsqueeze(1)
        # a path's turn may not end on a plot its own stacking unit holds (the
        # path validity 0x2720a0; `groundOf`'s full)
        full_n = None
        if zoc or stand:
            me = (slots + self.POOL_LO[pre]).unsqueeze(1)

            def own_at(pl: torch.Tensor) -> torch.Tensor:
                pr = pl[rows]
                return (pr >= 0) & (pr != me) & (self.unit_seat[rows].gather(1, pr.clamp(min=0)) == seat)

            civ_u = self._type_civilian.take(utype).unsqueeze(1)
            sup_u = self._type_support.take(utype).unsqueeze(1)
            full_n = torch.where(civ_u, own_at(self.civilian_at),
                                 torch.where(sup_u, own_at(self.support_at), own_at(self.military_at) | own_at(self.embarked_at)))
        tseat = self.tile_seat
        g = torch.full((N, T), NONE, dtype=torch.long, device=dev)
        tie = torch.zeros(N, T, dtype=torch.long, device=dev)
        mv = torch.zeros(N, T, dtype=torch.long, device=dev)
        tn = torch.zeros(N, T, dtype=torch.long, device=dev)
        st = torch.zeros(N, T, dtype=torch.long, device=dev)
        par = torch.full((N, T), -1, dtype=torch.long, device=dev)
        rank = torch.full((N, T), -1, dtype=torch.long, device=dev)
        rturn = torch.full((N, T), -1, dtype=torch.long, device=dev)
        # each open node's key (cost, then its order among equal costs), NONE
        # off the open list
        key = torch.full((N, T), NONE, dtype=torch.long, device=dev)
        g[ar, start] = 0
        mv[ar, start] = torch.div(mp * _FIX, self._mp_scale, rounding_mode="floor")
        tn[ar, start] = 1
        st[ar, start] = 1
        key[ar, start] = _TIE_OFF
        # the open list's dearest key (-1 empty)
        hi = torch.full((N,), _TIE_OFF, dtype=torch.long, device=dev)
        seq = torch.zeros(N, dtype=torch.long, device=dev)
        cnt = torch.zeros(N, dtype=torch.long, device=dev)
        run = torch.ones(N, dtype=torch.bool, device=dev)
        found = torch.zeros(N, dtype=torch.bool, device=dev)
        cols = torch.tensor(list(self._DIRECTION_TYPES), device=dev)
        neigh = self.neigh[:, cols]  # [T, 6] in DirectionTypes order
        link = None
        if plan is not None:
            link = self._tac_spot_link(rows, start, naval, plan)
            link(start.unsqueeze(1), start, torch.ones_like(start).unsqueeze(1), mv[ar, start].unsqueeze(1),
                 torch.ones_like(start, dtype=torch.bool).unsqueeze(1))
        none6 = torch.full((N, 6), NONE, dtype=torch.long, device=dev)
        neg6 = torch.full((N, 6), -1, dtype=torch.long, device=dev)
        big6 = torch.full((N, 6), NONE, dtype=torch.long, device=dev)
        two = 2 if T >= 2 else 1
        while True:
            # the cheapest open node, and the cheapest once it is out
            vals, idx = key.topk(two, dim=1, largest=False)
            kmin, best = vals[:, 0], idx[:, 0]
            act = run & (kmin < NONE)
            if not bool(act.count_nonzero()):
                break
            lo = vals[:, 1] if two == 2 else torch.full_like(kmin, NONE)
            b1 = best.unsqueeze(1)
            st.scatter_(1, b1, torch.where(act, 2, st.gather(1, b1).squeeze(1)).unsqueeze(1))
            key.scatter_(1, b1, torch.where(act, NONE, kmin).unsqueeze(1))
            rank.scatter_(1, b1, torch.where(act, cnt, rank.gather(1, b1).squeeze(1)).unsqueeze(1))
            rturn.scatter_(1, b1, torch.where(act, tn.gather(1, b1).squeeze(1), rturn.gather(1, b1).squeeze(1)).unsqueeze(1))
            cnt += act.long()
            hi = torch.where(act & (lo >= NONE), -1, hi)
            if dest is not None:
                hit = act & (best == dest)
                found |= hit
                act &= ~hit
            run &= act
            # an attack's plot is the path's end: no step leaves it; nor one
            # the player never revealed but the unit's own
            stop = atk_n.gather(1, b1).squeeze(1)
            if fought_n is not None:
                stop = stop & fought_n.gather(1, b1).squeeze(1)
            act = act & ~stop & (kn_n.gather(1, b1).squeeze(1) | (best == start))
            if not bool(act.count_nonzero()):
                continue
            bg, bm, bt = g.gather(1, b1), mv.gather(1, b1), tn.gather(1, b1)  # [N, 1]
            nb = neigh[best]  # [N, 6]
            nbc = nb.clamp(min=0)
            cst = cost_b[rows, best][:, cols]
            fw = water_n.gather(1, b1)  # [N, 1]
            cliff6 = None
            if any_embark:
                # an embarked step costs one Movement; a land/water step
                # (`stepCost`'s transition) the plot's own cost and the
                # embarking's, waived at a Harbor or a coastal city centre,
                # one Movement at most into a city
                tw = water_n.gather(1, nbc)
                tr = (fw != tw) & (nb >= 0)
                dock = self._embark_waived(best.unsqueeze(1).expand(-1, 6), nbc, rows)
                tcost = torch.where(tw, torch.full_like(cst, self._mp_scale), entry_n.gather(1, nbc))
                tcost = tcost + torch.where(dock | ign_shore.unsqueeze(1), 0, self._embark_transition_mp)
                tcost = torch.where(ctr_n.gather(1, nbc), tcost.clamp(max=self._mp_scale), tcost)
                cst = torch.where(fw & tw, self._mp_scale, torch.where(tr, tcost, cst))
                cliff6 = cliffs_b[rows, best][:, cols] & tr & ~waive_cliff.unsqueeze(1)
            # a hull's step costs one Movement; its strike ashore the plot's
            # own cost (`stepCost`: no transition for a hull)
            a6 = atk_n.gather(1, nbc) & (nb >= 0)
            ashore = a6 & ~water_n.gather(1, nbc)
            cst = torch.where(naval.unsqueeze(1), torch.where(ashore, cost_b[rows, best][:, cols], self._mp_scale), cst)
            cst = torch.div(cst * _FIX, self._mp_scale, rounding_mode="floor")
            fresh = bm <= 0
            full_here = torch.where(fw.squeeze(1) & ~naval, full_s, full_l)
            pm = torch.where(fresh, full_here.unsqueeze(1), bm).expand(-1, 6)
            turns = (bt + fresh.long()).expand(-1, 6)
            moves = pm - cst
            short = moves < 0
            moves = moves.clamp(min=0)
            at_start = ((best == start) & unmoved).unsqueeze(1)
            same_turn = bt == turns
            cst = torch.where(short & at_start, pm, cst)
            turns = torch.where(short & ~at_start & same_turn, turns + 1, turns)
            cst = torch.where(short & ~at_start & ~same_turn, torch.where(pm > 0, pm, _FIX), cst)
            if zp is not None:
                inz = zp.gather(1, nbc) & (moves > 0) & ~a6
                cst = torch.where(inz, pm, cst)
                moves = torch.where(inz, 0, moves)
            # the attack's step priced as any step, then spending the
            # Movement it leaves (`search`)
            cst = torch.where(a6, cst + moves, cst)
            moves = torch.where(a6, 0, moves)
            ok = act.unsqueeze(1) & (nb >= 0) & (ent_n.gather(1, nbc) | a6) & (turns <= max_turns)
            if zoc:
                ok = ok & ~(full_n.gather(1, b1) & (turns > bt))
            if zs is not None:
                ok = ok & ~(zs.gather(1, b1) & (best != start).unsqueeze(1) & ~a6)
            if stand:
                # the danger map's search: an attack is struck from a plot
                # the unit may stand on, its own or one none of its own
                # stacking units holds
                ok = ok & ~(a6 & full_n.gather(1, b1) & (best != start).unsqueeze(1))
            if cliff6 is not None:
                ok = ok & ~cliff6
            if link is not None:
                link(nbc, best, turns, moves, ok)
            # +4 where the step leaves no Movement, +3 more off the unit's
            # territory on a revealed plot; +2 a revealed plot, +3 an
            # unrevealed one
            seen6 = kn_n.gather(1, nbc)
            ends = torch.where(moves <= 0, ((tseat[rows.unsqueeze(1), nbc] != seat) & seen6).long() * 3 + 4, 0)
            gn = bg + cst * 1000 + (ends + 3 - seen6.long()) * _FIX
            s0 = st.gather(1, nbc)
            g0 = g.gather(1, nbc)
            t0 = tie.gather(1, nbc)
            new6 = ok & (s0 == 0)
            upd6 = ok & (s0 != 0) & (gn < g0)
            upo6 = upd6 & (s0 == 1)
            chg = new6 | upd6
            if not bool(chg.count_nonzero()):
                continue
            ins6 = new6 | upo6
            # the keys the six plots hold in the open list as the links land
            cur6 = key.gather(1, nbc)
            cur6 = torch.where(s0 == 1, cur6, none6)
            if bool((upo6 & (cur6 == hi.unsqueeze(1))).count_nonzero()):
                # a link makes the dearest open node cheaper: the links land
                # one by one, the dearest found again past it
                kx = key.clone()
                kx.scatter_(1, torch.where(nb >= 0, nbc, b1), NONE)
                hi_rest = torch.where(kx < NONE, kx, -1).max(dim=1).values
                tie6 = t0.clone()
                for j in range(6):
                    new = new6[:, j]
                    upo = upo6[:, j]
                    ins = new | upo
                    if not bool(ins.count_nonzero()):
                        continue
                    gj = gn[:, j]
                    lo_g = torch.div(lo, _KEY_SHIFT, rounding_mode="floor")
                    hi_g = torch.div(hi, _KEY_SHIFT, rounding_mode="floor")
                    inr = new & (lo < NONE) & (gj >= lo_g) & (gj <= hi_g)
                    head = (gj - lo_g).abs() <= (gj - hi_g).abs()
                    seq += inr.long()
                    tnew = torch.where(inr, torch.where(head, -seq, seq), 0)
                    seq += upo.long()
                    tj = torch.where(new, tnew, torch.where(upo, seq, t0[:, j]))
                    tie6[:, j] = tj
                    nk = gj * _KEY_SHIFT + tj + _TIE_OFF
                    lo = torch.where(ins, torch.minimum(lo, nk), lo)
                    old = cur6[:, j].clone()
                    cur6[:, j] = torch.where(ins, nk, old)
                    hi = torch.where(new, torch.maximum(hi, nk), hi)
                    fix = upo & (old == hi)
                    if bool(fix.count_nonzero()):
                        top6 = torch.where(cur6 < NONE, cur6, neg6).max(dim=1).values
                        hi = torch.where(fix, torch.maximum(hi_rest, top6), hi)
                nk6 = gn * _KEY_SHIFT + tie6 + _TIE_OFF
            else:
                # no link touches the dearest open node: each link's cheapest
                # and dearest are the open list's widened by the links before it
                gi = torch.where(ins6, gn, big6)
                gx = torch.where(new6, gn, neg6)
                lo_g0 = torch.div(lo, _KEY_SHIFT, rounding_mode="floor")
                hi_g0 = torch.div(hi, _KEY_SHIFT, rounding_mode="floor")
                cmin = torch.cat((lo_g0.unsqueeze(1), gi[:, :5]), dim=1).cummin(dim=1).values
                hi_g0 = torch.where(hi >= 0, hi_g0, -1)
                cmax = torch.cat((hi_g0.unsqueeze(1), gx[:, :5]), dim=1).cummax(dim=1).values
                open_j = torch.cat(((lo < NONE).unsqueeze(1), ins6[:, :5]), dim=1).long().cummax(dim=1).values.bool()
                lo_gj = cmin
                inr = new6 & open_j & (gn >= lo_gj) & (gn <= cmax)
                head = (gn - lo_gj).abs() <= (gn - cmax).abs()
                steps = (inr | upo6).long().cumsum(dim=1) + seq.unsqueeze(1)
                tie6 = torch.where(new6, torch.where(inr, torch.where(head, -steps, steps), 0),
                                   torch.where(upo6, steps, t0))
                seq = steps[:, 5]
                nk6 = gn * _KEY_SHIFT + tie6 + _TIE_OFF
                hi = torch.maximum(hi, torch.where(new6, nk6, neg6).max(dim=1).values)

            def put(t: torch.Tensor, vals: torch.Tensor, m: torch.Tensor = chg) -> None:
                t.scatter_(1, torch.where(m, nbc, b1), torch.where(m, vals, t.gather(1, b1).expand(-1, 6)))

            put(g, gn)
            put(mv, moves)
            put(tn, turns)
            put(par, best.unsqueeze(1).expand(-1, 6))
            put(tie, tie6)
            put(st, torch.ones_like(s0), new6)
            put(key, nk6, ins6)
        # the planning's list keeps the plots the unit may end on (0x586900):
        # none another player's unit holds, but where it attacks
        stand = ~self._tac_foreign(seat)[rows] | atk_n
        closed = rturn
        rank = torch.where(stand, rank, torch.full_like(rank, -1))
        rturn = torch.where(stand, rturn, torch.full_like(rturn, -1))
        out = {"rank": rank, "turns": rturn, "parent": par, "found": found, "start": start, "attack": atk_n,
               "moves": mv, "closed": closed}
        if plan is not None:
            out.update(plan["spots"])
        return out

    def _tac_spot_link(self, rows: torch.Tensor, start: torch.Tensor, naval: torch.Tensor, plan: dict):
        """`planUnit`'s `onLink` over the rows of a planning search: a closure
        laying, for a link onto plot `P` [N] from `par` at turn `T` with
        Movement `M` (`valid` the links priced), each unit target's or
        COMBAT_DISTRICT's spot (0x790c60) into `plan["spots"]`."""
        dev = self.device
        tp = plan["tp"]                      # [N, E] the entries' plots, -1 none
        civ = plan["civ"]                    # [N, E] a CIVILIAN entry
        R = plan["rng"].unsqueeze(1)         # [N, 1] the unit's range, 0 in melee
        fights = plan["fights"].unsqueeze(1)
        foreign = plan["foreign"][rows]      # [N, T] another player's fighter holds the plot
        N, E = tp.shape
        tpc = tp.clamp(min=0)
        water = self.water[rows]
        ctr = self._centre_plane()[rows]
        nav = naval.unsqueeze(1)
        w_tp = water.gather(1, tpc)
        spot = torch.full((N, E, 6), -1, dtype=torch.long, device=dev)
        sturn = torch.zeros(N, E, 6, dtype=torch.long, device=dev)
        sn = torch.zeros(N, E, dtype=torch.long, device=dev)
        plan["spots"] = {"spot": spot, "spot_turns": sturn, "spot_n": sn}
        k6 = torch.arange(6, device=dev).view(1, 1, 6)

        def link(P: torch.Tensor, par: torch.Tensor, T: torch.Tensor, M: torch.Tensor, valid: torch.Tensor) -> None:
            # K links of each row at once, in their order: P, T, M, valid
            # [N, K], par [N]; a spot an earlier link of the call lays, or
            # the six-spot cap, refuses the later ones as one by one
            if not bool(valid.count_nonzero()):
                return
            K = P.shape[1]
            d = self.pair_dist[P.unsqueeze(2), tpc.unsqueeze(1)].to(torch.long)   # [N, K, E]
            m0 = (M == 0).unsqueeze(2)
            own = (P == start.unsqueeze(1)).unsqueeze(2)
            Rk, civk, tpk = R.unsqueeze(1), civ.unsqueeze(1), tp.unsqueeze(1)
            taken = torch.where(Rk != 0, civk & (d == 0), d == 0)
            adj = ~taken & (Rk == 0) & (d == 1) & (m0 | own) & ~foreign.gather(1, P).unsqueeze(2)
            fixed = taken | (adj & ~m0)
            dd = torch.where(adj, torch.zeros_like(d), d)
            sp = torch.where(taken, par.view(N, 1, 1).expand(N, K, E), P.unsqueeze(2).expand(N, K, E))
            w_p = water.gather(1, P).unsqueeze(2)
            bad = taken & torch.where(nav.unsqueeze(1), ~w_p & ~ctr.gather(1, P).unsqueeze(2), w_p)
            tu = torch.where(~fixed & m0, T.unsqueeze(2) + 1, T.unsqueeze(2)).expand(N, K, E)
            w_sp = water.gather(1, sp.reshape(N, K * E)).reshape(N, K, E)
            ok = (valid.unsqueeze(2) & (tpk >= 0) & ~bad & (dd <= Rk) & fights.unsqueeze(1)
                  & ~(~nav.unsqueeze(1) & torch.where(Rk == 0, w_tp.unsqueeze(1), w_sp))
                  & ~((dd > 0) & civk))
            ok &= ~((spot.unsqueeze(1) == sp.unsqueeze(3)) & (k6 < sn.unsqueeze(2)).unsqueeze(1)).any(dim=3)
            los = ok & (Rk > 1) & (dd > 1)
            if bool(los.count_nonzero()):
                n_i, k_i, e_i = los.nonzero(as_tuple=True)
                seen = self._tac_sees(rows[n_i], sp[n_i, k_i, e_i], tpc[n_i, e_i])
                ok[n_i[~seen], k_i[~seen], e_i[~seen]] = False
            if not bool(ok.count_nonzero()):
                return
            if K > 1:
                # an earlier link of the call laying the same spot
                kk = torch.arange(K, device=dev)
                earlier = (kk.view(1, K) < kk.view(K, 1)).view(1, K, K, 1)          # [1, k, k', 1]: k' before k
                same = sp.unsqueeze(2) == sp.unsqueeze(1)                          # [N, k, k', E]
                ok &= ~(same & ok.unsqueeze(1) & earlier).any(dim=2)
            rank = ok.long().cumsum(dim=1) - 1
            ok &= (sn.unsqueeze(1) + rank) < 6
            if not bool(ok.count_nonzero()):
                return
            n_i, k_i, e_i = ok.nonzero(as_tuple=True)
            at = sn[n_i, e_i] + rank[n_i, k_i, e_i]
            spot[n_i, e_i, at] = sp[n_i, k_i, e_i]
            sturn[n_i, e_i, at] = tu[n_i, k_i, e_i]
            sn.add_(ok.sum(dim=1))

        return link

    def _tac_sees(self, rows: torch.Tensor, frm: torch.Tensor, to: torch.Tensor) -> torch.Tensor:
        """[K] bool — `canSee` of the plot `to` from an eye on `frm` (no
        Sentry), in the games `rows`: `_los_disk`'s occlusion for one pair."""
        K = rows.numel()
        tl = self._los_tgt[frm]                          # [K, N]
        hit = tl == to.unsqueeze(1)
        has = hit.any(dim=1)
        col = hit.long().argmax(dim=1)
        mid = self._los_mid[frm, col]                    # [K, 2, M]
        th = self._sight_through_plane(False)[rows]       # [K, T]
        M = mid.shape[2]
        mth = th.gather(1, mid.clamp(min=0).reshape(K, -1)).reshape(K, 2, M)
        mth = torch.where(mid >= 0, mth, torch.zeros_like(mth))
        obs_h = (self.hills[rows, frm].long() * self._sight_hills
                 + self.tile_mountain[rows, frm].long() * self._sight_mountain)
        tgt_h = th.gather(1, to.unsqueeze(1))
        stops = (mth > obs_h.view(K, 1, 1)) & (mth >= tgt_h.view(K, 1, 1)) & (mid >= 0)
        blocked = stops.any(dim=2).all(dim=1)
        return (has & ~blocked) | (frm == to)

    def _tac_step(self, rows: torch.Tensor, frm: torch.Tensor, to: torch.Tensor, dcol: torch.Tensor,
                  utype: torch.Tensor, ign_shore: torch.Tensor) -> torch.Tensor:
        """[R] long — `stepCost` of one step `frm` -> `to` (neighbour column
        `dcol`) for units of `utype` in the games `rows`, in `mp_scale`
        units: a hull's and an embarked unit's one Movement, a land/water
        step its plot's own cost and the embarking's (waived at a Harbor, a
        coastal city centre or by `ign_shore`), a land step the held plane's;
        one Movement at most into a city."""
        naval = self.unit_naval.take(utype)
        fw = self.water[rows, frm]
        tw = self.water[rows, to]
        mp1 = torch.full_like(frm, self._mp_scale)
        land = self._tac_cost()[rows, frm, dcol]
        ctr = self._centre_plane()
        dock = self._embark_waived(frm.unsqueeze(1), to.unsqueeze(1), rows).squeeze(1)
        trans = torch.where(tw, mp1, self._tac_entry()[rows, to])
        trans = trans + torch.where(dock | ign_shore, torch.zeros_like(trans),
                                    torch.full_like(trans, self._embark_transition_mp))
        trans = torch.where(ctr[rows, to], trans.clamp(max=self._mp_scale), trans)
        cost = torch.where(fw & tw, mp1, torch.where(fw != tw, trans, land))
        return torch.where(naval, mp1, cost)

    def _tac_move_to(self, mask: torch.Tensor, us: torch.Tensor, dest: torch.Tensor, pre: str = "barb",
                     seat: int = BARB_SEAT, strike: bool = True) -> None:
        """`moveTo` for the unit at local slot `us` [B] of pool `pre` (its
        player `seat`) in the games of `mask`: the pathfinder's path to `dest`
        with zones of control, walked as far as its Movement carries it this
        turn (a zone of control ends it); it walks through its own units and
        other players' but never ends on another player's unit or its own
        that stacks with it. A path ending on a plot it attacks into stops at
        its side, and with `strike` (the barbarians') it strikes there."""
        if not bool(mask.count_nonzero()):
            return
        dev = self.device
        B = self.B
        rows = mask.nonzero(as_tuple=True)[0]
        sr = us[rows]
        dr = dest[rows].clamp(min=0)
        res = self._tac_search(rows, sr, seat, 1 << 30, True, dr, pre=pre)
        par = res["parent"]
        start = res["start"]
        R = rows.shape[0]
        ar = torch.arange(R, device=dev)
        # the path, dest first, back to the unit's plot
        back = []
        cur = torch.where(res["found"], dr, start)
        while True:
            more = cur != start
            if not bool(more.count_nonzero()):
                break
            back.append(torch.where(more, cur, torch.full_like(cur, -1)))
            cur = torch.where(more, par[ar, cur], cur)
        if not back:
            return
        L = len(back)
        path = torch.stack(back[::-1], dim=1)  # [R, L], -1 before each row's first plot
        lead = (path < 0).sum(dim=1)
        # each row's path from column 0, -1 past its end
        idx = (lead.unsqueeze(1) + torch.arange(L, device=dev).unsqueeze(0))
        path = torch.where(idx < L, path.gather(1, idx.clamp(max=L - 1)), torch.full_like(path, -1))
        plen = L - lead
        # a path ending on a plot it attacks into: it walks to its side
        into = res["found"] & res["attack"][ar, dr] & (plen > 0)
        plen = plen - into.long()
        path = torch.where(torch.arange(L, device=dev).unsqueeze(0) < plen.unsqueeze(1), path, torch.full_like(path, -1))
        tile_p = getattr(self, f"{pre}_unit_tile")
        mp_p = getattr(self, f"{pre}_unit_mp")
        ut_pool = getattr(self, f"{pre}_unit_type")
        ut = ut_pool[rows, sr].clamp(min=0, max=self.NU - 1)
        naval = self.unit_naval.take(ut)
        ign_shore = self._ignore_shores(torch.full_like(ut_pool, seat), ut_pool)[rows, sr]
        halts = self._tac_zoc(seat)[rows] & ~self._tac_zoc_ignored(ut).unsqueeze(1)

        def own_at(pl: torch.Tensor) -> torch.Tensor:
            return (pl >= 0) & (self.unit_seat[rows].gather(1, pl.clamp(min=0)) == seat)

        # where it may not end: its own unit of its own stacking class (a
        # military one ashore, afloat or embarked; a civilian; a support
        # unit), any other player's unit
        civ_u = self._type_civilian.take(ut).unsqueeze(1)
        sup_u = self._type_support.take(ut).unsqueeze(1)
        own_mil = own_at(self.military_at[rows]) | own_at(self.embarked_at[rows])
        own_same = torch.where(civ_u, own_at(self.civilian_at[rows]),
                               torch.where(sup_u, own_at(self.support_at[rows]), own_mil))
        no_end = own_same | self._tac_foreign(seat)[rows]
        # how far its Movement carries it
        mp = mp_p[rows, sr].clone()
        full = getattr(self, f"{pre}_unit_mp_full")[rows, sr]
        frm = start.clone()
        stop = torch.zeros(R, dtype=torch.long, device=dev)
        on = torch.ones(R, dtype=torch.bool, device=dev)
        for i in range(L):
            p = path[:, i]
            on = on & (i < plen)
            if not bool(on.count_nonzero()):
                break
            pc = p.clamp(min=0)
            dcol = (self.neigh[frm] == pc.unsqueeze(1)).long().argmax(dim=1)
            c = self._tac_step(rows, frm, pc, dcol, ut, ign_shore)
            on = on & ~((mp < c) & (mp < full))
            mp = torch.where(on, (mp - c).clamp(min=0), mp)
            stop = torch.where(on, torch.full_like(stop, i + 1), stop)
            frm = torch.where(on, pc, frm)
            on = on & (mp > 0) & ~halts[ar, pc]
        for _ in range(L):
            back_off = (stop > 0) & no_end[ar, path.gather(1, (stop - 1).clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0)]
            if not bool(back_off.count_nonzero()):
                break
            stop = stop - back_off.long()
        gslot = torch.zeros(B, dtype=torch.long, device=dev)
        gslot[rows] = sr + self.POOL_LO[pre]
        going = stop > 0
        # the unit the walker passes over in the occupancy plane it enters
        # (the military plane, or the embarked one at sea: a merged slot, -1
        # none): the plane holds one unit, so it goes back once the walker
        # steps on
        under = torch.full((R,), -1, dtype=torch.long, device=dev)
        under_emb = torch.zeros(R, dtype=torch.bool, device=dev)
        for i in range(L):
            go = going & (i < stop)
            if not bool(go.count_nonzero()):
                break
            here = tile_p[rows, sr].clamp(min=0)
            nxc = path[:, i].clamp(min=0)
            dcol = (self.neigh[here] == nxc.unsqueeze(1)).long().argmax(dim=1)
            emb_to = self.water[rows, nxc] & ~naval
            occ = torch.where(emb_to, self.embarked_at[rows, nxc], self.military_at[rows, nxc])
            okB = torch.zeros(B, dtype=torch.bool, device=dev)
            okB[rows] = go
            hereB = torch.zeros(B, dtype=torch.long, device=dev)
            hereB[rows] = here
            nxtB = torch.zeros(B, dtype=torch.long, device=dev)
            nxtB[rows] = nxc
            dirB = torch.zeros(B, dtype=torch.long, device=dev)
            dirB[rows] = dcol
            mvB = self._step_verb(okB, gslot, hereB, nxtB, dirB, seat, torch.zeros_like(okB),
                                  clear_camp=seat != BARB_SEAT)
            moved = mvB[rows]
            back_on = moved & (under >= 0)
            if bool(back_on.count_nonzero()):
                bm = back_on & ~under_emb
                if bool(bm.count_nonzero()):
                    self.military_at[rows[bm], here[bm]] = under[bm]
                be = back_on & under_emb
                if bool(be.count_nonzero()):
                    self.embarked_at[rows[be], here[be]] = under[be]
            under = torch.where(moved, torch.where(occ >= 0, occ, torch.full_like(occ, -1)), under)
            under_emb = torch.where(moved, emb_to, under_emb)
            going = moved & (mp_p[rows, sr] > 0)
        # the strike, where its Movement and attacks last beside the plot
        if strike and bool(into.count_nonzero()):
            here = tile_p[rows, sr].clamp(min=0)
            hit = (into & getattr(self, f"{pre}_unit_alive")[rows, sr] & (mp_p[rows, sr] > 0)
                   & (getattr(self, f"{pre}_unit_attacks")[rows, sr] > 0) & (self.pair_dist[here, dr].to(torch.long) == 1))
            for u in torch.unique(sr[hit]).tolist():
                m = torch.zeros(B, dtype=torch.bool, device=dev)
                m[rows[hit & (sr == u)]] = True
                tt = torch.zeros(B, dtype=torch.long, device=dev)
                tt[rows] = dr
                if seat == BARB_SEAT:
                    self._barb_melee_at(m, u, tt)
                else:
                    self._hostile_vs_unit(m, tt, pre, u)

    # --------------------------------------------------- the target list

    def _tac_targets(self, seat: int, kb: int) -> dict:
        """THE TACTICAL TARGET LIST of `seat` (`tacticalTargets`) as plot
        planes over the plots it sees (a plot the barbarians only revealed
        giving its districts, camp, goody hut, improvement), the plots in
        index order and each plot's district entry before its other: `dk`
        [B, T] the district
        entry (0 none, 1 COMBAT_DISTRICT, 2 PASSIVE_DISTRICT) and `ds` its
        player; `ok` the other entry (0 none, 1 LOW, 2 MEDIUM, 3 HIGH, 4 CAMP,
        5 GOODY, 6 TRADER, 7 CIVILIAN, 8 RELIGIOUS, 9 IMPROVEMENT) and `os` its
        player (-1 for a camp, a goody hut or an improvement); `unit` [B, T]
        the global slot of the walk's unit entry's defender (-1 none). The
        UNIT ENTRIES alone, with the knowledge base's (row `kb` of the
        knowledge tensors, -1 none; `_tac_known_entries`) after the walk's,
        over [B, L * T] — entry `l * T + p` the `l`-th unit entry of plot `p`,
        the walk's in layer 0, L as many as the most entries one plot takes:
        `uk` the kind (0 none, 1 LOW, 2 MEDIUM, 3 HIGH, 7 CIVILIAN), `uu` the
        unit's global slot, `us` its player and `uo` the entry's place in the
        list (its plot for the walk's, the plots' count and after for the
        knowledge base's). The barbarians' prioritization makes HIGH a unit
        near one of their camps; any other player's a unit that threatens
        one of its districts (FRIENDLY_CITY)."""
        seen = self._barb_seen("barbarians" if seat == BARB_SEAT else seat)
        ts = self.tile_seat

        def hostile(s: torch.Tensor) -> torch.Tensor:
            return (s >= 0) & (s != seat) & self._seats_hostile(seat, s)

        ctr = self._centre_plane()
        enc = (self.district == self._encamp_didx) if self._encamp_didx >= 0 else torch.zeros_like(ctr)
        dd = self.district
        spec = self._is_specialty.take(dd.clamp(min=0)) & (dd >= 0)
        combat = ctr | enc
        passive = (dd >= 0) & ~enc & ~ctr & self.district_complete & ~self.district_pillaged & spec
        h_own = hostile(ts)
        dk = torch.zeros_like(ts)
        # a plot only revealed gives its districts, camp, goody hut, improvement
        rev = self.barb_explored if (seat == BARB_SEAT and self.fog_of_war) else None
        look = seen if rev is None else seen | rev
        dk = torch.where(look & h_own & combat, 1, torch.where(look & h_own & passive, 2, dk))
        ds = torch.where(dk > 0, ts, torch.full_like(ts, -1))
        none = torch.full_like(ts, -1)

        def seat_of(pl: torch.Tensor) -> torch.Tensor:
            return torch.where(pl >= 0, self.unit_seat.gather(1, pl.clamp(min=0)), none)

        mil = self._visible_military_at(seat)
        ms = seat_of(mil)
        emb = self.embarked_at
        es = seat_of(emb)
        et = self.unit_type.gather(1, emb.clamp(min=0)).clamp(min=0, max=self.NU - 1)
        efight = (emb >= 0) & self._type_dom_mil.take(et) & hostile(es)
        mfight = (mil >= 0) & hostile(ms)
        fight = (mfight | efight) & seen & ~combat
        dslot = torch.where(mfight, mil, torch.where(efight, emb, none))
        dseat = torch.where(mfight, ms, torch.where(efight, es, none))
        civ = self.civilian_at
        cs_ = seat_of(civ)
        ct = self.unit_type.gather(1, civ.clamp(min=0)).clamp(min=0, max=self.NU - 1)
        sup = self.support_at
        ss = seat_of(sup)
        trader = (civ >= 0) & (ct == self._trader_idx)
        relig = (civ >= 0) & (self._rel_strength.take(ct) > 0)
        n_civ = ((civ >= 0) & ~trader & ~relig).long() + (sup >= 0).long()
        civ_seat = torch.where((civ >= 0) & ~trader & ~relig, cs_, ss)
        civ_slot = torch.where((civ >= 0) & ~trader & ~relig, civ, sup)
        camp = torch.zeros_like(seen)
        cp = self.camp_tile
        if cp.numel():
            camp.scatter_(1, cp.clamp(min=0), cp >= 0)
            # the scatter's clamped -1 slots land on plot 0: put it back
            camp[:, 0] = (cp == 0).any(dim=1)
        goody = self.tile_goody.bool() if self.tile_goody.dtype != torch.bool else self.tile_goody
        rest = seen & ~combat & ~fight
        okk = torch.zeros_like(ts)
        oss = none.clone()
        # the first of the chain, each plot taking the first that holds
        taken = ~rest
        for kind, cond, who in (
            (4, camp, none), (5, goody, none),
            (6, trader & hostile(cs_), cs_),
            (7, n_civ == 1, civ_seat),
            (8, relig & hostile(cs_), cs_),
            (9, (self.improvement >= 0) & ~self.pillaged & h_own & ~goody, none),
        ):
            hit = cond & ~taken
            okk = torch.where(hit, kind, okk)
            oss = torch.where(hit, who, oss)
            taken = taken | hit
            if kind in (6, 7):
                # a Trader or a lone civilian ends the plot's chain, ours or not
                taken = taken | (cond & ~taken)
        if rev is not None:
            # a plot revealed, not seen, with no district: its camp, goody hut
            # or unpillaged improvement of a player at war
            ronly = rev & ~seen & (dd < 0) & ~ctr
            imp = (self.improvement >= 0) & ~self.pillaged & h_own
            rk = torch.where(camp, 4, torch.where(goody, 5, torch.where(imp, 9, 0)))
            okk = torch.where(ronly, rk, okk)
            oss = torch.where(ronly, none, oss)
        # a CIVILIAN or a RELIGIOUS entry only of a player at war with `seat`
        okk = torch.where(((okk == 7) | (okk == 8)) & ~hostile(oss), 0, okk)
        # the walk's unit entries in layer 0 on the plots it sees, the
        # knowledge base's after them on plots it does not
        uk = torch.where(fight, 1, torch.where(okk == 7, 7, 0))
        us = torch.where(uk > 0, torch.where(fight, dseat, oss), none)
        uu = torch.where(fight, dslot, torch.where(okk == 7, civ_slot, none))
        uo = torch.where(uk > 0, self._arange_bt, torch.full_like(ts, 1 << 40))
        if kb >= 0:
            uk, uu, us, uo = self._tac_known_entries(seat, kb, seen, uk, uu, us, uo)
        L = uk.shape[1] // self.T

        def rep(x: torch.Tensor) -> torch.Tensor:
            return x.repeat(1, L)
        # every LOW entry, the walk's and the knowledge base's, read on its
        # own unit: MEDIUM where a unit that cannot fight shares the plot
        efight = uk == 1
        eslot = uu.clamp(min=0)
        nonc = (civ >= 0) | (sup >= 0)
        lowk = torch.where(efight & rep(nonc), 2, torch.ones_like(uk))
        dt = self.unit_type.gather(1, eslot).clamp(min=0, max=self.NU - 1)
        rs = self._type_ranged_strength.take(dt)
        rng = self._type_ranged_range.take(dt) + self._promo_val(dt, self.unit_promos.gather(1, eslot), "RANGE")
        if seat == BARB_SEAT:
            # HIGH within BARBARIAN_DEFENSE_ALL_UNITS of a camp of the list, or
            # a ranged one within its range + BARBARIAN_DEFENSE_RANGED_UNITS
            lcamp = okk == 4
            if bool(lcamp.count_nonzero()):
                # the list's camp entries: a camp seen with no foe on it, or one
                # only revealed
                cl = (cp >= 0) & lcamp.gather(1, cp.clamp(min=0))  # [B, K]
                dk_ = self.pair_dist[cp.clamp(min=0)].to(torch.long)  # [B, K, T]
                dmin = torch.where(cl.unsqueeze(2), dk_, torch.full_like(dk_, 1 << 20)).min(dim=1).values  # [B, T]
                dmin = rep(dmin)
                high = (dmin <= _BARB_DEFENSE_ALL) | ((rs > 0) & (dmin <= rng + _BARB_DEFENSE_RANGED))
                lowk = torch.where(efight & high, 3, lowk)
        else:
            # HIGH where it threatens a district of `seat`'s it sees: a ranged
            # or bombard unit within its range, any other nearer than twice
            # its Movement
            own = seen & (ts == seat) & ((dd >= 0) | ctr)
            if bool((own.any(dim=1) & efight.any(dim=1)).count_nonzero()):
                b_i, q_i = own.nonzero(as_tuple=True)
                dmin = torch.full((self.B, self.T), 1 << 20, dtype=torch.long, device=self.device)
                dmin.index_reduce_(0, b_i, self.pair_dist[q_i].to(torch.long), "amin")  # [B, T]
                dmin = rep(dmin)
                full_all = torch.cat((self._full_mp("major") - self.major_unit_aura_mp,
                                      self._full_mp("barb") - self.barb_unit_aura_mp), dim=1)
                moves = torch.div(full_all.gather(1, eslot), self._mp_scale, rounding_mode="floor")
                shoots = (rs > 0) | (self._type_bombard.take(dt) > 0)
                reach = torch.where(rs > 0, rng, torch.ones_like(rng))
                high = torch.where(shoots, dmin <= reach, dmin < 2 * moves)
                lowk = torch.where(efight & high, 3, lowk)
        # the walk's LOW entry is its plot's other entry too (layer 0)
        okk = torch.where(fight, lowk[:, :self.T], okk)
        oss = torch.where(fight, dseat, oss)
        unit = torch.where(fight, dslot, torch.where(okk == 7, civ_slot, none))
        uk = torch.where(efight, lowk, uk)
        return {"dk": dk, "ds": ds, "ok": okk, "os": oss, "unit": unit, "uk": uk, "uu": uu, "us": us, "uo": uo}

    def _tac_known_entries(self, seat: int, kb: int, seen: torch.Tensor, uk: torch.Tensor, uu: torch.Tensor,
                   us: torch.Tensor, uo: torch.Tensor):
        """the knowledge base's entries of `seat`'s target list (`knowledgeEntries`,
        0x5eb8b0 at age 1, distance 2) onto the unit entries' planes: each
        record of row `kb` of age exactly 1 of a player at war with `seat`,
        in the game's player order, then the units' table order, then the
        records' order (`citystate_kb_seq`), whose unit (its pool slot, its
        type and owner still the record's) stands within 2 of the plot
        recorded on a plot `seat` does not see: a LOW entry there for a unit
        with Combat, else a CIVILIAN one, its place after the walk's. Each
        record its entry (0x745f40 appends with no plot check): the `l`-th
        record on a plot in that order fills layer `l` there, the planes
        [B, T] grown to [B, L * T] for the most records one plot takes (a
        plot the walk sees holds none of them, its layer 0 free)."""
        B, T, dev = self.B, self.T, self.device
        turn = int(self.turn)
        slot = self.citystate_kb_slot[:, kb].long()
        own = self.citystate_kb_owner[:, kb].long()
        typ = self.citystate_kb_type[:, kb].long()
        sn = self.citystate_kb_seen[:, kb].long()
        pl = self.citystate_kb_plot[:, kb].long()
        sq = self.citystate_kb_seq[:, kb].long()
        sc = slot.clamp(min=0)
        live = (slot >= 0) & self.unit_alive.gather(1, sc) & (self.unit_tile.gather(1, sc) >= 0)
        live = live & (self.unit_type.gather(1, sc) == typ) & (self.unit_seat.gather(1, sc) == own)
        at = self.unit_tile.gather(1, sc).clamp(min=0)
        near = self.pair_dist[at, pl.clamp(min=0)].to(torch.long) <= _KNOWN_UNIT_RANGE
        ok = live & (turn - sn == 1) & near & ~seen.gather(1, at) & self._seats_hostile(seat, own)
        if not bool(ok.count_nonzero()):
            return uk, uu, us, uo
        porder = torch.where(own < 100, own, torch.where(own < FREE_SEAT, 1000 + own,
                                                          torch.where(own == FREE_SEAT, 5000, 6000)))
        key = torch.where(ok, (porder * (self.NU + 1) + typ) * (1 << 24) + sq, torch.full_like(sq, 1 << 62))
        srt = key.argsort(dim=1, stable=True)
        ok_s = ok.gather(1, srt)
        at_s = at.gather(1, srt)
        R = srt.shape[1]
        # each record's layer: the records before it in the list on its plot
        same = (at_s.unsqueeze(2) == at_s.unsqueeze(1)) & ok_s.unsqueeze(1) & ok_s.unsqueeze(2)
        before = torch.ones(R, R, dtype=torch.bool, device=dev).tril(-1)
        layer = (same & before).sum(dim=2)                              # [B, R]
        L = int(torch.where(ok_s, layer, torch.zeros_like(layer)).max()) + 1
        if L > 1:
            def grow(x: torch.Tensor, fill: int) -> torch.Tensor:
                return torch.cat((x, torch.full((B, (L - 1) * T), fill, dtype=x.dtype, device=dev)), dim=1)
            uk, uu, us, uo = grow(uk, 0), grow(uu, -1), grow(us, -1), grow(uo, 1 << 40)
        combat = self._type_combat.take(typ.clamp(min=0, max=self.NU - 1)) > 0
        b_i, j_i = ok_s.nonzero(as_tuple=True)
        k_i = srt[b_i, j_i]
        e_i = layer[b_i, j_i] * T + at_s[b_i, j_i]
        uk[b_i, e_i] = torch.where(combat[b_i, k_i], 1, 7).to(uk.dtype)
        uu[b_i, e_i] = sc[b_i, k_i].to(uu.dtype)
        us[b_i, e_i] = own[b_i, k_i].to(us.dtype)
        uo[b_i, e_i] = (T + j_i).to(uo.dtype)
        return uk, uu, us, uo

    # ------------------------------------------------------ the tactical pass

    def _tac_ai(self) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, P] long twice — each barbarian's AI type (`aiTypeOf`: its
        tribe's camp defender DEFENDER while the camp stands, its scouts
        EXPLORE, a civilian none (-1), every other COMBAT) and the tribe that
        raised it (`tribeOf`, its defender included; -1 none)."""
        dev = self.device
        ut = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        fighter = self._type_dom_mil.take(ut)
        tribe = self.barb_unit_tribe.clone()
        isdef = torch.zeros_like(fighter)
        kt = torch.arange(self.KT, device=dev).unsqueeze(0)
        has = (self.tribe_defender >= 0) & (kt < self.n_tribes.unsqueeze(1))
        if bool(has.count_nonzero()):
            b_i, k_i = has.nonzero(as_tuple=True)
            d = self.tribe_defender[b_i, k_i]
            tribe[b_i, d] = k_i
            isdef[b_i, d] = self.tribe_alive[b_i, k_i]
        scout = self.barb_unit_scout & (self.barb_unit_tribe >= 0)
        ai = torch.where(isdef, _AI_DEFENDER, torch.where(scout, _AI_EXPLORE, _AI_COMBAT))
        return torch.where(fighter, ai, torch.full_like(ai, -1)), tribe

    def _tac_tactical(self, ai: torch.Tensor, utribe: torch.Tensor) -> torch.Tensor:
        """[B, P] bool — `tacticalUnit`: a unit of AI type EXPLORE or above,
        an explorer (PSEUDOYIELD_UNIT_EXPLORER) only while its tribe rampages"""
        ut = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        tr = utribe.clamp(min=0)
        ramp = (utribe >= 0) & ~self.tribe_alive.gather(1, tr) & (self.tribe_ramp.gather(1, tr) >= 0)
        explorer = (ai == _AI_EXPLORE) & self._type_explorer.take(ut)
        return (ai >= _AI_EXPLORE) & (~explorer | ramp)

    # ------------------------------------------------------- the planning

    def _tac_plan(self, rows: torch.Tensor, slots: torch.Tensor, tg: dict, pre: str = "barb",
                  seat: int = BARB_SEAT) -> dict:
        """`planUnit` for the units at local `slots` of pool `pre` (player
        `seat`) in the games `rows`
        [N]: the list's unit targets and COMBAT_DISTRICTs within 2 x the
        unit's Movement + its range of it ("tp" [N, E] their plots in the
        list's order, -1 past each row's; "te" a unit entry's entry of the
        list's unit planes, -1 a district's or none), the planning search of
        two turns laying their spots, then per target with a spot its predicted blow from where the
        unit stands ("dealt", "taken" [N, E]; a civilian taken 150), and per
        spot of a fighter its blow back on the unit standing there
        ("back_taken", "back_dealt" [N, E, 6]); "wins" [N] a blow that kills."""
        dev = self.device
        N, T = rows.shape[0], self.T
        dk, uk, uo = tg["dk"][rows], tg["uk"][rows], tg["uo"][rows]
        fight = (uk >= 1) & (uk <= 3)
        # the entries in the list's order: a plot's district entry before its
        # unit entries, the knowledge base's unit entries after the walk's;
        # the sort's index a district entry's plot below T, a unit entry's
        # T + its entry (`_tac_targets`' layers)
        here = getattr(self, f"{pre}_unit_tile")[rows, slots].clamp(min=0)
        rng = self._tac_range(rows, slots, pre)
        lim = torch.div(self._tac_full_now(pre)[rows, slots], self._mp_scale, rounding_mode="floor") * _PLAN_TURNS + rng
        inl = self.pair_dist[here].to(torch.long) <= lim.unsqueeze(1)
        BIG = 1 << 40
        ar = torch.arange(T, device=dev).unsqueeze(0)
        kd = torch.where((dk == 1) & inl, 2 * ar, torch.full_like(dk, BIG))
        ku = torch.where((uk > 0) & inl.repeat(1, uk.shape[1] // T), 2 * uo + 1, torch.full_like(uk, BIG))
        allk = torch.cat((kd, ku), dim=1)
        E = max(int((allk < BIG).sum(dim=1).max()) if N else 0, 1)
        srt = allk.argsort(dim=1, stable=True)[:, :E]
        has = allk.gather(1, srt) < BIG
        tp = torch.where(has, srt % T, torch.full_like(srt, -1))
        other = has & (srt >= T)
        te = torch.where(other, srt - T, torch.full_like(srt, -1))   # [N, E] a unit entry's entry
        tpc = tp.clamp(min=0)
        tec = te.clamp(min=0)
        civ = other & (uk.gather(1, tec) == 7)
        mil = self.military_at
        ms = torch.where(mil >= 0, self.unit_seat.gather(1, mil.clamp(min=0)), torch.full_like(mil, seat))
        emb = self.embarked_at
        es = torch.where(emb >= 0, self.unit_seat.gather(1, emb.clamp(min=0)), torch.full_like(emb, seat))
        et = self.unit_type.gather(1, emb.clamp(min=0)).clamp(min=0, max=self.NU - 1)
        foreign = (ms != seat) | ((es != seat) & self._type_dom_mil.take(et))
        plan = {"tp": tp, "civ": civ, "rng": rng, "fights": self._tac_can_fight(pre)[rows, slots], "foreign": foreign}
        res = self._tac_search(rows, slots, seat, _PLAN_TURNS, False, pre=pre, plan=plan)
        sn = res["spot_n"]
        dealt = torch.zeros(N, E, dtype=torch.long, device=dev)
        taken = torch.zeros(N, E, dtype=torch.long, device=dev)
        back_t = torch.zeros(N, E, 6, dtype=torch.long, device=dev)
        back_d = torch.zeros(N, E, 6, dtype=torch.long, device=dev)
        wins = torch.zeros(N, dtype=torch.bool, device=dev)
        dslot = tg["uu"][rows].gather(1, tec)                         # [N, E] the target's unit
        job = (sn > 0) & other & (dslot >= 0)
        if bool(job.count_nonzero()):
            n_i, e_i = job.nonzero(as_tuple=True)
            a_slot = slots[n_i] + self.POOL_LO[pre]
            d_j = dslot[n_i, e_i]
            dl, tk = self._tac_predict(rows[n_i], a_slot, d_j, tpc[n_i, e_i])
            dl = torch.where(civ[n_i, e_i], torch.full_like(dl, _CIVILIAN_TAKEN), dl)
            dealt[n_i, e_i] = dl
            taken[n_i, e_i] = tk
            hp = self.unit_hp[rows[n_i], d_j]
            wins[n_i[dl > hp]] = True
            # the fighter's blow back on the unit standing on each spot
            fj = fight[n_i, tec[n_i, e_i]]
            k6 = torch.arange(6, device=dev).unsqueeze(0)
            sp = res["spot"][n_i, e_i]                                 # [J, 6]
            on = fj.unsqueeze(1) & (k6 < sn[n_i, e_i].unsqueeze(1))
            if bool(on.count_nonzero()):
                j_i, s_i = on.nonzero(as_tuple=True)
                bd, bt = self._tac_predict(rows[n_i[j_i]], d_j[j_i], a_slot[j_i], sp[j_i, s_i])
                back_t[n_i[j_i], e_i[j_i], s_i] = bd
                back_d[n_i[j_i], e_i[j_i], s_i] = bt
        res.update({"tp": tp, "te": te, "civ": civ, "other": other, "dealt": dealt, "taken": taken, "back_taken": back_t,
                    "back_dealt": back_d, "wins": wins})
        return res

    def _tac_predict(self, rows: torch.Tensor, a_slot: torch.Tensor, d_slot: torch.Tensor,
                     tiles: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """`predictBlow` for each of the jobs [J] — the merged-pool unit
        `a_slot` striking the unit `d_slot` on `tiles` from where it stands
        in the games `rows`: the damage it deals and the damage it takes, by
        the strengths the blows resolve on (`_melee_unit_strengths`,
        `_ranged_unit_strengths`, the attacker's pool's terms) and the damage
        law's expectation (`_damage_expected`); a ranged blow and one on an
        embarked defender take none. The jobs of one game run one call each,
        the games side by side, the two pools apart."""
        dev = self.device
        J = rows.numel()
        dealt = torch.zeros(J, dtype=torch.long, device=dev)
        taken = torch.zeros(J, dtype=torch.long, device=dev)
        if not J:
            return dealt, taken
        hostile = (a_slot >= self.POOL_LO["barb"]) & (a_slot < self.POOL_HI["barb"])
        for pool_h in (False, True):
            js = (hostile == pool_h).nonzero(as_tuple=True)[0]
            if js.numel():
                dl, tk = self._tac_predict_pool(rows[js], a_slot[js], d_slot[js], tiles[js], not pool_h)
                dealt[js], taken[js] = dl, tk
        return dealt, taken

    def _tac_predict_pool(self, rows: torch.Tensor, a_slot: torch.Tensor, d_slot: torch.Tensor,
                          tiles: torch.Tensor, major: bool) -> tuple[torch.Tensor, torch.Tensor]:
        """`_tac_predict` for jobs whose attackers are all of one pool
        (`major`: the majors' pool, the city-states' units in it): the jobs
        as a batch of their own (`_GameRows`), a job a game"""
        g = _GameRows(self, rows)
        cls = type(self)
        d_seat = g.unit_seat.gather(1, d_slot.unsqueeze(1)).squeeze(1)
        at = g.unit_type.gather(1, a_slot.unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)
        ranged = self._type_ranged_strength.take(at) > 0
        dealt = torch.zeros(rows.numel(), dtype=torch.long, device=self.device)
        taken = torch.zeros_like(dealt)
        if not bool(ranged.all()):
            ma, md, d_emb = cls._melee_unit_strengths(g, major, a_slot, tiles, d_slot, d_seat)
            dealt = torch.where(ranged, dealt, self._damage_expected(ma - md))
            taken = torch.where(ranged | d_emb, taken, self._damage_expected(md - ma))
        if bool(ranged.any()):
            ra, rd = cls._ranged_unit_strengths(g, not major, a_slot, tiles, d_slot, d_seat)
            dealt = torch.where(ranged, self._damage_expected(ra - rd), dealt)
        return dealt, taken

    def _barbarian_tactics(self, acting: torch.Tensor) -> None:
        """THE BARBARIANS' TACTICAL PASS (`barbarianTactics`) for the units
        of `acting` [B, P] — those that stood before their camps raised this
        turn's: each one's planning reach taken before any moves, then the
        moves of Tactics.xml's "Default Barbarian" and "Default Barbarian HL"
        lists in order, each walking the units the moves before it left — in
        their pool's slot order (`barb_unit_slotno`); at the turn's end the
        knowledge base looks again (`_knowledge_look` on the row `BK`) and the
        turn's captures start their operations (`_barb_captures`)."""
        self._tac_in_pass = True
        self._tac_cost_held = None
        self._tac_full_held = None
        try:
            self._tac_pass(acting)
        finally:
            self._tac_in_pass = False
            self._tac_cost_held = None
            self._tac_full_held = None
        ones = torch.ones(self.B, dtype=torch.bool, device=self.device)
        seen = self._barb_seen("barbarians")
        self._knowledge_look(self.BK, BARB_SEAT, seen, ones, False)
        self._barb_kb_camps(seen)
        # the turn's captures start their operations
        self._barb_captures()

    def _tac_range(self, b: torch.Tensor, s: torch.Tensor, pre: str = "barb") -> torch.Tensor:
        """`rangeOf` for the units at local slots `s` of pool `pre` in the
        games `b`: a ranged unit's range with its promotions, 0 in melee."""
        ut = getattr(self, f"{pre}_unit_type")[b, s].clamp(min=0, max=self.NU - 1)
        rng = self._type_ranged_range.take(ut) + self._promo_val(ut, getattr(self, f"{pre}_unit_promos")[b, s], "RANGE")
        return torch.where(self._type_ranged_strength.take(ut) > 0, rng, torch.zeros_like(rng))

    def _tac_peers(self, local: torch.Tensor, pre: str = "barb") -> torch.Tensor:
        """[B, NG] bool — the units of pool `pre` in `local` [B, P] on the
        units' index: the units of one job (`jobOf`: an operation's, the
        pass's)"""
        out = torch.zeros(self.B, self.unit_seat.shape[1], dtype=torch.bool, device=self.device)
        lo = self.POOL_LO[pre]
        out[:, lo:lo + local.shape[1]] = local
        return out

    def _tac_stacked_other(self, us: torch.Tensor, pre: str = "barb", seat: int = BARB_SEAT) -> torch.Tensor:
        """[B, T] — a military unit of `seat` (ashore, afloat or embarked)
        other than the one at local slot `us` [B] of pool `pre` holds the
        plot (`stackedOther`)."""
        g = (us + self.POOL_LO[pre]).unsqueeze(1)
        out = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for pl in (self.military_at, self.embarked_at):
            out |= (pl >= 0) & (self.unit_seat.gather(1, pl.clamp(min=0)) == seat) & (pl != g)
        return out

    def _tac_rampage(self, live, done: torch.Tensor, utribe: torch.Tensor, rowof: torch.Tensor, res: dict,
                     tg: dict, order: torch.Tensor, npass: torch.Tensor) -> None:
        """BARBARIAN RAMPAGE (`rampage`): each unit, in pool order, of a tribe
        whose camp a player's unit took goes after that player's targets among
        its planning's — one it has a spot to strike from first, then the
        nearest, the list's first of equals — struck (`strike`); with none it
        heads for the city of that player its tribe goes after (`chaseCity`),
        to the first plot of its reach of this turn within its range (1 at
        least) of the city with none of its own stacking there, else it stays.
        The picks read the target list and the reach as the pass began."""
        dev = self.device
        B, T = self.B, self.T
        P = simbase.BARB_POOL_MAX
        bidx = torch.arange(B, device=dev)
        tr = utribe.clamp(min=0)
        rp = self.tribe_ramp.gather(1, tr)
        ramp = (utribe >= 0) & ~self.tribe_alive.gather(1, tr) & (rp >= 0)
        cand = live() & ramp & (rowof >= 0)
        if not bool(cand.count_nonzero()):
            return
        b_k, s_k = cand.nonzero(as_tuple=True)
        rsel = rowof[b_k, s_k]
        K = b_k.numel()
        Pk = rp[b_k, s_k]
        here = self.barb_unit_tile[b_k, s_k].clamp(min=0)
        rng = self._tac_range(b_k, s_k)
        lim = torch.div(self._tac_full_now()[b_k, s_k], self._mp_scale, rounding_mode="floor") * _PLAN_TURNS + rng
        d = self.pair_dist[here].to(torch.long)  # [K, T]
        inplan = d <= lim.unsqueeze(1)
        # the planning's targets with a spot: a district entry's, an other's
        tp = res["tp"][rsel]
        te = res["te"][rsel]
        has = (res["spot_n"][rsel] > 0) & (tp >= 0)
        oth = res["other"][rsel]
        uk, us_, uo = tg["uk"][b_k], tg["us"][b_k], tg["uo"][b_k]
        L = uk.shape[1] // T
        kk = torch.arange(K, device=dev).unsqueeze(1).expand_as(tp)
        spot_a = torch.zeros(K, T, dtype=torch.bool, device=dev)
        spot_u = torch.zeros_like(uk, dtype=torch.bool)
        spot_a[kk[has & ~oth], tp[has & ~oth]] = True
        spot_u[kk[has & oth], te[has & oth]] = True
        dk, ds = tg["dk"][b_k], tg["ds"][b_k]
        okk, os_ = tg["ok"][b_k], tg["os"][b_k]
        cand_a = (dk > 0) & (ds == Pk.unsqueeze(1)) & inplan
        # a plot's other entries: its units' (the walk's or the knowledge
        # base's, in the list's place), else a Trader's or a religious
        # unit's (no spot: the planning strikes neither)
        cand_u = (uk > 0) & (us_ == Pk.unsqueeze(1)) & inplan.repeat(1, L)
        cand_b = (okk >= 4) & (okk != 7) & (os_ == Pk.unsqueeze(1)) & inplan
        ar = torch.arange(T, device=dev).unsqueeze(0)
        W2 = 4 * T + 2
        MAXK = 1 << 60
        ka = torch.where(cand_a, (~spot_a).long() * (W2 * W2) + d * W2 + 2 * ar, MAXK)
        ku = torch.where(cand_u, (~spot_u).long() * (W2 * W2) + d.repeat(1, L) * W2 + 2 * uo.clamp(max=2 * T) + 1, MAXK)
        kb = torch.where(cand_b, W2 * W2 + d * W2 + 2 * ar + 1, MAXK)
        ma, ia = ka.min(dim=1)
        mu, iu = ku.min(dim=1)
        mb, ib = kb.min(dim=1)
        ib = torch.where(mu < mb, iu % T, ib)
        mb = torch.minimum(mu, mb)
        use_b = mb < ma
        pick = torch.full((B, P), -1, dtype=torch.long, device=dev)
        pick_cd = torch.zeros(B, P, dtype=torch.bool, device=dev)
        has = torch.minimum(ma, mb) < MAXK
        pt = torch.where(use_b, ib, ia)
        pick[b_k, s_k] = torch.where(has, pt, torch.full_like(pt, -1))
        pick_cd[b_k, s_k] = has & ~use_b & (dk.gather(1, pt.unsqueeze(1)).squeeze(1) == 1)
        rank, turns, moves = res["rank"], res["turns"], res["moves"]
        BIG = 1 << 40

        def first_in_reach(row: torch.Tensor, ok: torch.Tensor) -> torch.Tensor:
            """[B] the plot of each game's reach row that closed first among `ok` [B, T], -1 none"""
            rk_ = rank[row.clamp(min=0)]
            key = torch.where(ok & (rk_ >= 0), rk_, torch.full_like(rk_, BIG))
            m, i = key.min(dim=1)
            return torch.where(m < BIG, i, torch.full_like(i, -1))

        # the pool positions a rampaging unit holds in some game
        npos = int(npass.max()) if B else 0
        js: list[int] = []
        if npos:
            held = cand.gather(1, order[:, :npos]) & (torch.arange(npos, device=dev).unsqueeze(0) < npass.unsqueeze(1))
            js = held.any(dim=0).nonzero(as_tuple=True)[0].tolist()
        for j in js:
            u_b = order[:, j]
            onj = (j < npass) & live()[bidx, u_b] & cand[bidx, u_b]
            if not bool(onj.count_nonzero()):
                continue
            row = rowof[bidx, u_b]
            tgt = pick[bidx, u_b]
            st = onj & (tgt >= 0)
            tc = tgt.clamp(min=0)
            urng = self._tac_range(bidx, u_b)
            if bool(st.count_nonzero()):
                mil = self.military_at.gather(1, tc.unsqueeze(1)).squeeze(1)
                ms = torch.where(mil >= 0, self.unit_seat.gather(1, mil.clamp(min=0).unsqueeze(1)).squeeze(1),
                                 torch.full_like(mil, -1))
                emb = self.embarked_at.gather(1, tc.unsqueeze(1)).squeeze(1)
                es = torch.where(emb >= 0, self.unit_seat.gather(1, emb.clamp(min=0).unsqueeze(1)).squeeze(1),
                                 torch.full_like(emb, -1))
                et = self.unit_type.gather(1, emb.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=self.NU - 1)
                foe = ((mil >= 0) & (ms != BARB_SEAT)) | ((emb >= 0) & (es != BARB_SEAT) & self._type_dom_mil.take(et))
                fight = pick_cd[bidx, u_b] | foe
                shoot = st & fight & (urng > 0)
                if bool(shoot.count_nonzero()):
                    at = self.barb_unit_tile[bidx, u_b].clamp(min=0)
                    far = shoot & (self.pair_dist[at, tc].to(torch.long) > urng)
                    if bool(far.count_nonzero()):
                        rr = row.clamp(min=0)
                        dtp = self.pair_dist[tc].to(torch.long)  # [B, T]
                        ok = ((turns[rr] == 1) & (moves[rr] > 0) & ~res["attack"][rr] & (dtp <= urng.unsqueeze(1))
                              & ~self._tac_stacked_other(u_b) & far.unsqueeze(1))
                        spot = first_in_reach(row, ok)
                        self._tac_move_to(far & (spot >= 0), u_b, spot)
                    at = self.barb_unit_tile[bidx, u_b].clamp(min=0)
                    fire = (shoot & self.barb_unit_alive[bidx, u_b] & (self.pair_dist[at, tc].to(torch.long) <= urng)
                            & (self.barb_unit_mp[bidx, u_b] > 0) & (self.barb_unit_attacks[bidx, u_b] > 0))
                    for u in torch.unique(u_b[fire]).tolist():
                        self._hostile_ranged_strike(fire & (u_b == u), tc, "barb", u)
                self._tac_move_to(st & ~shoot, u_b, tc)
                done[bidx[st], u_b[st]] = True
            ch = onj & (tgt < 0)
            if not bool(ch.count_nonzero()):
                continue
            city = self._tac_chase_city(ch, utribe[bidx, u_b].clamp(min=0), rp[bidx, u_b])
            go = ch & (city >= 0)
            if not bool(go.count_nonzero()):
                continue
            rr = row.clamp(min=0)
            dc = self.pair_dist[city.clamp(min=0)].to(torch.long)
            ok = ((turns[rr] == 1) & (dc <= urng.clamp(min=1).unsqueeze(1))
                  & ~self._tac_stacked_other(u_b) & go.unsqueeze(1))
            spot = first_in_reach(row, ok)
            mv = go & (spot >= 0)
            self._tac_move_to(mv, u_b, spot)
            done[bidx[mv], u_b[mv]] = True

    def _tac_reachers(self, cand: torch.Tensor, ai: torch.Tensor, order: torch.Tensor) -> torch.Tensor:
        """`reachers`' DEFENDER rule over the candidates `cand` [B, P]: in
        pool order a DEFENDER before the first other unit goes in only as the
        last such before it; with no other unit none goes in."""
        P = cand.shape[1]
        c_o = cand.gather(1, order)
        d_o = (ai == _AI_DEFENDER).gather(1, order)
        pos = torch.arange(P, device=self.device).unsqueeze(0)
        nd = c_o & ~d_o
        k = torch.where(nd, pos, torch.full_like(pos, P)).min(dim=1).values.unsqueeze(1)
        before = pos < k
        lastd = torch.where(c_o & d_o & before, pos, torch.full_like(pos, -1)).max(dim=1).values.unsqueeze(1)
        keep = ((c_o & ~before) | (c_o & d_o & (pos == lastd))) & (k < P)
        out = torch.zeros_like(cand)
        out.scatter_(1, order, keep)
        return out

    def _tac_in_order(self, m: torch.Tensor, tg: dict) -> torch.Tensor:
        """[B, U] the unit entries `m` [B, U] marks (of `_tac_targets`' layers)
        in the target list's order (`uo`), the entries' count U past each
        game's"""
        key = torch.where(m, tg["uo"], torch.full_like(tg["uo"], 1 << 40))
        idx = key.argsort(dim=1, stable=True)
        return torch.where(key.gather(1, idx) < (1 << 40), idx, torch.full_like(idx, key.shape[1]))

    def _tac_can_fight(self, pre: str = "barb") -> torch.Tensor:
        """[B, P] — the unit of pool `pre` has a strength to fight with"""
        ut = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        return ((self._type_combat.take(ut) > 0) | (self._type_ranged_strength.take(ut) > 0)
                | (self._type_bombard.take(ut) > 0))

    def _tac_attack_civilians(self, live, done: torch.Tensor, ai: torch.Tensor, reach_at, tg: dict,
                              order: torch.Tensor, npass: torch.Tensor) -> None:
        """ATTACK CIVILIANS (`attackCivilians`): each CIVILIAN target of the
        list in its order, the units whose reach takes its plot within two
        turns go for it in pool order — each that can act moves onto it, a
        melee one's turn then done, until the civilian is taken; then each
        ranged one within its range strikes it."""
        dev = self.device
        B, T = self.B, self.T
        bidx = torch.arange(B, device=dev)
        civ = tg["uk"] == 7
        n = civ.sum(dim=1)
        J = int(n.max()) if B else 0
        if not J:
            return
        ents = self._tac_in_order(civ, tg)
        U = civ.shape[1]
        fights = self._tac_can_fight()
        npos = int(npass.max())
        for j in range(J):
            e = ents[:, j].clamp(max=U - 1)
            t = e % T
            act = j < n
            s0 = tg["uu"][bidx, e].clamp(min=0)
            seat0 = tg["us"][bidx, e]

            def held() -> torch.Tensor:
                return (self.unit_alive[bidx, s0] & (self.unit_tile[bidx, s0] == t)
                        & (self.unit_seat[bidx, s0] == seat0))

            on = act & held()
            if not bool(on.count_nonzero()):
                continue
            rt = reach_at(t)
            cand = self._tac_reachers(live() & fights & (rt >= 1) & (rt <= _PLAN_TURNS) & on.unsqueeze(1), ai, order)
            if not bool(cand.count_nonzero()):
                continue
            gone = torch.zeros(B, dtype=torch.bool, device=dev)
            c_o = cand.gather(1, order[:, :npos])
            js = c_o.any(dim=0).nonzero(as_tuple=True)[0].tolist()
            for jj in js:
                u_b = order[:, jj]
                go = cand[bidx, u_b] & ~gone & live()[bidx, u_b] & (self.barb_unit_mp[bidx, u_b] > 0)
                if not bool(go.count_nonzero()):
                    continue
                self._tac_move_to(go, u_b, t)
                melee = go & (self._tac_range(bidx, u_b) == 0)
                done[bidx[melee], u_b[melee]] = True
                gone |= go & ~held()
            for jj in js:
                u_b = order[:, jj]
                rng = self._tac_range(bidx, u_b)
                at = self.barb_unit_tile[bidx, u_b].clamp(min=0)
                go = (cand[bidx, u_b] & ~gone & live()[bidx, u_b] & (self.barb_unit_mp[bidx, u_b] > 0) & (rng > 0)
                      & (self.pair_dist[at, t].to(torch.long) <= rng))
                if not bool(go.count_nonzero()):
                    continue
                fire = go & (self.barb_unit_attacks[bidx, u_b] > 0)
                for u in torch.unique(u_b[fire]).tolist():
                    self._hostile_ranged_strike(fire & (u_b == u), t, "barb", u)
                done[bidx[go], u_b[go]] = True

    def _tac_homeland_plunder(self, live, done: torch.Tensor, order: torch.Tensor, npass: torch.Tensor,
                              tg: dict) -> None:
        """THE HOMELAND'S PLUNDER TRADER (`homelandPlunder`): each TRADER
        target of the list in plot order, each homeland unit left with
        Movement, not yet queued, whose one-turn search closes on the target's
        plot where it may stand, queued with it; the queue carried out in its
        order — targets in plot order, units in pool order — each queued unit
        that can act going onto its plot, its turn done."""
        B, T, dev = self.B, self.T, self.device
        bidx = torch.arange(B, device=dev)
        trd = tg["ok"] == 6
        if not bool(trd.count_nonzero()):
            return
        cand = live() & (self.barb_unit_mp > 0)
        rows, slots = cand.nonzero(as_tuple=True)
        if not rows.numel():
            return
        res = self._tac_search(rows, slots, BARB_SEAT, 1, False)
        hit = (res["turns"] >= 0) & (res["turns"] <= 1) & trd[rows]
        key = torch.where(hit, torch.arange(T, device=dev).unsqueeze(0), torch.full_like(res["turns"], T))
        first = key.min(dim=1).values
        P = cand.shape[1]
        goal = torch.full((B, P), -1, dtype=torch.long, device=dev)
        goal[rows, slots] = torch.where(first < T, first, torch.full_like(first, -1))
        if not bool((goal >= 0).count_nonzero()):
            return
        n = trd.sum(dim=1)
        tiles = torch.where(trd, self._arange_bt, torch.full_like(self._arange_bt, T)).sort(dim=1).values
        npos = int(npass.max())
        for j in range(int(n.max())):
            t = tiles[:, j]
            for jj in range(npos):
                u_b = order[:, jj]
                go = ((jj < npass) & (j < n) & (goal[bidx, u_b] == t) & live()[bidx, u_b]
                      & (self.barb_unit_mp[bidx, u_b] > 0))
                if not bool(go.count_nonzero()):
                    continue
                self._tac_move_to(go, u_b, t)
                done[bidx[go], u_b[go]] = True

    def _tac_plunder(self, live, done: torch.Tensor, ai: torch.Tensor, reach_at, tg: dict,
                     order: torch.Tensor, npass: torch.Tensor) -> None:
        """PLUNDER TRADER (`plunderTraders`): each TRADER target of the list
        in plot order, the units whose reach takes its plot this turn go for
        it in pool order — each that can act moves onto it, its turn done,
        until one stands on its plot."""
        dev = self.device
        B, T = self.B, self.T
        bidx = torch.arange(B, device=dev)
        trd = tg["ok"] == 6
        n = trd.sum(dim=1)
        J = int(n.max()) if B else 0
        if not J:
            return
        tiles = torch.where(trd, self._arange_bt, torch.full_like(self._arange_bt, T)).sort(dim=1).values
        fights = self._tac_can_fight()
        npos = int(npass.max())
        for j in range(J):
            t = tiles[:, j].clamp(max=T - 1)
            act = j < n
            rt = reach_at(t)
            cand = self._tac_reachers(live() & fights & (rt == 1) & act.unsqueeze(1), ai, order)
            if not bool(cand.count_nonzero()):
                continue
            stood = torch.zeros(B, dtype=torch.bool, device=dev)
            js = cand.gather(1, order[:, :npos]).any(dim=0).nonzero(as_tuple=True)[0].tolist()
            for jj in js:
                u_b = order[:, jj]
                go = cand[bidx, u_b] & ~stood & live()[bidx, u_b] & (self.barb_unit_mp[bidx, u_b] > 0)
                if not bool(go.count_nonzero()):
                    continue
                self._tac_move_to(go, u_b, t)
                done[bidx[go], u_b[go]] = True
                stood |= go & self.barb_unit_alive[bidx, u_b] & (self.barb_unit_tile[bidx, u_b] == t)

    def _tac_chase(self, live, done: torch.Tensor, rowof: torch.Tensor, res: dict, tg: dict,
                   order: torch.Tensor, npass: torch.Tensor, pre: str = "barb", seat: int = BARB_SEAT,
                   strike: bool = True) -> None:
        """CHASE TARGET (`chaseTarget`): each land unit left, in pool order,
        takes the LOW target standing where it does, else the last of the list
        within 8 of it whose plot its reach takes within two turns, and moves
        to the first plot of its reach of this turn within its range (1 at
        least) of the target with none of its own stacking there — the
        units of pool `pre`, the player `seat`, the move striking with
        `strike`."""
        dev = self.device
        B = self.B
        bidx = torch.arange(B, device=dev)
        low = tg["uk"] == 1
        if not bool(low.count_nonzero()):
            return
        uo = tg["uo"]
        T = self.T
        L = uo.shape[1] // T
        npos = int(npass.max()) if B else 0
        land = ~self.unit_naval.take(getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1))
        rank, turns = res["rank"], res["turns"]
        BIG = 1 << 40
        for j in range(npos):
            u_b = order[:, j]
            row = rowof[bidx, u_b]
            on = (j < npass) & live()[bidx, u_b] & land[bidx, u_b] & (row >= 0)
            if not bool(on.count_nonzero()):
                continue
            rr = row.clamp(min=0)
            at = getattr(self, f"{pre}_unit_tile")[bidx, u_b].clamp(min=0)
            d = self.pair_dist[at].to(torch.long).repeat(1, L)  # [B, U] at each unit entry's plot
            rt = turns[rr]
            rtu = rt.repeat(1, L)
            here = low & (d == 0)
            far = low & (d > 0) & (d < _CHASE_SIGHT) & (rtu >= 1) & (rtu <= _PLAN_TURNS)
            mx, last = torch.where(far, uo, torch.full_like(uo, -1)).max(dim=1)
            tgt = torch.where(here.any(dim=1), here.long().argmax(dim=1) % T,
                              torch.where(mx >= 0, last % T, torch.full_like(last, -1)))
            on = on & (tgt >= 0)
            if not bool(on.count_nonzero()):
                continue
            tc = tgt.clamp(min=0)
            r = self._tac_range(bidx, u_b, pre).clamp(min=1)
            ok = ((rt == 1) & (self.pair_dist[tc].to(torch.long) <= r.unsqueeze(1))
                  & ~self._tac_stacked_other(u_b, pre, seat) & on.unsqueeze(1))
            rk_ = rank[rr]
            key = torch.where(ok & (rk_ >= 0), rk_, torch.full_like(rk_, BIG))
            m, spot = key.min(dim=1)
            mv = on & (m < BIG)
            self._tac_move_to(mv, u_b, spot, pre, seat, strike)
            done[bidx[mv], u_b[mv]] = True

    def _tac_chase_city(self, on: torch.Tensor, k: torch.Tensor, seat: torch.Tensor) -> torch.Tensor:
        """`chaseCity` for tribe `k` [B] going after `seat` [B]: of the cities
        its raid waits for that `seat` holds, the nearest its camp within 16,
        else `seat`'s nearest city; -1 none."""
        dev = self.device
        B = self.B
        bidx = torch.arange(B, device=dev)
        camp = self.tribe_plot[bidx, k].clamp(min=0)
        lim = _CHASE_RANGE + 1
        rq = self.tribe_raidq[bidx, k]   # [B, TL]
        rpl = self.tribe_raidp[bidx, k]
        pc = rpl.clamp(min=0)
        held = (rq >= 0) & (rq == seat.unsqueeze(1)) & (rpl >= 0) & (self.tile_seat.gather(1, pc) == seat.unsqueeze(1))
        dr = self.pair_dist[camp.unsqueeze(1), pc].to(torch.long)
        kr = torch.where(held & (dr < lim), dr * (rq.shape[1] + 1) + torch.arange(rq.shape[1], device=dev), 1 << 40)
        m, i = kr.min(dim=1)
        out = torch.where(on & (m < (1 << 40)), pc.gather(1, i.unsqueeze(1)).squeeze(1), torch.full_like(m, -1))
        rest = on & (out < 0)
        if bool(rest.count_nonzero()):
            maj = rest & (seat >= 0) & (seat < self.n_majors)
            if bool(maj.count_nonzero()):
                g = seat.clamp(min=0, max=max(self.n_majors - 1, 0))
                cc = self.city_center[bidx, g].clamp(min=0)   # [B, M]
                ca = self.city_alive[bidx, g]
                dcc = self.pair_dist[camp.unsqueeze(1), cc].to(torch.long)
                M = cc.shape[1]
                kc = torch.where(ca & (dcc < lim), dcc * (M + 1) + torch.arange(M, device=dev), 1 << 40)
                m2, i2 = kc.min(dim=1)
                out = torch.where(maj & (m2 < (1 << 40)), cc.gather(1, i2.unsqueeze(1)).squeeze(1), out)
            if self.S > 0:
                mi = rest & (seat >= 100) & (seat < 100 + self.S)
                if bool(mi.count_nonzero()):
                    j = (seat - 100).clamp(min=0, max=self.S - 1)
                    cen = self.citystate_center[bidx, j]
                    okc = (mi & self.citystate_alive[bidx, j] & (cen >= 0)
                           & (self.pair_dist[camp, cen.clamp(min=0)].to(torch.long) < lim))
                    out = torch.where(okc, cen, out)
        return out

    # --------------------------------------------------------- attack units

    def _tac_attack_units(self, live, done: torch.Tensor, ai: torch.Tensor, order: torch.Tensor,
                          rowof: torch.Tensor, res: dict, tg: dict, kind: int, peers: torch.Tensor, pre: str = "barb",
                          seat: int = BARB_SEAT) -> None:
        """ATTACK HIGH / MEDIUM / LOW PRIORITY (`attackUnits`, `kind` the
        list's LOW 1, MEDIUM 2, HIGH 3): each target of the kind in the list's
        order, its unit still standing, the units that can strike its plot
        (`strikers`) assigned over the targets of the kind within 5 of it
        (`_tac_assign`, `peers` the pass's units) and the assignment carried
        out (`_tac_carry_out`)."""
        dev = self.device
        B, T = self.B, self.T
        P = getattr(self, f"{pre}_unit_alive").shape[1]
        bidx = torch.arange(B, device=dev)
        isk = tg["uk"] == kind
        cnt = isk.sum(dim=1)
        J = int(cnt.max()) if B else 0
        if not J:
            return
        ents = self._tac_in_order(isk, tg)
        unit_pl, seat_pl = tg["uu"], tg["us"]
        U = isk.shape[1]
        L = U // T

        def standing(e: torch.Tensor) -> torch.Tensor:
            """[B, K] the unit entry `e`'s unit still stands on its plot"""
            ec = e.clamp(min=0, max=U - 1)
            s = unit_pl.gather(1, ec)
            sc = s.clamp(min=0)
            return ((e >= 0) & (e < U) & (s >= 0) & self.unit_alive.gather(1, sc)
                    & (self.unit_tile.gather(1, sc) == ec % T) & (self.unit_seat.gather(1, sc) == seat_pl.gather(1, ec)))

        fights = self._tac_can_fight(pre)
        ut = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        ranged = self._type_ranged_strength.take(ut) > 0
        sl = torch.arange(P, device=dev).unsqueeze(0).expand(B, P)
        urng = torch.where(ranged, self._tac_range(bidx.unsqueeze(1).expand(B, P), sl, pre), torch.zeros_like(sl))
        rsafe = rowof.clamp(min=0)
        rturn, rmoves = res["turns"], res["moves"]
        all_e = torch.arange(U, device=dev).unsqueeze(0).expand(B, U)
        for j in range(J):
            t = ents[:, j].clamp(max=U - 1) % T
            on = (j < cnt) & standing(ents[:, j:j + 1]).squeeze(1)
            if not bool(on.count_nonzero()):
                continue
            # its own stacking units where they stand now, the earlier
            # targets' attacks moved (`stackedAt`)
            mil = self.military_at
            own_stk = (mil >= 0) & (self.unit_seat.gather(1, mil.clamp(min=0)) == seat)
            # `strikers`: in melee the plot within two turns, at range a plot
            # exactly the range from it within two turns with Movement left and
            # none of its own stacking there but its own plot
            rt_t = rturn[rsafe, t.unsqueeze(1).expand(B, P)]
            melee_ok = (urng == 0) & (rt_t >= 1) & (rt_t <= _PLAN_TURNS)
            rng_ok = torch.zeros(B, P, dtype=torch.bool, device=dev)
            cand0 = live() & fights & (rowof >= 0) & on.unsqueeze(1)
            rk = cand0 & (urng > 0)
            if bool(rk.count_nonzero()):
                b_i, s_i = rk.nonzero(as_tuple=True)
                n_i = rowof[b_i, s_i]
                dq = self.pair_dist[t[b_i]].to(torch.long)                       # [K, T]
                here = getattr(self, f"{pre}_unit_tile")[b_i, s_i]
                okq = ((dq == urng[b_i, s_i].unsqueeze(1)) & (rturn[n_i] >= 1) & (rturn[n_i] <= _PLAN_TURNS)
                       & (rmoves[n_i] > 0) & (~own_stk[b_i] | (self._arange_bt[b_i] == here.unsqueeze(1))))
                rng_ok[b_i, s_i] = okq.any(dim=1)
            cand = self._tac_reachers(cand0 & (melee_ok | rng_ok), ai, order)
            if not bool(cand.count_nonzero()):
                continue
            near = isk & standing(all_e) & (self.pair_dist[t].to(torch.long) <= _ATTACK_TARGETS_RANGE).repeat(1, L)
            near &= on.unsqueeze(1)
            plain = torch.full((B,), kind != 3, dtype=torch.bool, device=dev)
            out = self._tac_assign(cand, order, ai, near, res, rowof, unit_pl, plain, kind != 3, tg["uk"], tg["uo"], peers, pre, seat)
            self._tac_carry_out(out, done, rowof, res, pre, seat)

    def _tac_assign(self, cand: torch.Tensor, order: torch.Tensor, ai: torch.Tensor, near: torch.Tensor,
                    res: dict, rowof: torch.Tensor, unit_pl: torch.Tensor, exchange: torch.Tensor,
                    survive: bool, kinds: torch.Tensor, place: torch.Tensor, peers: torch.Tensor, pre: str = "barb",
                    seat: int = BARB_SEAT, district: bool = False) -> dict:
        """`assignTo` for the units `cand` [B, P] (in pool order) over the
        targets `near` [B, U] (the list's unit entries of `_tac_targets`'
        layers, `unit_pl`, `kinds` and `place` [B, U] each one's unit, kind
        and place in the list's order), `peers` [B, NG] the units of the
        units' job (`_tac_peers`), `exchange` [B] dropping a spot
        of a losing exchange, `survive` one that would kill the unit, neither
        against a HIGH target (`kinds` the list's entry, 3): each claim a unit has on a spot
        of a target's planning entry, the Generalized Assignment of the units
        to the spots in the order first claimed, and each assigned unit's
        move, sorted (`assignedBefore`). With `district` the targets are the
        list's COMBAT_DISTRICT entries over [B, T] — a city's centre, its health the
        city's, the unit's blow its predicted one (`_predict_city_blow`), no
        blow back. Returns "slot", "move", "attack" [B, U] in the order they
        run, -1 past each game's."""
        dev = self.device
        B = self.B
        BIG = 1 << 40
        P = cand.shape[1]
        bidx = torch.arange(B, device=dev)
        # the units in pool order, the targets in the list's order
        c_o = cand.gather(1, order)
        ku = torch.where(c_o, torch.arange(P, device=dev).unsqueeze(0), torch.full_like(order, BIG))
        ku_s, ki = ku.sort(dim=1)
        U = int((ku_s < BIG).sum(dim=1).max())
        uv = ku_s[:, :U] < BIG                                              # [B, U]
        us = torch.where(uv, order.gather(1, ki[:, :U]), torch.zeros_like(uv, dtype=torch.long))
        kp = torch.where(near, place, torch.full_like(place, BIG))
        kix = kp.argsort(dim=1, stable=True)
        K = max(int(near.sum(dim=1).max()), 1)
        tv = kp.gather(1, kix[:, :K]) < BIG                                  # [B, K]
        tk = torch.where(tv, kix[:, :K], torch.zeros_like(kix[:, :K]))      # the targets' entries
        tplot = tk % self.T                                                  # their plots
        uhp = self.unit_hp.gather(1, us + self.POOL_LO[pre])
        full_hp = int(self.rules.combat["unitHp"])
        if district:
            # a city's centre: the city's health and its owner
            tslot = torch.full_like(tk, -1)
            dmax, dhp, dseat = self._centre_health(tplot)
            health = dmax * _ATTACK_HEALTH_256 // 256 - (dmax - dhp)         # [B, K]
            tbarb = dseat == BARB_SEAT
            tgt_ok = tv & (dmax > 0)
        else:
            tslot = unit_pl.gather(1, tk)                                    # the targets' units
            thp = self.unit_hp.gather(1, tslot.clamp(min=0))
            health = full_hp * _ATTACK_HEALTH_256 // 256 - (full_hp - thp)   # [B, K]
            tbarb = self.unit_seat.gather(1, tslot.clamp(min=0)) == BARB_SEAT
            tgt_ok = tv & (tslot >= 0)
        # each unit's planning entry for each target
        n_u = rowof.gather(1, us).clamp(min=0)                               # [B, U]
        # a district target's entry is its plot, a unit target's its unit entry
        tp = res["tp"][n_u] if district else res["te"][n_u]                   # [B, U, E]
        kind_e = ~res["other"][n_u] if district else res["other"][n_u]
        hit = (tp.unsqueeze(2) == tk.view(B, 1, K, 1)) & kind_e.unsqueeze(2)
        hit &= tp.unsqueeze(2) >= 0
        has_e = hit.any(dim=3)                                               # [B, U, K]
        e_ix = hit.long().argmax(dim=3)
        nn = n_u.unsqueeze(2).expand(B, U, K)
        spot = res["spot"][nn, e_ix]                                         # [B, U, K, 6]
        sturn = res["spot_turns"][nn, e_ix]
        sn = res["spot_n"][nn, e_ix]
        if district:
            # the unit's predicted blow on each city (`predictCityBlow`), none back
            dealt = torch.zeros(B, U, K, dtype=torch.long, device=dev)
            for ui in range(U):
                for ki in range(K):
                    m_ = uv[:, ui] & tgt_ok[:, ki] & has_e[:, ui, ki]
                    if bool(m_.any()):
                        dealt[:, ui, ki] = torch.where(m_, self._predict_city_blow(pre, us[:, ui], tplot[:, ki]), dealt[:, ui, ki])
            taken = torch.zeros_like(dealt)
            bt = torch.zeros(B, U, K, 6, dtype=torch.long, device=dev)
            bd = torch.zeros_like(bt)
        else:
            dealt = res["dealt"][nn, e_ix]                                    # [B, U, K]
            taken = res["taken"][nn, e_ix]
            bt = res["back_taken"][nn, e_ix]                                  # [B, U, K, 6]
            bd = res["back_dealt"][nn, e_ix]
        k6 = torch.arange(6, device=dev).view(1, 1, 1, 6)
        here = getattr(self, f"{pre}_unit_tile").gather(1, us)                              # [B, U]
        mp = getattr(self, f"{pre}_unit_mp").gather(1, us)
        moved = mp < getattr(self, f"{pre}_unit_mp_full").gather(1, us)
        defender = ai.gather(1, us) == _AI_DEFENDER
        ok = (uv & (mp > 0)).view(B, U, 1, 1) & tgt_ok.view(B, 1, K, 1) & has_e.unsqueeze(3) & (k6 < sn.unsqueeze(3))
        got = taken.unsqueeze(3) + bt
        drop = (exchange.view(B, 1, 1, 1) & (got > dealt.unsqueeze(3) + bd)) | (survive & (got > uhp.view(B, U, 1, 1)))
        ok &= ~(drop & (kinds.gather(1, tk) != 3).view(B, 1, K, 1))
        h4 = here.view(B, U, 1, 1)
        ok &= ~(defender.view(B, U, 1, 1) & (spot != h4))
        ok &= ~((sturn == 1) & moved.view(B, U, 1, 1) & (spot != h4))
        # no spot another unit holds that stacks with it, its own units of
        # its job with Movement left aside
        spc = spot.clamp(min=0).view(B, -1)
        for pl in (self.military_at, self.embarked_at):
            x = pl.gather(1, spc)
            xs = x.clamp(min=0)
            xt = self.unit_type.gather(1, xs).clamp(min=0, max=self.NU - 1)
            mine = (self.unit_seat.gather(1, xs) == seat) & peers.gather(1, xs) & (self.unit_mp.gather(1, xs) > 0)
            blk = (x >= 0) & self._type_dom_mil.take(xt) & ~mine
            blk = blk.view(B, U, K, 6) & (x.view(B, U, K, 6) != tslot.view(B, 1, K, 1))
            ok &= ~blk
        # the claims, in the order the targets, the units and the spots run
        C = U * K * 6
        cv = ok.permute(0, 2, 1, 3).reshape(B, C)
        cplot = spot.permute(0, 2, 1, 3).reshape(B, C)
        cu = torch.arange(U, device=dev).view(1, 1, U, 1).expand(B, K, U, 6).reshape(B, C)
        ck = torch.arange(K, device=dev).view(1, K, 1, 1).expand(B, K, U, 6).reshape(B, C)
        cdealt = dealt.permute(0, 2, 1).unsqueeze(3).expand(B, K, U, 6).reshape(B, C)
        cturn = sturn.permute(0, 2, 1, 3).reshape(B, C).clamp(min=1)
        # the spots in the order first claimed
        same = (cplot.unsqueeze(2) == cplot.unsqueeze(1)) & cv.unsqueeze(1) & cv.unsqueeze(2)
        tri = torch.ones(C, C, dtype=torch.bool, device=dev).tril()
        firstc = (same & tri).long().argmax(dim=2)                            # [B, C]
        is_first = cv & (firstc == torch.arange(C, device=dev).unsqueeze(0))
        rank = is_first.long().cumsum(dim=1) - 1
        csid = torch.where(cv, rank.gather(1, firstc), torch.full_like(rank, -1))
        S = int(is_first.sum(dim=1).max()) if C else 0
        at = torch.full((B, U), -1, dtype=torch.long, device=dev)
        tun = torch.zeros(B, K, U, dtype=torch.bool, device=dev)              # the units a target holds
        tdmg = torch.zeros(B, K, dtype=torch.long, device=dev)
        holder = torch.full((B, max(S, 1)), -1, dtype=torch.long, device=dev)
        holder_t = torch.full((B, max(S, 1)), -1, dtype=torch.long, device=dev)
        val = torch.zeros(B, C, dtype=torch.long, device=dev)
        blow = torch.div(cdealt, cturn, rounding_mode="trunc")
        cidx = torch.arange(C, device=dev)
        uidx = torch.arange(U, device=dev)

        def gain(sp: torch.Tensor, wmask: torch.Tensor) -> torch.Tensor:
            """[B, U] each unit's worth at its spot `sp` [B, U] (0x7702b0),
            the claims it weighs written to `val` where `wmask` [B, U]"""
            M = cv.unsqueeze(1) & (csid.unsqueeze(1) == sp.unsqueeze(2)) & (cu.unsqueeze(1) == uidx.view(1, U, 1))
            holds = tun.gather(1, ck.unsqueeze(2).expand(B, C, U)).transpose(1, 2)    # [B, U, C] the claim's target holds the unit
            A = M & holds
            p = torch.where(A, cidx.view(1, 1, C), torch.full_like(A, C, dtype=torch.long)).min(dim=2).values
            Wm = M & (cidx.view(1, 1, C) < p.unsqueeze(2))
            dk_ = tdmg.gather(1, ck)
            hl_ = health.gather(1, ck)
            killed = dk_ >= hl_
            v = torch.where(killed, hl_ - dk_ + _ATTACK_KILL, blow)
            vb = torch.trunc(v.to(torch.float32) * torch.tensor(_ATTACK_BARB, dtype=torch.float32, device=dev)).to(torch.long)
            v = torch.where(tbarb.gather(1, ck), vb, v)
            wr = (Wm & wmask.unsqueeze(2)).any(dim=1)
            val.copy_(torch.where(wr, v, val))
            best = torch.where(Wm, v.unsqueeze(1), torch.zeros_like(Wm, dtype=torch.long)).max(dim=2).values.clamp(min=0)
            pc = p.clamp(max=C - 1)
            hb = blow.gather(1, pc) + torch.where(killed.gather(1, pc), _ATTACK_KILL, 0)
            return torch.where(p < C, hb, best)

        def claim(m: torch.Tensor, i: torch.Tensor, j: torch.Tensor, prev: torch.Tensor) -> torch.Tensor:
            """the unit `i` [B] takes the spot `j` [B] in the games `m`
            (0x770710), letting go of `prev` and of the spot's holder; the
            holder let go returned (-1 none)"""
            on_c = cv & (cu == i.unsqueeze(1))
            # its old spot: its claim there whose target holds it
            pm = m & (prev >= 0)
            hp_ = on_c & (csid == prev.unsqueeze(1)) & tun.gather(1, ck.unsqueeze(2).expand(B, C, U)).gather(
                2, i.view(B, 1, 1).expand(B, C, 1)).squeeze(2)
            c1 = torch.where(hp_, cidx.unsqueeze(0), torch.full_like(hp_, C, dtype=torch.long)).min(dim=1).values
            g1 = pm & (c1 < C)
            k1 = ck.gather(1, c1.clamp(max=C - 1).unsqueeze(1)).squeeze(1)
            tun[bidx[g1], k1[g1], i[g1]] = False
            sub = g1 & (cturn.gather(1, c1.clamp(max=C - 1).unsqueeze(1)).squeeze(1) == 1)
            tdmg[bidx[sub], k1[sub]] -= cdealt[bidx[sub], c1[sub]]
            pr = prev.clamp(min=0)
            holder[bidx[pm], pr[pm]] = -1
            holder_t[bidx[pm], pr[pm]] = -1
            # the spot's holder
            occ = torch.where(m, holder.gather(1, j.unsqueeze(1)).squeeze(1), torch.full_like(j, -1))
            om = m & (occ >= 0)
            ot = holder_t.gather(1, j.unsqueeze(1)).squeeze(1)
            oc = cv & (csid == j.unsqueeze(1)) & (cu == occ.unsqueeze(1)) & (ck == ot.unsqueeze(1))
            c2 = torch.where(oc, cidx.unsqueeze(0), torch.full_like(oc, C, dtype=torch.long)).min(dim=1).values
            g2 = om & (c2 < C)
            k2 = ck.gather(1, c2.clamp(max=C - 1).unsqueeze(1)).squeeze(1)
            o2 = occ.clamp(min=0)
            tun[bidx[g2], k2[g2], o2[g2]] = False
            sub2 = g2 & (cturn.gather(1, c2.clamp(max=C - 1).unsqueeze(1)).squeeze(1) == 1)
            tdmg[bidx[sub2], k2[sub2]] -= cdealt[bidx[sub2], c2[sub2]]
            # its best claim there
            mine = cv & (csid == j.unsqueeze(1)) & (cu == i.unsqueeze(1))
            vv = torch.where(mine, val, torch.full_like(val, -BIG))
            top = vv.max(dim=1).values
            c3 = torch.where(mine & (vv == top.unsqueeze(1)), cidx.unsqueeze(0), torch.full_like(mine, C, dtype=torch.long)).min(dim=1).values
            g3 = m & (c3 < C)
            k3 = ck.gather(1, c3.clamp(max=C - 1).unsqueeze(1)).squeeze(1)
            tun[bidx[g3], k3[g3], i[g3]] = True
            add = g3 & (cturn.gather(1, c3.clamp(max=C - 1).unsqueeze(1)).squeeze(1) == 1)
            tdmg[bidx[add], k3[add]] += cdealt[bidx[add], c3[add]]
            holder[bidx[g3], j[g3]] = i[g3]
            holder_t[bidx[g3], j[g3]] = k3[g3]
            return occ

        # THE GENERALIZED ASSIGNMENT, one pass over the spots
        for jj in range(S):
            jv = torch.full((B, U), jj, dtype=torch.long, device=dev)
            g_j = gain(jv, uv)
            away = uv & (at >= 0) & (at != jj)
            g_at = gain(at.clamp(min=0), away)
            w = torch.where(away, g_j - g_at, g_j)
            w = torch.where(uv, w, torch.full_like(w, -BIG))
            top, pick = w.max(dim=1)
            pick = torch.where(w == top.unsqueeze(1), uidx.unsqueeze(0), torch.full_like(w, U)).min(dim=1).values
            m = (top > 0) & (at.gather(1, pick.clamp(max=U - 1).unsqueeze(1)).squeeze(1) != jj)
            if not bool(m.count_nonzero()):
                continue
            pk = pick.clamp(max=U - 1)
            prev = at.gather(1, pk.unsqueeze(1)).squeeze(1)
            occ = claim(m, pk, torch.full((B,), jj, dtype=torch.long, device=dev), prev)
            at[bidx[m], pk[m]] = jj
            om = m & (occ >= 0)
            at[bidx[om], occ[om]] = -1
        # each assigned unit's move: its claim whose target holds it
        holds = tun.gather(1, ck.unsqueeze(2).expand(B, C, U))                   # [B, C, U]
        hc = holds.gather(2, cu.unsqueeze(2)).squeeze(2)
        mc = cv.unsqueeze(1) & (csid.unsqueeze(1) == at.unsqueeze(2)) & (cu.unsqueeze(1) == uidx.view(1, U, 1)) & hc.unsqueeze(1)
        c4 = torch.where(mc, cidx.view(1, 1, C), torch.full_like(mc, C, dtype=torch.long)).min(dim=2).values
        got = uv & (at >= 0) & (c4 < C)
        c4c = c4.clamp(max=C - 1)
        move = torch.where(got, cplot.gather(1, c4c), torch.full_like(c4, -1))
        att = torch.where(got & (cturn.gather(1, c4c) == 1), tplot.gather(1, ck.gather(1, c4c)), torch.full_like(c4, -1))
        frm = here
        dmg = int(self.rules.combat["unitHp"]) - uhp
        slot = torch.where(got, us, torch.full_like(us, -1))
        # the tie-break: the pool slot
        pslot = getattr(self, "barb_unit_slotno" if seat == BARB_SEAT else f"{pre}_unit_pslot").gather(1, us)
        perm = self._tac_merge_sort(uv.sum(dim=1), got, move, frm, dmg, pslot)
        # a CIVILIAN target's: no strike, the move onto it captures
        civ = got & (kinds.gather(1, tk.gather(1, ck.gather(1, c4c))) == 7)
        return {"slot": slot.gather(1, perm), "move": move.gather(1, perm), "attack": att.gather(1, perm),
                "civ": civ.gather(1, perm),
                "valid": got.gather(1, perm)}

    def _tac_merge_sort(self, n: torch.Tensor, got, move, frm, dmg, us) -> torch.Tensor:
        """[B, U] the order of each game's first `n` [B] results under
        EASTL's merge sort (halves of n / 2, a merge taking the second run's
        head only where it goes strictly first) by `assignedBefore`; the
        places past `n` keep theirs"""
        dev = self.device
        B, U = got.shape
        perm = torch.arange(U, device=dev).unsqueeze(0).expand(B, U).clone()

        def before(a: torch.Tensor, b: torch.Tensor, rows: torch.Tensor) -> torch.Tensor:
            ga, gb = got[rows, a], got[rows, b]
            ma, mb, fa, fb = move[rows, a], move[rows, b], frm[rows, a], frm[rows, b]
            da = self.pair_dist[fa.clamp(min=0), ma.clamp(min=0)].to(torch.long)
            db = self.pair_dist[fb.clamp(min=0), mb.clamp(min=0)].to(torch.long)
            xa, xb = dmg[rows, a], dmg[rows, b]
            ia, ib = us[rows, a], us[rows, b]
            out = torch.where(da != db, da < db, torch.where(xa != xb, xa < xb, ia < ib))
            out = torch.where(fa == mb, torch.ones_like(out), out)
            out = torch.where(ma == fb, torch.zeros_like(out), out)
            return torch.where(ga & gb, out, ga & ~gb)

        def sort(rows: torch.Tensor, idx: torch.Tensor) -> torch.Tensor:
            L = idx.shape[1]
            if L < 2:
                return idx
            h = L // 2
            left, right = sort(rows, idx[:, :h]), sort(rows, idx[:, h:])
            R_ = rows.numel()
            out = torch.empty_like(idx)
            i = torch.zeros(R_, dtype=torch.long, device=dev)
            k = torch.zeros(R_, dtype=torch.long, device=dev)
            ar = torch.arange(R_, device=dev)
            for p in range(L):
                li = left[ar, i.clamp(max=h - 1)]
                rk = right[ar, k.clamp(max=L - h - 1)]
                take_r = (k < L - h) & ((i >= h) | before(rk, li, rows))
                out[:, p] = torch.where(take_r, rk, li)
                k += take_r.long()
                i += (~take_r).long()
            return out

        for L in torch.unique(n).tolist():
            if L < 2:
                continue
            rows = (n == L).nonzero(as_tuple=True)[0]
            perm[rows, :L] = sort(rows, perm[rows, :L])
        return perm

    def _tac_carry_out(self, out: dict, done: torch.Tensor, rowof: torch.Tensor, res: dict, pre: str = "barb",
                       seat: int = BARB_SEAT) -> None:
        """`carryOut` (0x771f80) in the assignment's order: every unit to its
        spot (again where it stopped short and no unit at war or of its own
        holds it); a siege unit strikes its attack (a civilian's none); a ranged unit strikes it
        unless its melee is the stronger and its reach takes the plot this
        turn; then every unit moves onto its attack — each one's turn done."""
        dev = self.device
        B = self.B
        bidx = torch.arange(B, device=dev)
        slot, move, att, valid = out["slot"], out["move"], out["attack"], out["valid"]
        civ = out["civ"]
        U = slot.shape[1]
        sl = slot.clamp(min=0)
        ut_all = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)

        def alive(r: int) -> torch.Tensor:
            return valid[:, r] & getattr(self, f"{pre}_unit_alive")[bidx, sl[:, r]]

        for r in range(U):
            u_b = sl[:, r]
            go = alive(r) & (getattr(self, f"{pre}_unit_tile")[bidx, u_b] != move[:, r])
            if not bool(go.count_nonzero()):
                continue
            self._tac_move_to(go, u_b, move[:, r], pre, seat)
            mc = move[:, r].clamp(min=0)
            mil = self.military_at[bidx, mc]
            own = (mil >= 0) & (self.unit_seat[bidx, mil.clamp(min=0)] == seat)
            again = (go & getattr(self, f"{pre}_unit_alive")[bidx, u_b] & (getattr(self, f"{pre}_unit_tile")[bidx, u_b] != move[:, r])
                     & ~self._tac_foreign(seat)[bidx, mc] & ~own)
            self._tac_move_to(again, u_b, move[:, r], pre, seat)

        def can_act(r: int) -> torch.Tensor:
            u_b = sl[:, r]
            return alive(r) & ~done[bidx, u_b] & (getattr(self, f"{pre}_unit_mp")[bidx, u_b] > 0)

        def strike(m: torch.Tensor, r: int) -> None:
            u_b = sl[:, r]
            here = getattr(self, f"{pre}_unit_tile")[bidx, u_b].clamp(min=0)
            a = att[:, r]
            rng = self._type_ranged_range.take(ut_all[bidx, u_b]) + self._promo_val(
                ut_all[bidx, u_b], getattr(self, f"{pre}_unit_promos")[bidx, u_b], "RANGE")
            fire = (m & (a >= 0) & (self.pair_dist[here, a.clamp(min=0)].to(torch.long) <= rng)
                    & (getattr(self, f"{pre}_unit_attacks")[bidx, u_b] > 0))
            for u in torch.unique(u_b[fire]).tolist():
                self._hostile_ranged_strike(fire & (u_b == u), a.clamp(min=0), pre, u)
            getattr(self, f"{pre}_unit_mp")[bidx[m], u_b[m]] = 0
            done[bidx[m], u_b[m]] = True

        bomb = self._type_bombard.take(ut_all) > 0
        for r in range(U):
            u_b = sl[:, r]
            strike(can_act(r) & bomb[bidx, u_b] & ~civ[:, r], r)
        rs = self._type_ranged_strength.take(ut_all)
        cb = self._ai_combat(pre)
        rsafe = rowof.clamp(min=0)
        for r in range(U):
            u_b = sl[:, r]
            m = can_act(r) & (rs[bidx, u_b] > 0) & ~civ[:, r]
            if not bool(m.count_nonzero()):
                continue
            a = att[:, r]
            row = rsafe[bidx, u_b]
            reach1 = (a >= 0) & (res["turns"][row, a.clamp(min=0)] == 1)
            melee = (cb[bidx, u_b] > rs[bidx, u_b]) & reach1
            strike(m & ~melee, r)
        for r in range(U):
            u_b = sl[:, r]
            on = alive(r)
            if not bool(on.count_nonzero()):
                continue
            go = on & (att[:, r] >= 0) & ~done[bidx, u_b] & (getattr(self, f"{pre}_unit_mp")[bidx, u_b] > 0)
            self._tac_move_to(go, u_b, att[:, r], pre, seat)
            fin = on & getattr(self, f"{pre}_unit_alive")[bidx, u_b]
            getattr(self, f"{pre}_unit_mp")[bidx[fin], u_b[fin]] = 0
            done[bidx[on], u_b[on]] = True

    # ------------------------------------------------------- the raid's tree

    def _op_member_key(self, mem: torch.Tensor, goal: torch.Tensor, pre: str, rank: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """an operation's members `mem` [B, P] of pool `pre`: their distance to
        `goal` [B] and their order key (`nearestFirst`: the distance, then the
        team's member order `rank` [B, P])"""
        tile = getattr(self, f"{pre}_unit_tile")
        d = self.pair_dist[tile.clamp(min=0), goal.clamp(min=0).unsqueeze(1)].to(torch.long)
        key = d * (1 << 20) + rank.clamp(min=0)
        return d, key

    def _op_reach_at(self, rows: torch.Tensor, us: torch.Tensor, goal: torch.Tensor, turns: int, moves: bool,
                     rng: torch.Tensor, rowof: torch.Tensor, res: dict, pre: str = "barb",
                     seat: int = BARB_SEAT) -> torch.Tensor:
        """`reachAt` for the unit at local slot `us` [N] of pool `pre` (its
        player `seat`) in the games `rows`: the first plot of its planning
        (closing order) within `turns` — the goal itself at range 0, else a
        plot exactly `rng` from it with none of its own military there but its
        own plot; `moves` asks Movement left. -1 none."""
        n = rowof[rows, us]
        ok_row = n >= 0
        nn = n.clamp(min=0)
        rt, rk, mv = res["turns"][nn], res["rank"][nn], res["moves"][nn]
        dq = self.pair_dist[goal.clamp(min=0)].to(torch.long)                     # [N, T]
        here = getattr(self, f"{pre}_unit_tile")[rows, us]
        own = self._tac_own_mil(seat)[rows]
        at = torch.where(rng.unsqueeze(1) == 0, self._arange_bt[rows] == goal.unsqueeze(1),
                         (dq == rng.unsqueeze(1)) & (~own | (self._arange_bt[rows] == here.unsqueeze(1))))
        ok = at & (rt >= 0) & (rt <= turns) & ok_row.unsqueeze(1)
        if moves:
            ok &= mv > 0
        big = 1 << 40
        key = torch.where(ok, rk, torch.full_like(rk, big))
        best = key.min(dim=1)
        return torch.where(best.values < big, best.indices, torch.full_like(best.indices, -1))

    def _barb_reach_at(self, rows: torch.Tensor, us: torch.Tensor, goal: torch.Tensor, turns: int, moves: bool,
                       rng: torch.Tensor, rowof: torch.Tensor, res: dict) -> torch.Tensor:
        """`reachAt` for a barbarian (`_op_reach_at`)"""
        return self._op_reach_at(rows, us, goal, turns, moves, rng, rowof, res)

    def _op_move_update(self, on: torch.Tensor, mem: torch.Tensor, rank: torch.Tensor, store: torch.Tensor,
                        store_goal: torch.Tensor, goal: torch.Tensor, target: bool, rng: int, spread: int,
                        rowof: torch.Tensor, res: dict, pre: str = "barb",
                        seat: int = BARB_SEAT) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """`passMoveUpdate` for an operation's team in the games `on`: its
        living members `mem` [B, P] of pool `pre`, `rank` [B, P] its member order
        (a member killed is none of them), the node's store `store` [B, P] and the goal it holds it for
        `store_goal` [B] (written in place where the store is kept): its status
        (1 SUCCESS, 2 RUNNING), whether the team arrived, and the games whose
        store the update kept (`rest`)."""
        B = self.B
        dev = self.device
        bidx = torch.arange(B, device=dev)
        big = 1 << 40
        d, key = self._op_member_key(mem, goal, pre, rank)
        kept = store_goal == goal
        L = store & kept.unsqueeze(1) & mem
        others = mem & ~L
        has_oth = others.any(dim=1)
        okey = torch.where(others, key, torch.full_like(key, big))
        hk, hs = okey.min(dim=1)
        has_head = hk < big
        head_d = d[bidx, hs]
        arrived = on & has_oth & has_head & (head_d <= rng)
        reach = torch.zeros_like(arrived)
        need = on & has_oth & has_head & ~arrived
        if bool(need.count_nonzero()):
            rows = need.nonzero(as_tuple=True)[0]
            p = self._op_reach_at(rows, hs[rows], goal[rows], 1, True, torch.full_like(rows, rng), rowof, res, pre, seat)
            reach[rows] = p >= 0
        miss = on & has_oth & ~arrived
        lin = L & (d <= rng) & miss.unsqueeze(1)
        got = lin.any(dim=1)
        arrived |= got
        reach |= got
        others |= lin
        L &= ~lin
        # no member but those stored: the nearest of them leaves the store
        lone = on & ~has_oth
        lkey = torch.where(L, key, torch.full_like(key, big))
        lk, ls = lkey.min(dim=1)
        take = lone & (lk < big)
        if bool(take.count_nonzero()):
            rows = take.nonzero(as_tuple=True)[0]
            others[rows, ls[rows]] = True
            L[rows, ls[rows]] = False
            arrived |= take & (d[bidx, ls] <= rng)
        if target:
            win = on & (arrived | reach)
        else:
            win = torch.zeros_like(arrived)
        rest = on & ~win
        tile = getattr(self, f"{pre}_unit_tile")
        P = mem.shape[1]
        if spread != 0:
            n_oth = others.sum(dim=1)
            okey = torch.where(others, key, torch.full_like(key, big))
            order = okey.argsort(dim=1, stable=True)
            nv = others.sum(dim=1)
            M = int(nv.max()) if B else 0
            tiles = tile.gather(1, order[:, :M]).clamp(min=0)          # [B, M]
            dd = d.gather(1, order[:, :M])
            valid = torch.arange(M, device=dev).unsqueeze(0) < nv.unsqueeze(1)
            end = (valid & (dd <= spread)).sum(dim=1)
            for j in range(M):
                inpre = torch.arange(M, device=dev).unsqueeze(0) < end.unsqueeze(1)
                near = (self.pair_dist[tiles, tiles[:, j:j + 1].expand(-1, M)].to(torch.long) <= spread) & inpre
                grow = valid[:, j] & (end == j) & near.any(dim=1)
                end = end + grow.long()
            strays = n_oth - end
            arrived = arrived & ~(rest & (2 * strays >= n_oth))
        if spread > 0:
            ot = torch.where(others, tile, torch.full_like(tile, -1))
            near = torch.zeros_like(L)
            for j in range(P):
                oj = ot[:, j]
                if not bool((oj >= 0).any()):
                    continue
                near |= (oj >= 0).unsqueeze(1) & (self.pair_dist[tile.clamp(min=0),
                                                                 oj.clamp(min=0).unsqueeze(1)].to(torch.long) <= spread)
            gone = L & near & rest.unsqueeze(1)
            arrived |= (gone & (d <= rng)).any(dim=1)
            L &= ~gone
        st = rest.nonzero(as_tuple=True)[0]
        if st.numel():
            store[st] = L[st]
            store_goal[st] = goal[st]
        status = torch.where(win | arrived, 1, 2)
        return status, win | arrived, rest

    def _op_move_exec(self, on: torch.Tensor, mem: torch.Tensor, rank: torch.Tensor, goal: torch.Tensor, rng: int,
                      arrived: torch.Tensor, ready: torch.Tensor, done: torch.Tensor, rowof: torch.Tensor, res: dict, pre: str = "barb",
                      seat: int = BARB_SEAT, zero: torch.Tensor | None = None,
                      leader: bool = False) -> list:
        """`passMoveExec` for an operation's team in the games `on`: nothing
        where the operation is `ready` [B], the team arrived and the node names
        no Leader Tag (`leader`); else each living member `mem` [B, P] that
        can act, nearest the goal first: its radius (the smaller of the
        node's range and its attack range, 1 for a melee unit; 0 for a ship or
        a unit of `zero` [B, P]; at least 1 where the goal is barred, and with a Leader
        Tag named), its plot (its planning's at the radius in the goal's
        region, else the ring walk's), its turn done, its move order. The
        moves: per mover [B] its slot (-1 none), its plot before, its plot
        after."""
        skip = arrived & ready if not leader else torch.zeros_like(arrived)
        go = on & ~skip
        moves: list = []
        if not bool(go.count_nonzero()):
            return moves
        B = self.B
        dev = self.device
        bidx = torch.arange(B, device=dev)
        big = 1 << 40
        d, key = self._op_member_key(mem, goal, pre, rank)
        alive_p = getattr(self, f"{pre}_unit_alive")
        mp_p = getattr(self, f"{pre}_unit_mp")
        tile_p = getattr(self, f"{pre}_unit_tile")
        type_p = getattr(self, f"{pre}_unit_type")
        can = mem & ~done & (mp_p > 0) & go.unsqueeze(1)
        order = torch.where(can, key, torch.full_like(key, big)).argsort(dim=1, stable=True)
        nm = can.sum(dim=1)
        region = self.tile_region.gather(1, goal.clamp(min=0).unsqueeze(1)).squeeze(1)
        hostile = self._tac_hostile(seat)
        foreign = self._tac_foreign(seat)
        # the plots it would attack into (`attackPlot`): a unit at war, a
        # hostile city centre, an Encampment that bars it — no ring plot
        # (0x815d50 -> 0x586360)
        atk = hostile | (self._centre_plane() & (self.tile_seat != seat) & self._seats_hostile(seat, self.tile_seat))
        if self._encamp_didx >= 0:
            atk = atk | self._encamp_block_plane(seat)
        ring = self._barb_ring[goal.clamp(min=0)]                                   # [B, 37]
        for j in range(int(nm.max()) if B else 0):
            us = order[:, j]
            act = (j < nm) & alive_p[bidx, us] & ~done[bidx, us] & (mp_p[bidx, us] > 0)
            if not bool(act.count_nonzero()):
                continue
            rows = act.nonzero(as_tuple=True)[0]
            ur = us[rows]
            gr = goal[rows].clamp(min=0)
            ut = type_p[rows, ur].clamp(min=0, max=self.NU - 1)
            naval = self.unit_naval.take(ut)
            z = zero[rows, ur] if zero is not None else torch.zeros_like(naval)
            r = torch.where(naval | z, torch.zeros_like(ut), torch.clamp(self._tac_range(rows, ur, pre).clamp(min=1), max=rng))
            here = tile_p[rows, ur]
            path = self._tac_search(rows, ur, seat, 1 << 30, True, pre=pre)["closed"] >= 0    # [N, T]
            own = self._tac_own_mil(seat)[rows]
            barred = ((~path.gather(1, gr.unsqueeze(1)).squeeze(1)) | hostile[rows, gr] | own[torch.arange(rows.numel(), device=dev), gr]
                      | foreign[rows, gr])
            r = torch.where((here != gr) & barred, r.clamp(min=1), r)
            if leader:
                r = torch.where(~((here != gr) & barred) & (rng > 0) & ~z, r.clamp(min=1), r)
            dest = gr.clone()
            strike = torch.zeros_like(act[rows])
            p = self._op_reach_at(rows, ur, gr, _PLAN_TURNS, False, r, rowof, res, pre, seat)
            rg = region[rows]
            pin = (p >= 0) & (rg >= 0) & (self.tile_region[rows, p.clamp(min=0)] == rg)
            dest = torch.where(pin, p, dest)
            walk = ~pin & (r > 0)
            if bool(walk.count_nonzero()):
                cand = ring[rows]                                                     # [N, 37]
                n_c = 1 + 3 * r * r + 3 * r
                anyown = (self.military_at[rows] >= 0) | (self.civilian_at[rows] >= 0) | (self.support_at[rows] >= 0)
                seat_of = lambda pl: torch.where(pl >= 0, self.unit_seat.gather(1, pl.clamp(min=0)), torch.full_like(pl, -1))  # noqa: E731
                mine = ((seat_of(self.military_at[rows]) == seat) | (seat_of(self.civilian_at[rows]) == seat)
                        | (seat_of(self.support_at[rows]) == seat)) & anyown
                best = torch.full_like(gr, -1)
                best_d = torch.full_like(gr, -1)
                best_in = torch.zeros_like(walk)
                N = rows.numel()
                ar = torch.arange(N, device=dev)
                for c in range(cand.shape[1]):
                    q = cand[:, c]
                    ok = walk & (c < n_c) & (q >= 0)
                    qc = q.clamp(min=0)
                    inr = self.tile_region[rows, qc] == rg
                    dq = self.pair_dist[here.clamp(min=0), qc].to(torch.long)
                    first = best_d < 0
                    beat = first | (((inr == best_in) & (dq < best_d)) | ((inr != best_in) & inr))
                    away = qc != here
                    free = (~away | (~mine[ar, qc] & path[ar, qc])) & ~atk[rows, qc]
                    take = ok & beat & free
                    best = torch.where(take, qc, best)
                    best_d = torch.where(take, dq, best_d)
                    best_in = torch.where(take, inr, best_in)
                dest = torch.where(walk & (best >= 0), best, dest)
                strike = walk & (best < 0)
            done[rows, ur] = True
            full = torch.zeros(B, dtype=torch.long, device=dev)
            full[rows] = dest
            hit = torch.zeros(B, dtype=torch.bool, device=dev)
            hit[rows] = strike
            ms = torch.zeros(B, dtype=torch.bool, device=dev)
            ms[rows] = True
            before = torch.where(ms, tile_p[bidx, us], torch.full_like(us, -1))
            self._tac_move_to(ms & ~hit, us, full, pre, seat, strike=False)
            self._tac_move_to(ms & hit, us, full, pre, seat, strike=True)
            moves.append((torch.where(ms, us, torch.full_like(us, -1)), before, torch.where(ms, full, torch.full_like(us, -1))))
        return moves

    def _tac_coastal_raid(self, live, done: torch.Tensor, order: torch.Tensor, npass: torch.Tensor,
                          rowof: torch.Tensor, res: dict, tg: dict) -> None:
        """COASTAL RAID (`coastalRaids`): each IMPROVEMENT or PASSIVE_DISTRICT
        target on coastal land in plot order, each raider left in slot order
        whose planning of two turns holds a plot beside it queued with that
        plot; the queue carried out: each queued raider that can still act
        goes to its plot (striking what holds it) and raids the target, its
        turn done."""
        B = self.B
        dev = self.device
        bidx = torch.arange(B, device=dev)
        ut = self.barb_unit_type.clamp(min=0, max=self.NU - 1)
        raider = live() & self._type_raider[ut] & (rowof >= 0)
        if not bool(raider.count_nonzero()):
            return
        tgt = ((tg["ok"] == 9) | (tg["dk"] == 2)) & self.coastal_land
        queue = []
        for t in tgt.any(dim=0).nonzero(as_tuple=True)[0].tolist():
            on = tgt[:, t]
            if not bool(on.count_nonzero()):
                continue
            for j in range(int(npass.max())):
                us = order[:, j]
                m = on & (j < npass) & raider[bidx, us]
                if not bool(m.count_nonzero()):
                    continue
                rows = m.nonzero(as_tuple=True)[0]
                spot = self._barb_reach_at(rows, us[rows], torch.full_like(rows, t), _PLAN_TURNS, False,
                                           torch.ones_like(rows), rowof, res)
                hit = torch.full((B,), -1, dtype=torch.long, device=dev)
                hit[rows] = spot
                if bool((hit >= 0).count_nonzero()):
                    queue.append((us, hit, t))
        for us, spot, t in queue:
            act = (spot >= 0) & self.barb_unit_alive[bidx, us] & ~done[bidx, us] & (self.barb_unit_mp[bidx, us] > 0)
            if not bool(act.count_nonzero()):
                continue
            away = act & (self.barb_unit_tile[bidx, us] != spot)
            self._tac_move_to(away, us, spot)
            there = act & self.barb_unit_alive[bidx, us]
            self._barb_coastal_raid(there, us, torch.full((B,), t, dtype=torch.long, device=dev))
            done[bidx[act], us[act]] = True

    def _tac_pass(self, acting: torch.Tensor) -> None:
        """`_barbarian_tactics`' moves"""
        dev = self.device
        B, T = self.B, self.T
        P = simbase.BARB_POOL_MAX
        BIG = 1 << 40
        bidx = torch.arange(B, device=dev)
        done = torch.zeros(B, P, dtype=torch.bool, device=dev)
        ai, utribe = self._tac_ai()

        def live() -> torch.Tensor:
            return acting & ~done & self.barb_unit_alive & (self.barb_unit_seat == BARB_SEAT)

        # the knowledge base ages and looks, then the tactical target list
        # (0x785f30), and its set of the regions the barbarians revealed
        seen0 = self._barb_seen("barbarians")
        self._knowledge_look(self.BK, BARB_SEAT, seen0, torch.ones(B, dtype=torch.bool, device=dev), True)
        self._barb_kb_camps(seen0)
        tg = self._tac_targets(BARB_SEAT, self.BK)
        treg = self._tac_seen_regions(BARB_SEAT)
        # the planning: the reach of two turns, no zones of control, and the
        # targets' spots and predicted blows
        want = live() & (ai >= _AI_EXPLORE)
        rows, slots = want.nonzero(as_tuple=True)
        rowof = torch.full((B, P), -1, dtype=torch.long, device=dev)
        if rows.numel():
            rowof[rows, slots] = torch.arange(rows.shape[0], device=dev)
            res = self._tac_plan(rows, slots, tg)
            rank, rturn = res["rank"], res["turns"]
        else:
            rank = torch.full((1, T), -1, dtype=torch.long, device=dev)
            rturn = rank.clone()
            res = {"rank": rank, "turns": rturn, "moves": rank.clone()}
        rsafe = rowof.clamp(min=0)
        # the barbarians' danger map as the pass opens
        need = self._tac_danger_need(live(), "barb", rowof, res)
        # an explorer reads it over the plots two turns of its steps take in
        # (its rounds of Explore Land)
        xb, xs = (live() & (ai == _AI_EXPLORE)).nonzero(as_tuple=True)
        if xb.numel():
            reach2 = 2 * (torch.div(self._tac_full_now("barb")[xb, xs], self._tac_min_step_mp(), rounding_mode="floor") + 1)
            near = (self.pair_dist[self.barb_unit_tile[xb, xs].clamp(min=0)].to(torch.long) <= reach2.unsqueeze(1)).float()
            acc = torch.zeros(B, T, dtype=torch.float32, device=dev)
            acc.index_add_(0, xb, near)
            need = need | (acc > 0)
        danger = self._danger_plane(BARB_SEAT, need)

        def reach_at(tiles: torch.Tensor) -> torch.Tensor:
            """[B, P] the turn each unit's reach reaches the game's plot, -1 none"""
            if not rows.numel():
                return torch.full((B, P), -1, dtype=torch.long, device=dev)
            v = rturn[rsafe, tiles.clamp(min=0, max=T - 1).unsqueeze(1).expand(-1, P)]
            return torch.where(rowof >= 0, v, torch.full_like(v, -1))

        slotno = torch.where(acting, self.barb_unit_slotno, torch.full_like(self.barb_unit_slotno, BIG))
        order = torch.argsort(slotno, dim=1, stable=True)
        npass = acting.sum(dim=1)

        def first_by_slot(cand: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
            k = torch.where(cand, slotno, torch.full_like(slotno, BIG))
            return cand.any(dim=1), k.argmin(dim=1)

        # the trees first (the tree manager's tick, list C); then an
        # operation's units are the operation's
        self._barb_trees(done, ai, order, rowof, res, tg, danger)
        done |= (self.barb_unit_op | self._bcap_members()) & acting
        # the tactical list (`tacticalUnit`); the homeland takes the rest
        tac = self._tac_tactical(ai, utribe)
        live_all = live

        def live() -> torch.Tensor:
            return live_all() & tac

        # the pass's own units (its job): the tactical list's, no operation's
        peers = self._tac_peers(acting & self.barb_unit_alive & (self.barb_unit_seat == BARB_SEAT) & tac
                                & ~(self.barb_unit_op | self._bcap_members()))
        if rows.numel():
            self._tac_rampage(live, done, utribe, rowof, res, tg, order, npass)
            self._tac_attack_units(live, done, ai, order, rowof, res, tg, 3, peers)

        # DEFEND CAMPS: each camp in plot order, its first DEFENDER by slot
        # whose reach takes it within three turns
        camps = torch.where(self.camp_tile >= 0, self.camp_tile, torch.full_like(self.camp_tile, BIG))
        camps = camps.sort(dim=1).values
        for c in range(camps.shape[1]):
            camp = camps[:, c]
            on = camp < BIG
            if not bool(on.count_nonzero()):
                break
            rt = reach_at(camp)
            cand = live() & (ai == _AI_DEFENDER) & (rt >= 1) & (rt <= _DEFEND_CAMP_TURNS) & on.unsqueeze(1)
            has, u_b = first_by_slot(cand)
            if not bool(has.count_nonzero()):
                continue
            away = has & (self.barb_unit_tile[bidx, u_b] != camp)
            self._tac_move_to(away, u_b, camp)
            done[bidx[has], u_b[has]] = True

        if rows.numel():
            self._tac_attack_civilians(live, done, ai, reach_at, tg, order, npass)
            self._tac_plunder(live, done, ai, reach_at, tg, order, npass)
            self._tac_coastal_raid(live, done, order, npass, rowof, res, tg)

        # PILLAGE District, then Improvement: the plots the barbarians see
        own = self.tile_seat
        terr = (own >= 0) & ((own < BARB_SEAT) | (own == FREE_SEAT))
        for districts in (True, False):
            # the list's PASSIVE_DISTRICT, then IMPROVEMENT, targets still pillageable
            if districts:
                ok = ((tg["dk"] == 2) & (self.district >= 0) & (self.district != self._encamp_didx)
                      & self.district_complete & ~self.district_pillaged)
            else:
                ok = (tg["ok"] == 9) & (self.improvement >= 0) & ~self.pillaged
            tgt = terr & ok
            el = live() & (ai >= _AI_EXPLORE)
            er = el[rows, slots] if rows.numel() else torch.zeros(0, dtype=torch.bool, device=dev)
            if not bool(er.count_nonzero()):
                continue
            r1 = torch.zeros(B, T, dtype=torch.float32, device=dev)
            r1.index_add_(0, rows[er], (rturn[er] == 1).float())
            tgt &= r1 > 0
            ntg = tgt.sum(dim=1)
            J = int(ntg.max())
            tiles = torch.where(tgt, self._arange_bt, torch.full_like(self._arange_bt, T)).sort(dim=1).values
            for j in range(J):
                t = tiles[:, j]
                active = j < ntg
                last = torch.full((B,), -1, dtype=torch.long, device=dev)
                while bool(active.count_nonzero()):
                    rt = reach_at(t)
                    here = self.barb_unit_tile.clamp(min=0)
                    at_t = self.barb_unit_tile == t.unsqueeze(1)
                    if districts:
                        stand = (self.district.gather(1, here) >= 0) | self._centre_plane().gather(1, here)
                    else:
                        stand = self.improvement.gather(1, here) >= 0
                    cand = (live() & (ai >= _AI_EXPLORE) & (rt == 1) & (slotno > last.unsqueeze(1))
                            & (at_t | ~stand) & active.unsqueeze(1))
                    has, u_b = first_by_slot(cand)
                    if not bool(has.count_nonzero()):
                        break
                    last = torch.where(has, slotno[bidx, u_b], last)
                    away = has & ~at_t[bidx, u_b]
                    self._tac_move_to(away, u_b, t)
                    there = has & (self.barb_unit_tile[bidx, u_b] == t)
                    self._barb_pillage_here(there, u_b)
                    done[bidx[has], u_b[has]] = True
                    active = has & ~there

        if rows.numel():
            self._tac_attack_units(live, done, ai, order, rowof, res, tg, 2, peers)
        self._tac_move_to_safety(live, done, order, npass, rowof, res, danger, "barb", BARB_SEAT, False)
        if rows.numel():
            self._tac_attack_units(live, done, ai, order, rowof, res, tg, 1, peers)
            self._tac_chase(live, done, rowof, res, tg, order, npass)

        # WANDER NEAR CAMP: by slot, each unit above EXPLORE whose camp stands
        for j in range(int(npass.max()) if B else 0):
            u_b = order[:, j]
            ok = (j < npass) & live()[bidx, u_b] & (ai[bidx, u_b] > _AI_EXPLORE)
            tr = utribe[bidx, u_b]
            ok &= (tr >= 0) & self.tribe_alive[bidx, tr.clamp(min=0)]
            if not bool(ok.count_nonzero()):
                continue
            camp = self.tribe_plot[bidx, tr.clamp(min=0)].clamp(min=0)
            row = rowof[bidx, u_b]
            rtu = torch.where((row >= 0).unsqueeze(1), rturn[row.clamp(min=0)], torch.full((B, T), -1, dtype=torch.long, device=dev))
            rku = rank[row.clamp(min=0)]
            stacked = self._tac_own_mil(BARB_SEAT)
            cseat = self.tile_seat[bidx, camp]
            ccity = self.tile_city[bidx, camp]
            bound = (cseat != NO_SEAT) & (ccity != -1)
            same = (self.tile_seat == cseat.unsqueeze(1)) & (self.tile_city == ccity.unsqueeze(1))
            cand = ((rtu == 1) & ~self._tac_foreign(BARB_SEAT) & ~stacked
                    & (self.pair_dist[camp].to(torch.long) <= _WANDER_CAMP_RANGE)
                    & (~bound.unsqueeze(1) | same))
            count = cand.sum(dim=1)
            pick = self._rand_range(ok & (count > 0), count)
            by_rank = torch.where(cand, rku, torch.full_like(rku, BIG)).argsort(dim=1, stable=True)
            dest = torch.where(count > 0, by_rank.gather(1, pick.clamp(max=T - 1).unsqueeze(1)).squeeze(1), camp)
            self._tac_move_to(ok, u_b, dest)
            done[bidx[ok], u_b[ok]] = True

        # THE HOMELAND ("Default Barbarian HL") takes every unit left:
        # Plunder Trader, Move To Safety, Explore Land; the rest end their turn
        self._tac_homeland_plunder(live_all, done, order, npass, tg)
        self._tac_move_to_safety(live_all, done, order, npass, rowof, res, danger, "barb", BARB_SEAT, True)
        self._tac_explore(live_all, done, order, npass, ai, danger, treg, "barb", BARB_SEAT)

    # ------------------------------------------------------- Explore Land

    def _tac_explore_ok(self, tile: torch.Tensor, ut: torch.Tensor, seat: int, revealed: torch.Tensor) -> torch.Tensor:
        """[B, T] bool — `exploreOk` for each game's explorer standing on
        `tile` [B], of type `ut` [B]: a plot not its own, revealed, not
        another player's ground but at war with it, no unit on it, of its
        area (a hull on water too; an embarking non-barbarian anywhere), no
        city centre but its player's."""
        B, T, dev = self.B, self.T, self.device
        bidx = torch.arange(B, device=dev)
        own = self.tile_seat
        ok_owner = (own == NO_SEAT) | (own == seat) | self._seats_hostile(seat, own)
        occ = torch.zeros(B, T, dtype=torch.bool, device=dev)
        for pl in (self.military_at, self.civilian_at, self.support_at, self.embarked_at):
            occ |= pl >= 0
        area = self.tile_area
        naval = self.unit_naval.take(ut)
        embark = self._tac_embarks(bidx, ut, seat) if seat != BARB_SEAT else torch.zeros_like(naval)
        same = (area == area[bidx, tile.clamp(min=0)].unsqueeze(1)) | embark.unsqueeze(1) | (naval.unsqueeze(1) & self.water)
        not_here = torch.arange(T, device=dev).unsqueeze(0) != tile.unsqueeze(1)
        foreign_ctr = self._centre_plane() & (own != seat)
        return not_here & revealed & ok_owner & ~occ & same & ~foreign_ctr

    def _tac_seen_regions(self, seat: int) -> torch.Tensor:
        """[B, T] bool — the plots whose region holds a plot `seat` revealed
        (`Pass.regions`): the tactical target list's set (0x783980), the
        player's tertiary region list (0x6fad50); a plot off any region none"""
        B, T, dev = self.B, self.T, self.device
        known = self._tac_known(seat)
        rev = known if known is not None else torch.ones(B, T, dtype=torch.bool, device=dev)
        reg = self.tile_region
        R = int(reg.max()) + 1 if reg.numel() else 0
        if R <= 0:
            return torch.zeros(B, T, dtype=torch.bool, device=dev)
        hit = torch.zeros(B, R + 1, dtype=torch.bool, device=dev)
        hit.scatter_(1, torch.where(rev & (reg >= 0), reg, torch.full_like(reg, R)), True)
        hit[:, R] = False
        return (reg >= 0) & hit.gather(1, reg.clamp(min=0))

    def _tac_explore(self, live, done: torch.Tensor, order: torch.Tensor, npass: torch.Tensor, ai: torch.Tensor,
                     danger: torch.Tensor, treg: torch.Tensor, pre: str, seat: int) -> torch.Tensor:
        """EXPLORE LAND (`exploreLand`): up to three rounds over the units of
        `live()` in slot order, each round's moves carried out together as it
        ends, another round only where one moved: each unit of AI type
        EXPLORE with Movement left and no more than half its health lost (in
        a later round one standing where its last move was for) takes its
        target (`exploreTarget`): of its search of this turn's plots with no
        danger, none chosen, one it may go to (`_tac_explore_ok`), the first
        whose sight holds the most plots its player never revealed (above 0);
        else on the first round the nearest unrevealed plot of its region
        where the region holds one (a path to it existing; off any region the
        nearest of its area), else of the regions `treg` [B, T] marks (the
        tertiary list; the primary and the secondary are a player's cities',
        the barbarians hold none); else the first whose sight holds the most
        plots the player does not see now. Its own plot and its target join the
        chosen; the move it first took names its turn. Returns [B, P] each
        unit's first target (-1 none)."""
        B, T, dev = self.B, self.T, self.device
        bidx = torch.arange(B, device=dev)
        P = getattr(self, f"{pre}_unit_alive").shape[1]
        tile_p = getattr(self, f"{pre}_unit_tile")
        hp_max = int(self.rules.combat["unitHp"])
        chosen = torch.zeros(B, T, dtype=torch.bool, device=dev)
        went = torch.full((B, P), -1, dtype=torch.long, device=dev)
        moved_any = torch.zeros(B, P, dtype=torch.bool, device=dev)
        first = torch.full((B, P), -1, dtype=torch.long, device=dev)
        for rnd in range(1, _EXPLORE_ROUNDS + 1):
            hp = getattr(self, f"{pre}_unit_hp")
            elig = (live() & (ai == _AI_EXPLORE) & (getattr(self, f"{pre}_unit_mp") > 0)
                    & (hp_max - hp <= hp_max >> 1) & ((went < 0) | (tile_p == went)))
            rows, slots = elig.nonzero(as_tuple=True)
            if not rows.numel():
                break
            seen_now = self._barb_seen("barbarians" if seat == BARB_SEAT else seat)
            # what its player revealed as the round opens (the moves before lift it)
            known = self._tac_known(seat)
            revealed = known if known is not None else torch.ones(B, T, dtype=torch.bool, device=dev)
            res, v1, v2, rt = self._tac_explore_counts(rows, slots, pre, seat, danger, revealed, seen_now)
            rowof = torch.full((B, P), -1, dtype=torch.long, device=dev)
            rowof[rows, slots] = torch.arange(rows.numel(), device=dev)
            dest = torch.full((B, P), -1, dtype=torch.long, device=dev)
            kind = torch.zeros(B, P, dtype=torch.long, device=dev)
            for j in range(int(npass.max()) if B else 0):
                u_b = order[:, j]
                go = (j < npass) & elig[bidx, u_b]
                if not bool(go.count_nonzero()):
                    continue
                r = rowof[bidx, u_b].clamp(min=0)
                pick, knd = self._tac_explore_pick(go, u_b, r, res, v1, v2, rt, chosen, revealed, treg, pre, seat, rnd == 1)
                hit = pick >= 0
                chosen[bidx[hit], pick[hit]] = True
                dest[bidx[hit], u_b[hit]] = pick[hit]
                kind[bidx[hit], u_b[hit]] = knd[hit]
            act = dest >= 0
            if not bool(act.count_nonzero()):
                break
            for j in range(int(npass.max()) if B else 0):
                u_b = order[:, j]
                m = (j < npass) & act[bidx, u_b]
                if bool(m.count_nonzero()):
                    self._tac_move_to(m, u_b, dest[bidx, u_b], pre, seat, False)
            went = torch.where(act, dest, went)
            first = torch.where(act & ~moved_any, dest, first)
            moved_any |= act
        done |= moved_any
        return first

    def _tac_explore_counts(self, rows: torch.Tensor, slots: torch.Tensor, pre: str, seat: int, danger: torch.Tensor,
                            revealed: torch.Tensor, seen_now: torch.Tensor):
        """`exploreTarget`'s search for the units at local `slots` of games
        `rows` ([n]): the search of this turn on their Movement left (`res`)
        and per plot closed this turn with no danger and no other player's
        unit its two sight counts — the plots its player never revealed
        (`v1`), those it does not see now (`v2`) — and whether its look
        holds a revealed route (`rt`, plot +0x47); [n, T] each, NEG off the
        candidates"""
        T, dev = self.T, self.device
        NEG = -(1 << 40)
        res = self._tac_search(rows, slots, seat, 1, False, pre=pre)
        stand = ~self._tac_foreign(seat)[rows]
        reach = (res["turns"] == 1) & stand & (danger[rows] <= 0)
        n_i, t_i = reach.nonzero(as_tuple=True)
        v1 = torch.full((rows.numel(), T), NEG, dtype=torch.long, device=dev)
        v2 = torch.full((rows.numel(), T), NEG, dtype=torch.long, device=dev)
        rt = torch.zeros(rows.numel(), T, dtype=torch.bool, device=dev)
        if n_i.numel():
            ut_n = getattr(self, f"{pre}_unit_type")[rows[n_i], slots[n_i]]
            sight = self._unit_sight(ut_n, getattr(self, f"{pre}_unit_promos")[rows[n_i], slots[n_i]])
            disk = self._los_disk(rows[n_i], t_i, sight, torch.zeros_like(n_i, dtype=torch.bool))
            v1[n_i, t_i] = (disk & ~revealed[rows[n_i]]).sum(dim=1)
            v2[n_i, t_i] = (disk & ~seen_now[rows[n_i]]).sum(dim=1)
            route = self.road | self.railroad
            rt[n_i, t_i] = (disk & revealed[rows[n_i]] & route[rows[n_i]]).any(dim=1)
        return res, v1, v2, rt

    def _tac_explore_pick(self, go: torch.Tensor, u_b: torch.Tensor, r: torch.Tensor, res: dict, v1: torch.Tensor,
                          v2: torch.Tensor, rt: torch.Tensor, chosen: torch.Tensor, revealed: torch.Tensor,
                          treg: torch.Tensor, pre: str, seat: int, first: bool):
        """`exploreTarget` for the unit at local slot `u_b` [B] where `go`,
        its row `r` of `_tac_explore_counts`: of its candidates not chosen
        that it may go to (`_tac_explore_ok`) the first in closing order of
        the most plots never revealed (above 0; the first with a revealed
        route in its look leads once); else, `first`, the region fallbacks
        (`_tac_explore_region`), else the first of the most plots not seen
        now. Its own plot joins `chosen`. [B] the plot (-1 none) and its kind
        (1 explore, 2 region, 3 area, 4 fallback, 5 tertiary regions)"""
        B, dev = self.B, self.device
        bidx = torch.arange(B, device=dev)
        NEG = -(1 << 40)
        tile_p = getattr(self, f"{pre}_unit_tile")
        ut = getattr(self, f"{pre}_unit_type")[bidx, u_b].clamp(min=0, max=self.NU - 1)
        here = tile_p[bidx, u_b].clamp(min=0)
        cand = go.unsqueeze(1) & (v1[r] > NEG) & ~chosen & self._tac_explore_ok(here, ut, seat, revealed)
        key = res["rank"][r]

        # the first in closing order of the largest count
        def first_max(v: torch.Tensor, floor: int) -> torch.Tensor:
            vv = torch.where(cand & (v > floor), v, torch.full_like(v, NEG))
            m = vv.max(dim=1, keepdim=True).values
            k = torch.where((vv == m) & (vv > NEG), key, torch.full_like(key, 1 << 40))
            kmin, p = k.min(dim=1)
            return torch.where(kmin < (1 << 40), p, torch.full_like(p, -1))
        best1 = first_max(v1[r], 0)
        # the first in closing order with a route in its look and a count
        # above 0 leads once, whatever came before; a later one replaces it
        # only with a larger count
        big = 1 << 40
        lead_k = torch.where(cand & rt[r] & (v1[r] > 0), key, torch.full_like(key, big))
        lk, lp = lead_k.min(dim=1)
        has_lead = lk < big
        if bool(has_lead.any()):
            after = cand & (key > lk.unsqueeze(1))
            va = torch.where(after, v1[r], torch.full_like(v1[r], NEG))
            ma = va.max(dim=1).values
            ka = torch.where(after & (va == ma.unsqueeze(1)), key, torch.full_like(key, big))
            kmin, ap = ka.min(dim=1)
            lv = v1[r].gather(1, lp.unsqueeze(1)).squeeze(1)
            led = torch.where((kmin < big) & (ma > lv), ap, lp)
            best1 = torch.where(has_lead, led, best1)
        best2 = first_max(v2[r], NEG)
        chosen[bidx[go], here[go]] = True
        pick = torch.where(go, best1, torch.full_like(best1, -1))
        knd = torch.where(pick >= 0, 1, 0)
        fb = go & (pick < 0) & first
        if bool(fb.count_nonzero()):
            alt, akind = self._tac_explore_region(fb, u_b, ut, here, pre, seat, revealed, chosen, treg)
            pick = torch.where(fb & (alt >= 0), alt, pick)
            knd = torch.where(fb & (alt >= 0), akind, knd)
            late = fb & (alt < 0) & (best2 >= 0)
            pick = torch.where(late, best2, pick)
            knd = torch.where(late, 4, knd)
        return pick, knd

    def _tac_explore_region(self, mask: torch.Tensor, u_b: torch.Tensor, ut: torch.Tensor, here: torch.Tensor,
                            pre: str, seat: int, revealed: torch.Tensor, chosen: torch.Tensor, treg: torch.Tensor):
        """[B] twice — `exploreTarget`'s first-round fallbacks for the unit
        at local slot `u_b`: the nearest unrevealed plot (the first of equals
        by index) of its region where the region holds one — off any region
        of its area — that it may enter with no unit on it, not chosen, a path
        to it existing; else the same over the regions `treg` marks; the plot
        (-1 none) and its kind (2 region, 3 area, 5 tertiary regions)."""
        B, T, dev = self.B, self.T, self.device
        bidx = torch.arange(B, device=dev)
        reg = self.tile_region[bidx, here]
        area = self.tile_area[bidx, here]
        in_reg = (self.tile_region == reg.unsqueeze(1)) & (reg >= 0).unsqueeze(1)
        in_area = (self.tile_area == area.unsqueeze(1)) & (reg < 0).unsqueeze(1)
        has = (in_reg & ~revealed).any(dim=1)
        sel = in_reg & has.unsqueeze(1) | in_area
        land, wat = self._tac_enter(seat, False)
        naval = self.unit_naval.take(ut)
        ent = torch.where(naval.unsqueeze(1), wat, land)
        occ = torch.zeros(B, T, dtype=torch.bool, device=dev)
        for pl in (self.military_at, self.civilian_at, self.support_at, self.embarked_at):
            occ |= pl >= 0
        d = self.pair_dist[here].to(torch.long)

        def nearest(m: torch.Tensor, inset: torch.Tensor) -> torch.Tensor:
            cand = m.unsqueeze(1) & inset & ~revealed & ent & ~occ
            key = torch.where(cand, d * T + torch.arange(T, device=dev), torch.full_like(d, 1 << 40))
            kmin, p = key.min(dim=1)
            p = torch.where(kmin < (1 << 40), p, torch.full_like(p, -1))
            p = torch.where((p >= 0) & ~chosen[bidx, p.clamp(min=0)], p, torch.full_like(p, -1))
            on = p >= 0
            if bool(on.count_nonzero()):
                r_i = bidx[on]
                res = self._tac_search(r_i, u_b[on], seat, 1 << 30, True, dest=p[on], pre=pre)
                ok = torch.zeros(B, dtype=torch.bool, device=dev)
                ok[r_i] = res["found"]
                p = torch.where(ok, p, torch.full_like(p, -1))
            return p

        p = nearest(mask, sel)
        kind = torch.where(reg >= 0, 2, 3)
        rest = mask & (p < 0) & treg.any(dim=1)
        if bool(rest.count_nonzero()):
            p3 = nearest(rest, treg)
            kind = torch.where(rest & (p3 >= 0), 5, kind)
            p = torch.where(rest & (p3 >= 0), p3, p)
        return p, kind

    # ------------------------------------- the city-states' and Free Cities' pass

    def _tac_own_mil(self, seat: int) -> torch.Tensor:
        """[B, T] — a military unit of `seat` (ashore, afloat or embarked)
        holds the plot (`stackedAt` for a military unit, itself counted)."""
        out = torch.zeros(self.B, self.T, dtype=torch.bool, device=self.device)
        for pl in (self.military_at, self.embarked_at):
            out |= (pl >= 0) & (self.unit_seat.gather(1, pl.clamp(min=0)) == seat)
        return out

    def _seat_pool_slots(self, k: int, pre: str, seat: int, act: torch.Tensor) -> None:
        """`poolSlots` for pool row `k` (a city-state's, or the Free Cities'
        at row S) in the games of `act`: the slots whose unit was gone when
        the player's last tactical turn ended go free, pushed in ascending
        order; each unit of `seat` in pool `pre` without a slot takes one in
        pool order — the slot pushed last, else a new one past the end."""
        P = simbase.SEAT_POOL_MAX
        dy = self.seat_pool_dying[:, k] & act.unsqueeze(1)
        if bool(dy.count_nonzero()):
            nf0 = self.seat_pool_nfree[:, k]
            pos = nf0.unsqueeze(1) + dy.long().cumsum(dim=1) - 1
            b_i, s_i = dy.nonzero(as_tuple=True)
            self.seat_pool_free[b_i, k, pos[b_i, s_i]] = s_i
            self.seat_pool_nfree[:, k] = nf0 + dy.sum(dim=1)
            self.seat_pool_dying[:, k] = self.seat_pool_dying[:, k] & ~act.unsqueeze(1)
        slot = getattr(self, f"{pre}_unit_pslot")
        need = (act.unsqueeze(1) & getattr(self, f"{pre}_unit_alive") & (getattr(self, f"{pre}_unit_seat") == seat)
                & (slot < 0))
        if not bool(need.count_nonzero()):
            return
        r = need.long().cumsum(dim=1) - 1
        nf = self.seat_pool_nfree[:, k].unsqueeze(1)
        s_free = self.seat_pool_free[:, k].gather(1, (nf - 1 - r).clamp(min=0, max=P - 1))
        s_new = self.seat_pool_size[:, k].unsqueeze(1) + (r - nf)
        slot.copy_(torch.where(need, torch.where(r < nf, s_free, s_new), slot))
        n = need.sum(dim=1)
        used = torch.minimum(n, self.seat_pool_nfree[:, k])
        self.seat_pool_nfree[:, k] -= used
        self.seat_pool_size[:, k] += n - used
        assert int(self.seat_pool_size[:, k].max()) <= P, "a seat's pool slots exhausted — raise simbase.SEAT_POOL_MAX"

    def _seat_pool_dying(self, k: int, pre: str, seat: int, act: torch.Tensor) -> None:
        """`poolDying` for pool row `k` in the games of `act`: the slots none
        of `seat`'s units holds wait for its next turn to go free."""
        P = simbase.SEAT_POOL_MAX
        dev = self.device
        ar = torch.arange(P, device=dev).unsqueeze(0)
        slot = getattr(self, f"{pre}_unit_pslot")
        hm = getattr(self, f"{pre}_unit_alive") & (getattr(self, f"{pre}_unit_seat") == seat) & (slot >= 0)
        held = torch.zeros(self.B, P + 1, dtype=torch.bool, device=dev)
        held.scatter_(1, torch.where(hm, slot, P), True)
        infree = torch.zeros(self.B, P + 1, dtype=torch.bool, device=dev)
        infree.scatter_(1, torch.where(ar < self.seat_pool_nfree[:, k].unsqueeze(1), self.seat_pool_free[:, k], P), True)
        dying = (ar < self.seat_pool_size[:, k].unsqueeze(1)) & ~held[:, :P] & ~infree[:, :P]
        self.seat_pool_dying[:, k] = torch.where(act.unsqueeze(1), self.seat_pool_dying[:, k] | dying,
                                                 self.seat_pool_dying[:, k])

    def _tac_alt_table(self) -> torch.Tensor:
        """[T, K] long — FindAlternateLocation's plots round each plot
        (0x585940 -> 0x1e000), in its order: the game's axial steps (dx, dy)
        over -3..3, dx the outer, within 3; -1 off the map."""
        tab = getattr(self, "_tac_alt_cache", None)
        if tab is not None:
            return tab
        W, H = self.W, self.H
        rng = _WANDER_BACK_RANGE
        steps = [(dx, dy) for dx in range(-rng, rng + 1) for dy in range(-rng, rng + 1)
                 if (max(abs(dx), abs(dy)) if (dx < 0) != (dy < 0) and dx != 0 and dy != 0 else abs(dx) + abs(dy)) <= rng]
        rows = []
        for t in range(W * H):
            col, row = t % W, t // W
            q = col - ((row - (row & 1)) >> 1)
            out = []
            for dx, dy in steps:
                r = row + dy
                c = q + dx + ((r - (r & 1)) >> 1)
                if self.wrap_x:
                    c %= W
                out.append(r * W + c if 0 <= r < H and 0 <= c < W else -1)
            rows.append(out)
        tab = torch.tensor(rows, dtype=torch.long, device=self.device)
        self._tac_alt_cache = tab
        return tab

    def _tac_alternate(self, mask: torch.Tensor, us: torch.Tensor, home: torch.Tensor, pre: str, seat: int,
                       ent: torch.Tensor) -> torch.Tensor:
        """[B] — `alternateLocation` for the unit at local slot `us` of pool
        `pre` round `home` [B] in the games of `mask`: of the plots within 3 in
        the table's order that its ground takes (`ent` [B, T]) with no other
        player's unit and none of its own stacking with it, the nearest
        `home`, a plot of another area counted three times as far, the first
        of equals; -1 none."""
        B, T, dev = self.B, self.T, self.device
        bidx = torch.arange(B, device=dev)
        cand = self._tac_alt_table()[home.clamp(min=0)]  # [B, K]
        cc = cand.clamp(min=0)
        g = (us + self.POOL_LO[pre]).unsqueeze(1)
        own_other = torch.zeros(B, T, dtype=torch.bool, device=dev)
        for pl in (self.military_at, self.embarked_at):
            own_other |= (pl >= 0) & (self.unit_seat.gather(1, pl.clamp(min=0)) == seat) & (pl != g)
        ok = (cand >= 0) & ent.gather(1, cc) & ~self._tac_foreign(seat).gather(1, cc) & ~own_other.gather(1, cc)
        d = self.pair_dist[home.clamp(min=0).unsqueeze(1), cc].to(torch.long)
        area = self.tile_area
        d = torch.where(area.gather(1, cc) != area[bidx, home.clamp(min=0)].unsqueeze(1), d * 3, d)
        K = cand.shape[1]
        key = torch.where(ok & mask.unsqueeze(1), d * (K + 1) + torch.arange(K, device=dev), torch.full_like(d, 1 << 40))
        m, i = key.min(dim=1)
        return torch.where(m < (1 << 40), cc.gather(1, i.unsqueeze(1)).squeeze(1), torch.full_like(m, -1))

    def _seat_pass_open(self, pre: str, seat: int, act: torch.Tensor, full: bool = False) -> dict:
        """a player's tactical pass as it opens (`openPass`): its military
        units of pool `pre` in pool-slot order, their planning reach (two
        turns, no zones of control) and its tactical target list — built
        where a foe stands near, or with `full` (an operation's nodes take a
        city, a district or an improvement as a target)"""
        dev = self.device
        B, T = self.B, self.T
        BIG = 1 << 40
        ut = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        units = (act.unsqueeze(1) & getattr(self, f"{pre}_unit_alive") & (getattr(self, f"{pre}_unit_seat") == seat)
                 & self._type_dom_mil.take(ut))
        P = units.shape[1]
        slot = getattr(self, f"{pre}_unit_pslot")
        key = torch.where(units, slot, torch.full_like(slot, BIG))
        order = torch.argsort(key, dim=1, stable=True)
        npass = units.sum(dim=1)
        # the tactical target list, where a foe stands within a planning's
        # reach of a unit (no move of the pass takes a target farther)
        # (the knowledge base's entries a city-state's row or the Free Cities' `FK`)
        kb = seat - 100 if 100 <= seat < 100 + self.S else (self.FK if seat == FREE_SEAT else -1)
        tg = self._tac_targets(seat, kb) if full or self._tac_foe_near(units, pre, seat, _ATTACK_SIGHT) else None
        rows, slots = units.nonzero(as_tuple=True)
        rowof = torch.full((B, P), -1, dtype=torch.long, device=dev)
        if rows.numel():
            rowof[rows, slots] = torch.arange(rows.shape[0], device=dev)
            res = (self._tac_plan(rows, slots, tg, pre, seat) if tg is not None
                   else self._tac_search(rows, slots, seat, _PLAN_TURNS, False, pre=pre))
        else:
            empty = torch.full((1, T), -1, dtype=torch.long, device=dev)
            res = {"rank": empty, "turns": empty.clone(), "moves": empty.clone()}
        # the player's danger map as the pass opens
        danger = self._danger_plane(seat, self._tac_danger_need(units, pre, rowof, res))
        return {"units": units, "order": order, "npass": npass, "rowof": rowof, "res": res, "tg": tg,
                "danger": danger}

    def _tac_foe_near(self, units: torch.Tensor, pre: str, seat: int, radius: int) -> bool:
        """is a unit of a player at war with `seat` within `radius` of one of
        `units` [B, P] of pool `pre` in some game — else no target of the
        list is one a move of the pass could take"""
        rows, slots = units.nonzero(as_tuple=True)
        if not rows.numel():
            return False
        tiles = getattr(self, f"{pre}_unit_tile")[rows, slots].clamp(min=0)
        near = torch.zeros(self.B, self.T, dtype=torch.float32, device=self.device)
        near.index_add_(0, rows, (self.pair_dist[tiles].to(torch.long) <= radius).to(torch.float32))
        return bool(((near > 0) & self._tac_hostile(seat)).any())

    # ------------------------------------------------------- the danger map

    def _ai_combat(self, pre: str | None = None) -> torch.Tensor:
        """[B, P] long — `aiStrengths`' combat over pool `pre` (the merged
        pool for None), 0x56dc90 with 0: the type's Combat, an embarked land
        combat unit's its owner's era's embarked strength
        (`_embarked_def_cs`)."""
        p = "unit" if pre is None else f"{pre}_unit"
        ut = getattr(self, f"{p}_type").clamp(min=0, max=self.NU - 1)
        seat = getattr(self, f"{p}_seat")
        out = self._type_combat.take(ut)
        emb = getattr(self, f"{p}_alive") & getattr(self, f"{p}_emb") & self._type_dom_mil.take(ut)
        if bool(emb.any()):
            for sv in torch.unique(seat[emb]).tolist():
                cs = self._embarked_def_cs(torch.full((self.B,), int(sv), dtype=torch.long, device=self.device))
                out = torch.where(emb & (seat == sv), cs.unsqueeze(1).to(out.dtype), out)
        return out

    def _embark_waived(self, frm: torch.Tensor, to: torch.Tensor, rows: torch.Tensor | None = None) -> torch.Tensor:
        """`stepCost`'s embark waiver (the embark rule 0x530420, the
        disembark 0x530240) for the steps `frm` -> `to` ([N, K] plots of the
        games `rows`, every game where None): a district with FreeEmbark —
        a city's centre or a Harbor — at either plot, the FROM plot's
        district complete (0x811b0 read off the FROM plot)"""
        dist = self.district if rows is None else self.district[rows]
        comp = self.district_complete if rows is None else self.district_complete[rows]
        ctr = self._centre_plane() if rows is None else self._centre_plane()[rows]
        f_d, t_d = dist.gather(1, frm), dist.gather(1, to)
        f_c, t_c = ctr.gather(1, frm), ctr.gather(1, to)
        fe = (f_d == self._harbor_didx) | f_c | (t_d == self._harbor_didx) | t_c
        return fe & (f_c | ((f_d >= 0) & comp.gather(1, frm)))

    def _danger_plane(self, seat: int, need: torch.Tensor) -> torch.Tensor:
        """[B, T] long — `dangerPlane`, `seat`'s danger map, on the plots of
        `need` [B, T] (those its pass reads): each unit of a player at war
        with it that it sees, with a combat, ranged or bombard strength, adds
        its danger (`unitDanger`) over the plots its one-turn search closes
        from where it stands on its full Movement (a ship's strike onto land
        none), those within its range of
        them and, a raider's, the land beside them — each set once; an
        aircraft over its range. Each district of such a player
        (`_danger_districts`) whose plot it sees adds its defence on its plot
        and its strike over its strike's reach, else 1 beside it; its own
        districts with a defence zero their plots and take their strike off
        the plots it covers, to 1 at least; last each plot's feature its
        DangerValue (`featureDanger`). A unit whose search cannot
        touch a plot of `need` (its full Movement over the cheapest step, its
        range and the raider's ring past it) is not searched."""
        dev = self.device
        B, T = self.B, self.T
        out = torch.zeros(B, T, dtype=torch.long, device=dev)
        seen = self._barb_seen("barbarians" if seat == BARB_SEAT else seat)
        U = self.unit_tile.shape[1]
        ut = self.unit_type.clamp(min=0, max=self.NU - 1)
        melee = self._ai_combat()
        bomb = self._type_bombard.take(ut)
        rng_s = torch.where(bomb > 0, torch.zeros_like(bomb), self._type_ranged_strength.take(ut))
        tile = self.unit_tile
        tc = tile.clamp(min=0)
        ok = (self.unit_alive & (tile >= 0) & self._seats_hostile(seat, self.unit_seat) & seen.gather(1, tc)
              & ((melee > 0) | (rng_s > 0) | (bomb > 0)) & (self._rel_strength.take(ut) == 0))
        if self._stealth_live:
            me = torch.arange(U, device=dev).unsqueeze(0)
            for pl in (self.military_at, self.embarked_at):
                hid = self._stealth_hidden(seat, pl)
                ok &= ~((pl.gather(1, tc) == me) & hid.gather(1, tc))
        vs = bomb - self._bombard_vs_unit
        s = torch.where(bomb > 0, torch.maximum(melee, vs), torch.maximum(melee, rng_s))
        promos = self.unit_promos
        R = torch.where(self._type_ranged_strength.take(ut) > 0,
                        self._type_ranged_range.take(ut) + self._promo_val(ut, promos, "RANGE"), torch.zeros_like(ut))
        air = self._type_air.take(ut) > 0
        raider = self._type_raider.take(ut)
        # the reach bound: a turn's steps on the cheapest Movement a step may
        # cost, the last step taking what is left
        full_all = torch.cat((self._full_mp("major") - self.major_unit_aura_mp,
                              self._full_mp("barb") - self.barb_unit_aura_mp), dim=1)
        steps = torch.where(air, torch.zeros_like(full_all),
                            torch.div(full_all, self._tac_min_step_mp(), rounding_mode="floor") + 1)
        bound = steps + R + raider.long()
        b_i, u_i = ok.nonzero(as_tuple=True)
        if b_i.numel():
            near = (self.pair_dist[tc[b_i, u_i]].to(torch.long) <= bound[b_i, u_i].unsqueeze(1)) & need[b_i]
            keep = near.any(dim=1)
            b_i, u_i = b_i[keep], u_i[keep]
        if b_i.numel():
            # each unit's plots counted: once in its reach, once more in its
            # second list (those within its range of the reach outside it, a
            # raider's land beside the reach)
            count = torch.zeros(b_i.numel(), T, dtype=torch.long, device=dev)
            # an aircraft: the plots within its range of where it stands
            a = air[b_i, u_i]
            if bool(a.count_nonzero()):
                count[a] = (self.pair_dist[tc[b_i[a], u_i[a]]].to(torch.long) <= R[b_i[a], u_i[a]].unsqueeze(1)).long()
            useat = self.unit_seat[b_i, u_i]
            for sv in torch.unique(useat[~a]).tolist():
                m = (~a & (useat == sv)).nonzero(as_tuple=True)[0]
                for pre in POOL_CLASS:
                    lo, hi = self.POOL_LO[pre], self.POOL_HI[pre]
                    mm = m[(u_i[m] >= lo) & (u_i[m] < hi)]
                    if not mm.numel():
                        continue
                    res = self._tac_search(b_i[mm], u_i[mm] - lo, int(sv), 1, False, pre=pre, full=True, stand=True)
                    reach = res["closed"] >= 1
                    # a ship's strike onto land is no plot of its reach
                    ship = self.unit_naval[ut[b_i[mm], u_i[mm]]]
                    reach &= ~(ship.unsqueeze(1) & ~self.water[b_i[mm]])
                    second = torch.zeros_like(reach)
                    rr = R[b_i[mm], u_i[mm]]
                    for r in torch.unique(rr).tolist():
                        if r <= 0:
                            continue
                        k = rr == r
                        disk = (self.pair_dist <= r).to(torch.float32)
                        second[k] = ((reach[k].to(torch.float32) @ disk) > 0) & ~reach[k]
                    rd = raider[b_i[mm], u_i[mm]]
                    if bool(rd.count_nonzero()):
                        ring = ((reach[rd].to(torch.float32) @ (self.pair_dist == 1).to(torch.float32)) > 0) \
                            & ~self.water[b_i[mm][rd]]
                        second[rd] |= ring
                    count[mm] = reach.long() + second.long()
            out.index_add_(0, b_i, count * s[b_i, u_i].unsqueeze(1))
        # the districts (`dangerDistricts`): the holders' at war with `seat`
        # on the plots it sees, then its own
        bidx = self._bidx
        disk2 = self.pair_dist <= _CITY_STRIKE_RANGE
        ring1 = self.pair_dist == 1
        own = []
        for row in range(self.city_alive.shape[1]):
            hseat = int(self._ROW_SEAT[row])
            minor = self._CITY_MINOR0 <= row < self._CITY_MINOR0 + self.S
            hostile = self._seats_hostile(seat, torch.full((B,), hseat, dtype=torch.long, device=dev))
            mine = hseat == seat
            if not mine and not bool(hostile.count_nonzero()):
                continue
            for c in range(1 if minor else self.city_alive.shape[2]):
                live = self.city_alive[:, row, c]
                if not bool(live.count_nonzero()):
                    continue
                for live_d, plot, def_cs, strike in self._danger_districts(row, c, live):
                    if mine:
                        own.append((live_d, plot, strike, def_cs))
                        continue
                    on = live_d & hostile & seen[bidx, plot]
                    if not bool(on.count_nonzero()):
                        continue
                    out[bidx, plot] += torch.where(on & (def_cs > 0), def_cs, torch.zeros_like(def_cs))
                    area = torch.where((strike > 0).unsqueeze(1), disk2[plot], ring1[plot])
                    area[bidx, plot] = False
                    val = torch.where(strike > 0, strike, torch.ones_like(strike))
                    out += (area & on.unsqueeze(1)).long() * val.unsqueeze(1)
        for live, plot, strike, def_cs in own:
            on = live & (def_cs > 0)
            out[bidx[on], plot[on]] = 0
            hit = live.unsqueeze(1) & (strike > 0).unsqueeze(1) & disk2[plot] & (out > 0)
            hit[bidx, plot] = False
            out = torch.where(hit, (out - strike.unsqueeze(1)).clamp(min=1), out)
        # each plot's live feature its DangerValue
        live = (self.feat_id >= 0) & ~self.feat_stripped
        return out + torch.where(live, self._feat_danger[self.feat_id.clamp(min=0)], torch.zeros_like(out))

    def _danger_districts(self, row: int, c: int, live: torch.Tensor) -> list:
        """`dangerDistricts` of the city at (`row`, `c`) where `live` [B]:
        per district placed (the centre, the registry's, the wonders' plots)
        (placed [B], plot [B], defence [B], strike [B]) in whole numbers — the
        centre on its city's defence and its strike while the walls stand,
        the Encampment on the city's standing strength with its own plot's
        garrison and its strike while it stands intact behind its own perimeter, any
        other neither"""
        dev = self.device
        B = self.B
        bidx = self._bidx
        col = torch.full((B,), c, dtype=torch.long, device=dev)
        rt = torch.full_like(col, row)
        zero = torch.zeros_like(col)
        wmax = self._walls_max_at(rt, col).long()
        raw = self._strike_strength(row, col)
        if row < self.n_majors:
            raw = raw + self._gov_mods(row)[12]["crng"].to(raw.dtype)
        raw = torch.floor(raw).long()
        pool = torch.minimum(self.city_outer_hp[bidx, row, col].long(), wmax)
        ctr = self.city_center[:, row, c].clamp(min=0)
        out = [(live, ctr, torch.floor(self._city_defense_cs(rt, col)[0]).long(), torch.where(pool > 0, raw, zero))]
        reg = self.city_dist_tile[:, row, c]
        for di in range(reg.shape[1]):
            plot = reg[:, di]
            placed = live & (plot >= 0)
            if not bool(placed.count_nonzero()):
                continue
            p0 = plot.clamp(min=0)
            if di == self._encamp_didx:
                intact = (self.district_complete[bidx, p0] & ~self.district_pillaged[bidx, p0]
                          & (self.encamp_hp[bidx, p0] > 0)
                          & (torch.minimum(self.encamp_outer_hp[bidx, p0].long(), wmax) > 0))
                # its city's standing strength and its own plot's garrison
                # (0x24ae80 with the garrison flag 0, 0x24a180)
                gar = self._garrison_cs(rt, col, self._ROW_SEAT.take(rt), self._holder_strength(rt, col), plot=p0)
                d = torch.floor(self._centre_strength(rt, col, garrisoned=False) + gar).long()
                out.append((placed, p0, d, torch.where(intact, raw, zero)))
            else:
                out.append((placed, p0, zero, zero))
        wreg = self.city_wonder[:, row, c]
        for wi in range(wreg.shape[1] if self._wond_n else 0):
            plot = wreg[:, wi]
            placed = live & (plot >= 0)
            if bool(placed.count_nonzero()):
                out.append((placed, plot.clamp(min=0), zero, zero))
        return out

    def _tac_min_step_mp(self) -> int:
        """the cheapest Movement a step may cost, in `mp_scale` units: a
        plain step's, a route tier's, a railroad's"""
        m = min(self._mp_scale, self._railroad_mp, int(self._road_tier_mp.min()))
        return max(m, 1)

    def _tac_danger_need(self, units: torch.Tensor, pre: str, rowof: torch.Tensor, res: dict) -> torch.Tensor:
        """[B, T] bool — the plots a pass reads the danger map on: its units'
        own and the plots of this turn of their planning reach"""
        B, T, dev = self.B, self.T, self.device
        need = torch.zeros(B, T, dtype=torch.bool, device=dev)
        b_i, s_i = units.nonzero(as_tuple=True)
        if b_i.numel():
            need[b_i, getattr(self, f"{pre}_unit_tile")[b_i, s_i].clamp(min=0)] = True
            rr = rowof[b_i, s_i]
            on = rr >= 0
            if bool(on.count_nonzero()):
                r1 = torch.zeros(B, T, dtype=torch.float32, device=dev)
                r1.index_add_(0, b_i[on], (res["turns"][rr[on]] == 1).float())
                need |= r1 > 0
        return need

    def _tac_flees(self, pre: str, seat: int, danger: torch.Tensor, rowof: torch.Tensor, res: dict,
                   hl: bool) -> torch.Tensor:
        """[B, P] bool — `flees` for each unit of pool `pre` on a plot of
        danger: one with no strength or embarked flees; a hurt one — a
        barbarian's at sea, else the tactical test's with half its health or
        less lost and no blow of its planning that kills, the homeland's with
        a quarter or more lost; a whole barbarian holds, any other whole one
        flees where the danger tops its strength by 20 (the larger of combat
        and ranged; tactical) or 15 (`unitDanger`; homeland)."""
        ut = getattr(self, f"{pre}_unit_type").clamp(min=0, max=self.NU - 1)
        melee = self._ai_combat(pre)
        bomb = self._type_bombard.take(ut)
        rng_s = torch.where(bomb > 0, torch.zeros_like(bomb), self._type_ranged_strength.take(ut))
        d = danger.gather(1, getattr(self, f"{pre}_unit_tile").clamp(min=0))
        hp_max = int(self.rules.combat["unitHp"])
        damage = hp_max - getattr(self, f"{pre}_unit_hp")
        barb = seat == BARB_SEAT
        naval = self.unit_naval.take(ut)
        wins = torch.zeros_like(naval)
        if "wins" in res:
            on = rowof >= 0
            wins = torch.where(on, res["wins"][rowof.clamp(min=0)], wins)
        if hl:
            hurt_flees = (4 * damage >= hp_max) | (naval & barb)
            vs = bomb - self._bombard_vs_unit
            st = torch.where(bomb > 0, torch.maximum(melee, vs), torch.maximum(melee, rng_s))
            whole_flees = torch.zeros_like(naval) if barb else d > st + 15
        else:
            hurt_flees = ((2 * damage >= hp_max) & ~wins) | (naval & barb)
            whole_flees = torch.zeros_like(naval) if barb else d > torch.maximum(melee, rng_s) + 20
        weak = ((melee <= 0) & (rng_s <= 0) & (bomb <= 0)) | getattr(self, f"{pre}_unit_emb")
        return (d > 0) & (weak | torch.where(damage > 0, hurt_flees, whole_flees))

    def _tac_safe_plot(self, mask: torch.Tensor, u_b: torch.Tensor, pre: str, seat: int, danger: torch.Tensor,
                       rowof: torch.Tensor, res: dict, taken: torch.Tensor) -> torch.Tensor:
        """[B] — `safePlot` for the unit at local slot `u_b` in the games of
        `mask`: of its planning reach's plots of this turn in closing order,
        none in `taken`, none with a unit of its own stacking with it (itself
        counted), one at war with it or fallout, the first best — a fort (its
        own territory under a city centre or an Encampment) over any plot
        but a fort, of two forts the lower danger; a plot of no danger over
        one of danger, a fort aside; of two of no danger its own territory,
        else less Movement left; of two of danger on its own territory its
        own over another's, the lower danger, then less Movement left, a fort
        or a plot of no danger kept; off it the lower danger, then the
        farther; a unit with no combat strength skips a water plot of danger
        while the best is ashore. -1 none."""
        B, dev = self.B, self.device
        bidx = torch.arange(B, device=dev)
        row = rowof[bidx, u_b]
        mask = mask & (row >= 0)
        rr = row.clamp(min=0)
        rt, rk, mv = res["turns"][rr], res["rank"][rr], res["moves"][rr]
        cand = (mask.unsqueeze(1) & (rt == 1) & ~taken & ~self._tac_own_mil(seat) & ~self._tac_hostile(seat)
                & (self.tile_fallout <= 0))
        garrison = self._centre_plane()
        if self._encamp_didx >= 0:
            garrison = garrison | (self.district == self._encamp_didx)
        n = cand.sum(dim=1)
        best = torch.full((B,), -1, dtype=torch.long, device=dev)
        K = int(n.max()) if B else 0
        if not K:
            return best
        order = torch.where(cand, rk, torch.full_like(rk, 1 << 40)).argsort(dim=1, stable=True)[:, :K]
        here = getattr(self, f"{pre}_unit_tile")[bidx, u_b].clamp(min=0)
        ut = getattr(self, f"{pre}_unit_type")[bidx, u_b].clamp(min=0, max=self.NU - 1)
        no_combat = self._type_combat.take(ut) <= 0
        z = torch.zeros(B, dtype=torch.bool, device=dev)
        b_fort, b_safe, b_own, b_water = z.clone(), z.clone(), z.clone(), z.clone()
        zl = torch.zeros(B, dtype=torch.long, device=dev)
        b_d, b_mv, b_dist = zl.clone(), zl.clone(), zl.clone()
        for k in range(K):
            p = order[:, k]
            on = k < n
            d = danger[bidx, p]
            safe = d <= 0
            own = self.tile_seat[bidx, p] == seat
            fort = own & garrison[bidx, p]
            water = self.water[bidx, p]
            m = mv[bidx, p]
            dist = self.pair_dist[here, p].to(torch.long)
            first = best < 0
            skip = ~b_water & no_combat & water & (d > 0)
            take_fort = ~b_fort | (d < b_d)
            take_safe = ~b_safe | (own & ~b_own) | (m < b_mv)
            take_own = ~b_fort & ~b_safe & (~b_own | (d < b_d) | ((d == b_d) & (m < b_mv)))
            take_off = (d < b_d) | ((d == b_d) & (dist > b_dist))
            take = torch.where(fort, take_fort, torch.where(safe & ~b_fort, take_safe,
                                                            torch.where(own, take_own, take_off)))
            take = on & (first | (~skip & take))
            best = torch.where(take, p, best)
            b_fort = torch.where(take, fort, b_fort)
            b_safe = torch.where(take, safe, b_safe)
            b_own = torch.where(take, own, b_own)
            b_water = torch.where(take, water, b_water)
            b_d = torch.where(take, d, b_d)
            b_mv = torch.where(take, m, b_mv)
            b_dist = torch.where(take, dist, b_dist)
        return best

    def _tac_move_to_safety(self, live, done: torch.Tensor, order: torch.Tensor, npass: torch.Tensor,
                            rowof: torch.Tensor, res: dict, danger: torch.Tensor, pre: str, seat: int,
                            hl: bool) -> None:
        """MOVE TO SAFETY (`moveToSafety`; with `hl` the homeland's,
        `homelandSafety`): in slot order each unit left that flees
        (`_tac_flees`, listed as the move begins) goes
        to its safe plot (`_tac_safe_plot`, the plots the ones before it took
        left out), its turn done; with none a barbarian of the homeland's
        fortifies where it stands, any other stays."""
        B, T, dev = self.B, self.T, self.device
        bidx = torch.arange(B, device=dev)
        listed = live() & self._tac_flees(pre, seat, danger, rowof, res, hl)
        if not bool(listed.count_nonzero()):
            return
        taken = torch.zeros(B, T, dtype=torch.bool, device=dev)
        for j in range(int(npass.max()) if B else 0):
            u_b = order[:, j]
            go = (j < npass) & listed[bidx, u_b] & live()[bidx, u_b]
            if not bool(go.count_nonzero()):
                continue
            p = self._tac_safe_plot(go, u_b, pre, seat, danger, rowof, res, taken)
            moved = go & (p >= 0)
            if bool(moved.count_nonzero()):
                taken[bidx[moved], p[moved]] = True
                self._tac_move_to(moved, u_b, p, pre, seat, False)
            fin = moved | (go & hl & (seat == BARB_SEAT))
            done[bidx[fin], u_b[fin]] = True

    def _seat_reach_turns(self, op: dict, u_b: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """[B, T] twice — the reach turn (-1 none) and closing rank of each
        game's unit at local slot `u_b`"""
        B, T = self.B, self.T
        bidx = torch.arange(B, device=self.device)
        row = op["rowof"][bidx, u_b]
        rr = row.clamp(min=0)
        rt = torch.where((row >= 0).unsqueeze(1), op["res"]["turns"][rr], torch.full((B, T), -1, dtype=torch.long,
                                                                                   device=self.device))
        return rt, op["res"]["rank"][rr]

    def _minor_tactics(self, s: int) -> None:
        """A CITY-STATE'S TACTICAL TURN (`cityStateTactics`) for minor `s`:
        its unit pool (`_seat_pool_slots`), each unit's planning reach taken
        before any moves, its tactical target list and danger map, its
        operations' run (`_mops_run`, their units theirs), then Support
        Formation, Attack High Priority, Move to Safety, Attack Medium and Low
        Priority, Heal,
        Chase Target (no strike) and Wander Near City in pool order (Promotion
        after Attack Medium Priority), the
        homeland's Move to Safety; the rest end their turn."""
        seat = 100 + s
        act = self.citystate_alive[:, s] & (self.citystate_center[:, s] >= 0)
        if not bool(act.count_nonzero()):
            return
        self._seat_pool_slots(s, "major", seat, act)
        self._tac_in_pass = True
        self._tac_cost_held = None
        self._tac_full_held = None
        try:
            self._minor_pass(s, act)
        finally:
            self._tac_in_pass = False
            self._tac_cost_held = None
            self._tac_full_held = None
        self._seat_pool_dying(s, "major", seat, act)

    def _tac_promotion(self, live, done: torch.Tensor, pre: str) -> None:
        """PROMOTION (`promotion`, 0x77ac30): each unit left with a promotion
        due takes the AI's pick (`aiPromotionPick`, 0x774970: of the rows it
        may take, the first of the highest Level); the promotion ends its
        turn"""
        m = live()
        if not bool(m.count_nonzero()):
            return
        rd = self.rules_dev
        B, N = m.shape
        P = rd.promo_cols
        sc = (torch.arange(N, device=self.device) + self.POOL_LO[pre]).unsqueeze(0).expand(B, N)
        utp = self.unit_type.gather(1, sc)
        ok = self._promo_offer_mask(sc, utp) & m.unsqueeze(2)
        has = ok.any(dim=2)
        if not bool(has.count_nonzero()):
            return
        tier = rd.promo_tier[rd.u_promo_class.take(utp.clamp(min=0)).clamp(min=0)]
        col = torch.arange(P, device=self.device).view(1, 1, -1)
        key = torch.where(ok, tier * P + (P - 1 - col), torch.full_like(tier, -1))
        pick = key.argmax(dim=2)
        r, j = has.nonzero(as_tuple=True)
        self._take_promotion(r, sc[r, j], pick[r, j], utp[r, j])
        done |= has
        self._gen_ver += 1

    def _tac_settler_types(self) -> torch.Tensor:
        """[NU] bool — the chassis whose AI row's PseudoYieldType is
        PSEUDOYIELD_UNIT_SETTLER (`settlerPseudo`)"""
        c = getattr(self, "_tac_settler_cache", None)
        if c is None:
            T = self._cv_tables()
            rows = T["unit_rows"]
            c = torch.tensor([r >= 0 and rows[r]["pseudo"] == "PSEUDOYIELD_UNIT_SETTLER"
                              for r in T["engine_row"].tolist()], dtype=torch.bool, device=self.device)
            self._tac_settler_cache = c
        return c

    def _tac_support_formation(self, live, done: torch.Tensor, op: dict, pre: str, seat: int) -> None:
        """SUPPORT FORMATION (`supportFormation`, 0x77ae80, its moves
        0x773bd0): each land unit left, in pool order, takes of its player's
        Settlers on the map in no formation — in pool order — the first,
        held where its planning reaches its plot within two turns, else the
        nearest it does not reach (the lowest slot of equals); then the moves
        in that order: the unit goes to the Settler's plot and, arrived, the
        Settler joins its formation; its turn is done"""
        dev = self.device
        B = self.B
        bidx = torch.arange(B, device=dev)
        BIG = 1 << 40
        lo = self.POOL_LO[pre]
        alive = getattr(self, f"{pre}_unit_alive")
        useat = getattr(self, f"{pre}_unit_seat")
        utile = getattr(self, f"{pre}_unit_tile")
        utype = getattr(self, f"{pre}_unit_type")
        pslot = getattr(self, f"{pre}_unit_pslot")
        P = alive.shape[1]
        vt = utile.clamp(min=0)
        cand = (alive & (useat == seat) & (utile >= 0)
                & self._tac_settler_types().take(utype.clamp(min=0, max=self.NU - 1)))
        if not bool(cand.count_nonzero()):
            return
        # a Settler in a formation: its flag with a military unit of its
        # player, not embarked, on its plot (`inEscort`)
        gv = torch.arange(P, device=dev).unsqueeze(0).expand(B, P) + lo
        mil = self.military_at.gather(1, vt)
        mc = mil.clamp(min=0)
        formed = (self.unit_escorted.gather(1, gv) & (mil >= 0) & (self.unit_seat.gather(1, mc) == seat)
                  & ~self.unit_emb.gather(1, mc))
        cand &= ~formed
        if not bool(cand.count_nonzero()):
            return
        order, npass = op["order"], op["npass"]
        first = torch.where(cand, pslot, torch.full_like(pslot, BIG)).argmin(dim=1)
        picks = []
        for j in range(int(npass.max()) if B else 0):
            u_b = order[:, j]
            ut = utype[bidx, u_b].clamp(min=0, max=self.NU - 1)
            ok = (j < npass) & live()[bidx, u_b] & ~self.unit_naval.take(ut) & cand.any(dim=1)
            if not bool(ok.count_nonzero()):
                continue
            rt, _ = self._seat_reach_turns(op, u_b)
            t_rt = rt.gather(1, vt)
            reached = cand & (t_rt >= 0) & (t_rt <= _PLAN_TURNS)
            d = self.pair_dist[utile[bidx, u_b].clamp(min=0)].to(torch.long).gather(1, vt)
            near = torch.where(cand & ~reached, d * BIG + pslot, torch.full_like(pslot, 1 << 62)).argmin(dim=1)
            pick = torch.where(reached[bidx, first], first, near)
            picks.append((ok, u_b, pick, vt[bidx, pick]))
        for ok, u_b, pick, plot in picks:
            go = ok & getattr(self, f"{pre}_unit_alive")[bidx, u_b]
            if not bool(go.count_nonzero()):
                continue
            self._tac_move_to(go, u_b, plot, pre, seat, False)
            alive = getattr(self, f"{pre}_unit_alive")
            utile = getattr(self, f"{pre}_unit_tile")
            gp = pick + lo
            gu = u_b + lo
            arrived = (go & (utile[bidx, u_b] == plot) & alive[bidx, pick] & (utile[bidx, pick] == plot)
                       & ~self.unit_escorted[bidx, gp] & ~self.unit_emb[bidx, gu])
            if bool(arrived.count_nonzero()):
                r = arrived.nonzero(as_tuple=True)[0]
                self.unit_escorted[r, gp[r]] = True
            done[bidx[go], u_b[go]] = True

    def _minor_pass(self, s: int, act: torch.Tensor) -> None:
        """`_minor_tactics`' moves"""
        dev = self.device
        B, T = self.B, self.T
        bidx = torch.arange(B, device=dev)
        seat = 100 + s
        pre = "major"
        # the whole target list where an operation of its runs: its nodes
        # take a city, a district or an improvement as a target
        ops_on = bool((act & (self.mops_def[:, s] >= 0).any(dim=1)).any())
        op = self._seat_pass_open(pre, seat, act, full=ops_on)
        units, order, npass = op["units"], op["order"], op["npass"]
        tg = op["tg"]
        done = torch.zeros_like(units)
        alive = self.major_unit_alive
        # its operations' run once the pass has its units' planning: their
        # units' turns are the operations'
        self._mops_run(s, act, op, done)
        # the pass's own units (its job): no operation's
        peers = self._tac_peers(units & ~self._mops_held(s), pre)

        def live() -> torch.Tensor:
            return units & ~done & alive & (self.major_unit_seat == seat)

        npos = int(npass.max()) if B else 0
        home = self.citystate_center[:, s].clamp(min=0)
        danger = op["danger"]
        # DEFENDER where its city's standing army holds it (`militaryAiTypeOf`)
        ai = torch.where(units, torch.where(self.major_unit_defender, _AI_DEFENDER, _AI_COMBAT), -1)
        # SUPPORT FORMATION
        self._tac_support_formation(live, done, op, pre, seat)
        # ATTACK HIGH PRIORITY, MOVE TO SAFETY, ATTACK MEDIUM and LOW PRIORITY
        # (the attacks where a foe stands near)
        if tg is not None:
            self._tac_attack_units(live, done, ai, order, op["rowof"], op["res"], tg, 3, peers, pre, seat)
        self._tac_move_to_safety(live, done, order, npass, op["rowof"], op["res"], danger, pre, seat, False)
        if tg is not None:
            self._tac_attack_units(live, done, ai, order, op["rowof"], op["res"], tg, 2, peers, pre, seat)
        # PROMOTION
        self._tac_promotion(live, done, pre)
        if tg is not None:
            self._tac_attack_units(live, done, ai, order, op["rowof"], op["res"], tg, 1, peers, pre, seat)
        # HEAL: a hurt unit not embarked on a plot of no danger holds its
        # plot; a hull outside its own waters heads for its city
        hp_max = int(self.rules.combat["unitHp"])
        ut = self.major_unit_type.clamp(min=0, max=self.NU - 1)
        naval = self.unit_naval.take(ut)
        hurt = (live() & (self.major_unit_hp < hp_max) & ~self.major_unit_emb
                & (danger.gather(1, self.major_unit_tile.clamp(min=0)) <= 0))
        away = hurt & naval & (self.tile_seat.gather(1, self.major_unit_tile.clamp(min=0)) != seat)
        if bool(away.count_nonzero()):
            for j in range(npos):
                u_b = order[:, j]
                go = (j < npass) & away[bidx, u_b] & live()[bidx, u_b]
                if bool(go.count_nonzero()):
                    self._tac_move_to(go, u_b, home, pre, seat, False)
        done |= hurt
        # CHASE TARGET: a LOW target within 8 of a unit (the list taken as the
        # pass began: only where a foe stands near is there one to take)
        if tg is not None:
            self._tac_chase(live, done, op["rowof"], op["res"], tg, order, npass, pre, seat, False)
        # WANDER NEAR CITY: by slot, each unit with Movement left
        land_ent, wat_ent = self._tac_enter(seat)
        for j in range(npos):
            u_b = order[:, j]
            ok = (j < npass) & live()[bidx, u_b] & (self.major_unit_mp[bidx, u_b] > 0)
            if not bool(ok.count_nonzero()):
                continue
            rt, rk = self._seat_reach_turns(op, u_b)
            cand = ((rt == 1) & ~self._tac_hostile(seat) & ~self._tac_own_mil(seat)
                    & (self.pair_dist[home].to(torch.long) <= _WANDER_CITY_RANGE))
            count = cand.sum(dim=1)
            wander = ok & (count > 0)
            pick = self._rand_range(wander, count)
            by_rank = torch.where(cand, rk, torch.full_like(rk, 1 << 40)).argsort(dim=1, stable=True)
            dest = by_rank.gather(1, pick.clamp(min=0, max=T - 1).unsqueeze(1)).squeeze(1)
            self._tac_move_to(wander, u_b, dest, pre, seat, False)
            back = ok & (count == 0)
            if bool(back.count_nonzero()):
                ut_b = self.major_unit_type[bidx, u_b].clamp(min=0, max=self.NU - 1)
                nav_b = self.unit_naval.take(ut_b)
                emb_b = self._tac_embarks(bidx, ut_b, seat)
                ent = torch.where(nav_b.unsqueeze(1), wat_ent,
                                  land_ent | (wat_ent & emb_b.unsqueeze(1)))
                alt = self._tac_alternate(back, u_b, home, pre, seat, ent)
                self._tac_move_to(back & (alt >= 0), u_b, alt, pre, seat, False)
            done[bidx[ok], u_b[ok]] = True
        # THE HOMELAND: Move to Safety; the rest end their turn
        self._tac_move_to_safety(live, done, order, npass, op["rowof"], op["res"], danger, pre, seat, True)

    def _free_tactics(self, act: torch.Tensor) -> None:
        """THE FREE CITIES' TACTICAL TURN (`freeCityTactics`) in the games of
        `act`: their unit pool (row S), each unit's planning reach, their
        operations' run (`_mops_run` on the row `FR`, `freeCitiesMilitary`:
        their units theirs), then Attack High and Medium
        Priority, Move to Safety, Attack Low Priority, Wander Near Camp round
        each unit's home (`freeHome`) in pool order; the rest end their
        turn."""
        dev = self.device
        B, T = self.B, self.T
        bidx = torch.arange(B, device=dev)
        k = self.S
        pre = "barb"
        seat = FREE_SEAT

        if not bool(act.count_nonzero()):
            return
        self._seat_pool_slots(k, pre, seat, act)
        self._tac_in_pass = True
        self._tac_cost_held = None
        self._tac_full_held = None
        try:
            ops_on = bool((act & (self.mops_def[:, self.FR] >= 0).any(dim=1)).any())
            op = self._seat_pass_open(pre, seat, act, full=ops_on)
            units, order, npass = op["units"], op["order"], op["npass"]
            done = torch.zeros_like(units)
            self._mops_run(self.FR, act, op, done)
            homes = self._free_homes()
            # the pass's own units (its job)
            peers = self._tac_peers(units, pre)

            def live() -> torch.Tensor:
                return units & ~done & self.barb_unit_alive & (self.barb_unit_seat == seat)

            # ATTACK HIGH and MEDIUM PRIORITY, MOVE TO SAFETY, ATTACK LOW
            # PRIORITY (the attacks where a foe stands near)
            ai = torch.where(units, torch.where(self.barb_unit_defender, _AI_DEFENDER, _AI_COMBAT), -1)
            if op["tg"] is not None:
                for kind in (3, 2):
                    self._tac_attack_units(live, done, ai, order, op["rowof"], op["res"], op["tg"], kind, peers, pre, seat)
            self._tac_move_to_safety(live, done, order, npass, op["rowof"], op["res"], op["danger"], pre, seat, False)
            if op["tg"] is not None:
                self._tac_attack_units(live, done, ai, order, op["rowof"], op["res"], op["tg"], 1, peers, pre, seat)
            for j in range(int(npass.max()) if B else 0):
                u_b = order[:, j]
                home = homes[bidx, u_b]
                ok = (j < npass) & live()[bidx, u_b] & (home >= 0)
                if not bool(ok.count_nonzero()):
                    continue
                camp = home.clamp(min=0)
                rt, rk = self._seat_reach_turns(op, u_b)
                cseat = self.tile_seat[bidx, camp]
                ccity = self.tile_city[bidx, camp]
                bound = (cseat != NO_SEAT) & (ccity != -1)
                same = (self.tile_seat == cseat.unsqueeze(1)) & (self.tile_city == ccity.unsqueeze(1))
                cand = ((rt == 1) & ~self._tac_hostile(seat) & ~self._tac_own_mil(seat)
                        & (self.pair_dist[camp].to(torch.long) <= _WANDER_CAMP_RANGE)
                        & (~bound.unsqueeze(1) | same))
                count = cand.sum(dim=1)
                pick = self._rand_range(ok & (count > 0), count)
                by_rank = torch.where(cand, rk, torch.full_like(rk, 1 << 40)).argsort(dim=1, stable=True)
                dest = torch.where(count > 0, by_rank.gather(1, pick.clamp(min=0, max=T - 1).unsqueeze(1)).squeeze(1),
                                   camp)
                self._tac_move_to(ok, u_b, dest, pre, seat, False)
                done[bidx[ok], u_b[ok]] = True
        finally:
            self._tac_in_pass = False
            self._tac_cost_held = None
            self._tac_full_held = None
        self._seat_pool_dying(k, pre, seat, act)

    def _free_homes(self) -> torch.Tensor:
        """[B, U] long — `freeHome` of each hostile-pool unit: the centre of
        the Free City that granted it, else of the nearest Free City (the
        lowest column of equals); -1 none."""
        row = self.FREE_ROW
        alive = self.city_alive[:, row]  # [B, RC]
        ctr = self.city_center[:, row]
        cid = self.city_id[:, row]
        fc = self.barb_unit_free_city  # [B, U]
        mine = alive.unsqueeze(1) & (cid.unsqueeze(1) == fc.unsqueeze(2)) & (fc >= 0).unsqueeze(2)  # [B, U, RC]
        has = mine.any(dim=2)
        own = ctr.gather(1, mine.long().argmax(dim=2))
        near = self._free_nearest_col()
        nearest = torch.where(near >= 0, ctr.gather(1, near.clamp(min=0)), torch.full_like(near, -1))
        return torch.where(has, own, nearest)
