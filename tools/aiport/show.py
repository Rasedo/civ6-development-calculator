"""SHOW: what the game held at a seed's turn, from its own records.

    python tools/aiport/show.py <seed> <turn> [--player P] [--unit ID] [--city NAME|x:y] [--plot x:y]
        [--what trees|contracts|kb|ops|units|planning|targets|danger|builds|research|events[,...]] [--all] [--wide N]

Sources (all beside the dump in the main checkout, read-only):
  aimem    <stem>.aimem.jsonl: the AI memory at the player's `tactical`,
           `log` and `endlook` sites (tools/civ6lab/aimem.py names the fields)
  aiunits  <stem>.aiunits.jsonl: the units' stream at `start`, `tactical`,
           `tacpass`, `log`, `endlook` (aimem.py `Units`; the columns from the
           stream's first line, as aimem_fields.rows())
  record   <stem>.jsonl: record T (the world as turn T opens) and record
           T+1; their `actions` / `extra` event rows of game turn T
  logs     <stem>.logs.sqlite (tools/civ6lab/logstore.py), turn T

--what (default: events with --player alone, units,planning with --unit,
builds with --city, the plot's cell, units and danger with --plot):
  units      the unit's row at each site of the turn (printed where it
             changes), its formation, queue and the record's rows at T, T+1
  planning   the unit's planning at its player's tacpass: the reach by turn
             (`x:y/Movement left`), each target with its spots, the
             predicted blow dealt / taken, the blow back, the kill flag;
             without --unit one line a planned unit
  targets    the player's tactical target list at tacpass
  danger     the player's danger map at its tactical step (non-zero plots;
             a grid about --plot)
  kb         the knowledge base at endlook: army records by owner and type,
             camps, the known cities with their districts' strengths
  trees      the behaviour trees at endlook (`--all`: their nodes' heads)
  contracts  the contracts at log and endlook, the holders, AI_CityBuild's
             contract lines
  ops        the operations at tactical / log / endlook where they change,
             AI_Operation and AI_Operation_Eval of the turn
  builds     per city: the record's queue at T and T+1, City_BuildQueue,
             AI_CityBuild's lines and the centre's logged value tables
  research   AI_Research's Tech rows and AI_GovtPolicies' Civic and
             Policies rows by score, the tech and civic contracts, the
             record's research at T and T+1
  events     everything of the turn for the player, in order: each log's
             rows (the log's own order), then the record's event rows of
             game turn T by sequence (`--all` keeps the movement-point,
             visibility and resource rows too)
"""
from __future__ import annotations

import argparse
import json
import re
import sys

import common

sys.path.insert(0, str(common.HERE.parent / "civ6lab"))
import logstore  # noqa: E402

HEAD = re.compile(r'^\{"site":\s*"(\w+)",\s*"player":\s*(\d+),\s*"turn":\s*(\d+)')
TARGETS = ["FRIENDLY_CITY", "ENEMY_COMBAT_DISTRICT", "ENEMY_PASSIVE_DISTRICT", "NEUTRAL_CITY", "BARBARIAN_CAMP", "NEUTRAL_CIVILIAN_UNIT",
           "CIVILIAN_UNIT", "RELIGIOUS_CIVILIAN", "TRADER", "LOW_PRIORITY_UNIT", "MEDIUM_PRIORITY_UNIT", "HIGH_PRIORITY_UNIT",
           "ENEMY_IMPROVEMENT", "SETTLE_LOCATION", "GOODY_HUT", "ALLY_SUPPORT", "AIR_UNIT", "NAVAL_SUPERIORITY", "SCRIPT_SUPPLIED"]
STATUS = ["INVALID", "CLAIMED", "SUBMITTED", "ACCEPTED", "FAILED", "IN PROGRESS", "CANCELLED", "COMPLETED"]
QUIET = {"ResourceRemovedFromMap", "ResourceAddedToMap", "UnitMovementPointsChanged", "UnitMovementPointsRestored", "UnitMovementPointsCleared",
         "UnitVisibilityChanged", "PlotYieldChanged", "NotificationAdded", "CityVisibilityChanged", "UnitActivityChanged"}
UNIT_SHOWN = ["m_eAIType", "m_eActivity", "m_bEmbarked", "m_eMilitaryFormation", "m_iDamage", "m_iFortifyTurns", "m_iAttacksRemaining", "m_iBuildCharges",
              "m_aiController", "m_aiGoal", "m_iOperationTimer", "m_iBarbarianTribeIndex", "m_bProcessedTurn"]


