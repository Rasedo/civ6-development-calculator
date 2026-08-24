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
PER_CS = 5    # met, envoys/6, hasQuest, atWar, warTurns/14
# THE OPPONENT BLOCK — one column per OTHER major, in ascending seat order,
# everything measured from the asker's own point of view. The last four are
# RAW and unscaled for the same reason the ctx block is: the DoW policy
# compares them exactly.
PER_CIV = 13
PER_CIV_FIELDS = (
    "atWar",          # 0/1: this seat is at war with that opponent
    "warTurns",       # THAT war's own clock / 14
    "cities",         # the opponent's city count / 6
    "oppStr",         # opponent strength: cities*8 + Σ combat (the DoW site)
    "prox",           # min pairwise dist(own centres, theirs); 999 = none
    "gang",           # 0/1: the world's grievances against them clear the bar
    "oppHasCities",   # 0/1: they hold any city (the DoW precondition)
    # THE AGREEMENTS, every one of them the precondition of some verb. Turns
    # LEFT rather than flags: a friendship with two turns to run is a
    # different offer from one with twenty, and the denouncement clock carries
    # the Formal-War window inside it.
    "friendTurns",    # the Declaration of Friendship clock / 30
    "allyTurns",      # the alliance clock / 30
    "bordersIn",      # THEIR Open Borders grant to this seat / 30
    "bordersOut",     # this seat's grant to them / 30
    "denounceOut",    # this seat's denouncement of them / 30
    "denounceIn",     # theirs of this seat / 30
)
ESCALATORS = 3  # district, settler, builder — the only NON-static prices
# The CTX block: the decide-time counters no mask can express, carried IN
# the observation so a TS client can render them too. RAW, UNSCALED values
# on purpose — the ladder compares them exactly (melee < cities*2 …) and a
# /10-scale round-trip is not bit-stable in f64. Trailing block, so every
# other offset is fixed.
#
# Everything here is the ASKER'S OWN. What is measured against an opponent
# lives in the opponent block above, one column per opponent, so a policy can
# compare them; a seat has one aggression and one peace clock, and those stay.
CTX_SEAT = 9
CTX_FIELDS = (
    "nCities",        # alive city count, raw
    "nUnitsWQ",       # live units + QUEUED units (current in the unit range)
    "nMeleeWQ",       # live+queued military, rangedStrength == 0
    "nRangedWQ",      # live+queued military, rangedStrength > 0
    "unitCap",        # cities*2 + (atWarWithAny ? 3 : 1)
    "ownStr",         # floor(ownCities*8 + Σ own combat + 0.5)
    "aggression",     # this seat's aggression
    "peaceTurns",     # turns this seat has been at war with nobody
    "atWarAny",       # 0/1: at war with ANYONE (the embark/cap arm's term)
)
PER_CITY = 10
# THE WORLD CONGRESS block: this seat's ballot currency and the slate that is
# STANDING — what the last session passed and on whom. A net votes off this;
# the ladder's own vote reads the sim directly, the way the route verb does.
CONGRESS = 12
CONGRESS_FIELDS = (
    "favor",          # diplomatic favor / 100
    "dvPoints",       # diplomatic victory points / 20 (the win threshold)
    "slot0Res",       # standing slate slot 0: resolution index + 1, 0 = none
    "slot0Outcome",   # 0 = A, 1 = B (0 when nothing stands)
    "slot0Target",    # the winning target index (0 when nothing stands)
    "slot1Res",
    "slot1Outcome",
    "slot1Target",
    # THE EMERGENCY a Special Session would put to this seat: the ballot on
    # slot 3 of the vote head is worthless without it.
    "emgKind",        # kind + 1 of the FIRST live emergency, 0 = none
    "emgPhase",       # 0 none, 1 pending, 2 called, 3 running
    "emgIsMe",        # 1 when this seat is the TARGET
    "emgMember",      # 1 when this seat is already a member
)


