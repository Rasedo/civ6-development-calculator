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
EMP = 14  # empire block width
EMP_FIELDS = (
    "turn", "techs", "civics", "techProg", "civicProg", "settlers",
    "settlersQueued", "cities", "treasury", "envoysAvail", "influence",
    "camps", "barbs", "units",
)
PER_CS = 3    # met, envoys/6, hasQuest
PER_RIVAL = 3  # atWar, warTurns/14, cities/6
ESCALATORS = 3  # district, settler, builder — the only NON-static prices
PER_CITY = 9  # alive, pop/10, foodBox/need, progress/cost, cultureBox/cost,
              # ownedTiles/20, hp/200, loyalty/100, hasQueue
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
    for key in ("production", "tech", "civic", "units"):
        m = masks.get(key)
        if m is not None:
            out[key] = first_legal(m)
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