class Game:
    """one recording at one turn: the stream records of turns T and T+1, the
    dump's records T and T+1, the catalog, the log store"""

    def __init__(self, seed: str, turn: int):
        self.f = common.files_of(seed)
        self.turn = turn
        self.cat = json.loads(self.f["cat"].read_text(encoding="utf-8"))
        self.cols: dict = {}
        self.mem = self._stream(self.f["aimem"], False)
        self.units = self._stream(self.f["aiunits"], True)
        self.rec, self.next = self._records()
        self.W = self.rec["head"]["W"] if self.rec else 0
        self._db = None

    def _stream(self, path, header: bool) -> dict:
        out: dict = {}
        if not path.exists():
            return out
        with open(path, encoding="utf-8") as fh:
            if header:
                self.cols = json.loads(fh.readline()).get("cols", {})
            for line in fh:
                m = HEAD.match(line[:96])
                if not m:
                    continue
                t = int(m.group(3))
                if t < self.turn:
                    continue
                if t > self.turn + 1:
                    break
                out.setdefault((t, int(m.group(2))), []).append((m.group(1), line))
        return out

    def _records(self):
        got = {}
        with open(self.f["dump"], encoding="utf-8") as fh:
            for line in fh:
                m = re.match(r'\{"turnBefore":(\d+),', line[:40])
                if not m:
                    continue
                t = int(m.group(1))
                if t > self.turn + 1:
                    break
                if t >= self.turn and '"moved":false' in line[:80].replace(" ", ""):
                    got[t] = json.loads(line)
        return got.get(self.turn), got.get(self.turn + 1)

    def sites(self, stream: dict, player: int, turn: int | None = None):
        """the player's stream records of the turn, in the stream's order: (site, record)"""
        for site, line in stream.get((self.turn if turn is None else turn, player), []):
            yield site, json.loads(line)

    def site(self, stream: dict, player: int, site: str) -> dict | None:
        last = None
        for s, line in stream.get((self.turn, player), []):
            if s == site:
                last = line
        return json.loads(last) if last else None

    @property
    def db(self):
        if self._db is None and self.f["store"].exists():
            self._db = logstore.open_store(str(self.f["store"]))
        return self._db

    def log(self, table: str, where: str = "turn = ? AND player = ?", args: tuple | None = None, player: int | None = None) -> list[dict]:
        if not self.db:
            return []
        try:
            cur = self.db.execute(f'SELECT * FROM "{table}" WHERE {where} ORDER BY line', args if args is not None else (self.turn, player))
        except Exception:  # noqa: BLE001 — a recording without the log
            return []
        names = [d[0] for d in cur.description]
        return [dict(zip(names, row)) for row in cur]

    def name(self, table: str, index, strip: str = "") -> str:
        rows = self.cat.get(table) or []
        if isinstance(index, int) and 0 <= index < len(rows):
            return str(rows[index]).replace(strip, "", 1) if strip else str(rows[index])
        return str(index)

    def unit_type(self, index) -> str:
        return self.name("units", index, "UNIT_")

    def row(self, raw: list) -> dict:
        d = dict(zip(self.cols.get("unit", []), raw))
        if isinstance(d.get("formation"), list):
            d["formation"] = dict(zip(self.cols.get("formation", []), d["formation"]))
        return d

    def players(self) -> list[int]:
        return [p["id"] for p in (self.rec or {}).get("players", [])]


def fx(v) -> str:
    return f"{v / 256:g}" if isinstance(v, (int, float)) else str(v)


def cells(row: dict, skip=("line", "turn", "player")) -> str:
    return ", ".join(f"{k}={v}" for k, v in row.items() if k not in skip and v is not None and k != "rest") + (f" | {row['rest']}" if row.get("rest") else "")


def unit_line(g: Game, d: dict) -> str:
    q = d.get("queue") or []
    f = d.get("formation") or {}
    members = f.get("members") or []
    path = f.get("path") or []
    out = (f"{g.unit_type(d['m_eTypeIndex'])} {d['m_eOwner']}:{d['m_id']} at {d['m_kLocation']}:{d['y']} mv{fx(d['m_xMovesRemaining'])} "
           + " ".join(f"{k[2:] if k.startswith('m_') else k}={d[k]}" for k in UNIT_SHOWN if k in d and d[k] not in (0, -1, -9999)))
    if d.get("experience") and d["experience"] != [0, 1, 0]:
        out += f" xp={d['experience']}"
    if d.get("abilities"):
        out += f" abilities={d['abilities']}"
    if len(members) > 1:
        out += f" formation={members}"
    if path:
        out += " path=" + ">".join(f"{p[3]}:{p[4]}" for p in path[:12])
    if q:
        out += " queue=" + "; ".join(f"op{e[0]} added t{e[8]}" + (f" to {e[14]}:{e[15]}" if len(e) > 15 else "") for e in q)
    return out


def find_unit(g: Game, uid: int) -> int | None:
    for u in (g.rec or {}).get("units", []) + (g.next or {}).get("units", []):
        if u["id"] == uid:
            return u["owner"]
    for (_, p), recs in g.units.items():
        for site, line in recs:
            if f"[{uid}," in line:
                rows = json.loads(line).get("units")
                for pl, rs in (rows.items() if isinstance(rows, dict) else [(p, rows or [])]):
                    if any(r[0] == uid for r in rs):
                        return int(pl)
    return None


