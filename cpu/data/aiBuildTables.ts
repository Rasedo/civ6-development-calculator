/**
 * THE CITY BUILD AI'S TABLES (cpu/core/aiCityBuild.ts), written by
 * tools/install/ai_tables.py from the layered install (`--check` reports a
 * stale file): the Buildings, Units and Projects in DATABASE ORDER — the
 * index the AI's value tables run in — with the columns and child rows
 * the values and the Default Specialization pick read.
 */
import type { AiBuildingRow, AiDistrictRow, AiFeatureRow, AiProjectRow, AiUnitRow } from '../core/aiCityBuild';
import type { AiImprovementRow, AiResourceRow } from '../core/aiResource';

export const AI_BUILDINGS: readonly AiBuildingRow[] = [
 {
  "type": "BUILDING_MONUMENT",
  "cost": 60,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_CITY_CENTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "MONUMENT_LOYALTY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "MONUMENT_CULTURE_AT_FULL_LOYALTY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "Amount": "1",
     "YieldType": "YIELD_CULTURE"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_FULL_LOYALTY",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_PALACE",
  "cost": 1,
  "maintenance": 0,
  "housing": 1,
  "entertainment": 2,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_CITY_CENTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": 1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": true,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ],
   [
    "YIELD_GOLD",
    5
   ],
   [
    "YIELD_PRODUCTION",
    2
   ],
   [
    "YIELD_SCIENCE",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [
   {
    "n": 1,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_SCULPTURE",
     "PSEUDOYIELD_GREATWORK_PORTRAIT",
     "PSEUDOYIELD_GREATWORK_LANDSCAPE",
     "PSEUDOYIELD_GREATWORK_RELIGIOUS",
     "PSEUDOYIELD_GREATWORK_WRITING",
     "PSEUDOYIELD_GREATWORK_MUSIC",
     "PSEUDOYIELD_GREATWORK_RELIC"
    ]
   }
  ],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "PALACE_ADJUST_GARRISON_STRENGTH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_INNER_DEFENSE",
    "args": {
     "Amount": "3"
    }
   }
  ]
 },
 {
  "type": "BUILDING_BARRACKS",
  "cost": 90,
  "maintenance": 1,
  "housing": 1,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_BRONZE_WORKING",
  "civic": null,
  "district": "DISTRICT_ENCAMPMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_STABLE"
  ],
  "yields": [
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_GENERAL",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "BARRACKS_TRAINED_UNIT_XP_MODIFIER",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_BARRACKS_TRAINED_UNIT_XP"
    },
    "ability": [
     {
      "id": "BARRACKS_TRAINED_UNIT_XP",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
      "args": {
       "Amount": "25"
      }
     }
    ]
   },
   {
    "id": "BARRACKS_ADJUST_RESOURCE_STOCKPILE_CAP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_RESOURCE_STOCKPILE_CAP",
    "args": {
     "Amount": "10"
    }
   },
   {
    "id": "LAHORE_NIHANG_BARRACKS_ABILITY",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_NIHANG_BARRACKS_STRENGTH"
    },
    "ability": [
     {
      "id": "NIHANG_BARRACKS_STRENGTH",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_COMBAT_STRENGTH",
      "args": {
       "Amount": "15"
      }
     }
    ]
   }
  ]
 },
 {
  "type": "BUILDING_GRANARY",
  "cost": 65,
  "maintenance": 0,
  "housing": 2,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_POTTERY",
  "civic": null,
  "district": "DISTRICT_CITY_CENTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_LIBRARY",
  "cost": 90,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_WRITING",
  "civic": null,
  "district": "DISTRICT_CAMPUS",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_SHRINE",
  "cost": 70,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_ASTROLOGY",
  "civic": null,
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_PROPHET",
    1
   ]
  ],
  "copies": [],
  "units": [
   "UNIT_MISSIONARY"
  ],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_WALLS",
  "cost": 80,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": true,
  "outerDefenseStrength": 3,
  "defenseModifier": 0,
  "tech": "TECH_MASONRY",
  "civic": null,
  "district": "DISTRICT_CITY_CENTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_WATER_MILL",
  "cost": 80,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_THE_WHEEL",
  "civic": null,
  "district": "DISTRICT_CITY_CENTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": true,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "WATERMILL_ADDRICEFOOD",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "Amount": "1",
     "YieldType": "YIELD_FOOD"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_RESOURCE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_RICE"
       }
      }
     ]
    }
   },
   {
    "id": "WATERMILL_ADDWHEATYIELD",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "Amount": "1",
     "YieldType": "YIELD_FOOD"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_RESOURCE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_WHEAT"
       }
      }
     ]
    }
   },
   {
    "id": "WATERMILL_ADDMAIZEYIELD",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "Amount": "1",
     "YieldType": "YIELD_FOOD"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_RESOURCE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_MAIZE"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_ARENA",
  "cost": 150,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 2,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_GAMES_RECREATION",
  "district": "DISTRICT_ENTERTAINMENT_COMPLEX",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_LIGHTHOUSE",
  "cost": 120,
  "maintenance": 0,
  "housing": 1,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_CELESTIAL_NAVIGATION",
  "civic": null,
  "district": "DISTRICT_HARBOR",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ADMIRAL",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "LIGHTHOUSE_TRAINED_UNIT_XP_MODIFIER",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_LIGHTHOUSE_TRAINED_UNIT_XP"
    },
    "ability": [
     {
      "id": "LIGHTHOUSE_TRAINED_UNIT_XP",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
      "args": {
       "Amount": "25"
      }
     }
    ]
   },
   {
    "id": "LIGHTHOUSE_COAST_FOOD",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_COAST"
       }
      }
     ]
    }
   },
   {
    "id": "LIGHTHOUSE_TRADE_ROUTE_CAPACITY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_CAPACITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": true,
       "args": {
        "BuildingType": "BUILDING_MARKET",
        "MustBeFunctioning": "false"
       }
      }
     ]
    }
   },
   {
    "id": "LIGHTHOUSE_COASTAL_CITY_HOUSING",
    "collection": "COLLECTION_OWNER_CITY",
    "effect": "EFFECT_ADJUST_BUILDING_HOUSING",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_COAST",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_MARKET",
  "cost": 120,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_CURRENCY",
  "civic": null,
  "district": "DISTRICT_COMMERCIAL_HUB",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "MARKET_TRADE_ROUTE_CAPACITY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_CAPACITY",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_STABLE",
  "cost": 120,
  "maintenance": 1,
  "housing": 1,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_HORSEBACK_RIDING",
  "civic": null,
  "district": "DISTRICT_ENCAMPMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_BARRACKS"
  ],
  "yields": [
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_GENERAL",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "STABLE_TRAINED_UNIT_XP_MODIFIER",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_STABLE_TRAINED_UNIT_XP"
    },
    "ability": [
     {
      "id": "STABLE_TRAINED_UNIT_XP",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
      "args": {
       "Amount": "25"
      }
     }
    ]
   },
   {
    "id": "STABLE_ADJUST_RESOURCE_STOCKPILE_CAP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_RESOURCE_STOCKPILE_CAP",
    "args": {
     "Amount": "10"
    }
   }
  ]
 },
 {
  "type": "BUILDING_TEMPLE",
  "cost": 120,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_THEOLOGY",
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    4
   ]
  ],
  "prereqs": [
   "BUILDING_SHRINE"
  ],
  "greatWorks": [
   {
    "n": 1,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_RELIC"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_PROPHET",
    1
   ]
  ],
  "copies": [],
  "units": [
   "UNIT_APOSTLE",
   "UNIT_INQUISITOR",
   "UNIT_WARRIOR_MONK",
   "UNIT_GURU"
  ],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_STAVE_CHURCH",
  "cost": 120,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_THEOLOGY",
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_STAVE_CHURCH",
  "replaces": "BUILDING_TEMPLE",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    4
   ]
  ],
  "prereqs": [
   "BUILDING_SHRINE"
  ],
  "greatWorks": [
   {
    "n": 1,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_RELIC"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_PROPHET",
    1
   ]
  ],
  "copies": [],
  "units": [
   "UNIT_APOSTLE",
   "UNIT_INQUISITOR",
   "UNIT_WARRIOR_MONK",
   "UNIT_GURU"
  ],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "STAVE_CHURCH_FAITHWOODSADJACENCY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_FEATURE_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_HOLY_SITE",
     "FeatureType": "FEATURE_FOREST",
     "YieldType": "YIELD_FAITH",
     "Amount": "1",
     "Description": "LOC_STAVE_CHURCH_FOREST_FAITH"
    }
   },
   {
    "id": "STAVECHURCH_SEARESOURCE_PRODUCTION",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_RESOURCE_VISIBLE",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_COAST"
       }
      }
     ]
    }
   },
   {
    "id": "STAVE_CHURCH_INFLUENCEPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_INFLUENCE_POINTS_PER_TURN",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_LEADER_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "LeaderType": "LEADER_HARALD_ALT"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_AMPHITHEATER",
  "cost": 150,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_DRAMA_POETRY",
  "district": "DISTRICT_THEATER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [
   {
    "n": 2,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_WRITING"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_WRITER",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_CASTLE",
  "cost": 220,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": true,
  "outerDefenseStrength": 3,
  "defenseModifier": 0,
  "tech": "TECH_CASTLES",
  "civic": null,
  "district": "DISTRICT_CITY_CENTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [
   "BUILDING_WALLS"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "CASTLE_PREVENT_MELEE_ATTACK_OUTER_DEFENSES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_PREVENT_MELEE_ATTACK_OUTER_DEFENSES",
    "args": {}
   }
  ]
 },
 {
  "type": "BUILDING_UNIVERSITY",
  "cost": 250,
  "maintenance": 2,
  "housing": 1,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_EDUCATION",
  "civic": null,
  "district": "DISTRICT_CAMPUS",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    4
   ]
  ],
  "prereqs": [
   "BUILDING_LIBRARY"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_MADRASA",
  "cost": 250,
  "maintenance": 2,
  "housing": 1,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_THEOLOGY",
  "district": "DISTRICT_CAMPUS",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_MADRASA",
  "replaces": "BUILDING_UNIVERSITY",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    5
   ]
  ],
  "prereqs": [
   "BUILDING_LIBRARY"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    1
   ]
  ],
  "copies": [
   [
    "YIELD_SCIENCE",
    "YIELD_FAITH"
   ]
  ],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_WORKSHOP",
  "cost": 195,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_APPRENTICESHIP",
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    3
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_ARMORY",
  "cost": 195,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_MILITARY_ENGINEERING",
  "civic": null,
  "district": "DISTRICT_ENCAMPMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_BARRACKS",
   "BUILDING_STABLE"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_GENERAL",
    1
   ]
  ],
  "copies": [],
  "units": [
   "UNIT_MILITARY_ENGINEER"
  ],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "ARMORY_TRAINED_UNIT_XP_MODIFIER",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_ARMORY_TRAINED_UNIT_XP"
    },
    "ability": [
     {
      "id": "ARMORY_TRAINED_UNIT_XP",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
      "args": {
       "Amount": "25"
      }
     }
    ]
   },
   {
    "id": "ARMORY_ADJUST_RESOURCE_STOCKPILE_CAP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_RESOURCE_STOCKPILE_CAP",
    "args": {
     "Amount": "10"
    }
   },
   {
    "id": "LAHORE_NIHANG_ARMORY_ABILITY",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_NIHANG_ARMORY_STRENGTH"
    },
    "ability": [
     {
      "id": "NIHANG_ARMORY_STRENGTH",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_COMBAT_STRENGTH",
      "args": {
       "Amount": "15"
      }
     }
    ]
   }
  ]
 },
 {
  "type": "BUILDING_SHIPYARD",
  "cost": 290,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_MASS_PRODUCTION",
  "civic": null,
  "district": "DISTRICT_HARBOR",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ]
  ],
  "prereqs": [
   "BUILDING_LIGHTHOUSE"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ADMIRAL",
    1
   ]
  ],
  "copies": [
   [
    "YIELD_GOLD",
    "YIELD_PRODUCTION"
   ]
  ],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "SHIPYARD_TRAINED_UNIT_XP_MODIFIER",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_SHIPYARD_TRAINED_UNIT_XP"
    },
    "ability": [
     {
      "id": "SHIPYARD_TRAINED_UNIT_XP",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
      "args": {
       "Amount": "25"
      }
     }
    ]
   },
   {
    "id": "SHIPYARD_UNIMPROVED_COAST_PRODUCTION",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_COAST"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_HAS_ANY_IMPROVEMENT",
       "inverse": true,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_BANK",
  "cost": 290,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_BANKING",
  "civic": null,
  "district": "DISTRICT_COMMERCIAL_HUB",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    5
   ]
  ],
  "prereqs": [
   "BUILDING_MARKET"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_STAR_FORT",
  "cost": 300,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": true,
  "outerDefenseStrength": 3,
  "defenseModifier": 0,
  "tech": "TECH_SIEGE_TACTICS",
  "civic": null,
  "district": "DISTRICT_CITY_CENTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [
   "BUILDING_CASTLE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "STAR_FORT_PREVENT_MELEE_ATTACK_OUTER_DEFENSES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_PREVENT_MELEE_ATTACK_OUTER_DEFENSES",
    "args": {}
   },
   {
    "id": "STAR_FORT_PREVENT_BYPASS_OUTER_DEFENSE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_PREVENT_BYPASS_OUTER_DEFENSES",
    "args": {}
   }
  ]
 },
 {
  "type": "BUILDING_MUSEUM_ART",
  "cost": 290,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_HUMANISM",
  "district": "DISTRICT_THEATER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_MUSEUM_ARTIFACT"
  ],
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ]
  ],
  "prereqs": [
   "BUILDING_AMPHITHEATER"
  ],
  "greatWorks": [
   {
    "n": 3,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_SCULPTURE",
     "PSEUDOYIELD_GREATWORK_PORTRAIT",
     "PSEUDOYIELD_GREATWORK_LANDSCAPE",
     "PSEUDOYIELD_GREATWORK_RELIGIOUS"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_WRITER",
    1
   ],
   [
    "PSEUDOYIELD_GPP_ARTIST",
    2
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_MUSEUM_ARTIFACT",
  "cost": 290,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_HUMANISM",
  "district": "DISTRICT_THEATER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_MUSEUM_ART"
  ],
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ]
  ],
  "prereqs": [
   "BUILDING_AMPHITHEATER"
  ],
  "greatWorks": [
   {
    "n": 3,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_ARTIFACT"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_WRITER",
    1
   ],
   [
    "PSEUDOYIELD_GPP_ARTIST",
    2
   ]
  ],
  "copies": [],
  "units": [
   "UNIT_ARCHAEOLOGIST"
  ],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_FACTORY",
  "cost": 330,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 6,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_INDUSTRIALIZATION",
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_WORKSHOP"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_ELECTRONICS_FACTORY",
  "cost": 330,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 6,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_INDUSTRIALIZATION",
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_ELECTRONICS_FACTORY",
  "replaces": "BUILDING_FACTORY",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_WORKSHOP"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "ELECTRONICSFACTORY_CULTURE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_ELECTRONICS_FACTORY",
     "Amount": "4",
     "YieldType": "YIELD_CULTURE"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_TECHNOLOGY",
       "inverse": false,
       "args": {
        "TechnologyType": "TECH_ELECTRICITY"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_STOCK_EXCHANGE",
  "cost": 330,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_ECONOMICS",
  "civic": null,
  "district": "DISTRICT_COMMERCIAL_HUB",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    4
   ]
  ],
  "prereqs": [
   "BUILDING_BANK"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_MILITARY_ACADEMY",
  "cost": 330,
  "maintenance": 2,
  "housing": 1,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_MILITARY_SCIENCE",
  "civic": null,
  "district": "DISTRICT_ENCAMPMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    4
   ]
  ],
  "prereqs": [
   "BUILDING_ARMORY"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_GENERAL",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "MILITARY_ACADEMY_TRAINED_UNIT_XP_MODIFIER",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_MILITARY_ACADEMY_TRAINED_UNIT_XP"
    },
    "ability": [
     {
      "id": "MILITARY_ACADEMY_TRAINED_UNIT_XP",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
      "args": {
       "Amount": "25"
      }
     }
    ]
   },
   {
    "id": "MILITARY_ACADEMY_TRAINED_CORPS_ARMY_DISCOUNT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_CORPS_ARMY_PRODUCTION",
    "args": {
     "UnitDomain": "DOMAIN_LAND",
     "Amount": "25"
    }
   },
   {
    "id": "MILITARY_ACADEMY_ADJUST_RESOURCE_STOCKPILE_CAP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_RESOURCE_STOCKPILE_CAP",
    "args": {
     "Amount": "10"
    }
   },
   {
    "id": "LAHORE_NIHANG_ACADEMY_ABILITY",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_NIHANG_ACADEMY_STRENGTH"
    },
    "ability": [
     {
      "id": "NIHANG_ACADEMY_STRENGTH",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_COMBAT_STRENGTH",
      "args": {
       "Amount": "15"
      }
     }
    ]
   }
  ]
 },
 {
  "type": "BUILDING_SEWER",
  "cost": 200,
  "maintenance": 2,
  "housing": 2,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_SANITATION",
  "civic": null,
  "district": "DISTRICT_CITY_CENTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_ZOO",
  "cost": 360,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 1,
  "regionalRange": 6,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_NATURAL_HISTORY",
  "district": "DISTRICT_ENTERTAINMENT_COMPLEX",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [
   "BUILDING_ARENA"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "ZOO_RAINFOREST_SCIENCE",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_JUNGLE"
       }
      }
     ]
    }
   },
   {
    "id": "ZOO_MARSH_SCIENCE",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_MARSH"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_HANGAR",
  "cost": 380,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_FLIGHT",
  "civic": null,
  "district": "DISTRICT_AERODROME",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "HANGAR_TRAINED_AIRCRAFT_XP_MODIFIER",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_HANGAR_TRAINED_AIRCRAFT_XP"
    },
    "ability": [
     {
      "id": "HANGAR_TRAINED_AIRCRAFT_XP",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
      "args": {
       "Amount": "25"
      }
     }
    ]
   },
   {
    "id": "HANGAR_BONUS_AIR_SLOTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_DISTRICT_AIR_SLOTS",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_SEAPORT",
  "cost": 440,
  "maintenance": 0,
  "housing": 1,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_ELECTRICITY",
  "civic": null,
  "district": "DISTRICT_HARBOR",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    2
   ],
   [
    "YIELD_FOOD",
    2
   ]
  ],
  "prereqs": [
   "BUILDING_SHIPYARD"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ADMIRAL",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "SEAPORT_TRAINED_UNIT_XP_MODIFIER",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_SEAPORT_TRAINED_UNIT_XP"
    },
    "ability": [
     {
      "id": "SEAPORT_TRAINED_UNIT_XP",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
      "args": {
       "Amount": "25"
      }
     }
    ]
   },
   {
    "id": "SEAPORT_TRAINED_CORPS_ARMY_DISCOUNT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_CORPS_ARMY_PRODUCTION",
    "args": {
     "UnitDomain": "DOMAIN_SEA",
     "Amount": "25"
    }
   },
   {
    "id": "SEAPORT_COAST_GOLD",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_COAST"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_POWER_PLANT",
  "cost": 480,
  "maintenance": 3,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 6,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_NUCLEAR_FISSION",
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_COAL_POWER_PLANT",
   "BUILDING_FOSSIL_FUEL_POWER_PLANT"
  ],
  "yields": [
   [
    "YIELD_PRODUCTION",
    4
   ],
   [
    "YIELD_SCIENCE",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_FACTORY"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": "RESOURCE_URANIUM",
  "modifiers": []
 },
 {
  "type": "BUILDING_BROADCAST_CENTER",
  "cost": 440,
  "maintenance": 3,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_RADIO",
  "civic": null,
  "district": "DISTRICT_THEATER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ]
  ],
  "prereqs": [
   "BUILDING_MUSEUM_ART",
   "BUILDING_MUSEUM_ARTIFACT"
  ],
  "greatWorks": [
   {
    "n": 1,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_MUSIC"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ARTIST",
    1
   ],
   [
    "PSEUDOYIELD_GPP_MUSICIAN",
    2
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_FILM_STUDIO",
  "cost": 440,
  "maintenance": 3,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_RADIO",
  "civic": null,
  "district": "DISTRICT_THEATER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_FILM_STUDIO",
  "replaces": "BUILDING_BROADCAST_CENTER",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ]
  ],
  "prereqs": [
   "BUILDING_MUSEUM_ART",
   "BUILDING_MUSEUM_ARTIFACT"
  ],
  "greatWorks": [
   {
    "n": 1,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_MUSIC"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ARTIST",
    1
   ],
   [
    "PSEUDOYIELD_GPP_MUSICIAN",
    2
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "FILMSTUDIO_ENHANCEDLATETOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TOURISM_LATE_ERAS",
    "args": {
     "Modifier": "100",
     "MinimumEra": "ERA_MODERN"
    }
   }
  ]
 },
 {
  "type": "BUILDING_RESEARCH_LAB",
  "cost": 440,
  "maintenance": 3,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_CHEMISTRY",
  "civic": null,
  "district": "DISTRICT_CAMPUS",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_UNIVERSITY"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_AIRPORT",
  "cost": 480,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_ADVANCED_FLIGHT",
  "civic": null,
  "district": "DISTRICT_AERODROME",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    4
   ]
  ],
  "prereqs": [
   "BUILDING_HANGAR"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "AIRPORT_TRAINED_AIRCRAFT_XP_MODIFIER",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_AIRPORT_TRAINED_AIRCRAFT_XP"
    },
    "ability": [
     {
      "id": "AIRPORT_TRAINED_AIRCRAFT_XP",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
      "args": {
       "Amount": "50"
      }
     }
    ]
   },
   {
    "id": "AIRPORT_BONUS_AIR_SLOTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_DISTRICT_AIR_SLOTS",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_STADIUM",
  "cost": 480,
  "maintenance": 3,
  "housing": 0,
  "entertainment": 1,
  "regionalRange": 6,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_PROFESSIONAL_SPORTS",
  "district": "DISTRICT_ENTERTAINMENT_COMPLEX",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [
   "BUILDING_ZOO"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 2,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "STADIUM_10_POPULATION_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_DISTRICT_TOURISM_CHANGE",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_POPULATION",
       "inverse": false,
       "args": {
        "Amount": "10"
       }
      }
     ]
    }
   },
   {
    "id": "STADIUM_20_POPULATION_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_DISTRICT_TOURISM_CHANGE",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_POPULATION",
       "inverse": false,
       "args": {
        "Amount": "20"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_CATHEDRAL",
  "cost": 190,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": true,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": true,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_TEMPLE"
  ],
  "greatWorks": [
   {
    "n": 1,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_RELIGIOUS"
    ]
   }
  ],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_GURDWARA",
  "cost": 190,
  "maintenance": 0,
  "housing": 1,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": true,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": true,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    3
   ],
   [
    "YIELD_FOOD",
    2
   ]
  ],
  "prereqs": [
   "BUILDING_TEMPLE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_MEETING_HOUSE",
  "cost": 190,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": true,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": true,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    3
   ],
   [
    "YIELD_PRODUCTION",
    2
   ]
  ],
  "prereqs": [
   "BUILDING_TEMPLE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_MOSQUE",
  "cost": 190,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": true,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": true,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_TEMPLE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "MOSQUE_ADJUST_SPREAD_CHARGES",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_ADJUST_BUILDING_SPREAD_CHARGES",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_RELIGIOUS_SPREAD"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_PAGODA",
  "cost": 190,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": true,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": true,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_TEMPLE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "PAGODA_ADJUST_FAVOR",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_SYNAGOGUE",
  "cost": 190,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": true,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": true,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    5
   ]
  ],
  "prereqs": [
   "BUILDING_TEMPLE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_WAT",
  "cost": 190,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": true,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": true,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    3
   ],
   [
    "YIELD_SCIENCE",
    2
   ]
  ],
  "prereqs": [
   "BUILDING_TEMPLE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_STUPA",
  "cost": 190,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 1,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": true,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": true,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_TEMPLE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_DAR_E_MEHR",
  "cost": 190,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": true,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": true,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_TEMPLE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_STONEHENGE",
  "cost": 180,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_ASTROLOGY",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "STONEHENGE_GRANT_PROPHET",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_GREAT_PERSON_CLASS_IN_CITY",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_PROPHET",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_CAN_EVER_EARN_GREAT_PERSON_CLASS",
       "inverse": false,
       "args": {
        "GreatPersonClass": "GREAT_PERSON_CLASS_PROPHET"
       }
      }
     ]
    }
   },
   {
    "id": "STONEHENGE_ALTERNATE_GRANT_APOSTLE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_IN_CITY",
    "args": {
     "UnitType": "UNIT_APOSTLE",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_CAN_EVER_EARN_GREAT_PERSON_CLASS",
       "inverse": true,
       "args": {
        "GreatPersonClass": "GREAT_PERSON_CLASS_PROPHET"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_HANGING_GARDENS",
  "cost": 180,
  "maintenance": 0,
  "housing": 2,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_IRRIGATION",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "HANGING_GARDEN_ADDGROWTH",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_GROWTH",
    "args": {
     "Amount": "15"
    }
   }
  ]
 },
 {
  "type": "BUILDING_PYRAMIDS",
  "cost": 220,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_MASONRY",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "PYRAMID_ADJUST_BUILDER_CHARGES",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_BUILD_CHARGES",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "UnitType": "UNIT_BUILDER"
       }
      }
     ]
    }
   },
   {
    "id": "PYRAMID_GRANT_BUILDERS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_IN_CITY",
    "args": {
     "UnitType": "UNIT_BUILDER",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_ORACLE",
  "cost": 290,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_MYSTICISM",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ],
   [
    "YIELD_FAITH",
    1
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "ORACLE_GREATGENERALPOINTS",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_GENERAL",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_ENCAMPMENT"
       }
      }
     ]
    }
   },
   {
    "id": "ORACLE_GREATADMIRALPOINTS",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ADMIRAL",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_HARBOR"
       }
      }
     ]
    }
   },
   {
    "id": "ORACLE_GREATENGINEERPOINTS",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ENGINEER",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_INDUSTRIAL_ZONE"
       }
      }
     ]
    }
   },
   {
    "id": "ORACLE_GREATMERCHANTPOINTS",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_MERCHANT",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_COMMERCIAL_HUB"
       }
      }
     ]
    }
   },
   {
    "id": "ORACLE_GREATPROPHETPOINTS",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_PROPHET",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_HOLY_SITE"
       }
      }
     ]
    }
   },
   {
    "id": "ORACLE_GREATSCIENTISTPOINTS",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_SCIENTIST",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_CAMPUS"
       }
      }
     ]
    }
   },
   {
    "id": "ORACLE_GREATWRITERPOINTS",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_WRITER",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_THEATER"
       }
      }
     ]
    }
   },
   {
    "id": "ORACLE_PATRONAGE_FAITH_DISCOUNT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_PATRONAGE_DISCOUNT_PERCENT",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "25"
    }
   }
  ]
 },
 {
  "type": "BUILDING_GREAT_LIGHTHOUSE",
  "cost": 290,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_CELESTIAL_NAVIGATION",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_LIGHTHOUSE"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ADMIRAL",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GREATLIGHTHOUSE_ADJUST_SEA_MOVEMENT",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_GREAT_LIGHTHOUSE_MOVEMENT"
    },
    "ability": [
     {
      "id": "GREAT_LIGHTHOUSE_SEA_MOVEMENT",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_SEA_MOVEMENT",
      "args": {
       "Amount": "1"
      }
     }
    ]
   },
   {
    "id": "GREATLIGHTHOUSE_ADJUST_EMBARKED_MOVEMENT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_EMBARKED_UNIT_MOVEMENT",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "GREATLIGHTHOUSE_ADD_EMBARKED_ABILITY_TEXT_ONLY",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_GREAT_LIGHTHOUSE_EMBARKED_MOVEMENT"
    },
    "ability": []
   }
  ]
 },
 {
  "type": "BUILDING_COLOSSUS",
  "cost": 400,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_SHIPBUILDING",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    3
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ADMIRAL",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "COLOSSUS_ADDTRADEROUTE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_CAPACITY",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "COLOSSUS_GRANT_TRADER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_IN_CITY",
    "args": {
     "UnitType": "UNIT_TRADER",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_PETRA",
  "cost": 400,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_MATHEMATICS",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "PETRA_YIELD_MODIFIER",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_FOOD,YIELD_GOLD,YIELD_PRODUCTION",
     "Amount": "2,2,1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "TerrainClass": "TERRAIN_CLASS_DESERT"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": true,
       "args": {
        "FeatureType": "FEATURE_FLOODPLAINS"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_COLOSSEUM",
  "cost": 400,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 2,
  "regionalRange": 6,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_GAMES_RECREATION",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ]
  ],
  "prereqs": [
   "BUILDING_ARENA"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "COLOSSEUM_IDENTITY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_BUILDING_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_COLOSSEUM",
        "MinRange": "0",
        "MaxRange": "6"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_GREAT_LIBRARY",
  "cost": 400,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_RECORDED_HISTORY",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    2
   ]
  ],
  "prereqs": [
   "BUILDING_LIBRARY"
  ],
  "greatWorks": [
   {
    "n": 2,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_WRITING"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    1
   ],
   [
    "PSEUDOYIELD_GPP_WRITER",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GREAT_LIBRARY_ANCIENT_CLASSICAL_TECH_BOOSTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_ALL_TECHNOLOGY_BOOST_BY_ERA",
    "args": {
     "StartEraType": "ERA_ANCIENT",
     "EndEraType": "ERA_CLASSICAL"
    }
   },
   {
    "id": "GREATLIBRARY_BOOST_SCIENTIST",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_BOOST_WITH_GREAT_PERSON",
    "args": {
     "GreatPersonClass": "GREAT_PERSON_CLASS_SCIENTIST",
     "TechBoost": "true",
     "OtherPlayers": "true"
    }
   }
  ]
 },
 {
  "type": "BUILDING_MAHABODHI_TEMPLE",
  "cost": 400,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_THEOLOGY",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    4
   ]
  ],
  "prereqs": [
   "BUILDING_TEMPLE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "MAHABODHITEMPLE_APOSTLE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_IN_CITY",
    "args": {
     "UnitType": "UNIT_APOSTLE",
     "Amount": "2"
    }
   },
   {
    "id": "MAHABODHI_DIPLOVP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_DIPLOMATIC_VICTORY_POINTS",
    "args": {
     "Amount": "2",
     "Tooltip": "LOC_DVP_TOOLTIP_OTHER_SOURCES"
    }
   }
  ]
 },
 {
  "type": "BUILDING_TERRACOTTA_ARMY",
  "cost": 400,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_CONSTRUCTION",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [
   "BUILDING_BARRACKS",
   "BUILDING_STABLE"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_GENERAL",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "TERRACOTTA_ARMY_ARCHAEOLOGIST_OPEN_BORDERS",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_ARCHAEOLOGIST_ENTER_FOREIGN_LANDS"
    },
    "ability": [
     {
      "id": "MOD_ENTER_FOREIGN_LANDS",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_ENTER_FOREIGN_LANDS",
      "args": {
       "Enter": "true"
      }
     }
    ]
   },
   {
    "id": "TERRACOTTA_ARMY_LEVEL_UP_UNITS",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_GRANT_EXPERIENCE",
    "args": {
     "Amount": "-1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_HAGIA_SOPHIA",
  "cost": 710,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_BUTTRESS",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    4
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "HAGIA_SOPHIA_ADJUST_RELIGIOUS_CHARGES",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_SPREAD_CHARGES",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_ALHAMBRA",
  "cost": 710,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 2,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 4,
  "tech": "TECH_CASTLES",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_GENERAL",
    2
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "ALHAMBRA_MILITARY_GOVERNMENT_SLOT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_GOVERNMENT_SLOT_TYPE",
    "args": {
     "GovernmentSlotType": "SLOT_MILITARY"
    }
   }
  ]
 },
 {
  "type": "BUILDING_CHICHEN_ITZA",
  "cost": 710,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_GUILDS",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "CHICHEN_ITZA_JUNGLE_CULTURE",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "CHICHEN_ITZA_JUNGLE_CULTURE_MODIFIER"
    },
    "attach": {
     "id": "CHICHEN_ITZA_JUNGLE_CULTURE_MODIFIER",
     "collection": "COLLECTION_CITY_PLOT_YIELDS",
     "effect": "EFFECT_ADJUST_PLOT_YIELD",
     "args": {
      "YieldType": "YIELD_CULTURE",
      "Amount": "2"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "FeatureType": "FEATURE_JUNGLE"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CHICHEN_ITZA"
       }
      }
     ]
    }
   },
   {
    "id": "CHICHEN_ITZA_JUNGLE_PRODUCTION",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "CHICHEN_ITZA_JUNGLE_PRODUCTION_MODIFIER"
    },
    "attach": {
     "id": "CHICHEN_ITZA_JUNGLE_PRODUCTION_MODIFIER",
     "collection": "COLLECTION_CITY_PLOT_YIELDS",
     "effect": "EFFECT_ADJUST_PLOT_YIELD",
     "args": {
      "YieldType": "YIELD_PRODUCTION",
      "Amount": "1"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "FeatureType": "FEATURE_JUNGLE"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CHICHEN_ITZA"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_MONT_ST_MICHEL",
  "cost": 710,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 6,
  "tech": null,
  "civic": "CIVIC_DIVINE_RIGHT",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [
   {
    "n": 2,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_RELIC"
    ]
   }
  ],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "MONT_ST_MICHEL_GRANT_MARTYR",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_PROMOTION",
    "args": {
     "PromotionType": "PROMOTION_MARTYR"
    }
   }
  ]
 },
 {
  "type": "BUILDING_VENETIAN_ARSENAL",
  "cost": 920,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_MASS_PRODUCTION",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    2
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "VENETIAN_ARSENAL_EXTRANAVALMELEE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_EXTRA_UNIT_COPY_TAG",
    "args": {
     "Tag": "CLASS_NAVAL_MELEE",
     "Amount": "1"
    }
   },
   {
    "id": "VENETIAN_ARSENAL_EXTRANAVALRANGED",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_EXTRA_UNIT_COPY_TAG",
    "args": {
     "Tag": "CLASS_NAVAL_RANGED",
     "Amount": "1"
    }
   },
   {
    "id": "VENETIAN_ARSENAL_EXTRANAVALCARRIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_EXTRA_UNIT_COPY_TAG",
    "args": {
     "Tag": "CLASS_NAVAL_CARRIER",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_GREAT_ZIMBABWE",
  "cost": 920,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_BANKING",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    5
   ]
  ],
  "prereqs": [
   "BUILDING_MARKET"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    2
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GREAT_ZIMBABWE_ADDTRADEROUTE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_CAPACITY",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "GREAT_ZIMBABWE_DOMESTICBONUSRESOURCEGOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TRADE_ROUTE_YIELD_PER_LOCAL_BONUS_RESOURCE_FOR_DOMESTIC",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   },
   {
    "id": "GREAT_ZIMBABWE_INTERNATIONALBONUSRESOURCEGOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TRADE_ROUTE_YIELD_PER_LOCAL_BONUS_RESOURCE_FOR_INTERNATIONAL",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "BUILDING_FORBIDDEN_CITY",
  "cost": 920,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_PRINTING",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    5
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "FORBIDDEN_CITY_WILDCARD_GOVERNMENT_SLOT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_GOVERNMENT_SLOT_TYPE",
    "args": {
     "GovernmentSlotType": "SLOT_WILDCARD"
    }
   }
  ]
 },
 {
  "type": "BUILDING_POTALA_PALACE",
  "cost": 1060,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_ASTRONOMY",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ],
   [
    "YIELD_FAITH",
    3
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "POTALA_PALACE_DIPLOMATIC_GOVERNMENT_SLOT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_GOVERNMENT_SLOT_TYPE",
    "args": {
     "GovernmentSlotType": "SLOT_DIPLOMATIC"
    }
   },
   {
    "id": "POTALA_DIPLOVP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_DIPLOMATIC_VICTORY_POINTS",
    "args": {
     "Amount": "1",
     "Tooltip": "LOC_DVP_TOOLTIP_OTHER_SOURCES"
    }
   }
  ]
 },
 {
  "type": "BUILDING_RUHR_VALLEY",
  "cost": 1240,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_INDUSTRIALIZATION",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [
   "BUILDING_FACTORY"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "RUHRVALLEY_ADDPRODUCTIONYIELD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "20"
    }
   },
   {
    "id": "RUHR_VALLEY_PRODUCTION_MODIFIER",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "ImprovementType": "IMPROVEMENT_QUARRY"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "ImprovementType": "IMPROVEMENT_MINE"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_BOLSHOI_THEATRE",
  "cost": 1240,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_OPERA_BALLET",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [
   {
    "n": 1,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_WRITING"
    ]
   },
   {
    "n": 1,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_MUSIC"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_WRITER",
    2
   ],
   [
    "PSEUDOYIELD_GPP_MUSICIAN",
    2
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "BOLSHOI_THEATRE_FREE_CIVICS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_PLAYER_RANDOM_CIVIC",
    "args": {
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "BUILDING_OXFORD_UNIVERSITY",
  "cost": 1240,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_SCIENTIFIC_THEORY",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [
   "BUILDING_UNIVERSITY"
  ],
  "greatWorks": [
   {
    "n": 2,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_WRITING"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    3
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "OXFORD_ADDSCIENCEYIELD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "20",
     "YieldType": "YIELD_SCIENCE"
    }
   },
   {
    "id": "OXFORD_UNIVERSITY_FREE_TECHS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_PLAYER_RANDOM_TECHNOLOGY",
    "args": {
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "BUILDING_BIG_BEN",
  "cost": 1450,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_ECONOMICS",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    6
   ]
  ],
  "prereqs": [
   "BUILDING_BANK"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    3
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "BIG_BEN_ECONOMIC_GOVERNMENT_SLOT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_GOVERNMENT_SLOT_TYPE",
    "args": {
     "GovernmentSlotType": "SLOT_ECONOMIC"
    }
   },
   {
    "id": "BIG_BEN_INCREASE_GOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_MULTIPLY_TREASURY",
    "args": {
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "BUILDING_HERMITAGE",
  "cost": 1450,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_NATURAL_HISTORY",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [
   {
    "n": 4,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_SCULPTURE",
     "PSEUDOYIELD_GREATWORK_PORTRAIT",
     "PSEUDOYIELD_GREATWORK_LANDSCAPE",
     "PSEUDOYIELD_GREATWORK_RELIGIOUS"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ARTIST",
    3
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_EIFFEL_TOWER",
  "cost": 1620,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_STEEL",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "EIFFEL_TOWER_ADDAPPEAL",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_APPEAL",
    "args": {
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "BUILDING_BROADWAY",
  "cost": 1620,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_MASS_MEDIA",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [
   {
    "n": 1,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_WRITING"
    ]
   },
   {
    "n": 2,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_MUSIC"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_WRITER",
    3
   ],
   [
    "PSEUDOYIELD_GPP_MUSICIAN",
    3
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "BROADWAY_ADDCULTUREYIELD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "20",
     "YieldType": "YIELD_CULTURE"
    }
   },
   {
    "id": "BUILDING_BROADWAY_RANDOMCIVICBOOST",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_RANDOM_CIVIC_BOOST_BY_ERA",
    "args": {
     "StartEraType": "ERA_ATOMIC",
     "EndEraType": "ERA_ATOMIC",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_CRISTO_REDENTOR",
  "cost": 1620,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_MASS_MEDIA",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    4
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "CRISTOREDENTOR_BEACHTOURISM",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "ImprovementType": "IMPROVEMENT_BEACH_RESORT",
     "ScalingFactor": "200"
    }
   },
   {
    "id": "CRISTOREDENTOR_FULLRELIGIOUSTOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_ALWAYS_FULL_RELIGIOUS_TOURISM",
    "args": {
     "Enable": "true"
    }
   }
  ]
 },
 {
  "type": "BUILDING_ESTADIO_DO_MARACANA",
  "cost": 1740,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 2,
  "regionalRange": 100000,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_PROFESSIONAL_SPORTS",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    6
   ]
  ],
  "prereqs": [
   "BUILDING_STADIUM"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_SYDNEY_OPERA_HOUSE",
  "cost": 1850,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_CULTURAL_HERITAGE",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    8
   ]
  ],
  "prereqs": [],
  "greatWorks": [
   {
    "n": 3,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_MUSIC"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_MUSICIAN",
    5
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_SMALL_ROCKET",
  "cost": 1,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_SPACEPORT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_MEDIUM_ROCKET",
   "BUILDING_LARGE_ROCKET"
  ],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_MEDIUM_ROCKET",
  "cost": 1,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_SPACEPORT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_SMALL_ROCKET",
   "BUILDING_LARGE_ROCKET"
  ],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_LARGE_ROCKET",
  "cost": 1,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_SPACEPORT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_SMALL_ROCKET",
   "BUILDING_MEDIUM_ROCKET"
  ],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_TLACHTLI",
  "cost": 135,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 2,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_GAMES_RECREATION",
  "district": "DISTRICT_ENTERTAINMENT_COMPLEX",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_TLACHTLI",
  "replaces": "BUILDING_ARENA",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    2
   ],
   [
    "YIELD_CULTURE",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_GENERAL",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_HUEY_TEOCALLI",
  "cost": 710,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_MILITARY_TACTICS",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "HUEY_ADDENTERTAINMENT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_ENTERTAINMENT_FROM_WONDER_ADJACENT_TO_LAKE",
    "args": {
     "BuildingType": "BUILDING_HUEY_TEOCALLI"
    }
   },
   {
    "id": "HUEY_LAKE_FOOD",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "HUEY_LAKE_FOOD_MODIFIER"
    },
    "attach": {
     "id": "HUEY_LAKE_FOOD_MODIFIER",
     "collection": "COLLECTION_CITY_PLOT_YIELDS",
     "effect": "EFFECT_ADJUST_PLOT_YIELD",
     "args": {
      "YieldType": "YIELD_FOOD",
      "Amount": "1"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_IS_LAKE",
        "inverse": false,
        "args": {}
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_OWNS_OBJECT",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "HUEY_LAKE_PRODUCTION",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "HUEY_LAKE_PRODUCTION_MODIFIER"
    },
    "attach": {
     "id": "HUEY_LAKE_PRODUCTION_MODIFIER",
     "collection": "COLLECTION_CITY_PLOT_YIELDS",
     "effect": "EFFECT_ADJUST_PLOT_YIELD",
     "args": {
      "YieldType": "YIELD_PRODUCTION",
      "Amount": "1"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_IS_LAKE",
        "inverse": false,
        "args": {}
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_OWNS_OBJECT",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_PRASAT",
  "cost": 120,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_THEOLOGY",
  "district": "DISTRICT_HOLY_SITE",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_PRASAT",
  "replaces": "BUILDING_TEMPLE",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    6
   ]
  ],
  "prereqs": [
   "BUILDING_SHRINE"
  ],
  "greatWorks": [
   {
    "n": 1,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_RELIC"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_PROPHET",
    1
   ]
  ],
  "copies": [],
  "units": [
   "UNIT_APOSTLE",
   "UNIT_INQUISITOR",
   "UNIT_WARRIOR_MONK",
   "UNIT_GURU"
  ],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "PRASAT_CULTURE_POPULATION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_POPULATION",
    "args": {
     "Amount": ".5",
     "YieldType": "YIELD_CULTURE"
    }
   },
   {
    "id": "PRASAT_CULTURE_POPULATION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_POPULATION",
    "args": {
     "Amount": ".5",
     "YieldType": "YIELD_CULTURE"
    }
   }
  ]
 },
 {
  "type": "BUILDING_ANGKOR_WAT",
  "cost": 710,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_MEDIEVAL_FAIRES",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "ANGKORWAT_ADDPOPULATION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_POPULATION",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "ANGKORWAT_ADDHOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_HOUSING",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_SUKIENNICE",
  "cost": 120,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_CURRENCY",
  "civic": null,
  "district": "DISTRICT_COMMERCIAL_HUB",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_SUKIENNICE",
  "replaces": "BUILDING_MARKET",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "SUKIENNICE_DOMESTICGOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TRADE_ROUTE_YIELD_FOR_DOMESTIC",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "4"
    }
   },
   {
    "id": "SUKIENNICE_INTERNATIONALPRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "2"
    }
   },
   {
    "id": "MARKET_TRADE_ROUTE_CAPACITY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_CAPACITY",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "MARKET_TRADE_ROUTE_CAPACITY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_CAPACITY",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_JEBEL_BARKAL",
  "cost": 400,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 6,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_IRON_WORKING",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    4
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "JEBELBARKAL_GRANT_FOUR_IRON_PER_TURN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_FREE_RESOURCE_EXTRACTED",
    "args": {
     "ResourceType": "RESOURCE_IRON",
     "Amount": "6"
    }
   }
  ]
 },
 {
  "type": "BUILDING_BASILIKOI_PAIDES",
  "cost": 90,
  "maintenance": 1,
  "housing": 1,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_BRONZE_WORKING",
  "civic": null,
  "district": "DISTRICT_ENCAMPMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_BASILIKOI_PAIDES",
  "replaces": "BUILDING_BARRACKS",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_STABLE"
  ],
  "yields": [
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_GENERAL",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "BASILIKOI_PAIDES_TRAINED_UNIT_XP_MODIFIER",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_BASILIKOI_TRAINED_UNIT_XP"
    },
    "ability": [
     {
      "id": "BASILIKOI_TRAINED_UNIT_XP",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
      "args": {
       "Amount": "25"
      }
     }
    ]
   },
   {
    "id": "BASILIKOI_PAIDES_SCIENCE_TRAINED_UNIT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_CITY_YIELD_PERCENT_UNIT_CREATED_COST",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "UnitProductionPercent": "25"
    }
   },
   {
    "id": "BASILIKOI_PAIDES_ADJUST_RESOURCE_STOCKPILE_CAP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_RESOURCE_STOCKPILE_CAP",
    "args": {
     "Amount": "10"
    }
   }
  ]
 },
 {
  "type": "BUILDING_APADANA",
  "cost": 400,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_POLITICAL_PHILOSOPHY",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [
   {
    "n": 2,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_SCULPTURE",
     "PSEUDOYIELD_GREATWORK_PORTRAIT",
     "PSEUDOYIELD_GREATWORK_LANDSCAPE",
     "PSEUDOYIELD_GREATWORK_RELIGIOUS",
     "PSEUDOYIELD_GREATWORK_WRITING",
     "PSEUDOYIELD_GREATWORK_MUSIC",
     "PSEUDOYIELD_GREATWORK_RELIC"
    ]
   }
  ],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "APADANA_AWARD_TWO_INFLUENCE_TOKEN",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "APADANA_AWARD_TWO_INFLUENCE_TOKEN_MODIFIER"
    },
    "attach": {
     "id": "APADANA_AWARD_TWO_INFLUENCE_TOKEN_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_GRANT_CITY_OWNER_INFLUENCE_TOKEN_WONDER",
     "args": {
      "Amount": "2"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_APADANA"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_HALICARNASSUS_MAUSOLEUM",
  "cost": 400,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_DEFENSIVE_TACTICS",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "HALICARNASSUS_ADJUST_ENGINEER_CHARGES",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_GREAT_PERSON_CHARGES",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_GREAT_PERSON_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "GreatPersonClassType": "GREAT_PERSON_CLASS_ENGINEER"
       }
      }
     ]
    }
   },
   {
    "id": "HALICARNASSUS_MAUSOLEUM_YIELD_MODIFIER",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_SCIENCE,YIELD_FAITH,YIELD_CULTURE",
     "Amount": "1,1,1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_COAST"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_IS_LAKE",
       "inverse": true,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_ORDU",
  "cost": 120,
  "maintenance": 1,
  "housing": 1,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_HORSEBACK_RIDING",
  "civic": null,
  "district": "DISTRICT_ENCAMPMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_ORDU",
  "replaces": "BUILDING_STABLE",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_BARRACKS"
  ],
  "yields": [
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_GENERAL",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "ORDU_TRAINED_UNIT_XP_MODIFIER",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_ORDU_TRAINED_UNIT_XP"
    },
    "ability": [
     {
      "id": "ORDU_TRAINED_XP",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
      "args": {
       "Amount": "25"
      }
     }
    ]
   },
   {
    "id": "ORDU_INCREASED_MOVEMENT_MODIFIER",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_ORDU_INCREASED_MOVEMENT"
    },
    "ability": [
     {
      "id": "ORDU_ADJUST_MOVEMENT",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_MOVEMENT",
      "args": {
       "Amount": "1"
      }
     }
    ]
   },
   {
    "id": "ORDU_ADJUST_RESOURCE_STOCKPILE_CAP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_RESOURCE_STOCKPILE_CAP",
    "args": {
     "Amount": "10"
    }
   }
  ]
 },
 {
  "type": "BUILDING_TSIKHE",
  "cost": 260,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": true,
  "outerDefenseStrength": 3,
  "defenseModifier": 0,
  "tech": "TECH_SIEGE_TACTICS",
  "civic": null,
  "district": "DISTRICT_CITY_CENTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_TSIKHE",
  "replaces": "BUILDING_STAR_FORT",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    4
   ]
  ],
  "prereqs": [
   "BUILDING_CASTLE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "TSIKHE_PREVENT_MELEE_ATTACK_OUTER_DEFENSES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_PREVENT_MELEE_ATTACK_OUTER_DEFENSES",
    "args": {}
   },
   {
    "id": "TSIKHE_PREVENT_BYPASS_OUTER_DEFENSE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_PREVENT_BYPASS_OUTER_DEFENSES",
    "args": {}
   },
   {
    "id": "TSIKHE_FAITH_GOLDEN_AGE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_TSIKHE",
     "Amount": "4",
     "YieldType": "YIELD_FAITH"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_GOLDEN_AGE",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_TEMPLE_ARTEMIS",
  "cost": 180,
  "maintenance": 0,
  "housing": 3,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_ARCHERY",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FOOD",
    4
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_KILWA_KISIWANI",
  "cost": 710,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_MACHINERY",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "KILWA_SINGLE_ADDSCIENCEYIELD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "15",
     "YieldType": "YIELD_SCIENCE"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "1",
        "LeaderType": "LEADER_MINOR_CIV_SCIENTIFIC"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_SINGLE_ADDFAITHYIELD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "15",
     "YieldType": "YIELD_FAITH"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "1",
        "LeaderType": "LEADER_MINOR_CIV_RELIGIOUS"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_SINGLE_ADDGOLDYIELD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "15",
     "YieldType": "YIELD_GOLD"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "1",
        "LeaderType": "LEADER_MINOR_CIV_TRADE"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_SINGLE_ADDCULTUREYIELD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "15",
     "YieldType": "YIELD_CULTURE"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "1",
        "LeaderType": "LEADER_MINOR_CIV_CULTURAL"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_SINGLE_ADDPRODUCTIONUNITS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_ALL_UNIT_PRODUCTION_MODIFIER",
    "args": {
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "1",
        "LeaderType": "LEADER_MINOR_CIV_MILITARISTIC"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_SINGLE_ADDPRODUCTIONBUILDINGS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_ALL_BUILDING_PRODUCTION_MODIFIER",
    "args": {
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "1",
        "LeaderType": "LEADER_MINOR_CIV_INDUSTRIAL"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_SINGLE_ADDPRODUCTIONDISTRICTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_ALL_DISTRICT_PRODUCTION_MODIFIER",
    "args": {
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "1",
        "LeaderType": "LEADER_MINOR_CIV_INDUSTRIAL"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_PLAYERCITIES_ADDSCIENCEYIELD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "15",
     "YieldType": "YIELD_SCIENCE"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "2",
        "LeaderType": "LEADER_MINOR_CIV_SCIENTIFIC"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_PLAYERCITIES_ADDFAITHYIELD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "15",
     "YieldType": "YIELD_FAITH"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "2",
        "LeaderType": "LEADER_MINOR_CIV_RELIGIOUS"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_PLAYERCITIES_ADDGOLDYIELD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "15",
     "YieldType": "YIELD_GOLD"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "2",
        "LeaderType": "LEADER_MINOR_CIV_TRADE"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_PLAYERCITIES_ADDCULTUREYIELD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "15",
     "YieldType": "YIELD_CULTURE"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "2",
        "LeaderType": "LEADER_MINOR_CIV_CULTURAL"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_PLAYERCITIES_ADDPRODUCTIONUNITS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_ALL_UNIT_PRODUCTION_MODIFIER",
    "args": {
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "2",
        "LeaderType": "LEADER_MINOR_CIV_MILITARISTIC"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_PLAYERCITIES_ADDPRODUCTIONBUILDINGS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_ALL_BUILDING_PRODUCTION_MODIFIER",
    "args": {
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "2",
        "LeaderType": "LEADER_MINOR_CIV_INDUSTRIAL"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_PLAYERCITIES_ADDPRODUCTIONDISTRICTS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_ALL_DISTRICT_PRODUCTION_MODIFIER",
    "args": {
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_X_TYPE",
       "inverse": false,
       "args": {
        "Amount": "2",
        "LeaderType": "LEADER_MINOR_CIV_INDUSTRIAL"
       }
      }
     ]
    }
   },
   {
    "id": "KILWA_THREE_INFLUENCE_TOKENS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
    "args": {
     "Amount": "3"
    }
   }
  ]
 },
 {
  "type": "BUILDING_KOTOKU_IN",
  "cost": 710,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_DIVINE_RIGHT",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [
   "BUILDING_TEMPLE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "KOTOKU_ADDFAITHYIELD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "20",
     "YieldType": "YIELD_FAITH"
    }
   },
   {
    "id": "KOTOKU_GRANTMONKS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_IN_CITY",
    "args": {
     "UnitType": "UNIT_WARRIOR_MONK",
     "Amount": "4"
    }
   }
  ]
 },
 {
  "type": "BUILDING_CASA_DE_CONTRATACION",
  "cost": 920,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_CARTOGRAPHY",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    3
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "CONTRATACION_GOVERNOR_POINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
    "args": {
     "Delta": "3"
    }
   },
   {
    "id": "CONTRATACION_FOREIGNFAITH",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_IS_OWNER_CAPITAL_CONTINENT",
       "inverse": true,
       "args": {}
      },
      {
       "type": "REQUIREMENT_CITY_HAS_GOVERNOR",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "CONTRATACION_FOREIGNGOLD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_IS_OWNER_CAPITAL_CONTINENT",
       "inverse": true,
       "args": {}
      },
      {
       "type": "REQUIREMENT_CITY_HAS_GOVERNOR",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "CONTRATACION_FOREIGNPRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_IS_OWNER_CAPITAL_CONTINENT",
       "inverse": true,
       "args": {}
      },
      {
       "type": "REQUIREMENT_CITY_HAS_GOVERNOR",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_ST_BASILS_CATHEDRAL",
  "cost": 920,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_REFORMED_CHURCH",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [
   {
    "n": 3,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_RELIC"
    ]
   }
  ],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "STBASILS_ADDFOOD",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "STBASILS_ADDFOOD_MODIFIER"
    },
    "attach": {
     "id": "STBASILS_ADDFOOD_MODIFIER",
     "collection": "COLLECTION_CITY_PLOT_YIELDS",
     "effect": "EFFECT_ADJUST_PLOT_YIELD",
     "args": {
      "YieldType": "YIELD_FOOD",
      "Amount": "1"
     },
     "subjectReqs": {
      "test": "ANY",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "TerrainType": "TERRAIN_TUNDRA"
        }
       },
       {
        "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "TerrainType": "TERRAIN_TUNDRA_HILLS"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_ST_BASILS_CATHEDRAL"
       }
      }
     ]
    }
   },
   {
    "id": "STBASILS_ADDPRODUCTION",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "STBASILS_ADDPRODUCTION_MODIFIER"
    },
    "attach": {
     "id": "STBASILS_ADDPRODUCTION_MODIFIER",
     "collection": "COLLECTION_CITY_PLOT_YIELDS",
     "effect": "EFFECT_ADJUST_PLOT_YIELD",
     "args": {
      "YieldType": "YIELD_PRODUCTION",
      "Amount": "1"
     },
     "subjectReqs": {
      "test": "ANY",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "TerrainType": "TERRAIN_TUNDRA"
        }
       },
       {
        "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "TerrainType": "TERRAIN_TUNDRA_HILLS"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_ST_BASILS_CATHEDRAL"
       }
      }
     ]
    }
   },
   {
    "id": "STBASILS_ADDCULTURE",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "STBASILS_ADDCULTURE_MODIFIER"
    },
    "attach": {
     "id": "STBASILS_ADDCULTURE_MODIFIER",
     "collection": "COLLECTION_CITY_PLOT_YIELDS",
     "effect": "EFFECT_ADJUST_PLOT_YIELD",
     "args": {
      "YieldType": "YIELD_CULTURE",
      "Amount": "1"
     },
     "subjectReqs": {
      "test": "ANY",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "TerrainType": "TERRAIN_TUNDRA"
        }
       },
       {
        "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "TerrainType": "TERRAIN_TUNDRA_HILLS"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_ST_BASILS_CATHEDRAL"
       }
      }
     ]
    }
   },
   {
    "id": "STBASILS_ADDRELIGIOUSTOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "Religious": "true",
     "ScalingFactor": "200"
    }
   }
  ]
 },
 {
  "type": "BUILDING_TAJ_MAHAL",
  "cost": 920,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_HUMANISM",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "TAJ_MAHAL_EXTRA_ERA_SCORE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_ERA_SCORE_PER_PRIDE_MOMENT",
    "args": {
     "Amount": "1",
     "MinScore": "2"
    }
   }
  ]
 },
 {
  "type": "BUILDING_STATUE_LIBERTY",
  "cost": 1240,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_CIVIL_ENGINEERING",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "STATUELIBERTY_CITIES_ALWAYS_LOYAL",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALWAYS_LOYAL",
    "args": {
     "AlwaysLoyal": "true"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_BUILDING_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STATUE_LIBERTY",
        "MinRange": "0",
        "MaxRange": "6"
       }
      }
     ]
    }
   },
   {
    "id": "STATUELIBERTY_DIPLOVP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_DIPLOMATIC_VICTORY_POINTS",
    "args": {
     "Amount": "4",
     "Tooltip": "LOC_DVP_TOOLTIP_OTHER_SOURCES"
    }
   }
  ]
 },
 {
  "type": "BUILDING_AMUNDSEN_SCOTT_RESEARCH_STATION",
  "cost": 1620,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_RAPID_DEPLOYMENT",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [
   "BUILDING_RESEARCH_LAB"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    5
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "AMUNDSEN_ADDSCIENCEYIELD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "20"
    }
   },
   {
    "id": "AMUNDSEN_ADDPRODUCTIONYIELD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "10"
    }
   },
   {
    "id": "AMUNDSEN_SNOW_ADDSCIENCEYIELD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "20"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_TERRAIN_TYPE",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_SNOW",
        "Hills": "true",
        "Amount": "5"
       }
      }
     ]
    }
   },
   {
    "id": "AMUNDSEN_SNOW_ADDPRODUCTIONYIELD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_TERRAIN_TYPE",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_SNOW",
        "Hills": "true",
        "Amount": "5"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_FERRIS_WHEEL",
  "cost": 290,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 2,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_NATURAL_HISTORY",
  "district": "DISTRICT_WATER_ENTERTAINMENT_COMPLEX",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    3
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "FERRIS_WHEEL_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_DISTRICT_TOURISM_CHANGE",
    "args": {
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "BUILDING_AQUARIUM",
  "cost": 360,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 1,
  "regionalRange": 9,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_NATURAL_HISTORY",
  "district": "DISTRICT_WATER_ENTERTAINMENT_COMPLEX",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [
   "BUILDING_FERRIS_WHEEL"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "AQUARIUM_SEARESOURCE_SCIENCE",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_RESOURCE_VISIBLE",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_COAST"
       }
      }
     ]
    }
   },
   {
    "id": "AQUARIUM_REEF_SCIENCE",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_REEF"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_AQUATICS_CENTER",
  "cost": 480,
  "maintenance": 3,
  "housing": 0,
  "entertainment": 1,
  "regionalRange": 9,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_PROFESSIONAL_SPORTS",
  "district": "DISTRICT_WATER_ENTERTAINMENT_COMPLEX",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [
   "BUILDING_AQUARIUM"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 2,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "AQUATICS_CENTER_WONDER_TOURISM",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_TOURISM_CHANGE",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_WONDER"
       }
      },
      {
       "type": "REQUIREMENT_REQUIREMENTSET_IS_MET",
       "inverse": false,
       "args": {
        "RequirementSetId": "AQUATICS_CENTER_COASTAL_WONDER_REQUIREMENTS"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_GOV_TALL",
  "cost": 150,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_GOVERNMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 1,
  "exclusive": [
   "BUILDING_GOV_WIDE",
   "BUILDING_GOV_CONQUEST"
  ],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GOV_TALL_AMENITY_BUFF",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_AMENITIES_FROM_GOVERNORS",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_GOVERNOR",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "GOV_TALL_LOYALTY_DEBUFF",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
    "args": {
     "Amount": "-2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_GOVERNOR",
       "inverse": true,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "GOV_TALL_HOUSING_BUFF",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "4"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_GOVERNOR",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_GOV_WIDE",
  "cost": 150,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_GOVERNMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 1,
  "exclusive": [
   "BUILDING_GOV_TALL",
   "BUILDING_GOV_CONQUEST"
  ],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GOV_SETTLER_COST_REDUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_PRODUCTION",
    "args": {
     "UnitType": "UNIT_SETTLER",
     "Amount": "50"
    }
   },
   {
    "id": "GOV_SETTLER_GRANT_BUILDER",
    "collection": "COLLECTION_PLAYER_BUILT_CITIES",
    "effect": "EFFECT_GRANT_UNIT_IN_CITY",
    "args": {
     "Amount": "1",
     "UnitType": "UNIT_BUILDER"
    }
   }
  ]
 },
 {
  "type": "BUILDING_GOV_CONQUEST",
  "cost": 150,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_GOVERNMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 1,
  "exclusive": [
   "BUILDING_GOV_TALL",
   "BUILDING_GOV_WIDE"
  ],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GOV_PRODUCTION_BOOST_FROM_CAPTURE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_DIPLOMATIC_YIELD_MODIFIER",
    "args": {
     "DiplomaticYieldSource": "CITY_CAPTURED",
     "TurnsActive": "5",
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "20",
     "StackWithOtherDiploYieldModifiers": "true"
    }
   }
  ]
 },
 {
  "type": "BUILDING_GOV_CITYSTATES",
  "cost": 290,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_GOVERNMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 2,
  "exclusive": [
   "BUILDING_GOV_SPIES",
   "BUILDING_GOV_FAITH",
   "BUILDING_QUEENS_BIBLIOTHEQUE"
  ],
  "yields": [],
  "prereqs": [
   "BUILDING_GOV_TALL",
   "BUILDING_GOV_WIDE",
   "BUILDING_GOV_CONQUEST"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "BUILDING_GOV_CITYSTATES_UNIT_STRENGTH",
    "collection": "COLLECTION_PLAYER_CITY_STATE_UNITS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GOV_CITYSTATES_COMBAT_MODIFIER"
    },
    "attach": {
     "id": "GOV_CITYSTATES_COMBAT_MODIFIER",
     "collection": "COLLECTION_UNIT_COMBAT",
     "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
     "args": {
      "Amount": "4"
     }
    }
   },
   {
    "id": "BUILDING_GOV_CITYSTATES_LEVERAGED_UNIT_STRENGTH",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GOV_CITYSTATES_COMBAT_MODIFIER"
    },
    "attach": {
     "id": "GOV_CITYSTATES_COMBAT_MODIFIER",
     "collection": "COLLECTION_UNIT_COMBAT",
     "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
     "args": {
      "Amount": "4"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_IS_LEVIED",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "BUILDING_GOV_LEVY_DISCOUNT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_LEVY_DISCOUNT_PERCENT",
    "args": {
     "Percent": "50"
    }
   },
   {
    "id": "GOVCITYSTATES_ADJUST_FAVOR",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN",
    "args": {
     "Amount": "3"
    }
   }
  ]
 },
 {
  "type": "BUILDING_GOV_SPIES",
  "cost": 290,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_GOVERNMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 2,
  "exclusive": [
   "BUILDING_GOV_CITYSTATES",
   "BUILDING_GOV_FAITH",
   "BUILDING_QUEENS_BIBLIOTHEQUE"
  ],
  "yields": [],
  "prereqs": [
   "BUILDING_GOV_TALL",
   "BUILDING_GOV_WIDE",
   "BUILDING_GOV_CONQUEST"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GOV_GRANT_SPY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_SPY",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "GOV_ADD_SPY_UNIT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_IN_CITY",
    "args": {
     "UnitType": "UNIT_SPY",
     "Amount": "1"
    }
   },
   {
    "id": "GOV_INCREASE_SPY_LEVEL",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_SPY_BONUS",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_GOV_FAITH",
  "cost": 290,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_GOVERNMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 2,
  "exclusive": [
   "BUILDING_GOV_CITYSTATES",
   "BUILDING_GOV_SPIES",
   "BUILDING_QUEENS_BIBLIOTHEQUE"
  ],
  "yields": [
   [
    "YIELD_FAITH",
    5
   ]
  ],
  "prereqs": [
   "BUILDING_GOV_TALL",
   "BUILDING_GOV_WIDE",
   "BUILDING_GOV_CONQUEST"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GOV_FAITH_PURCHASE_RECON",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ENABLE_UNIT_FAITH_PURCHASE",
    "args": {
     "Tag": "CLASS_RECON"
    }
   },
   {
    "id": "GOV_FAITH_PURCHASE_MELEE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ENABLE_UNIT_FAITH_PURCHASE",
    "args": {
     "Tag": "CLASS_MELEE"
    }
   },
   {
    "id": "GOV_FAITH_PURCHASE_RANGED",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ENABLE_UNIT_FAITH_PURCHASE",
    "args": {
     "Tag": "CLASS_RANGED"
    }
   },
   {
    "id": "GOV_FAITH_PURCHASE_SIEGE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ENABLE_UNIT_FAITH_PURCHASE",
    "args": {
     "Tag": "CLASS_SIEGE"
    }
   },
   {
    "id": "GOV_FAITH_PURCHASE_HEAVY_CAVALRY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ENABLE_UNIT_FAITH_PURCHASE",
    "args": {
     "Tag": "CLASS_HEAVY_CAVALRY"
    }
   },
   {
    "id": "GOV_FAITH_PURCHASE_LIGHT_CAVALRY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ENABLE_UNIT_FAITH_PURCHASE",
    "args": {
     "Tag": "CLASS_LIGHT_CAVALRY"
    }
   },
   {
    "id": "GOV_FAITH_PURCHASE_RANGED_CAVALRY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ENABLE_UNIT_FAITH_PURCHASE",
    "args": {
     "Tag": "CLASS_RANGED_CAVALRY"
    }
   },
   {
    "id": "GOV_FAITH_PURCHASE_ANTI_CAVALRY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ENABLE_UNIT_FAITH_PURCHASE",
    "args": {
     "Tag": "CLASS_ANTI_CAVALRY"
    }
   },
   {
    "id": "GOV_FAITH_PURCHASE_HEAVY_CHARIOT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ENABLE_UNIT_FAITH_PURCHASE",
    "args": {
     "Tag": "CLASS_HEAVY_CHARIOT"
    }
   },
   {
    "id": "GOV_FAITH_PURCHASE_LIGHT_CHARIOT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ENABLE_UNIT_FAITH_PURCHASE",
    "args": {
     "Tag": "CLASS_LIGHT_CHARIOT"
    }
   },
   {
    "id": "GOV_FAITH_PILLAGE_IMPROVEMENT_FAITH",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_FAITH_ON_IMPROVEMENT_PLUNDER",
    "args": {
     "Amount": "15"
    }
   },
   {
    "id": "GOV_FAITH_PILLAGE_DISTRICT_FAITH",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_FAITH_ON_DISTRICT_PLUNDER",
    "args": {
     "Amount": "30"
    }
   }
  ]
 },
 {
  "type": "BUILDING_GOV_MILITARY",
  "cost": 440,
  "maintenance": 3,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_GOVERNMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 3,
  "exclusive": [
   "BUILDING_GOV_CULTURE",
   "BUILDING_GOV_SCIENCE"
  ],
  "yields": [],
  "prereqs": [
   "BUILDING_GOV_CITYSTATES",
   "BUILDING_GOV_SPIES",
   "BUILDING_GOV_FAITH",
   "BUILDING_QUEENS_BIBLIOTHEQUE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GOV_HEAL_AFTER_DEFEATING_UNIT",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_POST_COMBAT_HEAL",
    "args": {
     "Amount": "20"
    }
   }
  ]
 },
 {
  "type": "BUILDING_GOV_CULTURE",
  "cost": 440,
  "maintenance": 3,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_GOVERNMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 3,
  "exclusive": [
   "BUILDING_GOV_MILITARY",
   "BUILDING_GOV_SCIENCE"
  ],
  "yields": [],
  "prereqs": [
   "BUILDING_GOV_CITYSTATES",
   "BUILDING_GOV_SPIES",
   "BUILDING_GOV_FAITH",
   "BUILDING_QUEENS_BIBLIOTHEQUE"
  ],
  "greatWorks": [
   {
    "n": 4,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_SCULPTURE",
     "PSEUDOYIELD_GREATWORK_PORTRAIT",
     "PSEUDOYIELD_GREATWORK_LANDSCAPE",
     "PSEUDOYIELD_GREATWORK_RELIGIOUS",
     "PSEUDOYIELD_GREATWORK_WRITING",
     "PSEUDOYIELD_GREATWORK_MUSIC",
     "PSEUDOYIELD_GREATWORK_RELIC"
    ]
   }
  ],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_GOV_SCIENCE",
  "cost": 440,
  "maintenance": 3,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_GOVERNMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 3,
  "exclusive": [
   "BUILDING_GOV_MILITARY",
   "BUILDING_GOV_CULTURE"
  ],
  "yields": [],
  "prereqs": [
   "BUILDING_GOV_CITYSTATES",
   "BUILDING_GOV_SPIES",
   "BUILDING_GOV_FAITH",
   "BUILDING_QUEENS_BIBLIOTHEQUE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GOV_PROJECT_ABILITY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_UNIT_PROJECT_PERCENT",
    "args": {
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "BUILDING_FOOD_MARKET",
  "cost": 380,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_REPLACEABLE_PARTS",
  "civic": null,
  "district": "DISTRICT_NEIGHBORHOOD",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_SHOPPING_MALL"
  ],
  "yields": [
   [
    "YIELD_FOOD",
    4
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_SHOPPING_MALL",
  "cost": 440,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 1,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_CAPITALISM",
  "district": "DISTRICT_NEIGHBORHOOD",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_FOOD_MARKET"
  ],
  "yields": [
   [
    "YIELD_GOLD",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 1,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "SHOPPING_MALL_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_DISTRICT_TOURISM_CHANGE",
    "args": {
     "Amount": "4"
    }
   }
  ]
 },
 {
  "type": "BUILDING_FLOOD_BARRIER",
  "cost": 80,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_COMPUTERS",
  "civic": null,
  "district": "DISTRICT_CITY_CENTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": true,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_HYDROELECTRIC_DAM",
  "cost": 440,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_ELECTRICITY",
  "civic": null,
  "district": "DISTRICT_DAM",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "HYDROELECTRIC_DAM_FREE_POWER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "6",
     "SourceType": "FREE_POWER_SOURCE_WATER"
    }
   },
   {
    "id": "MERCHANT_RENEWABLE_ENERGY_HYDROELECTRIC_DAM_FREE_POWER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "2",
     "SourceType": "FREE_POWER_SOURCE_WATER"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_SPECIFIC_GOVERNOR_PROMOTION_TYPE",
       "inverse": false,
       "args": {
        "Established": "true",
        "GovernorPromotionType": "GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_COAL_POWER_PLANT",
  "cost": 300,
  "maintenance": 3,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 6,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_INDUSTRIALIZATION",
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_FOSSIL_FUEL_POWER_PLANT",
   "BUILDING_POWER_PLANT"
  ],
  "yields": [],
  "prereqs": [
   "BUILDING_FACTORY"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    1
   ]
  ],
  "copies": [
   [
    "YIELD_PRODUCTION",
    "YIELD_PRODUCTION"
   ]
  ],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": "RESOURCE_COAL",
  "modifiers": []
 },
 {
  "type": "BUILDING_FOSSIL_FUEL_POWER_PLANT",
  "cost": 360,
  "maintenance": 3,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 6,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_ELECTRICITY",
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [
   "BUILDING_COAL_POWER_PLANT",
   "BUILDING_POWER_PLANT"
  ],
  "yields": [
   [
    "YIELD_PRODUCTION",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_FACTORY"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": "RESOURCE_OIL",
  "modifiers": []
 },
 {
  "type": "BUILDING_GRAND_BAZAAR",
  "cost": 220,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_BANKING",
  "civic": null,
  "district": "DISTRICT_COMMERCIAL_HUB",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_GRAND_BAZAAR",
  "replaces": "BUILDING_BANK",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    5
   ]
  ],
  "prereqs": [
   "BUILDING_MARKET"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GRANDBAZAAR_AMENITIES_LUXURIES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_EXTRA_AMENITY_FOR_LUXURY_DIVERSITY",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "GRANDBAZAAR_ACCUMULATION_STRATEGICS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_EXTRA_ACCUMULATION_FOR_STRATEGIC_DIVERSITY",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_MARAE",
  "cost": 150,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_DRAMA_POETRY",
  "district": "DISTRICT_THEATER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_MARAE",
  "replaces": "BUILDING_AMPHITHEATER",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "MARAE_FAITH_FEATURES",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_HAS_ANY_FEATURE",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLOT_IS_IMPASSABLE",
       "inverse": true,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "MARAE_CULTURE_FEATURES",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_HAS_ANY_FEATURE",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLOT_IS_IMPASSABLE",
       "inverse": true,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "MARAE_TOURISM_FEATURES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TOURISM_PER_FEATURE",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_TECHNOLOGY",
       "inverse": false,
       "args": {
        "TechnologyType": "TECH_FLIGHT"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_QUEENS_BIBLIOTHEQUE",
  "cost": 217,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": null,
  "district": "DISTRICT_GOVERNMENT",
  "wonder": false,
  "placement": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_LEADER_BUILDING_QUEENS_BIBLIOTHEQUE",
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 2,
  "exclusive": [
   "BUILDING_GOV_CITYSTATES",
   "BUILDING_GOV_SPIES",
   "BUILDING_GOV_FAITH"
  ],
  "yields": [],
  "prereqs": [
   "BUILDING_GOV_TALL",
   "BUILDING_GOV_WIDE",
   "BUILDING_GOV_CONQUEST"
  ],
  "greatWorks": [
   {
    "n": 2,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_WRITING"
    ]
   },
   {
    "n": 2,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_SCULPTURE",
     "PSEUDOYIELD_GREATWORK_PORTRAIT",
     "PSEUDOYIELD_GREATWORK_LANDSCAPE",
     "PSEUDOYIELD_GREATWORK_RELIGIOUS"
    ]
   },
   {
    "n": 2,
    "pseudo": [
     "PSEUDOYIELD_GREATWORK_MUSIC"
    ]
   }
  ],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ARTIST",
    2
   ],
   [
    "PSEUDOYIELD_GPP_WRITER",
    2
   ],
   [
    "PSEUDOYIELD_GPP_MUSICIAN",
    2
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_THERMAL_BATH",
  "cost": 360,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 2,
  "regionalRange": 6,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_NATURAL_HISTORY",
  "district": "DISTRICT_ENTERTAINMENT_COMPLEX",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_THERMAL_BATH",
  "replaces": "BUILDING_ZOO",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    2
   ]
  ],
  "prereqs": [
   "BUILDING_ARENA"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "THERMALBATH_ADDTOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_DISTRICT_TOURISM_CHANGE",
    "args": {
     "Amount": "3"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_FEATURE_TYPE",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_GEOTHERMAL_FISSURE",
        "Amount": "1"
       }
      }
     ]
    }
   },
   {
    "id": "THERMALBATH_ADDAMENITIES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_ENTERTAINMENT",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_FEATURE_TYPE",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_GEOTHERMAL_FISSURE",
        "Amount": "1"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_GREAT_BATH",
  "cost": 180,
  "maintenance": 0,
  "housing": 3,
  "entertainment": 1,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_POTTERY",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GREATBATH_FLOODFAITH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_FLOOD",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_MACHU_PICCHU",
  "cost": 400,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_ENGINEERING",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    4
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "MACHUPICCHU_COMMERCIALHUB_GRASSMOUNTAIN_GOLD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_COMMERCIAL_HUB",
     "TerrainType": "TERRAIN_GRASS_MOUNTAIN",
     "YieldType": "YIELD_GOLD",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_GOLD"
    }
   },
   {
    "id": "MACHUPICCHU_COMMERCIALHUB_PLAINSMOUNTAIN_GOLD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_COMMERCIAL_HUB",
     "TerrainType": "TERRAIN_PLAINS_MOUNTAIN",
     "YieldType": "YIELD_GOLD",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_GOLD"
    }
   },
   {
    "id": "MACHUPICCHU_COMMERCIALHUB_DESERTMOUNTAIN_GOLD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_COMMERCIAL_HUB",
     "TerrainType": "TERRAIN_DESERT_MOUNTAIN",
     "YieldType": "YIELD_GOLD",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_GOLD"
    }
   },
   {
    "id": "MACHUPICCHU_COMMERCIALHUB_TUNDRAMOUNTAIN_GOLD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_COMMERCIAL_HUB",
     "TerrainType": "TERRAIN_TUNDRA_MOUNTAIN",
     "YieldType": "YIELD_GOLD",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_GOLD"
    }
   },
   {
    "id": "MACHUPICCHU_COMMERCIALHUB_SNOWMOUNTAIN_GOLD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_COMMERCIAL_HUB",
     "TerrainType": "TERRAIN_SNOW_MOUNTAIN",
     "YieldType": "YIELD_GOLD",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_GOLD"
    }
   },
   {
    "id": "MACHUPICCHU_INDUSTRIALZONE_GRASSMOUNTAIN_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_INDUSTRIAL_ZONE",
     "TerrainType": "TERRAIN_GRASS_MOUNTAIN",
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_PRODUCTION"
    }
   },
   {
    "id": "MACHUPICCHU_INDUSTRIALZONE_PLAINSMOUNTAIN_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_INDUSTRIAL_ZONE",
     "TerrainType": "TERRAIN_PLAINS_MOUNTAIN",
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_PRODUCTION"
    }
   },
   {
    "id": "MACHUPICCHU_INDUSTRIALZONE_DESERTMOUNTAIN_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_INDUSTRIAL_ZONE",
     "TerrainType": "TERRAIN_DESERT_MOUNTAIN",
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_PRODUCTION"
    }
   },
   {
    "id": "MACHUPICCHU_INDUSTRIALZONE_TUNDRAMOUNTAIN_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_INDUSTRIAL_ZONE",
     "TerrainType": "TERRAIN_TUNDRA_MOUNTAIN",
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_PRODUCTION"
    }
   },
   {
    "id": "MACHUPICCHU_INDUSTRIALZONE_SNOWMOUNTAIN_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_INDUSTRIAL_ZONE",
     "TerrainType": "TERRAIN_SNOW_MOUNTAIN",
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_PRODUCTION"
    }
   },
   {
    "id": "MACHUPICCHU_THEATER_GRASSMOUNTAIN_CULTURE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_THEATER",
     "TerrainType": "TERRAIN_GRASS_MOUNTAIN",
     "YieldType": "YIELD_CULTURE",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_CULTURE"
    }
   },
   {
    "id": "MACHUPICCHU_THEATER_PLAINSMOUNTAIN_CULTURE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_THEATER",
     "TerrainType": "TERRAIN_PLAINS_MOUNTAIN",
     "YieldType": "YIELD_CULTURE",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_CULTURE"
    }
   },
   {
    "id": "MACHUPICCHU_THEATER_DESERTMOUNTAIN_CULTURE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_THEATER",
     "TerrainType": "TERRAIN_DESERT_MOUNTAIN",
     "YieldType": "YIELD_CULTURE",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_CULTURE"
    }
   },
   {
    "id": "MACHUPICCHU_THEATER_TUNDRAMOUNTAIN_CULTURE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_THEATER",
     "TerrainType": "TERRAIN_TUNDRA_MOUNTAIN",
     "YieldType": "YIELD_CULTURE",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_CULTURE"
    }
   },
   {
    "id": "MACHUPICCHU_THEATER_SNOWMOUNTAIN_CULTURE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_THEATER",
     "TerrainType": "TERRAIN_SNOW_MOUNTAIN",
     "YieldType": "YIELD_CULTURE",
     "Amount": "1",
     "Description": "LOC_BUILDING_MACHU_PICCHU_CULTURE"
    }
   }
  ]
 },
 {
  "type": "BUILDING_MEENAKSHI_TEMPLE",
  "cost": 710,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_CIVIL_SERVICE",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_FAITH",
    3
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "MEENAKSHITEMPLE_FREE_GURU",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_IN_CITY",
    "args": {
     "UnitType": "UNIT_GURU",
     "Amount": "2"
    }
   },
   {
    "id": "MEENAKSHITEMPLE_RELIGIOUS_UNITS_MOVEMENT",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_GUIDE_MOVEMENT_AOE_RELIGIOUS"
    },
    "ability": [
     {
      "id": "GUIDE_MOVEMENT_AOE_RELIGIOUS_XP2",
      "collection": "COLLECTION_PLAYER_UNITS",
      "effect": "EFFECT_GRANT_ABILITY",
      "args": {
       "AbilityType": "ABILITY_GURU_MOVEMENT"
      },
      "ability": [
       {
        "id": "GURU_MOVEMENT_XP2",
        "collection": "COLLECTION_OWNER",
        "effect": "EFFECT_ADJUST_UNIT_MOVEMENT",
        "args": {
         "Amount": "1"
        },
        "subjectReqs": {
         "test": "ALL",
         "reqs": [
          {
           "type": "REQUIREMENT_PLOT_ADJACENT_FRIENDLY_UNIT_TAG_MATCHES",
           "inverse": false,
           "args": {
            "Tag": "CLASS_GURU"
           }
          }
         ]
        }
       }
      ],
      "subjectReqs": {
       "test": "ALL",
       "reqs": [
        {
         "type": "REQUIREMENT_PLOT_ADJACENT_FRIENDLY_UNIT_TAG_MATCHES",
         "inverse": false,
         "args": {
          "Tag": "CLASS_RELIGIOUS_ALL"
         }
        }
       ]
      }
     }
    ]
   },
   {
    "id": "MEENAKSHITEMPLE_RELIGIOUS_UNITS_COMBAT",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_SAGE_COMBAT_AOE_RELIGIOUS"
    },
    "ability": [
     {
      "id": "SAGE_COMBAT_AOE_RELIGIOUS_XP2",
      "collection": "COLLECTION_PLAYER_UNITS",
      "effect": "EFFECT_GRANT_ABILITY",
      "args": {
       "AbilityType": "ABILITY_GURU_STRENGTH"
      },
      "ability": [
       {
        "id": "GURU_STRENGTH_XP2",
        "collection": "COLLECTION_UNIT_COMBAT",
        "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
        "args": {
         "Amount": "5"
        },
        "subjectReqs": {
         "test": "ALL",
         "reqs": [
          {
           "type": "REQUIREMENT_PLOT_ADJACENT_FRIENDLY_UNIT_TAG_MATCHES",
           "inverse": false,
           "args": {
            "Tag": "CLASS_GURU"
           }
          }
         ]
        }
       }
      ],
      "subjectReqs": {
       "test": "ALL",
       "reqs": [
        {
         "type": "REQUIREMENT_PLOT_ADJACENT_FRIENDLY_UNIT_TAG_MATCHES",
         "inverse": false,
         "args": {
          "Tag": "CLASS_RELIGIOUS_ALL"
         }
        }
       ]
      }
     }
    ]
   },
   {
    "id": "MEENAKSHITEMPLE_GURU_DISCOUNT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_PURCHASE_COST",
    "args": {
     "UnitType": "UNIT_GURU",
     "Amount": "30"
    }
   }
  ]
 },
 {
  "type": "BUILDING_UNIVERSITY_SANKORE",
  "cost": 710,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_EDUCATION",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    3
   ],
   [
    "YIELD_FAITH",
    1
   ]
  ],
  "prereqs": [
   "BUILDING_UNIVERSITY"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    2
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "SANKORE_TRADE_OFFER_SCIENCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_TO_OTHERS",
    "args": {
     "Amount": "1",
     "YieldType": "YIELD_SCIENCE"
    }
   },
   {
    "id": "SANKORE_TRADE_OFFER_GOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_TO_OTHERS",
    "args": {
     "Amount": "1",
     "YieldType": "YIELD_GOLD"
    }
   },
   {
    "id": "SANKORE_TRADE_GAIN_SCIENCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FROM_OTHERS",
    "args": {
     "Amount": "2",
     "YieldType": "YIELD_SCIENCE",
     "Domestic": "false"
    }
   },
   {
    "id": "SANKORE_TRADE_DOMESTIC_SCIENCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_TO_OTHERS",
    "args": {
     "Amount": "2",
     "YieldType": "YIELD_SCIENCE",
     "Domestic": "true"
    }
   },
   {
    "id": "SANKORE_TRADE_DOMESTIC_FAITH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_TO_OTHERS",
    "args": {
     "Amount": "1",
     "YieldType": "YIELD_FAITH",
     "Domestic": "true"
    }
   }
  ]
 },
 {
  "type": "BUILDING_ORSZAGHAZ",
  "cost": 920,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_SANITATION",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_CULTURE",
    4
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "ORSZAGHAZ_DOUBLE_FAVOR_SUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_SUZERAIN_FAVOR_MULTIPLIER",
    "args": {
     "Amount": "100"
    }
   }
  ]
 },
 {
  "type": "BUILDING_PANAMA_CANAL",
  "cost": 920,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_STEAM_POWER",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    10
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_GOLDEN_GATE_BRIDGE",
  "cost": 1620,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 3,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_COMBUSTION",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "GOLDENGATE_CITYAPPEAL",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_APPEAL",
    "args": {
     "Amount": "4"
    }
   },
   {
    "id": "GOLDENGATE_GRANT_ROUTES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_ROUTE_IN_RADIUS",
    "args": {
     "RouteType": "ROUTE_MODERN_ROAD",
     "Radius": "1"
    }
   },
   {
    "id": "GOLDENGATE_IMPROVEMENT_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_IMPROVEMENT_TOURISM",
    "args": {
     "Amount": "100"
    }
   },
   {
    "id": "GOLDENGATE_NATIONAL_PARK_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_NATIONAL_PARK_TOURISM",
    "args": {
     "Amount": "100"
    }
   },
   {
    "id": "GOLDENGATE_REMOVE_CLIFFS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_MAP_REMOVE_CLIFFS_IN_DIRECTION",
    "args": {
     "Radius": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_STATUE_OF_ZEUS",
  "cost": 400,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_MILITARY_TRAINING",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    3
   ]
  ],
  "prereqs": [
   "BUILDING_BARRACKS"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "STAUEZEUS_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "NO_ERA",
     "Amount": "50"
    }
   },
   {
    "id": "STAUEZEUS_GRANT_SPEARMEN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_IN_CITY",
    "args": {
     "UnitType": "UNIT_SPEARMAN",
     "Amount": "3"
    }
   },
   {
    "id": "STAUEZEUS_GRANT_ARCHERS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_IN_CITY",
    "args": {
     "UnitType": "UNIT_ARCHER",
     "Amount": "3"
    }
   },
   {
    "id": "STAUEZEUS_GRANT_BATTERINGRAM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_IN_CITY",
    "args": {
     "UnitType": "UNIT_BATTERING_RAM",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_BIOSPHERE",
  "cost": 1740,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_SYNTHETIC_MATERIALS",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "BIOSPHERE_ADJUST_APPEAL_RAINFOREST",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_FEATURE_APPEAL_MODIFIER",
    "args": {
     "FeatureType": "FEATURE_JUNGLE",
     "Amount": "1"
    }
   },
   {
    "id": "BIOSPHERE_ADJUST_APPEAL_MARSH",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_FEATURE_APPEAL_MODIFIER",
    "args": {
     "FeatureType": "FEATURE_MARSH",
     "Amount": "1"
    }
   },
   {
    "id": "BIOSPHERE_MODIFIED_FREE_POWER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_MODIFIED_FREE_POWER_IN_CITY",
    "args": {
     "Amount": "200"
    }
   },
   {
    "id": "BIOSPHERE_GREEN_ENERGY_TOURISM",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_GREEN_ENERGY_TOURISM",
    "args": {
     "Amount": "100"
    }
   }
  ]
 },
 {
  "type": "BUILDING_GROVE",
  "cost": 150,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_MYSTICISM",
  "district": "DISTRICT_PRESERVE",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_SANCTUARY",
  "cost": 440,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_CONSERVATION",
  "district": "DISTRICT_PRESERVE",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": []
 },
 {
  "type": "BUILDING_CONSULATE",
  "cost": 150,
  "maintenance": 1,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_MATHEMATICS",
  "civic": null,
  "district": "DISTRICT_DIPLOMATIC_QUARTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "CONSULATE_INFLUENCEPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_INFLUENCE_POINTS_PER_TURN",
    "args": {
     "Amount": "2"
    }
   },
   {
    "id": "CONSULATE_SPY_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_SPY_BONUS",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CONSULATE"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_DISTRICT",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_ENCAMPMENT"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_CHANCERY",
  "cost": 290,
  "maintenance": 2,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_DIPLOMATIC_SERVICE",
  "district": "DISTRICT_DIPLOMATIC_QUARTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [],
  "prereqs": [
   "BUILDING_CONSULATE"
  ],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "CHANCERY_INFLUENCEPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_INFLUENCE_POINTS_PER_TURN",
    "args": {
     "Amount": "3"
    }
   },
   {
    "id": "CHANCERY_COUNTERYSPY_SCIENCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_COUNTER_SPY_YIELD_AWARD_PER_LEVEL",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "50",
     "PerXLevels": "1"
    }
   }
  ]
 },
 {
  "type": "BUILDING_PALGUM",
  "cost": 80,
  "maintenance": 0,
  "housing": 1,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_IRRIGATION",
  "civic": null,
  "district": "DISTRICT_CITY_CENTER",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_PALGUM",
  "replaces": "BUILDING_WATER_MILL",
  "capital": false,
  "religion": false,
  "adjacentRiver": true,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "PALGUM_ADDFOOD",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "Amount": "1",
     "YieldType": "YIELD_FOOD"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IS_FRESH_WATER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_NAVIGATION_SCHOOL",
  "cost": 250,
  "maintenance": 2,
  "housing": 1,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_EDUCATION",
  "civic": null,
  "district": "DISTRICT_CAMPUS",
  "wonder": false,
  "placement": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": -1,
  "trait": "TRAIT_CIVILIZATION_BUILDING_NAVIGATION_SCHOOL",
  "replaces": "BUILDING_UNIVERSITY",
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    4
   ]
  ],
  "prereqs": [
   "BUILDING_LIBRARY"
  ],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ADMIRAL",
    1
   ],
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "NAVIGATION_SCHOOL_NAVAL_UNIT_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_DOMAIN_PRODUCTION",
    "args": {
     "Domain": "DOMAIN_SEA",
     "Amount": "25"
    }
   },
   {
    "id": "NAVIGATION_SCHOOL_NAVAL_COAST_SCIENCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_TERRAIN_TYPE",
    "args": {
     "TerrainType": "TERRAIN_COAST",
     "YieldType": "YIELD_SCIENCE",
     "Amount": "0.5"
    }
   }
  ]
 },
 {
  "type": "BUILDING_ETEMENANKI",
  "cost": 220,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": "TECH_WRITING",
  "civic": null,
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    2
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "ETEMENANKI_SCIENCE_MARSH",
    "collection": "COLLECTION_PLAYER_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_MARSH"
       }
      }
     ]
    }
   },
   {
    "id": "ETEMENANKI_PRODUCTION_MARSH",
    "collection": "COLLECTION_PLAYER_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_MARSH"
       }
      }
     ]
    }
   },
   {
    "id": "ETEMENANKI_SCIENCE_FLOODPLAINS",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_FLOODPLAINS"
       }
      }
     ]
    }
   },
   {
    "id": "ETEMENANKI_PRODUCTION_FLOODPLAINS",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_FLOODPLAINS"
       }
      }
     ]
    }
   },
   {
    "id": "ETEMENANKI_SCIENCE_GRASS_FLOODPLAINS",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_FLOODPLAINS_GRASSLAND"
       }
      }
     ]
    }
   },
   {
    "id": "ETEMENANKI_PRODUCTION_GRASS_FLOODPLAINS",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_FLOODPLAINS_GRASSLAND"
       }
      }
     ]
    }
   },
   {
    "id": "ETEMENANKI_SCIENCE_PLAINS_FLOODPLAINS",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_FLOODPLAINS_PLAINS"
       }
      }
     ]
    }
   },
   {
    "id": "ETEMENANKI_PRODUCTION_PLAINS_FLOODPLAINS",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_FLOODPLAINS_PLAINS"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BUILDING_TORRE_DE_BELEM",
  "cost": 920,
  "maintenance": 0,
  "housing": 0,
  "entertainment": 0,
  "regionalRange": 0,
  "outerDefenseHitPoints": false,
  "outerDefenseStrength": 0,
  "defenseModifier": 0,
  "tech": null,
  "civic": "CIVIC_MERCANTILISM",
  "district": null,
  "wonder": true,
  "placement": true,
  "goldPurchase": false,
  "faithPurchase": false,
  "maxPlayerInstances": -1,
  "maxWorldInstances": 1,
  "trait": null,
  "replaces": null,
  "capital": false,
  "religion": false,
  "adjacentRiver": false,
  "governmentTier": 0,
  "exclusive": [],
  "yields": [
   [
    "YIELD_GOLD",
    5
   ]
  ],
  "prereqs": [],
  "greatWorks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ADMIRAL",
    1
   ]
  ],
  "copies": [],
  "units": [],
  "entertainmentWithPower": 0,
  "blocksCoastalFlooding": false,
  "convertsToPower": null,
  "modifiers": [
   {
    "id": "TORREDEBELEM_TRADE_GOLD_LUXURIES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TRADE_ROUTE_YIELD_PER_DESTINATION_LUXURY_RESOURCE_FOR_INTERNATIONAL",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   },
   {
    "id": "TORREDEBELEM_CHEAPEST_BUILDING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_GRANT_CHEAPEST_BUILDING_IN_CITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_IS_OWNER_CAPITAL_CONTINENT",
       "inverse": true,
       "args": {}
      }
     ]
    }
   }
  ]
 }
];

