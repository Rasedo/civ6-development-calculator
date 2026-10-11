from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .sim_research import _FX, _discounted, _fdiv, _fmul, _fx_const, _present_value

# THE CITY BUILD AI'S VALUES (cpu/core/aiPlotValue.ts, aiDistrictValue.ts,
# aiProjectValue.ts, aiCityBuild.ts's growth forecast and housing value,
# aiEconomic.ts; GameCore_XP2 AI/Value_Manager.cpp, AI/Economic.cpp) — the
# city-states' build values inside the engine's turn. 24.8 fixed point in
# int64, elementwise over the facts' tensors (any one shape); a fact is a
# method returning a tensor of that shape, or a number.
_FX_MIN = -9999 * _FX
_BUILDER = "UNIT_BUILDER"
_BASE_CHARGES = 3
_FORECAST_TURNS = 100
_YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_FAITH"]
# CITY_POPULATION_AQUEDUCT_BOOST: the Housing an Aqueduct counts beyond its row's
_AQUEDUCT_BOOST = 2
# PSEUDOYIELD_NUCLEAR_WEAPON's amounts a WMD project opens (@0xd71c24, 1000.0)
_NUCLEAR_OWN = 250
_NUCLEAR_SPREAD = 1000
_SLOT_SLUSH, _SLOT_UNITS, _SLOT_PLOTS, _SLOT_GREAT_PEOPLE = 0, 1, 2, 3
_COMBAT_PSEUDO = ("PSEUDOYIELD_UNIT_COMBAT", "PSEUDOYIELD_UNIT_NAVAL_COMBAT", "PSEUDOYIELD_UNIT_AIR_COMBAT")
_PLOTS_CAP = 150 * _FX


def _t(x, like: torch.Tensor) -> torch.Tensor:
    """a fact as a long tensor of `like`'s shape"""
    if isinstance(x, torch.Tensor):
        return x.long().expand_as(like) if x.shape != like.shape else x.long()
    return torch.full_like(like, int(x))


def _fx_float(x: float) -> int:
    """a float's 24.8 raw as the DLL converts it (`fxOfFloat`): the floor's
    whole part, the fraction's 256ths truncated"""
    import math
    w = math.floor(x)
    return w * _FX + (int((x - w) * 256) & 0xFF)


def _f32(x: float) -> float:
    """a value rounded to float32 (`Math.fround`)"""
    import struct
    return struct.unpack("f", struct.pack("f", x))[0]


def _between(a: torch.Tensor, t: torch.Tensor, h: torch.Tensor, r: int) -> torch.Tensor:
    """PV(h) - PV(t) of `a` a turn"""
    return _present_value(a, r, h) - _present_value(a, r, t)


def _withheld(surplus: torch.Tensor, f: torch.Tensor) -> torch.Tensor:
    """the Food the housing factor `f` withholds of `surplus` (raws)"""
    return torch.div(-surplus * (f - _FX), _FX, rounding_mode="floor")


