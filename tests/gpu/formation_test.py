"""CORPS, ARMIES, FLEETS AND ARMADAS.

    python tests/gpu/formation_test.py

CIV6 (Formations): after Nationalism "two military units of the same type will
be able to combine to create a Corps", and after Mobilization "three units of
the same type may be combined into an Army"; a naval pair is a Fleet and a
naval trio an Armada. The two magnitudes are the game's own GlobalParameters,
COMBAT_CORPS_STRENGTH_MODIFIER 10 and COMBAT_ARMY_STRENGTH_MODIFIER 17, and
each raises Combat, Ranged and Bombard Strength alike.

Neither civic is reached by the scripted gate — both sit in the Industrial and
Modern trees — so every body below is driven directly.

Covered here:
  1. the catalog wire: the two magnitudes and the two civic gates arrive, and
     the verb has a column.
  2. the mask: shut without the civic, open with it, and shut again against a
     neighbour of another type, another seat, or no unit at all.
  3. the merge: tier 1 from two singles, the actor spent, the veteran's
     promotions and experience kept, the survivor's turn ended.
  4. the ladder: a Corps and a single make an Army under Mobilization, two
     Corps make nothing, and an Army tops out.
  5. the strength term reaches a duel: +10 for a Corps, +17 for an Army.
  6. To Arms!: a killed Corps pays 1 Era Score and a killed Army 2, and a
     lone unit pays nothing.
  7. the Great Person clause: a retiring General or Admiral hands the tier its
     own row names to one unit standing with it, in that unit's own domain,
     and passes over a unit that is already a formation.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all

ROW = 1  # a civ row: every body below is seat-generic
RJ = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
UNI = [u["id"] for u in RJ["units"]]
CIV = {c["id"]: i for i, c in enumerate(RJ["civics"])}


def fresh(rules, path, turns=6):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(turns):
        sim.step()
    return sim


def put(sim, row, tile, kind, formation=0, level=1, xp=0, promos=0, hp=100):
    """seat a military unit of `kind` on `tile` and return its merged slot."""
    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    lo = sim.POOL_LO["major"]
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = row
    sim.major_unit_type[0, slot] = UNI.index(kind)
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = hp
    sim.major_unit_mp[0, slot] = 2
    sim.major_unit_mp_full[0, slot] = 2
    sim.major_unit_formation[0, slot] = formation
    sim.major_unit_level[0, slot] = level
    sim.major_unit_xp[0, slot] = xp
    sim.major_unit_promos[0, slot] = promos
    sim.military_at[0, tile] = slot + lo
    return slot + lo


def free_pair(sim, row):
    """two adjacent passable land tiles with no unit on either."""
    for t in range(sim.T):
        if not bool(sim.passable[0, t]) or int(sim.military_at[0, t]) >= 0:
            continue
        for n in sim.neigh[t].tolist():
            if n < 0 or not bool(sim.passable[0, n]) or int(sim.military_at[0, n]) >= 0:
                continue
            if bool(sim.wpass[0, t]) or bool(sim.wpass[0, n]):
                continue
            return t, n
    raise AssertionError("no adjacent free land pair on the map")


def _dir_of(sim, frm, to):
    d = [i for i, n in enumerate(sim.neigh[frm].tolist()) if n == to]
    assert d, "tiles are not adjacent"
    return d[0]


def _mask_form(sim, row, slot_merged):
    """the FORM_UP row of `slot_merged` in this seat's unit mask."""
    sim.seat_ext[:, row] = True
    um = sim._seat_unit_mask(row)
    smap = sim._seat_slot_map(row)
    rank = int((smap[0] == slot_merged).long().argmax())
    return um[0, rank, sim._A_FORM_UP:sim._A_FORM_UP + 6]


