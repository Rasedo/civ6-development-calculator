# ROUND B5 — Slice M2 log (B-4 XP and levels)

Round base: 16d017bad62360452839830cf7d3686376de58ea

## Task
AUDIT B-4 — Unit.xp on player+rival units (barbs none); +5/attack executed,
+2/surviving defender per attack received (incl. city/walls strikes);
XP_LEVELS [15,45,90] → +5 CS/level at every roll the unit fights; entering CS
assembly like B-7 terms (once, before paired rolls, preserved by B-29 quant).
bestMeleeCS/r_best_melee stay base-CS. GPU p_xp/v_xp planes with full
_MUTABLE/snapshot/_reclaim_pool discipline (mirror p_fortify). Ownership
transfers (B-31 capture, embarked) carry xp. Extend combat_mod_test.py ref.

## Deviations from brief (logged, not silent)
- **Exp table widened 1201 -> 4001** (offset 600 -> 2000, diff range +-60 -> +-200).
  B-29's ROUND_B3_LOG note relied on wounds/river only SHRINKING |diff|, so the
  +-60 clamp was unreachable. XP ADDS up to +15 CS to the attacker, which pushes
  |diff| past 60 once a unit hits level 2/3 vs a weak/wounded defender (base
  HORSEMAN 36 +15 +flank - negative def_e ~ 69; post-M1-merge MUSKETMAN 55 pushes
  ~90). TS damageRoll has NO clamp, so the GPU clamp would diverge. Widened the
  shared exp table in export-gpu.ts, engine.py (load default + _damage_roll
  index/clamp) and combat_mod_test.py. Not in the brief but required for
  correctness once units level up in-gate.
- Attacker +5 accrues on any attack that produces a damage ROLL (melee/ranged vs
  unit/city/CS/rc, incl. ranged-vs-lone-civilian which rolls). The roll-free
  B-31 civilian CAPTURE grants NO xp (matches "we don't model capture as combat"
  + real Civ6 no-xp-on-capture). Defender +2 accrues only to surviving MILITARY
  defenders (civilians never fight -> stay xp 0), guarding barbs out.
- xp NOT plumbed through the exporter/fixture: seed fixtures are turn-0 scaffolds
  (no units list; units spawn at start at xp 0), exactly like p_fortify/p_emb
  which are also unexported. GPU p_xp/v_xp init to 0; no barb (u pool) plane.

## Progress
- Anchor commit created.
- Surveyed all combat sites (TS combat.ts + rivals.ts; GPU engine.py 12 roll
  tags). Plan: attacker +5 & attacker level-bonus in atk CS; defender +2 &
  defender level-bonus in def CS (dropped when embarked, like B-7 support).
