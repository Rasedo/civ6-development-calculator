"""THE NAMED FIELDS of the game's player and city objects, read off their
constructors (FinalRelease): each `m_` name a constructor cites and the
offset of the watched member it initialises next (`lea rcx, [rsi + X]`
after the name, the member's value at X + 0x10), to the next member. The
table is generated once from the DLL (`gen`) and committed
(`aimem_fields.json`); `aimem.py` reads it, so a recording needs no
disassembler.

    python tools/civ6lab/aimem_fields.py gen      # rewrite aimem_fields.json
    python tools/civ6lab/aimem_fields.py show PlayerStats

The objects (player component offsets, FinalRelease): PlayerStats +0x710
(0x326250), PlayerGreatPeoplePoints +0x740 (0x2e0ec0), PlayerInfluence
+0x748 (0x2e6d40), Player::Resources +0x700 (0x31b820), PlayerTreasury
+0x780 (0x33fe30), PlayerDiplomacy +0x6e0 (0x2952d0), Player::Cities +0x6d0
(0x262590), PlayerCulture +0x6f0 (0x273c30), PlayerTechs +0x718 (0x331aa0),
PlayerReligion +0x720 (0x3103d0), PlayerEras +0x738 (0x2c9030),
CulturalIdentity +0x770 (0x26de90), Player::Units +0x6c8 (0x347bd0); a City
(Player::Cities +0xd0's list, node +0 the city, +0x10 the next; 0x127de0); a CityBuild
(the city AI manager's list, 0x3db2f0).
"""
from __future__ import annotations

import functools
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "aimem_fields.json"
DLL = (r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VI\DLC\Expansion2\Binaries\Win64"
       r"\GameCore_XP2_FinalRelease.dll")
# object name -> (its constructor RVA, the player component offset; None: a city)
OBJECTS = {
    "PlayerStats": (0x326250, 0x710), "PlayerGreatPeoplePoints": (0x2E0EC0, 0x740), "PlayerInfluence": (0x2E6D40, 0x748),
    "PlayerResources": (0x31B820, 0x700), "PlayerTreasury": (0x33FE30, 0x780), "PlayerDiplomacy": (0x2952D0, 0x6E0),
    "PlayerCities": (0x262590, 0x6D0), "PlayerCulture": (0x273C30, 0x6F0), "PlayerTechs": (0x331AA0, 0x718),
    "PlayerReligion": (0x3103D0, 0x720), "PlayerEras": (0x2C9030, 0x738), "CulturalIdentity": (0x26DE90, 0x770),
    "PlayerUnits": (0x347BD0, 0x6C8), "City": (0x127DE0, None), "CityBuild": (0x3DB2F0, None),
}
LEA = re.compile(r"^(r(?:cx|bx|di|14|15|13|12)), \[(r(?:si|di|bx|14|15|13|12)) \+ (0x[0-9a-f]+)\]$")


def ctor_fields(q, rva: int) -> list[list]:
    """[name, offset, size] per watched member, its size to the next member
    (the last 0x18)"""
    f = q.d.func_of(rva)
    out, name, seen = [], None, set()
    for i in q.d.dis(f[0], f[1]):
        t = q.target(i)
        if t is not None and t in q.str_at and q.str_at[t].startswith("m_"):
            name = q.str_at[t]
            continue
        m = LEA.match(i.op_str) if i.mnemonic == "lea" else None
        if name and m:
            off = int(m.group(3), 16)
            if off not in seen:
                out.append([name, off])
                seen.add(off)
            name = None
    out.sort(key=lambda x: x[1])
    return [[n, o, (out[k + 1][1] if k + 1 < len(out) else o + 0x18) - o] for k, (n, o) in enumerate(out)]


def gen() -> int:
    sys.path.insert(0, str(HERE))
    from dll_q import Q  # noqa: PLC0415
    q = Q(DLL)
    table = {name: {"ctor": hex(rva), "component": hex(comp) if comp is not None else None, "fields": ctor_fields(q, rva)}
             for name, (rva, comp) in OBJECTS.items()}
    OUT.write_text(json.dumps(table, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{OUT}: {sum(len(v['fields']) for v in table.values())} fields over {len(table)} objects")
    return 0


@functools.lru_cache(maxsize=1)
def load() -> dict:
    return json.loads(OUT.read_text(encoding="utf-8"))


if __name__ == "__main__":
    if sys.argv[1:2] == ["gen"]:
        sys.exit(gen())
    t = load()[sys.argv[2]]
    for n, o, s in t["fields"]:
        print(f"{o:#06x} {s:#06x} {n}")
