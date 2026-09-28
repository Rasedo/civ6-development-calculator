"""Name the 32-bit type hashes the DLL compares against: every Type / Name
string in the install's gameplay XML and every upper-case string in
the DLL hashed as the game hashes a type (CRC32 without its
final inversion: TERRAIN_GRASS 0x83e7c630, as the game reports), and the matches printed.

    python tools/civ6lab/dll_hash.py 0x8a32007d [0x...]
"""
from __future__ import annotations

import pathlib
import re
import sys
import zlib

INSTALL = pathlib.Path(r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VI")


def civ6(s: bytes) -> int:
    return zlib.crc32(s) ^ 0xFFFFFFFF


def names() -> set[str]:
    out: set[str] = set()
    pat = re.compile(r'"([A-Z][A-Z0-9_]{3,})"|>([A-Z][A-Z0-9_]{3,})<')
    for d in ("Base/Assets/Gameplay/Data", "DLC/Expansion1/Data", "DLC/Expansion2/Data"):
        for p in (INSTALL / d).rglob("*.xml"):
            for m in pat.finditer(p.read_text(encoding="utf-8", errors="replace")):
                out.add(m.group(1) or m.group(2))
    dll = INSTALL / "DLC/Expansion2/Binaries/Win64/GameCore_XP2_Release.dll"
    for m in re.finditer(rb"[A-Z][A-Z0-9_]{3,}(?=\x00)", dll.read_bytes()):
        out.add(m.group().decode())
    return out


def main() -> None:
    want = {int(a, 16) for a in sys.argv[1:]}
    fns = {"civ6": civ6}
    for n in sorted(names()):
        b = n.encode()
        for fname, f in fns.items():
            h = f(b)
            if h in want:
                print(f"{h:#010x} {fname} {n}")


if __name__ == "__main__":
    main()
