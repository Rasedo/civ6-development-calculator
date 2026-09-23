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

    XML CHECK OK against PROVENANCE.md — 0 new, 0 known, 0 fixed; 4850 match, 0 mismatch, 0 dangling, 189 unsourced, 823 derived, 9 lab (+0 unverifiable), 298 pedia, 382 stylized (312 install files)

## Known red

None. The checker follows the schema’s FOREIGN KEYs as the game’s database
does, so a `<Delete>` from `Modifiers` takes the modifier’s
`ModifierArguments` with it, a `<Delete>` from `Types` takes the typed row,
and an empty `<Delete/>` empties its table — a tag citing a row a later layer
deletes reads DANGLING and lands here until its constant leaves or is
re-sourced.

## How a line leaves

Either the value is FIXED on both engines — a gate-stage change with a
battery, and the line is deleted from this file — or the mechanic leaves
both engines with its constant (a row the install deletes), or the tag becomes
STYLIZED, DERIVED or LAB in `cpu/data/provenance.ts` with the reason on the
row (a LAB tag names its `runs/` file). Nothing leaves by being re-read.
