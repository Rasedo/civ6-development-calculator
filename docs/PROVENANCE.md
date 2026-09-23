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

    XML CHECK OK against PROVENANCE.md — 0 new, 26 known, 0 fixed; 4842 match, 0 mismatch, 42 dangling, 200 unsourced, 815 derived, 9 lab (+0 unverifiable), 298 pedia, 383 stylized (312 install files)

## Known red

Every line below cites a row that `Expansion2_RemoveData.xml` deletes. The
checker follows the schema's FOREIGN KEYs as the game's database does, so a
`<Delete>` from `Modifiers` takes the modifier's `ModifierArguments` with it
and a `<Delete>` from `Types` takes the typed row (the same cascade removes
DIPLOACTION_RESEARCH_AGREEMENT, which `tools/civ6lab/runs/nuke_extra_20260921T040000Z.jsonl`
reads as absent from the live DB). The engine still carries each mechanic:

- the nine governments' ACCUMULATING bonuses (`*_ACCUMULATING`, `bonus.increment` / `bonus.interval`);
- America's per-government legacy rate (`TRAIT_*_BONUS_RATE`, nine rows under the two names below);
- the Genghis Khan great general (`GREAT_PERSON_INDIVIDUAL_GENGHIS_KHAN`);
- four policies' building-yield doubling (Simultaneum, Grand Opera, Rationalism, Free Markets).

    DANGLING policies.SIMULTANEUM.effects.buildingYieldBoost.pct: derived 'Amount/100 - the install writes the percentage, this catalog' names ModifierArguments[ModifierId=SIMULTANEUM_DOUBLESHRINE&Name=Amount].Value deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING policies.GRAND_OPERA.effects.buildingYieldBoost.pct: derived 'Amount/100 - the install writes the percentage, this catalog' names ModifierArguments[ModifierId=GRANDOPERA_DOUBLEAMPHITHEATER&Name=Amount].Value deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING policies.RATIONALISM.effects.buildingYieldBoost.pct: derived 'Amount/100 - the install writes the percentage, this catalog' names ModifierArguments[ModifierId=RATIONALISM_DOUBLELIBRARY&Name=Amount].Value deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING policies.FREE_MARKETS.effects.buildingYieldBoost.pct: derived 'Amount/100 - the install writes the percentage, this catalog' names ModifierArguments[ModifierId=FREEMARKET_DOUBLEMARKET&Name=Amount].Value deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.AUTOCRACY.bonus.increment: [ModifierArguments[ModifierId=AUTOCRACY_WONDERS_ACCUMULATING&Name=Increment].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.AUTOCRACY.bonus.interval: [ModifierArguments[ModifierId=AUTOCRACY_WONDERS_ACCUMULATING&Name=Interval].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.OLIGARCHY.bonus.increment: [ModifierArguments[ModifierId=OLIGARCHY_UNIT_EXPERIENCE_ACCUMULATING&Name=Increment].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.OLIGARCHY.bonus.interval: [ModifierArguments[ModifierId=OLIGARCHY_UNIT_EXPERIENCE_ACCUMULATING&Name=Interval].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.CLASSICAL_REPUBLIC.bonus.increment: [ModifierArguments[ModifierId=CLASSICAL_REPUBLIC_GREAT_PEOPLE_ACCUMULATING&Name=Increment].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.CLASSICAL_REPUBLIC.bonus.interval: [ModifierArguments[ModifierId=CLASSICAL_REPUBLIC_GREAT_PEOPLE_ACCUMULATING&Name=Interval].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.MONARCHY.bonus.increment: [ModifierArguments[ModifierId=MONARCHY_ENVOYS_ACCUMULATING&Name=Increment].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.MONARCHY.bonus.interval: [ModifierArguments[ModifierId=MONARCHY_ENVOYS_ACCUMULATING&Name=Interval].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.MERCHANT_REPUBLIC.bonus.increment: [ModifierArguments[ModifierId=MERCHANT_REPUBLIC_GOLD_PURCHASE_ACCUMULATING&Name=Increment].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.MERCHANT_REPUBLIC.bonus.interval: [ModifierArguments[ModifierId=MERCHANT_REPUBLIC_GOLD_PURCHASE_ACCUMULATING&Name=Interval].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.THEOCRACY.bonus.increment: [ModifierArguments[ModifierId=THEOCRACY_FAITH_PURCHASE_ACCUMULATING&Name=Increment].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.THEOCRACY.bonus.interval: [ModifierArguments[ModifierId=THEOCRACY_FAITH_PURCHASE_ACCUMULATING&Name=Interval].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.DEMOCRACY.bonus.increment: [ModifierArguments[ModifierId=DEMOCRACY_DISTRICT_PROCESSES_ACCUMULATING&Name=Increment].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.DEMOCRACY.bonus.interval: [ModifierArguments[ModifierId=DEMOCRACY_DISTRICT_PROCESSES_ACCUMULATING&Name=Interval].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.COMMUNISM.bonus.increment: [ModifierArguments[ModifierId=COMMUNISM_ALL_PRODUCTION_ACCUMULATING&Name=Increment].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.COMMUNISM.bonus.interval: [ModifierArguments[ModifierId=COMMUNISM_ALL_PRODUCTION_ACCUMULATING&Name=Interval].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.FASCISM.bonus.increment: [ModifierArguments[ModifierId=FASCISM_UNIT_PRODUCTION_ACCUMULATING&Name=Increment].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING governments.FASCISM.bonus.interval: [ModifierArguments[ModifierId=FASCISM_UNIT_PRODUCTION_ACCUMULATING&Name=Interval].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING greatPeople.GP_GENGHIS_KHAN_UNIT.class: [GreatPersonIndividuals[GreatPersonIndividualType=GREAT_PERSON_INDIVIDUAL_GENGHIS_KHAN].GreatPersonClassType] deleted by Expansion2_RemoveData.xml, cascade Types.Type -> GreatPersonIndividuals.GreatPersonIndividualType
    DANGLING greatPeople.GP_GENGHIS_KHAN_UNIT.era: [GreatPersonIndividuals[GreatPersonIndividualType=GREAT_PERSON_INDIVIDUAL_GENGHIS_KHAN].EraType] deleted by Expansion2_RemoveData.xml, cascade Types.Type -> GreatPersonIndividuals.GreatPersonIndividualType
    DANGLING legacyRate.AMERICA.government: [ModifierArguments[ModifierId=TRAIT_AUTOCRACY_BONUS_RATE&Name=BonusRate].ModifierId] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId
    DANGLING legacyRate.AMERICA.ratePct: [ModifierArguments[ModifierId=TRAIT_AUTOCRACY_BONUS_RATE&Name=BonusRate].Value] deleted by Expansion2_RemoveData.xml, cascade Modifiers.ModifierId -> ModifierArguments.ModifierId

## How a line leaves

Either the value is FIXED on both engines — a gate-stage change with a
battery, and the line is deleted from this file — or the mechanic leaves
both engines with its constant (a row the install deletes), or the tag becomes
STYLIZED, DERIVED or LAB in `cpu/data/provenance.ts` with the reason on the
row (a LAB tag names its `runs/` file). Nothing leaves by being re-read.