def split(obs: torch.Tensor, n_cs: int, n_opponents: int, n_cities: int,
          n_techs: int, n_civics: int) -> dict[str, torch.Tensor]:
    """Slice a [B, F] observation into its blocks.

    The layout is positional and shared with TS; anything reading an
    observation goes through here rather than hardcoding offsets a second
    time — the second copy is how the schema drifts.

    `n_opponents` is the `cv` block's row count: an observation renders the
    OTHER majors, never the asker, so it is one short of the roster — never the
    roster size itself."""
    b = obs.shape[0]
    i = EMP
    emp = obs[:, :i]
    cs = obs[:, i:i + PER_CS * n_cs].reshape(b, n_cs, PER_CS)
    i += PER_CS * n_cs
    cv = obs[:, i:i + PER_CIV * n_opponents].reshape(b, n_opponents, PER_CIV)
    i += PER_CIV * n_opponents
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
    # PARKED progress per option, same widths and same scale as the costs —
    # what a seat already sank into an item it is not currently researching.
    prog_t = obs[:, i:i + n_t]
    i += n_t
    prog_c = obs[:, i:i + n_c]
    i += n_c
    congress = obs[:, i:i + CONGRESS]
    i += CONGRESS
    ctx = obs[:, i:i + CTX_SEAT]
    i += CTX_SEAT
    assert i == obs.shape[1], f"observation width {obs.shape[1]} != layout {i}"
    return {"empire": emp, "cs": cs, "civ": cv, "city": city,
            "escalators": esc, "costTech": boost_t, "costCivic": boost_c,
            "progTech": prog_t, "progCivic": prog_c, "congress": congress, "ctx": ctx}


def first_legal(mask: torch.Tensor) -> torch.Tensor:
    # a zero-width head slice is a legal shape (a 1-major world has no
    # declare-war targets) and means "nothing legal", not a reduction error
    if mask.shape[-1] == 0:
        return torch.full(mask.shape[:-1], -1, dtype=torch.long, device=mask.device)
    any_legal = mask.any(dim=-1)
    idx = mask.float().argmax(dim=-1)
    return torch.where(any_legal, idx, torch.full_like(idx, -1))


def decide(obs: torch.Tensor, masks: dict[str, torch.Tensor], layout: dict[str, int]) -> dict[str, torch.Tensor]:
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
    cs = blocks["cs"]
    met = cs[:, :, 0] > 0.5
    mine = cs[:, :, 1]
    legal = mask & met
    big = torch.full_like(mine, float("inf"))
    score = torch.where(legal, mine, big)
    any_legal = legal.any(dim=-1)
    idx = score.argmin(dim=-1)
    return torch.where(any_legal, idx, torch.full_like(idx, -1))


# The scripted player is also the gate's FUZZER. Cheapest-first is BREADTH
# first: it maximises how many items a seat finishes and so pins every seat
# to the shallow end of both trees, which is why the late catalog never
# unlocks and the digest never compares the rules hanging off it. Per-decision
# noise does not fix that — MEASURED: it only adds drag, and coverage fell.
# A DEEP seat instead always takes the most advanced legal item, beelining
# down the tree while its rivals broaden, so one gate run holds both regimes.
# The style is drawn once per (game seed, seat) and never changes, and it can
# only produce a different LEGAL game: the applier re-validates every pick and
# the TS child replays what the driver chose.
DEEP_SHARE = 0.34