export const AI_UNITS: readonly AiUnitRow[] = [
 {
  "type": "UNIT_SETTLER",
  "foundCity": true,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 0,
  "cost": 80,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN",
   "CLASS_SETTLER"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_SETTLER",
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_BUILDER",
  "foundCity": false,
  "buildCharges": 3,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 0,
  "cost": 50,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN",
   "CLASS_BUILDER"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_TRADER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 0,
  "cost": 40,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_TRADER",
   "CLASS_LANDCIVILIAN"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_TRADE",
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": "CIVIC_FOREIGN_TRADE",
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_MISSIONARY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": true,
  "goldPurchase": false,
  "faithPurchase": true,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 75,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN",
   "CLASS_RELIGIOUS",
   "CLASS_RELIGIOUS_ALL",
   "CLASS_RELIGIOUS_SPREAD",
   "CLASS_MISSIONARY"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_RELIGIOUS",
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [
   "BUILDING_SHRINE"
  ],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 100,
  "spreadCharges": 3,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_APOSTLE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": true,
  "goldPurchase": false,
  "faithPurchase": true,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 200,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN",
   "CLASS_RELIGIOUS",
   "CLASS_RELIGIOUS_ALL",
   "CLASS_RELIGIOUS_SPREAD"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_RELIGIOUS",
  "promotionClass": "PROMOTION_CLASS_APOSTLE",
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [
   "BUILDING_TEMPLE",
   "BUILDING_STAVE_CHURCH",
   "BUILDING_PRASAT"
  ],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 110,
  "spreadCharges": 3,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_INQUISITOR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": true,
  "goldPurchase": false,
  "faithPurchase": true,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 75,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN",
   "CLASS_INQUISITOR",
   "CLASS_RELIGIOUS_ALL",
   "CLASS_RELIGIOUS_SPREAD"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_RELIGIOUS",
  "promotionClass": "PROMOTION_CLASS_INQUISITOR",
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [
   "BUILDING_TEMPLE",
   "BUILDING_STAVE_CHURCH",
   "BUILDING_PRASAT"
  ],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 75,
  "spreadCharges": 3,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_GURU",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": true,
  "goldPurchase": false,
  "faithPurchase": true,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 120,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN",
   "CLASS_RELIGIOUS",
   "CLASS_RELIGIOUS_ALL",
   "CLASS_MISSIONARY",
   "CLASS_GURU"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_RELIGIOUS",
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [
   "BUILDING_TEMPLE",
   "BUILDING_STAVE_CHURCH",
   "BUILDING_PRASAT"
  ],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 90,
  "spreadCharges": 0,
  "healCharges": 3,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_WARRIOR_MONK",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": true,
  "goldPurchase": false,
  "faithPurchase": true,
  "combat": 40,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 2,
  "cost": 100,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_WARRIOR_MONK"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MONK",
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [
   "BUILDING_TEMPLE",
   "BUILDING_STAVE_CHURCH",
   "BUILDING_PRASAT"
  ],
  "spy": false,
  "wmd": false,
  "religion": true,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_ARCHAEOLOGIST",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 400,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN",
   "CLASS_ARCHAEOLOGIST"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_ARCHAEOLOGIST",
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": "CIVIC_NATURAL_HISTORY",
  "district": null,
  "obsolete": [],
  "buildings": [
   "BUILDING_MUSEUM_ARTIFACT"
  ],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_GREAT_GENERAL",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 1,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": false,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_GREAT_ADMIRAL",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 1,
  "domain": "DOMAIN_SEA",
  "civilian": true,
  "support": false,
  "tags": [],
  "abilities": [],
  "pseudo": null,
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": false,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_GREAT_ENGINEER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 1,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [],
  "abilities": [],
  "pseudo": null,
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": false,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_GREAT_MERCHANT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 1,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": false,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_GREAT_PROPHET",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 1,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [],
  "abilities": [],
  "pseudo": null,
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": false,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_GREAT_SCIENTIST",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 1,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": false,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_GREAT_WRITER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 1,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": false,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_GREAT_ARTIST",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 1,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": false,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_GREAT_MUSICIAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 1,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": false,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_SPY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 1,
  "maintenance": 4,
  "cost": 225,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_SPY"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_SPY",
  "promotionClass": "PROMOTION_CLASS_SPY",
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": true,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_NATURALIST",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": true,
  "goldPurchase": false,
  "faithPurchase": true,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 300,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_RELIGIOUS",
  "promotionClass": null,
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": "CIVIC_CONSERVATION",
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 1,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_SCOUT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 10,
  "recon": true,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 0,
  "cost": 30,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RECON",
   "CLASS_REVEAL_STEALTH"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_EXPLORER",
  "promotionClass": "PROMOTION_CLASS_RECON",
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_WARRIOR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 20,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 0,
  "cost": 40,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_GUNPOWDER"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_SLINGER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 5,
  "recon": false,
  "rangedCombat": 15,
  "bombard": 0,
  "antiAir": 0,
  "range": 1,
  "moves": 2,
  "maintenance": 0,
  "cost": 35,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RANGED"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_MACHINERY"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_BARBARIAN_HORSEMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 20,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 1,
  "cost": 40,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_LIGHT_CAVALRY"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
  "resource": null,
  "trait": "TRAIT_BARBARIAN_BUT_SHOWS_UP_IN_PEDIA",
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_BARBARIAN_HORSE_ARCHER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 10,
  "recon": false,
  "rangedCombat": 15,
  "bombard": 0,
  "antiAir": 0,
  "range": 1,
  "moves": 3,
  "maintenance": 1,
  "cost": 35,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RANGED_CAVALRY",
   "CLASS_MOBILE_RANGED"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": "TRAIT_BARBARIAN_BUT_SHOWS_UP_IN_PEDIA",
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_SUMERIAN_WAR_CART",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 30,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 0,
  "cost": 55,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CHARIOT",
   "CLASS_WAR_CART"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_SUMERIAN_WAR_CART",
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_STIRRUPS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_GALLEY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 30,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 1,
  "cost": 65,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_MELEE"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
  "resource": null,
  "trait": null,
  "tech": "TECH_SAILING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_STEAM_POWER"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_NORWEGIAN_LONGSHIP",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 35,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 1,
  "cost": 65,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_LONGSHIP",
   "CLASS_NAVAL_MELEE"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
  "resource": null,
  "trait": "TRAIT_LEADER_UNIT_NORWEGIAN_LONGSHIP",
  "tech": "TECH_SAILING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_ELECTRICITY"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_ARCHER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 15,
  "recon": false,
  "rangedCombat": 25,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 1,
  "cost": 60,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RANGED"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": null,
  "tech": "TECH_ARCHERY",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_SPEARMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 25,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 1,
  "cost": 65,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_ANTI_CAVALRY"
  ],
  "abilities": [
   {
    "id": "ANTI_CAVALRY_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_LIGHT_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_HEAVY_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_RANGED_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
  "resource": null,
  "trait": null,
  "tech": "TECH_BRONZE_WORKING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_METAL_CASTING"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_HEAVY_CHARIOT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 28,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 1,
  "cost": 65,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CAVALRY",
   "CLASS_HEAVY_CHARIOT"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": null,
  "trait": null,
  "tech": "TECH_THE_WHEEL",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMBUSTION"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_BATTERING_RAM",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 1,
  "cost": 65,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": true,
  "tags": [
   "CLASS_BATTERING_RAM",
   "CLASS_SUPPORT"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SUPPORT",
  "resource": null,
  "trait": null,
  "tech": "TECH_MASONRY",
  "civic": null,
  "district": null,
  "obsolete": [
   "CIVIC_CIVIL_ENGINEERING"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_GREEK_HOPLITE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 28,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 1,
  "cost": 65,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_ANTI_CAVALRY",
   "CLASS_HOPLITE"
  ],
  "abilities": [
   {
    "id": "ANTI_CAVALRY_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_LIGHT_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_HEAVY_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_RANGED_CAVALRY"
       }
      }
     ]
    }
   },
   {
    "id": "HOPLITE_NEIGHBOR_COMBAT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "HOPLITE_NEIGHBOR_COMBAT_MODIFIER"
    },
    "attach": {
     "id": "HOPLITE_NEIGHBOR_COMBAT_MODIFIER",
     "collection": "COLLECTION_UNIT_COMBAT",
     "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
     "args": {
      "Amount": "10"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_FRIENDLY_UNIT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "UnitType": "UNIT_GREEK_HOPLITE"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_GREEK_HOPLITE",
  "tech": "TECH_BRONZE_WORKING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_METAL_CASTING"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_SWORDSMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 35,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 2,
  "cost": 90,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_IRON",
  "trait": null,
  "tech": "TECH_IRON_WORKING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_REPLACEABLE_PARTS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_HORSEMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 36,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 2,
  "cost": 80,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_LIGHT_CAVALRY"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
  "resource": "RESOURCE_HORSES",
  "trait": null,
  "tech": "TECH_HORSEBACK_RIDING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_SYNTHETIC_MATERIALS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_SCYTHIAN_HORSE_ARCHER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 20,
  "recon": false,
  "rangedCombat": 25,
  "bombard": 0,
  "antiAir": 0,
  "range": 1,
  "moves": 4,
  "maintenance": 2,
  "cost": 100,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RANGED_CAVALRY",
   "CLASS_MOBILE_RANGED"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_SCYTHIAN_HORSE_ARCHER",
  "tech": "TECH_HORSEBACK_RIDING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_ROMAN_LEGION",
  "foundCity": false,
  "buildCharges": 1,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 40,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 2,
  "cost": 110,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_LEGION"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_IRON",
  "trait": "TRAIT_CIVILIZATION_UNIT_ROMAN_LEGION",
  "tech": "TECH_IRON_WORKING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_REPLACEABLE_PARTS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_KONGO_SHIELD_BEARER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 38,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 2,
  "cost": 110,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_NAGAO"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   },
   {
    "id": "NAGAO_RANGED_DEFENSE",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_COMBAT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "CombatType": "COMBAT_RANGED"
       }
      },
      {
       "type": "REQUIREMENT_PLAYER_IS_ATTACKING",
       "inverse": true,
       "args": {}
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_IRON",
  "trait": "TRAIT_CIVILIZATION_UNIT_KONGO_SHIELD_BEARER",
  "tech": "TECH_IRON_WORKING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_REPLACEABLE_PARTS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 5
 },
 {
  "type": "UNIT_CATAPULT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 25,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 35,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 2,
  "cost": 120,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_SIEGE",
   "CLASS_SIEGE_SETUP",
   "CLASS_FORWARD_OBSERVER"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SIEGE",
  "resource": null,
  "trait": null,
  "tech": "TECH_ENGINEERING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_STEEL"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_SIEGE_TOWER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 2,
  "cost": 100,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": true,
  "tags": [
   "CLASS_SIEGE_TOWER",
   "CLASS_SUPPORT"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SUPPORT",
  "resource": null,
  "trait": null,
  "tech": "TECH_MACHINERY",
  "civic": null,
  "district": null,
  "obsolete": [
   "CIVIC_CIVIL_ENGINEERING"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_QUADRIREME",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 20,
  "recon": false,
  "rangedCombat": 25,
  "bombard": 0,
  "antiAir": 0,
  "range": 1,
  "moves": 3,
  "maintenance": 2,
  "cost": 120,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RANGED"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
  "resource": null,
  "trait": null,
  "tech": "TECH_SHIPBUILDING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_STEEL"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_EGYPTIAN_CHARIOT_ARCHER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 25,
  "recon": false,
  "rangedCombat": 35,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 1,
  "cost": 90,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_LIGHT_CHARIOT",
   "CLASS_RANGED_CAVALRY"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_EGYPTIAN_CHARIOT_ARCHER",
  "tech": "TECH_THE_WHEEL",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_JAPANESE_SAMURAI",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 48,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 3,
  "cost": 160,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_SAMURAI"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_IRON",
  "trait": "TRAIT_CIVILIZATION_UNIT_JAPANESE_SAMURAI",
  "tech": null,
  "civic": "CIVIC_FEUDALISM",
  "district": null,
  "obsolete": [
   "TECH_REPLACEABLE_PARTS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_NORWEGIAN_BERSERKER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 48,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 3,
  "cost": 160,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_MELEE_BERSERKER"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   },
   {
    "id": "UNIT_STRONG_WHEN_ATTACKING",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_ATTACKING",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "UNIT_WEAK_WHEN_DEFENDING",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "-5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_ATTACKING",
       "inverse": true,
       "args": {}
      },
      {
       "type": "REQUIREMENT_COMBAT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "CombatType": "COMBAT_MELEE"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_IRON",
  "trait": "TRAIT_CIVILIZATION_UNIT_NORWEGIAN_BERSERKER",
  "tech": "TECH_MILITARY_TACTICS",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_REPLACEABLE_PARTS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_KNIGHT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 50,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 4,
  "cost": 220,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CAVALRY"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": "RESOURCE_IRON",
  "trait": null,
  "tech": "TECH_STIRRUPS",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMPOSITES"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_INDIAN_VARU",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 40,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 2,
  "cost": 120,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CAVALRY",
   "CLASS_VARU"
  ],
  "abilities": [
   {
    "id": "VARU_NEGATIVE_COMBAT",
    "collection": "COLLECTION_ALL_UNITS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "VARU_NEGATIVE_COMBAT_MODIFIER"
    },
    "attach": {
     "id": "VARU_NEGATIVE_COMBAT_MODIFIER",
     "collection": "COLLECTION_UNIT_COMBAT",
     "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
     "args": {
      "Amount": "-5"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_OWNER_AT_WAR",
       "inverse": false,
       "args": {
        "MinDistance": "1",
        "MaxDistance": "1"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_INDIAN_VARU",
  "tech": "TECH_HORSEBACK_RIDING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMBUSTION"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_ARABIAN_MAMLUK",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 50,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 4,
  "cost": 220,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CAVALRY",
   "CLASS_MAMLUK"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": "RESOURCE_IRON",
  "trait": "TRAIT_CIVILIZATION_UNIT_ARABIAN_MAMLUK",
  "tech": "TECH_STIRRUPS",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMPOSITES"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_CROSSBOWMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 30,
  "recon": false,
  "rangedCombat": 40,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 3,
  "cost": 180,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RANGED"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": null,
  "tech": "TECH_MACHINERY",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_ADVANCED_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_CHINESE_CROUCHING_TIGER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 30,
  "recon": false,
  "rangedCombat": 50,
  "bombard": 0,
  "antiAir": 0,
  "range": 1,
  "moves": 2,
  "maintenance": 3,
  "cost": 140,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RANGED"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_CHINESE_CROUCHING_TIGER",
  "tech": "TECH_MACHINERY",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_ADVANCED_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_MILITARY_ENGINEER",
  "foundCity": false,
  "buildCharges": 2,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 2,
  "cost": 170,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": true,
  "tags": [
   "CLASS_SUPPORT"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SUPPORT",
  "resource": null,
  "trait": null,
  "tech": "TECH_MILITARY_ENGINEERING",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [
   "BUILDING_ARMORY"
  ],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_PIKEMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 45,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 2,
  "cost": 180,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_ANTI_CAVALRY"
  ],
  "abilities": [
   {
    "id": "ANTI_CAVALRY_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_LIGHT_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_HEAVY_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_RANGED_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
  "resource": null,
  "trait": null,
  "tech": "TECH_MILITARY_TACTICS",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMPOSITES"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_MUSKETMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 55,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 4,
  "cost": 240,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_NITER",
  "trait": null,
  "tech": "TECH_GUNPOWDER",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_ADVANCED_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_SPANISH_CONQUISTADOR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 58,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 4,
  "cost": 250,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_CONQUISTADOR"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   },
   {
    "id": "CONQUISTADOR_SPECIFIC_UNIT_COMBAT",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_FRIENDLY_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_RELIGIOUS_ALL",
        "IncludeCenter": "true"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_NITER",
  "trait": "TRAIT_CIVILIZATION_UNIT_SPANISH_CONQUISTADOR",
  "tech": "TECH_GUNPOWDER",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_ADVANCED_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_CARAVEL",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 55,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 4,
  "cost": 240,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_MELEE"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
  "resource": null,
  "trait": null,
  "tech": "TECH_CARTOGRAPHY",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMBINED_ARMS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_BOMBARD",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 45,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 55,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 4,
  "cost": 280,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_SIEGE",
   "CLASS_SIEGE_SETUP",
   "CLASS_FORWARD_OBSERVER"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SIEGE",
  "resource": "RESOURCE_NITER",
  "trait": null,
  "tech": "TECH_METAL_CASTING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_GUIDANCE_SYSTEMS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_FRIGATE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 45,
  "recon": false,
  "rangedCombat": 55,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 4,
  "maintenance": 5,
  "cost": 280,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RANGED"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
  "resource": "RESOURCE_NITER",
  "trait": null,
  "tech": "TECH_SQUARE_RIGGING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_LASERS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_PRIVATEER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 40,
  "recon": false,
  "rangedCombat": 50,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 4,
  "maintenance": 4,
  "cost": 280,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RAIDER",
   "CLASS_NAVAL_RANGED",
   "CLASS_STEALTH",
   "CLASS_REVEAL_STEALTH"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": "CIVIC_MERCANTILISM",
  "district": null,
  "obsolete": [
   "TECH_LASERS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_ENGLISH_SEADOG",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 40,
  "recon": false,
  "rangedCombat": 55,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 4,
  "maintenance": 4,
  "cost": 280,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RAIDER",
   "CLASS_NAVAL_RANGED",
   "CLASS_STEALTH",
   "CLASS_REVEAL_STEALTH",
   "CLASS_CAPTURE_SHIPS"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_ENGLISH_SEADOG",
  "tech": null,
  "civic": "CIVIC_MERCANTILISM",
  "district": null,
  "obsolete": [
   "TECH_TELECOMMUNICATIONS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_FIELD_CANNON",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 50,
  "recon": false,
  "rangedCombat": 60,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 5,
  "cost": 330,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RANGED"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": null,
  "tech": "TECH_BALLISTICS",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_TELECOMMUNICATIONS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_CAVALRY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 62,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 5,
  "maintenance": 5,
  "cost": 330,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_LIGHT_CAVALRY"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
  "resource": "RESOURCE_HORSES",
  "trait": null,
  "tech": "TECH_MILITARY_SCIENCE",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_RUSSIAN_COSSACK",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 67,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 5,
  "maintenance": 5,
  "cost": 340,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_LIGHT_CAVALRY",
   "CLASS_COSSACK"
  ],
  "abilities": [
   {
    "id": "COSSACK_LOCAL_COMBAT",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_ADJACENT_TO_OWNER_TERRITORY",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_UNIT_IN_OWNER_TERRITORY",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
  "resource": "RESOURCE_HORSES",
  "trait": "TRAIT_CIVILIZATION_UNIT_RUSSIAN_COSSACK",
  "tech": "TECH_MILITARY_SCIENCE",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_ENGLISH_REDCOAT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 70,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 5,
  "cost": 360,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_REDCOAT",
   "CLASS_MELEE"
  ],
  "abilities": [
   {
    "id": "REDCOAT_FOREIGN_COMBAT",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_ON_HOME_CONTINENT",
       "inverse": true,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_NITER",
  "trait": "TRAIT_LEADER_UNIT_ENGLISH_REDCOAT",
  "tech": "TECH_MILITARY_SCIENCE",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_FRENCH_GARDE_IMPERIALE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 70,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 5,
  "cost": 360,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_GARDE"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   },
   {
    "id": "GARDE_CONTINENT_COMBAT",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_ON_HOME_CONTINENT",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_NITER",
  "trait": "TRAIT_CIVILIZATION_UNIT_FRENCH_GARDE_IMPERIALE",
  "tech": "TECH_MILITARY_SCIENCE",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_MEDIC",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 5,
  "cost": 370,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": true,
  "tags": [
   "CLASS_MEDIC",
   "CLASS_SUPPORT"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SUPPORT",
  "resource": null,
  "trait": null,
  "tech": "TECH_SANITATION",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_IRONCLAD",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 70,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 5,
  "maintenance": 5,
  "cost": 380,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_MELEE"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
  "resource": "RESOURCE_COAL",
  "trait": null,
  "tech": "TECH_STEAM_POWER",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_COAL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_AMERICAN_ROUGH_RIDER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 67,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 5,
  "maintenance": 2,
  "cost": 385,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CAVALRY",
   "CLASS_ROUGH_RIDER"
  ],
  "abilities": [
   {
    "id": "ROUGH_RIDER_BONUS_ON_HILLS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_GRASS_HILLS"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_PLAINS_HILLS"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_TUNDRA_HILLS"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_DESERT_HILLS"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_SNOW_HILLS"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": null,
  "trait": "TRAIT_LEADER_UNIT_AMERICAN_ROUGH_RIDER",
  "tech": "TECH_BALLISTICS",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMBUSTION"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_RANGER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 45,
  "recon": true,
  "rangedCombat": 60,
  "bombard": 0,
  "antiAir": 0,
  "range": 1,
  "moves": 3,
  "maintenance": 5,
  "cost": 380,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RECON",
   "CLASS_RANGED",
   "CLASS_MOBILE_RANGED"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RECON",
  "resource": null,
  "trait": null,
  "tech": "TECH_RIFLING",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_OBSERVATION_BALLOON",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 2,
  "cost": 240,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": true,
  "tags": [
   "CLASS_OBSERVATION",
   "CLASS_SUPPORT"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SUPPORT",
  "resource": null,
  "trait": null,
  "tech": "TECH_FLIGHT",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_BIPLANE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 80,
  "recon": false,
  "rangedCombat": 75,
  "bombard": 0,
  "antiAir": 0,
  "range": 4,
  "moves": 6,
  "maintenance": 6,
  "cost": 430,
  "domain": "DOMAIN_AIR",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_AIRCRAFT",
   "CLASS_AIR_FIGHTER"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_AIR_COMBAT",
  "promotionClass": "PROMOTION_CLASS_AIR_FIGHTER",
  "resource": "RESOURCE_OIL",
  "trait": null,
  "tech": "TECH_FLIGHT",
  "civic": null,
  "district": "DISTRICT_AERODROME",
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_OIL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_INFANTRY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 75,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 6,
  "cost": 430,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_OIL",
  "trait": null,
  "tech": "TECH_REPLACEABLE_PARTS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_OIL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_ARTILLERY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 60,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 80,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 6,
  "cost": 430,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_SIEGE",
   "CLASS_SIEGE_SETUP",
   "CLASS_FORWARD_OBSERVER",
   "CLASS_TARGETTING_ASSIST"
  ],
  "abilities": [
   {
    "id": "BOMBARD_STR_BUFF_FROM_DRONE",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_FRIENDLY_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_DRONE"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SIEGE",
  "resource": "RESOURCE_OIL",
  "trait": null,
  "tech": "TECH_STEEL",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_OIL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_BATTLESHIP",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 60,
  "recon": false,
  "rangedCombat": 70,
  "bombard": 0,
  "antiAir": 90,
  "range": 3,
  "moves": 5,
  "maintenance": 6,
  "cost": 430,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RANGED",
   "CLASS_ANTI_AIR"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
  "resource": "RESOURCE_COAL",
  "trait": null,
  "tech": "TECH_REFINING",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_COAL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_BRAZILIAN_MINAS_GERAES",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 70,
  "recon": false,
  "rangedCombat": 80,
  "bombard": 0,
  "antiAir": 95,
  "range": 3,
  "moves": 5,
  "maintenance": 6,
  "cost": 430,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RANGED",
   "CLASS_ANTI_AIR"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
  "resource": "RESOURCE_COAL",
  "trait": "TRAIT_CIVILIZATION_UNIT_BRAZILIAN_MINAS_GERAES",
  "tech": null,
  "civic": "CIVIC_NATIONALISM",
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_COAL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_SUBMARINE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 65,
  "recon": false,
  "rangedCombat": 75,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 3,
  "maintenance": 6,
  "cost": 480,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RAIDER",
   "CLASS_NAVAL_RANGED",
   "CLASS_STEALTH",
   "CLASS_REVEAL_STEALTH"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
  "resource": "RESOURCE_OIL",
  "trait": null,
  "tech": "TECH_ELECTRICITY",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_OIL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_GERMAN_UBOAT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 65,
  "recon": false,
  "rangedCombat": 75,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 3,
  "maintenance": 6,
  "cost": 430,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RAIDER",
   "CLASS_NAVAL_RANGED",
   "CLASS_UBOAT",
   "CLASS_STEALTH",
   "CLASS_REVEAL_STEALTH"
  ],
  "abilities": [
   {
    "id": "UBOAT_OCEAN_COMBAT",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_OCEAN"
       }
      }
     ]
    }
   }
  ],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_GERMAN_UBOAT",
  "tech": "TECH_ELECTRICITY",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_AT_CREW",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 75,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 4,
  "cost": 400,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_ANTI_CAVALRY"
  ],
  "abilities": [
   {
    "id": "ANTI_CAVALRY_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_LIGHT_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_HEAVY_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_RANGED_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
  "resource": null,
  "trait": null,
  "tech": "TECH_CHEMISTRY",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_TANK",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 85,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 6,
  "cost": 480,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CHARIOT",
   "CLASS_HEAVY_CAVALRY"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": "RESOURCE_OIL",
  "trait": null,
  "tech": "TECH_COMBUSTION",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_OIL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_FIGHTER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 100,
  "recon": false,
  "rangedCombat": 100,
  "bombard": 0,
  "antiAir": 0,
  "range": 5,
  "moves": 8,
  "maintenance": 7,
  "cost": 520,
  "domain": "DOMAIN_AIR",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_AIRCRAFT",
   "CLASS_AIR_FIGHTER"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_AIR_COMBAT",
  "promotionClass": "PROMOTION_CLASS_AIR_FIGHTER",
  "resource": "RESOURCE_ALUMINUM",
  "trait": null,
  "tech": "TECH_ADVANCED_FLIGHT",
  "civic": null,
  "district": "DISTRICT_AERODROME",
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_ALUMINUM",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_AMERICAN_P51",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 105,
  "recon": false,
  "rangedCombat": 105,
  "bombard": 0,
  "antiAir": 0,
  "range": 5,
  "moves": 10,
  "maintenance": 7,
  "cost": 520,
  "domain": "DOMAIN_AIR",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_AIRCRAFT",
   "CLASS_AIR_FIGHTER",
   "CLASS_MUSTANG"
  ],
  "abilities": [
   {
    "id": "ANTI_FIGHTER_AIRCRAFT_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_AIR_FIGHTER"
       }
      }
     ]
    }
   }
  ],
  "pseudo": "PSEUDOYIELD_UNIT_AIR_COMBAT",
  "promotionClass": "PROMOTION_CLASS_AIR_FIGHTER",
  "resource": "RESOURCE_ALUMINUM",
  "trait": "TRAIT_CIVILIZATION_UNIT_AMERICAN_P51",
  "tech": "TECH_ADVANCED_FLIGHT",
  "civic": null,
  "district": "DISTRICT_AERODROME",
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_ALUMINUM",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_BOMBER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 85,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 110,
  "antiAir": 0,
  "range": 10,
  "moves": 10,
  "maintenance": 7,
  "cost": 560,
  "domain": "DOMAIN_AIR",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_AIRCRAFT",
   "CLASS_AIR_BOMBER"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_AIR_COMBAT",
  "promotionClass": "PROMOTION_CLASS_AIR_BOMBER",
  "resource": "RESOURCE_ALUMINUM",
  "trait": null,
  "tech": "TECH_ADVANCED_FLIGHT",
  "civic": null,
  "district": "DISTRICT_AERODROME",
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": true,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_ALUMINUM",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_ANTIAIR_GUN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 90,
  "range": 1,
  "moves": 2,
  "maintenance": 2,
  "cost": 455,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": true,
  "tags": [
   "CLASS_ANTI_AIR",
   "CLASS_SUPPORT"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SUPPORT",
  "resource": null,
  "trait": null,
  "tech": "TECH_ADVANCED_BALLISTICS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_MACHINE_GUN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 70,
  "recon": false,
  "rangedCombat": 85,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 6,
  "cost": 540,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RANGED"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": null,
  "tech": "TECH_ADVANCED_BALLISTICS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_AIRCRAFT_CARRIER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 65,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 7,
  "cost": 540,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_CARRIER"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_CARRIER",
  "resource": "",
  "trait": null,
  "tech": "TECH_COMBINED_ARMS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_DESTROYER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 85,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 90,
  "range": 0,
  "moves": 4,
  "maintenance": 7,
  "cost": 540,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_MELEE",
   "CLASS_REVEAL_STEALTH",
   "CLASS_ANTI_AIR"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
  "resource": "RESOURCE_OIL",
  "trait": null,
  "tech": "TECH_COMBINED_ARMS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_OIL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_HELICOPTER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 86,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 7,
  "cost": 600,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_LIGHT_CAVALRY",
   "CLASS_HELICOPTER"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
  "resource": "RESOURCE_ALUMINUM",
  "trait": null,
  "tech": "TECH_SYNTHETIC_MATERIALS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_ALUMINUM",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_NUCLEAR_SUBMARINE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 80,
  "recon": false,
  "rangedCombat": 85,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 4,
  "maintenance": 8,
  "cost": 680,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RAIDER",
   "CLASS_NAVAL_RANGED",
   "CLASS_STEALTH",
   "CLASS_REVEAL_STEALTH"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
  "resource": "",
  "trait": null,
  "tech": "TECH_TELECOMMUNICATIONS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": true,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_MECHANIZED_INFANTRY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 85,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 8,
  "cost": 650,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_OIL",
  "trait": null,
  "tech": "TECH_SATELLITES",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_OIL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_ROCKET_ARTILLERY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 70,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 100,
  "antiAir": 0,
  "range": 3,
  "moves": 3,
  "maintenance": 8,
  "cost": 680,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_SIEGE",
   "CLASS_SIEGE_SETUP",
   "CLASS_FORWARD_OBSERVER",
   "CLASS_TARGETTING_ASSIST"
  ],
  "abilities": [
   {
    "id": "BOMBARD_STR_BUFF_FROM_DRONE",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_FRIENDLY_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_DRONE"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SIEGE",
  "resource": "RESOURCE_OIL",
  "trait": null,
  "tech": "TECH_GUIDANCE_SYSTEMS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_OIL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_MOBILE_SAM",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 100,
  "range": 1,
  "moves": 3,
  "maintenance": 4,
  "cost": 590,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": true,
  "tags": [
   "CLASS_ANTI_AIR",
   "CLASS_SUPPORT"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SUPPORT",
  "resource": null,
  "trait": null,
  "tech": "TECH_GUIDANCE_SYSTEMS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_JET_FIGHTER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 110,
  "recon": false,
  "rangedCombat": 110,
  "bombard": 0,
  "antiAir": 0,
  "range": 6,
  "moves": 10,
  "maintenance": 8,
  "cost": 650,
  "domain": "DOMAIN_AIR",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_AIRCRAFT",
   "CLASS_AIR_FIGHTER"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_AIR_COMBAT",
  "promotionClass": "PROMOTION_CLASS_AIR_FIGHTER",
  "resource": "RESOURCE_ALUMINUM",
  "trait": null,
  "tech": "TECH_LASERS",
  "civic": null,
  "district": "DISTRICT_AERODROME",
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_ALUMINUM",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_JET_BOMBER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 90,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 120,
  "antiAir": 0,
  "range": 15,
  "moves": 15,
  "maintenance": 8,
  "cost": 700,
  "domain": "DOMAIN_AIR",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_AIRCRAFT",
   "CLASS_AIR_BOMBER"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_AIR_COMBAT",
  "promotionClass": "PROMOTION_CLASS_AIR_BOMBER",
  "resource": "RESOURCE_ALUMINUM",
  "trait": null,
  "tech": "TECH_STEALTH_TECHNOLOGY",
  "civic": null,
  "district": "DISTRICT_AERODROME",
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": true,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_ALUMINUM",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_MISSILE_CRUISER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 75,
  "recon": false,
  "rangedCombat": 90,
  "bombard": 0,
  "antiAir": 110,
  "range": 3,
  "moves": 5,
  "maintenance": 8,
  "cost": 680,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RANGED",
   "CLASS_ANTI_AIR"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
  "resource": "RESOURCE_OIL",
  "trait": null,
  "tech": "TECH_LASERS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_OIL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_MODERN_AT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 85,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 8,
  "cost": 580,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_ANTI_CAVALRY"
  ],
  "abilities": [
   {
    "id": "ANTI_CAVALRY_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_LIGHT_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_HEAVY_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_RANGED_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
  "resource": null,
  "trait": null,
  "tech": "TECH_COMPOSITES",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_MODERN_ARMOR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 95,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 8,
  "cost": 680,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CHARIOT",
   "CLASS_HEAVY_CAVALRY"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": "RESOURCE_OIL",
  "trait": null,
  "tech": "TECH_COMPOSITES",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": "RESOURCE_OIL",
  "maintenanceResourceAmount": 1,
  "resourceCost": 1
 },
 {
  "type": "UNIT_MAN_AT_ARMS",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 45,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 3,
  "cost": 160,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_IRON",
  "trait": null,
  "tech": "TECH_APPRENTICESHIP",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_REPLACEABLE_PARTS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_LINE_INFANTRY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 65,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 5,
  "cost": 360,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_NITER",
  "trait": null,
  "tech": "TECH_MILITARY_SCIENCE",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_SATELLITES"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_TREBUCHET",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 35,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 45,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 3,
  "cost": 200,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_SIEGE",
   "CLASS_SIEGE_SETUP",
   "CLASS_FORWARD_OBSERVER"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SIEGE",
  "resource": null,
  "trait": null,
  "tech": "TECH_MILITARY_ENGINEERING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_STEEL"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_AZTEC_EAGLE_WARRIOR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 28,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 0,
  "cost": 65,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_CAPTURE_WORKER"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_AZTEC_EAGLE_WARRIOR",
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_GUNPOWDER"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_INDONESIAN_JONG",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 45,
  "recon": false,
  "rangedCombat": 55,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 5,
  "maintenance": 5,
  "cost": 300,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RANGED",
   "CLASS_JONG"
  ],
  "abilities": [
   {
    "id": "JONG_BONUS_IN_FORMATION",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_IN_FORMATION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_INDONESIAN_JONG",
  "tech": null,
  "civic": "CIVIC_MERCENARIES",
  "district": null,
  "obsolete": [
   "TECH_LASERS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_KHMER_DOMREY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 40,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 50,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 3,
  "cost": 200,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_SIEGE",
   "CLASS_FORWARD_OBSERVER"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SIEGE",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_KHMER_DOMREY",
  "tech": "TECH_MILITARY_ENGINEERING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_GUIDANCE_SYSTEMS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_POLISH_HUSSAR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 64,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 5,
  "cost": 330,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CAVALRY",
   "CLASS_PUSHBACK"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": "RESOURCE_IRON",
  "trait": "TRAIT_CIVILIZATION_UNIT_POLISH_HUSSAR",
  "tech": null,
  "civic": "CIVIC_MERCANTILISM",
  "district": null,
  "obsolete": [
   "TECH_COMBUSTION"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_NUBIAN_PITATI",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 17,
  "recon": false,
  "rangedCombat": 30,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 3,
  "maintenance": 1,
  "cost": 70,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RANGED"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_NUBIAN_PITATI",
  "tech": "TECH_ARCHERY",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_MACEDONIAN_HYPASPIST",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 38,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 2,
  "cost": 100,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_HYPASPIST"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   },
   {
    "id": "HYPASPIST_SIEGE_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_IS_DISTRICT",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_IRON",
  "trait": "TRAIT_CIVILIZATION_UNIT_HYPASPIST",
  "tech": "TECH_IRON_WORKING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_REPLACEABLE_PARTS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 5
 },
 {
  "type": "UNIT_MACEDONIAN_HETAIROI",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 36,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 2,
  "cost": 100,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CAVALRY",
   "CLASS_HETAIROI"
  ],
  "abilities": [
   {
    "id": "HETAIROI_GREAT_GENERAL_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_FRIENDLY_UNIT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "UnitType": "UNIT_GREAT_GENERAL",
        "IncludeCenter": "true"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": "RESOURCE_HORSES",
  "trait": "TRAIT_LEADER_UNIT_HETAIROI",
  "tech": "TECH_HORSEBACK_RIDING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_REPLACEABLE_PARTS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_PERSIAN_IMMORTAL",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 35,
  "recon": false,
  "rangedCombat": 25,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 2,
  "cost": 100,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_RANGED"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_IRON",
  "trait": "TRAIT_CIVILIZATION_UNIT_IMMORTAL",
  "tech": "TECH_IRON_WORKING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_REPLACEABLE_PARTS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_DIGGER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 78,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 6,
  "cost": 430,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_DIGGER"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   },
   {
    "id": "DIGGER_BONUS_ON_COAST",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_ON_COAST",
       "inverse": false,
       "args": {
        "Water": "true"
       }
      }
     ]
    }
   },
   {
    "id": "DIGGER_NON_DOMESTIC_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_IN_OWNER_TERRITORY",
       "inverse": true,
       "args": {}
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_DIGGER",
  "tech": "TECH_REPLACEABLE_PARTS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_ZULU_IMPI",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 45,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 1,
  "cost": 125,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_ANTI_CAVALRY",
   "CLASS_ZULU_IMPI"
  ],
  "abilities": [
   {
    "id": "ANTI_CAVALRY_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_LIGHT_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_HEAVY_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_RANGED_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_ZULU_IMPI",
  "tech": "TECH_MILITARY_TACTICS",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMPOSITES"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_KOREAN_HWACHA",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 45,
  "recon": false,
  "rangedCombat": 60,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 3,
  "cost": 250,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RANGED",
   "CLASS_FIELD_SETUP"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_KOREAN_HWACHA",
  "tech": "TECH_GUNPOWDER",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_ADVANCED_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_SCOTTISH_HIGHLANDER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 50,
  "recon": true,
  "rangedCombat": 65,
  "bombard": 0,
  "antiAir": 0,
  "range": 1,
  "moves": 3,
  "maintenance": 5,
  "cost": 380,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RECON",
   "CLASS_SCOTTISH_HIGHLANDER"
  ],
  "abilities": [
   {
    "id": "HIGHLANDER_COMBAT_BONUS_FOREST_AND_HILLS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IS_HILLS",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_FOREST"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RECON",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_SCOTTISH_HIGHLANDER",
  "tech": "TECH_RIFLING",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_DE_ZEVEN_PROVINCIEN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 50,
  "recon": false,
  "rangedCombat": 60,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 4,
  "maintenance": 5,
  "cost": 280,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RANGED",
   "CLASS_DUTCH_ZEVEN_PROVINCIEN"
  ],
  "abilities": [
   {
    "id": "ZEVEN_PROVINCIEN_BONUS_VS_DEF_DISTRICTS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "7"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_IS_DISTRICT",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
  "resource": "RESOURCE_NITER",
  "trait": "TRAIT_CIVILIZATION_UNIT_DUTCH_ZEVEN_PROVINCIEN",
  "tech": "TECH_SQUARE_RIGGING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_LASERS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_MONGOLIAN_KESHIG",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 35,
  "recon": false,
  "rangedCombat": 45,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 4,
  "maintenance": 3,
  "cost": 160,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MONGOLIAN_KESHIG",
   "CLASS_RANGED_CAVALRY"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": "RESOURCE_HORSES",
  "trait": "TRAIT_CIVILIZATION_UNIT_MONGOLIAN_KESHIG",
  "tech": "TECH_STIRRUPS",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_ADVANCED_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_GEORGIAN_KHEVSURETI",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 48,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 3,
  "cost": 160,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_GEORGIAN_KHEVSURETI"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   },
   {
    "id": "KHEVSURETI_HILLS_BUFF",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "7"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IS_HILLS",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_IRON",
  "trait": "TRAIT_CIVILIZATION_UNIT_GEORGIAN_KHEVSURETI",
  "tech": "TECH_MILITARY_TACTICS",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_REPLACEABLE_PARTS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_MAPUCHE_MALON_RAIDER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 55,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 4,
  "cost": 230,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MAPUCHE_MALON_RAIDER",
   "CLASS_LIGHT_CAVALRY"
  ],
  "abilities": [
   {
    "id": "MALON_RAIDER_TERRITORY_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_FRIENDLY_TERRITORY",
       "inverse": false,
       "args": {
        "MinRange": "0",
        "MaxRange": "4"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_MAPUCHE_MALON_RAIDER",
  "tech": "TECH_GUNPOWDER",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_CREE_OKIHTCITAW",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 20,
  "recon": true,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 0,
  "cost": 40,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RECON",
   "CLASS_CREE_OKIHTCITAW"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RECON",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_CREE_OKIHTCITAW",
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_SPEC_OPS",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 60,
  "recon": true,
  "rangedCombat": 65,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 3,
  "maintenance": 7,
  "cost": 520,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RECON",
   "CLASS_PARADROP",
   "CLASS_SNIPER"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RECON",
  "resource": null,
  "trait": null,
  "tech": "TECH_PLASTICS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_DRONE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 3,
  "cost": 420,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": true,
  "tags": [
   "CLASS_OBSERVATION",
   "CLASS_DRONE",
   "CLASS_SUPPORT"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SUPPORT",
  "resource": null,
  "trait": null,
  "tech": "TECH_COMPUTERS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_PIKE_AND_SHOT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 55,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 4,
  "cost": 250,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_ANTI_CAVALRY"
  ],
  "abilities": [
   {
    "id": "ANTI_CAVALRY_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_LIGHT_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_HEAVY_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_RANGED_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
  "resource": null,
  "trait": null,
  "tech": "TECH_METAL_CASTING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMBINED_ARMS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_SUPPLY_CONVOY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 2,
  "cost": 450,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": true,
  "tags": [
   "CLASS_MEDIC",
   "CLASS_LOGISTIC_MOVEMENT",
   "CLASS_SUPPORT"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_SUPPORT",
  "resource": null,
  "trait": null,
  "tech": "TECH_COMBUSTION",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_SKIRMISHER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 20,
  "recon": true,
  "rangedCombat": 30,
  "bombard": 0,
  "antiAir": 0,
  "range": 1,
  "moves": 3,
  "maintenance": 2,
  "cost": 150,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RECON",
   "CLASS_MOBILE_RANGED"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RECON",
  "resource": null,
  "trait": null,
  "tech": "TECH_MACHINERY",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_COURSER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 46,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 5,
  "maintenance": 3,
  "cost": 200,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_LIGHT_CAVALRY"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
  "resource": "RESOURCE_HORSES",
  "trait": null,
  "tech": "TECH_CASTLES",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_SYNTHETIC_MATERIALS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_CUIRASSIER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 64,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 5,
  "cost": 330,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CAVALRY"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": "RESOURCE_IRON",
  "trait": null,
  "tech": "TECH_BALLISTICS",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMBUSTION"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_GIANT_DEATH_ROBOT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 130,
  "recon": false,
  "rangedCombat": 120,
  "bombard": 0,
  "antiAir": 90,
  "range": 3,
  "moves": 5,
  "maintenance": 15,
  "cost": 1500,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_GIANT_DEATH_ROBOT"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_GIANT_DEATH_ROBOT",
  "resource": "RESOURCE_URANIUM",
  "trait": null,
  "tech": "TECH_ROBOTICS",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": true,
  "maintenanceResource": "RESOURCE_URANIUM",
  "maintenanceResourceAmount": 3,
  "resourceCost": 1
 },
 {
  "type": "UNIT_ROCK_BAND",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": true,
  "goldPurchase": false,
  "faithPurchase": true,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 300,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN",
   "CLASS_ROCK_BAND"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_RELIGIOUS",
  "promotionClass": "PROMOTION_CLASS_ROCK_BAND",
  "resource": null,
  "trait": null,
  "tech": null,
  "civic": "CIVIC_COLD_WAR",
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_CANADA_MOUNTIE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 62,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 5,
  "maintenance": 3,
  "cost": 290,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_LIGHT_CAVALRY",
   "CLASS_MOUNTIE"
  ],
  "abilities": [
   {
    "id": "ALL_PARK_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_PLOT_HAS_NATIONAL_PARK",
       "inverse": false,
       "args": {
        "SameOwner": "False",
        "MinDistance": "0",
        "MaxDistance": "2"
       }
      }
     ]
    }
   },
   {
    "id": "OWNER_PARK_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_PLOT_HAS_NATIONAL_PARK",
       "inverse": false,
       "args": {
        "SameOwner": "True",
        "MinDistance": "0",
        "MaxDistance": "2"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_CANADA_MOUNTIE",
  "tech": null,
  "civic": "CIVIC_CONSERVATION",
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 2,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_HUNGARY_BLACK_ARMY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 49,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 5,
  "maintenance": 3,
  "cost": 205,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_LIGHT_CAVALRY",
   "CLASS_BLACK_ARMY"
  ],
  "abilities": [
   {
    "id": "BLACK_ARMY_ADJACENT_LEVY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_ADJACENT_LEVIED_UNIT_COMBAT_BONUS",
    "args": {
     "Amount": "3"
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
  "resource": "RESOURCE_HORSES",
  "trait": "TRAIT_LEADER_UNIT_MATTHIAS_BLACK_ARMY",
  "tech": "TECH_CASTLES",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_SYNTHETIC_MATERIALS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_HUNGARY_HUSZAR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 65,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 5,
  "maintenance": 5,
  "cost": 335,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_LIGHT_CAVALRY",
   "CLASS_HUSZAR"
  ],
  "abilities": [
   {
    "id": "HUSZAR_ALLIES_COMBAT_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_NUMBER_ALLIES_UNIT_COMBAT_BONUS",
    "args": {
     "Amount": "3"
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
  "resource": "RESOURCE_HORSES",
  "trait": "TRAIT_CIVILIZATION_UNIT_HUNGARY_HUSZAR",
  "tech": "TECH_MILITARY_SCIENCE",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_INCA_WARAKAQ",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 20,
  "recon": true,
  "rangedCombat": 40,
  "bombard": 0,
  "antiAir": 0,
  "range": 1,
  "moves": 3,
  "maintenance": 2,
  "cost": 165,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RECON",
   "CLASS_RANGED",
   "CLASS_WARAKAQ"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RECON",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_INCA_WARAKAQ",
  "tech": "TECH_MACHINERY",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_MALI_MANDEKALU_CAVALRY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 55,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 4,
  "cost": 220,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CAVALRY",
   "CLASS_MANDEKALU"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": "RESOURCE_IRON",
  "trait": "TRAIT_CIVILIZATION_UNIT_MALI_MANDEKALU_CAVALRY",
  "tech": "TECH_STIRRUPS",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMPOSITES"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_MAORI_TOA",
  "foundCity": false,
  "buildCharges": 1,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 38,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 0,
  "cost": 120,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_TOA"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   },
   {
    "id": "TOA_NEGATIVE_COMBAT",
    "collection": "COLLECTION_ALL_UNITS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "TOA_NEGATIVE_COMBAT_MODIFIER"
    },
    "attach": {
     "id": "TOA_NEGATIVE_COMBAT_MODIFIER",
     "collection": "COLLECTION_UNIT_COMBAT",
     "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
     "args": {
      "Amount": "-5"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_OWNER_AT_WAR",
       "inverse": false,
       "args": {
        "MinDistance": "1",
        "MaxDistance": "1"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_MAORI_TOA",
  "tech": "TECH_CONSTRUCTION",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_REPLACEABLE_PARTS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 5
 },
 {
  "type": "UNIT_OTTOMAN_BARBARY_CORSAIR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 40,
  "recon": false,
  "rangedCombat": 50,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 4,
  "maintenance": 3,
  "cost": 240,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RAIDER",
   "CLASS_NAVAL_RANGED",
   "CLASS_STEALTH",
   "CLASS_REVEAL_STEALTH",
   "CLASS_CORSAIR"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_OTTOMAN_BARBARY_CORSAIR",
  "tech": null,
  "civic": "CIVIC_MEDIEVAL_FAIRES",
  "district": null,
  "obsolete": [
   "TECH_LASERS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_PHOENICIA_BIREME",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 35,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 1,
  "cost": 65,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_MELEE",
   "CLASS_BIREME"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_PHOENICIA_BIREME",
  "tech": "TECH_SAILING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_STEAM_POWER"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_SULEIMAN_JANISSARY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 60,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 4,
  "cost": 120,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_JANISSARY"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": "RESOURCE_NITER",
  "trait": "TRAIT_LEADER_UNIT_SULEIMAN_JANISSARY",
  "tech": "TECH_GUNPOWDER",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_ADVANCED_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_SWEDEN_CAROLEAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 55,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 3,
  "cost": 250,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_ANTI_CAVALRY",
   "CLASS_CAROLEAN"
  ],
  "abilities": [
   {
    "id": "ANTI_CAVALRY_COMBAT_BONUS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_LIGHT_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_HEAVY_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_RANGED_CAVALRY"
       }
      }
     ]
    }
   },
   {
    "id": "CAROLEAN_UNUSED_MOVEMENT_COMBAT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_PER_UNUSED_MOVEMENT_COMBAT_BONUS",
    "args": {
     "Amount": "3"
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_SWEDEN_CAROLEAN",
  "tech": "TECH_METAL_CASTING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMBINED_ARMS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_MAYAN_HULCHE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 15,
  "recon": false,
  "rangedCombat": 28,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 2,
  "maintenance": 1,
  "cost": 60,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MAYAN_HULCHE",
   "CLASS_RANGED"
  ],
  "abilities": [
   {
    "id": "HULCHE_BONUS_VS_WOUNDED_UNITS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_IS_WOUNDED",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_HULCHE",
  "tech": "TECH_ARCHERY",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_LAHORE_NIHANG",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": true,
  "goldPurchase": false,
  "faithPurchase": true,
  "combat": 25,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 2,
  "cost": 100,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_LAHORE_NIHANG",
   "CLASS_ALL_ERAS"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_NIHANG",
  "resource": null,
  "trait": "MINOR_CIV_LAHORE_NIHANG_TRAIT",
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_COMANDANTE_GENERAL",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": false,
  "faithPurchase": false,
  "combat": 0,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 0,
  "cost": 1,
  "domain": "DOMAIN_LAND",
  "civilian": true,
  "support": false,
  "tags": [
   "CLASS_LANDCIVILIAN",
   "CLASS_ALL_ERAS"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": null,
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_COMANDANTE_GENERAL",
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": false,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_COLOMBIAN_LLANERO",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 62,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 5,
  "maintenance": 2,
  "cost": 330,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_COLOMBIAN_LLANERO",
   "CLASS_LIGHT_CAVALRY"
  ],
  "abilities": [
   {
    "id": "LLANERO_ADJACENCY_STRENGTH",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_GRANT_STRENGTH_PER_ADJACENT_UNIT_TYPE",
    "args": {
     "Amount": "2",
     "UnitType": "UNIT_COLOMBIAN_LLANERO"
    },
    "ownerReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_FRIENDLY_UNIT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "UnitType": "UNIT_COLOMBIAN_LLANERO"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
  "resource": "RESOURCE_HORSES",
  "trait": "TRAIT_CIVILIZATION_LLANERO",
  "tech": "TECH_MILITARY_SCIENCE",
  "civic": null,
  "district": null,
  "obsolete": [],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 20
 },
 {
  "type": "UNIT_BYZANTINE_DROMON",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 20,
  "recon": false,
  "rangedCombat": 25,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 3,
  "maintenance": 2,
  "cost": 120,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAVAL_RANGED",
   "CLASS_DROMON"
  ],
  "abilities": [
   {
    "id": "DROMON_COMBAT_STRENGTH_AGAINST_UNITS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_IS_DISTRICT",
       "inverse": true,
       "args": {}
      }
     ]
    }
   }
  ],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_BYZANTINE_DROMON",
  "tech": "TECH_SHIPBUILDING",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_STEEL"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_BYZANTINE_TAGMA",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 50,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 4,
  "cost": 220,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_HEAVY_CAVALRY",
   "CLASS_TAGMA"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
  "resource": "RESOURCE_IRON",
  "trait": "TRAIT_LEADER_UNIT_BYZANTINE_TAGMA",
  "tech": null,
  "civic": "CIVIC_DIVINE_RIGHT",
  "district": null,
  "obsolete": [
   "TECH_COMPOSITES"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_GAUL_GAESATAE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 20,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 2,
  "maintenance": 0,
  "cost": 60,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_GAESATAE"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   },
   {
    "id": "GAESATAE_STRONG_AGAINST_STRONGER_UNITS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_IS_STRONGER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "GAESATAE_STRONG_AGAINST_DISTRICTS",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_IS_DISTRICT",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_GAUL_GAESATAE",
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_REPLACEABLE_PARTS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_VIETNAMESE_VOI_CHIEN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 35,
  "recon": false,
  "rangedCombat": 40,
  "bombard": 0,
  "antiAir": 0,
  "range": 2,
  "moves": 3,
  "maintenance": 3,
  "cost": 200,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_RANGED",
   "CLASS_VOI_CHIEN"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_RANGED",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_VIETNAMESE_VOI_CHIEN",
  "tech": "TECH_MACHINERY",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_ADVANCED_BALLISTICS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_ETHIOPIAN_OROMO_CAVALRY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 48,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 5,
  "maintenance": 3,
  "cost": 200,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_LIGHT_CAVALRY",
   "CLASS_ETHIOPIAN_OROMO_CAVALRY"
  ],
  "abilities": [],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
  "resource": "RESOURCE_HORSES",
  "trait": "TRAIT_CIVILIZATION_UNIT_ETHIOPIAN_OROMO_CAVALRY",
  "tech": "TECH_CASTLES",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_SYNTHETIC_MATERIALS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 10
 },
 {
  "type": "UNIT_BABYLONIAN_SABUM_KIBITTUM",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 17,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 3,
  "maintenance": 0,
  "cost": 35,
  "domain": "DOMAIN_LAND",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_MELEE",
   "CLASS_SABUM_KIBITTUM_ANTI_CAVALRY"
  ],
  "abilities": [
   {
    "id": "ANTI_SPEAR",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
       }
      }
     ]
    }
   },
   {
    "id": "SABUM_KIBITTUM_ANTI_CAVALRY",
    "collection": "COLLECTION_UNIT_COMBAT",
    "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
    "args": {
     "Amount": "17"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY"
       }
      },
      {
       "type": "REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY"
       }
      }
     ]
    }
   }
  ],
  "pseudo": null,
  "promotionClass": "PROMOTION_CLASS_MELEE",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_BABYLONIAN_SABUM_KIBITTUM",
  "tech": null,
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_GUNPOWDER"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 },
 {
  "type": "UNIT_PORTUGUESE_NAU",
  "foundCity": false,
  "buildCharges": 2,
  "mustPurchase": false,
  "goldPurchase": true,
  "faithPurchase": false,
  "combat": 55,
  "recon": false,
  "rangedCombat": 0,
  "bombard": 0,
  "antiAir": 0,
  "range": 0,
  "moves": 4,
  "maintenance": 2,
  "cost": 240,
  "domain": "DOMAIN_SEA",
  "civilian": false,
  "support": false,
  "tags": [
   "CLASS_NAU",
   "CLASS_NAVAL_MELEE"
  ],
  "abilities": [],
  "pseudo": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
  "promotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
  "resource": null,
  "trait": "TRAIT_CIVILIZATION_UNIT_PORTUGUESE_NAU",
  "tech": "TECH_CARTOGRAPHY",
  "civic": null,
  "district": null,
  "obsolete": [
   "TECH_COMBINED_ARMS"
  ],
  "buildings": [],
  "spy": false,
  "wmd": false,
  "religion": false,
  "religiousStrength": 0,
  "spreadCharges": 0,
  "healCharges": 0,
  "parkCharges": 0,
  "canTrain": true,
  "majorOnly": false,
  "maintenanceResource": null,
  "maintenanceResourceAmount": 0,
  "resourceCost": 0
 }
];

export const AI_PROJECTS: readonly AiProjectRow[] = [
 {
  "type": "PROJECT_REPAIR_OUTER_DEFENSES",
  "tech": null,
  "civic": null,
  "district": null,
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": true,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_LAUNCH_EARTH_SATELLITE",
  "tech": "TECH_ROCKETRY",
  "civic": null,
  "district": "DISTRICT_SPACEPORT",
  "maxPlayerInstances": 1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": true,
  "wmd": false,
  "unlocks": [
   "PROJECT_LAUNCH_MOON_LANDING"
  ],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": [
   {
    "id": "PROJECT_COMPLETION_EXPLORE_ENTIRE_MAP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_EXPLORE_ENTIRE_MAP",
    "args": {}
   }
  ]
 },
 {
  "type": "PROJECT_LAUNCH_MOON_LANDING",
  "tech": "TECH_SATELLITES",
  "civic": null,
  "district": "DISTRICT_SPACEPORT",
  "maxPlayerInstances": 1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [
   "PROJECT_LAUNCH_EARTH_SATELLITE"
  ],
  "outerDefenseRepair": false,
  "spaceRace": true,
  "wmd": false,
  "unlocks": [
   "PROJECT_LAUNCH_MARS_BASE"
  ],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": [
   {
    "id": "PROJECT_COMPLETION_GRANT_CULTURE_BASED_ON_SCIENCE_RATE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_YIELD_BASED_ON_CURRENT_YIELD_RATE",
    "args": {
     "YieldToGrant": "YIELD_CULTURE",
     "YieldToBaseOn": "YIELD_SCIENCE",
     "Multiplier": "10"
    }
   }
  ]
 },
 {
  "type": "PROJECT_MANHATTAN_PROJECT",
  "tech": "TECH_NUCLEAR_FISSION",
  "civic": null,
  "district": null,
  "maxPlayerInstances": 1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": true,
  "unlocks": [
   "PROJECT_BUILD_NUCLEAR_DEVICE",
   "PROJECT_OPERATION_IVY"
  ],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_OPERATION_IVY",
  "tech": "TECH_NUCLEAR_FUSION",
  "civic": null,
  "district": null,
  "maxPlayerInstances": 1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [
   "PROJECT_MANHATTAN_PROJECT"
  ],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": true,
  "unlocks": [
   "PROJECT_BUILD_THERMONUCLEAR_DEVICE"
  ],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_BUILD_NUCLEAR_DEVICE",
  "tech": "TECH_NUCLEAR_FISSION",
  "civic": null,
  "district": null,
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [
   "PROJECT_MANHATTAN_PROJECT"
  ],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": true,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": [
   {
    "id": "PROJECT_COMPLETION_MODIFIER_CREATE_NUCLEAR_DEVICE",
    "collection": "?",
    "effect": "?",
    "args": {
     "Type": "WMD_NUCLEAR_DEVICE",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "PROJECT_BUILD_THERMONUCLEAR_DEVICE",
  "tech": "TECH_NUCLEAR_FUSION",
  "civic": null,
  "district": null,
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [
   "PROJECT_OPERATION_IVY"
  ],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": true,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": [
   {
    "id": "PROJECT_COMPLETION_MODIFIER_CREATE_THERMONUCLEAR_DEVICE",
    "collection": "?",
    "effect": "?",
    "args": {
     "Type": "WMD_THERMONUCLEAR_DEVICE",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "PROJECT_CARNIVAL",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_STREET_CARNIVAL",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    5,
    800
   ],
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    5,
    800
   ],
   [
    "PSEUDOYIELD_GPP_WRITER",
    5,
    800
   ],
   [
    "PSEUDOYIELD_GPP_ARTIST",
    5,
    800
   ],
   [
    "PSEUDOYIELD_GPP_MUSICIAN",
    5,
    800
   ]
  ],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_ENHANCE_DISTRICT_ENCAMPMENT",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_ENCAMPMENT",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_GENERAL",
    10,
    800
   ]
  ],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_ENHANCE_DISTRICT_HARBOR",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_HARBOR",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ADMIRAL",
    10,
    800
   ]
  ],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_ENHANCE_DISTRICT_INDUSTRIAL_ZONE",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    10,
    800
   ]
  ],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_ENHANCE_DISTRICT_COMMERCIAL_HUB",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_COMMERCIAL_HUB",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    10,
    800
   ]
  ],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_ENHANCE_DISTRICT_HOLY_SITE",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_HOLY_SITE",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_PROPHET",
    10,
    800
   ]
  ],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_ENHANCE_DISTRICT_CAMPUS",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_CAMPUS",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    10,
    800
   ]
  ],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_ENHANCE_DISTRICT_THEATER",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_THEATER",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_WRITER",
    5,
    800
   ],
   [
    "PSEUDOYIELD_GPP_ARTIST",
    5,
    800
   ],
   [
    "PSEUDOYIELD_GPP_MUSICIAN",
    5,
    800
   ]
  ],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_WATER_CARNIVAL",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_WATER_STREET_CARNIVAL",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    5,
    800
   ],
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    5,
    800
   ],
   [
    "PSEUDOYIELD_GPP_WRITER",
    5,
    800
   ],
   [
    "PSEUDOYIELD_GPP_ARTIST",
    5,
    800
   ],
   [
    "PSEUDOYIELD_GPP_MUSICIAN",
    5,
    800
   ]
  ],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_BREAD_AND_CIRCUSES",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_ENTERTAINMENT_COMPLEX",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 1.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": [
   {
    "id": "PROJECT_COMPLETION_LOYALTY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_CITY_LOYALTY",
    "args": {
     "Amount": "20"
    }
   }
  ]
 },
 {
  "type": "PROJECT_WATER_BREAD_AND_CIRCUSES",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_WATER_ENTERTAINMENT_COMPLEX",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 1.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": [
   {
    "id": "PROJECT_COMPLETION_LOYALTY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_CITY_LOYALTY",
    "args": {
     "Amount": "20"
    }
   }
  ]
 },
 {
  "type": "PROJECT_COTHON_CAPITAL_MOVE",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_COTHON",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_CARBON_RECAPTURE",
  "tech": null,
  "civic": "CIVIC_GLOBAL_WARMING_MITIGATION",
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": [
   {
    "id": "PROJECT_COMPLETION_FAVOR_SEQUESTRATION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_PLAYER_FAVOR",
    "args": {
     "Amount": "30"
    }
   },
   {
    "id": "PROJECT_COMPLETION_CARBON_SEQUESTRATION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_PLAYER_SEQUESTERED_CARBON",
    "args": {
     "Amount": "50000"
    }
   }
  ]
 },
 {
  "type": "PROJECT_CONVERT_REACTOR_TO_COAL",
  "tech": "TECH_INDUSTRIALIZATION",
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": "BUILDING_COAL_POWER_PLANT",
  "consumes": [
   "BUILDING_FOSSIL_FUEL_POWER_PLANT",
   "BUILDING_POWER_PLANT"
  ],
  "modifiers": []
 },
 {
  "type": "PROJECT_CONVERT_REACTOR_TO_OIL",
  "tech": "TECH_ELECTRICITY",
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": "BUILDING_FOSSIL_FUEL_POWER_PLANT",
  "consumes": [
   "BUILDING_COAL_POWER_PLANT",
   "BUILDING_POWER_PLANT"
  ],
  "modifiers": []
 },
 {
  "type": "PROJECT_CONVERT_REACTOR_TO_URANIUM",
  "tech": "TECH_NUCLEAR_FISSION",
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": "BUILDING_POWER_PLANT",
  "consumes": [
   "BUILDING_COAL_POWER_PLANT",
   "BUILDING_FOSSIL_FUEL_POWER_PLANT"
  ],
  "modifiers": []
 },
 {
  "type": "PROJECT_LAUNCH_MARS_BASE",
  "tech": "TECH_NANOTECHNOLOGY",
  "civic": null,
  "district": "DISTRICT_SPACEPORT",
  "maxPlayerInstances": 1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [
   "PROJECT_LAUNCH_MOON_LANDING"
  ],
  "outerDefenseRepair": false,
  "spaceRace": true,
  "wmd": false,
  "unlocks": [
   "PROJECT_LAUNCH_EXOPLANET_EXPEDITION"
  ],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_LAUNCH_EXOPLANET_EXPEDITION",
  "tech": "TECH_SMART_MATERIALS",
  "civic": null,
  "district": "DISTRICT_SPACEPORT",
  "maxPlayerInstances": 1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [
   "PROJECT_LAUNCH_MARS_BASE"
  ],
  "outerDefenseRepair": false,
  "spaceRace": true,
  "wmd": false,
  "unlocks": [
   "PROJECT_ORBITAL_LASER",
   "PROJECT_TERRESTRIAL_LASER"
  ],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": [
   {
    "id": "PROJECT_COMPLETION_EXOPLANET_SCIENCE_VP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_SCIENCE_VICTORY_POINTS_PER_TURN",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "PROJECT_ORBITAL_LASER",
  "tech": "TECH_OFFWORLD_MISSION",
  "civic": null,
  "district": "DISTRICT_SPACEPORT",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [
   "PROJECT_LAUNCH_EXOPLANET_EXPEDITION"
  ],
  "outerDefenseRepair": false,
  "spaceRace": true,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": [
   {
    "id": "PROJECT_COMPLETION_ORBITAL_LASER_SCIENCE_VP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_SCIENCE_VICTORY_POINTS_PER_TURN",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "PROJECT_TERRESTRIAL_LASER",
  "tech": "TECH_OFFWORLD_MISSION",
  "civic": null,
  "district": "DISTRICT_SPACEPORT",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [
   "PROJECT_LAUNCH_EXOPLANET_EXPEDITION"
  ],
  "outerDefenseRepair": false,
  "spaceRace": true,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": [
   {
    "id": "PROJECT_COMPLETION_TERRESTRIAL_LASER_SCIENCE_VP",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_SCIENCE_VICTORY_POINTS_PER_TURN",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_IS_POWERED",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "PROJECT_COMPLETION_TERRESTRIAL_LASER_REQUIRED_POWER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_REQUIRED_POWER",
    "args": {
     "Amount": "5"
    }
   }
  ]
 },
 {
  "type": "PROJECT_SEND_AID",
  "tech": null,
  "civic": null,
  "district": null,
  "maxPlayerInstances": -1,
  "unlocksFromEffect": true,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": [
   {
    "id": "PROJECT_COMPLETION_SEND_AID_TO_AID_REQUESTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_PLAYER_SEND_GOLD_TO_EMERGENCIES_OF_TYPE",
    "args": {
     "Amount": "200",
     "EmergencyType": "EMERGENCY_SEND_AID"
    }
   },
   {
    "id": "PROJECT_COMPLETION_SEND_AID_TO_MILITARY_AID_REQUESTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_PLAYER_SEND_GOLD_TO_EMERGENCIES_OF_TYPE",
    "args": {
     "Amount": "200",
     "EmergencyType": "EMERGENCY_SEND_MILITARY_AID"
    }
   }
  ]
 },
 {
  "type": "PROJECT_TRAIN_ATHLETES",
  "tech": null,
  "civic": null,
  "district": null,
  "maxPlayerInstances": -1,
  "unlocksFromEffect": true,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_TRAIN_ASTRONAUTS",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_SPACEPORT",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": true,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_RECOMMISSION_REACTOR",
  "tech": "TECH_NUCLEAR_FISSION",
  "civic": null,
  "district": null,
  "maxPlayerInstances": -1,
  "unlocksFromEffect": false,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": [
   {
    "id": "PROJECT_COMPLETION_RECOMMISSION_REACTOR",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_CITY_RECOMMISSION_REACTOR",
    "args": {}
   }
  ]
 },
 {
  "type": "PROJECT_DECOMMISSION_COAL_POWER_PLANT",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": true,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [
   "BUILDING_COAL_POWER_PLANT"
  ],
  "modifiers": []
 },
 {
  "type": "PROJECT_DECOMMISSION_OIL_POWER_PLANT",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": true,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [
   "BUILDING_FOSSIL_FUEL_POWER_PLANT"
  ],
  "modifiers": []
 },
 {
  "type": "PROJECT_DECOMMISSION_NUCLEAR_POWER_PLANT",
  "tech": null,
  "civic": null,
  "district": "DISTRICT_INDUSTRIAL_ZONE",
  "maxPlayerInstances": -1,
  "unlocksFromEffect": true,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [
   "BUILDING_POWER_PLANT"
  ],
  "modifiers": []
 },
 {
  "type": "PROJECT_LIJIA_FAITH",
  "tech": null,
  "civic": null,
  "district": null,
  "maxPlayerInstances": -1,
  "unlocksFromEffect": true,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_LIJIA_FOOD",
  "tech": null,
  "civic": null,
  "district": null,
  "maxPlayerInstances": -1,
  "unlocksFromEffect": true,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 },
 {
  "type": "PROJECT_LIJIA_GOLD",
  "tech": null,
  "civic": null,
  "district": null,
  "maxPlayerInstances": -1,
  "unlocksFromEffect": true,
  "requiredBuilding": null,
  "prereqs": [],
  "outerDefenseRepair": false,
  "spaceRace": false,
  "wmd": false,
  "unlocks": [],
  "gpp": [],
  "identityPerCitizen": 0.0,
  "createBuilding": null,
  "consumes": [],
  "modifiers": []
 }
];

export const AI_RESOURCES: readonly AiResourceRow[] = [
 {
  "type": "RESOURCE_BANANAS",
  "class": "RESOURCECLASS_BONUS",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [
   [
    "YIELD_FOOD",
    20
   ]
  ],
  "harvestTechs": [
   "TECH_IRRIGATION"
  ],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_CATTLE",
  "class": "RESOURCECLASS_BONUS",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [
   [
    "YIELD_FOOD",
    20
   ]
  ],
  "harvestTechs": [
   "TECH_ANIMAL_HUSBANDRY"
  ],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_COPPER",
  "class": "RESOURCECLASS_BONUS",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [
   [
    "YIELD_GOLD",
    40
   ]
  ],
  "harvestTechs": [
   "TECH_MINING"
  ],
  "yields": [
   [
    "YIELD_GOLD",
    2
   ]
  ]
 },
 {
  "type": "RESOURCE_CRABS",
  "class": "RESOURCECLASS_BONUS",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [
   [
    "YIELD_GOLD",
    40
   ]
  ],
  "harvestTechs": [
   "TECH_CELESTIAL_NAVIGATION"
  ],
  "yields": [
   [
    "YIELD_GOLD",
    2
   ]
  ]
 },
 {
  "type": "RESOURCE_DEER",
  "class": "RESOURCECLASS_BONUS",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [
   [
    "YIELD_PRODUCTION",
    20
   ]
  ],
  "harvestTechs": [
   "TECH_ANIMAL_HUSBANDRY"
  ],
  "yields": [
   [
    "YIELD_PRODUCTION",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_FISH",
  "class": "RESOURCECLASS_BONUS",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [
   [
    "YIELD_FOOD",
    20
   ]
  ],
  "harvestTechs": [
   "TECH_CELESTIAL_NAVIGATION"
  ],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_RICE",
  "class": "RESOURCECLASS_BONUS",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [
   [
    "YIELD_FOOD",
    20
   ]
  ],
  "harvestTechs": [
   "TECH_POTTERY"
  ],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_SHEEP",
  "class": "RESOURCECLASS_BONUS",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [
   [
    "YIELD_FOOD",
    20
   ]
  ],
  "harvestTechs": [
   "TECH_ANIMAL_HUSBANDRY"
  ],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_STONE",
  "class": "RESOURCECLASS_BONUS",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [
   [
    "YIELD_PRODUCTION",
    20
   ]
  ],
  "harvestTechs": [
   "TECH_MASONRY"
  ],
  "yields": [
   [
    "YIELD_PRODUCTION",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_WHEAT",
  "class": "RESOURCECLASS_BONUS",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [
   [
    "YIELD_FOOD",
    20
   ]
  ],
  "harvestTechs": [
   "TECH_POTTERY"
  ],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_CITRUS",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FOOD",
    2
   ]
  ]
 },
 {
  "type": "RESOURCE_COCOA",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_GOLD",
    3
   ]
  ]
 },
 {
  "type": "RESOURCE_COFFEE",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_COTTON",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_GOLD",
    3
   ]
  ]
 },
 {
  "type": "RESOURCE_DIAMONDS",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_GOLD",
    3
   ]
  ]
 },
 {
  "type": "RESOURCE_DYES",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FAITH",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_FURS",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_GOLD",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_GYPSUM",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_GOLD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_INCENSE",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FAITH",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_IVORY",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_GOLD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_JADE",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_MARBLE",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_MERCURY",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_PEARLS",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FAITH",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_SALT",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_GOLD",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_SILK",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_SILVER",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_GOLD",
    3
   ]
  ]
 },
 {
  "type": "RESOURCE_SPICES",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FOOD",
    2
   ]
  ]
 },
 {
  "type": "RESOURCE_SUGAR",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FOOD",
    2
   ]
  ]
 },
 {
  "type": "RESOURCE_TEA",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_TOBACCO",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FAITH",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_TRUFFLES",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_GOLD",
    3
   ]
  ]
 },
 {
  "type": "RESOURCE_WHALES",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    1
   ],
   [
    "YIELD_GOLD",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_WINE",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_GOLD",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_JEANS",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": []
 },
 {
  "type": "RESOURCE_PERFUME",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 6,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": []
 },
 {
  "type": "RESOURCE_COSMETICS",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": []
 },
 {
  "type": "RESOURCE_TOYS",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": []
 },
 {
  "type": "RESOURCE_CINNAMON",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 6,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": []
 },
 {
  "type": "RESOURCE_CLOVES",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 6,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": []
 },
 {
  "type": "RESOURCE_ALUMINUM",
  "class": "RESOURCECLASS_STRATEGIC",
  "happiness": 0,
  "peakEra": null,
  "units": [
   "UNIT_FIGHTER",
   "UNIT_AMERICAN_P51",
   "UNIT_BOMBER",
   "UNIT_HELICOPTER",
   "UNIT_JET_FIGHTER",
   "UNIT_JET_BOMBER"
  ],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_COAL",
  "class": "RESOURCECLASS_STRATEGIC",
  "happiness": 0,
  "peakEra": null,
  "units": [
   "UNIT_IRONCLAD",
   "UNIT_BATTLESHIP",
   "UNIT_BRAZILIAN_MINAS_GERAES"
  ],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    2
   ]
  ]
 },
 {
  "type": "RESOURCE_HORSES",
  "class": "RESOURCECLASS_STRATEGIC",
  "happiness": 0,
  "peakEra": null,
  "units": [
   "UNIT_HORSEMAN",
   "UNIT_CAVALRY",
   "UNIT_RUSSIAN_COSSACK",
   "UNIT_MACEDONIAN_HETAIROI",
   "UNIT_MONGOLIAN_KESHIG",
   "UNIT_COURSER",
   "UNIT_HUNGARY_BLACK_ARMY",
   "UNIT_HUNGARY_HUSZAR",
   "UNIT_COLOMBIAN_LLANERO",
   "UNIT_ETHIOPIAN_OROMO_CAVALRY"
  ],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_IRON",
  "class": "RESOURCECLASS_STRATEGIC",
  "happiness": 0,
  "peakEra": null,
  "units": [
   "UNIT_SWORDSMAN",
   "UNIT_ROMAN_LEGION",
   "UNIT_KONGO_SHIELD_BEARER",
   "UNIT_JAPANESE_SAMURAI",
   "UNIT_NORWEGIAN_BERSERKER",
   "UNIT_KNIGHT",
   "UNIT_ARABIAN_MAMLUK",
   "UNIT_MAN_AT_ARMS",
   "UNIT_POLISH_HUSSAR",
   "UNIT_MACEDONIAN_HYPASPIST",
   "UNIT_PERSIAN_IMMORTAL",
   "UNIT_GEORGIAN_KHEVSURETI",
   "UNIT_CUIRASSIER",
   "UNIT_MALI_MANDEKALU_CAVALRY",
   "UNIT_BYZANTINE_TAGMA"
  ],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_NITER",
  "class": "RESOURCECLASS_STRATEGIC",
  "happiness": 0,
  "peakEra": null,
  "units": [
   "UNIT_MUSKETMAN",
   "UNIT_SPANISH_CONQUISTADOR",
   "UNIT_BOMBARD",
   "UNIT_FRIGATE",
   "UNIT_ENGLISH_REDCOAT",
   "UNIT_FRENCH_GARDE_IMPERIALE",
   "UNIT_LINE_INFANTRY",
   "UNIT_DE_ZEVEN_PROVINCIEN",
   "UNIT_SULEIMAN_JANISSARY"
  ],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_OIL",
  "class": "RESOURCECLASS_STRATEGIC",
  "happiness": 0,
  "peakEra": null,
  "units": [
   "UNIT_BIPLANE",
   "UNIT_INFANTRY",
   "UNIT_ARTILLERY",
   "UNIT_SUBMARINE",
   "UNIT_TANK",
   "UNIT_DESTROYER",
   "UNIT_MECHANIZED_INFANTRY",
   "UNIT_ROCKET_ARTILLERY",
   "UNIT_MISSILE_CRUISER",
   "UNIT_MODERN_ARMOR"
  ],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    3
   ]
  ]
 },
 {
  "type": "RESOURCE_URANIUM",
  "class": "RESOURCECLASS_STRATEGIC",
  "happiness": 0,
  "peakEra": null,
  "units": [
   "UNIT_GIANT_DEATH_ROBOT"
  ],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    2
   ]
  ]
 },
 {
  "type": "RESOURCE_ANTIQUITY_SITE",
  "class": "RESOURCECLASS_ARTIFACT",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": []
 },
 {
  "type": "RESOURCE_SHIPWRECK",
  "class": "RESOURCECLASS_ARTIFACT",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": []
 },
 {
  "type": "RESOURCE_AMBER",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_OLIVES",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_GOLD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_TURTLES",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    1
   ]
  ]
 },
 {
  "type": "RESOURCE_MAIZE",
  "class": "RESOURCECLASS_BONUS",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [
   [
    "YIELD_GOLD",
    40
   ]
  ],
  "harvestTechs": [
   "TECH_POTTERY"
  ],
  "yields": [
   [
    "YIELD_GOLD",
    2
   ]
  ]
 },
 {
  "type": "RESOURCE_HONEY",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "harvestTechs": [],
  "yields": [
   [
    "YIELD_FOOD",
    2
   ]
  ]
 }
];

