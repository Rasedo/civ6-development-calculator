"""THE LADDER: one seat-generic policy, outside both engines.

THE LINE. Anything that must be identical BETWEEN THE ENGINES is a RULE and
belongs in them; anything that need only be identical BETWEEN RUNS is a POLICY
and belongs once, here. So legality is theirs — the masks and the observation
come from the engine — and CHOICE is this module's: given a seat's observation
and its legality masks, each verb returns the action that seat takes.

THE FILE IS THE INTERFACE. The chosen actions are recorded and both engines
replay them, so neither carries its own copy of the policy. `seat_ext[B, NS]`
says who drives each seat — False = this ladder, True = actions supplied from
outside (a net) — and seat 0 has a column like every other seat, so a net can
attach there too.

Contents: the observation layout constants and `split`; the per-verb picks
(envoy, research, production, gold purchase, faith, war); and
`pick_unit_orders`, one order per unit.
"""
from __future__ import annotations

import torch

# Observation layout, shared by both engines. Keep in step with
# `cpu/core/observe.ts:observeSeat` and `gpu/core/env.py:BatchEnv.observe`.
EMP = 15  # empire block width
EMP_FIELDS = (
    "turn", "techs", "civics", "techProg", "civicProg", "settlers",
    "settlersQueued", "cities", "treasury", "envoysAvail", "influence",
    "camps", "barbs", "units", "rangedUnits",
)
PER_CS = 3    # met, envoys/6, hasQuest
PER_CIV = 3  # atWar, warTurns/14, cities/6
ESCALATORS = 3  # district, settler, builder — the only NON-static prices
# The CTX block: the decide-time counters no mask can express, carried IN
# the observation so a TS client can render them too. RAW, UNSCALED values
# on purpose — the ladder compares them exactly (melee < cities*2 …) and a
# /10-scale round-trip is not bit-stable in f64. Trailing block, so every
# other offset is fixed.
CTX_SEAT = 13
CTX_FIELDS = (
    "nCities",        # alive city count, raw
    "nUnitsWQ",       # live units + QUEUED units (current in the unit range)
    "nMeleeWQ",       # live+queued military, rangedStrength == 0
    "nRangedWQ",      # live+queued military, rangedStrength > 0
    "unitCap",        # cities*2 + (atWarWithOpponent ? 3 : 1)
    "oppStr",         # opponent strength: cities*10 + Σ combat (the DoW site)
    "ownStr",         # floor(ownCities*8 + Σ own combat + 0.5)
    "prox",           # min pairwise dist(own centres, opponent centres); 999 = none
    "gang",           # 0/1: opponent warmonger >= the gang threshold
    "aggression",     # this seat's aggression (0 for seat 0)
    "peaceTurns",     # turns since last war with the opponent
    "atWarAny",       # 0/1: at war with ANYONE (the embark/cap arm's term)
    "oppHasCities",   # 0/1: the opponent holds any city (the DoW precondition)
)
PER_CITY = 10  # alive, pop/10, foodBox/need, progress/cost, cultureBox/cost,
              # ownedTiles/20, hp/200, loyalty/100, hasQueue, isCapital
# The trailing RESEARCH-COST blocks — EFFECTIVE cost per tech, then per civic,
# in catalog order (`Object.values(TECHS)` / `Object.values(CIVICS)`, what both
# engines' planes use). The pick is lowest effective cost, so the observation
# carries the price itself rather than a boost flag — see `pick_research`.


