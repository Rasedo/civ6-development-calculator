"""#51/S8.3 — THE LADDER: one policy, outside both engines, for every seat.

WHY THIS FILE EXISTS. "What should a civ do this turn" is currently written
FIVE times: the scripted player policy in `scripts/export-gpu.ts`, the rival
ladder in `src/core/rivals.ts` (1129 lines), the GPU's own rival ladder in
`civ6gpu/engine.py`, `src/core/rlenv.ts:autoMilitary`, and eventually the
trained net. The two rival ladders must agree TURN-EXACTLY, which is most of
what the parity gate spends its time proving.

THE LINE (settled with the owner, 2026-08-01): anything that must be identical
BETWEEN THE ENGINES is a RULE and belongs in the TS spec. Anything that need
only be identical BETWEEN RUNS is a POLICY and belongs once, here. An opponent
AI is no more part of Civ 6's rules than Firaxis' AI is part of the rules of
Civ; the ladder was being held to the spec bar and was never entitled to it.

WHAT THAT CHANGES. Parity stops having to prove "both engines DECIDE the same
and apply the same" and only has to prove "both engines APPLY the same actions
the same way". Nearly every bug of the 2026-08-01 round was a rule present in
one seat's turn body and absent from the other's; with decisions out here, that
whole class stops being a parity risk.

NO LIVE IPC IS NEEDED FOR THE GATE. The batched ladder writes an action file
and both engines replay it — exactly what `rollout.json` already does for the
player. THE FILE IS THE INTERFACE. Live calls are only for a human at a UI:
one game, human speed, where a round trip is free.

TWO MODES PER SEAT, which is what self-play needs: `seat_ext[B, NS]` (e3d1e84)
says who drives each seat — False = this ladder, True = actions from outside
(a net). Seat 0 has a column now; it did not before, so the player could not be
AI-driven and a net had nowhere to attach for it.

STATUS: the observation contract and the seat-generic action surface are in
place (`observeSeat` in TS, `observe(seat)` on the GPU, verified equal field for
field at 83 wide). This module is the skeleton those feed; the per-verb policy
bodies port over from `rivals.ts` one at a time, each gated the usual way.
"""
from __future__ import annotations

import torch

# Observation layout, shared by both engines. Keep in step with
# `src/core/seatTurn.ts:observeSeat` and `civ6gpu/env.py:BatchEnv.observe`.
EMP = 15  # empire block width
EMP_FIELDS = (
    "turn", "techs", "civics", "techProg", "civicProg", "settlers",
    "settlersQueued", "cities", "treasury", "envoysAvail", "influence",
    "camps", "barbs", "units", "rangedUnits",
)
PER_CS = 3    # met, envoys/6, hasQuest
PER_RIVAL = 3  # atWar, warTurns/14, cities/6
ESCALATORS = 3  # district, settler, builder — the only NON-static prices
PER_CITY = 10  # alive, pop/10, foodBox/need, progress/cost, cultureBox/cost,
              # ownedTiles/20, hp/200, loyalty/100, hasQueue, isCapital
# #51/S8.4 (#66): the trailing BOOST blocks — one flag per tech, then per civic,
# in `Object.values(TECHS)` / `Object.values(CIVICS)` order (what the exporter
# ships and both engines' planes use). The research pick is lowest EFFECTIVE
# cost and a boost is -50%, so WITHOUT these a policy cannot reproduce the
# engine's own choice — see task #66.


def split(obs: torch.Tensor, n_cs: int, n_rivals: int, n_cities: int,
          n_techs: int, n_civics: int) -> dict[str, torch.Tensor]:
    """Slice a [B, F] observation into its four blocks.

    The layout is positional and shared with TS; anything reading an
    observation goes through here rather than hardcoding offsets a second
    time — the second copy is how the schema drifts (see #51/S8.1c, where the
    GPU's rival renderer had drifted into reporting zero treasury and constant
    loyalty because nothing compared observations)."""
    b = obs.shape[0]
    i = EMP
    emp = obs[:, :i]
    cs = obs[:, i:i + PER_CS * n_cs].reshape(b, n_cs, PER_CS)
    i += PER_CS * n_cs
    riv = obs[:, i:i + PER_RIVAL * n_rivals].reshape(b, n_rivals, PER_RIVAL)
    i += PER_RIVAL * n_rivals
    city = obs[:, i:i + PER_CITY * n_cities].reshape(b, n_cities, PER_CITY)
    i += PER_CITY * n_cities
    # #51/S8.4b (#66): the three ESCALATING production costs — district,
    # settler, builder. Every other production price is STATIC rules data the
    # ladder loads from `rules.json`; static data is not state and carrying it
    # in an observation is noise a policy must learn to ignore.
    esc = obs[:, i:i + 3]
    i += 3
    n_t, n_c = n_techs, n_civics
    boost_t = obs[:, i:i + n_t]
    i += n_t
    boost_c = obs[:, i:i + n_c]
    i += n_c
    assert i == obs.shape[1], f"observation width {obs.shape[1]} != layout {i}"
    return {"empire": emp, "cs": cs, "rival": riv, "city": city,
            "escalators": esc, "costTech": boost_t, "costCivic": boost_c}