# The DIPLOMATIC style, drawn the same way and for the same reason: a diplomat
# courts (friendship, alliance, open borders, a gift) where every other seat
# keeps its grudges.
#
# THE TWO ARE PER-SEAT EXCLUSIVE, and that is MEASURED, not assumed. Letting a
# diplomat denounce as well took friendship to 1 seed in 12 and alliances to
# none: a denouncement blocks friendship in BOTH directions for its whole
# term, is renewable the moment it lapses, and the grievance it earns blocks
# friendship with everyone else too. Giving the two verbs disjoint targets
# (denounce the weaker, court the stronger) changed nothing, because the
# STRONGER seat denounces back down the same pair.
#
# The share is measured too: at 0.34 the agreement rows come in a seed lower
# for exactly the same cost, and at 1.0 the war regime is gone outright — no
# city-state war in any seed and a minor-war mean of 0.0, which is the
# collapse this knob exists to avoid.
DIPLO_SHARE = 0.5
# Writing, art, music — the Great Work kinds the gift verb indexes.
GW_KINDS = 3

# ---- STYLES ---------------------------------------------------------------
# A style is a dict of NAMED KNOBS over the scripted picks. Every default
# reproduces today's behaviour exactly: the pinnable booleans fall back to
# the per-(seed, seat) draws above, every rate multiplier is 1.0, every
# order the module constant. A style only changes DECISIONS — the applier
# validates and the TS child replays — so variation is free coverage, and
# the bar for a preset is the reachability-probe diff: it earns its place by
# ADDING rows without losing any.
STYLE_KNOBS = {
    "deep": None,           # None = draw at DEEP_SHARE; True/False pins it
    "diplo": None,          # None = draw at DIPLO_SHARE; True/False pins it
    "war_appetite": 1.0,    # multiplies the declare/raid rates in pick_war
    "peace_appetite": 1.0,  # multiplies the sue rate in pick_war
    "war_ratio": 1.3,       # the strength edge a declaration wants
    "city_cap": None,       # None = the rules' maxCities
    "dist_pref": None,      # a district id the scaffold rotation starts from
    "tier_order": None,     # None = PROD_PRIORITY
}
STYLE_PRESETS = {
    "default": {},
    "deep": {"deep": True},
    "broad": {"deep": False},
    "diplomat": {"diplo": True},
    "warlord": {"diplo": False, "war_appetite": 4.0, "war_ratio": 1.1, "city_cap": 5},
    "pacifist": {"war_appetite": 0.0, "peace_appetite": 4.0},
    "expander": {"city_cap": 10},
    "scientist": {"deep": True, "dist_pref": "CAMPUS"},
    "faithful": {"dist_pref": "HOLY_SITE"},
    "culturist": {"dist_pref": "THEATER_SQUARE"},
    "navalist": {"dist_pref": "HARBOR",
                 "tier_order": ("settler", "trader", "galley", "district", "building",
                                "wonder", "builder", "archaeologist", "engineer",
                                "unit", "project")},
}


def style_of(name: str) -> dict:
    s = dict(STYLE_KNOBS)
    s.update(STYLE_PRESETS[name])
    return s


