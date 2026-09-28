"""Find the vtables in GameCore_XP2_Release.dll's .rdata that point into a
code range (runs of 8-byte pointers to function starts), and print them
labelled, to name a virtual call's target.

    python tools/civ6lab/dll_vtab.py LO HI [--min 4]
"""
from __future__ import annotations

import argparse
import struct

from dll_q import DEFAULT, Q


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("lo")
    ap.add_argument("hi")
    ap.add_argument("--min", type=int, default=4)
    a = ap.parse_args()
    lo, hi = int(a.lo, 16), int(a.hi, 16)
    q = Q(DEFAULT)
    d = q.d
    starts = set(d.starts)
    rdata = next(s for s in d.pe.sections if s.Name.rstrip(b"\0") == b".rdata")
    base, size = rdata.VirtualAddress, rdata.Misc_VirtualSize
    img = d.image
    k = base
    while k < base + size - 8:
        run = []
        j = k
        while j < base + size - 8:
            p = struct.unpack_from("<Q", img, j)[0] - d.base
            if p in starts:
                run.append((j, p))
                j += 8
            else:
                break
        if len(run) >= a.min and any(lo <= p < hi for _, p in run):
            print(f"vtable @{k:08x} ({len(run)} slots)")
            for s, (j2, p) in enumerate(run):
                print(f"   [{s:2d}] +{8 * s:#05x} {p:08x} {q.flabel(p)}")
        k = j + 8 if run else k + 8
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
