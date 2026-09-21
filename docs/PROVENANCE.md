# Constant provenance — the mismatch ledger

Every catalog constant carries a source tag (`cpu/data/provenance.ts`) and
`tools/civ6lab/xml_check.py` re-reads the owner's install and compares.
This file is the BASELINE the battery's stage 0 ratchets against: a line
listed here is KNOWN red, anything else is new and reds the run.

    npm run export                       # writes seeder/worlds/provenance.json
    python tools/civ6lab/xml_check.py check --baseline docs/PROVENANCE.md

The checker parses ONLY lines matching `^(MISMATCH|DANGLING) (\S+?):` (see
`known_red`); everything else on this page is prose. The summary line below
is copied from `check` and its counts move with the catalog:

    XML CHECK OK against PROVENANCE.md — 0 new, 2 known, 0 fixed; 4876 match, 2 mismatch, 0 dangling, 200 unsourced, 818 derived, 3 lab (+0 unverifiable), 300 pedia, 383 stylized (312 install files)

## The two lines

BOTH ARE NOW ANSWERED — one from the live game, one from the install — and
both catalog VALUES are right. What keeps them red is their TAG: each still
claims an `xml` cell that says something else. Neither can leave this file
by a docs edit; each leaves when `cpu/data/provenance.ts` re-tags it (a
`lab` tag naming its run file, or a `derived` one naming the reading), which
is a code change with a battery behind it. AUDIT C-80 carries both.

### promotions (1)

```
MISMATCH promotions.POP_STAR.effects.0.v: catalog 25 vs install '-75' [ModifierArguments[ModifierId=ROCKBAND_POP&Name=Amount].Value <- Expansion2_UnitPromotions.xml]
```

ANSWERED from the install, no concert needed. `PROMOTION_POP` carries one
modifier, `ROCKBAND_POP` /
`MODIFIER_PLAYER_UNIT_ADJUST_TOURISM_BOMB_ADDITIONAL_YIELD` on `YIELD_GOLD`,
Amount −75; the shipped text for it reads "Gain Gold equal to **25%** of the
Tourism generated" (confirmed in two locales). So the argument is a
PERCENTAGE ADJUSTMENT AWAY FROM 100: −75 means the concert pays gold at 25%
of its tourism, and the catalog's 25 is the rule stated the other way round.
The tag owes a `derived` reading of `100 + Amount`, not a raw cell.

### scenario (1)

```
MISMATCH scenario.goldPurchaseMult: catalog 4 vs install '2' [GlobalParameters[Name=GOLD_PURCHASE_MULTIPLIER].Value <- GlobalParameters.xml]
```

MEASURED in the live game against 302 priced rows of one city, and verified
against a real transaction (a Spy at production cost 112 cost exactly 445
gold):

    price = floor(mult * C / 5) * 5,   mult = 4 gold / 2 faith,
    C = the CITY's speed-scaled production cost

The divisor is `PURCHASE_DIVISOR` 5 and the rounding is FLOOR, not nearest.
The multiplier is 4 on the scaled cost, not 2 on the XML cost — the two
agree except on odd costs, and there the scaled reading wins (a Slinger at
17 buys for 65, not 70). There is no FAITH row in `GlobalParameters.xml`,
and the measured gold:faith ratio is exactly 2:1 everywhere, so the
published `GOLD_PURCHASE_MULTIPLIER` 2 reads naturally as *gold = 2 × the
faith price*. Runs: `tools/civ6lab/runs/purchase_20260920T181359Z.jsonl`
and `purchase_20260920T181552Z.jsonl`. The tag owes a `lab` reference to
those files; the price FORMULA itself (floor-to-five, and no progress
discount) is open work in AUDIT C-80.

## How a line leaves

Either the value is FIXED on both engines — a gate-stage change with a
battery, and the line is deleted from this file — or the tag becomes
STYLIZED in `cpu/data/provenance.ts` with the owner's ruling quoted on the
row, or LAB with the run file that measured it. Nothing leaves by being
re-read, and nothing leaves by being deleted here: the checker re-derives
the red from the catalog, so a line dropped from this page comes back as a
NEW RED on the next stage 0.