export const AI_IMPROVEMENTS: readonly AiImprovementRow[] = [
 {
  "type": "IMPROVEMENT_BARBARIAN_CAMP",
  "tech": null,
  "civic": null,
  "trait": "TRAIT_BARBARIAN",
  "buildable": false,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_FOREST",
   "FEATURE_JUNGLE",
   "FEATURE_MARSH",
   "FEATURE_VOLCANIC_SOIL",
   "FEATURE_FLOODPLAINS",
   "FEATURE_FLOODPLAINS_GRASSLAND",
   "FEATURE_FLOODPLAINS_PLAINS"
  ],
  "buildUnits": [],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_FARM",
  "tech": null,
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [
   "RESOURCE_RICE",
   "RESOURCE_WHEAT",
   "RESOURCE_MAIZE"
  ],
  "keepsFeature": [
   "RESOURCE_RICE"
  ],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    0
   ]
  ],
  "housing": 1,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_FLOODPLAINS",
   "FEATURE_FLOODPLAINS_GRASSLAND",
   "FEATURE_FLOODPLAINS_PLAINS",
   "FEATURE_VOLCANIC_SOIL"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FOOD",
   "YIELD_FOOD",
   "YIELD_FOOD",
   "YIELD_PRODUCTION"
  ],
  "tourism": [],
  "modifiers": [
   {
    "id": "FARM_HOUSING_WITH_MAYAB_TRAIT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "CivilizationType": "CIVILIZATION_MAYA"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_MINE",
  "tech": "TECH_MINING",
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [
   "RESOURCE_COPPER",
   "RESOURCE_DIAMONDS",
   "RESOURCE_JADE",
   "RESOURCE_MERCURY",
   "RESOURCE_SALT",
   "RESOURCE_SILVER",
   "RESOURCE_ALUMINUM",
   "RESOURCE_COAL",
   "RESOURCE_IRON",
   "RESOURCE_NITER",
   "RESOURCE_URANIUM",
   "RESOURCE_AMBER"
  ],
  "keepsFeature": [
   "RESOURCE_DIAMONDS",
   "RESOURCE_ALUMINUM",
   "RESOURCE_COAL",
   "RESOURCE_NITER",
   "RESOURCE_URANIUM",
   "RESOURCE_AMBER"
  ],
  "yields": [
   [
    "YIELD_PRODUCTION",
    1
   ],
   [
    "YIELD_SCIENCE",
    0
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_VOLCANIC_SOIL"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_SCIENCE"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    0
   ]
  ],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_QUARRY",
  "tech": "TECH_MINING",
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [
   "RESOURCE_GYPSUM",
   "RESOURCE_MARBLE",
   "RESOURCE_STONE"
  ],
  "keepsFeature": [
   "RESOURCE_GYPSUM",
   "RESOURCE_MARBLE",
   "RESOURCE_STONE"
  ],
  "yields": [
   [
    "YIELD_GOLD",
    0
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_FISHING_BOATS",
  "tech": "TECH_SAILING",
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [
   "RESOURCE_CRABS",
   "RESOURCE_FISH",
   "RESOURCE_PEARLS",
   "RESOURCE_WHALES",
   "RESOURCE_AMBER",
   "RESOURCE_TURTLES"
  ],
  "keepsFeature": [
   "RESOURCE_FISH",
   "RESOURCE_TURTLES"
  ],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_GOLD",
    0
   ],
   [
    "YIELD_PRODUCTION",
    0
   ]
  ],
  "housing": 1,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_PRODUCTION"
  ],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_PASTURE",
  "tech": "TECH_ANIMAL_HUSBANDRY",
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [
   "RESOURCE_CATTLE",
   "RESOURCE_SHEEP",
   "RESOURCE_HORSES"
  ],
  "keepsFeature": [
   "RESOURCE_CATTLE",
   "RESOURCE_SHEEP",
   "RESOURCE_HORSES"
  ],
  "yields": [
   [
    "YIELD_FOOD",
    0
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "housing": 1,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_PRODUCTION"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": [
   {
    "id": "TEMPLE_ARTEMIS_PASTURE_AMENITY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_BUILDING_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_TEMPLE_ARTEMIS",
        "MinRange": "0",
        "MaxRange": "4"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_PLANTATION",
  "tech": "TECH_IRRIGATION",
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [
   "RESOURCE_BANANAS",
   "RESOURCE_CITRUS",
   "RESOURCE_COCOA",
   "RESOURCE_COFFEE",
   "RESOURCE_COTTON",
   "RESOURCE_DYES",
   "RESOURCE_INCENSE",
   "RESOURCE_SILK",
   "RESOURCE_SPICES",
   "RESOURCE_SUGAR",
   "RESOURCE_TEA",
   "RESOURCE_TOBACCO",
   "RESOURCE_WINE",
   "RESOURCE_OLIVES"
  ],
  "keepsFeature": [
   "RESOURCE_BANANAS",
   "RESOURCE_CITRUS",
   "RESOURCE_COCOA",
   "RESOURCE_COFFEE",
   "RESOURCE_COTTON",
   "RESOURCE_DYES",
   "RESOURCE_INCENSE",
   "RESOURCE_SILK",
   "RESOURCE_SPICES",
   "RESOURCE_SUGAR",
   "RESOURCE_TEA",
   "RESOURCE_TOBACCO",
   "RESOURCE_WINE",
   "RESOURCE_OLIVES"
  ],
  "yields": [
   [
    "YIELD_FOOD",
    0
   ],
   [
    "YIELD_GOLD",
    2
   ],
   [
    "YIELD_PRODUCTION",
    0
   ]
  ],
  "housing": 1,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_PRODUCTION",
   "YIELD_PRODUCTION"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": [
   {
    "id": "TEMPLE_ARTEMIS_PLANTATION_AMENITY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_BUILDING_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_TEMPLE_ARTEMIS",
        "MinRange": "0",
        "MaxRange": "4"
       }
      }
     ]
    }
   },
   {
    "id": "PLANTATION_NEGATIVE_LOYALTY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
    "args": {
     "Amount": "-2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_LEADER_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "LeaderType": "LEADER_ABRAHAM_LINCOLN"
       }
      }
     ]
    }
   },
   {
    "id": "PLANTATION_NEGATIVE_LOYALTY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
    "args": {
     "Amount": "-2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_LEADER_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "LeaderType": "LEADER_ABRAHAM_LINCOLN"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_CAMP",
  "tech": "TECH_ANIMAL_HUSBANDRY",
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [
   "RESOURCE_DEER",
   "RESOURCE_FURS",
   "RESOURCE_IVORY",
   "RESOURCE_TRUFFLES",
   "RESOURCE_HONEY"
  ],
  "keepsFeature": [
   "RESOURCE_DEER",
   "RESOURCE_FURS",
   "RESOURCE_IVORY",
   "RESOURCE_TRUFFLES",
   "RESOURCE_HONEY"
  ],
  "yields": [
   [
    "YIELD_GOLD",
    2
   ],
   [
    "YIELD_FOOD",
    0
   ],
   [
    "YIELD_PRODUCTION",
    0
   ]
  ],
  "housing": 1,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": [
   {
    "id": "TEMPLE_ARTEMIS_CAMP_AMENITY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_BUILDING_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_TEMPLE_ARTEMIS",
        "MinRange": "0",
        "MaxRange": "4"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_LUMBER_MILL",
  "tech": "TECH_CONSTRUCTION",
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    2
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_FOREST",
   "FEATURE_JUNGLE"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_GOODY_HUT",
  "tech": null,
  "civic": null,
  "trait": null,
  "buildable": false,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_FOREST",
   "FEATURE_JUNGLE",
   "FEATURE_MARSH",
   "FEATURE_FLOODPLAINS",
   "FEATURE_FLOODPLAINS_GRASSLAND",
   "FEATURE_FLOODPLAINS_PLAINS"
  ],
  "buildUnits": [],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_OIL_WELL",
  "tech": "TECH_REFINING",
  "civic": null,
  "trait": null,
  "buildable": false,
  "resources": [
   "RESOURCE_OIL"
  ],
  "keepsFeature": [
   "RESOURCE_OIL"
  ],
  "yields": [
   [
    "YIELD_PRODUCTION",
    2
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_OFFSHORE_OIL_RIG",
  "tech": "TECH_PLASTICS",
  "civic": null,
  "trait": null,
  "buildable": false,
  "resources": [
   "RESOURCE_OIL"
  ],
  "keepsFeature": [
   "RESOURCE_OIL"
  ],
  "yields": [
   [
    "YIELD_PRODUCTION",
    2
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_FORT",
  "tech": "TECH_SIEGE_TACTICS",
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 4,
  "grantFortification": 2,
  "features": [
   "FEATURE_VOLCANIC_SOIL"
  ],
  "buildUnits": [
   [
    "UNIT_MILITARY_ENGINEER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_AIRSTRIP",
  "tech": "TECH_FLIGHT",
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_VOLCANIC_SOIL"
  ],
  "buildUnits": [
   [
    "UNIT_MILITARY_ENGINEER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_BEACH_RESORT",
  "tech": "TECH_RADIO",
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": "YIELD_GOLD",
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_VOLCANIC_SOIL"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [
   [
    "TOURISMSOURCE_APPEAL",
    100
   ]
  ],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_MISSILE_SILO",
  "tech": "TECH_ROCKETRY",
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_VOLCANIC_SOIL"
  ],
  "buildUnits": [
   [
    "UNIT_MILITARY_ENGINEER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_CHATEAU",
  "tech": null,
  "civic": "CIVIC_HUMANISM",
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_CHATEAU",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ],
   [
    "YIELD_GOLD",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_FLOODPLAINS",
   "FEATURE_FLOODPLAINS_GRASSLAND",
   "FEATURE_FLOODPLAINS_PLAINS"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_CULTURE",
   "YIELD_CULTURE",
   "YIELD_GOLD"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_COLOSSAL_HEAD",
  "tech": null,
  "civic": null,
  "trait": "MINOR_CIV_LA_VENTA_TRAIT",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_FAITH",
    2
   ],
   [
    "YIELD_CULTURE",
    0
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_VOLCANIC_SOIL"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FAITH",
   "YIELD_FAITH",
   "YIELD_FAITH",
   "YIELD_FAITH"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_FAITH",
    100
   ]
  ],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_GREAT_WALL",
  "tech": "TECH_MASONRY",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_GREAT_WALL",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_GOLD",
    2
   ],
   [
    "YIELD_CULTURE",
    0
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 4,
  "grantFortification": 2,
  "features": [
   "FEATURE_VOLCANIC_SOIL"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_GOLD",
   "YIELD_CULTURE"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_KURGAN",
  "tech": "TECH_ANIMAL_HUSBANDRY",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_KURGAN",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_GOLD",
    3
   ],
   [
    "YIELD_FAITH",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FAITH",
   "YIELD_FAITH"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_FAITH",
    100
   ]
  ],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_MISSION",
  "tech": "TECH_EDUCATION",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_MISSION",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_FAITH",
    2
   ],
   [
    "YIELD_SCIENCE",
    0
   ],
   [
    "YIELD_FOOD",
    0
   ],
   [
    "YIELD_PRODUCTION",
    0
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_SCIENCE",
   "YIELD_SCIENCE"
  ],
  "tourism": [],
  "modifiers": [
   {
    "id": "MISSION_NEWCONTINENT_FAITH",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IS_OWNER_CAPITAL_CONTINENT",
       "inverse": true,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "MISSION_NEWCONTINENT_PRODUCTION",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IS_OWNER_CAPITAL_CONTINENT",
       "inverse": true,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "MISSION_NEWCONTINENT_FOOD",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IS_OWNER_CAPITAL_CONTINENT",
       "inverse": true,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_ROMAN_FORT",
  "tech": null,
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 4,
  "grantFortification": 2,
  "features": [
   "FEATURE_VOLCANIC_SOIL"
  ],
  "buildUnits": [
   [
    "UNIT_ROMAN_LEGION",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_SPHINX",
  "tech": null,
  "civic": "CIVIC_CRAFTSMANSHIP",
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_SPHINX",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ],
   [
    "YIELD_FAITH",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_FLOODPLAINS",
   "FEATURE_FLOODPLAINS_GRASSLAND",
   "FEATURE_FLOODPLAINS_PLAINS"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": [
   {
    "id": "SPHINX_WONDERADJACENCY_FAITH",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_WONDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "SPHINX_FLOODPLAINS_CULTURE",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TAG_MATCHES",
       "inverse": false,
       "args": {
        "Tag": "CLASS_FLOODPLAINS"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_STEPWELL",
  "tech": "TECH_IRRIGATION",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_STEPWELL",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_FAITH",
    0
   ]
  ],
  "housing": 2,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": [
   {
    "id": "STEPWELL_FARMADJACENCY_FOOD",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_IMPROVEMENT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "ImprovementType": "IMPROVEMENT_FARM"
       }
      }
     ]
    }
   },
   {
    "id": "STEPWELL_HOLYSITEADJACENCY_FAITH",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_HOLY_SITE"
       }
      }
     ]
    }
   },
   {
    "id": "STEPWELL_HOUSING_WITHTECH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_TECHNOLOGY",
       "inverse": false,
       "args": {
        "TechnologyType": "TECH_SANITATION"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_ZIGGURAT",
  "tech": null,
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_ZIGGURAT",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_CULTURE",
    0
   ],
   [
    "YIELD_SCIENCE",
    2
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_FLOODPLAINS",
   "FEATURE_FLOODPLAINS_GRASSLAND",
   "FEATURE_FLOODPLAINS_PLAINS"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": [
   {
    "id": "ZIGGURAT_RIVERADJACENCY_CULTURE",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_RIVER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_KAMPUNG",
  "tech": "TECH_SHIPBUILDING",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_KAMPUNG",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_FOOD",
    0
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "housing": 2,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FOOD"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_FOOD",
    100
   ]
  ],
  "modifiers": [
   {
    "id": "KAMPUNG_HOUSING_WITHTECH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_TECHNOLOGY",
       "inverse": false,
       "args": {
        "TechnologyType": "TECH_MASS_PRODUCTION"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_ALCAZAR",
  "tech": null,
  "civic": null,
  "trait": "MINOR_CIV_GRANADA_TRAIT",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": "YIELD_SCIENCE",
  "appealPct": 50,
  "defenseModifier": 4,
  "grantFortification": 2,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_MONASTERY",
  "tech": null,
  "civic": null,
  "trait": "MINOR_CIV_ARMAGH_TRAIT",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_FAITH",
    2
   ]
  ],
  "housing": 2,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FAITH"
  ],
  "tourism": [],
  "modifiers": [
   {
    "id": "MONASTERY_HOUSING",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_CIVIC",
       "inverse": false,
       "args": {
        "CivicType": "CIVIC_COLONIALISM"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_PYRAMID",
  "tech": "TECH_MASONRY",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_PYRAMID",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_FAITH",
    2
   ],
   [
    "YIELD_FOOD",
    2
   ],
   [
    "YIELD_SCIENCE",
    0
   ],
   [
    "YIELD_CULTURE",
    0
   ],
   [
    "YIELD_PRODUCTION",
    0
   ],
   [
    "YIELD_GOLD",
    0
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_FLOODPLAINS"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FOOD",
   "YIELD_SCIENCE",
   "YIELD_GOLD",
   "YIELD_GOLD",
   "YIELD_FAITH",
   "YIELD_PRODUCTION",
   "YIELD_CULTURE"
  ],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_PAIRIDAEZA",
  "tech": null,
  "civic": "CIVIC_EARLY_EMPIRE",
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_PAIRIDAEZA",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ],
   [
    "YIELD_GOLD",
    2
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_GOLD",
   "YIELD_GOLD",
   "YIELD_CULTURE",
   "YIELD_CULTURE"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_OUTBACK_STATION",
  "tech": null,
  "civic": "CIVIC_GUILDS",
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_OUTBACK_STATION",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    1
   ],
   [
    "YIELD_FOOD",
    1
   ]
  ],
  "housing": 1,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FOOD",
   "YIELD_PRODUCTION",
   "YIELD_FOOD"
  ],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_CHEMAMULL",
  "tech": null,
  "civic": "CIVIC_CRAFTSMANSHIP",
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_CHEMAMULL",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": "YIELD_CULTURE",
  "appealPct": 75,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_GOLF_COURSE",
  "tech": null,
  "civic": "CIVIC_REFORMED_CHURCH",
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_GOLF_COURSE",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_CULTURE",
    0
   ],
   [
    "YIELD_GOLD",
    2
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_CULTURE",
   "YIELD_CULTURE"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": [
   {
    "id": "GOLFCOURSE_AMENITY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_AMENITY",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "GOLFCOURSE_HOUSING_WITHGLOBLIZATION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_CIVIC",
       "inverse": false,
       "args": {
        "CivicType": "CIVIC_GLOBALIZATION"
       }
      }
     ]
    }
   },
   {
    "id": "GOLFCOURSE_AMENITIES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_AMENITY",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_MEKEWAP",
  "tech": "TECH_POTTERY",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_MEKEWAP",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    1
   ],
   [
    "YIELD_FOOD",
    0
   ],
   [
    "YIELD_GOLD",
    0
   ]
  ],
  "housing": 2,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FOOD",
   "YIELD_FOOD",
   "YIELD_GOLD"
  ],
  "tourism": [],
  "modifiers": [
   {
    "id": "MEKEWAP_HOUSING_WITHCIVILSERVICE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_CIVIC",
       "inverse": false,
       "args": {
        "CivicType": "CIVIC_CIVIL_SERVICE"
       }
      }
     ]
    }
   },
   {
    "id": "MEKEWAP_LUXURY_GOLD",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_RESOURCE_CLASS_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "ResourceClassType": "RESOURCECLASS_LUXURY"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_POLDER",
  "tech": null,
  "civic": "CIVIC_GUILDS",
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_POLDER",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_GOLD",
    0
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "housing": 1,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FOOD",
   "YIELD_FOOD",
   "YIELD_PRODUCTION"
  ],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_FISHERY",
  "tech": "TECH_SAILING",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_NO_PLAYER",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    0
   ]
  ],
  "housing": 1,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FOOD"
  ],
  "tourism": [],
  "modifiers": [
   {
    "id": "FISHERY_GOVERNOR_PRODUCTION",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_SPECIFIC_GOVERNOR_PROMOTION_TYPE",
       "inverse": false,
       "args": {
        "GovernorPromotionType": "GOVERNOR_PROMOTION_AQUACULTURE"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_CITY_PARK",
  "tech": null,
  "civic": "CIVIC_GAMES_RECREATION",
  "trait": "TRAIT_CIVILIZATION_NO_PLAYER",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": [
   {
    "id": "CITY_PARK_GOVERNOR_CULTURE",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "3"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_SPECIFIC_GOVERNOR_PROMOTION_TYPE",
       "inverse": false,
       "args": {
        "GovernorPromotionType": "GOVERNOR_PROMOTION_PARKS_RECREATION"
       }
      }
     ]
    }
   },
   {
    "id": "CITY_PARK_WATER_AMENITY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_COAST",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_LAKE",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_RIVER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_GEOTHERMAL_PLANT",
  "tech": "TECH_SYNTHETIC_MATERIALS",
  "civic": null,
  "trait": null,
  "buildable": false,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    2
   ],
   [
    "YIELD_SCIENCE",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_GEOTHERMAL_FISSURE"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": [
   {
    "id": "GEOTHERMAL_GENERATE_POWER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "4",
     "SourceType": "FREE_POWER_SOURCE_GEOTHERMAL"
    }
   },
   {
    "id": "MERCHANT_RENEWABLE_ENERGY_GEOTHERMAL_GENERATE_POWER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "2",
     "SourceType": "FREE_POWER_SOURCE_GEOTHERMAL"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_SPECIFIC_GOVERNOR_PROMOTION_TYPE",
       "inverse": false,
       "args": {
        "Established": "true",
        "GovernorPromotionType": "GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_SOLAR_FARM",
  "tech": "TECH_SATELLITES",
  "civic": null,
  "trait": null,
  "buildable": false,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_GOLD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": [
   {
    "id": "SOLAR_FARM_GENERATE_POWER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "2",
     "SourceType": "FREE_POWER_SOURCE_SOLAR"
    }
   },
   {
    "id": "MERCHANT_RENEWABLE_ENERGY_SOLAR_FARM_GENERATE_POWER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "2",
     "SourceType": "FREE_POWER_SOURCE_SOLAR"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_SPECIFIC_GOVERNOR_PROMOTION_TYPE",
       "inverse": false,
       "args": {
        "Established": "true",
        "GovernorPromotionType": "GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_WIND_FARM",
  "tech": "TECH_COMPOSITES",
  "civic": null,
  "trait": null,
  "buildable": false,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_GOLD",
    2
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": [
   {
    "id": "WIND_FARM_GENERATE_POWER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "2",
     "SourceType": "FREE_POWER_SOURCE_WIND"
    }
   },
   {
    "id": "MERCHANT_RENEWABLE_ENERGY_WIND_FARM_GENERATE_POWER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "2",
     "SourceType": "FREE_POWER_SOURCE_WIND"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_SPECIFIC_GOVERNOR_PROMOTION_TYPE",
       "inverse": false,
       "args": {
        "Established": "true",
        "GovernorPromotionType": "GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_OFFSHORE_WIND_FARM",
  "tech": "TECH_PREDICTIVE_SYSTEMS",
  "civic": null,
  "trait": null,
  "buildable": false,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_PRODUCTION",
    2
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": [
   {
    "id": "OFFSHORE_WIND_FARM_GENERATE_POWER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "2",
     "SourceType": "FREE_POWER_SOURCE_WIND"
    }
   },
   {
    "id": "MERCHANT_RENEWABLE_ENERGY_OFFSHORE_WIND_FARM_GENERATE_POWER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "2",
     "SourceType": "FREE_POWER_SOURCE_WIND"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_SPECIFIC_GOVERNOR_PROMOTION_TYPE",
       "inverse": false,
       "args": {
        "Established": "true",
        "GovernorPromotionType": "GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_SEASTEAD",
  "tech": "TECH_SEASTEADS",
  "civic": null,
  "trait": null,
  "buildable": false,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_CULTURE",
    0
   ],
   [
    "YIELD_FOOD",
    2
   ],
   [
    "YIELD_PRODUCTION",
    0
   ]
  ],
  "housing": 4,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_PRODUCTION",
   "YIELD_CULTURE"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_MOAI",
  "tech": null,
  "civic": null,
  "trait": "MINOR_CIV_RAPA_NUI_TRAIT",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_VOLCANIC_SOIL"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_CULTURE",
   "YIELD_CULTURE"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": [
   {
    "id": "MOAI_COASTADJACENCY_CULTURE",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IS_COAST",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_COAST",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "MOAI_VOLCANICADJACENCY_CULTURE",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_VOLCANIC_SOIL"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "FeatureType": "FEATURE_VOLCANIC_SOIL"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_MOUND",
  "tech": null,
  "civic": null,
  "trait": "MINOR_CIV_CAHOKIA_TRAIT",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_FOOD",
    0
   ],
   [
    "YIELD_GOLD",
    3
   ]
  ],
  "housing": 2,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_FLOODPLAINS",
   "FEATURE_FLOODPLAINS_GRASSLAND",
   "FEATURE_FLOODPLAINS_PLAINS"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FOOD",
   "YIELD_FOOD"
  ],
  "tourism": [],
  "modifiers": [
   {
    "id": "MOUND_AMENITY_MAX_ONE",
    "collection": "COLLECTION_OWNER_CITY",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_CIVIC",
       "inverse": true,
       "args": {
        "CivicType": "CIVIC_NATURAL_HISTORY"
       }
      }
     ]
    }
   },
   {
    "id": "MOUND_AMENITY_MAX_TWO",
    "collection": "COLLECTION_OWNER_CITY",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_CIVIC",
       "inverse": false,
       "args": {
        "CivicType": "CIVIC_NATURAL_HISTORY"
       }
      }
     ]
    }
   },
   {
    "id": "MOUND_HOUSING",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_CIVIC",
       "inverse": false,
       "args": {
        "CivicType": "CIVIC_CULTURAL_HERITAGE"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_NAZCA_LINE",
  "tech": null,
  "civic": null,
  "trait": "MINOR_CIV_NAZCA_TRAIT",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": [
   {
    "id": "NAZCA_LINE_ADJACENCY_FAITH",
    "collection": "COLLECTION_PLAYER_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_OWNER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "NAZCA_LINE_ADJACENCY_FAITH_RESOURCE",
    "collection": "COLLECTION_PLAYER_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_OWNER",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLOT_HAS_ANY_RESOURCE",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "NAZCA_LINE_ADJACENCY_FOOD_DESERT_CIVIL_SERVICE",
    "collection": "COLLECTION_PLAYER_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_OWNER",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLAYER_HAS_CIVIC",
       "inverse": false,
       "args": {
        "CivicType": "CIVIC_CIVIL_SERVICE"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_DESERT_HILLS"
       }
      }
     ]
    }
   },
   {
    "id": "NAZCA_LINE_ADJACENCY_FOOD_DESERT_HILLS_CIVIL_SERVICE",
    "collection": "COLLECTION_PLAYER_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_OWNER",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLAYER_HAS_CIVIC",
       "inverse": false,
       "args": {
        "CivicType": "CIVIC_CIVIL_SERVICE"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_DESERT"
       }
      }
     ]
    }
   },
   {
    "id": "NAZCA_LINE_ADJACENCY_PRODUCTION_FLAT_MASS_PRODUCTION",
    "collection": "COLLECTION_PLAYER_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_OWNER",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLAYER_HAS_TECHNOLOGY",
       "inverse": false,
       "args": {
        "TechnologyType": "TECH_MASS_PRODUCTION"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_IS_HILLS",
       "inverse": true,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_SKI_RESORT",
  "tech": null,
  "civic": "CIVIC_PROFESSIONAL_SPORTS",
  "trait": null,
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [
   [
    "TOURISMSOURCE_APPEAL",
    100
   ]
  ],
  "modifiers": [
   {
    "id": "SKI_RESORT_AMENITY",
    "collection": "COLLECTION_OWNER_CITY",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_AMENITY",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_MOUNTAIN_TUNNEL",
  "tech": "TECH_CHEMISTRY",
  "civic": null,
  "trait": null,
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_MILITARY_ENGINEER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": [
   {
    "id": "MOUNTAIN_PORTAL",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_MOUNTAIN_PORTAL",
    "args": {}
   }
  ]
 },
 {
  "type": "IMPROVEMENT_OPEN_AIR_MUSEUM",
  "tech": null,
  "civic": "CIVIC_NATIONALISM",
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_OPEN_AIR_MUSEUM",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": [
   {
    "id": "OPEN_AIR_MUSEUM_LOYALTY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
    "args": {
     "Amount": "2"
    }
   },
   {
    "id": "OPEN_AIR_MUSEUM_CULTURE_FOR_TERRAIN_CLASS_CITIES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_TERRAIN_CLASS_CITIES_IMPROVEMENT",
    "args": {
     "Amount": "2",
     "YieldType": "YIELD_CULTURE",
     "ImprovementType": "IMPROVEMENT_OPEN_AIR_MUSEUM"
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_ICE_HOCKEY_RINK",
  "tech": null,
  "civic": "CIVIC_COLONIALISM",
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_ICE_HOCKEY_RINK",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_CULTURE",
    0
   ],
   [
    "YIELD_FOOD",
    0
   ],
   [
    "YIELD_PRODUCTION",
    0
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_CULTURE",
   "YIELD_CULTURE",
   "YIELD_CULTURE",
   "YIELD_CULTURE"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": [
   {
    "id": "ICEHOCKEYRINK_CULTURE_STADIUM",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "4"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_BUILDING_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STADIUM"
       }
      }
     ]
    }
   },
   {
    "id": "ICEHOCKEYRINK_AMENITY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IMPROVEMENT_AMENITY",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_TERRACE_FARM",
  "tech": null,
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_TERRACE_FARM",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    0
   ]
  ],
  "housing": 2,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_VOLCANIC_SOIL"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FOOD",
   "YIELD_FOOD",
   "YIELD_FOOD",
   "YIELD_FOOD",
   "YIELD_FOOD",
   "YIELD_FOOD",
   "YIELD_FOOD",
   "YIELD_PRODUCTION"
  ],
  "tourism": [],
  "modifiers": [
   {
    "id": "TERRACE_FARM_PRODUCTION_FRESH_WATER_NO_AQUEDUCT",
    "collection": "COLLECTION_SINGLE_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IS_FRESH_WATER",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_DISTRICT_TYPE_MATCHES",
       "inverse": true,
       "args": {
        "DistrictType": "DISTRICT_AQUEDUCT",
        "MustBeFunctioning": "false"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "IMPROVEMENT_MAORI_PA",
  "tech": null,
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_MAORI_PA",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 4,
  "grantFortification": 2,
  "features": [],
  "buildUnits": [
   [
    "UNIT_MAORI_TOA",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_MOUNTAIN_ROAD",
  "tech": null,
  "civic": "CIVIC_FOREIGN_TRADE",
  "trait": "TRAIT_LEADER_PACHACUTI_IMPROVEMENT_MOUNTAIN_ROAD",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": [
   {
    "id": "MOUNTAIN_PORTAL",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_MOUNTAIN_PORTAL",
    "args": {}
   }
  ]
 },
 {
  "type": "IMPROVEMENT_BATEY",
  "tech": null,
  "civic": null,
  "trait": "MINOR_CIV_CAGUANA_TRAIT",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_CULTURE",
   "YIELD_CULTURE",
   "YIELD_CULTURE",
   "YIELD_CULTURE"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_CULTURE",
    100
   ]
  ],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_HACIENDA",
  "tech": null,
  "civic": "CIVIC_MERCANTILISM",
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_HACIENDA",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_FOOD",
    0
   ],
   [
    "YIELD_GOLD",
    2
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "housing": 1,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FOOD",
   "YIELD_FOOD",
   "YIELD_PRODUCTION",
   "YIELD_PRODUCTION"
  ],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_METEOR_GOODY",
  "tech": null,
  "civic": null,
  "trait": null,
  "buildable": false,
  "resources": [],
  "keepsFeature": [],
  "yields": [],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_FOREST",
   "FEATURE_JUNGLE",
   "FEATURE_MARSH"
  ],
  "buildUnits": [],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_ROCK_HEWN_CHURCH",
  "tech": null,
  "civic": "CIVIC_DRAMA_POETRY",
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_ROCK_HEWN_CHURCH",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_FAITH",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [
   "FEATURE_VOLCANIC_SOIL"
  ],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_FAITH",
   "YIELD_FAITH",
   "YIELD_FAITH",
   "YIELD_FAITH",
   "YIELD_FAITH",
   "YIELD_FAITH",
   "YIELD_FAITH",
   "YIELD_FAITH",
   "YIELD_FAITH",
   "YIELD_FAITH"
  ],
  "tourism": [
   [
    "TOURISMSOURCE_FAITH",
    100
   ]
  ],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_MAHAVIHARA",
  "tech": null,
  "civic": null,
  "trait": "MINOR_CIV_NALANDA_TRAIT",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_SCIENCE",
    2
   ],
   [
    "YIELD_FAITH",
    0
   ]
  ],
  "housing": 2,
  "tilesRequired": 2,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_SCIENCE",
   "YIELD_SCIENCE",
   "YIELD_FAITH",
   "YIELD_FAITH"
  ],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_TRADING_DOME",
  "tech": null,
  "civic": null,
  "trait": "MINOR_CIV_SAMARKAND_TRAIT",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_GOLD",
    2
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_BUILDER",
    true
   ]
  ],
  "adjacency": [
   "YIELD_GOLD"
  ],
  "tourism": [],
  "modifiers": []
 },
 {
  "type": "IMPROVEMENT_FEITORIA",
  "tech": null,
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_IMPROVEMENT_FEITORIA",
  "buildable": true,
  "resources": [],
  "keepsFeature": [],
  "yields": [
   [
    "YIELD_GOLD",
    4
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "housing": 0,
  "tilesRequired": 1,
  "appealYield": null,
  "appealPct": 100,
  "defenseModifier": 0,
  "grantFortification": 0,
  "features": [],
  "buildUnits": [
   [
    "UNIT_PORTUGUESE_NAU",
    true
   ]
  ],
  "adjacency": [],
  "tourism": [],
  "modifiers": []
 }
];

export const AI_DISTRICTS: readonly AiDistrictRow[] = [
 {
  "type": "DISTRICT_CITY_CENTER",
  "tech": null,
  "civic": null,
  "trait": null,
  "maintenance": 0,
  "housing": 0,
  "appeal": 0,
  "hitPoints": 200,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": false,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_HOLY_SITE",
  "tech": "TECH_ASTROLOGY",
  "civic": null,
  "trait": null,
  "maintenance": 1,
  "housing": 0,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_PROPHET",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_ENHANCE_DISTRICT_HOLY_SITE"
  ],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_CAMPUS",
  "tech": "TECH_WRITING",
  "civic": null,
  "trait": null,
  "maintenance": 1,
  "housing": 0,
  "appeal": 0,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_ENHANCE_DISTRICT_CAMPUS"
  ],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_ENCAMPMENT",
  "tech": "TECH_BRONZE_WORKING",
  "civic": null,
  "trait": null,
  "maintenance": 1,
  "housing": 0,
  "appeal": -1,
  "hitPoints": 100,
  "domain": "DOMAIN_LAND",
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_GENERAL",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_ENHANCE_DISTRICT_ENCAMPMENT"
  ],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_HARBOR",
  "tech": "TECH_CELESTIAL_NAVIGATION",
  "civic": null,
  "trait": null,
  "maintenance": 0,
  "housing": 0,
  "appeal": 0,
  "hitPoints": null,
  "domain": "DOMAIN_SEA",
  "coast": true,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ADMIRAL",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_ENHANCE_DISTRICT_HARBOR"
  ],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_AERODROME",
  "tech": "TECH_FLIGHT",
  "civic": null,
  "trait": null,
  "maintenance": 1,
  "housing": 0,
  "appeal": -1,
  "hitPoints": null,
  "domain": "DOMAIN_AIR",
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_COMMERCIAL_HUB",
  "tech": "TECH_CURRENCY",
  "civic": null,
  "trait": null,
  "maintenance": 0,
  "housing": 0,
  "appeal": 0,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_ENHANCE_DISTRICT_COMMERCIAL_HUB"
  ],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_ENTERTAINMENT_COMPLEX",
  "tech": null,
  "civic": "CIVIC_GAMES_RECREATION",
  "trait": null,
  "maintenance": 1,
  "housing": 0,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_BREAD_AND_CIRCUSES"
  ],
  "regionalRange": 6,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_THEATER",
  "tech": null,
  "civic": "CIVIC_DRAMA_POETRY",
  "trait": null,
  "maintenance": 1,
  "housing": 0,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_WRITER",
    1
   ],
   [
    "PSEUDOYIELD_GPP_ARTIST",
    1
   ],
   [
    "PSEUDOYIELD_GPP_MUSICIAN",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_ENHANCE_DISTRICT_THEATER"
  ],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_INDUSTRIAL_ZONE",
  "tech": "TECH_APPRENTICESHIP",
  "civic": null,
  "trait": null,
  "maintenance": 1,
  "housing": 0,
  "appeal": -1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_ENHANCE_DISTRICT_INDUSTRIAL_ZONE",
   "PROJECT_CARBON_RECAPTURE",
   "PROJECT_CONVERT_REACTOR_TO_COAL",
   "PROJECT_CONVERT_REACTOR_TO_OIL",
   "PROJECT_CONVERT_REACTOR_TO_URANIUM",
   "PROJECT_DECOMMISSION_COAL_POWER_PLANT",
   "PROJECT_DECOMMISSION_OIL_POWER_PLANT",
   "PROJECT_DECOMMISSION_NUCLEAR_POWER_PLANT"
  ],
  "regionalRange": 6,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_NEIGHBORHOOD",
  "tech": null,
  "civic": "CIVIC_URBANIZATION",
  "trait": null,
  "maintenance": 0,
  "housing": 4,
  "appeal": 0,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": false,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": [
   [
    4,
    2
   ],
   [
    2,
    1
   ],
   [
    -1,
    0
   ],
   [
    -3,
    -1
   ],
   [
    -100,
    -2
   ]
  ]
 },
 {
  "type": "DISTRICT_AQUEDUCT",
  "tech": "TECH_ENGINEERING",
  "civic": null,
  "trait": null,
  "maintenance": 0,
  "housing": 0,
  "appeal": 0,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": true,
  "internalOnly": false,
  "requiresPopulation": false,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_SPACEPORT",
  "tech": "TECH_ROCKETRY",
  "civic": null,
  "trait": null,
  "maintenance": 0,
  "housing": 0,
  "appeal": -1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": false,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_LAUNCH_EARTH_SATELLITE",
   "PROJECT_LAUNCH_MOON_LANDING",
   "PROJECT_LAUNCH_MARS_BASE",
   "PROJECT_LAUNCH_EXOPLANET_EXPEDITION",
   "PROJECT_ORBITAL_LASER",
   "PROJECT_TERRESTRIAL_LASER",
   "PROJECT_TRAIN_ASTRONAUTS"
  ],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_WONDER",
  "tech": null,
  "civic": null,
  "trait": null,
  "maintenance": 0,
  "housing": 0,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": true,
  "requiresPopulation": false,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_ACROPOLIS",
  "tech": null,
  "civic": "CIVIC_DRAMA_POETRY",
  "trait": "TRAIT_CIVILIZATION_DISTRICT_ACROPOLIS",
  "maintenance": 1,
  "housing": 0,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_WRITER",
    1
   ],
   [
    "PSEUDOYIELD_GPP_ARTIST",
    1
   ],
   [
    "PSEUDOYIELD_GPP_MUSICIAN",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_BATH",
  "tech": "TECH_ENGINEERING",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_DISTRICT_BATH",
  "maintenance": 0,
  "housing": 2,
  "appeal": 0,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": true,
  "internalOnly": false,
  "requiresPopulation": false,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_HANSA",
  "tech": "TECH_APPRENTICESHIP",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_DISTRICT_HANSA",
  "maintenance": 1,
  "housing": 0,
  "appeal": -1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_LAVRA",
  "tech": "TECH_ASTROLOGY",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_DISTRICT_LAVRA",
  "maintenance": 1,
  "housing": 0,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_PROPHET",
    2
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_MBANZA",
  "tech": null,
  "civic": "CIVIC_GUILDS",
  "trait": "TRAIT_CIVILIZATION_MBANZA",
  "maintenance": 0,
  "housing": 5,
  "appeal": 0,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": false,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_STREET_CARNIVAL",
  "tech": null,
  "civic": "CIVIC_GAMES_RECREATION",
  "trait": "TRAIT_CIVILIZATION_STREET_CARNIVAL",
  "maintenance": 1,
  "housing": 0,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_CARNIVAL"
  ],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_ROYAL_NAVY_DOCKYARD",
  "tech": "TECH_CELESTIAL_NAVIGATION",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_ROYAL_NAVY_DOCKYARD",
  "maintenance": 0,
  "housing": 0,
  "appeal": 0,
  "hitPoints": null,
  "domain": "DOMAIN_SEA",
  "coast": true,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ADMIRAL",
    2
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_IKANDA",
  "tech": "TECH_BRONZE_WORKING",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_DISTRICT_IKANDA",
  "maintenance": 1,
  "housing": 1,
  "appeal": -1,
  "hitPoints": 100,
  "domain": "DOMAIN_LAND",
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_GENERAL",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_SEOWON",
  "tech": "TECH_WRITING",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_DISTRICT_SEOWON",
  "maintenance": 1,
  "housing": 0,
  "appeal": 0,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_GOVERNMENT",
  "tech": null,
  "civic": "CIVIC_STATE_WORKFORCE",
  "trait": null,
  "maintenance": 1,
  "housing": 0,
  "appeal": 0,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_WATER_ENTERTAINMENT_COMPLEX",
  "tech": null,
  "civic": "CIVIC_NATURAL_HISTORY",
  "trait": null,
  "maintenance": 1,
  "housing": 0,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": true,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_WATER_BREAD_AND_CIRCUSES"
  ],
  "regionalRange": 9,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_WATER_STREET_CARNIVAL",
  "tech": null,
  "civic": "CIVIC_NATURAL_HISTORY",
  "trait": "TRAIT_CIVILIZATION_STREET_CARNIVAL",
  "maintenance": 1,
  "housing": 0,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": true,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_WATER_CARNIVAL"
  ],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_CANAL",
  "tech": "TECH_STEAM_POWER",
  "civic": null,
  "trait": null,
  "maintenance": 0,
  "housing": 0,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": false,
  "gpp": [],
  "canal": true,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_DAM",
  "tech": "TECH_BUTTRESS",
  "civic": null,
  "trait": null,
  "maintenance": 0,
  "housing": 3,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": false,
  "gpp": [],
  "canal": false,
  "preventsFloods": true,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_COTHON",
  "tech": "TECH_CELESTIAL_NAVIGATION",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_DISTRICT_COTHON",
  "maintenance": 0,
  "housing": 0,
  "appeal": 0,
  "hitPoints": null,
  "domain": "DOMAIN_SEA",
  "coast": true,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ADMIRAL",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [
   "PROJECT_COTHON_CAPITAL_MOVE"
  ],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_SUGUBA",
  "tech": "TECH_CURRENCY",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_DISTRICT_SUGUBA",
  "maintenance": 0,
  "housing": 0,
  "appeal": 0,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_MERCHANT",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_OBSERVATORY",
  "tech": "TECH_WRITING",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_DISTRICT_OBSERVATORY",
  "maintenance": 1,
  "housing": 0,
  "appeal": 0,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_SCIENTIST",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_HIPPODROME",
  "tech": null,
  "civic": "CIVIC_GAMES_RECREATION",
  "trait": "TRAIT_CIVILIZATION_DISTRICT_HIPPODROME",
  "maintenance": 1,
  "housing": 0,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_OPPIDUM",
  "tech": "TECH_IRON_WORKING",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_DISTRICT_OPPIDUM",
  "maintenance": 1,
  "housing": 0,
  "appeal": -1,
  "hitPoints": 100,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [
   [
    "PSEUDOYIELD_GPP_ENGINEER",
    1
   ]
  ],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_THANH",
  "tech": "TECH_BRONZE_WORKING",
  "civic": null,
  "trait": "TRAIT_CIVILIZATION_DISTRICT_THANH",
  "maintenance": 1,
  "housing": 0,
  "appeal": -1,
  "hitPoints": 100,
  "domain": "DOMAIN_LAND",
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": false,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 },
 {
  "type": "DISTRICT_PRESERVE",
  "tech": null,
  "civic": "CIVIC_MYSTICISM",
  "trait": null,
  "maintenance": 0,
  "housing": 1,
  "appeal": 1,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": [
   [
    4,
    2
   ],
   [
    2,
    1
   ],
   [
    -1,
    0
   ],
   [
    -3,
    -1
   ],
   [
    -100,
    -1
   ]
  ]
 },
 {
  "type": "DISTRICT_DIPLOMATIC_QUARTER",
  "tech": "TECH_MATHEMATICS",
  "civic": null,
  "trait": null,
  "maintenance": 1,
  "housing": 0,
  "appeal": 0,
  "hitPoints": null,
  "domain": null,
  "coast": false,
  "aqueduct": false,
  "internalOnly": false,
  "requiresPopulation": true,
  "gpp": [],
  "canal": false,
  "preventsFloods": false,
  "projects": [],
  "regionalRange": 0,
  "appealHousing": []
 }
];