def poke_catalog(rules, path):
    sim = fresh(rules, path, turns=1)
    assert [int(x) for x in sim._formation_cs] == [0, 10, 17], (
        f"a Corps pays 10 and an Army 17, got {sim._formation_cs.tolist()}")
    assert sim._form_max == 2, "two tiers and no more"
    assert sim._formation_civic[1] == CIV["NATIONALISM"], "a Corps waits on Nationalism"
    assert sim._formation_civic[2] == CIV["MOBILIZATION"], "an Army waits on Mobilization"
    assert sim._A_FORM_UP >= 0, "the verb has no column"
    assert int(sim.unit_formation.sum()) == 0, "nobody starts in a formation"
    print("  1 catalog OK — 10 and 17, two civics, one 6-wide head")


def poke_mask_gates(rules, path):
    sim = fresh(rules, path)
    a_t, b_t = free_pair(sim, ROW)
    a = put(sim, ROW, a_t, "WARRIOR")
    put(sim, ROW, b_t, "WARRIOR")
    d = _dir_of(sim, a_t, b_t)

    sim.civ_civics[0, ROW, CIV["NATIONALISM"]] = False
    assert not bool(_mask_form(sim, ROW, a)[d]), "a Corps forms without Nationalism"
    sim.civ_civics[0, ROW, CIV["NATIONALISM"]] = True
    assert bool(_mask_form(sim, ROW, a)[d]), "Nationalism is in and the column stays shut"

    # another TYPE, and another SEAT, are both refused
    sim.major_unit_type[0, int(sim.military_at[0, b_t]) - sim.POOL_LO["major"]] = UNI.index("SLINGER")
    assert not bool(_mask_form(sim, ROW, a)[d]), "two different chassis merged"
    sim.major_unit_type[0, int(sim.military_at[0, b_t]) - sim.POOL_LO["major"]] = UNI.index("WARRIOR")
    sim.major_unit_seat[0, int(sim.military_at[0, b_t]) - sim.POOL_LO["major"]] = ROW + 1
    assert not bool(_mask_form(sim, ROW, a)[d]), "a rival's unit was absorbed"
    sim.major_unit_seat[0, int(sim.military_at[0, b_t]) - sim.POOL_LO["major"]] = ROW

    # an EMPTY neighbour offers nothing, whatever the civic says
    empty = [i for i, n in enumerate(sim.neigh[a_t].tolist())
             if n >= 0 and int(sim.military_at[0, n]) < 0]
    if empty:
        assert not bool(_mask_form(sim, ROW, a)[empty[0]]), "an empty tile offered a merge"
    print("  2 mask OK — the civic, the chassis, the seat and an occupant all gate it")


def poke_merge(rules, path):
    """two singles make a Corps; the veteran's record is what survives."""
    sim = fresh(rules, path)
    a_t, b_t = free_pair(sim, ROW)
    a = put(sim, ROW, a_t, "WARRIOR", level=3, xp=7, promos=0b101, hp=64)
    b = put(sim, ROW, b_t, "WARRIOR", level=1, xp=0, promos=0)
    sim.civ_civics[0, ROW, CIV["NATIONALISM"]] = True
    d = _dir_of(sim, a_t, b_t)

    acts = torch.full(sim._seat_slot_map(ROW).shape, -1, dtype=torch.long)
    smap = sim._seat_slot_map(ROW)
    acts[0, int((smap[0] == a).long().argmax())] = sim._A_FORM_UP + d
    sim._apply_seat_unit_actions(ROW, acts)

    al, bl = a - sim.POOL_LO["major"], b - sim.POOL_LO["major"]
    assert not bool(sim.unit_alive[0, al]), "the acting unit survived its own merge"
    assert bool(sim.unit_alive[0, bl]), "the host died instead"
    assert int(sim.unit_formation[0, bl]) == 1, "the host is no Corps"
    assert int(sim.unit_level[0, bl]) == 3 and int(sim.unit_xp[0, bl]) == 7, (
        "the veteran's experience was not preserved")
    assert int(sim.unit_promos[0, bl]) == 0b101, "the veteran's promotions were dropped"
    assert int(sim.unit_hp[0, bl]) == 64, "the veteran's hit points were dropped"
    assert int(sim.unit_mp[0, bl]) == 0, "the merged unit kept its move"
    assert int(sim.military_at[0, a_t]) < 0, "the spent unit still holds its tile"
    print("  3 merge OK — tier 1, the actor spent, the veteran's record kept")


