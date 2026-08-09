"""The Great General / Great Admiral poke lane — the gate-unreachable surfaces.

    python tests/gpu/gp_aura_test.py

The scripted parity rollout claims ADMIRALs (Harbor GPP) often enough to hold
spawn-at-claim, the spawn-only production/purchase exclusion, capture and the
None-plane combat fast-path turn-exact. It claims no GENERALs at all: the
scripted seats never complete an ENCAMPMENT, the only district that flows
GENERAL GPP. So the GENERAL spawn and the LAND +5 aura have no gate coverage,
and these pokes force the state in-memory and drive the exact engine twin
instead.

Covered here (all gate-unreachable):
  1. spawn-only exclusion — GENERAL/ADMIRAL never appear in the production
     mask's train columns (the trainableUnits filter's GPU mirror).
  2. spawn-at-claim — _advance_great_people spawns a GENERAL (and an
     ADMIRAL) civilian at seat 0's capital on the claim, on top of the effect.
  3. aura CS helper — _gen_aura_cs: +5 for own LAND military within 2 of an own
     GENERAL (0 at range 3, 0 for another seat, 0 for a barbarian); +5 for own
     NAVAL/embarked within 2 of an ADMIRAL; a GENERAL does not aura a naval
     unit and an ADMIRAL does not aura a land unit.
  4. aura in a real damage roll — a civ attacker within 2 of its own GENERAL
     deals strictly MORE (attacker +5); a seat-0 defender within 2 of its own
     GENERAL takes strictly LESS (defender +5). Same-RNG two-run comparison.
  6. GENERAL capture, type-agnostic — a civ melee on a lone seat-0 GENERAL
     transfers it to the civ pool at POOL-END, type/charges carried.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES


# ------------------------------------------------------------------ helpers ---
def build(rules, path, steps: int = 20, dtype=torch.float64):
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=dtype)
    for _ in range(steps):
        sim.step()
    return sim


def clear_all_units(sim) -> None:
    sim.seat0_unit_alive[:] = False
    sim.civ_unit_alive[:] = False
    sim.barb_unit_alive[:] = False
    # the occupancy planes are shared across pools: clear only the id range of
    # the pool being emptied, never the whole plane.
    _pl = sim.military_at
    _pl[(_pl >= sim.POOL_LO["seat0"]) & (_pl < sim.POOL_HI["seat0"])] = -1
    _pl = sim.civilian_at
    _pl[(_pl >= sim.POOL_LO["seat0"]) & (_pl < sim.POOL_HI["seat0"])] = -1
    _pl = sim.military_at
    _pl[(_pl >= sim.POOL_LO["civ"]) & (_pl < sim.POOL_HI["civ"])] = -1
    _pl = sim.civilian_at
    _pl[(_pl >= sim.POOL_LO["civ"]) & (_pl < sim.POOL_HI["civ"])] = -1
    _pl = sim.military_at
    _pl[(_pl >= sim.POOL_LO["barb"]) & (_pl < sim.POOL_HI["barb"])] = -1
    sim._gen_ver += 1


def place_pmil(sim, t: int, type_idx: int, hp: int = 100, emb: bool = False) -> int:
    slot = int(sim.seat0_unit_next[0])
    sim.seat0_unit_alive[0, slot] = True
    sim.seat0_unit_type[0, slot] = type_idx
    sim.seat0_unit_tile[0, slot] = t
    sim.seat0_unit_hp[0, slot] = hp
    sim.seat0_unit_charges[0, slot] = 0
    sim.seat0_unit_fortify[0, slot] = 0
    sim.seat0_unit_emb[0, slot] = emb
    sim.military_at[0, t] = slot
    sim.seat0_unit_next[0] += 1
    return slot


def place_pciv(sim, t: int, type_idx: int, hp: int = 100) -> int:
    slot = int(sim.seat0_unit_next[0])
    sim.seat0_unit_alive[0, slot] = True
    sim.seat0_unit_type[0, slot] = type_idx
    sim.seat0_unit_tile[0, slot] = t
    sim.seat0_unit_hp[0, slot] = hp
    sim.seat0_unit_charges[0, slot] = int(sim._type_charges[type_idx])
    sim.seat0_unit_fortify[0, slot] = 0
    sim.seat0_unit_emb[0, slot] = False
    sim.civilian_at[0, t] = slot
    sim.seat0_unit_next[0] += 1
    sim._gen_ver += 1
    return slot


def place_rmil(sim, r: int, t: int, type_idx: int, hp: int = 100, emb: bool = False) -> int:
    slot = int(sim.civ_unit_next[0])
    sim.civ_unit_alive[0, slot] = True
    sim.civ_unit_civ[0, slot] = r
    sim.civ_unit_type[0, slot] = type_idx
    sim.civ_unit_tile[0, slot] = t
    sim.civ_unit_hp[0, slot] = hp
    sim.civ_unit_charges[0, slot] = 0
    sim.civ_unit_fortify[0, slot] = 0
    sim.civ_unit_emb[0, slot] = emb
    sim.military_at[0, t] = slot + sim.POOL_LO["civ"]
    sim.civ_unit_next[0] += 1
    return slot


def place_rciv(sim, r: int, t: int, type_idx: int, hp: int = 100) -> int:
    slot = int(sim.civ_unit_next[0])
    sim.civ_unit_alive[0, slot] = True
    sim.civ_unit_civ[0, slot] = r
    sim.civ_unit_type[0, slot] = type_idx
    sim.civ_unit_tile[0, slot] = t
    sim.civ_unit_hp[0, slot] = hp
    sim.civ_unit_charges[0, slot] = int(sim._type_charges[type_idx])
    sim.civ_unit_fortify[0, slot] = 0
    sim.civ_unit_emb[0, slot] = False
    sim.civilian_at[0, t] = slot + sim.POOL_LO["civ"]
    sim.civ_unit_next[0] += 1
    sim._gen_ver += 1
    return slot


def tile_within(sim, ctr: int, dist: int, banned=()) -> int:
    """First on-map free non-center tile at exactly `dist` from ctr."""
    banned = set(banned)
    for t in range(sim.T):
        if t == ctr or t in banned:
            continue
        if int(sim.center_at[0, t]) >= 0 or int(sim.civ_city_at[0, t]) >= 0 or int(sim.citystate_at[0, t]) >= 0:
            continue
        if int(sim.pair_dist[ctr, t]) != dist:
            continue
        if not bool(sim.passable[0, t]):
            continue
        if (int(sim.pmil_at[0, t]) < 0 and int(sim.pciv_at[0, t]) < 0 and int(sim.civ_military_at[0, t]) < 0
                and int(sim.civ_civilian_at[0, t]) < 0 and int(sim.barb_at[0, t]) < 0):
            return t
    return -1


def adj_free(sim, t: int, banned=()) -> int:
    banned = set(banned)
    for d in range(6):
        n = int(sim.neigh[t][d])
        if n < 0 or n in banned:
            continue
        if int(sim.center_at[0, n]) >= 0 or int(sim.civ_city_at[0, n]) >= 0 or int(sim.citystate_at[0, n]) >= 0:
            continue
        if not bool(sim.passable[0, n]):
            continue
        if (int(sim.pmil_at[0, n]) < 0 and int(sim.pciv_at[0, n]) < 0 and int(sim.civ_military_at[0, n]) < 0
                and int(sim.civ_civilian_at[0, n]) < 0 and int(sim.barb_at[0, n]) < 0):
            return n
    return -1


# ------------------------------------------------------------------ pokes -----
def poke_exclusion(rules, rj, path):
    """1. Spawn-only GENERAL/ADMIRAL never appear in the production mask's
    unit-train columns (the trainableUnits filter's GPU mirror). The mask is
    built with the gold-purchase columns switched on, so the widened head is
    what gets read."""
    sim = build(rules, path)
    gi, ai = sim._general_unit_idx, sim._admiral_unit_idx
    assert gi >= 0 and ai >= 0, "general/admiral roster indices missing from the export"
    assert bool(sim._type_spawn_only[gi]) and bool(sim._type_spawn_only[ai]), "spawn_only flag not set"
    # production_mask: the unit-train columns start at UNIT_BASE.
    sim._rl_purchase_active = True
    pm = sim.production_mask()  # [B, C, NCODES]
    base = sim.UNIT_BASE
    for uidx, nm in ((gi, "GENERAL"), (ai, "ADMIRAL")):
        col = base + uidx
        assert not bool(pm[:, :, col].any()), f"{nm} offered in production_mask (col {col})"
    print(f"  1 exclusion OK — GENERAL/ADMIRAL never queue or purchase (spawn_only)")


def poke_seat0_spawn(rules, rj, path):
    """2. A GENERAL/ADMIRAL claim spawns its support civilian at seat 0's
    capital (city slot 0), on top of the instant effect."""
    for uidx, cls, nm in ((sim0._general_unit_idx, sim0._general_cls, "GENERAL"),
                          (sim0._admiral_unit_idx, sim0._admiral_cls, "ADMIRAL")):
        sim = build(rules, path)
        assert bool(sim.alive[0, 0]), "seat-0 capital (slot 0) must be alive"
        # a completed, owned district of this class so the class accrues + claims
        d = int(sim._gp_class_district[cls])
        assert d >= 0
        dt = tile_within(sim, int(sim.site[0, 0]), 2)
        assert dt >= 0
        sim.district[0, dt] = d
        sim.district_complete[0, dt] = True
        sim.district_dead[0, dt] = False
        sim.district_pillaged[0, dt] = False
        sim.owner[0, dt] = 0
        # fund EXACTLY one person (gpCost(0)); the +1 district accrual keeps the
        # leftover well under gpCost(1), so the claim loop fires exactly once.
        sim.gp_earned[:, cls] = 0
        sim.gp_points[0, cls] = float(sim._gp_costs[0])
        before = int((sim.seat0_unit_alive[0] & (sim.seat0_unit_type[0] == uidx)).sum())
        sim._advance_great_people()
        after = int((sim.seat0_unit_alive[0] & (sim.seat0_unit_type[0] == uidx)).sum())
        assert after == before + 1, f"seat-0 {nm} claim did not spawn exactly one unit ({before}->{after})"
        # spawned at/adjacent to the capital, civilian, 1 charge (not military)
        u = (sim.seat0_unit_alive[0] & (sim.seat0_unit_type[0] == uidx)).nonzero(as_tuple=True)[0][-1].item()
        cap = int(sim.site[0, 0])
        assert int(sim.pair_dist[cap, int(sim.seat0_unit_tile[0, u])]) <= 1, f"{nm} not spawned at the capital"
        assert bool(sim._type_civilian[uidx]) and int(sim.seat0_unit_charges[0, u]) >= 1, f"{nm} must be a civilian (charges>=1)"
    print("  2 seat-0 spawn-at-claim OK — GENERAL + ADMIRAL born at the capital")


def poke_aura_helper(rules, rj, path):
    """3. _gen_aura_cs: +5 for own LAND military within 2 of an own GENERAL, 0
    at 3 / another seat / barbarian; +5 for own NAVAL/embarked within 2 of an
    ADMIRAL; GENERAL does not aura naval, ADMIRAL does not aura land."""
    sim = build(rules, path)
    gi, ai = sim._general_unit_idx, sim._admiral_unit_idx
    CS = sim._gen_aura_cs_val
    clear_all_units(sim)
    # a seat-0 GENERAL at ctr; probe tiles at distance 2 (in range) and 3 (out).
    ctr = int(sim.site[0, 0])
    place_pciv(sim, ctr, gi)  # seat-0 general at ctr
    t1 = tile_within(sim, ctr, 2, banned=[ctr])
    t3 = tile_within(sim, ctr, 3, banned=[ctr, t1])
    assert t1 >= 0 and t3 >= 0
    B = sim.B
    land = torch.zeros(B, dtype=torch.bool)   # land unit
    civ0 = torch.zeros(B, dtype=torch.long)   # seat 0 in the unified civ space
    # in range → +5, out of range → 0
    a_in = float(sim._gen_aura_cs(civ0, torch.tensor([t1]), land)[0])
    a_out = float(sim._gen_aura_cs(civ0, torch.tensor([t3]), land)[0])
    assert a_in == CS, f"land aura in-range must be {CS}, got {a_in}"
    assert a_out == 0.0, f"land aura at range 3 must be 0, got {a_out}"
    # a GENERAL does NOT aura a NAVAL/embarked unit (needs an ADMIRAL)
    a_nav = float(sim._gen_aura_cs(civ0, torch.tensor([t1]), torch.ones(B, dtype=torch.bool))[0])
    assert a_nav == 0.0, f"GENERAL must not aura a naval unit, got {a_nav}"
    # another seat's unit standing by a SEAT-0 general → 0
    a_civ = float(sim._gen_aura_cs(torch.ones(B, dtype=torch.long), torch.tensor([t1]), land)[0])
    assert a_civ == 0.0, f"a civ unit must not read seat 0's general aura, got {a_civ}"
    # barbarian (-1) → 0
    a_barb = float(sim._gen_aura_cs(torch.full((B,), -1, dtype=torch.long), torch.tensor([t1]), land)[0])
    assert a_barb == 0.0, f"barb must get no aura, got {a_barb}"
    # ADMIRAL: auras a NAVAL unit, not a LAND unit
    sim2 = build(rules, path)
    clear_all_units(sim2)
    ctr2 = int(sim2.site[0, 0])
    place_pciv(sim2, ctr2, ai)  # seat-0 admiral
    tt = tile_within(sim2, ctr2, 2, banned=[ctr2])
    s_nav = float(sim2._gen_aura_cs(civ0, torch.tensor([tt]), torch.ones(B, dtype=torch.bool))[0])
    s_land = float(sim2._gen_aura_cs(civ0, torch.tensor([tt]), torch.zeros(B, dtype=torch.bool))[0])
    assert s_nav == CS, f"admiral naval aura must be {CS}, got {s_nav}"
    assert s_land == 0.0, f"ADMIRAL must not aura a land unit, got {s_land}"
    print(f"  3 aura helper OK — GENERAL +{int(CS)} land<=2, ADMIRAL +{int(CS)} naval<=2; range/civ/domain gated")


def poke_aura_in_combat(rules, rj, path):
    """4. The aura in a REAL damage roll (_hostile_vs_unit, same-RNG two-run):
    a civ attacker within 2 of its own GENERAL deals strictly MORE; a seat-0
    defender within 2 of its own GENERAL takes strictly LESS."""
    WARRIOR = [u["id"] for u in rules.units].index("WARRIOR")
    gi = None

    def setup(with_atk_gen: bool, with_def_gen: bool):
        sim = build(rules, path)
        nonlocal gi
        gi = sim._general_unit_idx
        clear_all_units(sim)
        sim.civ_only_atwar[:, 0] = True
        sim.sync_war()  # a poked war write lands in one cell; mirror the pair
        ctr = int(sim.site[0, 0])
        # the seat-0 defender at a free tile; a civ attacker adjacent to it
        dtile = tile_within(sim, ctr, 4)
        atile = adj_free(sim, dtile, banned=[ctr])
        assert dtile >= 0 and atile >= 0
        pdef = place_pmil(sim, dtile, WARRIOR, hp=100)
        ratk = place_rmil(sim, 0, atile, WARRIOR, hp=100)
        if with_atk_gen:  # a civ general within 2 of the civ attacker
            gt = tile_within(sim, atile, 1, banned=[dtile, atile, ctr])
            place_rciv(sim, 0, gt, gi)
        if with_def_gen:  # a seat-0 general within 2 of the seat-0 defender
            gt = tile_within(sim, dtile, 1, banned=[dtile, atile, ctr])
            place_pciv(sim, dtile if False else gt, gi)
        return sim, pdef, ratk, dtile

    # --- attacker aura: civ attacker +5 -> more damage to the seat-0 defender
    base, pdef, ratk, dtile = setup(False, False)
    hp0 = int(base.seat0_unit_hp[0, pdef])
    base._hostile_vs_unit(torch.tensor([True]), torch.tensor([dtile]), "civ", ratk)
    dmg_base = hp0 - int(base.seat0_unit_hp[0, pdef])

    ga, pdef2, ratk2, dtile2 = setup(True, False)
    hp0b = int(ga.seat0_unit_hp[0, pdef2])
    ga._hostile_vs_unit(torch.tensor([True]), torch.tensor([dtile2]), "civ", ratk2)
    dmg_atkgen = hp0b - int(ga.seat0_unit_hp[0, pdef2])
    assert dmg_atkgen > dmg_base, f"attacker general aura did not raise damage ({dmg_base} -> {dmg_atkgen})"

    # --- defender aura: seat-0 defender +5 -> LESS damage taken
    gd, pdef3, ratk3, dtile3 = setup(False, True)
    hp0c = int(gd.seat0_unit_hp[0, pdef3])
    gd._hostile_vs_unit(torch.tensor([True]), torch.tensor([dtile3]), "civ", ratk3)
    dmg_defgen = hp0c - int(gd.seat0_unit_hp[0, pdef3])
    assert dmg_defgen < dmg_base, f"defender general aura did not lower damage taken ({dmg_base} -> {dmg_defgen})"
    print(f"  4 aura in combat OK — atk+gen {dmg_base}->{dmg_atkgen} dmg dealt, def+gen {dmg_base}->{dmg_defgen} dmg taken")


# (There is no general war-march poke: marching toward the enemy and halting at
# aura range is the DRIVER's policy, not an engine rule.)


def poke_capture(rules, rj, path):
    """6. Type-agnostic capture: an at-war civ melee on a lone seat-0 GENERAL
    CAPTURES it — POOL-END transfer to the v_ pool, type/charges carried."""
    WARRIOR = [u["id"] for u in rules.units].index("WARRIOR")
    sim = build(rules, path)
    gi = sim._general_unit_idx
    clear_all_units(sim)
    sim.civ_only_atwar[:, 0] = True
    sim.sync_war()  # a poked war write lands in one cell; mirror the pair
    ctr = int(sim.site[0, 0])
    gtile = tile_within(sim, ctr, 4)
    atile = adj_free(sim, gtile, banned=[ctr])
    assert gtile >= 0 and atile >= 0
    pgen = place_pciv(sim, gtile, gi)  # a lone seat-0 general
    ratk = place_rmil(sim, 0, atile, WARRIOR)
    v_before = int(sim.civ_unit_next[0])
    sim._hostile_vs_unit(torch.tensor([True]), torch.tensor([gtile]), "civ", ratk)
    assert not bool(sim.seat0_unit_alive[0, pgen]), "captured seat-0 general must leave the seat-0 pool"
    # POOL-END: appended at the old civ_unit_next slot, type carried, owned by civ 0
    cap = v_before
    assert bool(sim.civ_unit_alive[0, cap]) and int(sim.civ_unit_type[0, cap]) == gi, "captured general not appended to the civ pool tail as a GENERAL"
    assert int(sim.civ_unit_civ[0, cap]) == 0, "captured general not keyed to the captor's civ"
    assert int(sim.civ_civilian_at[0, gtile]) == cap, "captured general not registered on the civ civilian plane"
    print("  6 GENERAL capture OK — B-31 POOL-END transfer, type carried")


sim0 = None  # module-level handle for poke_seat0_spawn's roster indices


def main() -> None:
    global sim0
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text())
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"gp_aura_test on {path.name}")
    sim0 = build(rules, path, steps=1)  # roster indices only

    poke_exclusion(rules, rj, path)
    poke_seat0_spawn(rules, rj, path)
    poke_aura_helper(rules, rj, path)
    poke_aura_in_combat(rules, rj, path)
    poke_capture(rules, rj, path)
    print("GP_AURA (B-8) POKES OK")


if __name__ == "__main__":
    main()
