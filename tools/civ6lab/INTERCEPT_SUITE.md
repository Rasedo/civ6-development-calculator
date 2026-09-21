# Nuclear interception — the full test matrix

Written before the remaining runs, so each cell is a test rather than a fit.
Everything here is measurable from the socket; the generator is known
(`state' = (1103515245*s + 12345) mod 2^32`, `draw = ((state'>>17)*(range mod 65536))>>15`),
so every round is fired from a chosen seed and the draws it consumes are counted.

## What is established so far (bomber + Mobile SAM only)

    LAW (bomber delivery, as measured):
      a qualifying interceptor ADJACENT (distance 1) to the AIM PLOT, not owned by
      the launcher, makes ONE anti-air attack on the delivering bomber.
      damage   = round(B * (0.8 + 0.4u))     -- one rng draw, the ordinary combat roll
      cancelled <=> damage > 50              -- i.e. the bomber ends below 50% HP
      the warhead is spent either way; a cancelled strike declares NO war.

* `u = 0.05 -> 43 damage -> lands`, `0.30 -> 49 -> lands`, `0.40 -> 50 -> lands`,
  `0.45 -> 52 -> cancelled`, `0.48 -> 52 -> cancelled`: the threshold is strictly
  `> 50`, confirmed by the exact-50 row landing.
* attacker terrain is irrelevant (same seed, SAM on Plains vs Grass Hills: 43 both).
* an interceptor at distance 2 contributes nothing (43, same as none adjacent).
* stacking, same seed, adjacent count 1/2/3/4 -> damage 43 / 52 / 64 / 77, implied
  attack base 52.4 / 63.4 / 78.0 / 93.9, successive ratios 1.210 / 1.230 / 1.204.
  So each EXTRA adjacent interceptor adds about **+5 combat strength** — additive in
  strength, therefore multiplicative (x1.22) in damage — and adds NO extra attack
  (one draw in every case).

Base strengths are readable directly: `unit:GetAntiAirCombat()` and `unit:GetCombat()`
return the XML values (Mobile SAM 100, Bomber 85). They do NOT include bonuses, which
is why the stacking bonus had to be inferred from damage. `CombatManager.SimulateAttackVersus`
is the UI's own preview and would give modified strengths — it refused every argument
shape tried so far, most likely because a bomber parked at its base is not a legal
anti-air target.

## The matrix

## RESULTS — the suite as run

Two channels exist and they obey DIFFERENT rules.

