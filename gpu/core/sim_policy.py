from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — torch, constants, helpers: the shared floor
from .sim_research import _FX, _fdiv, _fmul, _fx_const, _fx_const_t, _present_value, _discounted
from .sim_cityvalue import _FreeFacts, _MinorFacts, _f32

# THE POLICY AND GOVERNMENT VALUES of a city-state and of the Free Cities
# (`cpu/core/aiPolicyValue.ts`; tools/civ6lab/dll_readings.md "C-97: the
# government and policy choice"): the policy job (0x621eb0) and its value
# (0x7b26b0), the best card per slot type, a government's value (0x7b0330),
# on the minor's own view (its one city its capital; the Free Cities' cities
# none a capital) — the civics AI's government term reads them
# (`civicValue`). The modifiers' analysis is `aiModifiers.ts`'s on the
# subjects a policy's context has (no city of its own: COLLECTION_OWNER the
# player), each analyzer here its TS twin's.

_NO_SCORE = -256
_FX_MIN = -9999 * 256
_YIDX = {"YIELD_FOOD": 0, "YIELD_PRODUCTION": 1, "YIELD_GOLD": 2, "YIELD_SCIENCE": 3, "YIELD_CULTURE": 4, "YIELD_FAITH": 5}
# the analyzers ported here, beside those that read nothing a policy's
# context holds for a minor (no city of the context's own, no tributaries,
# no envoys placed, no great person it may earn, no Influence it may give)
_POL_ANALYZERS = {
    "EFFECT_ADJUST_CITY_YIELD_CHANGE", "EFFECT_ADJUST_CITY_YIELD_MODIFIER", "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "EFFECT_ADJUST_BUILDING_PRODUCTION", "EFFECT_ADJUST_CITY_GROWTH", "EFFECT_ADJUST_DISTRICT_YIELD_CHANGE",
    "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER", "EFFECT_ADJUST_INFLUENCE_POINTS_PER_TURN", "EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN",
    "EFFECT_ADJUST_TRADE_ROUTE_YIELD", "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL",
    "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_DOMESTIC", "EFFECT_ADJUST_UNIT_MAINTENANCE_DISCOUNT", "EFFECT_ADJUST_PROJECT_PRODUCTION",
    "EFFECT_ADJUST_GREAT_PERSON_POINTS",
}
# worth 0 in a minor's policy context: the context's own city (none), the
# Influence a minor may not give, its tributaries and placed envoys (none)
_POL_ZERO = {
    "EFFECT_ADJUST_CITY_YIELD_PER_POPULATION", "EFFECT_ADJUST_CITY_YIELD_PER_DISTRICT",
    "EFFECT_ADJUST_SPACE_RACE_PROJECTS_PRODUCTION", "EFFECT_ADJUST_DUPLICATE_FIRST_INFLUENCE_TOKEN",
    "EFFECT_ADJUST_PLAYER_YIELD_CHANGE_PER_TRIBUTARY", "EFFECT_ADJUST_PLAYER_YIELD_CHANGE_PER_USED_INFLUENCE_TOKEN",
}
_POL_COLLECTIONS = {"COLLECTION_OWNER", "COLLECTION_PLAYER_CITIES", "COLLECTION_PLAYER_CAPITAL_CITY", "COLLECTION_PLAYER_DISTRICTS",
                    "COLLECTION_ALL_PLAYERS"}
# the collections of the context's own city, which a policy's context has
# not: no subject (`subjects`' empty walks)
_POL_NO_SUBJECTS = {"COLLECTION_CITY_DISTRICTS", "COLLECTION_CITY_TRAINED_UNITS", "COLLECTION_CITY_PLOT_YIELDS", "COLLECTION_ALL_CITIES"}
_POL_EVALUATORS = {"REQUIREMENT_DISTRICT_TYPE_MATCHES", "REQUIREMENT_CITY_HAS_BUILDING", "REQUIREMENT_PLOT_IS_APPEAL_BETWEEN"}


