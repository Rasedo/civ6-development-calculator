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

    XML CHECK OK against PROVENANCE.md — 0 new, 0 known, 0 fixed; 4879 match, 0 mismatch, 0 dangling, 200 unsourced, 819 derived, 9 lab (+0 unverifiable), 298 pedia, 383 stylized (312 install files)

## No known red

The ledger is empty (2026-09-21). The two lines it carried left the way
lines leave:

- `scenario.goldPurchaseMult` (catalog 4 vs the install's
  `GOLD_PURCHASE_MULTIPLIER` 2) is now a LAB constant: the live game prices
  a purchase at `floor(mult × C / 5) × 5` with mult 4 for gold and 2 for
  faith (302 of 302 priced rows of one city, then a real transaction;
  `tools/civ6lab/runs/purchase_20260920T181359Z.jsonl`), and the install's
  2 is the gold-to-faith RATIO. Both engines carry the five-step floor
  (`goldPrice` / `faithPrice`, `_gold_price` / `_faith_price`).
- `promotions.POP_STAR.effects.0.v` (catalog 25 vs `ROCKBAND_POP`'s Amount
  −75) is DERIVED from the install: the argument is a percentage adjustment
  away from 100 on the tourism-bomb gold yield, and the shipped text reads
  "Gain Gold equal to 25% of the Tourism generated".

## How a line leaves

Either the value is FIXED on both engines — a gate-stage change with a
battery, and the line is deleted from this file — or the tag becomes
STYLIZED, DERIVED or LAB in `cpu/data/provenance.ts` with the reason on the
row (a LAB tag names its `runs/` file). Nothing leaves by being re-read.
