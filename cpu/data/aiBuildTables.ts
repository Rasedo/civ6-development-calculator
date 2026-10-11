/**
 * THE CITY BUILD AI'S TABLES (cpu/core/aiCityBuild.ts), written by
 * tools/install/ai_tables.py from the layered install (`--check` reports a
 * stale file): the Buildings, Units and Projects in DATABASE ORDER — the
 * index the AI's value tables run in — with the columns and child rows
 * the values and the Default Specialization pick read.
 */
import type { AiBuildingRow, AiUnitRow } from '../core/aiCityBuild';

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
    }
   },
   {
    "id": "BUILDING_GOV_CITYSTATES_LEVERAGED_UNIT_STRENGTH",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GOV_CITYSTATES_COMBAT_MODIFIER"
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
  "recon": false
 },
 {
  "type": "UNIT_BUILDER",
  "foundCity": false,
  "buildCharges": 3,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_TRADER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_MISSIONARY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_APOSTLE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_INQUISITOR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_GURU",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_WARRIOR_MONK",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 40,
  "recon": false
 },
 {
  "type": "UNIT_ARCHAEOLOGIST",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_GREAT_GENERAL",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_GREAT_ADMIRAL",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_GREAT_ENGINEER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_GREAT_MERCHANT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_GREAT_PROPHET",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_GREAT_SCIENTIST",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_GREAT_WRITER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_GREAT_ARTIST",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_GREAT_MUSICIAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_SPY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_NATURALIST",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_SCOUT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 10,
  "recon": true
 },
 {
  "type": "UNIT_WARRIOR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 20,
  "recon": false
 },
 {
  "type": "UNIT_SLINGER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 5,
  "recon": false
 },
 {
  "type": "UNIT_BARBARIAN_HORSEMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 20,
  "recon": false
 },
 {
  "type": "UNIT_BARBARIAN_HORSE_ARCHER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 10,
  "recon": false
 },
 {
  "type": "UNIT_SUMERIAN_WAR_CART",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 30,
  "recon": false
 },
 {
  "type": "UNIT_GALLEY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 30,
  "recon": false
 },
 {
  "type": "UNIT_NORWEGIAN_LONGSHIP",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 35,
  "recon": false
 },
 {
  "type": "UNIT_ARCHER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 15,
  "recon": false
 },
 {
  "type": "UNIT_SPEARMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 25,
  "recon": false
 },
 {
  "type": "UNIT_HEAVY_CHARIOT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 28,
  "recon": false
 },
 {
  "type": "UNIT_BATTERING_RAM",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_GREEK_HOPLITE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 28,
  "recon": false
 },
 {
  "type": "UNIT_SWORDSMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 35,
  "recon": false
 },
 {
  "type": "UNIT_HORSEMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 36,
  "recon": false
 },
 {
  "type": "UNIT_SCYTHIAN_HORSE_ARCHER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 20,
  "recon": false
 },
 {
  "type": "UNIT_ROMAN_LEGION",
  "foundCity": false,
  "buildCharges": 1,
  "mustPurchase": false,
  "combat": 40,
  "recon": false
 },
 {
  "type": "UNIT_KONGO_SHIELD_BEARER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 38,
  "recon": false
 },
 {
  "type": "UNIT_CATAPULT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 25,
  "recon": false
 },
 {
  "type": "UNIT_SIEGE_TOWER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_QUADRIREME",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 20,
  "recon": false
 },
 {
  "type": "UNIT_EGYPTIAN_CHARIOT_ARCHER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 25,
  "recon": false
 },
 {
  "type": "UNIT_JAPANESE_SAMURAI",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 48,
  "recon": false
 },
 {
  "type": "UNIT_NORWEGIAN_BERSERKER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 48,
  "recon": false
 },
 {
  "type": "UNIT_KNIGHT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 50,
  "recon": false
 },
 {
  "type": "UNIT_INDIAN_VARU",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 40,
  "recon": false
 },
 {
  "type": "UNIT_ARABIAN_MAMLUK",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 50,
  "recon": false
 },
 {
  "type": "UNIT_CROSSBOWMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 30,
  "recon": false
 },
 {
  "type": "UNIT_CHINESE_CROUCHING_TIGER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 30,
  "recon": false
 },
 {
  "type": "UNIT_MILITARY_ENGINEER",
  "foundCity": false,
  "buildCharges": 2,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_PIKEMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 45,
  "recon": false
 },
 {
  "type": "UNIT_MUSKETMAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 55,
  "recon": false
 },
 {
  "type": "UNIT_SPANISH_CONQUISTADOR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 58,
  "recon": false
 },
 {
  "type": "UNIT_CARAVEL",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 55,
  "recon": false
 },
 {
  "type": "UNIT_BOMBARD",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 45,
  "recon": false
 },
 {
  "type": "UNIT_FRIGATE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 45,
  "recon": false
 },
 {
  "type": "UNIT_PRIVATEER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 40,
  "recon": false
 },
 {
  "type": "UNIT_ENGLISH_SEADOG",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 40,
  "recon": false
 },
 {
  "type": "UNIT_FIELD_CANNON",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 50,
  "recon": false
 },
 {
  "type": "UNIT_CAVALRY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 62,
  "recon": false
 },
 {
  "type": "UNIT_RUSSIAN_COSSACK",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 67,
  "recon": false
 },
 {
  "type": "UNIT_ENGLISH_REDCOAT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 70,
  "recon": false
 },
 {
  "type": "UNIT_FRENCH_GARDE_IMPERIALE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 70,
  "recon": false
 },
 {
  "type": "UNIT_MEDIC",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_IRONCLAD",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 70,
  "recon": false
 },
 {
  "type": "UNIT_AMERICAN_ROUGH_RIDER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 67,
  "recon": false
 },
 {
  "type": "UNIT_RANGER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 45,
  "recon": true
 },
 {
  "type": "UNIT_OBSERVATION_BALLOON",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_BIPLANE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 80,
  "recon": false
 },
 {
  "type": "UNIT_INFANTRY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 75,
  "recon": false
 },
 {
  "type": "UNIT_ARTILLERY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 60,
  "recon": false
 },
 {
  "type": "UNIT_BATTLESHIP",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 60,
  "recon": false
 },
 {
  "type": "UNIT_BRAZILIAN_MINAS_GERAES",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 70,
  "recon": false
 },
 {
  "type": "UNIT_SUBMARINE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 65,
  "recon": false
 },
 {
  "type": "UNIT_GERMAN_UBOAT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 65,
  "recon": false
 },
 {
  "type": "UNIT_AT_CREW",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 75,
  "recon": false
 },
 {
  "type": "UNIT_TANK",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 85,
  "recon": false
 },
 {
  "type": "UNIT_FIGHTER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 100,
  "recon": false
 },
 {
  "type": "UNIT_AMERICAN_P51",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 105,
  "recon": false
 },
 {
  "type": "UNIT_BOMBER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 85,
  "recon": false
 },
 {
  "type": "UNIT_ANTIAIR_GUN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_MACHINE_GUN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 70,
  "recon": false
 },
 {
  "type": "UNIT_AIRCRAFT_CARRIER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 65,
  "recon": false
 },
 {
  "type": "UNIT_DESTROYER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 85,
  "recon": false
 },
 {
  "type": "UNIT_HELICOPTER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 86,
  "recon": false
 },
 {
  "type": "UNIT_NUCLEAR_SUBMARINE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 80,
  "recon": false
 },
 {
  "type": "UNIT_MECHANIZED_INFANTRY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 85,
  "recon": false
 },
 {
  "type": "UNIT_ROCKET_ARTILLERY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 70,
  "recon": false
 },
 {
  "type": "UNIT_MOBILE_SAM",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_JET_FIGHTER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 110,
  "recon": false
 },
 {
  "type": "UNIT_JET_BOMBER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 90,
  "recon": false
 },
 {
  "type": "UNIT_MISSILE_CRUISER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 75,
  "recon": false
 },
 {
  "type": "UNIT_MODERN_AT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 85,
  "recon": false
 },
 {
  "type": "UNIT_MODERN_ARMOR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 95,
  "recon": false
 },
 {
  "type": "UNIT_MAN_AT_ARMS",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 45,
  "recon": false
 },
 {
  "type": "UNIT_LINE_INFANTRY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 65,
  "recon": false
 },
 {
  "type": "UNIT_TREBUCHET",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 35,
  "recon": false
 },
 {
  "type": "UNIT_AZTEC_EAGLE_WARRIOR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 28,
  "recon": false
 },
 {
  "type": "UNIT_INDONESIAN_JONG",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 45,
  "recon": false
 },
 {
  "type": "UNIT_KHMER_DOMREY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 40,
  "recon": false
 },
 {
  "type": "UNIT_POLISH_HUSSAR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 64,
  "recon": false
 },
 {
  "type": "UNIT_NUBIAN_PITATI",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 17,
  "recon": false
 },
 {
  "type": "UNIT_MACEDONIAN_HYPASPIST",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 38,
  "recon": false
 },
 {
  "type": "UNIT_MACEDONIAN_HETAIROI",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 36,
  "recon": false
 },
 {
  "type": "UNIT_PERSIAN_IMMORTAL",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 35,
  "recon": false
 },
 {
  "type": "UNIT_DIGGER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 78,
  "recon": false
 },
 {
  "type": "UNIT_ZULU_IMPI",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 45,
  "recon": false
 },
 {
  "type": "UNIT_KOREAN_HWACHA",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 45,
  "recon": false
 },
 {
  "type": "UNIT_SCOTTISH_HIGHLANDER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 50,
  "recon": true
 },
 {
  "type": "UNIT_DE_ZEVEN_PROVINCIEN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 50,
  "recon": false
 },
 {
  "type": "UNIT_MONGOLIAN_KESHIG",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 35,
  "recon": false
 },
 {
  "type": "UNIT_GEORGIAN_KHEVSURETI",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 48,
  "recon": false
 },
 {
  "type": "UNIT_MAPUCHE_MALON_RAIDER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 55,
  "recon": false
 },
 {
  "type": "UNIT_CREE_OKIHTCITAW",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 20,
  "recon": true
 },
 {
  "type": "UNIT_SPEC_OPS",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 60,
  "recon": true
 },
 {
  "type": "UNIT_DRONE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_PIKE_AND_SHOT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 55,
  "recon": false
 },
 {
  "type": "UNIT_SUPPLY_CONVOY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_SKIRMISHER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 20,
  "recon": true
 },
 {
  "type": "UNIT_COURSER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 46,
  "recon": false
 },
 {
  "type": "UNIT_CUIRASSIER",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 64,
  "recon": false
 },
 {
  "type": "UNIT_GIANT_DEATH_ROBOT",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 130,
  "recon": false
 },
 {
  "type": "UNIT_ROCK_BAND",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_CANADA_MOUNTIE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 62,
  "recon": false
 },
 {
  "type": "UNIT_HUNGARY_BLACK_ARMY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 49,
  "recon": false
 },
 {
  "type": "UNIT_HUNGARY_HUSZAR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 65,
  "recon": false
 },
 {
  "type": "UNIT_INCA_WARAKAQ",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 20,
  "recon": true
 },
 {
  "type": "UNIT_MALI_MANDEKALU_CAVALRY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 55,
  "recon": false
 },
 {
  "type": "UNIT_MAORI_TOA",
  "foundCity": false,
  "buildCharges": 1,
  "mustPurchase": false,
  "combat": 38,
  "recon": false
 },
 {
  "type": "UNIT_OTTOMAN_BARBARY_CORSAIR",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 40,
  "recon": false
 },
 {
  "type": "UNIT_PHOENICIA_BIREME",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 35,
  "recon": false
 },
 {
  "type": "UNIT_SULEIMAN_JANISSARY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 60,
  "recon": false
 },
 {
  "type": "UNIT_SWEDEN_CAROLEAN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 55,
  "recon": false
 },
 {
  "type": "UNIT_MAYAN_HULCHE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 15,
  "recon": false
 },
 {
  "type": "UNIT_LAHORE_NIHANG",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": true,
  "combat": 25,
  "recon": false
 },
 {
  "type": "UNIT_COMANDANTE_GENERAL",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 0,
  "recon": false
 },
 {
  "type": "UNIT_COLOMBIAN_LLANERO",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 62,
  "recon": false
 },
 {
  "type": "UNIT_BYZANTINE_DROMON",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 20,
  "recon": false
 },
 {
  "type": "UNIT_BYZANTINE_TAGMA",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 50,
  "recon": false
 },
 {
  "type": "UNIT_GAUL_GAESATAE",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 20,
  "recon": false
 },
 {
  "type": "UNIT_VIETNAMESE_VOI_CHIEN",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 35,
  "recon": false
 },
 {
  "type": "UNIT_ETHIOPIAN_OROMO_CAVALRY",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 48,
  "recon": false
 },
 {
  "type": "UNIT_BABYLONIAN_SABUM_KIBITTUM",
  "foundCity": false,
  "buildCharges": 0,
  "mustPurchase": false,
  "combat": 17,
  "recon": false
 },
 {
  "type": "UNIT_PORTUGUESE_NAU",
  "foundCity": false,
  "buildCharges": 2,
  "mustPurchase": false,
  "combat": 55,
  "recon": false
 }
];

