"""civ6lab minor_play_census — a city-state's purchases and upgrades, fitted
to the watched games (C-38).

    python tools/civ6lab/minor_play_census.py

What it prints and cpu/data/cityStates.ts carries: the per-minor Builder
purchase rate's twenty quantiles (`MINOR_BUILDER_BUY_SLOTS`); the military
purchases' bank floor and rate by military count, a loss window apart
(`MINOR_MILITARY_BUY_*`, `MINOR_LOSS_BUY_*`); the ships it buys and their
rate (`MINOR_NAVAL_BUY_BP`); the gold an upgrade spends
(`MINOR_UPGRADE_GOLD`, exact on the single-upgrade turns whose neighbouring
income is flat).

Reads `runs/cs_watch_*.jsonl` (one record per living minor per turn: its
treasury `gold`, `faith`, its city `[x, y, pop, building, _]`, its units
`[type, x, y, damage]` with no ids, the players it is at war with). A
minor-game is (game, player); lab4's three files are one game; the Free Cities
player is not a minor. Between two consecutive records a unit TYPE's count
moves; the moves are explained in this order:

  * an UPGRADE: a type A falls by one while its upgrade (the install's
    `UnitUpgrades`, Gathering Storm) rises by one;
  * a TRAINED unit: the city was building that type on the earlier record and
    no longer is (or the count rose while it kept building it and the next
    record's item differs);
  * a PURCHASE: any other rise;
  * a LOSS: any other fall of a military unit.

The gold a transition spends is the income the neighbouring event-free
transitions show, less the observed change.
"""
from __future__ import annotations

import collections
import glob
import json
import re
import statistics
import sys

RUNS = "tools/civ6lab/runs"
# the install's UnitUpgrades (Base Units.xml) with Gathering Storm's updates
# (Expansion2_Units.xml, Expansion1_Units.xml under DLC/Expansion2)
UPGRADE = {
    "UNIT_WARRIOR": "UNIT_SWORDSMAN", "UNIT_SWORDSMAN": "UNIT_MAN_AT_ARMS", "UNIT_MAN_AT_ARMS": "UNIT_MUSKETMAN",
    "UNIT_MUSKETMAN": "UNIT_LINE_INFANTRY", "UNIT_LINE_INFANTRY": "UNIT_INFANTRY",
    "UNIT_INFANTRY": "UNIT_MECHANIZED_INFANTRY",
    "UNIT_SPEARMAN": "UNIT_PIKEMAN", "UNIT_PIKEMAN": "UNIT_PIKE_AND_SHOT", "UNIT_PIKE_AND_SHOT": "UNIT_AT_CREW",
    "UNIT_AT_CREW": "UNIT_MODERN_AT",
    "UNIT_SLINGER": "UNIT_ARCHER", "UNIT_ARCHER": "UNIT_CROSSBOWMAN", "UNIT_CROSSBOWMAN": "UNIT_FIELD_CANNON",
    "UNIT_FIELD_CANNON": "UNIT_MACHINE_GUN",
    "UNIT_HORSEMAN": "UNIT_COURSER", "UNIT_COURSER": "UNIT_CAVALRY", "UNIT_CAVALRY": "UNIT_HELICOPTER",
    "UNIT_HEAVY_CHARIOT": "UNIT_KNIGHT", "UNIT_KNIGHT": "UNIT_CUIRASSIER", "UNIT_CUIRASSIER": "UNIT_TANK",
    "UNIT_TANK": "UNIT_MODERN_ARMOR",
    "UNIT_CATAPULT": "UNIT_TREBUCHET", "UNIT_TREBUCHET": "UNIT_BOMBARD", "UNIT_BOMBARD": "UNIT_ARTILLERY",
    "UNIT_ARTILLERY": "UNIT_ROCKET_ARTILLERY",
    "UNIT_SCOUT": "UNIT_SKIRMISHER", "UNIT_SKIRMISHER": "UNIT_RANGER", "UNIT_RANGER": "UNIT_SPEC_OPS",
    "UNIT_GALLEY": "UNIT_CARAVEL", "UNIT_QUADRIREME": "UNIT_FRIGATE", "UNIT_CARAVEL": "UNIT_IRONCLAD",
    "UNIT_IRONCLAD": "UNIT_DESTROYER", "UNIT_FRIGATE": "UNIT_BATTLESHIP",
    "UNIT_BATTERING_RAM": "UNIT_SIEGE_TOWER", "UNIT_SIEGE_TOWER": "UNIT_MEDIC", "UNIT_MEDIC": "UNIT_SUPPLY_CONVOY",
    "UNIT_ANTIAIR_GUN": "UNIT_MOBILE_SAM", "UNIT_OBSERVATION_BALLOON": "UNIT_DRONE",
}
CIVILIAN = {"UNIT_SETTLER", "UNIT_BUILDER", "UNIT_TRADER", "UNIT_SUPPLY_CONVOY", "UNIT_MILITARY_ENGINEER",
            "UNIT_MEDIC", "UNIT_OBSERVATION_BALLOON", "UNIT_BATTERING_RAM", "UNIT_SIEGE_TOWER", "UNIT_DRONE",
            "UNIT_ANTIAIR_GUN", "UNIT_MOBILE_SAM"}
