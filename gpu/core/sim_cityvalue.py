from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .sim_research import _FX, _discounted, _fmul, _fx_const, _fx_const_t, _present_value, _turns_at

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


def _engine_rows(rows: list, engine: list, n: int) -> torch.Tensor:
    """[n] per engine index the AI row naming it, a row no civilization
    owns before one that does; -1 none"""
    out = [-1] * max(n, 1)
    for trait in (False, True):
        for k, (r, e) in enumerate(zip(rows, engine)):
            if 0 <= e < n and out[e] < 0 and bool(r.get("trait")) == trait:
                out[e] = k
    return torch.tensor(out, dtype=torch.long)


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
            "reads": {k: set(v) for k, v in cb["modifierReads"].items()},
            "engine": cb["engineIndex"],
            "promo_minor": {k: int(v) for k, v in cb["minorPromotionWeights"].items()},
            "minor_dverdict": torch.tensor(cb["minorDistrictVerdict"], dtype=torch.long),
            "promo_free": {k: int(v) for k, v in cb["freePromotionWeights"].items()},
            "default_handicap": int(cb["defaultHandicap"]),
            "plot_names": cb["plotNames"],
            # per engine district its install type (the row no civilization owns)
            "dist_name": dict(reversed([(e, r["type"]) for r, e in zip(cb["districts"], cb["engineIndex"]["district"])
                                        if e >= 0 and not r["trait"]])),
            # per engine building and district its AI row (the row no
            # civilization owns first), -1 none
            "building_row": _engine_rows(cb["buildings"], cb["engineIndex"]["building"], len(self.rules.b_cost)),
            "district_row": _engine_rows(cb["districts"], cb["engineIndex"]["district"], len(self.rules.districts)),
        }
        self._cv_cache = cached
        # the rows the tables value (a civilization's own building and a wonder
        # value FX(-9999) before their modifiers)
        rows = [b for b in cb["buildings"] if not b["trait"] and not b["wonder"]] + list(cb["projects"])
        for row in rows:
            for m in row["modifiers"]:
                self._cv_check_read(m, cached["reads"])
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
        there: the cut horizon and where it falls at or before `t`; a
        hazard's raw -1 reads none (a flood no named river holds is -1.0,
        raw -256, and cuts)"""
        like = f.like()
        dead = torch.zeros_like(like, dtype=torch.bool)
        hz = [f.eruption_turns()]
        if floods:
            hz.insert(0, f.flood_turns())
        for hazard in hz:
            z = _t(hazard, like)
            cut = (z != -1) & (z < h * _FX) & ~dead
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
        cur, res, feat = f.plot_improvement(), f.resource(), f.feature()
        pill = _t(f.plot_pillaged(), like).bool()
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
        """a district's per-turn value from its adjacency rows, once per facts
        holding a memo (`rows_memo`) and district"""
        memo = getattr(f, "rows_memo", None)
        if memo is not None and district in memo:
            return memo[district]
        like = f.like()
        v = torch.zeros_like(like)
        for y in _YIELDS:
            v = v + self._cv_yield(_t(f.rows_adjacency(district, y), like) * _FX, y, f.yield_w(y))
        if memo is not None:
            memo[district] = v
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
            # a name, or (name, the elements it stands for)
            if isinstance(d, tuple):
                best = torch.where(d[1], torch.maximum(best, self._cv_rows_value(f, d[0])), best)
            else:
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
        here = f.plot_district() == district
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
        feat, res, cur = f.feature(), f.resource(), f.plot_improvement()
        if feat and not f.keeps_feature(district):
            if not T["feat"].get(feat, {}).get("removable"):
                zero = torch.ones_like(zero)
            value = value + self._cv_feature_removal(f, feat, t, h)
        if res:
            if not T["res"].get(res, {}).get("harvests"):
                zero = torch.ones_like(zero)
            value = value + self._cv_harvest(f, res, t, h)
        if cur:
            pill = _t(f.plot_pillaged(), like).bool()
            old = self._cv_improvement_yields(f, cur, t, h) if cur in T["imp"] else torch.zeros_like(like)
            if res:
                old = old + f.resource_value(res, -1, t, h)
            value = value - torch.where(pill, torch.zeros_like(old), old)
        repair = (f.plot_district() == district) & _t(f.plot_district_pillaged(), like).bool()
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
            value = value + self._cv_modifiers(f, row["modifiers"], t, h)
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
            v = self._cv_project(f, pt, _t(f.build_turns(pt), like), torch.full_like(like, f.value_horizon()))
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
            # +10 while the city produces something else
            t = t + 10 * (_t(f.producing(), like).bool() & ~_t(f.current_is(unit), like).bool()).long()
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
            v = v + (u["combat"] > _t(f.trade_route_capacity(), like)).long() * _fx_const(f.combat_count() * 0.5)
        elif pseudo == "PSEUDOYIELD_UNIT_TRADE":
            tv, tv_read = self._cv_trader_value(f, 0, t, h)
            read = read & tv_read
            v = self._cv_pseudo(tv, pseudo, f.pseudo_w(pseudo))
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

    def _cv_trader_value(self, f, extra: int, t: torch.Tensor, h: torch.Tensor):
        """`traderValue`: (value, read) — 0 where the Traders fill the
        capacity plus `extra`; else the trade knowledge's value over the
        next 30 turns (to the horizon) x4, not read without that knowledge"""
        like = f.like()
        full = _t(f.traders(), like) >= _t(f.trade_capacity(), like) + extra
        k = f.trade_knowledge()
        if k is None:
            return torch.zeros_like(like), full
        r = self._cv_tables()["rate"]
        kk = _t(k, like)
        end = torch.minimum(t + 30, h)
        v = torch.where(t == end, _discounted(kk, r, t), _present_value(kk, r, end) - _present_value(kk, r, t))
        return torch.where(full, torch.zeros_like(v), v * 4), torch.ones_like(full)

    def _cv_unit_table(self, f) -> list:
        """THE UNITS TABLE of the city centre: per Units row (value, read)"""
        out = []
        like = f.like()
        hz = f.value_horizon()
        for u in self._cv_tables()["unit_rows"]:
            # a unit not the player's own version, or landing past the
            # horizon, values FX(-9999) whatever the rest reads
            if f.unit_version(u["type"]) != u["type"]:
                out.append((torch.full_like(like, _FX_MIN), torch.ones_like(like, dtype=torch.bool)))
                continue
            t = self._cv_unit_turns(f, u["type"])
            if bool(((t >= hz) | (t < 0)).all()):
                out.append((torch.full_like(t, _FX_MIN), torch.ones_like(t, dtype=torch.bool)))
                continue
            v, read = self._cv_unit(f, u["type"], t, torch.full_like(t, hz))
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
        if b["capital"]:
            no = no | ~_t(f.capital(), like).bool()
        no = no | (b["governmentTier"] > _t(f.government_tier(), like))
        if b["religion"]:
            no = no | ~_t(f.worship_is(b["type"]), like).bool()
        if b["adjacentRiver"]:
            no = no | ~_t(f.riverside(), like).bool()
        return no | _t(f.ground_refuses(b["type"]), like).bool()

    def _cv_turns_over(self, f, b: dict) -> torch.Tensor:
        like = f.like()
        return torch.maximum(_t(f.tech_turns(b["tech"]), like), _t(f.civic_turns(b["civic"]), like))

    def _cv_building_turns(self, f, b: dict) -> torch.Tensor:
        """0x5ce970's turns for a building at the city centre"""
        T = self._cv_tables()
        like = f.like()
        t = self._cv_turns_over(f, b)
        producing = _t(f.producing(), like).bool()
        if b["district"]:
            lack = ~_t(f.has_district(b["district"]), like).bool()
            add = _t(f.build_turns(b["district"]), like) + 10 * (~_t(f.current_is(b["district"]), like).bool()).long()
            t = t + torch.where(lack, add, torch.zeros_like(add))
        t = t + _t(f.build_turns(b["type"]), like)
        t = t + 10 * (producing & ~_t(f.current_is(b["type"]), like).bool()).long()
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
            d = d + _t(f.capital(), like) * 2 * _FX
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
            for c in cities:
                # (balance, yields), or with the elements the city stands for
                bal, ys = c[0], c[1]
                a = self._cv_amenity_per_turn(f, _t(bal, like), ys)
                add = torch.where(t == h, _discounted(a, r, t), _present_value(a, r, h) - _present_value(a, r, t))
                e = e + (torch.where(c[2], add, torch.zeros_like(add)) if len(c) > 2 else add)
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
            value = value + self._cv_modifiers(f, b["modifiers"], t, h)
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
            hz = f.value_horizon()
            # refused, or landing past the horizon: FX(-9999)
            if bool((no | (t < 0) | (t >= hz)).all()):
                out.append(torch.full_like(t, _FX_MIN))
                continue
            v = self._cv_building(f, b["type"], t, torch.full_like(t, hz))
            out.append(torch.where(no | (t < 0), torch.full_like(v, _FX_MIN), v))
        return out

    # -- the Default Specialization pick (aiCityBuild.ts) ------------------

    def _cv_pick(self, buildings: list, units: list, projects: list, p, bests=None):
        """0x5d4d70, `defaultSpecialization` over the tables (lists of [...]
        tensors, database order) and the pick facts `p` (its three bests,
        `_cv_bests`, where read already): per element the kind (0 building,
        1 unit, 2 project, -1 none), the row, the value"""
        (b_idx, b_val), (u_idx, u_val), (p_idx, p_val) = bests or self._cv_bests(buildings, units, projects, p)
        like = buildings[0]
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

    def _cv_bests(self, buildings: list, units: list, projects: list, p):
        """`specializationBests` (0x5d0860, 0x5d2600, 0x5d1f10): the best
        building, unit and project, each (row, value) per element (-1 and
        FX(-9999) none; the defensive pick values no project: 0)"""
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
        return (b_idx, b_val), (u_idx, u_val), (p_idx, p_val)

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

    # -- the modifier evaluator (aiModifiers.ts, 0x7a4b20) -------------------
    #
    # The reads the buildings' and projects' modifiers reach: the analyses of
    # their effects over their collections' subjects, the requirement sets
    # admitting each subject. A read the TS evaluator makes that is not here
    # stops the tables' build (`_cv_check_read`).

    _CV_COLLECTIONS = ("COLLECTION_OWNER", "COLLECTION_PLAYER_CITIES", "COLLECTION_CITY_DISTRICTS",
                       "COLLECTION_CITY_TRAINED_UNITS", "COLLECTION_CITY_PLOT_YIELDS")
    _CV_EVALUATORS = ("REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES", "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
                      "REQUIREMENT_PLOT_RESOURCE_TYPE_MATCHES", "REQUIREMENT_PLOT_RESOURCE_VISIBLE",
                      "REQUIREMENT_PLOT_HAS_ANY_IMPROVEMENT", "REQUIREMENT_DISTRICT_TYPE_MATCHES",
                      "REQUIREMENT_CITY_HAS_BUILDING")
    _CV_ANALYZERS = ("EFFECT_ADJUST_PLOT_YIELD", "EFFECT_ADJUST_CITY_YIELD_CHANGE", "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
                     "EFFECT_ADJUST_CITY_INNER_DEFENSE", "EFFECT_ADJUST_TRADE_ROUTE_CAPACITY",
                     "EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN", "EFFECT_ADJUST_INFLUENCE_POINTS_PER_TURN",
                     "EFFECT_GRANT_UNIT_IN_CITY", "EFFECT_GRANT_ABILITY", "EFFECT_ATTACH_MODIFIER",
                     "EFFECT_GRANT_INFLUENCE_TOKEN", "EFFECT_GRANT_SPY", "EFFECT_GRANT_COMBAT_ADJACENCY")

    def _cv_check_read(self, m: dict, reads: dict, depth: int = 1) -> None:
        """refuse a modifier whose analysis the TS evaluator reads through an
        effect, a collection or a requirement evaluator not here"""
        if depth >= 4:
            return
        col = m.get("collection")
        if col not in reads["collections"]:
            return
        if col not in self._CV_COLLECTIONS:
            raise NotImplementedError(f"modifier {m.get('id')}: collection {col} read in TS, not on the GPU")
        for rs in (m.get("subjectReqs"),):
            if not rs:
                continue
            for r in rs["reqs"]:
                if r["type"] not in reads["requirements"]:
                    continue
                if r["type"] not in reads["evaluators"]:
                    break  # the set refuses here: the modifier is worth 0 either side
                if r["type"] not in self._CV_EVALUATORS:
                    raise NotImplementedError(f"modifier {m.get('id')}: requirement {r['type']} evaluated in TS, not on the GPU")
        eff = m.get("effect")
        if eff in reads["sets"] or eff in reads["none"]:
            raise NotImplementedError(f"modifier {m.get('id')}: {eff}'s setting / slot-2 analysis not on the GPU")
        if eff in reads["analyzers"] and eff not in self._CV_ANALYZERS:
            raise NotImplementedError(f"modifier {m.get('id')}: effect {eff} analysed in TS, not on the GPU")
        if m.get("attach"):
            self._cv_check_read(m["attach"], reads, depth + 1)
        for a in m.get("ability") or []:
            self._cv_check_read(a, reads, depth + 1)

    def _cv_admits(self, f, rs, sub: dict):
        """0x6cf3c0 over the subject (`sub`: kind 'city' / 'district' with
        its type / 'plots' over the city's owned plots [..., P]): a bool
        tensor of the subject's shape, None where a kept requirement's
        evaluator is not read (the modifier is then worth 0)"""
        reads = self._cv_tables()["reads"]
        shape = sub["mask"]
        if not rs:
            return torch.ones_like(shape)
        met = []
        for r in rs["reqs"]:
            ty = r["type"]
            if ty not in reads["requirements"]:
                continue
            if ty not in reads["evaluators"]:
                return None
            a = r["args"]
            k = sub["kind"]
            no = torch.zeros_like(shape)
            if ty == "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES":
                v = f.plot_is("terrain", a.get("TerrainType")) if k == "plots" else no
            elif ty == "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES":
                v = f.plot_is("feature", a.get("FeatureType")) if k == "plots" else no
            elif ty == "REQUIREMENT_PLOT_RESOURCE_TYPE_MATCHES":
                v = f.plot_is("resource", a.get("ResourceType")) if k == "plots" else no
            elif ty == "REQUIREMENT_PLOT_RESOURCE_VISIBLE":
                v = f.plot_is("resourceVisible", None) if k == "plots" else no
            elif ty == "REQUIREMENT_PLOT_HAS_ANY_IMPROVEMENT":
                v = f.plot_is("improvement", None) if k == "plots" else no
            elif ty == "REQUIREMENT_DISTRICT_TYPE_MATCHES":
                v = torch.full_like(shape, sub.get("type") == a.get("DistrictType")) if k == "district" else no
            elif ty == "REQUIREMENT_CITY_HAS_BUILDING":
                b = a.get("BuildingType", "")
                wonder = b[len("BUILDING_"):] if b.startswith("BUILDING_") else b
                if k != "city" or wonder in reads["wonders"]:
                    v = no
                else:
                    v = _t(f.city_has_building(b), shape).bool()
            else:
                raise NotImplementedError(ty)
            met.append(v.bool() != bool(r.get("inverse")))
        if not met:
            return torch.ones_like(shape) if rs["test"] != "ANY" else torch.zeros_like(shape)
        st = torch.stack(met, 0)
        if rs["test"] == "ANY":
            return st.any(0)
        if rs["test"] == "NONE":
            return ~st.any(0)
        return st.all(0)

    def _cv_subjects(self, f, collection: str):
        """a collection's subjects for the owner city's analysis; None for a
        collection not read"""
        like = f.like()
        one = torch.ones_like(like, dtype=torch.bool)
        if collection in ("COLLECTION_OWNER", "COLLECTION_CITY_TRAINED_UNITS"):
            return [{"kind": "city", "mask": one}]
        if collection == "COLLECTION_PLAYER_CITIES":
            n = f.player_cities()
            if torch.is_tensor(n):
                return [{"kind": "city", "mask": n > k} for k in range(int(n.max()) if n.numel() else 0)]
            return [{"kind": "city", "mask": one}] * int(n)
        if collection == "COLLECTION_CITY_DISTRICTS":
            return [{"kind": "district", "type": d, "mask": _t(held, like).bool()} for d, held in f.city_districts()]
        if collection == "COLLECTION_CITY_PLOT_YIELDS":
            return [{"kind": "plots", "mask": f.plot_valid()}]
        return None

    def _cv_analyze(self, f, eff: str, a: dict, sub: dict, t: torch.Tensor, h: torch.Tensor) -> torch.Tensor:
        """an analyzer's whole number on one subject (per element, or per
        plot for the plot subjects)"""
        T = self._cv_tables()
        r = T["rate"]
        like = sub["mask"].long()
        amount = int(a.get("Amount", 0) or 0)

        def span(v):
            return _present_value(v, r, h) - _present_value(v, r, t)

        def between(v):
            return torch.where(t == h, _discounted(v, r, t), span(v))

        city = sub["kind"] == "city"
        zero = torch.zeros_like(like)
        if eff == "EFFECT_ADJUST_PLOT_YIELD":
            if sub["kind"] != "plots":
                return zero
            tt = t.unsqueeze(-1).expand_as(like)
            hh = h.unsqueeze(-1).expand_as(like)
            v = _present_value(torch.full_like(like, amount * _FX), r, hh) - _present_value(torch.full_like(like, amount * _FX), r, tt)
            v = self._cv_yield(_fmul(v, torch.full_like(v, _fx_const(0.5))), a.get("YieldType", ""))
            return torch.where(f.plot_is("impassable", None), zero, v >> 8)
        if eff == "EFFECT_ADJUST_CITY_YIELD_CHANGE":
            if not city:
                return zero
            y = a.get("YieldType", "")
            return between(self._cv_yield(torch.full_like(like, amount * _FX), y, f.yield_w(y))) >> 8
        if eff == "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER":
            if not city:
                return zero
            per = self._cv_yield(torch.full_like(like, _fx_float(_f32(amount * _f32(0.01)))), "YIELD_GOLD")
            prod = torch.floor(torch.as_tensor(f.city_yield("YIELD_PRODUCTION"), dtype=torch.float64) * _FX + 0.5).long()
            return between(_fmul(per, prod.expand_as(per))) >> 8
        if eff == "EFFECT_ADJUST_CITY_INNER_DEFENSE":
            return torch.where(_t(f.city_strikes(), like).bool(), torch.full_like(like, amount), zero)
        if eff == "EFFECT_ADJUST_TRADE_ROUTE_CAPACITY":
            k = f.trade_knowledge()
            if k is None:
                return zero
            full = _t(f.traders(), like) >= _t(f.trade_capacity(), like) + amount
            end = torch.minimum(t + 30, h)
            kk = _t(k, like)
            v = torch.where(t == end, _discounted(kk, r, t), _present_value(kk, r, end) - _present_value(kk, r, t))
            return torch.where(full, zero, (v * 4) >> 8)
        if eff in ("EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN", "EFFECT_ADJUST_INFLUENCE_POINTS_PER_TURN"):
            p = "PSEUDOYIELD_DIPLOMATIC_FAVOR" if eff == "EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN" else "PSEUDOYIELD_INFLUENCE"
            return span(self._cv_pseudo(torch.full_like(like, amount * _FX), p, f.pseudo_w(p))) >> 8
        if eff == "EFFECT_GRANT_UNIT_IN_CITY":
            if not city:
                return zero
            return _t(f.unit_cost(a.get("UnitType", "")), like) * amount
        # the civics value's grants (`sim_civics.py`'s terms): the envoys'
        # points as PSEUDOYIELD_INFLUENCE discounted from the start, a spy's
        # PSEUDOYIELD_UNIT_SPY and the minor's strength from the start to the
        # horizon
        C = self._cai_grants()
        if eff == "EFFECT_GRANT_INFLUENCE_TOKEN":
            return _discounted(torch.full_like(like, amount * C["token"]), r, t) >> 8
        if eff == "EFFECT_GRANT_SPY":
            return between(torch.full_like(like, amount * C["spy"])) >> 8
        if eff == "EFFECT_GRANT_COMBAT_ADJACENCY":
            if a.get("Enable") != "true":
                return zero
            return between(self._cai_strength(f.s) * _FX) >> 8
        raise NotImplementedError(eff)

    def _cv_analysis(self, f, m: dict, t: torch.Tensor, h: torch.Tensor, depth: int):
        """0x6cede0: the whole number the modifier's subjects leave; None
        where refused"""
        reads = self._cv_tables()["reads"]
        if depth >= 4:
            return None
        like = f.like()
        subs = self._cv_subjects(f, m.get("collection"))
        eff = m.get("effect")
        if eff in ("EFFECT_ATTACH_MODIFIER", "EFFECT_ATTACH_MODIFIER_TO_PLAYERTYPE"):
            inner = m.get("attach")
            if not inner or subs is None:
                return torch.zeros_like(like) if inner else None
            acc = torch.zeros_like(like)
            for sub in subs[:51]:
                ok = self._cv_admits(f, m.get("subjectReqs"), sub)
                if ok is None:
                    return torch.zeros_like(like)
                v = self._cv_analysis(f, inner, t, h, depth + 1)
                if v is not None:
                    acc = torch.where(ok & sub["mask"], v, acc)
            return acc
        if subs is None or (eff not in reads["analyzers"]):
            return torch.zeros_like(like)
        total = torch.zeros_like(like)
        for sub in subs[:51]:
            ok = self._cv_admits(f, m.get("subjectReqs"), sub)
            if ok is None:
                return torch.zeros_like(like)
            if eff == "EFFECT_GRANT_ABILITY":
                v = torch.zeros_like(like)
                for x in m.get("ability") or []:
                    w = self._cv_analysis(f, x, t, h, depth + 1)
                    if w is not None:
                        v = v + w
            else:
                v = self._cv_analyze(f, eff, m.get("args") or {}, sub, t, h)
            if sub["kind"] == "plots":
                total = total + torch.where(ok & sub["mask"], v, torch.zeros_like(v)).sum(-1)
            else:
                total = total + torch.where(ok & sub["mask"], v, torch.zeros_like(v))
        return total

    def _cv_modifiers(self, f, mods: list, t: torch.Tensor, h: torch.Tensor) -> torch.Tensor:
        """0x7a4b20, `modifiersValue` in the owner city's analysis: each
        modifier's whole value, held to +-0x7fffff, in fixed point"""
        v = torch.zeros_like(f.like())
        for m in mods:
            w = self._cv_analysis(f, m, t, h, 1)
            if w is not None:
                v = v + w.clamp(min=-0x7FFFFF, max=0x7FFFFF) * _FX
        return v

    # -- a minor's city facts off the state (minorBuild.ts) -----------------

    def _cv_minor_facts(self, s: int) -> "_MinorFacts":
        """`minorBuildFacts` / `minorProjectFacts` / `minorPickFacts` for
        minor `s` over the batch, read off the sim's own state"""
        return _MinorFacts(self, s)

    def _cv_minor_tables(self, s: int, f: "_MinorFacts | None" = None):
        """`minorTables`: the city centre's buildings, units and projects
        tables of minor `s` (lists of [B] raws, database order; a unit whose
        value is not read FX(-9999))"""
        f = f or self._cv_minor_facts(s)
        units = [torch.where(read, v, torch.full_like(v, _FX_MIN)) for v, read in self._cv_unit_table(f)]
        return self._cv_building_table(f), units, self._cv_project_table(f)

    def _cv_minor_pick(self, s: int):
        """the Default Specialization pick of minor `s` over its tables:
        (kind, row, value) each [B]"""
        f = self._cv_minor_facts(s)
        b, u, p = self._cv_minor_tables(s, f)
        return self._cv_pick(b, u, p, f)

    def _cv_disk3(self, ctr: torch.Tensor) -> torch.Tensor:
        """[B, 37] the plots within three of each centre `ctr` ([B]), -1
        past the map's edge"""
        c = ctr.clamp(min=0)
        return torch.cat([c.unsqueeze(1), self.neigh[c], self.ring2[c], self.ring3[c]], dim=1)