export const AI_PROJECTS: readonly string[] = [
 "PROJECT_REPAIR_OUTER_DEFENSES",
 "PROJECT_LAUNCH_EARTH_SATELLITE",
 "PROJECT_LAUNCH_MOON_LANDING",
 "PROJECT_MANHATTAN_PROJECT",
 "PROJECT_OPERATION_IVY",
 "PROJECT_BUILD_NUCLEAR_DEVICE",
 "PROJECT_BUILD_THERMONUCLEAR_DEVICE",
 "PROJECT_CARNIVAL",
 "PROJECT_ENHANCE_DISTRICT_ENCAMPMENT",
 "PROJECT_ENHANCE_DISTRICT_HARBOR",
 "PROJECT_ENHANCE_DISTRICT_INDUSTRIAL_ZONE",
 "PROJECT_ENHANCE_DISTRICT_COMMERCIAL_HUB",
 "PROJECT_ENHANCE_DISTRICT_HOLY_SITE",
 "PROJECT_ENHANCE_DISTRICT_CAMPUS",
 "PROJECT_ENHANCE_DISTRICT_THEATER",
 "PROJECT_WATER_CARNIVAL",
 "PROJECT_BREAD_AND_CIRCUSES",
 "PROJECT_WATER_BREAD_AND_CIRCUSES",
 "PROJECT_COTHON_CAPITAL_MOVE",
 "PROJECT_CARBON_RECAPTURE",
 "PROJECT_CONVERT_REACTOR_TO_COAL",
 "PROJECT_CONVERT_REACTOR_TO_OIL",
 "PROJECT_CONVERT_REACTOR_TO_URANIUM",
 "PROJECT_LAUNCH_MARS_BASE",
 "PROJECT_LAUNCH_EXOPLANET_EXPEDITION",
 "PROJECT_ORBITAL_LASER",
 "PROJECT_TERRESTRIAL_LASER",
 "PROJECT_SEND_AID",
 "PROJECT_TRAIN_ATHLETES",
 "PROJECT_TRAIN_ASTRONAUTS",
 "PROJECT_RECOMMISSION_REACTOR",
 "PROJECT_DECOMMISSION_COAL_POWER_PLANT",
 "PROJECT_DECOMMISSION_OIL_POWER_PLANT",
 "PROJECT_DECOMMISSION_NUCLEAR_POWER_PLANT",
 "PROJECT_LIJIA_FAITH",
 "PROJECT_LIJIA_FOOD",
 "PROJECT_LIJIA_GOLD"
];
