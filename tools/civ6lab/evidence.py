"""Strength of evidence for each test round.

A finite number of rounds can be run, so every claim should carry how unlikely
its evidence is under a stated null rather than a verbal grade. Two kinds of
round appear in this lab:

  EXACT   a pre-registered integer prediction (damage, a strength, a draw count).
          Null: the model is wrong and the observed integer is drawn uniformly
          from a plausible window of width W. p = 1/W per hit; k independent
          hits give p = W^-k.

  BINARY  a pre-registered outcome (intercepted / landed, or which of two rival
          models matched). Null: a coin. p = 0.5 per hit.

The window W must be stated honestly: for bomber damage it is the range the
mechanic can produce at all (here 20..100 -> W = 81), not the range the model
predicts.

Both kinds combine by multiplying p under independence, which holds here because
each round is a separate seeded scene.
"""
import json
import math
import sys


def exact_p(width, hits):
    return width ** (-hits)


def binary_p(hits):
    return 0.5 ** hits


ROUNDS = [
    # (claim, kind, detail, hits, width)
    ("RNG state recurrence", "exact", "8 seed->seed pairs reproduced bit-exactly", 8, 2 ** 32),
    ("RNG range fold", "exact", "18 (range,draw) pairs, incl. the 16-bit truncation", 18, 32768),
    ("RNG stream", "exact", "24 consecutive draws from one seed", 24, 32768),
    ("combat multiplier 0.8+0.4u", "exact",
     "3 damages reproduced by one base; rival 0.9+0.2u excluded by the ratio band", 3, 81),
    ("espionage roll is 3d6", "exact",
     "4 base values, cumulative success matches P(3d6>=base-2) to 1.5/256", 4, 256),
    ("population loss rule", "exact", "15 strikes, exact population predicted each", 15, 20),
    ("goody hut category = floor(6u)", "binary",
     "2 pre-registered category hits (1/6 each, so this is conservative)", 2, None),
    ("interception: damage>50 cancels", "binary",
     "8 rounds, outcome matched the damage threshold every time", 8, None),
    ("interception: AA-strength law", "exact",
     "3 pre-registered exact damages: AA gun 29, wounded SAM 35, GDR 29", 3, 81),
    ("interception: support = +5/unit", "exact",
     "4 support values read as text (+0/+5/+10/+15) matching the inferred law", 4, 20),
    ("interception: strongest unit fires", "binary",
     "healthy+wounded gave the healthy value, tile order changed nothing, and the "
     "preview NAMES the chosen unit (SAM 100 chosen over AA gun 90)", 2, None),
    ("weapon type does not change the AA attack", "exact",
     "nuclear device matched the thermonuclear at 3 draws (43/49/52) INCLUDING a "
     "threshold crossing", 3, 81),
    # RETRACTED 2026-09-21 by the steelman battery: the stop is not unconditional,
    # it is the ordinary combat roll. Kept as a row with hits=0 so the ledger shows
    # the claim was withdrawn rather than quietly deleted.
    ("RETRACTED: ICBM delivery cannot beat an interceptor", "binary",
     "29 rounds all intercepted -- but every one used a HIGH-strength interceptor, "
     "for which the leak probability is exactly zero. A 1 HP Anti-Air Gun let 20 "
     "of 20 silo launches through. Superseded by the ICBM damage law below", 0, None),
    ("RETRACTED: naval AA is defensive, not area cover", "binary",
     "a Missile Cruiser on water covers an adjacent LAND aim plot, tested at four "
     "different land aims; so do the Destroyer and the Battleship. The earlier "
     "negative was a bad scene", 0, None),
    ("every anti-air unit covers exactly one ring", "exact",
     "7 units x 3 distances read from the preview: all seven cover d=1 and none "
     "covers d=2 or d=3, land and sea alike", 7, 3),
    ("ICBM interception is the ORDINARY combat roll", "exact",
     "60 pre-registered rounds over 5 configurations, seeds chosen so the draw "
     "takes every value 0..11 exactly once: damage = round((24+n)*1.04^(S-D)), "
     "cancelled iff damage > 50, with D = 72 for a silo and 77 for a submarine. "
     "60/60 correct, including the exact >50 boundary (50 lands, 52 stops)", 60, 2),
    ("launch DISTANCE does not change an ICBM's odds", "exact",
     "silo fixed, aim moved: three aims at distance 2, 4 and 6 with the same "
     "terrain bonus give the SAME flip point, so the same warhead defence; the "
     "two aims that looked like a distance effect were a jungle hill and bare "
     "grassland", 3, 12),
    ("the AIM PLOT's defence modifier is subtracted from the warhead", "exact",
     "D = base - (terrain + feature DefenseModifier): +6 gives D~69, +3 gives "
     "D~72, 0 gives D~75. Pre-registered at 4 aims x 4 draws: exactly the 2 "
     "predicted stops out of 20, and the submarine moved the predicted 3 points "
     "when the aim changed from +3 to +6. The BOMBER channel is unaffected "
     "(54 damage at both a +3 and a +6 aim). Only the DIFFERENCE is observable, "
     "so this is equally 'the interceptor, as defender of the struck tile, gains "
     "the tile's terrain bonus'", 22, 2),
    ("the health penalty is 10 * (1 - hp/100), MEASURED not assumed", "exact",
     "bomber preview read at 16 healths: the damage ladder 36..25 steps exactly "
     "where S = 90 - c*(1 - hp/100) puts it, confining c to about [9.85, 10.15]", 16, 12),
    ("the silo warhead's strength is 75", "exact",
     "on a BARE tile (defence modifier 0, so no terrain term at all) the flip "
     "sits at n=11 for hp 51/50/44 and vanishes at hp 43, giving (74.954, 75.054]", 4, 12),
    ("the submarine warhead's strength is 80", "exact",
     "same bare tile: flip at n=11 for hp 100/97/95, gone at hp 93 and 91, giving "
     "(79.952, 80.152]. The full-health row alone, assuming nothing about the "
     "health rule, gives (79.913, 80.652]. 80 is the Nuclear Submarine's own "
     "Combat. The earlier ~80.3 was the terrain assumption on a stacked "
     "hills+jungle tile, whose effective bonus is ~5.93 not 6.00", 5, 12),
    ("an ICBM launch consumes exactly one draw", "exact",
     "seed stepped through the known LCG either side of the shot: 1 draw with an "
     "interceptor adjacent (3/3), 0 without (3/3)", 6, 10),
    ("damage multiplier is 1.04^delta, NOT e^(0.04*delta)", "exact",
     "11 preview damages over delta -20..+30 from three interceptors and six air "
     "units, all reproduced by round(30 * 1.04^delta); the e-form misses 5 of the "
     "11 under every rounding rule", 11, 81),
    ("fired damage = round((24 + rand(0..11)) * 1.04^delta)", "exact",
     "5 fired bomber rounds (u=0.05/0.30/0.40/0.45/0.48 -> 43/49/50/52/52) "
     "reproduced exactly; the constants are the shipped COMBAT_BASE_DAMAGE 24, "
     "COMBAT_MAX_EXTRA_DAMAGE 12 and COMBAT_POWER_SCALING 0.04", 5, 81),
    ("a strength contribution is FRACTIONAL on the backend", "exact",
     "one supporter swept over health 20..100: the displayed bonus is "
     "floor(5*hp/100) but the damage moves at 33, 50 and 90 HP, landing strictly "
     "between the 40 HP and 60 HP damages; 9 rows fit 5*hp/100 exactly", 9, 81),
    ("TECH_ADVANCED_AI raises a GDR's interception to 130", "exact",
     "AntiAirCombat read 90 before and 130 after the grant, expected damage 36 -> "
     "100, and the fired round destroyed the bomber and stopped the strike where "
     "the unteched GDR had let it through", 2, 81),
    ("experience is not a draw", "exact",
     "one attacker's preview read identically at 7 seeds; and 6 attackers of "
     "strength 20..85 all bank 4 while the damage they take runs 43 down to 3 "
     "(the defender banks 6, and 8 when the combat is lethal)", 7, 20),
    ("no once-per-turn interception limit", "binary",
     "4 silo launches at one unmoved Mobile SAM, 4 at one unmoved teched GDR and "
     "5 bomber strikes at one unmoved stack of 4 Anti-Air Guns were ALL stopped "
     "without rebuilding the scene between shots", 13, None),
    ("missile silo launches ARE interceptable", "binary",
     "9 launches with an adjacent Mobile SAM (AA 100) and 3 with an Anti-Air Gun "
     "(AA 90) all stopped, interceptor undamaged and warhead spent every time; "
     "3 controls with none adjacent all detonated", 15, None),
]

print(f"{'claim':<38} {'kind':<7} {'hits':>5}  {'p under null':>14}   detail")
total = 1.0
for claim, kind, detail, hits, width in ROUNDS:
    p = exact_p(width, hits) if kind == "exact" else binary_p(hits)
    total *= p
    pstr = f"{p:.3g}" if p > 1e-300 else "<1e-300"
    print(f"{claim:<38} {kind:<7} {hits:>5}  {pstr:>14}   {detail}")

print(f"\nweakest single claim: "
      f"{max(ROUNDS, key=lambda r: (exact_p(r[4], r[3]) if r[1]=='exact' else binary_p(r[3])))[0]}")
print("\nNotes on honesty of the nulls:")
print("  * 'exact' nulls assume the observed integer could have been anything in the")
print("    window; that is generous to the model only if the window is the mechanic's")
print("    full range, which is how the widths above were chosen.")
print("  * a claim resting on ONE round gets p = 1/W or 0.5 and should be read as")
print("    suggestive, not settled — that is what the earlier 'no roll' claim was.")
print("  * independence holds because each round is its own seeded scene; it would")
print("    NOT hold for repeated draws inside one scene.")
