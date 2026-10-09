"""THE CITY-STATES' QUESTS (Game_Quests, GameCore_XP2_Release.dll), scored
draw by draw on the lab's recordings: every logged "Selecting a random new
quest" and its type's picker, against the count of quest types (and of
targets) the DLL reading keeps valid for the pair at that moment
(`tools/civ6lab/dll_readings.md` "H-1: the city-states' quests").

    python tools/civ6lab/dll_quests.py [runs/h1_duelw*_20261007T232459Z.jsonl ...] [-v]

The reading, per pair (client = the minor, actor = the major):
- a pair is given ONE quest (the game era's change, every pair met; a
  meeting): none while one stands; the types in logic order Convert, Trade,
  Camp, Train, Zone, Tech, Civic, Great Person, the pair's last completed
  type skipped, each kept when valid, one draw over their count, then the
  type's picker: one draw over its targets (Train, Zone, Tech, Civic, GP);
- validity: both alive, met, not at war; Convert: the actor founded a
  religion the minor's capital does not follow; Trade: no route from the
  actor to the minor; Camp: a barbarian camp within 5 of the minor's
  capital; Train: a unit with CanTrain and Combat, RangedCombat or Bombard,
  the actor's own (no unique of another, not replaced by its own), no
  upgrade the actor has unlocked, its era (PrereqTech / PrereqCivic, the
  later) the actor's era; Zone: the actor's own district with
  RequiresPopulation, its era known and at most the actor's, below
  MaxPerPlayer; Tech / Civic: not researched, not boosted, has a boost, its
  era the actor's; GP: a class on offer of an era at most the actor's + 1;
- completion: Train a unit of the type added to the actor (an upgrade
  counts); Tech / Civic the boost; Zone the district completed; GP the
  class recruited; Trade a route to the minor; Convert the capital
  following the religion; Camp a camp within 5 cleared by the actor.
  Failure: the tech / civic researched, a war between the pair.
"""
from __future__ import annotations

import collections
import glob
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "install"))
from xml_check import Install  # noqa: E402

RUNS = HERE / "runs"
TYPES = ["CONVERT", "TRADE", "CAMP", "TRAIN", "ZONE", "TECH", "CIVIC", "GP"]
PICKER = {
    "TRAIN": "Choosing random unit type for Train Unit quest",
    "ZONE": "Choosing random district type for Zone District quest",
    "TECH": "Choosing random tech type for Trigger Tech Boost quest",
    "CIVIC": "Choosing random civic type for Trigger Civic Boost quest",
    "GP": "Choosing random class type for Recruit Great Person Class quest",
}
SELECT = "Selecting a random new quest"
CAMP_RADIUS = 5


def truthy(v: str | None, default: bool) -> bool:
    if v is None:
        return default
    return v.lower() in ("true", "1")


class Db:
    """the install's tables the reading consults"""

    def __init__(self) -> None:
        inst = Install()
        t = inst.tables

        def rows(name):
            return [c for c, _ in t.get(name, [])]

        def last_by(name, key):
            out = {}
            for c in rows(name):
                if key in c:
                    out.setdefault(c[key], {}).update(c)
            return out

        chrono = sorted(last_by("Eras", "EraType").items(), key=lambda kv: int(kv[1].get("ChronologyIndex", "0")))
        self.eras = {e: i for i, (e, _) in enumerate(chrono)}
        self.techs = last_by("Technologies", "TechnologyType")
        self.civics = last_by("Civics", "CivicType")
        self.units = last_by("Units", "UnitType")
        self.districts = last_by("Districts", "DistrictType")
        self.upgrades = collections.defaultdict(list)
        for c in rows("UnitUpgrades"):
            self.upgrades[c["Unit"]].append(c["UpgradeUnit"])
        self.unit_replaces = {c["CivUniqueUnitType"]: c["ReplacesUnitType"] for c in rows("UnitReplaces")}
        self.district_replaces = {c["CivUniqueDistrictType"]: c["ReplacesDistrictType"] for c in rows("DistrictReplaces")}
        self.boosted_techs = {c["TechnologyType"] for c in rows("Boosts") if c.get("TechnologyType")}
        self.boosted_civics = {c["CivicType"] for c in rows("Boosts") if c.get("CivicType")}
        self.civ_traits = collections.defaultdict(set)
        for c in rows("CivilizationTraits"):
            self.civ_traits[c["CivilizationType"]].add(c["TraitType"])
        self.leader_traits = collections.defaultdict(set)
        for c in rows("LeaderTraits"):
            self.leader_traits[c["LeaderType"]].add(c["TraitType"])
        self.gp_individuals = last_by("GreatPersonIndividuals", "GreatPersonIndividualType")
        self.gp_classes = last_by("GreatPersonClasses", "GreatPersonClassType")
        self.gp_excluded = collections.defaultdict(set)
        for c in rows("ExcludedGreatPersonClasses"):
            self.gp_excluded[c["GreatPersonClassType"]].add(c["TraitType"])

    def era_of(self, row: dict) -> int:
        """the later era of a row's PrereqTech and PrereqCivic, -1 for none"""
        e = -1
        if row.get("PrereqTech") in self.techs:
            e = max(e, self.eras[self.techs[row["PrereqTech"]]["EraType"]])
        if row.get("PrereqCivic") in self.civics:
            e = max(e, self.eras[self.civics[row["PrereqCivic"]]["EraType"]])
        return e