def pick_research(blocks: dict, mask: torch.Tensor, kind: str,
                  deep: torch.Tensor | None = None) -> torch.Tensor:
    """[B] long — the RESEARCH verb (tech or civic).

    Lowest `effectiveResearchCostIn` wins, except on a DEEP row, which takes
    the most advanced legal item instead (the catalogs are era-ordered, so the
    highest legal index is the deepest reachable rung). Ties keep CATALOG
    order — the lowest index, the same convention as every other scripted
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
    if deep is not None:
        rung = torch.arange(mask.shape[-1], device=mask.device).expand_as(mask)
        idx = torch.where(deep, torch.where(mask, rung, torch.full_like(rung, -1)).argmax(dim=-1), idx)
    return torch.where(any_legal, idx, torch.full_like(idx, -1))


# POLICY: the Trader tier sits right after settlers because tradeCapacity
# self-limits it — the unit mask withdraws once free Traders + active routes
# reach capacity, so an early tier trains up to capacity and no more, where a
# tier below "building" NEVER fires (a city almost always has something else
# to raise; measured 0 traders over 250 driven turns).
PROD_PRIORITY = ("settler", "trader", "district", "building", "wonder", "builder", "archaeologist", "engineer", "unit", "galley", "project")

SOLO_TIERS = {"builder": ("builder_idx", True),
              "trader": ("trader_idx", False),
              "archaeologist": ("archaeologist_idx", False),
              "engineer": ("engineer_idx", True),
              "galley": ("galley_idx", False)}


def pick_purchase(can_building: torch.Tensor, settler_ok: torch.Tensor, unit_ok: torch.Tensor,
                  tile_ok: torch.Tensor) -> torch.Tensor:
    kind = torch.full(can_building.shape, -1, dtype=torch.long, device=can_building.device)
    kind = torch.where(tile_ok, torch.full_like(kind, 3), kind)
    kind = torch.where(unit_ok, torch.full_like(kind, 2), kind)
    kind = torch.where(settler_ok, torch.full_like(kind, 1), kind)
    kind = torch.where(can_building, torch.full_like(kind, 0), kind)
    return kind


def pick_faith(worship_ok: torch.Tensor, missionary_ok: torch.Tensor,
               apostle_ok: torch.Tensor, inquisitor_ok: torch.Tensor,
               monk_ok: torch.Tensor | None = None):
    relig = torch.full(worship_ok.shape, -1, dtype=torch.long, device=worship_ok.device)
    if monk_ok is not None:
        relig = torch.where(monk_ok, torch.full_like(relig, 14), relig)
    relig = torch.where(inquisitor_ok, torch.full_like(relig, 11), relig)
    relig = torch.where(apostle_ok, torch.full_like(relig, 6), relig)
    relig = torch.where(missionary_ok, torch.full_like(relig, 5), relig)
    return worship_ok, relig


def pick_monu(builder_ok: torch.Tensor, settler_ok: torch.Tensor) -> torch.Tensor:
    """The Monumentality faith-civilian pick — kind 8 BUILDER, 9 SETTLER,
    settler preferred (expansion first, like the gold ladder)."""
    kind = torch.full(builder_ok.shape, -1, dtype=torch.long, device=builder_ok.device)
    kind = torch.where(builder_ok, torch.full_like(kind, 8), kind)
    kind = torch.where(settler_ok, torch.full_like(kind, 9), kind)
    return kind


# A minor is a CITY, not an empire: the raid needs an army that can take one,
# and a stake in the minor's courtship is worth more than its territory — a
# seat that has spent envoys there leaves it alone.
CS_RAID_STRENGTH = 40.0
CS_RAID_RATE = 0.02

# CITIZEN ASSIGNMENT. A city big enough to spare one puts a citizen in the
# first district that seats one; a city puts one on the first RESOURCE plot it
# can work. Both are ONE per city for the whole game — the automatic rule keeps
# every other citizen, which is what an unmanaged city gets.
SPEC_PIN_POP = 8


def pick_war(mask: torch.Tensor, ctx: dict, rng: dict, style: dict | None = None) -> torch.Tensor:
    """The war head: `[declare per target, sue per target]` over
    `war_targets(row)` — the other majors, then the city-state roster. The
    style's appetite knobs multiply the rates; every default multiplies by
    1.0 and compares against the same floats as always."""
    B, W2 = mask.shape
    n = W2 // 2
    out = torch.full((B,), -1, dtype=torch.long, device=mask.device)
    if n == 0:
        return out
    wa = 1.0 if style is None else float(style["war_appetite"])
    pa = 1.0 if style is None else float(style["peace_appetite"])
    ratio = 1.3 if style is None else float(style["war_ratio"])
    sue_k = first_legal(mask[:, n:] & (rng["peace"] < 0.25 * pa).unsqueeze(1))
    out = torch.where(sue_k >= 0, n + sue_k, out)
    n_opp = int(ctx["opp_str"].shape[1])
    dow_k = first_legal(
        mask[:, :n_opp]
        & ctx["has_cities"]
        & (ctx["prox"] <= 9)
        & (ctx["gang"] | (ctx["own_str"].unsqueeze(1) > ctx["opp_str"] * ratio))
        & (ctx["peace_turns"] > 20).unsqueeze(1)
        & (rng["dow"] < 0.08 * wa * (0.5 + ctx["aggression"])).unsqueeze(1)
    )
    out = torch.where((out < 0) & (dow_k >= 0), dow_k, out)
    if n == n_opp:
        return out
    raid_k = first_legal(
        mask[:, n_opp:n]
        & (ctx["cs_envoys"] <= 0)
        & (ctx["own_str"] > CS_RAID_STRENGTH).unsqueeze(1)
        & (ctx["peace_turns"] > 20).unsqueeze(1)
        & (rng["raid"] < CS_RAID_RATE * wa * (0.5 + ctx["aggression"])).unsqueeze(1)
    )
    return torch.where((out < 0) & (raid_k >= 0), n_opp + raid_k, out)


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
        # the trade-route servicer: legal only under capacity (the mask's
        # gate), so the lane trains one whenever a route slot has no Trader
        "trader_idx": ids.index("TRADER") if "TRADER" in ids else -1,
        # the dig civilian: legal only where a museum slot is free (the mask's
        # gate), and one in flight at a time
        "archaeologist_idx": ids.index("ARCHAEOLOGIST") if "ARCHAEOLOGIST" in ids else -1,
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


def pick_district_tile(elig: torch.Tensor, adj: torch.Tensor) -> torch.Tensor:
    """[B] WHERE to put a district: the eligible tile with the highest
    adjacency, ties to the LOWEST tile index. -1 where nothing is eligible.

    This is the placement CHOICE, and it lives here rather than in either
    engine: a scan per engine would have to agree forever. The policy picks,
    the record carries the tile, and the engines only re-validate it.

    `key = adj*T - idx` then argmax reproduces the TS scan's strict `>` (first
    wins over tile order) without depending on argmax's undefined tie-break.
    """
    T = elig.shape[1]
    ar = torch.arange(T, device=elig.device, dtype=adj.dtype)
    key = torch.where(elig, adj * T - ar, torch.full_like(adj, -1e18))
    best = key.argmax(dim=1)
    return torch.where(elig.any(dim=1), best, torch.full_like(best, -1))


def prod_classes(NB: int, NU: int, n_scaffold: int, n_wonder: int = 0, n_project: int = 0) -> dict:
    ub = NB + 2
    w_lo = ub + NU + n_scaffold
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
    tier_order: tuple | None = None,
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
    carry state ACROSS them: the settler latch, the unit count and the
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
    # roster lanes are city-invariant — slice once, not per j
    if roster is not None and u_lo < W:
        nu0 = min(u_hi, W) - u_lo
        rng_t0, nav0 = roster["is_ranged"][:nu0], roster["naval"][:nu0]
        comb0, rstr0 = roster["combat"][:nu0], roster["ranged_str"][:nu0]
        mel_lane0, rng_lane0 = ~rng_t0 & ~nav0 & (comb0 > 0), rng_t0 & ~nav0
    for j in range(C):
        best = torch.full((B,), -1, dtype=torch.long, device=dev)
        under_cap = n_units < cap
        for name in (tier_order or PROD_PRIORITY):
            if name in SOLO_TIERS:
                key, capped = SOLO_TIERS[name]
                idx = roster[key] if roster else -1
                if idx < 0 or u_lo + idx >= W:
                    continue
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
                mel_ok = legal & mel_lane0
                rng_ok = legal & rng_lane0
                pick_m = u_lo + _best_in_lane(mel_ok, comb0)
                pick_r = u_lo + _best_in_lane(rng_ok, rstr0)
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
            if name == "district" and ctx.get("dist_rot") is not None:
                idx = (torch.arange(sub.shape[1], device=dev) + int(ctx["dist_rot"])) % sub.shape[1]
                rolled = sub[:, idx]
                best = torch.where((best < 0) & rolled.any(dim=1),
                                   lo + idx[rolled.float().argmax(dim=1)], best)
                continue
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


PATROL_DIR_PERM = (3, 4, 2, 5, 1, 0)

U_DHOME, U_DNB, U_NBTILE, U_MP, U_CHARGES, U_CIVILIAN = 0, 1, 7, 13, 14, 15
U_ATWAR, U_DWAR, U_DWARNB = 16, 17, 18   # the war half
U_RINGTILE = 24                          # the 12 ring-2 tile ids
PATROL_HOME_RADIUS = 3


def pick_unit_orders(mask: torch.Tensor, obs: torch.Tensor, *, a_pillage: int, a_snipe: int,
                     a_snipe3: int = -1,
                     home_radius: int = PATROL_HOME_RADIUS) -> torch.Tensor:
    """`a_pillage` / `a_snipe` / `a_snipe3` are the PILLAGE, SNIPE_0 and
    SNIPE3_0 columns of the enum the mask was built from. They are arguments
    and not constants because appending one improvement moves them — every
    BUILD verb sits before them."""
    A_PILLAGE, A_SNIPE = a_pillage, a_snipe
    B, N, W = mask.shape
    dev = mask.device
    atk = mask[:, :, 6:12]
    nb_tile = obs[:, :, U_NBTILE:U_NBTILE + 6]
    BIG = float(10 ** 9)

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
    if a_snipe3 >= 0 and W > a_snipe3:
        s3 = mask[:, :, a_snipe3:a_snipe3 + 18]
        # no ring-3 tile ids in the obs — take the FIRST legal column, which
        # is the lowest ring tile by index (column order IS tile-index order)
        k3 = torch.where(s3, torch.arange(18, device=dev).view(1, 1, 18).expand(B, N, 18),
                         torch.full((B, N, 18), 10 ** 9, dtype=torch.long, device=dev))
        has_s3 = s3.any(dim=2)
        s3_col = k3.argmin(dim=2) + a_snipe3
    else:
        has_s3 = torch.zeros(B, N, dtype=torch.bool, device=dev)
        s3_col = torch.zeros(B, N, dtype=torch.long, device=dev)
    has_atk = (adj_min < BIG) | (sn_min < BIG) | has_s3
    use_ring = sn_min < adj_min
    atk_col = torch.where(use_ring, sn_col, adj_dir + 6)
    atk_col = torch.where((adj_min >= BIG) & (sn_min >= BIG) & has_s3, s3_col, atk_col)

    at_war = obs[:, :, U_ATWAR] > 0
    d_war = obs[:, :, U_DWAR]
    d_war_nb = obs[:, :, U_DWARNB:U_DWARNB + 6]
    legal_mv = mask[:, :, 0:6]
    w_closer = legal_mv & (d_war_nb < d_war.unsqueeze(2))
    w_key = torch.where(w_closer,
                        d_war_nb * 8 + torch.arange(6, device=dev).view(1, 1, 6).to(d_war_nb.dtype),
                        torch.full((B, N, 6), 1e9, dtype=d_war_nb.dtype, device=dev))
    has_wmv = w_closer.any(dim=2)
    w_dir = w_key.argmin(dim=2)
    has_target = d_war < 1e6
    pillage_col = A_PILLAGE
    can_pillage = mask[:, :, pillage_col] if W > A_PILLAGE else torch.zeros(B, N, dtype=torch.bool, device=dev)

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
    out = torch.where(war_march, w_dir, out)
    out = torch.where(at_war & can_pillage, torch.full_like(out, pillage_col), out)
    out = torch.where(has_atk, atk_col, out)                     # attack outranks all
    # a unit with no legal order at all gets no instruction
    return torch.where(mask.any(dim=2), out, torch.full_like(out, -1))
