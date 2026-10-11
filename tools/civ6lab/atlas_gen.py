"""The DLL atlas's GENERATED layer (`atlas/gen/`): a full, cheap, deterministic
cover of GameCore_XP2_Release.dll (the one we read; its asserts name the
source files) and GameCore_XP2_FinalRelease.dll (the one the game runs).
Never hand-edited: `python tools/civ6lab/atlas.py gen` rewrites it.

Per binary (`R` the Release DLL, `F` the FinalRelease DLL):
* functions: the .pdata entries (chained entries folded into their head),
  plus the leaf functions .pdata does not cover — the targets of direct
  calls / tail jumps / RIP-relative code references and the relocated
  pointers into .text that fall outside every .pdata function (bounded by
  their first return before padding or the next start);
* per function: the direct callees (calls and tail jumps), the code it
  takes the address of, the strings it cites (ASCII and UTF-16), the data
  addresses it touches (globals), the struct-field displacements of its
  memory operands (any base register but rsp / rip, rbp only upward), and
  a hash of its instructions with addresses blanked;
* the SOURCE FILE: the .cpp its asserts cite (`assert`); else the file of
  the functions on both sides when they agree (`neighbour` — the linker
  lays each object file out in one run); else, in a gap between two files'
  runs, the run its callers and callees mostly belong to, up to the last
  such function (`callgraph`); else the header its inlined asserts cite
  (`header`, template / inline code). FinalRelease functions take their own
  asserts' file, else their Release match's (`match`);
* NAMES the binary gives: Lua bindings (`lua`: a registrar's `lea rdx, fn`
  / `lea r8, "Name"` pairs, named l<Name>; `luatarget`: the one C++
  function a binding calls besides the shared helpers), type-name getters
  (`typename`: a leaf `lea rax, "NAME"; ret`, a GameEffects effect /
  collection / requirement, a behaviour-tree node ...), the virtual slots of
  the vtable holding such a getter (`vslot`: NAME.v<slot>, a function in
  one named vtable only), log files (`log`: a function citing a UTF-16
  `*.csv` / `*.txt` / `*.log` name that at most four functions cite), scope strings (`scope`: a `Class::Method`
  string cited by that function alone), and PE exports (`export`);
* the MATCH Release <-> FinalRelease: unique exact hashes, unique sets of
  the strings both binaries hold, unique binary names, then propagation —
  the callees of matched pairs aligned in call order, and the unmatched
  runs between consecutive monotone anchors aligned by a score (the
  instruction hash, the matched callees, the cited strings, the size), a
  differing string set or disjoint matched callees never pairing — until
  nothing more pairs.

Files (tab-separated, sorted by address, hex without 0x). Committed, in
`atlas/gen/` (the cover: ~3 MB):
  <bin>.funcs.tsv    rva end src how name kind match ninsn
  sources.tsv        id path (the source files, numbered)
  meta.json          the binaries' sha256 and sizes, sections, counts, the match rate
Rebuilt on demand, in `atlas/cache/gen/` (gitignored: ~7 MB of cross
references that any install update rewrites wholesale and 35 s rebuild):
  <bin>.xrefs.tsv    rva calls refs strings globals fields
  <bin>.strings.tsv  rva kind text (escaped \\t \\n \\\\) — the strings cited
  <bin>.vtables.tsv  rva slots (function rvas)
"""
from __future__ import annotations

import bisect
import hashlib
import json
import pathlib
import re
import struct
import sys
import time
from collections import Counter, defaultdict

HERE = pathlib.Path(__file__).resolve().parent
for root in HERE.parents:
    lib = root / ".claude" / "scratchpad" / "pylibs"
    if lib.is_dir():
        sys.path.insert(0, str(lib))
        break
import capstone  # noqa: E402
import pefile  # noqa: E402

