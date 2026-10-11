"""THE DLL ATLAS: what we know of the game DLL, function by function.

    python tools/civ6lab/atlas.py <addr|F:addr|+offset|name> [--full] [--dump]
    python tools/civ6lab/atlas.py coverage        # the binary -> source file tree, writes atlas/COVERAGE.md
    python tools/civ6lab/atlas.py gen             # rebuild the generated layer (atlas_gen.py)
    python tools/civ6lab/atlas.py import          # add records for addresses cited and not yet recorded (atlas_import.py)

Two layers, kept apart:
* GENERATED (`atlas_gen.py`): every function of GameCore_XP2_Release.dll
  (`R`, the one we read) and GameCore_XP2_FinalRelease.dll (`F`, the one
  the game runs) — bounds, source file, the names the binary gives, the
  R <-> F match (committed, `atlas/gen/`); callees, strings, globals,
  field offsets, vtables (rebuilt into `atlas/cache/gen/` when missing).
  Never edited by hand. Annotated dumps are cached in `atlas/cache/`
  (`--dump` rewrites one after the records' names change).
* CURATED (`atlas/*.yaml`, `atlas/src/<source file>.yaml`): the knowledge,
  a record per function, struct field or global:

    - addr: 0x7a16e0            # R RVA (the key); a record of F alone has `binary: F`
      final: 0x528310           # the F RVA
      kind: function            # function | field | global | string
      name: presentValue
      signature: "fx pv(fx* out, fx* value, fx* rate, int turns)"
      semantics: |
        what it computes, the arguments' meaning ...
      status: READ              # READ | PARTLY | UNREAD
      cases:                    # what confirms it: recording, turn, value
        - recording: h1_duelv1117
          turn: 47
          value: "Monument 24.0"
      impl: [cpu/core/aiValue.ts:presentValue, gpu/core/ai_value.py:present_value]
      readings: ["C-96 / C-97: the city build AI — ..."]   # dll_readings.md sections
      review: reviewed          # imported (bootstrap, unreviewed) | reviewed

  A field: `kind: field`, `owner: City`, `offset: 0x908`, `type`, `writers:
  [0x...]`. A global: `kind: global`, `addr` its RVA. `atlas/binaries.yaml`
  holds a one-line purpose for every other binary of the install.

The curated files are a YAML subset this module reads and writes (block
mappings and lists, plain / quoted scalars, `|` blocks, `[a, b]` lists;
every scalar is a string).
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
import time
from bisect import bisect_right
from collections import Counter, defaultdict

HERE = pathlib.Path(__file__).resolve().parent
ATLAS = HERE / "atlas"
GEN = ATLAS / "gen"
CACHE = ATLAS / "cache"
ROOT = HERE.parents[1]
BIN = {"R": "GameCore_XP2_Release", "F": "GameCore_XP2_FinalRelease"}
STATUS = ("READ", "PARTLY", "UNREAD")
KEY_ORDER = ("addr", "final", "binary", "kind", "owner", "offset", "name", "signature", "type", "semantics", "status",
             "cases", "impl", "writers", "readings", "notes", "context", "review", "file", "purpose")


# -- the YAML subset -------------------------------------------------------
def _scalar(s: str) -> str | None:
    s = s.strip()
    if s.startswith('"'):
        return json.loads(s)
    if s.startswith("'"):
        return s[1:-1].replace("''", "'")
    m = re.search(r"\s#", s)
    if m:
        s = s[: m.start()].rstrip()
    if s in ("", "~", "null"):
        return None
    return s


def _flow(s: str) -> list:
    s = s.strip()
    assert s.startswith("[") and s.endswith("]"), s
    body = s[1:-1]
    out, cur, q = [], "", None
    for ch in body:
        if q:
            cur += ch
            if ch == q and not cur.endswith("\\" + q):
                q = None
        elif ch in "\"'":
            q = ch
            cur += ch
        elif ch == ",":
            out.append(_scalar(cur))
            cur = ""
        else:
            cur += ch
    if cur.strip():
        out.append(_scalar(cur))
    return out


def yaml_load(text: str):
    lines = []
    for raw in text.splitlines():
        lines.append(raw.rstrip())
    pos = [0]

    def skip() -> None:
        while pos[0] < len(lines) and (not lines[pos[0]].strip() or lines[pos[0]].lstrip().startswith("#")):
            pos[0] += 1

    def ind(i: int) -> int:
        return len(lines[i]) - len(lines[i].lstrip(" "))

    def block_scalar(parent: int) -> str:
        out = []
        while pos[0] < len(lines) and (not lines[pos[0]].strip() or ind(pos[0]) > parent):
            out.append(lines[pos[0]])
            pos[0] += 1
        while out and not out[-1].strip():
            out.pop()
        cut = min((len(x) - len(x.lstrip(" ")) for x in out if x.strip()), default=0)
        return "\n".join(x[cut:] for x in out) + "\n"

    def value(rest: str, parent: int):
        rest = rest.strip()
        if rest in ("|", "|-", ">", ">-"):
            return block_scalar(parent)
        if rest.startswith("["):
            return _flow(rest)
        if rest == "{}":
            return {}
        if rest == "":
            skip()
            if pos[0] < len(lines) and (ind(pos[0]) > parent or
                                        (ind(pos[0]) == parent and lines[pos[0]].lstrip().startswith("- "))):
                return node(ind(pos[0]))
            return None
        return _scalar(rest)

    def node(level: int):
        skip()
        if pos[0] >= len(lines):
            return None
        if lines[pos[0]].lstrip().startswith("-"):
            out = []
            while True:
                skip()
                if pos[0] >= len(lines) or ind(pos[0]) != level or not lines[pos[0]].lstrip().startswith("-"):
                    return out
                body = lines[pos[0]].lstrip()[1:]
                if body.strip() == "":
                    pos[0] += 1
                    out.append(node(ind(pos[0])) if pos[0] < len(lines) else None)
                    continue
                inner = level + 1 + (len(body) - len(body.lstrip(" ")))
                if re.match(r"^[A-Za-z_][\w\- ]*:(\s|$)", body.strip()):
                    lines[pos[0]] = " " * inner + body.strip()
                    out.append(node(inner))
                else:
                    pos[0] += 1
                    out.append(value(body, level))
        out = {}
        while True:
            skip()
            if pos[0] >= len(lines) or ind(pos[0]) != level or lines[pos[0]].lstrip().startswith("- "):
                return out
            line = lines[pos[0]].strip()
            m = re.match(r"^([A-Za-z_][\w\-]*):(?:\s+(.*))?$", line)
            if not m:
                raise ValueError(f"line {pos[0] + 1}: {line!r}")
            pos[0] += 1
            out[m.group(1)] = value(m.group(2) or "", level)

    return node(0)


PLAIN = re.compile(r"^[A-Za-z0-9_./()<>+*=&|;!$@\-][A-Za-z0-9_./()<>+*=&|;!$@\- ,:'\[\]]*$")


def _q(v: str) -> str:
    if v and PLAIN.match(v) and not v.endswith(" ") and ": " not in v and not v.endswith(":") and v not in (
            "null", "~", "true", "false") and not v.startswith(("- ", "[")):
        return v
    return json.dumps(v, ensure_ascii=False)


def _dump(v, level: int, out: list[str], key: str | None) -> None:
    pad = " " * level
    head = f"{pad}{key}:" if key is not None else None
    if isinstance(v, dict):
        if head:
            out.append(head)
        keys = sorted(v, key=lambda k: (KEY_ORDER.index(k) if k in KEY_ORDER else len(KEY_ORDER), k))
        for k in keys:
            if v[k] is None or v[k] == [] or v[k] == "":
                continue
            _dump(v[k], level + (2 if head else 0), out, k)
    elif isinstance(v, list):
        if all(isinstance(x, str) and "\n" not in x for x in v) and sum(len(x) for x in v) < 90:
            out.append(f"{head} [{', '.join(_q(x) for x in v)}]")
            return
        out.append(head)
        for x in v:
            if isinstance(x, dict):
                sub: list[str] = []
                _dump(x, level + 4, sub, None)
                first = sub[0].lstrip()
                out.append(f"{pad}  - {first}")
                out.extend(sub[1:])
            else:
                out.append(f"{pad}  - {_q(x) if '\n' not in x else json.dumps(x, ensure_ascii=False)}")
    else:
        s = str(v)
        if "\n" in s:
            out.append(f"{head} |")
            out.extend((pad + "  " + ln) if ln else "" for ln in s.rstrip("\n").split("\n"))
        else:
            out.append(f"{head} {_q(s)}")


def yaml_dump_records(records: list[dict], header: str = "") -> str:
    out = [f"# {ln}" if ln else "#" for ln in header.splitlines()]
    for r in records:
        sub: list[str] = []
        _dump(r, 2, sub, None)
        out.append("- " + sub[0].lstrip())
        out.extend(sub[1:])
    return "\n".join(out) + "\n"


# -- the generated layer -----------------------------------------------------
def cached(name: str) -> pathlib.Path:
    """a generated file kept in the cache (cross references, strings,
    vtables), rebuilt from the DLLs when missing"""
    p = CACHE / "gen" / name
    if not p.exists():
        print(f"(atlas: {name} missing, rebuilding the generated layer, ~40 s)", file=sys.stderr)
        sys.path.insert(0, str(HERE))
        import atlas_gen
        atlas_gen.generate(log=lambda s: print(s, file=sys.stderr))
    return p


def hexint(s: str | int) -> int:
    return s if isinstance(s, int) else int(str(s).replace("F:", ""), 16)


class Gen:
    def __init__(self):
        self.funcs: dict[str, dict[int, tuple]] = {}
        self.starts: dict[str, list[int]] = {}
        self.sources: dict[str, str] = {}
        self._xrefs: dict[str, dict[int, tuple]] = {}
        self._strings: dict[str, dict[int, str]] = {}
        self._callers: dict[str, dict[int, list[int]]] = {}
        p = GEN / "sources.tsv"
        if not p.exists():
            return
        for line in p.read_text(encoding="utf-8").splitlines()[1:]:
            i, path = line.split("\t")
            self.sources[i] = path
        for side, stem in BIN.items():
            d = {}
            with open(GEN / f"{stem}.funcs.tsv", encoding="utf-8") as fh:
                next(fh)
                for line in fh:
                    c = line.rstrip("\n").split("\t")
                    d[int(c[0], 16)] = (int(c[1], 16), self.sources.get(c[2], ""), c[3], c[4], c[5],
                                        int(c[6], 16) if c[6] else None, int(c[7]))
            self.funcs[side] = d
            self.starts[side] = sorted(d)
        self.meta = json.loads((GEN / "meta.json").read_text(encoding="utf-8"))

    def ok(self) -> bool:
        return bool(self.funcs)

    def func_of(self, side: str, rva: int) -> int | None:
        st = self.starts[side]
        k = bisect_right(st, rva) - 1
        if k >= 0 and rva < self.funcs[side][st[k]][0]:
            return st[k]
        return None

    def xrefs(self, side: str) -> dict[int, tuple]:
        if side not in self._xrefs:
            d = {}
            with open(cached(f"{BIN[side]}.xrefs.tsv"), encoding="utf-8") as fh:
                next(fh)
                for line in fh:
                    c = line.rstrip("\n").split("\t")
                    d[int(c[0], 16)] = tuple([int(x, 16) for x in col.split()] for col in c[1:])
            self._xrefs[side] = d
        return self._xrefs[side]

    def callers(self, side: str, rva: int) -> list[int]:
        if side not in self._callers:
            m = defaultdict(list)
            for f, (calls, refs, *_rest) in self.xrefs(side).items():
                for c in set(calls) | set(refs):
                    m[c].append(f)
            self._callers[side] = m
        return sorted(self._callers[side].get(rva, []))

    def strings(self, side: str) -> dict[int, str]:
        if side not in self._strings:
            d = {}
            with open(cached(f"{BIN[side]}.strings.tsv"), encoding="utf-8") as fh:
                next(fh)
                for line in fh:
                    rva, kind, text = line.rstrip("\n").split("\t", 2)
                    d[int(rva, 16)] = ("L" if kind == "w" else "") + json.dumps(
                        text.replace("\\t", "\t").replace("\\n", "\n").replace("\\\\", "\\"), ensure_ascii=False)
            self._strings[side] = d
        return self._strings[side]


# -- the curated layer -------------------------------------------------------
def curated_files() -> list[pathlib.Path]:
    return sorted(p for p in ATLAS.rglob("*.yaml") if GEN not in p.parents and CACHE not in p.parents)


class Curated:
    def __init__(self):
        self.records: list[tuple[pathlib.Path, dict]] = []
        self.by: dict[tuple[str, int], tuple[pathlib.Path, dict]] = {}
        self.fields: dict[int, list[dict]] = defaultdict(list)
        self.binaries: list[dict] = []
        for p in curated_files():
            data = yaml_load(p.read_text(encoding="utf-8")) or []
            if p.name == "binaries.yaml":
                self.binaries = data
                continue
            for r in data:
                self.records.append((p, r))
                kind = r.get("kind") or "function"
                if kind == "field":
                    self.fields[hexint(r["offset"])].append(r)
                    continue
                side = r.get("binary") or "R"
                if r.get("addr"):
                    self.by[(side, hexint(r["addr"]))] = (p, r)
                if r.get("final"):
                    self.by[("F", hexint(r["final"]))] = (p, r)

    def get(self, side: str, rva: int) -> dict | None:
        got = self.by.get((side, rva))
        return got[1] if got else None

    def names(self, side: str) -> dict[int, str]:
        out = {}
        for (s, rva), (_, r) in self.by.items():
            if s == side and r.get("name"):
                out[rva] = r["name"]
        return out


def label_maps(side: str) -> tuple[dict[int, str], dict[int, list[str]]]:
    """address -> name (curated over the binary's own), field offset ->
    owner.field names: for dll_q's labels"""
    g = Gen()
    names = {}
    if g.ok():
        for rva, row in g.funcs[side].items():
            if row[3]:
                names[rva] = row[3]
    c = Curated()
    names.update(c.names(side))
    fields = {off: [f"{r.get('owner', '?')}.{r.get('name', hex(off))}" for r in rs] for off, rs in c.fields.items()}
    return names, fields


# -- the lookup --------------------------------------------------------------
def describe(q: str, full: bool, dump: bool) -> int:
    g, c = Gen(), Curated()
    if not g.ok():
        print("no generated layer: run `atlas.py gen`")
        return 1
    if q.startswith("+"):
        off = int(q[1:], 16)
        for r in c.fields.get(off, []):
            print(yaml_dump_records([r]))
        users = [f for f, x in g.xrefs("R").items() if off in x[4]]
        print(f"R functions touching +{off:#x}: {len(users)}")
        for f in users[: (None if full else 40)]:
            print(f"  {f:#08x} {name_of(g, c, 'R', f)}")
        return 0
    side = "R"
    if q.upper().startswith("F:"):
        side, q = "F", q[2:]
    if re.fullmatch(r"(0x)?[0-9a-fA-F]{3,8}", q):
        rva = int(q, 16)
    else:
        hits = [(s, a) for (s, a), (_, r) in c.by.items() if q.lower() in (r.get("name") or "").lower()]
        hits += [(s, a) for s in BIN for a, row in g.funcs[s].items() if row[3] and q.lower() in row[3].lower()]
        hits = sorted(set(hits), key=lambda h: (h[0] != "R", h))
        seen, uniq = set(), []
        for s, a in hits:
            row = g.funcs[s].get(a)
            twin = ("F" if s == "R" else "R", row[5]) if row and row[5] is not None else None
            if (s, a) in seen:
                continue
            seen.add((s, a))
            if twin:
                seen.add(twin)
            uniq.append((s, a))
        hits = sorted(uniq)
        exact = [h for h in hits if (name_of(g, c, *h) or "").lower() == q.lower()]
        if len(exact) == 1 or len(hits) == 1:
            side, rva = (exact or hits)[0]
        else:
            print(f"{len(hits)} matches for {q!r}:")
            for s, a in hits[:60]:
                print(f"  {s}:{a:#08x} {name_of(g, c, s, a)}")
            return 0 if hits else 1
    f = g.func_of(side, rva)
    rec = c.get(side, rva) or (c.get(side, f) if f is not None else None)
    if f is None:
        print(f"{BIN[side]} {rva:#x}: no function holds it (data)")
        if rec:
            print(yaml_dump_records([rec]))
        return 0
    end, src, how, bname, bkind, match, n = g.funcs[side][f]
    other = "F" if side == "R" else "R"
    print(f"{BIN[side]} {f:#x}..{end:#x} ({n} instructions){'' if f == rva else f'  holds {rva:#x}'}")
    print(f"  source   {src or '-'}{f' ({how})' if src else ''}")
    print(f"  binary   {bname + ' (' + bkind + ')' if bname else '-'}")
    print(f"  {BIN[other]} {f'{match:#x}' if match is not None else '- (unmatched)'}")
    if rec is None and match is not None:
        rec = c.get(other, match)
    if rec:
        path = next(p for p, r in c.records if r is rec)
        print(f"record ({path.relative_to(ROOT).as_posix()}):")
        print("  " + yaml_dump_records([rec]).replace("\n", "\n  ").rstrip())
    else:
        print("record: none (UNREAD) — add one in atlas/ when you read it")
    calls, refs, strs, globs, fields = g.xrefs(side).get(f, ([], [], [], [], []))
    cl = g.callers(side, f)
    lim = None if full else 25
    print(f"callers ({len(cl)}):")
    for x in cl[:lim]:
        print(f"  {x:#08x} {name_of(g, c, side, x)}")
    print(f"callees ({len(calls)}):")
    for x in calls[:lim]:
        print(f"  {x:#08x} {name_of(g, c, side, x)}")
    if refs:
        print(f"code refs: {' '.join(f'{x:#x}' for x in refs[:lim])}")
    ss = g.strings(side)
    if strs:
        print(f"strings ({len(strs)}):")
        for s in strs[:lim]:
            print(f"  {s:#08x} {ss.get(s, '?')[:140]}")
    if globs:
        names = c.names(side)
        print(f"globals: {' '.join(f'{x:#x}' + (f'={names[x]}' if x in names else '') for x in globs[:lim])}")
    if fields:
        print(f"fields: {' '.join(f'+{x:#x}' for x in fields[: (None if full else 60)])}")
    if side == "R" or dump:
        path = CACHE / f"{side}_{f:x}.txt"
        if dump or not path.exists():
            write_dump(side, f, path)
        text = path.read_text(encoding="utf-8").splitlines()
        print(f"dump ({path.relative_to(ROOT).as_posix()}, {len(text)} lines):")
        for ln in text[: (None if full else 40)]:
            print("  " + ln)
        if not full and len(text) > 40:
            print(f"  ... ({len(text) - 40} more; --full)")
    return 0


def name_of(g: Gen, c: Curated, side: str, rva: int) -> str:
    r = c.get(side, rva)
    if r and r.get("name"):
        return f"{r['name']} [{r.get('status', '?')}]"
    row = g.funcs[side].get(rva)
    return row[3] if row and row[3] else ""


def write_dump(side: str, f: int, path: pathlib.Path) -> None:
    sys.path.insert(0, str(HERE))
    for root in HERE.parents:
        if (root / ".claude" / "scratchpad" / "pylibs").is_dir():
            sys.path.insert(0, str(root / ".claude" / "scratchpad" / "pylibs"))
            break
    from dll_q import DEFAULT, Q
    dll = DEFAULT if side == "R" else DEFAULT.replace("_Release.dll", "_FinalRelease.dll")
    q = Q(dll)
    fn = q.d.func_of(f)
    lo, hi = (fn if fn and fn[0] == f else (f, Gen().funcs[side][f][0]))
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(q.annotate(i) for i in q.d.dis(lo, hi)) + "\n", encoding="utf-8")