**Bomber delivery — an anti-air ATTACK on the delivering unit:**

    S_att  = max over adjacent qualifying interceptors of [ AA_base - 10*(1 - HP/100) ]
             + 5 * (sum over the OTHER adjacent interceptors of HP/100)
    S_def  = 86                (the Bomber's Combat is 85)
    damage = round( 30 * e^(0.04*(S_att - S_def)) * (0.8 + 0.4u) )    -- ONE draw
    cancelled  <=>  damage > 50

**Silo and submarine delivery — not an attack on the launcher, but the SAME ROLL.**
The launcher takes no damage, and exactly one draw is consumed when an
interceptor is adjacent and none when it is not. The early reading of this —
"stopped with apparent certainty" — was **WRONG**, and the steelman in ROUND 3
below broke it: the identical damage law applies, with the warhead defending at a
fixed value instead of a delivering unit's Combat.

    damage     = round( (24 + GetRandNum(12)) * 1.04^(S_att - D) )
    cancelled  <=>  damage > 50
    D = 85 bomber (its own Combat) | D = 72 missile silo | D = 77 nuclear submarine

Everything that looked like certainty was a high-strength interceptor: at S = 100
every one of the twelve draws clears 50 on both ICBM channels. At S = 90 a silo
launch is stopped 11 times in 12 but a SUBMARINE launch only 5 times in 12, and a
1 HP Anti-Air Gun (S = 80.1) stops nothing at all — 20 launches, 20 detonations.

Readers that made this possible, all InGame:

    CombatManager.SimulateAttackInto(bomber:GetComponentID(), CombatTypes.AIR, x, y)
      -> ATTACKER / DEFENDER / ANTI_AIR / INTERCEPTOR blocks, keyed by
         CombatResultParameters hashes. The ANTI_AIR block gives the chosen
         interceptor's ID and tile, its BASE anti-air strength, the support
         bonus as TEXT ("+15 anti-air unit support"), and DAMAGE_FROM, the
         expected damage to the bomber.
    CombatManager.SimulateAttackVersus(attacker, defender [, CombatTypes.X])
      -> the same shape for a normal attack; refuses pairings that are not a
         legal attack, which is why SAM-as-attacker failed.

`Game.TriggerWMDAttack` does NOT exist (nor `Game.TriggerWMDStrike`, nor a
`WMDManager`): a script circulating online that uses it is fabricated. Every WMD
launch in the shipped UI — and every one that works here — is
`UnitManager.RequestOperation(unit, UnitOperationTypes.WMD_STRIKE, {PARAM_X, PARAM_Y, PARAM_WMD_TYPE})`.

### A. Interception channels (every unit with AntiAirCombat > 0)

| # | interceptor | AA | domain | result |
|---|---|---|---|---|
| A1 | MOBILE_SAM | 100 | land | **DONE** — baseline, 43 damage at u=0.05 |
| A2 | ANTIAIR_GUN | 90 | land | **DONE** — intercepts. Predicted 29, measured **29** |
| A3 | GIANT_DEATH_ROBOT | 90 (130 with TECH_ADVANCED_AI) | land | **DONE** — intercepts. Predicted 29, measured **29**. Unit class is irrelevant; only AntiAirCombat enters. With `TECH_ADVANCED_AI` the promotion `GDR_AA_DEFENSE` adds **+40**, and it DOES apply to interception: 90 -> 130, expected damage 36 -> 100, and the fired round destroyed the bomber and cancelled the strike |
| A4 | DESTROYER | 90 | sea | **DONE, and the earlier entry was WRONG.** A Destroyer on water DOES cover an adjacent aim plot, land or water. The old negative was a bad scene, not a rule |
| A5 | BATTLESHIP | 90 | sea | **DONE** — covers d=1, same as every other anti-air unit |
| A6 | MISSILE_CRUISER | 110 | sea | **DONE, and B5 was WRONG to say this unit does not exist.** It exists at `AntiAirCombat` 110 — the strongest interceptor short of a teched GDR — and it covers an adjacent LAND aim plot, tested at four different land aims. Expected damage 80 = `round(30 * 1.04^25)`, exact |
| A6b | BRAZILIAN_MINAS_GERAES | 95 | sea | **DONE** — covers d=1; expected damage 44 = `round(30 * 1.04^10)`, exact |
| A7 | none (control) | - | - | **DONE** — strike lands, 0 draws consumed |
| A8 | FIGHTER / JET_FIGHTER | - | air | **no interception observed**: the preview's INTERCEPTOR block stayed empty with three enemy fighters within range, and no air-patrol stance exists in UnitOperations or UnitCommandTypes to set from the socket |

### B. Delivery channels

| # | channel | result |
|---|---|---|
| B1 | BOMBER | **DONE** — the anti-air attack rule above |
| B2 | JET_BOMBER | **DONE** — Combat 90 vs the Bomber's 85. Predicted 44, measured **44** |
| B3 | MISSILE SILO | **DONE — reachable after all, and the earlier entry was wrong.** The refusal was my parameter list, not the engine: the shipped UI (`WorldInput.lua` `ICBMStrike`, `CityBannerManager.lua` `UpdateWMDBanner`) passes **`PARAM_X0/Y0` = the SILO's plot and `PARAM_X1/Y1` = the target**, on `CityManager.RequestCommand(Cities.GetPlotPurchaseCity(siloPlot), CityCommandTypes.WMD_STRIKE, ...)`. With those, 143 targets are offered and the command starts. See the silo results below |
| B4 | NUCLEAR_SUBMARINE | **DONE, and it is a different rule** — see the results section. Also: a submarine has a **minimum range** — a target at distance 1 is offered as no legal target at all, distance 2 fires |
| B5 | MISSILE_CRUISER | **the earlier entry was WRONG**: the Missile Cruiser exists (`AntiAirCombat` 110) — I had searched the AIR-domain unit list, which of course contains no ships. It is not a WMD carrier though: the only unit that delivers a warhead by sea is `UNIT_NUCLEAR_SUBMARINE`. The air units are Biplane 80 / Bomber 85 / Jet Bomber 90 / Fighter 100 / P-51 105 / Jet Fighter 110 |

`CombatTypes` carries **ICBM** alongside MELEE/RANGED/BOMBARD/AIR/RELIGIOUS, which
suggests silo and submarine launches resolve through a different combat path than the
bomber's AIR attack — the likeliest home of the "chance" the wiki describes.

### C. Both weapons

| # | weapon | result |
|---|---|---|
| C1 | THERMONUCLEAR (radius 2) | **DONE** — baseline |
| C2 | NUCLEAR DEVICE (radius 1) | **DONE** — identical to the thermonuclear at three draws: 43 (lands), 49 (lands), 52 (**cancelled**). The threshold crossing matters: a single below-threshold round could not have tested it |

### D. The interceptor's own state

| # | variable | result |
|---|---|---|
| D1 | HP | **DONE** — a SAM at 50 HP attacks at AA 95 (Civ 6's -10 x missing-HP penalty). Predicted 35 damage, measured **35** |
| D2 | which one fires | **DONE — the strongest.** Healthy + wounded gave 48, not the wounded-alone 42; swapping tiles changed nothing |
| D3 | mixed types | **DONE** — SAM (100) + AA gun (90): the preview NAMES the SAM as the chosen unit and the gun contributes **+5 support**. Max strength wins, read directly |
| D4 | promotions | **answered by the database**: `UNIT_MOBILE_SAM` has `CanEarnExperience="false"`, so it cannot be promoted at all |
| D5 | supporter's HP | **DONE** — a half-dead supporter contributes **+2**, not +5: the support scales with the supporter's own health |

### E. Geometry

| # | variable | result |
|---|---|---|
| E1 | distance 1 intercepts, distance 2 does not | **DONE** — a SAM at distance 2 changed nothing (43, same as none) |
| E2 | interceptor beside the bomber's PATH rather than the aim | covered by E1 in effect: only adjacency to the AIM PLOT mattered in every round |
| E3 | ownership | **DONE** (n=1 each) — the launcher's own SAM does not intercept; a seat at PEACE does, and an intercepted strike declares no war |

## ROUND 2 — the damage formula itself, and the third channel

### The multiplier is `1.04^delta`, not `e^(0.04*delta)`

`SimulateAttackInto` is deterministic: four repeat reads agreed, and seeding the
generator to seven different values before each read changed nothing. So the
ANTI_AIR block's `DAMAGE_FROM` is an exact read, and the curve can be swept
without firing. Three interceptors (`AntiAirCombat` 90, 100 and 130) against all
six air units in the database give eleven distinct `delta = S_att - S_def`, and
they agree wherever two interceptors share a delta — so the damage is a function
of the DIFFERENCE alone.

    delta   -20  -15  -10   -5    0    5   10   15   20   25   30
    damage   14   17   20   25   30   36   44   54   66   80   97

    round(30 * 1.04^delta)   14 17 20 25 30 36 44 54 66 80 97   <- all eleven
    round(30 * e^(0.04d))    13 16 20 25 30 37 45 55 67 82 100  <- misses 5

The widely-repeated `30 * e^(0.04*delta)` is **refuted**: it is wrong at five of
the eleven, under floor, round AND ceil. `COMBAT_POWER_SCALING = 0.04` is a
per-point RATE, so the multiplier is `(1 + 0.04)^delta`.

Feeding the five fired bomber rounds back through it also fixes the roll:

    damage = round( (24 + GetRandNum(12)) * 1.04^(S_att - S_def) )

    u      0.05  0.30  0.40  0.45  0.48
    n=floor(12u)  0     3     4     5     5
    predicted    43    49    50    52    52
    measured     43    49    50    52    52

and 24 / 12 / 0.04 are the shipped `COMBAT_BASE_DAMAGE`,
`COMBAT_MAX_EXTRA_DAMAGE` and `COMBAT_POWER_SCALING` from `GlobalParameters.xml`.
The preview substitutes half of `COMBAT_MAX_EXTRA_DAMAGE` for the draw, giving
the base 30 above.

### A strength contribution is FRACTIONAL on the backend

`COMBAT_ANTI_AIR_SUPPORT_BONUS_MODIFIER = 5`, scaled by the supporter's health.
One supporter, health swept, with the bonus the preview PRINTS beside it:

    hp        20   33   40   50   60   70   80   90  100
    5*hp/100 1.0 1.65  2.0  2.5  3.0  3.5  4.0  4.5  5.0
    shown      1    1    2    2    3    3    4    4    5   <- floor
    damage    56   57   58   59   61   62   63   64   66

40 HP gives exactly +2 and 60 HP exactly +3, and the 50 HP row (+2.5) sits
strictly between them at 59. The 33 HP and 90 HP rows do the same. So the
display floors the term, and the DAMAGE uses the fraction. Stacked, three 50 HP
supporters read "+2, +5, +7" = floor(2.5), floor(5.0), floor(7.5) — one float
sum, floored once, not three floored terms.

### Missile silo — the third channel, and it is stopped outright

    one adjacent Mobile SAM (AA 100):  9 launches, 9 stopped, SAM undamaged
                                       every time, warhead spent every time
    one adjacent Anti-Air Gun (AA 90): 3 launches, 3 stopped
    no interceptor adjacent:           3 launches, 3 detonations

Same signature as the submarine and nothing like the bomber's: no attack on the
launcher, no damage threshold, and the interceptor's STRENGTH does not change the
outcome either (90 stops it as surely as 100). Across both ICBM-class channels
the count is **21 launches, 21 stopped**, spanning u = 0.05 to 0.998; the
one-sided 95% lower bound on the stop probability is 0.87, and the simplest
reading is that it is 1.

## ROUND 3 — the coverage radius, and the steelman that broke ROUND 2

### Every anti-air unit covers exactly ONE ring

`ABILITY_ANTI_AIR_COVER` is attached by the `CLASS_ANTI_AIR` tag and carries no
radius, so the radius was measured: one interceptor at exactly distance d from
the aim with nothing else of that player within 4, read off the preview.

| unit | AA | domain | d=1 | d=2 | d=3 |
|---|---|---|---|---|---|
| Anti-Air Gun | 90 | land | yes | no | no |
| Mobile SAM | 100 | land | yes | no | no |
| Giant Death Robot | 90 / 130 teched | land | yes | no | no |
| Destroyer | 90 | sea | yes | no | no |
| Battleship | 90 | sea | yes | no | no |
| Brazilian Minas Geraes | 95 | sea | yes | no | no |
| Missile Cruiser | 110 | sea | yes | no | no |

No unit has a wider umbrella. The `Range` column (1 for the land AA units, 3 for
the ships and the GDR) is the RANGED ATTACK range and is unrelated to cover.

### The ICBM law, pre-registered and fired

Seeds chosen so the draw `n = GetRandNum(12)` takes every value 0..11 exactly
once, so the flip is pinned rather than sampled:

| channel | interceptor | S_att | predicted flip | measured | correct |
|---|---|---|---|---|---|
| silo | AA Gun 60 HP | 86.0 | n = 6 | 6 | 12/12 |
| silo | AA Gun 35 HP | 83.5 | n = 9 | 9 | 12/12 |
| silo | Mobile SAM 30 HP | 93.0 | always | always | 12/12 |
| submarine | AA Gun 100 HP | 90.0 | n = 7 | 7 | 12/12 |
| submarine | Mobile SAM 1 HP | 90.1 | n = 7 | 7 | 12/12 |

60/60, including the exact boundary: at S = 86 the n=5 round previews **50** and
LANDS, the n=6 round previews **52** and is STOPPED.

### Launch distance does NOTHING; the TARGET TILE's terrain does

Silo fixed at `37:17`, aim moved, interceptor held at a 60 HP Anti-Air Gun
(S = 86) so the flip sits mid-range:

| aim | distance | terrain + feature defence | flip | implied D |
|---|---|---|---|---|
| 36:15 | 2 | +3 | 6 | 72.1-73.0 |
| 34:15 | 4 | +3 | 6 | 72.1-73.0 |
| 32:15 | 6 | +3 | 6 | 72.1-73.0 |
| 35:15 | 3 | +6 | 2 | 68.3-69.3 |
| 30:15 | 8 | 0 | 9 | 74.6-75.4 |

Distance 2, 4 and 6 at the same terrain give the SAME flip. What moves it is

    D = base - (aim plot's terrain DefenseModifier + feature DefenseModifier)
    base = 75 silo | 80 nuclear submarine   (= the sub's own Combat)

Both pinned on a BARE tile (`30:15`, Grassland, no feature, modifier 0) where
no terrain term enters, by walking the flip to n = 10/11 with the interceptor's
health, where consecutive damages differ by only 2.9%:

    submarine  flip 11 at hp 100/97/95, gone at 93/91  ->  (79.952, 80.152]
    silo       flip 11 at hp 51/50/44,  gone at 43     ->  (74.954, 75.054]

and the health rule itself is MEASURED, not assumed: the bomber preview read at
16 healths steps exactly where `S = 90 - c*(1 - hp/100)` puts it, c in about
[9.85, 10.15]. The earlier "~80.5" came from a stacked Hills+Jungle aim whose
effective bonus is ~5.93, not 6.00 — terrain-only +3 and feature-only +3 both
behave identically and both fit base 80.

so rough ground makes a nuke EASIER to shoot down. Pre-registered at four aims
x four draws: exactly the 2 predicted stops out of 20. The BOMBER channel is
unaffected — a Mobile SAM previews 54 against a Bomber aimed at a +3 tile and
54 at a +6 tile — because there the anti-air attacks the bomber, which is not
standing on the aim plot.

Also turned up: two far aims were refused although inside `ICBMStrikeRange` 12
— they are UNREVEALED. A third, revealed but not currently visible, was legal.
A silo fires at any REVEALED plot in range; visibility is not required.

### A void result, recorded so it is not mistaken for data

A 12-round thermonuclear silo battery read "12 stopped" and is worthless — the
weapon never launched. Its blast radius is 2 and the silo sits 2 tiles from the
aim, so the target was refused outright (`canStart: false`, 141 offered targets
instead of the nuclear device's 143, stock unmoved). **A warhead cannot be aimed
within its own blast radius of the silo that fires it** — which is a real rule,
and the only thing that battery established.

### There is NO once-per-turn interception limit

Every battery before this rebuilt the scene between rounds, so every strike met a
FRESH interceptor — which left open the obvious way to beat one: fire twice. It
does not work. Firing repeatedly at an interceptor that is never rebuilt,
never moved and never healed:

    4 silo launches at one Mobile SAM          -> 4 stopped
    4 silo launches at one teched GDR (130)    -> 4 stopped
    5 bomber strikes at one stack of 4 AA guns -> 5 cancelled

An interceptor is not consumed. On the ICBM channels the strength of the
interceptor does not matter either — 90, 100 and 130 all stop it outright — so
the only thing that has EVER changed an ICBM-class outcome in this lab is whether
a qualifying interceptor is adjacent to the aim plot at all.

### The bomber channel's gap is the roll, and it is wide

    lone Anti-Air Gun (90):  bomber takes 29..43  -> NEVER cancels, at any roll
    lone Mobile SAM (100):   bomber takes 43..63  -> cancels iff 24+n > 27.7,
                                                     i.e. n >= 4, i.e. u >= 0.333
    teched GDR (130):        bomber takes 174     -> always cancels

Both Mobile SAM outcomes were observed at the predicted seeds (u = 0.771 stopped,
u = 0.312 landed), and the Anti-Air Gun round landed as predicted.

### Experience

Five real anti-air attacks banked exactly 0 experience, and the database says
why: `UNIT_ANTIAIR_GUN`, `UNIT_MOBILE_SAM` and `UNIT_GIANT_DEATH_ROBOT` all ship
`CanEarnExperience="false"`. No interceptor can ever promote. Separately, the
experience AMOUNT is not drawn: one attacker's preview reads identically at seven
seeds, and six attackers of strength 20..85 all bank 4 while the damage they take
runs from 43 down to 3 (a defender banks 6, and 8 when the combat is lethal).

### A Giant Death Robot with TECH_ADVANCED_AI

`TECH_ADVANCED_AI` grants `PROMOTION_GDR_AA_DEFENSE`
(`MODIFIER_SINGLE_UNIT_ADJUST_ANTI_AIR_STRENGTH_MODIFIER`, Amount 40, gated by
`PLAYER_IS_DEFENDER` AND `OPPONENT_IS_AIR_UNIT`). Interception counts as being
the defender against an air unit: `GetAntiAirCombat()` read 90 before the grant
and **130** after, expected damage went 36 -> 100, and the fired round destroyed
the bomber and stopped the strike where the unteched GDR had let the same strike
through. The GDR's UNPROMOTED 90 is **not** unique — Destroyer, Battleship and
Anti-Air Gun all carry 90; the promoted 130 is the highest in the game.

## Strength of evidence

`tools/civ6lab/evidence.py` scores every claim against a stated null. As of this
run the strongest are the damage multiplier (p = 1.0e-21 over 11 exact
predictions), the fractional support term (6.7e-18 over 9) and the fired-damage
formula (2.9e-10 over 5); the silo channel is 2.4e-4 and the submarine 2.0e-3.
The weakest remain "strongest unit fires" (0.25) and naval AA defensive (0.125).

## Method for every cell

1. rebuild the scene (`intercept_stack.lua`): clear every unit of the defender within 1
   of the aim plot, clear the aim plot's fallout, place a fresh marker and the named
   interceptors on NAMED tiles (never "the first free neighbour" — that moved the
   terrain under the measurement once already);
2. spawn a fresh bomber (full HP, full moves) — a wounded deliverer changes the result;
3. `Game.SetRandomSeed(seed)` from GameCore;
4. fire one strike;
5. poll until the warhead leaves the stock;
6. read the bomber's HP, the aim plot's fallout, and the seed — giving damage,
   outcome and the number of draws consumed.

Every cell is fired from the SAME seed as the baseline wherever possible, so a change
in damage is attributable to the variable under test and nothing else.
