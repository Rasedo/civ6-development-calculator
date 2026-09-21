"""Extract the GDR anti-air promotion's magnitude and what grants it.

PROMOTION_GDR_AA_DEFENSE carries ModifierId GDR_AA_DEFENSE of type
MODIFIER_SINGLE_UNIT_ADJUST_ANTI_AIR_STRENGTH_MODIFIER. The XML writes modifier
arguments as child ELEMENTS, so a line grep for Amount="..." finds nothing —
this walks the file and prints the argument block that belongs to that id, plus
whatever grants the promotion.
"""
import io
import re
import sys

BASE = (r"C:\Program Files (x86)\Steam\steamapps\common"
        r"\Sid Meier's Civilization VI\DLC\Expansion2\Data")
FILES = [rf"{BASE}\Expansion2_UnitPromotions.xml", rf"{BASE}\Expansion2_Modifiers.xml",
         rf"{BASE}\Expansion2_Technologies.xml", rf"{BASE}\Expansion2_Units.xml"]

TARGET = "GDR_AA_DEFENSE"
for path in FILES:
    try:
        text = io.open(path, encoding="utf-8", errors="replace").read()
    except OSError:
        continue
    # every <Row>...</Row> that mentions the id
    for m in re.finditer(r"<Row>(.*?)</Row>", text, re.S):
        block = m.group(1)
        if TARGET in block:
            flat = " ".join(x.strip() for x in block.split())
            print(f"[{path.split(chr(92))[-1]}] {flat[:300]}")
print("\n--- what grants the promotion ---")
for path in FILES:
    try:
        text = io.open(path, encoding="utf-8", errors="replace").read()
    except OSError:
        continue
    for m in re.finditer(r"<Row>(.*?)</Row>", text, re.S):
        block = m.group(1)
        if "PROMOTION_GDR_AA_DEFENSE" in block and "Modifier" not in block:
            flat = " ".join(x.strip() for x in block.split())
            print(f"[{path.split(chr(92))[-1]}] {flat[:300]}")