def what_units(g: Game, a) -> None:
    if a.unit is None:
        own = g.site(g.units, a.player, "tacpass") or g.site(g.units, a.player, "endlook") or {}
        print(f"== units of p{a.player} at its tacpass, t{g.turn} ({len(own.get('units') or [])})")
        for raw in own.get("units") or []:
            print("  " + unit_line(g, g.row(raw)))
        return
    print(f"== unit {a.player}:{a.unit} t{g.turn}: its row at each site, where it changes")
    last = None
    seen = False
    for (t, p), recs in sorted(g.units.items()):
        if t != g.turn:
            continue
        for site, line in recs:
            if f"[{a.unit}," not in line:
                continue
            r = json.loads(line)
            rows = r.get("units")
            mine = [x for x in ((rows.get(str(a.player)) or []) if isinstance(rows, dict) else (rows or []) if p == a.player else []) if x[0] == a.unit]
            if not mine:
                continue
            seen = True
            text = unit_line(g, g.row(mine[0]))
            if text != last:
                print(f"  {site:<8} of p{p:<2} {text}")
                last = text
    if not seen:
        print("  no row in the units' stream this turn")
    for label, rec in ((f"record t{g.turn}", g.rec), (f"record t{g.turn + 1}", g.next)):
        for u in (rec or {}).get("units", []):
            if u["id"] == a.unit and u["owner"] == a.player:
                print(f"  {label}: {g.unit_type(u['type'])} at {u['x']}:{u['y']} moves {u['moves']}/{u['maxMoves']} damage {u['damage']} embarked {u['embarked']} "
                      f"fortify {u['fortify']} formation {u['formation']} level {u['level']} xp {u['xp']} promotions {u['promotions']} charges {u['buildCharges']}")
    for r in g.log("AI_Tactical", player=a.player):
        if f"({a.unit})" in str(r.get("unit_info")):
            print("  AI_Tactical: " + cells(r))
    # the unit's path searches for a plot, in the log's order (AStar_GC.log:
    # a reach search names no plot), and its own events in the record's order
    for r in g.log("AStar_GC", "turn = ? AND unit LIKE ? AND to_x >= 0", (g.turn, f"%({a.unit})")):
        print(f"  search #{r['line']}: {r['from_x']}:{r['from_y']} for {r['to_x']}:{r['to_y']} flags {int(r['info']):#x} checksum {r['checksum']}")
    lane = []
    for rec in (g.rec, g.next):
        for key in ("actions", "extra"):
            for e in (rec or {}).get(key) or []:
                if isinstance(e, list) and len(e) > 5 and e[1] == g.turn and e[3] == a.player and e[4] == a.unit and e not in lane:
                    lane.append(e)
    for e in sorted(lane, key=lambda e: e[0]):
        print(f"  event #{e[0]}: {e[2]} {' '.join(str(x) for x in e[5:])}")


def entry(g: Game, kind: int, x: int, y: int, word: int, ident: int, types: dict) -> str:
    owner, comp = word & 0xFFFF, (word >> 16) & 0xFFFF
    what = f"#p{owner}:{types.get((owner, ident), f'u{ident}')}({ident})" if comp == 1 else f"#p{owner}" if comp == 3 else ""
    return f"{TARGETS[kind] if 0 <= kind < len(TARGETS) else kind}@{x}:{y}{what}"


def step_types(g: Game, player: int) -> dict:
    out = {}
    rows = (g.site(g.units, player, "tactical") or {}).get("units") or {}
    for owner, rs in (rows.items() if isinstance(rows, dict) else []):
        for r in rs:
            out[(int(owner), r[0])] = g.unit_type(r[1])
    return out


def what_planning(g: Game, a) -> None:
    tp = g.site(g.units, a.player, "tacpass")
    if not tp or not tp.get("plans"):
        print(f"== planning: no tacpass plannings of p{a.player} at t{g.turn} (the majors' are not recorded)")
        return
    types = step_types(g, a.player)
    mine = {r[0]: g.row(r) for r in tp.get("units") or []}
    for uid, pl in tp["plans"].items():
        if a.unit is not None and int(uid) != a.unit:
            continue
        reach = [pl["reach"][i:i + 4] for i in range(0, len(pl["reach"]), 4)]
        d = mine.get(int(uid))
        print(f"== planning of {a.player}:{uid} {g.unit_type(d['m_eTypeIndex']) if d else '?'} at tacpass t{g.turn}: reach {len(reach)} plots, {len(pl['targets'])} targets")
        if a.unit is None:
            continue
        for turns in sorted({q[2] for q in reach}):
            print(f"  reach turn {turns}: " + " ".join(f"{q[0]}:{q[1]}/{fx(q[3])}" for q in reach if q[2] == turns))
        for t in pl["targets"]:
            n = max(0, min(t[6], 6))
            spots = " ".join(f"{t[7 + 2 * k]}:{t[8 + 2 * k]}/t{t[19 + k]}" for k in range(n)) or "none"
            print(f"  target {entry(g, t[0], t[4], t[5], t[2], t[3], types)}: spots {spots}" + (f"; kills {t[49] & 0xFF}" if n else ""))
            for k in range(n):
                print(f"      from {t[7 + 2 * k]}:{t[8 + 2 * k]}: dealt {t[25 + k]} taken {t[31 + k]} back dealt {t[43 + k]} back taken {t[37 + k]}")
    for r in g.log("AI_Planning", player=a.player):
        if a.unit is None or str(a.unit) in str(r.get("unit")):
            print("  AI_Planning: " + cells(r)[:a.wide])