NAVAL = {"UNIT_GALLEY", "UNIT_QUADRIREME", "UNIT_CARAVEL", "UNIT_FRIGATE", "UNIT_IRONCLAD", "UNIT_DESTROYER",
         "UNIT_BATTLESHIP", "UNIT_PRIVATEER", "UNIT_SUBMARINE", "UNIT_MISSILE_CRUISER", "UNIT_NUCLEAR_SUBMARINE",
         "UNIT_AIRCRAFT_CARRIER"}


def land_military(ty: str) -> bool:
    return ty not in CIVILIAN and ty not in NAVAL


def load_minors():
    games: dict = collections.defaultdict(lambda: collections.defaultdict(dict))
    for f in sorted(glob.glob(f"{RUNS}/cs_watch_*.jsonl")):
        g = re.search(r"cs_watch_([A-Za-z0-9]+)_", f).group(1)
        for ln in open(f, encoding="utf-8"):
            if not ln.startswith("{"):
                continue
            r = json.loads(ln)
            if r["civ"] == "CIVILIZATION_FREE_CITIES":
                continue
            games[g][r["p"]][r["t"]] = r
    return {(g, p): [byt[t] for t in sorted(byt)] for g, ps in games.items() for p, byt in ps.items()}


def transitions(rows):
    """[(r0, r1, events)] over consecutive records holding a city; events is a
    dict of upgrades [(from, to)], trained [type], bought [type], lost [type]."""
    out = []
    for r0, r1 in zip(rows, rows[1:]):
        if r1["t"] != r0["t"] + 1 or not r0["cities"] or not r1["cities"]:
            continue
        c0 = collections.Counter(u[0] for u in r0["units"])
        c1 = collections.Counter(u[0] for u in r1["units"])
        up = []
        for a in sorted(c0):
            b = UPGRADE.get(a)
            while b and c1[a] < c0[a] and c1[b] > c0[b]:
                up.append((a, b))
                c0[a] -= 1
                c0[b] += 1
        item0 = r0["cities"][0][3]
        trained, bought, lost = [], [], []
        for ty in sorted(set(c0) | set(c1)):
            d = c1[ty] - c0[ty]
            for _ in range(max(0, d)):
                if item0 == ty and not trained:
                    trained.append(ty)
                else:
                    bought.append(ty)
            for _ in range(max(0, -d)):
                lost.append(ty)
        out.append((r0, r1, {"up": up, "trained": trained, "bought": bought, "lost": lost}))
    return out


def income_estimates(trs):
    """per transition index: the income, the median of up to three event-free
    transitions on each side within six turns."""
    clean = [i for i, (r0, r1, ev) in enumerate(trs)
             if not ev["up"] and not ev["bought"] and not ev["lost"] and not ev["trained"]]
    est = {}
    for i, (r0, r1, _ev) in enumerate(trs):
        near = [j for j in clean if j != i and abs(trs[j][0]["t"] - r0["t"]) <= 6]
        near.sort(key=lambda j: abs(trs[j][0]["t"] - r0["t"]))
        near = near[:6]
        if len(near) >= 2:
            est[i] = statistics.median(trs[j][1]["gold"] - trs[j][0]["gold"] for j in near)
    return est