INSTALL = pathlib.Path(r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VI")
BINARIES = {
    "R": ("GameCore_XP2_Release", INSTALL / "DLC/Expansion2/Binaries/Win64/GameCore_XP2_Release.dll"),
    "F": ("GameCore_XP2_FinalRelease", INSTALL / "DLC/Expansion2/Binaries/Win64/GameCore_XP2_FinalRelease.dll"),
}
GEN = HERE / "atlas" / "gen"
XGEN = HERE / "atlas" / "cache" / "gen"

RIP = re.compile(r"\[rip ([+-]) 0x([0-9a-f]+)\]")
MEM = re.compile(r"\[(\w+)(?: \+ \w+(?:\*\d)?)? ([+-]) (0x[0-9a-f]+|\d+)\]")
ADDR = re.compile(r"0x[0-9a-f]{5,}")
SRC = re.compile(r"\\(?:civ6\\src|civtech|sdksources)\\(.+\.(?:cpp|c|h|hpp|inl))$", re.I)
SCOPE = re.compile(r"^\[?([A-Z][A-Za-z0-9_]*(?:::[A-Za-z_~][A-Za-z0-9_]*)+)(?:\]|$| [a-z]+=|\(\))")
TYPENAME = re.compile(r"^[A-Z][A-Z0-9_]{3,}$")
PAD = (0xCC, 0x90)


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


class Image:
    """One binary: its functions, strings, relocations and per-function facts."""

    def __init__(self, path: pathlib.Path):
        raw = path.read_bytes()
        self.sha256 = hashlib.sha256(raw).hexdigest()
        self.size = len(raw)
        self.pe = pefile.PE(data=raw, fast_load=False)
        self.base = self.pe.OPTIONAL_HEADER.ImageBase
        self.image = self.pe.get_memory_mapped_image()
        self.sections = {s.Name.rstrip(b"\0").decode(): (s.VirtualAddress, s.VirtualAddress + s.Misc_VirtualSize)
                         for s in self.pe.sections}
        self.text = self.sections[".text"]
        self.md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
        self._strings()
        self._relocs()
        self._functions()

    # -- strings ---------------------------------------------------------
    def _strings(self) -> None:
        self.strings: dict[int, tuple[str, str]] = {}
        lo, hi = self.sections[".rdata"]
        lo2, hi2 = self.sections[".data"]
        for a, b in ((lo, hi), (lo2, hi2)):
            seg = self.image[a:b]
            for m in re.finditer(rb"[\x20-\x7e\t\n\r]{4,}\x00", seg):
                self.strings[a + m.start()] = ("a", m.group()[:-1].decode())
            for m in re.finditer(rb"(?:[\x20-\x7e]\x00){4,}\x00\x00", seg):
                if (a + m.start()) % 2 == 0:
                    self.strings.setdefault(a + m.start(), ("w", m.group()[:-2].decode("utf-16-le")))
        self.str_starts = sorted(self.strings)

    def string_at(self, rva: int) -> tuple[int, str, str] | None:
        """the string holding `rva` (a suffix when it points inside one)"""
        k = bisect.bisect_right(self.str_starts, rva) - 1
        if k < 0:
            return None
        s = self.str_starts[k]
        kind, text = self.strings[s]
        off = rva - s
        if kind == "w":
            if off % 2 or off // 2 >= len(text):
                return None
            off //= 2
        if off >= len(text):
            return None
        return (rva, kind, text[off:])

    # -- relocations ------------------------------------------------------
    def _relocs(self) -> None:
        self.ptr_slots: list[int] = []
        for blk in getattr(self.pe, "DIRECTORY_ENTRY_BASERELOC", []):
            for e in blk.entries:
                if e.type == 10:  # IMAGE_REL_BASED_DIR64
                    self.ptr_slots.append(e.rva)
        self.ptr_slots.sort()

    def ptr(self, rva: int) -> int:
        return struct.unpack_from("<Q", self.image, rva)[0] - self.base

    def in_text(self, rva: int) -> bool:
        return self.text[0] <= rva < self.text[1]

    # -- functions --------------------------------------------------------
    def _functions(self) -> None:
        chunks = sorted((e.struct.BeginAddress, e.struct.EndAddress, bool(e.unwindinfo and e.unwindinfo.Flags & 4))
                        for e in getattr(self.pe, "DIRECTORY_ENTRY_EXCEPTION", []))
        funcs: list[tuple[int, int]] = []
        for b, e, chained in chunks:
            if chained and funcs and funcs[-1][1] <= b:
                funcs[-1] = (funcs[-1][0], e)
            else:
                funcs.append((b, e))
        self.pdata_count = len(funcs)
        self.funcs = dict(funcs)
        self._reindex()
        seeds = {p for p in (self.ptr(s) for s in self.ptr_slots if not self.in_text(s)) if self.in_text(p)}
        self.facts: dict[int, dict] = {}
        pending = set(self.funcs)
        while True:
            for f in sorted(pending):
                self.facts[f] = self._scan(f, self.funcs[f])
            new = set()
            for f in pending:
                for t in self.facts[f]["calls"] + self.facts[f]["refs"]:
                    new.add(t)
            new |= seeds
            seeds = set()
            add = {t for t in new if self.in_text(t) and t not in self.funcs and self.func_of(t) is None}
            if not add:
                break
            for t in add:
                self.funcs[t] = t + 1
            self._reindex()
            for t in sorted(add):
                self.funcs[t] = self._leaf_end(t)
            pending = add

    def _reindex(self) -> None:
        self.starts = sorted(self.funcs)

    def func_of(self, rva: int) -> int | None:
        k = bisect.bisect_right(self.starts, rva) - 1
        if k >= 0 and self.starts[k] <= rva < self.funcs[self.starts[k]]:
            return self.starts[k]
        return None

    def _leaf_end(self, start: int) -> int:
        k = bisect.bisect_right(self.starts, start)
        cap = min(self.starts[k] if k < len(self.starts) else self.text[1], start + 0x2000)
        end = start
        for addr, size, mn, _ in self.md.disasm_lite(self.image[start:cap], start):
            end = addr + size
            if mn in ("ret", "jmp", "int3") and (end >= cap or self.image[end] in PAD):
                break
        return max(end, start + 1)

    def _scan(self, start: int, end: int) -> dict:
        calls: list[int] = []
        refs: list[int] = []
        strs: list[int] = []
        globs: list[int] = []
        fields: set[int] = set()
        h = hashlib.blake2b(digest_size=8)
        n = 0
        lo_t, hi_t = self.text
        for addr, size, mn, ops in self.md.disasm_lite(self.image[start:end], self.base + start):
            n += 1
            rva = addr - self.base
            m = RIP.search(ops)
            if m:
                t = rva + size + int(m.group(2), 16) * (1 if m.group(1) == "+" else -1)
                if lo_t <= t < hi_t:
                    refs.append(t)
                else:
                    s = self.string_at(t)
                    if s is not None:
                        strs.append(t)
                    else:
                        globs.append(t)
                ops = RIP.sub("[rip+D]", ops)
            elif ops.startswith("0x") and mn in ("call", "jmp"):
                t = int(ops, 16) - self.base
                if mn == "call" or not (start <= t < end):
                    calls.append(t)
            for mm in MEM.finditer(ops):
                reg, sign, disp = mm.groups()
                if reg in ("rsp", "esp", "rip") or (reg in ("rbp", "ebp") and sign == "-"):
                    continue
                d = int(disp, 0)
                if sign == "+" and d:
                    fields.add(d)
            if mn.startswith("j") or mn == "call":
                ops = ADDR.sub("A", ops)
            h.update(f"{mn} {ops};".encode())
        return {"calls": calls, "refs": refs, "strings": strs, "globals": globs, "fields": sorted(fields),
                "hash": h.hexdigest(), "n": n}

    # -- vtables ------------------------------------------------------------
    def vtables(self) -> dict[int, list[int]]:
        """runs of relocated pointers in .rdata to function starts"""
        lo, hi = self.sections[".rdata"]
        out: dict[int, list[int]] = {}
        run: list[int] = []
        at = None
        prev = None
        for s in self.ptr_slots:
            if not (lo <= s < hi):
                continue
            p = self.ptr(s)
            ok = p in self.funcs
            if ok and prev is not None and s == prev + 8 and run:
                run.append(p)
            elif ok:
                if at is not None and len(run) >= 2:
                    out[at] = run
                at, run = s, [p]
            else:
                if at is not None and len(run) >= 2:
                    out[at] = run
                at, run = None, []
            prev = s
        if at is not None and len(run) >= 2:
            out[at] = run
        return out


def norm_source(path: str) -> str:
    m = SRC.search(path)
    rel = (m.group(1) if m else path.split("\\")[-1]).replace("\\", "/")
    return rel


def attribute(img: Image) -> tuple[dict[int, str], dict[int, str], dict[str, str]]:
    """function -> source file key, method; the key -> its display path"""
    display: dict[str, Counter] = defaultdict(Counter)
    src: dict[int, str] = {}
    how: dict[int, str] = {}
    for f in img.starts:
        c = Counter()
        for s in img.facts[f]["strings"]:
            got = img.string_at(s)
            if got and got[2].lower().endswith((".cpp", ".c")) and SRC.search(got[2]):
                rel = norm_source(got[2])
                c[rel.lower()] += 1
                display[rel.lower()][rel] += 1
        if c:
            src[f] = max(c.items(), key=lambda kv: (kv[1], kv[0]))[0]
            how[f] = "assert"
    order = img.starts
    gaps = []
    k = 0
    while k < len(order):
        if order[k] in src:
            j = k + 1
            while j < len(order) and order[j] not in src:
                j += 1
            if j < len(order) and src[order[j]] == src[order[k]]:
                for i in range(k + 1, j):
                    src[order[i]] = src[order[k]]
                    how[order[i]] = "neighbour"
            elif j > k + 1:
                gaps.append((k, j))
            k = j
        else:
            k += 1
    # between two files' blocks: each block runs on over the gap's functions
    # whose callers and callees are mostly its own, up to the last of them
    callers: dict[int, list[int]] = defaultdict(list)
    for f in order:
        for c in img.facts[f]["calls"]:
            callers[c].append(f)

    def vote(f: int) -> str | None:
        c = Counter(src[x] for x in img.facts[f]["calls"] + callers.get(f, []) if x in src and x != f)
        return max(c.items(), key=lambda kv: (kv[1], kv[0]))[0] if c else None

    for k, j in gaps:
        left = src[order[k]]
        right = src[order[j]] if j < len(order) else None
        votes = [vote(order[i]) for i in range(k + 1, j)]
        last = -1
        for i, v in enumerate(votes):
            if v == left:
                last = i
            elif v is not None:
                break
        first = len(votes)
        for i in range(len(votes) - 1, last, -1):
            if votes[i] == right:
                first = i
            elif votes[i] is not None:
                break
        for i in range(last + 1):
            src[order[k + 1 + i]] = left
            how[order[k + 1 + i]] = "callgraph"
        if right is not None:
            for i in range(first, len(votes)):
                src[order[k + 1 + i]] = right
                how[order[k + 1 + i]] = "callgraph"
    # template / inline code: the header its asserts cite
    for f in order:
        if f in src:
            continue
        c = Counter()
        for s in img.facts[f]["strings"]:
            got = img.string_at(s)
            if got and SRC.search(got[2]):
                rel = norm_source(got[2])
                c[rel.lower()] += 1
                display[rel.lower()][rel] += 1
        if c:
            src[f] = max(c.items(), key=lambda kv: (kv[1], kv[0]))[0]
            how[f] = "header"
    names = {key: max(c.items(), key=lambda kv: (sum(ch.isupper() for ch in kv[0]), kv[1], kv[0]))[0]
             for key, c in display.items()}
    return src, how, names


def binary_names(img: Image) -> dict[int, tuple[str, str]]:
    """function -> (name, kind) from what the binary itself says"""
    out: dict[int, tuple[str, str]] = {}
    exp = getattr(img.pe, "DIRECTORY_ENTRY_EXPORT", None)
    if exp:
        for e in exp.symbols:
            if e.name and e.address in img.funcs:
                out[e.address] = (e.name.decode(), "export")
    # Lua registrars: lea rdx, fn ; lea r8, "Name"
    bindings: dict[int, str] = {}
    for f in img.starts:
        st = img.facts[f]
        if len(st["refs"]) < 3 or len(st["strings"]) < 3:
            continue
        s, e = f, img.funcs[f]
        pending_fn = None
        pairs = []
        for addr, size, mn, ops in img.md.disasm_lite(img.image[s:e], img.base + s):
            if mn != "lea":
                continue
            m = RIP.search(ops)
            if not m:
                continue
            t = addr - img.base + size + int(m.group(2), 16) * (1 if m.group(1) == "+" else -1)
            if ops.startswith("rdx") and t in img.funcs:
                pending_fn = t
            elif ops.startswith("r8") and pending_fn is not None:
                got = img.string_at(t)
                if got and got[1] == "a" and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", got[2]):
                    pairs.append((pending_fn, got[2]))
                pending_fn = None
        if len(pairs) >= 3:
            for fn, name in pairs:
                bindings.setdefault(fn, name)
    for fn, name in bindings.items():
        out.setdefault(fn, (f"l{name}", "lua"))
    use = Counter(c for fn in bindings for c in set(img.facts[fn]["calls"]))
    helpers = {c for c, k in use.items() if k > 8}
    tgt_names: dict[int, set] = defaultdict(set)
    for fn, name in bindings.items():
        own = sorted({c for c in img.facts[fn]["calls"] if c not in helpers and c in img.funcs})
        if len(own) == 1:
            tgt_names[own[0]].add(name)
    for c, ns in tgt_names.items():
        if len(ns) == 1 and c not in out:
            out[c] = (next(iter(ns)), "luatarget")
    # type-name getters: lea rax, "NAME"; ret
    getters: dict[int, str] = {}
    for f in img.starts:
        st = img.facts[f]
        if st["n"] == 2 and len(st["strings"]) == 1:
            ins = list(img.md.disasm_lite(img.image[f:img.funcs[f]], img.base + f))
            if len(ins) == 2 and ins[0][2] == "lea" and ins[0][3].startswith("rax") and ins[1][2] == "ret":
                got = img.string_at(st["strings"][0])
                if got and TYPENAME.match(got[2]):
                    getters[f] = got[2]
    by_name = Counter(getters.values())
    for f, name in getters.items():
        if by_name[name] == 1:
            out.setdefault(f, (f"{name}.name", "typename"))
    slot_of: dict[int, set] = defaultdict(set)
    for vt, slots in img.vtables().items():
        named = [getters[p] for p in slots if p in getters and by_name[getters[p]] == 1]
        if len(named) != 1:
            continue
        for k, p in enumerate(slots):
            if p not in getters:
                slot_of[p].add(f"{named[0]}.v{k}")
    for p, ns in slot_of.items():
        if len(ns) == 1:
            out.setdefault(p, (next(iter(ns)), "vslot"))
    # logs and scope strings
    cites: dict[int, set] = defaultdict(set)
    for f in img.starts:
        for s in img.facts[f]["strings"]:
            cites[s].add(f)
    for s, fs in cites.items():
        got = img.string_at(s)
        if not got:
            continue
        _, kind, text = got
        if kind == "w" and re.fullmatch(r"[A-Za-z0-9_]+\.(csv|txt|log)", text) and len(fs) <= 4:
            for f in fs:
                out.setdefault(f, (f"log {text}", "log"))
        elif kind == "a" and len(fs) == 1:
            m = SCOPE.match(text)
            if m:
                out.setdefault(next(iter(fs)), (m.group(1), "scope"))
    return out


class Matcher:
    def __init__(self, r: Image, f: Image, rnames: dict, fnames: dict):
        self.r, self.f = r, f
        self.r2f: dict[int, int] = {}
        self.f2r: dict[int, int] = {}
        self.how: Counter = Counter()
        common = {t for _, t in r.strings.values()} & {t for _, t in f.strings.values()}
        self.sig = {}
        for img, side in ((r, "r"), (f, "f")):
            d = {}
            for fn in img.starts:
                got = [img.string_at(s) for s in img.facts[fn]["strings"]]
                ss = frozenset(g[2] for g in got if g and g[2] in common)
                if ss:
                    d[fn] = ss
            self.sig[side] = d
        self.rnames, self.fnames = rnames, fnames

    def pair(self, a: int, b: int, how: str) -> bool:
        if a in self.r2f or b in self.f2r:
            return False
        self.r2f[a] = b
        self.f2r[b] = a
        self.how[how] += 1
        return True

    def unique(self, rkey: dict, fkey: dict, how: str) -> int:
        rc = Counter(rkey.values())
        fc = Counter(fkey.values())
        finv = {v: k for k, v in fkey.items() if fc[v] == 1}
        n = 0
        for a, v in sorted(rkey.items()):
            if rc[v] == 1 and v in finv:
                n += self.pair(a, finv[v], how)
        return n

    def run(self) -> None:
        r, f = self.r, self.f
        self.unique({a: r.facts[a]["hash"] for a in r.starts if r.facts[a]["n"] >= 6},
                    {b: f.facts[b]["hash"] for b in f.starts if f.facts[b]["n"] >= 6}, "hash")
        self.unique({a: v for a, v in self.sig["r"].items() if a not in self.r2f},
                    {b: v for b, v in self.sig["f"].items() if b not in self.f2r}, "strings")
        self.unique({a: v[0] for a, v in self.rnames.items() if a not in self.r2f and v[1] != "luatarget"},
                    {b: v[0] for b, v in self.fnames.items() if b not in self.f2r and v[1] != "luatarget"}, "name")
        # the assert handler(s): what nearly every assert-citing Release function calls
        cites = [a for a in r.starts if any((g := r.string_at(s)) and SRC.search(g[2]) for s in r.facts[a]["strings"])]
        use = Counter(c for a in cites for c in set(r.facts[a]["calls"]))
        self.asserts = {c for c, k in use.items() if k * 3 >= len(cites)}
        while True:
            n = self.callees() + self.gaps()
            if not n:
                break

    def _calls(self, img: Image, a: int) -> list[int]:
        return [c for c in img.facts[a]["calls"] if c in img.funcs and (img is not self.r or c not in self.asserts)]

    def score(self, a: int, b: int) -> int:
        """how alike Release `a` and FinalRelease `b` are; below 1 never paired"""
        ra, fb = self.r.facts[a], self.f.facts[b]
        na, nb = ra["n"], fb["n"]
        if not (nb <= na * 1.2 + 4 and na <= nb * 4 + 8):
            return -1
        s = 0
        if ra["hash"] == fb["hash"]:
            s += 6
        ca = {self.r2f[c] for c in self._calls(self.r, a) if c in self.r2f}
        cb = {c for c in self._calls(self.f, b) if c in self.f2r}
        if len(ca) >= 2 and len(cb) >= 2 and not ca & cb:
            return -1
        s += 2 * len(ca & cb) - len(ca ^ cb)
        sa, sb = self.sig["r"].get(a), self.sig["f"].get(b)
        if sa and sb:
            if sa != sb:
                return -1
            s += 4
        elif sa or sb:
            s -= 2
        if len(self._calls(self.r, a)) == len(self._calls(self.f, b)):
            s += 1
        if nb <= na <= nb * 1.5 + 4:
            s += 1
        return s

    def align(self, xs: list[int], ys: list[int], how: str, floor: int) -> int:
        """pair the unmatched of two ordered lists by the best-scoring
        monotone alignment (each pair scoring at least `floor`)"""
        xs = [x for x in xs if x not in self.r2f]
        ys = [y for y in ys if y not in self.f2r]
        if not xs or not ys or len(xs) * len(ys) > 160000:
            return 0
        sc = [[self.score(x, y) for y in ys] for x in xs]
        n, m = len(xs), len(ys)
        best = [[0] * (m + 1) for _ in range(n + 1)]
        for i in range(n - 1, -1, -1):
            row, nxt, si = best[i], best[i + 1], sc[i]
            for j in range(m - 1, -1, -1):
                v = max(nxt[j], row[j + 1])
                if si[j] >= floor:
                    v = max(v, si[j] + nxt[j + 1])
                row[j] = v
        i = j = 0
        got = 0
        while i < n and j < m:
            if sc[i][j] >= floor and best[i][j] == sc[i][j] + best[i + 1][j + 1]:
                got += self.pair(xs[i], ys[j], how)
                i += 1
                j += 1
            elif best[i][j] == best[i + 1][j]:
                i += 1
            else:
                j += 1
        return got

    def callees(self) -> int:
        n = 0
        for a, b in sorted(self.r2f.items()):
            n += self.align(self._calls(self.r, a), self._calls(self.f, b), "callee", 1)
            n += self.align([c for c in self.r.facts[a]["refs"] if c in self.r.funcs],
                            [c for c in self.f.facts[b]["refs"] if c in self.f.funcs], "callee", 1)
        return n

    def gaps(self) -> int:
        pairs = sorted(self.r2f.items())
        keep = lis([b for _, b in pairs])
        anchors = [pairs[i] for i in keep]
        n = 0
        for (a0, b0), (a1, b1) in zip(anchors, anchors[1:]):
            ua = self.r.starts[bisect.bisect_right(self.r.starts, a0):bisect.bisect_left(self.r.starts, a1)]
            ub = self.f.starts[bisect.bisect_right(self.f.starts, b0):bisect.bisect_left(self.f.starts, b1)]
            ua = [x for x in ua if x not in self.r2f]
            ub = [y for y in ub if y not in self.f2r]
            if not ua or not ub:
                continue
            floor = 0 if len(ua) == len(ub) else 2
            n += self.align(ua, ub, "order", floor)
        return n


def lis(seq: list[int]) -> list[int]:
    """indices of a longest strictly increasing subsequence"""
    tails: list[int] = []
    tails_i: list[int] = []
    prev = [-1] * len(seq)
    for i, v in enumerate(seq):
        k = bisect.bisect_left(tails, v)
        if k == len(tails):
            tails.append(v)
            tails_i.append(i)
        else:
            tails[k] = v
            tails_i[k] = i
        prev[i] = tails_i[k - 1] if k else -1
    out = []
    i = tails_i[-1] if tails_i else -1
    while i >= 0:
        out.append(i)
        i = prev[i]
    return out[::-1]


def hx(v: int) -> str:
    return f"{v:x}"


def write_tsv(path: pathlib.Path, header: list[str], rows) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\t".join(header) + "\n")
        for row in rows:
            fh.write("\t".join(row) + "\n")


def generate(log=print) -> dict:
    t0 = time.time()
    GEN.mkdir(parents=True, exist_ok=True)
    XGEN.mkdir(parents=True, exist_ok=True)
    imgs = {}
    for k, (_, path) in BINARIES.items():
        imgs[k] = Image(path)
        log(f"{path.name}: {len(imgs[k].starts)} functions ({imgs[k].pdata_count} from .pdata) "
            f"{time.time() - t0:.1f}s")
    r, f = imgs["R"], imgs["F"]
    names = {k: binary_names(img) for k, img in imgs.items()}
    rsrc, rhow, display = attribute(r)
    fsrc, fhow, fdisplay = attribute(f)
    for key, d in fdisplay.items():
        display.setdefault(key, d)
    # one spelling per directory (the asserts cite some paths in lower case)
    spell: dict[str, Counter] = defaultdict(Counter)
    for d in display.values():
        parts = d.split("/")[:-1]
        for i in range(1, len(parts) + 1):
            spell["/".join(parts[:i]).lower()]["/".join(parts[:i])] += 1
    canon = {k: max(c.items(), key=lambda kv: (sum(ch.isupper() for ch in kv[0]), kv[1], kv[0]))[0]
             for k, c in spell.items()}
    display = {k: (canon[d.rsplit("/", 1)[0].lower()] + "/" + d.rsplit("/", 1)[1]) if "/" in d else d
               for k, d in display.items()}
    m = Matcher(r, f, names["R"], names["F"])
    m.run()
    for b in f.starts:
        if b not in fsrc and b in m.f2r and m.f2r[b] in rsrc:
            fsrc[b] = rsrc[m.f2r[b]]
            fhow[b] = "match"
    log(f"matched {len(m.r2f)} ({dict(m.how)}) {time.time() - t0:.1f}s")
    keys = sorted(set(rsrc.values()) | set(fsrc.values()))
    sid = {key: i + 1 for i, key in enumerate(keys)}
    write_tsv(GEN / "sources.tsv", ["id", "path"], ([str(sid[k]), display[k]] for k in keys))
    meta = {"binaries": {}, "match": {"pairs": len(m.r2f), "by": dict(sorted(m.how.items()))}}
    for k, img in imgs.items():
        stem = BINARIES[k][0]
        src, how = (rsrc, rhow) if k == "R" else (fsrc, fhow)
        match = m.r2f if k == "R" else m.f2r
        nm = names[k]
        write_tsv(GEN / f"{stem}.funcs.tsv", ["rva", "end", "src", "how", "name", "kind", "match", "ninsn"],
                  ([hx(a), hx(img.funcs[a]), str(sid[src[a]]) if a in src else "", how.get(a, ""),
                    esc(nm[a][0]) if a in nm else "", nm[a][1] if a in nm else "",
                    hx(match[a]) if a in match else "", str(img.facts[a]["n"])]
                   for a in img.starts))
        write_tsv(XGEN / f"{stem}.xrefs.tsv", ["rva", "calls", "refs", "strings", "globals", "fields"],
                  ([hx(a)] + [" ".join(hx(v) for v in sorted(set(img.facts[a][c]))) for c in
                              ("calls", "refs", "strings", "globals", "fields")] for a in img.starts))
        cited = sorted({s for a in img.starts for s in img.facts[a]["strings"]})
        write_tsv(XGEN / f"{stem}.strings.tsv", ["rva", "kind", "text"],
                  ([hx(s), g[1], esc(g[2])] for s in cited for g in [img.string_at(s)] if g))
        write_tsv(XGEN / f"{stem}.vtables.tsv", ["rva", "slots"],
                  ([hx(v), " ".join(hx(p) for p in slots)] for v, slots in sorted(img.vtables().items())))
        meta["binaries"][stem] = {
            "file": str(BINARIES[k][1].relative_to(INSTALL)).replace("\\", "/"), "sha256": img.sha256,
            "bytes": img.size, "image_base": hex(img.base), "functions": len(img.starts), "pdata": img.pdata_count,
            "sections": {k: [hex(a), hex(b)] for k, (a, b) in sorted(img.sections.items())},
            "with_source": len(src), "source_by": dict(sorted(Counter(how.values()).items())),
            "named": len(nm), "names_by": dict(sorted(Counter(v[1] for v in nm.values()).items())),
            "matched": len(match)}
    with open(GEN / "meta.json", "w", encoding="utf-8", newline="\n") as fh:
        json.dump(meta, fh, indent=1, sort_keys=True)
        fh.write("\n")
    log(f"written {GEN} in {time.time() - t0:.1f}s")
    return meta


if __name__ == "__main__":
    generate()