def split(obs: torch.Tensor, n_cs: int, n_civs: int, n_cities: int,
          n_techs: int, n_civics: int) -> dict[str, torch.Tensor]:
    """Slice a [B, F] observation into its blocks.

    The layout is positional and shared with TS; anything reading an
    observation goes through here rather than hardcoding offsets a second
    time — the second copy is how the schema drifts."""
    b = obs.shape[0]
    i = EMP
    emp = obs[:, :i]
    cs = obs[:, i:i + PER_CS * n_cs].reshape(b, n_cs, PER_CS)
    i += PER_CS * n_cs
    cv = obs[:, i:i + PER_CIV * n_civs].reshape(b, n_civs, PER_CIV)
    i += PER_CIV * n_civs
    city = obs[:, i:i + PER_CITY * n_cities].reshape(b, n_cities, PER_CITY)
    i += PER_CITY * n_cities
    # the three ESCALATING production costs — district, settler, builder.
    # Every other production price is STATIC rules data the ladder loads from
    # `rules.json`; static data is not state, and carrying it in an
    # observation is noise a policy must learn to ignore.
    esc = obs[:, i:i + 3]
    i += 3
    n_t, n_c = n_techs, n_civics
    boost_t = obs[:, i:i + n_t]
    i += n_t
    boost_c = obs[:, i:i + n_c]
    i += n_c
    ctx = obs[:, i:i + CTX_SEAT]  # raw decide-time scalars
    i += CTX_SEAT
    assert i == obs.shape[1], f"observation width {obs.shape[1]} != layout {i}"
    return {"empire": emp, "cs": cs, "civ": cv, "city": city,
            "escalators": esc, "costTech": boost_t, "costCivic": boost_c,
            "ctx": ctx}


def first_legal(mask: torch.Tensor) -> torch.Tensor:
    """[..., K] bool -> [...] long: the lowest legal index, -1 if none.

    Both engines' scripted picks break ties LOWEST-INDEX-WINS and this must
    match: a policy that breaks ties differently produces a different game,
    not a wrong one, but the recorded action file would stop replaying."""
    any_legal = mask.any(dim=-1)
    idx = mask.float().argmax(dim=-1)
    return torch.where(any_legal, idx, torch.full_like(idx, -1))


def decide(obs: torch.Tensor, masks: dict[str, torch.Tensor], layout: dict[str, int]) -> dict[str, torch.Tensor]:
    """(observation, legality masks) -> actions, for ONE seat, batched.

    The minimal surface: production and units take the lowest legal option,
    research and envoys go through their own verbs. What matters structurally
    is that a policy READS AN OBSERVATION and RETURNS ACTIONS, so this ladder
    and a net are interchangeable at one seam.
    """
    blocks = split(obs, layout["cs"], layout["civs"], layout["cities"],
                   layout["techs"], layout["civics"])
    out: dict[str, torch.Tensor] = {}
    for key in ("production", "units"):
        m = masks.get(key)
        if m is not None:
            out[key] = first_legal(m)
    for key, kind in (("tech", "tech"), ("civic", "civic")):
        m = masks.get(key)
        if m is not None:
            out[key] = pick_research(blocks, m, kind)
    if masks.get("envoy") is not None:
        out["envoy"] = pick_envoy(blocks, masks["envoy"])
    return out


def pick_envoy(blocks: dict, mask: torch.Tensor) -> torch.Tensor:
    """[B] long — the ENVOY verb.

    Greedy assignment: the neediest met city-state by OWN envoys — fewest
    envoys this seat has already placed — ties to the lowest city-state index,
    the lowest-index-wins convention every scripted picker uses and the one
    the recorded action file depends on. It reads only `met` and this seat's
    own envoy count, both already in the city-state block.

    NOT CARRIED, deliberately: how many envoys OTHER seats hold at each
    city-state. No verb consults it, so carrying it would be speculative — but
    a policy that wanted to CONTEST a suzerainty would need it, and it is
    engine-computed, not derivable from the catalog. Record it when a verb
    actually reads it; do not widen on a guess.
    """
    cs = blocks["cs"]                    # [B, S, 3] = met, envoys/6, hasQuest
    met = cs[:, :, 0] > 0.5
    mine = cs[:, :, 1]                   # own envoys, /6
    legal = mask & met
    # neediest first: lowest own-envoy count among legal, ties to lowest index
    big = torch.full_like(mine, float("inf"))
    score = torch.where(legal, mine, big)
    any_legal = legal.any(dim=-1)
    idx = score.argmin(dim=-1)
    return torch.where(any_legal, idx, torch.full_like(idx, -1))


