"""#51/S8.3 — the ladder contract: ONE policy, every seat, actions out.

This lane exists because the ladder is leaving the parity gate's protection.
Once decisions live outside both engines, nothing compares the ladder against a
second implementation any more — that is the POINT (it stops being written
twice) but it means the observation contract and the action shapes need their
own guard.

What is asserted, and why each would otherwise fail silently:
  * the observation SPLITS by the shared layout — a width change on either
    engine breaks the slice rather than quietly shifting every field;
  * the SAME policy accepts seat 0 and a rival and returns the same shapes —
    the moment those diverge, "one ladder for every seat" is untrue;
  * lowest-index tie-break — a policy that breaks ties differently produces a
    different game, and a recorded action file would stop replaying;
  * the ladder actually ADVANCES the world, not just type-checks.
"""
from __future__ import annotations

import pathlib
import sys

import torch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from civ6gpu import load_rules, load_fixture, FIXTURES  # noqa: E402
from civ6gpu.env import BatchEnv  # noqa: E402
import ladder  # noqa: E402
import stamp  # noqa: E402


def main() -> None:
    stamp.check(FIXTURES)
    rules = load_rules()
    p = sorted(FIXTURES.glob("seed*.json"))[0]
    env = BatchEnv([load_fixture(p)], rules, device="cpu", dtype=torch.float64)
    s = env.sim
    layout = {"cs": s.S, "rivals": s.R, "cities": s.C,
              "techs": s.techs.shape[1], "civics": s.civics.shape[1]}
    width = (ladder.EMP + ladder.PER_CS * s.S + ladder.PER_RIVAL * s.R
             + ladder.PER_CITY * s.C + ladder.ESCALATORS
             + s.techs.shape[1] + s.civics.shape[1])

    shapes = {}
    for seat in (0, 1):
        obs = env.observe(seat)
        assert obs.shape[1] == width, (
            f"seat {seat} observation is {obs.shape[1]} wide, layout says {width} — "
            "the shared layout and an engine renderer have drifted"
        )
        blocks = ladder.split(obs, s.S, s.R, s.C, s.techs.shape[1], s.civics.shape[1])
        assert blocks["city"].shape == (s.B, s.C, ladder.PER_CITY)
        acts = ladder.decide(obs, env.masks(seat), layout)
        shapes[seat] = {k: tuple(v.shape) for k, v in acts.items()}
    assert shapes[0] == shapes[1], (
        f"one policy must serve every seat identically: {shapes[0]} vs {shapes[1]}"
    )
    print(f"  a one policy, both seats, obs {width} wide, actions {sorted(shapes[0])} OK")

    m = torch.tensor([[False, True, True], [False, False, False]])
    got = ladder.first_legal(m)
    assert got.tolist() == [1, -1], f"lowest-legal tie-break broke: {got.tolist()}"
    print("  b lowest-index tie-break OK (and -1 when no option is legal)")

    t0, sc0 = int(s.turn), float(s.empire_score()[0])
    for _ in range(20):
        a = ladder.decide(env.observe(0), env.masks(0), layout)
        env.step(production=a["production"], tech=a["tech"], civic=a["civic"], seat=0)
    assert int(s.turn) >= t0 + 20, "the ladder must advance the world"
    assert float(s.empire_score()[0]) > sc0, "a driven empire should grow"
    print(f"  c ladder drove 20 turns (score {sc0:.1f} -> {float(s.empire_score()[0]):.1f}) OK")

    # --- the ENVOY verb, ported from rivals.ts ------------------------------
    # "greedy assignment (neediest met CS by OWN envoys, ties lowest id)".
    # Pinned here because a WRONG pick is still a LEGAL pick: it produces a
    # different game rather than an error, and every recorded action file stops
    # replaying. Nothing else compares the ladder against the rule it ported.
    b = {"cs": torch.tensor([[[1.0, 0.5, 0.0],    # met, 3 envoys
                              [1.0, 0.0, 0.0],    # met, 0 envoys  <- neediest
                              [0.0, 0.0, 0.0]]])} # NOT met
    m = torch.tensor([[True, True, True]])
    assert int(ladder.pick_envoy(b, m)[0]) == 1, "neediest MET city-state wins"
    b2 = {"cs": torch.tensor([[[1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 0.0]]])}
    assert int(ladder.pick_envoy(b2, m)[0]) == 0, "ties break to the LOWEST index"
    b3 = {"cs": torch.tensor([[[0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]]])}
    assert int(ladder.pick_envoy(b3, m)[0]) == -1, "no MET city-state -> no action"
    m4 = torch.tensor([[False, True, True]])
    b4 = {"cs": torch.tensor([[[1.0, 0.0, 0.0], [1.0, 0.5, 0.0], [0.0, 0.0, 0.0]]])}
    assert int(ladder.pick_envoy(b4, m4)[0]) == 1, "the MASK still gates legality"
    print("  d envoy verb OK (neediest met, lowest-index ties, mask-gated)")

    # --- the RESEARCH verb, ported from rivals.ts ---------------------------
    # "sort available by effectiveResearchCostIn, take the first"; JS sort is
    # STABLE, so equal costs keep catalog order = lowest index wins.
    bb = {"costTech": torch.tensor([[0.080, 0.030, 0.100]]),
          "costCivic": torch.tensor([[0.050, 0.050]])}
    mm = torch.tensor([[True, True, True]])
    assert int(ladder.pick_research(bb, mm, "tech")[0]) == 1, "cheapest EFFECTIVE cost wins"
    # THE CASE THAT FORCED THE WIDENING: a BOOSTED 100 beats an unboosted 80.
    # If the observation carried base cost (or a boost flag the policy had to
    # apply itself) this picks the wrong item — index 0 rather than index 2.
    boosted = {"costTech": torch.tensor([[0.080, 0.090, 0.050]])}   # idx2 = 100 boosted
    assert int(ladder.pick_research(boosted, mm, "tech")[0]) == 2, (
        "a boosted expensive tech must beat a cheap unboosted one"
    )
    tie = {"costTech": torch.tensor([[0.030, 0.030, 0.030]])}
    assert int(ladder.pick_research(tie, mm, "tech")[0]) == 0, "ties break LOWEST index"
    gated = torch.tensor([[False, False, True]])
    assert int(ladder.pick_research(tie, gated, "tech")[0]) == 2, "the MASK gates legality"
    none = torch.tensor([[False, False, False]])
    assert int(ladder.pick_research(tie, none, "tech")[0]) == -1, "nothing legal -> no action"
    print("  e research verb OK (effective cost, boosted beats cheap, ties low, mask-gated)")

    # --- the PRODUCTION verb, ported from rivals.ts -------------------------
    # The ladder is a chain of tryQueueRivalX calls, each false when nothing of
    # that kind is legal: settler -> district -> building -> ... -> army. That
    # reduces to FIRST LEGAL CLASS in priority order, lowest index within.
    NB, NU, nS = 4, 5, 2
    cls = ladder.prod_classes(NB, NU, nS)
    W = NB + 2 + NU + nS
    # synthetic 3-unit roster: 0 BUILDER (combat 0), 1 WARRIOR (melee 20),
    # 2 ARCHER (ranged 25). Table order IS the tie-break, as in rules.json.
    ROSTER = ladder.unit_roster([
        {"id": "BUILDER", "combat": 0},
        {"id": "WARRIOR", "combat": 20},
        {"id": "ARCHER", "combat": 15, "rangedStrength": 25},
        {"id": "MILITARY_ENGINEER", "combat": 0},
        {"id": "GALLEY", "combat": 25, "naval": 1},
    ])
    def mk(idxs):
        m = torch.zeros(1, 1, W, dtype=torch.bool)
        for i in idxs:
            m[0, 0, i] = True
        return m
    # settler outranks a district, which outranks a building
    assert int(ladder.pick_production(mk([0, NB, cls["district"][0]]), cls)[0, 0]) == NB
    # the capital gate lives in the MASK, not here: an ungated settler column
    # simply is not legal, and the ladder falls through to the district.
    assert int(ladder.pick_production(mk([0, cls["district"][0]]), cls)[0, 0]) == cls["district"][0]
    # district outranks building
    assert int(ladder.pick_production(mk([0, cls["district"][0]]), cls)[0, 0]) == cls["district"][0]
    # building outranks a unit
    assert int(ladder.pick_production(mk([1, cls["unit"][0]]), cls, ROSTER)[0, 0]) == 1
    # lowest index within a class
    assert int(ladder.pick_production(mk([2, 1]), cls)[0, 0]) == 1
    # nothing legal -> queue nothing
    assert int(ladder.pick_production(mk([]), cls)[0, 0]) == -1

    # #84: CITIES ARE WALKED IN ORDER. The settler is retired once some city
    # takes it, exactly as rivals.ts's settlerQueued does — a snapshot mask says
    # "legal" in every idle city, and scoring them independently queued one per
    # city (63.83% agreement with the engine; 100.00% with the walk).
    def mk2(rows):
        m = torch.zeros(1, len(rows), W, dtype=torch.bool)
        for j, idxs in enumerate(rows):
            for i in idxs:
                m[0, j, i] = True
        return m
    both = ladder.pick_production(mk2([[NB, cls["district"][0]], [NB, 1]]), cls)
    assert int(both[0, 0]) == NB, "first city takes the settler"
    assert int(both[0, 1]) == 1, "second city must NOT — it falls to the building"
    # and an incoming settler retires the column for the FIRST city too
    pre = torch.ones(1, dtype=torch.bool)
    held = ladder.pick_production(mk2([[NB, cls["district"][0]]]), cls,
                                  ctx={"settler_queued": pre})
    assert int(held[0, 0]) == cls["district"][0]
    # the walk must not leak ACROSS batch entries
    solo = ladder.pick_production(mk2([[NB], [NB]]), cls)
    assert [int(solo[0, 0]), int(solo[0, 1])] == [NB, -1]

    # AUDIT B-10: the ARMY is two lanes, NOT a lowest-index pick. Porting it as
    # lowest-index agreed with the engine on only 45.94% of 3267 decisions —
    # and a 30-turn smoke test showed 100%, because early game has one legal
    # unit. Scale is what caught it.
    u0, u1, u2 = (cls["unit"][0] + i for i in range(3))
    allu = mk([u0, u1, u2])
    # BUILDER (combat 0) is its own tier ABOVE the army and wins when legal...
    assert int(ladder.pick_production(allu, cls, ROSTER)[0, 0]) == u0
    # ...and without it the melee lane takes WARRIOR over the weaker ARCHER,
    # never the lowest index.
    assert int(ladder.pick_production(mk([u1, u2]), cls, ROSTER)[0, 0]) == u1
    # ranged while the army holds fewer than 1 ranged per 2 melee
    hungry = {"melee": torch.tensor([2]), "ranged": torch.tensor([0])}
    assert int(ladder.pick_production(mk([u1, u2]), cls, ROSTER, hungry)[0, 0]) == u2
    # satisfied composition falls back to the melee lane
    full = {"melee": torch.tensor([2]), "ranged": torch.tensor([1])}
    assert int(ladder.pick_production(mk([u1, u2]), cls, ROSTER, full)[0, 0]) == u1
    # the unit CAP is not in the mask, so the ladder must honour it
    capped = {"unit_count": torch.tensor([3]), "unit_cap": torch.tensor([3])}
    assert int(ladder.pick_production(mk([u1, u2]), cls, ROSTER, capped)[0, 0]) == -1
    # composition threads across cities: 2 melee/0 ranged wants ranged first,
    # and the ARCHER it just queued must count toward the next city's ratio
    two = ladder.pick_production(mk2([[u1, u2], [u1, u2]]), cls, ROSTER, hungry)
    assert [int(two[0, 0]), int(two[0, 1])] == [u2, u1]

    # #83: MILITARY_ENGINEER and the B-6 GALLEY are single-column TIERS. Both
    # are invisible to the army lanes (combat 0 / naval), so before they had
    # tiers they were simply never picked — 57 and 29 missed engine decisions.
    eng, gal = cls["unit"][0] + 3, cls["unit"][0] + 4
    # engineer outranks the army, and the army outranks the galley
    assert int(ladder.pick_production(mk([u1, eng]), cls, ROSTER)[0, 0]) == eng
    assert int(ladder.pick_production(mk([u1, gal]), cls, ROSTER)[0, 0]) == u1
    # ...but the builder still outranks the engineer
    assert int(ladder.pick_production(mk([u0, eng]), cls, ROSTER)[0, 0]) == u0
    # the engineer IS cap-gated; the galley deliberately is NOT — the picker
    # reaches it only when the army branch missed BECAUSE the cap was full
    atcap = {"unit_count": torch.tensor([3]), "unit_cap": torch.tensor([3])}
    assert int(ladder.pick_production(mk([u1, eng]), cls, ROSTER, atcap)[0, 0]) == -1
    assert int(ladder.pick_production(mk([u1, gal]), cls, ROSTER, atcap)[0, 0]) == gal

    # #84: each solo tier is ONE PER CIV and the engine's gate reads rc_current
    # live, so it retires mid-walk. Two idle cities both offered a builder must
    # NOT both take one — the second falls through to the army.
    solo = ladder.pick_production(mk2([[u0, u1], [u0, u1]]), cls, ROSTER)
    assert [int(solo[0, 0]), int(solo[0, 1])] == [u0, u1]
    # same for the engineer, and for the galley at cap
    seng = ladder.pick_production(mk2([[eng], [eng]]), cls, ROSTER)
    assert [int(seng[0, 0]), int(seng[0, 1])] == [eng, -1]
    sgal = ladder.pick_production(mk2([[gal], [gal]]), cls, ROSTER, atcap)
    assert [int(sgal[0, 0]), int(sgal[0, 1])] == [gal, -1]

    print("  f production verb OK (class priority, no capital gate, "
          "lowest-index within class, B-10 army lanes, counters threaded, "
          "engineer/galley tiers)")

    # ---- g) the UNIT-ORDERS verb (#69/#70) --------------------------------
    # Three lines in rivals.ts: attack a hostile in reach (lowest TARGET TILE
    # index), else drift home past the stop radius, else hold. Legality is the
    # mask's; the distances are the observation's — this verb is the reason the
    # observation needed a per-unit block at all.
    UW, UN = 26, 2
    def umask(rows):
        m = torch.zeros(1, UN, UW, dtype=torch.bool)
        for j, cols in enumerate(rows):
            for c in cols:
                m[0, j, c] = True
        return m
    def uobs(rows):
        o = torch.zeros(1, UN, 16, dtype=torch.float64)
        for j, (dh, dnb, nbt) in enumerate(rows):
            o[0, j, ladder.U_DHOME] = dh
            for i in range(6):
                o[0, j, ladder.U_DNB + i] = dnb[i]
                o[0, j, ladder.U_NBTILE + i] = nbt[i]
        return o

    far = [9.0] * 6
    # attack outranks the drift, and picks the LOWEST TARGET TILE, not the
    # lowest direction — dir 4 holds tile 10, dir 2 holds tile 50.
    m = umask([[2, 8, 10], [12]])
    o = uobs([(9.0, far, [99, 99, 50, 99, 10, 99]), (0.0, far, [0] * 6)])
    got = ladder.pick_unit_orders(m, o)
    assert int(got[0, 0]) == 10, f"attack must take the lowest TARGET TILE, got {int(got[0,0])}"

    # no hostile: drift to a strictly CLOSER neighbour, ties by PATROL_DIR_PERM
    # (3 before 4 before 2 ...), not by direction index
    m = umask([[0, 1, 2, 3, 4, 5], [12]])
    o = uobs([(9.0, [8.0, 8.0, 8.0, 8.0, 8.0, 9.0], [0] * 6), (0.0, far, [0] * 6)])
    assert int(ladder.pick_unit_orders(m, o)[0, 0]) == 3, "patrol tie-break must follow PATROL_DIR_PERM"

    # a neighbour that is NOT closer is never taken as a drift
    o = uobs([(9.0, [9.0, 9.0, 9.0, 9.0, 9.0, 9.0], [0] * 6), (0.0, far, [0] * 6)])
    assert int(ladder.pick_unit_orders(m, o)[0, 0]) == 12, "no closer neighbour -> HOLD"

    # inside the stop radius the unit holds even with a closer step available
    o = uobs([(2.0, [1.0] * 6, [0] * 6), (0.0, far, [0] * 6)])
    assert int(ladder.pick_unit_orders(m, o)[0, 0]) == 12, "within the radius the drift stops"

    # nothing legal at all -> no instruction, which is not the same as HOLD
    assert int(ladder.pick_unit_orders(umask([[], []]), uobs([(9.0, far, [0]*6)]*2))[0, 0]) == -1
    print("  g unit-orders verb OK (attack by lowest target tile, PATROL_DIR_PERM "
          "drift, stop radius, hold vs no-instruction)")

    print("LADDER CONTRACT OK")


if __name__ == "__main__":
    main()