def what_targets(g: Game, a) -> None:
    tp = g.site(g.units, a.player, "tacpass") or g.site(g.units, a.player, "log") or {}
    flat = tp.get("targets") or []
    types = step_types(g, a.player)
    print(f"== tactical target list of p{a.player} t{g.turn}: {len(flat) // 10} entries, in the list's order")
    for i in range(0, len(flat) - 9, 10):
        e = flat[i:i + 10]
        if a.plot and (e[1], e[2]) != a.plot:
            continue
        print(f"  {i // 10:>3} {entry(g, e[0], e[1], e[2], e[4], e[5], types)}")


def what_danger(g: Game, a) -> None:
    r = g.site(g.mem, a.player, "tactical") or {}
    d = {(x, y): v for x, y, v in r.get("danger") or []}
    print(f"== danger map of p{a.player} at its tactical step t{g.turn}: {len(d)} plots above 0, sum {sum(d.values())}")
    if a.plot:
        cx, cy = a.plot
        print("        " + " ".join(f"{x:>4}" for x in range(cx - 3, cx + 4)))
        for y in range(cy + 3, cy - 4, -1):
            print(f"  y{y:<4} " + ("  " if y % 2 else "") + " ".join(f"{d.get((x, y), '.'):>4}" for x in range(cx - 3, cx + 4)))
        rows = (g.site(g.units, a.player, "tactical") or {}).get("units") or {}
        for owner, rs in (rows.items() if isinstance(rows, dict) else []):
            for raw in rs:
                u = g.row(raw)
                if abs(u["m_kLocation"] - cx) <= 4 and abs(u["y"] - cy) <= 4:
                    print("  near: " + unit_line(g, u))
    else:
        by_value: dict = {}
        for (x, y), v in d.items():
            by_value.setdefault(v, []).append(f"{x}:{y}")
        for v in sorted(by_value, reverse=True):
            print(f"  {v:>4}: " + " ".join(by_value[v])[:a.wide])


def what_kb(g: Game, a) -> None:
    r = g.site(g.mem, a.player, "endlook") or g.site(g.mem, a.player, "log") or {}
    print(f"== knowledge base of p{a.player} at its end look t{g.turn}: army records [unit id, damage, formation, age, plot]")
    for owner, per in (r.get("army") or {}).items():
        for t, rows in per.items():
            print(f"  p{owner} {g.unit_type(int(t))}: " + " ".join(f"{e[0]}/d{e[1]}/f{e[2]}/age{e[3]}@{e[4]}:{e[5]}" for e in rows))
    print("  camps: " + (" ".join(f"{c[0]}:{c[1]}" for c in r.get("camps") or []) or "none") + f"; stats {r.get('stats')}")
    tp = g.site(g.units, a.player, "tacpass") or g.site(g.units, a.player, "log") or {}
    print(f"  known cities ({len(tp.get('kbCities') or [])}), in the list's order: owner, plot, population, capital flags; districts plot defense/walls/strike")
    for c, ds in tp.get("kbCities") or []:
        dist = " ".join(f"{ds[i + 3]}:{ds[i + 4]} {fx(ds[i + 5])}/{fx(ds[i + 6])}/{fx(ds[i + 7])}" for i in range(0, len(ds) - 7, 8))
        print(f"    p{c[0] & 0xFFFF} city {c[1]} at {c[2]}:{c[3]} pop{c[7]} cap{c[5] & 0xFF}{(c[5] >> 8) & 0xFF} | {dist}")
    for row in g.log("AI_Knowledge", player=a.player)[:40]:
        print("  AI_Knowledge: " + cells(row)[:a.wide])


def contract_line(g: Game, c: dict) -> str:
    item = ""
    if c.get("kind") == "build":
        item = " ".join(x for x in (g.unit_type(c["unit"]) if c.get("unit", -1) >= 0 else "", g.name("buildings", c["building"], "BUILDING_") if c.get("building", -1) >= 0 else "",
                                    g.name("districts", c["district"], "DISTRICT_") if c.get("district", -1) >= 0 else "") if x)
        item += f" plot {c['plot'][0]}:{c['plot'][1]}" if c.get("plot") and c["plot"][0] >= 0 else ""
        item += f" city {c.get('city')}"
    elif c.get("kind") == "tech":
        item = f"goal {g.name('techs', c.get('goal'), 'TECH_')} next {g.name('techs', c.get('next'), 'TECH_')}"
    elif c.get("kind") == "civic":
        item = f"goal {g.name('civics', c.get('goal'), 'CIVIC_')} next {g.name('civics', c.get('next'), 'CIVIC_')}"
    elif c.get("kind") == "plot":
        item = f"plot {c['plot'][0]}:{c['plot'][1]}"
    else:
        item = json.dumps({k: v for k, v in c.items() if k not in ("kind", "status", "priority", "timeLimit", "timeEstimate", "id", "owner", "player", "value", "refs")})
    st = c.get("status")
    return (f"#{c.get('id')} {c.get('kind')} {STATUS[st] if isinstance(st, int) and 0 <= st < len(STATUS) else st} priority {c.get('priority')} value {fx(c.get('value'))} "
            f"{item} tree {c.get('owner')} limit {c.get('timeLimit')} estimate {c.get('timeEstimate')}")