def pick_research(blocks: dict, mask: torch.Tensor, kind: str) -> torch.Tensor:
    """[B] long — the RESEARCH verb (tech or civic).

    Lowest `effectiveResearchCostIn` wins. TS sorts the available items and
    `Array.prototype.sort` is stable, so equal costs keep CATALOG order — ties
    break to the lowest index, the same convention as every other scripted
    picker and the one the recorded action files depend on.

    The observation carries EFFECTIVE cost, not base cost plus a boost flag: a
    boost is -50%, so a boosted 100-cost item beats an unboosted 80, and the
    two orders diverge whenever boosts are live. Applying `base*(1-frac)` here
    would put a RULE inside the policy.

    The policy therefore never learns that boosts exist. It reads a price.
    """
    cost = blocks["costTech"] if kind == "tech" else blocks["costCivic"]
    if cost.shape[-1] != mask.shape[-1]:
        raise ValueError(
            f"{kind} cost vector is {cost.shape[-1]} wide but the mask is "
            f"{mask.shape[-1]} — the observation layout and the action space "
            "have drifted apart"
        )
    big = torch.full_like(cost, float("inf"))
    score = torch.where(mask, cost, big)
    any_legal = mask.any(dim=-1)
    idx = score.argmin(dim=-1)
    return torch.where(any_legal, idx, torch.full_like(idx, -1))


#: Production action classes, in the ladder's priority order. The engine
#: encoding is: buildings [0, NB), SETTLER = NB, IDLE = NB+1,
#: units [NB+2, NB+2+NU), districts above those, purchases last.
#:
#: MILITARY_ENGINEER and the GALLEY are single-column tiers like the builder:
#: combat 0 or naval, so neither can ever win an army lane and without its own
#: tier neither is ever picked at all. The GALLEY sits BELOW the army and is
#: deliberately NOT cap-gated — it is queued only when the army branch missed
#: because the cap was full, and counted afterwards. WONDER sits between
#: building and builder; PROJECT is LAST, the army-capped fallback that fires
#: only when every other class missed.
PROD_PRIORITY = ("settler", "district", "building", "wonder", "builder", "engineer", "unit", "galley", "project")

#: single-column tiers -> (roster key, is it gated by the unit cap)
SOLO_TIERS = {"builder": ("builder_idx", True),
              "engineer": ("engineer_idx", True),
              "galley": ("galley_idx", False)}


def pick_purchase(can_building: torch.Tensor, settler_ok: torch.Tensor, unit_ok: torch.Tensor,
                  tile_ok: torch.Tensor) -> torch.Tensor:
    """The GOLD-PURCHASE priority — ONE purchase per seat per turn,
    BUILDING > SETTLER > UNIT > TILE, no rng (the scripted gold block's own
    rung order). Inputs are the per-row candidate flags from the driver's
    _buy_ctx (which reads the engines' shared legality bodies); the return
    is the KIND [B] long: 0 building, 1 settler, 2 unit, 3 tile, -1 nothing.
    The engines' driven arms re-validate at their own phase position — a
    kind is an INTENT, not a write."""
    kind = torch.full(can_building.shape, -1, dtype=torch.long, device=can_building.device)
    kind = torch.where(tile_ok, torch.full_like(kind, 3), kind)
    kind = torch.where(unit_ok, torch.full_like(kind, 2), kind)
    kind = torch.where(settler_ok, torch.full_like(kind, 1), kind)
    kind = torch.where(can_building, torch.full_like(kind, 0), kind)
    return kind


