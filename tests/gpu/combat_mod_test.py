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
  F. _class_matchup_cs pays +5 melee-vs-anti-cavalry and +10
     anti-cavalry-vs-cavalry, and nothing for any other pairing.
  G. _embarked_def_cs reads the OWNER's technological era off the exported
     table, and moves on one civic of a new era.
  H. a defender inside a defensible district gains no Support.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.simbase import BARB_SEAT
from core.engine import UNIT_SLOTS, js_round, FLANKING_CS, SUPPORT_CS
from warmup import settle_all

HOLD = 12


def mil_of(sim, t: int, seat: int) -> int:
    """The MERGED slot of `seat`'s military unit on tile t, else -1 — the
    shared window makes occupancy a SEAT question."""
    m = int(sim.military_at[0, t])
    return m if m >= 0 and int(sim.unit_seat[0, m]) == seat else -1


def civ_mil_at(sim, t: int) -> int:
    """The MERGED slot of ANY CIV seat's military unit on tile t, else -1."""
    m = int(sim.military_at[0, t])
    return m if m >= 0 and 0 < int(sim.unit_seat[0, m]) < 100 else -1


def rank_of(sim, slot: int, row: int = 0) -> int:
    """The HEAD ROW merged slot `slot` occupies — what the applier and the
    mask index by."""
    return int((sim._seat_slot_map(row)[0] == slot).nonzero(as_tuple=True)[0][0])


def cb_events(sim, ua):
    """Run the unit-action phase alone with combat logging on; return the
    parsed CB events [{k, diff, dmg}, ...] for batch row 0."""
    sim._log_combat_b = 0
    sim._combat_events = []
    sim._apply_seat_unit_actions(0, ua)
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
    """A seat-0 MELEE unit and a barbarian PLANTED on adjacent open tiles by
    the capital — hand-built on the settled scene, because driverless play
    declares no wars and the marauding raiders besiege whichever city is
    nearest their camp (often a minor), so a scripted hunt for the scene goes
    dry. Both hulls are the same plain melee chassis, so the attacker's
    tier-1 class promotion is guaranteed to pay against the defender.
    Returns (sim, p, code, name)."""
    for path in paths:
        sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
        _mcls = rules.promo_classes.index("MELEE")
        bty = next(i for i in range(sim.NU)
                   if float(sim._type_combat[i]) > 0
                   and float(sim._type_ranged_strength[i]) == 0
                   and not bool(sim._type_civilian[i]) and not bool(sim.unit_naval[i])
                   and int(sim.rules_dev.u_promo_class[i]) == _mcls)
        ctr = int(sim.city_center[0, 0, 0])
        if ctr < 0:
            continue
        near = (sim.pair_dist[ctr] <= 3).nonzero(as_tuple=True)[0].tolist()

        def open_tile(x: int) -> bool:
            return (bool(sim.passable[0, x])
                    and int(sim.military_at[0, x]) < 0 and int(sim.civilian_at[0, x]) < 0
                    and int(sim.embarked_at[0, x]) < 0
                    and int(sim.centre_slot_at[0, x]) < 0 and int(sim.district[0, x]) < 0)

        for a_tile in near:
            a_tile = int(a_tile)
            if not open_tile(a_tile):
                continue
            for d, x in enumerate(sim.neigh[a_tile].tolist()):
                x = int(x)
                if x < 0 or x == a_tile or not open_tile(x):
                    continue
                aslot = int(sim.unit_next[0])
                sim.unit_next[0] = aslot + 1
                sim.major_unit_alive[0, aslot] = True
                sim.major_unit_type[0, aslot] = bty
                sim.major_unit_tile[0, aslot] = a_tile
                sim.major_unit_hp[0, aslot] = 100
                sim.major_unit_seat[0, aslot] = 0
                sim.major_unit_mp[0, aslot] = 2
                sim.major_unit_attacks[0, aslot] = 1
                bslot = int((~sim.barb_unit_alive[0]).nonzero(as_tuple=True)[0][0])
                sim.barb_unit_alive[0, bslot] = True
                sim.barb_unit_type[0, bslot] = bty
                sim.barb_unit_tile[0, bslot] = x
                sim.barb_unit_hp[0, bslot] = 100
                sim.barb_unit_seat[0, bslot] = BARB_SEAT
                if sim._embark_live:
                    sim.major_unit_emb[0, aslot] = False
                    sim.barb_unit_emb[0, bslot] = False
                sim.military_at[0, a_tile] = aslot + sim.POOL_LO["major"]
                sim.military_at[0, x] = bslot + sim.POOL_LO["barb"]
                p = aslot + sim.POOL_LO["major"]
                n = rank_of(sim, p)
                m = sim._seat_unit_mask(0)[0]  # [N, A] — head rows, not slots
                if bool(m[n, 6 + d]):
                    return sim, p, 6 + d, path.name
                # fog or a gate refused the column — unwind and try elsewhere
                sim.military_at[0, a_tile] = -1
                sim.military_at[0, x] = -1
                sim.major_unit_alive[0, aslot] = False
                sim.barb_unit_alive[0, bslot] = False
                sim.unit_next[0] = aslot
    raise AssertionError("no adjacent-hostile melee situation found in scripted play")


