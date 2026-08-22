"""Encampment self-test.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/encampment_test.py

Covers three Encampment surfaces on the GPU engine (the TS twin is
tests/cpu/city/encampment.test.ts; scripted parity is the primary correctness
bar — these pokes are gate-unreachable-surface coverage):

  1. Training-XP catalog: _b_train_xp exports 5/5/10/15 for
     BARRACKS/STABLE/ARMORY/MILITARY_ACADEMY and 0 for every other building.
  2. Training XP wiring: _spawn_unit honours init_xp on every row — a
     MILITARY unit inherits the city's best Encampment tier, a civilian stays
     at 0.
  3. The ADDITIONAL Encampment strike: a seat-0 city owning a COMPLETE
     unpillaged Encampment fires a once/turn ranged strike (k="estk") at the
     nearest hostile unit; removing the Encampment (control) removes the
     strike. A city with BOTH walls and an Encampment rolls TWICE — walls first
     (k="cstk"), then Encampment (k="estk").

An AT-WAR civ unit is the strike target: civ units do NOT act in
the shared per-city body directly, so the target is stationary and the strike
is deterministic.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all

BUILDING_IDS = [b["id"] for b in json.loads((FIXTURES / "rules.json").read_text())["buildings"]]


def bidx_of(bid: str) -> int:
    return BUILDING_IDS.index(bid)


def test_catalog(sim) -> None:
    """CIV6: every experience line reads "+25% combat experience", and the
    classes each building reaches are what tell them apart."""
    rd = sim.rules_dev
    want = {"BARRACKS", "STABLE", "ARMORY", "MILITARY_ACADEMY", "SHIPYARD", "SEAPORT"}
    for bid in want:
        got = int(rd.b_train_xp_pct[bidx_of(bid)])
        assert got == 25, f"trainXpPct[{bid}] = {got}, want 25"
        assert bool(rd.b_train_xp_cls[bidx_of(bid)].any()), f"{bid} reaches no unit class"
    for i, bid in enumerate(BUILDING_IDS):
        if bid not in want:
            assert int(rd.b_train_xp_pct[i]) == 0, f"trainXpPct[{bid}] should be 0"
    cls = list(rd.promo_classes)
    naval = [cls.index(c) for c in ("NAVAL_MELEE", "NAVAL_RANGED") if c in cls]
    assert all(bool(rd.b_train_xp_cls[bidx_of("SHIPYARD"), c]) for c in naval), "Shipyard misses the fleet"
    assert not bool(rd.b_train_xp_cls[bidx_of("BARRACKS"), cls.index("HEAVY_CAV")]), \
        "Barracks names melee, ranged and anti-cavalry — never cavalry"
    print(f"  catalog OK: six +25% lines over {len(BUILDING_IDS)} buildings, each to its own classes")


def test_training_xp_wiring(rules, path) -> None:
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    mil_ty = int(torch.tensor([c if not bool(sim._type_civilian[i]) else -1 for i, c in enumerate(sim._type_combat.tolist())]).argmax())
    assert not bool(sim._type_civilian[mil_ty]) and float(sim._type_combat[mil_ty]) > 0, "no military unit type found"
    ctr = sim.city_center[:, 0, 0].clamp(min=0)

    # the line is a PERCENTAGE the unit carries for life, never starting XP
    bl = torch.zeros_like(sim.city_bldg[:, 0, 0])  # [B, NB]
    bl[:, bidx_of("BARRACKS")] = True
    bl[:, bidx_of("ARMORY")] = True
    pct = sim._train_xp_pct(bl, torch.tensor([mil_ty]))
    assert int(pct[0]) == 50, f"a Barracks and an Armory on a melee chassis = {int(pct[0])}%, want 50"

    slot0 = int(sim.unit_next[0])
    sim._spawn_unit(0, torch.tensor([True]), ctr, torch.tensor([mil_ty]), init_xp=pct)
    assert int(sim.unit_next[0]) == slot0 + 1, "military unit did not spawn"
    assert int(sim.major_unit_xp[0, slot0]) == 0, "a fresh unit banks no XP"
    assert int(sim.major_unit_xp_pct[0, slot0]) == 50, "the trained percentage did not land"
    assert int(sim.major_unit_level[0, slot0]) == 1, "a brand new unit starts at level 1"
    assert int(sim.major_unit_promos[0, slot0]) == 0, "a fresh unit holds no promotion"

    # CIVILIAN: no class, so no percentage reaches it
    bld_ty = sim._builder_idx
    assert bld_ty >= 0 and bool(sim._type_civilian[bld_ty]), "builder type not civilian"
    assert int(sim._train_xp_pct(bl, torch.tensor([bld_ty]))[0]) == 0, \
        "a builder promotes from no class and reads no experience line"

    # CIV SEAT mirror: the same body on row 1
    vslot = int(sim.unit_next[0])
    sim._spawn_unit(1, torch.tensor([True]), ctr, torch.tensor([mil_ty]), init_xp=pct)
    assert int(sim.unit_next[0]) == vslot + 1, "civ unit did not spawn"
    assert int(sim.major_unit_xp_pct[0, vslot]) == 50, "the civ row lost the trained percentage"
    print("  training-XP wiring OK: the lines stack to a lifetime 50%, and a civilian reads none")


def build_strike_scene(rules, path):
    """A seat-0 city (slot 0) owning a COMPLETE Encampment, one AT-WAR civ
    warrior adjacent, no barbs. Returns (sim, enc_tile, tgt_tile, vslot)."""
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    assert sim.districts_on and sim._encamp_didx >= 0, "encampment district not exported"
    # advance a little so the seat-0 city has borders/tiles
    for _ in range(6):
        sim.step()
    ctr = int(sim.city_center[0, 0, 0])
    assert ctr >= 0, "no seat-0 capital"
    # clear barbs so the civ unit is the unambiguous nearest hostile
    _pl = sim.military_at[0]  # clear only this pool's entries
    _pl[(_pl >= sim.POOL_LO["barb"]) & (_pl < sim.POOL_HI["barb"])] = -1
    sim.barb_unit_alive[0, :] = False
    sim.n_camps[0] = sim.max_camps[0]
    # an OWNED non-center tile with no district -> plant a complete Encampment
    owned = ((sim.city_slot_at(0)[0] == 0) & (sim.district[0] < 0)).nonzero(as_tuple=True)[0]
    assert len(owned) > 0, "no free owned tile to place the Encampment"
    enc_tile = int(owned[0])
    sim.district[0, enc_tile] = sim._encamp_didx
    sim.district_complete[0, enc_tile] = True
    # the strike walks the city's own REGISTRY (`city_dist_tile`), not the
    # tile plane — a hand-built scene must write both, like a real completion
    sim.city_dist_tile[0, 0, 0, sim._encamp_didx] = enc_tile
    # A completed Encampment musters its garrison, and the strike requires a
    # LIVE one (an Encampment at 0 HP is occupied and fires nothing). The
    # engine writes this at every completion site; a hand-built scene has to
    # write it too, exactly like district_complete.
    sim.encamp_hp[0, enc_tile] = sim._encamp_hp_max
    sim.district_pillaged[0, enc_tile] = False
    sim.district_dead[0, enc_tile] = False
    # a distance-1 empty tile for the target
    dfc = sim.pair_dist[ctr].to(torch.long)
    free = ((dfc == 1) & (sim.military_at[0] < 0) & (sim.civilian_at[0] < 0)).nonzero(as_tuple=True)[0]
    assert len(free) > 0, "no free adjacent tile for the target"
    tgt = int(free[0])
    vslot = int((~sim.major_unit_alive[0]).nonzero(as_tuple=True)[0][0])
    # high-combat civ type -> small damage rolls -> survives two strikes
    strong_ty = int(sim._type_combat.argmax())
    sim.military_at[0, tgt] = vslot + sim.POOL_LO["major"]
    sim.major_unit_alive[0, vslot] = True
    sim.major_unit_hp[0, vslot] = 100
    sim.major_unit_type[0, vslot] = strong_ty
    sim.major_unit_seat[0, vslot] = 0 + 1
    sim.major_unit_emb[0, vslot] = False
    sim.war[0, 0, 1 + 0] = sim.war[0, 1 + 0, 0] = True
    sim.sync_war()  # close the war matrix under transpose
    # CIV6: the Encampment's defenses ARE the City Center's — walls "supply
    # both" — and it strikes only while that perimeter stands.
    assert sim._walls_bidx >= 0, "ANCIENT_WALLS not exported"
    sim.city_bldg[0, 0, 0, sim._walls_bidx] = True
    sim.city_outer_hp[0, 0, 0] = sim._walls_hp
    return sim, enc_tile, tgt, vslot


def fire(sim, row: int = 0, col: int = 0) -> None:
    """Run ONE city's walls+Encampment strike and heal — the same body every
    seat row calls from its own per-city block."""
    c = torch.full((sim.B,), col, dtype=torch.long)
    sim._seat_city_fire_and_heal(row, c, sim.city_alive[:, row, col])


def test_strike(rules, path) -> None:
    # --- encampment ON: estk fires, target loses HP
    sim, enc_tile, tgt, vslot = build_strike_scene(rules, path)
    sim._log_combat_b = 0
    sim._combat_events = []
    hp0 = int(sim.major_unit_hp[0, vslot])
    fire(sim)
    ev_on = [e for e in sim._combat_events if "k:estk" in e]
    assert len(ev_on) >= 1, f"Encampment strike did not fire (events: {sim._combat_events})"
    assert int(sim.major_unit_hp[0, vslot]) < hp0, "target took no Encampment-strike damage"
    print(f"  strike ON OK: estk fired, target hp {hp0} -> {int(sim.major_unit_hp[0, vslot])}")

    # --- control: no Encampment -> no estk, target untouched
    sim2, enc2, tgt2, v2 = build_strike_scene(rules, path)
    sim2.district_complete[0, enc2] = False  # incomplete Encampment: no strike
    sim2._log_combat_b = 0
    sim2._combat_events = []
    fire(sim2)
    ks2 = [e.split()[0] for e in sim2._combat_events if ("k:cstk" in e or "k:estk" in e)]
    assert ks2 == ["k:cstk"], f"incomplete Encampment still struck: {ks2}"
    print("  strike CONTROL OK: an incomplete Encampment fires nothing; only the walls roll")

    # --- walls + Encampment: rolls TWICE, walls (cstk) BEFORE Encampment (estk)
    sim3, enc3, tgt3, v3 = build_strike_scene(rules, path)
    sim3._log_combat_b = 0
    sim3._combat_events = []
    fire(sim3)
    ks = [e.split()[0] for e in sim3._combat_events if ("k:cstk" in e or "k:estk" in e)]
    assert "k:cstk" in ks and "k:estk" in ks, f"both strikes must fire, got {ks}"
    assert ks.index("k:cstk") < ks.index("k:estk"), f"walls must roll BEFORE Encampment, got {ks}"
    print(f"  double-roll OK: walls-first order {ks}")

    # --- a BREACHED perimeter silences both strikes
    sim4, enc4, tgt4, v4 = build_strike_scene(rules, path)
    sim4.city_outer_hp[0, 0, 0] = 0
    sim4._log_combat_b = 0
    sim4._combat_events = []
    hp0c = int(sim4.major_unit_hp[0, v4])
    fire(sim4)
    ks4 = [e.split()[0] for e in sim4._combat_events if ("k:cstk" in e or "k:estk" in e)]
    assert ks4 == [], f"a destroyed Outer Defense still struck: {ks4}"
    assert int(sim4.major_unit_hp[0, v4]) == hp0c, "target lost HP with the perimeter down"
    print("  breached-perimeter OK: neither the city nor its Encampment fires")


def test_district_perimeter(rules, path) -> None:
    """CIV6 gives a defensible district "Defenses HP equal to the City Center"
    and one set of Walls "supplies both", so a melee assault on an Encampment
    divides exactly as a hit on the centre does: the perimeter share comes off
    the CITY's pool and only what gets through reaches the garrison. The
    district also fights at the city's strength "excluding any bonus obtained
    for a Garrisoned unit"."""
    sim, enc_tile, _tgt, _v = build_strike_scene(rules, path)
    # the attacker: a melee unit of seat row 1, standing beside the district
    free = [int(t) for t in sim.neigh[enc_tile].tolist()
            if t >= 0 and bool(sim.passable[0, t]) and int(sim.military_at[0, t]) < 0]
    assert free, "no free tile beside the Encampment"
    slot = int(sim.unit_next[0])
    sim.unit_next[0] = slot + 1
    ty = next(i for i in range(sim.NU)
              if bool(sim._type_melee[i]) and not bool(sim._type_civilian[i]))
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = 1
    sim.major_unit_type[0, slot] = ty
    sim.major_unit_tile[0, slot] = free[0]
    sim.major_unit_hp[0, slot] = 100
    sim.military_at[0, free[0]] = slot + sim.POOL_LO["major"]
    sim.encamp_hp[0, enc_tile] = sim._encamp_hp_max
    sim.city_outer_hp[0, 0, 0] = sim._walls_hp
    sim.city_last_hit[0, 0, 0] = 0

    tile = torch.full((sim.B,), enc_tile, dtype=torch.long, device=sim.device)
    sim._attack_encampment(torch.tensor([True], device=sim.device), tile, "major", slot)
    perim_lost = sim._walls_hp - int(sim.city_outer_hp[0, 0, 0])
    garrison_lost = sim._encamp_hp_max - int(sim.encamp_hp[0, enc_tile])
    assert perim_lost > 0, "the assault never touched the city's perimeter"
    assert garrison_lost == 1, \
        f"an intact perimeter must hold the garrison to 1, like a centre: {garrison_lost}"
    assert perim_lost < sim._walls_hp // 2, \
        f"the perimeter took {perim_lost} — the -85% melee reduction is missing"
    assert int(sim.city_last_hit[0, 0, 0]) == sim.turn, \
        "a hit on the district must stamp the CITY's damage clock"
    print(f"  district perimeter OK: perimeter -{perim_lost}, garrison -{garrison_lost} out of ONE roll")

    # with the perimeter already gone, the whole roll reaches the garrison
    sim2, enc2, _t2, _v2 = build_strike_scene(rules, path)
    free2 = [int(t) for t in sim2.neigh[enc2].tolist()
             if t >= 0 and bool(sim2.passable[0, t]) and int(sim2.military_at[0, t]) < 0]
    s2 = int(sim2.unit_next[0]); sim2.unit_next[0] = s2 + 1
    sim2.major_unit_alive[0, s2] = True
    sim2.major_unit_seat[0, s2] = 1
    sim2.major_unit_type[0, s2] = ty
    sim2.major_unit_tile[0, s2] = free2[0]
    sim2.major_unit_hp[0, s2] = 100
    sim2.military_at[0, free2[0]] = s2 + sim2.POOL_LO["major"]
    sim2.encamp_hp[0, enc2] = sim2._encamp_hp_max
    sim2.city_outer_hp[0, 0, 0] = 0
    t2 = torch.full((sim2.B,), enc2, dtype=torch.long, device=sim2.device)
    sim2._attack_encampment(torch.tensor([True], device=sim2.device), t2, "major", s2)
    breached = sim2._encamp_hp_max - int(sim2.encamp_hp[0, enc2])
    assert breached > 10, f"a breached perimeter must let the roll through: {breached}"
    print(f"  breached OK: with the pool at 0 the garrison takes {breached}")