def what_trees(g: Game, a) -> None:
    r = g.site(g.mem, a.player, "endlook") or {}
    print(f"== trees of p{a.player} at its end look t{g.turn} ({len(r.get('trees') or {})}); assigned {r.get('assigned')}")
    for k, t in (r.get("trees") or {}).items():
        print(f"  {k} {t.get('name')}: value {fx(t.get('presentValue'))} request {t.get('requestPriority')} recruit {t.get('recruitPriority')} active {t.get('active')} "
              f"temporary {t.get('temporary')} destroy {t.get('markForDestroy')} allowRecruiting {t.get('allowRecruiting')} operation {t.get('operation')} contracts {t.get('contracts')}")
        if a.all:
            for i, n in enumerate(t.get("nodes") or []):
                print(f"      node {i}: {n[:3]} {n[4] if len(n) > 4 else ''} {n[5] if len(n) > 5 else ''}")


def what_contracts(g: Game, a) -> None:
    last = None
    for site in ("log", "endlook"):
        r = g.site(g.mem, a.player, site)
        if not r:
            continue
        lines = [contract_line(g, c) for c in r.get("contracts") or []]
        h = r.get("holders") or {}
        lines += [f"city {c.get('city')}: in hand {c.get('hand')} list {c.get('list')} threat {c.get('threat')} trees {(c.get('fields') or {}).get('m_eventTrees')}" for c in h.get("cities") or []]
        lines.append("holders: " + ", ".join(f"{k} {h.get(k)}" for k in ("economic", "research", "culture", "diplomatic")))
        if lines != last:
            print(f"== contracts of p{a.player} at {site} t{g.turn} ({len(r.get('contracts') or [])})")
            for l in lines:
                print("  " + l)
            last = lines
        else:
            print(f"== contracts at {site}: as at log")
    for row in g.log("AI_CityBuild", player=a.player):
        text = cells(row)
        if "CONTRACT" in text.upper() or any(s in text for s in ("SUBMITTED", "ACCEPTED", "COMPLETED", "CANCELLED", "FAILED")):
            print("  AI_CityBuild: " + text[:a.wide])


def what_ops(g: Game, a) -> None:
    last = None
    for site in ("tactical", "log", "endlook"):
        r = g.site(g.mem, a.player, site)
        if not r:
            continue
        lines = []
        for o in r.get("ops") or []:
            teams = "; ".join(" ".join(f"{g.unit_type(m[1])}({m[0]})" for m in team) or "empty" for team in o.get("teams") or [])
            lines.append(f"{o['name']} #{o['controlId']}: target {o['targetX']}:{o['targetY']} rally {o['rallyX']}:{o['rallyY']} enemy {o['enemy']} strength op {o['opStrength']} "
                         f"target {o['targetStrength']} combat {o['combatStrength']} blocked {o['blockedTurns']} forceReady {o['forceReady']} warReady {o['warReady']} "
                         f"tree {o['treeControlId']} recruiting {o.get('treeAllowRecruiting')} counts {o.get('teamCounts')} | {teams}")
        if lines != last:
            print(f"== operations of p{a.player} at {site} t{g.turn} ({len(lines)})")
            for l in lines:
                print("  " + l)
            last = lines
    for table in ("AI_Operation", "AI_Operation_Eval", "AI_Military"):
        for row in g.log(table, player=a.player):
            print(f"  {table}: " + cells(row)[:a.wide])


def queue_item(g: Game, q: dict) -> str:
    for key, table, strip in (("UnitType", "units", "UNIT_"), ("BuildingType", "buildings", "BUILDING_"), ("DistrictType", "districts", "DISTRICT_"),
                              ("ProjectType", "projects", "PROJECT_")):
        if isinstance(q.get(key), int) and q[key] >= 0:
            loc = q.get("Location") or {}
            return (f"{key[:-4].lower()}:{g.name(table, q[key], strip)}" + (f"@{loc['x']}:{loc['y']}" if loc.get("x", -9999) >= 0 else "")
                    + (f" formation {q['MilitaryFormationType']}" if q.get("MilitaryFormationType") else ""))
    return json.dumps(q)


