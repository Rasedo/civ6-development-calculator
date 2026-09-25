"""civ6lab minor_play_census — a city-state's purchases, upgrades and walker,
and the Free Cities' walker, fitted to the watched games (C-38, C-60).

    python tools/civ6lab/minor_play_census.py            # the census
    python tools/civ6lab/minor_play_census.py --walk     # + the walker weights' fit

What it prints and cpu/data/cityStates.ts carries: the per-minor Builder
purchase rate's twenty quantiles (`MINOR_BUILDER_BUY_SLOTS`); the military
purchases' bank floor and rate by military count, a loss window apart
(`MINOR_MILITARY_BUY_*`, `MINOR_LOSS_BUY_*`); the ships it buys and their
rate (`MINOR_NAVAL_BUY_BP`); the gold an upgrade spends
(`MINOR_UPGRADE_GOLD`, exact on the single-upgrade turns whose neighbouring
income is flat); the land military's distance from home and a turn's step, at
peace, at war and damaged, and the Free Cities' (`MINOR_WALK_*`,
`FREE_WALK_*`). With `--walk` it also fits the walker's distance weights: the
walk draws a step k from the step table and one destination among the plots
exactly k away weighted by distance from home, so the step distribution holds
by construction and the weights are iterated on an open hex grid until the
long-run distance distribution is the census's.

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


WIDTHS = (44, 60, 74, 84, 96, 106)  # the install's map widths, Duel to Huge


def hexdist(a, b, width: int = 0) -> int:
    """Civ 6 offset coordinates, odd rows shifted right; the map wraps east-west
    when `width` is given."""
    def cube(x, y):
        q = x - (y - (y & 1)) // 2
        return q, y, -q - y

    def one(bx):
        (ax, ay, az), (cx, cy, cz) = cube(*a), cube(bx, b[1])
        return max(abs(ax - cx), abs(ay - cy), abs(az - cz))
    if not width:
        return one(b[0])
    return min(one(b[0]), one(b[0] + width), one(b[0] - width))


def width_of(xs) -> int:
    """the narrowest install width that holds every x seen in a game"""
    top = max(xs) + 1
    return next(w for w in WIDTHS if w >= top)


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
        item0, item1 = r0["cities"][0][3], r1["cities"][0][3]
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


def match_steps(a, b, width):
    """the displacements of one unit type's units between two records, paired
    to the smallest total displacement (no ids: permutations up to six, else
    nearest-first)"""
    import itertools
    if len(a) <= 6:
        best = None
        for perm in itertools.permutations(range(len(b))):
            ds = [hexdist(a[i], b[j], width) for i, j in enumerate(perm)]
            if best is None or sum(ds) < sum(best):
                best = ds
        return best or []
    left = list(b)
    out = []
    for p in a:
        j = min(range(len(left)), key=lambda k: hexdist(p, left[k], width))
        out.append(hexdist(p, left.pop(j), width))
    return out


def walker(data):
    """the land military's distance from its centre, per record, and a turn's
    step, per unit — at peace and at war (the minor's record names a war), a
    damaged unit apart"""
    dist = {"peace": collections.Counter(), "war": collections.Counter()}
    step = {"peace": collections.Counter(), "war": collections.Counter(), "damaged": collections.Counter()}
    for key, rows in data.items():
        xs = [u[1] for r in rows for u in r["units"]] + [c[0] for r in rows for c in r["cities"]]
        if not xs:
            continue
        w = width_of(xs)
        for r in rows:
            if not r["cities"]:
                continue
            ctr = (r["cities"][0][0], r["cities"][0][1])
            k = "war" if r["war"] else "peace"
            for u in r["units"]:
                if land_military(u[0]):
                    dist[k][hexdist(ctr, (u[1], u[2]), w)] += 1
        for r0, r1 in zip(rows, rows[1:]):
            if r1["t"] != r0["t"] + 1 or not r0["cities"]:
                continue
            k = "war" if r0["war"] else "peace"
            by0, by1 = collections.defaultdict(list), collections.defaultdict(list)
            for u in r0["units"]:
                if land_military(u[0]):
                    by0[u[0]].append((u[1], u[2], u[3]))
            for u in r1["units"]:
                if land_military(u[0]):
                    by1[u[0]].append((u[1], u[2]))
            for ty, a in by0.items():
                b = by1.get(ty, [])
                if len(a) != len(b):
                    continue
                if all(x[2] == 0 for x in a):
                    for d in match_steps([(x[0], x[1]) for x in a], b, w):
                        step[k][d] += 1
                elif len(a) == 1:
                    step["damaged"][hexdist((a[0][0], a[0][1]), b[0], w)] += 1
    return dist, step


def free_city_walker():
    """the Free Cities' land military: cs_watch's player-62 records (no ids,
    paired as above) and the rebel3b / rebel3c watches (ids; the Free City at
    (72, 24) on a 74-wide map)."""
    dist, step = collections.Counter(), collections.Counter()
    for f in sorted(glob.glob(f"{RUNS}/cs_watch_*.jsonl")):
        rows = {}
        xs = []
        for ln in open(f, encoding="utf-8"):
            if ln.startswith("{"):
                r = json.loads(ln)
                xs += [u[1] for u in r["units"]]
                if r["civ"] == "CIVILIZATION_FREE_CITIES":
                    rows[r["t"]] = r
        if not xs:
            continue
        w = width_of(xs)
        for t in sorted(rows):
            r = rows[t]
            if not r["cities"]:
                continue
            ctrs = [(c[0], c[1]) for c in r["cities"]]
            for u in r["units"]:
                if land_military(u[0]):
                    dist[min(hexdist(c, (u[1], u[2]), w) for c in ctrs)] += 1
            r1 = rows.get(t + 1)
            if not r1 or not r1["cities"]:
                continue
            by0, by1 = collections.defaultdict(list), collections.defaultdict(list)
            for u in r["units"]:
                if land_military(u[0]):
                    by0[u[0]].append((u[1], u[2]))
            for u in r1["units"]:
                if land_military(u[0]):
                    by1[u[0]].append((u[1], u[2]))
            for ty, a in by0.items():
                if len(a) == len(by1.get(ty, [])):
                    for d in match_steps(a, by1[ty], w):
                        step[d] += 1
    for f in sorted(glob.glob(f"{RUNS}/rebel_watch_rebel3[bc]_*.jsonl")):
        track = collections.defaultdict(dict)
        for ln in open(f, encoding="utf-8"):
            r = json.loads(ln)
            if r["kind"] == "unit" and r["p"] == 62 and land_military(r["type"]):
                track[r["id"]][r["turn"]] = (r["x"], r["y"])
        for pos in track.values():
            for t, p in pos.items():
                dist[hexdist((72, 24), p, 74)] += 1
                if t + 1 in pos:
                    step[hexdist(p, pos[t + 1], 74)] += 1
    return dist, step


def shares(c: collections.Counter, top: int) -> str:
    n = sum(c.values())
    parts = [f"{k}: {100 * c[k] / n:.1f}%" for k in range(top)]
    parts.append(f"{top}+: {100 * sum(v for k, v in c.items() if k >= top) / n:.1f}%")
    return f"n {n}  " + ", ".join(parts)


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


def walker_fit(target, steps, iters=20, turns=300_000):
    """the distance weights (permille of the largest, d = 0..len-1, 0 past)
    whose ring-weighted walk on an open hex grid holds `target`, the long-run
    distance distribution, under the per-mille step table `steps`"""
    import random

    def ring(k):
        return [(dq, dr, -dq - dr) for dq in range(-k, k + 1) for dr in range(-k, k + 1)
                if max(abs(dq), abs(dr), abs(dq + dr)) == k]
    rings = {k: ring(k) for k in range(1, len(steps))}

    def dist(p):
        return max(abs(p[0]), abs(p[1]), abs(p[2]))

    def run(W, seed, n):
        rnd = random.Random(seed)
        pos = (0, 0, 0)
        got = collections.Counter()
        cum = [sum(steps[:k + 1]) for k in range(len(steps))]
        for _ in range(n):
            x = rnd.random() * cum[-1]
            k = next(i for i, c in enumerate(cum) if x < c)
            if k:
                cands = [(pos[0] + o[0], pos[1] + o[1], pos[2] + o[2]) for o in rings[k]]
                ws = [W[dist(c)] if dist(c) < len(W) else 0 for c in cands]
                tot = sum(ws)
                if tot > 0:
                    y = rnd.random() * tot
                    acc = 0
                    for c, w in zip(cands, ws):
                        acc += w
                        if y < acc:
                            pos = c
                            break
            got[dist(pos)] += 1
        return [got[d] / n for d in range(len(W))]

    s = sum(target)
    target = [t / s for t in target]
    W = [t / (1 if d == 0 else 6 * d) for d, t in enumerate(target)]
    for it in range(iters):
        got = run(W, it, turns)
        W = [W[d] * (target[d] / got[d]) if got[d] > 0 else W[d] for d in range(len(W))]
        top = max(W)
        W = [w / top for w in W]
    return [round(1000 * w) for w in W]


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
    dist, step = walker(data)
    print("\nWALKER, the minors' land military")
    for k in ("peace", "war"):
        print(f"  distance at {k}: {shares(dist[k], 8)}")
    for k in ("peace", "war", "damaged"):
        print(f"  step at {k}: {shares(step[k], 4)}")
    fd, fs = free_city_walker()
    print("WALKER, the Free Cities' land military")
    print(f"  distance: {shares(fd, 5)}")
    print(f"  step: {shares(fs, 4)}")
    if "--walk" in sys.argv:
        def per_mille(c, top):
            n = sum(c.values())
            v = [round(1000 * c[k] / n) for k in range(top)]
            v.append(1000 - sum(v))
            return v

        def dist_of(c, top):
            n = sum(c.values())
            return [c[d] / n for d in range(top)]
        for name, dc, sc in (("peace", dist["peace"], step["peace"]), ("war", dist["war"], step["war"]),
                             ("free", fd, fs)):
            top = 7 if name == "free" else 13
            steps = per_mille(sc, 3)
            print(f"  {name}: steps {steps}, weights {walker_fit(dist_of(dc, top), steps)}")
        print(f"  damaged: steps {per_mille(step['damaged'], 3)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