def test_wound(sim) -> None:
    hp = torch.arange(0, 101, dtype=torch.long)
    got = sim._wound(hp)
    # CIV6: round(10 - HP/10) — the `woundPenalty` twin. Python's round() is
    # banker's rounding, so the expectation is spelled the way JS rounds.
    want = torch.tensor([float(math.floor(10.0 - h / 10.0 + 0.5)) for h in range(101)], dtype=torch.float64)
    assert torch.equal(got, want), "wound penalty diverges from TS round(10 - hp/10)"
    assert float(sim._wound(torch.tensor([100]))[0]) == 0.0
    assert float(sim._wound(torch.tensor([30]))[0]) == 7.0
    assert float(sim._wound(torch.tensor([1]))[0]) == 10.0
    print("  A. _wound == TS woundPenalty, bit-exact for HP 0..100")


def test_class_matchup(sim) -> None:
    """CIV6 (Combat, "Unit class modifiers"): "Melee units receive a +5 CS bonus
    against anti-cavalry units. Anti-cavalry units receive a +10 CS bonus
    against light cavalry, heavy cavalry, or ranged cavalry units." Nothing
    else in the roster pairs."""
    mel = [i for i in range(sim.NU) if bool(sim._type_melee[i])]
    anti = [i for i in range(sim.NU) if bool(sim._type_anticav[i])]
    cav = [i for i in range(sim.NU) if bool(sim._type_cavalry[i])]
    assert mel and anti and cav, f"the roster must field all three classes: {mel} {anti} {cav}"

    def cs(a: int, d: int) -> int:
        return int(sim._class_matchup_cs(torch.tensor([a]), torch.tensor([d]))[0])

    for m in mel:
        for a in anti:
            assert cs(m, a) == sim._class_melee_vs_anticav, f"melee {m} vs anti-cav {a}"
            assert cs(a, m) == 0, "an anti-cavalry unit gains nothing against melee"
    for a in anti:
        for c in cav:
            assert cs(a, c) == sim._class_anticav_vs_cav, f"anti-cav {a} vs cavalry {c}"
            assert cs(c, a) == 0, "a cavalry unit gains nothing against anti-cavalry"
    for m in mel:
        for c in cav:
            assert cs(m, c) == 0, "melee gains nothing against cavalry"
    print(f"  F. class modifiers OK: +{sim._class_melee_vs_anticav} melee-vs-anti-cav, "
          f"+{sim._class_anticav_vs_cav} anti-cav-vs-cavalry, 0 everywhere else")


def test_embarked_defense_by_era(sim) -> None:
    """CIV6: the embarked defender's CS "depends on the owner's current
    technological era (not the World Era), and is updated upon discovery of the
    first technology or civic of that era" — 15 through Medieval, then 30 / 35 /
    50 / 55."""
    tbl = [int(x) for x in sim._embarked_def_by_era.tolist()]
    assert tbl[:3] == [15, 15, 15] and tbl[3:7] == [30, 35, 50, 55], tbl
    seat = torch.zeros(sim.B, dtype=torch.long, device=sim.device)
    was = sim.civ_civics[:, 0].clone()
    sim.civ_civics[:, 0] = False
    sim.civ_techs[:, 0] = False
    assert int(sim._embarked_def_cs(seat)[0]) == tbl[0], "an empty tree is the Ancient row"
    ren = next((i for i in range(sim._civic_era.numel()) if int(sim._civic_era[i]) == 3), -1)
    assert ren >= 0, "no Renaissance civic in the exported tree"
    sim.civ_civics[:, 0, ren] = True
    assert int(sim._embarked_def_cs(seat)[0]) == tbl[3], "one Renaissance CIVIC must move the tier"
    sim.civ_civics[:, 0] = was
    # a seat that researches nothing of its own reads the Ancient row
    barb = torch.full((sim.B,), 200, dtype=torch.long, device=sim.device)
    assert int(sim._embarked_def_cs(barb)[0]) == tbl[0]
    print(f"  G. embarked defence OK: {tbl[0]} Ancient..Medieval, {tbl[3]} on one Renaissance civic")