def poke_ladder(rules, path):
    """Corps + single = Army under Mobilization; Corps + Corps is nothing."""
    sim = fresh(rules, path)
    a_t, b_t = free_pair(sim, ROW)
    a = put(sim, ROW, a_t, "WARRIOR")
    b = put(sim, ROW, b_t, "WARRIOR", formation=1)
    sim.civ_civics[0, ROW, CIV["NATIONALISM"]] = True
    sim.civ_civics[0, ROW, CIV["MOBILIZATION"]] = False
    d = _dir_of(sim, a_t, b_t)
    assert not bool(_mask_form(sim, ROW, a)[d]), "an Army formed without Mobilization"
    sim.civ_civics[0, ROW, CIV["MOBILIZATION"]] = True
    assert bool(_mask_form(sim, ROW, a)[d]), "Mobilization is in and the Army is refused"

    # two Corps are four units: no formation is that
    sim.major_unit_formation[0, a - sim.POOL_LO["major"]] = 1
    assert not bool(_mask_form(sim, ROW, a)[d]), "two Corps merged into something"
    # and an Army absorbs nothing further
    sim.major_unit_formation[0, a - sim.POOL_LO["major"]] = 0
    sim.major_unit_formation[0, b - sim.POOL_LO["major"]] = 2
    assert not bool(_mask_form(sim, ROW, a)[d]), "an Army took a fourth unit"
    print("  4 ladder OK — 1+0 needs Mobilization, 1+1 and 2+0 are nothing")


def poke_strength(rules, path):
    sim = fresh(rules, path)
    a_t, _b = free_pair(sim, ROW)
    a = put(sim, ROW, a_t, "WARRIOR")
    al = a - sim.POOL_LO["major"]
    sl = torch.tensor([al], dtype=torch.long)
    for tier, want in ((0, 0), (1, 10), (2, 17)):
        sim.unit_formation[0, al] = tier
        assert int(sim._form_cs(sl)[0]) == want, f"tier {tier} pays {want}"
        assert int(sim._form_cs_pool("major", al)[0]) == want, f"pool read disagrees at tier {tier}"
    sim.unit_formation[0, al] = 0
    print("  5 strength OK — 0/10/17 through both readers")


def poke_to_arms(rules, path):
    """CIV6 (To Arms!): "+1 Era Score each time you kill a non-Barbarian Corps
    in combat and +2 Era Score each time you kill a non-Barbarian Army in
    combat.\""""
    sim = fresh(rules, path)
    # ONE commitment: every matching pick pays, so a row filled with the
    # same dedication would pay once per slot.
    sim.ded_picks[0, ROW] = -1
    sim.ded_picks[0, ROW, 0] = sim._ded_to_arms
    sim.civ_age[0, ROW] = 0  # a GOLDEN age takes bonuses, not era score
    vt = torch.full((sim.B,), UNI.index("WARRIOR"), dtype=torch.long)
    barb = torch.zeros(sim.B, dtype=torch.bool)
    killed = torch.ones(sim.B, dtype=torch.bool)

    def score():
        return float(sim.era_score[0, ROW])

    for tier, gain in ((0, 0), (1, 1), (2, 2)):
        was = score()
        sim._unit_kill_event(ROW, vt, barb, killed,
                             vict_form=torch.full((sim.B,), tier, dtype=torch.long))
        assert score() - was == gain, (
            f"tier {tier} paid {score() - was}, want {gain}")

    # a seat that committed to something else is paid nothing
    sim.ded_picks[0, ROW, 0] = sim._ded_coinage
    was = score()
    sim._unit_kill_event(ROW, vt, barb, killed,
                         vict_form=torch.full((sim.B,), 2, dtype=torch.long))
    assert score() == was, "To Arms! paid a seat that never committed to it"
    print("  6 to arms OK — 1 for a Corps, 2 for an Army, 0 for a single")


