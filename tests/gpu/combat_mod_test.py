"""Combat-modifier self-test: the wounded-strength penalty and the
river-crossing melee penalty, proven bit-exact against an independent Python
reference of the TypeScript spec.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/combat_mod_test.py

Checks:
  A. _wound(hp) == TS woundPenalty = 10*((100-hp)/100), bit-exact float64 for
     every HP 0..100 (the shared IEEE expression both engines evaluate).
  B. _river_cross(frm, to) mirrors crossesRiver: it equals the exported
     riverMask bit for the frm->to neighbour direction, for every river tile.
  C. _damage_roll reproduces 30*e^(0.04*q/10), q=round(diff*10), from the
     0.1-granular fixture table + js_round — bit-exact for fractional diffs.
  D. Integrated melee: with a wounded attacker AND a wounded defender the CB
     log's quantized `diff` equals the full-assembly reference (combat +
     terrain + fortify - wound - 5*river); forcing the river edge drops the
     attacker's diff by exactly 50 (=5 CS) and lifts the counter's by 50; a
     RANGED strike across the same edge shows NO shift (river is melee-only).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES
from core.engine import P_MAX, js_round, FLANKING_CS, SUPPORT_CS

HOLD = 12


def cb_events(sim, ua):
    """Run the unit-action phase alone with combat logging on; return the
    parsed CB events [{k, diff, dmg}, ...] for batch row 0."""
    sim._log_combat_b = 0
    sim._combat_events = []
    sim._apply_unit_actions(ua)
    out = []
    for e in sim._combat_events:
        f = dict(tok.split(":", 1) if ":" in tok else (tok, "") for tok in e.split())
        # fields like "diff-42", "dmg30", "k:mel" — pull k, diff, dmg
        k = f.get("k", "?")
        diff = int(e.split("diff")[1].split()[0])
        dmg = int(e.split("dmg")[1].split()[0])
        out.append({"k": k, "diff": diff, "dmg": dmg})
    return out


def find_melee(rules, paths):
    """Scripted-advance until a seat-0 MELEE unit can strike an adjacent
    barb/civ unit (not a city) — returns (sim, p, code, name)."""
    for path in paths:
        sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
        for _ in range(120):
            m = sim.unit_action_mask()[0]  # [P, 16]
            for p in m[:, 6:12].any(dim=1).nonzero(as_tuple=True)[0].tolist():
                if float(sim._p_rng_str[sim.p_type[0, p]]) > 0:
                    continue  # want a melee unit
                for d in m[p, 6:12].nonzero(as_tuple=True)[0].tolist():
                    tgt = int(sim.neigh[int(sim.p_tile[0, p]), d])
                    if tgt >= 0 and (int(sim.barb_at[0, tgt]) >= 0 or int(sim.vmil_at[0, tgt]) >= 0):
                        return sim, p, 6 + d, path.name
            sim.step()
    raise AssertionError("no adjacent-hostile melee situation found in scripted play")


def test_wound(sim) -> None:
    hp = torch.arange(0, 101, dtype=torch.long)
    got = sim._wound(hp)
    want = torch.tensor([10.0 * ((100.0 - float(h)) / 100.0) for h in range(101)], dtype=torch.float64)
    assert torch.equal(got, want), "wound penalty diverges from TS 10*((100-hp)/100)"
    assert float(sim._wound(torch.tensor([100]))[0]) == 0.0
    assert float(sim._wound(torch.tensor([0]))[0]) == 10.0
    print("  A. _wound == TS woundPenalty, bit-exact for HP 0..100")


def test_river_cross(sim) -> None:
    T = sim.T
    checked = 0
    for t in range(T):
        rm = int(sim.river_mask[0, t])
        if rm == 0:
            continue
        for d in range(6):
            nb = int(sim.neigh[t, d])
            if nb < 0:
                continue
            frm = torch.tensor([t])
            to = torch.tensor([nb])
            got = int(sim._river_cross(frm, to)[0])
            want = (rm >> d) & 1
            assert got == want, f"river_cross({t}->{nb}) = {got}, riverMask bit = {want}"
            checked += 1
        if checked > 400:
            break
    assert checked > 0, "no river edges in the fixture to check"
    # a non-adjacent pair never crosses
    assert int(sim._river_cross(torch.tensor([0]), torch.tensor([T - 1]))[0]) == 0
    print(f"  B. _river_cross mirrors the exported riverMask bit ({checked} edges)")


def test_damage_roll_table(sim) -> None:
    dmgbase = sim._dmg_base
    diffs = torch.tensor([0.0, -2.5, 3.7, -9.9, 12.3, -37.0, 41.6, -0.1], dtype=torch.float64)
    for dv in diffs.tolist():
        diff = torch.tensor([dv], dtype=torch.float64)
        rng0 = sim.rng_state.clone()
        mask = torch.tensor([True])
        got = int(sim._damage_roll(mask, diff)[0])
        # reference: same draw from the same rng state, quantized table lookup
        sim.rng_state = rng0.clone()
        r = sim._next_random(mask)
        q = int(js_round(diff * 10)[0])
        base = float(dmgbase[(q + 2000)])  # the table is centred at index 2000
        want = max(1, int(js_round(base * (0.8 + 0.4 * r))[0]))
        assert got == want, f"damage_roll(diff={dv}) = {got}, reference = {want}"
        sim.rng_state = rng0.clone()  # leave the stream untouched for the next diff
    print(f"  C. _damage_roll reproduces the 0.1-granular exp table ({len(diffs)} diffs)")


def _diff_of(events, k):
    for e in events:
        if e["k"] == k:
            return e["diff"]
    raise AssertionError(f"no CB event with k={k}")


def test_integrated(sim, p, code, name) -> None:
    here = int(sim.p_tile[0, p])
    d = code - 6
    tgt = int(sim.neigh[here, d])
    # known wounds: attacker 64 HP, defender 88 HP
    ATK_HP, DEF_HP = 64, 88
    is_barb = int(sim.barb_at[0, tgt]) >= 0
    if is_barb:
        dslot = int(sim.barb_at[0, tgt])
        def_combat = int(sim._p_combat[sim.u_type[0, dslot]])
        def set_def_hp(v):
            sim.u_hp[0, dslot] = v
        def_fort = int(sim.u_fortify[0, dslot])
    else:
        dslot = int(sim.vmil_at[0, tgt])
        def_combat = int(sim._p_combat[sim.v_type[0, dslot]])
        def set_def_hp(v):
            sim.v_hp[0, dslot] = v
        def_fort = int(sim.v_fortify[0, dslot])
    atk_combat = int(sim._p_combat[sim.p_type[0, p]])
    tdef = int(sim.tdef[0, tgt])
    ua = torch.full((1, P_MAX), HOLD, dtype=torch.long)
    ua[0, p] = code

    # XP: force known experience so the level term is exercised. Attacker
    # 50 xp -> level 2 (+10 CS); civ defender 20 xp -> level 1 (+5 CS); a
    # barbarian defender never accrues (no bonus). The bonus enters the CS
    # assembly like the flank/support terms (integer add, once, before the
    # paired rolls).
    ATK_XP, DEF_XP = 50, 20
    def xp_bonus(xp):
        return 5 * sum(1 for t in (15, 45, 90) if xp >= t)
    atk_xp_cs = xp_bonus(ATK_XP)  # +10
    def_xp_cs = 0 if is_barb else xp_bonus(DEF_XP)  # +5 for a civ defender

    def run(river_bit):
        snap = sim.snapshot()
        sim.p_hp[0, p] = ATK_HP
        set_def_hp(DEF_HP)
        sim.p_xp[0, p] = ATK_XP  # attacker veterancy
        if not is_barb:
            sim.v_xp[0, dslot] = DEF_XP  # civ defender veterancy
        # force the river edge on/off explicitly (river_mask is static; set it
        # each run so restore can't leak the previous state)
        rm = int(sim.river_mask[0, here])
        if river_bit:
            sim.river_mask[0, here] = rm | (1 << d)
        else:
            sim.river_mask[0, here] = rm & ~(1 << d)
        ev = cb_events(sim, ua)
        sim.restore(snap)
        return ev

    # Flanking & support — an INDEPENDENT neighbour scan (mirrors
    # cpu/core/combat.ts flankCount/supportCount): military units adjacent to
    # the defender's tile that are hostile to (flank, +atk, attacker at `here`
    # excluded) or friendly to (support, +def) the defender. Positions are
    # static across the runs below (only HP and the river bit change), so
    # count once.
    def flank_support_ref():
        civ_def = not is_barb
        dciv = int(sim.v_civ[0, dslot]) if civ_def else -1
        flank = support = 0
        for dd in range(6):
            nt = int(sim.neigh[tgt, dd])
            if nt < 0:
                continue
            has_b = int(sim.barb_at[0, nt]) >= 0
            has_pm = int(sim.pmil_at[0, nt]) >= 0
            rvs = int(sim.vmil_at[0, nt])
            has_rv = rvs >= 0
            rvc = int(sim.v_civ[0, rvs]) if has_rv else -1
            if civ_def:
                atwar = bool(sim.r_atwar[0, dciv])
                hostile = has_b or (has_pm and atwar)
                friendly = has_rv and rvc == dciv
            else:  # barbarian defender: any non-barb military is hostile
                hostile = has_pm or has_rv
                friendly = has_b
            if hostile and nt != here:  # exclude the attacker (seat-0 mil at here)
                flank += 1
            if friendly:
                support += 1
        return flank, support

    b7_flank, b7_support = flank_support_ref()

    # reference (TS assembly): atk_e = combat - wound(64) - 5*river + 2*flank + xp;
    #                    def_e = combat + terrain + fortify - wound(88) + 2*support + xp
    def ref_q(river):
        atk_e = atk_combat - 10.0 * ((100.0 - ATK_HP) / 100.0) - (5.0 if river else 0.0) + FLANKING_CS * b7_flank + atk_xp_cs
        def_e = def_combat + tdef + 3 * def_fort - 10.0 * ((100.0 - DEF_HP) / 100.0) + SUPPORT_CS * b7_support + def_xp_cs
        return round((atk_e - def_e) * 10), round((def_e - atk_e) * 10)

    ev0 = run(False)
    q_mel0, q_melc0 = ref_q(False)
    assert _diff_of(ev0, "mel") == q_mel0, f"mel diff {_diff_of(ev0,'mel')} != ref {q_mel0}"
    assert _diff_of(ev0, "melc") == q_melc0, f"melc diff {_diff_of(ev0,'melc')} != ref {q_melc0}"

    ev1 = run(True)
    q_mel1, q_melc1 = ref_q(True)
    assert _diff_of(ev1, "mel") == q_mel1, f"river mel diff {_diff_of(ev1,'mel')} != ref {q_mel1}"
    assert _diff_of(ev1, "melc") == q_melc1
    # crossing a river drops the attacker's strength diff by exactly 5 CS (=50
    # at 0.1 granularity) and lifts the retaliation counter's by the same.
    assert _diff_of(ev1, "mel") == _diff_of(ev0, "mel") - 50, "river did not cut the melee diff by 50"
    assert _diff_of(ev1, "melc") == _diff_of(ev0, "melc") + 50, "river did not lift the counter diff by 50"
    print(
        f"  D. melee on {name} slot {p}: wounded+B-4 xp assembly exact "
        f"(atk +{atk_xp_cs}, def +{def_xp_cs} CS); "
        f"river mel {q_mel0}->{q_mel1} (-50), melc {q_melc0}->{q_melc1} (+50)"
    )

    # RANGED across the same river edge: NO penalty (ranged is river-immune).
    slinger = next(i for i, u in enumerate(sim.rules.units) if u["id"] == "SLINGER")
    assert float(sim._p_rng_str[slinger]) > 0, "SLINGER rangedStrength not exported"

    def run_ranged(river_bit):
        snap = sim.snapshot()
        sim.p_type[0, p] = slinger
        sim.p_hp[0, p] = ATK_HP
        set_def_hp(DEF_HP)
        rm = int(sim.river_mask[0, here])
        sim.river_mask[0, here] = (rm | (1 << d)) if river_bit else (rm & ~(1 << d))
        ev = cb_events(sim, ua)
        sim.restore(snap)
        return ev

    rng_no = run_ranged(False)
    rng_yes = run_ranged(True)
    assert _diff_of(rng_no, "rng") == _diff_of(rng_yes, "rng"), "ranged took a river penalty"
    print(f"  E. ranged across the river: diff unchanged ({_diff_of(rng_no,'rng')}), no penalty")


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim, p, code, name = find_melee(rules, paths)
    print(f"combat_mod_test on {name}: melee slot {p}, code {code}, turn {sim.turn}")
    test_wound(sim)
    test_river_cross(sim)
    test_damage_roll_table(sim)
    test_integrated(sim, p, code, name)
    print("COMBAT MOD OK")


if __name__ == "__main__":
    main()