def test_support_in_district(sim) -> None:
    """CIV6 (Support): "Units will not gain Support when inside defensible
    Districts (City Center, Encampment). However, units inside these Districts
    can still provide Support to their friends." """
    sim.civ_civics[:, :, sim._flank_support_civic] = True
    ctr = int(sim.city_center[0, 0, 0])
    nb = [int(t) for t in sim.neigh[ctr].tolist() if t >= 0]
    assert nb, "the centre has no neighbours"
    open_t = nb[0]
    dseat = torch.zeros(sim.B, dtype=torch.long, device=sim.device)
    noatk = torch.full((sim.B,), -1, dtype=torch.long, device=sim.device)
    on_ctr = torch.full((sim.B,), ctr, dtype=torch.long, device=sim.device)
    off_ctr = torch.full((sim.B,), open_t, dtype=torch.long, device=sim.device)
    _, s_ctr = sim._flank_support(on_ctr, dseat, noatk, dseat)
    _, s_off = sim._flank_support(off_ctr, dseat, noatk, dseat)
    assert int(s_ctr[0]) == 0, "a defender on a City Center must gain no Support"
    assert int(s_off[0]) >= int(s_ctr[0]), "the same neighbours off the centre still support"
    print(f"  H. district support OK: {int(s_ctr[0])} on the centre, {int(s_off[0])} one tile off")


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
    here = int(sim.major_unit_tile[0, p])
    d = code - 6
    tgt = int(sim.neigh[here, d])
    # known wounds: attacker 64 HP, defender 88 HP
    ATK_HP, DEF_HP = 64, 88
    is_barb = int(sim.barb_at[0, tgt]) >= 0
    if is_barb:
        dslot = int(sim.barb_at[0, tgt])
        def_combat = int(sim._type_combat[sim.barb_unit_type[0, dslot]])
        def set_def_hp(v):
            sim.barb_unit_hp[0, dslot] = v
        def_fort = int(sim.barb_unit_fortify[0, dslot])
    else:
        dslot = civ_mil_at(sim, tgt)
        def_combat = int(sim._type_combat[sim.major_unit_type[0, dslot]])
        def set_def_hp(v):
            sim.major_unit_hp[0, dslot] = v
        def_fort = int(sim.major_unit_fortify[0, dslot])
    atk_combat = int(sim._type_combat[sim.major_unit_type[0, p]])
    tdef = int(sim.tdef[0, tgt])
    ua = torch.full((1, UNIT_SLOTS), HOLD, dtype=torch.long)
    ua[0, rank_of(sim, p)] = code

    # PROMOTIONS, not XP, are what a veteran brings to the roll. The driver
    # has been taking them for 21 turns, so BOTH sides are cleared here and the
    # reference assembles no promotion term at all; a second scene below hands
    # the attacker exactly one and asks the roll to move by its value.
    def clear_promos():
        sim.major_unit_promos[0, p] = 0
        sim.major_unit_level[0, p] = 1
        if is_barb:
            sim.barb_unit_promos[0, dslot] = 0
        else:
            sim.major_unit_promos[0, dslot] = 0
            sim.major_unit_level[0, dslot] = 1

    def run(river_bit, atk_promos=0):
        snap = sim.snapshot()
        sim.major_unit_hp[0, p] = ATK_HP
        set_def_hp(DEF_HP)
        clear_promos()
        sim.major_unit_promos[0, p] = atk_promos
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
        dciv = int((sim.major_unit_seat[0, dslot] - 1)) if civ_def else -1
        flank = support = 0
        for dd in range(6):
            nt = int(sim.neigh[tgt, dd])
            if nt < 0:
                continue
            has_b = int(sim.barb_at[0, nt]) >= 0
            has_pm = mil_of(sim, nt, 0) >= 0
            vms = civ_mil_at(sim, nt)
            has_vm = vms >= 0
            vc = int((sim.major_unit_seat[0, vms] - 1)) if has_vm else -1
            if civ_def:
                atwar = bool(sim.war[0, 0, 1 + dciv])
                hostile = has_b or (has_pm and atwar)
                friendly = has_vm and vc == dciv
            else:  # barbarian defender: any non-barb military is hostile
                hostile = has_pm or has_vm
                friendly = has_b
            if hostile and nt != here:  # exclude the attacker (seat-0 mil at here)
                flank += 1
            if friendly:
                support += 1
        return flank, support

    b7_flank, b7_support = flank_support_ref()

    # reference (TS assembly): atk_e = combat - wound(64) - 5*river + 2*flank;
    #                    def_e = combat + terrain + fortify - wound(88) + 2*support
    def wound(hp):
        return math.floor(10.0 - hp / 10.0 + 0.5)  # CIV6 round(10 - HP/10)

    def ref_q(river):
        atk_e = atk_combat - wound(ATK_HP) - (5.0 if river else 0.0) + FLANKING_CS * b7_flank
        def_e = def_combat + tdef + 3 * def_fort - wound(DEF_HP) + SUPPORT_CS * b7_support
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
    # ONE promotion, inside the real roll: an attack-only CS row must move the
    # `mel` diff by exactly its value and leave the counter's mirrored.
    d_type = int(sim.barb_unit_type[0, dslot] if is_barb else sim.major_unit_type[0, dslot])
    a_cls = int(sim.rules_dev.u_promo_class[int(sim.major_unit_type[0, p])])
    moved = None
    if a_cls >= 0:
        for k in range(int(sim.rules_dev.promo_rows[a_cls])):
            if int(sim.rules_dev.promo_req[a_cls, k]) != 0:
                continue
            want = int(sim._promo_cs(
                torch.tensor([int(sim.major_unit_type[0, p])]), torch.tensor([1 << k]),
                attacking=torch.ones(1, dtype=torch.bool), foe_type=torch.tensor([d_type]),
                foe_damaged=torch.tensor([True]),
                foe_fortified=torch.tensor([def_fort > 0]),
                foe_in_district=torch.tensor([False]), tile=torch.tensor([here]))[0])
            if want == 0:
                continue
            evk = run(False, atk_promos=1 << k)
            assert _diff_of(evk, "mel") == q_mel0 + want * 10, \
                f"promotion {k} moved the mel diff by {_diff_of(evk,'mel') - q_mel0}, want {want * 10}"
            assert _diff_of(evk, "melc") == q_melc0 - want * 10, "the counter did not mirror it"
            moved = (k, want)
            break
    assert moved is not None, "no tier-1 promotion of the attacker's class pays against this defender"
    print(f"  D2. promotion {moved[0]} of the attacker's class moved the roll by +{moved[1]} CS")

    print(
        f"  D. melee on {name} slot {p}: wounded assembly exact "
        f"(no promotions held); "
        f"river mel {q_mel0}->{q_mel1} (-50), melc {q_melc0}->{q_melc1} (+50)"
    )

    # RANGED across the same river edge: NO penalty (ranged is river-immune).
    slinger = next(i for i, u in enumerate(sim.rules.units) if u["id"] == "SLINGER")
    assert float(sim._type_ranged_strength[slinger]) > 0, "SLINGER rangedStrength not exported"

    def run_ranged(river_bit):
        snap = sim.snapshot()
        sim.major_unit_type[0, p] = slinger
        sim.major_unit_hp[0, p] = ATK_HP
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
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim, p, code, name = find_melee(rules, paths)
    print(f"combat_mod_test on {name}: melee slot {p}, code {code}, turn {sim.turn}")
    test_wound(sim)
    test_class_matchup(sim)
    test_embarked_defense_by_era(sim)
    test_support_in_district(sim)
    test_river_cross(sim)
    test_damage_roll_table(sim)
    test_integrated(sim, p, code, name)
    print("COMBAT MOD OK")


if __name__ == "__main__":
    main()