def cities_of(g: Game, a) -> list[dict]:
    out = []
    for c in (g.rec or {}).get("cities", []):
        if a.city:
            if re.match(r"^\d+:\d+$", a.city):
                if f"{c['x']}:{c['y']}" != a.city:
                    continue
            elif a.city.upper().replace(" ", "_") not in c["name"].upper():
                continue
        elif c["owner"] != a.player:
            continue
        out.append(c)
    return out


def what_builds(g: Game, a) -> None:
    for c in cities_of(g, a):
        nxt = next((x for x in (g.next or {}).get("cities", []) if x["id"] == c["id"] and x["owner"] == c["owner"]), None)
        short = c["name"].replace("LOC_CITY_NAME_", "")
        print(f"== city {short} (p{c['owner']} id {c['id']} at {c['x']}:{c['y']}, pop {c['pop']}) t{g.turn}")
        for label, x in ((f"record t{g.turn}", c), (f"record t{g.turn + 1}", nxt)):
            if x:
                print(f"  {label}: queue [{'; '.join(queue_item(g, q) for q in x.get('queue') or []) or 'empty'}] progress {x.get('queueProgress')} production {x.get('productionYield')} "
                      f"food {x.get('food')}+{x.get('foodSurplus')} districts {[g.name('districts', d[0], 'DISTRICT_') + f'@{d[1]}:{d[2]}' for d in x.get('districts') or []]} "
                      f"buildings {[g.name('buildings', b[0], 'BUILDING_') + (' pillaged' if b[1] else '') for b in x.get('buildings') or []]}")
        if g.db:
            for row in g.log("City_BuildQueue", "turn = ? AND city LIKE ?", (g.turn, f"%{short}%")):
                print("  City_BuildQueue: " + cells(row)[:a.wide])
            for row in g.log("AI_CityBuild", "turn = ? AND player = ? AND (city LIKE ? OR city IS NULL)", (g.turn, c["owner"], f"%{short}%")):
                print("  AI_CityBuild: " + cells(row)[:a.wide])
            # the centre's logged value tables: the first plot of the city's first block of the turn
            first = g.log("AI_CityBuild_plot", "turn = ? AND player = ? AND city LIKE ? AND seq = 0", (g.turn, c["owner"], f"%{short}%"))
            if first:
                fam = {r["id"]: r["name"] for r in g.log("AI_CityBuild_family", "1 = 1", ())}
                table = {"UNITS": ("units", "UNIT_"), "BUILDINGS": ("buildings", "BUILDING_"), "DISTRICTS": ("districts", "DISTRICT_"),
                         "IMPROVEMENTS": ("improvements", "IMPROVEMENT_"), "PROJECTS": ("projects", "PROJECT_")}
                vals: dict = {}
                for r in g.db.execute("SELECT family, item, value FROM AI_CityBuild_plot_value WHERE plot = ? ORDER BY family, value DESC", (first[0]["id"],)):
                    vals.setdefault(fam.get(r[0], str(r[0])), []).append((r[1], r[2]))
                for name, rows in vals.items():
                    t = table.get(name)
                    shown = rows if a.all else rows[:12]
                    print(f"  logged {name} values at the centre ({len(rows)} valued{'' if a.all else ', the top 12'}): "
                          + " ".join(f"{g.name(t[0], i, t[1]) if t else i}={v:g}" for i, v in shown))
        for site_rec in [g.site(g.units, c["owner"], "endlook") or {}]:
            for cq in site_rec.get("cities") or []:
                if cq.get("city") == c["id"]:
                    q = cq.get("m_kBuildQueue")
                    print(f"  aiunits endlook m_kBuildQueue head: {q[:14] if isinstance(q, list) else q}")


def what_research(g: Game, a) -> None:
    print(f"== research of p{a.player} t{g.turn}")
    for label, rec in ((f"record t{g.turn}", g.rec), (f"record t{g.turn + 1}", g.next)):
        p = next((x for x in (rec or {}).get("players", []) if x["id"] == a.player), None)
        if p:
            print(f"  {label}: researching {g.name('techs', p.get('researching'), 'TECH_')} {p.get('researchProgress')}/{p.get('researchCost')} at {p.get('scienceYield')} a turn; "
                  f"civic {g.name('civics', p.get('civic'), 'CIVIC_')} {p.get('civicProgress')}/{p.get('civicCost')} at {p.get('cultureYield')}; policies {p.get('policies')}")
    r = g.site(g.mem, a.player, "endlook") or {}
    for c in r.get("contracts") or []:
        if c.get("kind") in ("tech", "civic"):
            print("  contract " + contract_line(g, c))
    tech = sorted(g.log("AI_Research", player=a.player), key=lambda x: -(x.get("score") or 0) if isinstance(x.get("score"), (int, float)) else 0)
    print(f"  AI_Research ({len(tech)} rows), by score: tech score@turns [boost]")
    for x in tech:
        if x.get("action") == "Tech" and (a.all or x.get("boost") != "OWNED"):
            print(f"    {str(x.get('tech')).replace('TECH_', ''):<28} {x.get('score')}@{x.get('turns')} {x.get('boost') or ''} {x.get('rest') or ''}")
        elif x.get("action") != "Tech":
            print("    " + cells(x)[:a.wide])
    gov = g.log("AI_GovtPolicies", player=a.player)
    for act in ("Civic", "Policies"):
        rows = sorted((x for x in gov if x.get("action") == act), key=lambda x: -(x.get("score") or 0) if isinstance(x.get("score"), (int, float)) else 0)
        print(f"  AI_GovtPolicies {act} ({len(rows)} rows), by score:")
        for x in rows:
            print(f"    {str(x.get('policy')).replace('CIVIC_', ''):<34} {x.get('score')}" + (f"@{x.get('turns')}" if x.get("turns") is not None else "") + f" {x.get('rest') or ''}")
    for x in gov:
        if x.get("action") not in ("Civic", "Policies"):
            print("  AI_GovtPolicies: " + cells(x)[:a.wide])
    for x in g.log("AI_Military", player=a.player):
        print("  AI_Military: " + cells(x)[:a.wide])
    for x in g.log("Game_Boosts", player=a.player):
        print("  Game_Boosts: " + cells(x)[:a.wide])


