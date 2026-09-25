# THE ROSTER CENSUS

Every trait modifier the owner's install gives a seated civilization or
leader, one ledger row each, with a state saying whether both engines pay
it. This file says what the census is and which rows are not paid; the
per-civilization dump it used to carry was a finished checklist and lives
in git history.

## How it is read

- **`docs/roster_ledger.json` is the truth.** 356 rows keyed by
  `ModifierId`, each `shipped`, `open: <AUDIT item> — <blocker>`, or `AI:`
  (a modifier that is nothing but the game's AI weighting, out of scope by
  the owner's 2026-09-20 ruling). Today: 354 shipped, 2 AI.
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

Trait MODIFIERS only. A seat's unique units and unique infrastructure are
catalog rows, not trait modifiers: they live in the unit, building, district
and improvement catalogs, are guarded by their own tests
(`tests/cpu/units/unique-*-units.test.ts`, `tests/cpu/city/unique-buildings`,
`unique-districts`, `uniques-infra`, `tests/cpu/map/unique-improvements`)
and are not counted here; a missing one is an AUDIT entry of its own.
Agendas are the game's AI and out of scope by the 2026-09-20 ruling.

## The rows Gathering Storm deletes

`TRAIT_CIVILIZATION_ITERU` (Egypt) carries thirteen `TRAIT_FLOODPLAINS_VALID_*`
modifiers: twelve in Base `Civilizations.xml` (Holy Site, Campus,
Encampment, Commercial Hub, Entertainment Complex, Theater Square,
Industrial Zone, Neighborhood, Aerodrome, Spaceport, Aqueduct —
`MODIFIER_PLAYER_CITIES_ADJUST_VALID_FEATURES_DISTRICTS` — and wonders,
`…_VALID_FEATURES_WONDERS`, each on `FEATURE_FLOODPLAINS`) and
`…_GOVERNMENT` in `Expansion1_Civilizations.xml`. A Gathering Storm game
never grants them: `Expansion2_RemoveData.xml` deletes all thirteen from
the trait and from `Modifiers`, and `Expansion2_Features.xml`'s
`Features_XP2` gives `FEATURE_FLOODPLAINS`, `_GRASSLAND` and `_PLAINS`
`ValidDistrictPlacement` and `ValidWonderPlacement` for every
civilization. So each row's ledger state is whether both engines do what
Gathering Storm put in its place:

- all thirteen are `shipped` — `canPlaceDistrictIn` has no floodplain test,
  the exporter's `du` plane admits floodplains, and `wonderTerrainOk` refuses
  a floodplain to no wonder.

## The rows that are not `shipped`

The two rows not `shipped` are out of
scope by the owner's ruling of 2026-09-20 — this project
models Civ 6's ENGINE, never its AI, and a diplomatic-action PREFERENCE is
nothing but the AI's weighting of an action it might choose. Deleted, not
parked:

- `TRAIT_BEFRIEND_MINOR_CIV_HOME_CONTINENT` and
  `TRAIT_NO_WAR_MINOR_CIV_HOME_CONTINENT` — T. Roosevelt /
  `ROOSEVELT_COROLLARY`: `EFFECT_ADJUST_DIPLOMATIC_ACTION_PREFERENCE` on
  `DIPLOACTION_GRANT_INFLUENCE_TOKEN` (favored) and
  `DIPLOACTION_DECLARE_WAR_MINOR_CIV` (disfavored).
