# THE ROSTER CENSUS

Every trait modifier the owner's install gives a seated civilization or
leader, one ledger row each, with a state saying whether both engines pay
it. This file says what the census is and which rows are not paid; the
per-civilization dump it used to carry was a finished checklist and lives
in git history.

## How it is read

- **`docs/roster_ledger.json` is the truth.** 343 rows keyed by
  `ModifierId`, each `shipped`, `open: <AUDIT item> — <blocker>`, or `AI:`
  (a modifier that is nothing but the game's AI weighting, out of scope by
  the owner's 2026-09-20 ruling). Today: 338 shipped, 3 open, 2 AI.
- **`tests/cpu/data/ledger-audit.test.ts` is the guard.** Every `open:` row
  must cite an AUDIT item that exists and is not CLOSED; every `AI:` row
  must quote the ruling it rests on; no third state exists, so a deferral
  has nowhere to hide.
- **The owner's install is the source.** `tools/civ6lab/xml_check.py`'s
  `Install` layers Base <- Expansion1 <- Expansion2 in each pack's
  `.modinfo` order and takes the last write. The census turns a trait into
  its effect types with their arguments by walking
  `inst.tables['CivilizationTraits']`, `['LeaderTraits']`,
  `['TraitModifiers']`, `['Modifiers']`, `['DynamicModifiers']` and
  `['ModifierArguments']`. A row is added or corrected by re-reading the
  XML — never from a wiki or the civilopedia.

## Scope

34 civilizations, 38 civilization-leader pairs: the base game, Rise and
Fall and Gathering Storm — every `CIVILIZATION_LEVEL_FULL_CIV` row the
install ships. Barbarians, Free Cities and the city-states are not seats.
`world/roster.ts` holds the same 34 and 38.

The standalone DLC packs' civilizations (Persia and Macedon, Nubia, Poland,
Australia, Khmer and Indonesia, and the New Frontier passes) have no seat
here, so their uniques have no row: a Hypaspist or an Immortal is out of
scope by construction, not an open item.

Trait MODIFIERS only. A seat's unique units are AUDIT C-78 and its unique
infrastructure C-79 — their own censuses, not counted here. Agendas are the
game's AI and out of scope by the 2026-09-20 ruling.

## The five rows that are not `shipped`

Three wait on AUDIT **C-64** — neither engine holds a seat's MAJORITY
religion, and each of these modifiers asks for one:

- `TRAIT_CITY_STATE_TOKEN_SAME_RELIGION` — Tamar / `RELIGION_CITY_STATES`:
  a duplicate influence token from a city-state of the seat's religion.
- `TRAIT_COMBAT_BONUS_OTHER_RELIGION` — Philip II / `EL_ESCORIAL`:
  `ABILITY_PHILIP_II_COMBAT_BONUS_OTHER_RELIGION`, strength against a unit
  of a different religion.
- `TRAIT_GAINS_FOUNDER_BELIEF_MAJORITY_RELIGION` — Mvemba /
  `RELIGIOUS_CONVERT`: the seat gains the founder belief of the religion
  the majority of its cities follow.

Two are out of scope by the owner's ruling of 2026-09-20 — this project
models Civ 6's ENGINE, never its AI, and a diplomatic-action PREFERENCE is
nothing but the AI's weighting of an action it might choose. Deleted, not
parked:

- `TRAIT_BEFRIEND_MINOR_CIV_HOME_CONTINENT` and
  `TRAIT_NO_WAR_MINOR_CIV_HOME_CONTINENT` — T. Roosevelt /
  `ROOSEVELT_COROLLARY`: `EFFECT_ADJUST_DIPLOMATIC_ACTION_PREFERENCE` on
  `DIPLOACTION_GRANT_INFLUENCE_TOKEN` (favored) and
  `DIPLOACTION_DECLARE_WAR_MINOR_CIV` (disfavored).
