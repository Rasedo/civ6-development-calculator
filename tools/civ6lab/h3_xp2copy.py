"""H-3: carry Gathering Storm's map scripts and every map utility they load
into the probe mod under civ6lab_xp2_* names, with the includes rewritten to
those names, write a natives probe over each script
(civ6lab_mapprobe_natives_<script>.lua) and list every Maps/*.lua in the
modinfo. A map script run from a mod resolves `include` to the Base files,
so a probe that includes "Continents" runs the Base script and Base
utilities; the renamed copies pin the Expansion2 versions (modinfo order:
Base <- Expansion1 <- Expansion2).

    python tools/civ6lab/h3_xp2copy.py
"""
from __future__ import annotations

import pathlib
import re

INSTALL = pathlib.Path(r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VI")
LAYERS = [INSTALL / "Base/Assets/Maps", INSTALL / "Base/Assets/Maps/Utility",
          INSTALL / "DLC/Expansion1/Maps", INSTALL / "DLC/Expansion1/Maps/Utility",
          INSTALL / "DLC/Expansion2/Maps", INSTALL / "DLC/Expansion2/Maps/Utility"]
MOD = pathlib.Path(__file__).parent / "h3_mapprobe_mod"
OUT = MOD / "Maps"
INC = re.compile(r'^(\s*include\s*\(?\s*")([^"]+)("\s*\)?)', re.M)
# the Gathering Storm map scripts; Continents is the natives probe's default
SCRIPTS = ["Continents", "Pangaea", "Fractal", "Island_Plates", "Small_Continents", "Terra", "Seven_Seas",
           "Shuffle", "Splintered_Fractal", "Primordial", "InlandSea", "Lakes", "Tilted_Axis",
           "Continents_Islands"]
FILES = re.compile(r"(<(ImportFiles[^>]*|Files)>)(.*?)(\s*</(ImportFiles|Files)>)", re.S)


def resolve(name: str) -> pathlib.Path:
    stem = name[:-4] if name.lower().endswith(".lua") else name
    hit = None
    for d in LAYERS:
        if not d.exists():
            continue
        for f in d.iterdir():
            if f.suffix.lower() == ".lua" and f.stem.lower() == stem.lower():
                hit = f
    if hit is None:
        raise FileNotFoundError(name)
    return hit


def write(path: pathlib.Path, txt: str) -> None:
    path.write_bytes(txt.replace("\r\n", "\n").encode("utf-8"))


def main() -> int:
    todo, done = list(SCRIPTS), {}
    while todo:
        name = todo.pop()
        stem = (name[:-4] if name.lower().endswith(".lua") else name).lower()
        if stem in done:
            continue
        src = resolve(name)
        done[stem] = src
        todo += [m.group(2) for m in INC.finditer(src.read_text(encoding="utf-8", errors="replace"))]
    for stem, src in done.items():
        txt = src.read_text(encoding="utf-8", errors="replace")
        txt = INC.sub(lambda m: m.group(1) + "civ6lab_xp2_" +
                      (m.group(2)[:-4] if m.group(2).lower().endswith(".lua") else m.group(2)).lower() + m.group(3), txt)
        out = OUT / f"civ6lab_xp2_{stem}.lua"
        write(out, txt)
        print(f"{out.name} <- {src.relative_to(INSTALL)}")
    for s in SCRIPTS[1:]:
        write(OUT / f"civ6lab_mapprobe_natives_{s.lower()}.lua",
              f"-- civ6lab_mapprobe_natives over Gathering Storm's {s}.lua\n"
              f'CIV6LAB_SCRIPT = "civ6lab_xp2_{s.lower()}"\n'
              'include "civ6lab_mapprobe_natives"\n')
    names = sorted(f.name for f in OUT.glob("*.lua"))
    mi = MOD / "civ6lab_mapprobe.modinfo"
    lst = "".join(f"\n\t\t\t<File>Maps/{n}</File>" for n in names)
    txt = mi.read_text(encoding="utf-8")
    txt = FILES.sub(lambda m: m.group(1) + (lst if "Import" in m.group(1) else lst.replace("\n\t\t\t", "\n\t\t"))
                    + m.group(4), txt)
    write(mi, txt)
    print(f"modinfo lists {len(names)} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
