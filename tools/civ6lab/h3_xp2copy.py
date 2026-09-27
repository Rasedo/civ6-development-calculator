"""H-3: carry Gathering Storm's Continents and every map utility it loads
into the probe mod under civ6lab_xp2_* names, with the includes rewritten
to those names. A map script run from a mod resolves `include` to the Base
files, so a probe that includes "Continents" runs the Base script and Base
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
OUT = pathlib.Path(__file__).parent / "h3_mapprobe_mod" / "Maps"
INC = re.compile(r'^(\s*include\s*\(?\s*")([^"]+)("\s*\)?)', re.M)


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


def main() -> int:
    todo, done = ["Continents"], {}
    while todo:
        name = todo.pop()
        stem = (name[:-4] if name.lower().endswith(".lua") else name).lower()
        if stem in done:
            continue
        src = resolve(name)
        done[stem] = src
        todo += [m.group(2) for m in INC.finditer(src.read_text(encoding="utf-8", errors="replace"))]
    files = []
    for stem, src in done.items():
        txt = src.read_text(encoding="utf-8", errors="replace")
        txt = INC.sub(lambda m: m.group(1) + "civ6lab_xp2_" +
                      (m.group(2)[:-4] if m.group(2).lower().endswith(".lua") else m.group(2)).lower() + m.group(3), txt)
        out = OUT / f"civ6lab_xp2_{stem}.lua"
        out.write_text(txt, encoding="utf-8")
        files.append(out.name)
        print(f"{out.name} <- {src.relative_to(INSTALL)}")
    old = OUT / "civ6lab_continents_xp2.lua"
    if old.exists():
        old.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
