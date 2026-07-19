# ROUND B5 Slice M3 — best-of-roster scripted rival production ladder — LOG

Round base: 1041ecc (M1 + M2 already merged).

## Charter

Make the SCRIPTED rival production ladder (and the A-5r gold-buy roster)
best-of-roster so rivals actually field the B-10 units (SWORDSMAN..MUSKETMAN).
Deterministic rule, no new RNG:
- melee lane: combat>0, no ranged, not naval → highest combat.
- ranged lane: has ranged → highest ranged strength.
- gated by tech-unlock + (if requiresResource) strategic access.
- tie → STRICT `>` scan in UNITS-table order (lowest index wins; HORSEMAN
  precedes SWORDSMAN so the 36-combat tie keeps HORSEMAN = current behavior).
- BUILDER/SCOUT/naval never win. wantRanged ratio logic unchanged.

## Plan / work zones (grep-located)

- TS RIVAL_BUY_UNITS (src/core/rivals.ts ~98): extend with SWORDSMAN/PIKEMAN/
  CROSSBOWMAN/KNIGHT/MUSKETMAN in UNITS-table order. Buy loop (~1706) already
  ranks by combat with strict `>` and gates requiresResource — verify.
- TS ladder chooser (rivals.ts ~1591 `const meleeType = canHorse`): replace
  the hardcoded warrior/spearman/horseman + slinger/archer chooser with a
  data-driven scan over UNITS.
- GPU scripted ladder (engine.py ~8024 `ty`/`ty_rng`): replace the hardcoded
  has_h/has_s ladder with a batched argmax (combat·NU − idx) over the unit
  tables, tech (r_techs, full tree, via _p_tech) + resource (res_ok_r) gated.
- GPU A-5r buy block ok_u5 (~8427): data-drive to combat>0 & !naval & tech &
  res (== the extended RIVAL_BUY_UNITS, scout dominated by warrior).
- player bestMilitary (~9723) already data-driven — verify only.
- controlled rival_masks ok_u (~5446) — VERIFY (see findings).