export const AI_FEATURES: readonly AiFeatureRow[] = [
 {
  "type": "FEATURE_FLOODPLAINS",
  "removable": false,
  "removeTech": null,
  "appeal": -1,
  "danger": 0,
  "yields": [
   [
    "YIELD_FOOD",
    2
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_ICE",
  "removable": false,
  "removeTech": null,
  "appeal": 0,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_JUNGLE",
  "removable": true,
  "removeTech": "TECH_BRONZE_WORKING",
  "appeal": -1,
  "danger": 0,
  "yields": [
   [
    "YIELD_FOOD",
    1
   ]
  ],
  "removes": [
   [
    "YIELD_PRODUCTION",
    10
   ],
   [
    "YIELD_FOOD",
    10
   ]
  ]
 },
 {
  "type": "FEATURE_FOREST",
  "removable": true,
  "removeTech": "TECH_MINING",
  "appeal": 1,
  "danger": 0,
  "yields": [
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "removes": [
   [
    "YIELD_PRODUCTION",
    20
   ]
  ]
 },
 {
  "type": "FEATURE_OASIS",
  "removable": false,
  "removeTech": null,
  "appeal": 1,
  "danger": 0,
  "yields": [
   [
    "YIELD_FOOD",
    3
   ],
   [
    "YIELD_GOLD",
    1
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_MARSH",
  "removable": true,
  "removeTech": "TECH_IRRIGATION",
  "appeal": -1,
  "danger": 0,
  "yields": [
   [
    "YIELD_FOOD",
    1
   ]
  ],
  "removes": [
   [
    "YIELD_FOOD",
    20
   ]
  ]
 },
 {
  "type": "FEATURE_BARRIER_REEF",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [
   [
    "YIELD_FOOD",
    3
   ],
   [
    "YIELD_SCIENCE",
    2
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_CLIFFS_DOVER",
  "removable": false,
  "removeTech": null,
  "appeal": 4,
  "danger": 0,
  "yields": [
   [
    "YIELD_CULTURE",
    3
   ],
   [
    "YIELD_GOLD",
    3
   ],
   [
    "YIELD_FOOD",
    2
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_CRATER_LAKE",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [
   [
    "YIELD_FAITH",
    5
   ],
   [
    "YIELD_SCIENCE",
    1
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_DEAD_SEA",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ],
   [
    "YIELD_FAITH",
    2
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_EVEREST",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_GALAPAGOS",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_KILIMANJARO",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_PANTANAL",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ],
   [
    "YIELD_FOOD",
    2
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_PIOPIOTAHI",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_TORRES_DEL_PAINE",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_TSINGY",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_YOSEMITE",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_HA_LONG_BAY",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [
   [
    "YIELD_FOOD",
    3
   ],
   [
    "YIELD_CULTURE",
    1
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_EYJAFJALLAJOKULL",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_LYSEFJORDEN",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_GIANTS_CAUSEWAY",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_ULURU",
  "removable": false,
  "removeTech": null,
  "appeal": 4,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_DELICATE_ARCH",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_EYE_OF_THE_SAHARA",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [
   [
    "YIELD_PRODUCTION",
    2
   ],
   [
    "YIELD_SCIENCE",
    1
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_LAKE_RETBA",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [
   [
    "YIELD_CULTURE",
    2
   ],
   [
    "YIELD_GOLD",
    2
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_MATTERHORN",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_RORAIMA",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_UBSUNUR_HOLLOW",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [
   [
    "YIELD_FAITH",
    2
   ],
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_ZHANGYE_DANXIA",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_REEF",
  "removable": false,
  "removeTech": null,
  "appeal": 0,
  "danger": 0,
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_FLOODPLAINS_GRASSLAND",
  "removable": false,
  "removeTech": null,
  "appeal": -1,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_FLOODPLAINS_PLAINS",
  "removable": false,
  "removeTech": null,
  "appeal": -1,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_GEOTHERMAL_FISSURE",
  "removable": false,
  "removeTech": null,
  "appeal": 0,
  "danger": 0,
  "yields": [
   [
    "YIELD_SCIENCE",
    1
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_VOLCANO",
  "removable": false,
  "removeTech": null,
  "appeal": 0,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_VOLCANIC_SOIL",
  "removable": false,
  "removeTech": null,
  "appeal": 0,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_CHOCOLATEHILLS",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [
   [
    "YIELD_FOOD",
    1
   ],
   [
    "YIELD_PRODUCTION",
    2
   ],
   [
    "YIELD_SCIENCE",
    1
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_DEVILSTOWER",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_GOBUSTAN",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [
   [
    "YIELD_CULTURE",
    3
   ],
   [
    "YIELD_PRODUCTION",
    1
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_IKKIL",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_PAMUKKALE",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_VESUVIUS",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_WHITEDESERT",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [
   [
    "YIELD_CULTURE",
    1
   ],
   [
    "YIELD_GOLD",
    4
   ],
   [
    "YIELD_SCIENCE",
    1
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_BERMUDA_TRIANGLE",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 10,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_FOUNTAIN_OF_YOUTH",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [
   [
    "YIELD_SCIENCE",
    4
   ],
   [
    "YIELD_FAITH",
    4
   ]
  ],
  "removes": []
 },
 {
  "type": "FEATURE_PAITITI",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_BURNING_FOREST",
  "removable": false,
  "removeTech": null,
  "appeal": -1,
  "danger": 80,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_BURNT_FOREST",
  "removable": false,
  "removeTech": null,
  "appeal": -1,
  "danger": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_BURNING_JUNGLE",
  "removable": false,
  "removeTech": null,
  "appeal": -1,
  "danger": 80,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_BURNT_JUNGLE",
  "removable": false,
  "removeTech": null,
  "appeal": -1,
  "danger": 0,
  "yields": [],
  "removes": []
 }
];

/** the promotion class lists by leader trait (AiFavoredItems of the
 *  AiLists of System UnitPromotionClasses): class -> Value */
export const AI_PROMOTION_CLASS_LISTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
 "MINOR_CIV_DEFAULT_TRAIT": {
  "PROMOTION_CLASS_RECON": -100,
  "PROMOTION_CLASS_NAVAL_CARRIER": -100
 },
 "TRAIT_LEADER_GENGHIS_KHAN_ABILITY": {
  "PROMOTION_CLASS_HEAVY_CAVALRY": 100,
  "PROMOTION_CLASS_LIGHT_CAVALRY": 100
 },
 "TRAIT_LEADER_KANDAKE_OF_MEROE": {
  "PROMOTION_CLASS_RANGED": 1
 },
 "TRAIT_LEADER_KILLER_OF_CYRUS": {
  "PROMOTION_CLASS_LIGHT_CAVALRY": 1
 },
 "TRAIT_LEADER_QIN": {
  "PROMOTION_CLASS_MELEE": 1
 },
 "TRAIT_LEADER_SATYAGRAHA": {
  "PROMOTION_CLASS_INQUISITOR": -1
 },
 "TRAIT_LEADER_SULEIMAN_ALT": {
  "PROMOTION_CLASS_SIEGE": 1
 },
 "TRAIT_LEADER_SULEIMAN_GOVERNOR": {
  "PROMOTION_CLASS_SIEGE": 1
 }
};

/** the district lists by leader trait (AiFavoredItems of the AiLists of
 *  System Districts): district -> +1 favored, -1 not */
export const AI_DISTRICT_LISTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
 "MINOR_CIV_CULTURAL_TRAIT": {
  "DISTRICT_THEATER": 1
 },
 "MINOR_CIV_DEFAULT_TRAIT": {
  "DISTRICT_HOLY_SITE": -1,
  "DISTRICT_CAMPUS": -1,
  "DISTRICT_ENCAMPMENT": -1,
  "DISTRICT_AERODROME": -1,
  "DISTRICT_COMMERCIAL_HUB": -1,
  "DISTRICT_ENTERTAINMENT_COMPLEX": -1,
  "DISTRICT_THEATER": -1,
  "DISTRICT_INDUSTRIAL_ZONE": -1,
  "DISTRICT_AQUEDUCT": -1,
  "DISTRICT_SPACEPORT": -1,
  "DISTRICT_GOVERNMENT": -1,
  "DISTRICT_WATER_ENTERTAINMENT_COMPLEX": -1,
  "DISTRICT_CANAL": -1,
  "DISTRICT_DAM": -1,
  "DISTRICT_DIPLOMATIC_QUARTER": -1,
  "DISTRICT_PRESERVE": -1
 },
 "MINOR_CIV_INDUSTRIAL_TRAIT": {
  "DISTRICT_INDUSTRIAL_ZONE": 1
 },
 "MINOR_CIV_MILITARISTIC_TRAIT": {
  "DISTRICT_ENCAMPMENT": 1
 },
 "MINOR_CIV_RELIGIOUS_TRAIT": {
  "DISTRICT_HOLY_SITE": 1
 },
 "MINOR_CIV_SCIENTIFIC_TRAIT": {
  "DISTRICT_CAMPUS": 1
 },
 "MINOR_CIV_TRADE_TRAIT": {
  "DISTRICT_COMMERCIAL_HUB": 1
 },
 "TRAIT_CIVILIZATION_SCOTTISH_ENLIGHTENMENT": {
  "DISTRICT_CAMPUS": 1,
  "DISTRICT_INDUSTRIAL_ZONE": 1
 },
 "TRAIT_LEADER_ELEANOR_LOYALTY": {
  "DISTRICT_THEATER": 1
 },
 "TRAIT_LEADER_MEDITERRANEAN": {
  "DISTRICT_DAM": -1
 }
};