# -- coverage ------------------------------------------------------------------
def coverage() -> int:
    g, c = Gen(), Curated()
    out = ["# The DLL atlas's coverage", "",
           "Generated by `python tools/civ6lab/atlas.py coverage`; do not edit. Per binary and source file:",
           "functions, curated records READ / PARTLY / UNREAD (no record counts UNREAD), and ported (a record",
           "naming an engine symbol). FinalRelease functions take their own record or their Release match's.", ""]
    for side in BIN:
        rows: dict[str, Counter] = defaultdict(Counter)
        for f, row in g.funcs[side].items():
            r = c.get(side, f)
            if r is None and row[5] is not None:
                r = c.get("F" if side == "R" else "R", row[5])
            st = (r.get("status") or "UNREAD") if r else "UNREAD"
            st = st if st in STATUS else "PARTLY"
            k = row[1] or "(no source file)"
            rows[k]["functions"] += 1
            rows[k][st] += 1
            if r and r.get("impl"):
                rows[k]["ported"] += 1
        tot = Counter()
        for v in rows.values():
            tot.update(v)
        m = g.meta["binaries"][BIN[side]]
        out += [f"## {BIN[side]}.dll", "",
                f"{tot['functions']} functions, {m['matched']} matched to the "
                f"{'FinalRelease' if side == 'R' else 'Release'} DLL, {m['with_source']} with a source file, "
                f"{m['named']} named by the binary; READ {tot['READ']}, PARTLY {tot['PARTLY']}, "
                f"UNREAD {tot['UNREAD']}, ported {tot['ported']}.", "",
                "| source file | functions | READ | PARTLY | UNREAD | ported |", "|---|---:|---:|---:|---:|---:|"]
        for k in sorted(rows, key=lambda k: (k.startswith("("), k.lower())):
            v = rows[k]
            if side == "F" and not (v["READ"] or v["PARTLY"]):
                continue
            out.append(f"| {k} | {v['functions']} | {v['READ']} | {v['PARTLY']} | {v['UNREAD']} | {v['ported']} |")
        if side == "F":
            out.append("")
            out.append("(FinalRelease: only the source files holding a curated record are listed.)")
        out.append("")
        print(f"{BIN[side]}: {tot['functions']} functions, READ {tot['READ']}, PARTLY {tot['PARTLY']}, "
              f"UNREAD {tot['UNREAD']}, ported {tot['ported']}, {len(rows)} source files")
        tree: dict[str, Counter] = defaultdict(Counter)
        for k, v in rows.items():
            tree[k.rsplit("/", 1)[0] if "/" in k else k].update(v)
        if side == "R":
            for d in sorted(tree, key=str.lower):
                v = tree[d]
                if v["READ"] or v["PARTLY"]:
                    print(f"  {d}: {v['functions']} fn, READ {v['READ']}, PARTLY {v['PARTLY']}, ported {v['ported']}")
    others = c.binaries
    if others:
        out += ["## The install's other binaries", "", "| binary | purpose |", "|---|---|"]
        out += [f"| {b.get('file')} | {b.get('purpose')} |" for b in others]
        out.append("")
    (ATLAS / "COVERAGE.md").write_text("\n".join(out), encoding="utf-8", newline="\n")
    return 0


def main(argv: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if not argv:
        print(__doc__)
        return 1
    t0 = time.time()
    cmd = argv[0]
    if cmd == "gen":
        import atlas_gen
        atlas_gen.generate()
        rc = 0
    elif cmd == "coverage":
        rc = coverage()
    elif cmd == "import":
        import atlas_import
        rc = atlas_import.main(argv[1:])
    else:
        rc = describe(cmd, "--full" in argv, "--dump" in argv)
    if "--time" in argv:
        print(f"({time.time() - t0:.2f}s)")
    return rc


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    raise SystemExit(main(sys.argv[1:]))