def hexdist(a: int, b: int, w: int) -> int:
    def cube(i):
        x, y = i % w, i // w
        return x - (y - (y & 1)) // 2, y
    q1, r1 = cube(a)
    best = 99
    for dx in (0, w, -w):
        bx, by = b % w + dx, b // w
        q2, r2 = bx - (by - (by & 1)) // 2, by
        dq, dr = q1 - q2, r1 - r2
        best = min(best, (abs(dq) + abs(dr) + abs(dq + dr)) // 2)
    return best


class Game:
    """one recording: its records, catalogue and draw log"""

    def __init__(self, path: pathlib.Path, db: Db) -> None:
        self.db = db
        self.path = path
        stem = str(path)[: -len(".jsonl")]
        self.cat = json.load(open(stem + ".cat.json", encoding="utf-8"))
        self.recs = {}
        with open(path, encoding="utf-8") as f:
            for line in f:
                d = json.loads(line)
                self.recs[d["turnAfter"]] = d
        self.draws = []
        with open(stem + ".randcalls.csv", encoding="utf-8") as f:
            next(f)
            for line in f:
                p = [x.strip() for x in line.split(",", 5)]
                if len(p) < 6:
                    continue
                lab = p[5]
                if "quest" in lab and ("Selecting" in lab or "Choosing random" in lab):
                    self.draws.append((int(p[0]), int(p[1]), int(p[2]), lab))
        self.W = next(iter(self.recs.values()))["head"]["W"]
        self.camp = self.cat["improvements"].index("IMPROVEMENT_BARBARIAN_CAMP")
        self.water = {self.cat["terrains"].index(t) for t in ("TERRAIN_COAST", "TERRAIN_OCEAN") if t in self.cat["terrains"]}
        # the Great People timeline (Game_GreatPeople.csv): per class, the
        # offers in order [(turn added, era, turn granted or None)]
        self.offers: dict[str, list] = collections.defaultdict(list)
        gpl = pathlib.Path(stem + ".logs") / "Game_GreatPeople.csv"
        if gpl.exists():
            with open(gpl, encoding="utf-8") as f:
                next(f)
                for line in f:
                    q = [x.strip() for x in line.split(",")]
                    if len(q) < 5:
                        continue
                    if q[1] == "Added to Present Timeline" and q[4] in db.eras:
                        self.offers[q[3]].append([int(q[0]), db.eras[q[4]], None, q[2]])
                    elif q[1] == "Granted to Player":
                        for o in self.offers[q[3]]:
                            if o[3] == q[2] and o[2] is None:
                                o[2] = int(q[0])

    def offer_era(self, cls: str, turn: int):
        """the era of the class's offer standing at `turn`, None for no log"""
        if not self.offers:
            return None
        cur = None
        for added, era, granted, _ in self.offers.get(cls, []):
            if added <= turn and (granted is None or granted >= turn):
                cur = era
        return cur if cur is not None else 99

    def coastal(self, rec, p: int) -> bool:
        W, H = self.W, len(rec["map"])
        for c in rec["cities"]:
            if c["owner"] != p:
                continue
            i = c["y"] * W + c["x"]
            for j in range(W * H):
                if hexdist(i, j, W) == 1 and rec["map"][j // W][j % W][0] in self.water:
                    return True
        return False

    # --- the state at a record --------------------------------------------
    def players(self, rec):
        return {p["id"]: p for p in rec["players"]}

    def player_era(self, p, techs: str, civics: str) -> int:
        e = 0
        for i, b in enumerate(techs):
            if b == "1":
                e = max(e, self.db.eras[self.db.techs[self.cat["techs"][i]]["EraType"]])
        for i, b in enumerate(civics):
            if b == "1":
                e = max(e, self.db.eras[self.db.civics[self.cat["civics"][i]]["EraType"]])
        return e

    def traits(self, p) -> set:
        return self.db.civ_traits.get(p["civ"], set()) | self.db.leader_traits.get(p["leader"], set())

    def own_unit(self, p, u: str) -> bool:
        row = self.db.units[u]
        tr = self.traits(p)
        if row.get("TraitType") and row["TraitType"] not in tr:
            return False
        for uniq, base in self.db.unit_replaces.items():
            if base == u and self.db.units.get(uniq, {}).get("TraitType") in tr:
                return False
        return True

    def own_district(self, p, d: str) -> bool:
        row = self.db.districts[d]
        tr = self.traits(p)
        if row.get("TraitType") and row["TraitType"] not in tr:
            return False
        for uniq, base in self.db.district_replaces.items():
            if base == d and self.db.districts.get(uniq, {}).get("TraitType") in tr:
                return False
        return True


def known(bits: str, cat: list, item: str | None) -> bool:
    if not item:
        return True
    return item in cat and bits[cat.index(item)] == "1"


class Sim:
    def __init__(self, g: Game, verbose: bool) -> None:
        self.g = g
        self.v = verbose
        self.quest: dict[tuple[int, int], tuple[str, object]] = {}
        self.last: dict[tuple[int, int], str] = {}
        self.di = 0
        self.score = collections.Counter()
        self.miss: list[str] = []

    # --- validity ---------------------------------------------------------
    def cands(self, rec, m: int, p: int, tech_bits: str, civic_bits: str) -> dict[str, list]:
        g, db, cat = self.g, self.g.db, self.g.cat
        P = g.players(rec)
        pp = P[p]
        pe = g.player_era(pp, tech_bits, civic_bits)
        out: dict[str, list] = {}
        # Convert
        rel = [r["Religion"] for r in (rec.get("religions") or []) if r.get("Founder") == p]
        cap = next((c for c in rec["cities"] if c["owner"] == m), None)
        out["CONVERT"] = [rel[0]] if rel and cap is not None and cap.get("majorityReligion") != rel[0] else []
        # Trade
        routed = any(c["owner"] == p and any(r.get("DestinationCityPlayer") == m for r in (c.get("routes") or []))
                     for c in rec["cities"])
        out["TRADE"] = [] if routed else [m]
        # Camp
        camps = []
        if cap is not None:
            ci = cap["y"] * g.W + cap["x"]
            for y, row in enumerate(rec["map"]):
                for x, pl in enumerate(row):
                    if pl[4] == g.camp and hexdist(y * g.W + x, ci, g.W) <= CAMP_RADIUS:
                        camps.append(y * g.W + x)
        out["CAMP"] = camps[:1]
        # Train
        units = []
        for u in cat["units"]:
            r = db.units.get(u)
            if not r or not truthy(r.get("CanTrain"), True):
                continue
            if not (int(r.get("Combat", 0)) > 0 or int(r.get("RangedCombat", 0)) > 0 or int(r.get("Bombard", 0)) > 0):
                continue
            if not g.own_unit(pp, u):
                continue
            if any(known(tech_bits, cat["techs"], db.units[v].get("PrereqTech"))
                   and known(civic_bits, cat["civics"], db.units[v].get("PrereqCivic")) and g.own_unit(pp, v)
                   for v in db.upgrades.get(u, []) if v in db.units):
                continue
            if db.era_of(r) != pe:
                continue
            units.append(u)
        out["TRAIN"] = units
        # Zone
        dists = []
        have = collections.Counter()
        for c in rec["cities"]:
            if c["owner"] == p:
                for d in c.get("districts") or []:
                    have[cat["districts"][d[0]]] += 1
        for d in cat["districts"]:
            r = db.districts.get(d)
            if not r or not g.own_district(pp, d) or not truthy(r.get("RequiresPopulation"), False):
                continue
            e = db.era_of(r)
            if e < 0 or e > pe:
                continue
            mx = float(r.get("MaxPerPlayer", "-1"))
            n = have[d] + sum(have[u] for u, b in db.district_replaces.items() if b == d)
            if mx >= 0 and not mx > n:
                continue
            dists.append(d)
        out["ZONE"] = dists
        # Tech / Civic
        tb, cb = pp["techBoosts"], pp["civicBoosts"]
        out["TECH"] = [t for i, t in enumerate(cat["techs"]) if tech_bits[i] == "0" and tb[i] == "0"
                       and t in db.boosted_techs and db.eras[db.techs[t]["EraType"]] == pe]
        out["CIVIC"] = [t for i, t in enumerate(cat["civics"]) if civic_bits[i] == "0" and cb[i] == "0"
                        and t in db.boosted_civics and db.eras[db.civics[t]["EraType"]] == pe]
        # GP: a class with an individual left whose era is at most pe + 1
        taken = {cat["greatPeople"][x[0]] for x in (rec.get("greatPeople") or [])}
        mine = collections.Counter(cat["greatPersonClasses"][x[2]] for x in (rec.get("greatPeople") or []) if x[1] == p)
        tr = g.traits(pp)
        classes = []
        for c in cat["greatPersonClasses"]:
            row = db.gp_classes.get(c, {})
            if not truthy(row.get("AvailableInTimeline"), True):
                continue
            if any(t in tr for t in db.gp_excluded.get(c, ())):
                continue
            mx = row.get("MaxPlayerInstances")
            if mx is not None and int(mx) >= 0 and mine[c] >= int(mx):
                continue
            offer = g.offer_era(c, rec["turnAfter"])
            if offer is None:
                eras = [db.eras[r["EraType"]] for k, r in db.gp_individuals.items()
                        if r.get("GreatPersonClassType") == c and k not in taken and r.get("EraType") in db.eras]
                offer = min(eras) if eras else None
            if c == "GREAT_PERSON_CLASS_ADMIRAL" and not g.coastal(rec, p):
                continue
            if offer is not None and offer <= pe + 1:
                classes.append(c)
        out["GP"] = classes
        return out

    def base_ok(self, rec, m: int, p: int) -> bool:
        P = self.g.players(rec)
        if m not in P or p not in P:
            return False
        if not any(c["owner"] == m for c in rec["cities"]):
            return False
        return p in (P[m].get("met") or []) and p not in (P[m].get("wars") or [])

    # --- the draws ---------------------------------------------------------
    def take(self, turn: int, label: str):
        while self.di < len(self.g.draws) and self.g.draws[self.di][0] < turn:
            d = self.g.draws[self.di]
            self.miss.append(f"t{d[0]} unexpected {d[3]} {d[1]}")
            self.score["extra"] += 1
            self.di += 1
        if self.di < len(self.g.draws):
            d = self.g.draws[self.di]
            if d[0] == turn and d[3] == label:
                self.di += 1
                return d
        return None

    def give(self, rec, turn: int, m: int, p: int, tech_bits: str, civic_bits: str, why: str) -> None:
        if (m, p) in self.quest or not self.base_ok(rec, m, p):
            return
        c = self.cands(rec, m, p, tech_bits, civic_bits)
        kinds = [k for k in TYPES if k != self.last.get((m, p)) and c[k]]
        if not kinds:
            return
        d = self.take(turn, SELECT)
        if d is None:
            self.score["select_nodraw"] += 1
            self.miss.append(f"t{turn} {why} {m}->{p}: no logged draw for {len(kinds)} {kinds}")
            return
        ok = d[1] == len(kinds)
        self.score["select_ok" if ok else "select_off"] += 1
        k = kinds[min(d[2], len(kinds) - 1)]
        if not ok:
            self.miss.append(f"t{turn} {why} {m}->{p}: range {d[1]} ours {len(kinds)} {kinds}")
        target = c[k][0]
        if k in PICKER:
            pd = self.take(turn, PICKER[k])
            if pd is None:
                self.score["pick_nodraw"] += 1
                self.miss.append(f"t{turn} {m}->{p} {k}: no picker draw ({len(c[k])})")
            else:
                pok = pd[1] == len(c[k])
                self.score["pick_ok" if pok else "pick_off"] += 1
                if not pok:
                    self.miss.append(f"t{turn} {m}->{p} {k}: picker {pd[1]} ours {len(c[k])} {c[k]}")
                target = c[k][min(pd[2], len(c[k]) - 1)]
        if self.v:
            print(f"  t{turn} {why} {m}->{p} {k} {target} ({len(kinds)} {kinds})")
        self.quest[(m, p)] = (k, target)

    # --- completion -------------------------------------------------------
    def settle(self, prev, rec) -> None:
        g, cat = self.g, self.g.cat
        P0, P1 = g.players(prev), g.players(rec)
        new_units = collections.defaultdict(set)
        old_ids = {(u["owner"], u["id"]) for u in prev["units"]}
        for u in rec["units"]:
            if (u["owner"], u["id"]) not in old_ids:
                new_units[u["owner"]].add(cat["units"][u["type"]])
        gp0 = {tuple(x[:2]) for x in (prev.get("greatPeople") or [])}
        for (m, p), (k, tgt) in list(self.quest.items()):
            if p not in P1 or m not in P1:
                continue
            a0, a1 = P0.get(p, P1[p]), P1[p]
            done = fail = False
            if m in (P1[m].get("wars") or []) or p in (P1[m].get("wars") or []):
                fail = True
            elif k == "TRAIN":
                done = tgt in new_units[p]
                db = g.db
                if not done and any(known(a1["techs"], cat["techs"], db.units[v].get("PrereqTech"))
                                    and known(a1["civics"], cat["civics"], db.units[v].get("PrereqCivic"))
                                    and g.own_unit(a1, v) for v in db.upgrades.get(tgt, []) if v in db.units):
                    fail = True
            elif k in ("TECH", "CIVIC"):
                cl = cat["techs"] if k == "TECH" else cat["civics"]
                i = cl.index(tgt)
                bk, rk = ("techBoosts", "techs") if k == "TECH" else ("civicBoosts", "civics")
                if a1[bk][i] == "1" and a0[bk][i] == "0":
                    done = True
                elif a1[rk][i] == "1":
                    fail = True
            elif k == "ZONE":
                def built(r):
                    return {(d[1], d[2]) for c in r["cities"] if c["owner"] == p
                            for d in (c.get("districts") or []) if cat["districts"][d[0]] == tgt and d[3]}
                done = bool(built(rec) - built(prev))
            elif k == "GP":
                # another player's recruit of the class fails nothing: the
                # class's replacement stands when the signal fires
                for x in rec.get("greatPeople") or []:
                    if tuple(x[:2]) not in gp0 and x[1] == p and cat["greatPersonClasses"][x[2]] == tgt:
                        done = True
            elif k == "TRADE":
                done = any(c["owner"] == p and any(r.get("DestinationCityPlayer") == m for r in (c.get("routes") or []))
                           for c in rec["cities"])
            elif k == "CONVERT":
                cap = next((c for c in rec["cities"] if c["owner"] == m), None)
                done = cap is not None and cap.get("majorityReligion") == tgt
            elif k == "CAMP":
                cap = next((c for c in rec["cities"] if c["owner"] == m), None)
                if cap is not None:
                    ci = cap["y"] * g.W + cap["x"]
                    near = lambda r: {y * g.W + x for y, row in enumerate(r["map"]) for x, pl in enumerate(row)  # noqa: E731
                                      if pl[4] == g.camp and hexdist(y * g.W + x, ci, g.W) <= CAMP_RADIUS}
                    gone = near(prev) - near(rec)
                    if gone:
                        here = {u["y"] * g.W + u["x"] for u in rec["units"] if u["owner"] == p}
                        if gone & here:
                            done = True
                        elif not near(rec):
                            fail = True
            if done:
                self.last[(m, p)] = k
                self.score["completed"] += 1
                if self.v:
                    print(f"  t{rec['turnAfter']} done {m}->{p} {k} {tgt}")
            if done or fail:
                del self.quest[(m, p)]
                if fail and self.v:
                    print(f"  t{rec['turnAfter']} failed {m}->{p} {k} {tgt}")

    def run(self) -> None:
        g = self.g
        turns = sorted(g.recs)
        ages = collections.defaultdict(set)
        meets = collections.defaultdict(list)
        for t in turns:
            for a in g.recs[t].get("actions") or []:
                if a[2] == "PlayerAgeChanged":
                    ages[a[1]].add(a[3])
                if a[2] == "DiplomacyMeet":
                    meets[a[1]].append((t, a[3], a[4]))
        prev = None
        for t in range(turns[0], turns[-1] + 1):
            # a turn with no record of its own reads the next record
            rt = next(x for x in turns if x >= t)
            rec = g.recs[rt]
            P = g.players(rec)
            majors = sorted(i for i, p in P.items() if p.get("major"))
            minors = sorted(i for i, p in P.items() if p.get("minor"))
            if prev is not None and prev is not rec:
                self.settle(prev, rec)
            if majors and set(majors) <= ages.get(t - 1, set()):
                for m in minors:
                    for p in majors:
                        tb, cb = P[p]["techs"], P[p]["civics"]
                        if p == majors[0]:
                            tb, cb = self.pre_start(rec, p, tb, cb, t)
                        self.give(rec, t, m, p, tb, cb, "era")
            for (rt, a, b) in meets.get(t, []):
                r2 = g.recs.get(rt, rec)
                P2 = g.players(r2)
                for (m, p) in ((a, b), (b, a)):
                    if m in P2 and p in P2 and P2[m].get("minor") and P2[p].get("major"):
                        self.give(r2, t, m, p, P2[p]["techs"], P2[p]["civics"], "meet")
            prev = rec
        while self.di < len(g.draws):
            d = g.draws[self.di]
            self.miss.append(f"t{d[0]} unexpected {d[3]} {d[1]}")
            self.score["extra"] += 1
            self.di += 1

    def pre_start(self, rec, p: int, tb: str, cb: str, t: int):
        """a tech or civic the player completed in its start of turn t, after
        the era batch, unlearned"""
        tb, cb = list(tb), list(cb)
        for a in rec.get("actions") or []:
            if a[2] == "ResearchCompleted" and a[1] == t and a[3] == p and 0 <= a[4] < len(tb):
                tb[a[4]] = "0"
            if a[2] == "CivicCompleted" and a[1] == t and a[3] == p and 0 <= a[4] < len(cb):
                cb[a[4]] = "0"
        return "".join(tb), "".join(cb)


def main(argv: list[str]) -> int:
    verbose = "-v" in argv
    paths = [pathlib.Path(a) for a in argv if a.endswith(".jsonl")]
    if not paths:
        paths = sorted(pathlib.Path(p) for p in glob.glob(str(RUNS / "h1_duelw*_20261007T232459Z.jsonl")))
    db = Db()
    tot = collections.Counter()
    for path in paths:
        g = Game(path, db)
        s = Sim(g, verbose)
        if verbose:
            print(path.name)
        s.run()
        tot.update(s.score)
        print(f"{path.name[8:12]} select {s.score['select_ok']}/{s.score['select_ok'] + s.score['select_off'] + s.score['select_nodraw']}"
              f" picker {s.score['pick_ok']}/{s.score['pick_ok'] + s.score['pick_off'] + s.score['pick_nodraw']}"
              f" extra {s.score['extra']} completed {s.score['completed']}")
        for x in s.miss:
            print("   ", x)
    print("TOTAL", dict(tot))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