def what_events(g: Game, a) -> None:
    t = g.turn
    p = a.player
    print(f"== events of p{p} t{t}: the logs' rows, then the record's event rows")
    if g.db:
        tables = [r[0] for r in g.db.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")]
        for table in tables:
            cols = [r[1] for r in g.db.execute(f'PRAGMA table_info("{table}")')]
            if table.startswith("AI_CityBuild_") or table in ("meta", "RandCalls", "Profile"):
                continue
            # the logs that repeat every turn whatever happened: with --all alone
            if not a.all and table in ("AStar_GC", "AI_SiteEval", "Game_PlayerScores", "Player_Stats", "Player_Stats_2", "DynamicEmpires", "AI_Planning",
                                       "AI_Diplomacy", "AI_Espionage", "AI_Religious", "AI_Victories", "DiplomacyModifiers"):
                continue
            if "turn" in cols and "player" in cols:
                rows = g.log(table, args=(t, p))
            elif table == "CombatLog":
                rows = g.log(table, "turn = ? AND (attacking_civ = ? OR defendingciv = ?)", (t, p, p))
            elif table == "Barbarians_Units" and p == 63 or table == "Barbarians" and p == 63:
                rows = g.log(table, "turn = ?", (t,))
            else:
                continue
            if a.unit is not None:
                rows = [r for r in rows if str(a.unit) in json.dumps(list(r.values()))]
            # the score tables print whole under --what research: here the choice rows alone
            if not a.all and table == "AI_Research":
                rows = [r for r in rows if r.get("action") != "Tech" or r.get("boost") in ("RESEARCHING", "GOAL")]
            if not a.all and table == "AI_GovtPolicies":
                rows = [r for r in rows if r.get("action") not in ("Civic", "Policies")]
            limit = len(rows) if a.all else 30
            for r in rows[:limit]:
                print(f"  {table}: " + cells(r)[:a.wide])
            if len(rows) > limit:
                print(f"  {table}: ... {len(rows) - limit} more rows (--all)")
    types = {u["id"]: g.unit_type(u["type"]) for rec in (g.rec, g.next) for u in (rec or {}).get("units", [])}
    seen = set()
    rows = []
    for rec in (g.rec, g.next):
        for key in ("actions", "extra"):
            for e in (rec or {}).get(key) or []:
                if not isinstance(e, list) or len(e) < 4 or e[1] != t or e[3] != p:
                    continue
                k = json.dumps(e)
                if k in seen or (e[2] in QUIET and not a.all):
                    continue
                if a.unit is not None and a.unit not in e[4:6]:
                    continue
                seen.add(k)
                rows.append(e)
    quiet = 0
    for e in sorted(rows, key=lambda e: e[0]):
        tail = e[4:]
        note = f" ({types[tail[0]]})" if tail and e[2].startswith("Unit") and tail[0] in types else ""
        print(f"  record #{e[0]}: {e[2]} {' '.join(str(x) for x in tail)}{note}")
    if not a.all:
        for rec in (g.rec, g.next):
            for key in ("actions", "extra"):
                quiet += sum(1 for e in (rec or {}).get(key) or [] if isinstance(e, list) and len(e) > 3 and e[1] == t and e[3] == p and e[2] in QUIET)
        if quiet:
            print(f"  record: {quiet} movement-point, visibility, activity and resource rows left out (--all)")


def what_plot(g: Game, a) -> None:
    x, y = a.plot
    print(f"== plot {x}:{y} (index {y * g.W + x}) t{g.turn}")
    for label, rec in ((f"record t{g.turn}", g.rec), (f"record t{g.turn + 1}", g.next)):
        if not rec:
            continue
        c = rec["map"][y][x]
        print(f"  {label}: terrain {g.name('terrains', c[0], 'TERRAIN_')} feature {g.name('features', c[1], 'FEATURE_') if c[1] >= 0 else '-'} "
              f"resource {g.name('resources', c[2], 'RESOURCE_') if c[2] >= 0 else '-'}x{c[3]} improvement {g.name('improvements', c[4], 'IMPROVEMENT_') if c[4] >= 0 else '-'}"
              f"{' pillaged' if c[5] else ''} owner {c[6]} district {g.name('districts', c[7], 'DISTRICT_') if isinstance(c[7], int) and c[7] >= 0 else '-'} cell {json.dumps(c)}")
        for u in rec.get("units", []):
            if (u["x"], u["y"]) == (x, y):
                print(f"    unit {u['owner']}:{u['id']} {g.unit_type(u['type'])} moves {u['moves']} damage {u['damage']} embarked {u['embarked']} fortify {u['fortify']}")
    for p in g.players():
        r = g.site(g.mem, p, "tactical") or {}
        v = next((d[2] for d in r.get("danger") or [] if (d[0], d[1]) == (x, y)), None)
        if v is not None:
            print(f"  danger in p{p}'s map: {v}")
    if g.db:
        for row in g.log("AI_CityBuild_plot", "turn = ? AND x = ? AND y = ?", (g.turn, x, y)):
            print("  AI_CityBuild plot analysis: " + cells(row, skip=("turn",))[:a.wide])


def what_record(g: Game, a) -> None:
    """the record's own fields of the player's cities and of the player, at T
    and, where T+1 differs, T+1's value after `->`"""
    def rows(label: str, now: dict, nxt: dict | None) -> None:
        print(f"== record of {label} t{g.turn} (-> t{g.turn + 1} where it differs)")
        for k, v in now.items():
            s = json.dumps(v)
            n = json.dumps(nxt[k]) if nxt and k in nxt else s
            print(f"  {k}: {s[:a.wide]}" + (f"  ->  {n[:a.wide]}" if n != s else ""))
    for c in cities_of(g, a):
        nxt = next((x for x in (g.next or {}).get("cities", []) if x["id"] == c["id"] and x["owner"] == c["owner"]), None)
        rows(f"city {c['name'].replace('LOC_CITY_NAME_', '')} (p{c['owner']})", c, nxt)
    for p in (g.rec or {}).get("players", []):
        if p.get("id") == a.player:
            rows(f"p{a.player}", p, next((x for x in (g.next or {}).get("players", []) if x.get("id") == a.player), None))


WHAT = {"units": what_units, "planning": what_planning, "targets": what_targets, "danger": what_danger, "kb": what_kb, "trees": what_trees,
        "contracts": what_contracts, "ops": what_ops, "builds": what_builds, "research": what_research, "events": what_events,
        "record": what_record}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("seed")
    ap.add_argument("turn", type=int)
    ap.add_argument("--player", type=int)
    ap.add_argument("--unit", type=int)
    ap.add_argument("--city")
    ap.add_argument("--plot")
    ap.add_argument("--what")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--wide", type=int, default=400, help="the widest a log row prints")
    ap.add_argument("--ords", help="A-B: every record event row of sequence A..B, any player, whole, and nothing else")
    a = ap.parse_args()
    common.utf8()
    g = Game(a.seed, a.turn)
    if not g.rec:
        print(f"no unmoved record of turn {a.turn} in {g.f['dump'].name}")
    if a.ords:
        lo, hi = (int(v) for v in a.ords.split("-"))
        rows = {json.dumps(e): e for rec in (g.rec, g.next) for key in ("actions", "extra") for e in (rec or {}).get(key) or []
                if isinstance(e, list) and len(e) > 2 and isinstance(e[0], int) and lo <= e[0] <= hi}
        for e in sorted(rows.values(), key=lambda e: e[0]):
            print(f"  record #{e[0]} t{e[1]}: {e[2]} {' '.join(str(x) for x in e[3:])}")
        return 0
    a.plot = tuple(int(v) for v in a.plot.split(":")) if a.plot else None
    if a.unit is not None and a.player is None:
        a.player = find_unit(g, a.unit)
        if a.player is None:
            raise SystemExit(f"unit {a.unit}: in no record or stream row of t{a.turn}; name its --player")
    if a.city and a.player is None:
        cs = cities_of(g, a)
        if not cs:
            raise SystemExit(f"city {a.city}: none in record t{a.turn} ({', '.join(c['name'].replace('LOC_CITY_NAME_', '') for c in (g.rec or {}).get('cities', []))})")
        a.player = cs[0]["owner"]
    what = a.what.split(",") if a.what else (["units", "planning"] if a.unit is not None else ["builds"] if a.city else [] if a.plot else ["events"])
    print(f"# {g.f['stem']} t{a.turn}" + (f" p{a.player} ({common.player_class(a.player)})" if a.player is not None else "") + f"; players {g.players()}")
    if a.plot:
        what_plot(g, a)
    if what and a.player is None:
        raise SystemExit("name --player (or --unit / --city) for --what " + ",".join(what))
    for w in what:
        if w not in WHAT:
            raise SystemExit(f"--what {w}: one of {', '.join(WHAT)}")
        WHAT[w](g, a)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