class SimPolicy:
    def _pol_tables(self) -> dict:
        """the cards, the governments and the slot types as the policy AI
        walks them (database order), built once, each modifier's reads
        checked against the TS evaluator's (`AI_MODIFIER_READS`): a read the
        TS takes that is not here refuses at build"""
        cached = getattr(self, "_pol_cache", None)
        if cached is not None:
            return cached
        ca = self.rules.civic_ai
        T = self._cv_tables()
        reads = T["reads"]
        civ = T["engine"]["civic"]
        pols, govs = ca["policies"], ca["governments"]
        by_type = {p["type"]: i for i, p in enumerate(pols)}

        def cidx(name):
            return int(civ.get(name, -1)) if name else -1

        # a card with a great person class's obsolete row is obsolete to a
        # minor (its civilization level earns none): its modifiers are never
        # analysed
        # a card whose analysis the GPU lacks refuses where it comes alive
        # (`_pol_scores`); a government's always
        unported = {}
        for r in list(pols) + list(govs):
            if any(o.get("gpClass") for o in r.get("obsolete", [])):
                continue
            for m in r["modifiers"]:
                try:
                    self._pol_check_read(m, reads, r["type"])
                except NotImplementedError as e:
                    if r in govs:
                        raise
                    unported.setdefault(r["type"], str(e))
        P = []
        for p in pols:
            obs = []
            for o in p["obsolete"]:
                q = by_type.get(o.get("policy") or "")
                if q is not None and pols[q]["civic"]:
                    obs.append(cidx(pols[q]["civic"]))
            P.append({"type": p["type"], "slot": p["slot"], "civic": cidx(p["civic"]), "dark": bool(p["darkAge"]),
                      "golden": bool(p["goldenAge"]), "min_era": int(p["minEra"]), "max_era": int(p["maxEra"]),
                      "obs_civics": obs, "obs_gp": any(o.get("gpClass") for o in p["obsolete"]), "mods": p["modifiers"],
                      "unported": unported.get(p["type"])})
        gov_of = {}
        for gi, g in enumerate(govs):
            c = cidx(g["civic"])
            if c >= 0:
                gov_of.setdefault(c, []).append(gi)
        types = [g["type"] for g in govs]
        cached = {
            "P": P, "G": govs, "slots": [s["type"] for s in ca["slotTypes"]],
            "any": {s["type"]: bool(s["any"]) for s in ca["slotTypes"]},
            "horizon": int(ca["policyHorizon"]), "gov_of": gov_of,
            "cs_gov": types.index(ca["cityStateGovernment"]) if ca["cityStateGovernment"] in types else -1,
        }
        self._pol_cache = cached
        return cached

    def _pol_check_read(self, m: dict, reads: dict, owner: str, depth: int = 1) -> None:
        """refuse a card's or a government's modifier whose analysis the TS
        evaluator takes through an effect, a collection or a requirement
        evaluator not here"""
        if depth >= 4:
            return
        eff = m.get("effect")
        for a in m.get("ability") or []:
            self._pol_check_read(a, reads, owner, depth + 1)
        if m.get("attach"):
            self._pol_check_read(m["attach"], reads, owner, depth + 1)
        if eff in ("EFFECT_ATTACH_MODIFIER", "EFFECT_ATTACH_MODIFIER_TO_PLAYERTYPE", "EFFECT_GRANT_ABILITY"):
            if m.get("collection") in reads["collections"] and self._pol_live_nested(m, reads):
                raise NotImplementedError(f"{owner} {m.get('id')}: {eff} analysed in TS, not on the GPU")
            return
        if eff not in reads["analyzers"] or m.get("collection") not in reads["collections"]:
            return
        if self._pol_refused(m.get("subjectReqs"), reads) or m.get("collection") in _POL_NO_SUBJECTS:
            return
        if eff in reads["sets"] or eff in reads["none"]:
            raise NotImplementedError(f"{owner} {m.get('id')}: {eff}'s setting / slot-2 analysis not on the GPU")
        if m.get("collection") not in _POL_COLLECTIONS:
            raise NotImplementedError(f"{owner} {m.get('id')}: collection {m.get('collection')} read in TS, not on the GPU")
        if eff not in _POL_ANALYZERS and eff not in _POL_ZERO:
            raise NotImplementedError(f"{owner} {m.get('id')}: effect {eff} analysed in TS, not on the GPU")
        rs = m.get("subjectReqs")
        for r in (rs or {}).get("reqs", []):
            if r["type"] in reads["requirements"] and r["type"] not in _POL_EVALUATORS:
                raise NotImplementedError(f"{owner} {m.get('id')}: requirement {r['type']} evaluated in TS, not on the GPU")

    def _pol_live_nested(self, m: dict, reads: dict) -> bool:
        """a wrapper whose nested modifiers the TS analyses to something"""
        inner = ([m["attach"]] if m.get("attach") else []) + list(m.get("ability") or [])
        return any(x.get("effect") in reads["analyzers"] for x in inner)

    def _pol_refused(self, rs, reads) -> bool:
        """the set refuses (`admits` null): a kept requirement with no
        evaluator — the modifier is worth 0 either side"""
        for r in (rs or {}).get("reqs", []):
            if r["type"] in reads["requirements"] and r["type"] not in reads["evaluators"]:
                return True
        return False

    # -- the context ---------------------------------------------------------

    def _pol_ctx(self, s: int) -> dict:
        """minor `s`'s policy context (the Free Cities at `FR`): its row, its
        cities' facts with their live masks and capital flags, its seat"""
        B, dev = self.B, self.device
        if s == self.FR:
            row = self.FREE_ROW
            cities = [(_FreeFacts(self, j), self.city_alive[:, row, j], False) for j in range(self.city_alive.shape[2])]
            seat = FREE_SEAT
        else:
            row = self._CITY_MINOR0 + s
            f = _MinorFacts(self, s)
            cities = [(f, self.citystate_center[:, s] >= 0, True)]
            seat = 100 + s
        return {"s": s, "row": row, "seat": seat, "cities": cities, "f0": cities[0][0], "B": B, "dev": dev}

    def _pol_subjects(self, ctx: dict, collection: str):
        """a collection's subjects in the policy's context: the player
        (COLLECTION_OWNER), the seat's cities (the capital alone), its
        districts but the centres; each a dict with its kind, its [B] mask
        and its city's facts and slot"""
        one = torch.ones(ctx["B"], dtype=torch.bool, device=ctx["dev"])
        if collection in ("COLLECTION_OWNER", "COLLECTION_ALL_PLAYERS"):
            return [{"kind": "player", "mask": one}]
        if collection in _POL_NO_SUBJECTS:
            return []
        out = []
        for j, (f, alive, cap) in enumerate(ctx["cities"]):
            if collection == "COLLECTION_PLAYER_CITIES" or (collection == "COLLECTION_PLAYER_CAPITAL_CITY" and cap):
                out.append({"kind": "city", "mask": alive, "f": f, "j": j})
            elif collection == "COLLECTION_PLAYER_DISTRICTS":
                names = self._cv_tables()["dist_name"]
                for dv in sorted(names):
                    t = self.city_dist_tile[:, ctx["row"], j, dv]
                    out.append({"kind": "district", "mask": alive & (t >= 0), "f": f, "j": j, "dv": dv, "type": names[dv], "tile": t})
        return out

    def _pol_admits(self, rs, sub: dict) -> torch.Tensor:
        """0x6cf3c0 over the subject: [B] bool (the refusing sets are
        weeded out before)"""
        reads = self._cv_tables()["reads"]
        mask = sub["mask"]
        if not rs:
            return torch.ones_like(mask)
        met = []
        for r in rs["reqs"]:
            ty = r["type"]
            if ty not in reads["requirements"]:
                continue
            a = r["args"]
            no = torch.zeros_like(mask)
            if ty == "REQUIREMENT_DISTRICT_TYPE_MATCHES":
                v = torch.full_like(mask, sub.get("type") == a.get("DistrictType")) if sub["kind"] == "district" else no
            elif ty == "REQUIREMENT_CITY_HAS_BUILDING":
                b = a.get("BuildingType", "")
                wonder = b[len("BUILDING_"):] if b.startswith("BUILDING_") else b
                v = no if sub["kind"] != "city" or wonder in reads["wonders"] else sub["f"].city_has_building(b).bool()
            elif ty == "REQUIREMENT_PLOT_IS_APPEAL_BETWEEN":
                v = no  # no plot subject in a policy's context
            else:
                raise NotImplementedError(ty)
            met.append(v != bool(r.get("inverse")))
        if not met:
            return torch.ones_like(mask) if rs["test"] != "ANY" else torch.zeros_like(mask)
        st = torch.stack(met, 0)
        if rs["test"] == "ANY":
            return st.any(0)
        if rs["test"] == "NONE":
            return ~st.any(0)
        return st.all(0)

    # -- the analyzers ---------------------------------------------------------

    def _pol_district_yield(self, ctx: dict, sub: dict, y: str) -> torch.Tensor:
        """`districtYieldOf` [B] f64: nothing on a pillaged plot; the
        district's adjacency where it pays the yield, its buildings' standing
        rows of the yield"""
        row, j, dv = ctx["row"], sub["j"], sub["dv"]
        t = sub["tile"].clamp(min=0)
        k = _YIDX.get(y, -1)
        out = torch.zeros(ctx["B"], dtype=torch.float64, device=ctx["dev"])
        if k < 0:
            return out
        if int(self.districts_cat[dv]["adjYield"]) == k:
            out = out + self._district_adj_seat(row, dv).gather(1, t.unsqueeze(1)).squeeze(1).double()
        for bi in (self.rules.b_req_district == dv).nonzero(as_tuple=True)[0].tolist():
            amt = float(self.rules.b_yields[bi, k])
            if amt == 0:
                continue
            on = self.city_bldg[:, row, j, bi] & ~self.city_bldg_pillaged[:, row, j, bi]
            out = out + on.double() * amt
        pill = self.district_pillaged.gather(1, t.unsqueeze(1)).squeeze(1)
        return torch.where(pill, torch.zeros_like(out), out)

    def _pol_analyze(self, ctx: dict, eff: str, a: dict, sub: dict, h: int) -> torch.Tensor:
        """an analyzer's whole number [B] on one subject, start 0, horizon `h`"""
        T = self._cv_tables()
        r = T["rate"]
        f0 = ctx["f0"]
        B, dev = ctx["B"], ctx["dev"]
        zero = torch.zeros(B, dtype=torch.long, device=dev)
        hh = torch.full((B,), h, dtype=torch.long, device=dev)
        t0 = torch.zeros(B, dtype=torch.long, device=dev)
        # the argument as the parser reads it (`Number(Amount) | 0`)
        amount = int(float(a.get("Amount", 0) or 0))

        def span(v):
            return _present_value(v, r, hh) - _present_value(v, r, t0)

        def between(v):
            return span(v) if h != 0 else _discounted(v, r, t0)

        def full(x):
            return torch.full((B,), int(x), dtype=torch.long, device=dev)

        city = sub["kind"] == "city"
        y = a.get("YieldType", "")
        if eff in _POL_ZERO or eff == "EFFECT_ADJUST_BUILDING_PRODUCTION":
            return zero
        if eff == "EFFECT_ADJUST_CITY_YIELD_CHANGE":
            if not city:
                return zero
            return between(self._cv_yield(full(amount * _FX), y, f0.yield_w(y))) >> 8
        if eff == "EFFECT_ADJUST_CITY_YIELD_MODIFIER":
            if not city:
                return zero
            have = torch.clamp(torch.floor(torch.as_tensor(sub["f"].city_yield(y), dtype=torch.float64)), max=100)
            prod = (have * amount).to(torch.float32)
            amt = _fx_const_t((prod * torch.tensor(_f32(0.01), dtype=torch.float32)).to(torch.float32).double())
            return between(self._cv_yield(amt, y, f0.yield_w(y))) >> 8
        if eff == "EFFECT_ADJUST_BUILDING_YIELD_CHANGE":
            if not city:
                return zero
            v = self._cv_yield(full(amount * _FX), y, f0.yield_w(y))
            has = sub["f"].city_has_building(a.get("BuildingType", "")).bool()
            v = torch.where(has, v, _fmul(v, torch.full_like(v, _fx_const(0.5))))
            return span(v) >> 8
        if eff == "EFFECT_ADJUST_CITY_GROWTH":
            if city:
                food = sub["f"].growth()["surplus"].long()
            else:
                food = full(2 * _FX)
            pct = _fx_const(_f32(amount * _f32(0.01)))
            return between(self._cv_yield(_fmul(food, torch.full_like(food, pct)), "YIELD_FOOD")) >> 8
        if eff == "EFFECT_ADJUST_DISTRICT_YIELD_CHANGE":
            if sub["kind"] != "district":
                return zero
            return span(self._cv_yield(full(amount * _FX), y)) >> 8
        if eff == "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER":
            if sub["kind"] != "district":
                return zero
            have = self._pol_district_yield(ctx, sub, y).to(torch.float32)
            amt = _fx_const_t((torch.tensor(_f32(amount * _f32(0.01)), dtype=torch.float32) * have).to(torch.float32).double())
            return span(self._cv_yield(amt, y)) >> 8
        if eff == "EFFECT_ADJUST_INFLUENCE_POINTS_PER_TURN":
            p = "PSEUDOYIELD_INFLUENCE"
            return span(self._cv_pseudo(full(amount * _FX), p, f0.pseudo_w(p))) >> 8
        if eff == "EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN":
            p = "PSEUDOYIELD_DIPLOMATIC_FAVOR"
            return span(self._cv_pseudo(full(amount * _FX), p, f0.pseudo_w(p))) >> 8
        if eff in ("EFFECT_ADJUST_TRADE_ROUTE_YIELD", "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL",
                   "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_DOMESTIC"):
            cap = torch.as_tensor(f0.trade_capacity(), device=dev).long().expand(B)
            v = self._cv_yield(cap * (amount * _FX), y, f0.yield_w(y))
            if eff == "EFFECT_ADJUST_TRADE_ROUTE_YIELD":
                origin = str(a.get("AffectOrigin", "true")) in ("true", "1")
                return between(v) >> 8 if origin else zero
            return span(v) >> 8
        if eff == "EFFECT_ADJUST_PROJECT_PRODUCTION":
            # a boost on a city subject that may advance the project (a
            # city-state's none: the TS view's cities of the seat, the
            # Free Cities' own), at its Production; a cut is not in a card
            proj = a.get("ProjectType")
            pct = _fx_const(_f32(amount * _f32(0.01)))
            if not proj or pct <= 0:
                if proj and pct < 0:
                    raise NotImplementedError("EFFECT_ADJUST_PROJECT_PRODUCTION's cut")
                return zero
            if not city or ctx["s"] != self.FR:
                return zero
            can = sub["f"].can_produce(proj).bool()
            prod = torch.floor(torch.as_tensor(sub["f"].city_yield("YIELD_PRODUCTION"), dtype=torch.float64) * _FX + 0.5).long()
            v = between(self._cv_yield(_fmul(prod, torch.full_like(prod, pct)), "YIELD_PRODUCTION", f0.yield_w("YIELD_PRODUCTION"))) >> 8
            return torch.where(can & (prod > 0), v, zero)
        if eff == "EFFECT_ADJUST_GREAT_PERSON_POINTS":
            # the class's pseudo-yield at the player's weight, its present
            # value to the horizon
            p = self.rules.civic_ai["gpClassPseudo"].get(a.get("GreatPersonClassType", ""))
            if not p:
                return zero
            return _present_value(self._cv_pseudo(full(amount * _FX), p, f0.pseudo_w(p)), r, hh) >> 8
        if eff == "EFFECT_ADJUST_UNIT_MAINTENANCE_DISCOUNT":
            mine = self.major_unit_alive & (self.major_unit_seat == ctx["seat"])
            m = self._type_maintenance.take(self.major_unit_type.clamp(min=0, max=self.NU - 1)).long()
            tot = (torch.clamp(m, max=amount) * mine.long()).sum(dim=1) * _FX
            return span(self._cv_yield(tot, "YIELD_GOLD")) >> 8
        raise NotImplementedError(eff)

    def _pol_mod_value(self, ctx: dict, m: dict, h: int) -> torch.Tensor:
        """one modifier's whole value [B] (`modifierValue`), 0 where refused"""
        reads = self._cv_tables()["reads"]
        zero = torch.zeros(ctx["B"], dtype=torch.long, device=ctx["dev"])
        eff = m.get("effect")
        if eff not in reads["analyzers"] or eff in ("EFFECT_ATTACH_MODIFIER", "EFFECT_ATTACH_MODIFIER_TO_PLAYERTYPE", "EFFECT_GRANT_ABILITY"):
            return zero
        if m.get("collection") not in reads["collections"] or self._pol_refused(m.get("subjectReqs"), reads):
            return zero
        acc = zero
        for sub in self._pol_subjects(ctx, m["collection"])[:51]:
            ok = self._pol_admits(m.get("subjectReqs"), sub) & sub["mask"]
            if not bool(ok.count_nonzero()):
                continue
            v = self._pol_analyze(ctx, eff, m.get("args") or {}, sub, ctx["h"])
            acc = acc + torch.where(ok, v, zero)
        return acc

    def _pol_mods_value(self, ctx: dict, mods: list, h: int) -> torch.Tensor:
        """`modifiersValue` [B] raw: each modifier's whole value held to
        +-0x7fffff, in fixed point"""
        ctx = {**ctx, "h": h}
        v = torch.zeros(ctx["B"], dtype=torch.long, device=ctx["dev"])
        for m in mods:
            v = v + self._pol_mod_value(ctx, m, h).clamp(min=-0x7FFFFF, max=0x7FFFFF) * _FX
        return v

    # -- the scores and the values ----------------------------------------------

    def _pol_scores(self, s: int, ctx: dict | None = None) -> torch.Tensor:
        """`policyScores` [B, NP] raw for minor `s` (the Free Cities at
        `FR`): -1.0 for a card whose civic is neither held nor on the civics
        AI's list (its last analysis's rows of an own value above 0; none
        before its first), a Dark or Golden Age card (a minor knows no age),
        or one outside its era window; FX_MIN for an obsolete card (its
        obsoleting card's civic held, or a great person class it needs:
        a minor's civilization level earns none); else its modifiers' sum,
        start 0, AI_POLICY_HORIZON"""
        Tp = self._pol_tables()
        ctx = ctx or self._pol_ctx(s)
        B, dev = ctx["B"], ctx["dev"]
        held = self.citystate_civics[:, s]
        listed = self.citystate_cai_valid[:, s].unsqueeze(1) & (self.citystate_cai_base[:, s] > 0)
        era = self.game_era
        out = []
        for p in Tp["P"]:
            c = p["civic"]
            sc = torch.full((B,), _NO_SCORE, dtype=torch.long, device=dev)
            if p["dark"] or p["golden"] or c < 0:
                out.append(sc)
                continue
            ok = held[:, c] | listed[:, c]
            if p["min_era"] >= 0:
                ok = ok & (era >= p["min_era"])
            if p["max_era"] >= 0:
                ok = ok & (era <= p["max_era"])
            if not bool(ok.count_nonzero()):
                out.append(sc)
                continue
            obs = torch.zeros(B, dtype=torch.bool, device=dev) | p["obs_gp"]
            for oc in p["obs_civics"]:
                if oc >= 0:
                    obs = obs | held[:, oc]
            live = ok & ~obs
            if p["unported"] and bool(live.count_nonzero()):
                raise NotImplementedError(f"{p['type']} scores live: {p['unported']}")
            val = self._pol_mods_value(ctx, p["mods"], Tp["horizon"]) if bool(live.count_nonzero()) else torch.zeros(B, dtype=torch.long, device=dev)
            sc = torch.where(ok, torch.where(obs, torch.full_like(sc, _FX_MIN), val), sc)
            out.append(sc)
        return torch.stack(out, dim=1)

    def _pol_slot_best(self, sc: torch.Tensor) -> dict:
        """`slotTypeBest`: per slot type the first highest card of the type
        (every card for a type that allows any); a card of another type
        stands while none of the type has come"""
        Tp = self._pol_tables()
        P = Tp["P"]
        B = sc.shape[0]
        out = {}
        for st in Tp["slots"]:
            anyt = Tp["any"][st]
            bi = torch.zeros(B, dtype=torch.long, device=sc.device)
            bslot_is = torch.full((B,), P[0]["slot"] == st, dtype=torch.bool, device=sc.device)
            for k in range(1, len(P)):
                sb = sc.gather(1, bi.unsqueeze(1)).squeeze(1)
                sp = sc[:, k]
                p_is = P[k]["slot"] == st
                take = sb < sp
                if not anyt:
                    if p_is:
                        take = take | ~bslot_is
                    else:
                        take = take & ~bslot_is
                bi = torch.where(take, torch.full_like(bi, k), bi)
                bslot_is = torch.where(take, torch.full_like(bslot_is, p_is), bslot_is)
            out[st] = sc.gather(1, bi.unsqueeze(1)).squeeze(1)
        return out

    def _pol_gov_values(self, s: int) -> torch.Tensor:
        """`governmentValues` [B, NG] raw: per government (database order)
        its value (0x7b0330, start 0, valueHorizons[1]) on the best card per
        slot type of the minor's scores — per slot row the type's best / 10
        over each slot's place (a type allowing any by 1, 1, 2, 3, 3...), its
        Favor as PSEUDOYIELD_DIPLOMATIC_FAVOR from the start to the horizon,
        its modifiers' sum. A minor has held no government but its own"""
        Tp = self._pol_tables()
        T = self._cv_tables()
        ctx = self._pol_ctx(s)
        best = self._pol_slot_best(self._pol_scores(s, ctx))
        B, dev = ctx["B"], ctx["dev"]
        h = int(self.rules.ai_value["horizon"])
        hh = torch.full((B,), h, dtype=torch.long, device=dev)
        t0 = torch.zeros(B, dtype=torch.long, device=dev)
        out = []
        for g in Tp["G"]:
            v = torch.zeros(B, dtype=torch.long, device=dev)
            for row in g["slots"]:
                base = _fdiv(best.get(row["slot"], torch.zeros_like(v)), torch.full_like(v, 2560))
                anyt = Tp["any"].get(row["slot"], False)
                for i in range(int(row["n"])):
                    d = min(max(i, 1), 3) if anyt else i + 1
                    v = v + _fdiv(base, torch.full_like(v, d * 256))
            if int(g["favor"]):
                p = "PSEUDOYIELD_DIPLOMATIC_FAVOR"
                fv = self._cv_pseudo(torch.full((B,), int(g["favor"]) << 8, dtype=torch.long, device=dev), p, ctx["f0"].pseudo_w(p))
                v = v + _present_value(fv, T["rate"], hh) - _present_value(fv, T["rate"], t0)
            out.append(v + self._pol_mods_value(ctx, g["modifiers"], h))
        return torch.stack(out, dim=1)
