/**
 * THE WORLD CONGRESS'S VALID TARGETS (cpu/core/congress.ts), written by
 * tools/install/ai_tables.py (`build_congress`) from the layered install
 * and DLC/Expansion2/Scripts/WorldCongress.lua (`--check` reports a stale
 * file): per ResolutionType its TargetKind, the candidates its
 * ValidationLua handler offers in DATABASE ORDER with their database
 * index, and the filter the engine applies live.
 */
export interface CongressTargetEntry { type: string; index: number; era?: number }
export interface CongressTargetTable {
  kind: string;
  filter: 'met' | 'onMap' | 'era' | 'gpAvail' | 'founded' | null;
  entries: readonly CongressTargetEntry[];
}

export const CONGRESS_TARGET_TABLES: Readonly<Record<string, CongressTargetTable>> = {
 "WC_RES_DIPLOVICTORY": {
  "kind": "PLAYER",
  "filter": "met",
  "entries": []
 },
 "WC_RES_LUXURY": {
  "kind": "RESOURCE",
  "filter": "onMap",
  "entries": [
   {
    "type": "RESOURCE_CITRUS",
    "index": 10
   },
   {
    "type": "RESOURCE_COCOA",
    "index": 11
   },
   {
    "type": "RESOURCE_COFFEE",
    "index": 12
   },
   {
    "type": "RESOURCE_COTTON",
    "index": 13
   },
   {
    "type": "RESOURCE_DIAMONDS",
    "index": 14
   },
   {
    "type": "RESOURCE_DYES",
    "index": 15
   },
   {
    "type": "RESOURCE_FURS",
    "index": 16
   },
   {
    "type": "RESOURCE_GYPSUM",
    "index": 17
   },
   {
    "type": "RESOURCE_INCENSE",
    "index": 18
   },
   {
    "type": "RESOURCE_IVORY",
    "index": 19
   },
   {
    "type": "RESOURCE_JADE",
    "index": 20
   },
   {
    "type": "RESOURCE_MARBLE",
    "index": 21
   },
   {
    "type": "RESOURCE_MERCURY",
    "index": 22
   },
   {
    "type": "RESOURCE_PEARLS",
    "index": 23
   },
   {
    "type": "RESOURCE_SALT",
    "index": 24
   },
   {
    "type": "RESOURCE_SILK",
    "index": 25
   },
   {
    "type": "RESOURCE_SILVER",
    "index": 26
   },
   {
    "type": "RESOURCE_SPICES",
    "index": 27
   },
   {
    "type": "RESOURCE_SUGAR",
    "index": 28
   },
   {
    "type": "RESOURCE_TEA",
    "index": 29
   },
   {
    "type": "RESOURCE_TOBACCO",
    "index": 30
   },
   {
    "type": "RESOURCE_TRUFFLES",
    "index": 31
   },
   {
    "type": "RESOURCE_WHALES",
    "index": 32
   },
   {
    "type": "RESOURCE_WINE",
    "index": 33
   },
   {
    "type": "RESOURCE_AMBER",
    "index": 49
   },
   {
    "type": "RESOURCE_OLIVES",
    "index": 50
   },
   {
    "type": "RESOURCE_TURTLES",
    "index": 51
   },
   {
    "type": "RESOURCE_HONEY",
    "index": 53
   }
  ]
 },
 "WC_RES_TRADE_TREATY": {
  "kind": "PLAYER",
  "filter": "met",
  "entries": []
 },
 "WC_RES_WORLD_RELIGION": {
  "kind": "RELIGION",
  "filter": "founded",
  "entries": []
 },
 "WC_RES_MERCENARY_COMPANIES": {
  "kind": "YIELD",
  "filter": null,
  "entries": [
   {
    "type": "YIELD_PRODUCTION",
    "index": 1
   },
   {
    "type": "YIELD_GOLD",
    "index": 2
   },
   {
    "type": "YIELD_FAITH",
    "index": 5
   }
  ]
 },
 "WC_RES_ARMS_CONTROL": {
  "kind": "PLAYER",
  "filter": "met",
  "entries": []
 },
 "WC_RES_HERITAGE_ORG": {
  "kind": "GREATWORKOBJECT",
  "filter": null,
  "entries": [
   {
    "type": "GREATWORKOBJECT_SCULPTURE",
    "index": 0
   },
   {
    "type": "GREATWORKOBJECT_PORTRAIT",
    "index": 1
   },
   {
    "type": "GREATWORKOBJECT_LANDSCAPE",
    "index": 2
   },
   {
    "type": "GREATWORKOBJECT_RELIGIOUS",
    "index": 3
   },
   {
    "type": "GREATWORKOBJECT_ARTIFACT",
    "index": 4
   },
   {
    "type": "GREATWORKOBJECT_WRITING",
    "index": 5
   },
   {
    "type": "GREATWORKOBJECT_MUSIC",
    "index": 6
   },
   {
    "type": "GREATWORKOBJECT_RELIC",
    "index": 7
   }
  ]
 },
 "WC_RES_WORLD_IDEOLOGY": {
  "kind": "GOVERNMENT",
  "filter": null,
  "entries": [
   {
    "type": "GOVERNMENT_AUTOCRACY",
    "index": 1
   },
   {
    "type": "GOVERNMENT_OLIGARCHY",
    "index": 2
   },
   {
    "type": "GOVERNMENT_CLASSICAL_REPUBLIC",
    "index": 3
   },
   {
    "type": "GOVERNMENT_MONARCHY",
    "index": 4
   },
   {
    "type": "GOVERNMENT_THEOCRACY",
    "index": 5
   },
   {
    "type": "GOVERNMENT_MERCHANT_REPUBLIC",
    "index": 6
   },
   {
    "type": "GOVERNMENT_FASCISM",
    "index": 7
   },
   {
    "type": "GOVERNMENT_COMMUNISM",
    "index": 8
   },
   {
    "type": "GOVERNMENT_DEMOCRACY",
    "index": 9
   },
   {
    "type": "GOVERNMENT_CORPORATE_LIBERTARIANISM",
    "index": 10
   },
   {
    "type": "GOVERNMENT_DIGITAL_DEMOCRACY",
    "index": 11
   },
   {
    "type": "GOVERNMENT_SYNTHETIC_TECHNOCRACY",
    "index": 12
   }
  ]
 },
 "WC_RES_URBAN_DEVELOPMENT": {
  "kind": "DISTRICT",
  "filter": "era",
  "entries": [
   {
    "type": "DISTRICT_CITY_CENTER",
    "index": 0,
    "era": 0
   },
   {
    "type": "DISTRICT_HOLY_SITE",
    "index": 1,
    "era": 0
   },
   {
    "type": "DISTRICT_CAMPUS",
    "index": 2,
    "era": 0
   },
   {
    "type": "DISTRICT_ENCAMPMENT",
    "index": 3,
    "era": 0
   },
   {
    "type": "DISTRICT_HARBOR",
    "index": 4,
    "era": 1
   },
   {
    "type": "DISTRICT_AERODROME",
    "index": 5,
    "era": 5
   },
   {
    "type": "DISTRICT_COMMERCIAL_HUB",
    "index": 6,
    "era": 1
   },
   {
    "type": "DISTRICT_ENTERTAINMENT_COMPLEX",
    "index": 7,
    "era": 1
   },
   {
    "type": "DISTRICT_THEATER",
    "index": 8,
    "era": 1
   },
   {
    "type": "DISTRICT_INDUSTRIAL_ZONE",
    "index": 9,
    "era": 2
   },
   {
    "type": "DISTRICT_GOVERNMENT",
    "index": 23,
    "era": 0
   },
   {
    "type": "DISTRICT_WATER_ENTERTAINMENT_COMPLEX",
    "index": 24,
    "era": 4
   },
   {
    "type": "DISTRICT_PRESERVE",
    "index": 34,
    "era": 0
   },
   {
    "type": "DISTRICT_DIPLOMATIC_QUARTER",
    "index": 35,
    "era": 1
   }
  ]
 },
 "WC_RES_BORDER_CONTROL": {
  "kind": "PLAYER",
  "filter": "met",
  "entries": []
 },
 "WC_RES_PUBLIC_WORKS": {
  "kind": "PROJECT",
  "filter": null,
  "entries": [
   {
    "type": "PROJECT_LAUNCH_EARTH_SATELLITE",
    "index": 1
   },
   {
    "type": "PROJECT_LAUNCH_MOON_LANDING",
    "index": 2
   },
   {
    "type": "PROJECT_MANHATTAN_PROJECT",
    "index": 3
   },
   {
    "type": "PROJECT_OPERATION_IVY",
    "index": 4
   },
   {
    "type": "PROJECT_BUILD_NUCLEAR_DEVICE",
    "index": 5
   },
   {
    "type": "PROJECT_BUILD_THERMONUCLEAR_DEVICE",
    "index": 6
   },
   {
    "type": "PROJECT_LAUNCH_MARS_BASE",
    "index": 23
   },
   {
    "type": "PROJECT_LAUNCH_EXOPLANET_EXPEDITION",
    "index": 24
   },
   {
    "type": "PROJECT_ORBITAL_LASER",
    "index": 25
   },
   {
    "type": "PROJECT_TERRESTRIAL_LASER",
    "index": 26
   }
  ]
 },
 "WC_RES_PATRONAGE": {
  "kind": "GREATPERSONCLASS",
  "filter": "gpAvail",
  "entries": [
   {
    "type": "GREAT_PERSON_CLASS_GENERAL",
    "index": 0
   },
   {
    "type": "GREAT_PERSON_CLASS_ADMIRAL",
    "index": 1
   },
   {
    "type": "GREAT_PERSON_CLASS_ENGINEER",
    "index": 2
   },
   {
    "type": "GREAT_PERSON_CLASS_MERCHANT",
    "index": 3
   },
   {
    "type": "GREAT_PERSON_CLASS_PROPHET",
    "index": 4
   },
   {
    "type": "GREAT_PERSON_CLASS_SCIENTIST",
    "index": 5
   },
   {
    "type": "GREAT_PERSON_CLASS_WRITER",
    "index": 6
   },
   {
    "type": "GREAT_PERSON_CLASS_ARTIST",
    "index": 7
   },
   {
    "type": "GREAT_PERSON_CLASS_MUSICIAN",
    "index": 8
   },
   {
    "type": "GREAT_PERSON_CLASS_COMANDANTE_GENERAL",
    "index": 9
   }
  ]
 },
 "WC_RES_GLOBAL_ENERGY_TREATY": {
  "kind": "BUILDING",
  "filter": null,
  "entries": [
   {
    "type": "BUILDING_POWER_PLANT",
    "index": 33
   },
   {
    "type": "BUILDING_COAL_POWER_PLANT",
    "index": 115
   },
   {
    "type": "BUILDING_FOSSIL_FUEL_POWER_PLANT",
    "index": 116
   }
  ]
 },
 "WC_RES_SOVEREIGNTY": {
  "kind": "MINORCIVBONUS",
  "filter": null,
  "entries": [
   {
    "type": "MINOR_CIV_BONUS_SCIENTIFIC",
    "index": 0
   },
   {
    "type": "MINOR_CIV_BONUS_RELIGIOUS",
    "index": 1
   },
   {
    "type": "MINOR_CIV_BONUS_TRADE",
    "index": 2
   },
   {
    "type": "MINOR_CIV_BONUS_CULTURAL",
    "index": 3
   },
   {
    "type": "MINOR_CIV_BONUS_MILITARISTIC",
    "index": 4
   },
   {
    "type": "MINOR_CIV_BONUS_INDUSTRIAL",
    "index": 5
   }
  ]
 },
 "WC_RES_MIGRATION_TREATY": {
  "kind": "PLAYER",
  "filter": "met",
  "entries": []
 },
 "WC_RES_DEFORESTATION_TREATY": {
  "kind": "FEATURE",
  "filter": null,
  "entries": [
   {
    "type": "FEATURE_JUNGLE",
    "index": 2
   },
   {
    "type": "FEATURE_FOREST",
    "index": 3
   },
   {
    "type": "FEATURE_MARSH",
    "index": 5
   }
  ]
 },
 "WC_RES_PUBLIC_RELATIONS": {
  "kind": "PLAYER",
  "filter": "met",
  "entries": []
 },
 "WC_RES_ESPIONAGE_PACT": {
  "kind": "UNITOPERATION",
  "filter": null,
  "entries": [
   {
    "type": "UNITOPERATION_SPY_DISRUPT_ROCKETRY",
    "index": 40
   },
   {
    "type": "UNITOPERATION_SPY_GREAT_WORK_HEIST",
    "index": 42
   },
   {
    "type": "UNITOPERATION_SPY_RECRUIT_PARTISANS",
    "index": 44
   },
   {
    "type": "UNITOPERATION_SPY_SABOTAGE_PRODUCTION",
    "index": 45
   },
   {
    "type": "UNITOPERATION_SPY_SIPHON_FUNDS",
    "index": 46
   },
   {
    "type": "UNITOPERATION_SPY_STEAL_TECH_BOOST",
    "index": 47
   },
   {
    "type": "UNITOPERATION_SPY_FABRICATE_SCANDAL",
    "index": 57
   },
   {
    "type": "UNITOPERATION_SPY_FOMENT_UNREST",
    "index": 58
   },
   {
    "type": "UNITOPERATION_SPY_NEUTRALIZE_GOVERNOR",
    "index": 59
   },
   {
    "type": "UNITOPERATION_SPY_BREACH_DAM",
    "index": 62
   }
  ]
 },
 "WC_RES_MILITARY_ADVISORY": {
  "kind": "UNITPROMOTIONCLASS",
  "filter": null,
  "entries": [
   {
    "type": "PROMOTION_CLASS_RECON",
    "index": 0
   },
   {
    "type": "PROMOTION_CLASS_MELEE",
    "index": 1
   },
   {
    "type": "PROMOTION_CLASS_RANGED",
    "index": 2
   },
   {
    "type": "PROMOTION_CLASS_SIEGE",
    "index": 3
   },
   {
    "type": "PROMOTION_CLASS_ANTI_CAVALRY",
    "index": 4
   },
   {
    "type": "PROMOTION_CLASS_LIGHT_CAVALRY",
    "index": 5
   },
   {
    "type": "PROMOTION_CLASS_HEAVY_CAVALRY",
    "index": 6
   }
  ]
 }
};
