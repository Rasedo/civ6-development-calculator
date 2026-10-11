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
       "inverse": false,
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
  "mustPurchase": false,
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
  "mustPurchase": false,
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
  "mustPurchase": false,
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
  "mustPurchase": false,
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
  "mustPurchase": false,
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
  "mustPurchase": false,
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
  "mustPurchase": false,
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
  "yields": []
 },
 {
  "type": "RESOURCE_PERFUME",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 6,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "yields": []
 },
 {
  "type": "RESOURCE_COSMETICS",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "yields": []
 },
 {
  "type": "RESOURCE_TOYS",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "yields": []
 },
 {
  "type": "RESOURCE_CINNAMON",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 6,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "yields": []
 },
 {
  "type": "RESOURCE_CLOVES",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 6,
  "peakEra": null,
  "units": [],
  "harvests": [],
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
  "yields": []
 },
 {
  "type": "RESOURCE_SHIPWRECK",
  "class": "RESOURCECLASS_ARTIFACT",
  "happiness": 0,
  "peakEra": null,
  "units": [],
  "harvests": [],
  "yields": []
 },
 {
  "type": "RESOURCE_AMBER",
  "class": "RESOURCECLASS_LUXURY",
  "happiness": 4,
  "peakEra": null,
  "units": [],
  "harvests": [],
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
  "adjacency": []
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
  ]
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
  "adjacency": []
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
  ]
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  ]
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
  ]
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
  ]
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
  ]
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  ]
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
  ]
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
  ]
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
  "adjacency": []
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
  ]
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  ]
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  "adjacency": []
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
  ]
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
  ]
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
  "adjacency": []
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
  ]
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
  ]
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
  ]
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
  "adjacency": []
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
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_JUNGLE",
  "removable": true,
  "removeTech": "TECH_BRONZE_WORKING",
  "appeal": -1,
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
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_GALAPAGOS",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_KILIMANJARO",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_PANTANAL",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
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
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_TORRES_DEL_PAINE",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_TSINGY",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_YOSEMITE",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_HA_LONG_BAY",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
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
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_LYSEFJORDEN",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_GIANTS_CAUSEWAY",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_ULURU",
  "removable": false,
  "removeTech": null,
  "appeal": 4,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_DELICATE_ARCH",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_EYE_OF_THE_SAHARA",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
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
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_RORAIMA",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_UBSUNUR_HOLLOW",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
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
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_REEF",
  "removable": false,
  "removeTech": null,
  "appeal": 0,
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
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_FLOODPLAINS_PLAINS",
  "removable": false,
  "removeTech": null,
  "appeal": -1,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_GEOTHERMAL_FISSURE",
  "removable": false,
  "removeTech": null,
  "appeal": 0,
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
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_VOLCANIC_SOIL",
  "removable": false,
  "removeTech": null,
  "appeal": 0,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_CHOCOLATEHILLS",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
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
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_GOBUSTAN",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
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
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_PAMUKKALE",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_VESUVIUS",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_WHITEDESERT",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
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
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_FOUNTAIN_OF_YOUTH",
  "removable": false,
  "removeTech": null,
  "appeal": 2,
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
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_BURNING_FOREST",
  "removable": false,
  "removeTech": null,
  "appeal": -1,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_BURNT_FOREST",
  "removable": false,
  "removeTech": null,
  "appeal": -1,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_BURNING_JUNGLE",
  "removable": false,
  "removeTech": null,
  "appeal": -1,
  "yields": [],
  "removes": []
 },
 {
  "type": "FEATURE_BURNT_JUNGLE",
  "removable": false,
  "removeTech": null,
  "appeal": -1,
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

/** THE UNIT EFFICIENCIES (UnitProduction's m_efficiencies, GlobalAI
 *  +0x3c8): row the opposing unit, column the unit valued, AI_UNITS'
 *  order, raw 24.8 — the table the game computes once a game (0x79a440)
 *  and logs as AI_UnitEfficiency.csv, the same in every recording, read
 *  at its printed 0.01 */
export const AI_UNIT_EFFICIENCY: readonly (readonly number[])[] = [
 [256,256,256,256,256,256,256,3,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,3,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,3,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,3,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,3,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,3,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,3,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,256,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,2778,1211,1347,1211,1244,563,563,369,732,812,648,25600,648,369,346,545,256,292,461,25600,545,328,138,136,115,256,115,225,177,25600,177,79,61,79,100,72,102,92,46,46,28,31,23,25600,23,28,61,25600,8,20,26,18,10,15,15,20,13,3,3,5,21140,10,36,13,13,8,13,10,21140,3,5,10,13,8,177,36,210,648,72,143,38,594,292,346,369,18,177,61,41,46,151,138,79,1211,23,25600,79,25600,497,161,38,3,25600,46,123,36,384,79,292,102,369,54,38,681,812,25600,46,732,115,829,166,138,1587,79],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,23,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,256,115,151,115,115,54,54,36,72,79,61,25600,61,36,33,51,23,28,46,25600,51,33,18,20,15,23,15,20,20,25600,20,13,13,13,10,10,10,10,8,10,8,8,8,25600,8,8,10,25600,3,5,5,5,3,3,3,5,5,0,0,3,21140,3,8,5,5,3,5,3,21140,0,0,3,5,3,20,8,18,61,10,13,10,54,28,33,36,5,20,10,8,8,15,18,13,115,5,25600,13,25600,46,18,10,3,25600,10,18,8,36,13,28,10,36,10,10,64,79,25600,10,69,15,172,15,18,151,13],
 [25600,25600,25600,25600,25600,25600,25600,54,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,563,256,328,256,251,115,115,79,110,212,138,25600,166,79,72,115,54,61,79,25600,115,56,28,33,23,54,23,38,36,25600,44,20,18,20,18,13,18,18,10,15,13,10,10,25600,10,13,15,25600,3,8,8,8,5,5,5,8,5,0,0,3,21140,5,13,5,5,3,5,5,21140,0,3,3,5,5,36,13,38,138,13,28,13,92,61,72,59,8,44,13,10,10,28,28,20,256,8,25600,20,25600,102,33,13,3,25600,15,28,13,79,20,61,18,79,15,15,102,177,25600,15,105,23,256,31,28,323,20],
 [25600,25600,25600,25600,25600,25600,25600,49,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,435,200,256,200,210,90,64,41,90,131,102,25600,102,59,56,97,49,51,84,25600,51,44,36,41,33,49,33,36,44,25600,38,26,26,18,20,13,13,13,18,20,18,18,13,25600,10,18,23,25600,5,13,13,8,5,5,5,13,8,3,3,5,33436,8,13,5,8,3,8,8,33436,3,5,3,8,5,38,18,41,102,13,28,18,69,51,56,49,10,38,20,20,10,31,36,26,200,13,25600,26,25600,79,38,18,5,25600,20,33,18,64,26,51,13,41,20,18,79,131,25600,20,41,33,251,31,36,251,18],
 [25600,25600,25600,25600,25600,25600,25600,54,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,563,256,328,256,251,115,115,79,151,118,138,25600,92,79,72,115,54,61,100,25600,115,72,28,33,23,54,23,46,36,25600,26,20,18,20,18,15,20,20,10,15,13,10,10,25600,10,13,15,25600,3,8,8,8,5,5,5,5,5,0,0,3,21140,5,13,5,5,3,5,5,21140,0,3,3,5,5,36,13,46,138,15,31,13,123,61,72,79,8,26,15,10,10,33,28,20,256,8,25600,15,25600,102,33,13,3,25600,15,28,13,79,20,61,20,79,15,10,138,177,25600,15,151,23,256,36,28,164,20],
 [25600,25600,25600,25600,25600,25600,25600,51,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,563,261,312,261,256,120,90,56,141,100,138,25600,79,79,74,118,51,61,123,25600,61,64,38,44,36,51,36,44,44,25600,36,28,28,20,26,13,15,15,20,23,18,18,15,25600,13,18,23,25600,5,13,13,8,5,5,5,13,10,3,3,5,33436,8,13,8,10,3,10,8,33436,3,5,3,8,5,44,18,59,138,13,36,20,108,61,74,79,13,36,23,20,10,36,38,28,261,13,25600,23,25600,97,41,20,5,25600,23,38,18,64,28,61,15,56,23,15,125,174,25600,23,59,36,325,36,38,335,20],
 [25600,25600,25600,25600,25600,25600,25600,115,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1211,563,732,563,545,256,256,177,328,369,292,25600,292,177,161,251,115,138,210,25600,251,151,61,61,54,115,54,102,79,25600,79,36,28,36,46,33,46,41,20,23,18,15,15,25600,15,18,28,25600,5,13,10,10,8,10,10,13,8,3,3,3,21140,8,20,8,8,5,8,8,21140,0,3,5,8,5,79,20,100,292,33,64,20,266,138,161,177,13,79,28,20,20,72,61,36,563,10,25600,36,25600,225,72,20,3,25600,23,56,20,177,36,138,46,177,23,20,307,369,25600,23,338,54,379,79,61,369,36],
 [25600,25600,25600,25600,25600,25600,25600,115,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1211,563,1024,563,737,256,256,177,461,369,292,25600,292,177,161,340,115,138,151,25600,251,210,61,61,54,115,54,143,120,25600,79,36,28,36,33,33,46,41,31,23,18,15,15,25600,15,18,41,25600,5,13,10,10,8,10,10,13,8,3,3,3,21140,8,20,8,8,5,8,8,21140,0,3,5,8,5,79,20,72,292,33,46,20,387,138,161,177,13,79,41,28,20,100,61,36,563,13,25600,36,25600,323,72,20,3,25600,23,56,20,261,36,138,46,177,23,20,445,369,25600,23,338,54,379,108,61,712,36],
 [25600,25600,25600,25600,25600,25600,25600,177,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1861,812,1556,812,1137,369,369,256,704,563,433,25600,433,256,238,512,177,202,225,25600,374,323,92,92,79,177,79,210,174,25600,115,54,41,54,46,46,72,61,46,28,23,23,20,25600,20,23,59,25600,5,15,15,13,10,10,10,15,10,3,3,5,21140,10,23,10,10,5,10,10,21140,3,3,8,10,8,115,23,102,433,46,72,28,558,202,238,256,15,115,59,41,33,143,92,54,812,20,25600,54,25600,461,110,28,3,25600,28,82,23,384,54,202,72,256,36,28,650,563,25600,28,499,79,548,156,92,1044,54],
 [25600,25600,25600,25600,25600,25600,25600,90,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,924,589,732,435,461,200,141,92,256,417,346,25600,346,218,123,210,161,179,174,25600,110,90,102,123,49,161,49,64,128,25600,118,77,72,28,41,15,20,20,26,31,26,51,41,25600,15,26,36,25600,8,36,18,10,8,8,8,36,13,5,5,5,33772,13,18,8,13,5,13,13,33436,3,5,5,13,8,118,51,84,346,15,59,28,138,179,123,97,36,118,31,28,13,44,102,38,435,18,25600,77,25600,169,56,28,5,25600,31,51,26,115,38,179,20,92,67,28,156,417,25600,31,84,49,763,54,51,553,28],
 [25600,25600,25600,25600,25600,25600,25600,79,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,812,307,497,548,660,177,177,115,156,256,297,25600,202,97,161,292,67,74,110,25600,166,123,33,41,54,118,54,56,54,25600,54,20,18,23,28,18,28,23,13,23,18,13,10,25600,13,18,20,25600,3,8,10,10,5,8,8,10,8,3,3,3,21140,5,15,8,8,3,5,5,21140,0,3,5,8,5,44,13,54,166,18,38,23,128,74,161,69,10,54,18,15,13,61,33,36,369,10,25600,23,25600,151,74,23,3,25600,23,56,18,115,36,74,28,115,18,18,143,212,25600,23,146,54,207,44,61,392,23],
 [25600,25600,25600,25600,25600,25600,25600,100,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1044,476,632,476,474,225,225,151,189,220,256,25600,172,151,138,215,100,115,138,25600,215,97,54,51,46,100,46,69,69,25600,44,28,23,28,33,23,33,31,18,20,18,15,15,25600,15,18,23,25600,5,13,10,10,8,8,8,10,8,3,3,3,21140,8,18,8,8,5,8,8,21140,0,3,5,5,5,67,18,69,256,23,49,18,156,115,138,102,10,44,20,18,18,49,54,28,476,10,25600,23,25600,195,61,18,3,25600,20,49,18,148,28,115,33,151,23,15,177,323,25600,20,179,46,328,54,54,310,28],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,100,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1044,392,632,707,822,225,225,151,189,323,379,25600,256,123,200,371,82,97,138,25600,215,148,44,49,69,151,69,69,69,25600,67,26,20,28,33,23,33,31,18,28,23,15,13,25600,15,23,23,25600,5,10,10,10,8,8,8,13,10,3,3,3,21140,8,18,8,10,5,8,8,21140,0,3,5,8,5,54,15,69,212,23,49,26,156,97,200,87,10,67,20,18,18,77,44,44,476,10,25600,28,25600,195,92,26,3,25600,28,74,23,148,44,97,33,151,20,18,177,269,25600,28,179,69,269,54,77,489,28],
 [25600,25600,25600,25600,25600,25600,25600,177,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1861,812,1083,812,819,369,369,256,300,676,433,25600,530,256,238,374,177,202,223,25600,374,156,92,92,79,177,79,110,115,25600,143,54,41,54,54,38,56,51,28,28,23,23,20,25600,20,23,41,25600,5,15,13,13,10,10,10,18,10,3,3,5,21140,10,23,10,10,5,10,10,21140,3,3,8,10,8,115,23,110,433,38,79,28,243,202,238,159,15,143,33,28,28,79,92,54,812,13,25600,67,25600,328,110,28,3,25600,28,82,23,261,54,202,56,256,36,33,274,563,25600,28,276,79,548,90,92,1044,54],
 [25600,25600,25600,25600,25600,25600,25600,189,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1933,899,1162,899,886,407,407,274,527,402,476,25600,328,274,256,397,189,225,335,25600,397,241,100,100,82,189,82,164,128,25600,84,56,46,56,72,51,77,67,33,33,23,23,20,25600,20,23,44,25600,5,18,18,18,10,13,13,13,10,3,3,5,21140,10,28,10,10,5,10,10,21140,3,5,8,8,8,123,28,156,476,51,108,28,425,225,256,274,15,84,44,28,33,110,100,56,899,18,25600,38,25600,358,115,28,3,25600,33,92,28,279,56,225,77,274,38,23,497,589,25600,33,530,82,602,123,100,579,56],
 [25600,25600,25600,25600,25600,25600,25600,120,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1254,563,676,563,553,261,192,128,312,223,307,25600,177,174,164,256,120,138,274,25600,136,141,61,64,51,120,51,97,64,25600,56,44,38,33,59,18,23,23,28,33,28,28,23,25600,18,28,36,25600,8,18,20,10,8,8,8,15,13,5,5,8,33436,13,20,8,13,5,13,13,33436,3,5,5,13,10,79,28,123,307,18,87,31,238,138,164,174,20,56,36,28,15,64,61,44,563,20,25600,36,25600,210,74,31,5,25600,33,59,28,138,44,138,23,128,36,28,274,392,25600,33,133,51,563,77,61,712,33],
 [25600,25600,25600,25600,25600,25600,25600,256,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,2778,1211,1347,1211,1244,563,563,369,407,991,648,25600,799,369,346,545,256,292,300,25600,545,212,138,136,115,256,115,156,177,25600,212,79,61,79,79,56,79,69,38,46,28,31,23,25600,23,28,61,25600,5,20,23,18,10,13,13,20,13,3,3,5,21140,10,36,13,13,8,13,10,21140,3,5,10,13,8,177,36,154,648,56,110,38,340,292,346,215,18,212,51,41,38,110,138,79,1211,20,25600,97,25600,497,161,38,3,25600,46,123,36,384,79,292,79,369,54,46,379,812,25600,46,371,115,829,123,138,1587,79],
 [25600,25600,25600,25600,25600,25600,25600,225,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,2307,1044,1280,1044,1047,476,476,323,364,863,563,25600,676,323,292,474,225,256,266,25600,474,189,115,118,100,225,100,138,148,25600,182,67,54,67,69,49,69,61,33,38,28,28,23,25600,23,28,54,25600,5,18,18,18,10,13,13,20,13,3,3,5,21140,10,28,13,13,8,13,10,21140,3,5,8,13,8,151,28,138,563,49,97,33,297,256,292,192,15,182,44,36,33,97,115,67,1044,18,25600,82,25600,422,138,33,3,25600,38,110,28,333,67,256,69,323,46,41,340,712,25600,38,328,100,707,110,115,1339,67],
 [25600,25600,25600,25600,25600,25600,25600,141,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1431,819,768,655,525,312,435,289,376,586,474,25600,474,292,195,238,220,246,256,25600,461,108,125,113,64,220,64,74,110,25600,154,82,72,59,46,44,64,51,20,31,26,46,46,25600,33,26,26,25600,10,36,13,26,18,20,20,36,13,5,5,8,33772,10,38,18,13,13,13,10,33436,5,5,13,13,8,154,56,97,474,44,72,31,169,246,195,151,31,154,23,23,36,51,125,41,655,13,25600,82,25600,200,87,31,5,25600,31,69,28,133,41,246,64,289,72,31,189,586,25600,31,259,64,512,61,72,837,59],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,120,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1254,563,1303,563,1062,261,261,174,594,392,307,25600,307,174,164,484,120,138,141,25600,256,274,61,64,51,120,51,187,128,25600,79,44,38,44,36,36,44,44,36,33,28,28,23,25600,23,28,49,25600,8,18,20,18,13,15,15,18,13,5,5,8,33436,13,28,13,13,8,13,13,33436,3,5,10,13,10,79,28,64,307,36,44,31,456,138,164,174,20,79,49,31,28,123,61,44,563,23,25600,44,25600,399,74,31,5,25600,33,59,28,269,44,138,44,174,36,31,538,392,25600,33,256,51,563,151,61,712,44],
 [25600,25600,25600,25600,25600,25600,25600,200,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,2017,1152,1495,924,1024,435,312,202,732,535,666,25600,438,417,271,461,307,346,604,25600,238,256,179,179,90,307,90,125,207,25600,151,118,102,41,84,23,36,31,36,44,38,72,67,25600,23,38,51,25600,10,51,26,13,10,13,13,46,18,5,5,8,33772,18,28,13,18,8,18,18,33436,5,5,8,15,13,218,77,174,666,23,123,44,269,346,271,192,51,151,41,44,20,90,179,59,924,26,25600,102,25600,384,123,44,5,25600,44,97,38,256,59,346,36,202,97,36,300,822,25600,44,169,90,763,110,102,1190,41],
 [25600,25600,25600,25600,25600,25600,25600,476,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3656,2307,1828,2307,1705,1044,1044,712,640,1907,1211,25600,1498,712,648,1047,476,563,520,25600,1047,364,256,256,225,476,225,261,333,25600,392,151,115,151,138,97,138,120,69,82,56,49,46,25600,46,56,115,25600,10,28,38,33,18,23,23,36,18,5,5,5,21140,18,67,18,18,10,18,18,21140,3,5,13,20,13,323,67,266,1211,97,189,72,532,563,648,356,26,392,87,79,69,189,256,151,2307,38,25600,182,25600,924,292,72,3,25600,82,238,67,722,151,563,138,712,100,90,581,1587,25600,82,512,225,1551,212,256,2844,151],
 [25600,25600,25600,25600,25600,25600,25600,484,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3259,1871,1600,1871,1505,1050,1050,709,532,1541,1247,25600,1321,709,645,1024,484,558,581,25600,1024,366,256,256,220,484,220,289,397,25600,399,146,118,146,177,113,154,133,79,87,59,64,49,25600,49,59,143,25600,15,36,49,41,28,33,33,44,20,5,5,10,5284,28,67,20,20,18,20,28,5284,5,8,20,26,13,328,67,340,1247,113,243,74,458,558,645,340,36,399,95,97,79,212,256,146,1871,46,25600,179,25600,883,297,74,3,25600,87,241,67,655,146,558,154,709,100,90,492,1482,25600,87,399,220,1247,246,256,2268,146],
 [25600,25600,25600,25600,25600,25600,25600,563,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,4265,2778,1969,2778,1828,1211,1211,812,1347,1226,1398,25600,952,812,781,1244,563,648,1024,25600,1244,732,292,297,256,563,256,497,384,25600,256,177,138,177,210,151,225,202,102,100,67,51,54,25600,54,67,133,25600,10,36,54,46,20,33,33,26,20,5,5,8,21140,20,79,20,18,10,20,20,21140,3,5,15,15,13,369,79,461,1398,151,323,82,1162,648,781,812,28,256,133,92,102,328,292,177,2778,51,25600,118,25600,1083,346,82,3,25600,100,274,79,858,177,648,225,812,115,56,1219,1861,25600,100,1114,256,1815,374,292,1664,177],
 [25600,25600,25600,25600,25600,25600,25600,256,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,2778,1211,1347,1211,1244,563,563,369,407,548,648,25600,435,369,346,545,256,292,300,25600,545,212,138,136,115,256,115,156,177,25600,118,79,61,79,79,56,79,69,38,46,28,31,23,25600,23,28,61,25600,5,20,23,18,10,13,13,15,13,3,3,5,21140,10,36,13,13,8,13,10,21140,3,5,10,10,8,177,36,154,648,56,110,38,340,292,346,215,18,118,51,41,38,110,138,79,1211,20,25600,54,25600,497,161,38,3,25600,46,123,36,384,79,292,79,369,54,28,379,812,25600,46,371,115,829,123,138,799,79],
 [25600,25600,25600,25600,25600,25600,25600,563,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,4265,2778,1969,2778,1828,1211,1211,812,1347,1226,1398,25600,952,812,781,1244,563,648,1024,25600,1244,732,292,297,256,563,256,497,384,25600,256,177,138,177,210,151,225,202,102,100,67,51,54,25600,54,67,133,25600,10,36,54,46,20,33,33,26,20,5,5,8,21140,20,79,20,18,10,20,20,21140,3,5,15,15,13,369,79,461,1398,151,323,82,1162,648,781,812,28,256,133,92,102,328,292,177,2778,51,25600,118,25600,1083,346,82,3,25600,100,274,79,858,177,648,225,812,115,56,1219,1861,25600,100,1114,256,1815,374,292,1664,177],
 [25600,25600,25600,25600,25600,25600,25600,289,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,2980,1695,1761,1413,1464,632,453,312,1024,1152,937,25600,937,589,397,676,417,476,865,25600,348,522,251,225,131,417,131,256,284,25600,307,161,136,64,123,36,51,41,44,56,44,92,77,25600,28,44,64,25600,13,67,31,15,13,13,13,67,20,8,8,10,33772,20,36,15,20,8,20,20,33436,5,8,10,20,13,307,97,241,937,36,174,51,364,476,397,269,61,307,51,51,23,125,251,90,1413,31,25600,161,25600,563,182,51,5,25600,56,141,49,384,90,476,51,312,118,51,407,1152,25600,56,238,131,1068,154,156,1766,64],
 [25600,25600,25600,25600,25600,25600,25600,371,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3039,1810,1505,1810,1505,819,545,376,512,1190,942,25600,942,561,512,996,371,438,599,25600,512,315,197,164,169,371,169,230,256,25600,251,115,90,77,164,51,72,59,59,72,56,61,51,25600,33,56,95,25600,18,41,41,23,15,20,20,41,28,10,10,13,33436,31,44,18,26,13,28,31,33436,8,10,13,28,18,251,64,320,942,51,230,64,425,438,512,312,41,251,69,77,33,166,197,115,1810,41,25600,115,25600,829,233,64,5,25600,72,182,64,566,115,438,72,376,77,64,458,1190,25600,72,302,169,1085,202,197,2140,77],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,369,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3200,1498,1705,2427,1828,812,812,563,548,1211,1482,25600,993,453,776,1162,307,356,425,25600,819,435,166,164,256,548,256,212,261,25600,256,97,74,115,110,79,110,97,56,100,69,38,28,25600,36,69,92,25600,8,20,33,28,13,18,18,23,18,3,3,5,21140,13,54,15,18,10,13,13,21140,3,5,10,15,13,212,44,223,799,79,154,84,448,356,776,251,20,256,69,61,56,230,166,172,1861,31,25600,115,25600,732,353,84,3,25600,100,276,77,568,172,356,110,563,67,56,525,991,25600,100,458,256,1024,174,297,1907,115],
 [25600,25600,25600,25600,25600,25600,25600,812,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,5120,3200,2560,3200,2327,1861,1861,1211,852,2985,2214,25600,2516,1211,1152,1505,812,993,788,25600,1505,548,433,443,369,812,369,407,568,25600,676,256,202,256,223,156,212,189,110,151,100,79,79,25600,79,100,202,25600,15,54,67,56,28,38,38,67,23,5,5,8,21140,23,115,23,23,13,23,26,21140,3,5,18,28,15,563,115,425,2214,156,300,123,712,993,1152,522,41,676,138,133,110,300,433,256,3200,64,25600,307,25600,1347,525,123,5,25600,151,407,115,1024,256,993,212,1211,177,154,801,2778,25600,151,673,369,2427,328,433,3656,256],
 [25600,25600,25600,25600,25600,25600,25600,1044,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,5120,3656,2560,3656,2327,2307,2307,1587,914,3412,2778,25600,2985,1587,1398,1705,1044,1211,914,25600,1705,640,563,558,476,1044,476,484,722,25600,863,323,256,323,266,189,261,230,138,189,123,100,100,25600,100,123,256,25600,20,67,82,69,33,49,49,82,28,5,5,10,21140,31,151,28,28,18,28,31,21140,5,8,20,36,18,712,151,520,2778,189,374,161,801,1211,1398,637,54,863,169,172,138,364,563,323,3656,77,25600,392,25600,1505,648,161,5,25600,189,525,151,1162,323,1211,261,1587,225,197,852,3200,25600,189,753,476,2875,402,563,4265,323],
 [25600,25600,25600,25600,25600,25600,25600,812,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,5120,3200,3658,3200,3200,1861,1861,1211,2327,2778,2214,25600,2214,1211,1152,1969,812,993,1083,25600,1505,1556,433,443,369,812,369,1024,852,25600,563,256,202,256,225,225,328,292,210,151,100,79,79,25600,79,100,289,25600,18,54,54,72,33,46,46,54,23,5,5,10,21140,41,115,23,23,15,23,28,21140,3,8,20,23,15,563,115,497,2214,225,328,123,1969,993,1152,1211,41,563,289,192,151,704,433,256,3200,108,25600,256,25600,1828,525,123,5,25600,151,407,115,1505,256,993,328,1211,177,123,2327,2778,25600,151,1347,369,2427,737,433,3656,256],
 [25600,25600,25600,25600,25600,25600,25600,655,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,6113,3653,3100,3292,2563,1431,2017,1413,1546,2424,2010,25600,2010,1198,914,1116,819,945,1408,25600,1828,768,474,369,312,819,312,525,397,25600,586,292,246,289,256,177,248,202,74,118,82,108,115,25600,90,82,110,25600,23,82,49,64,36,44,44,82,28,10,10,15,33772,20,131,38,28,26,28,20,33436,8,13,31,28,18,586,154,433,2010,177,294,100,609,945,914,561,77,586,87,74,125,215,474,202,3292,44,25600,292,25600,919,420,100,5,25600,118,335,92,625,202,945,248,1413,220,100,727,2424,25600,118,640,312,2030,261,353,4045,289],
 [25600,25600,25600,25600,25600,25600,25600,924,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,6400,4657,5376,4196,5120,2017,2017,1413,3914,3397,2836,25600,2836,1695,1293,3658,1152,1331,1495,25600,1828,2742,666,586,435,1152,435,1779,1283,25600,822,417,346,289,369,256,384,312,330,166,115,169,161,25600,90,115,402,25600,26,118,64,79,44,51,51,118,38,13,13,18,33772,59,131,38,38,28,38,44,33436,8,15,36,38,26,822,218,563,2836,256,384,141,2844,1331,1293,1413,113,822,402,269,169,1129,666,289,4196,187,25600,417,25600,2844,594,141,8,25600,166,466,131,1969,289,1331,384,1413,307,141,3200,3397,25600,166,1280,435,2716,1303,497,4890,289],
 [25600,25600,25600,25600,25600,25600,25600,632,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,5642,3397,4521,2980,4265,1413,1413,924,3100,2360,1907,25600,1907,1152,855,2767,822,937,1024,25600,1464,1779,476,425,289,822,289,1298,906,25600,589,307,251,200,261,169,256,207,225,115,74,133,118,25600,59,74,269,25600,20,97,51,51,36,44,44,97,33,10,10,15,33772,38,90,33,31,23,33,36,33436,8,13,28,33,20,589,161,384,1907,169,256,97,2560,937,855,924,92,589,269,187,115,727,476,200,2980,123,25600,307,25600,2491,397,97,5,25600,115,310,90,1659,200,937,256,924,218,97,2560,2360,25600,115,1024,289,2171,922,338,3715,200],
 [25600,25600,25600,25600,25600,25600,25600,717,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,5642,3464,4521,3039,4265,1590,1590,1047,3100,2668,2148,25600,2148,1311,965,2844,932,1055,1244,25600,1505,2166,538,494,325,932,325,1569,1096,25600,668,343,284,223,320,207,312,256,269,128,87,159,136,25600,69,87,330,25600,26,113,64,64,44,51,51,113,36,13,13,18,33772,49,100,36,36,28,36,44,33436,8,15,36,36,23,668,179,471,2148,207,312,110,2560,1055,965,1047,108,668,330,225,138,891,538,223,3039,156,25600,343,25600,2560,451,110,8,25600,128,351,100,1705,223,1055,312,1047,251,110,2560,2668,25600,128,1024,325,2222,1129,381,3715,223],
 [25600,25600,25600,25600,25600,25600,25600,1413,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,8532,6152,3456,5642,3200,2980,2127,1431,2583,4657,3822,25600,3822,2360,1946,2327,1695,1907,3100,25600,1725,1761,937,819,632,1695,632,1495,1078,25600,1152,589,476,312,865,200,289,243,256,251,166,202,218,25600,92,166,312,25600,36,161,118,51,23,36,36,161,49,13,13,18,33772,41,141,36,46,15,49,41,33436,10,13,20,49,33,1152,307,876,3822,156,678,210,914,1907,1946,860,133,1152,202,207,108,456,937,435,5642,110,25600,589,25600,1828,855,210,8,25600,251,681,200,1280,435,1907,215,1431,417,210,983,4657,25600,251,753,632,3464,568,732,6400,312],
 [25600,25600,25600,25600,25600,25600,25600,1398,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,6400,4265,3200,4265,2844,2844,2844,2214,2132,2811,3200,25600,2276,2214,1933,1969,1398,1644,2132,25600,1969,1505,781,755,648,1398,648,1162,914,25600,655,433,346,433,550,389,568,504,261,256,177,136,138,25600,138,177,346,25600,33,92,138,118,54,82,82,61,41,8,8,13,21140,49,202,41,38,28,41,51,21140,5,10,33,28,20,993,202,1226,3200,389,791,225,1828,1644,1933,2214,74,655,346,230,261,883,781,433,4265,131,25600,297,25600,1705,899,225,5,25600,256,712,202,1347,433,1644,568,2214,292,151,1969,3656,25600,256,1828,648,3412,960,781,3259,433],
 [25600,25600,25600,25600,25600,25600,25600,2214,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,8532,5120,3658,5120,3658,3656,3656,2844,2560,3412,3656,25600,2918,2844,2844,2327,2214,2391,2560,25600,2327,1705,1152,1124,993,2214,993,1505,1162,25600,952,648,525,648,791,568,883,760,389,369,256,200,202,25600,202,256,504,25600,51,138,202,174,82,118,118,92,61,10,10,20,21140,72,292,61,56,41,61,77,21140,8,13,49,41,28,1398,292,1600,3656,568,1226,323,2327,2391,2844,2844,108,952,504,346,389,1162,1152,648,5120,195,25600,435,25600,2132,1339,323,8,25600,369,1044,292,1705,648,2391,883,2844,433,220,2327,4265,25600,369,2132,993,4265,1347,1152,4265,648],
 [25600,25600,25600,25600,25600,25600,25600,2127,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,8532,5688,3658,5688,3658,3907,3907,2885,1280,4654,3937,25600,4265,2885,2675,2327,2127,2314,1421,25600,2327,914,1359,996,1247,2127,1247,712,1065,25600,1715,827,645,827,609,387,492,412,323,484,328,256,256,25600,256,328,673,25600,56,172,212,174,90,125,125,210,79,15,15,20,10570,77,381,79,74,54,79,82,10570,10,13,54,95,41,1580,381,914,3937,387,801,412,1065,2314,2675,1029,133,1715,335,553,323,581,1359,827,5688,202,25600,1001,25600,2132,1559,412,8,25600,484,1290,381,1505,827,2314,492,2885,558,502,1162,4654,25600,484,983,1247,4232,673,1359,5688,827],
 [25600,25600,25600,25600,25600,25600,25600,2778,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,8532,6400,5120,6400,4265,4265,4265,3200,1600,5688,4265,25600,4654,3200,3200,2844,2778,2844,1421,25600,2844,983,1398,1359,1211,2778,1211,852,1280,25600,2276,812,648,812,568,407,548,484,300,476,323,256,256,25600,256,323,660,25600,46,177,182,156,79,110,110,212,79,10,10,18,21140,69,369,79,72,44,79,74,21140,5,10,51,97,36,1861,369,914,4265,407,788,407,1280,2844,3200,1065,138,2276,366,433,300,673,1398,812,6400,174,25600,991,25600,2560,1644,407,8,25600,476,1339,369,1969,812,2844,548,3200,563,489,1421,5120,25600,476,1162,1211,5120,753,1398,6400,812],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,2778,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,8532,6400,6400,6400,5120,4265,4265,3200,4265,5120,4265,25600,4265,3200,3200,3658,2778,2844,1969,25600,2844,2844,1398,1359,1211,2778,1211,2327,1969,25600,1861,812,648,812,732,732,1083,957,704,476,323,256,256,25600,256,323,975,25600,64,177,177,225,102,151,151,177,79,10,10,20,21140,133,369,79,72,51,79,59,21140,8,15,61,79,36,1861,369,1347,4265,732,1083,407,3658,2844,3200,3200,138,1861,975,627,497,1828,1398,812,6400,340,25600,812,25600,3658,1644,407,8,25600,476,1339,369,2844,812,2844,1083,3200,563,407,4265,5120,25600,476,2327,1211,5120,1969,1398,6400,812],
 [25600,25600,25600,25600,25600,25600,25600,2214,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,8532,5120,3658,5120,3658,3656,3656,2844,2560,3412,3656,25600,2918,2844,2844,2327,2214,2391,2560,25600,2327,1705,1152,1124,993,2214,993,1505,1162,25600,952,648,525,648,791,568,883,760,389,369,256,200,202,25600,202,256,504,25600,51,138,202,174,82,118,118,92,61,10,10,20,21140,72,292,61,56,41,61,77,21140,8,13,49,41,28,1398,292,1600,3656,568,1226,323,2327,2391,2844,2844,108,952,504,346,389,1162,1152,648,5120,195,25600,435,25600,2132,1339,323,8,25600,369,1044,292,1705,648,2391,883,2844,433,220,2327,4265,25600,369,2132,993,4265,1347,1152,4265,648],
 [25600,25600,25600,25600,25600,25600,25600,1047,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,6400,4196,2844,4196,2844,2278,1567,1088,1828,3039,2696,25600,2696,1590,1464,1828,1047,1229,2560,25600,1357,1280,563,456,489,1047,489,996,691,25600,717,325,256,225,602,161,243,197,207,189,128,97,100,25600,67,128,256,25600,33,69,125,41,23,33,33,69,44,13,13,20,33436,51,105,31,44,18,44,41,33436,10,15,20,44,31,717,151,1364,2696,161,891,161,1505,1229,1464,1590,64,717,256,169,110,681,563,325,4196,115,25600,325,25600,1505,668,161,8,25600,189,527,151,1024,325,1229,243,1088,223,161,1705,3039,25600,189,1280,489,2319,819,563,4890,225],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,9044,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,26112,18089,13312,17577,13056,13312,13312,10752,9044,18089,13824,25600,13824,11264,10752,8788,9556,9556,5632,25600,8788,5632,6272,4262,5512,9556,5512,4777,3356,25600,7365,4152,3208,3779,2762,2514,3100,2583,1871,1897,1295,1149,1434,25600,1024,1295,2028,25600,256,1016,737,0,0,563,563,1016,435,54,36,177,0,440,1728,0,410,241,435,230,0,18,105,0,435,225,7365,1979,3712,13824,2266,3356,1900,6656,9556,10752,11264,748,7365,2276,1408,1667,3456,6272,3779,17577,950,25600,4152,25600,6656,6205,1900,0,25600,1897,5238,1477,4521,3779,9556,3100,10752,2811,1900,6912,18089,25600,1897,5376,5512,13824,4521,5315,17577,3779],
 [25600,25600,25600,25600,25600,25600,25600,3200,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,12800,8532,5120,8532,5120,5120,5120,4265,1828,7314,5120,25600,5688,4265,3656,3658,3200,3656,1828,25600,3658,1280,2214,1838,1861,3200,1861,983,1600,25600,2985,1211,993,1211,788,548,673,581,407,712,476,381,369,25600,369,476,957,25600,64,256,248,212,110,156,156,307,115,13,13,23,21140,97,563,115,110,64,115,102,21140,8,13,69,143,54,2778,563,1162,5120,548,914,589,1600,3656,3656,1421,200,2985,484,660,407,852,2214,1211,8532,243,25600,1498,25600,3200,2391,589,8,25600,712,1933,563,2327,1211,3656,673,4265,812,727,1600,6400,25600,712,1600,1861,6400,914,2214,8532,1211],
 [25600,25600,25600,25600,25600,25600,25600,2570,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,12800,9044,5376,8532,5120,5642,5642,4196,3456,6912,6200,25600,6200,4408,3479,3200,2931,3369,4521,25600,3200,2583,1641,1313,1203,2931,1203,2084,1536,25600,2030,986,796,1190,1359,1024,1280,1024,553,471,320,307,361,25600,371,320,522,25600,87,261,256,230,118,166,166,261,77,28,28,28,33772,59,561,115,69,74,77,64,33436,18,20,69,77,44,2030,512,1349,6200,512,1091,402,1421,3369,3479,1467,192,2030,323,356,420,714,1641,788,8532,179,25600,986,25600,2844,1659,402,10,25600,471,1254,376,1828,788,3369,640,4196,709,402,1421,6912,25600,471,1162,1203,6152,865,1380,8532,1190],
 [25600,25600,25600,25600,25600,25600,25600,3397,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,13312,9044,8788,9044,8788,6152,6152,4657,6656,6912,6200,25600,6200,4657,3791,6400,3397,3822,2583,25600,3456,4521,1907,1551,1413,3397,1413,3914,2816,25600,2360,1152,937,924,1024,819,1244,996,1298,553,374,374,417,25600,289,374,1569,25600,2232,307,284,256,115,261,261,307,90,1249,1203,1201,33772,264,589,90,82,64,161,77,33772,1157,1139,64,161,49,2360,589,1761,6200,819,1495,466,5376,3822,3791,4657,233,2360,1569,1060,563,2844,1907,924,9044,707,25600,1152,25600,5376,1946,466,13,25600,553,1462,435,3914,924,3822,1244,4196,822,630,6656,6912,25600,553,2583,1413,6152,3914,1603,9044,924],
 [25600,25600,25600,25600,25600,25600,25600,6152,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,17577,13312,13056,13312,13056,9044,9044,6912,8788,10752,9044,25600,9044,6912,6400,8532,6152,6200,3456,25600,5376,6656,3822,2386,2980,6152,2980,5376,3914,25600,4657,2360,1907,2017,1761,1505,1828,1505,2742,1190,799,722,822,25600,632,799,2816,25600,3517,589,553,563,256,522,522,589,200,1418,1336,1339,33772,515,1152,200,182,141,307,115,33772,1262,1239,138,307,90,4657,1152,2583,9044,1505,2084,1004,8788,6200,6400,6912,438,4657,2816,2166,1244,4265,3822,2017,13312,1472,25600,2360,25600,8788,3791,1004,18,25600,1190,3315,924,5376,2017,6200,1828,6400,1695,1244,8788,10752,25600,1190,3456,2980,9044,5376,3382,13312,2017],
 [25600,25600,25600,25600,25600,25600,25600,4196,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,17065,10752,13056,10240,12800,6400,6400,5642,8788,9044,7826,25600,7826,6152,4964,8532,4657,5261,3100,25600,4265,5376,2836,1905,2017,4657,2017,4521,3100,25600,3397,1695,1331,1413,1495,1244,1505,1280,1779,799,553,520,589,25600,435,553,1915,25600,115,417,394,248,125,256,256,417,131,23,23,33,33772,269,632,131,123,97,131,67,33436,18,23,74,131,59,3397,822,1828,7826,1244,1505,681,6400,5261,4964,5642,317,3397,1915,1364,819,3658,2836,1413,10240,922,25600,1695,25600,6400,2852,681,13,25600,799,2227,632,4265,1413,5261,1505,5642,1152,681,6400,9044,25600,799,2844,2017,6912,4265,2468,10240,1413],
 [25600,25600,25600,25600,25600,25600,25600,4196,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,17065,10752,13056,10240,12800,6400,6400,5642,8788,9044,7826,25600,7826,6152,4964,8532,4657,5261,3100,25600,4265,5376,2836,1905,2017,4657,2017,4521,3100,25600,3397,1695,1331,1413,1495,1244,1505,1280,1779,799,553,520,589,25600,435,553,1915,25600,115,417,394,248,125,256,256,417,131,23,23,33,33772,269,632,131,123,97,131,67,33436,18,23,74,131,59,3397,822,1828,7826,1244,1505,681,6400,5261,4964,5642,317,3397,1915,1364,819,3658,2836,1413,10240,922,25600,1695,25600,6400,2852,681,13,25600,799,2227,632,4265,1413,5261,1505,5642,1152,681,6400,9044,25600,799,2844,2017,6912,4265,2468,10240,1413],
 [25600,25600,25600,25600,25600,25600,25600,3200,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,12800,7314,5120,10240,5120,5120,5120,4265,1828,6400,6400,25600,5120,3656,4654,4265,2985,3200,1828,25600,3658,1421,1748,1464,2427,3937,2427,983,1600,25600,2778,991,799,1211,788,548,673,581,407,1060,707,310,307,25600,369,707,957,25600,64,212,248,212,110,156,156,256,172,13,13,23,21140,97,563,115,161,64,97,102,21140,8,13,69,115,77,2276,453,1162,4654,548,914,886,1600,3200,4654,1219,164,2778,484,660,407,983,1748,1815,8532,243,25600,1211,25600,3200,2918,886,8,25600,1060,2619,829,2327,1815,3200,673,4265,676,589,1600,5688,25600,1060,1600,2427,5688,914,2811,7314,1211],
 [25600,25600,25600,25600,25600,25600,25600,5120,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,12800,12800,8532,12800,6400,8532,8532,6400,5120,7314,8532,25600,6400,6400,6400,5120,5120,5120,5120,25600,5120,3658,3656,3187,3200,5120,3200,3200,2327,25600,3384,2778,2214,2778,2327,1705,1969,1828,1347,1587,1044,827,812,25600,812,1044,1505,25600,151,563,852,732,328,497,497,379,256,33,31,56,21140,292,1211,256,238,166,256,307,21140,13,33,202,172,115,4265,1211,3658,8532,1705,2844,1339,5120,5120,6400,6400,435,3384,1505,1162,1347,2560,3656,2778,12800,819,25600,1815,25600,5120,3656,1339,13,25600,1587,3656,1211,3658,2778,5120,1969,6400,1861,886,5120,8532,25600,1587,4265,3200,10240,2844,3656,8532,2778],
 [25600,25600,25600,25600,25600,25600,25600,18089,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,52224,52224,26112,52224,26112,26624,26624,26624,13312,26624,26624,25600,26624,26624,26112,13056,18089,18089,13312,25600,13312,13312,13824,9556,13312,18089,13312,9044,6912,25600,18089,11264,9556,10752,5632,5376,6656,5376,4777,7826,6912,3889,6559,25600,6057,6912,4777,25600,1211,4541,2340,0,0,2839,2839,4541,1902,256,172,515,253,1964,7424,0,1833,1165,2179,1329,0,115,407,0,2179,924,18089,7424,9044,26624,5376,6912,7826,13312,18089,26112,26624,3208,18089,4777,3712,4521,8788,13824,10752,52224,3712,25600,11264,25600,13312,13312,7826,0,25600,7826,13312,6912,9044,10752,18089,6656,26112,9556,8338,13312,26624,25600,7826,13312,13312,26624,9044,13312,52224,10752],
 [25600,25600,25600,25600,25600,25600,25600,18089,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,52224,52224,26112,52224,26112,26624,26624,26624,13312,26624,26624,25600,26624,26624,26112,13056,18089,18089,13312,25600,13312,13312,13824,9556,13312,18089,13312,9044,6912,25600,18089,11264,9556,10752,5632,5376,6656,5376,4777,7826,6912,3889,6659,25600,6152,6912,4777,25600,1815,5046,2340,0,0,2839,2839,5046,2117,379,256,822,612,2017,7424,0,2030,1408,2424,1364,0,172,422,0,2424,1024,18089,7424,9044,26624,5376,6912,7826,13312,18089,26112,26624,3505,18089,4777,3712,4521,8788,13824,10752,52224,3712,25600,11264,25600,13312,13312,7826,0,25600,7826,13312,6912,9044,10752,18089,6656,26112,9556,8338,13312,26624,25600,7826,13312,13312,26624,9044,13312,52224,10752],
 [25600,25600,25600,25600,25600,25600,25600,11776,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,27136,28160,14080,27136,13568,18601,18601,14336,9812,19625,19625,25600,19625,15360,14336,9300,12800,12800,7680,25600,9300,7680,9874,7176,7936,12800,7936,6400,4480,25600,11092,8184,7176,7168,4124,3612,3968,3612,3607,4605,3208,3136,3564,25600,3110,3208,3095,25600,369,2696,2304,0,0,2048,2048,2696,1152,128,79,256,0,1582,4316,0,1083,1577,1152,922,0,46,118,0,1152,648,11092,4851,5545,19625,3356,4480,4406,9300,12800,14336,15360,2150,11092,3607,2596,3095,5033,9874,7168,27136,2596,25600,8184,25600,9300,8338,4406,0,25600,4605,8338,3653,5888,7168,12800,3968,14336,6502,4406,9812,19625,25600,4605,7168,7936,19625,5888,8338,27136,7168],
 [25600,25600,25600,25600,25600,25600,25600,3,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3,3,0,3,0,3,3,3,0,3,3,25600,3,3,3,0,3,3,0,25600,0,0,3,13,3,3,3,0,0,25600,3,3,3,3,0,0,0,0,0,3,3,5,3,25600,3,3,0,25600,1252,3,0,0,0,0,0,3,3,1129,1119,1152,256,0,3,3,3,0,3,0,256,1108,1121,0,3,3,3,3,0,3,0,0,3,0,3,3,3,5,3,0,0,0,0,3,3,3,0,25600,3,25600,0,3,3,3,25600,3,3,3,0,3,3,0,3,3,3,0,3,25600,3,33,3,33,0,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,5642,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,17065,13312,8788,12800,8532,8532,8532,6400,5376,10752,9044,25600,9044,6912,6400,5120,6152,6200,6656,25600,5120,3456,3822,2386,3039,6152,3039,3100,2084,25600,4657,2668,2148,1567,3100,1116,1646,1357,1536,1341,901,837,932,25600,494,901,1280,25600,148,668,1096,248,128,243,243,668,223,33,33,41,33772,256,717,151,205,74,223,179,33436,20,23,72,223,100,4657,1311,2132,9044,640,1828,1132,2132,6200,6400,2132,507,4657,640,1024,484,1162,3822,2278,12800,456,25600,2668,25600,4265,3791,1132,18,25600,1341,3315,1047,2844,2278,6200,865,6400,1907,1132,2132,10752,25600,1341,1600,3039,9044,1421,3382,12800,1567],
 [25600,25600,25600,25600,25600,25600,25600,1861,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,8532,5120,5120,5120,5120,3200,3200,2778,3658,4265,3656,25600,3656,2778,2391,3200,1861,2214,1705,25600,2327,2327,993,973,812,1861,812,1828,1505,25600,1211,563,433,563,497,497,732,660,461,323,225,172,177,25600,177,225,627,25600,36,115,115,110,56,102,102,115,54,8,8,15,21140,92,256,54,49,36,54,36,21140,5,10,33,54,23,1211,256,1083,3656,497,732,274,2844,2214,2391,2778,92,1211,627,433,328,1556,993,563,5120,230,25600,563,25600,2844,1152,274,5,25600,323,899,256,2327,563,2214,732,2778,369,274,3200,4265,25600,323,2132,812,3937,1659,993,5120,563],
 [25600,25600,25600,25600,25600,25600,25600,5120,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,12800,12800,12800,12800,8532,8532,8532,6400,8532,8532,8532,25600,8532,6400,6400,8532,5120,5120,3658,25600,5120,5120,3656,3187,3200,5120,3200,4265,3658,25600,4265,2778,2214,2778,1705,1705,1969,1828,1828,1587,1044,827,812,25600,812,1044,2132,25600,1628,563,568,732,328,497,497,563,256,1175,1160,1198,21140,433,1211,256,238,166,256,195,21140,1124,1144,202,256,115,4265,1211,2560,8532,1705,1969,1339,6400,5120,6400,6400,435,4265,2132,1705,1347,3658,3656,2778,12800,1137,25600,2778,25600,6400,3656,1339,13,25600,1587,3656,1211,5120,2778,5120,1969,6400,1861,1339,6400,8532,25600,1587,4265,3200,10240,3658,3656,12800,2778],
 [25600,25600,25600,25600,25600,25600,25600,5120,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,12800,12800,8532,12800,6400,8532,8532,6400,5120,7314,8532,25600,6400,6400,6400,5120,5120,5120,5120,25600,5120,3658,3656,3259,3656,5120,3656,3200,2560,25600,3412,2844,2307,2844,2327,1705,2132,1828,1421,1644,1152,886,899,25600,899,1152,1505,25600,161,589,924,786,358,527,527,402,274,36,33,59,21140,317,1339,274,256,182,274,333,21140,15,36,215,184,123,4265,1339,3658,8532,1705,2844,1398,5120,5120,6400,6400,479,3412,1505,1280,1421,2560,3656,2844,12800,886,25600,1958,25600,5120,4265,1398,13,25600,1644,3656,1339,3658,2844,5120,2132,6400,1933,952,5120,8532,25600,1644,4265,3656,10240,2844,3656,8532,2844],
 [25600,25600,25600,25600,25600,25600,25600,8532,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,17577,25856,17065,25600,12800,12800,10240,13056,17577,13312,25600,13312,10752,10240,12800,9044,9044,5376,25600,8532,8788,6200,3822,5642,9044,5642,8788,5376,25600,6912,4593,3494,4137,2583,2327,2844,2327,3914,2309,1582,1224,1505,25600,1254,1582,3658,25600,271,1024,886,1024,461,676,676,1024,392,56,46,41,33772,865,1807,392,356,256,392,210,33436,23,33,256,392,174,6912,2117,3200,13312,2327,2844,1989,12800,9044,10240,10240,755,6912,3658,2844,1828,6400,6200,4137,17065,2276,25600,4593,25600,12800,6400,1989,23,25600,2309,5688,1807,8532,4137,9044,2844,10240,3049,1989,12800,17577,25600,2309,5120,5642,13312,8532,5688,17065,4137],
 [25600,25600,25600,25600,25600,25600,25600,5120,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,12800,12800,8532,12800,6400,8532,8532,6400,5120,10240,8532,25600,8532,6400,6400,5120,5120,5120,5120,25600,5120,3658,3656,3187,3200,5120,3200,3200,2327,25600,4654,2778,2214,2778,2327,1705,1969,1828,1347,1587,1044,827,812,25600,812,1044,1505,25600,151,563,852,407,212,497,497,676,256,31,28,56,21140,292,1211,256,238,166,256,200,21140,13,28,138,307,115,4265,1211,3658,8532,1705,2844,1339,5120,5120,6400,6400,435,4654,1505,1162,1347,2560,3656,2778,12800,819,25600,2985,25600,5120,3656,1339,10,25600,1587,3656,1211,3658,2778,5120,1969,6400,1861,1613,5120,8532,25600,1587,4265,3200,10240,2844,3656,12800,2778],
 [25600,25600,25600,25600,25600,25600,25600,6152,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,17577,13312,8788,13312,8788,9044,9044,6912,5376,10752,9044,25600,9044,6912,6400,5120,6152,6200,6656,25600,5376,3456,3822,2386,3039,6152,3039,3100,2084,25600,4657,2547,2051,2319,3100,1505,1828,1505,1536,1272,855,786,886,25600,1085,855,1536,25600,284,640,1014,852,566,968,968,640,212,49,49,72,33772,366,1741,338,197,312,330,256,33772,36,36,172,330,97,4657,1244,4521,9044,1505,3914,1078,4521,6200,6400,6912,476,4657,1536,1280,1280,2327,3822,2176,13312,950,25600,2547,25600,4521,3791,1078,18,25600,1272,3315,996,3100,2176,6200,1828,6400,1820,1336,4521,10752,25600,1272,3456,3039,9044,3100,3382,13312,2319],
 [25600,25600,25600,25600,25600,25600,25600,3,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3,3,0,3,0,3,3,3,0,3,3,25600,3,3,3,0,3,3,0,25600,0,0,3,13,3,3,3,0,0,25600,3,3,3,3,0,0,0,0,0,3,3,5,3,25600,3,3,0,25600,1472,3,0,0,0,0,0,3,3,1283,1265,1316,256,0,3,3,3,0,3,0,256,1249,1272,0,3,3,3,3,0,3,0,0,3,0,3,3,3,5,3,0,0,0,0,3,3,3,0,25600,3,25600,0,3,3,3,25600,3,3,3,0,3,3,0,3,3,3,0,3,25600,3,38,3,33,0,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,26624,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,52224,52736,26368,52224,26112,52224,52224,26624,26368,52736,52736,25600,52736,27136,26624,26112,27136,27136,13568,25600,26112,13568,18601,14336,18089,27136,18089,13568,9300,25600,27136,18601,14336,18089,9300,9044,9044,9044,7168,10752,9044,7168,10068,25600,9044,9044,6912,25600,3279,7936,3612,0,0,3712,3712,7936,4541,563,379,1431,1160,3095,11264,417,4078,2762,4541,1792,133,256,663,0,4541,2179,27136,11776,13568,52736,8788,9300,11264,26112,27136,26624,27136,6218,27136,7168,5632,6912,13312,18601,18089,52224,5632,25600,18601,25600,26112,26112,11264,0,25600,10752,17577,10752,13312,18089,27136,9044,26624,14336,11264,26368,52736,25600,10752,13312,18089,52736,13312,17577,52224,18089],
 [25600,25600,25600,25600,25600,25600,25600,15360,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,53760,29184,14592,28160,14080,19625,19625,19625,14592,29184,20649,25600,20649,20649,14848,13824,16384,16384,10324,25600,14080,10324,12116,9272,10580,16384,10580,8192,6057,25600,13824,9984,9272,8448,4992,4224,5289,4224,4636,6356,5051,4444,6016,25600,4316,5051,4124,25600,620,4769,3072,3,0,2785,2785,4769,1994,161,154,553,474,2816,6502,0,1869,2048,2243,1861,0,97,256,0,2243,1147,13824,7424,6912,20649,3968,6057,6172,9812,16384,14848,20649,3955,13824,4636,3607,3868,6144,12116,8448,28160,3607,25600,9984,25600,9812,11776,6172,0,25600,6356,10068,5578,7680,8448,16384,5289,19113,9201,6643,10324,29184,25600,6356,9812,10580,20649,7680,10068,28160,8448],
 [25600,25600,25600,25600,25600,25600,25600,6912,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,26112,17577,25856,17577,25856,10752,10752,9044,13056,13312,10752,25600,10752,9044,7314,12800,6912,7826,4521,25600,6656,8788,5261,3100,4196,6912,4196,6656,4521,25600,6152,3464,3100,3039,2084,1828,2327,1828,3100,1999,1341,1185,1311,25600,1047,1341,3100,25600,9257,932,942,996,471,886,886,932,325,2140,1892,1884,33772,906,1907,325,307,256,468,381,33772,1695,1610,256,468,151,6152,1907,3100,10752,1828,2583,1654,8788,7826,7314,9044,704,6152,3100,2816,1505,5120,5261,3039,17577,2742,25600,3464,25600,8788,4964,1654,23,25600,1999,4285,1590,6656,3039,7826,2327,8532,2668,1984,13056,13312,25600,1999,4521,4196,10752,6656,4782,17577,3039],
 [25600,25600,25600,25600,25600,25600,25600,5120,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,12800,10240,8532,12800,8532,8532,8532,6400,5120,8532,10240,25600,8532,5688,7314,5120,4654,4654,5120,25600,5120,4265,3200,2442,3937,6400,3937,3200,2327,25600,4265,2276,1748,2778,2327,1705,1969,1828,1347,2230,1551,689,676,25600,812,1551,1505,25600,151,453,852,407,212,497,497,563,379,31,28,56,21140,292,1211,256,353,166,212,200,21140,13,28,138,256,172,3656,991,3658,7314,1705,2844,1958,5120,4654,7314,5688,361,4265,1505,1162,1347,2844,3200,3384,12800,819,25600,2778,25600,5120,4654,1958,10,25600,2230,4265,1815,3658,3384,4654,1969,6400,1498,1339,5120,8532,25600,2230,4265,3937,8532,2844,4265,10240,2778],
 [25600,25600,25600,25600,25600,25600,25600,8532,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,12800,12800,12800,12800,12800,12800,8532,8532,10240,12800,25600,10240,8532,8532,6400,8532,8532,8532,25600,6400,5120,5120,5120,5120,8532,5120,5120,3658,25600,5120,4265,3656,4265,3658,2560,3200,2844,1969,3200,2307,1580,1861,25600,1861,2307,2132,25600,289,1211,1505,1347,732,1083,1083,829,563,72,64,100,21140,660,2778,563,525,374,563,681,21140,31,56,433,379,256,6400,2778,5120,12800,2560,4265,2844,8532,8532,8532,8532,952,5120,2132,1828,1969,3658,5120,4265,12800,1505,25600,3384,25600,6400,6400,2844,20,25600,3200,5120,2778,5120,4265,8532,3200,8532,3200,1958,8532,12800,25600,3200,6400,5120,12800,4265,5120,12800,4265],
 [25600,25600,25600,25600,25600,25600,25600,369,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3200,1861,1705,1861,1505,812,812,563,548,1498,993,25600,1180,563,525,819,369,433,425,25600,819,300,202,200,177,369,177,212,261,25600,307,115,92,115,110,79,110,97,56,67,46,41,36,25600,36,46,92,25600,8,23,33,28,13,18,18,28,15,3,3,5,21140,13,54,15,15,10,15,13,21140,3,5,10,18,10,256,54,223,993,79,154,56,448,433,525,300,23,307,69,61,56,156,202,115,1861,31,25600,143,25600,732,238,56,3,25600,67,189,54,568,115,433,110,563,79,69,525,1211,25600,67,458,177,1226,174,202,2307,115],
 [25600,25600,25600,25600,25600,25600,25600,1861,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,8532,5120,3658,5120,3658,3200,3200,2778,1280,4654,3656,25600,3937,2778,2391,2327,1861,2214,1162,25600,2327,852,993,973,812,1861,812,673,1024,25600,1498,563,433,563,425,300,407,366,212,323,225,172,177,25600,177,225,433,25600,33,115,128,110,56,79,79,143,54,8,8,13,21140,51,256,54,49,31,54,51,21140,5,8,33,67,23,1211,256,788,3656,300,568,274,983,2214,2391,940,92,1498,261,292,212,548,993,563,5120,123,25600,676,25600,1969,1152,274,5,25600,323,899,256,1600,563,2214,407,2778,369,333,1162,4265,25600,323,1065,812,3937,630,993,5120,563],
 [25600,25600,25600,25600,25600,25600,25600,312,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3292,1674,1546,1431,1116,655,924,632,768,1198,945,25600,945,586,420,525,425,474,668,25600,1024,376,246,192,141,425,141,269,205,25600,292,154,125,131,151,115,169,138,74,54,41,72,72,25600,49,41,49,25600,18,56,49,36,26,36,36,56,18,8,8,10,33772,31,59,26,18,20,18,13,33436,5,10,20,18,13,292,82,256,945,90,146,46,323,474,420,294,51,292,41,33,64,108,246,92,1431,20,25600,154,25600,420,195,46,5,25600,54,146,41,292,92,474,125,632,115,46,371,1198,25600,54,425,141,986,133,164,1828,131],
 [25600,25600,25600,25600,25600,25600,25600,100,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1044,476,632,476,474,225,225,151,189,392,256,25600,307,151,138,215,100,115,138,25600,215,97,54,51,46,100,46,69,69,25600,82,28,23,28,33,23,33,31,18,20,18,15,15,25600,15,18,23,25600,5,13,10,10,8,8,8,13,8,3,3,3,21140,8,18,8,8,5,8,8,21140,0,3,5,8,5,67,18,69,256,23,49,18,156,115,138,102,10,82,20,18,18,49,54,28,476,10,25600,36,25600,195,61,18,3,25600,20,49,18,148,28,115,33,151,23,20,177,323,25600,20,179,46,328,54,54,589,28],
 [25600,25600,25600,25600,25600,25600,25600,924,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,6400,4657,5376,4196,5120,2017,2017,1413,3914,3397,2836,25600,2836,1695,1293,3658,1152,1331,1495,25600,1828,2742,666,586,435,1152,435,1779,1283,25600,822,417,346,289,369,256,384,312,420,166,115,169,161,25600,90,115,402,25600,28,118,128,79,44,51,51,118,38,13,13,18,33772,102,131,38,38,28,38,44,33436,8,15,36,38,26,822,218,732,2836,256,384,141,2844,1331,1293,1413,113,822,402,269,169,1129,666,289,4196,187,25600,417,25600,2844,594,141,8,25600,166,466,131,1969,289,1331,384,1413,307,141,3200,3397,25600,166,1280,435,2716,1303,497,4890,289],
 [25600,25600,25600,25600,25600,25600,25600,453,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,4887,2424,2327,2127,1725,998,1413,924,1075,1674,1349,25600,1349,819,612,753,586,668,911,25600,1464,525,343,269,202,586,202,376,284,25600,425,220,174,200,223,169,256,207,97,82,54,82,82,25600,59,54,74,25600,18,72,59,44,31,44,44,72,23,10,10,13,33772,36,90,33,23,23,23,15,33436,8,10,26,23,15,425,115,448,1349,169,256,69,458,668,612,399,61,425,61,49,90,156,343,141,2127,28,25600,220,25600,640,282,69,5,25600,82,220,64,425,141,668,177,924,154,69,509,1674,25600,82,512,202,1444,187,243,2785,200],
 [25600,25600,25600,25600,25600,25600,25600,1644,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,6400,5120,3658,5120,3200,3200,3200,2391,2327,2918,3656,25600,2619,2391,2307,2132,1644,1933,2132,25600,2132,1505,899,886,781,1644,781,1280,1024,25600,776,525,407,525,645,461,681,596,310,292,202,159,161,25600,161,202,402,25600,33,110,161,141,64,97,97,74,49,8,8,13,21140,56,238,49,46,33,49,59,21140,5,10,38,33,23,1152,238,1400,3656,461,940,256,1969,1933,2307,2391,84,776,402,276,310,993,899,525,5120,156,25600,353,25600,1969,1044,256,5,25600,292,812,238,1505,525,1933,681,2391,346,172,2327,3656,25600,292,1828,781,3937,1083,899,3628,525],
 [25600,25600,25600,25600,25600,25600,25600,110,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1172,717,937,535,604,246,169,118,476,509,422,25600,422,269,154,274,192,220,389,25600,143,243,123,143,56,192,56,179,154,25600,146,92,82,33,108,23,26,26,72,36,28,61,51,25600,18,28,44,25600,10,41,46,13,8,10,10,41,13,5,5,8,33772,31,23,10,13,5,13,13,33436,3,5,8,13,8,146,67,202,422,23,141,33,256,220,154,166,41,146,44,36,18,72,123,46,535,23,25600,92,25600,225,72,33,5,25600,36,59,33,151,46,220,26,118,77,33,300,509,25600,36,141,56,937,87,61,681,33],
 [25600,25600,25600,25600,25600,25600,25600,225,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,2307,1044,1280,1044,1047,476,476,323,364,863,563,25600,676,323,292,474,225,256,266,25600,474,189,115,118,100,225,100,138,148,25600,182,67,54,67,69,49,69,61,33,38,28,28,23,25600,23,28,54,25600,5,18,18,18,10,13,13,20,13,3,3,5,21140,10,28,13,13,8,13,10,21140,3,5,8,13,8,151,28,138,563,49,97,33,297,256,292,192,15,182,44,36,33,97,115,67,1044,18,25600,82,25600,422,138,33,3,25600,38,110,28,333,67,256,69,323,46,41,340,712,25600,38,328,100,707,110,115,1339,67],
 [25600,25600,25600,25600,25600,25600,25600,189,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1933,899,1162,899,886,407,407,274,527,402,476,25600,328,274,256,397,189,225,335,25600,397,241,100,100,82,189,82,164,128,25600,84,56,46,56,72,51,77,67,33,33,23,23,20,25600,20,23,44,25600,5,18,18,18,10,13,13,13,10,3,3,5,21140,10,28,10,10,5,10,10,21140,3,5,8,8,8,123,28,156,476,51,108,28,425,225,256,274,15,84,44,28,33,110,100,56,899,18,25600,38,25600,358,115,28,3,25600,33,92,28,279,56,225,77,274,38,23,497,589,25600,33,530,82,602,123,100,579,56],
 [25600,25600,25600,25600,25600,25600,25600,177,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1861,1088,1331,812,819,369,369,256,666,929,632,25600,753,410,238,374,305,340,435,25600,374,338,184,192,79,305,79,243,207,25600,259,125,102,54,115,46,72,61,77,28,23,64,61,25600,20,23,41,25600,5,46,44,13,10,10,10,54,10,3,3,5,21563,31,23,10,10,5,10,10,21140,3,3,8,10,8,218,69,220,632,46,164,28,392,340,238,256,46,259,33,28,28,79,184,54,812,13,25600,146,25600,328,110,28,3,25600,28,82,23,261,54,340,56,256,92,33,274,791,25600,28,276,79,778,90,92,1044,54],
 [25600,25600,25600,25600,25600,25600,25600,3656,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,10240,7314,6400,7314,5120,5120,5120,4265,1828,6400,6400,25600,6400,4265,4265,3200,3656,3937,2132,25600,3200,1280,2427,1792,2230,3656,2230,1065,1600,25600,3057,1551,1226,1551,852,581,712,609,492,886,602,486,479,25600,479,602,1024,25600,87,328,340,279,148,205,205,399,151,20,18,31,14093,128,707,151,138,87,151,138,14093,10,15,92,179,69,2875,707,1280,6400,581,1065,776,1600,3937,4265,1421,256,3057,512,852,492,852,2427,1551,7314,320,25600,1792,25600,2844,2811,776,10,25600,886,2276,707,2327,1551,3937,712,4265,1060,932,1828,6400,25600,886,1421,2230,5688,983,2427,10240,1551],
 [25600,25600,25600,25600,25600,25600,25600,369,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3200,1498,1705,2427,1828,812,812,563,548,1211,1482,25600,993,453,776,1162,307,356,425,25600,819,435,166,164,256,548,256,212,261,25600,256,97,74,115,110,79,110,97,56,100,69,38,28,25600,36,69,92,25600,8,20,33,28,13,18,18,23,18,3,3,5,21140,13,54,15,18,10,13,13,21140,3,5,10,15,13,212,44,223,799,79,154,84,448,356,776,251,20,256,69,61,56,230,166,172,1861,31,25600,115,25600,732,353,84,3,25600,100,276,77,568,172,356,110,563,67,56,525,991,25600,100,458,256,1024,174,297,1907,115],
 [25600,25600,25600,25600,25600,25600,25600,1047,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,6400,4657,3100,4196,2844,2278,1567,1088,2084,3464,3100,25600,3100,1907,1464,1828,1311,1510,2816,25600,1357,1536,755,686,489,1311,489,1244,942,25600,932,468,384,225,740,161,243,197,320,189,128,195,179,25600,67,128,256,25600,28,136,202,41,23,33,33,136,44,13,13,18,33772,102,105,31,44,18,44,41,33436,10,13,20,44,31,932,251,1569,3100,161,1060,161,1505,1510,1464,1907,128,932,256,169,87,379,755,325,4196,90,25600,468,25600,1505,668,161,8,25600,189,527,151,1024,325,1510,179,1088,343,161,852,3464,25600,189,640,489,2716,456,563,4890,225],
 [25600,25600,25600,25600,25600,25600,25600,1590,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,8532,5642,3200,5642,3200,3039,2327,1567,2327,4196,3382,25600,3382,2278,2189,2327,1590,1805,2844,25600,2097,1505,822,673,717,1590,717,1280,852,25600,1047,489,381,340,891,243,348,292,312,282,189,118,151,25600,105,189,384,25600,46,100,184,61,31,49,49,100,56,18,18,26,33436,64,151,38,51,23,56,51,33436,10,18,23,56,36,1047,223,1915,3382,243,1364,236,1828,1805,2189,2278,77,1047,384,256,161,996,822,489,5642,169,25600,489,25600,1828,965,236,8,25600,282,768,223,1280,489,1805,348,1567,325,236,1969,4196,25600,282,1505,717,3039,1244,822,6400,340],
 [25600,25600,25600,25600,25600,25600,25600,1413,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,8532,6152,6656,5642,6400,2980,2980,2017,4521,4657,3822,25600,3822,2360,1946,4265,1695,1907,1761,25600,2327,3100,937,819,632,1695,632,2742,1910,25600,1152,589,476,435,522,384,563,471,604,251,166,202,218,25600,131,166,602,25600,38,161,156,115,51,79,79,161,49,13,13,20,33772,136,200,49,46,36,49,51,33436,10,15,44,49,33,1152,307,1024,3822,384,732,210,3658,1907,1946,2360,133,1152,740,402,256,1574,937,435,5642,274,25600,589,25600,3658,855,210,8,25600,251,681,200,2560,435,1907,563,2017,417,210,3658,4657,25600,251,1505,632,3464,2048,732,6400,435],
 [25600,25600,25600,25600,25600,25600,25600,435,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,4196,2360,2084,2017,1828,924,655,453,1495,1068,1331,25600,858,822,594,1024,589,666,1298,25600,525,732,346,307,200,589,200,522,394,25600,284,218,179,92,302,59,90,74,143,74,56,113,97,25600,36,56,97,25600,18,77,92,23,15,18,18,67,26,8,8,13,33772,56,41,18,26,10,26,28,33436,5,10,13,23,18,417,118,604,1331,59,420,67,924,666,594,822,77,284,172,64,41,256,346,131,2017,44,25600,151,25600,819,271,67,5,25600,74,210,59,568,131,666,90,453,161,54,1083,1695,25600,74,522,200,1490,312,230,2583,92],
 [25600,25600,25600,25600,25600,25600,25600,476,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3656,2307,1828,2307,1705,1044,1044,712,640,1907,1211,25600,1498,712,648,1047,476,563,520,25600,1047,364,256,256,225,476,225,261,333,25600,392,151,115,151,138,97,138,120,69,82,56,49,46,25600,46,56,115,25600,10,28,38,33,18,23,23,36,18,5,5,5,21140,18,67,18,18,10,18,18,21140,3,5,13,20,13,323,67,266,1211,97,189,72,532,563,648,356,26,392,87,79,69,189,256,151,2307,38,25600,182,25600,924,292,72,3,25600,82,238,67,722,151,563,138,712,100,90,581,1587,25600,82,512,225,1551,212,256,2844,151],
 [25600,25600,25600,25600,25600,25600,25600,812,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,5120,3200,2560,3200,2327,1861,1861,1211,1705,1815,2214,25600,1482,1211,1152,1505,812,993,1556,25600,1505,1083,433,443,369,812,369,732,568,25600,379,256,202,256,323,225,328,292,151,151,100,79,79,25600,79,100,202,25600,18,54,82,72,33,46,46,36,23,5,5,10,21140,28,115,23,23,15,23,31,21140,3,8,20,18,15,563,115,704,2214,225,461,123,1421,993,1152,1211,41,379,202,133,151,497,433,256,3200,79,25600,172,25600,1347,525,123,5,25600,151,407,115,1024,256,993,328,1211,177,84,1600,2778,25600,151,1347,369,2427,545,433,2156,256],
 [25600,25600,25600,25600,25600,25600,25600,54,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,563,256,328,256,251,115,115,79,151,177,138,25600,138,79,72,115,54,61,100,25600,115,72,28,33,23,54,23,46,36,25600,36,20,18,20,18,15,20,20,10,15,13,10,10,25600,10,13,15,25600,3,8,8,8,5,5,5,8,5,0,0,3,21140,5,13,5,5,3,5,5,21140,0,3,3,5,5,36,13,46,138,15,31,13,123,61,72,79,8,36,15,10,10,33,28,20,256,8,25600,20,25600,102,33,13,3,25600,15,28,13,79,20,61,20,79,15,13,138,177,25600,15,151,23,256,36,28,323,20],
 [25600,25600,25600,25600,25600,25600,25600,2675,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,12800,9044,5376,8532,5120,5642,4493,3039,3456,6912,6200,25600,6200,4593,3640,3200,3049,3494,4521,25600,2885,2583,1702,1385,1254,3049,1254,2084,1536,25600,2117,1024,832,604,1472,348,525,420,599,497,335,320,376,25600,192,335,563,25600,69,269,361,92,44,72,72,269,79,18,18,26,33772,143,284,56,74,28,79,69,33436,10,18,23,79,44,2117,532,3018,6200,348,2253,417,2844,3494,3640,4593,205,2117,732,384,238,1464,1702,819,8532,256,25600,1024,25600,2844,1736,417,10,25600,497,1311,392,1828,819,3494,525,3039,732,417,2844,6912,25600,497,2327,1254,6152,1779,1431,8532,604],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,812,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,5120,2985,2560,3937,2844,1861,1861,1211,852,2778,2811,25600,2214,991,1664,1828,676,799,788,25600,1505,640,356,366,548,1226,548,407,568,25600,563,212,166,256,223,156,212,189,110,220,151,64,67,25600,79,151,202,25600,15,44,67,56,28,38,38,54,36,5,5,8,21140,23,115,23,33,13,20,26,21140,3,5,18,23,18,453,97,425,1748,156,300,184,712,799,1664,451,36,563,138,133,110,435,356,379,3200,64,25600,256,25600,1347,776,184,5,25600,220,602,172,1024,379,799,212,1211,143,123,801,2276,25600,220,673,548,1933,328,655,3412,256],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,131,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1413,632,819,632,676,289,202,141,384,435,338,25600,338,200,182,312,131,156,330,25600,164,169,72,74,59,131,59,115,77,25600,90,49,44,36,72,23,26,26,36,38,31,31,26,25600,18,31,44,25600,10,20,23,13,8,10,10,20,13,5,5,8,33436,15,23,10,13,5,13,13,33436,3,5,8,13,10,90,33,156,338,23,102,33,289,156,182,200,23,90,44,36,18,79,72,49,632,23,25600,49,25600,256,82,33,5,25600,38,67,33,169,49,156,26,141,38,33,338,435,25600,38,161,59,632,97,72,799,36],
 [25600,25600,25600,25600,25600,25600,25600,407,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3656,1933,1705,1933,1600,899,899,589,1162,886,1044,25600,707,589,563,886,407,476,758,25600,886,527,225,220,189,407,189,358,279,25600,184,123,100,123,156,110,164,146,77,72,49,41,38,25600,38,49,97,25600,10,28,38,33,18,23,23,23,18,5,5,8,21140,18,56,18,15,10,18,18,21140,3,5,13,13,10,274,56,335,1044,110,230,61,916,476,563,589,23,184,97,67,77,241,225,123,1933,36,25600,84,25600,786,256,61,3,25600,72,202,56,607,123,476,164,589,82,41,1065,1339,25600,72,947,189,1318,266,225,1247,123],
 [25600,25600,25600,25600,25600,25600,25600,1644,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,6400,5120,3658,5120,3200,3200,3200,2391,2327,2918,3656,25600,2619,2391,2307,2132,1644,1933,2132,25600,2132,1505,899,886,781,1644,781,1280,1024,25600,776,525,407,525,645,461,681,596,310,292,202,159,161,25600,161,202,402,25600,33,110,161,141,64,97,97,74,49,8,8,13,21140,56,238,49,46,33,49,59,21140,5,10,38,33,23,1152,238,1400,3656,461,940,256,1969,1933,2307,2391,84,776,402,276,310,993,899,525,5120,156,25600,353,25600,1969,1044,256,5,25600,292,812,238,1505,525,1933,681,2391,346,172,2327,3656,25600,292,1828,781,3937,1083,899,3628,525],
 [25600,25600,25600,25600,25600,25600,25600,26112,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,26112,26112,13056,26112,13056,26112,26112,26112,13056,26112,26112,25600,26112,26112,25600,12800,26112,26112,13056,25600,13056,13056,26112,17577,25600,26112,25600,13056,13056,25600,26112,13312,13312,12800,13056,8532,12800,8532,8788,12800,8532,9044,9044,25600,8532,8532,8788,25600,3758,9044,6656,5120,3658,5376,5376,9044,5120,1646,1544,1915,21563,3456,13312,5120,5120,2844,5632,3456,21563,1336,1620,2844,5632,3200,26112,13312,13056,26112,8532,13056,12800,13056,26112,25600,26112,6912,26112,8788,8788,8532,12800,26112,12800,26112,6656,25600,13312,25600,13056,25600,12800,256,25600,12800,25600,12800,13056,12800,26112,12800,25600,13312,13312,13056,26112,25600,12800,13056,25600,26112,13056,25600,26112,12800],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3,3,3,3,3,256,3,3,3,3,3,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,1398,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,6400,4265,3200,4265,2844,2844,2844,2214,2132,2811,3200,25600,2276,2214,1933,1969,1398,1644,2132,25600,1969,1505,781,755,648,1398,648,1162,914,25600,655,433,346,433,550,389,568,504,261,256,177,136,138,25600,138,177,346,25600,33,92,138,118,54,82,82,61,41,8,8,13,21140,49,202,41,38,28,41,51,21140,5,10,33,28,20,993,202,1226,3200,389,791,225,1828,1644,1933,2214,74,655,346,230,261,883,781,433,4265,131,25600,297,25600,1705,899,225,5,25600,256,712,202,1347,433,1644,568,2214,292,151,1969,3656,25600,256,1828,648,3412,960,781,3259,433],
 [25600,25600,25600,25600,25600,25600,25600,525,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3656,2391,1969,2391,1705,1152,1152,781,1280,1139,1339,25600,886,781,712,1083,525,589,940,25600,1083,681,274,271,238,525,238,461,358,25600,236,161,123,161,195,141,210,187,97,92,61,51,49,25600,49,61,123,25600,13,33,51,44,18,28,28,26,18,5,5,8,21140,18,72,18,18,10,18,18,21140,3,5,15,15,13,346,72,443,1339,141,297,79,1114,589,712,781,28,236,123,84,97,310,274,161,2391,51,25600,108,25600,993,323,79,3,25600,92,256,72,768,161,589,210,781,110,54,1219,1644,25600,92,1065,238,1664,351,274,1518,161],
 [25600,25600,25600,25600,25600,25600,25600,1861,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,8532,5120,3658,5120,3658,3200,3200,2778,2560,3384,3656,25600,2811,2778,2391,2327,1861,2214,2327,25600,2327,1705,993,973,812,1861,812,1347,1024,25600,829,563,433,563,704,497,732,660,328,323,225,172,177,25600,177,225,433,25600,44,115,174,151,72,102,102,77,54,10,10,18,21140,61,256,54,49,36,54,64,21140,5,10,41,36,23,1211,256,1556,3656,497,1024,274,1969,2214,2391,2778,92,829,433,292,328,1083,993,563,5120,166,25600,379,25600,1969,1152,274,5,25600,323,899,256,1600,563,2214,732,2778,369,184,2327,4265,25600,323,2132,812,3937,1244,993,3656,563],
 [25600,25600,25600,25600,25600,25600,25600,169,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1810,819,1024,819,996,371,248,169,568,561,438,25600,438,251,233,471,169,197,494,25600,243,256,90,100,77,169,77,169,115,25600,115,64,56,44,105,33,38,38,51,49,38,44,33,25600,23,38,64,25600,13,28,36,15,13,15,15,28,18,8,8,10,33436,23,28,13,18,8,18,20,33436,5,8,10,18,13,115,41,225,438,33,154,44,430,197,233,251,28,115,64,51,26,115,90,64,819,36,25600,64,25600,384,108,44,5,25600,49,84,41,256,64,197,38,169,51,44,499,561,25600,49,238,77,819,138,90,1024,44],
 [25600,25600,25600,25600,25600,25600,25600,812,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,5120,3200,2560,3200,2327,1861,1861,1211,1705,1815,2214,25600,1482,1211,1152,1505,812,993,1556,25600,1505,1083,433,443,369,812,369,732,568,25600,379,256,202,256,323,225,328,292,151,151,100,79,79,25600,79,100,202,25600,18,54,82,72,33,46,46,36,23,5,5,10,21140,28,115,23,23,15,23,31,21140,3,8,20,18,15,563,115,704,2214,225,461,123,1421,993,1152,1211,41,379,202,133,151,497,433,256,3200,79,25600,172,25600,1347,525,123,5,25600,151,407,115,1024,256,993,328,1211,177,84,1600,2778,25600,151,1347,369,2427,545,433,2156,256],
 [25600,25600,25600,25600,25600,25600,25600,225,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,2307,1044,1280,1044,1047,476,476,323,364,863,563,25600,676,323,292,474,225,256,266,25600,474,189,115,118,100,225,100,138,148,25600,182,67,54,67,69,49,69,61,33,38,28,28,23,25600,23,28,54,25600,5,18,18,18,10,13,13,20,13,3,3,5,21140,10,28,13,13,8,13,10,21140,3,5,8,13,8,151,28,138,563,49,97,33,297,256,292,192,15,182,44,36,33,97,115,67,1044,18,25600,82,25600,422,138,33,3,25600,38,110,28,333,67,256,69,323,46,41,340,712,25600,38,328,100,707,110,115,1339,67],
 [25600,25600,25600,25600,25600,25600,25600,632,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,5642,3397,4521,2980,4265,1413,1413,924,3100,2360,1907,25600,1907,1152,855,2767,822,937,1024,25600,1464,1779,476,425,289,822,289,1298,906,25600,589,307,251,200,261,169,256,207,302,115,74,133,118,25600,59,74,269,25600,20,97,102,51,36,44,44,97,33,10,10,15,33772,74,90,33,31,23,33,36,33436,8,13,28,33,20,589,161,522,1907,169,369,97,2560,937,855,1152,92,589,361,187,115,727,476,200,2980,123,25600,307,25600,2491,397,97,5,25600,115,310,90,1659,200,937,256,924,218,97,2560,2360,25600,115,1024,289,2171,922,338,3715,200],
 [25600,25600,25600,25600,25600,25600,25600,177,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,1861,812,1556,812,1137,369,369,256,704,563,433,25600,433,256,238,512,177,202,225,25600,374,323,92,92,79,177,79,210,174,25600,115,54,41,54,46,46,72,61,46,28,23,23,20,25600,20,23,59,25600,5,15,15,15,10,10,10,15,10,3,3,5,21140,10,23,10,10,5,10,10,21140,3,3,8,10,8,115,23,102,433,46,72,28,558,202,238,256,15,115,59,41,33,143,92,54,812,20,25600,54,25600,461,110,28,3,25600,28,82,23,384,54,202,72,256,36,28,650,563,25600,28,499,79,548,156,92,1044,54],
 [25600,25600,25600,25600,25600,25600,25600,1211,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,6400,4265,3200,4265,2844,2778,2778,1861,983,3656,2844,25600,3200,1861,1644,1828,1211,1398,914,25600,1828,673,648,645,563,1211,563,548,858,25600,991,369,292,369,300,212,300,261,156,225,151,118,115,25600,115,151,292,25600,23,79,92,79,38,56,56,97,36,5,5,10,21140,33,177,36,33,20,36,36,21140,5,8,23,44,20,812,177,568,2844,212,425,189,852,1398,1644,714,61,991,189,202,156,407,648,369,4265,90,25600,453,25600,1705,781,189,5,25600,225,589,177,1280,369,1398,300,1861,256,228,914,3200,25600,225,852,563,3384,456,648,4265,369],
 [25600,25600,25600,25600,25600,25600,25600,1644,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,6400,4265,3658,5688,4265,3200,3200,2391,2327,3656,4265,25600,3656,1984,2875,2327,1385,1613,2132,25600,2132,1828,727,732,1139,2276,1139,1280,1024,25600,1152,425,333,525,645,461,681,596,310,435,297,131,133,25600,161,297,402,25600,33,90,161,102,51,97,97,110,74,8,8,13,21140,56,238,49,69,33,41,49,21140,5,10,33,49,33,950,197,1400,3200,461,940,379,1969,1613,2875,1984,69,1152,402,276,310,1219,727,776,5120,156,25600,525,25600,1969,1551,379,5,25600,435,1226,353,1505,776,1613,681,2391,287,256,2327,3412,25600,435,1828,1139,3308,1083,1318,4654,525],
 [25600,25600,25600,25600,25600,25600,25600,97,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,996,640,822,471,522,212,146,100,417,453,369,25600,369,238,131,238,172,192,343,25600,123,218,113,133,54,172,54,161,143,25600,123,82,77,28,90,20,26,26,67,33,28,56,46,25600,15,28,38,25600,10,41,46,10,8,10,10,41,13,5,5,5,33772,31,20,10,13,5,13,13,33436,3,5,5,13,8,123,56,177,369,20,128,28,218,192,131,238,36,123,77,33,18,59,113,41,471,23,25600,82,25600,195,61,28,5,25600,33,54,28,131,41,192,26,100,72,28,256,453,25600,33,92,54,832,59,56,594,28],
 [25600,25600,25600,25600,25600,25600,25600,79,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,812,369,497,369,374,177,177,115,156,307,202,25600,243,115,110,166,79,92,110,25600,166,79,41,44,36,79,36,56,54,25600,67,23,20,23,28,18,28,23,13,18,15,13,13,25600,13,15,20,25600,3,10,10,10,5,8,8,10,8,3,3,3,21140,5,15,8,8,3,8,5,21140,0,3,5,8,5,54,15,54,202,18,38,18,128,92,110,82,10,67,18,15,13,38,41,23,369,10,25600,28,25600,151,49,18,3,25600,18,38,15,115,23,92,28,115,20,18,143,256,25600,18,146,36,256,44,41,476,23],
 [256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,256,3,3,3,3,3,3,3,3],
 [25600,25600,25600,25600,25600,25600,25600,1398,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,6400,4265,3200,4265,2844,2844,2844,2214,2132,2811,3200,25600,2276,2214,1933,1969,1398,1644,2132,25600,1969,1505,781,755,648,1398,648,1162,914,25600,655,433,346,433,550,389,568,504,261,256,177,136,138,25600,138,177,346,25600,33,92,138,118,54,82,82,61,41,8,8,13,21140,49,202,41,38,28,41,51,21140,5,10,33,28,20,993,202,1226,3200,389,791,225,1828,1644,1933,2214,74,655,346,230,261,883,781,433,4265,131,25600,297,25600,1705,899,225,5,25600,256,712,202,1347,433,1644,568,2214,292,151,1969,3656,25600,256,1828,648,3412,960,781,3259,433],
 [25600,25600,25600,25600,25600,25600,25600,90,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,942,622,1559,430,1078,192,192,131,773,445,364,25600,364,236,123,494,177,200,253,25600,256,387,128,164,59,177,59,276,215,25600,143,97,87,49,102,51,64,64,87,36,31,67,56,25600,28,31,51,25600,13,41,56,26,18,23,23,41,15,5,5,10,2007,41,31,15,15,13,15,18,1672,5,5,13,15,10,143,61,154,364,51,128,36,458,200,123,236,46,143,102,44,44,125,128,49,430,28,25600,97,25600,407,69,36,5,25600,36,61,31,276,49,200,64,131,77,36,714,445,25600,36,256,59,622,154,64,553,49],
 [25600,25600,25600,25600,25600,25600,25600,563,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,4265,2778,1969,2778,1828,1211,1211,812,1347,1226,1398,25600,952,812,781,1244,563,648,1024,25600,1244,732,292,297,256,563,256,497,384,25600,256,177,138,177,210,151,225,202,102,100,67,51,54,25600,54,67,133,25600,10,36,54,46,20,33,33,26,20,5,5,8,21140,20,79,20,18,10,20,20,21140,3,5,15,15,13,369,79,461,1398,151,323,82,1162,648,781,812,28,256,133,92,102,328,292,177,2778,51,25600,118,25600,1083,346,82,3,25600,100,274,79,858,177,648,225,812,115,56,1219,1861,25600,100,1114,256,1815,374,292,1664,177],
 [25600,25600,25600,25600,25600,25600,25600,77,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,379,256,261,256,202,172,172,118,84,315,200,25600,243,118,108,115,77,92,128,25600,115,84,41,51,36,77,36,61,59,25600,64,26,23,26,33,23,31,28,18,18,15,15,13,25600,13,15,28,25600,5,10,10,10,8,10,10,10,5,3,3,3,2012,8,15,5,5,5,5,8,2012,0,3,5,8,5,54,15,67,200,23,46,15,69,92,108,84,10,64,23,20,18,44,41,26,256,10,25600,33,25600,102,49,15,3,25600,18,38,15,79,26,92,31,118,18,18,77,256,25600,18,105,36,256,51,41,220,26],
 [25600,25600,25600,25600,25600,25600,25600,392,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,4137,2117,2084,1807,1779,819,604,417,1229,1505,1193,25600,1193,732,527,845,532,594,1060,25600,435,599,307,264,174,532,174,425,320,25600,376,200,161,90,251,51,72,59,115,69,49,97,87,25600,33,49,79,25600,13,72,74,15,13,15,15,72,23,8,8,10,33772,46,38,18,23,8,23,20,33436,5,8,10,23,15,376,102,492,1193,51,351,59,758,594,527,732,67,376,143,51,33,210,307,120,1807,36,25600,200,25600,676,243,59,5,25600,69,187,51,471,120,594,72,417,143,59,1096,1505,25600,69,425,174,1311,256,205,2309,90],
 [25600,25600,25600,25600,25600,25600,25600,476,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,3656,2307,1828,2307,1705,1044,1044,712,1280,1060,1211,25600,829,712,648,1047,476,563,904,25600,1047,632,256,256,225,476,225,422,333,25600,220,151,115,151,184,131,195,172,90,82,56,49,46,25600,46,56,115,25600,13,28,46,41,18,26,26,23,18,5,5,8,21140,18,67,18,18,10,18,18,21140,3,5,13,15,13,323,67,399,1211,131,269,72,1065,563,648,712,26,220,115,79,90,284,256,151,2307,46,25600,100,25600,924,292,72,3,25600,82,238,67,722,151,563,195,712,100,49,1162,1587,25600,82,1024,225,1551,320,256,1500,151],
 [25600,25600,25600,25600,25600,25600,25600,41,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,433,202,261,394,195,179,92,61,118,166,210,25600,133,61,113,92,41,49,77,25600,92,54,23,28,38,82,38,36,31,25600,33,18,15,18,15,13,18,18,10,20,15,10,10,25600,10,15,13,25600,3,8,8,8,5,5,5,8,8,0,0,3,21140,5,13,5,8,3,5,5,21140,0,3,3,5,5,28,13,36,110,13,23,18,97,49,113,61,5,33,13,10,10,26,23,31,202,8,25600,18,25600,82,51,18,3,25600,20,44,18,64,31,49,18,61,15,13,110,138,25600,20,118,38,297,28,44,256,18],
 [25600,25600,25600,25600,25600,25600,25600,812,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,25600,5120,3200,3658,3200,3200,1861,1861,1211,2327,2778,2214,25600,2214,1211,1152,1969,812,993,1083,25600,1505,1556,433,443,369,812,369,1024,852,25600,563,256,202,256,225,225,328,292,210,151,100,79,79,25600,79,100,289,25600,18,54,54,72,33,46,46,54,23,5,5,10,21140,41,115,23,23,15,23,28,21140,3,8,20,23,15,563,115,497,2214,225,328,123,1969,993,1152,1211,41,563,289,192,151,704,433,256,3200,108,25600,256,25600,1828,525,123,5,25600,151,407,115,1505,256,993,328,1211,177,123,2327,2778,25600,151,1347,369,2427,737,433,3656,256]
];
