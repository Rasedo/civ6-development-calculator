"""H-1 / C-93: every draw GameCore_XP2_Release.dll takes from the game's
synchronous generator, by the label the call passes (the generator's get
0x8b6c10(rng, max, label); the weighted pickers that wrap it pass their own
label through r8 as well): the call site, its function (labelled by the
strings it cites) and the label. A label names the subsystem a draw belongs
to, so the list is the per-event draw inventory.

    python tools/civ6lab/dll_rng.py [--grep REGEX] [--wrappers]
"""
from __future__ import annotations

import argparse
import re

from dll_q import DEFAULT, Q

GET = 0x8B6C10


def label_before(q: Q, f, call_rva: int, reg: str = "r8") -> str | None:
    ins = [i for i in q.d.dis(f[0], call_rva + 1) if i.address - q.d.base < call_rva]
    for i in reversed(ins[-40:]):
        if i.mnemonic == "lea" and i.op_str.startswith(reg + ", [rip"):
            return q.str_at.get(q.target(i))
        if i.mnemonic == "call":
            return None
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--grep", default="")
    ap.add_argument("--wrappers", action="store_true", help="also list the callers of each unlabelled wrapper")
    a = ap.parse_args()
    q = Q(DEFAULT)
    pat = re.compile(a.grep, re.I) if a.grep else None
    rows = []
    wrappers = set()
    for c in q.d.calls_to(GET):
        f = q.d.func_of(c)
        if not f:
            continue
        lab = label_before(q, f, c)
        if lab is None:
            wrappers.add(f[0])
        rows.append((lab or "(passed in)", c, f[0]))
    if a.wrappers:
        for w in sorted(wrappers):
            for c in q.d.calls_to(w):
                f = q.d.func_of(c)
                if not f:
                    continue
                lab = label_before(q, f, c)
                rows.append((f"{lab or '(passed in)'} via {w:08x}", c, f[0]))
    # the functor thunks (a tail jump into the get) handed to the weighted
    # pickers: every function taking one, with the labels it passes in r8
    thunks = []
    t = __import__("numpy").frombuffer(q.d.text, dtype="uint8")
    for off in __import__("numpy").nonzero(t[:-5] == 0xE9)[0]:
        disp = int.from_bytes(q.d.text[off + 1:off + 5], "little", signed=True)
        if q.d.text_rva + off + 5 + disp == GET:
            f = q.d.func_of(q.d.text_rva + off)
            if f:
                thunks.append(f[0])
    for th in thunks:
        seen = set()
        for r in q.d.refs_to(th):
            f = q.d.func_of(q.d.text_rva + r)
            if not f or f[0] in seen:
                continue
            seen.add(f[0])
            ins = q.d.dis(f[0], f[1])
            for k, i in enumerate(ins):
                if i.mnemonic == "lea" and i.op_str.startswith("r8, [rip"):
                    s = q.str_at.get(q.target(i))
                    if s and "\\" not in s and not s.startswith("!") and any(
                            j.mnemonic == "call" for j in ins[k + 1:k + 6]):
                        rows.append((f"{s} (picker, thunk {th:08x})", i.address - q.d.base, f[0]))
    for lab, c, f0 in sorted(rows):
        line = f"{lab:50s} call {c:08x} in {f0:08x} {q.flabel(f0)}"
        if not pat or pat.search(line):
            print(line)
    print(f"{len(rows)} draw sites; wrappers passing a label through: {', '.join(f'{w:08x}' for w in sorted(wrappers))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