def pick_faith(worship_ok: torch.Tensor, missionary_ok: torch.Tensor, apostle_ok: torch.Tensor):
    """The FAITH-purchase policy. WORSHIP is independent (its own building,
    its own gates); the RELIGIOUS UNIT is one per seat per turn, MISSIONARY
    saturating before APOSTLE. Returns (worship [B] bool, relig_kind [B]
    long: 5 missionary, 6 apostle, -1 neither). Candidates come from the
    engines' one legality body (_seat_faith_buy_candidates); the arms
    re-validate."""
    relig = torch.full(worship_ok.shape, -1, dtype=torch.long, device=worship_ok.device)
    relig = torch.where(apostle_ok, torch.full_like(relig, 6), relig)
    relig = torch.where(missionary_ok, torch.full_like(relig, 5), relig)
    return worship_ok, relig


def pick_war(mask: torch.Tensor, ctx: dict, rng: dict) -> torch.Tensor:
    """[B] long — the WAR verb: a civ seat declares on seat 0, or sues for
    peace. Seat 0 is a civ seat's only opponent under the war rules.

    `mask` is seat_masks['war'] [B, 2R]: col 0 = DECLARE legal (alive, at
    peace), col R = SUE legal (at war, warTurns >= min, peace gold
    affordable) — LEGALITY, engine-owned. Everything else here is POLICY:
    the sue chance (0.25), the DoW conditions (the opponent has cities,
    peaceTurns > 20, proximity <= 9, warmonger-gang OR a 1.3x strength edge)
    and the DoW chance (0.08 · (0.5 + aggression)).

    `rng` carries {'dow': [B], 'peace': [B]} floats from the DRIVER's own
    policy stream. THE ENGINES' SHARED STREAM IS NEVER TOUCHED: a driven
    seat's war choice is a recorded FACT by the time either engine sees it,
    and both engines' scripted rolls stand down for driven seats, so
    draw-count parity is untouched by construction.

    Returns the war-head column (0 = declare, R = peace) or -1.
    """
    B, W2 = mask.shape
    R = max(W2 // 2, 1)
    out = torch.full((B,), -1, dtype=torch.long, device=mask.device)
    # the scripted order: the war branch's sue roll runs before the peace
    # branch's DoW roll, and a seat is only ever in one branch
    sue = mask[:, R] & (rng["peace"] < 0.25)
    out = torch.where(sue, torch.full_like(out, R), out)
    dow = (
        mask[:, 0]
        & ctx["has_cities"]
        & (ctx["peace_turns"] > 20)
        & (ctx["prox"] <= 9)
        & (ctx["gang"] | (ctx["r_str"] > ctx["p_str"] * 1.3))
        & (rng["dow"] < 0.08 * (0.5 + ctx["aggression"]))
    )
    out = torch.where((out < 0) & dow, torch.zeros_like(out), out)
    return out


def unit_roster(units: list[dict]) -> dict:
    """Per-unit selection data for the army's two-lane pick, straight off the
    exported catalog so the ladder holds no second copy of the unit table.

    `units` is `rules.json`'s unit list in table order — the order IS the
    tie-break, so it must not be re-sorted.
    """
    combat = torch.tensor([int(u.get("combat", 0) or 0) for u in units], dtype=torch.long)
    rng_str = torch.tensor([int(u.get("rangedStrength", 0) or 0) for u in units], dtype=torch.long)
    naval = torch.tensor([bool(u.get("naval", 0)) for u in units], dtype=torch.bool)
    ids = [u.get("id") for u in units]
    return {
        "combat": combat,
        "ranged_str": rng_str,
        "naval": naval,
        "is_ranged": rng_str > 0,
        "builder_idx": ids.index("BUILDER") if "BUILDER" in ids else -1,
        "engineer_idx": ids.index("MILITARY_ENGINEER") if "MILITARY_ENGINEER" in ids else -1,
        "galley_idx": ids.index("GALLEY") if "GALLEY" in ids else -1,
    }


def _best_in_lane(cand: torch.Tensor, strength: torch.Tensor) -> torch.Tensor:
    """[B] index of the strongest legal unit in a lane, ties to LOWEST index.

    `key = strength*NU - idx` then argmax reproduces the TS scan's strict `>`
    (first wins over table order) without depending on argmax's undefined
    tie-break. The engine's own picker uses this identical key — if one changes,
    both must.
    """
    NU = cand.shape[1]
    ar = torch.arange(NU, device=cand.device)
    key = (strength * NU - ar).unsqueeze(0).expand(cand.shape[0], -1)
    return torch.where(cand, key, torch.full_like(key, -(10 ** 9))).argmax(dim=1)


def prod_classes(NB: int, NU: int, n_scaffold: int, n_wonder: int = 0, n_project: int = 0) -> dict:
    """Index ranges per production class, from the engine's own constants.

    Passed IN rather than hardcoded: the ladder must not carry a second copy of
    the action encoding, or it drifts from the engine the way every other
    duplicated definition in this codebase has.

    WONDER and PROJECT columns sit past the purchase block, so no purchase
    consumer renumbers. Zero widths (the defaults) make both tiers vanish.
    """
    ub = NB + 2
    w_lo = ub + NU + n_scaffold + NB + 1 + NU  # past the purchase block
    return {
        "building": (0, NB),
        "settler": (NB, NB + 1),
        "unit": (ub, ub + NU),
        "district": (ub + NU, ub + NU + n_scaffold),
        "wonder": (w_lo, w_lo + n_wonder),
        "project": (w_lo + n_wonder, w_lo + n_wonder + n_project),
    }


def pick_production(
    mask: torch.Tensor,
    classes: dict,
    roster: dict | None = None,
    ctx: dict | None = None,
) -> torch.Tensor:
    """[B, C] long — the PRODUCTION verb.

    The scripted chain tries each class in turn, falling through when nothing
    of that kind is legal:
        settler -> district -> building -> (wonder) -> builder -> army
    which reduces to FIRST LEGAL CLASS in priority order — but only the first
    three classes reduce to "lowest index within the class". The army does not.

    THE SETTLER IS NOT CAPITAL-GATED anywhere: `queueSettler`'s "any city" is
    the single shared rule, which is also Civ 6's.

    CITIES ARE WALKED IN ORDER, not scored independently, because the rules
    carry state ACROSS them: `settlerQueued`, `unitCount` and the
    `meleeCount`/`rangedCount` army composition are all updated inside the TS
    city loop and the engine mirrors each one. A snapshot mask cannot say "city
    0 just took the settler", so a stateless pass queues one per city.

    THE ARMY is two lanes, not a lowest-index pick:
      * melee  — highest `combat` among non-ranged, non-naval, combat > 0
      * ranged — highest `rangedStrength` among ranged, non-naval
    ties to the lowest table index in both, and the lane is chosen by
    `rangedCount * 2 < meleeCount` — train ranged while the army holds fewer
    than one ranged per two melee. Legality (tech + strategic resource) arrives
    through the MASK; the strengths come from `roster`, which is built off the
    exported catalog so there is no second copy of the unit table here.

    `ctx` carries the per-seat counters the mask cannot express, all [B]:
    `settler_queued`, `melee`, `ranged`, `unit_count`, `unit_cap`. Absent ones
    default to zero except `unit_cap`, which defaults to "no cap" — a missing
    cap must not silently forbid the army.

    Returns -1 where nothing is legal (the engine's "queue nothing" case).
    """
    B, C, W = mask.shape
    dev = mask.device
    ctx = ctx or {}

    def col(name: str, default: int) -> torch.Tensor:
        v = ctx.get(name)
        if v is None:
            return torch.full((B,), default, dtype=torch.long, device=dev)
        return v.to(torch.long)

    lo_s, hi_s = classes["settler"]
    u_lo, u_hi = classes["unit"]
    taken = ctx.get("settler_queued")
    taken = (torch.zeros(B, dtype=torch.bool, device=dev) if taken is None
             else taken.to(torch.bool).clone())
    # the CITY CAP is policy, not a mask column. Civ 6 has no cap; it is this
    # ladder's own "stop expanding" heuristic, so it lives here with the rest
    # of the policy. Absent -> no cap, never a silent ban.
    n_cities, city_cap = col("n_cities", 0), col("city_cap", 10 ** 9)
    room = n_cities < city_cap
    melee, ranged = col("melee", 0), col("ranged", 0)
    n_units, cap = col("unit_count", 0), col("unit_cap", 10 ** 9)

    solo_taken = {nm: torch.zeros(B, dtype=torch.bool, device=dev) for nm in SOLO_TIERS}
    out = torch.full((B, C), -1, dtype=torch.long, device=dev)
    for j in range(C):
        best = torch.full((B,), -1, dtype=torch.long, device=dev)
        under_cap = n_units < cap
        for name in PROD_PRIORITY:
            if name in SOLO_TIERS:
                # single-column tiers. The MASK carries each one's own gates
                # (builder: one-per-civ + a job exists; engineer: one-per-civ +
                # a fort job; galley: SAILING + naval-capable city + zero naval
                # owned) — the ladder only supplies the cap, which no mask has.
                key, capped = SOLO_TIERS[name]
                idx = roster[key] if roster else -1
                if idx < 0 or u_lo + idx >= W:
                    continue
                # every one of these is ONE PER SEAT and the engine's gate reads
                # rc_current LIVE, so it retires the moment any city queues one.
                # The mask is a snapshot taken before the walk and keeps saying
                # "legal" for the rest of them, so without this the ladder
                # queues a builder, an engineer or a galley in every idle city
                # at once.
                hit = mask[:, j, u_lo + idx] & ~solo_taken[name]
                if capped:
                    hit = hit & under_cap
                best = torch.where((best < 0) & hit,
                                   torch.full_like(best, u_lo + idx), best)
                continue
            if name == "unit":
                if roster is None or u_lo >= W:
                    continue
                legal = mask[:, j, u_lo:min(u_hi, W)]
                nu = legal.shape[1]
                rng_t = roster["is_ranged"][:nu]
                nav = roster["naval"][:nu]
                mel_ok = legal & ~rng_t & ~nav & (roster["combat"][:nu] > 0)
                rng_ok = legal & rng_t & ~nav
                pick_m = u_lo + _best_in_lane(mel_ok, roster["combat"][:nu])
                pick_r = u_lo + _best_in_lane(rng_ok, roster["ranged_str"][:nu])
                want_r = ranged * 2 < melee
                use_r = want_r & rng_ok.any(dim=1)
                use_m = ~use_r & mel_ok.any(dim=1)
                chosen = torch.where(use_r, pick_r, torch.where(use_m, pick_m, best))
                hit = (use_r | use_m) & under_cap
                best = torch.where((best < 0) & hit, chosen, best)
                continue
            lo, hi = classes[name]
            if lo >= hi or lo >= W:
                continue
            sub = mask[:, j, lo:min(hi, W)]
            if name == "settler":
                sub = sub & ~taken.unsqueeze(1) & room.unsqueeze(1)
            elif name == "wonder":
                # POLICY: the wonder tier raises from the CAPITAL only. The
                # MASK offers any city — Civ 6's rule — so the heuristic
                # lives here with the rest of the policy. Absent ctx -> no
                # gate (a net is free to build anywhere).
                cap_rows = ctx.get("is_capital")
                if cap_rows is not None:
                    sub = sub & cap_rows[:, j].to(torch.bool).unsqueeze(1)
            has = sub.any(dim=1)
            first = lo + sub.float().argmax(dim=1)
            best = torch.where((best < 0) & has, first, best)

        out[:, j] = best
        # thread every counter the next city will read, exactly as TS does
        for nm, (k, _c) in SOLO_TIERS.items():
            i2 = roster[k] if roster else -1
            if i2 >= 0:
                solo_taken[nm] = solo_taken[nm] | (best == u_lo + i2)
        taken = taken | ((best >= lo_s) & (best < hi_s))
        is_unit = (best >= u_lo) & (best < u_hi)
        n_units = n_units + is_unit.long()
        if roster is not None:
            ui = (best - u_lo).clamp(min=0, max=max(u_hi - u_lo - 1, 0))
            mil = is_unit & (roster["combat"][ui] > 0)
            ranged = ranged + (mil & roster["is_ranged"][ui]).long()
            melee = melee + (mil & ~roster["is_ranged"][ui]).long()
    return out


#: the scripted patrol's direction tie-break (engine `PATROL_DIR_PERM`). POLICY,
#: not a rule — it decides WHICH of several equally-legal steps is taken, so it
#: belongs here rather than in either engine.
PATROL_DIR_PERM = (3, 4, 2, 5, 1, 0)

#: per-unit observation offsets — mirrors BatchSim.UNIT_OBS.
U_DHOME, U_DNB, U_NBTILE, U_MP, U_CHARGES, U_CIVILIAN = 0, 1, 7, 13, 14, 15
U_ATWAR, U_DWAR, U_DWARNB = 16, 17, 18   # the war half
U_RINGTILE = 24                          # the 12 ring-2 tile ids
#: unit-action enum geometry. PILLAGE is NOT the last column — SNIPE_0..11 sit
#: after it. Consumers key on these, never on W-1.
A_PILLAGE = 25
A_SNIPE = 26

#: how close to home the patrol stops drifting (engine's `d_home > 3`).
PATROL_HOME_RADIUS = 3


def pick_unit_orders(mask: torch.Tensor, obs: torch.Tensor, home_radius: int = PATROL_HOME_RADIUS) -> torch.Tensor:
    """[B, N] long — ONE order per unit.

    At peace the rule is three lines:
        1. attack a hostile in reach, target = LOWEST TILE INDEX
        2. else drift home when further than `home_radius`
        3. else hold
    At war a unit marches on its war target, fights, pillages or holds; it
    never drifts home.

    Legality comes from `mask` [B, N, W]; the distances and neighbour tile ids
    come from `obs` [B, N, 36] — the masks say which orders are LEGAL and never
    which one the verb wants, which is why the observation carries a per-unit
    block at all.

    ONE STEP PER CALL, deliberately. A unit walks REAL MP and the action space
    is a direction SEQUENCE, so several steps per turn are expressible. But
    choosing step 2 needs to know where step 1 lands, and the observation is
    1-HOP: it carries each neighbour's distance to home and nothing beyond. So
    the DRIVER plans the later ranks itself rather than this verb guessing a
    path it cannot see. A net, which may commit several steps at once, can fill
    the sequence directly — the action space supports both.

    Returns 12 (HOLD) where nothing better is legal, never -1: holding is a real
    order and the engine treats -1 as "no instruction".
    """
    B, N, W = mask.shape
    dev = mask.device
    atk = mask[:, :, 6:12]
    nb_tile = obs[:, :, U_NBTILE:U_NBTILE + 6]
    BIG = float(10 ** 9)

    # 1. ATTACK — lowest target TILE INDEX across the unit's whole range: the
    #    engine scans ALL tiles in index order, so adjacent (d=1) and ring
    #    (d=2, SNIPE) targets INTERLEAVE by index. Compare both against one
    #    key and pick whichever holds the lower tile id.
    a_key = torch.where(atk, nb_tile, torch.full_like(nb_tile, BIG))
    adj_min = a_key.min(dim=2).values
    adj_dir = a_key.argmin(dim=2)
    if W > A_SNIPE and obs.shape[2] > U_RINGTILE:
        snipe = mask[:, :, A_SNIPE:A_SNIPE + 12]
        ring_tile = obs[:, :, U_RINGTILE:U_RINGTILE + 12]
        s_key = torch.where(snipe, ring_tile, torch.full_like(ring_tile, BIG))
        sn_min = s_key.min(dim=2).values
        sn_col = s_key.argmin(dim=2) + A_SNIPE
    else:
        sn_min = torch.full((B, N), BIG, dtype=obs.dtype, device=dev)
        sn_col = torch.zeros(B, N, dtype=torch.long, device=dev)
    has_atk = (adj_min < BIG) | (sn_min < BIG)
    use_ring = sn_min < adj_min
    atk_col = torch.where(use_ring, sn_col, adj_dir + 6)

    # 2a. WAR MARCH — while at war with a live target, step to the neighbour
    #     STRICTLY CLOSER to the war target; ties in DIRECTION ORDER (the
    #     engine's war march scans `arange6`, unlike the patrol's
    #     PATROL_DIR_PERM — two different tie-breaks, deliberately preserved).
    #     PILLAGE-underfoot outranks the march: the scripted rule pillages
    #     before marching, and the mask's PILLAGE column carries legality.
    at_war = obs[:, :, U_ATWAR] > 0
    d_war = obs[:, :, U_DWAR]
    d_war_nb = obs[:, :, U_DWARNB:U_DWARNB + 6]
    legal_mv = mask[:, :, 0:6]
    w_closer = legal_mv & (d_war_nb < d_war.unsqueeze(2))
    # the ENGINE's march key is `d_nb * 8 + dir` — MIN DISTANCE first, then
    # direction order. Ranking closer neighbours by direction alone would pick
    # a legal, closer, but not CLOSEST step whenever two directions both
    # approach the target.
    w_key = torch.where(w_closer,
                        d_war_nb * 8 + torch.arange(6, device=dev).view(1, 1, 6).to(d_war_nb.dtype),
                        torch.full((B, N, 6), 1e9, dtype=d_war_nb.dtype, device=dev))
    has_wmv = w_closer.any(dim=2)
    w_dir = w_key.argmin(dim=2)
    has_target = d_war < 1e6
    pillage_col = A_PILLAGE                   # NOT W-1 — SNIPE sits after it
    can_pillage = mask[:, :, pillage_col] if W > A_PILLAGE else torch.zeros(B, N, dtype=torch.bool, device=dev)

    # 2b. PEACE PATROL — only while further than the stop radius, and only to a
    #     neighbour that is strictly CLOSER to home. Ties break in
    #     PATROL_DIR_PERM order, so score by that rank, not by direction index.
    d_home = obs[:, :, U_DHOME]
    d_nb = obs[:, :, U_DNB:U_DNB + 6]
    rank = torch.empty(6, dtype=torch.long, device=dev)
    for pos, d in enumerate(PATROL_DIR_PERM):
        rank[d] = pos
    closer = legal_mv & (d_nb < d_home.unsqueeze(2))
    p_key = torch.where(closer, rank.view(1, 1, 6).expand(B, N, 6), torch.full((B, N, 6), 10 ** 9, device=dev))
    has_mv = closer.any(dim=2)
    mv_dir = p_key.argmin(dim=2)
    roam = (d_home > float(home_radius)) & has_mv

    out = torch.full((B, N), 12, dtype=torch.long, device=dev)
    # NO PEACE DRIFT AT WAR. The engine's war act stands its ground when no
    # target is reachable (`moving = march & has_tgt`) — it never walks home.
    # A unit at war either marches on a target, fights, pillages, or HOLDS.
    out = torch.where(roam & ~at_war, mv_dir, out)               # peace drift only at peace
    war_march = at_war & has_target & has_wmv
    out = torch.where(war_march, w_dir, out)                     # the war march
    out = torch.where(at_war & can_pillage, torch.full_like(out, pillage_col), out)
    out = torch.where(has_atk, atk_col, out)                     # attack outranks all
    # a unit with no legal order at all gets no instruction
    return torch.where(mask.any(dim=2), out, torch.full_like(out, -1))
