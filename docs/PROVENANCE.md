# Constant provenance — the mismatch ledger

Every catalog constant carries a source tag (`cpu/data/provenance.ts`) and
`tools/civ6lab/xml_check.py` re-reads the owner's install and compares.
This file is the BASELINE the battery's stage 0 ratchets against: a line
listed here is KNOWN red, anything else is new and reds the run.

    npm run export                       # writes seeder/worlds/provenance.json
    python tools/civ6lab/xml_check.py check --baseline docs/PROVENANCE.md

The checker parses ONLY lines matching `^(MISMATCH|DANGLING) (\S+?):` (see
`known_red`); everything else on this page is prose. The authoritative
summary line, verbatim from `check`:

    XML CHECK OK against PROVENANCE.md — 0 new, 2 known, 0 fixed; 4872 match, 2 mismatch, 0 dangling, 200 unsourced, 818 derived, 3 lab (+0 unverifiable), 300 pedia, 383 stylized (312 install files)

## The two lines

Both wait on the LIVE game (lab session 2) — the install publishes an
input, not the number.

### promotions (1)

```
MISMATCH promotions.POP_STAR.effects.0.v: catalog 25 vs install '-75' [ModifierArguments[ModifierId=ROCKBAND_POP&Name=Amount].Value <- Expansion2_UnitPromotions.xml]
```

The catalog says a Pop Star adds 25% to a concert's gold; the install's
`ROCKBAND_POP` writes Amount −75 on a tourism-bomb gold yield, and the
relation between the two is a DLL formula. `tools/civ6lab/SESSION2.md`
scene H reads one concert with the promotion against one without.

### scenario (1)

```
MISMATCH scenario.goldPurchaseMult: catalog 4 vs install '2' [GlobalParameters[Name=GOLD_PURCHASE_MULTIPLIER].Value <- GlobalParameters.xml]
```

The catalog buys at production cost × 4 (gold) and × 2 (faith); the install
publishes `GOLD_PURCHASE_MULTIPLIER` 2 with `PURCHASE_DIVISOR` 5 and no
faith row, so the price is a DLL formula over both. `SESSION2.md` scene G
reads a city's gold and faith prices against known production costs and
fits them. AUDIT C-80 carries both lines.

## How a line leaves

Either the value is FIXED on both engines — a gate-stage change with a
battery, and the line is deleted from this file — or the tag becomes
STYLIZED in `cpu/data/provenance.ts` with the owner's ruling quoted on the
row. Nothing leaves by being re-read.