class SimCityValue:
    def _cv_tables(self) -> dict:
        """the city build AI's rows and DefaultValues, built once"""
        cached = getattr(self, "_cv_cache", None)
        if cached is not None:
            return cached
        cb = self.rules.ai_city_build
        av = self.rules.ai_value
        cached = {
            "rate": _fx_const(float(av["discountPct"])),
            "horizon": int(av["horizon"]),
            "yield_def": {k: _fx_const(float(v)) for k, v in cb["yieldDefault"].items()},
            "pseudo_def": {k: _fx_const(float(v)) for k, v in cb["pseudoDefault"].items()},
            "imp": {r["type"]: r for r in cb["improvements"]},
            "feat": {r["type"]: r for r in cb["features"]},
            "res": {r["type"]: r for r in cb["resources"]},
            "dist": {r["type"]: r for r in cb["districts"]},
            "proj": {r["type"]: r for r in cb["projects"]},
            "proj_rows": list(cb["projects"]),
            "savings": list(cb["savings"]),
            "bld_rows": list(cb["buildings"]),
            "bld": {r["type"]: r for r in cb["buildings"]},
            "unit_rows": list(cb["units"]),
            "unit": {r["type"]: r for r in cb["units"]},
            "unit_index": {r["type"]: i for i, r in enumerate(cb["units"])},
            "eff": torch.tensor(cb["unitEfficiency"], dtype=torch.long),
            "engine_row": torch.tensor(cb["engineUnitRow"], dtype=torch.long),
        }
        self._cv_cache = cached
        return cached

    # -- the value primitives (aiValue.ts) --------------------------------

    def _cv_yield(self, amount: torch.Tensor, y: str, w=None) -> torch.Tensor:
        """`yieldValue` (0x7a6690): amount x DefaultValue x (1 + min(w, 9.0));
        `w` None a caller that passes no player"""
        T = self._cv_tables()
        v = _fmul(amount, T["yield_def"].get(y, _FX))
        if w is None:
            return v
        return _fmul(v, _t(w, v).clamp(max=9 * _FX) + _FX)

    def _cv_pseudo(self, amount: torch.Tensor, p: str, w=None) -> torch.Tensor:
        """`pseudoYieldValue` (0x7a60d0): amount x ((1 + w) x DefaultValue)"""
        T = self._cv_tables()
        ww = torch.zeros_like(amount) if w is None else _t(w, amount)
        return _fmul(amount, _fmul(_FX + ww, torch.full_like(amount, T["pseudo_def"].get(p, _FX))))

    # -- the growth forecast and the housing value (aiCityBuild.ts) -------

    def _cv_hfactor(self, left: torch.Tensor) -> torch.Tensor:
        """0x527ca0's growth factor of the housing left, raw"""
        half, quarter, zero = self.rules.housing_left_growth
        f = torch.zeros_like(left)
        f = torch.where(left >= zero, torch.full_like(left, _FX // 4), f)
        f = torch.where(left > quarter, torch.full_like(left, _FX // 2), f)
        return torch.where(left > half, torch.full_like(left, _FX), f)

    def _cv_needed(self, pop: torch.Tensor) -> torch.Tensor:
        """`growthFoodNeeded`, whole"""
        return self._growth_needed(pop).long()

    def _cv_forecast(self, g: dict, steps: int = 64):
        """0x5cb570, `growthForecast` over the growth facts `g` (surplus,
        housing, population, stored, multiplier: long tensors of one shape):
        per step the turn, the Food withheld, the citizens, and whether it
        stands ([..., K] each, in push order)"""
        s = g["surplus"].clone()
        pop0 = g["population"]
        factor = self._cv_hfactor(g["housing"] - pop0)
        turns, lost, pops, valid = [], [], [], []
        turns.append(torch.zeros_like(s))
        lost.append(_withheld(s, factor))
        pops.append(pop0.clone())
        valid.append(factor != _FX)
        # 0x1b6390, the turns to the next citizen: -1 with no surplus
        eff = _fmul(s, g["multiplier"])
        q = torch.div((self._cv_needed(pop0) * _FX - g["stored"]) * _FX, eff.clamp(min=1), rounding_mode="trunc")
        grow = (q >> 8) + ((q & 0xFF) != 0).long()
        turn = torch.where((s <= 0) | (eff <= 0), torch.full_like(s, -1), grow)
        pop = pop0 + 1
        live = turn < _FORECAST_TURNS
        for _ in range(steps):
            f = self._cv_hfactor(g["housing"] - pop)
            change = live & (f != factor)
            factor = torch.where(change, f, factor)
            turns.append(turn.clone())
            lost.append(_withheld(s, factor))
            pops.append(pop.clone())
            valid.append(change)
            e = torch.div(factor * s, _FX, rounding_mode="floor")
            live = live & (e > 0)
            step = torch.div(self._cv_needed(pop) * _FX * _FX, e.clamp(min=1), rounding_mode="trunc") >> 8
            turn = torch.where(live, turn + step, turn)
            s = torch.where(live, (s - 2 * _FX).clamp(min=0), s)
            pop = torch.where(live, pop + 1, pop)
            live = live & (turn < _FORECAST_TURNS)
            if not bool(live.any()):
                break
        return torch.stack(turns, -1), torch.stack(lost, -1), torch.stack(pops, -1), torch.stack(valid, -1)

    def _cv_housing_value(self, g: dict, fc, housing, t: torch.Tensor, h: torch.Tensor) -> torch.Tensor:
        """0x7a3d70, `housingValue`: `housing` more from `t` to `h` — over each
        step of the forecast twice the Food the housing factor stops
        withholding, discounted over the step"""
        T = self._cv_tables()
        r = T["rate"]
        ft, fl, fp, fv = fc
        K = ft.shape[-1]
        s = g["surplus"]
        hh = _t(housing, s)
        food = T["yield_def"].get("YIELD_FOOD", _FX)
        big = torch.full_like(s, 1 << 40)

        def amount(cpop, clost):
            return 2 * _fmul(_withheld(-s, self._cv_hfactor(g["housing"] - cpop + hh)) + clost, torch.full_like(s, food))

        def nxt(after):
            """the first standing step past `after`: its index, -1 none"""
            ok = fv & (ft > after.unsqueeze(-1))
            idx = torch.where(ok, torch.arange(K, device=s.device).expand_as(ok), torch.full_like(ft, K))
            i = idx.min(dim=-1).values
            return torch.where(i >= K, torch.full_like(i, -1), i)

        def at(x, i):
            return x.gather(-1, i.clamp(min=0).unsqueeze(-1)).squeeze(-1)

        cpop = g["population"].clone()
        clost = _withheld(s, self._cv_hfactor(g["housing"] - g["population"]))
        fetched = clost.clone()
        start = torch.full_like(s, -1)
        e = nxt(start)
        for _ in range(K + 1):
            go = (e >= 0) & (at(ft, e) < t)
            if not bool(go.any()):
                break
            cpop = torch.where(go, at(fp, e), cpop)
            clost = torch.where(go, at(fl, e), clost)
            start = torch.where(go, at(ft, e), start)
            fetched = torch.where(go, at(fl, e), fetched)
            e = torch.where(go, nxt(start), e)
        e = nxt(start)
        fetched = torch.where(e >= 0, at(fl, e), fetched)
        value = torch.zeros_like(s)
        for _ in range(K + 1):
            go = (e >= 0) & (start < h)
            if not bool(go.any()):
                break
            a = amount(cpop, clost)
            et = torch.where(e >= 0, at(ft, e), big)
            add = _present_value(a, r, torch.minimum(h, et)) - _present_value(a, r, torch.maximum(t, start))
            value = value + torch.where(go, add, torch.zeros_like(add))
            start = torch.where(go, et, start)
            cpop = torch.where(go, at(fp, e), cpop)
            clost = torch.where(go, at(fl, e), clost)
            e2 = nxt(start)
            fetched = torch.where(go & (e2 >= 0), at(fl, e2), fetched)
            e = torch.where(go, e2, e)
        a = amount(cpop, clost)
        tail = _present_value(a, r, h) - _present_value(a, r, torch.maximum(t, start))
        return value + torch.where(fetched > 0, tail, torch.zeros_like(tail))

    # -- the improvement value (aiPlotValue.ts) ---------------------------

    def _cv_at_default(self, amount: int, y: str, like: torch.Tensor) -> torch.Tensor:
        T = self._cv_tables()
        return torch.full_like(like, (amount * _FX * T["yield_def"].get(y, _FX)) >> 8)

    def _cv_build_unit(self, f, imp: dict):
        """0x7a2e20: the improvement's build unit the player builds, the
        cheapest (a unit spending no charge costs nothing); per element its
        position in the row's list, -1 none"""
        like = f.like()
        best = torch.full_like(like, -1)
        cost = torch.zeros_like(like)
        for k, (unit, consumes) in enumerate(imp["buildUnits"]):
            ok = _t(f.builds_unit(unit), like).bool()
            c = _t(f.unit_cost(unit), like) if consumes else torch.zeros_like(like)
            take = ok & ((best < 0) | (c < cost))
            best = torch.where(take, torch.full_like(best, k), best)
            cost = torch.where(take, c, cost)
        return best

    def _cv_charge_cost(self, f, unit: str, t: torch.Tensor) -> torch.Tensor:
        """a charge of the unit at the Production's DefaultValue, discounted"""
        like = f.like()
        charges = (_t(f.extra_charges(unit), like) + _BASE_CHARGES).clamp(min=1)
        per = torch.div(_t(f.unit_cost(unit), like), charges, rounding_mode="trunc") * _FX
        return _discounted(self._cv_yield(per, "YIELD_PRODUCTION"), self._cv_tables()["rate"], t)

    def _cv_feature_removal(self, f, feature: str, t: torch.Tensor, h: torch.Tensor) -> torch.Tensor:
        """0x7a3010, `featureRemovalValue`"""
        T = self._cv_tables()
        like = f.like()
        row = T["feat"].get(feature)
        if row is None or not row["removable"]:
            return torch.zeros_like(like)
        lost = torch.zeros_like(like)
        for y, a in row["yields"]:
            lost = lost + self._cv_at_default(a, y, like)
        if row["appeal"] != 0:
            add = (_fx_const(row["appeal"] * 0.5) * T["yield_def"].get("YIELD_FOOD", _FX)) >> 8
            lost = lost + _t(f.beside_housing(), like) * add
        gain = torch.zeros_like(like)
        pct = _t(f.progress_pct(), like)
        esc_rate = _t(f.escalation(), like)
        for y, a in row["removes"]:
            esc = a + torch.div((torch.div(a * esc_rate, 100, rounding_mode="trunc") - a) * pct, 100, rounding_mode="trunc")
            amt = f.speed_scaled(esc)
            gain = gain + _discounted(torch.div(amt * _FX * T["yield_def"].get(y, _FX), _FX, rounding_mode="floor"), T["rate"], t)
        return gain - self._cv_charge_cost(f, _BUILDER, t) - _between(lost, t, h, T["rate"])

    def _cv_harvest(self, f, resource: str, t: torch.Tensor, h: torch.Tensor) -> torch.Tensor:
        """0x7a37d0, `harvestValue`"""
        T = self._cv_tables()
        like = f.like()
        row = T["res"].get(resource)
        if row is None or not row["harvests"]:
            return torch.zeros_like(like)
        gain = torch.zeros_like(like)
        for y, a in row["harvests"]:
            gain = gain + _discounted(self._cv_at_default(a, y, like), T["rate"], t)
        lost = torch.zeros_like(like)
        for y, a in row["yields"]:
            lost = lost + self._cv_at_default(a, y, like)
        return gain - self._cv_charge_cost(f, _BUILDER, t) - _between(lost, t, h, T["rate"])

    def _cv_cut(self, f, t: torch.Tensor, h: torch.Tensor, floods: bool = True):
        """a flood or an eruption the AI expects before the horizon ends it
        there: the cut horizon and where it falls at or before `t`"""
        like = f.like()
        dead = torch.zeros_like(like, dtype=torch.bool)
        hz = [f.eruption_turns()]
        if floods:
            hz.insert(0, f.flood_turns())
        for hazard in hz:
            z = _t(hazard, like)
            cut = (z >= 0) & (z < h * _FX) & ~dead
            h = torch.where(cut, z >> 8, h)
            dead = dead | (cut & (h <= t))
        return h, dead

    def _cv_improvement_yields(self, f, imp: str, t: torch.Tensor, h: torch.Tensor) -> torch.Tensor:
        """0x7b1320, `improvementYieldsValue`"""
        T = self._cv_tables()
        row = T["imp"][imp]
        like = f.like()
        past = t >= h
        h, dead = self._cv_cut(f, t, h)
        v = self._cv_pseudo(torch.full_like(like, _FX), "PSEUDOYIELD_IMPROVEMENT", f.pseudo_w("PSEUDOYIELD_IMPROVEMENT"))
        for y, a in row["yields"]:
            v = v + self._cv_yield(torch.full_like(like, a * _FX), y, f.yield_w(y))
        for y in row["adjacency"]:
            v = v + self._cv_yield(_t(f.adjacency(imp, y), like) * _FX, y, f.yield_w(y))
        if row["appealYield"]:
            amt = _fmul(_t(f.appeal(), like) * _FX, torch.full_like(like, _fx_const(row["appealPct"] * 0.01)))
            v = v + self._cv_yield(amt, row["appealYield"], f.yield_w(row["appealYield"]))
        if any(not c for _, c in row["buildUnits"]):
            v = v * 3
        value = _between(v, t, h, T["rate"])
        if row["housing"] > 0:
            hv = f.housing_value(row["housing"], t, h)
            value = value + torch.div(hv * _FX, max(row["tilesRequired"], 1) * _FX, rounding_mode="trunc")
        value = torch.where(dead, torch.zeros_like(value), value)
        return torch.where(past, torch.full_like(value, _FX_MIN), value)

    def _cv_improvement(self, f, imp: str, t: torch.Tensor, h: torch.Tensor) -> torch.Tensor:
        """0x7a58f0, `improvementValue`: the improvement on the plot landing in
        `t` turns (the plot's improvement, resource and feature facts as
        type names or None — one plot's, or a batch sharing them)"""
        T = self._cv_tables()
        like = f.like()
        row = T["imp"].get(imp)
        past = t >= h
        if row is None:
            return torch.full_like(like, _FX_MIN)
        unit = self._cv_build_unit(f, row)
        none = unit < 0
        cur, res, feat = f.improvement(), f.resource(), f.feature()
        pill = _t(f.pillaged(), like).bool()
        if cur == imp:
            rep = (f.resource_value(res, 1, t, h) if res else torch.zeros_like(like)) + self._cv_improvement_yields(f, imp, t, h)
            out = torch.where(pill, rep, torch.zeros_like(rep))
        else:
            value = torch.zeros_like(like)
            if cur:
                old = (f.resource_value(res, -1, t, h) if res else torch.zeros_like(like))
                if cur in T["imp"]:
                    old = old + self._cv_improvement_yields(f, cur, t, h)
                value = value - torch.where(pill, torch.zeros_like(old), old)
            zero = torch.zeros_like(like, dtype=torch.bool)
            clears = True
            keep_res = res
            if res:
                if res in row["resources"]:
                    clears = res not in row["keepsFeature"]
                else:
                    if not T["res"].get(res, {}).get("harvests"):
                        zero = torch.ones_like(zero)
                    value = value + self._cv_harvest(f, res, t, h)
                    keep_res = None
            if feat and clears and feat not in row["features"]:
                if not T["feat"].get(feat, {}).get("removable"):
                    zero = torch.ones_like(zero)
                value = value + self._cv_feature_removal(f, feat, t, h)
            costs = torch.zeros_like(like)
            for k, (u, _c) in enumerate(row["buildUnits"]):
                costs = torch.where(unit == k, self._cv_charge_cost(f, u, t), costs)
            value = value - costs + self._cv_improvement_yields(f, imp, t, h)
            if keep_res:
                value = value + f.resource_value(keep_res, 1, t, h)
            out = torch.where(zero, torch.zeros_like(value), value)
        out = torch.where(none, torch.full_like(out, _FX_MIN), out)
        return torch.where(past, torch.full_like(out, _FX_MIN), out)

    # -- the district value (aiDistrictValue.ts) ---------------------------

    def _cv_rows_value(self, f, district: str) -> torch.Tensor:
        like = f.like()
        v = torch.zeros_like(like)
        for y in _YIELDS:
            v = v + self._cv_yield(_t(f.rows_adjacency(district, y), like) * _FX, y, f.yield_w(y))
        return v

    def _cv_district_body(self, f, district: str, t: torch.Tensor, h: torch.Tensor) -> torch.Tensor:
        """0x7aaf80, `districtBodyValue`"""
        T = self._cv_tables()
        row = T["dist"][district]
        like = f.like()
        r = T["rate"]
        bad = (t >= h) | (_t(f.lake(), like).bool() & bool(row["coast"]))
        h, dead = self._cv_cut(f, t, h, floods=not row["preventsFloods"])
        pd = self._cv_pseudo(torch.full_like(like, _FX), "PSEUDOYIELD_DISTRICT", f.pseudo_w("PSEUDOYIELD_DISTRICT"))
        v = pd.clone()
        owned = _t(f.owned(), like).bool()
        for y in _YIELDS:
            add = self._cv_yield(_t(f.district_adjacency(district, y), like) * _FX, y, f.yield_w(y))
            v = v + torch.where(owned, add, torch.zeros_like(add))
        own = self._cv_rows_value(f, district)
        best = own.clone()
        for d in f.other_districts(district):
            best = torch.maximum(best, self._cv_rows_value(f, d))
        v = v + own
        if not row["aqueduct"]:
            v = v - torch.where(best > own, best, torch.zeros_like(best))
        if row["hitPoints"] is not None:
            hp = _fx_float(_f32(row["hitPoints"] * _f32(0.02)))
            d = self._cv_pseudo(torch.full_like(like, _FX), "PSEUDOYIELD_CITY_DEFENSES")
            df = self._cv_pseudo(torch.full_like(like, _FX), "PSEUDOYIELD_CITY_DEFENSES", f.pseudo_w("PSEUDOYIELD_CITY_DEFENSES"))
            ratio = torch.div((d - df) * _FX, d, rounding_mode="trunc") + _FX
            v = v + _fmul(ratio, torch.full_like(like, hp))
        chron = _fmul(_t(f.chronology(), like) * _FX, pd)
        may = torch.ones_like(like, dtype=torch.bool) if not row["requiresPopulation"] else _t(f.district_cap(), like) > _t(f.district_count(), like)
        v = v + torch.where(may, _fmul(torch.full_like(like, _fx_const(0.5)), chron), torch.zeros_like(chron))
        here = f.district() == district
        if here:
            v = v + chron
        if row["regionalRange"] > 0:
            n = _t(f.regional_cities(district, row["regionalRange"]), like)
            mult = torch.tensor([_fx_float(_f32((k + 1) * 0.5)) for k in range(int(n.max()) + 1)], device=like.device)[n]
            v = _fmul(mult, v)
        if row["appeal"] != 0:
            add = self._cv_yield(torch.full_like(like, _fx_float(_f32(row["appeal"] * 0.5))), "YIELD_FOOD", f.yield_w("YIELD_FOOD"))
            v = v + _t(f.beside_housing(), like) * add
        lump = torch.zeros_like(like)
        dom = row["domain"]
        if dom:
            trains = _t(f.city_trains(dom), like).bool()
            anyc = _t(f.player_trains(dom), like).bool()
            pseudo = {"DOMAIN_SEA": "PSEUDOYIELD_UNIT_NAVAL_COMBAT", "DOMAIN_AIR": "PSEUDOYIELD_UNIT_AIR_COMBAT"}.get(dom)
            if pseudo:
                p = self._cv_pseudo(torch.full_like(like, 5 * _FX), pseudo, f.pseudo_w(pseudo))
                v = v + torch.where(trains, torch.zeros_like(p), torch.where(anyc, p, 2 * p))
            lump = torch.where(~trains & ~anyc, _t(f.domain_units_value(dom), like), lump)
        v = v - self._cv_yield(torch.full_like(like, row["maintenance"] * _FX), "YIELD_GOLD", f.yield_w("YIELD_GOLD"))
        for pseudo, pts in row["gpp"]:
            if pseudo:
                v = v + self._cv_pseudo(torch.full_like(like, pts * _FX), pseudo, f.pseudo_w(pseudo))
        value = _between(v, t, h, r) + lump
        housing = row["housing"] + (_AQUEDUCT_BOOST if row["aqueduct"] else 0)
        if housing > 0:
            appeal = _t(f.appeal(), like)
            band = torch.zeros_like(like)
            done = torch.zeros_like(like, dtype=torch.bool)
            for mn, ch in row["appealHousing"]:
                hit = ~done & (appeal >= mn)
                band = torch.where(hit, torch.full_like(band, ch), band)
                done = done | hit
            value = value + f.housing_value(housing + band, t, h)
        if row["preventsFloods"]:
            imp_n, dis_n = f.river_plots()
            value = value + (_t(imp_n, like) * 100 + _t(dis_n, like) * 300) * _FX
        if row["canal"]:
            value = value + _t(f.canal_trade(), like) * 100 * _FX
        projects = torch.zeros_like(like)
        space = torch.full_like(like, -1)
        for p in row["projects"]:
            pv = _fmul(_t(f.project_value(p, t, h), like), torch.full_like(like, _fx_const(0.1)))
            if f.space_race(p):
                space = torch.where(pv > 0, torch.maximum(space + 1, torch.ones_like(space)), space)
            if f.favoured(p):
                pv = _fmul(pv, torch.full_like(pv, 3 * _FX))
            projects = projects + pv.clamp(min=0)
        k = torch.ceil(space.double() * 0.5).long()
        share = (k > 0) & (not here) & (_t(f.districts_of(district, True), like) <= k)
        div = torch.div(projects * _FX, (_t(f.districts_of(district, False), like) + 1) * _FX, rounding_mode="trunc")
        value = value + torch.where(share, div, torch.zeros_like(div))
        value = torch.where(dead, torch.zeros_like(value), value)
        return torch.where(bad, torch.full_like(value, _FX_MIN), value)

    def _cv_district(self, f, district: str, t: torch.Tensor, h: torch.Tensor) -> torch.Tensor:
        """0x7a51f0, `districtValue`"""
        T = self._cv_tables()
        like = f.like()
        row = T["dist"].get(district)
        if row is None:
            return torch.full_like(like, _FX_MIN)
        r = T["rate"]
        value = torch.zeros_like(like)
        owned = _t(f.owned(), like).bool()
        price = _discounted(self._cv_yield(_t(f.purchase_cost(), like) * _FX, "YIELD_GOLD"), r, t)
        value = value - torch.where(owned, torch.zeros_like(price), price)
        zero = torch.zeros_like(like, dtype=torch.bool)
        feat, res, cur = f.feature(), f.resource(), f.improvement()
        if feat and not f.keeps_feature(district):
            if not T["feat"].get(feat, {}).get("removable"):
                zero = torch.ones_like(zero)
            value = value + self._cv_feature_removal(f, feat, t, h)
        if res:
            if not T["res"].get(res, {}).get("harvests"):
                zero = torch.ones_like(zero)
            value = value + self._cv_harvest(f, res, t, h)
        if cur:
            pill = _t(f.pillaged(), like).bool()
            old = self._cv_improvement_yields(f, cur, t, h) if cur in T["imp"] else torch.zeros_like(like)
            if res:
                old = old + f.resource_value(res, -1, t, h)
            value = value - torch.where(pill, torch.zeros_like(old), old)
        repair = (f.district() == district) & _t(f.district_pillaged(), like).bool()
        value = value + torch.where(repair & _t(f.is_city(), like).bool(), torch.full_like(value, 12500 * _FX), torch.zeros_like(value))
        value = value + self._cv_district_body(f, district, t, h)
        value = torch.where(repair, value * 2, value)
        value = torch.where(zero, torch.zeros_like(value), value)
        return torch.where(t > h, torch.full_like(value, _FX_MIN), value)

    # -- the project value (aiProjectValue.ts) -----------------------------

    def _cv_project(self, f, project: str, t: torch.Tensor, h: torch.Tensor) -> torch.Tensor:
        """0x7b28c0, `projectValue`"""
        T = self._cv_tables()
        like = f.like()
        row = T["proj"].get(project)
        if row is None:
            return torch.full_like(like, _FX_MIN)
        r = T["rate"]
        maxed = torch.zeros_like(like, dtype=torch.bool)
        if row["maxPlayerInstances"] >= 0:
            maxed = _t(f.advanced(project), like) >= row["maxPlayerInstances"]
        v = torch.zeros_like(like)
        for nxt in row["unlocks"]:
            v = v + torch.maximum(self._cv_project(f, nxt, t + _t(f.build_turns(nxt), like), h), torch.full_like(v, 200 * _FX))
            if T["proj"].get(nxt, {}).get("wmd"):
                w = f.pseudo_w("PSEUDOYIELD_NUCLEAR_WEAPON")
                v = v + self._cv_pseudo(torch.full_like(like, _NUCLEAR_OWN * _FX), "PSEUDOYIELD_NUCLEAR_WEAPON", w)
                v = v + self._cv_pseudo(torch.full_like(like, _NUCLEAR_SPREAD * _FX), "PSEUDOYIELD_NUCLEAR_WEAPON", w) \
                    - self._cv_pseudo(torch.full_like(like, _NUCLEAR_SPREAD * _FX), "PSEUDOYIELD_NUCLEAR_WEAPON")
        if row["spaceRace"]:
            st = _t(f.space_race_standing(), like)
            v = v + self._cv_pseudo(st * st * _FX, "PSEUDOYIELD_SPACE_RACE", f.pseudo_w("PSEUDOYIELD_SPACE_RACE"))
            for p in T["proj_rows"]:
                if p["spaceRace"]:
                    done = _t(f.advanced(p["type"]), like) > 0
                    v = v + done * self._cv_pseudo(torch.full_like(like, _FX), "PSEUDOYIELD_SPACE_RACE", f.pseudo_w("PSEUDOYIELD_SPACE_RACE"))
        pct = _t(f.progress_pct(), like)
        for pseudo, pts, param in row["gpp"]:
            if not pseudo:
                continue
            esc = pts + torch.div((pts * param // 100 - pts) * pct, 100, rounding_mode="trunc")
            v = v + 4 * self._cv_pseudo(esc * _FX, pseudo, f.pseudo_w(pseudo))
        if row["outerDefenseRepair"]:
            rep = _t(f.defence_repairs(), like)
            v = v + torch.where(rep > 0, 10 * rep * _t(f.population(), like) * _t(f.districts(), like) * _FX, torch.zeros_like(v))
        value = _discounted(v, r, t)
        if row["identityPerCitizen"] != 0:
            a = torch.trunc((_t(f.population(), like).float() * row["identityPerCitizen"]).to(torch.float32).double() * _FX).long()
            add = _present_value(a, r, h) - _present_value(a, r, t)
            value = value + _t(f.loyalty_falling(), like) * add
        if row["createBuilding"]:
            value = value + _t(f.building_value(row["createBuilding"], t, h), like)
        held = torch.zeros_like(like, dtype=torch.bool)
        for b in row["consumes"]:
            has = _t(f.has_building(b), like).bool()
            value = value - torch.where(has, _t(f.building_value(b, t, h), like), torch.zeros_like(value))
            held = held | has
        if row["modifiers"]:
            value = value + _t(f.modifiers_value(project, t, h), like)
        out = torch.where((len(row["consumes"]) > 0) & ~held, torch.full_like(value, _FX_MIN), value)
        return torch.where((t >= h) | maxed, torch.full_like(out, _FX_MIN), out)

    def _cv_project_table(self, f) -> list:
        """THE PROJECTS TABLE of the city centre (0x5ce970's gates): per
        Projects row (database order) the value at its build turns, x1.5 a
        favoured one, FX(-9999) where the analysis does not value it"""
        T = self._cv_tables()
        like = f.like()
        out = []
        for p in T["proj_rows"]:
            pt = p["type"]
            ok = torch.ones_like(like, dtype=torch.bool)
            if p["maxPlayerInstances"] >= 0:
                ok = ok & (_t(f.advanced(pt), like) < p["maxPlayerInstances"]) & (_t(f.producing_elsewhere(pt), like) < p["maxPlayerInstances"])
            if p["unlocksFromEffect"]:
                ok = ok & _t(f.unlocked_by_effect(pt), like).bool()
            for need, fact in ((p["civic"], f.has_civic), (p["tech"], f.has_tech), (p["district"], f.has_district),
                               (p["requiredBuilding"], f.has_building)):
                if need:
                    ok = ok & _t(fact(need), like).bool()
            for q in p["prereqs"]:
                ok = ok & (_t(f.advanced(q), like) > 0)
            v = self._cv_project(f, pt, _t(f.build_turns(pt), like), torch.full_like(like, f.horizon()))
            if f.favoured(pt):
                v = _fmul(v, torch.full_like(v, _fx_const(1.5)))
            out.append(torch.where(ok, v, torch.full_like(v, _FX_MIN)))
        return out

    # -- the savings and the purchases (aiEconomic.ts) ---------------------

    def _cv_savings_turn(self, savings: torch.Tensor, balance: torch.Tensor, treasury: torch.Tensor,
                         class_available: torch.Tensor):
        """0x687bf0, `savingsTurn` ([..., 4] slots, [...] balance, treasury
        raw and whether a Great Person class is available): the change shared
        by the DefaultSavings weights, a slot below 0 cleared, PLOTS held at
        150 with the excess to the SLUSH_FUND, GREAT_PEOPLE folded into it
        with no class left"""
        w = self._cv_tables()["savings"]
        tot = sum(w)
        share = torch.tensor([int(x / tot * _FX) for x in w], dtype=torch.long, device=savings.device)
        delta = (treasury - balance).unsqueeze(-1)
        s = (savings + ((delta * share) >> 8)).clamp(min=0)
        over = (s[..., _SLOT_PLOTS] - _PLOTS_CAP).clamp(min=0)
        s[..., _SLOT_SLUSH] += over
        s[..., _SLOT_PLOTS] -= over
        fold = torch.where(class_available.bool(), torch.zeros_like(over), s[..., _SLOT_GREAT_PEOPLE])
        s[..., _SLOT_SLUSH] += fold
        s[..., _SLOT_GREAT_PEOPLE] -= fold
        return s, treasury.clone()

    def _cv_try_purchase(self, savings: torch.Tensor, balance: torch.Tensor, cost: torch.Tensor,
                         threat: torch.Tensor, can: torch.Tensor):
        """0x68be60, `tryPurchaseUnits` in one city: the savings meeting the
        price (UNITS and SLUSH together above it, UNITS above half or SLUSH
        above twice it) or a threatened city's balance at or above it; the
        spend; whether it bought"""
        c = cost * _FX
        s0, s1 = savings[..., _SLOT_SLUSH], savings[..., _SLOT_UNITS]
        threatened = (threat & 0xFF) != 0
        saved = (s0 + s1 > c) & ((s1 > (c >> 1)) | (s0 > 2 * c))
        buy = (cost >= 0) & can & (saved | (threatened & (balance >= c)))
        plain = buy & ~threatened
        out = savings.clone()
        out[..., _SLOT_SLUSH] = torch.where(plain, s0 - (c - s1).clamp(min=0), out[..., _SLOT_SLUSH])
        out[..., _SLOT_UNITS] = torch.where(plain, (s1 - c).clamp(min=0), out[..., _SLOT_UNITS])
        left = torch.where(buy & threatened, c, torch.zeros_like(c))
        for i in range(out.shape[-1]):
            take = torch.minimum(left, out[..., i]).clamp(min=0)
            out[..., i] = out[..., i] - take
            left = left - take
        return out, torch.where(buy, balance - c, balance), buy

    # -- the military AI's unit production table (aiUnitProduction.ts) ------

    def _cv_unit_production(self, version: torch.Tensor, obsolete: torch.Tensor, owned: torch.Tensor,
                            known: torch.Tensor):
        """0x7989e0, `unitProductionTable` ([..., NU] each, AI_UNITS' order):
        per unit its value and whether it is an entry; an entry's value N
        over the sum of its efficiencies against the known combat units
        (1.0 with none known), x1.25 a civilization's unique unit"""
        T = self._cv_tables()
        rows = T["unit_rows"]
        dev = known.device
        entry = version & ~(obsolete & (owned <= 0))
        combat = torch.tensor([r["combat"] != 0 and (not r["pseudo"] or r["pseudo"] in _COMBAT_PSEUDO) for r in rows],
                              dtype=torch.bool, device=dev)
        n = torch.where(combat & ~obsolete & (known > 0), known, torch.zeros_like(known))
        total = n.sum(-1, keepdim=True)
        sums = n @ T["eff"].to(dev)
        v = torch.where(sums > 0, torch.div(total * _FX * _FX, sums.clamp(min=1), rounding_mode="trunc"), torch.zeros_like(sums))
        v = torch.where(total == 0, torch.full_like(v, _FX), v)
        unique = torch.tensor([bool(r["trait"]) for r in rows], dtype=torch.bool, device=dev)
        v = torch.where(unique, _fmul(v, torch.full_like(v, _fx_const(1.25))), v)
        return torch.where(entry, v, torch.zeros_like(v)), entry

    # -- the unit value (aiCityBuild.ts) -----------------------------------

    def _cv_unit_turns(self, f, unit: str) -> torch.Tensor:
        """0x5ce970's turns for a unit"""
        u = self._cv_tables()["unit"][unit]
        like = f.like()
        t = torch.zeros_like(like)
        if u["tech"]:
            t = torch.maximum(t, _t(f.tech_turns(u["tech"]), like) + 5)
        if u["civic"]:
            t = torch.maximum(t, _t(f.civic_turns(u["civic"]), like) + 5)
        if not u["mustPurchase"]:
            t = t + _t(f.build_turns(unit), like)
            cur = f.current()
            if cur is not None and cur != unit:
                t = t + 10
        return t

    def _cv_unit_exit(self, f, unit: str, t: torch.Tensor, h: torch.Tensor) -> torch.Tensor:
        """`unitValueExit`: where FX(-9999) applies"""
        like = f.like()
        ex = (t >= h) | torch.full_like(like, int(f.unit_version(unit) != unit), dtype=torch.bool)
        if not f.full_civ() and not f.tribe():
            ex = ex | (~_t(f.at_war(), like).bool() & (_t(f.unit_count(), like) > 5))
        if unit == "UNIT_SPY" and not f.full_civ():
            ex = ex | True
        return ex

    def _cv_unit(self, f, unit: str, t: torch.Tensor, h: torch.Tensor):
        """0x7b62c0, `unitValue`: the value and whether it is read (TS null
        where not)"""
        T = self._cv_tables()
        u = T["unit"][unit]
        like = f.like()
        r = T["rate"]
        ex = self._cv_unit_exit(f, unit, t, h)
        read = torch.ones_like(like, dtype=torch.bool)
        pseudo = u["pseudo"] or "PSEUDOYIELD_UNIT_COMBAT"
        if pseudo in _COMBAT_PSEUDO:
            if pseudo == "PSEUDOYIELD_UNIT_AIR_COMBAT":
                read = read & False
            val, obs = f.unit_production(unit)
            v = torch.where(_t(obs, like).bool(), _fmul(_t(val, like), torch.full_like(like, 3 * _FX)), _t(val, like))
            if u["combat"] > f.trade_route_capacity():
                v = v + _fx_const(f.combat_count() * 0.5)
        elif pseudo == "PSEUDOYIELD_UNIT_TRADE":
            tv = f.trader_value(t, h)
            if tv is None:
                read = read & False
                v = torch.zeros_like(like)
            else:
                v = self._cv_pseudo(_t(tv, like), pseudo, f.pseudo_w(pseudo))
        elif pseudo in ("PSEUDOYIELD_UNIT_EXPLORER", "PSEUDOYIELD_UNIT_SETTLER", "PSEUDOYIELD_UNIT_SPY"):
            if f.full_civ():
                read = read & False
            v = torch.full_like(like, _FX)
        else:
            read = read & False
            v = torch.zeros_like(like)
        if u["wmd"] or u["maintenanceResource"] or u["parkCharges"] > 0:
            read = read & False
        v = _fmul(v, (_t(f.extra_copies(unit), like) + 1) * _FX)
        v = _fmul(v, _t(f.promotion_weight(u["promotionClass"]), like))
        noaccess = torch.zeros_like(like, dtype=torch.bool)
        if u["resource"]:
            noaccess = ~_t(f.resource_access(u["resource"]), like).bool()
        v = self._cv_pseudo(v, pseudo, f.pseudo_w(pseudo))
        if f.handicap() < 3:
            v = v - self._cv_yield(torch.full_like(like, max(0, u["maintenance"]) * _FX), "YIELD_GOLD")
        value = _present_value(v, r, h) - _present_value(v, r, t)
        value = torch.where(noaccess, torch.zeros_like(value), value)
        trains = _t(f.trains_domain(u["domain"]), like).bool()
        value = torch.where(trains, value, torch.full_like(value, _FX_MIN))
        value = torch.where(ex, torch.full_like(value, _FX_MIN), value)
        read = read | ex | ~trains
        return value, read

    def _cv_unit_table(self, f) -> list:
        """THE UNITS TABLE of the city centre: per Units row (value, read)"""
        out = []
        for u in self._cv_tables()["unit_rows"]:
            t = self._cv_unit_turns(f, u["type"])
            v, read = self._cv_unit(f, u["type"], t, torch.full_like(t, f.horizon()))
            neg = t < 0
            out.append((torch.where(neg, torch.full_like(v, _FX_MIN), v), read | neg))
        return out

    # -- the building value (aiCityBuild.ts) -------------------------------

    def _cv_refused(self, f, b: dict) -> torch.Tensor:
        """`refused`: what CanConstruct refuses outright"""
        like = f.like()
        no = _t(f.has_building(b["type"]), like).bool()
        for x in b["exclusive"]:
            no = no | _t(f.has_building(x), like).bool()
        fixed = (b["capital"] and not f.capital()) or b["governmentTier"] > f.government_tier() \
            or (b["religion"] and f.worship() != b["type"]) or (b["adjacentRiver"] and not f.riverside()) \
            or f.ground_refuses(b["type"])
        return no | bool(fixed)

    def _cv_turns_over(self, f, b: dict) -> torch.Tensor:
        like = f.like()
        return torch.maximum(_t(f.tech_turns(b["tech"]), like), _t(f.civic_turns(b["civic"]), like))

    def _cv_building_turns(self, f, b: dict) -> torch.Tensor:
        """0x5ce970's turns for a building at the city centre"""
        T = self._cv_tables()
        like = f.like()
        t = self._cv_turns_over(f, b)
        cur = f.current()
        if b["district"]:
            lack = ~_t(f.has_district(b["district"]), like).bool()
            add = _t(f.build_turns(b["district"]), like) + (10 if cur != b["district"] else 0)
            t = t + torch.where(lack, add, torch.zeros_like(add))
        t = t + _t(f.build_turns(b["type"]), like)
        if cur is not None and cur != b["type"]:
            t = t + 10
        for p in b["prereqs"]:
            has = _t(f.has_building(p), like).bool()
            add = self._cv_turns_over(f, T["bld"][p]) + _t(f.build_turns(p), like)
            t = t + torch.where(has, torch.zeros_like(add), add)
        return t

    def _cv_constructible(self, f, b: dict) -> torch.Tensor:
        """`constructibleNow`"""
        like = f.like()
        ok = ~self._cv_refused(f, b) & (_t(f.tech_turns(b["tech"]), like) == 0) & (_t(f.civic_turns(b["civic"]), like) == 0)
        if b["district"]:
            ok = ok & _t(f.has_district(b["district"]), like).bool()
        if b["prereqs"]:
            anyp = torch.zeros_like(ok)
            for p in b["prereqs"]:
                anyp = anyp | _t(f.has_building(p), like).bool()
            ok = ok & anyp
        return ok

    def _cv_building_per_turn(self, f, b: dict) -> torch.Tensor:
        """`buildingPerTurn` (0x7a7590's v before its PV)"""
        T = self._cv_tables()
        like = f.like()
        v = torch.zeros_like(like)
        for y, amt in b["yields"]:
            pct = _t(f.yield_pct(y), like)
            city = torch.tensor([_fx_float(_f32(int(p) * _f32(0.01) + 1)) for p in pct.reshape(-1).tolist()],
                                dtype=torch.long, device=like.device).reshape(pct.shape)
            v = v + self._cv_yield(_fmul(torch.full_like(like, amt * _FX), city), y, f.yield_w(y))
        v = v + torch.where(self._cv_constructible(f, b), _t(f.era(), like) * _FX, torch.zeros_like(v))
        for pseudo, pts in b["gpp"]:
            if pseudo:
                v = v + self._cv_pseudo(torch.full_like(like, pts * _FX), pseudo, f.pseudo_w(pseudo))
        if b["outerDefenseHitPoints"]:
            d = torch.zeros_like(like)
            d = d + (_t(f.district_count(), like) >= 2) * _FX
            if f.capital():
                d = d + 2 * _FX
            d = d + _t(f.has_wonder(), like) * _FX
            d = d + (torch.div(_t(f.population(), like), 5, rounding_mode="trunc") + 1) * _FX
            d = d + _t(f.at_war(), like) * 2 * _FX
            v = v + d
        v = v + b["outerDefenseStrength"] * _FX
        for g in b["greatWorks"]:
            amt = (g["n"] * _FX * 0x2300) // 25600
            best = torch.zeros_like(like)
            for p in g["pseudo"]:
                if p:
                    best = torch.maximum(best, self._cv_pseudo(torch.full_like(like, amt), p, f.pseudo_w(p)))
            v = v + best
        depth = 0
        rr = b
        while rr["prereqs"]:
            depth += 1
            rr = T["bld"][rr["prereqs"][0]]
        v = _fmul(v, torch.full_like(v, _FX + depth * 2 * _FX))
        return v - self._cv_yield(torch.full_like(like, b["maintenance"] * _FX), "YIELD_GOLD", f.yield_w("YIELD_GOLD"))

    def _cv_amenity_per_turn(self, f, balance: torch.Tensor, yields: dict) -> torch.Tensor:
        """`amenityPerTurn` (0x79f7c0's turn): one Amenity more in a city"""
        tiers = self.rules.amenity_tiers
        n = len(tiers)

        def tier(bal):
            idx = torch.full_like(bal, n - 1)
            for i in range(n - 1, -1, -1):
                idx = torch.where(bal >= tiers[i][0], torch.full_like(idx, i), idx)
            return idx

        def pct(bal):
            yf = torch.tensor([round((t[2] - 1) * 100) for t in tiers], dtype=torch.long, device=bal.device)
            return yf[tier(bal)]

        before = n - 1 - tier(balance)
        after = n - 1 - tier(balance + 1)
        w = f.pseudo_w("PSEUDOYIELD_HAPPINESS")
        same = before == after
        one = self._cv_pseudo(torch.full_like(balance, _FX), "PSEUDOYIELD_HAPPINESS", w)
        v = self._cv_pseudo((after - before) * _FX, "PSEUDOYIELD_HAPPINESS", w)
        pb, pa = pct(balance), pct(balance + 1)
        ratio = torch.div((pa + 100) * _FX * _FX, ((pb + 100) * _FX).clamp(min=1), rounding_mode="trunc") - _FX
        for y, amount in yields.items():
            if y == "YIELD_FOOD":
                continue
            amt = torch.floor(torch.as_tensor(amount, dtype=torch.float64, device=balance.device) * _FX + 0.5).long()
            add = self._cv_yield(_fmul(amt.expand_as(ratio), ratio), y, f.yield_w(y))
            v = v + torch.where(pb != -100, add, torch.zeros_like(add))
        return torch.where(same, one, v.clamp(min=_FX))

    def _cv_building(self, f, building: str, t: torch.Tensor, h: torch.Tensor) -> torch.Tensor:
        """0x7a7590, `buildingValue`"""
        T = self._cv_tables()
        b = T["bld"][building]
        r = T["rate"]
        like = f.like()
        v = self._cv_building_per_turn(f, b)
        value = _present_value(v, r, h) - _present_value(v, r, t)
        if b["entertainment"] > 0:
            cities = [f.amenity()] if b["regionalRange"] <= 1 else f.regional_amenities(b["regionalRange"])
            e = torch.zeros_like(like)
            for bal, ys in cities:
                a = self._cv_amenity_per_turn(f, _t(bal, like), ys)
                e = e + torch.where(t == h, _discounted(a, r, t), _present_value(a, r, h) - _present_value(a, r, t))
            value = value + (e if b["regionalRange"] <= 1 else e.clamp(max=50 * _FX))
        for u in b["units"]:
            if u == "UNIT_ARCHAEOLOGIST":
                continue
            uv, read = self._cv_unit(f, u, t, h)
            ex = self._cv_unit_exit(f, u, t, h)
            value = value + torch.where(read, uv, torch.where(ex, torch.full_like(uv, _FX_MIN), torch.zeros_like(uv)))
        if b["housing"] > 0:
            value = value + _t(f.housing_value(b["housing"], t, h), like)
        if b["modifiers"]:
            value = value + _t(f.modifiers_value(building, t, h), like)
        return torch.where(t >= h, torch.full_like(value, _FX_MIN), value)

    def _cv_building_table(self, f) -> list:
        """THE BUILDINGS TABLE of the city centre"""
        out = []
        like = f.like()
        for b in self._cv_tables()["bld_rows"]:
            if b["wonder"] or b["placement"] or f.version(b["type"]) != b["type"]:
                out.append(torch.full_like(like, _FX_MIN))
                continue
            no = self._cv_refused(f, b)
            t = self._cv_building_turns(f, b)
            v = self._cv_building(f, b["type"], t, torch.full_like(t, f.horizon()))
            out.append(torch.where(no | (t < 0), torch.full_like(v, _FX_MIN), v))
        return out

    # -- the Default Specialization pick (aiCityBuild.ts) ------------------

    def _cv_pick(self, buildings: list, units: list, projects: list, p):
        """0x5d4d70, `defaultSpecialization` over the tables (lists of [...]
        tensors, database order) and the pick facts `p`: per element the
        kind (0 building, 1 unit, 2 project, -1 none), the row, the value"""
        T = self._cv_tables()
        like = buildings[0]
        defense = _t(p.defense(), like).bool()
        b_idx = torch.full_like(like, -1)
        b_val = torch.full_like(like, _FX_MIN)
        for k, b in enumerate(T["bld_rows"]):
            ok = ~_t(p.building_held(b["type"]), like).bool() & _t(p.can_construct(b["type"]), like).bool()
            if not (b["defenseModifier"] > 0 or b["outerDefenseStrength"] > 0):
                ok = ok & ~defense
            v = buildings[k]
            fav = _t(p.favored(b["type"]), like)
            v = torch.where(fav == -1, _fmul(v, torch.full_like(v, _fx_const(0.5))), torch.where(fav == 1, _fmul(v, torch.full_like(v, 2 * _FX)), v))
            take = ok & (v > b_val)
            b_val = torch.where(take, v, b_val)
            b_idx = torch.where(take, torch.full_like(b_idx, k), b_idx)
        u_idx = torch.full_like(like, -1)
        u_val = torch.full_like(like, _FX_MIN)
        for k, u in enumerate(T["unit_rows"]):
            if u["foundCity"] or u["buildCharges"] > 0 or u["mustPurchase"]:
                continue
            ok = _t(p.can_train(u["type"]), like).bool()
            if u["combat"] == 0 or u["recon"]:
                ok = ok & ~defense
            take = ok & (units[k] > u_val)
            u_val = torch.where(take, units[k], u_val)
            u_idx = torch.where(take, torch.full_like(u_idx, k), u_idx)
        p_idx = torch.full_like(like, -1)
        p_val = torch.where(defense, torch.zeros_like(like), torch.full_like(like, _FX_MIN))
        for k, pr in enumerate(T["proj_rows"]):
            take = ~defense & _t(p.can_produce(pr["type"]), like).bool() & (projects[k] > p_val)
            p_val = torch.where(take, projects[k], p_val)
            p_idx = torch.where(take, torch.full_like(p_idx, k), p_idx)
        kind = torch.full_like(like, -1)
        row = torch.full_like(like, -1)
        val = torch.full_like(like, _FX_MIN)
        is_p = p_idx >= 0
        kind, row, val = torch.where(is_p, 2, kind), torch.where(is_p, p_idx, row), torch.where(is_p, p_val, val)
        is_u = (u_idx >= 0) & (u_val >= p_val)
        kind, row, val = torch.where(is_u, 1, kind), torch.where(is_u, u_idx, row), torch.where(is_u, u_val, val)
        is_b = (b_idx >= 0) & (b_val >= u_val) & (b_val >= p_val)
        kind, row, val = torch.where(is_b, 0, kind), torch.where(is_b, b_idx, row), torch.where(is_b, b_val, val)
        return kind, row, val

    # -- the military AI's Combat Desire (aiMilitary.ts) ---------------------

    def _cv_combat_desire(self, owner: torch.Tensor, strength: torch.Tensor, counted: torch.Tensor, best: torch.Tensor,
                          cities: torch.Tensor, players: list, self_seat: int, queued: torch.Tensor,
                          war_footing: torch.Tensor, threatened: torch.Tensor, standing: torch.Tensor):
        """0x71fb80, `combatDesire`: the records ([..., K]: their owner,
        their unit's max(Combat, RangedCombat), whether each is in an area of
        the player's and seen within two turns), B, the cities, the players
        in the game's order (seat, at war [...], tribe, flagged [...]), the
        units in training's strength summed where above B - 20, the war
        footing, a threatened city, the standing army's value: (regional,
        enemy, other, desire raw)"""
        f005, f0025 = _f32(0.05), _f32(0.025)
        ok = counted & (strength + 20 > best.unsqueeze(-1))
        floor = torch.full_like(best, _fx_const(-0.5))
        regional = torch.zeros_like(best)
        enemy = torch.zeros_like(best)
        other = torch.zeros_like(best)
        for seat, war, tribe, flagged in players:
            sp = torch.where(ok & (owner == seat), strength, torch.zeros_like(strength)).sum(-1)
            war = _t(war, best).bool()
            if seat == self_seat:
                regional = torch.where(war, regional, sp + queued)
            if not tribe:
                floor = floor + war * _fx_const(0.5)
            enemy = torch.where(war, torch.maximum(enemy, sp), enemy)
            if seat != self_seat:
                floor = floor + (~war & _t(flagged, best).bool()) * _fx_const(0.25)
                other = torch.where(~war, torch.maximum(other, sp), other)

        def fx_float(x: torch.Tensor) -> torch.Tensor:
            f = x.to(torch.float32)
            fl = torch.floor(f)
            frac = ((f - fl).to(torch.float32) * 256).to(torch.float32)
            return fl.long() * _FX + torch.trunc(frac).long()

        target = cities * best
        w = torch.zeros_like(best)
        a = regional < enemy
        w = torch.where(a, fx_float((enemy - regional).to(torch.float32) * f005), w)
        b = ~a & (regional < target)
        w = torch.where(b, torch.div(target - regional, best.clamp(min=1), rounding_mode="trunc") * _FX, w)
        c = ~a & ~b & (regional - 20 > enemy)
        up = regional + 60 < other
        x = torch.where(up, other - regional - 60, enemy - torch.maximum(other - 60, regional))
        cap = torch.where(up, torch.full_like(x, 2), torch.full_like(x, 3)).to(torch.float32)
        vv = (x.to(torch.float32) * f0025).to(torch.float32)
        w = torch.where(c, fx_float(torch.where(cap <= vv, cap, vv)), w)
        w = torch.where(w < -floor, torch.zeros_like(w), torch.maximum(w, floor))
        calm = ~_t(war_footing, best).bool() & ~_t(threatened, best).bool()
        w = torch.where(calm, w.clamp(max=2 * _FX), w)
        return regional, enemy, other, w + _t(standing, best)

    def _cv_known(self, s: int) -> torch.Tensor:
        """`minorKnownUnits`: minor `s`'s knowledge base's army records by
        AI_UNITS row ([B, NU_ai]; a record of an engine unit with no row not
        counted)"""
        T = self._cv_tables()
        slot = self.citystate_kb_slot[:, s]
        typ = self.citystate_kb_type[:, s].long()
        rows = T["engine_row"].to(typ.device)
        row = torch.where(typ >= 0, rows[typ.clamp(min=0)], torch.full_like(typ, -1))
        live = (slot != -2) & (row >= 0)
        out = torch.zeros(slot.shape[0], len(T["unit_rows"]) + 1, dtype=torch.long, device=typ.device)
        out.scatter_add_(1, torch.where(live, row, torch.full_like(row, out.shape[1] - 1)), live.long())
        return out[:, :-1]