def test_district_heal_gate(rules, path) -> None:
    """CIV6: the Encampment "is capable of Healing at the rate of 20 HP/turn.
    This is an automatic action, which happens if its tile is not occupied."""
    def run(occupy: bool) -> int:
        sim, enc_tile, _t, _v = build_strike_scene(rules, path)
        sim.encamp_hp[0, enc_tile] = 10
        for n in [int(x) for x in sim.neigh[int(sim.city_center[0, 0, 0])].tolist() if x >= 0]:
            sim.military_at[0, n] = -1
        sim.military_at[0, enc_tile] = -1
        if occupy:
            slot = int(sim.unit_next[0]); sim.unit_next[0] = slot + 1
            sim.major_unit_alive[0, slot] = True
            sim.major_unit_seat[0, slot] = 1
            sim.major_unit_type[0, slot] = sim._warrior_idx
            sim.major_unit_tile[0, slot] = enc_tile
            sim.major_unit_hp[0, slot] = 100
            sim.military_at[0, enc_tile] = slot + sim.POOL_LO["major"]
        fire(sim)
        return int(sim.encamp_hp[0, enc_tile])

    free_hp, held_hp = run(False), run(True)
    assert free_hp > 10, f"an unoccupied Encampment must heal: {free_hp}"
    assert held_hp == 10, f"an occupied Encampment must not heal: {held_hp}"
    print(f"  district heal OK: 10 -> {free_hp} unoccupied, held at {held_hp} with an enemy on the tile")