class _MinorFacts:
    """A minor's city as the city build AI reads it, its facts [B] tensors
    off the sim (`minorBuildFacts`, `minorProjectFacts`, `minorPickFacts`)."""

    def __init__(self, sim, s: int):
        self.sim, self.s = sim, s
        self.row = sim._CITY_MINOR0 + s
        self.seat = 100 + s
        self.T = sim._cv_tables()
        self.E = self.T["engine"]
        self._memo = {}
        # [B] games whose unit production table counts no known unit (a
        # founding turn's first look), None none
        self.no_known = None

    def _get(self, key, fn):
        if key not in self._memo:
            self._memo[key] = fn()
        return self._memo[key]

    def like(self):
        return torch.zeros(self.sim.B, dtype=torch.long, device=self.sim.device)

    def _bools(self, v: bool):
        return torch.full((self.sim.B,), v, dtype=torch.bool, device=self.sim.device)

    # the value view: a minor's yields at their DefaultValue, its district
    # pseudo-yield at 0.5 x its era's chronology
    def yield_w(self, y):
        return 0

    def pseudo_w(self, p):
        if p == "PSEUDOYIELD_DISTRICT":
            return (self.era() + 1) * (_FX // 2)
        # a city-state's military AI writes its Combat Desire over
        # PSEUDOYIELD_UNIT_COMBAT (the Free Cities' row past the city-states')
        if p == "PSEUDOYIELD_UNIT_COMBAT" and self.s < self.sim.S:
            return self.sim.citystate_combat_desire[:, self.s]
        # its explorers' and naval scouts' desire less what it holds, less
        # 1.0: none desired, none counted (`pseudoYieldWeights`)
        if p in ("PSEUDOYIELD_UNIT_EXPLORER", "PSEUDOYIELD_UNIT_NAVAL_COMBAT") and self.s < self.sim.S:
            return -_FX
        return 0

    def _stats(self):
        return self._get("stats", lambda: self.sim._seat_city_stats(self.row, record=False))

    def _total(self, k: int) -> torch.Tensor:
        return self._stats()[0][:, 0, k]

    def _mine(self):
        sim = self.sim
        return sim.major_unit_alive & (sim.major_unit_seat == self.seat)

    def era(self):
        return self._get("era", lambda: self.sim._civ_era(self.sim.citystate_techs[:, self.s], self.sim.citystate_civics[:, self.s]))

    def population(self):
        return self.sim.city_pop[:, self.row, 0].long()

    def capital(self):
        return 1

    def district_count(self):
        return 1 + (self.sim.city_dist_tile[:, self.row, 0] >= 0).sum(dim=1)

    def has_wonder(self):
        return 0

    def at_war(self):
        return self.sim.war[:, self.row].any(dim=1)

    def yield_pct(self, y):
        # the city's percent less its happiness level's: a minor's -50%
        # Production alone
        return int(self.sim.rules.citystate["productionPct"]) if y == "YIELD_PRODUCTION" else 0

    def version(self, b):
        r = self.T["bld"].get(b)
        return None if r is None or r["trait"] else b

    def unit_version(self, u):
        r = self.T["unit"].get(u)
        ok = r is not None and not r["trait"] and not r["majorOnly"] and not r["foundCity"] and not r["religion"] and r["canTrain"]
        return u if ok else None

    def _building_index(self, b):
        r = self.T["bld"].get(b)
        return -1 if r is None else self.E["building"][self.T["bld_rows"].index(r)]

    def _didx(self, d):
        r = [x["type"] for x in self.sim.rules.ai_city_build["districts"]]
        return self.E["district"][r.index(d)] if d in r else -1

    def _pidx(self, p):
        r = [x["type"] for x in self.T["proj_rows"]]
        return self.E["project"][r.index(p)] if p in r else -1

    def _uidx(self, u):
        k = self.T["unit_index"].get(u)
        return -1 if k is None else self.E["unit"][k]

    def has_building(self, b):
        bi = self._building_index(b)
        if bi < 0:
            return self._bools(False)
        return self.sim.city_bldg[:, self.row, 0, bi]

    def city_has_building(self, b):
        return self.has_building(b)

    def _district_done(self, dv: int):
        sim = self.sim
        t = sim.city_dist_tile[:, self.row, 0, dv]
        return (t >= 0) & sim.district_complete.gather(1, t.clamp(min=0).unsqueeze(1)).squeeze(1)

    def has_district(self, d):
        if d == "DISTRICT_CITY_CENTER":
            return self._bools(True)
        dv = self._didx(d)
        return self._bools(False) if dv < 0 else self._district_done(dv)

    def government_tier(self):
        return 0

    def worship_is(self, b):
        return self.sim._minor_worship(self.s) == self._building_index(b)

    def _centre(self):
        return self.sim.citystate_center[:, self.s]

    def riverside(self):
        return self.sim.tile_river.gather(1, self._centre().clamp(min=0).unsqueeze(1)).squeeze(1)

    def ground_refuses(self, b):
        bi = self._building_index(b)
        if bi < 0:
            return 1
        if bi == int(self.sim._barrier_bidx):
            return self.sim._city_lowland_count(self.row)[:, 0] == 0
        return 0

    def amenity(self):
        tot = self._stats()[0][:, 0]
        bal = self.sim._amen_balance_of[self.row][:, 0]
        ys = {y: tot[:, k] for k, y in enumerate(_YIELDS)}
        return bal.long(), ys

    def regional_amenities(self, r):
        return [self.amenity()]

    def full_civ(self):
        return False

    def tribe(self):
        return False

    def unit_count(self):
        return self._mine().sum(dim=1)

    def _production_table(self):
        def build():
            sim, s = self.sim, self.s
            rows = self.T["unit_rows"]
            nu = len(rows)
            dev = sim.device
            eng = self.E["unit"]
            version = torch.tensor([self.unit_version(r["type"]) is not None for r in rows], dtype=torch.bool, device=dev)
            obs = self._obsolete()
            mine = self._mine()
            owned = torch.zeros(sim.B, nu, dtype=torch.long, device=dev)
            for k, ei in enumerate(eng):
                if ei >= 0:
                    owned[:, k] = (mine & (sim.major_unit_type == ei)).sum(dim=1)
            known = sim._cv_known(s)
            if self.no_known is not None:
                known = torch.where(self.no_known.unsqueeze(1), torch.zeros_like(known), known)
            return sim._cv_unit_production(version.unsqueeze(0).expand(sim.B, -1), obs, owned, known)
        return self._get("uprod", build)

    def _obsolete(self):
        """[B, NU_ai] per AI unit row: obsolete to the player (0x538460, its
        ObsoleteTech or ObsoleteCivic or their Mandatory columns held)"""
        def build():
            sim, s = self.sim, self.s
            rows = self.T["unit_rows"]
            have_t, have_c = sim.citystate_techs[:, s], sim.citystate_civics[:, s]
            obs = torch.zeros(sim.B, len(rows), dtype=torch.bool, device=sim.device)
            for k, r in enumerate(rows):
                for o in r["obsolete"]:
                    ti = self.E["tech"].get(o, -1)
                    ci = self.E["civic"].get(o, -1)
                    if ti >= 0:
                        obs[:, k] |= have_t[:, ti]
                    if ci >= 0:
                        obs[:, k] |= have_c[:, ci]
            return obs
        return self._get("obs", build)

    def unit_production(self, u):
        v, entry = self._production_table()
        k = self.T["unit_index"][u]
        return v[:, k], torch.zeros_like(entry[:, k])

    def trains_domain(self, d):
        if d == "DOMAIN_SEA":
            return self.sim._naval_capable_minor(self.s)
        return 1

    def trade_route_capacity(self):
        return self.sim._trade_capacity(self.row)

    def combat_count(self):
        return 0

    def extra_copies(self, u):
        return 0

    def promotion_weight(self, c):
        return self.T["promo_minor"].get(c, _FX) if c else _FX

    def resource_access(self, res):
        # a plot within three of the centre holds the resource
        ri = self.E["resource"].get(res, -1)
        if ri < 0:
            return 0
        sim = self.sim
        d = self._disk()
        on = sim.res_id.gather(1, d.clamp(min=0)) == ri
        live = sim._res_live().gather(1, d.clamp(min=0))
        return (on & live & (d >= 0)).any(dim=1)

    def handicap(self):
        return 0

    def value_horizon(self):
        return self.T["horizon"]

    def growth(self):
        def build():
            total, eff, _need, _tier, _lux = self._stats()
            pop = self.sim.city_pop[:, self.row, 0].double()
            surplus = total[:, 0, 0] - pop * self.sim.rules.food_per_citizen
            housing = self.sim._seat_housing(self.row)[1][:, 0]
            mult = torch.where(surplus > 0, torch.floor(eff[:, 0] / surplus.clamp(min=1e-9) * _FX + 0.5), torch.full_like(surplus, _FX))
            return {"surplus": torch.floor(surplus * _FX + 0.5).long(), "housing": torch.floor(housing).long(),
                    "population": pop.long(), "stored": torch.floor(self.sim.city_growth[:, self.row, 0].double() * _FX + 0.5).long(),
                    "multiplier": mult.long()}
        return self._get("growth", build)

    def housing_value(self, housing, t, h):
        g = self.growth()
        return self.sim._cv_housing_value(g, self._get("fc", lambda: self.sim._cv_forecast(g)), housing, t, h)

    # the item in hand and the turns
    def _item_key(self, item: str) -> int:
        """the minor's item key of an install type (`minorItemKey`), -1 none"""
        sim = self.sim
        if item.startswith("BUILDING_"):
            bi = self._building_index(item)
            return -1 if bi < 0 else sim._mk_b0 + bi
        if item.startswith("DISTRICT_"):
            dv = self._didx(item)
            return -1 if dv < 0 else sim._mk_d0 + dv
        if item.startswith("UNIT_"):
            return self._uidx(item)
        pi = self._pidx(item)
        return -1 if pi < 0 else sim._mk_p0 + pi

    def producing(self):
        it = self.sim.citystate_item[:, self.s]
        return (it >= 0) & (it < self.sim._mk_r0)

    def current_is(self, item):
        k = self._item_key(item)
        return (self.sim.citystate_item[:, self.s] == k) & (k >= 0)

    def _analysed(self, key, ids, held, cur, left, entries):
        """`analysedTurns`: 0 for none or one held; else the analysis' turns
        (500 at 0 or below, and before the AI's first analysis), plus the
        turns left on the research in hand where the entry's walk does not
        lead through it"""
        turns, nxt, owned, valid = entries
        if key is None:
            return self.like()
        i = ids.get(key, -1)
        if i < 0:
            return self.like()
        e_turns = turns[:, i]
        t = torch.where(e_turns > 0, e_turns, torch.full_like(e_turns, 500))
        add = (t < 500) & (cur != nxt[:, i]) & (cur != i)
        t = torch.where(add, t + left, t)
        t = torch.where(valid, torch.where(owned[:, i], torch.zeros_like(t), t), torch.full_like(t, 500))
        return torch.where(held[:, i], torch.zeros_like(t), t)

    def tech_turns(self, t):
        return self._get(("tt", t), lambda: self._tech_turns(t))

    def _tech_turns(self, t):
        sim, s = self.sim, self.s
        return self._analysed(t, self.E["tech"], sim.citystate_techs[:, s], sim.citystate_cur_tech[:, s],
                              sim.citystate_ai_left_seen[:, s],
                              (sim.citystate_ai_turns[:, s], sim.citystate_ai_next[:, s], sim.citystate_ai_owned[:, s],
                               sim.citystate_ai_valid[:, s]))

    def _civic_left(self):
        """the turns left on the civic in hand at the city's Culture (-1
        with none)"""
        sim, s = self.sim, self.s
        cur = sim.citystate_cur_civic[:, s]
        cost = sim._research_cost(True).gather(1, cur.clamp(min=0).unsqueeze(1)).squeeze(1).long()
        prog = torch.floor(sim.citystate_civic_prog[:, s].double() * _FX + 0.5).long()
        rate = torch.floor(self._total(4) * _FX + 0.5).long()
        left = _turns_at(cost * _FX - prog, rate)
        return torch.where(cur >= 0, left, torch.full_like(left, -1))

    def civic_turns(self, c):
        return self._get(("ct", c), lambda: self._civic_turns(c))

    def _civic_turns(self, c):
        sim, s = self.sim, self.s
        return self._analysed(c, self.E["civic"], sim.citystate_civics[:, s], sim.citystate_cur_civic[:, s],
                              self._get("civic_left", self._civic_left),
                              (sim.citystate_cai_turns[:, s], sim.citystate_cai_next[:, s], sim.citystate_cai_owned[:, s],
                               sim.citystate_cai_valid[:, s]))

    def _military(self):
        sim = self.sim
        mt = sim.major_unit_type.clamp(min=0, max=sim.NU - 1)
        return (self._mine() & sim._type_military.take(mt)).sum(dim=1)

    def _item_cost(self, item: str):
        """`minorItemCost` [B] f64"""
        sim, s, row = self.sim, self.s, self.row
        if item.startswith("UNIT_"):
            ui = self._uidx(item)
            if ui == sim._builder_idx:
                return sim._builder_cost(sim.citystate_builders_trained[:, s]).double()
            if ui == sim._trader_idx:
                return sim._trader_cost(row).double()
            return sim._type_cost[ui].double().expand(sim.B)
        if item.startswith("BUILDING_"):
            bi = self._building_index(item)
            if bi == int(sim._barrier_bidx):
                return sim._flood_barrier_cost(row)[:, 0].double()
            return sim.rules_dev.b_cost.to(torch.float64)[bi].expand(sim.B)
        pct = sim._progress_pct_of(sim.citystate_techs[:, s].sum(dim=1), sim.citystate_civics[:, s].sum(dim=1))
        if item.startswith("DISTRICT_"):
            dv = self._didx(item)
            dcp = sim.rules.district_cost
            base = int(dcp["perDistrict"][dv]) if dv < len(dcp["perDistrict"]) else int(dcp["base"])
            k = int(dcp["perK"][dv]) if dv < len(dcp["perK"]) else int(dcp["k"])
            return sim._progress_cost(base, k, pct).double()
        pi = self._pidx(item)
        if pi == sim._repair_proj_idx:
            return sim._minor_repair(s)[1]
        prow = sim._proj_rows[pi]
        if int(prow["pgb"]) >= 0:
            return sim._progress_cost(int(prow["pgb"]), int(prow["pk"]), pct).double()
        return torch.full((sim.B,), float(max(int(prow["pc"]), 0)), dtype=torch.float64, device=sim.device)

    def _item_pct(self, item: str):
        """`minorItemPct` [B] f64"""
        sim, s = self.sim, self.s
        zero = torch.zeros(sim.B, dtype=torch.float64, device=sim.device)
        cs = sim.rules.citystate
        if item.startswith("UNIT_"):
            ui = self._uidx(item)
            if ui == sim._builder_idx:
                return zero + sim._mb_builder_pct
            if not bool(sim._type_military[ui]):
                return zero
            return torch.where(self._military() < sim._mb_small_military, zero + sim._mb_military_pct, zero)
        if item.startswith("BUILDING_"):
            bi = self._building_index(item)
            return zero + (float(cs["wallsProdPct"]) if int(sim.rules_dev.b_walls[bi]) > 0 else 0.0)
        if item.startswith("DISTRICT_"):
            dv = self._didx(item)
            if dv == int(sim._harbor_didx):
                return zero + float(cs["harborProdPct"])
            type_pct = torch.tensor([float(x) for x in cs["typeDistrictProdPct"]], dtype=torch.float64, device=sim.device)
            return torch.where(sim._citystate_didx[:, s] == dv, type_pct[sim.citystate_type[:, s].clamp(min=0)], zero)
        return zero

    def build_turns(self, item):
        """the turns the item takes at the city's Production under its
        percent, from the progress it keeps and the overflow store; 500 for
        an item the minor has no row for (once per item while the item in
        hand stands)"""
        return self._get(("bt", item, getattr(self.sim, "_mi_ver", 0)), lambda: self._build_turns(item))

    def _build_turns(self, item):
        sim, s = self.sim, self.s
        k = self._item_key(item)
        if k < 0:
            return 500
        cur = sim.citystate_item[:, s]
        progress = torch.where(cur == k, sim.citystate_prod[:, s], sim.citystate_kept[:, s, k]) + sim.citystate_ovf[:, s]
        cost = self._item_cost(item)
        rate = torch.floor(self._total(1) * (1 + self._item_pct(item) / 100) * _FX + 0.5).long()
        return _turns_at(torch.floor(cost * _FX).long() - torch.floor(progress * _FX + 0.5).long(), rate)

    # the projects table's facts: a minor completes no once-only project
    def advanced(self, p):
        return 0

    def progress_pct(self):
        sim, s = self.sim, self.s
        return sim._progress_pct_of(sim.citystate_techs[:, s].sum(dim=1), sim.citystate_civics[:, s].sum(dim=1))

    def space_race_standing(self):
        return 0

    def defence_repairs(self):
        return 0

    def districts(self):
        return self.district_count()

    def loyalty_falling(self):
        return 0

    def building_value(self, b, t, h):
        return self.sim._cv_building(self, b, t, h)

    def has_civic(self, c):
        i = self.E["civic"].get(c, -1)
        return self.sim.citystate_civics[:, self.s, i] if i >= 0 else 0

    def has_tech(self, t):
        i = self.E["tech"].get(t, -1)
        return self.sim.citystate_techs[:, self.s, i] if i >= 0 else 0

    def unlocked_by_effect(self, p):
        return 0

    def producing_elsewhere(self, p):
        return 0

    def favoured(self, p):
        return False

    # the modifiers' reads (an owner city's analysis): a minor's city is no
    # city of its player list
    def player_cities(self):
        return 0

    def city_districts(self):
        """the city's districts by install type, each with where it holds one
        (complete or not); the centre always"""
        sim = self.sim
        out = [("DISTRICT_CITY_CENTER", self._centre() >= 0)]
        for dv, name in sorted(self.T["dist_name"].items()):
            out.append((name, sim.city_dist_tile[:, self.row, 0, dv] >= 0))
        return out

    def _disk(self):
        return self._get("disk", lambda: self.sim._cv_disk3(self._centre()))

    def plot_valid(self):
        def build():
            d = self._disk()
            own = self.sim.tile_seat.gather(1, d.clamp(min=0)) == self.seat
            return (d >= 0) & (self._centre() >= 0).unsqueeze(1) & own
        return self._get("plots", build)

    def plot_is(self, kind, name):
        """per owned plot [B, 37]: its install terrain / feature / resource
        is `name`; its resource is seen; it holds an improvement; it bars
        passage"""
        sim = self.sim
        d0 = self._disk().clamp(min=0)
        pn = self.T["plot_names"]

        def at(plane):
            return plane.gather(1, d0)
        if kind == "terrain":
            elev = at(sim.hills.long()) + 2 * at(sim.tile_mountain.long())
            ter = at(sim.terrain)
            out = torch.zeros_like(d0, dtype=torch.bool)
            for k, base in enumerate(pn["terrain"]):
                for e, suffix in enumerate(("", "_HILLS", "_MOUNTAIN")):
                    if base + suffix == name:
                        out = out | ((ter == k) & (elev == e))
            return out
        if kind == "feature":
            ks = [k for k, f in enumerate(pn["feature"]) if f == name]
            fid = at(sim.feat_id)
            return (fid.unsqueeze(-1) == torch.tensor(ks, dtype=torch.long, device=sim.device)).any(-1) if ks \
                else torch.zeros_like(d0, dtype=torch.bool)
        live = at(sim._res_live())
        if kind == "resource":
            ks = [k for k, r in enumerate(pn["resource"]) if r == name]
            rid = at(sim.res_id)
            return live & (rid.unsqueeze(-1) == torch.tensor(ks, dtype=torch.long, device=sim.device)).any(-1) if ks \
                else torch.zeros_like(d0, dtype=torch.bool)
        if kind == "resourceVisible":
            return live & ~at(sim._res_hidden(self.row))
        if kind == "improvement":
            return at(sim.improvement) >= 0
        if kind == "impassable":
            imp = torch.tensor(pn["featureImpassable"], dtype=torch.bool, device=sim.device)
            fid = at(sim.feat_id)
            return at(sim.tile_mountain) | ((fid >= 0) & imp[fid.clamp(min=0)])
        raise NotImplementedError(kind)

    def city_yield(self, y):
        return self._total(_YIELDS.index(y))

    def city_strikes(self):
        """the outer defences' pool above 0"""
        sim = self.sim
        mx = sim._walls_tier_hp.take(sim._minor_walls_tier(self.s)).long()
        return torch.minimum(sim.city_outer_hp[:, self.row, 0].long(), mx) > 0

    def traders(self):
        sim = self.sim
        return (self._mine() & (sim.major_unit_type == sim._trader_idx)).sum(dim=1)

    def trade_capacity(self):
        return self.sim._trade_capacity(self.row)

    def trade_knowledge(self):
        # its trade AI's route value K (`_minor_trade_value`)
        return self.sim.citystate_trade_value[:, self.s]

    def unit_cost(self, u):
        ui = self._uidx(u)
        if ui < 0:
            return 0
        return self._item_cost(u).long() if ui in (self.sim._builder_idx, self.sim._trader_idx) else int(self.sim._type_cost[ui])

    # the pick's facts: no favoured items, the plain pick
    def defense(self):
        return 0

    def favored(self, item):
        return 0

    def building_held(self, b):
        return self.current_is(b) | self.has_building(b)

    def can_construct(self, b):
        return self.sim._cv_constructible(self, self.T["bld"][b])

    def can_train(self, u):
        """CanTrain: the minor's research unlocks the unit, no civilization's
        unique, none faith-bought, spawned or a spy; a naval unit at a coastal
        centre, an air unit beside a complete Aerodrome, a Trader below the
        trade capacity, the Archaeologist with an Archaeological Museum; the
        strategic resources ignored"""
        sim, s = self.sim, self.s
        ui = self._uidx(u)
        if ui < 0:
            return self._bools(False)
        spy = bool(sim.rules.units[ui]["spy"])
        if int(sim._type_uniq[ui]) >= 0 or bool(sim._type_faith_only[ui]) or bool(sim._type_spawn_only[ui]) or spy:
            return self._bools(False)
        if int(sim._type_resource[ui]) >= 0 and not sim._minor_any_res:
            return self._bools(False)
        ok = self._bools(True)
        ti, ci = int(sim._type_tech[ui]), int(sim._type_civic[ui])
        if ti >= 0:
            ok = ok & sim.citystate_techs[:, s, ti]
        if ci >= 0:
            ok = ok & sim.citystate_civics[:, s, ci]
        if bool(sim.unit_naval[ui]):
            ok = ok & sim._naval_capable_minor(s)
        if int(sim._type_air[ui]) > 0:
            ok = ok & (self._district_done(sim._aerodrome_didx) if sim._aerodrome_didx >= 0 else self._bools(False))
        if ui == sim._trader_idx:
            ok = ok & (sim._minor_traders(s) < sim._trade_capacity(self.row))
        if ui == sim._archaeologist_idx:
            ok = ok & self.has_building("BUILDING_MUSEUM_ARTIFACT")
        return ok

    def can_produce(self, p):
        """the repair while it is available; a district project while its
        district stands complete and clean"""
        sim = self.sim
        pi = self._pidx(p)
        if pi < 0:
            return self._bools(False)
        if pi == sim._repair_proj_idx:
            return sim._minor_repair(self.s)[0]
        dv = int(sim._proj_rows[pi]["d"])
        if dv < 0:
            return self._bools(False)
        t = sim.city_dist_tile[:, self.row, 0, dv]
        t0 = t.clamp(min=0).unsqueeze(1)
        return (t >= 0) & sim.district_complete.gather(1, t0).squeeze(1) & ~sim._fallout().gather(1, t0).squeeze(1)


class _FreeFacts(_MinorFacts):
    """A Free City as the city build AI reads it (`freeCityBuildFacts` over
    `majorBuildFacts`, `freeCityProjectFacts`, `freeCityPickFacts`): the
    Free City in column `j` of the Free Cities' row, the Free Cities'
    research (its row `FR`), no government, no combat units counted against
    its trade, TRAIT_LEADER_FREE_CITIES' promotion lists, the majors' default
    trait alone for its versions, the default handicap; its units in the
    hostile pool; no knowledge base's units known; its queue the city's"""

    def trade_knowledge(self):
        # the Free Cities' trade AI is not read
        return None

    def __init__(self, sim, j: int):
        super().__init__(sim, sim.FR)
        self.row = sim.FREE_ROW
        self.j = j
        self.seat = FREE_SEAT

    # the value view: the Gold weight of a seat losing Gold (`yieldWeights`:
    # its gold per turn, the Free Cities' cities' Gold less their units'
    # upkeep, x -0.2 while below 0)
    def yield_w(self, y):
        if y != "YIELD_GOLD":
            return 0
        def build():
            sim = self.sim
            tot = self._stats()[0]
            alive = sim.city_alive[:, self.row, : tot.shape[1]]
            gold = (tot[:, :, 2] * alive.double()).sum(dim=1)
            m = self._mine()
            up = (sim._unit_maintenance(sim.barb_unit_type, sim.barb_unit_formation, None).double() * m.double()).sum(dim=1)
            gpt = gold - up
            return torch.where(gpt < 0, _fmul(torch.full_like(gpt, _fx_const(-0.2), dtype=torch.long), _fx_const_t(gpt)),
                               torch.zeros_like(gpt, dtype=torch.long))
        return self._get("gold_w", build)

    def _total(self, k: int) -> torch.Tensor:
        return self._stats()[0][:, self.j, k]

    def _mine(self):
        sim = self.sim
        return sim.barb_unit_alive & (sim.barb_unit_seat == FREE_SEAT)

    def population(self):
        return self.sim.city_pop[:, self.row, self.j].long()

    def capital(self):
        return 0

    def district_count(self):
        return (self.sim.city_dist_tile[:, self.row, self.j] >= 0).sum(dim=1)

    def has_wonder(self):
        return (self.sim.city_wonder[:, self.row, self.j] >= 0).any(dim=1)

    def at_war(self):
        return self.sim.war[:, self.row].any(dim=1)

    def yield_pct(self, y):
        return 0

    def unit_version(self, u):
        r = self.T["unit"].get(u)
        return u if r is not None and r["canTrain"] and not r["trait"] else None

    def has_building(self, b):
        bi = self._building_index(b)
        if bi < 0:
            return self._bools(False)
        return self.sim.city_bldg[:, self.row, self.j, bi]

    def _district_done(self, dv: int):
        sim = self.sim
        t = sim.city_dist_tile[:, self.row, self.j, dv]
        return (t >= 0) & sim.district_complete.gather(1, t.clamp(min=0).unsqueeze(1)).squeeze(1)

    def worship_is(self, b):
        return self.sim._worship_offered(self.row)[:, self.j] == self._building_index(b)

    def _centre(self):
        return self.sim.city_center[:, self.row, self.j]

    def ground_refuses(self, b):
        bi = self._building_index(b)
        if bi < 0:
            return 1
        if bi == int(self.sim._barrier_bidx):
            return self.sim._city_lowland_count(self.row)[:, self.j] == 0
        return 0

    def amenity(self):
        tot = self._stats()[0][:, self.j]
        bal = self.sim._amen_balance_of[self.row][:, self.j]
        ys = {y: tot[:, k] for k, y in enumerate(_YIELDS)}
        return bal.long(), ys

    def regional_amenities(self, r):
        """the Free Cities' cities within `r` of the centre, each with the
        games it stands in"""
        sim = self.sim
        tot = self._stats()[0]
        ctr = self._centre().clamp(min=0)
        out = []
        for c in range(tot.shape[1]):
            cc = sim.city_center[:, self.row, c]
            near = sim.city_alive[:, self.row, c] & (cc >= 0) & (sim.pair_dist[ctr, cc.clamp(min=0)].long() <= r)
            bal = sim._amen_balance_of[self.row][:, c]
            out.append((bal.long(), {y: tot[:, c, k] for k, y in enumerate(_YIELDS)}, near))
        return out

    def _production_table(self):
        def build():
            sim = self.sim
            rows = self.T["unit_rows"]
            nu = len(rows)
            dev = sim.device
            eng = self.E["unit"]
            version = torch.tensor([self.unit_version(r["type"]) is not None for r in rows], dtype=torch.bool, device=dev)
            obs = self._obsolete()
            mine = self._mine()
            owned = torch.zeros(sim.B, nu, dtype=torch.long, device=dev)
            for k, ei in enumerate(eng):
                if ei >= 0:
                    owned[:, k] = (mine & (sim.barb_unit_type == ei)).sum(dim=1)
            known = torch.zeros(sim.B, nu, dtype=torch.long, device=dev)
            return sim._cv_unit_production(version.unsqueeze(0).expand(sim.B, -1), obs, owned, known)
        return self._get("uprod", build)

    def trains_domain(self, d):
        if d == "DOMAIN_SEA":
            return self.sim._naval_capable(self.row)[:, self.j]
        return 1

    def trade_route_capacity(self):
        return 0

    def promotion_weight(self, c):
        return self.T["promo_free"].get(c, _FX) if c else _FX

    def handicap(self):
        return self.T["default_handicap"]

    def growth(self):
        def build():
            sim = self.sim
            total, eff, _need, _tier, _lux = self._stats()
            pop = sim.city_pop[:, self.row, self.j].double()
            surplus = total[:, self.j, 0] - pop * sim.rules.food_per_citizen
            housing = sim._seat_housing(self.row)[1][:, self.j]
            e = eff[:, self.j]
            mult = torch.where(surplus > 0, torch.floor(e / surplus.clamp(min=1e-9) * _FX + 0.5), torch.full_like(surplus, _FX))
            return {"surplus": torch.floor(surplus * _FX + 0.5).long(), "housing": torch.floor(housing).long(),
                    "population": pop.long(), "stored": torch.floor(sim.city_growth[:, self.row, self.j].double() * _FX + 0.5).long(),
                    "multiplier": mult.long()}
        return self._get("growth", build)

    # the item in hand: the queue's head, a code of the production layout
    def _item_key(self, item: str) -> int:
        sim = self.sim
        if item.startswith("BUILDING_"):
            return self._building_index(item)
        if item.startswith("DISTRICT_"):
            dv = self._didx(item)
            si = next((k for k, sc in enumerate(sim._scaffold) if int(sc[0]) == dv), -1) if dv >= 0 else -1
            return -1 if si < 0 else sim.DISTRICT_BASE + si
        if item.startswith("UNIT_"):
            ui = self._uidx(item)
            return -1 if ui < 0 else sim.UNIT_BASE + ui
        pi = self._pidx(item)
        return -1 if pi < 0 else sim.PROJECT_BASE + pi

    def producing(self):
        return self.sim.city_current[:, self.row, self.j, 0] >= 0

    def current_is(self, item):
        k = self._item_key(item)
        return (self.sim.city_current[:, self.row, self.j, 0] == k) & (k >= 0)

    def _civic_left(self):
        """the turns left on the civic in hand at the Free Cities' Culture
        (-1 with none)"""
        sim, s = self.sim, self.s
        cur = sim.citystate_cur_civic[:, s]
        cost = sim._research_cost(True).gather(1, cur.clamp(min=0).unsqueeze(1)).squeeze(1).long()
        prog = torch.floor(sim.citystate_civic_prog[:, s].double() * _FX + 0.5).long()
        tot = self._stats()[0]
        alive = sim.city_alive[:, self.row, : tot.shape[1]]
        rate = torch.floor((tot[:, :, 4] * alive.double()).sum(dim=1) * _FX + 0.5).long()
        left = _turns_at(cost * _FX - prog, rate)
        return torch.where(cur >= 0, left, torch.full_like(left, -1))

    def _item_cost(self, item: str):
        """`itemPrice` of the Free City's queue item [B] f64"""
        sim = self.sim
        row = self.row
        B = sim.B
        if item.startswith("UNIT_"):
            ui = self._uidx(item)
            if ui == sim._builder_idx:
                return sim._builder_cost(torch.zeros(B, dtype=torch.long, device=sim.device)).double()
            if ui == sim._trader_idx:
                return sim._trader_cost(row).double()
            return sim._type_cost[ui].double().expand(B)
        if item.startswith("BUILDING_"):
            bi = self._building_index(item)
            if bi == int(sim._barrier_bidx):
                return sim._flood_barrier_cost(row)[:, self.j].double()
            return sim.rules_dev.b_cost.to(torch.float64)[bi].expand(B)
        pct = sim._progress_pct_of(sim.citystate_techs[:, self.s].sum(dim=1), sim.citystate_civics[:, self.s].sum(dim=1))
        if item.startswith("DISTRICT_"):
            dv = self._didx(item)
            return sim._progress_cost(int(sim._mb_d_base[dv]), int(sim._mb_d_k[dv]), pct).double()
        pi = self._pidx(item)
        if pi == sim._repair_proj_idx:
            return sim._free_repair(self.j)[1]
        prow = sim._proj_rows[pi]
        if int(prow["pgb"]) >= 0:
            return sim._progress_cost(int(prow["pgb"]), int(prow["pk"]), pct).double()
        return torch.full((B,), float(max(int(prow["pc"]), 0)), dtype=torch.float64, device=sim.device)

    def _item_pct(self, item: str):
        return torch.zeros(self.sim.B, dtype=torch.float64, device=self.sim.device)

    def build_turns(self, item):
        """the turns the item takes at the city's Production from the
        progress the queue holds on it and the bank; 500 for an item the city
        has no row for"""
        sim = self.sim
        k = self._item_key(item)
        if k < 0:
            return 500
        head = sim.city_current[:, self.row, self.j, 0]
        progress = torch.where(head == k, sim.city_progress[:, self.row, self.j, 0].double(), torch.zeros(sim.B, dtype=torch.float64, device=sim.device))
        progress = progress + sim.city_prod_bank[:, self.row, self.j].double()
        cost = self._item_cost(item)
        rate = torch.floor(self._total(1) * _FX + 0.5).long()
        return _turns_at(torch.floor(cost * _FX).long() - torch.floor(progress * _FX + 0.5).long(), rate)

    def player_cities(self):
        sim = self.sim
        return sim.city_alive[:, self.row].sum(dim=1)

    def city_districts(self):
        sim = self.sim
        out = [("DISTRICT_CITY_CENTER", self._centre() >= 0)]
        for dv, name in sorted(self.T["dist_name"].items()):
            out.append((name, sim.city_dist_tile[:, self.row, self.j, dv] >= 0))
        return out

    def plot_valid(self):
        def build():
            sim = self.sim
            d = self._disk()
            d0 = d.clamp(min=0)
            own = (sim.tile_seat.gather(1, d0) == self.row) & (sim.tile_city.gather(1, d0) == sim.city_id[:, self.row, self.j].unsqueeze(1))
            return (d >= 0) & (self._centre() >= 0).unsqueeze(1) & own
        return self._get("plots", build)

    def city_strikes(self):
        sim = self.sim
        mx = sim._free_walls_max(self.j).long()
        return torch.minimum(sim.city_outer_hp[:, self.row, self.j].long(), mx) > 0

    def traders(self):
        return 0

    def trade_capacity(self):
        return 0

    def unit_cost(self, u):
        ui = self._uidx(u)
        if ui < 0:
            return 0
        return self._item_cost(u).long() if ui in (self.sim._builder_idx, self.sim._trader_idx) else int(self.sim._type_cost[ui])

    def can_construct(self, b):
        sim = self.sim
        bi = self._building_index(b)
        if bi < 0:
            return self._bools(False)
        f_t, f_c = sim.citystate_techs[:, self.s], sim.citystate_civics[:, self.s]
        return sim._free_building_ok(self.j, bi, f_t, f_c) & sim._cv_constructible(self, self.T["bld"][b])

    def can_train(self, u):
        """CanTrain of a Free City: the Free Cities' research unlocks the
        unit, no civilization's unique, none faith-bought, spawned or a spy,
        no Trader or Settler, none asking a strategic resource (the Free
        Cities ignore no requirement and hold no stockpile), a naval unit at a
        coastal centre, no air unit"""
        sim, s = self.sim, self.s
        ui = self._uidx(u)
        if ui < 0:
            return self._bools(False)
        spy = bool(sim.rules.units[ui]["spy"])
        if (int(sim._type_uniq[ui]) >= 0 or bool(sim._type_faith_only[ui]) or bool(sim._type_spawn_only[ui]) or spy
                or ui == sim._trader_idx or ui == sim._settler_idx or int(sim._type_air[ui]) > 0):
            return self._bools(False)
        if int(sim._type_resource[ui]) >= 0 and not sim._free_any_res:
            return self._bools(False)
        ok = self._bools(True)
        ti, ci = int(sim._type_tech[ui]), int(sim._type_civic[ui])
        if ti >= 0:
            ok = ok & sim.citystate_techs[:, s, ti]
        if ci >= 0:
            ok = ok & sim.citystate_civics[:, s, ci]
        if bool(sim.unit_naval[ui]):
            ok = ok & sim._naval_capable(self.row)[:, self.j]
        return ok

    def can_produce(self, p):
        sim = self.sim
        pi = self._pidx(p)
        if pi < 0 or pi != sim._repair_proj_idx:
            return self._bools(False)
        return sim._free_repair(self.j)[0]

    def queue_item(self, kind: torch.Tensor, row: torch.Tensor):
        """the pick (kind 0 building, 1 unit, 2 project; the AI row) as the
        queue's code and its price (`majorQueueItem`), -1 none"""
        sim = self.sim
        T = self.T
        code = torch.full_like(row, -1)
        cost = torch.zeros(sim.B, dtype=torch.float64, device=sim.device)
        for k in sorted(set(row[kind >= 0].tolist())):
            for kd, rows in ((0, T["bld_rows"]), (1, T["unit_rows"]), (2, T["proj_rows"])):
                m = (kind == kd) & (row == k)
                if not bool(m.any()) or k >= len(rows):
                    continue
                key = self._item_key(rows[k]["type"])
                if key < 0:
                    continue
                code = torch.where(m, key, code)
                cost = torch.where(m, self._item_cost(rows[k]["type"]), cost)
        return code, cost