# CIV6 (El Cid): "Retire (1 charge) - Forms a Corps out of a military land
# unit."; (Napoleon Bonaparte) an Army out of one; (Gaius Duilius) a Fleet and
# (Santa Cruz) an Armada out of a military NAVAL unit. The target "must be a
# military unit that is not a Corps or an Army".
def _order(sim, row, slot_merged, col):
    smap = sim._seat_slot_map(row)[0]
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, int((smap == slot_merged).long().argmax())] = col
    sim.seat_ext[0, row] = True
    sim._apply_seat_unit_actions(row, acts)


def _person(sim, row, cls, at, tile):
    """stand a fresh person of class `cls` at queue position `at` on `tile`."""
    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    lo = sim.POOL_LO["major"]
    ty = int(sim._gp_class_unit[cls])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = row
    sim.major_unit_type[0, slot] = ty
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = 100
    sim.major_unit_mp[0, slot] = float(sim._type_moves[ty])
    sim.major_unit_charges[0, slot] = int(sim._gp_charges[cls, at])
    sim.major_unit_gp_at[0, slot] = at
    sim.civilian_at[0, tile] = slot + lo
    sim._gen_ver += 1
    return slot + lo


def _clause_rows(sim):
    """every (cls, at, tier, naval) the exported catalog carries."""
    k = sim._GPFX["formation"]
    kn = sim._GPFX["formationNaval"]
    out = []
    for c in range(sim._gp_effects.shape[0]):
        for a in range(sim._gp_effects.shape[1]):
            tier = int(sim._gp_effects[c, a, k])
            if tier:
                out.append((c, a, tier, int(sim._gp_effects[c, a, kn])))
    return out


def poke_great_person(rules, path):
    sim = fresh(rules, path, turns=1)
    rows = _clause_rows(sim)
    assert len(rows) == 4, f"four people form a unit outright, the catalog has {len(rows)}"
    assert sorted(t for _, _, t, _ in rows) == [1, 1, 2, 2], "a Corps/Fleet pair and an Army/Armada pair"
    assert sorted(n for *_, n in rows) == [0, 0, 1, 1], "two on land and two at sea"

    land = UNI.index("WARRIOR")
    sea = next(i for i, u in enumerate(UNI)
               if bool(sim.unit_naval[i]) and float(sim._type_combat[i]) > 0)
    for cls, at, tier, naval in rows:
        for kind, want in ((sea if naval else land, tier), (land if naval else sea, 0)):
            sim = fresh(rules, path, turns=1)
            t_, _ = free_pair(sim, ROW)
            tgt = put(sim, ROW, t_, UNI[kind])
            gp = _person(sim, ROW, cls, at, t_)
            _order(sim, ROW, gp, sim._A_GP)
            got = int(sim.unit_formation[0, tgt])
            assert got == want, (
                f"class {cls} person {at} on {UNI[kind]}: formation {got}, want {want}")

    # "not a Corps or an Army" — an already-formed unit is no target
    cls, at, tier, _ = next(r for r in rows if r[3] == 0)
    sim = fresh(rules, path, turns=1)
    t_, _ = free_pair(sim, ROW)
    tgt = put(sim, ROW, t_, "WARRIOR", formation=1)
    gp = _person(sim, ROW, cls, at, t_)
    _order(sim, ROW, gp, sim._A_GP)
    assert int(sim.unit_formation[0, tgt]) == 1, "the clause overwrote a formation it may not target"
    print("  7 great person OK — four rows, the named tier, the named domain, no re-forming")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    p = paths[0]
    print(f"formation_test on {p.name}")
    poke_catalog(rules, p)
    poke_mask_gates(rules, p)
    poke_merge(rules, p)
    poke_ladder(rules, p)
    poke_strength(rules, p)
    poke_to_arms(rules, p)
    poke_great_person(rules, p)
    print("FORMATION POKES OK")


if __name__ == "__main__":
    main()