def first_legal(mask: torch.Tensor) -> torch.Tensor:
    """[..., K] bool -> [...] long: the lowest legal index, -1 if none.

    The tie-break both engines already use for scripted picks is
    LOWEST-INDEX-WINS, and it must stay that way: a policy that breaks ties
    differently produces a different game, not a wrong one, but the recorded
    action file would stop replaying."""
    any_legal = mask.any(dim=-1)
    idx = mask.float().argmax(dim=-1)
    return torch.where(any_legal, idx, torch.full_like(idx, -1))


def decide(obs: torch.Tensor, masks: dict[str, torch.Tensor], layout: dict[str, int]) -> dict[str, torch.Tensor]:
    """(observation, legality masks) -> actions, for ONE seat, batched.

    Deliberately minimal today: take the lowest legal option per decision,
    which is the tie-break the scripted pickers already use. The real ladder
    bodies port from `rivals.ts` incrementally; what matters structurally is
    that a policy READS AN OBSERVATION and RETURNS ACTIONS, so the AI and a net
    are interchangeable at one seam.
    """
    blocks = split(obs, layout["cs"], layout["rivals"], layout["cities"],
                   layout["techs"], layout["civics"])
    out: dict[str, torch.Tensor] = {}
    for key in ("production", "units"):
        m = masks.get(key)
        if m is not None:
            out[key] = first_legal(m)
    for key, kind in (("tech", "tech"), ("civic", "civic")):
        m = masks.get(key)
        if m is not None:
            out[key] = pick_research(blocks, m, kind)   # #51: ported verb
    if masks.get("envoy") is not None:
        out["envoy"] = pick_envoy(blocks, masks["envoy"])   # #51: first ported verb
    return out