def exact_upgrade_cost(data):
    """(spent, income change after) on the single-upgrade turns whose two
    event-free turns before carry the same income"""
    out = collections.Counter()
    for rows in data.values():
        trs = transitions(rows)
        for i in range(2, len(trs) - 2):
            r0, _r1, ev = trs[i]
            if len(ev["up"]) != 1 or ev["bought"] or ev["trained"] or ev["lost"] or r0["gold"] < 30:
                continue
            around = [trs[j][2] for j in (i - 2, i - 1, i + 1, i + 2)]
            if any(e["up"] or e["bought"] or e["trained"] or e["lost"] for e in around):
                continue
            d = [trs[j][1]["gold"] - trs[j][0]["gold"] for j in (i - 2, i - 1, i)]
            if abs(d[1] - d[0]) > 0.01:
                continue
            out[round(d[1] - d[2], 1)] += 1
    return out


def builder_price(n: int) -> int:
    """(25 + 2n) x 4, floored to a multiple of 5 — the engine's online price."""
    return ((25 + 2 * n) * 4) // 5 * 5


def main() -> int:
    data = load_minors()
    up_cost, up_n, up_turns = [], 0, 0
    up_left = []  # (upgraded that turn, still-upgradeable of that from-type left)
    b_buys, b_spent = [], []
    b_elig = collections.Counter()
    b_hit = collections.Counter()
    m_elig = collections.Counter()
    m_hit = collections.Counter()
    m_elig_loss = collections.Counter()
    m_hit_loss = collections.Counter()
    m_bank, m_share, m_types = [], [], collections.Counter()
    per_minor_b = []
    faith_buys = []
    for key, rows in data.items():
        trs = transitions(rows)
        inc = income_estimates(trs)
        acquired_b = 0
        last_loss = -99
        mb_elig = mb_hit = 0
        for i, (r0, r1, ev) in enumerate(trs):
            g0, g1 = r0["gold"], r1["gold"]
            army = sum(1 for u in r0["units"] if land_military(u[0]))
            has_b = any(u[0] == "UNIT_BUILDER" for u in r0["units"])
            price = builder_price(acquired_b)
            # a Builder purchase
            if not has_b and g0 >= price:
                band = min(g0 // 100, 4)
                b_elig[band] += 1
                mb_elig += 1
                if "UNIT_BUILDER" in ev["bought"]:
                    b_hit[band] += 1
                    mb_hit += 1
            if "UNIT_BUILDER" in ev["bought"]:
                b_buys.append((has_b, g0))
                if i in inc and len(ev["bought"]) == 1 and not ev["up"]:
                    b_spent.append((g0 + inc[i] - g1, price))
            acquired_b += ev["trained"].count("UNIT_BUILDER") + ev["bought"].count("UNIT_BUILDER")
            # a military purchase: a land military rise the treasury paid for
            # (a levy's return pays nothing), a Warrior Monk paid in faith
            spent = g0 + inc[i] - g1 if i in inc else None
            mil_bought = [t for t in ev["bought"] if land_military(t) and t != "UNIT_WARRIOR_MONK"]
            if not (spent is not None and spent >= 30 * len(mil_bought)):
                mil_bought = []
            if g0 >= 95:
                a = min(army, 8)
                recent = r0["t"] - last_loss <= 3
                (m_elig_loss if recent else m_elig)[a] += 1
                if mil_bought:
                    (m_hit_loss if recent else m_hit)[a] += 1
            for t in mil_bought:
                m_bank.append(g0)
                m_types[t] += 1
                if i in inc and not ev["up"] and len(ev["bought"]) == 1:
                    m_share.append((g1 - 0) / g0 if g0 > 0 else 0)
            if any(land_military(t) for t in ev["lost"]):
                last_loss = r1["t"]
            # upgrades
            if ev["up"]:
                up_turns += 1
                up_n += len(ev["up"])
                if i in inc and not ev["bought"] and not ev["trained"]:
                    up_cost.append((g0 + inc[i] - g1) / len(ev["up"]))
                c1 = collections.Counter(u[0] for u in r1["units"])
                for a in {a for a, _b in ev["up"]}:
                    up_left.append((sum(1 for x, _ in ev["up"] if x == a), c1[a]))
            # faith
            if r1.get("faith", 0) < r0.get("faith", 0) - 1:
                faith_buys.append((key, r0["t"], r0["faith"], r1["faith"], ev["bought"]))
        if mb_elig:
            per_minor_b.append((mb_hit, mb_elig))
    print(f"{len(data)} minor-games")
    print("\nUPGRADES:", up_n, "over", up_turns, "turns")
    if up_cost:
        print("  gold per upgrade (income-corrected): n", len(up_cost), "median",
              round(statistics.median(up_cost), 2), "mean", round(statistics.mean(up_cost), 2))
        print("  distribution", sorted(collections.Counter(round(c) for c in up_cost).items()))
    exact = exact_upgrade_cost(data)
    print("  on flat-income single-upgrade turns, gold spent:", exact.most_common(8))
    left = collections.Counter(l for _n, l in up_left)
    print("  same-type units left un-upgraded on an upgrade turn:", sorted(left.items()))
    print("\nBUILDER BUYS:", len(b_buys), "with none standing:", sum(1 for h, _ in b_buys if not h),
          "bank min", min(g for _h, g in b_buys) if b_buys else None)
    if b_spent:
        print("  spent vs engine price: median spent", statistics.median(s for s, _p in b_spent),
              "residual (spent - price) median", statistics.median(s - p for s, p in b_spent))
    for band in sorted(b_elig):
        print(f"  bank {band * 100}-{band * 100 + 99}: {b_hit[band]}/{b_elig[band]} = "
              f"{b_hit[band] / b_elig[band]:.4f}")
    tot_h, tot_e = sum(b_hit.values()), sum(b_elig.values())
    print(f"  pooled {tot_h}/{tot_e} = {tot_h / tot_e:.4f}")
    rates = sorted(h / e for h, e in per_minor_b if e >= 10)
    if rates:
        print("  per-minor rate (>= 10 eligible turns) quantiles:",
              [round(rates[min(len(rates) - 1, int((k + 0.5) / 20 * len(rates)))], 3) for k in range(20)])
    print("\nMILITARY BUYS:", len(m_bank), "bank min", min(m_bank) if m_bank else None,
          "types", dict(m_types.most_common()))
    if m_share:
        print("  share of the bank left: median", round(statistics.median(m_share), 3))
    for a in sorted(set(m_elig) | set(m_elig_loss)):
        e, h = m_elig[a], m_hit[a]
        el, hl = m_elig_loss[a], m_hit_loss[a]
        print(f"  army {a}{'+' if a == 8 else ''}: {h}/{e} = {h / max(e, 1):.4f}   within 3 of a loss "
              f"{hl}/{el} = {hl / max(el, 1):.4f}")
    # NAVAL BUYS: a ship rise no training or upgrade explains; the rate over
    # the rich turns (no ship standing, the bank at a Galley's 125) of the
    # minors whose record shows a coast — a Harbor, Lighthouse, Shipyard,
    # Seaport or the Harbor's project started, or a ship held
    coast_items = {"DISTRICT_HARBOR", "BUILDING_LIGHTHOUSE", "BUILDING_SHIPYARD", "BUILDING_SEAPORT",
                   "PROJECT_ENHANCE_DISTRICT_HARBOR"}
    n_buys, n_rich, n_hit, coastal = collections.Counter(), 0, 0, 0
    for key, rows in data.items():
        if not any(any(u[0] in NAVAL for u in r["units"]) or (r["cities"] and r["cities"][0][3] in coast_items)
                   for r in rows):
            continue
        coastal += 1
        trs = transitions(rows)
        inc = income_estimates(trs)
        for i, (r0, r1, ev) in enumerate(trs):
            for t in ev["bought"]:
                if t in NAVAL:
                    n_buys[t] += 1
            if any(u[0] in NAVAL for u in r0["units"]) or r0["gold"] < 125:
                continue
            n_rich += 1
            spent = r0["gold"] + inc[i] - r1["gold"] if i in inc else None
            if any(t in NAVAL for t in ev["bought"]) and (spent is None or spent >= 100):
                n_hit += 1
    print(f"\nNAVAL BUYS: {dict(n_buys)} over {coastal} coastal minor-games; with none standing and a bank"
          f" of 125: {n_hit}/{n_rich} = {10000 * n_hit / max(n_rich, 1):.0f} per ten thousand")
    print("\nFAITH SPENT:", len(faith_buys))
    for fb in faith_buys:
        print("  ", fb)
    return 0


if __name__ == "__main__":
    sys.exit(main())