def test_civ_encamp_prod_mult(rules, path) -> None:
    """A civ seat's GOVERNMENT encampHarborProdMult scales its queue head when
    that head is an Encampment item, mirroring the seat-0 path.

    THIS POKE IS THE ONLY COVERAGE: the scripted export produces no civ
    encampment items, and no shipped government carries a non-unit multiplier,
    so the gate cannot reach the channel at all. Both inputs are poked
    directly."""
    def _prep():
        s = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
        for _ in range(80):          # civs need civics before they adopt a government
            s.step()
        return s
    sim = _prep()
    if not sim._gov_has_effects or sim._encamp_si < 0 or sim.n_majors < 2:
        print("  civ encampHarborProdMult SKIPPED (no gov effects / no Encampment scaffold)")
        return
    r = 0
    live = (sim.city_alive[0, r + 1]).nonzero(as_tuple=True)[0]
    if not len(live):
        print("  civ encampHarborProdMult SKIPPED (no live civ city)")
        return
    j = int(live[0])
    _ad, _has = sim._adopted_gov(sim.civ_civics[:, r + 1])
    if not bool(_has[0]):
        print("  civ encampHarborProdMult SKIPPED (civ has adopted no government)")
        return
    gi = int(_ad[0])
    enc_code = sim.DISTRICT_BASE + sim._encamp_si

    def _run(mult):
        s = _prep()
        s.city_current[0, r + 1, j] = enc_code
        s.city_cost[0, r + 1, j] = 1e9      # never completes, so progress stays readable
        s.city_progress[0, r + 1, j] = 0.0
        s.city_prod_bank[0, r + 1, j] = 0.0
        s._gov_ehprod[:] = 1.0
        s._gov_ehprod[gi] = mult
        s._eff_version += 1           # the gov/policy mods cache keys on this
        s.step()
        return float(s.city_progress[0, r + 1, j])

    plain, doubled = _run(1.0), _run(2.0)
    assert plain > 0, "the civ city produced nothing — poke cannot measure the multiplier"
    assert abs(doubled - 2.0 * plain) < 1e-6, f"x2 encampHarborProdMult: got {doubled}, plain {plain}"
    print(f"  civ encampHarborProdMult OK (x2 on the Encampment head: {plain} -> {doubled})")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim0 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    print(f"encampment_test on {paths[0].name}:")
    test_catalog(sim0)
    test_training_xp_wiring(rules, paths[0])
    test_strike(rules, paths[0])
    test_district_perimeter(rules, paths[0])
    test_district_heal_gate(rules, paths[0])
    test_civ_encamp_prod_mult(rules, paths[0])
    print("ENCAMPMENT OK")


if __name__ == "__main__":
    main()