def pick_envoy(blocks: dict, mask: torch.Tensor) -> torch.Tensor:
    """[B] long — the ENVOY verb, ported from `rivals.ts`.

    The rule there is one line: "greedy assignment (neediest met CS by OWN
    envoys, ties lowest id)". Neediest = fewest envoys this seat has already
    placed; ties break to the lowest city-state index, which is the same
    lowest-index-wins convention every scripted picker uses and which the
    recorded action file depends on.

    PORTED WITHOUT WIDENING THE OBSERVATION, and that is the point of doing the
    enumeration first: the rule reads only `met` and this seat's OWN envoy
    count, and the city-state block already carries both (met, envoys/6,
    hasQuest). Nothing new was needed, so nothing new was added.

    NOT CARRIED, deliberately: how many envoys OTHER seats hold at each
    city-state. The ported rule does not consult it, so adding it now would be
    speculative — but a policy that wanted to CONTEST a suzerainty would need
    it, and it is engine-computed and not derivable from the catalog. Record it
    when a verb actually reads it; do not widen on a guess.
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
    """[B] long — the RESEARCH verb (tech or civic), ported from `rivals.ts`.

    The rule there sorts the available items by `effectiveResearchCostIn` and
    takes the first. `Array.prototype.sort` is stable, so equal costs keep
    CATALOG order — i.e. ties break to the lowest index, the same convention as
    every other scripted picker and the one the recorded action files depend on.

    This is the verb that forced the observation to carry EFFECTIVE cost rather
    than base cost plus a boost flag (#51/S8.4): a boost is -50%, so a boosted
    100-cost item beats an unboosted 80, and base-cost order and effective-cost
    order diverge whenever boosts are live. Emitting the flag instead would have
    put `base*(1-frac)` — a RULE — inside the policy.

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


#: Production action classes, in the RIVAL LADDER's priority order. The engine
#: encoding is: buildings [0, NB), SETTLER = NB, IDLE = NB+1,
#: units [NB+2, NB+2+NU), districts above those, purchases last.
#:
#: The order is `rivals.ts`'s chain verbatim, MINUS two branches this cannot
#: express yet, both recorded rather than silently skipped:
#:   * WONDER sits between building and builder — the rival action space has no
#:     wonder column at all (task #83), so there is nothing to select.
#:   * WONDER sits between building and builder and still has no mask column.
#: MILITARY_ENGINEER and the B-6 GALLEY are single-column tiers like the
#: builder: both have combat 0 or are naval, so neither can ever win an army
#: lane, and without their own tier they were simply never picked (57 and 29
#: missed engine decisions respectively). The GALLEY sits BELOW the army and is
#: deliberately NOT cap-gated — the picker queues it only when the army branch
#: missed because the cap was full, and counts it afterwards.
PROD_PRIORITY = ("settler", "district", "building", "builder", "engineer", "unit", "galley")

#: single-column tiers -> (roster key, is it gated by the unit cap)
SOLO_TIERS = {"builder": ("builder_idx", True),
              "engineer": ("engineer_idx", True),
              "galley": ("galley_idx", False)}


def unit_roster(units: list[dict]) -> dict:
    """Per-unit selection data for the B-10 two-lane pick, straight off the
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


def prod_classes(NB: int, NU: int, n_scaffold: int) -> dict:
    """Index ranges per production class, from the engine's own constants.

    Passed IN rather than hardcoded: the ladder must not carry a second copy of
    the action encoding, or it drifts from the engine the way every other
    duplicated definition in this codebase has.
    """
    ub = NB + 2
    return {
        "building": (0, NB),
        "settler": (NB, NB + 1),
        "unit": (ub, ub + NU),
        "district": (ub + NU, ub + NU + n_scaffold),
    }


def pick_production(
    mask: torch.Tensor,
    classes: dict,
    roster: dict | None = None,
    ctx: dict | None = None,
) -> torch.Tensor:
    """[B, C] long — the PRODUCTION verb, ported from `rivals.ts`.

    The rival ladder is a chain of `tryQueueRivalX` calls, each returning false
    when nothing of that kind is legal:
        settler -> district -> building -> (wonder) -> builder -> army
    which reduces to FIRST LEGAL CLASS in priority order — but ONLY the first
    three classes reduce to "lowest index within the class". The army does not,
    and that cost 50 points of agreement when this verb was first ported.

    NO CAPITAL GATE, in the ladder or anywhere else (#82). It used to sit in the
    rival's MASK — so a rival's action space could not express "settle from a
    second city" at all, while the player's could — and again in both scripted
    ladders. All three are gone; `queueSettler`'s "any city" is now the single
    shared rule, which is also Civ 6's. The two masks agree on that column now.

    CITIES ARE WALKED IN ORDER, not scored independently, because the rules this
    replaces carry state ACROSS them (task #84): `settlerQueued`, `unitCount`,
    and the `meleeCount`/`rangedCount` army composition are all updated inside
    the TS city loop and the engine mirrors each one. A snapshot mask cannot say
    "city 0 just took the settler", so a stateless pass queues one per city.
    MEASURED against the engine over 12 seeds x 250 turns: 45.94% stateless,
    49.53% once the settler threads, 100% only with the army lanes below.

    THE ARMY (AUDIT B-10) is two lanes, not a lowest-index pick:
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
    # #84: the CITY CAP is policy and no longer sits in the mask. Civ 6 has no
    # cap; it is the rival ladder's own "stop expanding" heuristic, so it lives
    # here with the rest of the policy. Absent -> no cap, never a silent ban.
    n_cities, city_cap = col("n_cities", 0), col("city_cap", 10 ** 9)
    room = n_cities < city_cap
    melee, ranged = col("melee", 0), col("ranged", 0)
    n_units, cap = col("unit_count", 0), col("unit_cap", 10 ** 9)
    b_idx = roster["builder_idx"] if roster else -1

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
                # #84 again (4th, 5th and 6th instances): every one of these is
                # ONE PER CIV and the engine's gate reads rc_current LIVE, so it
                # retires the moment any city queues one. The mask is a snapshot
                # taken before the walk and keeps saying "legal" for the rest of
                # them, so without this the ladder queues a builder, an engineer
                # or a galley in every idle city at once.
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
U_ATWAR, U_DWAR, U_DWARNB = 16, 17, 18   # #91 the war half
U_RINGTILE = 24                          # #92: the 12 ring-2 tile ids
#: unit-action enum geometry (#92). PILLAGE is NOT the last column any more —
#: SNIPE_0..11 sit after it. Consumers key on these, never on W-1.
A_PILLAGE = 25
A_SNIPE = 26

#: how close to home the patrol stops drifting (engine's `d_home > 3`).
PATROL_HOME_RADIUS = 3


def pick_unit_orders(mask: torch.Tensor, obs: torch.Tensor, home_radius: int = PATROL_HOME_RADIUS) -> torch.Tensor:
    """[B, N] long — ONE order per unit, ported from `_rival_unit_peace_act`.

    The scripted peace rule is three lines:
        1. attack a hostile in reach, target = LOWEST TILE INDEX
        2. else drift home when further than `home_radius`
        3. else hold

    Legality comes from `mask` [B, N, 26]; the distances and neighbour tile ids
    come from `obs` [B, N, 16] (#69) — the masks say which orders are LEGAL and
    never which one the verb wants, which is why the observation had to grow a
    per-unit block before this verb could be ported at all.

    ONE STEP PER CALL, deliberately. The scripted patrol walks REAL MP (2.78
    tiles per moving unit-turn, measured), and #90 gave the action space a
    direction SEQUENCE so that is expressible. But choosing step 2 needs to know
    where step 1 lands, and the observation is 1-HOP: it carries each
    neighbour's distance to home and nothing beyond. So the DRIVER re-observes
    and calls again while units still have MP, rather than this guessing a path
    it cannot see. A net, which may commit several steps at once, can fill the
    sequence directly — the action space supports both.

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
    #    (d=2, #92 SNIPE) targets INTERLEAVE by index. Compare both against one
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

    # 2a. WAR MARCH (#91) — while at war with a live target, step to the
    #     neighbour STRICTLY CLOSER to the war target; ties in DIRECTION ORDER
    #     (the engine's war march scans `arange6`, unlike the patrol's
    #     PATROL_DIR_PERM — two different tie-breaks, deliberately preserved).
    #     PILLAGE-underfoot outranks the march: the scripted rule pillages
    #     before marching, and the mask's A-21 column (#89) carries legality.
    at_war = obs[:, :, U_ATWAR] > 0
    d_war = obs[:, :, U_DWAR]
    d_war_nb = obs[:, :, U_DWARNB:U_DWARNB + 6]
    legal_mv = mask[:, :, 0:6]
    w_closer = legal_mv & (d_war_nb < d_war.unsqueeze(2))
    # the ENGINE's march key is `d_nb * 8 + dir` — MIN DISTANCE first, then
    # direction order. Ranking all closer neighbours by direction alone picked
    # a different (legal, closer, but not closest) step whenever two
    # directions both approached the target: the 30-case ('move','move')
    # residual class, gone with this key.
    w_key = torch.where(w_closer,
                        d_war_nb * 8 + torch.arange(6, device=dev).view(1, 1, 6).to(d_war_nb.dtype),
                        torch.full((B, N, 6), 1e9, dtype=d_war_nb.dtype, device=dev))
    has_wmv = w_closer.any(dim=2)
    w_dir = w_key.argmin(dim=2)
    has_target = d_war < 1e6
    pillage_col = A_PILLAGE                   # #92: NOT W-1 — SNIPE sits after it
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
    # #92 re-bucket: NO PEACE DRIFT AT WAR. The engine's war act stands its
    # ground when no target is reachable (`moving = march & has_tgt`) — it
    # never walks home — while this fell through to the patrol and proposed
    # exactly that, 203 times. A unit at war either marches on a target,
    # fights, pillages, or HOLDS.
    out = torch.where(roam & ~at_war, mv_dir, out)               # peace drift only at peace
    war_march = at_war & has_target & has_wmv
    out = torch.where(war_march, w_dir, out)                     # the war march
    out = torch.where(at_war & can_pillage, torch.full_like(out, pillage_col), out)
    out = torch.where(has_atk, atk_col, out)                     # attack outranks all
    # a unit with no legal order at all gets no instruction
    return torch.where(mask.any(dim=2), out, torch.full_like(out, -1))
