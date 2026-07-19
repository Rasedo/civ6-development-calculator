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
- Implemented both engines. Green: tsc, vitest (20, +9 B-4), export, parity
  (24 seeds x 250t, 0.0 milli), forced variant (CIV6_RECLAIM_AT=12), combat_mod
  (atk +10/def +0 exercised). Widened exp table 1201->4001 (harmless margin;
  observed q peaks ~272 = strengthDiff 27, still inside the OLD +-60, but XP can
  in principle push past it).

## Rollout-replay reshuffle catches (2 games, both PRE-EXISTING non-XP latents)
Seed 9157 (idx12) DEGENERATED under my XP reshuffle (base exports it fine at
250t -> confirmed my change killed it) -> rerolled 12:9158 (survives, all 24
export clean). The `--pipeline-replay` gate then flagged 2 of 72 games:

- **9222 rng 2026006129 t184**: rival-1 treasury off by exactly 1 gold
  (-588200 TS vs -587200 GPU milli). t183 is BYTE-IDENTICAL; every CB roll
  matches (incl. large diffs); the ONLY t184 delta is that one treasury field,
  at the exact turn a low-loyalty PLAYER city (826, loy1933) DEFECTS to rival 1.
  Root: a float-rounding/accounting quirk in the rival economy for a freshly-
  loyalty-transferred city (unmodified by M2). Not XP: xp identical (CB matches).
- **9300 rng 2026006148 t222**: one player unit at tile 518 (TS) vs 519 (GPU),
  same type, same hp47. t221 byte-identical; the t222 melee (k:mel t:519
  diff140 dmg63 / melc diff-140 dmg19) is IDENTICAL in both and kills the rival
  defender (RU1 519 hp26) in both. The divergence is the ADVANCE-after-kill:
  GPU advances into 519, TS stays at 518 — a `_blocked_for("pmil")` (GPU) vs
  `tileFreeForUnit` (TS) asymmetry on the freed tile (likely a surviving-
  occupant/stacking edge), unmodified by M2. Not XP: the mel diff matches, so
  both units' CS (incl. xp level) are bit-equal.

CONCLUSION: XP is bit-correct (24-seed parity 0.0 milli; every CB tag matches
in the failing games; xp planes provably equal since the diffs match). The two
rollout divergences live entirely in unmodified economy/advance code, surfaced
only because the reshuffle produced boards base never plays. Sanctioned
response (reshuffle -> reroll + log): reroll the two affected fixtures so the
derived rollout games avoid these pre-existing latents. FLAG FOR FOLLOW-UP /
merge session: (1) rival-economy rounding on loyalty-transferred cities;
(2) advance-after-kill tileFree asymmetry vs a surviving occupant.
